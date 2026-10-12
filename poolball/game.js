/* Poolball — top-down 3D pull-back billiards for the Gamez arcade.
 * Scenes, input, rendering, juice, HUD, leaderboard, daily. The physics
 * lives in sim.js (pure, seeded, headless-testable); this file is the shell. */
(function () {
'use strict';
var C = PBC;

/* ================= canvas ================= */
var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');
var DPR = Math.min(2, window.devicePixelRatio || 1);
canvas.width = C.W * DPR; canvas.height = C.H * DPR;
ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
PBArt.init(DPR);
/* Table view: the sim runs in 480x800 space, but the table (rails, pockets,
 * drop shadow) spans nearly the full canvas width, so it rendered clipped
 * at the screen edges. Scale the table about its center so the whole thing
 * fits with breathing room. Render maps sim->screen through tableView();
 * input maps screen->sim back through toSim(). */
var VIEW_S = 0.82;
var VIEW_CX = 240, VIEW_CY = 278; // table center (sim == canvas coords)
function tableView() {
  ctx.translate(VIEW_CX, VIEW_CY);
  ctx.scale(VIEW_S, VIEW_S);
  ctx.translate(-VIEW_CX, -VIEW_CY);
}
var SPR = PBArt.sprites();

function $(id) { return document.getElementById(id); }

/* ================= save ================= */
function readJSON(k, fb) {
  try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; }
}
function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
var save = readJSON(C.SAVE_KEY, { best: 0, stars: {}, plays: 0 });
function persist() { writeJSON(C.SAVE_KEY, save); }

/* ================= state ================= */
var G = {
  scene: 'title',          // 'title' | 'play'
  sim: null,
  tableNo: 1, daily: false, dateStr: '',
  score: 0, streak: 0,
  shotPoints: 0, pottedShot: 0,
  pull: null,              // {id, ax, ay, cx, cy, angle, power}
  precise: false,
  spin: { x: 0, y: 0 },
  spinOpen: false,
  trauma: 0, hitstop: 0, slowmo: 0,
  floaters: [], rings: [],
  eightDrama: false, dramaK: 0,
  hintDone: readJSON(C.SAVE_KEY + '_hint', false),
  clearShown: false, clearDelay: 0,
  mothT: Math.random() * 10,
  time: 0,
};
for (var fi = 0; fi < 14; fi++) G.floaters.push({ on: false });
for (var ri = 0; ri < 6; ri++) G.rings.push({ on: false });

function angDiff(a, b) {
  var d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/* ================= floaters / rings (pooled, zero per-frame alloc) ================= */
function spawnFloater(text, x, y, color, size) {
  for (var i = 0; i < G.floaters.length; i++) {
    var f = G.floaters[i];
    if (f.on) continue;
    if (!f.cv || f.text !== text || f.color !== color || f.size !== size) {
      var o = document.createElement('canvas');
      var fs = size || 22;
      var m = o.getContext('2d');
      m.font = '700 ' + fs + 'px "Archivo Black", sans-serif';
      var w = Math.ceil(m.measureText(text).width) + 12;
      o.width = w * DPR; o.height = (fs + 16) * DPR;
      m.setTransform(DPR, 0, 0, DPR, 0, 0);
      m.font = '700 ' + fs + 'px "Archivo Black", sans-serif';
      m.textAlign = 'center'; m.textBaseline = 'middle';
      m.lineWidth = 4; m.strokeStyle = 'rgba(0,0,0,0.7)';
      m.strokeText(text, w / 2, fs / 2 + 6);
      m.fillStyle = color;
      m.fillText(text, w / 2, fs / 2 + 6);
      f.cv = o; f.cw = w; f.ch = fs + 16; f.text = text; f.color = color; f.size = size;
    }
    f.on = true; f.x = x; f.y = y; f.life = 1.1; f.max = 1.1;
    return;
  }
}
function spawnRing(x, y, color, maxR) {
  for (var i = 0; i < G.rings.length; i++) {
    var r = G.rings[i];
    if (r.on) continue;
    r.on = true; r.x = x; r.y = y; r.color = color; r.maxR = maxR || 60; r.t = 0;
    return;
  }
}

/* ================= scenes ================= */
function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
}

function showTitle() {
  G.scene = 'title';
  PBAU.heartbeat(false);
  G.eightDrama = false;
  $('title').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('clear').classList.add('hidden');
  closeSpin();
  // demo table: racked triangle, for the menu backdrop
  var s = PBSim.createTable(PBSim.tableSeed(7), { tableNo: 0 });
  rackTriangle(s);
  G.sim = s;
  var dinfo = readJSON(C.DAILY_KEY, { last: null, streak: 0 });
  $('daily-streak').textContent = dinfo.streak > 0 ? 'STREAK ' + dinfo.streak : 'DAILY TABLE';
  $('mute-btn-t').textContent = PBAU.isMuted() ? 'SOUND OFF' : 'SOUND ON';
}

function rackTriangle(s) {
  var p = C.PLAY, R = C.BALL_R;
  var ax = p.x + p.w * 0.72, ay = p.y + p.h / 2;
  var order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  var n = 0;
  for (var row = 0; row < 5; row++) {
    for (var k = 0; k <= row; k++) {
      var b = s.balls[1 + n];
      if (!b) break;
      b.num = order[n % order.length];
      b.x = ax + row * (2 * R * 0.92);
      b.y = ay + (k - row / 2) * (2 * R * 1.02);
      b.vx = 0; b.vy = 0;
      n++;
    }
  }
  var cue = s.balls[0];
  cue.x = p.x + p.w * 0.25; cue.y = ay; cue.vx = 0; cue.vy = 0;
}

function startPlay(tableNo, daily) {
  PBAU.unlock(); PBAU.ui();
  G.scene = 'play';
  G.tableNo = tableNo; G.daily = daily;
  G.dateStr = todayStr();
  var seed = daily ? PBSim.dailySeed(G.dateStr) : PBSim.tableSeed(tableNo);
  G.sim = PBSim.createTable(seed, { tableNo: tableNo });
  G.score = 0; G.streak = 0; G.shotPoints = 0; G.pottedShot = 0;
  G.pull = null; G.trauma = 0; G.hitstop = 0; G.slowmo = 0;
  G.clearShown = false; G.clearDelay = 0;
  G.eightDrama = false; G.dramaK = 0;
  for (var i = 0; i < G.floaters.length; i++) G.floaters[i].on = false;
  for (var j = 0; j < G.rings.length; j++) G.rings[j].on = false;
  $('title').classList.add('hidden');
  $('clear').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('mute-btn').textContent = PBAU.isMuted() ? '🔇' : '🔊';
  updateHUD();
  if (daily) bumpDailyStreak();
}

function bumpDailyStreak() {
  var d = readJSON(C.DAILY_KEY, { last: null, streak: 0 });
  var t = todayStr();
  if (d.last === t) return;
  var y = new Date(Date.now() - 864e5);
  var ys = y.getFullYear() + '-' + ('0' + (y.getMonth() + 1)).slice(-2) + ('0' + y.getDate()).slice(-2);
  d.streak = (d.last === ys) ? d.streak + 1 : 1;
  d.last = t;
  writeJSON(C.DAILY_KEY, d);
}

/* ================= HUD ================= */
function updateHUD() {
  $('hud-score').textContent = G.score.toLocaleString();
  $('hud-table').textContent = G.daily ? 'DAILY' : 'TABLE ' + G.tableNo;
  var par = C.PAR;
  $('hud-shots').textContent = G.sim ? (G.sim.shots + ' / ' + par) : ('0 / ' + par);
  var sx = G.spin.x, sy = G.spin.y;
  $('spin-dot').style.left = (50 + sx * 38) + '%';
  $('spin-dot').style.top = (50 - sy * 38) + '%';
  $('precise-btn').classList.toggle('on', G.precise);
}

/* ================= input ================= */
function toSim(e) {
  var r = canvas.getBoundingClientRect();
  var lx = (e.clientX - r.left) / r.width * C.W;
  var ly = (e.clientY - r.top) / r.height * C.H;
  return {
    x: VIEW_CX + (lx - VIEW_CX) / VIEW_S,
    y: VIEW_CY + (ly - VIEW_CY) / VIEW_S,
  };
}

canvas.addEventListener('pointerdown', function (e) {
  PBAU.unlock();
  if (G.scene !== 'play' || G.spinOpen) return;
  if (!e.isPrimary) return;
  if (!G.sim || G.sim.phase !== 'aim' || G.clearShown) return;
  var p = toSim(e);
  G.pull = { id: e.pointerId, ax: p.x, ay: p.y, cx: p.x, cy: p.y, angle: null, power: 0 };
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('pointermove', function (e) {
  if (!G.pull || e.pointerId !== G.pull.id) return;
  var pl = G.pull, p = toSim(e);
  pl.cx = p.x; pl.cy = p.y;
  var raw = PBSim.aimFromPull(pl.ax, pl.ay, pl.cx, pl.cy);
  if (!raw) { pl.power = 0; return; }
  var a = Math.atan2(raw.dy, raw.dx);
  if (pl.angle === null) pl.angle = a;
  else pl.angle += angDiff(a, pl.angle) * (G.precise ? C.PRECISE_K : 1);
  pl.power = raw.power; // power is never smoothed: same pull = same shot
  e.preventDefault();
}, { passive: false });

function endPull(e, commit) {
  if (!G.pull || (e && e.pointerId !== G.pull.id)) return;
  var pl = G.pull;
  G.pull = null;
  if (!commit) return;
  // commit on release using the LAST move state — lifting the finger
  // never shifts the aim, and tiny pulls cancel instead of misfiring
  if (pl.angle !== null && pl.power >= C.MIN_POWER && G.sim && G.sim.phase === 'aim') {
    var dx = Math.cos(pl.angle), dy = Math.sin(pl.angle);
    if (PBSim.shoot(G.sim, dx, dy, pl.power, G.spin)) {
      PBAU.strike(pl.power);
      G.shotPoints = 0; G.pottedShot = 0;
      if (!G.hintDone) { G.hintDone = true; writeJSON(C.SAVE_KEY + '_hint', true); }
      if (G.sim.shots === 1 && pl.power > 0.65) {
        G.trauma = Math.max(G.trauma, C.SHAKE_BREAK);
        G.hitstop = C.HITSTOP_BREAK;
      }
      updateHUD();
    }
  }
}
canvas.addEventListener('pointerup', function (e) { endPull(e, true); });
canvas.addEventListener('pointercancel', function (e) { endPull(e, false); });
window.addEventListener('blur', function () { G.pull = null; closeSpin(); });
document.addEventListener('visibilitychange', function () {
  if (document.hidden) { G.pull = null; closeSpin(); PBAU.heartbeat(false); }
  else if (G.eightDrama && G.scene === 'play') PBAU.heartbeat(true);
});

/* spin picker */
function openSpin() {
  G.spinOpen = true;
  $('spin-picker').classList.remove('hidden');
  G.pull = null;
  PBAU.ui();
}
function closeSpin() {
  if (!G.spinOpen) return;
  G.spinOpen = false;
  $('spin-picker').classList.add('hidden');
}
(function () {
  var face = $('spin-face'), dot = $('spin-pdot'), drag = null;
  function setFromEvent(e) {
    var r = face.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width * 2 - 1;
    var y = -((e.clientY - r.top) / r.height * 2 - 1);
    var m = Math.sqrt(x * x + y * y);
    if (m > 1) { x /= m; y /= m; }
    G.spin.x = x; G.spin.y = y;
    dot.style.left = (50 + x * 40) + '%';
    dot.style.top = (50 - y * 40) + '%';
    updateHUD();
  }
  face.addEventListener('pointerdown', function (e) {
    drag = e.pointerId;
    try { face.setPointerCapture(e.pointerId); } catch (err) {}
    setFromEvent(e); e.preventDefault();
  });
  face.addEventListener('pointermove', function (e) {
    if (e.pointerId === drag) setFromEvent(e);
  });
  face.addEventListener('pointerup', function (e) { if (e.pointerId === drag) { drag = null; PBAU.ui(); } });
  face.addEventListener('pointercancel', function () { drag = null; });
  $('spin-close').addEventListener('click', function () { PBAU.ui(); closeSpin(); });
  $('spin-reset').addEventListener('click', function () {
    G.spin.x = 0; G.spin.y = 0;
    dot.style.left = '50%'; dot.style.top = '50%';
    PBAU.ui(); updateHUD();
  });
})();

/* buttons */
$('btn-play').addEventListener('click', function () { startPlay(save.tableNo || 1, false); });
$('btn-daily').addEventListener('click', function () { startPlay(0, true); });
$('mute-btn-t').addEventListener('click', function () {
  PBAU.unlock();
  PBAU.setMuted(!PBAU.isMuted());
  $('mute-btn-t').textContent = PBAU.isMuted() ? 'SOUND OFF' : 'SOUND ON';
  PBAU.ui();
});
$('mute-btn').addEventListener('click', function () {
  PBAU.setMuted(!PBAU.isMuted());
  $('mute-btn').textContent = PBAU.isMuted() ? '🔇' : '🔊';
});
$('menu-btn').addEventListener('click', function () { PBAU.ui(); showTitle(); });
$('precise-btn').addEventListener('click', function () {
  G.precise = !G.precise; PBAU.ui(); updateHUD();
});
$('spin-btn').addEventListener('click', openSpin);
$('next-btn').addEventListener('click', function () {
  if (G.daily) { showTitle(); return; }
  save.tableNo = G.tableNo + 1; persist();
  startPlay(G.tableNo + 1, false);
});

/* ================= events -> score + juice ================= */
var QUIPS = ['BANKED IT.', 'FILTHY.', "THE OL' RAZZLE-DAZZLE.", 'SMOOTH.', 'CALLED IT.'];
function quip(rng) { return QUIPS[Math.floor((rng || Math.random()) * QUIPS.length)]; }

function handleEvents() {
  var evts = PBSim.drain(G.sim);
  for (var i = 0; i < evts.length; i++) {
    var e = evts[i], s = G.sim;
    if (e.k === 'cushion') {
      if (e.v > 130) PBAU.cushion(Math.min(1, e.v / 1200));
    } else if (e.k === 'capture') {
      PBAU.click(0.25);
    } else if (e.k === 'pot') {
      var pk = s.pockets[e.pocket];
      var pts = (e.num === 8 ? C.EIGHT_BASE : C.POT_BASE) * e.mult;
      if (e.bank) { pts *= C.BANK_X; spawnFloater('BANK!', pk.x, pk.y - 26, '#ffd75e', 22); }
      if (e.long) { pts += C.LONG_BONUS; spawnFloater('LONG SHOT +' + C.LONG_BONUS, pk.x, pk.y - 48, '#9adcff', 18); }
      if (e.count > 1) { pts += (e.count - 1) * C.MULTI_BONUS; spawnFloater(e.count === 2 ? 'DOUBLE!' : 'MULTI x' + e.count, pk.x, pk.y - 70, '#ffb3e2', 20); }
      G.shotPoints += pts;
      G.pottedShot++;
      spawnFloater('+' + Math.round(pts), pk.x, pk.y - 8, e.num === 8 ? '#ffd75e' : '#ffffff', e.num === 8 ? 26 : 22);
      spawnRing(pk.x, pk.y, 'rgba(255,215,94,0.8)', 56);
      PBAU.pocket();
      G.trauma = Math.max(G.trauma, C.SHAKE_POT);
      if (e.num === 8) {
        G.slowmo = C.SLOWMO_T; // pocket-cam slow-mo on the money ball
        spawnFloater('MONEY BALL', pk.x, pk.y - 96, '#ffd75e', 26);
      }
    } else if (e.k === 'scratch') {
      var cp = s.balls[0];
      spawnFloater('SCRATCH', cp.x, cp.y - 30, '#ff8a8a', 22);
      PBAU.pocket();
    } else if (e.k === 'eightEarly') {
      spawnFloater('8-BALL LIVES — RESPOTTED', C.W / 2, C.PLAY.y + 60, '#ffd75e', 18);
      PBAU.ui();
    } else if (e.k === 'settle') {
      if (G.pottedShot > 0) {
        G.streak++;
        var mult = 1 + C.STREAK_STEP * (G.streak - 1);
        var award = Math.round(G.shotPoints * mult);
        G.score += award;
        if (G.streak >= 2) spawnFloater('STREAK x' + G.streak, C.W / 2, C.PLAY.y + C.PLAY.h + 44, '#ffb3e2', 22);
        if (G.pottedShot >= 3) spawnFloater(quip(), C.W / 2, C.PLAY.y - 30, '#9adcff', 18);
      } else {
        G.streak = 0;
      }
      G.shotPoints = 0; G.pottedShot = 0;
      updateHUD();
      refreshDrama();
    } else if (e.k === 'clear') {
      onTableClear(e.shots);
    }
  }
}

function onlyEightLeft() {
  if (!G.sim) return false;
  for (var i = 1; i < G.sim.balls.length; i++) {
    var b = G.sim.balls[i];
    if (b.active && b.num !== 8) return false;
  }
  for (var j = 1; j < G.sim.balls.length; j++) {
    var c = G.sim.balls[j];
    if (c.active && c.num === 8) return true;
  }
  return false;
}
function refreshDrama() {
  var d = onlyEightLeft() && G.scene === 'play' && !G.clearShown;
  if (d && !G.eightDrama) { G.eightDrama = true; PBAU.heartbeat(true); }
  if (!d && G.eightDrama) { G.eightDrama = false; PBAU.heartbeat(false); }
}

function onTableClear(shots) {
  var stars = shots <= C.PAR ? 3 : (shots <= C.PAR + 3 ? 2 : 1);
  var bonus = 250 * stars;
  G.score += bonus;
  if (!G.daily) {
    var prev = save.stars[G.tableNo] || 0;
    if (stars > prev) save.stars[G.tableNo] = stars;
    if (G.tableNo >= (save.tableNo || 1)) save.tableNo = G.tableNo + 1;
  }
  if (G.score > save.best) save.best = G.score;
  save.plays++;
  persist();
  PBAU.clearJingle();
  PBAU.heartbeat(false);
  G.eightDrama = false;
  G.clearShown = true; G.clearDelay = 1.1;
  G.clearStars = stars; G.clearBonus = bonus;
  updateHUD();
}

/* ================= leaderboard ================= */
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}
function arcadeSubmit(board, score) {
  var box = $('arc-box');
  if (!box) return;
  box.innerHTML = '<div class="arc-empty">connecting…</div>';
  function renderBox(top, rank, name) {
    var rows = (!top || !top.length)
      ? '<div class="arc-empty">No scores yet — be the first!</div>'
      : top.slice(0, 5).map(function (e, i) {
          var medals = ['1st', '2nd', '3rd'];
          return '<div class="arc-row' + (e.name === name ? ' me' : '') + '"><span>' +
            (medals[i] || (i + 1) + 'th') + ' · ' + escHtml(e.name) + '</span><b>' + (+e.score).toLocaleString() + '</b></div>';
        }).join('');
    box.innerHTML = (rank > 0 ? '<div class="arc-rank">GLOBAL #' + rank + '</div>' : '') +
      '<div class="arc-title">' + (G.daily ? 'DAILY BEST' : 'GLOBAL BEST') + '</div>' + rows;
  }
  function post(name) {
    fetch(C.ARCADE_BASE + '/score', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: C.GAME_ID, board: board, name: name, score: Math.floor(score) }),
    }).then(function (r) { return r.json(); }).then(function (d) {
      renderBox(d.top, d.rank || 0, name);
    }).catch(function () { renderBox(null, 0, name); }); // silent degrade offline
  }
  var name = '';
  try { name = (localStorage.getItem(C.NAME_KEY) || '').trim(); } catch (e) {}
  if (name) { post(name); return; }
  box.innerHTML = '<div class="arc-form"><input id="arc-name" maxlength="12" placeholder="YOUR NAME">' +
    '<button id="arc-go">SAVE</button></div>';
  $('arc-go').addEventListener('click', function () {
    var v = $('arc-name').value.trim().slice(0, 12);
    if (!v) return;
    try { localStorage.setItem(C.NAME_KEY, v); } catch (e) {}
    box.innerHTML = '<div class="arc-empty">sending…</div>';
    post(v);
  });
  fetch(C.ARCADE_BASE + '/scores?game=' + C.GAME_ID + '&board=' + encodeURIComponent(board))
    .then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.top && $('arc-name')) renderBox(d.top, 0, '');
    }).catch(function () {});
}

function showClear() {
  $('clear').classList.remove('hidden');
  $('clear-title').textContent = G.daily ? 'DAILY TABLE CLEAR' : 'TABLE ' + G.tableNo + ' CLEAR';
  $('clear-score').textContent = G.score.toLocaleString();
  $('clear-detail').textContent = G.sim.shots + ' shots · par ' + C.PAR + ' · table bonus +' + G.clearBonus;
  $('next-btn').textContent = G.daily ? 'BACK TO MENU' : 'NEXT TABLE';
  var stars = $('clear-stars');
  stars.innerHTML = '';
  for (var i = 0; i < 3; i++) {
    var sp = document.createElement('span');
    sp.className = 'star' + (i < G.clearStars ? ' lit' : '');
    sp.textContent = '★';
    stars.appendChild(sp);
    if (i < G.clearStars) (function (el, k) {
      setTimeout(function () { el.classList.add('pop'); PBAU.star(k); }, 350 + k * 320);
    })(sp, i);
  }
  var board = G.daily ? 'daily-' + G.dateStr : 'main';
  arcadeSubmit(board, G.score);
}

/* ================= render ================= */
function drawBall(b) {
  var R = C.BALL_R, spr = SPR.balls[b.num] || SPR.balls[0];
  var sx = b.x, sy = b.y, sc = 1;
  if (b.sinking > 0) {
    var t = Math.max(0, b.sinking / C.SINK_T);
    sc = 0.55 + 0.45 * t;
    sx = b.sinkX; sy = b.sinkY;
  }
  var sh = SPR.shadow;
  ctx.drawImage(sh, sx - 19 + 2, sy - 19 + 3, 38, 38);
  var sz = 34 * sc;
  ctx.drawImage(spr, sx - sz / 2, sy - sz / 2, sz, sz);
}

function aimTargets(ox, oy, dx, dy) {
  // ray vs balls -> nearest contact; returns {t, ball} or null
  var best = null, R = C.BALL_R;
  var bs = G.sim.balls;
  for (var i = 1; i < bs.length; i++) {
    var b = bs[i];
    if (!b.active || b.sinking > 0) continue;
    var rx = b.x - ox, ry = b.y - oy;
    var t = rx * dx + ry * dy;
    if (t <= 0) continue;
    var px = ox + dx * t, py = oy + dy * t;
    var qx = b.x - px, qy = b.y - py;
    var perp2 = qx * qx + qy * qy, rr = 2 * R;
    if (perp2 >= rr * rr) continue;
    var tc = t - Math.sqrt(rr * rr - perp2);
    if (tc > 0 && (!best || tc < best.t)) best = { t: tc, ball: b };
  }
  return best;
}

function render(dt) {
  var p = C.PLAY;
  ctx.save();
  if (G.trauma > 0.003) {
    var sh = G.trauma * G.trauma * 12;
    ctx.translate((Math.random() * 2 - 1) * sh, (Math.random() * 2 - 1) * sh);
  }
  // room backdrop: full canvas, unscaled
  ctx.drawImage(SPR.room, 0, 0, C.W, C.H);
  // table view on: everything table-related draws in sim coords
  ctx.save();
  tableView();
  ctx.drawImage(SPR.tshadow.c, SPR.tshadow.ox, SPR.tshadow.oy);
  // felt + pockets + rails
  ctx.drawImage(SPR.felt.c, SPR.felt.ox, SPR.felt.oy);
  var pks = G.sim.pockets;
  for (var i = 0; i < pks.length; i++) {
    var pk = pks[i], ps = pk.corner ? SPR.pocketC : SPR.pocketS;
    var pw = ps.width / DPR;
    ctx.drawImage(ps, pk.x - pw / 2, pk.y - pw / 2, pw, pw);
  }
  ctx.drawImage(SPR.rails.c, SPR.rails.ox, SPR.rails.oy);
  // pocket multiplier tags (side pockets pay x2) — hidden on the title screen
  if (G.scene !== 'title') {
    ctx.drawImage(SPR.tag2, pks[1].x - 22, pks[1].y - 34, 44, 24);
    ctx.drawImage(SPR.tag2, pks[4].x - 22, pks[4].y + 10, 44, 24);
  }

  var cue = G.sim.balls[0];
  // aim guides while pulling
  if (G.pull && G.pull.angle !== null && G.sim.phase === 'aim' && cue.active) {
    var dx = Math.cos(G.pull.angle), dy = Math.sin(G.pull.angle);
    var hit = aimTargets(cue.x, cue.y, dx, dy);
    var ex = cue.x + dx * 320, ey = cue.y + dy * 320, gx = ex, gy = ey;
    if (hit) { gx = cue.x + dx * hit.t; gy = cue.y + dy * hit.t; }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cue.x + dx * (C.BALL_R + 2), cue.y + dy * (C.BALL_R + 2));
    ctx.lineTo(gx, gy); ctx.stroke();
    if (hit) {
      var b = hit.ball;
      ctx.drawImage(SPR.ghost, gx - C.BALL_R - 4, gy - C.BALL_R - 4);
      // object-ball predicted path
      var ox = b.x - gx, oy = b.y - gy, od = Math.sqrt(ox * ox + oy * oy) || 1;
      ctx.strokeStyle = 'rgba(255,215,94,0.9)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(b.x + ox / od * C.BALL_R, b.y + oy / od * C.BALL_R);
      ctx.lineTo(b.x + ox / od * (C.BALL_R + 62), b.y + oy / od * (C.BALL_R + 62)); ctx.stroke();
      // cue-ball deflection (dotted)
      var nx = ox / od, ny = oy / od;
      var dot = dx * nx + dy * ny;
      var rx = dx - 2 * dot * nx, ry = dy - 2 * dot * ny;
      var rl = Math.sqrt(rx * rx + ry * ry);
      if (rl > 0.05) {
        rx /= rl; ry /= rl;
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        for (var d = C.BALL_R + 6; d < C.BALL_R + 52; d += 9) {
          ctx.drawImage(SPR.dot, gx + rx * d - 4, gy + ry * d - 4, 8, 8);
        }
      }
    }
    // cue stick drawn back with power — power lives ON the pull
    var pw2 = G.pull.power;
    ctx.save();
    ctx.translate(cue.x, cue.y);
    ctx.rotate(G.pull.angle);
    var back = 14 + pw2 * 85;
    ctx.drawImage(SPR.cue, -(160 + back), -7, 160, 14);
    ctx.restore();
  }

  // balls
  var bs = G.sim.balls;
  for (var bi = 0; bi < bs.length; bi++) {
    var bb = bs[bi];
    if (!bb.active && bb.sinking <= 0) continue;
    drawBall(bb);
  }

  // rings
  for (var ri = 0; ri < G.rings.length; ri++) {
    var rg = G.rings[ri];
    if (!rg.on) continue;
    var rt = rg.t / 0.5;
    if (rt >= 1) { rg.on = false; continue; }
    ctx.strokeStyle = rg.color;
    ctx.globalAlpha = 1 - rt;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(rg.x, rg.y, 8 + rt * rg.maxR, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // floaters
  for (var fi = 0; fi < G.floaters.length; fi++) {
    var f = G.floaters[fi];
    if (!f.on) continue;
    var fl = f.life / f.max;
    ctx.globalAlpha = Math.min(1, fl * 2.5);
    ctx.drawImage(f.cv, f.x - f.cw / 2, f.y - f.ch / 2 - (1 - fl) * 34, f.cw, f.ch);
    ctx.globalAlpha = 1;
  }

  ctx.restore(); // table view off -> canvas coords for fullscreen overlays

  // 8-ball drama: lights dim
  if (G.dramaK > 0.01) {
    ctx.globalAlpha = Math.min(0.8, G.dramaK * 0.8);
    ctx.drawImage(SPR.vignette, 0, 0, C.W, C.H);
    ctx.globalAlpha = 1;
    if (G.eightDrama) {
      ctx.fillStyle = 'rgba(255,80,80,0.9)';
      ctx.font = '700 13px "Archivo Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MONEY BALL', C.W / 2, p.y - 34);
    }
  }

  // first-shot hint in table coords: ghost finger pulls back and releases, looping
  if (G.scene === 'play' && !G.hintDone && G.sim.phase === 'aim' && !G.pull && !G.clearShown) {
    ctx.save();
    tableView();
    var ht = (G.time % 2.4) / 2.4;
    var hx = cue.x, hy = cue.y + 60;
    var pullD = ht < 0.55 ? (ht / 0.55) : Math.max(0, 1 - (ht - 0.55) / 0.2);
    var fx = hx - pullD * 110, fy = hy + pullD * 70;
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.65 * (1 - pullD * 0.4)) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(fx, fy, 13, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.arc(fx, fy, 13, 0, 7); ctx.stroke();
    if (!render._hintTxt) {
      var ho = document.createElement('canvas');
      ho.width = 300 * DPR; ho.height = 30 * DPR;
      var hx2 = ho.getContext('2d');
      hx2.setTransform(DPR, 0, 0, DPR, 0, 0);
      hx2.font = '700 17px "Archivo Black", sans-serif';
      hx2.textAlign = 'center';
      hx2.lineWidth = 4; hx2.strokeStyle = 'rgba(0,0,0,0.7)';
      hx2.strokeText('PULL BACK & RELEASE', 150, 21);
      hx2.fillStyle = '#ffe9a8';
      hx2.fillText('PULL BACK & RELEASE', 150, 21);
      render._hintTxt = ho;
    }
    ctx.drawImage(render._hintTxt, C.W / 2 - 150, p.y + p.h + 66, 300, 30);
    ctx.restore();
  }

  // menu: lamp glow + the moth
  if (G.scene === 'title') {
    ctx.drawImage(SPR.lamp, C.W / 2 - 180, 36, 360, 360);
    var mt = G.mothT;
    var mx = C.W / 2 + Math.cos(mt * 1.7) * 120 + Math.cos(mt * 4.3) * 22;
    var my = 170 + Math.sin(mt * 2.3) * 70 + Math.sin(mt * 5.1) * 14;
    var flap = Math.sin(mt * 42);
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(Math.sin(mt * 1.3) * 0.5);
    ctx.fillStyle = 'rgba(220,205,170,0.9)';
    ctx.beginPath(); ctx.ellipse(-4, flap * 3, 5, 2.6, -0.5 - flap * 0.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(4, flap * 3, 5, 2.6, 0.5 + flap * 0.4, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(120,100,70,0.9)';
    ctx.beginPath(); ctx.ellipse(0, 0, 2.2, 4.5, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/* ================= main loop ================= */
var lastTs = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  var dt = Math.min((ts - lastTs) / 1000 || 0.016, 0.1);
  lastTs = ts;
  G.time += dt;
  G.mothT += dt;
  // decay juice on wall clock
  G.trauma = Math.max(0, G.trauma - dt * 1.9);
  if (G.hitstop > 0) { G.hitstop -= dt; render(dt); return; }
  var simDt = dt;
  if (G.slowmo > 0) { G.slowmo -= dt; simDt = dt * C.SLOWMO_K; }
  if (G.scene === 'play' && G.sim) {
    PBSim.update(G.sim, simDt);
    handleEvents();
    if (G.clearShown && G.clearDelay > 0) {
      G.clearDelay -= dt;
      if (G.clearDelay <= 0) showClear();
    }
  }
  // floaters / rings
  for (var i = 0; i < G.floaters.length; i++) {
    var f = G.floaters[i];
    if (f.on) { f.life -= dt; f.y -= 30 * dt; if (f.life <= 0) f.on = false; }
  }
  for (var j = 0; j < G.rings.length; j++) {
    var r = G.rings[j];
    if (r.on) r.t += dt;
  }
  // drama vignette easing
  var target = G.eightDrama ? 1 : 0;
  G.dramaK += (target - G.dramaK) * Math.min(1, dt * 5);
  render(dt);
}

/* ================= test hook ================= */
window.__poolball = {
  scene: function () { return G.scene; },
  sim: function () { return G.sim; },
  score: function () { return G.score; },
  version: C.BUILD,
  start: function (n) { startPlay(n || 1, false); },
};

/* ================= boot ================= */
showTitle();
requestAnimationFrame(loop);
})();
