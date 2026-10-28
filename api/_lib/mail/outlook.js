/* ==========================================================================
   api/_lib/mail/outlook.js — Outlook.com adapter (Microsoft Graph, REST)
   Inbox: Focused only, unless MAIL_ALL_INBOX=1 is set in Vercel. Focused is
   filtered here rather than in the query, as Graph is fussy about combining
   $filter with $orderby. If Focused Inbox is turned off in Outlook, every
   message counts as Focused, so nothing is hidden.
   ========================================================================== */
const accounts = require('../accounts.js');
const { providerError } = require('./util.js');
const { oneLine } = require('./text.js');

const API = 'https://graph.microsoft.com/v1.0/me';
const ACCOUNT = 'microsoft';
const LABEL = 'Outlook';
const filtered = () => process.env.MAIL_ALL_INBOX !== '1';
const isFocused = (m) => !filtered() || String(m.inferenceClassification || 'focused').toLowerCase() === 'focused';

async function call(path, { method = 'GET', body, headers } = {}) {
  const r = await accounts.authFetch(ACCOUNT, path.startsWith('https://') ? path : `${API}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw await providerError(r, LABEL, ACCOUNT);
  if (r.status === 202 || r.status === 204) return null;
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

const addr = (a) => ({
  name: oneLine(a && a.emailAddress && a.emailAddress.name, 200),
  address: oneLine(a && a.emailAddress && a.emailAddress.address, 320),
});

async function listInbox(max = 20) {
  const q = new URLSearchParams({
    $top: filtered() ? '50' : String(max),
    $orderby: 'receivedDateTime desc',
    $select: 'id,subject,from,receivedDateTime,isRead,bodyPreview,inferenceClassification',
  });
  const data = await call(`/mailFolders/inbox/messages?${q}`);
  return (data.value || []).filter(isFocused).slice(0, max).map((m) => ({
    id: m.id,
    account: ACCOUNT,
    from: addr(m.from),
    subject: oneLine(m.subject) || '(no subject)',
    date: m.receivedDateTime,
    unread: !m.isRead,
    snippet: oneLine(m.bodyPreview, 160),
  }));
}

async function unreadCount() {
  if (!filtered()) {
    const f = await call('/mailFolders/inbox?$select=unreadItemCount');
    return { count: Number(f.unreadItemCount) || 0, more: false };
  }
  const q = new URLSearchParams({ $filter: 'isRead eq false', $top: '100', $select: 'id,inferenceClassification' });
  const data = await call(`/mailFolders/inbox/messages?${q}`);
  return { count: (data.value || []).filter(isFocused).length, more: !!data['@odata.nextLink'] };
}

async function getMessage(id) {
  const q = new URLSearchParams({
    $select: 'id,subject,from,replyTo,receivedDateTime,isRead,body,uniqueBody,conversationId',
  });
  const m = await call(`/messages/${encodeURIComponent(id)}?${q}`);
  // uniqueBody: just this message, without the quoted thread (Graph works it out)
  const pick = m.uniqueBody && String(m.uniqueBody.content || '').replace(/<[^>]+>|\s|&nbsp;/g, '').length > 0 ? m.uniqueBody : m.body;
  const isHtml = String(pick && pick.contentType).toLowerCase() === 'html';
  const from = addr(m.from);
  const replyTo = m.replyTo && m.replyTo.length ? addr(m.replyTo[0]) : from;
  return {
    id: m.id,
    account: ACCOUNT,
    from,
    replyTo: replyTo.address ? replyTo : from,
    subject: oneLine(m.subject) || '(no subject)',
    date: m.receivedDateTime,
    unread: !m.isRead,
    html: isHtml ? String(pick.content || '') : '',
    text: isHtml ? '' : String((pick && pick.content) || ''),
  };
}

async function markRead(id) {
  await call(`/messages/${encodeURIComponent(id)}`, { method: 'PATCH', body: { isRead: true } });
}

// Graph's reply action keeps the thread, the recipient and the subject, and
// saves the reply in Sent Items. The text goes in as plain text.
async function sendReply(orig, text) {
  const path = `/messages/${encodeURIComponent(orig.id)}/reply`;
  try {
    await call(path, { method: 'POST', body: { message: { body: { contentType: 'Text', content: String(text) } } } });
  } catch (e) {
    // Only when Graph rejected the request outright (400), so nothing was sent
    if (e.upstream !== 400) throw e;
    // Fallback: the simpler "comment" form (Outlook adds the quoted original)
    await call(path, { method: 'POST', body: { comment: String(text) } });
  }
  return { id: null };
}

module.exports = { listInbox, unreadCount, getMessage, markRead, sendReply };
