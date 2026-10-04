/* Bloom Defense — game feel module. window.BloomFeel
   Feel identity: "springy, garden, playful".
   Central event→effects map: gameplay code emits named feel events; this module
   owns the juice (haptics, number pops, springy screen shake). It may never
   change sim rules, saves, or gameplay balance. */
'use strict';
window.BloomFeel = (function () {
  /* ---------- easings ---------- */
  function easeOutCubic(k) {
    k = Math.max(0, Math.min(1, k));
    return 1 - Math.pow(1 - k, 3);
  }
  function easeOutBack(k) { // springy overshoot settle
    var c1 = 1.70158, c3 = c1 + 1;
    k = Math.max(0, Math.min(1, k));
    return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
  }

  /* ---------- haptics (never throws; iOS-safe) ---------- */
  var HAP_KEY = 'bloom2_haptics';
  var hapOn = true;
  try { hapOn = localStorage.getItem(HAP_KEY) !== '0'; } catch (e) {}
  function reducedMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { return false; }
  }
  function buzz(pattern) {
    try {
      if (!hapOn) return;
      if (reducedMotion()) return;
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* never throw on iOS */ }
  }
  function toggleHaptics() {
    hapOn = !hapOn;
    try { localStorage.setItem(HAP_KEY, hapOn ? '1' : '0'); } catch (e) {}
    return hapOn;
  }

  /* ---------- springy screen shake (garden: a wobble, not a rattle) ---------- */
  var shakeT = 1, shakeDur = 0.45, shakeAmp = 0;
  function shake(amp, dur) {
    if (reducedMotion()) return;
    shakeT = 0;
    shakeDur = dur || 0.45;
    shakeAmp = Math.min(amp || 6, 8); // capped
  }
  function shakeOffset() {
    if (shakeT >= 1) return null;
    var decay = (1 - shakeT) * (1 - shakeT);
    var wob = Math.sin(shakeT * Math.PI * 4.5); // ~2 damped humps
    return { x: wob * shakeAmp * decay, y: -wob * 0.6 * shakeAmp * decay };
  }

  /* ---------- number pops (pooled, bounce easing) ---------- */
  var pops = [];
  function pop(x, y, text, color) {
    var p = null;
    for (var i = 0; i < pops.length; i++) {
      if (pops[i].dead) { p = pops[i]; break; }
    }
    if (!p) { p = {}; pops.push(p); }
    p.x = x; p.y = y; p.text = text; p.color = color || '#fff';
    p.t = 0; p.dur = 0.9; p.dead = false;
  }
  function drawPops(ctx) {
    var any = false, i;
    for (i = 0; i < pops.length; i++) if (!pops[i].dead) { any = true; break; }
    if (!any) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 26px ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
    for (i = 0; i < pops.length; i++) {
      var p = pops[i];
      if (p.dead) continue;
      var k = p.t / p.dur;
      var rise = easeOutCubic(Math.min(1, k * 1.6)) * 44;
      var sc = easeOutBack(Math.min(1, k * 3)); // bounce-in
      ctx.save();
      ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      ctx.translate(p.x, p.y - rise);
      ctx.scale(Math.max(0.01, sc), Math.max(0.01, sc));
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20,40,15,0.85)';
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  /* ---------- event → effects map ---------- */
  var FX = {
    plant:      function () { buzz(20); },          // light tap on plant
    breachwarn: function () { buzz(30); },          // medium: zombie near the house
    waveclear:  function () { buzz([10, 40, 10]); } // success jingle on wave clear
  };
  function emit(name) {
    var f = FX[name];
    if (f) f();
  }

  /* ---------- per-frame tick (called from game update) ---------- */
  function tick(dt) {
    if (shakeT < 1) shakeT = Math.min(1, shakeT + dt / shakeDur);
    for (var i = 0; i < pops.length; i++) {
      var p = pops[i];
      if (p.dead) continue;
      p.t += dt;
      if (p.t >= p.dur) p.dead = true;
    }
  }

  return {
    emit: emit,
    pop: pop, drawPops: drawPops,
    shake: shake, shakeOffset: shakeOffset,
    tick: tick,
    back: easeOutBack, outCubic: easeOutCubic,
    reducedMotion: reducedMotion,
    hapticsOn: function () { return hapOn; },
    toggleHaptics: toggleHaptics
  };
})();
