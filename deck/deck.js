/* ==========================================================================
   Deck — shared runtime for every app in this repo (window.Deck)

   Load it before an app's own script:
     <script src="/deck/deck.js"></script>

   What it gives an app (see deck/README.md for the full reference):
     Deck.api(path, params, opts)   call /api/<path> with the access code attached
     Deck.demo                      true with ?demo (or when opened from a file)
     Deck.lock(msg) / Deck.locked   lock screen: write or speak the access code
     Deck.title / status / hints / back   HUD helpers;  clock runs by itself
     Deck.toast(msg, { error, ms })
     Deck.press(el) / Deck.bump(el) feedback;  Deck.focus(el) / Deck.nearest(...)
     Deck.action(e)                 keydown -> 'up' | 'down' | 'left' | 'right' | 'select' | 'back'
     Deck.store                     localStorage that never throws (namespaced)
     Deck.say(text)                 text-to-speech through the glasses speaker
     Deck.toHub()                   back to the launcher, if the app was opened from it

   Access code: APP_CODE in Vercel. Open any app once with ?code=YOURCODE (or type
   it on the lock screen). It's stored once for the whole site, so every app on
   this address shares it, then removed from the address bar.
   ========================================================================== */
(() => {
  'use strict';

  const params = new URLSearchParams(location.search);

  /* ---------- storage (never throws: storage can be blocked) ---------- */
  const store = {
    get(key, fallback = null) {
      try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* full or blocked */ }
    },
    del(key) {
      try { localStorage.removeItem(key); } catch { /* blocked */ }
    },
  };

  /* ---------- access code ---------- */
  const CODE_KEY = 'deck.code';
  let memCode = ''; // used if storage is blocked
  const cleanCode = (v) => String(v || '').trim();

  (function captureCode() {
    // ?code= is the documented form; ?c= and the old Home/News ?key= still work.
    const fromUrl = params.get('code') || params.get('c') || params.get('key');
    if (!fromUrl) return;
    memCode = cleanCode(fromUrl);
    store.set(CODE_KEY, memCode);
    ['code', 'c', 'key'].forEach((k) => params.delete(k));
    const qs = params.toString();
    try { history.replaceState(history.state, '', location.pathname + (qs ? `?${qs}` : '') + location.hash); } catch { /* ignore */ }
  })();

  const getCode = () => store.get(CODE_KEY, '') || memCode;

  const demo = params.has('demo') || location.protocol === 'file:';

  /* ---------- server calls ---------- */
  // GET /api/<path>?<params>&c=<code>. The code goes in the URL (not only a header)
  // so a cached response can never be served to someone without it.
  async function api(path, query = {}, { method = 'GET', body, timeout = 20000 } = {}) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(query || {})) if (v != null) q.set(k, v);
    const code = getCode();
    if (code) q.set('c', code);
    const qs = q.toString();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(`/api/${path}${qs ? `?${qs}` : ''}`, {
        method,
        signal: ctrl.signal,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      if (!res.ok) {
        const err = new Error((data && data.error) || `Server error ${res.status}`);
        err.status = res.status;
        err.data = data;
        if (res.status === 401 && data && data.locked) {
          err.locked = true;
          lock(code ? 'Wrong access code' : 'Access code needed');
        }
        throw err;
      }
      return data;
    } catch (e) {
      if (e.name === 'AbortError') { const t = new Error('Request timed out'); t.status = 0; throw t; }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- HUD ----------
     Every app's index.html uses the same ids:
       #hudBack #hudTitle #hudSub #hudDot #hudStatus #hudClock #hints #toast */
  const el = (id) => document.getElementById(id);

  function title(text, sub) {
    const t = el('hudTitle');
    if (t && text != null) t.textContent = text;
    if (sub != null) { const s = el('hudSub'); if (s) s.textContent = sub; }
  }

  const STATUS_LABEL = { live: 'Live', offline: 'Offline', demo: 'Demo', cached: 'Saved', loading: 'Loading' };
  function status(mode, label) {
    const dot = el('hudDot');
    if (dot) dot.dataset.status = mode || '';
    const txt = el('hudStatus');
    if (txt) txt.textContent = label != null ? label : (STATUS_LABEL[mode] || '');
  }

  function back(show) {
    const b = el('hudBack');
    if (b) b.hidden = !show;
  }

  const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function hints(pairs, target = el('hints')) {
    if (target) target.innerHTML = pairs.map(([k, v]) => `<span><b>${escHtml(k)}</b>${escHtml(v)}</span>`).join('');
  }

  function startClock() {
    const c = el('hudClock');
    if (!c || c._ticking) return;
    c._ticking = true;
    const tick = () => { c.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };
    tick();
    setInterval(tick, 10000);
  }

  /* ---------- feedback ---------- */
  let toastTimer = null;
  function toast(msg, { error = false, ms = 2200 } = {}) {
    const t = el('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.toggle('is-error', !!error);
    t.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-visible'), ms);
  }

  function press(node) {
    if (!node || !node.classList) return;
    node.classList.remove('is-pressed');
    void node.offsetWidth;
    node.classList.add('is-pressed');
    setTimeout(() => node.classList.remove('is-pressed'), 150);
  }

  function bump(node) {
    if (!node || !node.classList) return;
    node.classList.remove('is-bump');
    void node.offsetWidth;
    node.classList.add('is-bump');
  }

  /* ---------- input ----------
     Neural Band: swipes arrive as arrow keys, pinch as Enter. Edit KEYS if your
     runtime sends something else. */
  const KEYS = {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    select: ['Enter', ' ', 'NumpadEnter', 'Select'],
    back: ['Escape', 'Backspace', 'GoBack', 'BrowserBack'],
  };
  const keyMap = new Map();
  for (const [action, keys] of Object.entries(KEYS)) keys.forEach((k) => keyMap.set(k, action));
  const action = (e) => keyMap.get(e.key) || null;

  function focus(node) {
    if (!node) return;
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }

  // Geometric spatial navigation: the nearest item in the swipe direction.
  function nearest(items, cur, dir) {
    if (!cur) return null;
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let best = null;
    let bestScore = Infinity;
    for (const node of items) {
      if (node === cur) continue;
      const b = node.getBoundingClientRect();
      const dx = b.left + b.width / 2 - cx;
      const dy = b.top + b.height / 2 - cy;
      const along = { up: -dy, down: dy, left: -dx, right: dx }[dir];
      const across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
      if (along <= 1) continue;
      const score = along + across * 2;
      if (score < bestScore) { bestScore = score; best = node; }
    }
    return best;
  }

  /* ---------- launcher ---------- */
  const FROM_HUB = 'deck.fromHub';
  // Called by an app when Back is pressed on its top screen.
  function toHub() {
    let fromHub = false;
    try { fromHub = sessionStorage.getItem(FROM_HUB) === '1'; } catch { /* ignore */ }
    if (!fromHub || location.pathname === '/') return false;
    if (history.length > 1) history.back(); else location.href = '/';
    return true;
  }

  /* ---------- speech ---------- */
  const canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  function say(text, { lang = 'en-GB', rate = 1, onend } = {}) {
    if (!canSpeak || !text) return false;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = rate;
      if (onend) { u.onend = onend; u.onerror = onend; }
      speechSynthesis.speak(u);
      return true;
    } catch { return false; }
  }
  const hush = () => { try { if (canSpeak) speechSynthesis.cancel(); } catch { /* ignore */ } };

  /* ---------- lock screen ----------
     Shown when the server answers 401 { locked: true }. The code is checked
     against /api/status before it's kept; then the app reloads. */
  const LOCK_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>';
  const CHECK_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  const PLAY_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5 19.5 12 7 19.5Z"/></svg>';
  let lockEl = null;
  let lockOpts = {};
  let lockPrevFocus = null;
  let lockPrevStatus = null;

  function buildLock() {
    const frame = document.querySelector('.frame') || document.body;
    lockEl = document.createElement('section');
    lockEl.className = 'deck-lock';
    lockEl.hidden = true;
    lockEl.setAttribute('aria-label', 'Access code');
    lockEl.innerHTML = `
      <div class="state">
        <div class="state-title err" data-lock-msg></div>
        <div class="state-msg">Enter the access code set as APP_CODE in Vercel. It's remembered on these glasses for every Deck app.</div>
        <label class="field-wrap">${LOCK_ICON}
          <input class="field" data-lock-input type="text" placeholder="Access code" aria-label="Access code" autocomplete="off" autocapitalize="off" spellcheck="false">
        </label>
        <div class="deck-lock-keys">
          <button type="button" class="key key-speak focusable" data-lock-unlock>${CHECK_ICON}<span class="key-label">Unlock</span></button>
          <button type="button" class="key focusable" data-lock-demo>${PLAY_ICON}<span class="key-label">Try demo</span></button>
        </div>
      </div>
      <footer class="hints" aria-hidden="true"></footer>`;
    frame.append(lockEl);
    lockEl.querySelector('[data-lock-unlock]').addEventListener('click', (e) => { e.stopPropagation(); unlock(); });
    lockEl.querySelector('[data-lock-demo]').addEventListener('click', (e) => { e.stopPropagation(); enterDemo(); });
    hints([['Pinch', 'the box to write or speak'], ['Swipe', 'move']], lockEl.querySelector('.hints'));
  }

  function lock(msg = 'Access code needed', opts = {}) {
    if (!lockEl) buildLock();
    lockOpts = opts;
    lockEl.querySelector('[data-lock-msg]').textContent = msg;
    lockEl.querySelector('[data-lock-msg]').classList.toggle('err', !opts.calm);
    lockEl.querySelector('[data-lock-demo]').hidden = opts.demo === false;
    if (!lockEl.hidden) return; // already showing: keep what's been typed
    lockPrevFocus = document.activeElement;
    lockPrevStatus = [el('hudDot')?.dataset.status || '', el('hudStatus')?.textContent || ''];
    lockEl.hidden = false;
    hush();
    status('offline', 'Locked');
    requestAnimationFrame(() => lockEl.querySelector('[data-lock-input]').focus());
  }

  function closeLock() {
    if (!lockEl || lockEl.hidden) return;
    lockEl.hidden = true;
    if (lockPrevStatus) status(...lockPrevStatus);
    if (lockPrevFocus && lockPrevFocus.isConnected) lockPrevFocus.focus();
  }

  async function unlock() {
    const input = lockEl.querySelector('[data-lock-input]');
    const code = cleanCode(input.value);
    if (!code) { toast('Enter the code first', { error: true }); input.focus(); return; }
    toast('Checking…', { ms: 1500 });
    try {
      const res = await fetch(`/api/status?c=${encodeURIComponent(code)}`, { cache: 'no-store' });
      if (res.status === 401) { lockEl.querySelector('[data-lock-msg]').textContent = 'Wrong access code'; toast('Wrong access code', { error: true }); input.focus(); return; }
    } catch {
      toast('Can’t reach the server — saved anyway', { error: true });
    }
    memCode = code;
    store.set(CODE_KEY, code);
    toast('Unlocked');
    if (lockOpts.onUnlock) { closeLock(); lockOpts.onUnlock(); return; }
    // Fresh start without ?demo
    setTimeout(() => location.replace(location.pathname), 300);
  }

  function enterDemo() {
    location.replace(`${location.pathname}?demo`);
  }

  // While the lock screen is open it owns the keys, so the app underneath
  // doesn't move focus or go back. Typing keys pass through to the input.
  window.addEventListener('keydown', (e) => {
    if (!lockEl || lockEl.hidden) return;
    e.stopImmediatePropagation();
    const a = action(e);
    const inInput = document.activeElement && document.activeElement.matches('[data-lock-input]');
    if (!a || a === 'select') return;          // let Enter / typing do their native thing
    if (a === 'back') {
      if (inInput && e.key === 'Backspace') return; // deleting a character
      e.preventDefault();
      if (lockOpts.dismissible) closeLock(); else toHub();
      return;
    }
    if (inInput && (a === 'left' || a === 'right')) return; // caret
    e.preventDefault();
    const items = [lockEl.querySelector('[data-lock-input]'), ...lockEl.querySelectorAll('.deck-lock-keys .key:not([hidden])')];
    let i = items.indexOf(document.activeElement);
    if (i < 0) { items[0].focus(); return; }
    if (a === 'up') i = 0;
    else if (a === 'down') i = Math.max(1, i);
    else if (a === 'left') i = Math.max(1, i - 1);
    else if (a === 'right') i = Math.min(items.length - 1, i + 1);
    items[i].focus();
  }, true);

  /* ---------- boot ---------- */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startClock); else startClock();

  window.Deck = {
    demo,
    params,
    store,
    get code() { return getCode(); },
    setCode(code) { memCode = cleanCode(code); store.set(CODE_KEY, memCode); },
    api,
    get locked() { return !!lockEl && !lockEl.hidden; },
    lock,
    closeLock,
    enterDemo,
    title, status, back, hints, startClock,
    toast, press, bump,
    KEYS, action, focus, nearest,
    toHub,
    canSpeak, say, hush,
    esc: escHtml,
  };
})();
