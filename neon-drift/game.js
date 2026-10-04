/* Neon Drift — rendering, input, audio, modes. Requires sim.js (global ND). */
'use strict';
(function () {

var $ = function (id) { return document.getElementById(id); };
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* ---------------- save ---------------- */

var SAVE_KEY = 'nd_save_v1';
function defSave() {
  return {
    tokens: 0, cupsUnlocked: 1, carId: 'balanced', paint: '#4dd8ff', glow: '#4dd8ff',
    glows: ['#4dd8ff'],
    upg: { engine: 0, tires: 0, drift: 0 },
    best: {}, ghosts: {},
    assist: false, mute: false, difficulty: 1, haptic: true,
    cupWins: []
  };
}
function loadSave() {
  try {
    var s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s && typeof s === 'object') { var d = defSave(); for (var k in d) if (s[k] !== undefined) d[k] = s[k]; return d; }
  } catch (e) {}
  return defSave();
}
var S = loadSave();
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }

/* ---------------- audio ---------------- */

var AU = {
  ctx: null, master: null, engOsc: null, engOsc2: null, engGain: null, engFilter: null,
  driftGain: null, driftFilter: null, musicGain: null, musicTimer: null, step: 0,
  init: function () {
    if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      AU.ctx = new C();
    } catch (e) { return; }
    var c = AU.ctx;
    AU.master = c.createGain();
    AU.master.gain.value = S.mute ? 0 : 1;
    AU.master.connect(c.destination);
    // engine: detuned saws through a lowpass
    AU.engOsc = c.createOscillator(); AU.engOsc.type = 'sawtooth';
    AU.engOsc2 = c.createOscillator(); AU.engOsc2.type = 'square';
    AU.engFilter = c.createBiquadFilter(); AU.engFilter.type = 'lowpass'; AU.engFilter.frequency.value = 900;
    AU.engGain = c.createGain(); AU.engGain.gain.value = 0;
    AU.engOsc.connect(AU.engFilter); AU.engOsc2.connect(AU.engFilter);
    AU.engFilter.connect(AU.engGain); AU.engGain.connect(AU.master);
    AU.engOsc.start(); AU.engOsc2.start();
    // drift: looped noise through bandpass
    var nb = c.createBuffer(1, c.sampleRate, c.sampleRate);
    var dd = nb.getChannelData(0);
    for (var i = 0; i < dd.length; i++) dd[i] = Math.random() * 2 - 1;
    var ns = c.createBufferSource(); ns.buffer = nb; ns.loop = true;
    AU.driftFilter = c.createBiquadFilter(); AU.driftFilter.type = 'bandpass';
    AU.driftFilter.frequency.value = 900; AU.driftFilter.Q.value = 1.2;
    AU.driftGain = c.createGain(); AU.driftGain.gain.value = 0;
    ns.connect(AU.driftFilter); AU.driftFilter.connect(AU.driftGain); AU.driftGain.connect(AU.master);
    ns.start();
    AU.musicGain = c.createGain(); AU.musicGain.gain.value = 0.5; AU.musicGain.connect(AU.master);
  },
  setMute: function (m) {
    S.mute = m; save();
    if (AU.master) AU.master.gain.value = m ? 0 : 1;
    $('btn-mute').textContent = m ? '🔇' : '🔊';
  },
  // ratio 0..1.3, drifting bool, charge 0..3ish
  engine: function (ratio, drifting, charge) {
    if (!AU.ctx || S.mute) return;
    var t = AU.ctx.currentTime;
    var f = 65 + ratio * 165;
    AU.engOsc.frequency.setTargetAtTime(f, t, 0.05);
    AU.engOsc2.frequency.setTargetAtTime(f * 1.494, t, 0.05);
    AU.engFilter.frequency.setTargetAtTime(700 + ratio * 2600, t, 0.08);
    AU.engGain.gain.setTargetAtTime(0.028 + ratio * 0.030, t, 0.09);
    if (drifting) {
      AU.driftFilter.frequency.setTargetAtTime(700 + charge * 900, t, 0.06);
      AU.driftGain.gain.setTargetAtTime(0.02 + Math.min(charge, 2) * 0.028, t, 0.06);
    } else {
      AU.driftGain.gain.setTargetAtTime(0, t, 0.08);
    }
  },
  engineOff: function () {
    if (!AU.ctx) return;
    var t = AU.ctx.currentTime;
    AU.engGain.gain.setTargetAtTime(0, t, 0.15);
    AU.driftGain.gain.setTargetAtTime(0, t, 0.1);
  },
  beep: function (freq, dur, type, vol, when) {
    if (!AU.ctx || S.mute) return;
    var c = AU.ctx, t = c.currentTime + (when || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol || 0.2, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(AU.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  thump: function () { // crash / wall
    if (!AU.ctx || S.mute) return;
    var c = AU.ctx, t = c.currentTime;
    var o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(AU.master); o.start(t); o.stop(t + 0.2);
  },
  whoosh: function () { // boost release
    if (!AU.ctx || S.mute) return;
    var c = AU.ctx, t = c.currentTime;
    var nb = c.createBuffer(1, c.sampleRate * 0.4, c.sampleRate);
    var d = nb.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    var s = c.createBufferSource(); s.buffer = nb;
    var f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(5000, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.35);
    var g = c.createGain(); g.gain.value = 0.22;
    s.connect(f); f.connect(g); g.connect(AU.master); s.start(t);
  },
  chime: function () { AU.beep(1318, 0.28, 'triangle', 0.16); AU.beep(1760, 0.34, 'triangle', 0.12, 0.07); },
  countBeep: function (n) { AU.beep(n === 0 ? 880 : 620, n === 0 ? 0.5 : 0.18, 'square', 0.16); },
  // generative synthwave: bass + kick + hats + sparse lead, A-minor-ish
  music: function (on, menu) {
    if (!AU.ctx) return;
    if (AU.musicTimer) { clearInterval(AU.musicTimer); AU.musicTimer = null; }
    if (!on || S.mute) return;
    var c = AU.ctx;
    var bass = [55, 0, 55, 0, 65.4, 0, 55, 0, 49, 0, 49, 0, 58.3, 0, 73.4, 0];
    var lead = [220, 261.6, 329.6, 440, 329.6, 261.6];
    AU.step = 0;
    var bpm = menu ? 84 : 112, spb = 60 / bpm / 2;
    AU.musicTimer = setInterval(function () {
      if (S.mute || !AU.ctx) return;
      var s = AU.step++, t = c.currentTime;
      function note(fr, dur, type, vol, cutoff) {
        var o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
        o.type = type; o.frequency.value = fr;
        f.type = 'lowpass'; f.frequency.value = cutoff || 1200;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(f); f.connect(g); g.connect(AU.musicGain);
        o.start(t); o.stop(t + dur + 0.05);
      }
      // kick on quarters
      if (s % 2 === 0) {
        var o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.1);
        g.gain.setValueAtTime(menu ? 0.10 : 0.16, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.connect(g); g.connect(AU.musicGain); o.start(t); o.stop(t + 0.15);
      }
      // hats on eighths
      if (!menu && s % 2 === 1) note(6000 + Math.random() * 2000, 0.03, 'square', 0.015, 8000);
      var b = bass[s % 16];
      if (b) note(b, spb * 0.9, 'sawtooth', menu ? 0.05 : 0.075, 500);
      if (!menu && s % 32 === 24) {
        var l = lead[(s >> 5) % lead.length];
        note(l, spb * 3, 'triangle', 0.05, 2400);
        note(l * 1.5, spb * 3, 'triangle', 0.03, 2400);
      }
    }, spb * 1000);
  }
};

/* ---------------- haptics ---------------- */
// Vibration API: Android Chrome/Firefox only. iOS Safari ignores vibrate() —
// every call is feature-detected AND try/catch-guarded so it can never throw
// there. Vocabulary is speed-coupled to the drift identity: the buzz rises
// with the drift charge tier (blue -> orange -> pink). Layering order is
// visual -> audio -> haptic, each within ~50ms of the event.
var HZ = {
  ok: false, reduced: false,
  select: [10], light: [20], medium: [30],
  tierBuzz: [[], [15], [25], [40]],  // indexed by drift tier 1..3
  boostBuzz: [[], [30], [40], [50]], // indexed by boost tier 1..3
  success: [10, 40, 10], warning: [20, 60, 20],
  init: function () {
    try {
      this.reduced = !!(window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      this.ok = !!(navigator && 'vibrate' in navigator &&
        typeof navigator.vibrate === 'function');
    } catch (e) { this.ok = false; }
  },
  play: function (pat) {
    if (!this.ok || this.reduced || !S.haptic || !pat || !pat.length) return;
    // cancel-then-fire: many Android devices ignore vibrate() while one is
    // already in progress, so retriggerable events (tiers) need the cancel.
    try { navigator.vibrate(0); navigator.vibrate(pat); }
    catch (e) {}
  }
};

/* ---------------- themes & track art ---------------- */

var THEME_STYLE = {
  neon:   { bg: '#0b0e1a', road: '#262c40', roadIn: '#2e3550', edge: '#4dd8ff', accent: '#ff4dd8', ground: '#10142a', dash: '#5a6a9a' },
  coast:  { bg: '#08131c', road: '#2b3129', roadIn: '#343b31', edge: '#7dffd4', accent: '#ffd94d', ground: '#0c1a26', dash: '#6a8a7a' },
  desert: { bg: '#180f07', road: '#3b3021', roadIn: '#463a29', edge: '#ffb84d', accent: '#ff7a4d', ground: '#1e1409', dash: '#8a734d' },
  snow:   { bg: '#0c1320', road: '#2b3242', roadIn: '#343d52', edge: '#bfe6ff', accent: '#7ab8ff', ground: '#121b2c', dash: '#6a7f9a' }
};
var TRACK_NAMES = {
  neon: ['Neon Mile', 'Overpass Run', 'Gridlock'],
  coast: ['Salt Spray', 'Cliffside', 'Harbor Lights'],
  desert: ['Dust Devil', 'Mirage', 'Canyon Carve'],
  snow: ['Whiteout', 'Glacier Pass', 'Northline']
};
var TIER_COLORS = ['', '#4dd8ff', '#ffb84d', '#ff4dd8']; // drift tiers 1..3

var cv = $('game'), ctx = cv.getContext('2d');
var DPR = 1, VW = 0, VH = 0;
function sizeCanvas() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW = window.innerWidth; VH = window.innerHeight;
  cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', sizeCanvas);
sizeCanvas();

// Prerender a whole track (ground + road + glow) to an offscreen canvas.
function prerenderTrack(track) {
  var st = THEME_STYLE[track.theme];
  var K = 2; // px per world unit
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, i;
  for (i = 0; i < track.N; i++) {
    var p = track.pts[i];
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  var m = track.width; // margin
  minX -= m; maxX += m; minY -= m; maxY += m;
  var W = Math.ceil((maxX - minX) * K), H = Math.ceil((maxY - minY) * K);
  var c = document.createElement('canvas');
  c.width = W; c.height = H;
  var g = c.getContext('2d');
  g.scale(K, K); g.translate(-minX, -minY);

  // ground
  g.fillStyle = st.ground; g.fillRect(minX, minY, maxX - minX, maxY - minY);
  // subtle ground texture: seeded dots
  var rng = ND.mulberry32(track.seed ^ 0x5bd1e995);
  g.fillStyle = 'rgba(255,255,255,0.025)';
  for (i = 0; i < 900; i++) {
    var dx = minX + rng() * (maxX - minX), dy = minY + rng() * (maxY - minY);
    g.fillRect(dx, dy, 1.6, 1.6);
  }

  function edgePath(side) {
    g.beginPath();
    for (var k = 0; k <= track.N; k++) {
      var j = k % track.N;
      var nx = -track.ty[j], ny = track.tx[j];
      var x = track.pts[j].x + nx * side * track.width / 2;
      var y = track.pts[j].y + ny * side * track.width / 2;
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
  }
  // road ribbon
  edgePath(1);
  g.fillStyle = st.road; g.fill();
  // inner shading: slightly lighter center ribbon
  g.save(); g.clip();
  g.beginPath();
  for (var k2 = 0; k2 <= track.N; k2++) {
    var j2 = k2 % track.N;
    if (k2 === 0) g.moveTo(track.pts[j2].x, track.pts[j2].y); else g.lineTo(track.pts[j2].x, track.pts[j2].y);
  }
  g.closePath();
  g.lineWidth = track.width * 0.55; g.strokeStyle = st.roadIn; g.stroke();
  g.restore();
  // center dashes
  g.beginPath();
  for (var k3 = 0; k3 < track.N; k3 += 6) {
    var a = track.pts[k3], b = track.pts[(k3 + 3) % track.N];
    g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
  }
  g.lineWidth = 0.9; g.strokeStyle = st.dash; g.setLineDash([]); g.stroke();
  // neon edges (one-time shadowBlur is fine: it's prerendered)
  [-1, 1].forEach(function (side) {
    g.beginPath();
    for (var k4 = 0; k4 <= track.N; k4++) {
      var j4 = k4 % track.N;
      var nx4 = -track.ty[j4], ny4 = track.tx[j4];
      var x4 = track.pts[j4].x + nx4 * side * track.width / 2;
      var y4 = track.pts[j4].y + ny4 * side * track.width / 2;
      if (k4 === 0) g.moveTo(x4, y4); else g.lineTo(x4, y4);
    }
    g.closePath();
    g.lineWidth = 1.6; g.strokeStyle = st.edge;
    g.shadowColor = st.edge; g.shadowBlur = 14; g.stroke();
    g.shadowBlur = 0;
  });
  // start line: checkers
  (function () {
    var j = 0, w2 = track.width / 2;
    var nx = -track.ty[j], ny = track.tx[j];
    var x0 = track.pts[j].x - nx * w2, y0 = track.pts[j].y - ny * w2;
    var x1 = track.pts[j].x + nx * w2, y1 = track.pts[j].y + ny * w2;
    g.save();
    g.translate((x0 + x1) / 2, (y0 + y1) / 2);
    g.rotate(Math.atan2(y1 - y0, x1 - x0));
    var rows = 2, cols = 10, cw = (w2 * 2) / cols, ch = 4;
    for (var r = 0; r < rows; r++) for (var cc = 0; cc < cols; cc++) {
      g.fillStyle = (r + cc) % 2 ? '#e8ecff' : '#14161f';
      g.fillRect(-w2 + cc * cw, -ch + r * ch, cw, ch);
    }
    g.restore();
  })();

  return { canvas: c, minX: minX, minY: minY, K: K, W: W, H: H };
}

function newSkidLayer(pre) {
  var c = document.createElement('canvas');
  c.width = pre.W; c.height = pre.H;
  return c;
}

/* ---------------- particles (pooled) ---------------- */

var parts = [];
for (var pi = 0; pi < 240; pi++) parts.push({ on: false });
var pNext = 0;
function spawnP(x, y, vx, vy, life, size, color, drag) {
  var p = parts[pNext]; pNext = (pNext + 1) % parts.length;
  p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.life = life; p.maxLife = life; p.size = size; p.color = color; p.drag = drag == null ? 2 : drag;
}
function stepParts(dt) {
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (!p.on) continue;
    p.life -= dt;
    if (p.life <= 0) { p.on = false; continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    var d = 1 - Math.min(1, p.drag * dt);
    p.vx *= d; p.vy *= d;
  }
}
function drawParts(g) {
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (!p.on) continue;
    var a = p.life / p.maxLife;
    g.globalAlpha = a * 0.85;
    g.fillStyle = p.color;
    g.beginPath(); g.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, 6.2832); g.fill();
  }
  g.globalAlpha = 1;
}

/* ---------------- camera ---------------- */

var cam = { x: 0, y: 0, s: 1 };
function camUpdate(px, py, vx, vy, speed) {
  var tx = px + vx * 0.42, ty = py + vy * 0.42;
  var k = 1 - Math.exp(-6 * (1 / 60));
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  var base = Math.min(VW, VH) / (VW < VH ? 300 : 265);
  var zoom = 1 / (1 + speed * 0.0016); // subtle pull-back with speed: FOV feel
  var ts = base * zoom;
  cam.s += (ts - cam.s) * (1 - Math.exp(-3 * (1 / 60)));
}
function camSnap(px, py) { cam.x = px; cam.y = py; }

/* ---------------- game state ---------------- */

var G = {
  screen: 'menu', mode: 'quick', cup: 0, raceIdx: 0,
  track: null, pre: null, skid: null, skidCtx: null,
  race: null, drivers: [], laps: 3,
  cupPoints: [], cupResults: [],
  paused: false, acc: 0, lastT: 0,
  ghost: null,           // {samples, ms} for TT
  rec: [], recLapTicks: [],
  dailyInfo: null, dailyBoard: null,
  shake: 0, countShown: -1,
  mmPre: null            // minimap prerender
};

function trackKey(cup, race) { return 'c' + cup + 'r' + race; }
function carSpec() {
  var base = ND.CARS.filter(function (c) { return c.id === S.carId; })[0] || ND.CARS[1];
  return ND.applyUpgrades(base, S.upg);
}
function trackName(cup, race) {
  var theme = ND.themeForCup(cup);
  return TRACK_NAMES[theme][race % 3];
}
function themeName(cup) { return ND.THEME_NAMES[ND.themeForCup(cup)]; }

function show(id) {
  ['menu', 'picker', 'garage', 'prerace', 'result', 'paused'].forEach(function (s) {
    $(s).classList.toggle('on', s === id);
  });
  G.screen = id;
  var racing = (id === null);
  $('hud').hidden = !racing;
  $('hud-speed').hidden = !racing;
  $('minimap').hidden = !racing;
  $('btn-drift').hidden = !racing;
  if (!racing) { $('countdown').hidden = true; }
}

/* ---------------- silent AI: race hype ---------------- */

var AI_URL = 'https://gamez-ai.chaoticutopia84.workers.dev/g';
var HYPE_FALLBACKS = [
  'Tonight the neon bites back.',
  'Three laps. Six egos. One winner.',
  'The city is watching. Drift like it.',
  'Grip is a suggestion. Send it.',
  'Your rivals are already talking trash.',
  'Brave on the brakes, braver on the throttle.',
  'The racing line is just a rumor here.'
];
function aiPost(body, cb) {
  var done = false;
  var timer = setTimeout(function () { fin(null); }, 7000);
  function fin(t) { if (done) return; done = true; clearTimeout(timer); cb(t); }
  try {
    fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (d) { fin(d && d.text ? String(d.text).slice(0, 90) : null); })
      .catch(function () { fin(null); });
  } catch (e) { fin(null); }
}
function raceHype(trackLabel, modeLabel, el) {
  el.textContent = HYPE_FALLBACKS[(Math.random() * HYPE_FALLBACKS.length) | 0];
  aiPost({ kind: 'racehype', game: 'neon-drift', ctx: { track: trackLabel, mode: modeLabel } }, function (t) {
    if (t) el.textContent = t; // worker kind may not exist yet — fallback stands
  });
}

/* ---------------- arcade: daily leaderboard ---------------- */

var ARCADE = 'https://gamez-arcade.chaoticutopia84.workers.dev';
function arcadeFetch(path, body, cb) {
  var done = false;
  var timer = setTimeout(function () { fin(new Error('timeout')); }, 12000);
  function fin(e, d) { if (done) return; done = true; clearTimeout(timer); cb(e, d); }
  try {
    fetch(ARCADE + path, body ?
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
      .then(function (r) { return r.json(); })
      .then(function (d) { fin(null, d); })
      .catch(function (e) { fin(e); });
  } catch (e) { fin(e); }
}
function todayStr() {
  var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function fetchDaily(cb) {
  arcadeFetch('/daily?game=neon-drift', null, function (err, d) {
    var ds = todayStr();
    var s = (d && d.seed != null) ? (d.seed >>> 0) : ND.dailySeed(ds);
    G.dailyInfo = { date: (d && d.date) || ds, seed: s };
    updateDailySub();
    if (cb) cb();
  });
}
function updateDailySub() {
  var sub = $('daily-sub');
  if (!sub || !G.dailyInfo) return;
  var best = S.best['daily-' + G.dailyInfo.date];
  sub.textContent = G.dailyInfo.date + ' · same track worldwide' +
    (best ? ' · your best ' + fmtMs(best) : '');
}
function fmtMs(ms) {
  var s = ms / 1000, m = Math.floor(s / 60);
  return m + ':' + (s - m * 60).toFixed(2).padStart(5, '0');
}
function renderBoard(top, rank, me, ms) {
  var box = $('arc-lb');
  var h = '';
  if (rank > 0) h += '<div class="arc-lb-rank">GLOBAL #' + rank + '!</div>';
  h += '<div class="arc-lb-title">🏆 DAILY FASTEST LAP</div>';
  if (top && top.length) {
    var medals = ['🥇', '🥈', '🥉'];
    h += top.slice(0, 5).map(function (e, i) {
      return '<div class="arc-lb-row' + (e.name === me ? ' me' : '') + '"><span>' +
        (medals[i] || (i + 1) + '.') + ' ' + esc(e.name) + '</span><b>' +
        fmtMs(Math.max(1, 1000000 - e.score)) + '</b></div>';
    }).join('');
  } else {
    h += '<div class="arc-lb-empty">Leaderboard offline — your ' + fmtMs(ms) + ' stands.</div>';
  }
  box.innerHTML = h;
}
function submitDaily(ms) {
  var box = $('arc-lb');
  if (!box || !G.dailyInfo) return;
  var board = 'daily-' + G.dailyInfo.date;
  var score = Math.max(1, 1000000 - Math.min(Math.floor(ms), 999999));
  var name = (localStorage.getItem('arcade_name') || '').trim();
  function go(n) {
    box.innerHTML = '<div class="arc-lb-empty">🏆 sending…</div>';
    arcadeFetch('/score', { game: 'neon-drift', board: board, name: n, score: score }, function (err, res) {
      if (res && res.top) renderBoard(res.top, res.rank, n, ms);
      else arcadeFetch('/scores?game=neon-drift&board=' + encodeURIComponent(board), null, function (e2, d2) {
        renderBoard(d2 && d2.top, 0, n, ms);
      });
    });
  }
  if (name) { go(name); return; }
  box.innerHTML = '<div class="arc-lb-form"><input id="arc-lb-name" maxlength="12" placeholder="YOUR NAME" autocomplete="off">' +
    '<button id="arc-lb-go" class="btn" type="button" style="width:auto;padding:10px 16px">SAVE</button></div>';
  $('arc-lb-go').onclick = function () {
    var v = $('arc-lb-name').value.trim().slice(0, 12);
    if (!v) return;
    try { localStorage.setItem('arcade_name', v); } catch (e) {}
    go(v);
  };
}

/* ---------------- menus ---------------- */

function refreshMenu() {
  var cupNames = [];
  for (var i = 0; i < 4; i++) cupNames.push(themeName(i));
  $('cups-sub').textContent = S.cupsUnlocked + '/4 cups · ' + S.tokens + ' tokens';
  $('garage-sub').textContent = ND.CARS.filter(function (c) { return c.id === S.carId; })[0].name +
    ' · ' + S.tokens + ' tokens';
  var best = [];
  for (var k in S.best) best.push(k);
  $('menu-best').textContent = best.length ?
    best.length + ' tracks conquered · ' + S.tokens + ' tokens in the vault' :
    'No races yet — the neon awaits.';
  $('btn-assist').textContent = 'steer assist: ' + (S.assist ? 'on' : 'off');
  $('btn-assist').classList.toggle('on', S.assist);
  $('btn-haptic').textContent = 'haptics: ' + (S.haptic ? 'on' : 'off');
  $('btn-haptic').classList.toggle('on', !!S.haptic);
  raceHype('menu', 'menu', $('menu-hype'));
}

var pickCtx = { mode: 'quick', cup: 0 };
function openPicker(mode, cup) {
  pickCtx = { mode: mode, cup: cup == null ? 0 : cup };
  var title = $('picker-title'), sub = $('picker-sub'), grid = $('picker-grid');
  grid.innerHTML = '';
  if (mode === 'cup') {
    title.textContent = 'Pick a cup';
    sub.textContent = '3 races each · top cup score takes the bonus';
    var costs = [0, 20, 50, 90];
    for (var c = 0; c < 4; c++) {
      (function (cc) {
        var locked = cc >= S.cupsUnlocked;
        var d = document.createElement('div');
        d.className = 'cell' + (locked ? ' locked' : '');
        d.innerHTML = '<b>' + esc(themeName(cc)) + ' Cup</b><small>' +
          (locked ? '🔒 ' + costs[cc] + ' tokens' : (S.cupWins[cc] ? '🏆 won' : '3 races')) + '</small>';
        if (!locked) d.onclick = function () { AU.init(); openPrerace('cup', cc, 0); };
        grid.appendChild(d);
      })(c);
    }
  } else {
    title.textContent = mode === 'tt' ? 'Time trial — pick a track' : 'Quick race — pick a track';
    sub.textContent = mode === 'tt' ? 'Chase your ghost. Beat the dev.' : '3 laps · 5 rivals · no mercy, no rubber-bands';
    for (var c2 = 0; c2 < 4; c2++) {
      for (var r = 0; r < 3; r++) {
        (function (cc, rr) {
          var locked = cc >= S.cupsUnlocked;
          var key = trackKey(cc, rr);
          var d = document.createElement('div');
          d.className = 'cell' + (locked ? ' locked' : '');
          d.innerHTML = '<b>' + esc(trackName(cc, rr)) + '</b><small>' +
            (locked ? '🔒 cup ' + (cc + 1) : (S.best[key] ? fmtMs(S.best[key]) : esc(themeName(cc)))) + '</small>';
          if (!locked) d.onclick = function () { AU.init(); openPrerace(mode, cc, rr); };
          grid.appendChild(d);
        })(c2, r);
      }
    }
  }
  show('picker');
}

/* ---------------- garage ---------------- */

var PAINTS = ['#4dd8ff', '#ff4dd8', '#7dff6e', '#ffd94d', '#ff5f6d', '#b06bff', '#f2f4ff'];
var GLOWS_ALL = ['#4dd8ff', '#ff4dd8', '#7dff6e', '#ffb84d', '#b06bff'];
var GLOW_CUP = [null, '#ff4dd8', '#7dff6e', '#ffb84d', '#b06bff']; // cup index -> unlock
var UPG_COST = [15, 30, 60];
var UPG_NAMES = { engine: 'Engine', tires: 'Tires', drift: 'Drift kit' };
var UPG_BLURB = { engine: '+5% top speed / tier', tires: '+10% grip / tier', drift: 'faster charge, looser slide' };

function openGarage() {
  $('garage-tokens').textContent = S.tokens;
  var cc = $('car-cards'); cc.innerHTML = '';
  ND.CARS.forEach(function (car) {
    var d = document.createElement('div');
    d.className = 'cell' + (S.carId === car.id ? ' sel' : '');
    var spec = ND.applyUpgrades(car, S.upg);
    d.innerHTML = '<div class="sw">🏎️</div><b>' + esc(car.name) + '</b><small>' +
      esc(car.blurb) + '<br>top ' + Math.round(spec.top) + ' · drift ' +
      (car.id === 'drift' ? '★★★' : car.id === 'balanced' ? '★★☆' : '★☆☆') + '</small>';
    d.onclick = function () { S.carId = car.id; save(); AU.beep(700, 0.1, 'triangle', 0.12); openGarage(); };
    cc.appendChild(d);
  });
  var pr = $('paint-row'); pr.innerHTML = '';
  PAINTS.forEach(function (p) {
    var s = document.createElement('div');
    s.className = 'sw' + (S.paint === p ? ' sel' : '');
    s.style.background = p;
    s.onclick = function () { S.paint = p; save(); openGarage(); };
    pr.appendChild(s);
  });
  var gr = $('glow-row'); gr.innerHTML = '';
  GLOWS_ALL.forEach(function (p) {
    var unlocked = S.glows.indexOf(p) >= 0;
    var s = document.createElement('div');
    s.className = 'sw' + (S.glow === p ? ' sel' : '') + (unlocked ? '' : ' locked');
    s.style.background = p;
    s.title = unlocked ? p : 'win a cup to unlock';
    if (unlocked) s.onclick = function () { S.glow = p; save(); openGarage(); };
    gr.appendChild(s);
  });
  var ur = $('upg-rows'); ur.innerHTML = '';
  Object.keys(UPG_NAMES).forEach(function (k) {
    var t = S.upg[k];
    var d = document.createElement('div');
    d.className = 'upg';
    var btn = t >= 3 ? '<button disabled>MAX</button>' :
      '<button data-k="' + k + '"' + (S.tokens < UPG_COST[t] ? ' disabled' : '') + '>' + UPG_COST[t] + ' ◈</button>';
    d.innerHTML = '<div><b>' + UPG_NAMES[k] + '</b> <span class="pips">' +
      '●'.repeat(t) + '○'.repeat(3 - t) + '</span><br><small style="color:var(--dim)">' +
      UPG_BLURB[k] + '</small></div>' + btn;
    ur.appendChild(d);
  });
  ur.querySelectorAll('button[data-k]').forEach(function (b) {
    b.onclick = function () {
      var k = b.getAttribute('data-k'), t = S.upg[k];
      if (t < 3 && S.tokens >= UPG_COST[t]) {
        S.tokens -= UPG_COST[t]; S.upg[k]++;
        save(); AU.chime(); openGarage();
      }
    };
  });
  show('garage');
}

/* ---------------- pre-race ---------------- */

var DIFFS = [
  { name: 'Cruiser', skill: 0.80 },
  { name: 'Racer', skill: 0.90 },
  { name: 'Menace', skill: 0.97 }
];

function openPrerace(mode, cup, race) {
  G.mode = mode; G.cup = cup; G.raceIdx = race;
  var theme = ND.themeForCup(cup);
  var label = mode === 'daily' ? 'Daily Drift' :
    mode === 'cup' ? themeName(cup) + ' Cup' : trackName(cup, race);
  $('pre-name').textContent = label;
  $('pre-sub').textContent = mode === 'cup' ?
    'Race ' + (race + 1) + ' of 3 · ' + trackName(cup, race) :
    themeName(cup) + ' · ' + (mode === 'tt' ? 'time trial' : mode === 'daily' ? 'one shot worldwide' : '3 laps · 5 rivals');
  raceHype(label, mode, $('pre-hype'));

  // grid: player + 5 rivals (or solo for TT)
  var gl = $('grid-list'); gl.innerHTML = '';
  function row(color, name, sub, me) {
    var d = document.createElement('div');
    d.className = 'gr' + (me ? ' me' : '');
    d.innerHTML = '<span class="dot" style="background:' + color + '"></span><span><b>' +
      esc(name) + '</b> <span class="tn">' + esc(sub) + '</span></span>';
    gl.appendChild(d);
  }
  row(S.paint, 'YOU', ND.CARS.filter(function (c) { return c.id === S.carId; })[0].name, true);
  if (mode !== 'tt') {
    ND.RIVALS.forEach(function (r) { row(r.color, r.name, '“' + r.taunt + '”', false); });
  } else {
    row('#8b93b8', 'GHOST', S.ghosts[trackKey(cup, race)] ? 'your best lap' : 'dev driver “Pip” · beat ' + fmtMs(devGhostMs(cup, race)), false);
  }
  document.querySelectorAll('#diff-row .diff').forEach(function (b) {
    b.classList.toggle('on', +b.getAttribute('data-d') === S.difficulty);
    b.style.display = mode === 'tt' ? 'none' : '';
  });
  $('diff-row').style.display = mode === 'tt' ? 'none' : '';
  show('prerace');
}

function devGhostMs(cup, race) {
  // cached dev ghost time; computed lazily headless
  var key = trackKey(cup, race) + ':dev';
  if (!G._devTimes) G._devTimes = {};
  if (!G._devTimes[key]) {
    var track = getTrack(cup, race);
    var spec = carSpec();
    var tape = ND.devGhostInputs(track, spec, 1, 0.93);
    // time the tape: replay and read finish
    var drivers = [{ name: 'DEV', color: '#fff', isPlayer: true, skill: 0.93, spec: spec }];
    var rc = ND.newRace(track, drivers, 1, {});
    rc.state = 'run';
    var i = 0;
    while (rc.state !== 'done' && i < tape.length) {
      ND.stepRace(rc, [{ steer: tape[i][0], drift: !!tape[i][1] }], ND.DT); i++;
    }
    G._devTimes[key] = { ms: rc.cars[0].finishT * 1000, tape: tape };
  }
  return G._devTimes[key].ms;
}

var trackCache = {};
function getTrack(cup, race) {
  var key = trackKey(cup, race);
  if (!trackCache[key]) {
    trackCache[key] = ND.genTrack(ND.trackSeed(cup, race), {
      theme: ND.themeForCup(cup),
      twitch: 0.9 + cup * 0.25,
      width: 28 - cup * 1.5
    });
  }
  return trackCache[key];
}

/* ---------------- race setup ---------------- */

function buildDrivers(mode, cup) {
  var spec = carSpec();
  var d = [{ name: 'YOU', color: S.paint, isPlayer: true, skill: 1, spec: spec }];
  if (mode !== 'tt') {
    var base = DIFFS[S.difficulty].skill;
    ND.RIVALS.forEach(function (r, i) {
      d.push({
        name: r.name, color: r.color, isPlayer: false,
        skill: base + ((i * 37) % 5) * 0.008, spec: spec,
        banter: r
      });
    });
  }
  return d;
}

function startRace(mode, cup, raceIdx) {
  var track = getTrack(cup, raceIdx);
  var drivers = buildDrivers(mode, cup);
  var laps = 3;
  G.track = track; G.drivers = drivers; G.laps = laps;
  G.mode = mode; G.cup = cup; G.raceIdx = raceIdx;
  G.pre = prerenderTrack(track);
  G.skid = newSkidLayer(G.pre); G.skidCtx = G.skid.getContext('2d');
  G.skidCtx.scale(G.pre.K, G.pre.K); G.skidCtx.translate(-G.pre.minX, -G.pre.minY);
  G.mmPre = prerenderMinimap(track);
  G.nameSprites = makeNameSprites(drivers);
  G.race = ND.newRace(track, drivers, laps, {});
  G.acc = 0; G.paused = false; G.shake = 0; G.countShown = -1;
  G.lastTier = 0; // drift-tier haptic tracker resets each race
  G.resultsShown = false;
  G.rec = []; G.recLapTicks = []; G.tick = 0;
  G.ghost = null; G.ghostDev = false;
  if (mode === 'tt') {
    var key = trackKey(cup, raceIdx);
    if (S.ghosts[key] && S.ghosts[key].s && S.ghosts[key].s.length > 50) { G.ghost = S.ghosts[key]; }
    else {
      var dg = devGhostTape(cup, raceIdx);
      G.ghost = { s: dg.samples, ms: dg.ms }; G.ghostDev = true;
    }
  }
  var p = G.race.cars[0];
  camSnap(p.x, p.y);
  cam.s = Math.min(VW, VH) / (VW < VH ? 300 : 265);
  show(null);
  $('countdown').hidden = false;
  AU.init(); AU.music(true, false);
  G.lastT = performance.now();
}

function devGhostTape(cup, race) {
  var key = trackKey(cup, race) + ':dev';
  var e = (G._devTimes || {})[key];
  if (e && e.samples) return e;
  var track = getTrack(cup, race), spec = carSpec();
  var tape = ND.devGhostInputs(track, spec, 1, 0.93);
  var samples = ND.replay(track,
    [{ name: 'DEV', color: '#fff', isPlayer: true, skill: 0.93, spec: spec }], 1, tape)
    .filter(function (_, i) { return i % 4 === 0; })
    .map(function (s) { return [+s[0].toFixed(1), +s[1].toFixed(1), +s[2].toFixed(2)]; });
  var ms = devGhostMs(cup, race);
  var out = { samples: samples, ms: ms };
  if (!G._devTimes) G._devTimes = {};
  G._devTimes[key] = Object.assign(G._devTimes[key] || {}, out);
  return out;
}

/* ---------------- input ---------------- */

var IN = { steer: 0, drift: false };
var steerPtr = null; // {id, anchorX}
var keyL = false, keyR = false, keyD = false;

cv.addEventListener('pointerdown', function (e) {
  AU.init();
  if (G.screen !== null || G.paused) return;
  if (steerPtr) return;
  steerPtr = { id: e.pointerId, anchorX: e.clientX };
  cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
  e.preventDefault();
});
cv.addEventListener('pointermove', function (e) {
  if (steerPtr && e.pointerId === steerPtr.id) {
    IN.steer = clamp((e.clientX - steerPtr.anchorX) / 90, -1, 1);
  }
});
function endSteer(e) {
  if (steerPtr && e.pointerId === steerPtr.id) { steerPtr = null; IN.steer = 0; }
}
cv.addEventListener('pointerup', endSteer);
cv.addEventListener('pointercancel', endSteer);

var bd = $('btn-drift');
bd.addEventListener('pointerdown', function (e) {
  e.preventDefault(); e.stopPropagation();
  AU.init(); IN.drift = true; bd.classList.add('held');
  HZ.play(HZ.light); // drift press: the first beat of the drift-coupled vocabulary
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
  bd.addEventListener(ev, function (e) {
    e.preventDefault(); IN.drift = false; bd.classList.remove('held');
  });
});

window.addEventListener('keydown', function (e) {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keyL = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keyR = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Space') { keyD = true; e.preventDefault(); }
  if (e.code === 'Escape' && G.screen === null) togglePause();
});
window.addEventListener('keyup', function (e) {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keyL = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keyR = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Space') keyD = false;
});
window.addEventListener('blur', function () {
  keyL = keyR = keyD = false; IN.steer = 0; IN.drift = false;
  steerPtr = null; bd.classList.remove('held');
});
document.addEventListener('visibilitychange', function () {
  if (document.hidden && G.screen === null && !G.paused) togglePause();
});

function playerInput() {
  var steer = IN.steer, drift = IN.drift;
  if (keyL) steer = -1; if (keyR) steer = 1;
  if (keyD) drift = true;
  if (S.assist && G.race) {
    var ai = ND.aiInput(G.track, G.race.cars[0], 0.95);
    steer = steer * 0.45 + ai.steer * 0.55;
  }
  return { steer: clamp(steer, -1, 1), drift: drift };
}

function togglePause() {
  if (G.screen !== null && G.screen !== 'paused') return;
  G.paused = !G.paused;
  if (G.paused) { show('paused'); AU.engineOff(); AU.music(false); }
  else { show(null); G.lastT = performance.now(); AU.music(true, false); }
}

/* ---------------- sim tick ---------------- */

var toastTimer = null;
function toast(html, ms) {
  var t = $('toast');
  t.innerHTML = html; t.hidden = false; t.style.opacity = 1;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    t.style.opacity = 0;
    setTimeout(function () { t.hidden = true; }, 350);
  }, ms || 2200);
}

function banter(kind) {
  // kind: 'overtake' (player passed someone) | 'overtaken'
  var rivals = G.drivers.filter(function (d) { return !d.isPlayer && d.banter; });
  if (!rivals.length) return;
  var r = rivals[(Math.random() * rivals.length) | 0];
  var lines = kind === 'overtake' ? r.banter.pass : r.banter.passed;
  toast('<span class="who">' + esc(r.name) + ':</span> ' + esc(lines[(Math.random() * lines.length) | 0]));
}

function tickSim() {
  var race = G.race;
  var inp = playerInput();
  ND.stepRace(race, [inp], ND.DT);
  G.tick++;

  // ghost recording (every 4th tick)
  if (G.tick % 4 === 0) {
    var c0 = race.cars[0];
    G.rec.push([+c0.x.toFixed(1), +c0.y.toFixed(1), +c0.th.toFixed(2)]);
  }

  var evs = race.ev;
  for (var i = 0; i < evs.length; i++) {
    var e = evs[i];
    if (e === 'go') { $('countdown').textContent = 'GO!'; AU.countBeep(0); G.shake = 4; HZ.play(HZ.medium); }
    else if (e === 'done') { onRaceDone(); }
    else if (e.car === 0) handlePlayerEvent(e.type);
  }

  // countdown beeps
  if (race.state === 'countdown') {
    var n = Math.ceil(race.countT - 0.4);
    if (n !== G.countShown && n >= 1 && n <= 3) {
      G.countShown = n;
      $('countdown').textContent = n;
      AU.countBeep(1);
    }
  } else if (G.countShown !== 99) {
    if ($('countdown').textContent !== 'GO!') $('countdown').hidden = true;
    else setTimeout(function () { $('countdown').hidden = true; }, 700);
    G.countShown = 99;
  }

  // drift-tier haptics: the buzz rises as sparks build blue -> orange -> pink
  var pc0 = race.cars[0];
  if (pc0.tier > (G.lastTier | 0)) HZ.play(HZ.tierBuzz[pc0.tier]);
  G.lastTier = pc0.tier;

  // audio + camera
  var pc = race.cars[0];
  var spd = ND.speedOf(pc);
  AU.engine(spd / pc.spec.top, pc.drifting, pc.charge);

  // drift sparks + smoke, skid marks
  if (pc.drifting && spd > 10) {
    var fx = Math.cos(pc.th), fy = Math.sin(pc.th);
    var px = -fy, py = fx;
    for (var w = -1; w <= 1; w += 2) {
      var wx = pc.x - fx * 4 + px * 2.4 * w, wy = pc.y - fy * 4 + py * 2.4 * w;
      if (pc.tier > 0 && Math.random() < 0.8) {
        spawnP(wx, wy, -pc.vx * 0.15 + (Math.random() - 0.5) * 14,
          -pc.vy * 0.15 + (Math.random() - 0.5) * 14,
          0.35, 1.6, TIER_COLORS[pc.tier], 3);
      }
      if (Math.random() < 0.35) {
        spawnP(wx, wy, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8 - 4,
          0.7, 3.2, 'rgba(160,160,180,0.5)', 1.5);
      }
      // skid marks on the skid layer
      var g2 = G.skidCtx;
      g2.strokeStyle = 'rgba(8,8,12,0.4)'; g2.lineWidth = 1.1;
      g2.beginPath();
      g2.moveTo(wx + pc.vx * 0.03, wy + pc.vy * 0.03);
      g2.lineTo(wx, wy);
      g2.stroke();
    }
  }
  // boost flames
  if (pc.boostT > 0 && Math.random() < 0.7) {
    var bx = pc.x - Math.cos(pc.th) * 6, by = pc.y - Math.sin(pc.th) * 6;
    spawnP(bx, by, -Math.cos(pc.th) * 20 + (Math.random() - 0.5) * 10,
      -Math.sin(pc.th) * 20 + (Math.random() - 0.5) * 10, 0.3, 2.4, '#ffb84d', 2);
  }
  if (HZ.reduced) G.shake = 0; // prefers-reduced-motion: shake is pure juice
  else if (G.shake > 0) G.shake *= Math.exp(-6 * ND.DT);
}

function handlePlayerEvent(type) {
  if (type === 'wall') {
    AU.thump(); G.shake = 7; HZ.play(HZ.warning);
    var pc = G.race.cars[0];
    for (var i = 0; i < 10; i++) {
      spawnP(pc.x, pc.y, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40,
        0.5, 2.6, 'rgba(180,180,200,0.6)', 2.5);
    }
  } else if (type === 'boost1' || type === 'boost2' || type === 'boost3') {
    AU.whoosh();
    var bt = +type.slice(5); // boost tier 1..3, matches charge tier
    HZ.play(HZ.boostBuzz[bt]);
    if (type === 'boost3') AU.chime();
    G.shake = Math.max(G.shake, 3);
  } else if (type === 'lap') {
    AU.beep(980, 0.16, 'triangle', 0.14);
    HZ.play(HZ.select);
    G.recLapTicks.push(G.tick);
    var pc2 = G.race.cars[0];
    if (pc2.lap < G.laps) toast('LAP ' + (pc2.lap + 1) + '/' + G.laps, 1400);
  } else if (type === 'finish') {
    AU.chime(); HZ.play(HZ.success);
  } else if (type === 'overtake') {
    banter('overtake'); AU.beep(1200, 0.12, 'triangle', 0.1);
  } else if (type === 'overtaken') {
    banter('overtaken');
  }
}

/* ---------------- rendering ---------------- */

function makeNameSprites(drivers) {
  return drivers.map(function (d) {
    if (d.isPlayer) return null;
    var c = document.createElement('canvas');
    c.width = 128; c.height = 28;
    var g = c.getContext('2d');
    g.font = '700 20px Rajdhani, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillText(d.name.toUpperCase(), 65, 21);
    g.fillStyle = '#fff';
    g.fillText(d.name.toUpperCase(), 64, 20);
    return c;
  });
}

function drawCar(g, car, color, glow, ghost) {
  g.save();
  g.translate(car.x, car.y);
  g.rotate(car.th);
  if (ghost) g.globalAlpha = 0.42;
  // underglow
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = ghost ? 0.18 : 0.5;
  g.fillStyle = glow;
  g.beginPath(); g.ellipse(0, 0, 9.5, 6.5, 0, 0, 6.2832); g.fill();
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = ghost ? 0.42 : 1;
  // body
  g.fillStyle = '#0c0f1c';
  roundRect(g, -7.4, -4.4, 14.8, 8.8, 2.6); g.fill();
  g.fillStyle = color;
  roundRect(g, -6.6, -3.6, 13.2, 7.2, 2.2); g.fill();
  // cockpit
  g.fillStyle = 'rgba(10,14,28,0.9)';
  roundRect(g, -1.5, -2.4, 5.2, 4.8, 1.6); g.fill();
  // nose stripe
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillRect(4.4, -0.9, 2.2, 1.8);
  g.restore();
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function prerenderMinimap(track) {
  var c = document.createElement('canvas');
  c.width = 132; c.height = 132;
  var g = c.getContext('2d');
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (var i = 0; i < track.N; i++) {
    var p = track.pts[i];
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  var s = Math.min(124 / (maxX - minX), 124 / (maxY - minY));
  var ox = (132 - (maxX - minX) * s) / 2, oy = (132 - (maxY - minY) * s) / 2;
  g.strokeStyle = '#3a4a7a'; g.lineWidth = 5; g.lineJoin = 'round';
  g.beginPath();
  for (var k = 0; k <= track.N; k += 3) {
    var j = k % track.N;
    var x = ox + (track.pts[j].x - minX) * s, y = oy + (track.pts[j].y - minY) * s;
    if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath(); g.stroke();
  return { canvas: c, minX: minX, minY: minY, s: s, ox: ox, oy: oy };
}

function render(dt) {
  var race = G.race, track = G.track;
  var pc = race.cars[0];
  var spd = ND.speedOf(pc);
  camUpdate(pc.x, pc.y, pc.vx, pc.vy, spd);

  ctx.clearRect(0, 0, VW, VH);
  ctx.fillStyle = THEME_STYLE[track.theme].bg;
  ctx.fillRect(0, 0, VW, VH);

  var shx = (Math.random() - 0.5) * G.shake, shy = (Math.random() - 0.5) * G.shake;
  ctx.save();
  ctx.translate(VW / 2 + shx, VH / 2 + shy);
  ctx.scale(cam.s, cam.s);
  ctx.translate(-cam.x, -cam.y);

  // track + skids
  var pre = G.pre;
  ctx.drawImage(pre.canvas, pre.minX, pre.minY, (pre.W / pre.K), (pre.H / pre.K));
  ctx.drawImage(G.skid, pre.minX, pre.minY, (pre.W / pre.K), (pre.H / pre.K));

  // ghost (time trial)
  if (G.ghost && race.state === 'run') {
    var lapStart = G.recLapTicks.length ? G.recLapTicks[G.recLapTicks.length - 1] : 0;
    var gi = ((G.tick - lapStart) / 4) | 0;
    if (gi >= 0 && gi < G.ghost.s.length) {
      var gs = G.ghost.s[gi];
      drawCar(ctx, { x: gs[0], y: gs[1], th: gs[2] }, '#aab4dd', '#aab4dd', true);
    }
  }

  // cars (rivals first, player last)
  var order = ND.positions(race).slice().reverse();
  for (var i = 0; i < order.length; i++) {
    var car = race.cars[order[i]];
    var d = car.driver;
    drawCar(ctx, car, d.color, d.isPlayer ? S.glow : d.color, false);
    if (!d.isPlayer && G.nameSprites[order[i]]) {
      var ns = G.nameSprites[order[i]];
      ctx.drawImage(ns, car.x - 16, car.y - 22, 32, 7);
    }
  }
  // player marker
  ctx.save();
  ctx.translate(pc.x, pc.y); ctx.rotate(pc.th);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, -11); ctx.lineTo(-4, -16); ctx.lineTo(4, -16); ctx.closePath(); ctx.fill();
  ctx.restore();

  // drift charge arc around player
  if (pc.drifting && pc.charge > 0.02) {
    var frac = clamp(pc.charge / 1.7, 0, 1);
    ctx.strokeStyle = TIER_COLORS[pc.tier] || '#4dd8ff';
    ctx.lineWidth = 2.2 / cam.s + 1.2;
    ctx.beginPath();
    ctx.arc(pc.x, pc.y, 13, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
  }

  drawParts(ctx);
  ctx.restore();

  // speed vignette at high speed
  var vr = spd / (pc.spec.top * 1.2);
  if (vr > 0.75) {
    var vg = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.42, VW / 2, VH / 2, Math.max(VW, VH) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(77,216,255,' + ((vr - 0.75) * 0.5).toFixed(3) + ')');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, VW, VH);
  }
}

/* ---------------- HUD ---------------- */

var mmCtx = null;
function hud() {
  var race = G.race, pc = race.cars[0];
  var pos = ND.playerPos(race);
  var lapShow = Math.min(pc.lap + 1, G.laps);
  $('hud-pos').textContent = 'P' + pos + '/' + race.cars.length + ' · LAP ' + lapShow + '/' + G.laps;
  $('hud-speed').textContent = Math.round(ND.speedOf(pc) * 2.2);

  // delta (time trial, progress-based)
  var dd = $('hud-delta');
  if (G.mode === 'tt' && G.ghost) {
    var progInLap = ((pc.si + (pc.started ? 0 : 0)) % G.track.N + G.track.N) % G.track.N;
    var expected = G.ghost.ms * (progInLap / G.track.N);
    var lapStartT = G.recLapTicks.length ?
      (G.recLapTicks[G.recLapTicks.length - 1] * ND.DT * 1000) : 0;
    var cur = race.t * 1000 - lapStartT;
    var delta = cur - expected;
    dd.textContent = (delta >= 0 ? '+' : '−') + Math.abs(delta / 1000).toFixed(1) + 's';
    dd.className = delta <= 0 ? 'up' : 'down';
  } else {
    dd.textContent = '';
    dd.className = '';
  }

  // minimap
  var mm = $('minimap');
  if (!mmCtx) mmCtx = mm.getContext('2d');
  var mp = G.mmPre;
  mmCtx.clearRect(0, 0, 132, 132);
  mmCtx.drawImage(mp.canvas, 0, 0);
  for (var i = 0; i < race.cars.length; i++) {
    var c = race.cars[i];
    var x = mp.ox + (c.x - mp.minX) * mp.s, y = mp.oy + (c.y - mp.minY) * mp.s;
    mmCtx.fillStyle = c.driver.isPlayer ? '#ffffff' : c.driver.color;
    mmCtx.beginPath(); mmCtx.arc(x, y, c.driver.isPlayer ? 4 : 3, 0, 6.2832); mmCtx.fill();
  }
}

/* ---------------- results ---------------- */

var RACE_POINTS = [9, 6, 4, 3, 2, 1];
var RACE_TOKENS = [10, 7, 5, 3, 2, 1];

function onRaceDone() {
  if (G.resultsShown) return;
  G.resultsShown = true;
  AU.engineOff();
  setTimeout(showResults, 1400);
}

function bestKey() {
  return G.mode === 'daily' ? 'daily-' + (G.dailyInfo ? G.dailyInfo.date : todayStr()) : trackKey(G.cup, G.raceIdx);
}

function showResults() {
  var race = G.race, pc = race.cars[0];
  var order = ND.positions(race);
  var pos = order.indexOf(0) + 1;
  var ms = pc.finished ? pc.finishT * 1000 : race.t * 1000;
  var key = bestKey();
  var newBest = !S.best[key] || ms < S.best[key];
  var tokens = 0;

  // ghost: best clean lap samples (skip lap 1 — it includes the grid run)
  if (newBest) {
    S.best[key] = Math.round(ms);
    var ticks = G.recLapTicks.concat([G.tick]);
    var bestSeg = null;
    for (var li = 1; li < ticks.length - 1; li++) {
      var seg = { a: ticks[li], b: ticks[li + 1] };
      if (!bestSeg || (seg.b - seg.a) < (bestSeg.b - bestSeg.a)) bestSeg = seg;
    }
    if (bestSeg && G.rec.length > 60) {
      var s0 = Math.floor(bestSeg.a / 4), s1 = Math.ceil(bestSeg.b / 4);
      S.ghosts[key] = { s: G.rec.slice(s0, s1), ms: Math.round((bestSeg.b - bestSeg.a) * 1000 / 60) };
    }
  }

  var title = 'Race complete', sub = '', rows = '';
  function row(l, v, me) {
    return '<div class="rr' + (me ? ' me' : '') + '"><span>' + l + '</span><b>' + v + '</b></div>';
  }

  if (G.mode === 'tt') {
    title = 'Time Trial';
    var ghost = G.ghost;
    var d = ghost ? ms - ghost.ms : 0;
    sub = fmtMs(ms) + (G.ghostDev ? ' · dev ghost ' + fmtMs(ghost.ms) : ' · your ghost ' + fmtMs(ghost.ms));
    rows += row('Your time', fmtMs(ms), true);
    rows += row('Best lap', fmtMs((pc.bestLap || 0) * 1000), false);
    rows += row(ghost ? (G.ghostDev ? 'vs dev' : 'vs your best') : 'no ghost yet',
      (d <= 0 ? '−' : '+') + Math.abs(d / 1000).toFixed(2) + 's', true);
    if (newBest) { tokens = 3; rows += row('New best! +3 ◈', '', true); }
  } else if (G.mode === 'daily') {
    title = 'Daily Drift';
    sub = fmtMs(ms) + ' · ' + (G.dailyInfo ? G.dailyInfo.date : '');
    rows += row('Your time', fmtMs(ms), true);
    rows += row('Best lap', fmtMs((pc.bestLap || 0) * 1000), false);
    if (newBest) { tokens = 3; rows += row('Daily best! +3 ◈', '', true); }
  } else {
    // quick or cup: full standings
    title = G.mode === 'cup' ? themeName(G.cup) + ' Cup — R' + (G.raceIdx + 1) : 'Quick Race';
    sub = trackName(G.cup, G.raceIdx) + ' · ' + fmtMs(ms);
    for (var i = 0; i < order.length; i++) {
      var c = race.cars[order[i]];
      var nm = c.driver.isPlayer ? 'YOU' : c.driver.name;
      var tm = c.finished ? fmtMs(c.finishT * 1000) : '—';
      rows += row('P' + (i + 1) + ' ' + esc(nm), tm, order[i] === 0);
    }
    tokens = RACE_TOKENS[pos - 1] || 1;
    rows += row('Tokens +' + tokens + ' ◈', '', true);
    if (G.mode === 'cup') {
      for (var pi = 0; pi < order.length; pi++) G.cupPoints[order[pi]] += RACE_POINTS[pi];
    }
  }

  S.tokens += tokens;
  save();

  $('result-pos').textContent = G.mode === 'tt' ? (newBest ? '★ NEW BEST' : '🏁') : 'P' + pos;
  $('result-title').textContent = title;
  $('result-sub').textContent = sub;
  $('result-rows').innerHTML = rows;
  $('arc-lb').innerHTML = '';

  var rb = $('btn-rematch');
  if (G.mode === 'cup' && G.raceIdx < 2) {
    rb.textContent = 'Next race →';
    G.resultAction = function () { openPrerace('cup', G.cup, G.raceIdx + 1); };
  } else if (G.mode === 'cup') {
    rb.textContent = 'Cup results →';
    G.resultAction = showCupFinal;
  } else {
    rb.textContent = 'Rematch';
    G.resultAction = function () {
      if (G.mode === 'daily') startDaily();
      else startRace(G.mode, G.cup, G.raceIdx);
    };
  }

  show('result');
  AU.music(false);
  if (G.mode === 'daily') submitDaily(ms);
}

function showCupFinal() {
  var order = [], i;
  for (i = 0; i < 6; i++) order.push(i);
  var pts = G.cupPoints;
  order.sort(function (a, b) { return pts[b] - pts[a]; });
  var playerCupPos = order.indexOf(0) + 1;
  var bonus = [15, 10, 6][playerCupPos - 1] || 0;
  S.tokens += bonus;

  var title = themeName(G.cup) + ' Cup — final';
  var rows = '';
  for (i = 0; i < 6; i++) {
    var d = G.drivers[order[i]];
    rows += '<div class="rr' + (order[i] === 0 ? ' me' : '') + '"><span>P' + (i + 1) + ' ' +
      esc(d.isPlayer ? 'YOU' : d.name) + '</span><b>' + pts[order[i]] + ' pts</b></div>';
  }
  var sub = '';
  if (playerCupPos === 1) {
    S.cupWins[G.cup] = true;
    var ng = ['#ff4dd8', '#7dff6e', '#ffb84d', '#b06bff'][G.cup];
    if (S.glows.indexOf(ng) < 0) { S.glows.push(ng); sub = 'New underglow unlocked: '; }
    sub += '🏆 ' + themeName(G.cup) + ' Cup champion! +' + bonus + ' ◈';
    if (G.cup + 1 < 4 && S.cupsUnlocked <= G.cup + 1) S.cupsUnlocked = G.cup + 2;
  } else {
    sub = 'P' + playerCupPos + ' in the cup · +' + bonus + ' ◈ — run it back?';
  }
  save();
  $('result-pos').textContent = playerCupPos === 1 ? '🏆' : 'P' + playerCupPos;
  $('result-title').textContent = title;
  $('result-sub').textContent = sub;
  $('result-rows').innerHTML = rows;
  $('arc-lb').innerHTML = '';
  $('btn-rematch').textContent = 'Rematch cup';
  G.resultAction = function () { openPrerace('cup', G.cup, 0); };
  show('result');
}

/* ---------------- daily ---------------- */

function startDaily() {
  fetchDaily(function () {
    var dt = ND.dailyTrack(G.dailyInfo.date);
    openPrerace('daily', dt.cup, dt.race);
  });
}

/* ---------------- wiring & boot ---------------- */

function quitToMenu() {
  G.race = null; G.paused = false;
  AU.engineOff(); AU.music(true, true);
  refreshMenu(); show('menu');
}

function wire() {
  $('btn-quick').onclick = function () { AU.init(); openPicker('quick'); };
  $('btn-cups').onclick = function () { AU.init(); openPicker('cup'); };
  $('btn-tt').onclick = function () { AU.init(); openPicker('tt'); };
  $('btn-daily').onclick = function () { AU.init(); startDaily(); };
  $('btn-garage').onclick = function () { AU.init(); openGarage(); };
  $('btn-how').onclick = function () {
    var h = $('howto');
    h.hidden = !h.hidden;
  };
  $('btn-mute').onclick = function () { AU.init(); AU.setMute(!S.mute); };
  $('btn-assist').onclick = function () {
    S.assist = !S.assist; save(); refreshMenu();
    toast(S.assist ? 'Steer assist on — we\'ve got the corners with you.' : 'Steer assist off — all you.');
  };
  $('btn-haptic').onclick = function () {
    S.haptic = !S.haptic; save(); refreshMenu();
    if (S.haptic) HZ.play(HZ.select); // preview buzz so the toggle feels alive
  };
  $('btn-picker-back').onclick = function () { refreshMenu(); show('menu'); };
  $('btn-garage-back').onclick = function () { refreshMenu(); show('menu'); };
  $('btn-pre-back').onclick = function () {
    if (G.mode === 'daily') { refreshMenu(); show('menu'); }
    else openPicker(G.mode === 'cup' ? 'cup' : G.mode);
  };
  document.querySelectorAll('#diff-row .diff').forEach(function (b) {
    b.onclick = function () {
      S.difficulty = +b.getAttribute('data-d'); save();
      document.querySelectorAll('#diff-row .diff').forEach(function (x) {
        x.classList.toggle('on', x === b);
      });
      AU.beep(700, 0.08, 'triangle', 0.1);
    };
  });
  $('btn-go').onclick = function () {
    AU.init();
    if (G.mode === 'cup' && G.raceIdx === 0) G.cupPoints = [0, 0, 0, 0, 0, 0];
    G.resultsShown = false;
    startRace(G.mode, G.cup, G.raceIdx);
  };
  $('btn-rematch').onclick = function () { if (G.resultAction) G.resultAction(); };
  $('btn-tomenu').onclick = quitToMenu;
  $('btn-pause').onclick = togglePause;
  $('btn-resume').onclick = togglePause;
  $('btn-quit').onclick = quitToMenu;
  // first gesture starts menu music
  var started = false;
  document.addEventListener('pointerdown', function () {
    AU.init();
    if (!started) { started = true; AU.music(true, true); }
  });
  // cup purchase
  var origPicker = openPicker;
  openPicker = function (mode, cup) {
    origPicker(mode, cup);
    if (mode !== 'cup') return;
    var costs = [0, 20, 50, 90];
    var cells = $('picker-grid').children;
    for (var c = 0; c < 4; c++) {
      (function (cc) {
        if (cc < S.cupsUnlocked) return;
        cells[cc].onclick = function () {
          AU.init();
          if (S.tokens >= costs[cc]) {
            S.tokens -= costs[cc];
            S.cupsUnlocked = cc + 1;
            save(); AU.chime();
            toast('🔓 ' + themeName(cc) + ' Cup unlocked!');
            openPicker('cup');
          } else {
            toast('Need ' + costs[cc] + ' ◈ — you have ' + S.tokens + '. Race more!');
            AU.beep(220, 0.2, 'square', 0.1);
          }
        };
      })(c);
    }
  };
}

/* ---------------- main loop ---------------- */

function frame(t) {
  requestAnimationFrame(frame);
  var dt = Math.min(0.1, (t - G.lastT) / 1000 || 0);
  G.lastT = t;
  if (G.screen === null && G.race && !G.paused) {
    if (G.race.state !== 'done') {
      G.acc += dt;
      var n = 0;
      while (G.acc >= ND.DT && n < 5) { tickSim(); G.acc -= ND.DT; n++; }
      if (n === 5) G.acc = 0;
    }
    stepParts(dt);
    render(dt);
    hud();
  }
}

function boot() {
  wire();
  HZ.init();
  if (S.mute) $('btn-mute').textContent = '🔇';
  refreshMenu();
  show('menu');
  fetchDaily(null);
  // tiny debug/testing handle (used by automated browser checks)
  window.__nd = {
    openPicker: openPicker, openGarage: openGarage, openPrerace: openPrerace,
    startRace: startRace, showResults: showResults, showCupFinal: showCupFinal,
    tickSim: tickSim,
    setPlayerInput: function (fn) { playerInput = fn; },
    get G() { return G; }, get S() { return S; }, ND: ND
  };
  requestAnimationFrame(function (t) { G.lastT = t; frame(t); });
}

/* ---------------- headless self-test (?selftest=1) ---------------- */
/* Drives the real UI + sim headlessly: menu -> prerace -> full AI-driven
 * race -> results, plus garage/picker/prerace screens. Reports into
 * document.title as SELFTEST: pass=N fail=M :: details. */
function selftest() {
  var log = [], pass = 0, fail = 0;
  function step(name, fn) {
    try { fn(); pass++; log.push('ok ' + name); }
    catch (e) { fail++; log.push('FAIL ' + name + ': ' + (e && e.message)); }
  }
  window.addEventListener('error', function (e) {
    fail++; log.push('FAIL window.onerror: ' + e.message);
  });
  setTimeout(function () {
    step('boot shows menu', function () {
      if (!$('menu').classList.contains('on')) throw new Error('menu not on');
    });
    step('garage opens', function () {
      openGarage();
      if (!$('garage').classList.contains('on')) throw new Error('garage not on');
      if (!$('car-cards').children.length) throw new Error('no car cards');
    });
    step('picker opens', function () {
      openPicker('quick');
      if (!$('picker').classList.contains('on')) throw new Error('picker not on');
      if ($('picker-grid').children.length !== 12) throw new Error('expected 12 tracks');
    });
    step('prerace opens', function () {
      openPrerace('quick', 0, 0);
      if (!$('prerace').classList.contains('on')) throw new Error('prerace not on');
      if ($('grid-list').children.length !== 6) throw new Error('expected 6 grid rows');
    });
    step('full race completes to results', function () {
      // AI drives the player slot; run the real tickSim loop
      playerInput = function () { return ND.aiInput(G.track, G.race.cars[0], 0.9); };
      $('btn-go').click();
      if (G.screen !== null) throw new Error('race screen did not start');
      var n = 0;
      while (G.race.state !== 'done' && n < 40000) { tickSim(); n++; }
      if (G.race.state !== 'done') throw new Error('race did not finish in 40000 ticks');
    });
    // async tail: wait for results, then report
    var waited = 0;
    var iv = setInterval(function () {
      waited += 250;
      if ($('result').classList.contains('on') || waited > 15000) {
        clearInterval(iv);
        step('results screen shows', function () {
          if (!$('result').classList.contains('on')) throw new Error('result not on');
          if (!$('result-rows').innerHTML) throw new Error('no result rows');
        });
        step('rematch restarts', function () {
          playerInput = function () { return ND.aiInput(G.track, G.race.cars[0], 0.9); };
          $('btn-rematch').click();
          if (G.screen !== null || !G.race) throw new Error('rematch did not start a race');
        });
        document.title = 'SELFTEST: pass=' + pass + ' fail=' + fail + ' :: ' + log.join(' | ');
      }
    }, 250);
  }, 600);
}

try {
  boot();
  if (/[?&]selftest=1/.test(location.search)) selftest();
} catch (err) {
  var ebox = $('err');
  ebox.hidden = false;
  ebox.textContent = 'Neon Drift failed to start: ' + (err && err.message);
  throw err;
}

})();
