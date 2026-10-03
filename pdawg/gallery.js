/* Pdawg Puzzles — procedural starter gallery.
 * Ten hand-built canvas scenes, seeded & deterministic. Zero licensing risk,
 * zero downloads, fully offline. Each `make(ctx, W, H, rng)` paints one image.
 */
(function () {
'use strict';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function vgrad(ctx, W, H, stops) {
  var g = ctx.createLinearGradient(0, 0, 0, H);
  for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function grain(ctx, W, H, rng, n, alpha) {
  n = n || 3500; alpha = alpha || 0.045;
  for (var i = 0; i < n; i++) {
    var v = rng() < 0.5 ? 0 : 255;
    ctx.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (alpha * (0.3 + rng() * 0.7)).toFixed(3) + ')';
    ctx.fillRect(rng() * W, rng() * H, 1 + rng() * 2, 1 + rng() * 2);
  }
}

function ridge(ctx, W, H, baseY, amp, color, rng) {
  var p1 = rng() * 6.28, p2 = rng() * 6.28;
  var f1 = 2 + ((rng() * 3) | 0), f2 = 5 + ((rng() * 4) | 0);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, baseY);
  for (var i = 0; i <= 48; i++) {
    var x = (W * i) / 48;
    var y = baseY - (Math.sin((i / 48) * 6.28 * f1 + p1) * 0.6 + Math.sin((i / 48) * 6.28 * f2 + p2) * 0.4) * amp - amp * 0.25;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

function stars(ctx, W, H, rng, n, maxY) {
  maxY = maxY === undefined ? H : maxY;
  for (var i = 0; i < n; i++) {
    var r = rng();
    var s = r < 0.85 ? 1 : r < 0.97 ? 2 : 3;
    ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + rng() * 0.65).toFixed(2) + ')';
    ctx.fillRect(rng() * W, rng() * maxY, s, s);
  }
}

function birds(ctx, rng, n, x0, y0, spread, color, size) {
  ctx.strokeStyle = color || 'rgba(30,20,40,0.7)';
  ctx.lineWidth = Math.max(2, size || 3);
  for (var i = 0; i < n; i++) {
    var x = x0 + (rng() - 0.5) * spread, y = y0 + (rng() - 0.5) * spread * 0.4;
    var w = (size || 3) * (2 + rng() * 3);
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x - w / 2, y - w / 2, x, y);
    ctx.quadraticCurveTo(x + w / 2, y - w / 2, x + w, y);
    ctx.stroke();
  }
}

function clouds(ctx, W, H, rng, n, yMax, color) {
  ctx.fillStyle = color || 'rgba(255,255,255,0.85)';
  for (var i = 0; i < n; i++) {
    var x = rng() * W, y = rng() * yMax, s = 30 + rng() * 70;
    for (var j = 0; j < 5; j++) {
      ctx.beginPath();
      ctx.ellipse(x + (rng() - 0.5) * s * 2, y + (rng() - 0.5) * s * 0.5, s * (0.4 + rng() * 0.4), s * (0.28 + rng() * 0.2), 0, 0, 6.29);
      ctx.fill();
    }
  }
}

function tri(ctx, x1, y1, x2, y2, x3, y3, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3);
  ctx.closePath(); ctx.fill();
}

/* ---------------- scenes ---------------- */

function alpineSunset(ctx, W, H, rng) {
  vgrad(ctx, W, H, [[0, '#241a4e'], [0.45, '#a83e6c'], [0.68, '#ff8f52'], [0.8, '#ffc46b'], [1, '#7a3b5c']]);
  var sx = W * 0.62, sy = H * 0.60;
  var glow = ctx.createRadialGradient(sx, sy, 10, sx, sy, 220);
  glow.addColorStop(0, 'rgba(255,240,200,0.95)');
  glow.addColorStop(0.25, 'rgba(255,200,120,0.55)');
  glow.addColorStop(1, 'rgba(255,180,100,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff3d6';
  ctx.beginPath(); ctx.arc(sx, sy, 46, 0, 6.29); ctx.fill();
  ridge(ctx, W, H, H * 0.52, 90, '#5b2f5e', rng);
  ridge(ctx, W, H, H * 0.62, 70, '#3c2350', rng);
  // lake
  var lg = ctx.createLinearGradient(0, H * 0.68, 0, H);
  lg.addColorStop(0, '#ff9a5a'); lg.addColorStop(0.4, '#b34a6b'); lg.addColorStop(1, '#2b1a4d');
  ctx.fillStyle = lg; ctx.fillRect(0, H * 0.68, W, H * 0.32);
  // sun reflection
  for (var i = 0; i < 26; i++) {
    var ry = H * 0.70 + rng() * H * 0.26;
    var rw = 20 + rng() * 90 * (1 - (ry - H * 0.7) / (H * 0.3));
    ctx.fillStyle = 'rgba(255,220,160,' + (0.10 + rng() * 0.25).toFixed(2) + ')';
    ctx.fillRect(sx - rw / 2 + (rng() - 0.5) * 30, ry, rw, 3 + rng() * 4);
  }
  birds(ctx, rng, 7, W * 0.3, H * 0.3, 260, 'rgba(30,18,40,0.8)', 3);
  grain(ctx, W, H, rng);
}

function starryNight(ctx, W, H, rng) {
  vgrad(ctx, W, H, [[0, '#03040c'], [0.6, '#0a1230'], [1, '#16244d']]);
  stars(ctx, W, H, rng, 420, H * 0.75);
  var mx = W * 0.76, my = H * 0.22;
  var glow = ctx.createRadialGradient(mx, my, 20, mx, my, 200);
  glow.addColorStop(0, 'rgba(220,230,255,0.5)');
  glow.addColorStop(1, 'rgba(220,230,255,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e8ecf7';
  ctx.beginPath(); ctx.arc(mx, my, 58, 0, 6.29); ctx.fill();
  ctx.fillStyle = 'rgba(160,175,205,0.5)';
  for (var i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.arc(mx + (rng() - 0.5) * 70, my + (rng() - 0.5) * 70, 6 + rng() * 12, 0, 6.29);
    ctx.fill();
  }
  ridge(ctx, W, H, H * 0.72, 110, '#0a0f22', rng);
  // pines
  ctx.fillStyle = '#060a18';
  for (var t = 0; t < 26; t++) {
    var x = rng() * W, base = H * 0.78 + rng() * H * 0.2, s = 26 + rng() * 44;
    for (var k = 0; k < 3; k++) {
      var w2 = s * (1 - k * 0.28), y2 = base - k * s * 0.42;
      tri(ctx, x - w2 / 2, y2, x + w2 / 2, y2, x, y2 - s * 0.55, '#060a18');
    }
  }
  // mist
  for (var mI = 0; mI < 5; mI++) {
    ctx.fillStyle = 'rgba(150,170,220,' + (0.04 + rng() * 0.05).toFixed(2) + ')';
    ctx.fillRect(0, H * (0.66 + rng() * 0.2), W, 14 + rng() * 26);
  }
  grain(ctx, W, H, rng);
}

function oceanWave(ctx, W, H, rng) {
  vgrad(ctx, W, H, [[0, '#6ec3e8'], [0.5, '#cdeefb'], [0.62, '#f7e9c4'], [1, '#f7e9c4']]);
  ctx.fillStyle = '#fff6da';
  ctx.beginPath(); ctx.arc(W * 0.24, H * 0.34, 52, 0, 6.29); ctx.fill();
  var glow = ctx.createRadialGradient(W * 0.24, H * 0.34, 20, W * 0.24, H * 0.34, 200);
  glow.addColorStop(0, 'rgba(255,250,220,0.6)'); glow.addColorStop(1, 'rgba(255,250,220,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H * 0.7);
  clouds(ctx, W, H, rng, 4, H * 0.3);
  // sea
  var sg = ctx.createLinearGradient(0, H * 0.55, 0, H * 0.92);
  sg.addColorStop(0, '#2b8ab5'); sg.addColorStop(0.6, '#166a94'); sg.addColorStop(1, '#0b3f61');
  ctx.fillStyle = sg; ctx.fillRect(0, H * 0.55, W, H * 0.37);
  for (var i = 0; i < 16; i++) {
    var wy = H * 0.57 + (i / 16) * H * 0.32;
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.10 + rng() * 0.22).toFixed(2) + ')';
    ctx.lineWidth = 2 + rng() * 5;
    ctx.beginPath();
    for (var x = 0; x <= W; x += 24) {
      var y = wy + Math.sin(x * 0.02 + i * 1.3) * (6 + i * 0.8);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // foam + beach
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  for (var fx = 0; fx <= W; fx += 24) {
    var fy = H * 0.90 + Math.sin(fx * 0.015 + 2) * 14;
    if (fx === 0) ctx.moveTo(fx, fy); else ctx.lineTo(fx, fy);
  }
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  var bg = ctx.createLinearGradient(0, H * 0.9, 0, H);
  bg.addColorStop(0, '#f2dfae'); bg.addColorStop(1, '#dfc084');
  ctx.fillStyle = bg; ctx.fillRect(0, H * 0.92, W, H * 0.08);
  // sailboat
  var bx = W * 0.66, by = H * 0.72;
  ctx.fillStyle = '#7a3b22';
  ctx.beginPath();
  ctx.moveTo(bx - 46, by); ctx.lineTo(bx + 46, by); ctx.lineTo(bx + 28, by + 22); ctx.lineTo(bx - 28, by + 22);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8a4a2a'; ctx.fillRect(bx - 3, by - 78, 6, 78);
  tri(ctx, bx + 6, by - 78, bx + 6, by - 8, bx + 52, by - 8, '#f4f1e6');
  tri(ctx, bx - 6, by - 70, bx - 6, by - 8, bx - 44, by - 8, '#e8e0cc');
  birds(ctx, rng, 5, W * 0.7, H * 0.22, 220, 'rgba(40,60,80,0.7)', 3);
  grain(ctx, W, H, rng);
}

function balloonValley(ctx, W, H, rng) {
  vgrad(ctx, W, H, [[0, '#5fb4ec'], [0.55, '#bfe6fb'], [1, '#e8f8e4']]);
  clouds(ctx, W, H, rng, 6, H * 0.4);
  ridge(ctx, W, H, H * 0.66, 60, '#7cc46a', rng);
  ridge(ctx, W, H, H * 0.78, 50, '#4f9e4a', rng);
  ridge(ctx, W, H, H * 0.92, 34, '#357a35', rng);
  var cols = [['#e14b4b', '#f7d154'], ['#4b7de1', '#f2f2f2'], ['#8e44ad', '#f7d154'], ['#e17b4b', '#4bd1e1'], ['#2e9e6b', '#f2f2f2'], ['#d14b8e', '#f7f7f7']];
  for (var i = 0; i < 6; i++) {
    var bx = W * (0.12 + rng() * 0.76), by = H * (0.12 + rng() * 0.4), br = 44 + rng() * 42;
    var c = cols[i % cols.length];
    ctx.save();
    ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.29); ctx.clip();
    ctx.fillStyle = c[0]; ctx.fillRect(bx - br, by - br, br * 2, br * 2);
    ctx.fillStyle = c[1];
    for (var s = -2; s <= 2; s++) ctx.fillRect(bx + (s * br) / 2.4 - br / 7, by - br, (br * 2) / 7, br * 2);
    ctx.restore();
    ctx.strokeStyle = 'rgba(60,40,20,0.8)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bx - br * 0.4, by + br * 0.86); ctx.lineTo(bx - 12, by + br + 26); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx + br * 0.4, by + br * 0.86); ctx.lineTo(bx + 12, by + br + 26); ctx.stroke();
    ctx.fillStyle = '#6b4423'; ctx.fillRect(bx - 14, by + br + 24, 28, 20);
  }
  birds(ctx, rng, 6, W * 0.5, H * 0.2, 300, 'rgba(40,60,90,0.7)', 3);
  grain(ctx, W, H, rng);
}

function geometricFox(ctx, W, H, rng) {
  ctx.fillStyle = '#1b2233'; ctx.fillRect(0, 0, W, H);
  // faint bg triangles
  for (var i = 0; i < 40; i++) {
    var gcols = ['#232c42', '#1e2638', '#273049'];
    tri(ctx, rng() * W, rng() * H, rng() * W, rng() * H, rng() * W, rng() * H, gcols[(rng() * 3) | 0]);
  }
  var cx = W / 2;
  var P = ['#e07b39', '#c85f2a', '#efa04f', '#a34d22', '#f4d8a8', '#e8b96f'];
  function pt(c) { return P[(rng() * P.length) | 0]; }
  // ears
  tri(ctx, cx - 230, 150, cx - 90, 190, cx - 200, 340, pt());
  tri(ctx, cx + 230, 150, cx + 90, 190, cx + 200, 340, pt());
  tri(ctx, cx - 195, 195, cx - 120, 215, cx - 180, 300, '#7a3a1c');
  tri(ctx, cx + 195, 195, cx + 120, 215, cx + 180, 300, '#7a3a1c');
  // head
  tri(ctx, cx - 90, 190, cx + 90, 190, cx, 400, pt());
  tri(ctx, cx - 200, 340, cx, 400, cx - 120, 520, pt());
  tri(ctx, cx + 200, 340, cx, 400, cx + 120, 520, pt());
  tri(ctx, cx - 120, 520, cx + 120, 520, cx, 660, pt());
  tri(ctx, cx - 200, 340, cx - 120, 520, cx - 150, 420, pt());
  tri(ctx, cx + 200, 340, cx + 120, 520, cx + 150, 420, pt());
  // cream cheeks + snout
  tri(ctx, cx - 120, 520, cx + 120, 520, cx, 660, '#f4e3c2');
  tri(ctx, cx - 70, 540, cx + 70, 540, cx, 660, '#f9eeda');
  // eyes
  tri(ctx, cx - 130, 360, cx - 60, 370, cx - 95, 425, '#241a12');
  tri(ctx, cx + 130, 360, cx + 60, 370, cx + 95, 425, '#241a12');
  tri(ctx, cx - 115, 372, cx - 80, 378, cx - 98, 405, '#f4f1e6');
  tri(ctx, cx + 115, 372, cx + 80, 378, cx + 98, 405, '#f4f1e6');
  // nose
  tri(ctx, cx - 34, 580, cx + 34, 580, cx, 632, '#241a12');
  // extra facet lines
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
  var facets = [[cx - 90, 190, cx, 400], [cx + 90, 190, cx, 400], [cx - 200, 340, cx - 120, 520], [cx + 200, 340, cx + 120, 520]];
  for (var f = 0; f < facets.length; f++) {
    ctx.beginPath(); ctx.moveTo(facets[f][0], facets[f][1]); ctx.lineTo(facets[f][2], facets[f][3]); ctx.stroke();
  }
  grain(ctx, W, H, rng, 2500, 0.05);
}

function flowerMeadow(ctx, W, H, rng) {
  vgrad(ctx, W, H, [[0, '#6ec3e8'], [0.5, '#cdeefb'], [0.62, '#eafbe0'], [1, '#eafbe0']]);
  ctx.fillStyle = '#fff6da';
  ctx.beginPath(); ctx.arc(W * 0.8, H * 0.2, 48, 0, 6.29); ctx.fill();
  clouds(ctx, W, H, rng, 4, H * 0.3);
  ridge(ctx, W, H, H * 0.62, 60, '#8fd07a', rng);
  var hg = ctx.createLinearGradient(0, H * 0.6, 0, H);
  hg.addColorStop(0, '#6fb85e'); hg.addColorStop(1, '#3f8a3c');
  ctx.fillStyle = hg; ctx.fillRect(0, H * 0.66, W, H * 0.34);
  var petal = ['#f26d8d', '#f7d154', '#ffffff', '#b678e0', '#f28c4b', '#ef5b5b'];
  for (var i = 0; i < 80; i++) {
    var x = rng() * W, y = H * 0.62 + rng() * H * 0.36;
    var s = 6 + rng() * 14 * ((y - H * 0.6) / (H * 0.4) + 0.4);
    ctx.strokeStyle = '#2f7a2e'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - s * 2.2); ctx.stroke();
    var pc = petal[(rng() * petal.length) | 0];
    ctx.fillStyle = pc;
    for (var pI = 0; pI < 6; pI++) {
      var a = (pI / 6) * 6.28;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * s * 0.7, y - s * 2.2 + Math.sin(a) * s * 0.7, s * 0.55, 0, 6.29);
      ctx.fill();
    }
    ctx.fillStyle = '#f7b32b';
    ctx.beginPath(); ctx.arc(x, y - s * 2.2, s * 0.45, 0, 6.29); ctx.fill();
  }
  // butterflies
  for (var bI = 0; bI < 6; bI++) {
    var bx = rng() * W, by = H * 0.3 + rng() * H * 0.4, bs = 8 + rng() * 8;
    var bc = petal[(rng() * petal.length) | 0];
    ctx.fillStyle = bc;
    tri(ctx, bx, by, bx - bs, by - bs * 0.7, bx - bs * 0.4, by + bs * 0.6, bc);
    tri(ctx, bx, by, bx + bs, by - bs * 0.7, bx + bs * 0.4, by + bs * 0.6, bc);
  }
  grain(ctx, W, H, rng);
}

function cityDusk(ctx, W, H, rng) {
  vgrad(ctx, W, H, [[0, '#241a4e'], [0.45, '#8e3f6e'], [0.68, '#e0705a'], [0.8, '#f7a56b'], [1, '#3a2350']]);
  ctx.fillStyle = '#ffe9c4';
  ctx.beginPath(); ctx.arc(W * 0.5, H * 0.66, 40, 0, 6.29); ctx.fill();
  ctx.fillStyle = '#e8ecf7';
  ctx.beginPath(); ctx.arc(W * 0.85, H * 0.14, 30, 0, 6.29); ctx.fill();
  // far buildings
  for (var x = 0; x < W; x += 60 + rng() * 40) {
    var bh = H * (0.2 + rng() * 0.25);
    ctx.fillStyle = '#4a2c5e';
    ctx.fillRect(x, H * 0.72 - bh, 52 + rng() * 30, bh);
  }
  // near buildings with lit windows
  for (var x2 = -20; x2 < W; x2 += 90 + rng() * 60) {
    var bh2 = H * (0.3 + rng() * 0.3);
    var bw2 = 70 + rng() * 50;
    ctx.fillStyle = '#241a3e';
    ctx.fillRect(x2, H * 0.78 - bh2, bw2, bh2);
    for (var wy = H * 0.78 - bh2 + 12; wy < H * 0.76; wy += 22) {
      for (var wx = x2 + 10; wx < x2 + bw2 - 12; wx += 20) {
        if (rng() < 0.45) {
          ctx.fillStyle = rng() < 0.8 ? 'rgba(255,214,130,0.9)' : 'rgba(180,220,255,0.85)';
          ctx.fillRect(wx, wy, 11, 13);
        }
      }
    }
  }
  // water
  var wg = ctx.createLinearGradient(0, H * 0.78, 0, H);
  wg.addColorStop(0, '#e0705a'); wg.addColorStop(0.35, '#6e3a63'); wg.addColorStop(1, '#1c1233');
  ctx.fillStyle = wg; ctx.fillRect(0, H * 0.78, W, H * 0.22);
  for (var i = 0; i < 30; i++) {
    var ry = H * 0.8 + rng() * H * 0.18;
    ctx.fillStyle = 'rgba(255,200,140,' + (0.08 + rng() * 0.2).toFixed(2) + ')';
    ctx.fillRect(rng() * W, ry, 30 + rng() * 120, 2 + rng() * 3);
  }
  grain(ctx, W, H, rng);
}

function desertSun(ctx, W, H, rng) {
  vgrad(ctx, W, H, [[0, '#7ec3e8'], [0.45, '#ffe3b3'], [0.7, '#ffb36b'], [1, '#ff9a5a']]);
  ctx.fillStyle = '#fff3d0';
  ctx.beginPath(); ctx.arc(W * 0.5, H * 0.42, 66, 0, 6.29); ctx.fill();
  var glow = ctx.createRadialGradient(W * 0.5, H * 0.42, 30, W * 0.5, H * 0.42, 260);
  glow.addColorStop(0, 'rgba(255,240,200,0.7)'); glow.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ridge(ctx, W, H, H * 0.58, 70, '#e8b06a', rng);
  ridge(ctx, W, H, H * 0.72, 60, '#d8954f', rng);
  ridge(ctx, W, H, H * 0.88, 44, '#b8743a', rng);
  // dune shading
  for (var i = 0; i < 12; i++) {
    ctx.strokeStyle = 'rgba(120,60,20,' + (0.08 + rng() * 0.1).toFixed(2) + ')';
    ctx.lineWidth = 4 + rng() * 8;
    var dy = H * 0.6 + rng() * H * 0.35;
    ctx.beginPath();
    for (var x = 0; x <= W; x += 30) {
      var y = dy + Math.sin(x * 0.008 + i) * 22;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // cacti
  function cactus(x, base, s) {
    ctx.fillStyle = '#2f7a3c';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - s * 0.12, base - s, s * 0.24, s, s * 0.12);
    else ctx.rect(x - s * 0.12, base - s, s * 0.24, s);
    ctx.fill();
    ctx.fillRect(x - s * 0.42, base - s * 0.72, s * 0.2, s * 0.34);
    ctx.fillRect(x - s * 0.42, base - s * 0.72, s * 0.34, s * 0.16);
    ctx.fillRect(x + s * 0.22, base - s * 0.6, s * 0.2, s * 0.3);
    ctx.fillRect(x + s * 0.08, base - s * 0.6, s * 0.34, s * 0.16);
  }
  cactus(W * 0.2, H * 0.86, 130);
  cactus(W * 0.78, H * 0.92, 90);
  cactus(W * 0.6, H * 0.8, 60);
  // rocks
  ctx.fillStyle = '#8a6a52';
  for (var rI = 0; rI < 8; rI++) {
    ctx.beginPath();
    ctx.ellipse(rng() * W, H * 0.7 + rng() * H * 0.28, 12 + rng() * 26, 8 + rng() * 14, 0, 0, 6.29);
    ctx.fill();
  }
  birds(ctx, rng, 4, W * 0.3, H * 0.25, 200, 'rgba(60,30,20,0.7)', 3);
  grain(ctx, W, H, rng);
}

function forestFalls(ctx, W, H, rng) {
  vgrad(ctx, W, H, [[0, '#0e2a1e'], [0.6, '#1d4d33'], [1, '#0a1f16']]);
  // cliffs
  ctx.fillStyle = '#4a3f35';
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(W * 0.3, 0); ctx.lineTo(W * 0.24, H); ctx.lineTo(0, H);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W, 0); ctx.lineTo(W * 0.7, 0); ctx.lineTo(W * 0.76, H); ctx.lineTo(W, H);
  ctx.closePath(); ctx.fill();
  // waterfalls
  var falls = [[0.36, 0.10], [0.5, 0.14], [0.64, 0.10]];
  for (var f = 0; f < falls.length; f++) {
    var fx = W * falls[f][0], fw = W * falls[f][1];
    for (var s = 0; s < 22; s++) {
      ctx.fillStyle = 'rgba(' + (200 + ((rng() * 55) | 0)) + ',' + (220 + ((rng() * 35) | 0)) + ',255,' + (0.25 + rng() * 0.45).toFixed(2) + ')';
      var sx = fx - fw / 2 + rng() * fw;
      ctx.fillRect(sx, rng() * H * 0.1, 3 + rng() * 8, H * (0.5 + rng() * 0.2));
    }
  }
  // pool
  var pg = ctx.createRadialGradient(W * 0.5, H * 0.82, 20, W * 0.5, H * 0.82, 320);
  pg.addColorStop(0, 'rgba(180,230,255,0.75)');
  pg.addColorStop(0.5, 'rgba(90,160,190,0.5)');
  pg.addColorStop(1, 'rgba(20,60,70,0)');
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.ellipse(W * 0.5, H * 0.84, 330, 120, 0, 0, 6.29); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  for (var rp = 0; rp < 7; rp++) {
    ctx.lineWidth = 2 + rng() * 3;
    ctx.beginPath();
    ctx.ellipse(W * 0.5, H * 0.84, 90 + rp * 34 + rng() * 10, 34 + rp * 13, 0, 0, 6.29);
    ctx.stroke();
  }
  // framing trees
  function tree(x, s, dark) {
    ctx.fillStyle = dark ? '#0c1f14' : '#14301e';
    ctx.fillRect(x - s * 0.06, H * 0.3, s * 0.12, H * 0.7);
    for (var i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.arc(x + (rng() - 0.5) * s, H * (0.25 + rng() * 0.4), s * (0.25 + rng() * 0.3), 0, 6.29);
      ctx.fill();
    }
  }
  tree(W * 0.08, 200, true); tree(W * 0.16, 150, false);
  tree(W * 0.92, 210, true); tree(W * 0.84, 150, false);
  // mist
  for (var mI = 0; mI < 6; mI++) {
    ctx.fillStyle = 'rgba(220,240,250,' + (0.05 + rng() * 0.07).toFixed(2) + ')';
    ctx.fillRect(W * 0.3, H * (0.6 + rng() * 0.25), W * 0.4, 16 + rng() * 30);
  }
  // light rays
  ctx.fillStyle = 'rgba(255,250,220,0.06)';
  for (var lr = 0; lr < 3; lr++) {
    ctx.beginPath();
    var lx = W * (0.4 + lr * 0.1);
    ctx.moveTo(lx, 0); ctx.lineTo(lx + 60, 0); ctx.lineTo(lx + 140, H); ctx.lineTo(lx + 40, H);
    ctx.closePath(); ctx.fill();
  }
  grain(ctx, W, H, rng);
}

function nebula(ctx, W, H, rng) {
  ctx.fillStyle = '#040409'; ctx.fillRect(0, 0, W, H);
  var blobs = [
    [0.3, 0.4, 320, '106,44,145'], [0.7, 0.6, 380, '31,138,112'],
    [0.55, 0.25, 260, '201,79,124'], [0.8, 0.3, 220, '44,95,158'],
    [0.2, 0.75, 240, '150,60,180']
  ];
  for (var i = 0; i < blobs.length; i++) {
    var b = blobs[i];
    var g = ctx.createRadialGradient(W * b[0], H * b[1], 10, W * b[0], H * b[1], b[2]);
    g.addColorStop(0, 'rgba(' + b[3] + ',0.55)');
    g.addColorStop(1, 'rgba(' + b[3] + ',0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // dark dust lanes
  for (var d = 0; d < 14; d++) {
    ctx.strokeStyle = 'rgba(0,0,0,' + (0.15 + rng() * 0.25).toFixed(2) + ')';
    ctx.lineWidth = 8 + rng() * 26;
    ctx.beginPath();
    var dx = rng() * W, dy = rng() * H;
    ctx.moveTo(dx, dy);
    ctx.quadraticCurveTo(dx + (rng() - 0.5) * 400, dy + (rng() - 0.5) * 400, dx + (rng() - 0.5) * 600, dy + (rng() - 0.5) * 600);
    ctx.stroke();
  }
  stars(ctx, W, H, rng, 520, H);
  // planet with ring
  var px = W * 0.72, py = H * 0.68, pr = 64;
  var pg2 = ctx.createRadialGradient(px - 20, py - 20, 8, px, py, pr);
  pg2.addColorStop(0, '#9fd8e8'); pg2.addColorStop(0.6, '#4b8fb5'); pg2.addColorStop(1, '#1d3a5e');
  ctx.fillStyle = pg2;
  ctx.beginPath(); ctx.arc(px, py, pr, 0, 6.29); ctx.fill();
  ctx.strokeStyle = 'rgba(220,235,245,0.7)'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.ellipse(px, py, pr * 1.7, pr * 0.45, -0.35, 0, 6.29); ctx.stroke();
  ctx.strokeStyle = 'rgba(220,235,245,0.3)'; ctx.lineWidth = 22;
  ctx.beginPath(); ctx.ellipse(px, py, pr * 1.7, pr * 0.45, -0.35, 0, 6.29); ctx.stroke();
  // shooting star
  var sx = W * 0.2, sy = H * 0.2;
  var sg3 = ctx.createLinearGradient(sx, sy, sx + 160, sy + 70);
  sg3.addColorStop(0, 'rgba(255,255,255,0.9)'); sg3.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = sg3; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 160, sy + 70); ctx.stroke();
  grain(ctx, W, H, rng, 2500, 0.04);
}

var GALLERY = [
  { id: 'g0', title: 'Alpine Sunset', make: alpineSunset },
  { id: 'g1', title: 'Starry Night', make: starryNight },
  { id: 'g2', title: 'Ocean Wave', make: oceanWave },
  { id: 'g3', title: 'Balloon Valley', make: balloonValley },
  { id: 'g4', title: 'Geometric Fox', make: geometricFox },
  { id: 'g5', title: 'Flower Meadow', make: flowerMeadow },
  { id: 'g6', title: 'City at Dusk', make: cityDusk },
  { id: 'g7', title: 'Desert Sun', make: desertSun },
  { id: 'g8', title: 'Forest Falls', make: forestFalls },
  { id: 'g9', title: 'Nebula', make: nebula },
  // National-parks photo series (bundled JPEGs in parks/). Appended after the
  // procedural scenes so existing galleryIdx values (0-9) keep working in saves.
  // On GitHub Pages the photos ship as base64 text bundles (park-01.jpg.b64)
  // because the push tooling can't carry binary; loadPhoto falls back to them.
  { id: 'p0', title: 'Yosemite', photo: 'parks/park-01.jpg' },
  { id: 'p1', title: 'Yellowstone', photo: 'parks/park-02.jpg' },
  { id: 'p2', title: 'Grand Canyon', photo: 'parks/park-03.jpg' },
  { id: 'p3', title: 'Zion', photo: 'parks/park-04.jpg' },
  { id: 'p4', title: 'Arches', photo: 'parks/park-05.jpg' },
  { id: 'p5', title: 'Glacier', photo: 'parks/park-06.jpg' },
  { id: 'p6', title: 'Grand Teton', photo: 'parks/park-07.jpg' },
  { id: 'p7', title: 'Acadia', photo: 'parks/park-08.jpg' },
  { id: 'p8', title: 'Bryce Canyon', photo: 'parks/park-09.jpg' },
  { id: 'p9', title: 'Olympic', photo: 'parks/park-10.jpg' }
];

function paintGalleryImage(idx, W, H, seed) {
  var cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  var rng = mulberry32((seed === undefined ? 1234 : seed) + idx * 7919);
  GALLERY[idx].make(cv.getContext('2d'), W, H, rng);
  return cv;
}

/* ---------------- photo items (async) ---------------- */

var _photoCache = {}; // idx -> { img } once loaded

function loadPhoto(idx) {
  // Returns Promise<HTMLImageElement>; cached after first load.
  // Tries the bundled JPEG first, then falls back to the base64 text bundle
  // (<photo>.b64) that ships on GitHub Pages.
  if (_photoCache[idx]) return Promise.resolve(_photoCache[idx]);
  return new Promise(function (resolve, reject) {
    var path = GALLERY[idx].photo;
    function cache(img) { _photoCache[idx] = img; resolve(img); }
    function fromB64() {
      fetch(path + '.b64').then(function (r) {
        if (!r.ok) throw new Error('photo load failed: ' + path);
        return r.text();
      }).then(function (b64) {
        var bin = atob(b64.trim());
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        var url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
        var img = new Image();
        img.onload = function () { URL.revokeObjectURL(url); cache(img); };
        img.onerror = function () { reject(new Error('photo decode failed: ' + path)); };
        img.src = url;
      }).catch(reject);
    }
    var img = new Image();
    img.onload = function () { cache(img); };
    img.onerror = fromB64;
    img.src = path;
  });
}

function paintPhoto(idx, W, H) {
  // Cover-fit the photo into a W x H canvas. Returns Promise<canvas>.
  return loadPhoto(idx).then(function (img) {
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    var s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    var dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    return cv;
  });
}

function isPhoto(idx) { return !!GALLERY[idx].photo; }

function paintAsync(idx, W, H, seed) {
  // Promise<canvas> for any gallery item: procedural paints resolve
  // immediately, photos resolve once the JPEG loads.
  if (isPhoto(idx)) return paintPhoto(idx, W, H);
  return Promise.resolve(paintGalleryImage(idx, W, H, seed));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GALLERY: GALLERY, mulberry32: mulberry32, paintGalleryImage: paintGalleryImage, paint: paintGalleryImage, paintAsync: paintAsync, isPhoto: isPhoto };
} else {
  window.PDAWG_GALLERY = { GALLERY: GALLERY, mulberry32: mulberry32, paint: paintGalleryImage, paintAsync: paintAsync, isPhoto: isPhoto };
}
})();
