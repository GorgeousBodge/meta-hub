/* ==========================================================================
   Deck hub — launcher at the site root. Lists the apps in deck/apps.js,
   shows whether each one is set up (from /api/status), and is the place to
   enter or change the shared access code.
   ========================================================================== */
(() => {
  'use strict';

  const APPS = window.DECK_APPS || [];
  const grid = document.getElementById('launcher');
  const KEY_ICON = '<path d="M24 38a10 10 0 1 1 7.07-17.07A10 10 0 0 1 24 38Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M31 31l19 19M43 43l5-5M38 48l4-4" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>';

  function tile({ id, name, blurb, icon, cls = '' }) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `card focusable launch ${cls}`.trim();
    b.dataset.id = id;
    b.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true">${icon}</svg><span class="launch-name"></span><span class="card-meta"></span>`;
    b.querySelector('.launch-name').textContent = name;
    b.querySelector('.card-meta').textContent = blurb;
    return b;
  }

  function render() {
    const tiles = APPS.map((a) => tile(a));
    tiles.push(tile({
      id: '_code',
      name: 'Code',
      blurb: Deck.demo ? 'Demo · enter code' : Deck.code ? 'Saved on glasses' : 'Not set',
      icon: KEY_ICON,
      cls: 'launch-code',
    }));
    grid.style.setProperty('--cols', tiles.length > 4 ? 3 : 2);
    grid.replaceChildren(...tiles);
    Deck.focus(grid.querySelector('.focusable'));
  }

  function setMeta(id, text, kind = '') {
    const m = grid.querySelector(`[data-id="${id}"] .card-meta`);
    if (!m) return;
    m.textContent = text;
    m.classList.toggle('is-warn', kind === 'warn');
    m.classList.toggle('is-good', kind === 'good');
  }

  // Ask the server which apps have their keys set
  async function checkStatus() {
    if (Deck.demo) { Deck.status('demo', 'Demo'); return; }
    Deck.status('loading', 'Linking');
    try {
      const s = await Deck.api('status');
      Deck.status('live', 'Online');
      for (const a of APPS) {
        const st = s.apps && s.apps[a.id];
        if (!st) continue;
        if (!st.ready) setMeta(a.id, 'Needs setup', 'warn');
        else if (a.id === 'news' && !st.ai) setMeta(a.id, 'Ready · AI summaries off');
        else if (a.id === 'nav' && !(st.trains && st.buses)) setMeta(a.id, `Ready · ${!st.trains ? 'no trains' : 'no buses'}`);
      }
    } catch (err) {
      if (!err.locked) { Deck.status('offline', 'Offline'); Deck.toast(err.message, { error: true }); }
    }
  }

  function open(id) {
    if (id === '_code') {
      Deck.lock(Deck.code ? 'Change access code' : 'Enter access code', { calm: true, dismissible: true, demo: false });
      return;
    }
    try { sessionStorage.setItem('deck.fromHub', '1'); } catch { /* ignore */ }
    location.href = `/${id}/${Deck.demo ? '?demo' : ''}`;
  }

  document.addEventListener('keydown', (e) => {
    const a = Deck.action(e);
    if (!a) return;
    e.preventDefault();
    const cur = document.activeElement;
    const items = [...grid.querySelectorAll('.focusable')];
    if (a === 'select') {
      if (e.repeat) return;
      if (items.includes(cur)) { Deck.press(cur); open(cur.dataset.id); } else Deck.focus(items[0]);
      return;
    }
    if (a === 'back') { Deck.bump(cur); return; }
    if (!items.includes(cur)) { Deck.focus(items[0]); return; }
    const next = Deck.nearest(items, cur, a);
    if (next) Deck.focus(next); else Deck.bump(cur);
  });
  document.addEventListener('keyup', (e) => { if (e.key === ' ') e.preventDefault(); });
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.launch');
    if (b) open(b.dataset.id); // pointer / touch (Enter is handled above and doesn't click)
  });

  try { sessionStorage.removeItem('deck.fromHub'); } catch { /* ignore */ }
  Deck.hints([['Swipe', 'move'], ['Pinch', 'open']]);
  render();
  checkStatus();
})();
