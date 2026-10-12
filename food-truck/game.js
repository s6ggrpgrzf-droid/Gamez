/* Food Truck Manager — ticket chaos. Canvas UI + feel + scenes.
 * Sim lives in sim.js (pure, seeded). Art in art.js (pre-rendered).
 * Audio in audio.js (FTA). All tunables in config.js (FTC).
 *
 * Test hooks: window.__ftm = { scene(), sim(), save() }
 */
'use strict';
(function () {
  var W = 480, H = 800;
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var DPR = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * DPR; canvas.height = H * DPR;
  ctx.scale(DPR, DPR);

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeOutBack(t) { var s = 1.70158; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  var FONT_DISPLAY = 'Fraunces, Georgia, "Times New Roman", serif';
  var FONT_UI = 'Karla, -apple-system, "Segoe UI", sans-serif';

  /* ================= FEEL hub =================
   * One switch for all juice: enabled + intensity. Feel never decides
   * gameplay — it only reacts to committed sim results. */
  var FEEL = {
    enabled: true, intensity: 1, reduced: false,
    trauma: 0, shakeX: 0, shakeY: 0, lastOX: 0, lastOY: 0,
    hitstop: 0, flash: 0, flashColor: '255,240,200',
    time: 0,
    init: function () {
      try {
        this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch (e) { this.reduced = false; }
      var s = loadSave();
      if (s && s.feelOff) this.enabled = false;
    },
    addTrauma: function (x) {
      if (!this.enabled || this.reduced) return;
      this.trauma = clamp(this.trauma + x * this.intensity, 0, 1);
    },
    hitstopFor: function (sec) {
      if (!this.enabled || this.reduced) return;
      this.hitstop = Math.max(this.hitstop, sec); // wall-clock; decremented with real dt
    },
    doFlash: function (color) {
      if (!this.enabled || this.reduced) return;
      this.flash = FTC.FLASH_LEN;
      if (color) this.flashColor = color;
    },
    /* call once per frame with REAL dt (not sim dt) */
    update: function (rdt) {
      this.time += rdt;
      if (this.hitstop > 0) this.hitstop -= rdt;
      if (this.flash > 0) this.flash -= rdt;
      // trauma-squared shake, smooth noise, subtract last offset first
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0); // (offset applied by caller via translate)
      this.trauma = Math.max(0, this.trauma - FTC.SHAKE_DECAY * rdt);
      var sh = this.trauma * this.trauma * FTC.SHAKE_MAX * this.intensity;
      var t = this.time * 31;
      var nx = sh * (Math.sin(t * 1.1) * 0.6 + Math.sin(t * 2.3 + 1.7) * 0.4);
      var ny = sh * (Math.cos(t * 1.3 + 0.6) * 0.6 + Math.cos(t * 2.9 + 2.1) * 0.4);
      this.shakeX = nx; this.shakeY = ny;
    }
  };

  /* ================= particle pool =================
   * Fixed pool, no per-frame allocation. Particles are plain objects
   * recycled from a free list. */
  var POOL_N = 220;
  var parts = [], pFree = [];
  (function () {
    for (var i = 0; i < POOL_N; i++) {
      var p = { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 4, color: '#fff', grav: 0, drag: 0, shape: 0, rot: 0, vr: 0, active: false };
      parts.push(p); pFree.push(p);
    }
  })();
  function spawnP(x, y, vx, vy, life, size, color, grav, shape) {
    if (!FEEL.enabled && shape !== 9) return null;
    if (FEEL.reduced && shape !== 9) return null; // shape 9 = number pop text, always ok? no — respect reduced too
    var p = pFree.pop();
    if (!p) return null;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.maxLife = life; p.size = size; p.color = color;
    p.grav = grav || 0; p.drag = 0; p.shape = shape || 0;
    p.rot = Math.random() * TAU; p.vr = (Math.random() - 0.5) * 8;
    p.active = true;
    return p;
  }
  // text pops use a tiny separate pool (few at a time)
  var pops = [];
  function textPop(x, y, str, color, big) {
    if (pops.length > 24) pops.shift();
    pops.push({ x: x, y: y, str: str, color: color || '#F5E9D0', t: 0, dur: big ? 1.1 : 0.8, big: !!big, vy: -46 });
  }
  function updateParts(rdt) {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p.active) continue;
      p.life -= rdt;
      if (p.life <= 0) { p.active = false; pFree.push(p); continue; }
      p.vy += p.grav * rdt;
      p.x += p.vx * rdt; p.y += p.vy * rdt;
      p.rot += p.vr * rdt;
    }
    for (var j = pops.length - 1; j >= 0; j--) {
      var tp = pops[j];
      tp.t += rdt; tp.y += tp.vy * rdt; tp.vy *= (1 - 2.2 * rdt);
      if (tp.t >= tp.dur) pops.splice(j, 1);
    }
  }
  function burst(x, y, n, color, spd, life, size, grav, shape) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, s = spd * (0.4 + Math.random() * 0.8);
      spawnP(x, y, Math.cos(a) * s, Math.sin(a) * s - spd * 0.35, life * (0.7 + Math.random() * 0.6), size * (0.7 + Math.random() * 0.6), color, grav || 0, shape || 0);
    }
  }

  /* squash & stretch tweens: {obj key -> tween}. Kill previous on same channel. */
  var tweens = {};
  function tween(key, dur, onUpdate, onDone, ease) {
    tweens[key] = { t: 0, dur: dur, onUpdate: onUpdate, onDone: onDone, ease: ease || easeOutCubic };
  }
  function updateTweens(rdt) {
    for (var k in tweens) {
      var tw = tweens[k];
      tw.t += rdt;
      var t = clamp(tw.t / tw.dur, 0, 1);
      tw.onUpdate(tw.ease(t));
      if (t >= 1) { if (tw.onDone) tw.onDone(); delete tweens[k]; }
    }
  }

  /* ================= save ================= */
  var SAVE_KEY = FTC.SAVE_KEY;
  function defaultSave() {
    return {
      v: 1, coins: 40, upgrades: {}, buzz: FTC.BUZZ_START,
      menu: ['taco', 'quesadilla', 'nachos', 'agua'],
      regulars: [], totalStars: 0, shifts: 0,
      dailyBest: {}, // dateStr -> score
      feelOff: false, hapticsOff: false, muted: false,
      seenHowto: false, spotIdx: 0
    };
  }
  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || typeof s !== 'object') return null;
      if (s.v !== 1) { /* forward-only migrations would go here */ s.v = 1; }
      var d = defaultSave();
      for (var k in d) if (s[k] === undefined) s[k] = d[k];
      return s;
    } catch (e) { return null; }
  }
  function storeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch (e) {}
  }
  function arcadeName() {
    try { return localStorage.getItem('gamez_name') || 'Chef'; } catch (e) { return 'Chef'; }
  }

  /* ================= haptics ================= */
  function buzzH(pattern) {
    if (G.save.hapticsOff || FEEL.reduced) return;
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
  }

  /* ================= audio helpers ================= */
  function sfx(name, opt) {
    try { if (window.FTA) FTA.sfx(name, opt || {}); } catch (e) {}
  }
  function musicForRush(level) { // level 0..1
    try { if (window.FTA) FTA.musicSet(level); } catch (e) {}
  }

  /* ================= game state ================= */
  var G = {
    scene: 'title', sceneT: 0, prevScene: null,
    sim: null, save: loadSave() || defaultSave(),
    selDish: null,           // selected dish button id
    drag: null,              // {src:{kind,i}, x, y, dish}
    holdT: 0, holdTarget: null,
    pending: [],             // logical actions for this frame
    shiftKind: 'normal',     // 'normal' | 'daily'
    dailyDate: null,
    summary: null, summaryT: 0, countedRevenue: 0,
    board: null, boardErr: null,
    howto: false, howtoStep: 0,
    shopTab: 'upgrades',
    regularsCache: null,
    spotNames: ['5th & Main', 'Riverside Park', 'Stadium Gate', 'Old Depot', 'Harbor Walk', 'College Green'],
    mouse: { x: -1, y: -1, down: false },
    time: 0
  };
  if (G.save.muted) { /* applied after FTA loads */ }

  /* pre-rendered grade overlays */
  var vignette = null, grain = null;
  function buildGrade() {
    vignette = document.createElement('canvas');
    vignette.width = W; vignette.height = H;
    var c = vignette.getContext('2d');
    var g = c.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(26,14,8,0.34)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    grain = document.createElement('canvas');
    grain.width = 128; grain.height = 128;
    var gc = grain.getContext('2d');
    var id = gc.createImageData(128, 128);
    for (var i = 0; i < id.data.length; i += 4) {
      var v = 118 + Math.random() * 40;
      id.data[i] = v; id.data[i + 1] = v * 0.94; id.data[i + 2] = v * 0.82; id.data[i + 3] = 255;
    }
    gc.putImageData(id, 0, 0);
  }

  function softShadow(x, y, w, h, r) {
    ctx.fillStyle = 'rgba(20,10,5,0.28)';
    roundRect(x + 3, y + 5, w, h, r);
    ctx.fill();
  }
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function kicker(str, x, y, size, color, align) {
    ctx.save();
    ctx.font = '700 ' + size + 'px ' + FONT_UI;
    try { ctx.letterSpacing = '3px'; } catch (e) {}
    ctx.fillStyle = color || '#E8A93D';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(str.toUpperCase(), x, y);
    ctx.restore();
  }
  function display(str, x, y, size, color, align, weight) {
    ctx.save();
    ctx.font = (weight || 900) + ' ' + size + 'px ' + FONT_DISPLAY;
    ctx.fillStyle = color || '#F5E9D0';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, y);
    ctx.restore();
  }
  function pointIn(r, x, y) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

  /* ================= scene graph =================
   * Fantasy sentence: "you're standing in the truck."
   * Structural guardrail: order tickets can ONLY be created by spawnTicket()
   * as children of a hatch frame node; grill slots only by spawnGrillSlot()
   * as children of the counter node. The old rail-zone layout is
   * inexpressible in this structure — not avoided, impossible. */
  function NG(x, y, w, h) {
    return {
      x: x, y: y, w: w, h: h, children: [], parent: null, visible: true,
      ax: 0, ay: 0,
      add: function (c) { c.parent = this; this.children.push(c); return c; },
      drop: function (c) { var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); },
      clear: function () { this.children.length = 0; },
      draw: function () {},
      update: null, onTap: null, onPress: null, onDrop: null, onHold: null,
      hitTest: null, clip: false, tag: null
    };
  }
  function layoutTree(n, ox, oy) {
    n.ax = ox + n.x; n.ay = oy + n.y;
    for (var i = 0; i < n.children.length; i++) layoutTree(n.children[i], n.ax, n.ay);
  }
  function drawTree(n) {
    if (!n.visible) return;
    ctx.save();
    ctx.translate(n.x, n.y);
    if (n.clip) { ctx.beginPath(); ctx.rect(0, 0, n.w, n.h); ctx.clip(); }
    n.draw();
    for (var i = 0; i < n.children.length; i++) drawTree(n.children[i]);
    ctx.restore();
  }
  function hitTree(n, px, py) {
    if (!n.visible) return null;
    var lx = px - n.x, ly = py - n.y, i, r;
    for (i = n.children.length - 1; i >= 0; i--) { r = hitTree(n.children[i], lx, ly); if (r) return r; }
    var ok = n.hitTest ? n.hitTest(lx, ly) : (lx >= 0 && ly >= 0 && lx <= n.w && ly <= n.h);
    if (ok && (n.onTap || n.onPress || n.onDrop || n.onHold)) return { node: n, lx: lx, ly: ly };
    return null;
  }
  function updateTree(n, rdt) {
    if (n.update) n.update(rdt);
    for (var i = 0; i < n.children.length; i++) updateTree(n.children[i], rdt);
  }

  /* Bake a static scene layer once into an offscreen canvas. The shared
   * draw helpers all use the closure `ctx`, so we swap it during the bake. */
  function bakeLayer(painter) {
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var real = ctx;
    ctx = c.getContext('2d');
    try { painter(); } finally { ctx = real; }
    return c;
  }

  /* ---------------- painters (static layers) ---------------- */

  function paintStreetInto(x, y, w, h, seed) {
    var rng = FTSIM.mulberry32(seed), i;
    var g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#8fb8dd');
    g.addColorStop(0.55, '#d9c9a3');
    g.addColorStop(1, '#c9a06a');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    // sun
    var sx = x + w * 0.72, sy = y + h * 0.24;
    var sg = ctx.createRadialGradient(sx, sy, 4, sx, sy, 60);
    sg.addColorStop(0, 'rgba(255,244,214,0.95)');
    sg.addColorStop(1, 'rgba(255,244,214,0)');
    ctx.fillStyle = sg; ctx.fillRect(sx - 60, sy - 60, 120, 120);
    ctx.fillStyle = '#fff3cf';
    ctx.beginPath(); ctx.arc(sx, sy, 14, 0, TAU); ctx.fill();
    // clouds
    ctx.fillStyle = 'rgba(245,240,228,0.85)';
    for (i = 0; i < 3; i++) {
      var cxp = x + rng() * w, cyp = y + h * (0.08 + rng() * 0.2);
      ctx.beginPath();
      ctx.ellipse(cxp, cyp, 22 + rng() * 18, 8 + rng() * 6, 0, 0, TAU);
      ctx.fill();
    }
    // far buildings
    var bh = h * 0.34, by = y + h * 0.62 - bh;
    ctx.fillStyle = '#9a8f7e';
    for (i = 0; i * 46 < w + 40; i++) {
      var bw2 = 34 + rng() * 22, bh2 = bh * (0.6 + rng() * 0.7);
      ctx.fillRect(x + i * 46 - 10, y + h * 0.62 - bh2, bw2, bh2);
    }
    // near brick row
    ctx.fillStyle = '#a0623f';
    ctx.fillRect(x, y + h * 0.62, w, h * 0.1);
    ctx.fillStyle = 'rgba(60,30,18,0.35)';
    for (i = 0; i < w; i += 18) ctx.fillRect(x + i, y + h * 0.62, 2, h * 0.1);
    // street
    ctx.fillStyle = '#4c4741';
    ctx.fillRect(x, y + h * 0.72, w, h * 0.28);
    ctx.fillStyle = '#5d5850';
    ctx.fillRect(x, y + h * 0.72, w, 6); // curb
    ctx.fillStyle = 'rgba(245,233,208,0.5)';
    for (i = 0; i < w; i += 34) ctx.fillRect(x + i, y + h * 0.86, 16, 3);
    // string lights across the top of the opening
    ctx.strokeStyle = 'rgba(42,35,32,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + 6);
    ctx.quadraticCurveTo(x + w / 2, y + 26, x + w, y + 6);
    ctx.stroke();
    for (i = 1; i < 8; i++) {
      var t = i / 8, lx = x + w * t;
      var ly = y + 6 + Math.sin(t * Math.PI) * 20;
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.arc(lx, ly + 6, 3.4, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(42,35,32,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly + 4); ctx.stroke();
    }
  }

  function woodBar(x, y, w, h) {
    ctx.fillStyle = '#6b4a26';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,235,200,0.10)';
    ctx.fillRect(x, y, w, 2);
    ctx.strokeStyle = 'rgba(42,26,12,0.55)';
    ctx.lineWidth = 1.5;
    var r = FTSIM.mulberry32((x * 7 + y * 13) | 0);
    for (var i = 0; i < 3; i++) {
      ctx.beginPath();
      if (w >= h) { var yy = y + 4 + r() * (h - 8); ctx.moveTo(x + 3, yy); ctx.lineTo(x + w - 3, yy + (r() * 4 - 2)); }
      else { var xx = x + 4 + r() * (w - 8); ctx.moveTo(xx, y + 3); ctx.lineTo(xx + (r() * 4 - 2), y + h - 3); }
      ctx.stroke();
    }
    ctx.fillStyle = '#3d2a14';
    ctx.beginPath(); ctx.arc(x + 8, y + h / 2, 2.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w - 8, y + h / 2, 2.2, 0, TAU); ctx.fill();
  }
  function paintWoodFrame(x, y, w, h, t) {
    woodBar(x, y, w, t);
    woodBar(x, y + h - t, w, t);
    woodBar(x, y + t, t, h - 2 * t);
    woodBar(x + w - t, y + t, t, h - 2 * t);
  }

  var TITLE_STATIC = null, SHIFT_STATIC = null, SHOP_STATIC = null, SUM_STATIC = null;

  function paintTitleStatic() {
    // dawn exterior
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2c3a58');
    g.addColorStop(0.35, '#7a5a6e');
    g.addColorStop(0.55, '#e8956b');
    g.addColorStop(0.72, '#f2c078');
    g.addColorStop(1, '#3a2c22');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // sun glow low
    var sg = ctx.createRadialGradient(360, 470, 10, 360, 470, 190);
    sg.addColorStop(0, 'rgba(255,220,160,0.8)');
    sg.addColorStop(1, 'rgba(255,220,160,0)');
    ctx.fillStyle = sg; ctx.fillRect(150, 260, 420, 420);
    // building silhouettes
    ctx.fillStyle = '#3a2c33';
    var r = FTSIM.mulberry32(42), i;
    for (i = 0; i < 9; i++) {
      var bw = 44 + r() * 40, bh = 120 + r() * 130;
      ctx.fillRect(i * 56 - 12, 560 - bh, bw, bh);
    }
    ctx.fillStyle = 'rgba(242,192,120,0.5)';
    for (i = 0; i < 40; i++) ctx.fillRect(r() * W, 400 + r() * 150, 5, 7);
    // street
    ctx.fillStyle = '#4c4741'; ctx.fillRect(0, 560, W, 240);
    ctx.fillStyle = '#5d5850'; ctx.fillRect(0, 560, W, 8);
    ctx.fillStyle = 'rgba(245,233,208,0.4)';
    for (i = 0; i < W; i += 44) ctx.fillRect(i, 690, 24, 4);
    // string lights
    ctx.strokeStyle = 'rgba(20,14,10,0.9)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, 120); ctx.quadraticCurveTo(W / 2, 170, W, 120); ctx.stroke();
    for (i = 1; i < 14; i++) {
      var t = i / 14, lx = W * t, ly = 120 + Math.sin(t * Math.PI) * 50;
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.arc(lx, ly + 8, 4.5, 0, TAU); ctx.fill();
    }
    // the truck
    var truck = null;
    try { truck = FTART.truck(); } catch (e) {}
    if (truck) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(240, 668, 190, 14, 0, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.drawImage(truck, 40, 420, 400, 222);
    }
  }

  function paintShiftStatic() {
    // interior wall 0..500
    var g = ctx.createLinearGradient(0, 0, 0, 500);
    g.addColorStop(0, '#2e2115');
    g.addColorStop(1, '#241a12');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 500);
    // vertical plank seams
    ctx.strokeStyle = 'rgba(20,12,6,0.5)'; ctx.lineWidth = 2;
    for (var x = 0; x <= W; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 500); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,235,200,0.04)';
    for (x = 0; x < W; x += 128) ctx.fillRect(x, 0, 64, 500);
    // top trim
    ctx.fillStyle = '#1d140d'; ctx.fillRect(0, 0, W, 16);
    // streets seen through the hatches
    paintStreetInto(30, 112, 284, 284, 7);
    paintStreetInto(354, 108, 106, 216, 8);
    // wooden frames over the openings
    paintWoodFrame(14, 96, 316, 316, 16);
    paintWoodFrame(342, 96, 130, 240, 12);
    // shelf board under the drive-up hatch
    woodBar(342, 446, 130, 12);
    ctx.fillStyle = '#3d2a14';
    ctx.fillRect(348, 458, 10, 26); ctx.fillRect(456, 458, 10, 26);
    // counter 500..800
    ctx.fillStyle = '#1d140d'; ctx.fillRect(0, 500, W, 14);
    var cg = ctx.createLinearGradient(0, 514, 0, 790);
    cg.addColorStop(0, '#8a653a');
    cg.addColorStop(0.12, '#7a5a34');
    cg.addColorStop(1, '#5e421f');
    ctx.fillStyle = cg; ctx.fillRect(0, 514, W, 276);
    // counter grain
    ctx.strokeStyle = 'rgba(42,26,12,0.4)'; ctx.lineWidth = 1.5;
    var r = FTSIM.mulberry32(99);
    for (var i = 0; i < 14; i++) {
      var gy = 530 + r() * 240;
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy + (r() * 8 - 4)); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,235,200,0.12)'; ctx.fillRect(0, 514, W, 3);
    // counter front face
    ctx.fillStyle = '#2e1f10'; ctx.fillRect(0, 790, W, 10);
  }

  function paintShopStatic() {
    // commissary / supply room at dawn
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#241a12');
    g.addColorStop(1, '#1d140d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // shelves with crate silhouettes
    var r = FTSIM.mulberry32(5);
    for (var s = 0; s < 2; s++) {
      var sy = 210 + s * 250;
      woodBar(16, sy, W - 32, 12);
      for (var i = 0; i < 5; i++) {
        var cw = 56 + r() * 30, cx = 28 + i * 88;
        ctx.fillStyle = '#4a3a22';
        ctx.fillRect(cx, sy - 52 - r() * 20, cw, 52 + r() * 20);
        ctx.strokeStyle = '#2e2115'; ctx.lineWidth = 2;
        ctx.strokeRect(cx, sy - 52 - r() * 20, cw, 52 + r() * 20);
        ctx.beginPath(); ctx.moveTo(cx, sy - 26); ctx.lineTo(cx + cw, sy - 26); ctx.stroke();
      }
    }
    // hanging lamp glow
    var lg = ctx.createRadialGradient(W / 2, 120, 10, W / 2, 120, 220);
    lg.addColorStop(0, 'rgba(255,220,160,0.14)');
    lg.addColorStop(1, 'rgba(255,220,160,0)');
    ctx.fillStyle = lg; ctx.fillRect(0, 0, W, 400);
    ctx.strokeStyle = '#1d140d'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, 60); ctx.stroke();
    ctx.fillStyle = '#E8A93D';
    ctx.beginPath(); ctx.arc(W / 2, 74, 12, 0, TAU); ctx.fill();
  }

  function paintSummaryStatic() {
    // interior, shutter DOWN over the main hatch — the day is done
    paintShiftStatic();
    // shutter slats over the main opening
    ctx.fillStyle = '#5a5f66';
    ctx.fillRect(30, 112, 284, 284);
    ctx.fillStyle = '#6e737a';
    for (var y = 112; y < 396; y += 14) ctx.fillRect(30, y, 284, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(30, 112, 284, 284);
    // dim the whole room
    ctx.fillStyle = 'rgba(20,12,7,0.45)';
    ctx.fillRect(0, 0, W, H);
  }

  /* ================= scenes ================= */
  var SCN = {}; // per-scene registries, rebuilt by each scene builder

  function drawStar(x, y, r, on) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var rr = i % 2 === 0 ? r : r * 0.45;
      var a = -Math.PI / 2 + i * Math.PI / 5;
      ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = on ? '#E8A93D' : 'rgba(245,233,208,0.15)';
    ctx.fill();
    if (on) { ctx.strokeStyle = '#F5E9D0'; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.restore();
  }

  /* chalk plaque button — the only button factory in the codebase */
  function chalkButton(x, y, w, h, label, opts, onTap) {
    var b = NG(x, y, w, h);
    opts = opts || {};
    b.draw = function () {
      var hot = G.mouse.down && pointIn({ x: b.ax, y: b.ay, w: w, h: h }, G.mouse.x, G.mouse.y);
      softShadow(0, 3, w, h, 12);
      ctx.fillStyle = opts.red ? '#A93226' : (hot ? '#f2bd55' : (opts.ghost ? 'rgba(245,233,208,0.10)' : '#E8A93D'));
      roundRect(0, 0, w, h, 12); ctx.fill();
      if (opts.ghost) {
        ctx.strokeStyle = 'rgba(245,233,208,0.5)'; ctx.lineWidth = 2;
        roundRect(2, 2, w - 4, h - 4, 10); ctx.stroke();
      }
      ctx.save();
      ctx.font = '900 ' + (opts.small ? 15 : 19) + 'px ' + FONT_DISPLAY;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = opts.ghost ? '#F5E9D0' : (opts.red ? '#F5E9D0' : '#2A2320');
      ctx.fillText(label, w / 2, h / 2 + 1);
      ctx.restore();
    };
    b.onTap = onTap;
    return b;
  }

  function setScene(name) {
    G.prevScene = G.scene;
    G.scene = name;
    G.sceneT = 0;
    G.transT = 0;
    G.overlay = null;
    SCN = {};
    G.root = SCENES[name]();
    layoutTree(G.root, 0, 0);
  }
  var SCENES = {};

  /* ---------------- title: dawn, shutter down ---------------- */
  SCENES.title = function () {
    if (!TITLE_STATIC) TITLE_STATIC = bakeLayer(paintTitleStatic);
    var root = NG(0, 0, W, H);
    var bg = NG(0, 0, W, H);
    bg.draw = function () { ctx.drawImage(TITLE_STATIC, 0, 0); };
    bg.hitTest = function () { return false; };
    root.add(bg);

    var sh = NG(196, 474, 154, 82);
    sh.roll = 0; sh.rolling = false;
    sh.draw = function () {
      var roll = sh.roll || 0, hgt = 82 * (1 - roll);
      if (hgt < 1) return;
      ctx.save();
      ctx.fillStyle = '#5a5f66'; ctx.fillRect(0, 0, 154, hgt);
      ctx.fillStyle = '#767c84';
      for (var y = 4; y < hgt; y += 11) ctx.fillRect(0, y, 154, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, 154, hgt);
      ctx.strokeStyle = '#3a3d42'; ctx.lineWidth = 3;
      ctx.strokeRect(1, 1, 152, hgt - 2);
      if (roll < 0.25) {
        ctx.save();
        ctx.globalAlpha = clamp(1 - roll * 3, 0, 1);
        ctx.textAlign = 'center';
        ctx.font = '900 14px ' + FONT_UI;
        ctx.fillStyle = '#F5E9D0';
        ctx.fillText('TACO LOCO', 77, hgt / 2 - 6);
        ctx.font = '700 10px ' + FONT_UI;
        ctx.fillStyle = 'rgba(245,233,208,0.7)';
        ctx.fillText('v' + FTC.BUILD, 77, hgt / 2 + 12);
        ctx.restore();
      }
      ctx.restore();
    };
    sh.onTap = function () { rollUpShutter(); };
    root.add(sh);
    SCN.shutter = sh;

    var cb = NG(346, 596, 100, 124);
    cb.draw = function () {
      ctx.save();
      ctx.strokeStyle = '#3d2a14'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(16, 122); ctx.lineTo(6, 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(84, 122); ctx.lineTo(94, 6); ctx.stroke();
      softShadow(8, 4, 84, 94, 4);
      ctx.fillStyle = '#2E2C26';
      roundRect(8, 4, 84, 94, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(245,233,208,0.3)'; ctx.lineWidth = 1.5;
      roundRect(12, 8, 76, 86, 3); ctx.stroke();
      kicker('DAILY', 50, 36, 13, '#E8A93D', 'center');
      kicker('RUSH', 50, 54, 13, '#E8A93D', 'center');
      if (G.save.dailyBest[todayStr()]) drawStar(50, 76, 12, true);
      else {
        ctx.font = 'italic 11px ' + FONT_DISPLAY;
        ctx.fillStyle = 'rgba(245,233,208,0.6)';
        ctx.textAlign = 'center';
        ctx.fillText('fresh today', 50, 78);
      }
      ctx.restore();
    };
    cb.onTap = function () { sfx('ui'); buzzH(FTC.HAPTIC.select); startShift('daily'); };
    root.add(cb);

    var hint = NG(0, 0, W, H);
    hint.hitTest = function () { return false; };
    hint.draw = function () {
      if ((SCN.shutter && SCN.shutter.roll > 0)) return;
      var a = 0.55 + 0.35 * Math.sin(FEEL.time * 3);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = 'italic 700 16px ' + FONT_DISPLAY;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#F5E9D0';
      ctx.fillText('tap the shutter to open', 273, 604);
      ctx.restore();
    };
    root.add(hint);

    var mu = NG(14, 736, 52, 52);
    mu.draw = function () {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = '#F5E9D0'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(14, 22); ctx.lineTo(22, 22); ctx.lineTo(30, 14);
      ctx.lineTo(30, 38); ctx.lineTo(22, 30); ctx.lineTo(14, 30);
      ctx.closePath(); ctx.stroke();
      if (G.save.muted) {
        ctx.beginPath(); ctx.moveTo(34, 18); ctx.lineTo(46, 34); ctx.moveTo(46, 18); ctx.lineTo(34, 34); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(32, 26, 6, -0.9, 0.9); ctx.stroke();
        ctx.beginPath(); ctx.arc(32, 26, 11, -0.9, 0.9); ctx.stroke();
      }
      ctx.restore();
    };
    mu.onTap = function () { toggleMute(); sfx('ui'); };
    root.add(mu);
    return root;
  };
  function rollUpShutter() {
    var sh = SCN.shutter;
    if (!sh || sh.rolling) return;
    sh.rolling = true;
    sfx('select'); buzzH(FTC.HAPTIC.light);
    tween('shutter', 0.9, function (e) { sh.roll = e; }, function () { setScene('shop'); }, easeInOut);
  }

  /* ---------------- shop: the commissary ---------------- */
  SCENES.shop = function () {
    if (!SHOP_STATIC) SHOP_STATIC = bakeLayer(paintShopStatic);
    var root = NG(0, 0, W, H);
    var bg = NG(0, 0, W, H);
    bg.draw = function () { ctx.drawImage(SHOP_STATIC, 0, 0); };
    bg.hitTest = function () { return false; };
    root.add(bg);
    var head = NG(0, 0, W, H);
    head.hitTest = function () { return false; };
    head.draw = function () {
      kicker('The commissary', 24, 46, 15, '#E8A93D');
      display('Prep for the rush', 24, 88, 38, '#F5E9D0', 'left', 900);
      ctx.save();
      ctx.font = '700 18px ' + FONT_UI; ctx.fillStyle = '#E8A93D'; ctx.textAlign = 'left';
      ctx.fillText('$' + G.save.coins.toFixed(2), 24, 118);
      ctx.restore();
    };
    root.add(head);
    root.add(chalkButton(24, 134, 210, 44, 'SUPPLY CRATES', { ghost: G.shopTab !== 'upgrades', small: true }, function () { G.shopTab = 'upgrades'; sfx('ui'); setScene('shop'); }));
    root.add(chalkButton(246, 134, 210, 44, 'MENU BOARD', { ghost: G.shopTab !== 'menu', small: true }, function () { G.shopTab = 'menu'; sfx('ui'); setScene('shop'); }));
    var body = NG(0, 0, W, H);
    body.hitTest = function () { return false; };
    root.add(body);
    if (G.shopTab === 'upgrades') buildShopUpgrades(body); else buildShopMenu(body);
    root.add(chalkButton(90, 716, 300, 58,
      G.shiftKind === 'daily' ? 'START DAILY RUSH' : 'ROLL TO ' + G.spotNames[G.save.spotIdx % G.spotNames.length].toUpperCase(),
      {}, function () { sfx('ui'); buzzH(FTC.HAPTIC.serve); beginShift(); }));
    return root;
  };
  function buildShopUpgrades(body) {
    var keys = Object.keys(FTC.UPGRADES);
    for (var i = 0; i < keys.length; i++) {
      (function (uk, idx) {
        var u = FTC.UPGRADES[uk], y = 190 + idx * 68;
        var card = NG(24, y, W - 48, 60);
        card.draw = function () {
          softShadow(0, 2, W - 48, 60, 8);
          ctx.fillStyle = '#4a3a22';
          roundRect(0, 0, W - 48, 60, 8); ctx.fill();
          ctx.strokeStyle = 'rgba(42,26,12,0.8)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(W - 48, 20); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, 40); ctx.lineTo(W - 48, 40); ctx.stroke();
          ctx.save();
          ctx.textAlign = 'left';
          ctx.font = '900 15px ' + FONT_DISPLAY; ctx.fillStyle = '#F5E9D0';
          ctx.fillText(u.name, 14, 24);
          ctx.font = '400 11px ' + FONT_UI; ctx.fillStyle = 'rgba(245,233,208,0.65)';
          ctx.fillText(u.desc.slice(0, 52), 14, 42);
          if (u.desc.length > 52) ctx.fillText(u.desc.slice(52, 100), 14, 54);
          ctx.restore();
        };
        var owned = !!G.save.upgrades[uk];
        if (owned) {
          var tag = NG(0, 0, W - 48, 60);
          tag.hitTest = function () { return false; };
          tag.draw = function () {
            ctx.save();
            ctx.font = '900 13px ' + FONT_DISPLAY; ctx.fillStyle = '#7FB069'; ctx.textAlign = 'right';
            ctx.fillText('OWNED', W - 62, 37);
            ctx.restore();
          };
          card.add(tag);
        } else {
          var afford = G.save.coins >= u.cost;
          card.add(chalkButton(W - 140, 12, 100, 36, '$' + u.cost, { small: true, ghost: !afford }, function () {
            if (G.save.coins >= u.cost) {
              G.save.coins -= u.cost;
              G.save.upgrades[uk] = true;
              storeSave(); sfx('cha'); buzzH(FTC.HAPTIC.perfect);
              setScene('shop');
            } else { sfx('error'); buzzH(FTC.HAPTIC.error); }
          }));
        }
        body.add(card);
      })(keys[i], i);
    }
  }
  function buildShopMenu(body) {
    var pts = FTSIM.menuPoints(G.save.menu);
    var head = NG(0, 0, W, H);
    head.hitTest = function () { return false; };
    head.draw = function () {
      ctx.save();
      ctx.font = '700 15px ' + FONT_UI; ctx.fillStyle = '#F5E9D0'; ctx.textAlign = 'left';
      ctx.fillText('Menu difficulty   ' + pts + ' / ' + FTC.MENU_TARIFF + ' pts', 24, 200);
      ctx.font = '400 12px ' + FONT_UI; ctx.fillStyle = 'rgba(245,233,208,0.6)';
      ctx.fillText('Harder dishes pay more. The menu is the difficulty — you set it.', 24, 220);
      ctx.restore();
    };
    body.add(head);
    var ids = Object.keys(FTC.DISHES);
    for (var d2 = 0; d2 < ids.length; d2++) {
      (function (id, idx) {
        var dd = FTC.DISHES[id], my = 236 + idx * 60, on = G.save.menu.indexOf(id) >= 0;
        var row = NG(24, my, W - 48, 52);
        row.draw = function () {
          softShadow(0, 2, W - 48, 52, 8);
          ctx.fillStyle = on ? '#4a3a22' : '#2b241b';
          roundRect(0, 0, W - 48, 52, 8); ctx.fill();
          drawDishIcon(id, 10, 6, 40, 40);
          ctx.save();
          ctx.textAlign = 'left';
          ctx.font = '900 15px ' + FONT_DISPLAY; ctx.fillStyle = on ? '#F5E9D0' : 'rgba(245,233,208,0.45)';
          ctx.fillText(dd.name + '  (' + dd.pts + 'pt' + (dd.pts === 1 ? '' : 's') + ')', 60, 24);
          ctx.font = '700 12px ' + FONT_UI; ctx.fillStyle = '#E8A93D';
          ctx.fillText('$' + dd.price.toFixed(2), 60, 42);
          ctx.restore();
        };
        row.add(chalkButton(W - 132, 8, 84, 36, on ? 'OFF' : 'ADD', { small: true, ghost: !on }, function () {
          var ix = G.save.menu.indexOf(id);
          if (ix >= 0) {
            if (G.save.menu.length > 2) { G.save.menu.splice(ix, 1); sfx('ui'); }
            else { sfx('error'); return; }
          } else {
            var p2 = FTSIM.menuPoints(G.save.menu.concat([id]));
            if (p2 <= FTC.MENU_TARIFF && G.save.menu.length < FTC.MENU_MAX_DISHES) { G.save.menu.push(id); sfx('ui'); }
            else { sfx('error'); return; }
          }
          storeSave();
          setScene('shop');
        }));
        body.add(row);
      })(ids[d2], d2);
    }
  }

  /* ---------------- summary: shutter down, counting the jar ---------------- */
  SCENES.summary = function () {
    if (!SUM_STATIC) SUM_STATIC = bakeLayer(paintSummaryStatic);
    var root = NG(0, 0, W, H);
    var bg = NG(0, 0, W, H);
    bg.draw = function () { ctx.drawImage(SUM_STATIC, 0, 0); };
    bg.hitTest = function () { return false; };
    root.add(bg);
    var s = G.summary;
    var info = NG(0, 0, W, H);
    info.hitTest = function () { return false; };
    info.draw = function () {
      if (!G.summary) return;
      var t = clamp(G.summaryT / 1.2, 0, 1);
      G.countedRevenue = s.revenue * easeOutCubic(t);
      kicker(G.shiftKind === 'daily' ? 'Daily rush complete' : 'Shift complete', W / 2, 70, 15, '#E8A93D', 'center');
      for (var i = 0; i < 3; i++) {
        var on = i < s.stars;
        var st = easeOutBack(clamp((G.summaryT - 0.3 - i * 0.25) / 0.4, 0, 1));
        drawStar(W / 2 + (i - 1) * 84, 150, 30 * Math.max(0.01, st), on);
      }
      display('$' + G.countedRevenue.toFixed(2), W / 2, 240, 58, '#F5E9D0', 'center', 900);
      kicker('in tips & sales', W / 2, 268, 13, 'rgba(245,233,208,0.6)', 'center');
      var lines = [
        ['Served', s.served], ['Perfect plates', s.perfect],
        ['Best streak', 'x' + s.maxCombo], ['Walkouts', s.walkouts],
        ['Score', s.score], ['Buzz', s.buzz + '%']
      ];
      ctx.save();
      ctx.textAlign = 'left';
      for (var l = 0; l < lines.length; l++) {
        var ly = 330 + l * 34;
        ctx.font = '700 15px ' + FONT_UI; ctx.fillStyle = 'rgba(245,233,208,0.65)';
        ctx.fillText(lines[l][0], 90, ly);
        ctx.font = '900 17px ' + FONT_DISPLAY; ctx.fillStyle = '#F5E9D0'; ctx.textAlign = 'right';
        ctx.fillText(String(lines[l][1]), W - 90, ly);
        ctx.textAlign = 'left';
      }
      ctx.restore();
      ctx.save();
      ctx.font = 'italic 14px ' + FONT_DISPLAY; ctx.textAlign = 'center';
      if (G.shiftKind === 'daily') {
        ctx.fillStyle = '#E8A93D';
        ctx.fillText('posted to the daily board', W / 2, 552);
      } else {
        ctx.fillStyle = 'rgba(245,233,208,0.6)';
        ctx.fillText('tomorrow: ' + G.spotNames[G.save.spotIdx % G.spotNames.length], W / 2, 552);
      }
      ctx.restore();
    };
    root.add(info);
    root.add(chalkButton(90, 600, 300, 58, 'COMMISSARY', {}, function () { sfx('ui'); setScene('shop'); }));
    root.add(chalkButton(90, 668, 300, 48, 'RUN IT BACK', { ghost: true, small: true }, function () { sfx('ui'); beginShift(); }));
    return root;
  };

  /* ---------------- pause: the back of the CLOSED sign ---------------- */
  function buildPause() {
    var root = NG(0, 0, W, H);
    var dim = NG(0, 0, W, H);
    dim.hitTest = function () { return false; };
    dim.draw = function () { ctx.fillStyle = 'rgba(20,12,7,0.72)'; ctx.fillRect(0, 0, W, H); };
    root.add(dim);
    var sign = NG(90, 190, 300, 400);
    sign.draw = function () {
      softShadow(0, 5, 300, 400, 10);
      ctx.fillStyle = '#6b4a26';
      roundRect(0, 0, 300, 400, 10); ctx.fill();
      ctx.strokeStyle = '#3d2a14'; ctx.lineWidth = 6;
      roundRect(5, 5, 290, 390, 8); ctx.stroke();
      // chains
      ctx.strokeStyle = '#2e2115'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(70, 0); ctx.lineTo(70, -190); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(230, 0); ctx.lineTo(230, -190); ctx.stroke();
      kicker('CLOSED', 150, 52, 20, '#E8A93D', 'center');
      display('Paused', 150, 102, 40, '#F5E9D0', 'center', 900);
    };
    sign.add(chalkButton(40, 140, 220, 52, 'RESUME', {}, function () { G.paused = false; G.overlay = null; sfx('ui'); }));
    sign.add(chalkButton(40, 202, 220, 48, 'QUIT TO TITLE', { ghost: true, small: true }, function () {
      G.paused = false; G.overlay = null;
      try { if (window.FTA) FTA.musicStop(); } catch (e) {}
      setScene('title'); sfx('ui');
    }));
    sign.add(chalkButton(40, 260, 220, 48, (G.save.muted ? 'UNMUTE' : 'MUTE') + ' / JUICE ' + (FEEL.enabled ? 'ON' : 'OFF'), { ghost: true, small: true }, function () {
      toggleMute(); sfx('ui'); setScene(G.scene); G.paused = true; G.overlay = buildPause();
    }));
    sign.add(chalkButton(40, 318, 220, 48, 'HAPTICS: ' + (G.save.hapticsOff ? 'OFF' : 'ON'), { ghost: true, small: true }, function () {
      G.save.hapticsOff = !G.save.hapticsOff; storeSave(); sfx('ui'); buzzH(FTC.HAPTIC.select);
      G.overlay = buildPause(); layoutTree(G.overlay, 0, 0);
    }));
    root.add(sign);
    return root;
  }

  /* ---------------- how-to: chalkboard notes ---------------- */
  var HOWTO = [
    ['Tap an empty grill slot, pick a dish.', 'Food cooks on its own — watch the ring. Golden glow means PERFECT.'],
    ['Drag finished food UP through the hatch.', 'Drop it on the ticket. Serve in order to build your streak.'],
    ['Drag grill food to a warmer to prep ahead.', 'Held food spoils — watch the green ring. Stale food kills buzz.'],
    ['Burnt? Tap to clear. Trash? Hold it.', 'The bell fires everything ready. The drive-up bell means a second line needs you.']
  ];
  function buildHowto() {
    var root = NG(0, 0, W, H);
    var dim = NG(0, 0, W, H);
    dim.hitTest = function () { return false; };
    dim.draw = function () { ctx.fillStyle = 'rgba(20,12,7,0.85)'; ctx.fillRect(0, 0, W, H); };
    root.add(dim);
    var board = NG(60, 220, 360, 300);
    board.hitTest = function () { return false; };
    board.draw = function () {
      softShadow(0, 4, 360, 300, 8);
      ctx.fillStyle = '#2E2C26';
      roundRect(0, 0, 360, 300, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(245,233,208,0.3)'; ctx.lineWidth = 2;
      roundRect(6, 6, 348, 288, 6); ctx.stroke();
      var st = HOWTO[G.howtoStep];
      kicker('Running the truck  ' + (G.howtoStep + 1) + '/4', 180, 44, 14, '#E8A93D', 'center');
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '900 24px ' + FONT_DISPLAY; ctx.fillStyle = '#F5E9D0';
      wrapText(st[0], 180, 100, 320, 30);
      ctx.font = '400 15px ' + FONT_UI; ctx.fillStyle = 'rgba(245,233,208,0.8)';
      wrapText(st[1], 180, 190, 320, 24);
      ctx.restore();
    };
    root.add(board);
    root.add(chalkButton(140, 560, 200, 52, G.howtoStep < 3 ? 'NEXT' : "LET'S COOK", { small: true }, function () {
      sfx('ui');
      G.howtoStep++;
      if (G.howtoStep >= HOWTO.length) { G.howto = false; G.overlay = null; G.save.seenHowto = true; storeSave(); }
      else { G.overlay = buildHowto(); layoutTree(G.overlay, 0, 0); }
    }));
    return root;
  }
  function wrapText(str, x, y, maxW, lh) {
    var words = str.split(' '), line = '', yy = y;
    ctx.textAlign = 'center';
    for (var i = 0; i < words.length; i++) {
      var t = line + words[i] + ' ';
      if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, yy); line = words[i] + ' '; yy += lh; }
      else line = t;
    }
    ctx.fillText(line, x, yy);
  }
  function toggleMute() {
    G.save.muted = !G.save.muted;
    storeSave();
    try { if (window.FTA) FTA.setMuted(G.save.muted); } catch (e) {}
  }

  /* ================= the shift: you're standing in the truck ================= */
  var ARCH_LABEL = { std: 'WALK-UP', biz: 'BUSINESS', senior: 'SENIOR', critic: 'CRITIC' };
  // queue slots in main-hatch view coords (284x284), feet position + scale
  var QSLOTS = [
    { x: 142, y: 208, s: 1.00 },
    { x: 58, y: 190, s: 0.80 }, { x: 226, y: 190, s: 0.80 },
    { x: 40, y: 168, s: 0.62 }, { x: 244, y: 168, s: 0.62 },
    { x: 142, y: 148, s: 0.55 }
  ];
  // drive-up slots in du-view coords (106x216)
  var DUSLOTS = [
    { x: 53, y: 160, s: 0.50 }, { x: 53, y: 105, s: 0.42 }, { x: 53, y: 52, s: 0.36 }
  ];

  function sortedCustomers() {
    if (!G.sim) return [];
    return G.sim.customers.slice().sort(function (a, b) {
      return (a.patience / a.maxPatience) - (b.patience / b.maxPatience);
    });
  }
  function findCust(id) {
    var s = G.sim, i;
    if (!s) return null;
    for (i = 0; i < s.customers.length; i++) if (s.customers[i].id === id) return s.customers[i];
    for (i = 0; i < s.driveup.length; i++) if (s.driveup[i].id === id) return s.driveup[i];
    return null;
  }

  /* THE ticket factory — the only place order tickets can be created.
   * Tickets exist exclusively as children of a hatch frame node. */
  function spawnTicket(frameNode, cust) {
    var t = NG(0, 4, 96, 108);
    t.custId = cust.id; t.rot = 0; t.sq = 1;
    t.draw = function () { drawTicketNode(t); };
    t.onTap = function (lx, ly) {
      var cu = findCust(t.custId);
      if (!cu || cu.state !== 'waiting') return;
      if (ly > 80 && cu.usual) {
        G.pending.push({ t: 'usual', cust: cu.id });
        sfx('pop'); buzzH(FTC.HAPTIC.serve);
        return;
      }
      if (G.selDish === 'agua') {
        G.pending.push({ t: 'serve', cust: cu.id, src: { kind: 'cooler', i: 0 } });
        optimisticServeNode(t);
      }
    };
    t.onDrop = function (drag) {
      var cu = findCust(t.custId);
      if (!cu || cu.state !== 'waiting') return;
      G.pending.push({ t: 'serve', cust: cu.id, src: drag.src });
      optimisticServeNode(t);
    };
    frameNode.add(t);
    return t;
  }

  function drawTicketNode(t) {
    var cu = findCust(t.custId);
    if (!cu) return;
    var sq = t.sq || 1;
    ctx.save();
    ctx.translate(48, 54); ctx.scale(sq, sq); ctx.rotate(t.rot || 0); ctx.translate(-48, -54);
    var slip = null;
    try { slip = FTART.ticket(96, 108); } catch (e) {}
    if (slip) ctx.drawImage(slip, 0, 0, 96, 108);
    else { ctx.fillStyle = '#F5E9D0'; roundRect(0, 0, 96, 108, 4); ctx.fill(); }
    ctx.fillStyle = '#C0392B';
    ctx.beginPath(); ctx.arc(48, 8, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(46.5, 6.5, 1.8, 0, TAU); ctx.fill();
    var frac = cu.maxPatience > 0 ? cu.patience / cu.maxPatience : 1;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = '700 10px ' + FONT_UI;
    try { ctx.letterSpacing = '1px'; } catch (e2) {}
    ctx.fillStyle = cu.usual ? '#C0392B' : '#2A2320';
    var nm = cu.usual ? 'THE USUAL' : (cu.name || ARCH_LABEL[cu.arch] || cu.arch.toUpperCase());
    ctx.fillText(nm.slice(0, 14), 8, 26);
    try { ctx.letterSpacing = '0px'; } catch (e3) {}
    if (cu.name && !cu.usual) {
      ctx.font = 'italic 9px ' + FONT_DISPLAY; ctx.fillStyle = 'rgba(42,35,32,0.7)';
      ctx.fillText(cu.name.slice(0, 16), 8, 37);
    }
    for (var d = 0; d < cu.dishes.length; d++) {
      var dx = 8 + d * 32;
      drawDishIcon(cu.dishes[d], dx, 42, 28, 28);
      if (cu.got.indexOf(d) >= 0) {
        ctx.strokeStyle = '#7FB069'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(dx + 4, 58); ctx.lineTo(dx + 11, 65); ctx.lineTo(dx + 24, 49); ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(42,35,32,0.25)';
    roundRect(8, 72, 80, 6, 3); ctx.fill();
    ctx.fillStyle = patienceColor(frac);
    roundRect(8, 72, 80 * clamp(frac, 0, 1), 6, 3); ctx.fill();
    if (cu.usual && cu.state === 'waiting') {
      var hov = G.mouse.down && pointIn({ x: t.ax + 6, y: t.ay + 80, w: 84, h: 22 }, G.mouse.x, G.mouse.y);
      ctx.fillStyle = hov ? '#E8A93D' : '#C0392B';
      roundRect(6, 80, 84, 22, 6); ctx.fill();
      ctx.fillStyle = '#F5E9D0'; ctx.font = '700 9px ' + FONT_UI; ctx.textAlign = 'center';
      ctx.fillText('FIRE IT', 48, 95);
    }
    ctx.restore();
  }

  function optimisticServeNode(t) {
    tween('sv' + t.custId, 0.22, function (e) { t.sq = 1 + 0.25 * (1 - e); });
    burst(t.ax + 48, t.ay + 20, 6, '#E8A93D', 90, 0.5, 4, 200, 1);
  }

  /* Drive-up ticket: a compact card that lives ON the driver — created only
   * as a child of the drive-up hatch view node. */
  function spawnDuTicket(viewNode, cust, slot) {
    var d = NG(slot.x, slot.y, 106, 120);
    d.custId = cust.id; d.cs = slot.s; d.sq = 1;
    d.draw = function () { drawDuNode(d); };
    d.onTap = function () {
      var cu = findCust(d.custId);
      if (!cu || cu.state !== 'waiting') return;
      if (G.selDish === 'agua') {
        G.pending.push({ t: 'serve', cust: cu.id, src: { kind: 'cooler', i: 0 } });
        tween('sv' + d.custId, 0.22, function (e) { d.sq = 1 + 0.25 * (1 - e); });
      }
    };
    d.onDrop = function (drag) {
      var cu = findCust(d.custId);
      if (!cu || cu.state !== 'waiting') return;
      G.pending.push({ t: 'serve', cust: cu.id, src: drag.src });
      tween('sv' + d.custId, 0.22, function (e) { d.sq = 1 + 0.25 * (1 - e); });
      burst(d.ax + 53, d.ay - 40, 6, '#E8A93D', 90, 0.5, 4, 200, 1);
    };
    viewNode.add(d);
    return d;
  }
  function drawDuNode(d) {
    var cu = findCust(d.custId);
    if (!cu) return;
    var s = d.cs, sq = d.sq || 1;
    var frac = cu.maxPatience > 0 ? cu.patience / cu.maxPatience : 1;
    ctx.save();
    ctx.scale(sq, sq);
    ctx.scale(s, s);
    var face = null;
    try { face = FTART.customer(cu.arch); } catch (e) {}
    if (face) ctx.drawImage(face, -60, -140, 120, 140);
    ctx.restore();
    drawPatienceRing(0, -122 * s * sq, 20 * s, frac);
    ctx.save();
    var slip = null;
    try { slip = FTART.ticket(92, 44); } catch (e2) {}
    if (slip) ctx.drawImage(slip, -46, 8, 92, 44);
    else { ctx.fillStyle = '#F5E9D0'; roundRect(-46, 8, 92, 44, 4); ctx.fill(); }
    for (var m = 0; m < cu.dishes.length; m++) {
      drawDishIcon(cu.dishes[m], -40 + m * 30, 12, 26, 26);
      if (cu.got.indexOf(m) >= 0) {
        ctx.strokeStyle = '#7FB069'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-36 + m * 30, 28); ctx.lineTo(-31 + m * 30, 33); ctx.lineTo(-20 + m * 30, 19); ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(42,35,32,0.25)';
    roundRect(-40, 42, 80, 5, 2.5); ctx.fill();
    ctx.fillStyle = patienceColor(frac);
    roundRect(-40, 42, 80 * clamp(frac, 0, 1), 5, 2.5); ctx.fill();
    ctx.restore();
  }

  /* Grill slots exist only as children of the counter node. */
  function spawnGrillSlot(i) {
    var n = NG(16 + i * 112, 28, 104, 120);
    n.tag = 'grillSlot'; n.slot = i; n.popT = 1;
    n.draw = function () { drawGrillSlot(n); };
    n.onTap = function () {
      var s = G.sim;
      if (!s) return;
      var g = s.grill[i], st = FTSIM.grillState(s, g);
      if (st === 'burnt') {
        G.pending.push({ t: 'trash', kind: 'grill', i: i });
        sfx('trash'); buzzH(FTC.HAPTIC.light);
      } else if (!g.dish) {
        openFan(i);
      }
    };
    n.onPress = function () {
      var s = G.sim;
      if (!s) return;
      var g = s.grill[i];
      if (g.dish) ptr.holdTarget = { kind: 'grill', i: i, dish: g.dish };
    };
    n.onHold = function () {
      var s = G.sim;
      if (!s) return;
      var g = s.grill[i];
      if (g.dish) {
        G.pending.push({ t: 'trash', kind: 'grill', i: i });
        sfx('trash'); buzzH(FTC.HAPTIC.warn);
        burst(n.ax + 52, n.ay + 60, 8, '#8A8F7A', 110, 0.5, 5, 300, 1);
      }
    };
    return n;
  }
  function drawGrillSlot(n) {
    var s = G.sim;
    var pop = n.popT || 1;
    ctx.save();
    ctx.translate(52, 60); ctx.scale(pop, pop); ctx.translate(-52, -60);
    var tile = null;
    try { tile = FTART.grill(); } catch (e) {}
    if (tile) ctx.drawImage(tile, -8, -8, 120, 136);
    else { ctx.fillStyle = '#3a3128'; roundRect(0, 0, 104, 120, 10); ctx.fill(); }
    if (s) {
      var g = s.grill[n.slot], st = FTSIM.grillState(s, g);
      if (g.dish) {
        var d = FTC.DISHES[g.dish];
        drawDishIcon(g.dish, 22, 12, 60, 60);
        var frac = clamp(g.t / d.cook, 0, 1);
        ctx.save();
        ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(245,233,208,0.25)';
        ctx.beginPath(); ctx.arc(52, 42, 40, 0, TAU); ctx.stroke();
        ctx.strokeStyle = st === 'burnt' ? '#3a3a3a' : '#F5E9D0';
        ctx.beginPath(); ctx.arc(52, 42, 40, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.stroke();
        ctx.restore();
        if (st === 'perfect') {
          var pulse = 0.5 + 0.5 * Math.sin(FEEL.time * 7);
          ctx.save();
          ctx.strokeStyle = 'rgba(232,169,61,' + (0.55 + pulse * 0.4).toFixed(2) + ')';
          ctx.lineWidth = 3;
          roundRect(4, 4, 96, 112, 10); ctx.stroke();
          ctx.font = '900 13px ' + FONT_DISPLAY; ctx.textAlign = 'center';
          ctx.fillStyle = '#E8A93D';
          ctx.fillText('PERFECT', 52, 108);
          ctx.restore();
        } else if (st === 'burning') {
          if (Math.sin(FEEL.time * 11) > 0) {
            ctx.save();
            ctx.strokeStyle = 'rgba(224,75,52,0.95)'; ctx.lineWidth = 4;
            roundRect(4, 4, 96, 112, 10); ctx.stroke();
            ctx.restore();
          }
          if (Math.random() < 0.4) spawnP(n.ax + 52 + (Math.random() - 0.5) * 40, n.ay + 30, (Math.random() - 0.5) * 20, -60 - Math.random() * 40, 0.9, 8, '#4a4a4a', -30, 2);
          ctx.save();
          ctx.font = '900 13px ' + FONT_DISPLAY; ctx.textAlign = 'center';
          ctx.fillStyle = '#E04B34';
          ctx.fillText('GRAB IT!', 52, 108);
          ctx.restore();
        } else if (st === 'burnt') {
          ctx.save();
          ctx.fillStyle = 'rgba(20,10,5,0.55)';
          roundRect(4, 4, 96, 112, 10); ctx.fill();
          ctx.strokeStyle = '#E04B34'; ctx.lineWidth = 5; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(38, 30); ctx.lineTo(66, 58);
          ctx.moveTo(66, 30); ctx.lineTo(38, 58);
          ctx.stroke();
          ctx.font = '700 11px ' + FONT_UI; ctx.textAlign = 'center'; ctx.fillStyle = '#F5E9D0';
          ctx.fillText('TAP TO CLEAR', 52, 108);
          ctx.restore();
        } else {
          if (Math.random() < 0.14) spawnP(n.ax + 52 + (Math.random() - 0.5) * 50, n.ay + 55, (Math.random() - 0.5) * 15, -40, 0.7, 6, '#cfd4d6', -20, 2);
        }
      } else {
        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = 'rgba(245,233,208,0.25)';
        ctx.lineWidth = 2;
        roundRect(10, 10, 84, 100, 10); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '700 10px ' + FONT_UI; ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(232,169,61,0.85)';
        ctx.fillText('TAP', 52, 58);
        ctx.fillText('DISH', 52, 72);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function spawnWarmerSlot(i, x, w) {
    var n = NG(x, 156, w, 120);
    n.tag = 'warmerSlot'; n.slot = i;
    n.draw = function () { drawWarmerSlot(n); };
    n.onPress = function () {
      var s = G.sim;
      if (!s) return;
      var h = s.holding[i];
      if (h.dish) ptr.holdTarget = { kind: 'holding', i: i, dish: h.dish };
    };
    n.onHold = function () {
      var s = G.sim;
      if (!s) return;
      var h = s.holding[i];
      if (h.dish) {
        G.pending.push({ t: 'trash', kind: 'holding', i: i });
        sfx('trash'); buzzH(FTC.HAPTIC.warn);
      }
    };
    n.onDrop = function (drag) {
      if (drag.src.kind === 'grill') {
        G.pending.push({ t: 'hold', slot: drag.src.i, h: i });
        sfx('select'); buzzH(FTC.HAPTIC.light);
      }
    };
    return n;
  }
  function drawWarmerSlot(n) {
    var s = G.sim;
    ctx.save();
    var tile = null;
    try { tile = FTART.warmer(); } catch (e) {}
    if (tile) ctx.drawImage(tile, 0, 0, n.w, 120);
    else { ctx.fillStyle = '#4a3f30'; roundRect(0, 0, n.w, 120, 10); ctx.fill(); }
    if (s) {
      var h = s.holding[n.slot];
      if (h && h.dish) {
        var iw = Math.min(56, n.w - 24);
        drawDishIcon(h.dish, (n.w - iw) / 2, 14, iw, iw);
        var cx = n.w / 2, cy = 104;
        for (var sg = 0; sg < 6; sg++) {
          var on = h.fresh > sg / 6;
          var blink = (sg === 5) && h.fresh <= 0.22 && Math.sin(FEEL.time * 10) > 0;
          ctx.fillStyle = !on ? 'rgba(42,35,32,0.4)' : (blink ? '#E04B34' : '#7FB069');
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, 10, -Math.PI / 2 + sg * TAU / 6, -Math.PI / 2 + (sg + 1) * TAU / 6 - 0.08);
          ctx.closePath(); ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  /* dish fan: tap an empty grill slot, pick the dish right there */
  function openFan(slot) {
    var s = G.sim;
    if (!s) return;
    var fan = SCN.fan;
    fan.clear();
    var dishes = s.menu.filter(function (id) { return FTC.DISHES[id].grill; });
    var n = dishes.length;
    var slotCX = 16 + slot * 112 + 52;
    var x0 = clamp(slotCX - (n - 1) * 32, 40, W - 40 - n * 64);
    var dim = NG(0, 0, W, H);
    dim.draw = function () { ctx.fillStyle = 'rgba(20,12,7,0.45)'; ctx.fillRect(0, 0, W, H); };
    dim.onTap = function () { fan.visible = false; };
    fan.add(dim);
    for (var i = 0; i < n; i++) {
      (function (id, ix) {
        var b = NG(x0 + ix * 64, 440, 56, 56);
        b.draw = function () {
          var hot = G.mouse.down && pointIn({ x: b.ax, y: b.ay, w: 56, h: 56 }, G.mouse.x, G.mouse.y);
          softShadow(0, 3, 56, 56, 14);
          ctx.fillStyle = hot ? '#f2bd55' : '#3a3128';
          ctx.beginPath(); ctx.arc(28, 28, 28, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#E8A93D'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(28, 28, 28, 0, TAU); ctx.stroke();
          drawDishIcon(id, 8, 8, 40, 40);
        };
        b.onTap = function () {
          G.pending.push({ t: 'cook', dish: id, slot: slot });
          sfx('sizzle'); buzzH(FTC.HAPTIC.light);
          burst(b.ax + 28, b.ay + 28, 5, '#cfd4d6', 60, 0.6, 5, -40, 2);
          fan.visible = false;
        };
        fan.add(b);
      })(dishes[i], i);
    }
    fan.visible = true;
    layoutTree(G.root, 0, 0);
    sfx('ui');
  }

  function batchServe() {
    var s = G.sim;
    if (!s) return;
    var served = 0, i;
    var chans = [
      sortedCustomers(),
      s.driveup.slice().sort(function (a, b) { return a.seq - b.seq; })
    ];
    var avail = [];
    for (i = 0; i < s.grill.length; i++) {
      var g = s.grill[i];
      if (!g.dish) continue;
      var st = FTSIM.grillState(s, g);
      if (st === 'perfect' || st === 'burning') avail.push({ dish: g.dish, src: { kind: 'grill', i: i } });
    }
    for (i = 0; i < s.holding.length; i++) {
      var h = s.holding[i];
      if (h.dish && h.fresh > FTC.HOLD_OK) avail.push({ dish: h.dish, src: { kind: 'holding', i: i } });
    }
    avail.push({ dish: 'agua', src: { kind: 'cooler', i: 0 } });
    // the bell swings
    if (SCN.bell) tween('bell', 0.5, function (e) { SCN.bell.swing = Math.sin(e * Math.PI * 3) * (1 - e); });
    chans.forEach(function (list) {
      list.forEach(function (cust) {
        if (cust.state !== 'waiting') return;
        for (var d = 0; d < cust.dishes.length; d++) {
          if (cust.got.indexOf(d) >= 0) continue;
          var want = cust.dishes[d];
          for (var a = 0; a < avail.length; a++) {
            if (avail[a].dish === want) {
              G.pending.push({ t: 'serve', cust: cust.id, src: avail[a].src });
              if (avail[a].src.kind !== 'cooler') avail.splice(a, 1);
              served++;
              break;
            }
          }
        }
      });
    });
    if (served > 0) { sfx('bell'); sfx('cha', { pitch: 1 + Math.min(s.combo, 10) * 0.03 }); buzzH(FTC.HAPTIC.serve); }
    else { sfx('tap', { vol: 0.4 }); }
  }

  /* ---------------- the shift scene ---------------- */
  SCENES.shift = function () {
    if (!SHIFT_STATIC) SHIFT_STATIC = bakeLayer(paintShiftStatic);
    var root = NG(0, 0, W, H);
    var bg = NG(0, 0, W, H);
    bg.draw = function () { ctx.drawImage(SHIFT_STATIC, 0, 0); };
    bg.hitTest = function () { return false; };
    root.add(bg);

    SCN.tickets = {}; SCN.duTickets = {}; SCN.grillNodes = [];

    // wall clock — the shift timer
    var clock = NG(24, 30, 64, 64);
    clock.hitTest = function () { return false; };
    clock.draw = function () {
      ctx.save();
      ctx.fillStyle = '#F5E9D0';
      ctx.beginPath(); ctx.arc(32, 32, 30, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2A2320'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(32, 32, 30, 0, TAU); ctx.stroke();
      for (var i = 0; i < 12; i++) {
        var a = i * TAU / 12;
        ctx.beginPath();
        ctx.moveTo(32 + Math.cos(a) * 24, 32 + Math.sin(a) * 24);
        ctx.lineTo(32 + Math.cos(a) * 27, 32 + Math.sin(a) * 27);
        ctx.stroke();
      }
      var frac = (G.sim && G.sim.dur) ? clamp(G.sim.t / G.sim.dur, 0, 1) : 0;
      var ha = -Math.PI / 2 + frac * TAU;
      ctx.strokeStyle = '#C0392B'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(32, 32); ctx.lineTo(32 + Math.cos(ha) * 20, 32 + Math.sin(ha) * 20); ctx.stroke();
      ctx.fillStyle = '#2A2320';
      ctx.beginPath(); ctx.arc(32, 32, 3.5, 0, TAU); ctx.fill();
      ctx.restore();
    };
    root.add(clock);

    // hanging OPEN sign — tap to flip to CLOSED (pause)
    var sign = NG(208, 8, 96, 52);
    sign.draw = function () {
      ctx.save();
      ctx.strokeStyle = '#2e2115'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(24, -8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(72, 0); ctx.lineTo(72, -8); ctx.stroke();
      softShadow(0, 3, 96, 44, 6);
      ctx.fillStyle = '#7FB069';
      roundRect(0, 8, 96, 44, 6); ctx.fill();
      ctx.strokeStyle = '#3d5a34'; ctx.lineWidth = 2;
      roundRect(4, 12, 88, 36, 4); ctx.stroke();
      ctx.font = '900 20px ' + FONT_DISPLAY; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#2A2320';
      ctx.fillText('OPEN', 48, 31);
      ctx.restore();
    };
    sign.onTap = function () { sfx('ui'); pauseShift(); };
    root.add(sign);

    // main hatch
    var hatch = NG(14, 96, 316, 316);
    hatch.tag = 'hatch';
    var view = NG(16, 16, 284, 284);
    view.clip = true;
    view.draw = function () { drawQueue(view); };
    view.hitTest = function () { return false; };
    view.update = function (rdt) {
      if (!G.sim) return;
      var all = G.sim.customers.concat(G.sim.driveup);
      for (var i = 0; i < all.length; i++) {
        var cu = all[i];
        cu.wx = Math.min(1, (cu.wx == null ? 0 : cu.wx) + rdt / 0.6);
      }
    };
    hatch.add(view);
    SCN.view = view;
    var frame = NG(0, 0, 316, 316);
    frame.hitTest = function () { return false; };
    frame.draw = function () {
      // inner shadow line inside the frame
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 4;
      ctx.strokeRect(14, 14, 288, 288);
      ctx.restore();
    };
    hatch.add(frame);
    SCN.frame = frame;
    hatch.spawnTicket = function (cust) { return spawnTicket(frame, cust); };
    // service bell on the frame — batch serve
    var bell = NG(262, 268, 48, 44);
    bell.swing = 0;
    bell.draw = function () {
      ctx.save();
      ctx.translate(24, 40); ctx.rotate(bell.swing || 0); ctx.translate(-24, -40);
      var b = null;
      try { b = FTART.bell(); } catch (e) {}
      if (b) ctx.drawImage(b, 0, 0, 48, 44);
      else { ctx.fillStyle = '#E8A93D'; ctx.beginPath(); ctx.arc(24, 26, 20, Math.PI, 0); ctx.fill(); }
      ctx.restore();
    };
    bell.onTap = function () { batchServe(); };
    frame.add(bell);
    SCN.bell = bell;
    root.add(hatch);
    SCN.hatch = hatch;

    // drive-up hatch
    var du = NG(342, 96, 130, 240);
    du.tag = 'duHatch';
    var duview = NG(12, 12, 106, 216);
    duview.clip = true;
    duview.hitTest = function () { return false; };
    duview.draw = function () {};
    du.add(duview);
    SCN.duview = duview;
    var duframe = NG(0, 0, 130, 240);
    duframe.hitTest = function () { return false; };
    duframe.draw = function () {
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 3;
      ctx.strokeRect(10, 10, 110, 220);
      ctx.restore();
    };
    du.add(duframe);
    var dubell = NG(52, -6, 26, 30);
    dubell.swing = 0;
    dubell.draw = function () {
      ctx.save();
      ctx.translate(13, 28); ctx.rotate(dubell.swing || 0); ctx.translate(-13, -28);
      var b = null;
      try { b = FTART.bell(); } catch (e) {}
      if (b) ctx.drawImage(b, 0, 0, 26, 30);
      ctx.restore();
    };
    dubell.hitTest = function () { return false; };
    du.add(dubell);
    SCN.duBell = dubell;
    du.spawnDuTicket = function (cust, slot) { return spawnDuTicket(duview, cust, slot); };
    root.add(du);
    SCN.du = du;

    // tip jar on the shelf
    var jar = NG(348, 354, 56, 92);
    jar.hitTest = function () { return false; };
    jar.draw = function () {
      var coins = G.sim ? G.sim.coins : 0;
      var fill = clamp(coins / 150, 0, 1);
      ctx.save();
      // coins inside
      if (fill > 0.02) {
        ctx.fillStyle = '#E8A93D';
        var jh = 78 * fill;
        roundRect(6, 84 - jh, 44, jh, 6); ctx.fill();
        ctx.fillStyle = '#f2bd55';
        for (var i = 0; i < 5 * fill; i++) {
          ctx.beginPath(); ctx.arc(12 + (i * 37) % 32, 80 - (i * 53) % Math.max(8, jh - 4), 3, 0, TAU); ctx.fill();
        }
      }
      // glass
      ctx.fillStyle = 'rgba(200,220,235,0.18)';
      roundRect(2, 6, 52, 80, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(230,240,250,0.6)'; ctx.lineWidth = 2.5;
      roundRect(2, 6, 52, 80, 10); ctx.stroke();
      // lid + label
      ctx.fillStyle = '#6b4a26';
      roundRect(8, 0, 40, 12, 4); ctx.fill();
      ctx.font = '900 11px ' + FONT_UI; ctx.textAlign = 'center';
      ctx.fillStyle = '#2A2320';
      ctx.fillText('TIPS', 28, 52);
      ctx.restore();
    };
    root.add(jar);

    // radio — mute toggle
    var radio = NG(410, 392, 56, 54);
    radio.draw = function () {
      ctx.save();
      softShadow(0, 3, 56, 46, 6);
      ctx.fillStyle = '#4a3a22';
      roundRect(0, 8, 56, 46, 6); ctx.fill();
      ctx.strokeStyle = '#2e2115'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(44, 8); ctx.lineTo(54, -12); ctx.stroke();
      // speaker grille
      ctx.fillStyle = '#2E2C26';
      ctx.beginPath(); ctx.arc(20, 31, 13, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(245,233,208,0.25)';
      for (var i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.arc(20, 31, 4 + i * 3.5, 0, TAU); ctx.stroke();
      }
      // dial
      ctx.fillStyle = G.save.muted ? '#8A8F7A' : '#E8A93D';
      ctx.beginPath(); ctx.arc(44, 31, 6, 0, TAU); ctx.fill();
      if (!G.save.muted && Math.sin(FEEL.time * 4) > 0) {
        ctx.strokeStyle = 'rgba(232,169,61,0.8)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(20, 31, 19, -0.7, 0.7); ctx.stroke();
      }
      ctx.restore();
    };
    radio.onTap = function () { toggleMute(); sfx('ui'); };
    root.add(radio);

    // counter + grill
    var counter = NG(0, 500, 480, 300);
    counter.tag = 'counter';
    counter.hitTest = function () { return false; };
    for (var gi = 0; gi < 4; gi++) {
      var gs = spawnGrillSlot(gi);
      counter.add(gs);
      SCN.grillNodes.push(gs);
    }
    var wrap = NG(0, 0, 480, 300);
    wrap.hitTest = function () { return false; };
    counter.add(wrap);
    SCN.warmerWrap = wrap;
    buildWarmerSlots();
    // trash bin
    var bin = NG(0, 156, 68, 120);
    bin.tag = 'bin';
    bin.draw = function () {
      ctx.save();
      softShadow(0, 3, bin.w, 120, 8);
      ctx.fillStyle = '#3f4448';
      roundRect(0, 10, bin.w, 110, 8); ctx.fill();
      ctx.fillStyle = '#2c2f33';
      roundRect(0, 10, bin.w, 16, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(245,233,208,0.25)'; ctx.lineWidth = 2;
      for (var i = 1; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(8, 10 + i * 28); ctx.lineTo(bin.w - 8, 10 + i * 28); ctx.stroke();
      }
      ctx.font = '900 11px ' + FONT_UI; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(245,233,208,0.7)';
      ctx.fillText('TRASH', bin.w / 2, 66);
      ctx.restore();
    };
    bin.onDrop = function (drag) {
      var kind = drag.src.kind === 'cooler' ? null : drag.src.kind;
      if (kind) {
        G.pending.push({ t: 'trash', kind: kind, i: drag.src.i });
        sfx('trash'); buzzH(FTC.HAPTIC.warn);
      }
    };
    counter.add(bin);
    SCN.bin = bin;
    // cooler crate — instant agua
    var cooler = NG(0, 156, 80, 120);
    cooler.tag = 'cooler';
    cooler.draw = function () {
      ctx.save();
      softShadow(0, 3, cooler.w, 120, 8);
      ctx.fillStyle = '#5e421f';
      roundRect(0, 14, cooler.w, 106, 8); ctx.fill();
      ctx.strokeStyle = '#3d2a14'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 48); ctx.lineTo(cooler.w, 48); ctx.stroke();
      drawDishIcon('agua', cooler.w / 2 - 30, 30, 60, 60);
      var sel = G.selDish === 'agua';
      if (sel) {
        ctx.strokeStyle = '#F5E9D0'; ctx.lineWidth = 3;
        roundRect(3, 17, cooler.w - 6, 100, 7); ctx.stroke();
      }
      ctx.font = '700 10px ' + FONT_UI; ctx.textAlign = 'center';
      ctx.fillStyle = sel ? '#2A2320' : 'rgba(245,233,208,0.8)';
      if (sel) { ctx.fillStyle = '#E8A93D'; roundRect(0, 14, cooler.w, 106, 8); ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.fillStyle = 'rgba(245,233,208,0.8)';
      ctx.fillText('AGUA', cooler.w / 2, 112);
      ctx.restore();
    };
    cooler.onTap = function () {
      G.selDish = (G.selDish === 'agua') ? null : 'agua';
      sfx('ui'); buzzH(FTC.HAPTIC.select);
    };
    counter.add(cooler);
    SCN.cooler = cooler;
    root.add(counter);

    // dish fan layer (hidden until a grill slot is tapped)
    var fan = NG(0, 0, W, H);
    fan.visible = false;
    fan.hitTest = function () { return false; };
    root.add(fan);
    SCN.fan = fan;

    layoutTree(root, 0, 0);
    positionBinCooler();
    syncShiftNodes();
    return root;
  };

  function buildWarmerSlots() {
    var wrap = SCN.warmerWrap;
    if (!wrap || !G.sim) return;
    wrap.clear();
    SCN.warmerNodes = [];
    var n = G.sim.holding.length;
    var tw = n >= 4 ? 68 : 92, gap = 8, x0 = 16;
    for (var i = 0; i < n; i++) {
      var ws = spawnWarmerSlot(i, x0 + i * (tw + gap), tw);
      wrap.add(ws);
      SCN.warmerNodes.push(ws);
    }
    positionBinCooler();
  }
  function positionBinCooler() {
    if (!SCN.bin || !SCN.cooler || !G.sim) return;
    var n = G.sim.holding.length;
    var tw = n >= 4 ? 68 : 92, gap = 8;
    var endX = 16 + n * (tw + gap);
    SCN.bin.x = endX + 8; SCN.bin.w = 68;
    SCN.cooler.x = endX + 84; SCN.cooler.w = W - 16 - (endX + 84);
    if (SCN.cooler.w < 56) { SCN.cooler.w = 56; SCN.bin.w = W - 16 - 8 - 56 - (endX + 8); }
  }

  function drawQueue(view) {
    var sorted = sortedCustomers();
    for (var i = 0; i < sorted.length && i < 6; i++) {
      (function (cu, idx) {
        var sl = QSLOTS[idx];
        var e = easeOutCubic(clamp(cu.wx == null ? 1 : cu.wx, 0, 1));
        var x = sl.x + (1 - e) * 150, y = sl.y, s = sl.s;
        var frac = cu.maxPatience > 0 ? cu.patience / cu.maxPatience : 1;
        var jx = 0, jy = 0;
        if (frac < 0.35) {
          var a = FEEL.time * 10 + cu.id * 1.7;
          jx = Math.sin(a) * 3; jy = Math.abs(Math.cos(a * 1.3)) * 2;
        }
        var buzzJ = G.sim ? clamp(G.sim.buzz / FTC.BUZZ_MAX, 0, 1) * 2 : 0;
        jx += Math.sin(FEEL.time * 7 + cu.id * 2.3) * buzzJ;
        ctx.save();
        ctx.translate(x + jx, y + jy);
        ctx.scale(s, s);
        var face = null;
        try { face = FTART.customer(cu.arch); } catch (err) {}
        if (face) ctx.drawImage(face, -60, -140, 120, 140);
        else {
          ctx.fillStyle = '#C9A06A';
          ctx.beginPath(); ctx.arc(0, -70, 34, 0, TAU); ctx.fill();
        }
        ctx.restore();
        drawPatienceRing(x + jx, y - 122 * s + jy, Math.max(10, 20 * s), frac);
        // arrival pop
        if (cu.pop && cu.pop > 0.01) {
          ctx.save();
          ctx.globalAlpha = clamp(cu.pop, 0, 1) * 0.9;
          ctx.strokeStyle = '#E8A93D'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(x, y - 70 * s, 46 * s * (2 - cu.pop), 0, TAU); ctx.stroke();
          ctx.restore();
          cu.pop *= 0.9;
        }
      })(sorted[i], i);
    }
  }

  function syncShiftNodes() {
    var s = G.sim;
    if (!s || !SCN.frame) return;
    var sorted = sortedCustomers(), i, cu, t;
    var seen = {};
    for (i = 0; i < sorted.length && i < 6; i++) {
      cu = sorted[i];
      seen[cu.id] = true;
      t = SCN.tickets[cu.id];
      if (!t) {
        t = SCN.hatch.spawnTicket(cu);
        SCN.tickets[cu.id] = t;
        (function (cust, node) {
          if (cust.wx == null) cust.wx = 0;
          node.sq = 0.01;
          tween('tick' + cust.id, 0.3, function (e) { node.sq = Math.max(0.01, easeOutBack(e)); });
        })(cu, t);
      }
      var cx = 52.7 * (i + 0.5);
      t.x = cx - 48; t.y = 4;
      t.rot = (i % 2 ? -1 : 1) * 0.03;
    }
    for (var id in SCN.tickets) {
      if (!seen[id]) {
        var old = SCN.tickets[id];
        if (old.parent) old.parent.drop(old);
        delete SCN.tickets[id];
      }
    }
    // drive-up
    var duSeen = {};
    for (i = 0; i < s.driveup.length && i < 3; i++) {
      cu = s.driveup[i];
      duSeen[cu.id] = true;
      var d = SCN.duTickets[cu.id];
      if (!d) {
        d = SCN.du.spawnDuTicket(cu, DUSLOTS[i]);
        SCN.duTickets[cu.id] = d;
        if (cu.wx == null) cu.wx = 0;
      }
      d.x = DUSLOTS[i].x; d.y = DUSLOTS[i].y; d.cs = DUSLOTS[i].s;
    }
    for (id in SCN.duTickets) {
      if (!duSeen[id]) {
        var old2 = SCN.duTickets[id];
        if (old2.parent) old2.parent.drop(old2);
        delete SCN.duTickets[id];
      }
    }
    layoutTree(G.root, 0, 0);
  }

  /* ================= input =================
   * Pointer Events, logical actions only. The node tree owns hit-testing;
   * the sim only ever sees logical actions in G.pending. */
  var HOLD_MS = 400;
  var ptr = { down: false, id: -1, sx: 0, sy: 0, x: 0, y: 0, holdT: 0, holdFired: false, moved: false, holdTarget: null };

  function canvasPos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { FTA.init(); } catch (err) {}
    var p = canvasPos(e);
    ptr.down = true; ptr.id = e.pointerId;
    ptr.sx = p.x; ptr.sy = p.y; ptr.x = p.x; ptr.y = p.y;
    ptr.holdT = 0; ptr.holdFired = false; ptr.moved = false; ptr.holdTarget = null;
    G.mouse.down = true; G.mouse.x = p.x; G.mouse.y = p.y;
    var h = hitTree(G.overlay || G.root, p.x, p.y);
    if (h && h.node.onPress) h.node.onPress(h.lx, h.ly);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!ptr.down || e.pointerId !== ptr.id) return;
    var p = canvasPos(e);
    ptr.x = p.x; ptr.y = p.y;
    G.mouse.x = p.x; G.mouse.y = p.y;
    if (Math.hypot(p.x - ptr.sx, p.y - ptr.sy) > 12) ptr.moved = true;
    if (ptr.moved && !G.drag) tryStartDrag(ptr.sx, ptr.sy);
    if (G.drag) { G.drag.x = p.x; G.drag.y = p.y; }
  });
  function ptrUp(e) {
    if (!ptr.down || (e && e.pointerId !== ptr.id)) return;
    var p = e ? canvasPos(e) : { x: ptr.x, y: ptr.y };
    ptr.down = false; G.mouse.down = false;
    if (G.drag) {
      var h = hitTree(G.overlay || G.root, p.x, p.y);
      if (h && h.node.onDrop) h.node.onDrop(G.drag, h.lx, h.ly);
      else sfx('tap', { vol: 0.4 });
      G.drag = null;
    } else if (!ptr.holdFired && !ptr.moved) {
      var h2 = hitTree(G.overlay || G.root, p.x, p.y);
      if (h2 && h2.node.onTap) h2.node.onTap(h2.lx, h2.ly);
    }
    ptr.holdFired = false; ptr.holdTarget = null;
  }
  canvas.addEventListener('pointerup', ptrUp);
  canvas.addEventListener('pointercancel', function () { ptr.down = false; G.drag = null; G.mouse.down = false; ptr.holdTarget = null; });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { ptr.down = false; G.drag = null; G.mouse.down = false; ptr.holdTarget = null; pauseShift(); }
  });
  window.addEventListener('blur', function () { ptr.down = false; G.drag = null; G.mouse.down = false; ptr.holdTarget = null; });

  function tryStartDrag(sx, sy) {
    var s = G.sim;
    if (!s || G.scene !== 'shift') return;
    var h = hitTree(G.overlay || G.root, sx, sy);
    if (!h) return;
    var n = h.node, f = null;
    if (n.tag === 'grillSlot') {
      var g = s.grill[n.slot];
      if (g.dish) f = { kind: 'grill', i: n.slot, dish: g.dish };
    } else if (n.tag === 'warmerSlot') {
      var wh = s.holding[n.slot];
      if (wh.dish) f = { kind: 'holding', i: n.slot, dish: wh.dish };
    }
    if (f) {
      G.drag = { src: { kind: f.kind, i: f.i }, x: sx, y: sy, dish: f.dish };
      sfx('select'); buzzH(FTC.HAPTIC.select);
    }
  }

  /* hold-to-trash: deliberate discard, never double-tap */
  function updateHold(rdt) {
    if (!ptr.down || G.scene !== 'shift' || !G.sim || G.sim.phase !== 'shift') { ptr.holdT = 0; return; }
    if (ptr.moved || G.drag || ptr.holdFired) { ptr.holdT = 0; return; }
    var f = ptr.holdTarget;
    if (!f) return;
    ptr.holdT += rdt;
    if (ptr.holdT * 1000 >= HOLD_MS) {
      ptr.holdFired = true; ptr.holdT = 0;
      var s = G.sim, still = null;
      if (f.kind === 'grill' && s.grill[f.i].dish === f.dish) still = SCN.grillNodes[f.i];
      if (f.kind === 'holding' && s.holding[f.i].dish === f.dish) still = SCN.warmerNodes[f.i];
      if (still) {
        G.pending.push({ t: 'trash', kind: f.kind, i: f.i });
        sfx('trash'); buzzH(FTC.HAPTIC.warn);
        burst(still.ax + still.w / 2, still.ay + 60, 8, '#8A8F7A', 110, 0.5, 5, 300, 1);
      }
    }
  }

  /* ================= sim events -> juice ================= */
  function handleEvents(evts) {
    var s = G.sim;
    for (var i = 0; i < evts.length; i++) {
      var e = evts[i];
      switch (e.k) {
        case 'arrive': {
          var t = SCN.tickets[e.id];
          sfx('doorbell', { vol: 0.7 }); buzzH(FTC.HAPTIC.light);
          if (t) {
            var cu = findCust(e.id);
            textPop(t.ax + 48, t.ay - 8, cu && cu.usual ? 'THE USUAL' : 'NEW TICKET', '#E8A93D', false);
            burst(t.ax + 48, t.ay + 10, 6, '#F5E9D0', 70, 0.5, 4, 150, 1);
          }
          break;
        }
        case 'duArrive':
          sfx('bell'); buzzH(FTC.HAPTIC.light);
          if (SCN.duBell) tween('dubell', 0.6, function (x) { SCN.duBell.swing = Math.sin(x * Math.PI * 4) * (1 - x); });
          break;
        case 'cookStart': break;
        case 'done': {
          (function (slot) {
            var gn = SCN.grillNodes[slot];
            sfx('ding'); buzzH(FTC.HAPTIC.light);
            if (gn) {
              tween('grill' + slot, 0.25, function (x) { gn.popT = easeOutBack(x); });
              burst(gn.ax + 52, gn.ay + 30, 8, '#E8A93D', 90, 0.6, 4, -60, 2);
            }
          })(e.slot);
          break;
        }
        case 'burnWarn': {
          var wn = SCN.grillNodes[e.slot];
          sfx('warn', { pitch: 1.15 }); buzzH(FTC.HAPTIC.warn);
          if (wn) textPop(wn.ax + 52, wn.ay - 6, 'BURNING!', '#E04B34', true);
          FEEL.addTrauma(0.18);
          break;
        }
        case 'burnt': {
          var bn = SCN.grillNodes[e.slot];
          sfx('error'); buzzH(FTC.HAPTIC.error);
          FEEL.addTrauma(0.42);
          if (bn) {
            burst(bn.ax + 52, bn.ay + 40, 14, '#3a3a3a', 120, 0.9, 7, -50, 2);
            textPop(bn.ax + 52, bn.ay - 6, 'BURNT', '#E04B34', true);
          }
          break;
        }
        case 'spoiled': {
          var hn = SCN.warmerNodes[e.h];
          sfx('error', { vol: 0.6 }); buzzH(FTC.HAPTIC.warn);
          if (hn) textPop(hn.ax + hn.w / 2, hn.ay - 6, 'SPOILED', '#8A8F7A', false);
          break;
        }
        case 'staleWarn':
          sfx('warn', { pitch: 0.9, vol: 0.5 });
          break;
        case 'scraped': {
          var sn = SCN.grillNodes[e.slot];
          sfx('trash', { vol: 0.6 });
          if (sn) burst(sn.ax + 52, sn.ay + 60, 6, '#8A8F7A', 80, 0.5, 5, 200, 1);
          break;
        }
        case 'held': sfx('select'); break;
        case 'trashed': break;
        case 'served': onServed(e); break;
        case 'servedPart': onServed(e); break;
        case 'wrongDish':
          sfx('error', { vol: 0.7 }); buzzH(FTC.HAPTIC.error);
          break;
        case 'walkout': case 'duWalkout':
          sfx('error'); buzzH(FTC.HAPTIC.error);
          FEEL.addTrauma(0.5);
          FEEL.doFlash('224,75,52');
          break;
        case 'comboLost': break;
        case 'usual':
          sfx('milestone'); buzzH(FTC.HAPTIC.perfect);
          textPop(W / 2, 220, e.name.toUpperCase() + ' IS A REGULAR NOW', '#E8A93D', true);
          burst(W / 2, 220, 22, '#E8A93D', 150, 0.9, 5, 120, 3);
          break;
        case 'usualPrep':
          sfx('pop'); buzzH(FTC.HAPTIC.serve);
          break;
        case 'usualFail':
          sfx('error', { vol: 0.5 });
          break;
        case 'shiftEnd':
          onShiftEnd(e.summary);
          break;
      }
    }
    // decay ticket/grill pop scales
    if (SCN.tickets) for (var id in SCN.tickets) { var tt = SCN.tickets[id]; if (tt.sq > 1) tt.sq = Math.max(1, tt.sq - 0.08); }
    if (SCN.grillNodes) for (var gi = 0; gi < SCN.grillNodes.length; gi++) { var gg2 = SCN.grillNodes[gi]; if (gg2.popT > 1) gg2.popT = Math.max(1, gg2.popT - 0.08); }
  }

  function onServed(e) {
    var s = G.sim;
    var combo = e.combo || 0;
    sfx('cha', { pitch: 1 + Math.min(combo, 12) * 0.035 });
    buzzH(e.rating === 'perfect' ? FTC.HAPTIC.perfect : FTC.HAPTIC.serve);
    // coins fly to the tip jar
    for (var c = 0; c < 5; c++) {
      spawnP(W / 2 + (Math.random() - 0.5) * 160, 320, (Math.random() - 0.5) * 60, -120 - Math.random() * 60, 0.8, 4, '#E8A93D', 300, 1);
    }
    if (e.rating === 'perfect') {
      FEEL.hitstopFor(combo >= 5 ? FTC.HITSTOP_MILESTONE : FTC.HITSTOP_PERFECT);
      burst(W / 2, 320, 10, '#E8A93D', 130, 0.7, 5, 160, 3);
      burst(W / 2, 320, 6, '#F5E9D0', 90, 0.5, 4, 100, 1);
      textPop(W / 2, 290, 'PERFECT +' + Math.round(e.tip * 100) / 100, '#E8A93D', true);
    } else {
      textPop(W / 2, 320, '+$' + (Math.round(e.tip * 100) / 100), '#F5E9D0', false);
    }
    if (e.milestone) {
      sfx('milestone', { pitch: 1 + e.milestone * 0.02 });
      FEEL.doFlash('232,169,61');
      FEEL.hitstopFor(FTC.HITSTOP_MILESTONE);
      textPop(W / 2, 250, e.milestone + ' STREAK!', '#E8A93D', true);
      burst(W / 2, 250, 26, '#E8A93D', 170, 1.0, 6, 140, 3);
      if (s.combo >= 8) sfx('cheer');
    }
    if (e.special) {
      textPop(W / 2, 210, 'SPECIAL!', '#E04B34', true);
      burst(W / 2, 210, 12, '#E04B34', 120, 0.7, 5, 120, 3);
    }
  }

  /* ================= main loop ================= */
  var lastT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var rdt = Math.min(0.1, (now - lastT) / 1000 || 0.016);
    lastT = now;
    G.time += rdt;
    G.sceneT += rdt;
    if (G.transT == null) G.transT = 1;
    if (G.transT < 1) G.transT = Math.min(1, G.transT + rdt / 0.35);
    if (G.scene === 'summary') G.summaryT += rdt;
    FEEL.update(rdt);
    updateParts(rdt);
    updateTweens(rdt);
    updateHold(rdt);
    if (G.root) updateTree(G.root, rdt);
    if (G.overlay) updateTree(G.overlay, rdt);

    var simDt = (FEEL.hitstop > 0) ? 0 : rdt;
    if (G.scene === 'shift' && G.sim && G.sim.phase === 'shift' && !G.paused) {
      FTSIM.update(G.sim, simDt, G.pending);
      var evts = FTSIM.drain(G.sim);
      if (evts.length) handleEvents(evts);
      var rush = clamp((G.sim.customers.length + G.sim.driveup.length) / 7, 0, 1);
      var burning = 0;
      for (var i = 0; i < G.sim.grill.length; i++) {
        var st = FTSIM.grillState(G.sim, G.sim.grill[i]);
        if (st === 'burning' || st === 'burnt') burning = 1;
      }
      musicForRush(clamp(rush * 0.7 + burning * 0.3 + 0.15, 0, 1));
    }
    G.pending.length = 0;
    if (G.scene === 'shift') syncShiftNodes();

    render();
  }

  function pauseShift() {
    if (G.scene === 'shift' && G.sim && G.sim.phase === 'shift' && !G.paused) {
      G.paused = true;
      G.overlay = buildPause();
      layoutTree(G.overlay, 0, 0);
      sfx('ui');
    }
  }

  /* ================= render ================= */
  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (FEEL.enabled && !FEEL.reduced) ctx.translate(FEEL.shakeX, FEEL.shakeY);
    if (G.root) drawTree(G.root);
    ctx.restore();
    if (G.overlay) drawTree(G.overlay);
    if (vignette) ctx.drawImage(vignette, 0, 0, W, H);
    if (grain) { ctx.save(); ctx.globalAlpha = 0.05; ctx.drawImage(grain, 0, 0, W, H); ctx.restore(); }
    if (FEEL.flash > 0) {
      ctx.fillStyle = 'rgba(' + FEEL.flashColor + ',' + (FEEL.flash / FTC.FLASH_LEN * 0.28).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    drawParts();
    drawPops();
    if (G.drag) drawDragGhost();
    drawTransition();
  }

  function drawDishIcon(id, x, y, w, h) {
    var img = null;
    try { img = FTART.dish(id); } catch (e) {}
    if (img) { ctx.drawImage(img, x, y, w, h); return; }
    // fallback: mustard circle with initial
    ctx.fillStyle = '#E8A93D';
    ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, w * 0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2A2320'; ctx.font = '900 ' + (w * 0.4) + 'px ' + FONT_DISPLAY;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((FTC.DISHES[id] || { name: '?' }).name[0], x + w / 2, y + h / 2 + 1);
  }
  function patienceColor(f) {
    // green -> yellow -> orange -> red
    if (f > 0.6) return '#7FB069';
    if (f > 0.35) return '#E8A93D';
    if (f > 0.15) return '#E07B39';
    return '#C0392B';
  }
  function drawPatienceRing(x, y, r, frac) {
    ctx.save();
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(42,35,32,0.35)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    var col = patienceColor(frac);
    ctx.strokeStyle = col;
    ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(frac, 0, 1)); ctx.stroke();
    if (frac < 0.18 && Math.sin(FEEL.time * 10) > 0) {
      ctx.strokeStyle = 'rgba(224,75,52,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r + 4, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  function drawParts() {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p.active) continue;
      var a = clamp(p.life / p.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 0) {
        ctx.beginPath(); ctx.arc(0, 0, p.size * (0.5 + a * 0.5), 0, TAU); ctx.fill();
      } else if (p.shape === 1) {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else if (p.shape === 2) {
        ctx.globalAlpha = a * 0.5;
        ctx.beginPath(); ctx.arc(0, 0, p.size * (1.6 - a * 0.6), 0, TAU); ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
      }
      ctx.restore();
    }
  }
  function drawPops() {
    for (var i = 0; i < pops.length; i++) {
      var p = pops[i];
      var t = p.t / p.dur;
      var sc = p.big ? (t < 0.25 ? easeOutBack(t / 0.25) : 1) : 1;
      ctx.save();
      ctx.globalAlpha = 1 - t * t;
      ctx.translate(p.x, p.y);
      ctx.scale(sc, sc);
      ctx.font = '900 ' + (p.big ? 26 : 18) + 'px ' + FONT_DISPLAY;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(42,35,32,0.85)';
      ctx.strokeText(p.str, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.str, 0, 0);
      ctx.restore();
    }
  }

  function drawDragGhost() {
    var d = G.drag;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.translate(d.x, d.y);
    ctx.scale(1.1, 1.1);
    softShadow(-30, -30, 60, 60, 10);
    drawDishIcon(d.dish, -30, -30, 60, 60);
    ctx.restore();
    var h = hitTree(G.overlay || G.root, d.x, d.y);
    if (h && h.node.onDrop) {
      ctx.save();
      ctx.strokeStyle = '#E8A93D'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(h.node.ax + h.node.w / 2, h.node.ay + h.node.h / 2, 44, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }

  function drawTransition() {
    if (G.transT == null || G.transT >= 1) return;
    var a = Math.sin(Math.min(1, G.transT) * Math.PI);
    ctx.fillStyle = 'rgba(26,14,8,' + (a * 0.85).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }

  /* ================= shift lifecycle ================= */
  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function startShift(kind) {
    G.shiftKind = kind;
    G.dailyDate = todayStr();
    if (kind === 'daily') {
      G.shopTab = 'menu';
      setScene('shop');
    } else {
      G.wantHowto = !G.save.seenHowto;
      setScene('shop');
    }
  }
  function beginShift() {
    var seed;
    if (G.shiftKind === 'daily') seed = FTSIM.hashStr('ftm-' + G.dailyDate);
    else seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    var d = new Date();
    var sunday = d.getDay() === 0;
    ensureRegulars(function () {
      G.sim = FTSIM.createShift(seed, {
        menu: G.save.menu.slice(),
        upgrades: G.save.upgrades,
        buzz: G.save.buzz,
        regulars: G.save.regulars,
        sunday: sunday,
        special: G.save.menu[(Math.random() * G.save.menu.length) | 0]
      });
      G.selDish = null; G.drag = null; G.pending.length = 0;
      G.paused = false;
      try { if (window.FTA) FTA.musicStart(0.2); } catch (e) {}
      setScene('shift');
      if (G.wantHowto && G.shiftKind !== 'daily') {
        G.wantHowto = false;
        G.howto = true; G.howtoStep = 0;
        G.overlay = buildHowto();
        layoutTree(G.overlay, 0, 0);
      }
    });
  }
  function onShiftEnd(summary) {
    G.summary = summary;
    G.summaryT = 0; G.countedRevenue = 0;
    G.save.coins += summary.revenue;
    G.save.shifts++;
    G.save.buzz = summary.buzz;
    G.save.totalStars += summary.stars;
    G.save.spotIdx++;
    if (G.shiftKind === 'daily') {
      var ds = todayStr();
      if (!G.save.dailyBest[ds] || summary.score > G.save.dailyBest[ds]) {
        G.save.dailyBest[ds] = summary.score;
        postScore(summary.score);
      }
    }
    storeSave();
    try { if (window.FTA) FTA.musicStop(); } catch (e) {}
    sfx('jingle');
    setScene('summary');
  }

  /* ================= leaderboard (gamez-arcade) ================= */
  function postScore(score) {
    try {
      var ctrl = new AbortController();
      var to = setTimeout(function () { ctrl.abort(); }, 6000);
      fetch(FTC.ARCADE_URL + '/score', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: FTC.GAME_ID, name: arcadeName(), score: score, date: G.dailyDate })
      }).then(function () { clearTimeout(to); }).catch(function () { clearTimeout(to); });
    } catch (e) { /* silent offline degradation */ }
  }
  function fetchBoard(cb) {
    try {
      var ctrl = new AbortController();
      var to = setTimeout(function () { ctrl.abort(); }, 6000);
      fetch(FTC.ARCADE_URL + '/scores?game=' + FTC.GAME_ID + '&date=' + G.dailyDate, { signal: ctrl.signal })
        .then(function (r) { return r.json(); })
        .then(function (j) { clearTimeout(to); cb(j); })
        .catch(function () { clearTimeout(to); cb(null); });
    } catch (e) { cb(null); }
  }

  /* ================= regulars: AI with seeded local fallback ================= */
  var FALLBACK_NAMES = ['Marta', 'Dez', 'Priya', 'Gus', 'Lena', 'Marco', 'June', 'Otis', 'Rosa', 'Theo', 'Nia', 'Sal'];
  var FALLBACK_STORIES = [
    'orders between bus transfers, always in a hurry but never rude',
    'a line cook from the diner across the street, on break',
    'writes postcards at the curb while the elote cools',
    'tips in exact change and remembers your birthday',
    'a bike messenger who plans routes around your truck',
    'teaches night classes and grades papers in line',
    'claims your salsa cured their homesickness',
    'a retired bus driver with strong opinions about napkins',
    'runs the flower stand two blocks down',
    'skateboards over every lunch break, helmet still on',
    'a nurse on night shift, this is their breakfast',
    'saves you the corner spot with a traffic cone'
  ];
  var FALLBACK_FAVS = ['taco', 'burrito', 'quesadilla', 'elote', 'nachos'];
  function fallbackRegulars(seed) {
    var rng = FTSIM.mulberry32(seed);
    var out = [], used = {};
    for (var i = 0; i < 8; i++) {
      var ni = (rng() * FALLBACK_NAMES.length) | 0;
      if (used[ni]) continue;
      used[ni] = true;
      out.push({
        name: FALLBACK_NAMES[ni],
        story: FALLBACK_STORIES[(rng() * FALLBACK_STORIES.length) | 0],
        fav: FALLBACK_FAVS[(rng() * FALLBACK_FAVS.length) | 0],
        visits: 0, unlocked: false
      });
    }
    return out;
  }
  function ensureRegulars(cb) {
    var ds = todayStr();
    function merge(list) {
      var byName = {};
      G.save.regulars.forEach(function (r) { byName[r.name] = r; });
      G.save.regulars = list.map(function (r) {
        var old = byName[r.name];
        return { name: r.name, story: r.story, fav: r.fav, visits: old ? old.visits : 0, unlocked: old ? !!old.unlocked : false };
      });
      storeSave();
      cb();
    }
    if (G.regularsCache && G.regularsCache.date === ds) { merge(G.regularsCache.list); return; }
    var seed = FTSIM.hashStr('ftm-reg-' + ds);
    var done = false;
    function fin(list) { if (!done) { done = true; G.regularsCache = { date: ds, list: list }; merge(list); } }
    try {
      var ctrl = new AbortController();
      var to = setTimeout(function () { ctrl.abort(); }, 5000);
      fetch(FTC.AI_URL + '/g', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'truckregular', game: 'food-truck', ctx: { date: ds } })
      }).then(function (r) { return r.json(); })
        .then(function (j) {
          clearTimeout(to);
          if (j && j.regulars && j.regulars.length >= 4) {
            var list = j.regulars.slice(0, 10).map(function (r) {
              return { name: String(r.name || '').slice(0, 24), story: String(r.story || '').slice(0, 120), fav: FALLBACK_FAVS.indexOf(r.fav) >= 0 ? r.fav : 'taco', visits: 0, unlocked: false };
            });
            fin(list);
          } else fin(fallbackRegulars(seed));
        })
        .catch(function () { clearTimeout(to); fin(fallbackRegulars(seed)); });
    } catch (e) { fin(fallbackRegulars(seed)); }
    setTimeout(function () { fin(fallbackRegulars(seed)); }, 6000);
  }

  /* ================= boot ================= */
  function boot() {
    buildGrade();
    FEEL.init();
    try { if (window.FTART) FTART.init(); } catch (e) {}
    try {
      if (window.FTA) {
        FTA.init();
        if (G.save.muted && FTA.setMuted) FTA.setMuted(true);
      }
    } catch (e) {}
    try {
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { try { FTART.init(); } catch (e) {} });
    } catch (e) {}
    ensureRegulars(function () {});
    setScene('title');
    requestAnimationFrame(frame);
  }

  /* test hooks (also used by the smoke harness) */
  window.__ftm = {
    scene: function () { return G.scene; },
    sim: function () { return G.sim; },
    save: function () { return G.save; },
    startShift: startShift,
    beginShift: beginShift,
    setScene: setScene,
    FEEL: FEEL,
    ticketXY: function (id) {
      var t = SCN.tickets[id];
      if (t) return { x: t.ax + 48, y: t.ay + 54 };
      var d = SCN.duTickets[id];
      if (d) return { x: d.ax + 53, y: d.ay - 20 };
      return null;
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
