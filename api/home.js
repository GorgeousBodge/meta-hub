/* ==========================================================================
   /api/home?path=… — server-side proxy from Home Deck to Home Assistant

   Environment variables (Vercel → Settings → Environment Variables):
     NABU_CASA_URL  https://xxxx.ui.nabu.casa (any external HA address works)
     HA_TOKEN       Home Assistant long-lived access token
     APP_CODE       the shared access code. Required here: without it this
                    function refuses to run, because it can switch things on.

   Only the calls the app needs are allowed through, and every action must
   name specific devices of an allowed kind. So nothing here can reach locks,
   alarms or covers (garage doors), even via homeassistant.toggle, and "all"
   or whole-area commands are refused.
   ========================================================================== */
const { send, allowed } = require('./_lib/common.js');

// Kinds of device the app may control or view.
const ENTITY_DOMAINS = new Set([
  'light', 'switch', 'fan', 'climate', 'scene', 'script',
  'media_player', 'remote', 'camera', 'select',
]);
// Actions may be called in these domains (homeassistant.toggle, onvif.ptz…),
// but only ever on devices from ENTITY_DOMAINS.
const SERVICE_DOMAINS = new Set([...ENTITY_DOMAINS, 'homeassistant', 'onvif', 'button']);
// Buttons can do anything (restart, format…), so only camera PTZ buttons are allowed.
const isPtzButton = (id) => /^button\.[a-z0-9_]*ptz_?(up|down|left|right)[a-z0-9_]*$/.test(id);
const BROAD_TARGETS = ['target', 'area_id', 'device_id', 'floor_id', 'label_id'];

function route(method, path) {
  if (path === 'states') return method === 'GET' ? 'json' : null;
  if (path === 'template') return method === 'POST' ? 'json' : null;
  if (/^camera_proxy\/camera\.[a-z0-9_]+$/.test(path)) return method === 'GET' ? 'image' : null;
  const m = /^services\/([a-z_]+)\/([a-z_]+)$/.exec(path);
  if (m && method === 'POST' && SERVICE_DOMAINS.has(m[1])) return 'service';
  return null;
}

function serviceBodyAllowed(body, service) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  if (BROAD_TARGETS.some((k) => k in body)) return false;
  const ids = [].concat(body.entity_id ?? []);
  if (!ids.length) return false;
  return ids.every((id) =>
    typeof id === 'string' &&
    /^[a-z_]+\.[a-z0-9_]+$/.test(id) && // rejects "all"
    (ENTITY_DOMAINS.has(id.split('.')[0]) || (isPtzButton(id) && /^services\/(button|homeassistant)\//.test(service))));
}

module.exports = async (req, res) => {
  if (!allowed(req, res, { required: true })) return;
  res.setHeader('Cache-Control', 'no-store, private');

  const { NABU_CASA_URL, HA_TOKEN } = process.env;
  if (!NABU_CASA_URL || !HA_TOKEN) {
    return send(res, 500, { error: 'Server setup incomplete: set NABU_CASA_URL and HA_TOKEN' });
  }

  const path = String(req.query.path || '');
  const kind = route(req.method, path);
  if (!kind || (kind === 'service' && !serviceBodyAllowed(req.body, path))) {
    return send(res, 403, { error: 'Not allowed' });
  }

  try {
    // Pictures: ask Home Assistant for a glasses-sized image (ignored by cameras that can't resize).
    const w = Number(req.query.w);
    const qs = kind === 'image' && Number.isInteger(w) && w >= 160 && w <= 1920 ? `?width=${w}` : '';
    const upstream = await fetch(`${NABU_CASA_URL.trim().replace(/\/+$/, '')}/api/${path}${qs}`, {
      method: req.method,
      headers: { Authorization: `Bearer ${HA_TOKEN.trim()}`, 'Content-Type': 'application/json' },
      body: req.method === 'POST' ? JSON.stringify(req.body ?? {}) : undefined,
      signal: AbortSignal.timeout(kind === 'image' ? 20000 : 15000),
    });

    if (upstream.status === 401) return send(res, 502, { error: 'Home Assistant rejected the token' });

    if (kind === 'image') {
      if (!upstream.ok) return send(res, 502, { error: `Home Assistant couldn’t get a picture (${upstream.status})` });
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.status(200);
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'no-store, private');
      return res.send(buf);
    }

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (err) {
    if (err && err.name === 'TimeoutError') {
      return send(res, 504, { error: kind === 'image' ? 'The camera took too long to send a picture' : 'Home Assistant took too long to answer' });
    }
    return send(res, 502, { error: 'Can’t reach Home Assistant' });
  }
};

module.exports._test = { route, serviceBodyAllowed };
