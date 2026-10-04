/* Neon Void procedural audio — buses, voice cap, adaptive sequencer.
 * IDENTITY: electric, sharp, relentless. Bass drives; layers stack with intensity.
 * The game reads fully silent: every cue has a visual twin; mute persists. */
'use strict';
window.NV_Audio = (function () {
  var CFG = (window.NV_CONFIG || {}).audio || {};
  var ac = null, master = null, musicBus = null, sfxBus = null;
  var voices = 0, muted = false, seqTimer = null, step = 0;
  var intensity = 0; // 0..1 — drives which layers play
  var noiseBuf = null;

  try { muted = JSON.parse(localStorage.getItem('nv_settings') || '{}').mute === true; } catch (e) {}

  function init() {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain();
        master.gain.value = muted ? 0 : (CFG.masterGain || 0.5);
        // gentle limiter so stacked layers never clip harshly
        var comp = ac.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 8;
        master.connect(comp); comp.connect(ac.destination);
        musicBus = ac.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
        sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
        noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ac = null; }
    }
    if (ac && ac.state === 'suspended') ac.resume();
  }
  function setMuted(m) {
    muted = !!m;
    if (master && ac) master.gain.setTargetAtTime(muted ? 0 : (CFG.masterGain || 0.5), ac.currentTime, 0.02);
    try {
      var s = JSON.parse(localStorage.getItem('nv_settings') || '{}');
      s.mute = muted; localStorage.setItem('nv_settings', JSON.stringify(s));
    } catch (e) {}
  }
  function isMuted() { return muted; }

  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ac || muted) return;
    if (voices >= (CFG.maxVoices || 16)) return; // voice cap — drop, never stack
    voices++;
    var t = when || ac.currentTime;
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(Math.max(20, freq), t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
    o.onended = function () { voices = Math.max(0, voices - 1); };
  }
  function noise(dur, vol, filterFreq, when) {
    if (!ac || muted || !noiseBuf) return;
    if (voices >= (CFG.maxVoices || 16)) return;
    voices++;
    var t = when || ac.currentTime;
    var src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    var f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = filterFreq || 4000;
    var g = ac.createGain();
    g.gain.setValueAtTime(vol || 0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t); src.stop(t + dur + 0.02);
    src.onended = function () { voices = Math.max(0, voices - 1); };
  }

  /* ---- adaptive step sequencer: 140 BPM A-minor, layers stack with intensity ---- */
  var BASS = [55, 0, 55, 0, 65.4, 0, 55, 49];      // A1 groove
  var ARP = [220, 261.6, 329.6, 440, 329.6, 261.6]; // A-minor arp
  function musicStart() {
    if (!ac || seqTimer) return;
    var stepDur = 60 / (CFG.bpm || 140) / 2;
    step = 0;
    seqTimer = setInterval(function () {
      if (!ac || muted) return;
      var t = ac.currentTime + 0.06;
      var s8 = step % 8;
      // bass — always, the relentless pulse (through a lowpass so it stays round)
      var bf = BASS[s8];
      if (bf > 0 && voices < (CFG.maxVoices || 16)) {
        voices++;
        var o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.value = bf;
        lp.type = 'lowpass'; lp.frequency.value = 700;
        g.gain.setValueAtTime(0.16, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + stepDur * 0.95);
        o.connect(lp); lp.connect(g); g.connect(musicBus);
        o.start(t); o.stop(t + stepDur);
        o.onended = function () { voices = Math.max(0, voices - 1); };
      }
      // arp layer — joins when intensity is high (mult climbed / surge)
      if (intensity > 0.45 && (step % 2 === 0)) {
        var af = ARP[(step / 2 | 0) % ARP.length];
        voices++;
        var a = ac.createOscillator(), ag = ac.createGain();
        a.type = 'square'; a.frequency.value = af;
        ag.gain.setValueAtTime(0.05, t);
        ag.gain.exponentialRampToValueAtTime(0.0001, t + stepDur * 0.8);
        a.connect(ag); ag.connect(musicBus);
        a.start(t); a.stop(t + stepDur);
        a.onended = function () { voices = Math.max(0, voices - 1); };
      }
      // hat layer — only during void surge
      if (intensity > 0.8 && (step % 2 === 1) && noiseBuf) {
        voices++;
        var h = ac.createBufferSource(); h.buffer = noiseBuf; h.loop = true;
        var hf = ac.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 7000;
        var hg = ac.createGain();
        hg.gain.setValueAtTime(0.05, t);
        hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        h.connect(hf); hf.connect(hg); hg.connect(musicBus);
        h.start(t); h.stop(t + 0.08);
        h.onended = function () { voices = Math.max(0, voices - 1); };
      }
      step++;
    }, stepDur * 1000);
  }
  function musicStop() {
    if (seqTimer) { clearInterval(seqTimer); seqTimer = null; }
  }
  function setIntensity(v) { intensity = Math.max(0, Math.min(1, v)); }
  function suspend() { if (ac && ac.state === 'running') ac.suspend(); }
  function resume() { if (ac && ac.state === 'suspended') ac.resume(); }

  return {
    init: init, tone: tone, noise: noise,
    setMuted: setMuted, isMuted: isMuted,
    musicStart: musicStart, musicStop: musicStop, setIntensity: setIntensity,
    suspend: suspend, resume: resume
  };
})();
