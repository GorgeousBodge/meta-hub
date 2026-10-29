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

    domains: ['light', 'switch', 'fan', 'climate', 'camera', 'scene', 'script'],
    dimmableOpensDetail: true, // false = dimmable lights simply toggle like switches
    // Cameras
    cameraRefreshMs: 1000, // how often the picture refreshes
    ptzSpeed: 0.6,         // 0–1
    ptzDuration: 0.4,      // seconds each swipe moves the camera for
    // Controls are found automatically (same device, or same area with a camera-ish
    // name). Add or override them here: { 'camera.front_door': ['switch.front_door_privacy'] }
    cameraControls: {},
    // If the camera you view isn't the one that can move (e.g. a Dahua/Imou entity
    // alongside an ONVIF one): { 'camera.front_door': 'camera.front_door_mainstream' }
    cameraPtz: {},

    brightnessStep: 5,         // % per left/right press
    adjustSendDelay: 350,      // ms of no input before a new value is sent to HA
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

  const DOMAIN_ICON = { light: 'bulb', switch: 'plug', fan: 'fan', climate: 'thermo', camera: 'cam', scene: 'scene', script: 'run' };

  // For each camera: switches/selects on the same device, and in the same area.
  const CAMERA_TEMPLATE =
    `{% set ns = namespace(out=[]) %}` +
    `{% for c in states.camera %}` +
    `{% set d = device_id(c.entity_id) %}{% set a = area_id(c.entity_id) %}` +
    `{% set same = (device_entities(d) if d else []) | select('match', '(switch|select)[.]') | list %}` +
    `{% set near = (area_entities(a) if a else []) | select('match', '(switch|select)[.]') | list %}` +
    `{% set ns.out = ns.out + [{'id': c.entity_id, 'device': same, 'area': near}] %}` +
    `{% endfor %}{{ ns.out | tojson }}`;
  // Area matches only count if the name sounds like a camera setting.
  const CAMERA_WORDS = /privacy|infrared|night|(^|[._])ir([._]|$)|motion|detect|human|person|spotlight|white_light|tracking|indicator|status_?led|camera|cam/i;
  // Never offered as one-pinch buttons.
  const CAMERA_EXCLUDE = /siren|alarm|reboot|restart|format|reset|update/i;
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
    views: { home: $('#view-home'), room: $('#view-room'), detail: $('#view-detail'), camera: $('#view-camera'), tv: $('#view-tv') },
    cam: {
      view: $('#camView'),
      img: $('#camImg'),
      status: $('#camStatus'),
      statusText: $('#camStatusText'),
      msg: $('#camMsg'),
      hint: $('#camHint'),
      controls: $('#camControls'),
    },
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
    cameras: [],          // camera entity ids
    camLinks: new Map(),  // camera id -> [switch/select ids]
    cam: null,            // the camera being viewed
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

  async function fetchCameras() {
    state.cameras = [...state.entities.keys()].filter((id) => domainOf(id) === 'camera');
    let rows = [];
    if (state.cameras.length) {
      try {
        if (DEMO) rows = demo.cameraLinks();
        else {
          const res = await ha('template', 'POST', { template: CAMERA_TEMPLATE });
          rows = typeof res === 'string' ? JSON.parse(res) : res;
        }
      } catch (err) {
        console.warn('Camera control lookup failed; using CONFIG.cameraControls only.', err);
      }
    }
    state.camLinks = new Map(state.cameras.map((id) => {
      const row = (Array.isArray(rows) ? rows : []).find((r) => r.id === id) || {};
      const device = row.device || [];
      const near = (row.area || []).filter((e) => CAMERA_WORDS.test(e) && !device.includes(e));
      const ids = [...new Set([...(CONFIG.cameraControls[id] || []), ...device, ...near])]
        .filter((e) => state.entities.has(e) && !CAMERA_EXCLUDE.test(e))
        .slice(0, 8);
      return [id, ids];
    }));
  }

  function fallbackAreas() {
    const labels = { light: 'Lights', switch: 'Switches', fan: 'Fans', climate: 'Heating', camera: 'Cameras', scene: 'Scenes', script: 'Scripts' };
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
    domainOf(id) === 'climate' || domainOf(id) === 'camera' || (CONFIG.dimmableOpensDetail && isDimmable(id));

  // "Front Door Privacy Mode" next to camera "Front Door" -> "Privacy Mode"
  function stripShared(name, ref) {
    const a = name.split(/\s+/);
    const b = String(ref || '').toLowerCase().split(/\s+/);
    let i = 0;
    while (i < a.length - 1 && i < b.length && a[i].toLowerCase() === b[i]) i++;
    const rest = a.slice(i).join(' ');
    return rest.charAt(0).toUpperCase() + rest.slice(1);
  }

  // ONVIF names cameras by stream profile ("Security Camera Profile000"): drop that ending.
  function camName(id) {
    const full = displayName(id);
    return full.replace(/[\s_-]*(profile[\s_]*\d+|main[\s_]*stream|sub[\s_]*stream)$/i, '').trim() || full;
  }

  function controlIcon(id) {
    if (/privacy/i.test(id)) return 'eye-off';
    if (/infrared|night|(^|[._])ir([._]|$)/i.test(id)) return 'moon';
    if (/motion|detect|human|person|tracking/i.test(id)) return 'motion';
    if (/light|led|spot/i.test(id)) return 'bulb';
    return domainOf(id) === 'select' ? 'list' : 'plug';
  }
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
    if (d === 'camera') return { text: 'Live view', on: false };
    if (d === 'select') return { text: s.state, on: !/^(off|disabled?|none|close)$/i.test(s.state) };
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
    if (!toggles.length) {
      const n = area.entities.length;
      const cams = area.entities.every((id) => domainOf(id) === 'camera');
      return { text: `${n} ${cams ? 'camera' : 'item'}${n === 1 ? '' : 's'}`, on: 0 };
    }
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
      ...(state.cameras.length ? [makeTile({
        key: 'cams',
        name: state.cameras.length === 1 ? camName(state.cameras[0]) : 'Cameras',
        meta: state.cameras.length === 1 ? 'Live view' : `${state.cameras.length} cameras`,
        iconName: 'cam',
        extraClass: 'tile-feature',
        onSelect: () => (state.cameras.length === 1
          ? openCamera(state.cameras[0])
          : openRoom({ id: '_cameras', name: 'Cameras', entities: state.cameras })),
      })] : []),
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
      name: domainOf(id) === 'camera' ? camName(id) : displayName(id, area.name),
      meta: '',
      iconName: DOMAIN_ICON[domainOf(id)] || 'bulb',
      more: hasDetail(id),
      onSelect: () => {
        if (domainOf(id) === 'camera') openCamera(id);
        else if (hasDetail(id)) openDetail(id);
        else toggleEntity(id);
      },
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
      } else if (tile.dataset.key === 'cams') {
        // static
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
    if (state.view === 'camera') refreshCamControls();
    updateHud();
  }

  function updateHud() {
    if (state.view === 'home') {
      dom.sub.textContent = state.areas.length ? `${state.areas.length} rooms` : '';
    } else if (state.view === 'room' && state.room) {
      dom.sub.textContent = areaSummary(state.room).text;
    } else if (state.view === 'detail') {
      dom.sub.textContent = state.room?.name || '';
    } else if (state.view === 'camera') {
      dom.sub.textContent = state.cam?.moving ? 'Move mode' : (state.cam?.from?.name || '');
    } else if (state.view === 'tv') {
      dom.sub.textContent = tvSummary();
    }
  }

  /* ---------------------------------------------------------------------
     Views & navigation
     --------------------------------------------------------------------- */
  function openView(name, title, focusTarget) {
    if (state.view === 'home' && name !== 'home') state.homeFocus = document.activeElement;
    if (state.view === 'camera' && name !== 'camera') stopCamera();
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
    if (state.view === 'camera') {
      const cam = state.cam;
      if (cam?.moving) { setMoveMode(false); return; }
      const from = cam?.from;
      if (from) {
        const tile = dom.roomGrid.querySelector(`[data-key="${CSS.escape(cam.id)}"]`);
        openView('room', from.name, tile);
      } else {
        openView('home');
      }
      return;
    }
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

  /* ---------------------------------------------------------------------
     Camera: picture refreshed every second, move mode, settings buttons
     --------------------------------------------------------------------- */
  // Each frame loads as an ordinary image from /api/home (the access code is in
  // the address, like every Deck request). A fresh "t" makes every frame new.
  function snapshotUrl(id) {
    const q = new URLSearchParams({ path: `camera_proxy/${id}`, w: '640', t: String(Date.now()) });
    if (Deck.code) q.set('c', Deck.code);
    return `/api/home?${q}`;
  }

  // Load off-screen, then swap in, so a failed frame never blanks the last good one.
  function loadFrame(src) {
    return new Promise((resolve, reject) => {
      const next = new Image();
      next.alt = '';
      next.onload = () => {
        const shown = dom.cam.img;
        next.id = shown.id;
        shown.replaceWith(next);
        dom.cam.img = next;
        resolve();
      };
      next.onerror = () => reject(new Error('frame'));
      next.src = src;
    });
  }

  // A frame failed: ask the server why, so the screen can say something useful.
  async function frameError(url) {
    let res;
    try {
      res = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch {
      return { message: 'Can’t reach the server' };
    }
    const data = await res.json().catch(() => null);
    if (res.status === 401 && data?.locked) {
      Deck.lock(Deck.code ? 'Wrong access code' : 'Access code needed');
      return { message: 'Locked · enter the access code', locked: true };
    }
    if (!res.ok) return { message: data?.error || `Camera error (${res.status})` };
    return { message: 'The camera sent a picture the glasses can’t show' };
  }

  function openCamera(id) {
    stopCamera();
    const from = state.view === 'room' ? state.room : null;
    state.cam = { id, from, moving: false, busy: false, timer: null, ticker: null, url: null, lastOk: 0, error: '', noPtz: false };
    dom.cam.img.removeAttribute('src');
    dom.cam.msg.textContent = '';
    dom.cam.hint.textContent = 'Pinch to move camera';
    setMoveMode(false);
    renderCamControls();
    openView('camera', camName(id));
    paintCamStatus();
    state.cam.ticker = setInterval(paintCamStatus, 500);
    camLoop();
  }

  function stopCamera() {
    const cam = state.cam;
    if (!cam) return;
    clearTimeout(cam.timer);
    clearInterval(cam.ticker);
    if (cam.url) URL.revokeObjectURL(cam.url);
    dom.cam.view.classList.remove('is-moving');
    state.cam = null;
  }

  function camLoop() {
    const cam = state.cam;
    if (!cam || state.view !== 'camera') return;
    if (document.hidden || Deck.locked) { cam.timer = setTimeout(camLoop, 1000); return; }
    const started = performance.now();
    let job;
    if (DEMO) {
      job = demo.snapshot(cam.id).then((blob) => {
        const url = URL.createObjectURL(blob);
        return loadFrame(url).finally(() => {
          if (cam.url) URL.revokeObjectURL(cam.url);
          cam.url = url;
        });
      });
    } else {
      const url = snapshotUrl(cam.id);
      job = loadFrame(url).catch(async () => {
        const why = await frameError(url);
        const err = new Error(why.message);
        err.locked = why.locked;
        throw err;
      });
    }
    job
      .then(() => {
        if (state.cam !== cam) return;
        cam.lastOk = Date.now();
        cam.error = '';
      })
      .catch((err) => {
        if (state.cam !== cam) return;
        console.warn(err);
        cam.error = err.message || 'No picture';
      })
      .finally(() => {
        if (state.cam !== cam || state.view !== 'camera') return;
        paintCamStatus();
        // After an error, wait a little longer before trying again.
        const gap = cam.error ? Math.max(3000, CONFIG.cameraRefreshMs) : CONFIG.cameraRefreshMs;
        const wait = Math.max(150, gap - (performance.now() - started));
        cam.timer = setTimeout(camLoop, wait);
      });
  }

  function privacyOn(cam) {
    return (state.camLinks.get(cam.id) || []).some((e) =>
      /privacy/i.test(e) && state.entities.get(e)?.state === 'on');
  }

  function paintCamStatus() {
    const cam = state.cam;
    if (!cam) return;
    const age = cam.lastOk ? (Date.now() - cam.lastOk) / 1000 : Infinity;
    const s = dom.cam.status;
    s.classList.toggle('is-error', !cam.lastOk && !!cam.error);
    s.classList.toggle('is-stale', !!cam.lastOk && age >= 4);
    dom.cam.statusText.textContent = !cam.lastOk
      ? (cam.error ? 'No signal' : 'Connecting')
      : age < 4 ? 'Live' : `${Math.round(age)}s ago`;
    let msg = '';
    if (privacyOn(cam)) msg = 'Privacy mode on';
    else if (!cam.lastOk && cam.error) msg = cam.error;
    else if (!cam.lastOk) msg = 'Connecting…';
    dom.cam.msg.textContent = msg;
  }

  function setMoveMode(on) {
    const cam = state.cam;
    if (!cam) return;
    if (on && cam.noPtz) { toast('This camera can’t be moved from here', true); bump(dom.cam.view); return; }
    cam.moving = !!on;
    dom.cam.view.classList.toggle('is-moving', cam.moving);
    dom.cam.view.setAttribute('aria-pressed', String(cam.moving));
    updateHud();
  }

  async function ptz(dir) {
    const cam = state.cam;
    if (!cam || cam.busy) return; // drop repeats while a move is in flight
    cam.busy = true;
    const v = dom.cam.view;
    v.classList.remove('is-nudge');
    void v.offsetWidth;
    v.classList.add('is-nudge');
    const data = {
      entity_id: CONFIG.cameraPtz[cam.id] || cam.id,
      move_mode: 'ContinuousMove',
      continuous_duration: CONFIG.ptzDuration,
      speed: CONFIG.ptzSpeed,
    };
    if (dir === 'left') data.pan = 'LEFT';
    if (dir === 'right') data.pan = 'RIGHT';
    if (dir === 'up') data.tilt = 'UP';
    if (dir === 'down') data.tilt = 'DOWN';
    try {
      await callService('onvif', 'ptz', data);
      setTimeout(() => { if (state.cam === cam) { clearTimeout(cam.timer); camLoop(); } }, CONFIG.ptzDuration * 1000 + 150);
    } catch (err) {
      console.error(err);
      if (err.status === 400 || err.status === 403) {
        cam.noPtz = true;
        dom.cam.hint.textContent = '';
        setMoveMode(false);
        toast('This camera can’t be moved from here', true);
      } else {
        toast(friendlyError(err), true);
      }
    } finally {
      cam.busy = false;
    }
  }

  function renderCamControls() {
    const cam = state.cam;
    // Hide settings Home Assistant marks unavailable (ONVIF adds some a camera may not have).
    const ids = (state.camLinks.get(cam.id) || []).filter((e) => state.entities.get(e)?.state !== 'unavailable');
    const name = camName(cam.id);
    if (!ids.length) {
      const p = document.createElement('p');
      p.className = 'cam-empty';
      p.textContent = 'No camera settings found. Add the Dahua or Imou Life integration for privacy, night vision and motion controls.';
      dom.cam.controls.replaceChildren(p);
      return;
    }
    const keys = ids.map((id) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'key focusable';
      b.dataset.key = id;
      b.innerHTML = `${icon(controlIcon(id))}<span class="key-label"></span><span class="key-state"></span>`;
      b.querySelector('.key-label').textContent = stripShared(displayName(id), name);
      b._select = () => camControl(id);
      return b;
    });
    dom.cam.controls.replaceChildren(...keys);
    refreshCamControls();
  }

  function refreshCamControls() {
    for (const b of dom.cam.controls.querySelectorAll('.key')) {
      const st = state.entities.get(b.dataset.key)?.state;
      const s = st === 'unknown' ? { text: 'Pinch to set', on: false } : entityStatus(b.dataset.key);
      b.querySelector('.key-state').textContent = s.text;
      b.classList.toggle('is-on', !!s.on);
      b.classList.toggle('is-unavailable', !!s.na);
    }
    if (state.cam) paintCamStatus();
  }

  async function camControl(id) {
    const s = state.entities.get(id);
    if (!s || s.state === 'unavailable') { toast('Setting unavailable', true); return; }
    if (domainOf(id) === 'select') {
      const opts = s.attributes?.options || [];
      const i = opts.indexOf(s.state);
      if (opts.length) s.state = opts[(i + 1) % opts.length]; // optimistic
      refreshCamControls();
      await safely(() => callService('select', 'select_next', { entity_id: id, cycle: true }));
    } else {
      s.state = s.state === 'on' ? 'off' : 'on';
      refreshCamControls();
      await safely(() => callService('homeassistant', 'toggle', { entity_id: id }));
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
        await fetchCameras();
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

      // Camera move mode: swipes pan/tilt the camera (holding repeats).
      if (state.cam?.moving && document.activeElement === dom.cam.view &&
          ['up', 'down', 'left', 'right'].includes(action)) {
        ptz(action);
        return;
      }

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

    dom.cam.view._select = () => setMoveMode(!state.cam?.moving);
    // Leaving the picture (e.g. tapping a control) ends move mode.
    dom.cam.view.addEventListener('blur', () => { if (state.cam?.moving) setMoveMode(false); });
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
      { id: 'hallway', name: 'Hallway', entities: ['light.hallway', 'light.hallway_porch', 'camera.front_door'] },
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
      } else if (d === 'camera') {
        st = 'idle';
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

    // Cameras
    db.set('camera.garden', { entity_id: 'camera.garden', state: 'idle', attributes: { friendly_name: 'Garden' } });
    db.set('switch.front_door_privacy_mode', { entity_id: 'switch.front_door_privacy_mode', state: 'off', attributes: { friendly_name: 'Front Door Privacy mode' } });
    db.set('switch.front_door_motion_detection', { entity_id: 'switch.front_door_motion_detection', state: 'on', attributes: { friendly_name: 'Front Door Motion detection' } });
    db.set('select.front_door_night_vision', { entity_id: 'select.front_door_night_vision', state: 'Auto', attributes: { friendly_name: 'Front Door Night vision', options: ['Auto', 'Infrared', 'Off'] } });
    db.set('switch.front_door_siren', { entity_id: 'switch.front_door_siren', state: 'off', attributes: { friendly_name: 'Front Door Siren' } });
    const ptzPos = { 'camera.front_door': { x: 0, y: 0 }, 'camera.garden': { x: 0, y: 0 } };

    function cameraLinks() {
      return [
        { id: 'camera.front_door', device: ['switch.front_door_privacy_mode', 'switch.front_door_motion_detection', 'select.front_door_night_vision', 'switch.front_door_siren'], area: ['light.hallway'] },
        { id: 'camera.garden', device: [], area: [] },
      ];
    }

    function snapshot(id) {
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 360;
      const g = c.getContext('2d');
      const pos = ptzPos[id] || { x: 0, y: 0 };
      const privacy = id === 'camera.front_door' && db.get('switch.front_door_privacy_mode').state === 'on';
      const night = id === 'camera.front_door' && db.get('select.front_door_night_vision').state === 'Infrared';
      if (privacy) {
        g.fillStyle = '#000';
        g.fillRect(0, 0, 640, 360);
      } else {
        const sky = g.createLinearGradient(0, 0, 0, 360);
        sky.addColorStop(0, night ? '#1d2a24' : '#2a4b6e');
        sky.addColorStop(1, night ? '#0b120f' : '#0d1a26');
        g.fillStyle = sky;
        g.fillRect(0, 0, 640, 360);
        g.save();
        g.translate(-pos.x * 40, pos.y * 30);
        g.fillStyle = night ? '#2f3d36' : '#2f4a3a';
        g.fillRect(-400, 250, 1600, 200); // lawn
        g.fillStyle = night ? '#4a5650' : '#6b5a4a';
        g.fillRect(180, 120, 260, 140); // house
        g.fillStyle = night ? '#38433d' : '#3d2f26';
        g.beginPath(); g.moveTo(160, 125); g.lineTo(310, 40); g.lineTo(460, 125); g.fill(); // roof
        g.fillStyle = night ? '#a8b8ae' : '#d9b36a';
        g.fillRect(290, 180, 40, 80); // door
        g.fillStyle = night ? '#2a3530' : '#1f2d24';
        for (let t = -300; t < 1000; t += 170) { g.beginPath(); g.arc(t, 250, 40, Math.PI, 0); g.fill(); } // hedges
        g.restore();
      }
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.font = '600 16px monospace';
      g.fillText(new Date().toLocaleTimeString('en-GB'), 520, 340);
      g.fillText(db.get(id)?.attributes.friendly_name || id, 16, 340);
      return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.8));
    }

    function service(domain, svc, data = {}) {
      if (domain === 'onvif' && svc === 'ptz') {
        const p = ptzPos[data.entity_id];
        if (!p) return Promise.reject(Object.assign(new Error('Not a PTZ camera'), { status: 400 }));
        if (data.pan === 'LEFT') p.x -= 1;
        if (data.pan === 'RIGHT') p.x += 1;
        if (data.tilt === 'UP') p.y += 1;
        if (data.tilt === 'DOWN') p.y -= 1;
        return new Promise((r) => setTimeout(() => r([]), 150));
      }
      if (domain === 'select' && svc === 'select_next') {
        const s = db.get(data.entity_id);
        const o = s.attributes.options;
        s.state = o[(o.indexOf(s.state) + 1) % o.length];
        return new Promise((r) => setTimeout(() => r([]), 120));
      }
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
      cameraLinks,
      snapshot,
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
      await fetchCameras();
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
