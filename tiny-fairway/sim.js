/* Tiny Fairway — pure arcade-golf simulation.
 *
 * Zero DOM, no Math.random (mulberry32 only). Fixed 1/60 s timestep with
 * internal sub-stepping for fast movers. Loads as a plain script and
 * exposes everything on the global TF object. */

(function () {
  'use strict';

  var TF = {};

  /* ---------------- seeded RNG ---------------- */

  // mulberry32: deterministic [0,1) stream from a uint32 seed.
  TF.mulberry32 = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // FNV-1a 32-bit hash of a date string like '2026-10-04'. Same date
  // worldwide -> same seed -> same hole.
  TF.dailySeed = function (dateStr) {
    var h = 0x811c9dc5;
    for (var i = 0; i < dateStr.length; i++) {
      h ^= dateStr.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };

  /* ---------------- tuning constants (UI may read) ---------------- */

  TF.GRAV = 40;       // world units / s^2
  TF.REST = 0.45;     // restitution on bounce
  TF.BALL_R = 1;      // ball radius
  TF.CUP_R = 2.4;     // cup capture radius
  TF.MAX_POWER = 60;  // max shot speed
  TF.DT = 1 / 60;     // fixed physics step
  TF.CAPTURE_V = 12;  // max speed for cup capture

  var TAU = 6.283185307179586;
  var MAX_SLOPE = 1.05; // worst-case |dh/dx| cap (< tan(50°) ~= 1.19)

  /* ---------------- hole generation ---------------- */

  // Smooth analytic heightfield: sum of seeded sines. y-up positive.
  TF.genHole = function (seed) {
    var rng = TF.mulberry32(seed >>> 0);
    var W = 100, H = 60;

    var f1 = 1 + ((rng() * 2) | 0);  // 1..2 waves across the world
    var f2 = 3 + ((rng() * 2) | 0);  // 3..4
    var f3 = 6 + ((rng() * 3) | 0);  // 6..8
    var a1 = 3.5 + rng() * 1.5;
    var a2 = 1.8 + rng() * 1.2;
    var a3 = 0.8 + rng() * 0.7;
    var p1 = rng() * TAU, p2 = rng() * TAU, p3 = rng() * TAU;
    var base = 20 + rng() * 6;

    // Cap the worst-case slope so no cliffs steeper than ~50° can appear.
    var worst = (a1 * TAU * f1 + a2 * TAU * f2 + a3 * TAU * f3) / W;
    if (worst > MAX_SLOPE) {
      var k = MAX_SLOPE / worst;
      a1 *= k; a2 *= k; a3 *= k;
    }

    var w1 = TAU * f1 / W, w2 = TAU * f2 / W, w3 = TAU * f3 / W;
    function h(x) {
      return base +
        a1 * Math.sin(w1 * x + p1) +
        a2 * Math.sin(w2 * x + p2) +
        a3 * Math.sin(w3 * x + p3);
    }
    function slope(x) {
      return a1 * w1 * Math.cos(w1 * x + p1) +
             a2 * w2 * Math.cos(w2 * x + p2) +
             a3 * w3 * Math.cos(w3 * x + p3);
    }

    // Tee on one third, cup on the other (side may flip).
    var teeX = 8 + rng() * 20;   // 8..28
    var cupX = 72 + rng() * 20;  // 72..92
    var flip = rng() < 0.5;
    if (flip) { teeX = W - teeX; cupX = W - cupX; }

    // The cup gets a green: relocate to the flattest spot in its third so
    // the ball can actually stay near it (no hilltop cups). Kept >= 10
    // units from the walls so overshoots have run-out room.
    var cupLo = flip ? 10 : 70, cupHi = flip ? 30 : 90;
    var bestX = cupX, bestScore = Infinity;
    for (var cx = cupLo; cx <= cupHi; cx += 0.75) {
      var sc = Math.abs(slope(cx)) +
               2 * Math.abs(slope(cx + 0.75) - slope(cx - 0.75));
      if (sc < bestScore) { bestScore = sc; bestX = cx; }
    }
    cupX = bestX;

    // Water: a narrow shallow dip in the middle band, always carryable.
    var water = [];
    var waterLevel = -1000;
    if (rng() < 0.6) {
      var dipX = -1, bestH = Infinity, x;
      for (x = W * 0.30; x <= W * 0.70; x += 0.5) {
        var hx = h(x);
        if (hx < bestH) { bestH = hx; dipX = x; }
      }
      if (dipX > 0) {
        var ww = 4 + rng() * 5;          // 4..9 wide
        var wl = bestH + 0.6 + rng() * 0.9; // shallow
        var x0 = dipX - ww / 2, x1 = dipX + ww / 2;
        // Only keep it if the dip really sits below the water line, and the
        // bowl is gentle (no steep hill right beside the water to ricochet
        // approach shots back into it).
        var gentle = h(x0) > wl && h(x1) > wl;
        for (var gx = dipX - 7; gentle && gx <= dipX + 7; gx += 1) {
          if (gx < 0 || gx > W) continue;
          if (h(gx) > wl + 3.2) gentle = false;
        }
        if (gentle) {
          water.push({ x0: x0, x1: x1 });
          waterLevel = wl;
        }
      }
    }

    // Sand patches, kept clear of tee, cup, and water.
    var sand = [];
    var nSand = (rng() * 3) | 0; // 0..2
    for (var i = 0; i < nSand; i++) {
      for (var tries = 0; tries < 12; tries++) {
        var sx = 6 + rng() * (W - 12);
        var sw = 4 + rng() * 6;
        var mid = sx + sw / 2;
        var ok = Math.abs(mid - teeX) > 6 && Math.abs(mid - cupX) > 6;
        for (var j = 0; ok && j < water.length; j++) {
          if (sx < water[j].x1 + 1 && sx + sw > water[j].x0 - 1) ok = false;
        }
        if (ok) { sand.push({ x0: sx, x1: sx + sw }); break; }
      }
    }

    // Par from distance, elevation change, and hazards.
    var dist = Math.abs(cupX - teeX);
    var elev = Math.abs(h(cupX) - h(teeX));
    var hazards = sand.length + (water.length ? 1.5 : 0);
    var par = Math.round(dist / 22 + elev / 14 + hazards * 0.6);
    if (par < 2) par = 2;
    if (par > 5) par = 5;

    var biome = (rng() * 4) | 0;

    return {
      seed: seed >>> 0,
      W: W,
      H: H,
      terrain: { h: h, slope: slope },
      sand: sand,
      water: water,
      waterLevel: waterLevel,
      tee: { x: teeX, y: h(teeX) + TF.BALL_R },
      cup: { x: cupX, y: h(cupX) },
      par: par,
      biome: biome
    };
  };

  /* ---------------- ball ---------------- */

  TF.newBall = function (hole) {
    return {
      x: hole.tee.x, y: hole.tee.y,
      vx: 0, vy: 0,
      resting: true, inCup: false, inWater: false
    };
  };

  // Sets velocity, clears resting. Speed is capped at MAX_POWER.
  TF.shoot = function (ball, vx, vy) {
    var sp = Math.hypot(vx, vy);
    if (sp > TF.MAX_POWER) {
      var k = TF.MAX_POWER / sp;
      vx *= k; vy *= k;
    }
    ball.vx = vx; ball.vy = vy;
    ball.resting = false;
    ball.inCup = false;
    ball.inWater = false;
  };

  TF.inSand = function (hole, x) {
    for (var i = 0; i < hole.sand.length; i++) {
      var s = hole.sand[i];
      if (x >= s.x0 && x <= s.x1) return true;
    }
    return false;
  };

  TF.inWater = function (hole, x) {
    for (var i = 0; i < hole.water.length; i++) {
      var w = hole.water[i];
      if (x >= w.x0 && x <= w.x1) return true;
    }
    return false;
  };

  // Advances EXACTLY 1/60 s of physics. Sub-steps internally when the
  // ball is fast so no step moves more than half a ball radius (no tunneling).
  TF.simStep = function (hole, ball) {
    if (ball.inCup || ball.inWater) return;
    var dt = TF.DT;
    var speed = Math.hypot(ball.vx, ball.vy);
    var n = Math.ceil(speed * dt / (TF.BALL_R * 0.5));
    if (n < 1) n = 1;
    if (n > 48) n = 48;
    var sdt = dt / n;
    for (var i = 0; i < n; i++) {
      TF._step(hole, ball, sdt);
      if (ball.inCup || ball.inWater) break;
    }
  };

  // One internal physics sub-step of length dt.
  TF._step = function (hole, ball, dt) {
    var R = TF.BALL_R;

    ball.vy -= TF.GRAV * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // Side walls and ceiling.
    if (ball.x < R) { ball.x = R; if (ball.vx < 0) ball.vx = -ball.vx * TF.REST; }
    else if (ball.x > hole.W - R) {
      ball.x = hole.W - R;
      if (ball.vx > 0) ball.vx = -ball.vx * TF.REST;
    }
    if (ball.y > hole.H + 40) { ball.y = hole.H + 40; if (ball.vy > 0) ball.vy = 0; }

    var g = hole.terrain.h(ball.x);
    if (ball.y - R <= g) {
      // ---- ground contact ----
      ball.y = g + R;
      var s = hole.terrain.slope(ball.x);
      var inv = 1 / Math.sqrt(1 + s * s);
      var nx = -s * inv, ny = inv;  // unit surface normal (up)
      var tx = inv, ty = s * inv;   // unit tangent (+x)
      var sand = TF.inSand(hole, ball.x);

      var vn = ball.vx * nx + ball.vy * ny;
      if (vn < -1.2) {
        // Real bounce: reflect the normal component with restitution,
        // scrub the tangential component on impact.
        var rvx = ball.vx - (1 + TF.REST) * vn * nx;
        var rvy = ball.vy - (1 + TF.REST) * vn * ny;
        var vn2 = rvx * nx + rvy * ny;
        var keep = sand ? 0.4 : 0.6;
        ball.vx = vn2 * nx + (rvx - vn2 * nx) * keep;
        ball.vy = vn2 * ny + (rvy - vn2 * ny) * keep;
      } else if (vn < 0) {
        // Gentle contact: just kill the inward normal velocity (rolling).
        ball.vx -= vn * nx;
        ball.vy -= vn * ny;
      }

      // Rolling: gravity accelerates downhill along the tangent,
      // Coulomb rolling resistance opposes motion (stronger on sand).
      var vt = ball.vx * tx + ball.vy * ty;
      var aSlope = -TF.GRAV * s * inv;
      var rr = sand ? 10.0 : 5.0;
      vt += aSlope * dt;
      var dec = rr * dt;
      if (vt > 0) vt = Math.max(0, vt - dec);
      else if (vt < 0) vt = Math.min(0, vt + dec);
      vt *= Math.exp(-0.15 * dt);

      var vn3 = ball.vx * nx + ball.vy * ny;
      if (vn3 < 0) vn3 = 0;
      ball.vx = vn3 * nx + vt * tx;
      ball.vy = vn3 * ny + vt * ty;

      // Rest only when slow on a gentle slope; steep slopes keep sliding.
      if (Math.hypot(ball.vx, ball.vy) < 0.7 && Math.abs(s) < 0.5) {
        ball.vx = 0; ball.vy = 0; ball.resting = true;
      } else {
        ball.resting = false;
      }
    } else {
      ball.resting = false;
    }

    // ---- cup capture: close and slow -> in ----
    if (!ball.inCup) {
      var cdx = ball.x - hole.cup.x, cdy = ball.y - hole.cup.y;
      if (cdx * cdx + cdy * cdy < TF.CUP_R * TF.CUP_R &&
          Math.hypot(ball.vx, ball.vy) < TF.CAPTURE_V) {
        ball.inCup = true;
        ball.resting = true;
        ball.x = hole.cup.x;
        ball.y = hole.cup.y + R * 0.4;
        ball.vx = 0; ball.vy = 0;
        return;
      }
    }

    // ---- water ----
    if (TF.inWater(hole, ball.x) && ball.y - R < hole.waterLevel) {
      ball.inWater = true;
      ball.vx = 0; ball.vy = 0;
      ball.resting = false;
    }
  };

  /* ---------------- scoring ---------------- */

  TF.starsFor = function (strokes, par) {
    if (strokes <= par) return 3;
    if (strokes === par + 1) return 2;
    return 1;
  };

  if (typeof globalThis !== 'undefined') globalThis.TF = TF;
})();
