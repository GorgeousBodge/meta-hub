/* ==========================================================================
   /api/home?path=… — server-side proxy from Home Deck to Home Assistant

   Environment variables (Vercel → Settings → Environment Variables):
     NABU_CASA_URL  https://xxxx.ui.nabu.casa (any external HA address works)
     HA_TOKEN       Home Assistant long-lived access token
     APP_CODE       the shared access code. Required here: without it this
                    function refuses to run, because it can switch things on.

   Only the calls the app needs are allowed through.
   ========================================================================== */
const { send, allowed } = require('./_lib/common.js');

const SERVICE_DOMAINS = new Set([
  'light', 'switch', 'fan', 'climate', 'scene', 'script',
  'media_player', 'remote', 'homeassistant',
]);

function isAllowed(method, path) {
  if (path === 'states') return method === 'GET';
  if (path === 'template') return method === 'POST';
  const m = /^services\/([a-z_]+)\/([a-z_]+)$/.exec(path);
  return method === 'POST' && !!m && SERVICE_DOMAINS.has(m[1]);
}

module.exports = async (req, res) => {
  if (!allowed(req, res, { required: true })) return;
  res.setHeader('Cache-Control', 'no-store');

  const { NABU_CASA_URL, HA_TOKEN } = process.env;
  if (!NABU_CASA_URL || !HA_TOKEN) {
    return send(res, 500, { error: 'Server setup incomplete: set NABU_CASA_URL and HA_TOKEN' });
  }

  const path = String(req.query.path || '');
  if (!isAllowed(req.method, path)) return send(res, 403, { error: 'Not allowed' });

  try {
    const upstream = await fetch(`${NABU_CASA_URL.trim().replace(/\/+$/, '')}/api/${path}`, {
      method: req.method,
      headers: { Authorization: `Bearer ${HA_TOKEN.trim()}`, 'Content-Type': 'application/json' },
      body: req.method === 'POST' ? JSON.stringify(req.body ?? {}) : undefined,
    });
    const text = await upstream.text();

    if (upstream.status === 401) return send(res, 502, { error: 'Home Assistant rejected the token' });
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (err) {
    return send(res, 502, { error: 'Can’t reach Home Assistant' });
  }
};
