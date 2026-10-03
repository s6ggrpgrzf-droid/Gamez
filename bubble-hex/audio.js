/* Bubble Hex audio — tiny WebAudio synth */
var HexAudio = (function () {
  var ctx = null;
  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type, vol, slide) {
    var c = ac(); if (!c) return;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), c.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.15, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  }
  return {
    shoot: function () { tone(500, 0.12, 'sine', 0.12, 900); },
    stick: function () { tone(300, 0.08, 'triangle', 0.1); },
    pop: function (n) { for (var i = 0; i < Math.min(n, 5); i++) setTimeout(function () { tone(600 + Math.random() * 600, 0.1, 'sine', 0.12); }, i * 40); },
    drop: function () { tone(400, 0.25, 'sine', 0.1, 120); },
    orb: function () { tone(800, 0.3, 'sine', 0.15, 1600); },
    blast: function () { tone(200, 0.5, 'sawtooth', 0.18, 60); tone(1200, 0.4, 'sine', 0.1, 200); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { tone(f, 0.25, 'sine', 0.15); }, i * 120); }); },
    lose: function () { tone(300, 0.5, 'sine', 0.12, 150); },
    click: function () { tone(700, 0.06, 'sine', 0.08); }
  };
})();
