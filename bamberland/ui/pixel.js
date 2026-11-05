/* ==========================================================================
   Bamberland — pixel drawing shared by the world, dialogue and cut scenes.
   The art itself is text grids in data/art.js. Each art pixel is drawn
   4 × 4 screen pixels, so a 10 × 10 grid fills one 40 px tile.

   Tones: 'day' (restored colour), 'gloom' (a region under Tori's spell),
   'hurt' (a red flash).
   ========================================================================== */
(() => {
  'use strict';
  const ART = window.BAMBER_ART;
  const PX = 4, T = 40, W = 15, H = 12, OY = 12;

  /* ---------- colour ---------- */
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  function tone(h, mode) {
    if (!mode || mode === 'day') return h;
    let [r, g, b] = hex(h);
    if (mode === 'gloom') {
      // most of the colour drains out, it cools to blue-grey and dims
      const l = 0.3 * r + 0.59 * g + 0.11 * b;
      r = (l * 0.7 + r * 0.3) * 0.72; g = (l * 0.7 + g * 0.3) * 0.82; b = (l * 0.7 + b * 0.3) * 1.05;
      return toHex([r * 0.62, g * 0.62, b * 0.62]);
    }
    if (mode === 'hurt') return toHex([r * 0.4 + 255 * 0.6, g * 0.4 + 70 * 0.6, b * 0.4 + 90 * 0.6]);
    return h;
  }

  /* ---------- sprite cache: text grid → small canvas ---------- */
  const cache = new Map();
  function sprite(rows, pal, mode = 'day', flip = false, id = '') {
    const k = id + '|' + mode + '|' + (flip ? 1 : 0);
    if (id && cache.has(k)) return cache.get(k);
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
    if (id) cache.set(k, c);
    return c;
  }
  function blit(g, img, x, y, scale = PX) {
    g.imageSmoothingEnabled = false;
    g.shadowBlur = 0;               // pixel art never glows
    g.drawImage(img, Math.round(x), Math.round(y), img.width * scale, img.height * scale);
  }

  // Find any picture by name, in any art group
  function art(name, mode = 'day', flip = false) {
    for (const group of ['SPRITES', 'PROPS', 'BUILDINGS', 'OBJECTS', 'TILES']) {
      const rows = ART[group] && ART[group][name];
      if (rows && Array.isArray(rows)) return sprite(rows, ART.PALETTE, mode, flip, group + ':' + name);
    }
    if (ART.PORTRAITS[name]) {
      const pal = (ART.PORTRAIT_PALETTES && ART.PORTRAIT_PALETTES[name]) || ART.PORTRAIT_PALETTE;
      return sprite(ART.PORTRAITS[name], pal, mode, flip, 'portrait:' + name);
    }
    return null;
  }

  // A friend's dialogue portrait (never their world sprite, which may share the name)
  function portrait(name, mode = 'day') {
    if (!ART.PORTRAITS[name]) return null;
    const pal = (ART.PORTRAIT_PALETTES && ART.PORTRAIT_PALETTES[name]) || ART.PORTRAIT_PALETTE;
    return sprite(ART.PORTRAITS[name], pal, mode, false, 'portrait:' + name);
  }

  function bodge(face = 'down', step = 0, mode = 'day', scheme = 0) {
    const sch = ART.BODGE_SCHEMES[scheme] || ART.BODGE_SCHEMES[0];
    const base = face === 'right' ? 'left' : face;
    const name = 'bodge_' + base + (step % 2 ? '2' : '');
    return sprite(ART.SPRITES[name], { ...ART.PALETTE, ...sch }, mode, face === 'right', name + '#' + scheme);
  }

  /* ---------- canvas ---------- */
  function prep(canvas, w, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.imageSmoothingEnabled = false;
    g.shadowBlur = 0; g.globalAlpha = 1;
    g.lineCap = 'round'; g.lineJoin = 'round';
    return g;
  }

  // small seeded random, so the grass doesn't shimmer between redraws
  function rnd(x, y, n) { const s = Math.sin(x * 127.1 + y * 311.7 + n * 74.7) * 43758.5453; return s - Math.floor(s); }

  /* ---------- ground ----------
     look(x, y) gives the ground letter: . grass  , flowers  : path  ~ water
     T tree  * bush  f fence  % brambles.
     Restored regions draw a filled floor; the gloom draws a sparse one
     (tufts and pebbles on see-through black), as chosen in the look test. */
  function ground(g, look, md, alpha = 1) {
    const filled = md !== 'gloom';
    const P = ART.PALETTE;
    const col = (k) => tone(P[k], md);
    const fill = { grass: tone('#2c6a28', md), path: tone('#7d6142', md), water: tone('#1f69a8', md) };
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 'T' : look(x, y));
    g.save();
    g.shadowBlur = 0;
    g.globalAlpha = alpha;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = at(x, y), X = x * T, Y = OY + y * T;
      const isPath = t === ':', isWater = t === '~';
      if (filled) {
        g.fillStyle = isPath ? fill.path : isWater ? fill.water : fill.grass;
        g.fillRect(X, Y, T, T);
      }
      if (isPath) {
        for (let i = 0; i < 4; i++) {
          g.fillStyle = col(i % 2 ? 'p' : 'P');
          g.fillRect(X + Math.floor(rnd(x, y, i) * 9) * PX, Y + Math.floor(rnd(x, y, i + 9) * 9) * PX, PX, PX);
        }
        if (!filled) {
          g.fillStyle = col('P');
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            if (at(x + dx, y + dy) === ':') continue;
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
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = at(x, y), X = x * T, Y = OY + y * T;
      if (t === 'T') blit(g, sprite(ART.TILES.tree, P, md, (x + y) % 3 === 0, 'tree'), X, Y);
      else if (t === '*') blit(g, sprite(ART.TILES.bush, P, md, false, 'bush'), X, Y);
      else if (t === 'f') blit(g, sprite(ART.TILES.fence, P, md, false, 'fence'), X, Y);
      else if (t === '%') blit(g, sprite(ART.OBJECTS.thorns, P, md, false, 'thorns'), X, Y);
    }
    g.restore();
  }

  window.BamberPixel = { PX, T, W, H, OY, tone, sprite, blit, art, portrait, bodge, prep, ground, rnd, clear: () => cache.clear() };
})();
