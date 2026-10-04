/*
 * Neon Depths — pinball physics core (sim.js)
 *
 * Pure logic: no DOM, no canvas, no Math.random. Seeded PRNG + fixed
 * timestep => deterministic, headless-testable in node.
 *
 * Units: arbitrary playfield units. Table code owns geometry; this file
 * owns integration + collision + flippers + plunger + nudge/tilt.
 *
 * Coordinate system: x right, y DOWN. Gravity pulls +y.
 */

'use strict';

function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

class PinSim {
  constructor(seed) {
    this.rng = mulberry32(seed);
    this.time = 0;
    this.balls = [];        // {id,x,y,vx,vy,r,dead}
    this.segments = [];     // {ax,ay,bx,by,rest,kind,kick,nx,ny} static walls/slings
    this.circles = [];      // {x,y,r,rest,kind,kick,flash}
    this.flippers = [];     // {side,pivotX,pivotY,len,restAngle,activeAngle,speed,angle,omega,pressed}
    this.triggers = [];     // {id,kind,x,y,r|w,h,cooldown,lastFire}
    this.events = [];
    this.nextBallId = 1;

    this.gravity = 1500;
    this.drainY = 1e9;      // table sets
    this.stepH = 1 / 120;   // base physics step
    this.acc = 0;

    // nudge / tilt
    this.tilt = 0;          // 0..1, 1 = tilt!
    this.tiltDecay = 0.45;  // per second
    this.tilted = false;

    // plunger state (table owns lane geometry; sim owns charge + launch)
    this.plunger = { charge: 0 };
  }

  // ---------- construction ----------
  addBall(x, y, vx, vy, r) {
    const b = { id: this.nextBallId++, x, y, vx: vx || 0, vy: vy || 0, r: r || 7, dead: false };
    this.balls.push(b);
    return b.id;
  }
  removeBall(id) {
    const b = this.balls.find(b => b.id === id);
    if (b) b.dead = true;
  }
  ball(id) { return this.balls.find(b => b.id === id && !b.dead); }

  // kind: 'wall' | 'sling' (kick on hit)
  addSegment(ax, ay, bx, by, opts) {
    opts = opts || {};
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    this.segments.push({
      ax, ay, bx, by,
      nx: -dy / len, ny: dx / len, // one of the two normals; collision uses ball-relative side
      rest: opts.rest !== undefined ? opts.rest : 0.35,
      kind: opts.kind || 'wall',
      kick: opts.kick || 0,
      id: opts.id || null,
    });
  }

  // kind: 'bumper' (kick) | 'post' (lively rubber) | 'peg' (dead)
  addCircle(x, y, r, opts) {
    opts = opts || {};
    this.circles.push({
      x, y, r,
      rest: opts.rest !== undefined ? opts.rest : 0.4,
      kind: opts.kind || 'peg',
      kick: opts.kick || 0,
      flash: 0,
      id: opts.id || null,
    });
  }

  // side: 'left' | 'right'. Angles in radians, y-down convention:
  // direction d(a) = (cos a, sin a). Right flipper: rest ~152deg, active ~205deg.
  addFlipper(side, pivotX, pivotY, len, restAngle, activeAngle, speedRad) {
    const f = {
      side, pivotX, pivotY, len,
      restAngle, activeAngle,
      speed: speedRad || 20,
      angle: restAngle, omega: 0, pressed: false,
    };
    this.flippers.push(f);
    return f;
  }
  setFlipper(side, pressed) {
    for (const f of this.flippers) if (f.side === side) f.pressed = !!pressed;
  }

  // kind: 'circle' {x,y,r} | 'rect' {x,y,w,h}; fires 'trigger' on enter (with cooldown s)
  addTrigger(id, kind, shape, cooldown) {
    this.triggers.push(Object.assign({ id, kind, cooldown: cooldown || 0.25, lastFire: -99 }, shape));
  }

  emit(type, data) {
    this.events.push(Object.assign({ type, t: this.time }, data || {}));
  }
  takeEvents() {
    const e = this.events; this.events = []; return e;
  }

  // ---------- player actions ----------
  plungerSet(charge) { this.plunger.charge = clamp(charge, 0, 1); }
  // Launch a ball (usually from the plunger lane). Table decides velocity.
  launchBall(id, vx, vy) {
    const b = this.ball(id);
    if (b) { b.vx = vx; b.vy = vy; this.plunger.charge = 0; }
  }

  nudge(dx, dy) {
    if (this.tilted) return;
    const k = 260;
    for (const b of this.balls) {
      if (b.dead) continue;
      b.vx += dx * k; b.vy += dy * k;
    }
    this.tilt = clamp(this.tilt + 0.30, 0, 1);
    this.emit('nudge', { tilt: this.tilt });
    if (this.tilt >= 1) {
      this.tilted = true;
      this.emit('tilt', {});
    } else if (this.tilt >= 0.66) {
      this.emit('tiltWarning', { tilt: this.tilt });
    }
  }
  resetTilt() { this.tilt = 0; this.tilted = false; }

  // ---------- stepping ----------
  step(dt) {
    dt = Math.min(dt, 0.1); // clamp: never spiral
    this.acc += dt;
    let guard = 0;
    while (this.acc >= this.stepH && guard < 40) {
      this._substep(this.stepH);
      this.acc -= this.stepH;
      this.time += this.stepH;
      guard++;
    }
    if (guard >= 40) this.acc = 0;
    // decay bumper flashes + tilt
    for (const c of this.circles) if (c.flash > 0) c.flash = Math.max(0, c.flash - dt * 6);
    if (!this.tilted && this.tilt > 0) this.tilt = Math.max(0, this.tilt - this.tiltDecay * dt);
  }

  _substep(h) {
    // 1. animate flippers
    for (const f of this.flippers) {
      const target = f.pressed ? f.activeAngle : f.restAngle;
      const prev = f.angle;
      let d = target - f.angle;
      const maxD = f.speed * h;
      if (Math.abs(d) <= maxD) f.angle = target;
      else f.angle = f.angle + Math.sign(d) * maxD;
      f.omega = (f.angle - prev) / h;
    }

    // 2. integrate balls (adaptive sub-substeps against tunneling)
    let maxSpeed = 0;
    for (const b of this.balls) {
      if (b.dead) continue;
      const s = Math.hypot(b.vx, b.vy);
      if (s > maxSpeed) maxSpeed = s;
    }
    let nSub = 1;
    if (maxSpeed > 0) nSub = clamp(Math.ceil((maxSpeed * h) / 3), 1, 8);
    const sh = h / nSub;
    for (let s = 0; s < nSub; s++) {
      for (const b of this.balls) {
        if (b.dead) continue;
        b.vy += this.gravity * sh;
        b.x += b.vx * sh;
        b.y += b.vy * sh;
        this._collideBall(b);
      }
      this._collideBallPairs();
    }

    // 3. triggers + drain
    for (const b of this.balls) {
      if (b.dead) continue;
      for (const t of this.triggers) {
        if (this.time - t.lastFire < t.cooldown) continue;
        let inside = false;
        if (t.kind === 'circle') inside = Math.hypot(b.x - t.x, b.y - t.y) < t.r;
        else inside = b.x > t.x && b.x < t.x + t.w && b.y > t.y && b.y < t.y + t.h;
        if (inside) {
          t.lastFire = this.time;
          this.emit('trigger', { id: t.id, ball: b.id, x: b.x, y: b.y });
        }
      }
      if (b.y - b.r > this.drainY) {
        b.dead = true;
        this.emit('drain', { ball: b.id, x: b.x, y: b.y });
      }
    }
    // sweep dead balls immediately (drained / manually removed)
    if (this.balls.some(b => b.dead)) {
      this.balls = this.balls.filter(b => !b.dead);
    }
  }

  _collideBall(b) {
    // static segments
    for (const s of this.segments) this._collideSegment(b, s);
    // circles
    for (const c of this.circles) this._collideCircle(b, c);
    // flippers (as moving segments)
    for (const f of this.flippers) this._collideFlipper(b, f);
  }

  _closestOnSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    return { x: ax + dx * t, y: ay + dy * t, t };
  }

  _collideSegment(b, s) {
    const c = this._closestOnSeg(b.x, b.y, s.ax, s.ay, s.bx, s.by);
    let nx = b.x - c.x, ny = b.y - c.y;
    let dist = Math.hypot(nx, ny);
    if (dist >= b.r) return;
    if (dist < 1e-6) { nx = s.nx; ny = s.ny; dist = 1e-6; }
    else { nx /= dist; ny /= dist; }
    const pen = b.r - dist;
    b.x += nx * pen; b.y += ny * pen;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + s.rest) * vn * nx;
      b.vy -= (1 + s.rest) * vn * ny;
      if (s.kind === 'sling' && vn < -60) {
        b.vx += nx * s.kick; b.vy += ny * s.kick;
        this.emit('sling', { x: c.x, y: c.y, id: s.id, impulse: -vn });
      } else if (vn < -40) {
        this.emit('wallHit', { x: c.x, y: c.y, impulse: -vn });
      }
    }
  }

  _collideCircle(b, c) {
    let nx = b.x - c.x, ny = b.y - c.y;
    const rr = b.r + c.r;
    let dist = Math.hypot(nx, ny);
    if (dist >= rr) return;
    if (dist < 1e-6) { nx = 0; ny = -1; dist = 1e-6; }
    else { nx /= dist; ny /= dist; }
    const pen = rr - dist;
    b.x += nx * pen; b.y += ny * pen;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + c.rest) * vn * nx;
      b.vy -= (1 + c.rest) * vn * ny;
      if (c.kind === 'bumper' && vn < -60) {
        b.vx += nx * c.kick; b.vy += ny * c.kick;
        c.flash = 1;
        this.emit('bumper', { x: c.x, y: c.y, id: c.id, impulse: -vn });
      } else if (vn < -40) {
        this.emit('wallHit', { x: c.x, y: c.y, impulse: -vn });
      }
    }
  }

  _collideFlipper(b, f) {
    const dx = Math.cos(f.angle), dy = Math.sin(f.angle);
    const tx = f.pivotX + f.len * dx, ty = f.pivotY + f.len * dy;
    const c = this._closestOnSeg(b.x, b.y, f.pivotX, f.pivotY, tx, ty);
    let nx = b.x - c.x, ny = b.y - c.y;
    let dist = Math.hypot(nx, ny);
    if (dist >= b.r) return;
    if (dist < 1e-6) { nx = -dy; ny = dx; dist = 1e-6; } // push off the top face
    else { nx /= dist; ny /= dist; }
    // keep the ball above the bat: if normal points downward, flip to top face
    if (ny > 0.2) { nx = -nx; ny = -ny; }
    const pen = b.r - dist;
    b.x += nx * pen; b.y += ny * pen;
    // surface velocity at contact point: v = omega * s * perp(dir)
    const s = c.t * f.len;
    const svx = f.omega * s * -dy, svy = f.omega * s * dx;
    const rvx = b.vx - svx, rvy = b.vy - svy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const e = Math.abs(vn) < 40 ? 0 : 0.25; // dead bounce at low speed => cradle/catch works
      b.vx -= (1 + e) * vn * nx;
      b.vy -= (1 + e) * vn * ny;
      if (vn < -120) this.emit('flipperHit', { side: f.side, impulse: -vn, x: c.x, y: c.y });
    }
  }

  _collideBallPairs() {
    const bs = this.balls;
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], b = bs[j];
        if (a.dead || b.dead) continue;
        let nx = b.x - a.x, ny = b.y - a.y;
        const rr = a.r + b.r;
        const dist = Math.hypot(nx, ny);
        if (dist >= rr || dist < 1e-6) continue;
        nx /= dist; ny /= dist;
        const pen = (rr - dist) / 2;
        a.x -= nx * pen; a.y -= ny * pen;
        b.x += nx * pen; b.y += ny * pen;
        const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          const imp = -(1 + 0.9) * vn / 2;
          a.vx -= imp * nx; a.vy -= imp * ny;
          b.vx += imp * nx; b.vy += imp * ny;
          this.emit('ballHit', { impulse: -vn });
        }
      }
    }
  }

  // Snapshot for renderers (plain data, no references mutated by render).
  snapshot() {
    return {
      time: this.time,
      balls: this.balls.filter(b => !b.dead).map(b => ({ id: b.id, x: b.x, y: b.y, r: b.r, vx: b.vx, vy: b.vy })),
      flippers: this.flippers.map(f => ({
        side: f.side, pivotX: f.pivotX, pivotY: f.pivotY, len: f.len, angle: f.angle,
        tipX: f.pivotX + f.len * Math.cos(f.angle), tipY: f.pivotY + f.len * Math.sin(f.angle),
      })),
      bumpers: this.circles.filter(c => c.kind === 'bumper').map(c => ({ x: c.x, y: c.y, r: c.r, flash: c.flash, id: c.id })),
      tilt: this.tilt, tilted: this.tilted,
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PinSim, mulberry32 };
}
