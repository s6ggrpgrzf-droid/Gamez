/* Golden Acre — render.js
 * Canvas renderer. Sim code never touches this; it only reads state.
 * Everything is procedural (no image assets): hand-drawn soil, crops,
 * buildings, animals, weather. DPR capped at 2.
 */
(function (root) {
'use strict';

var cv = null, g = null, TW = 0, OX = 0, OY = 0, dpr = 1;
var GAref = null;

function init(canvas) {
  cv = canvas; g = cv.getContext('2d');
  GAref = root.GA;
}
function resize(cssW, cssH) {
  dpr = Math.min(2, root.devicePixelRatio || 1);
  cv.width = Math.round(cssW * dpr);
  cv.height = Math.round(cssH * dpr);
  /* letterbox the 18x12 grid: fit inside, center on countryside backdrop */
  TW = Math.min(cv.width / GAref.W, cv.height / GAref.H);
  OX = (cv.width - TW * GAref.W) / 2;
  OY = (cv.height - TW * GAref.H) / 2;
}
function tileSize() { return TW; }
function origin() { return { x: OX, y: OY }; }

/* deterministic per-tile hash 0..1 */
function hash(x, y, s) {
  var h = (x * 374761393 + y * 668265263 + (s || 0) * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

var GRASS = [
  ['#82b25e', '#77a856'], /* spring */
  ['#a3a556', '#98a04e'], /* summer, drier */
  ['#b39a55', '#a78f4e'], /* fall */
  ['#cfc8b4', '#c2bba6']  /* winter */
];
var GRASS_DK = ['#6b9847', '#878a42', '#947c40', '#aaa38d'];

function shade(hex, amt) {
  var n = parseInt(hex.slice(1), 16);
  var r = Math.max(0, Math.min(255, (n >> 16) + amt));
  var gg = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  var b = Math.max(0, Math.min(255, (n & 255) + amt));
  return 'rgb(' + r + ',' + gg + ',' + b + ')';
}

function drawTileBase(st, x, y, time) {
  var t = GAref.tileAt(st, x, y);
  var s = st.season;
  var px = x * TW, py = y * TW;
  var hh = hash(x, y, 0);
  g.fillStyle = hh < 0.5 ? GRASS[s][0] : GRASS[s][1];
  g.fillRect(px, py, TW + 0.5, TW + 0.5);
  if (t.b || t.plowed || t.crop) {
    /* plowed soil */
    if (t.plowed || t.crop) {
      var dry = 1 - t.moisture / 100;
      var base = 46 + dry * 34;
      g.fillStyle = 'rgb(' + Math.round(base + 22) + ',' + Math.round(base) + ',' + Math.round(base - 14) + ')';
      g.fillRect(px + 1, py + 1, TW - 2, TW - 2);
      /* furrows */
      g.strokeStyle = 'rgba(40,24,12,0.45)';
      g.lineWidth = Math.max(1, TW * 0.045);
      g.beginPath();
      for (var r = 1; r <= 3; r++) {
        var fy = py + (TW * r) / 4 + (hash(x, y, r) - 0.5) * TW * 0.08;
        g.moveTo(px + 2, fy);
        g.quadraticCurveTo(px + TW / 2, fy + (hash(x, y, r + 9) - 0.5) * TW * 0.12, px + TW - 2, fy);
      }
      g.stroke();
    }
  } else {
    /* grass tufts + pebbles */
    if (hh > 0.55) {
      g.strokeStyle = GRASS_DK[s];
      g.lineWidth = Math.max(1, TW * 0.05);
      var gx = px + hash(x, y, 3) * TW, gy = py + hash(x, y, 4) * TW;
      g.beginPath();
      g.moveTo(gx, gy); g.lineTo(gx + TW * 0.06, gy - TW * 0.18);
      g.moveTo(gx + TW * 0.12, gy); g.lineTo(gx + TW * 0.14, gy - TW * 0.15);
      g.stroke();
    }
    if (hh < 0.12) {
      g.fillStyle = 'rgba(120,110,95,0.7)';
      g.beginPath();
      g.arc(px + hash(x, y, 5) * TW, py + hash(x, y, 6) * TW, TW * 0.06, 0, 7);
      g.fill();
    }
  }
  /* pest tint */
  if (t.pest) {
    g.fillStyle = 'rgba(120,60,20,0.25)';
    g.fillRect(px, py, TW, TW);
  }
  /* wilt tint */
  if (t.crop && t.wilt > 0) {
    g.fillStyle = 'rgba(150,140,90,' + (0.15 * t.wilt) + ')';
    g.fillRect(px, py, TW, TW);
  }
}

/* crop art: 4 stages. cx, cy = tile center in device px, u = TW */
function drawCrop(id, stage, cx, cy, u, time, wob) {
  var sway = Math.sin(time * 1.6 + wob * 9) * u * 0.02;
  g.save();
  g.translate(cx + sway, cy);
  if (id === 'orange') {
    /* tree at all stages; bigger + fruit at mature */
    var th = u * (0.35 + stage * 0.22);
    g.strokeStyle = '#6b4a2a'; g.lineWidth = Math.max(1.5, u * 0.07);
    g.beginPath(); g.moveTo(0, u * 0.32); g.lineTo(0, u * 0.32 - th); g.stroke();
    var cr = u * (0.22 + stage * 0.1);
    g.fillStyle = stage >= 2 ? '#4d7d3a' : '#6a9a4e';
    g.beginPath(); g.arc(0, u * 0.32 - th, cr, 0, 7); g.fill();
    g.fillStyle = shade('#4d7d3a', -18);
    g.beginPath(); g.arc(-cr * 0.3, u * 0.32 - th - cr * 0.25, cr * 0.55, 0, 7); g.fill();
    if (stage >= 3) {
      g.fillStyle = '#e07b2a';
      for (var i = 0; i < 6; i++) {
        var a = wob * 6.28 + i * 1.05;
        g.beginPath();
        g.arc(Math.cos(a) * cr * 0.62, u * 0.32 - th + Math.sin(a) * cr * 0.62, u * 0.055, 0, 7);
        g.fill();
      }
    }
  } else if (stage === 0) {
    g.strokeStyle = '#4d7d3a'; g.lineWidth = Math.max(1.5, u * 0.06);
    g.beginPath();
    g.moveTo(0, u * 0.28); g.lineTo(-u * 0.1, u * 0.08);
    g.moveTo(0, u * 0.28); g.lineTo(u * 0.1, u * 0.08);
    g.stroke();
    g.fillStyle = '#5d9440';
    g.beginPath(); g.ellipse(-u * 0.12, u * 0.06, u * 0.07, u * 0.045, -0.5, 0, 7); g.fill();
    g.beginPath(); g.ellipse(u * 0.12, u * 0.06, u * 0.07, u * 0.045, 0.5, 0, 7); g.fill();
  } else {
    var hgt = u * (0.3 + stage * 0.16);
    if (id === 'corn') hgt = u * (0.4 + stage * 0.22);
    if (id === 'wheat') {
      g.strokeStyle = stage >= 3 ? '#c99a3a' : '#6a9a4e';
      g.lineWidth = Math.max(1.5, u * 0.05);
      var nStalks = stage >= 2 ? 5 : 3;
      for (var s2 = 0; s2 < nStalks; s2++) {
        var bx = (s2 - (nStalks - 1) / 2) * u * 0.13;
        g.beginPath(); g.moveTo(bx, u * 0.3); g.lineTo(bx + sway * 0.5, u * 0.3 - hgt); g.stroke();
        if (stage >= 2) {
          g.fillStyle = stage >= 3 ? '#d9a441' : '#7fae4c';
          g.beginPath(); g.ellipse(bx + sway * 0.5, u * 0.3 - hgt, u * 0.075, u * 0.13, 0, 0, 7); g.fill();
          if (stage >= 3) {
            g.fillStyle = '#f0c85e';
            g.beginPath(); g.ellipse(bx + sway * 0.5 - u * 0.02, u * 0.3 - hgt - u * 0.03, u * 0.035, u * 0.06, 0, 0, 7); g.fill();
          }
        }
      }
    } else if (id === 'corn') {
      g.strokeStyle = '#4d7d3a'; g.lineWidth = Math.max(2, u * 0.08);
      g.beginPath(); g.moveTo(0, u * 0.32); g.lineTo(0, u * 0.32 - hgt); g.stroke();
      g.fillStyle = '#5d9440';
      for (var l = 0; l < stage + 1; l++) {
        var ly = u * 0.32 - hgt * (0.3 + l * 0.22);
        g.beginPath(); g.ellipse(-u * 0.14, ly, u * 0.13, u * 0.05, -0.4, 0, 7); g.fill();
        g.beginPath(); g.ellipse(u * 0.14, ly, u * 0.13, u * 0.05, 0.4, 0, 7); g.fill();
      }
      if (stage >= 3) {
        g.fillStyle = '#e8c53a';
        g.beginPath(); g.ellipse(-u * 0.1, u * 0.02, u * 0.07, u * 0.13, 0.25, 0, 7); g.fill();
        g.beginPath(); g.ellipse(u * 0.1, u * 0.02, u * 0.07, u * 0.13, -0.25, 0, 7); g.fill();
      }
    } else if (id === 'cotton') {
      g.fillStyle = stage >= 3 ? '#f2ede2' : '#7fae4c';
      for (var c2 = 0; c2 < 3; c2++) {
        var px2 = (c2 - 1) * u * 0.2;
        g.strokeStyle = '#4d7d3a'; g.lineWidth = Math.max(1.5, u * 0.05);
        g.beginPath(); g.moveTo(px2, u * 0.3); g.lineTo(px2, u * 0.3 - hgt * 0.8); g.stroke();
        g.beginPath(); g.arc(px2, u * 0.3 - hgt * 0.8, u * (0.07 + stage * 0.035), 0, 7); g.fill();
      }
      if (stage >= 3) {
        g.fillStyle = '#ffffff';
        for (var c3 = 0; c3 < 3; c3++) {
          var qx = (c3 - 1) * u * 0.2;
          g.beginPath(); g.arc(qx, u * 0.3 - hgt * 0.8, u * 0.045, 0, 7); g.fill();
        }
      }
    } else { /* soy, potato: bushy */
      g.fillStyle = stage >= 3 ? (id === 'potato' ? '#8a6d3f' : '#6f9a3f') : '#7fae4c';
      var n = 4 + stage * 2;
      for (var b2 = 0; b2 < n; b2++) {
        var ang = (b2 / n) * 6.283 + wob;
        var rr = u * (0.1 + stage * 0.07);
        g.beginPath();
        g.ellipse(Math.cos(ang) * rr, u * 0.22 - Math.abs(Math.sin(ang)) * hgt * 0.5,
                  u * 0.09, u * 0.06, ang, 0, 7);
        g.fill();
      }
      if (id === 'potato' && stage >= 3) {
        g.fillStyle = '#e8e4da';
        g.beginPath(); g.arc(0, u * 0.05, u * 0.05, 0, 7); g.fill();
      }
    }
  }
  g.restore();
}

function drawBuilding(b, u, time) {
  var px = b.x * TW, py = b.y * TW;
  var wpx = b.w * TW, hpx = b.h * TW;
  var cx = px + wpx / 2;
  g.save();
  /* soft shadow */
  g.fillStyle = 'rgba(0,0,0,0.15)';
  g.beginPath(); g.ellipse(cx, py + hpx - u * 0.06, wpx * 0.42, u * 0.1, 0, 0, 7); g.fill();
  if (b.type === 'farmhouse') {
    g.fillStyle = '#f0e8d8';
    g.fillRect(px + u * 0.15, py + hpx * 0.32, wpx - u * 0.3, hpx * 0.6);
    g.fillStyle = '#8a6f52';
    g.beginPath();
    g.moveTo(px + u * 0.05, py + hpx * 0.34);
    g.lineTo(cx, py + hpx * 0.02);
    g.lineTo(px + wpx - u * 0.05, py + hpx * 0.34);
    g.closePath(); g.fill();
    g.fillStyle = '#5a4632';
    g.fillRect(cx - u * 0.12, py + hpx * 0.58, u * 0.24, hpx * 0.34);
    g.fillStyle = '#ffe9a8';
    g.fillRect(px + u * 0.32, py + hpx * 0.48, u * 0.2, u * 0.2);
    g.fillRect(px + wpx - u * 0.52, py + hpx * 0.48, u * 0.2, u * 0.2);
  } else if (b.type === 'barn') {
    g.fillStyle = '#b04038';
    g.fillRect(px + u * 0.12, py + hpx * 0.3, wpx - u * 0.24, hpx * 0.62);
    g.fillStyle = '#f0e8d8';
    g.fillRect(px + u * 0.12, py + hpx * 0.52, wpx - u * 0.24, u * 0.09);
    g.fillStyle = '#7d2c26';
    g.beginPath();
    g.moveTo(px + u * 0.04, py + hpx * 0.32);
    g.lineTo(cx, py + hpx * 0.02);
    g.lineTo(px + wpx - u * 0.04, py + hpx * 0.32);
    g.closePath(); g.fill();
    g.fillStyle = '#4a2019';
    g.fillRect(cx - u * 0.2, py + hpx * 0.6, u * 0.4, hpx * 0.32);
  } else if (b.type === 'silo') {
    g.fillStyle = '#b9bec4';
    g.fillRect(px + u * 0.22, py + u * 0.3, u * 0.56, hpx - u * 0.36);
    g.fillStyle = '#8f959b';
    g.beginPath();
    g.ellipse(cx, py + u * 0.3, u * 0.28, u * 0.14, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(90,95,100,0.6)'; g.lineWidth = Math.max(1, u * 0.03);
    for (var i2 = 1; i2 <= 3; i2++) {
      g.beginPath(); g.moveTo(px + u * 0.24, py + u * 0.3 + i2 * u * 0.22);
      g.lineTo(px + u * 0.76, py + u * 0.3 + i2 * u * 0.22); g.stroke();
    }
  } else if (b.type === 'coop') {
    g.fillStyle = '#a8763e';
    g.fillRect(px + u * 0.14, py + hpx * 0.42, wpx - u * 0.28, hpx * 0.5);
    g.fillStyle = '#7d5626';
    g.beginPath();
    g.moveTo(px + u * 0.06, py + hpx * 0.44);
    g.lineTo(cx, py + hpx * 0.12);
    g.lineTo(px + wpx - u * 0.06, py + hpx * 0.44);
    g.closePath(); g.fill();
    g.fillStyle = '#3d2a12';
    g.beginPath(); g.arc(cx, py + hpx * 0.66, u * 0.12, 0, 7); g.fill();
  } else if (b.type === 'pigpen') {
    g.strokeStyle = '#7d5a34'; g.lineWidth = Math.max(2, u * 0.07);
    g.strokeRect(px + u * 0.08, py + u * 0.08, wpx - u * 0.16, hpx - u * 0.16);
    g.strokeStyle = '#8f6c40';
    for (var f2 = 0; f2 < 3; f2++) {
      g.beginPath();
      g.moveTo(px + u * 0.08, py + u * 0.08 + (f2 + 1) * (hpx - u * 0.16) / 4);
      g.lineTo(px + wpx - u * 0.08, py + u * 0.08 + (f2 + 1) * (hpx - u * 0.16) / 4);
      g.stroke();
    }
    g.fillStyle = '#c9a06a';
    g.beginPath(); g.ellipse(cx, py + hpx / 2, u * 0.28, u * 0.18, 0, 0, 7); g.fill();
  }
  g.restore();
}

function drawAnimal(kind, x, y, u, time, seedv) {
  var wx = x + Math.sin(time * 0.5 + seedv * 9) * u * 0.35;
  var wy = y + Math.cos(time * 0.37 + seedv * 7) * u * 0.3;
  g.save();
  g.translate(wx, wy);
  if (kind === 'cow') {
    g.fillStyle = '#f2efe8';
    g.beginPath(); g.ellipse(0, 0, u * 0.3, u * 0.2, 0, 0, 7); g.fill();
    g.fillStyle = '#3a3a3a';
    g.beginPath(); g.ellipse(-u * 0.08, -u * 0.03, u * 0.1, u * 0.07, 0.4, 0, 7); g.fill();
    g.beginPath(); g.ellipse(u * 0.12, u * 0.06, u * 0.07, u * 0.05, -0.3, 0, 7); g.fill();
    g.fillStyle = '#f2efe8';
    g.beginPath(); g.arc(u * 0.3, -u * 0.1, u * 0.14, 0, 7); g.fill();
    g.fillStyle = '#d8a0a0';
    g.beginPath(); g.ellipse(u * 0.38, -u * 0.06, u * 0.06, u * 0.04, 0, 0, 7); g.fill();
  } else if (kind === 'chicken') {
    g.fillStyle = '#f5f2ea';
    g.beginPath(); g.ellipse(0, 0, u * 0.14, u * 0.11, 0, 0, 7); g.fill();
    g.beginPath(); g.arc(u * 0.1, -u * 0.1, u * 0.08, 0, 7); g.fill();
    g.fillStyle = '#d63a2f';
    g.beginPath(); g.arc(u * 0.1, -u * 0.17, u * 0.035, 0, 7); g.fill();
    g.fillStyle = '#e07b2a';
    g.beginPath(); g.moveTo(u * 0.17, -u * 0.1); g.lineTo(u * 0.22, -u * 0.08); g.lineTo(u * 0.17, -u * 0.06); g.closePath(); g.fill();
  } else { /* pig */
    g.fillStyle = '#e8a0a8';
    g.beginPath(); g.ellipse(0, 0, u * 0.22, u * 0.15, 0, 0, 7); g.fill();
    g.beginPath(); g.arc(u * 0.2, -u * 0.05, u * 0.1, 0, 7); g.fill();
    g.fillStyle = '#d67f88';
    g.beginPath(); g.ellipse(u * 0.26, -u * 0.03, u * 0.045, u * 0.035, 0, 0, 7); g.fill();
  }
  g.restore();
}

/* weather overlays */
function drawWeather(st, time, wpx, hpx) {
  var cur = st.weather.cur;
  if (cur === 'rain' || cur === 'storm') {
    if (cur === 'storm') {
      g.fillStyle = 'rgba(40,45,60,0.28)';
      g.fillRect(0, 0, wpx, hpx);
      if (Math.sin(time * 0.9) > 0.985) {
        g.fillStyle = 'rgba(255,255,230,0.5)';
        g.fillRect(0, 0, wpx, hpx);
      }
    }
    g.strokeStyle = cur === 'storm' ? 'rgba(170,190,220,0.42)' : 'rgba(140,170,210,0.34)';
    g.lineWidth = Math.max(1, dpr * 1);
    g.beginPath();
    for (var i = 0; i < 46; i++) {
      var rx = hash(i, 7, Math.floor(time * 3)) * wpx;
      var ry = hash(i, 13, Math.floor(time * 3)) * hpx;
      g.moveTo(rx, ry); g.lineTo(rx - dpr * 4, ry + dpr * 8);
    }
    g.stroke();
  } else if (cur === 'cloudy') {
    g.fillStyle = 'rgba(120,125,135,0.12)';
    g.fillRect(0, 0, wpx, hpx);
  }
  if (st.season === 3) { /* light snow dusting */
    g.fillStyle = 'rgba(255,255,255,0.16)';
    for (var s2 = 0; s2 < 40; s2++) {
      var sx = hash(s2, 21, Math.floor(time * 2)) * wpx;
      var sy = (hash(s2, 22, 0) * hpx + time * 12 * dpr) % hpx;
      g.fillRect(sx, sy, dpr * 2, dpr * 2);
    }
  }
}

function drawTornado(fx, wpx, time) {
  var p = fx.t; /* 0..1 */
  var tx = fx.x * TW + TW * 1.5;
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

/* particles in grid space: pops (floating text). Confetti lives in screen space. */
function drawPops(fx, time) {
  for (var i = fx.length - 1; i >= 0; i--) {
    var p = fx[i];
    if (p.kind === 'squash') {
      if (time - p.born > 0.25) fx.splice(i, 1);
      continue;
    }
    if (p.kind !== 'pop') continue;
    var age = time - p.born;
    var life = 1.4, k = age / life;
    if (k >= 1) { fx.splice(i, 1); continue; }
    var e = 1 - Math.pow(1 - k, 3);
    g.save();
    g.globalAlpha = 1 - k * k;
    g.font = '700 ' + Math.round(TW * 0.62) + 'px system-ui, sans-serif';
    g.textAlign = 'center';
    g.lineWidth = 3; g.strokeStyle = 'rgba(40,26,10,0.8)';
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

/* main draw */
function draw(st, ui) {
  if (!g || !st) return;
  var time = ui.time;
  /* countryside backdrop */
  g.fillStyle = '#2c3f24';
  g.fillRect(0, 0, cv.width, cv.height);
  g.save();
  /* screen shake */
  if (ui.shake > 0 && !ui.calm) {
    var m = ui.shake * TW * 0.35;
    g.translate((hash(1, 1, Math.floor(time * 40)) - 0.5) * 2 * m,
                (hash(2, 2, Math.floor(time * 40)) - 0.5) * 2 * m);
  }
  g.translate(OX, OY);
  /* tiles */
  for (var y = 0; y < GAref.H; y++) {
    for (var x = 0; x < GAref.W; x++) {
      drawTileBase(st, x, y, time);
      var t = GAref.tileAt(st, x, y);
      if (t.crop) {
        var stage = GAref.cropStage(t);
        var cx = x * TW + TW / 2, cy = y * TW + TW / 2 + TW * 0.08;
        var sq = squashFor(ui.fx, x, y, time);
        g.save();
        g.translate(cx, cy); g.scale(sq, sq); g.translate(-cx, -cy);
        drawCrop(t.crop, stage, cx, cy, TW, time, hash(x, y, 11));
        g.restore();
      }
    }
  }
  /* buildings (drawn after crops so they sit on top) */
  var drawn = {};
  for (var b = 0; b < st.buildings.length; b++) {
    var bd = st.buildings[b];
    var key = bd.id;
    if (drawn[key]) continue;
    drawn[key] = true;
    drawBuilding(bd, TW, time);
  }
  /* animals wander near their homes */
  var homes = {};
  for (var h2 = 0; h2 < st.buildings.length; h2++) {
    var hb = st.buildings[h2];
    homes[hb.type] = hb;
  }
  var shown = 0;
  for (var a2 = 0; a2 < st.animals.length && shown < 14; a2++) {
    var an = st.animals[a2];
    var home = homes[GAref.HOME_FOR[an.kind]];
    var ax, ay;
    if (home) { ax = (home.x + home.w / 2) * TW; ay = (home.y + home.h / 2) * TW; }
    else { ax = (hash(a2, 3, 0) * GAref.W) * TW; ay = (hash(a2, 4, 0) * GAref.H) * TW; }
    drawAnimal(an.kind, ax, ay, TW, time, an.id * 0.37);
    shown++;
  }
  /* selected tile highlight */
  if (ui.selTile) {
    g.strokeStyle = '#fff';
    g.lineWidth = Math.max(2, dpr * 2);
    g.setLineDash([dpr * 6, dpr * 4]);
    g.strokeRect(ui.selTile.x * TW + 2, ui.selTile.y * TW + 2, TW - 4, TW - 4);
    g.setLineDash([]);
  }
  if (ui.tornadoFx) drawTornado(ui.tornadoFx, time);
  drawPops(ui.fx, time);
  /* hedgerow border around the farm */
  g.strokeStyle = '#1f2e1a';
  g.lineWidth = Math.max(4, TW * 0.22);
  g.strokeRect(0, 0, TW * GAref.W, TW * GAref.H);
  g.strokeStyle = 'rgba(214,164,65,0.55)';
  g.lineWidth = Math.max(1.5, dpr * 1.5);
  g.strokeRect(TW * 0.14, TW * 0.14, TW * GAref.W - TW * 0.28, TW * GAref.H - TW * 0.28);
  g.restore();
  /* ---- screen-space overlays ---- */
  drawWeather(st, time, cv.width, cv.height);
  /* fair bunting across the top while the fair is in town */
  if (st.fair.active) {
    g.save();
    var cols = ['#d63a2f', '#f2ede2', '#2f6fd6', '#e8a93a'];
    for (var f3 = 0; f3 < 24; f3++) {
      g.fillStyle = cols[f3 % 4];
      var bx = (f3 / 24) * cv.width;
      g.beginPath();
      g.moveTo(bx, 0); g.lineTo(bx + cv.width / 24, 0); g.lineTo(bx + cv.width / 48, TW * 0.5);
      g.closePath(); g.fill();
    }
    g.restore();
  }
  drawConfetti(ui.fx, time);
}

/* menu backdrop art — draws on the passed canvas, restores game context after */
function drawMenu(canvas) {
  var _cv = cv, _g = g;
  cv = canvas; g = canvas.getContext('2d');
  var w = cv.width, h = cv.height;
  var t = performance.now() / 1000;
  g.save();
  var sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#a8d0e8'); sky.addColorStop(0.6, '#d8e8d0'); sky.addColorStop(1, '#8ab86a');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = '#f5e6b8';
  g.beginPath(); g.arc(w * 0.8, h * 0.18, h * 0.07, 0, 7); g.fill();
  g.fillStyle = '#7fae5a';
  g.fillRect(0, h * 0.62, w, h * 0.38);
  g.strokeStyle = 'rgba(60,80,40,0.5)'; g.lineWidth = 2;
  for (var r = 0; r < 5; r++) {
    g.beginPath(); g.moveTo(0, h * (0.68 + r * 0.06));
    g.quadraticCurveTo(w / 2, h * (0.68 + r * 0.06) + 8, w, h * (0.68 + r * 0.06)); g.stroke();
  }
  /* barn silhouette */
  var bx = w * 0.14, by = h * 0.38, bw = w * 0.24, bh = h * 0.24;
  g.fillStyle = '#a83a32';
  g.fillRect(bx, by, bw, bh);
  g.fillStyle = '#7d2c26';
  g.beginPath(); g.moveTo(bx - 8, by); g.lineTo(bx + bw / 2, by - bh * 0.5); g.lineTo(bx + bw + 8, by); g.closePath(); g.fill();
  g.fillStyle = '#5a4632';
  g.fillRect(bx + bw * 0.38, by + bh * 0.45, bw * 0.24, bh * 0.55);
  /* wheat stalks swaying */
  g.strokeStyle = '#c99a3a'; g.lineWidth = 3;
  for (var s3 = 0; s3 < 14; s3++) {
    var sx = w * 0.55 + s3 * w * 0.03;
    var sw = Math.sin(t * 1.4 + s3) * 6;
    g.beginPath(); g.moveTo(sx, h * 0.98); g.quadraticCurveTo(sx + sw, h * 0.82, sx + sw * 1.6, h * 0.68); g.stroke();
    g.fillStyle = '#d9a441';
    g.beginPath(); g.ellipse(sx + sw * 1.6, h * 0.66, 5, 9, 0, 0, 7); g.fill();
  }
  g.restore();
  cv = _cv; g = _g;
}

root.R = {
  init: init, resize: resize, draw: draw, drawMenu: drawMenu,
  tileSize: tileSize, origin: origin
};

})(typeof window !== 'undefined' ? window : globalThis);
