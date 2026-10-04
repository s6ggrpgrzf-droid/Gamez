/*
 * Neon Depths — audio.js
 * All-synthesized WebAudio: abyss drone, ball-roll loop, generative music,
 * and a full SFX vocabulary. No assets. Created/resumed on user gesture.
 */
'use strict';

function createAudio() {
  const A = {
    ctx: null, master: null, musicBus: null, sfxBus: null,
    muted: false, started: false,
    rollGain: null, rollFilter: null,
    heartT: 0, pluckT: 0, drumT: 0, drumStep: 0,
    intensity: 0, // 0 calm .. 1 wizard
  };

  try { A.muted = localStorage.getItem('neon-depths-muted') === '1'; } catch (e) {}

  A.ensure = () => {
    if (!A.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      A.ctx = new AC();
      A.master = A.ctx.createGain();
      A.master.gain.value = A.muted ? 0 : 0.9;
      A.master.connect(A.ctx.destination);
      A.musicBus = A.ctx.createGain(); A.musicBus.gain.value = 0.5; A.musicBus.connect(A.master);
      A.sfxBus = A.ctx.createGain(); A.sfxBus.gain.value = 0.9; A.sfxBus.connect(A.master);
      startDrone(A);
      startRoll(A);
      A.started = true;
    }
    if (A.ctx.state === 'suspended') A.ctx.resume();
  };

  A.setMuted = (m) => {
    A.muted = !!m;
    try { localStorage.setItem('neon-depths-muted', A.muted ? '1' : '0'); } catch (e) {}
    if (A.master) A.master.gain.setTargetAtTime(A.muted ? 0 : 0.9, A.ctx.currentTime, 0.02);
  };

  // ---------- primitives ----------
  function tone(o) {
    // {f, f2, t=type, d=dur, g=gain, at=attack, bus, delay}
    if (!A.ctx) return;
    const c = A.ctx, t0 = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.t || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + o.d);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.g || 0.2, t0 + (o.at || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.d);
    osc.connect(g); g.connect(o.bus || A.sfxBus);
    osc.start(t0); osc.stop(t0 + o.d + 0.05);
  }
  let noiseBuf = null;
  function noise(o) {
    // {d, g, f=filterFreq, q, t=filterType, f2, delay, bus, at}
    if (!A.ctx) return;
    const c = A.ctx, t0 = c.currentTime + (o.delay || 0);
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = o.t || 'bandpass';
    f.frequency.setValueAtTime(o.f || 800, t0); f.Q.value = o.q || 1;
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.d);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.g || 0.2, t0 + (o.at || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.d);
    src.connect(f); f.connect(g); g.connect(o.bus || A.sfxBus);
    src.start(t0); src.stop(t0 + o.d + 0.05);
  }
  const PENT = [0, 3, 5, 7, 10, 12, 15]; // minor pentatonic
  function pluck(midi, d, g, delay) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    tone({ f, t: 'triangle', d: d || 0.5, g: g || 0.12, bus: A.musicBus, delay });
    tone({ f: f * 2, t: 'sine', d: (d || 0.5) * 0.6, g: (g || 0.12) * 0.3, bus: A.musicBus, delay });
  }
  function arp(base, notes, step, type, g) {
    notes.forEach((n, i) => tone({ f: base * Math.pow(2, n / 12), t: type || 'square', d: 0.18, g: g || 0.12, delay: i * step }));
  }

  function startDrone(A) {
    const c = A.ctx, t0 = c.currentTime;
    const g = c.createGain(); g.gain.value = 0.045;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 200; f.Q.value = 2;
    [48, 48.6, 96.5].forEach(fr => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = fr;
      o.connect(f); o.start(t0);
    });
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lg = c.createGain(); lg.gain.value = 90;
    lfo.connect(lg); lg.connect(f.frequency); lfo.start(t0);
    f.connect(g); g.connect(A.musicBus);
  }
  function startRoll(A) {
    const c = A.ctx;
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.8;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(A.sfxBus);
    src.start();
    A.rollGain = g; A.rollFilter = f;
  }
  function roar(intense) {
    if (!A.ctx) return;
    const c = A.ctx, t0 = c.currentTime, d = intense ? 1.6 : 1.0;
    const car = c.createOscillator(); car.type = 'sawtooth';
    car.frequency.setValueAtTime(90, t0);
    car.frequency.exponentialRampToValueAtTime(38, t0 + d);
    const mod = c.createOscillator(); mod.frequency.value = 31;
    const mg = c.createGain(); mg.gain.value = 160;
    mod.connect(mg); mg.connect(car.frequency);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(intense ? 0.4 : 0.25, t0 + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    car.connect(f); f.connect(g); g.connect(A.sfxBus);
    car.start(t0); mod.start(t0); car.stop(t0 + d + 0.1); mod.stop(t0 + d + 0.1);
    noise({ d: d * 0.8, g: 0.12, f: 180, t: 'lowpass', delay: 0.05 });
  }

  // ---------- event dispatch (from rules.takeAudio()) ----------
  const SFX = {
    gameStart() { tone({ f: 60, f2: 240, t: 'sine', d: 1.2, g: 0.25 }); arp(220, [0, 7, 12], 0.12, 'triangle', 0.1); },
    serve() { tone({ f: 660, t: 'square', d: 0.06, g: 0.08 }); },
    plunge(e) {
      const f = e.band === 'soft' ? 300 : e.band === 'mid' ? 500 : 750;
      tone({ f, f2: f * 2.5, t: 'square', d: 0.25, g: 0.14 });
      noise({ d: 0.15, g: 0.1, f: 1200 });
    },
    modeStart(e) {
      const base = { kelp: 330, vent: 294, angler: 262, wreck: 349, bloom: 392, trench: 311 }[e.mode] || 330;
      arp(base, [0, 4, 7, 12], 0.09, 'triangle', 0.14);
    },
    modeComplete() { arp(440, [0, 4, 7, 12, 16], 0.08, 'square', 0.1); },
    modeFail() { arp(330, [0, -2, -5, -7], 0.12, 'sawtooth', 0.08); },
    jackpot() { arp(523, [0, 7, 12], 0.07, 'square', 0.12); },
    megaJackpot() { roar(false); arp(523, [0, 7, 12, 19, 24], 0.09, 'square', 0.14); },
    combo(e) { tone({ f: 500 + e.n * 120, t: 'square', d: 0.1, g: 0.1 }); },
    hurryup() { tone({ f: 880, f2: 660, t: 'square', d: 0.12, g: 0.12 }); },
    bumper(e) {
      const imp = Math.min(e.impulse || 500, 1500);
      tone({ f: 480 + imp * 0.35, t: 'square', d: 0.07, g: 0.11 });
      tone({ f: 240, t: 'sine', d: 0.09, g: 0.1 });
    },
    sling() { tone({ f: 150, f2: 90, t: 'triangle', d: 0.08, g: 0.16 }); noise({ d: 0.05, g: 0.08, f: 900 }); },
    flipper(e) {
      noise({ d: 0.04, g: Math.min(0.16, 0.05 + (e.impulse || 0) * 0.00004), f: 2500, t: 'highpass' });
      tone({ f: 190, f2: 120, t: 'triangle', d: 0.05, g: 0.1 });
    },
    ballClack() { noise({ d: 0.03, g: 0.07, f: 3000, t: 'highpass' }); },
    dropTarget() { tone({ f: 320, f2: 140, t: 'triangle', d: 0.1, g: 0.16 }); noise({ d: 0.06, g: 0.08, f: 700 }); },
    standup() { tone({ f: 420, t: 'triangle', d: 0.07, g: 0.1 }); },
    pearl() { tone({ f: 1250, t: 'sine', d: 0.16, g: 0.1 }); tone({ f: 1870, t: 'sine', d: 0.12, g: 0.07 }); },
    bash() { tone({ f: 200, f2: 90, t: 'square', d: 0.12, g: 0.16 }); noise({ d: 0.08, g: 0.1, f: 500 }); },
    mystery() { arp(660, [0, 5, 7, 12, 17], 0.06, 'sine', 0.1); },
    lockLit() { arp(392, [0, 12], 0.1, 'sine', 0.1); },
    lock(e) { tone({ f: 200, f2: 800, t: 'sawtooth', d: 0.4, g: 0.14 }); roar(false); },
    multiballStart() { roar(true); arp(196, [0, 7, 12, 16], 0.1, 'sawtooth', 0.12); },
    multiballEnd() { arp(392, [12, 7, 0], 0.12, 'triangle', 0.1); },
    addABall() { tone({ f: 700, f2: 1400, t: 'square', d: 0.15, g: 0.12 }); },
    wizardStart() { roar(true); arp(98, [0, 7, 12, 19], 0.14, 'sawtooth', 0.14); },
    wizardEnd() { arp(523, [0, 4, 7, 12, 16, 19, 24], 0.09, 'square', 0.12); },
    kickback() { tone({ f: 120, f2: 400, t: 'square', d: 0.2, g: 0.18 }); },
    kickbackLit() { tone({ f: 980, t: 'sine', d: 0.15, g: 0.1 }); tone({ f: 1470, t: 'sine', d: 0.15, g: 0.08, delay: 0.08 }); },
    abyssComplete() { tone({ f: 130, t: 'sine', d: 0.8, g: 0.2 }); arp(262, [0, 7, 12], 0.1, 'triangle', 0.1); },
    extraBall() { arp(784, [0, 4, 7, 12, 16, 24], 0.07, 'square', 0.12); },
    magnetGrab() { tone({ f: 180, f2: 90, t: 'sawtooth', d: 0.5, g: 0.1 }); },
    magnetFling() { noise({ d: 0.3, g: 0.12, f: 400, f2: 3000 }); },
    rampExit() { noise({ d: 0.25, g: 0.07, f: 2500, f2: 500 }); },
    drain() { tone({ f: 400, f2: 75, t: 'sawtooth', d: 0.5, g: 0.12 }); },
    ballSave() { arp(523, [12, 16, 24], 0.07, 'sine', 0.12); },
    bonus() { arp(440, [0, 4, 7], 0.06, 'triangle', 0.09); },
    tilt() { tone({ f: 110, t: 'sawtooth', d: 0.6, g: 0.2 }); tone({ f: 116, t: 'sawtooth', d: 0.6, g: 0.2 }); },
    tiltWarning() { tone({ f: 880, t: 'square', d: 0.09, g: 0.1 }); tone({ f: 880, t: 'square', d: 0.09, g: 0.1, delay: 0.14 }); },
    nudge() { noise({ d: 0.06, g: 0.08, f: 300, t: 'lowpass' }); },
    gameOver() { tone({ f: 220, f2: 55, t: 'sine', d: 1.6, g: 0.22 }); arp(330, [12, 7, 0, -5], 0.16, 'triangle', 0.1); },
  };

  A.play = (name, data) => {
    if (!A.ctx || A.muted) return;
    const fn = SFX[name];
    if (fn) { try { fn(data || {}); } catch (e) {} }
  };

  // ---------- per-frame: roll loop, generative music, heartbeat ----------
  A.update = (dt, st) => {
    if (!A.ctx) return;
    st = st || {};
    // roll loop follows fastest ball
    const sp = st.ballSpeed || 0;
    if (A.rollGain) {
      const g = Math.min(0.14, sp / 2500 * 0.14);
      A.rollGain.gain.setTargetAtTime(A.muted ? 0 : g, A.ctx.currentTime, 0.05);
      A.rollFilter.frequency.setTargetAtTime(280 + sp * 0.35, A.ctx.currentTime, 0.05);
    }
    // intensity: calm < mode < multiball < wizard
    const target = st.wizard ? 1 : st.multiball ? 0.75 : st.mode ? 0.45 : 0.15;
    A.intensity += (target - A.intensity) * Math.min(1, dt * 2);
    // generative plucks
    A.pluckT -= dt;
    if (A.pluckT <= 0) {
      A.pluckT = 1.6 - A.intensity * 0.9;
      const base = 45 + Math.floor((st.depthM || 0) / 2200) * 2; // deeper = darker
      const n = PENT[Math.floor(Math.random() * PENT.length)];
      pluck(base + n, 0.7, 0.05 + A.intensity * 0.05);
    }
    // drums when intense
    if (A.intensity > 0.55) {
      A.drumT -= dt;
      if (A.drumT <= 0) {
        A.drumT = 0.32 - A.intensity * 0.1;
        A.drumStep++;
        if (A.drumStep % 2 === 0) tone({ f: 70, f2: 40, t: 'sine', d: 0.14, g: 0.2, bus: A.musicBus });
        else noise({ d: 0.05, g: 0.06, f: 6000, t: 'highpass', bus: A.musicBus });
      }
    }
    // hurry-up heartbeat
    if (st.hurry) {
      A.heartT -= dt;
      if (A.heartT <= 0) {
        A.heartT = 0.55;
        tone({ f: 58, f2: 35, t: 'sine', d: 0.16, g: 0.3 });
        tone({ f: 52, f2: 32, t: 'sine', d: 0.14, g: 0.22, delay: 0.18 });
      }
    } else A.heartT = 0;
  };

  return A;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createAudio };
}
