/* Bloom Defense — canvas art module.
   All vector art: lawn, 8 plants, 6 zombies, projectiles, sun, mowers, worm, particles.
   window.BloomArt = { W, H, CELL_W, CELL_H, ROWS, COLS, MOWER_W, ...draw fns, particles } */
'use strict';
window.BloomArt = (function () {
  var CELL_W = 80, CELL_H = 100, ROWS = 5, COLS = 9, MOWER_W = 70, SPAWN_W = 70;
  var W = MOWER_W + COLS * CELL_W + SPAWN_W;   // 860
  var H = ROWS * CELL_H;                        // 500

  function cellX(c) { return MOWER_W + c * CELL_W + CELL_W / 2; }
  function cellY(r) { return r * CELL_H + CELL_H / 2; }

  /* ---------- helpers ---------- */
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); }
  function ell(ctx, x, y, rx, ry, rot) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, 6.2832);
  }
  function shadow(ctx, x, y, rx, ry) {
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ell(ctx, x, y, rx, ry || rx * 0.35); ctx.fill();
  }
  function grad(ctx, x0, y0, x1, y1, stops) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    return g;
  }

  /* ---------- lawn ---------- */
  function drawLawn(ctx, t) {
    // base
    ctx.fillStyle = '#69a83e';
    ctx.fillRect(0, 0, W, H);
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if ((r + c) % 2 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.055)';
          ctx.fillRect(MOWER_W + c * CELL_W, r * CELL_H, CELL_W, CELL_H);
        }
      }
      // row separator
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(0, (r + 1) * CELL_H - 2, W, 2);
    }
    // mower strip (dirt)
    ctx.fillStyle = '#8a6b48';
    ctx.fillRect(0, 0, MOWER_W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (var i = 0; i < 40; i++) {
      var px = (i * 37.7) % MOWER_W, py = (i * 53.3) % H;
      ctx.fillRect(px, py, 3, 2);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(MOWER_W - 4, 0, 4, H);
    // zombie spawn strip (dark dirt)
    ctx.fillStyle = '#5d4a33';
    ctx.fillRect(W - SPAWN_W, 0, SPAWN_W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(W - SPAWN_W, 0, 4, H);
    // grass tufts (deterministic pseudo-random)
    ctx.strokeStyle = 'rgba(30,90,20,0.5)';
    ctx.lineWidth = 2;
    for (var k = 0; k < 90; k++) {
      var gx = MOWER_W + ((k * 97.3) % (COLS * CELL_W));
      var gy = (k * 61.7) % H;
      var sway = Math.sin(t * 1.5 + k) * 2;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.quadraticCurveTo(gx + sway, gy - 6, gx + sway * 1.6, gy - 10);
      ctx.stroke();
    }
    // vignette
    var v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  /* ---------- particles ---------- */
  var parts = [];
  function puff(x, y, n, colors, spd, life, size, grav) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.2832, s = spd * (0.3 + Math.random() * 0.7);
      parts.push({
        x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - spd * 0.25,
        life: life * (0.6 + Math.random() * 0.4), age: 0,
        color: colors[(Math.random() * colors.length) | 0],
        size: size * (0.6 + Math.random() * 0.8),
        grav: grav == null ? 300 : grav
      });
    }
  }
  function updateParts(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.vr) p.rot += p.vr * dt;
    }
  }
  /* petal/leaf burst: same signature as puff, kind = 'petal' | 'leaf' */
  function petal(x, y, n, colors, spd, life, size, grav, kind) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.2832, s = spd * (0.3 + Math.random() * 0.7);
      parts.push({
        x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - spd * 0.25,
        life: life * (0.6 + Math.random() * 0.4), age: 0,
        color: colors[(Math.random() * colors.length) | 0],
        size: size * (0.6 + Math.random() * 0.8),
        grav: grav == null ? 300 : grav,
        kind: kind || 'petal',
        rot: Math.random() * 6.2832, vr: (Math.random() - 0.5) * 10
      });
    }
  }
  /* additive sun sparkle */
  function spark(x, y, n, colors, spd, life, size, grav) {
    petal(x, y, n, colors, spd, life, size, grav, 'spark');
  }
  function drawParts(ctx) {
    var i, p, k;
    for (i = 0; i < parts.length; i++) {
      p = parts[i]; k = 1 - p.age / p.life;
      if (p.kind === 'spark') continue; // additive pass below
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      if (p.kind === 'petal' || p.kind === 'leaf') {
        var rx = p.size * k + 0.5, ry = rx * (p.kind === 'petal' ? 0.62 : 0.42);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        if (p.kind === 'leaf') { // pointed leaf: two quadratic arcs
          ctx.beginPath();
          ctx.moveTo(-rx, 0);
          ctx.quadraticCurveTo(0, -ry * 1.8, rx, 0);
          ctx.quadraticCurveTo(0, ry * 1.8, -rx, 0);
          ctx.fill();
        } else { // petal: soft ellipse
          ell(ctx, 0, 0, rx, ry, 0); ctx.fill();
        }
        ctx.restore();
      } else {
        circle(ctx, p.x, p.y, p.size * k + 0.5); ctx.fill();
      }
    }
    // additive sun-sparkle pass
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      if (p.kind !== 'spark') continue;
      k = 1 - p.age / p.life;
      ctx.globalAlpha = k * 0.9;
      ctx.fillStyle = p.color;
      circle(ctx, p.x, p.y, p.size * k + 0.5); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  function clearParts() { parts.length = 0; }

  var PEA_COLS = ['#7ee06a', '#4caf50', '#2e7d32'];
  var DIRT_COLS = ['#8a6b48', '#6e5236', '#a37f52'];
  var LEAF_COLS = ['#58c24a', '#3f9e4d', '#2f7a28'];
  var FIRE_COLS = ['#ffdd44', '#ff9d2e', '#ff5a2e', '#888'];
  var PETAL_COLS = ['#ffc4d6', '#ff9dc6', '#fff0f5', '#ffd9e8', '#ffe97a']; // cherry-blossom petals
  var SPARK_COLS = ['#ffe97a', '#fff3b0', '#ffffff']; // sun sparkles (additive)

  /* ---------- sun ---------- */
  function drawSun(ctx, x, y, t, r) {
    r = r || 22;
    var pulse = 1 + Math.sin(t * 4) * 0.06;
    ctx.save();
    ctx.translate(x, y); ctx.scale(pulse, pulse);
    // rays
    ctx.strokeStyle = 'rgba(255,200,60,0.85)';
    ctx.lineWidth = 3;
    for (var i = 0; i < 8; i++) {
      var a = t * 0.8 + i * 0.7854;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (r + 3), Math.sin(a) * (r + 3));
      ctx.lineTo(Math.cos(a) * (r + 9), Math.sin(a) * (r + 9));
      ctx.stroke();
    }
    ctx.fillStyle = grad(ctx, 0, -r, 0, r, [[0, '#ffe97a'], [1, '#f5a623']]);
    circle(ctx, 0, 0, r); ctx.fill();
    ctx.strokeStyle = '#d98a12'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ell(ctx, -r * 0.3, -r * 0.35, r * 0.28, r * 0.18, -0.5); ctx.fill();
    ctx.restore();
  }

  /* ---------- lawnmower ---------- */
  function drawMower(ctx, x, y, t, running) {
    ctx.save();
    ctx.translate(x, y);
    if (running) ctx.translate(Math.sin(t * 60) * 1.5, 0);
    shadow(ctx, 0, 6, 26, 8);
    // body
    ctx.fillStyle = grad(ctx, 0, -26, 0, 4, [[0, '#e0393e'], [1, '#a01e24']]);
    rr(ctx, -26, -26, 52, 30, 8); ctx.fill();
    ctx.strokeStyle = '#6e1418'; ctx.lineWidth = 2.5; ctx.stroke();
    // engine
    ctx.fillStyle = grad(ctx, 0, -34, 0, -18, [[0, '#888'], [1, '#555']]);
    rr(ctx, -12, -36, 24, 16, 5); ctx.fill();
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.stroke();
    // handle
    ctx.strokeStyle = '#444'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-18, -24); ctx.lineTo(-34, -44); ctx.stroke();
    // wheels
    ctx.fillStyle = '#222';
    circle(ctx, -16, 4, 9); ctx.fill();
    circle(ctx, 16, 4, 9); ctx.fill();
    ctx.fillStyle = '#666';
    circle(ctx, -16, 4, 3.5); ctx.fill();
    circle(ctx, 16, 4, 3.5); ctx.fill();
    if (running) {
      ctx.fillStyle = 'rgba(200,200,200,0.5)';
      ell(ctx, -34, 4, 8, 4); ctx.fill();
    }
    ctx.restore();
  }

  /* ---------- Wally the worm (bonus critter) ---------- */
  function drawWorm(ctx, x, y, t, peek) {
    // peek: 0..1 how far out of the hole
    ctx.save();
    ctx.translate(x, y);
    // hole
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ell(ctx, 0, 0, 16, 7); ctx.fill();
    var h = 34 * peek;
    if (h > 2) {
      ctx.fillStyle = grad(ctx, 0, -h, 0, 0, [[0, '#e8a0bf'], [1, '#c96f97']]);
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.quadraticCurveTo(-10, -h * 0.6, -4 + Math.sin(t * 6) * 3, -h);
      ctx.quadraticCurveTo(2, -h - 6, 6, -h + 2);
      ctx.quadraticCurveTo(10, -h * 0.5, 8, 0);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#a5577e'; ctx.lineWidth = 2; ctx.stroke();
      // face
      ctx.fillStyle = '#fff';
      circle(ctx, -2, -h + 4, 4); ctx.fill();
      circle(ctx, 5, -h + 4, 4); ctx.fill();
      ctx.fillStyle = '#222';
      circle(ctx, -1.5, -h + 4.5, 1.8); ctx.fill();
      circle(ctx, 5.5, -h + 4.5, 1.8); ctx.fill();
    }
    ctx.restore();
  }

  return {
    W: W, H: H, CELL_W: CELL_W, CELL_H: CELL_H, ROWS: ROWS, COLS: COLS,
    MOWER_W: MOWER_W, SPAWN_W: SPAWN_W,
    cellX: cellX, cellY: cellY,
    drawLawn: drawLawn,
    drawSun: drawSun, drawMower: drawMower, drawWorm: drawWorm,
    puff: puff, petal: petal, spark: spark, updateParts: updateParts, drawParts: drawParts, clearParts: clearParts,
    PEA_COLS: PEA_COLS, DIRT_COLS: DIRT_COLS, LEAF_COLS: LEAF_COLS, FIRE_COLS: FIRE_COLS,
    PETAL_COLS: PETAL_COLS, SPARK_COLS: SPARK_COLS,
    _rr: rr, _circle: circle, _ell: ell, _shadow: shadow, _grad: grad
  };
})();

/* ---------- plants (appended) ---------- */
(function () {
  var A = window.BloomArt;
  var ctxH = null; // not used; all fns take ctx

  function stem(ctx, x, y, h, sway, w) {
    ctx.strokeStyle = '#2f7a28';
    ctx.lineWidth = w || 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + sway, y - h * 0.6, x + sway * 1.4, y - h);
    ctx.stroke();
  }
  function leaf(ctx, x, y, dir, s) {
    ctx.fillStyle = '#3f9e4d';
    ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(s * 0.9, -s * 0.5, s * 1.5, 0);
    ctx.quadraticCurveTo(s * 0.9, s * 0.4, 0, 0);
    ctx.fill();
    ctx.strokeStyle = '#2f7a28'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }
  function eyes(ctx, x, y, dx, dy, r, look) {
    look = look || 0;
    ctx.fillStyle = '#fff';
    A._circle(ctx, x - dx, y - dy, r); ctx.fill();
    A._circle(ctx, x + dx, y - dy, r); ctx.fill();
    ctx.fillStyle = '#1c1c1c';
    A._circle(ctx, x - dx + look, y - dy + 1, r * 0.5); ctx.fill();
    A._circle(ctx, x + dx + look, y - dy + 1, r * 0.5); ctx.fill();
  }

  function drawSunflower(ctx, x, y, t, o) {
    o = o || {};
    var sway = Math.sin(t * 1.8) * 3;
    A._shadow(ctx, x, y + 2, 20, 7);
    stem(ctx, x, y, 44, sway);
    leaf(ctx, x - 2, y - 14, -1, 10); leaf(ctx, x + 3, y - 22, 1, 9);
    var hx = x + sway * 1.4, hy = y - 48 + Math.sin(t * 1.8 + 1) * 2;
    var glow = o.glow ? 0.5 + Math.sin(t * 8) * 0.3 : 0;
    if (glow > 0) {
      ctx.fillStyle = 'rgba(255,220,80,' + (glow * 0.35).toFixed(2) + ')';
      A._circle(ctx, hx, hy, 34); ctx.fill();
    }
    // petals
    for (var i = 0; i < 12; i++) {
      var a = i * 0.5236 + Math.sin(t * 1.8) * 0.03;
      ctx.fillStyle = i % 2 ? '#ffcf3f' : '#ffb52e';
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(a);
      A._ell(ctx, 20, 0, 13, 7, 0); ctx.fill();
      ctx.strokeStyle = '#d98a12'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = A._grad(ctx, hx, hy - 14, hx, hy + 14, [[0, '#a06a35'], [1, '#6e4423']]);
    A._circle(ctx, hx, hy, 14); ctx.fill();
    ctx.strokeStyle = '#4e2f16'; ctx.lineWidth = 2; ctx.stroke();
    // smile
    ctx.strokeStyle = '#3d2410'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(hx, hy + 2, 7, 0.3, 2.84); ctx.stroke();
    eyes(ctx, hx, hy, 5.5, 4, 2.6);
  }

  function peaHead(ctx, hx, hy, r, c1, c2, snoutLen, look) {
    ctx.fillStyle = A._grad(ctx, hx, hy - r, hx, hy + r, [[0, c1], [1, c2]]);
    A._circle(ctx, hx, hy, r); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2; ctx.stroke();
    // snout
    ctx.fillStyle = c2;
    A._rr(ctx, hx + r * 0.5, hy - r * 0.42, snoutLen, r * 0.84, r * 0.4); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    A._ell(ctx, hx + r * 0.5 + snoutLen, hy, 3.5, r * 0.32, 0); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    A._ell(ctx, hx - r * 0.35, hy - r * 0.45, r * 0.3, r * 0.18, -0.6); ctx.fill();
    eyes(ctx, hx, hy, r * 0.32, r * 0.52, r * 0.2, look);
  }

  function drawPeashooter(ctx, x, y, t, o) {
    o = o || {};
    var sway = Math.sin(t * 2.2) * 2;
    var recoil = o.recoil || 0; // 0..1 decays
    A._shadow(ctx, x, y + 2, 18, 6);
    stem(ctx, x, y, 36, sway);
    leaf(ctx, x - 2, y - 10, -1, 11); leaf(ctx, x + 2, y - 18, 1, 10);
    var hx = x + sway * 1.4 - recoil * 7, hy = y - 44 + Math.sin(t * 2.2 + 0.7) * 1.5;
    peaHead(ctx, hx, hy, 17, '#7ee06a', '#3f9e4d', 16, recoil * 4);
  }

  function drawSnowpea(ctx, x, y, t, o) {
    o = o || {};
    var sway = Math.sin(t * 2.2) * 2;
    var recoil = o.recoil || 0;
    A._shadow(ctx, x, y + 2, 18, 6);
    stem(ctx, x, y, 36, sway);
    leaf(ctx, x - 2, y - 10, -1, 11); leaf(ctx, x + 2, y - 18, 1, 10);
    var hx = x + sway * 1.4 - recoil * 7, hy = y - 44 + Math.sin(t * 2.2 + 0.7) * 1.5;
    peaHead(ctx, hx, hy, 17, '#aee3ff', '#3a8fd1', 16, recoil * 4);
    // snowflakes
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (var i = 0; i < 3; i++) {
      var a = t * 1.2 + i * 2.1;
      var sx = hx + Math.cos(a) * 24, sy = hy + Math.sin(a) * 24 - 4;
      ctx.fillRect(sx - 1, sy - 4, 2, 8); ctx.fillRect(sx - 4, sy - 1, 8, 2);
    }
  }

  function drawRepeater(ctx, x, y, t, o) {
    o = o || {};
    var sway = Math.sin(t * 2.4) * 2;
    var recoil = o.recoil || 0;
    A._shadow(ctx, x, y + 2, 20, 7);
    stem(ctx, x, y, 38, sway, 7);
    leaf(ctx, x - 2, y - 10, -1, 12); leaf(ctx, x + 2, y - 20, 1, 11);
    var hx = x + sway * 1.4 - recoil * 7, hy = y - 46;
    // back head (smaller, higher)
    peaHead(ctx, hx - 8, hy - 14, 13, '#6fce5c', '#35853f', 12, recoil * 3);
    // front head
    peaHead(ctx, hx + 6, hy + 2, 16, '#7ee06a', '#3f9e4d', 15, recoil * 4);
    // angry brows
    ctx.strokeStyle = '#1e5a1a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx - 2, hy - 8); ctx.lineTo(hx + 8, hy - 5); ctx.stroke();
  }

  function drawWallnut(ctx, x, y, t, o) {
    o = o || {};
    var dmg = o.dmg || 0; // 0..1
    var breathe = 1 + Math.sin(t * 2) * 0.015;
    A._shadow(ctx, x, y + 2, 22, 8);
    ctx.save(); ctx.translate(x, y - 26); ctx.scale(breathe, breathe);
    ctx.fillStyle = A._grad(ctx, 0, -30, 0, 30, [[0, '#d9a45f'], [1, '#8a5a2b']]);
    A._rr(ctx, -24, -30, 48, 58, 20); ctx.fill();
    ctx.strokeStyle = '#5e3a1a'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    A._ell(ctx, -10, -14, 9, 14, -0.3); ctx.fill();
    eyes(ctx, 0, -6, 8, 0, 4.5);
    // smile / worried mouth by damage
    ctx.strokeStyle = '#3d2410'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath();
    if (dmg < 0.33) ctx.arc(0, 4, 8, 0.3, 2.84);
    else if (dmg < 0.66) { ctx.moveTo(-7, 8); ctx.lineTo(7, 8); }
    else ctx.arc(0, 12, 7, 3.44, 5.97);
    ctx.stroke();
    // cracks
    if (dmg > 0.15) {
      ctx.strokeStyle = 'rgba(40,20,5,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-16, -22); ctx.lineTo(-8, -8); ctx.lineTo(-14, 2); ctx.stroke();
    }
    if (dmg > 0.45) {
      ctx.beginPath(); ctx.moveTo(14, -24); ctx.lineTo(8, -10); ctx.lineTo(16, 4); ctx.lineTo(10, 16); ctx.stroke();
    }
    if (dmg > 0.75) {
      ctx.beginPath(); ctx.moveTo(-4, -28); ctx.lineTo(-2, -14); ctx.lineTo(-8, -2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, 20); ctx.lineTo(8, 26); ctx.stroke();
    }
    ctx.restore();
  }

  function drawPotatomine(ctx, x, y, t, o) {
    o = o || {};
    var armed = o.armed;
    A._shadow(ctx, x, y + 2, 20, 7);
    // dirt mound
    ctx.fillStyle = A._grad(ctx, x, y - 14, x, y + 4, [[0, '#a37f52'], [1, '#6e5236']]);
    A._ell(ctx, x, y - 4, 24, 12, 0); ctx.fill();
    ctx.strokeStyle = '#4e3a22'; ctx.lineWidth = 2; ctx.stroke();
    var s = armed ? 1 : 0.72;
    var bob = armed ? Math.sin(t * 3) * 1.5 : 0;
    ctx.save(); ctx.translate(x, y - 16 + bob); ctx.scale(s, s);
    ctx.fillStyle = A._grad(ctx, 0, -16, 0, 14, [[0, '#e8c48f'], [1, '#b3814d']]);
    A._ell(ctx, 0, 0, 17, 20, 0); ctx.fill();
    ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 2.5; ctx.stroke();
    // spots
    ctx.fillStyle = 'rgba(122,82,48,0.6)';
    [[-7, -6], [6, -2], [-2, 7], [8, 8]].forEach(function (p) {
      A._circle(ctx, p[0], p[1], 2.2); ctx.fill();
    });
    if (armed) {
      // blinking antenna light
      ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(0, -30); ctx.stroke();
      var blink = (Math.sin(t * 10) > 0);
      ctx.fillStyle = blink ? '#ff3b30' : '#7a2020';
      A._circle(ctx, 0, -33, 4); ctx.fill();
      if (blink) {
        ctx.fillStyle = 'rgba(255,60,40,0.25)';
        A._circle(ctx, 0, -33, 9); ctx.fill();
      }
      eyes(ctx, 0, -2, 6, 0, 3.4);
    } else {
      // sleepy closed eyes
      ctx.strokeStyle = '#5e3a1a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-9, -3); ctx.lineTo(-3, -3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3, -3); ctx.lineTo(9, -3); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('z', 14, -14 + Math.sin(t * 2) * 2);
      ctx.fillText('z', 20, -22 + Math.sin(t * 2 + 1) * 2);
    }
    ctx.restore();
  }

  function drawCherrybomb(ctx, x, y, t, o) {
    o = o || {};
    var fuse = o.fuse == null ? 1 : o.fuse; // 1..0
    var pulse = 1 + Math.sin(t * (6 + (1 - fuse) * 14)) * (0.04 + (1 - fuse) * 0.08);
    A._shadow(ctx, x, y + 2, 24, 8);
    ctx.save(); ctx.translate(x, y - 22); ctx.scale(pulse, pulse);
    // stems
    ctx.strokeStyle = '#2f7a28'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-8, -14); ctx.quadraticCurveTo(-4, -30, 6, -34); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, -12); ctx.quadraticCurveTo(12, -26, 6, -34); ctx.stroke();
    // fuse spark
    var sx = 6 + Math.sin(t * 20) * 2, sy = -36 + Math.cos(t * 17) * 2;
    ctx.fillStyle = '#ffdd44';
    A._circle(ctx, sx, sy, 4 + Math.random() * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,150,40,0.5)';
    A._circle(ctx, sx, sy, 9); ctx.fill();
    // cherries
    [[-11, 0, 15], [11, 4, 13]].forEach(function (c) {
      ctx.fillStyle = A._grad(ctx, c[0], c[1] - c[2], c[0], c[1] + c[2], [[0, '#ff6b74'], [1, '#b02331']]);
      A._circle(ctx, c[0], c[1], c[2]); ctx.fill();
      ctx.strokeStyle = '#7a1620'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      A._ell(ctx, c[0] - c[2] * 0.35, c[1] - c[2] * 0.4, c[2] * 0.28, c[2] * 0.16, -0.6); ctx.fill();
    });
    // angry eyes
    ctx.fillStyle = '#fff';
    A._circle(ctx, -14, -4, 4); ctx.fill();
    A._circle(ctx, 8, 0, 3.6); ctx.fill();
    ctx.fillStyle = '#1c1c1c';
    A._circle(ctx, -13, -3.5, 1.8); ctx.fill();
    A._circle(ctx, 9, 0.5, 1.7); ctx.fill();
    ctx.strokeStyle = '#5e0e14'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-19, -10); ctx.lineTo(-9, -8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(13, -6); ctx.lineTo(4, -4); ctx.stroke();
    ctx.restore();
  }

  function drawMelonpult(ctx, x, y, t, o) {
    o = o || {};
    var sway = Math.sin(t * 1.6) * 3;
    var recoil = o.recoil || 0;
    A._shadow(ctx, x, y + 2, 22, 8);
    stem(ctx, x, y, 30, sway, 7);
    leaf(ctx, x - 2, y - 8, -1, 13); leaf(ctx, x + 2, y - 14, 1, 12);
    var hx = x + sway * 1.4, hy = y - 40;
    // leafy nest
    ctx.fillStyle = '#3f9e4d';
    for (var i = 0; i < 5; i++) {
      var a = -0.4 + i * 0.35 + Math.sin(t * 1.6) * 0.02;
      ctx.save(); ctx.translate(hx, hy + 6); ctx.rotate(a);
      A._ell(ctx, 0, -14, 7, 15, 0); ctx.fill();
      ctx.restore();
    }
    // melon (recoil rocks it back)
    var mx = hx - recoil * 6, my = hy - 12 + Math.sin(t * 1.6 + 1) * 1.5;
    ctx.fillStyle = A._grad(ctx, mx, my - 16, mx, my + 16, [[0, '#43a047'], [1, '#1b5e20']]);
    A._circle(ctx, mx, my, 17); ctx.fill();
    ctx.strokeStyle = '#144a17'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(20,74,23,0.7)'; ctx.lineWidth = 2;
    for (var s = -1; s <= 1; s++) {
      ctx.beginPath(); ctx.moveTo(mx + s * 8 - 3, my - 14); ctx.quadraticCurveTo(mx + s * 8 + 3, my, mx + s * 8 - 3, my + 14); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    A._ell(ctx, mx - 6, my - 8, 5, 3, -0.6); ctx.fill();
    eyes(ctx, mx, my, 6, 2, 3);
  }

  var PLANT_DRAW = {
    sunflower: drawSunflower, peashooter: drawPeashooter, snowpea: drawSnowpea,
    repeater: drawRepeater, wallnut: drawWallnut, potatomine: drawPotatomine,
    cherrybomb: drawCherrybomb, melonpult: drawMelonpult
  };
  A.drawPlant = function (ctx, id, x, y, t, o) {
    var fn = PLANT_DRAW[id];
    if (fn) fn(ctx, x, y, t, o);
  };
  A.PLANT_IDS = Object.keys(PLANT_DRAW);
})();

/* ---------- zombies (appended) ---------- */
(function () {
  var A = window.BloomArt;

  function zShadow(ctx, x, y, s) { A._shadow(ctx, x, y + 2, 20 * s, 7 * s); }

  function limb(ctx, x, y, len, ang, w, color) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); ctx.stroke();
  }

  // Base zombie body. x,y = feet. faces left. s = scale.
  // o: {walk (phase), dmg (0..1), slowed, enraged, armless}
  function body(ctx, x, y, t, o, s, skin, coat, pants) {
    o = o || {};
    var wob = Math.sin(o.walk || 0);
    var bob = Math.abs(Math.cos(o.walk || 0)) * 3 * s;
    ctx.save();
    ctx.translate(x, y - bob); ctx.scale(s, s);
    zShadow(ctx, 0, bob, 1);
    var lean = o.enraged ? 0.14 : 0.06;
    ctx.rotate(-lean);
    // legs
    var lp = Math.sin(o.walk || 0) * 10;
    limb(ctx, -4, -26, 26, Math.PI / 2 + lp * 0.03, 9, pants);
    limb(ctx, 5, -26, 26, Math.PI / 2 - lp * 0.03, 9, pants);
    // shoes
    ctx.fillStyle = '#3a2e24';
    A._ell(ctx, -4 - lp * 0.35, -2, 8, 4.5, 0); ctx.fill();
    A._ell(ctx, 5 + lp * 0.35, -2, 8, 4.5, 0); ctx.fill();
    // torso (tattered coat)
    ctx.fillStyle = A._grad(ctx, 0, -62, 0, -24, [[0, coat], [1, 'rgba(0,0,0,0.25)']]);
    A._rr(ctx, -15, -62, 30, 40, 9); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2; ctx.stroke();
    // coat tears
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-15, -34); ctx.lineTo(-8, -28); ctx.lineTo(-13, -24); ctx.stroke();
    // arms reaching left
    var ap = Math.sin((o.walk || 0) + 1) * 4;
    if (!o.armless) {
      limb(ctx, -12, -54, 26, Math.PI + 0.12 + ap * 0.02, 8, skin);
      ctx.fillStyle = skin;
      A._circle(ctx, -12 - 25, -54 + 4 + ap, 5); ctx.fill();
    } else {
      // stub
      ctx.fillStyle = skin;
      A._circle(ctx, -13, -54, 5); ctx.fill();
    }
    limb(ctx, -10, -52, 24, Math.PI + 0.3 - ap * 0.02, 8, skin);
    // head
    var hx = -6, hy = -74;
    ctx.fillStyle = A._grad(ctx, hx, hy - 13, hx, hy + 13, [[0, skin], [1, 'rgba(0,0,0,0.18)']]);
    A._circle(ctx, hx, hy, 13); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2; ctx.stroke();
    // eyes
    var ec = o.enraged ? '#ff3b30' : '#2b2b2b';
    ctx.fillStyle = '#fff';
    A._circle(ctx, hx - 8, hy - 3, 4); ctx.fill();
    A._circle(ctx, hx - 1, hy - 3, 3.4); ctx.fill();
    ctx.fillStyle = ec;
    A._circle(ctx, hx - 8.5, hy - 2.5, 1.9); ctx.fill();
    A._circle(ctx, hx - 1.5, hy - 2.5, 1.6); ctx.fill();
    if (o.enraged) {
      ctx.strokeStyle = '#5e0e0a'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(hx - 13, hy - 9); ctx.lineTo(hx - 4, hy - 6); ctx.stroke();
    }
    // mouth
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(hx - 6, hy + 5, 4, 0.4, 2.7); ctx.stroke();
    // damage: extra tatters
    if ((o.dmg || 0) > 0.5) {
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(15, -58); ctx.lineTo(9, -50); ctx.stroke();
    }
    ctx.restore();
    return { hx: x - 6 * s, hy: y - bob - 74 * s, s: s };
  }

  function drawBasic(ctx, x, y, t, o) {
    o = o || {};
    var oo = { walk: o.walk, dmg: o.dmg, slowed: o.slowed, armless: (o.dmg || 0) > 0.5 };
    var head = body(ctx, x, y, t, oo, 1, '#9db38a', '#6b5b4c', '#4a4a5a');
    if (o.slowed) {
      ctx.fillStyle = 'rgba(140,200,255,0.35)';
      A._circle(ctx, x, y - 40, 30); ctx.fill();
    }
    return head;
  }

  function drawConehead(ctx, x, y, t, o) {
    o = o || {};
    var head = drawBasic(ctx, x, y, t, o);
    if ((o.coneDmg || 0) < 1) {
      // traffic cone
      ctx.save();
      ctx.translate(head.hx, head.hy - 8);
      var wob = Math.sin(o.walk || 0) * 0.05;
      ctx.rotate(wob);
      ctx.fillStyle = A._grad(ctx, 0, -26, 0, 0, [[0, '#ff9d45'], [1, '#e06a12']]);
      ctx.beginPath();
      ctx.moveTo(-11, 0); ctx.lineTo(-4, -26); ctx.lineTo(4, -26); ctx.lineTo(11, 0);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#a34a08'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(-8.2, -14, 16.4, 5);
      if ((o.coneDmg || 0) > 0.4) {
        ctx.strokeStyle = 'rgba(60,20,0,0.6)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-6, -22); ctx.lineTo(-2, -12); ctx.stroke();
      }
      ctx.restore();
    }
    return head;
  }

  function drawSpeedy(ctx, x, y, t, o) {
    o = o || {};
    // motion lines
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    for (var i = 0; i < 3; i++) {
      var ly = y - 30 - i * 18;
      var lx = x + 14 + ((t * 120 + i * 30) % 40);
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 18, ly); ctx.stroke();
    }
    var oo = { walk: (o.walk || 0) * 1.8, dmg: o.dmg, slowed: o.slowed, armless: (o.dmg || 0) > 0.5, enraged: true };
    var head = body(ctx, x, y, t, oo, 0.92, '#a8c48f', '#7a4a5a', '#3a3a4a');
    // sweat drop
    ctx.fillStyle = 'rgba(140,200,255,0.9)';
    var sy = head.hy - 16 - ((t * 40) % 14);
    A._ell(ctx, head.hx + 6, sy, 2.5, 3.5, 0); ctx.fill();
    return head;
  }

  function drawVaulter(ctx, x, y, t, o) {
    o = o || {};
    if (o.vault != null) {
      // mid-vault: arcing over a plant
      var v = o.vault; // 0..1
      var vx = o.vaultX0 + (o.vaultX1 - o.vaultX0) * v;
      var vy = o.vaultY0 - Math.sin(v * Math.PI) * 70;
      ctx.save();
      ctx.translate(vx, vy);
      ctx.rotate(-v * 1.2);
      var oo = { walk: v * 6, dmg: o.dmg };
      body(ctx, 0, 0, t, oo, 0.95, '#9db38a', '#5a6e8a', '#4a4a5a');
      // pole planted
      ctx.strokeStyle = '#8a6b48'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(30, -70); ctx.stroke();
      ctx.restore();
      return null;
    }
    var head = drawBasic(ctx, x, y, t, o);
    // carry pole
    ctx.strokeStyle = '#8a6b48'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    var wob = Math.sin(o.walk || 0) * 2;
    ctx.beginPath(); ctx.moveTo(x + 6, y - 10); ctx.lineTo(x + 22, y - 78 + wob); ctx.stroke();
    return head;
  }

  function drawNewspaper(ctx, x, y, t, o) {
    o = o || {};
    var paperGone = (o.paperDmg || 0) >= 1;
    var oo = {
      walk: o.walk, dmg: o.dmg, slowed: o.slowed,
      armless: (o.dmg || 0) > 0.5, enraged: paperGone
    };
    if (paperGone) oo.walk = (o.walk || 0) * 2.2;
    var head = body(ctx, x, y, t, oo, 1, '#9db38a', '#5a6e8a', '#4a4a5a');
    if (!paperGone) {
      // newspaper shield in front
      ctx.save();
      ctx.translate(x - 30, y - 52);
      ctx.rotate(Math.sin(t * 2) * 0.03);
      ctx.fillStyle = '#f2ede2';
      A._rr(ctx, -13, -18, 26, 36, 2); ctx.fill();
      ctx.strokeStyle = '#999'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#bbb';
      ctx.fillRect(-9, -14, 18, 4);
      for (var i = 0; i < 4; i++) ctx.fillRect(-9, -7 + i * 6, 18, 2);
      if ((o.paperDmg || 0) > 0.3) {
        ctx.strokeStyle = 'rgba(80,40,20,0.6)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-10, -16); ctx.lineTo(4, 2); ctx.lineTo(-4, 14); ctx.stroke();
      }
      ctx.restore();
    }
    return head;
  }

  function drawBrute(ctx, x, y, t, o) {
    o = o || {};
    var oo = { walk: (o.walk || 0) * 0.7, dmg: o.dmg, slowed: o.slowed, armless: (o.dmg || 0) > 0.6 };
    var head = body(ctx, x, y, t, oo, 1.75, '#8a9a76', '#4a3f35', '#33333d');
    // angry brows
    ctx.strokeStyle = '#222'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(head.hx - 16, head.hy - 16); ctx.lineTo(head.hx - 4, head.hy - 12); ctx.stroke();
    return head;
  }

  var Z_DRAW = {
    basic: drawBasic, conehead: drawConehead, speedy: drawSpeedy,
    vaulter: drawVaulter, newspaper: drawNewspaper, brute: drawBrute
  };
  A.drawZombie = function (ctx, type, x, y, t, o) {
    var fn = Z_DRAW[type];
    if (fn) return fn(ctx, x, y, t, o);
    return drawBasic(ctx, x, y, t, o);
  };

  /* ---------- projectiles ---------- */
  A.drawPea = function (ctx, x, y, frozen) {
    ctx.fillStyle = frozen
      ? A._grad(ctx, x - 7, y, x + 7, y, [[0, '#cfeeff'], [1, '#3a8fd1']])
      : A._grad(ctx, x - 7, y, x + 7, y, [[0, '#a5ec8f'], [1, '#3f9e4d']]);
    A._circle(ctx, x, y, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    A._ell(ctx, x - 2.5, y - 3, 2.6, 1.6, -0.6); ctx.fill();
    if (frozen) {
      ctx.strokeStyle = 'rgba(200,235,255,0.7)'; ctx.lineWidth = 1.5;
      A._circle(ctx, x, y, 10); ctx.stroke();
    }
  };
  A.drawMelon = function (ctx, x, y, t) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 6);
    ctx.fillStyle = A._grad(ctx, 0, -10, 0, 10, [[0, '#43a047'], [1, '#1b5e20']]);
    A._circle(ctx, 0, 0, 10); ctx.fill();
    ctx.strokeStyle = '#144a17'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(20,74,23,0.8)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-4, -9); ctx.quadraticCurveTo(2, 0, -4, 9); ctx.stroke();
    ctx.restore();
  };
})();
