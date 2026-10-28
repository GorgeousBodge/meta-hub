/* ==========================================================================
   api/_lib/mail/gmail.js — Gmail API adapter (REST, no SDK)
   Inbox: Primary tab only, unless MAIL_ALL_INBOX=1 is set in Vercel.
   ========================================================================== */
const accounts = require('../accounts.js');
const { providerError, decodeWords, parseAddress } = require('./util.js');
const { decode, oneLine } = require('./text.js');

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const ACCOUNT = 'google';
const LABEL = 'Gmail';
const inboxQuery = () => (process.env.MAIL_ALL_INBOX === '1' ? 'in:inbox' : 'in:inbox category:primary');

async function gget(path) {
  const r = await accounts.authFetch(ACCOUNT, `${API}${path}`);
  if (!r.ok) throw await providerError(r, LABEL, ACCOUNT);
  return r.json();
}

async function gpost(path, body) {
  const r = await accounts.authFetch(ACCOUNT, `${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw await providerError(r, LABEL, ACCOUNT);
  return r.json();
}

const header = (headers, name) => {
  const h = (headers || []).find((x) => String(x.name).toLowerCase() === name.toLowerCase());
  return h ? decodeWords(h.value) : '';
};

async function listInbox(max = 20) {
  const q = new URLSearchParams({ maxResults: String(max), q: inboxQuery() });
  const list = await gget(`/messages?${q}`);
  const ids = (list.messages || []).map((m) => m.id);
  const meta = await Promise.all(ids.map((id) =>
    gget(`/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`)
      .catch(() => null)));
  return meta.filter(Boolean).map((m) => ({
    id: m.id,
    account: ACCOUNT,
    from: parseAddress(header(m.payload && m.payload.headers, 'From')),
    subject: oneLine(header(m.payload && m.payload.headers, 'Subject')) || '(no subject)',
    date: new Date(Number(m.internalDate) || Date.now()).toISOString(),
    unread: (m.labelIds || []).includes('UNREAD'),
    snippet: oneLine(decode(m.snippet || ''), 160),
  }));
}

async function unreadCount() {
  const q = new URLSearchParams({ maxResults: '100', q: `${inboxQuery()} is:unread` });
  const list = await gget(`/messages?${q}`);
  const n = (list.messages || []).length;
  return { count: n, more: !!list.nextPageToken };
}

/* ---------- reading ---------- */
function partText(part) {
  if (!part || !part.body || !part.body.data) return '';
  const bytes = Buffer.from(part.body.data, 'base64url');
  const ct = header(part.headers, 'Content-Type');
  const charset = (/charset="?([^";\s]+)/i.exec(ct) || [])[1] || 'utf-8';
  try { return new TextDecoder(charset.toLowerCase(), { fatal: false }).decode(bytes); } catch { return bytes.toString('utf8'); }
}

// First text/plain and text/html parts that aren't attachments
function findBodies(payload) {
  const out = { text: '', html: '' };
  const walk = (p, depth) => {
    if (!p || depth > 12) return;
    const disp = header(p.headers, 'Content-Disposition');
    const isAttachment = /attachment/i.test(disp) || (p.filename && p.filename.length > 0);
    if (!isAttachment) {
      if (p.mimeType === 'text/plain' && !out.text) out.text = partText(p);
      else if (p.mimeType === 'text/html' && !out.html) out.html = partText(p);
    }
    (p.parts || []).forEach((c) => walk(c, depth + 1));
  };
  walk(payload, 0);
  return out;
}

async function getMessage(id) {
  const m = await gget(`/messages/${encodeURIComponent(id)}?format=full`);
  const h = (m.payload && m.payload.headers) || [];
  const bodies = findBodies(m.payload);
  const from = parseAddress(header(h, 'From'));
  const replyTo = header(h, 'Reply-To') ? parseAddress(header(h, 'Reply-To')) : from;
  return {
    id: m.id,
    account: ACCOUNT,
    threadId: m.threadId,
    from,
    replyTo: replyTo.address ? replyTo : from,
    subject: oneLine(header(h, 'Subject')) || '(no subject)',
    date: new Date(Number(m.internalDate) || Date.now()).toISOString(),
    unread: (m.labelIds || []).includes('UNREAD'),
    messageId: oneLine(header(h, 'Message-ID') || header(h, 'Message-Id'), 998),
    references: oneLine(header(h, 'References'), 4000),
    html: bodies.html,
    text: bodies.text,
  };
}

async function markRead(id) {
  await gpost(`/messages/${encodeURIComponent(id)}/modify`, { removeLabelIds: ['UNREAD'] });
}

/* ---------- sending a reply (RFC 5322 message, base64url) ---------- */
const noBreaks = (s) => String(s || '').replace(/[\r\n\u0000]+/g, ' ').trim(); // no header injection

// RFC 2047 encoded-word when needed, split so no word passes 75 characters
function encodeHeader(value) {
  const v = noBreaks(value);
  if (/^[\x20-\x7E]*$/.test(v)) return v;
  const words = [];
  let chunk = '';
  for (const ch of v) {
    if (Buffer.byteLength(chunk + ch, 'utf8') > 45) { words.push(chunk); chunk = ''; }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join('\r\n ');
}

function formatAddress({ name, address }) {
  const addr = noBreaks(address).replace(/[<>",;\s]/g, '');
  if (!name) return addr;
  const n = noBreaks(name);
  const display = /^[\x20-\x7E]*$/.test(n) ? `"${n.replace(/["\\]/g, '\\$&')}"` : encodeHeader(n);
  return `${display} <${addr}>`;
}

const replySubject = (s) => (/^\s*re\s*:/i.test(s) ? noBreaks(s) : `Re: ${noBreaks(s)}`);

function buildReply(orig, text, fromEmail) {
  const refs = [orig.references, orig.messageId].filter(Boolean).join(' ').trim();
  const body = Buffer.from(String(text).replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n');
  const lines = [
    fromEmail ? `From: ${formatAddress({ name: '', address: fromEmail })}` : null,
    `To: ${formatAddress(orig.replyTo)}`,
    `Subject: ${encodeHeader(replySubject(orig.subject))}`,
    orig.messageId ? `In-Reply-To: ${noBreaks(orig.messageId)}` : null,
    refs ? `References: ${noBreaks(refs)}` : null,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
  ].filter(Boolean);
  return `${lines.join('\r\n')}\r\n\r\n${body}`;
}

async function sendReply(orig, text, fromEmail) {
  if (!orig.replyTo || !orig.replyTo.address) throw new Error('No address to reply to');
  const raw = Buffer.from(buildReply(orig, text, fromEmail), 'utf8').toString('base64url');
  const sent = await gpost('/messages/send', { raw, threadId: orig.threadId });
  return { id: sent.id };
}

module.exports = { listInbox, unreadCount, getMessage, markRead, sendReply, _test: { buildReply, encodeHeader, formatAddress, findBodies } };
