// Calendar Deck server: one Vercel function for all of Calendar's endpoints (read-only).
//   GET /api/calendar/list     today and the next 6 days from both accounts, merged (?days=1–14)
//   GET /api/calendar/today    events left today (for the launcher badge)
// Every endpoint needs APP_CODE (and refuses to run if it isn't set in Vercel),
// and every response is Cache-Control: no-store, so calendars are never cached.
// Accounts are the ones connected on /connect/ (see docs/ACCOUNTS.md).
const { send, allowed } = require('../_lib/common.js');
const { OPS, fail } = require('../_lib/calendar/handlers.js');

module.exports = async (req, res) => {
  const op = OPS[String((req.query && req.query.op) || '')];
  if (!op) return send(res, 404, { error: 'Unknown Calendar endpoint' });
  if (!allowed(req, res, { required: true })) return;
  if (req.method !== op.method) {
    res.setHeader('Allow', op.method);
    return send(res, 405, { error: `${op.method} only` });
  }
  try {
    await op.run(req, res);
  } catch (e) {
    if (!res.headersSent) fail(res, e);
  }
};
