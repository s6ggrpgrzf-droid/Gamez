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

  /* ================= layout =================
   * Everything on one screen, no scrolling. 44px minimum targets. */
  var L = {
    topBar: { y: 0, h: 56 },
    rail: { y: 56, h: 210 },        // ticket rail (cork): 56-266
    driveup: { y: 266, h: 72 },     // 266-338
    grill: { y: 338, h: 160 },      // 338-498
    hold: { y: 498, h: 88 },        // 498-586
    action: { y: 586, h: 48 },      // 586-634
    dishes: { y: 634, h: 166 }      // 634-800
  };
  function railTicketRect(idx) { // 2 rows x 3 cols, sized to fill the board
    var w = 148, h = 82, gx = 8, gy = 90;
    var col = idx % 3, row = (idx / 3) | 0;
    return { x: gx + col * (w + 6), y: gy + row * (h + 6), w: w, h: h };
  }
  function duTicketRect(idx) {
    var w = 96, h = 56;
    return { x: 170 + idx * (w + 6), y: L.driveup.y + 8, w: w, h: h };
  }
  function grillRect(i) {
    var w = 106, h = 140, gx = 14;
    return { x: gx + i * (w + 8), y: L.grill.y + 12, w: w, h: h };
  }
  function holdRect(i, n) {
    var w = 96, h = 72, total = n * (w + 10) - 10;
    var gx = (W - total) / 2;
    return { x: gx + i * (w + 10), y: L.hold.y + 10, w: w, h: h };
  }
  function coolerRect(n) {
    var w = 72, h = 72, total = n * 106 - 10;
    return { x: (W - total) / 2 + total + 12, y: L.hold.y + 10, w: w, h: h };
  }
  function dishBtnRect(i, n) {
    var cols = 3, w = 148, h = 76;
    var gw = cols * (w + 8) - 8, gx = (W - gw) / 2;
    var col = i % cols, row = (i / cols) | 0;
    return { x: gx + col * (w + 8), y: L.dishes.y + 4 + row * (h + 6), w: w, h: h };
  }
  function batchRect() { return { x: 14, y: L.action.y + 4, w: 200, h: 40 }; }
  function trashRect() { return { x: W - 114, y: L.action.y + 4, w: 100, h: 40 }; }
  var ARCH_LABEL = { std: 'WALK-UP', biz: 'BUSINESS', senior: 'SENIOR', critic: 'CRITIC' };
  function pointIn(r, x, y) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

  /* ================= input =================
   * Pointer Events, logical actions only. Tap = select/cook/serve-ready,
   * drag = serve or buffer, hold (400ms) = trash, single tap on burnt = clear. */
  var HOLD_MS = 400;
  var ptr = { down: false, id: -1, sx: 0, sy: 0, x: 0, y: 0, t: 0, holdFired: false, moved: false };

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
    ptr.t = 0; ptr.holdFired = false; ptr.moved = false;
    G.mouse.down = true; G.mouse.x = p.x; G.mouse.y = p.y;
    onPress(p.x, p.y);
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
    var p = canvasPos(e);
    ptr.down = false; G.mouse.down = false;
    if (G.drag) { onDrop(p.x, p.y); G.drag = null; }
    else if (!ptr.holdFired && !ptr.moved) onTap(p.x, p.y);
    ptr.holdFired = false;
  }
  canvas.addEventListener('pointerup', ptrUp);
  canvas.addEventListener('pointercancel', function () { ptr.down = false; G.drag = null; G.mouse.down = false; });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { ptr.down = false; G.drag = null; G.mouse.down = false; pauseShift(); }
  });
  window.addEventListener('blur', function () { ptr.down = false; G.drag = null; G.mouse.down = false; });

  function foodAt(x, y) {
    // returns {kind:'grill'|'holding'|'cooler', i, dish} or null
    var s = G.sim; if (!s) return null;
    var i, r;
    for (i = 0; i < s.grill.length; i++) { r = grillRect(i); if (pointIn(r, x, y) && s.grill[i].dish) return { kind: 'grill', i: i, dish: s.grill[i].dish }; }
    for (i = 0; i < s.holding.length; i++) { r = holdRect(i, s.holding.length); if (pointIn(r, x, y) && s.holding[i].dish) return { kind: 'holding', i: i, dish: s.holding[i].dish }; }
    r = coolerRect(s.holding.length);
    if (pointIn(r, x, y)) return { kind: 'cooler', i: 0, dish: 'agua' };
    return null;
  }
  function custAt(x, y) {
    var s = G.sim; if (!s) return null;
    var i, r;
    var sorted = sortedCustomers();
    for (i = 0; i < sorted.length; i++) { r = railTicketRect(i); if (pointIn(r, x, y)) return sorted[i]; }
    for (i = 0; i < s.driveup.length; i++) { r = duTicketRect(i); if (pointIn(r, x, y)) return s.driveup[i]; }
    return null;
  }
  function sortedCustomers() {
    // Diner Dash queue discipline: most urgent first
    return G.sim.customers.slice().sort(function (a, b) {
      return (a.patience / a.maxPatience) - (b.patience / b.maxPatience);
    });
  }

  function onPress(x, y) {
    if (G.scene !== 'shift' || !G.sim || G.sim.phase !== 'shift') return;
    var f = foodAt(x, y);
    ptr.holdTarget = f;
    ptr.holdT = 0;
  }
  function tryStartDrag(sx, sy) {
    var f = foodAt(sx, sy);
    if (f) {
      G.drag = { src: { kind: f.kind, i: f.i }, x: sx, y: sy, dish: f.dish };
      sfx('select'); buzzH(FTC.HAPTIC.select);
    }
  }
  function onDrop(x, y) {
    var d = G.drag; if (!d) return;
    var s = G.sim;
    // drop on customer -> serve
    var cust = custAt(x, y);
    if (cust) { G.pending.push({ t: 'serve', cust: cust.id, src: d.src }); optimisticServe(cust, d); return; }
    // drop on holding -> buffer
    var i, r;
    for (i = 0; i < s.holding.length; i++) {
      r = holdRect(i, s.holding.length);
      if (pointIn(r, x, y) && d.src.kind === 'grill') { G.pending.push({ t: 'hold', slot: d.src.i, h: i }); sfx('select'); return; }
    }
    // drop on trash zone -> trash
    if (pointIn(trashRect(), x, y)) { G.pending.push({ t: 'trash', kind: d.src.kind === 'cooler' ? 'holding' : d.src.kind, i: d.src.i }); sfx('trash'); return; }
    sfx('tap', { vol: 0.4 });
  }
  function optimisticServe(cust, d) {
    // optimistic visual: ticket squash + pop on the input frame, sim confirms same tick
    var idx = sortedCustomers().indexOf(cust);
    var r = idx >= 0 ? railTicketRect(idx) : duTicketRect(G.sim.driveup.indexOf(cust));
    tween('serve' + cust.id, 0.22, function (e) { cust.sq = 1 + 0.25 * (1 - e); });
    burst(r.x + r.w / 2, r.y + 20, 6, '#E8A93D', 90, 0.5, 4, 200, 1);
  }
  function onTap(x, y) {
    if (G.howto) { advanceHowto(x, y); return; }
    if (G.scene === 'title') return tapTitle(x, y);
    if (G.scene === 'summary') return tapSummary(x, y);
    if (G.scene === 'shop') return tapShop(x, y);
    if (G.scene !== 'shift' || !G.sim) return;
    var s = G.sim, i, r;
    if (s.phase !== 'shift') return;
    // dish buttons
    for (i = 0; i < s.menu.length; i++) {
      r = dishBtnRect(i, s.menu.length);
      if (pointIn(r, x, y)) {
        G.selDish = (G.selDish === s.menu[i]) ? null : s.menu[i];
        sfx('ui'); buzzH(FTC.HAPTIC.select);
        return;
      }
    }
    // grill slots: tap with dish selected -> cook; tap burnt -> clear
    for (i = 0; i < s.grill.length; i++) {
      r = grillRect(i);
      if (pointIn(r, x, y)) {
        var g = s.grill[i], st = FTSIM.grillState(s, g);
        if (st === 'burnt') { G.pending.push({ t: 'trash', kind: 'grill', i: i }); sfx('trash'); buzzH(FTC.HAPTIC.light); return; }
        if (!g.dish && G.selDish && FTC.DISHES[G.selDish].grill) {
          G.pending.push({ t: 'cook', dish: G.selDish, slot: i });
          sfx('sizzle'); buzzH(FTC.HAPTIC.light);
          burst(r.x + r.w / 2, r.y + r.h / 2, 5, '#cfd4d6', 60, 0.6, 5, -40, 2);
          return;
        }
        if (!g.dish && !G.selDish) { sfx('tap', { vol: 0.5 }); return; }
        return;
      }
    }
    // cooler: tap with... agua serves via drag or tap on customer? tap cooler selects agua-serve mode
    r = coolerRect(s.holding.length);
    if (pointIn(r, x, y)) {
      G.selDish = (G.selDish === 'agua') ? null : 'agua';
      sfx('ui'); return;
    }
    // THE USUAL one-tap prep button on tickets
    var sorted = sortedCustomers();
    for (i = 0; i < sorted.length; i++) {
      var cu = sorted[i];
      if (!cu.usual || cu.state !== 'waiting') continue;
      r = railTicketRect(i);
      var br = { x: r.x + 7, y: r.y + r.h - 25, w: r.w - 14, h: 20 };
      if (pointIn(br, x, y)) {
        G.pending.push({ t: 'usual', cust: cu.id });
        sfx('pop'); buzzH(FTC.HAPTIC.serve);
        return;
      }
    }
    // tap a ticket with agua selected -> instant serve
    if (G.selDish === 'agua') {
      var cust = custAt(x, y);
      if (cust) { G.pending.push({ t: 'serve', cust: cust.id, src: { kind: 'cooler', i: 0 } }); optimisticServe(cust, { dish: 'agua' }); return; }
    }
    // batch serve button
    if (pointIn(batchRect(), x, y)) { batchServe(); return; }
    // trash zone tap: nothing (drag or hold only)
  }
  function batchServe() {
    // CSD3's payoff: one tap serves everything currently servable, in sequence
    var s = G.sim; if (!s) return;
    var served = 0;
    var chans = [
      { list: sortedCustomers(), seqKey: 'seq' },
      { list: s.driveup.slice().sort(function (a, b) { return a.seq - b.seq; }), seqKey: 'seq' }
    ];
    // gather servable (dish, src) pairs
    var avail = [];
    var i, g;
    for (i = 0; i < s.grill.length; i++) {
      g = s.grill[i];
      if (!g.dish) continue;
      var st = FTSIM.grillState(s, g);
      if (st === 'perfect' || st === 'burning') avail.push({ dish: g.dish, src: { kind: 'grill', i: i } });
    }
    for (i = 0; i < s.holding.length; i++) {
      var h = s.holding[i];
      if (h.dish && h.fresh > FTC.HOLD_OK) avail.push({ dish: h.dish, src: { kind: 'holding', i: i } });
    }
    avail.push({ dish: 'agua', src: { kind: 'cooler', i: 0 } }); // infinite cooler
    chans.forEach(function (ch) {
      ch.list.forEach(function (cust) {
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
    if (served > 0) { sfx('cha', { pitch: 1 + Math.min(s.combo, 10) * 0.03 }); buzzH(FTC.HAPTIC.serve); }
    else { sfx('tap', { vol: 0.4 }); }
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
      var s = G.sim;
      var still = foodAt(ptr.sx, ptr.sy);
      if (still && still.kind === f.kind && still.i === f.i && still.dish === f.dish) {
        var kind = f.kind === 'cooler' ? null : f.kind;
        if (kind) {
          G.pending.push({ t: 'trash', kind: kind, i: f.i });
          sfx('trash'); buzzH(FTC.HAPTIC.warn);
          var r = f.kind === 'grill' ? grillRect(f.i) : holdRect(f.i, s.holding.length);
          burst(r.x + r.w / 2, r.y + r.h / 2, 8, '#8A8F7A', 110, 0.5, 5, 300, 1);
        }
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
          var cu = findCust(e.id);
          sfx('doorbell', { vol: 0.7 }); buzzH(FTC.HAPTIC.light);
          if (cu) {
            var r = ticketXY(cu);
            textPop(r.x, r.y - 6, cu.usual ? 'THE USUAL' : 'NEW TICKET', '#E8A93D', false);
            burst(r.x, r.y, 6, '#F5E9D0', 70, 0.5, 4, 150, 1);
            tween('tick' + cu.id, 0.3, function (t) { if (cu) cu.pop = easeOutBack(t); });
          }
          break;
        }
        case 'duArrive':
          sfx('bell'); buzzH(FTC.HAPTIC.light);
          break;
        case 'cookStart': break; // optimistic sizzle already played
        case 'done': {
          var gr = grillRect(e.slot);
          sfx('ding'); buzzH(FTC.HAPTIC.light);
          tween('grill' + e.slot, 0.25, function (t) { G['grillPop' + e.slot] = easeOutBack(t); });
          burst(gr.x + gr.w / 2, gr.y + 30, 8, '#E8A93D', 90, 0.6, 4, -60, 2);
          break;
        }
        case 'burnWarn': {
          var wr = grillRect(e.slot);
          sfx('warn', { pitch: 1.15 }); buzzH(FTC.HAPTIC.warn);
          textPop(wr.x + wr.w / 2, wr.y - 4, 'BURNING!', '#E04B34', true);
          FEEL.addTrauma(0.18);
          break;
        }
        case 'burnt': {
          var br = grillRect(e.slot);
          sfx('error'); buzzH(FTC.HAPTIC.error);
          FEEL.addTrauma(0.42);
          burst(br.x + br.w / 2, br.y + 40, 14, '#3a3a3a', 120, 0.9, 7, -50, 2);
          textPop(br.x + br.w / 2, br.y - 4, 'BURNT', '#E04B34', true);
          break;
        }
        case 'spoiled': {
          var hr = holdRect(e.h, s.holding.length);
          sfx('error', { vol: 0.6 }); buzzH(FTC.HAPTIC.warn);
          textPop(hr.x + hr.w / 2, hr.y - 4, 'SPOILED', '#8A8F7A', false);
          break;
        }
        case 'staleWarn':
          sfx('warn', { pitch: 0.9, vol: 0.5 });
          break;
        case 'scraped': {
          var sr = grillRect(e.slot);
          sfx('trash', { vol: 0.6 });
          burst(sr.x + sr.w / 2, sr.y + sr.h / 2, 6, '#8A8F7A', 80, 0.5, 5, 200, 1);
          break;
        }
        case 'held': sfx('select'); break;
        case 'trashed': break; // played at input time
        case 'served': onServed(e); break;
        case 'servedPart': onServed(e); break;
        case 'wrongDish':
          sfx('error', { vol: 0.7 }); buzzH(FTC.HAPTIC.error);
          break;
        case 'walkout': case 'duWalkout': {
          var wc = findCust(e.id); // already removed; use last known pos
          sfx('error'); buzzH(FTC.HAPTIC.error);
          FEEL.addTrauma(0.5);
          FEEL.doFlash('224,75,52');
          break;
        }
        case 'comboLost': break;
        case 'usual':
          sfx('milestone'); buzzH(FTC.HAPTIC.perfect);
          textPop(W / 2, 200, e.name.toUpperCase() + ' IS A REGULAR NOW', '#E8A93D', true);
          burst(W / 2, 200, 22, '#E8A93D', 150, 0.9, 5, 120, 3);
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
  }
  function findCust(id) {
    var s = G.sim, i;
    for (i = 0; i < s.customers.length; i++) if (s.customers[i].id === id) return s.customers[i];
    for (i = 0; i < s.driveup.length; i++) if (s.driveup[i].id === id) return s.driveup[i];
    return null;
  }
  function ticketXY(cust) {
    var s = G.sim;
    if (cust.channel === 'du') { var r = duTicketRect(Math.max(0, s.driveup.indexOf(cust))); return { x: r.x + r.w / 2, y: r.y }; }
    var r2 = railTicketRect(Math.max(0, sortedCustomers().indexOf(cust)));
    return { x: r2.x + r2.w / 2, y: r2.y };
  }
  function onServed(e) {
    var s = G.sim;
    var combo = e.combo || 0;
    sfx('cha', { pitch: 1 + Math.min(combo, 12) * 0.035 });
    buzzH(e.rating === 'perfect' ? FTC.HAPTIC.perfect : FTC.HAPTIC.serve);
    var cu = null; // may be removed already; approximate with event pos
    if (e.rating === 'perfect') {
      FEEL.hitstopFor(combo >= 5 ? FTC.HITSTOP_MILESTONE : FTC.HITSTOP_PERFECT);
      var r = { x: W / 2, y: 300 };
      burst(r.x, r.y, 10, '#E8A93D', 130, 0.7, 5, 160, 3);
      burst(r.x, r.y, 6, '#F5E9D0', 90, 0.5, 4, 100, 1);
      textPop(r.x, r.y - 30, 'PERFECT +' + Math.round(e.tip * 100) / 100, '#E8A93D', true);
    } else {
      textPop(W / 2, 300, '+$' + (Math.round(e.tip * 100) / 100), '#F5E9D0', false);
    }
    if (e.milestone) {
      sfx('milestone', { pitch: 1 + e.milestone * 0.02 });
      FEEL.doFlash('232,169,61');
      FEEL.hitstopFor(FTC.HITSTOP_MILESTONE);
      textPop(W / 2, 240, e.milestone + ' STREAK!', '#E8A93D', true);
      burst(W / 2, 240, 26, '#E8A93D', 170, 1.0, 6, 140, 3);
      if (s.combo >= 8) sfx('cheer');
    }
    if (e.special) {
      textPop(W / 2, 200, 'SPECIAL!', '#E04B34', true);
      burst(W / 2, 200, 12, '#E04B34', 120, 0.7, 5, 120, 3);
    }
  }

  /* ================= update ================= */
  var lastT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var rdt = Math.min(0.1, (now - lastT) / 1000 || 0.016);
    lastT = now;
    G.time += rdt;
    FEEL.update(rdt);
    updateParts(rdt);
    updateTweens(rdt);
    updateHold(rdt);

    var simDt = (FEEL.hitstop > 0) ? 0 : rdt;
    if (G.scene === 'shift' && G.sim && G.sim.phase === 'shift' && !G.paused) {
      FTSIM.update(G.sim, simDt, G.pending);
      var evts = FTSIM.drain(G.sim);
      if (evts.length) handleEvents(evts);
      // music follows the rush
      var rush = clamp((G.sim.customers.length + G.sim.driveup.length) / 7, 0, 1);
      var burning = 0;
      for (var i = 0; i < G.sim.grill.length; i++) {
        var st = FTSIM.grillState(G.sim, G.sim.grill[i]);
        if (st === 'burning' || st === 'burnt') burning = 1;
      }
      musicForRush(clamp(rush * 0.7 + burning * 0.3 + 0.15, 0, 1));
    }
    G.pending.length = 0;

    render();
  }

  function pauseShift() {
    if (G.scene === 'shift' && G.sim && G.sim.phase === 'shift') G.paused = true;
  }

  /* ================= render ================= */
  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (FEEL.enabled && !FEEL.reduced) ctx.translate(FEEL.shakeX, FEEL.shakeY);

    if (G.scene === 'title') renderTitle();
    else if (G.scene === 'shop') renderShop();
    else if (G.scene === 'summary') renderSummary();
    else renderShift();

    if (G.howto) renderHowto();

    ctx.restore();
    // grade overlays (unshaken)
    if (vignette) ctx.drawImage(vignette, 0, 0, W, H);
    if (grain) { ctx.save(); ctx.globalAlpha = 0.05; ctx.drawImage(grain, 0, 0, W, H); ctx.restore(); }
    if (FEEL.flash > 0) {
      ctx.fillStyle = 'rgba(' + FEEL.flashColor + ',' + (FEEL.flash / FTC.FLASH_LEN * 0.28).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    // particles + pops above everything
    drawParts();
    drawPops();
    // drag ghost
    if (G.drag) drawDragGhost();
    // scene transition veil
    drawTransition();
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
      if (p.shape === 0) { // circle puff
        ctx.beginPath(); ctx.arc(0, 0, p.size * (0.5 + a * 0.5), 0, TAU); ctx.fill();
      } else if (p.shape === 1) { // spark rect
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else if (p.shape === 2) { // steam: growing soft circle
        ctx.globalAlpha = a * 0.5;
        ctx.beginPath(); ctx.arc(0, 0, p.size * (1.6 - a * 0.6), 0, TAU); ctx.fill();
      } else { // confetti
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
    var sc = 1.1;
    ctx.scale(sc, sc);
    softShadow(-30, -30, 60, 60, 10);
    drawDishIcon(d.dish, -30, -30, 60, 60);
    ctx.restore();
    // highlight drop targets
    var cust = custAt(d.x, d.y);
    if (cust) {
      var r = ticketXY(cust);
      ctx.save();
      ctx.strokeStyle = '#E8A93D'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(r.x, r.y + 40, 44, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }

  /* ---- shared bits ---- */
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
  function bgWash() {
    // warm dark backdrop, chalkboard walls
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#241a12');
    g.addColorStop(0.5, '#2E2115');
    g.addColorStop(1, '#1d140d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  function corkBoard(x, y, w, h) {
    var tex = null;
    try { tex = FTART.tex('cork'); } catch (e) {}
    softShadow(x, y, w, h, 10);
    if (tex) {
      ctx.save();
      roundRect(x, y, w, h, 10); ctx.clip();
      ctx.fillStyle = '#A9743F'; ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 0.55;
      for (var ix = x; ix < x + w; ix += 128) for (var iy = y; iy < y + h; iy += 128) ctx.drawImage(tex, ix, iy, 128, 128);
      ctx.restore();
    } else { ctx.fillStyle = '#A9743F'; roundRect(x, y, w, h, 10); ctx.fill(); }
    // frame
    ctx.save();
    ctx.strokeStyle = '#5e3d1c'; ctx.lineWidth = 6;
    roundRect(x + 3, y + 3, w - 6, h - 6, 8); ctx.stroke();
    ctx.restore();
  }
  function chalkStrip(x, y, w, h, label) {
    ctx.fillStyle = '#2E2C26';
    roundRect(x, y, w, h, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(245,233,208,0.25)'; ctx.lineWidth = 1.5;
    roundRect(x + 4, y + 4, w - 8, h - 8, 4); ctx.stroke();
    if (label) kicker(label, x + 12, y + h / 2 + 5, 13, '#E8A93D');
  }

  /* ================= shift render ================= */
  function renderShift() {
    var s = G.sim;
    bgWash();
    if (!s) return;
    renderTopBar(s);
    renderRail(s);
    renderDriveup(s);
    renderGrill(s);
    renderHolding(s);
    renderActionBar(s);
    renderDishButtons(s);
  }

  function renderTopBar(s) {
    chalkStrip(0, 0, W, L.topBar.h, null);
    var tleft = Math.max(0, s.dur - s.t);
    var mm = (tleft / 60) | 0, ss = ('0' + ((tleft | 0) % 60)).slice(-2);
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.font = '900 30px ' + FONT_DISPLAY;
    ctx.fillStyle = tleft < 20 ? '#E04B34' : '#F5E9D0';
    ctx.textAlign = 'left';
    ctx.fillText(mm + ':' + ss, 14, L.topBar.h / 2 + 1);
    // coins
    ctx.font = '700 20px ' + FONT_UI;
    ctx.fillStyle = '#E8A93D'; ctx.textAlign = 'center';
    ctx.fillText('$' + s.coins.toFixed(2), W / 2 - 40, L.topBar.h / 2 + 1);
    // combo
    if (s.combo >= 2) {
      var pop = 1 + 0.12 * Math.sin(FEEL.time * 6);
      ctx.save();
      ctx.translate(W / 2 + 62, L.topBar.h / 2);
      ctx.scale(pop, pop);
      ctx.font = '900 20px ' + FONT_DISPLAY;
      ctx.fillStyle = '#E8A93D'; ctx.textAlign = 'center';
      ctx.fillText('x' + s.combo, 0, 7);
      ctx.restore();
    }
    // buzz meter
    var bx = W - 150, bw = 84;
    ctx.fillStyle = 'rgba(245,233,208,0.18)';
    roundRect(bx, 20, bw, 10, 5); ctx.fill();
    ctx.fillStyle = '#C0392B';
    roundRect(bx, 20, bw * clamp(s.buzz / FTC.BUZZ_MAX, 0, 1), 10, 5); ctx.fill();
    ctx.font = '700 11px ' + FONT_UI;
    ctx.fillStyle = '#E8A93D'; ctx.textAlign = 'left';
    ctx.fillText('BUZZ ' + Math.round(s.buzz) + '%', bx, 46);
    // pause + mute buttons
    iconBtn(W - 52, 7, 44, 44, G.paused ? '▶' : '❚❚', 'pause');
    ctx.restore();
  }
  function iconBtn(x, y, w, h, glyph, id) {
    softShadow(x, y, w, h, 10);
    ctx.fillStyle = G['btnHot' + id] ? '#E8A93D' : '#3a3128';
    roundRect(x, y, w, h, 10); ctx.fill();
    ctx.fillStyle = G['btnHot' + id] ? '#2A2320' : '#F5E9D0';
    ctx.font = '700 18px ' + FONT_UI;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(glyph, x + w / 2, y + h / 2 + 1);
  }

  function renderRail(s) {
    var bx = 8, by = L.rail.y + 6, bw = W - 16, bh = L.rail.h - 12;
    corkBoard(bx, by, bw, bh);
    kicker('Ticket rail', bx + 14, by + 22, 13, '#2A2320');
    var sorted = sortedCustomers();
    if (!sorted.length) {
      ctx.save();
      ctx.font = 'italic 700 17px ' + FONT_DISPLAY;
      ctx.fillStyle = 'rgba(42,35,32,0.55)';
      ctx.textAlign = 'center';
      ctx.fillText('tickets pin up here — keep the grill hot', bx + bw / 2, by + bh / 2 + 20);
      ctx.restore();
      return;
    }
    for (var i = 0; i < sorted.length && i < 6; i++) drawTicket(sorted[i], railTicketRect(i), false, s);
    // pinned daily-special card fills the rail's empty stretch (and it's a real mechanic)
    if (sorted.length >= 1 && sorted.length < 3 && s.special) {
      var cx = 8 + sorted.length * 154, cw = W - 16 - cx;
      if (cw > 120) drawSpecialCard(cx, 90, cw, 82, s.special);
    }
  }
  function drawSpecialCard(x, y, w, h, dishId) {
    var d = FTC.DISHES[dishId];
    ctx.save();
    ctx.translate(x, y);
    softShadow(0, 2, w, h, 4);
    var slip = null;
    try { slip = FTART.ticket(w | 0, h | 0); } catch (e) {}
    if (slip) ctx.drawImage(slip, 0, 0, w, h);
    else { ctx.fillStyle = '#F5E9D0'; roundRect(0, 0, w, h, 4); ctx.fill(); }
    ctx.fillStyle = '#C0392B';
    ctx.beginPath(); ctx.arc(w - 22, 8, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(w - 23.5, 6.5, 1.8, 0, TAU); ctx.fill();
    ctx.save();
    ctx.rotate(-0.03);
    kicker("Today's special", 12, 26, 11, '#C0392B');
    ctx.restore();
    drawDishIcon(dishId, 12, 30, 40, 40);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = '900 16px ' + FONT_DISPLAY; ctx.fillStyle = '#2A2320';
    ctx.fillText(d.name, 60, 52);
    ctx.font = '700 12px ' + FONT_UI; ctx.fillStyle = '#C0392B';
    ctx.fillText('+50% TIPS', 60, 70);
    ctx.restore();
  }
  function drawTicket(cust, r, mini, s) {
    var sq = cust.sq || 1; cust.sq = sq; // decayed in updateTweens via tween
    var frac = cust.maxPatience > 0 ? cust.patience / cust.maxPatience : 1;
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    ctx.scale(sq, sq);
    ctx.translate(-r.w / 2, -r.h / 2);
    softShadow(0, 2, r.w, r.h, 4);
    var slip = null;
    try { slip = FTART.ticket(r.w | 0, r.h | 0); } catch (e) {}
    if (slip) ctx.drawImage(slip, 0, 0, r.w, r.h);
    else { ctx.fillStyle = '#F5E9D0'; roundRect(0, 0, r.w, r.h, 4); ctx.fill(); }
    // pin
    ctx.fillStyle = '#C0392B';
    ctx.beginPath(); ctx.arc(r.w / 2, 8, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(r.w / 2 - 1.5, 6.5, 1.8, 0, TAU); ctx.fill();
    if (!mini) {
      // portrait + patience ring
      var px = 26, py = 40;
      var face = null;
      try { face = FTART.customer(cust.arch); } catch (e) {}
      if (face) ctx.drawImage(face, px - 19, py - 21, 38, 42);
      drawPatienceRing(px, py, 24, frac);
      // name
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.font = '700 11px ' + FONT_UI;
      try { ctx.letterSpacing = '1px'; } catch (e2) {}
      ctx.fillStyle = cust.usual ? '#C0392B' : '#2A2320';
      var nm = cust.usual ? 'THE USUAL' : (cust.name || ARCH_LABEL[cust.arch] || cust.arch.toUpperCase());
      ctx.fillText(nm.slice(0, 13), 54, 24);
      try { ctx.letterSpacing = '0px'; } catch (e3) {}
      if (cust.name && !cust.usual) {
        ctx.font = 'italic 10px ' + FONT_DISPLAY; ctx.fillStyle = 'rgba(42,35,32,0.7)';
        ctx.fillText(cust.name.slice(0, 15), 54, 37);
      }
      // dishes with checkmarks
      for (var d = 0; d < cust.dishes.length; d++) {
        var dx = 54 + d * 36, dy = 44;
        drawDishIcon(cust.dishes[d], dx, dy, 30, 30);
        if (cust.got.indexOf(d) >= 0) {
          ctx.strokeStyle = '#7FB069'; ctx.lineWidth = 4; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(dx + 5, dy + 16); ctx.lineTo(dx + 12, dy + 24); ctx.lineTo(dx + 26, dy + 7); ctx.stroke();
        }
      }
      // THE USUAL one-tap prep button
      if (cust.usual && cust.state === 'waiting') {
        var bw2 = r.w - 14, bh2 = 20, bx2 = 7, by2 = r.h - 25;
        var hov = G.mouse.down && pointIn({ x: r.x + bx2, y: r.y + by2, w: bw2, h: bh2 }, G.mouse.x, G.mouse.y);
        ctx.fillStyle = hov ? '#E8A93D' : '#C0392B';
        roundRect(bx2, by2, bw2, bh2, 6); ctx.fill();
        ctx.fillStyle = '#F5E9D0'; ctx.font = '700 10px ' + FONT_UI; ctx.textAlign = 'center';
        ctx.fillText('FIRE THE USUAL', r.w / 2, by2 + 14);
      }
    } else {
      // drive-up mini: dish icons + thin patience bar
      for (var m = 0; m < cust.dishes.length; m++) {
        drawDishIcon(cust.dishes[m], 6 + m * 30, 6, 26, 26);
        if (cust.got.indexOf(m) >= 0) {
          ctx.strokeStyle = '#7FB069'; ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(10 + m * 30, 22); ctx.lineTo(15 + m * 30, 27); ctx.lineTo(26 + m * 30, 13); ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(42,35,32,0.25)';
      roundRect(6, r.h - 11, r.w - 12, 6, 3); ctx.fill();
      ctx.fillStyle = patienceColor(frac);
      roundRect(6, r.h - 11, (r.w - 12) * clamp(frac, 0, 1), 6, 3); ctx.fill();
    }
    ctx.restore();
    cust.sq = Math.max(1, (cust.sq || 1) - 0.06);
  }

  function renderDriveup(s) {
    var y = L.driveup.y;
    chalkStrip(8, y, W - 16, L.driveup.h, null);
    var bell = null;
    try { bell = FTART.bell(); } catch (e) {}
    if (bell) ctx.drawImage(bell, 18, y + 14, 40, 40);
    kicker('Drive-up', 66, y + 28, 13, '#E8A93D');
    ctx.save();
    ctx.font = 'italic 11px ' + FONT_DISPLAY; ctx.fillStyle = 'rgba(245,233,208,0.55)';
    ctx.fillText('the second line', 66, y + 48);
    ctx.restore();
    for (var i = 0; i < s.driveup.length; i++) drawTicket(s.driveup[i], duTicketRect(i), true, s);
    if (!s.driveup.length) {
      ctx.save();
      ctx.font = 'italic 13px ' + FONT_DISPLAY; ctx.fillStyle = 'rgba(245,233,208,0.4)';
      ctx.textAlign = 'center';
      ctx.fillText('— lane quiet —', 320, y + 42);
      ctx.restore();
    }
  }

  function renderGrill(s) {
    kicker('The grill', 16, L.grill.y + 8, 14, '#E8A93D');
    for (var i = 0; i < s.grill.length; i++) {
      var r = grillRect(i), g = s.grill[i], st = FTSIM.grillState(s, g);
      var pop = G['grillPop' + i] || 1; G['grillPop' + i] = Math.max(1, pop - 0.08);
      ctx.save();
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      ctx.scale(pop, pop);
      ctx.translate(-r.w / 2, -r.h / 2);
      softShadow(0, 2, r.w, r.h, 12);
      var tile = null;
      try { tile = FTART.grill(); } catch (e) {}
      if (tile) ctx.drawImage(tile, 0, 0, r.w, r.h);
      else { ctx.fillStyle = '#3a3128'; roundRect(0, 0, r.w, r.h, 12); ctx.fill(); }
      if (g.dish) {
        var d = FTC.DISHES[g.dish];
        drawDishIcon(g.dish, 23, 18, 60, 60);
        // progress ring
        var frac = clamp(g.t / d.cook, 0, 1);
        ctx.save();
        ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(245,233,208,0.25)';
        ctx.beginPath(); ctx.arc(r.w / 2, 48, 42, 0, TAU); ctx.stroke();
        ctx.strokeStyle = st === 'burnt' ? '#3a3a3a' : '#F5E9D0';
        ctx.beginPath(); ctx.arc(r.w / 2, 48, 42, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.stroke();
        ctx.restore();
        if (st === 'perfect') {
          var pulse = 0.5 + 0.5 * Math.sin(FEEL.time * 6);
          ctx.save();
          ctx.strokeStyle = 'rgba(232,169,61,' + (0.55 + pulse * 0.4).toFixed(2) + ')';
          ctx.lineWidth = 3;
          roundRect(4, 4, r.w - 8, r.h - 8, 10); ctx.stroke();
          ctx.restore();
          ctx.save();
          ctx.font = '900 13px ' + FONT_DISPLAY; ctx.textAlign = 'center';
          ctx.fillStyle = '#E8A93D';
          ctx.fillText('PERFECT', r.w / 2, r.h - 34);
          ctx.restore();
        } else if (st === 'burning') {
          if (Math.sin(FEEL.time * 10) > 0) {
            ctx.save();
            ctx.strokeStyle = 'rgba(224,75,52,0.95)'; ctx.lineWidth = 4;
            roundRect(4, 4, r.w - 8, r.h - 8, 10); ctx.stroke();
            ctx.restore();
          }
          if (Math.random() < 0.35) spawnP(r.x + r.w / 2 + (Math.random() - 0.5) * 40, r.y + 30, (Math.random() - 0.5) * 20, -50 - Math.random() * 30, 0.9, 8, '#4a4a4a', -30, 2);
          ctx.save();
          ctx.font = '900 13px ' + FONT_DISPLAY; ctx.textAlign = 'center';
          ctx.fillStyle = '#E04B34';
          ctx.fillText('GRAB IT!', r.w / 2, r.h - 34);
          ctx.restore();
        } else if (st === 'burnt') {
          ctx.save();
          ctx.fillStyle = 'rgba(20,10,5,0.55)';
          roundRect(4, 4, r.w - 8, r.h - 8, 10); ctx.fill();
          ctx.strokeStyle = '#E04B34'; ctx.lineWidth = 5; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(r.w / 2 - 14, 34); ctx.lineTo(r.w / 2 + 14, 62);
          ctx.moveTo(r.w / 2 + 14, 34); ctx.lineTo(r.w / 2 - 14, 62);
          ctx.stroke();
          ctx.font = '700 12px ' + FONT_UI; ctx.textAlign = 'center'; ctx.fillStyle = '#F5E9D0';
          ctx.fillText('TAP TO CLEAR', r.w / 2, r.h - 34);
          ctx.restore();
        } else {
          // cooking: occasional sizzle puff
          if (Math.random() < 0.12) spawnP(r.x + r.w / 2 + (Math.random() - 0.5) * 50, r.y + 60, (Math.random() - 0.5) * 15, -35, 0.7, 6, '#cfd4d6', -20, 2);
        }
      } else {
        // empty: dashed hint
        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = G.selDish ? 'rgba(232,169,61,0.8)' : 'rgba(245,233,208,0.22)';
        ctx.lineWidth = 2;
        roundRect(10, 10, r.w - 20, r.h - 20, 10); ctx.stroke();
        ctx.setLineDash([]);
        if (G.selDish && FTC.DISHES[G.selDish].grill) {
          ctx.font = '700 11px ' + FONT_UI; ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(232,169,61,0.9)';
          ctx.fillText('TAP TO COOK', r.w / 2, r.h / 2 + 4);
        }
        ctx.restore();
      }
      ctx.restore();
    }
  }

  function renderHolding(s) {
    kicker('Warmer', 16, L.hold.y + 2, 13, '#E8A93D');
    var n = s.holding.length;
    for (var i = 0; i < n; i++) {
      var r = holdRect(i, n), h = s.holding[i];
      softShadow(r.x, r.y, r.w, r.h, 10);
      var tile = null;
      try { tile = FTART.warmer(); } catch (e) {}
      if (tile) ctx.drawImage(tile, r.x, r.y, r.w, r.h);
      else { ctx.fillStyle = '#4a3f30'; roundRect(r.x, r.y, r.w, r.h, 10); ctx.fill(); }
      if (h.dish) {
        drawDishIcon(h.dish, r.x + 24, r.y + 8, 48, 48);
        // freshness: 6 sectors, last one flashes
        var cx = r.x + r.w / 2, cy = r.y + r.h - 12;
        for (var sg = 0; sg < 6; sg++) {
          var on = h.fresh > sg / 6;
          var last = (sg === 5);
          var blink = last && h.fresh <= 0.22 && Math.sin(FEEL.time * 10) > 0;
          ctx.fillStyle = !on ? 'rgba(42,35,32,0.4)' : (blink ? '#E04B34' : '#7FB069');
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, 9, -Math.PI / 2 + sg * TAU / 6, -Math.PI / 2 + (sg + 1) * TAU / 6 - 0.08);
          ctx.closePath(); ctx.fill();
        }
      }
    }
    // cooler: instant agua
    var cr = coolerRect(n);
    softShadow(cr.x, cr.y, cr.w, cr.h, 10);
    ctx.fillStyle = G.selDish === 'agua' ? '#E8A93D' : '#2E4a5a';
    roundRect(cr.x, cr.y, cr.w, cr.h, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(245,233,208,0.4)'; ctx.lineWidth = 2;
    roundRect(cr.x + 4, cr.y + 4, cr.w - 8, cr.h - 8, 8); ctx.stroke();
    drawDishIcon('agua', cr.x + 14, cr.y + 8, 48, 48);
    ctx.save();
    ctx.font = '700 10px ' + FONT_UI; ctx.textAlign = 'center'; ctx.fillStyle = '#F5E9D0';
    ctx.fillText('AGUA', cr.x + cr.w / 2, cr.y + cr.h - 8);
    ctx.restore();
  }

  function renderActionBar(s) {
    var b = batchRect();
    var hot = G.mouse.down && pointIn(b, G.mouse.x, G.mouse.y);
    softShadow(b.x, b.y, b.w, b.h, 12);
    ctx.fillStyle = hot ? '#f2bd55' : '#E8A93D';
    roundRect(b.x, b.y, b.w, b.h, 12); ctx.fill();
    ctx.save();
    ctx.font = '900 16px ' + FONT_DISPLAY; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#2A2320';
    ctx.fillText('SERVE READY', b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.restore();
    var t = trashRect();
    softShadow(t.x, t.y, t.w, t.h, 12);
    ctx.fillStyle = 'rgba(46,44,38,0.9)';
    roundRect(t.x, t.y, t.w, t.h, 12); ctx.fill();
    ctx.save();
    ctx.strokeStyle = 'rgba(224,75,52,0.7)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
    roundRect(t.x + 4, t.y + 4, t.w - 8, t.h - 8, 9); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '700 11px ' + FONT_UI; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(245,233,208,0.75)';
    ctx.fillText('HOLD / DRAG', t.x + t.w / 2, t.y + 16);
    ctx.fillText('TO TRASH', t.x + t.w / 2, t.y + 30);
    ctx.restore();
  }

  function renderDishButtons(s) {
    var n = s.menu.length;
    for (var i = 0; i < n; i++) {
      var r = dishBtnRect(i, n), id = s.menu[i], d = FTC.DISHES[id];
      var sel = G.selDish === id;
      softShadow(r.x, r.y, r.w, r.h, 12);
      ctx.fillStyle = sel ? '#E8A93D' : '#3a3128';
      roundRect(r.x, r.y, r.w, r.h, 12); ctx.fill();
      if (sel) {
        ctx.save();
        ctx.strokeStyle = '#F5E9D0'; ctx.lineWidth = 2.5;
        roundRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 10); ctx.stroke();
        ctx.restore();
      }
      drawDishIcon(id, r.x + 8, r.y + 9, 48, 48);
      ctx.save();
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.font = '900 15px ' + FONT_DISPLAY;
      ctx.fillStyle = sel ? '#2A2320' : '#F5E9D0';
      ctx.fillText(d.name, r.x + 62, r.y + 26);
      ctx.font = '700 12px ' + FONT_UI;
      ctx.fillStyle = sel ? 'rgba(42,35,32,0.75)' : '#E8A93D';
      ctx.fillText('$' + d.price.toFixed(2) + (d.grill ? '' : ' • instant'), r.x + 62, r.y + 46);
      ctx.restore();
    }
  }

  /* ================= scene transitions ================= */
  function setScene(name) {
    G.prevScene = G.scene;
    G.scene = name;
    G.sceneT = 0;
    G.transT = 0;
    G.buttons = [];
  }
  function drawTransition() {
    if (G.transT == null || G.transT >= 1) return;
    var a = Math.sin(Math.min(1, G.transT) * Math.PI);
    ctx.fillStyle = 'rgba(26,14,8,' + (a * 0.85).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }

  /* buttons: drawn + registered for taps */
  function button(id, x, y, w, h, label, opts) {
    opts = opts || {};
    G.buttons.push({ id: id, x: x, y: y, w: w, h: h });
    var hot = G.mouse.down && pointIn({ x: x, y: y, w: w, h: h }, G.mouse.x, G.mouse.y);
    var bg = opts.ghost ? 'rgba(245,233,208,0.08)' : (hot ? '#f2bd55' : (opts.red ? '#C0392B' : '#E8A93D'));
    softShadow(x, y, w, h, 14);
    ctx.fillStyle = bg;
    roundRect(x, y, w, h, 14); ctx.fill();
    if (opts.ghost) {
      ctx.strokeStyle = 'rgba(245,233,208,0.5)'; ctx.lineWidth = 2;
      roundRect(x + 2, y + 2, w - 4, h - 4, 12); ctx.stroke();
    }
    ctx.save();
    ctx.font = '900 ' + (opts.small ? 15 : 19) + 'px ' + FONT_DISPLAY;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = opts.ghost ? '#F5E9D0' : (opts.red ? '#F5E9D0' : '#2A2320');
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.restore();
    return { x: x, y: y, w: w, h: h };
  }
  function hitButton(x, y) {
    for (var i = G.buttons.length - 1; i >= 0; i--) {
      var b = G.buttons[i];
      if (pointIn(b, x, y)) return b.id;
    }
    return null;
  }

  /* ================= title ================= */
  function renderTitle() {
    bgWash();
    // poster backdrop: giant truck
    var truck = null;
    try { truck = FTART.truck(); } catch (e) {}
    if (truck) {
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.drawImage(truck, 30, 120, 420, 235);
      ctx.restore();
    }
    // warm glow behind title
    var g = ctx.createRadialGradient(W / 2, 400, 40, W / 2, 400, 260);
    g.addColorStop(0, 'rgba(232,169,61,0.16)');
    g.addColorStop(1, 'rgba(232,169,61,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    var rise = easeOutCubic(clamp(G.sceneT / 0.8, 0, 1));
    ctx.save();
    ctx.globalAlpha = clamp(rise * 1.4, 0, 1);
    ctx.translate(0, (1 - rise) * 26);
    kicker('Taco Loco  •  Est. 2026', W / 2, 392, 15, '#E8A93D', 'center');
    display('FOOD TRUCK', W / 2, 448, 64, '#F5E9D0', 'center', 900);
    display('MANAGER', W / 2, 512, 64, '#E8A93D', 'center', 900);
    ctx.save();
    ctx.font = 'italic 700 17px ' + FONT_DISPLAY;
    ctx.fillStyle = 'rgba(245,233,208,0.75)';
    ctx.textAlign = 'center';
    ctx.fillText('the lunch rush is a beautiful chaos', W / 2, 546);
    ctx.restore();
    ctx.restore();

    button('start', 90, 590, 300, 58, G.save.shifts === 0 ? 'OPEN THE TRUCK' : 'START SHIFT');
    button('daily', 90, 658, 300, 52, 'DAILY RUSH' + (G.save.dailyBest[todayStr()] ? '  ★' : ''), { ghost: true, small: true });
    button('howto', 90, 718, 144, 44, 'HOW TO', { ghost: true, small: true });
    button('mute', 246, 718, 144, 44, G.save.muted ? 'UNMUTE' : 'MUTE', { ghost: true, small: true });

    ctx.save();
    ctx.font = '700 11px ' + FONT_UI; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(245,233,208,0.4)';
    ctx.fillText('v' + FTC.BUILD + '  •  a Workman Designs kitchen', W / 2, H - 14);
    ctx.restore();
  }
  function tapTitle(x, y) {
    var id = hitButton(x, y);
    if (id === 'start') { sfx('ui'); startShift('normal'); }
    else if (id === 'daily') { sfx('ui'); startShift('daily'); }
    else if (id === 'howto') { sfx('ui'); G.howto = true; G.howtoStep = 0; }
    else if (id === 'mute') { toggleMute(); sfx('ui'); }
  }

  /* ================= shop (between shifts) ================= */
  function renderShop() {
    bgWash();
    kicker('The commissary', 24, 46, 15, '#E8A93D');
    display('Between rushes', 24, 88, 40, '#F5E9D0', 'left', 900);
    ctx.save();
    ctx.font = '700 18px ' + FONT_UI; ctx.fillStyle = '#E8A93D';
    ctx.fillText('$' + G.save.coins.toFixed(2), 24, 118);
    ctx.restore();
    // tabs
    button('tabU', 24, 134, 210, 44, 'UPGRADES', { ghost: G.shopTab !== 'upgrades', small: true });
    button('tabM', 246, 134, 210, 44, 'MENU', { ghost: G.shopTab !== 'menu', small: true });
    if (G.shopTab === 'upgrades') {
      var y = 190, keys = Object.keys(FTC.UPGRADES);
      for (var i = 0; i < keys.length; i++) {
        var uk = keys[i], u = FTC.UPGRADES[uk], owned = !!G.save.upgrades[uk];
        var afford = G.save.coins >= u.cost;
        softShadow(24, y, W - 48, 60, 10);
        ctx.fillStyle = '#33291d';
        roundRect(24, y, W - 48, 60, 10); ctx.fill();
        ctx.save();
        ctx.textAlign = 'left';
        ctx.font = '900 15px ' + FONT_DISPLAY; ctx.fillStyle = '#F5E9D0';
        ctx.fillText(u.name, 38, y + 22);
        ctx.font = '400 11px ' + FONT_UI; ctx.fillStyle = 'rgba(245,233,208,0.65)';
        ctx.fillText(u.desc.slice(0, 56), 38, y + 40);
        if (u.desc.length > 56) ctx.fillText(u.desc.slice(56, 108), 38, y + 53);
        ctx.restore();
        if (owned) {
          ctx.save();
          ctx.font = '900 13px ' + FONT_DISPLAY; ctx.fillStyle = '#7FB069'; ctx.textAlign = 'right';
          ctx.fillText('OWNED', W - 40, y + 35);
          ctx.restore();
        } else {
          button('buy:' + uk, W - 136, y + 12, 96, 36, '$' + u.cost, { small: true, ghost: !afford });
        }
        y += 68;
      }
    } else {
      var pts = FTSIM.menuPoints(G.save.menu);
      ctx.save();
      ctx.font = '700 15px ' + FONT_UI; ctx.fillStyle = '#F5E9D0'; ctx.textAlign = 'left';
      ctx.fillText('Menu difficulty  ' + pts + ' / ' + FTC.MENU_TARIFF + ' pts', 24, 200);
      ctx.font = '400 12px ' + FONT_UI; ctx.fillStyle = 'rgba(245,233,208,0.6)';
      ctx.fillText('Harder dishes pay more. The menu is the difficulty — you set it.', 24, 220);
      ctx.restore();
      var my = 236, ids = Object.keys(FTC.DISHES);
      for (var d2 = 0; d2 < ids.length; d2++) {
        var id = ids[d2], dd = FTC.DISHES[id], on = G.save.menu.indexOf(id) >= 0;
        softShadow(24, my, W - 48, 52, 10);
        ctx.fillStyle = on ? '#4a3a22' : '#2b241b';
        roundRect(24, my, W - 48, 52, 10); ctx.fill();
        drawDishIcon(id, 34, my + 6, 40, 40);
        ctx.save();
        ctx.textAlign = 'left';
        ctx.font = '900 15px ' + FONT_DISPLAY; ctx.fillStyle = on ? '#F5E9D0' : 'rgba(245,233,208,0.45)';
        ctx.fillText(dd.name + '  (' + dd.pts + 'pt' + (dd.pts === 1 ? '' : 's') + ')', 84, my + 24);
        ctx.font = '700 12px ' + FONT_UI; ctx.fillStyle = '#E8A93D';
        ctx.fillText('$' + dd.price.toFixed(2), 84, my + 42);
        ctx.restore();
        button('menu:' + id, W - 120, my + 8, 84, 36, on ? 'REMOVE' : 'ADD', { small: true, ghost: !on });
        my += 60;
      }
    }
    button('open', 90, H - 84, 300, 58, G.shiftKind === 'daily' ? 'START DAILY RUSH' : 'ROLL TO ' + G.spotNames[G.save.spotIdx % G.spotNames.length].toUpperCase());
  }
  function tapShop(x, y) {
    var id = hitButton(x, y);
    if (!id) return;
    if (id === 'tabU') { G.shopTab = 'upgrades'; sfx('ui'); }
    else if (id === 'tabM') { G.shopTab = 'menu'; sfx('ui'); }
    else if (id.indexOf('buy:') === 0) {
      var uk = id.slice(4), u = FTC.UPGRADES[uk];
      if (!G.save.upgrades[uk] && G.save.coins >= u.cost) {
        G.save.coins -= u.cost;
        G.save.upgrades[uk] = true;
        storeSave(); sfx('cha'); buzzH(FTC.HAPTIC.perfect);
        textPop(x, y - 10, u.name.toUpperCase() + ' INSTALLED', '#7FB069', true);
      } else { sfx('error'); }
    }
    else if (id.indexOf('menu:') === 0) {
      var mid = id.slice(5), ix = G.save.menu.indexOf(mid);
      if (ix >= 0) {
        if (G.save.menu.length > 2) { G.save.menu.splice(ix, 1); sfx('ui'); }
        else { sfx('error'); textPop(x, y - 10, 'KEEP AT LEAST 2 DISHES', '#E04B34', false); }
      } else {
        var pts = FTSIM.menuPoints(G.save.menu.concat([mid]));
        if (pts <= FTC.MENU_TARIFF && G.save.menu.length < FTC.MENU_MAX_DISHES) { G.save.menu.push(mid); sfx('ui'); }
        else { sfx('error'); textPop(x, y - 10, 'OVER BUDGET', '#E04B34', false); }
      }
      storeSave();
    }
    else if (id === 'open') { sfx('ui'); beginShift(); }
  }

  /* ================= summary (the calm) ================= */
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
  function renderSummary() {
    bgWash();
    var s = G.summary;
    if (!s) return;
    var t = clamp(G.summaryT / 1.2, 0, 1);
    G.countedRevenue = s.revenue * easeOutCubic(t);
    kicker(G.shiftKind === 'daily' ? 'Daily rush complete' : 'Shift complete', W / 2, 70, 15, '#E8A93D', 'center');
    // stars
    for (var i = 0; i < 3; i++) {
      var on = i < s.stars;
      var st = i < 3 ? easeOutBack(clamp((G.summaryT - 0.3 - i * 0.25) / 0.4, 0, 1)) : 0;
      drawStar(W / 2 + (i - 1) * 84, 140, 30 * Math.max(0.01, st), on);
    }
    display('$' + G.countedRevenue.toFixed(2), W / 2, 230, 58, '#F5E9D0', 'center', 900);
    kicker('in tips & sales', W / 2, 258, 13, 'rgba(245,233,208,0.6)', 'center');
    // stat lines
    var lines = [
      ['Served', s.served], ['Perfect plates', s.perfect],
      ['Best streak', 'x' + s.maxCombo], ['Walkouts', s.walkouts],
      ['Score', s.score], ['Buzz', s.buzz + '%']
    ];
    ctx.save();
    ctx.textAlign = 'left';
    for (var l = 0; l < lines.length; l++) {
      var ly = 320 + l * 34;
      ctx.font = '700 15px ' + FONT_UI; ctx.fillStyle = 'rgba(245,233,208,0.65)';
      ctx.fillText(lines[l][0], 90, ly);
      ctx.font = '900 17px ' + FONT_DISPLAY; ctx.fillStyle = '#F5E9D0'; ctx.textAlign = 'right';
      ctx.fillText(String(lines[l][1]), W - 90, ly);
      ctx.textAlign = 'left';
    }
    ctx.restore();
    if (G.shiftKind === 'daily') {
      ctx.save();
      ctx.font = 'italic 14px ' + FONT_DISPLAY; ctx.fillStyle = '#E8A93D'; ctx.textAlign = 'center';
      ctx.fillText('posted to the daily board', W / 2, 540);
      ctx.restore();
    } else {
      ctx.save();
      ctx.font = 'italic 14px ' + FONT_DISPLAY; ctx.fillStyle = 'rgba(245,233,208,0.6)'; ctx.textAlign = 'center';
      ctx.fillText('tomorrow: ' + G.spotNames[G.save.spotIdx % G.spotNames.length], W / 2, 540);
      ctx.restore();
    }
    button('next', 90, 600, 300, 58, 'COMMISSARY');
    button('replay', 90, 668, 300, 48, 'RUN IT BACK', { ghost: true, small: true });
  }
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
  function tapSummary(x, y) {
    var id = hitButton(x, y);
    if (id === 'next') { sfx('ui'); setScene('shop'); }
    else if (id === 'replay') { sfx('ui'); beginShift(); }
  }

  /* ================= how-to overlay ================= */
  var HOWTO = [
    ['Tap a dish, then tap a grill slot.', 'Food cooks on its own — watch the ring. Golden glow means PERFECT.'],
    ['Drag finished food onto a ticket.', 'Serve in order to build your streak. The streak is where the money is.'],
    ['Swipe grill food to the warmer to prep ahead.', 'Held food spoils — watch the green ring. Stale food kills buzz.'],
    ['Burnt? Tap it to clear. Trash? Hold it.', 'Never double-tap. The drive-up bell means a second line needs you.']
  ];
  function renderHowto() {
    ctx.fillStyle = 'rgba(20,12,7,0.82)';
    ctx.fillRect(0, 0, W, H);
    var st = HOWTO[G.howtoStep];
    ctx.save();
    ctx.textAlign = 'center';
    kicker('How to run the truck  ' + (G.howtoStep + 1) + '/4', W / 2, 300, 14, '#E8A93D', 'center');
    display(st[0], W / 2, 360, 27, '#F5E9D0', 'center', 900);
    ctx.font = '400 16px ' + FONT_UI; ctx.fillStyle = 'rgba(245,233,208,0.8)';
    wrapText(st[1], W / 2, 410, 400, 24);
    ctx.restore();
    button('howtoNext', 140, 560, 200, 52, G.howtoStep < 3 ? 'NEXT' : "LET'S COOK", { small: true });
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
  function advanceHowto(x, y) {
    var id = hitButton(x, y);
    if (id === 'howtoNext') {
      sfx('ui');
      G.howtoStep++;
      if (G.howtoStep >= HOWTO.length) { G.howto = false; G.save.seenHowto = true; storeSave(); }
    }
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
      setScene('shop'); // menu/upgrades shared; the OPEN button starts the daily
      G.shopTab = 'menu';
    } else {
      G.wantHowto = !G.save.seenHowto; // shown once the shift itself starts
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
      if (G.wantHowto && G.shiftKind !== 'daily') { G.howto = true; G.howtoStep = 0; G.wantHowto = false; }
    });
  }

  /* ---- pause overlay ---- */
  function renderPause() {
    ctx.fillStyle = 'rgba(20,12,7,0.72)';
    ctx.fillRect(0, 0, W, H);
    display('Paused', W / 2, 300, 44, '#F5E9D0', 'center', 900);
    button('resume', 110, 360, 260, 54, 'RESUME');
    button('quit', 110, 424, 260, 48, 'QUIT TO TITLE', { ghost: true, small: true });
    button('mute2', 110, 482, 260, 48, (G.save.muted ? 'UNMUTE' : 'MUTE') + '  •  JUICE: ' + (FEEL.enabled ? 'ON' : 'OFF'), { ghost: true, small: true });
    button('hapt', 110, 540, 260, 48, 'HAPTICS: ' + (G.save.hapticsOff ? 'OFF' : 'ON'), { ghost: true, small: true });
  }
  function tapPause(x, y) {
    var id = hitButton(x, y);
    if (id === 'resume') { G.paused = false; sfx('ui'); }
    else if (id === 'quit') { G.paused = false; try { if (window.FTA) FTA.musicStop(); } catch (e) {} setScene('title'); sfx('ui'); }
    else if (id === 'mute2') {
      toggleMute();
      if (!G.save.muted && FEEL.enabled === false) { /* keep */ }
      sfx('ui');
    }
    else if (id === 'hapt') { G.save.hapticsOff = !G.save.hapticsOff; storeSave(); sfx('ui'); buzzH(FTC.HAPTIC.select); }
  }
  function toggleMute() {
    G.save.muted = !G.save.muted;
    storeSave();
    try { if (window.FTA) FTA.setMuted(G.save.muted); } catch (e) {}
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
    // merge AI/fallback regulars into save.regulars (persist visits/unlocks by name)
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
    setTimeout(function () { fin(fallbackRegulars(seed)); }, 6000); // never hang boot
  }

  /* ================= boot ================= */
  function boot() {
    buildGrade();
    FEEL.init();
    try { if (window.FTART) FTART.init(); } catch (e) {}
    try {
      if (window.FTA) {
        FTA.init(); // creates context lazily; safe pre-gesture
        if (G.save.muted && FTA.setMuted) FTA.setMuted(true);
      }
    } catch (e) {}
    // pre-render dish icons after fonts (best effort)
    try {
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { try { FTART.init(); } catch (e) {} });
    } catch (e) {}
    // warm the regulars cache in the background (title doesn't block on it)
    ensureRegulars(function () {});
    G.buttons = [];
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
    FEEL: FEEL
  };

  /* ---- patch onTap: pause button + pause overlay routing ---- */
  var _onTap = onTap;
  onTap = function (x, y) {
    if (G.paused && G.scene === 'shift') { tapPause(x, y); return; }
    if (G.scene === 'shift' && G.sim) {
      if (pointIn({ x: W - 52, y: 7, w: 44, h: 44 }, x, y)) { G.paused = true; sfx('ui'); return; }
    }
    _onTap(x, y);
  };
  var _render = render;
  render = function () {
    G.buttons = []; // rebuilt every frame
    _render();
    if (G.paused && G.scene === 'shift') {
      ctx.save();
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      renderPause();
      ctx.restore();
    }
  };
  var _frame = frame;
  frame = function (now) {
    if (G.transT == null) G.transT = 1;
    if (G.transT < 1) G.transT = Math.min(1, G.transT + 0.016 / 0.35);
    G.sceneT += 0.016;
    if (G.scene === 'summary') G.summaryT += 0.016;
    _frame(now);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
