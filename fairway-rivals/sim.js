/* Fairway Rivals — headless golf-duel simulation core.
 *
 * Pure planar top-down physics for televised golf duels: seeded hole
 * generation (par 3/4/5, tee->cup ~90/150/210 units), club/ball physics
 * ported from Tiny Fairway (rolling friction per surface, launch z-arcs,
 * wind that bites harder airborne, cup capture + magnet, water penalties,
 * tree bumpers, wall bounds), honest club upgrade math, human-like bot
 * shot params, trophy/stage/pity math, and deterministic ghost tapes.
 *
 * Zero DOM, zero canvas, zero rAF, zero Math.random — mulberry32 only.
 * Fixed 1/60 s timestep with internal sub-stepping for fast movers.
 * Loads as a plain script (global FR) or via require() in node.
 *
 * Fantasy sentence: "you're in a televised golf duel."
 */

(function () {
  'use strict';

  var FR = {};
  var TAU = 6.283185307179586;

  /* ---------------- seeded RNG ---------------- */

  // mulberry32: deterministic [0,1) stream from a uint32 seed.
  FR.mulberry32 = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // FNV-1a 32-bit hash of a date string like '2026-10-12'. Same date
  // worldwide -> same seed -> same hole.
  FR.dailySeed = function (dateStr) {
    var h = 0x811c9dc5;
    for (var i = 0; i < dateStr.length; i++) {
      h ^= dateStr.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };

  /* ---------------- small geometry helpers ---------------- */

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function dist2(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    return dx * dx + dy * dy;
  }
  // Distance from point p to segment ab.
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var L2 = dx * dx + dy * dy;
    var t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
    t = clamp(t, 0, 1);
    var cx = ax + dx * t, cy = ay + dy * t;
    return Math.sqrt(dist2(px, py, cx, cy));
  }
  // Point in rotated ellipse? e = {x, y, rx, ry, rot}.
  function inEllipse(px, py, e) {
    var dx = px - e.x, dy = py - e.y;
    var c = Math.cos(e.rot || 0), s = Math.sin(e.rot || 0);
    var lx = dx * c + dy * s, ly = -dx * s + dy * c;
    return (lx * lx) / (e.rx * e.rx) + (ly * ly) / (e.ry * e.ry) <= 1;
  }

  /* ---------------- tuning constants (UI may read) ---------------- */

  FR.DT = 1 / 60;       // fixed physics step
  FR.BALL_R = 0.9;      // ball radius
  FR.CUP_R = 2.0;       // cup capture radius
  FR.CAPTURE_V = 9;     // max speed for cup capture (faster lips out)
  FR.MAGNET_R = 5.0;    // cup magnet reach for slow balls
  FR.GRAV_Z = 55;       // vertical gravity for launch arcs (u/s^2)
  FR.WIND_K = 0.55;     // wind pressure accel per mph, grounded (u/s^2)
  FR.WIND_K_AIR = 0.95; // wind bites harder when airborne (real)
  FR.LAUNCH_MIN = 30;   // shots harder than this leave the ground
  FR.LAUNCH_K = 0.6;    // launch velocity per unit of excess speed
  FR.REST_TREE = 0.5;   // restitution off trees
  FR.REST_WALL = 0.75;  // restitution off world walls
  FR.NEEDLE_BASE = 4.0; // needle speed (rad/s) at zero accuracy stat
  FR.OVERPOWER_K = 1.18;// overpower raises the power cap by this
  FR.NEEDLE_OP_K = 2.2; // overpower multiplies needle speed (wider error)
  FR.ANG_ERR = 0.055;   // max angular needle error (radians, at needle01=+-1)
  FR.DIST_ERR = 0.06;   // max distance needle error (fraction, at needle01=+-1)
  FR.SPIN_CURVE_K = 14; // lateral accel per unit side-spin while airborne

  // Per-surface rolling resistance: linear decel (u/s^2) + exponential
  // damping (/s). Ported from Tiny Fairway.
  FR.SURF = {
    green:   { fr: 8,    damp: 0.30 },
    fairway: { fr: 13.5, damp: 0.42 },
    rough:   { fr: 30,   damp: 1.10 },
    sand:    { fr: 46,   damp: 1.90 }
  };

  // Wind-ring chart (mph per ring), televised-duel style wind readout.
  FR.WIND_RINGS = { white: [3, 6, 9], yellow: [6, 12, 18], green: [15, 30, 45] };

  /* ---------------- water blobs (organic shorelines) ----------------
   * Ported from Tiny Fairway: every water blob carries seeded radius
   * multipliers derived from the pond's own coordinates, never the hole
   * rng stream, so existing seeds generate identical layouts. */

  var BLOB_N = 12;
  function hashXY(x, y) {
    var h = (Math.round(x * 64) * 374761393 + Math.round(y * 64) * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return (h ^ (h >>> 16)) >>> 0;
  }
  FR.waterBlob = function (e) {
    var r = FR.mulberry32(hashXY(e.x + e.rx * 0.37, e.y + e.ry * 0.73));
    var b = [], i;
    for (i = 0; i < BLOB_N; i++) b.push(0.78 + r() * 0.40);
    return b;
  };
  function smoothBlob(b, t) { // t in [0,1) around the ring; cosine interpolation
    var x = t * BLOB_N, fl = Math.floor(x);
    var i0 = fl % BLOB_N, i1 = (fl + 1) % BLOB_N, f = x - fl;
    var s = (1 - Math.cos(f * Math.PI)) / 2;
    return b[i0] * (1 - s) + b[i1] * s;
  }
  // Shoreline radius of pond e at local angle th (radians).
  FR.blobR = function (e, th) {
    var c = Math.cos(th), s = Math.sin(th);
    var re = (e.rx * e.ry) / Math.sqrt(e.ry * e.ry * c * c + e.rx * e.rx * s * s + 1e-9);
    var t = th / TAU; t = t - Math.floor(t);
    return re * smoothBlob(e.blob, t);
  };
  // Point-in-pond test; matches the rendered shoreline exactly.
  FR.inWater = function (hole, x, y) {
    var i, e, dx, dy, cr, sr, lx, ly;
    for (i = 0; i < hole.water.length; i++) {
      e = hole.water[i];
      dx = x - e.x; dy = y - e.y;
      cr = Math.cos(e.rot || 0); sr = Math.sin(e.rot || 0);
      lx = dx * cr + dy * sr; ly = -dx * sr + dy * cr;
      if (Math.hypot(lx, ly) <= FR.blobR(e, Math.atan2(ly, lx))) return true;
    }
    return false;
  };

  /* ---------------- hole generation ----------------
   * Landscape holes, tee at the left, cup at the right. Fairway is a seeded
   * chain of overlapping ellipses following a bent centerline (dogleg).
   * Greens play flat — break comes from wind and spin, not slopes. */

  FR.genHole = function (seed, opts) {
    opts = opts || {};
    var par = opts.par === 4 ? 4 : (opts.par === 5 ? 5 : 3);
    var stage = opts.stage | 0;
    var rng = FR.mulberry32(seed >>> 0);
    var W = 250, H = 110;

    var target = opts.len || (par === 3 ? 90 : (par === 4 ? 150 : 210));
    var L = target + (rng() * 2 - 1) * 5;

    var tee = { x: 18, y: 55 + (rng() * 2 - 1) * 8 };
    var dogleg = rng() < 0.35 ? 0 : (rng() < 0.5 ? -1 : 1);
    var bend = dogleg * (10 + rng() * 14);
    var cup = { x: Math.min(18 + L, W - 14), y: clamp(55 + bend, 22, 88) };

    // Centerline tee -> cup with a seeded dogleg bend.
    var pts = [{ x: tee.x, y: tee.y }];
    var nMid = par; // 3..5 interior points
    var dx0 = cup.x - tee.x, dy0 = cup.y - tee.y;
    var dl0 = Math.hypot(dx0, dy0) || 1;
    var pnx = -dy0 / dl0, pny = dx0 / dl0; // unit perpendicular
    var i, f;
    for (i = 1; i <= nMid; i++) {
      f = i / (nMid + 1);
      var off = Math.sin(f * Math.PI) * bend * (0.55 + rng() * 0.5);
      pts.push({ x: clamp(tee.x + dx0 * f + pnx * off, 12, W - 12),
                 y: clamp(tee.y + dy0 * f + pny * off, 12, H - 12) });
    }
    pts.push({ x: cup.x, y: cup.y });

    function distToLine(x, y) {
      var d = Infinity, j;
      for (j = 0; j < pts.length - 1; j++)
        d = Math.min(d, segDist(x, y, pts[j].x, pts[j].y, pts[j + 1].x, pts[j + 1].y));
      return d;
    }

    // Fairway: overlapping ellipses along the centerline.
    var fwHalf = 7 + rng() * 2;
    var fairway = [];
    for (i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      var sl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      fairway.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
                     rx: sl / 2 + 6, ry: fwHalf,
                     rot: Math.atan2(b.y - a.y, b.x - a.x) });
    }

    // Green ellipse holds the cup.
    var green = { x: cup.x, y: cup.y, rx: 11 + rng() * 3, ry: 8 + rng() * 2,
                  rot: (rng() - 0.5) * 0.4 };

    // Sand: 2..4 traps. Some guard the green, others dot the fairway edge.
    var sand = [];
    var nSand = 2 + ((rng() * 3) | 0);
    for (i = 0; i < nSand; i++) {
      for (var st = 0; st < 14; st++) {
        var se;
        if (rng() < 0.45) {
          var ba = rng() * TAU;
          var bd = green.rx + 2.5 + rng() * 3.5;
          se = { x: cup.x + Math.cos(ba) * bd, y: cup.y + Math.sin(ba) * bd * 0.8,
                 rx: 3.2 + rng() * 2.4, ry: 2.4 + rng() * 2.0, rot: rng() * TAU };
        } else {
          var fp = pts[1 + ((rng() * (pts.length - 2)) | 0)];
          var fa = rng() * TAU;
          var fd = fwHalf + 3 + rng() * 5;
          se = { x: fp.x + Math.cos(fa) * fd, y: fp.y + Math.sin(fa) * fd,
                 rx: 3.4 + rng() * 2.8, ry: 2.5 + rng() * 2.2, rot: rng() * TAU };
        }
        se.x = clamp(se.x, 8, W - 8);
        se.y = clamp(se.y, 10, H - 8);
        var sok = dist2(se.x, se.y, tee.x, tee.y) > 100 &&   // >= 10 from tee
                  dist2(se.x, se.y, cup.x, cup.y) > Math.pow(green.rx + 1, 2) &&
                  distToLine(se.x, se.y) > fwHalf + 1;      // off the fairway
        for (var s0 = 0; sok && s0 < sand.length; s0++) {
          if (dist2(se.x, se.y, sand[s0].x, sand[s0].y) <
              Math.pow(se.rx + sand[s0].rx + 2, 2)) sok = false;
        }
        if (sok) { sand.push(se); break; }
      }
    }

    // Water: organic blobs, always clear of the fairway line.
    var water = [];
    var wantW = par === 5 ? (rng() < 0.7 ? 2 : 1)
              : par === 4 ? (rng() < 0.5 ? 1 : 0)
              : (rng() < 0.25 ? 1 : 0);
    for (i = 0; i < wantW; i++) {
      for (var wt = 0; wt < 16; wt++) {
        var we = { x: 14 + rng() * (W - 28), y: 14 + rng() * (H - 28),
                   rx: 4 + rng() * 3, ry: 3 + rng() * 2.5, rot: rng() * TAU };
        if (distToLine(we.x, we.y) < fwHalf + we.rx + 4) continue;
        if (dist2(we.x, we.y, tee.x, tee.y) < 144) continue;
        if (dist2(we.x, we.y, cup.x, cup.y) < Math.pow(green.rx + we.rx + 3, 2)) continue;
        var wok = true, wj;
        for (wj = 0; wok && wj < sand.length; wj++)
          if (dist2(we.x, we.y, sand[wj].x, sand[wj].y) <
              Math.pow(we.rx + sand[wj].rx + 2, 2)) wok = false;
        for (wj = 0; wok && wj < water.length; wj++)
          if (dist2(we.x, we.y, water[wj].x, water[wj].y) <
              Math.pow(we.rx + water[wj].rx + 3, 2)) wok = false;
        if (wok) { we.blob = FR.waterBlob(we); water.push(we); break; }
      }
    }

    // Trees: circle bumpers in the rough, clear of play lines.
    var trees = [];
    var nTrees = 5 + ((rng() * 6) | 0); // 5..10
    for (i = 0; i < nTrees; i++) {
      for (var tt = 0; tt < 14; tt++) {
        var tx = 8 + rng() * (W - 16), ty = 10 + rng() * (H - 20);
        var tr = 1.6 + rng() * 1.0;
        if (distToLine(tx, ty) < fwHalf + tr + 3) continue;
        if (dist2(tx, ty, cup.x, cup.y) < Math.pow(green.rx + 5, 2)) continue;
        if (dist2(tx, ty, tee.x, tee.y) < 64) continue;
        var tok = true, tj;
        for (tj = 0; tok && tj < trees.length; tj++)
          if (dist2(tx, ty, trees[tj].x, trees[tj].y) <
              Math.pow(tr + trees[tj].r + 1.5, 2)) tok = false;
        if (tok) { trees.push({ x: tx, y: ty, r: tr }); break; }
      }
    }

    return {
      seed: seed >>> 0,
      par: par,
      stage: stage,
      w: W, h: H,
      tee: tee,
      cup: cup,
      green: green,       // ellipse {x,y,rx,ry,rot}; holds the cup
      fairway: fairway,   // chain of ellipses {x,y,rx,ry,rot} tee->green
      sand: sand,         // ellipses
      water: water,       // blobs with seeded shorelines
      trees: trees,       // circles {x,y,r}
      dogleg: dogleg      // -1 | 0 | 1
    };
  };

  // Short par-3 for shootout tiebreaks: closest to the pin wins.
  FR.shootoutHole = function (seed) {
    return FR.genHole((seed >>> 0) ^ 0x9e3779b9, { par: 3, len: 55, stage: 0 });
  };

  /* ---------------- ball ---------------- */

  FR.surfaceAt = function (hole, x, y) {
    var i;
    for (i = 0; i < hole.sand.length; i++)
      if (inEllipse(x, y, hole.sand[i])) return 'sand';
    if (inEllipse(x, y, hole.green)) return 'green';
    for (i = 0; i < hole.fairway.length; i++)
      if (inEllipse(x, y, hole.fairway[i])) return 'fairway';
    return 'rough';
  };

  // UI debuff readout: exactly 0.2 in rough/sand, else 0.
  FR.debuffAt = function (hole, x, y) {
    var s = FR.surfaceAt(hole, x, y);
    return (s === 'rough' || s === 'sand') ? 0.2 : 0;
  };

  FR.newBall = function (hole) {
    return {
      x: hole.tee.x, y: hole.tee.y,
      vx: 0, vy: 0,
      vz: 0, z: 0,          // height above the course; 0 = on the ground
      state: 'rest',        // 'rest' | 'moving' | 'cup'
      strokes: 0,
      lie: FR.surfaceAt(hole, hole.tee.x, hole.tee.y),
      spinT: 0,             // -1 (backspin, bites) .. +1 (topspin, runs on)
      spinS: 0,             // side spin: lateral Magnus accel while airborne
      wind: { angle: 0, mph: 0 },
      _drop: { x: hole.tee.x, y: hole.tee.y }, // penalty drop point
      stillT: 0,            // stuck-ball guard
      impact: 0             // hardest knock this shot (for juice)
    };
  };

  // Internal: convert shot params into velocity. Shared by applyShot and
  // guideline so the preview matches the real shot exactly.
  // o: {angle, power01, needle01, overpower, club, level, wind:{angle,mph},
  //     spin:{top,side}}. needle01 in [-1,1], 0 = dead center.
  function _doShot(ball, o) {
    var club = o.club, level = clamp(o.level | 0 || 1, 1, 7);
    var stats = FR.clubStats(club, level);
    // Needle error: the faster the needle, the wider the miss. Overpower
    // multiplies needle speed x2.2 (more distance AND wider error).
    var ns = FR.needleSpeed(club, level) * (o.overpower ? FR.NEEDLE_OP_K : 1);
    var errK = ns / FR.NEEDLE_BASE;
    var n01 = clamp(o.needle01 || 0, -1, 1);
    var ang = (o.angle || 0) + n01 * FR.ANG_ERR * errK;
    var speed = clamp(o.power01 || 0, 0, 1) * stats.power *
                (o.overpower ? FR.OVERPOWER_K : 1);
    speed *= 1 + n01 * FR.DIST_ERR * errK;
    if (speed < 0) speed = 0;
    ball._drop = { x: ball.x, y: ball.y };
    ball.vx = Math.cos(ang) * speed;
    ball.vy = Math.sin(ang) * speed;
    ball.z = 0; ball.vz = 0;
    // Hard shots leave the ground: the harder the hit, the higher the arc.
    var excess = speed - FR.LAUNCH_MIN;
    if (excess > 0) {
      ball.vz = excess * FR.LAUNCH_K;
      ball.z = 0.1;
    }
    var sp = o.spin || {};
    ball.spinT = clamp((+sp.top || 0) + stats.spin * 0.3, -1, 1);
    ball.spinS = clamp(+sp.side || 0, -1, 1);
    var w = o.wind || {};
    ball.wind = { angle: w.angle || 0, mph: Math.max(0, w.mph || 0) };
    ball.stillT = 0;
    ball.impact = 0;
    ball.state = 'moving';
  }

  // Deterministic shot. Increments strokes.
  FR.applyShot = function (ball, o) {
    _doShot(ball, o);
    ball.strokes += 1;
    return ball;
  };

  // One internal physics sub-step of length dt. Returns events for the step.
  function stepOnce(hole, ball, dt) {
    var evs = [];
    if (ball.state !== 'moving') return evs;
    var R = FR.BALL_R;
    var i;

    // ---- airborne: ballistic z arc, wind bites harder ----
    if (ball.z > 0 || ball.vz !== 0) {
      var wa = ball.wind.mph * FR.WIND_K_AIR;
      ball.vx += Math.cos(ball.wind.angle) * wa * dt;
      ball.vy += Math.sin(ball.wind.angle) * wa * dt;
      var asp = Math.hypot(ball.vx, ball.vy);
      if (asp > 4 && ball.spinS !== 0) {
        var ck = ball.spinS * FR.SPIN_CURVE_K * Math.min(asp / 40, 1) / asp;
        ball.vx += -ball.vy * ck * dt;
        ball.vy += ball.vx * ck * dt;
      }
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.vz -= FR.GRAV_Z * dt;
      ball.z += ball.vz * dt;
      if (ball.z <= 0) {
        ball.z = 0;
        ball.impact = Math.max(ball.impact, -ball.vz * 0.5); // landing thud
        ball.vz = 0;
        ball.vx *= 0.82; ball.vy *= 0.82; // touchdown scrub
        ball.spinT = 0; ball.spinS = 0;
        evs.push({ t: 'bounce', x: ball.x, y: ball.y });
      }
      // world walls still apply mid-flight (can't leave the world)
      if (ball.x < R) { ball.x = R; if (ball.vx < 0) ball.vx = 0; }
      else if (ball.x > hole.w - R) { ball.x = hole.w - R; if (ball.vx > 0) ball.vx = 0; }
      if (ball.y < R) { ball.y = R; if (ball.vy < 0) ball.vy = 0; }
      else if (ball.y > hole.h - R) { ball.y = hole.h - R; if (ball.vy > 0) ball.vy = 0; }
      return evs;
    }

    // ---- grounded ----
    if (FR.inWater(hole, ball.x, ball.y)) {
      evs.push({ t: 'water', x: ball.x, y: ball.y });
      ball.strokes += 1; // penalty stroke
      ball.x = ball._drop.x; ball.y = ball._drop.y; // drop where the shot began
      ball.vx = 0; ball.vy = 0; ball.vz = 0; ball.z = 0;
      ball.state = 'rest';
      ball.lie = FR.surfaceAt(hole, ball.x, ball.y);
      return evs;
    }
    var surf = FR.surfaceAt(hole, ball.x, ball.y);
    var P = FR.SURF[surf] || FR.SURF.rough;

    // Wind: real pressure force, weaker in sand. Greens play flat, so wind
    // (and spin) is where putt break comes from.
    var wg = ball.wind.mph * FR.WIND_K * (surf === 'sand' ? 0.3 : 1);
    var wvx = Math.cos(ball.wind.angle) * wg, wvy = Math.sin(ball.wind.angle) * wg;

    // Spin shapes effective friction: topspin runs on, backspin bites.
    var fr = P.fr * (1 - 0.45 * ball.spinT);
    if (fr < 1) fr = 1;

    ball.vx += wvx * dt;
    ball.vy += wvy * dt;

    // Rolling resistance: Coulomb decel + exponential damping.
    var sp = Math.hypot(ball.vx, ball.vy);
    if (sp > 0) {
      var nsp = sp - fr * dt;
      if (nsp < 0) nsp = 0;
      nsp *= Math.exp(-P.damp * dt);
      var kk = nsp / sp;
      ball.vx *= kk; ball.vy *= kk;
      sp = nsp;
    }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.spinT *= Math.exp(-1.4 * dt); // spin dies as the ball rolls
    ball.spinS *= Math.exp(-1.4 * dt);

    // Trees: circle bumpers.
    for (i = 0; i < hole.trees.length; i++) {
      var t2 = hole.trees[i];
      var tdx = ball.x - t2.x, tdy = ball.y - t2.y;
      var td = Math.sqrt(tdx * tdx + tdy * tdy);
      var minD = R + t2.r;
      if (td < minD && td > 0.0001) {
        var nx = tdx / td, ny = tdy / td;
        ball.x = t2.x + nx * minD;
        ball.y = t2.y + ny * minD;
        var vn = ball.vx * nx + ball.vy * ny;
        if (vn < 0) {
          ball.impact = Math.max(ball.impact, -vn);
          ball.vx -= (1 + FR.REST_TREE) * vn * nx;
          ball.vy -= (1 + FR.REST_TREE) * vn * ny;
          ball.vx *= 0.92; ball.vy *= 0.92;
          evs.push({ t: 'tree', x: ball.x, y: ball.y, impact: -vn });
        }
      }
    }

    // World walls: bounce, don't escape.
    if (ball.x < R) { ball.x = R; if (ball.vx < 0) { ball.impact = Math.max(ball.impact, -ball.vx); ball.vx = -ball.vx * FR.REST_WALL; } }
    else if (ball.x > hole.w - R) { ball.x = hole.w - R; if (ball.vx > 0) { ball.impact = Math.max(ball.impact, ball.vx); ball.vx = -ball.vx * FR.REST_WALL; } }
    if (ball.y < R) { ball.y = R; if (ball.vy < 0) { ball.impact = Math.max(ball.impact, -ball.vy); ball.vy = -ball.vy * FR.REST_WALL; } }
    else if (ball.y > hole.h - R) { ball.y = hole.h - R; if (ball.vy > 0) { ball.impact = Math.max(ball.impact, ball.vy); ball.vy = -ball.vy * FR.REST_WALL; } }

    // ---- cup magnet: slow grounded balls near the cup get a gentle pull ----
    if (ball.state === 'moving') {
      var mdx = hole.cup.x - ball.x, mdy = hole.cup.y - ball.y;
      var md = Math.sqrt(mdx * mdx + mdy * mdy);
      var msp = Math.hypot(ball.vx, ball.vy);
      if (md < FR.MAGNET_R && md > 0.001 && msp < FR.CAPTURE_V * 1.6) {
        var pull = (1 - md / FR.MAGNET_R) * 24;
        ball.vx += (mdx / md) * pull * dt;
        ball.vy += (mdy / md) * pull * dt;
      }
    }

    // ---- cup capture: close and slow -> in. Fast balls lip out. ----
    if (ball.state === 'moving') {
      var cdx = ball.x - hole.cup.x, cdy = ball.y - hole.cup.y;
      if (cdx * cdx + cdy * cdy < FR.CUP_R * FR.CUP_R &&
          Math.hypot(ball.vx, ball.vy) < FR.CAPTURE_V) {
        ball.state = 'cup';
        ball.x = hole.cup.x; ball.y = hole.cup.y;
        ball.vx = 0; ball.vy = 0;
        evs.push({ t: 'cup', x: ball.x, y: ball.y });
        return evs;
      }
    }

    // ---- rest: slow enough that friction holds it against the wind ----
    var spdNow = Math.hypot(ball.vx, ball.vy);
    if (spdNow < 1.0) ball.stillT += dt; else ball.stillT = 0;
    if ((spdNow < 0.9 && Math.hypot(wvx, wvy) < fr) || ball.stillT > 2.5) {
      ball.vx = 0; ball.vy = 0;
      ball.state = 'rest';
      ball.stillT = 0;
      ball.lie = FR.surfaceAt(hole, ball.x, ball.y);
      // Unplayable lie (wedged against a tree trunk): OB drop, +1.
      for (var q = 0; q < hole.trees.length; q++) {
        var tr = hole.trees[q];
        if (dist2(ball.x, ball.y, tr.x, tr.y) < (tr.r + 0.5) * (tr.r + 0.5)) {
          evs.push({ t: 'ob', x: ball.x, y: ball.y });
          ball.strokes += 1;
          ball.x = ball._drop.x; ball.y = ball._drop.y;
          ball.lie = FR.surfaceAt(hole, ball.x, ball.y);
          break;
        }
      }
      evs.push({ t: 'rest', x: ball.x, y: ball.y, lie: ball.lie });
    }
    return evs;
  }

  // Advances dt seconds of physics at a fixed 1/60 s timestep, sub-stepping
  // internally when the ball is fast. Returns the events that fired.
  // Events: {t:'bounce'|'rest'|'cup'|'water'|'ob'|'tree', x, y}.
  FR.stepShot = function (hole, ball, dt) {
    var evs = [];
    if (!(dt > 0)) dt = FR.DT;
    var remaining = Math.min(dt, 30); // cap runaway sims
    while (remaining > 1e-9 && ball.state === 'moving') {
      var step = Math.min(FR.DT, remaining);
      var speed = Math.hypot(ball.vx, ball.vy);
      var n = Math.ceil(speed * step / (FR.BALL_R * 0.5));
      if (n < 1) n = 1;
      if (n > 48) n = 48;
      var sdt = step / n;
      for (var i = 0; i < n; i++) {
        var e2 = stepOnce(hole, ball, sdt);
        for (var j = 0; j < e2.length; j++) evs.push(e2[j]);
        if (ball.state !== 'moving') break;
      }
      remaining -= step;
    }
    return evs;
  };

  // Predicted path (bounce + roll), sampled points. Pure: the input ball
  // is never mutated. Length scales with the club's guide factor.
  FR.guideline = function (hole, ball, o) {
    var c = { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy,
              vz: ball.vz || 0, z: ball.z || 0,
              state: 'rest', strokes: 0, lie: ball.lie,
              spinT: 0, spinS: 0, wind: { angle: 0, mph: 0 },
              _drop: { x: ball.x, y: ball.y }, stillT: 0, impact: 0 };
    _doShot(c, o); // strokes are not counted on the clone
    var pts = [{ x: c.x, y: c.y }];
    var t = 0, tick = 0;
    while (c.state === 'moving' && t < 15) {
      stepOnce(hole, c, FR.DT);
      t += FR.DT; tick++;
      if (tick % 3 === 0) pts.push({ x: c.x, y: c.y });
    }
    pts.push({ x: c.x, y: c.y });
    var g = o.club ? FR.clubStats(o.club, o.level || 1).guide : 1;
    var keep = Math.max(2, Math.ceil(pts.length * clamp(g, 0, 1)));
    return pts.slice(0, keep);
  };

  /* ---------------- clubs ----------------
   * 2 clubs per category x 5 categories, levels 1-7. All names original.
   * power/acc/spin/guide are per-level arrays (index 0 = level 1).
   * acc is an accuracy stat: higher level -> slower needle -> easier.
   * cards: cards needed to upgrade from that level to the next. */

  var CLUB_DEFS = [
    // id,          name,         cat,      p1,   dp,  a1,   da,    s1,   ds,   g1,   dg,   lo,  hi
    ['longhorn',   'Longhorn',   'driver',  56,  2.2, 0.10, 0.085, 0.50, 0.02, 0.75, 0.02, 115, 200],
    ['mammoth',    'Mammoth',    'driver',  60,  2.4, 0.06, 0.080, 0.55, 0.02, 0.70, 0.02, 115, 200],
    ['timberline', 'Timberline', 'wood',    48,  2.0, 0.14, 0.090, 0.35, 0.02, 0.80, 0.02,  85, 130],
    ['copperline', 'Copperline', 'wood',    51,  2.1, 0.10, 0.085, 0.40, 0.02, 0.76, 0.02,  85, 130],
    ['anvil',      'Anvil',      'iron',    40,  1.8, 0.18, 0.095, 0.10, 0.02, 0.85, 0.015, 50,  95],
    ['blacksmith', 'Blacksmith', 'iron',    43,  1.9, 0.14, 0.090, 0.15, 0.02, 0.82, 0.015, 50,  95],
    ['scalpel',    'Scalpel',    'wedge',   30,  1.5, 0.24, 0.100, -0.20, 0.02, 0.95, 0.008, 18,  55],
    ['falcon',     'Falcon',     'wedge',   32,  1.6, 0.20, 0.095, -0.15, 0.02, 0.93, 0.010, 18,  55],
    ['digger',     'Digger',     'swedge',  26,  1.4, 0.22, 0.100, -0.35, 0.02, 0.90, 0.012, 10,  45],
    ['badger',     'Badger',     'swedge',  28,  1.5, 0.26, 0.105, -0.30, 0.02, 0.92, 0.010, 10,  45]
  ];

  FR.CLUBS = CLUB_DEFS.map(function (d) {
    var power = [], acc = [], spin = [], guide = [], l;
    for (l = 0; l < 7; l++) {
      power.push(+(d[3] + d[4] * l).toFixed(2));
      acc.push(+(d[5] + d[6] * l).toFixed(3));
      spin.push(+(d[7] + d[8] * l).toFixed(3));
      guide.push(+Math.min(1, d[9] + d[10] * l).toFixed(3));
    }
    return { id: d[0], name: d[1], cat: d[2],
             power: power, acc: acc, spin: spin, guide: guide,
             range: [d[11], d[12]],
             cards: [10, 20, 50, 100, 200, 400] };
  });

  function clubById(id) {
    for (var i = 0; i < FR.CLUBS.length; i++)
      if (FR.CLUBS[i].id === id) return FR.CLUBS[i];
    return null;
  }

  // club may be an id string or a CLUBS entry. Returns leveled stats.
  FR.clubStats = function (club, level) {
    var c = typeof club === 'string' ? clubById(club) : club;
    if (!c) c = FR.CLUBS[0];
    var lv = clamp(level | 0 || 1, 1, 7) - 1;
    return { power: c.power[lv], acc: c.acc[lv],
             spin: c.spin[lv], guide: c.guide[lv] };
  };

  // Needle sweep speed in rad/s. Higher club level -> slower needle.
  // Overpower multiplies x2.2 (applied in _doShot, not here).
  FR.needleSpeed = function (club, level) {
    return FR.NEEDLE_BASE / (1 + FR.clubStats(club, level).acc);
  };

  // Honest upgrade math: {cards, coins} to go from level -> level+1.
  // Returns null at max level (7) or for unknown clubs.
  FR.upgradeCost = function (clubId, level) {
    var c = clubById(clubId);
    if (!c) return null;
    var lv = level | 0;
    if (lv < 1 || lv >= 7) return null;
    return { cards: c.cards[lv - 1], coins: 100 * Math.pow(3, lv - 1) };
  };

  // Pick a club by distance-to-pin band and lie. bag = {clubId: level}.
  FR.autoClub = function (hole, ball, bag) {
    var owned = FR.CLUBS.filter(function (c) { return bag && bag[c.id] != null; });
    if (!owned.length) return null;
    function bestOf(list) { // highest level wins; ties keep order
      var b = list[0], i;
      for (i = 1; i < list.length; i++)
        if ((bag[list[i].id] | 0) > (bag[b.id] | 0)) b = list[i];
      return b.id;
    }
    var lie = FR.surfaceAt(hole, ball.x, ball.y);
    var dist = Math.hypot(hole.cup.x - ball.x, hole.cup.y - ball.y);
    var pool = owned;
    if (lie === 'sand') {
      pool = owned.filter(function (c) { return c.cat === 'swedge'; });
    } else if (lie === 'green' || dist < 30) {
      pool = owned.filter(function (c) { return c.cat === 'wedge'; });
    } else {
      var inBand = owned.filter(function (c) {
        return dist >= c.range[0] && dist <= c.range[1];
      });
      if (inBand.length) {
        pool = inBand;
      } else {
        var sorted = owned.slice().sort(function (a, b) { return b.range[1] - a.range[1]; });
        if (dist > sorted[0].range[1]) {
          pool = [sorted[0]]; // beyond everything: longest club
        } else {
          var above = owned.filter(function (c) { return c.range[1] >= dist; })
                           .sort(function (a, b) { return a.range[1] - b.range[1]; });
          pool = above.length ? [above[0]] : [sorted[sorted.length - 1]];
        }
      }
    }
    if (!pool.length) pool = owned;
    return bestOf(pool);
  };

  /* ---------------- bots ----------------
   * Produces human-like shot params (the UI labels bots honestly; the sim
   * just produces the numbers). skill01 spreads needle error and decision
   * quality. Deterministic for a given rng stream. */

  // Rough carry+roll distance estimate for a launch speed v on friction fr.
  // Closed form: ballistic air phase, touchdown scrub x0.82, then rolling
  // with Coulomb decel fr plus exponential damping (matches stepOnce).
  // Used by the bot to judge power. Exposed for tests.
  FR._carryEst = function (v, fr, damp) {
    var P = FR.SURF.fairway;
    fr = fr == null ? P.fr : fr;
    damp = damp == null ? P.damp : damp;
    var air = 0, vv = v;
    if (v > FR.LAUNCH_MIN) {
      var vz = (v - FR.LAUNCH_MIN) * FR.LAUNCH_K;
      air = 2 * vz / FR.GRAV_Z * v * 0.9;
      vv = v * 0.82; // touchdown scrub
    }
    var k = damp * vv / fr;                 // > 0
    var t = Math.log(1 + k) / damp;         // roll time to v=0
    var roll = (vv + fr / damp) * (k / (1 + k)) / damp - (fr / damp) * t;
    return air + Math.max(0, roll);
  };

  FR.botShot = function (hole, ball, club, level, skill01, rng) {
    rng = rng || FR.mulberry32(1);
    var skill = clamp(skill01 == null ? 0.5 : skill01, 0, 1);
    var stats = FR.clubStats(club, level);
    var dx = hole.cup.x - ball.x, dy = hole.cup.y - ball.y;
    var dist = Math.hypot(dx, dy) || 0.001;
    var baseAng = Math.atan2(dy, dx);
    // Aim error: low skill sprays, high skill aims at the pin.
    var aimErr = (rng() * 2 - 1) * (1 - skill) * 0.10;
    // Power: binary-search the power01 whose estimated carry matches dist.
    var lo = 0.15, hi = 1.0, it, mid, est;
    for (it = 0; it < 18; it++) {
      mid = (lo + hi) / 2;
      est = FR._carryEst(mid * stats.power, FR.SURF.fairway.fr);
      if (est < dist) lo = mid; else hi = mid;
    }
    var power01 = clamp((lo + hi) / 2 * (0.94 + rng() * 0.12 * (1 - skill)), 0.15, 1);
    var needle01 = (rng() * 2 - 1) * (1 - skill);
    var maxReach = FR._carryEst(stats.power, FR.SURF.fairway.fr);
    var overpower = dist > maxReach ? true : (rng() < 0.15 * (1 - skill));
    var spin = { top: (rng() * 2 - 1) * 0.6 * (1 - skill * 0.5),
                 side: (rng() * 2 - 1) * 0.6 * (1 - skill) };
    return { angle: baseAng + aimErr,
             power01: power01,
             needle01: needle01,
             overpower: overpower,
             spin: spin,
             thinkMs: Math.round(5000 + rng() * 20000) }; // 5s..25s, human-like
  };

  /* ---------------- match / trophy math (pure) ---------------- */

  // Trophy swing per duel result. Higher stages swing harder.
  FR.trophyDelta = function (result, stage) {
    var s = Math.max(0, stage | 0);
    if (result === 'win') return Math.max(10, 40 - 2 * s);
    if (result === 'loss') return -Math.min(70, 25 + 3 * s);
    return 0; // draw
  };

  // Stage thresholds. Monotonic by construction: a stage, once reached,
  // can never re-lock (higher trophy counts only map to >= stages).
  var STAGE_T = [0, 120, 320, 650, 1100, 1700, 2400, 3300, 4400, 5700];
  FR.stageFor = function (trophies) {
    var t = Math.max(0, trophies | 0), st = 0, i;
    for (i = 0; i < STAGE_T.length; i++) if (t >= STAGE_T[i]) st = i;
    return st;
  };

  // Chest pity: an epic-or-better is guaranteed every 10th chest.
  // opened = chests opened so far. Pure counter state for the UI.
  FR.chestPity = function (opened) {
    var o = Math.max(0, opened | 0);
    var since = o % 10;
    return { opened: o, sinceEpic: since, epicIn: 10 - since };
  };

  // Pin chest: play 7 holes -> chest. Pure progress state for the UI.
  FR.pinProgress = function (holesPlayed) {
    var p = Math.max(0, holesPlayed | 0);
    return { played: p, target: 7, remaining: Math.max(0, 7 - p), ready: p >= 7 };
  };

  /* ---------------- ghost tapes ----------------
   * Deterministic replay of a round's shots. Shots are frozen to a
   * canonical JSON-safe shape on record, so tapes JSON-round-trip. */

  FR.newTape = function () { return []; };

  FR.tapeShot = function (tape, shot) {
    var sp = shot.spin || {}, w = shot.wind || {};
    tape.push({
      angle: +shot.angle || 0,
      power01: +shot.power01 || 0,
      needle01: +shot.needle01 || 0,
      overpower: !!shot.overpower,
      clubId: String(shot.clubId || ''),
      level: (shot.level | 0) || 1,
      spin: { top: +sp.top || 0, side: +sp.side || 0 },
      wind: { angle: +w.angle || 0, mph: +w.mph || 0 }
    });
    return tape;
  };

  function deepEq(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a && b && typeof a === 'object') {
      var ka = Object.keys(a), kb = Object.keys(b), i;
      if (ka.length !== kb.length) return false;
      for (i = 0; i < ka.length; i++)
        if (!Object.prototype.hasOwnProperty.call(b, ka[i])) return false;
      for (i = 0; i < ka.length; i++)
        if (!deepEq(a[ka[i]], b[ka[i]])) return false;
      return true;
    }
    // NaN-safe number compare
    return a !== a && b !== b;
  }

  FR.tapesEqual = function (a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++)
      if (!deepEq(a[i], b[i])) return false;
    return true;
  };

  /* ---------------- export ---------------- */

  if (typeof module !== 'undefined' && module.exports) module.exports = FR;
  else if (typeof globalThis !== 'undefined') globalThis.FR = FR;
  else if (typeof window !== 'undefined') window.FR = FR;
  else if (typeof self !== 'undefined') self.FR = FR;

})();
