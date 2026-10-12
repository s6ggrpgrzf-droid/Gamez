/* Skylark audio — all synthesized WebAudio. Gesture-gated. */
'use strict';
var AU = (function () {
  var ctx = null, master = null, engOsc = null, engGain = null, engFilter = null,
      windSrc = null, windGain = null, windFilter = null, muted = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    // engine: sawtooth drone through lowpass, pitch follows throttle
    engOsc = ctx.createOscillator();
    engOsc.type = 'sawtooth';
    engOsc.frequency.value = 55;
    engFilter = ctx.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.frequency.value = 320;
    engGain = ctx.createGain();
    engGain.gain.value = 0.0;
    engOsc.connect(engFilter); engFilter.connect(engGain); engGain.connect(master);
    engOsc.start();

    // wind: filtered noise
    var len = ctx.sampleRate * 2;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    windSrc = ctx.createBufferSource();
    windSrc.buffer = buf; windSrc.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 600;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0.0;
    windSrc.connect(windFilter); windFilter.connect(windGain); windGain.connect(master);
    windSrc.start();
  }

  /* per-frame: throttle 0..1, speed px/s */
  function engine(throttle, speed, airborne) {
    if (!ctx || muted) return;
    var t = ctx.currentTime;
    var target = airborne ? 0.05 + throttle * 0.11 : throttle * 0.06;
    engGain.gain.setTargetAtTime(target, t, 0.1);
    engOsc.frequency.setTargetAtTime(48 + throttle * 75 + speed * 0.04, t, 0.15);
    engFilter.frequency.setTargetAtTime(280 + throttle * 700, t, 0.15);
    windGain.gain.setTargetAtTime(airborne ? Math.min(0.09, speed * 0.00035) : 0.0, t, 0.3);
  }

  function blip(freq, dur, type, vol) {
    if (!ctx || muted) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (dur || 0.15));
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + (dur || 0.15) + 0.02);
  }

  function chime() { // landing greaser
    blip(660, 0.25, 'triangle', 0.14);
    setTimeout(function () { blip(880, 0.3, 'triangle', 0.14); }, 140);
    setTimeout(function () { blip(1320, 0.45, 'triangle', 0.1); }, 300);
  }
  function thud(hard) { // touchdown
    if (!ctx || muted) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(hard ? 90 : 70, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.18);
    g.gain.setValueAtTime(hard ? 0.3 : 0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.25);
  }
  function towerBlip() { blip(1180, 0.07, 'square', 0.03); }
  function click() { blip(440, 0.05, 'square', 0.05); }
  function coin() {
    blip(990, 0.09, 'square', 0.07);
    setTimeout(function () { blip(1320, 0.14, 'square', 0.07); }, 80);
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  }

  return { ensure: ensure, engine: engine, chime: chime, thud: thud,
           towerBlip: towerBlip, click: click, coin: coin, toggleMute: toggleMute };
})();

if (typeof module !== 'undefined') module.exports = AU;
