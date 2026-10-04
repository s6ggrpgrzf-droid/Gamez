/* PondLife — Moss & Stone phase 3.
 * The pond feels alive: lily pads + lotus flowers bobbing on the surface,
 * feedable food pellets (koi come to eat), rain weather with real ripples,
 * drifting petals, and a soft water-clarity feedback loop.
 *
 * Renders via the water engine's surface-overlay pass (things ON the water).
 * Fixed 60Hz timestep, clamped dt, mulberry32 PRNG, zero per-frame allocations.
 * Vanilla JS + WebGL2, no libraries.
 */
'use strict';

var POND_PAD_COUNT = 6;
var POND_PELLET_MAX = 24;
var POND_PETAL_MAX = 10;
var POND_RING_MAX = 64;

function pondClamp(v, a, b) { return v < a ? a : v > b ? b : v; }

class PondLife {
  constructor(water, koi, opts) {
    opts = opts || {};
    this.water = water;
    this.koi = koi;
    this.seed = opts.seed == null ? 4242 : opts.seed;
    this.rng = mulberry32(this.seed);
    this.ok = false;

    this.time = 0;
    this._acc = 0;
    this._lastT = 0;

    this.pads = [];
    this.petals = [];
    this._pellets = [];
    this.rings = [];
    this._pelletId = 1;

    // phase 5: eggs (breeding)
    this.eggs = [];
    this._eggId = 1;
    this._lotusOverride = null; // when set, lotus open/close follows systems (day/night)
    this.murkScale = 1;         // blessing: uneaten pellets murk the water less

    this.clarity = 0.85;
    this.gloom = 0;
    this.dayPhase = 0.35; // morning: lotus open
    this.reducedMotion = false; // phase 8: set by Systems.setReducedMotion

    this._weather = 'clear';
    this._weatherT = 18 + this.rng() * 22; // first rain in ~18–40s
    this._dropAcc = 0;
    this._petalT = 2.5;

    // GL textures
    this._texPad = null;
    this._texPadShadow = null;
    this._texPetal = null;
    this._texPellet = null;
    this._texRing = null;
    this._texBud = null;
    this._texBloom = null;
    this._texEgg = null;

    // surface vert buffer: worst case ~140 quads × 6 verts × 8 floats
    this._surfBuf = new Float32Array(140 * 6 * 8);
  }

  /* ---------------- init ---------------- */

  init() {
    const water = this.water;
    if (!water || !water.ok || !water.surf) return false;
    const gl = water.gl;

    this._texPad = this._makePadTexture(gl);
    this._texPadShadow = this._makeShadowTexture(gl);
    this._texPetal = this._makePetalTexture(gl);
    this._texPellet = this._makePelletTexture(gl);
    this._texRing = this._makeRingTexture(gl);
    this._texBud = this._makeBudTexture(gl);
    this._texBloom = this._makeBloomTexture(gl);
    this._texEgg = this._makeEggTexture(gl);

    this._spawnPads();

    const self = this;
    water.onSurface = function (surf) { self._drawSurface(surf); };

    // wire into the koi
    if (this.koi) {
      this.koi.setAvoid(function () { return self._padObstacles(); });
      this.koi.setFood(function () { return self._pelletFood(); });
      this.koi.onEat = function (p) { self._eatPellet(p); };
    }

    this.ok = true;
    return true;
  }

  /* ---------------- public API ---------------- */

  // double-tap: drop a pinch of food at the touch point (nx, ny in screen UV)
  feed(nx, ny) {
    if (this._pellets.length > POND_PELLET_MAX - 5) return 0;
    const n = 4;
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2;
      const d = 0.008 + this.rng() * 0.022;
      const px = nx + Math.cos(a) * d, py = ny + Math.sin(a) * d * 0.7;
      this._pellets.push({
        id: this._pelletId++,
        nx: px, ny: py,
        vx: (this.rng() - 0.5) * 0.006, vy: (this.rng() - 0.5) * 0.006,
        age: 0, life: 12 + this.rng() * 3,
        r: 0.0075,
      });
      this.water.disturb(px, py, 2.5, 1.1); // plop
      this._spawnRing(px, py, 0.030);
    }
    return n;
  }

  forceRain(on) {
    if (on) { this._weather = 'rain'; this._weatherT = 30; }
    else { this._weather = 'clear'; this._weatherT = 30; }
  }

  // phase 4: drop a petal/leaf directly onto the water.
  // kind 0 = blossom petal (pink), kind 1 = maple leaf (red, tinted at draw).
  dropPetal(nx, ny, kind) {
    if (this.petals.length >= POND_PETAL_MAX) return false;
    this.petals.push({
      nx, ny,
      vx: 0, vy: 0,
      rot: this.rng() * 6.28, rotV: (this.rng() - 0.5) * 1.2,
      sway: this.rng() * 6.28, state: 'fall', age: 0, life: 26,
      tint: this.rng(), kind: kind || 0,
    });
    return true;
  }
  rainActive() { return this._weather === 'rain'; }
  pelletCount() { return this._pellets.length; }
  pellets() { return this._pellets; }
  padCount() { return this.pads.length; }
  petalCount() { return this.petals.length; }
  setDayPhase(p) { this.dayPhase = pondClamp(p, 0, 1); }

  // test fast-forward: run sim without drawing
  fastForward(sec) {
    const STEP = 1 / 60;
    let t = 0;
    while (t < sec) { this._step(STEP); t += STEP; }
  }
  // phase 5: systems drives lotus openness directly from the day cycle
  setLotusOpen(v) { this._lotusOverride = (v == null) ? null : pondClamp(v, 0, 1); }
  // phase 5: public alias for the ripple-ring spawner (ascension ceremony)
  spawnRing(nx, ny, maxR) { this._spawnRing(nx, ny, maxR); }

  /* ---------------- phase 5: eggs ---------------- */

  // meta: {a, b (parent koi ids), pa, pb (parent pattern seeds), sa, sb (styles),
  //        na, nb (parent names), hatchT}
  spawnEgg(nx, ny, meta) {
    if (this.eggs.length >= 6) return null;
    const e = {
      id: this._eggId++,
      nx: nx, ny: ny,
      t: 0, hatchT: (meta && meta.hatchT) || 180,
      a: meta.a, b: meta.b,
      pa: meta.pa, pb: meta.pb, sa: meta.sa, sb: meta.sb,
      na: meta.na, nb: meta.nb,
    };
    this.eggs.push(e);
    this._spawnRing(nx, ny, 0.030);
    return e;
  }
  removeEgg(id) {
    for (let i = 0; i < this.eggs.length; i++) {
      if (this.eggs[i].id === id) {
        this.eggs[i] = this.eggs[this.eggs.length - 1];
        this.eggs.pop();
        return true;
      }
    }
    return false;
  }
  eggCount() { return this.eggs.length; }

  /* ---------------- frame ---------------- */

  frame(nowMs) {
    if (!this.ok) return;
    if (!this._lastT) this._lastT = nowMs;
    let dt = (nowMs - this._lastT) / 1000;
    this._lastT = nowMs;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;

    this._acc += dt;
    const STEP = 1 / 60;
    let n = 0;
    while (this._acc >= STEP && n < 3) {
      this._step(STEP);
      this._acc -= STEP;
      n++;
    }
    if (n === 3) this._acc = 0;

    // push weather + clarity into the water shader and the koi
    this.water.gloom = this.gloom;
    this.water.clarity = this.clarity;
    if (this.koi) {
      this.koi.setRain(this.gloom);
      this.koi.setClarity(this.clarity);
    }
  }

  _step(dt) {
    this.time += dt;
    const water = this.water;
    const aspect = water.aspect;

    // ---- weather ----
    this._weatherT -= dt;
    if (this._weatherT <= 0) {
      if (this._weather === 'clear') {
        this._weather = 'rain';
        this._weatherT = 12 + this.rng() * 6;
      } else {
        this._weather = 'clear';
        this._weatherT = 30 + this.rng() * 25;
      }
    }
    const gloomT = this._weather === 'rain' ? 1 : 0;
    this.gloom += (gloomT - this.gloom) * Math.min(1, dt * 0.8);

    // rain drops: each one really disturbs the heightfield
    if (this._weather === 'rain') {
      this._dropAcc += dt * 26;
      while (this._dropAcc >= 1) {
        this._dropAcc -= 1;
        for (let k = 0; k < 10; k++) {
          const nx = 0.12 + this.rng() * 0.76;
          const ny = 0.10 + this.rng() * 0.72;
          if (water.pondInfo(nx, ny, aspect)[0] > 0.7) {
            water.disturb(nx, ny, 1.4, 0.35 + this.rng() * 0.45);
            if (this.rng() < 0.35) this._spawnRing(nx, ny, 0.016 + this.rng() * 0.010);
            break;
          }
        }
      }
      this.clarity = Math.min(1, this.clarity + dt * 0.02); // rain freshens
    }
    // clarity drifts back toward a healthy 0.8
    this.clarity += (0.8 - this.clarity) * Math.min(1, dt * 0.02);

    // ---- lily pads ----
    for (let i = 0; i < this.pads.length; i++) {
      const p = this.pads[i];
      p.driftA += dt * p.driftV;
      p.nx = p.bx + Math.cos(p.driftA) * p.driftR;
      p.ny = p.by + Math.sin(p.driftA * 0.8) * p.driftR;
      p.rot += dt * p.rotV;
      // lotus open/close follows the day phase (morning open, dusk closed),
      // or the systems override (phase 5: real day/night cycle)
      const dp = this.dayPhase;
      const openT = this._lotusOverride != null ? this._lotusOverride :
        pondClamp((dp - 0.05) / 0.20, 0, 1) * (1 - pondClamp((dp - 0.75) / 0.20, 0, 1));
      p.open += (openT - p.open) * Math.min(1, dt * 0.5);
    }

    // ---- eggs (phase 5: age; hatching is driven by Systems) ----
    for (let i = 0; i < this.eggs.length; i++) this.eggs[i].t += dt;

    // ---- pellets ----
    for (let i = this._pellets.length - 1; i >= 0; i--) {
      const q = this._pellets[i];
      q.age += dt;
      // gentle drift + separation
      q.nx += q.vx * dt; q.ny += q.vy * dt;
      q.vx *= (1 - dt * 0.6); q.vy *= (1 - dt * 0.6);
      for (let j = 0; j < this._pellets.length; j++) {
        if (j === i) continue;
        const o = this._pellets[j];
        const dx = q.nx - o.nx, dy = (q.ny - o.ny) * aspect;
        const d2 = dx * dx + dy * dy;
        if (d2 < 0.0004 && d2 > 1e-10) {
          const d = Math.sqrt(d2);
          q.vx += dx / d * dt * 0.02; q.vy += dy / d * dt * 0.02 / aspect;
        }
      }
      if (q.age >= q.life) {
        // sank uneaten: water gets a little murkier
        this._pellets[i] = this._pellets[this._pellets.length - 1];
        this._pellets.pop();
        this.clarity = Math.max(0, this.clarity - 0.02 * this.murkScale);
      }
    }

    // ---- petals ----
    this._petalT -= dt;
    if (this._petalT <= 0 && this.petals.length < POND_PETAL_MAX) {
      this._petalT = 5 + this.rng() * 5;
      this.petals.push({
        nx: 0.15 + this.rng() * 0.7, ny: -0.04,
        vx: (this.rng() - 0.5) * 0.01, vy: 0.028 + this.rng() * 0.014,
        rot: this.rng() * 6.28, rotV: (this.rng() - 0.5) * 1.2,
        sway: this.rng() * 6.28, state: 'fall', age: 0, life: 26,
        tint: this.rng(),
      });
    }
    for (let i = this.petals.length - 1; i >= 0; i--) {
      const pt = this.petals[i];
      pt.age += dt;
      pt.sway += dt * 2.2;
      if (pt.state === 'fall') {
        pt.nx += (pt.vx + (this.reducedMotion ? 0 : Math.sin(pt.sway) * 0.012)) * dt;
        pt.ny += pt.vy * dt;
        pt.rot += pt.rotV * dt;
        if (water.pondInfo(pt.nx, pt.ny, aspect)[0] > 0.5) {
          pt.state = 'float';
          pt.age = 0;
          water.disturb(pt.nx, pt.ny, 1.8, 0.5); // petal kiss ripple
          this._spawnRing(pt.nx, pt.ny, 0.020);
        } else if (pt.ny > 1.05) {
          this.petals[i] = this.petals[this.petals.length - 1];
          this.petals.pop();
        }
      } else {
        // float: gentle current with a slow curl, stays near the pond
        // reduced motion: no curl, just the still current
        const cxp = 0.5 - pt.nx, cyp = 0.52 - pt.ny;
        const rm = this.reducedMotion;
        pt.vx += ((rm ? 0 : Math.sin(pt.sway * 0.6) * 0.0016) + cxp * 0.004) * dt * 60 * 0.016;
        pt.vy += ((rm ? 0 : Math.cos(pt.sway * 0.5) * 0.0012) + cyp * 0.004) * dt * 60 * 0.016;
        pt.vx *= (1 - dt * 1.2); pt.vy *= (1 - dt * 1.2);
        pt.nx += pt.vx * dt; pt.ny += pt.vy * dt;
        pt.rot += pt.rotV * 0.3 * dt;
        if (pt.age > pt.life) {
          this.petals[i] = this.petals[this.petals.length - 1];
          this.petals.pop();
        }
      }
    }

    // ---- rings ----
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t >= r.life) {
        this.rings[i] = this.rings[this.rings.length - 1];
        this.rings.pop();
      }
    }
  }

  /* ---------------- koi wiring ---------------- */

  _padObstacles() {
    const out = [];
    for (let i = 0; i < this.pads.length; i++) {
      const p = this.pads[i];
      out.push({
        x: p.nx - 0.5,
        y: (p.ny - 0.5) * this.water.aspect,
        r: p.r * 1.25,
      });
    }
    return out;
  }

  _pelletFood() {
    const out = [];
    for (let i = 0; i < this._pellets.length; i++) {
      const q = this._pellets[i];
      if (q.age > q.life - 2) continue; // sinking: not worth chasing
      out.push({
        x: q.nx - 0.5,
        y: (q.ny - 0.5) * this.water.aspect,
        r: q.r, id: q.id,
      });
    }
    return out;
  }

  _eatPellet(p) {
    for (let i = 0; i < this._pellets.length; i++) {
      if (this._pellets[i].id === p.id) {
        const q = this._pellets[i];
        this._pellets[i] = this._pellets[this._pellets.length - 1];
        this._pellets.pop();
        // plip: tiny ripple + ring, the payoff pop
        this.water.disturb(q.nx, q.ny, 2.0, 0.8);
        this._spawnRing(q.nx, q.ny, 0.022);
        return;
      }
    }
  }

  _spawnRing(nx, ny, maxR) {
    if (this.rings.length >= POND_RING_MAX) return;
    this.rings.push({ nx, ny, t: 0, life: 0.55, maxR });
  }

  /* ---------------- pads ---------------- */

  _spawnPads() {
    const water = this.water;
    const aspect = water.aspect;
    let guard = 0;
    while (this.pads.length < POND_PAD_COUNT && guard++ < 200) {
      const nx = 0.18 + this.rng() * 0.64;
      const ny = 0.16 + this.rng() * 0.62;
      if (water.pondInfo(nx, ny, aspect)[0] < 0.82) continue;
      let okSpot = true;
      for (let i = 0; i < this.pads.length; i++) {
        const dx = this.pads[i].nx - nx, dy = (this.pads[i].ny - ny) * aspect;
        if (dx * dx + dy * dy < 0.028) { okSpot = false; break; }
      }
      if (!okSpot) continue;
      const hasFlower = (this.pads.length === 1 || this.pads.length === 4);
      this.pads.push({
        bx: nx, by: ny, nx, ny,
        r: 0.045 + this.rng() * 0.035,
        rot: this.rng() * 6.28, rotV: (this.rng() - 0.5) * 0.05,
        driftA: this.rng() * 6.28, driftV: (this.rng() - 0.5) * 0.02,
        driftR: 0.004 + this.rng() * 0.008,
        flower: hasFlower, open: 0,
        seed: (this.rng() * 1e9) | 0,
      });
    }
  }

  /* ---------------- surface drawing ---------------- */

  // write a rotated quad (2 tris) into the surface buffer; returns new offset
  _quad(o, cx, cy, w, h, ang, tiltX, tiltY, r, g, b, a) {
    const buf = this._surfBuf;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const hw = w / 2, hh = h / 2;
    const corners = [[-hw, -hh, 0, 0], [hw, -hh, 1, 0], [hw, hh, 1, 1], [-hw, hh, 0, 1]];
    const px = [], py = [];
    for (let i = 0; i < 4; i++) {
      const lx = corners[i][0], ly = corners[i][1];
      const rx = lx * ca - ly * sa, ry = lx * sa + ly * ca;
      px[i] = cx + rx;
      py[i] = cy + ry + (rx * tiltX + ry * tiltY);
    }
    const idx = [0, 1, 2, 0, 2, 3];
    for (let i = 0; i < 6; i++) {
      const c = idx[i];
      buf[o++] = px[c]; buf[o++] = py[c];
      buf[o++] = corners[c][2]; buf[o++] = corners[c][3];
      buf[o++] = r; buf[o++] = g; buf[o++] = b; buf[o++] = a;
    }
    return o;
  }

  _drawSurface(surf) {
    const water = this.water;
    const aspect = water.aspect;
    const buf = this._surfBuf;
    let o;

    const bobOf = (nx, ny) => water.heightAt(nx, ny) * 0.012;
    const tiltOf = (nx, ny, out) => {
      const e = 0.006;
      out[0] = (water.heightAt(nx + e, ny) - water.heightAt(nx - e, ny)) / (2 * e) * 0.010;
      out[1] = (water.heightAt(nx, ny + e) - water.heightAt(nx, ny - e)) / (2 * e) * 0.010;
    };
    const tilt = [0, 0];
    const roundH = (r) => r / aspect; // UV circle → screen-round

    // petals (under pads); kind 1 = maple leaves, tinted red via vertex color
    o = 0;
    for (let i = 0; i < this.petals.length; i++) {
      const pt = this.petals[i];
      const fade = pt.state === 'float' && pt.age > pt.life - 3
        ? Math.max(0, (pt.life - pt.age) / 3) : 1;
      const isLeaf = pt.kind === 1;
      const s = isLeaf ? 0.021 : 0.016;
      const tint = pt.tint;
      const cr = isLeaf ? 0.90 : 1, cg = isLeaf ? 0.30 : 0.75 + tint * 0.2, cb = isLeaf ? 0.16 : 0.80 + tint * 0.15;
      o = this._quad(o, pt.nx, pt.ny + bobOf(pt.nx, pt.ny), s, s * 0.7 / aspect * 2, pt.rot,
        0, 0, cr, cg, cb, 0.75 * fade);
    }
    if (o > 0) surf.tris(this._texPetal, buf, o / 8);

    // pad shadows (soft dark ellipses, slightly offset down-sun)
    o = 0;
    for (let i = 0; i < this.pads.length; i++) {
      const p = this.pads[i];
      const s = p.r * 2.15;
      o = this._quad(o, p.nx + 0.006, p.ny + 0.009, s, roundH(s), 0, 0, 0, 0.05, 0.10, 0.10, 0.30);
    }
    if (o > 0) surf.tris(this._texPadShadow, buf, o / 8);

    // lily pads
    o = 0;
    for (let i = 0; i < this.pads.length; i++) {
      const p = this.pads[i];
      tiltOf(p.nx, p.ny, tilt);
      const by = p.ny + bobOf(p.nx, p.ny);
      const s = p.r * 2;
      o = this._quad(o, p.nx, by, s, roundH(s), p.rot, tilt[0], tilt[1], 1, 1, 1, 1);
    }
    if (o > 0) surf.tris(this._texPad, buf, o / 8);

    // lotus flowers (bud shrinking as bloom opens)
    o = 0;
    let ob = 0;
    for (let i = 0; i < this.pads.length; i++) {
      const p = this.pads[i];
      if (!p.flower) continue;
      const fx = p.nx + p.r * 0.3, fy = p.ny - p.r * 0.25 + bobOf(p.nx, p.ny);
      const bs = 0.030 * (1 - p.open) + 0.004;
      if (bs > 0.006) {
        ob = this._quad(ob, fx, fy, bs, bs / aspect, 0, 0, 0, 1, 1, 1, 1);
      }
      const fs2 = 0.075 * p.open;
      if (fs2 > 0.006) {
        o = this._quad(o, fx, fy, fs2, fs2 / aspect, p.rot * 0.3, 0, 0, 1, 1, 1, 1);
      }
    }
    if (ob > 0) surf.tris(this._texBud, buf, ob / 8);
    if (o > 0) surf.tris(this._texBloom, buf, o / 8);

    // eggs (phase 5): amber glow, gently pulsing, resting on the pads
    o = 0;
    for (let i = 0; i < this.eggs.length; i++) {
      const e = this.eggs[i];
      const pulse = 0.75 + 0.25 * Math.sin(this.time * 4 + e.id * 1.7);
      const s = 0.026 * pulse;
      o = this._quad(o, e.nx, e.ny + bobOf(e.nx, e.ny), s, roundH(s), 0, 0, 0,
        1, 0.82, 0.45, 0.95);
    }
    if (o > 0) surf.tris(this._texEgg, buf, o / 8);

    // food pellets
    o = 0;
    for (let i = 0; i < this._pellets.length; i++) {
      const q = this._pellets[i];
      const sink = q.age > q.life - 2 ? Math.max(0, (q.life - q.age) / 2) : 1;
      const s = q.r * 2 * (0.6 + 0.4 * sink);
      o = this._quad(o, q.nx, q.ny + bobOf(q.nx, q.ny), s, roundH(s), 0, 0, 0,
        1, 1, 1, sink);
    }
    if (o > 0) surf.tris(this._texPellet, buf, o / 8);

    // expanding ripple rings (rain drops, plops, petal kisses)
    o = 0;
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      const t = r.t / r.life;
      const s = r.maxR * (0.25 + 0.75 * t) * 2;
      o = this._quad(o, r.nx, r.ny, s, roundH(s), 0, 0, 0, 1, 1, 1, 0.42 * (1 - t));
    }
    if (o > 0) surf.tris(this._texRing, buf, o / 8);
  }

  /* ---------------- procedural textures ---------------- */

  _texFromCanvas(gl, c) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
    return tex;
  }

  _makePadTexture(gl) {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const x = c.getContext('2d');
    const r = mulberry32(this.seed + 101);
    // pad body: radial green, darker rim
    const g = x.createRadialGradient(S/2, S/2, 4, S/2, S/2, S/2);
    g.addColorStop(0, '#4a7c43');
    g.addColorStop(0.55, '#3d6b38');
    g.addColorStop(0.85, '#2e552b');
    g.addColorStop(1, '#24421f');
    x.fillStyle = g;
    x.beginPath(); x.arc(S/2, S/2, S/2 - 1, 0, 6.2832); x.fill();
    // radial veins
    x.strokeStyle = 'rgba(20,40,18,0.35)';
    x.lineWidth = 1.4;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + r() * 0.1;
      x.beginPath();
      x.moveTo(S/2 + Math.cos(a) * 6, S/2 + Math.sin(a) * 6);
      x.lineTo(S/2 + Math.cos(a) * (S/2 - 3), S/2 + Math.sin(a) * (S/2 - 3));
      x.stroke();
    }
    // lighter center star
    x.fillStyle = 'rgba(140,190,120,0.25)';
    x.beginPath(); x.arc(S/2, S/2, 9, 0, 6.2832); x.fill();
    // top-light sheen
    const sg = x.createRadialGradient(S*0.38, S*0.34, 2, S*0.38, S*0.34, S*0.42);
    sg.addColorStop(0, 'rgba(255,255,240,0.16)');
    sg.addColorStop(1, 'rgba(255,255,240,0)');
    x.fillStyle = sg;
    x.beginPath(); x.arc(S/2, S/2, S/2 - 1, 0, 6.2832); x.fill();
    // the signature wedge notch
    x.globalCompositeOperation = 'destination-out';
    x.beginPath();
    x.moveTo(S/2, S/2);
    x.arc(S/2, S/2, S/2, -0.30, 0.30);
    x.closePath(); x.fill();
    x.globalCompositeOperation = 'source-over';
    return this._texFromCanvas(gl, c);
  }

  _makeShadowTexture(gl) {
    const S = 64;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(S/2, S/2, 2, S/2, S/2, S/2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    return this._texFromCanvas(gl, c);
  }

  _makePetalTexture(gl) {
    const W = 64, H = 44;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(W/2, H/2, 2, W/2, H/2, W/2);
    g.addColorStop(0, '#ffe9f0');
    g.addColorStop(0.6, '#f6c3d4');
    g.addColorStop(1, '#e89bb8');
    x.fillStyle = g;
    x.beginPath(); x.ellipse(W/2, H/2, W/2 - 2, H/2 - 2, 0, 0, 6.2832); x.fill();
    x.strokeStyle = 'rgba(190,110,140,0.5)';
    x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(W/2, 4); x.quadraticCurveTo(W/2 + 3, H/2, W/2, H - 4); x.stroke();
    return this._texFromCanvas(gl, c);
  }

  _makePelletTexture(gl) {
    const S = 32;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(S*0.38, S*0.34, 1, S/2, S/2, S/2);
    g.addColorStop(0, '#a97e4f');
    g.addColorStop(0.6, '#7d5a34');
    g.addColorStop(1, '#4e3820');
    x.fillStyle = g;
    x.beginPath(); x.arc(S/2, S/2, S/2 - 1, 0, 6.2832); x.fill();
    return this._texFromCanvas(gl, c);
  }

  _makeRingTexture(gl) {
    const S = 64;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const x = c.getContext('2d');
    x.strokeStyle = 'rgba(255,255,255,0.9)';
    x.lineWidth = 3;
    x.beginPath(); x.arc(S/2, S/2, S/2 - 6, 0, 6.2832); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.35)';
    x.lineWidth = 7;
    x.beginPath(); x.arc(S/2, S/2, S/2 - 6, 0, 6.2832); x.stroke();
    return this._texFromCanvas(gl, c);
  }

  _makeEggTexture(gl) {
    const S = 48;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(S/2, S/2, 1, S/2, S/2, S/2);
    g.addColorStop(0, '#fff3d0');
    g.addColorStop(0.45, '#f7c96b');
    g.addColorStop(0.8, 'rgba(230,150,60,0.35)');
    g.addColorStop(1, 'rgba(230,150,60,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(S/2, S/2, S/2, 0, 6.2832); x.fill();
    return this._texFromCanvas(gl, c);
  }

  _makeBudTexture(gl) {
    const S = 48;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, S, 0, 0);
    g.addColorStop(0, '#8e4a63');
    g.addColorStop(0.6, '#d78ba5');
    g.addColorStop(1, '#f7d3de');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(S/2, 3);
    x.quadraticCurveTo(S - 4, S*0.55, S/2, S - 3);
    x.quadraticCurveTo(4, S*0.55, S/2, 3);
    x.fill();
    x.strokeStyle = 'rgba(140,70,95,0.6)';
    x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(S/2, 6); x.quadraticCurveTo(S/2 + 2, S*0.55, S/2, S - 5); x.stroke();
    return this._texFromCanvas(gl, c);
  }

  _makeBloomTexture(gl) {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const x = c.getContext('2d');
    const r = mulberry32(this.seed + 202);
    const petal = (ang, len, wid, col0, col1) => {
      x.save();
      x.translate(S/2, S/2); x.rotate(ang);
      const g = x.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, col0); g.addColorStop(1, col1);
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(0, 0);
      x.quadraticCurveTo(len * 0.5, -wid, len, 0);
      x.quadraticCurveTo(len * 0.5, wid, 0, 0);
      x.fill();
      x.restore();
    };
    // outer ring: 8 petals
    for (let i = 0; i < 8; i++) {
      petal((i / 8) * Math.PI * 2 + r() * 0.06, S*0.46, S*0.13, '#f9dce6', '#e79fb9');
    }
    // inner ring: 8 petals, offset
    for (let i = 0; i < 8; i++) {
      petal(((i + 0.5) / 8) * Math.PI * 2, S*0.33, S*0.11, '#fdf0f4', '#f0b9cb');
    }
    // heart: 5 small upright petals + golden center
    for (let i = 0; i < 5; i++) {
      petal((i / 5) * Math.PI * 2 + 0.3, S*0.20, S*0.09, '#fff5f8', '#f6c9d8');
    }
    x.fillStyle = '#f2c14e';
    x.beginPath(); x.arc(S/2, S/2, S*0.055, 0, 6.2832); x.fill();
    x.fillStyle = '#d9962f';
    x.beginPath(); x.arc(S/2, S/2, S*0.03, 0, 6.2832); x.fill();
    return this._texFromCanvas(gl, c);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PondLife };
}
