/* Wildgrove — generative audio. All synthesized, no assets.
 * Dawn chorus gains voices with resident bird species; night has crickets
 * and a rare owl; rain has its own patter. Mute persisted. */
(function () {
  var ctx = null, master = null, muted = false;
  var ambNodes = [];
  var CHORUS_BIRDS = { cardinal: 1, blue_jay: 1, wild_turkey: 0.5 };

  try { muted = localStorage.getItem("wg_muted") === "1"; } catch (e) {}

  function ensure() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return true; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      return true;
    } catch (e) { return false; }
  }

  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem("wg_muted", muted ? "1" : "0"); } catch (e) {}
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  }

  function env(g, t0, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  /* --- ambience beds: wind through leaves, water near pond --- */
  function startAmbience() {
    if (!ensure() || ambNodes.length) return;
    // leafy wind: filtered noise, slow LFO on filter freq
    var buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    var ch = buf.getChannelData(0);
    for (var i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    var noise = ctx.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    var filt = ctx.createBiquadFilter();
    filt.type = "bandpass"; filt.frequency.value = 600; filt.Q.value = 0.6;
    var ng = ctx.createGain(); ng.gain.value = 0.05;
    var lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    var lfoG = ctx.createGain(); lfoG.gain.value = 250;
    lfo.connect(lfoG); lfoG.connect(filt.frequency);
    noise.connect(filt); filt.connect(ng); ng.connect(master);
    noise.start(); lfo.start();
    ambNodes.push(noise, lfo);
  }

  /* --- one bird phrase: 2-5 descending chirps --- */
  function chirp(when, base, bright) {
    var t0 = when;
    var n = 2 + Math.floor(Math.random() * 4);
    for (var i = 0; i < n; i++) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      var f = base * (1 - i * 0.06) + Math.random() * 120;
      o.frequency.setValueAtTime(f, t0);
      o.frequency.exponentialRampToValueAtTime(f * 1.25, t0 + 0.07);
      o.frequency.exponentialRampToValueAtTime(f * 0.9, t0 + 0.14);
      env(g, t0, 0.015, bright, 0.16);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + 0.25);
      t0 += 0.16 + Math.random() * 0.08;
    }
  }

  /* --- dawn chorus: one voice per resident bird species --- */
  function dawnChorus(residentSpecies) {
    if (!ensure()) return;
    var t = ctx.currentTime + 0.3;
    var voices = 0;
    for (var i = 0; i < residentSpecies.length; i++) {
      var w = CHORUS_BIRDS[residentSpecies[i]];
      if (!w) continue;
      var phrases = 2 + Math.floor(Math.random() * 3 * w);
      for (var p = 0; p < phrases; p++) {
        var base = residentSpecies[i] === "cardinal" ? 3400 :
                   residentSpecies[i] === "blue_jay" ? 2400 : 1400;
        chirp(t, base, 0.10);
        t += 0.9 + Math.random() * 1.6;
        voices++;
      }
    }
    if (!voices) chirp(t, 3000, 0.07); // a lone distant song
  }

  /* --- night: crickets + occasional owl --- */
  var cricketTimer = null;
  function startNight() {
    if (!ensure() || cricketTimer) return;
    function pulse() {
      if (!ctx) return;
      var t0 = ctx.currentTime;
      for (var i = 0; i < 3; i++) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = 4200 + Math.random() * 300;
        env(g, t0 + i * 0.09, 0.01, 0.028, 0.06);
        o.connect(g); g.connect(master);
        o.start(t0 + i * 0.09); o.stop(t0 + i * 0.09 + 0.12);
      }
      cricketTimer = setTimeout(pulse, 1400 + Math.random() * 2200);
    }
    pulse();
  }
  function stopNight() {
    if (cricketTimer) { clearTimeout(cricketTimer); cricketTimer = null; }
  }

  function owlHoot() {
    if (!ensure()) return;
    var t0 = ctx.currentTime;
    [0, 0.35].forEach(function (off, i) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = i ? 340 : 300;
      env(g, t0 + off, 0.05, 0.09, 0.28);
      o.connect(g); g.connect(master);
      o.start(t0 + off); o.stop(t0 + off + 0.4);
    });
  }

  /* --- rain patter --- */
  var rainNodes = [];
  function startRain() {
    if (!ensure() || rainNodes.length) return;
    var buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var ch = buf.getChannelData(0);
    for (var i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    var n = ctx.createBufferSource(); n.buffer = buf; n.loop = true;
    var f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 3800;
    var g = ctx.createGain(); g.gain.value = 0.035;
    n.connect(f); f.connect(g); g.connect(master); n.start();
    rainNodes.push(n);
  }
  function stopRain() {
    rainNodes.forEach(function (n) { try { n.stop(); } catch (e) {} });
    rainNodes = [];
  }

  /* --- UI sounds --- */
  function blip(freq, dur, vol) {
    if (!ensure()) return;
    var t0 = ctx.currentTime;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = freq;
    env(g, t0, 0.008, vol || 0.08, dur || 0.12);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + 0.3);
  }
  function plant() { blip(520, 0.14, 0.09); setTimeout(function () { blip(780, 0.18, 0.07); }, 90); }
  function water() { blip(900, 0.08, 0.05); setTimeout(function () { blip(1150, 0.1, 0.04); }, 70); }
  function select() { blip(660, 0.08, 0.05); }
  function arrival() { [523, 659, 784].forEach(function (f, i) { setTimeout(function () { blip(f, 0.2, 0.07); }, i * 130); }); }

  window.WGAudio = {
    ensure: ensure, startAmbience: startAmbience,
    dawnChorus: dawnChorus, startNight: startNight, stopNight: stopNight,
    owlHoot: owlHoot, startRain: startRain, stopRain: stopRain,
    plant: plant, water: water, select: select, arrival: arrival,
    toggleMute: toggleMute, isMuted: function () { return muted; }
  };
})();
