/* Tiny Fairway — transport-object render + SFX (TPR)
 *
 * The RENDER + SFX half of the transport engine. One IIFE, 'use strict',
 * exposes window.TPR. Called by game.js:
 *   TPR.attachAudio(AU)  - once at boot; AU has blip/noise (no-op safe)
 *   TPR.tick(dt)          - every rAF; advances particles + ambient emitters
 *   TPR.draw(ctx,V,hole,ball) - draws ALL transport objects every frame
 *   TPR.drawCarried(ctx,V,hole,ball) - draws the carried ball, or returns false
 *   TPR.event(te)         - te={k,x,y}; SFX + one-shot fx per tevent name
 *
 * Hard rules honored: never mutates sim state (hole/ball are read-only);
 * own pooled particles (256 slots, ring alloc); module-scope scratch temps;
 * reduced-motion goes static. Visual RNG is render-only.
 */
(function () {
'use strict';

var TAU = Math.PI * 2;

var TPR = {};
window.TPR = TPR;

/* ---------------- reduced motion (read once) ---------------- */
var RM_STATIC = (typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  !!window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/* ---------------- audio ---------------- */
var AU = null;
TPR.attachAudio = function (au) { AU = au; };
function sBlip(f0, f1, dur, vol, type) { if (AU) AU.blip(f0, f1, dur, vol, type); }
function sNoise(dur, vol, fFrom, fTo, type) { if (AU) AU.noise(dur, vol, fFrom, fTo, type); }

/* ---------------- visual RNG (render-only) ---------------- */
var _vr = TF.mulberry32((Date.now() & 0xffff) >>> 0);
function vr() { return _vr(); }

/* ---------------- view cache (module-scope scratch) ---------------- */
var _C = null;      // ctx
var _X = null, _Y = null, _SC = 1;
var _WT = 0, _ST = 0, _RM = false;
var _hole = null, _ball = null;
function cacheView(ctx, V) {
  _C = ctx;
  _X = V.X; _Y = V.Y; _SC = V.sc || 1;
  _WT = V.wtime || 0; _ST = V.simTime || 0; _RM = !!V.RM;
}
function rmx() { return RM_STATIC || _RM; }
function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
function sstep(x) { x = clamp01(x); return x * x * (3 - 2 * x); }

/* ---------------- particle pool: fixed 256, ring allocation ---------------- */
var POOL_N = 256;
var _pool = [];
var _pNext = 0;
(function initPool() {
  for (var k = 0; k < POOL_N; k++) {
    _pool.push({ x: 0, y: 0, vx: 0, vy: 0, t: 1, life: 1, size: 0.2, col: '#fff', grav: 0 });
  }
})();
function spawn(x, y, vx, vy, life, size, col, grav) {
  var p = _pool[_pNext];
  _pNext = (_pNext + 1) & (POOL_N - 1);
  p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.t = 0; p.life = life; p.size = size; p.col = col; p.grav = grav;
}
/* burst helper: n particles around (x,y), speed range [s0,s1], life range */
function burst(x, y, n, s0, s1, life, size, col, grav) {
  var count = rmx() ? Math.max(1, n >> 2) : n;
  for (var b = 0; b < count; b++) {
    var a = vr() * TAU, sp = s0 + vr() * (s1 - s0);
    spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
      life * (0.7 + vr() * 0.6), size, col, grav);
  }
}

/* ---------------- one-shot ring fx: fixed 32 slots ---------------- */
var RING_N = 32;
var _rings = [];
var _rNext = 0;
(function initRings() {
  for (var k = 0; k < RING_N; k++) {
    _rings.push({ x: 0, y: 0, t: 1, life: 1, r0: 0, r1: 1, col: '#fff', lw: 2 });
  }
})();
function spawnRing(x, y, life, r0, r1, col, lw) {
  var r = _rings[_rNext];
  _rNext = (_rNext + 1) & (RING_N - 1);
  r.x = x; r.y = y; r.t = 0; r.life = life;
  r.r0 = r0; r.r1 = r1; r.col = col; r.lw = lw;
}
function drawRings() {
  var i, r, q, rad;
  for (i = 0; i < RING_N; i++) {
    r = _rings[i];
    if (r.t >= r.life) continue;
    q = r.t / r.life;
    rad = (r.r0 + (r.r1 - r.r0) * q) * _SC;
    _C.globalAlpha = 1 - q;
    _C.strokeStyle = r.col;
    _C.lineWidth = r.lw;
    _C.beginPath(); _C.arc(_X(r.x), _Y(r.y), Math.max(0.5, rad), 0, TAU); _C.stroke();
  }
  _C.globalAlpha = 1;
}
function drawParticles() {
  var i, p, a, pr;
  _C.save();
  _C.globalCompositeOperation = 'lighter';
  for (i = 0; i < POOL_N; i++) {
    p = _pool[i];
    if (p.t >= p.life) continue;
    a = 1 - p.t / p.life;
    pr = Math.max(0.4, p.size * _SC * a);
    _C.globalAlpha = a;
    _C.fillStyle = p.col;
    _C.beginPath(); _C.arc(_X(p.x), _Y(p.y), pr, 0, TAU); _C.fill();
  }
  _C.restore();
}

/* ---------------- shared draw helpers ---------------- */
function _rr(x, y, w, h, r) {
  _C.beginPath();
  _C.moveTo(x + r, y);
  _C.arcTo(x + w, y, x + w, y + h, r);
  _C.arcTo(x + w, y + h, x, y + h, r);
  _C.arcTo(x, y + h, x, y, r);
  _C.arcTo(x, y, x + w, y, r);
  _C.closePath();
}
function softShadow(bx, by, rx, ry) {
  _C.fillStyle = 'rgba(0,0,0,0.22)';
  _C.beginPath(); _C.ellipse(bx + 2, by + 3, rx, ry, 0, 0, TAU); _C.fill();
}
/* ball sprite matching game.js: white ball, offset shadow, top-left glint */
function drawBallAt(wx, wy, scale, liftW) {
  var bx = _X(wx), by = _Y(wy);
  var br = Math.max(3.5, TF.BALL_R * _SC) * scale;
  var lz = liftW || 0;
  _C.fillStyle = 'rgba(0,0,0,' + Math.max(0.08, 0.25 - lz * 0.03).toFixed(3) + ')';
  _C.beginPath();
  _C.ellipse(bx + 1.5 + lz * 2, by + 2.5 + lz * 2.5, br * 0.95, br * 0.8, 0, 0, TAU);
  _C.fill();
  var ay = by - lz * _SC;
  _C.fillStyle = '#ffffff';
  _C.beginPath(); _C.arc(bx, ay, br, 0, TAU); _C.fill();
  _C.strokeStyle = 'rgba(0,0,0,0.18)'; _C.lineWidth = 1;
  _C.beginPath(); _C.arc(bx, ay, br, 0, TAU); _C.stroke();
  _C.fillStyle = 'rgba(255,255,255,0.9)';
  _C.beginPath(); _C.arc(bx - br * 0.3, ay - br * 0.3, br * 0.28, 0, TAU); _C.fill();
}
function strokePolyline(pts, wWorld, style) {
  var i;
  _C.beginPath();
  _C.moveTo(_X(pts[0][0]), _Y(pts[0][1]));
  for (i = 1; i < pts.length; i++) _C.lineTo(_X(pts[i][0]), _Y(pts[i][1]));
  _C.lineWidth = wWorld * _SC;
  _C.lineCap = 'round'; _C.lineJoin = 'round';
  _C.strokeStyle = style;
  _C.stroke();
  _C.lineCap = 'butt';
}
/* arc-length point on a polyline; cum may be missing -> index fallback */
var _pp = { x: 0, y: 0 };
function pathPoint(pts, cum, total, s) {
  var n = pts.length, i, s0, s1, q;
  if (cum && cum.length === n && total > 0) {
    s = s < 0 ? 0 : (s > total ? total : s);
    for (i = 1; i < n; i++) {
      if (cum[i] >= s) {
        s0 = cum[i - 1]; s1 = cum[i];
        q = (s1 > s0) ? (s - s0) / (s1 - s0) : 0;
        _pp.x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * q;
        _pp.y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * q;
        return _pp;
      }
    }
    _pp.x = pts[n - 1][0]; _pp.y = pts[n - 1][1];
    return _pp;
  }
  q = clamp01(n > 1 ? s / (total || 1) : 0) * (n - 1);
  i = Math.min(n - 2, Math.floor(q));
  var f = q - i;
  _pp.x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f;
  _pp.y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f;
  return _pp;
}

/* ================================================================
   1. PORTALS — paired swirl discs; red keeps velocity, blue re-aims
   ================================================================ */
function portalDisc(wx, wy, rad, redirect, tighten, glow, hasArrow, ax, ay) {
  var bx = _X(wx), by = _Y(wy);
  var br = Math.max(4, rad * _SC * (1 - 0.22 * tighten));
  var tint = (redirect === 1) ? '#4f9fd9' : '#e05555';
  var tintDk = (redirect === 1) ? '#2b5f8a' : '#8a2b2b';
  var ai, ar, a0;
  softShadow(bx, by, br, br * 0.92);
  _C.fillStyle = '#22242c';
  _C.beginPath(); _C.arc(bx, by, br, 0, TAU); _C.fill();
  _C.strokeStyle = tintDk; _C.lineWidth = Math.max(2, br * 0.10);
  _C.beginPath(); _C.arc(bx, by, br * 0.92, 0, TAU); _C.stroke();
  /* swirling concentric arcs */
  var spin = rmx() ? 0 : _WT * (3 + 2.4 * tighten);
  _C.strokeStyle = tint; _C.lineCap = 'round';
  _C.lineWidth = Math.max(1.5, br * 0.09);
  for (ai = 0; ai < 3; ai++) {
    ar = br * (0.30 + 0.16 * ai);
    a0 = spin * ((ai % 2) ? -1 : 1) + ai * 2.094;
    _C.globalAlpha = 0.9 - 0.2 * ai;
    _C.beginPath(); _C.arc(bx, by, ar, a0, a0 + 2.6); _C.stroke();
  }
  _C.globalAlpha = 1;
  _C.lineCap = 'butt';
  _C.fillStyle = '#0b0c11';
  _C.beginPath(); _C.arc(bx, by, br * 0.22, 0, TAU); _C.fill();
  /* top-left rim light */
  _C.strokeStyle = 'rgba(255,255,255,0.28)'; _C.lineWidth = 1.5;
  _C.beginPath(); _C.arc(bx, by, br * 0.97, Math.PI * 1.05, Math.PI * 1.55); _C.stroke();
  /* exit pop glow */
  if (glow > 0) {
    _C.globalAlpha = Math.min(1, glow) * 0.7;
    _C.strokeStyle = tint; _C.lineWidth = 3;
    _C.beginPath(); _C.arc(bx, by, br * (0.9 + 0.6 * glow), 0, TAU); _C.stroke();
    _C.globalAlpha = 1;
  }
  /* painted exit arrow along (ax,ay) */
  if (hasArrow) {
    var ea = Math.atan2(ay, ax);
    var al0 = br * 0.25, al1 = br * 1.15, ahw = Math.max(1.5, br * 0.07);
    _C.save(); _C.translate(bx, by); _C.rotate(-ea);
    _C.fillStyle = 'rgba(255,255,255,0.92)';
    _C.fillRect(al0, -ahw, al1 - al0, ahw * 2);
    _C.beginPath();
    _C.moveTo(al1 + br * 0.28, 0);
    _C.lineTo(al1, -br * 0.22);
    _C.lineTo(al1, br * 0.22);
    _C.closePath(); _C.fill();
    _C.restore();
  }
}
function drawPortals(hole, ball) {
  var arr = hole.portals;
  if (!arr || !arr.length) return;
  var carry = ball && ball.carry;
  var isP = !!(carry && carry.kind === 'portal');
  var prog = isP ? clamp01(carry.t / (carry.dur || 1)) : 0;
  var i, po, tight, glow, dx, dy;
  for (i = 0; i < arr.length; i++) {
    po = arr[i];
    tight = 0; glow = 0;
    if (isP && ball) {
      dx = ball.x - po.x1; dy = ball.y - po.y1;
      if (prog < 0.5 && dx * dx + dy * dy < (po.r + 3) * (po.r + 3)) tight = prog * 2;
      dx = carry.x2 - po.x2; dy = carry.y2 - po.y2;
      if (prog >= 0.5 && dx * dx + dy * dy < (po.r + 3) * (po.r + 3)) glow = (prog - 0.5) * 2;
    }
    portalDisc(po.x1, po.y1, po.r, po.redirect, tight, 0, 0, 0, 0);
    portalDisc(po.x2, po.y2, po.r, po.redirect, 0, glow,
      (po.redirect === 1) ? 1 : 0, po.ex || 0, po.ey || 0);
  }
}

/* ================================================================
   2. DASH PADS — chevron tiles; chevrons chase along (dx,dy)
   ================================================================ */
function drawPads(hole) {
  var arr = hole.pads;
  if (!arr || !arr.length) return;
  var i, pd, bx, by, half, cvx, off;
  for (i = 0; i < arr.length; i++) {
    pd = arr[i];
    bx = _X(pd.x); by = _Y(pd.y);
    half = pd.r * _SC;
    _C.save(); _C.translate(bx, by); _C.rotate(-Math.atan2(pd.dy, pd.dx));
    _C.fillStyle = 'rgba(0,0,0,0.25)';
    _rr(2, -half + 3, half * 2, half * 2, 5); _C.fill();
    _C.fillStyle = '#c44536';
    _rr(-half, -half, half * 2, half * 2, 5); _C.fill();
    _C.strokeStyle = '#7c2318'; _C.lineWidth = 2;
    _rr(-half, -half, half * 2, half * 2, 5); _C.stroke();
    /* chasing chevrons */
    off = rmx() ? 0 : ((_WT * 70) % 18);
    _C.strokeStyle = 'rgba(255,240,200,0.92)';
    _C.lineWidth = 3; _C.lineCap = 'round';
    for (cvx = -half + 12 - off; cvx < half - 6; cvx += 18) {
      _C.beginPath();
      _C.moveTo(cvx - 6, -half * 0.42);
      _C.lineTo(cvx + 2, 0);
      _C.lineTo(cvx - 6, half * 0.42);
      _C.stroke();
    }
    _C.lineCap = 'butt';
    _C.restore();
  }
}

/* ================================================================
   3. CANNON — wooden base, metal barrel; recoil + fuse + muzzle fx
   ================================================================ */
var BARREL_LEN = 3.4;   // world units; matches drawCarried seating
var _fireT = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;

function cannonBaseAngle(cn) {
  var a = cn.angle;
  if (cn.angleCycle > 0 && !rmx()) a += (cn.angleCycle / 2) * Math.sin(TAU * _ST / 4);
  return a;
}
function cannonLoadedAim(cn, carry) {
  if (carry && carry.kind === 'cannon' &&
      Math.abs(carry.x - cn.x) < 0.5 && Math.abs(carry.y - cn.y) < 0.5) {
    var p = clamp01(carry.t / (carry.dur || 1));
    return carry.ang0 + (carry.ang1 - carry.ang0) * p;
  }
  return cannonBaseAngle(cn);
}
function findCannon(x, y) {
  if (!_hole || !_hole.cannons) return null;
  var best = null, bd = 36, i, cn, dx, dy, d2;
  for (i = 0; i < _hole.cannons.length; i++) {
    cn = _hole.cannons[i];
    dx = cn.x - x; dy = cn.y - y; d2 = dx * dx + dy * dy;
    if (d2 < bd) { bd = d2; best = cn; }
  }
  return best;
}
function drawCannons(hole, ball) {
  var arr = hole.cannons;
  if (!arr || !arr.length) return;
  var carry = ball && ball.carry;
  var i, cn, bx, by, ang, rec, ft, dtf, loaded, blen, bw, bg;
  for (i = 0; i < arr.length; i++) {
    cn = arr[i];
    bx = _X(cn.x); by = _Y(cn.y);
    loaded = !!(carry && carry.kind === 'cannon' &&
      Math.abs(carry.x - cn.x) < 0.5 && Math.abs(carry.y - cn.y) < 0.5);
    ang = loaded ? cannonLoadedAim(cn, carry) : cannonBaseAngle(cn);
    /* recoil right after fire */
    rec = 0;
    if (_fireT) {
      ft = _fireT.get(cn);
      if (ft !== undefined) {
        dtf = _WT - ft;
        if (dtf >= 0 && dtf < 0.45) rec = Math.exp(-dtf * 8) * 1.1;
      }
    }
    /* wooden base */
    softShadow(bx, by, 2.4 * _SC, 2.2 * _SC);
    _C.fillStyle = '#7a5230';
    _C.beginPath(); _C.arc(bx, by, 2.4 * _SC, 0, TAU); _C.fill();
    _C.strokeStyle = '#4e3319'; _C.lineWidth = 2;
    _C.beginPath(); _C.arc(bx, by, 2.4 * _SC, 0, TAU); _C.stroke();
    _C.fillStyle = '#5e3f1f';
    _C.beginPath(); _C.arc(bx, by, 1.5 * _SC, 0, TAU); _C.fill();
    /* barrel, rotated to aim */
    blen = BARREL_LEN * _SC; bw = 1.7 * _SC;
    _C.save();
    _C.translate(bx, by); _C.rotate(-ang); _C.translate(-rec * _SC, 0);
    _C.fillStyle = 'rgba(0,0,0,0.25)';
    _C.fillRect(2, -bw / 2 + 3, blen, bw);
    bg = _C.createLinearGradient(0, -bw / 2, 0, bw / 2);
    bg.addColorStop(0, '#6b7280'); bg.addColorStop(0.45, '#3f4450'); bg.addColorStop(1, '#23262e');
    _C.fillStyle = bg;
    _C.fillRect(0, -bw / 2, blen, bw);
    /* hoops */
    _C.fillStyle = '#1d1f26';
    _C.fillRect(blen * 0.30, -bw / 2 - 1, 3, bw + 2);
    _C.fillRect(blen * 0.62, -bw / 2 - 1, 3, bw + 2);
    /* muzzle ring + dark mouth */
    _C.fillStyle = '#9aa2b2';
    _C.fillRect(blen - 4, -bw / 2 - 2, 4, bw + 4);
    _C.fillStyle = '#101216';
    _C.beginPath(); _C.ellipse(blen - 2, 0, 3, bw / 2 + 1, 0, 0, TAU); _C.fill();
    /* fuse nub at the breech */
    _C.fillStyle = '#c9a24b';
    _C.beginPath(); _C.arc(-2, -bw / 2 - 2, 2.5, 0, TAU); _C.fill();
    _C.restore();
    /* aim guide while loaded */
    if (loaded) {
      var mwx = cn.x + Math.cos(ang) * BARREL_LEN;
      var mwy = cn.y + Math.sin(ang) * BARREL_LEN;
      var glen = Math.min((carry.power || 10) * 1.1, 16) * _SC;
      _C.save();
      _C.translate(_X(mwx), _Y(mwy)); _C.rotate(-ang);
      _C.strokeStyle = 'rgba(255,255,255,0.55)'; _C.lineWidth = 2;
      _C.setLineDash([6, 6]);
      _C.beginPath(); _C.moveTo(0, 0); _C.lineTo(glen, 0); _C.stroke();
      _C.setLineDash([]);
      _C.strokeStyle = 'rgba(255,255,255,0.7)';
      _C.beginPath(); _C.arc(glen, 0, 4, 0, TAU); _C.stroke();
      _C.restore();
    }
  }
}

/* ================================================================
   4. TRANSPORT TUBE — stroked polyline pipe; glow travels the path
   ================================================================ */
function tubeMouth(px, py) {
  var bx = _X(px), by = _Y(py);
  var ro = 2.7 * _SC, ri = 1.8 * _SC;
  softShadow(bx, by, ro, ro * 0.9);
  _C.fillStyle = '#4a5060';
  _C.beginPath(); _C.arc(bx, by, ro, 0, TAU); _C.fill();
  _C.strokeStyle = '#23262c'; _C.lineWidth = 2;
  _C.beginPath(); _C.arc(bx, by, ro, 0, TAU); _C.stroke();
  _C.fillStyle = '#101216';
  _C.beginPath(); _C.arc(bx, by, ri, 0, TAU); _C.fill();
  _C.strokeStyle = 'rgba(255,255,255,0.25)'; _C.lineWidth = 1.5;
  _C.beginPath(); _C.arc(bx, by, ro * 0.94, Math.PI * 1.05, Math.PI * 1.5); _C.stroke();
}
function tubeGlow(wx, wy, alpha) {
  var bx = _X(wx), by = _Y(wy);
  var gr = 2.6 * _SC;
  _C.save();
  _C.globalCompositeOperation = 'lighter';
  var g = _C.createRadialGradient(bx, by, 0, bx, by, gr);
  g.addColorStop(0, 'rgba(255,240,180,' + alpha.toFixed(2) + ')');
  g.addColorStop(1, 'rgba(255,180,60,0)');
  _C.fillStyle = g;
  _C.beginPath(); _C.arc(bx, by, gr, 0, TAU); _C.fill();
  _C.restore();
}
function drawTubes(hole, ball) {
  var arr = hole.tubes;
  if (!arr || !arr.length) return;
  var i, tb, pts, last, carry, gp;
  for (i = 0; i < arr.length; i++) {
    tb = arr[i]; pts = tb.path;
    if (!pts || pts.length < 2) continue;
    last = pts.length - 1;
    strokePolyline(pts, 5.6, '#33373f');                       /* dark outline */
    var g = _C.createLinearGradient(
      _X(pts[0][0]), _Y(pts[0][1]), _X(pts[last][0]), _Y(pts[last][1]));
    g.addColorStop(0, '#9aa2b0');
    g.addColorStop(0.5, '#ccd3e0');
    g.addColorStop(1, '#8b93a3');
    strokePolyline(pts, 4.2, g);                               /* metallic inner */
    strokePolyline(pts, 2.0, '#262a32');                       /* hollow read */
    tubeMouth(pts[0][0], pts[0][1]);
    tubeMouth(pts[last][0], pts[last][1]);
    /* traveling glow at the ball's arc position */
    carry = ball && ball.carry;
    if (carry && carry.kind === 'tube' && carry.pts) {
      gp = pathPoint(carry.pts, carry.cum, carry.total, carry.s);
      tubeGlow(gp.x, gp.y, 0.95);
      gp = pathPoint(carry.pts, carry.cum, carry.total, carry.s - 3);
      tubeGlow(gp.x, gp.y, 0.45);
    }
  }
}

/* ================================================================
   5. CONVEYOR BELTS — scrolling chevrons + wooden side rails
   ================================================================ */
function drawBelts(hole) {
  var arr = hole.belts;
  if (!arr || !arr.length) return;
  var i, b, bx, by, w, h, off, cvx;
  for (i = 0; i < arr.length; i++) {
    b = arr[i];
    bx = _X(b.x); by = _Y(b.y);
    w = b.w * _SC; h = b.h * _SC;
    _C.save();
    _C.translate(bx, by); _C.rotate(-Math.atan2(b.dy, b.dx));
    _C.fillStyle = 'rgba(0,0,0,0.25)';
    _rr(-w / 2 + 2, -h / 2 + 3, w, h, 4); _C.fill();
    _C.fillStyle = '#3d4149';
    _rr(-w / 2, -h / 2, w, h, 4); _C.fill();
    _C.strokeStyle = '#23262c'; _C.lineWidth = 2;
    _rr(-w / 2, -h / 2, w, h, 4); _C.stroke();
    /* scrolling chevrons */
    off = rmx() ? 0 : ((_WT * (b.speed || 6) * _SC) % 18);
    _C.strokeStyle = 'rgba(255,209,102,0.9)';
    _C.lineWidth = 3; _C.lineCap = 'round';
    for (cvx = -w / 2 + 12 - off; cvx < w / 2 - 6; cvx += 18) {
      _C.beginPath();
      _C.moveTo(cvx - 6, -h * 0.28);
      _C.lineTo(cvx + 1, 0);
      _C.lineTo(cvx - 6, h * 0.28);
      _C.stroke();
    }
    _C.lineCap = 'butt';
    /* wooden side rails */
    _C.strokeStyle = '#7a5230'; _C.lineWidth = Math.max(3, h * 0.16);
    _C.lineCap = 'round';
    _C.beginPath(); _C.moveTo(-w / 2, -h / 2 - 2); _C.lineTo(w / 2, -h / 2 - 2); _C.stroke();
    _C.beginPath(); _C.moveTo(-w / 2, h / 2 + 2); _C.lineTo(w / 2, h / 2 + 2); _C.stroke();
    _C.lineCap = 'butt';
    _C.restore();
  }
}

/* ================================================================
   6. WIND FANS — pedestal + 3 spinning blades; blur disc near ball
   ================================================================ */
function drawFans(hole, ball) {
  var arr = hole.fans;
  if (!arr || !arr.length) return;
  var i, f, bx, by, rng, bk, ba, near;
  for (i = 0; i < arr.length; i++) {
    f = arr[i];
    bx = _X(f.x); by = _Y(f.y);
    rng = f.range * _SC;
    near = false;
    if (ball) {
      var dx = ball.x - f.x, dy = ball.y - f.y;
      if (dx * dx + dy * dy < (f.range * 1.2) * (f.range * 1.2)) near = true;
    }
    /* airflow cone telegraph */
    _C.save();
    _C.translate(bx, by); _C.rotate(-Math.atan2(f.dy, f.dx));
    _C.fillStyle = 'rgba(200,230,255,0.07)';
    _C.beginPath(); _C.moveTo(0, 0); _C.arc(0, 0, rng, -0.5, 0.5); _C.closePath(); _C.fill();
    _C.restore();
    /* motion-blur disc when the ball is near */
    if (near) {
      _C.fillStyle = 'rgba(220,240,255,0.10)';
      _C.beginPath(); _C.arc(bx, by, rng * 0.45, 0, TAU); _C.fill();
    }
    /* pedestal */
    softShadow(bx, by, 2.2 * _SC, 2.0 * _SC);
    _C.fillStyle = '#8f96a3';
    _C.beginPath(); _C.arc(bx, by, 2.2 * _SC, 0, TAU); _C.fill();
    _C.strokeStyle = '#5a5f6b'; _C.lineWidth = 2;
    _C.beginPath(); _C.arc(bx, by, 2.2 * _SC, 0, TAU); _C.stroke();
    /* fan head aimed along (dx,dy) */
    _C.save();
    _C.translate(bx, by); _C.rotate(-Math.atan2(f.dy, f.dx));
    _C.fillStyle = '#5a6070';
    _C.beginPath(); _C.arc(0, 0, 1.7 * _SC, 0, TAU); _C.fill();
    _C.strokeStyle = '#2c2f38'; _C.lineWidth = 2;
    _C.beginPath(); _C.arc(0, 0, 1.7 * _SC, 0, TAU); _C.stroke();
    /* 3 blades, spin up as the ball approaches */
    ba = rmx() ? 0.7 : _WT * (near ? 15 : 8);
    for (bk = 0; bk < 3; bk++) {
      _C.save();
      _C.rotate(ba + bk * 2.094);
      _C.fillStyle = 'rgba(223,230,242,0.92)';
      _rr(0.35 * _SC, -0.32 * _SC, 1.15 * _SC, 0.64 * _SC, 3);
      _C.fill();
      _C.restore();
    }
    _C.fillStyle = '#e8b04b';
    _C.beginPath(); _C.arc(0, 0, 0.5 * _SC, 0, TAU); _C.fill();
    _C.strokeStyle = '#6b4a2f'; _C.lineWidth = 1.5;
    _C.beginPath(); _C.arc(0, 0, 0.5 * _SC, 0, TAU); _C.stroke();
    _C.restore();
  }
}

/* ================================================================
   7. GRAVITY WELLS — dark disc, rotating spiral arcs, pulsing rim
   ================================================================ */
function drawWells(hole) {
  var arr = hole.wells;
  if (!arr || !arr.length) return;
  var i, wl, bx, by, br, g, sk, sr, sa0;
  for (i = 0; i < arr.length; i++) {
    wl = arr[i];
    bx = _X(wl.x); by = _Y(wl.y);
    br = Math.max(5, wl.r * _SC);
    softShadow(bx, by, br, br * 0.94);
    g = _C.createRadialGradient(bx, by, br * 0.08, bx, by, br);
    g.addColorStop(0, '#050308');
    g.addColorStop(0.55, '#120b28');
    g.addColorStop(1, '#241a4d');
    _C.fillStyle = g;
    _C.beginPath(); _C.arc(bx, by, br, 0, TAU); _C.fill();
    /* spiral arcs */
    var spin = rmx() ? 0 : _WT * 2.2;
    _C.lineCap = 'round'; _C.lineWidth = 2.5;
    for (sk = 0; sk < 3; sk++) {
      sr = br * (0.72 - 0.20 * sk);
      sa0 = spin * (sk % 2 ? -1.3 : 1) + sk * 2.094;
      _C.strokeStyle = 'rgba(150,124,255,' + (0.75 - 0.15 * sk).toFixed(2) + ')';
      _C.beginPath(); _C.arc(bx, by, sr, sa0, sa0 + 3.4); _C.stroke();
    }
    _C.lineCap = 'butt';
    _C.fillStyle = '#000000';
    _C.beginPath(); _C.arc(bx, by, br * 0.16, 0, TAU); _C.fill();
    /* pulsing rim */
    var pr = br * (1 + (rmx() ? 0 : 0.03 * Math.sin(_WT * 2.2)));
    _C.strokeStyle = 'rgba(160,130,255,0.6)'; _C.lineWidth = 2;
    _C.beginPath(); _C.arc(bx, by, pr, 0, TAU); _C.stroke();
    _C.strokeStyle = 'rgba(255,255,255,0.20)'; _C.lineWidth = 1.5;
    _C.beginPath(); _C.arc(bx, by, pr * 0.97, Math.PI * 1.05, Math.PI * 1.5); _C.stroke();
  }
}

/* ================================================================
   8. LOOP-THE-LOOP — tall 2.5D ring, posts, entry gate arrows
   ================================================================ */
function drawLoops(hole) {
  var arr = hole.loops;
  if (!arr || !arr.length) return;
  var i, lp, bx, by, rx, ry, pw;
  for (i = 0; i < arr.length; i++) {
    lp = arr[i];
    bx = _X(lp.x); by = _Y(lp.y);
    rx = lp.r * _SC; ry = lp.r * _SC * 1.5;
    softShadow(bx, by, rx * 1.05, ry * 0.32);
    /* support posts */
    pw = Math.max(4, 0.6 * _SC);
    _C.fillStyle = '#6b4a2f';
    _C.fillRect(bx - rx * 0.88 - pw / 2, by - ry * 0.72, pw, ry * 1.15);
    _C.fillRect(bx + rx * 0.88 - pw / 2, by - ry * 0.72, pw, ry * 1.15);
    _C.fillStyle = 'rgba(255,255,255,0.12)';
    _C.fillRect(bx - rx * 0.88 - pw / 2, by - ry * 0.72, pw * 0.35, ry * 1.15);
    _C.fillRect(bx + rx * 0.88 - pw / 2, by - ry * 0.72, pw * 0.35, ry * 1.15);
    /* the ring */
    _C.strokeStyle = '#8a5f33'; _C.lineWidth = Math.max(4, 0.55 * _SC);
    _C.beginPath(); _C.ellipse(bx, by, rx, ry, 0, 0, TAU); _C.stroke();
    _C.strokeStyle = '#c9ccd6'; _C.lineWidth = 1.5;
    _C.beginPath(); _C.ellipse(bx, by, rx, ry, 0, 0, TAU); _C.stroke();
    /* entry gate chevrons (below the ring, pointing up into it) */
    _C.strokeStyle = 'rgba(255,255,255,0.85)';
    _C.lineWidth = 3; _C.lineCap = 'round';
    var gy, goff;
    for (goff = 0; goff < 2; goff++) {
      gy = by + ry + 8 + goff * 11;
      _C.beginPath();
      _C.moveTo(bx - 7, gy + 4); _C.lineTo(bx, gy - 4); _C.lineTo(bx + 7, gy + 4);
      _C.stroke();
    }
    _C.lineCap = 'butt';
  }
}

/* ================================================================
   9. BALL ELEVATOR — shaft, gates, rising platform, dotted track
   ================================================================ */
function drawLifts(hole, ball) {
  var arr = hole.lifts;
  if (!arr || !arr.length) return;
  var carry = ball && ball.carry;
  var isL = !!(carry && carry.kind === 'lift');
  var p = isL ? clamp01(carry.t / (carry.dur || 1)) : 0;
  var i, lf, bx, by, sw, sh, ex, ey;
  for (i = 0; i < arr.length; i++) {
    lf = arr[i];
    bx = _X(lf.x1); by = _Y(lf.y1);
    sw = 3.2 * _SC; sh = 5.4 * _SC;
    /* dotted overhead track bay -> exit */
    ex = _X(lf.x2); ey = _Y(lf.y2);
    _C.strokeStyle = 'rgba(90,96,110,0.8)'; _C.lineWidth = 2;
    _C.setLineDash([5, 5]);
    _C.beginPath();
    _C.moveTo(bx, by - sh / 2);
    _C.lineTo(ex, ey - sh / 2);
    _C.stroke();
    _C.setLineDash([]);
    /* exit gate: little arch */
    _C.fillStyle = '#6b4a2f';
    _C.fillRect(ex - 1.7 * _SC, ey - 2.2 * _SC, 0.5 * _SC, 2.2 * _SC);
    _C.fillRect(ex + 1.2 * _SC, ey - 2.2 * _SC, 0.5 * _SC, 2.2 * _SC);
    _C.fillRect(ex - 1.7 * _SC, ey - 2.6 * _SC, 3.4 * _SC, 0.5 * _SC);
    /* shaft */
    _C.fillStyle = 'rgba(0,0,0,0.25)';
    _C.fillRect(bx - sw / 2 + 2, by - sh / 2 + 3, sw, sh);
    _C.fillStyle = '#3d4149';
    _C.fillRect(bx - sw / 2, by - sh / 2, sw, sh);
    _C.fillStyle = '#23262c';
    _C.fillRect(bx - sw / 2 + 3, by - sh / 2 + 3, sw - 6, sh - 6);
    /* rails */
    _C.strokeStyle = '#8b93a3'; _C.lineWidth = 2;
    _C.beginPath();
    _C.moveTo(bx - sw / 2 + 7, by - sh / 2 + 4);
    _C.lineTo(bx - sw / 2 + 7, by + sh / 2 - 4);
    _C.moveTo(bx + sw / 2 - 7, by - sh / 2 + 4);
    _C.lineTo(bx + sw / 2 - 7, by + sh / 2 - 4);
    _C.stroke();
    /* gates slide apart while riding */
    var gateOpen = 0;
    if (isL) gateOpen = (p < 0.12) ? p / 0.12 : ((p > 0.88) ? (1 - p) / 0.12 : 1);
    var gh = 0.55 * _SC, gy = by - sh / 2 - gh / 2;
    var gshift = gateOpen * sw / 2;
    _C.fillStyle = '#a4713f';
    _C.fillRect(bx - sw / 2 - gshift, gy, sw / 2, gh);
    _C.fillRect(bx + gshift, gy, sw / 2, gh);
    _C.strokeStyle = '#4e3319'; _C.lineWidth = 1.5;
    _C.strokeRect(bx - sw / 2 - gshift, gy, sw / 2, gh);
    _C.strokeRect(bx + gshift, gy, sw / 2, gh);
    /* platform rises with carry progress */
    var platY = by + sh / 2 - 8 - sstep(p / 0.35) * (sh - 16);
    _C.fillStyle = 'rgba(0,0,0,0.25)';
    _C.fillRect(bx - 1.3 * _SC + 1, platY + 2, 2.6 * _SC, 0.55 * _SC);
    _C.fillStyle = '#c99a5e';
    _C.fillRect(bx - 1.3 * _SC, platY, 2.6 * _SC, 0.55 * _SC);
    _C.strokeStyle = '#5e3f1f'; _C.lineWidth = 1.5;
    _C.strokeRect(bx - 1.3 * _SC, platY, 2.6 * _SC, 0.55 * _SC);
  }
}

/* ================================================================
   10. TURNTABLE — rotating disc, honest to simTime * omega
   ================================================================ */
function drawTables(hole) {
  var arr = hole.tables;
  if (!arr || !arr.length) return;
  var i, tb, bx, by, br, rot, ak, th, px, py, sa;
  for (i = 0; i < arr.length; i++) {
    tb = arr[i];
    bx = _X(tb.x); by = _Y(tb.y);
    br = Math.max(6, tb.r * _SC);
    rot = rmx() ? 0 : _ST * tb.omega;
    softShadow(bx, by, br, br * 0.94);
    _C.fillStyle = '#a4713f';
    _C.beginPath(); _C.arc(bx, by, br, 0, TAU); _C.fill();
    _C.strokeStyle = '#6b4a2f'; _C.lineWidth = 3;
    _C.beginPath(); _C.arc(bx, by, br, 0, TAU); _C.stroke();
    /* painted arrows riding the rotation */
    var ar = br * 0.62;
    for (ak = 0; ak < 3; ak++) {
      th = rot + ak * 2.094;
      px = bx + ar * Math.cos(th);
      py = by - ar * Math.sin(th);
      sa = Math.atan2(-Math.cos(th), -Math.sin(th)); /* screen tangent */
      _C.save();
      _C.translate(px, py); _C.rotate(sa);
      _C.fillStyle = 'rgba(255,246,220,0.92)';
      _C.beginPath();
      _C.moveTo(7, 0); _C.lineTo(-2, -5); _C.lineTo(-2, 5);
      _C.closePath(); _C.fill();
      _C.restore();
    }
    /* rim highlight + hub */
    _C.strokeStyle = 'rgba(255,255,255,0.25)'; _C.lineWidth = 2;
    _C.beginPath(); _C.arc(bx, by, br - 3, Math.PI * 1.05, Math.PI * 1.55); _C.stroke();
    _C.fillStyle = '#e8b04b';
    _C.beginPath(); _C.arc(bx, by, Math.max(3, br * 0.16), 0, TAU); _C.fill();
    _C.strokeStyle = '#6b4a2f'; _C.lineWidth = 1.5;
    _C.beginPath(); _C.arc(bx, by, Math.max(3, br * 0.16), 0, TAU); _C.stroke();
  }
}

/* ---------------- public draw ---------------- */
TPR.draw = function (ctx, V, hole, ball) {
  if (!ctx || !V || !hole) return;
  cacheView(ctx, V);
  _hole = hole; _ball = ball || null;
  drawPortals(hole, ball);
  drawPads(hole);
  drawCannons(hole, ball);
  drawTubes(hole, ball);
  drawBelts(hole);
  drawFans(hole, ball);
  drawWells(hole);
  drawLoops(hole);
  drawLifts(hole, ball);
  drawTables(hole);
  drawRings();
  drawParticles();
};

/* ---------------- carried ball ---------------- */
TPR.drawCarried = function (ctx, V, hole, ball) {
  if (!ctx || !V || !ball) return false;
  cacheView(ctx, V);
  _hole = hole || null; _ball = ball;
  var carry = ball.carry;
  if (!carry) return false;
  var p = clamp01(carry.t / (carry.dur || 1));
  if (carry.kind === 'portal') {
    if (p < 0.5) {
      drawBallAt(ball.x, ball.y, Math.max(0.01, 1 - p * 2), 0);
    } else {
      drawBallAt(carry.x2, carry.y2, Math.max(0.01, (p - 0.5) * 2), 0);
    }
    return true;
  }
  if (carry.kind === 'cannon') {
    var ang = carry.ang0 + (carry.ang1 - carry.ang0) * p;
    drawBallAt(carry.x + Math.cos(ang) * (BARREL_LEN - 0.35),
               carry.y + Math.sin(ang) * (BARREL_LEN - 0.35), 1, 0);
    return true;
  }
  if (carry.kind === 'tube') {
    return true; /* hidden; the traveling glow shows progress */
  }
  if (carry.kind === 'loop') {
    var a = carry.a0 + carry.dir * p * TAU;
    var up = Math.max(0, Math.sin(a));
    drawBallAt(carry.x + carry.r * Math.cos(a),
               carry.y + carry.r * Math.sin(a),
               1 - 0.3 * up, up * 0.8);
    return true;
  }
  if (carry.kind === 'lift') {
    var lx, ly, lz;
    if (p < 0.4) {
      var e = sstep(p / 0.4);
      lx = carry.x1; ly = carry.y1; lz = e * 2.0;
    } else if (p < 0.65) {
      var q = (p - 0.4) / 0.25;
      lx = carry.x1 + (carry.x2 - carry.x1) * q;
      ly = carry.y1 + (carry.y2 - carry.y1) * q;
      lz = 2.0 * (1 - q * 0.5);
    } else {
      lx = carry.x2; ly = carry.y2;
      lz = 0.6 * (1 - (p - 0.65) / 0.35);
    }
    drawBallAt(lx, ly, 1.06, lz);
    return true;
  }
  return false;
};

/* ---------------- tick: pools + ambient emitters ---------------- */
var _fuseAcc = 0, _fanAcc = 0;
TPR.tick = function (dt) {
  dt = Math.min(dt, 0.1);
  var i, p, r;
  for (i = 0; i < POOL_N; i++) {
    p = _pool[i];
    if (p.t < p.life) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= p.grav * dt;
    }
  }
  for (i = 0; i < RING_N; i++) {
    r = _rings[i];
    if (r.t < r.life) r.t += dt;
  }
  if (rmx()) return;
  if (!_hole || !_ball) return;
  var carry = _ball.carry, a, sp, str, ox, oy;
  /* cannon fuse sparks while loaded */
  if (carry && carry.kind === 'cannon') {
    var cn = findCannon(carry.x, carry.y);
    if (cn) {
      var ang = cannonLoadedAim(cn, carry);
      var mx = carry.x + Math.cos(ang) * 3.0;
      var my = carry.y + Math.sin(ang) * 3.0;
      _fuseAcc += dt * 26;
      while (_fuseAcc >= 1) {
        _fuseAcc -= 1;
        a = vr() * TAU; sp = 1.5 + vr() * 3.5;
        spawn(mx, my, Math.cos(a) * sp, Math.sin(a) * sp,
          0.22 + vr() * 0.15, 0.20, '#ffcf5e', 7);
      }
    }
  }
  /* fan streaks when the ball is inside the cone */
  if (!carry && _hole.fans) {
    var fa = _hole.fans;
    for (i = 0; i < fa.length; i++) {
      var f = fa[i];
      var dx = _ball.x - f.x, dy = _ball.y - f.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < f.range) {
        var da = Math.atan2(dy, dx) - Math.atan2(f.dy, f.dx);
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        if (Math.abs(da) < 0.5) {
          _fanAcc += dt * 18;
          while (_fanAcc >= 1) {
            _fanAcc -= 1;
            str = f.strength || 10;
            ox = (vr() - 0.5) * 2.4; oy = (vr() - 0.5) * 2.4;
            spawn(_ball.x - f.dx * d * 0.55 + ox, _ball.y - f.dy * d * 0.55 + oy,
              f.dx * str * 0.85 + ox * 2, f.dy * str * 0.85 + oy * 2,
              0.32 + vr() * 0.15, 0.26, '#d8ecff', 0);
          }
        }
      }
    }
  }
};

/* ---------------- SFX table ---------------- */
var SFX = {
  'portal-enter': function () { sBlip(950, 180, 0.35, 0.20, 'sawtooth'); },
  'portal-exit':  function () { sBlip(320, 880, 0.14, 0.20, 'square'); },
  'pad':          function () { sNoise(0.25, 0.20, 400, 2600, 'bandpass'); },
  'cannon-enter': function () { sBlip(170, 85, 0.18, 0.22, 'triangle'); },
  'cannon-fire':  function () { sNoise(0.5, 0.25, 140, 60, 'lowpass'); sBlip(95, 38, 0.4, 0.20, 'sine'); },
  'tube-enter':   function () { sBlip(520, 1150, 0.30, 0.15, 'sine'); },
  'tube-exit':    function () { sBlip(1150, 520, 0.30, 0.15, 'sine'); },
  'loop-enter':   function () { sNoise(0.30, 0.18, 300, 1900, 'bandpass'); },
  'loop-exit':    function () { sBlip(880, 1320, 0.25, 0.18, 'triangle'); },
  'loop-reject':  function () { sBlip(130, 60, 0.20, 0.22, 'square'); },
  'lift-enter':   function () { sBlip(230, 110, 0.15, 0.20, 'square'); },
  'lift-exit':    function () { sBlip(420, 840, 0.12, 0.18, 'triangle'); },
  'belt':         function () { sNoise(0.40, 0.12, 300, 900, 'bandpass'); },
  'fan':          function () { sNoise(0.35, 0.15, 500, 1700, 'bandpass'); },
  'well':         function () { sBlip(170, 85, 0.50, 0.18, 'sine'); },
  'table':        function () { sNoise(0.25, 0.14, 1300, 320, 'bandpass'); }
};

/* ---------------- event: sfx + one-shot fx ---------------- */
TPR.event = function (te) {
  if (!te || !te.k) return;
  var k = te.k;
  var ex = (typeof te.x === 'number') ? te.x : (_ball ? _ball.x : 0);
  var ey = (typeof te.y === 'number') ? te.y : (_ball ? _ball.y : 0);
  var fn = SFX[k];
  if (fn) fn();
  /* one-shot visuals (always, even without audio) */
  if (k === 'portal-enter') {
    burst(ex, ey, 10, 2, 7, 0.4, 0.30, '#7fd4ff', 4);
    spawnRing(ex, ey, 0.4, 0.5, 4.5, 'rgba(127,212,255,0.8)', 3);
  } else if (k === 'portal-exit') {
    burst(ex, ey, 8, 3, 8, 0.35, 0.28, '#ffffff', 5);
    spawnRing(ex, ey, 0.35, 0.5, 5, 'rgba(255,255,255,0.9)', 3);
  } else if (k === 'pad') {
    spawnRing(ex, ey, 0.45, 0.5, 5.5, 'rgba(255,255,255,0.95)', 3);
    burst(ex, ey, 4, 2, 5, 0.3, 0.24, '#ffe9c4', 3);
  } else if (k === 'cannon-enter') {
    burst(ex, ey, 3, 1, 3, 0.3, 0.22, '#c9b98f', 9);
  } else if (k === 'cannon-fire') {
    burst(ex, ey, 8, 4, 12, 0.25, 0.30, '#fff3c4', 4);
    burst(ex, ey, 6, 1, 4, 0.7, 0.55, '#8a8d96', -2);
    spawnRing(ex, ey, 0.6, 1, 7, 'rgba(160,160,165,0.55)', 4);
    var cn = findCannon(ex, ey);
    if (cn && _fireT) _fireT.set(cn, _WT);
  } else if (k === 'tube-enter' || k === 'tube-exit') {
    burst(ex, ey, 6, 2, 6, 0.35, 0.26, '#ffe9a8', 4);
    spawnRing(ex, ey, 0.35, 1, 4, 'rgba(255,233,168,0.8)', 2);
  } else if (k === 'loop-enter') {
    burst(ex, ey, 6, 2, 6, 0.35, 0.26, '#ffffff', 4);
  } else if (k === 'loop-exit') {
    burst(ex, ey, 8, 3, 8, 0.4, 0.28, '#ffd166', 5);
    spawnRing(ex, ey, 0.4, 0.5, 4.5, 'rgba(255,209,102,0.85)', 3);
  } else if (k === 'loop-reject') {
    burst(ex, ey, 5, 1, 4, 0.35, 0.30, '#b9a98a', 10);
  } else if (k === 'lift-enter') {
    burst(ex, ey, 4, 1, 3, 0.3, 0.24, '#c9ccd6', 8);
  } else if (k === 'lift-exit') {
    burst(ex, ey, 5, 2, 5, 0.3, 0.24, '#ffffff', 5);
    spawnRing(ex, ey, 0.35, 0.5, 4, 'rgba(255,255,255,0.8)', 2);
  } else if (k === 'well') {
    burst(ex, ey, 6, 3, 7, 0.45, 0.26, '#9c7fff', 0);
  } else if (k === 'table') {
    burst(ex, ey, 4, 2, 5, 0.3, 0.24, '#ffe9c4', 4);
  } else if (k === 'belt' || k === 'fan') {
    burst(ex, ey, 3, 1, 3, 0.3, 0.22, '#e8f2ff', 2);
  }
};

})();
