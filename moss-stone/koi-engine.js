/* KoiEngine — Moss & Stone phase 2.
 * Procedural koi (seeded pattern textures, ribbon bodies with traveling
 * sine wiggle, fluttering fins) with boids-lite behavior + personalities,
 * rendered into the water engine's underwater layer so the surface shader
 * refracts them under ripples. Vanilla JS + WebGL2, no libraries.
 *
 * Sim runs in isotropic "pond space": px = nx - 0.5, py = (ny - 0.5) * aspect.
 * Fixed 60Hz timestep, clamped dt, mulberry32 PRNG, zero per-frame allocations.
 */
'use strict';

var KOI_SEG = 25;      // body rows (row 0 = nose)
var KOI_MAX = 12;      // preallocated capacity

var KOI_PERSONAS = {
  bold:    { maxSpeed: 0.075, cruise: 0.042, turn: 1.7, wander: 0.9, follow: 1.0, fleeR: 0.10, depth: [0.15, 0.45], startle: 0.55, size: 1.00 },
  shy:     { maxSpeed: 0.045, cruise: 0.026, turn: 1.2, wander: 0.6, follow: 0.0, fleeR: 0.17, depth: [0.55, 0.85], startle: 1.45, size: 0.85 },
  playful: { maxSpeed: 0.060, cruise: 0.036, turn: 2.3, wander: 1.2, follow: 0.8, fleeR: 0.06, depth: [0.25, 0.60], startle: 0.80, size: 0.90 },
};
var KOI_STYLES = [0, 1, 2, 0, 2, 1, 0, 2, 1, 0, 2, 1]; // kohaku, tancho, sanke…

function koiClamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function koiNormAng(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

class KoiEngine {
  constructor(water, opts) {
    opts = opts || {};
    this.water = water;
    this.seed = opts.seed == null ? 777 : opts.seed;
    this.rng = mulberry32(this.seed);
    this.count = Math.min(KOI_MAX, opts.count || 8);
    this.ok = false;

    this.koi = [];
    this.time = 0;
    this._acc = 0;
    this._lastT = 0;
    this._aspect = 1;
    this._cx = 0; this._cy = 0; // pond center in pond space

    this.pointer = { x: 0, y: 0, active: false, t: -99 };

    // phase 3 hooks (set by PondLife)
    this._avoidFn = null;  // () => [{x, y, r}] in pond space — lily pads
    this._foodFn = null;   // () => [{x, y, r, id}] in pond space — pellets
    this.onEat = null;     // (pellet) => void
    this._clarity = 1;     // 0 murky → 1 clear: hazes koi rendering
    this._rain = 0;        // 0..1 rain intensity: koi get livelier

    // phase 5 hooks (set by Systems)
    this._threat = null;   // {x, y} in pond space — heron: hide deep and slow
    this._nightF = 0;      // 0..1 night: everyone slows down
    this.onKoiEat = null;  // (koi, pellet) => void — feeding credit
    this._koiId = 0;

    // GL handles
    this._texFin = null;
    this._texShadow = null;

    // scratch buffers (preallocated, reused every frame)
    this._bodyBuf = [];
    for (let k = 0; k < KOI_MAX; k++) this._bodyBuf.push(new Float32Array(KOI_SEG * 2 * 8));
    this._finBuf = new Float32Array(KOI_MAX * 15 * 8);
    this._shadowBuf = new Float32Array(KOI_MAX * 6 * 8);
    this._row = new Float32Array(KOI_SEG * 5); // cx,cy,px,py,hw per body row
  }

  /* ---------------- init ---------------- */

  init() {
    const water = this.water;
    if (!water || !water.ok) return false;
    this._aspect = water.aspect;
    this._cy = 0.02 * this._aspect;

    const gl = water.uw.gl;
    this._texFin = this._makeFlatTexture(gl);
    this._texShadow = this._makeShadowTexture(gl);

    // spawn: shuffled personas + styles, spread around the pond
    const personas = ['bold', 'bold', 'bold', 'shy', 'shy', 'shy', 'playful', 'playful', 'bold', 'shy', 'playful', 'bold'];
    for (let i = personas.length - 1; i > 0; i--) {
      const j = (this.rng() * (i + 1)) | 0;
      const t = personas[i]; personas[i] = personas[j]; personas[j] = t;
    }
    for (let i = 0; i < this.count; i++) {
      const key = personas[i % personas.length];
      this.koi.push(this._makeKoi({
        persona: key,
        style: KOI_STYLES[i % KOI_STYLES.length],
        growthT: 0.55, // juveniles: the player watches them grow up
      }));
    }

    const self = this;
    water.onUnderwater = function (uw) { self._drawUnderwater(uw); };
    this.ok = true;
    return true;
  }

  /* ---------------- phase 5: koi construction / lifecycle ---------------- */

  // Build one koi object. o: {persona, style, patternSeed, x, y, heading, size,
  // growthT, age, meals, fedT, contentment, name, id, angle, rad}
  _makeKoi(o) {
    o = o || {};
    const gl = this.water.uw.gl;
    const pkey = o.persona || 'playful';
    const P = KOI_PERSONAS[pkey] || KOI_PERSONAS.playful;
    const style = o.style == null ? 0 : o.style;
    const id = o.id != null ? o.id : ++this._koiId;
    // unique pattern per koi: same style ≠ same fish (phase 5: "every koi is one of a kind")
    const patternSeed = o.patternSeed == null
      ? (((this.seed ^ (style * 7919 + 13) ^ Math.imul(id, 2654435761)) >>> 0))
      : (o.patternSeed >>> 0);
    const a = o.angle != null ? o.angle : this.rng() * Math.PI * 2;
    const rr = o.rad != null ? o.rad : 0.08 + this.rng() * 0.20;
    const size = o.size != null ? o.size : (0.120 + this.rng() * 0.035) * P.size;
    const texInfo = this._makePatternTexture(gl, style, patternSeed);
    const k = {
      id: id,
      name: o.name || null,
      x: o.x != null ? o.x : Math.cos(a) * rr,
      y: o.y != null ? o.y : this._cy + Math.sin(a) * rr,
      heading: o.heading != null ? o.heading : this.rng() * Math.PI * 2,
      speed: P.cruise * (0.5 + this.rng() * 0.5),
      depth: P.depth[0] + this.rng() * (P.depth[1] - P.depth[0]),
      depthT: 0, state: 'forage', stateT: 2 + this.rng() * 4,
      phase: this.rng() * Math.PI * 2,
      wakeT: this.rng() * 0.12,
      persona: P, pkey: pkey,
      size: size,
      style: style, patternSeed: patternSeed,
      tex: texInfo.tex, patternCanvas: texInfo.canvas,
      orbitA: this.rng() * Math.PI * 2,
      wx1: 0.35 + this.rng() * 0.5, wx2: 0.9 + this.rng() * 0.9,
      wp1: this.rng() * 6.28, wp2: this.rng() * 6.28,
      seed: (this.rng() * 1e9) | 0,
      // phase 5: life state
      growthT: o.growthT != null ? o.growthT : 1,
      age: o.age || 0,
      meals: o.meals || 0,
      fedT: o.fedT != null ? o.fedT : -9999,
      contentment: o.contentment != null ? o.contentment : 0.6,
      fedBoost: 0,
      hold: null,   // ascension ceremony: drift to this pond-space point
      courtship: false, // phase 5: well-fed adults may snuggle (relaxed separation)
      _eff: size,   // effective render size (growth-scaled), refreshed per frame
    };
    k.depthT = k.depth;
    return k;
  }

  // Spawn a koi (fry from eggs, restored from saves). Returns koi or null if full.
  spawnKoi(o) {
    if (this.koi.length >= KOI_MAX) return null;
    const k = this._makeKoi(o);
    this.koi.push(k);
    return k;
  }

  removeKoi(id) {
    const gl = this.water.uw.gl;
    for (let i = 0; i < this.koi.length; i++) {
      if (this.koi[i].id === id) {
        try { gl.deleteTexture(this.koi[i].tex); } catch (e) {}
        this.koi.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  koiById(id) {
    for (let i = 0; i < this.koi.length; i++) if (this.koi[i].id === id) return this.koi[i];
    return null;
  }

  // heron threat: {x, y} in pond space, or null to clear
  setThreat(x, y) { this._threat = (x == null) ? null : { x: x, y: y }; }
  setNightF(v) { this._nightF = koiClamp(v, 0, 1); }

  serialize() {
    return this.koi.map(function (k) {
      return {
        id: k.id, name: k.name, patternSeed: k.patternSeed, style: k.style, pkey: k.pkey,
        x: +k.x.toFixed(4), y: +k.y.toFixed(4), heading: +k.heading.toFixed(3),
        size: +k.size.toFixed(4), growthT: +k.growthT.toFixed(3), age: Math.round(k.age),
        meals: k.meals, contentment: +k.contentment.toFixed(3), fedT: Math.round(k.fedT),
      };
    });
  }

  deserialize(arr) {
    const gl = this.water.uw.gl;
    for (let i = 0; i < this.koi.length; i++) {
      try { gl.deleteTexture(this.koi[i].tex); } catch (e) {}
    }
    this.koi.length = 0;
    this._koiId = 0;
    if (!arr) return true;
    for (let i = 0; i < arr.length; i++) {
      const k = this._makeKoi(arr[i]);
      if (k.id > this._koiId) this._koiId = k.id;
      this.koi.push(k);
    }
    return true;
  }

  /* ---------------- public API ---------------- */

  // nx, ny in 0..1 screen UV (y down)
  setPointer(nx, ny, active) {
    this.pointer.x = nx - 0.5;
    this.pointer.y = (ny - 0.5) * this._aspect;
    this.pointer.active = !!active;
    if (active) this.pointer.t = this.time;
  }

  // big splash startles nearby koi (also called on hard taps)
  splash(nx, ny, strength) {    const sx = nx - 0.5, sy = (ny - 0.5) * this._aspect;
    if (strength < 1.2) return;
    for (let i = 0; i < this.koi.length; i++) {
      const k = this.koi[i];
      const dx = k.x - sx, dy = k.y - sy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.28) {
        k.state = 'startle';
        k.stateT = 0.7 + this.rng() * 0.4;
        k.heading = Math.atan2(dy, dx) + (this.rng() - 0.5) * 0.5;
        k.speed = k.persona.maxSpeed * 2.2 * k.persona.startle;
      }
    }
  }

  /* ---------------- phase 3: pond-life hooks ---------------- */

  // avoidFn: () => [{x, y, r}] in pond space (lily pads)
  setAvoid(fn) { this._avoidFn = fn; }
  // foodFn: () => [{x, y, r, id}] in pond space (pellets)
  setFood(fn) { this._foodFn = fn; }
  // clarity 0..1: hazes koi rendering when water is murky
  setClarity(c) { this._clarity = koiClamp(c, 0, 1); }
  // rain 0..1: koi get slightly livelier
  setRain(v) { this._rain = koiClamp(v, 0, 1); }

  _foodList() {
    if (!this._foodFn) return null;
    const f = this._foodFn();
    return (f && f.length) ? f : null;
  }

  /* ---------------- simulation ---------------- */

  frame(nowMs) {
    if (!this.ok) return;
    // keep pond-space mapping in sync with the water engine (resize-safe)
    this._aspect = this.water.aspect;
    this._cy = 0.02 * this._aspect;
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

    this._buildVerts();
  }

  _pickState(k) {
    const r = this.rng();
    const P = k.persona;
    if (k.state === 'startle') {
      k.state = 'forage'; k.stateT = 3 + r * 4;
      k.depthT = P.depth[0] + r * (P.depth[1] - P.depth[0]);
      return;
    }
    // food in the water beats idleness
    if (this._foodList()) {
      k.state = 'feed'; k.stateT = 2.5;
      k.depthT = P.depth[0];
      return;
    }
    if (r < 0.55) {
      k.state = 'forage'; k.stateT = 4 + r * 8;
      k.depthT = P.depth[0] + this.rng() * (P.depth[1] - P.depth[0]);
    } else if (r < 0.8) {
      k.state = 'glide'; k.stateT = 2.5 + r * 3;
      k.depthT = P.depth[0];
    } else {
      k.state = 'rest'; k.stateT = 3 + r * 4;
      k.depthT = Math.min(0.9, P.depth[1] + 0.15);
    }
  }

  _step(dt) {
    this.time += dt;
    const ks = this.koi, n = ks.length;
    const water = this.water;
    const pt = this.pointer;
    const pActive = pt.active || (this.time - pt.t < 1.5);

    // centroid for gentle cohesion
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { cx += ks[i].x; cy += ks[i].y; }
    cx /= n; cy /= n;

    for (let i = 0; i < n; i++) {
      const k = ks[i], P = k.persona;
      k.stateT -= dt;
      if (k.stateT <= 0) this._pickState(k);

      // base wander (smooth noise)
      const wob = Math.sin(this.time * k.wx1 + k.wp1) + 0.6 * Math.sin(this.time * k.wx2 + k.wp2);
      let fx = Math.cos(k.heading + wob * 0.55 * P.wander);
      let fy = Math.sin(k.heading + wob * 0.55 * P.wander);
      let tgtS = P.cruise * (k.state === 'glide' ? 1.5 : k.state === 'rest' ? 0.22 : 1.0);

      if (k.state !== 'startle') {
        // separation
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const o = ks[j];
          const dx = k.x - o.x, dy = k.y - o.y;
          const d2 = dx * dx + dy * dy;
          // courtship (phase 5): well-fed adults may snuggle close
          const sepR = (k.size + o.size) * 0.85 * ((k.courtship && o.courtship) ? 0.25 : 1);
          if (d2 < sepR * sepR && d2 > 1e-8) {
            const d = Math.sqrt(d2);
            const f = (sepR - d) / sepR * 2.4;
            fx += dx / d * f; fy += dy / d * f;
          }
        }
        // gentle cohesion
        fx += (cx - k.x) * 0.30; fy += (cy - k.y) * 0.30;

        // pond-edge avoidance (look ahead along heading)
        const look = 0.09 + k.speed * 1.4;
        const lx = k.x + Math.cos(k.heading) * look;
        const ly = k.y + Math.sin(k.heading) * look;
        const m = water.pondInfo(lx + 0.5, ly / this._aspect + 0.5)[0];
        if (m < 0.55) {
          const push = (0.55 - m) * 7.0;
          fx += (this._cx - k.x) * push; fy += (this._cy - k.y) * push;
        }

        // lily-pad avoidance (phase 3)
        const av = this._avoidFn ? this._avoidFn() : null;
        if (av) {
          for (let a = 0; a < av.length; a++) {
            const adx = k.x - av[a].x, ady = k.y - av[a].y;
            const rr = av[a].r + k.size * 0.45;
            const ad2 = adx * adx + ady * ady;
            if (ad2 < rr * rr && ad2 > 1e-8) {
              const ad = Math.sqrt(ad2);
              const af = (rr - ad) / rr * 3.0;
              fx += adx / ad * af; fy += ady / ad * af;
            }
          }
        }

        // finger: bold/playful approach + slow orbit, shy keep away
        if (pActive) {
          const dx = pt.x - k.x, dy = pt.y - k.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 0.30 && d > 1e-4) {
            if (P.follow > 0) {
              k.orbitA += dt * 0.55;
              const so = 0.085; // standoff distance
              const tx = pt.x + Math.cos(k.orbitA) * so - k.x;
              const ty = pt.y + Math.sin(k.orbitA) * so - k.y;
              const wgt = P.follow * (d < so ? 0.35 : 1.0);
              fx += tx * 3.2 * wgt; fy += ty * 3.2 * wgt;
              const want = P.cruise * 1.25 * wgt;
              if (want > tgtS) tgtS = want;
            } else if (d < P.fleeR) {
              fx -= dx / d * 2.2; fy -= dy / d * 2.2;
              tgtS = P.maxSpeed * 0.9;
            }
          }
        }

        // food seeking (phase 3): nearest pellet wins over wandering
        const food = this._foodList();
        if (food) {
          let bi = -1, bd = 0.1225; // sense radius 0.35²
          for (let f = 0; f < food.length; f++) {
            const fdx = food[f].x - k.x, fdy = food[f].y - k.y;
            const fd2 = fdx * fdx + fdy * fdy;
            if (fd2 < bd) { bd = fd2; bi = f; }
          }
          if (bi >= 0) {
            const p = food[bi];
            const pdx = p.x - k.x, pdy = p.y - k.y;
            const pd = Math.sqrt(pdx * pdx + pdy * pdy) || 1e-4;
            const wgt = k.pkey === 'shy' ? 0.55 : 1.0;
            fx += pdx / pd * 3.0 * wgt; fy += pdy / pd * 3.0 * wgt;
            const want = P.cruise * 1.6;
            if (want > tgtS) tgtS = want;
            k.state = 'feed';
            if (k.stateT < 0.6) k.stateT = 0.6;
            if (pd < 0.020 + p.r) {
              if (this.onEat) this.onEat(p);
              if (this.onKoiEat) this.onKoiEat(k, p); // phase 5: feeding credit
              tgtS = P.cruise * 0.4; // pause and savor
              k.stateT = 1.2;
            }
          }
        }

        // heron threat: hide deep and slow (phase 5)
        if (this._threat) {
          const tdx = k.x - this._threat.x, tdy = k.y - this._threat.y;
          const td = Math.sqrt(tdx * tdx + tdy * tdy) || 1e-4;
          fx += tdx / td * 2.0; fy += tdy / td * 2.0;
          if (k.depthT < 0.8) k.depthT = 0.8;
          tgtS *= 0.45;
        }

        // rain livens everyone up a little (phase 3)
        tgtS *= (1 + 0.30 * this._rain);
        // night: everyone slows down (phase 5)
        tgtS *= (1 - 0.45 * this._nightF);
      } else {
        // startle: dart straight, ignore everything else
        fx = Math.cos(k.heading); fy = Math.sin(k.heading);
        tgtS = k.persona.maxSpeed * 2.2 * k.persona.startle;
      }

      // ascension hold: drift gently to the ceremony point (phase 5)
      if (k.hold) {
        const hx = k.hold.x - k.x, hy = k.hold.y - k.y;
        const hd = Math.sqrt(hx * hx + hy * hy) || 1e-4;
        fx = hx / hd * 3; fy = hy / hd * 3;
        tgtS = hd < 0.025 ? P.cruise * 0.12 : P.cruise * 0.9;
      }

      // turn toward desired heading (limited turn rate = graceful koi)
      const des = Math.atan2(fy, fx);
      const da = koiNormAng(des - k.heading);
      const maxTurn = P.turn * dt * (k.state === 'startle' ? 3.2 : 1);
      k.heading += koiClamp(da, -maxTurn, maxTurn);

      // ease speed, integrate
      k.speed += (tgtS - k.speed) * Math.min(1, dt * 2.4);
      k.x += Math.cos(k.heading) * k.speed * dt;
      k.y += Math.sin(k.heading) * k.speed * dt;

      // hard edge constraint: never leave the water
      const info = water.pondInfo(k.x + 0.5, k.y / this._aspect + 0.5);
      if (info[0] < 0.12) {
        k.x += (this._cx - k.x) * Math.min(1, dt * 5);
        k.y += (this._cy - k.y) * Math.min(1, dt * 5);
        k.heading = koiNormAng(Math.atan2(this._cy - k.y, this._cx - k.x) + (this.rng() - 0.5));
      }

      // depth easing
      k.depth += (k.depthT - k.depth) * Math.min(1, dt * 0.8);

      // swim wiggle phase: beat frequency rises with speed
      const speedN = koiClamp(k.speed / P.maxSpeed, 0, 1.6);
      k.phase += dt * (2.1 + speedN * 9.0);

      // tail wake → heightfield disturbance
      k.wakeT -= dt;
      if (k.wakeT <= 0) {
        k.wakeT = 0.12;
        if (k.speed > 0.014) {
          const tx = k.x - Math.cos(k.heading) * k.size * 0.55;
          const ty = k.y - Math.sin(k.heading) * k.size * 0.55;
          const s = 0.30 * speedN * (1 - k.depth * 0.55);
          water.disturb(tx + 0.5, ty / this._aspect + 0.5, 2.2, s);
        }
      }
    }
  }

  /* ---------------- pattern textures ---------------- */

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

  _makeFlatTexture(gl) {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 8, 8);
    return this._texFromCanvas(gl, c);
  }

  _makeShadowTexture(gl) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return this._texFromCanvas(gl, c);
  }

  _blob(x, cx, cy, rx, ry, color, seed) {
    // wobbly organic patch
    const r = mulberry32(seed);
    x.fillStyle = color;
    x.beginPath();
    const NPT = 10;
    for (let i = 0; i <= NPT; i++) {
      const a = (i / NPT) * Math.PI * 2;
      const w = 0.72 + r() * 0.55;
      const px = cx + Math.cos(a) * rx * w;
      const py = cy + Math.sin(a) * ry * w;
      if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.closePath(); x.fill();
  }

  // style: 0 kohaku (white + red), 1 tancho (white + crown spot), 2 sanke (white + red + black)
  // patternSeed: explicit seed so offspring blend parent patterns. Returns {tex, canvas}.
  _makePatternTexture(gl, style, patternSeed) {
    const W = 128, H = 64;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const r = mulberry32((patternSeed == null ? (this.seed ^ (style * 7919 + 13)) : patternSeed) >>> 0);

    // warm white base, slightly deeper toward the tail
    const g = x.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#faf7ee');
    g.addColorStop(0.5, '#f5f0e1');
    g.addColorStop(1, '#ece5cf');
    x.fillStyle = g; x.fillRect(0, 0, W, H);

    // soft spine shading (dorsal midline = v 0.5)
    const sg = x.createLinearGradient(0, H * 0.30, 0, H * 0.70);
    sg.addColorStop(0, 'rgba(110,100,80,0)');
    sg.addColorStop(0.5, 'rgba(110,100,80,0.22)');
    sg.addColorStop(1, 'rgba(110,100,80,0)');
    x.fillStyle = sg; x.fillRect(0, 0, W, H);

    const red = () => 'rgb(' + (182 + ((r() * 22) | 0)) + ',' + (44 + ((r() * 12) | 0)) + ',' + (24 + ((r() * 8) | 0)) + ')';
    const seedOf = () => (r() * 1e9) | 0;

    if (style === 0) { // kohaku
      const nP = 3 + ((r() * 3) | 0);
      for (let i = 0; i < nP; i++) {
        this._blob(x, W * (0.18 + r() * 0.64), H * (0.36 + r() * 0.28),
          9 + r() * 15, 6 + r() * 9, red(), seedOf());
      }
    } else if (style === 1) { // tancho: single crown spot on the head
      this._blob(x, W * (0.10 + r() * 0.06), H * 0.5, 7 + r() * 3.5, 7 + r() * 3.5, red(), seedOf());
    } else { // sanke
      const nR = 2 + ((r() * 3) | 0);
      for (let i = 0; i < nR; i++) {
        this._blob(x, W * (0.18 + r() * 0.62), H * (0.36 + r() * 0.28),
          8 + r() * 12, 5 + r() * 8, red(), seedOf());
      }
      const nB = 2 + ((r() * 2) | 0);
      for (let i = 0; i < nB; i++) {
        this._blob(x, W * (0.15 + r() * 0.65), H * (0.34 + r() * 0.32),
          5 + r() * 8, 4 + r() * 6, '#26262c', seedOf());
      }
    }

    // faint speckle for organic feel
    for (let i = 0; i < 260; i++) {
      x.fillStyle = r() < 0.5 ? 'rgba(90,80,60,0.05)' : 'rgba(255,255,255,0.06)';
      x.fillRect(r() * W, r() * H, 1.4, 1.4);
    }
    return { tex: this._texFromCanvas(gl, c), canvas: c };
  }

  /* ---------------- vertex building ---------------- */

  // body row t (0 nose → 1 tail): writes cx,cy,perpx,perpy,halfwidth into this._row
  _bodyRows(k) {
    const row = this._row;
    const es = k._eff || k.size; // growth-scaled effective size (phase 5)
    const dx = Math.cos(k.heading), dy = Math.sin(k.heading);
    const nx = -dy, ny = dx;
    const speedN = koiClamp(k.speed / k.persona.maxSpeed, 0, 1.6);
    const amp = es * 0.17 * (0.22 + speedN * 1.65);
    for (let i = 0; i < KOI_SEG; i++) {
      const t = i / (KOI_SEG - 1);
      const along = (0.5 - t) * es;
      const wig = Math.sin(k.phase - t * 4.4) * Math.pow(t, 1.25);
      const cxp = k.x + dx * along + nx * wig * amp;
      const cyp = k.y + dy * along + ny * wig * amp;
      let wprof;
      if (t < 0.28) wprof = 0.42 + 0.58 * (t / 0.28);
      else wprof = Math.max(0.10, 1 - 0.92 * Math.pow((t - 0.28) / 0.72, 1.12));
      const hw = es * 0.165 * wprof;
      const o = i * 5;
      row[o] = cxp; row[o + 1] = cyp; row[o + 2] = nx; row[o + 3] = ny; row[o + 4] = hw;
    }
  }

  // pond-space → screen UV (y down)
  _toUV(px, py) { return [px + 0.5, py / this._aspect + 0.5]; }

  _buildVerts() {
    const aspect = this._aspect;
    let finN = 0, shN = 0;
    const fin = this._finBuf, sh = this._shadowBuf;

    for (let ki = 0; ki < this.koi.length; ki++) {
      const k = this.koi[ki];
      // phase 5: effective render size from growth (fry 0.45× → adult 1×)
      k._eff = k.size * (0.45 + 0.55 * (k.growthT == null ? 1 : k.growthT));
      const es = k._eff;
      this._bodyRows(k);
      const row = this._row;
      const buf = this._bodyBuf[ki];

      // depth tint: deeper koi sink into teal (kept subtle so patterns stay readable)
      // phase 3: murky water hazes the koi — dim + slight green shift + fade
      const dk = koiClamp(k.depth, 0, 1);
      const hz = 1 - this._clarity;
      const dim = (1 - dk * 0.15) * (1 - hz * 0.28);
      const tr = dim, tg = dim * (1 - dk * 0.07 + hz * 0.10), tb = dim * (1 - dk * 0.04 - hz * 0.12);
      const kAlpha = 1 - hz * 0.30;

      // body triangle strip
      for (let i = 0; i < KOI_SEG; i++) {
        const o = i * 5;
        const cxp = row[o], cyp = row[o + 1], nx = row[o + 2], ny = row[o + 3], hw = row[o + 4];
        const t = i / (KOI_SEG - 1);
        for (let s = 0; s < 2; s++) {
          const sg = s === 0 ? -1 : 1;
          const px = cxp + nx * hw * sg, py = cyp + ny * hw * sg;
          const uv = this._toUV(px, py);
          const vo = (i * 2 + s) * 8;
          buf[vo] = uv[0]; buf[vo + 1] = uv[1];
          buf[vo + 2] = t; buf[vo + 3] = s;
          buf[vo + 4] = tr; buf[vo + 5] = tg; buf[vo + 6] = tb; buf[vo + 7] = kAlpha;
        }
      }

      // ---- fins (batched) ----
      // pectoral fins at t≈0.26
      const pi = Math.round(0.26 * (KOI_SEG - 1)) * 5;
      const pcx = row[pi], pcy = row[pi + 1], pnx = row[pi + 2], pny = row[pi + 3], phw = row[pi + 4];
      const dx = Math.cos(k.heading), dy = Math.sin(k.heading);
      const finLen = es * 0.17;
      const finA = 0.5 * (1 - dk * 0.3);
      for (let s = 0; s < 2; s++) {
        const sg = s === 0 ? -1 : 1;
        const bx = pcx + pnx * phw * 0.85 * sg, by = pcy + pny * phw * 0.85 * sg;
        const flut = Math.sin(k.phase * 1.6 + (s === 0 ? 0 : Math.PI)) * 0.38;
        // tip: outward + swept back, fluttering
        const ca = Math.cos(flut), sa = Math.sin(flut);
        let tx = pnx * sg * ca - (-dx) * sa;
        let ty = pny * sg * ca - (-dy) * sa;
        const tipx = bx + tx * finLen, tipy = by + ty * finLen;
        const uvb = this._toUV(bx, by), uvt = this._toUV(tipx, tipy);
        const bdx = bx + dx * 0.010, bdy = by + dy * 0.010;
        const b2x = bx - dx * 0.010, b2y = by - dy * 0.010;
        const uvb1 = this._toUV(bdx, bdy), uvb2 = this._toUV(b2x, b2y);
        const fo = finN * 8;
        fin[fo] = uvb1[0]; fin[fo + 1] = uvb1[1]; fin[fo + 2] = 0.5; fin[fo + 3] = 0.5;
        fin[fo + 4] = tr; fin[fo + 5] = tg; fin[fo + 6] = tb; fin[fo + 7] = finA;
        fin[fo + 8] = uvb2[0]; fin[fo + 9] = uvb2[1]; fin[fo + 10] = 0.5; fin[fo + 11] = 0.5;
        fin[fo + 12] = tr; fin[fo + 13] = tg; fin[fo + 14] = tb; fin[fo + 15] = finA;
        fin[fo + 16] = uvt[0]; fin[fo + 17] = uvt[1]; fin[fo + 18] = 0.5; fin[fo + 19] = 0.5;
        fin[fo + 20] = tr; fin[fo + 21] = tg; fin[fo + 22] = tb; fin[fo + 23] = finA * 0.55;
        finN += 3;
      }
      // tail fin: fan of 3 triangles from the tail tip, wagging with the body
      const ti = (KOI_SEG - 1) * 5, pi2 = (KOI_SEG - 2) * 5;
      const tx0 = row[ti], ty0 = row[ti + 1];
      let fdx = tx0 - row[pi2], fdy = ty0 - row[pi2 + 1];
      const fl = Math.sqrt(fdx * fdx + fdy * fdy) || 1;
      fdx /= fl; fdy /= fl;
      const tLen = es * 0.30;
      const uvT = this._toUV(tx0, ty0);
      for (let f = -1; f <= 1; f++) {
        const a0 = f * 0.42 - 0.13, a1 = f * 0.42 + 0.13;
        const ax = tx0 + (fdx * Math.cos(a0) - fdy * Math.sin(a0)) * tLen;
        const ay = ty0 + (fdx * Math.sin(a0) + fdy * Math.cos(a0)) * tLen;
        const bx = tx0 + (fdx * Math.cos(a1) - fdy * Math.sin(a1)) * tLen;
        const by = ty0 + (fdx * Math.sin(a1) + fdy * Math.cos(a1)) * tLen;
        const uvA = this._toUV(ax, ay), uvB = this._toUV(bx, by);
        const fo = finN * 8;
        fin[fo] = uvT[0]; fin[fo + 1] = uvT[1]; fin[fo + 2] = 0.5; fin[fo + 3] = 0.5;
        fin[fo + 4] = tr; fin[fo + 5] = tg; fin[fo + 6] = tb; fin[fo + 7] = finA;
        fin[fo + 8] = uvA[0]; fin[fo + 9] = uvA[1]; fin[fo + 10] = 0.5; fin[fo + 11] = 0.5;
        fin[fo + 12] = tr; fin[fo + 13] = tg; fin[fo + 14] = tb; fin[fo + 15] = finA * 0.4;
        fin[fo + 16] = uvB[0]; fin[fo + 17] = uvB[1]; fin[fo + 18] = 0.5; fin[fo + 19] = 0.5;
        fin[fo + 20] = tr; fin[fo + 21] = tg; fin[fo + 22] = tb; fin[fo + 23] = finA * 0.4;
        finN += 3;
      }

      // ---- blob shadow (batched) ----
      const shS = es * (1.15 + dk * 0.55);
      const shA = 0.30 * (1 - dk * 0.45);
      const scx = k.x + 0.014, scy = k.y + 0.018;
      const c00 = this._toUV(scx - shS / 2, scy - shS / 2);
      const c10 = this._toUV(scx + shS / 2, scy - shS / 2);
      const c01 = this._toUV(scx - shS / 2, scy + shS / 2);
      const c11 = this._toUV(scx + shS / 2, scy + shS / 2);
      const so = shN * 8;
      const quad = [
        [c00, 0, 0], [c10, 1, 0], [c11, 1, 1],
        [c00, 0, 0], [c11, 1, 1], [c01, 0, 1],
      ];
      for (let q = 0; q < 6; q++) {
        const o2 = so + q * 8;
        sh[o2] = quad[q][0][0]; sh[o2 + 1] = quad[q][0][1];
        sh[o2 + 2] = quad[q][1]; sh[o2 + 3] = quad[q][2];
        sh[o2 + 4] = 0; sh[o2 + 5] = 0; sh[o2 + 6] = 0; sh[o2 + 7] = shA;
      }
      shN += 6;
    }
    this._finN = finN;
    this._shadowN = shN;
  }

  /* ---------------- underwater draw (called by WaterEngine mid-render) ---------------- */

  _drawUnderwater(uw) {
    // pond bottom first (full screen)
    const b = this._bottomQuad || (this._bottomQuad = new Float32Array([
      0, 0, 0, 0, 1, 1, 1, 1,
      1, 0, 1, 0, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      0, 0, 0, 0, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      0, 1, 0, 1, 1, 1, 1, 1,
    ]));
    uw.tris(uw.bottomTexture, b, 6);
    // blob shadows
    if (this._shadowN > 0) uw.tris(this._texShadow, this._shadowBuf, this._shadowN);
    // koi bodies
    for (let ki = 0; ki < this.koi.length; ki++) {
      uw.strip(this.koi[ki].tex, this._bodyBuf[ki], KOI_SEG * 2);
    }
    // fins (one batched call)
    if (this._finN > 0) uw.tris(this._texFin, this._finBuf, this._finN);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { KoiEngine, KOI_PERSONAS };
}
