'use strict';
/* TENSION — every sound synthesized, no audio files. The clicks ARE the
 * game: silence-first, nothing under them. Created on the first touch
 * (AudioContext needs a gesture), mastered gently through a compressor.
 */
function createAudio() {
  let ctx = null, master = null, noiseBuf = null;
  let lastTick = 0, lastGive = 0;
  let muted = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 6;
      master = ctx.createGain(); master.gain.value = 0.55;
      master.connect(comp); comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return true;
    } catch (e) { return false; }
  }

  function noise(dur, filterType, freq, q, gain, when) {
    if (muted || !ensure()) return;
    const t = ctx.currentTime + (when || 0);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.02);
  }
  function tone(type, f0, f1, dur, gain, when) {
    if (muted || !ensure()) return;
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  return {
    unlock: ensure,
    setMuted(m) { muted = !!m; },
    get muted() { return muted; },
    /* the tray's small sounds: a tap, and the pick crossing a pin */
    tap() { noise(0.02, 'bandpass', 1500, 2, 0.1); },
    scrape() { noise(0.035, 'bandpass', 2600 + Math.random() * 500, 3, 0.05); },
    /* the rasp of a rising pin — tiny, bright, a little different per pin */
    tick(pin) {
      const now = performance.now();
      if (now - lastTick < 34) return;
      lastTick = now;
      noise(0.018, 'highpass', 3400 + pin * 260, 1, 0.11);
    },
    /* the set: a click with a body under it — the sound the game is about */
    set(pin) {
      noise(0.03, 'bandpass', 2100 + pin * 120, 2.5, 0.3);
      tone('sine', 300, 120, 0.07, 0.22);
      tone('triangle', 1250 + pin * 60, 700, 0.03, 0.07);
    },
    /* the plug straining to its next stop */
    give() {
      const now = performance.now();
      if (now - lastGive < 130) return;
      lastGive = now;
      noise(0.025, 'bandpass', 900, 2, 0.1);
    },
    overset() {
      noise(0.07, 'lowpass', 750, 0.8, 0.4);
      tone('sine', 140, 60, 0.11, 0.3);
    },
    /* the binder's tick: lower, duller, with a knock in it — the pin
       that is carrying the plug sounds like it. This is the tell the
       whole game is played by. */
    tickHeavy(pin) {
      const now = performance.now();
      if (now - lastTick < 34) return;
      lastTick = now;
      noise(0.03, 'bandpass', 950 + pin * 60, 2, 0.3);
      tone('sine', 170, 95, 0.05, 0.16);
    },
    /* a serration ridge: all click, no body — a lie told thinly */
    ridge(pin) {
      noise(0.014, 'highpass', 3900 + pin * 240, 1, 0.13);
    },
    /* the false set: a duller click, and the sound of the plug slipping back */
    falseset(pin) {
      noise(0.03, 'bandpass', 1300 + pin * 80, 2, 0.26);
      tone('sine', 210, 130, 0.06, 0.13);
      noise(0.09, 'bandpass', 480, 1.4, 0.1, 0.03);
    },
    /* a mushroom slipping off its lip */
    slip(pin) {
      tone('triangle', 720 + pin * 40, 240, 0.07, 0.12);
      noise(0.03, 'bandpass', 1100, 2, 0.16, 0.02);
    },
    drop(pin) {
      noise(0.025, 'bandpass', 1500 + pin * 100, 2, 0.16);
      tone('sine', 200, 90, 0.05, 0.1);
    },
    fall(pin) { noise(0.02, 'highpass', 2600 + pin * 200, 1, 0.06); },
    snap() {
      noise(0.05, 'highpass', 1200, 0.6, 0.5);
      tone('sine', 2500, 1900, 0.5, 0.12);
      tone('sine', 340, 80, 0.16, 0.25, 0.01);
    },
    pickin() { noise(0.04, 'bandpass', 1800, 2, 0.14); },
    /* strain made audible: a low creak while the pick is near its limit */
    creak() { noise(0.09, 'bandpass', 240 + Math.random() * 90, 6, 0.06); },
    open() {
      tone('sine', 110, 45, 0.22, 0.4);
      noise(0.16, 'lowpass', 500, 0.7, 0.3, 0.02);
      noise(0.04, 'bandpass', 1700, 2, 0.22, 0.24);
      tone('sine', 220, 110, 0.1, 0.14, 0.24);
      /* the ring-out: the plug's metal, singing a little after the throw */
      tone('sine', 1240, 1235, 0.5, 0.045, 0.26);
      tone('sine', 1860, 1850, 0.32, 0.025, 0.27);
    },
  };
}
const TNA = { createAudio };
