/* Still Life — app layer: pages, color, input, zen UI, gallery, timelapse, AI.
 * Engine (WebGL2) lives in engine.js as window.StillGL.
 */
'use strict';

var App = {
  gl: null,
  pageW: 1200, pageH: 1500,          // design px; engine scales by dpr
  pageId: 'blank',
  pageTitle: 'Blank Canvas',
  medium: 'pencil',                  // 'pencil' | 'oil'
  color: '#3b6ea5',
  brushSize: 26,                     // css px diameter
  fillMode: false,
  lineAssist: true,
  soundOn: true,
  zen: false,
  view: { scale: 1, tx: 0, ty: 0 },
  pages: [],                         // {id,title,category,svg,raster,mask}
  mask: null,                        // active line-art mask {data,w,h}
  lineartImg: null,
  strokes: 0,
  sessionStrokes: [],                // for timelapse (references engine stroke objs)
  history: [],                       // recent colors
  slots: [null, null, null],
  palettes: [],
  paletteIdx: 0,
  shade: 0,                          // -40..40 lightness shift
  baseColor: '#3b6ea5',
};

var $ = function (id) { return document.getElementById(id); };

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function store(k, v) { try { localStorage.setItem('still-life:' + k, v); } catch (e) {} }
function read(k) { try { return localStorage.getItem('still-life:' + k); } catch (e) { return null; } }

/* ------------------------------------------------------------------ */
/* Pages                                                               */
/* ------------------------------------------------------------------ */

var BUILTIN_PAGES = [
  { id: 'mandala-lotus', title: 'Lotus Mandala', category: 'Mandalas' },
  { id: 'mandala-geo', title: 'Star Mandala', category: 'Mandalas' },
  { id: 'botanical-wildflowers', title: 'Wildflowers', category: 'Botanical' },
  { id: 'botanical-monstera', title: 'Monstera', category: 'Botanical' },
  { id: 'animal-owl', title: 'Night Owl', category: 'Animals' },
  { id: 'animal-fox', title: 'Curled Fox', category: 'Animals' },
  { id: 'landscape-lake', title: 'Mountain Lake', category: 'Places' },
  { id: 'pattern-waves', title: 'Ocean Drift', category: 'Patterns' },
];

App.loadPages = function () {
  // Built-ins may not exist yet (art still being drawn) — include what's there.
  this.pages = [{ id: 'blank', title: 'Blank Canvas', category: 'Canvas', svg: null }];
  var self = this;
  BUILTIN_PAGES.forEach(function (p) {
    self.pages.push({ id: p.id, title: p.title, category: p.category, svg: 'pages-src/' + p.id + '.svg' });
  });
  // customs from previous sessions
  try {
    var customs = JSON.parse(read('custom-pages') || '[]');
    customs.forEach(function (c) { self.pages.push(c); });
  } catch (e) {}
};

App.setPage = function (id) {
  var self = this;
  var page = null;
  for (var i = 0; i < this.pages.length; i++) if (this.pages[i].id === id) page = this.pages[i];
  if (!page) page = this.pages[0];
  this.pageId = page.id;
  this.pageTitle = page.title;
  this.saveSession(); // persist previous page first
  this.gl.clear();
  this.sessionStrokes = [];
  this.mask = null;

  var art = $('lineart');
  if (page.svg) {
    art.style.display = 'block';
    art.src = page.svg;
    art.onload = function () { self.buildMask(page); };
    // cached already?
    if (art.complete && art.naturalWidth) self.buildMask(page);
  } else if (page.raster) {
    art.style.display = 'block';
    art.src = page.raster;
    art.onload = function () { self.buildMask(page); };
    if (art.complete && art.naturalWidth) self.buildMask(page);
  } else {
    art.style.display = 'none';
    art.removeAttribute('src');
  }
  $('page-title').textContent = page.title;
  this.restoreSession();
  this.resetView();
  this.updateChrome();
};

// Rasterize line art -> alpha mask for tap-fill + line assist.
App.buildMask = function (page) {
  var self = this;
  var img = new Image();
  img.onload = function () {
    var w = 600, h = Math.round(600 * img.naturalHeight / img.naturalWidth) || 750;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, w, h);
    var d;
    try { d = x.getImageData(0, 0, w, h).data; }
    catch (e) { return; } // cross-origin art: fill/assist unavailable, painting still works
    // SVG line art has transparency (use alpha); photo/AI rasters are opaque (use luminance)
    var hasAlpha = false;
    for (var s = 3; s < d.length; s += 401 * 4) { if (d[s] < 200) { hasAlpha = true; break; } }
    var mask = new Uint8Array(w * h);
    for (var i = 0; i < w * h; i++) {
      if (hasAlpha) mask[i] = d[i * 4 + 3] > 110 ? 255 : 0;
      else {
        var lum = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
        mask[i] = lum < 120 ? 255 : 0;
      }
    }
    page.mask = { data: mask, w: w, h: h };
    if (self.pageId === page.id) self.mask = page.mask;
  };
  img.src = page.svg || page.raster;
};

App.resetView = function () {
  this.view = { scale: 1, tx: 0, ty: 0 };
  this.applyView();
  this.fitStage();
};

// Fit the stage (canvas + lineart) into the viewport, letterboxed.
App.fitStage = function () {
  var stage = $('stage');
  var vw = window.innerWidth, vh = window.innerHeight;
  var s = Math.min(vw / this.pageW, vh / this.pageH);
  this.fitScale = s;
  var w = this.pageW * s, h = this.pageH * s;
  stage.style.width = w + 'px';
  stage.style.height = h + 'px';
  stage.style.left = ((vw - w) / 2) + 'px';
  stage.style.top = ((vh - h) / 2) + 'px';
  this.applyView();
};

App.applyView = function () {
  var v = this.view;
  $('stage').style.transform =
    'translate(' + v.tx + 'px,' + v.ty + 'px) scale(' + v.scale + ')';
};

// client (css px) -> engine backing px
App.toPage = function (clientX, clientY) {
  var r = $('paint').getBoundingClientRect();
  return [
    (clientX - r.left) / r.width * this.gl.pageW,
    (clientY - r.top) / r.height * this.gl.pageH
  ];
};

/* ------------------------------------------------------------------ */
/* Color system: curated palettes, shade slider, history, quick slots  */
/* ------------------------------------------------------------------ */

App.palettes = [
  { name: 'Botanical', colors: ['#2d6a4f', '#40916c', '#74c69d', '#b7e4c7', '#d8f3dc', '#e76f51', '#f4a261', '#e9c46a', '#606c38'] },
  { name: 'Sunset', colors: ['#3b2d5c', '#7b4b94', '#c94f7c', '#ff6b6b', '#ff9e7d', '#ffc38f', '#ffe3b3', '#2b2d5c', '#4a4e8f'] },
  { name: 'Ocean', colors: ['#03045e', '#023e8a', '#0077b6', '#0096c7', '#00b4d8', '#48cae4', '#90e0ef', '#ade8f4', '#caf0f8'] },
  { name: 'Pastel', colors: ['#ffd6e0', '#ffc6dd', '#c1e7ff', '#bde0fe', '#fff3b0', '#d3f8d3', '#e4c1f9', '#f1c0e8', '#ffffff'] },
  { name: 'Earth', colors: ['#3a2e22', '#6b4f3a', '#a98467', '#dcc9a3', '#ede0d4', '#8a9a5b', '#4a5d3a', '#b5838d', '#e5989b'] },
  { name: 'Neon Dusk', colors: ['#0d0221', '#541388', '#b967ff', '#ff2e88', '#01cdfe', '#05ffa1', '#fffb96', '#ff6c11', '#f9f871'] },
  { name: 'Autumn', colors: ['#5b3a29', '#9c3848', '#d97634', '#e9b44c', '#f4e1a1', '#7a8b3f', '#4c5b2f', '#8c5a2b', '#d9a679'] },
  { name: 'Ink', colors: ['#111111', '#2b2b2b', '#4a4a4a', '#6e6e6e', '#8f8f8f', '#b0b0b0', '#d0d0d0', '#e8e8e8', '#f7f7f7'] },
  { name: 'Candy', colors: ['#ff5d8f', '#ffb3c6', '#ffc8dd', '#ffd166', '#06d6a0', '#118ab2', '#073b4c', '#ef476f', '#f78c6b'] },
  { name: 'Desert', colors: ['#6d6875', '#b5838d', '#e5989b', '#e76f51', '#f4a261', '#e9c46a', '#f1e3d3', '#a98467', '#54433a'] },
];

function hexToHsl(hex) {
  var r = parseInt(hex.slice(1, 3), 16) / 255,
      g = parseInt(hex.slice(3, 5), 16) / 255,
      b = parseInt(hex.slice(5, 7), 16) / 255;
  var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2;
  if (mx !== mn) {
    var d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hslToHex(h, s, l) {
  function f(n) {
    var k = (n + h * 12) % 12;
    var a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  }
  function c(x) { return Math.round(255 * x).toString(16).padStart(2, '0'); }
  return '#' + c(f(0)) + c(f(8)) + c(f(4));
}

// Apply the shade slider to the base color -> working color.
App.applyShade = function () {
  var hsl = hexToHsl(this.baseColor);
  hsl[2] = clamp(hsl[2] + this.shade / 100, 0.02, 0.98);
  this.color = hslToHex(hsl[0], hsl[1], hsl[2]);
  $('well').style.background = this.color;
  $('shade-val').textContent = (this.shade > 0 ? '+' : '') + this.shade;
};

App.setColor = function (hex, fromHistory) {
  this.baseColor = hex;
  this.color = hex;
  this.shade = 0;
  $('shade').value = 0;
  this.applyShade();
  if (!fromHistory) this.pushHistory(hex);
};

App.pushHistory = function (hex) {
  var h = this.history.filter(function (c) { return c !== hex; });
  h.unshift(hex);
  this.history = h.slice(0, 12);
  store('history', JSON.stringify(this.history));
  this.renderHistory();
};

App.renderHistory = function () {
  var row = $('history-row');
  row.innerHTML = '';
  var self = this;
  this.history.forEach(function (hex) {
    var b = document.createElement('button');
    b.className = 'swatch hist';
    b.style.background = hex;
    b.setAttribute('aria-label', hex);
    b.onclick = function () { self.setColor(hex, true); };
    row.appendChild(b);
  });
};

App.renderPalette = function () {
  var pal = this.palettes[this.paletteIdx];
  $('pal-name').textContent = pal.name;
  var grid = $('pal-grid');
  grid.innerHTML = '';
  var self = this;
  pal.colors.forEach(function (hex) {
    var b = document.createElement('button');
    b.className = 'swatch' + (hex.toLowerCase() === self.baseColor.toLowerCase() ? ' sel' : '');
    b.style.background = hex;
    b.setAttribute('aria-label', hex);
    b.onclick = function () { self.setColor(hex); self.renderPalette(); };
    grid.appendChild(b);
  });
  // dots
  var dots = $('pal-dots');
  dots.innerHTML = '';
  this.palettes.forEach(function (p, i) {
    var d = document.createElement('button');
    d.className = 'dot' + (i === self.paletteIdx ? ' sel' : '');
    d.setAttribute('aria-label', p.name);
    d.onclick = function () { self.paletteIdx = i; self.renderPalette(); };
    dots.appendChild(d);
  });
};

App.renderSlots = function () {
  var wrap = $('slots');
  wrap.innerHTML = '';
  var self = this;
  this.slots.forEach(function (hex, i) {
    var b = document.createElement('button');
    b.className = 'slot';
    b.style.background = hex || 'transparent';
    b.innerHTML = hex ? '' : '<span>+' + (i + 1) + '</span>';
    b.title = hex ? hex + ' — tap to use, hold to replace' : 'Hold to store current color';
    var timer = null;
    b.addEventListener('pointerdown', function () {
      timer = setTimeout(function () {
        self.slots[i] = self.color;
        store('slots', JSON.stringify(self.slots));
        self.renderSlots();
        self.blip(660);
        timer = null;
      }, 550);
    });
    b.addEventListener('pointerup', function () {
      if (timer) { clearTimeout(timer); timer = null; if (hex) self.setColor(hex); }
    });
    b.addEventListener('pointerleave', function () { if (timer) { clearTimeout(timer); timer = null; } });
    wrap.appendChild(b);
  });
};

/* ------------------------------------------------------------------ */
/* Input: paint strokes, pinch zoom/pan, gesture shortcuts             */
/* ------------------------------------------------------------------ */

App.pointers = {};       // pointerId -> {x, y, t0, moved}
App.gesture = null;      // 'paint' | 'pinch' | null
App.pinch = null;

App.bindInput = function () {
  var self = this;
  var cv = $('paint');

  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', function (e) { self.onDown(e); });
  cv.addEventListener('pointermove', function (e) { self.onMove(e); });
  cv.addEventListener('pointerup', function (e) { self.onUp(e); });
  cv.addEventListener('pointercancel', function (e) { self.onUp(e); });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
};

App.onDown = function (e) {
  e.preventDefault();
  this.wakeAudio();
  var now = performance.now();
  this.pointers[e.pointerId] = { x: e.clientX, y: e.clientY, t0: now, moved: 0 };
  var n = Object.keys(this.pointers).length;

  if (n === 1) {
    this.gesture = 'paint';
    var pt = this.toPage(e.clientX, e.clientY);
    if (this.fillMode) {
      this.fillTap = { x: pt[0], y: pt[1], t0: now, moved: 0 };
    } else {
      this.gl.beginStroke(this.medium, this.color, this.brushSize, {
        lineAssist: this.lineAssist, mask: this.mask, pageId: this.pageId
      });
      this.gl.addPoint(pt[0], pt[1], e.pressure || 0, now);
      this.strokeSound();
    }
    this.pokeZen();
  } else if (n === 2) {
    // switch to pinch: cancel any in-progress paint stroke
    if (this.gl.current) { this.gl.endStroke(); }
    this.gesture = 'pinch';
    var ids = Object.keys(this.pointers);
    var a = this.pointers[ids[0]], b = this.pointers[ids[1]];
    this.pinch = {
      d0: Math.hypot(a.x - b.x, a.y - b.y),
      v: JSON.parse(JSON.stringify(this.view)),
      t0: now, moved: 0, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2
    };
  } else if (n === 3) {
    this.gesture = 'multi';
    this.multiT0 = now;
  }
};

App.onMove = function (e) {
  var p = this.pointers[e.pointerId];
  if (!p) return;
  var dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.moved += Math.abs(dx) + Math.abs(dy);
  p.x = e.clientX; p.y = e.clientY;

  if (this.gesture === 'paint' && Object.keys(this.pointers).length === 1) {
    var now = performance.now();
    if (this.fillMode) {
      if (this.fillTap) this.fillTap.moved += Math.abs(dx) + Math.abs(dy);
      return;
    }
    var evts = (e.getCoalescedEvents && e.getCoalescedEvents()) || [e];
    for (var i = 0; i < evts.length; i++) {
      var pt = this.toPage(evts[i].clientX, evts[i].clientY);
      this.gl.addPoint(pt[0], pt[1], evts[i].pressure || 0, now);
    }
    this.gl.render();
  } else if (this.gesture === 'pinch' && this.pinch) {
    var ids = Object.keys(this.pointers);
    if (ids.length < 2) return;
    var a = this.pointers[ids[0]], b = this.pointers[ids[1]];
    var d = Math.hypot(a.x - b.x, a.y - b.y);
    var ncx = (a.x + b.x) / 2, ncy = (a.y + b.y) / 2;
    this.pinch.moved += Math.abs(d - (this.pinch.lastD || this.pinch.d0));
    this.pinch.lastD = d;
    var v = this.view, pv = this.pinch.v;
    var ns = clamp(pv.scale * d / this.pinch.d0, 1, 5);
    // zoom around pinch midpoint
    v.scale = ns;
    v.tx = pv.tx + (ncx - this.pinch.cx);
    v.ty = pv.ty + (ncy - this.pinch.cy);
    this.clampView();
    this.applyView();
  }
};

App.onUp = function (e) {
  var p = this.pointers[e.pointerId];
  var now = performance.now();
  delete this.pointers[e.pointerId];
  var n = Object.keys(this.pointers).length;

  if (this.gesture === 'paint' && n === 0) {
    if (this.fillMode && this.fillTap) {
      if (this.fillTap.moved < 24 && now - this.fillTap.t0 < 600) {
        this.doFill(this.fillTap.x, this.fillTap.y);
      }
      this.fillTap = null;
    } else {
      var s = this.gl.endStroke();
      if (s) { this.sessionStrokes.push(s); this.strokes++; this.saveSession(); }
      this.gl.render();
    }
    this.gesture = null;
  } else if (this.gesture === 'pinch') {
    if (this.pinch && now - this.pinch.t0 < 260 && (this.pinch.moved || 0) < 24 && n === 0) {
      this.doUndo(); // two-finger tap = undo
    }
    this.pinch = null;
    if (n === 0) this.gesture = null;
    else if (n === 1) { this.gesture = null; } // remaining finger lifts cleanly
  } else if (this.gesture === 'multi' && n === 0) {
    if (now - this.multiT0 < 300) this.toggleChrome(); // three-finger tap
    this.gesture = null;
  }
  if (n === 0) { this.gesture = null; this.pinch = null; }
};

App.clampView = function () {
  var v = this.view;
  // keep some part of the stage on screen
  var vw = window.innerWidth, vh = window.innerHeight;
  var sw = this.pageW * this.fitScale * v.scale, sh = this.pageH * this.fitScale * v.scale;
  var mx = sw / 2, my = sh / 2;
  v.tx = clamp(v.tx, -mx, mx);
  v.ty = clamp(v.ty, -my, my);
};

App.doFill = function (x, y) {
  if (!this.mask) { this.toast('Fill needs a line-art page — try a page, not blank canvas'); return; }
  var ok = this.gl.floodFill(x, y, this.color, this.mask, this.pageId);
  if (ok) {
    this.sessionStrokes.push(this.gl.strokes[this.gl.strokes.length - 1]);
    this.strokes++;
    this.fillSound();
    this.gl.render();
    this.saveSession();
  } else {
    this.toast('Tap inside a closed shape');
  }
};

App.doUndo = function () {
  if (this.gl.undo()) {
    this.sessionStrokes.pop();
    this.strokes = Math.max(0, this.strokes - 1);
    this.gl.render();
    this.saveSession();
    this.blip(440);
    return true;
  }
  return false;
};

// Zen: chrome auto-hides while painting, reappears on demand.
App.pokeZen = function () {
  var chrome = $('chrome');
  chrome.classList.remove('hidden');
  clearTimeout(this.zenTimer);
  var self = this;
  this.zenTimer = setTimeout(function () {
    if (!self.sheetOpen) chrome.classList.add('hidden');
  }, 3200);
};
App.toggleChrome = function () {
  $('chrome').classList.toggle('hidden');
  this.pokeZen();
};

/* ------------------------------------------------------------------ */
/* Audio: tiny soft synth, gesture-gated                               */
/* ------------------------------------------------------------------ */

App.audioCtx = null;
App.wakeAudio = function () {
  if (this.audioCtx) { if (this.audioCtx.state === 'suspended') this.audioCtx.resume(); return; }
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new AC();
    this.master = this.audioCtx.createGain();
    this.master.gain.value = 0.14;
    this.master.connect(this.audioCtx.destination);
  } catch (e) {}
};
App.noiseBurst = function (freq, dur, gain) {
  if (!this.audioCtx || !this.soundOn) return;
  var ctx = this.audioCtx, t = ctx.currentTime;
  var len = Math.floor(ctx.sampleRate * dur);
  var buf = ctx.createBuffer(1, len, ctx.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  var src = ctx.createBufferSource(); src.buffer = buf;
  var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
  var g = ctx.createGain(); g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(this.master);
  src.start(t);
};
App.tone = function (f0, f1, dur, gain) {
  if (!this.audioCtx || !this.soundOn) return;
  var ctx = this.audioCtx, t = ctx.currentTime;
  var o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  var g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(this.master);
  o.start(t); o.stop(t + dur + 0.05);
};
App.strokeSound = function () { this.noiseBurst(2600 + Math.random() * 800, 0.12, 0.5); };
App.fillSound = function () { this.tone(420, 640, 0.18, 0.5); };
App.blip = function (f) { this.tone(f, f * 1.2, 0.07, 0.35); };

/* ------------------------------------------------------------------ */
/* Sessions: autosave + restore per page                               */
/* ------------------------------------------------------------------ */

App.saveSession = function () {
  if (!this.gl) return;
  try {
    var strokes = this.gl.strokes.map(function (s) {
      if (s.type === 'fill') return { type: 'fill', x: s.x, y: s.y, colorHex: s.colorHex, pageId: s.pageId };
      // decimate points for storage
      var pts = [];
      for (var i = 0; i < s.points.length; i += 3) pts.push([Math.round(s.points[i][0]), Math.round(s.points[i][1]), +s.points[i][2].toFixed(2)]);
      return { type: 'stroke', medium: s.medium, colorHex: s.colorHex, size: +(s.size / 2).toFixed(1), points: pts, tipIdx: s.tipIdx, pageId: s.pageId };
    });
    store('page:' + this.pageId, JSON.stringify({ v: 1, strokes: strokes }));
  } catch (e) {}
};

App.restoreSession = function () {
  var raw = read('page:' + this.pageId);
  if (!raw) return;
  try {
    var data = JSON.parse(raw);
    var self = this;
    data.strokes.forEach(function (s) {
      if (s.type === 'fill') {
        if (self.mask) { self.gl.strokes.push({ type: 'fill', x: s.x, y: s.y, colorHex: s.colorHex, pageId: s.pageId, mask: self.mask }); }
      } else {
        self.gl.strokes.push({
          type: 'stroke', medium: s.medium,
          color: self.gl.hexToRgb(s.colorHex), colorHex: s.colorHex,
          size: s.size * 2, // stored halved (dpr-agnostic-ish); engine multiplies on begin only
          points: s.points.map(function (p) { return [p[0], p[1], p[2], 0]; }),
          tipIdx: s.tipIdx, lineAssist: false, mask: null,
          spacing: 0.12, pageId: s.pageId
        });
      }
    });
    // sizes were stored in css px; engine dabs use backing px — fix up:
    this.gl.strokes.forEach(function (s) {
      if (s.type === 'stroke') s.size = s.size * self.gl.dpr;
    });
    this.gl._repaintAll();
    this.gl.render();
  } catch (e) {}
};

/* ------------------------------------------------------------------ */
/* Chrome (toolbar) + sheets                                           */
/* ------------------------------------------------------------------ */

App.sheetOpen = false;

App.updateChrome = function () {
  $('medium-pencil').classList.toggle('sel', this.medium === 'pencil');
  $('medium-oil').classList.toggle('sel', this.medium === 'oil');
  $('fill-btn').classList.toggle('sel', this.fillMode);
  $('assist-btn').classList.toggle('sel', this.lineAssist);
  $('sound-btn').textContent = this.soundOn ? '🔊' : '🔇';
  $('well').style.background = this.color;
  $('size-val').textContent = this.brushSize;
};

App.toast = function (msg) {
  var t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(this.toastTimer);
  this.toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
};

App.openSheet = function (id) {
  var self = this;
  document.querySelectorAll('.sheet').forEach(function (s) { s.classList.remove('open'); });
  if (id) {
    $(id).classList.add('open');
    this.sheetOpen = true;
    if (id === 'pages-sheet') this.renderPagesSheet();
    if (id === 'gallery-sheet') this.renderGallery();
  } else {
    this.sheetOpen = false;
    this.magicStop();
  }
  this.pokeZen();
};

App.renderPagesSheet = function () {
  var grid = $('pages-grid');
  grid.innerHTML = '';
  var self = this;
  var cats = {};
  this.pages.forEach(function (p) { (cats[p.category] = cats[p.category] || []).push(p); });
  Object.keys(cats).forEach(function (cat) {
    var h = document.createElement('h3');
    h.textContent = cat;
    grid.appendChild(h);
    var row = document.createElement('div');
    row.className = 'page-row';
    cats[cat].forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'page-card' + (p.id === self.pageId ? ' sel' : '');
      b.innerHTML = '<div class="thumb">' +
        (p.svg ? '<img src="' + p.svg + '" alt="">' : (p.raster ? '<img src="' + p.raster + '" alt="">' : '<div class="blank-thumb"></div>')) +
        '</div><span>' + p.title + '</span>';
      b.onclick = function () { self.openSheet(null); self.setPage(p.id); };
      row.appendChild(b);
    });
    grid.appendChild(row);
  });
};

App.bindChrome = function () {
  var self = this;
  $('medium-pencil').onclick = function () { self.medium = 'pencil'; self.fillMode = false; self.updateChrome(); self.blip(520); };
  $('medium-oil').onclick = function () { self.medium = 'oil'; self.fillMode = false; self.updateChrome(); self.blip(520); };
  $('fill-btn').onclick = function () { self.fillMode = !self.fillMode; self.updateChrome(); self.toast(self.fillMode ? 'Tap a shape to fill it' : 'Freehand painting'); };
  $('assist-btn').onclick = function () { self.lineAssist = !self.lineAssist; self.updateChrome(); self.toast(self.lineAssist ? 'Stay-inside-lines on' : 'Stay-inside-lines off'); };
  $('undo-btn').onclick = function () { self.doUndo(); };
  $('sound-btn').onclick = function () { self.soundOn = !self.soundOn; store('sound', self.soundOn ? '1' : '0'); self.updateChrome(); };
  $('well').onclick = function () { self.openSheet('color-sheet'); };
  $('size').addEventListener('input', function (e) { self.brushSize = +e.target.value; self.updateChrome(); });
  $('shade').addEventListener('input', function (e) { self.shade = +e.target.value; self.applyShade(); });
  $('shade').addEventListener('change', function () { self.pushHistory(self.color); });
  $('pages-btn').onclick = function () { self.openSheet('pages-sheet'); };
  $('gallery-btn').onclick = function () { self.openSheet('gallery-sheet'); };
  $('ai-btn').onclick = function () { self.openSheet('ai-sheet'); };
  $('finish-btn').onclick = function () { self.finishPiece(); };
  $('clear-btn').onclick = function () {
    if (confirm('Clear this page and start over?')) { self.gl.clear(); self.sessionStrokes = []; self.gl.render(); self.saveSession(); }
  };
  $('sheet-close') && ($('sheet-close').onclick = function () { self.openSheet(null); });
  document.querySelectorAll('.sheet-x').forEach(function (b) {
    b.onclick = function () { self.openSheet(null); };
  });
  document.querySelectorAll('.sheet').forEach(function (s) {
    s.addEventListener('click', function (e) { if (e.target === s) self.openSheet(null); });
  });
  $('pal-prev').onclick = function () { self.paletteIdx = (self.paletteIdx + self.palettes.length - 1) % self.palettes.length; self.renderPalette(); };
  $('pal-next').onclick = function () { self.paletteIdx = (self.paletteIdx + 1) % self.palettes.length; self.renderPalette(); };
  $('zen-btn').onclick = function () { self.toggleChrome(); };
  window.addEventListener('resize', function () { self.fitStage(); });
};

/* ------------------------------------------------------------------ */
/* Gallery: finish pieces, PNG export                                 */
/* ------------------------------------------------------------------ */

App.finishPiece = function () {
  var self = this;
  this.gl.render();
  // composite GL canvas + line art into a 2D canvas for export
  var w = this.gl.pageW, h = this.gl.pageH;
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  var x = c.getContext('2d');
  x.drawImage($('paint'), 0, 0);
  var art = $('lineart');
  if (art.style.display !== 'none' && art.naturalWidth) x.drawImage(art, 0, 0, w, h);
  var url = c.toDataURL('image/jpeg', 0.88);
  var thumb = this.makeThumb(c);
  var pieces = this.getPieces();
  pieces.unshift({ id: 'p' + Date.now(), title: this.pageTitle, ts: Date.now(), img: thumb, full: url });
  pieces = pieces.slice(0, 24);
  store('pieces', JSON.stringify(pieces));
  this.renderGallery();
  this.openSheet('gallery-sheet');
  this.toast('Saved to your gallery');
  this.tone(523, 784, 0.25, 0.4);
};

App.makeThumb = function (srcCanvas) {
  var t = document.createElement('canvas');
  var s = 480 / srcCanvas.width;
  t.width = 480; t.height = Math.round(srcCanvas.height * s);
  t.getContext('2d').drawImage(srcCanvas, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.72);
};

App.getPieces = function () {
  try { return JSON.parse(read('pieces') || '[]'); } catch (e) { return []; }
};

App.renderGallery = function () {
  var grid = $('gallery-grid');
  grid.innerHTML = '';
  var self = this;
  var pieces = this.getPieces();
  if (!pieces.length) {
    grid.innerHTML = '<p class="empty">No finished pieces yet.<br>Paint something, then tap ✓ Finish.</p>';
    return;
  }
  pieces.forEach(function (p) {
    var d = document.createElement('div');
    d.className = 'g-card';
    var date = new Date(p.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    d.innerHTML = '<img src="' + p.img + '" alt=""><span>' + p.title + ' · ' + date + '</span>' +
      '<div class="g-actions"><button data-a="dl">PNG</button><button data-a="del">✕</button></div>';
    d.querySelector('[data-a="dl"]').onclick = function (ev) {
      ev.stopPropagation();
      var a = document.createElement('a');
      a.href = p.full; a.download = 'still-life-' + p.id + '.jpg';
      a.click();
    };
    d.querySelector('[data-a="del"]').onclick = function (ev) {
      ev.stopPropagation();
      if (!confirm('Delete this piece?')) return;
      store('pieces', JSON.stringify(self.getPieces().filter(function (q) { return q.id !== p.id; })));
      self.renderGallery();
    };
    grid.appendChild(d);
  });
};

/* ------------------------------------------------------------------ */
/* Time-lapse: replay the session as a shareable video                 */
/* ------------------------------------------------------------------ */

App.nextFrame = function () { return new Promise(function (r) { requestAnimationFrame(r); }); };

App.playTimelapse = function () {
  var self = this;
  if (!this.sessionStrokes.length) { this.toast('Paint something first'); return; }
  this.openSheet(null);
  this.toast('Replaying your session…');
  var stream = $('paint').captureStream(30);
  var mime = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].filter(function (m) {
    return window.MediaRecorder && MediaRecorder.isTypeSupported(m);
  })[0];
  if (!mime) { this.toast('Video recording not supported here'); return; }
  var rec, chunks = [];
  try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6000000 }); }
  catch (e) { this.toast('Could not start recording'); return; }
  rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
  rec.start(200);

  // snapshot current work, replay from blank
  var saved = this.gl.strokes.slice();
  this.gl.strokes = [];
  this.gl._repaintAll();

  var strokes = this.sessionStrokes.slice();
  var totalFrames = Math.max(60, Math.min(360, strokes.length * 4));
  var perFrame = Math.max(1, Math.ceil(strokes.length / totalFrames));
  var i = 0;
  this.timelapseDone = false;

  function step() {
    for (var k = 0; k < perFrame && i < strokes.length; k++, i++) {
      self.gl._replayStroke(strokes[i]);
      self.gl.strokes.push(strokes[i]);
    }
    self.gl.render();
    if (i < strokes.length) { requestAnimationFrame(step); return; }
    setTimeout(function () {
      rec.stop();
      // restore
      self.gl.strokes = saved;
      self.gl._repaintAll();
      self.gl.render();
    }, 700);
  }
  rec.onstop = function () {
    var blob = new Blob(chunks, { type: mime });
    var url = URL.createObjectURL(blob);
    self.showTimelapse(url, mime);
  };
  requestAnimationFrame(step);
};

App.showTimelapse = function (url, mime) {
  var sheet = $('timelapse-sheet');
  sheet.querySelector('video').src = url;
  var dl = $('tl-download');
  dl.href = url;
  dl.download = 'still-life-timelapse.' + (mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm');
  this.openSheet('timelapse-sheet');
  // share if available
  var share = $('tl-share');
  var self = this;
  fetch(url).then(function (r) { return r.blob(); }).then(function (blob) {
    var file = new File([blob], dl.download, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      share.style.display = '';
      share.onclick = function () { navigator.share({ files: [file], title: 'Still Life' }); };
    } else share.style.display = 'none';
  }).catch(function () { share.style.display = 'none'; });
};

/* ------------------------------------------------------------------ */
/* AI: photo -> line art (client-side), palette studio + daily (worker)*/
/* ------------------------------------------------------------------ */

var AI_BASE = 'https://gamez-ai.chaoticutopia84.workers.dev';
var STILL_AI = 'https://still-life-ai.chaoticutopia84.workers.dev';

App.aiBusy = function (on, msg) {
  var b = $('ai-status');
  b.style.display = on ? 'block' : 'none';
  if (on && msg) b.textContent = msg;
};

// 1) Photo -> line art, fully client-side (Sobel edges + cleanup). Offline OK.
App.photoToLineArt = function (file) {
  var self = this;
  this.aiBusy(true, 'Turning your photo into line art…');
  var img = new Image();
  img.onload = function () {
    try {
      var maxE = 1000;
      var s = Math.min(1, maxE / Math.max(img.naturalWidth, img.naturalHeight));
      var w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      var x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, w, h);
      var src = x.getImageData(0, 0, w, h).data;
      var gray = new Float32Array(w * h);
      for (var i = 0; i < w * h; i++)
        gray[i] = src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114;
      // gentle smooth (3x3 box) to kill noise
      var sm = new Float32Array(w * h);
      for (var y = 1; y < h - 1; y++) for (var xx = 1; xx < w - 1; xx++) {
        var acc = 0;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++)
          acc += gray[(y + dy) * w + xx + dx];
        sm[y * w + xx] = acc / 9;
      }
      // Sobel magnitude
      var out = x.createImageData(w, h), od = out.data;
      var K = 90; // edge threshold
      for (var yy = 1; yy < h - 1; yy++) for (var xxx = 1; xxx < w - 1; xxx++) {
        var i00 = (yy - 1) * w + xxx - 1;
        var gx = -sm[i00] - 2 * sm[i00 + w] - sm[i00 + 2 * w] + sm[i00 + 2] + 2 * sm[i00 + w + 2] + sm[i00 + 2 * w + 2];
        var gy = -sm[i00] - 2 * sm[i00 + 1] - sm[i00 + 2] + sm[i00 + 2 * w] + 2 * sm[i00 + 2 * w + 1] + sm[i00 + 2 * w + 2];
        var m = Math.sqrt(gx * gx + gy * gy);
        var o = (yy * w + xxx) * 4;
        var line = m > K ? 43 : 255; // #2b2b2b lines on white
        od[o] = od[o + 1] = od[o + 2] = line; od[o + 3] = 255;
      }
      x.putImageData(out, 0, 0);
      var url = c.toDataURL('image/png');
      var page = {
        id: 'photo-' + Date.now(), title: 'My Photo', category: 'My Photos', raster: url
      };
      self.pages.push(page);
      self.saveCustomPages();
      self.aiBusy(false);
      self.openSheet(null);
      self.setPage(page.id);
      self.toast('Your photo is ready to color');
    } catch (e) { self.aiBusy(false); self.toast('Could not process that photo'); }
    URL.revokeObjectURL(img.src);
  };
  img.onerror = function () { self.aiBusy(false); self.toast('Could not read that photo'); };
  img.src = URL.createObjectURL(file);
};

App.saveCustomPages = function () {
  var customs = this.pages.filter(function (p) { return p.id.indexOf('photo-') === 0 || p.id.indexOf('daily-') === 0; });
  // raster dataURLs can be big; keep only the 6 most recent customs
  customs = customs.slice(-6);
  store('custom-pages', JSON.stringify(customs));
};

// 2) AI palette studio: mood -> curated palette (worker, fallback local).
App.paletteStudio = function (mood) {
  var self = this;
  mood = (mood || '').trim();
  if (!mood) { this.toast('Type a mood first — try “desert sunset”'); return; }
  this.aiBusy(true, 'Dreaming up a palette…');
  var done = false;
  function fallback() {
    if (done) return; done = true;
    self.aiBusy(false);
    var pal = self.localMoodPalette(mood);
    self.palettes.unshift({ name: '✨ ' + mood.slice(0, 18), colors: pal });
    self.paletteIdx = 0;
    self.renderPalette();
    self.toast('Palette ready (offline mix)');
  }
  var timer = setTimeout(fallback, 9000);
  fetch(AI_BASE + '/g', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'palette', game: 'still-life', ctx: { mood: mood } })
  }).then(function (r) { return r.json(); })
    .then(function (j) {
      if (done) return; done = true; clearTimeout(timer);
      self.aiBusy(false);
      var m = String((j && j.text) || '').match(/\[[^\]]*\]/);
      var colors = null;
      try { colors = JSON.parse(m ? m[0] : 'null'); } catch (e) {}
      if (!Array.isArray(colors) || colors.length < 5) { fallback(); return; }
      colors = colors.filter(function (c) { return /^#[0-9a-fA-F]{6}$/.test(c); }).slice(0, 9);
      if (colors.length < 5) { fallback(); return; }
      self.palettes.unshift({ name: '✨ ' + mood.slice(0, 18), colors: colors });
      self.paletteIdx = 0;
      self.renderPalette();
      self.toast('Palette ready');
    })
    .catch(fallback);
};

App.localMoodPalette = function (mood) {
  var m = mood.toLowerCase();
  function pick(i) { return App.palettes[i % App.palettes.length].colors; }
  if (/ocean|sea|water|blue/.test(m)) return pick(2);
  if (/sunset|dusk|evening/.test(m)) return pick(1);
  if (/forest|leaf|green|garden/.test(m)) return pick(0);
  if (/desert|sand|warm/.test(m)) return pick(9);
  if (/autumn|fall|october/.test(m)) return pick(6);
  if (/neon|night|cyber|party/.test(m)) return pick(5);
  if (/pastel|soft|baby|calm/.test(m)) return pick(3);
  if (/candy|sweet|pop/.test(m)) return pick(8);
  // deterministic pseudo-pick from the mood string
  var h = 0;
  for (var i = 0; i < m.length; i++) h = (h * 31 + m.charCodeAt(i)) >>> 0;
  return pick(h);
};

// 3) Daily AI page (worker; falls back to a seeded built-in until deployed).
App.dailyPage = function () {
  var self = this;
  var today = new Date().toISOString().slice(0, 10);
  var have = null;
  for (var i = 0; i < this.pages.length; i++)
    if (this.pages[i].id === 'daily-' + today) have = this.pages[i];
  if (have) { this.openSheet(null); this.setPage(have.id); return; }
  this.aiBusy(true, 'Fetching today’s page…');
  var done = false;
  function fallback() {
    if (done) return; done = true;
    self.aiBusy(false);
    // seeded local pick until the worker is live
    var h = 0;
    for (var k = 0; k < today.length; k++) h = (h * 31 + today.charCodeAt(k)) >>> 0;
    var builtins = self.pages.filter(function (p) { return p.svg; });
    var p = builtins[h % builtins.length];
    self.openSheet(null);
    self.setPage(p.id);
    self.toast('Daily AI pages arrive with the morning update — here’s today’s pick');
  }
  var timer = setTimeout(fallback, 9000);
  fetch(STILL_AI + '/daily').then(function (r) { return r.json(); })
    .then(function (j) {
      if (done || !j || !j.ok || !j.image) { fallback(); return; }
      done = true; clearTimeout(timer);
      self.aiBusy(false);
      var page = { id: 'daily-' + today, title: j.title || 'Daily Page', category: 'Daily', raster: j.image };
      // avoid dupes
      self.pages = self.pages.filter(function (p) { return p.id !== page.id; });
      self.pages.push(page);
      self.saveCustomPages();
      self.openSheet(null);
      self.setPage(page.id);
    })
    .catch(fallback);
};

/* ------------------------------------------------------------------ */
/* Canvas Magic: watch a random painting paint itself, stroke by stroke */
/* ------------------------------------------------------------------ */

var MAGIC_AI = 'https://canvas-magic.chaoticutopia84.workers.dev';

App.magicStop = function () {
  if (this.magicState) this.magicState.running = false;
  this.magicState = null;
  this.magicRun = (this.magicRun || 0) + 1;
  var b = $('magic-brush');
  if (b) b.style.display = 'none';
};

App.magicSetStatus = function (msg) {
  var el = $('magic-status');
  if (el) el.textContent = msg;
};

App.magicProgress = function (frac) {
  var el = $('magic-fill');
  if (el) el.style.width = Math.round(frac * 100) + '%';
};

App.magicButtons = function (on) {
  ['magic-new', 'magic-replay', 'magic-save'].forEach(function (id) {
    var b = $(id);
    if (b) b.disabled = !on;
  });
};

App.magicBlank = function () {
  var cv = $('magic-canvas');
  cv.width = 600; cv.height = 800;
  var x = cv.getContext('2d');
  x.fillStyle = '#f8f3e8';
  x.fillRect(0, 0, 600, 800);
};

App.openMagic = function () {
  var self = this;
  this.wakeAudio();
  this.magicStop();
  var run = this.magicRun;
  this.openSheet('magic-sheet');
  $('magic-title').textContent = 'Canvas Magic';
  this.magicSetStatus('Mixing paints…');
  this.magicProgress(0);
  this.magicButtons(false);
  this.magicBlank();
  var settled = false;
  var timer = setTimeout(function () {
    if (self.magicRun !== run || settled) return;
    settled = true;
    self.magicFallback();
  }, 60000);
  function giveUp() {
    if (self.magicRun !== run || settled) return;
    settled = true;
    clearTimeout(timer);
    self.magicFallback();
  }
  fetch(MAGIC_AI + '/paint?style=' + (self.magicStyle || 'paint')).then(function (r) { return r.json(); })
    .then(function (j) {
      if (self.magicRun !== run || settled) return;
      if (!j || !j.key) { giveUp(); return; }
      $('magic-title').textContent = j.title || 'Untitled';
      self.magicPoll(j.key, j.title || 'Untitled', run,
        function (img) {
          if (self.magicRun !== run || settled) return;
          settled = true;
          clearTimeout(timer);
          self.magicSrcImg = img;
          self.magicPaint(img, j.title || 'Untitled');
        },
        giveUp);
    })
    .catch(giveUp);
};

App.magicPoll = function (key, title, run, onImg, onFail) {
  var self = this, tries = 0;
  this.magicSetStatus('Dreaming up “' + title + '”…');
  (function poll() {
    if (self.magicRun !== run) return;
    tries++;
    fetch(MAGIC_AI + '/paint?key=' + encodeURIComponent(key))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (self.magicRun !== run) return;
        if (j && j.image) {
          var img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = function () { onImg(img); };
          img.onerror = onFail;
          img.src = j.image;
          return;
        }
        if (j && j.pending && tries < 48) {
          self.magicSetStatus('Painting “' + title + '”…');
          setTimeout(poll, 2500);
          return;
        }
        onFail();
      })
      .catch(function () {
        if (self.magicRun !== run) return;
        if (tries < 48) setTimeout(poll, 2500);
        else onFail();
      });
  })();
};

// Offline fallback: a small procedural landscape, painted the same way.
App.magicFallback = function () {
  var c = document.createElement('canvas');
  c.width = 720; c.height = 960;
  var x = c.getContext('2d');
  var sky = x.createLinearGradient(0, 0, 0, 640);
  sky.addColorStop(0, '#7fa8c9');
  sky.addColorStop(0.55, '#e8c9a0');
  sky.addColorStop(1, '#f7b267');
  x.fillStyle = sky;
  x.fillRect(0, 0, 720, 640);
  var glow = x.createRadialGradient(360, 470, 10, 360, 470, 190);
  glow.addColorStop(0, 'rgba(255,244,200,0.95)');
  glow.addColorStop(1, 'rgba(255,244,200,0)');
  x.fillStyle = glow;
  x.fillRect(150, 260, 420, 420);
  x.fillStyle = '#fff3c4';
  x.beginPath(); x.arc(360, 470, 62, 0, 7); x.fill();
  x.fillStyle = '#9db38a';
  x.beginPath();
  x.moveTo(0, 640);
  x.bezierCurveTo(180, 520, 420, 560, 720, 600);
  x.lineTo(720, 720); x.lineTo(0, 720);
  x.closePath(); x.fill();
  var md = x.createLinearGradient(0, 640, 0, 960);
  md.addColorStop(0, '#8aa864');
  md.addColorStop(1, '#5d7f43');
  x.fillStyle = md;
  x.fillRect(0, 640, 720, 320);
  x.fillStyle = '#6b4a33';
  x.fillRect(500, 560, 26, 130);
  x.fillStyle = '#4f7a3d';
  [[513, 520, 95], [450, 570, 70], [578, 572, 72]].forEach(function (cc) {
    x.beginPath(); x.arc(cc[0], cc[1], cc[2], 0, 7); x.fill();
  });
  x.fillStyle = '#5d8a48';
  x.beginPath(); x.arc(490, 500, 60, 0, 7); x.fill();
  x.strokeStyle = '#4a3f35';
  x.lineWidth = 4;
  x.lineCap = 'round';
  [[200, 220], [260, 260], [150, 300]].forEach(function (bp) {
    x.beginPath(); x.arc(bp[0] - 14, bp[1], 14, 3.4, 5.9); x.stroke();
    x.beginPath(); x.arc(bp[0] + 14, bp[1], 14, 3.5, 6.0); x.stroke();
  });
  var cols = ['#e86a5e', '#f2e394', '#ffffff', '#c96a9b'];
  for (var i = 0; i < 90; i++) {
    x.fillStyle = cols[i % 4];
    x.beginPath();
    x.arc(20 + Math.random() * 680, 700 + Math.random() * 240, 4 + Math.random() * 5, 0, 7);
    x.fill();
  }
  this.magicSrcImg = c;
  this.magicPaint(c, 'Meadow Dream · offline sketch');
};

// Soft round brush tip, shared by every dab.
App.magicDot = function () {
  if (this._magicDot) return this._magicDot;
  var c = document.createElement('canvas');
  c.width = c.height = 128;
  var g = c.getContext('2d');
  var gr = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.72, 'rgba(255,255,255,0.9)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  this._magicDot = c;
  return c;
};

// Stamp one dab: copy the matching patch of the source painting
// through a soft, slightly elliptical, rotated brush mask —
// or lay a flat glaze (liquid white) when d.flat is set.
App.magicDab = function (st, d) {
  var r = d.r, rr = Math.ceil(r * 2);
  var t = this._magicTmp;
  if (!t) { t = document.createElement('canvas'); this._magicTmp = t; }
  if (t.width !== rr) { t.width = rr; t.height = rr; }
  var tc = t.getContext('2d');
  tc.clearRect(0, 0, rr, rr);
  tc.globalCompositeOperation = 'source-over';
  if (d.flat) {
    tc.fillStyle = d.flat;
    tc.fillRect(0, 0, rr, rr);
    tc.globalCompositeOperation = 'destination-in';
    tc.drawImage(this.magicDot(), 0, 0, rr, rr);
  } else {
    tc.save();
    tc.translate(rr / 2, rr / 2);
    tc.rotate(d.ang);
    tc.scale(1, 0.72);
    tc.drawImage(st.src, d.x - r, d.y - r, 2 * r, 2 * r, -r, -r, 2 * r, 2 * r);
    tc.globalCompositeOperation = 'destination-in';
    tc.drawImage(this.magicDot(), -r, -r, 2 * r, 2 * r);
    tc.restore();
    tc.globalCompositeOperation = 'source-over';
  }
  st.x.save();
  st.x.globalAlpha = d.a;
  st.x.drawImage(t, d.x - r, d.y - r);
  st.x.restore();
};

App.magicPaint = function (img, title) {
  var self = this;
  this.magicStop();
  this.magicTitle = title;
  var cv = $('magic-canvas');
  var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  var s = Math.min(1, 880 / Math.max(iw, ih));
  var w = Math.max(2, Math.round(iw * s)), h = Math.max(2, Math.round(ih * s));
  cv.width = w; cv.height = h;
  var x = cv.getContext('2d');
  x.fillStyle = '#f8f3e8';
  x.fillRect(0, 0, w, h);
  var src = document.createElement('canvas');
  src.width = w; src.height = h;
  src.getContext('2d').drawImage(img, 0, 0, w, h);

  // The engine studies the painting and plans real brushstrokes.
  // Guaranteed to finish: if the engine fails or plans nothing, the
  // painting is revealed directly rather than stalling mid-performance.
  var plan = null;
  try {
    plan = MagicEngine.plan(src, w, h, self.magicStyle || 'paint');
  } catch (e) { plan = null; }
  if (!plan || !plan.strokes || !plan.strokes.length) {
    x.drawImage(src, 0, 0);
    this.magicProgress(1);
    this.magicDone();
    return;
  }
  var strokes = plan.strokes, S = strokes.length, D = plan.totalDabs;
  // Pacing: a slow, deliberate ~80s performance. The brush travels to each
  // stroke, pauses a beat like it's deciding, then paints it.
  var travelT = 0.17, pauseT = 0.08;
  var paintRate = D / Math.max(25, 80 - S * (travelT + pauseT));
  paintRate = Math.max(28, Math.min(220, paintRate));
  var state = {
    running: true, strokes: strokes, si: 0, pi: 0,
    mode: 'travel', t: 0, acc: 0, last: 0, swish: 0,
    x: x, src: src, w: w, h: h,
    dabsDone: 0, totalDabs: D,
    brushX: w * 0.5, brushY: h * 0.5, fromX: w * 0.5, fromY: h * 0.5,
    paintRate: paintRate, travelT: travelT, pauseT: pauseT
  };
  this.magicState = state;
  $('magic-title').textContent = title;
  this.magicSetStatus('Studying the canvas…');
  this.magicProgress(0);
  this.magicButtons(false);
  var brush = $('magic-brush');
  brush.style.display = 'block';
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    x.drawImage(src, 0, 0);
    state.dabsDone = D;
    this.magicDone();
    return;
  }
  state.last = performance.now();
  state.passName = null;
  function frame(now) {
    if (!state.running) return;
    try {
      frameInner(now);
    } catch (e) {
      // never stall mid-painting: reveal what's left and finish
      try { x.drawImage(src, 0, 0); } catch (e2) {}
      self.magicDone();
      return;
    }
  }
  function frameInner(now) {
    var dt = Math.min(0.1, (now - state.last) / 1000);
    state.last = now;
    state.t += dt;
    var st = strokes[state.si];
    // narrate the Bob Ross beats as the passes change
    if (st.passName !== state.passName) {
      state.passName = st.passName;
      self.magicSetStatus(st.passName);
    }

    if (state.mode === 'travel') {
      // brush glides to the next stroke's starting point
      var tt = Math.max(0.02, state.travelT);
      var k = Math.min(1, state.t / tt);
      var e = 1 - Math.pow(1 - k, 3);
      state.brushX = state.fromX + (st.pts[0].x - state.fromX) * e;
      state.brushY = state.fromY + (st.pts[0].y - state.fromY) * e;
      if (k >= 1) { state.mode = 'pause'; state.t = 0; }
    } else if (state.mode === 'pause') {
      // the beat before the brush touches down
      if (state.t >= state.pauseT) {
        state.mode = 'paint'; state.t = 0; state.pi = 0; state.acc = 0;
        self.noiseBurst(750 + Math.random() * 250, 0.28, 0.10);
      }
    } else {
      state.acc += dt * state.paintRate;
      var n = Math.floor(state.acc);
      state.acc -= n;
      for (var i = 0; i < n && state.pi < st.pts.length; i++) {
        var p = st.pts[state.pi];
        self.magicDab(state, { x: p.x, y: p.y, r: st.r, a: st.a, ang: p.a, flat: st.flat });
        state.brushX = p.x; state.brushY = p.y;
        state.pi++; state.dabsDone++;
      }
      state.swish += dt;
      if (state.swish > 0.7) {
        state.swish = 0;
        self.noiseBurst(1500 + Math.random() * 700, 0.18, 0.07);
      }
      if (state.pi >= st.pts.length) {
        state.fromX = state.brushX; state.fromY = state.brushY;
        state.si++;
        if (state.si >= strokes.length) { self.magicDone(); return; }
        state.mode = 'travel'; state.t = 0;
      }
    }

    self.magicProgress(state.dabsDone / state.totalDabs);
    if (cv.clientWidth) {
      var sc = cv.clientWidth / w;
      brush.style.left = (state.brushX * sc) + 'px';
      brush.style.top = (state.brushY * sc) + 'px';
    }
    requestAnimationFrame(frame);
  }
  // a small beat before the first stroke, like deciding where to begin
  setTimeout(function () {
    if (!state.running) return;
    self.magicSetStatus('Painting…');
    requestAnimationFrame(frame);
  }, 900);
};

App.magicDone = function () {
  var self = this;
  if (this.magicState) this.magicState.running = false;
  this.magicState = null;
  var b = $('magic-brush');
  if (b) b.style.display = 'none';
  this.magicProgress(1);
  this.magicSetStatus('Finished — “' + (this.magicTitle || 'Untitled') + '”');
  this.magicButtons(true);
  this.tone(523, 784, 0.3, 0.4);
  setTimeout(function () { self.blip(1046); }, 200);
};

App.magicReplay = function () {
  if (this.magicSrcImg) this.magicPaint(this.magicSrcImg, this.magicTitle || 'Untitled');
};

App.setMagicStyle = function (s) {
  if (this.magicStyle === s) return;
  this.magicStyle = s;
  $('magic-style-paint').classList.toggle('sel', s === 'paint');
  $('magic-style-sketch').classList.toggle('sel', s === 'sketch');
  this.openMagic();
};

App.magicSave = function () {
  var cv = $('magic-canvas');
  if (!cv || !cv.width) return;
  try {
    var url = cv.toDataURL('image/jpeg', 0.88);
    var pieces = this.getPieces();
    pieces.unshift({
      id: 'm' + Date.now(),
      title: '✨ ' + (this.magicTitle || 'Canvas Magic'),
      ts: Date.now(), img: this.makeThumb(cv), full: url
    });
    store('pieces', JSON.stringify(pieces.slice(0, 24)));
    this.openSheet('gallery-sheet');
    this.toast('Saved to your gallery');
    this.tone(523, 784, 0.25, 0.4);
  } catch (e) { this.toast('Could not save that one'); }
};

App.bindAI = function () {
  var self = this;
  $('photo-input').addEventListener('change', function (e) {
    if (e.target.files && e.target.files[0]) self.photoToLineArt(e.target.files[0]);
    e.target.value = '';
  });
  $('photo-btn').onclick = function () { $('photo-input').click(); };
  $('mood-go').onclick = function () { self.paletteStudio($('mood-input').value); };
  $('mood-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') self.paletteStudio(e.target.value); });
  $('daily-btn').onclick = function () { self.dailyPage(); };
  $('magic-btn').onclick = function () { self.openMagic(); };
  $('magic-new').onclick = function () { self.openMagic(); };
  $('magic-replay').onclick = function () { self.magicReplay(); };
  $('magic-save').onclick = function () { self.magicSave(); };
  $('magic-style-paint').onclick = function () { self.setMagicStyle('paint'); };
  $('magic-style-sketch').onclick = function () { self.setMagicStyle('sketch'); };
  $('timelapse-btn').onclick = function () { self.playTimelapse(); };
};

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

App.init = function () {
  var self = this;
  // state from storage
  try {
    this.history = JSON.parse(read('history') || '[]');
    this.slots = JSON.parse(read('slots') || '[null,null,null]');
  } catch (e) {}
  this.soundOn = read('sound') !== '0';
  this.magicStyle = 'paint';

  // engine
  this.gl = new StillGL();
  try {
    this.gl.init($('paint'), this.pageW, this.pageH);
  } catch (e) {
    document.body.innerHTML =
      '<div style="padding:40px;font-family:serif;text-align:center;color:#5b4a3a">' +
      '<h1>Still Life</h1><p>This quiet corner needs WebGL2, which your browser ' +
      'didn’t offer just now.<br>Try Safari or Chrome on a recent phone.</p></div>';
    return;
  }
  // keep the GL canvas crisp: CSS size handled by fitStage
  $('paint').style.width = '100%';
  $('paint').style.height = '100%';
  $('lineart').style.width = '100%';
  $('lineart').style.height = '100%';

  this.loadPages();
  this.bindInput();
  this.bindChrome();
  this.bindAI();
  this.renderPalette();
  this.renderHistory();
  this.renderSlots();
  this.setColor(this.history[0] || '#3b6ea5', true);
  this.setPage('blank');
  this.updateChrome();
  this.pokeZen();

  // render loop: on-demand
  (function loop() {
    requestAnimationFrame(loop);
    self.gl.render();
  })();

  // pause everything when hidden (treated as stroke end)
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && self.gl.current) {
      var s = self.gl.endStroke();
      if (s) { self.sessionStrokes.push(s); self.saveSession(); }
      self.gl.render();
    }
  });
};

document.addEventListener('DOMContentLoaded', function () { App.init(); });
