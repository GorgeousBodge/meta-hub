/* ==========================================================================
   Bamberland — foes: Bristlehog, Spindlewisp, Mimmet, embers, the boss.
   Each enemy type has a turn function in X.turn, run once per world turn.
   ctx.moved is the direction Bodge stepped, or undefined if he didn't.
   ========================================================================== */
BamberEngine.part((X) => {
  'use strict';
  const { DIRS, key, inB, SOLID_OBJ, on, LORE } = X;

  const HOG_SPEED = 3;                  // tiles per turn when charging
  const HOG_STUN = 5;                   // turns a hog stays dizzy after hitting a wall
  const WISP_RELOAD = 3;                // turns between embers
  const BOSS_COOL = [4, 4, 3];          // turns its core stays open, by hits taken
  const CRACK_TURNS = 6;                // how long slam cracks stay open
  const solid = (o) => SOLID_OBJ.includes(o || '-');

  /* ---------- being hit ---------- */
  X.strike = (e, dx, dy, knock) => {
    if (e.type === 'hog' && e.st !== 'stun') {
      on.toast(X.fmt(LORE.messages.clang)); on.sound('clang');
      return;
    }
    e.hp -= 1;
    e.flash = 1;
    on.sound('hit');
    on.fx('hit', { x: e.x, y: e.y });
    if (e.hp <= 0) { kill(e); return; }
    if (knock && e.type !== 'hog') {
      const tx = e.x + dx, ty = e.y + dy;
      if (inB(tx, ty) && X.isGap(tx, ty) && e.type !== 'wisp') { kill(e, true); return; }
      if (X.enemyCanStand(tx, ty, e) && !X.emberAt(tx, ty)) { e.x = tx; e.y = ty; }
    }
  };
  function kill(e, fell) {
    const R = X.R;
    R.enemies.splice(R.enemies.indexOf(e), 1);
    on.sound('defeat');
    on.fx('poof', { x: e.x, y: e.y });
    if (!fell) X.maybeDrop(e.x, e.y);
  }

  /* ---------- embers ---------- */
  X.moveEmbers = () => {
    const R = X.R;
    for (const em of R.embers.slice()) {
      const nx = em.x + em.dx, ny = em.y + em.dy;
      const gone = () => R.embers.splice(R.embers.indexOf(em), 1);
      if (!inB(nx, ny)) { gone(); continue; }
      if (X.isHero(nx, ny)) { gone(); X.hurt(1); continue; }
      const o = X.objAt(nx, ny), t = X.baseAt(nx, ny);
      if (o === 'b' || o === 'l') {
        R.obj[key(nx, ny)] = 'l'; R.burn[key(nx, ny)] = (X.def().burn || 10) + 1;
        on.sound('light'); gone(); continue;
      }
      if ('#DBS'.includes(t) || solid(o) || X.enemyAt(nx, ny) || X.bossAt(nx, ny)) { gone(); continue; }
      em.x = nx; em.y = ny;
    }
  };
  function spawnEmber(x, y, dx, dy) {
    const R = X.R;
    if (!inB(x, y)) return;
    if (X.isHero(x, y)) { X.hurt(1); return; }
    const t = X.baseAt(x, y), o = X.objAt(x, y);
    if ('#DBS'.includes(t) || solid(o) || X.enemyAt(x, y)) return;
    R.embers.push({ x, y, dx, dy });
  }

  /* ---------- Bristlehog: sees you in a line, charges, stuns on walls ---------- */
  function hogSees(e) {
    const G = X.G;
    if (e.x !== G.px && e.y !== G.py) return null;
    const dir = X.toward(e.x, e.y, G.px, G.py);
    const [dx, dy] = DIRS[dir];
    let x = e.x + dx, y = e.y + dy;
    while (!X.isHero(x, y)) {
      if (!X.floorish(x, y) || solid(X.objAt(x, y)) || X.enemyAt(x, y)) return null;
      x += dx; y += dy;
    }
    return dir;
  }
  X.turn.hog = (e) => {
    const G = X.G, R = X.R;
    if (e.st === 'stun') {
      e.t -= 1;
      if (e.t <= 0) e.st = 'idle';
      return;
    }
    if (e.st === 'idle') {
      const dir = hogSees(e);
      e.face = X.toward(e.x, e.y, G.px, G.py);
      if (dir) { e.st = 'alert'; e.dir = dir; e.face = dir; }
      return;
    }
    if (e.st === 'alert') e.st = 'charge';
    if (e.st === 'charge') {
      const [dx, dy] = DIRS[e.dir];
      for (let i = 0; i < HOG_SPEED; i++) {
        const nx = e.x + dx, ny = e.y + dy;
        if (X.isHero(nx, ny)) {
          X.hurt(2);
          if (X.heroCanStand(G.px + dx, G.py + dy)) { G.px += dx; G.py += dy; }
          e.st = 'idle';
          return;
        }
        if (!X.enemyCanStand(nx, ny, e)) {
          const soft = X.isGap(nx, ny) || X.enemyAt(nx, ny);
          if (soft) e.st = 'idle';
          else { e.st = 'stun'; e.t = HOG_STUN; on.sound('thud'); on.fx('hit', { x: nx, y: ny }); }
          return;
        }
        e.x = nx; e.y = ny;
        const em = X.emberAt(nx, ny);
        if (em) R.embers.splice(R.embers.indexOf(em), 1);
      }
    }
  };

  /* ---------- Spindlewisp: keeps 3–4 tiles away and spits embers ---------- */
  X.turn.wisp = (e) => {
    const G = X.G;
    e.charge = Math.min(WISP_RELOAD, e.charge + 1);
    const hero = { x: G.px, y: G.py };
    const aligned = e.x === G.px || e.y === G.py;
    if (e.charge >= WISP_RELOAD && aligned) {
      const dir = X.toward(e.x, e.y, G.px, G.py);
      const [dx, dy] = DIRS[dir];
      e.face = dir;
      spawnEmber(e.x + dx, e.y + dy, dx, dy);
      e.charge = 0;
      on.sound('spit');
      return;
    }
    const d = X.dist(e, hero);
    if (d >= 3 && d <= 4 && (aligned || G.turns % 2)) return;
    let best = null, bestScore = -Infinity;
    for (const dir of ['up', 'right', 'down', 'left']) {
      const [dx, dy] = DIRS[dir];
      const nx = e.x + dx, ny = e.y + dy;
      if (!X.enemyCanStand(nx, ny, e) || X.emberAt(nx, ny)) continue;
      const nd = X.dist({ x: nx, y: ny }, hero);
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
    e.face = X.toward(e.x, e.y, G.px, G.py);
  };

  /* ---------- Mimmet: mirrors Bodge left/right, copies up/down ---------- */
  X.turn.mimmet = (e, ctx) => {
    const R = X.R;
    if (!ctx.moved) return;
    const [dx, dy] = DIRS[ctx.moved];
    const mx = e.x - dx, my = e.y + dy;
    e.face = dx ? (dx > 0 ? 'left' : 'right') : ctx.moved;
    if (X.isHero(mx, my)) { X.hurt(1); on.fx('hit', { x: mx, y: my }); return; }
    if (X.enemyCanStand(mx, my, e)) {
      e.x = mx; e.y = my;
      const em = X.emberAt(mx, my);
      if (em) R.embers.splice(R.embers.indexOf(em), 1);
    }
  };

  /* ---------- the boss: mark, slam, vent, cool ---------- */
  function setMarks() {
    const G = X.G, R = X.R, b = R.boss;
    b.phase = 'mark';
    R.marks = [];
    for (const [dx, dy] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = G.px + dx, y = G.py + dy;
      if (X.floorish(x, y) && !X.bossAt(x, y) && !solid(X.objAt(x, y))) R.marks.push([x, y]);
    }
  }
  X.bossTurn = () => {
    const R = X.R, b = R.boss;
    switch (b.phase) {
      case 'wake':
        b.t -= 1;
        if (b.t <= 0) setMarks();
        break;
      case 'recoil':
        setMarks();
        break;
      case 'mark': {
        let hit = false;
        for (const [x, y] of R.marks) {
          if (X.isHero(x, y)) { hit = true; continue; }
          if (!X.objAt(x, y) && !X.enemyAt(x, y)) R.cracks[key(x, y)] = CRACK_TURNS + 1;
        }
        on.sound('slam');
        on.fx('shake');
        R.marks = [];
        b.phase = 'slam';
        if (hit) X.hurt(2);
        break;
      }
      case 'slam': {
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
  };
  X.strikeBoss = () => {
    const G = X.G, R = X.R, b = R.boss;
    if (b.phase !== 'cool') { on.toast(X.fmt(LORE.messages.hot)); on.sound('clang'); return; }
    b.hp -= 1; b.hits += 1; b.flash = 1;
    on.sound('boss'); on.fx('hit', { x: b.x, y: b.y });
    if (b.hp <= 0) { defeatBoss(); return; }
    // The blast throws Bodge back over the moat
    const [dx, dy] = DIRS[G.face];
    if (X.heroCanStand(G.px - 2 * dx, G.py - 2 * dy)) { G.px -= 2 * dx; G.py -= 2 * dy; }
    else if (X.heroCanStand(G.px - dx, G.py - dy)) { G.px -= dx; G.py -= dy; }
    b.phase = 'recoil'; b.t = 1;
  };
  function defeatBoss() {
    const R = X.R, b = R.boss;
    R.boss = null;
    R.embers = []; R.cracks = {}; R.marks = [];
    const f = X.F();
    f.bossDone = true;
    X.dropRewards(R, b.x, b.y, f);
    X.solve(true);
    on.sound('fanfare');
    on.dialog(X.pages(LORE.boss.defeat), X.cap(X.fmt(LORE.boss.name)));
  }
});
