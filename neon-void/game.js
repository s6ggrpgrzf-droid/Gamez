/* Neon Void — Geometry Wars-style twin-stick arena shooter. DEEP PASS.
 * IDENTITY: electric, sharp, relentless. Every juice choice serves it.
 * Sim/render separation: update() never draws; render() never mutates sim state
 * (DOM HUD writes are batched through S.hudDirty and flushed once per frame).
 * Seeded PRNG (mulberry32) drives ALL sim randomness — daily seed = shared void. */
'use strict';
(function () {
  var CFG = window.NV_CONFIG || {};
  var C_PLAYER = CFG.player || {}, C_DASH = CFG.dash || {}, C_SPAWN = CFG.spawn || {},
      C_SURGE = CFG.surge || {}, C_ELITE = CFG.elite || {}, C_WELL = CFG.well || {},
      C_GEOM = CFG.geoms || {}, C_COMBAT = CFG.combat || {}, C_LIVES = CFG.lives || {},
      C_FX = CFG.fx || {}, C_AUDIO = CFG.audio || {}, C_PERF = CFG.perf || {},
      C_DIFF = CFG.difficulty || {}, C_REMEMBER = CFG.remembers || {},
      C_EN = CFG.enemies || {}, C_HAP = CFG.haptics || {};

  /* ================= canvas / resize ================= */
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, C_PERF.dprCap || 2);
    var vv = window.visualViewport;
    W = Math.round(vv ? vv.width : window.innerWidth);
    H = Math.round(vv ? vv.height : window.innerHeight);
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildGrid();
    buildVignette();
  }
  window.addEventListener('resize', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

  /* ================= seeded PRNG — ALL sim randomness flows through rng() ================= */
  var _rs = 1;
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rng = mulberry32(1);
  function reseed(seed) { rng = mulberry32(seed >>> 0); _rs = seed >>> 0; }
  function rr(a, b) { return a + rng() * (b - a); }       // sim range
  function pick(arr) { return arr[(rng() * arr.length) | 0]; }
  function hashStr(s) { // fallback daily seed when the worker is unreachable
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* ================= settings ================= */
  var NVSET = { haptics: true, mute: false, motion: 'auto', tilt: false };
  try {
    var _s = JSON.parse(localStorage.getItem('nv_settings') || '{}');
    for (var _k in NVSET) if (typeof _s[_k] === typeof NVSET[_k]) NVSET[_k] = _s[_k];
  } catch (e) {}
  function saveSettings() { try { localStorage.setItem('nv_settings', JSON.stringify(NVSET)); } catch (e) {} }
  var RM_OS = false;
  try { RM_OS = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
  function reduceMotion() { return NVSET.motion === 'reduced' || (NVSET.motion === 'auto' && RM_OS); }

  function buzz(pattern) { // guarded haptics: never throws; iOS = silent no-op
    try {
      if (!NVSET.haptics || reduceMotion() || !('vibrate' in navigator)) return;
      navigator.vibrate(pattern);
    } catch (e) {}
  }
  var HAP = {
    select: function () { buzz(C_HAP.select); },
    light: function () { buzz(C_HAP.light); },
    medium: function () { buzz(C_HAP.medium); },
    success: function () { buzz(C_HAP.success); },
    warning: function () { buzz(C_HAP.warning); },
    error: function () { buzz(C_HAP.error); }
  };

  /* ================= warped grid (spring physics) ================= */
  var grid = [], GW = 0, GH = 0, GS = 40;
  function buildGrid() {
    GW = Math.ceil(W / GS) + 2; GH = Math.ceil(H / GS) + 2;
    grid = [];
    for (var y = 0; y < GH; y++) {
      grid[y] = [];
      for (var x = 0; x < GW; x++) grid[y][x] = { ox: 0, oy: 0, vx: 0, vy: 0 };
    }
  }
  function warpGrid(x, y, force) {
    var gx = Math.round(x / GS), gy = Math.round(y / GS);
    for (var dy = -5; dy <= 5; dy++) for (var dx = -5; dx <= 5; dx++) {
      var ix = gx + dx, iy = gy + dy;
      if (ix < 0 || iy < 0 || ix >= GW || iy >= GH) continue;
      var d = Math.sqrt(dx * dx + dy * dy) || 0.5;
      var p = grid[iy][ix];
      p.vx += (dx / d) * force / d; p.vy += (dy / d) * force / d;
    }
  }
  var churnT = 0;
  function churnGrid(dt, lowPerf) {
    churnT += dt;
    var surgePulse = (S && S.surgeWarn > 0) ? 1.6 : 1; // grid breathes red before a surge
    for (var y = 0; y < GH; y += 2) for (var x = 0; x < GW; x += 2) {
      var p = grid[y][x];
      var wave = Math.sin(churnT * 1.3 + x * 0.55 + y * 0.4) * 3.4
               + Math.sin(churnT * 0.7 - x * 0.3 + y * 0.6) * 2.4;
      p.vx += Math.cos(churnT * 0.9 + y * 0.5) * wave * dt * 4.5 * surgePulse;
      p.vy += Math.sin(churnT * 1.1 + x * 0.5) * wave * dt * 4.5 * surgePulse;
    }
    if (!lowPerf && rng() < dt * 9) warpGrid(rng() * W, rng() * H, 14 + rng() * 20);
  }
  function updateGrid() {
    for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) {
      var p = grid[y][x];
      p.vx += (-p.ox * 0.12 - p.vx * 0.08);
      p.vy += (-p.oy * 0.12 - p.vy * 0.08);
      p.ox += p.vx; p.oy += p.vy;
    }
  }
  var surgeVignette = null;
  function buildVignette() { // prerendered red-edge vignette for void surges
    surgeVignette = document.createElement('canvas');
    surgeVignette.width = Math.max(2, W >> 1); surgeVignette.height = Math.max(2, H >> 1);
    var c = surgeVignette.getContext('2d');
    var g = c.createRadialGradient(W / 4, H / 4, Math.min(W, H) / 6, W / 4, H / 4, Math.max(W, H) / 2.4);
    g.addColorStop(0, 'rgba(255,40,60,0)');
    g.addColorStop(1, 'rgba(255,40,60,0.55)');
    c.fillStyle = g; c.fillRect(0, 0, W >> 1, H >> 1);
  }

  /* ================= baked-glow sprite atlas =================
     Per-frame shadowBlur was the #1 mobile perf cost. Glow is now baked ONCE
     into offscreen sprites; the frame loop is pure drawImage — same neon look,
     ~10x cheaper. This is the contained answer to "WebGL or not" for this game. */
  function makeSprite(size, drawFn) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    g.translate(size / 2, size / 2);
    drawFn(g, size / 2);
    return c;
  }
  function glowStroke(g, color, width, blur) {
    g.strokeStyle = color; g.lineWidth = width;
    g.shadowColor = color; g.shadowBlur = blur;
  }
  var ATLAS = {};
  function buildAtlas() {
    var E = C_EN;
    function enemySprite(key, r, drawFn) {
      var size = Math.ceil(r * 2 + 28);
      ATLAS[key] = { c: makeSprite(size, function (g) {
        glowStroke(g, E[key].color, 2.5, 12);
        drawFn(g, r);
        g.stroke();
      }), half: size / 2 };
    }
    enemySprite('wanderer', E.wanderer.r, function (g, s) {
      g.strokeRect(-s / 1.4, -s / 1.4, s * 1.4, s * 1.4);
      g.beginPath(); g.moveTo(-s, 0); g.lineTo(s, 0); g.moveTo(0, -s); g.lineTo(0, s);
    });
    enemySprite('seeker', E.seeker.r, function (g, r) {
      g.beginPath();
      g.moveTo(r, 0); g.lineTo(-r, r * 0.7); g.lineTo(-r * 0.4, 0); g.lineTo(-r, -r * 0.7);
      g.closePath();
    });
    enemySprite('weaver', E.weaver.r, function (g, r) {
      g.beginPath();
      for (var i = 0; i <= 6; i++) {
        var a = i / 6 * Math.PI * 2, rad = r * (i % 2 ? 0.55 : 1);
        var px = Math.cos(a) * rad, py = Math.sin(a) * rad;
        if (i) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.closePath();
    });
    enemySprite('spinner', E.spinner.r, function (g, sr) {
      g.beginPath();
      for (var j = 0; j < 8; j++) {
        var a2 = j / 8 * Math.PI * 2;
        g.moveTo(0, 0); g.lineTo(Math.cos(a2) * sr, Math.sin(a2) * sr);
      }
      g.moveTo(sr * 0.35, 0); g.arc(0, 0, sr * 0.35, 0, 7);
    });
    // dreadnought elite: heavy double-diamond with hot core
    ATLAS.dread = (function () {
      var size = 128;
      return { c: makeSprite(size, function (g) {
        glowStroke(g, '#ff3355', 3.5, 16);
        g.beginPath();
        g.moveTo(0, -30); g.lineTo(22, 0); g.lineTo(0, 30); g.lineTo(-22, 0); g.closePath();
        g.moveTo(0, -16); g.lineTo(12, 0); g.lineTo(0, 16); g.lineTo(-12, 0); g.closePath();
        g.stroke();
        g.fillStyle = '#ff8899'; g.shadowColor = '#ff3355'; g.shadowBlur = 14;
        g.beginPath(); g.arc(0, 0, 5, 0, 7); g.fill();
      }), half: size / 2 };
    })();
    ATLAS.ship = (function () {
      var size = 72;
      return { c: makeSprite(size, function (g) {
        glowStroke(g, '#ffffff', 2.5, 12);
        g.beginPath();
        g.moveTo(16, 0); g.lineTo(-8, -11); g.lineTo(-3, 0); g.lineTo(-8, 11); g.closePath();
        g.stroke();
        glowStroke(g, '#66ccff', 1.5, 10);
        g.beginPath(); g.arc(0, 0, 5, 0, 7); g.stroke();
      }), half: size / 2 };
    })();
    ATLAS.bullet = (function () {
      var size = 28;
      return { c: makeSprite(size, function (g) {
        g.fillStyle = '#fff'; g.shadowColor = '#9fe8ff'; g.shadowBlur = 10;
        g.beginPath(); g.arc(0, 0, 3.5, 0, 7); g.fill();
      }), half: size / 2 };
    })();
    ATLAS.geom = (function () {
      var size = 36;
      return { c: makeSprite(size, function (g) {
        glowStroke(g, '#ffe14d', 2, 10);
        var s = 6;
        g.beginPath();
        g.moveTo(0, -s); g.lineTo(s, 0); g.lineTo(0, s); g.lineTo(-s, 0); g.closePath();
        g.stroke();
      }), half: size / 2 };
    })();
    // nebulae: huge soft color fields for background depth
    ATLAS.nebulae = [
      { c: nebSprite('138,60,255'), x: 0.2, y: 0.3, s: 2.6, vx: 2.2, vy: 1.1 },
      { c: nebSprite('40,200,255'), x: 0.75, y: 0.65, s: 2.1, vx: -1.6, vy: 1.8 },
      { c: nebSprite('255,60,160'), x: 0.5, y: 0.9, s: 1.7, vx: 1.2, vy: -1.4 }
    ];
    function nebSprite(rgb) {
      var c = document.createElement('canvas');
      c.width = c.height = 256;
      var g = c.getContext('2d');
      var grd = g.createRadialGradient(128, 128, 8, 128, 128, 128);
      grd.addColorStop(0, 'rgba(' + rgb + ',0.16)');
      grd.addColorStop(0.6, 'rgba(' + rgb + ',0.05)');
      grd.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
      return c;
    }
  }

  /* ================= state ================= */
  var S = null;
  var MODE = 'quick';      // 'quick' | 'daily'
  var DAILY_LABEL = '';
  function newGame(seed) {
    reseed(seed);
    S = {
      seed: _rs,
      px: W / 2, py: H / 2, pvx: 0, pvy: 0, aim: -Math.PI / 2,
      bullets: [], enemies: [], rifts: [], geoms: [], parts: buildPool(),
      rings: buildRings(), floaters: [], wells: [], stars: [], trail: [],
      score: 0, mult: 1, geomsGot: 0, lives: C_LIVES.start, bombs: C_LIVES.bombs,
      kills: 0, time: 0, spawnT: 1.2, diff: 1, over: false, paused: false,
      shake: 0, slowmo: 0, invuln: C_LIVES.invuln,
      fireT: 0, wellT: C_WELL.firstAt, eliteT: C_ELITE.firstAt, surgeT: C_SURGE.firstAt,
      surgeWarn: 0, surgeActive: 0,
      freezeT: 0, flash: 0, flashColor: '#ff2244',
      killT: 0, killChain: 0, kick: 0,
      dashT: 0, dashCD: 0, dashBuf: 0, dashDX: 1, dashDY: 0,
      spawnMul: 1, killLog: [], lastDeathT: -99,
      hudDirty: true, moved: false, fired: false,
      lowPerf: false, frameEMA: 16, slowFrames: 0, goodFrames: 0
    };
    for (var i = 0; i < 70; i++) S.stars.push({
      x: Math.random() * W, y: Math.random() * H,
      s: Math.random() * 1.5 + 0.5, layer: i % 2
    });
    loadWrecks();
    updateHUD();
  }

  /* ================= FX: centralized event -> effects ================= */
  function easeOutBack(t) {
    var c1 = 1.70158, c3 = c1 + 1;
    t = Math.min(1, Math.max(0, t));
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  var FX = {
    shake: function (amt) { if (reduceMotion() || !S) return; S.shake = Math.min(S.shake + amt, C_FX.shakeCap); },
    hitStop: function (ms) { if (reduceMotion() || !S) return; S.freezeT = Math.max(S.freezeT, ms / 1000); },
    slowDip: function (t) { if (reduceMotion() || !S) return; S.slowmo = Math.max(S.slowmo, t); },
    flash: function (color) { if (reduceMotion() || !S) return; S.flash = C_FX.flashTime; S.flashColor = color; }
  };

  /* ================= pooled neon-shard particles + shockwave rings ================= */
  var POOL_N = C_FX.poolN || 420;
  function buildPool() {
    var a = [];
    for (var i = 0; i < POOL_N; i++) a.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 1, color: '#fff', kind: 0 });
    return a;
  }
  var poolCursor = 0;
  function spawnP(x, y, vx, vy, life, color, kind) {
    if (S.lowPerf && rng() < 0.5) return; // adaptive tier sheds particle load first
    var p = S.parts[poolCursor];
    poolCursor = (poolCursor + 1) % POOL_N;
    p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.t = 0; p.life = life; p.color = color; p.kind = kind;
  }
  function explode(x, y, color, n, spd, quiet) {
    n = n || 24;
    for (var i = 0; i < n; i++) {
      var a = rng() * Math.PI * 2, s = (0.3 + rng() * 0.7) * (spd || 260);
      if (rng() < 0.5) spawnP(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.3 + rng() * 0.35, color, 1);
      else spawnP(x, y, Math.cos(a) * s * 0.7, Math.sin(a) * s * 0.7, 0.4 + rng() * 0.4, color, 0);
    }
    spawnRing(x, y, color, 130, 0.35, 3);
    if (!quiet) { warpGrid(x, y, 30); FX.shake(8); }
  }
  var RING_N = 24;
  function buildRings() {
    var a = [];
    for (var i = 0; i < RING_N; i++) a.push({ on: false, x: 0, y: 0, r: 0, vr: 0, t: 0, life: 1, color: '#fff', w: 3 });
    return a;
  }
  var ringCursor = 0;
  function spawnRing(x, y, color, vr, life, w) {
    if (reduceMotion()) return;
    var g = S.rings[ringCursor];
    ringCursor = (ringCursor + 1) % RING_N;
    g.on = true; g.x = x; g.y = y; g.r = 6; g.vr = vr;
    g.t = 0; g.life = life || 0.35; g.color = color; g.w = w || 3;
  }
  function floater(x, y, text, color) {
    if (S.floaters.length > 24) S.floaters.shift();
    S.floaters.push({ x: x, y: y, text: text, t: 0, color: color, lastSize: -1 });
  }

  /* ================= spawning — everything emerges from telegraphed rifts ================= */
  var ETYPES = ['wanderer', 'seeker', 'weaver', 'spinner'];
  function spawnEnemy(force, elite) {
    var t = elite ? 'dread' : (force || pick(ETYPES.slice(0, Math.min(ETYPES.length, 1 + ((S.diff / 3) | 0)))));
    var x, y, tries = 0;
    do {
      var edge = (rng() * 4) | 0;
      if (edge === 0) { x = rng() * W; y = C_SPAWN.edgeMargin; }
      else if (edge === 1) { x = rng() * W; y = H - C_SPAWN.edgeMargin; }
      else if (edge === 2) { x = C_SPAWN.edgeMargin; y = rng() * H; }
      else { x = W - C_SPAWN.edgeMargin; y = rng() * H; }
      tries++;
    } while (tries < 8 && Math.hypot(x - S.px, y - S.py) < C_SPAWN.safeDist);
    // rift telegraph: 0.8s of warning before the enemy exists — fair deaths at chaos
    S.rifts.push({ x: x, y: y, type: t, t: 0, tele: elite ? 1.3 : C_SPAWN.riftTelegraph, elite: !!elite });
  }
  function emergeFromRift(r) {
    var E = C_EN, e;
    if (r.elite) {
      e = { type: 'dread', x: r.x, y: r.y, vx: 0, vy: 0, t: 0, hp: C_ELITE.hp, r: C_ELITE.radius,
            color: '#ff3355', score: C_ELITE.score, pop: 0, hitT: 0 };
    } else {
      e = { type: r.type, x: r.x, y: r.y, vx: 0, vy: 0, t: 0, hp: 1, r: 12, pop: 0 };
      var d = E[r.type] || E.wanderer;
      e.color = d.color; e.score = d.score; e.r = d.r;
      if (r.type === 'wanderer') { e.vx = rr(-30, 30); e.vy = rr(-30, 30); }
      if (r.type === 'spinner') { e.spin = rng() * 6; e.vx = rr(-100, 100); e.vy = rr(-100, 100); }
    }
    S.enemies.push(e);
  }
  function spawnWell() {
    var x = 60 + rng() * (W - 120), y = 60 + rng() * (H - 120);
    S.wells.push({ x: x, y: y, r: 8, grow: 0, suck: 0 });
    banner('⚫ GRAVITY WELL', '#aa66ff');
    NV_Audio.tone(80, 0.5, 'sawtooth', 0.15);
  }

  /* ================= combat ================= */
  function killEnemy(e, idx) {
    S.enemies.splice(idx, 1);
    var elite = e.type === 'dread';
    explode(e.x, e.y, e.color, elite ? 70 : 26, elite ? 480 : 300);
    warpGrid(e.x, e.y, elite ? 90 : 30);
    if (elite) {
      FX.shake(20); FX.hitStop(70); FX.slowDip(0.35); FX.flash('#aa66ff');
      HAP.warning();
      NV_Audio.tone(140, 0.5, 'sawtooth', 0.2, 0, 40);
    }
    if (S.killT > 0) S.killChain++; else S.killChain = 1;
    S.killT = C_COMBAT.killChainWindow;
    S.kills++;
    var pts = e.score * S.mult;
    S.score += pts;
    floater(e.x, e.y, '+' + pts, '#fff');
    var marks = C_COMBAT.chainMarks || [];
    if (marks.indexOf(S.killChain) >= 0) {
      var label = (C_COMBAT.chainLabels || {})[S.killChain] || ('CHAIN x' + S.killChain);
      floater(S.px, S.py - 46, label + ' x' + S.killChain, '#66ffff');
      banner(label, '#66ffff', 900);
      FX.hitStop(C_FX.hitStopKill); FX.slowDip(C_FX.slowmoKill); FX.shake(12);
      HAP.success();
    }
    // kill pitch RISES with the chain — the combo has a sound you can feel
    var kp = Math.min(C_AUDIO.killChainCap || 900, (C_AUDIO.killBase || 240) + S.killChain * (C_AUDIO.killChainStep || 45));
    NV_Audio.tone(kp, 0.09, 'square', 0.07);
    // drop geoms — the multiplier rises when you COLLECT them (risk/reward)
    var nGeoms = elite ? (C_ELITE.geoms || 5) : 1;
    for (var i = 0; i < nGeoms; i++) {
      S.geoms.push({ x: e.x + rr(-8, 8), y: e.y + rr(-8, 8), vx: rr(-60, 60), vy: rr(-60, 60), t: 0, life: C_GEOM.life });
    }
    if (e.type === 'spinner' && e.r > 7) { // spinner splits — relentless
      for (var j = 0; j < 3; j++) {
        S.enemies.push({ type: 'spinner', x: e.x + rr(-10, 10), y: e.y + rr(-10, 10),
          vx: rr(-100, 100), vy: rr(-100, 100), t: 0, hp: 1, r: 6,
          color: C_EN.spinner.color, score: 50, spin: rng() * 6, pop: 0 });
      }
    }
    S.hudDirty = true;
  }
  function collectGeom(g, idx) {
    S.geoms.splice(idx, 1);
    S.geomsGot++;
    S.score += C_GEOM.pickupScore * S.mult;
    var nm = 1 + ((S.geomsGot / C_GEOM.perMult) | 0);
    if (nm > S.mult && S.mult < C_GEOM.maxMult) {
      S.mult = Math.min(nm, C_GEOM.maxMult);
      floater(S.px, S.py - 30, '×' + S.mult, '#ffe14d');
      banner('MULTIPLIER ×' + S.mult, '#ffe14d', 1100);
      NV_Audio.tone(600 + S.mult * 8, 0.14, 'square', 0.09);
      HAP.light();
    } else {
      NV_Audio.tone(1200, 0.05, 'sine', 0.035);
    }
    spawnP(S.px, S.py, rr(-40, 40), rr(-40, 40), 0.25, '#ffe14d', 0);
    S.hudDirty = true;
  }

  function die() {
    if (S.invuln > 0 || S.over) return;
    explode(S.px, S.py, '#ffffff', 60, 400);
    rememberWreck(S.px, S.py); // THE VOID REMEMBERS — your wreck stays for future runs
    S.lives--;
    S.mult = 1; S.geomsGot = 0;
    S.invuln = C_LIVES.respawnInvuln;
    S.lastDeathT = S.time;
    S.spawnMul = Math.max(C_DIFF.minMul, S.spawnMul * 0.8); // death eases pressure briefly
    FX.slowDip(S.lives === 1 ? C_FX.slowmoLastLife : C_FX.slowmoDeath);
    FX.hitStop(C_FX.hitStopDeath);
    FX.shake(24);
    FX.flash('#ff2244');
    HAP.error();
    NV_Audio.tone(110, 0.5, 'sawtooth', 0.2, 0, 40);
    NV_Audio.noise(0.3, 0.12, 800);
    S.hudDirty = true;
    if (S.lives <= 0) gameOver();
    else { S.px = W / 2; S.py = H / 2; S.pvx = 0; S.pvy = 0; S.trail.length = 0; }
  }

  function bomb() {
    if (!S || S.over || S.paused || S.bombs <= 0) return;
    S.bombs--;
    S.enemies.forEach(function (e) { explode(e.x, e.y, e.color, 20, 260); S.score += e.score * S.mult; });
    S.enemies = [];
    S.rifts = [];
    S.wells.forEach(function (w) { explode(w.x, w.y, '#000000', 40, 300); });
    S.wells = [];
    S.bullets = [];
    spawnRing(W / 2, H / 2, '#88ccff', 900, 0.6, 6);
    warpGrid(W / 2, H / 2, 120);
    FX.shake(C_FX.shakeCap);
    FX.hitStop(C_FX.hitStopBomb);
    FX.slowDip(C_FX.slowmoBomb);
    FX.flash('#88ccff');
    floater(W / 2, H / 2 - 40, '💥 BOMB', '#fff');
    banner('SHOCKWAVE', '#88ccff', 900);
    HAP.warning();
    NV_Audio.tone(60, 0.8, 'sawtooth', 0.25, 0, 30);
    NV_Audio.noise(0.5, 0.15, 500);
    S.hudDirty = true;
  }

  /* ================= VOID DASH — double-tap left half / Shift ================= */
  function tryDash() {
    if (!S || S.over || S.paused) return;
    if (S.dashCD > 0) { S.dashBuf = (C_DASH.bufferMs || 150) / 1000; return; } // buffered
    var dx, dy;
    var m = Math.hypot(stickL.dx, stickL.dy);
    if (m > 0.2) { dx = stickL.dx / m; dy = stickL.dy / m; }
    else { dx = Math.cos(S.aim); dy = Math.sin(S.aim); }
    S.dashT = C_DASH.time; S.dashCD = C_DASH.cooldown;
    S.dashDX = dx; S.dashDY = dy;
    S.invuln = Math.max(S.invuln, C_DASH.iframes);
    for (var i = 0; i < 14; i++) {
      spawnP(S.px - dx * 10, S.py - dy * 10, -dx * rr(60, 200) + rr(-60, 60), -dy * rr(60, 200) + rr(-60, 60),
        0.3 + rng() * 0.2, i % 2 ? '#66ccff' : '#ff60c0', 1);
    }
    warpGrid(S.px, S.py, 24);
    FX.shake(6);
    HAP.medium();
    NV_Audio.tone(300, 0.18, 'sawtooth', 0.1, 0, 900); // sweep up — sharp
    S.moved = true;
  }

  /* ================= THE VOID REMEMBERS (unrequested original touch) =================
     Every death leaves a wreck marker persisted across runs. Your next runs fly
     through the graveyard of your past ships — salvage them for bonus score. */
  var WRECK_KEY = 'nv_wrecks';
  var wrecksStore = [];
  try { wrecksStore = JSON.parse(localStorage.getItem(WRECK_KEY) || '[]'); } catch (e) { wrecksStore = []; }
  function loadWrecks() {
    S.wrecks = wrecksStore.map(function (w) { return { x: w.x * W, y: w.y * H, taken: false, ph: rng() * 6 }; });
  }
  function rememberWreck(x, y) {
    if (S.time < (C_REMEMBER.minRunSecs || 15)) return; // only runs that meant something
    wrecksStore.push({ x: x / W, y: y / H });
    while (wrecksStore.length > (C_REMEMBER.max || 40)) wrecksStore.shift();
    try { localStorage.setItem(WRECK_KEY, JSON.stringify(wrecksStore)); } catch (e) {}
    var el = document.getElementById('remembers');
    if (el) el.textContent = 'the void remembers ' + wrecksStore.length + ' of your ships';
  }

  function gameOver() {
    S.over = true;
    NV_Audio.musicStop();
    var bestKey = MODE === 'daily' ? 'nv_best_daily' : 'nv_best';
    var best = +(localStorage.getItem(bestKey) || 0);
    var isBest = S.score > best;
    if (isBest) { best = S.score; try { localStorage.setItem(bestKey, best); } catch (e) {} }
    document.getElementById('final-score').textContent = S.score.toLocaleString();
    document.getElementById('best2').textContent = best.toLocaleString();
    document.getElementById('over-mode').textContent =
      (MODE === 'daily' ? 'DAILY VOID · ' + DAILY_LABEL : 'QUICK RUN') + (isBest ? ' — NEW BEST!' : '');
    showDebrief();
    setTimeout(function () { document.getElementById('over').classList.add('show'); }, 900);
    submitScore();
  }

  /* ================= update ================= */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function update(dt) {
    S.time += dt;
    S.diff = 1 + S.time / 45;
    if (S.invuln > 0) S.invuln -= dt;
    if (S.slowmo > 0) { S.slowmo -= dt; dt *= 0.3; }
    if (S.killT > 0) { S.killT -= dt; if (S.killT <= 0) S.killChain = 0; }
    if (S.kick > 0) S.kick = Math.max(0, S.kick - dt * 8);
    if (S.flash > 0) S.flash = Math.max(0, S.flash - dt);
    if (S.dashCD > 0) S.dashCD -= dt;
    if (S.dashBuf > 0) { S.dashBuf -= dt; if (S.dashBuf <= 0 && S.dashCD <= 0) tryDash(); }

    // ---- adaptive difficulty: rolling kills/min nudges spawn pressure ----
    while (S.killLog.length && S.killLog[0] < S.time - (C_DIFF.window || 30)) S.killLog.shift();
    var kpm = S.killLog.length * (60 / (C_DIFF.window || 30));
    var target = 1;
    if (kpm > (C_DIFF.kpmHigh || 25)) target = C_DIFF.maxMul;
    else if (kpm < (C_DIFF.kpmLow || 8) && S.time > 60) target = C_DIFF.minMul;
    if (S.time - S.lastDeathT < (C_DIFF.deathCooldown || 12)) target = Math.min(target, 0.85);
    S.spawnMul += (target - S.spawnMul) * Math.min(1, dt * 0.5);

    // ---- void surge scheduling ----
    S.surgeT -= dt;
    if (S.surgeT <= 0 && S.surgeActive <= 0 && S.surgeWarn <= 0) {
      S.surgeWarn = C_SURGE.warn; // 4s warning
      banner('⚡ VOID SURGE INCOMING', '#ff4455', 2600);
      FX.flash('#ff4455');
      HAP.warning();
      NV_Audio.tone(200, 1.2, 'sawtooth', 0.12, 0, 1200); // riser
    }
    if (S.surgeWarn > 0) {
      S.surgeWarn -= dt;
      if (S.surgeWarn <= 0) {
        S.surgeActive = C_SURGE.duration;
        banner('⚡ VOID SURGE', '#ff4455', 1800);
        FX.flash('#ffffff'); FX.shake(16);
        warpGrid(W / 2, H / 2, 80);
        NV_Audio.noise(0.4, 0.14, 600);
      }
    }
    if (S.surgeActive > 0) {
      S.surgeActive -= dt;
      if (S.surgeActive <= 0) S.surgeT = C_SURGE.every;
    }
    // ---- elite scheduling ----
    S.eliteT -= dt;
    if (S.eliteT <= 0) {
      S.eliteT = C_ELITE.every;
      spawnEnemy(null, true);
      banner('⬟ DREADNOUGHT', '#ff3355', 2000);
      FX.flash('#aa66ff');
      HAP.warning();
    }

    // ---- player movement (left stick / tilt / keyboard WASD) ----
    var mx = stickL.dx, my = stickL.dy;
    if (tilt.active && tilt.mag > 0.12) { mx = tilt.x; my = tilt.y; }
    if (keys.has('KeyW')) my -= 1;
    if (keys.has('KeyS')) my += 1;
    if (keys.has('KeyA')) mx -= 1;
    if (keys.has('KeyD')) mx += 1;
    var mm = Math.hypot(mx, my);
    if (mm > 1) { mx /= mm; my /= mm; }
    if (mm > 0.15) S.moved = true;
    var spd = C_PLAYER.speed;
    if (S.dashT > 0) { // dash overrides velocity — burst, then release
      S.dashT -= dt;
      S.pvx = S.dashDX * C_DASH.speed; S.pvy = S.dashDY * C_DASH.speed;
      if (rng() < 0.8) spawnP(S.px, S.py, rr(-40, 40), rr(-40, 40), 0.3, '#66ccff', 1);
    } else {
      S.pvx += (mx * spd - S.pvx) * Math.min(1, dt * C_PLAYER.accel);
      S.pvy += (my * spd - S.pvy) * Math.min(1, dt * C_PLAYER.accel);
    }
    S.px = clamp(S.px + S.pvx * dt, 20, W - 20);
    S.py = clamp(S.py + S.pvy * dt, 20, H - 20);
    // ghost trail for dash afterimages
    S.trail.push({ x: S.px, y: S.py });
    if (S.trail.length > 8) S.trail.shift();
    // engine trail while moving fast — electric exhaust
    if (Math.hypot(S.pvx, S.pvy) > 200 && rng() < 0.6) {
      spawnP(S.px - S.pvx * 0.03, S.py - S.pvy * 0.03, rr(-30, 30), rr(-30, 30), 0.25, '#3388ff', 0);
    }

    // ---- firing (right stick / arrows / mouse) ----
    var firing = false;
    if (stickR.mag > 0.35) { S.aim = Math.atan2(stickR.dy, stickR.dx); firing = true; }
    if (keys.has('ArrowUp') || keys.has('ArrowDown') || keys.has('ArrowLeft') || keys.has('ArrowRight')) {
      var ax = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
      var ay = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
      if (ax || ay) { S.aim = Math.atan2(ay, ax); firing = true; }
    }
    // NOTE: arrows = aim+fire only; WASD = move. Documented in help.
    if (firing) {
      S.fired = true;
      S.fireT -= dt;
      if (S.fireT <= 0) {
        S.fireT = C_PLAYER.fireInterval;
        S.nFired = (S.nFired || 0) + 1;
        var bx = S.px + Math.cos(S.aim) * 18, by = S.py + Math.sin(S.aim) * 18;
        S.bullets.push({ x: bx, y: by, vx: Math.cos(S.aim) * C_PLAYER.bulletSpeed + S.pvx * 0.5,
          vy: Math.sin(S.aim) * C_PLAYER.bulletSpeed + S.pvy * 0.5, t: 0 });
        S.kick = C_PLAYER.fireKick;
        warpGrid(bx, by, 1.2);
        spawnP(bx, by, Math.cos(S.aim) * 60, Math.sin(S.aim) * 60, 0.12, '#ffffff', 0); // muzzle spark
        NV_Audio.tone(800 + rng() * 200, 0.04, 'square', 0.028);
      }
    }

    // bullets — squared distances, no sqrt in the hot loop
    for (var i = S.bullets.length - 1; i >= 0; i--) {
      var b = S.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.t += dt;
      if (b.x < 0 || b.x > W || b.y < 0 || b.y > H || b.t > 1.2) { S.bullets.splice(i, 1); continue; }
    }

    // ---- spawning ----
    S.spawnT -= dt;
    if (S.spawnT <= 0) {
      var base = Math.max(C_SPAWN.minInterval, C_SPAWN.baseInterval - S.diff * C_SPAWN.intervalPerDiff);
      S.spawnT = base / (S.spawnMul * (S.surgeActive > 0 ? C_SURGE.spawnMul : 1));
      var n = 1 + ((S.diff / C_SPAWN.batchPerDiff) | 0);
      for (var s = 0; s < n && (S.enemies.length + S.rifts.length) < C_SPAWN.maxEnemies; s++) spawnEnemy();
    }
    S.wellT -= dt;
    if (S.wellT <= 0) {
      S.wellT = C_WELL.intervalMin + rng() * (C_WELL.intervalMax - C_WELL.intervalMin);
      if (S.wells.length < C_WELL.max) spawnWell();
    }

    // ---- rifts mature into enemies ----
    for (var ri = S.rifts.length - 1; ri >= 0; ri--) {
      var r = S.rifts[ri];
      r.t += dt;
      if (rng() < dt * 12) { // rift inhales sparks — telegraph reads clearly
        var ra = rng() * Math.PI * 2;
        spawnP(r.x + Math.cos(ra) * 30, r.y + Math.sin(ra) * 30,
          -Math.cos(ra) * 160, -Math.sin(ra) * 160, 0.3, r.elite ? '#ff3355' : '#aa66ff', 0);
      }
      if (r.t >= r.tele) { emergeFromRift(r); S.rifts.splice(ri, 1); }
    }

    // ---- enemies ----
    var surgeSpd = S.surgeActive > 0 ? C_SURGE.speedMul : 1;
    for (var ei = S.enemies.length - 1; ei >= 0; ei--) {
      var e = S.enemies[ei];
      e.t += dt;
      if (e.hitT > 0) e.hitT -= dt;
      if (e.pop < 1) e.pop = Math.min(1, e.pop + dt * 7);
      var dx = S.px - e.x, dy = S.py - e.y;
      var d2 = dx * dx + dy * dy, d = Math.sqrt(d2) || 1;
      if (e.type === 'wanderer') {
        if (rng() < dt * 0.8) { e.vx = rr(-45, 45); e.vy = rr(-45, 45); }
        e.x += e.vx * dt * surgeSpd; e.y += e.vy * dt * surgeSpd;
      } else if (e.type === 'seeker') {
        var sp = Math.min(60 + e.t * 14, 300) * surgeSpd;
        e.vx += (dx / d * sp - e.vx) * dt * 3;
        e.vy += (dy / d * sp - e.vy) * dt * 3;
        e.x += e.vx * dt; e.y += e.vy * dt;
      } else if (e.type === 'weaver') {
        var wsp = 170 * surgeSpd;
        var wob = Math.sin(e.t * 6) * 120;
        e.x += (dx / d * wsp + (-dy / d) * wob) * dt;
        e.y += (dy / d * wsp + (dx / d) * wob) * dt;
      } else if (e.type === 'spinner') {
        e.spin += dt * 5;
        e.vx += dx / d * 60 * dt; e.vy += dy / d * 60 * dt;
        e.x += e.vx * dt * surgeSpd; e.y += e.vy * dt * surgeSpd;
      } else if (e.type === 'dread') { // dreadnought: slow, inexorable
        var dsp = 70 * surgeSpd;
        e.vx += (dx / d * dsp - e.vx) * dt * 1.5;
        e.vy += (dy / d * dsp - e.vy) * dt * 1.5;
        e.x += e.vx * dt; e.y += e.vy * dt;
      }
      // gravity wells pull enemies
      var sucked = false;
      for (var wi0 = 0; wi0 < S.wells.length; wi0++) {
        var w0 = S.wells[wi0];
        var wx = w0.x - e.x, wy = w0.y - e.y;
        var wd = Math.sqrt(wx * wx + wy * wy) || 1;
        if (wd < 260) { e.x += wx / wd * 320 * dt * (1 - wd / 260); e.y += wy / wd * 320 * dt * (1 - wd / 260); }
        if (wd < w0.r + 6) { // sucked in — gone, no geom, feeds the well
          w0.suck += e.score * S.mult;
          explode(e.x, e.y, e.color, 10, 150);
          S.enemies.splice(ei, 1);
          sucked = true;
          break;
        }
      }
      if (sucked) continue;
      if (e.x < 16) { e.x = 16; e.vx = Math.abs(e.vx || 50); }
      if (e.x > W - 16) { e.x = W - 16; e.vx = -Math.abs(e.vx || 50); }
      if (e.y < 16) { e.y = 16; e.vy = Math.abs(e.vy || 50); }
      if (e.y > H - 16) { e.y = H - 16; e.vy = -Math.abs(e.vy || 50); }
      var pr = e.r + C_PLAYER.radius;
      if (S.invuln <= 0 && d2 < pr * pr) { die(); break; }
    }

    // ---- gravity wells ----
    for (var wi = S.wells.length - 1; wi >= 0; wi--) {
      var w = S.wells[wi];
      w.grow += dt;
      w.r = 8 + Math.sin(w.grow * 3) * 3 + Math.min(w.suck / 2000, 14);
      if (rng() < dt * 20) warpGrid(w.x + rr(-60, 60), w.y + rr(-60, 60), -18);
      var pdx = S.px - w.x, pdy = S.py - w.y;
      var pd = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
      if (pd < C_WELL.pullRadius) {
        S.px -= pdx / pd * C_WELL.pullForce * dt * (1 - pd / C_WELL.pullRadius);
        S.py -= pdy / pd * C_WELL.pullForce * dt * (1 - pd / C_WELL.pullRadius);
      }
      for (var bi = S.bullets.length - 1; bi >= 0; bi--) {
        var bb = S.bullets[bi];
        var bdx = w.x - bb.x, bdy = w.y - bb.y;
        var bd = Math.sqrt(bdx * bdx + bdy * bdy) || 1;
        if (bd < 200) {
          bb.vx += bdx / bd * 900 * dt; bb.vy += bdy / bd * 900 * dt;
          if (bd < w.r + 8) { explode(bb.x, bb.y, '#8844ff', 6, 120); S.bullets.splice(bi, 1); }
        }
      }
      if (pd < w.r + 10 && S.invuln <= 0) { die(); break; }
      if (w.grow > C_WELL.collapseAt) {
        explode(w.x, w.y, '#aa66ff', 80, 500);
        var wpts = (150 + (w.suck | 0)) * S.mult;
        S.score += wpts;
        floater(w.x, w.y - 20, '+' + wpts, '#cc99ff');
        spawnRing(w.x, w.y, '#aa66ff', 500, 0.5, 5);
        S.wells.splice(wi, 1);
        FX.shake(22);
        NV_Audio.tone(50, 0.9, 'sawtooth', 0.25, 0, 30);
        S.hudDirty = true;
      }
    }

    // ---- bullets vs enemies (squared distances, hot loop) ----
    for (var k = S.bullets.length - 1; k >= 0; k--) {
      var bl = S.bullets[k];
      for (var m = S.enemies.length - 1; m >= 0; m--) {
        var en = S.enemies[m];
        var er = en.r + 4;
        var ex = bl.x - en.x, ey = bl.y - en.y;
        if (ex * ex + ey * ey < er * er) {
          S.bullets.splice(k, 1);
          if (en.hp > 1) {
            en.hp--; en.hitT = 0.12;
            explode(bl.x, bl.y, '#ffffff', 6, 160, true);
            NV_Audio.tone(500, 0.05, 'square', 0.05);
          } else {
            S.killLog.push(S.time);
            killEnemy(en, m);
          }
          break;
        }
      }
    }

    // ---- geoms: magnet + collect (collection raises the multiplier) ----
    for (var gi = S.geoms.length - 1; gi >= 0; gi--) {
      var g = S.geoms[gi];
      g.t += dt;
      g.x += g.vx * dt; g.y += g.vy * dt;
      g.vx *= 0.96; g.vy *= 0.96;
      var gdx = S.px - g.x, gdy = S.py - g.y;
      var gd = Math.sqrt(gdx * gdx + gdy * gdy) || 1;
      if (gd < C_GEOM.magnetRadius) { g.x += gdx / gd * C_GEOM.magnetForce * dt; g.y += gdy / gd * C_GEOM.magnetForce * dt; }
      if (gd < C_GEOM.collectRadius) { collectGeom(g, gi); continue; }
      if (g.t > g.life) S.geoms.splice(gi, 1);
    }

    // ---- wrecks: salvage the void remembers (1.5s spawn grace — no freebies) ----
    if (S.time > 1.5) for (var qi = 0; qi < S.wrecks.length; qi++) {
      var wr = S.wrecks[qi];
      if (wr.taken) continue;
      var wx2 = S.px - wr.x, wy2 = S.py - wr.y;
      var srad = C_REMEMBER.salvageRadius;
      if (wx2 * wx2 + wy2 * wy2 < srad * srad) {
        wr.taken = true;
        var spts = C_REMEMBER.salvageScore * S.mult;
        S.score += spts;
        floater(wr.x, wr.y - 14, 'SALVAGED +' + spts, '#9fe8ff');
        explode(wr.x, wr.y, '#9fe8ff', 12, 140, true);
        NV_Audio.tone(700, 0.12, 'sine', 0.07, 0, 1400);
        HAP.light();
        S.hudDirty = true;
      }
    }

    // ---- particles / rings / floaters (pooled, zero alloc) ----
    for (var pi = 0; pi < POOL_N; pi++) {
      var p = S.parts[pi];
      if (!p.on) continue;
      p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.97; p.vy *= 0.97;
      if (p.t > p.life) p.on = false;
    }
    for (var qi2 = 0; qi2 < RING_N; qi2++) {
      var rg = S.rings[qi2];
      if (!rg.on) continue;
      rg.t += dt; rg.r += rg.vr * dt;
      if (rg.t > rg.life) rg.on = false;
    }
    for (var fi = S.floaters.length - 1; fi >= 0; fi--) {
      var f = S.floaters[fi];
      f.t += dt; f.y -= 40 * dt;
      if (f.t > 1) S.floaters.splice(fi, 1);
    }
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * C_FX.shakeDecay);
    churnGrid(dt, S.lowPerf);
    updateGrid();

    // ---- adaptive music intensity: mult + pressure + surge ----
    NV_Audio.setIntensity(clamp(S.mult / 40 * 0.5 + (S.enemies.length / 40) * 0.3 + (S.surgeActive > 0 ? 0.35 : 0), 0, 1));

    if (S.hudDirty) { updateHUD(); S.hudDirty = false; }
    updateHints();
  }

  /* ================= render — pure drawImage blits, zero per-frame shadowBlur ================= */
  function drawGrid() {
    ctx.strokeStyle = S.surgeWarn > 0 || S.surgeActive > 0 ? 'rgba(220,60,80,0.55)' : 'rgba(70,120,235,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var y = 0; y < GH; y++) {
      for (var x = 0; x < GW - 1; x++) {
        var a = grid[y][x], b = grid[y][x + 1];
        ctx.moveTo(x * GS + a.ox, y * GS + a.oy);
        ctx.lineTo((x + 1) * GS + b.ox, y * GS + b.oy);
      }
    }
    for (var x2 = 0; x2 < GW; x2++) {
      for (var y2 = 0; y2 < GH - 1; y2++) {
        var c = grid[y2][x2], d = grid[y2 + 1][x2];
        ctx.moveTo(x2 * GS + c.ox, y2 * GS + c.oy);
        ctx.lineTo(x2 * GS + d.ox, (y2 + 1) * GS + d.oy);
      }
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(80,140,255,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, W - 16, H - 16);
  }
  function blit(sprite, x, y, rot, scale, alpha) {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (scale && scale !== 1) ctx.scale(scale, scale);
    if (alpha != null && alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(sprite.c, -sprite.half, -sprite.half);
    ctx.restore();
  }
  function drawShip() {
    // dash afterimage ghosts — sharp, electric
    if (S.dashT > 0) {
      for (var i = 2; i < S.trail.length; i += 3) {
        var tp = S.trail[S.trail.length - 1 - i];
        if (tp) blit(ATLAS.ship, tp.x, tp.y, S.aim, 0.9, 0.25);
      }
    }
    var spdN = Math.min(1, Math.hypot(S.pvx, S.pvy) / C_PLAYER.speed);
    var sq = spdN * 0.22 + S.kick * 0.12; // squash & stretch on velocity + fire recoil
    ctx.save();
    ctx.translate(S.px, S.py);
    ctx.rotate(S.aim);
    ctx.scale(1 + sq, 1 - Math.min(sq, 0.35));
    if (S.invuln > 0 && ((S.time * 10) | 0) % 2 === 0) ctx.globalAlpha = 0.35;
    ctx.drawImage(ATLAS.ship.c, -ATLAS.ship.half, -ATLAS.ship.half);
    ctx.restore();
    // dash cooldown ring — readable, never color-alone (ring + ship blink)
    if (S.dashCD > 0) {
      var frac = 1 - S.dashCD / C_DASH.cooldown;
      ctx.strokeStyle = 'rgba(102,204,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(S.px, S.py, 24, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
    }
  }
  function drawEnemies() {
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < S.enemies.length; i++) {
      var e = S.enemies[i];
      var spr = e.type === 'dread' ? ATLAS.dread : ATLAS[e.type];
      if (!spr) continue;
      var rot = 0;
      if (e.type === 'wanderer') rot = e.t * 1.5;
      else if (e.type === 'seeker') rot = Math.atan2(e.vy, e.vx);
      else if (e.type === 'weaver') rot = e.t * 3;
      else if (e.type === 'spinner') rot = e.spin;
      else if (e.type === 'dread') rot = e.t * 0.8;
      var sc = e.pop < 1 ? easeOutBack(e.pop) : 1;
      blit(spr, e.x, e.y, rot, sc, 1);
      if (e.hitT > 0) { // dreadnought hit flash — white core blink
        ctx.globalAlpha = Math.min(1, e.hitT * 8);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.7, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function drawRifts() {
    for (var i = 0; i < S.rifts.length; i++) {
      var r = S.rifts[i];
      var f = r.t / r.tele;
      var col = r.elite ? '#ff3355' : '#aa66ff';
      var pulse = 0.5 + 0.5 * Math.sin(r.t * 18);
      ctx.globalAlpha = 0.35 + 0.45 * pulse * f;
      ctx.strokeStyle = col;
      ctx.lineWidth = r.elite ? 3 : 2;
      var rad = (r.elite ? 34 : 22) * (0.6 + 0.4 * f);
      ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, 7); ctx.stroke();
      // ✖ cross — danger reads by shape, not color alone
      ctx.beginPath();
      ctx.moveTo(r.x - 6, r.y - 6); ctx.lineTo(r.x + 6, r.y + 6);
      ctx.moveTo(r.x + 6, r.y - 6); ctx.lineTo(r.x - 6, r.y + 6);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  function drawWells() {
    for (var i = 0; i < S.wells.length; i++) {
      var w = S.wells[i];
      ctx.save(); ctx.translate(w.x, w.y);
      var grd = ctx.createRadialGradient(0, 0, 0, 0, 0, w.r * 4);
      grd.addColorStop(0, 'rgba(0,0,0,1)');
      grd.addColorStop(0.35, 'rgba(60,0,120,0.9)');
      grd.addColorStop(1, 'rgba(120,40,255,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, w.r * 4, 0, 7); ctx.fill();
      ctx.strokeStyle = '#aa66ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, w.r, 0, 7); ctx.stroke();
      ctx.rotate(w.grow * 4);
      ctx.beginPath(); ctx.arc(0, 0, w.r + 8, 0, 4); ctx.stroke();
      ctx.restore();
    }
  }
  function drawWrecks() {
    // the void remembers — dim cracked-ship glyphs drift where you died
    for (var i = 0; i < S.wrecks.length; i++) {
      var wr = S.wrecks[i];
      if (wr.taken) continue;
      var tw = 0.35 + 0.2 * Math.sin(S.time * 2 + wr.ph);
      ctx.globalAlpha = tw;
      ctx.strokeStyle = '#9fe8ff';
      ctx.lineWidth = 1.5;
      var s = 9;
      ctx.beginPath();
      ctx.moveTo(wr.x, wr.y - s); ctx.lineTo(wr.x + s * 0.7, wr.y + s * 0.4);
      ctx.lineTo(wr.x - s * 0.4, wr.y + s * 0.2); // cracked — asymmetric, broken
      ctx.stroke();
      ctx.beginPath(); ctx.arc(wr.x, wr.y, s + 4, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  function render() {
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (S.shake > 0) ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
    // nebulae — slow drifting color fields (static in low-perf tier)
    ctx.globalCompositeOperation = 'screen';
    for (var ni = 0; ni < ATLAS.nebulae.length; ni++) {
      var nb = ATLAS.nebulae[ni];
      if (!S.lowPerf) {
        nb.x += nb.vx * 0.00004; nb.y += nb.vy * 0.00004;
        if (nb.x < -0.4) nb.x = 1.2; if (nb.x > 1.2) nb.x = -0.4;
        if (nb.y < -0.4) nb.y = 1.2; if (nb.y > 1.2) nb.y = -0.4;
      }
      var nw = 256 * nb.s;
      ctx.drawImage(nb.c, nb.x * W - nw / 2, nb.y * H - nw / 2, nw, nw);
    }
    ctx.globalCompositeOperation = 'source-over';
    // parallax stars — two layers drift against the player
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    for (var si = 0; si < S.stars.length; si++) {
      var st = S.stars[si];
      var par = st.layer ? 0.12 : 0.05;
      var sx = (((st.x - S.px * par) % W) + W) % W;
      var sy = (((st.y - S.py * par) % H) + H) % H;
      ctx.fillRect(sx, sy, st.s, st.s);
    }
    drawGrid();
    drawRifts();
    drawWells();
    drawWrecks();
    // geoms
    ctx.globalCompositeOperation = 'lighter';
    for (var gi = 0; gi < S.geoms.length; gi++) {
      var g = S.geoms[gi];
      var ga = Math.max(0.25, 1 - g.t / g.life);
      blit(ATLAS.geom, g.x, g.y, g.t * 4, 1, ga);
    }
    // bullets
    for (var bi = 0; bi < S.bullets.length; bi++) {
      var b = S.bullets[bi];
      blit(ATLAS.bullet, b.x, b.y, 0, 1, 1);
    }
    ctx.globalCompositeOperation = 'source-over';
    drawEnemies();
    if (!S.over) drawShip();
    // shockwave rings — additive
    ctx.globalCompositeOperation = 'lighter';
    for (var qi = 0; qi < RING_N; qi++) {
      var q = S.rings[qi];
      if (!q.on) continue;
      ctx.globalAlpha = Math.max(0, 1 - q.t / q.life);
      ctx.strokeStyle = q.color;
      ctx.lineWidth = q.w;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // particles — additive neon shards (never soft circles): streaks + hot sparks
    ctx.lineWidth = 2;
    for (var pi = 0; pi < POOL_N; pi++) {
      var p = S.parts[pi];
      if (!p.on) continue;
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      if (p.kind === 1) {
        ctx.strokeStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 1, p.y - 1, 2.5, 2.5);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // floaters — scale-pop numbers, quantized font sizes (no per-frame string churn)
    ctx.textAlign = 'center';
    for (var fi = 0; fi < S.floaters.length; fi++) {
      var f = S.floaters[fi];
      ctx.globalAlpha = Math.max(0, 1 - f.t);
      var size = Math.max(8, Math.round(15 * easeOutBack(Math.min(1, f.t / 0.22))));
      if (size !== f.lastSize) { ctx.font = 'bold ' + size + 'px sans-serif'; f.lastSize = size; }
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // surge vignette — red edges close in (prerendered, drawn at half res)
    if ((S.surgeWarn > 0 || S.surgeActive > 0) && surgeVignette) {
      ctx.globalAlpha = S.surgeActive > 0 ? 0.55 + 0.25 * Math.sin(S.time * 6) : 0.3 + 0.2 * Math.sin(S.time * 10);
      ctx.drawImage(surgeVignette, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    // damage flash — full-screen 0.15s (outside the shake transform)
    if (S.flash > 0) {
      ctx.globalAlpha = Math.min(0.35, S.flash / (C_FX.flashTime || 0.15) * 0.35);
      ctx.fillStyle = S.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    drawSticks();
  }

  /* ================= twin sticks + gestures ================= */
  var stickL = { id: null, ox: 0, oy: 0, dx: 0, dy: 0, mag: 0 };
  var stickR = { id: null, ox: 0, oy: 0, dx: 0, dy: 0, mag: 0 };
  var lastTapL = 0, lastTapR = 0;
  function drawSticks() {
    var pairs = [[stickL, '#40e0ff'], [stickR, '#ff60c0']];
    for (var i = 0; i < pairs.length; i++) {
      var st = pairs[i][0];
      if (st.id === null) continue;
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = pairs[i][1]; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(st.ox, st.oy, 52, 0, 7); ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = pairs[i][1];
      ctx.beginPath(); ctx.arc(st.ox + st.dx * 52, st.oy + st.dy * 52, 22, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  function nowMs() { return (window.performance && performance.now()) || Date.now(); }
  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    NV_Audio.init();
    if (!S || S.over || S.paused) return;
    var tnow = nowMs(), dtap = (C_DASH.doubleTapMs || 280);
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var left = t.clientX < W / 2;
      var st = left ? stickL : stickR;
      if (st.id === null) {
        // double-tap gestures: left = DASH, right = BOMB — panic moves for thumbs
        if (left && tnow - lastTapL < dtap) { lastTapL = 0; tryDash(); }
        else if (!left && tnow - lastTapR < dtap) { lastTapR = 0; bomb(); }
        else if (left) lastTapL = tnow; else lastTapR = tnow;
        st.id = t.identifier; st.ox = t.clientX; st.oy = t.clientY;
        st.dx = 0; st.dy = 0; st.mag = 0;
      }
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var sticks = [stickL, stickR];
      for (var s = 0; s < 2; s++) {
        var st = sticks[s];
        if (st.id === t.identifier) {
          var dx = t.clientX - st.ox, dy = t.clientY - st.oy;
          var m = Math.sqrt(dx * dx + dy * dy), max = 52;
          if (m > max) { dx = dx / m * max; dy = dy / m * max; m = max; }
          st.dx = dx / max; st.dy = dy / max; st.mag = m / max;
        }
      }
    }
  }, { passive: false });
  function endTouch(e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      var id = e.changedTouches[i].identifier;
      var sticks = [stickL, stickR];
      for (var s = 0; s < 2; s++) {
        var st = sticks[s];
        if (st.id === id) { st.id = null; st.dx = 0; st.dy = 0; st.mag = 0; }
      }
    }
  }
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);
  function clearSticks() {
    stickL.id = stickR.id = null;
    stickL.dx = stickL.dy = stickR.dx = stickR.dy = 0;
    stickL.mag = stickR.mag = 0;
  }
  // mouse fallback for desktop: left button steers, aim follows cursor via arrows/WASD+mouse
  var mouseDown = false;
  canvas.addEventListener('mousedown', function (e) {
    if (!S || S.over || S.paused) return;
    NV_Audio.init();
    mouseDown = true;
    var left = e.clientX < W / 2;
    var st = left ? stickL : stickR;
    st.id = 'mouse'; st.ox = e.clientX; st.oy = e.clientY;
  });
  canvas.addEventListener('mousemove', function (e) {
    if (!mouseDown) return;
    var sticks = [stickL, stickR];
    for (var s = 0; s < 2; s++) {
      var st = sticks[s];
      if (st.id === 'mouse') {
        var dx = e.clientX - st.ox, dy = e.clientY - st.oy;
        var m = Math.sqrt(dx * dx + dy * dy), max = 52;
        if (m > max) { dx = dx / m * max; dy = dy / m * max; m = max; }
        st.dx = dx / max; st.dy = dy / max; st.mag = m / max;
      }
    }
  });
  window.addEventListener('mouseup', function () { mouseDown = false; clearSticks(); });
  // keyboard: WASD move, arrows aim+fire, Space bomb, Shift dash, P pause, M mute
  var keys = new Set();
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space' || e.code.indexOf('Arrow') === 0) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Space') bomb();
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') tryDash();
    if (e.code === 'KeyP') togglePause();
    if (e.code === 'KeyM') toggleMute();
  });
  window.addEventListener('keyup', function (e) { keys.delete(e.code); });
  window.addEventListener('blur', function () { keys.clear(); clearSticks(); });

  /* ================= tilt-to-steer (option, default off) ================= */
  var tilt = { active: false, x: 0, y: 0, mag: 0, calBeta: null, sx: 0, sy: 0 };
  function tiltSet(on) {
    NVSET.tilt = !!on;
    saveSettings(); syncTiltBtn();
    if (on && typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().catch(function () {});
    }
    tilt.active = !!on && 'DeviceOrientationEvent' in window;
    tilt.calBeta = null;
  }
  window.addEventListener('deviceorientation', function (e) {
    if (!NVSET.tilt || e.beta == null || e.gamma == null) return;
    tilt.active = true;
    if (tilt.calBeta == null) tilt.calBeta = e.beta; // calibrate to hold posture
    var tx = e.gamma / 30, ty = (e.beta - tilt.calBeta) / 30;
    var m = Math.sqrt(tx * tx + ty * ty);
    if (m > 1) { tx /= m; ty /= m; m = 1; }
    if (m < 0.12) { tx = 0; ty = 0; m = 0; } // radial deadzone — diagonals stay clean
    tilt.sx += (tx - tilt.sx) * 0.25; tilt.sy += (ty - tilt.sy) * 0.25; // smoothing
    tilt.x = tilt.sx; tilt.y = tilt.sy;
    tilt.mag = Math.min(1, Math.sqrt(tilt.x * tilt.x + tilt.y * tilt.y) * 1.4);
  });

  /* ================= HUD (batched: sim sets dirty, loop flushes) ================= */
  var lastScore = -1, lastMult = -1, lastLives = -1, lastBombs = -1;
  function updateHUD() {
    if (!S) return;
    if (S.score !== lastScore) { document.getElementById('score').textContent = S.score.toLocaleString(); lastScore = S.score; }
    if (S.mult !== lastMult) { document.getElementById('mult').textContent = '×' + S.mult; lastMult = S.mult; }
    var lv = S.lives, bo = S.bombs;
    if (lv !== lastLives || bo !== lastBombs) {
      document.getElementById('lives').textContent = '🚀'.repeat(Math.max(0, lv)) + '💣'.repeat(Math.max(0, bo));
      lastLives = lv; lastBombs = bo;
    }
    // multiplier progress: geoms toward the next × level
    var prog = (S.geomsGot % C_GEOM.perMult) / C_GEOM.perMult;
    document.getElementById('multfill').style.width = Math.round(prog * 100) + '%';
  }
  var bannerT = null;
  function banner(text, color, dur) {
    var el = document.getElementById('banner');
    el.textContent = text;
    el.style.color = color || '#fff';
    el.style.textShadow = '0 0 14px ' + (color || '#fff');
    el.classList.add('show');
    clearTimeout(bannerT);
    bannerT = setTimeout(function () { el.classList.remove('show'); }, dur || 1600);
  }

  /* ================= first-run hints ================= */
  var hintsEl = null, hintsT = null;
  function showHints() {
    var runs = +(localStorage.getItem('nv_runs') || 0);
    try { localStorage.setItem('nv_runs', runs + 1); } catch (e) {}
    if (runs >= 2) return; // only the first two runs get guidance
    hintsEl = document.getElementById('hints');
    hintsEl.classList.add('show');
    clearTimeout(hintsT);
    hintsT = setTimeout(hideHints, 8000);
  }
  function hideHints() {
    if (hintsEl) hintsEl.classList.remove('show');
    clearTimeout(hintsT);
  }
  function updateHints() {
    if (hintsEl && hintsEl.classList.contains('show') && S.moved && S.fired) hideHints();
  }

  /* ================= flavor: AI briefing + debrief (silent local fallback) ================= */
  var AI_BASE = "https://gamez-ai.chaoticutopia84.workers.dev";
  function aiFetch(kind, payload, cb) {
    var done = false, timer = null;
    function fin(t) { if (!done) { done = true; if (timer) clearTimeout(timer); cb(t); } }
    timer = setTimeout(function () { fin(null); }, 7000);
    try {
      fetch(AI_BASE + '/g', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: kind, game: 'neon-void', ctx: payload })
      }).then(function (r) { return r.json(); })
        .then(function (d) { fin(d && d.text ? d.text : null); })
        .catch(function () { fin(null); });
    } catch (e) { fin(null); }
  }
  var BRIEF_FALLBACKS = [
    'Sector 7: pirate swarm near the shattered moon. Weapons hot.',
    'Deep field patrol: hostiles converging on the trade lane.',
    'Nebula breach: something big is waking up in the dust.',
    'Border skirmish: hold the line until the convoy clears.',
    'Derelict station ahead: salvage rights go to the survivor.',
    'Void storm incoming: fly fast, shoot faster.'
  ];
  var DEBRIEF_FALLBACKS = [
    'The void kept your ship. It keeps the score too.',
    'You flew like the dark was personal. It noticed.',
    'Another light gone out past the shattered moon.',
    'The swarm will tell stories about that run.',
    'Short flight. Loud ending. The void approves.'
  ];
  var aiRuns = 0, briefT = null;
  function showBriefing() {
    var slot = aiRuns % BRIEF_FALLBACKS.length;
    aiRuns++;
    var el = document.getElementById('brief');
    function show(t) {
      if (!el) return;
      el.textContent = '📡 ' + (t || BRIEF_FALLBACKS[slot]);
      el.classList.add('show');
      clearTimeout(briefT);
      briefT = setTimeout(function () { el.classList.remove('show'); }, 4500);
    }
    var best = +(localStorage.getItem(MODE === 'daily' ? 'nv_best_daily' : 'nv_best') || 0);
    aiFetch('briefing', { v: slot, mode: MODE, run: aiRuns, best: best }, show);
    setTimeout(function () { if (el && !el.classList.contains('show')) show(null); }, 1200);
  }
  function showDebrief() {
    var el = document.getElementById('debrief');
    if (!el) return;
    el.textContent = '';
    var slot = (aiRuns + 3) % DEBRIEF_FALLBACKS.length;
    aiFetch('debrief', {
      mode: MODE, score: S.score, time: Math.round(S.time),
      kills: S.kills, mult: S.mult
    }, function (t) {
      el.textContent = '📡 ' + (t || DEBRIEF_FALLBACKS[slot]);
    });
  }

  /* ================= Gamez Arcade: leaderboards + daily seed ================= */
  var ARCADE_BASE = "https://gamez-arcade.chaoticutopia84.workers.dev";
  var NV_GAME = 'neon-void';
  function board() { return MODE === 'daily' ? 'daily-' + DAILY_LABEL : 'main'; }
  function arcadeFetch(path, body, cb) {
    var done = false, timer = null;
    function fin(e, d) { if (!done) { done = true; if (timer) clearTimeout(timer); cb(e, d); } }
    timer = setTimeout(function () { fin(new Error('timeout')); }, 12000);
    try {
      fetch(ARCADE_BASE + path, body ?
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
        .then(function (r) { return r.json(); })
        .then(function (d) { fin(null, d); })
        .catch(function (e) { fin(e); });
    } catch (e) { fin(e); }
  }
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function renderBoard(id, top, hlName) {
    var el = document.getElementById(id);
    if (!el) return;
    if (!top || !top.length) {
      el.innerHTML = '<div class="lb-empty">no scores yet — be the first</div>';
      return;
    }
    el.innerHTML = top.map(function (e, i) {
      var medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
      var me = hlName && e.name === hlName ? ' me' : '';
      return '<div class="lb-row' + me + '"><span>' + medal + ' ' + escHtml(e.name) +
        '</span><b>' + (+e.score).toLocaleString() + '</b></div>';
    }).join('');
  }
  function loadBoards() {
    arcadeFetch('/scores?game=' + NV_GAME + '&board=main', null, function (err, data) {
      renderBoard('menu-lb', (!err && data) ? data.top : null);
    });
  }
  function submitScore() {
    if (!ARCADE_BASE || S._submitted || !(S.score > 0)) return;
    var name = '';
    try { name = (localStorage.getItem('nv_name') || '').trim(); } catch (e) {}
    if (!name) {
      var form = document.getElementById('lb-form');
      form.style.display = 'flex';
      document.getElementById('lb-save').onclick = function () {
        var v = document.getElementById('lb-name').value.trim().slice(0, 12);
        if (!v) return;
        try { localStorage.setItem('nv_name', v); } catch (e) {}
        form.style.display = 'none';
        postScore(v);
      };
      return;
    }
    postScore(name);
  }
  function postScore(name) {
    S._submitted = true;
    var rankEl = document.getElementById('lb-rank');
    rankEl.textContent = 'sending…';
    arcadeFetch('/score', { game: NV_GAME, board: board(), name: name, score: S.score }, function (err, data) {
      if (err || !data) { rankEl.textContent = ''; return; }
      rankEl.textContent = data.rank > 0 ? '🌍 GLOBAL RANK #' + data.rank : '';
      renderBoard('over-lb', data.top, name);
    });
  }
  function loadDailyBoard() {
    arcadeFetch('/scores?game=' + NV_GAME + '&board=daily-' + DAILY_LABEL, null, function (err, data) {
      renderBoard('over-lb', (!err && data) ? data.top : null, null);
    });
  }
  function fetchDailySeed(cb) {
    var label = new Date().toISOString().slice(0, 10);
    var done = false;
    var timer = setTimeout(function () {
      if (!done) { done = true; cb(hashStr('neon-void|' + label), label, true); }
    }, 6000);
    try {
      fetch(ARCADE_BASE + '/daily?game=' + NV_GAME)
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (done) return; done = true; clearTimeout(timer);
          cb(d && d.seed != null ? d.seed >>> 0 : hashStr('neon-void|' + label), (d && d.date) || label, false);
        })
        .catch(function () { if (!done) { done = true; clearTimeout(timer); cb(hashStr('neon-void|' + label), label, true); } });
    } catch (e) { if (!done) { done = true; clearTimeout(timer); cb(hashStr('neon-void|' + label), label, true); } }
  }

  /* ================= pause ================= */
  function setPaused(p) {
    if (!S || S.over) return;
    if (S.paused === p) return;
    S.paused = p;
    document.getElementById('pause').classList.toggle('show', p);
    if (p) { clearSticks(); NV_Audio.suspend(); NV_Audio.musicStop(); }
    else { NV_Audio.init(); NV_Audio.resume(); NV_Audio.musicStart(); last = 0; }
  }
  function togglePause() { if (S && !S.over) setPaused(!S.paused); }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) setPaused(true); // playbook: pause on hide, clear stuck input
  });

  /* ================= loop ================= */
  var last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    var rdt = Math.min((ts - last) / 1000 || 0.016, 0.05); // clamped — never spiral
    last = ts;
    if (!S || S.paused || document.getElementById('menu').classList.contains('show')) return;
    // adaptive perf tier: sustained slow frames shed particle/churn load
    if (S && !S.over) {
      var ms = rdt * 1000;
      S.frameEMA = S.frameEMA * 0.95 + ms * 0.05;
      if (S.frameEMA > (C_PERF.frameBudgetMs || 26)) {
        S.slowFrames++; S.goodFrames = 0;
        if (S.slowFrames > (C_PERF.sampleFrames || 90) && !S.lowPerf) { S.lowPerf = true; S.slowFrames = 0; }
      } else if (S.frameEMA < 17) {
        S.goodFrames++; S.slowFrames = 0;
        if (S.goodFrames > 300 && S.lowPerf) { S.lowPerf = false; S.goodFrames = 0; }
      }
    }
    if (S.freezeT > 0) { // hit-stop: freeze the sim, keep drawing — sharp, electric
      S.freezeT -= rdt;
      if (S.shake > 0) S.shake = Math.max(0, S.shake - rdt * C_FX.shakeDecay);
      render();
      return;
    }
    update(rdt);
    render();
  }

  /* ================= boot ================= */
  resize();
  buildAtlas();
  document.getElementById('best').textContent = (+(localStorage.getItem('nv_best') || 0)).toLocaleString();
  document.getElementById('best-daily').textContent = (+(localStorage.getItem('nv_best_daily') || 0)).toLocaleString();
  var rml = document.getElementById('remembers');
  if (rml && wrecksStore.length) rml.textContent = 'the void remembers ' + wrecksStore.length + ' of your ships';
  document.getElementById('menu').classList.add('show');
  loadBoards();

  function startRun(mode, seed) {
    MODE = mode;
    document.getElementById('menu').classList.remove('show');
    document.getElementById('over').classList.remove('show');
    document.getElementById('pause').classList.remove('show');
    lastScore = lastMult = lastLives = lastBombs = -1;
    newGame(seed);
    showBriefing();
    showHints();
    try {
      NV_Audio.init();
      NV_Audio.musicStart();
    } catch (e) {}
    if (mode === 'daily') loadDailyBoard();
  }
  document.getElementById('start').addEventListener('click', function () {
    HAP.select();
    startRun('quick', (Date.now() ^ (Math.random() * 1e9)) >>> 0);
  });
  var dailyBtn = document.getElementById('daily');
  dailyBtn.addEventListener('click', function () {
    HAP.select();
    dailyBtn.textContent = '📅 CONTACTING THE VOID…';
    dailyBtn.disabled = true;
    fetchDailySeed(function (seed, label, offline) {
      DAILY_LABEL = label;
      dailyBtn.textContent = '📅 DAILY VOID';
      dailyBtn.disabled = false;
      startRun('daily', seed);
      if (offline) banner('OFFLINE SEED — runs local', '#9fe8ff', 2000);
    });
  });
  document.getElementById('again').addEventListener('click', function () {
    HAP.select();
    if (MODE === 'daily') {
      // same void all day: re-fetch is cheap, seed is deterministic anyway
      fetchDailySeed(function (seed, label) { DAILY_LABEL = label; startRun('daily', seed); });
    } else {
      startRun('quick', (Date.now() ^ (Math.random() * 1e9)) >>> 0);
    }
  });
  document.getElementById('bomb-btn').addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); bomb(); }, { passive: false });
  document.getElementById('bomb-btn').addEventListener('click', function (e) { e.stopPropagation(); bomb(); });
  document.getElementById('pause-btn').addEventListener('click', function (e) { e.stopPropagation(); togglePause(); });
  document.getElementById('resume-btn').addEventListener('click', function () { setPaused(false); });
  document.getElementById('quit-btn').addEventListener('click', function () {
    S = null;
    document.getElementById('pause').classList.remove('show');
    document.getElementById('menu').classList.add('show');
    NV_Audio.musicStop();
    loadBoards();
  });

  /* settings buttons */
  var hb = document.getElementById('haptics-btn');
  function syncHapticsBtn() {
    hb.textContent = '📳 HAPTICS: ' + (NVSET.haptics ? 'ON' : 'OFF');
    hb.classList.toggle('off', !NVSET.haptics);
  }
  syncHapticsBtn();
  hb.addEventListener('click', function () {
    NVSET.haptics = !NVSET.haptics; saveSettings(); syncHapticsBtn(); HAP.select();
  });
  var sb = document.getElementById('sound-btn');
  function syncSoundBtn() {
    var m = NV_Audio.isMuted();
    sb.textContent = '🔊 SOUND: ' + (m ? 'OFF' : 'ON');
    sb.classList.toggle('off', m);
  }
  function toggleMute() { NV_Audio.setMuted(!NV_Audio.isMuted()); syncSoundBtn(); }
  syncSoundBtn();
  sb.addEventListener('click', function () { NV_Audio.init(); toggleMute(); HAP.select(); });
  var mb = document.getElementById('motion-btn');
  var MOTION_LABEL = { auto: 'AUTO', full: 'FULL', reduced: 'REDUCED' };
  function syncMotionBtn() {
    mb.textContent = '✨ MOTION: ' + MOTION_LABEL[NVSET.motion];
    mb.classList.toggle('off', NVSET.motion === 'reduced');
  }
  syncMotionBtn();
  mb.addEventListener('click', function () {
    NVSET.motion = NVSET.motion === 'auto' ? 'full' : NVSET.motion === 'full' ? 'reduced' : 'auto';
    saveSettings(); syncMotionBtn(); HAP.select();
  });
  var tb = document.getElementById('tilt-btn');
  function syncTiltBtn() {
    tb.textContent = '📐 TILT STEER: ' + (NVSET.tilt ? 'ON' : 'OFF');
    tb.classList.toggle('off', !NVSET.tilt);
  }
  if (!('DeviceOrientationEvent' in window)) tb.style.display = 'none';
  else {
    syncTiltBtn();
    tb.addEventListener('click', function () { tiltSet(!NVSET.tilt); HAP.select(); });
    if (NVSET.tilt) tiltSet(true);
  }
  /* test hooks (intentional): headless gameplay driving + debugging */
  window.__nv = {
    state: function () {
      if (!S) return null;
      return { score: S.score, enemies: S.enemies.length, rifts: S.rifts.length,
        bullets: S.bullets.length, lives: S.lives, over: S.over, mult: S.mult,
        geoms: S.geoms.length, geomsGot: S.geomsGot, time: Math.round(S.time * 10) / 10,
        dashCD: Math.round(S.dashCD * 100) / 100, dashT: S.dashT, kills: S.kills,
        surgeActive: S.surgeActive > 0, paused: S.paused, lowPerf: S.lowPerf,
        fired: S.fired, fireT: Math.round(S.fireT * 1000) / 1000, nFired: S.nFired || 0,
        mode: (typeof MODE !== 'undefined' ? MODE : '?') };
    },
    hurt: function () { if (S && !S.over) { S.invuln = 0; die(); } },
    dash: tryDash, bomb: bomb,
    spawn: function (t, elite) { if (S && !S.over) spawnEnemy(t, elite); },
    pause: function (p) { setPaused(p !== false); },
    sticks: function () {
      return {
        l: { id: stickL.id, mag: Math.round(stickL.mag * 100) / 100, dx: Math.round(stickL.dx * 100) / 100 },
        r: { id: stickR.id, mag: Math.round(stickR.mag * 100) / 100, dx: Math.round(stickR.dx * 100) / 100 }
      };
    }
  };
  requestAnimationFrame(loop);
})();
