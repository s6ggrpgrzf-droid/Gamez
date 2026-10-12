/* Fairway Rivals — AU: WebAudio engine (synthesized SFX + broadcast music loop).
   Mixer: music/sfx/ui buses -> master. Volumes + mute persisted in localStorage.
   AudioContext is created/resumed ONLY on a user gesture: game.js must call
   AU.unlock() from a pointerdown/touchend handler. No autoplay anywhere.

   Visual twins: every cue below is paired with an on-screen event the game
   renders (swing flash, tick needle, bounce puff, splash rings, cup drop cam,
   tree shake, crowd banners, stings on lower-thirds, clock blink, wind flag).
   AU only plays; game.js draws.

   Usage:
     AU.unlock()                       // gesture handler
     AU.sfx('cheer')                   // fire-and-forget
     AU.sfx('bounce', {gain:0.7})      // opts: gain, rate, bus
     AU.tick(closeness01)              // needle tick, pitch rises near center
     AU.setWind(level01)               // wind gust bed, 0 = off
     AU.music(true) / AU.music(false)  // broadcast theme loop
     AU.setMuted(true) / AU.toggleMute()
     AU.setVolume('music'|'sfx'|'ui', 0..1)
*/
'use strict';
(function () {
  var AU = window.AU = {};

  /* ---------- persisted prefs ---------- */
  var KEY = 'fr_audio_v1';
  var prefs = { music: 0.7, sfx: 0.9, ui: 0.9, muted: false };
  try {
    var dflt = (window.FRCFG && FRCFG.audio && FRCFG.audio.defaults) || {};
    for (var k in dflt) prefs[k] = dflt[k];
    var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) for (var k2 in saved) if (k2 in prefs) prefs[k2] = +saved[k2] || 0;
  } catch (e) { /* private mode: run silent-safe defaults */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {} }

  /* ---------- graph ---------- */
  var ctx = null, master = null, busMusic = null, busSfx = null, busUi = null;
  var noiseBuf = null, built = false;
  var BUF = {};                 // name -> AudioBuffer (pooled; sources are one-shot by design)
  var VOICES = [];              // live sources, capped
  var VOICE_CAP = 16;

  function buses() {
    return { music: busMusic, sfx: busSfx, ui: busUi };
  }
  function applyPrefs() {
    if (!ctx) return;
    var t = ctx.currentTime;
    master.gain.setTargetAtTime(prefs.muted ? 0 : 1, t, 0.02);
    busMusic.gain.setTargetAtTime(prefs.music, t, 0.02);
    busSfx.gain.setTargetAtTime(prefs.sfx, t, 0.02);
    busUi.gain.setTargetAtTime(prefs.ui, t, 0.02);
  }

  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.connect(ctx.destination);
      busMusic = ctx.createGain(); busMusic.connect(master);
      busSfx = ctx.createGain(); busSfx.connect(master);
      busUi = ctx.createGain(); busUi.connect(master);
      noiseBuf = makeNoise(2.0);
      applyPrefs();
      buildBuffers();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }
  AU.unlock = function () { ensure(); };

  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (!prefs.muted) ctx.resume();
  });

  /* ---------- buffer synthesis helpers ---------- */
  function makeNoise(dur) {
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var b = ctx.createBuffer(1, len, ctx.sampleRate);
    var ch = b.getChannelData(0);
    for (var i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    return b;
  }
  // fn(t, dur) -> sample in [-1,1]; returns mono AudioBuffer
  function synth(dur, fn) {
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var b = ctx.createBuffer(1, len, ctx.sampleRate);
    var ch = b.getChannelData(0);
    for (var i = 0; i < len; i++) ch[i] = fn(i / ctx.sampleRate, dur);
    return b;
  }
  function envADSR(t, dur, a, d, s, r) {
    if (t < a) return t / a;
    t -= a;
    if (t < d) return 1 - (1 - s) * (t / d);
    t -= d;
    var sus = dur - a - d - r;
    if (t < sus) return s;
    t -= sus;
    return Math.max(0, s * (1 - t / r));
  }

  /* ---------- SFX buffer builds (all procedural, no assets) ---------- */
  function buildBuffers() {
    if (built) return;
    built = true;
    var N = function () { return noiseBuf; };

    // swing whoosh: band-swept noise, 0.35s
    BUF.swing = synth(0.35, function (t, d) {
      var p = t / d;
      // fake bandpass sweep via two modulated noise reads
      var n = noiseAt(t * (3 + p * 5));
      var e = Math.sin(Math.PI * p);
      return n * e * 0.8 * (0.4 + 0.6 * p);
    });

    // ball bounce / fairway thud: sine drop + low noise, 0.22s
    BUF.bounce = synth(0.22, function (t, d) {
      var f = 150 - 90 * (t / d);
      var s = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 22);
      var n = noiseAt(t * 7) * Math.exp(-t * 40) * 0.5;
      return (s + n) * 0.9;
    });

    // sand thud: soft filtered noise, 0.3s
    BUF.sand = synth(0.3, function (t, d) {
      var n = (noiseAt(t * 4) + noiseAt(t * 9)) * 0.25;
      return n * envADSR(t, d, 0.02, 0.08, 0.3, 0.18) * 0.9;
    });

    // splash: noise cascade + droplets, 0.6s
    BUF.splash = synth(0.6, function (t, d) {
      var p = t / d;
      var n = noiseAt(t * (6 - p * 4)) * (1 - p);
      var drop = 0;
      for (var i = 0; i < 5; i++) {
        var dt = t - (0.08 + i * 0.09);
        if (dt > 0 && dt < 0.05) drop += Math.sin(2 * Math.PI * (900 - i * 120) * dt) * Math.exp(-dt * 90);
      }
      return (n * 0.55 + drop * 0.45) * Math.exp(-t * 3.2);
    });

    // cup: rattle bursts + drop thunk, 0.7s
    BUF.cup = synth(0.7, function (t, d) {
      var s = 0;
      for (var i = 0; i < 4; i++) {
        var bt = t - i * 0.09;
        if (bt > 0 && bt < 0.06)
          s += Math.sin(2 * Math.PI * (2400 + i * 500) * bt) * Math.exp(-bt * 90) * 0.5;
      }
      var dt = t - 0.32;
      if (dt > 0) s += Math.sin(2 * Math.PI * (170 - 80 * Math.min(1, dt * 4)) * dt) * Math.exp(-dt * 14);
      return s * 0.9;
    });

    // tree knock: woody thunk, 0.18s
    BUF.tree = synth(0.18, function (t, d) {
      var s = Math.sin(2 * Math.PI * 210 * t) * Math.exp(-t * 40);
      s += Math.sin(2 * Math.PI * 330 * t) * Math.exp(-t * 55) * 0.5;
      s += noiseAt(t * 12) * Math.exp(-t * 70) * 0.35;
      return s * 0.9;
    });

    // cheer swell: banded crowd noise, 2.0s
    BUF.cheer = synth(2.0, function (t, d) {
      var p = t / d;
      var swell = Math.sin(Math.PI * Math.min(1, p * 1.15));
      var n = noiseAt(t * 11) * 0.5 + noiseAt(t * 23) * 0.3;
      var am = 0.75 + 0.25 * Math.sin(2 * Math.PI * 7 * t); // crowd wobble
      return n * swell * am * 0.7;
    });

    // groan: descending crowd disappointment, 1.4s
    BUF.groan = synth(1.4, function (t, d) {
      var p = t / d;
      var n = noiseAt(t * (14 - p * 8)) * 0.6;
      var e = Math.sin(Math.PI * p);
      return n * e * 0.65;
    });

    // dunk sting (prestige): brass-ish major stab + timpani, 1.6s
    BUF.dunk = synth(1.6, function (t, d) {
      var s = 0;
      var chord = [220, 277.18, 329.63, 440];
      for (var i = 0; i < chord.length; i++) {
        var f = chord[i];
        s += (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * f * 2.01 * t)) *
             Math.exp(-t * 3.0) * 0.22;
      }
      var dt = t;
      s += Math.sin(2 * Math.PI * (90 - 30 * Math.min(1, dt)) * dt) * Math.exp(-dt * 8) * 0.5;
      s += noiseAt(t * 30) * Math.exp(-t * 12) * 0.25; // crash shimmer
      return s;
    });

    // shootout sting: rising tension arp, 1.2s
    BUF.shootout = synth(1.2, function (t, d) {
      var s = Math.sin(2 * Math.PI * 55 * t) * 0.3; // low drone
      var notes = [164.81, 196, 246.94, 329.63, 493.88];
      for (var i = 0; i < notes.length; i++) {
        var nt = t - i * 0.16;
        if (nt > 0 && nt < 0.3) {
          var tr = 0.7 + 0.3 * Math.sin(2 * Math.PI * 9 * nt);
          s += Math.sign(Math.sin(2 * Math.PI * notes[i] * nt)) * Math.exp(-nt * 9) * 0.28 * tr;
        }
      }
      return s * envADSR(t, d, 0.05, 0.2, 0.8, 0.3);
    });

    // trophy tick: bright metallic arpeggio, 0.5s
    BUF.trophy = synth(0.5, function (t, d) {
      var s = 0;
      var notes = [1567.98, 2093, 2637.02];
      for (var i = 0; i < notes.length; i++) {
        var nt = t - i * 0.09;
        if (nt > 0) s += Math.sin(2 * Math.PI * notes[i] * nt) * Math.exp(-nt * 22) * 0.4;
      }
      return s;
    });

    // chest shimmer: ascending sparkle arp + air, 1.3s
    BUF.chest = synth(1.3, function (t, d) {
      var s = 0;
      var notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
      for (var i = 0; i < notes.length; i++) {
        var nt = t - i * 0.11;
        if (nt > 0) s += Math.sin(2 * Math.PI * notes[i] * nt) * Math.exp(-nt * 7) * 0.3;
      }
      s += noiseAt(t * 40) * Math.exp(-t * 2.5) * 0.12;
      s += Math.sin(2 * Math.PI * 130.81 * t) * envADSR(t, d, 0.3, 0.2, 0.6, 0.4) * 0.25;
      return s;
    });

    // ui tap: crisp click, 0.08s
    BUF.tap = synth(0.08, function (t, d) {
      var s = Math.sin(2 * Math.PI * 1250 * t) * Math.exp(-t * 90);
      s += noiseAt(t * 60) * Math.exp(-t * 140) * 0.4;
      return s * 0.8;
    });

    // shot-clock warning beep: 880Hz, 0.14s
    BUF.beep = synth(0.14, function (t, d) {
      return Math.sin(2 * Math.PI * 880 * t) * envADSR(t, d, 0.005, 0.01, 0.9, 0.06);
    });

    // wind gust bed (looped, driven by AU.setWind): slow-breathing noise, 4s loop
    BUF.wind = synth(4.0, function (t, d) {
      var breathe = 0.55 + 0.45 * Math.sin(2 * Math.PI * t / d * 2 + 1);
      var n = noiseAt(t * 3) * 0.6 + noiseAt(t * 8) * 0.25;
      return n * breathe * 0.5;
    });
    void N;
  }
  // deterministic-ish pseudo-noise from the shared noise buffer (wrap-safe)
  function noiseAt(t) {
    if (!noiseBuf) return 0;
    var ch = noiseBuf.getChannelData(0);
    var i = Math.abs(Math.floor(t * ctx.sampleRate)) % ch.length;
    return ch[i];
  }

  /* ---------- playback ---------- */
  function playBuf(name, opts) {
    opts = opts || {};
    if (!ensure() || !BUF[name]) return null;
    if (VOICES.length >= VOICE_CAP) return null; // drop, never allocate past cap
    var src = ctx.createBufferSource();
    src.buffer = BUF[name];
    src.loop = !!opts.loop;
    if (opts.rate) src.playbackRate.value = opts.rate;
    var g = ctx.createGain();
    g.gain.value = (opts.gain == null ? 1 : opts.gain);
    var bus = buses()[opts.bus || 'sfx'] || busSfx;
    src.connect(g); g.connect(bus);
    VOICES.push(src);
    src.onended = function () {
      var i = VOICES.indexOf(src);
      if (i >= 0) VOICES.splice(i, 1);
      try { src.disconnect(); g.disconnect(); } catch (e) {}
    };
    src.start(0, opts.offset || 0);
    return { src: src, gain: g };
  }

  AU.sfx = function (name, opts) {
    opts = opts || {};
    if (name === 'wind') return AU.setWind(opts.level == null ? 0.5 : opts.level);
    return playBuf(name, opts);
  };

  // Needle tick: pitch rises as the needle nears center (closeness 0..1).
  AU.tick = function (closeness) {
    if (!ensure()) return;
    if (VOICES.length >= VOICE_CAP) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 620 + Math.max(0, Math.min(1, closeness)) * 860;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(g); g.connect(busUi);
    VOICES.push(osc);
    osc.onended = function () {
      var i = VOICES.indexOf(osc);
      if (i >= 0) VOICES.splice(i, 1);
      try { osc.disconnect(); g.disconnect(); } catch (e) {}
    };
    osc.start(t); osc.stop(t + 0.08);
  };

  // Persistent wind bed; level 0..1, 0 = off. Returns for chaining.
  var windNode = null;
  AU.setWind = function (level) {
    level = Math.max(0, Math.min(1, level || 0));
    if (level <= 0) {
      if (windNode) {
        try { windNode.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4); } catch (e) {}
        var w = windNode; windNode = null;
        setTimeout(function () { try { w.src.stop(); } catch (e) {} }, 1200);
      }
      return AU;
    }
    if (!ensure()) return AU;
    if (!windNode) {
      windNode = playBuf('wind', { bus: 'sfx', loop: true, gain: 0.0001 });
      if (!windNode) return AU;
    }
    windNode.gain.gain.setTargetAtTime(0.12 + level * 0.5, ctx.currentTime, 0.6);
    return AU;
  };

  /* ---------- music: warm broadcast theme, 8 bars, seamless loop ---------- */
  var musicOn = false, schedTimer = null, nextBar = 0, barIdx = 0;
  var TEMPO = (window.FRCFG && FRCFG.audio && FRCFG.audio.tempo) || 96;
  var BARS = (window.FRCFG && FRCFG.audio && FRCFG.audio.bars) || 8;
  var BEAT = 60 / TEMPO, BAR = BEAT * 4;
  // I–V–vi–IV warmth in C: [root midi, chord tones]
  var PROG = [
    { root: 36, tones: [60, 64, 67] },   // C
    { root: 43, tones: [59, 62, 67] },   // G/B
    { root: 45, tones: [57, 60, 64] },   // Am
    { root: 41, tones: [57, 60, 65] },   // F
    { root: 36, tones: [60, 64, 67] },   // C
    { root: 43, tones: [55, 59, 62] },   // G
    { root: 41, tones: [57, 60, 65] },   // F
    { root: 43, tones: [59, 62, 67] }    // G (turnaround)
  ];
  // sparse horn-ish lead, [bar, beat, midi, beats]
  var LEAD = [
    [0, 0, 76, 1.5], [0, 2, 74, 1], [0, 3, 72, 1],
    [1, 0, 74, 2], [1, 2.5, 71, 1],
    [2, 0, 72, 1.5], [2, 2, 74, 1], [2, 3, 76, 1],
    [3, 0, 77, 2.5], [3, 3, 76, 1],
    [4, 0, 76, 1.5], [4, 2, 74, 1], [4, 3, 72, 1],
    [5, 0, 71, 2], [5, 2.5, 74, 1],
    [6, 0, 72, 3], [6, 3.5, 74, 0.5],
    [7, 0, 79, 2], [7, 2.5, 76, 1], [7, 3.5, 74, 0.5]
  ];
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function padChord(tones, t, dur) {
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1400;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.5);
    g.gain.setValueAtTime(0.16, t + dur - 0.6);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    lp.connect(g); g.connect(busMusic);
    for (var i = 0; i < tones.length; i++) {
      var o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = mtof(tones[i]);
      o.detune.value = (i % 2 ? 4 : -4);
      o.connect(lp);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }
  function bassNote(midi, t, dur) {
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.value = mtof(midi);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(busMusic);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function perc(t, kind) {
    var src = ctx.createBufferSource(); src.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    var g = ctx.createGain();
    if (kind === 'kick') {
      f.type = 'lowpass'; f.frequency.value = 160;
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    } else { // shaker
      f.type = 'highpass'; f.frequency.value = 6000;
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    }
    src.connect(f); f.connect(g); g.connect(busMusic);
    src.start(t, Math.random() * 1.5); src.stop(t + 0.25);
  }
  function leadNote(midi, t, dur) {
    var o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.value = mtof(midi);
    var vib = ctx.createOscillator(); vib.frequency.value = 5.5;
    var vg = ctx.createGain(); vg.gain.value = 6;
    vib.connect(vg); vg.connect(o.frequency);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.30, t + 0.06);
    g.gain.setValueAtTime(0.30, t + dur - 0.08);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(busMusic);
    o.start(t); vib.start(t);
    o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  }
  function scheduleBar(idx, t) {
    var c = PROG[idx % PROG.length];
    padChord(c.tones, t, BAR);
    bassNote(c.root, t, BEAT * 1.2);
    bassNote(c.root + 7, t + BEAT * 2, BEAT * 1.2);
    perc(t, 'kick'); perc(t + BEAT * 2, 'kick');
    perc(t + BEAT, 'shaker'); perc(t + BEAT * 3, 'shaker');
    perc(t + BEAT * 1.5, 'shaker'); perc(t + BEAT * 3.5, 'shaker');
    for (var i = 0; i < LEAD.length; i++) {
      var L = LEAD[i];
      if (L[0] === idx % BARS) leadNote(L[2], t + L[1] * BEAT, L[3] * BEAT);
    }
  }
  function scheduler() {
    if (!musicOn || !ctx) return;
    while (nextBar < ctx.currentTime + 0.8) {
      scheduleBar(barIdx, nextBar);
      nextBar += BAR;
      barIdx = (barIdx + 1) % BARS;
    }
  }
  AU.music = function (on) {
    if (on) {
      if (!ensure() || musicOn) return AU;
      musicOn = true;
      nextBar = ctx.currentTime + 0.1;
      barIdx = 0;
      scheduler();
      schedTimer = setInterval(scheduler, 200);
    } else {
      musicOn = false;
      if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
    }
    return AU;
  };
  AU.musicOn = function () { return musicOn; };

  /* ---------- prefs API ---------- */
  AU.setVolume = function (bus, v) {
    v = Math.max(0, Math.min(1, v));
    if (bus in prefs) { prefs[bus] = v; save(); applyPrefs(); }
    return AU;
  };
  AU.getVolumes = function () { return { music: prefs.music, sfx: prefs.sfx, ui: prefs.ui, muted: prefs.muted }; };
  AU.setMuted = function (m) { prefs.muted = !!m; save(); applyPrefs(); return AU; };
  AU.toggleMute = function () { return AU.setMuted(!prefs.muted); };
  AU.isMuted = function () { return prefs.muted; };
})();
