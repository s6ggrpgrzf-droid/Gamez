/* Skyline Sparrow — render.js
   Canvas 2D. DPR capped at 2. Everything static is pre-rendered once:
   sparrow frames, ghost, tiles, digit atlas, parallax strips, cached text.
   NO per-frame fillText, NO shadowBlur, NO backdrop-filter, NO per-frame
   gradients. Particles are opaque. UMD (browser only in practice). */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SSRender = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

var DPR_CAP = 2;

function Renderer(canvas) {
  this.cv = canvas;
  this.cx = canvas.getContext('2d');
  this.W = 0; this.H = 0; this.dpr = 1;
  this.textCache = {};
  this.sprites = {};
  this.bgLayers = [[], [], []]; // per district: [far, mid, near] canvases
  this.hazeStrips = [];   // per district: ultra-far hazy city strip
  this.decoSpots = [];    // per district: {signs, flicker, clouds, smoke}
  this.skyStrips = [];
  this.digit = null; this.digitW = {};
}

Renderer.prototype.resize = function (w, h) {
  var dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
  this.dpr = dpr; this.W = w; this.H = h;
  this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
  this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
  this.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  this.buildBackgrounds();
};

/* ---------- small canvas helper ---------- */
function mkc(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/* ---------- pre-rendered sprites ---------- */
Renderer.prototype.buildSprites = function () {
  var S = this.sprites;
  // sparrow: 6 flap frames, 52x40 @2x (hitbox unchanged)
  S.bird = [];
  for (var f = 0; f < 6; f++) S.bird.push(birdFrame(f, false));
  S.ghost = [];
  for (var g = 0; g < 6; g++) S.ghost.push(birdFrame(g, true));
  // menu silhouette: dark soaring sparrow (frame 0 recolored)
  S.silhouette = birdSilhouette();
  // feather
  var fc = mkc(44, 44), fx = fc.getContext('2d');
  fx.translate(22, 22); fx.rotate(-0.5);
  fx.fillStyle = '#f5ead2'; fx.strokeStyle = '#c9a86a'; fx.lineWidth = 2;
  fx.beginPath(); fx.ellipse(0, 0, 16, 7, 0, 0, Math.PI * 2); fx.fill(); fx.stroke();
  fx.strokeStyle = '#c9a86a'; fx.beginPath(); fx.moveTo(-16, 0); fx.lineTo(16, 0); fx.stroke();
  S.feather = fc;
  // chimney cap tile
  var cc = mkc(48, 24), cx2 = cc.getContext('2d');
  cx2.fillStyle = '#7a4a3a'; cx2.fillRect(0, 8, 48, 16);
  cx2.fillStyle = '#5d362b'; cx2.fillRect(0, 0, 48, 10);
  cx2.fillStyle = '#8f5a48'; cx2.fillRect(0, 8, 48, 3);
  S.chimCap = cc;
  // wall (neon) tile
  var wc = mkc(48, 48), wx = wc.getContext('2d');
  wx.fillStyle = '#241d4e'; wx.fillRect(0, 0, 48, 48);
  wx.fillStyle = '#3b2f7a'; wx.fillRect(0, 0, 48, 4);
  wx.fillStyle = '#171236'; wx.fillRect(4, 12, 40, 28);
  wx.fillStyle = '#4de3ff'; wx.fillRect(8, 16, 8, 8); wx.fillRect(28, 28, 8, 8);
  S.wallTile = wc;
  // window strip (tiled on building bodies)
  var nc = mkc(64, 64), nx = nc.getContext('2d');
  nx.fillStyle = 'rgba(0,0,0,0)'; nx.clearRect(0, 0, 64, 64);
  S.winDawn = winStrip(nx, '#ffe9a8', 0.9);
  S.winNeon = winStrip(mkc(64, 64).getContext('2d'), '#4de3ff', 0.85);
  S.winStorm = winStrip(mkc(64, 64).getContext('2d'), '#cfe0ea', 0.5);
  // ---- new: rooftop dressing, per district ----
  buildProps(S);
  // ---- new: background dressing ----
  buildSkyDressing(S);
  this.buildDigitAtlas();
};

function birdFrame(f, ghost) {
  // 6 flap frames: 0 up, 1 up-mid, 2 mid, 3 down-mid, 4 down, 5 recover.
  // Logical bounds stay 52x40 (hitbox untouched); canvas 104x80 @2x.
  var c = mkc(104, 80), x = c.getContext('2d');
  x.translate(52, 40);
  // halo: cream silhouette slightly larger than the bird, baked in so the
  // sparrow reads against any background (esp. purple rooftops)
  x.fillStyle = ghost ? 'rgba(207,228,255,0.55)' : 'rgba(255,240,205,0.92)';
  x.beginPath(); x.ellipse(0, 0, 23, 16, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(14, -8, 13, 0, Math.PI * 2); x.fill();

  var P = ghost
    ? { body: '#cfe4ff', belly: '#eef6ff', dark: '#9dbdea', darker: '#7f9fd4', beak: '#cfe4ff', beakD: '#a9c6ee', cheek: '#dceaff' }
    : { body: '#8a5a3a', belly: '#e8c98f', dark: '#5d3a22', darker: '#422712', beak: '#e8912d', beakD: '#c9761f', cheek: '#dfc08a' };

  // fanned tail: 4 slats
  x.fillStyle = P.dark;
  for (var ti = 0; ti < 4; ti++) {
    var ta = -0.28 + ti * 0.19;
    x.save(); x.translate(-15, 3); x.rotate(ta);
    x.beginPath(); x.ellipse(-11, 0, 11, 3.4, 0, 0, Math.PI * 2); x.fill();
    x.restore();
  }
  // body
  x.fillStyle = P.body;
  x.beginPath(); x.ellipse(0, 0, 20, 13, 0, 0, Math.PI * 2); x.fill();
  // belly
  x.fillStyle = P.belly;
  x.beginPath(); x.ellipse(2, 6, 13, 7, 0, 0, Math.PI * 2); x.fill();
  // breast scalloping: 3 short arcs
  x.strokeStyle = ghost ? '#c2d6f2' : '#c99e5f';
  x.lineWidth = 2; x.lineCap = 'round';
  for (var bs = 0; bs < 3; bs++) {
    x.beginPath(); x.arc(-2 + bs * 7, 4, 4.5, 0.5, 2.2); x.stroke();
  }
  // wing: 3 layered feather arcs, pose per frame
  var poses = [
    { a: -1.05, s: 1.0 }, { a: -0.55, s: 0.85 }, { a: -0.10, s: 0.70 },
    { a: 0.40, s: 0.75 }, { a: 0.85, s: 0.90 }, { a: -0.35, s: 0.80 }
  ];
  var pose = poses[f] || poses[2];
  x.save(); x.translate(-2, -4); x.rotate(pose.a);
  var featherLen = [26, 30, 24];
  for (var fi = 0; fi < 3; fi++) {
    var fa = (-0.38 + fi * 0.38) * pose.s;
    var fl = featherLen[fi];
    x.save(); x.rotate(fa);
    x.fillStyle = P.dark;
    x.beginPath(); x.ellipse(fl / 2, 0, fl / 2, 4.6, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = P.darker; // darker tip
    x.beginPath(); x.ellipse(fl * 0.78, 0, fl * 0.22, 3.6, 0, 0, Math.PI * 2); x.fill();
    x.restore();
  }
  // covert patch at the shoulder
  x.fillStyle = P.body;
  x.beginPath(); x.ellipse(4, 0, 8, 5.5, 0.3, 0, Math.PI * 2); x.fill();
  x.restore();
  // head
  x.fillStyle = P.body;
  x.beginPath(); x.arc(14, -8, 10, 0, Math.PI * 2); x.fill();
  // cheek patch
  x.fillStyle = P.cheek;
  x.beginPath(); x.ellipse(15, -3, 6, 4.2, 0.2, 0, Math.PI * 2); x.fill();
  // beak: upper + shaded lower mandible
  x.fillStyle = P.beak;
  x.beginPath(); x.moveTo(21, -11); x.lineTo(31, -7); x.lineTo(21, -5); x.closePath(); x.fill();
  x.fillStyle = P.beakD;
  x.beginPath(); x.moveTo(21, -6); x.lineTo(29, -6); x.lineTo(21, -3); x.closePath(); x.fill();
  // eye + shine
  if (!ghost) {
    x.fillStyle = '#1c1410'; x.beginPath(); x.arc(16, -10, 2.8, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(17, -11, 1, 0, Math.PI * 2); x.fill();
  }
  return c;
}

function winStrip(x, color, alpha) {
  x.globalAlpha = alpha; x.fillStyle = color;
  for (var r = 0; r < 2; r++) for (var cI = 0; cI < 2; cI++) x.fillRect(10 + cI * 28, 12 + r * 28, 14, 16);
  x.globalAlpha = 1;
  return x.canvas;
}

/* deterministic 32-bit hash for seeded decoration (visual only) */
function hash2(a, b) {
  var h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* menu silhouette: dark soaring sparrow */
function birdSilhouette() {
  var c = mkc(140, 90), x = c.getContext('2d');
  x.translate(70, 45);
  x.fillStyle = '#2e2145';
  x.beginPath(); x.ellipse(0, 0, 26, 12, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(18, -8, 11, 0, Math.PI * 2); x.fill();
  x.save(); x.translate(-4, -4); x.rotate(-0.9);
  x.beginPath(); x.ellipse(0, -20, 26, 8, -0.3, 0, Math.PI * 2); x.fill();
  x.restore();
  x.save(); x.translate(-18, 4); x.rotate(0.15);
  x.beginPath(); x.ellipse(-12, 0, 13, 4, 0, 0, Math.PI * 2); x.fill();
  x.restore();
  return c;
}

/* rooftop props, tinted per district: ac, vent, water tower, antenna (2 blink
   variants), skylight. All small, all pre-rendered. */
function buildProps(S) {
  var tints = [
    { base: '#8a7a95', dark: '#6a5c75', lite: '#a894b3' },
    { base: '#2c2658', dark: '#1c1840', lite: '#453d80' },
    { base: '#4a545e', dark: '#353d45', lite: '#66707a' }
  ];
  S.props = [];
  for (var d = 0; d < 3; d++) {
    var T = tints[d], P = {};
    // AC unit: box + fan grill
    var ac = mkc(56, 40), ax = ac.getContext('2d');
    ax.fillStyle = T.dark; ax.fillRect(2, 6, 52, 32);
    ax.fillStyle = T.base; ax.fillRect(0, 0, 56, 30);
    ax.strokeStyle = T.dark; ax.lineWidth = 2;
    ax.beginPath(); ax.arc(20, 15, 10, 0, Math.PI * 2); ax.stroke();
    ax.beginPath(); ax.moveTo(10, 15); ax.lineTo(30, 15); ax.moveTo(20, 5); ax.lineTo(20, 25); ax.stroke();
    ax.fillStyle = T.lite; ax.fillRect(0, 0, 56, 4);
    P.ac = ac;
    // vent: short cylinder + cap
    var ve = mkc(36, 44), vx = ve.getContext('2d');
    vx.fillStyle = T.dark; vx.fillRect(8, 10, 20, 30);
    vx.fillStyle = T.base; vx.fillRect(6, 8, 24, 30);
    vx.fillStyle = T.lite; vx.fillRect(2, 0, 32, 10);
    vx.fillStyle = T.dark; vx.fillRect(2, 8, 32, 3);
    P.vent = ve;
    // water tower: legs + tank + cone roof
    var tw = mkc(64, 84), tx = tw.getContext('2d');
    tx.strokeStyle = T.dark; tx.lineWidth = 4;
    tx.beginPath(); tx.moveTo(14, 84); tx.lineTo(22, 44); tx.moveTo(50, 84); tx.lineTo(42, 44); tx.stroke();
    tx.fillStyle = T.base;
    tx.beginPath(); tx.ellipse(32, 30, 24, 18, 0, 0, Math.PI * 2); tx.fill();
    tx.fillStyle = T.dark;
    tx.beginPath(); tx.moveTo(8, 30); tx.lineTo(32, 4); tx.lineTo(56, 30); tx.closePath(); tx.fill();
    tx.fillStyle = T.lite; tx.fillRect(10, 22, 8, 14);
    P.tower = tw;
    // antenna: pole + crossbars; lit/unlit tip variants
    function antenna(lit) {
      var an = mkc(28, 72), nx2 = an.getContext('2d');
      nx2.strokeStyle = T.dark; nx2.lineWidth = 4;
      nx2.beginPath(); nx2.moveTo(14, 72); nx2.lineTo(14, 8); nx2.stroke();
      nx2.lineWidth = 3;
      nx2.beginPath(); nx2.moveTo(4, 26); nx2.lineTo(24, 26); nx2.moveTo(7, 42); nx2.lineTo(21, 42); nx2.stroke();
      nx2.fillStyle = lit ? '#ff5f5f' : '#5a2020';
      nx2.beginPath(); nx2.arc(14, 6, 5, 0, Math.PI * 2); nx2.fill();
      if (lit) { nx2.fillStyle = 'rgba(255,95,95,0.35)'; nx2.beginPath(); nx2.arc(14, 6, 11, 0, Math.PI * 2); nx2.fill(); }
      return an;
    }
    P.antenna = [antenna(false), antenna(true)];
    // skylight: low dome
    var sk = mkc(60, 26), sx2 = sk.getContext('2d');
    sx2.fillStyle = T.dark; sx2.fillRect(0, 18, 60, 8);
    sx2.fillStyle = T.base;
    sx2.beginPath(); sx2.ellipse(30, 18, 28, 14, 0, Math.PI, 0); sx2.fill();
    sx2.fillStyle = T.lite;
    sx2.beginPath(); sx2.ellipse(22, 12, 10, 5, -0.4, 0, Math.PI * 2); sx2.fill();
    P.skylight = sk;
    S.props.push(P);
  }
  // brick-course facade tiles, per district
  var brickBase = ['#7d6a8f', '#241d4e', '#3a4450'];
  var brickMortar = ['#6a5878', '#1a1540', '#2e363e'];
  S.brick = [];
  for (var bd = 0; bd < 3; bd++) {
    var bc = mkc(64, 64), bx = bc.getContext('2d');
    bx.fillStyle = brickBase[bd]; bx.fillRect(0, 0, 64, 64);
    bx.fillStyle = brickMortar[bd];
    for (var row = 0; row < 4; row++) {
      bx.fillRect(0, row * 16 + 14, 64, 2);
      var off = (row % 2) * 16;
      for (var col = 0; col < 3; col++) bx.fillRect(off + col * 32 - 16, row * 16, 2, 16);
    }
    S.brick.push(bc);
  }
  S.brickPat = [null, null, null]; // CanvasPattern cache, filled lazily in drawPlat
  // fire-escape silhouette strip (120x150)
  var fe = mkc(120, 150), fex = fe.getContext('2d');
  fex.strokeStyle = 'rgba(20,12,30,0.85)'; fex.lineWidth = 4;
  for (var fl = 0; fl < 3; fl++) {
    var fy = 20 + fl * 44;
    fex.strokeRect(14, fy, 92, 30);
    fex.beginPath(); fex.moveTo(14, fy + 30); fex.lineTo(106, fy + 44); fex.stroke();
  }
  fex.beginPath(); fex.moveTo(14, 10); fex.lineTo(14, 150); fex.moveTo(106, 10); fex.lineTo(106, 150); fex.stroke();
  S.fireEscape = fe;
}

/* sky dressing: clouds, flock frames, smoke puff, neon signs, rain, bolt */
function buildSkyDressing(S) {
  // clouds: 3 soft variants (alpha baked into sprite)
  S.clouds = [];
  var cloudCols = ['rgba(255,250,240,0.85)', 'rgba(240,235,250,0.7)', 'rgba(255,244,225,0.6)'];
  for (var ci = 0; ci < 3; ci++) {
    var cc = mkc(220, 90), cx3 = cc.getContext('2d');
    cx3.fillStyle = cloudCols[ci];
    var puffs = [[60, 55, 34], [105, 42, 44], [155, 55, 32], [90, 62, 30], [130, 64, 28]];
    for (var pi = 0; pi < puffs.length; pi++) {
      cx3.beginPath(); cx3.arc(puffs[pi][0], puffs[pi][1], puffs[pi][2], 0, Math.PI * 2); cx3.fill();
    }
    cx3.fillRect(40, 55, 140, 22);
    S.clouds.push(cc);
  }
  // distant flock: 2-frame V chevrons
  S.flock = [];
  for (var ff = 0; ff < 2; ff++) {
    var fc2 = mkc(120, 40), fx2 = fc2.getContext('2d');
    fx2.strokeStyle = '#3a2c52'; fx2.lineWidth = 4; fx2.lineCap = 'round';
    var spread = ff === 0 ? 1 : 0.45;
    for (var b = 0; b < 3; b++) {
      var bx2 = 20 + b * 36, by2 = 20 + (b === 1 ? 6 : 0);
      fx2.beginPath();
      fx2.moveTo(bx2 - 12, by2 - 8 * spread); fx2.lineTo(bx2, by2); fx2.lineTo(bx2 + 12, by2 - 8 * spread);
      fx2.stroke();
    }
    S.flock.push(fc2);
  }
  // smoke puff (soft radial, baked)
  var sm = mkc(48, 48), smx = sm.getContext('2d');
  var sg = smx.createRadialGradient(24, 24, 2, 24, 24, 24);
  sg.addColorStop(0, 'rgba(235,230,240,0.55)'); sg.addColorStop(1, 'rgba(235,230,240,0)');
  smx.fillStyle = sg; smx.fillRect(0, 0, 48, 48);
  S.smoke = sm;
  // neon signs: 4 designs, glow baked in
  S.signs = [];
  var signDefs = [
    { glow: '#4de3ff', draw: function (g) { g.fillStyle = '#4de3ff'; g.fillRect(14, 22, 52, 8); g.beginPath(); g.moveTo(62, 14); g.lineTo(78, 26); g.lineTo(62, 38); g.closePath(); g.fill(); } },
    { glow: '#ff5fa2', draw: function (g) { g.fillStyle = '#ff5fa2'; g.beginPath(); g.arc(40, 26, 12, 0, Math.PI * 2); g.fill(); g.fillRect(36, 8, 8, 36); g.fillRect(22, 22, 36, 8); } },
    { glow: '#ffe9a8', draw: function (g) { g.fillStyle = '#ffe9a8'; for (var wI = 0; wI < 3; wI++) { g.beginPath(); g.arc(20 + wI * 20, 26, 7, Math.PI * 0.15, Math.PI * 0.85); g.lineWidth = 5; g.strokeStyle = '#ffe9a8'; g.stroke(); } } },
    { glow: '#7dff9a', draw: function (g) { g.fillStyle = '#7dff9a'; g.beginPath(); g.moveTo(40, 6); g.lineTo(52, 26); g.lineTo(40, 26); g.lineTo(52, 46); g.lineTo(28, 24); g.lineTo(40, 24); g.closePath(); g.fill(); } }
  ];
  for (var si = 0; si < signDefs.length; si++) {
    var sc2 = mkc(96, 56), sx4 = sc2.getContext('2d');
    var def = signDefs[si];
    var halo = sx4.createRadialGradient(48, 28, 4, 48, 28, 46);
    halo.addColorStop(0, def.glow); halo.addColorStop(1, 'rgba(0,0,0,0)');
    sx4.globalAlpha = 0.35; sx4.fillStyle = halo; sx4.fillRect(0, 0, 96, 56); sx4.globalAlpha = 1;
    sx4.fillStyle = 'rgba(10,8,20,0.9)'; sx4.fillRect(8, 8, 80, 40);
    sx4.strokeStyle = def.glow; sx4.lineWidth = 3; sx4.strokeRect(8, 8, 80, 40);
    def.draw(sx4);
    S.signs.push(sc2);
  }
  // rain streak (thin, baked slant)
  var rn = mkc(6, 42), rnx = rn.getContext('2d');
  rnx.strokeStyle = 'rgba(200,220,235,0.8)'; rnx.lineWidth = 2; rnx.lineCap = 'round';
  rnx.beginPath(); rnx.moveTo(4, 2); rnx.lineTo(2, 40); rnx.stroke();
  S.rain = rn;
  // lightning bolt (baked)
  var lb = mkc(90, 220), lbx = lb.getContext('2d');
  lbx.strokeStyle = '#eef4ff'; lbx.lineWidth = 7; lbx.lineJoin = 'round';
  lbx.beginPath(); lbx.moveTo(48, 0); lbx.lineTo(30, 70); lbx.lineTo(52, 75); lbx.lineTo(28, 150); lbx.lineTo(48, 155); lbx.lineTo(34, 220); lbx.stroke();
  lbx.strokeStyle = 'rgba(238,244,255,0.4)'; lbx.lineWidth = 16;
  lbx.beginPath(); lbx.moveTo(48, 0); lbx.lineTo(30, 70); lbx.lineTo(52, 75); lbx.lineTo(28, 150); lbx.lineTo(48, 155); lbx.lineTo(34, 220); lbx.stroke();
  S.bolt = lb;
  // speed-line streak (long thin, baked alpha gradient)
  var sl = mkc(160, 6), slx = sl.getContext('2d');
  var slg = slx.createLinearGradient(0, 0, 160, 0);
  slg.addColorStop(0, 'rgba(255,255,255,0)'); slg.addColorStop(1, 'rgba(255,255,255,0.55)');
  slx.fillStyle = slg; slx.fillRect(0, 0, 160, 6);
  S.speedline = sl;
}

/* ---------- digit atlas (score drawn without fillText) ---------- */
Renderer.prototype.buildDigitAtlas = function () {
  var chars = '0123456789xm+./';
  var c = mkc(16 * 34, 44), x = c.getContext('2d');
  x.font = 'bold 34px system-ui, sans-serif';
  x.textBaseline = 'top'; x.fillStyle = '#fff8ea';
  this.digitW = {};
  for (var i = 0; i < chars.length; i++) {
    var ch = chars[i];
    x.fillText(ch, i * 34 + 2, 4);
    this.digitW[ch] = Math.max(12, x.measureText(ch).width + 6);
  }
  this.digit = c;
};
Renderer.prototype.drawNum = function (str, sx, y, scale, align, color) {
  // color variants: pre-render tinted copies lazily
  var key = 'dg' + (color || 'w');
  var atlas = this.sprites[key];
  if (!atlas) {
    var src = this.digit;
    atlas = mkc(src.width, src.height);
    var ax = atlas.getContext('2d');
    ax.drawImage(src, 0, 0);
    ax.globalCompositeOperation = 'source-in';
    ax.fillStyle = color || '#fff8ea';
    ax.fillRect(0, 0, atlas.width, atlas.height);
    this.sprites[key] = atlas;
  }
  var total = 0, i, ch;
  for (i = 0; i < str.length; i++) { ch = str[i]; total += (this.digitW[ch] || 20) * scale; }
  var x = align === 'right' ? sx - total : sx;
  for (i = 0; i < str.length; i++) {
    ch = str[i];
    var idx = '0123456789xm+./'.indexOf(ch);
    if (idx < 0) continue;
    this.cx.drawImage(atlas, idx * 34, 0, 34, 44, x, y, 34 * scale, 44 * scale);
    x += (this.digitW[ch] || 20) * scale;
  }
};

/* ---------- cached static text (never per-frame) ---------- */
Renderer.prototype.text = function (str, font, color) {
  var key = str + '|' + font + '|' + color;
  var c = this.textCache[key];
  if (c) return c;
  var m = mkc(8, 8), mx = m.getContext('2d');
  mx.font = font;
  var w = Math.ceil(mx.measureText(str).width) + 8;
  c = mkc(w, 64); var x = c.getContext('2d');
  x.font = font; x.textBaseline = 'middle'; x.fillStyle = color;
  x.fillText(str, 4, 32);
  this.textCache[key] = c;
  return c;
};

/* ---------- menu title card: dawn-gradient type, baked once ---------- */
Renderer.prototype.titleCard = function () {
  var key = 'titlecard';
  var c = this.textCache[key];
  if (c) return c;
  c = mkc(640, 130);
  var x = c.getContext('2d');
  x.font = '900 58px system-ui, sans-serif';
  x.textBaseline = 'middle'; x.textAlign = 'center';
  var gr = x.createLinearGradient(0, 30, 0, 100);
  gr.addColorStop(0, '#f7d98a'); gr.addColorStop(0.55, '#f0b95e'); gr.addColorStop(1, '#d88f3a');
  x.shadowColor = 'rgba(90,50,20,0.45)'; x.shadowBlur = 14; x.shadowOffsetY = 4;
  x.fillStyle = gr;
  x.fillText('SKYLINE SPARROW', 320, 58);
  x.shadowColor = 'transparent'; x.shadowBlur = 0; x.shadowOffsetY = 0;
  // small sparrow glyph accent under the title
  x.fillStyle = '#ffd34d';
  x.beginPath(); x.ellipse(320, 112, 26, 3, 0, 0, Math.PI * 2); x.fill();
  this.textCache[key] = c;
  return c;
};

/* ---------- parallax backgrounds (pre-rendered strips, tiled) ---------- */
Renderer.prototype.buildBackgrounds = function () {
  var W = Math.max(600, this.W), H = this.H;
  var defs = [
    { sky: ['#ffd9a0', '#e8a8c8', '#8f7ab8'], sun: '#fff3c9', far: '#a07fb8', mid: '#6f5a8f', glow: true },
    { sky: ['#0d1030', '#1c1a4e', '#2a1a4e'], sun: '#e8ecff', far: '#3a2a6e', mid: '#1c1440', glow: false },
    { sky: ['#5a6b7a', '#3d4a56', '#232c34'], sun: '#cfe0ea', far: '#3d4a56', mid: '#232c34', glow: false }
  ];
  for (var d = 0; d < 3; d++) {
    var D = defs[d];
    // sky: vertical gradient strip (rendered once, stretched)
    var sky = mkc(4, H), sx = sky.getContext('2d');
    var gr = sx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, D.sky[0]); gr.addColorStop(0.55, D.sky[1]); gr.addColorStop(1, D.sky[2]);
    sx.fillStyle = gr; sx.fillRect(0, 0, 4, H);
    if (D.glow) { // sun glow baked in
      var sg = sx.createRadialGradient(2, H * 0.3, 4, 2, H * 0.3, H * 0.5);
      sg.addColorStop(0, 'rgba(255,243,201,0.9)'); sg.addColorStop(1, 'rgba(255,243,201,0)');
      sx.fillStyle = sg; sx.fillRect(0, 0, 4, H);
    }
    this.skyStrips[d] = sky;
    // skyline layers: seeded silhouettes
    var layers = [];
    var rng = mulberry(d * 7919 + 13);
    for (var L = 0; L < 2; L++) {
      var lw = 1400, lh = H;
      var lc = mkc(lw, lh), lx = lc.getContext('2d');
      var baseY = H * (L === 0 ? 0.78 : 0.88);
      var col = L === 0 ? D.far : D.mid;
      var bx = 0;
      while (bx < lw) {
        var bw = 60 + rng() * 130, bh = (L === 0 ? 120 : 200) + rng() * (L === 0 ? 120 : 220);
        lx.fillStyle = col;
        lx.fillRect(bx, baseY - bh, bw, bh + lh);
        // antenna / water tower nubs
        if (rng() < 0.4) lx.fillRect(bx + bw / 2 - 3, baseY - bh - 34, 6, 34);
        if (rng() < 0.3) { lx.beginPath(); lx.arc(bx + bw / 2, baseY - bh - 8, 14, 0, Math.PI * 2); lx.fill(); }
        // lit windows (neon pops on night)
        if (d === 1 && rng() < 0.8) {
          lx.fillStyle = rng() < 0.5 ? '#4de3ff' : '#ff5fa2';
          lx.globalAlpha = 0.75;
          for (var wy = baseY - bh + 14; wy < baseY - 20; wy += 26)
            for (var wx2 = bx + 10; wx2 < bx + bw - 14; wx2 += 24)
              if (rng() < 0.5) lx.fillRect(wx2, wy, 10, 12);
          lx.globalAlpha = 1;
        }
        bx += bw + rng() * 40;
      }
      layers.push(lc);
    }
    this.bgLayers[d] = layers;
    // 4th far layer: hazy city gradient strip (parallax 0.05)
    var hz = mkc(1400, H), hzx = hz.getContext('2d');
    var hazeCol = d === 1 ? 'rgba(58,42,110,0.5)' : d === 2 ? 'rgba(61,74,86,0.5)' : 'rgba(200,150,170,0.45)';
    hzx.fillStyle = hazeCol;
    var hrng = mulberry(d * 331 + 7), hx = 0;
    while (hx < 1400) {
      var hw2 = 90 + hrng() * 160, hh2 = 90 + hrng() * 160;
      var hy2 = H * 0.72 - hh2;
      hzx.fillRect(hx, hy2, hw2, hh2 + H);
      hx += hw2 + hrng() * 60;
    }
    this.hazeStrips[d] = hz;
    // decoration spots: deterministic per district (visual only)
    var spots = { signs: [], flicker: [], clouds: [], smoke: [] };
    var srng = mulberry(d * 1013 + 77);
    for (var sgi = 0; sgi < 8; sgi++) {
      spots.signs.push({ wx: sgi * 1100 + srng() * 400, y: H * (0.5 + srng() * 0.22), v: Math.floor(srng() * 4) });
    }
    for (var fli = 0; fli < 10; fli++) {
      spots.flicker.push({ wx: fli * 620 + srng() * 260, y: H * (0.55 + srng() * 0.25), on: srng() < 0.7, ph: Math.floor(srng() * 13) });
    }
    for (var cli = 0; cli < 6; cli++) {
      spots.clouds.push({ wx: cli * 1500 + srng() * 600, y: H * (0.06 + srng() * 0.26), v: Math.floor(srng() * 3), drift: 4 + srng() * 8 });
    }
    for (var smi = 0; smi < 8; smi++) {
      spots.smoke.push({ wx: smi * 900 + srng() * 400, y: H * (0.52 + srng() * 0.12), ph: Math.floor(srng() * 240) });
    }
    this.decoSpots[d] = spots;
  }
  function mulberry(s) {
    var a = s;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
};

/* ---------- main draw ---------- */
Renderer.prototype.draw = function (st, feel, cam, alpha, ui) {
  var cx = this.cx, W = this.W, H = this.H;
  var d = st.district;
  var tick = st.tick || 0;
  var enabled = feel.enabled;
  // reduced motion: freeze ambient animation tick (gameplay visuals unaffected)
  var atick = enabled ? tick : 0;
  // sky
  cx.drawImage(this.skyStrips[d], 0, 0, W, H);
  // parallax: haze 0.05, far 0.12, mid 0.3
  this.tileLayer(this.hazeStrips[d], cam.x * 0.05, 0, W, H);
  this.drawClouds(st, cam, W, H, atick, d);
  this.tileLayer(this.bgLayers[d][0], cam.x * 0.12, 0, W, H);
  this.drawSmoke(st, cam, W, H, atick, d, enabled);
  this.drawFlocks(cam, W, H, atick);
  this.tileLayer(this.bgLayers[d][1], cam.x * 0.3, 0, W, H);
  if (d === 1) this.drawSigns(st, cam, W, tick);
  this.drawFlicker(st, cam, W, atick, d);
  this.drawLightning(st, W, H, tick, d, enabled);

  var shx = feel.shakeX, shy = feel.shakeY;
  var ox = -cam.x + shx, oy = -cam.y + shy;

  // platforms (buildings)
  var cs = st.chunks;
  for (var i = 0; i < cs.length; i++) {
    var c = cs[i];
    var x0 = c.x0 + ox;
    if (x0 + c.w < -50 || x0 > W + 50) continue;
    for (var j = 0; j < c.plats.length; j++) this.drawPlat(c.plats[j], x0, c.x0, j, oy, d, H, tick);
    if (c.chims) for (var k = 0; k < c.chims.length; k++) this.drawChim(c.chims[k], x0, oy);
    if (c.walls) for (var m = 0; m < c.walls.length; m++) this.drawWall(c.walls[m], x0, oy);
    if (c.feats) for (var f = 0; f < c.feats.length; f++) {
      var ft = c.feats[f];
      if (ft.taken) continue;
      var bob = Math.sin((tick + f * 37) * 0.08) * 5;
      cx.drawImage(this.sprites.feather, x0 + ft.x - 22, ft.y + oy - 22 + bob);
    }
  }

  // street far below (the fall zone)
  var streetY = (st.killY || 1400) - 120 + oy;
  if (streetY < H + 100) {
    cx.fillStyle = d === 1 ? '#0a0a18' : '#2b2b33';
    cx.fillRect(0, streetY, W, H - streetY + 100);
  }

  // distance markers: every 500m tickers float by (50px per meter)
  this.drawMarkers(st, ox, cam.x, W, H);

  // ghost (Yesterday's You) — single translucent entity
  var gh = st.ghost;
  if (gh && !gh.done) this.drawBird(gh.p, ox, oy, alpha, true, tick);

  // player with squash & stretch + render interpolation (+ wing trail)
  this.drawBird(st.player, ox, oy, alpha, false, tick, feel);

  // speed lines at high velocity (screen space)
  if (enabled && st.speed > 300) this.drawSpeedlines(st, W, H, tick);

  // particles (opaque)
  var ps = feel.parts;
  for (var p = 0; p < ps.length; p++) {
    var pt = ps[p];
    if (!pt.on) continue;
    cx.fillStyle = pt.color;
    var s = pt.size * (pt.life / pt.max);
    cx.fillRect(pt.x + ox, pt.y + oy, s, s);
  }

  // storm rain (screen space, pooled deterministic streaks)
  if (d === 2 && enabled) this.drawRain(W, H, tick);

  // screen flash (one rect)
  if (feel.flash > 0.01) {
    cx.globalAlpha = Math.min(0.5, feel.flash * 0.5);
    cx.fillStyle = feel.flashColor;
    cx.fillRect(0, 0, W, H);
    cx.globalAlpha = 1;
  }
};

/* ambient: clouds */
Renderer.prototype.drawClouds = function (st, cam, W, H, tick, d) {
  var spots = this.decoSpots[d].clouds, S = this.sprites;
  for (var i = 0; i < spots.length; i++) {
    var sp = spots[i];
    var drift = (tick * sp.drift / 60) % 3600;
    var raw = sp.wx - cam.x * 0.08 + drift;
    var rx = ((raw % 3600) + 3600) % 3600 - 400;
    if (rx < -260 || rx > W + 40) continue;
    cx_draw(this.cx, S.clouds[sp.v], rx, sp.y);
  }
};
function cx_draw(cx, img, x, y) { cx.drawImage(img, x, y); }

/* ambient: chimney smoke from far buildings (soft baked puffs) */
Renderer.prototype.drawSmoke = function (st, cam, W, H, tick, d, enabled) {
  if (!enabled) return;
  var spots = this.decoSpots[d].smoke, cx = this.cx, S = this.sprites;
  for (var i = 0; i < spots.length; i++) {
    var sp = spots[i];
    var rx = sp.wx - cam.x * 0.12;
    if (rx < -60 || rx > W + 60) continue;
    var cyc = (tick + sp.ph) % 240, life = cyc / 240;
    var size = 22 + life * 46;
    cx.globalAlpha = 0.5 * (1 - life);
    cx.drawImage(S.smoke, rx - size / 2, sp.y - life * 130 - size / 2, size, size);
  }
  cx.globalAlpha = 1;
};

/* ambient: distant bird flocks, deterministic V chevrons */
Renderer.prototype.drawFlocks = function (cam, W, H, tick) {
  var cx = this.cx, S = this.sprites;
  for (var k = 0; k < 3; k++) {
    var local = (tick + k * 500) % 1500;
    if (local >= 520) continue;
    var prog = local / 520;
    var fx = W + 150 - prog * (W + 420);
    var fy = H * (0.16 + 0.09 * ((k * 37) % 3) / 2) + Math.sin(local * 0.05 + k) * 10;
    var fr = Math.floor(local / 14) % 2;
    cx.globalAlpha = 0.75;
    cx.drawImage(S.flock[fr], fx - 60, fy - 20, 120, 40);
  }
  cx.globalAlpha = 1;
};

/* neon district: glowing signs riding the mid layer */
Renderer.prototype.drawSigns = function (st, cam, W, tick) {
  var spots = this.decoSpots[1].signs, cx = this.cx, S = this.sprites;
  for (var i = 0; i < spots.length; i++) {
    var sp = spots[i];
    var rx = (((sp.wx - cam.x * 0.3) % 8800) + 8800) % 8800 - 200;
    if (rx < -110 || rx > W + 20) continue;
    cx.drawImage(S.signs[sp.v], rx, sp.y);
  }
};

/* flickering lit windows on the mid layer */
Renderer.prototype.drawFlicker = function (st, cam, W, tick, d) {
  var spots = this.decoSpots[d].flicker, cx = this.cx;
  var step = Math.floor(tick / 240);
  for (var i = 0; i < spots.length; i++) {
    var sp = spots[i];
    var rx = sp.wx - cam.x * 0.3;
    if (rx < -20 || rx > W + 20) continue;
    var flick = ((step + sp.ph) % 13) < 2;
    var lit = flick ? !sp.on : sp.on;
    cx.fillStyle = lit ? (d === 1 ? '#4de3ff' : d === 2 ? '#cfe0ea' : '#ffe9a8') : 'rgba(18,14,28,0.9)';
    if (lit) cx.globalAlpha = 0.85;
    cx.fillRect(rx, sp.y, 13, 17);
    cx.globalAlpha = 1;
  }
};

/* storm district: distant lightning, tick-scheduled (pause-safe) */
Renderer.prototype.drawLightning = function (st, W, H, tick, d, enabled) {
  if (d !== 2 || !enabled) return;
  var seed = st.seed || 1;
  var cyc = 540 + Math.floor(hash2(seed, 3) * 300);
  var ph = tick % cyc;
  if (ph >= 9) return;
  var bx = Math.floor(hash2(seed, 9) * W * 0.7) + W * 0.15;
  var cx = this.cx;
  cx.globalAlpha = 0.10 * (1 - ph / 9);
  cx.fillStyle = '#eef4ff';
  cx.fillRect(0, 0, W, H);
  cx.globalAlpha = 0.9 * (1 - ph / 9);
  cx.drawImage(this.sprites.bolt, bx - 45, -10, 90, 220);
  cx.globalAlpha = 1;
};

/* storm district: pooled rain streaks, deterministic */
Renderer.prototype.drawRain = function (W, H, tick) {
  var cx = this.cx, S = this.sprites;
  cx.globalAlpha = 0.35;
  for (var i = 0; i < 40; i++) {
    var rx = hash2(i, 11) * (W + 100) - 50;
    var fall = 9 + hash2(i, 5) * 7;
    var ry = (((hash2(i, 23) * (H + 80)) + tick * fall) % (H + 80)) - 40;
    cx.drawImage(S.rain, rx, ry);
  }
  cx.globalAlpha = 1;
};

/* speed lines at high velocity (screen space) */
Renderer.prototype.drawSpeedlines = function (st, W, H, tick) {
  var cx = this.cx, S = this.sprites;
  var a = Math.min(0.5, (st.speed - 300) / 240);
  for (var i = 0; i < 6; i++) {
    var ry = hash2(i, 31) * H;
    var rx = W - (((tick * (14 + i * 2) + i * 397) % (W + 320))) + 80;
    cx.globalAlpha = a * (0.35 + 0.65 * hash2(i, 41));
    cx.drawImage(S.speedline, rx, ry);
  }
  cx.globalAlpha = 1;
};

/* distance markers every 500m (50px per meter) */
Renderer.prototype.drawMarkers = function (st, ox, camX, W, H) {
  var cx = this.cx;
  var kMin = Math.floor((camX - 100) / 25000), kMax = Math.floor((camX + W + 100) / 25000);
  for (var k = kMin; k <= kMax; k++) {
    if (k <= 0) continue;
    var label = this.text(k * 500 + 'm', 'bold 22px system-ui, sans-serif', 'rgba(255,248,234,0.55)');
    cx.drawImage(label, k * 25000 + ox - label.width / 2, H * 0.30);
  }
};

Renderer.prototype.tileLayer = function (img, offX, offY, W, H) {
  var w = img.width;
  var x = -(offX % w);
  if (x > 0) x -= w;
  for (; x < W; x += w) this.cx.drawImage(img, x, offY, w, H);
};

Renderer.prototype.drawPlat = function (pl, chunkOx, chunkX0, platIdx, oy, district, H, tick) {
  var cx = this.cx, S = this.sprites;
  var x = chunkOx + pl.x, y = pl.y + oy;
  // building body: brick-course facade (pattern cached at build)
  var bodyH = 150;
  var bpat = S.brickPat[district];
  if (!bpat) { bpat = cx.createPattern(S.brick[district], 'repeat'); S.brickPat[district] = bpat; }
  cx.save();
  cx.translate(x, y + 14);
  cx.fillStyle = bpat;
  cx.fillRect(0, 0, pl.w, bodyH);
  cx.restore();
  // windows: pattern strip, only on the upper body
  var win = district === 1 ? S.winNeon : district === 2 ? S.winStorm : S.winDawn;
  var pat = cx.createPattern(win, 'repeat');
  cx.save();
  cx.translate(x, y + 22);
  cx.fillStyle = pat;
  cx.fillRect(0, 0, pl.w, 96);
  cx.restore();
  // fire-escape silhouette on wide buildings (seeded, visual only)
  if (pl.w > 300 && hash2(Math.floor(chunkX0), platIdx * 3 + 1) < 0.45) {
    var fex = 60 + Math.floor(hash2(platIdx, Math.floor(chunkX0)) * Math.max(1, pl.w - 180));
    cx.drawImage(S.fireEscape, x + fex, y + 18, 120, 140);
  }
  // shadow under the body fading down
  cx.fillStyle = 'rgba(10,8,20,0.55)';
  cx.fillRect(x, y + 14 + bodyH, pl.w, 40);
  // rooftop surface
  cx.fillStyle = district === 1 ? '#171236' : district === 2 ? '#2c343d' : '#5d4a73';
  cx.fillRect(x - 3, y, pl.w + 6, 14);
  // lip highlight: bright crisp edge so the runnable surface reads instantly
  cx.fillStyle = district === 1 ? '#4de3ff' : '#ffe9a8';
  cx.globalAlpha = 0.85;
  cx.fillRect(x - 3, y, pl.w + 6, 4);
  cx.globalAlpha = 1;
  // rooftop props: 1-3 per roof, seeded by chunk+platform (visual only)
  var P = S.props[district];
  var nProps = 1 + Math.floor(hash2(Math.floor(chunkX0), platIdx * 7 + 2) * 3);
  for (var pi = 0; pi < nProps; pi++) {
    var ph2 = hash2(Math.floor(chunkX0) + pi * 131, platIdx * 17 + 5);
    var kind = Math.floor(ph2 * 5); // 0 ac, 1 vent, 2 tower, 3 antenna, 4 skylight
    var px = x + 20 + ph2 * Math.max(40, pl.w - 90);
    var spr, sw, shh, dy;
    if (kind === 0) { spr = P.ac; sw = 56; shh = 40; dy = 40; }
    else if (kind === 1) { spr = P.vent; sw = 36; shh = 44; dy = 44; }
    else if (kind === 2) { spr = P.tower; sw = 64; shh = 84; dy = 84; }
    else if (kind === 4) { spr = P.skylight; sw = 60; shh = 26; dy = 26; }
    else {
      var blink = Math.floor(tick / 90) % 2;
      spr = P.antenna[blink]; sw = 28; shh = 72; dy = 72;
    }
    cx.drawImage(spr, px - sw / 2, y - dy + 14, sw, shh);
  }
};

Renderer.prototype.drawChim = function (h, chunkOx, oy) {
  var cx = this.cx;
  var x = chunkOx + h.wx, y = h.y + oy;
  cx.fillStyle = '#6e3f32';
  cx.fillRect(x, y, h.w, h.h);
  cx.drawImage(this.sprites.chimCap, x - 4, y - 8, h.w + 8, 20);
};

Renderer.prototype.drawWall = function (w, chunkOx, oy) {
  var cx = this.cx;
  var x = chunkOx + w.wx, y = w.y + oy;
  var pat = cx.createPattern(this.sprites.wallTile, 'repeat');
  cx.save(); cx.translate(x, y); cx.fillStyle = pat; cx.fillRect(0, 0, w.w, w.h); cx.restore();
  cx.fillStyle = '#4de3ff'; cx.globalAlpha = 0.5;
  cx.fillRect(x - 2, y, w.w + 4, 4);
  cx.globalAlpha = 1;
};

/* wing-trail ring buffer (module scope, reused; screen-space positions) */
var trailBuf = [];
for (var tri = 0; tri < 6; tri++) trailBuf.push({ x: 0, y: 0 });
var trailN = 0;

Renderer.prototype.drawBird = function (p, ox, oy, alpha, ghost, tick, feel) {
  var cx = this.cx;
  var ix = p.px + (p.x - p.px) * alpha + ox;
  var iy = p.py + (p.y - p.py) * alpha + oy;
  var frame = Math.floor(tick / 5) % 6;
  if (p.ground) frame = 2;
  var spr = (ghost ? this.sprites.ghost : this.sprites.bird)[frame];
  var sx = 1, sy = 1;
  if (feel && !ghost) { sx = feel.squash.x; sy = feel.squash.y; }
  var w = 52 * sx, h = 40 * sy;
  // wing trail: last 4 positions at decaying alpha (real bird only, feel on)
  if (!ghost && feel && feel.enabled) {
    trailBuf[trailN % 6].x = ix; trailBuf[trailN % 6].y = iy; trailN++;
    var alphas = [0.10, 0.16, 0.24, 0.32];
    for (var ti2 = 0; ti2 < 4; ti2++) {
      var te = trailBuf[((trailN - 2 - ti2) % 6 + 6) % 6];
      cx.globalAlpha = alphas[ti2];
      cx.drawImage(spr, te.x - 26, te.y - 20, 52, 40);
    }
    cx.globalAlpha = 1;
  }
  if (ghost) cx.globalAlpha = 0.4;
  cx.drawImage(spr, ix - w / 2, iy - h / 2 + (p.h - 40) / 2 + 10, w, h);
  if (ghost) cx.globalAlpha = 1;
  // wall-slide spark (opaque)
  if (p.slide && !ghost) {
    cx.fillStyle = '#ffe9a8';
    cx.fillRect(ix - 24, iy - 8, 5, 5);
    cx.fillRect(ix - 28, iy + 4, 4, 4);
  }
};

return { Renderer: Renderer, DPR_CAP: DPR_CAP };
});
