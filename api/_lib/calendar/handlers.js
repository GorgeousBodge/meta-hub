/* ==========================================================================
   api/_lib/calendar/handlers.js — Calendar Deck's endpoints
   (routed by api/calendar/[op].js). Read-only: nothing here can change a
   calendar. Both accounts are read side by side, so one needing attention
   doesn't stop the other.
   ========================================================================== */
const crypto = require('crypto');
const { send, num } = require('../common.js');
const accounts = require('../accounts.js');
const time = require('./time.js');

const ADAPTERS = {
  google: require('./google.js'),
  microsoft: require('./outlook.js'),
};
const PREFIX = { google: 'g', microsoft: 'o' };
const LABEL = { google: 'Google', microsoft: 'Outlook' };
const DEFAULT_DAYS = 7;
const MAX_EVENTS = 300;

// Errors from accounts.js / the adapters -> a response
function fail(res, e) {
  if (e instanceof accounts.AccountError) {
    const status = e.code === 'config' ? 500 : e.code === 'upstream' ? 502 : 409;
    return send(res, status, { error: e.message, reconnect: e.code === 'reconnect' || e.code === 'not_connected', account: e.provider });
  }
  if (e && e.status) return send(res, e.status >= 400 && e.status < 600 ? e.status : 502, { error: e.message, account: e.account });
  console.error('calendar', e);
  return send(res, 500, { error: (e && e.message) || 'Server error' });
}

function accountState(e) {
  if (e instanceof accounts.AccountError) {
    return { ok: false, connected: e.code !== 'not_connected' && e.code !== 'config', reconnect: e.code === 'reconnect', error: e.message };
  }
  return { ok: false, connected: true, error: (e && e.message) || 'Failed' };
}

async function accountEmails() {
  const out = {};
  try { for (const a of await accounts.status()) out[a.provider] = a.connected ? a.email || '' : null; } catch { /* storage down */ }
  return out;
}

const shortHash = (s) => crypto.createHash('sha256').update(s).digest('base64url').slice(0, 16);
const iso = (ms) => new Date(ms).toISOString();

// Read both accounts for `days` days from today, merged into one sorted list
async function gather(days) {
  const tz = time.zone();
  const range = time.span(days, tz);
  const emails = await accountEmails();
  const names = Object.keys(ADAPTERS);
  const results = await Promise.allSettled(names.map((n) => ADAPTERS[n].events(range, tz, emails[n] || '')));

  const state = {};
  const seen = new Set();
  const events = [];
  names.forEach((n, i) => {
    const r = results[i];
    if (r.status === 'rejected') { state[n] = { ...accountState(r.reason), label: LABEL[n] }; return; }
    state[n] = { ok: true, connected: true, label: LABEL[n], calendars: r.value.calendars, skipped: r.value.skipped };
    for (const ev of r.value.events) {
      const on = time.daysCovered(ev, range.keys, tz);
      if (!on.length) continue;
      const startMs = ev.allDay ? time.dayStart(ev.startDay, tz) : ev.startMs;
      const endMs = ev.allDay ? time.dayStart(time.addDays(ev.endDay, 1), tz) : ev.endMs;
      // The same event in two places (e.g. UK holidays on both accounts): show it once
      const dupe = `${ev.allDay ? 1 : 0}|${ev.title.toLowerCase()}|${startMs}|${endMs}`;
      if (seen.has(dupe)) continue;
      seen.add(dupe);
      const out = {
        id: `${PREFIX[n]}:${shortHash(`${n}\n${ev.raw}\n${startMs}`)}`,
        account: n,
        calendar: ev.calendar || '',
        title: ev.title,
        allDay: ev.allDay,
        start: iso(startMs),
        end: iso(endMs),
        on,
        location: ev.location,
        online: ev.online,
        organiser: ev.organiser,
        with: ev.with,
        people: ev.people,
        response: ev.response,
        free: ev.free,
        notes: ev.notes,
      };
      if (ev.allDay) { out.startDay = ev.startDay; out.endDay = ev.endDay; }
      events.push(out);
    }
  });

  events.sort((a, b) => (Date.parse(a.start) - Date.parse(b.start)) || ((b.allDay ? 1 : 0) - (a.allDay ? 1 : 0)) || a.title.localeCompare(b.title));
  return { tz, today: range.today, days: range.keys, events: events.slice(0, MAX_EVENTS), more: events.length > MAX_EVENTS, accounts: state };
}

/* ---------- GET /api/calendar/list?days=7 ---------- */
async function list(req, res) {
  const days = num(req.query && req.query.days, 1, 14) || DEFAULT_DAYS;
  const data = await gather(days);
  send(res, 200, { ...data, now: new Date().toISOString(), updated: new Date().toISOString() });
}

/* ---------- GET /api/calendar/today ----------
   For the launcher badge: timed events still to come (or on now) today,
   not counting all-day ones or ones marked as free. */
async function today(req, res) {
  const data = await gather(1);
  const now = Date.now();
  const left = data.events.filter((e) => !e.allDay && !e.free && Date.parse(e.end) > now);
  const next = left.find((e) => Date.parse(e.start) > now);
  send(res, 200, {
    count: left.length,
    more: false,
    next: next ? { title: next.title, start: next.start } : null,
    accounts: Object.fromEntries(Object.entries(data.accounts).map(([k, v]) => [k, { ok: v.ok, connected: v.connected, reconnect: !!v.reconnect }])),
  });
}

const OPS = {
  list: { method: 'GET', run: list },
  today: { method: 'GET', run: today },
};

module.exports = { OPS, fail, _test: { gather } };
