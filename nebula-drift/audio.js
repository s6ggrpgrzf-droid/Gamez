/* Nebula Drift — Pass 3: Sound.
 * A generative soundscape, no audio files, nothing looped that you can
 * learn. A warm pad chord retunes itself to whichever constellation has
 * settled; a faint chime marks a figure completing; a soft falling tone
 * marks one dissolving. Everything is synthesized, voices are capped,
 * and the whole graph sleeps when the tab hides.
 *
 * House audio rules: created/resumed only inside a user gesture, buses
 * (pad / events / air -> master -> compressor), zero allocations in any
 * per-frame path (there is none — events only).
 */
'use strict';
(function () {
  /* Each figure gets a root from one calm scale (D major / lydian
   * neighbourhood), so wandering the sky feels like slow harmony
   * changes, never a wrong note. */
  var ROOTS = {
    'Cygnus': 146.83, 'Lyra': 220.00, 'Aquila': 196.00, 'Cassiopeia': 246.94,
    'Pegasus': 185.00, 'Andromeda': 164.81, 'Perseus': 220.00, 'Cepheus': 123.47,
    'Ursa Minor': 174.61, 'Ursa Major': 110.00, 'Draco': 130.81, 'Aries': 196.00,
    'Taurus': 174.61, 'Auriga': 164.81, 'Aquarius': 196.00, 'Hercules': 123.47,
    'Ophiuchus': 130.81
  };
  var DEFAULT_ROOT = 146.83;

  var state = { started: false, muted: false, root: DEFAULT_ROOT, region: '', plays: { chime: 0, unravel: 0, sparkle: 0 } };

  var ctx = null, master = null, padBus = null, eventBus = null;
  var curVoice = null;        /* { oscs: [], gain } */
  var sparkleTimer = 0;

  function rootFor(name) { return ROOTS[name] || DEFAULT_ROOT; }

  function makeVoice(root) {
    var g = ctx.createGain(); g.gain.value = 0;
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 640; filter.Q.value = 0.4;
    var lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
    var lfoAmt = ctx.createGain(); lfoAmt.gain.value = 190;
    lfo.connect(lfoAmt); lfoAmt.connect(filter.frequency); lfo.start();
    g.connect(filter); filter.connect(padBus);
    var ratios = [[1, 0.5], [1.5, 0.3], [2, 0.34], [2.25, 0.18], [3.02, 0.09]];
    var oscs = [lfo];
    var t = ctx.currentTime;
    ratios.forEach(function (pair) {
      [-5, 5].forEach(function (cents, ci) {
        var o = ctx.createOscillator();
        o.type = ci === 0 ? 'sine' : 'triangle';
        o.frequency.value = root * pair[0];
        o.detune.value = cents;
        var og = ctx.createGain(); og.gain.value = pair[1] * 0.5;
        o.connect(og); og.connect(g);
        o.start();
        oscs.push(o);
      });
    });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.11, t + 4.2);
    return { oscs: oscs, gain: g };
  }
  function retireVoice(voice) {
    if (!voice) return;
    var t = ctx.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(t);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, t);
      voice.gain.gain.linearRampToValueAtTime(0, t + 4.6);
      voice.oscs.forEach(function (o) { o.stop(t + 4.9); });
    } catch (e) { /* already gone */ }
  }

  function startAir() {
    var len = ctx.sampleRate * 2;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 460; bp.Q.value = 0.5;
    var lfo = ctx.createOscillator(); lfo.frequency.value = 0.03;
    var lfoAmt = ctx.createGain(); lfoAmt.gain.value = 170;
    lfo.connect(lfoAmt); lfoAmt.connect(bp.frequency); lfo.start();
    var g = ctx.createGain(); g.gain.value = 0.0075;
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start();
  }

  function sparkle() {
    if (!ctx || state.muted || ctx.state !== 'running') return;
    var steps = [4, 4.5, 5.34, 6, 8];
    var f = state.root * steps[Math.floor(Math.random() * steps.length)];
    var t = ctx.currentTime;
    var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.014, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    o.connect(g); g.connect(eventBus);
    o.start(t); o.stop(t + 3);
    state.plays.sparkle++;
  }

  function init(mutedPref) {
    if (state.started) { if (ctx && ctx.state === 'suspended') ctx.resume(); return; }
    state.muted = !!mutedPref;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    } catch (e) { return; }
    master = ctx.createGain(); master.gain.value = 0;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 6;
    master.connect(comp); comp.connect(ctx.destination);
    padBus = ctx.createGain(); padBus.gain.value = 0.9; padBus.connect(master);
    eventBus = ctx.createGain(); eventBus.gain.value = 0.9; eventBus.connect(master);
    var t = ctx.currentTime;
    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(state.muted ? 0 : 0.9, t + 3.2);
    curVoice = makeVoice(state.root);
    startAir();
    state.started = true;
    sparkleTimer = setInterval(function () { if (Math.random() < 0.55) sparkle(); }, 7000);
    if (ctx.state === 'suspended') ctx.resume();
  }

  function setRegion(name) {
    if (name === state.region) return;
    state.region = name || '';
    state.root = rootFor(name);
    if (!ctx || !state.started) return;
    var old = curVoice;
    curVoice = makeVoice(state.root);
    retireVoice(old);
  }

  function figureComplete(name) {
    state.plays.chime++;
    if (!ctx || state.muted || !state.started) return;
    var root = rootFor(name);
    var t = ctx.currentTime;
    [[4, 0.13], [6.01, 0.055], [8.2, 0.026], [2, 0.04]].forEach(function (p) {
      var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = root * p[0];
      var g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(p[1], t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
      o.connect(g); g.connect(eventBus);
      o.start(t); o.stop(t + 3.6);
    });
  }

  function unravel(name) {
    state.plays.unravel++;
    if (!ctx || state.muted || !state.started) return;
    var root = rootFor(name);
    var t = ctx.currentTime;
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(root * 2, t);
    o.frequency.exponentialRampToValueAtTime(root, t + 2.9);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.1);
    o.connect(g); g.connect(eventBus);
    o.start(t); o.stop(t + 3.3);
  }

  function setMuted(m) {
    state.muted = !!m;
    if (!ctx || !master) return;
    var t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(state.muted ? 0 : 0.9, t + 0.45);
  }

  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume() { if (ctx && ctx.state === 'suspended' && state.started) ctx.resume(); }

  window.ND_AUDIO = {
    init: init, setRegion: setRegion, figureComplete: figureComplete,
    unravel: unravel, setMuted: setMuted, suspend: suspend, resume: resume,
    state: state
  };
})();
