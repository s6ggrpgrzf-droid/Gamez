/* Dead Man's Hand — WebAudio SFX + ambient. No assets.
 * AudioContext is created/resumed on the first user gesture. Mute persists.
 * Everything guarded: safe to call before init or when WebAudio is missing.
 */
'use strict';

var AU = (function () {
  var ctx = null, master = null, muted = false, ambientNodes = null;
  try { muted = localStorage.getItem('dmh_mute') === '1'; } catch (e) {}

  function ensure() {
    if (ctx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      return true;
    } catch (e) { return false; }
  }

  function init() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    startAmbient();
  }

  function isMuted() { return muted; }
  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem('dmh_mute', muted ? '1' : '0'); } catch (e) {}
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.02);
  }

  function env(g, t0, peak, decay) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0002, t0 + decay);
  }

  function tone(freq, type, peak, decay, slideTo) {
    if (!ensure() || muted) return;
    try {
      var t0 = ctx.currentTime;
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + decay);
      env(g, t0, peak, decay);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + decay + 0.05);
    } catch (e) {}
  }

  function noise(dur, peak, lowpass) {
    if (!ensure() || muted) return;
    try {
      var t0 = ctx.currentTime, len = Math.floor(ctx.sampleRate * dur);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = ctx.createBufferSource(); src.buffer = buf;
      var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass || 1200;
      var g = ctx.createGain();
      env(g, t0, peak, dur);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t0);
    } catch (e) {}
  }

  // card snap: short filtered click
  function snap() { noise(0.07, 0.25, 2400); tone(1900, 'triangle', 0.06, 0.05); }
  // select tick
  function tick() { tone(660, 'square', 0.05, 0.05); }
  function untick() { tone(440, 'square', 0.04, 0.05); }
  // discard whoosh
  function whoosh() { noise(0.18, 0.16, 900); }
  // damage thud, scaled to damage
  function thud(dmg) {
    var p = Math.min(1, dmg / 150);
    tone(90 - p * 30, 'sine', 0.35 + p * 0.3, 0.25 + p * 0.25, 40);
    noise(0.12, 0.12 + p * 0.15, 500);
  }
  // boon chime
  function chime() { tone(523, 'triangle', 0.12, 0.3); setTimeout(function () { tone(784, 'triangle', 0.12, 0.4); }, 90); }
  // win fanfare — minor-key saloon swell
  function fanfare() {
    var seq = [220, 261.6, 329.6, 440, 523.3, 659.3];
    seq.forEach(function (f, i) { setTimeout(function () { tone(f, 'triangle', 0.16, 0.5); tone(f / 2, 'sine', 0.1, 0.5); }, i * 110); });
  }
  // lose sting
  function sting() {
    tone(196, 'sawtooth', 0.12, 0.8, 98);
    setTimeout(function () { tone(147, 'sawtooth', 0.12, 1.0, 73); }, 220);
  }
  // dead man's hand easter egg: undertaker bell + low boom
  function deadBell() {
    tone(110, 'sine', 0.4, 1.6, 55);
    setTimeout(function () { tone(110, 'sine', 0.3, 1.4, 58); }, 420);
    noise(0.5, 0.1, 300);
  }
  function click() { tone(520, 'triangle', 0.07, 0.06); }

  // tiny ambient loop: low detuned drone + slow swell. Subtle.
  function startAmbient() {
    if (ambientNodes || !ctx) return;
    try {
      var g = ctx.createGain(); g.gain.value = 0.035; g.connect(master);
      var o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = 55;
      var o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 55.7;
      var lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.07;
      var lg = ctx.createGain(); lg.gain.value = 0.018;
      lfo.connect(lg); lg.connect(g.gain);
      o1.connect(g); o2.connect(g);
      o1.start(); o2.start(); lfo.start();
      ambientNodes = { g: g };
    } catch (e) {}
  }

  function suspend() { if (ctx && ctx.state === 'running') { try { ctx.suspend(); } catch (e) {} } }
  function resume() { if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} } }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) suspend(); else if (!muted) resume();
    });
  }

  return {
    init: init, isMuted: isMuted, setMuted: setMuted,
    snap: snap, tick: tick, untick: untick, whoosh: whoosh, thud: thud,
    chime: chime, fanfare: fanfare, sting: sting, deadBell: deadBell, click: click
  };
})();
