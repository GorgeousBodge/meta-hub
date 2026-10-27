/* ==========================================================================
   Home Deck — Home Assistant dashboard for 600×600 smart-glasses displays

   Talks to Home Assistant through /api/home (api/home.js on Vercel), so the
   HA token never reaches the browser. The access code (APP_CODE), lock screen,
   demo mode, HUD and toasts come from the shared /deck/deck.js.
   Add ?demo to the URL for mock data.

   Input model: focus-first spatial navigation. Swipes arrive as arrow keys and
   a pinch as Enter (key names are in Deck.KEYS, deck/deck.js).
   ========================================================================== */
(() => {
  'use strict';

  const DEMO = Deck.demo;

  const CONFIG = {
    pollMs: 5000,
    tvMediaPlayer: null, // e.g. 'media_player.samsung_tv' — null = auto-detect
    tvRemote: null,      // e.g. 'remote.samsung_tv'

    domains: ['light', 'switch', 'fan', 'climate', 'scene', 'script'],
    dimmableOpensDetail: true, // false = dimmable lights simply toggle like switches
    brightnessStep: 5,         // % per left/right press
    adjustSendDelay: 350,      // ms of no input before a new value is sent to HA
    repeatDelay: 380,   // ms before hold-to-repeat starts
    repeatRate: 150,    // ms between repeats
    wheelVolume: true,  // scroll/wheel adjusts volume on the TV screen
  };

  // Samsung TV: prefer media_player services, fall back to remote KEY_* codes.
  const TV_ACTIONS = {
    power:    { svc: ['media_player', 'toggle'], key: 'KEY_POWER' },
    vol_up:   { svc: ['media_player', 'volume_up'], key: 'KEY_VOLUP' },
    vol_down: { svc: ['media_player', 'volume_down'], key: 'KEY_VOLDOWN' },
    mute:     { svc: 'mute', key: 'KEY_MUTE' },
    play:     { svc: ['media_player', 'media_play_pause'], key: 'KEY_PLAY' },
    up:       { key: 'KEY_UP' },
    down:     { key: 'KEY_DOWN' },
    left:     { key: 'KEY_LEFT' },
    right:    { key: 'KEY_RIGHT' },
    ok:       { key: 'KEY_ENTER' },
    back:     { key: 'KEY_RETURN' },
    home:     { key: 'KEY_HOME' },
    source:   { key: 'KEY_SOURCE' },
    menu:     { key: 'KEY_MENU' },
    rew:      { key: 'KEY_REWIND' },
    ffw:      { key: 'KEY_FF' },
  };

  const DOMAIN_ICON = { light: 'bulb', switch: 'plug', fan: 'fan', climate: 'thermo', scene: 'scene', script: 'run' };
  const TOGGLEABLE = ['light', 'switch', 'fan'];

  // One REST call returns every area with its relevant entities.
  const AREA_TEMPLATE =
    `{% set ns = namespace(out=[]) %}` +
    `{% for a in areas() %}` +
    `{% set e = area_entities(a) | select('match', '(${CONFIG.domains.join('|')})[.]') | list %}` +
    `{% if e | count > 0 %}{% set ns.out = ns.out + [{'id': a, 'name': area_name(a), 'entities': e}] %}{% endif %}` +
    `{% endfor %}{{ ns.out | tojson }}`;

  const $ = (sel) => document.querySelector(sel);
  const dom = {
    title: $('#hudTitle'),
    sub: $('#hudSub'),
    back: $('#hudBack'),
    homeGrid: $('#homeGrid'),
    roomGrid: $('#roomGrid'),
    views: { home: $('#view-home'), room: $('#view-room'), detail: $('#view-detail'), tv: $('#view-tv') },
    detail: {
      root: $('#detail'),
      readout: $('#detailReadout'),
      value: $('#detailValue'),
      unit: $('#detailUnit'),
      caption: $('#detailCaption'),
      adjust: $('#adjust'),
      fill: $('#meterFill'),
      power: $('#detailPower'),
      powerLabel: $('#detailPowerLabel'),
    },
  };

  const state = {
    areas: [],
    entities: new Map(),
    view: 'home',
    room: null,
    tv: { player: null, remote: null },
    homeFocus: null,
    lastError: '',
    detail: null, // { id, model, value, lockUntil, timer }
  };

  /* ---------------------------------------------------------------------
     Home Assistant API
     --------------------------------------------------------------------- */
  // /api/home?path=… — Deck.api adds the access code and opens the lock screen on 401.
  function ha(path, method = 'GET', body) {
    return Deck.api('home', { path }, { method, body });
  }

  function callService(domain, service, data) {
    if (DEMO) return demo.service(domain, service, data);
    return ha(`services/${domain}/${service}`, 'POST', data);
  }

  async function fetchStates() {
    const list = DEMO ? demo.states() : await ha('states');
    state.entities = new Map(list.map((s) => [s.entity_id, s]));
  }

  async function fetchAreas() {
    if (DEMO) return demo.areas();
    try {
      const res = await ha('template', 'POST', { template: AREA_TEMPLATE });
      const areas = typeof res === 'string' ? JSON.parse(res) : res;
      if (Array.isArray(areas) && areas.length) return areas;
    } catch (err) {
      console.warn('Area lookup failed; grouping by device type instead.', err);
    }
    return fallbackAreas();
  }

  function fallbackAreas() {
    const labels = { light: 'Lights', switch: 'Switches', fan: 'Fans', scene: 'Scenes', script: 'Scripts' };
    const ids = [...state.entities.keys()];
    return CONFIG.domains
      .map((d) => ({ id: `_${d}`, name: labels[d], entities: ids.filter((id) => id.startsWith(`${d}.`)) }))
      .filter((a) => a.entities.length);
  }

  function detectTv() {
    const ids = [...state.entities.keys()];
    const looksLikeTv = (id) => {
      const name = state.entities.get(id)?.attributes?.friendly_name || '';
      return /samsung|(^|[\s._])tv($|[\s._])|television/i.test(`${id} ${name}`);
    };
    const find = (domain) => ids.find((id) => id.startsWith(`${domain}.`) && looksLikeTv(id));

    const player = CONFIG.tvMediaPlayer || find('media_player') || null;
    let remote = CONFIG.tvRemote || null;
    if (!remote && player) {
      const twin = `remote.${player.split('.')[1]}`;
      if (state.entities.has(twin)) remote = twin;
    }
    if (!remote) remote = find('remote') || null;
    state.tv = { player, remote };
  }

  /* ---------------------------------------------------------------------
     Entity helpers
     --------------------------------------------------------------------- */
  const domainOf = (id) => id.split('.')[0];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const fmtNum = (v) => (v == null || Number.isNaN(+v) ? '--' : String(Math.round(v * 10) / 10));

  function isDimmable(id) {
    if (domainOf(id) !== 'light') return false;
    const a = state.entities.get(id)?.attributes || {};
    if (a.brightness != null) return true;
    return Array.isArray(a.supported_color_modes) && a.supported_color_modes.some((m) => m !== 'onoff');
  }

  const hasDetail = (id) =>
    domainOf(id) === 'climate' || (CONFIG.dimmableOpensDetail && isDimmable(id));
  const icon = (name, cls = '') =>
    `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  function displayName(id, areaName) {
    const s = state.entities.get(id);
    let name = s?.attributes?.friendly_name || id.split('.')[1].replace(/_/g, ' ');
    if (areaName && name.toLowerCase().startsWith(`${areaName.toLowerCase()} `)) {
      const rest = name.slice(areaName.length).trim();
      if (rest) name = rest.charAt(0).toUpperCase() + rest.slice(1);
    }
    return name;
  }

  function entityStatus(id) {
    const s = state.entities.get(id);
    const d = domainOf(id);
    if (!s || s.state === 'unavailable' || s.state === 'unknown') return { text: 'Offline', on: false, na: true };
    if (d === 'scene') return { text: 'Activate', on: false };
    if (d === 'script') return { text: s.state === 'on' ? 'Running' : 'Run', on: s.state === 'on' };
    if (d === 'climate') {
      const a = s.attributes || {};
      if (s.state === 'off') return { text: `Off · ${fmtNum(a.current_temperature)}°`, on: false };
      return { text: `${fmtNum(a.current_temperature)}° → ${fmtNum(a.temperature)}°`, on: true };
    }
    const on = s.state === 'on';
    if (d === 'light' && on && s.attributes?.brightness != null) {
      return { text: `On · ${Math.round(s.attributes.brightness / 2.55)}%`, on };
    }
    return { text: on ? 'On' : 'Off', on };
  }

  function areaSummary(area) {
    const toggles = area.entities.filter((id) => TOGGLEABLE.includes(domainOf(id)));
    if (!toggles.length) return { text: `${area.entities.length} actions`, on: 0 };
    const on = toggles.filter((id) => state.entities.get(id)?.state === 'on').length;
    return { text: on ? `${on} of ${toggles.length} on` : 'All off', on };
  }

  function tvSummary() {
    const s = state.entities.get(state.tv.player);
    if (!state.tv.player && !state.tv.remote) return 'Not found';
    if (!s) return 'Ready';
    if (s.state === 'off' || s.state === 'standby') return 'Off';
    if (s.state === 'unavailable') return 'Offline';
    const vol = s.attributes?.volume_level;
    const muted = s.attributes?.is_volume_muted;
    return `On${vol != null ? ` · Vol ${Math.round(vol * 100)}` : ''}${muted ? ' · Muted' : ''}`;
  }

  /* ---------------------------------------------------------------------
     Rendering
     --------------------------------------------------------------------- */
  function makeTile({ key, name, meta, iconName, extraClass = '', more = false, onSelect }) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `tile focusable ${extraClass}`.trim();
    b.dataset.key = key;
    b.innerHTML =
      (more ? `<span class="tile-more">${icon('chev', 'rot-90')}</span>` : '') +
      `<span class="tile-icon">${icon(iconName)}</span>` +
      `<span class="tile-text"><span class="tile-name"></span><span class="tile-meta"></span></span>`;
    b.querySelector('.tile-name').textContent = name; // textContent: names are user data
    b.querySelector('.tile-meta').textContent = meta;
    b._select = onSelect;
    return b;
  }

  function renderHome() {
    const tiles = [
      makeTile({
        key: 'tv', name: 'TV Remote', meta: tvSummary(), iconName: 'tv',
        extraClass: 'tile-feature', onSelect: () => openView('tv'),
      }),
      ...state.areas.map((area) => makeTile({
        key: `area:${area.id}`, name: area.name, meta: areaSummary(area).text,
        iconName: 'door', onSelect: () => openRoom(area),
      })),
    ];
    dom.homeGrid.replaceChildren(...tiles);
    if (!state.areas.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = state.lastError || 'No rooms found yet';
      dom.homeGrid.append(p);
    }
    refreshVisible();
  }

  function renderRoom(area) {
    const tiles = area.entities.map((id) => makeTile({
      key: id,
      name: displayName(id, area.name),
      meta: '',
      iconName: DOMAIN_ICON[domainOf(id)] || 'bulb',
      more: hasDetail(id),
      onSelect: () => (hasDetail(id) ? openDetail(id) : toggleEntity(id)),
    }));
    dom.roomGrid.replaceChildren(...tiles);
    refreshVisible();
  }

  function setTileStatus(tile, text, on, na) {
    tile.querySelector('.tile-meta').textContent = text;
    tile.classList.toggle('is-on', !!on);
    tile.classList.toggle('is-unavailable', !!na);
  }

  // Update text/classes in place so focus is never lost during polling.
  function refreshVisible() {
    for (const tile of dom.homeGrid.querySelectorAll('.tile')) {
      if (tile.dataset.key === 'tv') {
        tile.querySelector('.tile-meta').textContent = tvSummary();
      } else {
        const area = state.areas.find((a) => `area:${a.id}` === tile.dataset.key);
        if (area) { const s = areaSummary(area); setTileStatus(tile, s.text, s.on > 0); }
      }
    }
    for (const tile of dom.roomGrid.querySelectorAll('.tile')) {
      const s = entityStatus(tile.dataset.key);
      setTileStatus(tile, s.text, s.on, s.na);
    }
    const player = state.entities.get(state.tv.player);
    document.querySelector('[data-tv="mute"]').classList.toggle('is-on', !!player?.attributes?.is_volume_muted);
    if (state.view === 'detail') renderDetail();
    updateHud();
  }

  function updateHud() {
    if (state.view === 'home') {
      dom.sub.textContent = state.areas.length ? `${state.areas.length} rooms` : '';
    } else if (state.view === 'room' && state.room) {
      dom.sub.textContent = areaSummary(state.room).text;
    } else if (state.view === 'detail') {
      dom.sub.textContent = state.room?.name || '';
    } else if (state.view === 'tv') {
      dom.sub.textContent = tvSummary();
    }
  }

  /* ---------------------------------------------------------------------
     Views & navigation
     --------------------------------------------------------------------- */
  function openView(name, title, focusTarget) {
    if (state.view === 'home' && name !== 'home') state.homeFocus = document.activeElement;
    for (const [key, el] of Object.entries(dom.views)) el.hidden = key !== name;
    state.view = name;
    dom.title.textContent = title || dom.views[name].dataset.title;
    dom.back.hidden = name === 'home';
    if (!focusTarget) dom.views[name].scrollTop = 0;
    updateHud();

    const restore = name === 'home' && state.homeFocus?.isConnected ? state.homeFocus : null;
    focusEl(focusTarget || restore || firstFocusable(name));
  }

  function openRoom(area) {
    state.room = area;
    renderRoom(area);
    openView('room', area.name);
  }

  function goBack() {
    if (state.view === 'detail' && state.room) {
      const id = state.detail?.id;
      flushAdjust();
      const tile = id ? dom.roomGrid.querySelector(`[data-key="${CSS.escape(id)}"]`) : null;
      openView('room', state.room.name, tile);
    } else if (state.view !== 'home') {
      openView('home');
    } else if (!Deck.toHub()) {
      bump(document.activeElement);
    }
  }

  function focusables() {
    return [...document.querySelectorAll(
      `#view-${state.view} .focusable, .hud .focusable`
    )].filter((el) => !el.hidden && !el.disabled && el.offsetParent !== null);
  }

  function firstFocusable(view) {
    const root = dom.views[view];
    return root.querySelector('[data-autofocus]') || root.querySelector('.focusable');
  }

  const focusEl = Deck.focus;

  // Geometric spatial navigation: nearest element in the pressed direction.
  function move(dir) {
    const items = focusables();
    const cur = document.activeElement;
    if (!items.includes(cur)) { focusEl(items[0]); return; }
    const best = Deck.nearest(items, cur, dir);
    if (best) focusEl(best);
    else bump(cur);
  }

  function activate(el) {
    if (!el || el.disabled || typeof el._select !== 'function') return;
    pressFx(el);
    el._select();
  }

  /* ---------------------------------------------------------------------
     Actions
     --------------------------------------------------------------------- */
  async function toggleEntity(id) {
    const d = domainOf(id);
    const s = state.entities.get(id);
    if (s && (s.state === 'unavailable' || s.state === 'unknown')) { toast('Device offline', true); return; }

    if (d === 'scene' || d === 'script') {
      await safely(() => callService(d, 'turn_on', { entity_id: id }));
      toast(`${displayName(id, state.room?.name)} ✓`);
      return;
    }
    if (s) { s.state = s.state === 'on' ? 'off' : 'on'; refreshVisible(); } // optimistic
    await safely(() => callService('homeassistant', 'toggle', { entity_id: id }));
    schedulePoll(700);
  }

  /* ---------------------------------------------------------------------
     Detail / adjust mode: ◀ ▶ change brightness or target temperature
     --------------------------------------------------------------------- */
  function detailModel(id) {
    const s = state.entities.get(id);
    const kind = domainOf(id) === 'climate' ? 'climate' : 'light';
    if (!s || s.state === 'unavailable' || s.state === 'unknown') {
      return { kind, unavailable: true, on: false, value: 0, min: 0, max: 100, meterMin: 0, step: 1, unit: '', caption: 'Offline' };
    }
    const a = s.attributes || {};
    if (kind === 'light') {
      const on = s.state === 'on';
      const value = on && a.brightness != null ? Math.round(a.brightness / 2.55) : on ? 100 : 0;
      return {
        kind, on, value,
        min: CONFIG.brightnessStep, max: 100, meterMin: 0, step: CONFIG.brightnessStep, unit: '%',
        caption: on ? 'Brightness · ◀ ▶ adjust' : 'Off · ▶ to turn on',
      };
    }
    const min = a.min_temp ?? 7;
    const max = a.max_temp ?? 35;
    return {
      kind,
      on: s.state !== 'off',
      value: a.temperature ?? a.current_temperature ?? min,
      min, max, meterMin: min,
      step: a.target_temp_step ?? 0.5,
      unit: '°',
      caption: `Now ${fmtNum(a.current_temperature)}° · ${a.hvac_action || s.state}`,
    };
  }

  function openDetail(id) {
    state.detail = { id, model: null, value: null, lockUntil: 0, timer: null };
    renderDetail(true);
    openView('detail', displayName(id, state.room?.name));
  }

  // Polls refresh the readout, except just after local input (so it doesn't jump back).
  function renderDetail(force = false) {
    const det = state.detail;
    if (!det) return;
    det.model = detailModel(det.id);
    if (force || performance.now() > det.lockUntil) det.value = det.model.value;
    paintDetail();
  }

  function paintDetail() {
    const { model: m, value } = state.detail;
    const off = !m.on && m.kind === 'light';
    const d = dom.detail;
    d.root.dataset.kind = m.kind;
    d.value.textContent = m.unavailable ? '--' : off ? 'Off' : fmtNum(value);
    d.unit.textContent = off || m.unavailable ? '' : m.unit;
    d.readout.classList.toggle('is-off', !m.on);
    d.caption.textContent = m.caption;
    const pct = off ? 0 : ((value - m.meterMin) / (m.max - m.meterMin)) * 100;
    d.fill.style.width = `${clamp(pct, 0, 100)}%`;
    d.adjust.setAttribute('aria-valuemin', m.min);
    d.adjust.setAttribute('aria-valuemax', m.max);
    d.adjust.setAttribute('aria-valuenow', off ? 0 : value);
    d.powerLabel.textContent = m.on ? 'Turn off' : 'Turn on';
    d.power.classList.toggle('is-on', m.on);
  }

  function adjustBy(dir) {
    const det = state.detail;
    if (!det?.model) return;
    const m = det.model;
    if (m.unavailable) { toast('Device offline', true); return; }

    let v;
    if (m.kind === 'light') {
      if (!m.on && dir < 0) { bump(dom.detail.adjust); return; }
      const base = m.on ? det.value : 0;
      v = clamp(Math.round(base / m.step) * m.step + dir * m.step, m.min, m.max);
    } else {
      v = clamp(Math.round((det.value + dir * m.step) / m.step) * m.step, m.min, m.max);
      v = Math.round(v * 10) / 10;
    }
    if (v === det.value && m.on) { bump(dom.detail.adjust); return; }

    det.value = v;
    det.lockUntil = performance.now() + 2500;

    // Optimistic local update so tiles and readout respond instantly.
    const s = state.entities.get(det.id);
    if (s) {
      if (m.kind === 'light') { s.state = 'on'; s.attributes.brightness = Math.round(v * 2.55); }
      else s.attributes.temperature = v;
    }
    refreshVisible();

    clearTimeout(det.timer);
    det.timer = setTimeout(sendAdjust, CONFIG.adjustSendDelay);
  }

  function sendAdjust() {
    const det = state.detail;
    if (!det) return;
    clearTimeout(det.timer);
    det.timer = null;
    const { id, value } = det;
    const kind = det.model.kind;
    safely(() => (kind === 'light'
      ? callService('light', 'turn_on', { entity_id: id, brightness_pct: value })
      : callService('climate', 'set_temperature', { entity_id: id, temperature: value })
    )).then(() => schedulePoll(800));
  }

  function flushAdjust() {
    if (state.detail?.timer) sendAdjust();
  }

  async function detailPower() {
    const det = state.detail;
    if (!det?.model || det.model.unavailable) return;
    flushAdjust();
    const { id, model: m } = det;
    const s = state.entities.get(id);
    det.lockUntil = 0;

    if (m.kind === 'light') {
      if (s) s.state = m.on ? 'off' : 'on';
      refreshVisible();
      await safely(() => callService('light', m.on ? 'turn_off' : 'turn_on', { entity_id: id }));
    } else {
      if (s) s.state = m.on ? 'off' : (s.attributes?.hvac_modes || []).find((x) => x !== 'off') || 'heat';
      refreshVisible();
      await safely(() => callService('climate', m.on ? 'turn_off' : 'turn_on', { entity_id: id }));
    }
    schedulePoll(700);
  }

  const tvBusy = new Set();
  async function runTv(name) {
    const action = TV_ACTIONS[name];
    if (!action || tvBusy.has(name)) return; // drop repeats while a call is in flight
    const { player, remote } = state.tv;
    tvBusy.add(name);
    try {
      await safely(async () => {
        if (action.svc && player) {
          if (action.svc === 'mute') {
            const muted = !!state.entities.get(player)?.attributes?.is_volume_muted;
            return callService('media_player', 'volume_mute', { entity_id: player, is_volume_muted: !muted });
          }
          return callService(action.svc[0], action.svc[1], { entity_id: player });
        }
        if (action.key && remote) {
          return callService('remote', 'send_command', { entity_id: remote, command: action.key });
        }
        throw new Error(remote ? 'No TV media player found' : 'No TV remote entity found');
      });
    } finally {
      tvBusy.delete(name);
    }
    schedulePoll(500);
  }

  async function safely(fn) {
    try {
      return await fn();
    } catch (err) {
      console.error(err);
      if (!err?.locked) toast(friendlyError(err), true);
      schedulePoll(300);
      return null;
    }
  }

  function friendlyError(err) {
    if (err?.locked) return 'Locked · enter the access code';
    if (err instanceof TypeError) return 'Can’t reach the server';
    return err?.message || 'Something went wrong';
  }

  /* ---------------------------------------------------------------------
     Polling & status
     --------------------------------------------------------------------- */
  let polling = false;
  let pollTimer = null;

  async function poll() {
    if (polling || document.hidden || Deck.locked) return;
    polling = true;
    try {
      await fetchStates();
      state.lastError = '';
      if (!state.areas.length) {
        state.areas = await fetchAreas();
        detectTv();
        renderHome();
        if (state.view === 'home') focusEl(firstFocusable('home'));
      }
      refreshVisible();
      setStatus(DEMO ? 'demo' : 'online');
    } catch (err) {
      console.error(err);
      setStatus('offline');
    } finally {
      polling = false;
    }
  }

  function schedulePoll(ms) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(poll, ms);
  }

  function setStatus(mode) {
    if (Deck.locked) return;
    const [dot, label] = {
      online: ['live', 'Online'], offline: ['offline', 'Offline'], demo: ['demo', 'Demo'], connecting: ['loading', 'Linking'],
    }[mode];
    Deck.status(dot, label);
  }

  /* ---------------------------------------------------------------------
     Feedback (shared: deck/deck.js)
     --------------------------------------------------------------------- */
  const pressFx = Deck.press;
  const bump = Deck.bump;
  const toast = (msg, isError = false) => Deck.toast(msg, { error: isError });

  /* ---------------------------------------------------------------------
     Input: gestures / keys / pointer / wheel
     --------------------------------------------------------------------- */
  function bindInput() {
    let lastRepeat = 0;

    document.addEventListener('keydown', (e) => {
      const action = Deck.action(e);
      if (!action) return;
      e.preventDefault();

      if (action === 'back') { if (!e.repeat) goBack(); return; }

      // Adjust mode: left/right change the value instead of moving focus (key repeat = hold).
      if ((action === 'left' || action === 'right') && document.activeElement === dom.detail.adjust) {
        adjustBy(action === 'right' ? 1 : -1);
        return;
      }

      if (action === 'select') {
        const el = document.activeElement;
        if (!el?.classList?.contains('focusable')) { focusEl(firstFocusable(state.view)); return; }
        if (e.repeat) {
          const now = performance.now();
          if (el.dataset.repeat !== undefined && now - lastRepeat >= CONFIG.repeatRate) {
            lastRepeat = now;
            activate(el);
          }
          return;
        }
        activate(el);
        return;
      }
      move(action);
    });
    // Stop Space from firing a second native click on keyup.
    document.addEventListener('keyup', (e) => { if (e.key === ' ') e.preventDefault(); });

    // Pointer / touch / pinch-click
    document.addEventListener('click', (e) => {
      const el = e.target.closest('.focusable');
      if (el) activate(el);
    });

    // Hold-to-repeat for volume, D-pad and seek
    let holdTimer = null;
    let holdInterval = null;
    const stopHold = () => { clearTimeout(holdTimer); clearInterval(holdInterval); };
    document.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('[data-repeat]');
      if (!el) return;
      stopHold();
      holdTimer = setTimeout(() => {
        holdInterval = setInterval(() => activate(el), CONFIG.repeatRate);
      }, CONFIG.repeatDelay);
    });
    document.addEventListener('pointerup', stopHold);
    document.addEventListener('pointercancel', stopHold);
    window.addEventListener('blur', stopHold);

    // Wheel/scroll → value on the adjust screen, volume on the TV screen
    let wheelAt = 0;
    document.addEventListener('wheel', (e) => {
      if (!CONFIG.wheelVolume || (state.view !== 'tv' && state.view !== 'detail')) return;
      e.preventDefault();
      const now = performance.now();
      if (now - wheelAt < (state.view === 'detail' ? 120 : 180)) return;
      wheelAt = now;
      if (state.view === 'detail') { adjustBy(e.deltaY < 0 ? 1 : -1); return; }
      const name = e.deltaY < 0 ? 'vol_up' : 'vol_down';
      pressFx(document.querySelector(`[data-tv="${name}"]`));
      runTv(name);
    }, { passive: false });

    dom.back._select = goBack;

    // Adjust bar: select confirms and returns; tapping its ends (touch/mouse) steps the value.
    dom.detail.adjust._select = goBack;
    dom.detail.adjust.addEventListener('click', (e) => {
      const r = dom.detail.adjust.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      if (e.detail === 0 || (x > 0.25 && x < 0.75)) return; // keyboard or middle: let it confirm
      e.stopPropagation();
      pressFx(dom.detail.adjust);
      adjustBy(x >= 0.75 ? 1 : -1);
    });
    dom.detail.power._select = detailPower;
  }

  function bindRemote() {
    for (const btn of document.querySelectorAll('[data-tv]')) {
      const name = btn.dataset.tv;
      btn._select = () => runTv(name);
    }
  }

  /* ---------------------------------------------------------------------
     Demo mode (?demo) — mock data, never touches Home Assistant
     --------------------------------------------------------------------- */
  const demo = (() => {
    const AREAS = [
      { id: 'living_room', name: 'Living Room', entities: ['light.living_room_ceiling', 'light.living_room_lamp', 'switch.living_room_fairy_lights', 'climate.living_room_heating', 'scene.movie_night'] },
      { id: 'kitchen', name: 'Kitchen', entities: ['light.kitchen_spots', 'light.kitchen_under_cabinet', 'switch.kitchen_coffee_machine'] },
      { id: 'bedroom', name: 'Bedroom', entities: ['light.bedroom_main', 'light.bedroom_bedside_left', 'light.bedroom_bedside_right', 'climate.bedroom_thermostat', 'fan.bedroom_fan'] },
      { id: 'office', name: 'Office', entities: ['light.office_desk', 'switch.office_monitor', 'script.office_focus_mode'] },
      { id: 'hallway', name: 'Hallway', entities: ['light.hallway', 'light.hallway_porch'] },
      { id: 'bathroom', name: 'Bathroom', entities: ['light.bathroom', 'fan.bathroom_extractor'] },
    ];
    const title = (id) => id.split('.')[1].split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
    const db = new Map();
    const ONOFF_ONLY = ['light.hallway_porch'];
    AREAS.flatMap((a) => a.entities).forEach((id, i) => {
      const d = domainOf(id);
      const attributes = { friendly_name: title(id) };
      let st;
      if (d === 'climate') {
        st = 'heat';
        Object.assign(attributes, {
          current_temperature: 19.5, temperature: 20, min_temp: 7, max_temp: 30,
          target_temp_step: 0.5, hvac_modes: ['off', 'heat'], hvac_action: 'heating',
        });
      } else if (d === 'scene') {
        st = '2026-01-01T00:00:00';
      } else {
        const on = TOGGLEABLE.includes(d) && i % 3 === 0;
        st = on ? 'on' : 'off';
        if (d === 'light') {
          const dimmable = !ONOFF_ONLY.includes(id);
          attributes.supported_color_modes = dimmable ? ['brightness'] : ['onoff'];
          if (on && dimmable) attributes.brightness = 204;
        }
      }
      db.set(id, { entity_id: id, state: st, attributes });
    });
    db.set('media_player.samsung_tv', {
      entity_id: 'media_player.samsung_tv', state: 'on',
      attributes: { friendly_name: 'Samsung TV', volume_level: 0.18, is_volume_muted: false },
    });
    db.set('remote.samsung_tv', { entity_id: 'remote.samsung_tv', state: 'on', attributes: { friendly_name: 'Samsung TV' } });

    function service(domain, svc, data = {}) {
      for (const id of [].concat(data.entity_id || [])) {
        const s = db.get(id);
        if (!s) continue;
        const a = s.attributes;
        if (domain === 'media_player') {
          if (svc === 'toggle') s.state = s.state === 'on' ? 'off' : 'on';
          if (svc === 'volume_up') a.volume_level = Math.min(1, +(a.volume_level + 0.02).toFixed(2));
          if (svc === 'volume_down') a.volume_level = Math.max(0, +(a.volume_level - 0.02).toFixed(2));
          if (svc === 'volume_mute') a.is_volume_muted = data.is_volume_muted;
        } else if (domain === 'remote') {
          toast(`TV ← ${data.command}`);
        } else if (domain === 'climate') {
          if (svc === 'set_temperature') a.temperature = data.temperature;
          if (svc === 'turn_on') { s.state = 'heat'; a.hvac_action = 'heating'; }
          if (svc === 'turn_off') { s.state = 'off'; a.hvac_action = 'off'; }
        } else {
          const dimmable = domainOf(id) === 'light' && !ONOFF_ONLY.includes(id);
          if (svc === 'toggle') s.state = s.state === 'on' ? 'off' : 'on';
          if (svc === 'turn_on') s.state = 'on';
          if (svc === 'turn_off') s.state = 'off';
          if (dimmable) {
            if (data.brightness_pct != null) a.brightness = Math.round(data.brightness_pct * 2.55);
            else if (s.state === 'on' && a.brightness == null) a.brightness = 204;
            if (s.state === 'off') delete a.brightness;
          }
        }
      }
      return new Promise((r) => setTimeout(() => r([]), 120));
    }

    return {
      areas: () => structuredClone(AREAS),
      states: () => structuredClone([...db.values()]),
      service,
    };
  })();

  /* ---------------------------------------------------------------------
     Boot
     --------------------------------------------------------------------- */
  async function init() {
    bindInput();
    bindRemote();
    setStatus(DEMO ? 'demo' : 'connecting');

    try {
      await fetchStates();
      state.areas = await fetchAreas();
      detectTv();
      setStatus(DEMO ? 'demo' : 'online');
    } catch (err) {
      console.error(err);
      state.lastError = friendlyError(err);
      setStatus('offline');
      if (!err?.locked) toast(state.lastError, true);
    }

    renderHome();
    openView('home');
    setInterval(poll, CONFIG.pollMs);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
    if (DEMO) toast('Demo mode — mock data');
  }

  init();
})();
