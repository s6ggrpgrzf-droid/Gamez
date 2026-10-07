/* Skyhook audio — tiny synthesized SFX kit, no assets. */
(function () {
  'use strict';
  const store = {
    get muted() { try { return localStorage.getItem('skyhook_muted') === '1'; } catch (e) { return false; } },
    set muted(v) { try { localStorage.setItem('skyhook_muted', v ? '1' : '0'); } catch (e) {} },
  };

  let ctx = null, master = null, noiseBuf = null;
  let chargeOsc = null, chargeGain = null;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = store.muted ? 0 : 0.5;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 1;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return true;
    } catch (e) { return false; }
  }

  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ensure()) return;
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, vol, when, filterFreq, filterType, slideTo) {
    if (!ensure()) return;
    const t = ctx.currentTime + (when || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = filterType || 'lowpass';
    f.frequency.setValueAtTime(filterFreq || 800, t);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.05);
  }

  const S = {
    unlock() { ensure(); },
    get muted() { return store.muted; },
    setMuted(m) { store.muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    click() { tone(660, 0.07, 'triangle', 0.18); },
    chargeStart() {
      if (!ensure() || chargeOsc) return;
      chargeOsc = ctx.createOscillator(); chargeGain = ctx.createGain();
      chargeOsc.type = 'sine'; chargeOsc.frequency.value = 180;
      chargeGain.gain.value = 0.0001;
      chargeGain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.08);
      chargeOsc.connect(chargeGain); chargeGain.connect(master);
      chargeOsc.start();
    },
    chargeSet(p) { // p: 0..1
      if (chargeOsc) chargeOsc.frequency.setTargetAtTime(180 + p * 520, ctx.currentTime, 0.03);
    },
    chargeStop() {
      if (!chargeOsc) return;
      const o = chargeOsc, g = chargeGain; chargeOsc = null; chargeGain = null;
      g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03);
      setTimeout(() => { try { o.stop(); } catch (e) {} }, 200);
    },
    release() { noise(0.35, 0.25, 0, 900, 'bandpass', 3200); },
    land() { tone(160, 0.16, 'sine', 0.4, 0, 70); noise(0.1, 0.12, 0, 500, 'lowpass'); },
    perfect() { tone(880, 0.12, 'triangle', 0.25); tone(1174.7, 0.14, 'triangle', 0.25, 0.08); tone(1568, 0.22, 'triangle', 0.28, 0.16); },
    fire() { tone(220, 0.4, 'sawtooth', 0.16, 0, 880); noise(0.4, 0.1, 0, 2000, 'highpass'); },
    splash() { noise(0.5, 0.3, 0, 1200, 'lowpass', 200); tone(300, 0.3, 'sine', 0.15, 0, 90); },
    bonk() { tone(220, 0.18, 'square', 0.22, 0, 110); noise(0.12, 0.15, 0, 700, 'lowpass'); },
    rainbow() { tone(1046, 0.1, 'sine', 0.2); tone(1318, 0.1, 'sine', 0.2, 0.07); tone(1568, 0.16, 'sine', 0.22, 0.14); },
    upgrade() { tone(523.25, 0.12, 'triangle', 0.25); tone(659.25, 0.12, 'triangle', 0.25, 0.09); tone(783.99, 0.2, 'triangle', 0.28, 0.18); },
    over() { tone(392, 0.2, 'triangle', 0.25); tone(311, 0.2, 'triangle', 0.25, 0.16); tone(233, 0.34, 'triangle', 0.28, 0.32); },
    daily() { tone(784, 0.1, 'triangle', 0.22); tone(1046, 0.18, 'triangle', 0.24, 0.1); },
    // --- Swinicorn-faithful additions ---
    creakStart() {
      if (!ensure() || chargeOsc) return;
      chargeOsc = ctx.createOscillator(); chargeGain = ctx.createGain();
      chargeOsc.type = 'sawtooth'; chargeOsc.frequency.value = 70;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
      chargeGain.gain.value = 0.0001;
      chargeGain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.1);
      chargeOsc.connect(f); f.connect(chargeGain); chargeGain.connect(master);
      chargeOsc.start();
    },
    creakSet(p) { // p: 0..1 rope tension
      if (chargeOsc) {
        chargeOsc.frequency.setTargetAtTime(70 + p * 160 + Math.random() * 8, ctx.currentTime, 0.05);
      }
    },
    creakStop() { this.chargeStop(); },
    twang(p) { // release: pitch rises with pull 0..1
      tone(140 + p * 320, 0.28, 'triangle', 0.35, 0, 90);
      noise(0.18, 0.2, 0, 2500, 'highpass');
    },
    whoosh() { noise(0.4, 0.22, 0, 700, 'bandpass', 3400); },
    wobble() { tone(196, 0.5, 'sine', 0.22, 0, 130); tone(196, 0.5, 'sine', 0.15, 0.12, 150); },
    flip() { tone(280, 0.32, 'sine', 0.22, 0, 980); noise(0.25, 0.12, 0, 1200, 'bandpass', 4200); },
    ride() { [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.14, 'triangle', 0.22, i * 0.07)); noise(0.5, 0.1, 0, 3000, 'highpass', 6000); },
    fizzle() { noise(0.5, 0.18, 0, 4000, 'highpass', 800); },
    neigh() { tone(520, 0.12, 'sawtooth', 0.2, 0, 780); tone(660, 0.14, 'sawtooth', 0.2, 0.1, 920); },
    boing() { tone(180, 0.22, 'sine', 0.28, 0, 520); },
    newBest() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.16, 'triangle', 0.24, i * 0.09)); },
    milestone() { tone(784, 0.12, 'triangle', 0.22); tone(988, 0.2, 'triangle', 0.24, 0.1); },
    // raw note for the generative music scheduler in game.js
    note(freq, dur, type, vol, when) { tone(freq, dur, type || 'triangle', vol || 0.14, when || 0); },
    noiseHit(dur, vol, freq) { noise(dur, vol, 0, freq || 6000, 'highpass'); },
  };

  window.SkyAudio = S;
})();
