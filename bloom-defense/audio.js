/* Bloom Defense — WebAudio SFX synth. window.BloomAudio */
'use strict';
window.BloomAudio = (function () {
  var ac = null, muted = false;
  function ctx() {
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(freq, dur, type, vol, slideTo, delay) {
    if (muted) return;
    var c = ctx(); if (!c) return;
    var t0 = c.currentTime + (delay || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.18, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, vol, freq, delay) {
    if (muted) return;
    var c = ctx(); if (!c) return;
    var t0 = c.currentTime + (delay || 0);
    var len = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource(); src.buffer = buf;
    var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1200;
    var g = c.createGain(); g.gain.value = vol || 0.2;
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t0);
  }
  return {
    unlock: function () { ctx(); },
    toggle: function () { muted = !muted; return muted; },
    isMuted: function () { return muted; },
    click: function () { tone(660, 0.07, 'triangle', 0.12); },
    sun: function () { tone(880, 0.12, 'sine', 0.16); tone(1320, 0.18, 'sine', 0.12, null, 0.07); },
    plant: function () { tone(220, 0.12, 'triangle', 0.2, 110); noise(0.08, 0.1, 500); },
    shovel: function () { noise(0.12, 0.15, 900); tone(180, 0.1, 'triangle', 0.12, 90); },
    shoot: function () { tone(520, 0.08, 'square', 0.05, 240); },
    lob: function () { tone(300, 0.16, 'sine', 0.1, 520); },
    splat: function () { noise(0.07, 0.12, 1800); tone(300, 0.06, 'triangle', 0.08, 150); },
    freeze: function () { tone(1200, 0.1, 'sine', 0.08, 2400); noise(0.06, 0.06, 4000); },
    chomp: function () { noise(0.09, 0.14, 700); tone(140, 0.09, 'sawtooth', 0.08, 70); },
    gulp: function () { tone(200, 0.14, 'sine', 0.12, 60); },
    boom: function () {
      noise(0.5, 0.35, 900); tone(90, 0.5, 'sawtooth', 0.25, 30);
      tone(60, 0.6, 'sine', 0.3, 25, 0.03);
    },
    fuse: function () { noise(0.25, 0.06, 5000); },
    mower: function () {
      tone(70, 1.4, 'sawtooth', 0.22, 160); noise(1.2, 0.12, 600);
    },
    horn: function () {
      tone(196, 0.5, 'sawtooth', 0.2); tone(196, 0.5, 'sawtooth', 0.2, null, 0.55);
      tone(147, 0.9, 'sawtooth', 0.22, null, 1.1);
    },
    ready: function () {
      tone(392, 0.14, 'triangle', 0.16); tone(523, 0.14, 'triangle', 0.16, null, 0.14);
      tone(659, 0.3, 'triangle', 0.18, null, 0.28);
    },
    win: function () {
      var n = [523, 659, 784, 1047, 784, 1047];
      n.forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.16, null, i * 0.13); });
    },
    lose: function () {
      var n = [392, 370, 349, 311];
      n.forEach(function (f, i) { tone(f, 0.3, 'sawtooth', 0.12, null, i * 0.2); });
    },
    worm: function () { tone(700, 0.09, 'sine', 0.12, 1400); tone(1400, 0.1, 'sine', 0.08, 700, 0.08); },
    arm: function () { tone(440, 0.2, 'triangle', 0.1, 880); },
    error: function () { tone(160, 0.12, 'square', 0.08, 120); }
  };
})();
