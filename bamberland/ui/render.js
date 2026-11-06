/* ==========================================================================
   Bamberland — drawing, redrawn once per turn (never on a loop).
   Outdoor screens are natural pixel art (ui/pixel.js, data/art.js).
   Dungeons are still the prototype's glowing line art: cyan = structure,
   amber = treasure and danger, red = damage. People, Bodge and pickups
   are pixel art everywhere. Black is see-through on the glasses.
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
  const Px = window.BamberPixel;
  const LORE = () => window.BAMBER_LORE;
  const personSprite = (who) => { const p = LORE().people[who]; return p && p.sprite; };

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
    g.shadowBlur = 0; g.globalAlpha = 1;
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
    const hurt = ui.fx.some((f) => f.type === 'hurt');

    if (R.field) drawField(g, game, hurt);
    else {
      const tint = tintOf(R.id);
      drawWalls(g, R, tint);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) drawTile(g, R, q, x, y, tint);
      const wd = window.BAMBER_WORLD.rooms[R.id];
      if (wd && wd.wheel) drawWheel(g, wd, G, tint);
      // Boss warnings under everything that moves
      for (const [x, y] of R.marks || []) drawMark(g, x, y);
      for (const [k, o] of Object.entries(R.obj)) {
        const [x, y] = k.split(',').map(Number);
        drawObject(g, o, x, y, R);
      }
      for (const e of R.enemies) drawEnemy(g, e, G);
      if (R.boss) drawBoss(g, R.boss);
      for (const em of R.embers) drawEmber(g, em);
      if (R.visitor) drawPerson(g, R.visitor.who, R.visitor.x, R.visitor.y, R.visitor.face, 'day');
      drawHero(g, G, hurt, 'day');
    }
    for (const f of ui.fx) drawFx(g, f, G);
    if (shake) g.setTransform(Math.min(2, window.devicePixelRatio || 1), 0, 0, Math.min(2, window.devicePixelRatio || 1), 0, 0);
    if (ui.banner) drawBanner(g, ui.banner);
    if (ui.ring) drawRing(g, ui.ring);
    if (ui.shop) drawShop(g, ui.shop, G);
    if (ui.map) drawMap(g, ui.map);
  }

  /* ---------- outdoor screens (pixel art) ---------- */
  const PIX_OBJ = { '=': 'sign', C: 'chest', c: 'chest_open', P: 'pot', $: 'balloon', Y: 'balloon', H: 'heart', K: 'key' };
  function drawField(g, game, hurt) {
    const { G, R } = game;
    const md = game.tone();
    Px.ground(g, (x, y) => R.look[y][x], md);
    // Everything standing on the ground, back to front, so lower things overlap higher ones
    const things = [];
    for (const b of R.buildings) {
      const art = b.swap && G.story[b.swap.if] ? b.swap.art : b.art;
      const img = Px.art(art, md);
      if (img) things.push({ y: b.y + 1, draw: () => Px.blit(g, img, px(b.x), py(b.y)) });
    }
    for (const [k, o] of Object.entries(R.obj)) {
      const [x, y] = k.split(',').map(Number);
      if (o === 'N') {
        const p = R.people[k] || { who: 'folk', face: 'down' };
        things.push({ y, draw: () => drawPerson(g, p.who, x, y, p.face, md) });
      } else if (PIX_OBJ[o]) {
        const img = Px.art(PIX_OBJ[o], o === 'Y' || o === '$' || o === 'H' || o === 'K' ? 'day' : md);
        things.push({ y: y - 0.1, draw: () => Px.blit(g, img, px(x), py(y), o === 'Y' ? 3 : 4) });
      } else {
        things.push({ y, draw: () => drawObject(g, o, x, y, R) });
      }
    }
    for (const e of R.enemies) things.push({ y: e.y, draw: () => drawEnemy(g, e, G) });
    if (R.visitor) things.push({ y: R.visitor.y, draw: () => drawPerson(g, R.visitor.who, R.visitor.x, R.visitor.y, R.visitor.face, 'day') });
    things.push({ y: G.py + 0.5, draw: () => drawHero(g, G, hurt, 'day') });
    things.sort((a, b) => a.y - b.y).forEach((t) => t.draw());
  }

  // A person standing on tile x, y. Their sprite is 12 rows: the top 2 sit above the tile.
  function drawPerson(g, who, x, y, face, md) {
    const name = personSprite(who);
    if (!name) { drawNettle(g, px(x) + 20, py(y) + 20); return; }
    const img = Px.art(name, md, face === 'left');
    if (img) Px.blit(g, img, px(x), py(y) - 2 * Px.PX);
  }
  function drawHero(g, G, hurt, md) {
    const img = Px.bodge(G.face, G.step || 0, hurt ? 'hurt' : md, G.cap || 0);
    Px.blit(g, img, px(G.px), py(G.py) - 2 * Px.PX);
    if (G.shield > 0) {
      stroke(g, 'rgba(164,224,255,0.8)', 2, 10);
      g.beginPath(); g.arc(px(G.px) + 20, py(G.py) + 16, 25, 0, Math.PI * 2); g.stroke();
      noGlow(g);
    }
    if (G.carry) Px.blit(g, Px.art('pot', 'day'), px(G.px) + 4, py(G.py) - 40, 3.2);
  }

  // A region can colour its dungeons' walls (world/regions.js: tint). Default: cyan.
  const rgba = (hex, a) => `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',')},${a})`;
  function tintOf(roomId) {
    const W8 = window.BAMBER_WORLD, d = W8 && W8.rooms[roomId];
    const hex = (d && (d.tint || (W8.regions[d.region] || {}).tint)) || '#3fe0ff';
    return { full: hex, dim: rgba(hex, 0.38), faint: rgba(hex, 0.07), floor: rgba(hex, 0.16) };
  }
  function drawWalls(g, R, tint) {
    const wall = (x, y) => x < 0 || y < 0 || x >= W || y >= H || R.base[y][x] === '#';
    // faint fill
    g.fillStyle = tint.faint;
    noGlow(g);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (wall(x, y)) g.fillRect(px(x), py(y), T, T);
    // bright edges where wall meets floor, with a brick course inside
    stroke(g, tint.full, 2, 8);
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
    stroke(g, tint.dim, 1, 0);
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

  function drawTile(g, R, q, x, y, tint) {
    const t = R.base[y][x], X = px(x), Y = py(y);
    const cracked = R.cracks && R.cracks[x + ',' + y];
    if (t === '#' || t === '*') return;
    if (t === '%') { Px.blit(g, Px.art('thorns', 'day'), X, Y); return; }
    if (t === 'M') { drawMachineGate(g, X, Y); return; }
    if (t === 'G') { drawSluiceGate(g, X, Y); return; }
    if (t === '~' || cracked) { drawGap(g, X, Y, !!cracked); return; }
    // floor: a small cross at the tile centre
    stroke(g, tint ? tint.floor : 'rgba(63,224,255,0.16)', 1, 0);
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
    else if (t === 'd' || t === 'g') drawOpenDoor(g, X, Y);
  }

  // A machinery gate: bars with a cog in the middle. Lifts when the mill wakes up.
  function drawMachineGate(g, X, Y) {
    drawShutter(g, X, Y, false);
    stroke(g, C.amber, 2, 8);
    const cx = X + 20, cy = Y + 20;
    g.beginPath(); g.arc(cx, cy, 7, 0, Math.PI * 2); g.stroke();
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.moveTo(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7); g.lineTo(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11);
    }
    g.stroke();
  }
  // A sluice gate: a heavy slab in a frame, with a ring to hook
  function drawSluiceGate(g, X, Y) {
    stroke(g, C.cyan, 2, 6);
    rr(g, X + 4, Y + 3, 32, 34, 2); g.stroke();
    stroke(g, C.cyanDim, 1.5, 0);
    g.beginPath();
    for (const yy of [12, 20, 28]) { g.moveTo(X + 8, Y + yy); g.lineTo(X + 32, Y + yy); }
    g.stroke();
    stroke(g, C.amber, 2, 10);
    g.beginPath(); g.arc(X + 20, Y + 30, 4, 0, Math.PI * 2); g.stroke();
  }

  // The mill wheel, over its 3×3 of machinery. Still: spokes stand where they
  // are. Each stage of the machinery turns it a notch; once the mill runs,
  // it turns a little every turn (only when the picture is redrawn anyway).
  function drawWheel(g, d, G, tint) {
    const [wx, wy] = d.wheel;
    const cx = px(wx) + 20, cy = py(wy) + 20;
    const stages = (d.stages || []).filter((f) => G.story[f]).length;
    const running = G.story.sun_mill;
    const a = (stages * 0.35) + (running ? (G.turns % 12) * (Math.PI / 24) : 0);
    const col = running ? C.cyan : stages ? tint.full : tint.dim;
    stroke(g, col, 2.5, running ? 14 : 4);
    g.beginPath(); g.arc(cx, cy, 54, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, 44, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, 8, 0, Math.PI * 2); g.stroke();
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const s = a + (i / 8) * Math.PI * 2;
      g.moveTo(cx + Math.cos(s) * 8, cy + Math.sin(s) * 8); g.lineTo(cx + Math.cos(s) * 44, cy + Math.sin(s) * 44);
      // paddles
      g.moveTo(cx + Math.cos(s - 0.12) * 54, cy + Math.sin(s - 0.12) * 54); g.lineTo(cx + Math.cos(s + 0.12) * 60, cy + Math.sin(s + 0.12) * 60);
    }
    g.stroke();
    if (stages || running) {
      // water: a few blue strokes falling into the pit
      stroke(g, 'rgba(164,224,255,0.75)', 2, 6);
      g.beginPath();
      for (const ox of [-14, 0, 14]) { g.moveTo(cx + ox, cy - 74); g.lineTo(cx + ox + 2, cy - 60); }
      if (running) for (const ox of [-30, 30]) { g.moveTo(cx + ox, cy + 62); g.quadraticCurveTo(cx + ox * 1.2, cy + 70, cx + ox * 1.4, cy + 66); }
      g.stroke();
    }
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
      case 'N': {
        const p = R.people && R.people[x + ',' + y];
        drawPerson(g, p ? p.who : 'nettle', x, y, p ? p.face : 'down', 'day');
        break;
      }
      case '$': case 'Y': case 'H': case 'K':
        Px.blit(g, Px.art(PIX_OBJ[o], 'day'), X + (o === 'Y' ? 5 : 0), Y + (o === 'Y' ? 5 : 0), o === 'Y' ? 3 : 4);
        break;
      case 'b': case 'l': case 'L': drawBrazier(g, cx, cy, o, R.burn && R.burn[x + ',' + y]); break;
      case 'I': // a post to hook: a stake with a ring at the top
        stroke(g, C.cyan, 2.5, 8);
        g.beginPath(); g.moveTo(cx, Y + 14); g.lineTo(cx, Y + 36); g.moveTo(cx - 8, Y + 36); g.lineTo(cx + 8, Y + 36); g.stroke();
        stroke(g, C.amber, 2.5, 10);
        g.beginPath(); g.arc(cx, Y + 9, 5, 0, Math.PI * 2); g.stroke();
        break;
      case '!': case 'j': { // a lever: up (waiting) or down (pulled)
        const down = o === 'j', spring = R.springs && R.springs[x + ',' + y];
        stroke(g, C.cyan, 2, 6);
        rr(g, X + 8, Y + 28, 24, 8, 2); g.stroke();
        stroke(g, down ? C.green : C.amber, 3, down ? 6 : 12);
        g.beginPath();
        if (down) { g.moveTo(cx, Y + 30); g.lineTo(cx + 13, Y + 18); } else { g.moveTo(cx, Y + 30); g.lineTo(cx - 9, Y + 10); }
        g.stroke();
        noGlow(g); g.fillStyle = down ? C.green : C.amber;
        g.beginPath(); g.arc(down ? cx + 13 : cx - 9, down ? Y + 18 : Y + 10, 3.5, 0, Math.PI * 2); g.fill();
        if (down && spring) {
          // turns before it springs back
          for (let i = 0; i < spring - 1; i++) g.fillRect(X + 6 + i * 4, Y + 2, 2, 2);
        }
        break;
      }
      case 'X':
        drawHeart(g, cx, cy, 11, C.red);
        stroke(g, C.amber, 1.5, 8);
        g.beginPath(); g.arc(cx, cy, 16, 0, Math.PI * 2); g.stroke();
        break;
      case 'Q': {
        // the Sunstone, with a soft glow
        noGlow(g);
        g.fillStyle = 'rgba(255,211,77,0.18)';
        g.beginPath(); g.arc(cx, cy, 19, 0, Math.PI * 2); g.fill();
        Px.blit(g, Px.art('sunstone', 'day'), X + 2, Y + 2);
        break;
      }
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
    if (b.type === 'thorn') { drawThornmother(g, b); return; }
    const X = px(b.x), Y = py(b.y), cx = X + T, cy = Y + T;
    const cool = b.phase === 'cool';
    const col = b.flash ? C.red : cool ? C.amberDim : C.amber;
    stroke(g, col, 2.5, cool ? 4 : 18);
    rr(g, X + 6, Y + 14, 68, 60, 12); g.stroke();
    if (!cool) { g.fillStyle = 'rgba(255,92,122,0.10)'; g.fill(); }
    g.beginPath(); g.moveTo(X + 60, Y + 16); g.lineTo(X + 60, Y + 2); g.lineTo(X + 70, Y + 2); g.lineTo(X + 70, Y + 20); g.stroke();
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
    // cooling vents, two on each side: shut (dim), glowing with a ring to hook, or open (steam)
    const open = b.opened || [];
    for (const side of ['n', 'e', 's', 'w']) for (const half of [0, 1]) {
      const id = side + half, glowing = b.phase === 'vent' && b.side === side && !open.includes(id), opened = open.includes(id);
      const along = half ? 1 : -1;     // left/top vent or right/bottom one
      // just outside the body, one in front of each of the tiles on that side
      const [vx, vy, w, h] = {
        n: [cx + (half ? 4 : -18), Y + 5, 14, 7], s: [cx + (half ? 4 : -18), Y + 75, 14, 7],
        w: [X - 1, cy + (half ? 4 : -18), 7, 14], e: [X + 74, cy + (half ? 4 : -18), 7, 14],
      }[side];
      stroke(g, glowing ? C.white : opened ? C.cyan : C.amberDim, glowing ? 2.5 : 1.5, glowing ? 16 : opened ? 10 : 0);
      rr(g, vx, vy, w, h, 2); g.stroke();
      const mx = vx + w / 2, my = vy + h / 2;
      const [ox, oy] = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[side];
      if (glowing) {
        g.fillStyle = 'rgba(255,194,74,0.35)'; g.fill();
        g.beginPath(); g.arc(mx + ox * 10, my + oy * 10, 4.5, 0, Math.PI * 2); g.stroke();
      }
      if (opened) {
        stroke(g, 'rgba(164,224,255,0.7)', 1.5, 6);
        g.beginPath(); g.moveTo(mx + ox * 4, my + oy * 4);
        g.quadraticCurveTo(mx + ox * 9 + oy * 4 * along, my + oy * 9 + ox * 4 * along, mx + ox * 14, my + oy * 14); g.stroke();
      }
    }
    if (b.phase === 'vent') {
      noGlow(g); g.fillStyle = C.amber; g.font = `700 12px ${FONT}`; g.textAlign = 'center';
      g.textBaseline = 'middle'; g.fillText('VENT ' + b.t, cx, Y + 27);
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
      g.textBaseline = 'middle'; g.fillText('COOL ' + b.t, cx, Y + 27);
    }
  }

  /* ---------- the Thornmother ---------- */
  // A knot of brambles on two clawed roots. Closed: green and bristling with
  // amber thorns. Open: the tangle parts and a red heart glows in the middle.
  function drawThornmother(g, b) {
    const X = px(b.x), Y = py(b.y), cx = X + T, cy = Y + T;
    const open = b.phase === 'open';
    const green = b.flash ? C.red : open ? 'rgba(98,184,69,0.55)' : '#62b845';
    // the tangle: overlapping loops
    stroke(g, green, 2.5, open ? 4 : 14);
    for (const [ox, oy, rx, ry, rot] of [[0, 0, 30, 24, 0.3], [-4, 4, 26, 30, -0.5], [5, -3, 24, 20, 1.2], [0, 6, 32, 18, -0.1]]) {
      g.beginPath(); g.ellipse(cx + ox, cy + oy, rx, ry, rot, 0, Math.PI * 2); g.stroke();
    }
    if (!open) { g.fillStyle = 'rgba(98,184,69,0.12)'; g.beginPath(); g.ellipse(cx, cy, 30, 26, 0, 0, Math.PI * 2); g.fill(); }
    // thorns round the edge
    stroke(g, open ? C.amberDim : C.amber, 2, open ? 0 : 8);
    g.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.2, r1 = 27, r2 = 36;
      g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.9);
      g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2 * 0.9);
    }
    g.stroke();
    // two eyes, cross until the heart opens
    noGlow(g); g.fillStyle = open ? C.amberDim : C.amber;
    g.save(); g.translate(cx - 11, cy - 12); g.rotate(open ? 0 : 0.35); g.fillRect(-5, -1.5, 10, 3); g.restore();
    g.save(); g.translate(cx + 11, cy - 12); g.rotate(open ? 0 : -0.35); g.fillRect(-5, -1.5, 10, 3); g.restore();
    if (open) {
      drawHeart(g, cx, cy + 4, 11, C.red);
      stroke(g, 'rgba(255,92,122,0.6)', 2, 18);
      g.beginPath(); g.arc(cx, cy + 3, 18, 0, Math.PI * 2); g.stroke();
      noGlow(g); g.fillStyle = C.red; g.font = `700 12px ${FONT}`; g.textAlign = 'center';
      g.textBaseline = 'middle'; g.fillText('OPEN ' + b.t, cx, Y - 4 + 2);
    }
    // health pips
    noGlow(g);
    for (let i = 0; i < 3; i++) {
      g.fillStyle = i < b.hp ? C.green : 'rgba(89,242,165,0.2)';
      g.fillRect(cx - 13 + i * 10, Y + 72, 6, 4);
    }
  }

  /* ---------- effects (one frame each) ---------- */
  function drawFx(g, f, G) {
    if (f.type === 'roots') {
      // roots burst up along the marked line
      stroke(g, '#62b845', 3, 12);
      g.beginPath();
      for (const [x, y] of f.tiles || []) {
        const X = px(x), Y = py(y);
        g.moveTo(X + 8, Y + 34); g.lineTo(X + 13, Y + 8); g.lineTo(X + 18, Y + 34);
        g.moveTo(X + 22, Y + 34); g.lineTo(X + 28, Y + 4); g.lineTo(X + 33, Y + 34);
      }
      g.stroke();
      return;
    }
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
    } else if (f.type === 'line') {
      // the Grapple Line, for one frame: from Bodge to where the hook went
      const hx = px(G.px) + 20, hy = py(G.py) + 18;
      stroke(g, C.white, 2, 8);
      g.beginPath(); g.moveTo(hx, hy); g.lineTo(cx, cy); g.stroke();
      stroke(g, C.amber, 2.5, 10);
      g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.stroke();
    } else if (f.type === 'steam') {
      stroke(g, 'rgba(164,224,255,0.8)', 2, 10);
      for (const r of [7, 13, 19]) { g.beginPath(); g.arc(cx, cy, r, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
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
      if (it.count != null) {
        noGlow(g); g.fillStyle = C.amber; g.font = `700 14px ${FONT}`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('×' + it.count, x + 24, y + 26);
      }
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
    wrapTop(g, it.desc, cx, cy - 6, 220, 22);   // starts under the name, however many lines
    g.fillStyle = C.dim;
    g.font = `600 13px ${FONT}`;
    const tag = it.kind === 'item' ? (it.on ? 'EQUIPPED' : 'PINCH TO EQUIP') : it.kind === 'elixir' ? 'PINCH TO DRINK' : 'PINCH';
    g.fillText(tag, cx, cy + 96);
  }
  function wrapTop(g, text, x, top, maxW, lh) {
    const words = String(text).split(' ');
    const lines = []; let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => g.fillText(l, x, top + i * lh));
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
  const ELIXIR_COL = { tonic: '#ff5a5a', brew: '#a4e0ff', warming: '#ffb52e', fizz: '#b8ff8a' };
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
    } else if (id === 'grapple') {
      // a coil of line with a three-pronged hook
      g.arc(x - 4, y + 5, 9, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(x - 4, y + 5, 4.5, 0, Math.PI * 2); g.stroke();
      g.beginPath();
      g.moveTo(x + 4, y - 1); g.lineTo(x + 11, y - 10);
      g.moveTo(x + 11, y - 10); g.quadraticCurveTo(x + 16, y - 10, x + 15, y - 5);
      g.moveTo(x + 11, y - 10); g.quadraticCurveTo(x + 11, y - 16, x + 6, y - 15);
      g.moveTo(x + 11, y - 10); g.lineTo(x + 15, y - 15);
      g.stroke();
    } else if (id === 'reset') {
      g.arc(x, y, 13, -Math.PI * 0.2, Math.PI * 1.45); g.stroke();
      g.beginPath(); g.moveTo(x + 13, y - 13); g.lineTo(x + 11, y - 3); g.lineTo(x + 2, y - 7); g.stroke();
    } else if (id === 'sound') {
      g.moveTo(x - 13, y - 5); g.lineTo(x - 6, y - 5); g.lineTo(x + 2, y - 12); g.lineTo(x + 2, y + 12); g.lineTo(x - 6, y + 5); g.lineTo(x - 13, y + 5); g.closePath();
      g.moveTo(x + 8, y - 6); g.quadraticCurveTo(x + 13, y, x + 8, y + 6);
      g.stroke();
    } else if (id === 'music') {
      g.moveTo(x - 4, y + 10); g.lineTo(x - 4, y - 12); g.lineTo(x + 12, y - 15); g.lineTo(x + 12, y + 7);
      g.stroke();
      g.beginPath(); g.arc(x - 8, y + 10, 4.5, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(x + 8, y + 7, 4.5, 0, Math.PI * 2); g.stroke();
    } else if (id === 'map') {
      g.moveTo(x - 14, y - 10); g.lineTo(x - 5, y - 14); g.lineTo(x + 5, y - 10); g.lineTo(x + 14, y - 14);
      g.lineTo(x + 14, y + 10); g.lineTo(x + 5, y + 14); g.lineTo(x - 5, y + 10); g.lineTo(x - 14, y + 14); g.closePath();
      g.moveTo(x - 5, y - 14); g.lineTo(x - 5, y + 10); g.moveTo(x + 5, y - 10); g.lineTo(x + 5, y + 14);
      g.stroke();
    } else if (id === 'kebab') {
      // a skewer with three chunks and an onion
      g.moveTo(x - 15, y + 15); g.lineTo(x + 15, y - 15); g.stroke();
      noGlow(g);
      for (const [ox, oy, c] of [[-7, 7, '#c08a4a'], [0, 0, '#e0703a'], [7, -7, '#c08a4a']]) {
        g.fillStyle = c; g.beginPath(); g.ellipse(x + ox, y + oy, 6, 4.5, -0.8, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#a6e25c'; g.beginPath(); g.arc(x + 11, y - 11, 2.5, 0, Math.PI * 2); g.fill();
    } else if (ELIXIR_COL[id] || window.BAMBER_LORE.elixirs[id]) {
      // a bottle in the elixir's colour
      g.moveTo(x - 4, y - 15); g.lineTo(x + 4, y - 15);
      g.moveTo(x - 3, y - 15); g.lineTo(x - 3, y - 7); g.quadraticCurveTo(x - 12, y - 3, x - 11, y + 7);
      g.quadraticCurveTo(x - 10, y + 15, x, y + 15); g.quadraticCurveTo(x + 10, y + 15, x + 11, y + 7);
      g.quadraticCurveTo(x + 12, y - 3, x + 3, y - 7); g.lineTo(x + 3, y - 15);
      g.stroke();
      noGlow(g); g.fillStyle = ELIXIR_COL[id] || '#cfd8e8';
      g.beginPath(); g.moveTo(x - 10, y + 3); g.quadraticCurveTo(x, y, x + 10, y + 3);
      g.quadraticCurveTo(x + 10, y + 13, x, y + 13); g.quadraticCurveTo(x - 10, y + 13, x - 10, y + 3); g.fill();
    } else if (id === 'title') {
      g.moveTo(x - 12, y - 12); g.lineTo(x + 6, y - 12); g.lineTo(x + 6, y + 12); g.lineTo(x - 12, y + 12); g.closePath();
      g.moveTo(x - 2, y); g.lineTo(x + 16, y); g.moveTo(x + 11, y - 5); g.lineTo(x + 16, y); g.lineTo(x + 11, y + 5);
      g.stroke();
    }
  }

  /* ---------- title art ---------- */
  function drawTitleArt(canvas, cap) {
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
    g.imageSmoothingEnabled = false;
    Px.blit(g, Px.bodge('down', 0, 'day', cap || 0), 70, 68, 6);
  }

  /* ---------- Kev's shop ---------- */
  function drawShop(g, shop, G) {
    panel(g);
    noGlow(g);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = C.amber; g.font = `700 22px ${FONT}`;
    if ('letterSpacing' in g) g.letterSpacing = '2px';
    g.fillText(shop.title.toUpperCase(), 40, 48);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    g.textAlign = 'right';
    Px.blit(g, Px.art('balloon', 'day'), 470, 28, 3);
    g.fillStyle = C.amber; g.font = `700 20px ${FONT}`;
    g.fillText(String(G.coins), 560, 48);
    if (shop.roof && shop.roof.goal) {
      // Kev's roof: every balloon spent goes up there
      const r = shop.roof, done = r.spent >= r.goal;
      g.textAlign = 'left'; g.font = `600 13px ${FONT}`;
      g.fillStyle = done ? '#ff6a6a' : C.dim;
      if ('letterSpacing' in g) g.letterSpacing = '1px';
      g.fillText(done ? `ALL ${r.goal} ON THE ROOF` : `ON THE ROOF: ${Math.min(r.spent, r.goal)} / ${r.goal}`, 40, 72);
      if ('letterSpacing' in g) g.letterSpacing = '0px';
    }
    shop.items.forEach((it, i) => {
      const y = 90 + i * 62, sel = i === shop.i;
      noGlow(g);
      g.fillStyle = sel ? 'rgba(63,224,255,0.14)' : 'rgba(0,0,0,0.6)';
      rr(g, 30, y, 540, 52, 8); g.fill();
      stroke(g, sel ? C.cyan : C.cyanDim, sel ? 2.5 : 1.5, sel ? 14 : 0);
      rr(g, 30, y, 540, 52, 8); g.stroke();
      drawRingIcon(g, it.id, 62, y + 26, sel ? C.white : C.cyan);
      noGlow(g);
      g.textAlign = 'left'; g.fillStyle = sel ? C.white : C.dim; g.font = `700 19px ${FONT}`;
      g.fillText(it.name, 92, y + 20);
      g.font = `500 14px ${FONT}`; g.fillStyle = C.dim;
      g.fillText(it.owned ? `Carrying ${it.owned}` : 'None yet', 92, y + 40);
      g.textAlign = 'right';
      g.fillStyle = G.coins >= it.price ? C.amber : 'rgba(255,194,74,0.4)';
      g.font = `700 19px ${FONT}`;
      g.fillText(String(it.price), 520, y + 27);
      Px.blit(g, Px.art('balloon', 'day'), 524, y + 12, 3);
    });
    const it = shop.items[shop.i];
    if (it) {
      noGlow(g);
      g.textAlign = 'center'; g.fillStyle = C.white; g.font = `500 17px ${FONT}`;
      wrap(g, it.desc, 300, 90 + shop.items.length * 62 + 34, 500, 22);
    }
  }

  /* ---------- the map ---------- */
  function drawMap(g, map) {
    panel(g);
    const page = map.pages[map.i];
    noGlow(g);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = C.cyan; g.font = `700 22px ${FONT}`;
    if ('letterSpacing' in g) g.letterSpacing = '2px';
    g.fillText(page.name.toUpperCase(), 300, 44);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    if (map.pages.length > 1) {
      g.fillStyle = C.dim; g.font = `600 13px ${FONT}`;
      g.fillText(`◂  ${map.i + 1} / ${map.pages.length}  ▸`, 300, 70);
    }
    const rooms = page.rooms;
    const cols = Math.max(...rooms.map((r) => r.at[0])) + 1;
    const rows = Math.max(...rooms.map((r) => r.at[1])) + 1;
    const cw = Math.min(150, 520 / cols), ch = Math.min(84, 300 / rows);
    const ox = 300 - (cols * cw) / 2, oy = 90 + (300 - rows * ch) / 2;
    const box = (r) => ({ x: ox + r.at[0] * cw + 6, y: oy + r.at[1] * ch + 6, w: cw - 12, h: ch - 12 });
    for (const r of rooms) {
      if (!r.seen) continue;
      const b = box(r);
      // exits as stubs
      stroke(g, C.cyanDim, 2, 0);
      g.beginPath();
      if (r.exits.n) { g.moveTo(b.x + b.w / 2, b.y); g.lineTo(b.x + b.w / 2, b.y - 6); }
      if (r.exits.s) { g.moveTo(b.x + b.w / 2, b.y + b.h); g.lineTo(b.x + b.w / 2, b.y + b.h + 6); }
      if (r.exits.w) { g.moveTo(b.x, b.y + b.h / 2); g.lineTo(b.x - 6, b.y + b.h / 2); }
      if (r.exits.e) { g.moveTo(b.x + b.w, b.y + b.h / 2); g.lineTo(b.x + b.w + 6, b.y + b.h / 2); }
      g.stroke();
      noGlow(g);
      g.fillStyle = r.here ? 'rgba(63,224,255,0.22)' : r.field ? 'rgba(98,184,69,0.14)' : 'rgba(63,224,255,0.06)';
      rr(g, b.x, b.y, b.w, b.h, 6); g.fill();
      stroke(g, r.here ? C.cyan : C.cyanDim, r.here ? 2.5 : 1.5, r.here ? 14 : 0);
      rr(g, b.x, b.y, b.w, b.h, 6); g.stroke();
      noGlow(g);
      g.fillStyle = r.here ? C.white : C.dim; g.font = `600 ${cw < 120 ? 11 : 13}px ${FONT}`;
      wrap(g, r.name, b.x + b.w / 2, b.y + b.h / 2 - (r.here ? 8 : 0), b.w - 10, 15);
      if (r.here) {
        g.fillStyle = C.amber;
        g.beginPath(); g.arc(b.x + b.w / 2, b.y + b.h - 12, 4, 0, Math.PI * 2); g.fill();
      }
    }
    if (map.hint) {
      noGlow(g);
      g.textAlign = 'center';
      g.fillStyle = C.amber; g.font = `700 13px ${FONT}`;
      if ('letterSpacing' in g) g.letterSpacing = '2px';
      g.fillText(map.hintFrom.toUpperCase() + ' SAYS', 300, 420);
      if ('letterSpacing' in g) g.letterSpacing = '0px';
      g.fillStyle = C.white; g.font = `500 17px ${FONT}`;
      wrap(g, map.hint, 300, 450, 520, 22);
    }
  }
  function panel(g) {
    noGlow(g);
    g.fillStyle = 'rgba(0,0,0,0.9)';
    g.fillRect(0, 0, 600, 504);
    stroke(g, C.cyan, 2, 10);
    g.beginPath();
    g.moveTo(14, 36); g.lineTo(14, 14); g.lineTo(36, 14);
    g.moveTo(564, 490); g.lineTo(586, 490); g.lineTo(586, 468);
    g.stroke();
  }

  window.BamberRender = { draw, drawTitleArt };
})();
