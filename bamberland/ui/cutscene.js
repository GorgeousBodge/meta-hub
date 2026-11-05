/* ==========================================================================
   Bamberland — the cut-scene player. Scenes are data in data/cutscenes.js.
   Battery: a panel animates only for its "dur" seconds, then holds still.
   ========================================================================== */
(() => {
  'use strict';
  const Px = window.BamberPixel;
  const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
  const lerp = (v, k) => (Array.isArray(v) ? v[0] + (v[v.length - 1] - v[0]) * k : v);

  let S = null;   // { canvas, scene, i, t0, raf, cap }

  function groundMap(name) {
    const maps = (window.BAMBER_CUTS || {}).maps || {};
    const rows = Array.isArray(name) ? name : maps[name] || maps.meadow;
    return (x, y) => (rows[y] && rows[y][x]) || 'T';
  }

  function drawPanel(now) {
    const p = S.scene.panels[S.i];
    const g = Px.prep(S.canvas, 600, 504);
    const t = (now - S.t0) / 1000, dur = p.dur || 1;
    const k = ease(t / dur);
    // ground: one tone, or a fade from one to the other
    const gr = p.ground || {};
    const look = groundMap(gr.map);
    let sceneTone = 'day';
    if (Array.isArray(gr.tone)) {
      Px.ground(g, look, gr.tone[0], 1 - k);
      Px.ground(g, look, gr.tone[1], k);
      sceneTone = k > 0.5 ? gr.tone[1] : gr.tone[0];
    } else if (gr.map || gr.tone) {
      sceneTone = gr.tone || 'day';
      Px.ground(g, look, sceneTone);
    }
    let hopN = t < dur ? Math.floor(t * 5) + 1 : 0;
    for (const L of p.layers || []) {
      if (L.show && (t < L.show[0] || (L.show[1] != null && t >= L.show[1]))) continue;
      const md = L.tone || sceneTone;
      if (L.bunting) { bunting(g, md, lerp(L.sag || 0, k)); continue; }
      if (L.bang) { bang(g, L.x, L.y); continue; }
      // dancing: turn left and right on the beat while the panel moves
      const spin = L.dance && t < dur ? Math.floor(t * 2.2) % 2 === 1 : false;
      const img = L.art === 'hero' ? Px.bodge(L.face || 'down', 0, md, S.cap) : Px.art(L.art, md, !!L.flip !== spin);
      if (!img) continue;
      const scale = L.scale || Px.PX;
      let x = lerp(L.x, k), y = lerp(L.y, k);
      if (L.arc) y -= Math.sin(k * Math.PI) * L.arc;
      if (L.hop != null && hopN && hopN % 2 === L.hop % 2) y -= 8;
      if (L.dance && t < dur && Math.floor(t * 4.4) % 2 === 0) y -= 10;
      if (L.rays) rays(g, x + (img.width * scale) / 2, y + (img.height * scale) / 2, t);
      g.save();
      g.globalAlpha = L.alpha != null ? lerp(L.alpha, k) : 1;
      Px.blit(g, img, x, y, scale);
      g.restore();
      if (L.stars && (t >= dur * 0.4)) stars(g, x + (img.width * scale) / 2, y - 10, x);
    }
    return t < dur;
  }

  function bunting(g, md, sag) {
    const ART = window.BAMBER_ART, row = ART.PROPS.bunting[0];
    for (let i = 0; i < row.length; i++) {
      const ch = row[i]; if (ch === '.') continue;
      const x = 100 + i * 11, y = 150 + Math.sin((i / row.length) * Math.PI) * (26 + sag);
      g.fillStyle = Px.tone(ART.PALETTE[ch], md);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8, y); g.lineTo(x + 4, y + 10); g.closePath(); g.fill();
    }
  }
  function stars(g, cx, cy, seed) {
    g.fillStyle = '#ffd34d';
    const o = Math.round(seed) % 2 ? 2 : 0;
    for (const [dx, dy] of [[-10, 0], [0, -6], [10, 0]]) {
      const x = cx + dx + o, y = cy + dy;
      g.fillRect(x - 1, y - 4, 2, 8); g.fillRect(x - 4, y - 1, 8, 2);
    }
  }
  function bang(g, x, y) {
    g.fillStyle = '#ffc24a'; g.shadowColor = '#ffc24a'; g.shadowBlur = 10;
    g.fillRect(x, y, 6, 18); g.fillRect(x, y + 23, 6, 6);
    g.shadowBlur = 0;
  }
  function rays(g, cx, cy, t) {
    g.save();
    g.strokeStyle = 'rgba(255,211,77,0.45)'; g.lineWidth = 4;
    const spin = Math.min(t, 3) * 0.4;
    for (let i = 0; i < 10; i++) {
      const a = spin + (i / 10) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30);
      g.lineTo(cx + Math.cos(a) * 52, cy + Math.sin(a) * 52);
      g.stroke();
    }
    g.restore();
  }

  function run() {
    cancelAnimationFrame(S.raf);
    S.t0 = performance.now();
    const step = (now) => { if (!S) return; if (drawPanel(now)) S.raf = requestAnimationFrame(step); };
    S.raf = requestAnimationFrame(step);
    if (S.onPanel) S.onPanel(S.scene.panels[S.i], S.i, S.scene.panels.length);
  }

  window.BamberCut = {
    get playing() { return !!S; },
    // Start a scene. onPanel(panel, index, count) shows its text.
    start(canvas, scene, { cap = 0, onPanel } = {}) {
      if (!scene || !scene.panels || !scene.panels.length) return false;
      S = { canvas, scene, i: 0, t0: 0, raf: 0, cap, onPanel };
      run();
      return true;
    },
    // Next panel. Returns false when the scene has finished.
    next() {
      if (!S) return false;
      if (S.i >= S.scene.panels.length - 1) { this.stop(); return false; }
      S.i += 1;
      run();
      return true;
    },
    stop() { if (S) cancelAnimationFrame(S.raf); S = null; },
    // Redraw the current frame (after a font load or a resize)
    redraw() { if (S) drawPanel(performance.now()); },
  };
})();
