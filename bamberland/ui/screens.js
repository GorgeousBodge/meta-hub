/* ==========================================================================
   Bamberland — the screens: title, save slots, naming, play, item ring,
   dialogue, Kev's shop, the map, cut scenes, out cold and the ending.
   The rules are in engine/, the drawing in ui/render.js.
   ========================================================================== */
(() => {
  'use strict';

  const Deck = window.Deck;
  const LORE = window.BAMBER_LORE;
  const WORLD = window.BAMBER_WORLD;
  const CUTS = window.BAMBER_CUTS || {};
  const ART = window.BAMBER_ART;
  const Draw = window.BamberRender;
  const Px = window.BamberPixel;
  const Cut = window.BamberCut;
  const { Sound, Music } = window.BamberAudio;
  const $ = (id) => document.getElementById(id);

  const SLOTS = 3;
  const slotKey = (n) => 'bamberland.slot' + n;
  const LAST_KEY = 'bamberland.last';
  const OLD_KEY = 'bamberland.save';         // the Mill prototype's save

  const board = $('board');
  const views = { title: $('titleView'), slots: $('slotsView'), naming: $('nameView') };
  const dialogEl = $('dialog');
  const overlayEl = $('overlay');

  let mode = 'title';      // title | slots | naming | play | ring | dialog | shop | map | cut | over | end
  let slot = 0;            // the save slot in play (1–3)
  let dialogQueue = [];    // [{ who, text, speaker }]
  let afterDialog = 'play';
  let afterCut = 'play';
  let pendingShop = null;
  let roomTune = null;
  let ring = { items: [], i: 0 };
  let shop = null;
  let map = null;
  let fx = [];
  let banner = null, bannerTimer = null, fxTimer = null;

  /* ---------- the engine, wired up ---------- */
  const game = window.BamberEngine.create({ world: WORLD, lore: LORE }, {
    toast: (m) => Deck.toast(m),
    dialog: (lines, who, speaker) => openDialog(lines, who || '', speaker),
    telk: (lines, who, speaker) => { Sound.play('pick'); openDialog(lines, who, speaker); },
    sound: (n) => Sound.play(n),
    fx: (type, at) => addFx(type, at),
    save: (s) => { if (slot) { Deck.store.set(slotKey(slot), s); Deck.store.set(LAST_KEY, slot); } },
    enter: (name) => { fx = []; showBanner(name); },
    music: (id) => { roomTune = id; if (mode !== 'cut') Music.play(id); },
    cut: (id) => playCut(id),
    shop: (id) => { pendingShop = id; if (mode !== 'dialog' && mode !== 'cut') openShop(); },
    over: () => { mode = 'over'; dialogQueue = []; dialogEl.hidden = true; showOverlay(); },
    win: () => { mode = 'end'; dialogQueue = []; dialogEl.hidden = true; showOverlay(); },
    change: () => {},
  });
  const fmt = (s, x) => game.fmt(s, x);

  /* ---------- drawing ---------- */
  let drawQueued = false;
  function redraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => {
      drawQueued = false;
      if (!inGame() || mode === 'cut') return;
      Draw.draw(board, game, {
        fx, banner,
        ring: mode === 'ring' ? ring : null,
        shop: mode === 'shop' ? shop : null,
        map: mode === 'map' ? map : null,
      });
      updateHud();
      updateHints();
    });
  }
  const inGame = () => !['title', 'slots', 'naming'].includes(mode);
  function addFx(type, at) {
    if (type === 'bump') return;
    fx.push({ type, ...(at || {}) });
    clearTimeout(fxTimer);
    fxTimer = setTimeout(() => { fx = []; redraw(); }, 220);   // one extra frame, then quiet
  }
  function showBanner(name) {
    banner = fmt(name);
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { banner = null; redraw(); }, 1700);
  }

  /* ---------- HUD ---------- */
  const HEART = (fill) => `<svg viewBox="0 0 24 24" class="bl-heart ${fill}" aria-hidden="true"><defs><clipPath id="hh"><rect x="0" y="0" width="12" height="24"/></clipPath></defs>`
    + '<path class="bl-heart-o" d="M12 20.5 4.2 12.9A4.8 4.8 0 0 1 12 6.4a4.8 4.8 0 0 1 7.8 6.5Z"/>'
    + (fill === 'full' ? '<path class="bl-heart-f" d="M12 20.5 4.2 12.9A4.8 4.8 0 0 1 12 6.4a4.8 4.8 0 0 1 7.8 6.5Z"/>' : '')
    + (fill === 'half' ? '<path class="bl-heart-f" clip-path="url(#hh)" d="M12 20.5 4.2 12.9A4.8 4.8 0 0 1 12 6.4a4.8 4.8 0 0 1 7.8 6.5Z"/>' : '')
    + '</svg>';
  const ICONS = {
    key: '<svg viewBox="0 0 24 24" class="ico"><circle cx="7.5" cy="12" r="3.5"/><path d="M11 12h10M17 12v3M20 12v2"/></svg>',
    bigkey: '<svg viewBox="0 0 24 24" class="ico"><circle cx="7" cy="12" r="4.5"/><circle cx="7" cy="12" r="1.5"/><path d="M11.5 12H22M16 12v4M19 12v4M22 12v3"/></svg>',
    coin: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 2.5a6 6 0 0 1 6 6c0 4.2-3.4 7.5-6 7.5s-6-3.3-6-7.5a6 6 0 0 1 6-6Z"/><path d="M11 16h2l-1 1.6ZM12 17.6c-1.5 1.6 1.5 2.4 0 4"/></svg>',
    thwacker: '<svg viewBox="0 0 24 24" class="ico"><rect x="11" y="3" width="10" height="7" rx="1.5" transform="rotate(35 16 6.5)"/><path d="M12.5 10.5 4 20"/><circle cx="16.3" cy="6.6" r="1.2"/></svg>',
    hopstaff: '<svg viewBox="0 0 24 24" class="ico"><path d="M6 21 18 3"/><path d="M15.5 6.5c1.8.4 2.8 1.6 2.5 3.4M8.5 17.5c-1.8-.4-2.8-1.6-2.5-3.4"/></svg>',
    grapple: '<svg viewBox="0 0 24 24" class="ico"><circle cx="8" cy="15" r="5"/><circle cx="8" cy="15" r="2"/><path d="M12 11.5 18 4M18 4c2.2 0 2.6 2 2 3.2M18 4c0-2.2-2-2.6-3.2-2"/></svg>',
  };
  function updateHud() {
    const G = game.G;
    if (!G) return;
    const hearts = [];
    for (let i = 0; i < G.maxHearts / 2; i++) {
      const v = G.hearts - i * 2;
      hearts.push(HEART(v >= 2 ? 'full' : v === 1 ? 'half' : 'empty'));
    }
    $('hearts').innerHTML = hearts.join('');
    $('hearts').classList.toggle('is-shielded', G.shield > 0);
    $('hearts').classList.toggle('is-many', G.maxHearts > 10 && G.maxHearts <= 14);
    $('hearts').classList.toggle('is-lots', G.maxHearts > 14);
    $('keys').innerHTML = `${ICONS.key}<b>${G.keys}</b>`;
    $('keys').hidden = game.R.field && !G.keys;          // keys only matter in dungeons
    $('bigkey').innerHTML = ICONS.bigkey;
    $('bigkey').classList.toggle('is-on', !!G.bigKey);
    $('bigkey').hidden = game.R.field && !G.bigKey;
    $('coins').innerHTML = `${ICONS.coin}<b>${G.coins}</b>`;
    const it = itemInfo(G.equip);
    $('equip').innerHTML = `${ICONS[G.equip] || ''}<span>${Deck.esc(it ? it.name : '')}</span>`;
  }
  function updateHints() {
    if (mode === 'play') Deck.hints([['Swipe', 'step'], ['Pinch', game.pinchVerb().toLowerCase()], ['Back', 'items']]);
    else if (mode === 'ring') Deck.hints([['Swipe', 'choose'], ['Pinch', 'use'], ['Back', 'close']]);
    else if (mode === 'dialog') Deck.hints([['Pinch', 'next'], ['Back', 'close']]);
    else if (mode === 'shop') Deck.hints([['Swipe', 'choose'], ['Pinch', 'buy'], ['Back', 'leave']]);
    else if (mode === 'map') Deck.hints(map && map.pages.length > 1 ? [['Swipe', 'page'], ['Back', 'close']] : [['Pinch', 'close'], ['Back', 'close']]);
    else if (mode === 'cut') Deck.hints([['Pinch', 'next'], ['Back', 'skip']]);
    else if (mode === 'over' || mode === 'end') Deck.hints([['Pinch', 'continue']]);
  }
  function showHud(play) {
    $('stats').hidden = !play;
    $('equip').hidden = !play;
    $('hudTitle').hidden = play;
  }

  /* ---------- dialogue, with a portrait ---------- */
  function openDialog(lines, who, speaker) {
    for (const text of lines) dialogQueue.push({ who, text, speaker });
    if (mode === 'cut' || mode === 'over' || mode === 'end') return;   // shown after
    if (mode !== 'dialog') {
      afterDialog = ['ring', 'shop', 'map'].includes(mode) || !inGame() ? 'play' : mode;
      mode = 'dialog';
    }
    showDialogPage();
  }
  function portraitFor(speaker) {
    const p = speaker && LORE.people[speaker];
    if (!p) return null;
    if (p.portrait && ART.PORTRAITS[p.portrait]) return { img: Px.portrait(p.portrait), scale: 3, x: 0, y: 0 };
    if (p.sprite) return { img: Px.art(p.sprite), scale: 8, x: 8, y: 0 };   // 10×12 sprite, shown large
    return null;
  }
  function showDialogPage() {
    const page = dialogQueue[0];
    if (!page) { dialogEl.hidden = true; return; }
    dialogEl.hidden = false;
    $('dialogWho').textContent = page.who || '';
    $('dialogWho').hidden = !page.who;
    $('dialogText').textContent = page.text;
    $('dialogMore').textContent = dialogQueue.length > 1 ? 'Pinch ▸' : 'Pinch ✓';
    const face = $('dialogFace'), pic = portraitFor(page.speaker);
    dialogEl.classList.toggle('has-face', !!pic);
    face.hidden = !pic;
    if (pic) { const g = Px.prep(face, 96, 96); Px.blit(g, pic.img, pic.x, pic.y, pic.scale); }
    Sound.play('talk');
    updateHints();
  }
  function nextDialog(all) {
    if (all) dialogQueue = []; else dialogQueue.shift();
    if (dialogQueue.length) { showDialogPage(); return; }
    dialogEl.hidden = true;
    if (mode === 'dialog') mode = afterDialog || 'play';
    if (pendingShop && mode === 'play') { openShop(); return; }
    redraw();
  }

  /* ---------- cut scenes ---------- */
  function playCut(id) {
    const scene = CUTS[id];
    if (!scene) return;
    if (mode !== 'cut') afterCut = inGame() && !['dialog', 'ring', 'shop', 'map'].includes(mode) ? mode : 'play';
    mode = 'cut';
    board.hidden = false;
    showHud(false);
    Deck.title(LORE.world, '');
    if (scene.music) Music.play(scene.music);
    Cut.start(board, scene, { cap: (game.G && game.G.cap) || 0, onPanel: showCutText });
    updateHints();
  }
  function showCutText(p, i, n) {
    dialogEl.hidden = false;
    $('dialogWho').hidden = true;
    $('dialogFace').hidden = true;
    dialogEl.classList.remove('has-face');
    $('dialogText').textContent = fmt(p.text || '');
    $('dialogMore').textContent = i < n - 1 ? `${i + 1}/${n} Pinch ▸` : `${n}/${n} Pinch ✓`;
  }
  function endCut(skip) {
    if (skip) Cut.stop();
    dialogEl.hidden = true;
    mode = afterCut === 'cut' ? 'play' : afterCut;
    showHud(true);
    Music.play(roomTune);
    if (dialogQueue.length) {
      afterDialog = 'play';
      mode = 'dialog';
      showDialogPage();
    } else if (pendingShop) openShop();
    redraw();
  }

  /* ---------- out cold / ending ---------- */
  function showOverlay() {
    const G = game.G;
    if (mode === 'over') {
      $('overTitle').textContent = fmt(LORE.outCold.title);
      $('overText').textContent = fmt(LORE.outCold.text);
      overlayEl.className = 'bl-overlay is-over';
    } else {
      $('overTitle').textContent = fmt(LORE.ending.title);
      $('overText').textContent = LORE.ending.lines.map((l) => fmt(l)).join(' ') + `  (${G.turns} turns)`;
      overlayEl.className = 'bl-overlay is-end';
    }
    overlayEl.hidden = false;
    updateHints();
    redraw();
  }

  // An item's name and description, allowing for Brendan's reforging
  function itemInfo(id) {
    const it = LORE.items[id];
    if (!it) return null;
    const lv = (game.G && game.G.forge) || 0;
    const f = id === 'thwacker' && lv && it.forged && it.forged[lv - 1];
    return { name: fmt(f ? f.name : it.name), desc: fmt(f ? f.desc : it.desc) };
  }

  /* ---------- item ring ---------- */
  function openRing(keep) {
    const G = game.G;
    const items = [];
    for (const id of ['thwacker', 'hopstaff', 'grapple']) {
      if (G.items[id]) { const info = itemInfo(id); items.push({ id, kind: 'item', name: info.name, desc: info.desc, on: G.equip === id }); }
    }
    for (const [id, e] of Object.entries(LORE.elixirs)) {
      if (G.bag[id] > 0) items.push({ id, kind: 'elixir', name: fmt(e.name), desc: fmt(e.desc), count: G.bag[id] });
    }
    items.push({ id: 'map', kind: 'act', name: 'Map', desc: 'Where you have been, and where Telkperson last pointed.' });
    items.push({ id: 'reset', kind: 'act', name: 'Reset room', desc: 'Put this room back as it was when you came in.' });
    items.push({
      id: 'music', kind: 'act',
      name: Music.supported ? `Music: ${Music.on ? 'On' : 'Off'}` : 'Music: n/a',
      desc: Music.supported ? 'A short tune for each place. Uses a little battery.' : 'Sound is not available here.',
    });
    items.push({
      id: 'sound', kind: 'act',
      name: Sound.supported ? `Sound: ${Sound.on ? 'On' : 'Off'}` : 'Sound: n/a',
      desc: Sound.supported ? 'Small blips for steps, hits and pickups.' : 'Sound is not available here.',
    });
    items.push({ id: 'title', kind: 'act', name: 'Save & quit', desc: 'Back to the title screen. Your progress is kept.' });
    const cur = items.findIndex((x) => x.on);
    const i = keep != null ? Math.min(keep, items.length - 1) : cur < 0 ? 0 : cur;
    ring = { items, i };
    mode = 'ring';
    redraw();
  }
  function useRing() {
    const it = ring.items[ring.i];
    if (!it) return;
    if (it.kind === 'item') { game.equip(it.id); Sound.play('lift'); mode = 'play'; }
    else if (it.kind === 'elixir') {
      const r = game.drink(it.id);
      if (!r.ok) { if (r.msg) Deck.toast(r.msg); return; }
      mode = 'play';
      openDialog([r.msg], fmt(LORE.elixirs[it.id].name));
      return;
    } else if (it.id === 'map') { openMap(); return; }
    else if (it.id === 'reset') { mode = 'play'; game.resetRoom(); }
    else if (it.id === 'music' || it.id === 'sound') {
      const S = it.id === 'music' ? Music : Sound;
      if (!S.supported) { Deck.toast('Sound is not available'); return; }
      S.toggle();
      if (it.id === 'music' && Music.on) Music.play(roomTune);
      openRing(ring.i);
      return;
    } else if (it.id === 'title') { showTitle(); return; }
    redraw();
  }

  /* ---------- Kev's shop ---------- */
  function openShop() {
    const id = pendingShop;
    pendingShop = null;
    if (!id) return;
    const p = LORE.people[id];
    shop = { id, title: p ? `${fmt(game.nameOf(id))}'s Potions` : 'Shop', items: game.shopStock(id), roof: id === 'kev' ? game.spent() : null, i: (shop && shop.id === id) ? shop.i : 0 };
    mode = 'shop';
    redraw();
  }
  function shopBuy() {
    const it = shop.items[shop.i];
    if (!it) return;
    const r = game.buy(it.id);
    if (r.goal) return;                  // the cut scene has taken over
    Deck.toast(r.msg, r.ok ? undefined : { error: true });
    shop.items = game.shopStock(shop.id);
    if (shop.roof) shop.roof = game.spent();
    redraw();
  }

  /* ---------- the map ---------- */
  function openMap() {
    const pages = game.mapPages();
    if (!pages.length) { mode = 'play'; redraw(); return; }
    const here = pages.findIndex((p) => p.here);
    map = { pages, i: here < 0 ? 0 : here, hint: game.hint(), hintFrom: fmt(game.nameOf('telk')) };
    mode = 'map';
    redraw();
  }

  /* ---------- title ---------- */
  function readSlot(n) {
    const s = Deck.store.get(slotKey(n), null);
    if (!s) return { empty: true };
    const m = game.migrate(s);
    if (m.error) return { bad: true, error: m.error };
    return { save: m.save };
  }
  function lastSlot() {
    const n = Number(Deck.store.get(LAST_KEY, 0));
    return n >= 1 && n <= SLOTS && readSlot(n).save ? n : 0;
  }
  function showView(name) {
    for (const [k, el] of Object.entries(views)) el.hidden = k !== name;
    board.hidden = true;
    dialogEl.hidden = true;
    overlayEl.hidden = true;
    showHud(false);
  }
  function showTitle() {
    mode = 'title';
    Cut.stop();
    dialogQueue = []; pendingShop = null;
    showView('title');
    Deck.title(LORE.world, '');
    $('titleLore').textContent = (LORE.intro || []).map((l) => fmt(l)).join(' ');
    const last = lastSlot();
    $('btnContinue').disabled = !last;
    syncToggles();
    Draw.drawTitleArt($('titleArt'), 0);
    Music.play(null);
    Deck.focus(last ? $('btnContinue') : $('btnPlay'));
    Deck.hints([['Swipe', 'move'], ['Pinch', 'select'], ['Back', 'hub']]);
  }
  function syncToggles() {
    for (const [id, S, label] of [['btnMusic', Music, 'Music'], ['btnSound', Sound, 'Sound']]) {
      $(id).querySelector('.key-label').textContent = S.supported ? `${label}: ${S.on ? 'On' : 'Off'}` : `${label}: n/a`;
      $(id).classList.toggle('key-speak', S.on);
    }
  }
  function titleSelect(btn) {
    Deck.press(btn);
    if (btn.id === 'btnContinue') { const n = lastSlot(); if (n) startSlot(n); }
    else if (btn.id === 'btnPlay') showSlots();
    else if (btn.id === 'btnMusic' || btn.id === 'btnSound') {
      const S = btn.id === 'btnMusic' ? Music : Sound;
      if (!S.supported) { Deck.toast('Sound is not available'); return; }
      S.toggle();
      if (S === Music && Music.on) Music.play('wood');
      if (S === Music && !Music.on) Music.play(null);
      syncToggles();
    }
  }

  /* ---------- save slots ---------- */
  let erasing = false, confirmErase = 0;
  function showSlots(focusN) {
    mode = 'slots';
    erasing = false; confirmErase = 0;
    showView('slots');
    Deck.title('Choose a slot', '');
    renderSlots();
    Guard.arm();
    Deck.focus($('slot' + (focusN || lastSlot() || 1)));
    Deck.hints([['Swipe', 'move'], ['Pinch', 'select'], ['Back', 'title']]);
  }
  function renderSlots() {
    for (let n = 1; n <= SLOTS; n++) {
      const b = $('slot' + n), r = readSlot(n);
      let title = `Slot ${n}`, detail = 'Empty: pinch for a new game';
      if (r.save) {
        const s = r.save, room = WORLD.rooms[s.entry.room];
        title = `Slot ${n} · ${s.names && s.names.hero ? s.names.hero : LORE.hero.name}`;
        detail = `${room ? game.fmt(room.name) : '?'} · ${s.maxHearts / 2} hearts · ${s.coins} ${LORE.money.many}`;
      } else if (r.bad) detail = r.error === 'newer' ? 'From a newer version of the game' : "Can't be read: pinch to start again";
      if (erasing) detail = r.empty ? 'Empty' : confirmErase === n ? 'Pinch again to erase it for good' : 'Pinch to erase';
      b.querySelector('.bl-slot-title').textContent = title;
      b.querySelector('.bl-slot-detail').textContent = detail;
      b.classList.toggle('is-warn', erasing && confirmErase === n);
    }
    $('btnErase').querySelector('.key-label').textContent = erasing ? 'Done erasing' : 'Erase a slot';
    const old = Deck.store.get(OLD_KEY, null);
    $('slotsNote').textContent = old
      ? "There's a save from the Mill prototype. This new version can't use it; it's cleared when you start a new game."
      : 'The game saves itself as you play.';
  }
  function slotSelect(btn) {
    Deck.press(btn);
    if (btn.id === 'btnErase') { erasing = !erasing; confirmErase = 0; renderSlots(); return; }
    const n = Number(btn.dataset.slot);
    const r = readSlot(n);
    if (erasing) {
      if (r.empty) return;
      if (confirmErase !== n) { confirmErase = n; renderSlots(); return; }
      Deck.store.set(slotKey(n), null);
      if (Number(Deck.store.get(LAST_KEY, 0)) === n) Deck.store.set(LAST_KEY, 0);
      confirmErase = 0;
      Deck.toast(`Slot ${n} erased`);
      renderSlots();
      return;
    }
    if (r.save) startSlot(n);
    else showNaming(n);
  }

  /* ---------- naming ---------- */
  let naming = null;   // { slot, names, editing }
  let nameDraft = {};  // names chosen so far, kept if you pop back to the slots and return
  let editEnded = 0;   // when the text box last closed (see doBack)
  function nameable() {
    return [['hero', 'Hero']].concat(Object.entries(LORE.people).filter(([, p]) => p.nameable).map(([id, p]) => [id, p.role || '']));
  }
  function defaultName(id) { return id === 'hero' ? LORE.hero.name : LORE.people[id].name; }
  function showNaming(n) {
    mode = 'naming';
    naming = { slot: n, names: nameDraft, editing: null };
    showView('naming');
    Deck.title('Who’s who', `Slot ${n}`);
    const grid = $('nameGrid');
    grid.innerHTML = '';
    for (const [id] of nameable()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'key focusable bl-name';
      b.dataset.who = id;
      b.innerHTML = '<span class="bl-name-role"></span><span class="key-label"></span>';
      grid.appendChild(b);
    }
    renderNames();
    Guard.arm();
    Deck.focus($('btnBegin'));
    Deck.hints([['Swipe', 'move'], ['Pinch', 'rename'], ['Back', 'slots']]);
  }
  function renderNames() {
    for (const b of $('nameGrid').querySelectorAll('.bl-name')) {
      const id = b.dataset.who;
      b.querySelector('.bl-name-role').textContent = id === 'hero' ? 'The hero' : '';
      b.querySelector('.key-label').textContent = naming.names[id] || defaultName(id);
    }
  }
  function nameSelect(btn) {
    Deck.press(btn);
    if (btn.id === 'btnBegin') { beginGame(); return; }
    const id = btn.dataset.who;
    if (!id) return;
    const input = $('nameInput');
    naming.editing = id;
    $('nameEdit').hidden = false;
    $('nameEditFor').textContent = `Rename ${naming.names[id] || defaultName(id)}`;
    input.value = naming.names[id] || defaultName(id);
    // Focusing a text box brings up the glasses' own handwriting or dictation
    input.focus();
    try { input.select(); } catch { /* fine */ }
  }
  // Keep whatever is in the box. An empty box goes back to the original name.
  function keepName() {
    const id = naming && naming.editing;
    if (!id) return;
    const v = $('nameInput').value.replace(/\s+/g, ' ').trim().slice(0, 16);
    if (v && v !== defaultName(id)) naming.names[id] = v; else delete naming.names[id];
  }
  // Close the text box. The name is always kept: on the glasses, closing the
  // handwriting or dictation panel can arrive as a Back, so Back means "done".
  function endEdit() {
    const input = $('nameInput'), id = naming && naming.editing;
    if (!id) return;
    keepName();
    naming.editing = null;
    editEnded = Date.now();
    $('nameEdit').hidden = true;
    input.blur();
    renderNames();
    Deck.focus($('nameGrid').querySelector(`[data-who="${id}"]`));
  }
  function beginGame() {
    const n = naming.slot;
    Deck.store.set(OLD_KEY, null);
    slot = n;
    enterPlay();
    game.newGame(naming.names);
    naming = null;
    nameDraft = {};
    redraw();
  }

  /* ---------- play ---------- */
  function enterPlay() {
    for (const el of Object.values(views)) el.hidden = true;
    board.hidden = false;
    Deck.title(LORE.world, '');
    showHud(true);
    mode = 'play';
    Guard.arm();
  }
  function startSlot(n) {
    slot = n;
    enterPlay();
    const r = game.load(readSlot(n).save);
    if (!r.ok) { slot = 0; Deck.toast('That save could not be read', { error: true }); showSlots(n); return; }
    if (mode === 'play') Music.play(roomTune);
    redraw();
  }

  /* ---------- Back ----------
     On the glasses, Back is not a key: the system steps back through the
     page's history, and with no history left it leaves the app. So off the
     title screen, the game keeps one spare history entry (a "guard"). Back
     uses it up, the game handles it, and then puts a fresh guard back.
     Escape does the same on a computer. The glasses allow only five
     history entries; this uses one. */
  const Guard = {
    on: false, timer: null,
    arm() {
      clearTimeout(this.timer);
      if (this.on) return;
      // Re-armed just after Back is handled, not during it (Meta's guidance)
      this.timer = setTimeout(() => {
        if (this.on || mode === 'title') return;
        try { history.pushState({ bamberland: 1 }, ''); this.on = true; } catch { /* history blocked */ }
      }, 60);
    },
  };
  let lastBack = 0;
  function doBack() {
    const now = Date.now();
    if (now - lastBack < 200) return;      // one gesture, one Back, however it arrives
    lastBack = now;
    if (mode === 'title') { if (!Deck.toHub()) Deck.bump(document.activeElement); return; }
    if (mode === 'slots') { showTitle(); return; }
    if (mode === 'naming') {
      if (naming && naming.editing) endEdit();
      // A Back just after the text box closed is the same gesture, not a second one
      else if (Date.now() - editEnded > 700) showSlots(naming && naming.slot);
      Guard.arm();
      return;
    }
    if (mode === 'cut') endCut(true);
    else if (mode === 'dialog') nextDialog(true);
    else if (mode === 'ring' || mode === 'shop' || mode === 'map') { mode = 'play'; redraw(); }
    else if (mode === 'play') openRing();
    // 'over' and 'end' wait for a pinch
    Guard.arm();
  }
  function onPopState(e) {
    if (e.state && e.state.bamberland) { Guard.on = true; return; }   // moved forward onto a guard
    if (!Guard.on) return;                                            // not ours
    Guard.on = false;
    doBack();
  }

  /* ---------- keys ---------- */
  function menuKeys(a, items, select) {
    const cur = document.activeElement;
    if (a === 'select') { if (items.includes(cur)) select(cur); else Deck.focus(items[0]); return; }
    if (!items.includes(cur)) { Deck.focus(items[0]); return; }
    const next = Deck.nearest(items, cur, a);
    if (next) Deck.focus(next); else Deck.bump(cur);
  }
  const focusables = (el) => [...el.querySelectorAll('.focusable:not([disabled])')];

  function onKey(e) {
    // Typing a name: the text box gets every key except Enter and Escape
    if (naming && naming.editing && e.target === $('nameInput')) {
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); endEdit(); }
      return;
    }
    const a = Deck.action(e);
    if (!a) return;
    e.preventDefault();
    if (e.repeat && (a === 'select' || a === 'back')) return;
    if (a === 'back') { doBack(); return; }

    if (mode === 'title') return menuKeys(a, focusables(views.title), titleSelect);
    if (mode === 'slots') {
      if (confirmErase && a !== 'select') { confirmErase = 0; renderSlots(); }
      return menuKeys(a, focusables(views.slots), slotSelect);
    }
    if (mode === 'naming') return menuKeys(a, focusables(views.naming), nameSelect);
    if (mode === 'cut') { if (a === 'select' && !Cut.next()) endCut(false); return; }
    if (mode === 'dialog') { if (a === 'select') nextDialog(false); return; }
    if (mode === 'over') {
      if (a === 'select') { overlayEl.hidden = true; mode = 'play'; game.revive(); redraw(); }
      return;
    }
    if (mode === 'end') { if (a === 'select') showTitle(); return; }
    if (mode === 'ring') {
      const n = ring.items.length;
      if (a === 'select') { useRing(); return; }
      ring.i = (ring.i + (a === 'right' || a === 'down' ? 1 : -1) + n) % n;
      Sound.play('pick');
      redraw();
      return;
    }
    if (mode === 'shop') {
      const n = shop.items.length;
      if (a === 'select') { shopBuy(); return; }
      if (a === 'up' || a === 'down') { shop.i = (shop.i + (a === 'down' ? 1 : -1) + n) % n; Sound.play('pick'); redraw(); }
      return;
    }
    if (mode === 'map') {
      if (a === 'select') { mode = 'play'; redraw(); return; }
      const n = map.pages.length;
      if (n > 1 && (a === 'left' || a === 'right')) { map.i = (map.i + (a === 'right' ? 1 : -1) + n) % n; redraw(); }
      return;
    }
    if (mode === 'play') {
      game.act(a === 'select' ? 'pinch' : a);
      if (mode === 'play' || mode === 'dialog') redraw();
    }
  }

  function init() {
    document.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPopState);
    // After a reload we may already be sitting on a guard entry
    Guard.on = !!(history.state && history.state.bamberland);
    const click = (el, fn) => el.addEventListener('click', (e) => {
      const b = e.target.closest('.focusable');
      if (b && !b.disabled) fn(b);
    });
    click(views.title, titleSelect);
    click(views.slots, slotSelect);
    click(views.naming, (b) => { if (b !== $('nameInput')) nameSelect(b); });
    // Save as the name is written, said or typed, so nothing is lost however the box closes
    for (const ev of ['input', 'change', 'compositionend']) $('nameInput').addEventListener(ev, keepName);
    $('nameInput').addEventListener('blur', () => { if (naming && naming.editing) endEdit(); });
    // Glasses screen off or app hidden: stop the music clock, carry on when back
    document.addEventListener('visibilitychange', () => (document.hidden ? Music.pause() : Music.resume()));
    Deck.status('', '');
    // Redraw once the HUD font has arrived, so canvas text uses it
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { if (mode === 'title') Draw.drawTitleArt($('titleArt'), 0); else if (mode === 'cut') Cut.redraw(); else redraw(); });
    }
    showTitle();
  }
  init();

  // For testing in a desktop browser's console
  window.Bamberland = { game, get mode() { return mode; } };
})();
