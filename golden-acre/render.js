/* Golden Acre — render.js — "Golden Hour" art pass
 * Canvas renderer. Sim code never touches this; it only reads state.
 * Everything is procedural (no image assets): hand-painted soil, crops,
 * buildings, animals, weather. DPR capped at 2.
 * Ground (grass + soil) is pre-rendered to offscreen canvases and blitted;
 * only crops / buildings / animals / fx / overlays draw per frame.
 */
(function (root) {
'use strict';

var cv = null, g = null, TW = 0, OX = 0, OY = 0, dpr = 1;
var GAref = null;
/* SimFarm-style diorama: the farm renders as a compact grid of small squares
 * centered in the valley, not stretched to fill the screen. */
var VIEW_SCALE = 0.72;

function init(canvas) {
  cv = canvas; g = cv.getContext('2d');
  GAref = root.GA;
}
function resize(cssW, cssH) {
  dpr = Math.min(2, root.devicePixelRatio || 1);
  cv.width = Math.round(cssW * dpr);
  cv.height = Math.round(cssH * dpr);
  /* letterbox the 18x12 grid, then shrink to diorama scale and center */
  TW = Math.min(cv.width / GAref.W, cv.height / GAref.H) * VIEW_SCALE;
  OX = (cv.width - TW * GAref.W) / 2;
  OY = (cv.height - TW * GAref.H) / 2;
  groundDirty = true; soilDirty = true;
}
function tileSize() { return TW; }
function origin() { return { x: OX, y: OY }; }

/* deterministic per-tile hash 0..1 */
function hash(x, y, s) {
  var h = (x * 374761393 + y * 668265263 + (s || 0) * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function shade(hex, amt) {
  var n = parseInt(hex.slice(1), 16);
  var r = Math.max(0, Math.min(255, (n >> 16) + amt));
  var gg = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  var b = Math.max(0, Math.min(255, (n & 255) + amt));
  return 'rgb(' + r + ',' + gg + ',' + b + ')';
}

/* ================= pre-rendered ground ================= */

var grassCv = null, soilCv = null;
var groundDirty = true, soilDirty = true, groundSeason = -1;
var soilSig = '';

var GRASS = [
  ['#7fae5a', '#74a451', '#8fbf6a'], /* spring */
  ['#a3a556', '#98a04e', '#b3b562'], /* summer, drier */
  ['#c9a05a', '#bd944e', '#d9b06a'], /* fall */
  ['#d8d4c4', '#ccc8b8', '#e4e0d2']  /* winter */
];
var GRASS_DK = ['#5f8a44', '#7d7a3c', '#9a7a40', '#a8a496'];
var FLOWERS = [
  ['#f5f2ea', '#e8c53a', '#d67f88'], /* spring blossoms */
  ['#f5f2ea', '#e07b2a'],           /* summer */
  ['#d63a2f', '#e8a93a'],           /* fall asters */
  []                                 /* winter: none */
];

function mkLayer() {
  var c = document.createElement('canvas');
  c.width = cv.width; c.height = cv.height;
  return c;
}

/* one grass tile, painted once per season */
function paintGrassTile(gg, x, y, s) {
  var px = OX + x * TW, py = OY + y * TW;
  var hh = hash(x, y, 0);
  gg.fillStyle = hh < 0.45 ? GRASS[s][0] : (hh < 0.85 ? GRASS[s][1] : GRASS[s][2]);
  gg.fillRect(px, py, TW + 0.6, TW + 0.6);
  var u = TW;
  /* blade clusters */
  gg.lineCap = 'round';
  var n = 3 + Math.floor(hash(x, y, 1) * 4);
  for (var i = 0; i < n; i++) {
    var bx = px + hash(x, y, 10 + i) * u;
    var by = py + hash(x, y, 20 + i) * u;
    var lean = (hash(x, y, 30 + i) - 0.5) * u * 0.16;
    gg.strokeStyle = hash(x, y, 40 + i) < 0.5 ? GRASS_DK[s] : shade(GRASS[s][0], 14);
    gg.lineWidth = Math.max(1, u * 0.028);
    gg.beginPath();
    gg.moveTo(bx, by);
    gg.quadraticCurveTo(bx + lean * 0.4, by - u * 0.1, bx + lean, by - u * (0.14 + hash(x, y, 50 + i) * 0.12));
    gg.stroke();
  }
  /* clover dots */
  if (hash(x, y, 60) < 0.3) {
    gg.fillStyle = shade(GRASS[s][0], 22);
    for (var c = 0; c < 3; c++) {
      var cx = px + hash(x, y, 61 + c) * u, cy = py + hash(x, y, 64 + c) * u;
      gg.beginPath(); gg.arc(cx, cy, u * 0.035, 0, 7); gg.fill();
    }
  }
  /* seasonal wildflowers */
  var fl = FLOWERS[s];
  if (fl.length && hash(x, y, 70) < 0.22) {
    var fx = px + hash(x, y, 71) * u, fy = py + hash(x, y, 72) * u;
    gg.strokeStyle = GRASS_DK[s]; gg.lineWidth = Math.max(1, u * 0.02);
    gg.beginPath(); gg.moveTo(fx, fy); gg.lineTo(fx, fy - u * 0.12); gg.stroke();
    gg.fillStyle = fl[Math.floor(hash(x, y, 73) * fl.length)];
    for (var p = 0; p < 5; p++) {
      var a = p / 5 * 6.283;
      gg.beginPath(); gg.arc(fx + Math.cos(a) * u * 0.035, fy - u * 0.12 + Math.sin(a) * u * 0.035, u * 0.028, 0, 7); gg.fill();
    }
    gg.fillStyle = '#e8c53a';
    gg.beginPath(); gg.arc(fx, fy - u * 0.12, u * 0.025, 0, 7); gg.fill();
  }
  /* fall: fallen leaves */
  if (s === 2 && hash(x, y, 80) < 0.4) {
    gg.fillStyle = hash(x, y, 81) < 0.5 ? '#b45f2a' : '#d08a3a';
    gg.beginPath();
    gg.ellipse(px + hash(x, y, 82) * u, py + hash(x, y, 83) * u,
               u * 0.07, u * 0.045, hash(x, y, 84) * 3, 0, 7);
    gg.fill();
  }
  /* winter: frost sparkle + straw flecks */
  if (s === 3) {
    if (hash(x, y, 85) < 0.25) {
      gg.fillStyle = 'rgba(255,255,255,0.75)';
      gg.fillRect(px + hash(x, y, 86) * u, py + hash(x, y, 87) * u, dpr * 1.6, dpr * 1.6);
    }
    if (hash(x, y, 88) < 0.3) {
      gg.strokeStyle = '#b8a878'; gg.lineWidth = Math.max(1, u * 0.02);
      var sx = px + hash(x, y, 89) * u, sy = py + hash(x, y, 90) * u;
      gg.beginPath(); gg.moveTo(sx, sy); gg.lineTo(sx + u * 0.1, sy - u * 0.05); gg.stroke();
    }
  }
}

function renderGrassLayer(s) {
  if (!grassCv) grassCv = mkLayer();
  var gg = grassCv.getContext('2d');
  gg.clearRect(0, 0, grassCv.width, grassCv.height);
  for (var y = 0; y < GAref.H; y++)
    for (var x = 0; x < GAref.W; x++)
      paintGrassTile(gg, x, y, s);
  /* dappled light: big soft patches */
  for (var i = 0; i < 7; i++) {
    var dx = OX + hash(i, 3, s) * GAref.W * TW;
    var dy = OY + hash(i, 7, s) * GAref.H * TW;
    var dr = TW * (2 + hash(i, 11, s) * 3);
    var gr = gg.createRadialGradient(dx, dy, 0, dx, dy, dr);
    var lite = hash(i, 13, s) < 0.5;
    gr.addColorStop(0, lite ? 'rgba(255,240,190,0.10)' : 'rgba(30,50,20,0.10)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    gg.fillStyle = gr;
    gg.fillRect(dx - dr, dy - dr, dr * 2, dr * 2);
  }
  groundSeason = s; groundDirty = false;
}

/* one soil tile: rich furrowed earth */
function paintSoilTile(gg, x, y, s) {
  var px = OX + x * TW, py = OY + y * TW;
  var u = TW;
  /* base: warm dark earth, slightly seasonal */
  var base = s === 3 ? '#5e4a38' : '#6b4a2e';
  gg.fillStyle = base;
  gg.beginPath();
  if (gg.roundRect) gg.roundRect(px + 1, py + 1, u - 2, u - 2, u * 0.1);
  else gg.rect(px + 1, py + 1, u - 2, u - 2);
  gg.fill();
  /* per-tile tone variation so the field doesn't read as wallpaper */
  var tone = hash(x, y, 95);
  if (tone < 0.4) { gg.fillStyle = 'rgba(30,18,8,' + (0.10 * (0.4 - tone) / 0.4) + ')'; }
  else if (tone > 0.6) { gg.fillStyle = 'rgba(230,200,150,' + (0.10 * (tone - 0.6) / 0.4) + ')'; }
  else gg.fillStyle = 'rgba(0,0,0,0)';
  if (tone < 0.4 || tone > 0.6) {
    gg.beginPath();
    if (gg.roundRect) gg.roundRect(px + 1, py + 1, u - 2, u - 2, u * 0.1);
    else gg.rect(px + 1, py + 1, u - 2, u - 2);
    gg.fill();
  }
  /* furrow ridges: 3-4 rows (varies per tile), light crown + dark furrow */
  gg.lineCap = 'round';
  var nf = 3 + Math.floor(hash(x, y, 96) * 2);
  for (var r = 0; r < nf; r++) {
    var fy = py + u * (0.5 / nf + r / nf) + (hash(x, y, r + 100) - 0.5) * u * 0.06;
    /* furrow shadow */
    gg.strokeStyle = 'rgba(38,22,10,0.45)';
    gg.lineWidth = Math.max(1.5, u * 0.07);
    gg.beginPath();
    gg.moveTo(px + 2, fy + u * 0.045);
    gg.quadraticCurveTo(px + u / 2, fy + u * 0.045 + (hash(x, y, r + 110) - 0.5) * u * 0.08, px + u - 2, fy + u * 0.045);
    gg.stroke();
    /* ridge crown highlight */
    gg.strokeStyle = 'rgba(214,178,130,0.4)';
    gg.lineWidth = Math.max(1, u * 0.04);
    gg.beginPath();
    gg.moveTo(px + 2, fy - u * 0.02);
    gg.quadraticCurveTo(px + u / 2, fy - u * 0.02 + (hash(x, y, r + 120) - 0.5) * u * 0.08, px + u - 2, fy - u * 0.02);
    gg.stroke();
  }
  /* clods */
  for (var c = 0; c < 4; c++) {
    var cx = px + hash(x, y, 130 + c) * u, cy = py + hash(x, y, 140 + c) * u;
    var cr = u * (0.04 + hash(x, y, 150 + c) * 0.035);
    gg.fillStyle = 'rgba(40,24,12,0.6)';
    gg.beginPath(); gg.arc(cx, cy, cr, 0, 7); gg.fill();
    gg.fillStyle = 'rgba(220,185,140,0.45)';
    gg.beginPath(); gg.arc(cx - cr * 0.25, cy - cr * 0.3, cr * 0.55, 0, 7); gg.fill();
  }
  /* pebbles */
  if (hash(x, y, 160) < 0.5) {
    gg.fillStyle = 'rgba(150,140,125,0.6)';
    gg.beginPath();
    gg.arc(px + hash(x, y, 161) * u, py + hash(x, y, 162) * u, u * 0.035, 0, 7);
    gg.fill();
  }
}

function soilSignature(st) {
  var sig = '';
  for (var y = 0; y < GAref.H; y++)
    for (var x = 0; x < GAref.W; x++) {
      var t = GAref.tileAt(st, x, y);
      sig += (t.plowed || t.crop) ? '1' : (t.b ? '2' : '0');
    }
  return sig;
}

function renderSoilLayer(st, s) {
  if (!soilCv) soilCv = mkLayer();
  var gg = soilCv.getContext('2d');
  gg.clearRect(0, 0, soilCv.width, soilCv.height);
  for (var y = 0; y < GAref.H; y++)
    for (var x = 0; x < GAref.W; x++) {
      var t = GAref.tileAt(st, x, y);
      if ((t.plowed || t.crop) && !t.b) paintSoilTile(gg, x, y, s);
    }
  soilDirty = false;
}

/* ================= crops =================
 * Each crop drawn rising from the tile with height, layered leaves,
 * sunlit tops and shaded undersides. Stage 0 = sprout, 3 = ready.
 */

function cropShadow(u, w) {
  g.fillStyle = 'rgba(20,12,6,0.20)';
  g.beginPath();
  g.ellipse(u * 0.06, u * 0.3, u * (w || 0.3), u * 0.09, 0, 0, 7);
  g.fill();
}

/* one arching leaf blade */
function blade(x0, y0, cxp, cyp, x1, y1, w, col, hi) {
  g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cxp, cyp, x1, y1); g.stroke();
  if (hi) {
    g.strokeStyle = hi; g.lineWidth = Math.max(1, w * 0.4);
    g.beginPath(); g.moveTo(x0, y0 - w * 0.2);
    g.quadraticCurveTo(cxp, cyp - w * 0.2, (x0 + x1) / 2 + (cxp - x0) * 0.4, (y0 + y1) / 2 - w * 0.3);
    g.stroke();
  }
}

function drawCorn(stage, cx, cy, u, sway, wob) {
  cropShadow(u, 0.34);
  if (stage === 0) {
    blade(0, u * 0.28, -u * 0.08, u * 0.14, -u * 0.14, u * 0.06, u * 0.045, '#4d7d3a', '#7fae4c');
    blade(0, u * 0.28, u * 0.08, u * 0.14, u * 0.14, u * 0.06, u * 0.045, '#4d7d3a', '#7fae4c');
    return;
  }
  var hgt = u * (0.5 + stage * 0.18);
  var offs = [-0.26, -0.13, 0, 0.13, 0.26];
  for (var s = 0; s < offs.length; s++) {
    var bx = offs[s] * u + sway * (0.5 + s * 0.12);
    var top = u * 0.3 - hgt * (0.9 + hash(s, 3, 7) * 0.2);
    var bh = hash(s, 5, 7);
    /* stalk: tapered quad */
    g.fillStyle = '#4d7d3a';
    g.beginPath();
    g.moveTo(bx - u * 0.028, u * 0.3); g.lineTo(bx - u * 0.012, top);
    g.lineTo(bx + u * 0.012, top); g.lineTo(bx + u * 0.028, u * 0.3);
    g.closePath(); g.fill();
    g.strokeStyle = '#6a9a4e'; g.lineWidth = Math.max(1, u * 0.014);
    g.beginPath(); g.moveTo(bx - u * 0.014, u * 0.28); g.lineTo(bx - u * 0.006, top + u * 0.04); g.stroke();
    /* arching leaves */
    var nl = 2 + (s % 2);
    for (var l = 0; l < nl; l++) {
      var ly = u * 0.3 - hgt * (0.25 + l * 0.24);
      var dir = (l % 2 === 0 ? -1 : 1) * (bh < 0.5 ? 1 : 0.8);
      var ll = u * (0.2 + bh * 0.1);
      blade(bx, ly, bx + dir * ll * 0.6, ly - u * 0.02, bx + dir * ll, ly + u * 0.1,
            Math.max(1.5, u * 0.05), l % 2 ? '#5d9440' : '#4d7d3a', '#7fae4c');
    }
    /* tassel */
    if (stage >= 2) {
      g.strokeStyle = '#d9c06a'; g.lineWidth = Math.max(1, u * 0.02); g.lineCap = 'round';
      for (var t2 = 0; t2 < 5; t2++) {
        var ta = -0.9 + t2 * 0.45 + bh;
        g.beginPath(); g.moveTo(bx, top);
        g.lineTo(bx + Math.sin(ta) * u * 0.09, top - Math.cos(ta) * u * 0.09); g.stroke();
      }
    }
    /* golden ear */
    if (stage >= 3 && s % 2 === 0) {
      var ey = u * 0.3 - hgt * 0.45;
      var ex = bx + (s % 4 === 0 ? -u * 0.07 : u * 0.07);
      blade(ex, ey + u * 0.1, ex - u * 0.05, ey, ex - u * 0.02, ey - u * 0.12, Math.max(1.5, u * 0.04), '#6a9a4e');
      g.fillStyle = '#e8c53a';
      g.beginPath(); g.ellipse(ex, ey, u * 0.055, u * 0.11, 0.15, 0, 7); g.fill();
      g.fillStyle = '#c9962e';
      g.beginPath(); g.ellipse(ex + u * 0.02, ey + u * 0.03, u * 0.03, u * 0.07, 0.15, 0, 7); g.fill();
      g.fillStyle = '#f5d96a';
      g.beginPath(); g.ellipse(ex - u * 0.018, ey - u * 0.03, u * 0.02, u * 0.05, 0.15, 0, 7); g.fill();
    }
  }
}

function drawWheat(stage, cx, cy, u, sway, wob) {
  cropShadow(u, 0.36);
  if (stage === 0) {
    blade(0, u * 0.28, -u * 0.06, u * 0.16, -u * 0.1, u * 0.08, u * 0.035, '#5d9440', '#8fbf6a');
    blade(0, u * 0.28, u * 0.06, u * 0.16, u * 0.1, u * 0.08, u * 0.035, '#5d9440', '#8fbf6a');
    blade(0, u * 0.28, 0, u * 0.12, u * 0.02, u * 0.02, u * 0.035, '#4d7d3a');
    return;
  }
  var ripe = stage >= 3;
  var stalkC = ripe ? '#a88444' : '#5d8a3c';
  var headC = ripe ? '#d9a441' : '#7fae4c';
  var headHi = ripe ? '#f0c85e' : '#9cc86a';
  var hgt = u * (0.45 + stage * 0.16);
  for (var s = 0; s < 9; s++) {
    var gx = (s % 3 - 1) * u * 0.22 + (hash(s, 9, 3) - 0.5) * u * 0.1;
    var gz = Math.floor(s / 3);
    var bx = gx + sway * (0.4 + gz * 0.2);
    var top = u * 0.3 - hgt * (0.85 + hash(s, 11, 3) * 0.25);
    g.strokeStyle = stalkC; g.lineWidth = Math.max(1, u * 0.022); g.lineCap = 'round';
    g.beginPath(); g.moveTo(bx, u * 0.3);
    g.quadraticCurveTo(bx + sway * 0.4, u * 0.3 - hgt * 0.5, bx + sway * 0.6, top);
    g.stroke();
    /* head: stacked kernels */
    var hx = bx + sway * 0.6, hy = top;
    for (var k = 0; k < 3; k++) {
      g.fillStyle = k === 0 ? headHi : headC;
      g.beginPath();
      g.ellipse(hx, hy - k * u * 0.055, u * (0.05 - k * 0.008), u * 0.045, 0, 0, 7);
      g.fill();
    }
    /* awns on ripe heads */
    if (ripe) {
      g.strokeStyle = 'rgba(232,208,144,0.85)'; g.lineWidth = Math.max(0.8, u * 0.012);
      for (var a = 0; a < 3; a++) {
        var aa = -0.5 + a * 0.5;
        g.beginPath(); g.moveTo(hx, hy - u * 0.12);
        g.lineTo(hx + Math.sin(aa) * u * 0.14, hy - u * 0.12 - Math.cos(aa) * u * 0.16);
        g.stroke();
      }
    }
  }
}

function drawCotton(stage, cx, cy, u, sway, wob) {
  cropShadow(u, 0.32);
  var bushes = [[-0.18, 0.1], [0.18, 0.12], [0, -0.08]];
  for (var b = 0; b < bushes.length; b++) {
    var bx = bushes[b][0] * u + sway, by = u * 0.22 + bushes[b][1] * u;
    var sz = u * (0.16 + stage * 0.075);
    if (stage === 0) {
      g.fillStyle = '#5d9440';
      g.beginPath(); g.ellipse(bx, by, u * 0.07, u * 0.05, 0, 0, 7); g.fill();
      continue;
    }
    /* lobed leafy bush: dark base, mid, sunlit top */
    var cols = ['#3f6b32', '#4d7d3a', '#5d9440'];
    for (var l = 0; l < 7; l++) {
      var a = l / 7 * 6.283 + b * 2 + wob;
      var rr = sz * (0.55 + hash(b, l, 21) * 0.4);
      g.fillStyle = cols[l % 3];
      g.beginPath();
      g.ellipse(bx + Math.cos(a) * rr * 0.7, by - Math.abs(Math.sin(a)) * rr * 0.5 - sz * 0.25,
                sz * 0.5, sz * 0.38, a, 0, 7);
      g.fill();
    }
    /* buds then bolls */
    if (stage === 2) {
      g.fillStyle = '#d8a0a0';
      for (var d = 0; d < 3; d++) {
        var da = d / 3 * 6.283 + b;
        g.beginPath(); g.arc(bx + Math.cos(da) * sz * 0.5, by - sz * 0.5 + Math.sin(da) * sz * 0.25, u * 0.035, 0, 7); g.fill();
      }
    } else if (stage >= 3) {
      for (var f = 0; f < 4; f++) {
        var fa = f / 4 * 6.283 + b * 1.3;
        var fx = bx + Math.cos(fa) * sz * 0.55, fy = by - sz * 0.55 + Math.sin(fa) * sz * 0.3;
        /* bract star */
        g.fillStyle = '#6b4a2a';
        for (var t = 0; t < 3; t++) {
          var ta = fa + t * 2.1;
          g.beginPath();
          g.moveTo(fx, fy + u * 0.05);
          g.lineTo(fx + Math.cos(ta) * u * 0.07, fy + Math.sin(ta) * u * 0.05);
          g.lineTo(fx, fy - u * 0.01);
          g.closePath(); g.fill();
        }
        /* fluffy boll */
        g.fillStyle = '#c9c4b8';
        g.beginPath(); g.arc(fx + u * 0.015, fy + u * 0.02, u * 0.075, 0, 7); g.fill();
        g.fillStyle = '#f7f4ec';
        g.beginPath(); g.arc(fx, fy, u * 0.075, 0, 7); g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(fx - u * 0.025, fy - u * 0.025, u * 0.028, 0, 7); g.fill();
      }
    }
  }
}

function drawSoy(stage, cx, cy, u, sway, wob) {
  cropShadow(u, 0.32);
  var bushes = [[-0.16, 0.08], [0.16, 0.1], [-0.02, -0.1], [0.02, 0.2]];
  for (var b = 0; b < bushes.length; b++) {
    var bx = bushes[b][0] * u + sway * 0.8, by = u * 0.22 + bushes[b][1] * u;
    var sz = u * (0.13 + stage * 0.06);
    if (stage === 0) {
      blade(bx, by + u * 0.06, bx - u * 0.05, by, bx - u * 0.08, by - u * 0.04, u * 0.03, '#5d9440', '#8fbf6a');
      blade(bx, by + u * 0.06, bx + u * 0.05, by, bx + u * 0.08, by - u * 0.04, u * 0.03, '#5d9440', '#8fbf6a');
      continue;
    }
    var cols = ['#4d7d3a', '#5d8a3c', '#6f9a3f', '#86b04e'];
    for (var l = 0; l < 6; l++) {
      var a = l / 6 * 6.283 + b * 1.7 + wob * 0.5;
      g.fillStyle = cols[l % 4];
      g.beginPath();
      g.ellipse(bx + Math.cos(a) * sz * 0.55, by - sz * 0.35 - Math.abs(Math.sin(a)) * sz * 0.3,
                sz * 0.52, sz * 0.42, a * 0.5, 0, 7);
      g.fill();
    }
    /* sunlit crown */
    g.fillStyle = '#9cc86a';
    g.beginPath(); g.ellipse(bx - sz * 0.15, by - sz * 0.62, sz * 0.4, sz * 0.28, -0.3, 0, 7); g.fill();
    /* pods when ready */
    if (stage >= 3) {
      g.fillStyle = '#c9a86a';
      for (var p = 0; p < 5; p++) {
        var pa = p / 5 * 6.283 + b;
        var px = bx + Math.cos(pa) * sz * 0.6, py = by - sz * 0.3 + Math.sin(pa) * sz * 0.35;
        g.beginPath(); g.ellipse(px, py, u * 0.032, u * 0.055, pa, 0, 7); g.fill();
        g.strokeStyle = '#a88444'; g.lineWidth = Math.max(0.8, u * 0.01);
        g.beginPath(); g.moveTo(px - u * 0.02, py - u * 0.04); g.lineTo(px + u * 0.02, py + u * 0.04); g.stroke();
      }
    }
  }
}

function drawPotato(stage, cx, cy, u, sway, wob) {
  cropShadow(u, 0.34);
  var mounds = [-0.2, 0, 0.2];
  for (var m = 0; m < mounds.length; m++) {
    var mx = mounds[m] * u + sway * 0.5, my = u * 0.24;
    /* soil mound */
    g.fillStyle = '#5a4030';
    g.beginPath(); g.ellipse(mx, my + u * 0.04, u * 0.2, u * 0.09, 0, 0, 7); g.fill();
    g.fillStyle = '#7d5f42';
    g.beginPath(); g.ellipse(mx - u * 0.04, my, u * 0.13, u * 0.05, -0.2, 0, 7); g.fill();
    if (stage === 0) continue;
    /* crinkled leaves */
    var nl = 4 + stage * 2;
    for (var l = 0; l < nl; l++) {
      var a = l / nl * 6.283 + m * 2.2 + wob * 0.4;
      var rr = u * (0.1 + stage * 0.045);
      var lx = mx + Math.cos(a) * rr, ly = my - u * 0.06 - Math.abs(Math.sin(a)) * rr * 0.7;
      g.fillStyle = l % 2 ? '#4d7d3a' : '#5d8a3c';
      g.beginPath(); g.ellipse(lx, ly, u * 0.075, u * 0.05, a, 0, 7); g.fill();
      g.strokeStyle = '#7fae4c'; g.lineWidth = Math.max(0.8, u * 0.012);
      g.beginPath(); g.moveTo(lx - u * 0.05, ly); g.lineTo(lx + u * 0.05, ly); g.stroke();
    }
    /* flowers when ready */
    if (stage >= 3) {
      for (var f = 0; f < 2; f++) {
        var fx = mx + (f - 0.5) * u * 0.16, fy = my - u * (0.2 + stage * 0.03);
        g.fillStyle = '#f2ede2';
        for (var p = 0; p < 5; p++) {
          var pa = p / 5 * 6.283 + m;
          g.beginPath(); g.arc(fx + Math.cos(pa) * u * 0.04, fy + Math.sin(pa) * u * 0.04, u * 0.032, 0, 7); g.fill();
        }
        g.fillStyle = '#e8c53a';
        g.beginPath(); g.arc(fx, fy, u * 0.025, 0, 7); g.fill();
      }
    }
  }
}

function drawOrange(stage, cx, cy, u, sway, wob) {
  cropShadow(u, 0.3);
  var sc = 0.45 + stage * 0.2;
  var th = u * 0.34 * sc;
  var bx = sway * 0.6;
  /* trunk: tapered, gnarled */
  g.fillStyle = '#6b4a2a';
  g.beginPath();
  g.moveTo(bx - u * 0.05 * sc, u * 0.32); g.lineTo(bx - u * 0.025 * sc, u * 0.32 - th);
  g.lineTo(bx + u * 0.025 * sc, u * 0.32 - th); g.lineTo(bx + u * 0.05 * sc, u * 0.32);
  g.closePath(); g.fill();
  g.strokeStyle = '#4a3018'; g.lineWidth = Math.max(1, u * 0.02);
  g.beginPath(); g.moveTo(bx - u * 0.02 * sc, u * 0.3); g.lineTo(bx - u * 0.012 * sc, u * 0.32 - th * 0.9); g.stroke();
  /* branches */
  g.strokeStyle = '#6b4a2a'; g.lineWidth = Math.max(1.2, u * 0.028 * sc); g.lineCap = 'round';
  g.beginPath(); g.moveTo(bx, u * 0.32 - th * 0.7); g.lineTo(bx - u * 0.16 * sc, u * 0.32 - th * 1.15); g.stroke();
  g.beginPath(); g.moveTo(bx, u * 0.32 - th * 0.8); g.lineTo(bx + u * 0.15 * sc, u * 0.32 - th * 1.2); g.stroke();
  var cr = u * 0.34 * sc;
  var tcy = u * 0.32 - th - cr * 0.55;
  /* canopy: dark back, mid, sunlit crown */
  var blobs = [
    ['#3f6b32', 0, 0.05, 1.0], ['#4d7d3a', -0.25, -0.12, 0.82],
    ['#4d7d3a', 0.28, -0.08, 0.78], ['#5d9440', -0.05, -0.3, 0.72], ['#6a9a4e', -0.18, -0.42, 0.4]
  ];
  for (var i = 0; i < blobs.length; i++) {
    g.fillStyle = blobs[i][0];
    g.beginPath();
    g.ellipse(bx + blobs[i][1] * cr + sway * 0.4, tcy + blobs[i][2] * cr,
              cr * blobs[i][3], cr * blobs[i][3] * 0.85, blobs[i][1], 0, 7);
    g.fill();
  }
  /* leaf texture dots */
  g.fillStyle = '#7fae4c';
  for (var d = 0; d < 10; d++) {
    var da = hash(d, 7, 31) * 6.283, dr = hash(d, 8, 31) * cr * 0.7;
    g.beginPath();
    g.arc(bx + Math.cos(da) * dr - cr * 0.1, tcy - cr * 0.25 + Math.sin(da) * dr * 0.7,
          u * 0.028 * sc + 0.6, 0, 7);
    g.fill();
  }
  /* fruit */
  if (stage >= 3) {
    for (var f = 0; f < 7; f++) {
      var fa = f / 7 * 6.283 + wob;
      var fx = bx + Math.cos(fa) * cr * 0.62, fy = tcy + Math.sin(fa) * cr * 0.5;
      g.fillStyle = '#c96a1e';
      g.beginPath(); g.arc(fx + 1, fy + 1.5, u * 0.052 * sc + 0.5, 0, 7); g.fill();
      g.fillStyle = '#e07b2a';
      g.beginPath(); g.arc(fx, fy, u * 0.052 * sc + 0.5, 0, 7); g.fill();
      g.fillStyle = '#f5a04a';
      g.beginPath(); g.arc(fx - u * 0.02 * sc, fy - u * 0.02 * sc, u * 0.018 * sc + 0.4, 0, 7); g.fill();
    }
  }
}

function drawCrop(id, stage, cx, cy, u, time, wob) {
  var sway = Math.sin(time * 1.5 + wob * 6.28) * u * 0.022;
  g.save();
  g.translate(cx + sway * 0.3, cy);
  if (id === 'corn') drawCorn(stage, cx, cy, u, sway, wob);
  else if (id === 'wheat') drawWheat(stage, cx, cy, u, sway, wob);
  else if (id === 'cotton') drawCotton(stage, cx, cy, u, sway, wob);
  else if (id === 'soy') drawSoy(stage, cx, cy, u, sway, wob);
  else if (id === 'potato') drawPotato(stage, cx, cy, u, sway, wob);
  else if (id === 'orange') drawOrange(stage, cx, cy, u, sway, wob);
  g.restore();
}

/* ================= buildings =================
 * Front-facing with height, trim, and warm light. All cast soft shadows.
 */

function bldShadow(px, py, wpx, hpx, u) {
  g.fillStyle = 'rgba(20,12,6,0.22)';
  g.beginPath();
  g.ellipse(px + wpx / 2 + u * 0.12, py + hpx - u * 0.04, wpx * 0.46, u * 0.12, 0, 0, 7);
  g.fill();
}

function drawFarmhouse(b, u, time) {
  var px = b.x * TW, py = b.y * TW, wpx = b.w * TW, hpx = b.h * TW;
  bldShadow(px, py, wpx, hpx, u);
  var bx = px + u * 0.18, bw = wpx - u * 0.36;
  var wallTop = py + hpx * 0.34, wallBot = py + hpx * 0.94;
  /* walls: warm cream with siding lines */
  var wg = g.createLinearGradient(bx, 0, bx + bw, 0);
  wg.addColorStop(0, '#f5ecd8'); wg.addColorStop(0.5, '#f0e8d8'); wg.addColorStop(1, '#ddcfae');
  g.fillStyle = wg;
  g.fillRect(bx, wallTop, bw, wallBot - wallTop);
  g.strokeStyle = 'rgba(120,95,60,0.25)'; g.lineWidth = Math.max(1, u * 0.02);
  for (var s = 1; s < 6; s++) {
    var sy = wallTop + (wallBot - wallTop) * s / 6;
    g.beginPath(); g.moveTo(bx, sy); g.lineTo(bx + bw, sy); g.stroke();
  }
  /* stone foundation */
  g.fillStyle = '#9a938a';
  g.fillRect(bx, wallBot - u * 0.08, bw, u * 0.08);
  g.fillStyle = 'rgba(60,55,48,0.4)';
  for (var st = 0; st < 5; st++) {
    g.fillRect(bx + st * bw / 5, wallBot - u * 0.08, 1.5, u * 0.08);
  }
  /* roof: front gable with shingles */
  var apex = py + hpx * 0.02, eave = wallTop + u * 0.02;
  g.fillStyle = '#6f4a32';
  g.beginPath();
  g.moveTo(bx - u * 0.1, eave); g.lineTo(bx + bw / 2, apex); g.lineTo(bx + bw + u * 0.1, eave);
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(50,32,18,0.5)'; g.lineWidth = Math.max(1, u * 0.022);
  for (var r = 1; r < 5; r++) {
    var ry = apex + (eave - apex) * r / 5;
    var rw = (ry - apex) / (eave - apex) * (bw / 2 + u * 0.1);
    g.beginPath(); g.moveTo(bx + bw / 2 - rw, ry); g.lineTo(bx + bw / 2 + rw, ry); g.stroke();
  }
  g.fillStyle = '#8a5f43';
  g.beginPath();
  g.moveTo(bx + bw / 2 - u * 0.06, apex); g.lineTo(bx + bw / 2, apex - u * 0.02);
  g.lineTo(bx + bw / 2 + u * 0.06, apex); g.closePath(); g.fill();
  /* chimney + smoke */
  var chx = bx + bw * 0.78;
  g.fillStyle = '#8a4a3a';
  g.fillRect(chx, apex + u * 0.05, u * 0.16, u * 0.3);
  g.fillStyle = 'rgba(60,30,22,0.4)';
  for (var br = 0; br < 3; br++) g.fillRect(chx, apex + u * 0.05 + br * u * 0.1, u * 0.16, 1.5);
  for (var sm = 0; sm < 3; sm++) {
    var st2 = (time * 0.35 + sm / 3) % 1;
    g.fillStyle = 'rgba(220,220,220,' + (0.35 * (1 - st2)) + ')';
    g.beginPath();
    g.arc(chx + u * 0.08 + Math.sin(st2 * 5 + sm) * u * 0.12, apex - st2 * u * 0.9,
          u * (0.08 + st2 * 0.14), 0, 7);
    g.fill();
  }
  /* door */
  var dw = u * 0.3, dx = bx + bw / 2 - dw / 2;
  g.fillStyle = '#5a4632'; g.fillRect(dx - u * 0.03, wallBot - u * 0.52, dw + u * 0.06, u * 0.52);
  g.fillStyle = '#7d4a2e'; g.fillRect(dx, wallBot - u * 0.5, dw, u * 0.48);
  g.strokeStyle = '#4a2f1c'; g.lineWidth = Math.max(1, u * 0.02);
  g.strokeRect(dx + u * 0.05, wallBot - u * 0.44, dw - u * 0.1, u * 0.18);
  g.strokeRect(dx + u * 0.05, wallBot - u * 0.24, dw - u * 0.1, u * 0.16);
  g.fillStyle = '#e8c53a';
  g.beginPath(); g.arc(dx + dw - u * 0.07, wallBot - u * 0.26, u * 0.028, 0, 7); g.fill();
  /* windows with shutters + flower boxes */
  var wins = [bx + bw * 0.16, bx + bw * 0.68];
  for (var w = 0; w < 2; w++) {
    var wx = wins[w], ww = u * 0.3, wy = wallTop + u * 0.24, wh = u * 0.3;
    g.fillStyle = '#3d5a2e';
    g.fillRect(wx - u * 0.1, wy, u * 0.08, wh);
    g.fillRect(wx + ww + u * 0.02, wy, u * 0.08, wh);
    g.fillStyle = '#fff'; g.fillRect(wx - u * 0.02, wy - u * 0.02, ww + u * 0.04, wh + u * 0.04);
    var gl = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
    gl.addColorStop(0, '#ffe9a8'); gl.addColorStop(1, '#e8c87a');
    g.fillStyle = gl; g.fillRect(wx, wy, ww, wh);
    g.strokeStyle = '#fff'; g.lineWidth = Math.max(1.5, u * 0.03);
    g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh);
    g.moveTo(wx, wy + wh / 2); g.lineTo(wx + ww, wy + wh / 2); g.stroke();
    /* flower box */
    g.fillStyle = '#6b4a2a'; g.fillRect(wx - u * 0.03, wy + wh + u * 0.02, ww + u * 0.06, u * 0.1);
    var fc = ['#d63a2f', '#e8a93a', '#d67f88'];
    for (var f = 0; f < 4; f++) {
      g.fillStyle = fc[f % 3];
      g.beginPath(); g.arc(wx + (f + 0.5) * ww / 4, wy + wh + u * 0.05, u * 0.035, 0, 7); g.fill();
    }
  }
}

function drawBarn(b, u, time) {
  var px = b.x * TW, py = b.y * TW, wpx = b.w * TW, hpx = b.h * TW;
  bldShadow(px, py, wpx, hpx, u);
  var bx = px + u * 0.14, bw = wpx - u * 0.28;
  var wallTop = py + hpx * 0.3, wallBot = py + hpx * 0.94;
  /* red walls with vertical boards */
  var wg = g.createLinearGradient(bx, 0, bx + bw, 0);
  wg.addColorStop(0, '#b8453d'); wg.addColorStop(0.5, '#a83a32'); wg.addColorStop(1, '#8c2f28');
  g.fillStyle = wg;
  g.fillRect(bx, wallTop, bw, wallBot - wallTop);
  g.strokeStyle = 'rgba(90,25,20,0.55)'; g.lineWidth = Math.max(1, u * 0.022);
  for (var v = 1; v < 8; v++) {
    var vx = bx + bw * v / 8;
    g.beginPath(); g.moveTo(vx, wallTop); g.lineTo(vx, wallBot); g.stroke();
  }
  /* white corner trim */
  g.fillStyle = '#f0e8d8';
  g.fillRect(bx - u * 0.03, wallTop, u * 0.07, wallBot - wallTop);
  g.fillRect(bx + bw - u * 0.04, wallTop, u * 0.07, wallBot - wallTop);
  /* stone foundation */
  g.fillStyle = '#9a938a'; g.fillRect(bx, wallBot - u * 0.07, bw, u * 0.07);
  /* gambrel roof: two slopes */
  var apex = py + hpx * 0.02, mid = py + hpx * 0.17, eave = wallTop + u * 0.02;
  g.fillStyle = '#7a6a58';
  g.beginPath();
  g.moveTo(bx - u * 0.08, eave); g.lineTo(bx + bw * 0.22, mid); g.lineTo(bx + bw / 2, apex);
  g.lineTo(bx + bw * 0.78, mid); g.lineTo(bx + bw + u * 0.08, eave);
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(40,32,24,0.6)'; g.lineWidth = Math.max(1, u * 0.025);
  g.beginPath();
  g.moveTo(bx - u * 0.08, eave); g.lineTo(bx + bw * 0.22, mid); g.lineTo(bx + bw / 2, apex);
  g.lineTo(bx + bw * 0.78, mid); g.lineTo(bx + bw + u * 0.08, eave);
  g.stroke();
  /* roof plank lines */
  g.strokeStyle = 'rgba(40,32,24,0.35)'; g.lineWidth = Math.max(1, u * 0.018);
  for (var rp = 1; rp < 4; rp++) {
    var ry2 = apex + (mid - apex) * rp / 4;
    g.beginPath(); g.moveTo(bx + bw / 2 - u * 0.3 * rp / 4, ry2); g.lineTo(bx + bw / 2 + u * 0.3 * rp / 4, ry2); g.stroke();
  }
  /* weathervane */
  var wvx = bx + bw / 2;
  g.strokeStyle = '#3a3230'; g.lineWidth = Math.max(1.5, u * 0.03);
  g.beginPath(); g.moveTo(wvx, apex - u * 0.02); g.lineTo(wvx, apex - u * 0.3); g.stroke();
  g.fillStyle = '#3a3230';
  g.beginPath(); g.arc(wvx, apex - u * 0.3, u * 0.035, 0, 7); g.fill();
  var wdir = Math.sin(time * 0.4) * 0.5;
  g.save(); g.translate(wvx, apex - u * 0.24); g.rotate(wdir);
  g.beginPath(); g.moveTo(-u * 0.14, 0); g.lineTo(u * 0.14, 0); g.stroke();
  g.beginPath(); g.moveTo(u * 0.14, 0); g.lineTo(u * 0.09, -u * 0.045); g.lineTo(u * 0.09, u * 0.045); g.closePath(); g.fill();
  g.restore();
  /* big door with X brace */
  var dw = bw * 0.44, dx = bx + bw / 2 - dw / 2, dtop = wallBot - u * 0.62;
  g.fillStyle = '#f0e8d8'; g.fillRect(dx - u * 0.04, dtop - u * 0.04, dw + u * 0.08, wallBot - dtop + u * 0.02);
  g.fillStyle = '#6e2620'; g.fillRect(dx, dtop, dw, wallBot - dtop - u * 0.02);
  g.strokeStyle = '#f0e8d8'; g.lineWidth = Math.max(2, u * 0.05); g.lineCap = 'round';
  g.beginPath(); g.moveTo(dx + u * 0.06, dtop + u * 0.06); g.lineTo(dx + dw - u * 0.06, wallBot - u * 0.1); g.stroke();
  g.beginPath(); g.moveTo(dx + dw - u * 0.06, dtop + u * 0.06); g.lineTo(dx + u * 0.06, wallBot - u * 0.1); g.stroke();
  /* hayloft door + pulley */
  var hw = u * 0.26, hx = bx + bw / 2 - hw / 2, hy = wallTop + u * 0.1;
  g.fillStyle = '#f0e8d8'; g.fillRect(hx - u * 0.03, hy - u * 0.03, hw + u * 0.06, hw + u * 0.06);
  g.fillStyle = '#5a1f1a'; g.fillRect(hx, hy, hw, hw);
  g.strokeStyle = '#f0e8d8'; g.lineWidth = Math.max(1.5, u * 0.035);
  g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + hw, hy + hw); g.stroke();
  g.strokeStyle = '#4a3018'; g.lineWidth = Math.max(2, u * 0.045);
  g.beginPath(); g.moveTo(hx + hw / 2, hy - u * 0.03); g.lineTo(hx + hw / 2 + u * 0.16, hy - u * 0.03); g.stroke();
  g.strokeStyle = '#2e2013'; g.lineWidth = Math.max(1, u * 0.02);
  g.beginPath(); g.moveTo(hx + hw / 2 + u * 0.16, hy - u * 0.03); g.lineTo(hx + hw / 2 + u * 0.16, hy + u * 0.08); g.stroke();
  /* side window */
  g.fillStyle = '#f0e8d8'; g.fillRect(bx + bw * 0.08, wallTop + u * 0.32, u * 0.2, u * 0.2);
  g.fillStyle = '#2e3a4a'; g.fillRect(bx + bw * 0.08 + u * 0.03, wallTop + u * 0.32 + u * 0.03, u * 0.14, u * 0.14);
}

function drawSilo(b, u, time) {
  var px = b.x * TW, py = b.y * TW, wpx = b.w * TW, hpx = b.h * TW;
  bldShadow(px, py, wpx, hpx, u);
  var cx = px + wpx / 2;
  var bw = wpx * 0.62, bx = cx - bw / 2;
  var btop = py + hpx * 0.3, bbot = py + hpx * 0.94;
  /* body with vertical sheen */
  var bg = g.createLinearGradient(bx, 0, bx + bw, 0);
  bg.addColorStop(0, '#8f959b'); bg.addColorStop(0.35, '#d5dade'); bg.addColorStop(0.65, '#b9bec4'); bg.addColorStop(1, '#7d838a');
  g.fillStyle = bg;
  g.fillRect(bx, btop, bw, bbot - btop);
  /* horizontal bands */
  for (var i = 1; i < 4; i++) {
    var by = btop + (bbot - btop) * i / 4;
    g.fillStyle = 'rgba(70,75,82,0.55)';
    g.fillRect(bx, by, bw, Math.max(1.5, u * 0.03));
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(bx, by + Math.max(1.5, u * 0.03), bw, Math.max(1, u * 0.02));
  }
  /* dome cap */
  g.fillStyle = '#9aa0a8';
  g.beginPath(); g.ellipse(cx, btop, bw / 2, u * 0.16, 0, Math.PI, 0); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.4)';
  g.beginPath(); g.ellipse(cx - bw * 0.15, btop - u * 0.06, bw * 0.14, u * 0.05, -0.4, 0, 7); g.fill();
  g.fillStyle = '#6e747b';
  g.beginPath(); g.arc(cx, btop - u * 0.16, u * 0.045, 0, 7); g.fill();
  g.fillRect(cx - u * 0.015, btop - u * 0.3, u * 0.03, u * 0.15);
  /* ladder */
  g.strokeStyle = '#5a5f66'; g.lineWidth = Math.max(1.5, u * 0.03);
  var lx = bx + bw * 0.82;
  g.beginPath(); g.moveTo(lx - u * 0.05, btop + u * 0.1); g.lineTo(lx - u * 0.05, bbot); g.stroke();
  g.beginPath(); g.moveTo(lx + u * 0.05, btop + u * 0.1); g.lineTo(lx + u * 0.05, bbot); g.stroke();
  g.lineWidth = Math.max(1, u * 0.02);
  for (var r = 0; r < 5; r++) {
    var ry = btop + u * 0.18 + r * u * 0.14;
    g.beginPath(); g.moveTo(lx - u * 0.05, ry); g.lineTo(lx + u * 0.05, ry); g.stroke();
  }
}

function drawCoop(b, u, time) {
  var px = b.x * TW, py = b.y * TW, wpx = b.w * TW, hpx = b.h * TW;
  bldShadow(px, py, wpx, hpx, u);
  var cx = px + wpx / 2;
  var bw = wpx * 0.72, bx = cx - bw / 2;
  var base = py + hpx * 0.9, apex = py + hpx * 0.3;
  /* A-frame body */
  var wg = g.createLinearGradient(bx, 0, bx + bw, 0);
  wg.addColorStop(0, '#b98a4e'); wg.addColorStop(0.5, '#a8763e'); wg.addColorStop(1, '#8a5f2e');
  g.fillStyle = wg;
  g.beginPath();
  g.moveTo(bx, base); g.lineTo(cx, apex); g.lineTo(bx + bw, base); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(80,55,25,0.5)'; g.lineWidth = Math.max(1, u * 0.02);
  for (var p = 1; p < 4; p++) {
    var py2 = apex + (base - apex) * p / 4;
    var pw = (py2 - apex) / (base - apex) * bw / 2;
    g.beginPath(); g.moveTo(cx - pw, py2); g.lineTo(cx + pw, py2); g.stroke();
  }
  /* roof cap */
  g.strokeStyle = '#7d5626'; g.lineWidth = Math.max(3, u * 0.07); g.lineCap = 'round';
  g.beginPath(); g.moveTo(bx - u * 0.03, base); g.lineTo(cx, apex); g.lineTo(bx + bw + u * 0.03, base); g.stroke();
  /* round door */
  g.fillStyle = '#2e2013';
  g.beginPath(); g.arc(cx, base - u * 0.22, u * 0.13, 0, 7); g.fill();
  /* ramp */
  g.save();
  g.translate(cx, base - u * 0.12); g.rotate(0.5);
  g.fillStyle = '#8a5f2e';
  g.fillRect(-u * 0.07, 0, u * 0.14, u * 0.34);
  g.strokeStyle = '#5a3d1c'; g.lineWidth = Math.max(1, u * 0.018);
  for (var r2 = 1; r2 < 4; r2++) { g.beginPath(); g.moveTo(-u * 0.07, r2 * u * 0.085); g.lineTo(u * 0.07, r2 * u * 0.085); g.stroke(); }
  g.restore();
  /* tiny window */
  g.fillStyle = '#f0e8d8';
  g.beginPath(); g.arc(cx, apex + u * 0.22, u * 0.06, 0, 7); g.fill();
  g.fillStyle = '#2e3a4a';
  g.beginPath(); g.arc(cx, apex + u * 0.22, u * 0.035, 0, 7); g.fill();
}

function drawPigpen(b, u, time) {
  var px = b.x * TW, py = b.y * TW, wpx = b.w * TW, hpx = b.h * TW;
  /* mud patch */
  g.fillStyle = 'rgba(20,12,6,0.18)';
  g.beginPath(); g.ellipse(px + wpx / 2, py + hpx * 0.62, wpx * 0.44, hpx * 0.3, 0, 0, 7); g.fill();
  g.fillStyle = '#5a4030';
  g.beginPath(); g.ellipse(px + wpx / 2, py + hpx * 0.58, wpx * 0.4, hpx * 0.26, 0, 0, 7); g.fill();
  g.strokeStyle = '#7d5f42'; g.lineWidth = Math.max(1.5, u * 0.035); g.lineCap = 'round';
  for (var s = 0; s < 3; s++) {
    g.beginPath();
    g.arc(px + wpx * (0.35 + s * 0.15), py + hpx * 0.58, u * (0.1 + s * 0.05), 0.4, 2.6);
    g.stroke();
  }
  /* fence: posts + 3 rails, front face */
  var ftop = py + hpx * 0.12, fbot = py + hpx * 0.88;
  var nposts = 5;
  for (var r = 0; r < 3; r++) {
    var ry = ftop + (fbot - ftop) * (0.2 + r * 0.3);
    g.fillStyle = '#8f6c40';
    g.fillRect(px + u * 0.06, ry - u * 0.045, wpx - u * 0.12, u * 0.09);
    g.fillStyle = 'rgba(255,240,210,0.35)';
    g.fillRect(px + u * 0.06, ry - u * 0.045, wpx - u * 0.12, u * 0.028);
  }
  for (var p = 0; p < nposts; p++) {
    var fx = px + u * 0.06 + (wpx - u * 0.12) * p / (nposts - 1);
    var pw = Math.max(3, u * 0.09);
    var pg = g.createLinearGradient(fx - pw / 2, 0, fx + pw / 2, 0);
    pg.addColorStop(0, '#6e4e28'); pg.addColorStop(0.5, '#8a683c'); pg.addColorStop(1, '#5a3f20');
    g.fillStyle = pg;
    g.fillRect(fx - pw / 2, ftop - u * 0.06, pw, fbot - ftop + u * 0.06);
    g.fillStyle = '#4a3418';
    g.beginPath();
    g.moveTo(fx - pw / 2, ftop - u * 0.06); g.lineTo(fx, ftop - u * 0.14); g.lineTo(fx + pw / 2, ftop - u * 0.06);
    g.closePath(); g.fill();
  }
  /* trough */
  var tx = px + wpx * 0.72, ty = py + hpx * 0.5;
  g.fillStyle = '#6b4a2a';
  g.fillRect(tx - u * 0.16, ty, u * 0.32, u * 0.12);
  g.fillStyle = '#4a2f1c';
  g.fillRect(tx - u * 0.14, ty + u * 0.02, u * 0.28, u * 0.06);
}

function drawBuilding(b, u, time) {
  g.save();
  if (b.type === 'farmhouse') drawFarmhouse(b, u, time);
  else if (b.type === 'barn') drawBarn(b, u, time);
  else if (b.type === 'silo') drawSilo(b, u, time);
  else if (b.type === 'coop') drawCoop(b, u, time);
  else if (b.type === 'pigpen') drawPigpen(b, u, time);
  g.restore();
}

/* ================= animals =================
 * Bodies with legs, faces, and idle behaviors: cows graze, chickens peck,
 * pigs root. Facing flips with wander direction.
 */

function animalShadow(u) {
  g.fillStyle = 'rgba(20,12,6,0.20)';
  g.beginPath(); g.ellipse(0, u * 0.22, u * 0.3, u * 0.08, 0, 0, 7); g.fill();
}

function drawCow(u, time, seedv) {
  animalShadow(u);
  var dir = Math.cos(time * 0.5 + seedv * 9) > 0 ? 1 : -1;
  g.save(); g.scale(dir, 1);
  var grazePh = (time * 0.11 + seedv) % 1;
  var graze = grazePh < 0.38 ? Math.sin(grazePh / 0.38 * Math.PI) : 0;
  var tailSw = Math.sin(time * 2.2 + seedv * 5) * u * 0.06;
  /* legs */
  g.fillStyle = '#cfccc2';
  var legs = [[-0.2, 0], [-0.08, 0.03], [0.1, 0], [0.2, 0.03]];
  for (var l = 0; l < 4; l++) {
    var lx = legs[l][0] * u, lo = legs[l][1] * u;
    g.fillRect(lx - u * 0.035, u * 0.02 + lo, u * 0.07, u * 0.22 - lo);
    g.fillStyle = '#3a3630';
    g.fillRect(lx - u * 0.038, u * 0.22, u * 0.076, u * 0.045);
    g.fillStyle = '#cfccc2';
  }
  /* tail */
  g.strokeStyle = '#e8e4da'; g.lineWidth = Math.max(1.5, u * 0.03); g.lineCap = 'round';
  g.beginPath(); g.moveTo(-u * 0.3, -u * 0.08); g.quadraticCurveTo(-u * 0.38, u * 0.05, -u * 0.36 + tailSw, u * 0.14); g.stroke();
  g.fillStyle = '#3a3a3a';
  g.beginPath(); g.arc(-u * 0.36 + tailSw, u * 0.15, u * 0.035, 0, 7); g.fill();
  /* body */
  var bg = g.createLinearGradient(0, -u * 0.25, 0, u * 0.1);
  bg.addColorStop(0, '#f7f4ec'); bg.addColorStop(1, '#d8d4c8');
  g.fillStyle = bg;
  g.beginPath(); g.ellipse(0, -u * 0.06, u * 0.32, u * 0.2, 0, 0, 7); g.fill();
  /* patches */
  g.fillStyle = '#3a3a3a';
  g.beginPath(); g.ellipse(-u * 0.1, -u * 0.1, u * 0.1, u * 0.07, 0.4, 0, 7); g.fill();
  g.beginPath(); g.ellipse(u * 0.12, -u * 0.02, u * 0.07, u * 0.05, -0.3, 0, 7); g.fill();
  /* head (dips when grazing) */
  var hx = u * 0.34, hy = -u * 0.16 + graze * u * 0.3;
  g.save(); g.translate(hx, hy); g.rotate(graze * 0.5);
  g.fillStyle = '#f2efe8';
  g.beginPath(); g.ellipse(0, 0, u * 0.13, u * 0.11, 0, 0, 7); g.fill();
  /* ears + horns */
  g.fillStyle = '#e8e4da';
  g.beginPath(); g.ellipse(-u * 0.1, -u * 0.08, u * 0.06, u * 0.035, -0.5, 0, 7); g.fill();
  g.fillStyle = '#e8dcc0';
  g.beginPath(); g.moveTo(-u * 0.05, -u * 0.1); g.lineTo(-u * 0.08, -u * 0.17); g.lineTo(-u * 0.02, -u * 0.11); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(u * 0.05, -u * 0.1); g.lineTo(u * 0.08, -u * 0.17); g.lineTo(u * 0.02, -u * 0.11); g.closePath(); g.fill();
  /* muzzle */
  g.fillStyle = '#d8a0a0';
  g.beginPath(); g.ellipse(u * 0.08, u * 0.04, u * 0.07, u * 0.05, 0, 0, 7); g.fill();
  g.fillStyle = '#a86a6a';
  g.beginPath(); g.arc(u * 0.06, u * 0.04, u * 0.012, 0, 7); g.fill();
  g.beginPath(); g.arc(u * 0.1, u * 0.04, u * 0.012, 0, 7); g.fill();
  /* eyes */
  if (graze < 0.5) {
    g.fillStyle = '#2e2417';
    g.beginPath(); g.arc(u * 0.02, -u * 0.03, u * 0.018, 0, 7); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(u * 0.025, -u * 0.035, u * 0.006, 0, 7); g.fill();
  }
  g.restore();
  g.restore();
}

function drawChicken(u, time, seedv) {
  animalShadow(u);
  var dir = Math.cos(time * 0.37 + seedv * 7) > 0 ? 1 : -1;
  g.save(); g.scale(dir, 1);
  var peckPh = (time * 0.4 + seedv * 2) % 1;
  var peck = peckPh < 0.22 ? Math.sin(peckPh / 0.22 * Math.PI) : 0;
  /* legs */
  g.strokeStyle = '#e07b2a'; g.lineWidth = Math.max(1.5, u * 0.025); g.lineCap = 'round';
  for (var l = -1; l <= 1; l += 2) {
    g.beginPath(); g.moveTo(l * u * 0.05, u * 0.1); g.lineTo(l * u * 0.05, u * 0.2); g.stroke();
    g.beginPath(); g.moveTo(l * u * 0.05, u * 0.2);
    g.lineTo(l * u * 0.05 - u * 0.04, u * 0.23); g.moveTo(l * u * 0.05, u * 0.2);
    g.lineTo(l * u * 0.05 + u * 0.04, u * 0.23); g.stroke();
  }
  /* tail feathers */
  g.strokeStyle = '#e8e4da'; g.lineWidth = Math.max(2, u * 0.035);
  for (var t = 0; t < 3; t++) {
    g.beginPath(); g.moveTo(-u * 0.12, -u * 0.02);
    g.quadraticCurveTo(-u * 0.2, -u * 0.1 - t * u * 0.03, -u * 0.22, -u * 0.16 - t * u * 0.035);
    g.stroke();
  }
  /* body */
  var bg = g.createLinearGradient(0, -u * 0.14, 0, u * 0.1);
  bg.addColorStop(0, '#faf8f2'); bg.addColorStop(1, '#ddd8cc');
  g.fillStyle = bg;
  g.beginPath(); g.ellipse(0, 0, u * 0.15, u * 0.12, 0, 0, 7); g.fill();
  /* wing */
  g.fillStyle = '#d5d0c2';
  g.beginPath(); g.ellipse(-u * 0.02, u * 0.01, u * 0.08, u * 0.055, -0.3, 0, 7); g.fill();
  /* head (bobs when pecking) */
  var hx = u * 0.13, hy = -u * 0.13 + peck * u * 0.12;
  g.save(); g.translate(hx, hy);
  g.fillStyle = '#f5f2ea';
  g.beginPath(); g.arc(0, 0, u * 0.075, 0, 7); g.fill();
  /* comb */
  g.fillStyle = '#d63a2f';
  for (var c = 0; c < 3; c++) {
    g.beginPath(); g.arc(-u * 0.03 + c * u * 0.035, -u * 0.07, u * 0.028, 0, 7); g.fill();
  }
  /* beak */
  g.fillStyle = '#e07b2a';
  g.beginPath(); g.moveTo(u * 0.06, -u * 0.01); g.lineTo(u * 0.11, u * 0.01); g.lineTo(u * 0.06, u * 0.035); g.closePath(); g.fill();
  /* eye */
  g.fillStyle = '#2e2417';
  g.beginPath(); g.arc(u * 0.02, -u * 0.02, u * 0.014, 0, 7); g.fill();
  g.restore();
  g.restore();
}

function drawPig(u, time, seedv) {
  animalShadow(u);
  var dir = Math.cos(time * 0.43 + seedv * 6) > 0 ? 1 : -1;
  g.save(); g.scale(dir, 1);
  var rootPh = (time * 0.13 + seedv * 1.4) % 1;
  var root = rootPh < 0.4 ? Math.sin(rootPh / 0.4 * Math.PI) : 0;
  /* legs */
  g.fillStyle = '#d67f88';
  var legs = [[-0.14], [-0.05], [0.08], [0.17]];
  for (var l = 0; l < 4; l++) {
    var lx = legs[l][0] * u;
    g.fillRect(lx - u * 0.03, u * 0.06, u * 0.06, u * 0.14);
    g.fillStyle = '#8a4a52';
    g.fillRect(lx - u * 0.032, u * 0.18, u * 0.064, u * 0.035);
    g.fillStyle = '#d67f88';
  }
  /* curly tail */
  g.strokeStyle = '#d67f88'; g.lineWidth = Math.max(1.5, u * 0.025); g.lineCap = 'round';
  var tw = Math.sin(time * 3 + seedv * 8) * u * 0.02;
  g.beginPath(); g.arc(-u * 0.24, -u * 0.05 + tw, u * 0.035, 0.5, 5.5); g.stroke();
  /* body */
  var bg = g.createLinearGradient(0, -u * 0.2, 0, u * 0.1);
  bg.addColorStop(0, '#f0a8b0'); bg.addColorStop(1, '#d67f88');
  g.fillStyle = bg;
  g.beginPath(); g.ellipse(0, -u * 0.04, u * 0.24, u * 0.155, 0, 0, 7); g.fill();
  /* head */
  var hx = u * 0.22, hy = -u * 0.1 + root * u * 0.16;
  g.save(); g.translate(hx, hy); g.rotate(root * 0.4);
  g.fillStyle = '#e8a0a8';
  g.beginPath(); g.arc(0, 0, u * 0.1, 0, 7); g.fill();
  /* ears */
  g.fillStyle = '#d67f88';
  g.beginPath(); g.ellipse(-u * 0.05, -u * 0.09, u * 0.045, u * 0.03, -0.6, 0, 7); g.fill();
  g.beginPath(); g.ellipse(u * 0.05, -u * 0.09, u * 0.045, u * 0.03, 0.6, 0, 7); g.fill();
  /* snout */
  g.fillStyle = '#d67f88';
  g.beginPath(); g.ellipse(u * 0.07, u * 0.02, u * 0.05, u * 0.038, 0, 0, 7); g.fill();
  g.fillStyle = '#8a4a52';
  g.beginPath(); g.arc(u * 0.055, u * 0.02, u * 0.011, 0, 7); g.fill();
  g.beginPath(); g.arc(u * 0.085, u * 0.02, u * 0.011, 0, 7); g.fill();
  /* eyes */
  if (root < 0.5) {
    g.fillStyle = '#2e2417';
    g.beginPath(); g.arc(u * 0.0, -u * 0.03, u * 0.014, 0, 7); g.fill();
  }
  g.restore();
  g.restore();
}

function drawAnimal(kind, x, y, u, time, seedv) {
  var wx = x + Math.sin(time * 0.5 + seedv * 9) * u * 0.35;
  var wy = y + Math.cos(time * 0.37 + seedv * 7) * u * 0.3;
  g.save();
  g.translate(wx, wy);
  if (kind === 'cow') drawCow(u, time, seedv);
  else if (kind === 'chicken') drawChicken(u, time, seedv);
  else drawPig(u, time, seedv);
  g.restore();
}

/* ================= countryside backdrop =================
 * Painted into the letterbox bands: sky + hills + treeline above the farm,
 * dark meadow with a fence line below. Frames the farm as a valley.
 */

function drawCountryside(time, calm) {
  var w = cv.width, h = cv.height;
  var at = calm ? 0 : time;
  /* top band: sky */
  if (OY > 2) {
    var sky = g.createLinearGradient(0, 0, 0, OY);
    sky.addColorStop(0, '#8fb8dd'); sky.addColorStop(0.7, '#cfd9c8'); sky.addColorStop(1, '#f2dfae');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, OY + 1);
    /* sun glow */
    var sx = w * 0.82, sy = OY * 0.35;
    var sg = g.createRadialGradient(sx, sy, 0, sx, sy, OY * 0.9);
    sg.addColorStop(0, 'rgba(255,236,180,0.9)'); sg.addColorStop(1, 'rgba(255,236,180,0)');
    g.fillStyle = sg;
    g.fillRect(sx - OY, sy - OY, OY * 2, OY * 2);
    g.fillStyle = '#fff3cf';
    g.beginPath(); g.arc(sx, sy, OY * 0.14, 0, 7); g.fill();
    /* far hills */
    g.fillStyle = '#a8bf9e';
    g.beginPath(); g.moveTo(0, OY);
    for (var hx = 0; hx <= w; hx += w / 24)
      g.lineTo(hx, OY * 0.72 + Math.sin(hx / w * 9 + 1) * OY * 0.1);
    g.lineTo(w, OY); g.closePath(); g.fill();
    g.fillStyle = '#8aa884';
    g.beginPath(); g.moveTo(0, OY);
    for (var hx2 = 0; hx2 <= w; hx2 += w / 24)
      g.lineTo(hx2, OY * 0.82 + Math.sin(hx2 / w * 13 + 4) * OY * 0.08);
    g.lineTo(w, OY); g.closePath(); g.fill();
    /* treeline */
    for (var t = 0; t < Math.floor(w / (OY * 0.16)); t++) {
      var tx = t * OY * 0.16 + hash(t, 1, 91) * OY * 0.08;
      var th = OY * (0.16 + hash(t, 2, 91) * 0.14);
      var ty = OY;
      if (hash(t, 3, 91) < 0.45) {
        /* pine */
        g.fillStyle = hash(t, 4, 91) < 0.5 ? '#4a6a4a' : '#557a4e';
        g.beginPath();
        g.moveTo(tx, ty - th); g.lineTo(tx - th * 0.32, ty); g.lineTo(tx + th * 0.32, ty);
        g.closePath(); g.fill();
      } else {
        /* round tree */
        g.fillStyle = '#5f7f52';
        g.fillRect(tx - th * 0.03, ty - th * 0.5, th * 0.06, th * 0.5);
        g.fillStyle = hash(t, 4, 91) < 0.5 ? '#557a4e' : '#648a58';
        g.beginPath(); g.arc(tx, ty - th * 0.55, th * 0.3, 0, 7); g.fill();
      }
    }
    /* drifting clouds */
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (var c = 0; c < 3; c++) {
      var cxp = ((hash(c, 5, 92) * w + at * (6 + c * 3) * dpr) % (w + 200)) - 100;
      var cyp = OY * (0.2 + hash(c, 6, 92) * 0.35);
      var cs = OY * (0.1 + hash(c, 7, 92) * 0.08);
      for (var puff = 0; puff < 4; puff++) {
        g.beginPath();
        g.ellipse(cxp + (puff - 1.5) * cs * 0.8, cyp + (puff % 2) * cs * 0.2, cs * 0.7, cs * 0.42, 0, 0, 7);
        g.fill();
      }
    }
  }
  /* bottom band: dark meadow + fence line */
  var botTop = OY + TW * GAref.H;
  if (botTop < h - 2) {
    var mg = g.createLinearGradient(0, botTop, 0, h);
    mg.addColorStop(0, '#33482a'); mg.addColorStop(1, '#1c2a17');
    g.fillStyle = mg;
    g.fillRect(0, botTop, w, h - botTop);
    /* fence along the farm's edge */
    var fh = Math.min(TW * 0.5, (h - botTop) * 0.5);
    var fy = botTop + fh * 0.15;
    g.fillStyle = '#4a3a24';
    var step = Math.max(TW * 0.7, 26 * dpr);
    for (var fx = step / 2; fx < w; fx += step) {
      g.fillRect(fx - 2 * dpr, fy - fh * 0.25, 4 * dpr, fh * 1.1);
    }
    g.fillStyle = '#5a4830';
    g.fillRect(0, fy, w, fh * 0.12);
    g.fillRect(0, fy + fh * 0.45, w, fh * 0.12);
    /* grass silhouettes */
    g.strokeStyle = '#22331a'; g.lineWidth = Math.max(1.5, dpr * 1.5); g.lineCap = 'round';
    for (var gs = 0; gs < w / (14 * dpr); gs++) {
      var gx = hash(gs, 9, 93) * w, gy = botTop + (h - botTop) * (0.4 + hash(gs, 10, 93) * 0.55);
      var gl2 = (h - botTop) * 0.12 * hash(gs, 11, 93) + 4 * dpr;
      g.beginPath(); g.moveTo(gx, gy); g.quadraticCurveTo(gx + 3 * dpr, gy - gl2 * 0.6, gx + 6 * dpr, gy - gl2); g.stroke();
    }
  }
  /* side bands (if any): meadow */
  if (OX > 2) {
    g.fillStyle = '#2c3f24';
    g.fillRect(0, OY, OX, TW * GAref.H);
    g.fillRect(OX + TW * GAref.W, OY, OX + 1, TW * GAref.H);
  }
}

/* drifting cloud shadows over the field */
function drawCloudShadows(time, calm) {
  var at = calm ? 0 : time;
  var fw = TW * GAref.W, fh = TW * GAref.H;
  for (var i = 0; i < 3; i++) {
    var sp = (8 + i * 5) * dpr;
    var cx = OX + ((hash(i, 21, 94) * (fw + 600 * dpr) + at * sp) % (fw + 600 * dpr)) - 300 * dpr;
    var cy = OY + hash(i, 22, 94) * fh;
    var cr = TW * (2.5 + hash(i, 23, 94) * 2);
    var gr = g.createRadialGradient(cx, cy, 0, cx, cy, cr);
    gr.addColorStop(0, 'rgba(40,50,70,0.12)');
    gr.addColorStop(1, 'rgba(40,50,70,0)');
    g.fillStyle = gr;
    g.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
  }
}

function drawBirds(time, calm) {
  var at = calm ? 0 : time;
  if (OY < 40) return;
  g.strokeStyle = 'rgba(60,60,70,0.7)'; g.lineWidth = Math.max(1.5, dpr * 1.2); g.lineCap = 'round';
  for (var i = 0; i < 2; i++) {
    var sp = (22 + i * 9) * dpr;
    var bx = ((hash(i, 31, 95) * (cv.width + 120) + at * sp) % (cv.width + 120)) - 60;
    var by = OY * (0.3 + hash(i, 32, 95) * 0.4) + Math.sin(at * 2 + i * 3) * 6 * dpr;
    var flap = Math.sin(at * 9 + i * 4) * dpr * 3;
    var s = dpr * (5 + i * 2);
    g.beginPath();
    g.moveTo(bx - s, by + flap * 0.4); g.quadraticCurveTo(bx - s * 0.4, by - s * 0.5, bx, by);
    g.quadraticCurveTo(bx + s * 0.4, by - s * 0.5, bx + s, by + flap * 0.4);
    g.stroke();
  }
}

function drawButterflies(time, calm, st) {
  var at = calm ? 0 : time;
  var cols = ['#e07b2a', '#f5f2ea', '#e8c53a'];
  for (var i = 0; i < 3; i++) {
    var bx = OX + (hash(i, 41, 96) * 0.8 + 0.1 + Math.sin(at * 0.35 + i * 2.4) * 0.12) * TW * GAref.W;
    var by = OY + (hash(i, 42, 96) * 0.7 + 0.15 + Math.cos(at * 0.3 + i * 1.8) * 0.1) * TW * GAref.H;
    var flap = Math.abs(Math.sin(at * 14 + i * 3));
    var ws = TW * 0.09;
    g.fillStyle = cols[i];
    g.save(); g.translate(bx, by); g.rotate(Math.sin(at * 0.8 + i) * 0.4);
    g.beginPath(); g.ellipse(-ws * 0.5 * (0.3 + flap * 0.7), 0, ws * 0.55, ws * 0.4, -0.5, 0, 7); g.fill();
    g.beginPath(); g.ellipse(ws * 0.5 * (0.3 + flap * 0.7), 0, ws * 0.55, ws * 0.4, 0.5, 0, 7); g.fill();
    g.fillStyle = '#2e2417';
    g.fillRect(-dpr, -ws * 0.35, dpr * 2, ws * 0.7);
    g.restore();
  }
}

/* ================= weather ================= */

function drawWeather(st, time, wpx, hpx) {
  var cur = st.weather.cur;
  if (cur === 'rain' || cur === 'storm') {
    if (cur === 'storm') {
      g.fillStyle = 'rgba(40,45,60,0.26)';
      g.fillRect(0, 0, wpx, hpx);
      if (Math.sin(time * 0.9) > 0.982) {
        g.fillStyle = 'rgba(255,255,230,0.4)';
        g.fillRect(0, 0, wpx, hpx);
      }
    }
    /* rain streaks */
    g.strokeStyle = cur === 'storm' ? 'rgba(170,190,220,0.45)' : 'rgba(140,170,210,0.4)';
    g.lineWidth = Math.max(1, dpr * 1.1); g.lineCap = 'round';
    g.beginPath();
    var fr = Math.floor(time * 24);
    for (var i = 0; i < 60; i++) {
      var rx = hash(i, 7, fr) * wpx;
      var ry = hash(i, 13, fr) * hpx;
      g.moveTo(rx, ry); g.lineTo(rx - dpr * 5, ry + dpr * 11);
    }
    g.stroke();
    /* splashes on the field */
    g.strokeStyle = 'rgba(160,190,225,0.5)'; g.lineWidth = Math.max(1, dpr);
    g.beginPath();
    for (var s2 = 0; s2 < 26; s2++) {
      var sx = OX + hash(s2, 51, fr) * TW * GAref.W;
      var sy = OY + hash(s2, 52, fr) * TW * GAref.H;
      g.moveTo(sx - dpr * 3, sy); g.quadraticCurveTo(sx, sy - dpr * 3, sx + dpr * 3, sy);
    }
    g.stroke();
  } else if (cur === 'cloudy') {
    g.fillStyle = 'rgba(120,125,135,0.12)';
    g.fillRect(0, 0, wpx, hpx);
  }
  if (st.season === 3) { /* snowfall */
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (var s3 = 0; s3 < 46; s3++) {
      var fx = hash(s3, 21, 0) * wpx + Math.sin(time * 1.2 + s3) * 8 * dpr;
      var fy = (hash(s3, 22, 0) * hpx + time * 16 * dpr) % hpx;
      var fs = dpr * (1.2 + hash(s3, 23, 0) * 1.4);
      g.fillRect(fx, fy, fs, fs);
    }
  }
}

function drawTornado(fx, time) {
  var p = fx.t; /* 0..1 */
  var tx = fx.x * TW + TW * 1.5; /* grid space: caller has translated by (OX, OY) */
  var alpha = p < 0.15 ? p / 0.15 : (p > 0.8 ? (1 - p) / 0.2 : 1);
  g.save();
  g.globalAlpha = Math.max(0, alpha);
  g.translate(tx + Math.sin(time * 7) * TW * 0.4, 0);
  for (var i = 0; i < 14; i++) {
    var yy = (i / 14) * cv.height;
    var ww = TW * (0.5 + (i / 14) * 2.2);
    var off = Math.sin(time * 9 + i * 0.8) * ww * 0.3;
    g.fillStyle = 'rgba(120,115,105,' + (0.5 - i * 0.02) + ')';
    g.beginPath();
    g.ellipse(off, yy, ww * 0.5, TW * 0.35, 0, 0, 7);
    g.fill();
  }
  g.fillStyle = 'rgba(90,80,70,0.7)';
  for (var d2 = 0; d2 < 12; d2++) {
    var dx = Math.sin(time * 11 + d2 * 2.4) * TW * (1 + d2 * 0.2);
    var dy = (hash(d2, 5, 0) * cv.height + time * 260 * dpr) % cv.height;
    g.fillRect(dx - TW * 0.1, dy, dpr * 4, dpr * 3);
  }
  g.restore();
}

/* ================= fx particles ================= */

function drawFxKind(fx, time) {
  for (var i = fx.length - 1; i >= 0; i--) {
    var p = fx[i];
    if (p.kind === 'dust') {
      var age = time - p.born, life = 0.7, k = age / life;
      if (k >= 1) { fx.splice(i, 1); continue; }
      g.save();
      g.globalAlpha = 0.55 * (1 - k);
      g.fillStyle = '#8a6a44';
      for (var d = 0; d < 5; d++) {
        var da = hash(d, 61, p.seed) * 6.283;
        var dr = k * TW * (0.3 + hash(d, 62, p.seed) * 0.4);
        g.beginPath();
        g.arc(p.x + Math.cos(da) * dr, p.y - k * TW * 0.7 + Math.sin(da) * dr * 0.4,
              TW * 0.09 * (1 - k * 0.5), 0, 7);
        g.fill();
      }
      g.restore();
    } else if (p.kind === 'sparkle') {
      var age2 = time - p.born, life2 = 0.65, k2 = age2 / life2;
      if (k2 >= 1) { fx.splice(i, 1); continue; }
      g.save();
      g.globalAlpha = 1 - k2;
      for (var s = 0; s < 6; s++) {
        var sx = p.x + (hash(s, 63, p.seed) - 0.5) * TW * 0.8;
        var sy = p.y - TW * 0.5 + k2 * k2 * TW * 1.1;
        g.strokeStyle = '#9fd0f0'; g.lineWidth = Math.max(1.5, dpr * 1.4); g.lineCap = 'round';
        g.beginPath(); g.moveTo(sx, sy - TW * 0.12); g.lineTo(sx, sy); g.stroke();
        g.fillStyle = '#d8ecff';
        g.beginPath(); g.arc(sx, sy + 1, TW * 0.035, 0, 7); g.fill();
      }
      g.restore();
    } else if (p.kind === 'chaff') {
      var age3 = time - p.born, life3 = 0.95, k3 = age3 / life3;
      if (k3 >= 1) { fx.splice(i, 1); continue; }
      g.save();
      g.globalAlpha = 1 - k3 * k3;
      for (var c = 0; c < 8; c++) {
        var ca = hash(c, 64, p.seed) * 6.283;
        var cd = k3 * TW * (0.5 + hash(c, 65, p.seed) * 0.7);
        var chy = p.y - Math.sin(k3 * Math.PI) * TW * 0.5 + k3 * k3 * TW * 0.6;
        g.save();
        g.translate(p.x + Math.cos(ca) * cd, chy + Math.sin(ca) * cd * 0.5);
        g.rotate(ca + age3 * 6);
        g.fillStyle = p.color || '#8fbf6a';
        g.beginPath(); g.ellipse(0, 0, TW * 0.07, TW * 0.035, 0, 0, 7); g.fill();
        g.restore();
      }
      g.restore();
    }
  }
}

function drawPops(fx, time) {
  for (var i = fx.length - 1; i >= 0; i--) {
    var p = fx[i];
    if (p.kind !== 'pop') continue;
    var age = time - p.born;
    var life = 1.4, k = age / life;
    if (k >= 1) { fx.splice(i, 1); continue; }
    var e = 1 - Math.pow(1 - k, 3);
    g.save();
    g.globalAlpha = 1 - k * k;
    g.font = '700 ' + Math.round(TW * 0.62) + 'px Georgia, serif';
    g.textAlign = 'center';
    g.lineWidth = 4; g.strokeStyle = 'rgba(40,26,10,0.85)';
    var yy = p.y - e * TW * 1.6;
    g.strokeText(p.txt, p.x, yy);
    g.fillStyle = p.color || '#ffd75e';
    g.fillText(p.txt, p.x, yy);
    g.restore();
  }
}

function drawConfetti(fx, time) {
  for (var i = fx.length - 1; i >= 0; i--) {
    var p = fx[i];
    if (p.kind !== 'confetti') continue;
    var age = time - p.born;
    var life2 = 2.6, k2 = age / life2;
    if (k2 >= 1) { fx.splice(i, 1); continue; }
    var px = p.x + p.vx * age * TW + Math.sin(age * 9 + p.seed) * TW * 0.2;
    var py = p.y + p.vy * age * TW + age * age * TW * 3;
    g.save();
    g.translate(px, py);
    g.rotate(age * p.spin);
    g.globalAlpha = 1 - k2;
    g.fillStyle = p.color;
    g.fillRect(-TW * 0.08, -TW * 0.05, TW * 0.16, TW * 0.1);
    g.restore();
  }
}

function squashFor(fx, x, y, time) {
  for (var i = 0; i < fx.length; i++) {
    var p = fx[i];
    if (p.kind === 'squash' && p.x === x && p.y === y) {
      var k = (time - p.born) / 0.25;
      if (k < 1) return 1 + Math.sin(k * Math.PI) * 0.25;
    }
  }
  return 1;
}

/* rustic fence around the whole farm — the diorama frame */
function drawPerimeterFence() {
  var u = TW, W = GAref.W * TW, H = GAref.H * TW;
  var off = u * 0.22;
  var x0 = -off, y0 = -off, x1 = W + off, y1 = H + off;
  /* rails */
  g.fillStyle = '#7d5f36';
  var rh = Math.max(2, u * 0.09);
  g.fillRect(x0, y0 + u * 0.12, x1 - x0, rh);
  g.fillRect(x0, y0 + u * 0.42, x1 - x0, rh);
  g.fillRect(x0, y1 - u * 0.51, x1 - x0, rh);
  g.fillRect(x0, y1 - u * 0.21, x1 - x0, rh);
  g.fillRect(x0 + u * 0.12, y0, rh, y1 - y0);
  g.fillRect(x0 + u * 0.42, y0, rh, y1 - y0);
  g.fillRect(x1 - u * 0.51, y0, rh, y1 - y0);
  g.fillRect(x1 - u * 0.21, y0, rh, y1 - y0);
  g.fillStyle = 'rgba(255,240,210,0.25)';
  g.fillRect(x0, y0 + u * 0.12, x1 - x0, Math.max(1, u * 0.028));
  g.fillRect(x0, y1 - u * 0.51, x1 - x0, Math.max(1, u * 0.028));
  /* posts */
  var step = u * 1.5;
  for (var px = x0; px <= x1 + 1; px += step) {
    fencePost(px, y0 + u * 0.27, u);
    fencePost(px, y1 - u * 0.27, u);
  }
  for (var py = y0 + step; py < y1 - step / 2; py += step) {
    fencePost(x0 + u * 0.27, py, u);
    fencePost(x1 - u * 0.27, py, u);
  }
}
function fencePost(px, py, u) {
  var w = Math.max(3, u * 0.11), h = u * 0.62;
  var pg = g.createLinearGradient(px - w / 2, 0, px + w / 2, 0);
  pg.addColorStop(0, '#5f4423'); pg.addColorStop(0.5, '#7d5f36'); pg.addColorStop(1, '#4e3719');
  g.fillStyle = pg;
  g.fillRect(px - w / 2, py - h / 2, w, h);
  g.fillStyle = '#3d2b12';
  g.beginPath();
  g.moveTo(px - w / 2, py - h / 2); g.lineTo(px, py - h / 2 - u * 0.09); g.lineTo(px + w / 2, py - h / 2);
  g.closePath(); g.fill();
}

/* ================= main draw ================= */

function draw(st, ui) {
  if (!g || !st) return;
  var time = ui.time;
  var calm = !!ui.calm;
  var s = st.season;
  if (groundDirty || groundSeason !== s) renderGrassLayer(s);
  var sig = soilSignature(st);
  if (soilDirty || sig !== soilSig) { renderSoilLayer(st, s); soilSig = sig; }

  /* countryside backdrop fills the letterbox */
  drawCountryside(time, calm);

  g.save();
  if (ui.shake > 0 && !calm) {
    var m = ui.shake * TW * 0.35;
    g.translate((hash(1, 1, Math.floor(time * 40)) - 0.5) * 2 * m,
                (hash(2, 2, Math.floor(time * 40)) - 0.5) * 2 * m);
  }
  /* pre-rendered ground */
  g.drawImage(grassCv, 0, 0);
  g.drawImage(soilCv, 0, 0);

  /* drifting cloud shadows (screen space) */
  drawCloudShadows(time, calm);

  g.translate(OX, OY);

  /* moisture sheen on wet soil */
  for (var y = 0; y < GAref.H; y++) {
    for (var x = 0; x < GAref.W; x++) {
      var t = GAref.tileAt(st, x, y);
      if ((t.plowed || t.crop) && !t.b && t.moisture > 55) {
        var k = (t.moisture - 55) / 45;
        g.fillStyle = 'rgba(24,32,52,' + (k * 0.28) + ')';
        g.fillRect(x * TW + 1, y * TW + 1, TW - 2, TW - 2);
        if (k > 0.6 && !calm) {
          g.fillStyle = 'rgba(190,220,245,' + (0.25 * Math.abs(Math.sin(time * 2 + x + y))) + ')';
          g.fillRect(x * TW + TW * 0.3, y * TW + TW * 0.4, TW * 0.12, TW * 0.05);
        }
      }
      /* pest + wilt tints */
      if (t.pest) {
        g.fillStyle = 'rgba(120,60,20,0.22)';
        g.fillRect(x * TW, y * TW, TW, TW);
      }
      if (t.crop && t.wilt > 0) {
        g.fillStyle = 'rgba(150,140,90,' + (0.14 * t.wilt) + ')';
        g.fillRect(x * TW, y * TW, TW, TW);
      }
    }
  }

  /* crops */
  for (var cy = 0; cy < GAref.H; cy++) {
    for (var cx = 0; cx < GAref.W; cx++) {
      var t2 = GAref.tileAt(st, cx, cy);
      if (t2.crop && !t2.b) {
        var stage = GAref.cropStage(t2);
        var px = cx * TW + TW / 2, py = cy * TW + TW / 2 + TW * 0.08;
        var sq = squashFor(ui.fx, cx, cy, time);
        g.save();
        g.translate(px, py); g.scale(sq, sq); g.translate(-px, -py);
        drawCrop(t2.crop, stage, px, py, TW, time, hash(cx, cy, 11));
        g.restore();
      }
    }
  }

  /* buildings */
  var drawn = {};
  for (var b = 0; b < st.buildings.length; b++) {
    var bd = st.buildings[b];
    if (drawn[bd.id]) continue;
    drawn[bd.id] = true;
    drawBuilding(bd, TW, time);
  }

  /* animals wander near their homes */
  var homes = {};
  for (var h2 = 0; h2 < st.buildings.length; h2++) homes[st.buildings[h2].type] = st.buildings[h2];
  var shown = 0;
  for (var a2 = 0; a2 < st.animals.length && shown < 14; a2++) {
    var an = st.animals[a2];
    var home = homes[GAref.HOME_FOR[an.kind]];
    var ax, ay;
    if (home) { ax = (home.x + home.w / 2) * TW; ay = (home.y + home.h / 2) * TW; }
    else { ax = hash(a2, 3, 0) * GAref.W * TW; ay = hash(a2, 4, 0) * GAref.H * TW; }
    drawAnimal(an.kind, ax, ay, TW, time, an.id * 0.37);
    shown++;
  }

  /* farm fence frames the diorama */
  drawPerimeterFence();

  /* selected tile highlight */
  if (ui.selTile) {
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = Math.max(2, dpr * 2);
    g.setLineDash([dpr * 6, dpr * 4]);
    g.strokeRect(ui.selTile.x * TW + 2, ui.selTile.y * TW + 2, TW - 4, TW - 4);
    g.setLineDash([]);
    g.strokeStyle = 'rgba(201,150,46,0.8)';
    g.lineWidth = Math.max(1.5, dpr * 1.5);
    g.strokeRect(ui.selTile.x * TW + 5, ui.selTile.y * TW + 5, TW - 10, TW - 10);
  }

  if (ui.tornadoFx) drawTornado(ui.tornadoFx, time);
  drawFxKind(ui.fx, time);
  drawPops(ui.fx, time);
  g.restore();

  /* golden-hour grade */
  var grade = g.createLinearGradient(0, 0, cv.width * 0.3, cv.height);
  grade.addColorStop(0, 'rgba(255,190,90,0.07)');
  grade.addColorStop(0.5, 'rgba(255,190,90,0)');
  grade.addColorStop(1, 'rgba(60,40,80,0.05)');
  g.fillStyle = grade;
  g.fillRect(0, 0, cv.width, cv.height);

  /* vignette */
  var vg = g.createRadialGradient(cv.width / 2, cv.height / 2, Math.min(cv.width, cv.height) * 0.42,
                                  cv.width / 2, cv.height / 2, Math.max(cv.width, cv.height) * 0.72);
  vg.addColorStop(0, 'rgba(30,20,8,0)');
  vg.addColorStop(1, 'rgba(30,20,8,0.20)');
  g.fillStyle = vg;
  g.fillRect(0, 0, cv.width, cv.height);

  /* ambient life above the field */
  drawBirds(time, calm);
  drawButterflies(time, calm, st);

  /* screen-space overlays */
  drawWeather(st, time, cv.width, cv.height);
  /* fair bunting across the top while the fair is in town */
  if (st.fair.active) {
    g.save();
    var cols = ['#d63a2f', '#f2ede2', '#2f6fd6', '#e8a93a'];
    var sw = cv.width / 24;
    for (var f3 = 0; f3 < 24; f3++) {
      g.fillStyle = cols[f3 % 4];
      var bx = f3 * sw;
      /* string */
      if (f3 === 0) {
        g.strokeStyle = 'rgba(60,40,20,0.6)'; g.lineWidth = Math.max(1.5, dpr * 1.2);
        g.beginPath(); g.moveTo(0, 2);
        for (var q = 0; q <= 24; q++) g.lineTo(q * sw, 2 + Math.sin(q / 24 * Math.PI) * TW * 0.22);
        g.stroke();
      }
      var sag = Math.sin(f3 / 24 * Math.PI) * TW * 0.22;
      g.beginPath();
      g.moveTo(bx, 2 + sag); g.lineTo(bx + sw, 2 + sag); g.lineTo(bx + sw / 2, 2 + sag + TW * 0.42);
      g.closePath(); g.fill();
    }
    g.restore();
  }
  drawConfetti(ui.fx, time);
}

/* ================= menu art: golden hour ================= */

function drawMenu(canvas) {
  var _cv = cv, _g = g;
  cv = canvas; g = canvas.getContext('2d');
  var w = cv.width, h = cv.height;
  var t = performance.now() / 1000;
  g.save();

  /* sky: peach horizon to soft blue */
  var sky = g.createLinearGradient(0, 0, 0, h * 0.62);
  sky.addColorStop(0, '#7fa8d4'); sky.addColorStop(0.55, '#c9b89a'); sky.addColorStop(1, '#f7c873');
  g.fillStyle = sky; g.fillRect(0, 0, w, h * 0.62 + 1);

  /* sun + glow */
  var sx = w * 0.72, sy = h * 0.44;
  var sg = g.createRadialGradient(sx, sy, 0, sx, sy, h * 0.3);
  sg.addColorStop(0, 'rgba(255,240,200,0.95)'); sg.addColorStop(0.25, 'rgba(255,220,150,0.55)'); sg.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = sg; g.fillRect(sx - h * 0.3, sy - h * 0.3, h * 0.6, h * 0.6);
  g.fillStyle = '#fff3cf';
  g.beginPath(); g.arc(sx, sy, h * 0.045, 0, 7); g.fill();

  /* warm clouds */
  g.fillStyle = 'rgba(255,235,210,0.9)';
  for (var c = 0; c < 4; c++) {
    var cxp = ((hash(c, 71, 97) * w + t * (4 + c * 2)) % (w + 300)) - 150;
    var cyp = h * (0.1 + hash(c, 72, 97) * 0.28);
    var cs = h * (0.03 + hash(c, 73, 97) * 0.025);
    for (var pf = 0; pf < 5; pf++) {
      g.beginPath();
      g.ellipse(cxp + (pf - 2) * cs, cyp + (pf % 2) * cs * 0.3, cs * 1.1, cs * 0.55, 0, 0, 7);
      g.fill();
    }
    g.fillStyle = 'rgba(240,180,140,0.5)';
    g.beginPath(); g.ellipse(cxp, cyp + cs * 0.45, cs * 2.6, cs * 0.3, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,235,210,0.9)';
  }

  /* layered hills */
  var hills = [
    [0.5, '#b89a6e', 0.05], [0.56, '#9a9a62', 0.07], [0.62, '#7d8f52', 0.09]
  ];
  for (var hi = 0; hi < hills.length; hi++) {
    var hb = h * hills[hi][0];
    g.fillStyle = hills[hi][1];
    g.beginPath(); g.moveTo(0, h);
    g.lineTo(0, hb);
    for (var hx = 0; hx <= w; hx += w / 32)
      g.lineTo(hx, hb - Math.abs(Math.sin(hx / w * (5 + hi * 3) + hi * 2)) * h * hills[hi][2]);
    g.lineTo(w, h); g.closePath(); g.fill();
  }

  /* treeline */
  for (var tr = 0; tr < w / (h * 0.035); tr++) {
    var tx = tr * h * 0.035 + hash(tr, 74, 98) * h * 0.02;
    var th = h * (0.035 + hash(tr, 75, 98) * 0.03);
    var ty = h * 0.62;
    g.fillStyle = hash(tr, 76, 98) < 0.5 ? '#4a6a42' : '#557a48';
    g.beginPath();
    g.moveTo(tx, ty - th); g.lineTo(tx - th * 0.35, ty); g.lineTo(tx + th * 0.35, ty);
    g.closePath(); g.fill();
  }

  /* field rows in perspective */
  var fg = g.createLinearGradient(0, h * 0.62, 0, h);
  fg.addColorStop(0, '#8a9a52'); fg.addColorStop(1, '#5f7038');
  g.fillStyle = fg; g.fillRect(0, h * 0.62, w, h * 0.38);
  g.strokeStyle = 'rgba(60,70,30,0.45)'; g.lineWidth = 2;
  for (var r = 0; r < 7; r++) {
    var ry = h * (0.66 + r * 0.05);
    g.beginPath(); g.moveTo(0, ry);
    g.quadraticCurveTo(w / 2, ry + h * 0.015, w, ry); g.stroke();
  }
  /* perspective crop rows converging */
  g.strokeStyle = 'rgba(70,85,35,0.5)'; g.lineWidth = 3;
  for (var pr = -4; pr <= 4; pr++) {
    g.beginPath();
    g.moveTo(w / 2 + pr * w * 0.03, h * 0.62);
    g.lineTo(w / 2 + pr * w * 0.16, h);
    g.stroke();
  }

  /* barn silhouette, right */
  var bx = w * 0.66, bw2 = w * 0.26, by = h * 0.62, bh = h * 0.17;
  g.fillStyle = '#7d2c26';
  g.fillRect(bx, by - bh, bw2, bh);
  g.fillStyle = '#5f211d';
  g.beginPath();
  g.moveTo(bx - w * 0.015, by - bh); g.lineTo(bx + bw2 / 2, by - bh * 1.5); g.lineTo(bx + bw2 + w * 0.015, by - bh);
  g.closePath(); g.fill();
  /* lit windows */
  g.fillStyle = '#ffd97a';
  g.fillRect(bx + bw2 * 0.12, by - bh * 0.72, bw2 * 0.14, bh * 0.2);
  g.fillRect(bx + bw2 * 0.74, by - bh * 0.72, bw2 * 0.14, bh * 0.2);
  g.fillStyle = '#4a1a16';
  g.fillRect(bx + bw2 * 0.4, by - bh * 0.5, bw2 * 0.2, bh * 0.5);
  /* silo */
  g.fillStyle = '#8f959b';
  g.fillRect(bx + bw2 + w * 0.02, by - bh * 1.25, w * 0.05, bh * 1.25);
  g.fillStyle = '#6e747b';
  g.beginPath(); g.ellipse(bx + bw2 + w * 0.045, by - bh * 1.25, w * 0.025, h * 0.012, 0, Math.PI, 0); g.fill();

  /* fence line across mid-ground */
  g.strokeStyle = '#4a3a24'; g.lineWidth = Math.max(3, h * 0.008); g.lineCap = 'round';
  var fyy = h * 0.7;
  g.beginPath(); g.moveTo(0, fyy); g.lineTo(w, fyy - h * 0.02); g.stroke();
  g.beginPath(); g.moveTo(0, fyy + h * 0.025); g.lineTo(w, fyy + h * 0.005); g.stroke();
  for (var fp = 0; fp < w; fp += w / 14) {
    g.fillStyle = '#3d2f1c';
    g.fillRect(fp, fyy - h * 0.03, Math.max(3, w * 0.008), h * 0.07);
  }

  /* foreground wheat, swaying */
  for (var s2 = 0; s2 < 26; s2++) {
    var side = s2 % 2 === 0 ? 0 : 1;
    var wx = side ? w - hash(s2, 77, 99) * w * 0.22 : hash(s2, 77, 99) * w * 0.22;
    var wbase = h * (0.86 + hash(s2, 78, 99) * 0.14);
    var wh = h * (0.1 + hash(s2, 79, 99) * 0.09);
    var wsw = Math.sin(t * 1.5 + s2 * 1.7) * w * 0.008;
    g.strokeStyle = s2 % 3 ? '#c9962e' : '#b3852a'; g.lineWidth = Math.max(2, w * 0.004);
    g.beginPath(); g.moveTo(wx, wbase);
    g.quadraticCurveTo(wx + wsw, wbase - wh * 0.6, wx + wsw * 1.8, wbase - wh);
    g.stroke();
    g.fillStyle = '#e0aa45';
    g.beginPath(); g.ellipse(wx + wsw * 1.8, wbase - wh, w * 0.006, h * 0.012, 0, 0, 7); g.fill();
  }

  /* birds */
  g.strokeStyle = 'rgba(50,50,60,0.8)'; g.lineWidth = 2; g.lineCap = 'round';
  for (var bd = 0; bd < 3; bd++) {
    var bxp = ((hash(bd, 80, 100) * w + t * 18) % (w + 80)) - 40;
    var byp = h * (0.14 + hash(bd, 81, 100) * 0.2);
    var bfl = Math.sin(t * 8 + bd * 3) * 3;
    g.beginPath();
    g.moveTo(bxp - 9, byp + bfl); g.quadraticCurveTo(bxp - 3, byp - 5, bxp, byp);
    g.quadraticCurveTo(bxp + 3, byp - 5, bxp + 9, byp + bfl);
    g.stroke();
  }

  /* floating motes */
  g.fillStyle = 'rgba(255,240,200,0.7)';
  for (var mt = 0; mt < 14; mt++) {
    var mx = (hash(mt, 82, 101) * w + t * 6 * (1 + mt % 3)) % w;
    var my = h * hash(mt, 83, 101) + Math.sin(t * 0.9 + mt) * 8;
    g.beginPath(); g.arc(mx, my % h, 1.6, 0, 7); g.fill();
  }

  /* warm grade + vignette */
  var mg2 = g.createLinearGradient(0, 0, 0, h);
  mg2.addColorStop(0, 'rgba(255,180,90,0)'); mg2.addColorStop(1, 'rgba(120,70,20,0.18)');
  g.fillStyle = mg2; g.fillRect(0, 0, w, h);
  g.restore();
  cv = _cv; g = _g;
}

root.R = {
  init: init, resize: resize, draw: draw, drawMenu: drawMenu,
  tileSize: tileSize, origin: origin
};

})(typeof window !== 'undefined' ? window : globalThis);
