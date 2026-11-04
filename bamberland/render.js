/* ==========================================================================
   Bamberland — drawing. Vector line art on a canvas, redrawn once per turn.
   Black is see-through on the glasses, so everything is drawn with light:
   glowing strokes and faint fills. Cyan = structure, amber = treasure and
   danger, red = damage, white = Bodge.
   ========================================================================== */
(() => {
  'use strict';

  const T = 40;                 // tile size
  const W = 15, H = 12;
  const OX = 0, OY = 12;        // the 600×480 grid sits centred in the 600×504 stage
  const C = {
    cyan: '#3fe0ff', cyanDim: 'rgba(63,224,255,0.38)', cyanFaint: 'rgba(63,224,255,0.07)',
    amber: '#ffc24a', amberDim: 'rgba(255,194,74,0.45)', amberFaint: 'rgba(255,194,74,0.12)',
    red: '#ff5c7a', redFaint: 'rgba(255,92,122,0.18)',
    white: '#f4fbff', dim: '#a9c2cf', green: '#59f2a5',
  };
  const FONT = '"Chakra Petch", "Segoe UI", system-ui, sans-serif';

  /* ---------- canvas setup ---------- */
  function prep(canvas, w, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.lineCap = 'round'; g.lineJoin = 'round';
    return g;
  }
  const px = (x) => OX + x * T;
  const py = (y) => OY + y * T;
  function glow(g, color, blur) { g.shadowColor = color; g.shadowBlur = blur; }
  function noGlow(g) { g.shadowBlur = 0; }
  function stroke(g, color, width, blur = 6) { g.strokeStyle = color; g.lineWidth = width; glow(g, color, blur); }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }

  /* ---------- the room ---------- */
  function draw(canvas, game, ui) {
    const g = prep(canvas, 600, 504);
    const { G, R, query: q } = game;
    if (!G || !R) return;
    const shake = ui.fx.some((f) => f.type === 'shake');
    if (shake) g.translate(2, 1);

    drawWalls(g, R);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) drawTile(g, R, q, x, y);

    // Boss warnings under everything that moves
    for (const [x, y] of R.marks || []) drawMark(g, x, y);
    for (const [k, o] of Object.entries(R.obj)) {
      const [x, y] = k.split(',').map(Number);
      drawObject(g, o, x, y, R);
    }
    for (const e of R.enemies) drawEnemy(g, e, G);
    if (R.boss) drawBoss(g, R.boss);
    for (const em of R.embers) drawEmber(g, em);
    drawBodge(g, px(G.px) + T / 2, py(G.py) + T / 2, G.face, { carry: G.carry, item: G.equip, hurt: ui.fx.some((f) => f.type === 'hurt') });
    for (const f of ui.fx) drawFx(g, f, G);
    if (shake) g.setTransform(Math.min(2, window.devicePixelRatio || 1), 0, 0, Math.min(2, window.devicePixelRatio || 1), 0, 0);
    if (ui.banner) drawBanner(g, ui.banner);
    if (ui.ring) drawRing(g, ui.ring, ui.lore);
  }

  function drawWalls(g, R) {
    const wall = (x, y) => x < 0 || y < 0 || x >= W || y >= H || R.base[y][x] === '#';
    // faint fill
    g.fillStyle = C.cyanFaint;
    noGlow(g);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (wall(x, y)) g.fillRect(px(x), py(y), T, T);
    // bright edges where wall meets floor, with a brick course inside
    stroke(g, C.cyan, 2, 8);
    g.beginPath();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!wall(x, y)) continue;
      const X = px(x), Y = py(y);
      if (!wall(x, y - 1)) { g.moveTo(X, Y); g.lineTo(X + T, Y); }
      if (!wall(x, y + 1)) { g.moveTo(X, Y + T); g.lineTo(X + T, Y + T); }
      if (!wall(x - 1, y)) { g.moveTo(X, Y); g.lineTo(X, Y + T); }
      if (!wall(x + 1, y)) { g.moveTo(X + T, Y); g.lineTo(X + T, Y + T); }
    }
    g.stroke();
    stroke(g, C.cyanDim, 1, 0);
    g.beginPath();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!wall(x, y)) continue;
      const near = !wall(x, y - 1) || !wall(x, y + 1) || !wall(x - 1, y) || !wall(x + 1, y);
      if (!near) continue;
      const X = px(x), Y = py(y), off = (y % 2) * 20;
      g.moveTo(X + 4, Y + 20); g.lineTo(X + 36, Y + 20);
      g.moveTo(X + 10 + off / 2, Y + 6); g.lineTo(X + 10 + off / 2, Y + 18);
      g.moveTo(X + 30 - off / 2, Y + 22); g.lineTo(X + 30 - off / 2, Y + 34);
    }
    g.stroke();
  }

  function drawTile(g, R, q, x, y) {
    const t = R.base[y][x], X = px(x), Y = py(y);
    const cracked = R.cracks && R.cracks[x + ',' + y];
    if (t === '#') return;
    if (t === '~' || cracked) { drawGap(g, X, Y, !!cracked); return; }
    // floor: a small cross at the tile centre
    stroke(g, 'rgba(63,224,255,0.16)', 1, 0);
    g.beginPath();
    g.moveTo(X + 18, Y + 20); g.lineTo(X + 22, Y + 20);
    g.moveTo(X + 20, Y + 18); g.lineTo(X + 20, Y + 22);
    g.stroke();
    if (t === '_') {
      const pressed = R.obj[x + ',' + y] === 'O' || R.enemies.some((e) => e.x === x && e.y === y && e.type === 'mimmet');
      stroke(g, C.cyan, 2, pressed ? 12 : 4);
      rr(g, X + 7, Y + 7, 26, 26, 4); g.stroke();
      if (pressed) { g.fillStyle = 'rgba(63,224,255,0.28)'; g.fill(); }
      rr(g, X + 13, Y + 13, 14, 14, 2); g.stroke();
    } else if (t === 'D') drawDoor(g, X, Y, false);
    else if (t === 'B') drawDoor(g, X, Y, true);
    else if (t === 'S') drawShutter(g, X, Y, false);
    else if (t === 's') drawShutter(g, X, Y, true);
    else if (t === 'd') drawOpenDoor(g, X, Y);
  }

  function drawGap(g, X, Y, cracked) {
    noGlow(g);
    g.fillStyle = cracked ? 'rgba(255,92,122,0.08)' : 'rgba(255,194,74,0.05)';
    g.fillRect(X + 3, Y + 3, T - 6, T - 6);
    stroke(g, cracked ? 'rgba(255,92,122,0.7)' : C.amberDim, 1.5, 0);
    g.setLineDash([4, 4]);
    g.strokeRect(X + 4, Y + 4, T - 8, T - 8);
    g.setLineDash([]);
    g.beginPath();
    if (cracked) { g.moveTo(X + 8, Y + 12); g.lineTo(X + 18, Y + 20); g.lineTo(X + 14, Y + 28); g.lineTo(X + 30, Y + 32); }
    else { g.moveTo(X + 10, Y + 30); g.lineTo(X + 30, Y + 10); g.moveTo(X + 10, Y + 20); g.lineTo(X + 20, Y + 10); g.moveTo(X + 20, Y + 30); g.lineTo(X + 30, Y + 20); }
    g.stroke();
  }

  function drawDoor(g, X, Y, big) {
    stroke(g, C.cyan, 2, 6);
    rr(g, X + 4, Y + 4, 32, 32, 3); g.stroke();
    g.beginPath(); g.moveTo(X + 20, Y + 4); g.lineTo(X + 20, Y + 36); g.stroke();
    stroke(g, C.amber, 2, 10);
    if (big) {
      g.beginPath(); g.arc(X + 20, Y + 20, 9, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(X + 20, Y + 18, 2.5, 0, Math.PI * 2); g.moveTo(X + 20, Y + 20); g.lineTo(X + 20, Y + 25); g.stroke();
    } else {
      g.beginPath(); g.arc(X + 20, Y + 17, 3.5, 0, Math.PI * 2); g.moveTo(X + 20, Y + 21); g.lineTo(X + 20, Y + 27); g.stroke();
    }
  }
  function drawOpenDoor(g, X, Y) {
    stroke(g, C.cyanDim, 1.5, 0);
    g.beginPath(); g.moveTo(X + 4, Y + 4); g.lineTo(X + 4, Y + 36); g.moveTo(X + 36, Y + 4); g.lineTo(X + 36, Y + 36); g.stroke();
  }
  function drawShutter(g, X, Y, open) {
    if (open) { drawOpenDoor(g, X, Y); return; }
    stroke(g, C.cyan, 2, 6);
    g.beginPath();
    g.moveTo(X + 3, Y + 5); g.lineTo(X + 37, Y + 5);
    for (const bx of [10, 20, 30]) { g.moveTo(X + bx, Y + 5); g.lineTo(X + bx, Y + 35); }
    g.moveTo(X + 3, Y + 35); g.lineTo(X + 37, Y + 35);
    g.stroke();
  }

  /* ---------- objects ---------- */
  function drawObject(g, o, x, y, R) {
    const X = px(x), Y = py(y), cx = X + 20, cy = Y + 20;
    switch (o) {
      case 'O': // push block
        stroke(g, C.cyan, 2, 8);
        rr(g, X + 5, Y + 5, 30, 30, 3); g.stroke();
        g.fillStyle = 'rgba(63,224,255,0.10)'; g.fill();
        stroke(g, C.cyanDim, 1.5, 0);
        g.beginPath(); g.moveTo(X + 10, Y + 10); g.lineTo(X + 30, Y + 30); g.moveTo(X + 30, Y + 10); g.lineTo(X + 10, Y + 30); g.stroke();
        break;
      case 'P': drawPot(g, cx, cy); break;
      case 'C': case 'c': {
        const open = o === 'c';
        stroke(g, open ? C.amberDim : C.amber, 2, open ? 0 : 10);
        rr(g, X + 6, Y + 16, 28, 18, 3); g.stroke();
        g.beginPath();
        if (open) { g.moveTo(X + 6, Y + 16); g.lineTo(X + 10, Y + 6); g.lineTo(X + 30, Y + 6); g.lineTo(X + 34, Y + 16); }
        else { g.moveTo(X + 6, Y + 16); g.quadraticCurveTo(X + 20, Y + 4, X + 34, Y + 16); g.moveTo(X + 20, Y + 21); g.lineTo(X + 20, Y + 27); }
        g.stroke();
        if (!open) { g.fillStyle = C.amberFaint; rr(g, X + 6, Y + 16, 28, 18, 3); g.fill(); }
        break;
      }
      case '=': // sign
        stroke(g, C.cyan, 2, 6);
        rr(g, X + 6, Y + 8, 28, 18, 2); g.stroke();
        g.beginPath(); g.moveTo(cx, Y + 26); g.lineTo(cx, Y + 36);
        g.moveTo(X + 11, Y + 14); g.lineTo(X + 29, Y + 14); g.moveTo(X + 11, Y + 20); g.lineTo(X + 24, Y + 20); g.stroke();
        break;
      case 'N': drawNettle(g, cx, cy); break;
      case 'b': case 'l': case 'L': drawBrazier(g, cx, cy, o, R.burn && R.burn[x + ',' + y]); break;
      case 'K': drawKey(g, cx, cy); break;
      case 'H': drawHeart(g, cx, cy, 9, C.red); break;
      case 'X':
        drawHeart(g, cx, cy, 11, C.red);
        stroke(g, C.amber, 1.5, 8);
        g.beginPath(); g.arc(cx, cy, 16, 0, Math.PI * 2); g.stroke();
        break;
      case 'Q': drawCog(g, cx, cy, 13, C.amber); break;
      default: break;
    }
  }

  function drawPot(g, cx, cy) {
    stroke(g, C.cyan, 2, 6);
    g.beginPath();
    g.moveTo(cx - 6, cy - 11); g.lineTo(cx + 6, cy - 11);
    g.moveTo(cx - 5, cy - 11); g.quadraticCurveTo(cx - 14, cy - 2, cx - 9, cy + 10);
    g.lineTo(cx + 9, cy + 10); g.quadraticCurveTo(cx + 14, cy - 2, cx + 5, cy - 11);
    g.stroke();
    stroke(g, C.cyanDim, 1.5, 0);
    g.beginPath(); g.moveTo(cx - 10, cy + 1); g.lineTo(cx + 10, cy + 1); g.stroke();
  }
  function drawKey(g, cx, cy) {
    stroke(g, C.amber, 2.5, 10);
    g.beginPath(); g.arc(cx - 7, cy, 5, 0, Math.PI * 2);
    g.moveTo(cx - 2, cy); g.lineTo(cx + 12, cy); g.moveTo(cx + 7, cy); g.lineTo(cx + 7, cy + 5); g.moveTo(cx + 11, cy); g.lineTo(cx + 11, cy + 4);
    g.stroke();
  }
  function heartPath(g, cx, cy, s) {
    g.beginPath();
    g.moveTo(cx, cy + s);
    g.bezierCurveTo(cx - s * 1.6, cy - s * 0.1, cx - s * 0.9, cy - s * 1.3, cx, cy - s * 0.45);
    g.bezierCurveTo(cx + s * 0.9, cy - s * 1.3, cx + s * 1.6, cy - s * 0.1, cx, cy + s);
  }
  function drawHeart(g, cx, cy, s, color) {
    stroke(g, color, 2, 10);
    heartPath(g, cx, cy, s); g.stroke();
    g.fillStyle = 'rgba(255,92,122,0.30)'; g.fill();
  }
  function drawCog(g, cx, cy, r, color) {
    stroke(g, color, 2, 12);
    g.beginPath();
    const teeth = 8;
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2, rr2 = i % 2 ? r * 0.72 : r;
      const a2 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
      g.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2);
      g.lineTo(cx + Math.cos(a2) * rr2, cy + Math.sin(a2) * rr2);
    }
    g.closePath(); g.stroke();
    g.beginPath(); g.arc(cx, cy, r * 0.3, 0, Math.PI * 2); g.stroke();
  }
  function drawBrazier(g, cx, cy, o, burn) {
    stroke(g, C.cyan, 2, 6);
    g.beginPath();
    g.moveTo(cx - 12, cy); g.lineTo(cx + 12, cy); g.lineTo(cx + 7, cy + 8); g.lineTo(cx - 7, cy + 8); g.closePath();
    g.moveTo(cx - 4, cy + 8); g.lineTo(cx - 7, cy + 16); g.moveTo(cx + 4, cy + 8); g.lineTo(cx + 7, cy + 16);
    g.stroke();
    if (o === 'b') return;
    stroke(g, C.amber, 2, 14);
    g.beginPath();
    g.moveTo(cx - 7, cy - 1);
    g.quadraticCurveTo(cx - 9, cy - 10, cx - 2, cy - 17);
    g.quadraticCurveTo(cx - 1, cy - 10, cx + 2, cy - 9);
    g.quadraticCurveTo(cx + 4, cy - 14, cx + 3, cy - 19);
    g.quadraticCurveTo(cx + 11, cy - 9, cx + 7, cy - 1);
    g.stroke();
    g.fillStyle = 'rgba(255,194,74,0.22)'; g.fill();
    if (o === 'l' && burn) {
      // Turns left before it goes out: a row of small pips
      noGlow(g);
      g.fillStyle = C.amber;
      const n = Math.max(0, burn - 1);
      for (let i = 0; i < n; i++) g.fillRect(cx - 17 + (i % 12) * 3, cy + 18, 2, 2);
    }
  }
  function drawNettle(g, cx, cy) {
    // the sluice keeper: a tall hood and a hanging lantern
    stroke(g, C.green, 2, 8);
    g.beginPath();
    g.moveTo(cx - 2, cy - 17); g.lineTo(cx - 11, cy + 14); g.lineTo(cx + 9, cy + 14); g.closePath();
    g.stroke();
    g.beginPath(); g.arc(cx - 1, cy - 2, 4, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(cx + 7, cy + 2); g.lineTo(cx + 14, cy - 2); g.lineTo(cx + 14, cy + 4); g.stroke();
    stroke(g, C.amber, 2, 10);
    rr(g, cx + 11, cy + 4, 6, 7, 2); g.stroke();
  }

  /* ---------- Bodge ---------- */
  // Round body, a tall pointed cap that leans the way he faces, and a bright
  // visor dot plus a chevron on the facing side. Readable at 40 px.
  function drawBodge(g, cx, cy, face, opts = {}) {
    const dir = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[face] || [0, 1];
    const [dx, dy] = dir;
    const body = opts.hurt ? C.red : C.white;
    // feet
    stroke(g, body, 2, 6);
    g.beginPath();
    g.moveTo(cx - 6, cy + 10); g.lineTo(cx - 7, cy + 15);
    g.moveTo(cx + 6, cy + 10); g.lineTo(cx + 7, cy + 15);
    g.stroke();
    // body
    g.beginPath(); g.arc(cx, cy + 2, 10, 0, Math.PI * 2); g.stroke();
    g.fillStyle = opts.hurt ? 'rgba(255,92,122,0.25)' : 'rgba(244,251,255,0.10)'; g.fill();
    // cap: brim plus a point that leans with the facing
    const tipX = cx + dx * 7, tipY = cy - 19 + (dy > 0 ? 2 : 0);
    g.beginPath();
    g.moveTo(cx - 11, cy - 6); g.lineTo(cx + 11, cy - 6);
    g.moveTo(cx - 8, cy - 6); g.lineTo(tipX, tipY); g.lineTo(cx + 8, cy - 6);
    g.stroke();
    // visor dot (hidden when facing away)
    if (face !== 'up') {
      stroke(g, C.cyan, 2, 12);
      g.fillStyle = C.cyan;
      g.beginPath(); g.arc(cx + dx * 5, cy + 1 + (dy > 0 ? 1 : 0), 2.6, 0, Math.PI * 2); g.fill();
    } else {
      // pack straps when seen from behind
      stroke(g, C.cyanDim, 1.5, 0);
      g.beginPath(); g.moveTo(cx - 5, cy - 4); g.lineTo(cx - 5, cy + 9); g.moveTo(cx + 5, cy - 4); g.lineTo(cx + 5, cy + 9); g.stroke();
    }
    // facing chevron just outside the body
    stroke(g, C.cyan, 2.5, 10);
    const fx = cx + dx * 17, fy = cy + 2 + dy * 17;
    g.beginPath();
    if (dx) { g.moveTo(fx - dx * 4, fy - 5); g.lineTo(fx, fy); g.lineTo(fx - dx * 4, fy + 5); }
    else { g.moveTo(fx - 5, fy - dy * 4); g.lineTo(fx, fy); g.lineTo(fx + 5, fy - dy * 4); }
    g.stroke();
    if (opts.carry) { g.save(); g.translate(0, -24); drawPot(g, cx, cy - 4); g.restore(); }
  }

  /* ---------- enemies ---------- */
  function drawEnemy(g, e) {
    const cx = px(e.x) + 20, cy = py(e.y) + 20;
    const col = e.flash ? C.red : C.amber;
    if (e.type === 'hog') {
      const dir = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[e.face] || [1, 0];
      const alert = e.st === 'alert' || e.st === 'charge', stun = e.st === 'stun';
      stroke(g, stun ? C.amberDim : col, alert ? 3 : 2, alert ? 18 : 8);
      g.save(); g.translate(cx, cy); g.rotate(Math.atan2(dir[1], dir[0]));
      // body + snout point the way it faces; spikes along the back
      g.beginPath(); g.ellipse(-2, 0, 13, 10, 0, 0, Math.PI * 2); g.stroke();
      if (alert) { g.fillStyle = 'rgba(255,194,74,0.22)'; g.fill(); }
      g.beginPath(); g.moveTo(10, -5); g.lineTo(17, 0); g.lineTo(10, 5); g.stroke();
      g.beginPath();
      for (let i = 0; i < 5; i++) { const sx = -12 + i * 5; g.moveTo(sx, -9); g.lineTo(sx + 2, -15); g.lineTo(sx + 4, -9); }
      g.stroke();
      if (e.st === 'charge') {
        stroke(g, C.amberDim, 1.5, 0);
        g.beginPath(); g.moveTo(-18, -5); g.lineTo(-26, -5); g.moveTo(-18, 5); g.lineTo(-26, 5); g.stroke();
      }
      g.restore();
      if (stun) drawStars(g, cx, cy - 16);
      if (e.st === 'alert') drawBang(g, cx + 13, cy - 16);
    } else if (e.type === 'wisp') {
      const ready = e.charge >= 2;
      stroke(g, col, 2, ready ? 18 : 8);
      g.beginPath(); g.moveTo(cx, cy - 15); g.lineTo(cx + 8, cy); g.lineTo(cx, cy + 15); g.lineTo(cx - 8, cy); g.closePath(); g.stroke();
      if (ready) { g.fillStyle = 'rgba(255,194,74,0.25)'; g.fill(); }
      stroke(g, C.amberDim, 1.5, 0);
      g.beginPath(); g.ellipse(cx, cy, 15, 5, 0.5, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.ellipse(cx, cy, 15, 5, -0.5, 0, Math.PI * 2); g.stroke();
    } else if (e.type === 'mimmet') {
      stroke(g, col, 2, 8);
      g.beginPath(); g.arc(cx, cy + 6, 13, Math.PI, 0); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(cx, cy + 6);
      for (let a = 0; a < 9; a += 0.6) g.lineTo(cx + Math.cos(Math.PI + a * 0.35) * a * 1.2, cy + 4 + Math.sin(Math.PI + a * 0.35) * a * 1.0);
      g.stroke();
      noGlow(g); g.fillStyle = col;
      g.fillRect(cx - 6, cy + 9, 2.5, 2.5); g.fillRect(cx + 4, cy + 9, 2.5, 2.5);
      // a mirror tick under it: its hint
      stroke(g, C.amberDim, 1.5, 0);
      g.beginPath(); g.moveTo(cx - 9, cy + 16); g.lineTo(cx - 3, cy + 16); g.moveTo(cx + 3, cy + 16); g.lineTo(cx + 9, cy + 16); g.stroke();
      if (e.hp < 2) { g.beginPath(); g.moveTo(cx - 4, cy - 5); g.lineTo(cx + 2, cy + 1); g.stroke(); }
    }
  }
  function drawStars(g, cx, cy) {
    stroke(g, C.amber, 1.5, 8);
    for (const [ox, oy] of [[-8, 0], [0, -4], [8, 0]]) {
      g.beginPath();
      g.moveTo(cx + ox - 3, cy + oy); g.lineTo(cx + ox + 3, cy + oy);
      g.moveTo(cx + ox, cy + oy - 3); g.lineTo(cx + ox, cy + oy + 3);
      g.stroke();
    }
  }
  function drawBang(g, x, y) {
    stroke(g, C.amber, 3, 12);
    g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x, y + 1); g.stroke();
    noGlow(g); g.fillStyle = C.amber; g.fillRect(x - 1.5, y + 4, 3, 3);
  }
  function drawEmber(g, em) {
    const cx = px(em.x) + 20, cy = py(em.y) + 20;
    stroke(g, C.red, 2, 14);
    g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,194,74,0.6)'; g.fill();
    stroke(g, C.amberDim, 2, 0);
    g.beginPath(); g.moveTo(cx - em.dx * 8, cy - em.dy * 8); g.lineTo(cx - em.dx * 16, cy - em.dy * 16); g.stroke();
  }

  function drawMark(g, x, y) {
    const X = px(x), Y = py(y);
    noGlow(g);
    g.fillStyle = 'rgba(255,194,74,0.18)';
    g.fillRect(X + 2, Y + 2, T - 4, T - 4);
    stroke(g, C.amber, 2.5, 12);
    g.beginPath(); g.moveTo(X + 10, Y + 10); g.lineTo(X + 30, Y + 30); g.moveTo(X + 30, Y + 10); g.lineTo(X + 10, Y + 30); g.stroke();
  }

  /* ---------- the Kilnwarden ---------- */
  // A squat furnace with a chimney and a grate. Hot = bright amber with a red
  // glow; cooling = dim shell and an open cyan core you can hit.
  function drawBoss(g, b) {
    const X = px(b.x), Y = py(b.y), cx = X + T, cy = Y + T;
    const cool = b.phase === 'cool';
    const col = b.flash ? C.red : cool ? C.amberDim : C.amber;
    stroke(g, col, 2.5, cool ? 4 : 18);
    rr(g, X + 6, Y + 14, 68, 60, 12); g.stroke();
    if (!cool) { g.fillStyle = 'rgba(255,92,122,0.10)'; g.fill(); }
    g.beginPath(); g.moveTo(X + 50, Y + 14); g.lineTo(X + 50, Y + 2); g.lineTo(X + 62, Y + 2); g.lineTo(X + 62, Y + 14); g.stroke();
    // grate "eye"
    rr(g, cx - 18, cy - 4, 36, 22, 6); g.stroke();
    if (cool) {
      stroke(g, C.cyan, 3, 16);
      g.beginPath(); g.arc(cx, cy + 7, 7, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(63,224,255,0.35)'; g.fill();
    } else {
      stroke(g, col, 2, 10);
      g.beginPath();
      for (const gx of [-10, 0, 10]) { g.moveTo(cx + gx, cy - 1); g.lineTo(cx + gx, cy + 15); }
      g.stroke();
    }
    // feet
    stroke(g, col, 2.5, 6);
    g.beginPath(); g.moveTo(X + 16, Y + 74); g.lineTo(X + 14, Y + 79); g.moveTo(X + 64, Y + 74); g.lineTo(X + 66, Y + 79); g.stroke();
    // health: three pips along the base
    noGlow(g);
    for (let i = 0; i < 3; i++) {
      g.fillStyle = i < b.hp ? C.amber : 'rgba(255,194,74,0.2)';
      g.fillRect(cx - 13 + i * 10, Y + 63, 6, 4);
    }
    if (cool) {
      noGlow(g); g.fillStyle = C.cyan; g.font = `700 12px ${FONT}`; g.textAlign = 'center';
      g.textBaseline = 'middle'; g.fillText('COOL ' + b.t, cx - 6, Y + 27);
    }
  }

  /* ---------- effects (one frame each) ---------- */
  function drawFx(g, f, G) {
    if (f.x == null) return;
    const cx = px(f.x) + 20, cy = py(f.y) + 20;
    if (f.type === 'swing') {
      stroke(g, C.white, 2.5, 12);
      const a = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }[G.face];
      g.beginPath(); g.arc(px(G.px) + 20, py(G.py) + 22, 26, a - 0.8, a + 0.8); g.stroke();
    } else if (f.type === 'hit') {
      stroke(g, C.red, 2.5, 14);
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.moveTo(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7); g.lineTo(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15);
      }
      g.stroke();
    } else if (f.type === 'poof') {
      stroke(g, C.cyanDim, 2, 8);
      for (const r of [8, 15]) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); }
    } else if (f.type === 'vault') {
      stroke(g, C.cyanDim, 2, 6);
      g.setLineDash([3, 5]);
      g.beginPath(); g.arc(cx, cy + 10, 18, Math.PI, 0); g.stroke();
      g.setLineDash([]);
    }
  }

  /* ---------- overlays ---------- */
  function drawBanner(g, name) {
    const label = String(name).toUpperCase();
    g.font = `700 22px ${FONT}`;
    const w = Math.min(560, g.measureText(label).width + 60);
    const x = 300 - w / 2, y = 22;
    noGlow(g);
    g.fillStyle = 'rgba(0,0,0,0.88)';
    g.fillRect(x, y, w, 42);
    stroke(g, C.cyan, 2, 10);
    g.beginPath();
    g.moveTo(x, y + 12); g.lineTo(x, y); g.lineTo(x + 14, y);
    g.moveTo(x + w - 14, y + 42); g.lineTo(x + w, y + 42); g.lineTo(x + w, y + 30);
    g.stroke();
    noGlow(g);
    g.fillStyle = C.white; g.textAlign = 'center'; g.textBaseline = 'middle';
    if ('letterSpacing' in g) g.letterSpacing = '3px';
    g.fillText(label, 300, y + 22);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
  }

  // Item ring: slots on a circle, the chosen one glowing, its name and
  // description in the middle.
  function drawRing(g, ring) {
    noGlow(g);
    g.fillStyle = 'rgba(0,0,0,0.86)';
    g.fillRect(0, 0, 600, 504);
    const cx = 300, cy = 252, R = 168, n = ring.items.length;
    stroke(g, C.cyanDim, 1.5, 0);
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    ring.items.forEach((it, i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      const sel = i === ring.i;
      const amber = it.on;
      noGlow(g);
      g.fillStyle = 'rgba(0,0,0,0.95)';
      g.beginPath(); g.arc(x, y, 34, 0, Math.PI * 2); g.fill();
      stroke(g, sel ? C.cyan : amber ? C.amber : C.cyanDim, sel ? 3 : 2, sel ? 18 : 0);
      g.beginPath(); g.arc(x, y, 34, 0, Math.PI * 2); g.stroke();
      if (sel) { g.fillStyle = 'rgba(63,224,255,0.14)'; g.fill(); }
      drawRingIcon(g, it.id, x, y, sel ? C.white : amber ? C.amber : C.cyan);
    });
    const it = ring.items[ring.i];
    noGlow(g);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = it.on ? C.amber : C.cyan;
    g.font = `700 24px ${FONT}`;
    if ('letterSpacing' in g) g.letterSpacing = '2px';
    g.fillText(it.name.toUpperCase(), cx, cy - 34);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    g.fillStyle = C.white;
    g.font = `500 17px ${FONT}`;
    wrap(g, it.desc, cx, cy + 2, 220, 22);
    g.fillStyle = C.dim;
    g.font = `600 13px ${FONT}`;
    g.fillText(it.kind === 'item' ? (it.on ? 'EQUIPPED' : 'PINCH TO EQUIP') : 'PINCH', cx, cy + 74);
  }
  function wrap(g, text, x, y, maxW, lh) {
    const words = String(text).split(' ');
    const lines = []; let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => g.fillText(l, x, y + i * lh - ((lines.length - 1) * lh) / 2 + lh / 2));
  }
  function drawRingIcon(g, id, x, y, col) {
    stroke(g, col, 2.5, 6);
    g.beginPath();
    if (id === 'thwacker') {
      g.save(); g.translate(x, y); g.rotate(-0.6);
      rr(g, -11, -16, 22, 13, 3); g.stroke();
      g.beginPath(); g.moveTo(0, -3); g.lineTo(0, 17); g.stroke();
      g.beginPath(); g.arc(0, -9.5, 2.5, 0, Math.PI * 2); g.stroke();
      g.restore();
    } else if (id === 'hopstaff') {
      g.moveTo(x - 12, y + 16); g.lineTo(x + 12, y - 16);
      g.moveTo(x + 4, y - 14); g.quadraticCurveTo(x + 14, y - 10, x + 13, y - 2);
      g.moveTo(x - 4, y + 14); g.quadraticCurveTo(x - 14, y + 10, x - 13, y + 2);
      g.stroke();
    } else if (id === 'reset') {
      g.arc(x, y, 13, -Math.PI * 0.2, Math.PI * 1.45); g.stroke();
      g.beginPath(); g.moveTo(x + 13, y - 13); g.lineTo(x + 11, y - 3); g.lineTo(x + 2, y - 7); g.stroke();
    } else if (id === 'sound') {
      g.moveTo(x - 13, y - 5); g.lineTo(x - 6, y - 5); g.lineTo(x + 2, y - 12); g.lineTo(x + 2, y + 12); g.lineTo(x - 6, y + 5); g.lineTo(x - 13, y + 5); g.closePath();
      g.moveTo(x + 8, y - 6); g.quadraticCurveTo(x + 13, y, x + 8, y + 6);
      g.stroke();
    } else if (id === 'title') {
      g.moveTo(x - 12, y - 12); g.lineTo(x + 6, y - 12); g.lineTo(x + 6, y + 12); g.lineTo(x - 12, y + 12); g.closePath();
      g.moveTo(x - 2, y); g.lineTo(x + 16, y); g.moveTo(x + 11, y - 5); g.lineTo(x + 16, y); g.lineTo(x + 11, y + 5);
      g.stroke();
    }
  }

  /* ---------- title art ---------- */
  function drawTitleArt(canvas) {
    const w = 200, h = 150;
    const g = prep(canvas, w, h);
    // a doorway arch, a brazier either side, and Bodge facing out
    stroke(g, C.cyan, 2, 8);
    g.beginPath();
    g.moveTo(40, 140); g.lineTo(40, 60); g.arc(100, 60, 60, Math.PI, 0); g.lineTo(160, 140);
    g.stroke();
    stroke(g, C.cyanDim, 1.5, 0);
    g.beginPath();
    g.moveTo(56, 140); g.lineTo(56, 62); g.arc(100, 62, 44, Math.PI, 0); g.lineTo(144, 140);
    g.moveTo(10, 140); g.lineTo(190, 140);
    g.stroke();
    drawBrazier(g, 20, 108, 'L');
    drawBrazier(g, 180, 108, 'L');
    g.save(); g.translate(100, 104); g.scale(1.7, 1.7); g.translate(-100, -104);
    drawBodge(g, 100, 104, 'down', {});
    g.restore();
  }

  window.BamberRender = { draw, drawTitleArt, drawBodge };
})();
