/* Arrow Slide — quiet procedural audio.
 * Calm by design: soft airy sweeps, low volumes, no harsh edges.
 * Everything routes through `enabled` so the sound toggle is one switch. */
'use strict';
window.MT_Audio = (function () {
  var ac = null, enabled = true;
  function init() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (ac && ac.state === 'suspended') ac.resume();
  }
  function tone(f, d, type, vol, slideTo, delay) {
    if (!ac || !enabled) return;
    var t0 = ac.currentTime + (delay || 0);
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + d);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g); g.connect(ac.destination);
    o.start(t0); o.stop(t0 + d + 0.05);
  }
  return {
    init: init,
    setEnabled: function (b) { enabled = !!b; },
    isEnabled: function () { return enabled; },
    click: function () { tone(520, 0.08, 'sine', 0.045); },
    guide: function () { tone(740, 0.10, 'sine', 0.04, 990); },
    // soft airy whoosh as the arrow glides away
    slide: function () {
      tone(640, 0.22, 'sine', 0.055, 260);
      tone(1280, 0.16, 'sine', 0.022, 520);
    },
    // gentle low thud for a blocked tap — firm but not harsh
    bad: function () { tone(196, 0.22, 'sine', 0.07, 120); },
    // the last arrow: a soft bell, the "mental reset" moment
    final: function () {
      tone(880, 0.5, 'sine', 0.06);
      tone(1318, 0.7, 'sine', 0.045, null, 0.12);
    },
    win: function () {
      tone(523, 0.16, 'sine', 0.05);
      tone(659, 0.16, 'sine', 0.05, null, 0.14);
      tone(784, 0.30, 'sine', 0.055, null, 0.28);
    }
  };
})();
