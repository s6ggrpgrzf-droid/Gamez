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
  ,
  duck: function () {
    /* the world holds its breath: brief master dip on the hook */
    try {
      if (!this.ctx || !this.master) return;
      var t = this.ctx.currentTime, g = this.master.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0.25, t + 0.08);
      g.linearRampToValueAtTime(save.muted ? 0 : 0.9, t + 0.7);
    } catch (e) {}
  },
  rareSting: function () {
    /* Dredge's flat-key trick, audible: rare catches get their own sting */
    this.tone(392, 392, 0.16, 'triangle', 0.16);
    this.tone(370, 370, 0.16, 'triangle', 0.16, 0.14);
    this.tone(311, 311, 0.3, 'triangle', 0.18, 0.28);
    this.tone(622, 622, 0.4, 'sine', 0.08, 0.28);
  },
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
  sizeLayers();
  layoutLanterns();
  seedUnder();
}
window.addEventListener('resize', sizeCanvas);

/* world state */
var CYCLE = 480; /* ~8 min day */
var world = {
  t: 0, cycleT: 0.02, weather: 'clear', weatherT: 0, weatherDur: 90,
  wxFrom: 'clear', wxBlend: 1, /* weather transition 0..1 over ~8s */
  clouds: [], stars: [], fireflies: [], rain: [], silhs: [], ripples: [], parts: [],
  birds: [], meteors: [], birdT: 8, meteorT: 12,
  motes: [], bubbles: [], seaweed: [], reeds: [], dflies: [], otters: [], moths: [], glints: [],
  bobX: 0, bobY: 0, bobDepth: 0.5, dipT: 0, pullActive: false, pullFrac: 0,
  slowT: 0, zoomK: 0, catchArc: null,
  cat: { x: 80, dir: 1, mode: 'sit', t: 0, nextMove: 6, petT: 0, batT: 0, batX: 0, y: 0 },
  lanterns: []
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
  var next;
  if (s === 'misty-marsh') next = r < 0.45 ? 'clear' : (r < 0.70 ? 'rain' : 'fog');
  else if (s === 'moonlit-pier') next = r < 0.70 ? 'clear' : (r < 0.88 ? 'rain' : 'fog');
  else next = r < 0.62 ? 'clear' : (r < 0.85 ? 'rain' : 'fog');
  /* weather rolls in over ~8s, never snaps */
  if (next !== world.weather) { world.wxFrom = world.weather; world.wxBlend = 0; }
  world.weather = next;
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

/* ==================== VISUAL OVERHAUL: locked palette ====================
 * Warm light / cool shadows. Shade by hue-shifting, never darkening alone.
 * Never pure #000/#fff. Saturation is a budget: muted backgrounds, saturated
 * accents only on angler / bobber / fish / effects. */
var PAL = {
  ink:      '#2b2119',  /* warm near-black: text, line work */
  cream:    '#f6efdd',  /* cream: text on dark */
  paper:    '#fbf4e4',  /* paper panels */
  kraft:    '#e4d3ac',  /* kraft: journal pages */
  wood:     '#8a6844',  /* dock wood */
  woodDeep: '#6b4f30',
  gold:     '#e0aa4e',  /* rewards, CTAs */
  goldDeep: '#b97f2a',
  rust:     '#a8432f',  /* warnings, line-red */
  moss:     '#5d8f4c',
  reed:     '#4f7a45',
  skyDay:   ['#a8d8ea', '#cfe8dd', '#f6e3b8'],
  skyDawn:  ['#e8a06a', '#f2c48f', '#f7e3bd'],
  skyDusk:  ['#7a5a8c', '#c97a5e', '#f0a868'],
  skyNight: ['#0c1428', '#16233d', '#24344f'],
  uwTop:    '#4f9a94',  /* underwater: light teal at surface */
  uwMid:    '#2e6b7a',
  uwDeep:   '#14343e',  /* deep blue-green */
  foam:     '#f6efdd',
  lantern:  '#ffca7a'
};
function hexRgb(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function rgbHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2;
  if (mx !== mn) {
    var d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hslRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r, g, b;
  if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; } else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function shadeH(hex, amt) {
  /* amt -100..100. Darken -> hue shifts cool (+blue), saturates up.
   * Lighten -> hue shifts warm, desaturates slightly. Never flat gray. */
  var c = hexRgb(hex), hsl = rgbHsl(c[0], c[1], c[2]);
  var h = hsl[0], s = hsl[1], l = hsl[2];
  if (amt < 0) { h -= 10 * (-amt / 100); s = Math.min(1, s + 0.10 * (-amt / 100)); l = Math.max(0, l + amt / 100 * 0.55); }
  else { h += 8 * (amt / 100); s = Math.max(0, s - 0.06 * (amt / 100)); l = Math.min(1, l + amt / 100 * 0.5); }
  var r = hslRgb(h, s, l);
  return 'rgb(' + r[0] + ',' + r[1] + ',' + r[2] + ')';
}
function rgba(hex, a) {
  var c = hexRgb(hex);
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
}
/* offscreen layers: reflection, light, pre-rendered underwater statics */
var reflCv = document.createElement('canvas'), reflCtx = reflCv.getContext('2d');
var lightCv = document.createElement('canvas'), lightCtx = lightCv.getContext('2d');
var underCv = document.createElement('canvas'), underCtx = underCv.getContext('2d');
var underKey = '';
function sizeLayers() {
  reflCv.width = Math.max(2, Math.round(W / 2)); reflCv.height = Math.max(2, Math.round(waterTop / 2));
  lightCv.width = Math.max(2, W); lightCv.height = Math.max(2, H);
  underCv.width = Math.max(2, W); underCv.height = Math.max(2, H - waterTop);
  underKey = '';
}
/* phase grade: full hue-shift grade, not just darkening */
function gradeFor(cat) {
  if (cat === 'dawn') return { sky: PAL.skyDawn, grade: 'rgba(255,166,100,0.16)', glow: 0.5, rayA: 0.10 };
  if (cat === 'dusk') return { sky: PAL.skyDusk, grade: 'rgba(214,110,80,0.22)', glow: 0.7, rayA: 0.07 };
  if (cat === 'night') return { sky: PAL.skyNight, grade: 'rgba(10,18,44,0.52)', glow: 1.0, rayA: 0.05 };
  return { sky: PAL.skyDay, grade: 'rgba(255,255,255,0)', glow: 0.0, rayA: 0.11 };
}
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
    /* soft contact shadow: pre-drawn ellipse, no shadowBlur */
    g.fillStyle = 'rgba(10,25,35,0.16)';
    g.beginPath(); g.ellipse(2, Hh * 0.5, L * 0.46, Hh * 0.2, 0, 0, 6.283); g.fill();
    g.fillStyle = color;
  }
  g.beginPath(); /* tail */
  g.moveTo(-L * 0.42, 0); g.lineTo(-L * 0.72, -Hh * 0.75); g.lineTo(-L * 0.72, Hh * 0.75);
  g.closePath(); g.fill();
  g.beginPath(); /* body */
  g.ellipse(0, 0, L * 0.5, Hh * 0.62, 0, 0, 6.283); g.fill();
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
var UI_FONT = '"Baloo 2","Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif';
var HAND_FONT = '"Caveat","Segoe Script","Comic Sans MS",cursive';
function drawSky(g, pal, cat) {
  var gr = gradeFor(cat);
  /* watercolor sky: phase grade blended with the spot's own palette */
  var sky = g.createLinearGradient(0, 0, 0, waterTop);
  sky.addColorStop(0, mixHex(gr.sky[0], pal.sky[0], 0.35));
  sky.addColorStop(0.55, mixHex(gr.sky[1], pal.sky[1], 0.35));
  sky.addColorStop(1, mixHex(gr.sky[2], pal.sky[2], 0.30));
  g.fillStyle = sky; g.fillRect(0, 0, W, waterTop + 1);
  /* soft watercolor washes: broad translucent bands drifting slowly */
  g.save();
  for (var wsh = 0; wsh < 3; wsh++) {
    var wy = waterTop * (0.2 + wsh * 0.24) + Math.sin(world.t * 0.11 + wsh * 2.1) * 9;
    var wg = g.createLinearGradient(0, wy - 34, 0, wy + 34);
    var wc = wsh === 2 && (cat === 'dusk' || cat === 'dawn') ? '255,150,90' : '255,252,244';
    wg.addColorStop(0, 'rgba(' + wc + ',0)');
    wg.addColorStop(0.5, 'rgba(' + wc + ',' + (cat === 'night' ? 0.03 : 0.10) + ')');
    wg.addColorStop(1, 'rgba(' + wc + ',0)');
    g.fillStyle = wg;
    g.fillRect(0, wy - 34, W, 68);
  }
  g.restore();
  /* dusk/dawn warm band hugging the horizon */
  if (cat === 'dusk' || cat === 'dawn') {
    var band = g.createLinearGradient(0, waterTop - 70, 0, waterTop);
    band.addColorStop(0, 'rgba(255,150,90,0)');
    band.addColorStop(1, cat === 'dusk' ? 'rgba(255,138,80,0.55)' : 'rgba(255,170,110,0.45)');
    g.fillStyle = band; g.fillRect(0, waterTop - 70, W, 70);
  }
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
  var halo = g.createRadialGradient(sp.x, sp.y, 4, sp.x, sp.y, 74);
  if (sp.isMoon) { halo.addColorStop(0, 'rgba(244,234,208,0.95)'); halo.addColorStop(0.35, 'rgba(244,234,208,0.45)'); }
  else { halo.addColorStop(0, 'rgba(255,243,208,0.95)'); halo.addColorStop(0.4, 'rgba(255,243,208,0.38)'); }
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  g.save();
  g.fillStyle = halo; g.beginPath(); g.arc(sp.x, sp.y, 74, 0, 6.283); g.fill();
  g.fillStyle = sp.isMoon ? '#f4ead0' : '#fff3d0';
  g.beginPath(); g.arc(sp.x, sp.y, sp.isMoon ? 22 : 30, 0, 6.283); g.fill();
  if (sp.isMoon) {
    g.fillStyle = 'rgba(180,170,150,0.5)';
    g.beginPath(); g.arc(sp.x - 7, sp.y - 4, 5, 0, 6.283); g.fill();
    g.beginPath(); g.arc(sp.x + 6, sp.y + 7, 3.5, 0, 6.283); g.fill();
  }
  g.restore();
  /* clouds: layered soft blobs, tinted by phase */
  g.save();
  var cloudC = cat === 'night' ? '38,50,76' : (cat === 'dusk' ? '232,170,150' : (cat === 'dawn' ? '245,214,180' : '255,251,240'));
  for (var c = 0; c < world.clouds.length; c++) {
    var cl = world.clouds[c];
    g.fillStyle = 'rgba(' + cloudC + ',0.5)';
    g.beginPath();
    g.ellipse(cl.x, cl.y, 52 * cl.s, 15 * cl.s, 0, 0, 6.283);
    g.ellipse(cl.x - 28 * cl.s, cl.y + 5 * cl.s, 28 * cl.s, 10 * cl.s, 0, 0, 6.283);
    g.ellipse(cl.x + 28 * cl.s, cl.y + 5 * cl.s, 30 * cl.s, 11 * cl.s, 0, 0, 6.283);
    g.fill();
    g.fillStyle = 'rgba(' + cloudC + ',0.42)';
    g.beginPath();
    g.ellipse(cl.x - 6 * cl.s, cl.y - 5 * cl.s, 40 * cl.s, 11 * cl.s, 0, 0, 6.283);
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
/* ==================== underwater scene (pre-rendered statics + live life) ==== */
function seedUnder() {
  /* seaweed fronds, motes, reeds — seeded per spot so places feel like places */
  var rng = (function (s) {
    return function () { s |= 0; s = (s + 0x6D2B79F5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  })(save.spot.length * 7919 + 13);
  world.seaweed = [];
  for (var i = 0; i < 9; i++) world.seaweed.push({
    x: rng() * W, h: 40 + rng() * 70, segs: 4, ph: rng() * 6.28, w: 5 + rng() * 4,
    hue: rng() < 0.75 ? 'moss' : 'teal'
  });
  world.motes = [];
  for (var j = 0; j < 42; j++) world.motes.push({
    x: rng() * W, y: waterTop + rng() * (H - waterTop),
    vx: (rng() - 0.5) * 8, vy: -3 - rng() * 6, r: 0.8 + rng() * 1.8, ph: rng() * 6.28
  });
  world.bubbles = [];
  world.reeds = [];
  var reedX = [14, 34, W - 40, W - 18];
  for (var k = 0; k < reedX.length; k++) {
    var n = 3 + Math.floor(rng() * 3);
    for (var q = 0; q < n; q++) world.reeds.push({
      x: reedX[k] + (rng() - 0.5) * 22, h: 46 + rng() * 42, ph: rng() * 6.28, lean: (rng() - 0.5) * 14
    });
  }
  world.glints = [];
  underKey = '';
}
function paintUnderStatics() {
  /* rocks, lakebed, landmarks — painted once per spot/size into underCv */
  var g = underCtx, uwH = underCv.height;
  var key = save.spot + '|' + W + 'x' + H;
  if (underKey === key) return;
  underKey = key;
  g.clearRect(0, 0, W, uwH);
  var rng = (function (s) {
    return function () { s |= 0; s = (s + 0x6D2B79F5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  })(save.spot.length * 331 + 7);
  /* lakebed */
  var bed = g.createLinearGradient(0, uwH * 0.72, 0, uwH);
  bed.addColorStop(0, shadeH(PAL.uwMid, -34)); bed.addColorStop(1, shadeH(PAL.uwDeep, -22));
  g.fillStyle = bed;
  g.beginPath();
  g.moveTo(0, uwH);
  for (var x = 0; x <= W; x += 24) g.lineTo(x, uwH * 0.86 + Math.sin(x * 0.03 + rng() * 6) * 8);
  g.lineTo(W, uwH); g.closePath(); g.fill();
  /* scattered rocks, hue-shifted shading */
  for (var r = 0; r < 7; r++) {
    var rx = rng() * W, ry = uwH * (0.8 + rng() * 0.16), rr = 10 + rng() * 22;
    g.fillStyle = shadeH(PAL.uwMid, -30 - rng() * 14);
    g.beginPath(); g.ellipse(rx, ry, rr, rr * 0.62, 0, 0, 6.283); g.fill();
    g.fillStyle = rgba(PAL.cream, 0.10);
    g.beginPath(); g.ellipse(rx - rr * 0.25, ry - rr * 0.22, rr * 0.5, rr * 0.24, -0.3, 0, 6.283); g.fill();
  }
  /* ---- landmarks: one per spot, fixed like Dave the Diver's ship ---- */
  if (save.spot === 'sunny-cove') {
    /* half-sunken rowboat, tilted, port side */
    var bx = W * 0.78, by = uwH * 0.78;
    g.save(); g.translate(bx, by); g.rotate(0.22);
    g.fillStyle = shadeH(PAL.wood, -26);
    g.beginPath(); g.ellipse(0, 0, 64, 20, 0, 0.15 * Math.PI, 0.85 * Math.PI); g.fill();
    g.beginPath(); g.ellipse(0, 0, 64, 20, 0, 1.15 * Math.PI, 1.85 * Math.PI); g.fill();
    g.fillStyle = shadeH(PAL.wood, -8);
    g.beginPath(); g.ellipse(0, -3, 56, 14, 0, 0, 6.283); g.fill();
    g.fillStyle = shadeH(PAL.woodDeep, -18);
    for (var b = -1; b <= 1; b++) g.fillRect(b * 34 - 4, -12, 8, 22);
    g.strokeStyle = rgba(PAL.ink, 0.35); g.lineWidth = 2;
    g.beginPath(); g.ellipse(0, 0, 64, 20, 0, 0, 6.283); g.stroke();
    g.restore();
  } else if (save.spot === 'misty-marsh') {
    /* the heron's rock, starboard */
    var hx = W * 0.82, hy = uwH * 0.8;
    g.fillStyle = shadeH('#7e8f86', -26);
    g.beginPath(); g.ellipse(hx, hy, 52, 34, 0.1, 0, 6.283); g.fill();
    g.fillStyle = shadeH('#7e8f86', -8);
    g.beginPath(); g.ellipse(hx - 12, hy - 12, 30, 18, -0.2, 0, 6.283); g.fill();
    g.fillStyle = rgba(PAL.cream, 0.08);
    g.beginPath(); g.ellipse(hx - 16, hy - 16, 16, 8, -0.3, 0, 6.283); g.fill();
  } else {
    /* moonlit pier: lantern posts standing in the shallows */
    for (var p = 0; p < 2; p++) {
      var px = W * (0.2 + p * 0.6), py = uwH * 0.9;
      g.fillStyle = shadeH(PAL.woodDeep, -20);
      g.fillRect(px - 5, uwH * 0.3, 10, py - uwH * 0.3);
      g.fillStyle = '#3a2c1c';
      g.fillRect(px - 11, uwH * 0.3 - 26, 22, 24);
      g.fillStyle = 'rgba(255,202,122,0.9)';
      g.fillRect(px - 7, uwH * 0.3 - 22, 14, 16);
      g.fillStyle = shadeH(PAL.woodDeep, -30);
      g.beginPath(); g.moveTo(px - 13, uwH * 0.3 - 26); g.lineTo(px + 13, uwH * 0.3 - 26); g.lineTo(px, uwH * 0.3 - 38); g.closePath(); g.fill();
    }
  }
}
function drawUnder(g, cat) {
  var uwH = H - waterTop;
  paintUnderStatics();
  /* depth gradient: light teal at surface -> deep blue-green */
  var dg = g.createLinearGradient(0, waterTop, 0, H);
  dg.addColorStop(0, rgba(PAL.uwTop, 0.9)); dg.addColorStop(0.55, rgba(PAL.uwMid, 0.94)); dg.addColorStop(1, PAL.uwDeep);
  g.fillStyle = dg; g.fillRect(0, waterTop, W, uwH);
  /* statics */
  g.drawImage(underCv, 0, waterTop);
  /* caustic dapples scrolling on the lakebed */
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (var c = 0; c < 2; c++) {
    var cy = H - 26 - c * 22;
    for (var x = -20; x < W + 20; x += 46) {
      var px = x + Math.sin(world.t * (0.7 + c * 0.3) + x * 0.05 + c * 2) * 14;
      var a = (cat === 'night' ? 0.028 : 0.06) * (0.6 + 0.4 * Math.sin(world.t * 1.1 + x * 0.11 + c));
      g.fillStyle = 'rgba(190,235,225,' + Math.max(0, a).toFixed(3) + ')';
      g.beginPath(); g.ellipse(px, cy + Math.sin(x * 0.04 + c) * 5, 22, 5, 0.1, 0, 6.283); g.fill();
    }
  }
  g.restore();
  /* god rays: diagonal soft shafts, drifting; moon-shafts at night */
  var gr = gradeFor(cat);
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (var r2 = 0; r2 < 4; r2++) {
    var rx = W * (0.15 + r2 * 0.24) + Math.sin(world.t * 0.18 + r2 * 1.7) * 26;
    var rw = 34 + r2 * 10;
    var ray = g.createLinearGradient(rx - rw, waterTop, rx + rw, waterTop + 90);
    var rc = cat === 'night' ? '150,180,220' : '200,240,230';
    ray.addColorStop(0, 'rgba(' + rc + ',' + gr.rayA.toFixed(3) + ')');
    ray.addColorStop(1, 'rgba(' + rc + ',0)');
    g.fillStyle = ray;
    g.save();
    g.translate(rx, waterTop); g.rotate(0.28); g.translate(-rx, -waterTop);
    g.fillRect(rx - rw, waterTop, rw * 2, uwH * 0.9);
    g.restore();
  }
  g.restore();
  /* seaweed: layered sine sway, tips lag the base */
  g.save();
  g.lineCap = 'round';
  for (var s = 0; s < world.seaweed.length; s++) {
    var sw = world.seaweed[s];
    var baseX = sw.x, baseY = H - 14;
    g.strokeStyle = sw.hue === 'moss' ? shadeH(PAL.moss, -18) : shadeH(PAL.uwTop, -30);
    g.lineWidth = sw.w;
    g.beginPath();
    var px2 = baseX, py2 = baseY;
    g.moveTo(px2, py2);
    for (var sg = 1; sg <= sw.segs; sg++) {
      var k = sg / sw.segs;
      var sway = Math.sin(world.t * 1.1 + sw.ph + k * 1.8) * 12 * k;
      var nx = baseX + sway, ny = baseY - sw.h * k;
      g.quadraticCurveTo(px2 + sway * 0.4, (py2 + ny) / 2, nx, ny);
      px2 = nx; py2 = ny;
    }
    g.stroke();
    /* tip bud */
    g.fillStyle = shadeH(PAL.moss, 6);
    g.beginPath(); g.arc(px2, py2, sw.w * 0.42, 0, 6.283); g.fill();
  }
  g.restore();
  /* plankton motes + rising bubbles */
  g.save();
  var moteC = cat === 'night' ? '200,215,235' : '235,250,245';
  for (var m = 0; m < world.motes.length; m++) {
    var mo = world.motes[m];
    var ma = 0.10 + 0.10 * Math.abs(Math.sin(world.t * 0.9 + mo.ph));
    g.fillStyle = 'rgba(' + moteC + ',' + ma.toFixed(2) + ')';
    g.beginPath(); g.arc(mo.x, mo.y, mo.r, 0, 6.283); g.fill();
  }
  for (var bb = 0; bb < world.bubbles.length; bb++) {
    var bu = world.bubbles[bb];
    g.strokeStyle = 'rgba(220,245,250,' + (0.35 * bu.life / bu.max).toFixed(2) + ')';
    g.lineWidth = 1.2;
    g.beginPath(); g.arc(bu.x, bu.y, bu.r, 0, 6.283); g.stroke();
  }
  g.restore();
}
/* ---- distorted living reflection ---- */
function drawReflection(g, cat) {
  var rw = reflCv.width, rh = reflCv.height;
  var rc = reflCtx;
  rc.clearRect(0, 0, rw, rh);
  rc.save(); rc.scale(rw / W, rh / waterTop);
  /* simplified sky: gradient + sun/moon + dusk band + cloud blobs */
  var gr = gradeFor(cat);
  var sky = rc.createLinearGradient(0, 0, 0, waterTop);
  sky.addColorStop(0, mixHex(gr.sky[0], '#8fa8bf', 0.2));
  sky.addColorStop(0.6, mixHex(gr.sky[1], '#8fa8bf', 0.2));
  sky.addColorStop(1, mixHex(gr.sky[2], '#8fa8bf', 0.2));
  rc.fillStyle = sky; rc.fillRect(0, 0, W, waterTop);
  if (cat === 'dusk' || cat === 'dawn') {
    rc.fillStyle = cat === 'dusk' ? 'rgba(255,138,80,0.5)' : 'rgba(255,170,110,0.4)';
    rc.fillRect(0, waterTop - 60, W, 60);
  }
  var sp = sunPos();
  var halo = rc.createRadialGradient(sp.x, sp.y, 2, sp.x, sp.y, 60);
  halo.addColorStop(0, sp.isMoon ? 'rgba(244,234,208,0.9)' : 'rgba(255,243,208,0.9)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  rc.fillStyle = halo; rc.beginPath(); rc.arc(sp.x, sp.y, 60, 0, 6.283); rc.fill();
  rc.fillStyle = 'rgba(255,252,244,0.5)';
  for (var c = 0; c < world.clouds.length; c++) {
    var cl = world.clouds[c];
    rc.beginPath(); rc.ellipse(cl.x, cl.y, 52 * cl.s, 15 * cl.s, 0, 0, 6.283); rc.fill();
  }
  rc.restore();
  /* draw back distorted: per-column sine offset, amplitude grows with distance */
  var chop = 1 + (world.weather === 'rain' ? effRain() * 1.6 : 0);
  g.save();
  g.globalAlpha = cat === 'night' ? 0.30 : 0.38;
  var colW = 4, dw = W, dh = rh * (W / rw) * 0.85;
  for (var x = 0; x < dw; x += colW) {
    var off = (Math.sin(world.t * 1.4 + x * 0.025) * 3 + Math.sin(world.t * 2.3 + x * 0.06) * 1.6) * chop;
    var sx = x * (rw / dw);
    g.drawImage(reflCv, sx, 0, colW * (rw / dw), rh, x + off, waterTop, colW, dh);
  }
  g.restore();
}
function effRain() {
  /* 0..1 rain intensity honoring the 8s weather roll */
  if (world.weather === 'rain') return world.wxBlend;
  if (world.wxFrom === 'rain') return 1 - world.wxBlend;
  return 0;
}
function effFog() {
  if (world.weather === 'fog') return world.wxBlend;
  if (world.wxFrom === 'fog') return 1 - world.wxBlend;
  return 0;
}
function drawWater(g, pal, cat) {
  var gr = gradeFor(cat);
  /* base water */
  var wg = g.createLinearGradient(0, waterTop, 0, H);
  wg.addColorStop(0, mixHex(pal.water[0], PAL.uwTop, 0.4));
  wg.addColorStop(0.5, pal.water[1]);
  wg.addColorStop(1, mixHex(pal.water[2], PAL.uwDeep, 0.35));
  g.fillStyle = wg; g.fillRect(0, waterTop, W, H - waterTop);
  /* the living world beneath */
  drawUnder(g, cat);
  /* living reflection over the top */
  drawReflection(g, cat);
  /* phase grade over water */
  if (gr.grade !== 'rgba(255,255,255,0)') { g.fillStyle = gr.grade; g.fillRect(0, waterTop, W, H - waterTop); }
  /* shoreline foam band: oscillating along the waterline + around dock posts */
  g.save();
  var foamA = 0.35 + 0.2 * Math.sin(world.t * 1.6);
  g.fillStyle = 'rgba(246,239,221,' + foamA.toFixed(2) + ')';
  g.beginPath();
  for (var x = -10; x <= W + 10; x += 12) {
    var fy = waterTop + 3 + Math.sin(x * 0.05 + world.t * 1.6) * 3;
    if (x === -10) g.moveTo(x, fy); else g.lineTo(x, fy);
  }
  g.lineTo(W + 10, waterTop + 9); g.lineTo(-10, waterTop + 9); g.closePath(); g.fill();
  g.restore();
  /* sparkle glints: denser near the sun/moon reflection column, tinted by phase */
  g.save();
  g.globalCompositeOperation = 'lighter';
  var sp = sunPos();
  var gc = cat === 'night' ? '220,228,245' : '255,244,214';
  for (var gi = 0; gi < world.glints.length; gi++) {
    var gl = world.glints[gi];
    var ga = Math.max(0, Math.sin(gl.life * Math.PI)) * (cat === 'night' ? 0.5 : 0.75);
    g.strokeStyle = 'rgba(' + gc + ',' + ga.toFixed(2) + ')';
    g.lineWidth = 1.6;
    var gs = 3 + gl.r * 3;
    g.beginPath();
    g.moveTo(gl.x - gs, gl.y); g.lineTo(gl.x + gs, gl.y);
    g.moveTo(gl.x, gl.y - gs * 0.6); g.lineTo(gl.x, gl.y + gs * 0.6);
    g.stroke();
  }
  g.restore();
  /* fog: layered drifting bands, rolls in with weather */
  var fogBase = effFog() * 0.5 + (cat === 'dawn' ? 0.14 : 0) + (save.spot === 'misty-marsh' ? 0.10 : 0);
  var fogA = Math.min(0.55, fogBase);
  if (fogA > 0.01) {
    g.save();
    for (var f2 = 0; f2 < 2; f2++) {
      var drift = Math.sin(world.t * (0.2 + f2 * 0.13) + f2 * 2) * 16;
      g.fillStyle = 'rgba(232,226,213,' + (fogA * (0.6 - f2 * 0.2)).toFixed(2) + ')';
      var fyy = waterTop - 60 - f2 * 44 + drift;
      g.fillRect(-20, fyy, W + 40, 46);
    }
    g.restore();
  }
  /* fireflies: denser near reeds at dusk/night */
  if (cat === 'night' || cat === 'dusk') {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (var f = 0; f < world.fireflies.length; f++) {
      var fl = world.fireflies[f];
      var fx = fl.x + Math.sin(world.t * fl.sp + fl.ph) * 22;
      var fy2 = fl.y + Math.cos(world.t * fl.sp * 0.7 + fl.ph) * 14;
      var fa = 0.25 + 0.6 * Math.abs(Math.sin(world.t * 1.6 + fl.ph * 3));
      g.fillStyle = 'rgba(255,236,160,' + fa.toFixed(2) + ')';
      g.beginPath(); g.arc(fx, fy2, 2.2, 0, 6.283); g.fill();
    }
    g.restore();
  }
  /* rain: velocity-aligned streaks, intensity follows the roll */
  var rainI = effRain();
  if (rainI > 0.02) {
    g.save();
    g.strokeStyle = 'rgba(220,235,245,' + (0.34 * rainI).toFixed(2) + ')';
    g.lineWidth = 1;
    g.beginPath();
    var n = Math.floor(world.rain.length * rainI);
    for (var r = 0; r < n; r++) {
      var dr = world.rain[r];
      g.moveTo(dr.x, dr.y); g.lineTo(dr.x - 4, dr.y + 16);
    }
    g.stroke();
    g.restore();
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
    /* plank grain */
    g.strokeStyle = 'rgba(60,40,20,0.28)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(px + 3, y + 5); g.lineTo(px + 17, y + 6); g.stroke();
    g.beginPath(); g.moveTo(px + 4, y + 11); g.lineTo(px + 16, y + 10); g.stroke();
    g.strokeStyle = 'rgba(60,40,20,0.4)';
    g.strokeRect(px + 0.5, y + 0.5, 19, 15);
  }
  g.fillStyle = '#7a5c3c';
  g.fillRect(0, y + 16, 9 * 22, 6);
  /* coiled rope on the dock */
  g.strokeStyle = '#c9a86a'; g.lineWidth = 3;
  g.beginPath(); g.arc(168, y + 8, 8, 0, 6.283); g.stroke();
  g.beginPath(); g.arc(168, y + 8, 4.5, 0, 6.283); g.stroke();
  g.restore();
}
/* ---------- the angler (you) ---------- */
function anglerX() { return heronPerchX() - 104; }
function drawAngler(g) {
  var x = anglerX(), y = dockY();
  var breathe = Math.sin(world.t * 1.4) * 1.6;
  var surge = phase === 'reeling' ? Math.sin(world.t * 22) * 1.2 : 0;
  g.save();
  g.translate(x, y + breathe * 0.4);
  if (phase === 'reveal') g.rotate(-0.09); /* leaning back with the catch held high */
  /* legs dangling over the dock edge */
  g.strokeStyle = '#4a5a6a'; g.lineWidth = 9; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-8, 2); g.lineTo(-10, 26); g.stroke();
  g.beginPath(); g.moveTo(8, 2); g.lineTo(10, 26 + Math.sin(world.t * 1.1) * 2); g.stroke();
  /* body: warm rust shirt */
  g.fillStyle = '#c96f4a';
  g.beginPath();
  g.moveTo(-16, 4); g.quadraticCurveTo(-18, -26, -8, -30);
  g.lineTo(8, -30); g.quadraticCurveTo(18, -26, 16, 4); g.closePath(); g.fill();
  g.fillStyle = shadeH('#c96f4a', -24);
  g.beginPath(); g.ellipse(9, -14, 6, 12, 0.2, 0, 6.283); g.fill(); /* shaded side */
  /* arms reaching to the rod */
  g.strokeStyle = '#c96f4a'; g.lineWidth = 8;
  g.beginPath(); g.moveTo(6, -24); g.quadraticCurveTo(30, -26 + surge, 52, -34); g.stroke();
  g.fillStyle = '#e8b98a';
  g.beginPath(); g.arc(53, -34, 5, 0, 6.283); g.fill(); /* hand */
  /* head + straw hat */
  g.fillStyle = '#e8b98a';
  g.beginPath(); g.arc(0, -40, 11, 0, 6.283); g.fill();
  g.fillStyle = '#e8c56a';
  g.beginPath(); g.ellipse(0, -46, 20, 6, 0, 0, 6.283); g.fill(); /* brim */
  g.beginPath(); g.ellipse(0, -50, 11, 8, 0, Math.PI, 0); g.fill(); /* crown */
  g.strokeStyle = '#a8432f'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(-11, -48); g.quadraticCurveTo(0, -44, 11, -48); g.stroke(); /* hat band */
  g.restore();
}
function drawAnglerReflection(g) {
  var x = anglerX(), y = dockY();
  g.save();
  g.globalAlpha = 0.20;
  g.translate(x + Math.sin(world.t * 1.2) * 3, waterTop + 4);
  g.scale(1, -0.55);
  g.translate(-x, -y);
  drawAngler(g);
  g.restore();
}
/* ---------- lanterns + warm light ---------- */
function layoutLanterns() {
  /* a lantern at the dock's end keeps the angler company */
  world.lanterns = [{ x: 184, y: dockY(), h: 58, dock: true }];
  if (save.spot === 'moonlit-pier') {
    world.lanterns.push({ x: W * 0.2, y: waterTop, h: 64, dock: false });
    world.lanterns.push({ x: W * 0.8, y: waterTop, h: 64, dock: false });
  }
}
function drawLanterns(g, cat) {
  for (var i = 0; i < world.lanterns.length; i++) {
    var L = world.lanterns[i];
    g.save();
    /* post */
    g.fillStyle = shadeH(PAL.woodDeep, -12);
    g.fillRect(L.x - 3, L.y - L.h, 6, L.h);
    /* hanging lantern */
    var lx = L.x, ly = L.y - L.h + 8;
    g.strokeStyle = PAL.ink; g.lineWidth = 2;
    g.beginPath(); g.moveTo(L.x, L.y - L.h); g.lineTo(lx, ly - 10); g.stroke();
    g.fillStyle = '#3a2c1c';
    g.beginPath(); g.moveTo(lx - 10, ly - 10); g.lineTo(lx + 10, ly - 10); g.lineTo(lx, ly - 20); g.closePath(); g.fill();
    var lit = (cat === 'night' || cat === 'dusk');
    g.fillStyle = lit ? 'rgba(255,205,120,0.95)' : 'rgba(240,230,210,0.85)';
    g.fillRect(lx - 7, ly - 10, 14, 18);
    g.fillStyle = '#3a2c1c'; g.fillRect(lx - 8, ly + 8, 16, 3);
    if (lit) {
      var halo = g.createRadialGradient(lx, ly, 2, lx, ly, 46);
      halo.addColorStop(0, 'rgba(255,205,120,0.5)'); halo.addColorStop(1, 'rgba(255,205,120,0)');
      g.fillStyle = halo; g.beginPath(); g.arc(lx, ly, 46, 0, 6.283); g.fill();
    }
    g.restore();
  }
}
function drawLight(g, cat) {
  /* warm light canvas: lantern pools + moon shimmer, additive over the grade */
  var gr = gradeFor(cat);
  if (gr.glow < 0.05) return;
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (var i = 0; i < world.lanterns.length; i++) {
    var L = world.lanterns[i];
    var lx = L.x, ly = L.y - L.h + 8;
    var flick = 0.9 + 0.1 * Math.sin(world.t * 7 + i * 2.4);
    var halo = g.createRadialGradient(lx, ly, 4, lx, ly, 90 * flick);
    halo.addColorStop(0, 'rgba(255,190,110,' + (0.34 * gr.glow * flick).toFixed(2) + ')');
    halo.addColorStop(1, 'rgba(255,190,110,0)');
    g.fillStyle = halo; g.beginPath(); g.arc(lx, ly, 90 * flick, 0, 6.283); g.fill();
    /* pool of light on the planks / water */
    var pool = g.createRadialGradient(lx, L.y + 8, 4, lx, L.y + 8, 60);
    pool.addColorStop(0, 'rgba(255,190,110,' + (0.22 * gr.glow).toFixed(2) + ')');
    pool.addColorStop(1, 'rgba(255,190,110,0)');
    g.fillStyle = pool; g.beginPath(); g.ellipse(lx, L.y + 8, 60, 22, 0, 0, 6.283); g.fill();
  }
  /* moon shimmer column on the water */
  var sp = sunPos();
  if (sp.isMoon) {
    var col = g.createLinearGradient(0, waterTop, 0, H);
    col.addColorStop(0, 'rgba(220,228,245,' + (0.16 * gr.glow).toFixed(2) + ')');
    col.addColorStop(1, 'rgba(220,228,245,0)');
    g.fillStyle = col;
    var cw = 54 + Math.sin(world.t * 1.3) * 8;
    g.fillRect(sp.x - cw / 2, waterTop, cw, H - waterTop);
  }
  g.restore();
  /* moths orbiting the lanterns */
  if (cat === 'night') {
    g.save();
    g.fillStyle = 'rgba(240,235,220,0.8)';
    for (var m = 0; m < world.moths.length; m++) {
      var mo = world.moths[m], L2 = world.lanterns[mo.l % world.lanterns.length];
      var mx = L2.x + Math.cos(world.t * mo.sp + mo.ph) * mo.r;
      var my = L2.y - L2.h + 8 + Math.sin(world.t * mo.sp * 1.3 + mo.ph) * mo.r * 0.7;
      g.beginPath(); g.ellipse(mx, my, 2.6, 1.4, Math.sin(world.t * 30 + mo.ph), 0, 6.283); g.fill();
    }
    g.restore();
  }
}
/* ---------- reeds + dragonflies ---------- */
function drawReeds(g, cat) {
  g.save();
  g.lineCap = 'round';
  var gust = 0.6 + 0.4 * Math.sin(world.t * 0.5) + 0.2 * Math.sin(world.t * 1.7);
  for (var i = 0; i < world.reeds.length; i++) {
    var r = world.reeds[i];
    var sway = Math.sin(world.t * 1.2 + r.ph) * 7 * gust + r.lean * gust;
    g.strokeStyle = shadeH(PAL.reed, -14);
    g.lineWidth = 3.4;
    g.beginPath();
    g.moveTo(r.x, waterTop + 6);
    g.quadraticCurveTo(r.x + sway * 0.4, waterTop - r.h * 0.6, r.x + sway, waterTop - r.h);
    g.stroke();
    if (i % 3 === 0) {
      /* cattail head */
      g.fillStyle = shadeH('#7a5a3a', -10);
      g.beginPath(); g.ellipse(r.x + sway, waterTop - r.h, 4, 9, sway * 0.02, 0, 6.283); g.fill();
    } else {
      g.fillStyle = shadeH(PAL.reed, 8);
      g.beginPath(); g.ellipse(r.x + sway, waterTop - r.h, 3, 7, sway * 0.02, 0, 6.283); g.fill();
    }
  }
  g.restore();
}
function drawDragonflies(g) {
  g.save();
  for (var i = 0; i < world.dflies.length; i++) {
    var d = world.dflies[i];
    var flap = Math.abs(Math.sin(world.t * 40 + d.ph));
    g.fillStyle = 'rgba(90,140,160,0.9)';
    g.beginPath(); g.ellipse(d.x, d.y, 7, 1.8, d.a, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(220,240,250,' + (0.35 + flap * 0.4).toFixed(2) + ')';
    g.beginPath(); g.ellipse(d.x - 3, d.y - 3 - flap * 2, 5, 2, -0.5, 0, 6.283); g.fill();
    g.beginPath(); g.ellipse(d.x + 3, d.y - 3 - flap * 2, 5, 2, 0.5, 0, 6.283); g.fill();
  }
  g.restore();
}
/* ---------- otters (sunny cove) ---------- */
function drawOtters(g) {
  g.save();
  for (var i = 0; i < world.otters.length; i++) {
    var o = world.otters[i];
    var bob = Math.sin(world.t * 6 + o.ph) * 2;
    g.fillStyle = shadeH('#7a5c42', -16);
    g.beginPath(); g.ellipse(o.x, o.y + bob, 20, 8, o.dir * 0.1, 0, 6.283); g.fill();
    g.beginPath(); g.arc(o.x + o.dir * 20, o.y - 4 + bob, 7, 0, 6.283); g.fill(); /* head */
    g.fillStyle = shadeH('#7a5c42', -30);
    g.beginPath(); g.ellipse(o.x - o.dir * 18, o.y + 2 + bob, 12, 4.5, o.dir * 0.5, 0, 6.283); g.fill(); /* tail */
    g.fillStyle = '#2b2119';
    g.beginPath(); g.arc(o.x + o.dir * 22, o.y - 5 + bob, 1.6, 0, 6.283); g.fill(); /* eye */
  }
  g.restore();
}
/* ---------- the harbor cat (pettable) ---------- */
function drawCat(g) {
  var c = world.cat;
  var x = c.x, y = dockY() - 4;
  var happy = c.petT > 0;
  g.save();
  g.translate(x, y);
  if (c.mode === 'walk') g.translate(0, Math.abs(Math.sin(world.t * 10)) * -2);
  var fur = '#d88f3e', furD = shadeH('#d88f3e', -22);
  if (c.mode === 'sit' || c.mode === 'bat') {
    /* sitting body */
    g.fillStyle = furD;
    g.beginPath(); g.ellipse(0, -12, 13, 17, 0, 0, 6.283); g.fill();
    g.fillStyle = fur;
    g.beginPath(); g.ellipse(-2, -12, 10, 15, 0, 0, 6.283); g.fill();
    /* stripes */
    g.strokeStyle = furD; g.lineWidth = 2;
    for (var s = -1; s <= 1; s++) {
      g.beginPath(); g.moveTo(-8 + s * 5, -22); g.lineTo(-6 + s * 5, -16); g.stroke();
    }
    /* head */
    g.fillStyle = fur;
    g.beginPath(); g.arc(2, -32, 10, 0, 6.283); g.fill();
    /* ears */
    g.beginPath(); g.moveTo(-5, -38); g.lineTo(-7, -48); g.lineTo(0, -41); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(9, -38); g.lineTo(11, -48); g.lineTo(4, -41); g.closePath(); g.fill();
    /* tail: curling sway */
    var wag = Math.sin(world.t * (happy ? 6 : 2.2)) * (happy ? 8 : 4);
    g.strokeStyle = furD; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-10, -4); g.quadraticCurveTo(-24, -2 + wag, -20, -18 + wag); g.stroke();
    g.strokeStyle = fur; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-10, -4); g.quadraticCurveTo(-24, -2 + wag, -20, -18 + wag); g.stroke();
    /* face */
    if (happy) {
      g.strokeStyle = '#2b2119'; g.lineWidth = 1.8;
      g.beginPath(); g.arc(-1, -32, 2.6, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      g.beginPath(); g.arc(5, -32, 2.6, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    } else {
      var blink = (Math.sin(world.t * 0.7 + 1) > 0.96);
      g.fillStyle = '#2b2119';
      if (blink) {
        g.fillRect(-3, -33, 4, 1.4); g.fillRect(3, -33, 4, 1.4);
      } else {
        g.beginPath(); g.arc(-1, -32, 2.2, 0, 6.283); g.fill();
        g.beginPath(); g.arc(5, -32, 2.2, 0, 6.283); g.fill();
      }
    }
    g.fillStyle = '#a8432f';
    g.beginPath(); g.moveTo(0, -28); g.lineTo(4, -28); g.lineTo(2, -26); g.closePath(); g.fill(); /* nose */
    if (c.mode === 'bat') {
      /* paw extended toward the water */
      var reach = Math.sin(Math.min(1, c.batT * 3) * Math.PI) * 16;
      g.strokeStyle = fur; g.lineWidth = 6;
      g.beginPath(); g.moveTo(6 * c.dir, -16); g.lineTo(6 * c.dir + c.dir * (14 + reach), -6); g.stroke();
      g.fillStyle = fur;
      g.beginPath(); g.arc(6 * c.dir + c.dir * (14 + reach), -6, 4.5, 0, 6.283); g.fill();
    }
  } else {
    /* walking: low stretched body */
    g.fillStyle = furD;
    g.beginPath(); g.ellipse(0, -10, 16, 8, 0, 0, 6.283); g.fill();
    g.fillStyle = fur;
    g.beginPath(); g.arc(c.dir * 15, -16, 8, 0, 6.283); g.fill();
    g.beginPath(); g.moveTo(c.dir * 15 - 6, -21); g.lineTo(c.dir * 15 - 7, -29); g.lineTo(c.dir * 15 - 1, -23); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(c.dir * 15 + 6, -21); g.lineTo(c.dir * 15 + 7, -29); g.lineTo(c.dir * 15 + 1, -23); g.closePath(); g.fill();
    g.strokeStyle = furD; g.lineWidth = 4;
    var w2 = Math.sin(world.t * 10) * 5;
    g.beginPath(); g.moveTo(-c.dir * 14, -8); g.quadraticCurveTo(-c.dir * 24, -14, -c.dir * 22, -26 + w2); g.stroke();
  }
  g.restore();
  /* petted hearts */
  if (happy) {
    g.save();
    g.font = '16px ' + UI_FONT; g.textAlign = 'center';
    g.fillStyle = 'rgba(200,80,80,' + Math.min(1, c.petT).toFixed(2) + ')';
    g.fillText('♥', x + Math.sin(world.t * 5) * 6, y - 52 - (1.5 - c.petT) * 18);
    g.restore();
  }
}
function updateCat(dt) {
  var c = world.cat;
  c.t += dt;
  if (c.petT > 0) c.petT -= dt;
  if (c.mode === 'sit') {
    if (c.t > c.nextMove) {
      /* maybe go bat at the bobber, else wander */
      if ((phase === 'waiting' || phase === 'nibbling') && Math.random() < 0.45 && Math.abs(world.bobX - c.x) < W * 0.7) {
        c.mode = 'walk'; c.batX = Math.max(30, Math.min(190, world.bobX)); c.dir = c.batX > c.x ? 1 : -1;
      } else {
        c.mode = 'walk'; c.batX = 30 + Math.random() * 160; c.dir = c.batX > c.x ? 1 : -1;
      }
      c.t = 0;
    }
  } else if (c.mode === 'walk') {
    c.x += c.dir * 34 * dt;
    if ((c.dir > 0 && c.x >= c.batX) || (c.dir < 0 && c.x <= c.batX)) {
      c.x = c.batX;
      if ((phase === 'waiting' || phase === 'nibbling') && Math.abs(c.x - world.bobX) < 90 && Math.random() < 0.8) {
        c.mode = 'bat'; c.t = 0; c.batT = 0;
      } else { c.mode = 'sit'; c.t = 0; c.nextMove = 5 + Math.random() * 9; }
    }
  } else if (c.mode === 'bat') {
    c.batT += dt;
    if (c.batT > 0.32 && c.batT - dt <= 0.32) {
      /* the swipe lands: ripple + tiny splash where the paw hits */
      var sx = c.x + c.dir * 26;
      world.ripples.push({ x: sx, y: waterTop + 6, r: 6, life: 1.0, max: 1.0 });
      for (var i = 0; i < 4; i++) world.parts.push({
        k: 'drop', x: sx + (Math.random() - 0.5) * 10, y: waterTop + 4,
        vx: (Math.random() - 0.5) * 90, vy: -60 - Math.random() * 80,
        r: 1 + Math.random() * 1.6, life: 0.6, max: 0.6
      });
    }
    if (c.batT > 1.4) { c.mode = 'sit'; c.t = 0; c.nextMove = 6 + Math.random() * 10; }
  }
  c.x = Math.max(24, Math.min(196, c.x));
}
function petCat() {
  var c = world.cat;
  c.petT = 1.5;
  AU.mrrp();
  world.parts.push({ k: 'heart', x: c.x, y: dockY() - 50, vy: -22, life: 1.4, max: 1.4, txt: '♥' });
}
/* ---------- ambient life: motes, bubbles, glints, otters, dragonflies ----- */
function updateAmbientLife(dt) {
  var i, cat = timeCat();
  for (i = 0; i < world.motes.length; i++) {
    var mo = world.motes[i];
    mo.x += (mo.vx + Math.sin(world.t * 0.6 + mo.ph) * 4) * dt;
    mo.y += mo.vy * dt;
    if (mo.y < waterTop + 4) { mo.y = H - 4; mo.x = Math.random() * W; }
    if (mo.x < -6) mo.x = W + 6; if (mo.x > W + 6) mo.x = -6;
  }
  /* bubbles rise from lakebed vents */
  if (Math.random() < dt * 2.2 && world.bubbles.length < 26) {
    world.bubbles.push({
      x: Math.random() * W, y: H - 8, vy: -(24 + Math.random() * 30),
      r: 1.5 + Math.random() * 2.6, life: 4, max: 4
    });
  }
  for (i = world.bubbles.length - 1; i >= 0; i--) {
    var bu = world.bubbles[i];
    bu.y += bu.vy * dt; bu.x += Math.sin(world.t * 3 + bu.r * 9) * 12 * dt; bu.life -= dt;
    if (bu.y < waterTop + 6 || bu.life <= 0) world.bubbles.splice(i, 1);
  }
  /* sparkle glints cluster near the sun/moon column */
  if (Math.random() < dt * 6 && world.glints.length < 22) {
    var sp = sunPos();
    world.glints.push({
      x: sp.x + (Math.random() - 0.5) * 150, y: waterTop + 12 + Math.random() * (H - waterTop - 24),
      life: 0, max: 0.9 + Math.random() * 0.8, r: 0.6 + Math.random() * 0.9
    });
  }
  for (i = world.glints.length - 1; i >= 0; i--) {
    var gl = world.glints[i];
    gl.life += dt / gl.max;
    if (gl.life >= 1) world.glints.splice(i, 1);
  }
  /* otters dart the sunny shallows */
  if (save.spot === 'sunny-cove' && cat !== 'night' && Math.random() < dt * 0.05 && world.otters.length < 2) {
    var dir = Math.random() < 0.5 ? 1 : -1;
    world.otters.push({ x: dir > 0 ? -40 : W + 40, y: waterTop + 44 + Math.random() * 30, vx: dir * (70 + Math.random() * 40), dir: dir, ph: Math.random() * 6.28, wakeT: 0 });
  }
  for (i = world.otters.length - 1; i >= 0; i--) {
    var o = world.otters[i];
    o.x += o.vx * dt; o.wakeT -= dt;
    if (o.wakeT <= 0) {
      o.wakeT = 0.28;
      world.ripples.push({ x: o.x - o.dir * 18, y: waterTop + 6, r: 5, life: 0.9, max: 0.9 });
    }
    if ((o.dir > 0 && o.x > W + 60) || (o.dir < 0 && o.x < -60)) {
      world.ripples.push({ x: Math.max(10, Math.min(W - 10, o.x)), y: waterTop + 6, r: 8, life: 1.1, max: 1.1 });
      world.otters.splice(i, 1);
    }
  }
  /* dragonflies by day */
  var wantFlies = (cat === 'day' || cat === 'dawn') ? 5 : 0;
  while (world.dflies.length < wantFlies) world.dflies.push({
    x: Math.random() * W, y: waterTop - 60 - Math.random() * 80,
    tx: Math.random() * W, ty: waterTop - 40 - Math.random() * 100,
    ph: Math.random() * 6.28, a: Math.random() * 6.28, restT: 0
  });
  if (wantFlies === 0) world.dflies.length = 0;
  for (i = 0; i < world.dflies.length; i++) {
    var d = world.dflies[i];
    if (d.restT > 0) { d.restT -= dt; continue; }
    var dx = d.tx - d.x, dy = d.ty - d.y, dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 8) {
      if (Math.random() < 0.3) { d.restT = 1 + Math.random() * 2; }
      else { d.tx = Math.random() * W; d.ty = waterTop - 40 - Math.random() * 100; }
    } else {
      var v = 130;
      d.x += dx / dist * v * dt; d.y += dy / dist * v * dt;
      d.a = Math.atan2(dy, dx);
    }
  }
  /* moths gather at lanterns */
  var wantMoths = cat === 'night' ? world.lanterns.length * 3 : 0;
  while (world.moths.length < wantMoths) world.moths.push({
    l: world.moths.length % Math.max(1, world.lanterns.length),
    r: 12 + Math.random() * 12, sp: 2 + Math.random() * 3, ph: Math.random() * 6.28
  });
  if (wantMoths === 0) world.moths.length = 0;
}
/* ---------- staged catch: fish arcs out with a droplet trail ---------- */
function arcPos(ca) {
  var k = Math.min(1, ca.t / ca.dur);
  var x0 = ca.x0, y0 = ca.y0, x1 = ca.x1, y1 = ca.y1;
  return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k - Math.sin(k * Math.PI) * 90, k: k };
}
function drawCatchArc(g) {
  var ca = world.catchArc;
  if (!ca || phase !== 'reveal') return;
  var p = arcPos(ca);
  var f = ca.fish;
  /* droplet-trailing arc, hanging a beat at the top */
  var hang = 1 + Math.sin(Math.min(1, p.k) * Math.PI) * 0.15;
  g.save();
  g.globalAlpha = Math.min(1, (ca.dur - ca.t) * 4 + 0.4);
  drawFish(g, p.x, p.y, 1.9 * f.size * hang, f.color,
    { slim: f.behavior === 'darter', pattern: patternFor(f.id), flip: p.k > 0.5 });
  g.restore();
}
function depthToY(d) {
  return waterTop + 16 + (Math.min(3.4, d) / 3.4) * (H - waterTop - 70);
}
function drawRodAndLine(g) {
  var tipX = heronPerchX() - 40, tipY = dockY() - 96;
  /* the rod bends under the fish: surges yank the tip down, the reveal holds it bent */
  var bend = 0;
  if (phase === 'reeling' && world.pullActive) bend = 16 * (0.4 + 0.6 * world.pullFrac);
  else if (phase === 'reveal') bend = 10;
  tipY += bend;
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
    else if (p.k === 'heart') {
      g.font = '700 17px ' + UI_FONT;
      g.fillStyle = 'rgba(205,85,85,' + Math.max(0, Math.min(1, p.life / p.max * 1.4)).toFixed(2) + ')';
      g.fillText(p.txt, p.x, p.y);
      g.font = '700 15px ' + UI_FONT;
    }
    else if (p.k === 'drop') {
      var dc = timeCat() === 'night' ? '190,210,235' : '220,240,250';
      g.fillStyle = 'rgba(' + dc + ',' + Math.max(0, p.life / p.max * 0.9).toFixed(2) + ')';
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.283); g.fill();
    }
  }
  g.restore();
}
function render() {
  var spot = spotById(save.spot), cat = timeCat();
  ctx.save();
  /* catch-moment zoom: the world holds its breath around the bobber */
  if (world.zoomK > 0.01) {
    var zx = world.bobX || W / 2, zy = waterTop;
    var zk = 1 + 0.14 * world.zoomK;
    ctx.translate(W / 2, H / 2); ctx.scale(zk, zk); ctx.translate(-(W / 2 + (zx - W / 2) * 0.4), -(H / 2 + (zy - H / 2) * 0.4));
  }
  drawSky(ctx, spot.palette, cat);
  drawWater(ctx, spot.palette, cat);
  drawSilhs(ctx);
  drawAnglerReflection(ctx);
  drawDock(ctx);
  drawAngler(ctx);
  drawLanterns(ctx, cat);
  drawReeds(ctx, cat);
  drawRodAndLine(ctx);
  drawHeron(ctx);
  drawCat(ctx);
  drawOtters(ctx);
  drawDragonflies(ctx);
  drawRipplesParts(ctx);
  drawTargetMarker(ctx);
  drawCatchArc(ctx);
  /* warm light over the grade: lantern pools, moon shimmer, moths */
  drawLight(ctx, cat);
  ctx.restore();
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
  /* the aquarium diorama only swims while the menu is up */
  setAquaRunning(id === 'scr-menu');
}
function setPhase(p) {
  phase = p;
  var cb = $('cast-btn'), hp = $('hook-prompt'), dg = $('depth-gauge'), rb = $('reel-bar');
  cb.disabled = !(p === 'idle');
  cb.classList.toggle('charging', p === 'charging');
  if (p !== 'charging') {
    var sp = cb.querySelector('span');
    if (sp && sp.textContent !== 'HOLD TO CAST') sp.textContent = 'HOLD TO CAST';
  }
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
  /* the world holds its breath: slow-mo dip + subtle zoom + audio duck */
  world.slowT = 0.5;
  world.zoomTarget = 1;
  AU.duck();
  var bx = world.bobX;
  for (var i = 0; i < 14; i++) world.parts.push({
    k: 'drop', x: bx + (Math.random() - 0.5) * 30, y: waterTop + 4,
    vx: (Math.random() - 0.5) * 260, vy: -160 - Math.random() * 240,
    r: 1.5 + Math.random() * 2.6, life: 1.0, max: 1.0
  });
  for (var j = 0; j < 3; j++) world.ripples.push({ x: bx, y: waterTop + 6, r: 10 + j * 12, life: 1.5, max: 1.5 });
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
  /* stage the catch: fish arcs out with a droplet trail, then the card */
  world.catchArc = {
    t: 0, dur: 1.05,
    x0: world.bobX, y0: waterTop + 2,
    x1: anglerX() + 40, y1: dockY() - 40,
    fish: f,
    args: [f, coins, quality, isNew, isRecord, curCatch.isDaily, curCatch.sizeCm]
  };
  setPhase('reveal');
}

/* ============================== update loop ============================== */
var lastT = 0, running = true;
function loop(ts) {
  if (!running) return;
  requestAnimationFrame(loop);
  var rawDt = Math.min(0.1, (ts - lastT) / 1000 || 0.016);
  lastT = ts;
  /* catch-moment slow-mo: the world holds its breath */
  var dt = rawDt;
  if (world.slowT > 0) { world.slowT -= rawDt; dt *= 0.32; }
  world.t += dt;
  world.cycleT = (world.cycleT + dt / CYCLE * timeSpeedMult(timeCat(), save.spot)) % 1;
  world.weatherT += dt;
  if (world.weatherT > world.weatherDur) pickWeather();
  if (world.wxBlend < 1) world.wxBlend = Math.min(1, world.wxBlend + rawDt / 8);
  updateHeron(dt);
  updateBirds(dt);
  updateCat(dt);
  updateAmbientLife(dt);
  AU.scheduleAmbient(dt, timeCat());
  /* catch-moment zoom easing */
  var zt = world.zoomTarget || 0;
  world.zoomK += (zt - world.zoomK) * Math.min(1, rawDt * 5);
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
  if (world.weather === 'rain' || world.wxFrom === 'rain') {
    var rainI = effRain();
    for (i = 0; i < world.rain.length; i++) {
      var dr = world.rain[i];
      dr.y += dr.v * dt; dr.x -= dr.v * 0.12 * dt;
      if (dr.y > H) {
        dr.y = -20; dr.x = Math.random() * (W + 60);
        /* every drop that lands rings the water */
        if (rainI > 0.3 && Math.random() < 0.12 && world.ripples.length < 40)
          world.ripples.push({ x: dr.x, y: waterTop + 6, r: 3, life: 0.7, max: 0.7 });
      }
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
    else if (p.k === 'heart') { p.y += p.vy * dt; p.x += Math.sin(world.t * 4 + p.y * 0.05) * 12 * dt; }
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
  } else if (phase === 'reveal' && world.catchArc) {
    /* the staged catch: fish arcs out with a droplet trail, then the card */
    var ca = world.catchArc;
    ca.t += rawDt;
    if (Math.random() < 0.6) {
      var ap = arcPos(ca);
      world.parts.push({
        k: 'drop', x: ap.x + (Math.random() - 0.5) * 14, y: ap.y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 60,
        r: 1 + Math.random() * 1.8, life: 0.7, max: 0.7
      });
    }
    if (ca.t >= ca.dur) { world.catchArc = null; world.zoomTarget = 0; showCatchCard.apply(null, ca.args); }
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

/* ---------- menu: spot picker (painted vignettes, not a list) ---------- */
function paintSpotVignette(g, sp) {
  var W2 = 92, H2 = 92;
  g.clearRect(0, 0, W2, H2);
  /* sky */
  var sky = g.createLinearGradient(0, 0, 0, H2 * 0.52);
  sky.addColorStop(0, sp.palette.sky[0]); sky.addColorStop(1, sp.palette.sky[2]);
  g.fillStyle = sky; g.fillRect(0, 0, W2, H2 * 0.52);
  /* sun/moon dot */
  g.fillStyle = sp.id === 'moonlit-pier' ? '#f4ead0' : '#fff3d0';
  g.beginPath(); g.arc(W2 * 0.68, H2 * 0.2, sp.id === 'moonlit-pier' ? 8 : 10, 0, 6.283); g.fill();
  /* water */
  var wg = g.createLinearGradient(0, H2 * 0.52, 0, H2);
  wg.addColorStop(0, sp.palette.water[0]); wg.addColorStop(1, sp.palette.water[2]);
  g.fillStyle = wg; g.fillRect(0, H2 * 0.52, W2, H2 * 0.48);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(0, H2 * 0.52, W2, 2);
  /* landmark silhouette per spot */
  g.fillStyle = 'rgba(43,33,25,0.75)';
  if (sp.id === 'sunny-cove') {
    /* rowboat */
    g.save(); g.translate(W2 * 0.5, H2 * 0.74); g.rotate(0.18);
    g.beginPath(); g.ellipse(0, 0, 26, 8, 0, 0.1 * Math.PI, 0.9 * Math.PI); g.fill();
    g.restore();
  } else if (sp.id === 'misty-marsh') {
    /* heron rock + mist bands */
    g.beginPath(); g.ellipse(W2 * 0.6, H2 * 0.8, 22, 13, 0, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(240,235,224,0.5)';
    g.fillRect(0, H2 * 0.42, W2, 7); g.fillRect(0, H2 * 0.58, W2, 5);
  } else {
    /* lantern posts */
    g.fillRect(W2 * 0.3 - 2, H2 * 0.4, 4, H2 * 0.3);
    g.fillRect(W2 * 0.7 - 2, H2 * 0.4, 4, H2 * 0.3);
    g.fillStyle = '#ffca7a';
    g.fillRect(W2 * 0.3 - 5, H2 * 0.4, 10, 8);
    g.fillRect(W2 * 0.7 - 5, H2 * 0.4, 10, 8);
  }
  /* frame */
  g.strokeStyle = 'rgba(43,33,25,0.35)'; g.lineWidth = 2;
  if (g.roundRect) { g.beginPath(); g.roundRect(1, 1, W2 - 2, H2 - 2, 14); g.stroke(); }
}
function renderSpotCards() {
  var box = $('spot-cards');
  box.innerHTML = '';
  CC.SPOTS.forEach(function (sp) {
    var owned = CC.canAccess(sp.id, save);
    var here = save.spot === sp.id;
    var card = document.createElement('div');
    card.className = 'spot-card' + (here ? ' sel' : '');
    var cv = document.createElement('canvas');
    cv.className = 'spot-vignette'; cv.width = 92; cv.height = 92;
    paintSpotVignette(cv.getContext('2d'), sp);
    card.appendChild(cv);
    var info = document.createElement('div');
    info.className = 'spot-info';
    info.innerHTML = '<b>' + esc(sp.name) + '</b><p>' + esc(sp.tagline) + '</p>';
    card.appendChild(info);
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
  aquaFish = r.tank.map(function (id) {
    var f = CC.BY_ID[id];
    if (!f) return null;
    return {
      f: f, x: 20 + Math.random() * 280, y: 44 + Math.random() * 58,
      vx: (Math.random() < 0.5 ? -1 : 1) * (13 + Math.random() * 18),
      ph: Math.random() * 6.283
    };
  }).filter(function (a) { return a; });
  var tank = $('aqua-tank');
  tank.innerHTML = '';
  var c = document.createElement('canvas');
  c.id = 'aqua-canvas'; c.width = 320; c.height = 120;
  tank.appendChild(c);
  $('aqua-rate').textContent = r.tank.length
    ? r.tank.length + '/' + CC.AQUA_MAX + ' fish · earning ~' + r.perHour + ' 🪙/hour (up to 8h)'
    : 'A kept fish earns coins while you rest. Tiny Fishing had the right idea.';
  paintAquariumFrame();
}
/* ---------- aquarium diorama: god rays, motes, swimming fish ---------- */
var aquaTimer = null, aquaFish = [], aquaT = 0;
function paintAquariumFrame() {
  var c = $('aqua-canvas');
  if (!c) return;
  var g = c.getContext('2d'), W2 = 320, H2 = 120;
  aquaT += 0.066;
  /* water */
  var wg = g.createLinearGradient(0, 0, 0, H2);
  wg.addColorStop(0, '#3f6b7a'); wg.addColorStop(1, '#23424e');
  g.fillStyle = wg; g.fillRect(0, 0, W2, H2);
  /* god rays */
  g.save(); g.globalCompositeOperation = 'lighter';
  for (var i = 0; i < 3; i++) {
    var rx = 60 + i * 90 + Math.sin(aquaT * 0.7 + i * 2) * 8;
    var rg = g.createLinearGradient(rx - 26, 0, rx + 26, 0);
    rg.addColorStop(0, 'rgba(255,244,214,0)');
    rg.addColorStop(0.5, 'rgba(255,244,214,' + (0.10 - i * 0.025) + ')');
    rg.addColorStop(1, 'rgba(255,244,214,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.moveTo(rx - 26, 0); g.lineTo(rx + 26, 0);
    g.lineTo(rx + 46, H2); g.lineTo(rx - 46, H2); g.closePath(); g.fill();
  }
  /* motes */
  g.fillStyle = 'rgba(255,255,255,0.28)';
  for (var m = 0; m < 14; m++) {
    var mx = (m * 47 + aquaT * 6) % W2, my = 12 + ((m * 31 + aquaT * 4) % (H2 - 24));
    g.beginPath(); g.arc(mx, my, 1.2, 0, 6.283); g.fill();
  }
  g.restore();
  /* sandy floor */
  g.fillStyle = '#8a7458';
  g.beginPath(); g.ellipse(W2 / 2, H2 + 14, W2 * 0.62, 26, 0, 0, 6.283); g.fill();
  /* a frond of weed */
  g.strokeStyle = '#4e7d5a'; g.lineWidth = 3; g.lineCap = 'round';
  for (var wfr = 0; wfr < 2; wfr++) {
    var wx0 = 30 + wfr * 260;
    g.beginPath(); g.moveTo(wx0, H2);
    g.quadraticCurveTo(wx0 + Math.sin(aquaT * 1.4 + wfr) * 12, H2 - 22, wx0 + Math.sin(aquaT * 1.4 + wfr + 1) * 18, H2 - 40);
    g.stroke();
  }
  /* the residents, swimming */
  if (!aquaFish.length) {
    g.fillStyle = 'rgba(240,235,224,0.75)';
    g.font = '13px Georgia,serif'; g.textAlign = 'center';
    g.fillText('Your tank is empty — keep a catch from the catch card.', W2 / 2, H2 / 2 + 4);
    g.textAlign = 'start';
  }
  aquaFish.forEach(function (a) {
    a.x += a.vx * 0.066;
    var yy = a.y + Math.sin(aquaT * 2.2 + a.ph) * 5;
    if (a.x < 12) { a.x = 12; a.vx = Math.abs(a.vx); }
    if (a.x > W2 - 12) { a.x = W2 - 12; a.vx = -Math.abs(a.vx); }
    drawFish(g, a.x, yy, 0.52 * a.f.size, a.f.color, {
      slim: a.f.behavior === 'darter', pattern: patternFor(a.f.id), flip: a.vx < 0
    });
  });
  /* glass sheen */
  var sh = g.createLinearGradient(0, 0, W2 * 0.5, H2);
  sh.addColorStop(0, 'rgba(255,255,255,0.16)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sh;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(W2 * 0.4, 0); g.lineTo(W2 * 0.1, H2); g.lineTo(0, H2); g.closePath(); g.fill();
}
function setAquaRunning(on) {
  if (on && !aquaTimer) aquaTimer = setInterval(paintAquariumFrame, 66);
  if (!on && aquaTimer) { clearInterval(aquaTimer); aquaTimer = null; }
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
    if (phase === 'bite') { hookIt(); return; }
    /* pet the harbor cat */
    var r = cv.getBoundingClientRect();
    var px = e.clientX - r.left, py = e.clientY - r.top;
    var c = world.cat;
    if (Math.abs(px - c.x) < 36 && Math.abs(py - (dockY() - 22)) < 44) petCat();
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
var journalTab = 'all';
function journalCells() {
  /* location tabs — Animal Crossing completion pressure */
  var tabs = $('journal-tabs');
  tabs.innerHTML = '';
  var defs = [{ id: 'all', name: 'All waters' }].concat(CC.SPOTS.map(function (s) {
    return { id: s.id, name: s.name };
  }));
  defs.forEach(function (d) {
    var b = document.createElement('button');
    b.className = 'jtab' + (journalTab === d.id ? ' sel' : '');
    b.type = 'button'; b.textContent = d.name;
    b.addEventListener('click', function () { journalTab = d.id; journalCells(); });
    tabs.appendChild(b);
  });
  var grid = $('journal-grid');
  grid.innerHTML = '';
  var frag = document.createDocumentFragment();
  var shown = 0, caughtN = 0;
  CC.FISH.forEach(function (f) {
    if (journalTab !== 'all' && f.spots.indexOf(journalTab) < 0) return;
    shown++;
    var caught = !!save.journal[f.id];
    if (caught) caughtN++;
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
  var pct = shown ? caughtN / shown : 0;
  $('journal-sub').textContent = caughtN + ' of ' + shown + ' discovered — ' + Math.round(pct * 100) + '%';
  /* wax-seal progress ring */
  var fg = $('wax-fg');
  if (fg) {
    var C = 2 * Math.PI * 24;
    fg.style.strokeDasharray = (pct * C).toFixed(1) + ' ' + C.toFixed(1);
  }
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
function drawMarlow(g, mood) {
  /* Marlow, the tackle keeper — illustrated portrait, expression changes */
  mood = mood || 'neutral';
  g.clearRect(0, 0, 96, 96);
  g.save();
  /* painted backdrop: shop wall wash */
  var bg = g.createLinearGradient(0, 0, 0, 96);
  bg.addColorStop(0, '#e8d3a8'); bg.addColorStop(1, '#d4b98c');
  g.fillStyle = bg;
  g.beginPath(); g.arc(48, 48, 46, 0, 6.283); g.fill();
  g.strokeStyle = '#8a6844'; g.lineWidth = 3;
  g.beginPath(); g.arc(48, 48, 46, 0, 6.283); g.stroke();
  /* hanging lures on the wall */
  g.strokeStyle = 'rgba(90,70,50,0.5)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(14, 18); g.lineTo(14, 30); g.stroke();
  g.fillStyle = '#c96f4a';
  g.beginPath(); g.ellipse(14, 34, 3, 6, 0.2, 0, 6.283); g.fill();
  g.beginPath(); g.moveTo(82, 14); g.lineTo(82, 26); g.stroke();
  g.fillStyle = '#5d8f4c';
  g.beginPath(); g.ellipse(82, 30, 3, 6, -0.2, 0, 6.283); g.fill();
  /* shoulders: canvas coat */
  g.fillStyle = '#7a6248';
  g.beginPath(); g.ellipse(48, 96, 36, 22, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#8f7657';
  g.beginPath(); g.ellipse(40, 90, 24, 14, -0.1, Math.PI, 0); g.fill();
  /* neckerchief */
  g.fillStyle = '#a8432f';
  g.beginPath(); g.moveTo(38, 74); g.lineTo(58, 74); g.lineTo(48, 88); g.closePath(); g.fill();
  /* weathered face */
  g.fillStyle = '#e0aa7c';
  g.beginPath(); g.arc(48, 52, 26, 0, 6.283); g.fill();
  g.fillStyle = 'rgba(160,110,70,0.35)';
  g.beginPath(); g.ellipse(48, 62, 20, 10, 0, 0, 6.283); g.fill(); /* sun-weathering */
  /* great gray beard */
  g.fillStyle = '#d8d0c0';
  g.beginPath();
  g.moveTo(26, 58); g.quadraticCurveTo(30, 88, 48, 90); g.quadraticCurveTo(66, 88, 70, 58);
  g.quadraticCurveTo(60, 70, 48, 70); g.quadraticCurveTo(36, 70, 26, 58); g.fill();
  g.strokeStyle = 'rgba(120,110,95,0.6)'; g.lineWidth = 1.2;
  for (var b = -2; b <= 2; b++) {
    g.beginPath(); g.moveTo(48 + b * 7, 72); g.quadraticCurveTo(48 + b * 8, 80, 48 + b * 6, 86); g.stroke();
  }
  /* nose */
  g.fillStyle = '#d89a6a';
  g.beginPath(); g.ellipse(48, 54, 5, 7, 0, 0, 6.283); g.fill();
  /* eyes by mood */
  g.strokeStyle = '#3a2c1c'; g.lineWidth = 2.6; g.lineCap = 'round';
  if (mood === 'happy') {
    g.beginPath(); g.arc(38, 46, 5, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
    g.beginPath(); g.arc(58, 46, 5, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
  } else if (mood === 'think') {
    g.beginPath(); g.arc(38, 47, 4.4, 0, 6.283); g.stroke();
    g.beginPath(); g.arc(58, 43, 4.4, 0, 6.283); g.stroke();
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(30, 36); g.lineTo(44, 38); g.stroke(); /* one brow raised */
  } else if (mood === 'sleepy') {
    g.beginPath(); g.moveTo(33, 47); g.lineTo(43, 47); g.stroke();
    g.beginPath(); g.moveTo(53, 47); g.lineTo(63, 47); g.stroke();
  } else {
    g.fillStyle = '#3a2c1c';
    g.beginPath(); g.arc(38, 46, 2.6, 0, 6.283); g.fill();
    g.beginPath(); g.arc(58, 46, 2.6, 0, 6.283); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(39, 45, 0.9, 0, 6.283); g.fill();
    g.beginPath(); g.arc(59, 45, 0.9, 0, 6.283); g.fill();
  }
  /* mouth by mood */
  g.strokeStyle = '#5a3a28'; g.lineWidth = 2.4;
  g.beginPath();
  if (mood === 'happy') g.arc(48, 60, 9, 0.15 * Math.PI, 0.85 * Math.PI);
  else if (mood === 'think') { g.moveTo(42, 64); g.quadraticCurveTo(52, 62, 56, 66); }
  else if (mood === 'sleepy') g.arc(48, 66, 5, 0.3 * Math.PI, 0.7 * Math.PI);
  else g.arc(48, 62, 7, 0.2 * Math.PI, 0.8 * Math.PI);
  g.stroke();
  /* skipper's cap */
  g.fillStyle = '#4f6a52';
  g.beginPath(); g.arc(48, 36, 25, Math.PI, 0); g.fill();
  g.fillStyle = '#435c46';
  g.fillRect(22, 32, 52, 6);
  g.fillStyle = '#e0aa4e';
  g.beginPath(); g.arc(48, 26, 3.4, 0, 6.283); g.fill(); /* brass pin */
  g.strokeStyle = 'rgba(40,50,42,0.5)'; g.lineWidth = 1.4;
  g.beginPath(); g.arc(48, 36, 25, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  g.restore();
}
var SHOP_ICON = { rod: '🎣', line: '🧵', lure: '🪱' };
var UNLOCK_DESC = {
  rod: 'Land bigger fish — a steadier rod keeps the bite window open longer.',
  line: 'Reach the deep water — every level sinks your bobber deeper.',
  lure: 'Tempt new species — rarer fish bite more often, and pay more.'
};
var marlowMood = 'neutral';
function renderShop() {
  drawMarlow($('marlow-face').getContext('2d'), marlowMood);
  if (marlowMood !== 'neutral') {
    /* moods are moments, not states — back to neutral shortly */
    setTimeout(function () {
      if (!$('ov-shop').hidden) drawMarlow($('marlow-face').getContext('2d'), 'neutral');
    }, 2600);
    marlowMood = 'neutral';
  }
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
        marlowMood = 'happy';
        row.classList.add('stamped');
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
function alsoBiting(excludeId) {
  /* Sunkissed City QoL: show what else is catchable right now — drives completion */
  var pool = CC.spotFish(save.spot);
  var daily = CC.dailyBigCatch(todayStr());
  var scored = [];
  for (var i = 0; i < pool.length; i++) {
    var f = pool[i];
    if (f.id === excludeId) continue;
    var w = CC.spawnWeight(f, {
      spotId: save.spot, timeCat: timeCat(), weather: world.weather,
      lureLevel: save.up.lure, dailyId: daily.fishId
    });
    if (w > 0) scored.push({ f: f, w: w });
  }
  scored.sort(function (a, b) { return b.w - a.w; });
  return scored.slice(0, 3).map(function (s) { return s.f; });
}
function paintCatchArt(g, f) {
  /* lavish the art budget here: watercolor wash + large painted fish */
  var W2 = 260, H2 = 130;
  g.clearRect(0, 0, W2, H2);
  var wash = g.createLinearGradient(0, 0, 0, H2);
  var rc = { common: ['#dfe9e4', '#bcd4d8'], uncommon: ['#d7e9f2', '#aecfe0'],
             rare: ['#e3d9f2', '#c0aee0'], legendary: ['#f7e6bd', '#eec27e'] }[f.rarity] || ['#dfe9e4', '#bcd4d8'];
  wash.addColorStop(0, rc[0]); wash.addColorStop(1, rc[1]);
  g.fillStyle = wash;
  g.beginPath();
  if (g.roundRect) g.roundRect(2, 2, W2 - 4, H2 - 4, 18); else g.rect(2, 2, W2 - 4, H2 - 4);
  g.fill();
  /* wash blobs */
  g.save();
  if (g.roundRect) { g.beginPath(); g.roundRect(2, 2, W2 - 4, H2 - 4, 18); g.clip(); }
  for (var i = 0; i < 5; i++) {
    var bx = 30 + (i * 53) % 220, by = 20 + (i * 37) % 90;
    var bg = g.createRadialGradient(bx, by, 2, bx, by, 34);
    bg.addColorStop(0, 'rgba(255,255,255,0.25)'); bg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = bg; g.beginPath(); g.arc(bx, by, 34, 0, 6.283); g.fill();
  }
  g.restore();
  /* the fish, large and proud */
  drawFish(g, W2 / 2, H2 / 2 + 4, 2.6 * f.size, f.color, { slim: f.behavior === 'darter', pattern: patternFor(f.id) });
  /* sparkle for rare+ */
  if (f.rarity === 'rare' || f.rarity === 'legendary') {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (var s = 0; s < 8; s++) {
      var sx = 20 + Math.random() * (W2 - 40), sy = 12 + Math.random() * (H2 - 24);
      g.strokeStyle = 'rgba(255,250,230,0.7)'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(sx - 4, sy); g.lineTo(sx + 4, sy); g.moveTo(sx, sy - 3); g.lineTo(sx, sy + 3); g.stroke();
    }
    g.restore();
  }
}
function showCatchCard(f, coins, quality, isNew, isRecord, caughtDaily, sizeCm) {
  openOv('ov-catch');
  var card = document.querySelector('#ov-catch .catch-card');
  card.className = 'catch-card r-' + f.rarity;
  $('catch-pun').textContent = '“' + f.pun + '”';
  $('catch-name').textContent = f.name;
  var stars = '★'.repeat(quality) + '☆'.repeat(3 - quality);
  var SKY_I = { dawn: '🌅', day: '☀️', dusk: '🌇', night: '🌙' };
  $('catch-meta').innerHTML = esc(String(sizeCm)) + ' cm · <span class="stars">' + stars + '</span>' +
    '<span class="catch-where">' + SKY_I[timeCat()] + ' ' + esc(spotById(save.spot).name) + '</span>';
  $('catch-badges').innerHTML =
    '<span class="pill r-' + f.rarity + '">' + f.rarity + '</span>' +
    '<span class="pill">' + CC.ZONES[f.zone] + '</span>' +
    (caughtDaily ? '<span class="pill daily">daily big catch</span>' : '');
  $('catch-lore').textContent = '“' + (save.lore[f.id] || f.lore) + '”';
  $('catch-coins').textContent = '+' + coins.toLocaleString() + ' 🪙';
  var sn = $('catch-stamp-new'), sr = $('catch-stamp-rec');
  sn.hidden = !isNew; sr.hidden = !isRecord;
  sn.classList.remove('pop'); sr.classList.remove('pop');
  void sn.offsetWidth;
  if (isNew) sn.classList.add('pop');
  if (isRecord) sr.classList.add('pop');
  paintCatchArt($('catch-fish').getContext('2d'), f);
  /* also biting right now */
  var ab = $('catch-also');
  var others = alsoBiting(f.id);
  if (others.length) {
    var html = '<p class="also-h">Also biting right now…</p><div class="also-row">';
    others.forEach(function (o, i) {
      html += '<button class="also-fish" data-i="' + i + '" type="button"><canvas width="72" height="44"></canvas><span>' +
        esc(o.name) + '</span></button>';
    });
    html += '</div>';
    ab.innerHTML = html;
    ab.hidden = false;
    var btns = ab.querySelectorAll('.also-fish');
    others.forEach(function (o, i) {
      var c = btns[i].querySelector('canvas');
      drawFish(c.getContext('2d'), 36, 22, 0.62 * o.size, o.color, { slim: o.behavior === 'darter', pattern: patternFor(o.id) });
      btns[i].addEventListener('click', function () {
        closeOv('ov-catch');
        $('journal-detail').hidden = true; journalCells(); openOv('ov-journal');
        showFishDetail(o);
      });
    });
  } else ab.hidden = true;
  if (f.rarity === 'rare' || f.rarity === 'legendary') AU.rareSting();
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
