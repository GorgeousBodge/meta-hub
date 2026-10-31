/* ==========================================================================
   api/_lib/calendar/outlook.js — Outlook.com calendar adapter (Microsoft Graph)
   Reads every calendar on the account (Calendar, Birthdays, holidays you've
   added…), or only the main one with CAL_MAIN_ONLY=1. Times come back in
   CAL_TZ (Prefer: outlook.timezone) and notes as plain text. Uses the
   Calendars.Read permission the /connect/ sign-in already asked for.
   ========================================================================== */
const accounts = require('../accounts.js');
const { addDays, parseWall } = require('./time.js');
const { providerError, onlineFrom, placeOf, cleanNotes, oneLine, sameAddress, mainOnly, MAX_CALENDARS } = require('./util.js');

const API = 'https://graph.microsoft.com/v1.0/me';
const ACCOUNT = 'microsoft';
const LABEL = 'Outlook';
const PROVIDERS = { teamsForBusiness: 'Teams', skypeForBusiness: 'Skype', skypeForConsumer: 'Skype' };

async function call(url, tz) {
  const r = await accounts.authFetch(ACCOUNT, url.startsWith('https://') ? url : `${API}${url}`, {
    headers: { Prefer: `outlook.timezone="${tz}", outlook.body-content-type="text"` },
  });
  if (!r.ok) throw await providerError(r, LABEL, ACCOUNT);
  return r.json();
}

async function calendars(tz) {
  const main = [{ id: null, name: '', main: true }];
  if (mainOnly()) return main;
  let data;
  try {
    data = await call('/calendars?$select=id,name,isDefaultCalendar&$top=50', tz);
  } catch (e) {
    if (e instanceof accounts.AccountError || e.status === 401 || e.status === 403) throw e;
    return main;
  }
  const list = (data.value || []).slice();
  list.sort((a, b) => (b.isDefaultCalendar ? 1 : 0) - (a.isDefaultCalendar ? 1 : 0));
  const out = list.slice(0, MAX_CALENDARS).map((c) => ({
    id: c.id,
    name: c.isDefaultCalendar ? '' : oneLine(c.name, 60),
    main: !!c.isDefaultCalendar,
  }));
  return out.length ? out : main;
}

// Graph sends "2026-10-30T14:00:00.0000000" plus the zone it used
function instant(t, tz) {
  if (!t || !t.dateTime) return NaN;
  if (/^(UTC|GMT|Etc\/UTC)$/i.test(String(t.timeZone || ''))) return Date.parse(`${String(t.dateTime).slice(0, 19)}Z`);
  return parseWall(t.dateTime, tz);
}

function normalise(e, cal, tz, self) {
  if (!e || e.isCancelled) return null;
  const response = e.responseStatus && e.responseStatus.response;
  if (response === 'declined') return null;

  let when;
  if (e.isAllDay) {
    const startDay = String((e.start && e.start.dateTime) || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDay)) return null;
    const endRaw = String((e.end && e.end.dateTime) || '').slice(0, 10);
    let endDay = /^\d{4}-\d{2}-\d{2}$/.test(endRaw) ? addDays(endRaw, -1) : startDay; // end is midnight after
    if (endDay < startDay) endDay = startDay;
    when = { allDay: true, startDay, endDay };
  } else {
    const s = instant(e.start, tz);
    let en = instant(e.end, tz);
    if (!Number.isFinite(s)) return null;
    if (!Number.isFinite(en) || en < s) en = s;
    when = { allDay: false, startMs: s, endMs: en };
  }

  const org = e.organizer && e.organizer.emailAddress;
  const people = (Array.isArray(e.attendees) ? e.attendees : []).filter((a) => {
    const ad = a && a.emailAddress;
    return ad && a.type !== 'resource' && !sameAddress(ad.address, self);
  });
  const loc = (e.location && e.location.displayName) || '';
  const body = e.body && e.body.content;
  return {
    raw: String(e.id || ''),
    account: ACCOUNT,
    calendar: cal.name,
    title: oneLine(e.subject, 200) || '(No title)',
    ...when,
    location: placeOf(loc),
    online: e.isOnlineMeeting ? PROVIDERS[e.onlineMeetingProvider] || onlineFrom(body) || 'Online' : onlineFrom(loc) || onlineFrom(body),
    organiser: !e.isOrganizer && org && !sameAddress(org.address, self) ? oneLine(org.name || org.address, 120) : '',
    with: people.slice(0, 4).map((a) => oneLine(a.emailAddress.name || a.emailAddress.address, 80)).filter(Boolean),
    people: people.length,
    response: ({ tentativelyAccepted: 'tentative', notResponded: 'invited' })[response] || '',
    free: e.showAs === 'free',
    notes: cleanNotes(body),
  };
}

async function eventsFor(cal, range, tz, self) {
  const base = cal.id ? `/calendars/${encodeURIComponent(cal.id)}/calendarView` : '/calendarView';
  const q = new URLSearchParams({
    startDateTime: new Date(range.from).toISOString(),
    endDateTime: new Date(range.to).toISOString(),
    $top: '100',
    $orderby: 'start/dateTime',
    $select: 'id,subject,start,end,isAllDay,isCancelled,location,body,showAs,responseStatus,organizer,isOrganizer,attendees,isOnlineMeeting,onlineMeetingProvider',
  });
  const out = [];
  let url = `${base}?${q}`;
  for (let page = 0; page < 4 && url; page++) {
    const data = await call(url, tz);
    for (const e of data.value || []) {
      const n = normalise(e, cal, tz, self);
      if (n) out.push(n);
    }
    const next = data['@odata.nextLink'];
    url = typeof next === 'string' && next.startsWith('https://graph.microsoft.com/') ? next : null;
  }
  return out;
}

async function events(range, tz, self) {
  const cals = await calendars(tz);
  const results = await Promise.allSettled(cals.map((c) => eventsFor(c, range, tz, self)));
  const mainIdx = cals.findIndex((c) => c.main);
  if (mainIdx >= 0 && results[mainIdx].status === 'rejected') throw results[mainIdx].reason;
  if (results.every((r) => r.status === 'rejected')) throw results[0].reason;
  const list = [];
  let skipped = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') list.push(...r.value); else skipped += 1;
  }
  return { events: list, calendars: cals.length, skipped };
}

module.exports = { events, _test: { normalise } };
