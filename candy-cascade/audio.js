'use strict';
/* Candy Cascade — tiny WebAudio synth. No assets, all bleeps. */
const CCAudio = (() => {
  let ctx = null, master = null, muted = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch (e) { return false; }
  }

  function tone(freq, dur, type, vol, when, slideTo) {
    if (muted || !ensure()) return;
    const t0 = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  const api = {
    unlock() { ensure(); },
    setMuted(m) { muted = !!m; },
    isMuted: () => muted,
    select()   { tone(620, 0.07, 'sine', 0.18); },
    swap()     { tone(300, 0.09, 'triangle', 0.22, 0, 520); },
    invalid()  { tone(220, 0.12, 'sine', 0.16, 0, 170); }, // soft bonk — never punish with harsh sounds
    pop(round) {
      const base = 480 + Math.min(round, 6) * 90;
      tone(base, 0.12, 'sine', 0.28, 0, base * 1.6);
      tone(base * 1.5, 0.10, 'triangle', 0.14, 0.03);
    },
    special()  { [660, 830, 990].forEach((f, i) => tone(f, 0.12, 'triangle', 0.2, i * 0.06)); },
    // per-special creation stingers: each special gets its own little fanfare
    stripedCreated() { tone(700, 0.10, 'triangle', 0.22, 0, 1050); tone(1050, 0.14, 'sine', 0.18, 0.07); },
    wrappedCreated() { tone(300, 0.14, 'triangle', 0.24, 0, 450); tone(150, 0.22, 'sine', 0.20, 0.05, 90); },
    colorBombCreated() { [880, 1108, 1318, 1568, 2093].forEach((f, i) => tone(f, 0.10, 'sine', 0.16, i * 0.05)); },
    bigBlast() { tone(120, 0.30, 'sawtooth', 0.18, 0, 50); tone(800, 0.25, 'triangle', 0.16, 0.03, 200); },
    chocGrow() { tone(140, 0.16, 'square', 0.10, 0, 90); tone(90, 0.22, 'sine', 0.14, 0.08, 60); },
    chocGone() { tone(500, 0.10, 'triangle', 0.20, 0, 900); },
    spinTick() { tone(1200, 0.03, 'square', 0.06); },
    jelly()    { tone(920, 0.09, 'sine', 0.16, 0, 1400); },
    frost()    { tone(240, 0.08, 'square', 0.10, 0, 180); tone(1900, 0.06, 'sine', 0.08, 0.02); },
    shuffle()  { [400, 500, 600, 700].forEach((f, i) => tone(f, 0.08, 'sine', 0.14, i * 0.05)); },
    win()      { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.22, 'triangle', 0.24, i * 0.11)); },
    lose()     { [330, 294, 262, 220].forEach((f, i) => tone(f, 0.28, 'sine', 0.14, i * 0.18)); }, // gentle deflate, not a scolding
    click()    { tone(700, 0.05, 'sine', 0.15); },
    hammer()   { tone(140, 0.18, 'square', 0.3, 0, 60); tone(1200, 0.3, 'triangle', 0.2, 0.05, 2400); },
    sugar()    { [660, 830, 990, 1174, 1318, 1568].forEach((f, i) => tone(f, 0.16, 'sine', 0.2, i * 0.08)); },
    hint()     { tone(880, 0.12, 'sine', 0.12, 0, 1320); },
  };

  /* ---- generative music box: soft pentatonic plucks, intensifies when moves run low ---- */
  let musicOn = false, intense = false, mStep = 0, mTimer = null;
  const MEL = [523.25, 587.33, 659.25, 783.99, 880.0, 783.99, 659.25, 587.33,
               523.25, 659.25, 783.99, 880.0, 1046.5, 880.0, 783.99, 659.25];
  const BASSN = [130.81, 98.0, 110.0, 146.83];
  function musicTick() {
    if (!musicOn) return;
    if (!muted && ensure()) {
      const s = mStep % 16;
      if (s % 2 === 0) tone(MEL[s], 0.5, 'triangle', 0.055, 0);
      if (s % 8 === 0) tone(BASSN[(mStep / 8 | 0) % 4], 1.2, 'sine', 0.07, 0);
      if (intense && s % 2 === 1) tone(MEL[(s + 4) % 16] * 2, 0.2, 'sine', 0.03, 0);
    }
    mStep++;
    mTimer = setTimeout(musicTick, intense ? 165 : 250);
  }
  api.music = function (on) {
    if (on && !musicOn) { musicOn = true; mStep = 0; musicTick(); }
    else if (!on && musicOn) { musicOn = false; clearTimeout(mTimer); mTimer = null; }
  };
  api.setIntensity = function (low) { intense = !!low; };
  return api;
})();
