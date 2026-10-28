/* ==========================================================================
   api/_lib/mail/text.js — turn an email body into readable plain text
   HTML is stripped (no images, no links kept), quoted replies and signatures
   are cut, and the result is tidied for a small screen. No dependencies.
   ========================================================================== */

const MAX_CHARS = 20000; // what the glasses ever get to read

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·',
  pound: '£', euro: '€', copy: '©', reg: '®', trade: '™', zwnj: '', zwj: '', shy: '',
};

function decode(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : ''; } catch { return ''; }
    }
    const v = ENTITIES[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

// Markers where mail clients start the quoted original. Everything from the
// first one onwards is dropped (top-posted replies are the norm).
const HTML_QUOTE_MARKERS = [
  /<div[^>]+class=["'][^"']*\bgmail_quote\b/i,          // Gmail
  /<div[^>]+id=["']?divRplyFwdMsg/i,                     // Outlook web
  /<div[^>]+id=["']?appendonsend/i,                      // Outlook
  /<hr[^>]+id=["']?stopSpelling/i,                       // Outlook.com (older)
  /<div[^>]+class=["'][^"']*\byahoo_quoted\b/i,          // Yahoo
  /<blockquote[^>]+type=["']?cite/i,                     // Apple Mail, Thunderbird
  /<div[^>]+class=["'][^"']*\bmoz-cite-prefix\b/i,       // Thunderbird
  /<div[^>]+name=["']?messageReplySection/i,             // Outlook iOS
];

function cutHtmlQuote(html) {
  let cut = html.length;
  for (const re of HTML_QUOTE_MARKERS) {
    const m = re.exec(html);
    if (m && m.index < cut) cut = m.index;
  }
  return html.slice(0, cut);
}

function htmlToText(html) {
  let h = String(html || '');
  h = h.replace(/<!--[\s\S]*?-->/g, '');
  h = h.replace(/<(head|style|script|title|noscript|template|svg|xml)\b[\s\S]*?<\/\1\s*>/gi, '');
  h = h.replace(/<(img|video|audio|iframe|object|embed|picture|source)\b[^>]*>/gi, ''); // no remote content, ever
  h = h.replace(/<br\s*\/?>/gi, '\n');
  h = h.replace(/<li\b[^>]*>/gi, '\n• ');
  h = h.replace(/<\/(td|th)\s*>/gi, ' ');
  h = h.replace(/<\/?(p|div|section|article|header|footer|tr|table|tbody|thead|ul|ol|h[1-6]|blockquote|pre|hr|center|dl|dt|dd)\b[^>]*>/gi, '\n');
  h = h.replace(/<[^>]+>/g, '');           // everything else, including <a>: keep its text, drop the address
  return decode(h);
}

const QUOTE_HEADER_PATTERNS = [
  /^-{2,}\s*Original Message\s*-{2,}/im,
  /^-{2,}\s*Forwarded message\s*-{2,}/im,
  /^_{10,}\s*\n+\s*From:/im,                                       // Outlook's rule above "From:"
  /^From:\s.*\n(?:.*\n){0,3}?(?:Sent|Date):\s/im,                  // Outlook header block
  /^On\s.{4,200}?(?:\n.{0,200}?)?\s?wrote:\s*$/im,                 // "On Tue, 1 Oct, Sam wrote:" (may wrap)
  /^Le\s.{4,200}a écrit\s?:\s*$/im,
  /^Am\s.{4,200}schrieb.{0,60}:\s*$/im,
];

const SIGNATURE_PATTERNS = [
  /^--\s?$/m,                                                      // standard signature separator
  /^(?:Sent|Get Outlook) (?:from|for) (?:my )?(?:iPhone|iPad|Android|Outlook|Samsung|Mail|Galaxy|BlackBerry)\b.*$/im,
];

function cutAt(text, patterns, minKeep) {
  let cut = text.length;
  for (const re of patterns) {
    const m = re.exec(text);
    if (m && m.index < cut && m.index >= minKeep) cut = m.index;
  }
  return text.slice(0, cut);
}

function tidy(text) {
  let t = String(text || '').replace(/\r\n?/g, '\n');
  t = t.replace(/[​-‍⁠﻿­͏]/g, '');            // invisible spacers newsletters use
  t = t.replace(/[\t  -   　 ]+/g, ' ');
  t = t.replace(/<?https?:\/\/[^\s>)\]]{30,}>?/g, '[link]');                // long tracking links
  t = t.replace(/\(\s*\[link\]\s*\)|<\s*\[link\]\s*>/g, '');                   // "text (link)" left by text versions
  t = t.replace(/^\s*\[link\]\s*$/gm, '');
  t = t.split('\n').map((l) => l.trim()).join('\n');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

// The main entry: { html?, text? } -> clean, readable body
function readable({ html, text } = {}) {
  const fromHtml = html ? tidy(htmlToText(cutHtmlQuote(html))) : '';
  const fromText = text ? tidy(String(text)) : '';
  // Prefer the plain part when it's substantial; HTML when that's all there is,
  // or when the plain part is just a stub ("view this email in your browser").
  let body = fromText.length >= 40 || !fromHtml ? fromText : fromHtml;

  const original = body;
  // Drop quoted ">" lines (bottom-quoting)
  body = body.split('\n').filter((l) => !/^>/.test(l)).join('\n');
  body = cutAt(body, QUOTE_HEADER_PATTERNS, 1);
  body = cutAt(body, SIGNATURE_PATTERNS, 20);
  body = tidy(body);
  // Never cut a message down to nothing: fall back to the uncut text
  if (body.length < 2 && original.length) body = original;
  if (body.length > MAX_CHARS) body = `${body.slice(0, MAX_CHARS).replace(/\s+\S*$/, '')}\n\n[Message cut short]`;
  return body;
}

const wordCount = (s) => (String(s).match(/\S+/g) || []).length;
const isLong = (s) => s.length > 1100 || wordCount(s) > 180;

// Header text from an untrusted message: one line, no control characters
const oneLine = (s, max = 300) => String(s || '').replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

module.exports = { readable, htmlToText, decode, tidy, isLong, wordCount, oneLine };
