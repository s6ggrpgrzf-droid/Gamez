/* Starlight Drums — synthesized sound, no assets. WebAudio throughout.
 * The AudioContext's own clock is the song's master clock. The bed (bass +
 * plucks) is scheduled ahead with a lookahead loop; the player's drums fire
 * immediately on the hit for the lowest possible latency. A miss is heard as
 * the drum that *doesn't* sound — the song loses its beat, which teaches
 * faster than any buzz. */
(function (global) {
'use strict';
var ctx = null, master = null, noiseBuf = null, drumBus = null;
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
      /* the drums' room: a generated impulse (0.45s of decaying noise) in a
       * convolver. Everything on the drum bus plays IN somewhere — a small,
       * close space — instead of floating in a vacuum. That sense of place
       * is most of what "depth" means in a drum sound. */
      drumBus = ctx.createGain(); drumBus.gain.value = 0.95;
      drumBus.connect(master);
      var vlen = Math.floor(ctx.sampleRate * 0.45);
      var ir = ctx.createBuffer(2, vlen, ctx.sampleRate);
      for (var ch = 0; ch < 2; ch++) {
        var cd = ir.getChannelData(ch);
        for (var vi = 0; vi < vlen; vi++) cd[vi] = (Math.random() * 2 - 1) * Math.pow(1 - vi / vlen, 2.8);
      }
      var verb = ctx.createConvolver(); verb.buffer = ir;
      var wet = ctx.createGain(); wet.gain.value = 0.38;
      drumBus.connect(verb); verb.connect(wet); wet.connect(master);
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
function toneAt(t, freq, dur, type, peak, slideTo, dest) {
  var o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  env(g, t, 0.004, peak, dur);
  o.connect(g); g.connect(dest || master);
  o.start(t); o.stop(t + dur + 0.05);
}
function noiseAt(t, dur, peak, freq, q, dest) {
  var src = ctx.createBufferSource(); src.buffer = noiseBuf;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  var f = ctx.createBiquadFilter(); f.type = 'bandpass';
  f.frequency.value = freq; f.Q.value = q || 1.1;
  var g = ctx.createGain(); env(g, t, 0.003, peak, dur);
  src.connect(f); f.connect(g); g.connect(dest || master);
  src.start(t); src.stop(t + dur + 0.05);
}

/* The two drums, built the way real drums are built: a skin attack, a set of
 * inharmonic head modes that die at different rates, a shell that talks, and
 * air underneath. A lone sine sweep reads as a beep with a pitch problem;
 * layered partials are what the ear recognizes as a DRUM. Each hit is also
 * detuned and weighted by a breath of chance — a real head never speaks
 * twice identically, and that micro-variation is felt as richness. */
function lowDrum(t) {
  var v = 0.99 + Math.random() * 0.02;            // this hit's tuning
  var w = 0.94 + Math.random() * 0.12;            // this hit's weight
  noiseAt(t, 0.03, 0.17, 3300, 0.8, drumBus);                       // skin attack
  toneAt(t, 158 * v, 0.44, 'sine', 0.80 * w, 46, drumBus);          // the body: pitch falls home, and rings
  toneAt(t, 58 * v, 0.52, 'sine', 0.42 * w, 31, drumBus);           // sub thump — the depth you feel in the chest
  toneAt(t, 319 * v, 0.16, 'sine', 0.22, 96, drumBus);              // head mode ~2.02x, dies fast
  toneAt(t, 465 * v, 0.09, 'triangle', 0.10, 170, drumBus);         // head mode ~2.94x, dies faster
  noiseAt(t, 0.09, 0.09, 420, 1.2, drumBus);                        // the shell talking (wood)
}
function highDrum(t) {
  var v = 0.99 + Math.random() * 0.02;
  var w = 0.94 + Math.random() * 0.12;
  noiseAt(t, 0.07, 0.50 * w, 1950, 1.05, drumBus);                  // the crack
  toneAt(t, 338 * v, 0.10, 'triangle', 0.22, 246, drumBus);         // woody knock, given time to speak
  toneAt(t, 196 * v, 0.13, 'sine', 0.15, 148, drumBus);             // weight under the snap
  toneAt(t, 1174 * v, 0.09, 'sine', 0.09, null, drumBus);           // ice partials — the crystalline ring
  toneAt(t, 1865 * v, 0.06, 'sine', 0.05, null, drumBus);
  toneAt(t, 2510 * v, 0.30, 'sine', 0.028, null, drumBus);          // a long faint ping for the room to catch
}
/* streak ladder: A-minor pentatonic, two octaves — perfects climb it */
var LADDER = [69, 72, 74, 76, 79, 81, 84, 88, 91, 93, 96, 100, 103, 105, 108, 112];
function ladderPluck(t, streak) {
  var idx = Math.min(Math.max(streak - 1, 0), LADDER.length - 1);
  var f = midiHz(LADDER[idx]);
  toneAt(t, f, 0.34, 'triangle', 0.20, null, drumBus);
  toneAt(t, f * 2, 0.2, 'sine', 0.07, null, drumBus);
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
  /* the sky answers: at a chorus peak, a perfect sends the ladder note back
   * a fifth higher, a breath later — the constellation humming your line */
  answer: function (streak) {
    if (!ac() || !soundOn) return;
    var t = ctx.currentTime + 0.28;
    var idx = Math.min(Math.max(streak - 1, 0), LADDER.length - 1);
    var f = midiHz(LADDER[idx]) * 1.5;   // a perfect fifth above
    toneAt(t, f, 0.55, 'sine', 0.11, null, drumBus);
    toneAt(t, f * 2, 0.35, 'sine', 0.035, null, drumBus);
    noiseAt(t, 0.18, 0.02, 5200, 0.7, drumBus);   // a breath of shimmer under it
  },
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
