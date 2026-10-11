/* Golden Acre — audio.js
 * Generative WebAudio: wind, birds, livestock ambience + UI SFX.
 * AudioContext is created/resumed ONLY on a user gesture (AU.ensure).
 * Every cue has a visual twin, so the game reads fully silent.
 * Null-object safe: all methods no-op until ensure() succeeds.
 */
(function (root) {
'use strict';

var ctx = null, master = null, muted = false, ambOn = false;
var windGain = null, birdTimer = 0, liveTimer = 0;

try { muted = root.localStorage.getItem('ga_mute') === '1'; } catch (e) {}

function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(function () {}); return true; }
  var AC = root.AudioContext || root.webkitAudioContext;
  if (!AC) return false;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
    startAmbience();
    return true;
  } catch (e) { ctx = null; return false; }
}

function setMuted(m) {
  muted = !!m;
  try { root.localStorage.setItem('ga_mute', muted ? '1' : '0'); } catch (e) {}
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
}
function isMuted() { return muted; }

/* ---------- ambience ---------- */
function noiseBuffer() {
  var len = ctx.sampleRate * 2;
  var buf = ctx.createBuffer(1, len, ctx.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
function startAmbience() {
  if (ambOn || !ctx) return;
  ambOn = true;
  /* wind: looped noise through a wandering lowpass */
  var src = ctx.createBufferSource();
  src.buffer = noiseBuffer(); src.loop = true;
  var lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 0.6;
  windGain = ctx.createGain(); windGain.gain.value = 0.05;
  src.connect(lp); lp.connect(windGain); windGain.connect(master);
  src.start();
  var lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
  var lfoG = ctx.createGain(); lfoG.gain.value = 180;
  lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
  var lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.11;
  var lfo2G = ctx.createGain(); lfo2G.gain.value = 0.025;
  lfo2.connect(lfo2G); lfo2G.connect(windGain.gain); lfo2.start();
}

/* called each frame from the game loop with dt seconds */
function update(dt, weather, hasCows, hasChickens) {
  if (!ctx || muted) return;
  birdTimer -= dt;
  if (birdTimer <= 0) {
    birdTimer = 4 + Math.random() * 9;
    if (weather !== 'storm') chirp();
  }
  liveTimer -= dt;
  if (liveTimer <= 0) {
    liveTimer = 7 + Math.random() * 14;
    var r = Math.random();
    if (hasCows && r < 0.45) moo();
    else if (hasChickens && r < 0.8) cluck();
  }
}

function chirp() {
  var t = ctx.currentTime;
  var o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  var f = 2800 + Math.random() * 1200;
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 1.4, t + 0.07);
  o.frequency.exponentialRampToValueAtTime(f * 0.9, t + 0.14);
  g.gain.setValueAtTime(0.0, t);
  g.gain.linearRampToValueAtTime(0.06, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + 0.25);
}
function moo() {
  var t = ctx.currentTime;
  var o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sawtooth'; o2.type = 'sawtooth';
  o.frequency.setValueAtTime(140, t);
  o.frequency.linearRampToValueAtTime(105, t + 0.5);
  o2.frequency.setValueAtTime(143, t);
  o2.frequency.linearRampToValueAtTime(108, t + 0.5);
  var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
  g.gain.setValueAtTime(0.0, t);
  g.gain.linearRampToValueAtTime(0.09, t + 0.1);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master);
  o.start(t); o2.start(t); o.stop(t + 0.65); o2.stop(t + 0.65);
}
function cluck() {
  var t = ctx.currentTime;
  for (var i = 0; i < 3; i++) {
    (function (i) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(900 - i * 120, t + i * 0.11);
      g.gain.setValueAtTime(0.0, t + i * 0.11);
      g.gain.linearRampToValueAtTime(0.05, t + i * 0.11 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.11 + 0.09);
      o.connect(g); g.connect(master);
      o.start(t + i * 0.11); o.stop(t + i * 0.11 + 0.1);
    })(i);
  }
}

/* ---------- SFX ---------- */
function blip(freq, dur, type, vol, slideTo) {
  if (!ctx) return;
  var t = ctx.currentTime;
  var o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol || 0.12, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}
function tick()  { blip(660, 0.06, 'square', 0.05); }
function pop()   { blip(520, 0.12, 'sine', 0.14, 980); }
function coin()  { blip(880, 0.09, 'sine', 0.1); setTimeout(function () { blip(1320, 0.14, 'sine', 0.1); }, 70); }
function error() { blip(160, 0.18, 'sawtooth', 0.08, 110); }
function plowSnd(){ blip(120, 0.15, 'triangle', 0.1, 70); }
function waterSnd(){
  if (!ctx) return;
  var t = ctx.currentTime;
  var src = ctx.createBufferSource(); src.buffer = noiseBuffer();
  var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
  var g = ctx.createGain();
  g.gain.setValueAtTime(0.09, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  src.connect(hp); hp.connect(g); g.connect(master);
  src.start(t); src.stop(t + 0.4);
}
function thunder() {
  if (!ctx) return;
  var t = ctx.currentTime;
  var src = ctx.createBufferSource(); src.buffer = noiseBuffer();
  var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140;
  var g = ctx.createGain();
  g.gain.setValueAtTime(0.28, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
  src.connect(lp); lp.connect(g); g.connect(master);
  src.start(t); src.stop(t + 1.5);
}
function fanfare() {
  if (!ctx) return;
  var notes = [523, 659, 784, 1047];
  for (var i = 0; i < notes.length; i++) {
    (function (i) {
      setTimeout(function () { blip(notes[i], 0.28, 'triangle', 0.14); }, i * 130);
    })(i);
  }
  setTimeout(function () { blip(1047, 0.6, 'triangle', 0.12); blip(784, 0.6, 'triangle', 0.08); }, 560);
}

root.AU = {
  ensure: ensure, setMuted: setMuted, isMuted: isMuted, update: update,
  tick: tick, pop: pop, coin: coin, error: error,
  plowSnd: plowSnd, waterSnd: waterSnd, thunder: thunder, fanfare: fanfare
};

})(typeof window !== 'undefined' ? window : globalThis);
