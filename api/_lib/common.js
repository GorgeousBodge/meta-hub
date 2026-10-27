// Shared helpers for every app's server function (Home, News, Nav, …).
// Anything inside api/_lib/ is not exposed as a route on Vercel and doesn't count
// towards the Hobby plan's 12-function limit.

// Keep letters, numbers and the symbols base64-style keys use (= + / - _), e.g. HEIGIT/openrouteservice
// keys ending in "=". Strip everything else (stray spaces, quotes, newlines from pasting).
const cleanKey = (v) => String(v || '').replace(/[^A-Za-z0-9=+/_-]/g, '');

function send(res, status, body, cacheSeconds) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    cacheSeconds ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}` : 'no-store',
  );
  res.status(status).send(JSON.stringify(body));
}

function num(v, min, max) {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) && n >= min && n <= max ? n : null;
}

async function fetchT(url, opts = {}, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Upstream service timed out');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

// Turn an upstream failure into a short message without leaking anything sensitive
async function upstreamError(r, name) {
  let detail = '';
  try {
    const text = await r.text();
    try {
      const j = JSON.parse(text);
      detail = (j.error && (j.error.message || j.error)) || j.message || j.fault || '';
    } catch {
      detail = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
    }
  } catch { /* ignore */ }
  if (r.status === 401 || r.status === 403) return `${name} rejected the key (${r.status}). Check the Vercel environment variable.`;
  if (r.status === 429) return `${name} rate limit reached. Try again shortly.`;
  return `${name} error ${r.status}${detail ? ': ' + String(detail).slice(0, 140) : ''}`;
}

// Access code: one APP_CODE for every app. If it's set in Vercel, every request must carry it
// (?c=CODE), or nothing runs. The code is in the URL (not just a header) so cached responses can
// never be served to someone without it. APP_KEY (the old Home/News name) still works as a fallback.
// { required: true } refuses to run at all when no code is set (Home: it can switch things on and off).
const crypto = require('crypto');
const accessCode = () => cleanKey(process.env.APP_CODE || process.env.APP_KEY);

function allowed(req, res, { required = false } = {}) {
  const want = accessCode();
  if (!want) {
    if (!required) return true; // no code set: open
    send(res, 500, { error: 'Server setup incomplete: set APP_CODE in Vercel' });
    return false;
  }
  const got = cleanKey((req.query && req.query.c) || req.headers['x-app-code'] || '');
  const a = Buffer.from(want), b = Buffer.from(got);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) send(res, 401, { error: got ? 'Wrong access code' : 'Access code needed', locked: true });
  return ok;
}

module.exports = { cleanKey, send, num, fetchT, upstreamError, allowed, accessCode };
