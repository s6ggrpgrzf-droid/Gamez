'use strict';
/* flight.js — PURE sparrow flight sim. No DOM, no canvas, no requestAnimationFrame.
 * Seeded mulberry32 PRNG (never bare Math.random). Headless-testable in node:
 *   const F = require('./flight.js'); F.stepBird(F.newBird(0,60,0,0), {flap:1,steerX:0,steerY:0}, 1/60, F.demoEnv());
 *
 * Model (arcade-realistic, meter scale, sparrow):
 *  - flap: thrust along the nose + upward lift, drains energy
 *  - glide: wing lift ~ v^2 counters gravity; drag bleeds speed
 *  - dive (pitch down / brake-tuck): gravity accelerates you, drag caps terminal speed
 *  - stall: below stallSpeed lift collapses progressively -> mushy sink, soft controls.
 *    NEVER a cliff: sink rate is bounded by drag, recovery is pitch-down.
 *  - bank: steerX rolls the bird; heading turns proportional to bank & speed authority
 *  - velocity eases toward the nose direction (carve feel), pitch input aims the nose
 *  - thermals: vertical lift columns in env; wind advects position
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  else { root.FLIGHT = api; }
})(typeof self !== 'undefined' ? self : this, function () {

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  var TUNE = {
    step: 1 / 60,
    gravity: 9.8,
    liftK: 0.085,     // wing lift accel = liftK * speed^2 (straight up), pre-stall-factor
    dragK: 0.0105,    // parasitic drag accel = dragK * speed^2
    stallDragK: 0.06, // extra drag accel per (m/s below stallSpeed) when stalled -> bounds sink
    stallSpeed: 6.0,  // m/s; below this lift fades with (v/stall)^1.6
    flapThrust: 8.5,  // m/s^2 along nose while flapping
    flapLift: 15.0,   // m/s^2 straight up while flapping
    flapDrain: 0.30,  // energy units per second while flapping
    regenGlide: 0.10, // energy/s while not flapping
    regenDive: 0.24,  // energy/s while descending fast (earned rest)
    turnRate: 1.7,    // rad/s at full steerX with full authority
    pitchRate: 2.4,   // rad/s toward pitch target
    maxPitch: 0.65,   // rad of nose up/down from steerY
    alignRate: 3.2,   // 1/s — velocity direction eases toward nose
    brakeDragMul: 0.6, // tuck (folded wings): less drag AND less lift -> dives faster
    brakeLiftMul: 0.5,
    groundClear: 1.2, // meters above terrain
    maxSink: -16,     // hard bound on vy (safety, never hit in practice)
  };

  function newBird(x, y, z, heading) {
    var h = heading || 0;
    var cruise = 11;
    return {
      px: x, py: y, pz: z,
      vx: Math.sin(h) * cruise, vy: 0, vz: Math.cos(h) * cruise,
      heading: h, pitch: 0, bank: 0,
      energy: 1, flapPhase: 0, flapping: false,
      stalled: false, braking: false, speed: cruise,
      dist: 0, // meters flown (odometer for HUD/records)
    };
  }

  // env: { windX, windZ, thermals: [{x,z,r,top,lift}], groundH: function(x,z)->y }
  // NOTE: thermal lift is an AIRMASS vertical velocity (m/s), not an acceleration.
  // Forces below use airspeed (velocity relative to the airmass); gravity and
  // integration use inertial velocity. Soaring a thermal costs no airspeed,
  // exactly like real ridge/thermal lift.
  function stepBird(s, input, dt, env) {
    var flapIn = input.flap ? 1 : 0;
    var steerX = clamp(input.steerX || 0, -1, 1);
    var steerY = clamp(input.steerY || 0, -1, 1);
    var brake = !!input.brake;

    // --- airmass: thermal columns carry the air upward ---
    var airUp = 0;
    if (env && env.thermals) {
      for (var ti = 0; ti < env.thermals.length; ti++) {
        var th = env.thermals[ti];
        if (s.py > th.top) continue;
        var ox = s.px - th.x, oz = s.pz - th.z;
        var d2 = ox * ox + oz * oz;
        if (d2 < th.r * th.r) airUp += th.lift * (1 - Math.sqrt(d2) / th.r);
      }
    }
    s.inThermal = airUp > 0.4;

    // From here on, (ax,ay,az)/spd is the AIRSPEED. Re-derive it after every
    // change to the inertial velocity so lift/drag/stall stay honest.
    var ax, ay, az, spd;
    function airspeed() {
      ax = s.vx; ay = s.vy - airUp; az = s.vz;
      spd = Math.sqrt(ax * ax + ay * ay + az * az);
      if (spd < 0.001) spd = 0.001;
    }

    // --- flap: muscle acts on the bird (inertial). Authority fades with
    // airspeed (fixed muscle power -> no runaway feedback loop). ---
    airspeed();
    var flapScale = clamp(1 - (spd - 12) / 8, 0, 1);
    s.flapping = !!(flapIn && s.energy > 0.02 && flapScale > 0.01);
    if (s.flapping) {
      var cp0 = Math.cos(s.pitch);
      s.vx += Math.sin(s.heading) * cp0 * TUNE.flapThrust * flapScale * dt;
      s.vz += Math.cos(s.heading) * cp0 * TUNE.flapThrust * flapScale * dt;
      s.vy += TUNE.flapLift * flapScale * dt;
      s.energy -= TUNE.flapDrain * dt;
      s.flapPhase += dt * 11; // ~11 Hz sparrow wingbeat
    } else {
      s.energy += (s.vy < -3 ? TUNE.regenDive : TUNE.regenGlide) * dt;
    }
    s.energy = clamp(s.energy, 0, 1);

    // --- gravity (inertial) ---
    s.vy -= TUNE.gravity * dt;

    // --- wing lift, perpendicular to AIRSPEED (in the a/up plane).
    // In level flight this points straight up; in a dive it fades away, so
    // dives genuinely accelerate. Below stallSpeed it collapses
    // progressively -> mush, not cliff. ---
    airspeed();
    var liftMul = brake ? TUNE.brakeLiftMul : 1;
    var stallF = spd < TUNE.stallSpeed ? Math.pow(spd / TUNE.stallSpeed, 1.6) : 1;
    s.stalled = spd < TUNE.stallSpeed;
    var liftA = TUNE.liftK * spd * spd * stallF * liftMul;
    var iv = 1 / spd;
    var vdx = ax * iv, vdy = ay * iv, vdz = az * iv;
    // liftDir = normalize(up - ahat*(ahat.up))
    var ldx = -vdx * vdy, ldy = 1 - vdy * vdy, ldz = -vdz * vdy;
    var ldl = Math.sqrt(ldx * ldx + ldy * ldy + ldz * ldz);
    if (ldl > 1e-4 && liftA > 0) {
      var lk = (liftA / ldl) * dt;
      s.vx += ldx * lk; s.vy += ldy * lk; s.vz += ldz * lk;
    }

    // --- drag opposes airspeed (parasitic + stall mush drag bounding sink) ---
    airspeed();
    var dragMul = brake ? TUNE.brakeDragMul : 1;
    var dragA = TUNE.dragK * dragMul * spd * spd;
    if (s.stalled) dragA += TUNE.stallDragK * (TUNE.stallSpeed - spd) * spd;
    var dec = (dragA / spd) * dt;
    if (dec > 0.9) dec = 0.9;
    ax -= ax * dec; ay -= ay * dec; az -= az * dec;
    s.vx = ax; s.vy = ay + airUp; s.vz = az;
    if (s.vy < TUNE.maxSink) s.vy = TUNE.maxSink;

    // --- pitch: input aims the nose; airspeed carves toward it ---
    var pT = steerY * TUNE.maxPitch;
    var dp = clamp(pT - s.pitch, -TUNE.pitchRate * dt, TUNE.pitchRate * dt);
    s.pitch += dp;

    airspeed();
    var k = 1 - Math.exp(-TUNE.alignRate * dt);
    var inv = 1 / spd;
    var dx = ax * inv, dy = ay * inv, dz = az * inv;
    var cph = Math.cos(s.pitch);
    var tx = Math.sin(s.heading) * cph, ty = Math.sin(s.pitch), tz = Math.cos(s.heading) * cph;
    dx += (tx - dx) * k; dy += (ty - dy) * k; dz += (tz - dz) * k;
    var dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    s.vx = (dx / dl) * spd; s.vy = (dy / dl) * spd + airUp; s.vz = (dz / dl) * spd;

    // --- bank & turn: authority fades when slow/stalled, never zero ---
    var authority = clamp(spd / 8, 0.35, 1) * (s.stalled ? 0.55 : 1);
    s.heading += steerX * TUNE.turnRate * authority * dt;
    var bankT = -steerX * 0.85 * authority;
    s.bank += (bankT - s.bank) * Math.min(1, 6 * dt);
    s.braking = brake;

    // --- integrate (wind advects; thermal airUp rides along inside s.vy) ---
    var wx = (env && env.windX) || 0, wz = (env && env.windZ) || 0;
    var step = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz) * dt;
    s.px += (s.vx + wx) * dt;
    s.py += s.vy * dt;
    s.pz += (s.vz + wz) * dt;
    s.dist += step;

    // --- ground: soft floor, never crash ---
    var gh = env && env.groundH ? env.groundH(s.px, s.pz) : 0;
    var floor = gh + TUNE.groundClear;
    if (s.py < floor) {
      s.py = floor;
      if (s.vy < 0) s.vy = 0;
      s.vx *= (1 - Math.min(1, 2 * dt)); s.vz *= (1 - Math.min(1, 2 * dt));
    }

    s.speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
    return s;
  }

  // A flat, empty environment for unit tests.
  function demoEnv() {
    return { windX: 0, windZ: 0, thermals: [], groundH: function () { return 0; } };
  }

  return {
    mulberry32: mulberry32,
    TUNE: TUNE,
    newBird: newBird,
    stepBird: stepBird,
    demoEnv: demoEnv,
  };
});
