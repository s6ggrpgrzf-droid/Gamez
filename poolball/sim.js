/* Poolball — pure simulation. No DOM, no canvas, no Math.random.
 * All randomness flows through the seeded PRNG so tables are reproducible
 * and the whole thing runs headless under node for tests.
 *
 * Usage:
 *   var s = PBSim.createTable(seed, {tableNo});
 *   PBSim.shoot(s, dx, dy, power, spin);   // dx,dy unit; power 0..1; spin {x,y} -1..1
 *   PBSim.update(s, dt);                   // dt seconds (game clamps to 0.1)
 *   var evts = PBSim.drain(s);              // events for the UI/juice layer
 *   PBSim.aimFromPull(ax, ay, cx, cy);      // pull gesture -> {dx,dy,power,dist}
 */
'use strict';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

var PBSim = (function () {
  var C = (typeof PBC !== 'undefined') ? PBC : null;
  function cfg() { if (!C) throw new Error('PBC config required'); return C; }

  /* Pull gesture -> shot. Grab-anywhere: the vector is measured from the
   * anchor point, NOT from the cue ball, so rail-adjacent cue balls always
   * have pull room. Direction = anchor - current (slingshot). */
  function aimFromPull(ax, ay, cx, cy) {
    var dx = ax - cx, dy = ay - cy;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-6) return null;
    return { dx: dx / d, dy: dy / d, power: Math.min(d / cfg().MAX_PULL, 1), dist: d };
  }

  function dailySeed(dateStr) { return hashStr('poolball|' + dateStr); }
  function tableSeed(n) { return hashStr('poolball-table-' + n); }

  function pocketDefs() {
    var c = cfg(), p = c.PLAY;
    return [
      { x: p.x - 4,         y: p.y - 4,         r: c.POCKET_CORNER_R, mult: 1, corner: true  },
      { x: p.x + p.w / 2,   y: p.y - 9,         r: c.POCKET_SIDE_R,   mult: 2, corner: false },
      { x: p.x + p.w + 4,   y: p.y - 4,         r: c.POCKET_CORNER_R, mult: 1, corner: true  },
      { x: p.x - 4,         y: p.y + p.h + 4,   r: c.POCKET_CORNER_R, mult: 1, corner: true  },
      { x: p.x + p.w / 2,   y: p.y + p.h + 9,   r: c.POCKET_SIDE_R,   mult: 2, corner: false },
      { x: p.x + p.w + 4,   y: p.y + p.h + 4,   r: c.POCKET_CORNER_R, mult: 1, corner: true  },
    ];
  }

  function createTable(seed, opts) {
    var c = cfg();
    opts = opts || {};
    var rng = mulberry32(seed >>> 0);
    var s = {
      seed: seed >>> 0, time: 0, phase: 'aim',
      balls: [], events: [], pockets: pocketDefs(),
      shots: 0, tableNo: opts.tableNo || 1,
      cueCushion: false, cueTravel: 0, firstContact: false,
      pottedThisShot: 0, scratchPending: false, eightEarlyPending: false,
      eightPocket: -1,
    };
    var p = c.PLAY, R = c.BALL_R;
    var placed = [];
    function clear(x, y) {
      if (x < p.x + 2 * R || x > p.x + p.w - 2 * R ||
          y < p.y + 2 * R || y > p.y + p.h - 2 * R) return false;
      var i, dx, dy, d2;
      for (i = 0; i < placed.length; i++) {
        dx = x - placed[i].x; dy = y - placed[i].y; d2 = dx * dx + dy * dy;
        if (d2 < (2.6 * R) * (2.6 * R)) return false;
      }
      for (i = 0; i < s.pockets.length; i++) {
        dx = x - s.pockets[i].x; dy = y - s.pockets[i].y; d2 = dx * dx + dy * dy;
        if (d2 < (3.2 * R) * (3.2 * R)) return false;
      }
      return true;
    }
    var cue = { id: 0, num: 0, x: p.x + p.w * 0.25, y: p.y + p.h / 2,
                vx: 0, vy: 0, sx: 0, sy: 0, active: true, sinking: 0, sinkX: 0, sinkY: 0 };
    s.balls.push(cue); placed.push(cue);
    var nums = [1, 2, 3, 4, 5, 6, 7, 8], i, j, t;
    for (i = nums.length - 1; i > 0; i--) { j = Math.floor(rng() * (i + 1)); t = nums[i]; nums[i] = nums[j]; nums[j] = t; }
    for (i = 0; i < nums.length; i++) {
      var x = 0, y = 0, tries = 0;
      do {
        x = p.x + 2 * R + rng() * (p.w - 4 * R);
        y = p.y + 2 * R + rng() * (p.h - 4 * R);
        tries++;
      } while (!clear(x, y) && tries < 600);
      var b = { id: i + 1, num: nums[i], x: x, y: y,
                vx: 0, vy: 0, sx: 0, sy: 0, active: true, sinking: 0, sinkX: 0, sinkY: 0 };
      s.balls.push(b); placed.push(b);
    }
    return s;
  }

  function emit(s, e) { s.events.push(e); }

  function shoot(s, dx, dy, power, spin) {
    if (s.phase !== 'aim') return false;
    var c = cfg();
    var cue = s.balls[0];
    if (!cue.active) return false;
    var v = c.SHOT_MIN_V + Math.max(0, Math.min(1, power)) * (c.SHOT_MAX_V - c.SHOT_MIN_V);
    cue.vx = dx * v; cue.vy = dy * v;
    cue.sx = spin ? Math.max(-1, Math.min(1, spin.x)) : 0;
    cue.sy = spin ? Math.max(-1, Math.min(1, spin.y)) : 0;
    s.phase = 'rolling'; s.shots++;
    s.cueCushion = false; s.cueTravel = 0; s.firstContact = false;
    s.pottedThisShot = 0; s.scratchPending = false; s.eightEarlyPending = false;
    s.eightPocket = -1;
    emit(s, { k: 'strike', power: power });
    return true;
  }

  function onContact(s, a, b, nx, ny, pvx, pvy) {
    var cue = (a.id === 0) ? a : (b.id === 0 ? b : null);
    if (cue && !s.firstContact) {
      s.firstContact = true;
      // follow/draw: topspin kicks the cue ball along its travel dir, backspin pulls it back
      var k = cue.sy * cfg().SPIN_FOLLOW_V;
      var sp = Math.sqrt(pvx * pvx + pvy * pvy);
      if (sp > 1e-6) { cue.vx += (pvx / sp) * k; cue.vy += (pvy / sp) * k; }
    }
  }

  function collideBalls(s) {
    var c = cfg(), bs = s.balls, R = c.BALL_R, min = 2 * R;
    for (var iter = 0; iter < 2; iter++) {
      for (var i = 0; i < bs.length; i++) {
        var a = bs[i];
        if (!a.active || a.sinking > 0) continue;
        for (var j = i + 1; j < bs.length; j++) {
          var b = bs[j];
          if (!b.active || b.sinking > 0) continue;
          var dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
          if (d2 > 1e-9 && d2 < min * min) {
            var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
            var ov = (min - d) / 2;
            a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
            var pvx = (a.id === 0 ? a.vx : (b.id === 0 ? b.vx : 0));
            var pvy = (a.id === 0 ? a.vy : (b.id === 0 ? b.vy : 0));
            var rvx = b.vx - a.vx, rvy = b.vy - a.vy, vn = rvx * nx + rvy * ny;
            if (vn < 0) {
              var imp = -(1 + c.BALL_E) * vn / 2;
              a.vx -= imp * nx; a.vy -= imp * ny;
              b.vx += imp * nx; b.vy += imp * ny;
              onContact(s, a, b, nx, ny, pvx, pvy);
            }
          }
        }
      }
    }
  }

  /* Pocket mouths interrupt the cushions: a ball inside the mouth zone that is
   * moving toward the pocket (or nearly stopped) is let through so the pocket
   * logic can capture it. Balls moving along/past the pocket keep cushions. */
  function inPocketMouth(s, b) {
    var c = cfg();
    var sp2 = b.vx * b.vx + b.vy * b.vy;
    for (var i = 0; i < s.pockets.length; i++) {
      var pk = s.pockets[i];
      var dx = pk.x - b.x, dy = pk.y - b.y;
      var mz = pk.r + 2 * c.BALL_R;
      if (dx * dx + dy * dy < mz * mz) {
        if (sp2 < 1) return true;
        if (b.vx * dx + b.vy * dy > 0) return true;
      }
    }
    return false;
  }

  function cushions(s) {
    var c = cfg(), p = c.PLAY, R = c.BALL_R;
    for (var i = 0; i < s.balls.length; i++) {
      var b = s.balls[i];
      if (!b.active || b.sinking > 0) continue;
      if (inPocketMouth(s, b)) continue; // pocket mouths interrupt the cushions
      var e = c.CUSHION_E + (b.id === 0 ? b.sy * c.SPIN_RAIL_N : 0);
      if (e < 0.3) e = 0.3; if (e > 0.95) e = 0.95;
      var touched = false;
      if (b.x < p.x + R) { b.x = p.x + R; b.vx = -b.vx * e; b.vy *= c.CUSHION_KEEP; touched = true; }
      else if (b.x > p.x + p.w - R) { b.x = p.x + p.w - R; b.vx = -b.vx * e; b.vy *= c.CUSHION_KEEP; touched = true; }
      if (b.y < p.y + R) { b.y = p.y + R; b.vy = -b.vy * e; b.vx *= c.CUSHION_KEEP; touched = true; }
      else if (b.y > p.y + p.h - R) { b.y = p.y + p.h - R; b.vy = -b.vy * e; b.vx *= c.CUSHION_KEEP; touched = true; }
      if (touched) {
        if (b.id === 0) {
          // sidespin english off the rail: kick the tangential component
          if (b.x === p.x + R || b.x === p.x + p.w - R) b.vy += b.sx * c.SPIN_RAIL;
          else b.vx += b.sx * c.SPIN_RAIL;
          if (!s.firstContact) s.cueCushion = true;
        }
        emit(s, { k: 'cushion', id: b.id, v: Math.sqrt(b.vx * b.vx + b.vy * b.vy) });
      }
    }
  }

  function pockets(s, h) {
    var c = cfg();
    for (var i = 0; i < s.balls.length; i++) {
      var b = s.balls[i];
      if (!b.active) continue;
      if (b.sinking > 0) {
        b.sinking -= h;
        var t = Math.max(0, b.sinking / c.SINK_T);
        b.x += (b.sinkX - b.x) * (1 - t * 0.5) * 0.35;
        b.y += (b.sinkY - b.y) * (1 - t * 0.5) * 0.35;
        b.vx = 0; b.vy = 0;
        if (b.sinking <= 0) {
          b.active = false;
          potComplete(s, b);
        }
        continue;
      }
      for (var j = 0; j < s.pockets.length; j++) {
        var pk = s.pockets[j];
        var dx = pk.x - b.x, dy = pk.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < pk.r * pk.r) {
          b.sinking = c.SINK_T; b.sinkX = pk.x; b.sinkY = pk.y; b.sinkPocket = j;
          emit(s, { k: 'capture', id: b.id, pocket: j });
          break;
        } else if (d2 < c.POCKET_SUCK_R * c.POCKET_SUCK_R) {
          var d = Math.sqrt(d2) || 1;
          var a = c.POCKET_SUCK_A * (1 - d / c.POCKET_SUCK_R);
          b.vx += (dx / d) * a * h; b.vy += (dy / d) * a * h;
        }
      }
    }
  }

  function potComplete(s, b) {
    if (b.id === 0) { s.scratchPending = true; emit(s, { k: 'scratch' }); return; }
    s.pottedThisShot++;
    if (b.num === 8) {
      var othersLeft = false;
      for (var i = 1; i < s.balls.length; i++) {
        if (s.balls[i].active && s.balls[i].num !== 8) { othersLeft = true; break; }
      }
      if (othersLeft) { s.eightEarlyPending = true; s.eightPocket = b.sinkPocket; emit(s, { k: 'eightEarly' }); return; }
    }
    emit(s, {
      k: 'pot', id: b.id, num: b.num, pocket: b.sinkPocket,
      mult: s.pockets[b.sinkPocket].mult,
      bank: s.firstContact && s.cueCushion,
      long: s.firstContact && s.cueTravel > cfg().LONG_DIST,
      count: s.pottedThisShot,
    });
  }

  function roll(s, h) {
    var c = cfg();
    for (var i = 0; i < s.balls.length; i++) {
      var b = s.balls[i];
      if (!b.active || b.sinking > 0) continue;
      var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (sp > 0) {
        if (b.sx !== 0 || b.sy !== 0) {
          var ux = b.vx / sp, uy = b.vy / sp;
          b.vx += (ux * b.sy * c.SPIN_ROLL_F + -uy * b.sx * c.SPIN_ROLL_S) * h;
          b.vy += (uy * b.sy * c.SPIN_ROLL_F + ux * b.sx * c.SPIN_ROLL_S) * h;
          var dk = Math.exp(-c.SPIN_DECAY * h);
          b.sx *= dk; b.sy *= dk;
        }
        var ns = sp * Math.exp(-c.FRICTION * h) - c.FRICTION_LIN * h;
        if (ns < c.STOP_V) ns = 0;
        b.vx *= ns / sp; b.vy *= ns / sp;
        b.x += b.vx * h; b.y += b.vy * h;
        if (b.id === 0 && !s.firstContact) s.cueTravel += sp * h;
      }
    }
  }

  function substep(s, h) {
    roll(s, h);
    collideBalls(s);
    cushions(s);
    pockets(s, h);
  }

  function freeSpotNear(s, x, y) {
    var c = cfg(), p = c.PLAY, R = c.BALL_R;
    if (spotFree(s, x, y)) return { x: x, y: y };
    for (var r = 2.5 * R; r < p.w / 2; r += 2 * R) {
      for (var a = 0; a < 12; a++) {
        var ang = (a / 12) * Math.PI * 2;
        var nx = x + Math.cos(ang) * r, ny = y + Math.sin(ang) * r;
        if (spotFree(s, nx, ny)) return { x: nx, y: ny };
      }
    }
    return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
  }
  function spotFree(s, x, y) {
    var c = cfg(), p = c.PLAY, R = c.BALL_R;
    if (x < p.x + R || x > p.x + p.w - R || y < p.y + R || y > p.y + p.h - R) return false;
    for (var i = 0; i < s.balls.length; i++) {
      var b = s.balls[i];
      if (!b.active) continue;
      var dx = x - b.x, dy = y - b.y;
      if (dx * dx + dy * dy < (2.2 * R) * (2.2 * R)) return false;
    }
    return true;
  }

  function endShot(s) {
    var c = cfg(), p = c.PLAY;
    if (s.scratchPending) {
      var cue = s.balls[0];
      var spot = freeSpotNear(s, p.x + p.w * 0.25, p.y + p.h / 2);
      cue.x = spot.x; cue.y = spot.y; cue.vx = 0; cue.vy = 0;
      cue.sx = 0; cue.sy = 0; cue.active = true;
      s.scratchPending = false;
      emit(s, { k: 'respot', id: 0 });
    }
    if (s.eightEarlyPending) {
      var eight = null, i;
      for (i = 1; i < s.balls.length; i++) if (s.balls[i].num === 8) eight = s.balls[i];
      if (eight) {
        var fs = freeSpotNear(s, p.x + p.w * 0.75, p.y + p.h / 2);
        eight.x = fs.x; eight.y = fs.y; eight.vx = 0; eight.vy = 0;
        eight.active = true;
        emit(s, { k: 'eightRespot' });
      }
      s.eightEarlyPending = false;
    }
    var left = 0;
    for (var j = 1; j < s.balls.length; j++) if (s.balls[j].active) left++;
    s.phase = 'aim';
    emit(s, { k: 'settle', shots: s.shots, left: left });
    if (left === 0) emit(s, { k: 'clear', shots: s.shots });
  }

  function update(s, dt) {
    if (dt <= 0 || s.phase === 'aim') { s.time += Math.max(0, dt); return; }
    var c = cfg();
    var n = Math.max(1, Math.min(24, Math.ceil(dt / c.SUBSTEP)));
    var h = dt / n;
    for (var i = 0; i < n; i++) substep(s, h);
    s.time += dt;
    var moving = false;
    for (var j = 0; j < s.balls.length; j++) {
      var b = s.balls[j];
      if (!b.active) continue;
      if (b.sinking > 0 || b.vx !== 0 || b.vy !== 0) { moving = true; break; }
    }
    if (!moving) endShot(s);
  }

  function drain(s) { var e = s.events; s.events = []; return e; }

  return {
    createTable: createTable,
    shoot: shoot,
    update: update,
    drain: drain,
    aimFromPull: aimFromPull,
    dailySeed: dailySeed,
    tableSeed: tableSeed,
    mulberry32: mulberry32,
    hashStr: hashStr,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PBSim: PBSim, mulberry32: mulberry32, hashStr: hashStr };
}
