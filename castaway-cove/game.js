/* Castaway Cove — UI/controller (game #11 in the Gamez arcade).
 * Canvas watercolor scene + DOM overlays. Pure logic lives in sim.js (global CC).
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

/* ============================== persistence ============================== */
var SAVE_KEY = 'castaway_cove_v1';
function defaultSave() {
  return {
    v: 1, coins: 0,
    up: { rod: 1, line: 1, lure: 1 },
    journal: {},
    streak: { last: null, count: 0 },
    daily: { date: null, fishId: null, caught: false },
    lore: {},
    best: 0,
    dailyBest: { date: null, value: 0 },
    arcadeSent: { date: null, value: 0 },
    muted: false,
    seenHelp: false
  };
}
function loadSave() {
  try {
    var s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!s || s.v !== 1) return defaultSave();
    var d = defaultSave();
    Object.keys(d).forEach(function (k) { if (s[k] !== undefined) d[k] = s[k]; });
    return d;
  } catch (e) { return defaultSave(); }
}
var save = loadSave();
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
}

/* ============================== audio ============================== */
var AU = {
  ctx: null, master: null,
  ensure: function () {
    try {
      if (!this.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = save.muted ? 0 : 0.9;
        this.master.connect(this.ctx.destination);
        this.startLap();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) {}
  },
  setMuted: function (m) {
    save.muted = m; persist();
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
    $('btn-mute').textContent = m ? '🔇' : '🔊';
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
  plip: function () { this.tone(520, 240, 0.16, 'sine', 0.22); },
  tug: function () { this.tone(190, 140, 0.09, 'square', 0.12); this.tone(190, 140, 0.09, 'square', 0.12, 0.11); },
  hook: function () { this.tone(660, 990, 0.12, 'triangle', 0.2); },
  splash: function () { this.burst(0.28, 800, 0.28); },
  chime: function () {
    var scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    var start = Math.floor(Math.random() * 3), n = 4;
    for (var i = 0; i < n; i++) {
      this.tone(scale[(start + i) % scale.length], 0, 0.55, 'triangle', 0.16, i * 0.1);
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
  bobX: 0, bobY: 0, bobDepth: 0.5
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
function timeCat() {
  var t = world.cycleT;
  if (t < 0.07 || t >= 0.95) return 'dawn';
  if (t < 0.45) return 'day';
  if (t < 0.58) return 'dusk';
  return 'night';
}
function pickWeather() {
  var r = Math.random();
  world.weather = r < 0.62 ? 'clear' : (r < 0.85 ? 'rain' : 'fog');
  world.weatherDur = 80 + Math.random() * 50;
  world.weatherT = 0;
  if (world.weather === 'rain' && world.rain.length === 0) {
    for (var i = 0; i < 90; i++) world.rain.push({
      x: Math.random() * W, y: Math.random() * H, v: 420 + Math.random() * 260
    });
  }
}
var SKY = {
  dawn:  { top: '#f9d9a8', mid: '#f2a988', bot: '#c98aa0', sun: '#fff3d0', sa: 0.95 },
  day:   { top: '#aee3f5', mid: '#cdeef7', bot: '#f6e3bd', sun: '#fffbe8', sa: 1 },
  dusk:  { top: '#e8a37e', mid: '#d97f7e', bot: '#7e6a8e', sun: '#ffd9a0', sa: 0.9 },
  night: { top: '#0e1a33', mid: '#1c2c4e', bot: '#3a4a63', sun: '#f4ead0', sa: 0.85 }
};
function skyPalette() {
  /* blend palettes across cycle boundaries for smooth transitions */
  var t = world.cycleT, a, b, f;
  function catAt(x) {
    if (x < 0.07 || x >= 0.95) return 'dawn';
    if (x < 0.45) return 'day';
    if (x < 0.58) return 'dusk';
    return 'night';
  }
  var edges = [0.07, 0.45, 0.58, 0.95], span = 0.03;
  a = catAt(t); b = a; f = 0;
  for (var i = 0; i < edges.length; i++) {
    if (Math.abs(t - edges[i]) < span) {
      a = catAt(edges[i] - span); b = catAt(edges[i] + span); f = (t - (edges[i] - span)) / (span * 2);
    }
  }
  function hx(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function mix(h1, h2, k) {
    var c1 = hx(h1), c2 = hx(h2);
    return 'rgb(' + Math.round(c1[0] + (c2[0] - c1[0]) * k) + ',' +
      Math.round(c1[1] + (c2[1] - c1[1]) * k) + ',' + Math.round(c1[2] + (c2[2] - c1[2]) * k) + ')';
  }
  var A = SKY[a], B = SKY[b];
  return { top: mix(A.top, B.top, f), mid: mix(A.mid, B.mid, f), bot: mix(A.bot, B.bot, f),
    sun: mix(A.sun, B.sun, f), sa: A.sa + (B.sa - A.sa) * f };
}
function sunPos() {
  /* sun arcs across the sky during day/dawn/dusk; moon at night */
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
function drawFish(g, x, y, s, color, o) {
  o = o || {};
  g.save();
  g.translate(x, y);
  if (o.flip) g.scale(-1, 1);
  var L = 34 * s, Hh = 15 * s;
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
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.ellipse(L * 0.08, -Hh * 0.22, L * 0.3, Hh * 0.22, -0.2, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(20,20,20,0.75)';
    g.beginPath(); g.arc(L * 0.3, -Hh * 0.1, Math.max(1.4, 2.4 * s), 0, 6.283); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.arc(L * 0.3 + 0.8, -Hh * 0.1 - 0.8, Math.max(0.7, 0.9 * s), 0, 6.283); g.fill();
  }
  g.restore();
}

/* ---------- the heron ---------- */
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
function drawSky(g, pal) {
  var gr = g.createLinearGradient(0, 0, 0, waterTop);
  gr.addColorStop(0, pal.top); gr.addColorStop(0.62, pal.mid); gr.addColorStop(1, pal.bot);
  g.fillStyle = gr; g.fillRect(0, 0, W, waterTop + 1);
  var sp = sunPos(), cat = timeCat();
  if (cat === 'night') {
    g.save();
    for (var i = 0; i < world.stars.length; i++) {
      var st = world.stars[i], a = 0.25 + 0.55 * Math.abs(Math.sin(world.t * 1.2 + st.tw));
      g.fillStyle = 'rgba(255,255,240,' + a.toFixed(2) + ')';
      g.beginPath(); g.arc(st.x, st.y, st.r, 0, 6.283); g.fill();
    }
    g.restore();
  }
  /* sun / moon with soft halo */
  var halo = g.createRadialGradient(sp.x, sp.y, 4, sp.x, sp.y, 70);
  if (sp.isMoon) { halo.addColorStop(0, 'rgba(244,234,208,0.95)'); halo.addColorStop(0.35, 'rgba(244,234,208,0.5)'); }
  else { halo.addColorStop(0, pal.sun); halo.addColorStop(0.4, pal.sun + ''); }
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  g.save(); g.globalAlpha = pal.sa;
  g.fillStyle = halo; g.beginPath(); g.arc(sp.x, sp.y, 70, 0, 6.283); g.fill();
  g.fillStyle = sp.isMoon ? '#f4ead0' : pal.sun;
  g.beginPath(); g.arc(sp.x, sp.y, sp.isMoon ? 22 : 30, 0, 6.283); g.fill();
  if (sp.isMoon) { g.fillStyle = 'rgba(180,170,150,0.5)';
    g.beginPath(); g.arc(sp.x - 7, sp.y - 4, 5, 0, 6.283); g.fill();
    g.beginPath(); g.arc(sp.x + 6, sp.y + 7, 3.5, 0, 6.283); g.fill(); }
  g.restore();
  /* clouds */
  g.save();
  var cc = cat === 'night' ? 'rgba(40,52,80,0.85)' : 'rgba(255,251,240,0.88)';
  g.fillStyle = cc;
  for (var c = 0; c < world.clouds.length; c++) {
    var cl = world.clouds[c];
    g.beginPath();
    g.ellipse(cl.x, cl.y, 46 * cl.s, 13 * cl.s, 0, 0, 6.283);
    g.ellipse(cl.x - 26 * cl.s, cl.y + 4 * cl.s, 26 * cl.s, 9 * cl.s, 0, 0, 6.283);
    g.ellipse(cl.x + 26 * cl.s, cl.y + 4 * cl.s, 28 * cl.s, 10 * cl.s, 0, 0, 6.283);
    g.fill();
  }
  g.restore();
}
function drawWater(g, pal, cat) {
  var wg = g.createLinearGradient(0, waterTop, 0, H);
  if (cat === 'night') { wg.addColorStop(0, '#2c3e57'); wg.addColorStop(1, '#101c2e'); }
  else if (cat === 'dusk') { wg.addColorStop(0, '#7e8ba0'); wg.addColorStop(1, '#3c4a63'); }
  else { wg.addColorStop(0, '#8fc3d8'); wg.addColorStop(0.5, '#5d9dbd'); wg.addColorStop(1, '#2f6a8f'); }
  g.fillStyle = wg; g.fillRect(0, waterTop, W, H - waterTop);
  /* sun/moon glitter path */
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
  /* fog */
  if (world.weather === 'fog') {
    g.save(); g.globalAlpha = 0.45; g.fillStyle = '#e8e2d5';
    var fy = waterTop - 40 + Math.sin(world.t * 0.3) * 12;
    g.fillRect(0, fy, W, H - fy);
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
  g.strokeStyle = 'rgba(240,240,235,0.85)'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(tipX, tipY); g.lineTo(bx, by); g.stroke();
  /* bobber */
  var bob = Math.sin(world.t * 3) * 2.5;
  g.fillStyle = '#d84a3a';
  g.beginPath(); g.arc(bx, by + bob, 8, Math.PI, 0); g.fill();
  g.fillStyle = '#f5f2ea';
  g.beginPath(); g.arc(bx, by + bob, 8, 0, Math.PI); g.fill();
  g.strokeStyle = '#7a3a2a'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(bx, by + bob, 8, 0, 6.283); g.stroke();
  g.restore();
  /* bite "!" + shrinking ring */
  if (phase === 'bite') {
    var frac = Math.max(0, biteLeft / biteWindow);
    g.save();
    g.font = '900 34px ' + UI_FONT; g.textAlign = 'center';
    g.fillStyle = '#ffd34d';
    g.strokeStyle = '#7a4a12'; g.lineWidth = 5;
    var jy = by - 44 + Math.sin(world.t * 14) * 3;
    g.strokeText('!', bx, jy); g.fillText('!', bx, jy);
    g.strokeStyle = 'rgba(255,211,77,' + (0.35 + 0.55 * frac).toFixed(2) + ')';
    g.lineWidth = 4;
    g.beginPath(); g.arc(bx, by + bob, 16 + (1 - frac) * 26, 0, 6.283); g.stroke();
    g.restore();
  }
}
function drawSilhs(g) {
  g.save();
  for (var i = 0; i < world.silhs.length; i++) {
    var s = world.silhs[i];
    drawFish(g, s.x, s.y + Math.sin(world.t * 2 + s.ph) * 6, s.size, null, { silhouette: true, flip: s.dir < 0 });
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
  var pal = skyPalette(), cat = timeCat();
  drawSky(ctx, pal);
  drawWater(ctx, pal, cat);
  drawSilhs(ctx);
  drawDock(ctx);
  drawRodAndLine(ctx);
  drawHeron(ctx);
  drawRipplesParts(ctx);
}

/* ============================== game state ============================== */
var phase = 'menu';           /* menu|idle|charging|casting|sinking|waiting|bite|reeling|reveal */
var holdMs = 0, castT = 0, sinkT = 0, waitT = 0, biteDelay = 0;
var biteLeft = 0, biteWindow = 1, reelT = 0;
var castDepthV = 0.5, castTargetY = 0, castFromX = 0, castFromY = 0;
var curCatch = null;          /* CC.resolveCatch result for this cast */
var toastTimer = null;

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
  var cb = $('cast-btn'), hp = $('hook-prompt'), dg = $('depth-gauge');
  cb.disabled = !(p === 'idle');
  cb.classList.toggle('charging', p === 'charging');
  hp.hidden = p !== 'bite';
  dg.classList.toggle('show', p === 'charging');
  if (p === 'idle') cb.querySelector('span').textContent = 'HOLD TO CAST';
}

function spawnSilhs() {
  world.silhs = [];
  for (var i = 0; i < 7; i++) {
    var d = 0.3 + Math.random() * 2.8;
    world.silhs.push({
      x: Math.random() * W, y: depthToY(d) + (Math.random() - 0.5) * 20,
      dir: Math.random() < 0.5 ? 1 : -1, speed: 22 + Math.random() * 40,
      size: 0.55 + Math.random() * 0.8, ph: Math.random() * 6.28, depth: d
    });
  }
}
function castPoint() { return { x: heronPerchX() + 96, y: 0 }; }

function beginCharge() {
  if (phase !== 'idle') return;
  setPhase('charging');
  holdMs = 0;
  AU.ensure();
}
function releaseCast() {
  if (phase !== 'charging') return;
  castDepthV = CC.castDepth(holdMs, save.up.line);
  var cp = castPoint();
  world.bobX = heronPerchX() - 40; world.bobY = dockY() - 96;
  castFromX = world.bobX; castFromY = world.bobY;
  castTargetY = depthToY(castDepthV);
  castT = 0;
  /* resolve the catch now (gameplay randomness is fine here) */
  var daily = CC.dailyBigCatch(todayStr());
  var rng = function () { return Math.random(); };
  curCatch = CC.resolveCatch({
    rng: rng, depth: castDepthV, timeCat: timeCat(), weather: world.weather,
    upgrades: save.up, dailyId: daily.fishId
  });
  biteWindow = curCatch.biteWindowMs;
  setPhase('casting');
  AU.plip();
  world.ripples.push({ x: cp.x, y: waterTop + 6, r: 6, life: 1.2, max: 1.2 });
}
function startWaiting() {
  biteDelay = CC.biteDelayMs(Math.random) / 1000; /* ms -> s */
  waitT = 0;
  setPhase('waiting');
}
function startBite() {
  biteLeft = biteWindow;
  setPhase('bite');
  AU.tug();
  var bx = world.bobX, by = waterTop + 6;
  for (var i = 0; i < 3; i++) world.ripples.push({ x: bx, y: by, r: 6 + i * 8, life: 1.4, max: 1.4 });
  /* a silhouette darts to the bobber */
  var near = null, nd = 1e9;
  world.silhs.forEach(function (s) {
    var d = Math.abs(s.y - castTargetY) + Math.abs(s.x - bx) * 0.2;
    if (d < nd) { nd = d; near = s; }
  });
  if (near) { near.dart = { x: bx, y: castTargetY }; }
}
function hookIt() {
  if (phase !== 'bite') return;
  setPhase('reeling');
  reelT = 0;
  AU.hook();
}
function missedBite() {
  setPhase('idle');
  toast('It slipped away…');
  if (heron.mode === 'watching' || heron.mode === 'sleeping') heronSay(['...']);
}
function finishReel() {
  /* coins, journal, streak, daily, arcade — then the reveal card */
  var f = curCatch.fish, coins = curCatch.coins;
  var isNew = !save.journal[f.id];
  save.coins += coins;
  CC.journalRecord(save.journal, f.id, coins);
  if (coins > save.best) save.best = coins;
  save.streak = CC.nextStreak(save.streak, todayStr());
  var daily = CC.dailyBigCatch(todayStr());
  var caughtDaily = curCatch.isDaily;
  if (caughtDaily) save.daily = { date: daily.date, fishId: daily.fishId, caught: true };
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
  showCatchCard(f, coins, isNew, caughtDaily);
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
  world.cycleT = (world.cycleT + dt / CYCLE) % 1;
  world.weatherT += dt;
  if (world.weatherT > world.weatherDur) pickWeather();
  updateHeron(dt);
  /* clouds drift */
  var i;
  for (i = 0; i < world.clouds.length; i++) {
    var cl = world.clouds[i];
    cl.x += cl.v * dt;
    if (cl.x - 80 > W) { cl.x = -80; cl.y = 20 + Math.random() * waterTop * 0.5; }
  }
  /* rain falls */
  if (world.weather === 'rain') {
    for (i = 0; i < world.rain.length; i++) {
      var dr = world.rain[i];
      dr.y += dr.v * dt; dr.x -= dr.v * 0.12 * dt;
      if (dr.y > H) { dr.y = -20; dr.x = Math.random() * (W + 60); }
    }
  }
  /* silhouettes swim */
  for (i = 0; i < world.silhs.length; i++) {
    var s = world.silhs[i];
    if (s.dart) {
      s.x += (s.dart.x - s.x) * Math.min(1, dt * 6);
      s.y += (s.dart.y - s.y) * Math.min(1, dt * 6);
    } else {
      s.x += s.dir * s.speed * dt;
      if (s.x > W + 60) { s.x = -60; s.dir = 1; }
      if (s.x < -60) { s.x = W + 60; s.dir = -1; }
    }
  }
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

  /* phases */
  var cp = castPoint();
  if (phase === 'charging') {
    holdMs += dt * 1000;
    var frac = Math.min(1, holdMs / 2500);
    $('gauge-fill').style.height = (frac * 100).toFixed(1) + '%';
    var d = CC.castDepth(holdMs, save.up.line);
    var z = CC.ZONES[CC.zoneForDepth(d)];
    var lbl = 'HOLD… ' + z.toUpperCase();
    var sp = $('cast-btn').querySelector('span');
    if (sp.textContent !== lbl) sp.textContent = lbl;
    world.bobX = heronPerchX() - 40; world.bobY = dockY() - 96;
  } else if (phase === 'casting') {
    castT += dt;
    var k = Math.min(1, castT / 0.45), e = 1 - Math.pow(1 - k, 2);
    world.bobX = castFromX + (cp.x - castFromX) * e;
    world.bobY = castFromY + (waterTop + 4 - castFromY) * e - Math.sin(k * Math.PI) * 60;
    if (k >= 1) {
      sinkT = 0;
      world.ripples.push({ x: cp.x, y: waterTop + 6, r: 8, life: 1.2, max: 1.2 });
      AU.splash();
      setPhase('sinking');
    }
  } else if (phase === 'sinking') {
    sinkT += dt;
    var k2 = Math.min(1, sinkT / 0.9);
    world.bobX = cp.x;
    world.bobY = (waterTop + 4) + (castTargetY - waterTop - 4) * k2;
    world.bobDepth = castDepthV * k2;
    if (k2 >= 1) startWaiting();
  } else if (phase === 'waiting') {
    waitT += dt;
    world.bobX = cp.x;
    world.bobY = castTargetY + Math.sin(world.t * 3) * 2;
    world.bobDepth = castDepthV;
    if (waitT >= biteDelay) startBite();
  } else if (phase === 'bite') {
    biteLeft -= dt * 1000;
    world.bobY = castTargetY + Math.sin(world.t * 22) * 4;
    if (biteLeft <= 0) missedBite();
  } else if (phase === 'reeling') {
    reelT += dt;
    var k3 = Math.min(1, reelT / 1.3);
    world.bobX = cp.x;
    world.bobY = castTargetY + (waterTop + 2 - castTargetY) * k3;
    if (k3 >= 1 && reelT < 1.35) {
      /* splash! */
      for (var j = 0; j < 14; j++) world.parts.push({
        k: 'drop', x: cp.x + (Math.random() - 0.5) * 20, y: waterTop + 4,
        vx: (Math.random() - 0.5) * 160, vy: -120 - Math.random() * 160,
        r: 1.5 + Math.random() * 2.5, life: 0.9, max: 0.9
      });
      world.ripples.push({ x: cp.x, y: waterTop + 6, r: 10, life: 1.4, max: 1.4 });
      AU.splash();
      reelT = 1.35;
    }
    if (reelT >= 1.7) finishReel();
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
function updateHud() { $('hud-coins').textContent = '🪙 ' + save.coins.toLocaleString(); }
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
    : '40 fish swim in the cove. Nobody has met them all yet.';
}

/* ============================== input ============================== */
function bindInput() {
  var cb = $('cast-btn');
  cb.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    beginCharge();
    try { cb.setPointerCapture(e.pointerId); } catch (err) {}
  });
  cb.addEventListener('pointerup', function (e) { e.preventDefault(); releaseCast(); });
  cb.addEventListener('pointercancel', function () { if (phase === 'charging') setPhase('idle'); });
  cb.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  cv.addEventListener('pointerdown', function () {
    AU.ensure();
    if (phase === 'bite') hookIt();
  });
  document.addEventListener('keydown', function (e) {
    if (e.code === 'Space' && !$('scr-play').classList.contains('on')) return;
    if (e.code === 'Space') { e.preventDefault(); beginCharge(); }
  });
  document.addEventListener('keyup', function (e) {
    if (e.code === 'Space') releaseCast();
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
    var g = c.getContext('2d');
    drawFish(g, 48, 30, 0.85, f.color, { silhouette: !caught });
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
  $('journal-sub').textContent = caughtN + ' of ' + CC.FISH.length + ' discovered';
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
    '</div>' +
    (caught
      ? '<p class="lore" id="jd-lore">“' + esc(lore) + '”</p>' +
        '<p class="sheet-note">Likes: ' + f.time.join(', ') + ' · ' + f.weather.join(', ') + ' water.</p>'
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

/* ---------- shop ---------- */
var SHOP_ICON = { rod: '🎣', line: '🧵', lure: '🪱' };
function renderShop() {
  $('shop-coins').textContent = save.coins.toLocaleString();
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
      '<p>' + esc(meta.desc) + '</p><div class="pips">' + pips + '</div></div>';
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
    '<p>One special fish visits the cove today —<br>same for everyone, worldwide.</p>' +
    '<p>🪙 <b>' + d.value + '</b> to whoever lands it.</p>' +
    '<p class="sheet-note" style="margin:4px 0">Hint: ' + CC.ZONES[f.zone] + ' water · likes ' +
    f.time.join('/') + ' · ' + f.weather.join('/') + ' skies.</p>' +
    (caught ? '<span class="daily-stamp">✓ CAUGHT TODAY</span>' : '') +
    '</div></div>' +
    '<p class="sheet-sub">🔥 streak: <b>' + save.streak.count + '</b> day' + (save.streak.count === 1 ? '' : 's') +
    ' · 📖 journal: <b>' + Object.keys(save.journal).length + '/' + CC.FISH.length + '</b></p>';
  var g = $('daily-fish').getContext('2d');
  drawFish(g, 110, 64, 1.7, f.color, { silhouette: !caught });
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
function showCatchCard(f, coins, isNew, caughtDaily) {
  openOv('ov-catch');
  $('catch-kicker').textContent = caughtDaily ? '🌟 The Daily Big Catch! 🌟' : 'You caught…';
  $('catch-name').textContent = f.name;
  $('catch-badges').innerHTML =
    '<span class="pill r-' + f.rarity + '">' + f.rarity + '</span>' +
    '<span class="pill">' + CC.ZONES[f.zone] + '</span>' +
    (caughtDaily ? '<span class="pill daily">daily big catch</span>' : '');
  $('catch-lore').textContent = '“' + (save.lore[f.id] || f.lore) + '”';
  $('catch-coins').textContent = '+' + coins.toLocaleString() + ' 🪙';
  $('catch-stamp').hidden = !isNew;
  var g = $('catch-fish').getContext('2d');
  g.clearRect(0, 0, 220, 110);
  drawFish(g, 110, 55, 2.1, f.color, {});
  AU.chime();
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
    showScreen('scr-play');
    setPhase('idle');
    spawnSilhs();
  });
  $('btn-quit').addEventListener('click', function () {
    if (phase === 'charging' || phase === 'casting' || phase === 'sinking' ||
        phase === 'waiting' || phase === 'bite' || phase === 'reeling') {
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
  world: world,
  heron: heron,
  toast: toast
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
