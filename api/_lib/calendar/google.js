/* ==========================================================================
   api/_lib/calendar/google.js — Google Calendar adapter (REST, read-only)
   Reads every calendar ticked in Google Calendar's sidebar (your own, holidays,
   shared ones), or only the main one with CAL_MAIN_ONLY=1. Uses the
   calendar.readonly scope the /connect/ sign-in already asked for.
   ========================================================================== */
const accounts = require('../accounts.js');
const { addDays } = require('./time.js');
const { providerError, onlineFrom, placeOf, cleanNotes, oneLine, mainOnly, MAX_CALENDARS } = require('./util.js');

const API = 'https://www.googleapis.com/calendar/v3';
const ACCOUNT = 'google';
const LABEL = 'Google';

async function call(url) {
  const r = await accounts.authFetch(ACCOUNT, url);
  if (!r.ok) throw await providerError(r, LABEL, ACCOUNT);
  return r.json();
}

async function calendars() {
  const main = [{ id: 'primary', name: '', main: true }];
  if (mainOnly()) return main;
  const q = new URLSearchParams({
    minAccessRole: 'reader',
    maxResults: '100',
    fields: 'items(id,summary,summaryOverride,primary,selected,hidden)',
  });
  let data;
  try {
    data = await call(`${API}/users/me/calendarList?${q}`);
  } catch (e) {
    if (e instanceof accounts.AccountError || e.status === 401 || e.status === 403) throw e;
    return main; // list unavailable: the main calendar still works
  }
  const list = (data.items || []).filter((c) => c.primary || (c.selected && !c.hidden));
  list.sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
  const out = list.slice(0, MAX_CALENDARS).map((c) => ({
    id: c.id,
    name: c.primary ? '' : oneLine(c.summaryOverride || c.summary, 60),
    main: !!c.primary,
  }));
  return out.length ? out : main;
}

function normalise(e, cal) {
  if (!e || e.status === 'cancelled' || e.eventType === 'workingLocation') return null;
  const attendees = Array.isArray(e.attendees) ? e.attendees : [];
  const me = attendees.find((a) => a.self);
  if (me && me.responseStatus === 'declined') return null;

  let when;
  if (e.start && e.start.date) {
    const startDay = e.start.date;
    let endDay = addDays((e.end && e.end.date) || startDay, -1); // Google's end date is exclusive
    if (endDay < startDay) endDay = startDay;
    when = { allDay: true, startDay, endDay };
  } else {
    const s = Date.parse(e.start && e.start.dateTime);
    let en = Date.parse(e.end && e.end.dateTime);
    if (!Number.isFinite(s)) return null;
    if (!Number.isFinite(en) || en < s) en = s;
    when = { allDay: false, startMs: s, endMs: en };
  }

  const people = attendees.filter((a) => !a.self && !a.resource);
  const conf = e.conferenceData && e.conferenceData.conferenceSolution && e.conferenceData.conferenceSolution.name;
  const organiser = e.organizer && !e.organizer.self ? oneLine(e.organizer.displayName || e.organizer.email, 120) : '';
  return {
    raw: String(e.id || ''),
    account: ACCOUNT,
    calendar: cal.name,
    title: oneLine(e.summary, 200) || '(No title)',
    ...when,
    location: placeOf(e.location),
    online: e.hangoutLink ? 'Google Meet' : oneLine(conf, 30) || onlineFrom(e.location) || onlineFrom(e.description),
    organiser,
    with: people.slice(0, 4).map((a) => oneLine(a.displayName || a.email, 80)).filter(Boolean),
    people: people.length,
    response: me ? ({ tentative: 'tentative', needsAction: 'invited' })[me.responseStatus] || '' : '',
    free: e.transparency === 'transparent',
    notes: cleanNotes(e.description),
  };
}

async function eventsFor(cal, range, tz) {
  const out = [];
  let pageToken = '';
  for (let page = 0; page < 3; page++) {
    const q = new URLSearchParams({
      timeMin: new Date(range.from).toISOString(),
      timeMax: new Date(range.to).toISOString(),
      singleEvents: 'true',            // repeating events come back as separate dates
      orderBy: 'startTime',
      maxResults: '250',
      timeZone: tz,
      fields: 'nextPageToken,items(id,status,summary,location,description,start,end,transparency,eventType,hangoutLink,' +
        'attendees(self,resource,responseStatus,displayName,email),organizer(self,displayName,email),conferenceData(conferenceSolution(name)))',
    });
    if (pageToken) q.set('pageToken', pageToken);
    const data = await call(`${API}/calendars/${encodeURIComponent(cal.id)}/events?${q}`);
    for (const e of data.items || []) {
      const n = normalise(e, cal);
      if (n) out.push(n);
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

// All events in the range, from every calendar shown. One calendar failing
// (e.g. a shared one you've lost access to) doesn't stop the rest; the main
// calendar failing does, so the app can say what's wrong.
async function events(range, tz) {
  const cals = await calendars();
  const results = await Promise.allSettled(cals.map((c) => eventsFor(c, range, tz)));
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
