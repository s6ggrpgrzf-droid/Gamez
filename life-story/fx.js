/* fx.js — Life Story v4 engine foundations.
 * Three small systems, zero dependencies:
 *   Bus    — tiny typed event emitter. Systems talk via events, never by
 *            reaching into each other's internals.
 *   Scenes — showScene('start'|'dossier'|'life'|'death'). Owns overlay
 *            visibility + transitions; emits scene:leave / scene:enter.
 *   FX     — pooled 2D particle engine on the #confetti canvas. One canvas,
 *            one rAF loop, one fixed pool: no per-burst allocation, no GC
 *            hitches on iPhone Safari. Pre-rendered shape sprites (the js13k
 *            trick: draw once to offscreen, blit with drawImage forever).
 * Exposed as window.Bus / window.Scenes / window.FX.
 */
(function (global) {
  'use strict';

  /* ================= event bus ================= */
  var Bus = {
    _m: {},
    on: function (ev, fn) {
      if (!this._m[ev]) this._m[ev] = [];
      this._m[ev].push(fn);
      var self = this;
      return function () { self.off(ev, fn); };
    },
    off: function (ev, fn) {
      var a = this._m[ev];
      if (!a) return;
      var i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
    emit: function (ev, data) {
      var a = this._m[ev];
      if (!a || !a.length) return;
      // copy: a listener unsubscribing mid-emit must not break the loop
      var list = a.slice(), i;
      for (i = 0; i < list.length; i++) {
        try { list[i].call(null, data); }
        catch (e) { if (global.console && console.warn) console.warn('[Bus:' + ev + ']', e); }
      }
    }
  };

  /* ================= reduced motion ================= */
  var reducedMotion = false;
  try {
    reducedMotion = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) {}
  function setReducedMotion(b) { reducedMotion = !!b; }

  /* ================= scene manager ================= */
  // Scenes map to overlay ids; 'life' means "no scene overlay" (the main HUD).
  var SCENE_IDS = { start: 'start', dossier: 'dossier', death: 'death' };
  var SCENE_ORDER = ['start', 'dossier', 'life', 'death'];
  var Scenes = {
    current: null,
    show: function (name, opts) {
      opts = opts || {};
      if (SCENE_ORDER.indexOf(name) < 0) return;
      if (this.current === name && !opts.force) return;
      var prev = this.current;
      Bus.emit('scene:leave', { scene: prev, next: name });
      var k;
      for (k in SCENE_IDS) {
        if (!SCENE_IDS.hasOwnProperty(k)) continue;
        var el = document.getElementById(SCENE_IDS[k]);
        if (el) el.classList.add('hidden');
      }
      if (name !== 'life') {
        var show = document.getElementById(SCENE_IDS[name]);
        if (show) show.classList.remove('hidden');
      }
      this.current = name;
      Bus.emit('scene:enter', { scene: name, prev: prev });
      if (typeof opts.done === 'function') {
        try { opts.done(); } catch (e) {}
      }
    }
  };
  // Entrance animation is CSS-driven (display:none -> shown restarts it),
  // so the manager stays dumb about motion. See style.css: sceneIn keyframes.

  /* ================= pooled particle engine ================= */
  var POOL_N = 600;
  var pool = [], i;
  for (i = 0; i < POOL_N; i++) {
    pool.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
      size: 6, rot: 0, vr: 0, grav: 0, drag: 1, shape: 0, color: '#fff',
      fadePow: 1, spin: true });
  }
  var SHAPE = { RECT: 0, CIRCLE: 1, HEART: 2, STAR: 3, DOLLAR: 4, RING: 5 };

  // Pre-rendered sprite cache: key = shape + '|' + color (+ size bucket).
  var spriteCache = {};
  function sprite(shape, color, size) {
    var key = shape + '|' + color + '|' + Math.round(size);
    var s = spriteCache[key];
    if (s) return s;
    var pad = Math.ceil(size * 0.7) + 4;
    var dim = Math.ceil(size * 2 + pad * 2);
    var c = document.createElement('canvas');
    c.width = c.height = dim;
    var g = c.getContext('2d');
    g.translate(dim / 2, dim / 2);
    g.fillStyle = color;
    g.strokeStyle = color;
    var r = size;
    if (shape === SHAPE.RECT) {
      g.fillRect(-r * 0.6, -r * 0.8, r * 1.2, r * 1.6);
    } else if (shape === SHAPE.CIRCLE) {
      g.beginPath(); g.arc(0, 0, r * 0.8, 0, Math.PI * 2); g.fill();
    } else if (shape === SHAPE.HEART) {
      g.beginPath();
      g.moveTo(0, r * 0.7);
      g.bezierCurveTo(-r * 1.3, -r * 0.2, -r * 0.7, -r * 1.1, 0, -r * 0.35);
      g.bezierCurveTo(r * 0.7, -r * 1.1, r * 1.3, -r * 0.2, 0, r * 0.7);
      g.fill();
    } else if (shape === SHAPE.STAR) {
      g.beginPath();
      for (var k = 0; k < 10; k++) {
        var rr = (k % 2 === 0) ? r : r * 0.45;
        var a = -Math.PI / 2 + k * Math.PI / 5;
        var px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath(); g.fill();
    } else if (shape === SHAPE.DOLLAR) {
      g.beginPath(); g.arc(0, 0, r * 0.95, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(0,0,0,.55)';
      g.font = 'bold ' + Math.round(r * 1.2) + 'px system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('$', 0, r * 0.08);
    } else if (shape === SHAPE.RING) {
      g.lineWidth = Math.max(2, r * 0.28);
      g.beginPath(); g.arc(0, 0, r * 0.8, 0, Math.PI * 2); g.stroke();
    }
    spriteCache[key] = { c: c, half: dim / 2 };
    // bounded cache: shapes*colors stays small, but never grow forever
    return spriteCache[key];
  }

  var canvas = null, ctx = null, rafId = 0, activeCount = 0;
  var shakeT = 0, shakeDur = 1, shakePower = 0, shakeEl = null;

  function ensureCanvas() {
    if (canvas) return true;
    canvas = document.getElementById('confetti');
    if (!canvas || !canvas.getContext) return false;
    ctx = canvas.getContext('2d');
    return true;
  }
  function sizeCanvas() {
    if (!canvas) return;
    var w = global.innerWidth || 400, h = global.innerHeight || 700;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }
  function alloc() {
    for (var k = 0; k < POOL_N; k++) {
      if (!pool[k].active) { pool[k].active = true; activeCount++; return pool[k]; }
    }
    return null; // pool exhausted: drop the particle, never grow
  }
  function loop() {
    rafId = 0;
    if (!ctx) return;
    var w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    var k, p, sp, t, a, dw;
    for (k = 0; k < POOL_N; k++) {
      p = pool[k];
      if (!p.active) continue;
      p.life++;
      if (p.life >= p.maxLife || p.y > h + 60) {
        p.active = false; activeCount--;
        continue;
      }
      p.vy += p.grav;
      p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx; p.y += p.vy;
      if (p.spin) p.rot += p.vr;
      t = p.life / p.maxLife;
      a = Math.pow(1 - t, p.fadePow);
      sp = sprite(p.shape, p.color, p.size);
      // rings expand instead of translating much
      dw = (p.shape === SHAPE.RING) ? sp.half * (0.4 + t * 2.2) : sp.half;
      ctx.save();
      ctx.globalAlpha = a < 0 ? 0 : (a > 1 ? 1 : a);
      ctx.translate(p.x, p.y);
      if (p.spin) ctx.rotate(p.rot);
      ctx.drawImage(sp.c, -dw, -dw, dw * 2, dw * 2);
      ctx.restore();
    }
    // screen shake, decaying
    if (shakeT > 0 && shakeEl) {
      shakeT--;
      var m = shakePower * (shakeT / shakeDur);
      var ox = (Math.random() - 0.5) * 2 * m;
      var oy = (Math.random() - 0.5) * 2 * m;
      shakeEl.style.transform = 'translate(' + ox.toFixed(1) + 'px,' + oy.toFixed(1) + 'px)';
      if (shakeT <= 0) shakeEl.style.transform = '';
    }
    if (activeCount > 0 || shakeT > 0) {
      rafId = requestAnimationFrame(loop);
    } else {
      if (canvas) canvas.classList.add('hidden');
      if (shakeEl) shakeEl.style.transform = '';
    }
  }
  function kick() {
    if (!ensureCanvas()) return;
    sizeCanvas();
    canvas.classList.remove('hidden');
    if (!rafId) rafId = requestAnimationFrame(loop);
  }
  function spawn(o) {
    var p = alloc();
    if (!p) return;
    p.x = o.x; p.y = o.y; p.vx = o.vx || 0; p.vy = o.vy || 0;
    p.maxLife = o.life || 90; p.life = 0;
    p.size = o.size || 7; p.rot = o.rot || Math.random() * Math.PI * 2;
    p.vr = (o.vr !== undefined) ? o.vr : (Math.random() - 0.5) * 0.25;
    p.grav = o.grav !== undefined ? o.grav : 0.12;
    p.drag = o.drag !== undefined ? o.drag : 0.985;
    p.shape = o.shape || 0; p.color = o.color || '#ffd166';
    p.fadePow = o.fadePow || 1;
    p.spin = o.shape !== SHAPE.RING;
  }

  var DEFAULT_COLORS = ['#ffd166', '#7c5cff', '#4dd0a6', '#ff6b9d', '#2ea8ff'];
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  var FX = {
    SHAPE: SHAPE,
    reducedMotion: function () { return reducedMotion; },
    setReducedMotion: setReducedMotion,
    clear: function () {
      var k;
      for (k = 0; k < POOL_N; k++) pool[k].active = false;
      activeCount = 0; shakeT = 0;
      if (shakeEl) shakeEl.style.transform = '';
    },
    /* radial burst — the workhorse (replaces the old confetti()) */
    burst: function (o) {
      if (reducedMotion) return;
      o = o || {};
      var n = o.count || 120;
      var cx = (o.x !== undefined) ? o.x : (global.innerWidth || 400) / 2;
      var cy = (o.y !== undefined) ? o.y : -20;
      var spread = o.spread || 0;
      var colors = o.colors || DEFAULT_COLORS;
      var shapes = o.shapes || [SHAPE.RECT, SHAPE.CIRCLE];
      var speed = o.speed || 7;
      var k, a, sp;
      for (k = 0; k < n; k++) {
        a = Math.random() * Math.PI * 2;
        sp = (0.25 + Math.random() * 0.75) * speed;
        spawn({
          x: cx + (Math.random() - 0.5) * spread,
          y: cy + (Math.random() - 0.5) * spread * 0.5,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - speed * 0.35,
          life: 70 + Math.random() * 70,
          size: 5 + Math.random() * 7,
          color: pick(colors), shape: pick(shapes),
          grav: 0.14, drag: 0.982
        });
      }
      kick();
    },
    /* upward fountain from a point (celebrations, wins) */
    fountain: function (o) {
      if (reducedMotion) return;
      o = o || {};
      var n = o.count || 90;
      var cx = o.x || (global.innerWidth || 400) / 2;
      var cy = o.y || (global.innerHeight || 700);
      var colors = o.colors || DEFAULT_COLORS;
      var shapes = o.shapes || [SHAPE.RECT, SHAPE.CIRCLE, SHAPE.STAR];
      var power = o.power || 11;
      for (var k = 0; k < n; k++) {
        spawn({
          x: cx + (Math.random() - 0.5) * (o.spread || 60),
          y: cy,
          vx: (Math.random() - 0.5) * power * 0.55,
          vy: -(power * (0.5 + Math.random() * 0.7)),
          life: 80 + Math.random() * 60,
          size: 5 + Math.random() * 7,
          color: pick(colors), shape: pick(shapes),
          grav: 0.22, drag: 0.99
        });
      }
      kick();
    },
    /* rain from the top of the screen (money rain, snow of stars) */
    rain: function (o) {
      if (reducedMotion) return;
      o = o || {};
      var n = o.count || 60;
      var w = global.innerWidth || 400;
      var colors = o.colors || DEFAULT_COLORS;
      var shapes = o.shapes || [SHAPE.RECT];
      for (var k = 0; k < n; k++) {
        spawn({
          x: Math.random() * w,
          y: -20 - Math.random() * 200,
          vx: (Math.random() - 0.5) * 1.6,
          vy: 2 + Math.random() * (o.fallSpeed || 3),
          life: 220,
          size: 5 + Math.random() * 6,
          color: pick(colors), shape: pick(shapes),
          grav: 0.02, drag: 0.995, fadePow: 0.6
        });
      }
      kick();
    },
    hearts: function (x, y, n) {
      if (reducedMotion) return;
      n = n || 26;
      var cx = x || (global.innerWidth || 400) / 2;
      var cy = y || 200;
      for (var k = 0; k < n; k++) {
        var a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        var sp = 2 + Math.random() * 4;
        spawn({
          x: cx + (Math.random() - 0.5) * 40, y: cy,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5,
          life: 60 + Math.random() * 50, size: 6 + Math.random() * 6,
          color: pick(['#ff6b9d', '#ff8fab', '#e5486f', '#ffb3c7']),
          shape: SHAPE.HEART, grav: -0.03, drag: 0.97, fadePow: 1.4
        });
      }
      kick();
    },
    money: function (x, y, n) {
      if (reducedMotion) return;
      n = n || 30;
      var cx = x || (global.innerWidth || 400) / 2;
      var cy = y || 160;
      for (var k = 0; k < n; k++) {
        var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        var sp = 3 + Math.random() * 5;
        spawn({
          x: cx, y: cy,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 70 + Math.random() * 50, size: 8 + Math.random() * 5,
          color: pick(['#4dd0a6', '#37b57f', '#ffd166']),
          shape: SHAPE.DOLLAR, grav: 0.16, drag: 0.985
        });
      }
      kick();
    },
    ring: function (x, y, color) {
      if (reducedMotion) return;
      spawn({
        x: x || (global.innerWidth || 400) / 2, y: y || 300,
        vx: 0, vy: 0, life: 34, size: 14,
        color: color || '#ffffff', shape: SHAPE.RING,
        grav: 0, drag: 1, vr: 0, fadePow: 1.6
      });
      kick();
    },
    /* decaying screen shake on #app (or a given element) */
    shake: function (power, el) {
      if (reducedMotion) return;
      shakeEl = el || document.getElementById('app') || document.body;
      shakePower = power || 8;
      shakeDur = Math.max(10, Math.min(30, shakePower * 2.4));
      shakeT = shakeDur;
      kick();
    }
  };

  global.Bus = Bus;
  global.Scenes = Scenes;
  global.FX = FX;
})(window);
