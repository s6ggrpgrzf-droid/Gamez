/* Blood Moon — game.js
 * Browser shell: pre-rendered gothic art, canvas renderer, procedural audio,
 * touch + keyboard input, UI screens, meta progression, Gamez arcade wiring.
 * The simulation itself lives in sim.js (pure, headless-testable). */
(function () {
'use strict';

var TAU = Math.PI * 2;
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

/* ================= canvas ================= */
var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');
var W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2); // playbook: cap DPR at 2
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
resize();

function makeCanvas(w, h) {
  var c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

/* soft radial glow sprite, pre-rendered once */
function glowSprite(color, size) {
  var c = makeCanvas(size, size), g = c.getContext('2d');
  var gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}
var GLOW = {
  red: glowSprite('rgba(230,57,70,0.85)', 128),
  orange: glowSprite('rgba(255,150,50,0.85)', 128),
  purple: glowSprite('rgba(157,78,221,0.8)', 128),
  pale: glowSprite('rgba(232,228,216,0.7)', 128),
  dark: glowSprite('rgba(5,3,10,0.9)', 128)
};

/* ================= pre-rendered characters (oblique top-down) ================= */
function charCanvas(s) { return makeCanvas(s, s); }

function drawShadowBlob(g, s) {
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath(); g.ellipse(s / 2, s * 0.78, s * 0.28, s * 0.12, 0, 0, TAU); g.fill();
}
function drawHead(g, x, y, r, skin) {
  g.fillStyle = skin; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

/* the vampire is drawn dynamically (drawVampire) — cape, collar, pale face.
   Kept here for reference; see drawVampire() below the render section. */

/* villager: brown tunic + pitchfork */
function spriteVillager() {
  var s = 80, c = charCanvas(s), g = c.getContext('2d');
  drawShadowBlob(g, s);
  g.fillStyle = '#8a7a5c';
  g.beginPath(); g.ellipse(s / 2, s * 0.55, s * 0.2, s * 0.26, 0, 0, TAU); g.fill();
  drawHead(g, s / 2, s * 0.3, s * 0.12, '#d9b48f');
  // pitchfork
  g.strokeStyle = '#6b543a'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(s * 0.78, s * 0.3); g.lineTo(s * 0.7, s * 0.85); g.stroke();
  g.lineWidth = 2.5;
  for (var i = -1; i <= 1; i++) {
    g.beginPath(); g.moveTo(s * 0.78 + i * 7, s * 0.3); g.lineTo(s * 0.78 + i * 7, s * 0.16); g.stroke();
  }
  return c;
}

/* torch mob: villager + flame */
function spriteTorch() {
  var s = 80, c = charCanvas(s), g = c.getContext('2d');
  g.drawImage(spriteVillager(), 0, 0);
  var fx = s * 0.78, fy = s * 0.12;
  g.fillStyle = '#ff9632';
  g.beginPath(); g.arc(fx, fy, 9, 0, TAU); g.fill();
  g.fillStyle = '#ffd166';
  g.beginPath(); g.arc(fx, fy - 2, 5, 0, TAU); g.fill();
  return c;
}

/* priest: white robe, gold stole */
function spritePriest() {
  var s = 84, c = charCanvas(s), g = c.getContext('2d');
  drawShadowBlob(g, s);
  g.fillStyle = '#d8d2c0';
  g.beginPath(); g.moveTo(s / 2, s * 0.14);
  g.quadraticCurveTo(s * 0.85, s * 0.5, s * 0.72, s * 0.86);
  g.quadraticCurveTo(s / 2, s * 0.76, s * 0.28, s * 0.86);
  g.quadraticCurveTo(s * 0.15, s * 0.5, s / 2, s * 0.14); g.fill();
  g.strokeStyle = '#c9a227'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(s * 0.42, s * 0.2); g.lineTo(s * 0.42, s * 0.7); g.stroke();
  g.beginPath(); g.moveTo(s * 0.58, s * 0.2); g.lineTo(s * 0.58, s * 0.7); g.stroke();
  drawHead(g, s / 2, s * 0.3, s * 0.11, '#d9b48f');
  return c;
}

/* hunter: green coat + crossbow */
function spriteHunter() {
  var s = 80, c = charCanvas(s), g = c.getContext('2d');
  drawShadowBlob(g, s);
  g.fillStyle = '#5c6e4a';
  g.beginPath(); g.ellipse(s / 2, s * 0.55, s * 0.2, s * 0.26, 0, 0, TAU); g.fill();
  drawHead(g, s / 2, s * 0.3, s * 0.12, '#c99b76');
  // hat
  g.fillStyle = '#3d4a33';
  g.beginPath(); g.ellipse(s / 2, s * 0.22, s * 0.16, s * 0.06, 0, 0, TAU); g.fill();
  // crossbow
  g.strokeStyle = '#4a3826'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(s * 0.6, s * 0.5); g.lineTo(s * 0.92, s * 0.42); g.stroke();
  g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(s * 0.78, s * 0.3); g.lineTo(s * 0.86, s * 0.54); g.stroke();
  return c;
}

/* Van Helsing: long dark coat, wide hat, glowing stake */
function spriteHelsing() {
  var s = 128, c = charCanvas(s), g = c.getContext('2d');
  drawShadowBlob(g, s);
  g.fillStyle = '#232838';
  g.beginPath(); g.moveTo(s / 2, s * 0.1);
  g.quadraticCurveTo(s * 0.9, s * 0.5, s * 0.74, s * 0.88);
  g.quadraticCurveTo(s / 2, s * 0.74, s * 0.26, s * 0.88);
  g.quadraticCurveTo(s * 0.1, s * 0.5, s / 2, s * 0.1); g.fill();
  g.strokeStyle = '#c9a227'; g.lineWidth = 2.5; g.stroke();
  drawHead(g, s / 2, s * 0.3, s * 0.1, '#c99b76');
  // wide-brim hat
  g.fillStyle = '#1a1e2c';
  g.beginPath(); g.ellipse(s / 2, s * 0.24, s * 0.2, s * 0.055, 0, 0, TAU); g.fill();
  g.fillRect(s * 0.4, s * 0.1, s * 0.2, s * 0.13);
  // glowing stake
  g.save(); g.shadowColor = '#e0aaff'; g.shadowBlur = 12;
  g.strokeStyle = '#e0aaff'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(s * 0.72, s * 0.42); g.lineTo(s * 0.94, s * 0.3); g.stroke();
  g.restore();
  // eyes: cold blue
  g.fillStyle = '#9fd8ff';
  g.beginPath(); g.arc(s * 0.455, s * 0.3, 3, 0, TAU); g.fill();
  g.beginPath(); g.arc(s * 0.545, s * 0.3, 3, 0, TAU); g.fill();
  return c;
}

/* bat: two flap frames */
function spriteBat(frame) {
  var s = 40, c = charCanvas(s), g = c.getContext('2d');
  g.fillStyle = '#0d0a16';
  var lift = frame ? -6 : 4;
  g.beginPath();
  g.moveTo(s / 2 - 4, s / 2);
  g.quadraticCurveTo(s * 0.15, s / 2 + lift, 2, s / 2 + lift + 8);
  g.quadraticCurveTo(s * 0.25, s / 2 + 4, s / 2 - 4, s / 2 + 6);
  g.quadraticCurveTo(s * 0.75, s / 2 + 4, s - 2, s / 2 + lift + 8);
  g.quadraticCurveTo(s * 0.85, s / 2 + lift, s / 2 + 4, s / 2);
  g.quadraticCurveTo(s / 2 + 2, s / 2 + 8, s / 2 - 4, s / 2);
  g.fill();
  g.fillStyle = '#e63946';
  g.beginPath(); g.arc(s / 2 - 3, s / 2 - 1, 1.6, 0, TAU); g.fill();
  g.beginPath(); g.arc(s / 2 + 3, s / 2 - 1, 1.6, 0, TAU); g.fill();
  return c;
}

/* blood orb */
function spriteOrb() {
  var s = 32, c = charCanvas(s), g = c.getContext('2d');
  var gr = g.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
  gr.addColorStop(0, '#ff6b6b'); gr.addColorStop(0.55, '#c1121f'); gr.addColorStop(1, 'rgba(122,12,20,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(s / 2, s / 2, s / 2, 0, TAU); g.fill();
  return c;
}

/* pine tree silhouette */
function spriteTree() {
  var s = 128, c = charCanvas(s), g = c.getContext('2d');
  g.fillStyle = '#0e1a14';
  for (var i = 0; i < 3; i++) {
    var y = s * (0.28 + i * 0.2), w = s * (0.28 - i * 0.05);
    g.beginPath(); g.moveTo(s / 2 - w, y); g.lineTo(s / 2, y - s * 0.28); g.lineTo(s / 2 + w, y); g.fill();
  }
  g.fillStyle = '#241a12'; g.fillRect(s / 2 - 6, s * 0.72, 12, s * 0.24);
  return c;
}

/* crooked house with one warm window */
function spriteHouse() {
  var s = 160, c = charCanvas(s), g = c.getContext('2d');
  g.fillStyle = '#12101c';
  g.fillRect(s * 0.2, s * 0.4, s * 0.6, s * 0.45);
  g.beginPath(); g.moveTo(s * 0.14, s * 0.42); g.lineTo(s / 2, s * 0.14); g.lineTo(s * 0.86, s * 0.42); g.fill();
  g.fillStyle = '#ffb703';
  g.fillRect(s * 0.42, s * 0.55, s * 0.16, s * 0.14);
  g.fillStyle = '#12101c';
  g.fillRect(s * 0.485, s * 0.55, s * 0.03, s * 0.14);
  g.fillRect(s * 0.42, s * 0.605, s * 0.16, s * 0.03);
  return c;
}

/* the coffin: home base */
function spriteCoffin() {
  var s = 110, c = charCanvas(s), g = c.getContext('2d');
  g.fillStyle = '#2b1a12';
  g.beginPath();
  g.moveTo(s * 0.36, s * 0.08); g.lineTo(s * 0.64, s * 0.08);
  g.lineTo(s * 0.74, s * 0.4); g.lineTo(s * 0.62, s * 0.92);
  g.lineTo(s * 0.38, s * 0.92); g.lineTo(s * 0.26, s * 0.4); g.fill();
  g.strokeStyle = '#c9a227'; g.lineWidth = 3; g.stroke();
  g.strokeStyle = '#c9a227'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(s / 2, s * 0.3); g.lineTo(s / 2, s * 0.62); g.stroke();
  g.beginPath(); g.moveTo(s * 0.42, s * 0.4); g.lineTo(s * 0.58, s * 0.4); g.stroke();
  return c;
}

var SPR = {
  villager: spriteVillager(),
  torch: spriteTorch(),
  priest: spritePriest(),
  hunter: spriteHunter(),
  vanhelsing: spriteHelsing(),
  bat: [spriteBat(0), spriteBat(1)],
  orb: spriteOrb(),
  tree: spriteTree(),
  house: spriteHouse(),
  coffin: spriteCoffin()
};

/* ================= AUDIO — all procedural, no files ================= */
var AU = {
  ctx: null, master: null, musicG: null, sfxG: null,
  noiseBuf: null, musicOn: false, heartOn: false, heartT: 0,
  seqT: 0, seqStep: 0
};
function auInit() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  var C = window.AudioContext || window.webkitAudioContext;
  if (!C) return;
  AU.ctx = new C();
  AU.master = AU.ctx.createGain(); AU.master.gain.value = 0.8; AU.master.connect(AU.ctx.destination);
  AU.musicG = AU.ctx.createGain(); AU.musicG.gain.value = 0.34; AU.musicG.connect(AU.master);
  AU.sfxG = AU.ctx.createGain(); AU.sfxG.gain.value = 0.9; AU.sfxG.connect(AU.master);
  var len = AU.ctx.sampleRate * 1.2, buf = AU.ctx.createBuffer(1, len, AU.ctx.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  AU.noiseBuf = buf;
  startMusic();
}
function auNow() { return AU.ctx ? AU.ctx.currentTime : 0; }

/* --- tiny synth helpers --- */
function tone(freq, dur, type, vol, dest, slideTo, delay) {
  if (!AU.ctx) return;
  var t = auNow() + (delay || 0);
  var o = AU.ctx.createOscillator(), g = AU.ctx.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest || AU.sfxG);
  o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, filterFreq, type, delay) {
  if (!AU.ctx) return;
  var t = auNow() + (delay || 0);
  var s = AU.ctx.createBufferSource(); s.buffer = AU.noiseBuf; s.loop = true;
  var f = AU.ctx.createBiquadFilter(); f.type = type || 'lowpass';
  f.frequency.value = filterFreq || 800;
  var g = AU.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(AU.sfxG);
  s.start(t); s.stop(t + dur + 0.05);
}

/* --- generative dark music: drone + slow minor arpeggio + distant bells ---
   Boss mode: faster, tenser. Dawn: a choir-ish layer climbs over the dark. */
var SCALES = {
  night: [110, 130.81, 146.83, 164.81, 196, 220, 246.94],   // A minor-ish
  dawn: [146.83, 174.61, 196, 220, 261.63, 293.66],          // brighter, uneasy
  boss: [110, 116.54, 146.83, 155.56, 196, 207.65]           // phrygian bite
};
function musicTick() {
  if (!AU.ctx || document.hidden) return;
  var bossMode = !!(G && G.bossMusic && G.mode === 'playing');
  var dawnMode = !!(G && G.dawn && G.mode === 'playing');
  var scale = bossMode ? SCALES.boss : (dawnMode ? SCALES.dawn : SCALES.night);
  var stepDur = bossMode ? 0.34 : 0.55;
  while (AU.seqT < auNow() + 0.6) {
    var s = AU.seqStep++;
    // sparse arpeggio: play on some steps, minor-key wander
    if (s % 2 === 0 && ((s * 2654435761) % 100) < 62) {
      var n = scale[(s * 7 + 3) % scale.length] / 2;
      var t = AU.seqT - auNow();
      tone(n, 1.6, 'triangle', 0.11, AU.musicG, null, Math.max(0, t));
      tone(n * 2.01, 1.2, 'sine', 0.05, AU.musicG, null, Math.max(0, t));
    }
    // deep pulse every 8 steps (every 4 in boss mode)
    var pulseEvery = bossMode ? 4 : 8;
    if (s % pulseEvery === 4) tone(55, 0.9, 'sine', bossMode ? 0.22 : 0.16, AU.musicG, 41, Math.max(0, AU.seqT - auNow()));
    // dawn choir layer: high detuned voices climbing as the light comes
    if (dawnMode && s % 4 === 0) {
      var cn = scale[(s * 3 + 1) % scale.length] * 2;
      var ct = Math.max(0, AU.seqT - auNow());
      tone(cn, 1.1, 'sine', 0.05, AU.musicG, null, ct);
      tone(cn * 1.007, 1.1, 'triangle', 0.04, AU.musicG, null, ct);
    }
    AU.seqT += stepDur;
  }
  // heartbeat when hurt
  if (AU.heartOn && AU.ctx) {
    AU.heartT -= 0.24;
    if (AU.heartT <= 0) {
      AU.heartT = 0.85;
      tone(58, 0.14, 'sine', 0.5, AU.sfxG, 40);
      tone(52, 0.12, 'sine', 0.35, AU.sfxG, 38, 0.18);
    }
  }
} // end musicTick
function startMusic() {
  if (!AU.ctx || AU.musicOn) return;
  AU.musicOn = true;
  // eternal drone: two detuned saws through a lowpass
  var o1 = AU.ctx.createOscillator(), o2 = AU.ctx.createOscillator();
  o1.type = 'sawtooth'; o2.type = 'sawtooth';
  o1.frequency.value = 55; o2.frequency.value = 55.6;
  var f = AU.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
  var g = AU.ctx.createGain(); g.gain.value = 0.05;
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(AU.musicG);
  o1.start(); o2.start();
  AU.seqT = auNow() + 0.1; AU.seqStep = 0;
  setInterval(musicTick, 240);
}

/* --- SFX --- */
var pickupCombo = 0, pickupT = 0;
var SFX = {
  click: function () { tone(660, 0.07, 'triangle', 0.15); },
  bite: function (crit) {
    noise(0.09, 0.32, 900);
    tone(crit ? 220 : 160, 0.12, 'square', 0.16, AU.sfxG, 70);
    if (crit) tone(880, 0.18, 'sawtooth', 0.1, AU.sfxG, 220);
  },
  chain: function () { tone(1400, 0.08, 'sawtooth', 0.08, AU.sfxG, 500); },
  pickup: function () {
    var now = performance.now() / 1000;
    if (now - pickupT > 0.9) pickupCombo = 0;
    pickupT = now; pickupCombo = Math.min(pickupCombo + 1, 24);
    tone(420 + pickupCombo * 28, 0.09, 'sine', 0.14);
  },
  levelup: function () {
    var seq = [220, 261.63, 329.63, 440];
    for (var i = 0; i < seq.length; i++) tone(seq[i], 0.35, 'triangle', 0.2, AU.sfxG, null, i * 0.09);
  },
  bell: function () {
    // church bell: inharmonic partials, long decay
    var base = 196;
    [1, 2.02, 2.74, 3.76].forEach(function (p, i) {
      tone(base * p, 2.8 - i * 0.4, 'sine', 0.22 / (i + 1), AU.sfxG, null, i * 0.012);
    });
  },
  hurt: function () {
    noise(0.16, 0.3, 300);
    tone(110, 0.2, 'sawtooth', 0.22, AU.sfxG, 55);
  },
  dash: function () { noise(0.28, 0.2, 2400, 'highpass'); tone(300, 0.25, 'sine', 0.1, AU.sfxG, 900); },
  whip: function () { noise(0.12, 0.3, 3200, 'bandpass'); tone(700, 0.1, 'square', 0.1, AU.sfxG, 200); },
  nova: function () {
    tone(70, 1.1, 'sine', 0.5, AU.sfxG, 30);
    noise(0.7, 0.3, 500);
    tone(1318, 0.8, 'sine', 0.06, AU.sfxG, 1320);
  },
  shoot: function () { tone(900, 0.07, 'square', 0.07, AU.sfxG, 300); noise(0.05, 0.1, 2000); },
  priest: function () {
    tone(174, 0.8, 'triangle', 0.14, AU.sfxG, 174);
    tone(261, 0.8, 'triangle', 0.1, AU.sfxG, 261, 0.05);
  },
  novaHit: function () { tone(140, 0.5, 'sawtooth', 0.25, AU.sfxG, 60); noise(0.3, 0.25, 700); },
  dawn: function () {
    tone(220, 2.2, 'sawtooth', 0.12, AU.sfxG, 880);
    tone(277, 2.2, 'sawtooth', 0.1, AU.sfxG, 1108, 0.1);
    noise(1.6, 0.12, 4000, 'highpass');
  },
  boss: function () {
    tone(65, 1.2, 'sawtooth', 0.4, AU.sfxG, 45);
    tone(98, 1.0, 'square', 0.2, AU.sfxG, 60, 0.15);
  },
  charm: function () { tone(523, 0.2, 'sine', 0.16); tone(784, 0.3, 'sine', 0.16, AU.sfxG, null, 0.12); },
  thwip: function () { // wet droplet drink
    noise(0.06, 0.2, 2800, 'highpass');
    tone(300, 0.09, 'sine', 0.14, AU.sfxG, 700);
  },
  surge: function () { // the predator wakes
    tone(55, 1.4, 'sawtooth', 0.4, AU.sfxG, 220);
    tone(110, 1.2, 'sawtooth', 0.25, AU.sfxG, 440, 0.1);
    tone(660, 0.9, 'sine', 0.1, AU.sfxG, 1320, 0.2);
    noise(0.8, 0.2, 600);
  },
  batscreech: function () {
    for (var i = 0; i < 3; i++) tone(2400 - i * 300, 0.12, 'square', 0.08, AU.sfxG, 900, i * 0.07);
    noise(0.3, 0.18, 5000, 'highpass');
  },
  chest: function () { // ceremonial loot fanfare
    var seq = [392, 523.25, 659.25, 783.99, 1046.5];
    for (var i = 0; i < seq.length; i++) tone(seq[i], 0.4, 'triangle', 0.2, AU.sfxG, null, i * 0.1);
    tone(98, 0.8, 'sine', 0.25, AU.sfxG, 49);
  },
  sizzle: function () { // dawn warning: light about to bite
    noise(0.7, 0.3, 6000, 'highpass');
    tone(1800, 0.5, 'sine', 0.08, AU.sfxG, 900);
  },
  bossSting: function () { // Van Helsing's final prayer
    var seq = [146.83, 138.59, 146.83, 110];
    for (var i = 0; i < seq.length; i++) {
      tone(seq[i], 0.7, 'sawtooth', 0.22, AU.sfxG, null, i * 0.28);
      tone(seq[i] / 2, 0.7, 'triangle', 0.18, AU.sfxG, null, i * 0.28);
    }
  },
  win: function () {
    var seq = [261.63, 329.63, 392, 523.25, 659.25];
    for (var i = 0; i < seq.length; i++) tone(seq[i], 0.5, 'triangle', 0.2, AU.sfxG, null, i * 0.13);
  },
  lose: function () {
    var seq = [220, 196, 164.81, 130.81];
    for (var i = 0; i < seq.length; i++) tone(seq[i], 0.7, 'triangle', 0.2, AU.sfxG, null, i * 0.22);
  }
};

/* ================= GAME STATE ================= */
var STEP = 1 / 60;
var G = {
  mode: 'menu', api: null, seed: 1, night: 1,
  daily: false, dailyDate: null, practice: false,
  cam: { x: 1100, y: 1100 }, shakeT: 0, shakeMag: 0, hitStop: 0,
  acc: 0, last: 0,
  particles: [], dmgNums: [], bubbles: [], fx: [],
  decor: [], fogBlobs: [],
  dawn: false, bossMusic: false, sunFlash: 0, bloodMoonTint: 0,
  carry: null, // upgrades carried between nights
  stats: { kills: 0, blood: 0 },
  won: false
};
for (var pi = 0; pi < 420; pi++) G.particles.push({ t: 1, life: 1 }); // pooled, t>=life = free

function pSpawn(x, y, vx, vy, life, size, color, grav) {
  for (var i = 0; i < G.particles.length; i++) {
    var p = G.particles[i];
    if (p.t >= p.life) {
      p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.t = 0; p.life = life;
      p.size = size; p.color = color; p.grav = grav || 0;
      return;
    }
  }
}
function bloodBurst(x, y, n, big) {
  for (var i = 0; i < n; i++) {
    var a = Math.random() * TAU, sp = 60 + Math.random() * (big ? 320 : 180);
    pSpawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
      0.4 + Math.random() * 0.5, 2 + Math.random() * (big ? 6 : 3.5),
      Math.random() < 0.3 ? '#ff6b6b' : '#c1121f', 300);
  }
}
function shake(mag, t) { G.shakeMag = Math.max(G.shakeMag, mag); G.shakeT = Math.max(G.shakeT, t); }
// hit-stop: a heavy freeze where the sim holds its breath but the world keeps breathing.
// duration in ms; long values serve the heavy gothic feel — never snappy, never skipped.
function hitStop(ms) { G.hitStop = Math.max(G.hitStop, ms / 1000); }

/* ================= HAPTICS ================= */
// navigator.vibrate vocabulary, fully feature-detected so iOS (no vibrate) is a silent no-op.
// Honors prefers-reduced-motion; toggleable from the pause menu. Pref stored outside the save.
var HAP = {
  on: true, rm: false,
  init: function () {
    try { this.rm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { this.rm = false; }
    try { var v = localStorage.getItem('bm_haptics'); if (v === '0') this.on = false; } catch (e) {}
  },
  set: function (on) {
    this.on = !!on;
    try { localStorage.setItem('bm_haptics', this.on ? '1' : '0'); } catch (e) {}
  },
  buzz: function (pat) {
    if (!this.on || this.rm) return;
    try { if (navigator.vibrate) navigator.vibrate(pat); } catch (e) {}
  },
  light: function () { this.buzz(12); },          // bat-form snap, soft taps
  medium: function () { this.buzz(30); },         // heavy confirm
  success: function () { this.buzz([12, 40, 12]); },  // elite slain, chest claimed
  warning: function () { this.buzz([20, 60, 20]); },   // dawn breaks, Helsing stalks
  error: function () { this.buzz([40, 80, 40, 40, 80, 40]); } // the hunter's blow lands on you
};
function bubble(x, y, text) {
  if (G.bubbles.length > 6) G.bubbles.shift();
  G.bubbles.push({ x: x, y: y, text: text, t: 2.4 });
}
function dmgNum(x, y, dmg, crit) {
  if (G.dmgNums.length > 46) G.dmgNums.shift();
  G.dmgNums.push({ x: x + (Math.random() - 0.5) * 14, y: y - 14, dmg: dmg, t: 0.8, crit: crit });
}
function banner(text) {
  var b = document.getElementById('banner');
  b.textContent = text; b.classList.remove('hidden');
  // restart the CSS animation
  void b.offsetWidth;
  b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  clearTimeout(b._t);
  b._t = setTimeout(function () { b.classList.add('hidden'); }, 2600);
}
function toast(text) {
  var el = document.getElementById('toast');
  el.textContent = text; el.classList.remove('hidden');
  void el.offsetWidth;
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.classList.add('hidden'); }, 2200);
}

/* ================= INPUT ================= */
var IN = { mx: 0, my: 0, dash: false, bat: false, keys: {} };
var dragId = null, dragOX = 0, dragOY = 0;
var lastTapT = 0;

canvas.addEventListener('touchstart', function (e) {
  e.preventDefault(); auInit();
  if (dragId !== null) return;
  var t = e.changedTouches[0];
  dragId = t.identifier; dragOX = t.clientX; dragOY = t.clientY;
}, { passive: false });
canvas.addEventListener('touchmove', function (e) {
  e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    if (t.identifier === dragId) {
      var dx = (t.clientX - dragOX) / 55, dy = (t.clientY - dragOY) / 55;
      var l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      IN.mx = dx; IN.my = dy;
    }
  }
}, { passive: false });
function endTouch(e) {
  for (var i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === dragId) {
      dragId = null; IN.mx = 0; IN.my = 0;
      // double-tap anywhere = bat-form panic button
      var now = performance.now();
      if (now - lastTapT < 300 && G.mode === 'playing') IN.bat = true;
      lastTapT = now;
    }
  }
}
canvas.addEventListener('touchend', endTouch);
canvas.addEventListener('touchcancel', endTouch);

// the old dash button is now the BAT button (bat-form panic)
var dashBtn = document.getElementById('dash-btn');
dashBtn.innerHTML = '🦇';
dashBtn.title = 'Bat form (B)';
dashBtn.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); auInit(); IN.bat = true; }, { passive: false });
dashBtn.addEventListener('mousedown', function (e) { e.preventDefault(); IN.bat = true; });

window.addEventListener('keydown', function (e) {
  var k = e.key.toLowerCase();
  IN.keys[k] = true;
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) >= 0) e.preventDefault();
  if (k === ' ') { auInit(); IN.bat = true; }   // space = bat form
  if (k === 'b' && G.mode === 'playing') IN.bat = true;
  if (k === 'p' || k === 'escape') togglePause();
  if (G.mode === 'levelup' && ['1', '2', '3'].indexOf(k) >= 0) pickUpgrade(+k - 1);
});
window.addEventListener('keyup', function (e) { IN.keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', function () { IN.keys = {}; IN.mx = 0; IN.my = 0; dragId = null; });
document.addEventListener('visibilitychange', function () {
  if (document.hidden && G.mode === 'playing') togglePause(true);
});

function pollKeys() {
  var k = IN.keys, x = 0, y = 0;
  if (k.a || k.arrowleft) x -= 1;
  if (k.d || k.arrowright) x += 1;
  if (k.w || k.arrowup) y -= 1;
  if (k.s || k.arrowdown) y += 1;
  if (x || y) { IN.mx = x; IN.my = y; }
  // touch drag overrides only while active; keyboard zeroes when released
  else if (dragId === null) { IN.mx = 0; IN.my = 0; }
}

/* ================= RENDER ================= */
function worldToScreen(x, y) { return { x: x - G.cam.x + W / 2, y: y - G.cam.y + H / 2 }; }

function render() {
  var sim = G.api ? G.api.sim : null;
  ctx.fillStyle = '#0d0a14';
  ctx.fillRect(0, 0, W, H);
  if (!sim) return;
  var P = sim.player;

  // camera
  var tx = clamp(P.x, W / 2 - 100, BloodMoonSim.WORLD - W / 2 + 100);
  var ty = clamp(P.y, H / 2 - 100, BloodMoonSim.WORLD - H / 2 + 100);
  if (W > BloodMoonSim.WORLD) tx = BloodMoonSim.WORLD / 2;
  if (H > BloodMoonSim.WORLD) ty = BloodMoonSim.WORLD / 2;
  G.cam.x = lerp(G.cam.x, tx, 0.12);
  G.cam.y = lerp(G.cam.y, ty, 0.12);
  var shx = 0, shy = 0;
  if (G.shakeT > 0) {
    G.shakeT -= 1 / 60;
    shx = (Math.random() - 0.5) * G.shakeMag * G.shakeT * 8;
    shy = (Math.random() - 0.5) * G.shakeMag * G.shakeT * 8;
    if (G.shakeT <= 0) G.shakeMag = 0;
  }
  var ox = -G.cam.x + W / 2 + shx, oy = -G.cam.y + H / 2 + shy;

  ctx.save();
  ctx.translate(ox, oy);

  var VW = BloodMoonSim.WORLD;

  // ground
  ctx.fillStyle = '#100c18';
  ctx.fillRect(0, 0, VW, VW);
  // ground detail dots (precomputed)
  ctx.fillStyle = '#161021';
  for (var di = 0; di < G.decor.length; di++) {
    var dd = G.decor[di];
    ctx.fillRect(dd.x, dd.y, dd.s, dd.s);
  }
  // world border: crooked fence of faint red
  ctx.strokeStyle = 'rgba(122,12,20,0.55)'; ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, VW - 16, VW - 16);

  // shadow patches (safe zones) — darker earth
  ctx.fillStyle = 'rgba(6,4,12,0.55)';
  for (var si = 0; si < sim.shadows.length; si++) {
    var sh = sim.shadows[si];
    ctx.fillRect(sh.x, sh.y, sh.w, sh.h);
  }

  // decor: tree or house centered on each shadow patch
  for (var ci = 0; ci < sim.shadows.length; ci++) {
    var s2 = sim.shadows[ci];
    var cx = s2.x + s2.w / 2, cy = s2.y + s2.h / 2;
    if (ci % 3 === 2) ctx.drawImage(SPR.house, cx - 80, cy - 90, 160, 160);
    else ctx.drawImage(SPR.tree, cx - 56, cy - 70, 112, 128);
  }

  // coffin (home base, dawn-safe)
  ctx.drawImage(SPR.coffin, sim.coffin.x - 55, sim.coffin.y - 55, 110, 110);
  ctx.strokeStyle = 'rgba(201,162,39,0.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(sim.coffin.x, sim.coffin.y, sim.coffin.r, 0, TAU); ctx.stroke();

  // blood orbs
  for (var oi = 0; oi < sim.orbs.length; oi++) {
    var o = sim.orbs[oi];
    var pulse = 1 + Math.sin(o.t * 9) * 0.15;
    var os = 20 * pulse;
    ctx.drawImage(SPR.orb, o.x - os / 2, o.y - os / 2, os, os);
  }

  // blood droplets (the thirst loop) — bright arterial red, white glint
  for (var dri = 0; dri < sim.drops.length; dri++) {
    var dr = sim.drops[dri];
    var ds = 11 + Math.sin(dr.t * 12) * 1.5;
    ctx.fillStyle = '#d90429';
    ctx.beginPath(); ctx.arc(dr.x, dr.y, ds / 2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.arc(dr.x - ds * 0.16, dr.y - ds * 0.18, ds * 0.14, 0, TAU); ctx.fill();
  }

  // sanctified ground (priest circles that linger)
  for (var hzi = 0; hzi < sim.holy.length; hzi++) {
    var hz = sim.holy[hzi];
    var hp2 = 0.5 + 0.3 * Math.sin(performance.now() / 150);
    ctx.strokeStyle = 'rgba(255,215,130,' + hp2.toFixed(2) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(hz.x, hz.y, hz.r, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,215,130,0.07)';
    ctx.beginPath(); ctx.arc(hz.x, hz.y, hz.r, 0, TAU); ctx.fill();
    // cross mark
    ctx.strokeStyle = 'rgba(255,215,130,' + (hp2 * 0.7).toFixed(2) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hz.x - 12, hz.y); ctx.lineTo(hz.x + 12, hz.y);
    ctx.moveTo(hz.x, hz.y - 16); ctx.lineTo(hz.x, hz.y + 8);
    ctx.stroke();
  }

  // fire patches (torch trails + your kindled veins)
  for (var fpi = 0; fpi < sim.fires.length; fpi++) {
    var fp = sim.fires[fpi];
    var fl = 26 + Math.sin(performance.now() / 90 + fp.x) * 5;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55;
    ctx.drawImage(GLOW.orange, fp.x - fl, fp.y - fl, fl * 2, fl * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // drifting shade islands (dawn heist)
  if (sim.state === 'dawn') {
    ctx.fillStyle = 'rgba(4,2,10,0.62)';
    for (var shii = 0; shii < sim.shadeIslands.length; shii++) {
      var isl = sim.shadeIslands[shii];
      ctx.fillRect(isl.x, isl.y, isl.w, isl.h);
      ctx.strokeStyle = 'rgba(157,78,221,0.35)'; ctx.lineWidth = 2;
      ctx.strokeRect(isl.x, isl.y, isl.w, isl.h);
    }
  }

  // enemy bolts (stakes)
  ctx.strokeStyle = '#e0aaff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (var bi = 0; bi < sim.bolts.length; bi++) {
    var bo = sim.bolts[bi];
    ctx.beginPath();
    ctx.moveTo(bo.x - bo.vx * 0.03, bo.y - bo.vy * 0.03);
    ctx.lineTo(bo.x, bo.y);
    ctx.stroke();
  }

  // priest telegraphs + nova rings (fx list)
  for (var fi = G.fx.length - 1; fi >= 0; fi--) {
    var f = G.fx[fi];
    f.t -= 1 / 60;
    if (f.t <= 0) { G.fx.splice(fi, 1); continue; }
    if (f.kind === 'telegraph') {
      var a = 0.25 + 0.35 * Math.abs(Math.sin(f.t * 10));
      ctx.strokeStyle = 'rgba(255,220,120,' + a.toFixed(2) + ')';
      ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.6 + 0.4 * (f.t / f.max)), 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    } else if (f.kind === 'novahit') {
      ctx.strokeStyle = 'rgba(255,210,100,' + (f.t / f.max * 0.9).toFixed(2) + ')';
      ctx.lineWidth = 14 * (f.t / f.max) + 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.15 - f.t / f.max * 0.3), 0, TAU); ctx.stroke();
    } else if (f.kind === 'whip') {
      var wp = 1 - f.t / f.max;
      ctx.strokeStyle = 'rgba(230,57,70,' + (1 - wp).toFixed(2) + ')';
      ctx.lineWidth = 10 * (1 - wp) + 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(f.x, f.y, 40 + wp * 95, f.ang - 1.0, f.ang + 1.0); ctx.stroke();
    } else if (f.kind === 'novaring') {
      var np = 1 - f.t / f.max;
      ctx.strokeStyle = 'rgba(157,78,221,' + (1 - np * 0.7).toFixed(2) + ')';
      ctx.lineWidth = 18 * (1 - np) + 4;
      ctx.beginPath(); ctx.arc(f.x, f.y, np * f.r, 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - np) * 0.5;
      ctx.drawImage(GLOW.purple, f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    } else if (f.kind === 'bite') {
      var bp = 1 - f.t / f.max;
      ctx.strokeStyle = 'rgba(255,120,120,' + (1 - bp).toFixed(2) + ')';
      ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x + Math.cos(f.ang) * (30 + bp * 55), f.y + Math.sin(f.ang) * (30 + bp * 55));
      ctx.stroke();
    } else if (f.kind === 'chain') {
      ctx.strokeStyle = 'rgba(255,150,150,' + (f.t / f.max * 0.9).toFixed(2) + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1);
      var mxp = (f.x1 + f.x2) / 2 + (Math.random() - 0.5) * 30;
      var myp = (f.y1 + f.y2) / 2 + (Math.random() - 0.5) * 30;
      ctx.quadraticCurveTo(mxp, myp, f.x2, f.y2); ctx.stroke();
    } else if (f.kind === 'aimline') {
      // hunter / helsing telegraph: thin red sight-line, pulsing
      var aa = 0.35 + 0.4 * Math.abs(Math.sin(f.t * 14));
      ctx.strokeStyle = 'rgba(255,40,40,' + aa.toFixed(2) + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      // danger chevrons at the far end
      ctx.fillStyle = 'rgba(255,40,40,' + aa.toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(f.x2, f.y2, 5, 0, TAU); ctx.fill();
    }
  }

  // allies (charmed villagers) — purple ring
  for (var ai = 0; ai < sim.allies.length; ai++) {
    var al = sim.allies[ai];
    drawEnemy(al);
    ctx.strokeStyle = 'rgba(157,78,221,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(al.x, al.y, al.r + 5, 0, TAU); ctx.stroke();
  }

  // enemies
  for (var ei = 0; ei < sim.enemies.length; ei++) drawEnemy(sim.enemies[ei]);

  // bats
  if (P.bats > 0) {
    var frame = (performance.now() / 120 | 0) % 2;
    for (var bati = 0; bati < P.bats; bati++) {
      var ba = P.batAng + (bati / P.bats) * TAU;
      var bx = P.x + Math.cos(ba) * 52, by = P.y + Math.sin(ba) * 52;
      ctx.drawImage(SPR.bat[frame], bx - 20, by - 20, 40, 40);
    }
  }

  // crimson aura
  if (P.auraR > 0) {
    var ap = 0.5 + 0.5 * Math.sin(performance.now() / 300);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.16 + ap * 0.08;
    ctx.drawImage(GLOW.red, P.x - P.auraR, P.y - P.auraR, P.auraR * 2, P.auraR * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // player vampire — a real gothic man (drawVampire), not a blob
  var nowP = performance.now();
  drawVampire(P, nowP);
  // dash cooldown arc near player
  if (P.upg.dash && P.dashCd > 0) {
    ctx.strokeStyle = 'rgba(157,78,221,0.6)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(P.x, P.y, 26, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - P.dashCd / P.dashMax)); ctx.stroke();
  }

  // boss HP bar (world-anchored)
  if (sim.bossRef && !sim.bossRef.dead) {
    var bb = sim.bossRef, bs = worldToScreen(bb.x, bb.y);
    var bw = 200;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bs.x - bw / 2, bs.y - 78, bw, 10);
    ctx.fillStyle = '#e63946';
    ctx.fillRect(bs.x - bw / 2, bs.y - 78, bw * clamp(bb.hp / bb.maxHp, 0, 1), 10);
    ctx.fillStyle = '#e8e4d8'; ctx.font = '11px Georgia'; ctx.textAlign = 'center';
    ctx.fillText('VAN HELSING', bs.x, bs.y - 84);
  }

  // particles
  for (var qi = 0; qi < G.particles.length; qi++) {
    var q = G.particles[qi];
    if (q.t >= q.life) continue;
    q.t += 1 / 60;
    q.x += q.vx / 60; q.y += q.vy / 60;
    q.vx *= 0.96; q.vy *= 0.96; q.vy += (q.grav || 0) / 60;
    var qa = 1 - q.t / q.life;
    ctx.globalAlpha = qa;
    ctx.fillStyle = q.color;
    ctx.beginPath(); ctx.arc(q.x, q.y, q.size * qa + 0.5, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // torch lights + house windows (additive)
  ctx.globalCompositeOperation = 'lighter';
  for (var li = 0; li < sim.enemies.length; li++) {
    var le = sim.enemies[li];
    if (le.type === 'torch') {
      var flick = 120 + Math.sin(performance.now() / 130 + le.id) * 18;
      ctx.globalAlpha = 0.5;
      ctx.drawImage(GLOW.orange, le.x - flick, le.y - flick, flick * 2, flick * 2);
    }
  }
  ctx.globalAlpha = 0.35;
  for (var hi = 0; hi < sim.shadows.length; hi += 3) {
    var hh = sim.shadows[hi];
    ctx.drawImage(GLOW.orange, hh.x + hh.w / 2 - 40, hh.y + hh.h / 2 - 40, 80, 80);
  }
  // moonlight kiss on the player
  ctx.globalAlpha = 0.28;
  ctx.drawImage(GLOW.pale, P.x - 90, P.y - 90, 180, 180);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // dawn sunlight bands
  if (sim.state === 'dawn') {
    ctx.globalCompositeOperation = 'lighter';
    for (var sbi = 0; sbi < sim.sunBands.length; sbi++) {
      var cx = sim.sunBands[sbi];
      var grd = ctx.createLinearGradient(cx - 170, 0, cx + 170, 0);
      grd.addColorStop(0, 'rgba(255,180,80,0)');
      grd.addColorStop(0.5, 'rgba(255,180,80,0.4)');
      grd.addColorStop(1, 'rgba(255,180,80,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(cx - 170, -200, 340, VW + 400);
    }
    ctx.globalCompositeOperation = 'source-over';
    // overall dawn wash
    var dawnP = 1 - sim.dawnT / BloodMoonSim.DAWN_LEN;
    ctx.fillStyle = 'rgba(255,140,60,' + (dawnP * 0.22).toFixed(3) + ')';
    ctx.fillRect(-ox, -oy, W, H);
  }

  // speech bubbles
  ctx.textAlign = 'center';
  for (var ui = G.bubbles.length - 1; ui >= 0; ui--) {
    var bu = G.bubbles[ui];
    bu.t -= 1 / 60;
    if (bu.t <= 0) { G.bubbles.splice(ui, 1); continue; }
    ctx.font = '13px Georgia';
    var tw = ctx.measureText(bu.text).width + 18;
    var ba2 = clamp(bu.t, 0, 1);
    ctx.globalAlpha = ba2;
    ctx.fillStyle = 'rgba(12,8,18,0.88)';
    roundRect(bu.x - tw / 2, bu.y - 52, tw, 26, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(201,162,39,0.6)'; ctx.lineWidth = 1;
    roundRect(bu.x - tw / 2, bu.y - 52, tw, 26, 8); ctx.stroke();
    ctx.fillStyle = '#e8e4d8';
    ctx.fillText(bu.text, bu.x, bu.y - 34);
    ctx.globalAlpha = 1;
  }

  // damage numbers
  for (var ni = G.dmgNums.length - 1; ni >= 0; ni--) {
    var dn = G.dmgNums[ni];
    dn.t -= 1 / 60; dn.y -= 34 / 60;
    if (dn.t <= 0) { G.dmgNums.splice(ni, 1); continue; }
    ctx.globalAlpha = clamp(dn.t * 2, 0, 1);
    ctx.font = dn.crit ? 'bold 17px Georgia' : '13px Georgia';
    ctx.fillStyle = dn.crit ? '#ffd166' : '#ffb3b3';
    ctx.fillText(dn.dmg, dn.x, dn.y);
    ctx.globalAlpha = 1;
  }

  ctx.restore(); // un-translate

  // night vignette
  var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(5,3,12,0)');
  vg.addColorStop(1, 'rgba(5,3,12,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // low-hp heartbeat vignette
  var P2 = sim.player;
  if (P2.hp < P2.maxHp * 0.3 && sim.state !== 'dead') {
    var hb = 0.25 + 0.2 * Math.sin(performance.now() / 280);
    var rg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    rg.addColorStop(0, 'rgba(180,10,20,0)');
    rg.addColorStop(1, 'rgba(180,10,20,' + hb.toFixed(2) + ')');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }

  // Blood Surge: red vignette pulse
  if (P2.surgeT > 0) {
    var sp = 0.3 + 0.12 * Math.sin(performance.now() / 140);
    var svg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72);
    svg.addColorStop(0, 'rgba(200,10,25,0)');
    svg.addColorStop(1, 'rgba(200,10,25,' + sp.toFixed(2) + ')');
    ctx.fillStyle = svg;
    ctx.fillRect(0, 0, W, H);
  }

  // blood-moon omen tint: the world goes red, kills feed double
  if (sim.bloodMoonT > 0) {
    ctx.fillStyle = 'rgba(160,8,20,0.10)';
    ctx.fillRect(0, 0, W, H);
  }

  // dawn warning flash: amber edges when the light is about to bite
  if (G.sunFlash > 0) {
    G.sunFlash -= 1 / 60;
    var sfa = clamp(G.sunFlash, 0, 1) * 0.4;
    var sfg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75);
    sfg.addColorStop(0, 'rgba(255,180,80,0)');
    sfg.addColorStop(1, 'rgba(255,180,80,' + sfa.toFixed(2) + ')');
    ctx.fillStyle = sfg;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawEnemy(e) {
  var spr = SPR[e.type] || SPR.villager;
  var size = e.type === 'vanhelsing' ? 110 : (e.type === 'priest' ? 74 : 68);
  // face movement direction-ish: face the player is fine for top-down
  ctx.drawImage(spr, e.x - size / 2, e.y - size / 2 - 6, size, size);
  // hp pip for tough enemies
  if ((e.type === 'priest' || e.type === 'hunter' || e.type === 'vanhelsing') && e.hp < e.maxHp) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(e.x - 20, e.y - size / 2 - 14, 40, 5);
    ctx.fillStyle = '#e63946';
    ctx.fillRect(e.x - 20, e.y - size / 2 - 14, 40 * clamp(e.hp / e.maxHp, 0, 1), 5);
  }
  // priest casting glow
  if (e.type === 'priest' && e.state === 'cast') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(performance.now() / 90);
    ctx.drawImage(GLOW.pale, e.x - 40, e.y - 40, 80, 80);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ============ THE VAMPIRE — a real gothic man, drawn live ============
   Pale face, dark swept hair, high collar, red-lined cape that flares
   behind his velocity. During Blood Surge the cape billows and his eyes
   burn. Bat Form bursts him into a swirl of bats that re-form. */
function drawVampire(P, now) {
  var speed = Math.hypot(P.vx, P.vy);
  var flare = clamp(speed / 450, 0.15, 1);
  var surging = P.surgeT > 0;

  // high-contrast player marker (legibility guardrail)
  ctx.strokeStyle = surging ? 'rgba(255,42,42,0.75)' : 'rgba(232,228,216,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(P.x, P.y, 23, 0, TAU); ctx.stroke();

  // --- BAT FORM: burst into bats that swirl and re-form ---
  if (P.batFormT > 0) {
    var prog = 1 - P.batFormT / 0.8;                 // 0 → 1
    var R = 10 + 36 * Math.sin(prog * Math.PI);      // out, then back in
    for (var i = 0; i < 6; i++) {
      var a = now / 85 + (i / 6) * TAU;
      var bx = P.x + Math.cos(a) * R, by = P.y + Math.sin(a) * R * 0.8;
      var fr = (((now / 110) | 0) + i) % 2;
      ctx.drawImage(SPR.bat[fr], bx - 16, by - 16, 32, 32);
    }
    return;
  }

  ctx.save();
  ctx.translate(P.x, P.y);
  ctx.rotate(P.facing + Math.PI / 2);
  var blink = P.invuln > 0 && (((now / 90) | 0) % 2 === 0);
  ctx.globalAlpha = blink ? 0.35 : 1;

  var capeLen = 34 + flare * 26;
  var flutter = Math.sin(now / 130) * (3 + flare * 5);

  // --- cape (outer, dark) flaring backward ---
  ctx.fillStyle = '#16121f';
  ctx.beginPath();
  ctx.moveTo(-16, -6);
  ctx.quadraticCurveTo(-26 - flare * 14, capeLen * 0.5, -20 - flare * 18 + flutter, capeLen);
  ctx.quadraticCurveTo(0, capeLen - 8 + flutter * 0.5, 20 + flare * 18 + flutter, capeLen);
  ctx.quadraticCurveTo(26 + flare * 14, capeLen * 0.5, 16, -6);
  ctx.closePath(); ctx.fill();
  // --- red inner lining ---
  ctx.fillStyle = surging ? '#e63946' : '#7a0c14';
  ctx.beginPath();
  ctx.moveTo(-11, 0);
  ctx.quadraticCurveTo(-16 - flare * 10, capeLen * 0.55, -13 - flare * 12 + flutter, capeLen - 6);
  ctx.quadraticCurveTo(0, capeLen - 12, 13 + flare * 12 + flutter, capeLen - 6);
  ctx.quadraticCurveTo(16 + flare * 10, capeLen * 0.55, 11, 0);
  ctx.closePath(); ctx.fill();
  // --- high collar wings ---
  ctx.fillStyle = '#1e1828';
  ctx.beginPath(); ctx.moveTo(-14, -10); ctx.lineTo(-30, -34); ctx.lineTo(-12, -22); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(14, -10); ctx.lineTo(30, -34); ctx.lineTo(12, -22); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#5a189a'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-14, -10); ctx.lineTo(-30, -34); ctx.lineTo(-12, -22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(14, -10); ctx.lineTo(30, -34); ctx.lineTo(12, -22); ctx.stroke();
  // --- body: dark vest ---
  ctx.fillStyle = '#241a30';
  ctx.beginPath(); ctx.ellipse(0, 6, 13, 17, 0, 0, TAU); ctx.fill();
  // white shirt front + red cravat
  ctx.fillStyle = '#e8e4d8';
  ctx.beginPath(); ctx.moveTo(-5, -8); ctx.lineTo(5, -8); ctx.lineTo(0, 12); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c1121f';
  ctx.beginPath(); ctx.arc(0, -4, 3.2, 0, TAU); ctx.fill();
  // --- arms + pale hands ---
  ctx.fillStyle = '#241a30';
  ctx.beginPath(); ctx.ellipse(-15, 4, 5, 10, 0.3, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(15, 4, 5, 10, -0.3, 0, TAU); ctx.fill();
  ctx.fillStyle = '#f0e6d2';
  ctx.beginPath(); ctx.arc(-17, 13, 3.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(17, 13, 3.4, 0, TAU); ctx.fill();
  // --- head: pale, dark swept hair ---
  ctx.fillStyle = '#0d0a12';
  ctx.beginPath(); ctx.arc(0, -22, 12.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#f0e6d2';
  ctx.beginPath(); ctx.arc(0, -20, 10, 0, TAU); ctx.fill();
  // swept fringe with widow's peak
  ctx.fillStyle = '#0d0a12';
  ctx.beginPath();
  ctx.moveTo(-10, -22); ctx.quadraticCurveTo(0, -34, 10, -22);
  ctx.quadraticCurveTo(4, -25, 0, -23); ctx.quadraticCurveTo(-4, -25, -10, -22);
  ctx.fill();
  // side locks
  ctx.fillRect(-12, -24, 3.5, 12);
  ctx.fillRect(8.5, -24, 3.5, 12);
  // --- eyes: red, burning during surge ---
  if (surging) { ctx.save(); ctx.shadowColor = '#ff2222'; ctx.shadowBlur = 14; }
  ctx.fillStyle = surging ? '#ff2a2a' : '#b3122e';
  ctx.beginPath(); ctx.arc(-4, -20, surging ? 2.6 : 1.8, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(4, -20, surging ? 2.6 : 1.8, 0, TAU); ctx.fill();
  if (surging) ctx.restore();
  // --- fangs ---
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(-3.5, -14); ctx.lineTo(-2, -11); ctx.lineTo(-0.5, -14); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0.5, -14); ctx.lineTo(2, -11); ctx.lineTo(3.5, -14); ctx.fill();

  ctx.restore();
  ctx.globalAlpha = 1;

  // --- surge aura ---
  if (surging) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.32 + 0.14 * Math.sin(now / 120);
    ctx.drawImage(GLOW.red, P.x - 60, P.y - 60, 120, 120);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

/* ================= EVENT DRAIN → effects + audio ================= */
var HOUR_NAMES = ['FIRST', 'SECOND', 'THIRD', 'FOURTH'];
function drainEvents() {
  var evs = G.api.sim.events;
  for (var i = 0; i < evs.length; i++) {
    var e = evs[i];
    switch (e.t) {
      case 'hit': dmgNum(e.x, e.y, e.dmg, e.dmg >= 30); break;
      case 'kill':
        bloodBurst(e.x, e.y, e.big ? 30 : 9, e.big);
        if (e.big) { shake(10, 0.5); SFX.nova(); banner('HELSING IS SLAIN'); hitStop(90); HAP.success(); }
        break;
      case 'bite': G.fx.push({ kind: 'bite', x: e.x, y: e.y, ang: e.ang, t: 0.16, max: 0.16 }); SFX.bite(e.crit); break;
      case 'chain': G.fx.push({ kind: 'chain', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, t: 0.14, max: 0.14 }); SFX.chain(); break;
      case 'pickup': SFX.pickup(); break;
      case 'hurt':
        SFX.hurt(); shake(7, 0.28); HAP.error();
        for (var hp2 = 0; hp2 < 6; hp2++) {
          var a = Math.random() * TAU;
          pSpawn(G.api.sim.player.x, G.api.sim.player.y, Math.cos(a) * 160, Math.sin(a) * 160, 0.4, 3, '#e63946', 200);
        }
        break;
      case 'dash':
        SFX.dash();
        for (var di = 0; di < 10; di++) {
          var da = Math.random() * TAU;
          pSpawn(e.x, e.y, Math.cos(da) * 90, Math.sin(da) * 90, 0.5, 4, '#9d4edd', 0);
        }
        break;
      case 'whip': G.fx.push({ kind: 'whip', x: e.x, y: e.y, ang: e.ang, t: 0.2, max: 0.2 }); SFX.whip(); break;
      case 'nova':
        G.fx.push({ kind: 'novaring', x: e.x, y: e.y, r: e.r, t: 0.55, max: 0.55 });
        SFX.nova(); shake(11, 0.45);
        break;
      case 'taunt':
        var txt = e.text;
        // silent AI flavor: sometimes swap a villager scream for a fresh AI one
        if (aiTauntPool.length && Math.random() < 0.4 &&
            BloodMoonContent.HELSING_LINES.indexOf(txt) < 0 &&
            BloodMoonContent.DAWN_LINES.indexOf(txt) < 0 &&
            txt !== 'For the Count!' && txt !== 'Impossible…') {
          txt = aiTauntPool.pop();
        }
        bubble(e.x, e.y, txt);
        break;
      case 'bell':
        SFX.bell();
        if (e.n <= 4) banner('🕯 THE ' + HOUR_NAMES[e.n - 1] + ' HOUR TOLLS');
        else banner('🌅 DAWN APPROACHES');
        break;
      case 'dawn': SFX.dawn(); G.dawn = true; banner('☀ DAWN — FEAR THE LIGHT'); HAP.warning(); break;
      case 'boss': SFX.boss(); shake(9, 0.5); banner('VAN HELSING HAS COME'); HAP.warning(); break;
      case 'priestcast':
        G.fx.push({ kind: 'telegraph', x: e.x, y: e.y, r: e.r, t: 1.1, max: 1.1 });
        SFX.priest(); break;
      case 'novahit':
        G.fx.push({ kind: 'novahit', x: e.x, y: e.y, r: e.r, t: 0.4, max: 0.4 });
        SFX.novaHit(); shake(5, 0.2); break;
      case 'shoot': SFX.shoot(); break;
      case 'summon':
        for (var si2 = 0; si2 < 12; si2++) {
          var sa = Math.random() * TAU;
          pSpawn(e.x, e.y, Math.cos(sa) * 140, Math.sin(sa) * 140, 0.5, 3, '#3a3f5c', 0);
        }
        break;
      case 'charm':
        SFX.charm();
        for (var ci2 = 0; ci2 < 14; ci2++) {
          var ca = Math.random() * TAU;
          pSpawn(e.x, e.y, Math.cos(ca) * 120, Math.sin(ca) * 120, 0.6, 3.5, '#9d4edd', 0);
        }
        toast('mesmerized! they fight for you now');
        break;
      case 'surge':
        SFX.surge();
        shake(9, 0.5);
        banner('🩸 BLOOD SURGE — ' + (e.name || '').toUpperCase());
        HAP.warning();
        break;
      case 'surgeend':
        toast('the thirst ebbs… for now');
        break;
      case 'thwip': SFX.thwip(); break;
      case 'batform': {
        SFX.batscreech(); HAP.light();
        for (var bfi = 0; bfi < 16; bfi++) {
          var bfa = Math.random() * TAU;
          pSpawn(e.x, e.y, Math.cos(bfa) * 200, Math.sin(bfa) * 200, 0.6, 4, '#0d0a16', 0);
        }
        break;
      }
      case 'sunwarn':
        SFX.sizzle();
        G.sunFlash = 1.2;
        toast('☀ the light finds you — MOVE');
        break;
      case 'aimline': {
        var alen = 620;
        G.fx.push({
          kind: 'aimline',
          x1: e.x, y1: e.y,
          x2: e.x + Math.cos(e.ang) * alen, y2: e.y + Math.sin(e.ang) * alen,
          t: e.t || 0.8, max: e.t || 0.8
        });
        break;
      }
      case 'aimfan': {
        var flen = 660;
        for (var ffi = -1; ffi <= 1; ffi++) {
          var faa = e.ang + ffi * 0.14;
          G.fx.push({
            kind: 'aimline',
            x1: e.x, y1: e.y,
            x2: e.x + Math.cos(faa) * flen, y2: e.y + Math.sin(faa) * flen,
            t: 0.7, max: 0.7
          });
        }
        SFX.shoot();
        break;
      }
      case 'holylob':
        G.fx.push({ kind: 'telegraph', x: e.x, y: e.y, r: e.r || 130, t: 1.0, max: 1.0 });
        SFX.priest();
        break;
      case 'chest': {
        var offs = G.api.offerUpgrades().filter(function (u) { return u.id !== '__feast'; });
        var pick = offs[(Math.random() * offs.length) | 0];
        if (pick) {
          G.api.applyUpgrade(pick.id);
          banner('🎁 THE CHEST YIELDS: ' + pick.name);
          setTimeout(function () { toast(pick.desc); }, 1400);
        }
        SFX.chest(); shake(8, 0.4); hitStop(60); HAP.success();
        for (var gi2 = 0; gi2 < 30; gi2++) {
          var ga2 = Math.random() * TAU;
          pSpawn(e.x, e.y, Math.cos(ga2) * 240, Math.sin(ga2) * 240, 0.8, 4.5, '#c9a227', 220);
        }
        break;
      }
      case 'elite':
        SFX.boss();
        banner('⚠ ' + (e.type === 'bellringer' ? 'THE BELL-RINGER' : 'THE WITCHFINDER CAPTAIN') + ' STALKS THE NIGHT');
        break;
      case 'omen':
        SFX.bell();
        banner('🔔 ' + e.name);
        if (e.sub) setTimeout(function () { toast(e.sub); }, 1300);
        break;
      case 'bossphase':
        SFX.bossSting();
        shake(10, 0.6);
        banner('🙏 FINAL PRAYER');
        hitStop(80); HAP.warning();
        G.bossMusic = true;
        break;
    }
  }
  evs.length = 0;
}

/* ================= MAIN LOOP ================= */
function frame(now) {
  requestAnimationFrame(frame);
  if (!G.last) G.last = now;
  var dt = Math.min((now - G.last) / 1000, 0.1);
  G.last = now;
  pollKeys();
  if (G.mode === 'playing' && G.api) {
    if (G.hitStop > 0) {
      // heavy freeze: the sim holds its breath while the render loop keeps breathing
      G.hitStop -= dt;
    } else {
      G.acc += dt;
      var n = 0;
      while (G.acc >= STEP && n < 5) {
        var inp = { mx: IN.mx, my: IN.my, bat: IN.bat };
        IN.bat = false; // edge-triggered, one shot per press
        G.api.step(STEP, inp);
        G.acc -= STEP; n++;
        drainEvents();
        if (G.api.sim.pendingLevels > 0) { openLevelUp(); break; }
        if (G.api.sim.over) { endRun(G.api.sim.state === 'won'); break; }
      }
      if (n === 5) G.acc = 0; // spiral of death guard
    }
    updateHUD();
  }
  render();
}

/* ================= HUD ================= */
var elHp = document.getElementById('hp-bar'), elHpG = document.getElementById('hp-ghost'),
    elXp = document.getElementById('xp-bar'), elTimer = document.getElementById('timer'),
    elKills = document.getElementById('kills'), elLvl = document.getElementById('lvl-badge'),
    elNight = document.getElementById('night-label'),
    elBlood = document.getElementById('blood-bar'), elBloodWrap = document.getElementById('blood-wrap');
// DOM text writes are guarded: only touch the DOM when the string actually changed
var _hudCache = {};
function setHudText(el, v) {
  if (_hudCache[el.id] !== v) { _hudCache[el.id] = v; el.textContent = v; }
}
function updateHUD() {
  var sim = G.api.sim, P = sim.player;
  var hpp = clamp(P.hp / P.maxHp * 100, 0, 100);
  elHp.style.width = hpp + '%';
  elHpG.style.width = hpp + '%';
  elXp.style.width = clamp(P.xp / P.xpNext * 100, 0, 100) + '%';
  setHudText(elLvl, '' + P.level);
  setHudText(elKills, '🩸 ' + sim.kills);
  // blood-thirst meter: fills with every drink, surges when full
  elBlood.style.width = clamp(P.bloodM / P.bloodMax * 100, 0, 100) + '%';
  elBloodWrap.classList.toggle('full', P.surgeT > 0);
  if (sim.state === 'dawn') {
    setHudText(elTimer, '☀ DAWN ' + Math.ceil(sim.dawnT) + 's');
    elTimer.classList.add('dawn');
  } else {
    var r = Math.max(0, Math.ceil(sim.nightT));
    setHudText(elTimer, '☾ ' + ((r / 60) | 0) + ':' + ('0' + (r % 60)).slice(-2));
    elTimer.classList.remove('dawn');
  }
  AU.heartOn = P.hp < P.maxHp * 0.3 && !sim.over;
  // bat-form panic button: innate, shows cooldown
  var db = document.getElementById('dash-btn');
  db.classList.remove('hidden');
  db.classList.toggle('cd', P.batCd > 0);
}

/* ================= RUN LIFECYCLE ================= */
function mods() {
  var m = META, bl = BloodMoonContent.BLOODLINES[m.bloodline] || BloodMoonContent.BLOODLINES.swarm;
  return {
    hpMul: bl.hp * (1 + 0.08 * (m.upg.vitality || 0)),
    dmgMul: bl.dmg,
    speedMul: bl.speed * (1 + 0.05 * (m.upg.swiftness || 0)),
    dashCdMul: bl.dashCd,
    xpMul: 1 + 0.08 * (m.upg.appetite || 0),
    verb: bl.verb
  };
}
function startRun(night, opts) {
  opts = opts || {};
  var seed = opts.seed != null ? opts.seed : ((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  G.seed = seed; G.night = night; G.daily = !!opts.daily; G.dailyDate = opts.date || null;
  G.practice = !!opts.practice;
  G.dawn = false; G.acc = 0; G.hitStop = 0; G._submitted = false; G.bossMusic = false; G.sunFlash = 0;
  G.particles.forEach(function (p) { p.t = 1; });
  G.dmgNums.length = 0; G.bubbles.length = 0; G.fx.length = 0;
  G.api = BloodMoonSim.makeSim(seed, {
    night: night, mods: mods(), daily: G.daily || G.practice ? true : undefined,
    nightmare: META.nightmareOn && !G.daily && !G.practice ? true : undefined,
    carry: night > 1 || G.carry ? (G.carry || (night > 1 ? { upg: {}, level: 1 } : null)) : null
  });
  // ground detail from run seed
  var rng = (function (s) {
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })(seed);
  G.decor = [];
  for (var i = 0; i < 260; i++) {
    G.decor.push({ x: rng() * BloodMoonSim.WORLD, y: rng() * BloodMoonSim.WORLD, s: 2 + rng() * 5 });
  }
  G.fogBlobs = [];
  for (var f2 = 0; f2 < 7; f2++) {
    G.fogBlobs.push({ x: rng() * BloodMoonSim.WORLD, y: rng() * BloodMoonSim.WORLD, r: 200 + rng() * 260, v: 6 + rng() * 10 });
  }
  var P = G.api.sim.player;
  G.cam.x = P.x; G.cam.y = P.y;
  elNight.textContent = G.daily ? '🌙 DAILY — NIGHT ' + night : 'NIGHT ' + night;
  ['menu', 'over', 'pause-menu', 'levelup'].forEach(function (id) { document.getElementById(id).classList.add('hidden'); });
  document.getElementById('hud').classList.remove('hidden');
  G.mode = 'playing';
  G.last = 0;
  SFX.click();
  banner(night === 1 ? 'NIGHT FALLS' : 'NIGHT ' + night + ' — THEY KNOW YOU NOW');
}

function openLevelUp() {
  G.mode = 'levelup';
  var offers = G.api.offerUpgrades();
  G.offers = offers;
  var cards = document.getElementById('cards');
  cards.innerHTML = '';
  offers.forEach(function (u, i) {
    var st = G.api.sim.player.upg[u.id] || 0;
    var d = document.createElement('div');
    d.className = 'card';
    d.style.animationDelay = (i * 0.07) + 's'; // summoned one by one, heavy and slow
    d.innerHTML = '<div class="c-name">' + escHtml(u.name) + '</div>' +
      '<div class="c-desc">' + escHtml(u.desc) + '</div>' +
      '<div class="c-flavor">' + escHtml(u.flavor || '') + '</div>' +
      '<div class="c-stacks">' + (u.id === '__feast' ? '' : '●'.repeat(st) + '○'.repeat(u.max - st)) + '</div>' +
      '<div class="c-flavor">[' + (i + 1) + ']</div>';
    d.onclick = function () { pickUpgrade(i); };
    cards.appendChild(d);
  });
  document.getElementById('levelup').classList.remove('hidden');
}
function pickUpgrade(i) {
  if (G.mode !== 'levelup' || !G.offers[i]) return;
  G.api.applyUpgrade(G.offers[i].id);
  G.api.sim.pendingLevels--;
  SFX.click();
  if (G.api.sim.pendingLevels > 0) openLevelUp();
  else {
    document.getElementById('levelup').classList.add('hidden');
    G.mode = 'playing';
    G.last = 0;
  }
}

function endRun(won) {
  G.mode = 'over';
  G.won = won;
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('dash-btn').classList.add('hidden');
  AU.heartOn = false;
  var sim = G.api.sim;
  var banked = Math.round(sim.blood);
  META.bank += banked;
  if (won) {
    META.nightsSurvived = Math.max(META.nightsSurvived, G.night);
    G.carry = { upg: JSON.parse(JSON.stringify(sim.player.upg)), level: sim.player.level };
  } else G.carry = null;
  META.bestKills = Math.max(META.bestKills || 0, sim.kills);
  META.bestNights = Math.max(META.bestNights || 0, won ? G.night : G.night - 1);
  saveMeta(); renderMeta(); renderBloodlines();

  var title = document.getElementById('over-title');
  if (won) {
    title.textContent = sim.bossRef && sim.bossRef.dead ? 'HELSING SLAIN — DAWN SURVIVED' : '☀ DAWN SURVIVED';
    title.className = 'won';
    document.getElementById('over-sub').textContent = 'the village cowers. the night is yours… for now.';
    document.getElementById('again-btn').textContent = '🌅 NEXT NIGHT →';
    SFX.win();
  } else {
    title.textContent = 'THE SUN CLAIMS YOU';
    title.className = 'dead';
    document.getElementById('over-sub').textContent = sim.state === 'dead' && G.dawn ?
      'so close to dawn. the light was merciless.' : 'the mob prevails. the crypt keeps your blood.';
    document.getElementById('again-btn').textContent = '🦇 HUNT AGAIN';
    SFX.lose(); HAP.error();
  }
  document.getElementById('f-kills').textContent = sim.kills;
  document.getElementById('f-nights').textContent = won ? G.night : Math.max(0, G.night - 1);
  document.getElementById('f-level').textContent = sim.level;
  document.getElementById('f-blood').textContent = banked;
  if (G.practice) title.textContent += ' (PRACTICE)';
  document.getElementById('over').classList.remove('hidden');
  submitScore();
  loadBoards();
}

function togglePause(force) {
  if (G.mode === 'playing' || force === true) {
    if (G.mode !== 'playing') return;
    G.mode = 'paused';
    var sim = G.api.sim;
    document.getElementById('run-stats').innerHTML =
      'night ' + G.night + ' &nbsp;•&nbsp; ' + sim.kills + ' kills &nbsp;•&nbsp; level ' + sim.level;
    document.getElementById('pause-menu').classList.remove('hidden');
  } else if (G.mode === 'paused') {
    G.mode = 'playing';
    document.getElementById('pause-menu').classList.add('hidden');
    G.last = 0;
  }
}

/* ================= META (crypt) ================= */
var META = { bank: 0, upg: { vitality: 0, appetite: 0, swiftness: 0 }, bloodline: 'swarm', nightsSurvived: 0, bestKills: 0, bestNights: 0 };
function loadMeta() {
  try {
    var m = JSON.parse(localStorage.getItem('bm_meta') || 'null');
    if (m) META = BloodMoonContent.migrateMeta(m);
    else META = BloodMoonContent.migrateMeta(META);
  } catch (e) {}
  if (!BloodMoonContent.BLOODLINES[META.bloodline]) META.bloodline = 'swarm';
}
function saveMeta() {
  try { localStorage.setItem('bm_meta', JSON.stringify(META)); } catch (e) {}
}
function renderBloodlines() {
  var wrap = document.getElementById('bloodline-pick');
  wrap.innerHTML = '';
  Object.keys(BloodMoonContent.BLOODLINES).forEach(function (id) {
    var b = BloodMoonContent.BLOODLINES[id];
    var locked = META.nightsSurvived < b.unlock;
    var d = document.createElement('div');
    d.className = 'bl-card' + (META.bloodline === id ? ' sel' : '') + (locked ? ' locked' : '');
    d.innerHTML = '<div class="bl-name">🦇 ' + escHtml(b.name) + '</div>' +
      '<div class="bl-desc">' + escHtml(b.desc) + '</div>' +
      (locked ? '<div class="bl-lock">🔒 survive ' + b.unlock + ' night' + (b.unlock > 1 ? 's' : '') + '</div>' : '');
    if (!locked) d.onclick = function () { META.bloodline = id; saveMeta(); renderBloodlines(); SFX.click(); };
    wrap.appendChild(d);
  });
}
function renderMeta() {
  document.getElementById('bank').textContent = '🩸 ' + META.bank;
  var list = document.getElementById('meta-list');
  list.innerHTML = '';
  BloodMoonContent.META_UPGRADES.forEach(function (u) {
    var lv = META.upg[u.id] || 0, maxed = lv >= u.max;
    var cost = maxed ? 0 : u.cost(lv);
    var row = document.createElement('div');
    row.className = 'meta-row';
    row.innerHTML = '<div><div class="m-name">' + escHtml(u.name) + '</div>' +
      '<div class="m-desc">' + escHtml(u.desc) + '</div></div>' +
      '<span class="m-lv">' + '●'.repeat(lv) + '○'.repeat(u.max - lv) + '</span>';
    var btn = document.createElement('button');
    btn.textContent = maxed ? 'MAX' : '🩸' + cost;
    btn.disabled = maxed || META.bank < cost;
    if (!maxed) btn.onclick = function () {
      if (META.bank >= cost) { META.bank -= cost; META.upg[u.id] = lv + 1; saveMeta(); renderMeta(); SFX.levelup(); }
    };
    row.appendChild(btn);
    list.appendChild(row);
  });
}

/* ================= GAMEZ ARCADE ================= */
var ARCADE_BASE = 'https://gamez-arcade.chaoticutopia84.workers.dev';
var BM_GAME = 'blood-moon';
function arcadeFetch(path, body, cb) {
  var done = false, timer = null;
  function fin(e, d) { if (!done) { done = true; if (timer) clearTimeout(timer); cb(e, d); } }
  timer = setTimeout(function () { fin(new Error('timeout')); }, 12000);
  try {
    fetch(ARCADE_BASE + path, body ?
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
      .then(function (r) { return r.json(); })
      .then(function (d) { fin(null, d); })
      .catch(function (e) { fin(e); });
  } catch (e) { fin(e); }
}
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function boardName() {
  return G.daily && G.dailyDate ? 'daily-' + G.dailyDate : 'main';
}
function renderBoard(id, top, hlName) {
  var el = document.getElementById(id);
  if (!el) return;
  if (!top || !top.length) {
    el.innerHTML = '<div class="lb-empty">no souls yet — be the first</div>';
    return;
  }
  el.innerHTML = top.map(function (e, i) {
    var medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
    var me = hlName && e.name === hlName ? ' me' : '';
    return '<div class="lb-row' + me + '"><span>' + medal + ' ' + escHtml(e.name) +
      '</span><b>' + (+e.score).toLocaleString() + '</b></div>';
  }).join('');
}
function loadBoards() {
  arcadeFetch('/scores?game=' + BM_GAME + '&board=' + boardName(), null, function (err, data) {
    var top = (!err && data) ? data.top : null;
    renderBoard('menu-lb', top);
    renderBoard('over-lb', top, localStorage.getItem('arcade_name'));
  });
}
function submitScore() {
  if (G.practice) return; // practice moons are never ranked
  var score = G.api.score();
  if (!ARCADE_BASE || G._submitted || !(score > 0)) return;
  var name = (localStorage.getItem('arcade_name') || '').trim();
  if (!name) {
    var form = document.getElementById('lb-form');
    form.style.display = 'flex';
    document.getElementById('lb-save').onclick = function () {
      var v = document.getElementById('lb-name').value.trim().slice(0, 12);
      if (!v) return;
      try { localStorage.setItem('arcade_name', v); } catch (e) {}
      form.style.display = 'none';
      postScore(v, score);
    };
    return;
  }
  postScore(name, score);
}
function postScore(name, score) {
  G._submitted = true;
  var rankEl = document.getElementById('lb-rank');
  rankEl.textContent = 'sending…';
  arcadeFetch('/score', { game: BM_GAME, board: boardName(), name: name, score: score }, function (err, data) {
    if (err || !data) { rankEl.textContent = ''; return; }
    rankEl.textContent = data.rank > 0 ? '🌍 GLOBAL RANK #' + data.rank : '';
    renderBoard('over-lb', data.top, name);
    renderBoard('menu-lb', data.top, name);
  });
}
function startDaily(practice) {
  auInit();
  toast('consulting the moon…');
  arcadeFetch('/daily?game=' + BM_GAME, null, function (err, d) {
    var seed, date;
    if (!err && d && d.seed != null) { seed = d.seed >>> 0; date = d.date; }
    else {
      var now = new Date();
      date = now.toISOString().slice(0, 10);
      seed = (+date.replace(/-/g, '')) >>> 0 || 1;
    }
    // one attempt per day — the moon remembers
    if (!practice && !BloodMoonContent.DailyRules.canPlay(META, date)) {
      toast('the moon has already been drunk dry — try the practice moon');
      renderMenu();
      return;
    }
    if (!practice) { BloodMoonContent.DailyRules.mark(META, date); saveMeta(); }
    startRun(1, { daily: true, seed: seed, date: date, practice: !!practice });
  });
}

/* daily button states + nightmare toggle */
function renderMenu() {
  var date = new Date().toISOString().slice(0, 10);
  var canPlay = BloodMoonContent.DailyRules.canPlay(META, date);
  var db = document.getElementById('daily-btn');
  var pb = document.getElementById('practice-btn');
  if (canPlay) {
    db.innerHTML = '🌙 DAILY BLOOD MOON';
    db.classList.remove('used');
    pb.classList.add('hidden');
  } else {
    db.innerHTML = '🌙 DAILY SPENT — <small>tomorrow</small>';
    db.classList.add('used');
    pb.classList.remove('hidden');
  }
  renderNightmare();
  renderMeta(); renderBloodlines(); loadBoards();
}
function renderNightmare() {
  var nb = document.getElementById('nightmare-btn');
  if (META.nightsSurvived < 1) { nb.classList.add('hidden'); return; }
  nb.classList.remove('hidden');
  nb.innerHTML = META.nightmareOn ? '🔔 NIGHTMARE: <b>ON</b>' : '🔔 NIGHTMARE: off';
  nb.classList.toggle('on', !!META.nightmareOn);
}

/* ================= MENU BACKGROUND ================= */
function renderMenuBg(now) {
  ctx.fillStyle = '#0a0812';
  ctx.fillRect(0, 0, W, H);
  // big moon
  var mx = W * 0.78, my = H * 0.2, mr = Math.min(W, H) * 0.16;
  var mg = ctx.createRadialGradient(mx, my, mr * 0.2, mx, my, mr * 3);
  mg.addColorStop(0, 'rgba(232,228,216,0.5)');
  mg.addColorStop(0.35, 'rgba(157,78,221,0.12)');
  mg.addColorStop(1, 'rgba(10,8,18,0)');
  ctx.fillStyle = mg;
  ctx.fillRect(mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
  ctx.fillStyle = '#e8e4d8';
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(160,150,170,0.5)';
  ctx.beginPath(); ctx.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.18, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(mx + mr * 0.25, my + mr * 0.3, mr * 0.12, 0, TAU); ctx.fill();
  // drifting fog
  ctx.fillStyle = 'rgba(60,40,90,0.16)';
  for (var i = 0; i < 5; i++) {
    var fx = ((now / 40 * (i + 1) * 7) % (W + 400)) - 200;
    var fy = H * (0.25 + i * 0.15);
    ctx.beginPath(); ctx.ellipse(fx, fy, 190, 46, 0, 0, TAU); ctx.fill();
  }
  // occasional bat silhouettes
  ctx.fillStyle = 'rgba(5,3,10,0.85)';
  for (var b = 0; b < 3; b++) {
    var bx = ((now / 28 * (b * 37 + 53)) % (W + 200)) - 100;
    var by = H * 0.12 + Math.sin(now / 900 + b * 2) * 30 + b * 46;
    var fr = ((now / 160 | 0) + b) % 2;
    ctx.drawImage(SPR.bat[fr], bx - 22, by - 22, 44, 44);
  }
}

/* ================= BOOT ================= */
document.getElementById('start-btn').onclick = function () { auInit(); G.carry = null; startRun(1); };
document.getElementById('daily-btn').onclick = function () { G.carry = null; startDaily(false); };
document.getElementById('practice-btn').onclick = function () { G.carry = null; startDaily(true); };
document.getElementById('nightmare-btn').onclick = function () {
  auInit(); META.nightmareOn = !META.nightmareOn; saveMeta(); renderNightmare(); SFX.click();
  toast(META.nightmareOn ? '🔔 nightmare wakes — the night is hungrier' : '🔔 nightmare sleeps');
};
document.getElementById('again-btn').onclick = function () {
  auInit();
  if (G.practice) { G.carry = null; startDaily(true); return; } // practice again, unranked
  if (G.won) startRun(G.night + 1, {});
  else { G.carry = null; startRun(1); }
};
document.getElementById('menu-btn').onclick = function () {
  document.getElementById('over').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
  G.mode = 'menu'; G.api = null; G._submitted = false;
  renderMenu(); primeAi();
};
document.getElementById('pause-btn').onclick = function () { togglePause(); };
document.getElementById('resume-btn').onclick = function () { togglePause(); };
// haptics toggle (pause menu) — vocab honored silently on devices without vibration
HAP.init();
var hapBtn = document.getElementById('haptics-btn');
function syncHapBtn() { hapBtn.textContent = '📳 haptics: ' + (HAP.on ? 'on' : 'off'); }
hapBtn.onclick = function () { HAP.set(!HAP.on); syncHapBtn(); HAP.medium(); };
syncHapBtn();
document.getElementById('quit-btn').onclick = function () {
  document.getElementById('pause-menu').classList.add('hidden');
  if (G.api && !G.api.sim.over) {
    // bank partial blood, abandon the night
    META.bank += Math.round(G.api.sim.blood);
    saveMeta();
  }
  document.getElementById('menu').classList.remove('hidden');
  document.getElementById('hud').classList.add('hidden');
  G.mode = 'menu'; G.api = null; G.carry = null;
  renderMenu(); primeAi();
};
canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

// menu backdrop loop (runs until first run starts)
var menuRaf = 0;
function menuFrame(now) {
  if (G.mode === 'menu' && !G.api) {
    renderMenuBg(now || 0);
    requestAnimationFrame(menuFrame);
  }
}

loadMeta();
renderMenu(); // (meta, bloodlines, boards, daily + nightmare states)
// primeAi's data (BRIEF_FALLBACKS etc.) is declared later in this file, so it must
// run after the whole script has parsed — a boot-time direct call throws and kills
// the game loop (music plays, nothing else). Defer past parse.
setTimeout(primeAi, 0);
G.mode = 'menu';
requestAnimationFrame(frame);
requestAnimationFrame(menuFrame);

})();

/* ============ silent AI flavor (gamez-ai; local fallback, never blocks) ============
   The player never knows AI is involved: every call has an instant local
   fallback and nothing in the game waits on the network. */
var AI_BASE = 'https://gamez-ai.chaoticutopia84.workers.dev';
function aiFetch(kind, ctxObj, cb) {
  var done = false, timer = null;
  function fin(t) { if (!done) { done = true; if (timer) clearTimeout(timer); cb(t); } }
  timer = setTimeout(function () { fin(null); }, 7000);
  try {
    fetch(AI_BASE + '/g', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: kind, game: 'blood-moon', ctx: ctxObj })
    }).then(function (r) { return r.json(); })
      .then(function (d) { fin(d && d.text ? d.text : null); })
      .catch(function () { fin(null); });
  } catch (e) { fin(e); }
}
var BRIEF_FALLBACKS = [
  'The village of Turnip Hollow sleeps. It should not have.',
  'Gristle\'s Hollow: pitchforks sharpened, torches lit, lambs silent.',
  'Mildred rang the church bell at dusk. Nobody answered.',
  'The harvest festival ends at midnight. So does the truce.',
  'Fog on the fen, a bell that won\'t stop, and you — hungry.'
];
var aiTauntPool = [];
var aiSlot = 0;
function primeAi() {
  // Never let flavor text break the game: if our data isn't ready yet, retry shortly.
  if (typeof BRIEF_FALLBACKS === 'undefined' || !BRIEF_FALLBACKS) { setTimeout(primeAi, 250); return; }
  // one-line gothic scene-setter on the menu
  var slot = aiSlot % BRIEF_FALLBACKS.length; aiSlot++;
  var bel = document.getElementById('night-brief');
  function show(t) { if (bel) bel.textContent = '📜 ' + (t || BRIEF_FALLBACKS[slot]); }
  aiFetch('nightbrief', { v: slot }, show);
  setTimeout(function () { if (bel && !bel.textContent) show(null); }, 1500);
  // a fresh batch of villager screams for this session
  aiFetch('vamptaunt', { v: aiSlot }, function (t) {
    if (!t) return;
    var lines = String(t).split('\n').map(function (s) { return s.trim().replace(/^["'\-\d.)\s]+|["'\s]+$/g, ''); })
      .filter(function (s) { return s.length > 4 && s.length < 90; });
    if (lines.length) aiTauntPool = lines.slice(0, 8);
  });
}
