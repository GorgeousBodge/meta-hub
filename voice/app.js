/* ==========================================================================
   Voice check — find out which kind of speech the glasses will actually play.

   Pinch each test and listen. Each one shows what the speech engine reported
   (finished / error / never started). When one you can HEAR works, pinch
   "Use last test": every Deck app then speaks that way (saved on the glasses,
   shared by all apps). The audio tests show whether the glasses can play
   sound files, which decides whether natural cloud voices are possible.
   ========================================================================== */
(() => {
  'use strict';

  const PHRASE = 'This is a voice check from Deck. If you can hear this, pinch Use last test.';
  const LONG = 'This is a longer passage, the length of a news briefing or a short email. ' +
    'Deck splits long text into short sentences, because the glasses only promise to speak concise content. ' +
    'If this whole passage plays, long reading will work. If it stops early, tell me where it stopped. ' +
    'That is the end of the test.';

  const list = document.getElementById('list');
  const info = document.getElementById('info');
  let lastSpeech = null;   // { label, profile } of the last speech test run

  const esc = Deck.esc;

  function showInfo() {
    const v = Deck.speech.voices();
    const p = Deck.speech.profile;
    info.innerHTML =
      `Speech engine: <b>${Deck.canSpeak ? 'present' : 'missing'}</b> · voices listed: <b>${v.length}</b> · in use: <b>${esc(p.label || 'Default')}</b>`;
  }

  function card(title, meta, run) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card focusable';
    b.innerHTML = '<span class="card-title"></span><span class="card-meta"></span>';
    b.querySelector('.card-title').textContent = title;
    b.querySelector('.card-meta').textContent = meta;
    b._select = () => run(b);
    return b;
  }
  const setResult = (b, text, cls) => {
    const m = b.querySelector('.card-meta');
    m.textContent = text;
    m.className = `card-meta ${cls || ''}`;
  };
  const sec = (t) => { const d = document.createElement('div'); d.className = 'vc-sec'; d.textContent = t; return d; };

  // A speech test: speak with this profile, report what the engine said
  function speechTest(label, profile, text = PHRASE) {
    return card(label, profile.lang || profile.voice ? [profile.lang, profile.rate !== 1 && profile.rate ? `rate ${profile.rate}` : ''].filter(Boolean).join(' · ') || 'Voice' : 'Tap to test', (b) => {
      Deck.hush();
      lastSpeech = { label, profile: { ...profile, label } };
      setResult(b, 'Speaking…', 'wait');
      const before = Deck.speech.log.length;
      const ok = Deck.say(text, {
        profile: { lang: '', voice: '', rate: 1, ...profile, label },
        onend: (done) => {
          const ev = Deck.speech.log.slice(before);
          const started = ev.some((e) => e.ev === 'start');
          const fail = ev.find((e) => e.ev === 'fail');
          if (done) setResult(b, started ? 'Engine: finished · did you hear it?' : 'Engine: finished (no start event) · heard it?', 'ok');
          else setResult(b, `Engine: ${fail && fail.error === 'no-start' ? 'never started' : `error ${fail ? fail.error : ''}`}`, 'bad');
        },
      });
      if (!ok) setResult(b, 'Not available here', 'bad');
    });
  }

  // A short tone as a WAV file, made on the glasses (no download needed)
  function toneWav(seconds = 0.6, freq = 660) {
    const rate = 16000;
    const n = Math.floor(rate * seconds);
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const fade = Math.min(1, i / 400, (n - i) / 400);
      v.setInt16(44 + i * 2, Math.sin((2 * Math.PI * freq * i) / rate) * 12000 * fade, true);
    }
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }

  function audioFileTest() {
    return card('Sound file (audio element)', 'A short tone · needed for cloud voices', (b) => {
      Deck.hush();
      setResult(b, 'Playing…', 'wait');
      try {
        const a = new Audio(toneWav());
        a.onended = () => setResult(b, 'Played to the end · did you hear a tone?', 'ok');
        a.onerror = () => setResult(b, `Error ${a.error ? a.error.code : ''}`, 'bad');
        const p = a.play();
        if (p && p.catch) p.catch((e) => setResult(b, `Blocked: ${e.name || e.message}`, 'bad'));
      } catch (e) { setResult(b, `Failed: ${e.message}`, 'bad'); }
    });
  }

  function webAudioTest() {
    return card('Tone (Web Audio)', 'Another way apps play sound', (b) => {
      Deck.hush();
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { setResult(b, 'Not available', 'bad'); return; }
        const ctx = new AC();
        const go = () => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.frequency.value = 520;
          g.gain.setValueAtTime(0.0001, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.05);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
          o.connect(g).connect(ctx.destination);
          o.start(); o.stop(ctx.currentTime + 0.65);
          o.onended = () => { setResult(b, `Played (${ctx.state}) · did you hear a tone?`, 'ok'); ctx.close(); };
        };
        setResult(b, `Playing… (${ctx.state})`, 'wait');
        if (ctx.state === 'suspended') ctx.resume().then(go, (e) => setResult(b, `Blocked: ${e.message}`, 'bad')); else go();
      } catch (e) { setResult(b, `Failed: ${e.message}`, 'bad'); }
    });
  }

  function render() {
    const items = [
      sec('Speech'),
      speechTest('Plain (no language set)', {}),
      speechTest('English UK', { lang: 'en-GB' }),
      speechTest('English US', { lang: 'en-US' }),
      speechTest('Plain, a little faster', { rate: 1.1 }),
    ];
    const voices = Deck.speech.voices().filter((v) => /^en/i.test(v.lang || '')).slice(0, 8);
    if (voices.length) {
      items.push(sec('Voices on the glasses'));
      for (const v of voices) items.push(speechTest(v.name, { voice: v.voiceURI || v.name, lang: v.lang }));
    }
    items.push(sec('Long text'), speechTest('Long passage (in use setting)', { ...Deck.speech.profile, label: '' }, LONG));
    items.push(sec('Sound'), audioFileTest(), webAudioTest());
    list.replaceChildren(...items);
    showInfo();
  }

  /* ---------- keys ---------- */
  const useBtn = document.getElementById('useBtn');
  const resetBtn = document.getElementById('resetBtn');
  useBtn._select = () => {
    if (!lastSpeech) { Deck.toast('Test a speech option first', { error: true }); return; }
    Deck.speech.setProfile(lastSpeech.profile);
    showInfo();
    Deck.toast(`All apps now use: ${lastSpeech.label}`);
    Deck.say('Saved. All Deck apps will use this voice.');
  };
  resetBtn._select = () => { Deck.speech.resetProfile(); showInfo(); Deck.toast('Back to the default'); };

  const focusables = () => [...document.querySelectorAll('#list .focusable, .vc-keys .focusable')];
  document.addEventListener('keydown', (e) => {
    const a = Deck.action(e);
    if (!a) return;
    e.preventDefault();
    const cur = document.activeElement;
    const items = focusables();
    if (a === 'select') { if (!e.repeat && cur && cur._select) { Deck.press(cur); cur._select(); } return; }
    if (a === 'back') { Deck.hush(); if (!Deck.toHub()) Deck.bump(cur); return; }
    if (!items.includes(cur)) { Deck.focus(items[0]); return; }
    const next = Deck.nearest(items, cur, a);
    if (next) Deck.focus(next); else Deck.bump(cur);
  });
  document.addEventListener('keyup', (e) => { if (e.key === ' ') e.preventDefault(); });
  document.addEventListener('click', (e) => { const b = e.target.closest('.focusable'); if (b && b._select) b._select(); });

  Deck.status(Deck.canSpeak ? 'live' : 'offline', Deck.canSpeak ? 'Ready' : 'No speech');
  Deck.hints([['Pinch', 'test'], ['Listen', 'then save'], ['Back', 'hub']]);
  render();
  Deck.focus(list.querySelector('.focusable'));
  // Voice lists often arrive a moment later
  if (Deck.canSpeak && speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', () => { const f = document.activeElement; render(); if (f && f.isConnected) f.focus(); });
})();
