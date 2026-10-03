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
    invalid()  { tone(160, 0.14, 'sawtooth', 0.14, 0, 110); },
    pop(round) {
      const base = 480 + Math.min(round, 6) * 90;
      tone(base, 0.12, 'sine', 0.28, 0, base * 1.6);
      tone(base * 1.5, 0.10, 'triangle', 0.14, 0.03);
    },
    special()  { [660, 830, 990].forEach((f, i) => tone(f, 0.12, 'triangle', 0.2, i * 0.06)); },
    jelly()    { tone(920, 0.09, 'sine', 0.16, 0, 1400); },
    frost()    { tone(240, 0.08, 'square', 0.10, 0, 180); tone(1900, 0.06, 'sine', 0.08, 0.02); },
    shuffle()  { [400, 500, 600, 700].forEach((f, i) => tone(f, 0.08, 'sine', 0.14, i * 0.05)); },
    win()      { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.22, 'triangle', 0.24, i * 0.11)); },
    lose()     { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, 'sine', 0.2, i * 0.16)); },
    click()    { tone(700, 0.05, 'sine', 0.15); },
  };
  return api;
})();
