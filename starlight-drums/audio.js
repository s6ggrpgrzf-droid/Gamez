/* Starlight Drums — synthesized sound, no assets. WebAudio throughout.
 * The AudioContext's own clock is the song's master clock. The bed (bass +
 * plucks) is scheduled ahead with a lookahead loop; the player's drums fire
 * immediately on the hit for the lowest possible latency. A miss is heard as
 * the drum that *doesn't* sound — the song loses its beat, which teaches
 * faster than any buzz. */
(function (global) {
'use strict';
var ctx = null, master = null, noiseBuf = null;
var bedTimer = 0, bedEvents = null, bedIdx = 0, bedT0 = 0;

var SOUND_KEY = 'sd-sound';
var soundOn = true;
try { soundOn = localStorage.getItem(SOUND_KEY) !== '0'; } catch (e) {}

function ac() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = soundOn ? 1.0 : 0;
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 4;
      comp.attack.value = 0.003; comp.release.value = 0.18;
      master.connect(comp); comp.connect(ctx.destination);
      var len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function midiHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
}
function toneAt(t, freq, dur, type, peak, slideTo) {
  var o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  env(g, t, 0.004, peak, dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}
function noiseAt(t, dur, peak, freq, q) {
  var src = ctx.createBufferSource(); src.buffer = noiseBuf;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  var f = ctx.createBiquadFilter(); f.type = 'bandpass';
  f.frequency.value = freq; f.Q.value = q || 1.1;
  var g = ctx.createGain(); env(g, t, 0.003, peak, dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.05);
}

/* the two drums */
function lowDrum(t) {
  toneAt(t, 158, 0.26, 'sine', 0.85, 47);       // the body: pitch falls home
  noiseAt(t, 0.03, 0.15, 3200, 0.8);            // skin attack
}
function highDrum(t) {
  noiseAt(t, 0.075, 0.48, 1900, 1.1);           // the snap
  toneAt(t, 335, 0.06, 'triangle', 0.20, 248);  // a woody knock under it
}
/* streak ladder: A-minor pentatonic, two octaves — perfects climb it */
var LADDER = [69, 72, 74, 76, 79, 81, 84, 88, 91, 93, 96, 100, 103, 105, 108, 112];
function ladderPluck(t, streak) {
  var idx = Math.min(Math.max(streak - 1, 0), LADDER.length - 1);
  var f = midiHz(LADDER[idx]);
  toneAt(t, f, 0.34, 'triangle', 0.20);
  toneAt(t, f * 2, 0.2, 'sine', 0.07);
}
/* the bed: bass root + soft plucks, scheduled ahead of the clock */
function bedEvent(ev, t) {
  if (ev.kind === 'bass') {
    toneAt(t, midiHz(ev.midi), 1.1, 'sine', 0.24);
    toneAt(t, midiHz(ev.midi) * 2, 0.5, 'triangle', 0.05);
  } else {
    toneAt(t, midiHz(ev.midi), 0.5, 'sine', 0.11);
    toneAt(t, midiHz(ev.midi) * 2, 0.3, 'sine', 0.03);
  }
}
function scheduleBed() {
  if (!bedEvents || !ctx) return;
  var ahead = ctx.currentTime + 0.15;
  while (bedIdx < bedEvents.length && bedT0 + bedEvents[bedIdx].t < ahead) {
    var ev = bedEvents[bedIdx++];
    var when = bedT0 + ev.t;
    if (when >= ctx.currentTime - 0.05) bedEvent(ev, when);
  }
}

/* the real track: fetched + decoded once, played from the same audio clock */
var trackBuf = null, trackSrc = null, trackGain = null, trackState = 'idle';
function loadTrack(url) {
  if (trackState === 'loading' || trackState === 'ready') return;
  if (!ac()) { trackState = 'failed'; return; }
  trackState = 'loading';
  fetch(url).then(function (r) {
    if (!r.ok) throw new Error('http ' + r.status);
    return r.arrayBuffer();
  }).then(function (ab) {
    return ctx.decodeAudioData(ab);
  }).then(function (buf) {
    trackBuf = buf; trackState = 'ready';
  }).catch(function () { trackState = 'failed'; });
}

var AU = {
  unlock: function () { return !!ac(); },
  now: function () { return ctx ? ctx.currentTime : 0; },
  /* what the device itself reports about its output path, in seconds —
   * the judgment and the visuals both shift by this so the beat the player
   * HEARS is the beat the game grades. */
  latency: function () {
    if (!ctx) return 0;
    return (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
  },
  loadTrack: loadTrack,
  trackState: function () { return trackState; },
  setTrack: function (t0, offset, dur) {
    if (!trackBuf || !ctx) return false;
    this.stopTrack();
    trackSrc = ctx.createBufferSource(); trackSrc.buffer = trackBuf;
    trackGain = ctx.createGain(); trackGain.gain.value = 0.92;
    trackSrc.connect(trackGain); trackGain.connect(master);
    trackSrc.start(t0, offset, dur + 1.5);
    return true;
  },
  fadeTrack: function (sec) {
    if (trackGain && ctx) {
      var t = ctx.currentTime;
      trackGain.gain.cancelScheduledValues(t);
      trackGain.gain.setValueAtTime(trackGain.gain.value, t);
      trackGain.gain.linearRampToValueAtTime(0.0001, t + sec);
    }
  },
  stopTrack: function () {
    if (trackSrc) { try { trackSrc.stop(); } catch (e) {} trackSrc = null; }
    trackGain = null;
  },
  soundOn: function () { return soundOn; },
  setSound: function (on) {
    soundOn = !!on;
    try { localStorage.setItem(SOUND_KEY, soundOn ? '1' : '0'); } catch (e) {}
    if (master) master.gain.value = soundOn ? 1.0 : 0;
  },
  suspend: function () { if (ctx && ctx.state === 'running') ctx.suspend(); },
  resume: function () { if (ctx && ctx.state === 'suspended') ctx.resume(); },
  /* arm the bed for a chart whose beat-zero is at audio time t0 */
  setBed: function (chart, t0) {
    bedEvents = chart.bed; bedIdx = 0; bedT0 = t0;
    if (bedTimer) clearInterval(bedTimer);
    bedTimer = setInterval(scheduleBed, 25);
    scheduleBed();
  },
  stopBed: function () {
    if (bedTimer) clearInterval(bedTimer);
    bedTimer = 0; bedEvents = null;
  },
  /* a player hit, right now. perfects also climb the ladder. */
  hit: function (drum, judgement, streak) {
    if (!ac() || !soundOn) return;
    var t = ctx.currentTime;
    if (drum === 0) lowDrum(t); else highDrum(t);
    if (judgement === 'perfect') ladderPluck(t, streak);
    try { if (navigator.vibrate) navigator.vibrate(judgement === 'perfect' ? 14 : 7); } catch (e) {}
  },
  /* a tap that found no note: a soft wooden knock, acknowledged, unjudged */
  emptyTap: function (drum) {
    if (!ac() || !soundOn) return;
    var t = ctx.currentTime;
    if (drum === 0) toneAt(t, 130, 0.08, 'sine', 0.16, 90);
    else noiseAt(t, 0.04, 0.13, 1500, 1.2);
  },
  /* title-screen heartbeat: one low drum, very soft */
  pulse: function () {
    if (!ac() || !soundOn) return;
    toneAt(ctx.currentTime, 120, 0.3, 'sine', 0.2, 55);
  }
};
if (master) master.gain.value = soundOn ? 1.0 : 0;
global.SD_AUDIO = AU;
})(typeof window !== 'undefined' ? window : globalThis);
