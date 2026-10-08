/* The sound engine's window into the game: game.js fills this in at load.
   (AU used to live inside game.js's closure; the split keeps each file
   small enough to push.) */
var AUENV = { save: null, persist: function () {}, el: function () { return null; } };
/* ============================== audio ============================== */
var AU = {
  ctx: null, master: null, filt: null, musicT: 0, birdT: 5,
  ensure: function () {
    try {
      if (!this.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        /* master chain: sources -> master gain -> underwater low-pass -> destination */
        this.filt = this.ctx.createBiquadFilter();
        this.filt.type = 'lowpass'; this.filt.frequency.value = 18000;
        this.master = this.ctx.createGain();
        this.master.gain.value = AUENV.save.muted ? 0 : 0.9;
        this.master.connect(this.filt);
        this.filt.connect(this.ctx.destination);
        this.startLap();
        this.startWind();
        this.musicT = 3; this.birdT = 4;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) {}
  },
  setMuted: function (m) {
    AUENV.save.muted = m; AUENV.persist();
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
    var mb = AUENV.el('btn-mute');
    if (mb) mb.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#' + (m ? 'i-mute' : 'i-sound') + '"></use></svg>';
  },
  setUnderwater: function (on) {
    /* the underwater strip gets the muffled world: 18kHz -> ~700Hz */
    try {
      if (!this.ctx || !this.filt) return;
      var t = this.ctx.currentTime;
      this.filt.frequency.cancelScheduledValues(t);
      this.filt.frequency.setTargetAtTime(on ? 700 : 18000, t, 0.4);
    } catch (e) {}
  },
  noiseBuf: function () {
    var c = this.ctx, len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  },
  startLap: function () {
    /* gentle water lapping: looped noise -> lowpass, slow LFO on gain */
    try {
      var c = this.ctx;
      var src = c.createBufferSource(); src.buffer = this.noiseBuf(); src.loop = true;
      var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.6;
      var g = c.createGain(); g.gain.value = 0.045;
      var lfo = c.createOscillator(); lfo.frequency.value = 0.12;
      var lg = c.createGain(); lg.gain.value = 0.028;
      lfo.connect(lg); lg.connect(g.gain);
      src.connect(lp); lp.connect(g); g.connect(this.master);
      src.start(); lfo.start();
    } catch (e) {}
  },
  startWind: function () {
    /* wind swells: banded noise breathing on a slow LFO */
    try {
      var c = this.ctx;
      var src = c.createBufferSource(); src.buffer = this.noiseBuf(); src.loop = true;
      var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.4;
      var g = c.createGain(); g.gain.value = 0.018;
      var lfo = c.createOscillator(); lfo.frequency.value = 0.06;
      var lg = c.createGain(); lg.gain.value = 0.014;
      lfo.connect(lg); lg.connect(g.gain);
      src.connect(bp); bp.connect(g); g.connect(this.master);
      src.start(); lfo.start();
    } catch (e) {}
  },
  tone: function (f0, f1, dur, type, vol, when) {
    try {
      var c = this.ctx, t = c.currentTime + (when || 0);
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.05);
    } catch (e) {}
  },
  burst: function (dur, freq, vol, when) {
    try {
      var c = this.ctx, t = c.currentTime + (when || 0);
      var src = c.createBufferSource(); src.buffer = this.noiseBuf();
      var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = freq || 900;
      var g = c.createGain();
      g.gain.setValueAtTime(vol || 0.25, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(lp); lp.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + dur + 0.05);
    } catch (e) {}
  },
  pluck: function () {
    /* sparse generative folk: pentatonic, soft, never demanding */
    var scale = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33];
    var f = scale[Math.floor(Math.random() * scale.length)];
    this.tone(f, f * 0.995, 1.6, 'triangle', 0.055);
    if (Math.random() < 0.3) {
      var f2 = scale[Math.floor(Math.random() * scale.length)];
      this.tone(f2, f2 * 0.995, 1.8, 'triangle', 0.04, 0.5 + Math.random() * 0.6);
    }
  },
  chirp: function () {
    /* sparse birdsong: a few quick descending chirps */
    var n = 2 + Math.floor(Math.random() * 3);
    for (var i = 0; i < n; i++) {
      var f = 2300 + Math.random() * 900;
      this.tone(f, f * 0.72, 0.09, 'sine', 0.045, i * (0.14 + Math.random() * 0.1));
    }
  },
  scheduleAmbient: function (dt, cat) {
    if (!this.ctx || this.ctx.state !== 'running' || AUENV.save.muted) return;
    this.musicT -= dt;
    if (this.musicT <= 0) { this.pluck(); this.musicT = 4 + Math.random() * 5; }
    this.birdT -= dt;
    if (this.birdT <= 0) {
      if (cat !== 'night') this.chirp();
      this.birdT = 7 + Math.random() * 13;
    }
  },
  plip: function () { this.tone(520, 240, 0.16, 'sine', 0.22); },
  nibbleTick: function () { this.tone(1500, 950, 0.07, 'square', 0.07); },
  hook: function () { this.tone(660, 990, 0.12, 'triangle', 0.2); },
  splash: function () { this.burst(0.28, 800, 0.28); },
  bite: function () {
    /* THE bite: big splash + low thump — the unmistakable cue */
    this.burst(0.55, 750, 0.42);
    this.tone(95, 42, 0.5, 'sine', 0.5);
    this.tone(190, 120, 0.2, 'triangle', 0.14, 0.05);
  },
  reelClick: function () { this.tone(2100, 1700, 0.03, 'square', 0.045); },
  warn: function () { this.tone(300, 200, 0.22, 'sawtooth', 0.1); this.tone(300, 200, 0.22, 'sawtooth', 0.1, 0.24); },
  /* the rod straining under a surging fish — low groan, never a snap */
  creak: function () { this.tone(150, 85, 0.32, 'sawtooth', 0.05); this.tone(110, 70, 0.28, 'triangle', 0.04, 0.06); },
  chime: function () {
    var scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    var start = Math.floor(Math.random() * 3), n = 4;
    for (var i = 0; i < n; i++) {
      this.tone(scale[(start + i) % scale.length], 0, 0.55, 'triangle', 0.16, i * 0.1);
    }
  },
  fanfare: function () {
    /* NEW RECORD fanfare */
    var notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    for (var i = 0; i < notes.length; i++) {
      this.tone(notes[i], 0, 0.5, 'triangle', 0.18, i * 0.11);
      this.tone(notes[i] / 2, 0, 0.5, 'sine', 0.1, i * 0.11);
    }
  },
  mrrp: function () { this.tone(300, 230, 0.14, 'sine', 0.12); this.tone(260, 200, 0.12, 'sine', 0.1, 0.13); }
  ,
  duck: function () {
    /* the world holds its breath: brief master dip on the hook */
    try {
      if (!this.ctx || !this.master) return;
      var t = this.ctx.currentTime, g = this.master.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0.25, t + 0.08);
      g.linearRampToValueAtTime(AUENV.save.muted ? 0 : 0.9, t + 0.7);
    } catch (e) {}
  },
  rareSting: function () {
    /* Dredge's flat-key trick, audible: rare catches get their own sting */
    this.tone(392, 392, 0.16, 'triangle', 0.16);
    this.tone(370, 370, 0.16, 'triangle', 0.16, 0.14);
    this.tone(311, 311, 0.3, 'triangle', 0.18, 0.28);
    this.tone(622, 622, 0.4, 'sine', 0.08, 0.28);
  },
};
