/* ==========================================================================
   api/_lib/calendar/util.js — small helpers shared by the Google and Outlook
   calendar adapters: safe errors, places, online-meeting labels and notes.
   Event text is untrusted: it only ever reaches the glasses as plain text.
   ========================================================================== */
const { readable, oneLine } = require('../mail/text.js');

const MAX_NOTES = 1500;       // characters of an event's notes sent to the glasses
const MAX_CALENDARS = 12;     // per account

const mainOnly = () => String(process.env.CAL_MAIN_ONLY || '').trim() === '1';

class CalError extends Error {
  constructor(status, message, account) {
    super(message);
    this.status = status;
    this.account = account;
  }
}

// A provider's failure -> a short message, never anything secret
async function providerError(r, label, account) {
  let detail = '';
  try {
    const j = await r.json();
    detail = (j.error && (j.error.message || j.error.code || j.error)) || j.message || '';
  } catch { /* no body */ }
  detail = oneLine(detail, 160);
  let err;
  if (r.status === 401) err = new CalError(401, `${label} sign-in expired. Reconnect on the /connect/ page.`, account);
  else if (r.status === 403) err = new CalError(403, `${label} refused calendar access${detail ? `: ${detail}` : ''}. Reconnect on /connect/ and allow calendar access.`, account);
  else if (r.status === 404) err = new CalError(404, `${label}: calendar not found`, account);
  else if (r.status === 429) err = new CalError(429, `${label} is rate limiting. Try again in a minute.`, account);
  else err = new CalError(502, `${label} error ${r.status}${detail ? `: ${detail}` : ''}`, account);
  err.upstream = r.status;
  return err;
}

// Which video service a link or location points at
function onlineFrom(text) {
  const s = String(text || '');
  if (/teams\.microsoft\.com|teams\.live\.com/i.test(s)) return 'Teams';
  if (/zoom\.us\//i.test(s)) return 'Zoom';
  if (/meet\.google\.com/i.test(s)) return 'Google Meet';
  if (/webex\.com/i.test(s)) return 'Webex';
  return '';
}

// A location to show: one line, no web addresses, no "Microsoft Teams Meeting"
function placeOf(loc) {
  const s = oneLine(loc, 200)
    .replace(/<?https?:\/\/\S+>?/gi, '')
    .replace(/^\s*(?:Microsoft Teams Meeting|Zoom Meeting|Google Meet|Online)\s*;?\s*/i, '')
    .replace(/\s*;\s*$/, '')
    .trim();
  return s.slice(0, 160);
}

// Joining instructions that video services paste into invites: dropped
const INVITE_CUTS = [
  /^_{8,}\s*$/m,                                   // Teams' rule above "Microsoft Teams meeting"
  /^Microsoft Teams (?:meeting|Need help)/im,
  /^Join (?:on your computer|Zoom Meeting|with Google Meet|by phone|the meeting)/im,
  /^-::~[:~]+/m,                                    // Google's invite separator
  /^Meeting ID:/im,
  /^Invitation from Google Calendar/im,
];

function cleanNotes(raw) {
  const s = String(raw || '');
  if (!s.trim()) return '';
  const html = /<\/?[a-z][\s\S]*>/i.test(s);
  let t = readable(html ? { html: s } : { text: s });
  let cut = t.length;
  for (const re of INVITE_CUTS) {
    const m = re.exec(t);
    if (m && m.index < cut) cut = m.index;
  }
  t = t.slice(0, cut).replace(/\[link\]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (t.length > MAX_NOTES) t = `${t.slice(0, MAX_NOTES).replace(/\s+\S*$/, '')}…`;
  return t;
}

const sameAddress = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

module.exports = { CalError, providerError, onlineFrom, placeOf, cleanNotes, oneLine, sameAddress, mainOnly, MAX_CALENDARS };
