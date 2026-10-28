/* ==========================================================================
   api/_lib/mail/handlers.js — Mail Deck's endpoints (routed by api/mail/[op].js)

   Message ids the app sees are prefixed with the account: "g:<gmail id>" or
   "o:<graph id>". Every send works out the recipient and thread again from the
   mailbox itself, so the app can't be tricked into sending somewhere else.
   ========================================================================== */
const { send } = require('../common.js');
const accounts = require('../accounts.js');
const store = require('../store.js');
const { readable, isLong, oneLine } = require('./text.js');
const { validId } = require('./util.js');
const ai = require('./ai.js');

const ADAPTERS = {
  google: require('./gmail.js'),
  microsoft: require('./outlook.js'),
};
const PREFIX = { google: 'g', microsoft: 'o' };
const LABEL = { google: 'Gmail', microsoft: 'Outlook' };
const SUMMARY_TTL = 7 * 86400;
const MAX_REPLY = 8000;

const env = (n) => String(process.env[n] || '').trim();

function parseId(id) {
  const m = /^([go]):(.+)$/.exec(String(id || ''));
  if (!m || !validId(m[2])) return null;
  return { account: m[1] === 'g' ? 'google' : 'microsoft', raw: m[2] };
}
const wrapId = (account, raw) => `${PREFIX[account]}:${raw}`;

function bodyOf(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

// Errors from accounts.js / the adapters -> a response
function fail(res, e) {
  if (e instanceof accounts.AccountError) {
    const status = e.code === 'config' ? 500 : e.code === 'upstream' ? 502 : 409;
    return send(res, status, { error: e.message, reconnect: e.code === 'reconnect' || e.code === 'not_connected', account: e.provider });
  }
  if (e && e.status) return send(res, e.status >= 400 && e.status < 600 ? e.status : 502, { error: e.message, account: e.account });
  console.error('mail', e);
  return send(res, 500, { error: (e && e.message) || 'Server error' });
}

async function accountEmails() {
  const out = {};
  try { for (const a of await accounts.status()) out[a.provider] = a.connected ? a.email || '' : null; } catch { /* storage down */ }
  return out;
}

function accountState(e) {
  if (e instanceof accounts.AccountError) {
    return { ok: false, connected: e.code !== 'not_connected' && e.code !== 'config', reconnect: e.code === 'reconnect', error: e.message };
  }
  return { ok: false, connected: true, error: (e && e.message) || 'Failed' };
}

/* ---------- GET /api/mail/list ---------- */
async function list(req, res) {
  const names = Object.keys(ADAPTERS);
  const [lists, counts] = await Promise.all([
    Promise.allSettled(names.map((n) => ADAPTERS[n].listInbox(20))),
    Promise.allSettled(names.map((n) => ADAPTERS[n].unreadCount())),
  ]);
  const items = [];
  const state = {};
  let total = 0;
  let more = false;
  names.forEach((n, i) => {
    if (lists[i].status === 'fulfilled') {
      state[n] = { ok: true, connected: true, label: LABEL[n] };
      for (const m of lists[i].value) items.push({ ...m, id: wrapId(n, m.id) });
    } else {
      state[n] = { ...accountState(lists[i].reason), label: LABEL[n] };
    }
    if (counts[i].status === 'fulfilled') {
      state[n].unread = counts[i].value.count;
      state[n].unreadMore = counts[i].value.more;
      total += counts[i].value.count;
      more = more || counts[i].value.more;
    }
  });
  items.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  send(res, 200, { items, accounts: state, unread: { total, more }, updated: new Date().toISOString() });
}

/* ---------- GET /api/mail/unread ---------- */
async function unread(req, res) {
  const names = Object.keys(ADAPTERS);
  const counts = await Promise.allSettled(names.map((n) => ADAPTERS[n].unreadCount()));
  const state = {};
  let total = 0;
  let more = false;
  names.forEach((n, i) => {
    if (counts[i].status === 'fulfilled') {
      state[n] = { ok: true, count: counts[i].value.count, more: counts[i].value.more };
      total += counts[i].value.count;
      more = more || counts[i].value.more;
    } else {
      state[n] = accountState(counts[i].reason);
    }
  });
  send(res, 200, { total, more, count: total, accounts: state });
}

/* ---------- reading ---------- */
async function load(id) {
  const p = parseId(id);
  if (!p) { const e = new Error('Bad message id'); e.status = 400; throw e; }
  const msg = await ADAPTERS[p.account].getMessage(p.raw);
  return { p, msg, body: readable(msg) };
}

// GET /api/mail/read?id=…
async function read(req, res) {
  const { p, msg, body } = await load(req.query.id);
  const emails = await accountEmails();
  send(res, 200, {
    id: wrapId(p.account, msg.id),
    account: p.account,
    accountLabel: LABEL[p.account],
    accountEmail: emails[p.account] || '',
    from: msg.from,
    replyTo: msg.replyTo,
    subject: msg.subject,
    date: msg.date,
    unread: msg.unread,
    text: body,
    long: isLong(body),
    ai: ai.enabled(),
// MAIL_SIGN_OFF: use | (or \n) for a new line, e.g. "Kind regards|Russ"
    signOff: env('MAIL_SIGN_OFF').split(/\\n|\|/).map((l) => oneLine(l, 60)).filter(Boolean).slice(0, 3).join('\n'),
  });
}

// POST /api/mail/seen  { id }   mark as read
async function seen(req, res) {
  const p = parseId(bodyOf(req).id);
  if (!p) return send(res, 400, { error: 'Bad message id' });
  await ADAPTERS[p.account].markRead(p.raw);
  send(res, 200, { ok: true });
}

// POST /api/mail/summary  { id }   cached (encrypted) for a week
async function summary(req, res) {
  const id = bodyOf(req).id;
  const p = parseId(id);
  if (!p) return send(res, 400, { error: 'Bad message id' });
  const key = `mail:sum:${store.hashId(id)}`;
  try {
    const hit = await store.get(key);
    if (hit) return send(res, 200, { ...hit, cached: true });
  } catch { /* cache unavailable: carry on */ }
  const { msg, body } = await load(id);
  const out = await ai.summarise(msg, body);
  try { await store.set(key, out, { ttl: SUMMARY_TTL }); } catch { /* fine */ }
  send(res, 200, { ...out, cached: false });
}

// POST /api/mail/suggest  { id }
async function suggest(req, res) {
  const { msg, body } = await load(bodyOf(req).id);
  send(res, 200, { replies: await ai.suggest(msg, body) });
}

// POST /api/mail/tidy  { id, text }
async function tidy(req, res) {
  const b = bodyOf(req);
  const draft = String(b.text || '').trim();
  if (!draft) return send(res, 400, { error: 'Nothing to tidy' });
  if (draft.length > 4000) return send(res, 400, { error: 'Draft too long to tidy' });
  const { msg, body } = await load(b.id);
  send(res, 200, { text: (await ai.tidy(msg, body, draft)) || draft });
}

// POST /api/mail/send  { id, text }   reply in the same thread, from the same account
async function sendReply(req, res) {
  const b = bodyOf(req);
  const text = String(b.text || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return send(res, 400, { error: 'The reply is empty' });
  if (text.length > MAX_REPLY) return send(res, 400, { error: 'The reply is too long' });
  const p = parseId(b.id);
  if (!p) return send(res, 400, { error: 'Bad message id' });

  // Guard against a double pinch or a retried request sending twice
  const dedupe = `mail:sent:${store.hashId(`${b.id}\n${text}`)}`;
  if (!(await store.setOnce(dedupe, { at: Date.now() }, { ttl: 600 }))) {
    return send(res, 409, { error: 'That reply was already sent' });
  }
  try {
    const { msg } = await load(b.id);
    const emails = await accountEmails();
    await ADAPTERS[p.account].sendReply(msg, text, emails[p.account] || '');
    send(res, 200, { ok: true, account: p.account, from: emails[p.account] || '', to: msg.replyTo });
  } catch (e) {
    try { await store.del(dedupe); } catch { /* ignore */ }
    throw e;
  }
}

const OPS = {
  list: { method: 'GET', run: list },
  unread: { method: 'GET', run: unread },
  read: { method: 'GET', run: read },
  seen: { method: 'POST', run: seen },
  summary: { method: 'POST', run: summary },
  suggest: { method: 'POST', run: suggest },
  tidy: { method: 'POST', run: tidy },
  send: { method: 'POST', run: sendReply },
};

module.exports = { OPS, fail, _test: { parseId } };
