/* Plays the whole game so far, start to the bridge over Millbrook, and checks
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
    if (x < 0 || y < 0 || x > 14 || y > 11) continue;   // never step out of the room by accident
    if (!R().obj[k(x, y)] && !g.query.enemyAt(x, y) && !g.query.bossAt(x, y)) { if (G().face !== d && !g.query.heroCanStand(x, y)) act(d); break; }
  }
  act('pinch');
  if (keep && G().items[keep]) g.equip(keep);
}

// Breadth-first path to (tx, ty) over tiles Bodge can stand on
let braveEmbers = false;   // true: walk through embers (half a heart each) rather than round them
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
      if (!g.query.heroCanStand(nx, ny) || (!braveEmbers && R().embers.some((e) => e.x === nx && e.y === ny)) || avoid(nx, ny)) continue;
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
// Can the next step of a plan still be taken?
function stepOpen(d) {
  const v = d.startsWith('V:'), [dx, dy] = DIRS[v ? d.slice(2) : d], n = v ? 2 : 1;
  const x = G().px + dx * n, y = G().py + dy * n;
  return g.query.heroCanStand(x, y) && (braveEmbers || !R().embers.some((e) => e.x === x && e.y === y));
}
// Walk to (tx, ty), keeping to the plan unless the next step is blocked,
// so drifting foes don't make Bodge dither back and forth
function goTo(tx, ty, tries = 300, soft = false) {
  const room = R().id;
  let plan = [];
  for (let i = 0; i < tries; i++) {
    if (G().px === tx && G().py === ty) return true;
    if (R().id !== room) return false;
    if (!plan.length || !stepOpen(plan[0])) plan = path(tx, ty) || [];
    if (plan.length) { const before = k(G().px, G().py); step(plan.shift()); if (k(G().px, G().py) === before) plan = []; }
    else if (soft && !g.query.heroCanStand(tx, ty)) return false;
    else wait();
  }
  if (soft) return false;
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
  // a foe drifting into the doorway: wait a turn or two and try again
  for (let tries = 0; tries < 30; tries++) {
    for (const [x, y] of cells) {
      if ('DB'.includes(R().base[y][x])) useAt(x, y, { up: 'down', down: 'up', left: 'right', right: 'left' }[EDGE_DIR[edge]]);
      if (path(x, y) !== null || (G().px === x && G().py === y)) {
        if (!goTo(x, y, 60, true)) continue;
        for (let i = 0; i < 4 && R().id === here; i++) act(EDGE_DIR[edge]);
        if (R().id === target) return;
      }
    }
    if (tries > 3) chase(); else wait();
  }
  fail(`couldn't leave by the ${edge} edge to ${target}`);
}
// Go after the nearest Spindlewisp or Mimmet and strike it (a few turns at a time)
function chase() {
  g.equip('thwacker');
  for (let i = 0; i < 12; i++) {
    const foes = R().enemies.filter((e) => e.type !== 'hog');
    if (!foes.length) { wait(); return; }
    const e = foes.sort((a, b) => Math.abs(a.x - G().px) + Math.abs(a.y - G().py) - Math.abs(b.x - G().px) - Math.abs(b.y - G().py))[0];
    const adj = Object.entries(DIRS).find(([, [dx, dy]]) => G().px + dx === e.x && G().py + dy === e.y);
    if (adj) { if (G().face !== adj[0]) act(adj[0]); act('pinch'); continue; }
    let best = null;
    for (const [dx, dy] of Object.values(DIRS)) {
      const p = path(e.x + dx, e.y + dy);
      if (p && (!best || p.length < best.length)) best = p;
    }
    if (best && best.length) step(best[0]); else wait();
  }
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
check(talked('brendan') === 1 && !G().story.brambles, "Brendan wants a King's Kebab first");
useAt(11, 3, 'down');
check(log.some((l) => l.type === 'shop' && l.a[0] === 'kev'), 'talking to Kev opens his shop');
check(!g.buy('kebab').ok, "can't buy with no money");
goTo(13, 10);
check(G().coins === 5, 'picked up a pocket of 5 Luftballons');
check(!g.buy('kebab').ok, "a King's Kebab costs 10: not enough yet");

travel('woodpath');
check(G().telk['wood-first'] && log.some((l) => l.type === 'telk'), 'Telkperson turns up in the wood');
check(R().visitor && R().visitor.who === 'telk', 'Telkperson stands next to Bodge while talking');
check(R().base[1][7] === '#', 'the brambles block the way north');
goTo(12, 7); goTo(5, 10);
check(G().coins === 15, 'two more pockets in the wood');
travel('village');
check(g.buy('kebab').ok && G().bag.kebab === 1 && G().coins === 5, "bought a King's Kebab");
useAt(4, 9, 'down');
check(G().story.brambles && !G().bag.kebab, 'Brendan ate the kebab and cleared the brambles');

travel('woodpath');
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
console.log('Millbrook Vale and the crossing');
travel('vale');
check(G().telk['vale-first'] && g.tone() === 'gloom', 'the vale is in the gloom, and Telkperson says Brendan has gone to the bridge');
travel('village');
check(!Object.values(R().people).some((p) => p.who === 'brendan'), 'Brendan has left the village');
travel('crossing');
check(R().base[5][11] === '#' && R().look[5][11] === 'x', 'the bridge at the crossing is out');
useAt(12, 2, 'down');
check(talked('brendan') >= 3 && !G().story.bridge, 'Brendan needs timber from the mill, loosened by the wheel');

// Face a direction while standing on x, y: walk in that way if the tile ahead is open, else turn
function stand(x, y, dir) {
  const [dx, dy] = DIRS[dir];
  if (g.query.heroCanStand(x + dx, y + dy)) {
    if (!(G().px === x - dx && G().py === y - dy) || G().face !== dir) { goTo(x - dx, y - dy); }
    act(dir);
    if (G().px !== x || G().py !== y) { goTo(x, y); }
  } else { goTo(x, y); if (G().face !== dir) act(dir); }
  if (G().px !== x || G().py !== y || G().face !== dir) fail(`couldn't stand on ${x},${y} facing ${dir}`);
}
// Throw the Grapple Line from x, y
function hook(x, y, dir) { stand(x, y, dir); g.equip('grapple'); act('pinch'); }
// Vault from x, y
function hop(x, y, dir) { stand(x, y, dir); g.equip('hopstaff'); act('pinch'); }

console.log('The Sunk Mill');
travel('millgate');
fightHogs();
useAt(6, 6, 'down');
check(talked('nettle') === 1, 'Nettle at the Mill Gate explains the wheel');
travel('millwheel');
check(R().base[5][14] === 'M' && R().base[0][7] === 'M', 'the Wheel Pit: east and north gates are down');

travel('millembers');
// Use x, y from whichever side can be reached (foes drift into the way)
function useNear(x, y) {
  const back = { up: 'down', down: 'up', left: 'right', right: 'left' };
  for (let i = 0; i < 200; i++) {
    let best = null;
    for (const from of ['down', 'up', 'left', 'right']) {
      const [dx, dy] = DIRS[from], sx = x + dx, sy = y + dy;
      if (G().px === sx && G().py === sy) { act(back[from]); act('pinch'); return; }
      if (!g.query.heroCanStand(sx, sy)) continue;
      const p = path(sx, sy);
      if (p && (!best || p.length < best.length)) best = p;
    }
    if (best && best.length) step(best[0]); else wait();
  }
  fail(`couldn't get next to ${x},${y}`);
}
for (let tries = 0; tries < 8 && !G().flags.millembers.solved; tries++) {
  g.equip('thwacker');
  useNear(4, 3);
  useNear(7, 6);
  useNear(10, 3);
}
check(G().flags.millembers.solved, 'Ember Gallery: all braziers burning');

travel('millrope');
check(path(7, 3) === null, 'the Rope Store gap is too wide to cross on foot or by vault');
useAt(3, 9, 'down');
check(G().items.grapple, 'got the Grapple Line');
hook(3, 7, 'up');
check(G().carry, 'the line dragged a pot over the gap, into his hands');
act('pinch');
hook(6, 7, 'up');
check(G().px === 6 && G().py === 3, 'hooked the post and was pulled over the gap');
const c0 = G().coins;
goTo(12, 1);
check(G().coins === c0 + 5, 'a pocket of Luftballons on the far side');

travel('millsluice');
hook(4, 6, 'up');
check(R().obj[k(4, 2)] === 'j', 'yanked the first lever, out in the water');
hook(10, 6, 'right');
check(G().flags.millsluice.solved && G().story.mill_sluice, 'yanked the second over the thorns: water runs to the wheel');
hook(10, 4, 'up');
check(R().base[2][10] === 'g', 'yanked the sluice gate open across the gap');
const c1 = G().coins;
g.equip('hopstaff'); act('pinch');
check(G().px === 10 && G().py === 2, 'vaulted the gap into the open gate');
act('up'); act('pinch');
check(G().coins === c1 + 10, 'the chest behind the gate held 10 Luftballons');
act('down'); act('pinch');
check(G().py === 4, 'vaulted back');

travel('millrope');
hook(9, 3, 'down');
check(G().px === 9 && G().py === 7, 'hooked the post on the near side to come back');
travel('millwheel');
check(G().telk['mill-sluice'] && R().base[5][14] === 's', 'water at the wheel: the east gate is up, and Telkperson says so');

travel('millshells');
useAt(13, 1, 'left');
check(G().keys === 1, 'the Shell Garden chest held the small key');
hop(8, 7, 'down');
check(G().py === 9, 'vaulted down over the trench');
hook(8, 10, 'right');
check(R().obj[k(9, 10)] === 'O', 'dragged the wedged block out of its nook, onto the plate');
hop(5, 9, 'up');
for (let i = 0; i < 60 && !G().flags.millshells.solved; i++) {
  const m = R().enemies.find((e) => e.type === 'mimmet');
  if (!m) fail('the Mimmet is gone');
  if (G().py !== 5) { goTo(1, 5); continue; }
  if (g.query.heroCanStand(G().px + 1, G().py)) act('right'); else goTo(1, 5);
}
check(G().flags.millshells.solved, 'Shell Garden: the Mimmet on one plate, the block on the other');

travel('millgears');
fightHogs();
check(!R().enemies.length, 'Gear Loft: the Bristlehog is beaten');
for (let tries = 0; tries < 4 && !G().flags.millgears.solved; tries++) {
  hook(2, 7, 'up');
  stand(5, 8, 'right');
  g.equip('grapple'); act('pinch');
}
check(G().flags.millgears.solved && G().story.mill_gears, 'yanked both springing levers in time: the gears bite');
hook(12, 7, 'up');
check(G().py === 3, 'hooked across to the locked door');
travel('millhopper');
check(G().keys === 0, 'the small key opened the Gear Loft door');
hop(7, 9, 'up');
check(G().py === 7, 'vaulted the trench');
g.equip('grapple'); act('pinch');
check(G().px === 7 && G().py === 3, 'hooked the island post');
act('left'); act('pinch');
check(G().bigKey, "got the Mill's big key");
hook(9, 3, 'down');
check(G().py === 7, 'hooked the post in the trench to come back');
hop(7, 7, 'down');
check(G().py === 9, 'and vaulted back down');

travel('millgears');
hook(2, 3, 'down');
check(G().py === 7, 'back over the Gear Loft gap');
fightHogs();                           // foes come back when Bodge walks into a room again
travel('millwheel');
check(G().telk['mill-gears'] && R().base[0][7] === 's', 'the gears bite: the north gate is up');

travel('millstair');
hop(1, 9, 'up');
goTo(9, 6);
hook(9, 6, 'up');
check(G().py === 2, 'up the side, then hooked the far post');
travel('millheart');
check(R().boss && R().boss.type === 'kiln', 'the Kilnwarden is here');

// The Kilnwarden. Wait out of its ember lines and step out of every marked X.
// When a vent glows, stand in line with it and hook it. When it cools, vault the
// moat and strike its core; the blast throws Bodge back out.
// where to stand to hook each vent (side + 0 or 1), and where to wait for each side
const SPOT = {
  n0: [6, 1, 'down'], n1: [7, 1, 'down'], s0: [6, 8, 'up'], s1: [7, 8, 'up'],
  w0: [3, 4, 'right'], w1: [3, 5, 'right'], e0: [10, 4, 'left'], e1: [10, 5, 'left'],
};
const inRing = (x, y) => x >= 5 && x <= 8 && y >= 3 && y <= 6;
const emberLine = (x, y) => { const h = R().boss ? R().boss.hits : 0; return (h !== 1 && [4, 5].includes(y)) || (h >= 1 && [6, 7].includes(x)); };
const hot = (x, y) => marked(x, y);
let vents = 0;
for (let i = 0; i < 900 && R().boss; i++) {
  const b = R().boss, x = G().px, y = G().py;
  if (marked(x, y)) {
    // step out of the X, towards where the next vents will glow
    const far = () => 0;
    const out = Object.entries(DIRS).map(([d, [dx, dy]]) => [d, x + dx, y + dy])
      .filter(([, nx, ny]) => g.query.heroCanStand(nx, ny) && !marked(nx, ny) && !inRing(nx, ny))
      .sort((a, c) => (emberLine(a[1], a[2]) - emberLine(c[1], c[2])) * 10 + far(a[1], a[2]) - far(c[1], c[2]));
    if (out.length) { act(out[0][0]); continue; }
    if (inRing(x, y)) { const v = Object.entries(DIRS).find(([, [dx, dy]]) => !inRing(x + 2 * dx, y + 2 * dy) && g.query.heroCanStand(x + 2 * dx, y + 2 * dy)); if (v) { step('V:' + v[0]); continue; } }
    wait(); continue;
  }
  if (inRing(x, y)) {
    const next = Object.entries(DIRS).find(([, [dx, dy]]) => g.query.bossAt(x + dx, y + dy));
    if (b.phase === 'cool' && next) { g.equip('thwacker'); if (G().face !== next[0]) act(next[0]); act('pinch'); continue; }
    if (b.phase !== 'cool') {
      const v = Object.entries(DIRS).find(([, [dx, dy]]) => !inRing(x + 2 * dx, y + 2 * dy) && g.query.heroCanStand(x + 2 * dx, y + 2 * dy) && !marked(x + 2 * dx, y + 2 * dy));
      if (v) { step('V:' + v[0]); continue; }
    }
    wait(); continue;
  }
  braveEmbers = b.phase === 'vent';
  if (b.phase === 'vent' || b.phase === 'cool') {
    // cool: the nearest vault-in spot whose landing tile isn't cracked
    const land = ([lx, ly, ld]) => { const [dx, dy] = DIRS[ld]; return g.query.heroCanStand(lx + 2 * dx, ly + 2 * dy); };
    const coolSpot = Object.values(SPOT).filter(land).map((sp) => [sp, (path(sp[0], sp[1], (a, c) => hot(a, c) || inRing(a, c)) || { length: 99 }).length])
      .sort((a, c) => a[1] - c[1])[0];
    if (b.phase === 'cool' && !coolSpot) { wait(); continue; }
    let ventSpot = null;
    if (b.phase === 'vent') {
      // every tile in line with an unopened vent, outside the moat, in reach of the line
      const cands = [];
      for (const v of [b.side + '0', b.side + '1'].filter((id) => !(b.opened || []).includes(id))) {
        const h = Number(v[1]);
        const [vx, vy, dir] = { n: [b.x + h, b.y, 'down'], s: [b.x + h, b.y + 1, 'up'], w: [b.x, b.y + h, 'right'], e: [b.x + 1, b.y + h, 'left'] }[b.side];
        const [dx, dy] = DIRS[dir];
        for (let n = 3; n <= 5; n++) {
          const cx = vx - dx * n, cy = vy - dy * n;
          if (!g.query.heroCanStand(cx, cy) && !(G().px === cx && G().py === cy)) continue;
          let clear = true;
          for (let j = 1; j < n; j++) if ('#DBSMG*'.includes(g.query.baseAt(cx + dx * j, cy + dy * j))) clear = false;
          if (!clear) continue;
          // cost: walk there, ending with a step towards the boss so Bodge faces it
          // (or just turn, if the tile ahead is a gap or a crack)
          const avoid = (a, c) => hot(a, c) || inRing(a, c);
          const blocked = !g.query.heroCanStand(cx + dx, cy + dy);
          const here = G().px === cx && G().py === cy;
          let cost = null;
          if (here) cost = G().face === dir ? 0 : blocked ? 0 : 2;
          else if (blocked) { const p = path(cx, cy, avoid); if (p) cost = p.length; }
          else {
            const ax = cx - dx, ay = cy - dy;
            const p = G().px === ax && G().py === ay ? [] : g.query.heroCanStand(ax, ay) ? path(ax, ay, avoid) : null;
            if (p) cost = p.length + 1;
          }
          if (cost != null) cands.push([[cx, cy, dir], cost]);
        }
      }
      cands.sort((a, c) => a[1] - c[1]);
      if (!cands.length) { wait(); continue; }
      ventSpot = cands[0][0];
    }
    const [sx, sy, sd] = b.phase === 'vent' ? ventSpot : coolSpot[0];
    if (b.phase === 'vent' && !(x === sx && y === sy)) {
      const [dx, dy] = DIRS[sd], ax = sx - dx, ay = sy - dy;
      if (g.query.heroCanStand(sx + dx, sy + dy)) {
        // come at it from behind, so the last step faces the boss
        if (x === ax && y === ay) { act(sd); continue; }
        const p = path(ax, ay, (a, c) => hot(a, c) || inRing(a, c));
        if (p && p.length) { step(p[0]); continue; }
      }
    }
    if (x === sx && y === sy) {
      if (G().face !== sd) {
        const [dx, dy] = DIRS[sd];
        // the tile ahead is open, so turning would step: back off one and come again
        if (g.query.heroCanStand(x + dx, y + dy)) { const bk = { up: 'down', down: 'up', left: 'right', right: 'left' }[sd]; if (g.query.heroCanStand(x - dx, y - dy)) { act(bk); continue; } }
        act(sd);
      }
      if (b.phase === 'vent') { g.equip('grapple'); const before = (b.opened || []).length; act('pinch'); if (R().boss && (R().boss.opened || []).length > before) vents++; }
      else { g.equip('hopstaff'); act('pinch'); }
      continue;
    }
    const p = path(sx, sy, (a, c) => hot(a, c) || inRing(a, c)); 
    if (p && p.length) step(p[0]); else wait();
    continue;
  }
  // hot: wait where the vents will face, out of this round's ember lines:
  // south of it while embers fly along its rows, west while they fly down its columns
  const [wx, wy] = (b.hits === 1 ? [[2, 4], [2, 5]] : b.hits === 0 ? [[6, 10], [7, 10]] : [[4, 9], [9, 9]]).sort((p1, p2) => Math.abs(p1[0] - x) + Math.abs(p1[1] - y) - Math.abs(p2[0] - x) - Math.abs(p2[1] - y))[0];
  if (!(x === wx && y === wy)) {
    const p = path(wx, wy, (a, c) => hot(a, c) || emberLine(a, c) || inRing(a, c));
    if (p && p.length) { step(p[0]); continue; }
  }
  wait();
}
braveEmbers = false;
check(!R().boss && G().flags.millheart.bossDone, `the Kilnwarden is beaten (${vents} vents yanked open)`);
check(vents >= 5, 'one vent opened, then both on a side, twice');
collect('X'); collect('Q');
check(G().story.sun_mill && G().maxHearts >= 14, 'took the heart vessel and the second Sunstone');
check(cutPlayed('sunstone_mill'), "the vale's Sunstone cut scene plays");

travel('millstair');
check(G().telk.timber && G().story.timber, 'the wheel turns: Telkperson carries the timber to Brendan');
hook(12, 2, 'down');
check(G().py === 6, 'hooked the post down to the ledge');
goTo(1, 6); goTo(1, 7);
hop(1, 7, 'down');
check(G().py === 9, 'and vaulted down the side');
travel('millwheel');
travel('crossing');
check(g.tone() === 'day', 'Millbrook Vale is back in colour');
useAt(12, 2, 'down');
check(G().story.bridge && R().base[5][11] === '.' && R().look[6][11] === 'B', 'Brendan built the bridge from the mill timber');
check(cutPlayed('bridge'), 'the bridge cut scene plays');
check(G().forge === 2 && g.weaponName() === 'Millstone Thwacker', 'and reforged the Thwacker a second time');
useAt(12, 9, 'up');
check(log.some((l) => l.type === 'dialog' && /next update/.test(l.a[0].join(' '))), 'over the bridge: the road goes on (next update)');
travel('vale');
check(G().telk['vale-sun'], 'Telkperson celebrates');
const pages = g.mapPages().map((p) => p.id);
check(['wood', 'hollowoak', 'mill', 'sunkmill'].every((p) => pages.includes(p)), 'the map has a page for each place visited');

const s2 = lastSave();
const again = game();
check(again.g.load(JSON.parse(JSON.stringify(s2))).ok && again.g.G.story.sun_mill && again.g.G.forge === 2, 'the final save loads too');

/* ======================= old saves ======================= */
console.log('Saves from the last version');
const v2 = (extra) => ({
  v: 2, names: { hero: 'Old' }, room: 'sluice', px: 7, py: 9, face: 'up', hearts: 9, maxHearts: 10,
  keys: 1, bigKey: true, coins: 37, bag: { tonic: 1 }, shield: 0, warm: 0,
  items: { thwacker: true, hopstaff: true }, equip: 'hopstaff', carry: false,
  flags: { sluice: { opened: {}, chests: { '7,9': 1 }, taken: {}, solved: true, bossDone: false, seen: false }, oakheart: { opened: {}, chests: {}, taken: { '6,4': 1, '7,4': 1 }, solved: true, bossDone: true, seen: true } },
  story: { brambles: 1, sun_wood: 1, forged1: 1, met_kev: 1 }, seen: { village: 1, vale: 1, gate: 1, sluice: 1 }, telk: {}, hint: '',
  entry: { room: 'sluice', x: 7, y: 9, face: 'up' }, forge: 1, spent: 10, turns: 500, drops: 4, over: false, won: false,
  ...extra,
});
const o1 = game();
check(o1.g.load(v2()).ok && o1.g.R.id === 'vale', 'a save inside the old Mill wakes in Millbrook Vale');
check(o1.g.G.coins === 37 && o1.g.G.items.hopstaff && o1.g.G.bag.tonic === 1 && o1.g.G.names.hero === 'Old' && o1.g.G.forge === 1, '...with everything he had');
check(!o1.g.G.flags.sluice && !o1.g.G.seen.gate && o1.g.G.keys === 0 && !o1.g.G.items.grapple, '...and the new Mill to explore');
o1.g.load(JSON.parse(JSON.stringify(o1.log.filter((l) => l.type === 'save').pop().a[0])));
check(o1.g.G.v === 3, 'it saves again as version 3');
const o2 = game();
check(o2.g.load(v2({ room: 'vale', entry: { room: 'vale', x: 7, y: 1, face: 'down' }, story: { brambles: 1, sun_wood: 1, forged1: 1, sun_mill: 1 }, maxHearts: 14, hearts: 14 })).ok, 'a save with the old Mill beaten loads');
check(o2.g.G.items.grapple && o2.g.G.story.mill_gears && o2.g.G.flags.millheart.bossDone && o2.g.G.maxHearts === 14, '...counts as beaten in the new Mill, Grapple Line included, no hearts twice');
const o3 = game();
check(o3.g.load(v2({ room: 'oakhollow', entry: { room: 'oakhollow', x: 7, y: 10, face: 'up' }, story: { brambles: 1 }, keys: 1, bigKey: false })).ok && o3.g.G.keys === 1 && o3.g.R.id === 'oakhollow', 'a save inside the Hollow Oak keeps its key');

/* ======================= Kev's 99 Luftballons ======================= */
console.log("Kev's roof");
travel('village');
check(g.spent().spent === 10 && g.spent().goal === 99, "the King's Kebab is the first 10 on Kev's roof");
G().coins += 200;                      // a generous test budget
for (let i = 0; i < 60 && !G().story.balloons99; i++) {
  if ((G().bag.fizz || 0) >= 3) g.drink('fizz');
  g.buy('fizz');
}
check(G().story.balloons99 && g.spent().spent >= 99, 'spent 99 Luftballons');
check(cutPlayed('kev99'), "Kev's 99 Luftballons cut scene plays");
check(!g.buy('fizz').goal, 'it only plays once');

console.log(`✓ Played start to the bridge in ${G().turns} turns (${outCold} times out cold)`);
