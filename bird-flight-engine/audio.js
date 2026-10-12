'use strict';
/* audio.js — procedural WebAudio for the sparrow. No assets.
 * Context is created/resumed on the first user gesture (Take wing).
 *   wind    : looped noise -> lowpass; gain/freq follow airspeed
 *   whoosh  : short noise burst on each flap
 *   thermal : soft two-sine hum while soaring a column
 *   chime   : waypoint arrival (E5 -> B5, warm decay)
 *   bells   : distant church bells when crossing the riverside village
 *             (original touch #2 — three soft strikes, lowpassed, far away)
 * Everything degrades silently when AudioContext is unavailable.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  else { root.AUD = api; }
})(typeof self !== 'undefined' ? self : this, function () {

  var A = {
    ctx: null, master: null, muted: false,
    windGain: null, windFilter: null, thermalGain: null,
  };

  function noiseBuffer(ctx, seconds) {
    var buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function init() {
    if (A.ctx) return true;
    var C = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
    if (!C) return false;
    try { A.ctx = new C(); } catch (e) { return false; }
    var ctx = A.ctx;
    A.master = ctx.createGain();
    A.master.gain.value = A.muted ? 0 : 0.55;
    A.master.connect(ctx.destination);

    // wind bed
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 2.5); src.loop = true;
    A.windFilter = ctx.createBiquadFilter();
    A.windFilter.type = 'lowpass'; A.windFilter.frequency.value = 420; A.windFilter.Q.value = 0.6;
    A.windGain = ctx.createGain(); A.windGain.gain.value = 0;
    src.connect(A.windFilter); A.windFilter.connect(A.windGain); A.windGain.connect(A.master);
    src.start();

    // thermal hum: 82Hz + 164Hz sines
    var o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 82;
    var o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 164.5;
    var g2 = ctx.createGain(); g2.gain.value = 0.35;
    A.thermalGain = ctx.createGain(); A.thermalGain.gain.value = 0;
    o1.connect(A.thermalGain); o2.connect(g2); g2.connect(A.thermalGain);
    A.thermalGain.connect(A.master);
    o1.start(); o2.start();
    return true;
  }

  function resume() {
    if (A.ctx && A.ctx.state === 'suspended') { try { A.ctx.resume(); } catch (e) {} }
  }

  function setMuted(m) {
    A.muted = !!m;
    if (A.master && A.ctx) A.master.gain.setTargetAtTime(A.muted ? 0 : 0.55, A.ctx.currentTime, 0.1);
  }

  // called per frame: p = { speed, inThermal }
  function update(p) {
    if (!A.ctx || A.muted) return;
    var t = A.ctx.currentTime;
    var w = Math.min(1, Math.max(0, (p.speed - 6) / 22));
    A.windGain.gain.setTargetAtTime(w * 0.5, t, 0.25);
    A.windFilter.frequency.setTargetAtTime(320 + p.speed * 34, t, 0.25);
    A.thermalGain.gain.setTargetAtTime(p.inThermal ? 0.10 : 0, t, 0.4);
  }

  function whoosh() {
    if (!A.ctx || A.muted) return;
    var ctx = A.ctx, t = ctx.currentTime;
    var s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx, 0.3);
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 850; f.Q.value = 1.1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    s.connect(f); f.connect(g); g.connect(A.master);
    s.start(t); s.stop(t + 0.3);
  }

  function tone(freq, t0, dur, vol, type) {
    var ctx = A.ctx;
    var o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(A.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function chime() {
    if (!A.ctx || A.muted) return;
    var t = A.ctx.currentTime;
    tone(659.25, t, 1.1, 0.16);          // E5
    tone(987.77, t + 0.14, 1.4, 0.14);   // B5
  }

  // distant church bells: soft minor-third strikes, lowpassed like far away
  function bells() {
    if (!A.ctx || A.muted) return;
    var ctx = A.ctx, t = ctx.currentTime;
    var strikes = [196.0, 164.81, 146.83]; // G3 E3 D3
    for (var i = 0; i < strikes.length; i++) {
      var t0 = t + i * 1.15, f0 = strikes[i];
      [[1, 0.10], [2.76, 0.035], [5.4, 0.015]].forEach(function (p) {
        var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f0 * p[0];
        var fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 900;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(p[1], t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.6);
        o.connect(fl); fl.connect(g); g.connect(A.master);
        o.start(t0); o.stop(t0 + 2.7);
      });
    }
  }

  return { init: init, resume: resume, update: update, whoosh: whoosh, chime: chime, bells: bells, setMuted: setMuted };
});
