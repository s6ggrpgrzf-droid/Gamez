/* UNFOLD audio — tiny Web Audio synth. No audio files. */
(function () {
  'use strict';
  var ctx = null, master = null, muted = false, ambientOn = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
      startAmbient();
      return true;
    } catch (e) { return false; }
  }

  function env(g, t0, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ensure()) return;
    var t0 = ctx.currentTime + (when || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    env(g, t0, 0.012, vol || 0.22, dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.1);
  }

  function noise(dur, vol, fc, when) {
    if (!ensure()) return;
    var t0 = ctx.currentTime + (when || 0);
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = fc || 1200;
    var g = ctx.createGain(); g.gain.value = vol || 0.15;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  /* soft pad that sits under everything */
  function startAmbient() {
    if (ambientOn || !ctx) return; ambientOn = true;
    var g = ctx.createGain(); g.gain.value = 0.035;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
    g.connect(f); f.connect(master);
    [110, 164.81, 220, 277.18].forEach(function (fr, i) {
      var o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = fr;
      o.detune.value = (i % 2 ? 4 : -4);
      o.connect(g); o.start();
    });
  }

  var PENTA = [523.25, 587.33, 659.25, 783.99, 880.0]; // C5 D5 E5 G5 A5

  window.Sfx = {
    resume: ensure,
    setMuted: function (m) { muted = !!m; if (master) master.gain.value = muted ? 0 : 0.9; },
    isMuted: function () { return muted; },

    tap: function () { tone(660, 0.08, 'triangle', 0.12); },
    pickup: function () { tone(523.25, 0.12, 'triangle', 0.18); tone(783.99, 0.16, 'triangle', 0.16, 0.07); },
    place: function () { tone(392, 0.14, 'triangle', 0.2); noise(0.06, 0.08, 2000); },
    unlock: function () {
      tone(330, 0.1, 'square', 0.08); tone(440, 0.12, 'square', 0.08, 0.08);
      tone(660, 0.2, 'triangle', 0.2, 0.16); noise(0.12, 0.1, 3000, 0.14);
    },
    chime: function () { // puzzle solved
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { tone(f, 0.5, 'sine', 0.16, i * 0.09); });
    },
    resolve: function () { // win sheet: the swell lands home
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach(function (f, i) { tone(f, 1.6, 'sine', 0.1, i * 0.14); });
      tone(261.63, 2.4, 'sine', 0.08, 0.1);
    },
    soft: function () { tone(220, 0.18, 'sine', 0.1, 0, 180); }, // gentle "nope"
    slide: function () { noise(0.09, 0.07, 900); },
    flip: function () { tone(300, 0.2, 'sine', 0.14, 0, 700); },
    tick: function () { tone(880, 0.05, 'square', 0.06); },

    note: function (i) { tone(PENTA[i % 5], 0.6, 'sine', 0.22); tone(PENTA[i % 5] * 2, 0.4, 'sine', 0.07); },
    xylo: function (i) { // brighter mallet
      tone(PENTA[i % 5], 0.7, 'triangle', 0.24);
      tone(PENTA[i % 5] * 3, 0.25, 'sine', 0.05);
    },
    melody: function (seq) { // seq of 0..4
      var self = this;
      seq.forEach(function (n, i) { setTimeout(function () { self.note(n); }, i * 420); });
    },

    unfold: function () { // the signature swell
      if (!ensure()) return;
      var t0 = ctx.currentTime;
      [130.81, 164.81, 196, 246.94, 329.63].forEach(function (fr, i) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = fr;
        var f = ctx.createBiquadFilter(); f.type = 'lowpass';
        f.frequency.setValueAtTime(400, t0 + i * 0.22);
        f.frequency.exponentialRampToValueAtTime(3200, t0 + i * 0.22 + 1.4);
        g.gain.setValueAtTime(0.0001, t0 + i * 0.22);
        g.gain.exponentialRampToValueAtTime(0.09, t0 + i * 0.22 + 0.9);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.22 + 2.6);
        o.connect(f); f.connect(g); g.connect(master);
        o.start(t0 + i * 0.22); o.stop(t0 + i * 0.22 + 2.8);
      });
      [1046.5, 1318.5, 1568, 2093].forEach(function (fr, i) {
        tone(fr, 1.2, 'sine', 0.06, 0.9 + i * 0.16);
      });
      noise(1.4, 0.05, 5000, 0.4);
    },

    buzz: function (ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }
  };
})();
