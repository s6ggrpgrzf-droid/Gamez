/* Tiny Fairway — transport-object simulation (TPS).
 *
 * Sim half of the transport engine (see TRANSPORT_CONTRACT.md). Loaded after
 * sim.js, before game.js. Zero DOM, zero canvas, zero Math.random: every
 * behavior is a deterministic function of hole data + ball state + absolute
 * sim time t. One IIFE, exposes window.TPS.
 *
 *   TPS.tryEnter(hole, ball, t)  -> carry object or null
 *   TPS.carryStep(hole, ball, dt, t) -> advance an active carry
 *   TPS.zoneStep(hole, ball, dt, t)  -> pads / belts / fans / wells / tables
 *
 * Exit transforms never strand the ball: z=0, vz=0, resting=false, and
 * spin/sticky/gems are never touched. Cannon exit speed is clamped to
 * TF.OVERDRIVE_MAX. Gravity-well total accel is hard-capped at 30.
 */

(function () {
  'use strict';

  var TPS = {};

  var TAU = 6.283185307179586;
  var COS_HALF = 0.8775825618903728; // cos(0.5): fan cone half-angle test
  var WELL_ACC_CAP = 30;             // hard cap on total gravity-well accel
  var MOUTH_R = 2.5;                 // shared capture radius: lift / tube / loop

  function tpClamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function tpDist2(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    return dx * dx + dy * dy;
  }

  // Module-scope scratch: well force accumulation without per-substep
  // allocation, and the tube path-follow output point.
  var wellAX = 0, wellAY = 0;
  var TP_OUT = { x: 0, y: 0 };

  /* ---------------- entry ---------------- */

  // Returns a carry object or null. Priority on overlap:
  // cannon > lift > tube > loop > portal. Grounded balls only (caller
  // guarantees); a ball at rest (speed <= 1) never auto-enters. After any
  // exit/reject, _tpExitT blocks re-entry for 0.5 s (anti-chain).
  TPS.tryEnter = function (hole, ball, t) {
    if (ball.carry) return null;
    var spd = Math.hypot(ball.vx, ball.vy);
    if (spd <= 1.0) return null;
    if (ball._tpExitT != null && t - ball._tpExitT < 0.5) return null;
    var i, zo, cc;

    var cn = hole.cannons;
    for (i = 0; i < cn.length; i++) {
      zo = cn[i];
      if (tpDist2(ball.x, ball.y, zo.x, zo.y) < 2.2 * 2.2) {
        cc = enterCannon(zo, t);
        if (cc) return cc;
      }
    }
    var lf = hole.lifts;
    for (i = 0; i < lf.length; i++) {
      zo = lf[i];
      if (tpDist2(ball.x, ball.y, zo.x1, zo.y1) < MOUTH_R * MOUTH_R) {
        cc = enterLift(zo);
        if (cc) return cc;
      }
    }
    var tb = hole.tubes;
    for (i = 0; i < tb.length; i++) {
      zo = tb[i];
      if (zo.path && zo.path.length > 1 &&
          tpDist2(ball.x, ball.y, zo.path[0][0], zo.path[0][1]) < MOUTH_R * MOUTH_R) {
        cc = enterTube(zo);
        if (cc) return cc;
      }
    }
    var lp = hole.loops;
    for (i = 0; i < lp.length; i++) {
      zo = lp[i];
      if (tpDist2(ball.x, ball.y, zo.x, zo.y - zo.r) < MOUTH_R * MOUTH_R) {
        if (spd < zo.minSpeed) {
          // Too slow: bounce back out of the gate, no capture.
          ball.vx = -ball.vx * 0.35;
          ball.vy = -ball.vy * 0.35;
          ball.tevent = { k: 'loop-reject', x: ball.x, y: ball.y };
          ball._tpExitT = t; // grace so the next substep doesn't re-reject
          return null;
        }
        cc = enterLoop(zo, ball, spd);
        if (cc) return cc;
      }
    }
    var pt = hole.portals;
    for (i = 0; i < pt.length; i++) {
      zo = pt[i];
      if (tpDist2(ball.x, ball.y, zo.x1, zo.y1) < zo.r * zo.r) {
        cc = enterPortal(zo, ball);
        if (cc) return cc;
      }
    }
    return null;
  };

  function enterPortal(po, ball) {
    if (!(po.r > 0)) return null;
    return { kind: 'portal', t: 0, dur: 0.45,
             x0: ball.x, y0: ball.y,       // capture position (ease start)
             x1: po.x1, y1: po.y1,          // entry disc center (ease target)
             x2: po.x2, y2: po.y2,
             redirect: po.redirect | 0, ex: po.ex || 0, ey: po.ey || 0,
             vx: ball.vx, vy: ball.vy,      // entry velocity (restored at exit)
             ported: false };
  }

  // Cannon aim at absolute sim-time tau: sweeps angle +/- angleCycle/2 on a
  // deterministic 4 s cycle. angleCycle = 0 -> fixed barrel.
  function cannonAim(cn, tau) {
    return cn.angle + (cn.angleCycle * 0.5) * Math.sin(TAU * tau * 0.25);
  }
  function enterCannon(cn, t) {
    if (!(cn.power > 0)) return null;
    return { kind: 'cannon', t: 0, dur: 0.8,
             x: cn.x, y: cn.y, power: cn.power, tEnter: t,
             ang0: cannonAim(cn, t), ang1: cannonAim(cn, t + 0.8) };
  }

  function enterTube(tb) {
    if (!(tb.speed > 0)) return null;
    var pts = tb.path, n = pts.length;
    if (n < 2) return null;
    // Cumulative arc lengths, computed ONCE at entry (never per substep).
    var cum = new Array(n);
    cum[0] = 0;
    var total = 0, qi;
    for (qi = 1; qi < n; qi++) {
      total += Math.hypot(pts[qi][0] - pts[qi - 1][0],
                          pts[qi][1] - pts[qi - 1][1]);
      cum[qi] = total;
    }
    if (!(total > 0)) return null;
    return { kind: 'tube', t: 0, dur: total / tb.speed,
             pts: pts, cum: cum, total: total, speed: tb.speed, s: 0 };
  }

  function enterLoop(lp, ball, spd) {
    if (!(lp.r > 0)) return null;
    return { kind: 'loop', t: 0, dur: TAU * lp.r / spd,
             x: lp.x, y: lp.y, r: lp.r,
             dir: ball.vx >= 0 ? 1 : -1, a0: -Math.PI * 0.5 };
  }

  function enterLift(lf) {
    if (!(lf.duration > 0)) return null;
    return { kind: 'lift', t: 0, dur: lf.duration,
             x1: lf.x1, y1: lf.y1, x2: lf.x2, y2: lf.y2 };
  }

  /* ---------------- carry ---------------- */

  // Advance carry.t, run the kind update, and on completion apply the exit
  // transform + tevent, clear the carry, and stamp _tpExitT (anti-chain).
  // Physics stays suspended throughout: resting=false, z=0, vz=0.
  // spin/sticky/gems are never touched.
  TPS.carryStep = function (hole, ball, dt, t) {
    var c = ball.carry;
    if (!c) return;
    c.t += dt;
    var done = c.t >= c.dur;
    if (c.kind === 'portal') updPortal(ball, c, done);
    else if (c.kind === 'cannon') updCannon(ball, c, done);
    else if (c.kind === 'tube') updTube(ball, c, dt, done);
    else if (c.kind === 'loop') updLoop(ball, c, done);
    else if (c.kind === 'lift') updLift(ball, c, done);
    ball.resting = false;
    ball.z = 0;
    ball.vz = 0;
    if (done) {
      // Contract tevent names: kind+'-exit', except the cannon's boom
      // moment, which the contract names 'cannon-fire'.
      var ek = c.kind === 'cannon' ? 'cannon-fire' : c.kind + '-exit';
      ball.tevent = { k: ek, x: ball.x, y: ball.y };
      ball.carry = null;
      ball._tpExitT = t;
    }
  };

  function updPortal(ball, c, done) {
    var half = c.dur * 0.5;
    if (!c.ported && c.t >= half) {
      c.ported = true;
      ball.x = c.x2; ball.y = c.y2;
      ball.vx = 0; ball.vy = 0;
    }
    if (!c.ported) {
      // First half: ease into the entry disc, velocity decays to zero.
      var p = tpClamp(c.t / half, 0, 1);
      var e = p * p * (3 - 2 * p);
      ball.x = c.x0 + (c.x1 - c.x0) * e;
      ball.y = c.y0 + (c.y1 - c.y0) * e;
      var vk = 1 - e;
      ball.vx = c.vx * vk;
      ball.vy = c.vy * vk;
    } else if (!done) {
      ball.x = c.x2; ball.y = c.y2;
      ball.vx = 0; ball.vy = 0;
    }
    if (done) {
      ball.x = c.x2; ball.y = c.y2;
      if (c.redirect === 1) {
        var sp = Math.hypot(c.vx, c.vy);
        ball.vx = c.ex * sp;
        ball.vy = c.ey * sp;
      } else {
        ball.vx = c.vx;
        ball.vy = c.vy;
      }
    }
  }

  function updCannon(ball, c, done) {
    ball.x = c.x; ball.y = c.y;
    ball.vx = 0; ball.vy = 0;
    if (done) {
      // ang1 = aim(tEnter + dur): the exact absolute-time aim at fire.
      var pw = c.power > TF.OVERDRIVE_MAX ? TF.OVERDRIVE_MAX : c.power;
      ball.vx = Math.cos(c.ang1) * pw;
      ball.vy = Math.sin(c.ang1) * pw;
    }
  }

  // Path position at arc-length s -> TP_OUT (module scratch, no allocation).
  function tubePoint(c, s) {
    var pts = c.pts, cum = c.cum, n = pts.length;
    var ss = s < 0 ? 0 : (s > c.total ? c.total : s);
    var i = 1;
    while (i < n - 1 && cum[i] < ss) i++;
    var seg = cum[i] - cum[i - 1];
    var f = seg > 0 ? (ss - cum[i - 1]) / seg : 0;
    TP_OUT.x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f;
    TP_OUT.y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f;
  }

  function updTube(ball, c, dt, done) {
    if (!done) {
      c.s += c.speed * dt;
      if (c.s > c.total) c.s = c.total;
      tubePoint(c, c.s);
      ball.x = TP_OUT.x;
      ball.y = TP_OUT.y;
      ball.vx = 0; ball.vy = 0;
    } else {
      var pts = c.pts, n = pts.length;
      var exx = pts[n - 1][0], eyy = pts[n - 1][1];
      var pxx = pts[n - 2][0], pyy = pts[n - 2][1];
      var tl = Math.hypot(exx - pxx, eyy - pyy) || 1;
      ball.x = exx; ball.y = eyy;
      ball.vx = (exx - pxx) / tl * c.speed;
      ball.vy = (eyy - pyy) / tl * c.speed;
    }
  }

  function updLoop(ball, c, done) {
    if (!done) {
      // Constant arc speed: one full revolution takes exactly dur.
      var a = c.a0 + c.dir * TAU * (c.t / c.dur);
      ball.x = c.x + c.r * Math.cos(a);
      ball.y = c.y + c.r * Math.sin(a);
    } else {
      ball.x = c.x;
      ball.y = c.y - c.r;
      // Velocity is untouched throughout the ride: still the entry velocity.
    }
  }

  function updLift(ball, c, done) {
    var p = tpClamp(c.t / c.dur, 0, 1);
    var bx, by;
    if (p < 0.3) { bx = c.x1; by = c.y1; }
    else if (p < 0.8) {
      var q = (p - 0.3) / 0.5;
      bx = c.x1 + (c.x2 - c.x1) * q;
      by = c.y1 + (c.y2 - c.y1) * q;
    } else { bx = c.x2; by = c.y2; }
    ball.x = bx; ball.y = by;
    ball.vx = 0; ball.vy = 0;
    if (done) {
      var tx = c.x2 - c.x1, ty = c.y2 - c.y1;
      var tl = Math.hypot(tx, ty);
      if (tl > 0.0001) { ball.vx = tx / tl * 4; ball.vy = ty / tl * 4; }
      else { ball.vx = 0; ball.vy = 4; }
    }
  }

  /* ---------------- zones ---------------- */

  // Rotated-rect test (same convention as sim.js inRampRect: h is the
  // along-axis extent, w the across-axis extent).
  function beltHas(b, x, y) {
    var rx = x - b.x, ry = y - b.y;
    var lu = rx * b.dx + ry * b.dy;
    var lv = rx * (-b.dy) + ry * b.dx;
    return Math.abs(lu) <= b.h * 0.5 && Math.abs(lv) <= b.w * 0.5;
  }

  // Fan cone: returns falloff 0..1, or 0 when the ball is out of range or
  // outside the 0.5 rad half-angle cone.
  function fanFall(f, x, y) {
    var dx = x - f.x, dy = y - f.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d >= f.range || d < 0.0001) return 0;
    if ((f.dx * dx + f.dy * dy) / d <= COS_HALF) return 0;
    return 1 - d / f.range;
  }

  // Force zones (grounded only; caller guarantees). Entry-edge tevents:
  // ball._tpZone holds the current zone object; a tevent fires only when it
  // changes to a new zone object. Leaving all zones clears it silently.
  // Pads boost on entry only; belts/fans/wells/tables apply every substep
  // from every overlapping zone (not just the _tpZone one).
  TPS.zoneStep = function (hole, ball, dt, t) {
    var i, zo;

    // ---- entry-edge detection (priority: pad > belt > fan > well > table)
    var zobj = null, zkind = null;
    var pads = hole.pads;
    for (i = 0; i < pads.length; i++) {
      zo = pads[i];
      if (tpDist2(ball.x, ball.y, zo.x, zo.y) < zo.r * zo.r) {
        zobj = zo; zkind = 'pad'; break;
      }
    }
    if (!zobj) {
      var belts0 = hole.belts;
      for (i = 0; i < belts0.length; i++) {
        zo = belts0[i];
        if (beltHas(zo, ball.x, ball.y)) { zobj = zo; zkind = 'belt'; break; }
      }
    }
    if (!zobj) {
      var fans0 = hole.fans;
      for (i = 0; i < fans0.length; i++) {
        zo = fans0[i];
        if (fanFall(zo, ball.x, ball.y) > 0) { zobj = zo; zkind = 'fan'; break; }
      }
    }
    if (!zobj) {
      var wells0 = hole.wells;
      for (i = 0; i < wells0.length; i++) {
        zo = wells0[i];
        if (tpDist2(ball.x, ball.y, zo.x, zo.y) < zo.r * zo.r) {
          zobj = zo; zkind = 'well'; break;
        }
      }
    }
    if (!zobj) {
      var tables0 = hole.tables;
      for (i = 0; i < tables0.length; i++) {
        zo = tables0[i];
        if (tpDist2(ball.x, ball.y, zo.x, zo.y) < zo.r * zo.r) {
          zobj = zo; zkind = 'table'; break;
        }
      }
    }
    if (zobj !== ball._tpZone) {
      ball._tpZone = zobj;
      if (zobj) {
        ball.tevent = { k: zkind, x: ball.x, y: ball.y };
        if (zkind === 'pad') {
          ball.vx += zobj.dx * zobj.boost;
          ball.vy += zobj.dy * zobj.boost;
        }
      }
    }

    // ---- continuous forces: every overlapping zone applies ----
    var belts = hole.belts;
    for (i = 0; i < belts.length; i++) {
      zo = belts[i];
      if (beltHas(zo, ball.x, ball.y)) {
        var btx = zo.dx * zo.speed, bty = zo.dy * zo.speed;
        var bk = dt * 3;
        if (bk > 1) bk = 1;
        ball.vx += (btx - ball.vx) * bk;
        ball.vy += (bty - ball.vy) * bk;
      }
    }
    var fans = hole.fans;
    for (i = 0; i < fans.length; i++) {
      zo = fans[i];
      var fall = fanFall(zo, ball.x, ball.y);
      if (fall > 0) {
        var fa = zo.strength * fall * dt;
        ball.vx += zo.dx * fa;
        ball.vy += zo.dy * fa;
      }
    }
    wellAX = 0; wellAY = 0;
    var wells = hole.wells;
    for (i = 0; i < wells.length; i++) {
      zo = wells[i];
      var wdx = zo.x - ball.x, wdy = zo.y - ball.y;
      var wd = Math.sqrt(wdx * wdx + wdy * wdy);
      if (wd < zo.r && wd > 0.01) {
        var pull = zo.strength * (1 - wd / zo.r);
        wellAX += (wdx / wd) * pull;
        wellAY += (wdy / wd) * pull;
      }
    }
    var wmag = Math.sqrt(wellAX * wellAX + wellAY * wellAY);
    if (wmag > WELL_ACC_CAP) {
      var wsc = WELL_ACC_CAP / wmag;
      wellAX *= wsc;
      wellAY *= wsc;
    }
    ball.vx += wellAX * dt;
    ball.vy += wellAY * dt;
    var tables = hole.tables;
    for (i = 0; i < tables.length; i++) {
      zo = tables[i];
      if (tpDist2(ball.x, ball.y, zo.x, zo.y) < zo.r * zo.r) {
        var svx = -(ball.y - zo.y) * zo.omega;
        var svy = (ball.x - zo.x) * zo.omega;
        var tk = dt * 2.5;
        if (tk > 1) tk = 1;
        ball.vx += (svx - ball.vx) * tk;
        ball.vy += (svy - ball.vy) * tk;
      }
    }
  };

  if (typeof globalThis !== 'undefined') globalThis.TPS = TPS;
})();
