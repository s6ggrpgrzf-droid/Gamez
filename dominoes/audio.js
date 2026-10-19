/* Dominoes audio — all synthesized with WebAudio, no assets.
 * Mixer: sfx bus -> master. Mute persisted. Context resumes on gesture. */
'use strict';
(function () {
  const LS_MUTE = 'dominoes.mute';
  let ctx = null, master = null, sfxBus = null;
  let muted = false;
  try { muted = localStorage.getItem(LS_MUTE) === '1'; } catch (e) {}

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.9;
      sfxBus.connect(master);
      return true;
    } catch (e) { return false; }
  }

  function noiseBuffer(dur) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    return buf;
  }

  // The clack: short filtered noise burst + low thump. weight 0..1 deepens it.
  function clack(weight) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const w = weight == null ? 0.5 : weight;
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(0.09);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600 - w * 1200;
    bp.Q.value = 1.1;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.9, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    n.connect(bp); bp.connect(ng); ng.connect(sfxBus);
    n.start(t);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(210 - w * 70, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.08);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.5, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(og); og.connect(sfxBus);
    o.start(t); o.stop(t + 0.1);
  }

  function flip() {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(0.07);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 3000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    n.connect(hp); hp.connect(g); g.connect(sfxBus);
    n.start(t);
  }

  function shuffleTick(when, pitch) {
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = pitch;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(g); g.connect(sfxBus);
    o.start(t); o.stop(t + 0.08);
  }
  function shuffle() {
    if (!ensure()) return;
    for (let i = 0; i < 9; i++) shuffleTick(i * 0.055, 1400 + Math.random() * 900);
  }

  function knock() {
    if (!ensure()) return;
    clack(0.9);
    setTimeout(() => clack(0.9), 130);
  }

  function tick() {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square'; o.frequency.value = 1900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    o.connect(g); g.connect(sfxBus);
    o.start(t); o.stop(t + 0.04);
  }

  function chime(win) {
    if (!ensure()) return;
    const notes = win ? [523.25, 659.25, 783.99, 1046.5] : [392, 440, 523.25];
    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.11;
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + 0.55);
    });
  }

  function uiTap() {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = 660;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g); g.connect(sfxBus);
    o.start(t); o.stop(t + 0.06);
  }

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem(LS_MUTE, muted ? '1' : '0'); } catch (e) {}
    if (master) master.gain.value = muted ? 0 : 0.9;
  }
  function isMuted() { return muted; }

  // unlock on first gesture
  window.addEventListener('pointerdown', ensure, { passive: true });
  window.addEventListener('keydown', ensure);

  window.DomAudio = {
    clack, flip, shuffle, knock, tick, chime, uiTap,
    setMuted, isMuted, ensure,
  };
})();
