/* ==========================================================================
   Bamberland — game engine and screens.
   Content lives in rooms.js (maps) and lore.js (names and text);
   drawing lives in render.js. Nothing here needs editing to add rooms.

   Part 1, the ENGINE, is plain logic with no page access, so it can be
   tested outside the browser. Part 2, the SCREENS, wires it to the glasses.
   ========================================================================== */
(() => {
  'use strict';

  /* =====================================================================
     PART 1 — ENGINE
     ===================================================================== */
  const W = 15, H = 12;
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const EDGE = { up: 'n', down: 's', left: 'w', right: 'e' };
  const TERRAIN = '#.~_DBS';
  const OBJECTS = 'OPC=NbLKHX';
  const ENEMY_CHARS = { h: 'hog', w: 'wisp', m: 'mimmet' };
  const SOLID_OBJ = 'OPCc=NblL';
  const TALL_OBJ = 'Cc=NblL';           // can't be vaulted over
  const WALK = '._ds';                  // floor, plate, open door, open shutter

  // Tuning
  const ENEMY_HP = { hog: 2, wisp: 1, mimmet: 2 };
  const HOG_SPEED = 3;                  // tiles per turn when charging
  const HOG_STUN = 5;                   // turns a hog stays dizzy after hitting a wall
  const WISP_RELOAD = 3;                // turns between embers
  const BOSS_HP = 3;
  const BOSS_COOL = [4, 4, 3];          // turns its core stays open, by hits taken
  const CRACK_TURNS = 6;                // how long slam cracks stay open
  const START_HEARTS = 6;               // in halves: 6 = three hearts
  const DROP_EVERY = 2;                 // every 2nd pot or foe drops a heart
  const SAVE_VERSION = 1;

  const key = (x, y) => x + ',' + y;
  const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function create(data, hooks = {}) {
    const ROOMS = data.rooms;
    const LORE = data.lore;
    const on = {
      toast() {}, dialog() {}, sound() {}, fx() {}, save() {},
      enter() {}, win() {}, over() {}, change() {},
      ...hooks,
    };

    let G = null;   // what is saved
    let R = null;   // the current room as it is right now

    /* ---------- text ---------- */
    function words() {
      const w = {
        hero: LORE.hero.name, world: LORE.world, dungeon: LORE.dungeon,
        weapon: LORE.items.thwacker.name, item: LORE.items.hopstaff.name,
        boss: LORE.boss.name,
      };
      for (const [id, e] of Object.entries(LORE.enemies || {})) w[id] = e.name;
      for (const [id, p] of Object.entries(LORE.people || {})) w[id] = p.name;
      return w;
    }
    const fmt = (s) => {
      const w = words();
      return String(s == null ? '' : s).replace(/\{(\w+)\}/g, (m, n) => (n in w ? w[n] : m));
    };
    const pages = (x) => (Array.isArray(x) ? x : [x]).map(fmt);
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    /* ---------- state ---------- */
    function fresh() {
      return {
        v: SAVE_VERSION,
        room: ROOMS.start, px: 7, py: 9, face: 'up',
        hearts: START_HEARTS, maxHearts: START_HEARTS,
        keys: 0, bigKey: false,
        items: { thwacker: true, hopstaff: false },
        equip: 'thwacker',
        carry: false,
        flags: {},
        entry: null,
        turns: 0, drops: 0,
        over: false, won: false,
      };
    }
    function flags(id) {
      if (!G.flags[id]) G.flags[id] = { opened: {}, chests: {}, taken: {}, solved: false, bossDone: false, seen: false };
      return G.flags[id];
    }
    const def = () => ROOMS.rooms[R.id];
    const F = () => flags(R.id);

    /* ---------- building a room from its map ---------- */
    function build(id) {
      const d = ROOMS.rooms[id];
      if (!d) throw new Error('No room called ' + id);
      const f = flags(id);
      const room = {
        id, base: [], obj: {}, enemies: [], embers: [], boss: null,
        plates: [], burn: {}, cracks: {}, marks: [],
        chestAt: {}, signAt: {}, talkAt: {}, start: null, bossTiles: [],
      };
      let ci = 0, si = 0, ti = 0, eid = 0;
      for (let y = 0; y < H; y++) {
        const row = (d.map && d.map[y]) || '';
        room.base[y] = [];
        for (let x = 0; x < W; x++) {
          const ch = row[x] == null ? '#' : row[x];
          let t = '.';
          if (TERRAIN.includes(ch)) t = ch;
          else if (OBJECTS.includes(ch)) room.obj[key(x, y)] = ch;
          else if (ENEMY_CHARS[ch]) room.enemies.push(newEnemy(ENEMY_CHARS[ch], x, y, eid++));
          else if (ch === 'Z') room.bossTiles.push([x, y]);
          else if (ch === '@') room.start = { x, y };
          if (ch === 'C') room.chestAt[key(x, y)] = ci++;
          if (ch === '=') room.signAt[key(x, y)] = si++;
          if (ch === 'N') room.talkAt[key(x, y)] = ti++;
          if (t === '_') room.plates.push([x, y]);
          room.base[y][x] = t;
        }
      }
      // Remembered changes
      for (const k of Object.keys(f.opened)) {
        const [x, y] = k.split(',').map(Number);
        if (inB(x, y) && 'DB'.includes(room.base[y][x])) room.base[y][x] = 'd';
      }
      for (const k of Object.keys(f.chests)) if (room.obj[k] === 'C') room.obj[k] = 'c';
      for (const k of Object.keys(f.taken)) if ('KX'.includes(room.obj[k] || '')) delete room.obj[k];
      if (f.solved) {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (room.base[y][x] === 'S') room.base[y][x] = 's';
        for (const k of Object.keys(room.obj)) if (room.obj[k] === 'b') room.obj[k] = 'L';
        if (d.solve === 'enemies') room.enemies = [];
      }
      // Boss
      if (room.bossTiles.length) {
        const xs = room.bossTiles.map((t) => t[0]), ys = room.bossTiles.map((t) => t[1]);
        const bx = Math.min(...xs), by = Math.min(...ys);
        if (f.bossDone) {
          dropRewards(room, bx, by, f);
        } else {
          room.boss = { x: bx, y: by, hp: BOSS_HP, hits: 0, phase: 'wake', t: 2, flash: 0 };
        }
      }
      return room;
    }
    function newEnemy(type, x, y, id) {
      return { id, type, x, y, hp: ENEMY_HP[type], face: 'down', st: 'idle', t: 0, charge: 0, dir: null };
    }
    function dropRewards(room, bx, by, f) {
      if (!f.taken[key(bx, by)]) room.obj[key(bx, by)] = 'X';
      if (!f.taken[key(bx + 1, by)]) room.obj[key(bx + 1, by)] = 'Q';
    }

    /* ---------- queries ---------- */
    const baseAt = (x, y) => (inB(x, y) ? R.base[y][x] : '#');
    const objAt = (x, y) => R.obj[key(x, y)] || '';
    const cracked = (x, y) => !!R.cracks[key(x, y)];
    const isGap = (x, y) => baseAt(x, y) === '~' || cracked(x, y);
    const enemyAt = (x, y) => R.enemies.find((e) => e.x === x && e.y === y) || null;
    const emberAt = (x, y) => R.embers.find((e) => e.x === x && e.y === y) || null;
    function bossAt(x, y) {
      const b = R.boss;
      return !!b && x >= b.x && x <= b.x + 1 && y >= b.y && y <= b.y + 1;
    }
    const isHero = (x, y) => G.px === x && G.py === y;
    function floorish(x, y) {
      return inB(x, y) && WALK.includes(baseAt(x, y)) && !cracked(x, y);
    }
    function heroCanStand(x, y) {
      return floorish(x, y) && !SOLID_OBJ.includes(objAt(x, y) || '-') && !enemyAt(x, y) && !bossAt(x, y);
    }
    function enemyCanStand(x, y, e) {
      if (!inB(x, y) || isHero(x, y) || bossAt(x, y)) return false;
      const other = enemyAt(x, y);
      if (other && other !== e) return false;
      if (SOLID_OBJ.includes(objAt(x, y) || '-')) return false;
      if (e.type === 'wisp' && isGap(x, y)) return true;
      return floorish(x, y);
    }
    function front() {
      const [dx, dy] = DIRS[G.face];
      return [G.px + dx, G.py + dy];
    }
    const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    function toward(fx, fy, tx, ty) {
      const dx = tx - fx, dy = ty - fy;
      if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : dx < 0 ? 'left' : (dy > 0 ? 'down' : 'up');
      return dy > 0 ? 'down' : 'up';
    }

    /* ---------- saving ---------- */
    function snapshotSave() {
      const s = clone(G);
      s.carry = false;
      return s;
    }
    function save() { if (G && !G.over) on.save(snapshotSave()); }

    /* ---------- entering rooms ---------- */
    function enterRoom(id, x, y, face, { quiet = false } = {}) {
      R = build(id);
      G.room = id;
      G.carry = false;
      G.face = face || G.face;
      let px = x, py = y;
      if (px == null || !heroCanStand(px, py)) {
        const spot = nearestStand(px == null ? 7 : px, py == null ? 9 : py);
        px = spot.x; py = spot.y;
      }
      G.px = px; G.py = py;
      G.entry = { room: id, x: px, y: py, face: G.face };
      save();
      on.enter(def().name || id, quiet);
      const f = F();
      if (R.boss && !f.seen) {
        f.seen = true;
        on.dialog(pages(LORE.boss.intro), cap(fmt(LORE.boss.name)));
      }
      on.change();
    }
    function nearestStand(x, y) {
      let best = null, bd = Infinity;
      for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
        if (!heroCanStand(xx, yy)) continue;
        const d = Math.abs(xx - x) + Math.abs(yy - y);
        if (d < bd) { bd = d; best = { x: xx, y: yy }; }
      }
      return best || { x, y };
    }
    function exitTo(dir) {
      const exits = def().exits || {};
      const target = exits[EDGE[dir]];
      if (!target || !ROOMS.rooms[target]) return false;
      let x = G.px, y = G.py;
      if (dir === 'up') y = H - 1;
      if (dir === 'down') y = 0;
      if (dir === 'left') x = W - 1;
      if (dir === 'right') x = 0;
      on.sound('door');
      enterRoom(target, x, y, dir);
      return true;
    }

    /* ---------- damage and healing ---------- */
    function hurt(n) {
      if (G.over || G.won) return;
      G.hearts = Math.max(0, G.hearts - n);
      on.fx('hurt', { x: G.px, y: G.py });
      on.sound('hurt');
      if (G.hearts <= 0) {
        G.over = true;
        G.carry = false;
        on.over();
      }
    }
    function heal(n) { G.hearts = Math.min(G.maxHearts, G.hearts + n); }
    function maybeDrop(x, y) {
      G.drops += 1;
      if (G.drops % DROP_EVERY !== 0) return;
      if (floorish(x, y) && !objAt(x, y) && !isHero(x, y)) R.obj[key(x, y)] = 'H';
    }

    /* ---------- the hero's actions ---------- */
    // Each returns true if something changed (redraw), and calls world() if a turn passed.
    function act(a) {
      if (!G || !R || G.over || G.won) return false;
      if (DIRS[a]) return move(a);
      if (a === 'pinch') return pinch();
      return false;
    }

    function move(dir) {
      const turned = G.face !== dir;
      G.face = dir;
      const [dx, dy] = DIRS[dir];
      const nx = G.px + dx, ny = G.py + dy;
      if (!inB(nx, ny)) {
        if (exitTo(dir)) return true;
        on.fx('bump');
        return turned;
      }
      if (!heroCanStand(nx, ny)) {
        explainBlock(nx, ny);
        on.fx('bump');
        on.change();
        return true;
      }
      G.px = nx; G.py = ny;
      on.sound('step');
      stepOn();
      world({ moved: dir });
      return true;
    }

    function explainBlock(x, y) {
      const t = baseAt(x, y), M = LORE.messages;
      if (t === 'D') on.toast(fmt(G.keys > 0 ? M.unlock : M.locked));
      else if (t === 'B') on.toast(fmt(G.bigKey ? M.unlock : M.bigLocked));
      else if (t === 'S') on.toast(fmt(M.sealed));
      else if (isGap(x, y)) {
        if (!G.items.hopstaff) on.toast(fmt(M.gap));
        else if (G.equip !== 'hopstaff') on.toast(fmt(M.gapHint));
      }
    }

    function stepOn() {
      const em = emberAt(G.px, G.py);
      if (em) { R.embers.splice(R.embers.indexOf(em), 1); hurt(1); }
      const k = key(G.px, G.py), o = R.obj[k];
      if (!o) return;
      const P = LORE.pickups;
      if (o === 'K') {
        delete R.obj[k]; F().taken[k] = 1; G.keys += 1;
        on.sound('pickup'); on.toast(fmt(P.key.name) + ' +1'); save();
      } else if (o === 'H') {
        delete R.obj[k]; heal(2); on.sound('pickup');
      } else if (o === 'X') {
        delete R.obj[k]; F().taken[k] = 1; G.maxHearts += 2; G.hearts = G.maxHearts;
        on.sound('fanfare'); on.dialog(pages(P.container.found)); save();
      } else if (o === 'Q') {
        delete R.obj[k]; F().taken[k] = 1; G.won = true;
        on.sound('fanfare'); save(); on.win();
      }
    }

    function pinch() {
      if (G.carry) return throwPot();
      const [fx, fy] = front();
      if (inB(fx, fy)) {
        const k = key(fx, fy), o = objAt(fx, fy), t = baseAt(fx, fy);
        const d = def();
        if (o === 'N') {
          const entry = (d.talk || [])[R.talkAt[k]];
          if (entry) {
            const who = LORE.people && LORE.people[entry.who];
            on.dialog(pages(entry.lines), who ? fmt(who.name) : '');
          }
          return true;
        }
        if (o === '=') {
          const text = (d.signs || [])[R.signAt[k]];
          if (text) on.dialog(pages(text), 'Sign');
          return true;
        }
        if (o === 'C') return openChest(fx, fy);
        if (o === 'P') {
          delete R.obj[k]; G.carry = true; on.sound('lift');
          world({}); return true;
        }
        if (o === 'O') return push(fx, fy);
        if (o === 'b' || o === 'l') {
          R.obj[k] = 'l'; R.burn[k] = (d.burn || 10) + 1;
          on.sound('light'); on.fx('swing', { x: fx, y: fy });
          world({}); return true;
        }
        if (t === 'D') {
          if (G.keys <= 0) { on.toast(fmt(LORE.messages.locked)); on.fx('bump'); return true; }
          G.keys -= 1; R.base[fy][fx] = 'd'; F().opened[k] = 1;
          on.sound('unlock'); save(); on.change(); return true;
        }
        if (t === 'B') {
          if (!G.bigKey) { on.toast(fmt(LORE.messages.bigLocked)); on.fx('bump'); return true; }
          R.base[fy][fx] = 'd'; F().opened[k] = 1;
          on.sound('unlock'); save(); on.change(); return true;
        }
        if (t === 'S') { on.toast(fmt(LORE.messages.sealed)); on.fx('bump'); return true; }
      }
      if (G.equip === 'hopstaff' && G.items.hopstaff) return vault();
      return swing();
    }

    function openChest(x, y) {
      const k = key(x, y);
      R.obj[k] = 'c'; F().chests[k] = 1;
      const item = (def().chests || [])[R.chestAt[k]] || 'heart';
      give(item);
      on.change();
      return true;
    }

    function give(item) {
      const P = LORE.pickups;
      let text = '';
      if (item === 'key') { G.keys += 1; text = P.key.found; }
      else if (item === 'bigkey') { G.bigKey = true; text = P.bigkey.found; }
      else if (item === 'heart') { G.hearts = G.maxHearts; text = P.heart.found; }
      else if (item === 'container') { G.maxHearts += 2; G.hearts = G.maxHearts; text = P.container.found; }
      else if (LORE.items[item]) { G.items[item] = true; text = LORE.items[item].found || LORE.items[item].name; }
      on.sound('fanfare');
      save();
      if (text) on.dialog(pages(text));
    }

    function push(fx, fy) {
      const [dx, dy] = DIRS[G.face];
      const tx = fx + dx, ty = fy + dy;
      const t = baseAt(tx, ty);
      if (inB(tx, ty) && (t === '.' || t === '_') && !cracked(tx, ty) && !objAt(tx, ty)
          && !enemyAt(tx, ty) && !bossAt(tx, ty) && !isHero(tx, ty)) {
        R.obj[key(tx, ty)] = 'O';
        delete R.obj[key(fx, fy)];
        on.sound('push');
        world({});
        return true;
      }
      on.toast(fmt(LORE.messages.stuck));
      on.fx('bump');
      return true;
    }

    function swing() {
      const [fx, fy] = front();
      const [dx, dy] = DIRS[G.face];
      on.fx('swing', { x: fx, y: fy });
      const em = emberAt(fx, fy);
      const e = enemyAt(fx, fy);
      if (em) { R.embers.splice(R.embers.indexOf(em), 1); on.sound('hit'); }
      else if (e) strike(e, dx, dy, true);
      else if (bossAt(fx, fy)) strikeBoss();
      else on.sound('swish');
      world({});
      return true;
    }

    function strike(e, dx, dy, knock) {
      if (e.type === 'hog' && e.st !== 'stun') {
        on.toast(fmt(LORE.messages.clang)); on.sound('clang');
        return;
      }
      e.hp -= 1;
      e.flash = 1;
      on.sound('hit');
      on.fx('hit', { x: e.x, y: e.y });
      if (e.hp <= 0) { kill(e); return; }
      if (knock && e.type !== 'hog') {
        const tx = e.x + dx, ty = e.y + dy;
        if (inB(tx, ty) && isGap(tx, ty) && e.type !== 'wisp') { kill(e, true); return; }
        if (enemyCanStand(tx, ty, e) && !emberAt(tx, ty)) { e.x = tx; e.y = ty; }
      }
    }
    function kill(e, fell) {
      R.enemies.splice(R.enemies.indexOf(e), 1);
      on.sound('defeat');
      on.fx('poof', { x: e.x, y: e.y });
      if (!fell) maybeDrop(e.x, e.y);
    }

    function strikeBoss() {
      const b = R.boss;
      if (b.phase !== 'cool') { on.toast(fmt(LORE.messages.hot)); on.sound('clang'); return; }
      b.hp -= 1; b.hits += 1; b.flash = 1;
      on.sound('boss'); on.fx('hit', { x: b.x, y: b.y });
      if (b.hp <= 0) { defeatBoss(); return; }
      // The blast throws Bodge back over the moat
      const [dx, dy] = DIRS[G.face];
      if (heroCanStand(G.px - 2 * dx, G.py - 2 * dy)) { G.px -= 2 * dx; G.py -= 2 * dy; }
      else if (heroCanStand(G.px - dx, G.py - dy)) { G.px -= dx; G.py -= dy; }
      b.phase = 'recoil'; b.t = 1;
    }
    function defeatBoss() {
      const b = R.boss;
      R.boss = null;
      R.embers = []; R.cracks = {}; R.marks = [];
      const f = F();
      f.bossDone = true;
      dropRewards(R, b.x, b.y, f);
      solve(true);
      on.sound('fanfare');
      on.dialog(pages(LORE.boss.defeat), cap(fmt(LORE.boss.name)));
    }

    function vault() {
      const [dx, dy] = DIRS[G.face];
      const x1 = G.px + dx, y1 = G.py + dy, x2 = G.px + 2 * dx, y2 = G.py + 2 * dy;
      const low = inB(x1, y1) && !'#DBS'.includes(baseAt(x1, y1)) && !bossAt(x1, y1)
        && !TALL_OBJ.includes(objAt(x1, y1) || '-');
      if (!low || !inB(x2, y2) || !heroCanStand(x2, y2)) {
        on.toast(fmt(LORE.messages.noVault));
        on.fx('bump');
        return true;
      }
      G.px = x2; G.py = y2;
      on.sound('vault');
      on.fx('vault', { x: x1, y: y1 });
      stepOn();
      world({ moved: G.face });
      return true;
    }

    function throwPot() {
      G.carry = false;
      const [dx, dy] = DIRS[G.face];
      let x = G.px, y = G.py, landed = null;
      for (let i = 1; i <= 4; i++) {
        const tx = G.px + dx * i, ty = G.py + dy * i;
        if (!inB(tx, ty)) break;
        const t = baseAt(tx, ty), o = objAt(tx, ty);
        if ('#DBS'.includes(t) || SOLID_OBJ.includes(o || '-') || bossAt(tx, ty)) break;
        x = tx; y = ty;
        const em = emberAt(tx, ty);
        if (em) { R.embers.splice(R.embers.indexOf(em), 1); landed = [tx, ty]; break; }
        const e = enemyAt(tx, ty);
        if (e) { strike(e, dx, dy, false); landed = [tx, ty]; break; }
      }
      if (!landed) landed = [x, y];
      on.sound('smash');
      on.fx('poof', { x: landed[0], y: landed[1] });
      if (!(landed[0] === G.px && landed[1] === G.py) && !isGap(landed[0], landed[1]) && !enemyAt(landed[0], landed[1])) {
        maybeDrop(landed[0], landed[1]);
      }
      world({});
      return true;
    }

    /* ---------- the world's turn ---------- */
    function world(ctx) {
      G.turns += 1;
      for (const e of R.enemies) e.flash = 0;
      if (R.boss) R.boss.flash = 0;
      moveEmbers();
      for (const e of R.enemies.slice()) {
        if (G.over) break;
        if (!R.enemies.includes(e)) continue;
        if (e.type === 'hog') hogTurn(e);
        else if (e.type === 'wisp') wispTurn(e);
        else if (e.type === 'mimmet') mimmetTurn(e, ctx);
      }
      if (R.boss && !G.over) bossTurn();
      tickBurn();
      tickCracks();
      checkSolve();
      on.change();
    }

    function moveEmbers() {
      for (const em of R.embers.slice()) {
        const nx = em.x + em.dx, ny = em.y + em.dy;
        const gone = () => R.embers.splice(R.embers.indexOf(em), 1);
        if (!inB(nx, ny)) { gone(); continue; }
        if (isHero(nx, ny)) { gone(); hurt(1); continue; }
        const o = objAt(nx, ny), t = baseAt(nx, ny);
        if (o === 'b' || o === 'l') {
          R.obj[key(nx, ny)] = 'l'; R.burn[key(nx, ny)] = (def().burn || 10) + 1;
          on.sound('light'); gone(); continue;
        }
        if ('#DBS'.includes(t) || SOLID_OBJ.includes(o || '-') || enemyAt(nx, ny) || bossAt(nx, ny)) { gone(); continue; }
        em.x = nx; em.y = ny;
      }
    }

    function spawnEmber(x, y, dx, dy) {
      if (!inB(x, y)) return;
      if (isHero(x, y)) { hurt(1); return; }
      const t = baseAt(x, y), o = objAt(x, y);
      if ('#DBS'.includes(t) || SOLID_OBJ.includes(o || '-') || enemyAt(x, y)) return;
      R.embers.push({ x, y, dx, dy });
    }

    // Clear straight line for a hog between it and Bodge?
    function hogSees(e) {
      if (e.x !== G.px && e.y !== G.py) return null;
      const dir = toward(e.x, e.y, G.px, G.py);
      const [dx, dy] = DIRS[dir];
      let x = e.x + dx, y = e.y + dy;
      while (!isHero(x, y)) {
        if (!floorish(x, y) || SOLID_OBJ.includes(objAt(x, y) || '-') || enemyAt(x, y)) return null;
        x += dx; y += dy;
      }
      return dir;
    }

    function hogTurn(e) {
      if (e.st === 'stun') {
        e.t -= 1;
        if (e.t <= 0) e.st = 'idle';
        return;
      }
      if (e.st === 'idle') {
        const dir = hogSees(e);
        e.face = toward(e.x, e.y, G.px, G.py);
        if (dir) { e.st = 'alert'; e.dir = dir; e.face = dir; }
        return;
      }
      if (e.st === 'alert') e.st = 'charge';
      if (e.st === 'charge') {
        const [dx, dy] = DIRS[e.dir];
        for (let i = 0; i < HOG_SPEED; i++) {
          const nx = e.x + dx, ny = e.y + dy;
          if (isHero(nx, ny)) {
            hurt(2);
            if (heroCanStand(G.px + dx, G.py + dy)) { G.px += dx; G.py += dy; }
            e.st = 'idle';
            return;
          }
          if (!enemyCanStand(nx, ny, e)) {
            const soft = isGap(nx, ny) || enemyAt(nx, ny);
            if (soft) e.st = 'idle';
            else { e.st = 'stun'; e.t = HOG_STUN; on.sound('thud'); on.fx('hit', { x: nx, y: ny }); }
            return;
          }
          e.x = nx; e.y = ny;
          const em = emberAt(nx, ny);
          if (em) R.embers.splice(R.embers.indexOf(em), 1);
        }
      }
    }

    function wispTurn(e) {
      e.charge = Math.min(WISP_RELOAD, e.charge + 1);
      const hero = { x: G.px, y: G.py };
      const aligned = e.x === G.px || e.y === G.py;
      if (e.charge >= WISP_RELOAD && aligned) {
        const dir = toward(e.x, e.y, G.px, G.py);
        const [dx, dy] = DIRS[dir];
        e.face = dir;
        spawnEmber(e.x + dx, e.y + dy, dx, dy);
        e.charge = 0;
        on.sound('spit');
        return;
      }
      // Keeps 3–4 tiles away: backs off if you're close, drifts in if you're far,
      // and otherwise sidesteps every other turn to line up a shot.
      const d = dist(e, hero);
      if (d >= 3 && d <= 4 && (aligned || G.turns % 2)) return;
      let best = null, bestScore = -Infinity;
      for (const dir of ['up', 'right', 'down', 'left']) {
        const [dx, dy] = DIRS[dir];
        const nx = e.x + dx, ny = e.y + dy;
        if (!enemyCanStand(nx, ny, e) || emberAt(nx, ny)) continue;
        const nd = dist({ x: nx, y: ny }, hero);
        let score;
        if (d <= 2) score = nd;
        else if (d >= 5) score = -nd;
        else {
          if (nd < 3 || nd > 5) continue;
          if (nx !== G.px && ny !== G.py) continue;
          score = 0;
        }
        if (score > bestScore) { bestScore = score; best = [nx, ny]; }
      }
      if (!best || (d <= 2 && bestScore <= d)) return;
      e.x = best[0]; e.y = best[1];
      e.face = toward(e.x, e.y, G.px, G.py);
    }

    function mimmetTurn(e, ctx) {
      if (!ctx.moved) return;
      const [dx, dy] = DIRS[ctx.moved];
      const mx = e.x - dx, my = e.y + dy;
      e.face = dx ? (dx > 0 ? 'left' : 'right') : ctx.moved;
      if (isHero(mx, my)) { hurt(1); on.fx('hit', { x: mx, y: my }); return; }
      if (enemyCanStand(mx, my, e)) {
        e.x = mx; e.y = my;
        const em = emberAt(mx, my);
        if (em) { R.embers.splice(R.embers.indexOf(em), 1); }
      }
    }

    /* ---------- the boss ---------- */
    function setMarks() {
      const b = R.boss;
      b.phase = 'mark';
      R.marks = [];
      for (const [dx, dy] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const x = G.px + dx, y = G.py + dy;
        if (floorish(x, y) && !bossAt(x, y) && !SOLID_OBJ.includes(objAt(x, y) || '-')) R.marks.push([x, y]);
      }
    }
    function bossTurn() {
      const b = R.boss;
      switch (b.phase) {
        case 'wake':
          b.t -= 1;
          if (b.t <= 0) setMarks();
          break;
        case 'recoil':
          setMarks();
          break;
        case 'mark': {
          // SLAM: the marked cross cracks open
          let hit = false;
          for (const [x, y] of R.marks) {
            if (isHero(x, y)) { hit = true; continue; }
            if (!objAt(x, y) && !enemyAt(x, y)) R.cracks[key(x, y)] = CRACK_TURNS + 1;
          }
          on.sound('slam');
          on.fx('shake');
          R.marks = [];
          b.phase = 'slam';
          if (hit) hurt(2);
          break;
        }
        case 'slam': {
          // VENT: embers fly out in lines
          const out = [
            [b.x - 1, b.y, -1, 0], [b.x - 1, b.y + 1, -1, 0],
            [b.x + 2, b.y, 1, 0], [b.x + 2, b.y + 1, 1, 0],
          ];
          if (b.hits >= 1) out.push(
            [b.x, b.y - 1, 0, -1], [b.x + 1, b.y - 1, 0, -1],
            [b.x, b.y + 2, 0, 1], [b.x + 1, b.y + 2, 0, 1],
          );
          for (const [x, y, dx, dy] of out) spawnEmber(x, y, dx, dy);
          on.sound('spit');
          b.phase = 'vent';
          break;
        }
        case 'vent':
          b.phase = 'cool';
          b.t = BOSS_COOL[Math.min(b.hits, BOSS_COOL.length - 1)];
          on.sound('cool');
          break;
        case 'cool':
          b.t -= 1;
          if (b.t <= 0) setMarks();
          break;
        default:
          setMarks();
      }
    }

    function tickBurn() {
      for (const k of Object.keys(R.burn)) {
        R.burn[k] -= 1;
        if (R.burn[k] <= 0) { delete R.burn[k]; if (R.obj[k] === 'l') R.obj[k] = 'b'; }
      }
    }
    function tickCracks() {
      for (const k of Object.keys(R.cracks)) {
        R.cracks[k] -= 1;
        if (R.cracks[k] <= 0) delete R.cracks[k];
      }
      // A crack never closes under someone; it just waits
    }

    /* ---------- solving a room ---------- */
    function checkSolve() {
      const d = def(), f = F();
      if (f.solved || !d.solve) return;
      let ok = false;
      if (d.solve === 'plates') {
        ok = R.plates.length > 0 && R.plates.every(([x, y]) =>
          objAt(x, y) === 'O' || R.enemies.some((e) => e.type === 'mimmet' && e.x === x && e.y === y));
      } else if (d.solve === 'braziers') {
        const vals = Object.values(R.obj);
        ok = vals.includes('l') && !vals.includes('b');
      } else if (d.solve === 'enemies') {
        ok = R.enemies.length === 0;
      }
      if (ok) solve(false);
    }
    function solve(quiet) {
      const f = F();
      if (f.solved) return;
      f.solved = true;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (R.base[y][x] === 'S') R.base[y][x] = 's';
      for (const k of Object.keys(R.obj)) if (R.obj[k] === 'l') R.obj[k] = 'L';
      R.burn = {};
      if (!quiet) { on.sound('solve'); on.toast(fmt(def().solvedText || LORE.messages.solved)); }
      save();
    }

    /* ---------- public ---------- */
    function newGame() {
      G = fresh();
      const d = ROOMS.rooms[ROOMS.start];
      R = build(ROOMS.start);
      const s = R.start || { x: 7, y: 9 };
      enterRoom(ROOMS.start, s.x, s.y, 'up', { quiet: false });
      if (LORE.opening && LORE.opening.length) on.dialog(pages(LORE.opening));
      return d;
    }
    function load(saved) {
      if (!saved || saved.v !== SAVE_VERSION || !saved.entry || !ROOMS.rooms[saved.entry.room]) return false;
      G = { ...fresh(), ...clone(saved), over: false, carry: false };
      G.hearts = Math.max(1, G.hearts);
      const e = G.entry;
      enterRoom(e.room, e.x, e.y, e.face);
      return true;
    }
    function resetRoom() {
      if (!G || !G.entry) return;
      const e = G.entry;
      enterRoom(e.room, e.x, e.y, e.face, { quiet: true });
      on.toast(fmt(LORE.messages.reset));
    }
    function revive() {
      G.over = false;
      G.hearts = G.maxHearts;
      const e = G.entry;
      enterRoom(e.room, e.x, e.y, e.face, { quiet: true });
    }
    function equip(name) {
      if (!G.items[name]) return false;
      G.equip = name;
      on.change();
      return true;
    }

    // What a pinch would do right now (for the hint bar)
    function pinchVerb() {
      if (!G || !R) return '';
      if (G.carry) return 'Throw';
      const [fx, fy] = front();
      if (inB(fx, fy)) {
        const o = objAt(fx, fy), t = baseAt(fx, fy);
        if (o === 'N') return 'Talk';
        if (o === '=') return 'Read';
        if (o === 'C') return 'Open';
        if (o === 'P') return 'Lift';
        if (o === 'O') return 'Push';
        if (o === 'b' || o === 'l') return 'Light';
        if (t === 'D' || t === 'B') return 'Unlock';
      }
      if (G.equip === 'hopstaff' && G.items.hopstaff) return 'Vault';
      if (inB(fx, fy) && (enemyAt(fx, fy) || bossAt(fx, fy))) return 'Strike';
      return 'Swing';
    }

    return {
      get G() { return G; },
      get R() { return R; },
      W, H, DIRS,
      fmt, pages,
      newGame, load, resetRoom, revive, equip, act, pinchVerb,
      snapshot() { return clone({ G, R }); },
      restore(s) { G = clone(s.G); R = clone(s.R); },
      roomName: () => (R ? ROOMS.rooms[R.id].name : ''),
      // used by render.js
      query: { baseAt, objAt, cracked, isGap, enemyAt, bossAt },
    };
  }

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.BamberEngine = { create, W, H };

  /* =====================================================================
     PART 2 — SCREENS (title, play, item ring, dialogue, out cold, ending)
     ===================================================================== */
  if (typeof document === 'undefined' || !document.getElementById('board')) return;

  const Deck = root.Deck;
  const LORE = root.BAMBER_LORE;
  const ROOMS = root.BAMBER_ROOMS;
  const Draw = root.BamberRender;
  const SAVE_KEY = 'bamberland.save';
  const SOUND_KEY = 'bamberland.sound';
  const $ = (id) => document.getElementById(id);

  const board = $('board');
  const titleView = $('titleView');
  const dialogEl = $('dialog');
  const overlayEl = $('overlay');

  let mode = 'title';          // title | play | ring | dialog | over | end
  let dialogQueue = [];        // [{ who, text }]
  let afterDialog = 'play';
  let ring = { items: [], i: 0 };
  let fx = [];                 // short-lived effects for the next draw
  let banner = null;
  let bannerTimer = null;
  let fxTimer = null;
  let confirmNew = false;

  /* ---------- sound (Web Audio blips; off by default) ---------- */
  const Sound = (() => {
    const AC = root.AudioContext || root.webkitAudioContext;
    let ctx = null;
    let on = !!(AC && Deck.store.get(SOUND_KEY, false));
    const notes = {
      step: [[180, 0.03, 'triangle', 0.04]],
      swish: [[260, 0.05, 'triangle', 0.05]],
      hit: [[320, 0.05, 'square', 0.06], [180, 0.06, 'square', 0.05]],
      clang: [[900, 0.04, 'square', 0.04], [700, 0.06, 'square', 0.03]],
      hurt: [[200, 0.08, 'sawtooth', 0.07], [120, 0.1, 'sawtooth', 0.06]],
      pickup: [[660, 0.06, 'triangle', 0.06], [990, 0.08, 'triangle', 0.06]],
      fanfare: [[523, 0.09, 'triangle', 0.07], [659, 0.09, 'triangle', 0.07], [784, 0.16, 'triangle', 0.07]],
      solve: [[440, 0.08, 'triangle', 0.06], [554, 0.08, 'triangle', 0.06], [740, 0.14, 'triangle', 0.06]],
      unlock: [[392, 0.06, 'square', 0.04], [587, 0.08, 'square', 0.04]],
      push: [[90, 0.08, 'triangle', 0.08]],
      lift: [[300, 0.05, 'triangle', 0.05]],
      smash: [[150, 0.07, 'square', 0.06]],
      light: [[520, 0.05, 'triangle', 0.05], [780, 0.06, 'triangle', 0.04]],
      vault: [[240, 0.05, 'triangle', 0.06], [480, 0.08, 'triangle', 0.05]],
      defeat: [[400, 0.05, 'triangle', 0.05], [200, 0.09, 'triangle', 0.05]],
      thud: [[70, 0.1, 'square', 0.07]],
      spit: [[700, 0.04, 'triangle', 0.03]],
      slam: [[60, 0.16, 'sawtooth', 0.09]],
      cool: [[330, 0.12, 'sine', 0.05]],
      boss: [[110, 0.12, 'square', 0.08], [90, 0.16, 'square', 0.07]],
      door: [[220, 0.04, 'triangle', 0.04]],
    };
    function play(name) {
      if (!on || !notes[name]) return;
      try {
        if (!ctx) ctx = new AC();
        if (ctx.state === 'suspended') ctx.resume();
        let t = ctx.currentTime;
        for (const [freq, dur, type, vol] of notes[name]) {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = type; o.frequency.value = freq;
          g.gain.setValueAtTime(vol, t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          o.connect(g); g.connect(ctx.destination);
          o.start(t); o.stop(t + dur + 0.02);
          t += dur * 0.9;
        }
      } catch { on = false; }
    }
    return {
      supported: !!AC,
      get on() { return on; },
      toggle() {
        if (!AC) return false;
        on = !on;
        Deck.store.set(SOUND_KEY, on);
        if (on) play('pickup');
        return on;
      },
      play,
    };
  })();

  /* ---------- the engine, wired up ---------- */
  const game = root.BamberEngine.create({ rooms: ROOMS, lore: LORE }, {
    toast: (m) => Deck.toast(m),
    dialog: (lines, who) => openDialog(lines, who || ''),
    sound: (n) => Sound.play(n),
    fx: (type, at) => addFx(type, at),
    save: (s) => Deck.store.set(SAVE_KEY, s),
    enter: (name) => { fx = []; showBanner(name); },
    over: () => { mode = 'over'; dialogQueue = []; dialogEl.hidden = true; showOverlay(); },
    win: () => { mode = 'end'; dialogQueue = []; dialogEl.hidden = true; showOverlay(); },
    change: () => {},
  });

  /* ---------- drawing ---------- */
  let drawQueued = false;
  function redraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => {
      drawQueued = false;
      if (mode === 'title') return;
      Draw.draw(board, game, { fx, banner, ring: mode === 'ring' ? ring : null, lore: LORE });
      updateHud();
      updateHints();
    });
  }
  function addFx(type, at) {
    if (type === 'bump') return;
    fx.push({ type, ...(at || {}) });
    clearTimeout(fxTimer);
    fxTimer = setTimeout(() => { fx = []; redraw(); }, 220);   // one extra frame, then quiet
  }
  function showBanner(name) {
    banner = name;
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
    thwacker: '<svg viewBox="0 0 24 24" class="ico"><rect x="11" y="3" width="10" height="7" rx="1.5" transform="rotate(35 16 6.5)"/><path d="M12.5 10.5 4 20"/><circle cx="16.3" cy="6.6" r="1.2"/></svg>',
    hopstaff: '<svg viewBox="0 0 24 24" class="ico"><path d="M6 21 18 3"/><path d="M15.5 6.5c1.8.4 2.8 1.6 2.5 3.4M8.5 17.5c-1.8-.4-2.8-1.6-2.5-3.4"/></svg>',
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
    $('keys').innerHTML = `${ICONS.key}<b>${G.keys}</b>`;
    $('bigkey').innerHTML = ICONS.bigkey;
    $('bigkey').classList.toggle('is-on', !!G.bigKey);
    const it = LORE.items[G.equip];
    $('equip').innerHTML = `${ICONS[G.equip] || ''}<span>${Deck.esc(it ? it.name : '')}</span>`;
  }
  function updateHints() {
    if (mode === 'play') Deck.hints([['Swipe', 'step'], ['Pinch', game.pinchVerb().toLowerCase()], ['Back', 'items']]);
    else if (mode === 'ring') Deck.hints([['Swipe', 'choose'], ['Pinch', 'use'], ['Back', 'close']]);
    else if (mode === 'dialog') Deck.hints([['Pinch', 'next'], ['Back', 'close']]);
    else if (mode === 'over' || mode === 'end') Deck.hints([['Pinch', 'continue']]);
  }

  /* ---------- dialogue box ---------- */
  function openDialog(lines, who) {
    for (const text of lines) dialogQueue.push({ who, text });
    if (mode !== 'dialog' && mode !== 'over' && mode !== 'end') {
      afterDialog = mode === 'ring' ? 'play' : mode;
      if (afterDialog === 'title') afterDialog = 'play';
      mode = 'dialog';
    }
    showDialogPage();
  }
  function showDialogPage() {
    const page = dialogQueue[0];
    if (!page) { dialogEl.hidden = true; return; }
    dialogEl.hidden = false;
    $('dialogWho').textContent = page.who || '';
    $('dialogWho').hidden = !page.who;
    $('dialogText').textContent = page.text;
    $('dialogMore').textContent = dialogQueue.length > 1 ? 'Pinch ▸' : 'Pinch ✓';
    updateHints();
  }
  function nextDialog(all) {
    if (all) dialogQueue = []; else dialogQueue.shift();
    if (dialogQueue.length) { showDialogPage(); return; }
    dialogEl.hidden = true;
    if (mode === 'dialog') mode = afterDialog || 'play';
    redraw();
  }

  /* ---------- out cold / ending ---------- */
  function showOverlay() {
    const G = game.G;
    if (mode === 'over') {
      $('overTitle').textContent = game.fmt(LORE.outCold.title);
      $('overText').textContent = game.fmt(LORE.outCold.text);
      overlayEl.className = 'bl-overlay is-over';
    } else {
      $('overTitle').textContent = game.fmt(LORE.ending.title);
      $('overText').textContent = LORE.ending.lines.map(game.fmt).join(' ') + `  (${G.turns} turns)`;
      overlayEl.className = 'bl-overlay is-end';
    }
    overlayEl.hidden = false;
    updateHints();
    redraw();
  }

  /* ---------- item ring ---------- */
  function openRing() {
    const G = game.G;
    const items = [];
    for (const id of ['thwacker', 'hopstaff']) {
      if (G.items[id]) items.push({ id, kind: 'item', name: LORE.items[id].name, desc: LORE.items[id].desc, on: G.equip === id });
    }
    items.push({ id: 'reset', kind: 'act', name: 'Reset room', desc: 'Put this room back as it was when you came in.' });
    items.push({
      id: 'sound', kind: 'act',
      name: Sound.supported ? `Sound: ${Sound.on ? 'On' : 'Off'}` : 'Sound: n/a',
      desc: Sound.supported ? 'Small blips for steps, hits and pickups.' : 'Sound is not available here.',
    });
    items.push({ id: 'title', kind: 'act', name: 'Save & quit', desc: 'Back to the title screen. Your progress is kept.' });
    const cur = items.findIndex((x) => x.on);
    ring = { items, i: cur < 0 ? 0 : cur };
    mode = 'ring';
    redraw();
  }
  function useRing() {
    const it = ring.items[ring.i];
    if (!it) return;
    if (it.kind === 'item') { game.equip(it.id); Sound.play('lift'); mode = 'play'; }
    else if (it.id === 'reset') { mode = 'play'; game.resetRoom(); }
    else if (it.id === 'sound') {
      if (!Sound.supported) { Deck.toast('Sound is not available'); return; }
      Sound.toggle();
      const i = ring.i; openRing(); ring.i = i;
    } else if (it.id === 'title') { showTitle(); return; }
    redraw();
  }

  /* ---------- title screen ---------- */
  const hasSave = () => {
    const s = Deck.store.get(SAVE_KEY, null);
    return !!(s && s.entry);
  };
  function titleButtons() { return [...titleView.querySelectorAll('.focusable:not([disabled])')]; }
  function showTitle() {
    mode = 'title';
    confirmNew = false;
    dialogQueue = []; dialogEl.hidden = true; overlayEl.hidden = true;
    titleView.hidden = false;
    board.hidden = true;
    $('stats').hidden = true;
    $('equip').hidden = true;
    $('hudTitle').hidden = false;
    Deck.title(LORE.world, '');
    $('titleLore').textContent = (LORE.intro || []).map(game.fmt).join(' ');
    $('btnContinue').disabled = !hasSave();
    $('btnNew').querySelector('.key-label').textContent = 'New game';
    syncSoundButton();
    Draw.drawTitleArt($('titleArt'));
    Deck.focus(hasSave() ? $('btnContinue') : $('btnNew'));
    Deck.hints([['Swipe', 'move'], ['Pinch', 'select'], ['Back', 'hub']]);
  }
  function syncSoundButton() {
    $('btnSound').querySelector('.key-label').textContent = Sound.supported ? `Sound: ${Sound.on ? 'On' : 'Off'}` : 'Sound: n/a';
    $('btnSound').classList.toggle('key-speak', Sound.on);
  }
  function startPlay() {
    titleView.hidden = true;
    board.hidden = false;
    $('stats').hidden = false;
    $('equip').hidden = false;
    $('hudTitle').hidden = true;
    if (mode === 'title') mode = 'play';
    Guard.arm();
    redraw();
  }
  function titleSelect(btn) {
    Deck.press(btn);
    if (btn.id === 'btnNew') {
      if (hasSave() && !confirmNew) {
        confirmNew = true;
        btn.querySelector('.key-label').textContent = 'Pinch to overwrite';
        Deck.toast('This replaces your saved game');
        return;
      }
      mode = 'play';
      startPlay();
      game.newGame();
      redraw();
    } else if (btn.id === 'btnContinue') {
      mode = 'play';
      startPlay();
      if (!game.load(Deck.store.get(SAVE_KEY, null))) { Deck.toast('That save could not be read', { error: true }); showTitle(); return; }
      redraw();
    } else if (btn.id === 'btnSound') {
      if (!Sound.supported) { Deck.toast('Sound is not available'); return; }
      Sound.toggle();
      syncSoundButton();
    }
  }

  /* ---------- Back ----------
     On the glasses, Back is not a key: the system steps back through the
     page's history, and with no history left it leaves the app. So while you
     play, the game keeps one spare history entry (a "guard"). Back uses it
     up, the game opens the item ring (or closes what's open), and then puts
     a fresh guard back. Escape still works the same way on a computer.
     The glasses allow only five history entries; this uses one. */
  const Guard = {
    on: false,
    timer: null,
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
    if (mode === 'dialog') nextDialog(true);
    else if (mode === 'ring') { mode = 'play'; redraw(); }
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
  function onKey(e) {
    const a = Deck.action(e);
    if (!a) return;
    e.preventDefault();
    if (e.repeat && (a === 'select' || a === 'back')) return;
    if (a === 'back') { doBack(); return; }

    if (mode === 'title') {
      const cur = document.activeElement;
      const items = titleButtons();
      if (a === 'select') { if (items.includes(cur)) titleSelect(cur); else Deck.focus(items[0]); return; }
      if (!items.includes(cur)) { Deck.focus(items[0]); return; }
      if (cur.id === 'btnNew' && confirmNew) { confirmNew = false; cur.querySelector('.key-label').textContent = 'New game'; }
      const next = Deck.nearest(items, cur, a);
      if (next) Deck.focus(next); else Deck.bump(cur);
      return;
    }
    if (mode === 'dialog') {
      if (a === 'select') nextDialog(false);
      return;
    }
    if (mode === 'over') {
      if (a === 'select') { overlayEl.hidden = true; mode = 'play'; game.revive(); redraw(); }
      return;
    }
    if (mode === 'end') {
      if (a === 'select') showTitle();
      return;
    }
    if (mode === 'ring') {
      const n = ring.items.length;
      if (a === 'select') { useRing(); return; }
      ring.i = (ring.i + (a === 'right' || a === 'down' ? 1 : -1) + n) % n;
      redraw();
      return;
    }
    if (mode === 'play') {
      if (a === 'select') game.act('pinch');
      else game.act(a);
      if (mode === 'play' || mode === 'dialog') redraw();
    }
  }

  function init() {
    document.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPopState);
    // After a reload we may already be sitting on a guard entry
    Guard.on = !!(history.state && history.state.bamberland);
    titleView.addEventListener('click', (e) => { const b = e.target.closest('.focusable'); if (b && !b.disabled) titleSelect(b); });
    Deck.status('', '');
    // Redraw once the HUD font has arrived, so canvas text uses it
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (mode === 'title') Draw.drawTitleArt($('titleArt')); else redraw(); });
    showTitle();
  }
  init();
})();
