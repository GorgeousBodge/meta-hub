// Mail Deck server: one Vercel function for all of Mail's endpoints.
//   GET  /api/mail/list      latest inbox from both accounts, merged, plus unread counts
//   GET  /api/mail/unread    just the unread counts (for polling and the launcher badge)
//   GET  /api/mail/read      one message as clean text (?id=)
//   POST /api/mail/seen      mark as read            { id }
//   POST /api/mail/summary   AI summary              { id }
//   POST /api/mail/suggest   three AI reply ideas    { id }
//   POST /api/mail/tidy      AI tidy of a draft      { id, text }
//   POST /api/mail/send      send a reply            { id, text }
// Every endpoint needs APP_CODE (and refuses to run if it isn't set in Vercel),
// and every response is Cache-Control: no-store, so mail is never cached.
const { send, allowed } = require('../_lib/common.js');
const { OPS, fail } = require('../_lib/mail/handlers.js');

module.exports = async (req, res) => {
  const op = OPS[String((req.query && req.query.op) || '')];
  if (!op) return send(res, 404, { error: 'Unknown Mail endpoint' });
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
