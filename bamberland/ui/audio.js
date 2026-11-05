/* ==========================================================================
   Bamberland — sound effects and the music player (Web Audio, no files).
   Effects and music have separate on/off settings, both off to start.
   Sound never carries anything that isn't also on screen.
   The tunes are data in data/music.js.
   ========================================================================== */
(() => {
  'use strict';
  const Deck = window.Deck;
  const AC = window.AudioContext || window.webkitAudioContext;
  const SOUND_KEY = 'bamberland.sound';
  const MUSIC_KEY = 'bamberland.music';
  let ctx = null, master = null;
  function audio() {
    if (!AC) return null;
    try {
      if (!ctx) { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination); }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch { return null; }
  }
  function voice(f, t, len, type, vol, att) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + len + 0.05);
  }

  /* ---------- effects ---------- */
  const NOTES = {
    step: [[180, 0.03, 'triangle', 0.04]],
    swish: [[260, 0.05, 'triangle', 0.05]],
    hit: [[320, 0.05, 'square', 0.06], [180, 0.06, 'square', 0.05]],
    clang: [[900, 0.04, 'square', 0.04], [700, 0.06, 'square', 0.03]],
    hurt: [[200, 0.08, 'sawtooth', 0.07], [120, 0.1, 'sawtooth', 0.06]],
    pickup: [[660, 0.06, 'triangle', 0.06], [990, 0.08, 'triangle', 0.06]],
    coin: [[988, 0.05, 'square', 0.04], [1319, 0.09, 'square', 0.04]],
    pop: [[880, 0.04, 'sine', 0.06], [440, 0.06, 'sine', 0.05]],
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
    talk: [[520, 0.05, 'triangle', 0.04]],
    pick: [[660, 0.05, 'triangle', 0.05]],
  };
  const Sound = {
    supported: !!AC,
    on: !!(AC && Deck.store.get(SOUND_KEY, false)),
    toggle() {
      if (!AC) return false;
      this.on = !this.on;
      Deck.store.set(SOUND_KEY, this.on);
      if (this.on) this.play('pickup');
      return this.on;
    },
    play(name) {
      if (!this.on || !NOTES[name] || !audio()) return;
      try {
        let t = ctx.currentTime;
        for (const [freq, dur, type, vol] of NOTES[name]) { voice(freq, t, dur, type, vol, 0.004); t += dur * 0.9; }
      } catch { this.on = false; }
    },
  };

  /* ---------- music ---------- */
  const n = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // Turn a tune from data/music.js into timed notes, one loop long
  function compile(tune) {
    const beat = 60 / tune.bpm, events = [];
    let b = 0;
    for (const [m, len] of tune.melody) {
      if (m) events.push({ at: b, f: n(m), len: len * beat * 0.92, type: 'triangle', vol: 0.11, att: 0.02 });
      b += len;
    }
    tune.chords.forEach(([root, tones], bar) => {
      const at = bar * tune.bar;
      events.push({ at, f: n(root), len: beat * (tune.bar - 0.4), type: 'triangle', vol: 0.10, att: 0.01 });
      for (const c of tune.comp || []) for (const m of tones) {
        events.push({ at: at + c - 1, f: n(m), len: beat * 0.5, type: 'sine', vol: 0.03, att: 0.01 });
      }
    });
    events.sort((a, c) => a.at - c.at);
    return { beat, events, loop: tune.chords.length * tune.bar };
  }
  const Music = {
    supported: !!AC,
    on: !!(AC && Deck.store.get(MUSIC_KEY, false)),
    tune: null,        // the tune that should play here
    _playing: null, _timer: null, _start: 0, _i: 0, _c: null,
    toggle() {
      if (!AC) return false;
      this.on = !this.on;
      Deck.store.set(MUSIC_KEY, this.on);
      if (this.on) this._go(); else this._stop();
      return this.on;
    },
    // Ask for a tune; it only restarts if it's a different one
    play(id) {
      if (id === undefined) return;
      this.tune = id;
      if (this.on && this._playing !== id) this._go();
    },
    _stop() { clearTimeout(this._timer); this._playing = null; },
    _go() {
      this._stop();
      const tune = (window.BAMBER_MUSIC || {})[this.tune];
      if (!tune || !audio()) return;
      this._c = compile(tune);
      this._playing = this.tune;
      this._start = ctx.currentTime + 0.15;
      this._i = 0;
      this._pump();
    },
    // look ahead 0.4 s, wake every 0.2 s: light on battery, no glitches
    _pump() {
      const c = this._c, ahead = ctx.currentTime + 0.4;
      while (true) {
        const loopN = Math.floor(this._i / c.events.length), e = c.events[this._i % c.events.length];
        const t = this._start + (loopN * c.loop + e.at) * c.beat;
        if (t > ahead) break;
        if (t > ctx.currentTime - 0.05) voice(e.f, t, e.len, e.type, e.vol, e.att);
        this._i += 1;
      }
      this._timer = setTimeout(() => this._pump(), 200);
    },
    pause() { clearTimeout(this._timer); if (ctx) ctx.suspend(); },
    resume() {
      if (!ctx) return;
      ctx.resume().then(() => { if (this.on && this._playing) { this._playing = null; this._go(); } });
    },
  };

  window.BamberAudio = { Sound, Music };
})();
