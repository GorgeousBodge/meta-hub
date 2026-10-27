/* ==========================================================================
   Starter Deck — the smallest complete app. Copy the folder to begin a new one.
   Everything shared (access code, lock screen, demo mode, HUD, toasts, keys)
   comes from /deck/deck.js; see deck/README.md for the reference.
   ========================================================================== */
(() => {
  'use strict';

  // Flip to true once api/starter.js exists (see docs/NEW-APP.md)
  const HAS_SERVER = false;

  const DEMO_ITEMS = [
    { title: 'First item', meta: 'Pinch to hear it' },
    { title: 'Second item', meta: 'Swipe to move' },
    { title: 'Third item', meta: 'Back returns to the hub' },
  ];

  const list = document.getElementById('list');

  async function load() {
    if (Deck.demo || !HAS_SERVER) return DEMO_ITEMS;
    const data = await Deck.api('starter');          // GET /api/starter?c=CODE
    return data.items;
  }

  function render(items) {
    const cards = items.map((item) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'card focusable';
      b.innerHTML = '<span class="card-title"></span><span class="card-meta"></span>';
      b.querySelector('.card-title').textContent = item.title; // textContent: data is untrusted
      b.querySelector('.card-meta').textContent = item.meta;
      b._select = () => { Deck.say(item.title); Deck.toast(item.title); };
      return b;
    });
    list.replaceChildren(...cards);
    Deck.focus(list.querySelector('.focusable'));
  }

  function onKey(e) {
    const action = Deck.action(e);
    if (!action) return;
    e.preventDefault();
    const cur = document.activeElement;
    const items = [...list.querySelectorAll('.focusable')];
    if (action === 'select') { if (!e.repeat && cur?._select) { Deck.press(cur); cur._select(); } return; }
    if (action === 'back') { if (!Deck.toHub()) Deck.bump(cur); return; }
    if (!items.includes(cur)) { Deck.focus(items[0]); return; }
    const next = Deck.nearest(items, cur, action);
    if (next) Deck.focus(next); else Deck.bump(cur);
  }

  async function init() {
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', (e) => { const b = e.target.closest('.focusable'); if (b?._select) b._select(); });
    Deck.title('Starter', 'Template');
    Deck.hints([['Swipe', 'move'], ['Pinch', 'select'], ['Back', 'hub']]);
    try {
      render(await load());
      Deck.status(Deck.demo ? 'demo' : 'live');
    } catch (err) {
      if (!err.locked) { Deck.status('offline'); Deck.toast(err.message, { error: true }); }
    }
  }

  init();
})();
