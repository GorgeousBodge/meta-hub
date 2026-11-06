/* Checks every room, exit and reference without playing.
   Run from the bamberland folder:  node test/maps.js                     */
'use strict';
const { game } = require('./load.js');
const { S, g } = game();
const WORLD = S.BAMBER_WORLD, LORE = S.BAMBER_LORE, ART = S.BAMBER_ART, CUTS = S.BAMBER_CUTS, MUSIC = S.BAMBER_MUSIC;

const problems = [];
const bad = (room, msg) => problems.push(`${room}: ${msg}`);
const W = 15, H = 12;
const DUNGEON = '#.~_DBS%OPC=NbLKHX$hwmZIG!*123';
const FIELD = '.,:T*f~%NC=PKHX$@hwmB';
const DOORWAY = { field: '.,:', dungeon: '._DBS123' };
const EDGE = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const BACK = { n: 's', s: 'n', e: 'w', w: 'e' };
const ELIXIRS = Object.keys(LORE.elixirs);
const GIVES = ['key', 'bigkey', 'heart', 'container', 'sunstone', 'ending', ...ELIXIRS, ...Object.keys(LORE.items)];
const goodGive = (v) => /^coins:\d+$/.test(v) || GIVES.includes(v);
const flagsSet = new Set();
const flagsUsed = [];

// Cells on one edge of a room that Bodge can walk through
function gaps(d, edge) {
  const kind = d.kind === 'field' ? 'field' : 'dungeon';
  const out = [];
  for (let i = 0; i < (edge === 'n' || edge === 's' ? W : H); i++) {
    const [x, y] = edge === 'n' ? [i, 0] : edge === 's' ? [i, H - 1] : edge === 'w' ? [0, i] : [W - 1, i];
    if (DOORWAY[kind].includes(d.map[y][x])) out.push(i);
  }
  return out;
}

let starts = 0;
for (const [id, d] of Object.entries(WORLD.rooms)) {
  const field = d.kind === 'field';
  if (!WORLD.regions[d.region]) bad(id, `unknown region ${d.region}`);
  if (!d.name) bad(id, 'no name');
  if (!Array.isArray(d.map) || d.map.length !== H) { bad(id, `map should have ${H} rows`); continue; }
  d.map.forEach((row, y) => {
    if (row.length !== W) bad(id, `row ${y} is ${row.length} wide, not ${W}`);
    for (const ch of row) if (!(field ? FIELD : DUNGEON + '@').includes(ch)) bad(id, `row ${y}: unknown letter "${ch}"`);
  });
  const all = d.map.join('');
  starts += (all.match(/@/g) || []).length;
  const count = (c) => (all.match(new RegExp('\\' + c, 'g')) || []).length;
  if (count('=') !== (d.signs || []).length) bad(id, `${count('=')} signs on the map, ${(d.signs || []).length} in signs`);
  if (count('N') !== (d.talk || []).length) bad(id, `${count('N')} people on the map, ${(d.talk || []).length} in talk`);
  if (count('C') !== (d.chests || []).length) bad(id, `${count('C')} chests on the map, ${(d.chests || []).length} in chests`);
  for (const c of d.chests || []) if (!goodGive(c)) bad(id, `chest holds unknown "${c}"`);
  for (const t of d.talk || []) {
    if (!LORE.people[t.who]) bad(id, `talk: no person "${t.who}" in lore.js`);
    if (t.here) [].concat(t.here.if || [], t.here.unless || []).forEach((f) => flagsUsed.push([id, f]));
    for (const o of t.say || [t]) {
      if (!o.lines || !o.lines.length) bad(id, `talk for ${t.who} has an option with no lines`);
      if (o.shop && !WORLD.shops[o.shop]) bad(id, `talk opens unknown shop "${o.shop}"`);
      if (o.give && !goodGive(o.give)) bad(id, `talk gives unknown "${o.give}"`);
      if ((o.has || o.take) && !ELIXIRS.includes(o.has || o.take)) bad(id, `talk needs unknown elixir "${o.has || o.take}"`);
      if (o.cut && !CUTS[o.cut]) bad(id, `talk plays unknown cut scene "${o.cut}"`);
      [].concat(o.set || []).forEach((f) => flagsSet.add(f));
      if (o.forge != null && !(LORE.items.thwacker.forged || [])[o.forge - 1]) bad(id, `forge: ${o.forge} but lore.js has no forged level ${o.forge}`);
      [].concat(o.if || [], o.unless || []).forEach((f) => flagsUsed.push([id, f]));
    }
  }
  if (d.thorns) flagsUsed.push([id, d.thorns]);
  if (d.bridge) flagsUsed.push([id, d.bridge]);
  if (all.includes('B') && field && !d.bridge) bad(id, 'a B bridge on the map but no bridge: story flag');
  [].concat(d.sets || []).forEach((f) => flagsSet.add(f));
  if (d.sets && !d.solve) bad(id, 'sets a story flag when solved, but has no solve');
  // machinery gates 1 2 3 need a story flag in stages
  for (const n of '123') if (!field && all.includes(n)) {
    const f = (d.stages || [])[Number(n) - 1];
    if (!f) bad(id, `gate ${n} on the map but no stages[${Number(n) - 1}]`); else flagsUsed.push([id, f]);
  }
  if (d.wheel && (!all.includes('*'))) bad(id, 'wheel: but no * machinery on the map');
  if (d.solve === 'levers' && !all.includes('!')) bad(id, "solve: 'levers' but no ! lever on the map");
  if (all.includes('!') && d.solve !== 'levers') bad(id, "levers on the map, but solve isn't 'levers'");
  if (d.cut && !CUTS[d.cut]) bad(id, `unknown cut scene "${d.cut}"`);
  if (d.music && !MUSIC[d.music]) bad(id, `unknown tune "${d.music}"`);
  for (const b of d.buildings || []) {
    if (!ART.BUILDINGS[b.art]) bad(id, `unknown building "${b.art}"`);
    if (b.swap && !ART.BUILDINGS[b.swap.art]) bad(id, `unknown building "${b.swap.art}" in swap`);
  }
  if (!d.at) bad(id, 'no at: [column, row] for the map');
  // Doors into other rooms
  for (const dr of d.doors || []) {
    if (!WORLD.rooms[dr.to]) bad(id, `door goes to unknown room "${dr.to}"`);
    if (dr.x == null || dr.y == null) bad(id, `door to ${dr.to} needs x and y for where Bodge arrives`);
  }
  // Bosses
  if (d.solve === 'boss' && !all.includes('Z')) bad(id, "solve: 'boss' but no Z on the map");
  if (all.includes('Z') && !LORE.bosses[d.boss || 'kiln']) bad(id, `unknown boss "${d.boss}" (see bosses in lore.js)`);
  // Exits line up both ways
  for (const [edge, target] of Object.entries(d.exits || {})) {
    if (target && typeof target === 'object') {
      // an exit to a set spot: just needs a real room and a gap in the wall
      if (!WORLD.rooms[target.to]) bad(id, `exit ${edge} goes to unknown room "${target.to}"`);
      if (!gaps(d, edge).length) bad(id, `exit ${edge} has no gap in the wall`);
      continue;
    }
    const t = WORLD.rooms[target];
    if (!t) { bad(id, `exit ${edge} goes to unknown room "${target}"`); continue; }
    if ((t.exits || {})[BACK[edge]] !== id) bad(id, `exit ${edge} to ${target}, but ${target} has no ${BACK[edge]} exit back`);
    const mine = gaps(d, edge), theirs = gaps(t, BACK[edge]);
    if (!mine.length) bad(id, `exit ${edge} has no gap in the wall`);
    for (const i of mine) if (!theirs.includes(i)) bad(id, `exit ${edge} at ${i} doesn't line up with ${target}`);
  }
  for (const edge of Object.keys(EDGE)) {
    if (!(d.exits || {})[edge] && gaps(d, edge).length) bad(id, `gap in the ${edge} wall but no exit there`);
  }
}
if (starts !== 1) problems.push(`there should be exactly one @ start, found ${starts}`);
const startRoom = WORLD.rooms[WORLD.start];
if (!startRoom || !startRoom.map.join('').includes('@')) problems.push(`start room "${WORLD.start}" has no @`);

// Map squares don't overlap on a page
const placed = {};
for (const [id, d] of Object.entries(WORLD.rooms)) {
  if (!d.at) continue;
  const k = (d.page || d.region) + ':' + d.at.join(',');
  if (placed[k]) bad(id, `map square ${k} already used by ${placed[k]}`);
  placed[k] = id;
}

// Telkperson
for (const ev of WORLD.telk) {
  for (const r of [].concat(ev.enter || [])) if (!WORLD.rooms[r]) problems.push(`telk ${ev.id}: unknown room "${r}"`);
  if (ev.give && !goodGive(ev.give)) problems.push(`telk ${ev.id}: unknown give "${ev.give}"`);
  [].concat(ev.set || []).forEach((f) => flagsSet.add(f));
  [].concat(ev.if || [], ev.unless || []).forEach((f) => flagsUsed.push(['telk ' + ev.id, f]));
}
if (WORLD.spendGoal) {
  flagsSet.add(WORLD.spendGoal.set);
  if (WORLD.spendGoal.cut && !CUTS[WORLD.spendGoal.cut]) problems.push(`spendGoal: unknown cut scene "${WORLD.spendGoal.cut}"`);
}
for (const r of Object.values(WORLD.regions)) {
  if (r.sun) flagsSet.add(r.sun);
  if (r.cut && !CUTS[r.cut]) problems.push(`region ${r.name}: unknown cut scene "${r.cut}"`);
}
if (!flagsSet.has('met_kev')) flagsSet.add('met_kev');
for (const [where, f] of flagsUsed) if (!flagsSet.has(f)) problems.push(`${where}: story flag "${f}" is never set`);

// Shops, music, cut scenes
for (const [shop, stock] of Object.entries(WORLD.shops)) for (const e of stock) if (!LORE.elixirs[e]) problems.push(`shop ${shop}: unknown elixir "${e}"`);
for (const [id, t] of Object.entries(MUSIC)) {
  const beats = t.melody.reduce((a, [, l]) => a + l, 0);
  if (beats !== t.chords.length * t.bar) problems.push(`tune ${id}: melody is ${beats} beats, chords are ${t.chords.length * t.bar}`);
}
for (const [id, c] of Object.entries(CUTS)) {
  if (id === 'maps') continue;
  if (c.music && !MUSIC[c.music]) problems.push(`cut ${id}: unknown tune "${c.music}"`);
  c.panels.forEach((p, i) => {
    for (const L of p.layers || []) {
      if (!L.art) continue;
      const found = L.art === 'hero' || ['SPRITES', 'PROPS', 'BUILDINGS', 'OBJECTS', 'TILES', 'PORTRAITS'].some((gr) => ART[gr][L.art]);
      if (!found) problems.push(`cut ${id} panel ${i + 1}: no art called "${L.art}"`);
    }
    if (p.ground && p.ground.map && !CUTS.maps[p.ground.map]) problems.push(`cut ${id} panel ${i + 1}: no map "${p.ground.map}"`);
  });
}
for (const need of ['opening']) if (!CUTS[need]) problems.push(`cutscenes.js needs a scene called "${need}"`);

// People's art
for (const [id, p] of Object.entries(LORE.people)) {
  if (p.sprite && !ART.SPRITES[p.sprite]) problems.push(`person ${id}: no sprite "${p.sprite}"`);
  if (p.portrait && !ART.PORTRAITS[p.portrait]) problems.push(`person ${id}: no portrait "${p.portrait}"`);
}

// Every {word} in the text has a meaning
g.newGame({});
const texts = [];
const walk = (v, where) => {
  if (typeof v === 'string') texts.push([where, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => walk(x, where));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!['map', 'maps'].includes(k)) walk(x, where + '.' + k);
};
walk(LORE, 'lore'); walk(WORLD.rooms, 'rooms'); walk(WORLD.telk, 'telk'); walk(CUTS, 'cuts');
for (const [where, t] of texts) {
  const left = g.fmt(t, { n: 1, name: 'x' }).match(/\{\w+\}/g);
  if (left) problems.push(`${where}: "${left.join(' ')}" has no meaning`);
}

if (problems.length) {
  console.log(`✗ ${problems.length} problem(s):`);
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
}
console.log(`✓ ${Object.keys(WORLD.rooms).length} rooms, ${WORLD.telk.length} Telkperson visits, ${Object.keys(MUSIC).length} tunes, ${Object.keys(CUTS).length - 1} cut scenes: all fine`);
