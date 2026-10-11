/* Fernwild audio — soft WebAudio synth. Gentle plucks, chimes, rustles. */
'use strict';
var FAu = (function () {
  var ctx = null, muted = false;
  try { muted = localStorage.getItem('fw_mute') === '1'; } catch (e) {}
  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type, vol, when, slide) {
    if (muted) return;
    var c = ac(); if (!c) return;
    var t = c.currentTime + (when || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.16, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, when, hp) {
    if (muted) return;
    var c = ac(); if (!c) return;
    var t = c.currentTime + (when || 0);
    var len = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource(); src.buffer = buf;
    var f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 1200;
    var g = c.createGain(); g.gain.value = vol || 0.08;
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t);
  }
  var amb = { wind: 3, bird: 5, cricket: 1, owl: 30, rain: 0, fire: 0, windHowl: 2 };
  var S = {
    unlock: function () { ac(); },
    plant: function () { tone(180, 0.18, 'sine', 0.2, 0, 90); noise(0.12, 0.06, 0, 500); },
    sprout: function () { tone(520, 0.22, 'sine', 0.1); tone(780, 0.3, 'sine', 0.08, 0.09); },
    grow: function () { tone(440, 0.25, 'triangle', 0.09); tone(660, 0.35, 'triangle', 0.07, 0.1); },
    tap: function () { tone(700 + Math.random() * 200, 0.12, 'sine', 0.12, 0, 900); },
    arrive: function () { var n = [523, 659, 784]; for (var i = 0; i < 3; i++) tone(n[i], 0.4, 'sine', 0.08, i * 0.12); },
    coins: function () { tone(880, 0.12, 'triangle', 0.08); tone(1174, 0.18, 'triangle', 0.07, 0.07); },
    rain: function () { for (var i = 0; i < 6; i++) noise(0.09, 0.05, i * 0.09, 3000); },
    achieve: function () {
      var n = [523, 659, 784, 1046];
      for (var i = 0; i < n.length; i++) tone(n[i], 0.35, 'triangle', 0.1, i * 0.09);
    },
    leave: function () { tone(392, 0.3, 'sine', 0.09, 0, 262); tone(262, 0.4, 'sine', 0.07, 0.12); },
    storm: function () {
      noise(1.4, 0.14, 0, 220);            /* low rumble */
      for (var i = 0; i < 10; i++) noise(0.08, 0.06, 0.2 + i * 0.12, 3200); /* rain patter */
      tone(70, 1.2, 'sine', 0.12, 0, 45);
    },
    error: function () { tone(160, 0.16, 'sine', 0.1, 0, 120); },
    mush: function () { tone(330, 0.2, 'sine', 0.1, 0, 440); tone(495, 0.25, 'sine', 0.07, 0.08); },
    /* generative ambience — called ~1/sec with the forest's state */
    ambTick: function (o) {
      if (muted) return;
      var c = ac(); if (!c) return;
      amb.wind -= 1;
      if (amb.wind <= 0) { amb.wind = 6 + Math.random() * 7; noise(1.8, 0.022, 0, 400); }
      if (o.storm) {
        amb.rain -= 1;
        if (amb.rain <= 0) { amb.rain = 0.4; noise(0.14, 0.03, 0, 2800); }
      } else if (o.rain) {
        amb.rain -= 1;
        if (amb.rain <= 0) { amb.rain = 0.7; noise(0.1, 0.02, 0, 3200); }
      }
      if (o.wind) {
        amb.windHowl -= 1;
        if (amb.windHowl <= 0) { amb.windHowl = 3 + Math.random() * 3; noise(2.2, 0.035, 0, 300); }
      }
      if (o.fire) {
        amb.fire -= 1;
        if (amb.fire <= 0) { amb.fire = 0.3 + Math.random() * 0.4; noise(0.09, 0.045, 0, 900); }
      }
      if (o.night) {
        amb.cricket -= 1;
        if (amb.cricket <= 0) {
          amb.cricket = 1.8 + Math.random() * 1.5;
          for (var i = 0; i < 3; i++) tone(4200 + Math.random() * 300, 0.05, 'sine', 0.018, i * 0.09);
        }
        amb.owl -= 1;
        if (amb.owl <= 0) {
          amb.owl = 40 + Math.random() * 50;
          tone(340, 0.35, 'sine', 0.045, 0, 300); tone(300, 0.55, 'sine', 0.045, 0.42, 260);
        }
      } else {
        amb.bird -= 1;
        if (amb.bird <= 0) {
          amb.bird = 4 + Math.random() * 7;
          var base = 2200 + Math.random() * 900, n = 2 + ((Math.random() * 3) | 0);
          for (var j = 0; j < n; j++)
            tone(base + Math.random() * 700, 0.09, 'sine', 0.03, j * (0.11 + Math.random() * 0.06), base + Math.random() * 1200);
        }
      }
    },
    toggleMute: function () {
      muted = !muted;
      try { localStorage.setItem('fw_mute', muted ? '1' : '0'); } catch (e) {}
      return muted;
    },
    isMuted: function () { return muted; }
  };
  return S;
})();
