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
  TF.OVERDRIVE_MAX = 75; // super-shot cap (OK Golf-style overdrive)
  TF.DT = 1 / 60;     // fixed physics step
  TF.CAPTURE_V = 12;  // max speed for cup capture
  TF.MAGNET_R = 2.0;  // cup magnet reach, × CUP_R (generous, Mini Touch Golf)

  var TAU = 6.283185307179586;
  var MAX_SLOPE = 1.05; // worst-case |dh/dx| cap (< tan(50°) ~= 1.19)

  /* ---------------- hole generation ---------------- */

  // Smooth analytic heightfield: sum of seeded sines. y-up positive.
  // opts: {breather} softens a hole after a killer (MiniGolf MMO tutorial);
  //       {twoRoute} biases water onto the direct line so the safe route and
  //       the risky carry both exist (OK Golf / A Little Golf Journey).
  // genHole(seed) with no opts is unchanged from the original generator.
  TF.genHole = function (seed, opts) {
    opts = opts || {};
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
    if (opts.breather) { a1 *= 0.62; a2 *= 0.62; a3 *= 0.62; }

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
    // twoRoute: center the dip on the direct tee->cup line (risky carry),
    // leaving the around-path as the safe route.
    var water = [];
    var waterLevel = -1000;
    if (rng() < 0.6 || opts.twoRoute) {
      var midX = (teeX + cupX) / 2;
      var scanLo = opts.twoRoute ? Math.max(4, midX - 16) : W * 0.30;
      var scanHi = opts.twoRoute ? Math.min(W - 4, midX + 16) : W * 0.70;
      var dipX = -1, bestH = Infinity, x;
      for (x = scanLo; x <= scanHi; x += 0.5) {
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
    if (opts.breather) { water = []; waterLevel = -1000; }  // breathers stay dry

    // Sand patches, kept clear of tee, cup, and water.
    var sand = [];
    var nSand = (rng() * 3) | 0; // 0..2
    if (opts.breather && nSand > 1) nSand = 1;
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
      resting: true, inCup: false, inWater: false,
      spin: 0,        // -1 (backspin) .. +1 (topspin), Golf on Mars style
      impact: 0,      // normal impact speed of the last real bounce (for dust)
      stillT: 0       // time spent nearly motionless (stuck-ball guard)
    };
  };

  // Sets velocity, clears resting. Speed is capped at MAX_POWER, or
  // OVERDRIVE_MAX for overdrive shots. opts: {spin, overdrive}.
  TF.shoot = function (ball, vx, vy, opts) {
    var o = opts || {};
    var cap = o.overdrive ? TF.OVERDRIVE_MAX : TF.MAX_POWER;
    var sp = Math.hypot(vx, vy);
    if (sp > cap) {
      var k = cap / sp;
      vx *= k; vy *= k;
    }
    ball.vx = vx; ball.vy = vy;
    var sn = +o.spin || 0;
    ball.spin = sn > 1 ? 1 : (sn < -1 ? -1 : sn);
    ball.impact = 0;
    ball.stillT = 0;
    ball.resting = false;
    ball.inCup = false;
    ball.inWater = false;
  };

  // Snapshot / restore for penalty-free undo (Golf Peaks).
  TF.snapBall = function (ball) {
    return { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy,
             resting: ball.resting, spin: ball.spin || 0, stillT: 0 };
  };
  TF.restoreBall = function (ball, s) {
    ball.x = s.x; ball.y = s.y; ball.vx = s.vx; ball.vy = s.vy;
    ball.resting = s.resting; ball.spin = s.spin || 0; ball.stillT = 0;
    ball.inCup = false; ball.inWater = false; ball.impact = 0;
  };

  // Skip-with-dignity (Golf on Mars): banks the hole at par+3.
  TF.skipStrokes = function (par) { return par + 3; };

  // Rolling average of the last n entries (HUD).
  TF.avgLast = function (arr, n) {
    if (!arr || !arr.length) return 0;
    var k = Math.min(n, arr.length), s = 0, i;
    for (i = arr.length - k; i < arr.length; i++) s += arr[i];
    return s / k;
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
      var spn = ball.spin || 0;

      var vn = ball.vx * nx + ball.vy * ny;
      if (vn < -1.2) {
        // Real bounce: reflect the normal component with restitution,
        // scrub the tangential component on impact. Spin modifies the
        // scrub: topspin keeps roll, backspin checks the ball up.
        ball.impact = -vn;
        var rvx = ball.vx - (1 + TF.REST) * vn * nx;
        var rvy = ball.vy - (1 + TF.REST) * vn * ny;
        var vn2 = rvx * nx + rvy * ny;
        // Topspin drives through the bounce (keeps roll), backspin checks up.
        var keep = (sand ? 0.4 : 0.6) * (1 + 0.35 * spn);
        if (keep < 0.15) keep = 0.15;
        if (keep > 0.95) keep = 0.95;
        ball.vx = vn2 * nx + (rvx - vn2 * nx) * keep;
        ball.vy = vn2 * ny + (rvy - vn2 * ny) * keep;
        ball.spin = spn * 0.55;   // bounce eats a chunk of the spin
      } else if (vn < 0) {
        // Gentle contact: just kill the inward normal velocity (rolling).
        ball.vx -= vn * nx;
        ball.vy -= vn * ny;
      } else {
        ball.impact = 0;
      }

      // Rolling: gravity accelerates downhill along the tangent,
      // Coulomb rolling resistance opposes motion (stronger on sand).
      // Spin pushes along the roll direction: topspin drives, backspin brakes.
      var vt = ball.vx * tx + ball.vy * ty;
      var aSlope = -TF.GRAV * s * inv;
      var rr = sand ? 10.0 : 5.0;
      vt += aSlope * dt;
      if (vt !== 0 && spn !== 0) vt += spn * (vt > 0 ? 1 : -1) * 8.0 * dt;
      var dec = rr * dt;
      if (vt > 0) vt = Math.max(0, vt - dec);
      else if (vt < 0) vt = Math.min(0, vt + dec);
      vt *= Math.exp(-0.15 * dt);

      var vn3 = ball.vx * nx + ball.vy * ny;
      if (vn3 < 0) vn3 = 0;
      ball.vx = vn3 * nx + vt * tx;
      ball.vy = vn3 * ny + vt * ty;
      ball.spin = (ball.spin || 0) * Math.exp(-1.6 * dt);  // spin dies on the ground

      // Rest only when slow on a gentle slope; steep slopes keep sliding.
      // Stuck-ball guard: a ball that stays nearly motionless for 2s (e.g.
      // wedged against a wall on a steep slope) is forced to rest — a
      // genuinely sliding ball re-accelerates past 1 u/s almost instantly.
      var spdNow = Math.hypot(ball.vx, ball.vy);
      if (spdNow < 1.0) ball.stillT = (ball.stillT || 0) + dt;
      else ball.stillT = 0;
      if ((spdNow < 0.7 && Math.abs(s) < 0.5) || (ball.stillT || 0) > 2.0) {
        ball.vx = 0; ball.vy = 0; ball.resting = true; ball.stillT = 0;
      } else {
        ball.resting = false;
      }
    } else {
      ball.resting = false;
      ball.spin = (ball.spin || 0) * Math.exp(-0.25 * dt); // slow decay in the air
    }

    // ---- cup magnet: slow balls near the cup get a gentle pull ----
    // (Mini Touch Golf: holes attract more than real physics suggests.)
    if (!ball.inCup) {
      var mdx = hole.cup.x - ball.x, mdy = hole.cup.y - ball.y;
      var md = Math.sqrt(mdx * mdx + mdy * mdy);
      var msp = Math.hypot(ball.vx, ball.vy);
      var mR = TF.CUP_R * TF.MAGNET_R;
      if (md < mR && md > 0.001 && msp < TF.CAPTURE_V * 1.6 &&
          ball.y < hole.terrain.h(ball.x) + 4) {
        var pull = (1 - md / mR) * 30;
        ball.vx += (mdx / md) * pull * dt;
        ball.vy += (mdy / md) * pull * dt;
      }
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
