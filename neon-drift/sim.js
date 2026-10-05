/* Neon Drift — pure racing simulation.
 *
 * Zero DOM, no Math.random (mulberry32 only), fixed 1/60 s timestep.
 * Deterministic: same seed + same inputs = same race (ghosts!).
 * Loads as a plain script, exposes everything on the global ND object. */

(function () {
  'use strict';

  var ND = {};

  ND.DT = 1 / 60;
  var TAU = Math.PI * 2;

  /* ---------------- seeded RNG ---------------- */

  ND.mulberry32 = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // FNV-1a 32-bit hash of 'YYYY-MM-DD'. Same date worldwide -> same seed.
  ND.dailySeed = function (dateStr) {
    var h = 0x811c9dc5;
    for (var i = 0; i < dateStr.length; i++) {
      h ^= dateStr.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };

  function wrapAngle(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }
  ND.wrapAngle = wrapAngle;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  ND.clamp = clamp;

  /* ---------------- themes & tracks ---------------- */

  ND.THEMES = ['neon', 'coast', 'desert', 'snow'];
  ND.THEME_NAMES = { neon: 'Neon City', coast: 'Salt Coast', desert: 'Dust Bowl', snow: 'Whiteout Pass' };

  // 12 tracks: cup 0..3 x race 0..2. Deterministic seed per slot.
  ND.trackSeed = function (cup, race) {
    return (0x51ab3f29 ^ Math.imul(cup * 3 + race + 1, 2654435761)) >>> 0;
  };
  ND.themeForCup = function (cup) { return ND.THEMES[cup % 4]; };

  // Daily: same date -> same track worldwide.
  ND.dailyTrack = function (dateStr) {
    var s = ND.dailySeed(dateStr);
    var idx = s % 12;
    return { cup: (idx / 3) | 0, race: idx % 3, seed: s };
  };

  // Catmull-Rom closed spline through control points -> dense samples.
  function catmullClosed(cps, per) {
    var n = cps.length, out = [];
    for (var i = 0; i < n; i++) {
      var p0 = cps[(i - 1 + n) % n], p1 = cps[i],
          p2 = cps[(i + 1) % n], p3 = cps[(i + 2) % n];
      for (var j = 0; j < per; j++) {
        var t = j / per, t2 = t * t, t3 = t2 * t;
        out.push({
          x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t +
              (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
              (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t +
              (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
              (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
        });
      }
    }
    return out;
  }

  // Resample a polyline to N equidistant points.
  function resample(pts, N) {
    var cum = [0], i;
    for (i = 1; i <= pts.length; i++) {
      var a = pts[i - 1], b = pts[i % pts.length];
      cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    var total = cum[pts.length], out = [], seg = 1;
    for (i = 0; i < N; i++) {
      var d = (i / N) * total;
      while (seg < pts.length && cum[seg] < d) seg++;
      var a2 = pts[seg - 1], b2 = pts[seg % pts.length];
      var l = cum[seg] - cum[seg - 1] || 1;
      var t = (d - cum[seg - 1]) / l;
      out.push({ x: a2.x + (b2.x - a2.x) * t, y: a2.y + (b2.y - a2.y) * t });
    }
    return { pts: out, length: total };
  }

  // Generate a track. Retries with bumped seeds until no corner is tighter
  // than minRadius (no impossible hairpins). Deterministic.
  ND.genTrack = function (seed, opts) {
    opts = opts || {};
    var width = opts.width || 26;
    var theme = opts.theme || 'neon';
    var N = 360;
    var minRadius = opts.minRadius || 28;
    var attempt = 0, track = null, best = null;
    while (attempt < 40) {
      track = ND._genTrackOnce((seed + attempt * 7919) >>> 0, width, theme, N, opts);
      if (!best || track.maxCurv < best.maxCurv) best = track;
      if (track.maxCurv <= 1 / minRadius) break;
      attempt++;
    }
    track.attempts = attempt;
    track.bestOf = best === track;
    return track;
  };

  ND._genTrackOnce = function (seed, width, theme, N, opts) {
    var rng = ND.mulberry32(seed);
    var twitch = opts.twitch == null ? 1 : opts.twitch; // corner density
    var n = 10 + ((rng() * 4) | 0);
    var R0 = 205 + rng() * 45;
    var cps = [], i;
    for (i = 0; i < n; i++) {
      var a = (i / n) * TAU + (rng() - 0.5) * 0.22 * twitch;
      var r = R0 * (0.76 + rng() * 0.48);
      // occasional tighter complex: pull one point inward (gentle — the
      // retry loop rejects anything that ends up genuinely impossible)
      if (rng() < 0.16 * twitch) r *= 0.74 + rng() * 0.12;
      cps.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    var dense = catmullClosed(cps, 14);
    var rs = resample(dense, N);
    var pts = rs.pts, length = rs.length, ds = length / N;
    // tangents + curvature
    var tx = [], ty = [], curv = [];
    for (i = 0; i < N; i++) {
      var p = pts[i], q = pts[(i + 1) % N];
      var dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1;
      tx.push(dx / l); ty.push(dy / l);
    }
    for (i = 0; i < N; i++) {
      var a1 = Math.atan2(ty[(i - 1 + N) % N], tx[(i - 1 + N) % N]);
      var a2 = Math.atan2(ty[(i + 1) % N], tx[(i + 1) % N]);
      curv.push(Math.abs(wrapAngle(a2 - a1)) / (2 * ds));
    }
    // light smoothing of curvature for AI braking; the retry loop judges
    // tracks by this smoothed value (single-sample spikes are noise)
    var sm = [], maxCurv = 0;
    for (i = 0; i < N; i++) {
      var s = (curv[(i - 2 + N) % N] + curv[(i - 1 + N) % N] * 2 + curv[i] * 3 +
               curv[(i + 1) % N] * 2 + curv[(i + 2) % N]) / 9;
      sm.push(s);
      if (s > maxCurv) maxCurv = s;
    }
    // start/finish on the straightest sample
    var s0 = 0, best = Infinity;
    for (i = 0; i < N; i++) {
      var score = sm[i] + sm[(i + 4) % N] * 0.5 + sm[(i - 4 + N) % N] * 0.5;
      if (score < best) { best = score; s0 = i; }
    }
    function rot(arr) {
      var o = [];
      for (var k = 0; k < N; k++) o.push(arr[(s0 + k) % N]);
      return o;
    }
    return {
      seed: seed >>> 0, N: N, width: width, theme: theme,
      pts: rot(pts), tx: rot(tx), ty: rot(ty), curv: rot(sm),
      maxCurv: maxCurv, length: length, ds: ds
    };
  };

  // Grid slot -> spawn transform (behind the start line, staggered).
  ND.gridSlot = function (track, slot) {
    var N = track.N;
    var idx = (N - 10 - slot * 5) % N;
    if (idx < 0) idx += N;
    var side = (slot % 2 === 0 ? 1 : -1) * track.width * 0.22;
    var px = track.pts[idx].x, py = track.pts[idx].y;
    var nx = -track.ty[idx], ny = track.tx[idx]; // left normal
    return {
      x: px + nx * side, y: py + ny * side,
      th: Math.atan2(track.ty[idx], track.tx[idx]),
      idx: idx
    };
  };

  /* ---------------- cars ---------------- */

  // Base car archetypes: distinct feel, not just stats.
  ND.CARS = [
    { id: 'grip',     name: 'Aegis',      top: 47, turn: 2.7, grip: 9.0, dlat: 1.4, yaw: 1.45, chg: 0.90,
      blurb: 'Glues itself to the road. Forgiving, not flashy.' },
    { id: 'balanced', name: 'Vector',
      top: 49, turn: 2.9, grip: 6.5, dlat: 1.0, yaw: 1.65, chg: 1.05,
      blurb: 'The all-rounder. Quick if you dare to drift it.' },
    { id: 'drift',    name: 'Sidewinder', top: 48, turn: 3.1, grip: 5.0, dlat: 0.7, yaw: 1.90, chg: 1.30,
      blurb: 'Lives sideways. Huge boosts, demands commitment.' }
  ];

  // applySpec: base archetype + upgrade tiers {engine,tires,drift} -> live spec.
  ND.applyUpgrades = function (base, up) {
    up = up || { engine: 0, tires: 0, drift: 0 };
    return {
      top:  base.top  * (1 + 0.05 * up.engine),
      turn: base.turn,
      grip: base.grip * (1 + 0.10 * up.tires),
      dlat: base.dlat * (1 - 0.08 * up.drift),
      yaw:  base.yaw,
      chg:  base.chg  * (1 + 0.12 * up.drift)
    };
  };

  ND.newCar = function (track, spec, slot) {
    var g = ND.gridSlot(track, slot);
    return {
      spec: spec, slot: slot,
      x: g.x, y: g.y, th: g.th, vx: 0, vy: 0,
      si: g.idx, lap: 0, prog: -track.N,
      drifting: false, wasDrifting: false, started: false,
      charge: 0, tier: 0, boostT: 0, braking: 0,
      finished: false, finishT: 0, lapT: 0, lastLap: 0, bestLap: 0,
      ev: []  // per-step events drained by the renderer: 'boost1..3','wall','lap','finish','pass'
    };
  };

  ND.speedOf = function (car) { return Math.hypot(car.vx, car.vy); };

  // Normalize any input shape into {steer:-1..1, drift:bool, gas:0..1, brake:0..1}.
  // Accepts objects ({steer,drift,gas,brake}), legacy 2-elem tapes [steer,drift],
  // and 4-elem tapes [steer,drift,gas,brake]. Missing gas defaults to 1 (full
  // auto-throttle) so AI drivers, legacy callers, and old tapes behave exactly
  // like the original auto-accelerate game. Idempotent — safe to call twice.
  ND.normInput = function (inp) {
    if (Array.isArray(inp)) {
      return {
        steer: clamp(inp[0] || 0, -1, 1),
        drift: !!inp[1],
        gas: inp.length > 2 && inp[2] != null ? clamp(inp[2], 0, 1) : 1,
        brake: inp.length > 3 ? clamp(inp[3] || 0, 0, 1) : 0
      };
    }
    inp = inp || {};
    return {
      steer: clamp(inp.steer || 0, -1, 1),
      drift: !!inp.drift,
      gas: inp.gas == null ? 1 : clamp(inp.gas, 0, 1),
      brake: inp.brake == null ? 0 : clamp(inp.brake, 0, 1)
    };
  };

  // Advance ONE car by exactly DT. inp = {steer:-1..1, drift:bool, gas:0..1, brake:0..1}.
  ND.stepCar = function (track, car, inp, dt) {
    car.ev.length = 0;
    inp = ND.normInput(inp);
    var spec = car.spec;
    var steer = inp.steer;
    var wantDrift = inp.drift;

    var fx = Math.cos(car.th), fy = Math.sin(car.th);
    var sf = car.vx * fx + car.vy * fy;      // forward speed

    // --- pedals: brake > throttle > coast (boost raises the ceiling) ---
    var ceiling = spec.top * (car.boostT > 0 ? 1.22 : 1);
    if (car.boostT > 0) car.boostT -= dt;
    if (inp.brake > 0) {
      // brake pedal: hard decel, no throttle this tick
      var bd = 62 * inp.brake * dt;
      if (bd > sf) bd = Math.max(0, sf);
      car.vx -= fx * bd; car.vy -= fy * bd;
      sf -= bd;
      car.braking = inp.brake;
    } else if (inp.gas > 0 && sf < ceiling) {
      // throttle: the original tapering auto-accel curve, scaled by pedal
      var ar = 26 * inp.gas * (1 - sf / (ceiling * 1.35));
      if (ar < 6 * inp.gas) ar = 6 * inp.gas;
      var dv = ar * dt;
      if (sf + dv > ceiling) dv = ceiling - sf;
      car.vx += fx * dv; car.vy += fy * dv;
      sf += dv;
      car.braking = 0;
    } else if (inp.gas <= 0 && sf > 0) {
      // coasting (pedal released): gentle engine braking
      var cd = Math.min(sf, 9 * dt);
      car.vx -= fx * cd; car.vy -= fy * cd;
      sf -= cd;
      car.braking = 0;
    } else {
      var pull = (ceiling - sf) * Math.min(1, 1.2 * dt); // soft cap
      car.vx += fx * pull; car.vy += fy * pull;
      sf += pull;
      car.braking = 0;
    }

    // --- steering / yaw ---
    var spdF = clamp(sf / 14, 0.32, 1);
    if (sf > spec.top * 1.04) spdF *= 0.72; // twitchy at insane speed
    var yawRate = steer * spec.turn * (wantDrift ? spec.yaw : 1) * spdF;
    car.th = wrapAngle(car.th + yawRate * dt);

    // tire scrub: hard steering at speed bleeds velocity
    // (this is how you slow for hairpins without a brake pedal)
    var scrub = (!wantDrift ? Math.abs(steer) * 0.55
                            : (Math.abs(steer) * 0.35 + 0.55) * 0.55) * dt;
    if (scrub > 0.9) scrub = 0.9;
    car.vx *= (1 - scrub); car.vy *= (1 - scrub);

    // --- grip: decompose with the NEW heading; lateral velocity decays.
    // Turning while moving throws velocity sideways; grip kills it fast,
    // drifting lets it live — that slide IS the drift. ---
    fx = Math.cos(car.th); fy = Math.sin(car.th);
    var sf2 = car.vx * fx + car.vy * fy;
    var sl2 = -car.vx * fy + car.vy * fx;
    var keep = wantDrift ? spec.dlat : spec.grip;
    sl2 *= Math.exp(-keep * dt);

    // --- drift charge (Mario Kart Tour tiers: blue -> orange -> pink) ---
    car.drifting = wantDrift;
    if (wantDrift && Math.abs(steer) > 0.25 && sf2 > 14 && Math.abs(sl2) > 3.2) {
      car.charge += spec.chg * dt;
    } else {
      car.charge = Math.max(0, car.charge - 2.5 * dt);
    }
    var tier = car.charge >= 1.7 ? 3 : (car.charge >= 1.0 ? 2 : (car.charge >= 0.45 ? 1 : 0));
    car.tier = tier;

    // --- boost on drift release ---
    if (car.wasDrifting && !wantDrift && car.tier > 0) {
      sf2 += 5 + 5 * car.tier;
      car.boostT = 0.5 + 0.35 * car.tier;
      car.ev.push('boost' + car.tier);
    }
    car.wasDrifting = wantDrift;
    if (!wantDrift) car.charge = 0;

    car.vx = fx * sf2 - fy * sl2;
    car.vy = fy * sf2 + fx * sl2;
    car.x += car.vx * dt;
    car.y += car.vy * dt;

    // --- soft barriers: push back inside + scrub speed (no full stops) ---
    ND._nearest(track, car);
    var dx = car.x - track.pts[car.si].x, dy = car.y - track.pts[car.si].y;
    var d = Math.hypot(dx, dy);
    var maxD = track.width / 2 - 2.2;
    if (d > maxD) {
      var px = dx / (d || 1), py = dy / (d || 1);
      car.x = track.pts[car.si].x + px * maxD;
      car.y = track.pts[car.si].y + py * maxD;
      // kill outward velocity, scrub
      var ov = car.vx * px + car.vy * py;
      if (ov > 0) { car.vx -= px * ov * 1.4; car.vy -= py * ov * 1.4; }
      car.vx *= 0.88; car.vy *= 0.88;
      car.ev.push('wall');
    }

    // --- lap / progress ---
    // Cars spawn just behind the line: the first forward crossing STARTS
    // lap 1 (it doesn't complete one). Only later crossings count.
    var prevSi = car._psi == null ? car.si : car._psi;
    car._psi = car.si;
    var N = track.N;
    if (prevSi > N - 24 && car.si < 24 && sf2 > 0) {
      if (car.started) {
        car.lap++;
        car.lastLap = car.lapT; car.lapT = 0;
        if (!car.bestLap || car.lastLap < car.bestLap) car.bestLap = car.lastLap;
        car.ev.push('lap');
      } else {
        car.started = true;
        car.lapT = 0;
      }
    } else if (prevSi < 24 && car.si > N - 24 && sf2 < 0) {
      if (car.lap > 0) car.lap--;
      else car.started = false;
    }
    car.lapT += dt;
    car.prog = car.si + (car.started ? car.lap * N : -N);
  };

  // Windowed nearest-sample search around the car's last known index.
  ND._nearest = function (track, car) {
    var N = track.N, best = car.si, bd = Infinity;
    for (var k = -10; k <= 10; k++) {
      var i = (car.si + k + N) % N;
      var dx = car.x - track.pts[i].x, dy = car.y - track.pts[i].y;
      var d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = i; }
    }
    car.si = best;
  };

  // Car-car collision: circle push-apart, small speed exchange.
  ND.collide = function (a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var d = Math.hypot(dx, dy), minD = 5.2;
    if (d >= minD || d < 0.001) return;
    var nx = dx / d, ny = dy / d, push = (minD - d) / 2;
    a.x -= nx * push; a.y -= ny * push;
    b.x += nx * push; b.y += ny * push;
    var avn = a.vx * nx + a.vy * ny, bvn = b.vx * nx + b.vy * ny;
    var rel = avn - bvn;
    if (rel > 0) {
      var imp = rel * 0.5;
      a.vx -= nx * imp; a.vy -= ny * imp;
      b.vx += nx * imp; b.vy += ny * imp;
    }
  };

  /* ---------------- AI drivers ---------------- */

  ND.RIVALS = [
    { name: 'Rook',   color: '#ff5f6d', taunt: 'Try to keep up, rookie.',
      pass: ['Hey! My line!', 'Lucky. Just lucky.', 'Oh, it is ON.'],
      passed: ['Too slow, friend.', 'Watch and learn.', 'Neon favors the bold.'] },
    { name: 'Vex',    color: '#b06bff', taunt: 'Eat my sparks.',
      pass: ['WHAT?!', 'You did NOT.', 'Come back here!'],
      passed: ['Later, slowpoke.', 'Drift diff.', 'Stay in my dust.'] },
    { name: 'Marina', color: '#4dd8ff', taunt: 'I never lift. Ever.',
      pass: ['Interesting.', 'Bold move.', 'Noted.'],
      passed: ['Predictable.', 'Smooth is fast.', 'Keep practicing.'] },
    { name: 'Juno',   color: '#ffd94d', taunt: 'Catch me if the neon lets you.',
      pass: ['Okay, that was good.', 'Rematch! Now!', 'Show-off.'],
      passed: ['Bye-bye!', 'Too easy.', 'The city loves me.'] },
    { name: 'Blitz',  color: '#7dff6e', taunt: 'Last place is just first loser.',
      pass: ['IMPOSSIBLE.', 'My paint!!', 'You will regret that.'],
      passed: ['Witness me!', 'Full send!', 'Too fast for ya!'] }
  ];

  // Honest AI: pure pursuit + curvature braking on the SAME physics.
  // No rubber-banding — pace comes only from skill and the car.
  ND.aiInput = function (track, car, skill) {
    var N = track.N;
    var sf = car.vx * Math.cos(car.th) + car.vy * Math.sin(car.th);
    var la = Math.round(5 + Math.max(0, sf) * 0.24);
    var ti = (car.si + la) % N;
    var dx = track.pts[ti].x - car.x, dy = track.pts[ti].y - car.y;
    var desired = Math.atan2(dy, dx);
    var steer = clamp(wrapAngle(desired - car.th) * 2.6, -1, 1);

    // target speed from worst curvature ahead
    var worst = 0;
    var scan = Math.round(8 + Math.max(0, sf) * 0.55);
    for (var k = 4; k < scan; k++) {
      var c = track.curv[(car.si + k) % N];
      if (c > worst) worst = c;
    }
    var latA = 34 + 22 * skill; // lateral accel budget
    var vTarget = Math.sqrt(latA / Math.max(worst, 1e-4));
    if (vTarget > car.spec.top) vTarget = car.spec.top;
    // small per-driver wobble so they feel human (seeded by slot)
    vTarget *= 1 - 0.03 * (1 - skill);

    var drift = false;
    if (worst > 0.022 && skill > 0.86 && sf > vTarget * 1.02) {
      // commit to the slide like a brave idiot
      drift = true;
      steer = clamp(steer * 1.6, -1, 1);
      if (Math.abs(steer) < 0.7) steer = steer < 0 ? -0.85 : 0.85;
    } else if (sf > vTarget * 1.12) {
      // scrub speed by steering harder (same tool the player has)
      steer = clamp(steer * 1.35, -1, 1);
    }
    return { steer: steer, drift: drift };
  };

  /* ---------------- race ---------------- */

  // drivers: [{name,color,isPlayer,skill,spec,taunt...}]. Player is drivers[0].
  ND.newRace = function (track, drivers, laps, opts) {
    opts = opts || {};
    var cars = [];
    for (var i = 0; i < drivers.length; i++) {
      var c = ND.newCar(track, drivers[i].spec, i);
      c.driver = drivers[i];
      cars.push(c);
    }
    return {
      track: track, cars: cars, laps: laps, t: 0,
      state: 'countdown', countT: 3.4,
      rec: opts.record ? [] : null,   // ghost recording (player inputs/tick)
      ev: []
    };
  };

  ND.positions = function (race) {
    var idx = [];
    for (var i = 0; i < race.cars.length; i++) idx.push(i);
    idx.sort(function (a, b) {
      var ca = race.cars[a], cb = race.cars[b];
      if (ca.finished && cb.finished) return ca.finishT - cb.finishT;
      if (ca.finished) return -1;
      if (cb.finished) return 1;
      return cb.prog - ca.prog;
    });
    return idx;
  };

  ND.playerPos = function (race) {
    var p = ND.positions(race);
    for (var i = 0; i < p.length; i++) if (p[i] === 0) return i + 1;
    return 1;
  };

  // Advance the whole race by exactly DT. inputs[0] = player input.
  ND.stepRace = function (race, inputs, dt) {
    race.ev.length = 0;
    if (race.state === 'countdown') {
      race.countT -= dt;
      if (race.countT <= 0) { race.state = 'run'; race.ev.push('go'); }
      return;
    }
    if (race.state === 'done') return;
    race.t += dt;

    var prevPos = ND.playerPos(race);
    for (var i = 0; i < race.cars.length; i++) {
      var car = race.cars[i];
      if (car.finished) continue;
      var inp;
      if (car.driver.isPlayer) {
        inp = ND.normInput(inputs[0]);
        if (race.rec) race.rec.push([inp.steer, inp.drift ? 1 : 0, inp.gas, inp.brake]);
      } else {
        inp = ND.aiInput(race.track, car, car.driver.skill);
      }
      ND.stepCar(race.track, car, inp, dt);
      for (var e = 0; e < car.ev.length; e++) {
        if (car.driver.isPlayer) race.ev.push({ car: i, type: car.ev[e] });
      }
      if (car.lap >= race.laps && !car.finished) {
        car.finished = true;
        car.finishT = race.t;
        race.ev.push({ car: i, type: 'finish' });
      }
    }
    // car-car collisions
    for (var a = 0; a < race.cars.length; a++) {
      for (var b = a + 1; b < race.cars.length; b++) {
        if (!race.cars[a].finished || !race.cars[b].finished)
          ND.collide(race.cars[a], race.cars[b]);
      }
    }
    // overtake drama for the player's rival banter
    var nowPos = ND.playerPos(race);
    if (nowPos !== prevPos && race.t > 4) {
      race.ev.push({ car: 0, type: nowPos < prevPos ? 'overtake' : 'overtaken' });
    }

    var pc = race.cars[0];
    var allDone = true;
    for (var fi = 0; fi < race.cars.length; fi++) {
      if (!race.cars[fi].finished) { allDone = false; break; }
    }
    // Let the moment breathe: rivals roll in behind the player before results.
    if ((pc.finished && (allDone || race.t - pc.finishT > 5)) || race.t > race.laps * 240) {
      race.state = 'done';
      race.ev.push('done');
    }
  };

  // Headless replay: run inputs through a fresh race, sampling car 0's
  // pose every tick. Used for ghosts AND the dev ghost in time trial.
  // Inputs may be objects or raw tape arrays (2- or 4-element); stepRace
  // normalizes them, so legacy tapes replay with their original steering.
  ND.replay = function (track, drivers, laps, inputs) {
    var race = ND.newRace(track, drivers, laps, {});
    var out = [];
    var i = 0;
    // skip countdown instantly
    race.state = 'run';
    while (i < inputs.length && race.state !== 'done') {
      ND.stepRace(race, [inputs[i]], ND.DT);
      var c = race.cars[0];
      out.push([+c.x.toFixed(2), +c.y.toFixed(2), +c.th.toFixed(3)]);
      i++;
    }
    return out;
  };

  // Generate a dev-ghost input tape: an AI driver runs the track headless.
  ND.devGhostInputs = function (track, spec, laps, skill) {
    var drivers = [{ name: 'DEV', color: '#fff', isPlayer: true, skill: skill, spec: spec }];
    var race = ND.newRace(track, drivers, laps, { record: true });
    race.state = 'run';
    var guard = 0;
    while (race.state !== 'done' && guard < laps * 360 * 8) {
      var c = race.cars[0];
      ND.stepRace(race, [ND.aiInput(track, c, skill)], ND.DT);
      guard++;
    }
    return race.rec;
  };

  if (typeof globalThis !== 'undefined') globalThis.ND = ND;
})();
