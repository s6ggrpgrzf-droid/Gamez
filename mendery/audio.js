/* The Mendery — sound. Fully generative WebAudio, no files.
 *
 * A quiet room: faint warm air, nothing more. Under the thumb, a
 * soft brush-drag on porcelain; where the gold lands, a ceramic
 * tick whose pitch climbs with the care of that stretch — careful
 * work literally sounds brighter. A piece set on the bench knocks
 * softly against the wood. A piece made whole gets one soft bell.
 *
 * Wakes on the first touch. One ghost button, top-right — the
 * game's only button. Mute persists.
 */
'use strict';
(function () {
  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null, master = null, airGain = null, dragGain = null, noiseBuf = null;
  var muted = false, lastTick = -1; /* the first tick of a session is never swallowed */
  var lastDragAt = -9; /* when the thumb last reported motion */
  var dragLevel = 0; /* our own note of the drag gain — an AudioParam's
   * .value does not follow its automation events, so it can't be asked */
  var plays = { tick: 0, bell: 0, knock: 0, drag: 0 };

  try { muted = window.localStorage.getItem('mendery-muted') === '1'; } catch (e) { /* private */ }

  function makeNoise() {
    var len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; /* brownish lean */
      d[i] = (last * 3.2 + w * 0.35) * 0.5;
    }
  }
  function noiseSrc() {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    return s;
  }

  function build() {
    ctx = new AC();
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 6;
    comp.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(comp);
    makeNoise();
    /* the room: warm air, barely there */
    var airF = ctx.createBiquadFilter();
    airF.type = 'lowpass'; airF.frequency.value = 320;
    airGain = ctx.createGain(); airGain.gain.value = 0;
    var air = noiseSrc(); air.connect(airF); airF.connect(airGain); airGain.connect(master);
    air.start();
    airGain.gain.setTargetAtTime(0.013, ctx.currentTime, 1.6);
    /* the thumb: a brush dragged on porcelain */
    var dragF = ctx.createBiquadFilter();
    dragF.type = 'bandpass'; dragF.frequency.value = 860; dragF.Q.value = 0.7;
    dragGain = ctx.createGain(); dragGain.gain.value = 0;
    var drag = noiseSrc(); drag.connect(dragF); dragF.connect(dragGain); dragGain.connect(master);
    drag.start();
    /* a held-still thumb makes no friction sound: if no motion has
     * been reported for a breath, let the drag fall silent on its own
     * (the pointer stays down; only the sound rests) */
    setInterval(function () {
      if (!ctx || !dragGain || muted) return;
      if (ctx.currentTime - lastDragAt > 0.22 && dragLevel > 0.002) {
        dragLevel = 0;
        dragGain.gain.setTargetAtTime(0, ctx.currentTime, 0.06);
      }
    }, 130);
  }

  function wake() {
    if (!AC) return;
    if (!ctx) { try { build(); } catch (e) { return; } }
    if (ctx.state === 'suspended') ctx.resume();
  }

  /* care (0.3..1) lifts the tick: 1240Hz up to ~1810Hz */
  function tick(care) {
    if (!ctx || muted) return;
    var now = ctx.currentTime;
    if (now - lastTick < 0.045) return;
    lastTick = now;
    plays.tick++;
    var f = 1050 + (care || 0.6) * 760;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.10, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    o.connect(g); g.connect(master); o.start(now); o.stop(now + 0.13);
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = f * 1.8; bp.Q.value = 7;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.045, now);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    var ns = noiseSrc(); ns.connect(bp); bp.connect(ng); ng.connect(master);
    ns.start(now); ns.stop(now + 0.06);
  }

  function drag(speed) {
    if (!ctx || !dragGain) return;
    var target = muted ? 0 : Math.min(0.09, (speed || 0) * 0.09);
    dragLevel = target;
    if (target > 0.004) { plays.drag++; lastDragAt = ctx.currentTime; }
    dragGain.gain.setTargetAtTime(target, ctx.currentTime, 0.07);
  }

  function knock() {
    if (!ctx || muted) return;
    plays.knock++;
    var now = ctx.currentTime;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(196, now);
    o.frequency.exponentialRampToValueAtTime(118, now + 0.08);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.09, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    o.connect(g); g.connect(master); o.start(now); o.stop(now + 0.13);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.10, now);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    var ns = noiseSrc(); ns.connect(lp); lp.connect(ng); ng.connect(master);
    ns.start(now); ns.stop(now + 0.07);
  }

  function bell() {
    if (!ctx || muted) return;
    plays.bell++;
    var now = ctx.currentTime, root = 523.25;
    var partials = [ [1, 0.115, 3.8], [2.02, 0.06, 2.6], [2.74, 0.04, 1.8], [4.07, 0.015, 1.0] ];
    partials.forEach(function (p) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = root * p[0];
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(p[1], now + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + p[2]);
      o.connect(g); g.connect(master); o.start(now); o.stop(now + p[2] + 0.1);
    });
  }

  /* the one ghost button */
  var btn = document.createElement('button');
  btn.setAttribute('aria-label', 'sound on or off');
  btn.textContent = '\u266A';
  btn.style.cssText = 'position:fixed;top:calc(12px + env(safe-area-inset-top,0px));right:14px;z-index:5;' +
    'width:42px;height:42px;border-radius:50%;border:1px solid rgba(246,232,205,0.20);' +
    'background:rgba(20,12,6,0.25);color:rgba(246,232,205,0.80);font-size:19px;line-height:1;' +
    'font-family:Georgia,serif;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;';
  function paintBtn() {
    btn.style.opacity = muted ? '0.38' : '0.85';
    btn.style.textDecoration = muted ? 'line-through' : 'none';
  }
  paintBtn();
  btn.addEventListener('click', function () {
    wake();
    muted = !muted;
    try { window.localStorage.setItem('mendery-muted', muted ? '1' : '0'); } catch (e) { /* private */ }
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.1);
    paintBtn();
  });
  document.body.appendChild(btn);

  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (!muted) ctx.resume();
  });

  window.MenderyAudio = {
    wake: wake, tick: tick, drag: drag, knock: knock, bell: bell,
    plays: plays,
    get muted() { return muted; },
    get state() { return ctx ? ctx.state : 'none'; }
  };
})();
