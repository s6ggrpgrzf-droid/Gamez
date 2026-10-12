// Night Market — generative audio engine.
// Plain script, no modules. Everything synthesized with WebAudio, zero assets.
//
// SOUND PALETTE
//   Bed (ambient, never annoying at low volume):
//     - crowd murmur : looped noise -> bandpass ~620Hz (drifts 480-760Hz) +
//                      slow gain LFO, very low level
//     - chatter      : rare soft distant blips, filtered sawtooth, pentatonic-ish
//     - wok sizzle   : highpassed noise bursts every 4-9s, 0.4-0.8s decay
//     - crickets     : twin sines ~4.15/4.43kHz with amplitude tremolo, whisper-quiet
//     - music        : sparse pentatonic pluck phrases (A C D E G), triangle osc,
//                      exponential decay, warm lowpass, one phrase every ~8s
//   SFX (voice-capped at 8, steal-quietest):
//     - coin()      : metallic tick, square 2.2k + 3.1kHz, 60ms
//     - buy()       : warm wooden thump, triangle 180->110Hz + noise click
//     - gong()      : signature deep gong, 98/147/196Hz partials + 98.7Hz beating
//                     pair, 2.5s decay, soft strike transient
//     - claim()     : rising 4-note pentatonic arpeggio, soft
//     - milestone() : two-sine chime 880/1320Hz, 1s
//     - uiTick()    : near-subliminal 1.2kHz blip, 30ms
//
// Rules honored: master gain 0.5; mute persisted in localStorage 'nm_mute';
// max 8 concurrent SFX voices (steal-quietest); bed loop uses pre-created nodes
// + LFOs (no per-tick allocation); ctx.resume() on visibilitychange->visible.
var NM = (typeof window !== 'undefined' && window.NM) ? window.NM : {};
if (typeof window !== 'undefined') { window.NM = NM; }

(function () {
  'use strict';

  // ---------- module state (A_ prefix) ----------
  var A_ctx = null;
  var A_master = null, A_sfxBus = null, A_bedBus = null;
  var A_noiseBuf = null;
  var A_muted = false;
  var A_gestureSeen = false;
  var A_bedWanted = false, A_bedOn = false, A_bedBuilt = false;
  var A_bedGain = null;
  var A_schedTimer = null;
  var A_nextSizzle = 0, A_nextChatter = 0, A_nextPhrase = 0;
  var A_voices = [];          // active SFX voices: {peak, kill}
  var A_deferRetry = null;
  var MUTE_KEY = 'nm_mute';
  var MAX_VOICES = 8;

  // Pentatonic sets (A C D E G across octaves)
  var A_SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25];
  var A_CHATTER = [311.13, 349.23, 392, 440, 523.25];

  // ---------- tiny helpers ----------
  function A_now() { return A_ctx.currentTime; }

  function A_readMute() {
    try {
      return (typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1');
    } catch (e) { return false; }
  }
  A_muted = A_readMute();

  function A_applyMute() {
    if (!A_ctx) return;
    var t = A_now();
    A_master.gain.cancelScheduledValues(t);
    A_master.gain.setTargetAtTime(A_muted ? 0.0 : 0.5, t, 0.03);
  }

  // ---------- voice management (steal-quietest, cap 8) ----------
  function A_addVoice(peak, kill) {
    var v = { peak: peak, kill: kill };
    if (A_voices.length >= MAX_VOICES) {
      var qi = 0, i;
      for (i = 1; i < A_voices.length; i++) {
        if (A_voices[i].peak < A_voices[qi].peak) qi = i;
      }
      var old = A_voices[qi];
      A_voices.splice(qi, 1);
      try { old.kill(); } catch (e) {}
    }
    A_voices.push(v);
    return v;
  }
  function A_dropVoice(v) {
    var i = A_voices.indexOf(v);
    if (i >= 0) A_voices.splice(i, 1);
  }

  // ---------- primitive: enveloped tone ----------
  // o: {f, f2, type, at, dur, peak, attack, lp, hp, bp, q, dest, noVoice}
  function A_tone(o) {
    if (!A_ctx || A_muted) return null;
    var t0 = A_now() + (o.at || 0);
    var dur = o.dur || 0.2;
    var osc = A_ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(1, o.f), t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + dur);
    var g = A_ctx.createGain();
    var atk = (o.attack != null) ? o.attack : 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    var filt = null;
    if (o.lp) { filt = A_ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = o.lp; }
    else if (o.hp) { filt = A_ctx.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = o.hp; }
    else if (o.bp) { filt = A_ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = o.bp; filt.Q.value = o.q || 1; }
    if (filt) { osc.connect(filt); filt.connect(g); } else { osc.connect(g); }
    g.connect(o.dest || A_sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    var v = null;
    if (!o.noVoice) {
      v = A_addVoice(o.peak, function () {
        try {
          var n = A_now();
          g.gain.cancelScheduledValues(n);
          g.gain.setTargetAtTime(0.0001, n, 0.012);
          osc.stop(n + 0.08);
        } catch (e) {}
      });
    }
    osc.onended = function () {
      if (v) A_dropVoice(v);
      try { g.disconnect(); } catch (e) {}
      try { if (filt) filt.disconnect(); } catch (e2) {}
    };
    return v;
  }

  // ---------- primitive: enveloped filtered noise ----------
  // o: {at, dur, peak, attack, lp, hp, bp, q, rate, dest, noVoice}
  function A_noise(o) {
    if (!A_ctx || A_muted || !A_noiseBuf) return null;
    var t0 = A_now() + (o.at || 0);
    var dur = o.dur || 0.3;
    var src = A_ctx.createBufferSource();
    src.buffer = A_noiseBuf;
    src.loop = true;
    src.playbackRate.value = o.rate || 1;
    var filt = A_ctx.createBiquadFilter();
    if (o.hp) { filt.type = 'highpass'; filt.frequency.value = o.hp; }
    else if (o.lp) { filt.type = 'lowpass'; filt.frequency.value = o.lp; }
    else { filt.type = 'bandpass'; filt.frequency.value = o.bp || 1000; filt.Q.value = o.q || 0.8; }
    var g = A_ctx.createGain();
    var atk = (o.attack != null) ? o.attack : 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(o.dest || A_sfxBus);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
    var v = null;
    if (!o.noVoice) {
      v = A_addVoice(o.peak, function () {
        try {
          var n = A_now();
          g.gain.cancelScheduledValues(n);
          g.gain.setTargetAtTime(0.0001, n, 0.012);
          src.stop(n + 0.08);
        } catch (e) {}
      });
    }
    src.onended = function () {
      if (v) A_dropVoice(v);
      try { g.disconnect(); filt.disconnect(); } catch (e) {}
    };
    return v;
  }

  // ---------- bed: pre-created continuous graph (nodes + LFOs, built once) ----------
  function A_buildBed() {
    if (A_bedBuilt || !A_ctx) return;
    A_bedBuilt = true;

    A_bedGain = A_ctx.createGain();
    A_bedGain.gain.value = 0;
    A_bedGain.connect(A_bedBus);

    // Crowd murmur: looped noise -> bandpass ~620Hz, slow LFOs on gain + freq
    var msrc = A_ctx.createBufferSource();
    msrc.buffer = A_noiseBuf; msrc.loop = true;
    var mbp = A_ctx.createBiquadFilter();
    mbp.type = 'bandpass'; mbp.frequency.value = 620; mbp.Q.value = 0.7;
    var mg = A_ctx.createGain(); mg.gain.value = 0.045;
    msrc.connect(mbp); mbp.connect(mg); mg.connect(A_bedGain);
    var mlfo1 = A_ctx.createOscillator(); mlfo1.frequency.value = 0.07;
    var mlfod1 = A_ctx.createGain(); mlfod1.gain.value = 0.02;
    mlfo1.connect(mlfod1); mlfod1.connect(mg.gain);
    var mlfo2 = A_ctx.createOscillator(); mlfo2.frequency.value = 0.05;
    var mlfod2 = A_ctx.createGain(); mlfod2.gain.value = 140;
    mlfo2.connect(mlfod2); mlfod2.connect(mbp.frequency);
    msrc.start(); mlfo1.start(); mlfo2.start();

    // Cricket shimmer: twin high sines with tremolo, whisper-quiet
    var cg = A_ctx.createGain(); cg.gain.value = 0.007;
    cg.connect(A_bedGain);
    var cf = [4150, 4430], i;
    for (i = 0; i < cf.length; i++) {
      (function (f, k) {
        var o = A_ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        var g = A_ctx.createGain(); g.gain.value = 0.5;
        var tr = A_ctx.createOscillator(); tr.frequency.value = 4.2 + k * 0.7;
        var tg = A_ctx.createGain(); tg.gain.value = 0.5;
        tr.connect(tg); tg.connect(g.gain);
        o.connect(g); g.connect(cg);
        o.start(); tr.start();
      })(cf[i], i);
    }
    var clfo = A_ctx.createOscillator(); clfo.frequency.value = 0.09;
    var clgod = A_ctx.createGain(); clgod.gain.value = 0.004;
    clfo.connect(clgod); clgod.connect(cg.gain);
    clfo.start();
  }

  // ---------- bed: scheduled random events (no per-tick allocation) ----------
  function A_sizzle() {
    A_noise({
      dur: 0.4 + Math.random() * 0.4,
      peak: 0.06,
      attack: 0.03,
      hp: 2800,
      rate: 0.9 + Math.random() * 0.4,
      dest: A_bedGain,
      noVoice: true
    });
  }

  function A_chatter() {
    if (Math.random() > 0.45) return;   // keep it sparse and distant
    var n = 1 + ((Math.random() * 3) | 0), i, at = 0;
    for (i = 0; i < n; i++) {
      var f = A_CHATTER[(Math.random() * A_CHATTER.length) | 0];
      A_tone({
        f: f, type: 'sawtooth',
        at: at, dur: 0.12 + Math.random() * 0.13,
        peak: 0.012, attack: 0.02,
        bp: 900, q: 2,
        dest: A_bedGain, noVoice: true
      });
      at += 0.16 + Math.random() * 0.1;
    }
  }

  function A_phrase() {
    var nNotes = 3 + ((Math.random() * 3) | 0);
    var at = 0.05;
    var idx = (Math.random() * A_SCALE.length) | 0;
    var i;
    for (i = 0; i < nNotes; i++) {
      A_tone({
        f: A_SCALE[idx], type: 'triangle',
        at: at, dur: 1.6,
        peak: 0.09, attack: 0.01,
        lp: 1400,
        dest: A_bedGain, noVoice: true
      });
      at += 0.7 + Math.random() * 0.5;
      idx += -2 + ((Math.random() * 5) | 0);   // wander stepwise, pentatonic = no clash
      if (idx < 0) idx = 0;
      if (idx >= A_SCALE.length) idx = A_SCALE.length - 1;
    }
  }

  function A_bedTick() {
    if (!A_bedOn || !A_ctx) return;
    var n = A_now();
    if (n >= A_nextSizzle) { A_sizzle(); A_nextSizzle = n + 4 + Math.random() * 5; }
    if (n >= A_nextChatter) { A_chatter(); A_nextChatter = n + 2.5 + Math.random() * 3.5; }
    if (n >= A_nextPhrase) { A_phrase(); A_nextPhrase = n + 7 + Math.random() * 3; }
  }

  function A_startSched() {
    if (A_schedTimer) return;
    var n = A_now();
    A_nextSizzle = n + 2 + Math.random() * 4;
    A_nextChatter = n + 3 + Math.random() * 3;
    A_nextPhrase = n + 1.5;
    A_schedTimer = setInterval(A_bedTick, 400);
  }

  // ---------- public API ----------
  function audioInit() {
    if (A_ctx) {
      if (A_ctx.state === 'suspended') { try { A_ctx.resume(); } catch (e) {} }
      if (A_bedWanted && !A_bedOn) startBed();
      return;
    }
    // Callable only from a user gesture: defer until the first pointerdown.
    if (!A_gestureSeen) {
      if (!A_deferRetry && typeof window !== 'undefined') {
        A_deferRetry = function () {
          if (A_ctx) { A_unarmDefer(); return; }
          audioInit();
        };
        window.addEventListener('pointerdown', A_deferRetry);
        window.addEventListener('touchend', A_deferRetry);
        window.addEventListener('keydown', A_deferRetry);
      }
      return;
    }
    var AC = (typeof AudioContext !== 'undefined') ? AudioContext :
      ((typeof window !== 'undefined' && window.webkitAudioContext) ? window.webkitAudioContext : null);
    if (!AC) return;
    try { A_ctx = new AC(); } catch (e) { A_ctx = null; return; }

    A_master = A_ctx.createGain();
    A_master.gain.value = A_muted ? 0 : 0.5;
    var comp = A_ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    A_master.connect(comp); comp.connect(A_ctx.destination);

    A_sfxBus = A_ctx.createGain(); A_sfxBus.gain.value = 0.9; A_sfxBus.connect(A_master);
    A_bedBus = A_ctx.createGain(); A_bedBus.gain.value = 0.85; A_bedBus.connect(A_master);

    // Shared 2s white-noise buffer (murmur loop + sizzle source).
    var len = A_ctx.sampleRate * 2;
    A_noiseBuf = A_ctx.createBuffer(1, len, A_ctx.sampleRate);
    var d = A_noiseBuf.getChannelData(0), i;
    for (i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    if (A_ctx.state === 'suspended') { try { A_ctx.resume(); } catch (e2) {} }
    A_unarmDefer();
    if (A_bedWanted && !A_bedOn) startBed();
  }

  function A_unarmDefer() {
    if (A_deferRetry && typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', A_deferRetry);
      window.removeEventListener('touchend', A_deferRetry);
      window.removeEventListener('keydown', A_deferRetry);
      A_deferRetry = null;
    }
  }

  function toggleMute() {
    A_muted = !A_muted;
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(MUTE_KEY, A_muted ? '1' : '0');
    } catch (e) {}
    A_applyMute();
    return A_muted;
  }

  function isMuted() { return A_muted; }

  function startBed() {
    A_bedWanted = true;
    if (!A_ctx) return;            // init() not yet run (deferred) — will auto-start
    A_buildBed();
    if (A_bedOn) return;
    A_bedOn = true;
    var t = A_now();
    A_bedGain.gain.cancelScheduledValues(t);
    A_bedGain.gain.setTargetAtTime(1.0, t, 1.5);   // gentle fade-in
    A_startSched();
  }

  function stopBed() {
    A_bedWanted = false;
    if (!A_ctx || !A_bedOn) return;
    A_bedOn = false;
    var t = A_now();
    A_bedGain.gain.cancelScheduledValues(t);
    A_bedGain.gain.setTargetAtTime(0.0, t, 0.6);
    if (A_schedTimer) { clearInterval(A_schedTimer); A_schedTimer = null; }
  }

  // ---------- SFX ----------
  function sfxCoin() {
    A_tone({ f: 2200, type: 'square', dur: 0.06, peak: 0.10, lp: 5200 });
    A_tone({ f: 3100, type: 'square', at: 0.012, dur: 0.06, peak: 0.07, lp: 6500 });
  }

  function sfxBuy() {
    A_tone({ f: 180, f2: 110, type: 'triangle', dur: 0.28, peak: 0.28, attack: 0.004 });
    A_noise({ dur: 0.03, peak: 0.10, hp: 2500 });
  }

  function sfxGong() {
    // Signature deep gong: 98/147/196Hz partials + a 98.7Hz beating pair, 2.5s.
    var partials = [
      [98, 0.30], [98.7, 0.20],
      [147, 0.18], [196, 0.12],
      [294, 0.05]
    ], i;
    for (i = 0; i < partials.length; i++) {
      A_tone({ f: partials[i][0], type: 'sine', dur: 2.5, peak: partials[i][1], attack: 0.008 });
    }
    A_noise({ dur: 0.25, peak: 0.08, attack: 0.004, lp: 800 });  // mallet strike
    A_tone({ f: 49, type: 'sine', dur: 2.2, peak: 0.16, attack: 0.01 });  // sub weight
  }

  function sfxClaim() {
    var notes = [523.25, 587.33, 659.25, 783.99], i;
    for (i = 0; i < notes.length; i++) {
      A_tone({ f: notes[i], type: 'triangle', at: i * 0.11, dur: 0.6, peak: 0.12, attack: 0.01, lp: 2400 });
    }
  }

  function sfxMilestone() {
    A_tone({ f: 880, type: 'sine', dur: 1.0, peak: 0.10, attack: 0.01 });
    A_tone({ f: 1320, type: 'sine', at: 0.02, dur: 1.0, peak: 0.07, attack: 0.01 });
  }

  function sfxUiTick() {
    A_tone({ f: 1200, type: 'sine', dur: 0.03, peak: 0.045, attack: 0.004 });
  }

  NM.audio = {
    init: audioInit,
    toggleMute: toggleMute,
    isMuted: isMuted,
    startBed: startBed,
    stopBed: stopBed,
    coin: sfxCoin,
    buy: sfxBuy,
    gong: sfxGong,
    claim: sfxClaim,
    milestone: sfxMilestone,
    uiTick: sfxUiTick
  };

  // ---------- gesture + visibility wiring (script load) ----------
  if (typeof window !== 'undefined') {
    var markGesture = function () { A_gestureSeen = true; };
    window.addEventListener('pointerdown', markGesture, { passive: true });
    window.addEventListener('touchend', markGesture, { passive: true });
    window.addEventListener('keydown', markGesture);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        // iOS: resume the context when the page becomes visible again.
        if (!document.hidden && A_ctx && A_ctx.state === 'suspended') {
          try { A_ctx.resume(); } catch (e) {}
        }
      });
    }
  }
})();
