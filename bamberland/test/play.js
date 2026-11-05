/* Plays the whole game so far, start to the second Sunstone, and checks
   saves on the way.
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
const exitTo = (ex) => (ex && typeof ex === 'object' ? ex.to : ex);
function exit(edge) {
  const d = WORLD.rooms[R().id], here = R().id;
  const target = exitTo(d.exits[edge]);
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
// Walk through a door tile (into the Hollow Oak's trunk, say)
function door(dr) {
  const here = R().id;
  const [x, y] = dr.at;
  // step onto the door from whichever side can be reached
  for (const [d, [dx, dy]] of Object.entries(DIRS)) {
    const sx = x - dx, sy = y - dy;
    if (!g.query.heroCanStand(sx, sy) || !path(sx, sy) && !(G().px === sx && G().py === sy)) continue;
    goTo(sx, sy);
    act(d);
    if (R().id !== here) return;
  }
  fail(`couldn't get through the door to ${dr.to}`);
}
// Walk through rooms by their exits and doors
function travel(to) {
  for (let hops = 0; R().id !== to; hops++) {
    if (hops > 30) fail(`couldn't travel to ${to}`);
    const seen = { [R().id]: null }, q = [R().id];
    while (q.length && !(to in seen)) {
      const r = q.shift(), d = WORLD.rooms[r];
      const ways = Object.entries(d.exits || {}).map(([edge, t]) => [exitTo(t), { edge }]);
      for (const dr of d.doors || []) ways.push([dr.to, { door: dr }]);
      for (const [t, how] of ways) if (!(t in seen)) { seen[t] = [r, how]; q.push(t); }
    }
    if (!(to in seen)) fail(`no way from ${R().id} to ${to}`);
    let c = to; while (seen[c][0] !== R().id) c = seen[c][0];
    const how = seen[c][1];
    if (how.door) door(how.door); else exit(how.edge);
  }
}
const talked = (who) => log.filter((l) => l.type === 'dialog' && l.a[2] === who).length;
const cutPlayed = (id) => log.some((l) => l.type === 'cut' && l.a[0] === id);

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

// Beat every Bristlehog in the room: line up so it charges a wall, then strike while it's dizzy
function fightHogs() {
  g.equip('thwacker');
  for (let i = 0; i < 600 && R().enemies.length; i++) {
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
      const spots = [];
      const clear = (x) => { for (let j = Math.min(x, e.x) + 1; j < Math.max(x, e.x); j++) if (!g.query.heroCanStand(j, e.y)) return false; return true; };
      for (let x = 1; x < 14; x++) if (Math.abs(x - e.x) >= 3 && g.query.heroCanStand(x, e.y) && clear(x)) spots.push([x, e.y]);
      spots.sort((a, b) => Math.abs(a[0] - G().px) + Math.abs(a[1] - G().py) - Math.abs(b[0] - G().px) - Math.abs(b[1] - G().py));
      const here = spots.some(([sx, sy]) => sx === G().px && sy === G().py);
      if (spots.length && !here) { const p = path(...spots[0]); if (p && p.length) step(p[0]); else wait(); }
      else wait();
    }
  }
}
const marked = (x, y) => R().marks.some(([mx, my]) => mx === x && my === y);
// Walk (or vault) to a sunstone or heart vessel left by a boss
function collect(o) {
  for (let i = 0; i < 60; i++) {
    const at = Object.entries(R().obj).find(([, v]) => v === o);
    if (!at) return;
    const [qx, qy] = at[0].split(',').map(Number);
    const p = path(qx, qy);
    if (p && p.length) step(p[0]); else wait();
  }
}
const lastSave = () => log.filter((l) => l.type === 'save').pop().a[0];

/* ======================= the village and the wood ======================= */
console.log("Bamber village and the Queen's Wood");
g.newGame({ hero: 'Tester', kev: 'Kevin' });
check(cutPlayed('opening'), 'the opening cut scene plays at New game');
check(R().id === 'village' && g.tone() === 'gloom', 'the village starts in the gloom');
check(g.fmt('{hero} and {kev}') === 'Tester and Kevin', 'chosen names appear in the text');
check(R().base[6][1] === '#', 'the west road to Millbrook Vale is choked with brambles');

useAt(4, 9, 'down');
check(talked('brendan') === 1 && !G().story.brambles, 'Brendan wants a Fizzwhistle first');
useAt(11, 3, 'down');
check(log.some((l) => l.type === 'shop' && l.a[0] === 'kev'), 'talking to Kev opens his shop');
check(!g.buy('fizz').ok, "can't buy with no money");
goTo(13, 10);
check(G().coins === 5, 'picked up a pocket of 5 Luftballons');
check(g.buy('fizz').ok && G().bag.fizz === 1 && G().coins === 0, 'bought a Fizzwhistle');
useAt(4, 9, 'down');
check(G().story.brambles && !G().bag.fizz, 'Brendan took the Fizzwhistle and cleared the brambles');

travel('woodpath');
check(G().telk['wood-first'] && log.some((l) => l.type === 'telk'), 'Telkperson turns up in the wood');
check(R().visitor && R().visitor.who === 'telk', 'Telkperson stands next to Bodge while talking');
check(R().base[1][7] === '.', 'the brambles are gone');
travel('glade');
check(G().telk['oak-door'], 'Telkperson points into the Hollow Oak');
useAt(3, 4, 'down');
check(G().coins >= 15, 'the glade chest held Luftballons');

// Save and load
const s1 = JSON.parse(JSON.stringify(lastSave()));
const other = game();
check(other.g.load(s1).ok && other.g.R.id === 'glade' && other.g.G.names.hero === 'Tester', 'a save loads back where it was, names included');
check(other.g.load({ v: 1, room: 'gate', entry: { room: 'gate', x: 7, y: 9 } }).error === 'old', 'a Mill prototype save is refused with a clear reason');
check(other.g.load({ v: 99 }).error === 'newer', 'a save from a newer version is refused');

/* ======================= the Hollow Oak ======================= */
console.log('The Hollow Oak');
travel('oakroot');
check(R().id === 'oakroot' && G().px === 7 && G().py === 10, 'walked in through the door in the trunk');

travel('oakburrow');
fightHogs();
check(G().flags.oakburrow.solved, 'Hog Burrow: the Bristlehog is beaten and the shutter opens');

travel('oaksap');
push(7, 5, 'right', 1);
useAt(7, 3, 'down');
check(G().keys === 1, 'Sap Well: pushed the block aside and found the small key');

travel('oaklarder');
check(G().keys === 0, "the key opened the Root Hall's east door");
besides(3, 6, 'down');                 // stand below the pot, facing it
act('pinch');
check(G().carry, 'lifted the pot in the way');
act('left'); act('pinch');
check(!G().carry && !R().obj[k(3, 6)], 'threw it clear');
push(3, 3, 'down', 5);
push(9, 4, 'right', 2);
push(11, 4, 'down', 4);
check(G().flags.oaklarder.solved, 'Squirrel Larder: both blocks on their plates');

travel('oakhollow');
useAt(8, 8, 'down');
check(G().items.hopstaff, 'got the Hopstaff');
g.equip('hopstaff');
besides(3, 4, 'left');
act('pinch');
check(G().px === 4 && G().py === 4, 'vaulted over the thorns');
act('right'); act('pinch');
check(G().bigKey, 'opened the chest inside the thorns: the big key');
act('left'); act('pinch');
check(G().px === 2, 'vaulted back out');

travel('oakstair');
check(G().flags.oakroot.opened['7,0'], 'the big key opened the great door');
travel('oakheart');
check(R().boss && R().boss.type === 'thorn', 'the Thornmother is here');
check(log.some((l) => l.type === 'dialog' && /Thornmother/.test(l.a[1])), 'she introduces herself');

// The Thornmother: wait in a corner of her ring, step out of each marked line,
// and strike when her heart opens. Her blast throws Bodge back out; vault in again.
const CORNERS = [[5, 3], [8, 3], [5, 6], [8, 6]];
const inside = (x, y) => x >= 5 && x <= 8 && y >= 3 && y <= 6;
const thornHits = [];
for (let i = 0; i < 800 && R().boss; i++) {
  const b = R().boss, x = G().px, y = G().py;
  if (marked(x, y)) {
    // one step out of the line (walking if we can, vaulting if not)
    const walk = Object.entries(DIRS).find(([, [dx, dy]]) => g.query.heroCanStand(x + dx, y + dy) && !marked(x + dx, y + dy));
    if (walk) { act(walk[0]); continue; }
    const hop = Object.entries(DIRS).find(([, [dx, dy]]) => g.query.isGap(x + dx, y + dy) && g.query.heroCanStand(x + 2 * dx, y + 2 * dy) && !marked(x + 2 * dx, y + 2 * dy));
    if (hop) { step('V:' + hop[0]); continue; }
    wait(); continue;
  }
  if (inside(x, y)) {
    const next = Object.entries(DIRS).find(([, [dx, dy]]) => g.query.bossAt(x + dx, y + dy));
    if (b.phase === 'open') {
      if (next) { g.equip('thwacker'); if (G().face !== next[0]) act(next[0]); const hp = b.hp; act('pinch'); if (!R().boss || R().boss.hp < hp) thornHits.push(G().turns); continue; }
      const spots = [[5, 4], [6, 3], [8, 5], [7, 6], [5, 5], [7, 3], [8, 4], [6, 6]];
      let best = null;
      for (const [sx, sy] of spots) { const p = path(sx, sy, marked); if (p && (!best || p.length < best.length)) best = p; }
      if (best && best.length) step(best[0]); else wait();
    } else if (!CORNERS.some(([cx, cy]) => cx === x && cy === y)) {
      let best = null;
      for (const [cx, cy] of CORNERS) { const p = path(cx, cy, marked); if (p && (!best || p.length < best.length)) best = p; }
      if (best && best.length) step(best[0]); else wait();
    } else wait();
  } else {
    // outside: go to the west side of the ring and vault in
    if (x === 3 && y === 4) { step('V:right'); continue; }
    const p = path(3, 4, marked);
    if (p && p.length) step(p[0]); else wait();
  }
}
check(!R().boss && G().flags.oakheart.bossDone, `the Thornmother is beaten (${thornHits.length} hits)`);
collect('X'); collect('Q');
check(G().story.sun_wood && G().maxHearts >= 10, 'took the heart vessel and the Sunstone');
check(cutPlayed('sunstone_wood'), "the wood's Sunstone cut scene plays");

/* ======================= back to the village ======================= */
console.log('Home again');
travel('glade');
check(g.tone() === 'day', "the Queen's Wood is back in colour");
check(G().telk['wood-sun'], 'Telkperson says the west road is open');
travel('village');
check(R().base[6][1] === '.', 'the brambles on the west road have withered');
useAt(4, 9, 'down');
check(G().forge === 1 && g.weaponName() === 'Sunbright Thwacker', 'Brendan reforged the Thwacker');

/* ======================= Millbrook Vale and the Sunk Mill ======================= */
console.log('Millbrook Vale and the Sunk Mill');
travel('vale');
check(G().telk['vale-first'] && g.tone() === 'gloom', 'the vale is in the gloom, and Telkperson points to the mill');
travel('sluice');
push(4, 3, 'down', 4);
push(4, 7, 'left', 2);
push(10, 4, 'down', 3);
push(10, 7, 'right', 3);
check(G().flags.sluice.solved, 'Sluice Room solved');
useAt(7, 9, 'up');
check(G().keys === 1, 'got the small key');

travel('corridor');
check(G().keys === 0, 'the key opened the east door');
fightHogs();
check(G().flags.corridor && G().flags.corridor.solved, 'Hog Run: one hit from the reforged Thwacker');

travel('maze');
for (let tries = 0; tries < 5 && !G().flags.maze.solved; tries++) {
  const block = Object.entries(R().obj).find(([, o]) => o === 'O');
  if (block && block[0] !== '10,7') {
    const [bx, by] = block[0].split(',').map(Number);
    if (by === 7 && bx < 10) push(bx, by, 'right', 10 - bx);
  }
  if (G().flags.maze.solved) break;
  goTo(1, 5);
  for (let i = 0; i < 9 && !G().flags.maze.solved; i++) act('right');
  if (!G().flags.maze.solved) g.resetRoom();
}
check(G().flags.maze.solved, 'Shell Garden solved with a Mimmet');

travel('shrine');
const before = G().coins;
useAt(10, 5, 'down');
check(G().coins === before + 20, 'the Spring Shrine chest held 20 Luftballons');
g.equip('hopstaff');
besides(4, 5, 'left');
act('pinch');
check(G().keys === 1, 'vaulted into the ring of gaps for the key');
act('pinch');

travel('embers');
for (let tries = 0; tries < 6 && !G().flags.embers.solved; tries++) {
  g.equip('thwacker');
  useAt(4, 3, 'down');
  useAt(7, 6, 'up');
  useAt(10, 3, 'down');
}
check(G().flags.embers.solved, 'Ember Gallery: all braziers burning');

travel('gaps');
g.equip('hopstaff');
goTo(7, 9); face('up'); act('pinch');
goTo(7, 6); face('up'); act('pinch');
useAt(7, 2, 'down');
goTo(7, 2);
useAt(7, 1, 'down');
check(G().bigKey, 'got the Mill\'s big key');
goTo(7, 4); face('down'); act('pinch');
goTo(7, 7); face('down'); act('pinch');

travel('lair');
const inDanger = (x, y) => [4, 5].includes(y) || (R().boss && R().boss.hits >= 1 && [6, 7].includes(x));
for (let i = 0; i < 600 && R().boss; i++) {
  const b = R().boss, x = G().px, y = G().py;
  if (marked(x, y)) {
    const out = Object.entries(DIRS).map(([d, [dx, dy]]) => [d, x + dx, y + dy])
      .filter(([, nx, ny]) => g.query.heroCanStand(nx, ny) && !marked(nx, ny))
      .sort((a, c) => inDanger(a[1], a[2]) - inDanger(c[1], c[2]));
    if (out.length) act(out[0][0]); else wait();
    continue;
  }
  const inRing = x >= 5 && x <= 8 && y >= 3 && y <= 6;
  if (b.phase === 'cool') {
    if (inRing) {
      const next = Object.entries(DIRS).find(([, [dx, dy]]) => g.query.bossAt(x + dx, y + dy));
      if (next) { g.equip('thwacker'); if (G().face !== next[0]) act(next[0]); act('pinch'); continue; }
      const p = path(7, 6) || path(6, 6) || path(5, 4);
      if (p && p.length) step(p[0]); else wait();
    } else if (x === 8 && y === 8) { g.equip('hopstaff'); face('up'); act('pinch'); }
    else { const p = path(8, 8, marked); if (p && p.length) step(p[0]); else wait(); }
  } else if (!(x === 8 && y === 8) && !inRing) {
    const p = path(8, 8, (a, c) => marked(a, c) || inDanger(a, c));
    if (p && p.length) step(p[0]); else wait();
  } else if (inRing) {
    const p = path(8, 6, marked) || path(5, 3, marked);
    if (p && p.length) step(p[0]); else wait();
  } else wait();
}
check(!R().boss && G().flags.lair.bossDone, 'the Kilnwarden is beaten');
collect('X'); collect('Q');
check(G().story.sun_mill && G().maxHearts >= 14, 'took the second Sunstone');
check(cutPlayed('sunstone_mill'), "the vale's Sunstone cut scene plays");

travel('vale');
check(g.tone() === 'day' && G().telk['vale-sun'], 'Millbrook Vale is back in colour, and Telkperson says so');
const pages = g.mapPages().map((p) => p.id);
check(['wood', 'hollowoak', 'mill', 'sunkmill'].every((p) => pages.includes(p)), 'the map has a page for each place visited');

const s2 = lastSave();
const again = game();
check(again.g.load(JSON.parse(JSON.stringify(s2))).ok && again.g.G.story.sun_mill && again.g.G.forge === 1, 'the final save loads too');

console.log(`✓ Played start to the second Sunstone in ${G().turns} turns (${outCold} times out cold)`);
