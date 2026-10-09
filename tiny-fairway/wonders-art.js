/* Tiny Fairway — Wonders of the World art (TFW)
 *
 * Render-only art module for the 7 wonder holes. One IIFE, 'use strict',
 * exposes window.TFW. Called by game.js (wiring):
 *   TFW.back(ctx, V, hole)     - background layer: palette wash, margin
 *                                silhouettes, ambient particles
 *   TFW.front(ctx, V, hole)    - foreground layer: sparkle on the wonder's
 *                                signature transport object
 *   TFW.tick(dt, hole)         - advance the ambient particle pool (every rAF)
 *   TFW.stampHTML(n, stamped)  - passport stamp HTML string (inline SVG icon)
 *   TFW.PALETTES               - the 7 palettes as data
 *
 * Hard rules honored: never mutates sim state (hole is read-only); no
 * per-frame allocation in hot paths (module-scope scratch temps, one pooled
 * particle pool with ring allocation); prefers-reduced-motion goes static;
 * visual RNG is render-only (TF.mulberry32 seeded streams).
 *
 * V shape (same as TPR.draw): {X, Y, sc, wtime, simTime, RM} where X(x)/Y(y)
 * are the game's world->screen closures (world is 56 x 96, y-up).
 */
(function () {
'use strict';

var TAU = Math.PI * 2;

var TFW = {};
window.TFW = TFW;

/* ---------------- reduced motion (read once) ---------------- */
var RM_STATIC = (typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  !!window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/* ---------------- palettes ----------------
 * wash1/wash2: subtle palette wash over the hole (must stay readable).
 * vig: tinted vignette color. sil/silDark: margin silhouette tones.
 * accent: highlight tone. pc: ambient particle color (alpha set per particle). */
TFW.PALETTES = {
  greatwall: {
    key: 'greatwall', name: 'Great Wall', sub: 'China',
    flavor: 'The dragon\u2019s spine, stone by stone.',
    wash1: 'rgba(31,111,79,0.15)', wash2: 'rgba(212,175,55,0.131)',
    vig: 'rgba(18,64,42,0.221)',
    sil: '#2c6b4e', silDark: '#1d4b36', accent: '#d4af37', pc: '#eaf6ee'
  },
  petra: {
    key: 'petra', name: 'Petra', sub: 'Jordan',
    flavor: 'Rose-red city, half as old as time.',
    wash1: 'rgba(181,83,60,0.15)', wash2: 'rgba(217,142,95,0.145)',
    vig: 'rgba(110,52,38,0.221)',
    sil: '#a34a35', silDark: '#7c3627', accent: '#e8a86a', pc: '#f2d3a8'
  },
  christ: {
    key: 'christ', name: 'Christ the Redeemer', sub: 'Rio de Janeiro',
    flavor: 'Arms open over the marvelous city.',
    wash1: 'rgba(29,158,143,0.135)', wash2: 'rgba(255,140,90,0.145)',
    vig: 'rgba(16,80,72,0.208)',
    sil: '#17756a', silDark: '#0f524b', accent: '#ffb26b', pc: '#ffe6a8'
  },
  machu: {
    key: 'machu', name: 'Machu Picchu', sub: 'Peru',
    flavor: 'The old peak, wrapped in cloud.',
    wash1: 'rgba(47,143,110,0.15)', wash2: 'rgba(207,230,216,0.145)',
    vig: 'rgba(24,80,62,0.221)',
    sil: '#2b7d5f', silDark: '#1e5a44', accent: '#cfe8d8', pc: '#e4f3e9'
  },
  chichen: {
    key: 'chichen', name: 'Chichen Itza', sub: 'Yucatan',
    flavor: 'The feathered serpent descends at dusk.',
    wash1: 'rgba(232,220,192,0.18)', wash2: 'rgba(63,122,68,0.145)',
    vig: 'rgba(58,90,54,0.208)',
    sil: '#3f7a44', silDark: '#2c5a31', accent: '#e8dcc0', pc: '#ffe27a'
  },
  colosseum: {
    key: 'colosseum', name: 'Colosseum', sub: 'Rome',
    flavor: 'Fifty thousand voices, stone on stone.',
    wash1: 'rgba(217,201,168,0.18)', wash2: 'rgba(47,93,67,0.131)',
    vig: 'rgba(100,82,54,0.208)',
    sil: '#8a6f45', silDark: '#66522f', accent: '#2f5d43', pc: '#fff6dd'
  },
  taj: {
    key: 'taj', name: 'Taj Mahal', sub: 'Agra',
    flavor: 'A teardrop on the cheek of time.',
    wash1: 'rgba(244,239,228,0.15)', wash2: 'rgba(79,158,196,0.16)',
    vig: 'rgba(70,100,120,0.208)',
    sil: '#7d94a6', silDark: '#5c7484', accent: '#4f9ec4', pc: '#ffcdd7'
  }
};

/* wonder number -> key (supports hole.wonder.n); hole.wonderArt takes precedence */
var KEY_BY_N = { 1: 'greatwall', 2: 'petra', 3: 'christ', 4: 'machu',
                 5: 'chichen', 6: 'colosseum', 7: 'taj' };
var ORDER = ['greatwall', 'petra', 'christ', 'machu', 'chichen', 'colosseum', 'taj'];

function wonderKey(hole) {
  if (!hole) return null;
  if (typeof hole.wonderArt === 'string' && TFW.PALETTES[hole.wonderArt]) return hole.wonderArt;
  if (hole.wonder && hole.wonder.n) {
    var k = KEY_BY_N[hole.wonder.n | 0];
    if (k) return k;
  }
  return null;
}

/* signature transport object per wonder (task spec) */
var SIG_ARR = { greatwall: 'pads', petra: 'portals', christ: 'cannons',
                machu: 'lifts', chichen: 'loops', colosseum: 'wells', taj: 'tubes' };
/* ambient particle kind per wonder: 0 dust 1 streak 2 mist 3 firefly 4 pollen 5 petal 6 spark */
var KIND_BY_KEY = { greatwall: 1, petra: 0, christ: 6, machu: 2,
                    chichen: 3, colosseum: 4, taj: 5 };

/* ---------------- view cache (module-scope scratch) ---------------- */
var _C = null;
var _X = null, _Y = null, _SC = 1;
var _WT = 0, _ST = 0, _RM = false;
function cacheView(ctx, V) {
  _C = ctx;
  _X = V.X; _Y = V.Y; _SC = V.sc || 1;
  _WT = V.wtime || 0; _ST = V.simTime || 0; _RM = !!(V.RM || RM_STATIC);
}

/* ---------------- visual RNG (render-only) ---------------- */
var _vr = (typeof TF !== 'undefined' && TF.mulberry32)
  ? TF.mulberry32((Date.now() & 0xffff) >>> 0)
  : function () { return Math.random(); };
function vr() { return _vr(); }

/* ---------------- world-space draw helpers ---------------- */
function wrect(x, y, w, h, fill) {   // world rect, x/y = center
  _C.fillStyle = fill;
  _C.fillRect(_X(x - w / 2), _Y(y + h / 2), w * _SC, h * _SC);
}
function wpoly(pts, fill) {          // pts = flat [x0,y0,x1,y1,...]
  var n = pts.length, i;
  _C.fillStyle = fill;
  _C.beginPath();
  _C.moveTo(_X(pts[0]), _Y(pts[1]));
  for (i = 2; i < n; i += 2) _C.lineTo(_X(pts[i]), _Y(pts[i + 1]));
  _C.closePath(); _C.fill();
}
function wline(x1, y1, x2, y2, wWorld, style) {
  _C.strokeStyle = style;
  _C.lineWidth = Math.max(1, wWorld * _SC);
  _C.lineCap = 'round';
  _C.beginPath();
  _C.moveTo(_X(x1), _Y(y1)); _C.lineTo(_X(x2), _Y(y2));
  _C.stroke();
  _C.lineCap = 'butt';
}
function wdisc(x, y, rWorld, fill) {
  _C.fillStyle = fill;
  _C.beginPath();
  _C.arc(_X(x), _Y(y), Math.max(0.5, rWorld * _SC), 0, TAU);
  _C.fill();
}
function wellipse(x, y, rx, ry, fill) {
  _C.fillStyle = fill;
  _C.beginPath();
  _C.ellipse(_X(x), _Y(y), Math.max(0.5, rx * _SC), Math.max(0.5, ry * _SC), 0, 0, TAU);
  _C.fill();
}
function shShadow(cx, cy, w, h) {    // soft ground shadow under a silhouette
  _C.fillStyle = 'rgba(0,0,0,0.18)';
  _C.beginPath();
  _C.ellipse(_X(cx) + 2, _Y(cy) + 3, w * _SC / 2, h * _SC / 2, 0, 0, TAU);
  _C.fill();
}

/* ---------------- play-area key points (silhouettes must avoid these) ---------------- */
var _kpX = new Float32Array(72), _kpY = new Float32Array(72), _kpN = 0;
function kp(x, y) {
  if (_kpN < 72 && x === x && y === y && x > -50 && x < 120 && y > -50 && y < 150) {
    _kpX[_kpN] = x; _kpY[_kpN] = y; _kpN++;
  }
}
function kpPt(p) { if (p) kp(p.x, p.y); }
function collectKeys(hole) {
  _kpN = 0;
  var i, a, n;
  kpPt(hole.tee); kpPt(hole.cup); kpPt(hole.green);
  if (hole.fairway) for (i = 0, n = hole.fairway.length; i < n; i++) {
    a = hole.fairway[i]; kp(a.x1, a.y1); kp(a.x2, a.y2);
  }
  var groups = ['water', 'sand', 'dunes', 'mounds', 'pads', 'wells', 'loops'];
  for (var g = 0; g < groups.length; g++) {
    a = hole[groups[g]];
    if (a) for (i = 0, n = a.length; i < n; i++) kpPt(a[i]);
  }
  a = hole.portals;
  if (a) for (i = 0, n = a.length; i < n; i++) { kp(a[i].x1, a[i].y1); kp(a[i].x2, a[i].y2); }
  a = hole.cannons;
  if (a) for (i = 0, n = a.length; i < n; i++) kpPt(a[i]);
  a = hole.tubes;
  if (a) for (i = 0, n = a.length; i < n; i++)
    if (a[i].path && a[i].path.length) kp(a[i].path[0][0], a[i].path[0][1]);
  a = hole.lifts;
  if (a) for (i = 0, n = a.length; i < n; i++) { kp(a[i].x1, a[i].y1); kp(a[i].x2, a[i].y2); }
  a = hole.belts;
  if (a) for (i = 0, n = a.length; i < n; i++) kpPt(a[i]);
}

/* ---------------- margin anchor: pick the corner/edge-mid farthest from play ---------------- */
var _candX = [8, 48, 8, 48, 28, 28, 8, 48];
var _candY = [8, 8, 88, 88, 8, 88, 48, 48];
var _anchor = { x: 8, y: 88, clear: 20 };
function findAnchor() {
  var bi = 0, best = -1, c, i, dx, dy, d, m;
  for (c = 0; c < 8; c++) {
    m = 1e9;
    for (i = 0; i < _kpN; i++) {
      dx = _candX[c] - _kpX[i]; dy = _candY[c] - _kpY[i];
      d = Math.sqrt(dx * dx + dy * dy);
      if (d < m) m = d;
    }
    if (m > best) { best = m; bi = c; }
  }
  _anchor.x = _candX[bi]; _anchor.y = _candY[bi]; _anchor.clear = best;
  return _anchor;
}

/* ---------------- palette wash: subtle tint + tinted vignette ---------------- */
function drawWash(P) {
  var vx0 = _X(-8), vx1 = _X(64), vy0 = _Y(104), vy1 = _Y(-8);
  var vw = vx1 - vx0, vh = vy1 - vy0;
  var g = _C.createLinearGradient(0, vy0, 0, vy1);
  g.addColorStop(0, P.wash1);
  g.addColorStop(1, P.wash2);
  _C.fillStyle = g;
  _C.fillRect(vx0, vy0, vw, vh);
  var cxp = _X(28), cyp = _Y(48);
  var r0 = Math.min(vw, vh) * 0.32, r1 = Math.max(vw, vh) * 0.72;
  var rg = _C.createRadialGradient(cxp, cyp, r0, cxp, cyp, r1);
  rg.addColorStop(0, 'rgba(0,0,0,0)');
  rg.addColorStop(1, P.vig);
  _C.fillStyle = rg;
  _C.fillRect(vx0, vy0, vw, vh);
}

/* ================================================================
 * Silhouettes — flat-vector monuments in the rough margins.
 * Each takes (cx, cy, s, P): anchor center (world), size (world units),
 * palette. Nothing here may cover play: anchors are pre-cleared.
 * ================================================================ */

function silGreatWall(cx, cy, s, P) {
  var wallW = s * 1.5, wallH = s * 0.30, wy = cy - 0.5;
  shShadow(cx, wy - wallH / 2, wallW, 2.2);
  wrect(cx, wy, wallW, wallH, P.sil);                       // ribbon
  wrect(cx, wy - wallH / 2 + 0.25, wallW, 0.5, P.silDark);  // base course
  var n = Math.floor(wallW / 1.7), m, mx;                   // crenellations
  for (m = 0; m <= n; m++) {
    mx = cx - wallW / 2 + 0.85 + m * 1.7;
    wrect(mx, wy + wallH / 2 + 0.28, 0.95, 0.56, P.silDark);
  }
  var tx = cx - wallW / 2 + 1.8, tq = 3.0;                  // watchtower
  wrect(tx, wy + wallH / 2 + tq / 2 - 0.2, tq, tq, P.silDark);
  wpoly([tx - tq / 2 - 0.5, wy + wallH / 2 + tq - 0.2,
         tx + tq / 2 + 0.5, wy + wallH / 2 + tq - 0.2,
         tx, wy + wallH / 2 + tq + 1.5], P.accent);         // roof
  wrect(tx, wy + wallH / 2 + tq / 2 + 0.2, 0.7, 1.0, P.accent);  // window
}

function silPetra(cx, cy, s, P) {
  var hw = 4.2, hh = 5.2, i;
  shShadow(cx, cy - hh, hw * 3.1, 1.6);
  var lpts = [cx - hw - 2.6, cy - hh, cx - hw - 1.2, cy - hh + 1.6,
              cx - hw - 2.2, cy - hh + 3.2, cx - hw - 1.0, cy - hh + 4.6,
              cx - hw - 2.0, cy - hh + 6.2, cx - hw - 1.1, cy - hh + 7.8,
              cx - hw - 2.4, cy + hh, cx - 1.4, cy + hh, cx - 1.4, cy - hh];
  var rpts = [cx + 1.4, cy - hh, cx + hw + 2.4, cy - hh, cx + hw + 1.1, cy - hh + 1.6,
              cx + hw + 2.0, cy - hh + 3.0, cx + hw + 1.0, cy - hh + 4.6,
              cx + hw + 2.2, cy - hh + 6.2, cx + hw + 1.2, cy - hh + 8.0,
              cx + hw + 2.6, cy + hh, cx + 1.4, cy + hh];
  wpoly(lpts, P.sil);
  wpoly(rpts, P.sil);
  for (i = 0; i < 4; i++) {                                 // strata bands
    var sy = cy - hh + 1.8 + i * 2.4;
    wline(cx - hw - 2.2, sy, cx - 1.4, sy + 0.5, 0.28, 'rgba(0,0,0,0.28)');
    wline(cx + 1.4, sy - 0.5, cx + hw + 2.2, sy, 0.28, 'rgba(0,0,0,0.28)');
  }
  wrect(cx - hw - 1.7, cy - 1.2, 1.3, 1.9, P.silDark);       // carved doorway
  wrect(cx - hw - 1.7, cy - 0.15, 1.5, 0.28, P.accent);      // gold lintel
}

function silChrist(cx, cy, s, P) {
  wdisc(cx + 3.6, cy + 2.6, 1.7, 'rgba(255,178,107,0.55)');  // sunset sun
  shShadow(cx, cy - 4.5, 13.5, 1.6);
  wpoly([cx - 6.5, cy - 4.5, cx + 6.5, cy - 4.5, cx - 0.5, cy + 4.0], P.sil);
  wline(cx - 0.5, cy + 4.0, cx - 3.4, cy - 1.2, 0.35, P.silDark);  // ridge
  var px = cx - 0.5, py = cy + 4.0;                         // the statue
  wrect(px, py + 1.15, 0.55, 2.1, P.silDark);               // body
  wrect(px, py + 1.75, 2.5, 0.5, P.silDark);                // open arms
  wdisc(px, py + 2.5, 0.38, P.silDark);                     // head
  wdisc(px, py + 2.5, 0.16, P.accent);                      // halo dot
}

function silMachu(cx, cy, s, P) {
  wpoly([cx - 7.5, cy - 3, cx + 4.5, cy - 3, cx - 2, cy + 5.5], P.silDark);  // peak
  shShadow(cx - 1, cy - 4.5, 12.5, 1.6);
  var w0 = 12, t, tw;
  for (t = 0; t < 4; t++) {                                 // terraced steps
    tw = w0 - t * 2;
    var ty = cy - 4.5 + 0.75 + t * 1.5;
    wrect(cx - 1, ty, tw, 1.5, t % 2 ? P.silDark : P.sil);
    wline(cx - 1 - tw / 2, ty - 0.75, cx - 1 + tw / 2, ty - 0.75, 0.3, 'rgba(0,0,0,0.30)');
  }
  wrect(cx - 1, cy + 2.2, 2.1, 1.5, P.silDark);              // hut
  wpoly([cx - 1 - 1.35, cy + 2.95, cx - 1 + 1.35, cy + 2.95, cx - 1, cy + 4.1], P.accent);
}

function silChichen(cx, cy, s, P) {
  shShadow(cx, cy - 4.8, 12.5, 1.6);
  wrect(cx, cy - 4.4, 13.5, 1.2, P.sil);                    // jungle base strip
  var tiers = 5, t, tw, ty;
  for (t = 0; t < tiers; t++) {                             // stepped pyramid
    tw = 11.5 - t * 1.9;
    ty = cy - 3.7 + 0.575 + t * 1.15;
    wrect(cx, ty, tw, 1.15, P.accent);
    wline(cx - tw / 2, ty - 0.575, cx + tw / 2, ty - 0.575, 0.22, P.silDark);
  }
  var topY = cy - 3.7 + tiers * 1.15;
  wline(cx, cy - 3.7, cx, topY, 1.7, '#f6efdb');            // central stair
  wrect(cx, topY + 0.95, 3.4, 1.9, P.accent);               // temple
  wpoly([cx - 2.0, topY + 1.9, cx + 2.0, topY + 1.9, cx, topY + 3.0], P.silDark);
  wrect(cx, topY + 0.8, 0.9, 1.1, P.silDark);               // doorway
}

function silColosseum(cx, cy, s, P) {
  shShadow(cx, cy - 0.3, 14.5, 2.4);
  wellipse(cx, cy, 6.8, 4.4, P.sil);                        // outer wall
  _C.strokeStyle = P.silDark; _C.lineWidth = Math.max(1.5, 0.35 * _SC);
  _C.beginPath();
  _C.ellipse(_X(cx), _Y(cy), 6.8 * _SC, 4.4 * _SC, 0, 0, TAU);
  _C.stroke();
  var k, ka, ax, ay;
  for (k = 0; k < 10; k++) {                                // arcade openings
    ka = (k / 10) * TAU + 0.31;
    ax = cx + Math.cos(ka) * 5.25; ay = cy + Math.sin(ka) * 3.3;
    wellipse(ax, ay, 0.62, 1.15, P.silDark);
  }
  wellipse(cx, cy, 3.7, 2.15, P.silDark);                   // arena floor
  wellipse(cx, cy, 3.7, 2.15, 'rgba(255,255,255,0.06)');    // floor sheen
  wpoly([cx - 8.6, cy - 4.2, cx - 7.6, cy - 4.2, cx - 8.1, cy + 0.5], P.accent);   // cypress
  wpoly([cx + 7.6, cy - 4.2, cx + 8.6, cy - 4.2, cx + 8.1, cy + 0.8], P.accent);
}

function silTaj(cx, cy, s, P) {
  shShadow(cx, cy - 5.2, 13, 1.8);
  wellipse(cx, cy - 6.4, 5.4, 1.1, 'rgba(79,158,196,0.45)'); // reflecting pool
  wline(cx - 4.4, cy - 6.2, cx + 3.4, cy - 6.2, 0.25, 'rgba(255,255,255,0.65)');
  wrect(cx, cy - 4.4, 12.5, 1.1, P.silDark);                // platform
  wrect(cx, cy - 2.75, 7.5, 2.2, P.sil);                    // base block
  wrect(cx - 2.4, cy - 2.75, 0.9, 1.4, P.silDark);          // side arches
  wrect(cx + 2.4, cy - 2.75, 0.9, 1.4, P.silDark);
  wrect(cx, cy - 0.75, 3.6, 1.8, P.sil);                    // drum
  var dt2 = cy + 0.15;                                      // onion dome
  _C.fillStyle = '#f7f3e8';
  _C.beginPath();
  _C.moveTo(_X(cx - 1.8), _Y(dt2));
  _C.bezierCurveTo(_X(cx - 2.7), _Y(dt2 + 1.2), _X(cx - 1.5), _Y(dt2 + 2.4),
                   _X(cx), _Y(dt2 + 3.4));
  _C.bezierCurveTo(_X(cx + 1.5), _Y(dt2 + 2.4), _X(cx + 2.7), _Y(dt2 + 1.2),
                   _X(cx + 1.8), _Y(dt2));
  _C.closePath(); _C.fill();
  wline(cx, dt2 + 3.4, cx, dt2 + 4.3, 0.28, P.accent);       // finial
  wdisc(cx, dt2 + 4.45, 0.28, P.accent);
  var m, mxx;                                               // minarets
  for (m = 0; m < 2; m++) {
    mxx = m === 0 ? cx - 5.6 : cx + 5.6;
    wrect(mxx, cy - 1.4, 0.85, 5.0, P.sil);
    wdisc(mxx, cy + 1.35, 0.62, P.silDark);
    wrect(mxx, cy - 4.15, 1.3, 0.5, P.silDark);
  }
}

var SIL_FN = { greatwall: silGreatWall, petra: silPetra, christ: silChrist,
               machu: silMachu, chichen: silChichen, colosseum: silColosseum, taj: silTaj };

/* ---------------- ambient particle pool: fixed 96, ring allocation ---------------- */
var POOL_N = 96;
var _pool = [];
var _pNext = 0;
(function initPool() {
  for (var k = 0; k < POOL_N; k++)
    _pool.push({ x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 0, size: 0.3, kind: 0, ph: 0, col: '#fff' });
})();
var _emitAcc = 0;
var _activeKind = 0;

function spawnAmbient(key, P) {
  var p = _pool[_pNext];
  _pNext = (_pNext + 1) % POOL_N;
  var kind = KIND_BY_KEY[key] || 0;
  p.kind = kind; p.ph = vr() * TAU; p.t = 0; p.col = P ? P.pc : '#fff';
  p.x = -4 + vr() * 64; p.y = -2 + vr() * 100;
  if (kind === 1) {          // great wall: wind streaks
    p.vx = 14 + vr() * 8; p.vy = (vr() - 0.5) * 3;
    p.life = 2 + vr() * 1.5; p.size = 1.4 + vr() * 0.8;
  } else if (kind === 0) {   // petra: desert dust motes
    p.vx = 1.2 + vr() * 1.4; p.vy = 0.6 + vr() * 0.8;
    p.life = 5 + vr() * 3; p.size = 0.4 + vr() * 0.4;
  } else if (kind === 2) {   // machu: jungle mist wisps
    p.vx = 0.4 + vr() * 0.6; p.vy = 1.0 + vr() * 0.8;
    p.life = 7 + vr() * 4; p.size = 1.4 + vr() * 1.2;
  } else if (kind === 3) {   // chichen: fireflies
    p.vx = (vr() - 0.5) * 1.6; p.vy = (vr() - 0.5) * 1.2;
    p.life = 4 + vr() * 3; p.size = 0.3 + vr() * 0.2;
  } else if (kind === 4) {   // colosseum: cypress pollen
    p.vx = 0.3 + vr() * 0.5; p.vy = -(0.8 + vr() * 0.7);
    p.life = 6 + vr() * 3; p.size = 0.25 + vr() * 0.2;
  } else if (kind === 5) {   // taj: petals
    p.vx = 0.6 + vr() * 0.6; p.vy = -(1.1 + vr() * 0.8);
    p.life = 8 + vr() * 4; p.size = 0.42 + vr() * 0.25;
  } else {                   // christ: cable-car sparkle
    p.vx = (vr() - 0.5) * 1.2; p.vy = 2.0 + vr() * 1.6;
    p.life = 3 + vr() * 1.5; p.size = 0.35 + vr() * 0.25;
  }
}

function tickPool(dt) {
  var i, p;
  for (i = 0; i < POOL_N; i++) {
    p = _pool[i];
    if (p.life <= 0) continue;
    p.t += dt;
    if (p.t >= p.life) { p.life = 0; continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
}

/* tick: advance ambient emitters. Static when reduced-motion. */
var _lastKey = null;
TFW.tick = function (dt, hole) {
  if (RM_STATIC || _RM) return;
  var key = wonderKey(hole);
  if (!key) return;
  if (key !== _lastKey) {        // new wonder hole: clear old ambience, no bleed-through
    _lastKey = key;
    _emitAcc = 0;
    for (var ci = 0; ci < POOL_N; ci++) _pool[ci].life = 0;
  }
  if (dt > 0.1) dt = 0.1;   // clamped like every game loop
  _activeKind = KIND_BY_KEY[key] || 0;
  _emitAcc += dt * 8;
  var n = Math.floor(_emitAcc);
  _emitAcc -= n;
  while (n-- > 0) spawnAmbient(key, TFW.PALETTES[key]);
  tickPool(dt);
};

function drawSparkGlyph(sx, sy, r, col) {
  _C.fillStyle = col;
  _C.beginPath();
  _C.moveTo(sx, sy - r);
  _C.quadraticCurveTo(sx, sy, sx + r, sy);
  _C.quadraticCurveTo(sx, sy, sx, sy + r);
  _C.quadraticCurveTo(sx, sy, sx - r, sy);
  _C.quadraticCurveTo(sx, sy, sx, sy - r);
  _C.fill();
}

function drawParticles() {
  var i, p, a, px, py, fade;
  for (i = 0; i < POOL_N; i++) {
    p = _pool[i];
    if (p.life <= 0) continue;
    fade = 1 - p.t / p.life;
    fade = fade * fade;
    px = _X(p.x); py = _Y(p.y);
    if (p.kind === 1) {                        // wind streak
      _C.globalAlpha = 0.5 * fade;
      _C.strokeStyle = p.col; _C.lineWidth = Math.max(1, 0.35 * _SC);
      _C.lineCap = 'round';
      _C.beginPath();
      _C.moveTo(px, py);
      _C.lineTo(px - p.vx * _SC * 0.12, py - p.vy * _SC * 0.12);
      _C.stroke(); _C.lineCap = 'butt';
    } else if (p.kind === 2) {                 // mist wisp
      _C.globalAlpha = 0.08 * fade;
      _C.fillStyle = p.col;
      _C.beginPath(); _C.arc(px, py, p.size * _SC, 0, TAU); _C.fill();
    } else if (p.kind === 3) {                 // firefly: warm core + halo
      a = 0.35 + 0.3 * Math.sin(_WT * 4 + p.ph);
      _C.globalAlpha = Math.max(0.08, a) * fade;
      _C.fillStyle = p.col;
      _C.beginPath(); _C.arc(px, py, p.size * _SC * 2.2, 0, TAU); _C.fill();
      _C.globalAlpha = 0.95 * fade;
      _C.beginPath(); _C.arc(px, py, p.size * _SC, 0, TAU); _C.fill();
    } else if (p.kind === 5) {                 // petal: swaying ellipse
      _C.globalAlpha = 0.75 * fade;
      _C.fillStyle = p.col;
      _C.save();
      _C.translate(px + Math.sin(_WT * 1.7 + p.ph) * _SC * 0.8, py);
      _C.rotate(p.ph + p.t * 0.8);
      _C.beginPath();
      _C.ellipse(0, 0, p.size * _SC, p.size * _SC * 0.55, 0, 0, TAU);
      _C.fill();
      _C.restore();
    } else if (p.kind === 6) {                 // cable-car sparkle
      a = _RM ? 0.5 : (0.3 + 0.45 * Math.abs(Math.sin(_WT * 3 + p.ph)));
      _C.globalAlpha = a * fade;
      drawSparkGlyph(px, py, p.size * _SC * 1.6, p.col);
    } else {                                   // dust / pollen dots
      _C.globalAlpha = 0.55 * fade;
      _C.fillStyle = p.col;
      _C.beginPath(); _C.arc(px, py, p.size * _SC, 0, TAU); _C.fill();
    }
  }
  _C.globalAlpha = 1;
}

/* ================================================================
 * Beacons — watchtower braziers for the Great Wall flame-gate chain.
 * Stone bases draw in the back layer (under the ball); flames, the armed
 * tease, and the golden cascade draw in front. Reads hole._beacon
 * {next, lit[], n, finalT} — never mutates sim state. Static when RM.
 * ================================================================ */
function beaconList(hole) {
  return (hole && hole.beacons && hole.beacons.length) ? hole.beacons : null;
}
function drawBrazierBase(b, P) {
  var x = b.x, y = b.y;
  shShadow(x, y - 0.6, 3.6, 1.2);
  wrect(x, y - 1.1, 1.1, 1.5, P.silDark);              // pedestal
  wellipse(x, y + 0.1, 1.75, 1.0, '#454b58');          // bowl
  wellipse(x, y + 0.28, 1.15, 0.62, '#23262e');        // bowl inner
  _C.strokeStyle = 'rgba(255,255,255,0.14)';
  _C.lineWidth = Math.max(1, 0.16 * _SC);
  _C.beginPath();
  _C.ellipse(_X(x), _Y(y + 0.1), 1.75 * _SC, 1.0 * _SC, 0, Math.PI, TAU);
  _C.stroke();
}
function drawBeaconsBack(hole, P) {
  var arr = beaconList(hole), i;
  if (!arr) return;
  for (i = 0; i < arr.length; i++) drawBrazierBase(arr[i], P);
}
function drawFlame(x, y, s, flick) {
  var h1 = 2.6 * s * flick, h2 = 1.8 * s * flick, h3 = 1.1 * s * flick;
  wpoly([x - 0.85 * s, y, x + 0.85 * s, y, x + 0.12 * s * flick, y + h1], '#ff8c42');
  wpoly([x - 0.55 * s, y, x + 0.55 * s, y, x - 0.10 * s * flick, y + h2], '#ffc44d');
  wpoly([x - 0.30 * s, y, x + 0.30 * s, y, x, y + h3], '#fff3c4');
}
function drawBeaconsFront(hole, P) {
  var arr = beaconList(hole), i, e, b, x, y, lit, armed;
  if (!arr) return;
  var st = hole._beacon || null;
  for (i = 0; i < arr.length; i++) {
    b = arr[i]; x = b.x; y = b.y + 0.5;
    lit = !!(st && st.lit && st.lit[i]);
    armed = !!(!lit && st && st.next === i);
    if (armed) {
      // the next beacon in the chain glows invitingly
      var pu = _RM ? 0.30 : 0.22 + 0.14 * Math.sin(_WT * 4 + i);
      wdisc(x, y, 2.6, 'rgba(212,175,55,' + pu + ')');
      drawSparkGlyph(_X(x), _Y(y + 1.2), 1.3 * _SC, P.accent);
    }
    if (lit) {
      wdisc(x, y, 3.4, 'rgba(255,150,50,0.18)');
      wdisc(x, y, 2.2, 'rgba(255,190,80,0.28)');
      var fl = _RM ? 1 : 1 + 0.14 * Math.sin(_WT * 13 + x * 2.1 + i);
      drawFlame(x, y + 0.4, 1, fl);
      if (!_RM) {
        for (e = 0; e < 3; e++) {
          var ph = (_WT * 1.6 + e * 0.53 + i * 0.31) % 1;
          var exx = x + Math.sin(_WT * 3 + e * 2.1 + i) * 0.55;
          var eyy = y + 1.0 + ph * 2.2;
          _C.globalAlpha = 0.85 * (1 - ph);
          wdisc(exx, eyy, 0.22, '#ffcf7a');
        }
        _C.globalAlpha = 1;
      }
    }
  }
  // golden cascade: after the final beacon lights, flares run down the wall
  if (st && st.finalT >= 0) {
    var ct = _ST - st.finalT, j, jt, q;
    if (ct >= 0 && ct < 2.2) {
      for (j = 0; j < arr.length; j++) {
        jt = ct - j * 0.16;
        if (jt < 0 || jt > 0.9) continue;
        q = jt / 0.9;
        _C.globalAlpha = (1 - q) * 0.9;
        _C.strokeStyle = '#ffd166';
        _C.lineWidth = Math.max(2, 0.4 * _SC * (1 - q * 0.5));
        _C.beginPath();
        _C.arc(_X(arr[j].x), _Y(arr[j].y + 0.5), (1.2 + q * 5.5) * _SC, 0, TAU);
        _C.stroke();
        _C.globalAlpha = (1 - q) * 0.5;
        _C.fillStyle = '#ffe9a8';
        _C.beginPath();
        _C.arc(_X(arr[j].x), _Y(arr[j].y + 0.5), (1.2 + q * 2.5) * _SC, 0, TAU);
        _C.fill();
      }
      _C.globalAlpha = 1;
    }
  }
}

/* ---------------- back: palette wash + margin silhouette + ambient particles ---------------- */
TFW.back = function (ctx, V, hole) {
  if (!ctx || !V || !hole) return;
  var key = wonderKey(hole);
  if (!key) return;
  cacheView(ctx, V);
  var P = TFW.PALETTES[key];
  drawWash(P);
  collectKeys(hole);
  var an = findAnchor();
  var s = Math.max(8, Math.min(14, an.clear * 0.85));
  SIL_FN[key](an.x, an.y, s, P);
  drawBeaconsBack(hole, P);
  drawParticles();
};

/* ---------------- signature sparkle position ---------------- */
var _sig = { x: 0, y: 0, ok: false };
function sigPos(hole, key) {
  _sig.ok = false;
  var arr = hole[SIG_ARR[key]], o;
  if (!arr || !arr.length) return _sig;
  o = arr[0];
  if (key === 'petra') { _sig.x = o.x1; _sig.y = o.y1; }
  else if (key === 'christ') {
    var a = o.angle || 0;
    _sig.x = o.x + Math.cos(a) * 3.4; _sig.y = o.y + Math.sin(a) * 3.4;
  }
  else if (key === 'machu') { _sig.x = o.x1; _sig.y = o.y1; }
  else if (key === 'taj') {
    if (o.path && o.path.length) { _sig.x = o.path[0][0]; _sig.y = o.path[0][1]; }
    else return _sig;
  }
  else { _sig.x = o.x; _sig.y = o.y; }
  _sig.ok = (_sig.x === _sig.x && _sig.y === _sig.y);
  return _sig;
}

/* ---------------- front: sparkle on the wonder's signature transport object ---------------- */
var _SPK_OFFS = [[-1.6, -1.1, 0], [1.5, -0.7, 2.1], [0.2, 1.6, 4.2]];  // module-scope: no per-frame alloc
TFW.front = function (ctx, V, hole) {
  if (!ctx || !V || !hole) return;
  var key = wonderKey(hole);
  if (!key) return;
  cacheView(ctx, V);
  var P = TFW.PALETTES[key];
  drawBeaconsFront(hole, P);   // braziers (no-op when the hole has none)
  var sp = sigPos(hole, key);
  if (!sp.ok) return;
  var sx = _X(sp.x), sy = _Y(sp.y), r = 1.1 * _SC;
  var offs = _SPK_OFFS, k, tw, ox, oy;
  _C.globalAlpha = _RM ? 0.22 : 0.34;
  _C.fillStyle = P.accent;
  _C.beginPath(); _C.arc(sx, sy, r * 2.4, 0, TAU); _C.fill();
  _C.globalAlpha = 1;
  for (k = 0; k < 3; k++) {
    ox = offs[k][0] * _SC; oy = offs[k][1] * _SC;
    tw = _RM ? 1 : (0.6 + 0.5 * Math.sin(_WT * 3.2 + offs[k][2]));
    _C.globalAlpha = 0.9;
    drawSparkGlyph(sx + ox, sy + oy, r * 1.15 * tw, P.glow || P.accent);
    _C.globalAlpha = 0.95;
    _C.fillStyle = '#ffffff';
    _C.beginPath(); _C.arc(sx + ox, sy + oy, Math.max(1, r * 0.28 * tw), 0, TAU); _C.fill();
  }
  _C.globalAlpha = 1;
};

/* ================================================================
 * Passport stamps — inline SVG icons, canvas-drawn look, no emoji.
 * ================================================================ */
var _stampSeq = 0;
var STAMP_ICONS = {
  greatwall: '<rect x="8" y="30" width="32" height="10"/><path d="M8 30v-6h4v4h4v-4h4v4h4v-4h4v4h4v-4h4v4h4v-4h4v4h4v-4h4v6z"/>' +
             '<rect x="10" y="12" width="10" height="14"/><path d="M8 12l7-5 7 5z"/>',
  petra: '<path d="M10 40V12l4 3-2 4 4 3-2 4 4 3-2 4 4 3-2 4z"/>' +
         '<path d="M38 40V12l-4 3 2 4-4 3 2 4-4 3 2 4-4 3 2 4z"/>' +
         '<rect x="21" y="28" width="6" height="12"/>',
  christ: '<path d="M8 40l16-22 16 22z"/><rect x="22" y="8" width="4" height="12"/><rect x="17" y="12" width="14" height="3"/>',
  machu: '<rect x="10" y="34" width="28" height="6"/><rect x="14" y="27" width="22" height="7"/>' +
         '<rect x="18" y="20" width="15" height="7"/><rect x="22" y="13" width="8" height="7"/>' +
         '<path d="M8 40l8-12 8 12z"/>',
  chichen: '<path d="M6 40h36l-4-6h-5l-1.5-5h-4L26 24h-4l-1.5-5h-5L12 24H7z"/>' +
          '<rect x="23" y="29" width="2" height="11"/><rect x="20" y="8" width="8" height="6"/>',
  colosseum: '<ellipse cx="24" cy="26" rx="17" ry="11"/><ellipse cx="24" cy="26" rx="9" ry="5" fill="none" stroke-width="2"/>' +
             '<path d="M14 22v5M20 20v6M28 20v6M34 22v5" stroke-width="2.4"/>',
  taj: '<path d="M24 30c-4-3-6-6-6-9 0-4 3-6 6-9 3 3 6 5 6 9 0 3-2 6-6 9z"/>' +
       '<rect x="16" y="30" width="16" height="10"/>' +
       '<rect x="8" y="18" width="2.4" height="22"/><rect x="37.6" y="18" width="2.4" height="22"/>'
};
var STAMP_NAMES = { greatwall: 'Great Wall', petra: 'Petra', christ: 'Christ the Redeemer',
  machu: 'Machu Picchu', chichen: 'Chichen Itza', colosseum: 'Colosseum', taj: 'Taj Mahal' };

/* n = 1..7 (or key string). stamped = true/false. */
TFW.stampHTML = function (n, stamped) {
  var key = (typeof n === 'string' && TFW.PALETTES[n]) ? n : KEY_BY_N[n | 0];
  if (!key) key = 'greatwall';
  var P = TFW.PALETTES[key];
  var nm = STAMP_NAMES[key] || P.name;
  var icon = STAMP_ICONS[key] || '';
  var id = 'tfwg' + (++_stampSeq);
  var inner;
  if (stamped) {
    inner =
      '<svg viewBox="0 0 48 48" width="58" height="58" aria-hidden="true">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#fff3c4"/><stop offset="0.5" stop-color="#e9c767"/>' +
      '<stop offset="1" stop-color="#a97e1f"/></linearGradient></defs>' +
      '<circle cx="24" cy="24" r="22" fill="url(#' + id + ')"/>' +
      '<circle cx="24" cy="24" r="22" fill="none" stroke="#8a6a24" stroke-width="1.6"/>' +
      '<circle cx="24" cy="24" r="17.5" fill="none" stroke="#8a6a24" stroke-width="0.9" stroke-dasharray="3 2"/>' +
      '<g fill="#5c431a">' + icon + '</g>' +
      '<circle cx="15" cy="14" r="1.1" fill="#fff8dc"/><circle cx="34" cy="33" r="0.9" fill="#fff8dc"/>' +
      '</svg>';
    return '<span class="tfw-stamp tfw-on" title="' + nm + ' — stamped" ' +
      'style="display:inline-flex;flex-direction:column;align-items:center;gap:4px;width:76px;">' +
      inner +
      '<span style="font:600 10px/1.2 system-ui,sans-serif;color:#8a6a24;text-align:center;">' + nm + '</span></span>';
  }
  inner =
    '<svg viewBox="0 0 48 48" width="58" height="58" aria-hidden="true">' +
    '<circle cx="24" cy="24" r="22" fill="none" stroke="#9aa0a8" stroke-width="1.6" stroke-dasharray="5 3"/>' +
    '<g fill="#9aa0a8" opacity="0.55">' + icon + '</g>' +
    '</svg>';
  return '<span class="tfw-stamp" title="' + nm + ' — not yet stamped" ' +
    'style="display:inline-flex;flex-direction:column;align-items:center;gap:4px;width:76px;opacity:0.75;">' +
    inner +
    '<span style="font:600 10px/1.2 system-ui,sans-serif;color:#9aa0a8;text-align:center;">' + nm + '</span></span>';
};

})();
