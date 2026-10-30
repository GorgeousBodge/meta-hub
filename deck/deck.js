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
     Deck.say(text, { onend })      text-to-speech through the glasses speaker (Deck.hush() stops)
     Deck.speech                    saved voice profile, voices list, recent events (see /voice/)
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

  /* ---------- speech ----------
     The glasses support only "a subset" of speechSynthesis, for short content.
     So Deck.say is deliberately forgiving:
       - long text is split into short sentences, spoken one after another
       - cancel() is only called if something is speaking, with a short gap after it
       - the language/voice comes from a saved profile (set on the Voice check screen,
         /voice/), and if the engine rejects it, it falls back to the plain default
       - the first pinch/tap primes speech, so later spoken prompts (Nav guidance)
         aren't blocked for not coming from a gesture
     onend is called once when it finishes or fails, but not after Deck.hush(). */
  const canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const SPEECH_KEY = 'deck.speech';
  const SPEECH_DEFAULT = { lang: '', voice: '', rate: 1, chunk: 160, gap: 120, label: 'Default' };
  let speechProfile = { ...SPEECH_DEFAULT, ...(store.get(SPEECH_KEY, {}) || {}) };
  let speechSeq = 0;
  let speechLog = [];                  // recent events, shown on the Voice check screen
  let sessionPlain = false;            // the saved language failed this session: use defaults
  let primed = false;                  // speech has been started from a pinch at least once

  const logSpeech = (ev) => { speechLog.push({ t: Date.now(), ...ev }); speechLog = speechLog.slice(-20); };
  const voices = () => { try { return canSpeak ? speechSynthesis.getVoices() || [] : []; } catch { return []; } };

  function splitSpeech(text, max) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const sentences = clean.match(/[^.!?]+[.!?]*["')\]]*\s*/g) || [clean];
    const out = [];
    let buf = '';
    const push = (piece) => {
      piece = piece.trim();
      if (!piece) return;
      if (piece.length <= max) { out.push(piece); return; }
      // a very long sentence: break at commas, then at spaces
      let rest = piece;
      while (rest.length > max) {
        let cut = rest.lastIndexOf(', ', max);
        if (cut < max * 0.4) cut = rest.lastIndexOf(' ', max);
        if (cut < max * 0.4) cut = max;
        out.push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1);
      }
      if (rest.trim()) out.push(rest.trim());
    };
    for (const s of sentences) {
      if ((buf + s).length > max && buf) { push(buf); buf = ''; }
      buf += s;
    }
    push(buf);
    return out;
  }

  function makeUtterance(text, profile, plain) {
    const u = new SpeechSynthesisUtterance(text);
    if (!plain) {
      if (profile.voice) {
        const v = voices().find((x) => x.voiceURI === profile.voice || x.name === profile.voice);
        if (v) u.voice = v;
      }
      if (profile.lang) u.lang = profile.lang;
      if (profile.rate && profile.rate !== 1) u.rate = profile.rate;
    }
    return u;
  }

  // say(text, { onend, profile }) — profile overrides the saved one (used by the Voice check)
  function say(text, { onend, profile: override } = {}) {
    if (!canSpeak || !text) return false;
    primed = true;                     // real speech from a pinch primes the engine itself
    const profile = { ...speechProfile, ...(override || {}) };
    const chunks = splitSpeech(text, profile.chunk || SPEECH_DEFAULT.chunk);
    if (!chunks.length) return false;
    const id = ++speechSeq;
    let plain = sessionPlain && !override;
    let i = 0;
    let finished = false;
    const finish = (ok, error) => {
      if (finished || id !== speechSeq) return;
      finished = true;
      logSpeech({ ev: ok ? 'end' : 'fail', error, label: profile.label });
      if (onend) onend(ok);
    };
    const speakNext = () => {
      if (id !== speechSeq) return;
      if (i >= chunks.length) { finish(true); return; }
      const u = makeUtterance(chunks[i], profile, plain);
      let started = false;
      // Some engines drop an utterance silently: don't leave the UI saying "speaking" forever
      const watchdog = setTimeout(() => { if (!started && id === speechSeq) { logSpeech({ ev: 'silent', label: profile.label }); finish(false, 'no-start'); } }, 4000);
      u.onstart = () => { started = true; clearTimeout(watchdog); if (i === 0) logSpeech({ ev: 'start', label: profile.label }); };
      u.onend = () => { clearTimeout(watchdog); if (id !== speechSeq) return; i += 1; speakNext(); };
      u.onerror = (e) => {
        clearTimeout(watchdog);
        if (id !== speechSeq) return;
        const err = (e && e.error) || 'error';
        if (err === 'interrupted' || err === 'canceled') return;
        // The chosen language or voice isn't supported: retry this chunk plainly
        if (!plain && !override && (profile.lang || profile.voice || profile.rate !== 1)) {
          logSpeech({ ev: 'retry-plain', error: err, label: profile.label });
          plain = true;
          if (!override) sessionPlain = true;
          speakNext();
          return;
        }
        finish(false, err);
      };
      try { speechSynthesis.speak(u); } catch (e) { clearTimeout(watchdog); finish(false, e.message); }
    };
    let busy = false;
    try { busy = speechSynthesis.speaking || speechSynthesis.pending; } catch { /* ignore */ }
    if (busy) {
      try { speechSynthesis.cancel(); } catch { /* ignore */ }
      setTimeout(speakNext, profile.gap || SPEECH_DEFAULT.gap);   // speak() straight after cancel() is dropped on some engines
    } else {
      speakNext();                                                // stays inside the pinch, for engines that need a gesture
    }
    return true;
  }

  function hush() {
    speechSeq += 1;
    try { if (canSpeak && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel(); } catch { /* ignore */ }
  }

  // Prime speech on the first pinch or tap, so speech that isn't started by a gesture
  // (Nav's turn prompts) is allowed later on engines that require one.
  // Runs after the app's own handlers (bubble phase), so it only fires when the
  // pinch didn't already start speech.
  function prime() {
    if (primed || !canSpeak) return;
    primed = true;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch { /* ignore */ }
  }
  window.addEventListener('keydown', (e) => { if (e.key === 'Enter') prime(); });
  window.addEventListener('pointerdown', prime);

  const speech = {
    get profile() { return { ...speechProfile }; },
    setProfile(p) { speechProfile = { ...SPEECH_DEFAULT, ...p }; sessionPlain = false; store.set(SPEECH_KEY, speechProfile); },
    resetProfile() { speechProfile = { ...SPEECH_DEFAULT }; sessionPlain = false; store.del(SPEECH_KEY); },
    voices,
    get log() { return speechLog.slice(); },
    get speaking() { try { return canSpeak && speechSynthesis.speaking; } catch { return false; } },
    split: splitSpeech,
  };

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
    canSpeak, say, hush, speech,
    esc: escHtml,
  };
})();
