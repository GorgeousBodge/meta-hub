/* ==========================================================================
   api/_lib/calendar/time.js — days and times in the owner's time zone
   Vercel runs in UTC, so "today" and midnight are worked out here for
   CAL_TZ (default Europe/London), including the clock changes. No dependencies.
   ========================================================================== */
const DEFAULT_TZ = 'Europe/London';

function zone() {
  const want = String(process.env.CAL_TZ || '').trim();
  if (want) {
    try { new Intl.DateTimeFormat('en-GB', { timeZone: want }); return want; } catch { /* bad name: use default */ }
  }
  return DEFAULT_TZ;
}

const formats = new Map();
function fmt(tz) {
  if (!formats.has(tz)) {
    formats.set(tz, new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return formats.get(tz);
}

// Wall-clock parts of an instant in tz
function wall(ms, tz) {
  const o = {};
  for (const p of fmt(tz).formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second };
}

// How far tz is ahead of UTC at that instant (ms)
function offset(ms, tz) {
  const w = wall(ms, tz);
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
}

// Wall-clock time in tz -> UTC ms (handles BST / GMT changes)
function fromWall(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let t = guess - offset(guess, tz);
  const o2 = offset(t, tz);
  if (guess - o2 !== t) t = guess - o2;
  return t;
}

const pad = (n) => String(n).padStart(2, '0');
const isDay = (k) => /^\d{4}-\d{2}-\d{2}$/.test(String(k || ''));

function dayKey(ms, tz) {
  const w = wall(ms, tz);
  return `${w.y}-${pad(w.mo)}-${pad(w.d)}`;
}

function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function dayStart(key, tz) {
  const [y, m, d] = key.split('-').map(Number);
  return fromWall(y, m, d, 0, 0, 0, tz);
}

// The days to show: today and the next (days - 1), as keys and a UTC range
function span(days, tz, now = Date.now()) {
  const today = dayKey(now, tz);
  const keys = Array.from({ length: days }, (_, i) => addDays(today, i));
  return { today, keys, from: dayStart(today, tz), to: dayStart(addDays(today, days), tz) };
}

// "2026-10-30T14:00:00.0000000" as wall-clock time in tz -> UTC ms
function parseWall(str, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(str || ''));
  if (!m) return NaN;
  return fromWall(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), tz);
}

// Which of the shown days an event touches
function daysCovered(ev, keys, tz) {
  let first, last;
  if (ev.allDay) {
    first = ev.startDay;
    last = ev.endDay;
  } else {
    first = dayKey(ev.startMs, tz);
    last = dayKey(Math.max(ev.startMs, ev.endMs - 1), tz);
  }
  return keys.filter((k) => k >= first && k <= last);
}

module.exports = { zone, wall, fromWall, dayKey, addDays, dayStart, span, parseWall, daysCovered, isDay, DEFAULT_TZ };
