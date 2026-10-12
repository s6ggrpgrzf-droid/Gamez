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
    foldLiftMul: 0.25,  // bound: wings folded tight -> near-ballistic arc
    foldDragMul: 0.55,
    foldRegen: 0.16,    // energy/s earned back during a fold
    groundClear: 1.2, // meters above terrain
    maxSink: -16,     // hard bound on vy (safety, never hit in practice)
  };

  // Wingbeat rig constants (from the sparrow kinematics spec). Exposed so
  // tests can pin the anti-floating-plane invariants: downstroke fraction
  // and the twist phase-lead.
  var WING = {
    freq: 13,        // Hz wingbeat, cruise (sparrow ~12-15)
    freqClimb: 14.5, // Hz under load
    downFrac: 0.58,  // downstroke fraction of cycle (55-60% power stroke)
    twistLead: 0.12, // twist phase-LEADS elevation by ~12% of cycle
  };

  function newBird(x, y, z, heading, seed) {
    var h = heading || 0;
    var cruise = 11;
    return {
      px: x, py: y, pz: z,
      vx: Math.sin(h) * cruise, vy: 0, vz: Math.cos(h) * cruise,
      heading: h, pitch: 0, bank: 0,
      energy: 1, flapPhase: 0, flapping: false,
      stalled: false, braking: false, speed: cruise,
      dist: 0, // meters flown (odometer for HUD/records)
      // --- bounding-gait state (passerine signature) + rig channels ---
      gait: 'glide',   // 'burst' | 'fold' | 'glide'
      gaitT: 0,        // seconds in current gait phase
      beatsLeft: 0, beatsDone: 0, foldDur: 0.15,
      wingPhase: 0,    // 0-1 position in wingbeat cycle (0 = top, downstroke first)
      twistPhase: 0.12,// wingPhase + WING.twistLead (the anti-floating-plane channel)
      foldAmount: 0,   // 0 extended -> 1 folded tight to body
      downstrokeTick: 0, // increments at every downstroke start (audio/effects hook)
      tailSpread: 5, tailPitch: 8, tailTwist: 0, // degrees; tail is a control surface
      bodyPitchOsc: 0, // radians, synchronous with wingbeat
      aoaHi: 0,        // 0 cruise -> 1 high angle of attack (drives feather slotting)
      slotAmt: 0,      // smoothed aoaHi for the rig
      lastSteerX: 0,
      rng: mulberry32((seed === undefined ? 20261012 : seed) >>> 0),
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

    // --- bounding gait: flap bursts <-> folded bounds (the passerine signature).
    // Holding flap does NOT flap continuously: 3-8 power beats, then wings
    // fold tight for a near-ballistic arc, then burst again. Burst length and
    // fold duration modulate with climb/cruise/descent. ---
    airspeed();
    var flapScale = clamp(1 - (spd - 12) / 8, 0, 1); // fixed muscle power: no runaway
    var wantFlap = !!(flapIn && s.energy > 0.02 && flapScale > 0.01);
    var climbing = s.vy > 1.5 || steerY > 0.4;
    var descending = s.vy < -1.5;
    function burstBeats() {
      var r = s.rng;
      if (climbing) return 6 + Math.floor(r() * 3);   // 6-8 beats, power climb
      if (descending) return 3 + Math.floor(r() * 2);  // 3-4 beats
      return 4 + Math.floor(r() * 3);                 // 4-6 beats, cruise
    }
    function newFoldDur() {
      var r = s.rng;
      if (climbing) return 0.05 + r() * 0.07;
      if (descending) return 0.20 + r() * 0.15;
      return 0.12 + r() * 0.13;
    }
    if (wantFlap) {
      if (s.gait !== 'burst' && s.gait !== 'fold') {
        s.gait = 'burst'; s.beatsDone = 0; s.beatsLeft = burstBeats(); s.gaitT = 0;
      }
      s.gaitT += dt;
      if (s.gait === 'burst') {
        var freq = climbing ? WING.freqClimb : WING.freq;
        var prev = s.wingPhase;
        s.wingPhase = (s.wingPhase + dt * freq) % 1;
        if (s.wingPhase < prev) { // wrapped: beat complete, new downstroke starts
          s.downstrokeTick++;
          s.beatsDone++;
          if (s.beatsDone >= s.beatsLeft) {
            s.gait = 'fold'; s.gaitT = 0; s.foldDur = newFoldDur();
          }
        }
        // muscle work during the burst (inertial, authority fades with speed)
        var cp0 = Math.cos(s.pitch);
        s.vx += Math.sin(s.heading) * cp0 * TUNE.flapThrust * flapScale * dt;
        s.vz += Math.cos(s.heading) * cp0 * TUNE.flapThrust * flapScale * dt;
        s.vy += TUNE.flapLift * flapScale * dt;
        s.energy -= TUNE.flapDrain * dt;
        s.foldAmount += (0 - s.foldAmount) * Math.min(1, 12 * dt);
      } else { // fold: ballistic, wings tight to the body
        s.energy += TUNE.foldRegen * dt;
        var fi = Math.min(1, s.gaitT / 0.06);
        var fo = Math.min(1, Math.max(0, (s.foldDur - s.gaitT) / 0.06));
        s.foldAmount = Math.min(fi, fo);
        if (s.gaitT >= s.foldDur) {
          s.gait = 'burst'; s.gaitT = 0; s.beatsDone = 0; s.beatsLeft = burstBeats();
        }
      }
    } else {
      s.gait = 'glide';
      s.foldAmount += (0 - s.foldAmount) * Math.min(1, 12 * dt);
      s.energy += (s.vy < -3 ? TUNE.regenDive : TUNE.regenGlide) * dt;
    }
    s.energy = clamp(s.energy, 0, 1);
    s.flapping = (s.gait === 'burst');
    s.flapPhase = s.wingPhase * Math.PI * 2; // legacy compat
    s.twistPhase = (s.wingPhase + WING.twistLead) % 1;

    // --- gravity (inertial) ---
    s.vy -= TUNE.gravity * dt;

    // --- wing lift, perpendicular to AIRSPEED (in the a/up plane).
    // In level flight this points straight up; in a dive it fades away, so
    // dives genuinely accelerate. Below stallSpeed it collapses
    // progressively -> mush, not cliff. ---
    airspeed();
    var liftMul = brake ? TUNE.brakeLiftMul : (s.gait === 'fold' ? TUNE.foldLiftMul : 1);
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
    var dragMul = brake ? TUNE.brakeDragMul : (s.gait === 'fold' ? TUNE.foldDragMul : 1);
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
    s.lastSteerX = steerX;

    // --- rig channels: tail control surface, head-stabilizer + AoA targets ---
    // (smoothed here so the rig never sees a step; the rig itself is dumb)
    var slowF = clamp((9 - spd) / 6, 0, 1);
    s.aoaHi = clamp(slowF + (s.stalled ? 0.4 : 0) + (brake ? 0.5 : 0), 0, 1);
    s.slotAmt += (s.aoaHi - s.slotAmt) * Math.min(1, 8 * dt);
    var tsT = 5 + s.aoaHi * 45 + (brake ? 55 : 0) + (s.inThermal ? 12 : 0);
    if (tsT > 150) tsT = 150;
    s.tailSpread += (tsT - s.tailSpread) * Math.min(1, 6 * dt);
    var tpT = 8 + s.aoaHi * 35 + (brake ? 20 : 0);
    s.tailPitch += (tpT - s.tailPitch) * Math.min(1, 6 * dt);
    var ttT = clamp(-steerX * 60, -60, 60) * authority;
    s.tailTwist += (ttT - s.tailTwist) * Math.min(1, 8 * dt);
    var oscT = (s.gait === 'burst')
      ? Math.sin(s.wingPhase * Math.PI * 2 - 0.7) * 0.055 * (climbing ? 1 : 0.7)
      : 0;
    s.bodyPitchOsc += (oscT - s.bodyPitchOsc) * Math.min(1, 10 * dt);

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
    WING: WING,
    newBird: newBird,
    stepBird: stepBird,
    demoEnv: demoEnv,
  };
});
