/* ==========================================================================
   deck/badges.js — live counts on launcher tiles (e.g. Mail's unread count)

   Load it on the launcher after hub.js:
     <script src="/deck/badges.js"></script>

   An app opts in from its entry in deck/apps.js:
     badge: 'mail/unread'    // GET /api/mail/unread → { count, more }
     badgeLabel: 'unread'    // optional, for screen readers

   The count shows as an amber pill in the tile's top-right corner and refreshes
   every 2 minutes while the launcher is visible. Nothing is fetched in ?demo,
   without an access code, or while the lock screen is up. The last count is
   kept in Deck.store as '<app id>.unread', so the tile shows it straight away.
   ========================================================================== */
(() => {
  'use strict';
  if (!window.Deck || !Array.isArray(window.DECK_APPS)) return;

  const POLL_MS = 2 * 60 * 1000;
  const apps = window.DECK_APPS.filter((a) => a && a.badge);
  if (!apps.length) return;

  const style = document.createElement('style');
  style.textContent = `
    .deck-badge {
      position: absolute; top: 10px; right: 12px; z-index: 3;
      min-width: 32px; height: 28px; padding: 0 9px;
      display: inline-flex; align-items: center; justify-content: center;
      border: 1px solid var(--amber); border-radius: 999px;
      background: rgba(255, 194, 74, .12); color: var(--amber);
      box-shadow: 0 0 12px rgba(255, 194, 74, .35);
      font-family: var(--font-display); font-size: 17px; font-weight: 700; letter-spacing: .04em;
      font-variant-numeric: tabular-nums; pointer-events: none;
    }
    .deck-badge[hidden] { display: none; }`;
  document.head.append(style);

  const counts = {};
  for (const a of apps) counts[a.id] = Deck.store.get(`${a.id}.unread`, null);

  // Find an app's tile, whatever markup hub.js uses
  function tileFor(app) {
    const launcher = document.getElementById('launcher') || document;
    const candidates = launcher.querySelectorAll('.launch, a, button');
    for (const el of candidates) {
      if (el.dataset && (el.dataset.id === app.id || el.dataset.app === app.id)) return el;
      const href = el.getAttribute && el.getAttribute('href');
      if (href && (href === `/${app.id}/` || href.startsWith(`/${app.id}/?`))) return el;
    }
    for (const el of launcher.querySelectorAll('.launch')) {
      const name = el.querySelector('.launch-name');
      if (name && name.textContent.trim().toLowerCase() === String(app.name).toLowerCase()) return el;
    }
    return null;
  }

  function paint() {
    for (const app of apps) {
      const tile = tileFor(app);
      if (!tile) continue;
      let b = tile.querySelector(':scope > .deck-badge');
      const c = counts[app.id];
      const n = c && !c.demo ? Number(c.count) || 0 : 0;
      if (!n) { if (b) b.hidden = true; continue; }
      if (!b) {
        b = document.createElement('span');
        b.className = 'deck-badge';
        b.setAttribute('aria-hidden', 'true');
        if (getComputedStyle(tile).position === 'static') tile.style.position = 'relative';
        tile.append(b);
      }
      b.hidden = false;
      b.textContent = n > 99 ? '99+' : c.more ? `${n}+` : String(n);
      tile.setAttribute('data-badge', `${b.textContent} ${app.badgeLabel || 'new'}`);
    }
  }

  async function refresh() {
    if (Deck.demo || Deck.locked || document.hidden || !Deck.code) return;
    await Promise.all(apps.map(async (app) => {
      try {
        const r = await Deck.api(app.badge, {}, { timeout: 15000 });
        counts[app.id] = { count: Number(r.count ?? r.total) || 0, more: !!r.more, at: Date.now() };
        Deck.store.set(`${app.id}.unread`, counts[app.id]);
      } catch { /* leave the last count; the tile's own status shows setup problems */ }
    }));
    paint();
  }

  // hub.js may draw (or redraw) the tiles after this script runs
  const launcher = document.getElementById('launcher');
  if (launcher) new MutationObserver(() => { if (!paint._busy) { paint._busy = true; requestAnimationFrame(() => { paint(); paint._busy = false; }); } })
    .observe(launcher, { childList: true });

  let timer = null;
  const start = () => { clearInterval(timer); timer = setInterval(refresh, POLL_MS); };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearInterval(timer); else { paint(); refresh(); start(); }
  });
  // Back from an app (bfcache): repaint with the count that app saved
  window.addEventListener('pageshow', () => {
    for (const a of apps) counts[a.id] = Deck.store.get(`${a.id}.unread`, counts[a.id]);
    paint();
  });

  paint();
  setTimeout(refresh, 600); // let the hub's own status call go first
  start();
})();
