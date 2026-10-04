/* Systems — Moss & Stone phase 5.
 * The living systems: day/night cycle (real device clock → water shader),
 * koi growth, feeding credit, breeding + eggs, pattern collection, visitors
 * (frog, heron, butterflies), garden journal with template engine, ascension
 * + blessings, versioned saves, offline catch-up.
 *
 * No punishment anywhere: neglect only slows growth. Vanilla JS, no libraries.
 * Fixed 60Hz tick, clamped dt, mulberry32 PRNG, zero per-frame allocations
 * in hot loops (air-canvas critters are pooled).
 */
'use strict';

var SYS_SAVE_KEY = 'moss-stone-v1';
var SYS_STYLE_NAMES = ['kohaku', 'tancho', 'sanke'];
var SYS_KOI_NAMES = ['Sango', 'Yuki', 'Aka', 'Kaze', 'Momo', 'Tora', 'Hana', 'Riku',
  'Sora', 'Umi', 'Ren', 'Nami', 'Hoshi', 'Kiku', 'Aoi', 'Fuji', 'Yuri', 'Kaya'];
var SYS_MARKS = ['a crooked crown', 'ink-dipped fins', 'a scatter of ember spots',
  'a moon-pale belly', 'one brave red patch', 'freckles like rain'];
var SYS_BLESSINGS = {
  clarity: 'the water runs clearer than before',
  growth: 'the young ones grow a little faster',
  visitors: 'rare visitors come more often',
};
var SYS_BLESS_KEYS = ['clarity', 'growth', 'visitors'];

// Journal templates. Slots are {name}-style; the pond-ai worker (phase 7)
// can later replace/extend these — the engine only fills slots.
var SYS_JT = {
  first: [
    'The pond is yours now. Rake the sand, feed the koi, visit often — or don\'t. It will keep.',
  ],
  hatch: [
    '{name} hatched — a {style} with {mark}.',
    'A new fry: {name}, {style}, {mark}. Welcome, little one.',
    '{name} emerged at first light, all {style} and wonder.',
  ],
  juvenile: [
    '{name} is growing — no longer a fry.',
    '{name} stretches a little longer every day.',
  ],
  adult: [
    '{name} is fully grown, and magnificent.',
    '{name} has come into their own.',
  ],
  breed: [
    '{nameA} and {nameB} have been inseparable lately…',
    'Something is happening between {nameA} and {nameB}.',
  ],
  egg: [
    'An egg rests on a lily pad. {nameA} and {nameB} keep close watch.',
  ],
  heron: [
    'A heron visited at {when}. The koi hid, wise as ever.',
    'Grey wings at the water\'s edge — a heron, gone as quickly as it came.',
  ],
  frog: [
    'A frog took up residence on the far lily pad.',
    'There is a frog now. It seems to like it here.',
  ],
  ascension: [
    '{name} rose at dawn in a ring of light, and was gone. Now {blessing}.',
    'At first light, {name} ascended. Now {blessing}.',
  ],
  away_head: ['While you were away…'],
  away_growth: [
    '{n} koi grew in your absence.',
    'The koi kept growing without you — no hard feelings.',
  ],
  away_moss: [
    'Moss crept along your rake lines.',
    'The moss spread, following where you had raked.',
  ],
  away_heron: ['A heron visited. The koi hid until it left.'],
  away_frog: ['A frog moved in while you were gone.'],
  away_hatch: ['{n} eggs hatched while you were gone. Say hello.'],
  away_quiet: ['The pond kept its own quiet time. Nothing was in a hurry.'],
};

function sysClamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function sysSmooth(a, b, x) {
  const t = sysClamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function sysMix3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function sysNorm3(v) {
  const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

class Systems {
  constructor(water, koi, life, garden, opts) {
    opts = opts || {};
    this.water = water;
    this.koi = koi;
    this.life = life;
    this.garden = garden;
    this.air = opts.air || null; // 2D overlay canvas (frog, heron, fireflies, butterflies)
    this.seed = opts.seed == null ? 5150 : opts.seed;
    this.rng = mulberry32(this.seed);
    this.ok = false;

    this.time = 0;
    this._acc = 0;
    this._lastT = 0;

    // journal + collection + blessings
    this.journal = [];       // {t, text, kind} newest last
    this.discovered = {};    // patternId -> {thumb, style, name, at}
    this.blessings = { clarity: 0, growth: 0, visitors: 0 };
    this._usedNames = {};

    // day cycle
    this._overrideHour = null;
    this.dayF = 1; this.nightF = 0; this.duskF = 0;
    this._lastDay = 1;
    this._heronDoneDay = -1;
    this._frogDoneDay = -1;

    // breeding
    this._pairT = {};

    // visitors
    this._frog = null;
    this._heron = null;
    this._butterflies = [];

    // fireflies (pooled)
    this._flies = [];
    for (let i = 0; i < 26; i++) {
      this._flies.push({
        x: 0.2 + ((i * 0.37) % 0.6), y: 0.15 + ((i * 0.53) % 0.55),
        ph: (i * 2.399) % 6.2832, sp: 0.6 + (i % 5) * 0.22, on: false,
      });
    }
    this._glowTex = null;

    // ascension ceremony
    this._asc = null;   // {id, t, dur}
    this.bloomF = 0;    // prototype reads this for the bloom overlay

    this._awayCount = 0; // new journal entries since load (journal dot)
    this.saveEnabled = true; // tests can disable to keep localStorage clear
    this.pondAI = null;      // optional PondAI client (phase 7): richer names/journal
    this._visitorNoteDay = -1;
    this.onMilestone = null; // fn('hatch'|'ascension', data) — UI juice hook (phase 8)
    this.reducedMotion = false; // phase 8: calms decorative motion, never the koi
    this.onboard = { touch: false, feed: false, rake: false }; // phase 8: first-run hints
  }

  /* ================= init ================= */

  init() {
    if (!this.water || !this.water.ok) return false;
    if (!this.koi || !this.koi.ok) return false;
    if (!this.life || !this.life.ok) return false;
    if (!this.garden || !this.garden.ok) return false;

    // feeding credit: every meal makes the eater happier + grow faster
    const self = this;
    this.koi.onKoiEat = function (k) {
      k.meals++;
      k.fedT = self.time;
      k.fedBoost = 1;
      k.contentment = sysClamp(k.contentment + 0.06, 0, 1);
    };

    if (this.air) this._glowTex = this._makeGlowSprite();
    this.ok = true;
    return true;
  }

  _makeGlowSprite() {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(16, 16, 1, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,244,180,1)');
    g.addColorStop(0.35, 'rgba(255,236,140,0.55)');
    g.addColorStop(1, 'rgba(255,236,140,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 32, 32);
    return c;
  }

  /* ================= journal ================= */

  _pick(arr) { return arr[(this.rng() * arr.length) | 0]; }

  // Template engine: T('hatch', {name, style}) → filled string.
  // The pond-ai worker (phase 7) plugs in here later.
  T(key, slots) {
    const arr = SYS_JT[key];
    if (!arr) return '';
    let s = this._pick(arr);
    if (slots) {
      for (const k in slots) s = s.split('{' + k + '}').join(String(slots[k]));
    }
    return s;
  }

  _journal(kind, text) {
    this.journal.push({ t: Date.now(), text: text, kind: kind });
    if (this.journal.length > 120) this.journal.splice(0, this.journal.length - 120);
    this._awayCount++;
  }

  _jT(kind, slots) {
    const entry = { t: Date.now(), text: this.T(kind, slots), kind: kind };
    this.journal.push(entry);
    if (this.journal.length > 120) this.journal.splice(0, this.journal.length - 120);
    this._awayCount++;
    // pond-ai upgrade: swap in richer content in place when it arrives.
    // The entry is already visible with the local template; this only ever
    // improves it, silently, with no loading state.
    try {
      const pai = this.pondAI;
      const AIK = (typeof PondAI !== 'undefined' && PondAI.AI_EVENTS) || null;
      if (pai && AIK && AIK[kind] && typeof pai.journal === 'function') {
        pai.journal(kind, slots || {}).then(function (r) {
          if (r && typeof r.text === 'string' && r.text.length > 8 && r.text.length < 280) {
            entry.text = r.text;
          }
        }).catch(function () {});
      }
    } catch (e) {}
  }

  journalList() { return this.journal.slice().reverse(); }
  awayCount() { return this._awayCount; }
  clearAwayCount() { this._awayCount = 0; }

  // Phase 8: reduced motion — calms decorative sway only. Water, koi, and
  // ripples are the game itself and keep moving.
  setReducedMotion(v) {
    this.reducedMotion = !!v;
    try { if (this.garden) this.garden.reducedMotion = this.reducedMotion; } catch (e) {}
    try { if (this.life) this.life.reducedMotion = this.reducedMotion; } catch (e) {}
  }

  // Phase 8: first-run onboarding flags (persisted with the save)
  markOnboard(key) {
    if (this.onboard[key] !== false) return false;
    this.onboard[key] = true;
    return true;
  }
  onboardDone() { return this.onboard.touch && this.onboard.feed && this.onboard.rake; }

  /* ================= names + collection ================= */

  _newName() {
    // pond-ai name pool first (instant, pre-fetched); local banks on any miss.
    try {
      if (this.pondAI && typeof this.pondAI.takeName === 'function') {
        const pn = this.pondAI.takeName();
        if (pn && !this._usedNames[pn]) { this._usedNames[pn] = 1; return pn; }
      }
    } catch (e) {}
    for (let i = 0; i < SYS_KOI_NAMES.length; i++) {
      const n = SYS_KOI_NAMES[(this.rng() * SYS_KOI_NAMES.length) | 0];
      if (!this._usedNames[n]) { this._usedNames[n] = 1; return n; }
    }
    const n = this._pick(SYS_KOI_NAMES) + ' ' + (2 + ((this.rng() * 8) | 0));
    this._usedNames[n] = 1;
    return n;
  }

  _patternId(k) { return k.style + ':' + (k.patternSeed % 100000); }

  _discover(k) {
    const pid = this._patternId(k);
    if (this.discovered[pid]) return false;
    let thumb = null;
    try { thumb = k.patternCanvas.toDataURL(); } catch (e) {}
    this.discovered[pid] = {
      style: SYS_STYLE_NAMES[k.style] || 'koi',
      name: k.name || 'unnamed',
      at: Date.now(),
      thumb: thumb,
    };
    return true;
  }

  collectionList() {
    const out = [];
    for (const pid in this.discovered) {
      out.push(Object.assign({ id: pid }, this.discovered[pid]));
    }
    out.sort((a, b) => a.at - b.at);
    return out;
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
      this._tick(STEP);
      this._acc -= STEP;
      n++;
    }
    if (n === 3) this._acc = 0;

    this._renderAir();
  }

  // test fast-forward: run systems sim without drawing
  fastForward(sec) {
    const STEP = 1 / 60;
    let t = 0;
    while (t < sec) { this._tick(STEP); t += STEP; }
  }

  _tick(dt) {
    this.time += dt;
    this._dayUpdate();
    this._growthUpdate(dt);
    this._breedUpdate(dt);
    this._eggUpdate(dt);
    this._visitorUpdate(dt);
    this._ascensionUpdate(dt);
    // clarity blessing: the water trends clearer
    if (this.blessings.clarity > 0) {
      this.life.clarity = Math.min(1, this.life.clarity + dt * 0.004 * this.blessings.clarity);
    }
    this.life.murkScale = 1 - 0.3 * Math.min(2, this.blessings.clarity);
  }

  /* ================= day/night ================= */

  setClockOverride(h) { this._overrideHour = h; }
  clearClockOverride() { this._overrideHour = null; }

  _hourNow() {
    if (this._overrideHour != null) return this._overrideHour;
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }

  _dayUpdate() {
    const hr = this._hourNow();
    const ang = (hr - 6) / 12 * Math.PI; // 6h → horizon, 12h → zenith, 18h → horizon
    const elev = Math.sin(ang);
    this.dayF = sysSmooth(-0.06, 0.14, elev);
    this.nightF = 1 - sysSmooth(-0.16, -0.02, elev);
    this.duskF = Math.exp(-Math.pow(elev / 0.22, 2)) * (1 - this.nightF);

    // sun by day, moon by night
    const sunA = ang, moonA = ang + Math.PI;
    const sd = sysNorm3([Math.cos(sunA) * 0.9, -0.42, 0.62]);
    const md = sysNorm3([Math.cos(moonA) * 0.9, -0.42, 0.62]);
    const useSun = elev > -0.03;
    const warm = Math.exp(-Math.pow(elev / 0.25, 2));
    let scol = useSun
      ? sysMix3([1, 0.98, 0.92], [1.0, 0.55, 0.30], warm * 0.85)
      : [0.34, 0.41, 0.52]; // moonlight, dim and blue
    let sky = sysMix3(
      sysMix3([0.72, 0.82, 0.86], [0.98, 0.60, 0.40], Math.min(1, this.duskF * 1.2)),
      [0.05, 0.08, 0.14], this.nightF);
    this.water.sunDir = useSun ? sd : md;
    this.water.sunCol = scol;
    this.water.skyCol = sky;
    this.water.nightF = this.nightF;

    this.koi.setNightF(this.nightF);
    this.life.setLotusOpen(sysSmooth(0.15, 0.45, this.dayF));

    this._crossings();
  }

  _crossings() {
    const d = this.dayF, p = this._lastDay;
    const dayIdx = Math.floor(Date.now() / 86400000);
    // dawn: rising through 0.5 → heron roll + ascension check + daily visitor note
    if (p < 0.5 && d >= 0.5 && this._heronDoneDay !== dayIdx) {
      this._heronDoneDay = dayIdx;
      if (this.rng() < 0.22 * (1 + 0.75 * this.blessings.visitors)) this._startHeron();
      this._maybeAscension();
      this._dailyVisitorNote(dayIdx);
    }
    // dusk: falling through 0.35 → frog roll
    if (p > 0.35 && d <= 0.35 && this._frogDoneDay !== dayIdx) {
      this._frogDoneDay = dayIdx;
      if (this.rng() < 0.55 * (1 + 0.75 * this.blessings.visitors)) this._startFrog();
    }
    this._lastDay = d;
  }

  // Once per day: ask pond-ai who might visit today; a note lands in the
  // journal if the day holds someone other than the heron (which journals
  // itself). Silent on any failure — the pond doesn't miss it.
  _dailyVisitorNote(dayIdx) {
    try {
      if (!this.pondAI || typeof this.pondAI.dailyVisitor !== 'function') return;
      if (this._visitorNoteDay === dayIdx) return;
      this._visitorNoteDay = dayIdx;
      const self = this;
      const seed = new Date().toISOString().slice(0, 10);
      this.pondAI.dailyVisitor(seed).then(function (v) {
        if (v && v.visitor && v.visitor !== 'quiet' && v.visitor !== 'heron' && v.note) {
          self._journal('visitor', v.note);
        }
      }).catch(function () {});
    } catch (e) {}
  }

  /* ================= growth ================= */

  _growthRate(k) {
    const base = 1 / (20 * 60); // fry→adult in ~20 real minutes at full tilt
    const fed = 0.55 + 0.65 * Math.min(1, k.fedBoost || 0);
    return base * fed * (1 + 0.25 * this.blessings.growth);
  }

  _growthUpdate(dt) {
    for (let i = 0; i < this.koi.koi.length; i++) {
      const k = this.koi.koi[i];
      k.age += dt;
      k.fedBoost = Math.max(0, (k.fedBoost || 0) - dt / 300); // 5-minute glow per meal
      if (k.growthT < 1) {
        const before = k.growthT;
        k.growthT = Math.min(1, k.growthT + this._growthRate(k) * dt);
        if (before < 0.45 && k.growthT >= 0.45) this._jT('juvenile', { name: k.name });
        if (before < 1 && k.growthT >= 1) this._jT('adult', { name: k.name });
      }
    }
  }

  _wellFed(k) { return k.meals >= 2 && (this.time - k.fedT) < 900; }

  /* ================= breeding ================= */

  _breedUpdate(dt) {
    const ks = this.koi.koi;
    const adults = [];
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i];
      const ready = k.growthT >= 0.95 && this._wellFed(k);
      k.courtship = ready; // relax separation so courting pairs can snuggle
      if (ready) adults.push(k);
    }
    for (let i = 0; i < adults.length; i++) {
      for (let j = i + 1; j < adults.length; j++) {
        const a = adults[i], b = adults[j];
        const key = a.id < b.id ? a.id + '_' + b.id : b.id + '_' + a.id;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 0.07) {
          this._pairT[key] = (this._pairT[key] || 0) + dt;
          if (this._pairT[key] > 15 && this.life.eggs.length < 6 && ks.length < KOI_MAX) {
            this._pairT[key] = -9999; // cooldown so one pair doesn't spam eggs
            this._layEgg(a, b);
          }
        } else if (this._pairT[key] > 0) {
          this._pairT[key] = Math.max(0, this._pairT[key] - dt * 2);
        }
      }
    }
  }

  _nearestPad(nx, ny) {
    const pads = this.life.pads;
    let bi = -1, bd = 1e9;
    for (let i = 0; i < pads.length; i++) {
      const dx = pads[i].nx - nx, dy = pads[i].ny - ny;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; bi = i; }
    }
    return bi >= 0 ? pads[bi] : null;
  }

  _layEgg(a, b) {
    const mx = (a.x + b.x) / 2 + 0.5, my = (a.y + b.y) / 2 / this.water.aspect + 0.5;
    const pad = this._nearestPad(mx, my);
    const ex = pad ? pad.nx : mx, ey = pad ? pad.ny : my;
    const e = this.life.spawnEgg(ex, ey, {
      a: a.id, b: b.id,
      pa: a.patternSeed, pb: b.patternSeed,
      sa: a.style, sb: b.style,
      na: a.name, nb: b.name,
      hatchT: 150 + this.rng() * 60,
    });
    if (e) {
      this._jT('breed', { nameA: a.name, nameB: b.name });
      this._jT('egg', { nameA: a.name, nameB: b.name });
    }
  }

  _eggUpdate(dt) {
    const eggs = this.life.eggs;
    for (let i = eggs.length - 1; i >= 0; i--) {
      if (eggs[i].t >= eggs[i].hatchT) this._hatchEgg(eggs[i]);
    }
  }

  _hatchEgg(e) {
    let style = this.rng() < 0.5 ? e.sa : e.sb;
    if (this.rng() < 0.12) style = (this.rng() * 3) | 0; // mutation
    const seed = (((e.pa * 31 + e.pb * 17) | 0) + ((this.rng() * 1e9) | 0)) >>> 0;
    const personas = ['bold', 'shy', 'playful'];
    const k = this.koi.spawnKoi({
      persona: personas[(this.rng() * 3) | 0],
      style: style,
      patternSeed: seed,
      growthT: 0.12, // fry
      name: this._newName(),
      x: e.nx - 0.5,
      y: (e.ny - 0.5) * this.water.aspect,
      age: 0, meals: 0, contentment: 0.7,
    });
    this.life.removeEgg(e.id);
    if (k) {
      this._discover(k);
      this._jT('hatch', {
        name: k.name,
        style: SYS_STYLE_NAMES[style] || 'koi',
        mark: this._pick(SYS_MARKS),
      });
      try { if (this.onMilestone) this.onMilestone('hatch', k); } catch (err) {}
    }
  }

  /* ================= visitors ================= */

  _startFrog() {
    const pads = this.life.pads;
    if (!pads.length || this._frog) return;
    const i = (this.rng() * pads.length) | 0;
    this._frog = {
      pad: i, t: 0, life: 120 + this.rng() * 60,
      hopT: 2 + this.rng() * 3, hopping: 0, from: i, to: i,
    };
    this._jT('frog', {});
    if (this.audio) this.audio.frog();
  }

  _startHeron() {
    if (this._heron) return;
    // land at the pond edge, top-right-ish
    const pts = this.water.pondOutline(48);
    let bi = 0, bd = 1e9;
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i][0] - 0.72, dy = pts[i][1] - 0.30;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; bi = i; }
    }
    const p = pts[bi];
    this._heron = { nx: p[0], ny: p[1], t: 0, dur: 35 + this.rng() * 25, leaving: 0 };
    this.koi.setThreat(p[0] - 0.5, (p[1] - 0.5) * this.water.aspect);
    const hr = this._hourNow();
    this._jT('heron', { when: (hr < 10 ? 'dawn' : hr < 17 ? 'midday' : 'dusk') });
    if (this.audio) this.audio.heron();
  }

  _visitorUpdate(dt) {
    // frog: hops between pads, plips on landing, leaves after a while
    const F = this._frog;
    if (F) {
      F.t += dt;
      const pads = this.life.pads;
      if (F.hopping > 0) {
        F.hopping += dt / 0.45;
        if (F.hopping >= 1) {
          F.hopping = 0; F.pad = F.to; F.hopT = 3 + this.rng() * 5;
          const p = pads[F.pad];
          if (p) {
            this.water.disturb(p.nx, p.ny, 2.2, 0.9);
            this.life.spawnRing(p.nx, p.ny, 0.024);
            if (this.audio) this.audio.plip();
          }
        }
      } else {
        F.hopT -= dt;
        if (F.hopT <= 0 && pads.length > 1) {
          let to = (this.rng() * pads.length) | 0;
          if (to === F.pad) to = (to + 1) % pads.length;
          F.from = F.pad; F.to = to; F.hopping = 0.0001;
        }
      }
      if (F.t > F.life || this.nightF > 0.75) this._frog = null;
    }

    // heron: stands, then flies off; koi hide while it's here
    const H = this._heron;
    if (H) {
      H.t += dt;
      if (H.leaving > 0) {
        H.leaving += dt / 3;
        if (H.leaving >= 1) { this._heron = null; this.koi.setThreat(null); }
      } else if (H.t >= H.dur) {
        H.leaving = 0.0001;
      }
    }

    // butterflies: 3 by day, none by night
    const want = this.dayF > 0.6 ? 3 : 0;
    while (this._butterflies.length < want) {
      this._butterflies.push({
        t: this.rng() * 100,
        cx: 0.25 + this.rng() * 0.5, cy: 0.15 + this.rng() * 0.3,
        ax: 0.10 + this.rng() * 0.12, ay: 0.06 + this.rng() * 0.08,
        f1: 0.5 + this.rng() * 0.5, f2: 0.4 + this.rng() * 0.5,
        col: this.rng() < 0.5 ? '#f2e6c8' : '#e8b4a0',
      });
    }
    while (this._butterflies.length > want) this._butterflies.pop();
    for (let i = 0; i < this._butterflies.length; i++) this._butterflies[i].t += dt;

    // fireflies: on at night
    const night = this.nightF > 0.5;
    for (let i = 0; i < this._flies.length; i++) this._flies[i].on = night;
  }

  /* ================= ascension ================= */

  _maybeAscension() {
    if (this._asc) return;
    const cands = [];
    for (let i = 0; i < this.koi.koi.length; i++) {
      const k = this.koi.koi[i];
      if (k.growthT >= 1 && k.contentment >= 0.75 && k.age > 3600) cands.push(k);
    }
    if (cands.length && this.rng() < 0.4) {
      this._startAscension(cands[(this.rng() * cands.length) | 0], 18);
    }
  }

  _startAscension(k, dur) {
    k.hold = { x: 0, y: -0.06 }; // drift to the ceremony point
    this._asc = { id: k.id, t: 0, dur: dur || 18, ringT: 0 };
    if (this.audio) this.audio.ascension();
  }

  // test/debug: run an accelerated ceremony on a suitable koi
  debugAscension() {
    let k = null;
    for (let i = 0; i < this.koi.koi.length; i++) {
      if (this.koi.koi[i].growthT >= 1) { k = this.koi.koi[i]; break; }
    }
    if (!k) return false;
    k.contentment = 1; k.age = 99999;
    this._startAscension(k, 2.5);
    return true;
  }

  _ascensionUpdate(dt) {
    const A = this._asc;
    if (!A) { this.bloomF = Math.max(0, this.bloomF - dt * 0.5); return; }
    const k = this.koi.koiById(A.id);
    if (!k) { this._asc = null; return; }
    A.t += dt;
    // bloom ramps up over the first third, releases at the end
    const up = sysSmooth(0, A.dur * 0.35, A.t);
    const down = 1 - sysSmooth(A.dur * 0.85, A.dur, A.t);
    this.bloomF = Math.min(up, down);
    // expanding rings from the rising koi
    A.ringT -= dt;
    if (A.ringT <= 0) {
      A.ringT = 2;
      const ux = k.x + 0.5, uy = k.y / this.water.aspect + 0.5;
      this.water.disturb(ux, uy, 3, 1.6);
      this.life.spawnRing(ux, uy, 0.05);
    }
    if (A.t >= A.dur) {
      const name = k.name || 'a koi';
      this.koi.removeKoi(A.id);
      const bk = SYS_BLESS_KEYS[(this.rng() * 3) | 0];
      this.blessings[bk] = (this.blessings[bk] || 0) + 1;
      this._jT('ascension', { name: name, blessing: SYS_BLESSINGS[bk] });
      this._asc = null;
      try { if (this.onMilestone) this.onMilestone('ascension', { name: name }); } catch (err) {}
    }
  }

  /* ================= air-canvas critters ================= */

  _renderAir() {
    const cv = this.air;
    if (!cv) return;
    const x = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    if (!W || !H) return;
    x.clearRect(0, 0, W, H);
    const t = this.time;
    const uv2px = (nx, ny) => [nx * W, ny * H];

    // fireflies
    if (this.nightF > 0.5 && this._glowTex) {
      for (let i = 0; i < this._flies.length; i++) {
        const f = this._flies[i];
        if (!f.on) continue;
        const blink = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * f.sp * 2 + f.ph), 2);
        const a = this.nightF * blink;
        if (a < 0.03) continue;
        // reduced motion: fireflies hold still, blinking gently
        const rm = this.reducedMotion;
        const px = (f.x + (rm ? 0 : 0.05 * Math.sin(t * 0.23 * f.sp + f.ph))) * W;
        const py = (f.y + (rm ? 0 : 0.04 * Math.cos(t * 0.31 * f.sp + f.ph * 1.7))) * H;
        const s = 22 + 8 * Math.sin(t * f.sp + f.ph);
        x.globalAlpha = a;
        x.drawImage(this._glowTex, px - s / 2, py - s / 2, s, s);
      }
      x.globalAlpha = 1;
    }

    // butterflies
    for (let i = 0; i < this._butterflies.length; i++) {
      const b = this._butterflies[i];
      const px = (b.cx + b.ax * Math.sin(b.t * b.f1)) * W;
      const py = (b.cy + b.ay * Math.sin(b.t * b.f2 * 1.3)) * H;
      const flap = Math.sin(b.t * 16) * 0.9;
      x.save();
      x.translate(px, py);
      x.fillStyle = b.col;
      x.globalAlpha = 0.92;
      for (let s = -1; s <= 1; s += 2) {
        x.save();
        x.rotate(s * (0.5 + flap * 0.5));
        x.beginPath();
        x.ellipse(s * 7, 0, 7, 4.5, 0, 0, 6.2832);
        x.fill();
        x.restore();
      }
      x.fillStyle = '#4a3b2c';
      x.beginPath(); x.ellipse(0, 0, 1.6, 4, 0, 0, 6.2832); x.fill();
      x.restore();
    }
    x.globalAlpha = 1;

    // frog
    const F = this._frog;
    if (F) {
      const pads = this.life.pads;
      const pa = pads[F.from], pb = pads[F.to];
      let nx, ny, lift = 0;
      if (F.hopping > 0 && pa && pb) {
        const h = sysSmooth(0, 1, Math.min(1, F.hopping));
        nx = pa.nx + (pb.nx - pa.nx) * h;
        ny = pa.ny + (pb.ny - pa.ny) * h;
        lift = Math.sin(h * Math.PI) * 0.03;
      } else {
        const p = pads[F.pad];
        if (!p) { this._frog = null; return; }
        nx = p.nx; ny = p.ny;
      }
      const bob = this.water.heightAt(nx, ny) * 0.012;
      const fp = uv2px(nx, ny + bob - lift);
      const s = Math.min(W, H) / 390; // scale to device
      x.save();
      x.translate(fp[0], fp[1]);
      x.scale(s, s);
      x.fillStyle = '#3d5a3a';
      x.beginPath(); x.ellipse(0, 0, 11, 7.5, 0, 0, 6.2832); x.fill(); // body
      x.beginPath(); x.ellipse(7, -4, 6, 5, 0, 0, 6.2832); x.fill();   // head
      x.fillStyle = '#577a52';
      x.beginPath(); x.ellipse(0, 2.5, 7, 4, 0, 0, 6.2832); x.fill();  // belly
      x.fillStyle = '#f2ecd8';                                          // eyes
      x.beginPath(); x.arc(5, -8, 2.4, 0, 6.2832); x.fill();
      x.beginPath(); x.arc(10, -8, 2.4, 0, 6.2832); x.fill();
      x.fillStyle = '#1c241c';
      x.beginPath(); x.arc(5, -8, 1.1, 0, 6.2832); x.fill();
      x.beginPath(); x.arc(10, -8, 1.1, 0, 6.2832); x.fill();
      x.restore();
    }

    // heron
    const Hn = this._heron;
    if (Hn) {
      let alpha = 1, dx = 0, dy = 0;
      if (Hn.leaving > 0) {
        const l = Math.min(1, Hn.leaving);
        dy = -l * l * H * 0.45; dx = l * l * W * 0.35;
        alpha = 1 - l;
      }
      const hp = uv2px(Hn.nx, Hn.ny);
      const s = Math.min(W, H) / 390;
      const sway = Math.sin(t * 0.9) * 2;
      x.save();
      x.translate(hp[0] + dx, hp[1] + dy);
      x.scale(s, s);
      x.globalAlpha = Math.max(0, alpha);
      x.strokeStyle = '#6f747c'; x.lineWidth = 2.4; x.lineCap = 'round';
      x.beginPath(); x.moveTo(-3, 0); x.lineTo(-3, -34); x.stroke(); // legs
      x.beginPath(); x.moveTo(3, 0); x.lineTo(3, -34); x.stroke();
      x.fillStyle = '#8a8f96';
      x.beginPath(); x.ellipse(0, -42, 11, 15, 0.15, 0, 6.2832); x.fill(); // body
      x.strokeStyle = '#7d828a'; x.lineWidth = 5;
      x.beginPath(); x.moveTo(6, -52);                                    // neck
      x.quadraticCurveTo(14 + sway, -66, 8 + sway, -78);
      x.stroke();
      x.fillStyle = '#8a8f96';
      x.beginPath(); x.ellipse(8 + sway, -80, 5, 3.6, 0.2, 0, 6.2832); x.fill(); // head
      x.strokeStyle = '#c9a44a'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(12 + sway, -80); x.lineTo(26 + sway, -77); x.stroke(); // beak
      x.restore();
      x.globalAlpha = 1;
    }
  }

  /* ================= save / load / catch-up ================= */

  hasSave() {
    try { return !!localStorage.getItem(SYS_SAVE_KEY); } catch (e) { return false; }
  }

  save() {
    if (this.saveEnabled === false) return false;
    const data = {
      v: 1,
      savedAt: Date.now(),
      koi: this.koi.serialize(),
      garden: this.garden.serialize(),
      life: {
        clarity: +this.life.clarity.toFixed(3),
        eggs: this.life.eggs.map(e => ({
          nx: +e.nx.toFixed(4), ny: +e.ny.toFixed(4), t: Math.round(e.t),
          hatchT: Math.round(e.hatchT),
          a: e.a, b: e.b, pa: e.pa, pb: e.pb, sa: e.sa, sb: e.sb, na: e.na, nb: e.nb,
        })),
      },
      sys: {
        journal: this.journal.slice(-120),
        discovered: this.discovered,
        blessings: this.blessings,
        usedNames: this._usedNames,
        heronDoneDay: this._heronDoneDay,
        frogDoneDay: this._frogDoneDay,
        visitorNoteDay: this._visitorNoteDay,
        onboard: this.onboard,
        audio: this.audio ? this.audio.serialize() : null,
      },
    };
    try {
      localStorage.setItem(SYS_SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (e) { return false; }
  }

  load() {
    let raw = null;
    try { raw = localStorage.getItem(SYS_SAVE_KEY); } catch (e) {}
    if (!raw) { this._freshStart(); return 'fresh'; }
    let d = null;
    try { d = JSON.parse(raw); } catch (e) {}
    if (!d || d.v !== 1) { this._freshStart(); return 'corrupt'; }

    this.koi.deserialize(d.koi || []);
    this.garden.deserialize(d.garden || {});
    this.life.clarity = (d.life && d.life.clarity != null) ? d.life.clarity : 0.85;
    this.life.eggs.length = 0;
    for (const e of (d.life && d.life.eggs) || []) this.life.spawnEgg(e.nx, e.ny, e);

    const s = d.sys || {};
    this.journal = s.journal || [];
    this.discovered = s.discovered || {};
    this.blessings = s.blessings || { clarity: 0, growth: 0, visitors: 0 };
    this._usedNames = s.usedNames || {};
    this._heronDoneDay = s.heronDoneDay != null ? s.heronDoneDay : -1;
    this._frogDoneDay = s.frogDoneDay != null ? s.frogDoneDay : -1;
    this._visitorNoteDay = s.visitorNoteDay != null ? s.visitorNoteDay : -1;
    if (s.onboard) for (const k of ['touch', 'feed', 'rake']) if (s.onboard[k]) this.onboard[k] = true;
    if (s.audio && this.audio) this.audio.deserialize(s.audio);
    for (let i = 0; i < this.koi.koi.length; i++) {
      const k = this.koi.koi[i];
      if (k.name) this._usedNames[k.name] = 1;
      this._discover(k);
    }

    const elapsed = Math.min(Math.max(0, (Date.now() - d.savedAt) / 1000), 7 * 86400);
    if (elapsed > 1) this._catchUp(elapsed);
    return 'loaded';
  }

  _freshStart() {
    for (let i = 0; i < this.koi.koi.length; i++) {
      const k = this.koi.koi[i];
      if (!k.name) k.name = this._newName();
      this._discover(k);
    }
    this._jT('first', {});
  }

  _catchUp(elapsed) {
    const diff = { grew: 0, hatched: 0, moss0: this.garden.mossCoverage(), heron: false, frog: false };
    // koi growth over the absence (gentle: unfed rate, no punishment)
    for (let i = 0; i < this.koi.koi.length; i++) {
      const k = this.koi.koi[i];
      const before = k.growthT;
      const rate = (1 / (20 * 60)) * 0.55 * (1 + 0.25 * this.blessings.growth);
      k.growthT = Math.min(1, k.growthT + rate * elapsed);
      k.age += elapsed;
      k.contentment = Math.max(0.25, k.contentment - (elapsed / 86400) * 0.08);
      if (before < 1 && k.growthT >= 1) { diff.grew++; this._jT('adult', { name: k.name }); }
      else if (before < 0.45 && k.growthT >= 0.45) { diff.grew++; this._jT('juvenile', { name: k.name }); }
    }
    // moss: fast-forward the garden sim (capped — the sim is the expensive part)
    this.garden.fastForward(Math.min(elapsed, 1800));
    diff.mossDelta = this.garden.mossCoverage() - diff.moss0;
    // eggs hatch in order
    const eggs = this.life.eggs.slice();
    for (let i = 0; i < eggs.length; i++) {
      eggs[i].t += elapsed;
      if (eggs[i].t >= eggs[i].hatchT) { this._hatchEgg(eggs[i]); diff.hatched++; }
    }
    // visitor rolls, one per day missed
    const days = Math.min(7, Math.floor(elapsed / 86400));
    for (let d = 0; d <= days; d++) {
      if (this.rng() < 0.22 * (1 + 0.75 * this.blessings.visitors)) diff.heron = true;
      if (this.rng() < 0.5 * (1 + 0.75 * this.blessings.visitors)) diff.frog = true;
    }
    // clarity drifts home
    this.life.clarity += (0.8 - this.life.clarity) * Math.min(1, elapsed / 3600);

    // the "while you were away" summary — always a gift, never guilt
    this._jT('away_head', {});
    let said = false;
    if (diff.grew > 0) { this._jT('away_growth', { n: diff.grew }); said = true; }
    if (diff.hatched > 0) { this._jT('away_hatch', { n: diff.hatched }); said = true; }
    if (diff.mossDelta > 0.0002) { this._jT('away_moss', {}); said = true; }
    if (diff.heron) { this._jT('away_heron', {}); said = true; }
    if (diff.frog) { this._jT('away_frog', {}); said = true; }
    if (!said) this._jT('away_quiet', {});
  }

  /* ================= debug / test hooks ================= */

  // Force two adults to be well-fed and adjacent, then run the breeder.
  // (Positions are set directly: systems.fastForward doesn't step the koi
  // engine, so steering can't bring them together here.)
  debugBreed() {
    const ks = this.koi.koi;
    if (ks.length < 2) return false;
    const a = ks[0], b = ks[1];
    for (const k of [a, b]) {
      k.growthT = 1; k.meals = 3; k.fedT = this.time; k.fedBoost = 1;
      k.contentment = 0.9; k.courtship = true;
    }
    b.x = a.x + 0.02; b.y = a.y; // snuggled
    this.fastForward(20);
    return this.life.eggs.length > 0;
  }

  debugHatch() {
    for (let i = 0; i < this.life.eggs.length; i++) this.life.eggs[i].t = this.life.eggs[i].hatchT;
    const before = this.koi.koi.length;
    this.fastForward(2);
    return this.koi.koi.length > before;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Systems };
}
