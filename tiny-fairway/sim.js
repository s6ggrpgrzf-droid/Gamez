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

    return {
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
      biome: biome
    };
  };

  // Wind vector at sim-time t (seconds): base + slow organic gusts.
  // Deterministic in t, so replays, previews, and daily holes agree.
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
      if (inEllipse(x, y, hole.water[i])) return 'water';
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
      impact: 0,      // tree-bounce impact speed (for juice)
      stillT: 0       // stuck-ball guard
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
    ball.z = 0; ball.vz = 0;
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

  // One internal physics sub-step of length dt at sim-time t.
  TF._step = function (hole, ball, dt, t) {
    var R = TF.BALL_R;
    t = t || 0;

    // ---- airborne (ramp jumps): ballistic z, wind bites harder ----
    if (ball.z > 0 || ball.vz !== 0) {
      var wndA = TF.windAt(hole, t);
      ball.vx += wndA.x * TF.WIND_K_AIR * dt;
      ball.vy += wndA.y * TF.WIND_K_AIR * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.vz -= TF.GRAV_Z * dt;
      ball.z += ball.vz * dt;
      if (ball.z <= 0) {
        ball.z = 0;
        ball.impact = Math.max(ball.impact, -ball.vz * 0.5);  // landing thud
        ball.vz = 0;
        ball.vx *= 0.82; ball.vy *= 0.82;   // touchdown scrub
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

    // Rolling resistance: Coulomb decel + exponential damping.
    var sp = Math.hypot(ball.vx, ball.vy);
    if (sp > 0) {
      var dec = fr * dt;
      var nsp = sp - dec;
      if (nsp < 0) nsp = 0;
      nsp *= Math.exp(-P.damp * dt);
      var kk = nsp / sp;
      ball.vx *= kk; ball.vy *= kk;
      sp = nsp;
    }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

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
    } else {
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
