/* Poolball — synthesized WebAudio SFX. No assets, no allocations per play.
 * AudioContext is created/resumed on a user gesture only. */
'use strict';

var PBAU = (function () {
  var C = (typeof PBC !== 'undefined') ? PBC : null;
  var ctx = null, master = null, muted = false, heartTimer = null, ambientOn = false;
  try { muted = localStorage.getItem('poolball_mute') === '1'; } catch (e) {}

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
      startAmbient();
      return true;
    } catch (e) { return false; }
  }
  function unlock() { ensure(); }

  function noiseBuf() {
    if (noiseBuf._b) return noiseBuf._b;
    var b = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf._b = b;
    return b;
  }

  // crisp ball click, scales with impact force 0..1
  function click(force) {
    if (!ensure() || muted) return;
    force = Math.max(0, Math.min(1, force));
    if (force < 0.03) return;
    var t = ctx.currentTime;
    var n = ctx.createBufferSource(); n.buffer = noiseBuf();
    var f = ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.value = 2400 + force * 1600; f.Q.value = 1.1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * force + 0.04, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    n.connect(f); f.connect(g); g.connect(master);
    n.start(t); n.stop(t + 0.09);
    var o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.value = 1500 + force * 900;
    var g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.18 * force, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    o.connect(g2); g2.connect(master);
    o.start(t); o.stop(t + 0.06);
  }

  function cushion(force) {
    if (!ensure() || muted) return;
    force = Math.max(0, Math.min(1, force));
    if (force < 0.05) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.09);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.4 * force, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.12);
  }

  function pocket() {
    if (!ensure() || muted) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.16);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.24);
    // rattle: three short ticks
    for (var i = 0; i < 3; i++) {
      (function (dt) {
        var n = ctx.createBufferSource(); n.buffer = noiseBuf();
        var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000;
        var gg = ctx.createGain();
        gg.gain.setValueAtTime(0.10, t + dt);
        gg.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.03);
        n.connect(f); f.connect(gg); gg.connect(master);
        n.start(t + dt); n.stop(t + dt + 0.04);
      })(0.10 + i * 0.055);
    }
  }

  function strike(power) {
    if (!ensure() || muted) return;
    var t = ctx.currentTime;
    var n = ctx.createBufferSource(); n.buffer = noiseBuf();
    var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.25 + power * 0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(f); f.connect(g); g.connect(master);
    n.start(t); n.stop(t + 0.06);
  }

  function ui() {
    if (!ensure() || muted) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 880;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.07);
  }

  function star(i) {
    if (!ensure() || muted) return;
    var t = ctx.currentTime, notes = [523, 659, 784];
    var o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.value = notes[Math.min(i, 2)];
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.4);
  }

  function clearJingle() {
    if (!ensure() || muted) return;
    var t = ctx.currentTime, notes = [392, 523, 659, 784, 1046];
    for (var i = 0; i < notes.length; i++) {
      (function (n, dt) {
        var o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = n;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + dt);
        g.gain.exponentialRampToValueAtTime(0.2, t + dt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.3);
        o.connect(g); g.connect(master); o.start(t + dt); o.stop(t + dt + 0.35);
      })(notes[i], i * 0.09);
    }
  }

  function heartbeat(on) {
    if (on) {
      if (heartTimer || !ensure()) return;
      var thump = function () {
        if (muted) return;
        var t = ctx.currentTime;
        for (var i = 0; i < 2; i++) {
          (function (dt) {
            var o = ctx.createOscillator(); o.type = 'sine';
            o.frequency.setValueAtTime(65, t + dt);
            o.frequency.exponentialRampToValueAtTime(40, t + dt + 0.12);
            var g = ctx.createGain();
            g.gain.setValueAtTime(0.5, t + dt);
            g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.16);
            o.connect(g); g.connect(master); o.start(t + dt); o.stop(t + dt + 0.18);
          })(i * 0.22);
        }
      };
      thump();
      heartTimer = setInterval(thump, 1100);
    } else if (heartTimer) { clearInterval(heartTimer); heartTimer = null; }
  }

  function startAmbient() {
    if (ambientOn || !ctx) return;
    ambientOn = true;
    // 2am pool hall room tone: very soft filtered noise, barely there
    var n = ctx.createBufferSource(); n.buffer = noiseBuf(); n.loop = true;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
    var g = ctx.createGain(); g.gain.value = 0.016;
    n.connect(f); f.connect(g); g.connect(master);
    n.start();
  }

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem('poolball_mute', muted ? '1' : '0'); } catch (e) {}
    if (master) master.gain.value = muted ? 0 : 0.9;
    if (muted) heartbeat(false);
  }
  function isMuted() { return muted; }

  return {
    unlock: unlock, click: click, cushion: cushion, pocket: pocket,
    strike: strike, ui: ui, star: star, clearJingle: clearJingle,
    heartbeat: heartbeat, setMuted: setMuted, isMuted: isMuted,
  };
})();
