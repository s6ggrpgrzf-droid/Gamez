/* Bubble Hex audio — WebAudio synth SFX + generative music-box soundtrack. */
var HexAudio = (function () {
  var ctx = null, master = null, musicGain = null;
  var musicOn = true, sfxOn = true, tension = 0, musicTimer = null, step = 0;
  try { sfxOn = localStorage.getItem('bubblehex_sfx') !== 'off'; } catch (e) { sfxOn = true; }

  function ac() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
        musicGain = ctx.createGain(); musicGain.gain.value = 0.0; musicGain.connect(master);
      } catch (e) {}
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type, vol, slide, dest) {
    var c = ac(); if (!c) return;
    if (!sfxOn && dest !== musicGain) return; // music box keeps playing; SFX mute here
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), c.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.12, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0008, c.currentTime + dur);
    o.connect(g); g.connect(dest || master);
    o.start(); o.stop(c.currentTime + dur + 0.02);
  }
  function noise(dur, vol, freq) {
    var c = ac(); if (!c || !sfxOn) return;
    var len = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource(); src.buffer = buf;
    var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1200;
    var g = c.createGain(); g.gain.value = vol || 0.1;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  /* ---- generative music: moonlit music box ----
   * Pentatonic lullaby over a slow drone. Tension (0..1) quickens the
   * pattern and adds a shimmer layer when shots run low. */
  var SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.7, 1318.5]; // C major pentatonic-ish
  var MELODY = [0, 2, 4, 7, 5, 4, 2, 4, 0, 2, 4, 5, 7, 5, 4, 2];
  var DRONES = [130.81, 98.0, 110.0, 98.0]; // C3 G2 A2 G2
  function musicStep() {
    if (!musicOn || !ctx) return;
    var c = ctx;
    var fast = tension > 0.45;
    var idx = MELODY[step % MELODY.length];
    var f = SCALE[idx % SCALE.length] * (step % 32 >= 16 ? 1 : 1);
    // music-box pluck: triangle + bright sine octave
    tone(f, 0.9, 'triangle', 0.055, null, musicGain);
    tone(f * 2, 0.5, 'sine', 0.022, null, musicGain);
    if (fast && step % 2 === 0) tone(SCALE[(idx + 4) % SCALE.length] * 2, 0.4, 'sine', 0.018, null, musicGain);
    if (step % 8 === 0) {
      var dr = DRONES[(step / 8 | 0) % DRONES.length];
      tone(dr, 3.2, 'sine', 0.035, null, musicGain);
      tone(dr * 1.5, 3.2, 'sine', 0.02, null, musicGain);
    }
    if (Math.random() < 0.12 + tension * 0.15) {
      var sp = SCALE[(Math.random() * SCALE.length) | 0] * 2;
      setTimeout(function () { tone(sp, 0.7, 'sine', 0.02, null, musicGain); }, 180);
    }
    step++;
    musicTimer = setTimeout(musicStep, fast ? 340 : 470);
  }
  function music(on) {
    ac();
    if (on && musicOn && !musicTimer) {
      if (musicGain) musicGain.gain.setTargetAtTime(0.9, ctx.currentTime, 1.2);
      musicStep();
    } else if (!on && musicTimer) {
      clearTimeout(musicTimer); musicTimer = null;
      if (musicGain) musicGain.gain.setTargetAtTime(0.0, ctx.currentTime, 0.4);
    } else if (on && !musicOn) {
      // toggled back on
      if (musicGain) musicGain.gain.setTargetAtTime(0.9, ctx.currentTime, 1.2);
      musicStep();
    }
    if (!on && musicGain && ctx) musicGain.gain.setTargetAtTime(0.0, ctx.currentTime, 0.4);
  }

  return {
    unlock: function () { ac(); },
    setTension: function (t) { tension = Math.max(0, Math.min(1, t)); },
    music: function (on) {
      if (on === undefined) return musicOn;
      if (on) { musicOn = true; music(true); } else { music(false); }
    },
    musicToggle: function () {
      musicOn = !musicOn;
      music(musicOn);
      return musicOn;
    },
    sfx: function (on) {
      if (on === undefined) return sfxOn;
      sfxOn = !!on;
      try { localStorage.setItem('bubblehex_sfx', sfxOn ? 'on' : 'off'); } catch (e) {}
      return sfxOn;
    },
    sfxToggle: function () { return this.sfx(!sfxOn); },

    shoot: function () { tone(520, 0.14, 'sine', 0.10, 940); noise(0.06, 0.03, 3000); },
    tick: function () { tone(880, 0.05, 'sine', 0.05); },
    stick: function () { tone(300, 0.09, 'triangle', 0.09); tone(150, 0.07, 'sine', 0.06); },
    pop: function (n, mult) {
      var base = 620 * (1 + Math.min(mult || 1, 5) * 0.08);
      for (var i = 0; i < Math.min(n, 6); i++) {
        (function (k) {
          setTimeout(function () { tone(base + k * 90 + Math.random() * 60, 0.12, 'sine', 0.10); }, k * 45);
        })(i);
      }
      noise(0.08, 0.04, 4000);
    },
    drop: function () { tone(420, 0.3, 'sine', 0.09, 110); },
    gulp: function () { tone(300, 0.16, 'sine', 0.12, 90); setTimeout(function () { tone(180, 0.2, 'sine', 0.1, 70); }, 120); },
    click: function () { tone(700, 0.06, 'sine', 0.07); },
    orb: function () { tone(760, 0.35, 'sine', 0.12, 1520); tone(1140, 0.3, 'sine', 0.07, 2200); },
    orbReady: function () {
      [880, 1108, 1318, 1760].forEach(function (f, i) {
        setTimeout(function () { tone(f, 0.3, 'triangle', 0.09); }, i * 90);
      });
    },
    orbBlast: function () {
      tone(180, 1.4, 'sawtooth', 0.14, 60);
      tone(1200, 1.2, 'sine', 0.08, 2400);
      noise(1.0, 0.06, 2500);
      [523, 659, 784, 1047, 1319].forEach(function (f, i) {
        setTimeout(function () { tone(f, 0.5, 'triangle', 0.08); }, 200 + i * 110);
      });
    },
    blast: function () { tone(200, 0.5, 'sawtooth', 0.15, 60); },
    hoot: function () { tone(392, 0.18, 'sine', 0.10, 330); setTimeout(function () { tone(330, 0.25, 'sine', 0.10, 262); }, 160); },
    ghostFree: function () {
      [1047, 1319, 1568, 2093].forEach(function (f, i) {
        setTimeout(function () { tone(f, 0.4, 'sine', 0.07); }, i * 100);
      });
    },
    caw: function () { tone(700, 0.12, 'sawtooth', 0.07, 420); },
    wilburDown: function () {
      tone(500, 0.4, 'sawtooth', 0.10, 120);
      [659, 784, 1047].forEach(function (f, i) {
        setTimeout(function () { tone(f, 0.35, 'triangle', 0.09); }, 250 + i * 130);
      });
    },
    rumble: function () { noise(0.5, 0.10, 220); tone(70, 0.5, 'sine', 0.12, 45); },
    win: function () {
      [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) {
        setTimeout(function () { tone(f, 0.35, 'triangle', 0.11); tone(f * 2, 0.25, 'sine', 0.04); }, i * 130);
      });
    },
    // staged win ceremony: one rising music-box tick per star
    starTick: function (i) {
      var f = 1046.5 * Math.pow(1.26, Math.min(i, 6));
      tone(f, 0.5, 'triangle', 0.11); tone(f * 2, 0.3, 'sine', 0.035);
      setTimeout(function () { tone(f * 1.5, 0.4, 'sine', 0.04); }, 90);
    },
    // Bubble Rain drops: pitch climbs as the rain falls
    rainTick: function (i) { tone(880 + i * 36, 0.14, 'sine', 0.055); tone(1760 + i * 72, 0.1, 'sine', 0.02); },
    // daily streak claim burst
    coinBurst: function () {
      [1318.5, 1568, 2093, 2637].forEach(function (f, i) {
        setTimeout(function () { tone(f, 0.3, 'triangle', 0.09); tone(f * 2, 0.2, 'sine', 0.03); }, i * 75);
      });
    },
    lose: function () { tone(320, 0.6, 'sine', 0.10, 140); tone(210, 0.8, 'triangle', 0.08, 90); }
  };
})();
