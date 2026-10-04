/* Still Life — WebGL2 painting engine.
 *
 * Layer model (FBO stack):
 *   paperTex   - baked paper color + grain/weave tile (static)
 *   paintA/B   - ping-pong paint accumulation (RGBA8). Ping-pong exists so the
 *                stamp shader can SAMPLE the paint already under the dab
 *                (wet pickup) in the same pass it writes.
 *   heightTex  - paint thickness (R8-ish via RGBA), additive dabs; lit in composite.
 *   lineTex    - rasterized line art (crisp overlay drawn in DOM, not GL)
 *
 * Composite (paper + paint + height-light + screen-space grain) renders on demand.
 * Context loss: all GL resources rebuildable; strokes replay from the vector list.
 */
'use strict';

(function (global) {

var DPR_CAP = 2;
var MAX_EDGE = 2400;          // cap backing-store long edge (px)
var UNDO_CAP = 40;            // strokes kept for undo

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */

// Stamp shader: draws one textured brush dab into the paint FBO.
// Reads paintTex (the *other* ping-pong buffer) for wet pickup.
var STAMP_VS = [
  'attribute vec2 aPos;',            // quad corners in dab-local px: (-1..1)
  'uniform vec2 uCenter;',          // dab center, page px
  'uniform vec2 uPage;',            // page size px
  'uniform float uSize;',           // dab diameter px
  'uniform float uRot;',            // radians
  'varying vec2 vTip;',             // tip-texture uv
  'varying vec2 vPaintUv;',         // paint-texture uv at this fragment
  'void main(){',
  '  float c = cos(uRot), s = sin(uRot);',
  '  vec2 lp = vec2(aPos.x * c - aPos.y * s, aPos.x * s + aPos.y * c) * (uSize * 0.5);',
  '  vec2 p = uCenter + lp;',
  '  vTip = aPos * 0.5 + 0.5;',
  '  vPaintUv = vec2(p.x / uPage.x, 1.0 - p.y / uPage.y);',
  '  vec2 clip = (p / uPage) * 2.0 - 1.0;',
  '  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);',
  '}'
].join('\n');

var STAMP_FS = [
  'precision highp float;',
  'varying vec2 vTip;',
  'varying vec2 vPaintUv;',
  'uniform sampler2D uTip;',        // brush tip sprite (alpha = deposit mask)
  'uniform sampler2D uPaint;',      // current paint accumulation (other buffer)
  'uniform vec3 uColor;',          // brush pigment
  'uniform float uAlpha;',         // dab alpha (pressure * base)
  'uniform float uPickup;',        // 0 = pencil (no pickup), 0.15..0.35 = oil wetness
  'uniform float uCharge;',        // 1 = fully loaded .. 0 = dry
  'uniform float uGrainAmt;',      // extra per-dab grain jitter (pencil)
  'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
  'void main(){',
  '  vec4 tip = texture2D(uTip, vTip);',
  '  float m = tip.a;',
  '  if (uGrainAmt > 0.0) {',
  '    m *= 0.75 + 0.5 * hash(vTip * 371.0 + uColor.rg * 17.0);',
  '  }',
  '  float a = m * uAlpha;',
  '  if (a < 0.003) discard;',
  '  vec3 under = texture2D(uPaint, vPaintUv).rgb;',
  '  float underA = texture2D(uPaint, vPaintUv).a;',
  // wet pickup: the brush drags what's already there into the dab
  '  vec3 loaded = mix(uColor, under, uPickup * (1.0 - uCharge) * step(0.01, underA));',
  '  vec3 dab = mix(uColor, loaded, uPickup * step(0.01, underA));',
  '  vec3 dst = texture2D(uPaint, vPaintUv).rgb;',
  '  float dstA = underA;',
  '  vec3 rgb = mix(dst, dab, a);',
  '  float alpha = clamp(dstA + a, 0.0, 1.0);',
  '  gl_FragColor = vec4(rgb, alpha);',
  '}'
].join('\n');

// Height stamp: additive dab into the height texture (oil impasto).
var HEIGHT_VS = STAMP_VS;
var HEIGHT_FS = [
  'precision highp float;',
  'varying vec2 vTip;',
  'uniform sampler2D uTip;',
  'uniform float uAlpha;',
  'uniform float uAdd;',
  'void main(){',
  '  float m = texture2D(uTip, vTip).a;',
  '  float h = m * uAlpha * uAdd;',
  '  if (h < 0.003) discard;',
  '  gl_FragColor = vec4(h, h, h, 1.0);', // additive blending accumulates
  '}'
].join('\n');

// Composite: paper + paint + impasto lighting + screen-space grain -> screen.
var COMP_VS = [
  'attribute vec2 aPos;',
  'varying vec2 vUv;',
  // v=1 at screen top; paint texture stores page-top at v=1 (see stamp VS)
  'void main(){ vUv = vec2(aPos.x * 0.5 + 0.5, aPos.y * 0.5 + 0.5);',
  '  gl_Position = vec4(aPos, 0.0, 1.0); }'
].join('\n');

var COMP_FS = [
  'precision highp float;',
  'varying vec2 vUv;',
  'uniform sampler2D uPaper;',
  'uniform sampler2D uPaint;',
  'uniform sampler2D uHeight;',
  'uniform vec2 uPaperTile;',   // paper repeats across page
  'uniform vec2 uTexel;',       // 1/pageW, 1/pageH
  'uniform float uGrainOp;',    // grain overlay strength
  'uniform float uTime;',
  'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
  'void main(){',
  '  vec3 paper = texture2D(uPaper, vUv * uPaperTile).rgb;',
  '  vec4 paint = texture2D(uPaint, vUv);',
  // pencil-style: let paper tooth breathe through thin paint
  '  vec3 col = mix(paper, paint.rgb, paint.a);',
  // impasto lighting from height gradient
  '  vec2 px = uTexel;',
  '  float hC = texture2D(uHeight, vUv).r;',
  '  float hX = texture2D(uHeight, vUv + vec2(px.x, 0.0)).r;',
  '  float hY = texture2D(uHeight, vUv + vec2(0.0, px.y)).r;',
  '  vec3 n = normalize(vec3((hC - hX) * 2.2, (hC - hY) * 2.2, 1.0));',
  '  vec3 L = normalize(vec3(-0.45, -0.55, 0.72));',
  '  float dif = clamp(dot(n, L), 0.0, 1.0);',
  '  float relief = mix(0.82, 1.18, dif);',
  '  col *= mix(1.0, relief, clamp(hC * 3.0, 0.0, 1.0) * step(0.004, paint.a));',
  // canvas-anchored grain: screen-space hash, static while paint moves
  '  float g = hash(floor(vUv * vec2(2400.0, 2400.0)));',
  '  col *= 1.0 + (g - 0.5) * uGrainOp;',
  '  gl_FragColor = vec4(col, 1.0);',
  '}'
].join('\n');

// Flat fill quad (tap-to-fill regions).
var FILL_FS = [
  'precision highp float;',
  'varying vec2 vTip;',
  'varying vec2 vPaintUv;',
  'uniform sampler2D uTip;',     // reuse: not sampled meaningfully
  'uniform sampler2D uPaint;',
  'uniform sampler2D uMask;',    // fill region mask (alpha)
  'uniform vec3 uColor;',
  'uniform float uAlpha;',
  'void main(){',
  '  float m = texture2D(uMask, vPaintUv).a;',
  '  if (m < 0.01) discard;',
  '  vec3 dst = texture2D(uPaint, vPaintUv).rgb;',
  '  float dstA = texture2D(uPaint, vPaintUv).a;',
  '  float a = m * uAlpha;',
  '  gl_FragColor = vec4(mix(dst, uColor, a), clamp(dstA + a, 0.0, 1.0));',
  '}'
].join('\n');

function compile(gl, type, src) {
  var s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    var log = gl.getShaderInfoLog(s);
    throw new Error('shader compile failed: ' + log + '\n---\n' + src.slice(0, 400));
  }
  return s;
}
function program(gl, vsSrc, fsSrc) {
  var p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error('program link failed: ' + gl.getProgramInfoLog(p));
  return p;
}
function quadBuffer(gl) {
  var b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  return b;
}

/* ------------------------------------------------------------------ */
/* StillGL                                                             */
/* ------------------------------------------------------------------ */

function StillGL() {
  this.canvas = null; this.gl = null;
  this.pageW = 0; this.pageH = 0;     // page px (backing store)
  this.dpr = 1;
  this.programs = {}; this.quad = null;
  this.fbos = {}; this.textures = {};
  this.tips = { pencil: [], oil: [] };
  this.strokes = []; this.redoStack = [];
  this.current = null;                // active stroke being drawn
  this.dirty = true;
  this.lost = false;
  this.onReady = null;
}

StillGL.prototype.init = function (canvas, pageW, pageH) {
  var self = this;
  this.canvas = canvas;
  this.setPageSize(pageW, pageH);

  var gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, stencil: false,
    preserveDrawingBuffer: true, // painting app: on-demand rendering; reliable readback for export/timelapse/screenshots
    powerPreference: 'default'
  });
  if (!gl) throw new Error('WebGL2 unavailable');
  this.gl = gl;

  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    self.lost = true;
  }, false);
  canvas.addEventListener('webglcontextrestored', function () {
    self.rebuild();
  }, false);

  this.buildAll();
  if (this.onReady) this.onReady();
  return this;
};

StillGL.prototype.setPageSize = function (w, h) {
  var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  this.dpr = dpr * scale;
  this.pageW = Math.round(w * this.dpr);
  this.pageH = Math.round(h * this.dpr);
  if (this.canvas) {
    this.canvas.width = this.pageW;
    this.canvas.height = this.pageH;
  }
};

StillGL.prototype.buildAll = function () {
  var gl = this.gl;
  this.programs.stamp = program(gl, STAMP_VS, STAMP_FS);
  this.programs.height = program(gl, HEIGHT_VS, HEIGHT_FS);
  this.programs.comp = program(gl, COMP_VS, COMP_FS);
  this.programs.fill = program(gl, STAMP_VS, FILL_FS);
  this.quad = quadBuffer(gl);
  this.makeTargets();
  this.makePaper();
  this.makeTips();
  this.lost = false;
  this.dirty = true;
};

StillGL.prototype.rebuild = function () {
  // Rebuild every GL resource after context loss, then replay strokes.
  var strokes = this.strokes.slice();
  this.buildAll();
  this.strokes = [];
  this.redoStack = [];
  for (var i = 0; i < strokes.length; i++) this.replayStroke(strokes[i]);
  this.dirty = true;
};

StillGL.prototype.makeTargets = function () {
  var gl = this.gl, W = this.pageW, H = this.pageH;
  function target() {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex: tex, fb: fb };
  }
  this.fbos.paintA = target();
  this.fbos.paintB = target();
  this.fbos.height = target();
  // clear paint + height to transparent/black
  var self = this;
  [this.fbos.paintA, this.fbos.paintB, this.fbos.height].forEach(function (t) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

global.StillGL = StillGL;
})(typeof window !== 'undefined' ? window : this);

/* ------------------------------------------------------------------ */
/* Paper + brush tip generation (2D canvas -> GL textures)             */
/* ------------------------------------------------------------------ */
(function () {

// deterministic PRNG so paper/tips are stable per session
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

StillGL.prototype.makePaper = function () {
  var gl = this.gl;
  var S = 256, rnd = mulberry32(1234);
  var c = makeCanvas(S, S), x = c.getContext('2d');
  // warm paper base
  x.fillStyle = '#f6f1e6'; x.fillRect(0, 0, S, S);
  // speckle tooth
  for (var i = 0; i < 2600; i++) {
    var v = (rnd() - 0.5) * 22;
    x.fillStyle = 'rgba(' + (120 + v | 0) + ',' + (112 + v | 0) + ',' + (100 + v | 0) + ',0.5)';
    x.fillRect((rnd() * S) | 0, (rnd() * S) | 0, 1, 1);
  }
  // paper fibers: short thin dashes, tileable via wrap
  x.lineWidth = 1;
  for (var j = 0; j < 420; j++) {
    var px = rnd() * S, py = rnd() * S, a = rnd() * Math.PI, l = 4 + rnd() * 7;
    var v2 = (rnd() - 0.5) * 16;
    x.strokeStyle = 'rgba(' + (130 + v2 | 0) + ',' + (122 + v2 | 0) + ',' + (108 + v2 | 0) + ',0.45)';
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
    x.stroke();
  }
  // subtle canvas weave (two perpendicular line sets, very faint)
  x.strokeStyle = 'rgba(120,112,98,0.10)';
  for (var k = 0; k < S; k += 4) {
    x.beginPath(); x.moveTo(0, k + 0.5); x.lineTo(S, k + 0.5); x.stroke();
    x.beginPath(); x.moveTo(k + 0.5, 0); x.lineTo(k + 0.5, S); x.stroke();
  }
  var tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
  this.textures.paper = tex;
};

// Pencil tip: soft round dab with noise-punched alpha (paper tooth) +
// directional micro-streaks along +x (rotated to stroke bearing at stamp time).
function pencilTip(rnd, size) {
  var c = makeCanvas(size, size), x = c.getContext('2d');
  var img = x.createImageData(size, size), d = img.data;
  var R = size / 2;
  for (var py = 0; py < size; py++) {
    for (var px = 0; px < size; px++) {
      var dx = (px - R) / R, dy = (py - R) / R;
      var r = Math.sqrt(dx * dx + dy * dy);
      if (r > 1) continue;
      var fall = Math.pow(Math.max(0, 1 - r), 1.2);
      // speckle cutouts (tooth)
      var cut = rnd() < 0.32 ? 0.3 + rnd() * 0.5 : 1.0;
      // directional streaks: thin horizontal bands of varying alpha
      var streak = 0.82 + 0.18 * Math.sin(py * 1.7 + rnd() * 0.6);
      var a = fall * cut * streak;
      var i = (py * size + px) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.round(clamp(a, 0, 1) * 255);
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

// Oil tip: bristle streaks — vertical bands of varying alpha/width,
// baked edge light (top-left lighter) for impasto read.
function oilTip(rnd, size) {
  var c = makeCanvas(size, size), x = c.getContext('2d');
  var img = x.createImageData(size, size), d = img.data;
  var R = size / 2;
  var bristles = [];
  var n = Math.max(6, Math.round(size / 7));
  for (var b = 0; b < n; b++)
    bristles.push({ off: (b / n - 0.5) * 1.7, w: 0.05 + rnd() * 0.09, a: 0.55 + rnd() * 0.45 });
  for (var py = 0; py < size; py++) {
    for (var px = 0; px < size; px++) {
      var dx = (px - R) / R, dy = (py - R) / R;
      var r = Math.sqrt(dx * dx + dy * dy);
      if (r > 1) continue;
      var fall = Math.pow(Math.max(0, 1 - r), 0.9);
      var m = 0;
      for (var k = 0; k < bristles.length; k++) {
        var br = bristles[k];
        var dd = Math.abs(dx - br.off);
        if (dd < br.w) m = Math.max(m, br.a * (1 - dd / br.w));
      }
      // ragged bristle ends
      m *= 0.75 + 0.25 * Math.sin(py * 0.9 + bristles.length);
      var a = fall * m;
      // baked edge light: top-left of each dab slightly lighter (relief cue)
      var light = 1 + (0.10 * (0.5 - dx) + 0.06 * (0.5 - dy));
      var i = (py * size + px) * 4;
      var v = Math.round(clamp(255 * light, 0, 255));
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = Math.round(clamp(a, 0, 1) * 255);
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

StillGL.prototype.makeTips = function () {
  var gl = this.gl;
  function upload(canvas) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    return tex;
  }
  this.tips.pencil = [];
  this.tips.oil = [];
  for (var i = 0; i < 4; i++)
    this.tips.pencil.push(upload(pencilTip(mulberry32(500 + i), 96)));
  for (var j = 0; j < 6; j++)
    this.tips.oil.push(upload(oilTip(mulberry32(900 + j), 128)));
};

})();

/* ------------------------------------------------------------------ */
/* Painting API: strokes, dabs, undo, fill, composite                  */
/* ------------------------------------------------------------------ */
(function () {

var UNDO_CAP = 40; // strokes kept for undo (mirrors engine core)

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }

function hexToRgb(hex) {
  var h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.slice(0, 2), 16) / 255,
          parseInt(h.slice(2, 4), 16) / 255,
          parseInt(h.slice(4, 6), 16) / 255];
}

var ULOC = {};
StillGL.prototype._use = function (name) {
  var gl = this.gl, p = this.programs[name];
  gl.useProgram(p);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
  var loc = gl.getAttribLocation(p, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  return p;
};
StillGL.prototype._u = function (prog, name) {
  var key = prog + ':' + name;
  if (!(key in ULOC)) ULOC[key] = this.gl.getUniformLocation(this.programs[prog], name);
  return ULOC[key];
};
function setU(gl, loc, v) {
  if (loc == null) return;
  if (typeof v === 'number') gl.uniform1f(loc, v);
  else if (v.length === 2) gl.uniform2fv(loc, v);
  else if (v.length === 3) gl.uniform3fv(loc, v);
  else if (v.length === 4) gl.uniform4fv(loc, v);
}

// One brush dab. Reads paintA, writes paintB, then swaps.
StillGL.prototype.dab = function (o) {
  var gl = this.gl, W = this.pageW, H = this.pageH;
  var prog = 'stamp';
  this._use(prog);
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.paintB.fb);
  gl.viewport(0, 0, W, H);
  gl.disable(gl.BLEND);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, o.tip);
  gl.uniform1i(this._u(prog, 'uTip'), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, this.fbos.paintA.tex);
  gl.uniform1i(this._u(prog, 'uPaint'), 1);
  setU(gl, this._u(prog, 'uCenter'), [o.x, o.y]);
  setU(gl, this._u(prog, 'uPage'), [W, H]);
  setU(gl, this._u(prog, 'uSize'), o.size);
  setU(gl, this._u(prog, 'uRot'), o.rot);
  setU(gl, this._u(prog, 'uColor'), o.color);
  setU(gl, this._u(prog, 'uAlpha'), o.alpha);
  setU(gl, this._u(prog, 'uPickup'), o.pickup);
  setU(gl, this._u(prog, 'uCharge'), o.charge);
  setU(gl, this._u(prog, 'uGrainAmt'), o.grainAmt);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  if (o.medium === 'oil') {
    var hp = 'height';
    this._use(hp);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.height.fb);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, o.tip);
    gl.uniform1i(this._u(hp, 'uTip'), 0);
    setU(gl, this._u(hp, 'uCenter'), [o.x, o.y]);
    setU(gl, this._u(hp, 'uPage'), [W, H]);
    setU(gl, this._u(hp, 'uSize'), o.size);
    setU(gl, this._u(hp, 'uRot'), o.rot);
    setU(gl, this._u(hp, 'uAlpha'), o.alpha);
    setU(gl, this._u(hp, 'uAdd'), 0.55);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND);
  }

  var t = this.fbos.paintA;
  this.fbos.paintA = this.fbos.paintB;
  this.fbos.paintB = t;
  this.dirty = true;
};

// Dab parameters per medium. Shared by live strokes and replay.
StillGL.prototype._dabParams = function (s, x, y, pressure, distStep) {
  var tipSet = this.tips[s.medium];
  var tip = tipSet[s.tipIdx % tipSet.length];
  var bearing = s.bearing;
  var o = {
    x: x, y: y, tip: tip, medium: s.medium,
    size: s.size * (s.medium === 'pencil' ? (0.85 + 0.3 * pressure) : 1),
    rot: bearing, color: s.color, charge: s.charge,
    pickup: 0, grainAmt: 0, alpha: 0.1
  };
  if (s.medium === 'pencil') {
    // waxy buildup: many translucent dabs; single confident pass must still read
    o.alpha = 0.2 * (0.25 + 0.75 * Math.pow(pressure, 1.5));
    o.grainAmt = 1;
  } else {
    o.alpha = (0.5 + 0.4 * pressure) * (0.3 + 0.7 * s.charge);
    o.pickup = 0.3;
    s.charge = Math.max(0, s.charge - distStep / (650 * this.dpr));
    o.charge = s.charge;
  }
  return o;
};

StillGL.prototype._onLine = function (s, x, y) {
  var m = s.mask;
  if (!m) return false;
  var mx = clamp(((x / this.pageW) * m.w) | 0, 0, m.w - 1);
  var my = clamp(((y / this.pageH) * m.h) | 0, 0, m.h - 1);
  return m.data[my * m.w + mx] > 110;
};

StillGL.prototype._emitDab = function (s, x, y, pressure, distStep) {
  if (s.lineAssist && this._onLine(s, x, y)) return; // stay inside the lines
  var o = this._dabParams(s, x, y, pressure, distStep);
  this.dab(o);
};

StillGL.prototype.beginStroke = function (medium, colorHex, sizeCssPx, opts) {
  opts = opts || {};
  this.redoStack.length = 0;
  this.current = {
    type: 'stroke', medium: medium,
    color: hexToRgb(colorHex), colorHex: colorHex,
    size: sizeCssPx * this.dpr,
    points: [], lastDab: null, lastT: 0,
    bearing: 0, charge: 1,
    tipIdx: (Math.random() * this.tips[medium].length) | 0,
    lineAssist: !!opts.lineAssist, mask: opts.mask || null,
    spacing: medium === 'pencil' ? 0.12 : 0.12,
    pageId: opts.pageId || 'blank'
  };
};

function pseudoPressure(s, x, y, t) {
  // No touch pressure on iOS: fast = light, slow = heavy.
  if (!s.lastPt) return 0.7;
  var dx = x - s.lastPt[0], dy = y - s.lastPt[1];
  var dt = Math.max(8, t - s.lastPt[2]);
  var v = Math.sqrt(dx * dx + dy * dy) / dt * 1000; // px/sec
  var p = 1 - clamp((v - 60) / 840, 0, 1) * 0.7;
  s.lastPt = [x, y, t];
  return clamp(lerp(s.lastP || 0.7, p, 0.35), 0.25, 1);
}

StillGL.prototype.addPoint = function (x, y, pressure, t) {
  var s = this.current;
  if (!s) return;
  t = t || performance.now();
  var p = (pressure != null && pressure > 0 && pressure <= 1) ? pressure : pseudoPressure(s, x, y, t);
  if (pressure != null && pressure > 0 && pressure <= 1) s.lastPt = [x, y, t];
  s.lastP = p;
  s.points.push([x, y, p, t]);
  if (!s.lastDab) { s.lastDab = { x: x, y: y }; this._emitDab(s, x, y, p, 0); return; }
  var dx = x - s.lastDab.x, dy = y - s.lastDab.y;
  var segLen = Math.sqrt(dx * dx + dy * dy);
  if (segLen < 0.5) return;
  s.bearing = Math.atan2(dy, dx);
  var delta = s.spacing * (s.size / 2);
  var travelled = 0;
  while (travelled + delta <= segLen) {
    travelled += delta;
    var k = travelled / segLen;
    var ix = s.lastDab.x + dx * k, iy = s.lastDab.y + dy * k;
    this._emitDab(s, ix, iy, p, delta);
  }
  // carry remainder
  var rem = segLen - travelled;
  s.lastDab = { x: x - dx * (rem / segLen), y: y - dy * (rem / segLen) };
};

StillGL.prototype.endStroke = function () {
  var s = this.current;
  this.current = null;
  if (!s || s.points.length === 0) return null;
  this.strokes.push(s);
  if (this.strokes.length > UNDO_CAP) this.strokes.shift();
  return s;
};

StillGL.prototype._replayStroke = function (s) {
  if (s.type === 'fill') { this._replayFill(s); return; }
  var live = {
    medium: s.medium, color: s.color, size: s.size,
    bearing: 0, charge: 1, tipIdx: s.tipIdx,
    lineAssist: s.lineAssist, mask: s.mask,
    spacing: s.spacing, lastDab: null, lastPt: null, lastP: 0.7
  };
  for (var i = 0; i < s.points.length; i++) {
    var pt = s.points[i];
    var x = pt[0], y = pt[1], p = pt[2];
    if (!live.lastDab) { live.lastDab = { x: x, y: y }; this._emitDab(live, x, y, p, 0); continue; }
    var dx = x - live.lastDab.x, dy = y - live.lastDab.y;
    var segLen = Math.sqrt(dx * dx + dy * dy);
    if (segLen < 0.5) continue;
    live.bearing = Math.atan2(dy, dx);
    var delta = live.spacing * (live.size / 2);
    var travelled = 0;
    while (travelled + delta <= segLen) {
      travelled += delta;
      var k = travelled / segLen;
      this._emitDab(live, live.lastDab.x + dx * k, live.lastDab.y + dy * k, p, delta);
    }
    var rem = segLen - travelled;
    live.lastDab = { x: x - dx * (rem / segLen), y: y - dy * (rem / segLen) };
  }
};

StillGL.prototype.undo = function () {
  if (this.current || this.strokes.length === 0) return false;
  this.redoStack.push(this.strokes.pop());
  this._repaintAll();
  return true;
};
StillGL.prototype.redo = function () {
  if (this.current || this.redoStack.length === 0) return false;
  this.strokes.push(this.redoStack.pop());
  this._repaintAll();
  return true;
};
StillGL.prototype._repaintAll = function () {
  var gl = this.gl;
  var self = this;
  [this.fbos.paintA, this.fbos.paintB, this.fbos.height].forEach(function (t) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  var keep = this.strokes.slice();
  this.strokes = [];
  for (var i = 0; i < keep.length; i++) {
    this._replayStroke(keep[i]);
    this.strokes.push(keep[i]);
  }
  this.dirty = true;
};
StillGL.prototype.clear = function () {
  this.strokes = []; this.redoStack = []; this.current = null;
  this._repaintAll();
};

/* ---------------- tap-to-fill (CPU flood fill -> GL) ---------------- */

StillGL.prototype.floodFill = function (px, py, colorHex, mask, pageId) {
  // mask: {data: Uint8Array (line=255), w, h} at any resolution
  var mw = mask.w, mh = mask.h;
  var sx = clamp((px / this.pageW * mw) | 0, 0, mw - 1);
  var sy = clamp((py / this.pageH * mh) | 0, 0, mh - 1);
  var md = mask.data;
  if (md[sy * mw + sx] > 110) return false; // tapped a line
  var seen = new Uint8Array(mw * mh);
  var stack = [sy * mw + sx];
  seen[sy * mw + sx] = 1;
  var minx = mw, maxx = 0, miny = mh, maxy = 0, count = 0;
  while (stack.length) {
    var i = stack.pop();
    var x = i % mw, y = (i / mw) | 0;
    count++;
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (y < miny) miny = y; if (y > maxy) maxy = y;
    if (x > 0 && !seen[i - 1] && md[i - 1] <= 110) { seen[i - 1] = 1; stack.push(i - 1); }
    if (x < mw - 1 && !seen[i + 1] && md[i + 1] <= 110) { seen[i + 1] = 1; stack.push(i + 1); }
    if (y > 0 && !seen[i - mw] && md[i - mw] <= 110) { seen[i - mw] = 1; stack.push(i - mw); }
    if (y < mh - 1 && !seen[i + mw] && md[i + mw] <= 110) { seen[i + mw] = 1; stack.push(i + mw); }
    if (count > mw * mh * 0.9) break; // safety: nearly whole page
  }
  if (count < 12) return false;
  // bake region into a small canvas -> texture
  var c = document.createElement('canvas');
  c.width = mw; c.height = mh;
  var cx = c.getContext('2d');
  var img = cx.createImageData(mw, mh), dd = img.data;
  for (var k = 0; k < mw * mh; k++) {
    if (seen[k]) { dd[k * 4 + 3] = 255; }
  }
  cx.putImageData(img, 0, 0);
  var gl = this.gl;
  var tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);

  var prog = 'fill';
  this._use(prog);
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.paintB.fb);
  gl.viewport(0, 0, this.pageW, this.pageH);
  gl.disable(gl.BLEND);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(this._u(prog, 'uTip'), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, this.fbos.paintA.tex);
  gl.uniform1i(this._u(prog, 'uPaint'), 1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(this._u(prog, 'uMask'), 2);
  setU(gl, this._u(prog, 'uCenter'), [this.pageW / 2, this.pageH / 2]);
  setU(gl, this._u(prog, 'uPage'), [this.pageW, this.pageH]);
  setU(gl, this._u(prog, 'uSize'), Math.max(this.pageW, this.pageH) * 1.6);
  setU(gl, this._u(prog, 'uRot'), 0);
  setU(gl, this._u(prog, 'uColor'), hexToRgb(colorHex));
  setU(gl, this._u(prog, 'uAlpha'), 0.82);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.deleteTexture(tex);
  var t = this.fbos.paintA;
  this.fbos.paintA = this.fbos.paintB;
  this.fbos.paintB = t;

  var s = { type: 'fill', x: px, y: py, colorHex: colorHex, pageId: pageId || 'blank', mask: mask };
  this.strokes.push(s);
  if (this.strokes.length > UNDO_CAP) this.strokes.shift();
  this.redoStack.length = 0;
  this.dirty = true;
  return true;
};

StillGL.prototype._replayFill = function (s) {
  if (s.mask) this.floodFillSilent(s);
};
StillGL.prototype.floodFillSilent = function (s) {
  // replay without pushing to stroke list
  var keep = this.strokes, keepR = this.redoStack;
  var n = this.strokes.length;
  this.floodFill(s.x, s.y, s.colorHex, s.mask, s.pageId);
  this.strokes.length = n; // drop the duplicate push
  this.redoStack = keepR;
};

/* ---------------- composite ---------------- */

StillGL.prototype.render = function () {
  if (!this.dirty || this.lost || !this.gl) return;
  var gl = this.gl, prog = 'comp';
  this._use(prog);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, this.pageW, this.pageH);
  gl.disable(gl.BLEND);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, this.textures.paper);
  gl.uniform1i(this._u(prog, 'uPaper'), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, this.fbos.paintA.tex);
  gl.uniform1i(this._u(prog, 'uPaint'), 1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, this.fbos.height.tex);
  gl.uniform1i(this._u(prog, 'uHeight'), 2);
  setU(gl, this._u(prog, 'uPaperTile'), [this.pageW / 256, this.pageH / 256]);
  setU(gl, this._u(prog, 'uTexel'), [1 / this.pageW, 1 / this.pageH]);
  setU(gl, this._u(prog, 'uGrainOp'), 0.11);
  setU(gl, this._u(prog, 'uTime'), performance.now() / 1000);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  this.dirty = false;
};

StillGL.prototype.hexToRgb = hexToRgb;

// Direct framebuffer readback (page coords, y-down). Reliable unlike
// canvas-element drawImage in some headless drivers. Also the future eyedropper.
StillGL.prototype.sample = function (x, y) {
  var gl = this.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  var px = new Uint8Array(4);
  var sx = clamp(Math.round(x), 0, this.pageW - 1);
  var sy = clamp(this.pageH - 1 - Math.round(y), 0, this.pageH - 1);
  gl.readPixels(sx, sy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return [px[0], px[1], px[2]];
};

})();
