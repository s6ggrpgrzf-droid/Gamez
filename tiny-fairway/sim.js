/* Tiny Fairway — top-down arcade-golf simulation.
 *
 * Pure planar (top-down) physics on a portrait hole: the whole green is
 * visible at once. Zero DOM, no Math.random (mulberry32 only). Fixed 1/60 s
 * timestep with internal sub-stepping for fast movers. Loads as a plain
 * script and exposes everything on the global TF object.
 *
 * World: W=56 x H=96 units, y-up. Tee near the bottom, cup toward the top.
 * Surfaces: green (fast), fairway (medium), rough (slow), sand (very slow),
 * water (penalty). A seeded slope field makes putts break; trees are
 * circle bumpers. */

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

  // FNV-1a 32-bit hash of a date string like '2026-10-08'. Same date
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

  TF.W = 56;
  TF.H = 96;
  TF.BALL_R = 0.9;    // ball radius
  TF.CUP_R = 2.0;     // cup capture radius
  TF.MAX_POWER = 46;  // max shot speed (full drag)
  TF.OVERDRIVE_MAX = 58; // super-shot cap (OK Golf-style overdrive)
  TF.DT = 1 / 60;     // fixed physics step
  TF.CAPTURE_V = 9;   // max speed for cup capture
  TF.MAGNET_R = 5.0;  // cup magnet reach (generous, Mini Touch Golf)
  TF.REST_TREE = 0.5; // restitution off trees / walls
  TF.REST_WALL = 0.7; // restitution off banked mini-golf walls
  TF.GRAV_Z = 55;     // vertical gravity for ramp jumps (u/s^2)
  TF.WIND_K = 1.3;    // wind pressure accel rate (putts feel it, drives barely do)
  TF.WIND_K_AIR = 1.6;// wind bites harder when airborne (real)
  TF.LAUNCH_MIN = 26; // shots harder than this leave the ground
  TF.LAUNCH_K = 0.6;  // launch velocity per unit of excess speed

  // Per-surface rolling resistance: linear decel (u/s^2) + exponential
  // damping (/s). Tuned so a full-power drive carries ~55-65 units on
  // fairway, dies in the rough, and putts feel crisp on the green.
  TF.SURF = {
    green:   { fr: 8,  damp: 0.30 },
    fairway: { fr: 13.5, damp: 0.42 },
    rough:   { fr: 30, damp: 1.10 },
    sand:    { fr: 46, damp: 1.90 }
  };

  var TAU = 6.283185307179586;

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

  // Pond shorelines: every water blob carries BLOB_N seeded radius multipliers
  // (0.78..1.18), so ponds render as organic blobs instead of perfect ellipses.
  // The blob is derived from the pond's own coordinates, never the hole rng
  // stream, so existing seeds generate identical layouts.
  var BLOB_N = 12;
  function hashXY(x, y) {
    var h = (Math.round(x * 64) * 374761393 + Math.round(y * 64) * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return (h ^ (h >>> 16)) >>> 0;
  }
  TF.waterBlob = function (e) {
    var r = TF.mulberry32(hashXY(e.x + e.rx * 0.37, e.y + e.ry * 0.73));
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
  TF.blobR = function (e, th) {
    var c = Math.cos(th), s = Math.sin(th);
    var re = (e.rx * e.ry) / Math.sqrt(e.ry * e.ry * c * c + e.rx * e.rx * s * s + 1e-9);
    var t = th / TAU; t = t - Math.floor(t);
    return re * smoothBlob(e.blob, t);
  };
  // Point-in-pond test; matches the rendered shoreline exactly.
  TF.inWater = function (px, py, e) {
    if (!e.blob) return inEllipse(px, py, e); // legacy data without a shoreline
    var dx = px - e.x, dy = py - e.y;
    var cr = Math.cos(e.rot || 0), sr = Math.sin(e.rot || 0);
    var lx = dx * cr + dy * sr, ly = -dx * sr + dy * cr;
    return Math.hypot(lx, ly) <= TF.blobR(e, Math.atan2(ly, lx));
  };

  /* ---------------- hole generation ---------------- */

  // opts: {breather} softens a hole after a killer (fewer hazards, no water);
  //       {twoRoute} puts water on the direct tee->cup line so the risky
  //       carry and the safe dogleg both exist (OK Golf / A Little Golf Journey).
  TF.genHole = function (seed, opts) {
    opts = opts || {};
    var rng = TF.mulberry32(seed >>> 0);
    var W = TF.W, H = TF.H;

    // Cup + green.
    var cupX = 14 + rng() * 28;          // 14..42
    var cupY = 74 + rng() * 14;          // 74..88
    var green = {
      x: cupX, y: cupY,
      rx: 9 + rng() * 3, ry: 7 + rng() * 2.5,
      rot: (rng() - 0.5) * 0.6
    };

    // Tee.
    var teeX = 18 + rng() * 20;          // 18..38
    var teeY = 7 + rng() * 4;            // 7..11

    // Centerline tee -> cup with a possible dogleg. The fairway follows it,
    // so a chain of sensible shots along it always solves the hole.
    var pts = [{ x: teeX, y: teeY }];
    var nMid = 2 + ((rng() * 2) | 0);    // 2..3 interior points
    var dogleg = rng() < 0.45 || !!opts.twoRoute;
    var bendDir = rng() < 0.5 ? -1 : 1;
    var bendAmt = opts.twoRoute ? 14 + rng() * 8
                : dogleg ? 10 + rng() * 8 : 4 + rng() * 5;
    var dx0 = cupX - teeX, dy0 = cupY - teeY;
    var dl0 = Math.hypot(dx0, dy0) || 1;
    var pnx = -dy0 / dl0, pny = dx0 / dl0;  // unit perpendicular
    var i, f, cx, cy;
    for (i = 1; i <= nMid; i++) {
      f = i / (nMid + 1);
      cx = teeX + dx0 * f + pnx * Math.sin(f * Math.PI) * bendAmt * bendDir * (0.6 + rng() * 0.7);
      cy = teeY + dy0 * f + pny * Math.sin(f * Math.PI) * bendAmt * bendDir * 0.2;
      pts.push({ x: clamp(cx, 8, W - 8), y: clamp(cy, 14, H - 10) });
    }
    pts.push({ x: cupX, y: cupY });

    var fwR = 7 + rng() * 2;             // fairway half-width
    var fairway = [];
    for (i = 0; i < pts.length - 1; i++) {
      fairway.push({ x1: pts[i].x, y1: pts[i].y,
                     x2: pts[i + 1].x, y2: pts[i + 1].y, r: fwR });
    }

    function distToFairway(x, y) {
      var d = Infinity, j;
      for (j = 0; j < fairway.length; j++) {
        var s = fairway[j];
        var dd = segDist(x, y, s.x1, s.y1, s.x2, s.y2) - s.r;
        if (dd < d) d = dd;
      }
      return d;  // <= 0 means on the fairway
    }

    // Sand: 1..3 traps. Some guard the green, others dot the fairway edge.
    var sand = [];
    var nSand = 1 + ((rng() * 3) | 0);   // 1..3
    if (opts.breather && nSand > 1) nSand = 1;
    for (i = 0; i < nSand; i++) {
      for (var tries = 0; tries < 14; tries++) {
        var se;
        if (rng() < 0.45) {
          // green-side bunker: ring around the cup, clear of the green
          var ba = rng() * TAU;
          var bd = green.rx + 2.5 + rng() * 3.5;
          se = { x: cupX + Math.cos(ba) * bd, y: cupY + Math.sin(ba) * bd * 0.8,
                 rx: 2.6 + rng() * 2.2, ry: 2.0 + rng() * 1.8, rot: rng() * TAU };
        } else {
          // fairway-edge trap: near the centerline but off it
          var fp = pts[(rng() * (pts.length - 1)) | 0];
          var fa = rng() * TAU;
          var fd = fwR + 1.5 + rng() * 4;
          se = { x: fp.x + Math.cos(fa) * fd, y: fp.y + Math.sin(fa) * fd,
                 rx: 2.8 + rng() * 2.6, ry: 2.1 + rng() * 2.0, rot: rng() * TAU };
        }
        se.x = clamp(se.x, 5, W - 5);
        se.y = clamp(se.y, 12, H - 6);
        var sok = dist2(se.x, se.y, teeX, teeY) > 64 &&   // >= 8 from tee
                  !inEllipse(cupX, cupY, se);              // never covers the cup
        // keep traps off the centerline: the safe route stays clean
        if (sok) {
          var maj = Math.max(se.rx, se.ry);
          for (var f0 = 0; sok && f0 < fairway.length; f0++) {
            var fs = fairway[f0];
            if (segDist(se.x, se.y, fs.x1, fs.y1, fs.x2, fs.y2) < maj + 1) sok = false;
          }
        }
        for (var w0 = 0; sok && w0 < sand.length; w0++) {
          if (dist2(se.x, se.y, sand[w0].x, sand[w0].y) <
              Math.pow(se.rx + sand[w0].rx + 1.5, 2)) sok = false;
        }
        if (sok) { sand.push(se); break; }
      }
    }

    // Water: blobs. twoRoute centers one on the direct line (risky carry);
    // the doglegged fairway is the safe route around it.
    var water = [];
    function clearOfHazards(e, margin) {
      if (dist2(e.x, e.y, teeX, teeY) < 100) return false;
      if (inEllipse(cupX, cupY, { x: e.x, y: e.y, rx: e.rx + 2, ry: e.ry + 2, rot: e.rot })) return false;
      var j;
      for (j = 0; j < sand.length; j++)
        if (dist2(e.x, e.y, sand[j].x, sand[j].y) < Math.pow(e.rx + sand[j].rx + (margin || 1.5), 2)) return false;
      for (j = 0; j < water.length; j++)
        if (dist2(e.x, e.y, water[j].x, water[j].y) < Math.pow(e.rx + water[j].rx + (margin || 1.5), 2)) return false;
      return true;
    }
    if (!opts.breather && (rng() < 0.55 || opts.twoRoute)) {
      for (var wt = 0; wt < 14; wt++) {
        var we;
        if (opts.twoRoute && water.length === 0) {
          // On the direct tee->cup line, midway.
          var wf = 0.4 + rng() * 0.25;
          we = { x: teeX + dx0 * wf, y: teeY + dy0 * wf,
                 rx: 4 + rng() * 2.5, ry: 3 + rng() * 2, rot: rng() * TAU };
        } else {
          we = { x: 6 + rng() * (W - 12), y: 18 + rng() * (H - 30),
                 rx: 3.5 + rng() * 3, ry: 2.5 + rng() * 2.5, rot: rng() * TAU };
        }
        // Must not touch the fairway: the safe route stays dry.
        if (distToFairway(we.x, we.y) < we.rx + 2.5) continue;
        if (!clearOfHazards(we)) continue;
        we.blob = TF.waterBlob(we);
        water.push(we);
        if (water.length >= (opts.twoRoute ? 1 : 2)) break;
        if (!opts.twoRoute && rng() < 0.5) break;
      }
    }

    // Trees: circle bumpers in the rough, clear of play lines.
    var trees = [];
    var nTrees = 4 + ((rng() * 6) | 0);  // 4..9
    for (i = 0; i < nTrees; i++) {
      for (var tt = 0; tt < 14; tt++) {
        var tx = 4 + rng() * (W - 8), ty = 12 + rng() * (H - 18);
        var tr = 1.6 + rng() * 1.0;
        if (distToFairway(tx, ty) < tr + 3) continue;
        if (inEllipse(tx, ty, { x: green.x, y: green.y, rx: green.rx + 3, ry: green.ry + 3, rot: green.rot })) continue;
        if (dist2(tx, ty, teeX, teeY) < 49) continue;
        var tok = true, j2;
        for (j2 = 0; tok && j2 < water.length; j2++)
          if (inEllipse(tx, ty, water[j2])) tok = false;
        for (j2 = 0; tok && j2 < sand.length; j2++)
          if (inEllipse(tx, ty, sand[j2])) tok = false;
        for (j2 = 0; tok && j2 < trees.length; j2++)
          if (dist2(tx, ty, trees[j2].x, trees[j2].y) < Math.pow(tr + trees[j2].r + 1.5, 2)) tok = false;
        if (tok) { trees.push({ x: tx, y: ty, r: tr }); break; }
      }
    }

    // Sand dunes: grassy mounds that deflect the ball (real heightfield —
    // folded into slopeAt below). Kept off the centerline safe route.
    var dunes = [];
    var nDunes = 2 + ((rng() * 4) | 0);  // 2..5
    for (i = 0; i < nDunes; i++) {
      for (var dt2 = 0; dt2 < 14; dt2++) {
        var dux = 5 + rng() * (W - 10), duy = 14 + rng() * (H - 24);
        var dsig = 3.5 + rng() * 2.5;
        var df = distToFairway(dux, duy);
        if (df < 1.5 || df > 11) continue;            // near the fairway, never on it
        if (inEllipse(dux, duy, { x: green.x, y: green.y, rx: green.rx + 3, ry: green.ry + 3, rot: green.rot })) continue;
        if (dist2(dux, duy, teeX, teeY) < 64) continue;
        var dok = true, j3;
        for (j3 = 0; dok && j3 < water.length; j3++)
          if (inEllipse(dux, duy, water[j3])) dok = false;
        for (j3 = 0; dok && j3 < sand.length; j3++)
          if (inEllipse(dux, duy, { x: sand[j3].x, y: sand[j3].y, rx: sand[j3].rx + 1, ry: sand[j3].ry + 1, rot: sand[j3].rot })) dok = false;
        for (j3 = 0; dok && j3 < dunes.length; j3++)
          if (dist2(dux, duy, dunes[j3].x, dunes[j3].y) < Math.pow(dsig + dunes[j3].sig + 2, 2)) dok = false;
        if (dok) { dunes.push({ x: dux, y: duy, sig: dsig, push: 4 + rng() * 4 }); break; }
      }
    }

    // Banked mini-golf walls: brick/wood rails flanking the fairway.
    // Bank shots off them are a real skill (the preview shows the bounce).
    var walls = [];
    var nWalls = (rng() * 3) | 0;  // 0..2
    for (i = 0; i < nWalls; i++) {
      var wseg = fairway[(rng() * (fairway.length - 1)) | 0];
      var wdx = wseg.x2 - wseg.x1, wdy = wseg.y2 - wseg.y1;
      var wl = Math.hypot(wdx, wdy) || 1;
      var wnx = -wdy / wl, wny = wdx / wl;
      var side = rng() < 0.5 ? -1 : 1;
      var woff = (wseg.r + 1.5 + rng() * 2) * side;
      var wf = 0.25 + rng() * 0.5;
      var wcx = wseg.x1 + wdx * wf + wnx * woff;
      var wcy = wseg.y1 + wdy * wf + wny * woff;
      var wlen = 8 + rng() * 6;
      var wux = wdx / wl, wuy = wdy / wl;
      var w1x = wcx - wux * wlen / 2, w1y = wcy - wuy * wlen / 2;
      var w2x = wcx + wux * wlen / 2, w2y = wcy + wuy * wlen / 2;
      // keep walls clear of the cup, tee, and hazards
      if (dist2(wcx, wcy, cupX, cupY) < 144) continue;
      if (dist2(wcx, wcy, teeX, teeY) < 64) continue;
      var wok = true, j4;
      for (j4 = 0; wok && j4 < water.length; j4++)
        if (segDist(water[j4].x, water[j4].y, w1x, w1y, w2x, w2y) < water[j4].rx + 1) wok = false;
      if (wok) walls.push({ x1: w1x, y1: w1y, x2: w2x, y2: w2y });
    }

    // Windmill: the iconic mini-golf obstacle. Blades sweep the fairway;
    // time the gap or play around the hub.
    var windmill = null;
    if (!opts.breather && rng() < 0.38) {
      for (var wm = 0; wm < 14; wm++) {
        var wsi = 1 + ((rng() * (fairway.length - 1)) | 0);
        var ws = fairway[wsi];
        var wmx = (ws.x1 + ws.x2) / 2, wmy = (ws.y1 + ws.y2) / 2;
        // offset from the centerline: blocks part of the fairway, leaves a lane
        var wdx = ws.x2 - ws.x1, wdy = ws.y2 - ws.y1;
        var wl = Math.hypot(wdx, wdy) || 1;
        var woff = (rng() < 0.5 ? -1 : 1) * ws.r * 0.35;
        wmx += (-wdy / wl) * woff;
        wmy += (wdx / wl) * woff;
        if (dist2(wmx, wmy, cupX, cupY) < 144) continue;
        if (dist2(wmx, wmy, teeX, teeY) < 100) continue;
        var wmok = true, j5;
        for (j5 = 0; wmok && j5 < water.length; j5++)
          if (Math.hypot(wmx - water[j5].x, wmy - water[j5].y) < water[j5].rx + 7) wmok = false;
        for (j5 = 0; wmok && j5 < sand.length; j5++)
          if (Math.hypot(wmx - sand[j5].x, wmy - sand[j5].y) < sand[j5].rx + 7) wmok = false;
        if (wmok) {
          windmill = { x: wmx, y: wmy, hubR: 1.7, bladeLen: 5.4, bladeW: 1.2,
                       speed: (0.8 + rng() * 0.6) * (rng() < 0.5 ? -1 : 1),
                       phase: rng() * TAU };
          break;
        }
      }
    }

    // Bridges: decorative arches across the fairway; the ball rolls under.
    var bridges = [];
    if (rng() < 0.3) {
      var bsi = (rng() * (fairway.length - 1)) | 0;
      var bs = fairway[bsi];
      var bdx = bs.x2 - bs.x1, bdy = bs.y2 - bs.y1;
      var bl = Math.hypot(bdx, bdy) || 1;
      bridges.push({ x: (bs.x1 + bs.x2) / 2, y: (bs.y1 + bs.y2) / 2,
                     w: bs.r * 2 + 3, rot: Math.atan2(bdy, bdx) });
    }

    // Ramps: hit with speed and launch airborne over what's ahead.
    var ramps = [];
    if (!opts.breather && rng() < 0.32) {
      for (var rp = 0; rp < 14; rp++) {
        var rsi = (rng() * (fairway.length - 1)) | 0;
        var rs = fairway[rsi];
        var rdx = rs.x2 - rs.x1, rdy = rs.y2 - rs.y1;
        var rl = Math.hypot(rdx, rdy) || 1;
        var rpx = rs.x1 + rdx * 0.5, rpy = rs.y1 + rdy * 0.5;
        if (dist2(rpx, rpy, cupX, cupY) < 100) continue;
        if (dist2(rpx, rpy, teeX, teeY) < 64) continue;
        if (windmill && Math.hypot(rpx - windmill.x, rpy - windmill.y) < 12) continue;
        ramps.push({ x: rpx, y: rpy, w: 8, h: 6.5,
                     dx: rdx / rl, dy: rdy / rl, minSpeed: 10 });
        break;
      }
    }

    // Wind: seeded direction + strength, with slow organic gusts.
    // Some holes are calm; nobody likes a lottery.
    var wind = {
      ang: rng() * TAU,
      base: rng() < 0.25 ? 0 : 1.5 + rng() * 5,
      gustAmp: 0.3,
      gustFreq: 0.25 + rng() * 0.3,
      phase: rng() * TAU
    };
    // Slope field: gentle global tilt + stronger break around the cup
    // (the green-reading skill) + dune mounds + low smooth noise.
    // Returns acceleration.
    var tiltA = rng() * TAU, tiltM = 0.4 + rng() * 0.8;
    var breakA = rng() * TAU, breakM = 1.2 + rng() * 1.6;
    var n1p = rng() * TAU, n2p = rng() * TAU;
    function slopeAt(x, y) {
      var dxc = x - cupX, dyc = y - cupY;
      var fall = Math.exp(-(dxc * dxc + dyc * dyc) / (2 * 14 * 14));
      var ax = Math.cos(tiltA) * tiltM + Math.cos(breakA) * breakM * fall +
               0.5 * Math.sin(x * 0.35 + n1p) * Math.cos(y * 0.30 + n2p);
      var ay = Math.sin(tiltA) * tiltM + Math.sin(breakA) * breakM * fall +
               0.5 * Math.cos(x * 0.30 + n2p) * Math.sin(y * 0.35 + n1p);
      // dune mounds: Gaussian bumps push the ball downhill (away from crest)
      for (var di = 0; di < dunes.length; di++) {
        var du = dunes[di];
        var ddx = x - du.x, ddy = y - du.y;
        var d2 = ddx * ddx + ddy * ddy;
        var sig2 = du.sig * du.sig;
        if (d2 < sig2 * 9) {
          var dd = Math.sqrt(d2) || 0.001;
          var g = du.push * (dd / du.sig) * Math.exp(-d2 / (2 * sig2));
          ax += (ddx / dd) * g;
          ay += (ddy / dd) * g;
        }
      }
      return { x: ax, y: ay };
    }

    // Path length along the centerline -> par.
    var pathLen = 0;
    for (i = 0; i < pts.length - 1; i++)
      pathLen += Math.sqrt(dist2(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y));
    var hazards = sand.length * 0.5 + water.length * 0.8 + trees.length * 0.1;
    var obstacles = (windmill ? 1 : 0) + ramps.length * 0.5;
    var par = Math.round(pathLen / 26 + hazards * 0.5 + obstacles * 0.5);
    par = clamp(par, 2, 5);

    var biome = (rng() * 4) | 0;

    // ---- mechanic tags + 3-stage intro grammar (What the Golf?) ----
    // opts.intro: 'new' (first sight: gentle, guaranteed, hinted),
    // 'challenge' (normal), 'twist' (focus mechanic + a second one nearby).
    function forceWindmill() {
      var fsi = 1 + ((rng() * (fairway.length - 1)) | 0);
      var fs = fairway[fsi];
      var fdx = fs.x2 - fs.x1, fdy = fs.y2 - fs.y1;
      var fl = Math.hypot(fdx, fdy) || 1;
      var fx = (fs.x1 + fs.x2) / 2 + (-fdy / fl) * fs.r * 0.35;
      var fy = (fs.y1 + fs.y2) / 2 + (fdx / fl) * fs.r * 0.35;
      return { x: fx, y: fy, hubR: 1.7, bladeLen: 5.4, bladeW: 1.2,
               speed: (0.8 + rng() * 0.6) * (rng() < 0.5 ? -1 : 1),
               phase: rng() * TAU };
    }
    function forceRamp() {
      var rsi = (rng() * (fairway.length - 1)) | 0;
      var rs = fairway[rsi];
      var rdx = rs.x2 - rs.x1, rdy = rs.y2 - rs.y1;
      var rl = Math.hypot(rdx, rdy) || 1;
      return { x: rs.x1 + rdx * 0.5, y: rs.y1 + rdy * 0.5, w: 8, h: 6.5,
               dx: rdx / rl, dy: rdy / rl, minSpeed: 10 };
    }
    var intro = opts.intro || 'challenge';
    var focusMech = opts.focusMech || null;
    if (intro === 'new' && focusMech === 'windmill' && !windmill) windmill = forceWindmill();
    if (intro === 'new' && focusMech === 'ramp' && !ramps.length) ramps.push(forceRamp());
    if (intro === 'twist' && focusMech) {
      if (focusMech === 'windmill' && !windmill) windmill = forceWindmill();
      if (focusMech === 'ramp' && !ramps.length) ramps.push(forceRamp());
      // a twist pairs the focus mechanic with a second obstacle
      if (!windmill) windmill = forceWindmill();
      else if (!ramps.length) ramps.push(forceRamp());
    }
    if (intro === 'new') {
      if (windmill) windmill.speed *= 0.55;   // gentle first meeting
      if (sand.length > 1) sand.length = 1;   // fewer traps while learning
    }
    var mechanics = [];
    if (windmill) mechanics.push('windmill');
    if (ramps.length) mechanics.push('ramp');
    if (water.length) mechanics.push('water');
    if (dunes.length) mechanics.push('dunes');
    if (walls.length) mechanics.push('walls');

    // ---- hidden relic: one per hole, off the racing line (Walkabout) ----
    function inHazards(x, y) {
      var q;
      for (q = 0; q < water.length; q++) if (TF.inWater(x, y, water[q])) return true;
      for (q = 0; q < sand.length; q++) if (inEllipse(x, y, sand[q])) return true;
      return false;
    }
    var relic = null;
    for (var rlt = 0; rlt < 24 && !relic; rlt++) {
      var rlx = 6 + rng() * (W - 12), rly = 14 + rng() * (H - 20);
      var rld = distToFairway(rlx, rly);
      if (rld < 5 || rld > 24) continue;                 // off the line, still reachable
      if (dist2(rlx, rly, teeX, teeY) < 49) continue;
      if (dist2(rlx, rly, cupX, cupY) < 49) continue;
      if (inHazards(rlx, rly)) continue;
      relic = { x: rlx, y: rly, taken: false };
    }

    // ---- gems: risk/reward detours near but off the fast line (Mini Golf King) ----
    var gems = [];
    for (var gmi = 0; gmi < 4; gmi++) {
      for (var gmt = 0; gmt < 18; gmt++) {
        var gmx = 5 + rng() * (W - 10), gmy = 12 + rng() * (H - 18);
        var gmd = distToFairway(gmx, gmy);
        if (gmd < 2.5 || gmd > 11) continue;            // beside the fairway, not on it
        if (dist2(gmx, gmy, teeX, teeY) < 36) continue;
        if (dist2(gmx, gmy, cupX, cupY) < 36) continue;
        if (inHazards(gmx, gmy)) continue;
        var gok = true, go2;
        for (go2 = 0; gok && go2 < gems.length; go2++)
          if (dist2(gmx, gmy, gems[go2].x, gems[go2].y) < 64) gok = false;
        if (relic && dist2(gmx, gmy, relic.x, relic.y) < 64) gok = false;
        if (gok) { gems.push({ x: gmx, y: gmy, taken: false }); break; }
      }
    }

    var hole = {
      seed: seed >>> 0,
      W: W, H: H,
      fairway: fairway,          // segments {x1,y1,x2,y2,r}
      green: green,              // ellipse {x,y,rx,ry,rot} (cup at center)
      sand: sand,                // ellipses
      water: water,              // ellipses
      trees: trees,              // circles {x,y,r}
      dunes: dunes,              // mounds {x,y,sig,push} (in slopeAt)
      walls: walls,              // banked segments {x1,y1,x2,y2}
      windmill: windmill,        // {x,y,hubR,bladeLen,bladeW,speed,phase} or null
      bridges: bridges,          // decorative arches {x,y,w,rot}
      ramps: ramps,              // launch rects {x,y,w,h,dx,dy,minSpeed}
      wind: wind,                // {ang,base,gustAmp,gustFreq,phase}
      slopeAt: slopeAt,
      tee: { x: teeX, y: teeY },
      cup: { x: cupX, y: cupY },
      par: par,
      biome: biome,
      mechanics: mechanics,      // tags present this hole
      intro: intro,              // 'new' | 'challenge' | 'twist'
      focusMech: focusMech,      // mechanic being introduced (or null)
      // ---- transport objects (transport-sim.js). Empty unless the
      // ---- generator places them (Phase D); the tour never uses them.
      portals: [],  // {x1,y1,x2,y2,r,redirect,ex,ey}
      pads: [],     // {x,y,r,dx,dy,boost}
      cannons: [],  // {x,y,angle,angleCycle,power}
      tubes: [],    // {path:[[x,y]..],speed}
      belts: [],    // {x,y,w,h,dx,dy,speed}
      fans: [],     // {x,y,dx,dy,range,strength}
      wells: [],    // {x,y,r,strength}
      loops: [],    // {x,y,r,minSpeed}
      tables: [],   // {x,y,r,omega}
      lifts: [],    // {x1,y1,x2,y2,duration}
      relic: relic,              // {x,y,taken} or null
      gems: gems                 // [{x,y,taken}]
    };
    // transport objects need the full hole (surfaceAt) — placed here, then tagged
    TF.placeTransports(hole, rng, { intro: intro, focus: focusMech,
                                    breather: !!opts.breather });
    for (var tpTi = 0; tpTi < TF.TRANSPORT_MECHS.length; tpTi++) {
      var tpTk = TF.TRANSPORT_MECHS[tpTi];
      if (hole[tpTk + 's'] && hole[tpTk + 's'].length) hole.mechanics.push(tpTk);
    }
    return hole;
  };

  // Transport mechanic tags (for the introduce->par->twist grammar).
  TF.TRANSPORT_MECHS = ['portal', 'pad', 'cannon', 'tube', 'belt',
                        'fan', 'well', 'loop', 'table', 'lift'];

  // Places transport objects onto a built hole (procedural + daily + race).
  // Works purely from hole.fairway/tee/cup + TF.surfaceAt, so both genHole
  // and makeHole can use it. Seeded via rng — deterministic per hole.
  // opts: {intro:'new'|'challenge'|'twist', focus:mech|null, breather:bool}
  TF.placeTransports = function (hole, rng, opts) {
    opts = opts || {};
    if (opts.breather) return;
    var intro = opts.intro || 'challenge';
    var focus = opts.focus || null;
    var W = hole.W, H = hole.H;
    var teeX = hole.tee.x, teeY = hole.tee.y;
    var cupX = hole.cup.x, cupY = hole.cup.y;
    var placedPts = [];
    function clearOf(x, y, d) {
      if (dist2(x, y, teeX, teeY) < 64) return false;   // 8 from the tee
      for (var k = 0; k < placedPts.length; k++)
        if (dist2(x, y, placedPts[k].x, placedPts[k].y) < d * d) return false;
      return true;
    }
    function groundOK(x, y) {
      if (x < 4 || x > W - 4 || y < 10 || y > H - 5) return false;
      var s = TF.surfaceAt(hole, x, y);
      return s === 'fairway' || s === 'green' || s === 'rough';
    }
    function dfw(x, y) {
      var d = Infinity;
      for (var j = 0; j < hole.fairway.length; j++) {
        var s = hole.fairway[j];
        d = Math.min(d, segDist(x, y, s.x1, s.y1, s.x2, s.y2) - s.r);
      }
      return d;
    }
    function routeDir(x, y) {
      var dx = cupX - x, dy = cupY - y, l = Math.hypot(dx, dy) || 1;
      return { x: dx / l, y: dy / l };
    }
    // random point with fairway-distance in [lo,hi], on good ground,
    // clear of the tee, other transports, windmill and ramps
    function fairSpot(lo, hi) {
      for (var t = 0; t < 24; t++) {
        var x = 5 + rng() * (W - 10), y = 12 + rng() * (H - 20);
        var d = dfw(x, y);
        if (d < lo || d > hi) continue;
        if (!groundOK(x, y) || !clearOf(x, y, 7)) continue;
        if (hole.windmill && dist2(x, y, hole.windmill.x, hole.windmill.y) < 100) continue;
        var rok = true;
        for (var ri = 0; ri < hole.ramps.length && rok; ri++) {
          var rp = hole.ramps[ri];
          var rdx = x - rp.x, rdy = y - rp.y;
          var lu = rdx * rp.dx + rdy * rp.dy, lv = rdx * (-rp.dy) + rdy * rp.dx;
          if (Math.abs(lu) < rp.h / 2 + 3 && Math.abs(lv) < rp.w / 2 + 3) rok = false;
        }
        if (!rok) continue;
        return { x: x, y: y };
      }
      return null;
    }
    function addPortal(gentle) {
      var e = fairSpot(-1, 5); if (!e) return false;
      var rd = routeDir(e.x, e.y);
      for (var t = 0; t < 12; t++) {
        var dist = 16 + rng() * 14;
        var jx = (rng() - 0.5) * 10;
        var x2 = clamp(e.x + rd.x * dist - rd.y * jx, 5, W - 5);
        var y2 = clamp(e.y + rd.y * dist + rd.x * jx, 12, H - 6);
        if (!groundOK(x2, y2) || !clearOf(x2, y2, 7)) continue;
        if (dist2(x2, y2, cupX, cupY) < 36) continue;   // never a free hole-in-one
        var ex = x2 - e.x, ey = y2 - e.y, el = Math.hypot(ex, ey) || 1;
        hole.portals.push({ x1: e.x, y1: e.y, x2: x2, y2: y2, r: 2.2,
                            redirect: gentle ? 0 : (rng() < 0.5 ? 0 : 1),
                            ex: ex / el, ey: ey / el });
        placedPts.push(e); placedPts.push({ x: x2, y: y2 });
        return true;
      }
      return false;
    }
    function addPad(gentle) {
      var e = fairSpot(-3, 2); if (!e) return false;
      var rd = routeDir(e.x, e.y);
      hole.pads.push({ x: e.x, y: e.y, r: 2.5, dx: rd.x, dy: rd.y,
                       boost: gentle ? 6 : 7 + rng() * 4 });
      placedPts.push(e);
      return true;
    }
    function addCannon(gentle) {
      var e = fairSpot(-1, 5); if (!e) return false;
      var rd = routeDir(e.x, e.y);
      var ja = (rng() - 0.5) * 0.5;
      var ca = Math.cos(ja), sa = Math.sin(ja);
      var ax = rd.x * ca - rd.y * sa, ay = rd.x * sa + rd.y * ca;
      hole.cannons.push({ x: e.x, y: e.y, angle: Math.atan2(ay, ax),
                          angleCycle: gentle ? 0 : (rng() < 0.4 ? 0.7 : 0),
                          power: 30 + rng() * 8 });
      placedPts.push(e);
      return true;
    }
    function addTube(gentle) {
      var e = fairSpot(-1, 5); if (!e) return false;
      var rd = routeDir(e.x, e.y);
      var len = 18 + rng() * 10;
      var bend = (rng() < 0.5 ? -1 : 1) * (5 + rng() * 6);
      var mx = e.x + rd.x * len * 0.5 - rd.y * bend;
      var my = e.y + rd.y * len * 0.5 + rd.x * bend;
      var x2 = clamp(e.x + rd.x * len, 5, W - 5);
      var y2 = clamp(e.y + rd.y * len, 12, H - 6);
      if (!groundOK(x2, y2) || !clearOf(x2, y2, 7)) return false;
      hole.tubes.push({ path: [[e.x, e.y], [mx, my], [x2, y2]],
                        speed: gentle ? 14 : 16 + rng() * 6 });
      placedPts.push(e); placedPts.push({ x: x2, y: y2 });
      return true;
    }
    function addBelt(gentle) {
      var e = fairSpot(-3, 2); if (!e) return false;
      var rd = routeDir(e.x, e.y);
      hole.belts.push({ x: e.x, y: e.y, w: 6, h: 12, dx: rd.x, dy: rd.y,
                        speed: gentle ? 6 : 7 + rng() * 3 });
      placedPts.push(e);
      return true;
    }
    function addFan(gentle) {
      var e = fairSpot(3, 8); if (!e) return false;   // beside the fairway
      var rd = routeDir(e.x, e.y);
      var tx = e.x + rd.x * 10, ty = e.y + rd.y * 10;
      var dx = tx - e.x, dy = ty - e.y, l = Math.hypot(dx, dy) || 1;
      hole.fans.push({ x: e.x, y: e.y, dx: dx / l, dy: dy / l,
                       range: 11 + rng() * 3, strength: gentle ? 12 : 16 + rng() * 8 });
      placedPts.push(e);
      return true;
    }
    function addWell(gentle) {
      var e = fairSpot(4, 10); if (!e) return false;
      hole.wells.push({ x: e.x, y: e.y, r: 5 + rng() * 2,
                        strength: gentle ? 7 : 10 + rng() * 6 });
      placedPts.push(e);
      return true;
    }
    function addLoop(gentle) {
      var e = fairSpot(-2, 2); if (!e) return false;   // on the fairway
      hole.loops.push({ x: e.x, y: e.y, r: 3, minSpeed: gentle ? 9 : 11 + rng() * 2 });
      placedPts.push(e);
      return true;
    }
    function addTable(gentle) {
      var e = fairSpot(-3, 3); if (!e) return false;
      var om = (0.7 + rng() * 0.8) * (rng() < 0.5 ? -1 : 1);
      hole.tables.push({ x: e.x, y: e.y, r: 4.5 + rng() * 1.5,
                         omega: gentle ? om * 0.6 : om });
      placedPts.push(e);
      return true;
    }
    function addLift(gentle) {
      var e = fairSpot(-1, 5); if (!e) return false;
      var rd = routeDir(e.x, e.y);
      var dist = 20 + rng() * 12;
      var x2 = clamp(e.x + rd.x * dist, 5, W - 5);
      var y2 = clamp(e.y + rd.y * dist, 12, H - 6);
      if (!groundOK(x2, y2) || !clearOf(x2, y2, 7)) return false;
      if (dist2(x2, y2, cupX, cupY) < 36) return false;
      hole.lifts.push({ x1: e.x, y1: e.y, x2: x2, y2: y2, duration: 1.5 });
      placedPts.push(e); placedPts.push({ x: x2, y: y2 });
      return true;
    }
    var adders = { portal: addPortal, pad: addPad, cannon: addCannon,
                   tube: addTube, belt: addBelt, fan: addFan, well: addWell,
                   loop: addLoop, table: addTable, lift: addLift };
    function addRandom(except) {
      var keys = TF.TRANSPORT_MECHS.filter(function (k) { return k !== except; });
      var kk = keys[(rng() * keys.length) | 0];
      return adders[kk](false);
    }
    if (focus && adders[focus]) {
      adders[focus](intro === 'new');
      if (intro === 'twist') addRandom(focus);
    } else if (intro === 'challenge') {
      var roll = rng();
      if (roll < 0.45) addRandom(null);
      else if (roll < 0.65) { addRandom(null); addRandom(null); }
    }
    // race holes always get at least one toy
    if (opts.guarantee) {
      for (var gt = 0; gt < 4; gt++) {
        var any = hole.portals.length + hole.pads.length + hole.cannons.length +
                  hole.tubes.length + hole.belts.length + hole.fans.length +
                  hole.wells.length + hole.loops.length + hole.tables.length +
                  hole.lifts.length;
        if (any > 0) break;
        addRandom(null);
      }
    }
  };

  /* ---------------- the designed tour: 20 hand-built holes ----------------
   * Jimmy asked for a real course instead of endless procedural generation.
   * Spec format (compact arrays):
   *   fw: [x1,y1,x2,y2,r] fairway segments (the intended route; the bot
   *       follows their midpoints, so the route must always be playable)
   *   green/sand/water: [x,y,rx,ry(,rot)] ellipses
   *   trees: [x,y,r]   dunes: [x,y,sig,push] (push>0 mound, push<0 dip)
   *   walls: [x1,y1,x2,y2]   mill: [x,y,speed]   bridges: [x,y,w,rot]
   *   ramps: [x,y,dx,dy] (unit dir)   wind/tilt/brk: [ang rad, mag]
   * Water crossings on the route are ALWAYS paired with a ramp: the race
   * bot plays for the ramp when the direct line is wet. */
  TF.HOLES = [
    { par: 2, biome: 0, tee: [28, 8], cup: [28, 70],
      fw: [[28, 8, 28, 70, 9]], green: [28, 70, 9, 7],
      tilt: [0, 0.3], brk: [0, 0],
      tp: { portals: [], pads: [{x:28,y:45,r:3,dx:0,dy:1,boost:8}], cannons: [],
            tubes: [], belts: [], fans: [], wells: [], loops: [], tables: [], lifts: [] },
      hint: 'A dash pad is a free shove \u2014 roll onto it and hold on.' },
    { par: 2, biome: 0, tee: [28, 8], cup: [36, 72],
      fw: [[28, 8, 28, 44, 8], [28, 44, 36, 72, 8]], green: [36, 72, 9, 7],
      tilt: [0, 0.3], brk: [0, 0],
      tp: { portals: [{x1:28,y1:44,x2:36,y2:64,r:3.2,redirect:1,ex:0.27,ey:0.96}],
            pads: [], cannons: [], tubes: [], belts: [], fans: [], wells: [],
            loops: [], tables: [], lifts: [] },
      hint: 'Blue rings fling you forward. The exit is kind \u2014 the cup is not close.' },
    { par: 3, biome: 0, tee: [28, 8], cup: [28, 74],
      fw: [[28, 8, 28, 74, 9]], green: [28, 74, 9, 7],
      tilt: [0, 0.3], brk: [0, 0],
      tp: { portals: [], pads: [], cannons: [], tubes: [],
            belts: [{x:28,y:44,w:10,h:14,dx:0,dy:1,speed:6}], fans: [], wells: [],
            loops: [], tables: [], lifts: [] },
      hint: 'Ride the conveyor. It never gets tired \u2014 plan around it.' },
    { par: 3, biome: 0, tee: [40, 8], cup: [16, 74],
      fw: [[40, 8, 40, 46, 8], [40, 46, 16, 74, 8]], green: [16, 74, 9, 7],
      sand: [[22, 62, 5, 4]],
      tilt: [0.8, 0.4], brk: [0, 0],
      tp: { portals: [], pads: [{x:40,y:38,r:3,dx:0,dy:1,boost:8}], cannons: [],
            tubes: [], belts: [], fans: [], wells: [{x:26,y:58,r:8,strength:12}],
            loops: [], tables: [], lifts: [] },
      hint: 'Pads shove, wells tug \u2014 chain them and the corner disappears.' },
    { par: 3, biome: 0, tee: [16, 8], cup: [40, 74],
      fw: [[16, 8, 16, 44, 8], [16, 44, 40, 44, 7], [40, 44, 40, 74, 7]],
      green: [40, 74, 9, 7],
      trees: [[24, 52, 2], [32, 36, 2]],
      tilt: [0, 0.3], brk: [0, 0],
      tp: { portals: [], pads: [{x:40,y:58,r:3,dx:0,dy:1,boost:8}], cannons: [],
            tubes: [], belts: [], fans: [{x:28,y:36,dx:0,dy:1,range:10,strength:9}],
            wells: [], loops: [], tables: [], lifts: [] },
      hint: 'Fans push the ball along \u2014 aim with the wind at your back.' },
    { par: 3, biome: 1, tee: [28, 8], cup: [28, 78],
      fw: [[28, 8, 28, 44, 9], [28, 60, 28, 78, 9]], green: [28, 78, 9, 7],
      water: [[28, 52, 16, 4, 0]],
      tilt: [0, 0.3], brk: [0, 0],
      tp: { portals: [], pads: [], cannons: [], tubes: [{path:[[28,34],[28,52],[28,64]],speed:16}],
            belts: [], fans: [], wells: [], loops: [], tables: [], lifts: [] },
      hint: 'The tube skips the whole wet part. Dive in.' },
    { par: 4, biome: 1, tee: [28, 8], cup: [28, 84],
      fw: [[28, 8, 28, 84, 10]], green: [28, 84, 9, 7],
      sand: [[20, 72, 4, 3], [36, 72, 4, 3]],
      tilt: [0, 0.3], brk: [0, 0],
      tp: { portals: [], pads: [], cannons: [{x:28,y:40,angle:1.5708,angleCycle:0,power:32}],
            tubes: [], belts: [], fans: [], wells: [], loops: [], tables: [], lifts: [] },
      hint: 'Feed the cannon a rolling ball and light the fuse.' },
    { par: 3, biome: 1, tee: [28, 8], cup: [40, 74],
      fw: [[28, 8, 28, 46, 8], [28, 46, 40, 74, 8]], green: [40, 74, 9, 7],
      sand: [[28, 58, 10, 5]],
      tilt: [0.5, 0.4], brk: [0, 0],
      tp: { portals: [], pads: [], cannons: [], tubes: [], belts: [], fans: [],
            wells: [{x:38,y:62,r:7,strength:12}], loops: [], tables: [], lifts: [] },
      hint: 'The well gathers stray balls. Use the tug \u2014 don\u2019t fight it.' },
    { par: 4, biome: 1, tee: [28, 8], cup: [28, 80],
      fw: [[28, 8, 28, 52, 9], [28, 62, 28, 80, 9]], green: [28, 80, 9, 7],
      water: [[28, 58, 18, 3, 0]],
      tilt: [0, 0.3], brk: [0, 0],
      tp: { portals: [], pads: [], cannons: [], tubes: [], belts: [], fans: [],
            wells: [], loops: [], tables: [],
            lifts: [{x1:28,y1:48,x2:28,y2:66,duration:2}] },
      hint: 'Board the lift at the glow \u2014 it ferries you over the moat.' },
    { par: 4, biome: 1, tee: [28, 8], cup: [28, 78],
      fw: [[28, 8, 28, 78, 9]], green: [28, 78, 9, 7],
      sand: [[18, 48, 4, 3], [38, 48, 4, 3]],
      tilt: [0, 0.3], brk: [0, 0],
      tp: { portals: [], pads: [{x:28,y:32,r:3,dx:0,dy:1,boost:9}], cannons: [],
            tubes: [], belts: [], fans: [], wells: [],
            loops: [{x:28,y:48,r:6,minSpeed:10}], tables: [], lifts: [] },
      hint: 'Hit the pad with pace \u2014 the loop only opens for fast balls.' },
    { par: 3, biome: 2, tee: [36, 8], cup: [18, 74],
      fw: [[36, 8, 36, 44, 8], [36, 44, 18, 74, 7]], green: [18, 74, 9, 7],
      trees: [[26, 52, 2], [22, 60, 2]],
      tilt: [2.9, 0.4], brk: [0, 0],
      tp: { portals: [], pads: [], cannons: [], tubes: [], belts: [], fans: [],
            wells: [], loops: [], tables: [{x:36,y:44,r:5,omega:1.2}], lifts: [] },
      hint: 'The turntable spins you around the corner. Let it work.' },
    { par: 4, biome: 2, tee: [28, 8], cup: [28, 80],
      fw: [[28, 8, 28, 80, 9]], green: [28, 80, 9, 7],
      trees: [[44, 40, 2], [12, 58, 2]],
      wind: [0.4, 2],
      tilt: [0, 0.3], brk: [0, 0],
      tp: { portals: [], pads: [], cannons: [], tubes: [],
            belts: [{x:28,y:40,w:16,h:8,dx:1,dy:0,speed:5}],
            fans: [{x:28,y:58,dx:0,dy:1,range:12,strength:9}],
            wells: [], loops: [], tables: [], lifts: [] },
      hint: 'Ride the wind uphill \u2014 and fight the belt sideways.' },
    { par: 4, biome: 2, tee: [28, 8], cup: [28, 82],
      fw: [[28, 8, 28, 82, 9]], green: [28, 82, 9, 7],
      walls: [[8, 30, 24, 30], [32, 30, 48, 30]],
      tilt: [0, 0.3], brk: [0, 0],
      tp: { portals: [], pads: [],
            cannons: [{x:28,y:18,angle:1.5708,angleCycle:0.7,power:34}],
            tubes: [], belts: [], fans: [], wells: [{x:28,y:58,r:7,strength:10}],
            loops: [], tables: [], lifts: [] },
      hint: 'Time the barrel through the wall gap \u2014 the well gathers survivors.' },
    { par: 3, biome: 2, tee: [14, 8], cup: [42, 76],
      fw: [[14, 8, 14, 48, 8], [14, 48, 42, 76, 8]], green: [42, 76, 9, 7],
      trees: [[24, 60, 2], [30, 68, 2]],
      tilt: [0.7, 0.4], brk: [0, 0],
      tp: { portals: [{x1:14,y1:48,x2:34,y2:64,r:3.2,redirect:1,ex:0.555,ey:0.832}],
            pads: [], cannons: [], tubes: [], belts: [], fans: [], wells: [],
            loops: [], tables: [], lifts: [] },
      hint: 'Blue again, through the forest. Step in.' },
    { par: 4, biome: 2, tee: [28, 8], cup: [28, 80],
      fw: [[28, 8, 28, 44, 9], [28, 64, 28, 80, 9],
           [28, 44, 12, 52, 7], [12, 52, 12, 68, 7], [12, 68, 28, 74, 7]],
      green: [28, 80, 9, 7],
      water: [[28, 54, 16, 4, 0]],
      tilt: [0, 0.3], brk: [0, 0],
      tp: { portals: [], pads: [], cannons: [],
            tubes: [{path:[[28,34],[28,54],[28,66]],speed:18}],
            belts: [], fans: [], wells: [], loops: [], tables: [],
            lifts: [{x1:12,y1:52,x2:12,y2:66,duration:2}] },
      hint: 'Tube for the brave, lift for the patient. Both cross the water.' },
    { par: 4, biome: 3, tee: [28, 8], cup: [28, 82],
      fw: [[28, 8, 28, 82, 9]], green: [28, 82, 9, 7],
      sand: [[36, 74, 4, 3]],
      tilt: [0, 0.3], brk: [0, 0],
      tp: { portals: [],
            pads: [], cannons: [], tubes: [],
            belts: [{x:28,y:66,w:12,h:10,dx:0,dy:1,speed:7}],
            fans: [], wells: [], loops: [], tables: [{x:28,y:74,r:4,omega:1.4}], lifts: [] },
      hint: 'Conveyor, turntable \u2014 juggle both and you\u2019re home.' },
    { par: 4, biome: 3, tee: [28, 8], cup: [44, 80],
      fw: [[28, 8, 28, 50, 9], [28, 50, 44, 80, 8]], green: [44, 80, 9, 7],
      dunes: [[16, 50, 6, -4]],
      wind: [0.5, 2.5],
      tilt: [0.6, 0.4], brk: [0, 0],
      tp: { portals: [], pads: [], cannons: [{x:28,y:30,angle:1.26,angleCycle:0,power:36}],
            tubes: [], belts: [], fans: [], wells: [], loops: [], tables: [], lifts: [] },
      hint: 'One great cannon shot clears the ridge \u2014 or grind around it.' },
    { par: 5, biome: 3, tee: [28, 6], cup: [28, 88],
      fw: [[28, 6, 12, 40, 9], [12, 40, 44, 60, 9], [44, 60, 28, 88, 9]],
      green: [28, 88, 9, 7],
      sand: [[28, 70, 6, 4]], water: [[18, 86, 6, 2.5, 0]],
      tilt: [0, 0.3], brk: [0, 0],
      tp: { portals: [], pads: [], cannons: [], tubes: [], belts: [], fans: [],
            wells: [], loops: [{x:28,y:50,r:6.5,minSpeed:12}], tables: [], lifts: [] },
      hint: 'The exam begins. The loop demands commitment \u2014 hit it like you mean it.' },
    { par: 5, biome: 3, tee: [44, 8], cup: [12, 82],
      fw: [[44, 8, 44, 50, 9], [44, 50, 12, 82, 8]], green: [12, 82, 9, 7],
      mill: [40, 30, 0.9], sand: [[30, 60, 5, 4], [20, 74, 4, 3]], trees: [[36, 66, 2]],
      tilt: [0.9, 0.4], brk: [0, 0],
      tp: { portals: [{x1:44,y1:50,x2:18,y2:70,r:3.5,redirect:1,ex:-0.447,ey:0.894}],
            pads: [], cannons: [], tubes: [], belts: [], fans: [], wells: [],
            loops: [], tables: [], lifts: [] },
      hint: 'The long shortcut: blue skips the mill, but the green still bites.' },
    { par: 4, biome: 3, tee: [28, 8], cup: [28, 80],
      fw: [[28, 8, 28, 80, 9]], green: [28, 80, 9, 7],
      mill: [31.5, 40, 1.0], water: [[28, 62, 14, 3, 0]], ramps: [[28, 54, 0, 1]],
      dunes: [[20, 44, 5, 3], [36, 70, 6, -3]], sand: [[38, 74, 4, 3]],
      trees: [[16, 28, 2], [40, 48, 2]], wind: [0.8, 2.5],
      tilt: [0.4, 0.4], brk: [1.2, 1.3],
      tp: { portals: [], pads: [], cannons: [], tubes: [], belts: [], fans: [],
            wells: [], loops: [], tables: [], lifts: [] },
      hint: 'No toys, no shortcuts. Just you, the wind, and eighteen holes of lessons.' }
  ];
  TF.WONDERS = [
    { par: 5, biome: 0, tee: [14, 8], cup: [42, 86],
      wonder: { n: 1, name: 'Great Wall of China', flavor: 'Stone that outlived empires.' },
      fw: [[14, 8, 14, 60, 8], [14, 60, 42, 60, 8], [42, 60, 42, 86, 8]],
      green: [42, 86, 9, 7],
      walls: [[4, 4, 4, 56], [18, 70, 38, 70], [52, 64, 52, 90]],
      sand: [[28, 70, 6, 4]], trees: [[26, 44, 2], [24, 52, 2]],
      tilt: [0, 0.3], brk: [0, 0],
      tp: { portals: [],
            pads: [{x:14,y:30,r:3,dx:0,dy:1,boost:8},{x:28,y:60,r:3,dx:1,dy:0,boost:8},
                   {x:42,y:72,r:3,dx:0,dy:1,boost:8}],
            beacons: [{x:14,y:20,r:3,dx:0,dy:1,boost:32},
                      {x:14,y:44,r:3,dx:0.25,dy:0.97,boost:32},
                      {x:17,y:58,r:3.5,dx:1,dy:0,boost:32},
                      {x:40,y:60,r:3.5,dx:0.3,dy:0.95,boost:32},
                      {x:42.5,y:81,r:3.5,dx:-0.08,dy:0.997,boost:14,exact:1}],
            cannons: [], tubes: [], belts: [], fans: [], wells: [], loops: [],
            tables: [], lifts: [] },
      hint: 'Light the watchtower braziers in order \u2014 the golden path ends at the cup.' },
    { par: 4, biome: 1, tee: [28, 8], cup: [28, 86],
      wonder: { n: 2, name: 'Petra', flavor: 'Carved by hands, kept by the desert.' },
      fw: [[28, 8, 28, 86, 7]], green: [28, 86, 9, 7],
      walls: [[21, 8, 21, 52], [35, 8, 35, 52], [24, 52, 24, 86], [32, 52, 32, 86]],
      sand: [[30, 76, 3, 2.5]],
      tilt: [0, 0.2], brk: [2.2, 1.0],
      tp: { portals: [{x1:28,y1:36,x2:28,y2:62,r:3.2,redirect:1,ex:0,ey:1}],
            pads: [], cannons: [], tubes: [], belts: [], fans: [], wells: [],
            loops: [], tables: [], lifts: [] },
      hint: 'The rock hides a shortcut. Take it, then thread the narrows.' },
    { par: 3, biome: 2, tee: [28, 8], cup: [28, 80],
      wonder: { n: 3, name: 'Christ the Redeemer', flavor: 'Arms open over the whole course.' },
      fw: [[28, 8, 28, 80, 10]], green: [28, 80, 9, 7],
      dunes: [[16, 44, 6, 3], [40, 52, 6, 3]],
      sand: [[22, 70, 5, 2.5], [38, 70, 5, 2.5]], trees: [[14, 64, 2], [42, 64, 2]],
      tilt: [0, 0.4], brk: [0, 0],
      tp: { portals: [], pads: [],
            cannons: [{x:28,y:18,angle:1.5708,angleCycle:0.5,power:38}],
            tubes: [], belts: [], fans: [], wells: [], loops: [], tables: [], lifts: [] },
      hint: 'Ride the cannon down the mountain \u2014 then land it soft.' },
    { par: 4, biome: 2, tee: [28, 8], cup: [28, 84],
      wonder: { n: 4, name: 'Machu Picchu', flavor: 'Clouds keep the score up here.' },
      fw: [[28, 8, 28, 46, 9], [28, 58, 28, 84, 9]], green: [28, 84, 9, 7],
      dunes: [[20, 26, 7, 4], [36, 26, 7, 4], [20, 70, 6, 4], [36, 76, 6, -4]],
      sand: [[28, 80, 6, 3]],
      tilt: [0, 0.3], brk: [0, 0],
      tp: { portals: [], pads: [], cannons: [], tubes: [], belts: [], fans: [],
            wells: [], loops: [], tables: [],
            lifts: [{x1:28,y1:44,x2:28,y2:60,duration:2.5}] },
      hint: 'Climb the terraces by lift. The mountain rewards the patient.' },
    { par: 4, biome: 3, tee: [28, 8], cup: [28, 82],
      wonder: { n: 5, name: 'Chichen Itza', flavor: 'The serpent descends in stone and shadow.' },
      fw: [[28, 8, 28, 82, 8]], green: [28, 82, 9, 7],
      walls: [[36, 48, 44, 48], [44, 48, 44, 58], [44, 58, 36, 58], [36, 58, 36, 48],
              [38, 50, 42, 50], [42, 50, 42, 56], [42, 56, 38, 56], [38, 56, 38, 50]],
      dunes: [[20, 72, 5, 3], [36, 72, 5, 3]], sand: [[36, 78, 4, 3]],
      tilt: [0, 0.3], brk: [0, 0],
      tp: { portals: [], pads: [{x:28,y:34,r:3,dx:0,dy:1,boost:10}], cannons: [],
            tubes: [], belts: [], fans: [], wells: [],
            loops: [{x:28,y:52,r:6.5,minSpeed:11}], tables: [], lifts: [] },
      hint: 'Circle the pyramid \u2014 enter the loop hot, or bounce off.' },
    { par: 3, biome: 3, tee: [28, 8], cup: [28, 70],
      wonder: { n: 6, name: 'Colosseum', flavor: 'The crowd is stone, but it still roars.' },
      fw: [[28, 8, 28, 70, 9]], green: [28, 70, 9, 7],
      walls: [[16, 40, 22, 40], [34, 40, 40, 40], [40, 40, 48, 54], [48, 54, 40, 70],
              [40, 70, 16, 70], [16, 70, 8, 54], [8, 54, 16, 40]],
      sand: [[20, 60, 3, 2.5]], trees: [[18, 64, 2], [38, 64, 2]],
      tilt: [0, 0.2], brk: [0, 0],
      tp: { portals: [], pads: [], cannons: [], tubes: [], belts: [], fans: [],
            wells: [{x:28,y:56,r:9,strength:14}], loops: [], tables: [], lifts: [] },
      hint: 'The well drags every ball to center court \u2014 aim off it and bend home.' },
    { par: 4, biome: 1, tee: [28, 8], cup: [28, 84],
      wonder: { n: 7, name: 'Taj Mahal', flavor: 'Marble remembers every ripple.' },
      fw: [[28, 8, 28, 36, 9], [28, 52, 28, 84, 9]], green: [28, 84, 9, 7],
      water: [[28, 44, 7, 9, 0], [15, 44, 6, 9, 0], [41, 44, 6, 9, 0]],
      dunes: [[16, 66, 5, 2], [40, 66, 5, 2]], sand: [[28, 76, 7, 3]],
      tilt: [0, 0.3], brk: [0, 0],
      tp: { portals: [], pads: [], cannons: [],
            tubes: [{path:[[28,30],[28,44],[28,58]],speed:18}],
            belts: [], fans: [], wells: [], loops: [], tables: [], lifts: [] },
      hint: 'The pools are mirrors \u2014 cross through the tube, not over them.' }
  ];
  TF.TOUR_PAR = TF.HOLES.reduce(function (s, h) { return s + h.par; }, 0);

  // Builds a runtime hole from a tour spec. idx = 0-based hole index (seeds phases).
  TF.makeHole = function (spec, idx, opts) {
    var seed = (0x70ac + idx * 101) >>> 0;
    var rng = TF.mulberry32(seed);
    function ell(a) { return { x: a[0], y: a[1], rx: a[2], ry: a[3], rot: a[4] || 0 }; }
    var waterList = (spec.water || []).map(function (w) {
      var e = ell(w); e.blob = TF.waterBlob(e); return e;
    });
    var fairway = spec.fw.map(function (s) {
      return { x1: s[0], y1: s[1], x2: s[2], y2: s[3], r: s[4] };
    });
    var dunes = (spec.dunes || []).map(function (d) {
      return { x: d[0], y: d[1], sig: d[2], push: d[3] };
    });
    var wspec = spec.wind || [0, 0];
    var wind = { ang: wspec[0], base: wspec[1], gustAmp: 0.35,
                 gustFreq: 0.28 + (idx % 5) * 0.06, phase: idx * 1.7 };
    var tilt = spec.tilt || [0, 0], brk = spec.brk || [0, 0];
    var cupX = spec.cup[0], cupY = spec.cup[1];
    function slopeAt(x, y) {
      var dxc = x - cupX, dyc = y - cupY;
      var fall = Math.exp(-(dxc * dxc + dyc * dyc) / (2 * 14 * 14));
      var ax = Math.cos(tilt[0]) * tilt[1] + Math.cos(brk[0]) * brk[1] * fall;
      var ay = Math.sin(tilt[0]) * tilt[1] + Math.sin(brk[0]) * brk[1] * fall;
      for (var di = 0; di < dunes.length; di++) {
        var du = dunes[di];
        var ddx = x - du.x, ddy = y - du.y;
        var d2 = ddx * ddx + ddy * ddy;
        var sig2 = du.sig * du.sig;
        if (d2 < sig2 * 9) {
          var dd = Math.sqrt(d2) || 0.001;
          var g = du.push * (dd / du.sig) * Math.exp(-d2 / (2 * sig2));
          ax += (ddx / dd) * g;
          ay += (ddy / dd) * g;
        }
      }
      return { x: ax, y: ay };
    }
    var mill = spec.mill ? {
      x: spec.mill[0], y: spec.mill[1], hubR: 1.7, bladeLen: 5.4, bladeW: 1.2,
      speed: spec.mill[2], phase: idx * 2.1
    } : null;
    var ramps = (spec.ramps || []).map(function (rp) {
      var l = Math.hypot(rp[2], rp[3]) || 1;
      return { x: rp[0], y: rp[1], w: 8, h: 6.5,
               dx: rp[2] / l, dy: rp[3] / l, minSpeed: 10 };
    });
    function distToFairway(x, y) {
      var d = Infinity, j;
      for (j = 0; j < fairway.length; j++) {
        var s = fairway[j];
        d = Math.min(d, segDist(x, y, s.x1, s.y1, s.x2, s.y2) - s.r);
      }
      return d;
    }
    function inHaz(x, y) {
      var q;
      var sl = (spec.sand || []);
      for (q = 0; q < waterList.length; q++) if (TF.inWater(x, y, waterList[q])) return true;
      for (q = 0; q < sl.length; q++) if (inEllipse(x, y, ell(sl[q]))) return true;
      return false;
    }
    // relic + gems: sampled off the racing line, never in hazards (deterministic)
    var relic = null;
    for (var rlt = 0; rlt < 40 && !relic; rlt++) {
      var rlx = 6 + rng() * (TF.W - 12), rly = 14 + rng() * (TF.H - 20);
      var rld = distToFairway(rlx, rly);
      if (rld < 5 || rld > 24) continue;
      if (dist2(rlx, rly, spec.tee[0], spec.tee[1]) < 49) continue;
      if (dist2(rlx, rly, cupX, cupY) < 49) continue;
      if (inHaz(rlx, rly)) continue;
      relic = { x: rlx, y: rly, taken: false };
    }
    var gems = [];
    for (var gmi = 0; gmi < 4; gmi++) {
      for (var gmt = 0; gmt < 30; gmt++) {
        var gmx = 5 + rng() * (TF.W - 10), gmy = 12 + rng() * (TF.H - 18);
        var gmd = distToFairway(gmx, gmy);
        if (gmd < 2.5 || gmd > 11) continue;
        if (dist2(gmx, gmy, spec.tee[0], spec.tee[1]) < 36) continue;
        if (dist2(gmx, gmy, cupX, cupY) < 36) continue;
        if (inHaz(gmx, gmy)) continue;
        var gok = true, go2;
        for (go2 = 0; gok && go2 < gems.length; go2++)
          if (dist2(gmx, gmy, gems[go2].x, gems[go2].y) < 64) gok = false;
        if (relic && dist2(gmx, gmy, relic.x, relic.y) < 64) gok = false;
        if (gok) { gems.push({ x: gmx, y: gmy, taken: false }); break; }
      }
    }
    var mechanics = [];
    if (mill) mechanics.push('windmill');
    if (ramps.length) mechanics.push('ramp');
    if ((spec.water || []).length) mechanics.push('water');
    if (dunes.length) mechanics.push('dunes');
    if ((spec.walls || []).length) mechanics.push('walls');
    var hole = {
      seed: seed,
      W: TF.W, H: TF.H,
      fairway: fairway,
      green: ell(spec.green),
      sand: (spec.sand || []).map(ell),
      water: waterList,
      trees: (spec.trees || []).map(function (t) { return { x: t[0], y: t[1], r: t[2] }; }),
      dunes: dunes,
      walls: (spec.walls || []).map(function (w) {
        return { x1: w[0], y1: w[1], x2: w[2], y2: w[3] };
      }),
      windmill: mill,
      bridges: (spec.bridges || []).map(function (b) {
        return { x: b[0], y: b[1], w: b[2], rot: b[3] };
      }),
      ramps: ramps,
      wind: wind,
      slopeAt: slopeAt,
      tee: { x: spec.tee[0], y: spec.tee[1] },
      cup: { x: cupX, y: cupY },
      par: spec.par,
      biome: spec.biome,
      mechanics: mechanics,
      intro: 'designed',
      focusMech: null,
      hint: spec.hint || null,
      // designer-placed transports: wonders / tour-2.0 specs carry spec.tp
      portals: [], pads: [], cannons: [], tubes: [], belts: [],
      fans: [], wells: [], loops: [], tables: [], lifts: [],
      beacons: [],            // ordered flame-gate chain (wonder set-pieces)
      _beacon: null,          // chain state {next, lit[], n, finalT} (fresh per hole attempt)
      wonder: spec.wonder || null,
      relic: relic,
      gems: gems
    };
    // designer transports land on the hole verbatim (shallow copies), tagged like the rest
    if (spec.tp) {
      for (var tpD0 = 0; tpD0 < TF.TRANSPORT_MECHS.length; tpD0++) {
        var tpT0 = TF.TRANSPORT_MECHS[tpD0], tpA0 = spec.tp[tpT0 + 's'];
        if (tpA0 && tpA0.length) {
          hole[tpT0 + 's'] = tpA0.map(function (o) {
            var c = {}, k;
            for (k in o) c[k] = o[k];
            return c;
          });
          mechanics.push(tpT0);
        }
      }
    }
    // beacon chains (wonder set-pieces): copied verbatim, directions normalized.
    // Chain state is fresh per makeHole call = reset per hole attempt.
    if (spec.tp && spec.tp.beacons && spec.tp.beacons.length) {
      hole.beacons = spec.tp.beacons.map(function (o) {
        var bl = Math.hypot(o.dx, o.dy) || 1;
        return { x: o.x, y: o.y, r: o.r || 3,
                 dx: o.dx / bl, dy: o.dy / bl, boost: o.boost || 10,
                 exact: o.exact ? 1 : 0 };
      });
      var bcLit = [];
      for (var bcBi = 0; bcBi < hole.beacons.length; bcBi++) bcLit.push(false);
      hole._beacon = { next: 0, lit: bcLit, n: hole.beacons.length, finalT: -1 };
      mechanics.push('beacon');
    }
    // race mode reuses tour specs but gets procedural transports (tour pars untouched)
    if (opts && opts.transports) {      TF.placeTransports(hole, rng, { intro: 'challenge', focus: null, guarantee: true });
      for (var tpTi2 = 0; tpTi2 < TF.TRANSPORT_MECHS.length; tpTi2++) {
        var tpTk2 = TF.TRANSPORT_MECHS[tpTi2];
        if (hole[tpTk2 + 's'] && hole[tpTk2 + 's'].length) mechanics.push(tpTk2);
      }
    }
    return hole;
  };
  // Deterministic in t, so replays, previews, and daily holes agree.
  // Wind vector at sim-time t (seconds): base + slow organic gusts.
  TF.windAt = function (hole, t) {
    var w = hole.wind;
    if (!w || w.base <= 0) return { x: 0, y: 0 };
    var g = 1 + w.gustAmp * Math.sin(w.gustFreq * t + w.phase) *
                        Math.sin(w.gustFreq * 0.37 * t + w.phase * 1.7);
    var m = w.base * g;
    return { x: Math.cos(w.ang) * m, y: Math.sin(w.ang) * m };
  };

  // Windmill blade angle at sim-time t.
  TF.bladeAngle = function (hole, t) {
    if (!hole.windmill) return 0;
    return hole.windmill.phase + hole.windmill.speed * t;
  };

  /* ---------------- surfaces ---------------- */

  // 'water' | 'sand' | 'green' | 'fairway' | 'rough'
  TF.surfaceAt = function (hole, x, y) {
    var i;
    for (i = 0; i < hole.water.length; i++)
      if (TF.inWater(x, y, hole.water[i])) return 'water';
    for (i = 0; i < hole.sand.length; i++)
      if (inEllipse(x, y, hole.sand[i])) return 'sand';
    if (inEllipse(x, y, hole.green)) return 'green';
    for (i = 0; i < hole.fairway.length; i++) {
      var s = hole.fairway[i];
      if (segDist(x, y, s.x1, s.y1, s.x2, s.y2) <= s.r) return 'fairway';
    }
    return 'rough';
  };

  /* ---------------- ball ---------------- */

  TF.newBall = function (hole) {
    return {
      x: hole.tee.x, y: hole.tee.y,
      vx: 0, vy: 0,
      z: 0, vz: 0,    // height above the course (ramps); 0 = on the ground
      resting: true, inCup: false, inWater: false,
      spin: 0,        // -1 (backspin, bites) .. +1 (topspin, runs on)
      curve: 0,       // post-shot curve: lateral Magnus accel, set live by the player
      sticky: false,  // power-up: next landing stops dead
      gems: 0,        // gems collected this hole (race: stealable)
      gotRelic: false,// hidden collectible found this hole
      pickup: null,   // transient juice flag: 'gem' | 'relic' (game reads & clears)
      braked: false,  // air-brake used this shot
      impact: 0,      // tree-bounce impact speed (for juice)
      stillT: 0,      // stuck-ball guard
      carry: null,    // transport capture state {kind,t,dur,...} (transport-sim.js)
      tevent: null,   // transient transport event {k} (render reads & clears)
      _tpZone: null,  // zone object currently applying (entry-edge detection)
      _bcZone: -1     // beacon index currently inside (-1 = none; entry-edge detection)
    };
  };

  // Sets velocity, clears resting. Speed capped at MAX_POWER, or
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
    ball.z = 0; ball.vz = 0;
    // hard shots leave the ground: the harder the hit, the higher the launch.
    // (Monster drives soar, medium shots hop, putts stay down.)
    var excess = sp - TF.LAUNCH_MIN;
    if (excess > 0) {
      ball.vz = excess * TF.LAUNCH_K;
      ball.z = 0.1;
    }
    var sn = +o.spin || 0;
    ball.spin = sn > 1 ? 1 : (sn < -1 ? -1 : sn);
    ball.curve = 0;      // post-shot curve is live input, never carried over
    ball.braked = false;
    ball.pickup = null;
    ball.carry = null;   // a new shot never starts inside a transport
    ball.tevent = null;
    ball._tpZone = null;
    // NOTE: ball.sticky is preserved — the sticky power-up is armed pre-shot.
    ball.impact = 0;
    ball.stillT = 0;
    ball.resting = false;
    ball.inCup = false;
    ball.inWater = false;
  };

  // Snapshot / restore for penalty-free undo (Golf Peaks).
  TF.snapBall = function (hole, ball) {
    return { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy,
             resting: ball.resting, spin: ball.spin || 0, stillT: 0,
             curve: 0, sticky: !!ball.sticky,
             gems: ball.gems | 0, gotRelic: !!ball.gotRelic,
             gemTaken: (hole.gems || []).map(function (g) { return g.taken; }),
             relicTaken: hole.relic ? hole.relic.taken : false };
  };
  TF.restoreBall = function (hole, ball, s) {
    ball.x = s.x; ball.y = s.y; ball.vx = s.vx; ball.vy = s.vy;
    ball.resting = s.resting; ball.spin = s.spin || 0; ball.stillT = 0;
    ball.z = 0; ball.vz = 0;
    ball.curve = 0; ball.sticky = !!s.sticky;
    ball.gems = s.gems | 0; ball.gotRelic = !!s.gotRelic;
    ball.pickup = null; ball.braked = false;
    ball.carry = null; ball.tevent = null; ball._tpZone = null; ball._bcZone = -1;
    if (hole.gems) for (var gi = 0; gi < hole.gems.length && gi < s.gemTaken.length; gi++)
      hole.gems[gi].taken = s.gemTaken[gi];
    if (hole.relic) hole.relic.taken = !!s.relicTaken;
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

  // Advances EXACTLY 1/60 s of physics. Sub-steps internally when the
  // ball is fast so no step moves more than half a ball radius.
  // t = absolute sim time in seconds (windmill blades, gusts). Deterministic.
  TF.simStep = function (hole, ball, t) {
    if (ball.inCup || ball.inWater) return;
    if (ball.resting) return;   // a resting ball stays put (no wind creep)
    if (t == null) t = 0;
    var dt = TF.DT;
    var speed = Math.hypot(ball.vx, ball.vy);
    var n = Math.ceil(speed * dt / (TF.BALL_R * 0.5));
    if (n < 1) n = 1;
    if (n > 48) n = 48;
    var sdt = dt / n;
    for (var i = 0; i < n; i++) {
      TF._step(hole, ball, sdt, t);
      if (ball.inCup || ball.inWater || ball.resting) break;
    }
  };

  // Point in a rotated rect? rc = {x, y, w, h, dx, dy} (dx,dy = unit long axis).
  function inRampRect(px, py, rc) {
    var rx = px - rc.x, ry = py - rc.y;
    var lu = rx * rc.dx + ry * rc.dy;
    var lv = rx * (-rc.dy) + ry * rc.dx;
    return Math.abs(lu) <= rc.h / 2 && Math.abs(lv) <= rc.w / 2;
  }

  // Bounce a ball off a segment (banked wall). Returns true on hit.
  function bounceWall(ball, R, x1, y1, x2, y2, rest) {
    var dx = x2 - x1, dy = y2 - y1;
    var L2 = dx * dx + dy * dy;
    var tt = L2 > 0 ? ((ball.x - x1) * dx + (ball.y - y1) * dy) / L2 : 0;
    tt = clamp(tt, 0, 1);
    var cx = x1 + dx * tt, cy = y1 + dy * tt;
    var nx = ball.x - cx, ny = ball.y - cy;
    var d = Math.sqrt(nx * nx + ny * ny);
    var minD = R + 0.5;  // wall half-thickness
    if (d >= minD || d < 0.0001) return false;
    nx /= d; ny /= d;
    ball.x = cx + nx * minD;
    ball.y = cy + ny * minD;
    var vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      ball.impact = Math.max(ball.impact, -vn);
      ball.vx -= (1 + rest) * vn * nx;
      ball.vy -= (1 + rest) * vn * ny;
    }
    return true;
  }

  // Post-shot curve (Super Stickman Golf 3): lateral Magnus-style accel,
  // perpendicular to travel. Positive curve bends left of motion (y-up).
  // Scales with speed so it bites on drives and barely nudges putts.
  function applyCurve(ball, dt) {
    var cv = ball.curve || 0;
    if (cv === 0) return;
    var sp = Math.hypot(ball.vx, ball.vy);
    if (sp > 4) {
      var k = cv * TF.CURVE_K * Math.min(sp / 30, 1) / sp;
      ball.vx += -ball.vy * k * dt;
      ball.vy += ball.vx * k * dt;
    }
    ball.curve = cv * Math.exp(-0.9 * dt);   // the bend dies out over ~1s
  }

  // Gem + relic pickups. Works mid-flight too — flying over one collects it.
  function pickups(hole, ball) {
    var i, g, dx, dy;
    if (hole.relic && !hole.relic.taken && !ball.gotRelic) {
      dx = ball.x - hole.relic.x; dy = ball.y - hole.relic.y;
      if (dx * dx + dy * dy < 1.7 * 1.7) {
        hole.relic.taken = true;
        ball.gotRelic = true;
        ball.pickup = 'relic';
        ball.impact = Math.max(ball.impact, 1.5);
      }
    }
    if (hole.gems) {
      for (i = 0; i < hole.gems.length; i++) {
        g = hole.gems[i];
        if (g.taken) continue;
        dx = ball.x - g.x; dy = ball.y - g.y;
        if (dx * dx + dy * dy < 1.6 * 1.6) {
          g.taken = true;
          ball.gems = (ball.gems | 0) + 1;
          ball.pickup = 'gem';
          ball.impact = Math.max(ball.impact, 1.2);
        }
      }
    }
  }

  // One internal physics sub-step of length dt at sim-time t.
  TF._step = function (hole, ball, dt, t) {
    var R = TF.BALL_R;
    t = t || 0;

    // ---- transport capture: the ball is riding an object; normal physics
    // ---- is suspended while the carry update runs (transport-sim.js). ----
    if (typeof TPS !== 'undefined' && ball.carry) {
      TPS.carryStep(hole, ball, dt, t);
      return;
    }

    // ---- airborne (ramp jumps): ballistic z, wind bites harder ----
    if (ball.z > 0 || ball.vz !== 0) {
      var wndA = TF.windAt(hole, t);
      ball.vx += wndA.x * TF.WIND_K_AIR * dt;
      ball.vy += wndA.y * TF.WIND_K_AIR * dt;
      applyCurve(ball, dt);
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.vz -= TF.GRAV_Z * dt;
      ball.z += ball.vz * dt;
      pickups(hole, ball);
      // ramps kick in near ground level too (ski-jump lip) — not just on the roll
      if (ball.z < 2 && ball.z > 0) {
        var rsp = Math.hypot(ball.vx, ball.vy);
        for (var rri = 0; rri < hole.ramps.length; rri++) {
          var rrq = hole.ramps[rri];
          if (rsp > rrq.minSpeed && inRampRect(ball.x, ball.y, rrq) && ball.vz < 0.65 * rsp) {
            ball.vz = 0.65 * rsp;
            ball.impact = Math.max(ball.impact, 2);
            break;
          }
        }
      }
      if (ball.z <= 0) {
        ball.z = 0;
        ball.impact = Math.max(ball.impact, -ball.vz * 0.5);  // landing thud
        ball.vz = 0;
        if (ball.sticky) {
          // sticky power-up: the landing stops dead (consumed)
          ball.vx = 0; ball.vy = 0;
          ball.sticky = false;
          ball.resting = true;
          ball.stillT = 0;
        } else {
          ball.vx *= 0.82; ball.vy *= 0.82;   // touchdown scrub
        }
        ball.spin = 0;
      }
      // world walls still apply mid-flight (can't leave the world)
      if (ball.x < R) { ball.x = R; if (ball.vx < 0) ball.vx = 0; }
      else if (ball.x > hole.W - R) { ball.x = hole.W - R; if (ball.vx > 0) ball.vx = 0; }
      if (ball.y < R) { ball.y = R; if (ball.vy < 0) ball.vy = 0; }
      else if (ball.y > hole.H - R) { ball.y = hole.H - R; if (ball.vy > 0) ball.vy = 0; }
      ball.resting = false;
      return;
    }

    var surf = TF.surfaceAt(hole, ball.x, ball.y);
    if (surf === 'water') {
      ball.inWater = true;
      ball.vx = 0; ball.vy = 0;
      ball.resting = false;
      return;
    }
    var P = TF.SURF[surf] || TF.SURF.rough;

    // Slope acceleration (the break + dunes).
    var sl = hole.slopeAt(ball.x, ball.y);
    var slMag = Math.hypot(sl.x, sl.y);

    // Wind: a real pressure force on the ball (stronger relative effect
    // on slow balls — putts feel it, drives barely do).
    var wnd = TF.windAt(hole, t);
    var windK = TF.WIND_K * (surf === 'sand' ? 0.3 : 1);

    // Spin shapes effective friction: topspin runs on, backspin bites.
    var spn = ball.spin || 0;
    var fr = P.fr * (1 - 0.45 * spn);
    if (fr < 1) fr = 1;

    ball.vx += (sl.x + wnd.x * windK) * dt;
    ball.vy += (sl.y + wnd.y * windK) * dt;
    applyCurve(ball, dt);

    // Rolling resistance: Coulomb decel + exponential damping.
    var sp = Math.hypot(ball.vx, ball.vy);
    if (sp > 0) {
      var dec = fr * dt;
      var nsp = sp - dec;
      if (nsp < 0) nsp = 0;
      nsp *= Math.exp(-P.damp * dt);
      if (ball.sticky) nsp *= Math.exp(-5 * dt);  // sticky grabs the turf too
      var kk = nsp / sp;
      ball.vx *= kk; ball.vy *= kk;
      sp = nsp;
    }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    pickups(hole, ball);

    // ---- transport objects: force zones first, then capture entries ----
    // (grounded only; a ball flying over a portal mouth is not captured)
    if (typeof TPS !== 'undefined') {
      TPS.zoneStep(hole, ball, dt, t);
      if (TPS.beaconStep) TPS.beaconStep(hole, ball, t);
      var tpEnter = TPS.tryEnter(hole, ball, t);
      if (tpEnter) {
        ball.carry = tpEnter;
        ball.tevent = { k: tpEnter.kind + '-enter', x: ball.x, y: ball.y };
      }
    }

    ball.spin = spn * Math.exp(-1.4 * dt);  // spin dies as the ball rolls

    // Ramps: hit one with speed and you launch (ski-jump air).
    var ri, rp2;
    for (ri = 0; ri < hole.ramps.length; ri++) {
      rp2 = hole.ramps[ri];
      if (sp > rp2.minSpeed && inRampRect(ball.x, ball.y, rp2)) {
        ball.vz = 0.65 * sp;
        ball.z = 0.1;
        ball.impact = Math.max(ball.impact, 2);  // launch kick (for sound)
        break;
      }
    }

    // Trees: circle bumpers.
    var i, t2, tdx, tdy, td, minD, nx, ny, vn;
    for (i = 0; i < hole.trees.length; i++) {
      t2 = hole.trees[i];
      tdx = ball.x - t2.x; tdy = ball.y - t2.y;
      td = Math.sqrt(tdx * tdx + tdy * tdy);
      minD = R + t2.r;
      if (td < minD && td > 0.0001) {
        nx = tdx / td; ny = tdy / td;
        ball.x = t2.x + nx * minD;
        ball.y = t2.y + ny * minD;
        vn = ball.vx * nx + ball.vy * ny;
        if (vn < 0) {
          ball.impact = -vn;
          ball.vx -= (1 + TF.REST_TREE) * vn * nx;
          ball.vy -= (1 + TF.REST_TREE) * vn * ny;
          ball.vx *= 0.92; ball.vy *= 0.92;
        }
      }
    }

    // Banked mini-golf walls.
    for (i = 0; i < hole.walls.length; i++) {
      var wl = hole.walls[i];
      bounceWall(ball, R, wl.x1, wl.y1, wl.x2, wl.y2, TF.REST_WALL);
    }

    // Windmill: hub is a bumper; blades sweep and smack the ball.
    var wml = hole.windmill;
    if (wml) {
      var hdx = ball.x - wml.x, hdy = ball.y - wml.y;
      var hd = Math.sqrt(hdx * hdx + hdy * hdy);
      if (hd < R + wml.hubR && hd > 0.0001) {
        var hnx = hdx / hd, hny = hdy / hd;
        ball.x = wml.x + hnx * (R + wml.hubR);
        ball.y = wml.y + hny * (R + wml.hubR);
        var hvn = ball.vx * hnx + ball.vy * hny;
        if (hvn < 0) {
          ball.impact = Math.max(ball.impact, -hvn);
          ball.vx -= (1 + TF.REST_TREE) * hvn * hnx;
          ball.vy -= (1 + TF.REST_TREE) * hvn * hny;
        }
      }
      var ba = TF.bladeAngle(hole, t);
      for (var b = 0; b < 4; b++) {
        var bang = ba + b * Math.PI / 2;
        var bux = Math.cos(bang), buy = Math.sin(bang);
        var bcx = wml.x + bux * (wml.hubR + wml.bladeLen / 2);
        var bcy = wml.y + buy * (wml.hubR + wml.bladeLen / 2);
        // ball in blade local frame
        var rx = ball.x - bcx, ry = ball.y - bcy;
        var lu = rx * bux + ry * buy;          // along blade
        var lv = rx * (-buy) + ry * bux;       // across blade
        var hu = wml.bladeLen / 2 + R, hv = wml.bladeW / 2 + R;
        if (Math.abs(lu) < hu && Math.abs(lv) < hv) {
          // push out along the smallest penetration axis
          var pu = hu - Math.abs(lu), pv = hv - Math.abs(lv);
          var wnx2, wny2;
          if (pu < pv) { wnx2 = (lu > 0 ? bux : -bux); wny2 = (lu > 0 ? buy : -buy); }
          else { wnx2 = (lv > 0 ? -buy : buy); wny2 = (lv > 0 ? bux : -bux); }
          var pen = Math.min(pu, pv);
          ball.x += wnx2 * pen;
          ball.y += wny2 * pen;
          var bvn = ball.vx * wnx2 + ball.vy * wny2;
          // blade surface velocity at the contact radius
          var rContact = wml.hubR + wml.bladeLen / 2 + lu;
          var bvx = -buy * wml.speed * rContact, bvy = bux * wml.speed * rContact;
          if (bvn < 0) {
            ball.impact = Math.max(ball.impact, -bvn + Math.abs(wml.speed) * 2);
            ball.vx -= (1 + 0.7) * bvn * wnx2;
            ball.vy -= (1 + 0.7) * bvn * wny2;
          }
          ball.vx += bvx * 0.8;   // the blade flings the ball clear of the disc
          ball.vy += bvy * 0.8;
        }
      }
    }

    // World walls.
    if (ball.x < R) { ball.x = R; if (ball.vx < 0) { ball.impact = Math.max(ball.impact, -ball.vx); ball.vx = -ball.vx * TF.REST_TREE; } }
    else if (ball.x > hole.W - R) { ball.x = hole.W - R; if (ball.vx > 0) { ball.impact = Math.max(ball.impact, ball.vx); ball.vx = -ball.vx * TF.REST_TREE; } }
    if (ball.y < R) { ball.y = R; if (ball.vy < 0) { ball.impact = Math.max(ball.impact, -ball.vy); ball.vy = -ball.vy * TF.REST_TREE; } }
    else if (ball.y > hole.H - R) { ball.y = hole.H - R; if (ball.vy > 0) { ball.impact = Math.max(ball.impact, ball.vy); ball.vy = -ball.vy * TF.REST_TREE; } }

    // ---- cup magnet: slow grounded balls near the cup get a gentle pull ----
    // (Mini Touch Golf: holes attract more than real physics suggests.)
    if (!ball.inCup) {
      var mdx = hole.cup.x - ball.x, mdy = hole.cup.y - ball.y;
      var md = Math.sqrt(mdx * mdx + mdy * mdy);
      var msp = Math.hypot(ball.vx, ball.vy);
      if (md < TF.MAGNET_R && md > 0.001 && msp < TF.CAPTURE_V * 1.6) {
        var pull = (1 - md / TF.MAGNET_R) * 24;
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
        ball.y = hole.cup.y;
        ball.vx = 0; ball.vy = 0;
        return;
      }
    }

    // ---- rest: slow enough that friction holds it against slope+wind ----
    var spdNow = Math.hypot(ball.vx, ball.vy);
    if (spdNow < 1.0) ball.stillT = (ball.stillT || 0) + dt;
    else ball.stillT = 0;
    if ((spdNow < 0.9 && slMag + Math.hypot(wnd.x, wnd.y) * windK < fr) || (ball.stillT || 0) > 2.5) {
      ball.vx = 0; ball.vy = 0;
      ball.resting = true;
      ball.stillT = 0;
      ball.sticky = false;   // sticky is consumed when the ball settles
    } else {
      ball.resting = false;
    }
  };

  /* ---------------- post-shot curve, power-ups, race ---------------- */

  TF.CURVE_K = 16;   // lateral accel per unit curve at full bite

  // Live curve input (drag after release). Only while the ball is moving.
  TF.setCurve = function (ball, v) {
    if (!ball || ball.resting || ball.inCup || ball.inWater) return;
    ball.curve = clamp(v, -1, 1);
  };

  // Air-brake power-up: kills most of the ball's speed right now.
  TF.applyBrake = function (ball) {
    if (!ball || ball.resting || ball.inCup || ball.inWater) return false;
    ball.vx *= 0.25; ball.vy *= 0.25; ball.vz *= 0.5;
    ball.curve = 0;
    ball.braked = true;
    return true;
  };

  // Arm the sticky power-up for the next shot.
  TF.armSticky = function (ball) {
    if (!ball || !ball.resting) return false;
    ball.sticky = true;
    return true;
  };

  // Ball-ball collision (race mode, Mini Golf King clashing). Equal mass,
  // bouncy. In race mode a hard bump steals one gem from the slower ball.
  TF.collideBalls = function (balls, race) {
    var i, j;
    for (i = 0; i < balls.length; i++) {
      for (j = i + 1; j < balls.length; j++) {
        var a = balls[i], b = balls[j];
        if (a.inCup || a.inWater || b.inCup || b.inWater) continue;
        var dx = b.x - a.x, dy = b.y - a.y;
        var minD = TF.BALL_R * 2;
        var d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD || d2 < 1e-6) continue;
        var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        var overlap = (minD - d) / 2;
        a.x -= nx * overlap; a.y -= ny * overlap;
        b.x += nx * overlap; b.y += ny * overlap;
        var avn = a.vx * nx + a.vy * ny, bvn = b.vx * nx + b.vy * ny;
        var rel = avn - bvn;
        if (rel > 0) {
          // the bumped ball is the slower one BEFORE the impulse (judged now,
          // because the exchange flips who is faster)
          var slowIsA = Math.hypot(a.vx, a.vy) < Math.hypot(b.vx, b.vy);
          var imp = (1 + 0.92) * rel / 2;
          a.vx -= imp * nx; a.vy -= imp * ny;
          b.vx += imp * nx; b.vy += imp * ny;
          a.resting = false; b.resting = false;
          a.impact = Math.max(a.impact, rel / 2);
          b.impact = Math.max(b.impact, rel / 2);
          if (race && rel > 10) {
            var victim = slowIsA ? a : b;
            var taker = victim === a ? b : a;
            if ((victim.gems | 0) > 0) {
              victim.gems--;
              taker.gems = (taker.gems | 0) + 1;
              taker.pickup = 'gem';
            }
          }
        }
      }
    }
  };

  // Steps every ball in a race, then resolves clashes.
  TF.raceStep = function (hole, balls, t) {
    var i;
    for (i = 0; i < balls.length; i++) TF.simStep(hole, balls[i], t);
    TF.collideBalls(balls, true);
  };

  // Transports: if a capture entry lies near the ball's line to its target,
  // aim into the entry instead of the waypoint. Returns {x,y,power} or null.
  TF.transportAim = function (hole, ball, tx, ty) {
    var bx = ball.x, by = ball.y;
    var bestX = 0, bestY = 0, bestNeed = 0, bestD = Infinity;
    function consider(ex, ey, need) {
      var dx = ex - bx, dy = ey - by;
      var d = Math.hypot(dx, dy);
      if (d > 30 || d < 1.0) return;                       // too far, or truly on top of it
      var vx = tx - bx, vy = ty - by;
      var L2 = vx * vx + vy * vy;
      var tt = L2 > 0 ? (dx * vx + dy * vy) / L2 : 0;
      if (tt < 0.05 || tt > 1.1) return;                  // not toward the target
      var px = bx + vx * tt, py = by + vy * tt;
      if (Math.hypot(ex - px, ey - py) > 14) return;      // too far off the line
      if (d < bestD) { bestD = d; bestX = ex; bestY = ey; bestNeed = need; }
    }
    var ti2, o;
    if (hole.cannons) for (ti2 = 0; ti2 < hole.cannons.length; ti2++) {
      o = hole.cannons[ti2]; consider(o.x, o.y, 12);
    }
    if (hole.lifts) for (ti2 = 0; ti2 < hole.lifts.length; ti2++) {
      o = hole.lifts[ti2]; consider(o.x1, o.y1, 10);
    }
    if (hole.tubes) for (ti2 = 0; ti2 < hole.tubes.length; ti2++) {
      o = hole.tubes[ti2]; consider(o.path[0][0], o.path[0][1], 10);
    }
    if (hole.loops) for (ti2 = 0; ti2 < hole.loops.length; ti2++) {
      o = hole.loops[ti2]; consider(o.x, o.y - o.r, o.minSpeed + 6);
    }
    if (hole.portals) for (ti2 = 0; ti2 < hole.portals.length; ti2++) {
      o = hole.portals[ti2]; consider(o.x1, o.y1, 8);
    }
    if (bestD === Infinity) return null;
    // stay grounded: entries capture rolling balls only; a launched ball
    // would fly straight over the mouth
    return { x: bestX, y: bestY,
             power: Math.min(Math.max(bestD * 1.35, bestNeed), TF.LAUNCH_MIN - 1) };
  };

  // Race bot brain (compact port of the headless greedy bot). bs = {ball,
  // wps, wi, lastRest}. Returns [vx,vy] for one shot, or null if the ball
  // is still moving.
  TF.botState = function (hole) {
    var wps = hole.fairway.map(function (s) {
      return { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
    });
    wps.push({ x: hole.cup.x, y: hole.cup.y });
    return { ball: null, wps: wps, wi: 0,
             lastRest: { x: hole.tee.x, y: hole.tee.y } };
  };
  TF.botShot = function (hole, bs) {
    var ball = bs.ball;
    if (!ball || !ball.resting || ball.inCup || ball.inWater) return null;
    var wps = bs.wps;
    // jump to the furthest waypoint we're already near — transports can
    // shortcut the ball far ahead (tube/portal/lift/cannon rides)
    var wj2;
    for (wj2 = wps.length - 1; wj2 >= bs.wi; wj2--) {
      if (Math.hypot(ball.x - wps[wj2].x, ball.y - wps[wj2].y) < 6) break;
    }
    bs.wi = Math.min(wj2 + 1, wps.length - 1);
    var tgt = wps[bs.wi];
    var dx = tgt.x - ball.x, dy = tgt.y - ball.y;
    var dist = Math.hypot(dx, dy) || 0.001;
    // windmill: route around the hub instead of through the blade disc
    var wml = hole.windmill;
    if (wml) {
      var segLen = dist;
      var tt = ((wml.x - ball.x) * dx + (wml.y - ball.y) * dy) / (segLen * segLen);
      tt = Math.max(0, Math.min(1, tt));
      var cxp = ball.x + dx * tt, cyp = ball.y + dy * tt;
      var clear = wml.bladeLen + wml.hubR + 2.5;
      if (Math.hypot(tgt.x - wml.x, tgt.y - wml.y) < clear ||
          (Math.hypot(wml.x - cxp, wml.y - cyp) < clear && tt < 0.95)) {
        var pxn = -dy / segLen, pyn = dx / segLen;
        var s1x = wml.x + pxn * (clear + 2), s1y = wml.y + pyn * (clear + 2);
        var s2x = wml.x - pxn * (clear + 2), s2y = wml.y - pyn * (clear + 2);
        var d1 = Math.hypot(ball.x - s1x, ball.y - s1y);
        var d2 = Math.hypot(ball.x - s2x, ball.y - s2y);
        tgt = d1 < d2 ? { x: s1x, y: s1y } : { x: s2x, y: s2y };
        dx = tgt.x - ball.x; dy = tgt.y - ball.y;
        dist = Math.hypot(dx, dy) || 0.001;
      }
    }
    var power = Math.min(Math.max(dist * 1.12, 7), TF.MAX_POWER * 0.85);
    // transports: play into a nearby capture entry instead of the waypoint
    var tpAim = TF.transportAim(hole, ball, tgt.x, tgt.y);
    if (tpAim) {
      tgt = { x: tpAim.x, y: tpAim.y };
      dx = tgt.x - ball.x; dy = tgt.y - ball.y;
      dist = Math.hypot(dx, dy) || 0.001;
      power = tpAim.power;
    }
    // near a windmill, stay grounded: the blades punish flyers
    if (!tpAim && hole.windmill && Math.hypot(ball.x - hole.windmill.x, ball.y - hole.windmill.y) < 30) {
      power = Math.min(power, TF.LAUNCH_MIN - 1);
    }
    // avoid water: if the straight line crosses water, take the next waypoint
    // (but never when committed to a transport entry — the transport IS the
    // crossing solution, e.g. a lift over a moat)
    var blocked = false, k, f;
    for (k = 0; k < hole.water.length && !blocked; k++) {
      var we = hole.water[k];
      for (f = 0.1; f < 1; f += 0.1) {
        var qx = ball.x + dx * f, qy = ball.y + dy * f;
        var ex = (qx - we.x) / (we.rx + 1), ey = (qy - we.y) / (we.ry + 1);
        if (ex * ex + ey * ey < 1) { blocked = true; break; }
      }
    }
    if (blocked && !tpAim && bs.wi + 1 < wps.length) {
      tgt = wps[bs.wi + 1];
      dx = tgt.x - ball.x; dy = tgt.y - ball.y;
      dist = Math.hypot(dx, dy) || 0.001;
      power = Math.min(Math.max(dist * 1.12, 7), TF.MAX_POWER * 0.85);
    } else if (blocked && hole.ramps.length) {
      // nowhere safe ahead: play for the ramp — designed water crossings
      // always pair with one. Enough speed to trigger the launch.
      var rp0 = hole.ramps[0];
      dx = rp0.x - ball.x; dy = rp0.y - ball.y;
      dist = Math.hypot(dx, dy) || 0.001;
      power = Math.min(Math.max(dist * 1.5 + 12, 15), 38);
    }
    return [dx / dist * power, dy / dist * power];
  };
  /* ---------------- scoring ---------------- */

  TF.starsFor = function (strokes, par) {
    if (strokes <= par) return 3;
    if (strokes === par + 1) return 2;
    return 1;
  };

  if (typeof globalThis !== 'undefined') globalThis.TF = TF;
})();
