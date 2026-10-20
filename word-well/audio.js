/* Word Well — tiny WebAudio sfx: tile clacks, thocks, chimes. No assets. */
(function () {
'use strict';
var ctx = null, master = null, muted = false;
try { muted = localStorage.getItem('wwf_mute') === '1'; } catch (e) {}

function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    return true;
  } catch (e) { return false; }
}
function env(g, t0, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}
function tone(freq, dur, type, vol, slideTo) {
  if (muted || !ensure()) return;
  var t0 = ctx.currentTime;
  var o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  env(g, t0, 0.008, vol || 0.25, dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise(dur, vol, freq) {
  if (muted || !ensure()) return;
  var t0 = ctx.currentTime;
  var len = Math.max(1, (dur * ctx.sampleRate) | 0);
  var buf = ctx.createBuffer(1, len, ctx.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  var src = ctx.createBufferSource(); src.buffer = buf;
  var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 2200; f.Q.value = 1.2;
  var g = ctx.createGain();
  env(g, t0, 0.004, vol || 0.3, dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0);
}
function jz(base, amt) { return base * (1 + (Math.random() - 0.5) * (amt || 0.14)); }
var WWAU = {
  ensure: ensure,
  /* stone tile tapped / selected — a light wooden tick */
  tap: function () { tone(jz(540), 0.045, 'triangle', 0.09); },
  /* tile dropped on the well board — a low stone thock, never twice the same */
  clack: function () { noise(0.08, 0.4, jz(950)); tone(jz(140), 0.1, 'triangle', 0.24, 76); },
  /* tile recalled */
  recall: function () { tone(400, 0.07, 'triangle', 0.11, 290); },
  /* move committed — the word settles into the board */
  play: function () { tone(jz(165), 0.15, 'triangle', 0.24, 92); noise(0.1, 0.22, 760); },
  /* bingo! */
  bingo: function () {
    if (muted || !ensure()) return;
    var seq = [523, 659, 784, 1047];
    for (var i = 0; i < seq.length; i++) {
      (function (f, dt) {
        setTimeout(function () { tone(f, 0.18, 'triangle', 0.22); }, dt);
      })(seq[i], i * 90);
    }
  },
  /* invalid move */
  error: function () { tone(130, 0.16, 'square', 0.12, 90); },
  /* turn change blip */
  turn: function () { tone(520, 0.05, 'sine', 0.08); },
  /* game won */
  win: function () {
    if (muted || !ensure()) return;
    var seq = [392, 523, 659, 784, 1047, 1319];
    for (var i = 0; i < seq.length; i++) {
      (function (f, dt) {
        setTimeout(function () { tone(f, 0.25, 'triangle', 0.2); }, dt);
      })(seq[i], i * 110);
    }
  },
  toggleMute: function () {
    muted = !muted;
    try { localStorage.setItem('wwf_mute', muted ? '1' : '0'); } catch (e) {}
    return muted;
  },
  isMuted: function () { return muted; }
};
window.WWAU = WWAU;
})();
