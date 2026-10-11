/* Skyline Sparrow — audio.js
   Generative WebAudio: wind bed, combo-rising chime arps, synthesized SFX.
   Context created/resumed on user gesture ONLY. Mute toggle persisted.
   The game reads fully silent — every cue has a visual twin. UMD. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SSAudio = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

var ctx = null, master = null, musicBus = null, sfxBus = null;
var muted = false, windNodes = null;
var comboStep = 0;

function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(master);
    startWind();
    return true;
  } catch (e) { return false; }
}
function setMuted(m) {
  muted = !!m;
  if (master) master.gain.value = muted ? 0 : 0.9;
  try { localStorage.setItem('ss_muted', muted ? '1' : '0'); } catch (e) {}
}
function isMuted() { return muted; }
function loadMuted() { try { muted = localStorage.getItem('ss_muted') === '1'; } catch (e) {} }

/* --- wind bed: filtered noise, always on, swells with speed --- */
function startWind() {
  var len = ctx.sampleRate * 2;
  var buf = ctx.createBuffer(1, len, ctx.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  var src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  var filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 420; filt.Q.value = 0.4;
  var g = ctx.createGain(); g.gain.value = 0.05;
  src.connect(filt); filt.connect(g); g.connect(musicBus);
  src.start();
  windNodes = { filt: filt, gain: g };
}
function windLevel(x) { // 0..1 with speed
  if (windNodes) {
    windNodes.gain.gain.value = 0.03 + x * 0.06;
    windNodes.filt.frequency.value = 320 + x * 500;
  }
}

/* --- tiny synth helpers (one-shot nodes, pooled buffers n/a — short blips) --- */
function blip(freq0, freq1, dur, type, vol, when) {
  if (!ctx || muted) return;
  var t = ctx.currentTime + (when || 0);
  var o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, freq1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(sfxBus);
  o.start(t); o.stop(t + dur + 0.05);
}

/* pentatonic chime ladder — pitch rises with the near-miss combo */
var SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.7, 1318.5];
function chime(combo) {
  if (!ctx || muted) return;
  var n = SCALE[Math.min(combo, SCALE.length - 1)];
  blip(n, n * 1.005, 0.5, 'sine', 0.16);
  blip(n * 2, n * 2.01, 0.3, 'sine', 0.06, 0.02);
}

var SFX = {
  jump: function () { blip(300, 620, 0.16, 'triangle', 0.18); },
  walljump: function () { blip(340, 700, 0.14, 'square', 0.08); blip(520, 900, 0.12, 'triangle', 0.12, 0.03); },
  land: function (hard) { blip(hard ? 160 : 220, 90, hard ? 0.18 : 0.1, 'sine', hard ? 0.22 : 0.1); },
  feather: function (n) {
    var base = 660 + Math.min(n, 12) * 40;
    blip(base, base * 1.5, 0.18, 'sine', 0.14);
    blip(base * 1.5, base * 2, 0.14, 'sine', 0.08, 0.05);
  },
  near: function (combo) { chime(combo); },
  bounce: function () { blip(240, 880, 0.22, 'triangle', 0.2); blip(480, 1200, 0.16, 'sine', 0.1, 0.04); },
  death: function () {
    blip(420, 70, 0.5, 'sawtooth', 0.14);
    blip(210, 50, 0.6, 'triangle', 0.16, 0.05);
  },
  ui: function () { blip(700, 900, 0.07, 'sine', 0.1); },
  district: function () {
    // little two-note dawn motif on district change
    blip(523.25, 523.25, 0.25, 'sine', 0.1);
    blip(783.99, 783.99, 0.35, 'sine', 0.1, 0.16);
  },
  milestone: function () {
    blip(880, 880, 0.2, 'sine', 0.1);
    blip(1174.7, 1174.7, 0.3, 'sine', 0.1, 0.12);
  }
};

return {
  ensure: ensure, setMuted: setMuted, isMuted: isMuted, loadMuted: loadMuted,
  windLevel: windLevel, SFX: SFX
};
});
