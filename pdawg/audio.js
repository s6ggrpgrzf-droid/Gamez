/* Pdawg Puzzles — tiny WebAudio SFX + haptics. No assets, all synthesized. */
(function () {
'use strict';
var ctx = null;
function ac() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function tone(freq, dur, type, peak, slideTo) {
  var c = ac(); if (!c) return;
  var t = c.currentTime;
  var o = c.createOscillator(), g = c.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  env(g, t, 0.005, peak || 0.2, dur);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, peak, filterFreq) {
  var c = ac(); if (!c) return;
  var t = c.currentTime;
  var len = Math.max(1, (dur + 0.05) * c.sampleRate) | 0;
  var buf = c.createBuffer(1, len, c.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  var src = c.createBufferSource(); src.buffer = buf;
  var f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = filterFreq || 2500; f.Q.value = 1.2;
  var g = c.createGain(); env(g, t, 0.004, peak || 0.25, dur);
  src.connect(f); f.connect(g); g.connect(c.destination);
  src.start(t); src.stop(t + dur + 0.05);
}
function buzz(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
}
var SFX = {
  unlock: function () { ac(); },
  click: function () { tone(660, 0.06, 'triangle', 0.12); },
  pickup: function () { tone(420, 0.07, 'sine', 0.10, 560); },
  /* satisfying wooden snap */
  snap: function () {
    noise(0.09, 0.32, 1800);
    tone(220, 0.10, 'triangle', 0.22, 140);
    buzz(12);
  },
  /* whimsy found: little sparkle arpeggio */
  whimsy: function () {
    var notes = [880, 1174, 1568];
    for (var i = 0; i < notes.length; i++) {
      (function (f, dl) { setTimeout(function () { tone(f, 0.16, 'sine', 0.16); }, dl); })(notes[i], i * 90);
    }
    buzz([15, 40, 15]);
  },
  rotate: function () { tone(520, 0.05, 'square', 0.05, 700); },
  win: function () {
    var seq = [523, 659, 784, 1046, 784, 1046];
    for (var i = 0; i < seq.length; i++) {
      (function (f, dl) { setTimeout(function () { tone(f, 0.22, 'triangle', 0.2); noise(0.05, 0.06, 4000); }, dl); })(seq[i], i * 130);
    }
    buzz([20, 60, 20, 60, 40]);
  },
  scatter: function () { noise(0.25, 0.12, 900); }
};
window.PDAWG_SFX = SFX;
})();
