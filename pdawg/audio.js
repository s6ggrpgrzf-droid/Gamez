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
  if (!soundOn) return;
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
  if (!soundOn) return;
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
function reduceMotion() {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  catch (e) { return false; }
}
/* Haptics preference: on by default, off when the OS asks for reduced motion.
 * Persisted; togglable from the pause menu. Never throws (iOS has no vibrate). */
var HAPT_KEY = 'pdawg-haptics';
var haptics = true;
try {
  var hv = localStorage.getItem(HAPT_KEY);
  haptics = hv === null ? !reduceMotion() : hv === '1';
} catch (e) { haptics = !reduceMotion(); }
function buzz(ms) {
  if (!haptics) return;
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
}
/* Sound preference: on by default, persisted, toggled from the pause menu.
 * Guards tone()/noise() at the source, so every voice obeys it. Haptics
 * stay independent — muting sound never stills the buzz. */
var SOUND_KEY = 'pdawg-sound';
var soundOn = true;
try { soundOn = localStorage.getItem(SOUND_KEY) !== '0'; } catch (e) {}
/* snap pitch ladder: quick consecutive snaps climb a few semitones */
var snapStreak = 0, snapLastAt = 0;
var SFX = {
  unlock: function () { ac(); },
  tap: function () { buzz(12); },   /* light tick for UI button presses */
  hapticsOn: function () { return haptics; },
  setHaptics: function (on) {
    haptics = !!on;
    try { localStorage.setItem(HAPT_KEY, haptics ? '1' : '0'); } catch (e) {}
  },
  soundOn: function () { return soundOn; },
  setSound: function (on) {
    soundOn = !!on;
    try { localStorage.setItem(SOUND_KEY, soundOn ? '1' : '0'); } catch (e) {}
  },
  click: function () { tone(660, 0.06, 'triangle', 0.12); },
  pickup: function () {
    var detune = 0.97 + Math.random() * 0.06;   /* no two pickups identical */
    tone(420 * detune, 0.07, 'sine', 0.10, 560 * detune);
    buzz(20);
  },
  /* satisfying wooden snap — quick repeats climb a small pitch ladder */
  snap: function () {
    var now = Date.now();
    snapStreak = (now - snapLastAt < 2600) ? Math.min(4, snapStreak + 1) : 0;
    snapLastAt = now;
    var f = Math.pow(2, snapStreak / 12);
    noise(0.09, 0.32, 1800 * f);
    tone(220 * f, 0.10, 'triangle', 0.22, 140 * f);
    buzz(30);
  },
  /* two pieces join: a warm double-tick, lower and softer than a seat */
  merge: function () {
    noise(0.05, 0.20, 1250);
    tone(185, 0.07, 'triangle', 0.13, 130);
    setTimeout(function () { noise(0.06, 0.22, 1050); }, 55);
    buzz(18);
  },
  /* the deal: a soft shuffle swell with paper ticks over the fan-out */
  deal: function () {
    noise(0.55, 0.06, 750);
    for (var i = 0; i < 6; i++) {
      (function (dl) {
        setTimeout(function () { noise(0.03, 0.09, 1900 + Math.random() * 500); }, dl);
      })(120 + i * 110);
    }
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
    buzz([10, 40, 10]);
  },
  scatter: function () { noise(0.25, 0.12, 900); }
};
window.PDAWG_SFX = SFX;
})();
