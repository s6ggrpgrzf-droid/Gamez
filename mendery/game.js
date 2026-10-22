/* The Mendery — Pass 1: the bench and the first bowl.
 *
 * Fantasy: you're at the bench, holding someone's broken bowl, and
 * the gold goes where your finger goes. One object, filling the view.
 * No menu, no shelf, no score — a crack, a thumb, a seam.
 *
 * The seam remembers how you traced: slow and close lays rich gold,
 * fast and loose lays it thin. Nothing grades you. The bowl knows.
 */
'use strict';
(function () {
  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d');
  var whisperEl = document.getElementById('whisper');
  var whisperMain = document.getElementById('whisperMain');
  var whisperSub = document.getElementById('whisperSub');

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ================= layout ================= */
  var CW = 0, CH = 0, DPR = 1;
  var bowlC = { x: 0, y: 0 }, bowlR = 100;
  var benchCv = null, bowlCv = null;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    CW = window.innerWidth; CH = window.innerHeight;
    cv.width = Math.round(CW * DPR); cv.height = Math.round(CH * DPR);
    cv.style.width = CW + 'px'; cv.style.height = CH + 'px';
    bowlC.x = CW * (CW > CH ? 0.56 : 0.5);
    bowlC.y = CH * (CW > CH ? 0.5 : 0.44);
    bowlR = Math.min(CW, CH) * 0.365;
    buildBench();
    buildBowlBase();
  }
  window.addEventListener('resize', resize);

  /* ================= the bench (prerendered) ================= */
  function buildBench() {
    benchCv = document.createElement('canvas');
    benchCv.width = Math.round(CW * DPR); benchCv.height = Math.round(CH * DPR);
    var b = benchCv.getContext('2d');
    b.setTransform(DPR, 0, 0, DPR, 0, 0);
    var g = b.createLinearGradient(0, 0, 0, CH);
    g.addColorStop(0, '#2a1a10'); g.addColorStop(0.55, '#1d120a'); g.addColorStop(1, '#120b06');
    b.fillStyle = g; b.fillRect(0, 0, CW, CH);
    /* planks + grain */
    var rngB = mulberry32(77);
    var plankH = Math.max(64, CH / 9);
    for (var y = 0; y < CH; y += plankH) {
      b.fillStyle = 'rgba(255,190,120,' + (rngB() * 0.03) + ')';
      b.fillRect(0, y, CW, plankH - 2);
      b.fillStyle = 'rgba(0,0,0,0.35)';
      b.fillRect(0, y + plankH - 2, CW, 2);
      for (var gl2 = 0; gl2 < 7; gl2++) {
        b.strokeStyle = 'rgba(0,0,0,' + (0.03 + rngB() * 0.05) + ')';
        b.lineWidth = 1 + rngB() * 1.4;
        b.beginPath();
        var gy = y + rngB() * plankH;
        b.moveTo(-10, gy);
        for (var gx = 0; gx <= CW + 10; gx += 46) b.lineTo(gx, gy + Math.sin(gx * 0.01 + gl2 * 7.0) * 2.6);
        b.stroke();
      }
    }
    /* a knot or two */
    for (var kn = 0; kn < 3; kn++) {
      var kx = rngB() * CW, ky = rngB() * CH, kr = 6 + rngB() * 9;
      var kg = b.createRadialGradient(kx, ky, 1, kx, ky, kr);
      kg.addColorStop(0, 'rgba(10,5,2,0.5)'); kg.addColorStop(1, 'rgba(10,5,2,0)');
      b.fillStyle = kg; b.beginPath(); b.arc(kx, ky, kr, 0, 6.2832); b.fill();
    }
    /* the lamp's pool of light */
    var lg = b.createRadialGradient(CW * 0.30, CH * 0.14, 10, CW * 0.30, CH * 0.14, Math.max(CW, CH) * 0.85);
    lg.addColorStop(0, 'rgba(255,196,116,0.20)'); lg.addColorStop(0.5, 'rgba(255,180,100,0.06)'); lg.addColorStop(1, 'rgba(255,180,100,0)');
    b.fillStyle = lg; b.fillRect(0, 0, CW, CH);
    /* the gold dish and brush, resting at the side */
    var dx = CW * 0.845, dy = CH * (CW > CH ? 0.82 : 0.80), dr = Math.min(CW, CH) * 0.062;
    b.save();
    b.fillStyle = 'rgba(0,0,0,0.4)';
    b.beginPath(); b.ellipse(dx + 3, dy + 5, dr * 1.15, dr * 0.9, 0, 0, 6.2832); b.fill();
    var dg = b.createRadialGradient(dx - dr * 0.3, dy - dr * 0.3, 1, dx, dy, dr);
    dg.addColorStop(0, '#4a3826'); dg.addColorStop(1, '#241607');
    b.fillStyle = dg; b.beginPath(); b.arc(dx, dy, dr, 0, 6.2832); b.fill();
    var pg = b.createRadialGradient(dx, dy, 1, dx, dy, dr * 0.66);
    pg.addColorStop(0, '#f7d67c'); pg.addColorStop(0.7, '#d9a441'); pg.addColorStop(1, '#9a6d1f');
    b.fillStyle = pg; b.beginPath(); b.arc(dx, dy, dr * 0.66, 0, 6.2832); b.fill();
    b.restore();
    /* brush */
    b.save();
    b.translate(CW * 0.13, CH * (CW > CH ? 0.84 : 0.815));
    b.rotate(0.5);
    b.fillStyle = '#54381f';
    b.beginPath();
    if (b.roundRect) b.roundRect(-52, -4.5, 84, 9, 4.5); else b.rect(-52, -4.5, 84, 9);
    b.fill();
    b.fillStyle = '#8f8a80'; b.fillRect(30, -5.5, 13, 11);
    b.fillStyle = '#caa14e';
    b.beginPath(); b.moveTo(43, -5); b.lineTo(58, 0); b.lineTo(43, 5); b.closePath(); b.fill();
    b.restore();
  }

  /* ================= the bowl (base prerendered per bowl) ================= */
  var bowl = null;

  function makeBowl(seed) {
    var rng = mulberry32(seed);
    var segs = [];
    function walk(x, y, ang, steps, stepLen, branch) {
      var px = x, py = y;
      for (var i = 0; i < steps; i++) {
        ang += (rng() - 0.5) * 0.72;
        var nx = px + Math.cos(ang) * stepLen, ny = py + Math.sin(ang) * stepLen;
        var rr = Math.hypot(nx, ny);
        if (rr > 0.97) { nx *= 0.97 / rr; ny *= 0.97 / rr; }
        segs.push({ x1: px, y1: py, x2: nx, y2: ny, filled: false, care: 0, branch: branch });
        px = nx; py = ny;
        if (Math.hypot(px, py) < 0.10) break;
      }
      return { x: px, y: py, ang: ang };
    }
    var a0 = rng() * Math.PI * 2;
    var sx = Math.cos(a0) * 0.96, sy = Math.sin(a0) * 0.96;
    var mid = walk(sx, sy, a0 + Math.PI + (rng() - 0.5) * 0.5, 15 + Math.floor(rng() * 5), 0.092, false);
    /* one branch, from somewhere along the main crack */
    var src = segs[Math.floor(segs.length * (0.35 + rng() * 0.3))];
    if (src) {
      var bAng = Math.atan2(src.y2 - src.y1, src.x2 - src.x1) + (rng() < 0.5 ? 1 : -1) * (0.6 + rng() * 0.5);
      walk(src.x2, src.y2, bAng, 5 + Math.floor(rng() * 4), 0.07, true);
    }
    void mid;
    bowl = {
      seed: seed, segs: segs, complete: false, completeT: 0,
      filledCount: 0, fade: 1, hueShift: rng() * 0.05
    };
    buildBowlBase();
  }

  function buildBowlBase() {
    if (!bowl) return;
    var S = Math.ceil(bowlR * 2 * 1.3);
    bowlCv = document.createElement('canvas');
    bowlCv.width = Math.round(S * DPR); bowlCv.height = Math.round(S * DPR);
    var b = bowlCv.getContext('2d');
    b.setTransform(DPR, 0, 0, DPR, 0, 0);
    b.translate(S / 2, S / 2);
    var R = bowlR;
    /* shadow */
    var sg = b.createRadialGradient(R * 0.08, R * 0.14, R * 0.2, R * 0.08, R * 0.14, R * 1.18);
    sg.addColorStop(0, 'rgba(0,0,0,0.42)'); sg.addColorStop(0.75, 'rgba(0,0,0,0.25)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = sg; b.beginPath(); b.arc(R * 0.08, R * 0.14, R * 1.18, 0, 6.2832); b.fill();
    /* body — warm ivory porcelain */
    var bg2 = b.createRadialGradient(-R * 0.28, -R * 0.34, R * 0.1, 0, 0, R * 1.22);
    bg2.addColorStop(0, '#fffaf0'); bg2.addColorStop(0.45, '#f3e9d5');
    bg2.addColorStop(0.8, '#dcc9a8'); bg2.addColorStop(1, '#b1986f');
    b.fillStyle = bg2; b.beginPath(); b.arc(0, 0, R, 0, 6.2832); b.fill();
    /* the well — deepest (darkest) at the centre, light on the walls,
     * so it reads concave, a bowl and not a plate */
    var wg = b.createRadialGradient(0, R * 0.05, R * 0.05, 0, 0, R * 0.82);
    wg.addColorStop(0, '#c7ad83'); wg.addColorStop(0.5, '#dbc69f');
    wg.addColorStop(0.8, '#eee0be'); wg.addColorStop(1, '#a68c5e');
    b.fillStyle = wg; b.beginPath(); b.arc(0, 0, R * 0.8, 0, 6.2832); b.fill();
    /* well's inner shadow, low */
    b.strokeStyle = 'rgba(96,74,44,0.30)'; b.lineWidth = R * 0.05;
    b.beginPath(); b.arc(0, 0, R * 0.765, Math.PI * 0.25, Math.PI * 0.85); b.stroke();
    /* rim light */
    b.strokeStyle = 'rgba(255,252,240,0.5)'; b.lineWidth = R * 0.016;
    b.beginPath(); b.arc(0, 0, R * 0.985, Math.PI * 1.05, Math.PI * 1.55); b.stroke();
    b.strokeStyle = 'rgba(110,86,52,0.35)'; b.lineWidth = R * 0.02;
    b.beginPath(); b.arc(0, 0, R * 0.995, 0, 6.2832); b.stroke();
    /* speckle */
    var rngS = mulberry32(bowl.seed * 7 + 3);
    for (var i = 0; i < 420; i++) {
      var sa = rngS() * 6.2832, sr = Math.sqrt(rngS()) * R * 0.97;
      b.fillStyle = rngS() < 0.12 ? 'rgba(190,150,60,0.10)' : 'rgba(96,74,44,' + (0.02 + rngS() * 0.04) + ')';
      b.beginPath(); b.arc(Math.cos(sa) * sr, Math.sin(sa) * sr, 0.6 + rngS() * 1.1, 0, 6.2832); b.fill();
    }
    /* the potter's mark — a small iron-red seal near the rim */
    b.save();
    b.translate(R * 0.62, R * 0.66); b.rotate(0.4);
    b.strokeStyle = 'rgba(148,64,42,0.55)'; b.lineWidth = 1.6;
    b.beginPath(); b.arc(0, 0, R * 0.045, 0, 6.2832); b.stroke();
    b.fillStyle = 'rgba(148,64,42,0.55)';
    b.beginPath(); b.arc(0, 0, R * 0.014, 0, 6.2832); b.fill();
    b.restore();
    /* lamp highlight crescent */
    var hg = b.createRadialGradient(-R * 0.42, -R * 0.5, 2, -R * 0.42, -R * 0.5, R * 0.62);
    hg.addColorStop(0, 'rgba(255,255,246,0.20)'); hg.addColorStop(1, 'rgba(255,255,246,0)');
    b.fillStyle = hg; b.beginPath(); b.arc(0, 0, R, 0, 6.2832); b.fill();
  }

  /* ================= the seam ================= */
  function progress() {
    if (!bowl || !bowl.segs.length) return 0;
    return bowl.filledCount / bowl.segs.length;
  }
  function segDist(px, py, s) {
    var dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    var l2 = dx * dx + dy * dy || 1e-6;
    var tt = clamp(((px - s.x1) * dx + (py - s.y1) * dy) / l2, 0, 1);
    var ex = s.x1 + dx * tt - px, ey = s.y1 + dy * tt - py;
    return Math.hypot(ex, ey);
  }

  var sparkles = [];
  function spawnSparkle(x, y, big) {
    if (sparkles.length > 130) return;
    sparkles.push({
      x: x, y: y, vx: (Math.random() - 0.5) * 14, vy: -8 - Math.random() * 16,
      life: 0, ttl: big ? 1.5 + Math.random() : 0.6 + Math.random() * 0.5,
      r: big ? 1.6 + Math.random() * 1.6 : 0.8 + Math.random() * 1.1
    });
  }

  /* ================= input ================= */
  var tracing = false, lastMove = null, fadeSwap = 0, swapDone = false;
  var mendedCount = 0;
  try { mendedCount = parseInt(window.localStorage.getItem('mendery-mended') || '0', 10) || 0; } catch (e) { /* private */ }

  function toBowlSpace(cxPx, cyPx) {
    return { x: (cxPx - bowlC.x) / bowlR, y: (cyPx - bowlC.y) / bowlR };
  }
  function doTrace(cxPx, cyPx, stamp) {
    if (!bowl || bowl.complete || fadeSwap > 0) return;
    var p = toBowlSpace(cxPx, cyPx);
    if (Math.hypot(p.x, p.y) > 1.12) { lastMove = null; return; }
    var speed = 0;
    if (lastMove) {
      var dtm = Math.max(1, stamp - lastMove.stamp) / 1000;
      speed = Math.hypot(p.x - lastMove.x, p.y - lastMove.y) / dtm;
    }
    lastMove = { x: p.x, y: p.y, stamp: stamp };
    var TOL = 0.085;
    for (var i = 0; i < bowl.segs.length; i++) {
      var s = bowl.segs[i];
      if (s.filled) continue;
      var d = segDist(p.x, p.y, s);
      if (d < TOL) {
        s.filled = true;
        s.care = clamp(1.12 - speed * 0.5 - d * 4.5, 0.3, 1);
        bowl.filledCount++;
        spawnSparkle(bowlC.x + (s.x1 + s.x2) / 2 * bowlR, bowlC.y + (s.y1 + s.y2) / 2 * bowlR, false);
      }
    }
    if (progress() >= 0.985 && !bowl.complete) completeBowl();
  }
  function completeBowl() {
    bowl.complete = true;
    bowl.completeT = elapsed;
    bowl.segs.forEach(function (s) { if (!s.filled) { s.filled = true; s.care = 0.8; bowl.filledCount++; } });
    for (var i = 0; i < 18; i++) {
      var a = Math.random() * 6.2832, rr = Math.random() * bowlR * 0.7;
      spawnSparkle(bowlC.x + Math.cos(a) * rr, bowlC.y + Math.sin(a) * rr, true);
    }
    mendedCount++;
    try { window.localStorage.setItem('mendery-mended', String(mendedCount)); } catch (e) { /* private */ }
    setWhisper('mended', 'Mended.', 'tap the bowl when you\u2019re ready for another');
  }
  cv.addEventListener('pointerdown', function (e) {
    if (bowl && bowl.complete && fadeSwap === 0) {
      var p = toBowlSpace(e.clientX, e.clientY);
      if (Math.hypot(p.x, p.y) < 1.05) { fadeSwap = 0.0001; return; }
    }
    tracing = true; lastMove = null;
    doTrace(e.clientX, e.clientY, e.timeStamp);
    try { cv.setPointerCapture && cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
  });
  cv.addEventListener('pointermove', function (e) {
    if (tracing) doTrace(e.clientX, e.clientY, e.timeStamp);
  });
  function endTrace() { tracing = false; lastMove = null; }
  cv.addEventListener('pointerup', endTrace);
  cv.addEventListener('pointercancel', endTrace);
  window.addEventListener('blur', endTrace);

  /* ================= whisper ================= */
  var whisperKey = '__boot';
  function setWhisper(key, main, sub) {
    if (key === whisperKey) return;
    whisperKey = key;
    if (!main) { whisperEl.classList.remove('show'); return; }
    whisperMain.textContent = main;
    whisperSub.textContent = sub || '';
    whisperEl.classList.add('show');
  }

  /* ================= motes in the lamplight ================= */
  var motes = [];
  (function makeMotes() {
    var rngM = mulberry32(9);
    for (var i = 0; i < 26; i++) {
      motes.push({ x: rngM(), y: rngM() * 0.7, s: 0.5 + rngM() * 1.3, ph: rngM() * 6.283, sp: 0.004 + rngM() * 0.01 });
    }
  })();

  /* ================= render ================= */
  var elapsed = 0, lastT = 0, raf = 0;
  function frame(nowMs) {
    raf = requestAnimationFrame(frame);
    var now = nowMs / 1000;
    var dt = Math.min(now - (lastT || now), 0.1); lastT = now;
    elapsed += dt;
    var t = elapsed;
    window.__mendery.frameCount++;

    /* bowl swap fade */
    if (fadeSwap > 0) {
      fadeSwap += dt / 0.45;
      if (fadeSwap >= 0.5 && !swapDone) {
        swapDone = true;
        makeBowl((Math.random() * 1e9) | 0);
        setWhisper('new', 'Another, then.', 'trace the crack, slowly');
      }
      if (fadeSwap >= 1) { fadeSwap = 0; swapDone = false; }
    }
    var fadeAlpha = fadeSwap === 0 ? 1 : (fadeSwap < 0.5 ? 1 - fadeSwap * 2 : (fadeSwap - 0.5) * 2);

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalAlpha = 1;
    if (benchCv) ctx.drawImage(benchCv, 0, 0, CW, CH);

    if (bowlCv && bowl) {
      var S = Math.ceil(bowlR * 2 * 1.3);
      ctx.globalAlpha = fadeAlpha;
      ctx.drawImage(bowlCv, bowlC.x - S / 2, bowlC.y - S / 2, S, S);
      /* crack + seam — drawn per segment, because the seam remembers
       * how each stretch was traced: care widens and brightens it */
      var pulse = bowl.complete ? Math.max(0, 1 - (t - bowl.completeT) / 2.2) : 0;
      var glow = 1 + pulse * 0.9;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (var i = 0; i < bowl.segs.length; i++) {
        var s = bowl.segs[i];
        if (!s.filled) continue;
        var cw = 0.6 + s.care * 0.65;
        var sx1 = bowlC.x + s.x1 * bowlR, sy1 = bowlC.y + s.y1 * bowlR;
        var sx2 = bowlC.x + s.x2 * bowlR, sy2 = bowlC.y + s.y2 * bowlR;
        ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2);
        ctx.strokeStyle = 'rgba(138,90,23,0.85)'; ctx.lineWidth = bowlR * 0.021 * cw * glow; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2);
        ctx.strokeStyle = 'rgba(224,164,54,0.95)'; ctx.lineWidth = bowlR * 0.012 * cw * glow; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2);
        ctx.strokeStyle = 'rgba(255,233,168,' + (0.30 + s.care * 0.35 + pulse * 0.3) + ')';
        ctx.lineWidth = bowlR * 0.005 * cw * glow; ctx.stroke();
      }
      /* the unfilled crack, drawn under the seam's brightness */
      ctx.beginPath();
      var anyOpen = false;
      for (var j = 0; j < bowl.segs.length; j++) {
        var o = bowl.segs[j];
        if (o.filled) continue;
        anyOpen = true;
        ctx.moveTo(bowlC.x + o.x1 * bowlR, bowlC.y + o.y1 * bowlR);
        ctx.lineTo(bowlC.x + o.x2 * bowlR, bowlC.y + o.y2 * bowlR);
      }
      if (anyOpen) {
        ctx.strokeStyle = 'rgba(36,24,13,0.92)';
        ctx.lineWidth = Math.max(1.6, bowlR * 0.011);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    /* sparkles */
    for (var k = sparkles.length - 1; k >= 0; k--) {
      var sp = sparkles[k];
      sp.life += dt;
      if (sp.life >= sp.ttl) { sparkles.splice(k, 1); continue; }
      sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.vy -= 6 * dt;
      var la = 1 - sp.life / sp.ttl;
      ctx.fillStyle = 'rgba(255,220,140,' + (la * 0.85) + ')';
      ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r * la + 0.3, 0, 6.2832); ctx.fill();
    }

    /* dust motes drifting in the lamplight */
    ctx.fillStyle = 'rgba(255,214,150,1)';
    for (var m = 0; m < motes.length; m++) {
      var mo = motes[m];
      mo.y += mo.sp * dt * 10 * 0.016; mo.x += Math.sin(t * 0.3 + mo.ph) * 0.00012;
      if (mo.y > 0.78) { mo.y = 0.02; mo.x = Math.random() * 0.7; }
      var mx = mo.x * CW, my = mo.y * CH;
      var dxL = (mx - CW * 0.30) / (CW * 0.5), dyL = (my - CH * 0.14) / (CH * 0.5);
      var inLamp = Math.max(0, 1 - (dxL * dxL + dyL * dyL));
      ctx.globalAlpha = inLamp * (0.10 + 0.08 * Math.sin(t * 0.9 + mo.ph));
      ctx.beginPath(); ctx.arc(mx, my, mo.s, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* whisper upkeep */
    if (bowl && !bowl.complete && progress() > 0.02 && whisperKey !== 'tracing') {
      setWhisper('tracing', null);
    }
    if (bowl && !bowl.complete && progress() <= 0.02 && whisperKey !== 'start' && whisperKey !== 'new') {
      setWhisper('start', 'The Mendery', 'trace the crack, slowly');
    }
  }

  /* ================= boot ================= */
  window.__mendery = {
    ready: false, frameCount: 0,
    get segments() { return bowl ? bowl.segs : []; },
    progress: progress,
    get complete() { return bowl ? bowl.complete : false; },
    get mendedCount() { return mendedCount; },
    newBowl: function (seed) { makeBowl(seed || ((Math.random() * 1e9) | 0)); },
    toClient: function (x, y) { return { x: bowlC.x + x * bowlR, y: bowlC.y + y * bowlR }; },
    centre: bowlC
  };
  resize();
  makeBowl(20261021);
  setWhisper('start', 'The Mendery', 'trace the crack, slowly');
  requestAnimationFrame(function (ms) {
    window.__mendery.ready = true;
    frame(ms);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(raf); lastT = 0; }
    else raf = requestAnimationFrame(frame);
  });
})();
