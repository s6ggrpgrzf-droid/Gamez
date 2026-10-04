'use strict';
/* =====================================================================
 * Tiny Fairway — canvas render + input + audio + meta (game #12)
 *
 * Built against the TF sim contract (sim.js, plain script, global TF):
 *   TF.mulberry32(seed), TF.dailySeed('YYYY-MM-DD') -> uint32
 *   TF.GRAV, TF.REST, TF.BALL_R, TF.CUP_R, TF.MAX_POWER
 *   TF.genHole(seed) -> {seed,W,H, terrain:{h(x),slope(x)}, sand:[{x0,x1}],
 *                        water:[{x0,x1}], waterLevel, tee:{x,y}, cup:{x,y}, par, biome}
 *   TF.newBall(hole) -> ball; TF.shoot(ball,vx,vy) (caps at MAX_POWER);
 *   TF.simStep(hole,ball) = exactly 1/60s physics
 *   TF.starsFor(strokes,par); TF.inSand(hole,x); TF.inWater(hole,x)
 *
 * Ball-shape note: game.js reads/writes ball.x/.y/.vx/.vy/.resting and treats
 * any of ball.inCup|ball.sunk|ball.holed|ball.potted as the holed flag, with a
 * geometric fallback (slow and resting inside the cup radius).
 * ===================================================================== */
(function () {
  function $(id) { return document.getElementById(id); }
  function showErr(m) { var e = $('err'); e.hidden = false; e.textContent = m; }
  if (typeof TF === 'undefined') { showErr('Tiny Fairway could not load its physics (sim.js).'); return; }

  /* ---------------- canvas / viewport ---------------- */
  var canvas = $('game'), ctx = canvas.getContext('2d');
  var cw = 0, ch = 0, DPR = 1, skyGrad = null;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    cw = window.innerWidth; ch = window.innerHeight;
    canvas.width = Math.round(cw * DPR); canvas.height = Math.round(ch * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    skyGrad = null; fit();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });

  /* ---------------- world -> screen ---------------- */
  var vw = 100, vh = 60, sc = 1, ox = 0, oy = 0;
  function fit() {
    vw = hole ? hole.W : 100; vh = hole ? hole.H : 60;
    sc = Math.min(cw / vw, ch / vh);
    ox = (cw - vw * sc) / 2; oy = (ch - vh * sc) / 2;
  }
  function X(x) { return ox + x * sc; }
  function Y(y) { return oy + (vh - y) * sc; }

  /* ---------------- biomes: 0 dawn meadow, 1 desert noon, 2 dusk, 3 moonlit snow */
  var BIOMES = [
    { skyTop: '#f7b267', skyBot: '#fdf3d8', sun: '#fff6d8', sunY: 0.72,
      terrain: '#79b25a', terrainDark: '#57873f', sand: '#e6cf96', sandDot: '#c9af6b',
      water: '#6fc3e8', waterTop: '#bfe9fa', flag: '#e0492f', wind: 520 },
    { skyTop: '#2f9df0', skyBot: '#ffedbe', sun: '#fffbe9', sunY: 0.82,
      terrain: '#d9a75f', terrainDark: '#a97c3a', sand: '#f2e0b0', sandDot: '#d9bd7f',
      water: '#3fa9e0', waterTop: '#b5e6fa', flag: '#d63c2f', wind: 380 },
    { skyTop: '#241543', skyBot: '#ff8c5a', sun: '#ffd27a', sunY: 0.34,
      terrain: '#3e5a41', terrainDark: '#2a4030', sand: '#c9ad76', sandDot: '#a3804f',
      water: '#5a7fd6', waterTop: '#a9c2f2', flag: '#ff5a4e', wind: 300 },
    { skyTop: '#060d1f', skyBot: '#27406e', sun: '#f4f1de', sunY: 0.78,
      terrain: '#dde8f6', terrainDark: '#a9bcd8', sand: '#cfd9e8', sandDot: '#a9b8d2',
      water: '#3d6fb4', waterTop: '#9cc4ee', flag: '#e0492f', wind: 640 }
  ];
  function biome() { return BIOMES[curBiome]; }

  /* ---------------- audio (WebAudio, gesture-gated) ---------------- */
  var AU = {
    ctx: null, master: null, windFilter: null, windGain: null, rollGain: null, noiseBuf: null,
    init: function () {
      try {
        if (!this.ctx) {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          this.ctx = new AC();
          this.master = this.ctx.createGain(); this.master.gain.value = 0.9;
          this.master.connect(this.ctx.destination);
          var len = 2 * this.ctx.sampleRate, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate),
              d = buf.getChannelData(0), i;
          for (i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
          this.noiseBuf = buf;
          var w = this.ctx.createBufferSource(); w.buffer = buf; w.loop = true;
          this.windFilter = this.ctx.createBiquadFilter();
          this.windFilter.type = 'lowpass'; this.windFilter.frequency.value = 520;
          this.windGain = this.ctx.createGain(); this.windGain.gain.value = 0.035;
          w.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.master);
          w.start();
          var r = this.ctx.createBufferSource(); r.buffer = buf; r.loop = true; r.playbackRate.value = 0.7;
          var bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 750; bp.Q.value = 1.1;
          this.rollGain = this.ctx.createGain(); this.rollGain.gain.value = 0;
          r.connect(bp); bp.connect(this.rollGain); this.rollGain.connect(this.master);
          r.start();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) {}
    },
    setBiome: function (i) {
      if (!this.ctx || !this.windFilter) return;
      try { this.windFilter.frequency.setTargetAtTime(BIOMES[i].wind, this.ctx.currentTime, 0.8); } catch (e) {}
    },
    suspend: function () { try { if (this.ctx) this.ctx.suspend(); } catch (e) {} },
    resume: function () { try { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); } catch (e) {} },
    blip: function (f0, f1, dur, vol, type) {
      if (!this.ctx) return;
      try {
        var t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
      } catch (e) {}
    },
    noise: function (dur, vol, fFrom, fTo, type) {
      if (!this.ctx) return;
      try {
        var t = this.ctx.currentTime, s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
        var f = this.ctx.createBiquadFilter(); f.type = type || 'lowpass';
        f.frequency.setValueAtTime(fFrom, t); f.frequency.exponentialRampToValueAtTime(Math.max(fTo, 20), t + dur);
        var g = this.ctx.createGain();
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.02);
      } catch (e) {}
    },
    thock: function () { this.blip(170, 70, 0.11, 0.30, 'triangle'); this.noise(0.06, 0.18, 2400, 900, 'highpass'); },
    chime: function (big) {
      var self = this;
      this.blip(659.26, 655, 1.0, 0.16);
      setTimeout(function () { self.blip(830.61, 826, 1.1, 0.16); }, 130);
      if (big) setTimeout(function () { self.blip(1318.5, 1310, 1.3, 0.13); }, 260);
    },
    splash: function () { this.noise(0.35, 0.22, 1500, 260, 'lowpass'); },
    click: function () { this.blip(520, 480, 0.07, 0.10, 'triangle'); }
  };

  /* ---------------- state ---------------- */
  var STEP = 1 / 60;
  var state = 'menu';           // menu | play | holed | result
  var mode = 'endless';         // endless | daily
  var holeIndex = 1, runSeed = 0, seed = 1;
  var hole = null, ball = null, curBiome = 0;
  var strokes = 0, totalStrokes = 0, totalStars = 0;
  var inFlight = false, aiming = false, drag = null;
  var lastRest = { x: 0, y: 0 };
  var slowT = 0, timeScale = 1, acc = 0, last = 0, running = false;
  var wtime = 0;
  var dailyInfo = null;
  var holeNameStr = '';
  var particles = [];
  var turtle = null;
  var speckles = [], nightStars = [];
  var aimPts = [];

  /* ---------------- storage ---------------- */
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function saveRun() {
    if (mode !== 'endless') return;
    lsSet('tf_run', JSON.stringify({ runSeed: runSeed, holeIndex: holeIndex, totalStrokes: totalStrokes, totalStars: totalStars }));
  }
  function loadRun() { try { return JSON.parse(lsGet('tf_run', 'null')); } catch (e) { return null; } }
  function saveBest() {
    if (mode !== 'endless') return;
    try {
      var b = JSON.parse(lsGet('tf_best', 'null'));
      if (!b || holeIndex > b.holes || (holeIndex === b.holes && totalStrokes < b.strokes))
        lsSet('tf_best', JSON.stringify({ holes: holeIndex, strokes: totalStrokes, stars: totalStars }));
    } catch (e) {}
  }

  /* ---------------- hole setup ---------------- */
  function loadHole(n, s) {
    holeIndex = n; seed = s >>> 0;
    hole = TF.genHole(seed);
    curBiome = Math.floor((holeIndex - 1) / 8) % 4;
    document.body.setAttribute('data-biome', String(curBiome));
    AU.setBiome(curBiome);
    ball = TF.newBall(hole);
    ball.vx = 0; ball.vy = 0; ball.resting = true;
    clearHoled(ball);
    strokes = 0; inFlight = false; aiming = false; drag = null; aimPts = [];
    lastRest = { x: ball.x, y: ball.y };
    particles = [];
    fit(); skyGrad = null;
    buildSpeckles(); buildNightStars(); initTurtle();
    holeNameStr = '';
    holeName(holeIndex, function (nm) {
      if (holeIndex !== n) return;
      holeNameStr = nm;
      if (state === 'play' || state === 'holed') updateHUD();
      var tr = $('transit');
      if (tr && tr.classList.contains('in')) $('transit-name').textContent = nm;
    });
    updateHUD();
  }

  function buildSpeckles() {
    speckles = [];
    if (!hole.sand) return;
    var rng = TF.mulberry32((seed ^ 0x51ab3) >>> 0);
    hole.sand.forEach(function (p) {
      var wdt = Math.max(0, p.x1 - p.x0), n = Math.round(wdt * 5), i, x;
      for (i = 0; i < n; i++) {
        x = p.x0 + rng() * wdt;
        speckles.push({ x: x, y: hole.terrain.h(x) + 0.25 + rng() * 1.1, r: 0.14 + rng() * 0.3 });
      }
    });
  }
  function buildNightStars() {
    nightStars = [];
    if (curBiome !== 3) return;
    var rng = TF.mulberry32((seed ^ 0x77aa1) >>> 0), i;
    for (i = 0; i < 70; i++)
      nightStars.push({ x: rng() * cw, y: rng() * ch * 0.55, r: 0.6 + rng() * 1.4, tw: rng() * 6.28 });
  }

  /* ---------------- the turtle (required creative touch) ---------------- */
  function initTurtle() {
    turtle = null;
    var rng = TF.mulberry32((seed ^ 0x9e3779b9) >>> 0);
    if (rng() >= 0.55) return;                       // not every hole gets a turtle
    turtle = { x: 8 + rng() * (hole.W - 16), dir: rng() < 0.5 ? 1 : -1,
               speed: 1.0 + rng() * 0.9, phase: rng() * 6.28,
               judge: false, judgeT: 0, blinkT: rng() * 2 };
  }
  function updateTurtle(dt) {
    if (!turtle) return;
    var t = turtle;
    if (t.judge) { t.judgeT += dt; t.blinkT += dt; return; }
    t.blinkT += dt;
    var dx = t.x - ball.x, dy = hole.terrain.h(t.x) - ball.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 7 && dist > 0.001) {
      // steer clear of the ball's path — the turtle can never be hit
      t.x += (dx / dist) * 3.4 * dt;
      t.dir = dx >= 0 ? 1 : -1;
    } else {
      t.x += t.dir * t.speed * dt;
    }
    if (t.x < 3) { t.x = 3; t.dir = 1; }
    if (t.x > hole.W - 3) { t.x = hole.W - 3; t.dir = -1; }
  }
  function turtleJudge() {
    if (!turtle) turtle = { x: hole.cup.x - 6, dir: 1, speed: 1.2, phase: 1.1, judge: false, judgeT: 0, blinkT: 0 };
    turtle.judge = true; turtle.judgeT = 0;
    turtle.x = Math.max(3, Math.min(hole.W - 3, hole.cup.x - 6));
  }
  function drawTurtle() {
    if (!turtle) return;
    var t = turtle;
    var gy = hole.terrain.h(t.x);
    var px = X(t.x), py = Y(gy);
    var s = Math.max(sc * 1.15, 7);                    // turtle ~2.3 world units wide
    var shell = curBiome === 3 ? '#5a6b52' : '#4f7a3f';
    var belly = curBiome === 3 ? '#8a9a80' : '#7ba05b';
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(t.dir, 1);
    ctx.fillStyle = belly;                             // paddling feet
    var pad = Math.sin(wtime * 8 + t.phase) * s * 0.08, i;
    var feet = [[-0.62, pad], [-0.2, -pad], [0.25, pad], [0.62, -pad]];
    for (i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.ellipse(feet[i][0] * s, -s * 0.06, s * 0.16, s * 0.1, 0, 0, 6.2832); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(s * 0.95, -s * 0.28, s * 0.3, 0, 6.2832); ctx.fill();   // head
    ctx.fillStyle = shell;                             // dome shell
    ctx.beginPath(); ctx.arc(0, 0, s * 0.72, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath(); ctx.arc(0, 0, s * 0.72, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, s * 0.42, Math.PI, 0); ctx.stroke();
    var open = t.judge ? (((t.blinkT % 2.6) < 0.55) ? 0.12 : 1)     // slow judgmental blink
                       : (((t.blinkT % 4.2) < 0.18) ? 0.15 : 1);    // idle blink
    ctx.fillStyle = '#1d2419';
    ctx.beginPath(); ctx.ellipse(s * 1.02, -s * 0.32, s * 0.07, s * 0.07 * open, 0, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  /* ---------------- ball helpers ---------------- */
  function clearHoled(b) { b.inCup = false; b.sunk = false; b.holed = false; b.potted = false; b.inWater = false; }
  function ballHoled(b) {
    if (b.inCup || b.sunk || b.holed || b.potted) return true;
    var dx = b.x - hole.cup.x, dy = b.y - hole.cup.y;
    var sp = Math.sqrt((b.vx || 0) * (b.vx || 0) + (b.vy || 0) * (b.vy || 0));
    return b.resting && sp < 4 && (dx * dx + dy * dy) < TF.CUP_R * TF.CUP_R * 0.64;
  }
  function ballInWater(b) {
    if (b.resting) return false;
    return hole.water && hole.water.length && b.y < hole.waterLevel && TF.inWater(hole, b.x);
  }
  function par() { return hole.par; }

  /* ---------------- physics step (fixed 1/60) ---------------- */
  function stepPhysics() {
    TF.simStep(hole, ball);
    if (ballHoled(ball)) { onHoled(); return; }
    if (inFlight && (ball.inWater || ballInWater(ball))) { onWater(); return; }  // sim flags inWater; game owns the penalty+reset
    if (ball.resting) { lastRest.x = ball.x; lastRest.y = ball.y; inFlight = false; }
  }

  function onHoled() {
    state = 'holed'; inFlight = false; aiming = false; drag = null; aimPts = [];
    var stars = TF.starsFor(strokes, par());
    totalStars += stars;
    var eagle = strokes <= par() - 2;
    AU.chime(eagle);
    slowT = 0.85;                                      // slow-mo on the drop
    if (eagle) petalBurst(hole.cup.x, hole.terrain.h(hole.cup.x) + 3);
    if (strokes > par() + 2) turtleJudge();
    saveRun(); saveBest();
    setTimeout(showStarsPop, 650);
    setTimeout(function () {
      hideStarsPop();
      if (mode === 'daily') showDailyResult(stars);
      else goToHole(holeIndex + 1, (runSeed + holeIndex + 1) >>> 0);
    }, 2300);
  }

  function onWater() {
    strokes++;                                         // +1 stroke penalty
    totalStrokes++;
    splashAt(ball.x, ball.y);
    AU.splash();
    ball.x = lastRest.x; ball.y = lastRest.y;          // back to previous rest
    ball.vx = 0; ball.vy = 0; ball.resting = true;
    clearHoled(ball);
    inFlight = false;
    updateHUD();
  }

  /* ---------------- shooting ---------------- */
  var MAX_DRAG_PX = 300;
  function dragVel() {
    if (!drag) return null;
    var dx = drag.x0 - drag.x1, dy = drag.y0 - drag.y1;   // screen px (y down)
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 14) return null;                            // tiny drag = cancel
    var maxDrag = Math.min(MAX_DRAG_PX, window.innerHeight * 0.45);
    var power = Math.min(len / maxDrag, 1) * TF.MAX_POWER;
    return [dx / len * power, -dy / len * power, Math.min(len / maxDrag, 1)];
  }
  function shootFromDrag() {
    var v = dragVel();
    if (!v) return;
    TF.shoot(ball, v[0], v[1]);                           // sim caps at MAX_POWER
    strokes++;
    totalStrokes++;
    inFlight = true;
    AU.thock();
    rippleAt(ball.x, ball.y);
    updateHUD();
    saveRun();
  }

  /* predicted aim arc: exact sim steps on a scratch ball — precise feel */
  function predictAim(vx, vy) {
    aimPts = [];
    try {
      var b = TF.newBall(hole);
      b.x = ball.x; b.y = ball.y; b.vx = vx; b.vy = vy; b.resting = false;
      clearHoled(b);
      var px = -9999, py = -9999, i;
      for (i = 0; i < 60; i++) {                          // ~1s of flight
        TF.simStep(hole, b);
        if (b.inCup || b.sunk || b.holed || b.potted) { aimPts.push([b.x, b.y]); break; }
        if (b.inWater) { aimPts.push([b.x, b.y]); break; }   // sim stops stepping here
        var dx = b.x - px, dy = b.y - py;                // teleport guard
        if (i > 0 && dx * dx + dy * dy > 900) break;
        px = b.x; py = b.y;
        if (i % 3 === 0) aimPts.push([b.x, b.y]);
        if (b.resting) break;
        if (b.x < -4 || b.x > hole.W + 4 || b.y < -10) break;
      }
    } catch (e) { aimPts = []; }
  }

  /* ---------------- input: drag-back slingshot anywhere on screen ---------------- */
  canvas.addEventListener('pointerdown', function (e) {
    AU.init(); AU.resume();
    if (state !== 'play' || !ball || !ball.resting) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    var r = canvas.getBoundingClientRect();
    drag = { x0: e.clientX - r.left, y0: e.clientY - r.top, x1: e.clientX - r.left, y1: e.clientY - r.top };
    aiming = true;
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!aiming || !drag) return;
    e.preventDefault();
    var r = canvas.getBoundingClientRect();
    drag.x1 = e.clientX - r.left; drag.y1 = e.clientY - r.top;
    var v = dragVel();
    if (v) predictAim(v[0], v[1]); else aimPts = [];
  });
  function endDrag() {
    if (!aiming) return;
    aiming = false; aimPts = [];
    if (drag && state === 'play' && ball && ball.resting) shootFromDrag();
    drag = null;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', function () { aiming = false; drag = null; aimPts = []; });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });

  /* ---------------- particles ---------------- */
  function rippleAt(x, y) {
    for (var i = 0; i < 3; i++) particles.push({ k: 'r', x: x, y: y, t: -i * 0.09, life: 0.55 });
  }
  function splashAt(x, y) {
    var i;
    for (i = 0; i < 14; i++) {
      var a = Math.PI * (0.15 + 0.7 * Math.random());
      particles.push({ k: 's', x: x, y: y, vx: Math.cos(a) * (3 + Math.random() * 7),
        vy: Math.sin(a) * (6 + Math.random() * 8), t: 0, life: 0.7 + Math.random() * 0.3 });
    }
    particles.push({ k: 'r', x: x, y: y, t: 0, life: 0.7 });
  }
  function petalBurst(x, y) {
    var cols = ['#ffd1dc', '#fff6f8', '#f5b81e', '#ffb3c7', '#ffffff'];
    for (var i = 0; i < 26; i++) {
      particles.push({ k: 'p', x: x + (Math.random() - 0.5) * 4, y: y + Math.random() * 2,
        vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 5,
        t: 0, life: 2 + Math.random() * 1.2, c: cols[i % cols.length],
        s: 0.35 + Math.random() * 0.4, ph: Math.random() * 6.28 });
    }
  }
  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.t += dt;
      if (p.t < 0) continue;
      if (p.t >= p.life) { particles.splice(i, 1); continue; }
      if (p.k === 's') { p.vy -= 22 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      if (p.k === 'p') { p.x += (p.vx + Math.sin(wtime * 3 + p.ph) * 1.6) * dt; p.y += p.vy * dt; p.vy = Math.min(p.vy + 1.2 * dt, 3.2); }
    }
  }
  function drawParticles() {
    var i, p, a;
    for (i = 0; i < particles.length; i++) {
      p = particles[i];
      if (p.t < 0) continue;
      var f = p.t / p.life;
      if (p.k === 'r') {
        a = 0.55 * (1 - f);
        ctx.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(X(p.x), Y(p.y) + 2, (2 + f * 26), (1 + f * 8), 0, 0, 6.2832); ctx.stroke();
      } else if (p.k === 's') {
        a = 0.9 * (1 - f);
        ctx.fillStyle = 'rgba(190,230,250,' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 2.4 * (1 - f * 0.5), 0, 6.2832); ctx.fill();
      } else if (p.k === 'p') {
        a = Math.min(1, (1 - f) * 2);
        ctx.save();
        ctx.translate(X(p.x), Y(p.y));
        ctx.rotate(p.ph + wtime * 2);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.ellipse(0, 0, p.s * sc * 0.9, p.s * sc * 0.55, 0, 0, 6.2832); ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
  }

  /* ---------------- render ---------------- */
  function render() {
    var B = biome(), i, x;
    // sky
    if (!skyGrad) {
      skyGrad = ctx.createLinearGradient(0, 0, 0, ch);
      skyGrad.addColorStop(0, B.skyTop); skyGrad.addColorStop(1, B.skyBot);
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, cw, ch);
    // night stars
    if (curBiome === 3) {
      for (i = 0; i < nightStars.length; i++) {
        var st = nightStars[i];
        ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + 0.35 * Math.sin(wtime * 1.5 + st.tw)).toFixed(3) + ')';
        ctx.fillRect(st.x, st.y, st.r, st.r);
      }
    }
    // sun / moon
    ctx.fillStyle = B.sun;
    ctx.globalAlpha = curBiome === 3 ? 0.95 : 0.9;
    ctx.beginPath(); ctx.arc(cw * 0.78, ch * (1 - B.sunY) * 0.9 + ch * 0.05, curBiome === 3 ? 26 : 34, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
    if (curBiome === 3) {   // moon crater shading
      ctx.fillStyle = 'rgba(180,195,220,.5)';
      ctx.beginPath(); ctx.arc(cw * 0.78 - 8, ch * (1 - B.sunY) * 0.9 + ch * 0.05 - 4, 6, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.arc(cw * 0.78 + 7, ch * (1 - B.sunY) * 0.9 + ch * 0.05 + 8, 4, 0, 6.2832); ctx.fill();
    }
    if (!hole) return;

    // terrain silhouette
    var N = 160;
    ctx.beginPath();
    ctx.moveTo(X(0), Y(hole.terrain.h(0)));
    for (i = 1; i <= N; i++) { x = hole.W * i / N; ctx.lineTo(X(x), Y(hole.terrain.h(x))); }
    ctx.lineTo(X(hole.W), Y(-6)); ctx.lineTo(X(0), Y(-6)); ctx.closePath();
    ctx.fillStyle = B.terrain; ctx.fill();
    // clean darker top edge
    ctx.beginPath();
    ctx.moveTo(X(0), Y(hole.terrain.h(0)));
    for (i = 1; i <= N; i++) { x = hole.W * i / N; ctx.lineTo(X(x), Y(hole.terrain.h(x))); }
    ctx.strokeStyle = B.terrainDark; ctx.lineWidth = Math.max(2, sc * 0.35); ctx.stroke();

    // sand patches: speckled overlay
    if (hole.sand) {
      for (var sIdx = 0; sIdx < hole.sand.length; sIdx++) {
        var p = hole.sand[sIdx];
        ctx.beginPath();
        ctx.moveTo(X(p.x0), Y(hole.terrain.h(p.x0)));
        for (i = 1; i <= 24; i++) { x = p.x0 + (p.x1 - p.x0) * i / 24; ctx.lineTo(X(x), Y(hole.terrain.h(x))); }
        for (i = 24; i >= 0; i--) { x = p.x0 + (p.x1 - p.x0) * i / 24; ctx.lineTo(X(x), Y(hole.terrain.h(x) - 1.4)); }
        ctx.closePath();
        ctx.fillStyle = B.sand; ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = B.sandDot;
      for (i = 0; i < speckles.length; i++) {
        var sp2 = speckles[i];
        ctx.beginPath(); ctx.arc(X(sp2.x), Y(sp2.y), sp2.r * sc * 0.5, 0, 6.2832); ctx.fill();
      }
    }

    // water: animated in the dips
    if (hole.water) {
      for (var wIdx = 0; wIdx < hole.water.length; wIdx++) {
        var wp = hole.water[wIdx];
        ctx.beginPath();
        for (i = 0; i <= 24; i++) {
          x = wp.x0 + (wp.x1 - wp.x0) * i / 24;
          var wy = hole.waterLevel + Math.sin(wtime * 2.2 + x * 0.9) * 0.18;
          if (i === 0) ctx.moveTo(X(x), Y(wy)); else ctx.lineTo(X(x), Y(wy));
        }
        for (i = 24; i >= 0; i--) {
          x = wp.x0 + (wp.x1 - wp.x0) * i / 24;
          ctx.lineTo(X(x), Y(Math.min(hole.terrain.h(x), hole.waterLevel) - 1.6));
        }
        ctx.closePath();
        ctx.fillStyle = B.water; ctx.globalAlpha = 0.94; ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = B.waterTop; ctx.lineWidth = 2;
        ctx.beginPath();
        for (i = 0; i <= 24; i++) {
          x = wp.x0 + (wp.x1 - wp.x0) * i / 24;
          wy = hole.waterLevel + Math.sin(wtime * 2.2 + x * 0.9) * 0.18;
          if (i === 0) ctx.moveTo(X(x), Y(wy)); else ctx.lineTo(X(x), Y(wy));
        }
        ctx.stroke();
      }
    }

    // cup + flag
    var cupGY = hole.terrain.h(hole.cup.x);
    var cupRX = TF.CUP_R * sc * 1.7;
    ctx.fillStyle = 'rgba(20,16,12,.9)';
    ctx.beginPath(); ctx.ellipse(X(hole.cup.x), Y(cupGY) + 1, cupRX, cupRX * 0.36, 0, 0, 6.2832); ctx.fill();
    var poleH = 9 * sc;
    ctx.strokeStyle = '#f5f2e8'; ctx.lineWidth = Math.max(2, sc * 0.28);
    ctx.beginPath(); ctx.moveTo(X(hole.cup.x), Y(cupGY)); ctx.lineTo(X(hole.cup.x), Y(cupGY) - poleH); ctx.stroke();
    var wave = Math.sin(wtime * 3.1) * sc * 0.55;
    ctx.fillStyle = B.flag;
    ctx.beginPath();
    ctx.moveTo(X(hole.cup.x), Y(cupGY) - poleH);
    ctx.lineTo(X(hole.cup.x) + sc * 3.4, Y(cupGY) - poleH + sc * 1.1 + wave * 0.4);
    ctx.lineTo(X(hole.cup.x), Y(cupGY) - poleH + sc * 2.2);
    ctx.closePath(); ctx.fill();

    drawTurtle();

    // ball + soft shadow (no shadowBlur: plain alpha ellipse)
    if (ball && state !== 'menu') {
      var gy = hole.terrain.h(Math.max(0, Math.min(hole.W, ball.x)));
      var hgt = Math.max(0, ball.y - gy);
      var shA = Math.max(0.04, 0.32 - hgt * 0.018);
      ctx.fillStyle = 'rgba(20,20,20,' + shA.toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(X(ball.x), Y(gy) + 2, TF.BALL_R * sc * (1 + hgt * 0.02), TF.BALL_R * sc * 0.42, 0, 0, 6.2832);
      ctx.fill();
      var br = Math.max(3, TF.BALL_R * sc);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(X(ball.x), Y(ball.y), br, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(X(ball.x), Y(ball.y), br, 0, 6.2832); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.arc(X(ball.x) - br * 0.3, Y(ball.y) - br * 0.3, br * 0.28, 0, 6.2832); ctx.fill();
    }

    drawParticles();

    // aim: dotted predicted arc + power ring
    if (aiming && drag && aimPts.length) {
      var v = dragVel();
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      for (i = 0; i < aimPts.length; i++) {
        ctx.globalAlpha = 0.9 - (i / aimPts.length) * 0.65;
        ctx.beginPath(); ctx.arc(X(aimPts[i][0]), Y(aimPts[i][1]), 2.4, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (v) {
        ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(X(ball.x), Y(ball.y), br2(v[2]), 0, 6.2832); ctx.stroke();
      }
    }
  }
  function br2(frac) { return Math.max(6, TF.BALL_R * sc) + frac * 26; }

  /* ---------------- main loop: fixed-timestep accumulator ---------------- */
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!running || document.hidden) return;
    var dt = Math.min(((ts - last) / 1000) || 0.016, 0.1);   // clamp
    last = ts;
    if (slowT > 0) { slowT -= dt; timeScale = 0.3; } else timeScale = 1;
    wtime += dt;
    if (state === 'play' && hole && ball) {
      acc += dt * timeScale;
      var n = 0;
      while (acc >= STEP && n < 8) { stepPhysics(); acc -= STEP; n++; if (state !== 'play') { acc = 0; break; } }
      if (n === 8) acc = 0;
    }
    updateTurtle(dt);
    updateParticles(dt * timeScale);
    // roll bed follows ball speed
    if (AU.ctx && AU.rollGain) {
      var spd = ball && !ball.resting ? Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) : 0;
      var gy2 = ball ? hole.terrain.h(Math.max(0, Math.min(hole.W, ball.x))) : 0;
      var near = ball && (ball.y - gy2) < TF.BALL_R * 3;
      var target = (spd > 1.5 && near) ? Math.min(spd / 30, 1) * 0.10 : 0;
      var g = AU.rollGain.gain;
      g.value += (target - g.value) * 0.25;
    }
    render();
  }

  /* ---------------- HUD / popups / transitions ---------------- */
  function updateHUD() {
    if (!hole) return;
    var hn = 'Hole ' + holeIndex + (holeNameStr ? ' · ' + holeNameStr : '');
    $('hud-hole').textContent = hn;
    var m = 'PAR ' + par() + ' · ' + strokes + (strokes === 1 ? ' STROKE' : ' STROKES');
    if (mode === 'endless') m += ' · Σ ' + totalStrokes + ' · ★ ' + totalStars;
    else m += ' · ★ ' + totalStars;
    $('hud-meta').textContent = m;
  }
  function scoreLabel(s, p) {
    if (s === 1) return 'Hole in one!';
    if (s <= p - 3) return 'Albatross!';
    if (s === p - 2) return 'Eagle!';
    if (s === p - 1) return 'Birdie!';
    if (s === p) return 'Par';
    if (s === p + 1) return 'Bogey';
    return '+' + (s - p);
  }
  function showStarsPop() {
    var stars = TF.starsFor(strokes, par()), i, h = '';
    for (i = 0; i < 3; i++) h += i < stars ? '★' : '<span class="dim">★</span>';
    $('stars-pop-stars').innerHTML = h;
    $('stars-pop-label').textContent = scoreLabel(strokes, par());
    $('stars-pop').classList.add('show');
  }
  function hideStarsPop() { $('stars-pop').classList.remove('show'); }

  function goToHole(n, s) {
    var tr = $('transit');
    $('transit-hole').textContent = 'HOLE ' + n;
    $('transit-name').textContent = '';
    tr.classList.remove('out');
    tr.classList.add('in');
    setTimeout(function () {
      loadHole(n, s);
      state = 'play';
      saveRun();                                       // persist the new hole so reload resumes here
      tr.classList.remove('in');
      tr.classList.add('out');
      setTimeout(function () {
        tr.style.transition = 'none';
        tr.classList.remove('out');
        void tr.offsetWidth;
        tr.style.transition = '';
      }, 480);
    }, 500);
  }

  /* ---------------- silent AI hole names (gamez-ai pattern) ---------------- */
  var AI_URL = 'https://gamez-ai.chaoticutopia84.workers.dev/g';
  var nameCache = {};
  var NAME_FALLBACKS = [
    'Whispering Dune', 'Still Morning', 'Pale Green', 'Quiet Slope', 'Amber Hollow',
    'Soft Breeze', 'Distant Pin', 'Low Sun', 'Gentle Rise', 'Calm Hollow',
    'Silver Dew', 'Long Shadow', 'Warm Hollow', 'Patient Green', 'Faint Trail',
    'Mellow Hill', 'Drowsy Vale', 'Clear Pond', 'Silent Meadow', 'Amber Light',
    'Slow Cloud', 'Tender Slope', 'Hushed Green', 'Golden Hour'
  ];
  function aiPost(body, cb) {
    var done = false;
    var timer = setTimeout(function () { fin(null); }, 7000);
    function fin(t) { if (done) return; done = true; clearTimeout(timer); cb(t); }
    try {
      fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); })
        .then(function (d) { fin(d && d.text ? String(d.text).slice(0, 40) : null); })
        .catch(function () { fin(null); });
    } catch (e) { fin(null); }
  }
  function holeName(n, cb) {
    if (nameCache[n]) { cb(nameCache[n]); return; }
    cb(NAME_FALLBACKS[n % NAME_FALLBACKS.length]);      // instant local fallback
    aiPost({ kind: 'fairway', game: 'tiny-fairway', ctx: { hole: n } }, function (t) {
      if (!t) return;                                   // worker kind may not exist yet — fine
      nameCache[n] = t;
      cb(t);
    });
  }

  /* ---------------- daily (gamez-arcade pattern, local fallback) ---------------- */
  var ARCADE = 'https://gamez-arcade.chaoticutopia84.workers.dev';
  function arcadeFetch(path, body, cb) {
    var done = false;
    var timer = setTimeout(function () { fin(new Error('timeout')); }, 12000);
    function fin(e, d) { if (done) return; done = true; clearTimeout(timer); cb(e, d); }
    try {
      fetch(ARCADE + path, body ?
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
        .then(function (r) { return r.json(); })
        .then(function (d) { fin(null, d); })
        .catch(function (e) { fin(e); });
    } catch (e) { fin(e); }
  }
  function todayStr() {
    var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function fetchDaily(cb) {
    arcadeFetch('/daily?game=tiny-fairway', null, function (err, d) {
      var ds = todayStr();
      var s = (d && d.seed != null) ? (d.seed >>> 0) : TF.dailySeed(ds);
      dailyInfo = { date: (d && d.date) || ds, seed: s };
      updateDailySub();
      if (cb) cb();
    });
  }
  function updateDailySub() {
    var sub = $('daily-sub');
    if (!sub || !dailyInfo) return;
    var best = '';
    try {
      var dd = JSON.parse(lsGet('tf_daily', '{}'));
      if (dd[dailyInfo.date] != null) best = ' · your best ' + dd[dailyInfo.date];
    } catch (e) {}
    sub.textContent = dailyInfo.date + ' · same hole worldwide' + best;
  }

  /* ---------------- arcade: daily leaderboard (fails silently) ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function renderBoard(top, rank, me, strokes) {
    var box = $('arc-lb');
    var h = '';
    if (rank > 0) h += '<div class="arc-lb-rank">GLOBAL #' + rank + '!</div>';
    h += '<div class="arc-lb-title">🏆 DAILY FEWEST STROKES</div>';
    if (top && top.length) {
      var medals = ['🥇', '🥈', '🥉'];
      h += top.slice(0, 5).map(function (e, i) {
        return '<div class="arc-lb-row' + (e.name === me ? ' me' : '') + '"><span>' +
          (medals[i] || (i + 1) + '.') + ' ' + esc(e.name) + '</span><b>' +
          Math.max(0, 3600 - e.score) + '</b></div>';
      }).join('');
    } else {
      h += '<div class="arc-lb-empty">Leaderboard offline — your ' + strokes + ' stands.</div>';
    }
    box.innerHTML = h;
  }
  function submitDaily(strokes) {
    var box = $('arc-lb');
    if (!box || !dailyInfo) return;
    var board = 'daily-' + dailyInfo.date;
    var score = Math.max(1, 3600 - Math.min(strokes, 3599));
    var name = (lsGet('arcade_name', '') || '').trim();
    function go(n) {
      box.innerHTML = '<div class="arc-lb-empty">🏆 sending…</div>';
      arcadeFetch('/score', { game: 'tiny-fairway', board: board, name: n, score: score }, function (err, res) {
        if (res && res.top) renderBoard(res.top, res.rank, n, strokes);
        else arcadeFetch('/scores?game=tiny-fairway&board=' + encodeURIComponent(board), null, function (e2, d2) {
          renderBoard(d2 && d2.top, 0, n, strokes);
        });
      });
    }
    if (name) { go(name); return; }
    box.innerHTML = '<div class="arc-lb-form"><input id="arc-lb-name" maxlength="12" placeholder="YOUR NAME" autocomplete="off">' +
      '<button id="arc-lb-go" class="btn" type="button" style="width:auto;padding:10px 16px">SAVE</button></div>';
    $('arc-lb-go').onclick = function () {
      var v = $('arc-lb-name').value.trim().slice(0, 12);
      if (!v) return;
      lsSet('arcade_name', v);
      go(v);
    };
  }
  function showDailyResult(stars) {
    state = 'result';
    var h = '', i;
    for (i = 0; i < 3; i++) h += i < stars ? '★' : '<span class="dim">★</span>';
    $('result-stars').innerHTML = h;
    $('result-title').textContent = scoreLabel(strokes, par());
    $('result-sub').textContent = strokes + (strokes === 1 ? ' stroke' : ' strokes') +
      ' · par ' + par() + ' · ' + (dailyInfo ? dailyInfo.date : todayStr());
    try {
      var dd = JSON.parse(lsGet('tf_daily', '{}'));
      var dk = dailyInfo ? dailyInfo.date : todayStr();
      if (dd[dk] == null || strokes < dd[dk]) { dd[dk] = strokes; lsSet('tf_daily', JSON.stringify(dd)); }
    } catch (e) {}
    $('result').classList.add('on');
    $('hud').hidden = true;
    submitDaily(strokes);
    updateDailySub();
  }

  /* ---------------- menu / flow ---------------- */
  function startPlay() {
    $('menu').classList.remove('on');
    $('result').classList.remove('on');
    $('hud').hidden = false;
    state = 'play';
    running = true;
    last = performance.now();
  }
  function startEndless() {
    AU.init(); AU.click();
    mode = 'endless';
    var save = loadRun();
    if (save && save.runSeed != null) {
      runSeed = save.runSeed >>> 0;
      totalStrokes = save.totalStrokes || 0;
      totalStars = save.totalStars || 0;
      loadHole(save.holeIndex || 1, (runSeed + (save.holeIndex || 1)) >>> 0);
    } else {
      runSeed = (Math.random() * 4294967296) >>> 0;
      totalStrokes = 0; totalStars = 0;
      loadHole(1, (runSeed + 1) >>> 0);
    }
    startPlay();
  }
  function startDaily() {
    AU.init(); AU.click();
    function go() {
      mode = 'daily';
      totalStrokes = 0; totalStars = 0;
      loadHole(1, dailyInfo.seed);
      startPlay();
    }
    if (!dailyInfo) {
      $('daily-sub').textContent = 'fetching today’s hole…';
      fetchDaily(go);
    } else go();
  }
  function refreshMenu() {
    var save = loadRun();
    $('endless-sub').textContent = save ? ('resume hole ' + (save.holeIndex || 1) + ' · Σ ' + (save.totalStrokes || 0)) : 'fresh fairway, infinite holes';
    $('btn-newrun').hidden = !save;
    var best = null;
    try { best = JSON.parse(lsGet('tf_best', 'null')); } catch (e) {}
    $('menu-best').textContent = best ?
      ('Best run: ' + best.holes + ' holes · ' + best.strokes + ' strokes · ' + (best.stars || 0) + ' ★') :
      'No runs yet — the fairway awaits.';
    updateDailySub();
  }

  $('btn-endless').addEventListener('click', startEndless);
  $('btn-daily').addEventListener('click', startDaily);
  $('btn-newrun').addEventListener('click', function () {
    AU.click();
    try { localStorage.removeItem('tf_run'); } catch (e) {}
    refreshMenu();
  });
  $('btn-how').addEventListener('click', function () {
    AU.init(); AU.click();
    var h = $('howto'); h.hidden = !h.hidden;
  });
  $('btn-menu').addEventListener('click', function () {
    AU.click();
    state = 'menu';
    running = false;
    $('result').classList.remove('on');
    $('menu').classList.add('on');
    refreshMenu();
  });
  $('menu-logo').addEventListener('click', function () {   // tiny easter egg: tap the flag
    AU.init();
    for (var i = 0; i < 10; i++) AU.blip(400 + Math.random() * 600, 300, 0.12, 0.06, 'triangle');
  });

  /* ---------------- lifecycle ---------------- */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { AU.suspend(); }
    else { AU.resume(); last = performance.now(); acc = 0; }
  });

  /* ---------------- boot ---------------- */
  resize();
  refreshMenu();
  fetchDaily();                       // prefetch today's hole in the background
  // idle menu backdrop: render hole 1 of a demo seed behind the menu
  try {
    hole = TF.genHole(1234567);
    curBiome = 0;
    ball = TF.newBall(hole); ball.resting = true;
    fit(); buildSpeckles(); buildNightStars(); initTurtle();
    running = true; last = performance.now();
  } catch (e) {}
  requestAnimationFrame(loop);
  window.TF_DEBUG = { loadHole: loadHole, getState: function () { return { state: state, strokes: strokes, ball: ball }; } };
})();
