/* Garden — Moss & Stone phase 4.
 * The garden frame around the pond: raked sand, placeable stones, moss that
 * follows the rake lines, and one Japanese maple dropping leaves.
 *
 * Renders to its own 2D canvas composited BEHIND the water canvas (the water
 * engine runs with transparentRim:true so the garden shows through outside
 * the pond mask). All sim state in UV (0..1, y down); drawing in device px.
 * Fixed 60Hz timestep, clamped dt, mulberry32 PRNG, zero per-frame allocations.
 * Vanilla JS + Canvas 2D, no libraries.
 */
'use strict';

var GARDEN_FURROW_GRID = 48;
var GARDEN_MOSS_MAX = 48;
var GARDEN_LEAF_MAX = 230; // phase 8: densified canopy (was 150)
var GARDEN_RESTED_MAX = 14;

function gardenClamp(v, a, b) { return v < a ? a : v > b ? b : v; }

class Garden {
  constructor(viewCanvas, water, life, opts) {
    opts = opts || {};
    this.view = viewCanvas;
    this.water = water;
    this.life = life || null;
    this.seed = opts.seed == null ? 909090 : opts.seed;
    this.rng = mulberry32(this.seed);
    this.ok = false;
    this.reducedMotion = false; // phase 8: set by Systems.setReducedMotion

    this.W = 0; this.H = 0;
    this.time = 0;
    this._acc = 0; this._lastT = 0;

    // layers (device-px canvases)
    this._sand = null;      // static: sand + vignette + pond shadow
    this._furrow = null;    // persistent rake strokes
    this._mossC = null;     // moss, redrawn on growth ticks
    this._base = null;      // composited sand+furrow+moss (rebuilt when dirty)
    this._baseDirty = true;
    this._furrowGrid = new Float32Array(GARDEN_FURROW_GRID * GARDEN_FURROW_GRID);
    this._furrowPx = 0;     // painted-area estimate (test hook)

    this.stones = [];
    this.patches = [];
    this.leaves = [];       // falling
    this.rested = [];       // landed on sand
    this.puffs = [];        // dust puffs

    this._mossT = 2.0;
    this._leafT = 3.0;
    this._mossDirty = true;

    // rake stroke state
    this._stroke = null;
    this._sx = 0; this._sy = 0;
    this._sub = 0;
    this._lastTx = 0; this._lastTy = 0; this._lastUx = 1; this._lastUy = 0;

    // stone drag state
    this._dragStone = -1;
    this._dragLift = 0;

    // maple
    this.maple = null;
    this._branchC = null;
    this._mapleLeaves = [];

    this._wind = 0.5;
  }

  /* ================= init ================= */

  init() {
    if (!this.water || !this.water.ok) return false;
    this.W = this.view.width; this.H = this.view.height;
    if (!this.W || !this.H) return false;
    this._buildSand();
    this._furrow = this._mkCanvas();
    this._mossC = this._mkCanvas();
    this._placeStones();
    this._seedMoss();
    this._buildMaple();
    this.ok = true;
    return true;
  }

  resize() {
    const W = this.view.width, H = this.view.height;
    if (!W || !H || (W === this.W && H === this.H)) return;
    // preserve furrows across resize by scaling the old bitmap
    const oldFurrow = this._furrow;
    this.W = W; this.H = H;
    this._buildSand();
    this._furrow = this._mkCanvas();
    if (oldFurrow) {
      const x = this._furrow.getContext('2d');
      x.drawImage(oldFurrow, 0, 0, W, H);
    }
    this._mossC = this._mkCanvas();
    this._mossDirty = true;
    this._baseDirty = true;
    for (const s of this.stones) s.img = this._renderStone(s);
    this._buildMaple();
  }

  _mkCanvas() {
    const c = document.createElement('canvas');
    c.width = this.W; c.height = this.H;
    return c;
  }

  _uv2px(nx, ny) { return [nx * this.W, ny * this.H]; }

  /* ================= sand ================= */

  _buildSand() {
    const W = this.W, H = this.H, r = this.rng;
    const c = this._mkCanvas();
    const x = c.getContext('2d');

    x.fillStyle = '#c9b385';
    x.fillRect(0, 0, W, H);

    // large soft mottling
    for (let i = 0; i < 34; i++) {
      const px = r() * W, py = r() * H, pr = 60 + r() * 200;
      const g = x.createRadialGradient(px, py, 4, px, py, pr);
      const dark = r() < 0.5;
      g.addColorStop(0, dark ? 'rgba(120,98,66,0.10)' : 'rgba(255,244,220,0.08)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }

    // grain (per-pixel)
    const img = x.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (r() - 0.5) * 24;
      d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.9;
      if (r() < 0.004) { d[i] *= 0.70; d[i + 1] *= 0.70; d[i + 2] *= 0.70; }
      else if (r() < 0.004) { d[i] += 26; d[i + 1] += 24; d[i + 2] += 20; }
    }
    x.putImageData(img, 0, 0);

    // top light
    const lg = x.createLinearGradient(0, 0, 0, H);
    lg.addColorStop(0, 'rgba(255,250,235,0.07)');
    lg.addColorStop(0.5, 'rgba(0,0,0,0)');
    lg.addColorStop(1, 'rgba(40,30,18,0.10)');
    x.fillStyle = lg;
    x.fillRect(0, 0, W, H);

    // vignette
    const vg = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(38,28,16,0.30)');
    x.fillStyle = vg;
    x.fillRect(0, 0, W, H);

    // pond shadow ring: soft dark halo just outside the water edge
    const pts = this.water.pondOutline(72);
    if (pts.length) {
      const path = new Path2D();
      pts.forEach((p, i) => {
        const px = p[0] * W, py = p[1] * H;
        if (i === 0) path.moveTo(px, py); else path.lineTo(px, py);
      });
      path.closePath();
      x.lineJoin = 'round';
      this._strokeShadowPasses(x, path, [
        [46, 'rgba(30,24,16,0.10)'],
        [30, 'rgba(30,24,16,0.14)'],
        [18, 'rgba(30,24,16,0.18)'],
        [10, 'rgba(74,60,40,0.22)'], // wet-sand darkening at the waterline
      ]);
    }
    this._sand = c;
  }

  _strokeShadowPasses(x, path, passes) {
    for (const [w, style] of passes) {
      x.strokeStyle = style;
      x.lineWidth = w;
      x.stroke(path);
    }
  }

  /* ================= raking ================= */

  // screen-UV stroke API (also used by tests)
  rakeStart(nx, ny) {
    this._stroke = [[nx * this.W, ny * this.H]];
    this._sx = nx * this.W; this._sy = ny * this.H;
    this._sub = 0;
  }

  rakeMove(nx, ny) {
    if (!this._stroke) return;
    const pts = this._stroke;
    pts.push([nx * this.W, ny * this.H]);
    if (pts.length < 2) return;
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    this._stampTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }

  rakeEnd() {
    if (!this._stroke) return;
    // taper-out: a few shrinking substeps along the last tangent
    let ux = this._lastUx, uy = this._lastUy;
    for (let i = 0; i < 6; i++) {
      const w = 1 - (i + 1) / 7;
      this._sx += ux * 4; this._sy += uy * 4;
      this._stampSubstep(ux, uy, w * 0.9);
    }
    this._stroke = null;
  }

  _stampTo(tx, ty) {
    let dx = tx - this._sx, dy = ty - this._sy;
    let dist = Math.sqrt(dx * dx + dy * dy);
    const STEP = 4;
    let guard = 0;
    while (dist >= STEP && guard++ < 400) {
      const ux = dx / dist, uy = dy / dist;
      this._sx += ux * STEP; this._sy += uy * STEP;
      this._lastTx = tx; this._lastTy = ty;
      this._lastUx = ux; this._lastUy = uy;
      this._stampSubstep(ux, uy, 1);
      dx = tx - this._sx; dy = ty - this._sy;
      dist = Math.sqrt(dx * dx + dy * dy);
    }
  }

  _stampSubstep(ux, uy, taper) {
    const x = this._furrow.getContext('2d');
    const nx = -uy, ny = ux; // normal
    this._sub++;
    const wob = Math.sin(this._sub * 0.9) * 1.6;
    const startTaper = Math.min(1, this._sub / 9);
    const w = (7 * startTaper + 0.5) * taper;
    if (w < 0.6) return;
    const x0 = this._sx - ux * 4, y0 = this._sy - uy * 4;
    const x1 = this._sx, y1 = this._sy;
    x.lineCap = 'round';
    // groove shadow (offset to one side)
    x.strokeStyle = 'rgba(74,60,40,0.42)';
    x.lineWidth = w;
    x.beginPath();
    x.moveTo(x0 + nx * -3 + nx * wob * 0.3, y0 + ny * -3 + ny * wob * 0.3);
    x.lineTo(x1 + nx * -3 + nx * wob * 0.3, y1 + ny * -3 + ny * wob * 0.3);
    x.stroke();
    // ridge highlight (offset to the other side)
    x.strokeStyle = 'rgba(255,248,230,0.36)';
    x.lineWidth = w * 0.62;
    x.beginPath();
    x.moveTo(x0 + nx * 2.6, y0 + ny * 2.6);
    x.lineTo(x1 + nx * 2.6, y1 + ny * 2.6);
    x.stroke();

    this._furrowPx += w * 4 * 1.4;
    this._baseDirty = true;
    // feed the moss-density grid
    const G = GARDEN_FURROW_GRID;
    const gx = gardenClamp(((x1 / this.W) * G) | 0, 0, G - 1);
    const gy = gardenClamp(((y1 / this.H) * G) | 0, 0, G - 1);
    const gi = gy * G + gx;
    if (this._furrowGrid[gi] < 3) this._furrowGrid[gi] += 0.6;

    // raking sweeps away rested leaves
    for (let i = this.rested.length - 1; i >= 0; i--) {
      const L = this.rested[i];
      const dx = L.nx * this.W - x1, dy = L.ny * this.H - y1;
      if (dx * dx + dy * dy < 16 * 16) {
        this.rested[i] = this.rested[this.rested.length - 1];
        this.rested.pop();
      }
    }
  }

  furrowDensityAt(nx, ny) {
    const G = GARDEN_FURROW_GRID;
    const gx = gardenClamp((nx * G) | 0, 0, G - 1);
    const gy = gardenClamp((ny * G) | 0, 0, G - 1);
    return this._furrowGrid[gy * G + gx];
  }

  furrowAmount() { return this._furrowPx; }

  /* ================= stones ================= */

  _placeStones() {
    const aspect = this.water.aspect, r = this.rng;
    const defs = [];
    let guard = 0;
    while (defs.length < 5 && guard++ < 400) {
      const nx = 0.08 + r() * 0.84, ny = 0.06 + r() * 0.88;
      if (this.water.pondInfo(nx, ny)[0] > 0.22) continue;
      const mdx = nx - 0.17, mdy = (ny - 0.13) * aspect; // maple
      if (mdx * mdx + mdy * mdy < 0.24 * 0.24) continue;
      let ok = true;
      for (const s of defs) {
        const dx = s.nx - nx, dy = (s.ny - ny) * aspect;
        if (dx * dx + dy * dy < 0.17 * 0.17) { ok = false; break; }
      }
      if (!ok) continue;
      defs.push({ nx, ny, r: 0.034 + r() * 0.024, seed: (r() * 1e9) | 0 });
    }
    this.stones = defs.map(d => {
      d.img = this._renderStone(d);
      return d;
    });
  }

  _renderStone(d) {
    const W = this.W;
    const S = Math.max(8, Math.ceil(d.r * W * 2.9));
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const x = c.getContext('2d');
    const r = mulberry32(d.seed);
    const cx = S / 2, cy = S / 2, R = S * 0.40;
    const harms = [];
    for (let k = 0; k < 4; k++) harms.push({ k: 2 + ((r() * 4) | 0), a: 0.05 + r() * 0.09, p: r() * 6.28 });
    const rad = (a) => {
      let m = 1;
      for (const h of harms) m += h.a * Math.sin(h.k * a + h.p);
      return R * m;
    };
    const path = new Path2D();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const rr = rad(a);
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * 0.86;
      if (i === 0) path.moveTo(px, py); else path.lineTo(px, py);
    }
    path.closePath();
    const g = x.createLinearGradient(0, cy - R, 0, cy + R);
    g.addColorStop(0, '#b7ac9c');
    g.addColorStop(0.55, '#8d8474');
    g.addColorStop(1, '#5f574c');
    x.fillStyle = g;
    x.fill(path);
    // top-light sheen
    const sg = x.createRadialGradient(cx - R * 0.25, cy - R * 0.35, 2, cx - R * 0.25, cy - R * 0.35, R * 0.9);
    sg.addColorStop(0, 'rgba(255,252,240,0.20)');
    sg.addColorStop(1, 'rgba(255,252,240,0)');
    x.fillStyle = sg;
    x.fill(path);
    // speckles
    for (let i = 0; i < 42; i++) {
      const a = r() * 6.28, rr = Math.sqrt(r()) * R * 0.92;
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * 0.86;
      x.fillStyle = r() < 0.5 ? 'rgba(40,34,26,0.20)' : 'rgba(255,250,238,0.16)';
      x.beginPath(); x.arc(px, py, 0.8 + r() * 1.6, 0, 6.2832); x.fill();
    }
    // moss flecks on the upper (north) face
    for (let i = 0; i < 16; i++) {
      const a = Math.PI + (r() - 0.5) * 2.2; // upper arc
      const rr = Math.sqrt(r()) * R * 0.88;
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * 0.86;
      x.fillStyle = 'rgba(' + (70 + ((r() * 30) | 0)) + ',' + (105 + ((r() * 30) | 0)) + ',64,0.55)';
      x.beginPath(); x.arc(px, py, 1 + r() * 2.4, 0, 6.2832); x.fill();
    }
    return c;
  }

  stoneAt(nx, ny) {
    const aspect = this.water.aspect;
    for (let i = this.stones.length - 1; i >= 0; i--) {
      const s = this.stones[i];
      const dx = s.nx - nx, dy = (s.ny - ny) * aspect;
      if (dx * dx + dy * dy < (s.r * 1.35) * (s.r * 1.35)) return i;
    }
    return -1;
  }

  dragStoneStart(i) { this._dragStone = i; this._dragLift = 0; }
  dragStoneMove(nx, ny) {
    if (this._dragStone < 0) return;
    const s = this.stones[this._dragStone];
    // keep stones on sand, inside the frame
    if (this.water.pondInfo(nx, ny)[0] > 0.30) return; // not in the pond
    s.nx = gardenClamp(nx, 0.05, 0.95);
    s.ny = gardenClamp(ny, 0.04, 0.96);
  }
  dragStoneEnd() {
    if (this._dragStone >= 0) {
      const s = this.stones[this._dragStone];
      this.puffs.push({ nx: s.nx, ny: s.ny, t: 0 });
    }
    this._dragStone = -1;
  }

  stonePositions() { return this.stones.map(s => [s.nx, s.ny, s.r]); }

  serialize() {
    // furrows: density grid (drives moss) + a half-res PNG of the furrow bitmap
    // (restores the exact visuals). ~40-80KB: fine for localStorage.
    const fg = new Array(this._furrowGrid.length);
    for (let i = 0; i < fg.length; i++) fg[i] = Math.round(this._furrowGrid[i] * 100) / 100;
    let furrowURL = null;
    try {
      const tc = document.createElement('canvas');
      tc.width = Math.max(2, this.W >> 1); tc.height = Math.max(2, this.H >> 1);
      tc.getContext('2d').drawImage(this._furrow, 0, 0, tc.width, tc.height);
      furrowURL = tc.toDataURL('image/png');
    } catch (e) {}
    return {
      v: 1,
      stones: this.stones.map(s => ({ nx: +s.nx.toFixed(4), ny: +s.ny.toFixed(4), r: +s.r.toFixed(4), seed: s.seed })),
      moss: this.patches.map(p => ({ nx: +p.nx.toFixed(4), ny: +p.ny.toFixed(4), r: +p.r.toFixed(5) })),
      furrowGrid: fg,
      furrowURL: furrowURL,
    };
  }
  deserialize(s) {
    if (!s || s.v !== 1) return false;
    this.stones = s.stones.map(d => { d.img = this._renderStone(d); return d; });
    this.patches = s.moss.map(p => ({ nx: p.nx, ny: p.ny, r: p.r, vig: 0.8 }));
    if (s.furrowGrid && s.furrowGrid.length === this._furrowGrid.length) {
      this._furrowGrid.set(s.furrowGrid);
      let px = 0;
      for (let i = 0; i < s.furrowGrid.length; i++) px += s.furrowGrid[i];
      this._furrowPx = px * 40;
    }
    if (s.furrowURL) {
      // async restore of the furrow bitmap; flags refresh when it lands
      const img = new Image();
      const self = this;
      img.onload = function () {
        const x = self._furrow.getContext('2d');
        x.clearRect(0, 0, self.W, self.H);
        x.drawImage(img, 0, 0, self.W, self.H);
        self._baseDirty = true;
      };
      img.src = s.furrowURL;
    }
    this._mossDirty = true;
    this._baseDirty = true;
    return true;
  }

  /* ================= moss ================= */

  seedMoss(nx, ny, r, vig) {
    if (this.patches.length >= GARDEN_MOSS_MAX) return;
    this.patches.push({ nx, ny, r: r || 0.018, vig: vig == null ? 0.6 + this.rng() * 0.4 : vig });
    this._mossDirty = true;
  }

  _seedMoss() {
    const r = this.rng;
    let guard = 0, placed = 0;
    while (placed < 8 && guard++ < 300) { // on sand, just outside the pond edge
      const nx = 0.1 + r() * 0.8, ny = 0.08 + r() * 0.84;
      const e = this.water.edgeDist(nx, ny);
      if (e > 0.004 && e < 0.06) { this.seedMoss(nx, ny, 0.014 + r() * 0.010); placed++; }
    }
    guard = 0; placed = 0;
    while (placed < 4 && guard++ < 300) { // near stones
      const s = this.stones[(r() * this.stones.length) | 0];
      if (!s) break;
      const a = r() * 6.28, d = s.r * (1.3 + r() * 0.8);
      const nx = s.nx + Math.cos(a) * d, ny = s.ny + Math.sin(a) * d / this.water.aspect;
      if (this.water.edgeDist(nx, ny) > 0.004) { this.seedMoss(nx, ny, 0.012 + r() * 0.008); placed++; }
    }
  }

  _furrowDensityUV(nx, ny) { return this.furrowDensityAt(nx, ny); }

  _growMoss(dt) {
    const aspect = this.water.aspect;
    let grew = false;
    for (let i = 0; i < this.patches.length; i++) {
      const p = this.patches[i];
      if (p.r >= 0.06) continue;
      const d = this._furrowDensityUV(p.nx, p.ny); // 0..3
      const e = this.water.edgeDist(p.nx, p.ny);
      const edge = (e > 0 && e < 0.07) ? 0.6 : 0; // pond-edge bonus (sand side)
      const rate = 0.00010 * (0.25 + d * 0.55 + edge) * p.vig;
      if (rate > 0) { p.r += rate * dt; grew = true; }
      // satellite colonies follow the rake lines (rare + crowding-limited)
      if (p.r > 0.034 && this.patches.length < GARDEN_MOSS_MAX && this.rng() < 0.03 * dt) {
        let crowded = 0;
        for (let j = 0; j < this.patches.length; j++) {
          const q = this.patches[j];
          const cdx = q.nx - p.nx, cdy = (q.ny - p.ny) * aspect;
          if (cdx * cdx + cdy * cdy < (p.r * 3) * (p.r * 3)) { if (++crowded >= 3) break; }
        }
        if (crowded < 3) {
          for (let k = 0; k < 6; k++) {
            const a = this.rng() * 6.28, dd = p.r * (1.6 + this.rng());
            const nx = p.nx + Math.cos(a) * dd, ny = p.ny + Math.sin(a) * dd / aspect;
            if (nx < 0.03 || nx > 0.97 || ny < 0.03 || ny > 0.97) continue;
            const ne = this.water.edgeDist(nx, ny);
            if (ne < 0.004) continue; // on sand only
            const ddens = this._furrowDensityUV(nx, ny);
            if (ddens > 0.4 || ne < 0.07) {
              this.patches.push({ nx, ny, r: p.r * 0.45, vig: 0.6 + this.rng() * 0.4 });
              grew = true;
              break;
            }
          }
        }
      }
    }
    if (grew) this._mossDirty = true;
  }

  _redrawMoss() {
    const x = this._mossC.getContext('2d');
    x.clearRect(0, 0, this.W, this.H);
    const r = this.rng;
    for (const p of this.patches) {
      const px = p.nx * this.W, py = p.ny * this.H, pr = p.r * this.W;
      if (pr < 1.5) continue;
      const layers = [
        [1.0, 'rgba(58,92,54,0.50)'],
        [0.72, 'rgba(80,118,68,0.48)'],
        [0.45, 'rgba(104,142,84,0.42)'],
      ];
      for (const [k, style] of layers) {
        const g = x.createRadialGradient(px, py, 1, px, py, pr * k);
        g.addColorStop(0, style);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g;
        x.beginPath(); x.arc(px, py, pr * k, 0, 6.2832); x.fill();
      }
      // flecks
      for (let i = 0; i < 6; i++) {
        const a = r() * 6.28, dd = Math.sqrt(r()) * pr * 0.7;
        x.fillStyle = 'rgba(130,165,105,0.40)';
        x.beginPath();
        x.arc(px + Math.cos(a) * dd, py + Math.sin(a) * dd, 1 + r() * 2.2, 0, 6.2832);
        x.fill();
      }
    }
    this._mossDirty = false;
    this._baseDirty = true; // re-composite sand+furrow+moss
  }

  _compositeBase() {
    if (!this._base || this._base.width !== this.W || this._base.height !== this.H) {
      this._base = this._mkCanvas();
    }
    const x = this._base.getContext('2d');
    x.clearRect(0, 0, this.W, this.H);
    x.drawImage(this._sand, 0, 0);
    x.drawImage(this._furrow, 0, 0);
    x.drawImage(this._mossC, 0, 0);
    this._baseDirty = false;
  }

  mossCoverage() {
    let s = 0;
    for (const p of this.patches) s += Math.PI * p.r * p.r;
    return s;
  }

  /* ================= maple ================= */

  _buildMaple() {
    const W = this.W, H = this.H, r = this.rng;
    this.maple = { nx: 0.17, ny: 0.13 };
    const bc = this._mkCanvas();
    const bx = bc.getContext('2d');
    const mx = this.maple.nx * W, my = this.maple.ny * H;

    // trunk + recursive branches (px space, cached to offscreen)
    const anchors = [];
    const branch = (x, y, ang, len, w, depth) => {
      const nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
      bx.strokeStyle = depth > 2 ? '#4a382c' : '#5d4636';
      bx.lineWidth = Math.max(1.2, w);
      bx.lineCap = 'round';
      bx.beginPath(); bx.moveTo(x, y); bx.lineTo(nx, ny); bx.stroke();
      if (depth <= 0) { anchors.push([nx / W, ny / H]); return; }
      if (depth >= 2) anchors.push([(x + nx) / 2 / W, (y + ny) / 2 / H]);
      const kids = 2 + (r() < 0.45 ? 1 : 0);
      for (let i = 0; i < kids; i++) {
        branch(nx, ny, ang + (r() - 0.5) * 1.15, len * (0.60 + r() * 0.16), w * 0.62, depth - 1);
      }
    };
    branch(mx, my + H * 0.085, -Math.PI / 2, H * 0.070, 9, 5);
    this._branchC = bc;

    // canopy leaves clustered around the anchors
    const palette = ['#b8352a', '#c9502e', '#d4692f', '#a82f28', '#c23e24'];
    this._mapleLeaves = [];
    for (let i = 0; i < GARDEN_LEAF_MAX && anchors.length; i++) {
      const a = anchors[(r() * anchors.length) | 0];
      const gx = (r() + r() + r()) / 3 - 0.5, gy = (r() + r() + r()) / 3 - 0.5;
      this._mapleLeaves.push({
        nx: a[0] + gx * 0.11,
        ny: a[1] + gy * 0.11 / this.water.aspect,
        size: 3.2 + r() * 3.4,
        rot: r() * 6.28,
        col: palette[(r() * palette.length) | 0],
        phase: r() * 6.28,
      });
    }
  }

  _spawnFallingLeaf() {
    if (!this._mapleLeaves.length || this.leaves.length > 10) return;
    const L = this._mapleLeaves[(this.rng() * this._mapleLeaves.length) | 0];
    this.leaves.push({
      nx: L.nx, ny: L.ny,
      vx: 0, vy: 0,
      rot: this.rng() * 6.28, rotV: (this.rng() - 0.5) * 5,
      swayP: this.rng() * 6.28,
      age: 0, maxAge: 2.2 + this.rng() * 2.2,
      size: L.size, col: L.col,
    });
  }

  _stepLeaves(dt) {
    // spawn
    this._leafT -= dt;
    if (this._leafT <= 0) {
      this._leafT = 4 + this.rng() * 5;
      this._spawnFallingLeaf();
    }
    this._wind = 0.5 + 0.5 * Math.sin(this.time * 0.07);
    for (let i = this.leaves.length - 1; i >= 0; i--) {
      const L = this.leaves[i];
      L.age += dt;
      L.swayP += dt * 3.1;
      L.vy = 0.030;
      // reduced motion: leaves fall straight and calm
      L.vx = 0.004 + (this.reducedMotion ? 0 : 0.010 * this._wind + Math.sin(L.swayP) * 0.012);
      L.nx += L.vx * dt; L.ny += L.vy * dt;
      L.rot += L.rotV * dt;
      if (this.water.pondInfo(L.nx, L.ny)[0] > 0.5) {
        // ripple kiss: hand to the pond-life petal system (kind 1 = maple leaf)
        if (this.life) this.life.dropPetal(L.nx, L.ny, 1);
        this.leaves[i] = this.leaves[this.leaves.length - 1];
        this.leaves.pop();
      } else if (L.age >= L.maxAge || L.ny > 1.0 || L.nx > 1.02) {
        // rests on the sand
        if (L.ny <= 1.0 && L.nx <= 1.02) {
          this.rested.push({ nx: L.nx, ny: Math.min(L.ny, 0.99), rot: L.rot, size: L.size, col: L.col });
          if (this.rested.length > GARDEN_RESTED_MAX) this.rested.shift();
        }
        this.leaves[i] = this.leaves[this.leaves.length - 1];
        this.leaves.pop();
      }
    }
  }

  /* ================= frame ================= */

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

    this._render();
  }

  _step(dt) {
    this.time += dt;
    // moss grows slowly
    this._mossT -= dt;
    if (this._mossT <= 0) {
      this._mossT = 2.5;
      this._growMoss(2.5);
    }
    if (this._mossDirty) this._redrawMoss();
    this._stepLeaves(dt);
    // dust puffs
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      this.puffs[i].t += dt;
      if (this.puffs[i].t > 0.6) {
        this.puffs[i] = this.puffs[this.puffs.length - 1];
        this.puffs.pop();
      }
    }
    // stone lift easing
    const liftT = this._dragStone >= 0 ? 1 : 0;
    this._dragLift += (liftT - this._dragLift) * Math.min(1, dt * 10);
  }

  // test fast-forward: run sim without drawing
  fastForward(sec) {
    const STEP = 1 / 60;
    let t = 0;
    while (t < sec) { this._step(STEP); t += STEP; }
  }

  /* ================= render ================= */

  _render() {
    const x = this.view.getContext('2d');
    const W = this.W, H = this.H;
    if (this._baseDirty) this._compositeBase();
    x.clearRect(0, 0, W, H);
    x.drawImage(this._base, 0, 0);

    // stones (per-frame: cheap, allows drag lift)
    for (let i = 0; i < this.stones.length; i++) {
      const s = this.stones[i];
      const px = s.nx * W, py = s.ny * H;
      const lift = (i === this._dragStone) ? this._dragLift * 12 : 0;
      const sr = s.r * W;
      // shadow
      x.fillStyle = 'rgba(30,24,16,' + (0.24 - this._dragLift * 0.08 * (i === this._dragStone ? 1 : 0)) + ')';
      x.beginPath();
      x.ellipse(px, py + sr * 0.42 + lift * 0.4, sr * 1.02, sr * 0.34, 0, 0, 6.2832);
      x.fill();
      x.drawImage(s.img, px - s.img.width / 2, py - s.img.height / 2 - lift);
    }

    // dust puffs
    for (const p of this.puffs) {
      const t = p.t / 0.6;
      const px = p.nx * W, py = p.ny * H;
      x.strokeStyle = 'rgba(210,190,150,' + (0.5 * (1 - t)).toFixed(3) + ')';
      x.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        x.beginPath();
        x.arc(px + (k - 1) * 14, py + 4, 6 + t * 22 + k * 3, 0, 6.2832);
        x.stroke();
      }
    }

    // maple branches (cached) + swaying canopy leaves
    if (this._branchC) x.drawImage(this._branchC, 0, 0);
    const t = this.time;
    const rm = this.reducedMotion;
    for (const L of this._mapleLeaves) {
      const sway = rm ? 0 : Math.sin(t * 1.4 + L.phase) * 3;
      const sway2 = rm ? 0 : Math.cos(t * 1.1 + L.phase * 1.7) * 2;
      const px = L.nx * W + sway, py = L.ny * H + sway2;
      x.save();
      x.translate(px, py);
      x.rotate(L.rot + (rm ? 0 : Math.sin(t * 0.9 + L.phase) * 0.12));
      x.fillStyle = L.col;
      x.beginPath();
      x.ellipse(0, 0, L.size, L.size * 0.68, 0, 0, 6.2832);
      x.fill();
      x.restore();
    }

    // falling leaves
    for (const L of this.leaves) {
      const px = L.nx * W, py = L.ny * H;
      x.save();
      x.translate(px, py);
      x.rotate(L.rot);
      x.fillStyle = L.col;
      x.beginPath();
      x.ellipse(0, 0, L.size, L.size * 0.66, 0, 0, 6.2832);
      x.fill();
      x.restore();
    }

    // rested leaves on the sand
    for (const L of this.rested) {
      const px = L.nx * W, py = L.ny * H;
      x.save();
      x.translate(px, py);
      x.rotate(L.rot);
      x.fillStyle = L.col;
      x.globalAlpha = 0.92;
      x.beginPath();
      x.ellipse(0, 0, L.size * 0.9, L.size * 0.6, 0, 0, 6.2832);
      x.fill();
      x.restore();
    }
    x.globalAlpha = 1;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Garden };
}
