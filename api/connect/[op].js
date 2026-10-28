// Account connections: one Vercel function shared by Mail and Calendar.
//   GET  /api/connect/status              accounts, storage check and the redirect address (APP_CODE)
//   GET  /api/connect/start?provider=…    send the browser to Google / Microsoft sign-in (APP_CODE)
//   GET  /api/connect/callback            where Google / Microsoft send the browser back
//   POST /api/connect/disconnect          forget an account (APP_CODE)
// The callback can't carry the access code (the provider calls it), so it's protected
// instead by the single-use state saved by /start plus a matching cookie in the browser.
const { send, allowed } = require('../_lib/common.js');
const accounts = require('../_lib/accounts.js');
const store = require('../_lib/store.js');

const COOKIE = 'deck_oauth';

function redirect(res, location, cookie) {
  res.setHeader('Cache-Control', 'no-store');
  if (cookie) res.setHeader('Set-Cookie', cookie);
  res.setHeader('Location', location);
  res.status(302).end();
}

// Only short, plain text goes back into the page address
const safeMsg = (s) => String(s || 'Something went wrong').replace(/[^\w .,:;'()—\-/@]/g, '').slice(0, 220);
const backToPage = (res, params, clear) => redirect(
  res,
  `/connect/?${new URLSearchParams(params)}`,
  clear ? `${COOKIE}=; Path=/api/connect; HttpOnly; Secure; SameSite=Lax; Max-Age=0` : undefined,
);

function readCookie(req, name) {
  const all = String(req.headers.cookie || '');
  for (const part of all.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}

const OPS = {
  async status(req, res) {
    if (req.method !== 'GET') return send(res, 405, { error: 'GET only' });
    const storage = store.info();
    send(res, 200, {
      storage,
      redirectUri: accounts.redirectUri(req),
      accounts: await accounts.status(),
    });
  },

  async start(req, res) {
    if (req.method !== 'GET') return send(res, 405, { error: 'GET only' });
    const name = String(req.query.provider || '');
    if (!accounts.PROVIDERS[name]) return backToPage(res, { error: 'Unknown account type' });
    try {
      const { url, state } = await accounts.beginSignIn(name, req);
      redirect(res, url, `${COOKIE}=${state}; Path=/api/connect; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
    } catch (e) {
      backToPage(res, { error: safeMsg(e.message) });
    }
  },

  async callback(req, res) {
    if (req.method !== 'GET') return send(res, 405, { error: 'GET only' });
    const q = req.query || {};
    if (q.error) {
      const msg = q.error === 'access_denied' ? 'Sign-in was cancelled' : `Sign-in failed: ${q.error}`;
      return backToPage(res, { error: safeMsg(msg) }, true);
    }
    const state = String(q.state || '');
    if (!state || readCookie(req, COOKIE) !== state) {
      return backToPage(res, { error: 'Sign-in must be started from the connect page in this browser' }, true);
    }
    try {
      const { provider, email } = await accounts.finishSignIn(state, q.code);
      backToPage(res, { connected: provider, email: safeMsg(email) }, true);
    } catch (e) {
      backToPage(res, { error: safeMsg(e.message) }, true);
    }
  },

  async disconnect(req, res) {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const name = String(body.provider || req.query.provider || '');
    if (!accounts.PROVIDERS[name]) return send(res, 400, { error: 'Unknown account type' });
    try {
      await accounts.disconnect(name);
      send(res, 200, { ok: true, accounts: await accounts.status() });
    } catch (e) {
      send(res, 502, { error: e.message });
    }
  },
};

module.exports = async (req, res) => {
  const op = String((req.query && req.query.op) || '');
  const handler = OPS[op];
  if (!handler) return send(res, 404, { error: 'Unknown connect endpoint' });
  // Every step except the provider's callback needs the access code.
  // { required: true }: without APP_CODE set in Vercel, nothing here runs at all.
  if (op !== 'callback' && !allowed(req, res, { required: true })) return;
  try {
    await handler(req, res);
  } catch (e) {
    console.error('connect', op, e.message);
    if (!res.headersSent) send(res, 500, { error: e.message });
  }
};
