/* Plays the whole demo, start to Sunstone, and checks saves on the way.
   Run from the bamberland folder:  node test/play.js
   It walks with simple path-finding and fights with simple tactics, so
   if a room change makes something impossible, this is where it shows. */
'use strict';
const { game } = require('./load.js');
const { S, g, log } = game();
const WORLD = S.BAMBER_WORLD;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const EDGE_DIR = { n: 'up', s: 'down', e: 'right', w: 'left' };

let outCold = 0, turnsUsed = 0;
const fail = (msg) => { console.log('✗ ' + msg); console.log(`  in ${g.R.id} at ${g.G.px},${g.G.py}, hearts ${g.G.hearts}/${g.G.maxHearts}`); dump(); process.exit(1); };
const check = (ok, msg) => { if (!ok) fail(msg); console.log('  ✓ ' + msg); };
const G = () => g.G, R = () => g.R;
const k = (x, y) => x + ',' + y;

function dump() {
  let s = '';
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 15; x++) {
      const e = R().enemies.find((e) => e.x === x && e.y === y);
      s += G().px === x && G().py === y ? '@' : e ? e.type[0].toUpperCase() : (R().obj[k(x, y)] || (R().cracks[k(x, y)] ? '!' : R().base[y][x]));
    }
    s += '\n';
  }
  console.log(s);
}

// One action. Being knocked out wakes Bodge at the doorway.
function act(a) {
  turnsUsed += 1;
  if (turnsUsed > 20000) fail('took far too many turns');
  g.act(a);
  if (G().over) { outCold += 1; if (outCold > 40) fail('knocked out too often'); g.revive(); }
}
function face(dir) { if (G().face !== dir) { const [dx, dy] = DIRS[dir]; if (g.query.heroCanStand(G().px + dx, G().py + dy)) return false; act(dir); } return G().face === dir; }
function wait() {
  const keep = G().equip;
  g.equip('thwacker');
  // swing where nothing stands, so waiting never hits a brazier or a person
  for (const d of ['down', 'up', 'left', 'right']) {
    const [dx, dy] = DIRS[d], x = G().px + dx, y = G().py + dy;
    if (!R().obj[k(x, y)] && !g.query.enemyAt(x, y) && !g.query.bossAt(x, y)) { if (G().face !== d && !g.query.heroCanStand(x, y)) act(d); break; }
  }
  act('pinch');
  if (keep && G().items[keep]) g.equip(keep);
}

// Breadth-first path to (tx, ty) over tiles Bodge can stand on
function path(tx, ty, avoid = () => false) {
  const start = k(G().px, G().py), goal = k(tx, ty);
  if (start === goal) return [];
  const prev = { [start]: null }, q = [[G().px, G().py]];
  while (q.length) {
    const [x, y] = q.shift();
    const moves = [];
    for (const [d, [dx, dy]] of Object.entries(DIRS)) {
      moves.push([d, x + dx, y + dy]);
      // with the Hopstaff, a gap can be vaulted: two tiles in one go
      if (G().items.hopstaff && g.query.isGap(x + dx, y + dy)) moves.push(['V:' + d, x + 2 * dx, y + 2 * dy]);
    }
    for (const [d, nx, ny] of moves) {
      const nk = k(nx, ny);
      if (nk in prev) continue;
      if (!g.query.heroCanStand(nx, ny) || R().embers.some((e) => e.x === nx && e.y === ny) || avoid(nx, ny)) continue;
      prev[nk] = [k(x, y), d];
      if (nk === goal) {
        const out = []; let c = nk;
        while (prev[c]) { out.unshift(prev[c][1]); c = prev[c][0]; }
        return out;
      }
      q.push([nx, ny]);
    }
  }
  return null;
}
// One step of a path: a walk, or a vault ('V:up')
function step(d) {
  if (!d.startsWith('V:')) { act(d); return; }
  const dir = d.slice(2);
  g.equip('hopstaff');
  if (G().face !== dir) act(dir);   // the gap blocks, so this only turns
  act('pinch');
}
function goTo(tx, ty, tries = 300) {
  const room = R().id;
  for (let i = 0; i < tries; i++) {
    if (G().px === tx && G().py === ty) return true;
    if (R().id !== room) return false;
    const p = path(tx, ty);
    if (p && p.length) step(p[0]); else wait();
  }
  fail(`couldn't reach ${tx},${ty}`);
}
// Stand next to (x, y) on the given side and face it
function besides(x, y, from) {
  const [dx, dy] = DIRS[from];
  const sx = x + dx, sy = y + dy;
  goTo(sx, sy);
  const toward = { up: 'down', down: 'up', left: 'right', right: 'left' }[from];
  act(toward);   // blocked by the thing, so this just turns
}
function useAt(x, y, from) { besides(x, y, from); act('pinch'); }

// Walk out through an edge, into the next room
function exit(edge) {
  const d = WORLD.rooms[R().id], here = R().id;
  const target = d.exits[edge];
  const cells = [];
  for (let i = 0; i < 15; i++) {
    const [x, y] = edge === 'n' ? [i, 0] : edge === 's' ? [i, 11] : edge === 'w' ? [0, i] : [14, i];
    if (x > 14 || y > 11) continue;
    if (g.query.heroCanStand(x, y) || 'DB'.includes(R().base[y][x])) cells.push([x, y]);
  }
  for (const [x, y] of cells) {
    if ('DB'.includes(R().base[y][x])) useAt(x, y, { up: 'down', down: 'up', left: 'right', right: 'left' }[EDGE_DIR[edge]]);
    if (path(x, y) !== null || (G().px === x && G().py === y)) {
      goTo(x, y);
      for (let i = 0; i < 4 && R().id === here; i++) act(EDGE_DIR[edge]);
      if (R().id === target) return;
    }
  }
  fail(`couldn't leave by the ${edge} edge to ${target}`);
}
// Walk through rooms by their exits
function travel(to) {
  for (let hops = 0; R().id !== to; hops++) {
    if (hops > 30) fail(`couldn't travel to ${to}`);
    const seen = { [R().id]: null }, q = [R().id];
    while (q.length && !(to in seen)) {
      const r = q.shift();
      for (const [edge, t] of Object.entries(WORLD.rooms[r].exits || {})) if (!(t in seen)) { seen[t] = [r, edge]; q.push(t); }
    }
    let c = to; while (seen[c][0] !== R().id) c = seen[c][0];
    exit(seen[c][1]);
  }
}
const talked = (who) => log.filter((l) => l.type === 'dialog' && l.a[2] === who).length;

/* ======================= the village and the wood ======================= */
console.log('Bamber village and the Queen\'s Wood');
g.newGame({ hero: 'Tester', kev: 'Kevin' });
check(log.some((l) => l.type === 'cut' && l.a[0] === 'opening'), 'the opening cut scene plays at New game');
check(R().id === 'village' && g.tone() === 'gloom', 'the village starts in the gloom');
check(g.fmt('{hero} and {kev}') === 'Tester and Kevin', 'chosen names appear in the text');

useAt(4, 9, 'down');
check(talked('brendan') === 1 && !G().story.brambles, 'Brendan wants a Fizzwhistle first');
useAt(11, 3, 'down');
check(log.some((l) => l.type === 'shop' && l.a[0] === 'kev'), "talking to Kev opens his shop");
check(!g.buy('fizz').ok, "can't buy with no money");
goTo(13, 10);
check(G().coins === 5, 'picked up a pocket of 5 Sunpennies');
const bought = g.buy('fizz');
check(bought.ok && G().bag.fizz === 1 && G().coins === 0, 'bought a Fizzwhistle');
useAt(4, 9, 'down');
check(G().story.brambles && !G().bag.fizz, 'Brendan took the Fizzwhistle and cleared the brambles');

travel('woodpath');
check(G().telk['wood-first'] && log.some((l) => l.type === 'telk'), 'Telkperson turns up in the wood');
check(R().visitor && R().visitor.who === 'telk', 'Telkperson stands next to Bodge while talking');
check(R().base[1][7] === '.', 'the brambles are gone');
check(g.mapPages().length === 1 && g.hint().includes('Brendan'), 'the map shows the wood and the latest hint');
travel('glade');
check(R().id === 'glade', 'walked through the cleared brambles to the Hollow Oak glade');
useAt(3, 4, 'down');
check(G().coins >= 15, 'the glade chest held Sunpennies');
travel('village');
check(G().telk['brambles-down'] && G().coins >= 25, "Telkperson brought Kev's parcel");
check(g.buy('tonic').ok, 'bought a Red Tonic');

// Save and load
const lastSave = () => log.filter((l) => l.type === 'save').pop().a[0];
const s1 = JSON.parse(JSON.stringify(lastSave()));
const other = game();
const r1 = other.g.load(s1);
check(r1.ok && other.g.R.id === 'village' && other.g.G.names.hero === 'Tester' && other.g.G.bag.tonic === 1, 'a save loads back where it was, names and bag included');
check(other.g.load({ v: 1, room: 'gate', entry: { room: 'gate', x: 7, y: 9 } }).error === 'old', 'a Mill prototype save is refused with a clear reason');
check(other.g.load({ v: 99 }).error === 'newer', 'a save from a newer version is refused');

/* ======================= Millbrook Vale and the Sunk Mill ======================= */
console.log('Millbrook Vale and the Sunk Mill');
travel('vale');
check(G().telk['vale-first'] && g.tone() === 'gloom', 'the vale is in the gloom, and Telkperson points to the mill');
travel('hall');

// Sluice Room: two blocks onto two plates, then the key
travel('sluice');
function push(bx, by, dir, n) {
  const from = { up: 'down', down: 'up', left: 'right', right: 'left' }[dir];
  besides(bx, by, from);
  for (let i = 0; i < n; i++) {
    const [dx, dy] = DIRS[dir];
    const before = R().obj[k(bx + dx * (i + 1), by + dy * (i + 1))];
    act('pinch');
    if (R().obj[k(bx + dx * (i + 1), by + dy * (i + 1))] !== 'O' || before) fail(`block at ${bx},${by} stuck`);
    act(dir);
  }
}
push(4, 3, 'down', 4);
push(4, 7, 'left', 2);
push(10, 4, 'down', 3);
push(10, 7, 'right', 3);
check(G().flags.sluice.solved, 'Sluice Room solved');
useAt(7, 9, 'up');
check(G().keys === 1, 'got the small key');

// Hog Run, through the locked east door of the Grinding Hall
travel('corridor');
check(G().keys === 0, 'the key opened the east door');
g.equip('thwacker');
for (let i = 0; i < 400 && R().enemies.length; i++) {
  const e = R().enemies[0];
  if (e.st === 'stun') {
    let best = null;
    for (const [d, [dx, dy]] of Object.entries(DIRS)) {
      const x = e.x - dx, y = e.y - dy;
      if (!g.query.heroCanStand(x, y) && !(G().px === x && G().py === y)) continue;
      const p = G().px === x && G().py === y ? [] : path(x, y);
      if (p && (!best || p.length < best.p.length)) best = { p, d };
    }
    if (!best) { wait(); continue; }
    if (best.p.length) { step(best.p[0]); continue; }
    if (G().face !== best.d) act(best.d);
    act('pinch');
  } else if (e.st === 'alert' || e.st === 'charge') {
    const side = e.dir === 'left' || e.dir === 'right' ? ['up', 'down'] : ['left', 'right'];
    const ok = side.find((d) => g.query.heroCanStand(G().px + DIRS[d][0], G().py + DIRS[d][1]));
    if (ok) act(ok); else wait();
  } else {
    // line up with the hog, a few tiles away along its row
    const spots = [];
    const clear = (x) => { for (let i = Math.min(x, e.x) + 1; i < Math.max(x, e.x); i++) if (!g.query.heroCanStand(i, e.y)) return false; return true; };
    for (let x = 1; x < 14; x++) if (Math.abs(x - e.x) >= 3 && g.query.heroCanStand(x, e.y) && clear(x)) spots.push([x, e.y]);
    spots.sort((a, b) => Math.abs(a[0] - G().px) + Math.abs(a[1] - G().py) - Math.abs(b[0] - G().px) - Math.abs(b[1] - G().py));
    const here = spots.some(([sx, sy]) => sx === G().px && sy === G().py);
    if (spots.length && !here) { const p = path(...spots[0]); if (p && p.length) step(p[0]); else wait(); }
    else wait();
  }
}
check(G().flags.corridor && G().flags.corridor.solved, 'Hog Run: the Bristlehog is beaten');

// Shell Garden: a block on one plate, a Mimmet on the other
travel('maze');
for (let tries = 0; tries < 5 && !G().flags.maze.solved; tries++) {
  const block = Object.entries(R().obj).find(([, o]) => o === 'O');
  if (block && block[0] !== '10,7') {
    const [bx, by] = block[0].split(',').map(Number);
    if (by === 7 && bx < 10) push(bx, by, 'right', 10 - bx);
  }
  if (G().flags.maze.solved) break;
  // every step right moves the corridor Mimmet left, onto its plate
  goTo(1, 5);
  for (let i = 0; i < 9 && !G().flags.maze.solved; i++) act('right');
  if (!G().flags.maze.solved) g.resetRoom();
}
check(G().flags.maze.solved, 'Shell Garden solved with a Mimmet');

// Hopstaff Shrine: the staff, then vault for the key
travel('shrine');
useAt(10, 5, 'down');
check(G().items.hopstaff, 'got the Hopstaff');
g.equip('hopstaff');
besides(4, 5, 'left');
act('pinch');
check(G().keys === 1, 'vaulted into the ring of gaps for the key');
act('pinch');
check(G().px === 7 && G().py === 5, 'vaulted back out');

// Ember Gallery: all three braziers at once
travel('embers');
for (let tries = 0; tries < 6 && !G().flags.embers.solved; tries++) {
  g.equip('thwacker');
  useAt(4, 3, 'down');
  useAt(7, 6, 'up');
  useAt(10, 3, 'down');
}
check(G().flags.embers.solved, 'Ember Gallery: all braziers burning');

// Broken Floor: vault the gaps, open the door, take the big key
travel('gaps');
g.equip('hopstaff');
goTo(7, 9); face('up'); act('pinch');
goTo(7, 6); face('up'); act('pinch');
check(G().py === 4, 'vaulted both broken floors');
useAt(7, 2, 'down');
goTo(7, 2);
useAt(7, 1, 'down');
check(G().bigKey, 'got the big key');
goTo(7, 4); face('down'); act('pinch');
goTo(7, 7); face('down'); act('pinch');

// The Kilnwarden
travel('lair');
const inDanger = (x, y) => [4, 5].includes(y) || (R().boss && R().boss.hits >= 1 && [6, 7].includes(x));
const marked = (x, y) => R().marks.some(([mx, my]) => mx === x && my === y);
for (let i = 0; i < 600 && R().boss; i++) {
  const b = R().boss, x = G().px, y = G().py;
  if (marked(x, y)) {
    const out = Object.entries(DIRS).map(([d, [dx, dy]]) => [d, x + dx, y + dy])
      .filter(([, nx, ny]) => g.query.heroCanStand(nx, ny) && !marked(nx, ny))
      .sort((a, c) => inDanger(a[1], a[2]) - inDanger(c[1], c[2]));
    if (out.length) act(out[0][0]); else wait();
    continue;
  }
  const inside = x >= 5 && x <= 8 && y >= 3 && y <= 6;
  if (b.phase === 'cool') {
    if (inside) {
      const next = Object.entries(DIRS).find(([, [dx, dy]]) => g.query.bossAt(x + dx, y + dy));
      if (next) { g.equip('thwacker'); if (G().face !== next[0]) act(next[0]); act('pinch'); continue; }
      const p = path(7, 6) || path(6, 6) || path(5, 4);
      if (p && p.length) step(p[0]); else wait();
    } else if (x === 8 && y === 8) { g.equip('hopstaff'); face('up'); act('pinch'); }
    else { const p = path(8, 8, marked); if (p && p.length) step(p[0]); else wait(); }
  } else if (!(x === 8 && y === 8) && !inside) {
    const p = path(8, 8, (a, c) => marked(a, c) || inDanger(a, c));
    if (p && p.length) step(p[0]); else wait();
  } else if (inside) {
    // wait in a corner of the ring, out of the embers' way
    const p = path(8, 6, marked) || path(5, 3, marked);
    if (p && p.length) step(p[0]); else wait();
  } else wait();
}
check(!R().boss && G().flags.lair.bossDone, 'the Kilnwarden is beaten');
const sun = Object.entries(R().obj).find(([, o]) => o === 'Q');
check(!!sun, 'the Sunstone appears');
g.equip('hopstaff');
for (let i = 0; i < 40 && Object.values(R().obj).includes('Q'); i++) {
  const [qx, qy] = sun[0].split(',').map(Number);
  if (path(qx, qy)) { goTo(qx, qy); break; }
  if (G().px === 8 && G().py === 8) { face('up'); act('pinch'); continue; }
  goTo(8, 8);
}
if (Object.values(R().obj).includes('Q')) {
  const [qx, qy] = sun[0].split(',').map(Number);
  goTo(qx, qy);
}
check(G().story.sun_mill && G().maxHearts >= 8, 'took the Sunstone: one more heart, and the vale is restored');
check(log.some((l) => l.type === 'cut' && l.a[0] === 'sunstone'), 'the Sunstone cut scene plays');

travel('vale');
check(g.tone() === 'day' && G().telk['vale-sun'], 'Millbrook Vale is back in colour, and Telkperson says so');
const pages = g.mapPages().map((p) => p.id);
check(pages.includes('wood') && pages.includes('sunkmill') && pages.includes('mill'), 'the map has a page for each place visited');

const s2 = lastSave();
const again = game();
check(again.g.load(JSON.parse(JSON.stringify(s2))).ok && again.g.G.story.sun_mill, 'the final save loads too');

console.log(`✓ Played start to Sunstone in ${G().turns} turns (${outCold} times out cold)`);
