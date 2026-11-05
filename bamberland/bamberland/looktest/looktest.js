/* ==========================================================================
   Bamberland look test — natural pixel palette on the glasses.
   Screens: Queen's Wood, Bamber village, Bodge, Lauri, a 3-panel cut scene,
   and a music loop. The art is in art.js; this file draws and plays it.

   Battery: the screen is redrawn only after an input. The cut scene animates
   for a second or two when a panel opens, then stops.
   ========================================================================== */
(() => {
  'use strict';

  const Deck = window.Deck;
  const ART = window.BAMBER_ART;
  const $ = (id) => document.getElementById(id);
  const MUSIC_KEY = 'bamberland.music';
  const LOOK_KEY = 'bamberland.looktest';

  const PX = 4;                 // screen pixels per art pixel
  const T = 40;                 // tile size (10 art pixels)
  const W = 15, H = 12;
  const OY = 12;                // 600×480 grid inside the 600×504 stage
  const board = $('board');

  /* =====================================================================
     CONTENT: maps, people and lines for this test
     ===================================================================== */
  // .  grass   ,  flowers   :  path   ~  water   T  tree   b  bush   f  fence
  const SCENES = {
    wood: {
      name: "The Queen's Wood",
      map: [
        'TTTTTTT:TTTTTTT',
        'TT..,..:...b.TT',
        'T..b...:..,...T',
        'T.,....::.....T',
        'TT...T..:..T..T',
        'T.......:.....T',
        'T..T....:...,.T',
        'T~~~....::....T',
        'T~~~~.....:..TT',
        'TT~~...b..:...T',
        'TTT.......:.TTT',
        'TTTTTTTTTT:TTTT',
      ],
      buildings: [],
      people: [{ id: 'lauri', x: 6, y: 5, face: 'down' }],
      start: { x: 9, y: 7 },
    },
    village: {
      name: 'Bamber village',
      map: [
        'TTTTTT.:.TTTTTT',
        'T.,....:....,.T',
        'T......:......T',
        'T......:......T',
        'Tff.ff.:.ff.ffT',
        'T,.....:......T',
        '::::::::::::::T',
        'T....,.:......T',
        'T......:..~~~.T',
        'T.b....:.~~~~.T',
        'T,.....:..~~..T',
        'TTTTTTT:TTTTTTT',
      ],
      buildings: [
        { id: 'cottage', x: 2, y: 1 },
        { id: 'shop', x: 10, y: 1 },
        { id: 'cottage', x: 2, y: 7 },
        { id: 'well', x: 5, y: 8, solid: [[5, 8], [6, 8], [5, 9], [6, 9]] },
      ],
      people: [
        { id: 'kev', x: 11, y: 3, face: 'down' },
        { id: 'brendan', x: 4, y: 9, face: 'right' },
      ],
      start: { x: 7, y: 9 },
    },
  };

  const PEOPLE = {
    lauri: {
      name: 'Lauri', portrait: 'lauri',
      lines: [
        "Bodge? You're the only one still awake. Everyone else is staring at the clouds.",
        "Don't look so worried. You'll be brilliant. Probably.",
      ],
    },
    kev: {
      name: 'Kev',
      lines: [
        'Welcome to the finest potion shop under a balloon.',
        "Fizzwhistle? Does nothing at all. Best seller. Can't keep it on the shelf.",
      ],
    },
    brendan: {
      name: 'Brendan',
      lines: ["Mind the brambles past the bridge. I'd cut them myself, but I've only just sat down."],
    },
  };

  const CUT = [
    {
      text: "The Queen's Wood, on the sunniest day of the year. Queen Alison is having a lovely time.",
    },
    { text: 'Then the clouds rolled in, and the sun went out like a candle.' },
    { text: 'Tori swooped down and carried the Queen away. Everyone stood dazed. Everyone except Bodge.' },
  ];

  /* =====================================================================
     COLOUR: restored, gloom (a region still under Tori's spell), lifted
     ===================================================================== */
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  function tone(h, mode) {
    if (mode === 'day') return h;
    let [r, g, b] = hex(h);
    if (mode === 'gloom') {
      // most of the colour drains out, it cools to blue-grey and dims by half
      const l = 0.3 * r + 0.59 * g + 0.11 * b;
      r = (l * 0.7 + r * 0.3) * 0.72; g = (l * 0.7 + g * 0.3) * 0.82; b = (l * 0.7 + b * 0.3) * 1.05;
      return toHex([r * 0.62, g * 0.62, b * 0.62]);
    }
    if (mode === 'lift') return toHex([r + (255 - r) * 0.22, g + (255 - g) * 0.22, b + (255 - b) * 0.22]);
    return h;
  }

  /* ---------- sprite cache: text grid → small canvas ---------- */
  const cache = new Map();
  function sprite(rows, pal, mode = 'day', flip = false, key = '') {
    const id = key + '|' + mode + '|' + (flip ? 1 : 0);
    if (key && cache.has(id)) return cache.get(id);
    const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const ch = rows[y][x];
        if (ch === '.' || !pal[ch]) continue;
        g.fillStyle = tone(pal[ch], mode);
        g.fillRect(flip ? w - 1 - x : x, y, 1, 1);
      }
    }
    if (key) cache.set(id, c);
    return c;
  }
  function blit(g, img, x, y, scale = PX) {
    g.imageSmoothingEnabled = false;
    g.drawImage(img, Math.round(x), Math.round(y), img.width * scale, img.height * scale);
  }
  function palette(extra) { return extra ? { ...ART.PALETTE, ...extra } : ART.PALETTE; }

  /* ---------- canvas ---------- */
  function prep(canvas, w, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.imageSmoothingEnabled = false;
    return g;
  }

  /* =====================================================================
     STATE
     ===================================================================== */
  const saved = Deck.store.get(LOOK_KEY, {}) || {};
  const S = {
    mode: 'menu',               // menu | wood | village | bodge | lauri | cut
    look: saved.look || 0,      // which of LOOKS the world uses
    scheme: saved.scheme || 0,  // Bodge's colours
    lift: !!saved.lift,         // Lauri's portrait, lifted or natural
    hero: { x: 0, y: 0, face: 'down', step: 0 },
    dialog: null,               // { pages, i, who, portrait }
    cut: { i: 0, t0: 0, raf: 0 },
  };
  // pinch in the world cycles these
  const LOOKS = [
    { name: 'Restored · filled', tone: 'day', floor: 'filled' },
    { name: 'Restored · sparse', tone: 'day', floor: 'sparse' },
    { name: 'Gloom · filled', tone: 'gloom', floor: 'filled' },
    { name: 'Gloom · sparse', tone: 'gloom', floor: 'sparse' },
  ];
  const remember = () => Deck.store.set(LOOK_KEY, { look: S.look, scheme: S.scheme, lift: S.lift });

  /* =====================================================================
     THE WORLD SCREENS
     ===================================================================== */
  const scene = () => SCENES[S.mode];
  const tileAt = (sc, x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 'T' : sc.map[y][x]);
  function personAt(sc, x, y) { return sc.people.find((p) => p.x === x && p.y === y) || null; }
  function solidAt(sc, x, y) {
    if ('Tbf~'.includes(tileAt(sc, x, y))) return true;
    if (personAt(sc, x, y)) return true;
    for (const b of sc.buildings) {
      const cells = b.solid || [[b.x, b.y], [b.x + 1, b.y], [b.x, b.y + 1], [b.x + 1, b.y + 1]];
      if (cells.some(([cx, cy]) => cx === x && cy === y)) return true;
    }
    return false;
  }

  // small seeded random, so the grass doesn't shimmer between redraws
  function rnd(x, y, n) { const s = Math.sin(x * 127.1 + y * 311.7 + n * 74.7) * 43758.5453; return s - Math.floor(s); }

  function drawGround(g, sc, look) {
    const md = look.tone, filled = look.floor === 'filled';
    const P = ART.PALETTE;
    const col = (k) => tone(P[k], md);
    const fill = {
      grass: tone('#2c6a28', md), path: tone('#7d6142', md), water: tone('#1f69a8', md),
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tileAt(sc, x, y), X = x * T, Y = OY + y * T;
      const isPath = t === ':', isWater = t === '~';
      if (filled) {
        g.fillStyle = isPath ? fill.path : isWater ? fill.water : fill.grass;
        g.fillRect(X, Y, T, T);
      }
      if (isPath) {
        // pebbles; at the edges a darker rim where the path meets grass
        for (let i = 0; i < 4; i++) {
          g.fillStyle = col(i % 2 ? 'p' : 'P');
          g.fillRect(X + Math.floor(rnd(x, y, i) * 9) * PX, Y + Math.floor(rnd(x, y, i + 9) * 9) * PX, PX, PX);
        }
        if (!filled) {
          g.fillStyle = col('P');
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            if (tileAt(sc, x + dx, y + dy) === ':') continue;
            for (let k = 0; k < 10; k += 2) {
              const ex = dx === 0 ? X + k * PX : dx < 0 ? X : X + T - PX;
              const ey = dy === 0 ? Y + k * PX : dy < 0 ? Y : Y + T - PX;
              g.fillRect(ex, ey, PX, PX);
            }
          }
        }
      } else if (isWater) {
        g.fillStyle = col('b');
        const o = (x + y) % 2 ? 0 : 5;
        g.fillRect(X + (1 + o) * PX, Y + 3 * PX, 3 * PX, PX);
        g.fillRect(X + ((6 + o) % 10) * PX, Y + 7 * PX, 3 * PX, PX);
        if (!filled) { g.fillStyle = col('B'); g.fillRect(X + ((3 + o) % 10) * PX, Y + 5 * PX, 2 * PX, PX); }
      } else {
        // grass tufts: two little blades and a highlight
        const n = filled ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const tx = X + (1 + Math.floor(rnd(x, y, i) * 7)) * PX, ty = Y + (2 + Math.floor(rnd(x, y, i + 5) * 6)) * PX;
          g.fillStyle = col('g');
          g.fillRect(tx, ty, PX, 2 * PX);
          g.fillRect(tx + 2 * PX, ty + PX, PX, PX);
          g.fillStyle = col('L');
          g.fillRect(tx, ty, PX, PX);
        }
      }
      if (t === ',') blit(g, sprite(ART.TILES.flowers, P, md, false, 'flowers'), X, Y);
    }
    // solid things on top of the ground
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tileAt(sc, x, y), X = x * T, Y = OY + y * T;
      if (t === 'T') blit(g, sprite(ART.TILES.tree, P, md, (x + y) % 3 === 0, 'tree'), X, Y);
      else if (t === 'b') blit(g, sprite(ART.TILES.bush, P, md, false, 'bush'), X, Y);
      else if (t === 'f') blit(g, sprite(ART.TILES.fence, P, md, false, 'fence'), X, Y);
    }
  }

  function bodgeImg(face, step, md, scheme = S.scheme) {
    const sch = ART.BODGE_SCHEMES[scheme];
    const base = face === 'right' ? 'left' : face;
    const name = 'bodge_' + base + (step % 2 ? '2' : '');
    return sprite(ART.SPRITES[name], palette(sch), md, face === 'right', name + '#' + scheme);
  }
  function personImg(id, md, flip) {
    return sprite(ART.SPRITES[id], ART.PALETTE, md, flip, id);
  }

  function drawWorld() {
    const g = prep(board, 600, 504);
    const sc = scene(), look = LOOKS[S.look], md = look.tone;
    drawGround(g, sc, look);
    // draw from the top row down, so lower things overlap higher ones
    const things = [];
    for (const b of sc.buildings) things.push({ y: b.y + 1, draw: () => blit(g, sprite(ART.BUILDINGS[b.id], ART.PALETTE, md, false, 'b_' + b.id), b.x * T, OY + b.y * T) });
    for (const p of sc.people) things.push({ y: p.y, draw: () => blit(g, personImg(p.id, md, p.face === 'left'), p.x * T, OY + p.y * T - 2 * PX) });
    things.push({ y: S.hero.y + 0.5, draw: () => blit(g, bodgeImg(S.hero.face, S.hero.step, md), S.hero.x * T, OY + S.hero.y * T - 2 * PX) });
    things.sort((a, b) => a.y - b.y).forEach((t) => t.draw());
  }

  function enterWorld(id) {
    S.mode = id;
    const sc = SCENES[id];
    S.hero = { x: sc.start.x, y: sc.start.y, face: 'up', step: 0 };
    showBoard();
    toastLook();
    redraw();
  }
  function toastLook() { Deck.toast(LOOKS[S.look].name); }

  function worldMove(dir) {
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    const h = S.hero, sc = scene();
    h.face = dir;
    const nx = h.x + d[0], ny = h.y + d[1];
    if (nx >= 0 && ny >= 0 && nx < W && ny < H && !solidAt(sc, nx, ny)) {
      h.x = nx; h.y = ny; h.step += 1;
      Music.blip('step');
    }
    redraw();
  }
  function facing() {
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[S.hero.face];
    return personAt(scene(), S.hero.x + d[0], S.hero.y + d[1]);
  }
  function worldPinch() {
    const p = facing();
    if (p) {
      const who = PEOPLE[p.id];
      // they turn to face Bodge
      p.face = { up: 'down', down: 'up', left: 'right', right: 'left' }[S.hero.face];
      openDialog(who.lines, who.name, who.portrait);
      return;
    }
    S.look = (S.look + 1) % LOOKS.length;
    remember();
    toastLook();
    Music.blip('pick');
    redraw();
  }

  /* =====================================================================
     BODGE SCREEN
     ===================================================================== */
  function drawBodgeScreen() {
    const g = prep(board, 600, 504);
    const sch = ART.BODGE_SCHEMES[S.scheme];
    label(g, sch.name.toUpperCase(), 300, 40, 22, '#ffffff');
    // big: facing down and left, 3 × size
    blit(g, bodgeImg('down', 0, 'day'), 150, 70, 12);
    blit(g, bodgeImg('left', 0, 'day'), 330, 70, 12);
    label(g, '3 × SIZE', 300, 236, 13, '#a9c2cf');
    // actual size, on a strip of grass, all four facings and both steps
    const y0 = 290;
    const look = LOOKS[0];
    const strip = { map: Array(H).fill('.'.repeat(W)), people: [], buildings: [] };
    g.save(); g.beginPath(); g.rect(100, y0 - 10, 400, 112); g.clip();
    g.translate(0, y0 - OY - 2 * T);
    drawGround(g, strip, look);
    g.restore();
    const faces = ['down', 'left', 'up', 'right'];
    faces.forEach((f, i) => {
      blit(g, bodgeImg(f, 0, 'day'), 120 + i * 95, y0 + 4);
      blit(g, bodgeImg(f, 1, 'day'), 120 + i * 95 + 42, y0 + 4);
    });
    label(g, 'ACTUAL SIZE · ONE TILE', 300, y0 + 82, 13, '#a9c2cf');
    // and in the gloom
    faces.forEach((f, i) => blit(g, bodgeImg(f, 0, 'gloom'), 160 + i * 75, y0 + 112));
    label(g, 'IN THE GLOOM', 300, y0 + 180, 13, '#a9c2cf');
  }

  /* =====================================================================
     LAURI SCREEN
     ===================================================================== */
  function portraitImg(id, md) {
    return sprite(ART.PORTRAITS[id], ART.PORTRAIT_PALETTE, md, false, 'portrait_' + id);
  }
  function frame(g, x, y, w, h, col = '#3fe0ff') {
    g.strokeStyle = col; g.lineWidth = 2; g.shadowColor = col; g.shadowBlur = 8;
    g.beginPath();
    g.moveTo(x, y + 18); g.lineTo(x, y); g.lineTo(x + 18, y);
    g.moveTo(x + w - 18, y + h); g.lineTo(x + w, y + h); g.lineTo(x + w, y + h - 18);
    g.stroke();
    g.shadowBlur = 0;
  }
  function label(g, text, x, y, size, col) {
    g.shadowBlur = 0;
    g.fillStyle = col; g.font = `700 ${size}px "Chakra Petch", system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if ('letterSpacing' in g) g.letterSpacing = '2px';
    g.fillText(text, x, y);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
  }
  function drawLauriScreen() {
    const g = prep(board, 600, 504);
    const md = S.lift ? 'lift' : 'day';
    const big = portraitImg('lauri', md);
    blit(g, big, 40, 52, 9);                       // 288 px
    frame(g, 32, 44, 304, 304);
    label(g, 'LAURI · ' + (S.lift ? 'LIFTED' : 'NATURAL'), 184, 382, 18, '#ffc24a');
    // the sizes it would appear at in play
    blit(g, big, 400, 52, 3); frame(g, 394, 46, 108, 108);
    label(g, 'DIALOGUE', 448, 172, 12, '#a9c2cf');
    blit(g, big, 416, 200, 2); frame(g, 410, 194, 76, 76);
    label(g, 'SMALL', 448, 286, 12, '#a9c2cf');
    blit(g, personImg('lauri', md === 'lift' ? 'lift' : 'day'), 428, 310);
    label(g, 'IN THE WORLD', 448, 376, 12, '#a9c2cf');
    g.fillStyle = '#a9c2cf'; g.font = '500 17px "Chakra Petch", system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText('Natural keeps the photo colours. Lifted', 300, 430);
    g.fillText('brightens the darks so they don’t fade out.', 300, 454);
  }

  /* =====================================================================
     CUT SCENE (3 panels)
     ===================================================================== */
  const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
  function cutBackground(g, md, alpha = 1) {
    const sc = {
      map: [
        'TTTT.......TTTT',
        'TT...........TT',
        'T.............T',
        '..............,',
        '.,............T',
        'T.............T',
        'TT..,.........T',
        'TTT..........TT',
        'TTTT....,...TTT',
        'TTTTT......TTTT',
        'TTTTTTTTTTTTTTT',
        'TTTTTTTTTTTTTTT',
      ],
      people: [], buildings: [],
    };
    g.save(); g.globalAlpha = alpha;
    drawGround(g, sc, { tone: md, floor: 'sparse' });
    g.restore();
  }
  function drawBunting(g, md, sag) {
    const P = ART.PALETTE, row = ART.PROPS.bunting[0];
    for (let i = 0; i < row.length; i++) {
      const ch = row[i]; if (ch === '.') continue;
      const x = 100 + i * 11, y = 150 + Math.sin((i / row.length) * Math.PI) * (26 + sag);
      g.fillStyle = tone(P[ch], md);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8, y); g.lineTo(x + 4, y + 10); g.closePath(); g.fill();
    }
  }
  function crowd(g, md, hop, dazed) {
    const at = [['brendan', 150], ['folk', 205], ['queen', 280], ['kev', 355], ['folk', 410]];
    at.forEach(([id, x], i) => {
      const up = hop && (i % 2 === (hop % 2)) ? -8 : 0;
      if (id === 'queen' && dazed) return;
      blit(g, personImg(id, md, i > 2), x, 214 + up);
      if (dazed) stars(g, x + 20, 204, i);
    });
    // Bodge at the front
    // once everyone else is dazed, Bodge keeps his colour
    blit(g, bodgeImg('up', 0, md === 'gloom' && dazed ? 'day' : md), 280, 276);
  }
  function stars(g, cx, cy, i) {
    g.fillStyle = '#ffd34d';
    for (const [dx, dy] of [[-10, 0], [0, -6], [10, 0]]) {
      const x = cx + dx + (i % 2) * 2, y = cy + dy;
      g.fillRect(x - 1, y - 4, 2, 8); g.fillRect(x - 4, y - 1, 8, 2);
    }
  }
  function drawCut(now) {
    const g = prep(board, 600, 504);
    const c = S.cut, t = (now - c.t0) / 1000;
    const P = ART.PALETTE;
    if (c.i === 0) {
      cutBackground(g, 'day');
      blit(g, sprite(ART.PROPS.sun, P, 'day', false, 'sun'), 440, 36);
      drawBunting(g, 'day', 0);
      crowd(g, 'day', t < 1.6 ? Math.floor(t * 5) + 1 : 0, false);
      return t < 1.6;
    }
    if (c.i === 1) {
      const k = ease(t / 1.8);
      cutBackground(g, 'day', 1 - k);
      cutBackground(g, 'gloom', k);
      g.save(); g.globalAlpha = 1 - k * 0.85;
      blit(g, sprite(ART.PROPS.sun, P, 'day', false, 'sun'), 440, 36);
      g.restore();
      const md = k > 0.5 ? 'gloom' : 'day';
      drawBunting(g, md, k * 8);
      crowd(g, md, 0, false);
      const cl = sprite(ART.PROPS.cloud, P, 'day', false, 'cloud'), clF = sprite(ART.PROPS.cloud, P, 'day', true, 'cloudF');
      blit(g, cl, -120 + 380 * k, 30); blit(g, clF, 620 - 260 * k, 50);
      blit(g, cl, -200 + 300 * k, 80, 3); blit(g, clF, 640 - 400 * k, 20, 3);
      return t < 1.8;
    }
    // panel 3: Tori sweeps across with the Queen, then everyone is dazed
    cutBackground(g, 'gloom');
    const cl = sprite(ART.PROPS.cloud, P, 'gloom', false, 'cloudG');
    blit(g, cl, 120, 20); blit(g, cl, 330, 40); blit(g, cl, 40, 70, 3); blit(g, cl, 420, 70, 3);
    const k = ease(t / 1.6);
    const done = t >= 1.6;
    crowd(g, 'gloom', 0, done || k > 0.4);
    if (!done) {
      const x = 640 - 760 * k, y = 160 - Math.sin(k * Math.PI) * 110;
      blit(g, personImg('tori', 'day', true), x, y, 5);
      blit(g, personImg('queen', 'day'), x + 20, y + 50, 3);
    } else {
      // Bodge, the only one awake: an amber "!"
      g.fillStyle = '#ffc24a'; g.shadowColor = '#ffc24a'; g.shadowBlur = 10;
      g.fillRect(297, 238, 6, 18); g.fillRect(297, 261, 6, 6);
      g.shadowBlur = 0;
    }
    return !done;
  }
  function openCut(i) {
    S.mode = 'cut';
    showBoard();
    S.cut.i = i;
    S.cut.t0 = performance.now();
    showCutText();
    cancelAnimationFrame(S.cut.raf);
    const step = (now) => { if (S.mode !== 'cut') return; if (drawCut(now)) S.cut.raf = requestAnimationFrame(step); };
    S.cut.raf = requestAnimationFrame(step);
    if (i === 0 && !Music.on) Deck.toast('Tip: turn Music on from the menu');
    updateHud();
  }
  function showCutText() {
    const el = $('dialog');
    el.hidden = false;
    $('dialogWho').hidden = true;
    $('dialogFace').hidden = true;
    el.classList.remove('has-face');
    $('dialogText').textContent = CUT[S.cut.i].text;
    $('dialogMore').textContent = S.cut.i < CUT.length - 1 ? `${S.cut.i + 1}/${CUT.length} Pinch ▸` : `${CUT.length}/${CUT.length} Pinch ✓`;
  }

  /* =====================================================================
     DIALOGUE (with an optional portrait)
     ===================================================================== */
  function openDialog(lines, who, portrait) {
    S.dialog = { pages: lines, i: 0, who, portrait };
    showDialog();
    Music.blip('talk');
  }
  function showDialog() {
    const d = S.dialog, el = $('dialog');
    if (!d) { el.hidden = true; return; }
    el.hidden = false;
    $('dialogWho').hidden = false;
    $('dialogWho').textContent = d.who;
    $('dialogText').textContent = d.pages[d.i];
    $('dialogMore').textContent = d.i < d.pages.length - 1 ? 'Pinch ▸' : 'Pinch ✓';
    const face = $('dialogFace');
    el.classList.toggle('has-face', !!d.portrait);
    face.hidden = !d.portrait;
    if (d.portrait) {
      const g = prep(face, 96, 96);
      blit(g, portraitImg(d.portrait, S.lift ? 'lift' : 'day'), 0, 0, 3);
    }
    updateHud();
  }
  function nextDialog(all) {
    const d = S.dialog;
    if (!d) return;
    if (all || d.i >= d.pages.length - 1) { S.dialog = null; $('dialog').hidden = true; redraw(); }
    else { d.i += 1; showDialog(); }
  }

  /* =====================================================================
     MUSIC: a short original loop for the Queen's Wood (Web Audio, no files)
     ===================================================================== */
  const Music = (() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    let ctx = null, master = null, on = false, timer = null, nextT = 0, idx = 0;
    const BPM = 96, BEAT = 60 / BPM;
    const n = (m) => 440 * Math.pow(2, (m - 69) / 12);
    // 3/4 time, eight bars: G  C  D  G  Em  C  D  G
    const MELODY = [
      [74, 1.5], [71, 0.5], [67, 1],
      [76, 1], [74, 0.5], [72, 0.5], [76, 1],
      [74, 1.5], [72, 0.5], [69, 1],
      [71, 2], [67, 1],
      [79, 1.5], [78, 0.5], [76, 1],
      [76, 1], [72, 1], [76, 1],
      [74, 1], [69, 0.5], [71, 0.5], [72, 1],
      [71, 1], [67, 2],
    ];
    const CHORDS = [
      [43, [55, 59, 62]], [48, [55, 60, 64]], [50, [54, 57, 62]], [43, [55, 59, 62]],
      [52, [55, 59, 64]], [48, [55, 60, 64]], [50, [54, 57, 62]], [43, [55, 59, 62]],
    ];
    // flatten into timed events, one loop = 24 beats
    const EVENTS = [];
    let b = 0;
    for (const [m, len] of MELODY) { EVENTS.push({ at: b, f: n(m), len: len * BEAT * 0.92, type: 'triangle', vol: 0.11, att: 0.02 }); b += len; }
    CHORDS.forEach(([root, tones], bar) => {
      const at = bar * 3;
      EVENTS.push({ at, f: n(root), len: BEAT * 2.6, type: 'triangle', vol: 0.10, att: 0.01 });
      for (const beat of [1, 2]) for (const m of tones) EVENTS.push({ at: at + beat, f: n(m), len: BEAT * 0.5, type: 'sine', vol: 0.03, att: 0.01 });
    });
    EVENTS.sort((a, c) => a.at - c.at);
    const LOOP = 24;

    function voice(f, t, len, type, vol, att) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + att);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + len + 0.05);
    }
    function ensure() {
      if (!AC) return false;
      if (!ctx) { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination); }
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    // look ahead 0.4 s, wake every 0.2 s: light on battery, no glitches
    function pump() {
      const ahead = ctx.currentTime + 0.4;
      while (true) {
        const loopN = Math.floor(idx / EVENTS.length), e = EVENTS[idx % EVENTS.length];
        const t = nextT + (loopN * LOOP + e.at) * BEAT;
        if (t > ahead) break;
        if (t > ctx.currentTime - 0.05) voice(e.f, t, e.len, e.type, e.vol, e.att);
        idx += 1;
      }
      timer = setTimeout(pump, 200);
    }
    function start() {
      if (!ensure()) return false;
      on = true; idx = 0; nextT = ctx.currentTime + 0.1;
      clearTimeout(timer); pump();
      return true;
    }
    function stop() { on = false; clearTimeout(timer); }
    const BLIPS = { step: [190, 0.03, 0.03], pick: [660, 0.06, 0.05], talk: [520, 0.05, 0.04] };
    return {
      supported: !!AC,
      get on() { return on; },
      toggle() { if (on) stop(); else start(); Deck.store.set(MUSIC_KEY, on); return on; },
      blip(name) {
        if (!on || !BLIPS[name]) return;
        const [f, len, vol] = BLIPS[name];
        voice(f, ctx.currentTime + 0.01, len, 'triangle', vol, 0.005);
      },
      pause() { if (on) { clearTimeout(timer); if (ctx) ctx.suspend(); } },
      resume() { if (on && ctx) { ctx.resume().then(() => { idx = 0; nextT = ctx.currentTime + 0.1; clearTimeout(timer); pump(); }); } },
    };
  })();

  /* =====================================================================
     SCREENS, HUD, INPUT
     ===================================================================== */
  const menuView = $('menuView');
  function showBoard() { menuView.hidden = true; board.hidden = false; Guard.arm(); }
  function showMenu() {
    cancelAnimationFrame(S.cut.raf);
    S.mode = 'menu'; S.dialog = null;
    $('dialog').hidden = true;
    board.hidden = true; menuView.hidden = false;
    syncMusicButton();
    updateHud();
    // back to the button you opened, so the next swipe goes on from there
    Deck.focus(lastBtn || menuButtons()[0]);
  }
  function menuButtons() { return [...menuView.querySelectorAll('.focusable')]; }
  function syncMusicButton() {
    const b = $('btnMusic');
    b.querySelector('.key-label').textContent = Music.supported ? `Music: ${Music.on ? 'On' : 'Off'}` : 'Music: n/a';
    b.classList.toggle('key-speak', Music.on);
  }

  let drawQueued = false;
  function redraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => {
      drawQueued = false;
      if (S.mode === 'wood' || S.mode === 'village') drawWorld();
      else if (S.mode === 'bodge') drawBodgeScreen();
      else if (S.mode === 'lauri') drawLauriScreen();
      updateHud();
    });
  }

  function updateHud() {
    const titles = { menu: 'Look test', wood: "Queen's Wood", village: 'Bamber village', bodge: 'Bodge', lauri: 'Lauri', cut: 'Cut scene' };
    let sub = '';
    if (S.mode === 'wood' || S.mode === 'village') sub = LOOKS[S.look].name;
    else if (S.mode === 'bodge') sub = ART.BODGE_SCHEMES[S.scheme].name;
    else if (S.mode === 'lauri') sub = S.lift ? 'Lifted' : 'Natural';
    else if (S.mode === 'cut') sub = `Panel ${S.cut.i + 1} of ${CUT.length}`;
    Deck.title(titles[S.mode], sub);
    if (S.mode === 'menu') Deck.hints([['Swipe', 'move'], ['Pinch', 'open'], ['Back', 'hub']]);
    else if (S.dialog) Deck.hints([['Pinch', 'next'], ['Back', 'close']]);
    else if (S.mode === 'wood' || S.mode === 'village') Deck.hints([['Swipe', 'walk'], ['Pinch', facing() ? 'talk' : 'next look'], ['Back', 'menu']]);
    else if (S.mode === 'bodge') Deck.hints([['Pinch', 'next colours'], ['Back', 'menu']]);
    else if (S.mode === 'lauri') Deck.hints([['Pinch', S.lift ? 'natural' : 'lifted'], ['Back', 'menu']]);
    else if (S.mode === 'cut') Deck.hints([['Pinch', S.cut.i < CUT.length - 1 ? 'next' : 'done'], ['Back', 'skip']]);
  }

  let lastBtn = null;
  function menuSelect(btn) {
    Deck.press(btn);
    lastBtn = btn;
    const go = btn.dataset.go;
    if (go === 'music') {
      if (!Music.supported) { Deck.toast('Sound is not available here'); return; }
      Music.toggle(); syncMusicButton(); return;
    }
    if (go === 'wood' || go === 'village') enterWorld(go);
    else if (go === 'cut') openCut(0);
    else { S.mode = go; showBoard(); redraw(); }
  }

  /* ---------- Back: one spare history entry, as in the game ---------- */
  const Guard = {
    on: false, timer: null,
    arm() {
      clearTimeout(this.timer);
      if (this.on) return;
      this.timer = setTimeout(() => {
        if (this.on || S.mode === 'menu') return;
        try { history.pushState({ bamberlandLook: 1 }, ''); this.on = true; } catch { /* history blocked */ }
      }, 60);
    },
  };
  let lastBack = 0;
  function doBack() {
    const now = Date.now();
    if (now - lastBack < 200) return;
    lastBack = now;
    if (S.mode === 'menu') { if (!Deck.toHub()) Deck.bump(document.activeElement); return; }
    if (S.dialog) { nextDialog(true); Guard.arm(); return; }
    showMenu();
  }
  function onPopState(e) {
    if (e.state && e.state.bamberlandLook) { Guard.on = true; return; }
    if (!Guard.on) return;
    Guard.on = false;
    doBack();
  }

  function onKey(e) {
    const a = Deck.action(e);
    if (!a) return;
    e.preventDefault();
    if (e.repeat && (a === 'select' || a === 'back')) return;
    if (a === 'back') { doBack(); return; }

    if (S.mode === 'menu') {
      const cur = document.activeElement, items = menuButtons();
      if (a === 'select') { if (items.includes(cur)) menuSelect(cur); else Deck.focus(items[0]); return; }
      if (!items.includes(cur)) { Deck.focus(items[0]); return; }
      const next = Deck.nearest(items, cur, a);
      if (next) Deck.focus(next); else Deck.bump(cur);
      return;
    }
    if (S.dialog) { if (a === 'select') nextDialog(false); return; }
    if (S.mode === 'cut') {
      if (a !== 'select') return;
      if (S.cut.i < CUT.length - 1) openCut(S.cut.i + 1);
      else showMenu();
      return;
    }
    if (S.mode === 'wood' || S.mode === 'village') {
      if (a === 'select') worldPinch(); else worldMove(a);
      return;
    }
    if (a !== 'select') return;
    if (S.mode === 'bodge') { S.scheme = (S.scheme + 1) % ART.BODGE_SCHEMES.length; cache.clear(); remember(); Music.blip('pick'); redraw(); }
    else if (S.mode === 'lauri') { S.lift = !S.lift; remember(); Music.blip('pick'); redraw(); }
  }

  function init() {
    document.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPopState);
    Guard.on = !!(history.state && history.state.bamberlandLook);
    menuView.addEventListener('click', (e) => { const b = e.target.closest('.focusable'); if (b) menuSelect(b); });
    // Glasses screen off or app hidden: stop the music clock, carry on when back
    document.addEventListener('visibilitychange', () => (document.hidden ? Music.pause() : Music.resume()));
    Deck.status('', '');
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
    showMenu();
  }
  init();
})();
