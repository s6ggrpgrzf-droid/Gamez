/* AudioEngine — Moss & Stone phase 6.
 * Generative zen soundscape. Zero audio files: everything is synthesized in
 * WebAudio (Karplus-Strong koto plucks, filtered-noise beds, procedural SFX).
 * Fully offline. Silent degradation: if WebAudio is unavailable every method
 * is a safe no-op (every cue already has a visual twin).
 *
 * Buses: music / ambience / sfx -> master -> gentle compressor -> destination.
 * Voice cap 12 (steal quietest/oldest). Scheduler tick() is allocation-free.
 * AudioContext is created/resumed on a user gesture (call unlock() from
 * pointerdown). Suspends on page hide.
 *
 * Musical choice: the insen scale (D Eb G A C) — a Japanese pentatonic with a
 * floating, unresolved quality. Pentatonic = the generative random walk can
 * never sound wrong, and never audibly repeats.
 */
'use strict';

function aeMulberry32(a) {
  return function () {
    a |= 0; a = (a = (a + 0x6D2B79F5) | 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// insen scale, semitone offsets from root, two octaves
var AE_INSEN = [0, 1, 5, 7, 8, 12, 13, 17, 19, 20];
var AE_ROOT = 146.83; // D3

function aeFreq(degree) {
  const d = AE_INSEN[((degree % 10) + 10) % 10] + 12 * Math.floor(degree / 10);
  return AE_ROOT * Math.pow(2, d / 12);
}

class AudioEngine {
  constructor(opts) {
    opts = opts || {};
    this.rng = aeMulberry32(opts.seed == null ? 31337 : opts.seed);
    this.ok = false;
    this.ctx = null;
    this.muted = false;
    this.vol = { music: 0.5, amb: 0.6, sfx: 0.8, master: 0.9 };

    // buses (built in _buildGraph)
    this._master = null; this._music = null; this._amb = null; this._sfx = null;

    // voice pool: 12 slots, steal quietest/oldest
    this._voices = [];
    for (let i = 0; i < 12; i++) {
      this._voices.push({ live: false, src: null, gain: null, t0: 0, pri: 1, lvl: 0 });
    }

    // precomputed assets
    this._pluckBuf = new Array(10).fill(null); // KS buffer per scale degree
    this._noiseBuf = null;                     // 2s white noise, reused

    // persistent bed nodes
    this._bedGain = null; this._bedFilter = null;
    this._rainGain = null;
    this._rakeGain = null; this._rakeFilter = null;

    // scheduler state (tick is allocation-free)
    this._nextPluck = 0;
    this._degree = 4;
    this._nextCricket = 0;
    this._nextFrog = 0;
    this._nextBird = 0;
    this._prevDayF = 1;
    this._env = { dayF: 1, nightF: 0, duskF: 0, raining: false, gloom: 0 };
    this._pluckCount = 0;
    this._unlocked = false;
  }

  /* ================= lifecycle ================= */

  // Safe to call on every pointerdown; idempotent. Must be called from a
  // user gesture at least once for sound to start.
  unlock() {
    if (this._unlocked) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(function () {});
      }
      return this.ok;
    }
    this._unlocked = true;
    let AC = null;
    try {
      AC = window.AudioContext || window.webkitAudioContext;
    } catch (e) { AC = null; }
    if (!AC) { this.ok = false; return false; }
    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch (e) { this.ok = false; return false; }
    try {
      this._buildGraph();
      this._startBeds();
    } catch (e) { this.ok = false; return false; }
    this.ok = true;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(function () {});
    }
    const t = this.ctx.currentTime;
    this._nextPluck = t + 1.5;
    this._nextCricket = t + 5;
    this._nextFrog = t + 8;
    this._nextBird = t + 6;
    return true;
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(function () {});
    }
  }
  resume() {
    if (this.ctx && this.ctx.state === 'suspended' && this._unlocked) {
      this.ctx.resume().catch(function () {});
    }
  }

  _buildGraph() {
    const ctx = this.ctx;
    this._master = ctx.createGain();
    this._master.gain.value = this.muted ? 0 : this.vol.master;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this._master.connect(comp);
    comp.connect(ctx.destination);

    this._music = ctx.createGain(); this._music.gain.value = this.vol.music;
    this._amb = ctx.createGain(); this._amb.gain.value = this.vol.amb;
    this._sfx = ctx.createGain(); this._sfx.gain.value = this.vol.sfx;
    this._music.connect(this._master);
    this._amb.connect(this._master);
    this._sfx.connect(this._master);

    // shared 2s noise buffer
    const len = Math.floor(ctx.sampleRate * 2);
    this._noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  _startBeds() {
    const ctx = this.ctx;
    // water bed: looped noise -> lowpass with a slow LFO on the cutoff
    const bed = ctx.createBufferSource();
    bed.buffer = this._noiseBuf; bed.loop = true;
    this._bedFilter = ctx.createBiquadFilter();
    this._bedFilter.type = 'lowpass';
    this._bedFilter.frequency.value = 380;
    this._bedFilter.Q.value = 0.4;
    this._bedGain = ctx.createGain();
    this._bedGain.gain.value = 0.05;
    bed.connect(this._bedFilter);
    this._bedFilter.connect(this._bedGain);
    this._bedGain.connect(this._amb);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 120;
    lfo.connect(lfoG);
    lfoG.connect(this._bedFilter.frequency);
    bed.start(); lfo.start();

    // rain patter bed (gain driven by weather)
    const rain = ctx.createBufferSource();
    rain.buffer = this._noiseBuf; rain.loop = true;
    rain.playbackRate.value = 0.7;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2800;
    this._rainGain = ctx.createGain();
    this._rainGain.gain.value = 0;
    rain.connect(hp); hp.connect(this._rainGain); this._rainGain.connect(this._amb);
    rain.start();

    // rake hiss (gain/filter driven by stroke speed; silent until raking)
    const rake = ctx.createBufferSource();
    rake.buffer = this._noiseBuf; rake.loop = true;
    rake.playbackRate.value = 1.3;
    this._rakeFilter = ctx.createBiquadFilter();
    this._rakeFilter.type = 'bandpass';
    this._rakeFilter.frequency.value = 1400;
    this._rakeFilter.Q.value = 1.1;
    this._rakeGain = ctx.createGain();
    this._rakeGain.gain.value = 0;
    rake.connect(this._rakeFilter);
    this._rakeFilter.connect(this._rakeGain);
    this._rakeGain.connect(this._sfx);
    rake.start();
  }

  /* Karplus-Strong plucked string, rendered once per scale degree and cached. */
  _pluckBuffer(degree) {
    const idx = ((degree % 10) + 10) % 10;
    if (this._pluckBuf[idx]) return this._pluckBuf[idx];
    const ctx = this.ctx;
    const freq = aeFreq(idx);
    const sr = ctx.sampleRate;
    const N = Math.max(2, Math.round(sr / freq));
    const secs = 2.2;
    const len = Math.floor(sr * secs);
    const buf = ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const line = new Float32Array(N);
    for (let i = 0; i < N; i++) line[i] = Math.random() * 2 - 1;
    const decay = 0.996;
    let p = 0;
    for (let i = 0; i < len; i++) {
      const cur = line[p];
      const nxt = line[(p + 1) % N];
      line[p] = decay * 0.5 * (cur + nxt);
      out[i] = cur * 0.9;
      p = (p + 1) % N;
    }
    // gentle fade on the last 100ms to avoid a click
    const fade = Math.floor(sr * 0.1);
    for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
    this._pluckBuf[idx] = buf;
    return buf;
  }

  /* ================= voices ================= */

  _alloc(pri, lvl) {
    const now = this.ctx ? this.ctx.currentTime : 0;
    let free = null;
    for (let i = 0; i < this._voices.length; i++) {
      if (!this._voices[i].live) { free = this._voices[i]; break; }
    }
    if (!free) {
      // steal quietest/oldest
      let bi = 0, bs = Infinity;
      for (let i = 0; i < this._voices.length; i++) {
        const v = this._voices[i];
        const s = v.lvl * v.pri + (now - v.t0) * 0.02;
        if (s < bs) { bs = s; bi = i; }
      }
      free = this._voices[bi];
      try {
        if (free.src) { free.src.onended = null; free.src.stop(0); }
      } catch (e) {}
      try { if (free.gain) free.gain.disconnect(); } catch (e) {}
    }
    free.live = true; free.t0 = now; free.pri = pri; free.lvl = lvl;
    const v = free;
    const self = this;
    // released onended; guard double-release
    v._release = function () {
      if (!v.live) return;
      v.live = false;
      try { if (v.gain) v.gain.disconnect(); } catch (e) {}
      v.src = null; v.gain = null;
    };
    return v;
  }

  // one-shot buffer voice through a bus with an exp-decay envelope
  _hit(buf, bus, opts) {
    if (!this.ok) return;
    opts = opts || {};
    const ctx = this.ctx;
    const v = this._alloc(opts.pri || 1, opts.lvl || 0.5);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (opts.rate) src.playbackRate.value = opts.rate;
    const g = ctx.createGain();
    const t = ctx.currentTime + (opts.at || 0);
    const peak = opts.gain == null ? 0.2 : opts.gain;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + (opts.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0002, t + (opts.decay || 0.6));
    src.connect(g);
    let out = g;
    if (opts.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = opts.pan;
      g.connect(p); out = p;
    }
    out.connect(bus);
    v.src = src; v.gain = g;
    const rel = v._release;
    src.onended = function () { rel(); };
    try { src.start(t); src.stop(t + (opts.decay || 0.6) + 0.15); }
    catch (e) { rel(); }
  }

  // one-shot oscillator blip with pitch glide
  _blip(bus, opts) {
    if (!this.ok) return;
    opts = opts || {};
    const ctx = this.ctx;
    const v = this._alloc(opts.pri || 1, opts.lvl || 0.4);
    const o = ctx.createOscillator();
    o.type = opts.type || 'sine';
    const t = ctx.currentTime + (opts.at || 0);
    o.frequency.setValueAtTime(opts.f0 || 440, t);
    if (opts.f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.f1), t + (opts.dur || 0.2));
    const g = ctx.createGain();
    const peak = opts.gain == null ? 0.15 : opts.gain;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + (opts.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0002, t + (opts.dur || 0.2));
    o.connect(g);
    let out = g;
    if (opts.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = opts.lp;
      g.connect(f); out = f;
    }
    out.connect(bus);
    v.src = o; v.gain = g;
    const rel = v._release;
    o.onended = function () { rel(); };
    try { o.start(t); o.stop(t + (opts.dur || 0.2) + 0.1); }
    catch (e) { rel(); }
  }

  // filtered noise burst
  _nz(bus, opts) {
    if (!this.ok) return;
    opts = opts || {};
    const ctx = this.ctx;
    const v = this._alloc(opts.pri || 1, opts.lvl || 0.4);
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.playbackRate.value = opts.rate || 1;
    const f = ctx.createBiquadFilter();
    f.type = opts.ftype || 'lowpass';
    f.frequency.value = opts.freq || 800;
    f.Q.value = opts.q || 0.8;
    const g = ctx.createGain();
    const t = ctx.currentTime + (opts.at || 0);
    const peak = opts.gain == null ? 0.15 : opts.gain;
    const dur = opts.dur || 0.12;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0002, t + dur);
    src.connect(f); f.connect(g); g.connect(bus);
    v.src = src; v.gain = g;
    const rel = v._release;
    src.onended = function () { rel(); };
    try {
      src.start(t, Math.random() * 1.5, dur + 0.1);
      src.stop(t + dur + 0.15);
    } catch (e) { rel(); }
  }

  /* ================= generative music ================= */

  _schedulePluck(t, degree, gainMul) {
    const r = this.rng;
    this._hit(this._pluckBuffer(degree), this._music, {
      gain: 0.22 * (0.7 + r() * 0.3) * (gainMul || 1),
      decay: 2.0,
      pan: (r() - 0.5) * 0.6,
      pri: 2, lvl: 0.5,
      at: Math.max(0, t - this.ctx.currentTime),
    });
    this._pluckCount++;
    // occasional soft harmony a few degrees below
    if (r() < 0.15) {
      this._hit(this._pluckBuffer(degree - 3), this._music, {
        gain: 0.11 * (gainMul || 1),
        decay: 2.2,
        pan: (r() - 0.5) * 0.5,
        pri: 2, lvl: 0.3,
        at: Math.max(0, t - this.ctx.currentTime) + 0.02,
      });
      this._pluckCount++;
    }
  }

  _musicTick(t) {
    if (t < this._nextPluck) return;
    const r = this.rng;
    const night = this._env.nightF;
    // random walk on scale degrees, 0..9
    const step = r();
    if (step < 0.55) this._degree += r() < 0.5 ? -1 : 1;
    else if (step < 0.75) this._degree += r() < 0.5 ? -2 : 2;
    else if (step < 0.85) this._degree += (r() * 5) | 0 + (r() < 0.5 ? -4 : 0);
    if (this._degree < 0) this._degree = 0;
    if (this._degree > 9) this._degree = 9;
    if (r() >= 0.22) {
      this._schedulePluck(t + r() * 0.08, this._degree, 1 - night * 0.25);
    }
    // sparse: 2-6s by day, 4-10s at night. silence is part of the music.
    this._nextPluck = t + (2 + r() * 4) * (1 + night * 0.9);
  }

  _cricketsTick(t) {
    if (this._env.nightF < 0.5 || t < this._nextCricket) return;
    const r = this.rng;
    const n = 3 + ((r() * 3) | 0);
    for (let i = 0; i < n; i++) {
      this._blip(this._amb, {
        type: 'sine', f0: 4100 + r() * 500, dur: 0.05,
        gain: 0.012, at: i * 0.075, pri: 0.5, lvl: 0.1,
      });
    }
    this._nextCricket = t + 4 + r() * 6;
  }

  _frogsTick(t) {
    if (this._env.duskF < 0.45 || t < this._nextFrog) return;
    const r = this.rng;
    const n = 2 + ((r() * 2) | 0);
    for (let i = 0; i < n; i++) {
      this._blip(this._amb, {
        type: 'triangle', f0: 165 + r() * 30, f1: 105, dur: 0.13,
        gain: 0.05, lp: 900, at: i * 0.19, pri: 0.5, lvl: 0.2,
      });
    }
    this._nextFrog = t + 7 + r() * 9;
  }

  _birdsTick(t) {
    // dawn: dayF rising through the golden zone (tracked via _prevDayF)
    const rising = this._env.dayF > this._prevDayF + 0.0004;
    if (!(rising && this._env.duskF > 0.35) || t < this._nextBird) return;
    const r = this.rng;
    const f0 = 2800 + r() * 800;
    this._blip(this._amb, {
      type: 'sine', f0: f0, f1: f0 * 1.4, dur: 0.16,
      gain: 0.02, at: 0, pri: 0.5, lvl: 0.12,
    });
    this._blip(this._amb, {
      type: 'sine', f0: f0 * 1.4, f1: f0 * 1.1, dur: 0.14,
      gain: 0.016, at: 0.18, pri: 0.5, lvl: 0.1,
    });
    this._nextBird = t + 9 + r() * 12;
  }

  /* ================= per-frame ================= */

  // nowMs: performance.now(); env: {dayF, nightF, duskF, raining, gloom}
  tick(nowMs, env) {
    if (!this.ok || !this.ctx) return;
    if (env) {
      this._env.dayF = env.dayF == null ? 1 : env.dayF;
      this._env.nightF = env.nightF == null ? 0 : env.nightF;
      this._env.duskF = env.duskF == null ? 0 : env.duskF;
      const raining = !!env.raining;
      if (raining !== this._env.raining) {
        this._env.raining = raining;
        const t = this.ctx.currentTime;
        this._rainGain.gain.setTargetAtTime(raining ? 0.055 : 0, t, 1.2);
        // rain hushes the music bed a touch
        this._bedGain.gain.setTargetAtTime(raining ? 0.065 : 0.05, t, 1.5);
      }
      this._env.gloom = env.gloom || 0;
    }
    const t = this.ctx.currentTime;
    this._musicTick(t);
    this._cricketsTick(t);
    this._frogsTick(t);
    this._birdsTick(t);
    this._prevDayF = this._env.dayF;
  }

  /* ================= interaction SFX ================= */

  // soft droplet plip on touch ripples; pitch wanders the scale
  plip() {
    if (!this.ok) return;
    const r = this.rng;
    const deg = 5 + ((r() * 5) | 0);
    this._blip(this._sfx, {
      f0: aeFreq(deg) * 2, f1: aeFreq(deg) * 1.2,
      dur: 0.22, gain: 0.10, pri: 1, lvl: 0.3,
    });
  }

  // pellet plops: woody knock + tiny splash, staggered
  plop(n) {
    if (!this.ok) return;
    n = Math.min(4, n | 0 || 1);
    for (let i = 0; i < n; i++) {
      const at = i * 0.06;
      this._nz(this._sfx, { freq: 900, dur: 0.07, gain: 0.10, at: at, pri: 1, lvl: 0.3 });
      this._blip(this._sfx, {
        f0: 190, f1: 95, dur: 0.14, gain: 0.09, at: at, pri: 1, lvl: 0.25,
      });
    }
  }

  // koi gulp: tiny underwater blip
  gulp() {
    if (!this.ok) return;
    this._blip(this._sfx, {
      f0: 300, f1: 140, dur: 0.11, gain: 0.06, lp: 1200, pri: 0.8, lvl: 0.2,
    });
  }

  // stone set down: soft knock + low thump
  stone() {
    if (!this.ok) return;
    this._nz(this._sfx, { freq: 520, dur: 0.06, gain: 0.12, pri: 1, lvl: 0.3 });
    this._blip(this._sfx, { f0: 95, f1: 60, dur: 0.2, gain: 0.10, pri: 1, lvl: 0.25 });
  }

  // rake hiss follows stroke speed; call rakeSet(speed01) each move
  rakeStart() {
    if (!this.ok || !this._rakeGain) return;
    this._rakeOn = true;
  }
  rakeSet(speed01) {
    if (!this.ok || !this._rakeGain || !this._rakeOn) return;
    const t = this.ctx.currentTime;
    const s = Math.max(0, Math.min(1, speed01));
    this._rakeFilter.frequency.setTargetAtTime(900 + s * 2600, t, 0.05);
    this._rakeGain.gain.setTargetAtTime(s * 0.09, t, 0.05);
  }
  rakeEnd() {
    if (!this.ok || !this._rakeGain) return;
    this._rakeOn = false;
    this._rakeGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
  }

  // frog croak (also fires from the ambient scheduler at dusk)
  frog() {
    if (!this.ok) return;
    const r = this.rng;
    for (let i = 0; i < 3; i++) {
      this._blip(this._amb, {
        type: 'triangle', f0: 150 + r() * 40, f1: 100, dur: 0.14,
        gain: 0.07, lp: 800, at: i * 0.2, pri: 1, lvl: 0.25,
      });
    }
  }

  // heron: soft wing whoosh
  heron() {
    if (!this.ok) return;
    this._nz(this._amb, {
      ftype: 'bandpass', freq: 600, q: 0.7, dur: 0.7,
      gain: 0.05, rate: 0.5, pri: 1, lvl: 0.25,
    });
  }

  // ascension: the one moment of real musical presence — a slow warm swell
  ascension() {
    if (!this.ok) return;
    const chord = [0, 3, 4, 7]; // D G A D across the insen walk
    for (let i = 0; i < chord.length; i++) {
      this._schedulePluck(this.ctx.currentTime + i * 0.45, chord[i], 1.2);
    }
    // low pad swell underneath
    const ctx = this.ctx;
    const v = this._alloc(3, 0.8);
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.10, t + 2.5);
    g.gain.exponentialRampToValueAtTime(0.0002, t + 9);
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = AE_ROOT / 2;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = AE_ROOT / 2 * 1.5;
    o1.connect(g); o2.connect(g); g.connect(this._music);
    v.src = o1; v.gain = g;
    const rel = v._release;
    const stopAll = function () {
      try { o1.stop(); } catch (e) {}
      try { o2.stop(); } catch (e) {}
      rel();
    };
    o1.onended = stopAll;
    try { o1.start(t); o2.start(t); o1.stop(t + 9.5); o2.stop(t + 9.5); }
    catch (e) { rel(); }
  }

  /* ================= settings / persistence ================= */

  setMuted(m) {
    this.muted = !!m;
    if (this._master && this.ctx) {
      this._master.gain.setTargetAtTime(
        this.muted ? 0 : this.vol.master, this.ctx.currentTime, 0.05);
    }
  }

  serialize() {
    return {
      muted: this.muted,
      vol: { music: this.vol.music, amb: this.vol.amb, sfx: this.vol.sfx, master: this.vol.master },
    };
  }
  deserialize(d) {
    if (!d) return;
    if (d.vol) {
      for (const k of ['music', 'amb', 'sfx', 'master']) {
        if (typeof d.vol[k] === 'number') this.vol[k] = d.vol[k];
      }
      if (this._music) this._music.gain.value = this.vol.music;
      if (this._amb) this._amb.gain.value = this.vol.amb;
      if (this._sfx) this._sfx.gain.value = this.vol.sfx;
    }
    this.setMuted(!!d.muted);
  }

  // diagnostics for tests
  info() {
    let live = 0;
    for (let i = 0; i < this._voices.length; i++) if (this._voices[i].live) live++;
    return {
      ok: this.ok,
      ctxState: this.ctx ? this.ctx.state : 'none',
      liveVoices: live,
      plucks: this._pluckCount,
      muted: this.muted,
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AudioEngine, aeFreq, AE_INSEN };
}
