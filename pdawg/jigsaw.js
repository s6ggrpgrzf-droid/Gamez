/* ============================================================
 * Pdawg Puzzles - a better jigsaw puzzle game.
 * Single-canvas renderer, seeded Draradech-style piece edges,
 * magnetic snap + piece grouping, IndexedDB autosave, custom photos.
 * No dependencies, no network. Mobile-first (Pointer Events).
 * ============================================================ */
(function () {
'use strict';

/* ---------------- utilities ---------------- */
function $(s) { return document.querySelector(s); }
function el(tag, cls, html) {
  var d = document.createElement(tag);
  if (cls) d.className = cls;
  if (html !== undefined) d.innerHTML = html;
  return d;
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
/* canvas.cloneNode() copies dimensions but NOT painted pixels — draw a real copy. */
function canvasCopy(cv) {
  var c = document.createElement('canvas');
  c.width = cv.width; c.height = cv.height;
  c.className = cv.className;
  c.getContext('2d').drawImage(cv, 0, 0);
  return c;
}
function fmtTime(ms) {
  var s = Math.floor(ms / 1000);
  var m = Math.floor(s / 60), h = Math.floor(m / 60);
  s = s % 60; m = m % 60;
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return h > 0 ? h + ':' + p(m) + ':' + p(s) : m + ':' + p(s);
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function uid(prefix) {
  return (prefix || 'p') + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

/* ---------------- piece-edge geometry (pure, testable) ----------------
 * Edge table: v[r][c] = boundary between (r,c-1) and (r,c), c in 0..cols.
 *             h[r][c] = boundary between (r-1,c) and (r,c), r in 0..rows.
 * Sign: +1 = tab points right (v) / down (h). Borders = 0 (flat).
 * Jitter tables vj/hj hold per-boundary random in [-1,1] so neighbors share
 * the exact same curve -> pieces interlock perfectly.
 * Profile tables vp/hp pick one of NPROF knob shapes per interior boundary,
 * drawn from the same seeded stream (fixed order) -> reproducible per seed.
 * Non-uniform knobs (like real die-cut puzzles): vo/ho = knob center offset
 * along the edge (0.32..0.68, 0.5 = centered), vs/hs = knob size multiplier
 * (0.8..1.15), vw/hw = wobble seed for the straight runs. These are drawn
 * AFTER the legacy stream so old saves rebuild identical base tables.
 */
var NPROF = 6;
function buildEdges(rows, cols, rng) {
  var v = [], h = [], vj = [], hj = [], vp = [], hp = [], r, c;
  for (r = 0; r < rows; r++) {
    v[r] = []; vj[r] = []; vp[r] = [];
    for (c = 0; c <= cols; c++) {
      var vb = (c === 0 || c === cols);
      v[r][c] = vb ? 0 : (rng() < 0.5 ? -1 : 1);
      vj[r][c] = vb ? 0 : rng() * 2 - 1;
      vp[r][c] = vb ? 0 : (rng() * NPROF) | 0;
    }
  }
  for (r = 0; r <= rows; r++) {
    h[r] = []; hj[r] = []; hp[r] = [];
    for (c = 0; c < cols; c++) {
      var hb = (r === 0 || r === rows);
      h[r][c] = hb ? 0 : (rng() < 0.5 ? -1 : 1);
      hj[r][c] = hb ? 0 : rng() * 2 - 1;
      hp[r][c] = hb ? 0 : (rng() * NPROF) | 0;
    }
  }
  // Per-boundary knob offset / scale / wobble. Separate pass keeps the
  // legacy rng stream untouched, so pre-existing saves rebuild the same
  // signs, jitters and profiles they were created with.
  var vo = [], ho = [], vs = [], hs = [], vw = [], hw = [];
  for (r = 0; r < rows; r++) {
    vo[r] = []; vs[r] = []; vw[r] = [];
    for (c = 0; c <= cols; c++) {
      var vb2 = (c === 0 || c === cols);
      vo[r][c] = vb2 ? 0.5 : 0.32 + rng() * 0.36;
      vs[r][c] = vb2 ? 1 : 0.8 + rng() * 0.35;
      vw[r][c] = vb2 ? 0 : rng();
    }
  }
  for (r = 0; r <= rows; r++) {
    ho[r] = []; hs[r] = []; hw[r] = [];
    for (c = 0; c < cols; c++) {
      var hb2 = (r === 0 || r === rows);
      ho[r][c] = hb2 ? 0.5 : 0.32 + rng() * 0.36;
      hs[r][c] = hb2 ? 1 : 0.8 + rng() * 0.35;
      hw[r][c] = hb2 ? 0 : rng();
    }
  }
  return { v: v, h: h, vj: vj, hj: hj, vp: vp, hp: hp, vo: vo, ho: ho, vs: vs, hs: hs, vw: vw, hw: hw };
}

/* Outward-positive edge signs + jitter + knob profile for piece (r,c).
 * Profile fields default to 0 when the table predates them (old saves).
 * Knob offset is mirrored for reverse-traced edges (bottom/left) so the
 * knob lands on the same geometric spot for both neighbors; wobble needs
 * no mirroring because its sine is antisymmetric about the edge midpoint. */
function pieceEdges(E, r, c) {
  return {
    top: -E.h[r][c], right: E.v[r][c + 1], bottom: E.h[r + 1][c], left: -E.v[r][c],
    tj: E.hj[r][c], rj: E.vj[r][c + 1], bj: E.hj[r + 1][c], lj: E.vj[r][c],
    tp: E.hp ? E.hp[r][c] : 0, rp: E.vp ? E.vp[r][c + 1] : 0,
    bp: E.hp ? E.hp[r + 1][c] : 0, lp: E.vp ? E.vp[r][c] : 0,
    to: E.ho ? E.ho[r][c] : 0.5, ro: E.vo ? E.vo[r][c + 1] : 0.5,
    bo: E.ho ? 1 - E.ho[r + 1][c] : 0.5, lo: E.vo ? 1 - E.vo[r][c] : 0.5,
    ts: E.hs ? E.hs[r][c] : 1, rs: E.vs ? E.vs[r][c + 1] : 1,
    bs: E.hs ? E.hs[r + 1][c] : 1, ls: E.vs ? E.vs[r][c] : 1,
    tw: E.hw ? E.hw[r][c] : 0, rw: E.vw ? E.vw[r][c + 1] : 0,
    bw: E.hw ? E.hw[r + 1][c] : 0, lw: E.vw ? E.vw[r][c] : 0
  };
}

/* Die-cut knob profiles as [fraction-along-edge, protrusion] point lists.
 * Modeled on real die-cut pieces (small lollipop knobs with pinched necks,
 * off-center, irregular) instead of uniform domes. Profiles need NOT be
 * mirror-symmetric: tracePiecePath passes mir=1 for reverse-traced edges
 * (bottom/left), which mirrors the profile so neighbors interlock exactly.
 * First point gets a lineTo, then each 3 points form a bezier. */
var PROFILES = [
  /* A: lollipop - pinched neck, slight lean */
  [[0.405,0.00],[0.418,0.10],[0.424,0.28],[0.428,0.50],[0.418,0.68],[0.386,0.85],[0.372,0.97],[0.388,1.06],[0.422,1.10],[0.464,1.10],[0.505,1.04],[0.525,0.94],[0.526,0.80],[0.531,0.62],[0.545,0.42],[0.560,0.24],[0.575,0.10],[0.592,0.02],[0.605,0.00]],
  /* B: flat-top lollipop */
  [[0.410,0.00],[0.420,0.12],[0.427,0.30],[0.431,0.52],[0.418,0.72],[0.390,0.89],[0.390,1.00],[0.418,1.06],[0.455,1.08],[0.497,1.06],[0.535,1.00],[0.552,0.90],[0.544,0.76],[0.544,0.58],[0.556,0.38],[0.570,0.20],[0.584,0.07],[0.597,0.01],[0.608,0.00]],
  /* C: rounded triangle knob */
  [[0.415,0.00],[0.424,0.13],[0.432,0.32],[0.439,0.54],[0.432,0.76],[0.433,0.95],[0.460,1.08],[0.494,1.10],[0.527,1.03],[0.548,0.89],[0.551,0.72],[0.551,0.54],[0.558,0.36],[0.570,0.20],[0.584,0.08],[0.596,0.02],[0.606,0.00],[0.612,0.00],[0.616,0.00]],
  /* D: leaning knob */
  [[0.400,0.00],[0.411,0.11],[0.419,0.30],[0.427,0.53],[0.427,0.76],[0.438,0.94],[0.470,1.06],[0.509,1.09],[0.547,1.02],[0.569,0.88],[0.565,0.70],[0.563,0.51],[0.570,0.32],[0.581,0.15],[0.593,0.05],[0.603,0.01],[0.611,0.00],[0.616,0.00],[0.620,0.00]],
  /* E: tiny nub */
  [[0.435,0.00],[0.441,0.13],[0.447,0.34],[0.451,0.58],[0.446,0.82],[0.458,0.97],[0.486,1.02],[0.513,0.95],[0.526,0.79],[0.530,0.57],[0.537,0.34],[0.547,0.14],[0.559,0.03],[0.569,0.00],[0.575,0.00],[0.580,0.00],[0.584,0.00],[0.587,0.00],[0.590,0.00]],
  /* F: broad-shoulder knob */
  [[0.395,0.00],[0.407,0.09],[0.415,0.26],[0.419,0.46],[0.410,0.64],[0.382,0.80],[0.367,0.92],[0.384,1.01],[0.419,1.06],[0.464,1.06],[0.508,1.00],[0.531,0.90],[0.532,0.76],[0.533,0.58],[0.545,0.38],[0.559,0.20],[0.575,0.07],[0.589,0.01],[0.601,0.00]],
];

/* Knob-curve ops for one edge from (x1,y1) to (x2,y2).
 * Positive tab bulges toward the LEFT of the travel direction.
 * off: knob center as a fraction along the edge (0.32..0.68).
 * scl: knob size multiplier (0.8..1.15) — scales protrusion fully and
 *      knob width mildly so the knob never reaches the corners.
 * wob: wobble seed in [0,1) for the straight runs. The wobble is an
 *      antisymmetric sine (zero at both corners), so tracing the same
 *      boundary in reverse with the opposite tab yields the identical
 *      geometric curve -> neighbor pieces interlock exactly.
 * mir: when 1, the knob profile is mirrored (fraction -> 1-fraction).
 *      Reverse-traced shared edges (bottom/left of a piece) pass mir=1 so
 *      an ASYMMETRIC profile still lands on the identical geometric curve
 *      for both neighbors -> interlock stays exact. */
function edgeGeom(x1, y1, x2, y2, tab, jit, prof, off, scl, wob, mir) {
  if (tab === 0) return [{ t: 'l', p: [x2, y2] }];
  off = (off === undefined) ? 0.5 : off;
  scl = (scl === undefined) ? 1 : scl;
  wob = (wob === undefined) ? 0 : wob;
  var dx = x2 - x1, dy = y2 - y1;
  var len = Math.hypot(dx, dy) || 1;
  var nx = -dy / len, ny = dx / len;
  var depth = tab * (0.11 + 0.02 * jit);
  var wscl = 0.72 + 0.16 * scl;
  var wk = 1 + ((wob * 2) | 0);                    /* 1 or 2 waves */
  var ws = (((wob * 4) | 0) % 2 === 0) ? 1 : -1;   /* wobble sign */
  var wamp = 0.012;                               /* subtle die-cut waviness */
  function W(f) { return wamp * ws * Math.sin(2 * Math.PI * wk * (f - 0.5)); }
  /* P takes the GEOMETRIC fraction along the edge; wobble is evaluated
   * there so both neighbors displace the same physical point equally. */
  function P(fg, o) {
    var w = W(fg);
    return [
      x1 + dx * fg + nx * len * (o * depth + w),
      y1 + dy * fg + ny * len * (o * depth + w)
    ];
  }
  var base = PROFILES[(prof >= 0 && prof < PROFILES.length) ? prof : 0];
  /* Mirror the profile for reverse-traced edges: reverse the point order AND
   * map fraction -> 1-fraction. The mirrored curve is then the exact fp-mirror
   * of the original, so with the caller's mirrored `off` the neighbor's curve
   * coincides point-for-point (reversing order alone would NOT mirror an
   * asymmetric profile). */
  var pts = mir ? base.map(function (p) { return [1 - p[0], p[1]]; }).reverse() : base;
  function F(fp) { return off + (fp - 0.5) * wscl; }
  var ks = F(pts[0][0]), ke = F(pts[pts.length - 1][0]);
  var ops = [], i, j, k, f;
  /* lead-in: subdivided so the wobble renders (corners stay exact: W(0)=0) */
  var NSEG = 5;
  for (i = 1; i <= NSEG; i++) {
    f = ks * i / NSEG;
    ops.push({ t: 'l', p: P(f, 0) });
  }
  for (j = 1; j + 2 < pts.length; j += 3) {
    ops.push({
      t: 'c', p: [
        P(F(pts[j][0]), pts[j][1] * scl),
        P(F(pts[j + 1][0]), pts[j + 1][1] * scl),
        P(F(pts[j + 2][0]), pts[j + 2][1] * scl)
      ]
    });
  }
  for (k = 1; k <= NSEG; k++) {
    f = ke + (1 - ke) * k / NSEG;
    ops.push({ t: 'l', p: P(f, 0) });
  }
  return ops;
}

function strokeGeom(ctx, ops) {
  for (var i = 0; i < ops.length; i++) {
    var o = ops[i];
    if (o.t === 'l') ctx.lineTo(o.p[0], o.p[1]);
    else ctx.bezierCurveTo(o.p[0][0], o.p[0][1], o.p[1][0], o.p[1][1], o.p[2][0], o.p[2][1]);
  }
}

/* Trace piece outline clockwise starting top-left of the cell.
 * Bottom and left edges are traced in reverse relative to the shared
 * boundary, so they pass mir=1 (mirrored profile) to interlock exactly. */
function tracePiecePath(ctx, ox, oy, w, h, e) {
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  strokeGeom(ctx, edgeGeom(ox, oy, ox + w, oy, -e.top, e.tj, e.tp, e.to, e.ts, e.tw, 0));
  strokeGeom(ctx, edgeGeom(ox + w, oy, ox + w, oy + h, -e.right, e.rj, e.rp, e.ro, e.rs, e.rw, 0));
  strokeGeom(ctx, edgeGeom(ox + w, oy + h, ox, oy + h, -e.bottom, e.bj, e.bp, e.bo, e.bs, e.bw, 1));
  strokeGeom(ctx, edgeGeom(ox, oy + h, ox, oy, -e.left, e.lj, e.lp, e.lo, e.ls, e.lw, 1));
  ctx.closePath();
}

/* ---------------- whimsy pieces ----------------
 * Special shaped pieces (paw, star, heart, bone) hidden in each puzzle — a
 * beloved physical-puzzle tradition. A whimsy's 4 shared boundaries are cut
 * flat (like border pieces), so the silhouette drops into a clean rectangular
 * home. Works with the Path2D-recording fake ctx (moveTo/lineTo/bezier only). */
var WHIMSY = ['paw', 'star', 'heart', 'bone'];

function bezEllipsePath(c, cx, cy, rx, ry) {
  var kx = 0.5523 * rx, ky = 0.5523 * ry;
  c.moveTo(cx + rx, cy);
  c.bezierCurveTo(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry);
  c.bezierCurveTo(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy);
  c.bezierCurveTo(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry);
  c.bezierCurveTo(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy);
  c.closePath();
}

function traceWhimsyPath(c, ox, oy, w, h, shape) {
  var cx = ox + w / 2, cy = oy + h / 2, s = Math.min(w, h);
  c.beginPath();
  if (shape === 1) {                        /* star */
    var R = s * 0.46, rr = s * 0.195, i, a, rad, x, y;
    for (i = 0; i < 10; i++) {
      a = -Math.PI / 2 + i * Math.PI / 5;
      rad = (i % 2 === 0) ? R : rr;
      x = cx + Math.cos(a) * rad; y = cy + Math.sin(a) * rad;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.closePath();
  } else if (shape === 2) {                 /* heart */
    var u = s / 34;
    c.moveTo(cx, cy + 11 * u);
    c.bezierCurveTo(cx - 17 * u, cy - 1 * u, cx - 10 * u, cy - 13 * u, cx, cy - 5.5 * u);
    c.bezierCurveTo(cx + 10 * u, cy - 13 * u, cx + 17 * u, cy - 1 * u, cx, cy + 11 * u);
    c.closePath();
  } else if (shape === 3) {                 /* dog bone */
    var bw = s * 0.26, bh = s * 0.085, br = s * 0.105;
    c.moveTo(cx - bw, cy - bh); c.lineTo(cx + bw, cy - bh);
    c.lineTo(cx + bw, cy + bh); c.lineTo(cx - bw, cy + bh);
    c.closePath();
    bezEllipsePath(c, cx - bw, cy - bh, br, br);
    bezEllipsePath(c, cx + bw, cy - bh, br, br);
    bezEllipsePath(c, cx - bw, cy + bh, br, br);
    bezEllipsePath(c, cx + bw, cy + bh, br, br);
  } else {                                  /* paw (default) */
    bezEllipsePath(c, cx, cy + s * 0.13, s * 0.20, s * 0.155);
    bezEllipsePath(c, cx - s * 0.205, cy - s * 0.10, s * 0.082, s * 0.082);
    bezEllipsePath(c, cx - s * 0.07, cy - s * 0.185, s * 0.082, s * 0.082);
    bezEllipsePath(c, cx + s * 0.07, cy - s * 0.185, s * 0.082, s * 0.082);
    bezEllipsePath(c, cx + s * 0.205, cy - s * 0.10, s * 0.082, s * 0.082);
  }
}

/* Choose whimsy cells deterministically from the seed: interior, non-adjacent. */
function chooseWhimsy(rows, cols, seed) {
  if (rows < 4 || cols < 4) return [];
  var total = rows * cols;
  var count = total <= 54 ? 1 : total <= 216 ? 2 : 3;
  var rng = mulberry32(hashStr('whimsy:' + seed));
  var cells = [], tries = 0;
  while (cells.length < count && tries++ < 300) {
    var r = 1 + ((rng() * (rows - 2)) | 0), c = 1 + ((rng() * (cols - 2)) | 0);
    var ok = true, i;
    for (i = 0; i < cells.length; i++) {
      if (Math.abs(cells[i].r - r) < 2 && Math.abs(cells[i].c - c) < 2) { ok = false; break; }
    }
    if (ok) cells.push({ r: r, c: c, shape: cells.length % WHIMSY.length });
  }
  return cells;
}

/* Cut whimsy homes flat in the edge table and mark the pieces. */
function applyWhimsy(S) {
  var E = S.edges;
  for (var i = 0; i < S.whimsy.length; i++) {
    var w = S.whimsy[i], r = w.r, c = w.c;
    E.v[r][c] = 0; E.v[r][c + 1] = 0; E.h[r][c] = 0; E.h[r + 1][c] = 0;
    var p = S.pieces[r * S.cols + c];
    if (p) p.whimsy = w.shape;
  }
}

/* Sample a cubic bezier (for tests). */
function bezPoint(p0, p1, p2, p3, t) {
  var u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
  ];
}
/* Flatten edge ops to a point polyline (for interlock tests). */
function flattenEdgeOps(ops, x1, y1, n) {
  var pts = [[x1, y1]], cur = [x1, y1];
  for (var i = 0; i < ops.length; i++) {
    var o = ops[i];
    if (o.t === 'l') { pts.push(o.p); cur = o.p; }
    else {
      for (var k = 1; k <= n; k++) pts.push(bezPoint(cur, o.p[0], o.p[1], o.p[2], k / n));
      cur = o.p[2];
    }
  }
  return pts;
}

/* ---------------- storage: IndexedDB + shelf index ---------------- */
var idb = {
  db: null, mem: null,
  open: function () {
    var self = this;
    return new Promise(function (resolve) {
      if (!window.indexedDB) { self.mem = { puzzles: {}, images: {} }; resolve(); return; }
      var req = window.indexedDB.open('pdawg', 1);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains('puzzles')) d.createObjectStore('puzzles', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('images')) d.createObjectStore('images', { keyPath: 'id' });
      };
      req.onsuccess = function () { self.db = req.result; resolve(); };
      req.onerror = function () { self.mem = { puzzles: {}, images: {} }; resolve(); };
    });
  },
  _store: function (name, mode) { return this.db.transaction(name, mode).objectStore(name); },
  put: function (name, val) {
    var self = this;
    return new Promise(function (resolve, reject) {
      if (self.mem) { self.mem[name][val.id] = val; resolve(); return; }
      var q = self._store(name, 'readwrite').put(val);
      q.onsuccess = function () { resolve(); };
      q.onerror = function () { reject(q.error); };
    });
  },
  get: function (name, key) {
    var self = this;
    return new Promise(function (resolve, reject) {
      if (self.mem) { resolve(self.mem[name][key] || null); return; }
      var q = self._store(name, 'readonly').get(key);
      q.onsuccess = function () { resolve(q.result || null); };
      q.onerror = function () { reject(q.error); };
    });
  },
  del: function (name, key) {
    var self = this;
    return new Promise(function (resolve, reject) {
      if (self.mem) { delete self.mem[name][key]; resolve(); return; }
      var q = self._store(name, 'readwrite').delete(key);
      q.onsuccess = function () { resolve(); };
      q.onerror = function () { reject(q.error); };
    });
  }
};

var shelf = {
  KEY: 'pdawg-shelf-v1',
  read: function () {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); }
    catch (e) { return []; }
  },
  write: function (list) {
    try { localStorage.setItem(this.KEY, JSON.stringify(list)); } catch (e) {}
  },
  upsert: function (entry) {
    var list = this.read().filter(function (e) { return e.id !== entry.id; });
    list.unshift(entry);
    this.write(list.slice(0, 60));
  },
  remove: function (id) { this.write(this.read().filter(function (e) { return e.id !== id; })); }
};

var bests = {
  KEY: 'pdawg-best-v1',
  read: function () {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '{}'); }
    catch (e) { return {}; }
  },
  get: function (key) { return this.read()[key] || null; },
  set: function (key, ms) {
    var b = this.read(); b[key] = ms;
    try { localStorage.setItem(this.KEY, JSON.stringify(b)); } catch (e) {}
  }
};

/* ---------------- puzzle setup ---------------- */
var COUNTS = [24, 54, 108, 216, 432];
var LEVELS = [
  { name: 'Cozy', count: 24 },
  { name: 'Classic', count: 54 },
  { name: 'Tricky', count: 108 },
  { name: 'Tough', count: 216 },
  { name: 'Master', count: 432 }
];
function levelForCount(n) {
  for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].count === n) return LEVELS[i];
  return { name: n + ' pieces', count: n };
}

function gridForCount(n, aspect) {
  var cols = Math.max(2, Math.round(Math.sqrt(n * aspect)));
  var rows = Math.max(2, Math.round(n / cols));
  return { rows: rows, cols: cols };
}

/* Build a fresh puzzle state object (no DOM needed except piece canvases). */
function newPuzzleState(opts) {
  // opts: {id,title,imageKind,galleryIdx,imgW,imgH,rows,cols,seed,rotationOn,whimsy}
  var rng = mulberry32(opts.seed);
  var E = buildEdges(opts.rows, opts.cols, rng);
  var whimsyCells = opts.whimsy === false ? [] : chooseWhimsy(opts.rows, opts.cols, opts.seed);
  var imgW = opts.imgW, imgH = opts.imgH;
  var boardW = imgW * 2.3, boardH = imgH * 2.3;
  var imgOX = (boardW - imgW) / 2, imgOY = (boardH - imgH) / 2;
  var cellW = imgW / opts.cols, cellH = imgH / opts.rows;
  var M = 0.28 * Math.min(cellW, cellH);
  var pieces = [], groups = {}, zorder = [];
  var gidN = 0;
  for (var r = 0; r < opts.rows; r++) {
    for (var c = 0; c < opts.cols; c++) {
      var id = r * opts.cols + c;
      var gid = 'g' + (gidN++);
      // scatter: random board position outside the central image rect
      var x, y, tries = 0;
      do {
        x = rng() * (boardW - cellW);
        y = rng() * (boardH - cellH);
        tries++;
      } while (tries < 40 && x > imgOX - cellW && x < imgOX + imgW && y > imgOY - cellH && y < imgOY + imgH);
      var rot = opts.rotationOn ? [0, 90, 180, 270][(rng() * 4) | 0] : 0;
      pieces.push({ id: id, r: r, c: c, x: x, y: y, rot: rot, placed: false, gid: gid, whimsy: -1 });
      groups[gid] = [id];
      zorder.push(gid);
    }
  }
  // shuffle z-order so the scatter has no row/col bias
  for (var i = zorder.length - 1; i > 0; i--) {
    var j = (rng() * (i + 1)) | 0;
    var t = zorder[i]; zorder[i] = zorder[j]; zorder[j] = t;
  }
  var S0 = {
    id: opts.id, title: opts.title, imageKind: opts.imageKind,
    galleryIdx: opts.galleryIdx === undefined ? -1 : opts.galleryIdx,
    imageId: opts.imageId || null,
    rows: opts.rows, cols: opts.cols, seed: opts.seed, rotationOn: !!opts.rotationOn,
    imgW: imgW, imgH: imgH, boardW: boardW, boardH: boardH,
    imgOX: imgOX, imgOY: imgOY, cellW: cellW, cellH: cellH, margin: M,
    pieces: pieces, groups: groups, zorder: zorder,
    elapsed: 0, won: false, updatedAt: Date.now(), thumb: opts.thumb || null,
    edges: E, whimsy: whimsyCells
  };
  applyWhimsy(S0);
  return S0;
}

function trueX(p, S) { return S.imgOX + p.c * S.cellW; }
function trueY(p, S) { return S.imgOY + p.r * S.cellH; }
function snapDist(S) { return 0.32 * Math.min(S.cellW, S.cellH); }
function isEdgePiece(p, S) {
  return p.r === 0 || p.c === 0 || p.r === S.rows - 1 || p.c === S.cols - 1;
}

/* Render each piece's image (clipped to its path + baked shadow) to its own canvas. */
function renderPieceCanvases(S, imgCanvas) {
  var canvases = new Array(S.pieces.length);
  var paths = new Array(S.pieces.length);
  var M = S.margin, cw = S.cellW, ch = S.cellH;
  var pw = Math.ceil(cw + 2 * M), ph = Math.ceil(ch + 2 * M);
  for (var i = 0; i < S.pieces.length; i++) {
    var p = S.pieces[i];
    var isW = p.whimsy >= 0;
    var e = isW ? null : pieceEdges(S.edges, p.r, p.c);
    var cv = document.createElement('canvas');
    cv.width = pw; cv.height = ph;
    var c = cv.getContext('2d');
    // trace + clip + paint
    if (isW) traceWhimsyPath(c, M + cw * 0.03, M + ch * 0.03, cw * 0.94, ch * 0.94, p.whimsy);
    else tracePiecePath(c, M, M, cw, ch, e);
    c.save();
    c.clip();
    c.drawImage(imgCanvas, p.c * cw - M, p.r * ch - M, pw, ph, 0, 0, pw, ph);
    c.restore();
    // baked drop shadow + edge stroke (gold trim for whimsies)
    c.shadowColor = 'rgba(0,0,0,0.35)';
    c.shadowBlur = Math.max(4, M * 0.55);
    c.shadowOffsetY = 2;
    if (isW) traceWhimsyPath(c, M + cw * 0.03, M + ch * 0.03, cw * 0.94, ch * 0.94, p.whimsy);
    else tracePiecePath(c, M, M, cw, ch, e);
    c.strokeStyle = isW ? '#ffd166' : 'rgba(0,0,0,0.30)';
    c.lineWidth = isW ? Math.max(2.5, M * 0.16) : Math.max(1.5, M * 0.12);
    c.stroke();
    c.shadowColor = 'transparent';
    c.shadowBlur = 0; c.shadowOffsetY = 0;
    if (isW) traceWhimsyPath(c, M + cw * 0.03, M + ch * 0.03, cw * 0.94, ch * 0.94, p.whimsy);
    else tracePiecePath(c, M, M, cw, ch, e);
    c.strokeStyle = isW ? 'rgba(255,230,150,0.85)' : 'rgba(255,255,255,0.10)';
    c.lineWidth = 1;
    c.stroke();
    canvases[i] = cv;
    var path = new Path2D();
    var pc = { beginPath: function () { path = new Path2D(); }, moveTo: function (x, y) { path.moveTo(x, y); }, lineTo: function (x, y) { path.lineTo(x, y); }, bezierCurveTo: function (a, b, cc, d, ee, f) { path.bezierCurveTo(a, b, cc, d, ee, f); }, closePath: function () { path.closePath(); } };
    if (isW) traceWhimsyPath(pc, M + cw * 0.03, M + ch * 0.03, cw * 0.94, ch * 0.94, p.whimsy);
    else tracePiecePath(pc, M, M, cw, ch, e);
    paths[i] = path;
  }
  return { canvases: canvases, paths: paths };
}

/* Serialize for IndexedDB (edges rebuild from seed; canvases rebuilt from image). */
function serializeState(S) {
  return {
    id: S.id, title: S.title, imageKind: S.imageKind, galleryIdx: S.galleryIdx,
    imageId: S.imageId, rows: S.rows, cols: S.cols, seed: S.seed,
    rotationOn: S.rotationOn, imgW: S.imgW, imgH: S.imgH,
    pieces: S.pieces.map(function (p) {
      return { id: p.id, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, rot: p.rot, placed: p.placed, gid: p.gid };
    }),
    groups: S.groups, zorder: S.zorder,
    elapsed: Math.round(S.elapsed), won: S.won,
    updatedAt: Date.now(), thumb: S.thumb, whimsy: S.whimsy || []
  };
}

/* Restore a saved state; fills migration-safe defaults for older saves. */
function deserializeState(saved) {
  var d = {
    imageKind: 'gallery', galleryIdx: 0, imageId: null, rotationOn: false,
    thumb: null, won: false, elapsed: 0, title: 'Puzzle'
  };
  for (var k in saved) d[k] = saved[k];
  var rng = mulberry32(d.seed);
  // Rebuild the edge table from the seed. buildEdges is always called first
  // with a fresh PRNG stream (both here and in newPuzzleState), so the table
  // is identical to the one used at creation. Piece positions come from the
  // save itself, so the later scatter stream is not needed.
  var E = buildEdges(d.rows, d.cols, rng);
  var imgW = d.imgW, imgH = d.imgH;
  var boardW = imgW * 2.3, boardH = imgH * 2.3;
  var S = {
    id: d.id, title: d.title, imageKind: d.imageKind, galleryIdx: d.galleryIdx,
    imageId: d.imageId, rows: d.rows, cols: d.cols, seed: d.seed, rotationOn: !!d.rotationOn,
    imgW: imgW, imgH: imgH, boardW: boardW, boardH: boardH,
    imgOX: (boardW - imgW) / 2, imgOY: (boardH - imgH) / 2,
    cellW: imgW / d.cols, cellH: imgH / d.rows,
    margin: 0.28 * Math.min(imgW / d.cols, imgH / d.rows),
    pieces: [], groups: d.groups || {}, zorder: d.zorder || [],
    elapsed: d.elapsed || 0, won: !!d.won, updatedAt: d.updatedAt || Date.now(),
    thumb: d.thumb || null, edges: E, whimsy: d.whimsy || []
  };
  for (var i = 0; i < d.pieces.length; i++) {
    var sp = d.pieces[i];
    var r = (sp.id / d.cols) | 0, c = sp.id % d.cols;
    S.pieces.push({
      id: sp.id, r: r, c: c,
      x: sp.x === undefined ? 0 : sp.x, y: sp.y === undefined ? 0 : sp.y,
      rot: sp.rot || 0, placed: !!sp.placed, gid: sp.gid || null, whimsy: -1
    });
  }
  applyWhimsy(S);
  return S;
}

/* ---------------- snap + grouping (pure logic over state) ---------------- */
function groupMembers(S, gid) {
  var ids = S.groups[gid] || [];
  var out = [];
  for (var i = 0; i < ids.length; i++) out.push(S.pieces[ids[i]]);
  return out;
}

function mergeGroups(S, gidA, gidB) {
  if (gidA === gidB) return gidA;
  var a = S.groups[gidA] || [], b = S.groups[gidB] || [];
  for (var i = 0; i < b.length; i++) { S.pieces[b[i]].gid = gidA; a.push(b[i]); }
  S.groups[gidA] = a;
  delete S.groups[gidB];
  S.zorder = S.zorder.filter(function (g) { return g !== gidB; });
  if (S.zorder.indexOf(gidA) < 0) S.zorder.push(gidA);
  return gidA;
}

function neighborsOf(p, S) {
  var out = [];
  if (p.r > 0) out.push(S.pieces[(p.r - 1) * S.cols + p.c]);
  if (p.r < S.rows - 1) out.push(S.pieces[(p.r + 1) * S.cols + p.c]);
  if (p.c > 0) out.push(S.pieces[p.r * S.cols + p.c - 1]);
  if (p.c < S.cols - 1) out.push(S.pieces[p.r * S.cols + p.c + 1]);
  return out;
}

/* After a drop: fuse relatively-correct neighbors, then lock the group if
 * it sits on its true board position. Returns {merged, placed}. */
function snapAfterDrop(S, gid) {
  var sd = snapDist(S), merged = false, placed = false;
  var changed = true, guard = 0;
  while (changed && guard++ < 10) {
    changed = false;
    var members = groupMembers(S, gid);
    for (var i = 0; i < members.length; i++) {
      var p = members[i];
      var ns = neighborsOf(p, S);
      for (var j = 0; j < ns.length; j++) {
        var q = ns[j];
        if (q.placed || q.gid === gid) continue;
        if (S.rotationOn && q.rot !== p.rot) continue;
        var dx = (q.x - p.x) - (trueX(q, S) - trueX(p, S));
        var dy = (q.y - p.y) - (trueY(q, S) - trueY(p, S));
        if (Math.hypot(dx, dy) < sd) {
          gid = mergeGroups(S, gid, q.gid);
          merged = true; changed = true;
        }
      }
    }
  }
  // absolute placement: whole group locks when a member is home
  members = groupMembers(S, gid);
  var placedWhimsy = [];
  for (var k = 0; k < members.length; k++) {
    var m = members[k];
    if (Math.hypot(m.x - trueX(m, S), m.y - trueY(m, S)) < sd &&
        (!S.rotationOn || m.rot % 360 === 0)) {
      var all = groupMembers(S, gid);
      for (var a = 0; a < all.length; a++) {
        all[a].x = trueX(all[a], S); all[a].y = trueY(all[a], S);
        all[a].rot = 0; all[a].placed = true; all[a].gid = null;
        if (all[a].whimsy >= 0) placedWhimsy.push(all[a].whimsy);
      }
      delete S.groups[gid];
      S.zorder = S.zorder.filter(function (g) { return g !== gid; });
      placed = true;
      break;
    }
  }
  return { merged: merged, placed: placed, placedWhimsy: placedWhimsy };
}

/* Rotate a whole group 90deg clockwise about its centroid. */
function rotateGroup(S, gid) {
  var members = groupMembers(S, gid);
  if (!members.length) return;
  var cx = 0, cy = 0;
  for (var i = 0; i < members.length; i++) {
    cx += members[i].x + S.cellW / 2; cy += members[i].y + S.cellH / 2;
  }
  cx /= members.length; cy /= members.length;
  for (var j = 0; j < members.length; j++) {
    var p = members[j];
    var vx = (p.x + S.cellW / 2) - cx, vy = (p.y + S.cellH / 2) - cy;
    var nx = cx - vy, ny = cy + vx; // CW in y-down coords
    p.x = clamp(nx - S.cellW / 2, 0, S.boardW - S.cellW);
    p.y = clamp(ny - S.cellH / 2, 0, S.boardH - S.cellH);
    p.rot = (p.rot + 90) % 360;
  }
}

function placedCount(S) {
  var n = 0;
  for (var i = 0; i < S.pieces.length; i++) if (S.pieces[i].placed) n++;
  return n;
}
function isComplete(S) { return placedCount(S) === S.pieces.length; }

/* ---------------- game controller: canvas, camera, render ---------------- */
var Game = {
  S: null, imgCanvas: null,
  pieceCv: [], piecePaths: [],
  canvas: null, ctx: null, hitCtx: null,
  cam: { x: 0, y: 0, s: 1 },
  dpr: 1, cw: 0, ch: 0,
  dirty: true, raf: 0, lastT: 0,
  selection: null, edgeHi: false,
  paused: false, confetti: null,
  pointers: new Map(), gesture: null, downInfo: null,
  saveTimer: 0,
  tableTheme: 'cardboard', _pats: {},

  TABLE_THEMES: [
    { id: 'cardboard', name: 'Cardboard', css: '#9c8a6c' },
    { id: 'walnut', name: 'Walnut', css: '#4a3220' },
    { id: 'felt', name: 'Felt', css: '#1e4d3a' }
  ],

  init: function () {
    this.canvas = $('#board');
    this.ctx = this.canvas.getContext('2d');
    try {
      var t = localStorage.getItem('pdawg-table');
      if (t) this.tableTheme = t;
    } catch (e) {}
    var hc = document.createElement('canvas');
    hc.width = 1; hc.height = 1;
    this.hitCtx = hc.getContext('2d');
    this.bindInput();
    window.addEventListener('resize', this.resize.bind(this));
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) Game.saveNow();
    });
    window.addEventListener('pagehide', function () { Game.saveNow(); });
  },

  resize: function () {
    var wrap = $('#game');
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    // Size the canvas to its flex-allocated box: container minus the
    // topbar and toolbar. (Measuring #game alone and forcing the canvas
    // to that height overflows the flex column and pushes the toolbar
    // below the fold on desktop.)
    var topbar = wrap.querySelector('.topbar');
    var toolbar = wrap.querySelector('.toolbar');
    var chromeH = (topbar ? topbar.offsetHeight : 0) + (toolbar ? toolbar.offsetHeight : 0);
    this.cw = wrap.clientWidth;
    this.ch = Math.max(50, wrap.clientHeight - chromeH);
    this.canvas.width = Math.round(this.cw * this.dpr);
    this.canvas.height = Math.round(this.ch * this.dpr);
    this.canvas.style.width = this.cw + 'px';
    this.canvas.style.height = this.ch + 'px';
    this.dirty = true;
  },

  setTheme: function (id) {
    this.tableTheme = id;
    try { localStorage.setItem('pdawg-table', id); } catch (e) {}
    this.markDirty();
  },

  /* Seeded, tileable table texture per theme (built once, reused). */
  tablePattern: function (theme) {
    if (this._pats[theme]) return this._pats[theme];
    var cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    var c = cv.getContext('2d');
    var rng = mulberry32(hashStr('table:' + theme));
    var i, x, y;
    if (theme === 'walnut') {
      c.fillStyle = '#4a3220'; c.fillRect(0, 0, 256, 256);
      for (i = 0; i < 46; i++) {           /* wood grain */
        c.strokeStyle = 'rgba(20,10,4,' + (0.10 + rng() * 0.16).toFixed(2) + ')';
        c.lineWidth = 1 + rng() * 2.2;
        c.beginPath();
        y = rng() * 256;
        c.moveTo(0, y);
        for (x = 0; x <= 256; x += 32) c.lineTo(x, y + Math.sin(x * 0.05 + rng() * 6) * 4);
        c.stroke();
      }
      for (i = 0; i < 200; i++) {
        c.fillStyle = 'rgba(255,220,170,' + (rng() * 0.05).toFixed(3) + ')';
        c.fillRect(rng() * 256, rng() * 256, 2, 2);
      }
    } else if (theme === 'felt') {
      c.fillStyle = '#1e4d3a'; c.fillRect(0, 0, 256, 256);
      for (i = 0; i < 2600; i++) {          /* felt nap */
        var v = rng();
        c.fillStyle = v < 0.5 ? 'rgba(0,0,0,' + (rng() * 0.14).toFixed(3) + ')'
                              : 'rgba(180,255,210,' + (rng() * 0.06).toFixed(3) + ')';
        c.fillRect(rng() * 256, rng() * 256, 1.6, 1.6);
      }
    } else {                                /* cardboard — like a real puzzle table */
      c.fillStyle = '#9c8a6c'; c.fillRect(0, 0, 256, 256);
      for (i = 0; i < 34; i++) {            /* fluting shadows */
        c.strokeStyle = 'rgba(60,45,25,' + (0.05 + rng() * 0.08).toFixed(2) + ')';
        c.lineWidth = 2 + rng() * 5;
        c.beginPath();
        x = rng() * 256;
        c.moveTo(x, 0); c.lineTo(x + (rng() - 0.5) * 24, 256);
        c.stroke();
      }
      for (i = 0; i < 900; i++) {           /* paper flecks */
        c.fillStyle = rng() < 0.6 ? 'rgba(70,55,35,' + (rng() * 0.12).toFixed(3) + ')'
                                  : 'rgba(255,245,225,' + (rng() * 0.10).toFixed(3) + ')';
        c.fillRect(rng() * 256, rng() * 256, 1 + rng() * 2, 1 + rng() * 2);
      }
    }
    var pat = this.ctx.createPattern(cv, 'repeat');
    this._pats[theme] = pat;
    return pat;
  },

  fitBoard: function () {
    var S = this.S;
    if (!S) return;
    var s = Math.min(this.cw / S.boardW, this.ch / S.boardH) * 0.985;
    this.cam.s = s;
    this.cam.x = S.boardW / 2;
    this.cam.y = S.boardH / 2;
    this.dirty = true;
  },

  toBoard: function (sx, sy) {
    return {
      x: this.cam.x + (sx - this.cw / 2) / this.cam.s,
      y: this.cam.y + (sy - this.ch / 2) / this.cam.s
    };
  },

  start: function (S, imgCanvas) {
    this.S = S;
    this.imgCanvas = imgCanvas;
    var rc = renderPieceCanvases(S, imgCanvas);
    this.pieceCv = rc.canvases;
    this.piecePaths = rc.paths;
    this.selection = null;
    this.paused = false;
    this.confetti = null;
    this.edgeHi = false;
    $('#edgeBtn').classList.remove('on');
    this.resize();
    this.fitBoard();
    this.lastT = performance.now();
    $('#timer').textContent = fmtTime(S.elapsed);
    $('#puzzleTitle').textContent = S.title;
    cancelAnimationFrame(this.raf);
    var self = this;
    function loop(t) {
      self.frame(t);
      self.raf = requestAnimationFrame(loop);
    }
    this.raf = requestAnimationFrame(loop);
    this.markDirty();
    this.updateProgress();
  },

  stop: function () {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.saveNow();
    this.S = null;
  },

  markDirty: function () { this.dirty = true; },

  frame: function (t) {
    var dt = t - this.lastT;
    this.lastT = t;
    var S = this.S;
    if (S && !this.paused && !S.won) {
      S.elapsed += dt;
      if (!this._tick || t - this._tick > 500) {
        this._tick = t;
        $('#timer').textContent = fmtTime(S.elapsed);
      }
    }
    if (this.confetti) this.updateConfetti(dt);
    if (this.dirty) { this.draw(); this.dirty = false; }
    else if (this.confetti) { this.draw(); }
  },

  draw: function () {
    var S = this.S, ctx = this.ctx;
    if (!S) return;
    var dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.cw, this.ch);
    ctx.fillStyle = '#14161f';
    ctx.fillRect(0, 0, this.cw, this.ch);
    var s = this.cam.s;
    ctx.setTransform(dpr * s, 0, 0, dpr * s,
      dpr * (this.cw / 2 - this.cam.x * s),
      dpr * (this.ch / 2 - this.cam.y * s));
    // board backdrop: puzzle-table theme
    var pat = this.tablePattern(this.tableTheme);
    ctx.fillStyle = pat || '#1c1f2b';
    ctx.fillRect(0, 0, S.boardW, S.boardH);
    // soft vignette so the table feels lit from above
    var vg = ctx.createRadialGradient(
      S.boardW / 2, S.boardH / 2, Math.min(S.boardW, S.boardH) * 0.35,
      S.boardW / 2, S.boardH / 2, Math.max(S.boardW, S.boardH) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, S.boardW, S.boardH);
    // image frame outline
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2 / s;
    ctx.strokeRect(S.imgOX, S.imgOY, S.imgW, S.imgH);
    // placed pieces first
    var i, p;
    for (i = 0; i < S.pieces.length; i++) {
      p = S.pieces[i];
      if (p.placed) this.drawPiece(p, false);
    }
    // loose groups in z-order
    for (i = 0; i < S.zorder.length; i++) {
      var members = groupMembers(S, S.zorder[i]);
      for (var j = 0; j < members.length; j++) {
        var dim = this.edgeHi && !isEdgePiece(members[j], S);
        this.drawPiece(members[j], dim);
      }
    }
    // selection highlight
    if (this.selection && S.groups[this.selection]) {
      var ms = groupMembers(S, this.selection);
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (var k = 0; k < ms.length; k++) {
        x0 = Math.min(x0, ms[k].x - S.margin); y0 = Math.min(y0, ms[k].y - S.margin);
        x1 = Math.max(x1, ms[k].x + S.cellW + S.margin); y1 = Math.max(y1, ms[k].y + S.cellH + S.margin);
      }
      ctx.save();
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 3 / s;
      ctx.setLineDash([10 / s, 7 / s]);
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.restore();
    }
    // confetti (screen space)
    if (this.confetti) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var ps = this.confetti;
      for (var cI = 0; cI < ps.length; cI++) {
        var pt = ps[cI];
        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(pt.rot);
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = Math.max(0, pt.life);
        ctx.fillRect(-4, -2.5, 8, 5);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  },

  drawPiece: function (p, dim) {
    var S = this.S;
    var cv = this.pieceCv[p.id];
    var M = S.margin;
    var cx = p.x + S.cellW / 2, cy = p.y + S.cellH / 2;
    var ctx = this.ctx;
    ctx.save();
    if (dim) ctx.globalAlpha = 0.32;
    ctx.translate(cx, cy);
    if (p.rot) ctx.rotate(p.rot * Math.PI / 180);
    ctx.drawImage(cv, -(S.cellW / 2 + M), -(S.cellH / 2 + M), S.cellW + 2 * M, S.cellH + 2 * M);
    ctx.restore();
  },

  updateConfetti: function (dt) {
    var ps = this.confetti, alive = false;
    var cols = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#f78c6b', '#ffffff'];
    if (!this._confInit) {
      this._confInit = true;
      for (var i = 0; i < 160; i++) {
        ps.push({
          x: Math.random() * this.cw, y: -20 - Math.random() * this.ch * 0.5,
          vx: (Math.random() - 0.5) * 120, vy: 120 + Math.random() * 220,
          rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 10,
          color: cols[(Math.random() * cols.length) | 0], life: 1
        });
      }
    }
    for (var j = 0; j < ps.length; j++) {
      var p = ps[j];
      p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000;
      p.rot += p.vr * dt / 1000;
      if (p.y > this.ch + 30) p.life -= dt / 800;
      if (p.life > 0) alive = true;
    }
    if (!alive) { this.confetti = null; this._confInit = false; }
    this.dirty = true;
  },

  updateProgress: function () {
    var S = this.S;
    if (!S) return;
    var n = placedCount(S), total = S.pieces.length;
    $('#prog').textContent = n + ' / ' + total + '  (' + Math.round(n / total * 100) + '%)';
  }
};

/* ---------------- input: drag / pan / pinch / tap ---------------- */
Game.bindInput = function () {
  var cv = this.canvas, self = this;
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', function (e) { self.onDown(e); });
  cv.addEventListener('pointermove', function (e) { self.onMove(e); });
  cv.addEventListener('pointerup', function (e) { self.onUp(e); });
  cv.addEventListener('pointercancel', function (e) { self.onUp(e); });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  // double-tap detection
  cv.addEventListener('pointerdown', function (e) {
    var now = performance.now();
    if (self._lastTap && now - self._lastTap.t < 350 &&
        Math.hypot(e.clientX - self._lastTap.x, e.clientY - self._lastTap.y) < 28) {
      self.onDoubleTap(e);
      self._lastTap = null;
    }
  });
};

Game.hitTest = function (bx, by) {
  var S = this.S;
  if (!S) return null;
  var M = S.margin;
  for (var i = S.zorder.length - 1; i >= 0; i--) {
    var members = groupMembers(S, S.zorder[i]);
    for (var j = members.length - 1; j >= 0; j--) {
      var p = members[j];
      var lx = bx - (p.x - M), ly = by - (p.y - M);
      if (p.rot) {
        var cx = M + S.cellW / 2, cy = M + S.cellH / 2;
        var a = -p.rot * Math.PI / 180;
        var dx = lx - cx, dy = ly - cy;
        lx = cx + dx * Math.cos(a) - dy * Math.sin(a);
        ly = cy + dx * Math.sin(a) + dy * Math.cos(a);
      }
      if (lx < -2 || ly < -2 || lx > S.cellW + 2 * M + 2 || ly > S.cellH + 2 * M + 2) continue;
      this.hitCtx.setTransform(1, 0, 0, 1, 0, 0);
      if (this.hitCtx.isPointInPath(this.piecePaths[p.id], lx, ly)) return p;
    }
  }
  return null;
};

Game.onDown = function (e) {
  if (!this.S || this.paused || this.S.won) return;
  e.preventDefault();
  try { this.canvas.setPointerCapture(e.pointerId); } catch (err) {}
  this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  var now = performance.now();
  this.downInfo = { x: e.clientX, y: e.clientY, t: now, moved: false, tapDone: false };
  if (this.pointers.size === 2) {
    // switch to pinch
    var pts = Array.from(this.pointers.values());
    var b0 = this.toBoard(pts[0].x, pts[0].y), b1 = this.toBoard(pts[1].x, pts[1].y);
    this.gesture = {
      type: 'pinch',
      d0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
      s0: this.cam.s,
      mx: (pts[0].x + pts[1].x) / 2, my: (pts[0].y + pts[1].y) / 2,
      bx: (b0.x + b1.x) / 2, by: (b0.y + b1.y) / 2
    };
    return;
  }
  if (this.pointers.size > 2) return;
  var b = this.toBoard(e.clientX, e.clientY);
  var hit = this.hitTest(b.x, b.y);
  if (hit) {
    var gid = hit.gid;
    // bring to front
    var S = this.S;
    S.zorder = S.zorder.filter(function (g) { return g !== gid; });
    S.zorder.push(gid);
    var members = groupMembers(S, gid);
    this.gesture = {
      type: 'drag', gid: gid,
      startBX: b.x, startBY: b.y,
      orig: members.map(function (p) { return { p: p, x: p.x, y: p.y }; })
    };
    this.selection = gid;
    this.updateRotateBtn();
    sfx('pickup');
  } else {
    this.gesture = {
      type: 'pan',
      startX: e.clientX, startY: e.clientY,
      camX: this.cam.x, camY: this.cam.y
    };
  }
  this.markDirty();
};

Game.onMove = function (e) {
  if (!this.pointers.has(e.pointerId)) return;
  this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  var g = this.gesture;
  if (this.downInfo && Math.hypot(e.clientX - this.downInfo.x, e.clientY - this.downInfo.y) > 10) {
    this.downInfo.moved = true;
  }
  if (!g) return;
  if (g.type === 'drag') {
    var b = this.toBoard(e.clientX, e.clientY);
    var dx = b.x - g.startBX, dy = b.y - g.startBY;
    for (var i = 0; i < g.orig.length; i++) {
      var o = g.orig[i];
      o.p.x = clamp(o.x + dx, -this.S.cellW * 0.4, this.S.boardW - this.S.cellW * 0.6);
      o.p.y = clamp(o.y + dy, -this.S.cellH * 0.4, this.S.boardH - this.S.cellH * 0.6);
    }
    this.markDirty();
  } else if (g.type === 'pan') {
    this.cam.x = g.camX - (e.clientX - g.startX) / this.cam.s;
    this.cam.y = g.camY - (e.clientY - g.startY) / this.cam.s;
    this.clampCam();
    this.markDirty();
  } else if (g.type === 'pinch' && this.pointers.size >= 2) {
    var pts = Array.from(this.pointers.values());
    var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
    var ns = clamp(g.s0 * d / g.d0, this.minZoom(), this.maxZoom());
    var mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
    // keep the original midpoint's board point under the fingers
    this.cam.s = ns;
    this.cam.x = g.bx - (mx - this.cw / 2) / ns;
    this.cam.y = g.by - (my - this.ch / 2) / ns;
    this.clampCam();
    this.markDirty();
  }
};

Game.minZoom = function () {
  var S = this.S;
  return Math.min(this.cw / S.boardW, this.ch / S.boardH) * 0.7;
};
Game.maxZoom = function () {
  var S = this.S;
  return Math.max(2.2, 900 / Math.min(S.cellW, S.cellH));
};
Game.clampCam = function () {
  var S = this.S;
  this.cam.s = clamp(this.cam.s, this.minZoom(), this.maxZoom());
  var vw = this.cw / this.cam.s / 2, vh = this.ch / this.cam.s / 2;
  this.cam.x = clamp(this.cam.x, -vw * 0.4, S.boardW + vw * 0.4);
  this.cam.y = clamp(this.cam.y, -vh * 0.4, S.boardH + vh * 0.4);
};

Game.onUp = function (e) {
  var wasTap = this.downInfo && !this.downInfo.moved &&
    (performance.now() - this.downInfo.t) < 350 && this.pointers.size === 1;
  this.pointers.delete(e.pointerId);
  var g = this.gesture;
  if (g && g.type === 'drag' && this.pointers.size === 0) {
    var res = resolveDrop(this.S, g.gid);
    if (res.merged || res.placed) {
      this.updateProgress();
      if (res.placed) this.checkWin();
    }
    this.scheduleSave();
    this.markDirty();
  }
  if (this.pointers.size === 0) {
    if (wasTap && g) this.onTap(e, g);
    this.gesture = null;
  } else if (this.pointers.size === 1 && g && g.type === 'pinch') {
    // pinch ended with one finger left: start fresh pan on next move
    var pts = Array.from(this.pointers.values());
    this.gesture = {
      type: 'pan', startX: pts[0].x, startY: pts[0].y,
      camX: this.cam.x, camY: this.cam.y
    };
  }
  this.downInfo = null;
};

Game.onTap = function (e, g) {
  var S = this.S;
  if (!S || this._dblFired) { this._dblFired = false; return; }
  this._lastTap = { x: e.clientX, y: e.clientY, t: performance.now() };
  var b = this.toBoard(e.clientX, e.clientY);
  if (g.type === 'drag') {
    // tapped a piece: select it (already set on down)
    this.markDirty();
  } else {
    // tapped empty space: move selection there, or deselect
    if (this.selection && S.groups[this.selection]) {
      var members = groupMembers(S, this.selection);
      var cx = 0, cy = 0;
      for (var i = 0; i < members.length; i++) {
        cx += members[i].x + S.cellW / 2; cy += members[i].y + S.cellH / 2;
      }
      cx /= members.length; cy /= members.length;
      var dx = clamp(b.x, 0, S.boardW) - cx, dy = clamp(b.y, 0, S.boardH) - cy;
      for (var j = 0; j < members.length; j++) {
        members[j].x = clamp(members[j].x + dx, -S.cellW * 0.4, S.boardW - S.cellW * 0.6);
        members[j].y = clamp(members[j].y + dy, -S.cellH * 0.4, S.boardH - S.cellH * 0.6);
      }
      var res = resolveDrop(S, this.selection);
      if (res.placed) this.checkWin();
      this.updateProgress();
      this.scheduleSave();
    } else {
      this.selection = null;
      this.updateRotateBtn();
    }
    this.markDirty();
  }
};

Game.onDoubleTap = function (e) {
  var S = this.S;
  if (!S || !S.rotationOn || this.paused || S.won) return;
  var b = this.toBoard(e.clientX, e.clientY);
  var hit = this.hitTest(b.x, b.y);
  if (hit) {
    this._dblFired = true;
    this._lastTap = null;
    rotateGroup(S, hit.gid);
    this.scheduleSave();
    this.markDirty();
  }
};

Game.rotateSelection = function () {
  var S = this.S;
  if (!S || !S.rotationOn) return;
  var gid = this.selection && S.groups[this.selection] ? this.selection : null;
  if (!gid) { toast('Tap a piece first, then rotate'); return; }
  rotateGroup(S, gid);
  this.scheduleSave();
  this.markDirty();
};

Game.updateRotateBtn = function () {
  var btn = $('#rotBtn');
  if (!this.S || !this.S.rotationOn) { btn.style.display = 'none'; return; }
  btn.style.display = '';
  btn.classList.toggle('on', !!(this.selection && this.S.groups[this.selection]));
};

/* Gallery access that works in browser and Node (tests). */
function getGallery() {
  if (typeof window !== 'undefined' && window.PDAWG_GALLERY) return window.PDAWG_GALLERY;
  if (typeof require !== 'undefined') {
    try { return require('./gallery.js'); } catch (e) { /* ignore */ }
  }
  return null;
}

/* ---------------- persistence + win ---------------- */
Game.scheduleSave = function () {
  clearTimeout(this.saveTimer);
  var self = this;
  this.saveTimer = setTimeout(function () { self.saveNow(); }, 2000);
};

Game.saveNow = function () {
  var S = this.S;
  if (!S) return;
  clearTimeout(this.saveTimer);
  var data = serializeState(S);
  var self = this;
  idb.put('puzzles', data).then(function () {
    var n = placedCount(S), total = S.pieces.length;
    shelf.upsert({
      id: S.id, title: S.title, thumb: S.thumb,
      rows: S.rows, cols: S.cols,
      pct: Math.round(n / total * 100),
      updatedAt: Date.now(), imageKind: S.imageKind, galleryIdx: S.galleryIdx,
      rotationOn: S.rotationOn, done: S.won
    });
    if (typeof UI !== 'undefined') UI.renderShelf();
  }).catch(function () {});
};

Game.bestKey = function () {
  var S = this.S;
  var imgKey = S.imageKind === 'gallery' ? 'g' + S.galleryIdx : (S.imageKind === 'daily' ? 'daily' : 'custom');
  return imgKey + ':' + S.rows + 'x' + S.cols + ':r' + (S.rotationOn ? 1 : 0);
};

Game.checkWin = function () {
  var S = this.S;
  if (!S || S.won || !isComplete(S)) return;
  S.won = true;
  this.selection = null;
  this.confetti = [];
  this._confInit = false;
  sfx('win');
  var key = this.bestKey();
  var prev = bests.get(key);
  var isBest = !prev || S.elapsed < prev;
  if (isBest) bests.set(key, Math.round(S.elapsed));
  this.saveNow();
  // daily completion + streak
  var whimsyFound = 0, i;
  for (i = 0; i < S.pieces.length; i++) if (S.pieces[i].whimsy >= 0 && S.pieces[i].placed) whimsyFound++;
  if (S.imageKind === 'daily') {
    try { localStorage.setItem('pdawg-daily', JSON.stringify({ date: dailyStr(), ms: Math.round(S.elapsed) })); } catch (e) {}
  }
  statsRecordWin(S, whimsyFound);
  var self = this;
  setTimeout(function () { UI.showWin(isBest, prev, whimsyFound); }, 900);
  this.markDirty();
};

/* ---------------- lifetime stats ---------------- */
var STATS_KEY = 'pdawg-stats-v1';
function statsRead() {
  try { return Object.assign({ solved: 0, pieces: 0, whimsies: 0, streak: 0, streakDate: '' }, JSON.parse(localStorage.getItem(STATS_KEY) || '{}')); }
  catch (e) { return { solved: 0, pieces: 0, whimsies: 0, streak: 0, streakDate: '' }; }
}
function statsRecordWin(S, whimsyFound) {
  var st = statsRead();
  st.solved++;
  st.pieces += S.pieces.length;
  st.whimsies += whimsyFound;
  if (S.imageKind === 'daily') {
    var today = dailyStr();
    var y = new Date(); y.setDate(y.getDate() - 1);
    var yest = dailyStr(y);
    st.streak = (st.streakDate === yest) ? st.streak + 1 : 1;
    st.streakDate = today;
  }
  try { localStorage.setItem(STATS_KEY, JSON.stringify(st)); } catch (e) {}
}

/* ---------------- arcade leaderboards ---------------- */
var ARCADE_BASE = 'https://gamez-arcade.chaoticutopia84.workers.dev';
var ARCADE_NAME_KEY = 'arcade_name';
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function fmtClockSecs(sec) {
  sec = Math.max(0, Math.round(sec));
  var m = (sec / 60) | 0, s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}
function arcadeSubmitWin(S) {
  var box = $('#winBoard');
  if (!box) return;
  var secs = Math.round(S.elapsed / 1000);
  var score = Math.max(0, 7200 - secs);   /* higher = faster; worker cap 7200 */
  var isDaily = S.imageKind === 'daily';
  var board = isDaily ? 'daily-' + dailyStr() : 'tier-' + S.pieces.length;
  var title = isDaily ? 'DAILY BEST' : 'FASTEST · ' + S.pieces.length + ' PIECES';
  function render(top, rank, name) {
    var rows = (!top || !top.length)
      ? '<div class="arc-empty">No times yet — be the first!</div>'
      : top.slice(0, 5).map(function (e, i) {
          var medals = ['🥇', '🥈', '🥉'];
          return '<div class="arc-row' + (e.name === name ? ' me' : '') + '"><span>' +
            (medals[i] || (i + 1) + '.') + ' ' + escHtml(e.name) + '</span><b>' + fmtClockSecs(7200 - e.score) + '</b></div>';
        }).join('');
    box.innerHTML = '<div class="arc-title">🏆 ' + title + '</div>' +
      (rank > 0 ? '<div class="arc-rank">🌍 GLOBAL #' + rank + '</div>' : '') + rows;
  }
  function post(name) {
    fetch(ARCADE_BASE + '/score', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'pdawg', board: board, name: name, score: score })
    }).then(function (r) { return r.json(); }).then(function (d) {
      render(d.top, d.rank || 0, name);
    }).catch(function () { render(null, 0, ''); });
  }
  var name = '';
  try { name = (localStorage.getItem(ARCADE_NAME_KEY) || '').trim(); } catch (e) {}
  if (name) { post(name); return; }
  box.innerHTML = '<div class="arc-title">🏆 ' + title + '</div>' +
    '<div class="arc-form"><input id="arc-name" maxlength="12" placeholder="YOUR NAME">' +
    '<button id="arc-go">SAVE</button></div>';
  $('#arc-go').onclick = function () {
    var v = $('#arc-name').value.trim().slice(0, 12);
    if (!v) return;
    try { localStorage.setItem(ARCADE_NAME_KEY, v); } catch (e) {}
    box.innerHTML = '<div class="arc-empty">sending…</div>';
    post(v);
  };
  fetch(ARCADE_BASE + '/scores?game=pdawg&board=' + encodeURIComponent(board))
    .then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.top && $('#arc-name')) render(d.top, 0, '');
    }).catch(function () {});
}

/* ---------------- image loading ---------------- */
function loadImageCanvas(S) {
  // returns Promise<canvas> of imgW x imgH
  return new Promise(function (resolve, reject) {
    var cv = document.createElement('canvas');
    cv.width = Math.round(S.imgW); cv.height = Math.round(S.imgH);
    var cx = cv.getContext('2d');
    function paintGallery(idx) {
      getGallery().paintAsync(idx, Math.round(S.imgW), Math.round(S.imgH), 1234).then(function (src) {
        cx.drawImage(src, 0, 0, cv.width, cv.height);
        resolve(cv);
      }, reject);
    }
    if (S.imageKind === 'daily') {
      var dateStr = (S.id || '').replace(/^daily-/, '') || dailyStr();
      dailyImageBlob(dateStr).then(function (blob) {
        if (!blob) { paintGallery(S.galleryIdx); return; }
        imageBlobToBitmap(blob).then(function (bmp) {
          cx.drawImage(bmp, 0, 0, cv.width, cv.height);
          resolve(cv);
        }).catch(function () { paintGallery(S.galleryIdx); });
      });
    } else if (S.imageKind === 'gallery') {
      paintGallery(S.galleryIdx);
    } else {
      idb.get('images', S.imageId).then(function (rec) {
        if (!rec) { reject(new Error('image missing')); return; }
        imageBlobToBitmap(rec.blob).then(function (bmp) {
          cx.drawImage(bmp, 0, 0, cv.width, cv.height);
          resolve(cv);
        }).catch(reject);
      }).catch(reject);
    }
  });
}

function imageBlobToBitmap(blob) {
  if (window.createImageBitmap) return window.createImageBitmap(blob);
  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function () {
      var cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      cv.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(cv);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function fileToImageRecord(file) {
  return imageBlobToBitmap(file).then(function (bmp) {
    var w = bmp.width, h = bmp.height;
    var maxDim = 1600;
    var sc = Math.min(1, maxDim / Math.max(w, h));
    w = Math.round(w * sc); h = Math.round(h * sc);
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    return new Promise(function (resolve, reject) {
      cv.toBlob(function (blob) {
        if (!blob) { reject(new Error('encode failed')); return; }
        resolve({ blob: blob, w: w, h: h });
      }, 'image/jpeg', 0.85);
    });
  });
}

function makeThumb(imgCanvas) {
  var tw = 168, th = Math.round(168 * imgCanvas.height / imgCanvas.width);
  var cv = document.createElement('canvas');
  cv.width = tw; cv.height = th;
  cv.getContext('2d').drawImage(imgCanvas, 0, 0, tw, th);
  return cv.toDataURL('image/jpeg', 0.7);
}

/* ---------------- daily (AI-painted, same image worldwide) ---------------- */
function dailyStr(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
function dailySpec(dateStr) {
  var n = hashStr('pdawg-daily-' + (dateStr || dailyStr()));
  var g = getGallery().GALLERY;
  return {
    id: 'daily-' + (dateStr || dailyStr()),
    galleryIdx: n % g.length,   /* offline fallback image */
    count: COUNTS[(n >>> 4) % COUNTS.length],
    title: 'Daily Puzzle'
  };
}
/* Daily image: AI-painted via the jigsaw-ai worker, cached in IndexedDB.
 * Falls back to the procedural gallery image when offline. */
function dailyImageBlob(dateStr) {
  var id = 'dailyimg-' + dateStr;
  return idb.get('images', id).then(function (rec) {
    if (rec && rec.blob) return rec.blob;
    if (!window.PDAWG_AI) return null;
    return window.PDAWG_AI.daily(dateStr).then(function (res) {
      if (!res || !res.blob) return null;
      idb.put('images', { id: id, blob: res.blob }).catch(function () {});
      return res.blob;
    });
  }).catch(function () { return null; });
}
function dailyDone(dateStr) {
  try {
    var d = JSON.parse(localStorage.getItem('pdawg-daily') || 'null');
    return d && d.date === (dateStr || dailyStr()) ? d : null;
  } catch (e) { return null; }
}

/* ---------------- UI: home, modals, toolbar ---------------- */
function toast(msg) {
  var t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tm);
  t._tm = setTimeout(function () { t.classList.remove('show'); }, 2200);
}

/* Safe SFX call (audio.js may fail to load; game must not). */
function sfx(name) {
  try { if (window.PDAWG_SFX && window.PDAWG_SFX[name]) window.PDAWG_SFX[name](); } catch (e) {}
}

var WHIMSY_NAMES = { 0: 'paw print', 1: 'star', 2: 'heart', 3: 'dog bone' };
function whimsyName(s) { return WHIMSY_NAMES[s] || 'whimsy'; }

/* Shared drop resolution: snap, sounds, whimsy celebration, win check. */
function resolveDrop(S, gid) {
  var res = snapAfterDrop(S, gid);
  if (res.placedWhimsy && res.placedWhimsy.length) {
    sfx('whimsy');
    var names = res.placedWhimsy.map(whimsyName).join(' + ');
    setTimeout(function () { toast('✨ Whimsy found: ' + names + '!'); }, 350);
  } else if (res.placed) {
    sfx('snap');
  } else if (res.merged) {
    sfx('click');
  }
  return res;
}

function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }

var UI = {
  galleryThumbs: [],

  showHome: function () {
    $('#home').style.display = '';
    $('#game').style.display = 'none';
    document.body.classList.remove('playing');
    this.renderStats();
    this.renderDaily();
    this.renderShelf();
    this.renderGallery();
    this.renderAIStudio();
    this.renderAIGallery();
  },

  showGame: function () {
    $('#home').style.display = 'none';
    $('#game').style.display = '';
    document.body.classList.add('playing');
  },

  renderDaily: function () {
    var spec = dailySpec();
    var done = dailyDone();
    var wrap = $('#dailyCard');
    var dateStr = dailyStr();
    wrap.innerHTML = '';
    var tag = el('div', 'card-tag', '✨ DAILY PUZZLE · SAME FOR EVERYONE');
    var title = el('div', 'card-title', 'Today\'s AI painting');
    var sub = el('div', 'card-sub', levelForCount(spec.count).name + ' · ' + spec.count + ' pieces' + (done ? ' &nbsp;·&nbsp; done in ' + fmtTime(done.ms) : ''));
    var btn = el('button', 'btn primary', done ? 'Play again' : 'Play today');
    var im = el('div', 'card-thumb');
    im.appendChild(el('div', 'gal-thumb-loading'));
    wrap.appendChild(im);
    var tx = el('div', 'card-text');
    tx.appendChild(tag); tx.appendChild(title); tx.appendChild(sub);
    wrap.appendChild(tx); wrap.appendChild(btn);
    btn.onclick = function () { UI.startDaily(); };
    wrap.onclick = function (e) { if (e.target !== btn) UI.startDaily(); };
    // fill the thumbnail: cached/AI daily image, else gallery fallback
    dailyImageBlob(dateStr).then(function (blob) {
      function setThumb(srcCanvas) {
        im.innerHTML = '';
        var c = canvasCopy(srcCanvas);
        im.appendChild(c);
      }
      if (blob) {
        imageBlobToBitmap(blob).then(function (bmp) {
          var cv = document.createElement('canvas');
          cv.width = 360; cv.height = 240;
          var cc = cv.getContext('2d');
          var sc = Math.max(360 / bmp.width, 240 / bmp.height);
          var dw = bmp.width * sc, dh = bmp.height * sc;
          cc.drawImage(bmp, (360 - dw) / 2, (240 - dh) / 2, dw, dh);
          setThumb(cv);
        }).catch(function () { fallbackThumb(); });
      } else fallbackThumb();
      function fallbackThumb() {
        var th = UI.galleryThumbs[spec.galleryIdx];
        if (th) setThumb(th);
      }
    });
  },

  /* ---------------- AI Studio ---------------- */
  renderAIStudio: function () {
    var wrap = $('#aiThemes');
    if (!wrap || wrap.children.length || !window.PDAWG_AI) return;
    var self = this;
    window.PDAWG_AI.THEMES.forEach(function (t, i) {
      var b = el('button', 'ai-theme', t);
      b.onclick = function () { self.generateAI(window.PDAWG_AI.themePrompt(i), t.replace(/^\S+\s/, '')); };
      wrap.appendChild(b);
    });
  },

  generateAI: function (prompt, label) {
    var st = $('#aiStatus');
    st.style.display = 'flex';
    st.innerHTML = '<span class="spin"></span><span>Painting your puzzle… AI art takes ~20–40 seconds.</span>';
    sfx('click');
    var self = this;
    window.PDAWG_AI.generate(prompt).then(function (res) {
      if (!res || res.error || !res.size) {
        st.innerHTML = '<span>' + (res && res.error === 'hourly'
          ? 'Hourly AI limit reached — try again later, or pick a gallery puzzle.'
          : 'The AI is napping — try again in a bit.') + '</span>';
        return;
      }
      st.innerHTML = '<span class="spin"></span><span>Cutting the pieces…</span>';
      fileToImageRecord(res).then(function (rec) {
        var imageId = uid('ai');
        idb.put('images', { id: imageId, blob: rec.blob }).then(function () {
          st.style.display = 'none';
          try {
            var aiList = JSON.parse(localStorage.getItem('pdawg-ai-list') || '[]');
            aiList.unshift({ imageId: imageId, title: label || 'AI Dream', ts: Date.now() });
            localStorage.setItem('pdawg-ai-list', JSON.stringify(aiList.slice(0, 24)));
          } catch (e) {}
          self.renderAIGallery();
          self.openCountChooser({ imageKind: 'custom', imageId: imageId, title: label || 'AI Dream' });
        });
      }).catch(function () { st.innerHTML = '<span>Could not read the painting — try again.</span>'; });
    });
  },

  /* AI creations shelf in the gallery grid */
  renderAIGallery: function () {
    var grid = $('#galleryGrid');
    if (!grid) return;
    var old = grid.querySelectorAll('.ai-card');
    for (var i = old.length - 1; i >= 0; i--) old[i].remove();
    var list = [];
    try { list = JSON.parse(localStorage.getItem('pdawg-ai-list') || '[]'); } catch (e) {}
    var self = this;
    list.forEach(function (a) {
      var card = el('div', 'gal-card ai-card');
      card.appendChild(el('div', 'ai-badge', '✨ AI'));
      var im = el('div', 'gal-thumb-loading');
      card.appendChild(im);
      card.appendChild(el('div', 'gal-title', a.title));
      card.onclick = function () { self.openCountChooser({ imageKind: 'custom', imageId: a.imageId, title: a.title }); };
      grid.insertBefore(card, grid.firstChild);
      idb.get('images', a.imageId).then(function (rec) {
        if (!rec) return;
        imageBlobToBitmap(rec.blob).then(function (bmp) {
          var cv = document.createElement('canvas');
          cv.width = 360; cv.height = 240;
          var cc = cv.getContext('2d');
          var sc = Math.max(360 / bmp.width, 240 / bmp.height);
          var dw = bmp.width * sc, dh = bmp.height * sc;
          cc.drawImage(bmp, (360 - dw) / 2, (240 - dh) / 2, dw, dh);
          var oldIm = card.querySelector('.gal-thumb-loading');
          if (oldIm) card.replaceChild(cv, oldIm);
        }).catch(function () {});
      });
    });
  },

  renderStats: function () {
    var strip = $('#statsStrip');
    if (!strip) return;
    var st = statsRead();
    strip.innerHTML = '';
    function stat(emoji, val, label) {
      var d = el('div', 'stat', emoji + ' <b>' + val + '</b> ' + label);
      strip.appendChild(d);
    }
    stat('🧩', st.solved, 'solved');
    stat('🧷', st.pieces.toLocaleString(), 'pieces placed');
    stat('✨', st.whimsies, 'whimsies');
    if (st.streak > 1) stat('🔥', st.streak, 'day streak');
  },

  renderShelf: function () {
    var list = shelf.read().filter(function (e) { return !e.done; });
    var sec = $('#shelfSection'), row = $('#shelfRow');
    row.innerHTML = '';
    if (!list.length) { sec.style.display = 'none'; return; }
    sec.style.display = '';
    list.forEach(function (e) {
      var card = el('div', 'shelf-card');
      var im = el('img', 'shelf-thumb'); im.src = e.thumb || ''; im.alt = '';
      var tt = el('div', 'shelf-title', e.title);
      var pc = el('div', 'shelf-pct', (e.pct || 0) + '%');
      var bar = el('div', 'shelf-bar'); bar.appendChild(el('div', 'shelf-fill'));
      bar.firstChild.style.width = (e.pct || 0) + '%';
      var del = el('button', 'shelf-del', '×');
      del.title = 'Delete';
      del.onclick = function (ev) {
        ev.stopPropagation();
        if (confirm('Delete "' + e.title + '"?')) {
          idb.del('puzzles', e.id).then(function () { shelf.remove(e.id); UI.renderShelf(); });
        }
      };
      card.appendChild(im); card.appendChild(tt); card.appendChild(pc); card.appendChild(bar); card.appendChild(del);
      card.onclick = function () { UI.resumePuzzle(e.id); };
      row.appendChild(card);
    });
  },

  renderGallery: function () {
    var grid = $('#galleryGrid');
    if (grid.children.length) return;
    var self = this;
    window.PDAWG_GALLERY.GALLERY.forEach(function (g, i) {
      var card = el('div', 'gal-card');
      var th = self.galleryThumbs[i];
      if (th) card.appendChild(canvasCopy(th));
      else if (window.PDAWG_GALLERY.isPhoto(i)) card.appendChild(el('div', 'gal-thumb-loading'));
      card.appendChild(el('div', 'gal-title', g.title));
      card.onclick = function () { UI.openCountChooser({ imageKind: 'gallery', galleryIdx: i, title: g.title }); };
      grid.appendChild(card);
    });
  },

  buildThumbs: function () {
    var self = this;
    var G = window.PDAWG_GALLERY;
    this.galleryThumbs = G.GALLERY.map(function (g, i) {
      if (!G.isPhoto(i)) {
        var cv = G.paint(i, 360, 240, 1234);
        cv.className = 'thumb-img';
        return cv;
      }
      // Photo item: thumbnail fills in async; the card shows a shimmer until then.
      G.paintAsync(i, 360, 240, 1234).then(function (pcv) {
        pcv.className = 'thumb-img';
        self.galleryThumbs[i] = pcv;
        self.updateGalleryThumb(i);
        self.renderDaily();
      }, function () { /* keep shimmer on load failure */ });
      return null;
    });
  },

  updateGalleryThumb: function (i) {
    var grid = $('#galleryGrid');
    var card = grid && grid.children[i];
    var th = this.galleryThumbs[i];
    if (!card || !th) return;
    var old = card.querySelector('.gal-thumb-loading, canvas.thumb-img');
    var im = canvasCopy(th);
    if (old) card.replaceChild(im, old);
    else card.insertBefore(im, card.firstChild);
  },

  openCountChooser: function (base) {
    this._pending = base;
    var wrap = $('#countBtns');
    wrap.innerHTML = '';
    LEVELS.forEach(function (L) {
      var b = el('button', 'btn count');
      b.innerHTML = '<div class="lvl-name">' + L.name + '</div><div class="lvl-count">' + L.count + ' pieces</div>';
      b.onclick = function () { UI.startWithCount(L.count); };
      wrap.appendChild(b);
    });
    $('#rotToggle').checked = false;
    openModal('#countModal');
  },

  startWithCount: function (n) {
    var base = this._pending;
    closeModal('#countModal');
    var rot = $('#rotToggle').checked;
    var whimsy = $('#whimsyToggle').checked;
    this.createAndStart({
      imageKind: base.imageKind, galleryIdx: base.galleryIdx, imageId: base.imageId,
      title: base.title, count: n, rotationOn: rot, whimsy: whimsy,
      seed: (Math.random() * 1e9) | 0
    });
  },

  startDaily: function () {
    var spec = dailySpec();
    var self = this;
    idb.get('puzzles', spec.id).then(function (saved) {
      if (saved && !saved.won) { self.resumePuzzle(spec.id); return; }
      self.createAndStart({
        imageKind: 'daily', galleryIdx: spec.galleryIdx, imageId: null,
        title: spec.title, count: spec.count, rotationOn: false,
        seed: hashStr('pdawg-daily-' + dailyStr()), id: spec.id
      });
    });
  },

  createAndStart: function (opts) {
    var self = this;
    var aspect, imgW, imgH;
    function build(imgCanvas) {
      aspect = imgCanvas.width / imgCanvas.height;
      imgW = 1200;
      imgH = Math.round(1200 / aspect);
      if (imgH > 1000) { imgH = 1000; imgW = Math.round(1000 * aspect); }
      var grid = gridForCount(opts.count, aspect);
      var S = newPuzzleState({
        id: opts.id || uid('p'), title: opts.title,
        imageKind: opts.imageKind, galleryIdx: opts.galleryIdx, imageId: opts.imageId,
        imgW: imgW, imgH: imgH, rows: grid.rows, cols: grid.cols,
        seed: opts.seed, rotationOn: opts.rotationOn,
        whimsy: opts.whimsy === false ? false : true,
        thumb: makeThumb(imgCanvas)
      });
      self.showGame();
      Game.start(S, imgCanvas);
      Game.saveNow();
      toast('Puzzle started — progress saves automatically');
    }
    if (opts.imageKind === 'custom') {
      idb.get('images', opts.imageId).then(function (rec) {
        imageBlobToBitmap(rec.blob).then(function (bmp) {
          var cv = document.createElement('canvas');
          cv.width = bmp.width; cv.height = bmp.height;
          cv.getContext('2d').drawImage(bmp, 0, 0);
          build(cv);
        });
      });
    } else {
      // Gallery item: procedural paints are instant; photos load async.
      var G2 = getGallery();
      toast('Loading image…');
      G2.paintAsync(opts.galleryIdx, 1200, Math.round(1200 / 1.5), 1234).then(build, function () {
        toast('Could not load image');
      });
    }
  },

  resumePuzzle: function (id) {
    var self = this;
    idb.get('puzzles', id).then(function (saved) {
      if (!saved) { toast('Save not found'); shelf.remove(id); self.renderShelf(); return; }
      var S = deserializeState(saved);
      loadImageCanvas(S).then(function (imgCanvas) {
        self.showGame();
        Game.start(S, imgCanvas);
        toast('Welcome back — ' + placedCount(S) + ' of ' + S.pieces.length + ' placed');
      }).catch(function () { toast('Could not load puzzle image'); });
    });
  },

  showWin: function (isBest, prev, whimsyFound) {
    var S = Game.S;
    if (!S || !S.won) return;
    $('#winTime').textContent = fmtTime(S.elapsed);
    $('#winSub').textContent = S.pieces.length + ' pieces · ' + S.title;
    var badge = $('#winBest');
    if (isBest) {
      badge.style.display = '';
      badge.textContent = prev ? 'New best time!' : 'First completion!';
    } else badge.style.display = 'none';
    var ww = $('#winWhimsy');
    if (S.whimsy && S.whimsy.length) {
      ww.style.display = '';
      var names = S.whimsy.map(function (w) { return whimsyName(w.shape); }).join(', ');
      ww.innerHTML = '✨ Whimsies found: <b>' + whimsyFound + '/' + S.whimsy.length + '</b> <small>(' + escHtml(names) + ')</small>';
    } else ww.style.display = 'none';
    arcadeSubmitWin(S);
    openModal('#winModal');
  },

  openPreview: function () {
    var S = Game.S;
    var box = $('#previewImg');
    box.innerHTML = '';
    var cv = document.createElement('canvas');
    var w = Math.min(900, S.imgW), h = Math.round(w * S.imgH / S.imgW);
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(Game.imgCanvas, 0, 0, w, h);
    cv.className = 'preview-canvas';
    box.appendChild(cv);
    openModal('#previewModal');
  },

  /* pause modal: table theme picker */
  renderThemeRow: function () {
    var row = $('#themeRow');
    if (!row) return;
    row.innerHTML = '';
    Game.TABLE_THEMES.forEach(function (t) {
      var b = el('button', 'theme-opt' + (Game.tableTheme === t.id ? ' on' : ''),
        '<span class="swatch" style="background:' + t.css + '"></span><small>' + t.name + '</small>');
      b.title = t.name;
      b.onclick = function () { sfx('click'); Game.setTheme(t.id); UI.renderThemeRow(); };
      row.appendChild(b);
    });
  },

  /* custom photo upload */
  handleFiles: function (files) {
    if (!files || !files.length) return;
    var file = files[0];
    if (!file.type || file.type.indexOf('image/') !== 0) { toast('That is not an image file'); return; }
    toast('Preparing your photo…');
    var self = this;
    fileToImageRecord(file).then(function (rec) {
      var imageId = uid('u');
      idb.put('images', { id: imageId, blob: rec.blob }).then(function () {
        self.openCountChooser({ imageKind: 'custom', imageId: imageId, title: 'My Photo' });
      });
    }).catch(function () { toast('Could not read that image'); });
  },

  bindGlobal: function () {
    var self = this;
    $('#uploadBtn').onclick = function () { $('#fileInput').click(); };
    $('#fileInput').addEventListener('change', function (e) {
      self.handleFiles(e.target.files);
      e.target.value = '';
    });
    // drag & drop anywhere on home
    var home = $('#home');
    home.addEventListener('dragover', function (e) { e.preventDefault(); home.classList.add('dragging'); });
    home.addEventListener('dragleave', function () { home.classList.remove('dragging'); });
    home.addEventListener('drop', function (e) {
      e.preventDefault(); home.classList.remove('dragging');
      if (e.dataTransfer && e.dataTransfer.files) self.handleFiles(e.dataTransfer.files);
    });
    // paste from clipboard
    document.addEventListener('paste', function (e) {
      if ($('#home').style.display === 'none') return;
      var items = (e.clipboardData && e.clipboardData.files) || [];
      if (items.length) self.handleFiles(items);
    });
    // toolbar
    $('#backBtn').onclick = function () { Game.stop(); UI.showHome(); };
    $('#pauseBtn').onclick = function () {
      Game.paused = true;
      Game.saveNow();
      UI.renderThemeRow();
      openModal('#pauseModal');
    };
    $('#resumeBtn').onclick = function () { closeModal('#pauseModal'); Game.paused = false; Game.markDirty(); };
    $('#restartBtn').onclick = function () {
      if (!confirm('Restart this puzzle from scratch?')) return;
      closeModal('#pauseModal');
      var S = Game.S;
      var fresh = newPuzzleState({
        id: S.id, title: S.title, imageKind: S.imageKind, galleryIdx: S.galleryIdx,
        imageId: S.imageId, imgW: S.imgW, imgH: S.imgH, rows: S.rows, cols: S.cols,
        seed: (Math.random() * 1e9) | 0, rotationOn: S.rotationOn,
        whimsy: S.whimsy && S.whimsy.length > 0, thumb: S.thumb
      });
      Game.start(fresh, Game.imgCanvas);
      Game.saveNow();
    };
    $('#exitBtn').onclick = function () { closeModal('#pauseModal'); Game.stop(); UI.showHome(); };
    $('#previewBtn').onclick = function () { UI.openPreview(); };
    $('#previewClose').onclick = function () { closeModal('#previewModal'); };
    $('#previewModal').addEventListener('click', function (e) {
      if (e.target.id === 'previewModal') closeModal('#previewModal');
    });
    $('#rotBtn').onclick = function () { Game.rotateSelection(); };
    $('#edgeBtn').onclick = function () {
      Game.edgeHi = !Game.edgeHi;
      $('#edgeBtn').classList.toggle('on', Game.edgeHi);
      Game.markDirty();
    };
    $('#fitBtn').onclick = function () { Game.fitBoard(); };
    $('#scatterBtn').onclick = function () {
      var S = Game.S;
      if (!S || S.won) return;
      for (var i = 0; i < S.zorder.length; i++) {
        var members = groupMembers(S, S.zorder[i]);
        if (!members.length || members[0].placed) continue;
        // move the group's bounding box to a random open spot
        var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, k;
        for (k = 0; k < members.length; k++) {
          x0 = Math.min(x0, members[k].x); y0 = Math.min(y0, members[k].y);
          x1 = Math.max(x1, members[k].x + S.cellW); y1 = Math.max(y1, members[k].y + S.cellH);
        }
        var w = x1 - x0, h = y1 - y0;
        var nx = Math.random() * Math.max(1, S.boardW - w);
        var ny = Math.random() * Math.max(1, S.boardH - h);
        // keep clear of the central image area
        if (nx + w > S.imgOX - S.cellW && nx < S.imgOX + S.imgW + S.cellW &&
            ny + h > S.imgOY - S.cellH && ny < S.imgOY + S.imgH + S.cellH) {
          ny = (ny < S.boardH / 2) ? Math.max(0, S.imgOY - h - S.cellH) : Math.min(S.boardH - h, S.imgOY + S.imgH + S.cellH);
        }
        var dx = nx - x0, dy = ny - y0;
        for (k = 0; k < members.length; k++) { members[k].x += dx; members[k].y += dy; }
      }
      sfx('scatter');
      Game.markDirty();
      Game.saveNow();
      toast('Pieces scattered — fresh eyes!');
    };
    $('#countClose').onclick = function () { closeModal('#countModal'); };
    // AI studio
    $('#aiGenBtn').onclick = function () {
      var v = $('#aiPrompt').value.trim();
      if (!v) { toast('Type an idea first — or tap a theme above'); return; }
      UI.generateAI(v, v.slice(0, 28));
    };
    // win modal
    $('#winHome').onclick = function () { closeModal('#winModal'); Game.stop(); UI.showHome(); };
    $('#winReplay').onclick = function () {
      closeModal('#winModal');
      var S = Game.S;
      var fresh = newPuzzleState({
        id: uid('p'), title: S.title, imageKind: S.imageKind === 'daily' ? 'gallery' : S.imageKind,
        galleryIdx: S.galleryIdx, imageId: S.imageId,
        imgW: S.imgW, imgH: S.imgH, rows: S.rows, cols: S.cols,
        seed: (Math.random() * 1e9) | 0, rotationOn: S.rotationOn,
        whimsy: S.whimsy && S.whimsy.length > 0, thumb: S.thumb
      });
      if (fresh.imageKind === 'daily') fresh.imageKind = 'gallery';
      Game.start(fresh, Game.imgCanvas);
      Game.saveNow();
    };
    $('#winNew').onclick = function () { closeModal('#winModal'); Game.stop(); UI.showHome(); };
  }
};

/* ---------------- boot ---------------- */
function boot() {
  Game.init();
  UI.buildThumbs();
  UI.bindGlobal();
  UI.showHome();
  idb.open().then(function () {
    if (idb.mem) toast('Note: private mode - saves may not persist');
    UI.renderShelf();
    UI.renderDaily();
  });
}

if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}

/* test exports */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    mulberry32: mulberry32, hashStr: hashStr, clamp: clamp, fmtTime: fmtTime,
    canvasCopy: canvasCopy,
    NPROF: NPROF, PROFILES: PROFILES,
    buildEdges: buildEdges, pieceEdges: pieceEdges, edgeGeom: edgeGeom,
    strokeGeom: strokeGeom, bezPoint: bezPoint, flattenEdgeOps: flattenEdgeOps,
    gridForCount: gridForCount, newPuzzleState: newPuzzleState,
    trueX: trueX, trueY: trueY, snapDist: snapDist, isEdgePiece: isEdgePiece,
    groupMembers: groupMembers, mergeGroups: mergeGroups, neighborsOf: neighborsOf,
    snapAfterDrop: snapAfterDrop, rotateGroup: rotateGroup,
    placedCount: placedCount, isComplete: isComplete,
    WHIMSY: WHIMSY, traceWhimsyPath: traceWhimsyPath,
    chooseWhimsy: chooseWhimsy, applyWhimsy: applyWhimsy,
    serializeState: serializeState, deserializeState: deserializeState,
    renderPieceCanvases: renderPieceCanvases,
    dailySpec: dailySpec, COUNTS: COUNTS, LEVELS: LEVELS, levelForCount: levelForCount
  };
}
})();
