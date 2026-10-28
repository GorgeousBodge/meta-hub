/* ==========================================================================
   api/_lib/store.js — encrypted key/value storage in Upstash Redis
   Shared by every app that keeps secrets server-side (accounts, Mail, Calendar).
   Not a route: files in api/_lib/ don't count towards Vercel's function limit.

   Talks to Upstash over its REST API with fetch (no npm package).
   Environment variables:
     KV_REST_API_URL / KV_REST_API_TOKEN          added by the Vercel Marketplace
       (or UPSTASH_REDIS_REST_URL / _TOKEN)        Upstash integration, either pair works
     TOKEN_KEY   32 random bytes, as base64 (44 characters) or hex (64 characters).
                 Every value is encrypted with AES-256-GCM before it leaves this
                 function. Changing TOKEN_KEY makes everything stored unreadable
                 (you'd simply reconnect the accounts).

   Use:
     const store = require('./store.js');
     await store.set('account:google', { refresh: '…' }, { ttl: 3600 });  // ttl optional, seconds
     const v = await store.get('account:google');   // decrypted object, or null
     await store.del('account:google');
     const once = await store.take('oauth:abc');    // read and delete in one step
     const fresh = await store.setOnce('sent:xyz', true, { ttl: 120 }); // false if it already existed
     store.info()   // { configured, url, token, key, keyError, missing } — no secrets
   ========================================================================== */
const crypto = require('crypto');

const PREFIX = 'deck:';
const TIMEOUT_MS = 8000;

const env = (name) => String(process.env[name] || '').trim();
const restUrl = () => (env('KV_REST_API_URL') || env('UPSTASH_REDIS_REST_URL')).replace(/\/+$/, '');
const restToken = () => env('KV_REST_API_TOKEN') || env('UPSTASH_REDIS_REST_TOKEN');

/* ---------- encryption key ---------- */
let keyCache = null; // { raw, key, error }
function loadKey() {
  const raw = env('TOKEN_KEY');
  if (keyCache && keyCache.raw === raw) return keyCache;
  let key = null;
  let error = null;
  if (!raw) error = 'TOKEN_KEY is not set';
  else if (/^[0-9a-fA-F]{64}$/.test(raw)) key = Buffer.from(raw, 'hex');
  else {
    const b = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (b.length === 32) key = b;
    else error = `TOKEN_KEY must be 32 bytes (44 base64 or 64 hex characters); this one decodes to ${b.length} bytes`;
  }
  keyCache = { raw, key, error };
  return keyCache;
}

const b64u = (buf) => buf.toString('base64url');
const unb64u = (s) => Buffer.from(s, 'base64url');

// The Redis key is bound in as "additional data", so a stored value can't be
// copied onto another key and still decrypt.
function encrypt(name, value) {
  const { key, error } = loadKey();
  if (!key) throw new Error(error);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(name));
  const ct = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
  return `v1.${b64u(iv)}.${b64u(c.getAuthTag())}.${b64u(ct)}`;
}

function decrypt(name, sealed) {
  const { key, error } = loadKey();
  if (!key) throw new Error(error);
  const parts = String(sealed).split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Stored value is not in the expected format');
  const d = crypto.createDecipheriv('aes-256-gcm', key, unb64u(parts[1]));
  d.setAAD(Buffer.from(name));
  d.setAuthTag(unb64u(parts[2]));
  try {
    const pt = Buffer.concat([d.update(unb64u(parts[3])), d.final()]);
    return JSON.parse(pt.toString('utf8'));
  } catch {
    throw new Error('Stored value could not be decrypted (TOKEN_KEY changed?)');
  }
}

/* ---------- Upstash REST ---------- */
async function command(args) {
  const url = restUrl();
  const token = restToken();
  if (!url || !token) throw new Error('Upstash Redis is not connected (KV_REST_API_URL / KV_REST_API_TOKEN missing)');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let r;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Upstash timed out' : `Upstash unreachable: ${e.message}`);
  } finally {
    clearTimeout(t);
  }
  let data = null;
  try { data = await r.json(); } catch { /* handled below */ }
  if (!r.ok || !data || data.error) {
    if (r.status === 401) throw new Error('Upstash rejected the token (401). Check KV_REST_API_TOKEN.');
    throw new Error(`Upstash error ${r.status}${data && data.error ? `: ${String(data.error).slice(0, 120)}` : ''}`);
  }
  return data.result;
}

const full = (name) => PREFIX + name;
const ttlArgs = (ttl) => (Number.isFinite(ttl) && ttl > 0 ? ['EX', String(Math.ceil(ttl))] : []);

async function get(name) {
  const k = full(name);
  const v = await command(['GET', k]);
  return v == null ? null : decrypt(k, v);
}

async function set(name, value, { ttl } = {}) {
  const k = full(name);
  await command(['SET', k, encrypt(k, value), ...ttlArgs(ttl)]);
}

async function del(name) {
  await command(['DEL', full(name)]);
}

// Read and delete atomically (single-use values such as OAuth state).
async function take(name) {
  const k = full(name);
  const v = await command(['GETDEL', k]);
  return v == null ? null : decrypt(k, v);
}

// Set only if the key doesn't exist yet. Returns true if this call created it.
async function setOnce(name, value, { ttl } = {}) {
  const k = full(name);
  const r = await command(['SET', k, encrypt(k, value), 'NX', ...ttlArgs(ttl)]);
  return r === 'OK';
}

// Short, non-reversible id for using untrusted strings (message ids) in key names.
const hashId = (s) => crypto.createHash('sha256').update(String(s)).digest('base64url').slice(0, 32);

function info() {
  const k = loadKey();
  const missing = [];
  if (!restUrl()) missing.push('KV_REST_API_URL');
  if (!restToken()) missing.push('KV_REST_API_TOKEN');
  if (!k.key) missing.push('TOKEN_KEY');
  return {
    configured: missing.length === 0,
    url: !!restUrl(),
    token: !!restToken(),
    urlFrom: env('KV_REST_API_URL') ? 'KV_REST_API_URL' : env('UPSTASH_REDIS_REST_URL') ? 'UPSTASH_REDIS_REST_URL' : null,
    key: !!k.key,
    keyError: k.key ? null : k.error,
    missing,
  };
}

module.exports = { get, set, del, take, setOnce, hashId, info, _test: { encrypt, decrypt } };
