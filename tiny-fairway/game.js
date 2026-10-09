/* Tiny Fairway — top-down one-touch golf.
 *
 * The whole hole is visible at once: read the slope arrows, drag back
 * anywhere to aim (the dotted path bends with the break), release to shoot.
 * Pure TF sim underneath; this file is input + render + meta only. */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function showErr(m) { var e = $('err'); e.hidden = false; e.textContent = m; }
  window.addEventListener('error', function (ev) { showErr('Error: ' + (ev.message || ev.type)); });

  /* ---------------- canvas / viewport ---------------- */
  var canvas = $('game'), ctx = canvas.getContext('2d');
  var cw = 0, ch = 0, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = window.innerWidth; ch = window.innerHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fit();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });

  /* ---------------- world -> screen (whole hole always visible) ---------------- */
  var sc = 6, ox = 0, oy = 0;
  function fit() {
    var topPad = 84;   // HUD lives here
    sc = Math.min(cw / (TF.W + 5), (ch - topPad - 16) / (TF.H + 4));
    ox = (cw - TF.W * sc) / 2;
    oy = topPad + ((ch - topPad - 16) - TF.H * sc) / 2;
  }
  function X(x) { return ox + x * sc; }
  function Y(y) { return oy + (TF.H - y) * sc; }   // world y-up -> screen y-down

  /* ---------------- biomes: top-down grass palettes ----------------
   * 0 dawn meadow, 1 desert noon, 2 dusk, 3 moonlit snow */
  var BIOMES = [
    { wind: 520, rough: '#4a7c3f', fairA: '#63a04b', fairB: '#5a9443',
      green: '#71b257', greenDark: '#548a41', sand: '#e0c98f', sandDot: '#c6a96f',
      water: '#5fa8c9', waterTop: '#cfeaf7', tree: '#2e5b2a', treeDark: '#1f3d1c',
      speck: 'rgba(30,60,25,', cup: '#20301c' },
    { wind: 640, rough: '#b5975a', fairA: '#9fb45c', fairB: '#92a854',
      green: '#adc46a', greenDark: '#82993f', sand: '#eed9a0', sandDot: '#d3b878',
      water: '#4f9ec4', waterTop: '#c4e6f5', tree: '#4a6b2f', treeDark: '#33491f',
      speck: 'rgba(120,90,40,', cup: '#3a2c14' },
    { wind: 430, rough: '#5e4f6b', fairA: '#7d8a4d', fairB: '#718046',
      green: '#8aa45c', greenDark: '#647c3e', sand: '#d9bd85', sandDot: '#b8985f',
      water: '#4a6f9e', waterTop: '#b9d4ea', tree: '#37452e', treeDark: '#232d1d',
      speck: 'rgba(30,25,45,', cup: '#241c2e' },
    { wind: 700, rough: '#a9b9cf', fairA: '#ccd8e8', fairB: '#c0cde0',
      green: '#d9e5f3', greenDark: '#aebfd6', sand: '#e6e0d0', sandDot: '#c9c2ae',
      water: '#6f9ecf', waterTop: '#d8e9f8', tree: '#5c6e80', treeDark: '#3d4a57',
      speck: 'rgba(90,110,140,', cup: '#2c3a4e' }
  ];
  function biome() { return BIOMES[curBiome]; }

  /* ---------------- audio (WebAudio, gesture-gated) ---------------- */
  var AU = {
    ctx: null, master: null, windFilter: null, windGain: null, rollGain: null, rollFilter: null, noiseBuf: null,
    muted: false, windMuted: false,
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
          this.rollFilter = bp;   // surface-aware roll ticks retune this
          this.rollGain = this.ctx.createGain(); this.rollGain.gain.value = 0;
          r.connect(bp); bp.connect(this.rollGain); this.rollGain.connect(this.master);
          r.start();
          if (this.muted) this.master.gain.value = 0;
          if (this.windMuted) this.windGain.gain.value = 0;
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
    thock: function (frac) {
      var f = frac == null ? 0.5 : Math.max(0, Math.min(1.25, frac));
      this.blip(150 + f * 110, 60, 0.09 + f * 0.05, 0.22 + f * 0.22, 'triangle');
      this.noise(0.06, 0.14 + f * 0.1, 2400, 900, 'highpass');
    },
    clunk: function () {   // disproportionately satisfying cup drop
      this.noise(0.08, 0.4, 3200, 500, 'lowpass');
      this.blip(300, 110, 0.16, 0.5, 'triangle');
      this.blip(880, 840, 0.55, 0.14);
      var self = this;
      setTimeout(function () { self.blip(1174.7, 1170, 0.7, 0.10); }, 90);
    },
    setMuted: function (m) {
      this.muted = m;
      try { if (this.master) this.master.gain.value = m ? 0 : 0.9; } catch (e) {}
    },
    setWindMuted: function (m) {
      this.windMuted = m;
      try { if (this.windGain) this.windGain.gain.value = m ? 0 : 0.035; } catch (e) {}
    },
    chime: function (big) {
      var self = this;
      this.blip(659.26, 655, 1.0, 0.16);
      setTimeout(function () { self.blip(830.61, 826, 1.1, 0.16); }, 130);
      if (big) setTimeout(function () { self.blip(1318.5, 1310, 1.3, 0.13); }, 260);
    },
    splash: function () { this.noise(0.35, 0.22, 1500, 260, 'lowpass'); },
    click: function () { this.blip(520, 480, 0.07, 0.10, 'triangle'); }
  };

  /* ---------------- haptics: minimal vibration vocabulary ---------------- */
  var RM = false;
  try { RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
  var HAP = {
    supported: ('vibrate' in navigator),
    enabled: true,
    init: function () {
      this.enabled = lsGet('tf_haptic', 'on') === 'on';
      var b = $('btn-haptic');
      if (!b) return;
      if (!this.supported) { b.hidden = true; return; }
      this.paint();
    },
    ok: function () { return this.supported && this.enabled && !RM; },
    buzz: function (pat) {
      if (!this.ok()) return;
      try { navigator.vibrate(pat); } catch (e) {}
    },
    toggle: function () {
      this.enabled = !this.enabled;
      lsSet('tf_haptic', this.enabled ? 'on' : 'off');
      this.paint();
      toast(this.enabled ? 'Haptics on' : 'Haptics off');
    },
    paint: function () {
      var b = $('btn-haptic'), s = $('haptic-state');
      if (b) b.setAttribute('aria-pressed', this.enabled ? 'true' : 'false');
      if (s) s.textContent = this.enabled ? 'On' : 'Off';
    }
  };

  /* ---------------- state ---------------- */
  var STEP = 1 / 60;
  var state = 'menu';           // menu | play | holed | result
  var mode = 'tour';             // tour | daily
  var holeIndex = 1, runSeed = 0, seed = 1;
  var hole = null, ball = null, curBiome = 0;
  var strokes = 0, totalStrokes = 0, totalStars = 0;
  var inFlight = false, aiming = false, drag = null;
  var lastRest = { x: 0, y: 0 };
  var slowT = 0, timeScale = 1, acc = 0, last = 0, running = false;
  var simTime = 0;   // sim seconds; drives windmill blades + gusts (deterministic)
  var wtime = 0;
  var dailyInfo = null;
  var holeNameStr = '';
  var particles = [];
  var turtle = null;
  var speckles = [];
  var aimPts = [];
  // revamp state
  var spinVal = 0, spinPointer = null, spinBase = 0, spinStartY = 0;  // Golf-on-Mars spin
  var ghost = null;                 // last-shot landing marker (SSG3)
  var undoSnap = null;              // one-deep undo snapshot
  var trail = [];                   // ball trail points {x,y,t}
  var holeScores = [];              // completed-hole strokes (endless), for rolling avg
  var prevKiller = false;           // previous hole was par+3 or worse -> breather next
  var maxHole = 1;                  // furthest hole reached (trail unlocks)
  var trailSel = 'Cloud';           // selected trail color name
  var toastTimer = 0;
  var isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  /* ---- new systems: curve, sway, power-ups, race, map, morph ---- */
  var curveDrag = null;        // {pid, x0} post-shot curve drag (SSG3)
  var dragStillT = 0;          // seconds the aim drag has been held still
  var swayAmp = 0;             // 0 = focused (no sway), 1 = full sway
  var aimLand = null;          // predicted landing spot {x,y,air} from predictAim
  var POW = { brake: 2, sticky: 2, mulligan: 2 };
  var armedPow = 'brake';
  var POW_ICON = { brake: '◼', sticky: '◉', mulligan: '↺' };
  var POW_NAME = { brake: 'Air-brake', sticky: 'Sticky ball', mulligan: 'Mulligan' };
  var holeStartTotal = 0;      // totalStrokes at hole start (mulligan rewind)
  var seenMechs = {};          // mechanic -> times seen (intro grammar, endless only)
  var biomeStars = { 0: 0, 1: 0, 2: 0, 3: 0 };
  var relicCount = 0;
  var morphT = 0, morphNext = null;   // hole-to-hole morph transition (Wonderputt)
  var race = null;             // race state or null
  var BIOME_NAMES = ['Meadow', 'Savanna', 'Duskwood', 'Frost'];
  var MECH_HINTS = {
    windmill: 'Windmill ahead — thread the blades, or play around the hub.',
    ramp: 'Ramp ahead — hit it with speed to launch over trouble.',
    water: 'Water ahead — carry it or take the safe route around.',
    dunes: 'Dunes ahead — slopes feed the ball downhill. Read the arrows.',
    walls: 'Banked walls ahead — bounce your shot around the corner.',
    portal: 'Warp portal — roll in and pop out the other side.',
    pad: 'Dash pad — the chevrons kick the ball faster. Mind the overshoot.',
    cannon: 'Cannon ahead — roll into the mouth and enjoy the flight.',
    tube: 'Transport tube — dive in, ride the pipe, pop out the exit.',
    belt: 'Conveyor belt — it carries the ball. Time your arrival.',
    fan: 'Wind fan — a local gust shoves everything in its cone.',
    well: 'Gravity well — it bends shots around it. Slingshot the edge.',
    loop: 'Loop-the-loop — bring speed or you\u2019ll roll back out.',
    table: 'Turntable — ride the disc, mind where it flings you.',
    lift: 'Ball elevator — ride it up and over to the far side.'
  };
  function loadPow() {
    try {
      var p = JSON.parse(lsGet('tf_pow', 'null'));
      if (p) POW = { brake: p.brake | 0, sticky: p.sticky | 0, mulligan: p.mulligan | 0 };
      seenMechs = JSON.parse(lsGet('tf_mechs', '{}')) || {};
      var bs = JSON.parse(lsGet('tf_biomestars', 'null'));
      if (bs) biomeStars = bs;
      relicCount = parseInt(lsGet('tf_relics_n', '0'), 10) || 0;
      var ap = lsGet('tf_armed', 'brake');
      if (POW_ICON[ap]) armedPow = ap;
    } catch (e) {}
  }
  function savePow() {
    lsSet('tf_pow', JSON.stringify(POW));
    lsSet('tf_mechs', JSON.stringify(seenMechs));
    lsSet('tf_biomestars', JSON.stringify(biomeStars));
    lsSet('tf_relics_n', String(relicCount));
    lsSet('tf_armed', armedPow);
  }

  /* ---------------- storage ---------------- */
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function saveRun() {
    if (mode !== 'tour') return;
    lsSet('tf_run', JSON.stringify({ mode: 'tour', holeIndex: holeIndex, totalStrokes: totalStrokes,
      totalStars: totalStars, holeScores: holeScores.slice(-50) }));
  }
  function loadRun() { try { return JSON.parse(lsGet('tf_run', 'null')); } catch (e) { return null; } }
  function saveBest() {
    if (mode !== 'tour') return;
    try {
      var b = JSON.parse(lsGet('tf_best', 'null'));
      if (!b || holeIndex > b.holes || (holeIndex === b.holes && totalStrokes < b.strokes))
        lsSet('tf_best', JSON.stringify({ holes: holeIndex, strokes: totalStrokes, stars: totalStars }));
    } catch (e) {}
  }

  function recordScore(s) {
    holeScores.push(s);
    if (holeScores.length > 60) holeScores.splice(0, holeScores.length - 60);
  }

  /* ---------------- hole setup ---------------- */
  var seenHint = {};
  function loadHole(n, s, opts) {
    holeIndex = n; seed = (s || 0) >>> 0;
    if (mode === 'tour') {
      // the designed tour: 20 hand-built holes, same for everyone
      var spec = TF.HOLES[(n - 1) % TF.HOLES.length];
      hole = TF.makeHole(spec, n - 1);
      seed = hole.seed;
      curBiome = hole.biome;
    } else {
      hole = TF.genHole(seed, opts);
      curBiome = Math.floor((holeIndex - 1) / 8) % 4;
    }
    simTime = 0;   // blades + gusts restart deterministically per hole
    document.body.setAttribute('data-biome', String(curBiome));
    AU.setBiome(curBiome);
    ball = TF.newBall(hole);
    ball.vx = 0; ball.vy = 0; ball.resting = true;
    clearHoled(ball);
    strokes = 0; inFlight = false; aiming = false; drag = null; aimPts = [];
    spinVal = 0; spinPointer = null; ghost = null; undoSnap = null; trail = [];
    if (n > maxHole) { maxHole = n; lsSet('tf_maxhole', String(maxHole)); }
    lastRest = { x: ball.x, y: ball.y };
    particles = [];
    holeStartTotal = totalStrokes;
    curveDrag = null; aimLand = null; dragStillT = 0; swayAmp = 0;
    // designed-tour hints: each hole teaches its own lesson, once per run
    if (mode === 'tour' && hole.hint && !seenHint[n]) {
      seenHint[n] = 1;
      (function (h, hn) {
        setTimeout(function () { if (holeIndex === hn) toast(h, 3600); }, 900);
      })(hole.hint, n);
    }
    if (mode === 'tour' && n === 10) setTimeout(function () { toast('Halfway home — 10 down, 10 to go.'); }, 3600);
    if (mode === 'tour' && n === 20) setTimeout(function () { toast('The final hole. Make it count.'); }, 3600);
    fit();
    buildSpeckles(); initTurtle();
    holeNameStr = '';
    holeName(holeIndex, function (nm) {
      if (holeIndex !== n) return;
      holeNameStr = nm;
      if (state === 'play' || state === 'holed') updateHUD();
      var tr = $('transit');
      if (tr && tr.classList.contains('in')) $('transit-name').textContent = nm;
    });
    updateHUD();
    milestoneCheck(n);
  }

  // static decoration speckles: rough grass texture + sand dots (seeded per hole)
  function buildSpeckles() {
    speckles = [];
    var rng = TF.mulberry32((seed ^ 0x51ab) >>> 0), i;
    for (i = 0; i < 130; i++) {
      speckles.push({ x: rng() * TF.W, y: rng() * TF.H, r: 0.8 + rng() * 1.6,
                      a: 0.05 + rng() * 0.08, k: 'g' });
    }
    for (i = 0; i < hole.sand.length; i++) {
      var e = hole.sand[i];
      for (var j = 0; j < 26; j++) {
        var a = rng() * 6.2832, rr = Math.sqrt(rng());
        speckles.push({ x: e.x + Math.cos(a) * rr * e.rx * 0.85,
                        y: e.y + Math.sin(a) * rr * e.ry * 0.85,
                        r: 0.5 + rng() * 0.9, a: 0.25 + rng() * 0.25, k: 's' });
      }
    }
  }

  /* ---------------- the turtle (required creative touch) ----------------
   * Wanders the course, can never be hit (always ambles clear of the ball),
   * and judges you with a slow blink after a bad hole. */
  function initTurtle() {
    turtle = null;
    var rng = TF.mulberry32((seed ^ 0x77aa) >>> 0);
    if (rng() >= 0.55) return;                       // not every hole gets a turtle
    var p = turtleSpot(rng);
    if (!p) return;
    turtle = { x: p.x, y: p.y, ang: rng() * 6.2832, speed: 1.6 + rng() * 0.8,
               tx: p.x, ty: p.y, pause: 0, judge: false, judgeT: 0,
               blinkT: 2 + rng() * 3, blink: 0, rng: rng };
  }
  function turtleSpot(rng) {
    for (var i = 0; i < 20; i++) {
      var x = 6 + rng() * (TF.W - 12), y = 12 + rng() * (TF.H - 20);
      var s = TF.surfaceAt(hole, x, y);
      if (s !== 'fairway' && s !== 'green' && s !== 'rough') continue;
      if (Math.hypot(x - hole.cup.x, y - hole.cup.y) < 8) continue;
      if (Math.hypot(x - ball.x, y - ball.y) < 10) continue;
      if (hole.windmill && Math.hypot(x - hole.windmill.x, y - hole.windmill.y) <
          hole.windmill.bladeLen + hole.windmill.hubR + 3) continue;  // ducks the windmill
      return { x: x, y: y };
    }
    return null;
  }
  function updateTurtle(dt) {
    if (!turtle) return;
    var t = turtle;
    if (t.judge) {
      t.judgeT += dt;
      if (t.judgeT > 6) { t.judge = false; }
    }
    // blink cycle
    t.blinkT -= dt;
    if (t.blinkT <= 0) { t.blink = 0.22; t.blinkT = 2.5 + t.rng() * 4; }
    if (t.blink > 0) t.blink -= dt;
    // never under the ball: amble away when it gets close and is moving
    var bd = Math.hypot(ball.x - t.x, ball.y - t.y);
    var bSpd = Math.hypot(ball.vx, ball.vy);
    var mvx = 0, mvy = 0, moving = false;
    if (bd < 5 && bSpd > 2) {
      mvx = (t.x - ball.x) / (bd || 1); mvy = (t.y - ball.y) / (bd || 1);
      moving = true;
      var nx = t.x + mvx * t.speed * 2.2 * dt, ny = t.y + mvy * t.speed * 2.2 * dt;
      var ns = TF.surfaceAt(hole, nx, ny);
      if (ns === 'fairway' || ns === 'green' || ns === 'rough') { t.x = nx; t.y = ny; }
      t.ang = Math.atan2(mvy, mvx);
    } else if (t.pause > 0) {
      t.pause -= dt;
    } else {
      var dx = t.tx - t.x, dy = t.ty - t.y, d = Math.hypot(dx, dy);
      if (d < 1) {
        t.pause = 1 + t.rng() * 3;
        var p = turtleSpot(t.rng);
        if (p) { t.tx = p.x; t.ty = p.y; }
      } else {
        mvx = dx / d; mvy = dy / d; moving = true;
        t.x += mvx * t.speed * dt; t.y += mvy * t.speed * dt;
        t.ang = Math.atan2(mvy, mvx);
      }
    }
    t.moving = moving;
    t.phase = (t.phase || 0) + dt * (moving ? 9 : 2);
  }
  function turtleJudge() {
    if (!turtle) {
      turtle = { x: hole.cup.x - 8, y: hole.cup.y, ang: 0, speed: 1.6,
                 tx: hole.cup.x - 8, ty: hole.cup.y, pause: 0, judge: false,
                 judgeT: 0, blinkT: 2, blink: 0, phase: 0,
                 rng: TF.mulberry32((seed ^ 0x77aa) >>> 0) };
    }
    turtle.judge = true; turtle.judgeT = 0;
    turtle.x = Math.max(4, Math.min(TF.W - 4, hole.cup.x - 8));
    turtle.y = hole.cup.y;
  }
  function drawTurtle() {
    if (!turtle) return;
    var t = turtle, B = biome();
    var px = X(t.x), py = Y(t.y);
    var s = sc;  // world->px
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-t.ang);  // screen y-down: negate
    var shell = curBiome === 3 ? '#5a6b52' : '#4f7a3f';
    var belly = curBiome === 3 ? '#8a9a80' : '#7ba05b';
    // flippers
    ctx.fillStyle = shell;
    var fl = Math.sin(t.phase || 0) * 0.12;
    [[0.7, 0.75], [0.7, -0.75], [-0.7, 0.75], [-0.7, -0.75]].forEach(function (f) {
      ctx.beginPath();
      ctx.ellipse(f[0] * s * (1 + fl), f[1] * s, 0.42 * s, 0.26 * s, f[1] * 0.5, 0, 6.2832);
      ctx.fill();
    });
    // shell
    ctx.fillStyle = shell;
    ctx.beginPath(); ctx.ellipse(0, 0, 1.5 * s, 1.05 * s, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(0, 0, 1.05 * s, 0.68 * s, 0, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, 1.05 * s, 0.68 * s, 0, 0, 6.2832); ctx.stroke();
    // head
    ctx.fillStyle = shell;
    ctx.beginPath(); ctx.arc(1.85 * s, 0, 0.52 * s, 0, 6.2832); ctx.fill();
    // eyes: slow blink (or judgmental stare)
    ctx.fillStyle = '#1c2419';
    if (t.blink > 0 && !t.judge) {
      ctx.fillRect(1.7 * s, -0.42 * s, 0.5 * s, 0.12 * s);
      ctx.fillRect(1.7 * s, 0.3 * s, 0.5 * s, 0.12 * s);
    } else {
      ctx.beginPath(); ctx.arc(1.95 * s, -0.22 * s, 0.11 * s, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.arc(1.95 * s, 0.22 * s, 0.11 * s, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
    if (t.judge) {
      // annoyance marks
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2;
      var jx = px + 2.6 * s, jy = py - 1.6 * s;
      for (var i = 0; i < 3; i++) {
        var a = -0.5 + i * 0.5;
        ctx.beginPath();
        ctx.moveTo(jx, jy);
        ctx.lineTo(jx + Math.cos(a) * 7, jy + Math.sin(a) * 7);
        ctx.stroke();
      }
    }
  }

  /* ---------------- ball helpers ---------------- */
  function clearHoled(b) { b.inCup = false; b.inWater = false; }
  function ballHoled(b) { return b.inCup; }
  function ballInWater(b) { return b.inWater; }
  function par() { return hole.par; }

  /* ---------------- toast + milestones + trail colors ---------------- */
  var TRAILS = [
    { n: 'Cloud', c: '255,255,255', at: 1 },
    { n: 'Mint', c: '150,255,190', at: 4 },
    { n: 'Sky', c: '140,200,255', at: 8 },
    { n: 'Gold', c: '255,215,130', at: 12 },
    { n: 'Rose', c: '255,150,190', at: 16 },
    { n: 'Comet', c: '200,170,255', at: 20 }
  ];
  function trailDef() {
    for (var i = TRAILS.length - 1; i >= 0; i--)
      if (TRAILS[i].n === trailSel && maxHole >= TRAILS[i].at) return TRAILS[i];
    return TRAILS[0];
  }
  function unlockedTrails() { return TRAILS.filter(function (t) { return maxHole >= t.at; }); }
  function toast(msg, ms) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2600);
  }
  var MILESTONES = {
    50: 'Hole 50 — the fairway salutes you',
    4: 'Hole 4 — warming up',
    8: 'Hole 8 — finding the groove',
    12: 'Hole 12 — the back stretch',
    16: 'Hole 16 — the home straight',
    20: 'Hole 20 — the final exam'
  };
  function milestoneCheck(n) {
    if (!MILESTONES[n] || mode !== 'tour') return;
    var msg = '⛳ ' + MILESTONES[n];
    for (var i = 0; i < TRAILS.length; i++)
      if (TRAILS[i].at === n) msg += ' · new trail: ' + TRAILS[i].n + ' 🎨';
    toast(msg, 3200);
    AU.chime(false);
  }

  /* ---------------- physics step (fixed 1/60) ---------------- */
  function stepPhysics() {
    var wasInFlight = inFlight;
    var wasAir = ball.z > 0;
    TF.simStep(hole, ball, simTime);
    simTime += STEP;
    if (!wasAir && ball.z > 0) {           // ramp launch!
      AU.noise(0.28, 0.20, 500, 2600, 'bandpass');
      HAP.buzz(30);
    }
    if (ball.impact > 1.2) { thudAt(ball.x, ball.y, ball.impact); ball.impact = 0; }
    if (ball.pickup) { pickupJuice(ball.pickup); ball.pickup = null; }
    if (ball.tevent && typeof TPR !== 'undefined') { TPR.event(ball.tevent); ball.tevent = null; }
    if (ballHoled(ball)) { onHoled(); return; }
    if (wasInFlight && ballInWater(ball)) { onWater(); return; }  // sim flags inWater; game owns the penalty+reset
    if (ball.resting) {
      if (wasInFlight && state === 'play') ghost = { x: ball.x, y: ball.y };  // last-shot ghost
      lastRest.x = ball.x; lastRest.y = ball.y; inFlight = false;
      refreshButtons();
    }
  }

  /* pickups: gems + the hidden relic (Walkabout / Mini Golf King) */
  function pickupJuice(kind) {
    if (kind === 'relic') {
      relicCount++;
      try {
        var rk = JSON.parse(lsGet('tf_relics', '{}'));
        rk[seed] = 1;
        lsSet('tf_relics', JSON.stringify(rk));
      } catch (e) {}
      savePow();
      AU.chime(true);
      HAP.buzz([20, 60, 20]);
      petalBurst(ball.x, ball.y);
      toast('✦ Relic found! (' + relicCount + ' total)');
      updateHUD();
    } else if (kind === 'gem') {
      AU.blip(1320, 1760, 0.12, 0.08, 'triangle');
      HAP.buzz(10);
      updateHUD();
    }
  }

  function onHoled() {
    state = 'holed'; inFlight = false; aiming = false; drag = null; aimPts = [];
    var stars = TF.starsFor(strokes, par());
    totalStars += stars;
    if (mode === 'tour') recordScore(strokes);
    prevKiller = strokes >= par() + 3;      // breather hole next if this was a killer
    var eagle = strokes <= par() - 2;
    AU.chime(eagle);
    AU.clunk();
    refreshButtons();
    slowT = RM ? 0 : 0.85;                              // slow-mo on the drop (off for reduced motion)
    HAP.buzz([10, 40, 10]);                             // quiet success pulse on every hole-out
    if (eagle && !RM) petalBurst(hole.cup.x, hole.cup.y);
    if (strokes > par() + 2) turtleJudge();
    saveRun(); saveBest();
    // power-up drip: one random power-up per hole-out (cap 5 each)
    var pk = ['brake', 'sticky', 'mulligan'][(Math.random() * 3) | 0];
    if (POW[pk] < 5) { POW[pk]++; savePow(); updatePowBtn(); }
    // world-map progression: stars color in the biome (ALGJ)
    if (mode === 'tour') {
      biomeStars[curBiome] = (biomeStars[curBiome] || 0) + stars;
      savePow();
    }
    setTimeout(showStarsPop, 650);
    setTimeout(function () {
      hideStarsPop();
      if (mode === 'daily') showDailyResult(stars);
      else if (holeIndex >= TF.HOLES.length) showTourResult();
      else {
        // Wonderputt beat: the old hole melts away before the next arrives
        startMorph(function () { goToHole(holeIndex + 1); });
      }
    }, 2300);
  }

  /* tour complete: 20 holes down, final tally */
  function showTourResult() {
    state = 'result';
    try {
      var tb = JSON.parse(lsGet('tf_tourbest', 'null'));
      if (!tb || totalStrokes < tb.strokes)
        lsSet('tf_tourbest', JSON.stringify({ strokes: totalStrokes, stars: totalStars }));
      tb = JSON.parse(lsGet('tf_tourbest', 'null'));
      localStorage.removeItem('tf_run');
    } catch (e) { tb = null; }
    var tp = TF.TOUR_PAR;
    var diff = totalStrokes - tp;
    var title = diff <= -6 ? 'Championship golf!' : (diff <= 0 ? 'Under par!' : (diff <= 6 ? 'Tour complete!' : 'Tour survived!'));
    $('result-stars').textContent = '★★★';
    $('result-title').textContent = title;
    $('result-sub').innerHTML = '20 holes · <b>' + totalStrokes + '</b> strokes (par ' + tp + ')<br>' +
      totalStars + ' ★ earned' + (tb ? ' · all-time best ' + tb.strokes : '');
    $('result').classList.add('on');
    $('hud').hidden = true;
    refreshButtons();
    AU.chime(true);
  }

  /* hole-to-hole morph: the course squashes and melts (Wonderputt) */
  function startMorph(next) {
    if (RM) { next(); return; }   // reduced motion: cut straight through
    state = 'morph';
    morphT = 1.1;
    morphNext = next;
    petalBurst(hole.cup.x, hole.cup.y);
    AU.noise(0.5, 0.10, 400, 2400, 'bandpass');
  }

  function onWater() {
    strokes++;                                         // +1 stroke penalty
    totalStrokes++;
    splashAt(ball.x, ball.y);
    AU.splash();
    ball.x = lastRest.x; ball.y = lastRest.y;          // back to previous rest
    ball.vx = 0; ball.vy = 0; ball.resting = true;
    ball.carry = null; ball.tevent = null; ball._tpZone = null;  // never stuck in a transport
    clearHoled(ball);
    inFlight = false;
    updateHUD();
  }

  /* skip with dignity (Golf on Mars): after 20 strokes, bank par+3 and move on */
  function skipHole() {
    if (!(state === 'play' && ball && ball.resting && !inFlight && strokes >= 20)) return;
    var bank = TF.skipStrokes(par());
    totalStrokes += bank - strokes;
    recordScore(bank);
    prevKiller = true;
    undoSnap = null;
    AU.click();
    toast('Hole skipped · +' + bank + ' banked');
    saveRun();
    if (mode === 'tour' && holeIndex >= TF.HOLES.length) showTourResult();
    else goToHole(holeIndex + 1);
  }

  /* ---------------- power-ups (SSG3 / Cursed to Golf) ----------------
   * One consumable per hole, earned by holing out. Tap the PWR button:
   * it fires the armed power-up when usable, otherwise cycles the arm. */
  function updatePowBtn() {
    var b = $('btn-pow');
    if (!b) return;
    var show = state === 'play' || state === 'race';
    b.hidden = !show;
    if (show) {
      var n = POW[armedPow] | 0;
      b.textContent = POW_ICON[armedPow] + ' ' + n;
      b.classList.toggle('empty', n <= 0);
      b.title = POW_NAME[armedPow] + ' (' + n + ') — tap to use, cycles when idle';
    }
  }
  function cyclePow() {
    var order = ['brake', 'sticky', 'mulligan'];
    var i = order.indexOf(armedPow);
    for (var k = 1; k <= 3; k++) {
      var cand = order[(i + k) % 3];
      if ((POW[cand] | 0) > 0) { armedPow = cand; break; }
    }
    savePow(); updatePowBtn();
    AU.click();
  }
  function useMulligan() {
    // full hole rewind: back to the tee, this hole's strokes refunded
    POW.mulligan--; savePow();
    totalStrokes = holeStartTotal;
    strokes = 0;
    undoSnap = null; ghost = null;
    var nb = TF.newBall(hole);
    ball.x = nb.x; ball.y = nb.y; ball.vx = 0; ball.vy = 0;
    ball.z = 0; ball.vz = 0; ball.resting = true; ball.sticky = false;
    ball.gems = 0; ball.gotRelic = false; ball.curve = 0;
    clearHoled(ball);
    hole.gems.forEach(function (g) { g.taken = false; });
    if (hole.relic) hole.relic.taken = false;
    lastRest = { x: ball.x, y: ball.y };
    inFlight = false; aiming = false; drag = null; aimPts = [];
    AU.chime(false);
    toast('Mulligan! Back to the tee.');
    updatePowBtn(); updateHUD(); saveRun();
  }
  function powTap() {
    AU.init();
    var canAct = (state === 'play' || state === 'race') && ball;
    if (!canAct) return;
    // air-brake: fires mid-flight
    if (!ball.resting && !ball.inCup && armedPow === 'brake') {
      if ((POW.brake | 0) <= 0) { toast('No air-brakes left — hole out to earn more'); return; }
      if (TF.applyBrake(ball)) {
        POW.brake--; savePow(); updatePowBtn();
        AU.noise(0.3, 0.18, 2000, 300, 'lowpass');
        HAP.buzz(40);
        toast('Air-brake!');
      }
      return;
    }
    if (!ball.resting || ball.inCup) return;
    // sticky: arms for the next shot
    if (armedPow === 'sticky') {
      if ((POW.sticky | 0) <= 0) { toast('No sticky balls left'); return; }
      if (ball.sticky) { toast('Sticky already armed'); return; }
      TF.armSticky(ball);
      POW.sticky--; savePow(); updatePowBtn();
      AU.click();
      toast('Sticky armed — the next landing stops dead');
      return;
    }
    // mulligan: full hole rewind (not in races)
    if (armedPow === 'mulligan') {
      if (state === 'race') { toast('No mulligans in a race!'); return; }
      if ((POW.mulligan | 0) <= 0) { toast('No mulligans left'); return; }
      if (strokes <= 0) { toast('Nothing to rewind yet'); return; }
      useMulligan();
      return;
    }
    cyclePow();
  }

  /* undo last shot (Golf Peaks): penalty-free, one deep, not after holing */
  function undoShot() {
    if (!(undoSnap && ball && ball.resting && !inFlight && state === 'play')) return;
    AU.click();
    TF.restoreBall(hole, ball, undoSnap.snap);
    strokes = undoSnap.strokes;
    totalStrokes = undoSnap.totalStrokes;
    ghost = undoSnap.ghost;
    undoSnap = null;
    clearHoled(ball);
    updateHUD();
    saveRun();
    toast('Shot taken back');
  }

  /* ---------------- shooting ---------------- */
  var MAX_DRAG_PX = 300;
  // -> [vx, vy, powerFrac (1.0 = MAX_POWER, up to OVERDRIVE), overdrive] or null
  /* sway-unless-focused (A Little Golf Journey): the aim sways gently until
   * you hold the drag still for ~0.7s — then it locks. Pure timing skill,
   * zero buttons. Applied to both the preview and the real shot. */
  function swayAngle() { return Math.sin(wtime * 2.4) * 0.030 * swayAmp; }
  function dragVel() {
    if (!drag) return null;
    var dx = drag.x0 - drag.x1, dy = drag.y0 - drag.y1;   // screen px (y down)
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 14) return null;                            // tiny drag = cancel
    var maxDrag = Math.min(MAX_DRAG_PX, window.innerHeight * 0.45);
    var ratio = len / maxDrag;
    var od = ratio > 0.9;                                 // overdrive zone (OK Golf)
    var capped = Math.min(ratio, TF.OVERDRIVE_MAX / TF.MAX_POWER);
    var power = capped * TF.MAX_POWER;
    // screen y-down -> world y-up: negate dy; then rotate by the sway angle
    var vx = dx / len * power, vy = -dy / len * power;
    var sa = swayAngle();
    if (sa !== 0) {
      var c = Math.cos(sa), s = Math.sin(sa);
      var rx = vx * c - vy * s, ry = vx * s + vy * c;
      vx = rx; vy = ry;
    }
    return [vx, vy, capped, od];
  }
  function shootFromDrag() {
    var v = dragVel();
    if (!v) return;
    var inRace = state === 'race';
    if (!inRace) {
      undoSnap = { snap: TF.snapBall(hole, ball), strokes: strokes, totalStrokes: totalStrokes,
                   ghost: ghost ? { x: ghost.x, y: ghost.y } : null };
    }
    var vx = v[0], vy = v[1], od = v[3];
    if (od) {                                             // super shot, visibly less accurate
      var j = (Math.random() * 2 - 1) * 3 * Math.PI / 180; // ±3° jitter
      var c = Math.cos(j), s = Math.sin(j);
      var nx = vx * c - vy * s, ny = vx * s + vy * c;
      vx = nx; vy = ny;
    }
    var spin = spinVal; spinVal = 0;                      // spin is per-shot
    TF.shoot(ball, vx, vy, { spin: spin, overdrive: od });
    if (!inRace) { strokes++; totalStrokes++; }
    inFlight = true;
    aimLand = null;
    AU.thock(v[2] / 1.25);
    HAP.buzz(20);                                       // light pulse on every shot
    divotAt(ball.x, ball.y);
    updateHUD();
    if (!inRace) saveRun();
  }

  /* predicted aim path: exact sim steps on a scratch ball.
   * This is the skill toy — the dotted path visibly bends with the break. */
  function predictAim(vx, vy, od) {
    aimPts = [];
    aimLand = null;
    try {
      var b = TF.newBall(hole);
      b.x = ball.x; b.y = ball.y;
      TF.shoot(b, vx, vy, { overdrive: !!od });  // same launch as the real shot
      b.x = ball.x; b.y = ball.y;
      b.spin = spinVal;                                   // spin shapes the preview too
      clearHoled(b);
      var px = -9999, py = -9999, i;
      var pWasAir = false, pLanded = false;
      for (i = 0; i < 200; i++) {                         // ~3.3s of roll
        TF.simStep(hole, b, simTime);   // blades/gusts at cast time
        if (b.z > 0) pWasAir = true;
        // first touchdown after flight = the landing spot (ALGJ)
        if (pWasAir && !pLanded && b.z === 0 && !b.inCup && !b.inWater) {
          aimLand = { x: b.x, y: b.y, air: true };
          pLanded = true;
        }
        if (b.inCup) { aimPts.push([b.x, b.y]); break; }
        if (b.inWater) { aimPts.push([b.x, b.y]); break; }
        var dx = b.x - px, dy = b.y - py;                // teleport guard
        if (i > 0 && dx * dx + dy * dy > 900) break;
        px = b.x; py = b.y;
        if (i % 4 === 0) aimPts.push([b.x, b.y]);
        if (b.resting) break;
        if (b.x < -4 || b.x > hole.W + 4 || b.y < -4 || b.y > hole.H + 4) break;
      }
      // no flight? the landing spot is where the ball stops
      if (!aimLand && aimPts.length) {
        var lp = aimPts[aimPts.length - 1];
        aimLand = { x: lp[0], y: lp[1], air: false };
      }
    } catch (e) { aimPts = []; aimLand = null; }
  }

  /* ---------------- input: drag-back slingshot anywhere on screen ---------------- */
  function clampSpin(v) { return v > 1 ? 1 : (v < -1 ? -1 : v); }
  function repredict() {
    var v = dragVel();
    if (v) predictAim(v[0], v[1], v[3]); else aimPts = [];
  }
  function refreshSpinHint() {
    var h = $('spin-hint');
    if (!h) return;
    var show = state === 'play' && aiming && holeIndex <= 3;
    h.hidden = !show;
    if (show) h.textContent = isTouchDevice ? 'second finger ↕ drag = spin' : 'mouse wheel = spin';
  }
  canvas.addEventListener('pointerdown', function (e) {
    AU.init(); AU.resume();
    if ((state !== 'play' && state !== 'race') || !ball) return;
    // post-shot curve: drag while the ball is moving bends it mid-flight (SSG3)
    if (!ball.resting && !ball.inCup && !aiming && !curveDrag) {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      curveDrag = { pid: e.pointerId, x0: e.clientX };
      return;
    }
    if (!ball.resting) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    var r = canvas.getBoundingClientRect();
    var px = e.clientX - r.left, py = e.clientY - r.top;
    if (aiming && drag && e.pointerId !== drag.pid && spinPointer === null) {
      spinPointer = e.pointerId; spinStartY = e.clientY; spinBase = spinVal;  // 2nd finger = spin
      return;
    }
    drag = { pid: e.pointerId, x0: px, y0: py, x1: px, y1: py };
    dragStillT = 0;
    aiming = true;
    refreshSpinHint();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (curveDrag && e.pointerId === curveDrag.pid) {      // live curve input
      e.preventDefault();
      if (ball && !ball.resting) TF.setCurve(ball, (e.clientX - curveDrag.x0) / 130);
      return;
    }
    if (!aiming || !drag) return;
    e.preventDefault();
    if (e.pointerId === spinPointer) {                    // spin finger: vertical drag
      spinVal = clampSpin(spinBase + (spinStartY - e.clientY) / 140);
      repredict();
      return;
    }
    if (e.pointerId !== drag.pid) return;
    var r = canvas.getBoundingClientRect();
    drag.x1 = e.clientX - r.left; drag.y1 = e.clientY - r.top;
    dragStillT = 0;                                       // moved -> sway returns
    repredict();
  });
  function endDrag(e) {
    if (e && curveDrag && e.pointerId === curveDrag.pid) { curveDrag = null; return; }
    if (e && spinPointer !== null && e.pointerId === spinPointer) {
      spinPointer = null;                                 // spin value stays for the shot
      return;
    }
    if (e && drag && e.pointerId !== drag.pid) return;
    if (!aiming) return;
    aiming = false; aimPts = [];
    refreshSpinHint();
    if (drag && (state === 'play' || state === 'race') && ball && ball.resting) shootFromDrag();
    drag = null;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', function (e) {
    if (e && curveDrag && e.pointerId === curveDrag.pid) { curveDrag = null; return; }
    if (e && spinPointer !== null && e.pointerId === spinPointer) { spinPointer = null; return; }
    aiming = false; drag = null; aimPts = [];
    refreshSpinHint();
  });
  canvas.addEventListener('wheel', function (e) {          // desktop: wheel = spin while aiming
    if (!aiming || !drag) return;
    e.preventDefault();
    spinVal = clampSpin(spinVal - e.deltaY / 600);
    repredict();
  }, { passive: false });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });

  /* ---------------- particles (top-down) ---------------- */
  function divotAt(x, y) {   // little turf kick on the strike
    for (var i = 0; i < 5; i++) {
      var a = Math.random() * 6.2832;
      particles.push({ k: 'v', x: x, y: y, vx: Math.cos(a) * (1 + Math.random() * 3),
        vy: Math.sin(a) * (1 + Math.random() * 3), t: 0, life: 0.5 + Math.random() * 0.3 });
    }
    particles.push({ k: 'r', x: x, y: y, t: 0, life: 0.5 });
  }
  function splashAt(x, y) {
    var i;
    for (i = 0; i < 14; i++) {
      var a = Math.random() * 6.2832;
      particles.push({ k: 's', x: x, y: y, vx: Math.cos(a) * (2 + Math.random() * 6),
        vy: Math.sin(a) * (2 + Math.random() * 6), t: 0, life: 0.7 + Math.random() * 0.3 });
    }
    particles.push({ k: 'r', x: x, y: y, t: 0, life: 0.7 });
  }
  function thudAt(x, y, impact) {                         // tree knock, scaled by impact
    var n = Math.min(10, 2 + Math.round(impact * 0.5)), i;
    for (i = 0; i < n; i++) {
      var a = Math.random() * 6.2832;
      particles.push({ k: 'd', x: x + (Math.random() - 0.5) * 1.2, y: y + (Math.random() - 0.5) * 1.2,
        vx: Math.cos(a) * (1 + Math.random() * 2.5), vy: Math.sin(a) * (1 + Math.random() * 2.5),
        t: 0, life: 0.4 + Math.random() * 0.3, s: 0.5 + Math.random() * 0.9 });
    }
    AU.noise(0.07, 0.12, 900, 300, 'lowpass');
  }
  function petalBurst(x, y) {
    var cols = ['#ffd1dc', '#fff6f8', '#f5b81e', '#ffb3c7', '#ffffff'];
    for (var i = 0; i < 26; i++) {
      var a = Math.random() * 6.2832;
      particles.push({ k: 'p', x: x + (Math.random() - 0.5) * 4, y: y + (Math.random() - 0.5) * 4,
        vx: Math.cos(a) * (1 + Math.random() * 4), vy: Math.sin(a) * (1 + Math.random() * 4),
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
      if (p.k === 's' || p.k === 'd' || p.k === 'v') {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= (1 - 2.4 * dt); p.vy *= (1 - 2.4 * dt);
      }
      if (p.k === 'p') {
        p.x += (p.vx + Math.sin(wtime * 3 + p.ph) * 1.2) * dt;
        p.y += (p.vy + Math.cos(wtime * 2.4 + p.ph) * 1.2) * dt;
        p.vx *= (1 - 1.2 * dt); p.vy *= (1 - 1.2 * dt);
      }
    }
  }
  function drawParticles() {
    var i, p, a, f;
    for (i = 0; i < particles.length; i++) {
      p = particles[i];
      if (p.t < 0) continue;
      f = p.t / p.life;
      if (p.k === 'r') {
        a = 0.55 * (1 - f);
        ctx.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 2 + f * 22, 0, 6.2832); ctx.stroke();
      } else if (p.k === 's') {
        a = 0.9 * (1 - f);
        ctx.fillStyle = 'rgba(190,230,250,' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 2.4 * (1 - f * 0.5), 0, 6.2832); ctx.fill();
      } else if (p.k === 'd' || p.k === 'v') {
        a = 0.55 * (1 - f);
        ctx.fillStyle = p.k === 'v' ? 'rgba(90,140,70,' + a.toFixed(3) + ')'
                                    : 'rgba(216,196,150,' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), p.s * sc * 0.5 * (0.6 + f), 0, 6.2832); ctx.fill();
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

  /* ---------------- render: the whole hole, top-down ---------------- */
  function ellipseW(e) {
    ctx.beginPath();
    ctx.ellipse(X(e.x), Y(e.y), Math.max(1, e.rx * sc), Math.max(1, e.ry * sc),
                -(e.rot || 0), 0, 6.2832);
  }
  // Pond shoreline path: samples TF.blobR around the ring so the drawn pond
  // matches the sim's point-in-pond test exactly. Falls back to the ellipse.
  function blobPath(e, scale) {
    if (!e.blob || !TF.blobR) { ellipseW(e); return; }
    scale = scale || 1;
    var S = 44, k, th, r, lx, ly;
    var cr = Math.cos(e.rot || 0), sr = Math.sin(e.rot || 0);
    ctx.beginPath();
    for (k = 0; k <= S; k++) {
      th = k / S * 6.2832;
      r = TF.blobR(e, th) * scale;
      lx = r * Math.cos(th); ly = r * Math.sin(th);
      var px = X(e.x + lx * cr - ly * sr), py = Y(e.y + lx * sr + ly * cr);
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  function rrPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawSlopeArrows() {

    // green-reading: subtle white arrows showing the break
    ctx.lineCap = 'round';
    for (var gy = 4; gy < TF.H; gy += 6) {
      for (var gx = 3; gx < TF.W; gx += 6) {
        var surf = TF.surfaceAt(hole, gx, gy);
        if (surf !== 'green' && surf !== 'fairway') continue;
        var sl = hole.slopeAt(gx, gy);
        var mag = Math.hypot(sl.x, sl.y);
        if (mag < 0.45) continue;
        var ang = Math.atan2(sl.y, sl.x);          // world y-up
        var len = Math.min(3, 1.1 + mag * 0.8);    // world units
        var pulse = Math.sin(wtime * 2.2 + gx * 0.8 + gy * 0.6) * 0.3;
        var dx = Math.cos(ang), dy = Math.sin(ang);
        var x0 = gx + dx * pulse, y0 = gy + dy * pulse;
        var x1 = gx + dx * (len + pulse), y1 = gy + dy * (len + pulse);
        var a = 0.10 + Math.min(0.16, mag * 0.05);
        ctx.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
        ctx.lineWidth = Math.max(1.5, sc * 0.22);
        ctx.beginPath();
        ctx.moveTo(X(x0), Y(y0));
        ctx.lineTo(X(x1), Y(y1));
        ctx.stroke();
        // head
        var hx = X(x1), hy = Y(y1);
        var ha = Math.atan2(-dy, dx);              // screen angle (y flipped)
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx - Math.cos(ha - 0.45) * 5, hy - Math.sin(ha - 0.45) * 5);
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx - Math.cos(ha + 0.45) * 5, hy - Math.sin(ha + 0.45) * 5);
        ctx.stroke();
      }
    }
  }

  function render() {
    var B = biome(), i;
    // rough background
    ctx.fillStyle = B.rough;
    ctx.fillRect(0, 0, cw, ch);
    if (!hole) return;

    // grass texture speckles
    for (i = 0; i < speckles.length; i++) {
      var sp = speckles[i];
      ctx.fillStyle = sp.k === 's' ? B.sandDot : B.speck + sp.a.toFixed(3) + ')';
      if (sp.k === 's') ctx.globalAlpha = sp.a;
      ctx.beginPath(); ctx.arc(X(sp.x), Y(sp.y), Math.max(0.6, sp.r * sc * 0.28), 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // water: layered and alive (deep base, drifting light, ripple rings, foam rim)
    for (i = 0; i < hole.water.length; i++) {
      var we = hole.water[i];
      blobPath(we, 1);
      ctx.fillStyle = B.water; ctx.globalAlpha = 0.96; ctx.fill(); ctx.globalAlpha = 1;
      ctx.save();
      blobPath(we, 1); ctx.clip();
      // deep center
      ctx.fillStyle = 'rgba(0,30,60,0.28)';
      blobPath(we, 0.55);
      ctx.fill();
      // drifting light bands
      ctx.fillStyle = B.waterTop; ctx.globalAlpha = 0.22;
      for (var lb = 0; lb < 3; lb++) {
        var bandY = Y(we.y) + Math.sin(wtime * 0.9 + lb * 2.1 + we.x) * we.ry * sc * 0.5;
        ctx.beginPath();
        ctx.ellipse(X(we.x) + Math.sin(wtime * 0.7 + lb * 1.3) * we.rx * sc * 0.2,
                    bandY, we.rx * sc * 0.75, we.ry * sc * 0.13, 0, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // expanding ripple rings (phase-seeded per blob)
      ctx.strokeStyle = B.waterTop; ctx.lineWidth = 1.5;
      for (var rp = 0; rp < 2; rp++) {
        var rph = ((wtime * 0.35 + we.x * 0.37 + rp * 0.5) % 1);
        ctx.globalAlpha = 0.35 * (1 - rph);
        blobPath(we, 0.25 + rph * 0.7);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      // foam rim
      blobPath(we, 1);
      ctx.strokeStyle = B.waterTop; ctx.globalAlpha = 0.55; ctx.lineWidth = 2; ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // fairway: base color, then mow-stripe quads along each segment
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (i = 0; i < hole.fairway.length; i++) {
      var fs = hole.fairway[i];
      ctx.beginPath();
      ctx.moveTo(X(fs.x1), Y(fs.y1)); ctx.lineTo(X(fs.x2), Y(fs.y2));
      ctx.lineWidth = fs.r * 2 * sc;
      ctx.strokeStyle = B.fairA;
      ctx.stroke();
    }

    // mow stripes: walk each segment in 4-unit bands, alternating shades
    for (i = 0; i < hole.fairway.length; i++) {
      var sg = hole.fairway[i];
      var segLen = Math.hypot(sg.x2 - sg.x1, sg.y2 - sg.y1);
      var ux = (sg.x2 - sg.x1) / (segLen || 1), uy = (sg.y2 - sg.y1) / (segLen || 1);
      var band = 0;
      for (var d = 0; d < segLen; d += 4, band++) {
        if (band % 2 === 0) continue;   // fairA is already the base
        var bx0 = sg.x1 + ux * d, by0 = sg.y1 + uy * d;
        var bl = Math.min(4, segLen - d);
        var bx1 = bx0 + ux * bl, by1 = by0 + uy * bl;
        // perpendicular half-width vector
        var px = -uy * sg.r, py = ux * sg.r;
        ctx.fillStyle = B.fairB;
        ctx.beginPath();
        ctx.moveTo(X(bx0 + px), Y(by0 + py));
        ctx.lineTo(X(bx1 + px), Y(by1 + py));
        ctx.lineTo(X(bx1 - px), Y(by1 - py));
        ctx.lineTo(X(bx0 - px), Y(by0 - py));
        ctx.closePath(); ctx.fill();
      }
    }
    // soft fairway edge
    for (i = 0; i < hole.fairway.length; i++) {
      var se = hole.fairway[i];
      ctx.beginPath();
      ctx.moveTo(X(se.x1), Y(se.y1)); ctx.lineTo(X(se.x2), Y(se.y2));
      ctx.lineWidth = se.r * 2 * sc;
      ctx.strokeStyle = 'rgba(0,0,0,0.10)';
      ctx.stroke();
    }

    // sand traps
    for (i = 0; i < hole.sand.length; i++) {
      var sa = hole.sand[i];
      ellipseW(sa);
      ctx.fillStyle = B.sand; ctx.fill();
      ctx.strokeStyle = B.sandDot; ctx.lineWidth = 2; ctx.stroke();
    }

    // sand dunes: grassy mounds with contour rings (the rings show the slope)
    for (i = 0; i < hole.dunes.length; i++) {
      var du = hole.dunes[i];
      var dux = X(du.x), duy = Y(du.y);
      var dur = du.sig * 1.9 * sc;   // visual radius ~ where the push fades
      // soft shadow (light from top-left)
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      ctx.beginPath(); ctx.ellipse(dux + dur * 0.12, duy + dur * 0.16, dur, dur * 0.94, 0, 0, 6.2832); ctx.fill();
      // mound: radial light-to-base gradient
      var dug = ctx.createRadialGradient(dux - dur * 0.25, duy - dur * 0.3, dur * 0.1, dux, duy, dur);
      dug.addColorStop(0, B.fairA);
      dug.addColorStop(0.55, B.fairB);
      dug.addColorStop(1, B.rough);
      ctx.fillStyle = dug;
      ctx.beginPath(); ctx.arc(dux, duy, dur, 0, 6.2832); ctx.fill();
      // contour rings: honest topography
      ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.lineWidth = 1.5;
      [0.38, 0.62, 0.84].forEach(function (f) {
        ctx.beginPath(); ctx.arc(dux, duy, dur * f, 0, 6.2832); ctx.stroke();
      });
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(dux, duy, dur, 0, 6.2832); ctx.stroke();
    }

    // green
    ellipseW(hole.green);
    ctx.fillStyle = B.green; ctx.fill();
    ctx.strokeStyle = B.greenDark; ctx.lineWidth = 3; ctx.stroke();
    ctx.save();
    ellipseW(hole.green); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.ellipse(X(hole.green.x), Y(hole.green.y), hole.green.rx * sc * 0.55, hole.green.ry * sc * 0.55, 0, 0, 6.2832);
    ctx.fill();
    ctx.restore();

    // slope arrows (the read)
    drawSlopeArrows();

    // trees: canopy blobs
    for (i = 0; i < hole.trees.length; i++) {
      var tr = hole.trees[i];
      var tx = X(tr.x), ty = Y(tr.y), trr = tr.r * sc;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.ellipse(tx + 2, ty + 3, trr, trr * 0.9, 0, 0, 6.2832); ctx.fill();
      ctx.fillStyle = B.treeDark;
      ctx.beginPath(); ctx.arc(tx, ty, trr, 0, 6.2832); ctx.fill();
      ctx.fillStyle = B.tree;
      ctx.beginPath(); ctx.arc(tx - trr * 0.18, ty - trr * 0.2, trr * 0.72, 0, 6.2832); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath(); ctx.arc(tx - trr * 0.3, ty - trr * 0.34, trr * 0.28, 0, 6.2832); ctx.fill();
    }

    // tee marker
    ctx.strokeStyle = 'rgba(255,255,255,.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(X(hole.tee.x), Y(hole.tee.y), 1.7 * sc, 0, 6.2832); ctx.stroke();
    ctx.setLineDash([]);

    // banked mini-golf walls: brick rails with a wooden cap
    for (i = 0; i < hole.walls.length; i++) {
      var wa = hole.walls[i];
      var wax1 = X(wa.x1), way1 = Y(wa.y1), wax2 = X(wa.x2), way2 = Y(wa.y2);
      var wdx = wax2 - wax1, wdy = way2 - way1;
      var wlen = Math.hypot(wdx, wdy) || 1;
      var wnx = -wdy / wlen, wny = wdx / wlen;   // screen normal
      var wth = Math.max(5, 0.9 * sc);
      // shadow
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = wth + 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(wax1 + 2, way1 + 3); ctx.lineTo(wax2 + 2, way2 + 3); ctx.stroke();
      // brick body
      ctx.strokeStyle = '#a4563f'; ctx.lineWidth = wth; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(wax1, way1); ctx.lineTo(wax2, way2); ctx.stroke();
      // brick courses
      ctx.strokeStyle = 'rgba(60,20,10,0.35)'; ctx.lineWidth = 1;
      var courses = Math.floor(wlen / (wth * 1.6));
      for (var bc = 1; bc <= courses; bc++) {
        var bx0 = wax1 + wdx * bc / (courses + 1), by0 = way1 + wdy * bc / (courses + 1);
        ctx.beginPath();
        ctx.moveTo(bx0 - wnx * wth / 2, by0 - wny * wth / 2);
        ctx.lineTo(bx0 + wnx * wth / 2, by0 + wny * wth / 2);
        ctx.stroke();
      }
      // wooden cap rail
      ctx.strokeStyle = '#7a5230'; ctx.lineWidth = Math.max(2.5, wth * 0.32); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(wax1, way1 - wth * 0.28); ctx.lineTo(wax2, way2 - wth * 0.28); ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // ramps: wooden wedges with chevrons pointing the launch direction
    for (i = 0; i < hole.ramps.length; i++) {
      var ra = hole.ramps[i];
      var rax = X(ra.x), ray = Y(ra.y);
      var rrot = -Math.atan2(ra.dy, ra.dx);   // world -> screen
      var rw = ra.w * sc, rh = ra.h * sc;
      ctx.save(); ctx.translate(rax, ray); ctx.rotate(rrot);
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      rrPath(-rw / 2 + 2, -rh / 2 + 4, rw, rh, 6); ctx.fill();
      // wedge: light top, dark lip at the launch edge
      var rag = ctx.createLinearGradient(0, -rh / 2, 0, rh / 2);
      rag.addColorStop(0, '#c99a5e'); rag.addColorStop(1, '#8a5f33');
      ctx.fillStyle = rag;
      rrPath(-rw / 2, -rh / 2, rw, rh, 6); ctx.fill();
      ctx.strokeStyle = '#5e3f1f'; ctx.lineWidth = 2;
      rrPath(-rw / 2, -rh / 2, rw, rh, 6); ctx.stroke();
      // launch lip (the high edge)
      ctx.fillStyle = '#d94f4f';
      rrPath(rw / 2 - 5, -rh / 2, 5, rh, 3); ctx.fill();
      // chevrons marching toward the lip
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      var coff = (wtime * 40) % 16;
      for (var chv = -rh / 2 + 10 - coff; chv < rh / 2 - 6; chv += 16) {
        ctx.beginPath();
        ctx.moveTo(-rw / 2 + 10, chv); ctx.lineTo(-rw / 2 + 22, chv + 8); ctx.lineTo(-rw / 2 + 10, chv + 16);
        ctx.stroke();
      }
      ctx.restore();
    }

    // windmill base (blades sweep above the ball — drawn later)
    if (hole.windmill) {
      var wm0 = hole.windmill;
      var wmx = X(wm0.x), wmy = Y(wm0.y);
      var whr = wm0.hubR * sc;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.ellipse(wmx + 3, wmy + 4, whr * 1.5, whr * 1.3, 0, 0, 6.2832); ctx.fill();
      // little stone hut
      ctx.fillStyle = '#b08968';
      ctx.beginPath(); ctx.arc(wmx, wmy, whr * 1.45, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = '#6b4a2f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(wmx, wmy, whr * 1.45, 0, 6.2832); ctx.stroke();
      ctx.fillStyle = '#8a5f33';
      ctx.beginPath(); ctx.arc(wmx, wmy, whr * 0.55, 0, 6.2832); ctx.fill();
    }

    // transport objects (portals, cannon, tube, ...): own module, own layer
    var tpV = null;
    if (typeof TPR !== 'undefined') {
      tpV = { X: X, Y: Y, sc: sc, wtime: wtime, simTime: simTime, RM: RM };
      TPR.draw(ctx, tpV, hole, ball);
    }

    // cup + flag (the genre's universal target glyph)
    var cupRX = TF.CUP_R * sc * 0.85;
    ctx.fillStyle = B.cup;
    ctx.beginPath(); ctx.arc(X(hole.cup.x), Y(hole.cup.y), cupRX, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(hole.cup.x), Y(hole.cup.y), cupRX, 0, 6.2832); ctx.stroke();
    var poleH = 8.5 * sc;
    var pcx = X(hole.cup.x), pcy = Y(hole.cup.y);
    ctx.strokeStyle = '#f5f2e8'; ctx.lineWidth = Math.max(2, sc * 0.28);
    ctx.beginPath(); ctx.moveTo(pcx, pcy); ctx.lineTo(pcx, pcy - poleH); ctx.stroke();
    // flag streams in the wind (direction + strength — read it before you putt)
    var wNow = TF.windAt(hole, simTime);
    var wMag = Math.hypot(wNow.x, wNow.y);
    var wAng = wMag > 0.05 ? Math.atan2(-wNow.y, wNow.x) : Math.PI;  // world -> screen
    var flagLen = sc * (1.6 + Math.min(2.2, wMag * 0.45));
    var wave = Math.sin(wtime * (3 + wMag * 0.9)) * sc * (0.25 + wMag * 0.08);
    var fx = Math.cos(wAng), fy = Math.sin(wAng);
    var fpx = -fy, fpy = fx;   // perpendicular
    ctx.fillStyle = '#d94f4f';
    ctx.beginPath();
    ctx.moveTo(pcx, pcy - poleH);
    ctx.lineTo(pcx + fx * flagLen + fpx * wave * 0.4, pcy - poleH + fy * flagLen + fpy * wave * 0.4 + sc * 0.5);
    ctx.lineTo(pcx + fpx * sc * 1.9, pcy - poleH + fpy * sc * 1.9 + sc * 1.0);
    ctx.closePath(); ctx.fill();

    drawTurtle();

    // last-shot ghost (faint dashed ring where the previous shot came to rest)
    if (ghost && state === 'play') {
      var gbr = Math.max(4, TF.BALL_R * sc);
      ctx.strokeStyle = 'rgba(255,255,255,.38)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(X(ghost.x), Y(ghost.y), gbr * 1.5, 0, 6.2832); ctx.stroke();
      ctx.setLineDash([]);
    }

    // ball trail (0.5s fade, milestone-unlockable colors)
    if (trail.length > 1 && state !== 'menu') {
      var tcol = trailDef().c, brt = Math.max(3, TF.BALL_R * sc);
      ctx.lineCap = 'round';
      for (i = 1; i < trail.length; i++) {
        var ta = (1 - trail[i].t / 0.5) * 0.5;
        if (ta <= 0) continue;
        ctx.strokeStyle = 'rgba(' + tcol + ',' + ta.toFixed(3) + ')';
        ctx.lineWidth = Math.max(1.5, brt * 0.7 * (i / trail.length));
        ctx.beginPath();
        ctx.moveTo(X(trail[i - 1].x), Y(trail[i - 1].y));
        ctx.lineTo(X(trail[i].x), Y(trail[i].y));
        ctx.stroke();
      }
    }

    // gems + the hidden relic (risk/reward detours + exploration)
    if (hole && state !== 'menu' && state !== 'map') {
      var gi2;
      for (gi2 = 0; gi2 < hole.gems.length; gi2++) {
        var gm = hole.gems[gi2];
        if (gm.taken) continue;
        var ggx = X(gm.x), ggy = Y(gm.y) + Math.sin(wtime * 3 + gi2 * 1.7) * 3;
        var gs = Math.max(4, 1.1 * sc);
        var tw = 0.6 + 0.4 * Math.sin(wtime * 5 + gi2 * 2.3);
        ctx.save(); ctx.translate(ggx, ggy); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = 'rgba(127,231,245,' + (0.55 + 0.35 * tw).toFixed(2) + ')';
        ctx.fillRect(-gs / 2, -gs / 2, gs, gs);
        ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.2;
        ctx.strokeRect(-gs / 2, -gs / 2, gs, gs);
        ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + 0.5 * tw).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(ggx - gs * 0.2, ggy - gs * 0.25, 1.4, 0, 6.2832); ctx.fill();
      }
      if (hole.relic && !hole.relic.taken) {
        var elx = X(hole.relic.x), ely = Y(hole.relic.y) + Math.sin(wtime * 2.2) * 4;
        var els = Math.max(7, 1.8 * sc);
        var hue = (wtime * 90) % 360;
        ctx.save();
        ctx.shadowColor = 'hsla(' + hue + ',90%,65%,.9)';
        ctx.shadowBlur = 14;
        ctx.translate(elx, ely); ctx.rotate(Math.PI / 4 + Math.sin(wtime * 1.5) * 0.2);
        ctx.fillStyle = 'hsla(' + hue + ',90%,68%,.95)';
        ctx.fillRect(-els / 2, -els / 2, els, els);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.6;
        ctx.strokeRect(-els / 2, -els / 2, els, els);
        ctx.restore();
      }
    }

    // balls + soft shadows (one in play, four in a race)
    var drawBalls = (state === 'race' && race) ? race.balls : (ball ? [ball] : []);
    for (var bi = 0; bi < drawBalls.length && state !== 'menu'; bi++) {
      var db = drawBalls[bi];
      if (db.inWater) continue;
      // ball riding a transport object: the transport module draws it
      if (db.carry && tpV && TPR.drawCarried(ctx, tpV, hole, db)) continue;
      var bz = db.z || 0;
      var br = Math.max(3.5, TF.BALL_R * sc) * (1 + bz * 0.05);
      var bx = X(db.x), by = Y(db.y);
      var shR = br * (1 + bz * 0.22);
      ctx.fillStyle = 'rgba(0,0,0,' + Math.max(0.08, 0.25 - bz * 0.02).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(bx + 1.5, by + 2.5, shR * 0.95, shR * 0.8, 0, 0, 6.2832); ctx.fill();
      var airY = by - bz * sc;   // the ball lifts off the ground plane
      ctx.fillStyle = db.color || '#ffffff';
      ctx.beginPath(); ctx.arc(bx, airY, br, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(bx, airY, br, 0, 6.2832); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.arc(bx - br * 0.3, airY - br * 0.3, br * 0.28, 0, 6.2832); ctx.fill();
      // sticky armed: amber ring
      if (db.sticky) {
        ctx.strokeStyle = 'rgba(232,176,75,.95)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(bx, airY, br + 4, 0, 6.2832); ctx.stroke();
      }
    }

    // post-shot curve indicator: bent arrow while bending (SSG3)
    if (ball && (curveDrag || Math.abs(ball.curve || 0) > 0.05) && state !== 'menu') {
      var cv = curveDrag ? (ball.curve || 0) : ball.curve;
      if (Math.abs(cv) > 0.03) {
        var cx0 = X(ball.x), cy0 = Y(ball.y) - 14;
        var cdir = cv > 0 ? 1 : -1;
        ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx0 - cdir * 26, cy0, 26, cdir > 0 ? -0.9 : Math.PI - 0.9, cdir > 0 ? 0.9 : Math.PI + 0.9, cdir < 0);
        ctx.stroke();
        ctx.lineCap = 'butt';
      }
    }

    // windmill blades sweep ABOVE the ball
    if (hole.windmill && state !== 'menu') {
      var wm = hole.windmill;
      var wmx2 = X(wm.x), wmy2 = Y(wm.y);
      var ba = TF.bladeAngle(hole, simTime);
      for (var bl = 0; bl < 4; bl++) {
        var bang = ba + bl * Math.PI / 2;
        var sbx = Math.cos(-bang), sby = Math.sin(-bang);  // world -> screen
        var blen = wm.bladeLen * sc, bwid = Math.max(4, wm.bladeW * sc);
        var hubOff = wm.hubR * sc * 0.6;
        ctx.save(); ctx.translate(wmx2, wmy2); ctx.rotate(Math.atan2(sby, sbx));
        // shadow of the blade on the grass
        ctx.fillStyle = 'rgba(0,0,0,0.13)';
        rrPath(hubOff + 2, -bwid / 2 + 3, blen, bwid, 4); ctx.fill();
        // blade: white with a red tip
        ctx.fillStyle = '#f5f2e8';
        rrPath(hubOff, -bwid / 2, blen, bwid, 4); ctx.fill();
        ctx.fillStyle = '#d94f4f';
        rrPath(hubOff + blen * 0.68, -bwid / 2, blen * 0.32, bwid, 4); ctx.fill();
        ctx.strokeStyle = '#6b4a2f'; ctx.lineWidth = 1.5;
        rrPath(hubOff, -bwid / 2, blen, bwid, 4); ctx.stroke();
        ctx.restore();
      }
      // hub cap on top
      ctx.fillStyle = '#e8b04b';
      ctx.beginPath(); ctx.arc(wmx2, wmy2, Math.max(3, wm.hubR * sc * 0.5), 0, 6.2832); ctx.fill();
      ctx.strokeStyle = '#6b4a2f'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(wmx2, wmy2, Math.max(3, wm.hubR * sc * 0.5), 0, 6.2832); ctx.stroke();
    }

    // bridges: stone arches the ball rolls under
    if (state !== 'menu') {
      for (i = 0; i < hole.bridges.length; i++) {
        var bd = hole.bridges[i];
        var brx = X(bd.x), bry = Y(bd.y);
        var brot = -bd.rot;
        var brw = bd.w * sc, brh = Math.max(10, brw * 0.42);
        ctx.save(); ctx.translate(brx, bry); ctx.rotate(brot);
        // pillars
        ctx.fillStyle = '#9a8f7a';
        rrPath(-brw / 2, -brh / 2, brw * 0.16, brh, 3); ctx.fill();
        rrPath(brw / 2 - brw * 0.16, -brh / 2, brw * 0.16, brh, 3); ctx.fill();
        // arch beam
        var bg2 = ctx.createLinearGradient(0, -brh / 2, 0, brh / 2);
        bg2.addColorStop(0, '#c9bda6'); bg2.addColorStop(1, '#8f8471');
        ctx.fillStyle = bg2;
        rrPath(-brw / 2, -brh / 2 - 4, brw, brh * 0.34, 4); ctx.fill();
        ctx.strokeStyle = '#5e5648'; ctx.lineWidth = 1.5;
        rrPath(-brw / 2, -brh / 2 - 4, brw, brh * 0.34, 4); ctx.stroke();
        ctx.restore();
      }
    }

    drawParticles();

    // wind streaks: the air itself drifts across the hole (read the wind)
    if (state !== 'menu' && hole) {
      var wSk = TF.windAt(hole, simTime);
      var wSpd = Math.hypot(wSk.x, wSk.y);
      if (wSpd > 0.4) {
        ctx.lineCap = 'round';
        var sa = Math.atan2(-wSk.y, wSk.x);   // world -> screen
        var slen = Math.min(26, 6 + wSpd * 2.2);
        var fade = 0.10 + Math.min(0.14, wSpd * 0.02);
        ctx.strokeStyle = 'rgba(255,255,255,' + fade.toFixed(3) + ')';
        ctx.lineWidth = 2;
        for (var ws = 0; ws < 14; ws++) {
          var h1 = Math.sin(ws * 127.1 + hole.seed) * 43758.55;
          var px0 = (h1 - Math.floor(h1)) * TF.W;
          var h2 = Math.sin(ws * 311.7 + hole.seed * 0.7) * 12543.2;
          var py0 = (h2 - Math.floor(h2)) * TF.H;
          var ax = (((px0 + wSk.x * simTime * 1.6) % TF.W) + TF.W) % TF.W;
          var ay = (((py0 + wSk.y * simTime * 1.6) % TF.H) + TF.H) % TF.H;
          ctx.beginPath();
          ctx.moveTo(X(ax) - Math.cos(sa) * slen / 2, Y(ay) - Math.sin(sa) * slen / 2);
          ctx.lineTo(X(ax) + Math.cos(sa) * slen / 2, Y(ay) + Math.sin(sa) * slen / 2);
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
      }
    }

    // aim: dotted predicted path (bends with the break) + landing marker + power ring
    if (aiming && drag && aimPts.length) {
      var v = dragVel();
      var odAim = !!(v && v[3]);
      for (i = 0; i < aimPts.length; i++) {
        ctx.globalAlpha = 0.9 - (i / aimPts.length) * 0.65;
        ctx.fillStyle = odAim ? 'rgba(255,110,80,0.95)' : 'rgba(255,255,255,0.95)';
        var jx = 0, jy = 0;
        if (odAim) { jx = (Math.random() * 2 - 1) * 3.5; jy = (Math.random() * 2 - 1) * 3.5; }
        ctx.beginPath(); ctx.arc(X(aimPts[i][0]) + jx, Y(aimPts[i][1]) + jy, 2.4, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (aimPts.length > 1) {
        var lm = aimPts[aimPts.length - 1];
        var wob = (v && v[2] > 0.85) ? Math.sin(wtime * 28) * 3 : 0;
        ctx.strokeStyle = odAim ? 'rgba(255,110,80,.9)' : 'rgba(255,255,255,.85)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(X(lm[0]) + wob, Y(lm[1]), 7, 0, 6.2832); ctx.stroke();
        ctx.fillStyle = odAim ? 'rgba(255,110,80,.9)' : 'rgba(255,255,255,.85)';
        ctx.beginPath(); ctx.arc(X(lm[0]) + wob, Y(lm[1]), 1.8, 0, 6.2832); ctx.fill();
      }
      // landing-spot indicator (A Little Golf Journey): where the ball touches down
      if (aimLand) {
        var alx = X(aimLand.x), aly = Y(aimLand.y);
        var alc = aimLand.air ? 'rgba(140,230,150,' : 'rgba(255,255,255,';
        ctx.strokeStyle = alc + '.9)'; ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.arc(alx, aly, 9, 0, 6.2832); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(alx - 5, aly - 5); ctx.lineTo(alx + 5, aly + 5);
        ctx.moveTo(alx + 5, aly - 5); ctx.lineTo(alx - 5, aly + 5);
        ctx.stroke();
      }
      if (v && ball) {
        ctx.strokeStyle = odAim ? 'rgba(255,110,80,.85)' : 'rgba(255,255,255,.7)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(X(ball.x), Y(ball.y), br2(v[2]), 0, 6.2832); ctx.stroke();
      }
      // spin indicator: curved arrow around the ball while aiming
      if (Math.abs(spinVal) > 0.05 && ball) {
        var sx = X(ball.x), sy = Y(ball.y), sr = Math.max(3.5, TF.BALL_R * sc);
        var rr = sr * 2.3, dir = spinVal > 0 ? 1 : -1;
        var sweep = 0.6 + Math.abs(spinVal) * 2.4;
        var a0 = -Math.PI / 2 - sweep / 2, a1 = -Math.PI / 2 + sweep / 2;
        ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(sx, sy, rr, a0, a1); ctx.stroke();
        var ae = dir > 0 ? a1 : a0;
        var ex = sx + Math.cos(ae) * rr, ey = sy + Math.sin(ae) * rr;
        var tang = ae + dir * Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(tang - dir * 0.55) * 8, ey - Math.sin(tang - dir * 0.55) * 8);
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(tang + dir * 0.55) * 8, ey - Math.sin(tang + dir * 0.55) * 8);
        ctx.stroke();
      }
    }

    // wind gauge (top-right): live arrow + strength pips
    if (state === 'play' && hole && hole.wind.base > 0) {
      var wG = TF.windAt(hole, simTime);
      var wGm = Math.hypot(wG.x, wG.y);
      var gx = cw - 54, gy = 116;
      ctx.fillStyle = 'rgba(15,35,25,0.5)';
      ctx.beginPath(); ctx.arc(gx, gy, 21, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(gx, gy, 21, 0, 6.2832); ctx.stroke();
      if (wGm > 0.1) {
        var ga = Math.atan2(-wG.y, wG.x);
        var gax = Math.cos(ga), gay = Math.sin(ga);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(gx - gax * 11, gy - gay * 11);
        ctx.lineTo(gx + gax * 11, gy + gay * 11);
        ctx.stroke();
        // arrowhead
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(gx + gax * 15, gy + gay * 15);
        ctx.lineTo(gx + Math.cos(ga + 2.6) * 9, gy + Math.sin(ga + 2.6) * 9);
        ctx.lineTo(gx + Math.cos(ga - 2.6) * 9, gy + Math.sin(ga - 2.6) * 9);
        ctx.closePath(); ctx.fill();
        ctx.lineCap = 'butt';
      }
      var pips = Math.min(3, Math.ceil(wGm / 2.4));
      for (var pp = 0; pp < 3; pp++) {
        ctx.fillStyle = pp < pips ? '#ffd75e' : 'rgba(255,255,255,0.25)';
        ctx.beginPath(); ctx.arc(gx - 12 + pp * 12, gy + 32, 3.5, 0, 6.2832); ctx.fill();
      }
    }

    // race countdown: 3…2…1…GO
    if (state === 'race' && race && race.countT > 0) {
      var cd = Math.ceil(race.countT);
      ctx.fillStyle = 'rgba(10,25,15,0.45)';
      ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = '#fff';
      ctx.font = '700 ' + Math.round(cw * 0.22) + 'px system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(cd > 0 ? String(cd) : 'GO!', cw / 2, ch / 2);
      ctx.font = '600 ' + Math.round(cw * 0.05) + 'px system-ui';
      ctx.fillText('First ball in the cup wins', cw / 2, ch / 2 + cw * 0.16);
    }

    // hole morph melt (Wonderputt): squash + white bloom as the hole melts away
    if (state === 'morph') {
      var mk = 1 - Math.max(0, morphT) / 1.1;
      canvas.style.transform = 'scaleY(' + (1 - 0.30 * mk).toFixed(3) + ')';
      ctx.fillStyle = 'rgba(255,255,255,' + (mk * 0.75).toFixed(3) + ')';
      ctx.fillRect(0, 0, cw, ch);
    } else if (canvas.style.transform) {
      canvas.style.transform = '';
    }
  }
  function br2(frac) { return Math.max(6, TF.BALL_R * sc) + Math.min(frac, 1.25) * 26; }

  /* ---------------- main loop: fixed-timestep accumulator ---------------- */
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!running || document.hidden) return;
    var dt = Math.min(((ts - last) / 1000) || 0.016, 0.1);   // clamp
    last = ts;
    if (slowT > 0) { slowT -= dt; timeScale = 0.3; } else timeScale = 1;
    wtime += dt;
    if (state === 'race' && hole && ball && race) stepRace(dt * timeScale);
    // hole morph: melt timer, then the queued transition
    if (state === 'morph') {
      morphT -= dt;
      if (Math.random() < 0.6 && hole && ball) {
        particles.push({ x: ball.x + (Math.random() * 2 - 1) * 20,
                         y: ball.y + (Math.random() * 2 - 1) * 20,
                         vx: 0, vy: 6 + Math.random() * 6, t: 0, life: 0.9,
                         c: '255,255,255', r: 1.5 + Math.random() * 2 });
      }
      if (morphT <= 0 && morphNext) { var mn = morphNext; morphNext = null; mn(); }
    }
    // sway-unless-focused: holding the drag still focuses the aim
    if (aiming && drag) {
      dragStillT += dt;
      var swTarget = dragStillT > 0.7 ? 0 : 1;
      swayAmp += (swTarget - swayAmp) * Math.min(1, dt * 6);
      if (swayAmp > 0.02) repredict();   // the dotted path visibly sways until focused
    } else if (!aiming) swayAmp = 0;
    if (state === 'play' && hole && ball) {
      acc += dt * timeScale;
      var n = 0;
      while (acc >= STEP && n < 8) { stepPhysics(); acc -= STEP; n++; if (state !== 'play') { acc = 0; break; } }
      if (n === 8) acc = 0;
      // ball trail: 0.5s fade while in flight
      if (inFlight && !ball.resting) {
        trail.push({ x: ball.x, y: ball.y, t: 0 });
        if (trail.length > 48) trail.shift();
      }
    }
    for (var ti = trail.length - 1; ti >= 0; ti--) {
      trail[ti].t += dt;
      if (trail[ti].t > 0.5) trail.splice(ti, 1);
    }
    updateTurtle(dt);
    updateParticles(dt * timeScale);
    if (typeof TPR !== 'undefined') TPR.tick(dt);   // transport particle pool
    // roll bed follows ball speed; bandpass retunes for sand vs grass
    if (AU.ctx && AU.rollGain) {
      var spd = ball && !ball.resting ? Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) : 0;
      var target = (spd > 1.5) ? Math.min(spd / 30, 1) * 0.10 : 0;
      var g = AU.rollGain.gain;
      g.value += (target - g.value) * 0.25;
      if (AU.rollFilter && ball && hole) {
        var sandF = TF.surfaceAt(hole, ball.x, ball.y) === 'sand' ? 380 : 780;
        var rf = AU.rollFilter.frequency;
        rf.value += (sandF - rf.value) * 0.2;
      }
    }
    render();
  }

  /* ---------------- HUD / popups / transitions ---------------- */
  function refreshButtons() {
    var canAct = state === 'play' && ball && ball.resting && !inFlight;
    $('btn-undo').hidden = !(canAct && undoSnap);
    $('btn-skip').hidden = !(canAct && strokes >= 20);
    $('btn-trail').hidden = state !== 'play';
    $('btn-mute').hidden = state !== 'play';
    updatePowBtn();
  }
  function updateHUD() {
    if (!hole) return;
    if (state === 'race' && race) {
      var t = Math.floor(race.t);
      var order = race.balls.slice().sort(function (p, q) {
        if (p.finished && q.finished) return p.finishT - q.finishT;
        if (p.finished) return -1;
        if (q.finished) return 1;
        return Math.hypot(p.x - hole.cup.x, p.y - hole.cup.y) -
               Math.hypot(q.x - hole.cup.x, q.y - hole.cup.y);
      });
      var place = order.indexOf(ball) + 1;
      $('hud-hole').textContent = race.countT > 0 ? 'READY…' : 'RACE · P' + place + '/4 · 0:' + (t < 10 ? '0' : '') + t;
      $('hud-meta').textContent = 'First ball in the cup wins' + ((ball.gems | 0) ? ' · ◆' + ball.gems : '') +
        (ball.sticky ? ' · ◉ sticky' : '');
      refreshButtons();
      return;
    }
    var avg = holeScores.length ? TF.avgLast(holeScores, 50) : 0;
    var hn = 'Hole ' + holeIndex + (holeNameStr ? ' · ' + holeNameStr : '') +
             (avg ? ' · avg ' + avg.toFixed(1) : '');
    $('hud-hole').textContent = hn;
    var m = 'PAR ' + par() + ' · ' + strokes + (strokes === 1 ? ' STROKE' : ' STROKES');
    if (mode === 'tour') m += ' · Σ ' + totalStrokes + ' · ★ ' + totalStars;
    else m += ' · ★ ' + totalStars;
    if (ball && (ball.gems | 0)) m += ' · ◆' + ball.gems;
    $('hud-meta').textContent = m;
    refreshButtons();
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

  function goToHole(n, s, opts) {
    var tr = $('transit');
    $('transit-hole').textContent = 'HOLE ' + n;
    $('transit-name').textContent = '';
    tr.classList.remove('out');
    tr.classList.add('in');
    setTimeout(function () {
      loadHole(n, s, opts);
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

  /* ---------------- world map (ALGJ): stars color in the biomes ----------------
   * No fail state, no gating — the map itself is the visual reward. */
  function showMap() {
    AU.init(); AU.click();
    state = 'map';
    running = true;
    $('menu').classList.remove('on');
    $('result').classList.remove('on');
    $('hud').hidden = true;
    var h = '', total = 0, i;
    for (i = 0; i < 4; i++) {
      var st = biomeStars[i] || 0;
      total += st;
      var sat = Math.min(1, st / 15);   // full color at 15 stars
      h += '<div class="map-isle">' +
           '<div class="map-disc" style="background:' + BIOMES[i].fairA +
           ';filter:saturate(' + sat.toFixed(2) + ') brightness(' + (0.5 + 0.5 * sat).toFixed(2) + ')"></div>' +
           '<div class="map-name">' + BIOME_NAMES[i] + '</div>' +
           '<div class="map-stars">' + st + ' ★</div></div>';
    }
    $('map-islands').innerHTML = h;
    $('map-total').textContent = total + ' ★ earned · ' + relicCount + ' ✦ relics found';
    $('map').classList.add('on');
    refreshButtons();
  }

  /* ---------------- race mode (SSG3 Race / Golf Blitz) ----------------
   * Everyone putts at once — you against 3 bots, first ball in the cup wins.
   * One hole, ~60 seconds. Bumping a gem-carrier spills a gem your way. */
  var RACE_BOT_COLORS = ['#ff6b6b', '#4ecdc4', '#ffd93d'];
  var RACE_BOT_NAMES = ['Birdie', 'Bogey', 'Albatross'];
  function startRace() {
    AU.init(); AU.click();
    var ridx = (Math.random() * TF.HOLES.length) | 0;
    hole = TF.makeHole(TF.HOLES[ridx], ridx, { transports: true });  // tour layout + transport toys
    seed = hole.seed;
    simTime = 0;
    curBiome = (Math.random() * 4) | 0;
    document.body.setAttribute('data-biome', String(curBiome));
    AU.setBiome(curBiome);
    race = { balls: [], bots: [], t: 0, countT: 3.0, over: false };
    for (var i = 0; i < 4; i++) {
      var b = TF.newBall(hole);
      b.x = hole.tee.x + (i - 1.5) * 3;
      b.color = i === 0 ? '#ffffff' : RACE_BOT_COLORS[i - 1];
      b.rname = i === 0 ? 'You' : RACE_BOT_NAMES[i - 1];
      race.balls.push(b);
      if (i > 0) {
        var bs = TF.botState(hole);
        bs.ball = b;
        bs.think = 0.6 + Math.random() * 1.2 + i * 0.3;
        bs.lastRest = { x: b.x, y: b.y };
        race.bots.push(bs);
      }
    }
    ball = race.balls[0];
    strokes = 0; inFlight = false; aiming = false; drag = null; aimPts = [];
    spinVal = 0; spinPointer = null; ghost = null; undoSnap = null; trail = [];
    curveDrag = null; aimLand = null;
    particles = [];
    lastRest = { x: ball.x, y: ball.y };
    fit(); buildSpeckles(); initTurtle();
    state = 'race';
    running = true;
    last = performance.now();
    $('menu').classList.remove('on');
    $('result').classList.remove('on');
    $('hud').hidden = false;
    updateHUD(); updatePowBtn();
    toast('Race! First ball in the cup wins.', 2600);
  }
  function raceWater(b, bs) {
    splashAt(b.x, b.y);
    AU.splash();
    var lr = bs ? bs.lastRest : lastRest;
    b.x = lr.x; b.y = lr.y;
    b.vx = 0; b.vy = 0; b.vz = 0; b.z = 0; b.resting = true;
    b.inWater = false; b.curve = 0;
    if (b === ball) { inFlight = false; toast('Splash! Time lost.'); }
  }
  function stepRace(dt) {
    race.t += dt;
    var i, bs, b;
    if (race.countT > 0) {
      race.countT -= dt;   // countdown: balls held at the tee
      return;
    }
    // bots think, then shoot when settled
    for (i = 0; i < race.bots.length; i++) {
      bs = race.bots[i]; b = bs.ball;
      if (b.inCup) continue;
      if (b.inWater) { raceWater(b, bs); continue; }
      if (b.resting) {
        bs.lastRest = { x: b.x, y: b.y };
        bs.think -= dt;
        if (bs.think <= 0) {
          var v = TF.botShot(hole, bs);
          if (v) { TF.shoot(b, v[0], v[1], {}); bs.think = 0.8 + Math.random() * 1.2; }
          else bs.think = 0.3;
        }
      }
    }
    if (ball.inWater) raceWater(ball, null);
    // physics substeps
    var steps = Math.max(1, Math.min(4, Math.round(dt / STEP)));
    for (var s = 0; s < steps; s++) {
      TF.raceStep(hole, race.balls, simTime);
      simTime += STEP;
    }
    // juice + finish detection
    for (i = 0; i < race.balls.length; i++) {
      b = race.balls[i];
      if (b.impact > 1.2) { thudAt(b.x, b.y, b.impact); b.impact = 0; }
      if (b.pickup) {
        if (b === ball) pickupJuice(b.pickup);
        b.pickup = null;
      }
      if (b.tevent && typeof TPR !== 'undefined') { TPR.event(b.tevent); b.tevent = null; }
      if (b.inCup && !b.finished) {
        b.finished = true; b.finishT = race.t;
        if (b === ball) { AU.chime(true); AU.clunk(); HAP.buzz([10, 40, 10]); }
        else toast(b.rname + ' holed out!');
      }
    }
    if (ball.resting && inFlight) { inFlight = false; lastRest = { x: ball.x, y: ball.y }; }
    // HUD: refresh place + clock about once a second
    if (((race.t | 0) !== (race._hudT | 0)) || race.countT > 0 !== race._wasCount) {
      race._hudT = race.t; race._wasCount = race.countT > 0;
      updateHUD();
    }
    if (trail && ball && !ball.resting) {
      trail.push({ x: ball.x, y: ball.y, t: 0 });
      if (trail.length > 48) trail.shift();
    }
    if (!race.over && (ball.finished || race.t > 90)) endRace();
  }
  function endRace() {
    race.over = true;
    state = 'result';
    // places: finished by time, then unfinished by distance to cup
    var order = race.balls.slice().sort(function (p, q) {
      if (p.finished && q.finished) return p.finishT - q.finishT;
      if (p.finished) return -1;
      if (q.finished) return 1;
      var pd = Math.hypot(p.x - hole.cup.x, p.y - hole.cup.y);
      var qd = Math.hypot(q.x - hole.cup.x, q.y - hole.cup.y);
      return pd - qd;
    });
    var place = order.indexOf(ball) + 1;
    var award = place === 1 ? 3 : (place === 2 ? 2 : 1);
    var pk = ['brake', 'sticky', 'mulligan'];
    for (var i = 0; i < award; i++) {
      var k = pk[(Math.random() * 3) | 0];
      if (POW[k] < 5) POW[k]++;
    }
    savePow(); updatePowBtn();
    var medals = ['🥇', '🥈', '🥉', '4th'];
    var lines = order.map(function (rb, i) {
      var g = rb.gems | 0;
      return (i + 1) + '. ' + rb.rname + (rb.finished ? ' · holed' : ' · ' + Math.round(Math.hypot(rb.x - hole.cup.x, rb.y - hole.cup.y)) + 'u out') +
             (g ? ' · ◆' + g : '');
    });
    $('result-stars').textContent = medals[place - 1] || (place + 'th');
    $('result-title').textContent = place === 1 ? 'You win the race!' : 'Race over';
    $('result-sub').innerHTML = 'You finished <b>' + place + ordinal(place) + '</b> of 4<br>' +
      lines.join('<br>') + '<br><br>+' + award + ' power-up' + (award > 1 ? 's' : '') + ' earned';
    $('result').classList.add('on');
    $('hud').hidden = true;
    race = null;
    AU.click();
  }
  function ordinal(n) { return n === 1 ? 'st' : (n === 2 ? 'nd' : (n === 3 ? 'rd' : 'th')); }

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
      '<button id="arc-lb-go" class="btn" type="button" style="width:auto;padding:12px 18px">SAVE</button></div>';
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
    refreshButtons();
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
  function startTour() {
    AU.init(); AU.click();
    mode = 'tour';
    seenHint = {};
    var save = loadRun();
    if (save && save.mode === 'tour' && save.holeIndex >= 1 && save.holeIndex <= TF.HOLES.length) {
      totalStrokes = save.totalStrokes || 0;
      totalStars = save.totalStars || 0;
      holeScores = save.holeScores || [];
      prevKiller = false;
      loadHole(save.holeIndex || 1);
    } else {
      totalStrokes = 0; totalStars = 0; holeScores = []; prevKiller = false;
      loadHole(1);
    }
    startPlay();
  }
  function startDaily() {
    AU.init(); AU.click();
    function go() {
      mode = 'daily';
      totalStrokes = 0; totalStars = 0;
      // intro grammar: the least-seen transport mechanic gets the spotlight
      var tmD = TF.TRANSPORT_MECHS, dpickD = tmD[0], dbestD = Infinity, dmiD;
      for (dmiD = 0; dmiD < tmD.length; dmiD++) {
        var dcD = seenMechs[tmD[dmiD]] | 0;
        if (dcD < dbestD) { dbestD = dcD; dpickD = tmD[dmiD]; }
      }
      var dintroD = dbestD === 0 ? 'new' : (Math.random() < 0.25 ? 'twist' : 'challenge');
      loadHole(1, dailyInfo.seed, { intro: dintroD, focusMech: dpickD });
      for (dmiD = 0; dmiD < hole.mechanics.length; dmiD++)
        seenMechs[hole.mechanics[dmiD]] = (seenMechs[hole.mechanics[dmiD]] | 0) + 1;
      savePow();
      if (dintroD === 'new' && MECH_HINTS[dpickD]) toast(MECH_HINTS[dpickD], 2600);
      startPlay();
    }
    if (!dailyInfo) {
      $('daily-sub').textContent = 'fetching today’s hole…';
      fetchDaily(go);
    } else go();
  }
  function refreshMenu() {
    var save = loadRun();
    var resumable = save && save.mode === 'tour' && save.holeIndex >= 1 && save.holeIndex <= TF.HOLES.length;
    $('endless-sub').textContent = resumable ?
      ('resume hole ' + save.holeIndex + ' of 20 · Σ ' + (save.totalStrokes || 0)) : '20 designed holes · par 71';
    $('btn-newrun').hidden = !resumable;
    var best = null;
    try { best = JSON.parse(lsGet('tf_tourbest', 'null')); } catch (e) {}
    $('menu-best').textContent = best ?
      ('Best tour: ' + best.strokes + ' strokes · ' + (best.stars || 0) + ' ★') :
      'No tours yet — the fairway awaits.';
    updateDailySub();
  }

  $('btn-undo').addEventListener('click', function (e) { e.stopPropagation(); undoShot(); });
  $('btn-skip').addEventListener('click', function (e) { e.stopPropagation(); skipHole(); });
  $('btn-trail').addEventListener('click', function (e) {
    e.stopPropagation();
    AU.init(); AU.click();
    var un = unlockedTrails();
    var gi = 0;
    for (var i = 0; i < un.length; i++) if (un[i].n === trailSel) gi = i;
    trailSel = un[(gi + 1) % un.length].n;
    lsSet('tf_trail', trailSel);
    toast('Trail: ' + trailSel + ' (' + (gi + 2 > un.length ? 1 : gi + 2) + '/' + un.length + ')');
  });
  var muteState = 0;   // 0: all on, 1: wind off, 2: muted
  $('btn-mute').addEventListener('click', function (e) {
    e.stopPropagation();
    AU.init();
    muteState = (muteState + 1) % 3;
    AU.setWindMuted(muteState >= 1);
    AU.setMuted(muteState === 2);
    $('btn-mute').textContent = muteState === 2 ? '🔇' : (muteState === 1 ? '🔈' : '🔊');
    AU.click();
    toast(muteState === 0 ? 'Sound on' : (muteState === 1 ? 'Wind bed off' : 'All sound off'));
  });

  $('btn-pow').addEventListener('click', function (e) { e.stopPropagation(); powTap(); });
  $('btn-race').addEventListener('click', startRace);
  $('btn-map').addEventListener('click', showMap);
  $('btn-map-back').addEventListener('click', function () {
    AU.click();
    $('map').classList.remove('on');
    $('menu').classList.add('on');
    state = 'menu';
    refreshButtons();
  });
  $('btn-endless').addEventListener('click', startTour);
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
  $('btn-haptic').addEventListener('click', function () {
    AU.init(); AU.click();
    HAP.toggle();
  });
  $('btn-menu').addEventListener('click', function () {
    AU.click();
    state = 'menu';
    running = false;
    $('result').classList.remove('on');
    $('menu').classList.add('on');
    refreshButtons();
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
  maxHole = parseInt(lsGet('tf_maxhole', '1'), 10) || 1;
  trailSel = lsGet('tf_trail', 'Cloud');
  loadPow();
  HAP.init();
  if (typeof TPR !== 'undefined') TPR.attachAudio(AU);   // transport SFX
  refreshMenu();
  refreshButtons();
  fetchDaily();                       // prefetch today's hole in the background
  // idle menu backdrop: render hole 1 of a demo seed behind the menu
  try {
    hole = TF.genHole(1234567);
    curBiome = 0;
    ball = TF.newBall(hole); ball.resting = true;
    fit(); buildSpeckles(); initTurtle();
    running = true; last = performance.now();
  } catch (e) {}
  requestAnimationFrame(loop);
  window.TF_DEBUG = { loadHole: loadHole, hole: function () { return hole; },
    debugShot: function (vx, vy) {   // test/screenshot driver: real shot path, no drag
      if (state !== 'play' || inFlight || !ball.resting) return false;
      TF.shoot(ball, vx, vy, {}); strokes++; totalStrokes++; inFlight = true; updateHUD();
      return true;
    },
    getState: function () { return { state: state, strokes: strokes, totalStrokes: totalStrokes, holeIndex: holeIndex, inFlight: inFlight, aiming: aiming, ball: ball, ghost: ghost, spinVal: spinVal }; } };
})();
