/* Dead Man's Corridor — synthesized audio. All Web Audio, no assets.
 * Gunshots, impacts, enemy vocals, nova, and a dread ambient bed.
 */
(function () {
  'use strict';
  var S = window.DCSfx = {};
  var ac = null, master = null, sfxBus = null, ambBus = null;
  var muted = false;

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(master);
    ambBus = ac.createGain(); ambBus.gain.value = 0.34; ambBus.connect(master);
    startAmbient();
  }
  S.init = init;
  S.toggleMute = function () {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.9;
    return muted;
  };

  function now() { return ac ? ac.currentTime : 0; }
  function env(g, t0, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  function noiseBuf(len) {
    var b = ac.createBuffer(1, len, ac.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  var _nb = null;
  function noise() { if (!_nb) _nb = noiseBuf(ac.sampleRate * 1.2); return _nb; }

  function burst(t0, dur, filterType, freq, q, peak) {
    var src = ac.createBufferSource(); src.buffer = noise();
    var f = ac.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    var g = ac.createGain();
    env(g, t0, 0.004, peak, dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t0); src.stop(t0 + dur + 0.1);
  }
  function tone(t0, dur, type, f0, f1, peak, dest) {
    var o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    var g = ac.createGain();
    env(g, t0, 0.008, peak, dur);
    o.connect(g); g.connect(dest || sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.1);
  }
  function ok() { return ac && !muted && ac.state === 'running'; }

  S.shoot = function () {
    if (!ok()) return;
    var t = now();
    burst(t, 0.16, 'lowpass', 900, 0.6, 0.9);       // body thump
    burst(t, 0.06, 'highpass', 2400, 0.7, 0.5);    // crack
    tone(t, 0.12, 'square', 160, 45, 0.35);        // punch
  };
  S.hit = function () {
    if (!ok()) return;
    var t = now();
    burst(t, 0.09, 'bandpass', 700, 1.4, 0.55);    // wet splat
    tone(t, 0.08, 'sawtooth', 220, 90, 0.22);
  };
  S.kill = function () {
    if (!ok()) return;
    var t = now();
    burst(t, 0.22, 'lowpass', 500, 0.8, 0.6);
    tone(t, 0.3, 'sawtooth', 140, 35, 0.4);        // death rattle drop
  };
  S.hurt = function () {
    if (!ok()) return;
    var t = now();
    burst(t, 0.25, 'lowpass', 400, 0.7, 0.8);
    tone(t, 0.35, 'sawtooth', 90, 40, 0.5);
  };
  S.reload = function () {
    if (!ok()) return;
    var t = now();
    burst(t, 0.05, 'highpass', 3000, 1, 0.4);
    burst(t + 0.18, 0.05, 'highpass', 2600, 1, 0.4);
    tone(t + 0.42, 0.07, 'square', 900, 1400, 0.25); // slide clack
  };
  S.telegraph = function () {
    if (!ok()) return;
    tone(now(), 0.28, 'sawtooth', 70, 130, 0.3);   // rising snarl
  };
  S.spawn = function () {
    if (!ok()) return;
    tone(now(), 0.4, 'sawtooth', 55, 90, 0.25);
  };
  S.spit = function () {
    if (!ok()) return;
    var t = now();
    burst(t, 0.12, 'bandpass', 1200, 2, 0.4);
    tone(t, 0.15, 'square', 500, 180, 0.2);
  };
  S.ready = function () {
    if (!ok()) return;
    var t = now();
    tone(t, 0.2, 'sine', 660, 660, 0.3);
    tone(t + 0.16, 0.3, 'sine', 990, 990, 0.3);
  };
  S.nova = function () {
    if (!ok()) return;
    var t = now();
    burst(t, 0.8, 'lowpass', 3000, 0.4, 1.0);
    tone(t, 0.9, 'sawtooth', 60, 400, 0.5);
    tone(t, 0.7, 'sine', 1200, 100, 0.3);
  };
  S.gameover = function (win) {
    if (!ok()) return;
    var t = now();
    if (win) {
      [523, 659, 784].forEach(function (f, i) { tone(t + i * 0.14, 0.35, 'triangle', f, f, 0.35); });
    } else {
      tone(t, 1.4, 'sawtooth', 110, 28, 0.5);
      burst(t, 1.0, 'lowpass', 300, 0.6, 0.5);
    }
  };
  S.start = function () {
    if (!ok()) return;
    tone(now(), 0.5, 'sawtooth', 50, 90, 0.3);
  };
  S.click = function () {
    if (!ok()) return;
    tone(now(), 0.06, 'square', 800, 600, 0.2);
  };

  /* dread ambient bed: detuned low drones + slow LFO + distant clanks */
  function startAmbient() {
    var t = now();
    [41, 41.7, 82.5].forEach(function (f, i) {
      var o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      var fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 160;
      var g = ac.createGain(); g.gain.value = i === 2 ? 0.05 : 0.09;
      var lfo = ac.createOscillator(); lfo.frequency.value = 0.05 + i * 0.03;
      var lg = ac.createGain(); lg.gain.value = 0.04;
      lfo.connect(lg); lg.connect(g.gain);
      o.connect(fl); fl.connect(g); g.connect(ambBus);
      o.start(t); lfo.start(t);
    });
    // random distant clanks
    (function clank() {
      if (!ac) return;
      var t2 = now() + 4 + Math.random() * 9;
      var o = ac.createOscillator(); o.type = 'square';
      o.frequency.value = 180 + Math.random() * 400;
      var g = ac.createGain();
      env(g, t2, 0.01, 0.05, 0.7);
      var f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 4;
      o.connect(f); f.connect(g); g.connect(ambBus);
      o.start(t2); o.stop(t2 + 1);
      setTimeout(clank, (t2 - now()) * 1000);
    })();
  }
})();
