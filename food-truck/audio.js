/* Food Truck Manager — FTA audio engine
 * Plain script, no modules. Single global: var FTA = {...}
 * Everything synthesized with WebAudio — no external audio files.
 * Warm, hand-made, street-fair feel: paper tickets, register cha-chings,
 * sizzling grills, a friendly crowd, and a lo-fi groove underneath.
 *
 * Conventions kept from the shop playbook:
 * - AudioContext is created/resumed only on a user gesture (FTA.init()).
 * - Voices are capped; oldest is stolen when the pool is full.
 * - Playback hot path avoids allocations (no per-call closures/objects).
 * - Mixer buses: music / sfx / ui -> master, persisted to localStorage.
 */

(function () {
  'use strict';

  var VOL_KEY = 'ftm_vol';
  var MAX_VOICES = 12;
  var hasAudio = !!(window.AudioContext || window.webkitAudioContext);

  /* ---------------- volume persistence (loaded at eval) ---------------- */
  function loadVol() {
    var v = { music: 0.8, sfx: 0.9, ui: 0.9 };
    try {
      var raw = window.localStorage.getItem(VOL_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (typeof p.music === 'number') v.music = clamp01(p.music);
        if (typeof p.sfx === 'number') v.sfx = clamp01(p.sfx);
        if (typeof p.ui === 'number') v.ui = clamp01(p.ui);
        if (typeof p.muted === 'boolean') v.muted = p.muted;
      }
    } catch (e) { /* storage unavailable — use defaults */ }
    if (typeof v.muted !== 'boolean') v.muted = false;
    return v;
  }
  function clamp01(x) {
    x = +x;
    if (!(x >= 0)) return 0;
    if (x > 1) return 1;
    return x;
  }
  var saved = loadVol();

  /* ---------------- the public object ---------------- */
  var FTA = {
    muted: !!saved.muted,
    _ctx: null,
    _ready: false,
    _buses: null,       // {master, music, sfx, ui} GainNodes
    _busVol: { music: saved.music, sfx: saved.sfx, ui: saved.ui },
    _voices: 0,         // active one-shot count
    _pool: [],          // FIFO of {src, gain} for stealing
    _noiseBuf: null,    // 2s white noise, built once
    _clickBuf: null,    // 30ms tick, built once
    _musicOn: false,
    _musicTimer: 0,
    _musicStep: 0,
    _musicNextT: 0,
    _intensity: 0.5,
    _musicBus: null     // music bus internals {lp, delay, ...}
  };

  function persistVol() {
    try {
      window.localStorage.setItem(VOL_KEY, JSON.stringify({
        music: FTA._busVol.music, sfx: FTA._busVol.sfx,
        ui: FTA._busVol.ui, muted: FTA.muted
      }));
    } catch (e) { /* ignore */ }
  }

  /* ---------------- init ----------------
   * Safe to call repeatedly. Creates the context lazily on the FIRST call,
   * which the game makes from a user-gesture handler. Resumes if suspended.
   */
  FTA.init = function () {
    if (!hasAudio) return;
    if (!FTA._ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      try { FTA._ctx = new AC(); } catch (e) { hasAudio = false; return; }
      buildGraph();
      buildBuffers();
    }
    if (FTA._ctx.state === 'suspended') {
      // resume() returns a promise; we never await it (hot-path safe)
      FTA._ctx.resume();
    }
    FTA._ready = true;
  };

  function buildGraph() {
    var c = FTA._ctx;
    var master = c.createGain();
    master.gain.value = FTA.muted ? 0 : 1;
    master.connect(c.destination);
    var b = {
      master: master,
      music: c.createGain(),
      sfx: c.createGain(),
      ui: c.createGain()
    };
    b.music.gain.value = FTA._busVol.music;
    b.sfx.gain.value = FTA._busVol.sfx;
    b.ui.gain.value = FTA._busVol.ui;
    b.music.connect(master);
    b.sfx.connect(master);
    b.ui.connect(master);
    FTA._buses = b;

    // Music chain: voices -> lofi tone stack -> music bus.
    // Lowpass for warmth + a slappy dotted-eighth ping-pong-ish delay.
    var lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    lp.Q.value = 0.6;
    var dly = c.createDelay(1.0);
    dly.delayTime.value = 0.28;
    var fb = c.createGain();
    fb.gain.value = 0.32;
    var wet = c.createGain();
    wet.gain.value = 0.22;
    dly.connect(fb); fb.connect(dly);
    dly.connect(wet); wet.connect(lp);
    lp.connect(b.music);
    FTA._musicBus = { lp: lp, dly: dly, in: c.createGain() };
    FTA._musicBus.in.connect(lp);
    FTA._musicBus.in.connect(dly);
  }

  function buildBuffers() {
    var c = FTA._ctx;
    var sr = c.sampleRate;
    // 2 seconds of white noise (sizzle, hats, fire, exting, crumple)
    var len = sr * 2;
    var nb = c.createBuffer(1, len, sr);
    var d = nb.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    FTA._noiseBuf = nb;
    // 30ms band-limited tick (tap, ui click basis)
    var cl = c.createBuffer(1, Math.floor(sr * 0.03), sr);
    var cd = cl.getChannelData(0);
    for (var j = 0; j < cd.length; j++) {
      var t = j / cd.length;
      cd[j] = (Math.random() * 2 - 1) * (1 - t) * (1 - t);
    }
    FTA._clickBuf = cl;
  }

  /* ---------------- mixer ---------------- */
  FTA.setBus = function (bus, v) {
    v = clamp01(v);
    if (bus === 'master') { FTA.toggleMute(); return; }
    if (FTA._busVol[bus] === undefined) return;
    FTA._busVol[bus] = v;
    if (FTA._buses && FTA._buses[bus]) FTA._buses[bus].gain.value = v;
    persistVol();
  };
  FTA.getBus = function (bus) {
    if (bus === 'master') return FTA.muted ? 0 : 1;
    return FTA._busVol[bus] === undefined ? 1 : FTA._busVol[bus];
  };
  FTA.toggleMute = function () {
    FTA.muted = !FTA.muted;
    if (FTA._buses) FTA._buses.master.gain.value = FTA.muted ? 0 : 1;
    persistVol();
  };

  /* ---------------- voice pool ----------------
   * One-shot sources are started and forgotten; onended returns the slot.
   * When full, the oldest voice is hard-stopped (steal) and reused.
   * Tracked with a plain FIFO array of small records created once.
   */
  function voiceSlot() {
    if (!FTA._ready) return null;
    // prune finished voices from the head (they mark themselves done)
    var p = FTA._pool;
    while (p.length && p[0].done) p.shift();
    if (p.length >= MAX_VOICES) {
      var old = p.shift();           // steal the oldest
      try { old.src.stop(0); } catch (e) { /* already stopped */ }
      old.done = true;
    }
    var rec = { src: null, gain: null, done: false };
    p.push(rec);
    return rec;
  }
  function releaseOnEnd(rec, src) {
    src.onended = function () {
      rec.done = true;
      try { src.disconnect(); } catch (e) { /* ignore */ }
    };
  }

  // Shared scratch for envelope helper (module scope, no allocs)
  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  // One oscillator blip -> bus. Returns nothing; hot-path clean.
  // type: 'sine'|'triangle'|'square'|'sawtooth', freq in Hz.
  function blip(type, freq, t, dur, vol, bus, pitch) {
    var c = FTA._ctx;
    var rec = voiceSlot();
    if (!rec) return;
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = type;
    o.frequency.value = freq * (pitch || 1);
    env(g, t, 0.004, vol, dur);
    o.connect(g);
    g.connect(bus);
    rec.src = o; rec.gain = g;
    releaseOnEnd(rec, o);
    o.start(t);
    o.stop(t + dur + 0.08);
  }

  // One noise burst through a filter -> bus.
  // ftype: 'highpass'|'lowpass'|'bandpass', q optional.
  function burst(t, dur, vol, bus, ftype, ffreq, q, pitch) {
    var c = FTA._ctx;
    var rec = voiceSlot();
    if (!rec) return;
    var s = c.createBufferSource();
    s.buffer = FTA._noiseBuf;
    s.loop = true;
    s.playbackRate.value = pitch || 1;
    var f = c.createBiquadFilter();
    f.type = ftype;
    f.frequency.value = ffreq;
    f.Q.value = q || 0.8;
    var g = c.createGain();
    env(g, t, 0.003, vol, dur);
    s.connect(f); f.connect(g); g.connect(bus);
    rec.src = s; rec.gain = g;
    releaseOnEnd(rec, s);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.08);
  }

  /* ---------------- SFX ----------------
   * FTA.sfx(name, opt) — opt may be {pitch, vol}; both optional.
   * No allocations: opt fields are read directly, no object spread.
   */
  FTA.sfx = function (name, opt) {
    if (!FTA._ready) return;
    var c = FTA._ctx;
    var t = c.currentTime;
    var pitch = opt && opt.pitch ? +opt.pitch : 1;
    var vmod = opt && opt.vol ? +opt.vol : 1;
    var S = FTA._buses.sfx, U = FTA._buses.ui;

    switch (name) {
      case 'tap':       // soft tick — selecting a ticket
        blip('triangle', 880, t, 0.05, 0.16 * vmod, U, pitch);
        break;

      case 'ui':        // menu click
        blip('triangle', 660, t, 0.06, 0.20 * vmod, U, pitch);
        blip('sine', 1320, t + 0.015, 0.05, 0.10 * vmod, U, pitch);
        break;

      case 'select':    // paper ticket pull — filtered noise swish
        burst(t, 0.12, 0.22 * vmod, S, 'bandpass', 2600 * pitch, 1.2, pitch);
        break;

      case 'trash':     // paper crumple — two quick noise bites
        burst(t, 0.09, 0.25 * vmod, S, 'highpass', 1400, 0.7, pitch);
        burst(t + 0.07, 0.11, 0.22 * vmod, S, 'highpass', 1800, 0.7, 1.2 * pitch);
        break;

      case 'ding':      // food done — bright service bell
        blip('sine', 1568, t, 0.5, 0.30 * vmod, S, pitch);
        blip('sine', 2093, t + 0.02, 0.45, 0.20 * vmod, S, pitch);
        blip('triangle', 784, t, 0.3, 0.14 * vmod, S, pitch);
        break;

      case 'bell':      // drive-up window bell — classic ding-dong
        blip('sine', 1318, t, 0.4, 0.28 * vmod, S, pitch);
        blip('sine', 1046, t + 0.22, 0.6, 0.28 * vmod, S, pitch);
        break;

      case 'doorbell':  // arrival chime — warm two-tone
        blip('triangle', 830, t, 0.35, 0.26 * vmod, S, pitch);
        blip('triangle', 622, t + 0.28, 0.55, 0.26 * vmod, S, pitch);
        break;

      case 'warn':      // near-burn beep; pitch raises urgency
        blip('square', 620 * pitch, t, 0.09, 0.16 * vmod, S, 1);
        blip('square', 620 * pitch, t + 0.14, 0.09, 0.16 * vmod, S, 1);
        break;

      case 'error':     // dull thunk
        blip('sine', 140, t, 0.18, 0.34 * vmod, S, pitch);
        burst(t, 0.06, 0.10 * vmod, S, 'lowpass', 500, 0.7, 1);
        break;

      case 'pop':       // number pop — quick bubble
        (function () {
          // tiny upward chirp: two sine blips with a freq slide done
          // via direct oscillator here (only pop needs the slide)
          var cc = FTA._ctx;
          var rec = voiceSlot();
          if (!rec) return;
          var o = cc.createOscillator();
          var g = cc.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(500 * pitch, t);
          o.frequency.exponentialRampToValueAtTime(1150 * pitch, t + 0.08);
          env(g, t, 0.005, 0.22 * vmod, 0.09);
          o.connect(g); g.connect(S);
          rec.src = o; rec.gain = g;
          releaseOnEnd(rec, o);
          o.start(t); o.stop(t + 0.16);
        })();
        break;

      case 'cha':       // cash register cha-ching; pitch rises with combo
        blip('triangle', 988 * pitch, t, 0.10, 0.26 * vmod, S, 1);
        blip('triangle', 1319 * pitch, t + 0.07, 0.28, 0.30 * vmod, S, 1);
        blip('sine', 2637 * pitch, t + 0.07, 0.2, 0.12 * vmod, S, 1);
        burst(t + 0.16, 0.06, 0.12 * vmod, S, 'highpass', 5000, 0.8, 1); // drawer
        break;

      case 'milestone': // combo milestone shimmer — rising arpeggio
        (function () {
          var notes = MIL_NOTES, i, rec, cc = FTA._ctx, o, g;
          for (i = 0; i < notes.length; i++) {
            rec = voiceSlot();
            if (!rec) continue;
            o = cc.createOscillator();
            g = cc.createGain();
            o.type = 'triangle';
            o.frequency.value = notes[i] * pitch;
            var tt = t + i * 0.09;
            env(g, tt, 0.005, 0.22 * vmod, 0.32);
            o.connect(g); g.connect(S);
            rec.src = o; rec.gain = g;
            releaseOnEnd(rec, o);
            o.start(tt); o.stop(tt + 0.42);
          }
        })();
        break;

      case 'cheer':     // small crowd yay — happy noise swell + voices-ish blips
        burst(t, 0.5, 0.14 * vmod, S, 'bandpass', 1200, 0.6, pitch);
        blip('triangle', 523 * pitch, t + 0.05, 0.18, 0.10 * vmod, S, 1);
        blip('triangle', 659 * pitch, t + 0.14, 0.18, 0.10 * vmod, S, 1);
        blip('triangle', 784 * pitch, t + 0.23, 0.26, 0.12 * vmod, S, 1);
        break;

      case 'sizzle':    // short sizzle burst
        burst(t, 0.35, 0.20 * vmod, S, 'highpass', 3200 * pitch, 0.6, 0.9 + pitch * 0.2);
        break;

      case 'fire':      // grease-fire alarm — urgent warble
        (function () {
          var i, rec, cc = FTA._ctx, o, g, tt;
          for (i = 0; i < 4; i++) {
            rec = voiceSlot();
            if (!rec) continue;
            o = cc.createOscillator();
            g = cc.createGain();
            o.type = 'sawtooth';
            tt = t + i * 0.22;
            o.frequency.setValueAtTime(440 * pitch, tt);
            o.frequency.linearRampToValueAtTime(660 * pitch, tt + 0.18);
            env(g, tt, 0.01, 0.14 * vmod, 0.18);
            o.connect(g); g.connect(S);
            rec.src = o; rec.gain = g;
            releaseOnEnd(rec, o);
            o.start(tt); o.stop(tt + 0.28);
          }
        })();
        break;

      case 'exting':    // extinguisher hiss — long filtered noise
        burst(t, 1.1, 0.26 * vmod, S, 'highpass', 2400, 0.5, 0.8);
        burst(t + 0.1, 0.9, 0.14 * vmod, S, 'bandpass', 900, 1.0, 0.6);
        break;

      case 'jingle':    // shift-end little fanfare
        (function () {
          var notes = JIN_NOTES, i, rec, cc = FTA._ctx, o, g, tt;
          for (i = 0; i < notes.length; i++) {
            rec = voiceSlot();
            if (!rec) continue;
            o = cc.createOscillator();
            g = cc.createGain();
            o.type = notes[i].w;         // prebuilt: 'triangle' or 'sine'
            o.frequency.value = notes[i].f * pitch;
            tt = t + notes[i].d;
            env(g, tt, 0.006, 0.24 * vmod, notes[i].l);
            o.connect(g); g.connect(S);
            rec.src = o; rec.gain = g;
            releaseOnEnd(rec, o);
            o.start(tt); o.stop(tt + notes[i].l + 0.1);
          }
        })();
        break;

      /* falls through silently for unknown names */
    }
  };

  // Prebuilt note tables — no per-call arrays.
  var MIL_NOTES = [523.25, 659.25, 783.99, 1046.50, 1318.51];
  // jingle: little two-phrase fanfare (C E G | C E G C up), d = delay, l = length
  var JIN_NOTES = [
    { f: 523.25, d: 0.00, l: 0.16, w: 'triangle' },
    { f: 659.25, d: 0.14, l: 0.16, w: 'triangle' },
    { f: 783.99, d: 0.28, l: 0.16, w: 'triangle' },
    { f: 1046.50, d: 0.42, l: 0.30, w: 'triangle' },
    { f: 783.99, d: 0.78, l: 0.16, w: 'sine' },
    { f: 1046.50, d: 0.92, l: 0.16, w: 'sine' },
    { f: 1318.51, d: 1.06, l: 0.16, w: 'sine' },
    { f: 1567.98, d: 1.20, l: 0.55, w: 'triangle' }
  ];

  /* ---------------- music ----------------
   * Warm lo-fi groove: soft kick + hat pattern, simple bass line,
   * occasional plucked pentatonic melody. Scheduled with a lookahead
   * timer (setInterval 40ms, 120ms lookahead). intensity 0..1 raises
   * tempo a touch and opens the lowpass filter.
   */

  // Prebuilt patterns — indexed by step, no allocations in scheduler.
  var KICK_PAT =  [1,0,0,0, 0,0,0,0, 1,0,0,1, 0,0,0,0];  // four-on-ish w/ pickup
  var HAT_PAT =   [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,1,1,0];
  var BASS_LINE = [0, 0, 0, 7, 5, 0, 3, 7];              // scale degrees, 1 bar each
  var BASS_ROOT = 110;                                    // A2
  var PENTA = [220.00, 246.94, 277.18, 329.63, 369.99, 440.00, 493.88, 554.37];
  var MELODY = [           // [bar, step16, degree]; sparse plucks
    [0, 4, 2], [0, 10, 4],
    [1, 2, 5], [1, 12, 3],
    [2, 6, 6], [2, 14, 4],
    [3, 0, 1], [3, 8, 2], [3, 13, 0]
  ];
  var DEG = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8]; // just-ish major walk

  function musicKick(t, bus) {
    var c = FTA._ctx;
    var rec = voiceSlot();
    if (!rec) return;
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.10);
    env(g, t, 0.003, 0.55, 0.16);
    o.connect(g); g.connect(bus);
    rec.src = o; rec.gain = g;
    releaseOnEnd(rec, o);
    o.start(t); o.stop(t + 0.25);
  }

  function musicHat(t, bus, open) {
    var c = FTA._ctx;
    var rec = voiceSlot();
    if (!rec) return;
    var s = c.createBufferSource();
    s.buffer = FTA._noiseBuf;
    s.loop = true;
    var f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    var g = c.createGain();
    env(g, t, 0.002, open ? 0.16 : 0.10, open ? 0.22 : 0.045);
    s.connect(f); f.connect(g); g.connect(bus);
    rec.src = s; rec.gain = g;
    releaseOnEnd(rec, s);
    s.start(t, Math.random() * 1.5);
    s.stop(t + 0.35);
  }

  function musicBass(t, bus, deg) {
    var c = FTA._ctx;
    var rec = voiceSlot();
    if (!rec) return;
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = 'triangle';
    o.frequency.value = BASS_ROOT * DEG[deg % DEG.length];
    env(g, t, 0.01, 0.30, 0.34);
    o.connect(g); g.connect(bus);
    rec.src = o; rec.gain = g;
    releaseOnEnd(rec, o);
    o.start(t); o.stop(t + 0.5);
  }

  function musicPluck(t, bus, freq) {
    var c = FTA._ctx;
    var rec = voiceSlot();
    if (!rec) return;
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    // pluck: fast attack, warm decay
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.20, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g); g.connect(bus);
    rec.src = o; rec.gain = g;
    releaseOnEnd(rec, o);
    o.start(t); o.stop(t + 0.75);
  }

  function musicScheduleStep(step16, t) {
    var bus = FTA._musicBus.in;
    var bar = (step16 >> 4) % 4;   // 4-bar loop
    var s16 = step16 % 16;

    if (KICK_PAT[s16]) musicKick(t, bus);
    if (HAT_PAT[s16]) musicHat(t, bus, s16 === 14);
    if (s16 === 0) musicBass(t, bus, BASS_LINE[bar]);

    // sparse melody plucks
    for (var i = 0; i < MELODY.length; i++) {
      var m = MELODY[i];
      if (m[0] === bar && m[1] === s16) {
        musicPluck(t, bus, PENTA[m[2] % PENTA.length]);
      }
    }
  }

  function musicTick() {
    if (!FTA._musicOn || !FTA._ready) return;
    var c = FTA._ctx;
    var tempo = 92 + FTA._intensity * 18;      // 92 -> 110 bpm
    var spb = 60 / tempo / 4;                  // 16th-note seconds
    while (FTA._musicNextT < c.currentTime + 0.12) {
      musicScheduleStep(FTA._musicStep, FTA._musicNextT);
      FTA._musicStep = (FTA._musicStep + 1) % 64;  // 4 bars of 16
      FTA._musicNextT += spb;
    }
  }

  FTA.musicStart = function (intensity) {
    FTA.init();
    if (!FTA._ready || FTA._musicOn) return;
    FTA._intensity = clamp01(intensity === undefined ? 0.5 : intensity);
    applyIntensity();
    FTA._musicOn = true;
    FTA._musicStep = 0;
    FTA._musicNextT = FTA._ctx.currentTime + 0.06;
    FTA._musicTimer = window.setInterval(musicTick, 40);
  };

  FTA.musicSet = function (i) {
    FTA._intensity = clamp01(i);
    if (FTA._ready) applyIntensity();
  };

  FTA.musicStop = function () {
    FTA._musicOn = false;
    if (FTA._musicTimer) {
      window.clearInterval(FTA._musicTimer);
      FTA._musicTimer = 0;
    }
  };

  function applyIntensity() {
    if (!FTA._musicBus) return;
    // open the lowpass as intensity rises: 900 -> 2400 Hz
    FTA._musicBus.lp.frequency.value = 900 + FTA._intensity * 1500;
    FTA._musicBus.dly.delayTime.value = 0.30 - FTA._intensity * 0.06;
  }

  /* ---------------- no-audio safety ----------------
   * If WebAudio is missing, init() flips hasAudio false and every method
   * above already guards on FTA._ready. Double-guard the entry points.
   */
  if (!hasAudio) {
    var noop = function () {};
    FTA.init = noop;
    FTA.sfx = noop;
    FTA.setBus = noop;
    FTA.toggleMute = noop;
    FTA.musicStart = noop;
    FTA.musicSet = noop;
    FTA.musicStop = noop;
  }

  window.FTA = FTA;
})();
