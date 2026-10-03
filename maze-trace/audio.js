/* Maze Trace — tiny procedural audio */
'use strict';
window.MT_Audio = (function () {
  var ac = null;
  function init() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (ac && ac.state === 'suspended') ac.resume();
  }
  function tone(f, d, type, vol, slide) {
    if (!ac) return;
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, ac.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, ac.currentTime + d);
    g.gain.setValueAtTime(vol || 0.08, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + d);
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + d);
  }
  return {
    init: init,
    click: function () { tone(600, 0.07, 'sine', 0.06); },
    slide: function () { tone(500, 0.18, 'sine', 0.08, 1200); },
    bad: function () { tone(220, 0.25, 'sawtooth', 0.08, 110); },
    win: function () {
      tone(523, 0.14, 'sine', 0.09); setTimeout(function () { tone(659, 0.14, 'sine', 0.09); }, 130);
      setTimeout(function () { tone(784, 0.22, 'sine', 0.1); }, 260);
    }
  };
})();
