/* ==========================================================================
   Calendar Deck — Google + Outlook.com calendars at a glance on the glasses.
   Shared HUD, access code, lock screen and keys come from /deck/deck.js.
   Server: /api/calendar/<op> (api/calendar/[op].js). Read-only. Accounts are
   connected on /connect/ (the same sign-in as Mail).

   Event text is untrusted: it is only ever put on screen with textContent,
   and nothing is ever opened from an event (no links, no images).
   ========================================================================== */
(() => {
  'use strict';

  const DAYS = 7;
  const REFRESH_MS = 5 * 60 * 1000;   // reload from the server while visible
  const TICK_MS = 30 * 1000;          // redraw "now" and countdowns
  const SPEAK_NOTES_MAX = 1200;
  const ACCOUNT_LABEL = { google: 'Google', microsoft: 'Outlook' };
  const CACHE_KEY = 'calendar.cache';

  const $ = (id) => document.getElementById(id);
  const VIEWS = { agenda: $('agenda'), event: $('event') };

  const state = {
    view: 'agenda',
    data: null,          // { tz, today, days, events, accounts }
    day: 0,              // index into data.days
    current: null,       // the open event
    lastFocusId: null,
    speaking: null,      // the button that's speaking
    refreshTimer: null,
    tickTimer: null,
    stale: false,
  };

  /* ---------- server or demo ---------- */
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const server = {
    async list() {
      if (Deck.demo) { await wait(250); return window.CAL_DEMO.build(DAYS); }
      return Deck.api('calendar/list', { days: DAYS }, { timeout: 25000 });
    },
  };

  /* ---------- small helpers ---------- */
  function node(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text; // always textContent: event text is untrusted
    return n;
  }
  const svg = (paths) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'ico');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    for (const d of paths) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      s.append(p);
    }
    return s;
  };
  const SPEAKER = ['M4 9.5h3.5L12 5.5v13l-4.5-4H4z', 'M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11'];

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const tz = () => (state.data && state.data.tz) || 'Europe/London';

  function fmt(ms, opts) {
    try { return new Date(ms).toLocaleString('en-GB', { timeZone: tz(), ...opts }); } catch { return new Date(ms).toLocaleString('en-GB', opts); }
  }
  const hhmm = (ms) => fmt(ms, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  // For speech: "4 pm", "4:30 pm"
  const spokenTime = (ms) => fmt(ms, { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/:00(?=\s)/, '').replace(/ /g, ' ');

  function dayKeyOf(ms) {
    try {
      const p = {};
      for (const x of new Intl.DateTimeFormat('en-GB', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms))) p[x.type] = x.value;
      return `${p.year}-${p.month}-${p.day}`;
    } catch {
      const d = new Date(ms);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }
  const keyDate = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
  const keyFmt = (key, opts) => keyDate(key).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });
  const todayKey = () => (state.data ? state.data.days[0] : dayKeyOf(Date.now()));
  const tomorrowKey = () => (state.data ? state.data.days[1] : '');

  function relDay(key, { long = false } = {}) {
    if (key === todayKey()) return 'Today';
    if (key === tomorrowKey()) return 'Tomorrow';
    return long ? keyFmt(key, { weekday: 'long', day: 'numeric', month: 'long' }) : keyFmt(key, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function duration(ms) {
    const mins = Math.max(0, Math.round(ms / 60000));
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60), r = mins % 60;
    return r ? `${h} hr ${r}` : `${h} hr`;
  }
  function countdown(ms) {
    const mins = Math.max(1, Math.round(ms / 60000));
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60), r = mins % 60;
    return r ? `${h} hr ${r} min` : `${h} hr`;
  }

  const startMs = (e) => Date.parse(e.start);
  const endMs = (e) => Date.parse(e.end);
  const startKey = (e) => (e.allDay ? e.startDay : dayKeyOf(startMs(e)));
  const endKey = (e) => (e.allDay ? e.endDay : dayKeyOf(Math.max(startMs(e), endMs(e) - 1)));
  const isLive = (e, now) => !e.allDay && startMs(e) <= now && now < endMs(e);
  const isOver = (e, now) => (e.allDay ? e.endDay < todayKey() : endMs(e) <= now);

  // A day's events: all-day first, then ones carried over from the day before, then by time
  function eventsOn(key) {
    if (!state.data) return [];
    const evs = state.data.events.filter((e) => Array.isArray(e.on) && e.on.includes(key));
    const rank = (e) => (e.allDay ? 0 : startKey(e) < key ? 1 : 2);
    return evs.sort((a, b) => rank(a) - rank(b) || startMs(a) - startMs(b) || a.title.localeCompare(b.title));
  }

  // Timed events still to come (or on now) today, not counting "free" ones
  const leftToday = (now = Date.now()) => eventsOn(todayKey()).filter((e) => !e.allDay && !e.free && endMs(e) > now);

  function badge(account) {
    return node('span', `badge is-${account}`, ACCOUNT_LABEL[account] || account);
  }

  /* ---------- HUD ---------- */
  function hudSub() {
    if (!state.data) return Deck.demo ? 'Demo' : '';
    const key = state.data.days[state.day];
    const now = Date.now();
    if (state.view === 'agenda' && state.day !== 0) {
      const n = eventsOn(key).length;
      return n ? plural(n, 'event') : 'Free';
    }
    const today = eventsOn(todayKey());
    const live = today.find((e) => isLive(e, now));
    if (live) return `Now · until ${hhmm(endMs(live))}`;
    const next = today.find((e) => !e.allDay && startMs(e) > now);
    if (next) return `Next ${hhmm(startMs(next))}`;
    return today.some((e) => !e.allDay) ? 'Done for today' : 'Free today';
  }
  const updateHud = () => Deck.title('Calendar', hudSub());

  // The launcher badge reads this, so its count is right straight away
  function saveBadge() {
    Deck.store.set('calendar.unread', { count: leftToday().length, more: false, at: Date.now(), demo: Deck.demo });
  }

  /* ---------- views ---------- */
  function show(view) {
    state.view = view;
    for (const [k, v] of Object.entries(VIEWS)) v.hidden = k !== view;
    Deck.back(view !== 'agenda');
    Deck.hints({
      agenda: [['Swipe', 'move'], ['Pinch', 'open'], ['← →', 'day']],
      event: [['Swipe', 'scroll'], ['Pinch', 'select'], ['Back', 'day']],
    }[view]);
    updateHud();
  }

  /* ---------- agenda ---------- */
  function tabLabel(key, i) {
    if (i === 0) return 'Today';
    if (i === 1) return 'Tmrw';
    return keyFmt(key, { weekday: 'short', day: 'numeric' });
  }

  function renderTabs() {
    const bar = $('tabs');
    const days = state.data ? state.data.days : [];
    bar.replaceChildren(...days.map((key, i) => {
      const b = node('button', `tab focusable${i === state.day ? ' is-active' : ''}`);
      b.type = 'button';
      b.dataset.day = String(i);
      b.append(tabLabel(key, i));
      const n = eventsOn(key).length;
      if (n) b.append(node('span', 'tab-count', String(n)));
      b.setAttribute('aria-label', `${relDay(key, { long: true })}, ${n ? plural(n, 'event') : 'free'}`);
      b._select = () => setDay(i, false);
      return b;
    }));
    const active = bar.querySelector('.is-active');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function timeCol(e, key) {
    const col = node('div', 'ev-time');
    if (e.allDay) {
      col.append(node('span', 'ev-start is-word', 'All day'));
      if (e.startDay !== e.endDay) {
        const total = Math.round((keyDate(e.endDay) - keyDate(e.startDay)) / 86400000) + 1;
        const nth = Math.round((keyDate(key) - keyDate(e.startDay)) / 86400000) + 1;
        col.append(node('span', 'ev-end', `Day ${nth}/${total}`));
      }
      return col;
    }
    const sKey = startKey(e), eKey = endKey(e);
    if (sKey < key) {
      // Carried over from an earlier day
      if (eKey === key) { col.append(node('span', 'ev-end', 'Until'), node('span', 'ev-start', hhmm(endMs(e)))); }
      else col.append(node('span', 'ev-start is-word', 'All day'));
      return col;
    }
    col.append(node('span', 'ev-start', hhmm(startMs(e))));
    if (endMs(e) > startMs(e)) col.append(node('span', 'ev-end', eKey === key ? hhmm(endMs(e)) : `→ ${keyFmt(eKey, { weekday: 'short' })}`));
    return col;
  }

  function row(e, key, now, isNext) {
    const live = isLive(e, now);
    const over = isOver(e, now);
    const b = node('button', 'card ev-row focusable');
    b.type = 'button';
    b.dataset.id = e.id;
    if (live) b.classList.add('is-now');
    else if (over) b.classList.add('is-past');
    if (isNext) b.classList.add('is-next');
    if (e.allDay) b.classList.add('is-allday');
    if (e.free) b.classList.add('is-free');
    if (live) b.append(node('span', 'now-mark'));

    const main = node('div', 'ev-main');
    main.append(node('div', 'ev-title', e.title));
    const meta = node('div', 'ev-meta');
    if (live) meta.append(node('span', 'ev-tag is-amber', `Now · ${countdown(endMs(e) - now)} left`));
    else if (isNext) meta.append(node('span', 'ev-tag is-amber', `In ${countdown(startMs(e) - now)}`));
    if (e.response === 'invited') meta.append(node('span', 'ev-tag', 'Not answered'));
    else if (e.response === 'tentative') meta.append(node('span', 'ev-tag', 'Maybe'));
    meta.append(badge(e.account));
    const place = e.location || (e.online ? e.online : '');
    if (place) meta.append(node('span', 'ev-where', place));
    main.append(meta);

    b.append(timeCol(e, key), main);
    const when = e.allDay ? 'All day' : `${hhmm(startMs(e))} to ${hhmm(endMs(e))}`;
    b.setAttribute('aria-label', `${live ? 'Now. ' : ''}${when}: ${e.title}${place ? `, ${place}` : ''}`);
    b._select = () => openEvent(e);
    return b;
  }

  function briefCard(key) {
    const b = node('button', 'card card-brief cal-brief focusable');
    b.type = 'button';
    b.dataset.id = '_brief';
    b.append(svg(SPEAKER));
    const label = key === todayKey() ? 'Hear today' : key === tomorrowKey() ? 'Hear tomorrow' : `Hear ${keyFmt(key, { weekday: 'long' })}`;
    const t = node('span', 'card-title', label);
    t.dataset.label = label;
    b.append(t);
    if (state.speaking && state.speaking.dataset.id === '_brief') { b.classList.add('is-speaking'); t.textContent = 'Stop'; }
    b._select = () => speakDay(key, b);
    return b;
  }

  function nowLine(now) {
    const n = node('div', 'now-line');
    n.append(node('span', null, `Now ${hhmm(now)}`));
    return n;
  }

  function accountNotes() {
    const notes = [];
    const acc = (state.data && state.data.accounts) || {};
    for (const key of ['google', 'microsoft']) {
      const a = acc[key];
      if (!a || a.ok) continue;
      if (a.connected === false && Object.values(acc).some((x) => x && x.ok)) continue; // only one account in use: fine
      const n = node('div', 'cal-note');
      n.append(node('b', null, `${ACCOUNT_LABEL[key]}: `));
      n.append(a.connected === false
        ? 'not connected. Open /connect/ on your computer to sign in.'
        : a.reconnect ? 'needs signing in again on /connect/.' : (a.error || 'couldn’t load.'));
      notes.push(n);
    }
    return notes;
  }

  function defaultFocus() {
    const list = $('list');
    if (state.day === 0) {
      return list.querySelector('.ev-row.is-now') || list.querySelector('.ev-row.is-next') ||
        list.querySelector('.ev-row:not(.is-past)') || list.querySelector('.cal-brief') || list.querySelector('.ev-row');
    }
    return list.querySelector('.ev-row') || list.querySelector('.cal-brief');
  }

  // keep: 'default' (best row for the day), 'same' (whatever had focus, without scrolling)
  function renderDay({ keep = 'default' } = {}) {
    const list = $('list');
    if (!state.data) return;
    const key = state.data.days[state.day];
    const now = Date.now();
    const evs = eventsOn(key);
    const isToday = state.day === 0;

    const active = document.activeElement;
    const activeId = active && active.dataset ? active.dataset.id || (active.dataset.day != null ? `tab:${active.dataset.day}` : null) : null;
    const scroll = list.scrollTop;

    const parts = [];
    if (evs.length) parts.push(briefCard(key));
    const timed = evs.filter((e) => !e.allDay);
    const nextEv = isToday ? timed.find((e) => startMs(e) > now) : null;
    const anyLive = isToday && timed.some((e) => isLive(e, now));
    let marked = !isToday || anyLive || !timed.length;
    for (const e of evs) {
      if (!marked && !e.allDay && startMs(e) > now) { parts.push(nowLine(now)); marked = true; }
      parts.push(row(e, key, now, nextEv && e.id === nextEv.id));
    }
    if (!marked) parts.push(nowLine(now)); // everything today is over

    if (!evs.length) {
      const anyOk = Object.values(state.data.accounts || {}).some((a) => a && a.ok);
      const s = node('div', 'state cal-empty');
      s.append(node('div', 'state-title', anyOk ? 'Free' : 'No calendars'),
        node('div', 'state-msg', anyOk ? `Nothing on ${isToday ? 'today' : relDay(key, { long: true }).replace(/^Tomorrow$/, 'tomorrow')}.` : 'No accounts connected yet.'));
      parts.push(s);
    }
    list.replaceChildren(...parts, ...accountNotes());
    renderTabs();
    updateHud();
    if (state.view !== 'agenda') return;

    if (keep === 'same' && activeId) {
      list.scrollTop = scroll;
      const again = activeId.startsWith('tab:')
        ? $('tabs').querySelector(`[data-day="${activeId.slice(4)}"]`)
        : list.querySelector(`[data-id="${CSS.escape(activeId)}"]`);
      if (again) { again.focus({ preventScroll: true }); return; }
    }
    const wanted = state.lastFocusId && list.querySelector(`[data-id="${CSS.escape(state.lastFocusId)}"]`);
    if (keep !== 'none') {
      if (keep !== 'same') list.scrollTop = 0;
      Deck.focus(wanted || defaultFocus() || $('tabs').querySelector('.is-active'));
    }
  }

  function setDay(i, focusRow) {
    if (!state.data || i < 0 || i >= state.data.days.length) return;
    stopSpeaking();
    state.day = i;
    state.lastFocusId = null;
    renderDay({ keep: 'none' });
    $('list').scrollTop = 0;
    const tabBtn = $('tabs').querySelector(`[data-day="${i}"]`);
    if (focusRow) Deck.focus(defaultFocus() || tabBtn);
    else Deck.focus(tabBtn);
  }

  function apply(data, { fromCache = false } = {}) {
    const firstLoad = !state.data;
    const prevToday = state.data && state.data.today;
    state.data = data;
    if (!Array.isArray(data.days) || !data.days.length) data.days = [dayKeyOf(Date.now())];
    if (prevToday && prevToday !== data.today) state.day = 0; // a new day began
    if (state.day >= data.days.length) state.day = 0;
    if (!fromCache) {
      saveBadge();
      if (!Deck.demo) Deck.store.set(CACHE_KEY, { ...data, savedAt: Date.now() });
    }
    if (state.view === 'agenda') renderDay({ keep: firstLoad ? 'default' : 'same' });
    else { renderTabs(); updateHud(); if (state.current) refreshCurrent(); }
  }

  // The open event may have changed (or gone) after a reload
  function refreshCurrent() {
    const fresh = state.data.events.find((e) => e.id === state.current.id);
    if (fresh) { state.current = fresh; fillEvent(fresh, { keepScroll: true }); }
  }

  async function load({ quiet = false } = {}) {
    if (!quiet) Deck.status('loading');
    try {
      const data = await server.list();
      apply(data);
      state.stale = false;
      const acc = Object.values(data.accounts || {});
      const partial = acc.some((a) => a && !a.ok && a.connected !== false) || acc.some((a) => a && a.ok && a.skipped);
      Deck.status(Deck.demo ? 'demo' : partial ? 'cached' : 'live', Deck.demo ? null : partial ? 'Partial' : null);
    } catch (err) {
      if (err.locked) return;
      Deck.status(state.data ? 'cached' : 'offline', state.data ? 'Saved' : null);
      if (!state.data) {
        const s = node('div', 'state');
        s.append(node('div', 'state-title err', 'Couldn’t load calendar'), node('div', 'state-msg', err.message));
        $('list').replaceChildren(s);
      }
      if (!quiet) Deck.toast(err.message, { error: true });
    }
  }

  /* ---------- one event ---------- */
  function whenLine(e) {
    if (e.allDay) {
      if (e.startDay === e.endDay) return `${relDay(e.startDay, { long: true })} · All day`;
      return `${relDay(e.startDay)} – ${relDay(e.endDay)} · All day`;
    }
    const s = startMs(e), en = endMs(e);
    const sKey = startKey(e), eKey = endKey(e);
    if (sKey === eKey) return `${relDay(sKey)} · ${hhmm(s)}–${hhmm(en)}${en > s ? ` · ${duration(en - s)}` : ''}`;
    return `${relDay(sKey)} ${hhmm(s)} → ${relDay(eKey)} ${hhmm(en)}`;
  }

  function statusText(e, now = Date.now()) {
    if (isLive(e, now)) return { text: `Now · ${countdown(endMs(e) - now)} left`, live: true };
    if (!e.allDay && startMs(e) > now && startMs(e) - now < 12 * 3600000) return { text: `Starts in ${countdown(startMs(e) - now)}`, live: false };
    if (isOver(e, now)) return { text: 'Finished', live: false, over: true };
    return null;
  }

  function fillStatus(e) {
    const st = statusText(e);
    const el = $('evStatus');
    el.hidden = !st;
    el.textContent = st ? st.text : '';
    el.classList.toggle('is-live', !!(st && st.live));
    el.classList.toggle('is-over', !!(st && st.over));
  }

  function fillEvent(e, { keepScroll = false } = {}) {
    const src = $('evSource');
    src.replaceChildren(badge(e.account));
    if (e.calendar) src.append(node('span', 'ev-cal', e.calendar));
    $('evTitle').textContent = e.title;
    $('evWhen').textContent = whenLine(e);
    fillStatus(e);

    const facts = [];
    const fact = (label, value) => { if (value) facts.push(node('dt', null, label), node('dd', null, value)); };
    fact('Where', e.location);
    fact('Online', e.online);
    if (e.with && e.with.length) {
      const extra = (e.people || e.with.length) - e.with.length;
      fact('With', `${e.with.join(', ')}${extra > 0 ? ` + ${extra} more` : ''}`);
    }
    fact('From', e.organiser);
    const tags = [];
    if (e.response === 'invited') tags.push('Not answered yet');
    if (e.response === 'tentative') tags.push('You said maybe');
    if (e.free) tags.push('Shown as free');
    fact('Status', tags.join(' · '));
    if (!facts.length && !e.notes) facts.push(node('div', 'ev-none', 'No other details.'));
    $('evFacts').replaceChildren(...facts);
    $('evFacts').hidden = !facts.length;
    $('evNotes').hidden = !e.notes;
    $('evNotes').textContent = e.notes || '';
    if (!keepScroll) $('evBody').scrollTop = 0;

    const nxt = nextEvent(e);
    $('btnNext').disabled = !nxt;
  }

  // The next event after this one, in time order across the shown days
  function nextEvent(e) {
    const all = state.data.events.slice().sort((a, b) => startMs(a) - startMs(b) || (b.allDay ? 1 : 0) - (a.allDay ? 1 : 0));
    const i = all.findIndex((x) => x.id === e.id);
    return i >= 0 ? all[i + 1] || null : null;
  }

  function openEvent(e) {
    stopSpeaking();
    state.current = e;
    state.lastFocusId = e.id;
    fillEvent(e);
    show('event');
    Deck.focus($('evBody'));
  }

  function goNext() {
    const nxt = state.current && nextEvent(state.current);
    if (!nxt) { Deck.bump($('btnNext')); return; }
    stopSpeaking();
    // Back then returns to that event's day
    const dayIdx = state.data.days.indexOf(nxt.on.includes(state.data.days[state.day]) ? state.data.days[state.day] : nxt.on[0]);
    if (dayIdx >= 0) state.day = dayIdx;
    state.current = nxt;
    state.lastFocusId = nxt.id;
    fillEvent(nxt);
    updateHud();
    Deck.focus($('btnNext').disabled ? $('evBody') : $('btnNext'));
  }

  /* ---------- speech ---------- */
  function setSpeaking(btn) {
    const prev = state.speaking;
    if (prev && prev !== btn) markSpeaking(prev, false);
    state.speaking = btn;
    if (btn) markSpeaking(btn, true);
  }
  function markSpeaking(btn, on) {
    btn.classList.toggle('is-speaking', on);
    const label = btn === $('btnListen') ? $('btnListenLabel') : btn.querySelector('.card-title');
    if (label) label.textContent = on ? 'Stop' : (label.dataset.label || 'Listen');
  }
  function stopSpeaking() {
    if (state.speaking) { Deck.hush(); markSpeaking(state.speaking, false); }
    state.speaking = null;
  }

  function speak(text, btn) {
    if (state.speaking === btn) { stopSpeaking(); return; }
    stopSpeaking();
    if (!Deck.canSpeak) { Deck.toast('Speech isn’t available here', { error: true }); return; }
    const ok = Deck.say(text, {
      onend: (done) => {
        if (state.speaking === btn) { markSpeaking(btn, false); state.speaking = null; }
        if (!done) Deck.toast('Speech didn’t play · try the Voice check', { error: true });
      },
    });
    if (ok) setSpeaking(btn);
  }

  function eventLine(e, key, now) {
    const place = e.location ? `, at ${e.location}` : e.online ? `, on ${e.online}` : '';
    if (e.allDay) return `All day: ${e.title}.`;
    if (isLive(e, now)) return `Now: ${e.title}${place}, until ${spokenTime(endMs(e))}.`;
    if (startKey(e) < key) return `Until ${spokenTime(endMs(e))}: ${e.title}.`;
    return `At ${spokenTime(startMs(e))}: ${e.title}${place}.`;
  }

  function dayScript(key) {
    const now = Date.now();
    const isToday = key === todayKey();
    const evs = eventsOn(key);
    const done = isToday ? evs.filter((e) => !e.allDay && endMs(e) <= now) : [];
    const rest = evs.filter((e) => !done.includes(e));
    const parts = [`${isToday ? 'Today, ' : key === tomorrowKey() ? 'Tomorrow, ' : ''}${keyFmt(key, { weekday: 'long', day: 'numeric', month: 'long' })}.`];
    if (done.length) parts.push(`${plural(done.length, 'event')} already done.`);
    if (!rest.length) parts.push(done.length ? 'Nothing else on.' : 'Nothing on.');
    else parts.push(`${plural(rest.length, 'event')}${done.length ? ' to go' : ''}.`);
    for (const e of rest) parts.push(eventLine(e, key, now));
    return parts.join(' ');
  }

  function speakDay(key, btn) { speak(dayScript(key), btn); }

  function speakEvent() {
    const e = state.current;
    if (!e) return;
    const parts = [`${e.title}.`, `${whenLine(e).replace(/–/g, ' to ').replace(/→/g, ' until ').replace(/ · /g, ', ')}.`];
    const st = statusText(e);
    if (st && !st.over) parts.push(`${st.text.replace(' · ', ', ')}.`);
    if (e.location) parts.push(`At ${e.location}.`);
    if (e.online) parts.push(`Online, on ${e.online}.`);
    if (e.with && e.with.length) parts.push(`With ${e.with.join(', ')}${(e.people || 0) > e.with.length ? ` and ${e.people - e.with.length} more` : ''}.`);
    if (e.response === 'invited') parts.push('You haven’t answered this invitation yet.');
    if (e.notes) parts.push(`Notes: ${e.notes.slice(0, SPEAK_NOTES_MAX)}`);
    speak(parts.join(' '), $('btnListen'));
  }

  /* ---------- back ---------- */
  function goBack() {
    if (state.view === 'event') {
      stopSpeaking();
      state.current = null;
      show('agenda');
      renderDay({ keep: 'default' });
      if (state.stale) load({ quiet: true });
      return true;
    }
    if (state.view === 'agenda' && state.day !== 0) { setDay(0, true); return true; }
    return false;
  }

  /* ---------- keys ---------- */
  function scrollBox(box, dir) {
    const max = box.scrollHeight - box.clientHeight;
    if (dir === 'down' && box.scrollTop >= max - 2) return false;
    if (dir === 'up' && box.scrollTop <= 2) return false;
    box.scrollBy({ top: dir === 'down' ? 150 : -150, behavior: 'smooth' });
    return true;
  }

  function agendaKey(action, cur) {
    const tabs = [...$('tabs').querySelectorAll('.tab')];
    const rows = [...$('list').querySelectorAll('.focusable')];
    if (action === 'left' || action === 'right') {
      const next = state.day + (action === 'right' ? 1 : -1);
      if (!state.data || next < 0 || next >= state.data.days.length) { Deck.bump(cur); return; }
      setDay(next, rows.includes(cur));
      return;
    }
    if (tabs.includes(cur)) {
      if (action === 'down' && rows[0]) Deck.focus(rows[0]); else Deck.bump(cur);
      return;
    }
    const i = rows.indexOf(cur);
    if (i < 0) { Deck.focus(rows[0] || tabs[state.day]); return; }
    if (action === 'up') { Deck.focus(i === 0 ? tabs[state.day] : rows[i - 1]); return; }
    if (action === 'down') { if (rows[i + 1]) Deck.focus(rows[i + 1]); else Deck.bump(cur); }
  }

  function eventKey(action, cur) {
    const body = $('evBody');
    const listenBtn = $('btnListen');
    const nextBtn = $('btnNext');
    if (cur !== body && cur !== listenBtn && cur !== nextBtn) { Deck.focus(body); return; }
    if (cur === body) {
      if (action === 'down') { if (!scrollBox(body, 'down')) Deck.focus(nextBtn.disabled ? listenBtn : nextBtn); }
      else if (action === 'up') { if (!scrollBox(body, 'up')) Deck.bump(body); }
      else if (action === 'left') Deck.focus(listenBtn);
      else if (action === 'right') { if (!nextBtn.disabled) Deck.focus(nextBtn); else Deck.bump(body); }
      return;
    }
    if (action === 'up') Deck.focus(body);
    else if (action === 'left' && cur === nextBtn) Deck.focus(listenBtn);
    else if (action === 'right' && cur === listenBtn && !nextBtn.disabled) Deck.focus(nextBtn);
    else Deck.bump(cur);
  }

  function onKey(e) {
    const action = Deck.action(e);
    if (!action || Deck.locked) return;
    e.preventDefault();
    const cur = document.activeElement;
    if (action === 'select') {
      if (e.repeat) return;
      if (cur === $('hudBack')) { Deck.press(cur); goBack(); return; }
      if (cur && cur._select && !cur.disabled) { Deck.press(cur); cur._select(); }
      return;
    }
    if (action === 'back') {
      if (!goBack() && !Deck.toHub()) Deck.bump(cur);
      return;
    }
    if (state.view === 'agenda') agendaKey(action, cur);
    else eventKey(action, cur);
  }

  /* ---------- timers: only while visible ---------- */
  function tick() {
    if (!state.data || document.hidden) return;
    if (dayKeyOf(Date.now()) !== state.data.today) { load({ quiet: true }); return; } // past midnight
    if (state.view === 'agenda') renderDay({ keep: 'same' });
    else if (state.current) { fillStatus(state.current); updateHud(); }
    saveBadge();
  }

  function startTimers() {
    stopTimers();
    state.tickTimer = setInterval(tick, TICK_MS);
    if (!Deck.demo) {
      state.refreshTimer = setInterval(() => {
        if (Deck.locked || document.hidden) return;
        if (state.view === 'agenda') load({ quiet: true }); else state.stale = true;
      }, REFRESH_MS);
    }
  }
  function stopTimers() {
    clearInterval(state.tickTimer);
    clearInterval(state.refreshTimer);
    state.tickTimer = state.refreshTimer = null;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopTimers(); stopSpeaking(); return; }
    startTimers();
    if (Deck.demo) { tick(); return; }
    const age = Date.now() - (Deck.store.get(CACHE_KEY, {}).savedAt || 0);
    if (age > 60000) load({ quiet: true }); else tick();
  });

  /* ---------- wiring ---------- */
  $('btnListen')._select = speakEvent;
  $('btnNext')._select = goNext;
  $('evBody')._select = () => Deck.focus($('btnListen'));

  document.addEventListener('keydown', onKey);
  document.addEventListener('click', (e) => {
    if (e.target.closest('#hudBack')) { goBack(); return; }
    const b = e.target.closest('.focusable');
    if (b && b._select && !b.disabled) b._select();
  });

  function init() {
    show('agenda');
    Deck.title('Calendar', Deck.demo ? 'Demo' : '');
    // Show the last calendar straight away (same day only), then refresh it
    if (!Deck.demo) {
      const cached = Deck.store.get(CACHE_KEY, null);
      if (cached && Array.isArray(cached.events) && cached.today) {
        state.data = cached;
        if (dayKeyOf(Date.now()) === cached.today) { apply(cached, { fromCache: true }); Deck.status('cached'); }
        else state.data = null;
      }
    }
    load({ quiet: !!state.data }).then(() => {
      if (!Deck.locked && state.view === 'agenda' && !$('agenda').contains(document.activeElement)) {
        Deck.focus(defaultFocus() || $('tabs').querySelector('.is-active'));
      }
    });
    startTimers();
  }

  init();
})();
