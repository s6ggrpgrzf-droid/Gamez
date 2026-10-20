/* ============================================================
 * Pdawg Puzzles — pure logic core (no DOM state, no controller).
 * Piece-edge geometry, puzzle-state construction, save format,
 * snap/group physics and the exact drop preview. Loaded BEFORE
 * jigsaw.js, which reads these as globals; node tests reach them
 * through the module seam at the bottom (same pattern as
 * gallery.js). Everything here is deterministic and testable.
 * ============================================================ */
'use strict';

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
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
/* ---------------- piece-edge geometry (pure, testable) ----------------
 * Edge table: v[r][c] = boundary between (r,c-1) and (r,c), c in 0..cols.
 *             h[r][c] = boundary between (r-1,c) and (r,c), r in 0..rows.
 * Sign: +1 = tab points right (v) / down (h). Borders = 0 (flat).
 * Jitter tables vj/hj hold per-boundary random in [-1,1] so neighbors share
 * the exact same curve -> pieces interlock perfectly.
 * Profile tables vp/hp pick one of NPROF knob shapes per interior boundary,
 * drawn from the same seeded stream (fixed order) -> reproducible per seed.
 * Non-uniform knobs (like real die-cut puzzles): vo/ho = knob center offset
 * along the edge, vs/hs = knob size multiplier, vw/hw = wobble seed for the
 * straight runs, vl/hl = lean (slight lopsidedness). These are drawn AFTER
 * the legacy stream so pre-existing saves rebuild identical base tables.
 * Geometry v2 (legacy=false): ONE knob archetype per puzzle (E.arch) -- real
 * die sets cut every piece with the same die; per-boundary variety comes from
 * tab/blank assignment, offset (+-5%), size (0.90..1.08) and lean. Pass
 * legacy=true to rebuild the exact pre-v2 tables (old saves).
 */
var NPROF = 3;
function buildEdges(rows, cols, rng, legacy) {
  var v = [], h = [], vj = [], hj = [], vp = [], hp = [], r, c;
  for (r = 0; r < rows; r++) {
    v[r] = []; vj[r] = []; vp[r] = [];
    for (c = 0; c <= cols; c++) {
      var vb = (c === 0 || c === cols);
      v[r][c] = vb ? 0 : (rng() < 0.5 ? -1 : 1);
      vj[r][c] = vb ? 0 : rng() * 2 - 1;
      vp[r][c] = vb ? 0 : (rng() * (legacy ? 6 : NPROF)) | 0;
    }
  }
  for (r = 0; r <= rows; r++) {
    h[r] = []; hj[r] = []; hp[r] = [];
    for (c = 0; c < cols; c++) {
      var hb = (r === 0 || r === rows);
      h[r][c] = hb ? 0 : (rng() < 0.5 ? -1 : 1);
      hj[r][c] = hb ? 0 : rng() * 2 - 1;
      hp[r][c] = hb ? 0 : (rng() * (legacy ? 6 : NPROF)) | 0;
    }
  }
  // Per-boundary knob offset / scale / wobble / lean. Separate pass keeps the
  // legacy rng stream untouched, so the base tables match across versions.
  var vo = [], ho = [], vs = [], hs = [], vw = [], hw = [], vl = [], hl = [];
  var arch = legacy ? -1 : (rng() * NPROF) | 0;
  for (r = 0; r < rows; r++) {
    vo[r] = []; vs[r] = []; vw[r] = []; vl[r] = [];
    for (c = 0; c <= cols; c++) {
      var vb2 = (c === 0 || c === cols);
      vo[r][c] = vb2 ? 0.5 : (legacy ? 0.32 + rng() * 0.36 : 0.45 + rng() * 0.10);
      vs[r][c] = vb2 ? 1 : (legacy ? 0.8 + rng() * 0.35 : 0.90 + rng() * 0.18);
      vw[r][c] = vb2 ? 0 : rng();
      vl[r][c] = (vb2 || legacy) ? 0 : rng() * 2 - 1;
    }
  }
  for (r = 0; r <= rows; r++) {
    ho[r] = []; hs[r] = []; hw[r] = []; hl[r] = [];
    for (c = 0; c < cols; c++) {
      var hb2 = (r === 0 || r === rows);
      ho[r][c] = hb2 ? 0.5 : (legacy ? 0.32 + rng() * 0.36 : 0.45 + rng() * 0.10);
      hs[r][c] = hb2 ? 1 : (legacy ? 0.8 + rng() * 0.35 : 0.90 + rng() * 0.18);
      hw[r][c] = hb2 ? 0 : rng();
      hl[r][c] = (hb2 || legacy) ? 0 : rng() * 2 - 1;
    }
  }
  return { v: v, h: h, vj: vj, hj: hj, vp: vp, hp: hp, vo: vo, ho: ho, vs: vs, hs: hs, vw: vw, hw: hw, vl: vl, hl: hl, arch: arch };
}

/* Outward-positive edge signs + jitter + knob profile for piece (r,c).
 * Profile fields default to 0 when the table predates them (old saves).
 * Knob offset AND lean are mirrored for reverse-traced edges (bottom/left)
 * so the knob lands on the same geometric spot for both neighbors; wobble
 * needs no mirroring because its sine is antisymmetric about the edge
 * midpoint. Geometry v2: tp/rp/bp/lp all use the puzzle-wide E.arch. */
function pieceEdges(E, r, c) {
  var arch = (E.arch === undefined || E.arch < 0) ? null : E.arch;
  return {
    top: -E.h[r][c], right: E.v[r][c + 1], bottom: E.h[r + 1][c], left: -E.v[r][c],
    tj: E.hj[r][c], rj: E.vj[r][c + 1], bj: E.hj[r + 1][c], lj: E.vj[r][c],
    tp: arch !== null ? arch : (E.hp ? 3 + E.hp[r][c] : 3),
    rp: arch !== null ? arch : (E.vp ? 3 + E.vp[r][c + 1] : 3),
    bp: arch !== null ? arch : (E.hp ? 3 + E.hp[r + 1][c] : 3),
    lp: arch !== null ? arch : (E.vp ? 3 + E.vp[r][c] : 3),
    to: E.ho ? E.ho[r][c] : 0.5, ro: E.vo ? E.vo[r][c + 1] : 0.5,
    bo: E.ho ? 1 - E.ho[r + 1][c] : 0.5, lo: E.vo ? 1 - E.vo[r][c] : 0.5,
    ts: E.hs ? E.hs[r][c] : 1, rs: E.vs ? E.vs[r][c + 1] : 1,
    bs: E.hs ? E.hs[r + 1][c] : 1, ls: E.vs ? E.vs[r][c] : 1,
    tw: E.hw ? E.hw[r][c] : 0, rw: E.vw ? E.vw[r][c + 1] : 0,
    bw: E.hw ? E.hw[r + 1][c] : 0, lw: E.vw ? E.vw[r][c] : 0,
    tl: E.hl ? E.hl[r][c] : 0, rl: E.vl ? E.vl[r][c + 1] : 0,
    bl: E.hl ? -E.hl[r + 1][c] : 0, ll: E.vl ? -E.vl[r][c] : 0
  };
}

/* Die-cut knob archetypes as [fraction-along-edge, protrusion] point lists.
 * Protrusion is normalized: 1.0 = 0.12 of the edge length (edgeGeom scales
 * by its depth ~= 0.11..0.13). One archetype is picked per PUZZLE (real die
 * sets cut every piece with the same die) via E.arch; per-boundary variety
 * comes from tab/blank assignment, center offset (+-5%), size (0.90..1.08)
 * and lean. Each archetype is a single smooth spline (Catmull-Rom sampled)
 * with a pinched neck (57-64% of head width) and a squat dome whose depth
 * is 1/3..1/2 of its width -- broad shallow domes, not tall pegs.
 * First point gets a lineTo, then each 3 points form a bezier. */
var PROFILES = [
  /* A classic squat dome: head=0.3 neck=0.6 depth/head=0.46 */
  [[0.38000,0.00000],[0.38126,0.00697],[0.38298,0.01518],[0.38504,0.02470],[0.38731,0.03565],[0.38970,0.04811],[0.39207,0.06219],[0.39433,0.07796],[0.39634,0.09553],[0.39800,0.11500],[0.39968,0.13667],[0.40168,0.16062],[0.40378,0.18656],[0.40575,0.21419],[0.40738,0.24325],[0.40844,0.27344],[0.40872,0.30449],[0.40798,0.33610],[0.40600,0.36800],[0.40198,0.40062],[0.39574,0.43448],[0.38800,0.46937],[0.37947,0.50512],[0.37086,0.54153],[0.36289,0.57841],[0.35628,0.61557],[0.35174,0.65283],[0.35000,0.69000],[0.35094,0.72859],[0.35380,0.76954],[0.35830,0.81181],[0.36415,0.85438],[0.37108,0.89618],[0.37881,0.93619],[0.38706,0.97335],[0.39555,1.00664],[0.40400,1.03500],[0.41282,1.05914],[0.42251,1.08043],[0.43289,1.09889],[0.44379,1.11451],[0.45503,1.12728],[0.46644,1.13722],[0.47786,1.14432],[0.48910,1.14858],[0.50000,1.15000],[0.51090,1.14858],[0.52214,1.14432],[0.53356,1.13722],[0.54497,1.12728],[0.55621,1.11451],[0.56711,1.09889],[0.57749,1.08043],[0.58718,1.05914],[0.59600,1.03500],[0.60445,1.00664],[0.61294,0.97335],[0.62119,0.93619],[0.62892,0.89618],[0.63585,0.85438],[0.64170,0.81181],[0.64620,0.76954],[0.64906,0.72859],[0.65000,0.69000],[0.64826,0.65283],[0.64372,0.61557],[0.63711,0.57841],[0.62914,0.54153],[0.62053,0.50512],[0.61200,0.46937],[0.60426,0.43448],[0.59802,0.40062],[0.59400,0.36800],[0.59202,0.33610],[0.59128,0.30449],[0.59156,0.27344],[0.59262,0.24325],[0.59425,0.21419],[0.59622,0.18656],[0.59832,0.16062],[0.60032,0.13667],[0.60200,0.11500],[0.60366,0.09553],[0.60567,0.07796],[0.60793,0.06219],[0.61030,0.04811],[0.61269,0.03565],[0.61496,0.02470],[0.61702,0.01518],[0.61874,0.00697],[0.62000,0.00000]],
  /* B small tight knob: head=0.25 neck=0.57 depth/head=0.48 */
  [[0.40000,0.00000],[0.40127,0.00606],[0.40301,0.01320],[0.40508,0.02148],[0.40738,0.03100],[0.40978,0.04184],[0.41217,0.05407],[0.41441,0.06779],[0.41640,0.08307],[0.41800,0.10000],[0.41955,0.11885],[0.42134,0.13967],[0.42318,0.16222],[0.42487,0.18626],[0.42624,0.21152],[0.42710,0.23778],[0.42726,0.26477],[0.42654,0.29226],[0.42475,0.32000],[0.42118,0.34837],[0.41567,0.37781],[0.40884,0.40815],[0.40132,0.43923],[0.39371,0.47089],[0.38666,0.50296],[0.38077,0.53528],[0.37668,0.56768],[0.37500,0.60000],[0.37565,0.63355],[0.37796,0.66916],[0.38169,0.70593],[0.38658,0.74294],[0.39240,0.77929],[0.39890,0.81407],[0.40583,0.84639],[0.41294,0.87534],[0.42000,0.90000],[0.42735,0.92099],[0.43543,0.93951],[0.44407,0.95556],[0.45316,0.96914],[0.46252,0.98025],[0.47204,0.98889],[0.48155,0.99506],[0.49092,0.99877],[0.50000,1.00000],[0.50908,0.99877],[0.51845,0.99506],[0.52796,0.98889],[0.53748,0.98025],[0.54684,0.96914],[0.55593,0.95556],[0.56457,0.93951],[0.57265,0.92099],[0.58000,0.90000],[0.58706,0.87534],[0.59417,0.84639],[0.60110,0.81407],[0.60760,0.77929],[0.61342,0.74294],[0.61831,0.70593],[0.62204,0.66916],[0.62435,0.63355],[0.62500,0.60000],[0.62332,0.56768],[0.61923,0.53528],[0.61334,0.50296],[0.60629,0.47089],[0.59868,0.43923],[0.59116,0.40815],[0.58433,0.37781],[0.57882,0.34837],[0.57525,0.32000],[0.57346,0.29226],[0.57274,0.26477],[0.57290,0.23778],[0.57376,0.21152],[0.57513,0.18626],[0.57682,0.16222],[0.57866,0.13967],[0.58045,0.11885],[0.58200,0.10000],[0.58360,0.08307],[0.58559,0.06779],[0.58783,0.05407],[0.59022,0.04184],[0.59262,0.03100],[0.59492,0.02148],[0.59699,0.01320],[0.59873,0.00606],[0.60000,0.00000]],
  /* C wide flat mushroom: head=0.34 neck=0.64 depth/head=0.38 */
  [[0.36000,0.00000],[0.36126,0.00653],[0.36296,0.01421],[0.36499,0.02313],[0.36725,0.03338],[0.36962,0.04505],[0.37199,0.05822],[0.37425,0.07299],[0.37629,0.08944],[0.37800,0.10767],[0.37977,0.12796],[0.38191,0.15038],[0.38418,0.17466],[0.38634,0.20053],[0.38815,0.22774],[0.38938,0.25601],[0.38979,0.28507],[0.38914,0.31467],[0.38720,0.34453],[0.38311,0.37508],[0.37668,0.40677],[0.36867,0.43944],[0.35984,0.47291],[0.35094,0.50699],[0.34276,0.54152],[0.33603,0.57632],[0.33152,0.61120],[0.33000,0.64600],[0.33134,0.68213],[0.33473,0.72047],[0.33987,0.76005],[0.34647,0.79989],[0.35424,0.83903],[0.36289,0.87649],[0.37213,0.91128],[0.38166,0.94245],[0.39120,0.96900],[0.40120,0.99160],[0.41218,1.01153],[0.42394,1.02881],[0.43629,1.04344],[0.44903,1.05540],[0.46197,1.06470],[0.47491,1.07135],[0.48765,1.07534],[0.50000,1.07667],[0.51235,1.07534],[0.52509,1.07135],[0.53803,1.06470],[0.55097,1.05540],[0.56371,1.04344],[0.57606,1.02881],[0.58782,1.01153],[0.59880,0.99160],[0.60880,0.96900],[0.61834,0.94245],[0.62787,0.91128],[0.63711,0.87649],[0.64576,0.83903],[0.65353,0.79989],[0.66013,0.76005],[0.66527,0.72047],[0.66866,0.68213],[0.67000,0.64600],[0.66848,0.61120],[0.66397,0.57632],[0.65724,0.54152],[0.64906,0.50699],[0.64016,0.47291],[0.63133,0.43944],[0.62332,0.40677],[0.61689,0.37508],[0.61280,0.34453],[0.61086,0.31467],[0.61021,0.28507],[0.61062,0.25601],[0.61185,0.22774],[0.61366,0.20053],[0.61582,0.17466],[0.61809,0.15038],[0.62023,0.12796],[0.62200,0.10767],[0.62371,0.08944],[0.62575,0.07299],[0.62801,0.05822],[0.63038,0.04505],[0.63275,0.03338],[0.63501,0.02313],[0.63704,0.01421],[0.63874,0.00653],[0.64000,0.00000]],
  /* legacy A: lollipop - pinched neck, slight lean (pre-v2 saves) */
  [[0.405,0.00],[0.418,0.10],[0.424,0.28],[0.428,0.50],[0.418,0.68],[0.386,0.85],[0.372,0.97],[0.388,1.06],[0.422,1.10],[0.464,1.10],[0.505,1.04],[0.525,0.94],[0.526,0.80],[0.531,0.62],[0.545,0.42],[0.560,0.24],[0.575,0.10],[0.592,0.02],[0.605,0.00]],
  /* legacy B: flat-top lollipop (pre-v2 saves) */
  [[0.410,0.00],[0.420,0.12],[0.427,0.30],[0.431,0.52],[0.418,0.72],[0.390,0.89],[0.390,1.00],[0.418,1.06],[0.455,1.08],[0.497,1.06],[0.535,1.00],[0.552,0.90],[0.544,0.76],[0.544,0.58],[0.556,0.38],[0.570,0.20],[0.584,0.07],[0.597,0.01],[0.608,0.00]],
  /* legacy C: rounded triangle knob (pre-v2 saves) */
  [[0.415,0.00],[0.424,0.13],[0.432,0.32],[0.439,0.54],[0.432,0.76],[0.433,0.95],[0.460,1.08],[0.494,1.10],[0.527,1.03],[0.548,0.89],[0.551,0.72],[0.551,0.54],[0.558,0.36],[0.570,0.20],[0.584,0.08],[0.596,0.02],[0.606,0.00],[0.612,0.00],[0.616,0.00]],
  /* legacy D: leaning knob (pre-v2 saves) */
  [[0.400,0.00],[0.411,0.11],[0.419,0.30],[0.427,0.53],[0.427,0.76],[0.438,0.94],[0.470,1.06],[0.509,1.09],[0.547,1.02],[0.569,0.88],[0.565,0.70],[0.563,0.51],[0.570,0.32],[0.581,0.15],[0.593,0.05],[0.603,0.01],[0.611,0.00],[0.616,0.00],[0.620,0.00]],
  /* legacy E: tiny nub (pre-v2 saves) */
  [[0.435,0.00],[0.441,0.13],[0.447,0.34],[0.451,0.58],[0.446,0.82],[0.458,0.97],[0.486,1.02],[0.513,0.95],[0.526,0.79],[0.530,0.57],[0.537,0.34],[0.547,0.14],[0.559,0.03],[0.569,0.00],[0.575,0.00],[0.580,0.00],[0.584,0.00],[0.587,0.00],[0.590,0.00]],
  /* legacy F: broad-shoulder knob (pre-v2 saves) */
  [[0.395,0.00],[0.407,0.09],[0.415,0.26],[0.419,0.46],[0.410,0.64],[0.382,0.80],[0.367,0.92],[0.384,1.01],[0.419,1.06],[0.464,1.06],[0.508,1.00],[0.531,0.90],[0.532,0.76],[0.533,0.58],[0.545,0.38],[0.559,0.20],[0.575,0.07],[0.589,0.01],[0.601,0.00]],
];


/* Knob-curve ops for one edge from (x1,y1) to (x2,y2).
 * Positive tab bulges toward the LEFT of the travel direction.
 * off: knob center as a fraction along the edge (v2: 0.45..0.55, real knobs
 *      sit nearly centered).
 * scl: knob size multiplier (v2: 0.90..1.08) — scales protrusion fully and
 *      knob width mildly so the knob never reaches the corners.
 * wob: wobble seed in [0,1) for the straight runs. The wobble is an
 *      antisymmetric sine (zero at both corners), so tracing the same
 *      boundary in reverse with the opposite tab yields the identical
 *      geometric curve -> neighbor pieces interlock exactly.
 * mir: when 1, the knob profile is mirrored (fraction -> 1-fraction).
 *      Reverse-traced shared edges (bottom/left of a piece) pass mir=1 so
 *      an ASYMMETRIC profile still lands on the identical geometric curve
 *      for both neighbors -> interlock stays exact.
 * lean: in [-1,1], shifts the knob along the edge proportionally to
 *      protrusion (dome top leans most) for hand-cut lopsidedness. The
 *      caller mirrors it for reverse-traced edges (like off), and it is
 *      applied to the GEOMETRIC fraction, so neighbors coincide exactly.
 * f0, f1: edge inset fractions (corner rounding) -- the curve runs from
 *      fraction f0 to f1 of the edge instead of corner to corner. Wobble
 *      is evaluated on the parametric fraction and is zero at both
 *      insets, so insets don't break interlock. */
var LEAN_K = 0.055;   /* max along-edge lean shift, as a fraction of edge */
function edgeGeom(x1, y1, x2, y2, tab, jit, prof, off, scl, wob, mir, lean, f0, f1) {
  off = (off === undefined) ? 0.5 : off;
  scl = (scl === undefined) ? 1 : scl;
  wob = (wob === undefined) ? 0 : wob;
  lean = (lean === undefined) ? 0 : lean;
  f0 = (f0 === undefined) ? 0 : f0;
  f1 = (f1 === undefined) ? 1 : f1;
  var dx = x2 - x1, dy = y2 - y1;
  var len = Math.hypot(dx, dy) || 1;
  if (tab === 0) return [{ t: 'l', p: [x1 + dx * f1, y1 + dy * f1] }];
  var nx = -dy / len, ny = dx / len;
  var depth = tab * (0.11 + 0.02 * jit);
  var wscl = 0.94 + 0.06 * scl;
  var wk = 1 + ((wob * 2) | 0);                    /* 1 or 2 waves */
  var ws = (((wob * 4) | 0) % 2 === 0) ? 1 : -1;   /* wobble sign */
  var wamp = 0.012;                               /* subtle die-cut waviness */
  /* Wobble is evaluated on the PARAMETRIC fraction (0..1 across the inset
   * span), so it is exactly zero at both insets: edges meet the corner
   * arcs with no kink, and both neighbors agree there. Antisymmetric
   * about 0.5, so reverse-traced neighbors displace identically. */
  function W(fp) { return wamp * ws * Math.sin(2 * Math.PI * wk * (fp - 0.5)); }
  /* Pg takes the GEOMETRIC fraction along the edge; wobble is evaluated
   * there so both neighbors displace the same physical point equally.
   * Lean shifts the geometric fraction along the edge, scaled by
   * protrusion so the dome top leans most -- same inputs for both
   * neighbors, so the shifted curves still coincide. */
  function Pg(g, o) {
    var w = W((g - f0) / (f1 - f0));
    var gl = g + lean * LEAN_K * o;
    return [
      x1 + dx * gl + nx * len * (o * depth + w),
      y1 + dy * gl + ny * len * (o * depth + w)
    ];
  }
  /* P takes the PARAMETRIC fraction (0..1 across the inset span). */
  function P(fp, o) { return Pg(f0 + fp * (f1 - f0), o); }
  var base = PROFILES[(prof >= 0 && prof < PROFILES.length) ? prof : 0];
  /* Mirror the profile for reverse-traced edges: reverse the point order AND
   * map fraction -> 1-fraction. The mirrored curve is then the exact fp-mirror
   * of the original, so with the caller's mirrored `off` the neighbor's curve
   * coincides point-for-point (reversing order alone would NOT mirror an
   * asymmetric profile). */
  var pts = mir ? base.map(function (p) { return [1 - p[0], p[1]]; }).reverse() : base;
  function F(fp) { return off + (fp - 0.5) * wscl; }   /* geometric fraction */
  function Fp(g) { return (g - f0) / (f1 - f0); }       /* geometric -> parametric */
  var ks = F(pts[0][0]), ke = F(pts[pts.length - 1][0]);
  var pks = Fp(ks), pke = Fp(ke);
  var ops = [], i, j, k, f;
  /* lead-in: subdivided so the wobble renders */
  var NSEG = 5;
  for (i = 1; i <= NSEG; i++) {
    f = pks * i / NSEG;
    ops.push({ t: 'l', p: P(f, 0) });
  }
  for (j = 1; j + 2 < pts.length; j += 3) {
    ops.push({
      t: 'c', p: [
        Pg(F(pts[j][0]), pts[j][1] * scl),
        Pg(F(pts[j + 1][0]), pts[j + 1][1] * scl),
        Pg(F(pts[j + 2][0]), pts[j + 2][1] * scl)
      ]
    });
  }
  for (k = 1; k <= NSEG; k++) {
    f = pke + (1 - pke) * k / NSEG;
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
 * boundary, so they pass mir=1 (mirrored profile) to interlock exactly.
 * Corners are softly rounded (CORNER_F of the edge, ~7% -- a telling
 * die-cut signature): each corner is a quadratic with its control point
 * at the sharp grid corner, tangent-continuous at both ends. Corner arcs
 * are per-piece, so they can't break interlock: shared EDGES still
 * coincide exactly (see the interlock test). */
var CORNER_F = 0.07;
function tracePiecePath(ctx, ox, oy, w, h, e) {
  var f0 = CORNER_F, f1 = 1 - CORNER_F;
  function ix(ax, ay, bx, by, f) { return [ax + (bx - ax) * f, ay + (by - ay) * f]; }
  var TL = [ox, oy], TR = [ox + w, oy], BR = [ox + w, oy + h], BL = [ox, oy + h];
  ctx.beginPath();
  var p = ix(TL[0], TL[1], TR[0], TR[1], f0);
  ctx.moveTo(p[0], p[1]);
  strokeGeom(ctx, edgeGeom(ox, oy, ox + w, oy, -e.top, e.tj, e.tp, e.to, e.ts, e.tw, 0, e.tl, f0, f1));
  var c1 = ix(TL[0], TL[1], TR[0], TR[1], f1), c2 = ix(TR[0], TR[1], BR[0], BR[1], f0);
  ctx.quadraticCurveTo(TR[0], TR[1], c2[0], c2[1]);
  strokeGeom(ctx, edgeGeom(ox + w, oy, ox + w, oy + h, -e.right, e.rj, e.rp, e.ro, e.rs, e.rw, 0, e.rl, f0, f1));
  c1 = ix(TR[0], TR[1], BR[0], BR[1], f1); c2 = ix(BR[0], BR[1], BL[0], BL[1], f0);
  ctx.quadraticCurveTo(BR[0], BR[1], c2[0], c2[1]);
  strokeGeom(ctx, edgeGeom(ox + w, oy + h, ox, oy + h, -e.bottom, e.bj, e.bp, e.bo, e.bs, e.bw, 1, e.bl, f0, f1));
  c1 = ix(BR[0], BR[1], BL[0], BL[1], f1); c2 = ix(BL[0], BL[1], TL[0], TL[1], f0);
  ctx.quadraticCurveTo(BL[0], BL[1], c2[0], c2[1]);
  strokeGeom(ctx, edgeGeom(ox, oy + h, ox, oy, -e.left, e.lj, e.lp, e.lo, e.ls, e.lw, 1, e.ll, f0, f1));
  c1 = ix(BL[0], BL[1], TL[0], TL[1], f1); c2 = ix(TL[0], TL[1], TR[0], TR[1], f0);
  ctx.quadraticCurveTo(TL[0], TL[1], c2[0], c2[1]);
  ctx.closePath();
}

/* ---------------- whimsy pieces (REMOVED 2026-10-05) ----------------
 * Whimsy pieces are gone from new puzzles. traceWhimsyPath + applyWhimsy stay
 * so older saves that contain them still render correctly. */

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

/* (chooseWhimsy removed with the feature; old saves carry their own cells.) */

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
/* All ops gate on open(): a fast tap right after boot must never hit a
 * half-initialized DB (db null AND mem null -> "transaction of null").
 * If IDB never settles (wedged/blocked), fall back to in-memory after 4s. */
/* Build a fresh puzzle state object (no DOM needed except piece canvases). */
function newPuzzleState(opts) {
  // opts: {id,title,imageKind,galleryIdx,imgW,imgH,rows,cols,seed,rotationOn}
  var rng = mulberry32(opts.seed);
  var E = buildEdges(opts.rows, opts.cols, rng, false);
  var whimsyCells = []; // whimsies removed 2026-10-05; old saves keep theirs
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
    rows: opts.rows, cols: opts.cols, seed: opts.seed, rotationOn: !!opts.rotationOn, geom: 2,
    mystery: !!opts.mystery, mysteryTitle: opts.mysteryTitle || null,
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
    var pc = { beginPath: function () { path = new Path2D(); }, moveTo: function (x, y) { path.moveTo(x, y); }, lineTo: function (x, y) { path.lineTo(x, y); }, bezierCurveTo: function (a, b, cc, d, ee, f) { path.bezierCurveTo(a, b, cc, d, ee, f); }, quadraticCurveTo: function (a, b, cc, d) { path.quadraticCurveTo(a, b, cc, d); }, closePath: function () { path.closePath(); } };
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
    imageId: S.imageId, rows: S.rows, cols: S.cols, seed: S.seed, geom: 2,
    rotationOn: S.rotationOn, mystery: !!S.mystery, mysteryTitle: S.mysteryTitle || null,
    imgW: S.imgW, imgH: S.imgH,
    pieces: S.pieces.map(function (p) {      return { id: p.id, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, rot: p.rot, placed: p.placed, gid: p.gid };
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
    mystery: false, mysteryTitle: null,
    thumb: null, won: false, elapsed: 0, title: 'Puzzle'
  };
  for (var k in saved) d[k] = saved[k];
  var rng = mulberry32(d.seed);
  // Rebuild the edge table from the seed. buildEdges is always called first
  // with a fresh PRNG stream (both here and in newPuzzleState), so the table
  // is identical to the one used at creation. Piece positions come from the
  // save itself, so the later scatter stream is not needed.
  var E = buildEdges(d.rows, d.cols, rng, d.geom !== 2);
  var imgW = d.imgW, imgH = d.imgH;
  var boardW = imgW * 2.3, boardH = imgH * 2.3;
  var S = {
    id: d.id, title: d.title, imageKind: d.imageKind, galleryIdx: d.galleryIdx,
    imageId: d.imageId, rows: d.rows, cols: d.cols, seed: d.seed, rotationOn: !!d.rotationOn,
    mystery: !!d.mystery, mysteryTitle: d.mysteryTitle || null,
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
  // Heal: groups saved before the exact-seating fix may carry snap slop;
  // pull every surviving group's internal seams exactly flush on load.
  var lg = Object.keys(S.groups);
  for (var gi = 0; gi < lg.length; gi++) seatGroupExact(S, lg[gi]);
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
/* Seat every member of a group at its exact relative grid position.
 * A group's solved layout is always the true grid layout (rotation is drawn
 * about each piece's own center, never baked into x/y), so any deviation is
 * accumulated snap-tolerance slop -- removing it makes seams invisible. */
function seatGroupExact(S, gid) {
  var members = groupMembers(S, gid);
  if (members.length < 2) return;
  var a = members[0];
  var ax = a.x, ay = a.y, atx = trueX(a, S), aty = trueY(a, S);
  for (var i = 1; i < members.length; i++) {
    var m = members[i];
    m.x = ax + (trueX(m, S) - atx);
    m.y = ay + (trueY(m, S) - aty);
  }
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
          seatGroupExact(S, gid); // snap seats flush: no tolerance slop in the seam
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
  // heal any slop left by merges that predate the seating fix: every
  // surviving group gets its internal seams pulled exactly flush
  var gids = Object.keys(S.groups);
  for (var h = 0; h < gids.length; h++) seatGroupExact(S, gids[h]);
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
/* Exact drop preview: run the real snap logic on a throwaway clone and
 * report which pieces would move, and to where. The live state is never
 * touched, and the preview can never promise a snap that wouldn't happen. */
function probeDrop(S, gid) {
  var pc = new Array(S.pieces.length);
  for (var i = 0; i < S.pieces.length; i++) {
    var p = S.pieces[i];
    pc[i] = { id: p.id, r: p.r, c: p.c, x: p.x, y: p.y, rot: p.rot,
              placed: p.placed, gid: p.gid, whimsy: p.whimsy, inTray: p.inTray };
  }
  var gc = {};
  for (var k in S.groups) gc[k] = S.groups[k].slice();
  var C = {
    pieces: pc, groups: gc, zorder: S.zorder.slice(),
    rows: S.rows, cols: S.cols, cellW: S.cellW, cellH: S.cellH,
    imgOX: S.imgOX, imgOY: S.imgOY, imgW: S.imgW, imgH: S.imgH,
    boardW: S.boardW, boardH: S.boardH, margin: S.margin,
    rotationOn: S.rotationOn
  };
  var res = snapAfterDrop(C, gid);
  if (!res.merged && !res.placed) return null;
  var changes = [];
  for (var j = 0; j < pc.length; j++) {
    // only the dragged group and whatever it would merge with
    if (S.pieces[j].gid !== gid && pc[j].gid !== gid) continue;
    if (Math.abs(pc[j].x - S.pieces[j].x) > 0.5 || Math.abs(pc[j].y - S.pieces[j].y) > 0.5) {
      changes.push({ p: S.pieces[j], x: pc[j].x, y: pc[j].y });
    }
  }
  return { changes: changes, placed: res.placed, merged: res.merged };
}

/* node test seam (the browser uses the globals above) */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    clamp: clamp, mulberry32: mulberry32, hashStr: hashStr,
    NPROF: NPROF, PROFILES: PROFILES, CORNER_F: CORNER_F,
    buildEdges: buildEdges, pieceEdges: pieceEdges, edgeGeom: edgeGeom,
    strokeGeom: strokeGeom, tracePiecePath: tracePiecePath,
    traceWhimsyPath: traceWhimsyPath, applyWhimsy: applyWhimsy,
    bezPoint: bezPoint, flattenEdgeOps: flattenEdgeOps,
    newPuzzleState: newPuzzleState,
    trueX: trueX, trueY: trueY, snapDist: snapDist, isEdgePiece: isEdgePiece,
    renderPieceCanvases: renderPieceCanvases,
    serializeState: serializeState, deserializeState: deserializeState,
    groupMembers: groupMembers, mergeGroups: mergeGroups,
    seatGroupExact: seatGroupExact, neighborsOf: neighborsOf,
    snapAfterDrop: snapAfterDrop, rotateGroup: rotateGroup,
    placedCount: placedCount, isComplete: isComplete,
    probeDrop: probeDrop
  };
}
