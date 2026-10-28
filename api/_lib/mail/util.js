// Small helpers shared by the Gmail and Outlook adapters.
const { oneLine } = require('./text.js');

class MailError extends Error {
  constructor(status, message, account) {
    super(message);
    this.status = status;
    this.account = account;
  }
}

// Turn a provider's failure into a short, safe message
async function providerError(r, label, account) {
  let detail = '';
  try {
    const j = await r.json();
    detail = (j.error && (j.error.message || j.error.code || j.error)) || j.message || '';
  } catch { /* no body */ }
  detail = oneLine(detail, 160);
  const err = mapError(r.status, detail, label, account);
  err.upstream = r.status; // the provider's own status, e.g. to tell "rejected" (400) from "failed" (5xx)
  return err;
}

function mapError(status, detail, label, account) {
  const r = { status };
  if (r.status === 401) return new MailError(401, `${label} sign-in expired. Reconnect on the /connect/ page.`, account);
  if (r.status === 403) return new MailError(403, `${label} refused access${detail ? `: ${detail}` : ''}. Reconnect on /connect/ and allow mail access.`, account);
  if (r.status === 404) return new MailError(404, `${label}: message not found (deleted or moved?)`, account);
  if (r.status === 429) return new MailError(429, `${label} is rate limiting. Try again in a minute.`, account);
  return new MailError(502, `${label} error ${r.status}${detail ? `: ${detail}` : ''}`, account);
}

// RFC 2047 encoded-words (=?UTF-8?B?…?= / =?…?Q?…?=), in case a header arrives encoded
function decodeWords(s) {
  return String(s || '').replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=(\s+(?==\?))?/g, (m, charset, enc, data) => {
    try {
      const bytes = enc.toUpperCase() === 'B'
        ? Buffer.from(data, 'base64')
        : Buffer.from(data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (x, h) => String.fromCharCode(parseInt(h, 16))), 'latin1');
      return new TextDecoder(charset.toLowerCase(), { fatal: false }).decode(bytes);
    } catch { return m; }
  });
}

// "Sam Lee <sam@example.com>" -> { name, address }. Takes the first address only.
function parseAddress(raw) {
  const s = oneLine(decodeWords(raw), 500);
  const angle = /^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>/.exec(s);
  if (angle) {
    const name = angle[1].trim().replace(/^"(.*)"$/, '$1').replace(/\\(.)/g, '$1').trim();
    return { name: name || '', address: angle[2].trim() };
  }
  const bare = /([^\s,;<>"]+@[^\s,;<>"]+)/.exec(s);
  return { name: '', address: bare ? bare[1] : '' };
}

const validId = (id) => typeof id === 'string' && id.length > 0 && id.length <= 600 && /^[A-Za-z0-9_\-=+/.]+$/.test(id);

module.exports = { MailError, providerError, decodeWords, parseAddress, validId };
