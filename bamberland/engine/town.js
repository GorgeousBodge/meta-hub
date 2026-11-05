/* ==========================================================================
   Bamberland — people: talk that follows the story, Kev's shop and
   elixirs, Telkperson's visits, and what the map screen shows.
   ========================================================================== */
BamberEngine.part((X) => {
  'use strict';
  const { on, LORE, WORLD, OPPOSITE, DIRS } = X;
  const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

  // Does a talk option or Telkperson event apply right now?
  function applies(o) {
    const G = X.G;
    if (list(o.if).some((f) => !G.story[f])) return false;
    if (list(o.unless).some((f) => G.story[f])) return false;
    if (o.has && !(G.bag[o.has] > 0)) return false;
    return true;
  }
  // Take, set and give what an option or event says
  function settle(o) {
    const G = X.G;
    if (o.take && G.bag[o.take] > 0) G.bag[o.take] -= 1;
    for (const f of list(o.set)) G.story[f] = 1;
    if (o.set) X.refreshThorns();
    if (o.give) X.give(o.give, { quiet: true });
    // forge: 1 = Brendan reforges the Thwacker to that level
    if (o.forge && (G.forge || 0) < o.forge) { G.forge = o.forge; on.sound('fanfare'); }
  }

  /* ---------- talking ---------- */
  X.talk = (x, y) => {
    const G = X.G, R = X.R;
    const k = X.key(x, y);
    const entry = (X.def().talk || [])[R.talkAt[k]];
    if (!entry) return true;
    const p = R.people[k];
    if (p) p.face = OPPOSITE[G.face];          // they turn to face Bodge
    const options = entry.say || [entry];
    const o = options.find(applies) || options[options.length - 1];
    settle(o);
    const name = X.fmt(X.nameOf(entry.who));
    if (o.lines) on.dialog(X.pages(o.lines), name, entry.who);
    if (o.cut) on.cut(o.cut);
    if (o.shop) on.shop(o.shop);
    X.save();
    on.change();
    return true;
  };

  /* ---------- Kev's shop and the elixirs ---------- */
  X.api.shopStock = (shopId) => (WORLD.shops[shopId] || []).map((id) => {
    const e = LORE.elixirs[id];
    return { id, name: X.fmt(e.name), desc: X.fmt(e.desc), price: e.price, owned: X.G.bag[id] || 0 };
  });
  X.api.buy = (id) => {
    const G = X.G, e = LORE.elixirs[id], M = LORE.messages;
    if (!e) return { ok: false, msg: '' };
    if ((G.bag[id] || 0) >= LORE.bagMax) return { ok: false, msg: X.fmt(M.full) };
    if (G.coins < e.price) return { ok: false, msg: X.fmt(M.poor) };
    G.coins -= e.price;
    G.bag[id] = (G.bag[id] || 0) + 1;
    on.sound('coin');
    X.save();
    on.change();
    return { ok: true, msg: X.fmt(M.bought, { name: e.name }) };
  };
  // Using an elixir from the item ring takes no turn
  X.api.drink = (id) => {
    const G = X.G, e = LORE.elixirs[id];
    if (!e || !(G.bag[id] > 0)) return { ok: false, msg: '' };
    if (e.use === 'heal' && G.hearts >= G.maxHearts) return { ok: false, msg: X.fmt(LORE.messages.heartsFull) };
    G.bag[id] -= 1;
    if (e.use === 'heal') G.hearts = G.maxHearts;
    else if (e.use === 'shield') G.shield = 2;
    else if (e.use === 'warm') G.warm = 40;
    on.sound(e.use === 'nothing' ? 'swish' : 'pickup');
    X.save();
    on.change();
    return { ok: true, msg: X.fmt(e.used) };
  };

  /* ---------- Telkperson ---------- */
  X.enterHooks.push((roomId) => {
    const G = X.G, R = X.R;
    for (const ev of WORLD.telk || []) {
      if (G.telk[ev.id]) continue;
      if (ev.enter && !list(ev.enter).includes(roomId)) continue;
      if (!applies(ev)) continue;
      G.telk[ev.id] = 1;
      if (ev.hint) G.hint = X.fmt(ev.hint);
      // Telkperson turns up on a free tile next to Bodge, facing him
      for (const dir of ['left', 'right', 'down', 'up']) {
        const [dx, dy] = DIRS[dir];
        const x = G.px + dx, y = G.py + dy;
        if (X.heroCanStand(x, y)) { R.visitor = { who: 'telk', x, y, face: OPPOSITE[dir] }; break; }
      }
      settle(ev);
      on.telk(X.pages(ev.lines), X.fmt(X.nameOf('telk')), 'telk');
      X.save();
      break;
    }
  });

  /* ---------- the map ----------
     One page per region (or the room's own page). Only rooms Bodge has
     been to are drawn; their exits show as short stubs. */
  X.api.mapPages = () => {
    const G = X.G, cur = X.R && X.R.id;
    const pages = {};
    for (const [id, d] of Object.entries(WORLD.rooms)) {
      if (!d.at) continue;
      const page = d.page || d.region;
      if (!pages[page]) pages[page] = { id: page, name: (WORLD.pages || {})[page] || page, rooms: [], here: false };
      const seen = !!G.seen[id];
      if (id === cur) pages[page].here = true;
      pages[page].rooms.push({ id, name: X.fmt(d.name || id), at: d.at, exits: d.exits || {}, seen, here: id === cur, field: d.kind === 'field' });
    }
    return Object.values(pages).filter((p) => p.rooms.some((r) => r.seen));
  };
  X.api.hint = () => X.G.hint || '';
});
