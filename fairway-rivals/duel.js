/* =====================================================================
 * Fairway Rivals — duel.js (loaded AFTER game.js)
 * Duel + Rival-turn ("SYNCHRONIZING…") + Shootout scenes. Global FRDuel.
 * game.js owns: save, feel hub, menu/versus/results/bag, match setup.
 * duel.js owns: one hole session with two alternating balls, all canvas
 * rendering, needle/aim input, wind widget, shot clock, ghost replay.
 * ===================================================================== */
(function () {
'use strict';
if (typeof FR === 'undefined') return;  // game.js shows the error screen

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function $(id) { return document.getElementById(id); }
function el(tag, cls, html) {
  var d = document.createElement(tag);
  if (cls) d.className = cls;
  if (html != null) d.innerHTML = html;
  return d;
}
var FRCFG = window.FRCFG || {};
var PAL = FRCFG.palette || {
  fairway: '#2e7d3f', rough: '#256b34', green: '#3da34d', sand: '#e6cf8e',
  water: '#2f7ba3', white: '#ffffff', gold: '#ffd23f', navy: '#0d2b52',
  red: '#c0392b', blue: '#2471a3', ink: '#0a1a12', treeDark: '#1d4d28', treeLite: '#4da55c'
};
var T = {  // tunables (mirrors game.js TUNE where needed; duel-local feel here)
  dprCap: 2, shotClock: 30, maxStrokes: 8,
  camLerp: 6.5, camDead: 6, viewW: 110,
  aimPx: 150, overPx: 200, guideMs: 120, trailLen: 26, maxP: 90
};
var BALLS = [
  { id: 'standard', name: 'Standard', unlimited: true, mods: {} },
  { id: 'ember', name: 'Ember', mods: { power: 0.20, wind: -0.20 } },
  { id: 'frost', name: 'Frost', mods: { spin: 0.30, power: -0.10 } },
  { id: 'volt', name: 'Volt', mods: { wind: -0.35, power: -0.05 } }
];
function ballMods() {
  var id = (window.__fr && window.__fr.save().ballSel) || 'standard';
  var b = BALLS.filter(function (x) { return x.id === id; })[0];
  return (b && b.mods) || {};
}
/* Ball specials are sim-agnostic: fold their ±40%-band mods into the shot
   params before applyShot/guideline, so any CONTRACT.md sim honors them. */
function modShot(o) {
  var m = ballMods();
  if (!m.power && !m.wind && !m.spin) return o;
  var s = {
    angle: o.angle, power01: o.power01, needle01: o.needle01, overpower: o.overpower,
    club: o.club, level: o.level,
    wind: o.wind, spin: o.spin
  };
  if (m.power) s.power01 = clamp(o.power01 * (1 + m.power), 0, 1);
  if (m.wind && o.wind) s.wind = { angle: o.wind.angle, mph: Math.max(0, o.wind.mph * (1 + m.wind)) };
  if (m.spin && o.spin) s.spin = { top: (o.spin.top || 0) * (1 + m.spin), side: (o.spin.side || 0) * (1 + m.spin) };
  return s;
}
function sfx(n, o) { if (typeof AU !== 'undefined' && AU && AU.sfx) { try { AU.sfx(n, o); } catch (e) {} } }
function buzz(p) {
  try {
    var st = window.__fr && window.__fr.save().settings;
    if (st && st.haptics && !st.reduceMotion && navigator.vibrate) navigator.vibrate(p);
  } catch (e) {}
}
function feel() { return (window.__fr && window.__fr.feel()) || null; }
function chyron(t, ms) {
  var c = document.getElementById('fr-chyron');
  if (!c) return;
  c.innerHTML = '<span>' + t + '</span>'; c.style.display = '';
  clearTimeout(chyron._t);
  if (ms) chyron._t = setTimeout(function () { c.style.display = 'none'; }, ms);
}

/* ---------------- DOM: duel chrome ---------------- */
var wrap = document.getElementById('sc-duel');
var canvas = el('canvas'); canvas.id = 'fr-canvas';
canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block';
wrap.appendChild(canvas);
var ctx = canvas.getContext('2d');

var CSS2 = [
'#sc-duel{background:#0b1026}',
'#fr-bug2{top:44px}',
'#fr-wind{position:absolute;top:44px;right:10px;z-index:20;background:rgba(8,11,29,.88);border:1px solid rgba(245,197,66,.35);border-radius:8px;padding:6px 10px;font-size:12px;font-weight:800;display:flex;align-items:center;gap:7px}',
'#fr-wind .wa{display:inline-block;font-size:15px;transition:transform .3s}',
'#fr-wind .wd{width:10px;height:10px;border-radius:50%}',
'#fr-booth{position:absolute;left:0;right:0;bottom:0;z-index:20;display:flex;align-items:flex-end;justify-content:center;gap:10px;padding:10px 12px calc(12px + env(safe-area-inset-bottom));pointer-events:none}',
'#fr-booth>*{pointer-events:auto}',
'.fr-chip{min-width:44px;min-height:44px;border-radius:12px;background:rgba(8,11,29,.9);border:1px solid rgba(245,197,66,.4);color:#f6f1e3;font-size:11px;font-weight:800;padding:8px 10px;letter-spacing:.04em}',
'.fr-chip small{display:block;font-size:8px;color:#9aa3c7;letter-spacing:.14em}',
'#fr-dial{position:relative;width:104px;height:104px;flex:0 0 auto}',
'#fr-dial .ring{position:absolute;inset:0;border-radius:50%;border:3px solid rgba(245,197,66,.9);background:radial-gradient(circle,rgba(8,11,29,.92) 55%,rgba(20,27,64,.92));display:none}',
'#fr-dial.aim .ring{display:block}',
'#fr-dial .ndl{position:absolute;left:50%;top:50%;width:3px;height:44px;background:#ff5a5a;border-radius:2px;transform-origin:50% 100%;display:none;box-shadow:0 0 8px rgba(255,90,90,.9)}',
'#fr-dial.aim .ndl{display:block}',
'#fr-dial .hub{position:absolute;left:50%;top:50%;width:12px;height:12px;margin:-6px;border-radius:50%;background:#f5c542;display:none}',
'#fr-dial.aim .hub{display:block}',
'#fr-clock{position:absolute;inset:-7px;transform:rotate(-90deg);pointer-events:none}',
'#fr-emotes{position:absolute;left:0;right:0;bottom:196px;z-index:21;display:none;justify-content:center;gap:8px}',
'#fr-emotes.on{display:flex}',
'#fr-emotes button{min-height:44px;border-radius:20px;border:1px solid rgba(245,197,66,.5);background:rgba(8,11,29,.94);color:#f6f1e3;font-size:12px;font-weight:700;padding:10px 14px}',
'#fr-spinrow{position:absolute;left:10px;bottom:128px;z-index:20;display:flex;gap:6px}',
'#fr-spinrow button{width:44px;height:44px;border-radius:50%;background:rgba(8,11,29,.9);border:1px solid rgba(154,163,199,.4);color:#f6f1e3;font-size:10px;font-weight:800}',
'#fr-spinrow button.sel{border-color:#f5c542;color:#f5c542}'
].join('\n');
var st2 = document.createElement('style'); st2.textContent = CSS2; document.head.appendChild(st2);

var bug = el('div', 'fr-bug'); bug.id = 'fr-bug2'; wrap.appendChild(bug);
var windW = el('div'); windW.id = 'fr-wind'; wrap.appendChild(windW);
var chy = el('div', 'fr-chyron'); chy.id = 'fr-chyron'; chy.style.display = 'none'; wrap.appendChild(chy);
var ban = el('div', 'fr-banner'); ban.id = 'fr-banner'; ban.style.display = 'none'; wrap.appendChild(ban);
var emotes = el('div'); emotes.id = 'fr-emotes'; wrap.appendChild(emotes);
var spinRow = el('div'); spinRow.id = 'fr-spinrow'; wrap.appendChild(spinRow);
var booth = el('div'); booth.id = 'fr-booth';
booth.innerHTML =
  '<button class="fr-chip" id="fr-club"><small>CLUB</small><span id="fr-clubn">—</span></button>' +
  '<div id="fr-dial"><svg id="fr-clock" viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" fill="none" stroke="rgba(154,163,199,.25)" stroke-width="5"/><circle id="fr-clockarc" cx="60" cy="60" r="54" fill="none" stroke="#f5c542" stroke-width="5" stroke-linecap="round" stroke-dasharray="339.3" stroke-dashoffset="0"/></svg><div class="ring"></div><div class="ndl" id="fr-ndl"></div><div class="hub"></div></div>' +
  '<button class="fr-chip" id="fr-ballc"><small>BALL</small><span id="fr-balln">STD</span></button>' +
  '<button class="fr-chip" id="fr-rear"><small>CAM</small><span>REAR</span></button>';
wrap.appendChild(booth);

var SPINS = [
  { id: 'none', t: '–', top: 0, side: 0 }, { id: 'top', t: 'TOP', top: 1, side: 0 },
  { id: 'back', t: 'BACK', top: -1, side: 0 }, { id: 'left', t: '◀', top: 0, side: -1 },
  { id: 'right', t: '▶', top: 0, side: 1 }
];
var spinBtns = [];
SPINS.forEach(function (sp) {
  var b = el('button', sp.id === 'none' ? 'sel' : '', sp.t);
  b.onclick = function () {
    G.spin = { top: sp.top, side: sp.side };
    spinBtns.forEach(function (x) { x.classList.remove('sel'); });
    b.classList.add('sel'); sfx('click'); buzz([10]);
  };
  spinRow.appendChild(b); spinBtns.push(b);
});
['nice', 'wow', 'oops'].forEach(function (id) {
  var label = { nice: 'Nice shot!', wow: 'Wow', oops: 'Oops' }[id];
  var b = el('button', '', label);
  b.onclick = function () { onEmote(id); };
  emotes.appendChild(b);
});
$('fr-rear').onclick = function () { G.rearview = !G.rearview; sfx('click'); buzz([10]); };
$('fr-club').onclick = function () { cycleClub(); };
$('fr-ballc').onclick = function () {
  var id = (window.__fr.save().ballSel) || 'standard';
  var names = { standard: 'STD', ember: 'EMB', frost: 'FRS', volt: 'VLT' };
  $('fr-balln').textContent = names[id] || 'STD';
};

/* ---------------- session state ---------------- */
var G = null;  // per-hole session
function newSession(match, mode, onDone) {
  var hole = match.hole;
  return {
    match: match, mode: mode, onDone: onDone,
    hole: hole,
    me: FR.newBall(hole), riv: FR.newBall(hole),
    turn: 'me', phase: 'myAim',   // myAim|myFly|rivSync|rivThink|rivFly|done
    wind: match.wind, aimT: 0, clock: T.shotClock,
    aiming: false, dragX: 0, dragY: 0, needleT: 0, needle01: 0,
    clubId: null, clubManual: false,
    spin: { top: 0, side: 0 }, rearview: false,
    cam: { x: hole.tee.x, y: hole.tee.y, z: 1 },
    guide: [], guideT: 0, guideBlocked: false,
    trailMe: new Array(T.trailLen), trailRiv: new Array(T.trailLen), trailI: 0,
    parts: [], pendingAimT: -9,
    phaseT: 0, thinkWait: 0, rivalParams: null,
    holeSeed: hole.seed, done: false, last: 0, raf: 0,
    courseCv: null, shootout: mode === 'shootout',
    distMe: 0, distRiv: 0
  };
}
for (var _pi = 0; _pi < T.maxP; _pi++) {}  // (pool allocated in reset)

/* particles: fixed pool, zero per-frame allocation */
function initPool(g) {
  g.parts = [];
  for (var i = 0; i < T.maxP; i++) g.parts.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, col: '#fff', sz: 2 });
  g.pFree = g.parts.slice();
}
function spawnP(g, x, y, vx, vy, life, col, sz) {
  if (!g.pFree.length) return;
  var p = g.pFree.pop();
  p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.col = col; p.sz = sz;
}
function burst(g, x, y, n, col, spd) {
  if (feel() && !feel().enabled) return;
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2, s = spd * (0.4 + Math.random() * 0.6);
    spawnP(g, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.5 + Math.random() * 0.5, col, 1.5 + Math.random() * 2.5);
  }
}

/* ---------------- course pre-render (one offscreen canvas per hole) ---------------- */
function renderCourse(hole) {
  var PR = 3, PAD = 130;  // rough apron beyond the bounds so the camera never sees void
  var cv = document.createElement('canvas');
  cv.width = Math.ceil((hole.w + PAD * 2) * PR); cv.height = Math.ceil((hole.h + PAD * 2) * PR);
  var g = cv.getContext('2d');
  g.scale(PR, PR);
  g.translate(PAD, PAD);
  g.fillStyle = PAL.rough; g.fillRect(-PAD, -PAD, hole.w + PAD * 2, hole.h + PAD * 2);
  var rng = FR.mulberry32(hole.seed ^ 0x77aa);
  g.fillStyle = 'rgba(0,0,0,.08)';
  for (var i = 0; i < 500; i++) g.fillRect(rng() * hole.w, rng() * hole.h, 1.2, 1.2);
  function ell(e, fill) {
    g.save(); g.translate(e.x, e.y); g.rotate(e.rot || 0);
    g.fillStyle = fill; g.beginPath(); g.ellipse(0, 0, e.rx, e.ry, 0, 0, Math.PI * 2); g.fill(); g.restore();
  }
  hole.fairway.forEach(function (e) { ell(e, PAL.fairway); });
  hole.sand.forEach(function (e) { ell(e, PAL.sand); });
  hole.water.forEach(function (e) {
    ell(e, PAL.water);
    g.save(); g.translate(e.x, e.y); g.rotate(e.rot || 0);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(0, 0, e.rx - 1.5, e.ry - 1.5, 0, 0, Math.PI * 2); g.stroke(); g.restore();
  });
  var gr = hole.green;
  ell({ x: gr.x, y: gr.y, rx: gr.rx + 3, ry: gr.ry + 3 }, 'rgba(61,163,77,.45)');
  ell(gr, PAL.green);
  // cup
  g.fillStyle = '#0a1a12'; g.beginPath(); g.arc(hole.cup.x, hole.cup.y, FR.CUP_R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 0.8;
  g.beginPath(); g.moveTo(hole.cup.x, hole.cup.y); g.lineTo(hole.cup.x, hole.cup.y - 14); g.stroke();
  g.fillStyle = '#e5484d';
  g.beginPath(); g.moveTo(hole.cup.x, hole.cup.y - 14); g.lineTo(hole.cup.x + 7, hole.cup.y - 11.5); g.lineTo(hole.cup.x, hole.cup.y - 9); g.fill();
  // tee
  g.fillStyle = 'rgba(255,255,255,.85)';
  g.fillRect(hole.tee.x - 5, hole.tee.y - 1, 10, 2);
  // trees
  hole.trees.forEach(function (t) {
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.beginPath(); g.arc(t.x + 1, t.y + 1.5, t.r, 0, Math.PI * 2); g.fill();
    g.fillStyle = PAL.treeDark; g.beginPath(); g.arc(t.x, t.y, t.r, 0, Math.PI * 2); g.fill();
    g.fillStyle = PAL.treeLite; g.beginPath(); g.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.6, 0, Math.PI * 2); g.fill();
  });
  return { cv: cv, pr: PR, pad: PAD };
}

/* ---------------- camera ---------------- */
function worldToScreen(g, x, y) {
  var cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1;
  var z = (cw / T.viewW) * (G.rearview ? 0.8 : 1);
  return { x: (x - g.cam.x) * z + cw / 2, y: (y - g.cam.y) * z + ch / 2, z: z };
}
function updateCamera(g, dt, tx, ty) {
  var dx = tx - g.cam.x, dy = ty - g.cam.y;
  var d = Math.hypot(dx, dy);
  if (d > T.camDead) {
    var k = Math.min(1, T.camLerp * dt);
    g.cam.x += dx * k; g.cam.y += dy * k;
  }
}

/* ---------------- input: drag back from the ball ---------------- */
var ptr = { down: false, id: -1, sx: 0, sy: 0 };
canvas.addEventListener('pointerdown', function (e) {
  if (!G || G.done) return;
  if (G.phase !== 'myAim') { G.pendingAimT = performance.now() / 1000; return; }
  var r = canvas.getBoundingClientRect();
  var p = worldToScreen(G, G.me.x, G.me.y);
  var dx = (e.clientX - r.left) - p.x, dy = (e.clientY - r.top) - p.y;
  if (Math.hypot(dx, dy) < 90) {
    ptr.down = true; ptr.id = e.pointerId; ptr.sx = e.clientX - r.left; ptr.sy = e.clientY - r.top;
    G.aiming = true; G.dragX = ptr.sx; G.dragY = ptr.sy; G.needleT = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    $('fr-dial').classList.add('aim');
    sfx('aim');
  } else {
    G.pendingAimT = performance.now() / 1000;  // input buffer: tap near ball as it settles
  }
});
canvas.addEventListener('pointermove', function (e) {
  if (!ptr.down || e.pointerId !== ptr.id || !G) return;
  var r = canvas.getBoundingClientRect();
  G.dragX = e.clientX - r.left; G.dragY = e.clientY - r.top;
  G.guideT = 99;  // force guideline refresh
});
function endPointer(e) {
  if (!ptr.down || (e && e.pointerId !== ptr.id)) return;
  ptr.down = false;
  if (G && G.aiming && G.phase === 'myAim') strike(G, false);
  if (G) { G.aiming = false; $('fr-dial').classList.remove('aim'); }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
function clearInput() {
  ptr.down = false;
  if (G) { G.aiming = false; var d = $('fr-dial'); if (d) d.classList.remove('aim'); }
}

function aimVec() {
  // drag back: shot goes opposite the drag
  var p = worldToScreen(G, G.me.x, G.me.y);
  var dx = p.x - G.dragX, dy = p.y - G.dragY;
  var dist = Math.hypot(dx, dy);
  return { ang: Math.atan2(dy, dx), dist: dist };
}
function currentClub() {
  var bag = {};
  var sv = window.__fr.save();
  for (var id in sv.clubs) bag[id] = sv.clubs[id].lvl;
  var cid = G.clubId;
  if (!cid || !G.clubManual) {
    cid = FR.autoClub(G.hole, G.me, bag);
    G.clubId = cid;
  }
  var c = FR.CLUBS.filter(function (x) { return x.id === cid; })[0] || FR.CLUBS[2];
  return { club: c, level: bag[c.id] || 1 };
}
function cycleClub() {
  if (!G || G.phase !== 'myAim') return;
  var ids = FR.CLUBS.map(function (c) { return c.id; });
  var i = (ids.indexOf(G.clubId) + 1) % ids.length;
  G.clubId = ids[i]; G.clubManual = true;
  sfx('click'); buzz([10]);
  updateClubChip();
}
function updateClubChip() {
  var cc = currentClub();
  $('fr-clubn').textContent = cc.club.name.split(' ')[0].toUpperCase() + ' ' + cc.level;
}
function updateBug() {
  bug.innerHTML = '<b>YOU</b> ' + G.me.strokes + ' &nbsp;·&nbsp; <b>' +
    (G.match.rival.isGhost ? 'GHO' : 'RIV') + '</b> ' + G.riv.strokes +
    ' &nbsp;·&nbsp; PAR ' + G.hole.par +
    (G.shootout ? ' &nbsp;·&nbsp; <b>SHOOTOUT</b>' : '');
}
function updateWind() {
  var w = G.wind;
  var deg = (-w.angle * 180 / Math.PI + 90);
  var col = w.mph <= 9 ? '#fff' : w.mph <= 18 ? '#ffd23f' : '#37c26a';
  windW.innerHTML = '<span class="wd" style="background:' + col + '"></span>' +
    '<span class="wa" style="transform:rotate(' + deg + 'deg)">➤</span>' +
    '<span>' + Math.round(w.mph) + ' mph</span>';
}

/* ---------------- the strike ---------------- */
function strike(g, auto) {
  var cc = currentClub();
  var av = aimVec();
  var power01 = clamp(av.dist / T.aimPx, 0.08, 1);
  var overpower = av.dist > T.aimPx;
  var ns = FR.needleSpeed(cc.club, cc.level) * (overpower ? 2.2 : 1);
  var needle01 = auto ? Math.sin(g.needleT * ns) : Math.sin(g.needleT * ns);
  if (auto) { power01 = 0.55; overpower = false; }
  var shot = modShot({
    angle: av.ang, power01: power01, needle01: clamp(needle01, -1, 1), overpower: overpower,
    club: cc.club, level: cc.level, wind: g.wind, spin: g.spin
  });
  FR.applyShot(g.me, shot);
  FR.tapeShot(g.match.tape, {
    angle: shot.angle, power01: shot.power01, needle01: shot.needle01, overpower: shot.overpower,
    clubId: cc.club.id, level: cc.level, spin: g.spin, wind: g.wind
  });
  g.phase = 'myFly'; g.aiming = false;
  $('fr-dial').classList.remove('aim');
  var F = feel();
  if (Math.abs(needle01) < 0.08) {
    if (F) F.hitStop(90);
    sfx('perfect'); buzz([12, 40, 12]);
    burst(g, g.me.x, g.me.y, 10, '#ffd23f', 22);
    chyron('PERFECT RELEASE', 900);
  } else {
    if (F) F.hitStop(45);
    sfx('strike'); buzz([25]);
  }
  updateBug();
}

/* ---------------- rival turn: the "SYNCHRONIZING…" broadcast ---------------- */
function startRivalTurn(g) {
  g.phase = 'rivSync'; g.phaseT = 0;
  ban.style.display = '';
  ban.innerHTML = '<span>SYNCHRONIZING…</span>';
  windW.style.visibility = 'hidden';
  spinRow.style.display = 'none';   // spin is a your-shot control
  emotes.classList.add('on');
  updateBug();
}
function rivalThink(g) {
  g.phase = 'rivThink'; g.phaseT = 0;
  ban.style.display = 'none';
  var r = g.match.rival;
  var clubName = 'the iron';
  if (r.isGhost && !g.shootout) {
    var ts = g.match.ghostTape[g.riv.strokes];
    if (!ts) {  // ghost has no more tape: forfeit
      g.riv.strokes = T.maxStrokes; g.riv.state = 'holed';
      chyron('Your ghost runs out of tape.', 1800);
      endTurn(g, 'riv');
      return;
    }
    var c = FR.CLUBS.filter(function (x) { return x.id === ts.clubId; })[0] || FR.CLUBS[2];
    g.rivalParams = {
      angle: ts.angle, power01: ts.power01, needle01: ts.needle01, overpower: ts.overpower,
      club: c, level: ts.level, wind: g.wind, spin: ts.spin, ballMods: {}
    };
    chyron('Your ghost steps up…', 1600);
    g.thinkWait = 1.4;
  } else {
    var bag = {}, lvl = 1 + Math.round(r.skill * 4);
    FR.CLUBS.forEach(function (c) { bag[c.id] = lvl; });
    var cid = FR.autoClub(g.hole, g.riv, bag);
    var club = FR.CLUBS.filter(function (x) { return x.id === cid; })[0];
    var rng = g.match.rng;
    var p = FR.botShot(g.hole, g.riv, club, lvl, r.skill, rng);
    g.rivalParams = {
      angle: p.angle, power01: p.power01, needle01: p.needle01, overpower: p.overpower,
      club: club, level: lvl, wind: g.wind, spin: p.spin, ballMods: {}
    };
    clubName = club.name;
    chyron(r.name + ' lines up ' + clubName + '…', 2000);
    g.thinkWait = clamp(p.thinkMs / 8000, 1.4, 3.2);  // TV pacing of the 5–25s sim think
  }
}
function rivalStrike(g) {
  FR.applyShot(g.riv, g.rivalParams);
  g.phase = 'rivFly';
  sfx('strike');
}
function onEmote(id) {
  var map = { nice: 'Nice shot!', wow: 'Wow', oops: 'Oops' };
  chyron('You: "' + map[id] + '"', 1500);
  sfx('click');
  var g = G;
  setTimeout(function () {
    if (!g || g.done) return;
    var line = (window.__fr && window.__fr.save().aiRivals.lines.length)
      ? window.__fr.save().aiRivals.lines[Math.floor(Math.random() * window.__fr.save().aiRivals.lines.length)]
      : (function () {
          var l = { nice: ['Why thank you.', 'I know. I know.'], wow: ['Right?!', 'I surprise even myself.'], oops: ['Rude. Accurate, but rude.', 'The wind did that. Probably.'] }[id];
          return l[Math.floor(Math.random() * l.length)];
        })();
    if (g.phase === 'rivThink' || g.phase === 'rivSync' || g.phase === 'rivFly')
      chyron(g.match.rival.name + ': "' + line + '"', 2200);
  }, 900);
}

/* ---------------- events -> juice ---------------- */
function handleEvents(g, ball, evs, who) {
  var F = feel();
  for (var i = 0; i < evs.length; i++) {
    var e = evs[i];
    if (e.t === 'bounce') { sfx('bounce', { gain: 0.4 }); spawnP(g, e.x, e.y, 0, 0, 0.3, '#ffffff', 2); }
    else if (e.t === 'tree') { sfx('thunk'); burst(g, e.x, e.y, 6, '#4da55c', 14); }
    else if (e.t === 'cup') {
      if (F) { F.slowMo(0.25, 700); F.doFlash('#ffd23f'); }
      sfx('cheer'); sfx('cup'); buzz([20, 60, 20]);
      burst(g, e.x, e.y, 26, '#ffd23f', 30);
      burst(g, e.x, e.y, 14, '#ffffff', 20);
      chyron(who === 'me' ? 'DUNKED IT! The crowd goes wild!' : g.match.rival.name + ' sinks it.', 2400);
    }
    else if (e.t === 'water' || e.t === 'ob') {
      if (F) F.addTrauma(0.55);
      sfx(e.t === 'water' ? 'splash' : 'bad'); buzz([50]);
      burst(g, e.x, e.y, 12, '#2f7ba3', 18);
      chyron(who === 'me' ? (e.t === 'water' ? 'Splash. Penalty stroke.' : 'Out of bounds. Penalty stroke.') : g.match.rival.name + ' finds trouble.', 2000);
    }
  }
}
function active(ball) { return ball.state !== 'holed' && ball.strokes < T.maxStrokes; }
function endTurn(g, who) {
  if (g.shootout) { endShootoutTurn(g, who); return; }
  var meLive = active(g.me), rivLive = active(g.riv);
  if (g.me.strokes >= T.maxStrokes && g.me.state !== 'holed') { g.me.state = 'holed'; meLive = false; }
  if (g.riv.strokes >= T.maxStrokes && g.riv.state !== 'holed') { g.riv.state = 'holed'; rivLive = false; }
  if (!meLive && !rivLive) { finishHole(g); return; }
  if (who === 'me') {
    if (rivLive) startRivalTurn(g);
    else { beginMyAim(g); }
  } else {
    if (meLive) beginMyAim(g);
    else startRivalTurn(g);
  }
}
function beginMyAim(g) {
  g.phase = 'myAim'; g.aimT = 0; g.clock = T.shotClock; g.needleT = 0;
  g.clubManual = false; g.clubId = null;
  // fresh wind every shot — the broadcast read changes constantly
  var rng = g.match.rng;
  g.wind = { angle: rng() * Math.PI * 2, mph: 2 + rng() * 16 };
  updateWind(); updateClubChip(); updateBug();
  windW.style.visibility = '';
  spinRow.style.display = '';
  emotes.classList.remove('on');
  // input buffer: a tap that landed just before the ball settled starts the aim
  if (performance.now() / 1000 - g.pendingAimT < 0.15) {
    g.pendingAimT = -9;
    chyron('Your shot.', 1200);
  }
}
function finishHole(g) {
  g.done = true; g.phase = 'done';
  emotes.classList.remove('on'); ban.style.display = 'none';
  var winner = g.me.strokes < g.riv.strokes ? 'you' : g.me.strokes > g.riv.strokes ? 'rival' : 'draw';
  var res = {
    myStrokes: g.me.strokes, rivStrokes: g.riv.strokes, winner: winner,
    stage: g.match.stage, stageName: g.match.stageName, seed: g.holeSeed,
    tape: g.match.tape, ghost: g.match.ghost, rivalName: g.match.rival.name,
    hole: g.hole, shootout: false
  };
  cancelAnimationFrame(g.raf);
  setTimeout(function () { g.onDone(res); }, 900);
}

/* ---------------- shootout ---------------- */
function endShootoutTurn(g, who) {
  if (who === 'me') {
    if (active(g.riv)) startRivalTurn(g);
    else finishShootout(g);
  } else {
    finishShootout(g);
  }
}
function finishShootout(g) {
  g.done = true; g.phase = 'done';
  emotes.classList.remove('on'); ban.style.display = 'none';
  g.distMe = Math.hypot(g.me.x - g.hole.cup.x, g.me.y - g.hole.cup.y);
  g.distRiv = Math.hypot(g.riv.x - g.hole.cup.x, g.riv.y - g.hole.cup.y);
  var winner = g.distMe < g.distRiv ? 'you' : g.distMe > g.distRiv ? 'rival' : 'draw';
  chyron('Closest to the pin: YOU ' + g.distMe.toFixed(1) + ' · RIV ' + g.distRiv.toFixed(1), 2600);
  var res = {
    myStrokes: g.me.strokes, rivStrokes: g.riv.strokes, winner: winner,
    stage: g.match.stage, stageName: g.match.stageName, seed: g.holeSeed,
    tape: g.match.tape, ghost: g.match.ghost, rivalName: g.match.rival.name,
    hole: g.hole, shootout: true, distMe: g.distMe, distRiv: g.distRiv
  };
  cancelAnimationFrame(g.raf);
  setTimeout(function () { g.onDone(res); }, 2200);
}

/* ---------------- main loop ---------------- */
function frame(g, now) {
  if (g.done) return;
  g.raf = requestAnimationFrame(function (n) { frame(g, n); });
  var rawDt = Math.min(0.1, ((now - g.last) / 1000) || 0.016);  // dt clamp 0.1
  g.last = now;
  var F = feel();
  var dt = F ? F.update(rawDt) : rawDt;
  if (dt === 0) { draw(g); return; }  // hit-stop: frozen sim, still drawing

  // ---- update ----
  if (g.phase === 'myAim') {
    g.aimT += dt; g.clock -= dt;
    if (g.aiming) {
      g.needleT += dt;
      g.guideT += dt * 1000;
      if (g.guideT > T.guideMs) {
        g.guideT = 0;
        var cc = currentClub(), av = aimVec();
        var p01 = clamp(av.dist / T.aimPx, 0.08, 1);
        g.guide = FR.guideline(g.hole, g.me, modShot({
          angle: av.ang, power01: p01, needle01: 0, overpower: av.dist > T.aimPx,
          club: cc.club, level: cc.level, wind: g.wind, spin: g.spin
        }));
        g.guideBlocked = false;
        for (var gi = 0; gi < g.guide.length * 0.7; gi++) {
          var pt = g.guide[gi];
          if (FR.inWater(g.hole, pt.x, pt.y)) { g.guideBlocked = true; break; }
        }
      }
      var ns = FR.needleSpeed(currentClub().club, currentClub().level) * (aimVec().dist > T.aimPx ? 2.2 : 1);
      var ndl = document.getElementById('fr-ndl');
      if (ndl) ndl.style.transform = 'translate(-50%,-100%) rotate(' + (Math.sin(g.needleT * ns) * 55) + 'deg)';
    }
    // shot clock ring
    var arc = document.getElementById('fr-clockarc');
    if (arc) arc.setAttribute('stroke-dashoffset', String(339.3 * (1 - g.clock / T.shotClock)));
    if (g.clock <= 0) {  // timeout = auto-shoot at current aim
      g.aiming = true; strike(g, true);
      chyron('Shot clock expired — auto swing.', 1600);
    }
    updateCamera(g, dt, g.me.x, g.me.y);
  } else if (g.phase === 'myFly') {
    var evs = FR.stepShot(g.hole, g.me, dt);
    handleEvents(g, g.me, evs, 'me');
    pushTrail(g, g.trailMe, g.me);
    updateCamera(g, dt, g.me.x, g.me.y);
    if (g.me.state === 'rest' || g.me.state === 'holed') endTurn(g, 'me');
  } else if (g.phase === 'rivSync') {
    g.phaseT += dt;
    updateCamera(g, dt, g.riv.x, g.riv.y);
    if (g.phaseT > 1.3) rivalThink(g);
  } else if (g.phase === 'rivThink') {
    g.phaseT += dt;
    updateCamera(g, dt, g.riv.x, g.riv.y);
    if (g.phaseT > g.thinkWait) rivalStrike(g);
  } else if (g.phase === 'rivFly') {
    var evs2 = FR.stepShot(g.hole, g.riv, dt);
    handleEvents(g, g.riv, evs2, 'riv');
    pushTrail(g, g.trailRiv, g.riv);
    updateCamera(g, dt, g.riv.x, g.riv.y);
    if (g.riv.state === 'rest' || g.riv.state === 'holed') endTurn(g, 'riv');
  }

  // rearview: camera sits behind the ball looking down the line
  if (g.rearview && (g.phase === 'myAim')) {
    var dx = g.hole.cup.x - g.me.x, dy = g.hole.cup.y - g.me.y, d = Math.hypot(dx, dy) || 1;
    updateCamera(g, dt, g.me.x - (dx / d) * 34, g.me.y - (dy / d) * 34);
  }

  // particles
  for (var i = 0; i < g.parts.length; i++) {
    var p = g.parts[i];
    if (!p.on) continue;
    p.life -= dt;
    if (p.life <= 0) { p.on = false; g.pFree.push(p); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; p.vy *= 0.98;
  }
  draw(g);
}
function pushTrail(g, trail, ball) {
  trail[g.trailI % T.trailLen] = { x: ball.x, y: ball.y };
  g.trailI++;
}

/* ---------------- draw ---------------- */
function draw(g) {
  var dpr = Math.min(T.dprCap, window.devicePixelRatio || 1);
  var cw = canvas.clientWidth, ch = canvas.clientHeight;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  }
  g.dpr = dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0b1026'; ctx.fillRect(0, 0, cw, ch);
  var z = (cw / T.viewW) * (g.rearview ? 0.8 : 1);
  var F = feel();
  var shx = F ? F.shX : 0, shy = F ? F.shY : 0;
  ctx.save();
  ctx.translate(cw / 2 + shx, ch / 2 + shy);
  ctx.scale(z, z);
  ctx.translate(-g.cam.x, -g.cam.y);
  if (g.courseCv) ctx.drawImage(g.courseCv.cv, -g.courseCv.pad, -g.courseCv.pad, g.hole.w + g.courseCv.pad * 2, g.hole.h + g.courseCv.pad * 2);

  // guideline dots
  if (g.phase === 'myAim' && g.aiming && g.guide.length) {
    ctx.fillStyle = g.guideBlocked ? 'rgba(229,72,77,.9)' : 'rgba(255,255,255,.85)';
    for (var i = 0; i < g.guide.length; i += 2) {
      var pt = g.guide[i];
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 0.9, 0, Math.PI * 2); ctx.fill();
    }
  }
  // aim pull line + power ring
  if (g.phase === 'myAim' && g.aiming) {
    var av = aimVec();
    var p01 = clamp(av.dist / T.aimPx, 0, 1);
    ctx.strokeStyle = 'rgba(245,197,66,.9)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(g.me.x, g.me.y, 6 + p01 * 8, 0, Math.PI * 2); ctx.stroke();
    if (av.dist > T.aimPx) {  // overpower zone
      ctx.strokeStyle = 'rgba(229,72,77,.95)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(g.me.x, g.me.y, 6 + 8, 0, Math.PI * 2); ctx.stroke();
    }
    var ex = g.me.x + Math.cos(av.ang) * 26, ey = g.me.y + Math.sin(av.ang) * 26;
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(g.me.x, g.me.y); ctx.lineTo(ex, ey); ctx.stroke();
  }
  // trails
  drawTrail(g, g.trailMe, 'rgba(63,167,255,.55)');
  drawTrail(g, g.trailRiv, g.match.rival.isGhost ? 'rgba(245,197,66,.6)' : 'rgba(229,72,77,.55)');
  // particles
  for (var pi = 0; pi < g.parts.length; pi++) {
    var pp = g.parts[pi];
    if (!pp.on) continue;
    ctx.globalAlpha = clamp(pp.life / pp.max, 0, 1);
    ctx.fillStyle = pp.col;
    ctx.beginPath(); ctx.arc(pp.x, pp.y, pp.sz, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // balls
  drawBall(g, g.me, PAL.white, PAL.blue, 1);
  var ghost = g.match.rival.isGhost;
  drawBall(g, g.riv, ghost ? 'rgba(245,197,66,.85)' : PAL.white, ghost ? PAL.gold : PAL.red, ghost ? 0.85 : 1);
  ctx.restore();
  // dunk flash
  if (F && F.flash > 0) {
    ctx.fillStyle = F.flashColor; ctx.globalAlpha = clamp(F.flash / 0.16, 0, 1) * 0.28;
    ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1;
  }
}
function drawTrail(g, trail, col) {
  ctx.fillStyle = col;
  for (var i = 0; i < T.trailLen; i++) {
    var t = trail[(g.trailI + i) % T.trailLen];
    if (!t) continue;
    ctx.globalAlpha = (i / T.trailLen) * 0.7;
    ctx.beginPath(); ctx.arc(t.x, t.y, 1.1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawBall(g, ball, fill, ring, alpha) {
  if (ball.state === 'holed') return;
  ctx.globalAlpha = alpha;
  if (ball.z > 0.2) {  // shadow when airborne
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(ball.x, ball.y, FR.BALL_R * 1.2, FR.BALL_R * 0.7, 0, 0, Math.PI * 2); ctx.fill();
  }
  var lift = ball.z * 3;
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.arc(ball.x + 0.8, ball.y + 1, FR.BALL_R, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.arc(ball.x, ball.y - lift, FR.BALL_R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = ring; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.arc(ball.x, ball.y - lift, FR.BALL_R, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

/* ---------------- public API ---------------- */
function startCommon(match, mode, onDone) {
  var g = newSession(match, mode, onDone);
  initPool(g);
  g.courseCv = renderCourse(g.hole);
  G = g;
  if (window.__fr) window.__fr.scene = 'duel';
  // show duel scene
  ['menu', 'versus', 'duel', 'results', 'bag'].forEach(function (n) {
    document.getElementById('sc-' + n).classList.toggle('on', n === 'duel');
  });
  document.getElementById('fr-ticker').style.display = 'none';
  ban.style.display = 'none'; emotes.classList.remove('on');
  updateBug(); updateWind(); updateClubChip();
  $('fr-ballc').click();
  g.last = performance.now();
  g.raf = requestAnimationFrame(function (n) { frame(g, n); });
  if (mode === 'shootout') {
    ban.style.display = '';
    ban.innerHTML = '<span>SHOOTOUT — CLOSEST TO THE PIN</span>';
    setTimeout(function () { if (G === g) ban.style.display = 'none'; }, 2400);
    chyron('One shot each. Closest to the pin wins.', 2600);
  } else {
    chyron('Hole 1 · Par ' + g.hole.par + ' · ' + match.stageName, 2200);
    sfx('crowd', { gain: 0.5 });
  }
  beginMyAim(g);
  return g;
}
window.FRDuel = {
  start: function (match, onDone) { return startCommon(match, 'duel', onDone); },
  shootout: function (match, onDone) { return startCommon(match, 'shootout', onDone); },
  setPaused: function (p) {
    if (!G || G.done) return;
    if (p) { cancelAnimationFrame(G.raf); G.paused = true; }
    else if (G.paused) { G.paused = false; G.last = performance.now(); G.raf = requestAnimationFrame(function (n) { frame(G, n); }); }
  },
  clearInput: clearInput,
  resize: function () {},
  state: function () { return G; },
  ballScreen: function () {  // test hook: screen px of my ball
    if (!G) return null;
    var p = worldToScreen(G, G.me.x, G.me.y);
    var r = canvas.getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  },
  dbgShoot: function () {  // test hook: strike a sane shot toward the cup
    if (!G || G.phase !== 'myAim') return 'not-aiming';
    var dx = G.hole.cup.x - G.me.x, dy = G.hole.cup.y - G.me.y;
    var p = worldToScreen(G, G.me.x, G.me.y);
    var z = p.z;
    G.dragX = p.x - (dx / (Math.hypot(dx, dy) || 1)) * 90;
    G.dragY = p.y - (dy / (Math.hypot(dx, dy) || 1)) * 90;
    G.aiming = true; G.needleT = 0.05;
    strike(G, false);
    return 'struck';
  }
};

})();
