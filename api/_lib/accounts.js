/* ==========================================================================
   api/_lib/accounts.js — the connected Gmail and Outlook.com accounts
   Shared by Mail and Calendar. See docs/ACCOUNTS.md for the setup.

   Everything an app needs:
     const accounts = require('../accounts.js');        // path from api/_lib/<app>/
     const token = await accounts.getAccessToken('google');     // or 'microsoft'
     const r = await accounts.authFetch('microsoft', 'https://graph.microsoft.com/v1.0/me/events');
     await accounts.status();   // [{ provider, label, configured, connected, email, needsReconnect, … }]

   getAccessToken() returns a working access token, refreshing it when it is
   within a minute of expiry and saving any new refresh token the provider hands
   back (Microsoft rotates them on every refresh; each one lasts 90 days, so
   regular use keeps the account connected indefinitely).

   Errors are AccountError with .code:
     'config'         client id/secret or storage not set up in Vercel
     'not_connected'  never connected (or disconnected) on /connect/
     'reconnect'      the provider refused the refresh token: connect again
     'upstream'       the provider's token service failed; try again later

   Environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
   MS_CLIENT_ID, MS_CLIENT_SECRET, plus the storage ones in store.js.
   Optional OAUTH_REDIRECT_BASE (e.g. https://meta-deck.vercel.app) pins the
   redirect address instead of taking it from the request.
   ========================================================================== */
const crypto = require('crypto');
const store = require('./store.js');

const TIMEOUT_MS = 12000;
const STATE_TTL = 600; // seconds a sign-in may take
const env = (name) => String(process.env[name] || '').trim();

/* ---------- providers ----------
   Scopes are requested once, for Mail and Calendar together, so Calendar
   needs no second sign-in. Narrowest that do the job:
     Google     gmail.modify (read, mark read, send; no permanent delete),
                calendar.readonly, openid + email (to show which account)
     Microsoft  Mail.ReadWrite (read, mark read), Mail.Send, Calendars.Read,
                User.Read (to show which account), offline_access (refresh tokens) */
const PROVIDERS = {
  google: {
    label: 'Gmail',
    clientId: () => env('GOOGLE_CLIENT_ID'),
    secret: () => env('GOOGLE_CLIENT_SECRET'),
    vars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    revoke: 'https://oauth2.googleapis.com/revoke',
    scopes: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/calendar.readonly',
    ],
    // offline + consent: always hand back a refresh token
    extra: { access_type: 'offline', prompt: 'consent' },
  },
  microsoft: {
    label: 'Outlook',
    clientId: () => env('MS_CLIENT_ID'),
    secret: () => env('MS_CLIENT_SECRET'),
    vars: ['MS_CLIENT_ID', 'MS_CLIENT_SECRET'],
    // "consumers": personal Microsoft accounts (Outlook.com, Hotmail, Live) only
    authorize: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
    scopes: ['offline_access', 'openid', 'User.Read', 'Mail.ReadWrite', 'Mail.Send', 'Calendars.Read'],
    extra: { response_mode: 'query', prompt: 'select_account' },
  },
};
const NAMES = Object.keys(PROVIDERS);

class AccountError extends Error {
  constructor(code, message, provider) {
    super(message);
    this.code = code;
    this.provider = provider;
  }
}

function provider(name) {
  const p = PROVIDERS[name];
  if (!p) throw new AccountError('config', `Unknown account "${String(name).slice(0, 20)}"`, name);
  return p;
}

const recordKey = (name) => `account:${name}`;
const isConfigured = (name) => !!(PROVIDERS[name] && PROVIDERS[name].clientId() && PROVIDERS[name].secret());

function requireSetup(name) {
  const p = provider(name);
  if (!p.clientId() || !p.secret()) throw new AccountError('config', `${p.vars.join(' and ')} not set in Vercel`, name);
  const s = store.info();
  if (!s.configured) throw new AccountError('config', `Storage not ready: ${s.keyError || `missing ${s.missing.join(', ')}`}`, name);
  return p;
}

/* ---------- redirect address ---------- */
function baseUrl(req) {
  const pinned = env('OAUTH_REDIRECT_BASE').replace(/\/+$/, '');
  if (pinned) return pinned;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return `${proto}://${host}`;
}
const redirectUri = (req) => `${baseUrl(req)}/api/connect/callback`;

/* ---------- token endpoint ---------- */
async function tokenRequest(p, name, params) {
  const body = new URLSearchParams({ client_id: p.clientId(), client_secret: p.secret(), ...params });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let r;
  try {
    r = await fetch(p.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new AccountError('upstream', `${p.label} sign-in service unreachable${e.name === 'AbortError' ? ' (timed out)' : ''}`, name);
  } finally {
    clearTimeout(t);
  }
  let data = {};
  try { data = await r.json(); } catch { /* keep {} */ }
  if (!r.ok || !data.access_token) {
    const code = String(data.error || r.status);
    // Short, safe description (no tokens are ever in an error body)
    const desc = String(data.error_description || '').split(/\r?\n/)[0].slice(0, 160);
    const err = new AccountError(
      code === 'invalid_grant' || code === 'invalid_client' ? (code === 'invalid_client' ? 'config' : 'reconnect') : 'upstream',
      `${p.label}: ${code}${desc ? ` — ${desc}` : ''}`,
      name,
    );
    err.oauthError = code;
    throw err;
  }
  return data;
}

function decodeJwtPayload(jwt) {
  try { return JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8')); } catch { return {}; }
}

async function lookupEmail(name, tokens) {
  if (name === 'google') return decodeJwtPayload(tokens.id_token).email || '';
  try {
    const r = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return '';
    const me = await r.json();
    return me.mail || me.userPrincipalName || '';
  } catch { return ''; }
}

/* ---------- sign-in (used by api/connect) ---------- */
// Step 1: build the provider's sign-in address. The state is random, stored for
// ten minutes and usable once; PKCE ties the returned code to this sign-in.
async function beginSignIn(name, req) {
  const p = requireSetup(name);
  const state = crypto.randomBytes(24).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const redirect = redirectUri(req);
  await store.set(`oauth:${state}`, { provider: name, verifier, redirect, at: Date.now() }, { ttl: STATE_TTL });
  const q = new URLSearchParams({
    client_id: p.clientId(),
    response_type: 'code',
    redirect_uri: redirect,
    scope: p.scopes.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...p.extra,
  });
  return { url: `${p.authorize}?${q}`, state };
}

// Step 2: the provider sends the browser back with ?code&state. Exchange the code
// and save the account. Returns { provider, email }.
async function finishSignIn(state, code) {
  if (!state || !/^[A-Za-z0-9_-]{20,80}$/.test(state)) throw new AccountError('state', 'Sign-in link is invalid. Start again from the connect page.');
  const saved = await store.take(`oauth:${state}`);
  if (!saved) throw new AccountError('state', 'Sign-in expired or was already used. Start again from the connect page.');
  const name = saved.provider;
  const p = requireSetup(name);
  const tokens = await tokenRequest(p, name, {
    grant_type: 'authorization_code',
    code: String(code || ''),
    redirect_uri: saved.redirect,
    code_verifier: saved.verifier,
  });
  if (!tokens.refresh_token) {
    throw new AccountError('reconnect', `${p.label} didn't return a refresh token. Remove the app's access in your account's security settings and connect again.`, name);
  }
  const now = Date.now();
  const email = await lookupEmail(name, tokens);
  await store.set(recordKey(name), {
    provider: name,
    email,
    refresh: tokens.refresh_token,
    access: tokens.access_token,
    expiresAt: now + (Number(tokens.expires_in) || 3600) * 1000,
    scope: tokens.scope || p.scopes.join(' '),
    connectedAt: now,
    refreshedAt: now,
    rotatedAt: now,
    needsReconnect: false,
  });
  return { provider: name, email };
}

/* ---------- access tokens ---------- */
const inflight = new Map(); // one refresh at a time per account within this invocation

async function readRecord(name) {
  const rec = await store.get(recordKey(name));
  if (!rec || !rec.refresh) throw new AccountError('not_connected', `${provider(name).label} isn't connected. Connect it on the /connect/ page.`, name);
  return rec;
}

async function refresh(name, rec) {
  const p = provider(name);
  const params = { grant_type: 'refresh_token', refresh_token: rec.refresh };
  if (name === 'microsoft') params.scope = p.scopes.join(' ');
  let tokens;
  try {
    tokens = await tokenRequest(p, name, params);
  } catch (e) {
    if (e.code === 'reconnect') {
      await store.set(recordKey(name), { ...rec, access: null, needsReconnect: true, lastError: e.message, failedAt: Date.now() });
      throw new AccountError('reconnect', `${p.label} needs signing in again on the /connect/ page.`, name);
    }
    throw e;
  }
  const now = Date.now();
  const rotated = !!tokens.refresh_token && tokens.refresh_token !== rec.refresh;
  const next = {
    ...rec,
    refresh: tokens.refresh_token || rec.refresh, // save the rotation
    access: tokens.access_token,
    expiresAt: now + (Number(tokens.expires_in) || 3600) * 1000,
    refreshedAt: now,
    rotatedAt: rotated ? now : rec.rotatedAt,
    needsReconnect: false,
    lastError: null,
  };
  await store.set(recordKey(name), next);
  return next;
}

async function getAccessToken(name, { force = false } = {}) {
  requireSetup(name);
  const rec = await readRecord(name);
  if (!force && rec.access && rec.expiresAt - Date.now() > 60000) return rec.access;
  if (!inflight.has(name)) {
    inflight.set(name, refresh(name, rec).finally(() => inflight.delete(name)));
  }
  return (await inflight.get(name)).access;
}

// fetch() with the account's bearer token; on a 401 it refreshes once and retries.
async function authFetch(name, url, opts = {}, ms = TIMEOUT_MS) {
  const go = async (token) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` }, signal: ctrl.signal });
    } catch (e) {
      if (e.name === 'AbortError') throw new AccountError('upstream', `${provider(name).label} timed out`, name);
      throw e;
    } finally {
      clearTimeout(t);
    }
  };
  let r = await go(await getAccessToken(name));
  if (r.status === 401) r = await go(await getAccessToken(name, { force: true }));
  return r;
}

/* ---------- status and disconnect (used by the connect page) ---------- */
async function status() {
  const storage = store.info();
  const out = [];
  for (const name of NAMES) {
    const p = PROVIDERS[name];
    const row = { provider: name, label: p.label, configured: isConfigured(name), missing: p.vars.filter((v) => !env(v)), connected: false };
    if (storage.configured) {
      try {
        const rec = await store.get(recordKey(name));
        if (rec && rec.refresh) {
          Object.assign(row, {
            connected: true,
            email: rec.email || '',
            needsReconnect: !!rec.needsReconnect,
            connectedAt: rec.connectedAt || null,
            refreshedAt: rec.refreshedAt || null,
            rotatedAt: rec.rotatedAt || null,
            scopes: String(rec.scope || '').split(' ').filter(Boolean).map((s) => s.replace('https://www.googleapis.com/auth/', '')),
          });
        }
      } catch (e) {
        row.error = e.message;
      }
    }
    out.push(row);
  }
  return out;
}

async function disconnect(name) {
  const p = provider(name);
  let rec = null;
  try { rec = await store.get(recordKey(name)); } catch { /* unreadable: just delete it */ }
  if (rec && rec.refresh && p.revoke) {
    // Google: revoke the grant too, so it disappears from your account's app list
    try {
      await fetch(p.revoke, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: rec.refresh }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch { /* best effort */ }
  }
  await store.del(recordKey(name));
}

module.exports = {
  PROVIDERS,
  NAMES,
  AccountError,
  isConfigured,
  redirectUri,
  beginSignIn,
  finishSignIn,
  getAccessToken,
  authFetch,
  status,
  disconnect,
};
