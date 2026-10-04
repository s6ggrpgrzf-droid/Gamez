/* WaterEngine — Moss & Stone phase 1.
 * CPU heightfield ripple simulation (ping-pong float buffers) + WebGL2
 * surface shader: normals from the heightfield, refraction of a procedural
 * pond bottom, depth-graded water color, animated caustics, sun glint,
 * fresnel sky reflection. Vanilla JS, no libraries.
 *
 * Exposed for tests: window.__water = { disturb, maxAbs, setAmbient, time }
 */
'use strict';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class WaterEngine {
  constructor(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.N = opts.grid || 128;
    this.seed = opts.seed == null ? 20261004 : opts.seed;
    this.rng = mulberry32(this.seed);
    this.ambient = true;
    this.time = 0;
    this.ok = false;
    this.error = null;

    // phase 4: transparent rim — the garden (2D canvas) shows through outside
    // the pond mask. Opt-in; default false keeps old prototypes/tests identical.
    this.transparentRim = !!(opts && opts.transparentRim);

    const N = this.N;
    this._cur = new Float32Array(N * N);
    this._prev = new Float32Array(N * N);
    this._next = new Float32Array(N * N);
    this._damp = new Float32Array(N * N);

    this._acc = 0;
    this._lastT = 0;
    this._dripT = 1.2;

    this._shape = null;
    this._aspect = 1;

    // GL handles (filled in _buildGL)
    this.gl = null;
    this._prog = null;
    this._texHeight = null;
    this._texBottom = null;
    this._texMask = null;
    this._u = {};

    // underwater render target (phase 2: koi render here, surface refracts it)
    this.onUnderwater = null; // fn(uw) — draws the underwater scene each frame
    this._rt = null;
    this._progUnder = null;
    this._vaoUnder = null;
    this._uwVbo = null;
    this._uTexUnder = null;
    this._vaoSurf = null;
    this.uw = null;

    // surface overlay pass (phase 3: lily pads, pellets, petals, rain rings
    // draw ON the water, after the surface shader)
    this.onSurface = null; // fn(surf) — draws surface decorations each frame
    this._progSurf = null;
    this._vaoSurf2 = null;
    this._surfVbo = null;
    this._uTexSurf = null;
    this.surf = null;

    // phase 3: weather + clarity, read by the surface shader
    this.gloom = 0;    // 0 clear → 1 heavy overcast
    this.clarity = 1;  // 0 murky → 1 gin-clear

    // phase 5: day phase, read by the surface shader (defaults = classic noon look)
    this.sunDir = [-0.38, -0.46, 0.80]; // normalized light dir (sun by day, moon by night)
    this.sunCol = [1.0, 0.98, 0.92];    // light color
    this.skyCol = [0.72, 0.82, 0.86];   // fresnel sky reflection color
    this.nightF = 0;                    // 0 day → 1 deep night
  }

  /* Public helpers for companion engines (koi, etc). nx,ny in 0..1 screen UV. */
  pondInfo(nx, ny) { return this._pondAt(nx, ny, this._aspect); }
  get aspect() { return this._aspect; }

  // phase 4: pond edge as UV points (y down), for the garden's shadow ring.
  pondOutline(n) {    const pts = [];
    if (!this._shape) return pts;
    const s = this._shape, asp = this._aspect;
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2;
      const R = this._radiusAt(th);
      // _pondAt measures dy in aspect-corrected space: dy_uv = d*sin / asp
      const dx = Math.cos(th) * R;
      const dy = Math.sin(th) * R / asp;
      pts.push([s.cx + dx, s.cy + dy]);
    }
    return pts;
  }

  // phase 4: signed distance from the pond edge, aspect-corrected UV units.
  // > 0 on sand outside the pond, < 0 in the water.
  edgeDist(nx, ny) {
    if (!this._shape) return 1;
    const s = this._shape, asp = this._aspect;
    const dx = nx - s.cx;
    const dy = (ny - s.cy) * asp;
    const d = Math.sqrt(dx * dx + dy * dy);
    return d - this._radiusAt(Math.atan2(dy, dx));
  }

  // bilinear sample of the live heightfield (for bobbing surface objects)
  heightAt(nx, ny) {
    const N = this.N, c = this._cur;
    if (!c) return 0;
    let gx = nx * N - 0.5, gy = ny * N - 0.5;
    if (gx < 0) gx = 0; else if (gx > N - 1.001) gx = N - 1.001;
    if (gy < 0) gy = 0; else if (gy > N - 1.001) gy = N - 1.001;
    const x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0;
    const i = y0 * N + x0;
    const a = c[i], b = c[i + 1], d = c[i + N], e = c[i + N + 1];
    return a + (b - a) * fx + (d - a) * fy + (a - b - d + e) * fx * fy;
  }

  /* ---------------- pond shape (shared by sim damping + mask texture) ---------------- */

  _buildPondShape() {
    const r = this.rng;
    this._shape = {
      cx: 0.5, cy: 0.52, R: 0.40, // R in vmin units (fraction of min(w,h))
      harm: [
        { k: 3, amp: 0.09 + r() * 0.03, ph: r() * 6.2832 },
        { k: 5, amp: 0.05 + r() * 0.02, ph: r() * 6.2832 },
        { k: 8, amp: 0.03 + r() * 0.015, ph: r() * 6.2832 },
      ],
    };
  }

  _radiusAt(th) {
    const s = this._shape;
    let m = 1;
    for (let i = 0; i < s.harm.length; i++) {
      const h = s.harm[i];
      m += h.amp * Math.sin(h.k * th + h.ph);
    }
    return s.R * m;
  }

  // x,y in 0..1 screen UV (y down). aspect = h/w. Returns [mask, depth].
  _pondAt(x, y, aspect) {
    const s = this._shape;
    const dx = x - s.cx;
    const dy = (y - s.cy) * aspect;
    const d = Math.sqrt(dx * dx + dy * dy);
    const th = Math.atan2(dy, dx);
    const R = this._radiusAt(th);
    const soft = 0.030;
    let t = (R - d) / soft;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const mask = t * t * (3 - 2 * t);
    let dep = 1 - d / R;
    dep = dep < 0 ? 0 : dep > 1 ? 1 : dep;
    return [mask, Math.pow(dep, 0.8)];
  }

  _buildSimDamp() {
    const N = this.N;
    const aspect = this._aspect;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const m = this._pondAt((x + 0.5) / N, (y + 0.5) / N, aspect)[0];
        // lively inside the pond, die quickly at the stone rim
        this._damp[y * N + x] = 0.90 + 0.096 * m;
      }
    }
  }

  /* ---------------- public sim API ---------------- */

  // nx, ny in 0..1 screen UV (y down). radius in texels, strength in height units.
  disturb(nx, ny, radius, strength) {
    const N = this._cur ? this.N : 0;
    if (!N) return;
    const cx = nx * N, cy = ny * N;
    const r2 = radius * radius;
    const x0 = Math.max(1, Math.floor(cx - radius));
    const x1 = Math.min(N - 2, Math.ceil(cx + radius));
    const y0 = Math.max(1, Math.floor(cy - radius));
    const y1 = Math.min(N - 2, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const f = Math.cos(Math.sqrt(d2) / radius * Math.PI * 0.5);
        const i = y * N + x;
        this._cur[i] += strength * f * f;
      }
    }
  }

  maxAbs() {
    const c = this._cur;
    let m = 0;
    for (let i = 0; i < c.length; i++) {
      const a = c[i] < 0 ? -c[i] : c[i];
      if (a > m) m = a;
    }
    return m;
  }

  setAmbient(v) { this.ambient = !!v; }

  /* ---------------- init ---------------- */

  init() {
    this._buildPondShape();
    const w = this.canvas.width || 390, h = this.canvas.height || 844;
    this._aspect = h / w;
    this._buildSimDamp();
    const gl = this.canvas.getContext('webgl2', this.transparentRim ? {
      antialias: false, alpha: true, premultipliedAlpha: false,
      depth: false, stencil: false, powerPreference: 'default',
    } : {
      antialias: false, alpha: false, depth: false, stencil: false,
      powerPreference: 'default',
    });
    if (!gl) { this.error = 'WebGL2 not available'; return false; }
    this.gl = gl;
    try {
      this._buildGL();
    } catch (e) {
      this.error = 'GL init failed: ' + (e && e.message || e);
      return false;
    }
    this.ok = true;
    return true;
  }

  resize() {
    const w = this.canvas.width || 390, h = this.canvas.height || 844;
    this._aspect = h / w;
    if (this.gl) {
      this.gl.viewport(0, 0, w, h);
      this._buildSimDamp();
      this._regenMaskTexture();
      this._buildUnderwaterRT();
    }
  }

  /* ---------------- GL ---------------- */

  _compile(type, src) {
    const gl = this.gl;
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error('shader: ' + gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  _buildGL() {
    const gl = this.gl;

    const vs = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

    const fs = `#version 300 es
${this.transparentRim ? '#define TRANSPARENT_RIM 1\n' : ''}precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uHeight;  // R32F, 128x128, screen space y-down
uniform sampler2D uBottom;  // pond bottom, screen space y-down
uniform sampler2D uMask;    // R=mask G=depth, screen space y-down
uniform float uTime;
uniform vec2 uRes;
uniform float uAspect;
uniform float uGloom;    // 0 clear → 1 heavy overcast
uniform float uClarity;  // 0 murky → 1 gin-clear
uniform vec3 uSunDir;    // normalized light direction (sun by day, moon by night)
uniform vec3 uSunCol;    // light color
uniform vec3 uSkyCol;    // fresnel sky reflection color
uniform float uNightF;   // 0 day → 1 deep night

const float HN = 128.0;

float hgt(vec2 uv) {
  vec2 g = clamp(uv, vec2(0.0), vec2(1.0)) * HN - 0.5;
  vec2 f = fract(g);
  ivec2 b = ivec2(floor(g));
  b = clamp(b, ivec2(0), ivec2(int(HN) - 2));
  float h00 = texelFetch(uHeight, b, 0).r;
  float h10 = texelFetch(uHeight, b + ivec2(1, 0), 0).r;
  float h01 = texelFetch(uHeight, b + ivec2(0, 1), 0).r;
  float h11 = texelFetch(uHeight, b + ivec2(1, 1), 0).r;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float caustic(vec2 p, float t) {
  // domain-rotated second layer: breaks the square-lattice axis alignment
  // that value noise otherwise leaves as faint straight structure
  vec2 q2 = mat2(0.8, -0.6, 0.6, 0.8) * p * 4.7 - vec2(t * 0.27, t * 0.33);
  float n1 = vnoise(p * 3.1 + vec2(t * 0.32, t * 0.21));
  float n2 = vnoise(q2);
  return pow(1.0 - abs(n1 * 2.0 - 1.0), 5.0) * 0.6
       + pow(1.0 - abs(n2 * 2.0 - 1.0), 5.0) * 0.4;
}
void main() {
  vec2 suv = vec2(vUv.x, 1.0 - vUv.y);
  vec4 md = texture(uMask, suv);
  float mask = md.r;
  float depth = md.g;
  float t = uTime;

  // stone rim outside the pond
  float sp = hash(floor(suv * uRes * 0.35));
  vec3 rim = vec3(0.115, 0.125, 0.105) * (0.8 + 0.4 * sp);
  float vig = smoothstep(1.3, 0.3, length((vUv - vec2(0.5)) * vec2(0.7, 1.0)));
  rim *= mix(0.5, 1.05, vig);

  // surface normals from the heightfield (+ faint ambient breathing)
  float e = 1.5 / HN;
  float hx = hgt(suv + vec2(e, 0.0)) - hgt(suv - vec2(e, 0.0));
  float hy = hgt(suv + vec2(0.0, e)) - hgt(suv - vec2(0.0, e));
  hx += 0.006 * sin(suv.y * 47.0 + t * 0.9 + sin(suv.x * 31.0) * 1.7);
  hy += 0.006 * cos(suv.x * 43.0 - t * 0.7 + sin(suv.y * 29.0) * 1.3);
  vec3 n = normalize(vec3(-hx * 0.22, -hy * 0.22, 1.0));

  // refraction of the pond bottom through the normals
  float refrAmt = 0.05 * (0.35 + 0.65 * depth);
  vec3 bottom = texture(uBottom, clamp(suv + n.xy * refrAmt, vec2(0.0), vec2(1.0))).rgb;

  // depth-graded water body color
  vec3 shallowC = vec3(0.42, 0.75, 0.70);
  vec3 deepC = vec3(0.012, 0.16, 0.21);
  vec3 waterBody = mix(shallowC, deepC, smoothstep(0.05, 0.95, depth));
  vec3 col = mix(bottom * vec3(0.70, 0.90, 0.88), waterBody, 0.30 + 0.55 * depth);

  // animated caustic light webs, strongest in the shallows
  float ca = caustic(suv * vec2(1.0, uAspect) * 2.6, t);
  col += vec3(0.50, 0.82, 0.78) * ca * (1.0 - depth * 0.6) * 0.38
       * (1.0 - uGloom * 0.7) * (0.35 + 0.65 * uClarity) * (1.0 - uNightF * 0.75);

  // sun/moon glint (dies under overcast; dimmer and cooler at night)
  vec3 hv = normalize(uSunDir + vec3(0.0, 0.0, 1.0));
  float ndh = max(dot(n, hv), 0.0);
  col += uSunCol * (pow(ndh, 240.0) * 2.2 + pow(ndh, 36.0) * 0.10)
       * (1.0 - uGloom * 0.85) * (1.0 - uNightF * 0.45);

  // fresnel sky reflection on tilted normals (grayer when gloomy)
  float fr = pow(1.0 - n.z, 3.0);
  vec3 skyC = mix(uSkyCol, vec3(0.45, 0.48, 0.52), uGloom);
  col = mix(col, skyC, fr * 0.55);

  // clarity: murky green-brown at low clarity; gloom: darker, flatter; night: darker
  float murk = 1.0 - uClarity;
  col = mix(col, vec3(0.30, 0.33, 0.13) * (0.55 + 0.45 * depth), murk * 0.55);
  col *= (1.0 - uGloom * 0.38);
  col *= (1.0 - uNightF * 0.42);

  // wet dark contact edge where water meets stone
  col *= mix(0.62, 1.0, smoothstep(0.0, 0.14, mask));

#ifdef TRANSPARENT_RIM
  float rimA = smoothstep(0.0, 0.05, mask);
  vec3 water = mix(vec3(0.0), col, rimA);
  water *= mix(0.72, 1.0, vig);
  outColor = vec4(water, rimA);
#else
  vec3 water = mix(rim, col, smoothstep(0.0, 0.05, mask));
  water *= mix(0.72, 1.0, vig);
  outColor = vec4(water, 1.0);
#endif
}`;

    const prog = gl.createProgram();
    gl.attachShader(prog, this._compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, this._compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(prog));
    }
    this._prog = prog;
    gl.useProgram(prog);

    // fullscreen triangle (own VAO — the underwater pass rebinds attrib state)
    const vaoSurf = gl.createVertexArray();
    gl.bindVertexArray(vaoSurf);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this._vaoSurf = vaoSurf;

    const U = (name) => gl.getUniformLocation(prog, name);
    this._u = {
      height: U('uHeight'), bottom: U('uBottom'), mask: U('uMask'),
      time: U('uTime'), res: U('uRes'), aspect: U('uAspect'),
      gloom: U('uGloom'), clarity: U('uClarity'),
      sunDir: U('uSunDir'), sunCol: U('uSunCol'), skyCol: U('uSkyCol'), nightF: U('uNightF'),
    };

    // heightfield texture (updated every frame)
    const N = this.N;
    this._texHeight = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._texHeight);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, N, N, 0, gl.RED, gl.FLOAT, this._cur);

    this._texBottom = this._genBottomTexture();
    this._texMask = gl.createTexture();
    this._regenMaskTexture();

    this._buildUnderwater();

    this._buildSurface();

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /* Surface overlay pass: companions draw things that sit ON the water
   * (lily pads, pellets, petals, rain rings) after the surface shader.
   * Screen UV y-down; Y is flipped to NDC in the vertex shader. */
  _buildSurface() {
    const gl = this.gl;
    const vs = `#version 300 es
in vec2 aPos; in vec2 aUv; in vec4 aCol;
out vec2 vUv; out vec4 vCol;
void main() {
  vUv = aUv; vCol = aCol;
  gl_Position = vec4(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0, 0.0, 1.0);
}`;
    const fs = `#version 300 es
precision highp float;
in vec2 vUv; in vec4 vCol;
out vec4 o;
uniform sampler2D uTex;
void main() { o = texture(uTex, vUv) * vCol; }`;
    const prog = gl.createProgram();
    gl.attachShader(prog, this._compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, this._compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('surf link: ' + gl.getProgramInfoLog(prog));
    }
    this._progSurf = prog;

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const pPos = gl.getAttribLocation(prog, 'aPos');
    const pUv = gl.getAttribLocation(prog, 'aUv');
    const pCol = gl.getAttribLocation(prog, 'aCol');
    gl.enableVertexAttribArray(pPos);
    gl.enableVertexAttribArray(pUv);
    gl.enableVertexAttribArray(pCol);
    gl.vertexAttribPointer(pPos, 2, gl.FLOAT, false, 32, 0);
    gl.vertexAttribPointer(pUv, 2, gl.FLOAT, false, 32, 8);
    gl.vertexAttribPointer(pCol, 4, gl.FLOAT, false, 32, 16);
    gl.bindVertexArray(null);
    this._vaoSurf2 = vao;
    this._surfVbo = vbo;
    this._uTexSurf = gl.getUniformLocation(prog, 'uTex');

    const self = this;
    const submit = (tex, data, count) => {
      gl.useProgram(self._progSurf);
      gl.bindVertexArray(self._vaoSurf2);
      gl.bindBuffer(gl.ARRAY_BUFFER, self._surfVbo);
      gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * 8), gl.DYNAMIC_DRAW);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(self._uTexSurf, 0);
      gl.drawArrays(gl.TRIANGLES, 0, count);
    };
    // surf: draw helper. data: Float32Array of interleaved
    // [x,y,u,v,r,g,b,a], x/y in screen UV (y down).
    this.surf = {
      gl,
      tris(tex, data, count) { submit(tex, data, count); },
    };
  }

  /* Underwater render target: companions (koi) draw the underwater scene here;
   * the surface shader then refracts it as uBottom. Screen UV y-down convention:
   * vertex shader maps aPos directly (no Y flip) so texture v matches suv. */
  _buildUnderwaterRT() {
    const gl = this.gl;
    if (this._rt) {
      gl.deleteTexture(this._rt.tex);
      gl.deleteFramebuffer(this._rt.fb);
    }
    const w = Math.max(240, this.canvas.width >> 1);
    const h = Math.max(260, this.canvas.height >> 1);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) throw new Error('underwater FBO incomplete');
    this._rt = { tex, fb, w, h };
  }

  _buildUnderwater() {
    const gl = this.gl;
    this._buildUnderwaterRT();

    const vs = `#version 300 es
in vec2 aPos; in vec2 aUv; in vec4 aCol;
out vec2 vUv; out vec4 vCol;
void main() {
  vUv = aUv; vCol = aCol;
  gl_Position = vec4(aPos.x * 2.0 - 1.0, aPos.y * 2.0 - 1.0, 0.0, 1.0);
}`;
    const fs = `#version 300 es
precision highp float;
in vec2 vUv; in vec4 vCol;
out vec4 o;
uniform sampler2D uTex;
void main() { o = texture(uTex, vUv) * vCol; }`;
    const prog = gl.createProgram();
    gl.attachShader(prog, this._compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, this._compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('uw link: ' + gl.getProgramInfoLog(prog));
    }
    this._progUnder = prog;

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const pPos = gl.getAttribLocation(prog, 'aPos');
    const pUv = gl.getAttribLocation(prog, 'aUv');
    const pCol = gl.getAttribLocation(prog, 'aCol');
    gl.enableVertexAttribArray(pPos);
    gl.enableVertexAttribArray(pUv);
    gl.enableVertexAttribArray(pCol);
    // interleaved [x,y,u,v,r,g,b,a], stride 32 bytes
    gl.vertexAttribPointer(pPos, 2, gl.FLOAT, false, 32, 0);
    gl.vertexAttribPointer(pUv, 2, gl.FLOAT, false, 32, 8);
    gl.vertexAttribPointer(pCol, 4, gl.FLOAT, false, 32, 16);
    gl.bindVertexArray(null);
    this._vaoUnder = vao;
    this._uwVbo = vbo;
    this._uTexUnder = gl.getUniformLocation(prog, 'uTex');

    const self = this;
    const submit = (tex, data, count, mode) => {
      gl.useProgram(self._progUnder);
      gl.bindVertexArray(self._vaoUnder);
      gl.bindBuffer(gl.ARRAY_BUFFER, self._uwVbo);
      gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * 8), gl.DYNAMIC_DRAW);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(self._uTexUnder, 0);
      gl.drawArrays(mode, 0, count);
    };
    // uw: immediate-mode-ish draw helper for companion engines.
    // data: Float32Array of interleaved [x,y,u,v,r,g,b,a], x/y in screen UV (y down).
    this.uw = {
      gl,
      bottomTexture: this._texBottom,
      tris(tex, data, count) { submit(tex, data, count, gl.TRIANGLES); },
      strip(tex, data, count) { submit(tex, data, count, gl.TRIANGLE_STRIP); },
    };
  }

  _genBottomTexture() {
    const gl = this.gl;
    const W = 480, H = 1040;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const r = mulberry32(this.seed + 7);

    // sand base
    const g0 = x.createLinearGradient(0, 0, 0, H);
    g0.addColorStop(0, '#b3a37c');
    g0.addColorStop(0.55, '#9c8c66');
    g0.addColorStop(1, '#77694e');
    x.fillStyle = g0;
    x.fillRect(0, 0, W, H);

    // moss patches (soft, low alpha)
    for (let i = 0; i < 26; i++) {
      const px = r() * W, py = r() * H, pr = 14 + r() * 42;
      const mg = x.createRadialGradient(px, py, 2, px, py, pr);
      mg.addColorStop(0, 'rgba(74,112,72,0.20)');
      mg.addColorStop(1, 'rgba(74,112,72,0)');
      x.fillStyle = mg;
      x.beginPath(); x.ellipse(px, py, pr, pr * 0.7, r() * 3, 0, 6.2832); x.fill();
    }

    // pebbles with top-light shading
    for (let i = 0; i < 150; i++) {
      const px = r() * W, py = r() * H;
      const pr = 4 + r() * 14;
      const rot = r() * 3;
      x.fillStyle = 'rgba(0,0,0,0.22)';
      x.beginPath(); x.ellipse(px + 2, py + 3, pr, pr * 0.72, rot, 0, 6.2832); x.fill();
      const tone = 118 + ((r() * 70) | 0);
      const pg = x.createRadialGradient(px - pr * 0.3, py - pr * 0.35, pr * 0.1, px, py, pr);
      pg.addColorStop(0, 'rgb(' + (tone + 30) + ',' + (tone + 22) + ',' + tone + ')');
      pg.addColorStop(1, 'rgb(' + (tone - 45) + ',' + (tone - 48) + ',' + (tone - 55) + ')');
      x.fillStyle = pg;
      x.beginPath(); x.ellipse(px, py, pr, pr * 0.72, rot, 0, 6.2832); x.fill();
    }

    // fine speckle
    for (let i = 0; i < 2400; i++) {
      const v = r();
      x.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,250,235,0.10)';
      x.fillRect(r() * W, r() * H, 1.6, 1.6);
    }

    // depth darkening toward pond center
    const rg = x.createRadialGradient(W * 0.5, H * 0.52, 40, W * 0.5, H * 0.52, 330);
    rg.addColorStop(0, 'rgba(16,32,38,0.60)');
    rg.addColorStop(1, 'rgba(16,32,38,0)');
    x.fillStyle = rg;
    x.fillRect(0, 0, W, H);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
    return tex;
  }

  _regenMaskTexture() {
    const gl = this.gl;
    const aspect = this._aspect;
    const W = 256, H = Math.min(512, Math.round(256 * aspect));
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const img = x.createImageData(W, H);
    const d = img.data;
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const p = this._pondAt((px + 0.5) / W, (py + 0.5) / H, aspect);
        const o = (py * W + px) * 4;
        d[o] = Math.round(p[0] * 255);
        d[o + 1] = Math.round(p[1] * 255);
        d[o + 2] = 0;
        d[o + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, this._texMask);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
  }

  /* ---------------- simulation ---------------- */

  _simStep() {
    const N = this.N;
    const cur = this._cur, prev = this._prev, next = this._next, damp = this._damp;
    for (let y = 1; y < N - 1; y++) {
      const row = y * N;
      for (let x = 1; x < N - 1; x++) {
        const i = row + x;
        next[i] = ((cur[i - 1] + cur[i + 1] + cur[i - N] + cur[i + N]) * 0.5 - prev[i]) * damp[i];
      }
    }
    // rotate: prev <- cur, cur <- next
    this._prev = cur;
    this._cur = next;
    this._next = prev;
    // clear borders of the new "next" (old prev) to avoid stale edges
    const b = this._next;
    for (let x = 0; x < N; x++) { b[x] = 0; b[(N - 1) * N + x] = 0; }
    for (let y = 0; y < N; y++) { b[y * N] = 0; b[y * N + N - 1] = 0; }
  }

  _ambientDrips(dt) {
    if (!this.ambient) return;
    this._dripT -= dt;
    if (this._dripT > 0) return;
    this._dripT = 1.5 + this.rng() * 3.0;
    // rejection-sample a point inside the pond
    for (let k = 0; k < 12; k++) {
      const nx = 0.15 + this.rng() * 0.7;
      const ny = 0.15 + this.rng() * 0.7;
      if (this._pondAt(nx, ny, this._aspect)[0] > 0.75) {
        this.disturb(nx, ny, 2.5 + this.rng() * 2, 0.5 + this.rng() * 0.5);
        return;
      }
    }
  }

  /* ---------------- frame ---------------- */

  frame(nowMs) {
    if (!this.ok) return;
    if (!this._lastT) this._lastT = nowMs;
    let dt = (nowMs - this._lastT) / 1000;
    this._lastT = nowMs;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;
    this.time += dt;

    // fixed-step sim
    this._acc += dt;
    const STEP = 1 / 60;
    let n = 0;
    while (this._acc >= STEP && n < 3) {
      this._simStep();
      this._acc -= STEP;
      n++;
    }
    if (n === 3) this._acc = 0;

    this._ambientDrips(dt);
    this._render();
  }

  _render() {
    const gl = this.gl;
    const N = this.N;

    // underwater scene (pond bottom + koi) renders offscreen first;
    // the surface pass refracts it as uBottom.
    let bottomTex = this._texBottom;
    if (this.onUnderwater && this._rt) {
      const rt = this._rt;
      gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fb);
      gl.viewport(0, 0, rt.w, rt.h);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.onUnderwater(this.uw);
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      bottomTex = rt.tex;
    }

    gl.useProgram(this._prog);
    gl.bindVertexArray(this._vaoSurf);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._texHeight);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, N, N, 0, gl.RED, gl.FLOAT, this._cur);
    gl.uniform1i(this._u.height, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bottomTex);
    gl.uniform1i(this._u.bottom, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this._texMask);
    gl.uniform1i(this._u.mask, 2);

    gl.uniform1f(this._u.time, this.time);
    gl.uniform2f(this._u.res, this.canvas.width, this.canvas.height);
    gl.uniform1f(this._u.aspect, this._aspect);
    gl.uniform1f(this._u.gloom, this.gloom);
    gl.uniform1f(this._u.clarity, this.clarity);
    gl.uniform3f(this._u.sunDir, this.sunDir[0], this.sunDir[1], this.sunDir[2]);
    gl.uniform3f(this._u.sunCol, this.sunCol[0], this.sunCol[1], this.sunCol[2]);
    gl.uniform3f(this._u.skyCol, this.skyCol[0], this.skyCol[1], this.skyCol[2]);
    gl.uniform1f(this._u.nightF, this.nightF);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // surface decorations (lily pads, pellets, petals, rain) on top of water
    if (this.onSurface && this.surf) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.onSurface(this.surf);
      gl.disable(gl.BLEND);
    }
    gl.bindVertexArray(null);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WaterEngine, mulberry32 };
}
