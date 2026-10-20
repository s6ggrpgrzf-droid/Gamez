/* ============================================================
 * Pdawg Puzzles - a better jigsaw puzzle game.
 * Single-canvas renderer, seeded Draradech-style piece edges,
 * magnetic snap + piece grouping, IndexedDB autosave, custom photos.
 * No dependencies, no network. Mobile-first (Pointer Events).
 * ============================================================ */
(function () {
'use strict';

/* Node test seam: in the browser the pure logic core arrives as globals
 * from logic.js (loaded first); under node, pull it in explicitly. */
if (typeof module !== 'undefined' && module.exports) {
  try { Object.assign(globalThis, require('./logic.js')); } catch (e) {}
}

/* ---------------- utilities ---------------- */
function $(s) { return document.querySelector(s); }
function el(tag, cls, html) {
  var d = document.createElement(tag);
  if (cls) d.className = cls;
  if (html !== undefined) d.innerHTML = html;
  return d;
}
/* Small SVG progress ring for the daily hero card. */
function heroRingSVG(pct) {
  var r = 21, c = (2 * Math.PI * r).toFixed(1);
  var arc = (2 * Math.PI * r * Math.max(0, Math.min(100, pct)) / 100).toFixed(1);
  return '<svg width="54" height="54" viewBox="0 0 54 54">' +
    '<circle cx="27" cy="27" r="' + r + '" fill="none" stroke="#e9e4d6" stroke-width="5"/>' +
    '<circle cx="27" cy="27" r="' + r + '" fill="none" stroke="#f2a007" stroke-width="5" ' +
    'stroke-linecap="round" stroke-dasharray="' + arc + ' ' + c + '" transform="rotate(-90 27 27)"/></svg>';
}
/* canvas.cloneNode() copies dimensions but NOT painted pixels — draw a real copy. */
function canvasCopy(cv) {
  var c = document.createElement('canvas');
  c.width = cv.width; c.height = cv.height;
  c.className = cv.className;
  c.getContext('2d').drawImage(cv, 0, 0);
  return c;
}
function fmtTime(ms) {
  var s = Math.floor(ms / 1000);
  var m = Math.floor(s / 60), h = Math.floor(m / 60);
  s = s % 60; m = m % 60;
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return h > 0 ? h + ':' + p(m) + ':' + p(s) : m + ':' + p(s);
}
function uid(prefix) {
  return (prefix || 'p') + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

var idb = {
  db: null, mem: null, _ready: null,
  open: function () {
    var self = this;
    if (!self._ready) {
      self._ready = new Promise(function (resolve) {
        function useMem() {
          if (!self.mem) self.mem = { puzzles: {}, images: {} };
          resolve();
        }
        if (!window.indexedDB) { useMem(); return; }
        var req;
        try { req = window.indexedDB.open('pdawg', 1); }
        catch (e) { useMem(); return; }
        req.onupgradeneeded = function () {
          var d = req.result;
          if (!d.objectStoreNames.contains('puzzles')) d.createObjectStore('puzzles', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('images')) d.createObjectStore('images', { keyPath: 'id' });
        };
        req.onsuccess = function () { self.db = req.result; resolve(); };
        req.onerror = function () { useMem(); };
        req.onblocked = function () { useMem(); };
        setTimeout(function () { if (!self.db && !self.mem) useMem(); }, 4000);
      });
    }
    return self._ready;
  },
  _store: function (name, mode) { return this.db.transaction(name, mode).objectStore(name); },
  _op: function (name, mode, fn) {
    var self = this;
    return self.open().then(function () {
      return new Promise(function (resolve, reject) {
        if (self.mem) { try { resolve(fn(self.mem[name])); } catch (e) { reject(e); } return; }
        var q;
        try { q = fn(self._store(name, mode)); }
        catch (e) { reject(e); return; }
        q.onsuccess = function () { resolve(q.result === undefined ? undefined : q.result); };
        q.onerror = function () { reject(q.error); };
      });
    });
  },
  put: function (name, val) {
    return this._op(name, 'readwrite', function (s) {
      if (s.put) return s.put(val);          // IDB object store
      s[val.id] = val; return null;          // mem fallback (sync)
    }).then(function (r) { return r === null ? undefined : r; });
  },
  get: function (name, key) {
    return this._op(name, 'readonly', function (s) {
      if (s.get) return s.get(key);
      return { _mem: true, value: s[key] || null };
    }).then(function (r) {
      if (r && r._mem) return r.value;
      return r || null;
    });
  },
  del: function (name, key) {
    return this._op(name, 'readwrite', function (s) {
      if (s.delete) return s.delete(key);
      delete s[key]; return null;
    });
  }
};

var shelf = {
  KEY: 'pdawg-shelf-v1',
  read: function () {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); }
    catch (e) { return []; }
  },
  write: function (list) {
    try { localStorage.setItem(this.KEY, JSON.stringify(list)); } catch (e) {}
  },
  upsert: function (entry) {
    var list = this.read().filter(function (e) { return e.id !== entry.id; });
    list.unshift(entry);
    this.write(list.slice(0, 60));
  },
  remove: function (id) { this.write(this.read().filter(function (e) { return e.id !== id; })); }
};

var bests = {
  KEY: 'pdawg-best-v1',
  read: function () {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '{}'); }
    catch (e) { return {}; }
  },
  get: function (key) { return this.read()[key] || null; },
  set: function (key, ms) {
    var b = this.read(); b[key] = ms;
    try { localStorage.setItem(this.KEY, JSON.stringify(b)); } catch (e) {}
  }
};

/* ---------------- puzzle setup ---------------- */
var COUNTS = [24, 54, 108, 216, 432];
var LEVELS = [
  { name: 'Cozy', count: 24 },
  { name: 'Classic', count: 54 },
  { name: 'Tricky', count: 108 },
  { name: 'Tough', count: 216 },
  { name: 'Master', count: 432 }
];
function levelForCount(n) {
  for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].count === n) return LEVELS[i];
  return { name: n + ' pieces', count: n };
}

/* Rotation-mode preference, persisted across sessions. */
var ROT_KEY = 'pdawg-rotation';
function rotPref() {
  try { return localStorage.getItem(ROT_KEY) === '1'; } catch (e) { return false; }
}
function setRotPref(on) {
  try { localStorage.setItem(ROT_KEY, on ? '1' : '0'); } catch (e) {}
}

function gridForCount(n, aspect) {
  // Pick rows x cols whose product hits n exactly when possible (so a
  // "24 pieces" puzzle really has 24); break ties by aspect match so cells
  // stay squarish.
  var best = null;
  var c0 = Math.sqrt(n * aspect);
  for (var c = Math.max(2, Math.floor(c0) - 3); c <= Math.ceil(c0) + 3; c++) {
    for (var r = Math.max(2, Math.floor(n / c) - 1); r <= Math.ceil(n / c) + 1; r++) {
      var score = Math.abs(r * c - n) * 4 + Math.abs((c / r) - aspect) / aspect;
      if (!best || score < best.score) best = { rows: r, cols: c, score: score };
    }
  }
  return { rows: best.rows, cols: best.cols };
}

/* ---------------- game controller: canvas, camera, render ---------------- */
var Game = {
  S: null, imgCanvas: null,
  pieceCv: [], piecePaths: [],
  canvas: null, ctx: null, hitCtx: null,
  cam: { x: 0, y: 0, s: 1 },
  dpr: 1, cw: 0, ch: 0,
  dirty: true, raf: 0, lastT: 0,
  selection: null, edgeHi: false,
  ghostOn: false, hintReadyAt: 0,   // hint system: ghost overlay + place-a-piece (60s cooldown)
  paused: false, confetti: null,
  pointers: new Map(), gesture: null, downInfo: null,
  saveTimer: 0,
  tableTheme: 'cardboard', _pats: {},
  /* feel state (transient — never saved) */
  snapFx: [],        // active connect pops: {ids, set, t0}
  dust: null,        // pooled gold-dust particles
  dustOn: false,
  glide: null,       // active scatter glide: {list:[{p,fx,fy,tx,ty}], t0}
  carry: null,       // group being carried: {gid, t0} (pickup lift)
  settle: null,      // group settling after a plain drop: {gid, t0}

  TABLE_THEMES: [
    { id: 'cardboard', name: 'Cardboard', css: '#9c8a6c' },
    { id: 'walnut', name: 'Walnut', css: '#4a3220' },
    { id: 'felt', name: 'Felt', css: '#1e4d3a' }
  ],

  init: function () {
    this.canvas = $('#board');
    this.ctx = this.canvas.getContext('2d');
    try {
      var t = localStorage.getItem('pdawg-table');
      if (t) this.tableTheme = t;
    } catch (e) {}
    var hc = document.createElement('canvas');
    hc.width = 1; hc.height = 1;
    this.hitCtx = hc.getContext('2d');
    this.bindInput();
    window.addEventListener('resize', this.resize.bind(this));
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) Game.saveNow();
    });
    window.addEventListener('pagehide', function () { Game.saveNow(); });
  },

  resize: function () {
    var wrap = $('#game');
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    // Size the canvas to its flex-allocated box: container minus the
    // topbar and toolbar. (Measuring #game alone and forcing the canvas
    // to that height overflows the flex column and pushes the toolbar
    // below the fold on desktop.)
    var topbar = wrap.querySelector('.topbar');
    var toolbar = wrap.querySelector('.toolbar');
    var tray = document.getElementById('tray');
    var chromeH = (topbar ? topbar.offsetHeight : 0) + (toolbar ? toolbar.offsetHeight : 0) +
      (tray && tray.style.display !== 'none' ? tray.offsetHeight : 0);
    this.cw = wrap.clientWidth;
    this.ch = Math.max(50, wrap.clientHeight - chromeH);
    this.canvas.width = Math.round(this.cw * this.dpr);
    this.canvas.height = Math.round(this.ch * this.dpr);
    this.canvas.style.width = this.cw + 'px';
    this.canvas.style.height = this.ch + 'px';
    var r = this.canvas.getBoundingClientRect();
    this._rectL = r.left; this._rectT = r.top;
    this.dirty = true;
  },

  setTheme: function (id) {
    this.tableTheme = id;
    try { localStorage.setItem('pdawg-table', id); } catch (e) {}
    this.markDirty();
  },

  /* Seeded, tileable table texture per theme (built once, reused). */
  tablePattern: function (theme) {
    if (this._pats[theme]) return this._pats[theme];
    var cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    var c = cv.getContext('2d');
    var rng = mulberry32(hashStr('table:' + theme));
    var i, x, y;
    if (theme === 'walnut') {
      c.fillStyle = '#4a3220'; c.fillRect(0, 0, 256, 256);
      for (i = 0; i < 46; i++) {           /* wood grain */
        c.strokeStyle = 'rgba(20,10,4,' + (0.10 + rng() * 0.16).toFixed(2) + ')';
        c.lineWidth = 1 + rng() * 2.2;
        c.beginPath();
        y = rng() * 256;
        c.moveTo(0, y);
        for (x = 0; x <= 256; x += 32) c.lineTo(x, y + Math.sin(x * 0.05 + rng() * 6) * 4);
        c.stroke();
      }
      for (i = 0; i < 200; i++) {
        c.fillStyle = 'rgba(255,220,170,' + (rng() * 0.05).toFixed(3) + ')';
        c.fillRect(rng() * 256, rng() * 256, 2, 2);
      }
    } else if (theme === 'felt') {
      c.fillStyle = '#1e4d3a'; c.fillRect(0, 0, 256, 256);
      for (i = 0; i < 2600; i++) {          /* felt nap */
        var v = rng();
        c.fillStyle = v < 0.5 ? 'rgba(0,0,0,' + (rng() * 0.14).toFixed(3) + ')'
                              : 'rgba(180,255,210,' + (rng() * 0.06).toFixed(3) + ')';
        c.fillRect(rng() * 256, rng() * 256, 1.6, 1.6);
      }
    } else {                                /* cardboard — like a real puzzle table */
      c.fillStyle = '#9c8a6c'; c.fillRect(0, 0, 256, 256);
      for (i = 0; i < 34; i++) {            /* fluting shadows */
        c.strokeStyle = 'rgba(60,45,25,' + (0.05 + rng() * 0.08).toFixed(2) + ')';
        c.lineWidth = 2 + rng() * 5;
        c.beginPath();
        x = rng() * 256;
        c.moveTo(x, 0); c.lineTo(x + (rng() - 0.5) * 24, 256);
        c.stroke();
      }
      for (i = 0; i < 900; i++) {           /* paper flecks */
        c.fillStyle = rng() < 0.6 ? 'rgba(70,55,35,' + (rng() * 0.12).toFixed(3) + ')'
                                  : 'rgba(255,245,225,' + (rng() * 0.10).toFixed(3) + ')';
        c.fillRect(rng() * 256, rng() * 256, 1 + rng() * 2, 1 + rng() * 2);
      }
    }
    var pat = this.ctx.createPattern(cv, 'repeat');
    this._pats[theme] = pat;
    return pat;
  },

  fitBoard: function () {
    var S = this.S;
    if (!S) return;
    var s = Math.min(this.cw / S.boardW, this.ch / S.boardH) * 0.985;
    this.cam.s = s;
    this.cam.x = S.boardW / 2;
    this.cam.y = S.boardH / 2;
    this.dirty = true;
  },

  /* Opening frame: the PUZZLE fills the view with a working rim of table
   * around it — like sitting down at the table, not surveying it from the
   * doorway. fitBoard (the Fit button) still shows the whole field. */
  framePuzzle: function () {
    var S = this.S;
    if (!S) return;
    var s = Math.min(this.cw / (S.imgW * 1.22), this.ch / (S.imgH * 1.22));
    this.cam.s = clamp(s, this.minZoom(), this.maxZoom());
    this.cam.x = S.boardW / 2;
    this.cam.y = S.boardH / 2;
    this.clampCam();
    this.dirty = true;
  },

  toBoard: function (sx, sy) {
    // sx/sy are viewport (client) coords: subtract the canvas's own
    // viewport offset first (topbar sits above the canvas).
    return {
      x: this.cam.x + (sx - (this._rectL || 0) - this.cw / 2) / this.cam.s,
      y: this.cam.y + (sy - (this._rectT || 0) - this.ch / 2) / this.cam.s
    };
  },

  start: function (S, imgCanvas) {
    this.S = S;
    this.imgCanvas = imgCanvas;
    var rc = renderPieceCanvases(S, imgCanvas);
    this.pieceCv = rc.canvases;
    this.piecePaths = rc.paths;
    this.selection = null;
    this.paused = false;
    this.confetti = null;
    this.edgeHi = false;
    this.ghostOn = false;
    this.hintReadyAt = 0;
    this.tray = { open: false };
    this.snapFx = [];
    this.carry = null;
    this.settle = null;
    this.glide = null;
    // warm the gold-dust pool once (zero per-frame allocation afterwards)
    if (!this.dust) {
      this.dust = [];
      for (var i = 0; i < FEEL.dustPool; i++) {
        this.dust.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, col: 0 });
      }
    } else {
      for (var j = 0; j < this.dust.length; j++) this.dust[j].on = false;
    }
    this.dustOn = false;
    $('#edgeBtn').classList.remove('on');
    $('#ghostBtn').classList.remove('on');
    this.updateRotateBtn();
    // tray is session-only: always start closed
    this.tray = { open: false };
    var trayEl = $('#tray');
    if (trayEl) { trayEl.style.display = 'none'; $('#trayRow').innerHTML = ''; }
    this.updateHintBtn();
    // mystery mode: no peeking — hide preview + ghost
    var mys = !!S.mystery;
    $('#previewBtn').style.display = mys ? 'none' : '';
    $('#ghostBtn').style.display = mys ? 'none' : '';
    this.resize();
    this.framePuzzle();
    this.dealIn(S);
    this.lastT = performance.now();
    $('#timer').textContent = fmtTime(S.elapsed);
    $('#puzzleTitle').textContent = S.title;
    cancelAnimationFrame(this.raf);
    if (this._saveIv) clearInterval(this._saveIv);
    // safety net: save every 10s during active play, even without changes
    var selfIv = this;
    this._saveIv = setInterval(function () {
      if (selfIv.S && !selfIv.S.won) selfIv.saveNow();
    }, 10000);
    var self = this;
    function loop(t) {
      self.frame(t);
      self.raf = requestAnimationFrame(loop);
    }
    this.raf = requestAnimationFrame(loop);
    this.markDirty();
    this.updateProgress();
  },

  stop: function () {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this._saveIv) { clearInterval(this._saveIv); this._saveIv = 0; }
    this.saveNow();
    this.S = null;
  },

  markDirty: function () { this.dirty = true; },

  frame: function (t) {
    var dt = t - this.lastT;
    this.lastT = t;
    var S = this.S;
    if (S && !this.paused && !S.won) {
      S.elapsed += dt;
      if (!this._tick || t - this._tick > 500) {
        this._tick = t;
        // perf: only touch the DOM when the displayed value actually changes
        var tt = fmtTime(S.elapsed);
        if (tt !== this._lastTimerTxt) { this._lastTimerTxt = tt; $('#timer').textContent = tt; }
        this.updateHintBtn();
      }
    }
    if (this.confetti) this.updateConfetti(dt);
    if (this.dustOn) this.updateDust(dt);
    if (this.glide) this.updateGlide(t);
    this.pruneSnapFx();
    if (this.settle && t - this.settle.t0 > FEEL.settleMs + 40) this.settle = null;
    // feel animations need continuous frames while alive
    if (this.confetti || this.dustOn || this.glide || this.snapFx.length || this.carry || this.settle) this.markDirty();
    if (this.dirty) { this.draw(); this.dirty = false; }
    else if (this.confetti || this.dustOn) { this.draw(); }
  },

  /* Eased glide: pieces float to their new spots instead of jumping.
   * Entries may carry d (delay ms) and dur (own duration) for staggers;
   * plain entries behave exactly as the original scatter glide. */
  updateGlide: function (t) {
    var g = this.glide;
    if (!g) return;
    var gt = t - g.t0, done = true, L = g.list;
    for (var i = 0; i < L.length; i++) {
      var m = L[i];
      var d = m.d || 0, dur = m.dur || FEEL.scatterMs;
      var lt = (gt - d) / dur;
      if (lt < 1) done = false;
      var k = easeOutCubic(lt < 0 ? 0 : lt > 1 ? 1 : lt);
      m.p.x = m.fx + (m.tx - m.fx) * k;
      m.p.y = m.fy + (m.ty - m.fy) * k;
    }
    if (done) { this.glide = null; this.saveNow(); }
    this.markDirty();
  },

  /* The deal: a fresh puzzle's pieces start as a stack at the puzzle's
   * heart and fan out to their scatter spots, staggered like a hand
   * dealing cards. Resumed games open exactly as they were saved. */
  dealIn: function (S) {
    if (!S || S.won || S.elapsed > 50) return;
    var i, p;
    for (i = 0; i < S.pieces.length; i++) if (S.pieces[i].placed) return;
    if (reduceMotion()) return;
    var rng = mulberry32((S.seed ^ 0xDEA1) >>> 0);
    var cx = S.boardW / 2 - S.cellW / 2, cy = S.boardH / 2 - S.cellH / 2;
    var order = S.pieces.slice();
    for (var a = order.length - 1; a > 0; a--) {
      var b = (rng() * (a + 1)) | 0, t = order[a]; order[a] = order[b]; order[b] = t;
    }
    var list = [];
    for (var k = 0; k < order.length; k++) {
      p = order[k];
      if (p.inTray) continue;
      var fx = cx + (rng() - 0.5) * S.cellW * 0.9;
      var fy = cy + (rng() - 0.5) * S.cellH * 0.9;
      list.push({ p: p, fx: fx, fy: fy, tx: p.x, ty: p.y,
                  d: Math.min(k * 3, 1000), dur: 640 });
      p.x = fx; p.y = fy;
    }
    if (list.length) {
      this.glide = { list: list, t0: performance.now() };
      this.markDirty();
    }
  },

  draw: function () {
    var S = this.S, ctx = this.ctx;
    if (!S) return;
    var dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.cw, this.ch);
    // the room around the table: warm dark, faintly lit from above
    if (!this._voidG || this._voidW !== this.cw || this._voidH !== this.ch) {
      var vg0 = ctx.createRadialGradient(
        this.cw / 2, this.ch * 0.38, Math.min(this.cw, this.ch) * 0.2,
        this.cw / 2, this.ch * 0.5, Math.max(this.cw, this.ch) * 0.85);
      vg0.addColorStop(0, '#262019');
      vg0.addColorStop(1, '#0e0c10');
      this._voidG = vg0; this._voidW = this.cw; this._voidH = this.ch;
    }
    ctx.fillStyle = this._voidG;
    ctx.fillRect(0, 0, this.cw, this.ch);
    var s = this.cam.s;
    ctx.setTransform(dpr * s, 0, 0, dpr * s,
      dpr * (this.cw / 2 - this.cam.x * s),
      dpr * (this.ch / 2 - this.cam.y * s));
    // board backdrop: puzzle-table theme
    var pat = this.tablePattern(this.tableTheme);
    ctx.fillStyle = pat || '#1c1f2b';
    ctx.fillRect(0, 0, S.boardW, S.boardH);
    // a pool of warm light resting on the puzzle itself
    var pool = ctx.createRadialGradient(
      S.boardW / 2, S.boardH / 2, Math.min(S.imgW, S.imgH) * 0.2,
      S.boardW / 2, S.boardH / 2, Math.max(S.imgW, S.imgH) * 0.85);
    pool.addColorStop(0, 'rgba(255,238,205,0.08)');
    pool.addColorStop(1, 'rgba(255,238,205,0)');
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, S.boardW, S.boardH);
    // soft vignette so the table feels lit from above
    var vg = ctx.createRadialGradient(
      S.boardW / 2, S.boardH / 2, Math.min(S.boardW, S.boardH) * 0.35,
      S.boardW / 2, S.boardH / 2, Math.max(S.boardW, S.boardH) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, S.boardW, S.boardH);
    // the board well: the puzzle sits IN the table, not on it — a recessed
    // panel, shadow pooled along its upper edges, light on its lower lip
    var D = 16 / s;
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(S.imgOX, S.imgOY, S.imgW, S.imgH);
    var shT = ctx.createLinearGradient(0, S.imgOY, 0, S.imgOY + D);
    shT.addColorStop(0, 'rgba(0,0,0,0.34)'); shT.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shT; ctx.fillRect(S.imgOX, S.imgOY, S.imgW, D);
    var shL = ctx.createLinearGradient(S.imgOX, 0, S.imgOX + D, 0);
    shL.addColorStop(0, 'rgba(0,0,0,0.26)'); shL.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shL; ctx.fillRect(S.imgOX, S.imgOY, D, S.imgH);
    var shB = ctx.createLinearGradient(0, S.imgOY + S.imgH, 0, S.imgOY + S.imgH - D);
    shB.addColorStop(0, 'rgba(0,0,0,0.18)'); shB.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shB; ctx.fillRect(S.imgOX, S.imgOY + S.imgH - D, S.imgW, D);
    var shR = ctx.createLinearGradient(S.imgOX + S.imgW, 0, S.imgOX + S.imgW - D, 0);
    shR.addColorStop(0, 'rgba(0,0,0,0.12)'); shR.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shR; ctx.fillRect(S.imgOX + S.imgW - D, S.imgOY, D, S.imgH);
    ctx.strokeStyle = 'rgba(0,0,0,0.38)';
    ctx.lineWidth = 1.6 / s;
    ctx.strokeRect(S.imgOX, S.imgOY, S.imgW, S.imgH);
    ctx.strokeStyle = 'rgba(255,246,225,0.13)';
    ctx.lineWidth = 1.2 / s;
    ctx.beginPath();
    ctx.moveTo(S.imgOX, S.imgOY + S.imgH + 1.6 / s);
    ctx.lineTo(S.imgOX + S.imgW, S.imgOY + S.imgH + 1.6 / s);
    ctx.moveTo(S.imgOX + S.imgW + 1.6 / s, S.imgOY);
    ctx.lineTo(S.imgOX + S.imgW + 1.6 / s, S.imgOY + S.imgH);
    ctx.stroke();
    // ghost hint: faint full image behind the pieces (never in mystery mode)
    if (this.ghostOn && !S.mystery && this.imgCanvas) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.drawImage(this.imgCanvas, S.imgOX, S.imgOY, S.imgW, S.imgH);
      ctx.restore();
    }
    // placed pieces first
    var i, p;
    for (i = 0; i < S.pieces.length; i++) {
      p = S.pieces[i];
      if (p.placed && !p.inTray) this.drawPiece(p, false);
    }
    // loose groups in z-order
    for (i = 0; i < S.zorder.length; i++) {
      var gidL = S.zorder[i];
      var members = groupMembers(S, gidL);
      // magnetic preview under the carried group, before it draws
      if (this.gesture && this.gesture.type === 'drag' && this.gesture.gid === gidL &&
          this.gesture.probe && !reduceMotion()) {
        this.drawGhost(this.gesture.probe);
      }
      var lift = this.liftFor(gidL);
      if (lift > 0.001) {
        // the carried group floats: a soft shadow pools beneath it, deeper
        // as it rises, and the group swells slightly toward the player
        var bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
        for (var q = 0; q < members.length; q++) {
          if (members[q].inTray) continue;
          bx0 = Math.min(bx0, members[q].x); by0 = Math.min(by0, members[q].y);
          bx1 = Math.max(bx1, members[q].x + S.cellW); by1 = Math.max(by1, members[q].y + S.cellH);
        }
        if (bx1 > bx0) {
          var gcx = (bx0 + bx1) / 2, gcy = (by0 + by1) / 2;
          ctx.save();
          ctx.translate(gcx, gcy + (5 + 13 * lift) / s);
          ctx.scale(1, Math.max(0.2, (by1 - by0) / (bx1 - bx0)));
          var shg = ctx.createRadialGradient(0, 0, 0, 0, 0, (bx1 - bx0) / 2);
          shg.addColorStop(0, 'rgba(10,6,3,' + (0.34 * lift).toFixed(3) + ')');
          shg.addColorStop(1, 'rgba(10,6,3,0)');
          ctx.fillStyle = shg;
          ctx.beginPath(); ctx.arc(0, 0, (bx1 - bx0) / 2, 0, 6.2832); ctx.fill();
          ctx.restore();
          ctx.save();
          ctx.translate(gcx, gcy);
          var ks = 1 + FEEL.carryScale * lift;
          ctx.scale(ks, ks);
          ctx.translate(-gcx, -gcy);
        } else {
          lift = 0;
        }
      }
      for (var j = 0; j < members.length; j++) {
        if (members[j].inTray) continue;
        var dim = this.edgeHi && !isEdgePiece(members[j], S);
        this.drawPiece(members[j], dim);
      }
      if (lift > 0.001) ctx.restore();
    }
    // gold-dust sparkles (board space)
    this.drawDust();
    // selection highlight (the carry lift replaces it mid-drag)
    if (this.selection && S.groups[this.selection] &&
        !(this.gesture && this.gesture.type === 'drag')) {
      var ms = groupMembers(S, this.selection);
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (var k = 0; k < ms.length; k++) {
        x0 = Math.min(x0, ms[k].x - S.margin); y0 = Math.min(y0, ms[k].y - S.margin);
        x1 = Math.max(x1, ms[k].x + S.cellW + S.margin); y1 = Math.max(y1, ms[k].y + S.cellH + S.margin);
      }
      ctx.save();
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 3 / s;
      ctx.setLineDash([10 / s, 7 / s]);
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.restore();
    }
    // confetti (screen space)
    if (this.confetti) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var ps = this.confetti;
      for (var cI = 0; cI < ps.length; cI++) {
        var pt = ps[cI];
        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(pt.rot);
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = Math.max(0, pt.life);
        ctx.fillRect(-4, -2.5, 8, 5);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  },

  drawPiece: function (p, dim) {
    var S = this.S;
    var cv = this.pieceCv[p.id];
    var M = S.margin;
    var cx = p.x + S.cellW / 2, cy = p.y + S.cellH / 2;
    var ctx = this.ctx;
    ctx.save();
    if (dim) ctx.globalAlpha = 0.32;
    ctx.translate(cx, cy);
    if (p.rot) ctx.rotate(p.rot * Math.PI / 180);
    // magnetic chunk: the connect pop scales the piece about its center
    var sc = this.snapScaleFor(p.id);
    if (sc !== 1) ctx.scale(sc, sc);
    ctx.drawImage(cv, -(S.cellW / 2 + M), -(S.cellH / 2 + M), S.cellW + 2 * M, S.cellH + 2 * M);
    ctx.restore();
  },

  updateConfetti: function (dt) {
    var ps = this.confetti, alive = false;
    var cols = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#f78c6b', '#ffffff'];
    if (!this._confInit) {
      this._confInit = true;
      for (var i = 0; i < 160; i++) {
        ps.push({
          x: Math.random() * this.cw, y: -20 - Math.random() * this.ch * 0.5,
          vx: (Math.random() - 0.5) * 120, vy: 120 + Math.random() * 220,
          rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 10,
          color: cols[(Math.random() * cols.length) | 0], life: 1
        });
      }
    }
    for (var j = 0; j < ps.length; j++) {
      var p = ps[j];
      p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000;
      p.rot += p.vr * dt / 1000;
      if (p.y > this.ch + 30) p.life -= dt / 800;
      if (p.life > 0) alive = true;
    }
    if (!alive) { this.confetti = null; this._confInit = false; }
    this.dirty = true;
  },

  updateProgress: function () {
    var S = this.S;
    if (!S) return;
    var n = placedCount(S), total = S.pieces.length;
    var txt = n + ' / ' + total + '  (' + Math.round(n / total * 100) + '%)';
    var elp = $('#prog');
    if (elp && txt !== this._lastProgTxt) {
      this._lastProgTxt = txt;
      elp.textContent = txt;
      if (!reduceMotion()) {
        // warm little pop on every connect — re-trigger the CSS animation
        elp.classList.remove('pop');
        void elp.offsetWidth;
        elp.classList.add('pop');
      }
    }
  },

  /* Carry lift 0..1 for a group: eases up on pickup, settles back down
   * after a plain drop. Snaps and merges hand off to the snap pop. */
  liftFor: function (gid) {
    if (reduceMotion()) return 0;
    var now = performance.now(), v = 0, e;
    if (this.carry && this.carry.gid === gid) {
      e = Math.min(1, (now - this.carry.t0) / FEEL.carryMs);
      v = Math.max(v, easeOutCubic(e));
    }
    if (this.settle && this.settle.gid === gid) {
      e = Math.min(1, (now - this.settle.t0) / FEEL.settleMs);
      v = Math.max(v, 1 - easeOutCubic(e));
    }
    return v;
  },

  /* The magnetic ghost: every piece this drop would move, glowing at its
   * exact landing spot — probeDrop ran the real snap logic on a clone, so
   * the preview can never promise a snap that wouldn't happen. */
  drawGhost: function (probe) {
    var S = this.S, ctx = this.ctx, M = S.margin;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.shadowColor = 'rgba(255,209,102,0.95)';
    ctx.shadowBlur = 13 / this.cam.s;
    for (var i = 0; i < probe.changes.length; i++) {
      var ch = probe.changes[i], p = ch.p;
      ctx.save();
      ctx.translate(ch.x + S.cellW / 2, ch.y + S.cellH / 2);
      if (p.rot) ctx.rotate(p.rot * Math.PI / 180);
      ctx.drawImage(this.pieceCv[p.id], -(S.cellW / 2 + M), -(S.cellH / 2 + M), S.cellW + 2 * M, S.cellH + 2 * M);
      ctx.drawImage(this.pieceCv[p.id], -(S.cellW / 2 + M), -(S.cellH / 2 + M), S.cellW + 2 * M, S.cellH + 2 * M);
      ctx.restore();
    }
    ctx.restore();
  },

  /* ---- feel: magnetic snap pop + gold dust ---- */
  snapPop: function (ids, cx, cy) {
    if (!ids || !ids.length || reduceMotion()) return;
    var set = {};
    for (var i = 0; i < ids.length; i++) set[ids[i]] = 1;
    this.snapFx.push({ set: set, t0: performance.now() });
    this.spawnDust(cx, cy, FEEL.dustCount);
    this.markDirty();
  },

  snapScaleFor: function (id) {
    var fx = this.snapFx;
    if (!fx.length) return 1;
    var now = performance.now(), best = 1;
    for (var i = 0; i < fx.length; i++) {
      var e = fx[i];
      if (!e.set[id]) continue;
      var t = (now - e.t0) / FEEL.snapPopMs;
      if (t >= 1) continue;
      var s = snapCurve(t < 0 ? 0 : t);
      if (s > best) best = s;
    }
    return best;
  },

  pruneSnapFx: function () {
    var fx = this.snapFx;
    if (!fx.length) return;
    var now = performance.now(), kept = [];
    for (var i = 0; i < fx.length; i++) {
      if (now - fx[i].t0 < FEEL.snapPopMs + 50) kept.push(fx[i]);
    }
    this.snapFx = kept;
  },

  /* Gold dust: warm, soft, paper-craft — never neon. Pooled, zero alloc. */
  spawnDust: function (bx, by, count) {
    if (!this.dust || reduceMotion()) return;
    var cols = 4, placed = 0;
    for (var i = 0; i < this.dust.length && placed < count; i++) {
      var d = this.dust[i];
      if (d.on) continue;
      var a = Math.random() * 6.283, sp = 40 + Math.random() * 130;
      d.on = true;
      d.x = bx; d.y = by;
      d.vx = Math.cos(a) * sp; d.vy = Math.sin(a) * sp - 70;
      d.max = d.life = FEEL.dustMs * (0.7 + Math.random() * 0.6);
      d.size = 2 + Math.random() * 3.5;
      d.col = (Math.random() * cols) | 0;
      placed++;
    }
    if (placed) this.dustOn = true;
  },

  updateDust: function (dt) {
    if (!this.dustOn) return;
    var alive = false, s = dt / 1000;
    for (var i = 0; i < this.dust.length; i++) {
      var d = this.dust[i];
      if (!d.on) continue;
      d.life -= dt;
      if (d.life <= 0) { d.on = false; continue; }
      alive = true;
      d.x += d.vx * s; d.y += d.vy * s;
      d.vx *= (1 - 2.4 * s); d.vy *= (1 - 2.4 * s);
      d.vy -= 34 * s;   // gentle float upward, like dust in lamplight
    }
    this.dustOn = alive;
    if (alive) this.markDirty();
  },

  drawDust: function () {
    if (!this.dustOn) return;
    var ctx = this.ctx;
    var cols = ['#ffd166', '#f6c453', '#ffe8a3', '#f4a259'];
    ctx.save();
    for (var i = 0; i < this.dust.length; i++) {
      var d = this.dust[i];
      if (!d.on) continue;
      var k = d.life / d.max;
      ctx.globalAlpha = k < 0.6 ? k / 0.6 : 1;
      ctx.fillStyle = cols[d.col];
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size * (0.5 + 0.5 * k), 0, 6.283);
      ctx.fill();
    }
    ctx.restore();
  }
};

/* ---------------- input: drag / pan / pinch / tap ---------------- */
Game.bindInput = function () {
  var cv = this.canvas, self = this;
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', function (e) { self.onDown(e); });
  cv.addEventListener('pointermove', function (e) { self.onMove(e); });
  cv.addEventListener('pointerup', function (e) { self.onUp(e); });
  cv.addEventListener('pointercancel', function (e) { self.onUp(e); });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  // double-tap detection
  cv.addEventListener('pointerdown', function (e) {
    var now = performance.now();
    if (self._lastTap && now - self._lastTap.t < 350 &&
        Math.hypot(e.clientX - self._lastTap.x, e.clientY - self._lastTap.y) < 28) {
      self.onDoubleTap(e);
      self._lastTap = null;
    }
  });
};

Game.hitTest = function (bx, by) {
  var S = this.S;
  if (!S) return null;
  var M = S.margin;
  for (var i = S.zorder.length - 1; i >= 0; i--) {
    var members = groupMembers(S, S.zorder[i]);
    for (var j = members.length - 1; j >= 0; j--) {
      var p = members[j];
      if (p.inTray) continue;
      var lx = bx - (p.x - M), ly = by - (p.y - M);
      if (p.rot) {
        var cx = M + S.cellW / 2, cy = M + S.cellH / 2;
        var a = -p.rot * Math.PI / 180;
        var dx = lx - cx, dy = ly - cy;
        lx = cx + dx * Math.cos(a) - dy * Math.sin(a);
        ly = cy + dx * Math.sin(a) + dy * Math.cos(a);
      }
      if (lx < -2 || ly < -2 || lx > S.cellW + 2 * M + 2 || ly > S.cellH + 2 * M + 2) continue;
      this.hitCtx.setTransform(1, 0, 0, 1, 0, 0);
      if (this.hitCtx.isPointInPath(this.piecePaths[p.id], lx, ly)) return p;
    }
  }
  return null;
};

Game.onDown = function (e) {
  if (!this.S || this.paused || this.S.won || this.glide) return;
  e.preventDefault();
  try { this.canvas.setPointerCapture(e.pointerId); } catch (err) {}
  this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  var now = performance.now();
  this.downInfo = { x: e.clientX, y: e.clientY, t: now, moved: false, tapDone: false };
  if (this.pointers.size === 2) {
    // switch to pinch
    this.carry = null;
    var pts = Array.from(this.pointers.values());
    var b0 = this.toBoard(pts[0].x, pts[0].y), b1 = this.toBoard(pts[1].x, pts[1].y);
    this.gesture = {
      type: 'pinch',
      d0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
      s0: this.cam.s,
      mx: (pts[0].x + pts[1].x) / 2, my: (pts[0].y + pts[1].y) / 2,
      bx: (b0.x + b1.x) / 2, by: (b0.y + b1.y) / 2
    };
    return;
  }
  if (this.pointers.size > 2) return;
  // refresh the canvas viewport offset: iOS Safari's toolbar can shift
  // layout without a resize event between touches.
  var rc = this.canvas.getBoundingClientRect();
  this._rectL = rc.left; this._rectT = rc.top;
  var b = this.toBoard(e.clientX, e.clientY);
  var hit = this.hitTest(b.x, b.y);
  if (!hit && e.pointerType === 'touch') {
    // fat-finger retry: probe a small ring around the touch point so
    // near-misses on small pieces still pick something up.
    var slop = 10 / this.cam.s, k, o;
    var ring = [[slop, 0], [-slop, 0], [0, slop], [0, -slop],
                [slop, slop], [-slop, -slop], [slop, -slop], [-slop, slop]];
    for (k = 0; k < ring.length && !hit; k++) {
      o = ring[k];
      hit = this.hitTest(b.x + o[0], b.y + o[1]);
    }
  }
  if (hit) {
    var gid = hit.gid;
    // bring to front
    var S = this.S;
    S.zorder = S.zorder.filter(function (g) { return g !== gid; });
    S.zorder.push(gid);
    var members = groupMembers(S, gid);
    this.gesture = {
      type: 'drag', gid: gid,
      startBX: b.x, startBY: b.y,
      orig: members.map(function (p) { return { p: p, x: p.x, y: p.y }; })
    };
    this.selection = gid;
    this.carry = { gid: gid, t0: now };
    this.updateRotateBtn();
    sfx('pickup');
  } else {
    this.gesture = {
      type: 'pan',
      startX: e.clientX, startY: e.clientY,
      camX: this.cam.x, camY: this.cam.y
    };
  }
  this.markDirty();
};

Game.onMove = function (e) {
  if (!this.pointers.has(e.pointerId)) return;
  this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  var g = this.gesture;
  if (this.downInfo && Math.hypot(e.clientX - this.downInfo.x, e.clientY - this.downInfo.y) > 10) {
    this.downInfo.moved = true;
  }
  if (!g) return;
  if (g.type === 'drag') {
    var b = this.toBoard(e.clientX, e.clientY);
    var dx = b.x - g.startBX, dy = b.y - g.startBY;
    for (var i = 0; i < g.orig.length; i++) {
      var o = g.orig[i];
      o.p.x = clamp(o.x + dx, -this.S.cellW * 0.4, this.S.boardW - this.S.cellW * 0.6);
      o.p.y = clamp(o.y + dy, -this.S.cellH * 0.4, this.S.boardH - this.S.cellH * 0.6);
    }
    // exact magnetic preview for this position (real drags only, not taps)
    g.probe = (this.downInfo && this.downInfo.moved) ? probeDrop(this.S, g.gid) : null;
    this.markDirty();
  } else if (g.type === 'pan') {
    this.cam.x = g.camX - (e.clientX - g.startX) / this.cam.s;
    this.cam.y = g.camY - (e.clientY - g.startY) / this.cam.s;
    this.clampCam();
    this.markDirty();
  } else if (g.type === 'pinch' && this.pointers.size >= 2) {
    var pts = Array.from(this.pointers.values());
    var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
    var ns = clamp(g.s0 * d / g.d0, this.minZoom(), this.maxZoom());
    var mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
    // keep the original midpoint's board point under the fingers
    this.cam.s = ns;
    this.cam.x = g.bx - (mx - this.cw / 2) / ns;
    this.cam.y = g.by - (my - this.ch / 2) / ns;
    this.clampCam();
    this.markDirty();
  }
};

Game.minZoom = function () {
  var S = this.S;
  return Math.min(this.cw / S.boardW, this.ch / S.boardH) * 0.7;
};
Game.maxZoom = function () {
  var S = this.S;
  return Math.max(2.2, 900 / Math.min(S.cellW, S.cellH));
};
Game.clampCam = function () {
  var S = this.S;
  this.cam.s = clamp(this.cam.s, this.minZoom(), this.maxZoom());
  var vw = this.cw / this.cam.s / 2, vh = this.ch / this.cam.s / 2;
  this.cam.x = clamp(this.cam.x, -vw * 0.4, S.boardW + vw * 0.4);
  this.cam.y = clamp(this.cam.y, -vh * 0.4, S.boardH + vh * 0.4);
};

Game.onUp = function (e) {
  var g = this.gesture;
  // Tap detection, forgiving edition: a press that barely wanders counts as a
  // tap no matter how long it was held. The strict quick-tap (<350ms, <10px)
  // keeps its old meaning for double-tap arming; a slow-but-steady press on
  // empty board space still means "put the selected piece here".
  var drift = 1e9, pressMs = 1e9;
  if (this.downInfo) {
    drift = Math.hypot(e.clientX - this.downInfo.x, e.clientY - this.downInfo.y);
    pressMs = performance.now() - this.downInfo.t;
  }
  var wasTap = this.downInfo && !this.downInfo.moved &&
    pressMs < 350 && this.pointers.size === 1;
  var tapLike = this.downInfo && this.pointers.size === 1 && drift <= 24;
  this.pointers.delete(e.pointerId);
  if (g && g.type === 'drag' && this.pointers.size === 0) {
    var res = resolveDrop(this.S, g.gid);
    if (res.merged || res.placed) {
      this.updateProgress();
      if (res.placed) this.checkWin();
    }
    // carry handoff: a snap or merge celebrates through the pop; a plain
    // drop settles back down through the lift instead of just stopping
    if (res.merged || res.placed) {
      this.carry = null;
    } else if (this.carry && this.carry.gid === g.gid) {
      if (this.downInfo && this.downInfo.moved) {
        this.settle = { gid: g.gid, t0: performance.now() };
      }
      this.carry = null;
    }
    // A real drag ends with the piece let go; a tap just selects it.
    if (this.downInfo && this.downInfo.moved) {
      this.selection = null;
      this.updateRotateBtn();
    }
    this.scheduleSave();
    this.markDirty();
  }
  if (this.pointers.size === 0) {
    if (g && (wasTap || tapLike)) this.onTap(e, g, wasTap);
    this.gesture = null;
  } else if (this.pointers.size === 1 && g && g.type === 'pinch') {
    // pinch ended with one finger left: start fresh pan on next move
    var pts = Array.from(this.pointers.values());
    this.gesture = {
      type: 'pan', startX: pts[0].x, startY: pts[0].y,
      camX: this.cam.x, camY: this.cam.y
    };
  }
  this.downInfo = null;
};

Game.onTap = function (e, g, quick) {
  var S = this.S;
  if (!S || this._dblFired) { this._dblFired = false; return; }
  // Only quick taps arm double-tap-to-rotate; slow "put it here" taps don't.
  if (quick) this._lastTap = { x: e.clientX, y: e.clientY, t: performance.now() };
  var b = this.toBoard(e.clientX, e.clientY);
  if (g.type === 'drag') {
    // tapped a piece: select it (already set on down)
    this.markDirty();
  } else {
    // tapped empty space: move selection there, or deselect
    if (this.selection && S.groups[this.selection]) {
      var members = groupMembers(S, this.selection);
      var cx = 0, cy = 0;
      for (var i = 0; i < members.length; i++) {
        cx += members[i].x + S.cellW / 2; cy += members[i].y + S.cellH / 2;
      }
      cx /= members.length; cy /= members.length;
      var dx = clamp(b.x, 0, S.boardW) - cx, dy = clamp(b.y, 0, S.boardH) - cy;
      for (var j = 0; j < members.length; j++) {
        members[j].x = clamp(members[j].x + dx, -S.cellW * 0.4, S.boardW - S.cellW * 0.6);
        members[j].y = clamp(members[j].y + dy, -S.cellH * 0.4, S.boardH - S.cellH * 0.6);
      }
      var res = resolveDrop(S, this.selection);
      if (res.placed) this.checkWin();
      this.updateProgress();
      this.scheduleSave();
      // put down means let go: the piece stays where it landed and later
      // taps pan the camera instead of dragging it around again.
      this.selection = null;
      this.updateRotateBtn();
    } else {
      this.selection = null;
      this.updateRotateBtn();
    }
    this.markDirty();
  }
};

Game.onDoubleTap = function (e) {
  var S = this.S;
  if (!S || !S.rotationOn || this.paused || S.won) return;
  var b = this.toBoard(e.clientX, e.clientY);
  var hit = this.hitTest(b.x, b.y);
  if (hit) {
    this._dblFired = true;
    this._lastTap = null;
    rotateGroup(S, hit.gid);
    this.scheduleSave();
    this.markDirty();
  }
};

Game.rotateSelection = function () {
  var S = this.S;
  if (!S || !S.rotationOn) return;
  var gid = this.selection && S.groups[this.selection] ? this.selection : null;
  if (!gid) { toast('Tap a piece first, then rotate'); return; }
  rotateGroup(S, gid);
  this.scheduleSave();
  this.markDirty();
};

/* Hint system — free forever, 60s cooldown. */
Game.HINT_CD = 60000;
Game.updateHintBtn = function () {
  var btn = $('#hintBtn');
  if (!btn) return;
  var S = this.S;
  var small = btn.querySelector('small');
  if (!S || S.won) { btn.classList.remove('cooling'); if (small) small.textContent = 'Hint'; return; }
  var remain = this.hintReadyAt - Date.now();
  if (remain > 0) {
    btn.classList.add('cooling');
    if (small) small.textContent = fmtTime(remain).replace(/^0:/, '');
  } else {
    btn.classList.remove('cooling');
    if (small) small.textContent = 'Hint';
  }
};

Game.placeHintPiece = function () {
  var S = this.S;
  if (!S || this.paused || S.won || this.glide) return;
  var remain = this.hintReadyAt - Date.now();
  if (remain > 0) {
    toast('Next hint in ' + Math.ceil(remain / 1000) + 's — free, just a breather');
    return;
  }
  // candidates: unplaced, solo (ungrouped), not in the edge tray
  var cands = [];
  for (var i = 0; i < S.pieces.length; i++) {
    var p = S.pieces[i];
    if (p.placed || p.inTray) continue;
    var g = S.groups[p.gid];
    if (!g || g.length !== 1) continue;
    cands.push(p);
  }
  if (!cands.length) { toast('No loose pieces left to place'); return; }
  var p = cands[(Math.random() * cands.length) | 0];
  // lift it out of its solo group, exactly like a snap placement
  if (this.selection === p.gid) this.selection = null;
  delete S.groups[p.gid];
  S.zorder = S.zorder.filter(function (g) { return g !== p.gid; });
  p.x = trueX(p, S); p.y = trueY(p, S); p.rot = 0; p.placed = true; p.gid = null;
  var cx = p.x + S.cellW / 2, cy = p.y + S.cellH / 2;
  this.snapPop([p.id], cx, cy);
  this.spawnDust(cx, cy, FEEL.dustCount * 2);
  sfx('snap');
  this.hintReadyAt = Date.now() + this.HINT_CD;
  this.updateHintBtn();
  this.updateProgress();
  this.scheduleSave();
  this.checkWin();
  this.markDirty();
  toast('One piece, placed with love');
};

/* ---------------- edge sorting tray ----------------
 * A calm bottom strip that gathers loose edge pieces. Tap a tray piece
 * to bring it back to the board. Session-only: inTray is never saved. */
Game.updateRotateBtn = function () {
  var btn = $('#rotBtn');
  if (!this.S || !this.S.rotationOn) { btn.style.display = 'none'; return; }
  btn.style.display = '';
  btn.classList.toggle('on', !!(this.selection && this.S.groups[this.selection]));
};
Game.toScreen = function (bx, by) {
  return {
    x: (bx - this.cam.x) * this.cam.s + this.cw / 2 + (this._rectL || 0),
    y: (by - this.cam.y) * this.cam.s + this.ch / 2 + (this._rectT || 0)
  };
};

Game.makePieceThumb = function (p, size) {
  var S = this.S;
  var src = this.pieceCv[p.id];
  var cv = document.createElement('canvas');
  var sc = size / src.width;
  cv.width = size; cv.height = Math.max(1, Math.round(src.height * sc));
  cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
  return cv;
};

Game.freeBoardSpot = function (S) {
  // random open spot clear of the central image rect (scatter-style)
  var x, y, tries = 0;
  do {
    x = Math.random() * Math.max(1, S.boardW - S.cellW);
    y = Math.random() * Math.max(1, S.boardH - S.cellH);
    tries++;
  } while (tries < 40 && x > S.imgOX - S.cellW && x < S.imgOX + S.imgW &&
           y > S.imgOY - S.cellH && y < S.imgOY + S.imgH);
  return { x: x, y: y };
};

Game.setTrayOpen = function (open) {
  var S = this.S;
  if (!S || S.won || this.glide) return;
  if (!!this.tray.open === !!open) return;
  this.tray.open = !!open;
  $('#tray').style.display = open ? '' : 'none';
  $('#game').classList.toggle('tray-open', !!open);
  $('#edgeBtn').classList.toggle('on', open);
  this.resize(); // canvas flexes around the tray strip
  if (open) this.trayGather();
  else this.trayReturnAll(true);
  this.markDirty();
};

Game.trayGather = function () {
  var S = this.S, self = this;
  var cands = [];
  for (var i = 0; i < S.pieces.length; i++) {
    var p = S.pieces[i];
    if (p.placed || p.inTray) continue;
    if (!isEdgePiece(p, S)) continue;
    var g = S.groups[p.gid];
    if (!g || g.length !== 1) continue; // never break up a joined group
    cands.push(p);
  }
  if (!cands.length) { this.renderTray(); toast('No loose edge pieces — nice work!'); return; }
  // hide from the canvas at once; the flying thumbs are the visual
  for (var j = 0; j < cands.length; j++) cands[j].inTray = true;
  this.markDirty();
  var trayRect = $('#trayRow').getBoundingClientRect();
  var tx = trayRect.left + 30, ty = trayRect.top + 20;
  cands.forEach(function (p, idx) {
    var sp = self.toScreen(p.x + S.cellW / 2, p.y + S.cellH / 2);
    var fly = self.makePieceThumb(p, 56);
    fly.className = 'tray-fly';
    fly.style.left = Math.round(sp.x - 28) + 'px';
    fly.style.top = Math.round(sp.y - 28) + 'px';
    fly.style.width = '56px';
    document.body.appendChild(fly);
    // stagger slightly, then fly toward the tray
    setTimeout(function () {
      fly.style.left = Math.round(tx + (idx % 8) * 8) + 'px';
      fly.style.top = Math.round(ty) + 'px';
      fly.style.transform = 'scale(.6)';
      fly.style.opacity = '0.4';
      setTimeout(function () { fly.remove(); }, 420);
    }, idx * 35);
  });
  setTimeout(function () { self.renderTray(); self.scheduleSave(); }, cands.length * 35 + 450);
  sfx('scatter');
};

Game.renderTray = function () {
  var row = $('#trayRow');
  if (!row) return;
  row.innerHTML = '';
  var S = this.S, n = 0, self = this;
  if (S) {
    for (var i = 0; i < S.pieces.length; i++) {
      (function (p) {
        if (!p.inTray) return;
        n++;
        var b = document.createElement('button');
        b.className = 'tray-thumb';
        b.setAttribute('aria-label', 'Return edge piece to board');
        b.appendChild(self.makePieceThumb(p, 56));
        b.onclick = function () { self.trayReturn(p); };
        row.appendChild(b);
      })(S.pieces[i]);
    }
  }
  $('#trayLabel').textContent = n ? n + ' edge piece' + (n > 1 ? 's' : '') + ' — tap one to bring it back' : 'Tray is empty';
};

Game.trayReturn = function (p) {
  var S = this.S;
  if (!S || !p.inTray) return;
  p.inTray = false;
  var spot = this.freeBoardSpot(S);
  p.x = spot.x; p.y = spot.y;
  this.spawnDust(p.x + S.cellW / 2, p.y + S.cellH / 2, FEEL.dustCount);
  sfx('pickup');
  this.renderTray();
  this.scheduleSave();
  this.markDirty();
};

Game.trayReturnAll = function (quiet) {
  var S = this.S;
  if (!S) return;
  var n = 0;
  for (var i = 0; i < S.pieces.length; i++) {
    if (S.pieces[i].inTray) {
      var p = S.pieces[i];
      p.inTray = false;
      var spot = this.freeBoardSpot(S);
      p.x = spot.x; p.y = spot.y;
      n++;
    }
  }
  this.renderTray();
  if (n && !quiet) toast(n + ' edge piece' + (n > 1 ? 's' : '') + ' back on the board');
  this.scheduleSave();
  this.markDirty();
};

/* Gallery access that works in browser and Node (tests). */
function getGallery() {
  if (typeof window !== 'undefined' && window.PDAWG_GALLERY) return window.PDAWG_GALLERY;
  if (typeof require !== 'undefined') {
    try { return require('./gallery.js'); } catch (e) { /* ignore */ }
  }
  return null;
}

/* ---------------- persistence + win ---------------- */
Game.scheduleSave = function () {
  clearTimeout(this.saveTimer);
  var self = this;
  this.saveTimer = setTimeout(function () { self.saveNow(); }, 2000);
};

Game.saveNow = function () {
  var S = this.S;
  if (!S) return;
  clearTimeout(this.saveTimer);
  var data = serializeState(S);
  var self = this;
  idb.put('puzzles', data).then(function () {
    var n = placedCount(S), total = S.pieces.length;
    shelf.upsert({
      id: S.id, title: S.title, thumb: S.thumb,
      rows: S.rows, cols: S.cols,
      pct: Math.round(n / total * 100),
      updatedAt: Date.now(), imageKind: S.imageKind, galleryIdx: S.galleryIdx,
      rotationOn: S.rotationOn, done: S.won
    });
    if (typeof UI !== 'undefined') UI.renderShelf();
  }).catch(function () {});
};

Game.bestKey = function () {
  var S = this.S;
  var imgKey = S.imageKind === 'gallery' ? 'g' + S.galleryIdx : (S.imageKind === 'daily' ? 'daily' : 'custom');
  return imgKey + ':' + S.rows + 'x' + S.cols + ':r' + (S.rotationOn ? 1 : 0);
};

Game.checkWin = function () {
  var S = this.S;
  if (!S || S.won || !isComplete(S)) return;
  S.won = true;
  this.selection = null;
  this.confetti = [];
  this._confInit = false;
  // celebratory ease: a warm gold-dust bloom over the finished picture
  this.spawnDust(S.boardW / 2, S.boardH / 2, FEEL.dustWinCount);
  sfx('win');
  var key = this.bestKey();
  var prev = bests.get(key);
  var isBest = !prev || S.elapsed < prev;
  if (isBest) bests.set(key, Math.round(S.elapsed));
  this.saveNow();
  // daily completion + streak
  if (S.imageKind === 'daily') {
    try { localStorage.setItem('pdawg-daily', JSON.stringify({ date: dailyStr(), ms: Math.round(S.elapsed) })); } catch (e) {}
  }
  statsRecordWin(S);
  var self = this;
  setTimeout(function () { UI.showWin(isBest, prev); }, 900);
  this.markDirty();
};

/* ---------------- lifetime stats ---------------- */
var STATS_KEY = 'pdawg-stats-v1';
function statsRead() {
  try { return Object.assign({ solved: 0, pieces: 0, streak: 0, streakDate: '' }, JSON.parse(localStorage.getItem(STATS_KEY) || '{}')); }
  catch (e) { return { solved: 0, pieces: 0, streak: 0, streakDate: '' }; }
}
function statsRecordWin(S) {
  var st = statsRead();
  st.solved++;
  st.pieces += S.pieces.length;
  if (S.imageKind === 'daily') {
    var today = dailyStr();
    var y = new Date(); y.setDate(y.getDate() - 1);
    var yest = dailyStr(y);
    st.streak = (st.streakDate === yest) ? st.streak + 1 : 1;
    st.streakDate = today;
  }
  try { localStorage.setItem(STATS_KEY, JSON.stringify(st)); } catch (e) {}
}

/* ---------------- arcade leaderboards ---------------- */
var ARCADE_BASE = 'https://gamez-arcade.chaoticutopia84.workers.dev';
var ARCADE_NAME_KEY = 'arcade_name';
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function fmtClockSecs(sec) {
  sec = Math.max(0, Math.round(sec));
  var m = (sec / 60) | 0, s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}
function arcadeSubmitWin(S) {
  var box = $('#winBoard');
  if (!box) return;
  var secs = Math.round(S.elapsed / 1000);
  var score = Math.max(0, 7200 - secs);   /* higher = faster; worker cap 7200 */
  var isDaily = S.imageKind === 'daily';
  var board = isDaily ? 'daily-' + dailyStr() : 'tier-' + S.pieces.length;
  var title = isDaily ? 'DAILY BEST' : 'FASTEST · ' + S.pieces.length + ' PIECES';
  function render(top, rank, name) {
    var rows = (!top || !top.length)
      ? '<div class="arc-empty">No times yet — be the first!</div>'
      : top.slice(0, 5).map(function (e, i) {
          return '<div class="arc-row' + (e.name === name ? ' me' : '') + '"><span>' +
            (i < 3 ? '<span class="lb-medal m' + (i + 1) + '">' + (i + 1) + '</span>' : (i + 1) + '.') + ' ' + escHtml(e.name) + '</span><b>' + fmtClockSecs(7200 - e.score) + '</b></div>';
        }).join('');
    box.innerHTML = '<div class="arc-title"><svg class="ic"><use href="#i-trophy"/></svg> ' + title + '</div>' +
      (rank > 0 ? '<div class="arc-rank"><svg class="ic"><use href="#i-globe"/></svg> GLOBAL #' + rank + '</div>' : '') + rows;
  }
  function post(name) {
    fetch(ARCADE_BASE + '/score', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'pdawg', board: board, name: name, score: score })
    }).then(function (r) { return r.json(); }).then(function (d) {
      render(d.top, d.rank || 0, name);
    }).catch(function () { render(null, 0, ''); });
  }
  var name = '';
  try { name = (localStorage.getItem(ARCADE_NAME_KEY) || '').trim(); } catch (e) {}
  if (name) { post(name); return; }
  box.innerHTML = '<div class="arc-title"><svg class="ic"><use href="#i-trophy"/></svg> ' + title + '</div>' +
    '<div class="arc-form"><input id="arc-name" maxlength="12" placeholder="YOUR NAME">' +
    '<button id="arc-go">SAVE</button></div>';
  $('#arc-go').onclick = function () {
    var v = $('#arc-name').value.trim().slice(0, 12);
    if (!v) return;
    try { localStorage.setItem(ARCADE_NAME_KEY, v); } catch (e) {}
    box.innerHTML = '<div class="arc-empty">sending…</div>';
    post(v);
  };
  fetch(ARCADE_BASE + '/scores?game=pdawg&board=' + encodeURIComponent(board))
    .then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.top && $('#arc-name')) render(d.top, 0, '');
    }).catch(function () {});
}

/* ---------------- image loading ---------------- */
function loadImageCanvas(S) {
  // returns Promise<canvas> of imgW x imgH
  return new Promise(function (resolve, reject) {
    var cv = document.createElement('canvas');
    cv.width = Math.round(S.imgW); cv.height = Math.round(S.imgH);
    var cx = cv.getContext('2d');
    function paintGallery(idx) {
      getGallery().paintAsync(idx, Math.round(S.imgW), Math.round(S.imgH), 1234).then(function (src) {
        cx.drawImage(src, 0, 0, cv.width, cv.height);
        resolve(cv);
      }, reject);
    }
    if (S.imageKind === 'daily') {
      var dateStr = (S.id || '').replace(/^daily-/, '') || dailyStr();
      dailyImageBlob(dateStr).then(function (blob) {
        if (!blob) { paintGallery(S.galleryIdx); return; }
        imageBlobToBitmap(blob).then(function (bmp) {
          cx.drawImage(bmp, 0, 0, cv.width, cv.height);
          resolve(cv);
        }).catch(function () { paintGallery(S.galleryIdx); });
      });
    } else if (S.imageKind === 'gallery') {
      paintGallery(S.galleryIdx);
    } else {
      idb.get('images', S.imageId).then(function (rec) {
        if (!rec) { reject(new Error('image missing')); return; }
        imageBlobToBitmap(rec.blob).then(function (bmp) {
          cx.drawImage(bmp, 0, 0, cv.width, cv.height);
          resolve(cv);
        }).catch(reject);
      }).catch(reject);
    }
  });
}

function imageBlobToBitmap(blob) {
  if (window.createImageBitmap) return window.createImageBitmap(blob);
  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function () {
      var cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      cv.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(cv);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function fileToImageRecord(file) {
  return imageBlobToBitmap(file).then(function (bmp) {
    var w = bmp.width, h = bmp.height;
    var maxDim = 1600;
    var sc = Math.min(1, maxDim / Math.max(w, h));
    w = Math.round(w * sc); h = Math.round(h * sc);
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    return new Promise(function (resolve, reject) {
      cv.toBlob(function (blob) {
        if (!blob) { reject(new Error('encode failed')); return; }
        resolve({ blob: blob, w: w, h: h });
      }, 'image/jpeg', 0.85);
    });
  });
}

function makeThumb(imgCanvas) {
  var tw = 168, th = Math.round(168 * imgCanvas.height / imgCanvas.width);
  var cv = document.createElement('canvas');
  cv.width = tw; cv.height = th;
  cv.getContext('2d').drawImage(imgCanvas, 0, 0, tw, th);
  try {
    return cv.toDataURL('image/jpeg', 0.7);
  } catch (e) {
    // A tainted canvas (e.g. a gallery photo loaded straight from file:// in
    // local dev, where the image origin is opaque) throws SecurityError here.
    // The thumb is cosmetic — never let it abort puzzle startup.
    return '';
  }
}

/* Mystery mode: a "?" placeholder thumb that never reveals the image. */
function makeMysteryThumb() {
  var cv = document.createElement('canvas');
  cv.width = 168; cv.height = 112;
  var c = cv.getContext('2d');
  c.fillStyle = '#2b2f3a'; c.fillRect(0, 0, 168, 112);
  c.fillStyle = '#f2a007';
  c.font = '700 64px -apple-system, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('?', 84, 60);
  try { return cv.toDataURL('image/png'); } catch (e) { return ''; }
}

/* ---------------- daily (AI-painted, same image worldwide) ---------------- */
function dailyStr(d) {
  d = d || new Date();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}
function dailySpec(dateStr) {
  var n = hashStr('pdawg-daily-' + (dateStr || dailyStr()));
  var g = getGallery().GALLERY;
  return {
    id: 'daily-' + (dateStr || dailyStr()),
    galleryIdx: n % g.length,   /* offline fallback image */
    count: COUNTS[(n >>> 4) % COUNTS.length],
    title: 'Daily Puzzle'
  };
}
/* Daily image: AI-painted via the jigsaw-ai worker, cached in IndexedDB.
 * Falls back to the procedural gallery image when offline. */
function dailyImageBlob(dateStr) {
  var id = 'dailyimg-' + dateStr;
  return idb.get('images', id).then(function (rec) {
    if (rec && rec.blob) return rec.blob;
    if (!window.PDAWG_AI) return null;
    return window.PDAWG_AI.daily(dateStr).then(function (res) {
      if (!res || !res.blob) return null;
      idb.put('images', { id: id, blob: res.blob }).catch(function () {});
      return res.blob;
    });
  }).catch(function () { return null; });
}
function dailyDone(dateStr) {
  try {
    var d = JSON.parse(localStorage.getItem('pdawg-daily') || 'null');
    return d && d.date === (dateStr || dailyStr()) ? d : null;
  } catch (e) { return null; }
}

/* ---------------- UI: home, modals, toolbar ---------------- */
function toast(msg) {
  var t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tm);
  t._tm = setTimeout(function () { t.classList.remove('show'); }, 2200);
}

/* Safe SFX call (audio.js may fail to load; game must not). */
function sfx(name) {
  try { if (window.PDAWG_SFX && window.PDAWG_SFX[name]) window.PDAWG_SFX[name](); } catch (e) {}
}

/* ---------------- feel: TACTILE · WARM · SATISFYING ----------------
 * Every juice choice serves the identity: piece snaps feel magnetic and
 * chunky (ease-out-back scale settle), connects burst warm gold dust (never
 * neon), haptics are a soft thock. Deliberately skipped: screen shake,
 * hit-stop, slow-mo — they fight the calm puzzle-table mood.
 * All tunables live in FEEL (one place, per the tuning playbook). */
var FEEL = {
  snapPopMs: 280,     // scale-settle duration on connect
  snapPopAmt: 0.12,   // peak scale of the pop
  dustCount: 14,      // gold-dust motes per connect
  dustWinCount: 46,   // motes for the completion burst
  dustMs: 600,
  dustPool: 96,
  scatterMs: 480,     // scatter glide duration
  progPopMs: 380,     // progress text pop duration
  carryScale: 0.045,  // how much a carried group swells toward you
  carryMs: 140,       // pickup lift ease
  settleMs: 130       // plain-drop settle ease
};
function easeOutBack(t) {
  var c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function reduceMotion() {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  catch (e) { return false; }
}
/* Magnetic chunk: grows past 1 with an overshoot, then settles exactly to 1.
 * s(0)=1, s(1)=1 — no discontinuity, the "thock" comes from sound+haptic. */
function snapCurve(t) {
  if (t <= 0) return 1;
  if (t >= 1) return 1;
  return 1 + FEEL.snapPopAmt * (easeOutBack(t) - t);
}

/* Shared drop resolution: snap, sounds, win check. */
function resolveDrop(S, gid) {
  var before = groupMembers(S, gid);   // dragged group's pieces (pre-merge)
  var res = snapAfterDrop(S, gid);
  if (res.placed) {
    sfx('snap');
  } else if (res.merged) {
    sfx('click');
  }
  if ((res.merged || res.placed) && typeof Game !== 'undefined' && Game.snapPop) {
    // pop the pieces that just joined: the merged group, or the placed ones
    var members = res.placed ? before : groupMembers(S, gid);
    var ids = [], cx = 0, cy = 0, n = 0;
    for (var i = 0; i < members.length; i++) {
      ids.push(members[i].id);
      cx += members[i].x + S.cellW / 2; cy += members[i].y + S.cellH / 2; n++;
    }
    if (n) Game.snapPop(ids, cx / n, cy / n);
  }
  return res;
}

function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }

var UI = {
  galleryThumbs: [],

  showHome: function () {
    $('#home').style.display = '';
    $('#game').style.display = 'none';
    document.body.classList.remove('playing');
    this.renderStats();
    this.renderDaily();
    this.renderShelf();
    this.renderGallery();
    this.renderAIStudio();
    this.renderAIGallery();
  },

  showGame: function () {
    $('#home').style.display = 'none';
    $('#game').style.display = '';
    document.body.classList.add('playing');
  },

  renderDaily: function () {
    var spec = dailySpec();
    var done = dailyDone();
    var wrap = $('#dailyCard');
    var dateStr = dailyStr();
    wrap.innerHTML = '';
    wrap.className = 'card daily hero';
    // progress + streak for the hero treatment
    var pct = 0, inProgress = false;
    try {
      var list = shelf.read();
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === spec.id && !list[i].done) { pct = list[i].pct || 0; inProgress = pct > 0; break; }
      }
    } catch (e) {}
    var st = statsRead();
    var art = el('div', 'hero-art');
    art.appendChild(el('div', 'gal-thumb-loading'));
    if (inProgress) {
      var ring = el('div', 'hero-ring');
      ring.innerHTML = heroRingSVG(pct) + '<b>' + pct + '%</b>';
      art.appendChild(ring);
    }
    wrap.appendChild(art);
    wrap.appendChild(el('div', 'card-tag', '<svg class="ic"><use href="#i-spark"/></svg> DAILY PUZZLE · SAME FOR EVERYONE'));
    wrap.appendChild(el('div', 'card-title', 'Today\'s AI painting'));
    var subBits = [levelForCount(spec.count).name + ' · ' + spec.count + ' pieces'];
    if (done) subBits.push('done in ' + fmtTime(done.ms));
    else if (st.streak > 1) subBits.push('<svg class="ic"><use href="#i-flame"/></svg> ' + st.streak + '-day streak');
    wrap.appendChild(el('div', 'card-sub', subBits.join(' &nbsp;·&nbsp; ')));
    var btn = el('button', 'btn primary big', done ? 'Play again' : (inProgress ? 'Continue' : 'Play today'));
    wrap.appendChild(btn);
    btn.onclick = function () { UI.startDaily(); };
    wrap.onclick = function (e) { if (e.target !== btn) UI.startDaily(); };
    // fill the thumbnail: cached/AI daily image, else gallery fallback
    dailyImageBlob(dateStr).then(function (blob) {
      function setThumb(srcCanvas) {
        var l = art.querySelector('.gal-thumb-loading');
        if (l) l.remove();
        art.insertBefore(canvasCopy(srcCanvas), art.firstChild);
      }
      if (blob) {
        imageBlobToBitmap(blob).then(function (bmp) {
          var cv = document.createElement('canvas');
          cv.width = 360; cv.height = 240;
          var cc = cv.getContext('2d');
          var sc = Math.max(360 / bmp.width, 240 / bmp.height);
          var dw = bmp.width * sc, dh = bmp.height * sc;
          cc.drawImage(bmp, (360 - dw) / 2, (240 - dh) / 2, dw, dh);
          setThumb(cv);
        }).catch(function () { fallbackThumb(); });
      } else fallbackThumb();
      function fallbackThumb() {
        var th = UI.galleryThumbs[spec.galleryIdx];
        if (th) setThumb(th);
      }
    });
  },

  /* ---------------- AI Studio ---------------- */
  renderAIStudio: function () {
    var wrap = $('#aiThemes');
    if (!wrap || wrap.children.length || !window.PDAWG_AI) return;
    var self = this;
    window.PDAWG_AI.THEMES.forEach(function (t, i) {
      var b = el('button', 'ai-theme', '<svg class="ic"><use href="#i-spark"/></svg>' + escHtml(t));
      b.onclick = function () { self.generateAI(window.PDAWG_AI.themePrompt(i), t); };
      wrap.appendChild(b);
    });
  },

  generateAI: function (prompt, label) {
    var st = $('#aiStatus');
    st.style.display = 'flex';
    if (!window.PDAWG_AI) {
      st.innerHTML = '<span>The AI studio is unavailable right now — try a gallery puzzle.</span>';
      return;
    }
    st.innerHTML = '<span class="spin"></span><span>Painting your puzzle… AI art takes ~20–40 seconds.</span>';
    sfx('click');
    var self = this;
    window.PDAWG_AI.generate(prompt, function (i) {
      // keep the status alive while polling so it never looks stuck
      st.innerHTML = '<span class="spin"></span><span>Painting your puzzle… ' +
        Math.round((i + 1) * 3) + 's so far.</span>';
    }).then(function (res) {
      if (!res || res.error || !res.size) {
        st.innerHTML = '<span>' + (res && res.error === 'hourly'
          ? 'Hourly AI limit reached — try again later, or pick a gallery puzzle.'
          : 'The AI is napping — try again in a bit.') + '</span>';
        return;
      }
      st.innerHTML = '<span class="spin"></span><span>Cutting the pieces…</span>';
      fileToImageRecord(res).then(function (rec) {
        var imageId = uid('ai');
        idb.put('images', { id: imageId, blob: rec.blob }).then(function () {
          st.style.display = 'none';
          try {
            var aiList = JSON.parse(localStorage.getItem('pdawg-ai-list') || '[]');
            aiList.unshift({ imageId: imageId, title: label || 'AI Dream', ts: Date.now() });
            localStorage.setItem('pdawg-ai-list', JSON.stringify(aiList.slice(0, 24)));
          } catch (e) {}
          self.renderAIGallery();
          self.openCountChooser({ imageKind: 'custom', imageId: imageId, title: label || 'AI Dream' });
        }).catch(function () { st.innerHTML = '<span>Could not save the painting — try again.</span>'; });
      }).catch(function () { st.innerHTML = '<span>Could not read the painting — try again.</span>'; });
    }).catch(function () {
      st.innerHTML = '<span>Something went wrong reaching the AI — try again in a bit.</span>';
    });
  },

  /* AI creations shelf in the gallery grid */
  renderAIGallery: function () {
    var grid = $('#galleryGrid');
    if (!grid) return;
    var old = grid.querySelectorAll('.ai-card');
    for (var i = old.length - 1; i >= 0; i--) old[i].remove();
    var list = [];
    try { list = JSON.parse(localStorage.getItem('pdawg-ai-list') || '[]'); } catch (e) {}
    var self = this;
    list.forEach(function (a) {
      var card = el('div', 'gal-card ai-card');
      var im = el('div', 'gal-thumb-loading');
      card.appendChild(im);
      card.appendChild(el('div', 'gal-title', a.title));
      card.onclick = function () { self.openCountChooser({ imageKind: 'custom', imageId: a.imageId, title: a.title }); };
      grid.insertBefore(card, grid.firstChild);
      idb.get('images', a.imageId).then(function (rec) {
        if (!rec) return;
        imageBlobToBitmap(rec.blob).then(function (bmp) {
          var cv = document.createElement('canvas');
          cv.width = 360; cv.height = 240;
          var cc = cv.getContext('2d');
          var sc = Math.max(360 / bmp.width, 240 / bmp.height);
          var dw = bmp.width * sc, dh = bmp.height * sc;
          cc.drawImage(bmp, (360 - dw) / 2, (240 - dh) / 2, dw, dh);
          var oldIm = card.querySelector('.gal-thumb-loading');
          if (oldIm) card.replaceChild(cv, oldIm);
        }).catch(function () {});
      });
    });
    this.updateGalCount();
  },

  renderStats: function () {
    var strip = $('#statsStrip');
    if (!strip) return;
    var st = statsRead();
    strip.innerHTML = '';
    function stat(icon, val, label) {
      var d = el('div', 'stat', '<svg class="ic"><use href="#' + icon + '"/></svg> <b>' + val + '</b> ' + label);
      strip.appendChild(d);
    }
    stat('i-trophy', st.solved, 'solved');
    stat('i-piece', st.pieces.toLocaleString(), 'pieces placed');
    if (st.streak > 1) stat('i-flame', st.streak, 'day streak');
  },

  renderShelf: function () {
    var list = shelf.read().filter(function (e) { return !e.done; });
    var sec = $('#shelfSection'), row = $('#shelfRow');
    row.innerHTML = '';
    if (!list.length) { sec.style.display = 'none'; return; }
    sec.style.display = '';
    list.forEach(function (e) {
      var card = el('div', 'shelf-card');
      var im = el('img', 'shelf-thumb'); im.src = e.thumb || ''; im.alt = '';
      var tt = el('div', 'shelf-title', e.title);
      var pc = el('div', 'shelf-pct', (e.pct || 0) + '%');
      var bar = el('div', 'shelf-bar'); bar.appendChild(el('div', 'shelf-fill'));
      bar.firstChild.style.width = (e.pct || 0) + '%';
      var del = el('button', 'shelf-del', '×');
      del.title = 'Delete';
      del.onclick = function (ev) {
        ev.stopPropagation();
        if (confirm('Delete "' + e.title + '"?')) {
          idb.del('puzzles', e.id).then(function () { shelf.remove(e.id); UI.renderShelf(); });
        }
      };
      card.appendChild(im); card.appendChild(tt); card.appendChild(pc); card.appendChild(bar); card.appendChild(del);
      card.onclick = function () { UI.resumePuzzle(e.id); };
      row.appendChild(card);
    });
  },

  renderGallery: function () {
    var grid = $('#galleryGrid');
    if (grid.children.length) return;
    var self = this;
    var doneMap = {};
    try {
      var bk = bests.read();
      for (var bkey in bk) {
        var m = /^g(\d+):/.exec(bkey);
        if (m) doneMap[+m[1]] = true;
      }
    } catch (e) {}
    window.PDAWG_GALLERY.GALLERY.forEach(function (g, i) {
      var card = el('div', 'gal-card');
      var th = self.galleryThumbs[i];
      if (th) card.appendChild(canvasCopy(th));
      else if (window.PDAWG_GALLERY.isPhoto(i)) card.appendChild(el('div', 'gal-thumb-loading'));
      if (doneMap[i]) card.appendChild(el('div', 'gal-done', '<svg class="ic"><use href="#i-check"/></svg>'));
      card.appendChild(el('div', 'gal-title', g.title));
      card.onclick = function () { UI.openCountChooser({ imageKind: 'gallery', galleryIdx: i, title: g.title }); };
      grid.appendChild(card);
    });
    this.updateGalCount();
  },

  /* "N puzzles" label on the gallery eyebrow */
  updateGalCount: function () {
    var gc = $('#galCount');
    if (!gc || !window.PDAWG_GALLERY) return;
    var n = window.PDAWG_GALLERY.GALLERY.length;
    try { n += JSON.parse(localStorage.getItem('pdawg-ai-list') || '[]').length; } catch (e) {}
    gc.textContent = n + ' puzzles';
  },

  buildThumbs: function () {
    var self = this;
    var G = window.PDAWG_GALLERY;
    this.galleryThumbs = G.GALLERY.map(function (g, i) {
      if (!G.isPhoto(i)) {
        var cv = G.paint(i, 360, 240, 1234);
        cv.className = 'thumb-img';
        return cv;
      }
      // Photo item: thumbnail fills in async; the card shows a shimmer until then.
      G.paintAsync(i, 360, 240, 1234).then(function (pcv) {
        pcv.className = 'thumb-img';
        self.galleryThumbs[i] = pcv;
        self.updateGalleryThumb(i);
        self.renderDaily();
      }, function () { /* keep shimmer on load failure */ });
      return null;
    });
  },

  updateGalleryThumb: function (i) {
    var grid = $('#galleryGrid');
    var card = grid && grid.children[i];
    var th = this.galleryThumbs[i];
    if (!card || !th) return;
    var old = card.querySelector('.gal-thumb-loading, canvas.thumb-img');
    var im = canvasCopy(th);
    if (old) card.replaceChild(im, old);
    else card.insertBefore(im, card.firstChild);
  },

  openCountChooser: function (base) {
    this._pending = base;
    var wrap = $('#countBtns');
    wrap.innerHTML = '';
    var self = this;
    this._selCount = 54; /* Classic is the default segment */
    LEVELS.forEach(function (L, i) {
      var b = el('button', 'btn count');
      b.innerHTML = '<div class="lvl-name">' + L.count + '</div><div class="lvl-count">' + L.name + '</div>';
      if (L.count === self._selCount) b.classList.add('sel');
      b.onclick = function () {
        self._selCount = L.count;
        wrap.style.setProperty('--sel', i);
        var btns = wrap.querySelectorAll('.btn.count');
        for (var k = 0; k < btns.length; k++) btns[k].classList.toggle('sel', k === i);
        sfx('click');
      };
      wrap.appendChild(b);
    });
    wrap.style.setProperty('--sel', 1);
    $('#rotToggle').checked = rotPref();
    openModal('#countModal');
  },

  startWithCount: function (n) {
    var base = this._pending;
    closeModal('#countModal');
    var rot = $('#rotToggle').checked;
    this.createAndStart({
      imageKind: base.imageKind, galleryIdx: base.galleryIdx, imageId: base.imageId,
      title: base.title, count: n, rotationOn: rot,
      mystery: base.mystery, mysteryTitle: base.mysteryTitle,
      seed: (Math.random() * 1e9) | 0
    });
  },

  startMystery: function () {
    var G = getGallery();
    if (!G || !G.GALLERY.length) { toast('Gallery is not ready yet'); return; }
    var idx = (Math.random() * G.GALLERY.length) | 0;
    var realTitle = G.GALLERY[idx].title;
    this.openCountChooser({
      imageKind: 'gallery', galleryIdx: idx,
      title: 'Mystery Puzzle',
      mystery: true, mysteryTitle: realTitle
    });
    toast('Shh… no peeking!');
  },

  startDaily: function () {
    var spec = dailySpec();
    var self = this;
    idb.get('puzzles', spec.id).then(function (saved) {
      if (saved && !saved.won) { self.resumePuzzle(spec.id); return; }
      self.createAndStart({
        imageKind: 'daily', galleryIdx: spec.galleryIdx, imageId: null,
        title: spec.title, count: spec.count, rotationOn: false,
        seed: hashStr('pdawg-daily-' + dailyStr()), id: spec.id
      });
    });
  },

  createAndStart: function (opts) {
    var self = this;
    var aspect, imgW, imgH;
    function build(imgCanvas) {
      aspect = imgCanvas.width / imgCanvas.height;
      imgW = 1200;
      imgH = Math.round(1200 / aspect);
      if (imgH > 1000) { imgH = 1000; imgW = Math.round(1000 * aspect); }
      var grid = gridForCount(opts.count, aspect);
      var S = newPuzzleState({
        id: opts.id || uid('p'), title: opts.title,
        imageKind: opts.imageKind, galleryIdx: opts.galleryIdx, imageId: opts.imageId,
        imgW: imgW, imgH: imgH, rows: grid.rows, cols: grid.cols,
        seed: opts.seed, rotationOn: opts.rotationOn,
        mystery: opts.mystery, mysteryTitle: opts.mysteryTitle,
        thumb: opts.mystery ? makeMysteryThumb() : makeThumb(imgCanvas)
      });
      self.showGame();
      Game.start(S, imgCanvas);
      Game.saveNow();
      toast('Puzzle started — progress saves automatically');
    }
    if (opts.imageKind === 'custom') {
      idb.get('images', opts.imageId).then(function (rec) {
        imageBlobToBitmap(rec.blob).then(function (bmp) {
          var cv = document.createElement('canvas');
          cv.width = bmp.width; cv.height = bmp.height;
          cv.getContext('2d').drawImage(bmp, 0, 0);
          build(cv);
        });
      });
    } else {
      // Gallery item: procedural paints are instant; photos load async.
      var G2 = getGallery();
      toast('Loading image…');
      G2.paintAsync(opts.galleryIdx, 1200, Math.round(1200 / 1.5), 1234).then(build, function () {
        toast('Could not load image');
      });
    }
  },

  resumePuzzle: function (id) {
    var self = this;
    idb.get('puzzles', id).then(function (saved) {
      if (!saved) { toast('Save not found'); shelf.remove(id); self.renderShelf(); return; }
      var S = deserializeState(saved);
      loadImageCanvas(S).then(function (imgCanvas) {
        self.showGame();
        Game.start(S, imgCanvas);
        toast('Welcome back — ' + placedCount(S) + ' of ' + S.pieces.length + ' placed');
      }).catch(function () { toast('Could not load puzzle image'); });
    });
  },

  showWin: function (isBest, prev) {
    var S = Game.S;
    if (!S || !S.won) return;
    $('#winTime').textContent = fmtTime(S.elapsed);
    // mystery reveal: unmask the title + show the hidden picture
    var rev = $('#winReveal');
    rev.style.display = 'none'; rev.innerHTML = '';
    if (S.mystery && S.mysteryTitle) {
      $('#winSub').textContent = 'It was "' + S.mysteryTitle + '"! ' + S.pieces.length + ' pieces';
      rev.style.display = '';
      var cv = document.createElement('canvas');
      var w = Math.min(420, S.imgW), h = Math.round(w * S.imgH / S.imgW);
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(Game.imgCanvas, 0, 0, w, h);
      cv.className = 'win-reveal-img';
      rev.appendChild(cv);
    } else {
      $('#winSub').textContent = S.pieces.length + ' pieces · ' + S.title;
    }
    var badge = $('#winBest');
    if (isBest) {
      badge.style.display = '';
      badge.textContent = prev ? 'New best time!' : 'First completion!';
    } else badge.style.display = 'none';
    arcadeSubmitWin(S);
    openModal('#winModal');
  },

  openPreview: function () {
    var S = Game.S;
    var box = $('#previewImg');
    box.innerHTML = '';
    var cv = document.createElement('canvas');
    var w = Math.min(900, S.imgW), h = Math.round(w * S.imgH / S.imgW);
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(Game.imgCanvas, 0, 0, w, h);
    cv.className = 'preview-canvas';
    box.appendChild(cv);
    openModal('#previewModal');
  },

  /* pause modal: table theme picker */
  renderThemeRow: function () {
    var row = $('#themeRow');
    if (!row) return;
    row.innerHTML = '';
    Game.TABLE_THEMES.forEach(function (t) {
      var b = el('button', 'theme-opt' + (Game.tableTheme === t.id ? ' on' : ''),
        '<span class="swatch" style="background:' + t.css + '"></span><small>' + t.name + '</small>');
      b.title = t.name;
      b.onclick = function () { sfx('click'); Game.setTheme(t.id); UI.renderThemeRow(); };
      row.appendChild(b);
    });
  },

  /* custom photo upload */
  handleFiles: function (files) {
    if (!files || !files.length) return;
    var file = files[0];
    if (!file.type || file.type.indexOf('image/') !== 0) { toast('That is not an image file'); return; }
    toast('Preparing your photo…');
    var self = this;
    fileToImageRecord(file).then(function (rec) {
      var imageId = uid('u');
      idb.put('images', { id: imageId, blob: rec.blob }).then(function () {
        self.openCountChooser({ imageKind: 'custom', imageId: imageId, title: 'My Photo' });
      });
    }).catch(function () { toast('Could not read that image'); });
  },

  bindGlobal: function () {
    var self = this;
    $('#uploadBtn').onclick = function () { $('#fileInput').click(); };
    var mysBtn = $('#mysteryBtn');
    if (mysBtn) mysBtn.onclick = function () { UI.startMystery(); };
    $('#fileInput').addEventListener('change', function (e) {
      self.handleFiles(e.target.files);
      e.target.value = '';
    });
    // drag & drop anywhere on home
    var home = $('#home');
    home.addEventListener('dragover', function (e) { e.preventDefault(); home.classList.add('dragging'); });
    home.addEventListener('dragleave', function () { home.classList.remove('dragging'); });
    home.addEventListener('drop', function (e) {
      e.preventDefault(); home.classList.remove('dragging');
      if (e.dataTransfer && e.dataTransfer.files) self.handleFiles(e.dataTransfer.files);
    });
    // paste from clipboard
    document.addEventListener('paste', function (e) {
      if ($('#home').style.display === 'none') return;
      var items = (e.clipboardData && e.clipboardData.files) || [];
      if (items.length) self.handleFiles(items);
    });
    // toolbar
    $('#backBtn').onclick = function () { Game.stop(); UI.showHome(); };
    $('#pauseBtn').onclick = function () {
      Game.paused = true;
      Game.saveNow();
      UI.renderThemeRow();
      try { $('#haptToggle').checked = window.PDAWG_SFX && PDAWG_SFX.hapticsOn(); } catch (e) {}
      openModal('#pauseModal');
    };
    /* light haptic tick on every UI button press (no-op where unsupported, e.g. iOS) */
    document.addEventListener('pointerdown', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('.btn,.tbtn,.ai-theme,.count-btn,.theme-opt,.daily.hero') : null;
      if (t && window.PDAWG_SFX) { try { PDAWG_SFX.tap(); } catch (err) {} }
    }, { passive: true });
    $('#resumeBtn').onclick = function () { closeModal('#pauseModal'); Game.paused = false; Game.markDirty(); };
    $('#restartBtn').onclick = function () {
      if (!confirm('Restart this puzzle from scratch?')) return;
      closeModal('#pauseModal');
      var S = Game.S;
      var fresh = newPuzzleState({
        id: S.id, title: S.title, imageKind: S.imageKind, galleryIdx: S.galleryIdx,
        imageId: S.imageId, imgW: S.imgW, imgH: S.imgH, rows: S.rows, cols: S.cols,
        seed: (Math.random() * 1e9) | 0, rotationOn: S.rotationOn, thumb: S.thumb,
        mystery: S.mystery, mysteryTitle: S.mysteryTitle
      });
      Game.start(fresh, Game.imgCanvas);
      Game.saveNow();
    };
    $('#exitBtn').onclick = function () { closeModal('#pauseModal'); Game.stop(); UI.showHome(); };
    $('#previewBtn').onclick = function () { UI.openPreview(); };
    $('#previewClose').onclick = function () { closeModal('#previewModal'); };
    $('#previewModal').addEventListener('click', function (e) {
      if (e.target.id === 'previewModal') closeModal('#previewModal');
    });
    $('#rotBtn').onclick = function () { Game.rotateSelection(); };
    $('#ghostBtn').onclick = function () {
      var S = Game.S;
      if (!S || S.mystery) { toast('No peeking in Mystery mode!'); return; }
      Game.ghostOn = !Game.ghostOn;
      $('#ghostBtn').classList.toggle('on', Game.ghostOn);
      Game.markDirty();
    };
    $('#hintBtn').onclick = function () { Game.placeHintPiece(); };
    $('#edgeBtn').onclick = function () {
      Game.setTrayOpen(!Game.tray.open);
    };
    $('#fitBtn').onclick = function () { Game.fitBoard(); };
    $('#scatterBtn').onclick = function () {
      var S = Game.S;
      if (!S || S.won || Game.glide) return;
      var moves = [];
      for (var i = 0; i < S.zorder.length; i++) {
        var members = groupMembers(S, S.zorder[i]);
        if (!members.length || members[0].placed) continue;
        // move the group's bounding box to a random open spot
        var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, k;
        for (k = 0; k < members.length; k++) {
          x0 = Math.min(x0, members[k].x); y0 = Math.min(y0, members[k].y);
          x1 = Math.max(x1, members[k].x + S.cellW); y1 = Math.max(y1, members[k].y + S.cellH);
        }
        var w = x1 - x0, h = y1 - y0;
        var nx = Math.random() * Math.max(1, S.boardW - w);
        var ny = Math.random() * Math.max(1, S.boardH - h);
        // keep clear of the central image area
        if (nx + w > S.imgOX - S.cellW && nx < S.imgOX + S.imgW + S.cellW &&
            ny + h > S.imgOY - S.cellH && ny < S.imgOY + S.imgH + S.cellH) {
          ny = (ny < S.boardH / 2) ? Math.max(0, S.imgOY - h - S.cellH) : Math.min(S.boardH - h, S.imgOY + S.imgH + S.cellH);
        }
        moves.push({ members: members, dx: nx - x0, dy: ny - y0 });
      }
      if (!moves.length) return;
      sfx('scatter');
      toast('Pieces scattered — fresh eyes!');
      if (reduceMotion()) {
        // no animation: apply instantly, same end state as the glide
        for (var m = 0; m < moves.length; m++) {
          var mv = moves[m];
          for (var q = 0; q < mv.members.length; q++) {
            mv.members[q].x += mv.dx; mv.members[q].y += mv.dy;
          }
        }
        Game.markDirty();
        Game.saveNow();
        return;
      }
      // eased glide: every loose piece floats to its new spot
      var list = [];
      for (var a = 0; a < moves.length; a++) {
        var mm = moves[a];
        for (var b = 0; b < mm.members.length; b++) {
          var p = mm.members[b];
          list.push({ p: p, fx: p.x, fy: p.y, tx: p.x + mm.dx, ty: p.y + mm.dy });
        }
      }
      Game.glide = { list: list, t0: performance.now() };
      Game.markDirty();
    };
    $('#countClose').onclick = function () { closeModal('#countModal'); };
    $('#countStart').onclick = function () { UI.startWithCount(UI._selCount || 54); };
    // persist rotation preference whenever the chooser toggle changes
    var rt = $('#rotToggle');
    if (rt) rt.addEventListener('change', function () { setRotPref(rt.checked); });
    // haptics setting (pause modal)
    var ht = $('#haptToggle');
    if (ht) ht.addEventListener('change', function () {
      try { if (window.PDAWG_SFX) PDAWG_SFX.setHaptics(ht.checked); } catch (e) {}
      sfx('click');
    });
    // AI studio
    $('#aiGenBtn').onclick = function () {      var v = $('#aiPrompt').value.trim();
      if (!v) { toast('Type an idea first — or tap a theme above'); return; }
      UI.generateAI(v, v.slice(0, 28));
    };
    // win modal
    $('#winHome').onclick = function () { closeModal('#winModal'); Game.stop(); UI.showHome(); };
    $('#winReplay').onclick = function () {
      closeModal('#winModal');
      var S = Game.S;
      var fresh = newPuzzleState({
        id: uid('p'), title: S.title, imageKind: S.imageKind === 'daily' ? 'gallery' : S.imageKind,
        galleryIdx: S.galleryIdx, imageId: S.imageId,
        imgW: S.imgW, imgH: S.imgH, rows: S.rows, cols: S.cols,
        seed: (Math.random() * 1e9) | 0, rotationOn: S.rotationOn, thumb: S.thumb,
        mystery: S.mystery, mysteryTitle: S.mysteryTitle
      });
      if (fresh.imageKind === 'daily') fresh.imageKind = 'gallery';
      Game.start(fresh, Game.imgCanvas);
      Game.saveNow();
    };
    $('#winNew').onclick = function () { closeModal('#winModal'); Game.stop(); UI.showHome(); };
  }
};

/* ---------------- boot ---------------- */
function boot() {
  Game.init();
  UI.buildThumbs();
  UI.bindGlobal();
  UI.showHome();
  idb.open().then(function () {
    if (idb.mem) toast('Note: private mode - saves may not persist');
    UI.renderShelf();
    UI.renderDaily();
  });
}

if (typeof document !== 'undefined' && typeof document.querySelector === 'function' && !window.__JIGSAW_NOBOOT) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}

/* browser handle for automation/testing (read-only convenience; harmless in production) */
if (typeof window !== 'undefined') window.Pdawg = { UI: UI, Game: Game, shelf: shelf, idb: idb };

/* test exports */
if (typeof module !== 'undefined' && module.exports) {  module.exports = {
    mulberry32: mulberry32, hashStr: hashStr, clamp: clamp, fmtTime: fmtTime,
    canvasCopy: canvasCopy,
    NPROF: NPROF, PROFILES: PROFILES,
    buildEdges: buildEdges, pieceEdges: pieceEdges, edgeGeom: edgeGeom,
    strokeGeom: strokeGeom, tracePiecePath: tracePiecePath, bezPoint: bezPoint, flattenEdgeOps: flattenEdgeOps,
    gridForCount: gridForCount, newPuzzleState: newPuzzleState,
    trueX: trueX, trueY: trueY, snapDist: snapDist, isEdgePiece: isEdgePiece,
    groupMembers: groupMembers, mergeGroups: mergeGroups, seatGroupExact: seatGroupExact,
    neighborsOf: neighborsOf,
    snapAfterDrop: snapAfterDrop, rotateGroup: rotateGroup,
    placedCount: placedCount, isComplete: isComplete,
    traceWhimsyPath: traceWhimsyPath,
    applyWhimsy: applyWhimsy,
    serializeState: serializeState, deserializeState: deserializeState,
    renderPieceCanvases: renderPieceCanvases,
    dailySpec: dailySpec, COUNTS: COUNTS, LEVELS: LEVELS, levelForCount: levelForCount,
    Game: Game,
    /* feel (test seam) */
    FEEL: FEEL, snapCurve: snapCurve, easeOutBack: easeOutBack, easeOutCubic: easeOutCubic,
    reduceMotion: reduceMotion, resolveDrop: resolveDrop
  };
}

/* geometry seam for visual harnesses (window.__JIGSAW_NOBOOT must be set
 * before this script loads; the game itself never sets it) */
if (typeof window !== 'undefined' && window.__JIGSAW_NOBOOT) {
  window.__JGEO = {
    mulberry32: mulberry32, NPROF: NPROF, PROFILES: PROFILES, CORNER_F: CORNER_F,
    buildEdges: buildEdges, pieceEdges: pieceEdges, edgeGeom: edgeGeom,
    strokeGeom: strokeGeom, tracePiecePath: tracePiecePath
  };
}
/* drive seam for visual harnesses (window.__PDAWG_DEBUG must be set before
 * this script loads; the game itself never sets it) */
if (typeof window !== 'undefined' && window.__PDAWG_DEBUG) {
  window.__PDAWG = Game;
}
})();
