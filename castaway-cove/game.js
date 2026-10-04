/* Castaway Cove REMAKE — UI/controller (game #11 in the Gamez arcade).
 * Canvas watercolor scene + DOM overlays. Pure logic lives in sim.js (global CC).
 * Loop: cast (placement) -> wait -> nibbles -> THE bite -> hook -> reel rhythm -> catch card.
 * No fail state, ever. HUD hides while waiting; the world is the interface.
 */
(function () {
'use strict';

/* ============================== helpers ============================== */
function $(id) { return document.getElementById(id); }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function dateStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function todayStr() { return dateStr(new Date()); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function fmtDate(ds) {
  var p = String(ds).split('-');
  return new Date(+p[0], (+p[1]) - 1, +p[2]).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function mixHex(h1, h2, k) {
  function hx(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  var c1 = hx(h1), c2 = hx(h2);
  function ch(a, b) { return Math.max(0, Math.min(255, Math.round(a + (b - a) * k))); }
  return 'rgb(' + ch(c1[0], c2[0]) + ',' + ch(c1[1], c2[1]) + ',' + ch(c1[2], c2[2]) + ')';
}
function shade(hex, amt) {
  /* amt -100..100: darken/lighten a #rrggbb color */
  var n = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  var c = n.map(function (v) { return Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt / 100) : v + (255 - v) * amt / 100))); });
  return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
}
function spotById(id) {
  for (var i = 0; i < CC.SPOTS.length; i++) if (CC.SPOTS[i].id === id) return CC.SPOTS[i];
  return CC.SPOTS[0];
}

/* ============================== persistence (v2) ============================== */
var SAVE_KEY = 'castaway_cove_v2', V1_KEY = 'castaway_cove_v1';
function loadSave() {
  try {
    var raw2 = localStorage.getItem(SAVE_KEY);
    if (raw2) {
      var s2 = JSON.parse(raw2);
      if (s2 && s2.v === 2) return s2;
    }
    var raw1 = localStorage.getItem(V1_KEY);
    if (raw1) {
      var v1 = JSON.parse(raw1);
      if (v1 && v1.v === 1) return CC.migrateV1(v1);
    }
  } catch (e) {}
  return CC.migrateV1({});
}
var save = loadSave();
if (!save.spot || !spotById(save.spot)) save.spot = 'sunny-cove';
if (!CC.canAccess(save.spot, save)) save.spot = 'sunny-cove';
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
}

/* ============================== audio ============================== */
var AU = {
  ctx: null, master: null, filt: null, musicT: 0, birdT: 5,
  ensure: function () {
    try {
      if (!this.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        /* master chain: sources -> master gain -> underwater low-pass -> destination */
        this.filt = this.ctx.createBiquadFilter();
        this.filt.type = 'lowpass'; this.filt.frequency.value = 18000;
        this.master = this.ctx.createGain();
        this.master.gain.value = save.muted ? 0 : 0.9;
        this.master.connect(this.filt);
        this.filt.connect(this.ctx.destination);
        this.startLap();
        this.startWind();
        this.musicT = 3; this.birdT = 4;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) {}
  },
  setMuted: function (m) {
    save.muted = m; persist();
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
    $('btn-mute').textContent = m ? '🔇' : '🔊';
  },
  setUnderwater: function (on) {
    /* the underwater strip gets the muffled world: 18kHz -> ~700Hz */
    try {
      if (!this.ctx || !this.filt) return;
      var t = this.ctx.currentTime;
      this.filt.frequency.cancelScheduledValues(t);
      this.filt.frequency.setTargetAtTime(on ? 700 : 18000, t, 0.4);
    } catch (e) {}
  },
  noiseBuf: function () {
    var c = this.ctx, len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  },
  startLap: function () {
    /* gentle water lapping: looped noise -> lowpass, slow LFO on gain */
    try {
      var c = this.ctx;
      var src = c.createBufferSource(); src.buffer = this.noiseBuf(); src.loop = true;
      var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.6;
      var g = c.createGain(); g.gain.value = 0.045;
      var lfo = c.createOscillator(); lfo.frequency.value = 0.12;
      var lg = c.createGain(); lg.gain.value = 0.028;
      lfo.connect(lg); lg.connect(g.gain);
      src.connect(lp); lp.connect(g); g.connect(this.master);
      src.start(); lfo.start();
    } catch (e) {}
  },
  startWind: function () {
    /* wind swells: banded noise breathing on a slow LFO */
    try {
      var c = this.ctx;
      var src = c.createBufferSource(); src.buffer = this.noiseBuf(); src.loop = true;
      var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.4;
      var g = c.createGain(); g.gain.value = 0.018;
      var lfo = c.createOscillator(); lfo.frequency.value = 0.06;
      var lg = c.createGain(); lg.gain.value = 0.014;
      lfo.connect(lg); lg.connect(g.gain);
      src.connect(bp); bp.connect(g); g.connect(this.master);
      src.start(); lfo.start();
    } catch (e) {}
  },
  tone: function (f0, f1, dur, type, vol, when) {
    try {
      var c = this.ctx, t = c.currentTime + (when || 0);
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.05);
    } catch (e) {}
  },
  burst: function (dur, freq, vol, when) {
    try {
      var c = this.ctx, t = c.currentTime + (when || 0);
      var src = c.createBufferSource(); src.buffer = this.noiseBuf();
      var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = freq || 900;
      var g = c.createGain();
      g.gain.setValueAtTime(vol || 0.25, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(lp); lp.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + dur + 0.05);
    } catch (e) {}
  },
  pluck: function () {
    /* sparse generative folk: pentatonic, soft, never demanding */
    var scale = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33];
    var f = scale[Math.floor(Math.random() * scale.length)];
    this.tone(f, f * 0.995, 1.6, 'triangle', 0.055);
    if (Math.random() < 0.3) {
      var f2 = scale[Math.floor(Math.random() * scale.length)];
      this.tone(f2, f2 * 0.995, 1.8, 'triangle', 0.04, 0.5 + Math.random() * 0.6);
    }
  },
  chirp: function () {
    /* sparse birdsong: a few quick descending chirps */
    var n = 2 + Math.floor(Math.random() * 3);
    for (var i = 0; i < n; i++) {
      var f = 2300 + Math.random() * 900;
      this.tone(f, f * 0.72, 0.09, 'sine', 0.045, i * (0.14 + Math.random() * 0.1));
    }
  },
  scheduleAmbient: function (dt, cat) {
    if (!this.ctx || this.ctx.state !== 'running' || save.muted) return;
    this.musicT -= dt;
    if (this.musicT <= 0) { this.pluck(); this.musicT = 4 + Math.random() * 5; }
    this.birdT -= dt;
    if (this.birdT <= 0) {
      if (cat !== 'night') this.chirp();
      this.birdT = 7 + Math.random() * 13;
    }
  },
  plip: function () { this.tone(520, 240, 0.16, 'sine', 0.22); },
  nibbleTick: function () { this.tone(1500, 950, 0.07, 'square', 0.07); },
  hook: function () { this.tone(660, 990, 0.12, 'triangle', 0.2); },
  splash: function () { this.burst(0.28, 800, 0.28); },
  bite: function () {
    /* THE bite: big splash + low thump — the unmistakable cue */
    this.burst(0.55, 750, 0.42);
    this.tone(95, 42, 0.5, 'sine', 0.5);
    this.tone(190, 120, 0.2, 'triangle', 0.14, 0.05);
  },
  reelClick: function () { this.tone(2100, 1700, 0.03, 'square', 0.045); },
  warn: function () { this.tone(300, 200, 0.22, 'sawtooth', 0.1); this.tone(300, 200, 0.22, 'sawtooth', 0.1, 0.24); },
  chime: function () {
    var scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    var start = Math.floor(Math.random() * 3), n = 4;
    for (var i = 0; i < n; i++) {
      this.tone(scale[(start + i) % scale.length], 0, 0.55, 'triangle', 0.16, i * 0.1);
    }
  },
  fanfare: function () {
    /* NEW RECORD fanfare */
    var notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    for (var i = 0; i < notes.length; i++) {
      this.tone(notes[i], 0, 0.5, 'triangle', 0.18, i * 0.11);
      this.tone(notes[i] / 2, 0, 0.5, 'sine', 0.1, i * 0.11);
    }
  },
  mrrp: function () { this.tone(300, 230, 0.14, 'sine', 0.12); this.tone(260, 200, 0.12, 'sine', 0.1, 0.13); }
};
document.addEventListener('pointerdown', function () { AU.ensure(); }, { passive: true });

/* ============================== canvas scene ============================== */
var cv = $('scene'), ctx = cv.getContext('2d');
var W = 0, H = 0, DPR = 1, waterTop = 0;
function sizeCanvas() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = cv.clientWidth || window.innerWidth; H = cv.clientHeight || window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  waterTop = Math.round(H * 0.44);
}
window.addEventListener('resize', sizeCanvas);

/* world state */
var CYCLE = 480; /* ~8 min day */
var world = {
  t: 0, cycleT: 0.02, weather: 'clear', weatherT: 0, weatherDur: 90,
  clouds: [], stars: [], fireflies: [], rain: [], silhs: [], ripples: [], parts: [],
  birds: [], meteors: [], birdT: 8, meteorT: 12,
  bobX: 0, bobY: 0, bobDepth: 0.5, dipT: 0, pullActive: false, pullFrac: 0
};
function seedSky() {
  world.clouds = [];
  for (var i = 0; i < 5; i++) world.clouds.push({
    x: Math.random() * W, y: 20 + Math.random() * waterTop * 0.5,
    s: 0.6 + Math.random() * 0.9, v: 6 + Math.random() * 10
  });
  world.stars = [];
  for (var j = 0; j < 60; j++) world.stars.push({
    x: Math.random() * W, y: Math.random() * waterTop * 0.9,
    r: 0.5 + Math.random() * 1.4, tw: Math.random() * 6.28
  });
  world.fireflies = [];
  for (var k = 0; k < 24; k++) world.fireflies.push({
    x: Math.random() * W, y: waterTop * 0.5 + Math.random() * (H - waterTop * 0.5),
    ph: Math.random() * 6.28, sp: 0.4 + Math.random() * 0.8
  });
}
function catAt(x) {
  if (x < 0.07 || x >= 0.95) return 'dawn';
  if (x < 0.45) return 'day';
  if (x < 0.58) return 'dusk';
  return 'night';
}
function timeCat() { return catAt(world.cycleT); }
function timeSpeedMult(cat, spotId) {
  /* Moonlit Pier lingers at night; Misty Marsh lingers at dawn */
  if (spotId === 'moonlit-pier') return cat === 'night' ? 0.5 : (cat === 'day' ? 2.1 : 1.2);
  if (spotId === 'misty-marsh') return cat === 'dawn' ? 0.55 : 1;
  return 1;
}
function pickWeather() {
  var r = Math.random(), s = save.spot;
  if (s === 'misty-marsh') world.weather = r < 0.45 ? 'clear' : (r < 0.70 ? 'rain' : 'fog');
  else if (s === 'moonlit-pier') world.weather = r < 0.70 ? 'clear' : (r < 0.88 ? 'rain' : 'fog');
  else world.weather = r < 0.62 ? 'clear' : (r < 0.85 ? 'rain' : 'fog');
  world.weatherDur = 80 + Math.random() * 50;
  world.weatherT = 0;
  if (world.weather === 'rain' && world.rain.length === 0) {
    for (var i = 0; i < 90; i++) world.rain.push({
      x: Math.random() * W, y: Math.random() * H, v: 420 + Math.random() * 260
    });
  }
}
var TINT = {
  dawn:  'rgba(255,170,110,0.20)',
  day:   'rgba(255,255,255,0)',
  dusk:  'rgba(230,120,90,0.28)',
  night: 'rgba(8,16,40,0.55)'
};
var WTINT = {
  dawn:  'rgba(255,180,120,0.12)',
  day:   'rgba(255,255,255,0)',
  dusk:  'rgba(200,110,80,0.18)',
  night: 'rgba(6,12,28,0.50)'
};
function sunPos() {
  var t = world.cycleT, cat = timeCat(), x, y, isMoon = false;
  if (cat === 'night') {
    var nt = (t < 0.58 ? t + 1 - 0.58 : t - 0.58) / 0.37;
    x = W * (0.15 + 0.7 * nt); y = waterTop * (0.55 - 0.35 * Math.sin(nt * Math.PI)); isMoon = true;
  } else {
    var dt2 = t < 0.58 ? t / 0.58 : (t - 0.95 + 1) / 0.12;
    x = W * (0.12 + 0.76 * Math.min(1, dt2)); y = waterTop * (0.72 - 0.55 * Math.sin(Math.min(1, dt2) * Math.PI));
  }
  return { x: x, y: y, isMoon: isMoon };
}

/* ---------- fish drawing (shared by scene, journal, cards) ---------- */
function patternFor(id) {
  /* per-fish pattern from a stable id hash: stripes | spots | bands */
  var h = 0;
  for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ['stripes', 'spots', 'bands'][h % 3];
}
function drawFish(g, x, y, s, color, o) {
  o = o || {};
  g.save();
  g.translate(x, y);
  if (o.flip) g.scale(-1, 1);
  var L = 34 * s, Hh = 15 * s * (o.slim ? 0.62 : 1); /* darters are slim: shape = information */
  if (o.silhouette) {
    g.fillStyle = 'rgba(25,45,65,0.55)';
  } else {
    g.fillStyle = color;
    g.shadowColor = 'rgba(0,0,0,0.18)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
  }
  g.beginPath(); /* tail */
  g.moveTo(-L * 0.42, 0); g.lineTo(-L * 0.72, -Hh * 0.75); g.lineTo(-L * 0.72, Hh * 0.75);
  g.closePath(); g.fill();
  g.beginPath(); /* body */
  g.ellipse(0, 0, L * 0.5, Hh * 0.62, 0, 0, 6.283); g.fill();
  g.shadowBlur = 0; g.shadowOffsetY = 0;
  if (!o.silhouette) {
    /* per-fish pattern, clipped to the body */
    if (o.pattern && color) {
      g.save();
      g.beginPath(); g.ellipse(0, 0, L * 0.5, Hh * 0.62, 0, 0, 6.283); g.clip();
      g.fillStyle = shade(color, -28);
      if (o.pattern === 'stripes') {
        for (var i = -1; i <= 1; i++) {
          g.beginPath(); g.ellipse(i * L * 0.22, 0, L * 0.07, Hh * 0.62, 0, 0, 6.283); g.fill();
        }
      } else if (o.pattern === 'spots') {
        var spots = [[-0.25, -0.3], [0.05, 0.25], [0.3, -0.15], [-0.05, -0.05], [0.22, 0.32], [-0.35, 0.28]];
        for (var j = 0; j < spots.length; j++) {
          g.beginPath(); g.arc(spots[j][0] * L, spots[j][1] * Hh, L * 0.055, 0, 6.283); g.fill();
        }
      } else {
        for (var k2 = -1; k2 <= 1; k2++) {
          g.fillRect(-L * 0.5, k2 * Hh * 0.42 - Hh * 0.1, L, Hh * 0.2);
        }
      }
      g.restore();
    }
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.ellipse(L * 0.08, -Hh * 0.22, L * 0.3, Hh * 0.22, -0.2, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(20,20,20,0.75)';
    g.beginPath(); g.arc(L * 0.3, -Hh * 0.1, Math.max(1.4, 2.4 * s), 0, 6.283); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.arc(L * 0.3 + 0.8, -Hh * 0.1 - 0.8, Math.max(0.7, 0.9 * s), 0, 6.283); g.fill();
  }
  g.restore();
}

/* ---------- the heron (kept, all of it) ---------- */
var heron = {
  mode: 'away', t: 0, nextVisit: 45 + Math.random() * 60,
  x: 0, eye: 'closed', bubble: null, bubbleT: 0, bob: 0
};
var HERON_WORDS = {
  common: ['...', 'hmm.', 'ok.'],
  uncommon: ['hmm.', 'not bad.', 'sup.'],
  rare: ['oh!', 'nice.', 'oho.'],
  legendary: ['!!', 'WOAH.', '!!!']
};
function heronPerchX() { return Math.min(W * 0.34, 170); }
function heronSay(words) {
  heron.bubble = words[Math.floor(Math.random() * words.length)];
  heron.bubbleT = 3.4;
  heron.mode = 'judging'; heron.t = 0;
}
function updateHeron(dt) {
  var h = heron;
  h.t += dt; h.bob += dt;
  if (h.bubbleT > 0) { h.bubbleT -= dt; if (h.bubbleT <= 0) h.bubble = null; }
  var px = heronPerchX();
  if (h.mode === 'away') {
    if (h.t > h.nextVisit) { h.mode = 'arriving'; h.t = 0; h.x = W + 70; }
  } else if (h.mode === 'arriving') {
    h.x = W + 70 - (W + 70 - px) * Math.min(1, h.t / 2.5);
    if (h.t >= 2.5) { h.mode = 'sleeping'; h.t = 0; h.eye = 'closed'; h.sleepDur = 45 + Math.random() * 60; }
  } else if (h.mode === 'sleeping') {
    h.eye = 'closed';
    if (Math.random() < dt * 0.25) world.parts.push({ k: 'z', x: h.x - 24, y: dockY() - 98, vy: -14, life: 2.2, txt: 'z' });
    if (phase === 'bite') { h.mode = 'watching'; h.eye = 'open'; }
    else if (h.t > (h.sleepDur || 60)) { h.mode = 'leaving'; h.t = 0; }
  } else if (h.mode === 'watching') {
    h.eye = 'open';
    if (phase !== 'bite' && phase !== 'reeling') { h.mode = 'sleeping'; h.t = 0; h.eye = 'closed'; }
  } else if (h.mode === 'judging') {
    h.eye = h.judgeWide ? 'wide' : 'open';
    if (h.t > 3.6) { h.mode = 'sleeping'; h.t = 0; h.eye = 'closed'; h.judgeWide = false; }
  } else if (h.mode === 'leaving') {
    h.x = px + (W + 70 - px) * Math.min(1, h.t / 2.5);
    if (h.t >= 2.5) { h.mode = 'away'; h.t = 0; h.nextVisit = 120 + Math.random() * 180; }
  }
}
function dockY() { return waterTop + 8; }
function drawHeron(g) {
  var h = heron;
  if (h.mode === 'away') return;
  var x = h.x, y = dockY(), s = Math.min(1.15, W / 380);
  var bobY = (h.mode === 'sleeping') ? Math.sin(h.bob * 1.4) * 2.5 : Math.sin(h.bob * 2.2) * 1;
  g.save();
  g.translate(x, y + bobY); g.scale(s, s);
  g.strokeStyle = '#5c6470'; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(6, 0); g.lineTo(6, -26); g.stroke();       /* standing leg */
  if (h.eye === 'closed') { g.beginPath(); g.moveTo(-4, -24); g.lineTo(8, -18); g.stroke(); } /* tucked leg */
  else { g.beginPath(); g.moveTo(-6, 0); g.lineTo(-6, -26); g.stroke(); }
  g.fillStyle = '#8a93a3';
  g.beginPath(); g.ellipse(0, -34, 24, 14, 0.08, 0, 6.283); g.fill(); /* body */
  g.beginPath(); g.moveTo(20, -38); g.lineTo(34, -30); g.lineTo(20, -28); g.closePath(); g.fill(); /* tail */
  g.strokeStyle = '#7c8494'; g.lineWidth = 7;
  g.beginPath(); g.moveTo(-14, -40);
  g.quadraticCurveTo(-34, -56, -31, -74); g.stroke();                /* neck */
  g.fillStyle = '#8a93a3';
  g.beginPath(); g.ellipse(-31, -79, 10, 7.5, -0.15, 0, 6.283); g.fill(); /* head */
  g.fillStyle = '#d8a24a';
  g.beginPath(); g.moveTo(-39, -81); g.lineTo(-63, -74); g.lineTo(-39, -73); g.closePath(); g.fill(); /* beak */
  /* eye */
  if (h.eye === 'closed') {
    g.strokeStyle = '#3a3f47'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-34, -80); g.lineTo(-28, -80); g.stroke();
  } else if (h.eye === 'wide') {
    g.fillStyle = '#fff'; g.beginPath(); g.arc(-31, -79, 5.5, 0, 6.283); g.fill();
    g.fillStyle = '#222'; g.beginPath(); g.arc(-31, -79, 2.6, 0, 6.283); g.fill();
  } else {
    g.fillStyle = '#3a3f47'; g.beginPath(); g.arc(-31, -79, 2.4, 0, 6.283); g.fill();
  }
  g.restore();
  /* judgment bubble */
  if (h.bubble) {
    g.save();
    g.font = '700 15px ' + UI_FONT;
    var tw = g.measureText(h.bubble).width;
    var bx = x - 66, by = y - 146 + bobY;
    g.fillStyle = 'rgba(255,253,247,0.95)';
    g.strokeStyle = '#d9c39a'; g.lineWidth = 2;
    var bw = tw + 22, bh = 30;
    if (g.roundRect) { g.beginPath(); g.roundRect(bx - bw / 2, by - bh / 2, bw, bh, 12); g.fill(); g.stroke(); }
    else { g.fillRect(bx - bw / 2, by - bh / 2, bw, bh); }
    g.beginPath(); g.moveTo(bx - 4, by + bh / 2 - 2); g.lineTo(bx + 6, by + bh / 2 - 2); g.lineTo(bx - 8, by + bh / 2 + 10); g.closePath();
    g.fillStyle = 'rgba(255,253,247,0.95)'; g.fill();
    g.fillStyle = '#5a4632'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(h.bubble, bx, by + 1);
    g.restore();
  }
}

/* ---------- scene painters ---------- */
var UI_FONT = '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif';
function drawSky(g, pal, cat) {
  var gr = g.createLinearGradient(0, 0, 0, waterTop);
  gr.addColorStop(0, pal.sky[0]); gr.addColorStop(0.62, pal.sky[1]); gr.addColorStop(1, pal.sky[2]);
  g.fillStyle = gr; g.fillRect(0, 0, W, waterTop + 1);
  /* time-of-day tint over the spot palette */
  g.fillStyle = TINT[cat]; g.fillRect(0, 0, W, waterTop + 1);
  var sp = sunPos();
  if (cat === 'night') {
    g.save();
    for (var i = 0; i < world.stars.length; i++) {
      var st = world.stars[i], a = 0.25 + 0.55 * Math.abs(Math.sin(world.t * 1.2 + st.tw));
      g.fillStyle = 'rgba(255,255,240,' + a.toFixed(2) + ')';
      g.beginPath(); g.arc(st.x, st.y, st.r, 0, 6.283); g.fill();
    }
    g.restore();
    drawMeteors(g);
  }
  /* sun / moon with soft halo */
  var halo = g.createRadialGradient(sp.x, sp.y, 4, sp.x, sp.y, 70);
  if (sp.isMoon) { halo.addColorStop(0, 'rgba(244,234,208,0.95)'); halo.addColorStop(0.35, 'rgba(244,234,208,0.5)'); }
  else { halo.addColorStop(0, 'rgba(255,243,208,0.95)'); halo.addColorStop(0.4, 'rgba(255,243,208,0.4)'); }
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  g.save();
  g.fillStyle = halo; g.beginPath(); g.arc(sp.x, sp.y, 70, 0, 6.283); g.fill();
  g.fillStyle = sp.isMoon ? '#f4ead0' : '#fff3d0';
  g.beginPath(); g.arc(sp.x, sp.y, sp.isMoon ? 22 : 30, 0, 6.283); g.fill();
  if (sp.isMoon) { g.fillStyle = 'rgba(180,170,150,0.5)';
    g.beginPath(); g.arc(sp.x - 7, sp.y - 4, 5, 0, 6.283); g.fill();
    g.beginPath(); g.arc(sp.x + 6, sp.y + 7, 3.5, 0, 6.283); g.fill(); }
  g.restore();
  /* clouds */
  g.save();
  g.fillStyle = cat === 'night' ? 'rgba(40,52,80,0.85)' : 'rgba(255,251,240,0.88)';
  for (var c = 0; c < world.clouds.length; c++) {
    var cl = world.clouds[c];
    g.beginPath();
    g.ellipse(cl.x, cl.y, 46 * cl.s, 13 * cl.s, 0, 0, 6.283);
    g.ellipse(cl.x - 26 * cl.s, cl.y + 4 * cl.s, 26 * cl.s, 9 * cl.s, 0, 0, 6.283);
    g.ellipse(cl.x + 26 * cl.s, cl.y + 4 * cl.s, 28 * cl.s, 10 * cl.s, 0, 0, 6.283);
    g.fill();
  }
  g.restore();
  drawBirds(g);
}
function drawMeteors(g) {
  g.save();
  for (var i = 0; i < world.meteors.length; i++) {
    var m = world.meteors[i], a = Math.max(0, m.life / m.max);
    var grad = g.createLinearGradient(m.x, m.y, m.x - m.vx * 0.28, m.y - m.vy * 0.28);
    grad.addColorStop(0, 'rgba(255,255,255,' + (0.9 * a).toFixed(2) + ')');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = grad; g.lineWidth = 2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(m.x - m.vx * 0.28, m.y - m.vy * 0.28); g.stroke();
  }
  g.restore();
}
function drawBirds(g) {
  g.save();
  for (var i = 0; i < world.birds.length; i++) {
    var b = world.birds[i];
    g.strokeStyle = 'rgba(58,58,68,0.85)'; g.fillStyle = 'rgba(58,58,68,0.85)';
    g.lineWidth = 2.4; g.lineCap = 'round';
    if (b.state === 'sit') {
      /* landed: little body bobbing, ripple rings handled by particles */
      var sy = b.y + Math.sin(world.t * 2 + b.ph) * 1.5;
      g.beginPath(); g.ellipse(b.x, sy, 9, 5.5, 0, 0, 6.283); g.fill();
      g.beginPath(); g.arc(b.x + 7, sy - 5, 3.6, 0, 6.283); g.fill();
      g.beginPath(); g.moveTo(b.x + 9, sy - 5); g.lineTo(b.x + 14, sy - 4); g.lineTo(b.x + 9, sy - 3); g.closePath(); g.fill();
    } else {
      var flap = Math.sin(world.t * 9 + b.ph) * 7;
      g.beginPath();
      g.moveTo(b.x - 13, b.y - flap); g.quadraticCurveTo(b.x - 6, b.y + 2, b.x, b.y);
      g.quadraticCurveTo(b.x + 6, b.y + 2, b.x + 13, b.y - flap);
      g.stroke();
      g.beginPath(); g.ellipse(b.x, b.y, 5, 2.6, 0, 0, 6.283); g.fill();
    }
  }
  g.restore();
}
function spawnBird() {
  var fromLeft = Math.random() < 0.5;
  world.birds.push({
    x: fromLeft ? -50 : W + 50, y: 36 + Math.random() * waterTop * 0.45,
    vx: (fromLeft ? 1 : -1) * (42 + Math.random() * 42),
    ph: Math.random() * 6.28, state: 'fly',
    lander: Math.random() < 0.28, landX: W * 0.2 + Math.random() * W * 0.6, sitT: 0
  });
}
function updateBirds(dt) {
  world.birdT -= dt;
  if (world.birdT <= 0) { spawnBird(); world.birdT = 6 + Math.random() * 10; }
  for (var i = world.birds.length - 1; i >= 0; i--) {
    var b = world.birds[i], gone = false;
    if (b.state === 'fly') {
      b.x += b.vx * dt;
      if (b.lander && ((b.vx > 0 && b.x >= b.landX) || (b.vx < 0 && b.x <= b.landX))) b.state = 'land';
      if (b.x < -70 || b.x > W + 70) gone = true;
    } else if (b.state === 'land') {
      b.y += (waterTop + 8 - b.y) * Math.min(1, dt * 2.2);
      b.x += b.vx * dt * 0.3;
      if (Math.abs(b.y - (waterTop + 8)) < 3) {
        b.state = 'sit'; b.sitT = 4 + Math.random() * 5;
        for (var r = 0; r < 3; r++) world.ripples.push({ x: b.x, y: waterTop + 6, r: 5 + r * 7, life: 1.3 + r * 0.3, max: 1.6 });
      }
    } else if (b.state === 'sit') {
      b.sitT -= dt;
      if (b.sitT <= 0) b.state = 'takeoff';
    } else if (b.state === 'takeoff') {
      b.y -= 90 * dt; b.x += b.vx * dt;
      if (b.y < 60) { b.state = 'fly'; b.lander = false; }
    }
    if (gone) world.birds.splice(i, 1);
  }
}
function drawWater(g, pal, cat) {
  var wg = g.createLinearGradient(0, waterTop, 0, H);
  wg.addColorStop(0, pal.water[0]); wg.addColorStop(0.5, pal.water[1]); wg.addColorStop(1, pal.water[2]);
  g.fillStyle = wg; g.fillRect(0, waterTop, W, H - waterTop);
  g.fillStyle = WTINT[cat]; g.fillRect(0, waterTop, W, H - waterTop);
  /* sun/moon glitter path — shifts with the light */
  var sp = sunPos();
  g.save(); g.globalAlpha = cat === 'night' ? 0.25 : 0.4;
  g.fillStyle = sp.isMoon ? '#f4ead0' : '#fff3d0';
  for (var i = 0; i < 9; i++) {
    var yy = waterTop + 14 + i * ((H - waterTop) / 10);
    var ww = 60 - i * 5 + Math.sin(world.t * 2 + i) * 8;
    g.fillRect(sp.x - ww / 2, yy, ww, 3);
  }
  g.restore();
  /* layered wave bands */
  g.save();
  for (var b = 0; b < 3; b++) {
    var by = waterTop + 26 + b * 46, amp = 7 + b * 4, sp2 = 0.5 + b * 0.35;
    g.strokeStyle = 'rgba(255,255,255,' + (0.30 - b * 0.07) + ')';
    g.lineWidth = 5 - b;
    g.beginPath();
    for (var x = -20; x <= W + 20; x += 14) {
      var y = by + Math.sin(x * 0.02 + world.t * sp2 * 2 + b * 2) * amp;
      if (x === -20) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.restore();
  /* morning fog layer — denser at dawn, in fog weather, and always a breath at the marsh */
  var fogA = 0;
  if (world.weather === 'fog') fogA += 0.34;
  if (cat === 'dawn') fogA += 0.16;
  if (save.spot === 'misty-marsh') fogA += 0.12;
  if (fogA > 0) {
    fogA = Math.min(0.55, fogA);
    g.save();
    var drift = Math.sin(world.t * 0.25) * 14;
    g.fillStyle = 'rgba(232,226,213,' + (fogA * 0.75).toFixed(2) + ')';
    g.fillRect(0, waterTop - 56 + drift, W, H - waterTop + 56 - drift);
    g.fillStyle = 'rgba(240,235,224,' + (fogA * 0.5).toFixed(2) + ')';
    g.fillRect(0, waterTop - 90 + drift * 0.5, W, 44);
    g.restore();
  }
  /* fireflies at night */
  if (cat === 'night' || cat === 'dusk') {
    g.save();
    for (var f = 0; f < world.fireflies.length; f++) {
      var fl = world.fireflies[f];
      var fx = fl.x + Math.sin(world.t * fl.sp + fl.ph) * 22;
      var fy2 = fl.y + Math.cos(world.t * fl.sp * 0.7 + fl.ph) * 14;
      var fa = 0.25 + 0.6 * Math.abs(Math.sin(world.t * 1.6 + fl.ph * 3));
      g.fillStyle = 'rgba(255,240,170,' + fa.toFixed(2) + ')';
      g.beginPath(); g.arc(fx, fy2, 2.4, 0, 6.283); g.fill();
    }
    g.restore();
  }
  /* rain */
  if (world.weather === 'rain') {
    g.save(); g.strokeStyle = 'rgba(220,235,245,0.32)'; g.lineWidth = 1;
    g.beginPath();
    for (var r = 0; r < world.rain.length; r++) {
      var dr = world.rain[r];
      g.moveTo(dr.x, dr.y); g.lineTo(dr.x - 4, dr.y + 16);
    }
    g.stroke(); g.restore();
  }
}
function drawDock(g) {
  var y = dockY();
  g.save();
  g.fillStyle = 'rgba(20,40,60,0.25)';
  g.fillRect(0, y + 26, heronPerchX() + 40, 8); /* soft shadow on water */
  g.fillStyle = '#8a6844';
  for (var i = 0; i < 4; i++) g.fillRect(6 + i * 14, y + 26, 9, 60 - i * 6); /* posts */
  for (var p = 0; p < 9; p++) {
    var px = p * 22;
    g.fillStyle = p % 2 ? '#9a744c' : '#8a6844';
    g.fillRect(px, y, 20, 16);
    g.strokeStyle = 'rgba(60,40,20,0.4)'; g.lineWidth = 1;
    g.strokeRect(px + 0.5, y + 0.5, 19, 15);
  }
  g.fillStyle = '#7a5c3c';
  g.fillRect(0, y + 16, 9 * 22, 6);
  g.restore();
}
function depthToY(d) {
  return waterTop + 16 + (Math.min(3.4, d) / 3.4) * (H - waterTop - 70);
}
function drawRodAndLine(g) {
  var tipX = heronPerchX() - 40, tipY = dockY() - 96;
  /* rod */
  g.save();
  g.strokeStyle = '#6b4a2e'; g.lineWidth = 6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(tipX - 70, dockY() - 8); g.quadraticCurveTo(tipX - 20, tipY + 30, tipX, tipY); g.stroke();
  g.strokeStyle = '#8a6844'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(tipX - 70, dockY() - 8); g.quadraticCurveTo(tipX - 20, tipY + 30, tipX, tipY); g.stroke();
  g.restore();
  if (phase === 'idle' || phase === 'menu') return;
  var bx = world.bobX, by = world.bobY;
  g.save();
  /* the line reddens while the fish surges — the world tells you to ease off */
  g.strokeStyle = world.pullActive ? 'rgba(210,70,50,0.95)' : 'rgba(240,240,235,0.85)';
  g.lineWidth = world.pullActive ? 2.6 : 1.6;
  g.beginPath(); g.moveTo(tipX, tipY); g.lineTo(bx, by); g.stroke();
  /* bobber */
  var bob = Math.sin(world.t * 3) * 2.5;
  if (phase === 'bite') bob = 7 + Math.sin(world.t * 26) * 3.5; /* plunging */
  if (world.dipT > 0) bob += 6; /* nibble dip */
  var thrash = world.pullActive ? Math.sin(world.t * 40) * 5 * world.pullFrac : 0;
  g.fillStyle = '#d84a3a';
  g.beginPath(); g.arc(bx + thrash, by + bob, 8, Math.PI, 0); g.fill();
  g.fillStyle = '#f5f2ea';
  g.beginPath(); g.arc(bx + thrash, by + bob, 8, 0, Math.PI); g.fill();
  g.strokeStyle = '#7a3a2a'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(bx + thrash, by + bob, 8, 0, 6.283); g.stroke();
  g.restore();
}
function drawTargetMarker(g) {
  /* while charging: the aim marker over the water */
  if (phase !== 'charging') return;
  var x = castTargetX, pulse = 1 + Math.sin(world.t * 6) * 0.12;
  g.save();
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2;
  g.setLineDash([6, 5]);
  g.beginPath(); g.ellipse(x, waterTop + 6, 22 * pulse, 8 * pulse, 0, 0, 6.283); g.stroke();
  g.setLineDash([]);
  g.fillStyle = 'rgba(255,217,143,0.95)';
  g.beginPath(); g.moveTo(x - 8, waterTop - 26); g.lineTo(x + 8, waterTop - 26); g.lineTo(x, waterTop - 16); g.closePath(); g.fill();
  g.restore();
}
function drawSilhs(g) {
  g.save();
  for (var i = 0; i < world.silhs.length; i++) {
    var s = world.silhs[i];
    drawFish(g, s.x, s.y + Math.sin(world.t * 2 + s.ph) * 5, 0.85 * s.fish.size, null,
      { silhouette: true, flip: s.dir < 0, slim: s.fish.behavior === 'darter' });
  }
  g.restore();
}
function drawRipplesParts(g) {
  var i, p;
  for (i = world.ripples.length - 1; i >= 0; i--) {
    p = world.ripples[i];
    g.save();
    g.strokeStyle = 'rgba(255,255,255,' + Math.max(0, p.life / p.max * 0.7).toFixed(2) + ')';
    g.lineWidth = 2;
    g.beginPath(); g.ellipse(p.x, p.y, p.r, p.r * 0.36, 0, 0, 6.283); g.stroke();
    g.restore();
  }
  g.save();
  g.font = '700 15px ' + UI_FONT; g.fillStyle = 'rgba(255,255,255,0.85)'; g.textAlign = 'center';
  for (i = world.parts.length - 1; i >= 0; i--) {
    p = world.parts[i];
    if (p.k === 'z') { g.fillText(p.txt, p.x, p.y); }
    else if (p.k === 'drop') {
      g.fillStyle = 'rgba(220,240,250,' + Math.max(0, p.life / p.max * 0.9).toFixed(2) + ')';
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.283); g.fill();
    }
  }
  g.restore();
}
function render() {
  var spot = spotById(save.spot), cat = timeCat();
  drawSky(ctx, spot.palette, cat);
  drawWater(ctx, spot.palette, cat);
  drawSilhs(ctx);
  drawDock(ctx);
  drawRodAndLine(ctx);
  drawHeron(ctx);
  drawRipplesParts(ctx);
  drawTargetMarker(ctx);
}

/* ============================== underwater targeting ============================== */
function pickSilhFish() {
  /* weighted sample from this spot's real species, current conditions */
  var pool = CC.spotFish(save.spot);
  if (!pool.length) pool = CC.FISH;
  var daily = CC.dailyBigCatch(todayStr());
  var total = 0, i, w;
  var weights = pool.map(function (f) {
    w = CC.spawnWeight(f, { spotId: save.spot, timeCat: timeCat(), weather: world.weather,
      lureLevel: save.up.lure, dailyId: daily.fishId });
    total += w;
    return w;
  });
  var roll = Math.random() * total;
  for (i = 0; i < pool.length; i++) { roll -= weights[i]; if (roll <= 0) return pool[i]; }
  return pool[pool.length - 1];
}
function spawnSilh() {
  var f = pickSilhFish();
  var depth = f.zone + 0.1 + Math.random() * 0.7;
  var speed = { darter: 55 + Math.random() * 45, nibbler: 30 + Math.random() * 25,
    steady: 22 + Math.random() * 28, lurker: 10 + Math.random() * 12 }[f.behavior] || 26;
  world.silhs.push({
    fish: f, fishId: f.id,
    x: Math.random() * W, y: depthToY(depth),
    dir: Math.random() < 0.5 ? 1 : -1, speed: speed,
    ph: Math.random() * 6.28, turnT: 1 + Math.random() * 2, dart: null
  });
}
function spawnSilhs() {
  world.silhs = [];
  for (var i = 0; i < 8; i++) spawnSilh();
}
function nearestSilh(x, y, maxD) {
  var best = null, bd = maxD;
  for (var i = 0; i < world.silhs.length; i++) {
    var s = world.silhs[i];
    var d = Math.hypot(s.x - x, s.y - y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
function updateSilhs(dt) {
  if (world.silhs.length < 8 && Math.random() < dt * 0.5) spawnSilh();
  for (var i = 0; i < world.silhs.length; i++) {
    var s = world.silhs[i], b = s.fish.behavior;
    if (s.dart) {
      s.x += (s.dart.x - s.x) * Math.min(1, dt * 6);
      s.y += (s.dart.y - s.y) * Math.min(1, dt * 6);
      continue;
    }
    if (b === 'darter') {
      /* darters: fast, sudden turns and bursts */
      s.turnT -= dt;
      if (s.turnT <= 0) {
        if (Math.random() < 0.55) s.dir *= -1;
        else s.speed = 55 + Math.random() * 60;
        s.turnT = 0.6 + Math.random() * 1.6;
      }
    } else if (b === 'nibbler') {
      /* nibblers: quick jittery little moves */
      s.x += Math.sin(world.t * 9 + s.ph) * 18 * dt;
      if (Math.random() < dt * 0.8) s.dir *= -1;
    }
    s.x += s.dir * s.speed * dt;
    if (s.x > W + 60) { s.x = -60; s.dir = 1; }
    if (s.x < -60) { s.x = W + 60; s.dir = -1; }
  }
}

/* ============================== game state ============================== */
var phase = 'menu'; /* menu|idle|charging|casting|sinking|waiting|nibbling|bite|reeling|reveal */
var holdMs = 0, castT = 0, sinkT = 0, waitT = 0, biteDelay = 0;
var nibbleT = 0, nibbleEvents = [];
var biteLeft = 0;
var reelProg = 0, reelEnd = 4000, pulls = [], holding = false, clickT = 0;
var pullResults = [];
var castDepthV = 0.5, castTargetX = 0, castTargetY = 0, castFromX = 0, castFromY = 0;
var curCatch = null; /* CC.resolveCatch result for this cast */
var toastTimer = null;
var QUIET_PHASES = { waiting: 1, nibbling: 1, bite: 1, reeling: 1 };

function toast(msg, ms) {
  var el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 2200);
}
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('on'); });
  $(id).classList.add('on');
}
function setPhase(p) {
  phase = p;
  var cb = $('cast-btn'), hp = $('hook-prompt'), dg = $('depth-gauge'), rb = $('reel-bar');
  cb.disabled = !(p === 'idle');
  cb.classList.toggle('charging', p === 'charging');
  hp.hidden = p !== 'bite';
  rb.hidden = p !== 'reeling';
  dg.classList.toggle('show', p === 'charging');
  document.body.classList.toggle('quiet', !!QUIET_PHASES[p]);
  AU.setUnderwater(p === 'waiting' || p === 'nibbling');
  if (p === 'charging') {
    var maxD = CC.maxDepthFor(save.up.line);
    var gmMid = $('gm-mid'), gmDeep = $('gm-deep');
    var f1 = 1 / maxD, f2 = 2 / maxD;
    gmMid.style.bottom = (f1 * 100).toFixed(1) + '%';
    gmDeep.style.bottom = (f2 * 100).toFixed(1) + '%';
    gmMid.style.display = f1 < 0.99 ? '' : 'none';
    gmDeep.style.display = f2 < 0.99 ? '' : 'none';
  }
  if (p === 'idle') { cb.querySelector('span').textContent = 'HOLD TO CAST'; world.pullActive = false; }
}

function castPoint() { return { x: heronPerchX() + 96, y: 0 }; }

function beginCharge() {
  if (phase !== 'idle') return;
  AU.ensure();
  setPhase('charging');
  holdMs = 0;
  castTargetX = castPoint().x; /* aim starts mid-water; drag to move */
}
function releaseCast() {
  if (phase !== 'charging') return;
  castDepthV = CC.castDepth(holdMs, save.up.line);
  castTargetY = depthToY(castDepthV);
  castTargetX = Math.max(40, Math.min(W - 40, castTargetX));
  world.bobX = heronPerchX() - 40; world.bobY = dockY() - 96;
  castFromX = world.bobX; castFromY = world.bobY;
  castT = 0;
  /* visible targeting: nearest silhouette within ~70px becomes the target */
  var near = nearestSilh(castTargetX, castTargetY, 70);
  var targetId = near ? near.fishId : null;
  if (near) near.dart = { x: castTargetX, y: castTargetY };
  var daily = CC.dailyBigCatch(todayStr());
  var rng = function () { return Math.random(); };
  curCatch = CC.resolveCatch({
    rng: rng, spotId: save.spot, targetId: targetId, depth: castDepthV,
    timeCat: timeCat(), weather: world.weather,
    upgrades: save.up, dailyId: daily.fishId
  });
  setPhase('casting');
  AU.plip();
  world.ripples.push({ x: castTargetX, y: waterTop + 6, r: 6, life: 1.2, max: 1.2 });
}
function startWaiting() {
  biteDelay = CC.biteDelayMs(Math.random) / 1000; /* ms -> s */
  waitT = 0;
  setPhase('waiting');
}
function startNibbling() {
  /* Animal Crossing rhythm: fake-out nibbles before THE bite */
  var plan = CC.nibblePlan(Math.random, curCatch.fish);
  nibbleT = 0; nibbleEvents = [];
  var t = 0;
  for (var i = 0; i < plan.nibbles; i++) {
    t += 700 + Math.random() * 400; /* 700–1100ms apart */
    nibbleEvents.push({ at: t, bite: false, done: false });
  }
  t += 700 + Math.random() * 400;
  nibbleEvents.push({ at: t, bite: true, done: false });
  setPhase('nibbling');
}
function nibbleFx() {
  /* small ripple + soft tick + bobber dip — the fake-out */
  world.ripples.push({ x: world.bobX, y: waterTop + 6, r: 5, life: 0.9, max: 0.9 });
  world.dipT = 0.35;
  AU.nibbleTick();
}
function startBite() {
  biteLeft = curCatch.biteWindowMs; /* generous: sim's window */
  setPhase('bite');
  AU.bite(); /* big splash + low thump — the unmistakable cue */
  var bx = world.bobX;
  for (var i = 0; i < 10; i++) world.parts.push({
    k: 'drop', x: bx + (Math.random() - 0.5) * 26, y: waterTop + 4,
    vx: (Math.random() - 0.5) * 220, vy: -140 - Math.random() * 200,
    r: 1.5 + Math.random() * 2.5, life: 0.9, max: 0.9
  });
  for (var j = 0; j < 3; j++) world.ripples.push({ x: bx, y: waterTop + 6, r: 8 + j * 10, life: 1.4, max: 1.4 });
}
function hookIt() {
  if (phase !== 'bite') return;
  pulls = curCatch.reelPulls.slice();
  pulls.forEach(function (p) { p.warned = false; p.held = false; p.scored = false; });
  var last = pulls[pulls.length - 1];
  reelEnd = last.at + last.dur + 600;
  reelProg = 0; pullResults = []; clickT = 0;
  world.pullActive = false;
  setPhase('reeling');
  AU.hook();
}
function missedBite() {
  /* no fail state: it just wasn't ready */
  world.silhs.forEach(function (s) { s.dart = null; });
  setPhase('idle');
  toast('It slipped away… another day.');
  if (heron.mode === 'watching' || heron.mode === 'sleeping') heronSay(['...']);
}
function finishReel() {
  var f = curCatch.fish;
  var res = CC.finishCatch({
    fish: f, sizeCm: curCatch.sizeCm, pullResults: pullResults,
    lureLevel: save.up.lure, isDaily: curCatch.isDaily
  });
  var coins = res.coins, quality = res.quality;
  var prev = save.journal[f.id];
  var isNew = !prev;
  save.coins += coins;
  CC.journalRecord(save.journal, f.id, coins);
  var isRecord = CC.checkRecord(save.journal, f.id, curCatch.sizeCm);
  if (coins > save.best) save.best = coins;
  save.streak = CC.nextStreak(save.streak, todayStr());
  var daily = CC.dailyBigCatch(todayStr());
  if (curCatch.isDaily) save.daily = { date: daily.date, fishId: daily.fishId, caught: true };
  var db = save.dailyBest;
  if (db.date !== todayStr() || coins > db.value) {
    save.dailyBest = { date: todayStr(), value: coins };
    postDailyScore(coins);
  }
  persist();
  updateHud();
  /* heron judges */
  heron.judgeWide = f.rarity === 'legendary';
  heronSay(HERON_WORDS[f.rarity] || HERON_WORDS.common);
  if (f.rarity === 'legendary') AU.mrrp();
  if (isRecord) AU.fanfare(); else AU.chime();
  world.silhs.forEach(function (s) { s.dart = null; });
  showCatchCard(f, coins, quality, isNew, isRecord, curCatch.isDaily, curCatch.sizeCm);
  setPhase('reveal');
}

/* ============================== update loop ============================== */
var lastT = 0, running = true;
function loop(ts) {
  if (!running) return;
  requestAnimationFrame(loop);
  var dt = Math.min(0.1, (ts - lastT) / 1000 || 0.016);
  lastT = ts;
  world.t += dt;
  world.cycleT = (world.cycleT + dt / CYCLE * timeSpeedMult(timeCat(), save.spot)) % 1;
  world.weatherT += dt;
  if (world.weatherT > world.weatherDur) pickWeather();
  updateHeron(dt);
  updateBirds(dt);
  AU.scheduleAmbient(dt, timeCat());
  var i;
  /* clouds drift */
  for (i = 0; i < world.clouds.length; i++) {
    var cl = world.clouds[i];
    cl.x += cl.v * dt;
    if (cl.x - 80 > W) { cl.x = -80; cl.y = 20 + Math.random() * waterTop * 0.5; }
  }
  /* shooting stars at night */
  world.meteorT -= dt;
  if (world.meteorT <= 0) {
    if (timeCat() === 'night') world.meteors.push({
      x: Math.random() * W, y: Math.random() * waterTop * 0.4,
      vx: -(220 + Math.random() * 160), vy: 130 + Math.random() * 90, life: 0.9, max: 0.9
    });
    world.meteorT = 8 + Math.random() * 12;
  }
  for (i = world.meteors.length - 1; i >= 0; i--) {
    var m = world.meteors[i];
    m.life -= dt; m.x += m.vx * dt; m.y += m.vy * dt;
    if (m.life <= 0) world.meteors.splice(i, 1);
  }
  /* rain falls */
  if (world.weather === 'rain') {
    for (i = 0; i < world.rain.length; i++) {
      var dr = world.rain[i];
      dr.y += dr.v * dt; dr.x -= dr.v * 0.12 * dt;
      if (dr.y > H) { dr.y = -20; dr.x = Math.random() * (W + 60); }
    }
  }
  updateSilhs(dt);
  /* ripples + particles */
  for (i = world.ripples.length - 1; i >= 0; i--) {
    var rp = world.ripples[i];
    rp.life -= dt; rp.r += dt * 46;
    if (rp.life <= 0) world.ripples.splice(i, 1);
  }
  for (i = world.parts.length - 1; i >= 0; i--) {
    var p = world.parts[i];
    p.life -= dt;
    if (p.k === 'z') { p.y += p.vy * dt; }
    else if (p.k === 'drop') { p.vy += 900 * dt; p.y += p.vy * dt; p.x += p.vx * dt; }
    if (p.life <= 0) world.parts.splice(i, 1);
  }
  if (world.dipT > 0) world.dipT -= dt;

  /* phases */
  if (phase === 'charging') {
    holdMs += dt * 1000;
    var frac = Math.min(1, holdMs / 2500);
    $('gauge-fill').style.height = (frac * 100).toFixed(1) + '%';
    var d = CC.castDepth(holdMs, save.up.line);
    var z = CC.ZONES[CC.zoneForDepth(d)];
    var lbl = 'HOLD… ' + z.toUpperCase();
    var sp2 = $('cast-btn').querySelector('span');
    if (sp2.textContent !== lbl) sp2.textContent = lbl;
    world.bobX = heronPerchX() - 40; world.bobY = dockY() - 96;
  } else if (phase === 'casting') {
    castT += dt;
    var k = Math.min(1, castT / 0.45), e = 1 - Math.pow(1 - k, 2);
    world.bobX = castFromX + (castTargetX - castFromX) * e;
    world.bobY = castFromY + (waterTop + 4 - castFromY) * e - Math.sin(k * Math.PI) * 60;
    if (k >= 1) {
      sinkT = 0;
      world.ripples.push({ x: castTargetX, y: waterTop + 6, r: 8, life: 1.2, max: 1.2 });
      AU.splash();
      setPhase('sinking');
    }
  } else if (phase === 'sinking') {
    sinkT += dt;
    var k2 = Math.min(1, sinkT / 0.9);
    world.bobX = castTargetX;
    world.bobY = (waterTop + 4) + (castTargetY - waterTop - 4) * k2;
    world.bobDepth = castDepthV * k2;
    if (k2 >= 1) startWaiting();
  } else if (phase === 'waiting') {
    waitT += dt;
    world.bobX = castTargetX;
    world.bobY = castTargetY + Math.sin(world.t * 3) * 2;
    world.bobDepth = castDepthV;
    if (waitT >= biteDelay) startNibbling();
  } else if (phase === 'nibbling') {
    nibbleT += dt * 1000;
    world.bobX = castTargetX;
    world.bobY = castTargetY + Math.sin(world.t * 3) * 2;
    for (i = 0; i < nibbleEvents.length; i++) {
      var ev = nibbleEvents[i];
      if (!ev.done && nibbleT >= ev.at) {
        ev.done = true;
        if (ev.bite) startBite();
        else nibbleFx();
      }
    }
  } else if (phase === 'bite') {
    biteLeft -= dt * 1000;
    world.bobX = castTargetX;
    world.bobY = castTargetY + Math.sin(world.t * 3) * 2;
    if (biteLeft <= 0) missedBite();
  } else if (phase === 'reeling') {
    /* auto-progresses (~4s base); HOLD to reel 2x faster.
     * Fish surges at reelPulls times — holding during a pull = 'rough'. */
    reelProg += dt * 1000 * (holding ? 2 : 1);
    var active = null;
    for (i = 0; i < pulls.length; i++) {
      var pu = pulls[i];
      if (!pu.warned && reelProg >= pu.at) { pu.warned = true; AU.warn(); }
      if (reelProg >= pu.at && reelProg <= pu.at + pu.dur) {
        active = pu;
        if (holding) pu.held = true;
      }
      if (!pu.scored && reelProg > pu.at + pu.dur) {
        pu.scored = true;
        pullResults.push(pu.held ? 'rough' : 'gentle');
      }
    }
    world.pullActive = !!active;
    world.pullFrac = active ? Math.min(1, (reelProg - active.at) / active.dur) : 0;
    world.bobX = castTargetX;
    world.bobY = castTargetY + Math.sin(world.t * (active ? 30 : 6)) * (active ? 5 : 2);
    clickT -= dt;
    if (clickT <= 0) { AU.reelClick(); clickT = holding ? 0.16 : 0.3; }
    $('reel-fill').style.width = Math.min(100, reelProg / reelEnd * 100).toFixed(1) + '%';
    if (reelProg >= reelEnd) finishReel();
  } else if (phase === 'idle' || phase === 'menu') {
    world.bobX = heronPerchX() - 40; world.bobY = dockY() - 96;
  }
  render();
  updateSkyHud();
}
document.addEventListener('visibilitychange', function () {
  running = !document.hidden;
  if (running) { lastT = performance.now(); requestAnimationFrame(loop); }
  try {
    if (AU.ctx) { if (document.hidden) AU.ctx.suspend(); else if (!save.muted) AU.ctx.resume(); }
  } catch (e) {}
});

/* ============================== HUD ============================== */
var SKY_ICON = { dawn: '🌅', day: '☀️', dusk: '🌇', night: '🌙' };
var WX_ICON = { clear: '', rain: '🌧️', fog: '🌫️' };
function updateHud() {
  $('hud-coins').textContent = '🪙 ' + save.coins.toLocaleString();
  $('hud-spot').textContent = spotById(save.spot).name;
}
function updateSkyHud() {
  var el = $('hud-sky'), s = SKY_ICON[timeCat()] + WX_ICON[world.weather];
  if (el.textContent !== s) el.textContent = s;
}
function updateMenu() {
  var st = save.streak;
  $('menu-streak').textContent = st.count > 0
    ? '🔥 ' + st.count + '-day catch streak' + (st.last === todayStr() ? ' · fished today!' : '')
    : 'The heron is waiting. The water is calm.';
  var caught = Object.keys(save.journal).length;
  $('menu-whisper').textContent = caught > 0
    ? caught + ' of ' + CC.FISH.length + ' fish in your journal'
    : CC.FISH.length + ' fish swim these waters. Nobody has met them all yet.';
  renderSpotCards();
  renderAquarium();
}

/* ---------- menu: spot picker ---------- */
function renderSpotCards() {
  var box = $('spot-cards');
  box.innerHTML = '';
  CC.SPOTS.forEach(function (sp) {
    var owned = CC.canAccess(sp.id, save);
    var here = save.spot === sp.id;
    var card = document.createElement('div');
    card.className = 'spot-card' + (here ? ' sel' : '');
    var sw = 'linear-gradient(180deg,' + sp.palette.sky[0] + ' 0%,' + sp.palette.sky[1] +
      ' 48%,' + sp.palette.water[0] + ' 52%,' + sp.palette.water[2] + ' 100%)';
    card.innerHTML =
      '<div class="spot-swatch" style="background:' + sw + '"></div>' +
      '<div class="spot-info"><b>' + esc(sp.name) + '</b><p>' + esc(sp.tagline) + '</p></div>';
    var btn = document.createElement('button');
    btn.className = 'spot-btn' + (here ? ' here' : '');
    btn.type = 'button';
    if (here) { btn.textContent = '★ Here'; btn.disabled = true; }
    else if (owned) {
      btn.textContent = 'Fish here';
      btn.addEventListener('click', function () {
        save.spot = sp.id; persist(); pickWeather(); updateMenu(); updateHud();
        toast('🎣 ' + sp.name + ' — good choice.');
      });
    } else {
      btn.textContent = '🪙' + sp.license + ' license';
      btn.addEventListener('click', function () {
        var r = CC.buyLicense(save, sp.id);
        if (r.ok) {
          persist(); AU.chime(); updateHud(); renderSpotCards();
          toast('📜 License stamped! ' + sp.name + ' is yours.');
        } else if (r.reason === 'broke') {
          toast('Not enough coins yet — keep fishing.');
        }
      });
    }
    card.appendChild(btn);
    box.appendChild(card);
  });
}

/* ---------- menu: aquarium ---------- */
function aquaRate() {
  var tank = (save.aqua && save.aqua.tank) || [];
  var perHour = 0;
  tank.forEach(function (id) { var f = CC.BY_ID[id]; if (f) perHour += CC.AQUA_RATE[f.rarity] || 0; });
  return { tank: tank, perHour: perHour };
}
function renderAquarium() {
  var r = aquaRate();
  var tank = $('aqua-tank');
  tank.innerHTML = '';
  if (!r.tank.length) {
    var e = document.createElement('span');
    e.className = 'empty';
    e.textContent = 'Your tank is empty — keep a catch from the catch card.';
    tank.appendChild(e);
  } else {
    r.tank.forEach(function (id) {
      var f = CC.BY_ID[id];
      if (!f) return;
      var c = document.createElement('canvas');
      c.className = 'aqua-fish';
      c.width = 64; c.height = 36;
      drawFish(c.getContext('2d'), 32, 18, 0.55 * f.size, f.color, { pattern: patternFor(f.id) });
      c.title = f.name;
      tank.appendChild(c);
    });
  }
  $('aqua-rate').textContent = r.tank.length
    ? r.tank.length + '/' + CC.AQUA_MAX + ' fish · earning ~' + r.perHour + ' 🪙/hour (up to 8h)'
    : 'A kept fish earns coins while you rest. Tiny Fishing had the right idea.';
}
function collectAquarium() {
  AU.ensure();
  var coins = CC.aquariumTick(save, Date.now());
  save.coins += coins;
  persist();
  updateHud(); renderAquarium();
  if (coins > 0) { AU.chime(); toast('+' + coins + ' 🪙 from your aquarium'); }
  else toast('The tank is still saving up…');
}

/* ============================== input ============================== */
function bindInput() {
  var cb = $('cast-btn'), dragX = 0;
  cb.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    AU.ensure();
    dragX = e.clientX;
    beginCharge();
    try { cb.setPointerCapture(e.pointerId); } catch (err) {}
  });
  cb.addEventListener('pointermove', function (e) {
    /* drag left/right while holding to aim the cast */
    if (phase !== 'charging') return;
    castTargetX = Math.max(40, Math.min(W - 40, castTargetX + (e.clientX - dragX)));
    dragX = e.clientX;
  });
  cb.addEventListener('pointerup', function (e) { e.preventDefault(); releaseCast(); });
  cb.addEventListener('pointercancel', function () { if (phase === 'charging') setPhase('idle'); });
  cb.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  cv.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    AU.ensure();
    holding = true;
    if (phase === 'bite') hookIt();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
    cv.addEventListener(ev, function () { holding = false; });
  });
  document.addEventListener('keydown', function (e) {
    if (e.code !== 'Space' || e.repeat) return;
    if (!$('scr-play').classList.contains('on')) return;
    e.preventDefault();
    AU.ensure();
    if (phase === 'idle') beginCharge();
    else if (phase === 'reeling') holding = true;
    else if (phase === 'bite') hookIt();
  });
  document.addEventListener('keyup', function (e) {
    if (e.code !== 'Space') return;
    holding = false;
    releaseCast();
  });
  window.addEventListener('blur', function () {
    holding = false;
    if (phase === 'charging') setPhase('idle');
  });
}

/* ============================== overlays ============================== */
function openOv(id) { $(id).hidden = false; AU.ensure(); }
function closeOv(id) { $(id).hidden = true; }
document.querySelectorAll('[data-close]').forEach(function (b) {
  b.addEventListener('click', function () { closeOv(b.getAttribute('data-close')); $('journal-detail').hidden = true; });
});
document.querySelectorAll('.overlay').forEach(function (ov) {
  ov.addEventListener('pointerdown', function (e) { if (e.target === ov && ov.id !== 'ov-catch') closeOv(ov.id); });
});

/* ---------- journal ---------- */
function journalCells() {
  var grid = $('journal-grid');
  grid.innerHTML = '';
  var frag = document.createDocumentFragment();
  CC.FISH.forEach(function (f) {
    var caught = !!save.journal[f.id];
    var cell = document.createElement('div');
    cell.className = 'jcell' + (caught ? ' caught' : ' locked');
    var c = document.createElement('canvas');
    c.width = 96; c.height = 60;
    drawFish(c.getContext('2d'), 48, 30, 0.85, f.color,
      { silhouette: !caught, slim: f.behavior === 'darter', pattern: caught ? patternFor(f.id) : null });
    cell.appendChild(c);
    var n = document.createElement('div');
    n.className = 'jn';
    n.textContent = caught ? f.name : '???';
    cell.appendChild(n);
    cell.addEventListener('click', function () { showFishDetail(f); });
    frag.appendChild(cell);
  });
  grid.appendChild(frag);
  var caughtN = Object.keys(save.journal).length;
  var pct = Math.round(caughtN / CC.FISH.length * 100);
  $('journal-sub').textContent = caughtN + ' of ' + CC.FISH.length + ' discovered — ' + pct + '%';
}
var BAIT_NOTES = {
  common: 'Bait note: not picky. Any lure will do.',
  uncommon: 'Bait note: a better lure tempts it more often.',
  rare: 'Bait note: Marlow’s advice — your best lure, and patience.',
  legendary: 'Bait note: only the finest lure. And a rumor or two.'
};
function habitatText(f) {
  function words(list) { return list.join(' / '); }
  return 'Lives in ' + CC.ZONES[f.zone] + ' water · likes ' + words(f.time) + ' · ' + words(f.weather) + ' weather.';
}
function showFishDetail(f) {
  var caught = !!save.journal[f.id];
  var d = $('journal-detail');
  var lore = (save.lore[f.id]) || f.lore;
  d.innerHTML =
    '<h3>' + esc(caught ? f.name : '???') + '</h3>' +
    '<div class="jbadges">' +
    '<span class="pill r-' + f.rarity + '">' + f.rarity + '</span>' +
    '<span class="pill">' + CC.ZONES[f.zone] + '</span>' +
    '<span class="pill">🪙 ' + f.coins + '</span>' +
    (caught ? '<span class="pill">×' + save.journal[f.id].count + ' caught</span>' : '') +
    (caught && save.journal[f.id].biggest ? '<span class="pill">best ' + save.journal[f.id].biggest + '🪙</span>' : '') +
    (caught && save.journal[f.id].record ? '<span class="pill">record ' + save.journal[f.id].record + ' cm</span>' : '') +
    '</div>' +
    (caught
      ? '<p class="habitat">' + esc(habitatText(f)) + '</p>' +
        '<p class="bait-note">' + esc(BAIT_NOTES[f.rarity] || '') + '</p>' +
        '<p class="lore" id="jd-lore">“' + esc(lore) + '”</p>'
      : '<p class="lore">A silhouette. The cove keeps its secrets.</p>');
  d.hidden = false;
  d.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  if (caught && !save.lore[f.id]) {
    aiFetch('fishlore', { fish: f.name }, function (t) {
      if (!t) return;
      t = String(t).slice(0, 90);
      save.lore[f.id] = t; persist();
      var el = $('jd-lore');
      if (el) el.textContent = '“' + t + '”';
    });
  }
}

/* ---------- Marlow's Tackle ---------- */
var MARLOW_SAYS = [
  'Back again, friend — the water missed you.',
  'Wind’s right for the shallows today. Or the deep. Fish don’t check forecasts.',
  'Heard the heron talking about you. All good things. Mostly.',
  'Coins burn holes in tackle boxes, I always say.',
  'Buy a rumor. Everyone loves a good rumor.',
  'Take your time. The fish aren’t going anywhere.',
  'That last one you caught? A beauty. I’d know — I hear everything.'
];
function drawMarlow(g) {
  /* warm canvas-drawn portrait of Marlow, the tackle keeper */
  g.clearRect(0, 0, 96, 96);
  g.save();
  g.fillStyle = '#f5d9a8';
  g.beginPath(); g.arc(48, 48, 44, 0, 6.283); g.fill(); /* backdrop */
  g.fillStyle = '#7a5c3c';
  g.beginPath(); g.ellipse(48, 92, 34, 20, 0, Math.PI, 0); g.fill(); /* shoulders */
  g.fillStyle = '#e8b98a';
  g.beginPath(); g.arc(48, 52, 27, 0, 6.283); g.fill(); /* face */
  g.fillStyle = '#d8d0c4';
  g.beginPath(); g.ellipse(48, 72, 20, 16, 0, 0, Math.PI); g.fill(); /* beard */
  g.fillStyle = '#5d8f4c';
  g.beginPath(); g.arc(48, 38, 27, Math.PI, 0); g.fill(); /* cap */
  g.fillRect(20, 34, 56, 7); /* brim */
  g.strokeStyle = '#5a4632'; g.lineWidth = 2.5; g.lineCap = 'round';
  g.beginPath(); g.arc(38, 52, 5, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); /* happy eyes */
  g.beginPath(); g.arc(58, 52, 5, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
  g.beginPath(); g.arc(48, 62, 8, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); /* smile */
  g.restore();
}
var SHOP_ICON = { rod: '🎣', line: '🧵', lure: '🪱' };
var UNLOCK_DESC = {
  rod: 'Land bigger fish — a steadier rod keeps the bite window open longer.',
  line: 'Reach the deep water — every level sinks your bobber deeper.',
  lure: 'Tempt new species — rarer fish bite more often, and pay more.'
};
function renderShop() {
  drawMarlow($('marlow-face').getContext('2d'));
  $('marlow-say').textContent = '“' + MARLOW_SAYS[Math.floor(Math.random() * MARLOW_SAYS.length)] + '”';
  $('shop-coins').textContent = save.coins.toLocaleString();
  /* upgrades, described by what they unlock */
  var box = $('shop-rows');
  box.innerHTML = '';
  Object.keys(CC.UPGRADES).forEach(function (kind) {
    var meta = CC.UPGRADES[kind], lvl = save.up[kind];
    var cost = CC.upgradeCost(kind, lvl);
    var row = document.createElement('div');
    row.className = 'shop-row';
    var pips = '';
    for (var i = 1; i <= CC.maxLevel(); i++) pips += '<i class="' + (i <= lvl ? 'on' : '') + '"></i>';
    row.innerHTML =
      '<div class="shop-icon">' + SHOP_ICON[kind] + '</div>' +
      '<div class="shop-info"><b>' + meta.name + ' <span style="color:#a5814f">Lv ' + lvl + '</span></b>' +
      '<p>' + esc(UNLOCK_DESC[kind]) + '</p><div class="pips">' + pips + '</div></div>';
    var btn = document.createElement('button');
    btn.className = 'buy-btn'; btn.type = 'button';
    if (cost == null) { btn.textContent = 'MAX'; btn.disabled = true; }
    else {
      btn.textContent = '🪙 ' + cost;
      btn.disabled = save.coins < cost;
      btn.addEventListener('click', function () {
        var c2 = CC.upgradeCost(kind, save.up[kind]);
        if (c2 == null || save.coins < c2) return;
        save.coins -= c2; save.up[kind]++; persist();
        AU.chime();
        toast(meta.name + ' → Lv ' + save.up[kind] + '!');
        updateHud(); renderShop();
      });
    }
    row.appendChild(btn);
    box.appendChild(row);
  });
  /* licenses */
  var lb = $('shop-licenses');
  lb.innerHTML = '';
  CC.SPOTS.forEach(function (sp) {
    if (!sp.license) return;
    var owned = CC.canAccess(sp.id, save);
    var row = document.createElement('div');
    row.className = 'shop-row';
    row.innerHTML = '<div class="shop-icon">📜</div><div class="shop-info"><b>' + esc(sp.name) +
      '</b><p>' + esc(sp.tagline) + '</p></div>';
    var btn = document.createElement('button');
    btn.className = 'buy-btn' + (owned ? ' owned' : ''); btn.type = 'button';
    if (owned) { btn.textContent = 'Owned'; btn.disabled = true; }
    else {
      btn.textContent = '🪙 ' + sp.license;
      btn.disabled = save.coins < sp.license;
      btn.addEventListener('click', function () {
        var r = CC.buyLicense(save, sp.id);
        if (r.ok) { persist(); AU.chime(); toast('📜 ' + sp.name + ' — all yours!'); updateHud(); renderShop(); renderSpotCards(); }
        else toast('Not enough coins yet — keep fishing.');
      });
    }
    row.appendChild(btn);
    lb.appendChild(row);
  });
  /* rumors */
  var rb = $('shop-rumors');
  rb.innerHTML = '';
  Object.keys(CC.RUMORS).forEach(function (legId) {
    var f = CC.BY_ID[legId];
    var owned = (save.rumors && save.rumors[legId]) || 0;
    var list = CC.RUMORS[legId];
    var row = document.createElement('div');
    row.className = 'rumor-row';
    var html = '<div class="rumor-head"><b>' + esc(f ? f.name : legId) + '</b>' +
      '<span class="pill r-legendary">legendary</span>' +
      '<span class="rumor-count">' + owned + '/' + list.length + ' rumors</span></div>';
    for (var i = 0; i < owned; i++) html += '<div class="rumor-text">' + esc(list[i].text) + '</div>';
    row.innerHTML = html;
    var foot = document.createElement('div');
    foot.className = 'rumor-foot';
    var btn = document.createElement('button');
    btn.className = 'buy-btn'; btn.type = 'button';
    if (owned >= list.length) { btn.textContent = 'All heard'; btn.disabled = true; }
    else {
      var cost = list[owned].cost;
      btn.textContent = '🪙 ' + cost + ' — hear more';
      btn.disabled = save.coins < cost;
      btn.addEventListener('click', function () {
        var r = CC.buyRumor(save, legId);
        if (r.ok) {
          persist(); AU.chime(); updateHud(); renderShop();
          toast('Marlow pockets the coins…');
        } else if (r.reason === 'broke') toast('Not enough coins for that rumor.');
      });
    }
    foot.appendChild(btn);
    row.appendChild(foot);
    rb.appendChild(row);
  });
}

/* ---------- daily panel ---------- */
function openDaily() {
  openOv('ov-daily');
  var d = CC.dailyBigCatch(todayStr());
  var f = d.fish, caught = !!(save.daily.date === d.date && save.daily.caught);
  var el = $('daily-body');
  el.innerHTML =
    '<div class="daily-hero"><canvas id="daily-fish" width="220" height="128"></canvas>' +
    '<div><h3>' + (caught ? esc(f.name) : '???') + '</h3>' +
    '<p>One special fish visits these waters today —<br>same for everyone, worldwide.</p>' +
    '<p>🪙 <b>' + d.value + '</b> to whoever lands it.</p>' +
    '<p class="sheet-note" style="margin:4px 0">Hint: ' + CC.ZONES[f.zone] + ' water · likes ' +
    f.time.join('/') + ' · ' + f.weather.join('/') + ' skies.</p>' +
    (caught ? '<span class="daily-stamp">✓ CAUGHT TODAY</span>' : '') +
    '</div></div>' +
    '<p class="sheet-sub">🔥 streak: <b>' + save.streak.count + '</b> day' + (save.streak.count === 1 ? '' : 's') +
    ' · 📖 journal: <b>' + Object.keys(save.journal).length + '/' + CC.FISH.length + '</b></p>';
  var g = $('daily-fish').getContext('2d');
  drawFish(g, 110, 64, 1.7, f.color, { silhouette: !caught, slim: f.behavior === 'darter' });
  renderDailyBoard(d);
}
function renderDailyBoard(d) {
  var box = $('arc-lb');
  var name = '';
  try { name = (localStorage.getItem('arcade_name') || '').trim(); } catch (e) {}
  box.innerHTML = '<div class="arc-lb-title">🏆 Today\'s biggest catches</div>' +
    '<div class="arc-lb-empty">casting the net…</div>';
  arcadeFetch('/scores?game=castaway-cove&board=' + encodeURIComponent('daily-' + d.date), null, function (err, res) {
    var top = res && res.top ? res.top : [];
    var html = '<div class="arc-lb-title">🏆 Today\'s biggest catches</div>';
    if (!top.length) {
      html += '<div class="arc-lb-empty">No catches yet — be the first!' +
        (name ? '' : '<br><span style="font-size:12px">Set your arcade name on the hub to join the board.</span>') + '</div>';
    } else {
      var medals = ['🥇', '🥈', '🥉'];
      html += top.slice(0, 5).map(function (e, i) {
        return '<div class="arc-lb-row' + (e.name === name ? ' me' : '') + '"><span>' +
          (medals[i] || (i + 1) + '.') + ' ' + esc(e.name) + '</span><b>🪙' + (+e.score).toLocaleString() + '</b></div>';
      }).join('');
    }
    box.innerHTML = html;
  });
}

/* ---------- catch card ---------- */
function showCatchCard(f, coins, quality, isNew, isRecord, caughtDaily, sizeCm) {
  openOv('ov-catch');
  $('catch-pun').textContent = '“' + f.pun + '”';
  $('catch-name').textContent = f.name;
  var stars = '★'.repeat(quality) + '☆'.repeat(3 - quality);
  $('catch-meta').innerHTML = esc(String(sizeCm)) + ' cm · <span class="stars">' + stars + '</span>';
  $('catch-badges').innerHTML =
    '<span class="pill r-' + f.rarity + '">' + f.rarity + '</span>' +
    '<span class="pill">' + CC.ZONES[f.zone] + '</span>' +
    (caughtDaily ? '<span class="pill daily">daily big catch</span>' : '');
  $('catch-lore').textContent = '“' + (save.lore[f.id] || f.lore) + '”';
  $('catch-coins').textContent = '+' + coins.toLocaleString() + ' 🪙';
  $('catch-stamp-new').hidden = !isNew;
  $('catch-stamp-rec').hidden = !isRecord;
  var g = $('catch-fish').getContext('2d');
  g.clearRect(0, 0, 260, 130);
  drawFish(g, 130, 65, 2.1 * f.size, f.color, { slim: f.behavior === 'darter', pattern: patternFor(f.id) });
}

/* ============================== gamez-ai (silent) ============================== */
var AI_BASE = 'https://gamez-ai.chaoticutopia84.workers.dev';
function aiFetch(kind, ctx2, cb) {
  var done = false, timer = null;
  function fin(t) { if (!done) { done = true; if (timer) clearTimeout(timer); cb(t); } }
  timer = setTimeout(function () { fin(null); }, 7000);
  try {
    fetch(AI_BASE + '/g', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: kind, game: 'castaway-cove', ctx: ctx2 })
    }).then(function (r) { return r.json(); })
      .then(function (d) { fin(d && d.text ? d.text : null); })
      .catch(function () { fin(null); });
  } catch (e) { fin(null); }
}

/* ============================== gamez-arcade (silent) ============================== */
var ARCADE_BASE = 'https://gamez-arcade.chaoticutopia84.workers.dev';
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
function postDailyScore(value) {
  /* biggest single catch -> daily board. Silent until the allowlist opens. */
  try {
    var name = (localStorage.getItem('arcade_name') || '').trim();
    if (!name || !(value > 0)) return;
    var sent = save.arcadeSent;
    if (sent.date === todayStr() && sent.value >= value) return;
    arcadeFetch('/score', {
      game: 'castaway-cove', board: 'daily-' + todayStr(), name: name, score: Math.round(value)
    }, function (err, res) {
      if (!err && res && typeof res.score === 'number') {
        save.arcadeSent = { date: todayStr(), value: value };
        persist();
      }
    });
  } catch (e) {}
}

/* ============================== wiring ============================== */
function bindUi() {
  $('btn-play').addEventListener('click', function () {
    AU.ensure();
    if (!CC.canAccess(save.spot, save)) {
      save.spot = 'sunny-cove';
      toast('Needs a license — see Marlow.');
    }
    showScreen('scr-play');
    updateHud();
    setPhase('idle');
    spawnSilhs();
    pickWeather();
  });
  $('btn-quit').addEventListener('click', function () {
    if (QUIET_PHASES[phase] || phase === 'charging' || phase === 'casting' || phase === 'sinking') {
      toast('Reel it in first…');
      return;
    }
    setPhase('menu');
    showScreen('scr-menu');
    updateMenu();
  });
  $('btn-how').addEventListener('click', function () {
    var r = $('rules-card');
    r.hidden = !r.hidden;
  });
  $('btn-mute').addEventListener('click', function () { AU.ensure(); AU.setMuted(!save.muted); });
  $('btn-aqua-collect').addEventListener('click', collectAquarium);
  $('btn-journal').addEventListener('click', function () { $('journal-detail').hidden = true; journalCells(); openOv('ov-journal'); });
  $('btn-journal-menu').addEventListener('click', function () { $('journal-detail').hidden = true; journalCells(); openOv('ov-journal'); });
  $('btn-shop').addEventListener('click', function () { renderShop(); openOv('ov-shop'); });
  $('btn-shop-menu').addEventListener('click', function () { renderShop(); openOv('ov-shop'); });
  $('btn-daily').addEventListener('click', openDaily);
  $('btn-daily-menu').addEventListener('click', openDaily);
  $('btn-again').addEventListener('click', function () {
    closeOv('ov-catch');
    spawnSilhs();
    setPhase('idle');
  });
  $('btn-keep').addEventListener('click', function () {
    /* keep a living copy for the aquarium (coins were already awarded) */
    var f = curCatch && curCatch.fish;
    if (f) {
      var r = CC.aquariumAdd(save, f.id);
      if (r.ok) toast('🐠 ' + f.name + ' is swimming in your tank!');
      else if (r.reason === 'full') toast('Tank is full (6) — the heron approves of restraint.');
      else if (r.reason === 'duplicate') toast('One of those is already in the tank.');
      persist();
    }
    closeOv('ov-catch');
    spawnSilhs();
    setPhase('idle');
  });
  $('btn-catch-journal').addEventListener('click', function () {
    closeOv('ov-catch');
    $('journal-detail').hidden = true; journalCells(); openOv('ov-journal');
  });
}

/* ============================== boot ============================== */
function boot() {
  sizeCanvas();
  seedSky();
  pickWeather();
  world.weatherDur = 60; /* first change comes sooner */
  spawnSilhs();
  bindInput();
  bindUi();
  AU.setMuted(!!save.muted);
  updateHud();
  updateMenu();
  if (!save.seenHelp) { save.seenHelp = true; persist(); $('rules-card').hidden = false; }
  showScreen('scr-menu');
  setPhase('menu');
  lastT = performance.now();
  requestAnimationFrame(loop);
}

/* Debug hooks (used by automated playthroughs; harmless in production). */
window.__cc = {
  phase: function () { return phase; },
  save: function () { return save; },
  addCoins: function (n) { save.coins += n; persist(); updateHud(); },
  releaseCast: releaseCast,
  beginCharge: beginCharge,
  hookIt: hookIt,
  holding: function (v) { if (v !== undefined) holding = v; return holding; },
  world: world,
  heron: heron,
  toast: toast
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
