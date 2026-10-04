/*
 * Neon Depths — table.js
 * Builds the Neon Depths playfield on a PinSim instance.
 * Pure logic (no DOM). Owns geometry, ramp carries, captures (scoop/saucer/
 * locks/magnet), kickback, drop targets. Emits table-level events for rules.js.
 *
 * Playfield: 400 x 800, y down. See DESIGN.md for the layout diagram.
 */
'use strict';

const D2R = Math.PI / 180;

const SHOTS = {
  // id: {name, x, y} — insert-light positions for renderer + rules
  orbitL:      { name: 'Left Orbit', x: 38, y: 300 },
  orbitR:      { name: 'Right Orbit', x: 362, y: 300 },
  rampKelp:    { name: 'Kelp Elevator', x: 85, y: 390 },
  rampVent:    { name: 'Thermal Vent', x: 200, y: 370 },
  rampMaw:     { name: "Kraken's Maw", x: 315, y: 390 },
  bumper1:     { name: 'Bloom', x: 150, y: 210 },
  bumper2:     { name: 'Bloom', x: 250, y: 210 },
  bumper3:     { name: 'Bloom', x: 200, y: 270 },
  ink1:        { name: 'INK', x: 95, y: 300 },
  ink2:        { name: 'INK', x: 135, y: 300 },
  ink3:        { name: 'INK', x: 175, y: 300 },
  scoop:       { name: 'Dive Bell', x: 200, y: 455 },
  saucer:      { name: 'Whale-Fall', x: 100, y: 200 },
  spinner:     { name: 'The Current', x: 332, y: 300 },
  pearl:       { name: 'Pearl', x: 300, y: 210 },
  trenchL:     { name: 'Trench', x: 135, y: 470 },
  trenchR:     { name: 'Trench', x: 265, y: 470 },
  abyss1:      { name: 'ABYSS', x: 110, y: 505 },
  abyss2:      { name: 'ABYSS', x: 155, y: 495 },
  abyss3:      { name: 'ABYSS', x: 200, y: 490 },
  abyss4:      { name: 'ABYSS', x: 245, y: 495 },
  abyss5:      { name: 'ABYSS', x: 290, y: 505 },
  magnet:      { name: 'Anglerfish', x: 200, y: 310 },
  kickback:    { name: 'Kickback', x: 55, y: 700 },
  inlaneL:     { name: 'Inlane', x: 100, y: 668 },
  inlaneR:     { name: 'Inlane', x: 285, y: 668 },
};

function createTable(sim) {
  const T = {
    sim,
    shots: SHOTS,
    events: [],
    carries: [],   // ramp carries in flight: {rampId, ball, t, dur, from, ctrl, to}
    holds: [],     // captured balls: {ball, timer, kind, data}
    mawLocks: [],  // balls held in the Kraken's Maw
    magnet: { armed: false, target: null },
    kickbackLit: false,
    inkRefs: [],   // circle refs for the INK drop bank
    inkDown: [false, false, false],
    pearlWobble: 0,
    emit(type, data) { T.events.push(Object.assign({ type, t: sim.time }, data || {})); },
    takeEvents() { const e = T.events; T.events = []; return e; },
  };

  const S = sim;
  S.drainY = 770;

  // ---------------- walls ----------------
  const WALL = { rest: 0.35, kind: 'wall' };
  // top arch: half-ellipse, center (200,120), rx 184, ry 96 (peak y=24)
  let prev = null;
  for (let a = 180; a <= 360; a += 12) {
    const x = 200 + 184 * Math.cos(a * D2R), y = 120 + 96 * Math.sin(a * D2R);
    if (prev) S.addSegment(prev.x, prev.y, x, y, WALL);
    prev = { x, y };
  }
  // left outer wall ends where the return curve begins
  S.addSegment(16, 120, 16, 640, WALL);
  S.addSegment(384, 120, 384, 706, WALL);
  // plunger lane: divider + floor
  S.addSegment(356, 110, 356, 700, WALL);
  S.addSegment(356, 706, 384, 706, WALL);
  // lane-top guide: keeps launched/orbiting balls out of the lane mouth
  S.addSegment(356, 110, 322, 84, WALL);

  // inner orbit guides (orbit lanes run between outer wall and these)
  S.addSegment(60, 560, 60, 220, WALL);
  S.addSegment(340, 560, 340, 220, WALL);
  prev = null;
  for (let a = 180; a <= 360; a += 15) {
    const x = 200 + 140 * Math.cos(a * D2R), y = 220 + 140 * Math.sin(a * D2R);
    if (prev) S.addSegment(prev.x, prev.y, x, y, WALL);
    prev = { x, y };
  }

  // midfield funnel guides above slings
  S.addSegment(60, 380, 88, 520, WALL);
  S.addSegment(340, 380, 312, 520, WALL);

  // slingshots (triangles approximated as single kick segments)
  S.addSegment(88, 520, 128, 575, { kind: 'sling', kick: 380, rest: 0.5, id: 'slingL' });
  S.addSegment(312, 520, 272, 575, { kind: 'sling', kick: 380, rest: 0.5, id: 'slingR' });
  // sling back walls
  S.addSegment(88, 520, 88, 560, WALL);
  S.addSegment(312, 520, 312, 560, WALL);

  // ---- lower sides: return curves with outlane gaps, feeds to flippers ----
  // Balls coming down either side roll along the curve toward the flippers;
  // slow balls drop through the gap into the outlane chute (risk geometry).
  // LEFT
  S.addSegment(16, 640, 44, 672, WALL);    // return curve
  S.addSegment(66, 682, 132, 658, WALL);   // feed to left flipper pivot
  S.addSegment(44, 672, 44, 732, WALL);    // outlane chute: outer
  S.addSegment(66, 682, 66, 732, WALL);    // outlane chute: inner
  // RIGHT (mirrored; plunger divider is the outer wall)
  S.addSegment(356, 640, 328, 672, WALL);   // return curve
  S.addSegment(306, 682, 268, 658, WALL);   // feed to right flipper pivot
  S.addSegment(328, 672, 328, 732, WALL);   // outlane chute: outer
  S.addSegment(306, 682, 306, 732, WALL);   // outlane chute: inner

  // trench lane walls
  S.addSegment(120, 400, 120, 540, WALL);
  S.addSegment(150, 400, 150, 540, WALL);
  S.addSegment(250, 400, 250, 540, WALL);
  S.addSegment(280, 400, 280, 540, WALL);

  // ---------------- flippers ----------------
  S.addFlipper('left', 140, 660, 55, 28 * D2R, -25 * D2R, 20);
  S.addFlipper('right', 260, 660, 55, 152 * D2R, 205 * D2R, 20);
  S.addFlipper('right', 295, 455, 38, 152 * D2R, 205 * D2R, 22); // upper

  // ---------------- toys ----------------
  // pop bumpers (below the inner orbit arc)
  S.addCircle(150, 210, 16, { kind: 'bumper', kick: 620, rest: 1.0, id: 'bumper1' });
  S.addCircle(250, 210, 16, { kind: 'bumper', kick: 620, rest: 1.0, id: 'bumper2' });
  S.addCircle(200, 270, 16, { kind: 'bumper', kick: 620, rest: 1.0, id: 'bumper3' });

  // INK drop bank
  const inkPos = [[95, 300], [135, 300], [175, 300]];
  inkPos.forEach((p, i) => {
    const ref = { x: p[0], y: p[1], r: 10, rest: 0.3, kind: 'drop', kick: 0, flash: 0, id: 'ink' + (i + 1) };
    S.circles.push(ref);
    T.inkRefs.push(ref);
  });

  // ABYSS standups
  [[110, 505], [155, 495], [200, 490], [245, 495], [290, 505]].forEach((p, i) => {
    S.addCircle(p[0], p[1], 9, { kind: 'peg', rest: 0.7, id: 'abyss' + (i + 1) });
  });

  // Pearl captive ball (bash toy)
  S.addCircle(300, 210, 12, { kind: 'captive', rest: 0.9, id: 'pearl' });

  // ---------------- triggers ----------------
  const TR = (id, kind, shape, cd) => S.addTrigger(id, kind, shape, cd);
  TR('orbitTop', 'rect', { x: 60, y: 36, w: 280, h: 44 }, 0.3);
  TR('rampKelp', 'circle', { x: 85, y: 390, r: 24 }, 0.5);
  TR('rampVent', 'circle', { x: 200, y: 370, r: 24 }, 0.5);
  TR('rampMaw', 'circle', { x: 315, y: 390, r: 24 }, 0.5);
  TR('scoop', 'circle', { x: 200, y: 455, r: 18 }, 0.8);
  TR('saucer', 'circle', { x: 100, y: 200, r: 17 }, 0.8);
  TR('spinner', 'rect', { x: 318, y: 280, w: 26, h: 60 }, 0.2);
  TR('trenchL', 'rect', { x: 120, y: 400, w: 30, h: 140 }, 0.4);
  TR('trenchR', 'rect', { x: 250, y: 400, w: 30, h: 140 }, 0.4);
  TR('inlaneL', 'rect', { x: 80, y: 636, w: 52, h: 40 }, 0.4);
  TR('inlaneR', 'rect', { x: 255, y: 636, w: 52, h: 40 }, 0.4);
  TR('outlaneL', 'rect', { x: 44, y: 684, w: 22, h: 48 }, 0.4);
  TR('outlaneR', 'rect', { x: 306, y: 690, w: 22, h: 48 }, 0.4);
  TR('magnetZone', 'circle', { x: 200, y: 310, r: 42 }, 0.3);
  TR('laneTop1', 'rect', { x: 120, y: 30, w: 40, h: 50 }, 0.5);
  TR('laneTop2', 'rect', { x: 180, y: 28, w: 40, h: 50 }, 0.5);
  TR('laneTop3', 'rect', { x: 240, y: 30, w: 40, h: 50 }, 0.5);

  // ---------------- helpers ----------------
  function captureBall(id) {
    const b = S.ball(id);
    if (!b) return null;
    const stash = { id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: b.r };
    S.removeBall(id);
    return stash;
  }
  function releaseBall(stash, x, y, vx, vy) {
    const id = S.addBall(x !== undefined ? x : stash.x, y !== undefined ? y : stash.y, vx || 0, vy || 0, stash.r);
    return id;
  }

  const RAMP_PATHS = {
    rampKelp: { dur: 1.15, ctrl: { x: 85, y: 180 }, to: { x: 330, y: 600, vx: -180, vy: 320 } },
    rampVent: { dur: 1.15, ctrl: { x: 200, y: 160 }, to: { x: 110, y: 620, vx: 150, vy: 260 } },
    rampMaw:  { dur: 1.25, ctrl: { x: 315, y: 170 }, to: { x: 200, y: 130, vx: 60, vy: 420 } },
  };

  function bez(p0, p1, p2, t) {
    const u = 1 - t;
    return { x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
             y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y };
  }

  // ---------------- public API ----------------
  T.newBallInLane = () => S.addBall(370, 690, 0, 0, 7);

  T.plunge = (power) => {
    const b = S.balls.find(b => !b.dead && b.x > 356 && b.y > 600);
    if (!b) return null;
    const vy = -(1400 + power * 1900);
    S.launchBall(b.id, 0, vy);
    const band = power < 0.4 ? 'soft' : power < 0.8 ? 'mid' : 'full';
    T.emit('plunged', { power, band, ball: b.id });
    return b.id;
  };

  T.setMagnet = (armed, target) => {
    T.magnet.armed = !!armed;
    T.magnet.target = target || null;
  };

  T.setSlingBoost = (mult) => {
    for (const s of S.segments) if (s.kind === 'sling') s.kick = 380 * mult;
  };

  T.releaseScoop = (vx, vy) => {
    const h = T.holds.find(h => h.kind === 'scoop');
    if (!h) return null;
    T.holds.splice(T.holds.indexOf(h), 1);
    return releaseBall(h.ball, 200, 472, vx === undefined ? 80 : vx, vy === undefined ? 420 : vy);
  };

  T.lockBallInMaw = () => {
    // Called by rules when a lock is earned and the ball is being carried.
    // Returns 'held' (1st/2nd) or 'multiball' (3rd -> release all).
    if (T.mawLocks.length < 2) return 'held';
    const locks = T.mawLocks.splice(0);
    for (const L of locks) {
      const hi = T.holds.indexOf(L);
      if (hi >= 0) T.holds.splice(hi, 1);
      releaseBall(L.ball, 345, 300, -300, 500);
    }
    T.emit('mawRelease', { count: locks.length });
    return 'multiball';
  };

  T.resetInkBank = () => {
    T.inkDown = [false, false, false];
    for (const ref of T.inkRefs) {
      if (!S.circles.includes(ref)) S.circles.push(ref);
    }
    T.emit('inkReset', {});
  };

  T.getCarryBalls = () => {
    const out = [];
    for (const c of T.carries) {
      const p = bez(c.from, c.ctrl, c.to, Math.min(1, c.t / c.dur));
      out.push({ x: p.x, y: p.y, r: c.ball.r, ramp: c.rampId });
    }
    for (const h of T.holds) {
      if (h.kind === 'maw') out.push({ x: 345, y: 300 + T.mawLocks.indexOf(h) * 22, r: h.ball.r, held: true });
    }
    if (T.magnet.held) out.push({ x: 200, y: 310, r: T.magnet.held.r, magnet: true });
    return out;
  };

  // ---------------- per-frame ----------------
  T.update = (dt) => {
    // ramp carries
    for (let i = T.carries.length - 1; i >= 0; i--) {
      const c = T.carries[i];
      c.t += dt;
      if (c.t >= c.dur) {
        T.carries.splice(i, 1);
        const p = RAMP_PATHS[c.rampId];
        if (c.rampId === 'rampMaw' && c.lockRequested) {
          // hold in the Maw
          T.holds.push({ ball: c.ball, timer: 1e9, kind: 'maw' });
          T.mawLocks.push(T.holds[T.holds.length - 1]);
          T.emit('mawLock', { locks: T.mawLocks.length });
        } else {
          releaseBall(c.ball, p.to.x, p.to.y, p.to.vx, p.to.vy);
          T.emit('rampExit', { ramp: c.rampId });
        }
      }
    }
    // holds (scoop / saucer)
    for (let i = T.holds.length - 1; i >= 0; i--) {
      const h = T.holds[i];
      if (h.kind === 'maw') continue;
      h.timer -= dt;
      if (h.timer <= 0) {
        T.holds.splice(i, 1);
        if (h.kind === 'saucer') {
          // wild kickout: seeded direction
          const a = S.rng() * Math.PI * 2;
          releaseBall(h.ball, 80, 160, Math.cos(a) * 700, Math.sin(a) * 700 - 200);
          T.emit('saucerKick', {});
        } else if (h.kind === 'scoopAuto') {
          releaseBall(h.ball, 200, 472, 80, 420);
          T.emit('scoopKick', {});
        }
      }
    }
    // magnet hold
    const M = T.magnet;
    if (M.held) {
      M.timer -= dt;
      if (M.timer <= 0) {
        const held = M.held; M.held = null;
        const tgt = M.target || { x: 200, y: 500 };
        const dx = tgt.x - 200, dy = tgt.y - 310;
        const d = Math.hypot(dx, dy) || 1;
        releaseBall(held, 200, 320, dx / d * 1150, dy / d * 1150);
        T.emit('magnetFling', { x: tgt.x, y: tgt.y });
      }
    }
    if (T.pearlWobble > 0) T.pearlWobble = Math.max(0, T.pearlWobble - dt * 3);

    // translate sim events -> table events
    for (const e of S.takeEvents()) {
      if (e.type === 'trigger') T._onTrigger(e);
      else if (e.type === 'bumper') { T.emit('shot', { id: e.id, impulse: e.impulse, x: e.x, y: e.y }); }
      else if (e.type === 'sling') { T.emit('sling', { id: e.id, impulse: e.impulse }); }
      else if (e.type === 'drain') { T.emit('drain', { ball: e.ball }); }
      else if (e.type === 'tilt') { T.emit('tilt', {}); }
      else if (e.type === 'tiltWarning') { T.emit('tiltWarning', { tilt: e.tilt }); }
      else if (e.type === 'nudge') { T.emit('nudge', { tilt: e.tilt }); }
      else if (e.type === 'flipperHit') { /* audio only */ T.emit('flipperHit', { side: e.side, impulse: e.impulse }); }
      else if (e.type === 'wallHit') { T._onWallHit(e); }
      else if (e.type === 'ballHit') { T.emit('ballHit', { impulse: e.impulse }); }
    }
  };

  T._onWallHit = (e) => {
    // INK drop targets
    for (let i = 0; i < T.inkRefs.length; i++) {
      const ref = T.inkRefs[i];
      if (!T.inkDown[i] && Math.hypot(e.x - ref.x, e.y - ref.y) < 24 && e.impulse > 120) {
        T.inkDown[i] = true;
        S.circles = S.circles.filter(c => c !== ref);
        ref.flash = 1;
        T.emit('inkDown', { index: i, down: T.inkDown.filter(Boolean).length });
        return;
      }
    }
    // ABYSS standups
    for (let i = 1; i <= 5; i++) {
      const sp = SHOTS['abyss' + i];
      if (Math.hypot(e.x - sp.x, e.y - sp.y) < 20 && e.impulse > 120) {
        T.emit('abyssHit', { index: i - 1 });
        return;
      }
    }
    // Pearl captive bash
    if (Math.hypot(e.x - 300, e.y - 210) < 26 && e.impulse > 120) {
      T.pearlWobble = 1;
      T.emit('pearlHit', { impulse: e.impulse });
      return;
    }
  };

  T._onTrigger = (e) => {
    const id = e.id, b = e.ball;
    switch (id) {
      case 'orbitTop': {
        const ball = S.ball(b);
        if (ball && Math.abs(ball.vx) > 250) {
          T.emit('shot', { id: ball.vx > 0 ? 'orbitL' : 'orbitR', x: ball.x, y: ball.y });
        }
        break;
      }
      case 'rampKelp':
      case 'rampVent':
      case 'rampMaw': {
        const ball = S.ball(b);
        if (!ball || ball.vy > -150) break; // ramps need an upward shot
        const stash = captureBall(b);
        if (stash) {
          const p = RAMP_PATHS[id];
          T.carries.push({ rampId: id, ball: stash, t: 0, dur: p.dur,
            from: { x: stash.x, y: stash.y }, ctrl: p.ctrl, to: p.to, lockRequested: false });
          T.emit('rampEnter', { ramp: id });
        }
        break;
      }
      case 'scoop': {
        const stash = captureBall(b);
        if (stash) {
          T.holds.push({ ball: stash, timer: 1e9, kind: 'scoop' });
          T.emit('scoop', { ball: b });
        }
        break;
      }
      case 'saucer': {
        const stash = captureBall(b);
        if (stash) {
          T.holds.push({ ball: stash, timer: 0.6, kind: 'saucer' });
          T.emit('saucer', { ball: b });
        }
        break;
      }
      case 'spinner': {
        const ball = S.ball(b);
        const spins = ball ? 1 + Math.floor(Math.hypot(ball.vx, ball.vy) / 600) : 1;
        T.emit('shot', { id: 'spinner', spins, x: e.x, y: e.y });
        break;
      }
      case 'trenchL': T.emit('shot', { id: 'trenchL', x: e.x, y: e.y }); break;
      case 'trenchR': T.emit('shot', { id: 'trenchR', x: e.x, y: e.y }); break;
      case 'inlaneL': T.emit('shot', { id: 'inlaneL', x: e.x, y: e.y }); break;
      case 'inlaneR': T.emit('shot', { id: 'inlaneR', x: e.x, y: e.y }); break;
      case 'outlaneL': {
        if (T.kickbackLit) {
          const stash = captureBall(b);
          T.kickbackLit = false;
          if (stash) {
            const nid = releaseBall(stash, 55, 655, 60, -1700);
            T.emit('kickback', { ball: nid });
          }
        }
        // else: ball continues to drain
        break;
      }
      case 'magnetZone': {
        if (T.magnet.armed && !T.magnet.held) {
          const stash = captureBall(b);
          if (stash) {
            T.magnet.held = stash;
            T.magnet.timer = 1.2;
            T.emit('magnetGrab', {});
          }
        }
        break;
      }
      case 'laneTop1':
      case 'laneTop2':
      case 'laneTop3':
        T.emit('shot', { id: id, x: e.x, y: e.y });
        break;
    }
  };

  // Maw lock request flag (set by rules before the carry finishes)
  T.requestMawLock = (carry) => { carry.lockRequested = true; };
  T.findMawCarry = () => T.carries.find(c => c.rampId === 'rampMaw');

  return T;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createTable, SHOTS };
}
