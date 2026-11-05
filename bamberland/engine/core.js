/* ==========================================================================
   Bamberland — engine core: state, saves, rooms, Bodge's actions, turns.
   Plain logic with no page access, so it can be tested outside the browser.
   Foes live in engine/foes.js; talk, shops, Telkperson and the map in
   engine/town.js. Each of those adds itself with BamberEngine.part(fn).
   ========================================================================== */
(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const Engine = root.BamberEngine = root.BamberEngine || {};
  Engine.parts = Engine.parts || [];
  Engine.part = (fn) => Engine.parts.push(fn);

  const W = 15, H = 12;
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const EDGE = { up: 'n', down: 's', left: 'w', right: 'e' };
  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const TERRAIN = '#.~_DBS';
  const OBJECTS = 'OPC=NbLKHX$';
  const ENEMY_CHARS = { h: 'hog', w: 'wisp', m: 'mimmet' };
  const SOLID_OBJ = 'OPCc=NblL';
  const TALL_OBJ = 'Cc=NblL';           // can't be vaulted over
  const WALK = '._ds';                  // floor, plate, open door, open shutter
  const FIELD_SOLID = 'T*f~%';          // outdoor: tree, bush, fence, water, brambles
  const KEEP_TAKEN = 'KX$';             // pickups that stay gone once taken

  // Tuning
  const ENEMY_HP = { hog: 2, wisp: 1, mimmet: 2 };
  const BOSS_HP = 3;
  const START_HEARTS = 6;               // in halves: 6 = three hearts
  const DROP_EVERY = 2;                 // every 2nd pot or foe drops something
  const POCKET = 5;                     // {coins} in a $ on the map
  const SAVE_VERSION = 2;

  const key = (x, y) => x + ',' + y;
  const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* A save from an older version is upgraded here, one version at a time.
     Return { save } when it can be used, or { error } when it can't. */
  function migrate(s) {
    if (!s || typeof s !== 'object') return { error: 'empty' };
    if (s.v === 1) return { error: 'old' };          // the Mill prototype: different world
    // if (s.v === 2) s = twoToThree(s);              // future upgrades go here
    if (s.v === SAVE_VERSION) return { save: s };
    if (s.v > SAVE_VERSION) return { error: 'newer' };
    return { error: 'unknown' };
  }

  function create(data, hooks = {}) {
    const WORLD = data.world;
    const LORE = data.lore;
    const on = {
      toast() {}, dialog() {}, sound() {}, fx() {}, save() {},
      enter() {}, win() {}, over() {}, change() {}, cut() {}, music() {},
      shop() {}, telk() {},
      ...hooks,
    };

    let G = null;   // what is saved
    let R = null;   // the current room as it is right now

    // Shared with the parts (foes.js, town.js)
    const X = {
      W, H, DIRS, EDGE, OPPOSITE, SOLID_OBJ, WORLD, LORE, on, key, inB, clone,
      ENEMY_HP, BOSS_HP,
      turn: {},            // enemy type -> its turn function
      enterHooks: [],      // run after Bodge walks into a room
      get G() { return G; },
      get R() { return R; },
    };

    /* ---------- text ---------- */
    function nameOf(id) {
      if (G && G.names && G.names[id]) return G.names[id];
      if (id === 'hero') return LORE.hero.name;
      const p = LORE.people && LORE.people[id];
      return p ? p.name : id;
    }
    function words() {
      const w = {
        hero: nameOf('hero'), world: LORE.world,
        dungeon: (R && def() && def().dungeon) || LORE.dungeon,
        weapon: LORE.items.thwacker.name, item: LORE.items.hopstaff.name,
        boss: LORE.boss.name, coin: LORE.money.one, coins: LORE.money.many,
      };
      for (const [id, e] of Object.entries(LORE.enemies || {})) w[id] = e.name;
      for (const id of Object.keys(LORE.people || {})) w[id] = nameOf(id);
      return w;
    }
    const fmt = (s, extra) => {
      const w = extra ? { ...words(), ...extra } : words();
      return String(s == null ? '' : s).replace(/\{(\w+)\}/g, (m, n) => (n in w ? w[n] : m));
    };
    const pages = (x, extra) => (Array.isArray(x) ? x : [x]).map((s) => fmt(s, extra));
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    /* ---------- state ---------- */
    function fresh() {
      return {
        v: SAVE_VERSION,
        names: {},
        room: WORLD.start, px: 7, py: 9, face: 'up',
        hearts: START_HEARTS, maxHearts: START_HEARTS,
        keys: 0, bigKey: false,
        coins: 0, bag: {}, shield: 0, warm: 0,
        items: { thwacker: true, hopstaff: false },
        equip: 'thwacker',
        carry: false,
        flags: {},          // per room: doors opened, chests, pickups, solved
        story: {},          // story flags: 'brambles', 'sun_mill'…
        seen: {},           // rooms visited (for the map)
        telk: {},           // Telkperson events done
        hint: '',
        entry: null,
        turns: 0, drops: 0,
        over: false, won: false,
      };
    }
    function flags(id) {
      if (!G.flags[id]) G.flags[id] = { opened: {}, chests: {}, taken: {}, solved: false, bossDone: false, seen: false };
      return G.flags[id];
    }
    const def = () => (R ? WORLD.rooms[R.id] : null);
    const F = () => flags(R.id);

    /* ---------- building a room from its map ---------- */
    function build(id) {
      const d = WORLD.rooms[id];
      if (!d) throw new Error('No room called ' + id);
      const f = flags(id);
      const field = d.kind === 'field';
      const thornsOpen = field && d.thorns && G.story[d.thorns];
      const room = {
        id, field, base: [], look: field ? [] : null, obj: {}, enemies: [], embers: [], boss: null,
        plates: [], burn: {}, cracks: {}, marks: [], people: {}, visitor: null,
        chestAt: {}, signAt: {}, talkAt: {}, start: null, bossTiles: [], buildings: d.buildings || [],
      };
      let ci = 0, si = 0, ti = 0, eid = 0;
      for (let y = 0; y < H; y++) {
        const row = (d.map && d.map[y]) || '';
        room.base[y] = [];
        if (field) room.look[y] = [];
        for (let x = 0; x < W; x++) {
          const ch = row[x] == null ? (field ? 'T' : '#') : row[x];
          let t = '.', look = '.';
          if (field && FIELD_SOLID.includes(ch)) {
            if (ch === '%' && thornsOpen) { t = '.'; look = '.'; } else { t = '#'; look = ch; }
          } else if (field && ':,'.includes(ch)) look = ch;
          else if (!field && TERRAIN.includes(ch)) t = ch;
          else if (OBJECTS.includes(ch)) room.obj[key(x, y)] = ch;
          else if (ENEMY_CHARS[ch]) room.enemies.push(newEnemy(ENEMY_CHARS[ch], x, y, eid++));
          else if (ch === 'Z') room.bossTiles.push([x, y]);
          else if (ch === '@') room.start = { x, y };
          if (ch === 'C') room.chestAt[key(x, y)] = ci++;
          if (ch === '=') room.signAt[key(x, y)] = si++;
          if (ch === 'N') {
            const entry = (d.talk || [])[ti];
            room.talkAt[key(x, y)] = ti++;
            room.people[key(x, y)] = { who: entry ? entry.who : 'folk', face: (entry && entry.face) || 'down' };
          }
          if (t === '_') room.plates.push([x, y]);
          room.base[y][x] = t;
          if (field) room.look[y][x] = look;
        }
      }
      // Buildings are solid
      for (const b of room.buildings) {
        const cells = b.solid || [[b.x, b.y], [b.x + 1, b.y], [b.x, b.y + 1], [b.x + 1, b.y + 1]];
        for (const [x, y] of cells) if (inB(x, y)) room.base[y][x] = '#';
      }
      // Remembered changes
      for (const k of Object.keys(f.opened)) {
        const [x, y] = k.split(',').map(Number);
        if (inB(x, y) && 'DB'.includes(room.base[y][x])) room.base[y][x] = 'd';
      }
      for (const k of Object.keys(f.chests)) if (room.obj[k] === 'C') room.obj[k] = 'c';
      for (const k of Object.keys(f.taken)) if (KEEP_TAKEN.includes(room.obj[k] || '-')) delete room.obj[k];
      if (f.solved) {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (room.base[y][x] === 'S') room.base[y][x] = 's';
        for (const k of Object.keys(room.obj)) if (room.obj[k] === 'b') room.obj[k] = 'L';
        if (d.solve === 'enemies') room.enemies = [];
      }
      // Boss
      if (room.bossTiles.length) {
        const xs = room.bossTiles.map((t) => t[0]), ys = room.bossTiles.map((t) => t[1]);
        const bx = Math.min(...xs), by = Math.min(...ys);
        if (f.bossDone) dropRewards(room, bx, by, f);
        else room.boss = { x: bx, y: by, hp: BOSS_HP, hits: 0, phase: 'wake', t: 2, flash: 0 };
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
    // A story flag changed: brambles on this screen may need clearing
    function refreshThorns() {
      const d = def();
      if (!R.field || !d.thorns || !G.story[d.thorns]) return;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (R.look[y][x] === '%') { R.look[y][x] = '.'; R.base[y][x] = '.'; }
      }
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
    Object.assign(X, {
      fmt, pages, cap, nameOf, def, F, flags, refreshThorns,
      baseAt, objAt, cracked, isGap, enemyAt, emberAt, bossAt, isHero,
      floorish, heroCanStand, enemyCanStand, front, dist, toward,
    });

    /* ---------- saving ---------- */
    function snapshotSave() {
      const s = clone(G);
      s.carry = false;
      return s;
    }
    function save() { if (G && !G.over) on.save(snapshotSave()); }
    X.save = save;

    /* ---------- entering rooms ---------- */
    function musicFor(id) {
      const d = WORLD.rooms[id];
      if (d.music) return d.music;
      if (d.kind === 'field') return (WORLD.regions[d.region] || {}).music || null;
      return 'dungeon';
    }
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
      const first = !G.seen[id];
      G.seen[id] = 1;
      save();
      on.music(musicFor(id));
      on.enter(def().name || id, quiet);
      const f = F();
      if (first && def().cut) on.cut(def().cut);
      if (R.boss && !f.seen) {
        f.seen = true;
        on.dialog(pages(LORE.boss.intro), cap(fmt(LORE.boss.name)));
      }
      if (!quiet) for (const h of X.enterHooks) h(id);
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
    X.nearestStand = nearestStand;
    function exitTo(dir) {
      const exits = def().exits || {};
      const target = exits[EDGE[dir]];
      if (!target || !WORLD.rooms[target]) return false;
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
      if (G.shield > 0) {
        G.shield -= 1;
        on.toast(fmt(LORE.messages.bubble));
        on.sound('pop');
        return;
      }
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
    // Every DROP_EVERY-th pot or foe leaves a heart (or a coin, if hearts are full)
    function maybeDrop(x, y) {
      G.drops += 1;
      if (G.drops % DROP_EVERY !== 0) return;
      if (floorish(x, y) && !objAt(x, y) && !isHero(x, y)) R.obj[key(x, y)] = G.hearts < G.maxHearts ? 'H' : 'Y';
    }
    Object.assign(X, { hurt, heal, maybeDrop });

    /* ---------- the hero's actions ---------- */
    // Each returns true if something changed (redraw), and calls world() if a turn passed.
    function act(a) {
      if (!G || !R || G.over || G.won) return false;
      R.visitor = null;
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
      G.step = (G.step || 0) + 1;
      on.sound('step');
      stepOn();
      world({ moved: dir });
      return true;
    }

    function explainBlock(x, y) {
      const t = baseAt(x, y), M = LORE.messages;
      if (R.field && R.look[y][x] === '%') on.toast(fmt(M.thorns));
      else if (t === 'D') on.toast(fmt(G.keys > 0 ? M.unlock : M.locked));
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
      } else if (o === '$' || o === 'Y') {
        const n = o === '$' ? POCKET : 1;
        delete R.obj[k]; G.coins += n;
        if (o === '$') { F().taken[k] = 1; save(); }
        on.sound('coin'); on.toast(`+${n} ${n === 1 ? LORE.money.one : LORE.money.many}`);
      } else if (o === 'X') {
        delete R.obj[k]; F().taken[k] = 1; G.maxHearts += 2; G.hearts = G.maxHearts;
        on.sound('fanfare'); on.dialog(pages(P.container.found)); save();
      } else if (o === 'Q') {
        delete R.obj[k]; F().taken[k] = 1;
        give('sunstone');
      }
    }

    function pinch() {
      if (G.carry) return throwPot();
      const [fx, fy] = front();
      if (inB(fx, fy)) {
        const k = key(fx, fy), o = objAt(fx, fy), t = baseAt(fx, fy);
        const d = def();
        if (o === 'N') return X.talk(fx, fy);
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

    // Give Bodge something. quiet: a toast instead of a dialogue page.
    function give(item, { quiet = false } = {}) {
      const P = LORE.pickups;
      let text = '';
      const [kind, amount] = String(item).split(':');
      if (kind === 'coins') {
        const n = Number(amount) || 1;
        G.coins += n; text = fmt(P.coins.found, { n });
      } else if (kind === 'key') { G.keys += 1; text = P.key.found; }
      else if (kind === 'bigkey') { G.bigKey = true; text = P.bigkey.found; }
      else if (kind === 'heart') { G.hearts = G.maxHearts; text = P.heart.found; }
      else if (kind === 'container') { G.maxHearts += 2; G.hearts = G.maxHearts; text = P.container.found; }
      else if (kind === 'sunstone') {
        const region = WORLD.regions[def().region] || {};
        if (region.sun) G.story[region.sun] = 1;
        G.maxHearts += 2; G.hearts = G.maxHearts;
        on.sound('fanfare');
        save();
        on.cut('sunstone');
        on.dialog(pages(P.sunstone.found), fmt(P.sunstone.name));
        return;
      } else if (kind === 'ending') {
        G.won = true; save(); on.win(); return;
      } else if (LORE.elixirs[kind]) {
        G.bag[kind] = Math.min(LORE.bagMax, (G.bag[kind] || 0) + 1);
        text = fmt(LORE.messages.bought, { name: LORE.elixirs[kind].name });
      } else if (LORE.items[kind]) {
        G.items[kind] = true; text = LORE.items[kind].found || LORE.items[kind].name;
      }
      on.sound(kind === 'coins' ? 'coin' : 'fanfare');
      save();
      if (!text) return;
      if (quiet) on.toast(fmt(Array.isArray(text) ? text[0] : text));
      else on.dialog(pages(text));
    }
    X.give = give;

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
      else if (e) X.strike(e, dx, dy, true);
      else if (bossAt(fx, fy)) X.strikeBoss();
      else on.sound('swish');
      world({});
      return true;
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
        if (e) { X.strike(e, dx, dy, false); landed = [tx, ty]; break; }
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
      if (G.warm > 0) G.warm -= 1;
      for (const e of R.enemies) e.flash = 0;
      if (R.boss) R.boss.flash = 0;
      X.moveEmbers();
      for (const e of R.enemies.slice()) {
        if (G.over) break;
        if (!R.enemies.includes(e)) continue;
        if (X.turn[e.type]) X.turn[e.type](e, ctx);
      }
      if (R.boss && !G.over) X.bossTurn();
      tickBurn();
      tickCracks();
      checkSolve();
      on.change();
    }
    X.world = world;

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
    X.solve = solve;
    X.dropRewards = dropRewards;

    /* ---------- public ---------- */
    function newGame(names) {
      G = fresh();
      G.names = { ...(names || {}) };
      R = build(WORLD.start);
      const s = R.start || { x: 7, y: 9 };
      on.cut('opening');
      enterRoom(WORLD.start, s.x, s.y, 'up', { quiet: true });
      if (LORE.opening && LORE.opening.length) on.dialog(pages(LORE.opening));
      return true;
    }
    function load(saved) {
      const m = migrate(saved);
      if (m.error) return { ok: false, error: m.error };
      const s = m.save;
      if (!s.entry || !WORLD.rooms[s.entry.room]) return { ok: false, error: 'room' };
      G = { ...fresh(), ...clone(s), over: false, carry: false };
      G.hearts = Math.max(1, G.hearts);
      const e = G.entry;
      enterRoom(e.room, e.x, e.y, e.face, { quiet: true });
      return { ok: true };
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

    // What the outdoor screens look like now: restored or in the gloom
    function tone(id) {
      const d = WORLD.rooms[id || (R && R.id)];
      if (!d) return 'day';
      const region = WORLD.regions[d.region] || {};
      return region.sun && !(G && G.story[region.sun]) ? 'gloom' : 'day';
    }

    X.api = {
      get G() { return G; },
      get R() { return R; },
      W, H, DIRS, SAVE_VERSION,
      fmt, pages, nameOf, tone, migrate,
      newGame, load, resetRoom, revive, equip, act, pinchVerb,
      snapshot() { return clone({ G, R }); },
      restore(s) { G = clone(s.G); R = clone(s.R); },
      roomName: () => (R ? WORLD.rooms[R.id].name : ''),
      regionName: () => (R ? (WORLD.regions[def().region] || {}).name || '' : ''),
      // used by render.js and the tests
      query: { baseAt, objAt, cracked, isGap, enemyAt, bossAt, heroCanStand, floorish },
      internal: X,
    };
    for (const p of Engine.parts) p(X);
    return X.api;
  }

  Engine.create = create;
  Engine.W = W; Engine.H = H;
  Engine.migrate = migrate;
  Engine.SAVE_VERSION = SAVE_VERSION;
})();
