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
  // sparrow: 3 flap frames, 52x40 @2x
  S.bird = [];
  for (var f = 0; f < 3; f++) S.bird.push(birdFrame(f, false));
  S.ghost = [];
  for (var g = 0; g < 3; g++) S.ghost.push(birdFrame(g, true));
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
  this.buildDigitAtlas();
};

function birdFrame(f, ghost) {
  var c = mkc(104, 80), x = c.getContext('2d');
  x.translate(52, 40);
  // halo: cream silhouette slightly larger than the bird, baked in so the
  // sparrow reads against any background (esp. purple rooftops)
  x.fillStyle = ghost ? 'rgba(207,228,255,0.55)' : 'rgba(255,240,205,0.92)';
  x.beginPath(); x.ellipse(0, 0, 23, 16, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(14, -8, 13, 0, Math.PI * 2); x.fill();
  var body = ghost ? '#cfe4ff' : '#8a5a3a';
  var belly = ghost ? '#eef6ff' : '#e8c98f';
  // tail
  x.fillStyle = ghost ? '#a9c6ee' : '#6e4429';
  x.beginPath(); x.moveTo(-18, -2); x.lineTo(-34, -10); x.lineTo(-32, 6); x.closePath(); x.fill();
  // body
  x.fillStyle = body;
  x.beginPath(); x.ellipse(0, 0, 20, 13, 0, 0, Math.PI * 2); x.fill();
  // belly
  x.fillStyle = belly;
  x.beginPath(); x.ellipse(2, 5, 13, 7, 0, 0, Math.PI * 2); x.fill();
  // wing: 3 flap positions
  x.fillStyle = ghost ? '#9dbdea' : '#5d3a22';
  x.save(); x.translate(-2, -4);
  if (f === 0) { x.rotate(-0.7); x.beginPath(); x.ellipse(-4, -14, 16, 7, -0.4, 0, Math.PI * 2); x.fill(); }
  else if (f === 1) { x.beginPath(); x.ellipse(-16, -2, 15, 6, 0.15, 0, Math.PI * 2); x.fill(); }
  else { x.rotate(0.6); x.beginPath(); x.ellipse(-2, 12, 15, 6, 0.5, 0, Math.PI * 2); x.fill(); }
  x.restore();
  // head
  x.fillStyle = body;
  x.beginPath(); x.arc(14, -8, 10, 0, Math.PI * 2); x.fill();
  // beak
  x.fillStyle = ghost ? '#cfe4ff' : '#e8912d';
  x.beginPath(); x.moveTo(22, -10); x.lineTo(30, -7); x.lineTo(22, -4); x.closePath(); x.fill();
  // eye
  if (!ghost) { x.fillStyle = '#1c1410'; x.beginPath(); x.arc(16, -10, 2.6, 0, Math.PI * 2); x.fill(); }
  return c;
}

function winStrip(x, color, alpha) {
  x.globalAlpha = alpha; x.fillStyle = color;
  for (var r = 0; r < 2; r++) for (var cI = 0; cI < 2; cI++) x.fillRect(10 + cI * 28, 12 + r * 28, 14, 16);
  x.globalAlpha = 1;
  return x.canvas;
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
  // sky
  cx.drawImage(this.skyStrips[d], 0, 0, W, H);
  // parallax: far 0.12, mid 0.3
  this.tileLayer(this.bgLayers[d][0], cam.x * 0.12, 0, W, H);
  this.tileLayer(this.bgLayers[d][1], cam.x * 0.3, 0, W, H);

  var shx = feel.shakeX, shy = feel.shakeY;
  var ox = -cam.x + shx, oy = -cam.y + shy;

  // platforms (buildings)
  var cs = st.chunks;
  for (var i = 0; i < cs.length; i++) {
    var c = cs[i];
    var x0 = c.x0 + ox;
    if (x0 + c.w < -50 || x0 > W + 50) continue;
    for (var j = 0; j < c.plats.length; j++) this.drawPlat(c.plats[j], x0, oy, d, H);
    if (c.chims) for (var k = 0; k < c.chims.length; k++) this.drawChim(c.chims[k], x0, oy);
    if (c.walls) for (var m = 0; m < c.walls.length; m++) this.drawWall(c.walls[m], x0, oy);
    if (c.feats) for (var f = 0; f < c.feats.length; f++) {
      var ft = c.feats[f];
      if (ft.taken) continue;
      var bob = Math.sin((st.tick + f * 37) * 0.08) * 5;
      cx.drawImage(this.sprites.feather, x0 + ft.x - 22, ft.y + oy - 22 + bob);
    }
  }

  // street far below (the fall zone)
  var streetY = (st.killY || 1400) - 120 + oy;
  if (streetY < H + 100) {
    cx.fillStyle = d === 1 ? '#0a0a18' : '#2b2b33';
    cx.fillRect(0, streetY, W, H - streetY + 100);
  }

  // ghost (Yesterday's You) — single translucent entity
  var gh = st.ghost;
  if (gh && !gh.done) this.drawBird(gh.p, ox, oy, alpha, true, st.tick);

  // player with squash & stretch + render interpolation
  this.drawBird(st.player, ox, oy, alpha, false, st.tick, feel);

  // particles (opaque)
  var ps = feel.parts;
  for (var p = 0; p < ps.length; p++) {
    var pt = ps[p];
    if (!pt.on) continue;
    cx.fillStyle = pt.color;
    var s = pt.size * (pt.life / pt.max);
    cx.fillRect(pt.x + ox, pt.y + oy, s, s);
  }

  // screen flash (one rect)
  if (feel.flash > 0.01) {
    cx.globalAlpha = Math.min(0.5, feel.flash * 0.5);
    cx.fillStyle = feel.flashColor;
    cx.fillRect(0, 0, W, H);
    cx.globalAlpha = 1;
  }
};

Renderer.prototype.tileLayer = function (img, offX, offY, W, H) {
  var w = img.width;
  var x = -(offX % w);
  if (x > 0) x -= w;
  for (; x < W; x += w) this.cx.drawImage(img, x, offY, w, H);
};

Renderer.prototype.drawPlat = function (pl, chunkOx, oy, district, H) {
  var cx = this.cx;
  var x = chunkOx + pl.x, y = pl.y + oy;
  // building body: shallow drop, then darkness to the street below
  var bodyH = 150;
  cx.fillStyle = district === 1 ? '#241d4e' : district === 2 ? '#3a4450' : '#7d6a8f';
  cx.fillRect(x, y + 14, pl.w, bodyH);
  // windows: pattern strip, only on the upper body
  var win = district === 1 ? this.sprites.winNeon : district === 2 ? this.sprites.winStorm : this.sprites.winDawn;
  var pat = cx.createPattern(win, 'repeat');
  cx.save();
  cx.translate(x, y + 22);
  cx.fillStyle = pat;
  cx.fillRect(0, 0, pl.w, 96);
  cx.restore();
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

Renderer.prototype.drawBird = function (p, ox, oy, alpha, ghost, tick, feel) {
  var cx = this.cx;
  var ix = p.px + (p.x - p.px) * alpha + ox;
  var iy = p.py + (p.y - p.py) * alpha + oy;
  var frame = Math.floor(tick / 6) % 3;
  if (p.ground) frame = 1;
  var spr = (ghost ? this.sprites.ghost : this.sprites.bird)[frame];
  var sx = 1, sy = 1;
  if (feel && !ghost) { sx = feel.squash.x; sy = feel.squash.y; }
  var w = 52 * sx, h = 40 * sy;
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
