'use strict';
/* TENSION — a small hand-rolled WebGL renderer for one cutaway lock.
 *
 * Why hand-rolled: the game must stay self-contained (no CDN dependency,
 * every byte pushable), and a lock is the kindest possible 3D subject —
 * cylinders, pins and one warm light. Perspective, a real depth buffer,
 * lambert + specular shading, nothing allocated per frame.
 *
 * The section model: shear line at y=0, keyway floor at y=-2.35, five
 * chambers along x. Set stacks show the one true tell of a picked lock:
 * a hairline of light through the gap at the shear line.
 */
const VIS = 0.5;                 // sim lift units -> world units
const FLOOR_Y = -2.35, SHEAR_Y = 0, CEIL_Y = 2.3;
const PIN_X = [-2.4, -1.2, 0, 1.2, 2.4];
const PLUG_PIVOT_Y = -1.2;
/* chamber centres for n stacks: five at the classic spacing, six a breath closer */
function pinXArr(n) {
  const sp = n > 5 ? 1.13 : 1.2, out = [];
  for (let i = 0; i < n; i++) out.push((i - (n - 1) / 2) * sp);
  return out;
}

function keyLen(need) { return 2.35 - need * VIS; } // bitting, honestly derived

/* ---------- tiny mat4 (column major) ---------- */
function mIdent() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
function mMul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
function mPersp(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
  o[0] = f / aspect; o[5] = f; o[10] = (far + near) / (near - far); o[11] = -1;
  o[14] = 2 * far * near / (near - far);
  return o;
}
function mTrans(x, y, z) { const o = mIdent(); o[12] = x; o[13] = y; o[14] = z; return o; }
function mScale(x, y, z) { const o = mIdent(); o[0] = x; o[5] = y; o[10] = z; return o; }
function mRotX(a) { const o = mIdent(), c = Math.cos(a), s = Math.sin(a); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; }
function mRotY(a) { const o = mIdent(), c = Math.cos(a), s = Math.sin(a); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; }
function mRotZ(a) { const o = mIdent(), c = Math.cos(a), s = Math.sin(a); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; }
function compose(px, py, pz, rx, ry, rz, sx, sy, sz) {
  let m = mTrans(px, py, pz);
  if (rx) m = mMul(m, mRotX(rx));
  if (ry) m = mMul(m, mRotY(ry));
  if (rz) m = mMul(m, mRotZ(rz));
  if (sx !== 1 || sy !== 1 || sz !== 1) m = mMul(m, mScale(sx, sy, sz));
  return m;
}
/* rotation about an arbitrary pivot height on the X axis */
function rotAboutX(angle, pivotY) {
  return mMul(mTrans(0, pivotY, 0), mMul(mRotX(angle), mTrans(0, -pivotY, 0)));
}

/* ---------- geometry builders: [pos xyz, normal xyz] interleaved ---------- */
function Geo() { this.a = []; }
Geo.prototype.quad = function (p1, p2, p3, p4, n) {
  const v = [p1, p2, p3, p1, p3, p4];
  for (const p of v) this.a.push(p[0], p[1], p[2], n[0], n[1], n[2]);
};
Geo.prototype.boxAt = function (w, h, d, cx, cy, cz) {
  const x = w / 2, y = h / 2, z = d / 2, ox = cx, oy = cy, oz = cz;
  const Q = (p1, p2, p3, p4, n) => this.quad(
    [p1[0] + ox, p1[1] + oy, p1[2] + oz], [p2[0] + ox, p2[1] + oy, p2[2] + oz],
    [p3[0] + ox, p3[1] + oy, p3[2] + oz], [p4[0] + ox, p4[1] + oy, p4[2] + oz], n);
  Q([-x,-y, z],[ x,-y, z],[ x, y, z],[-x, y, z],[0,0,1]);
  Q([ x,-y,-z],[-x,-y,-z],[-x, y,-z],[ x, y,-z],[0,0,-1]);
  Q([-x, y, z],[ x, y, z],[ x, y,-z],[-x, y,-z],[0,1,0]);
  Q([-x,-y,-z],[ x,-y,-z],[ x,-y, z],[-x,-y, z],[0,-1,0]);
  Q([ x,-y, z],[ x,-y,-z],[ x, y,-z],[ x, y, z],[1,0,0]);
  Q([-x,-y,-z],[-x,-y, z],[-x, y, z],[-x, y,-z],[-1,0,0]);
  return this;
};
Geo.prototype.box = function (w, h, d) {
  const x = w / 2, y = h / 2, z = d / 2;
  this.quad([-x,-y, z],[ x,-y, z],[ x, y, z],[-x, y, z],[0,0,1]);
  this.quad([ x,-y,-z],[-x,-y,-z],[-x, y,-z],[ x, y,-z],[0,0,-1]);
  this.quad([-x, y, z],[ x, y, z],[ x, y,-z],[-x, y,-z],[0,1,0]);
  this.quad([-x,-y,-z],[ x,-y,-z],[ x,-y, z],[-x,-y, z],[0,-1,0]);
  this.quad([ x,-y, z],[ x,-y,-z],[ x, y,-z],[ x, y, z],[1,0,0]);
  this.quad([-x,-y,-z],[-x,-y, z],[-x, y, z],[-x, y,-z],[-1,0,0]);
  return this;
};
/* cylinder along X; theta range lets us make the plug's open-front shell */
Geo.prototype.cylX = function (r, len, seg, th0, th1, capEnds) {
  const hx = len / 2;
  for (let i = 0; i < seg; i++) {
    const a0 = th0 + (th1 - th0) * i / seg, a1 = th0 + (th1 - th0) * (i + 1) / seg;
    const y0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r, y1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r;
    const n0 = [0, Math.cos(a0), Math.sin(a0)], n1 = [0, Math.cos(a1), Math.sin(a1)];
    const A = [-hx, y0, z0], B = [hx, y0, z0], C = [hx, y1, z1], D = [-hx, y1, z1];
    const mid = [(n0[0] + n1[0]) / 2, (n0[1] + n1[1]) / 2, (n0[2] + n1[2]) / 2];
    const L = Math.hypot(mid[1], mid[2]) || 1; mid[1] /= L; mid[2] /= L;
    this.quad(A, B, C, D, mid);
  }
  if (capEnds) {
    for (const sx of [-1, 1]) {
      for (let i = 0; i < seg; i++) {
        const a0 = th0 + (th1 - th0) * i / seg, a1 = th0 + (th1 - th0) * (i + 1) / seg;
        const p = a => [sx * hx, Math.cos(a) * r, Math.sin(a) * r];
        const v = [[sx * hx, 0, 0], p(a0), p(a1)];
        for (const q of v) this.a.push(q[0], q[1], q[2], sx, 0, 0);
      }
    }
  }
  return this;
};
Geo.prototype.coneY = function (r, h, seg) { // tip up, base at y=0
  for (let i = 0; i < seg; i++) {
    const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
    const p = a => [Math.cos(a) * r, 0, Math.sin(a) * r];
    const tip = [0, h, 0], A = p(a0), B = p(a1);
    const n = [Math.cos((a0 + a1) / 2) * 0.8, 0.45, Math.sin((a0 + a1) / 2) * 0.8];
    for (const q of [A, B, tip]) this.a.push(q[0], q[1], q[2], n[0], n[1], n[2]);
  }
  return this;
};
Geo.prototype.coil = function (r, tube, coils, segPer, pitch) {
  // a true 4-sided tube wound along the helix: corners offset from the
  // centreline in the radial/vertical plane, four quads per step.
  // Natural height is coils*pitch — variants are picked per stack so
  // the wire is never stretched, only the spring's length changes.
  const steps = coils * segPer;
  const PH = [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
  const corner = (t, ph) => {
    const a = t * coils * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const ro = Math.cos(ph) * tube, vo = Math.sin(ph) * tube;
    return {
      p: [ca * (r + ro), t * coils * pitch + vo, sa * (r + ro)],
      n: [ca * Math.cos(ph), Math.sin(ph), sa * Math.cos(ph)],
    };
  };
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    for (let s = 0; s < 4; s++) {
      const A = corner(t0, PH[s]), B = corner(t1, PH[s]), C = corner(t1, PH[(s + 1) % 4]), D = corner(t0, PH[(s + 1) % 4]);
      const n = A.n;
      for (const q of [A.p, B.p, C.p, A.p, C.p, D.p]) this.a.push(q[0], q[1], q[2], n[0], n[1], n[2]);
    }
  }
  return this;
};
Geo.prototype.done = function () { return new Float32Array(this.a); };

/* ---------- renderer ---------- */
const VSH = `
attribute vec3 aPos; attribute vec3 aNor;
uniform mat4 uMVP; uniform mat4 uModel;
varying vec3 vNor; varying vec3 vWorld;
void main(){
  vec4 w = uModel * vec4(aPos,1.0);
  vWorld = w.xyz;
  vNor = mat3(uModel) * aNor;
  gl_Position = uMVP * vec4(aPos,1.0);
}`;
const FSH = `
precision mediump float;
uniform vec3 uColor; uniform float uShine; uniform float uAlpha; uniform vec3 uCam;
varying vec3 vNor; varying vec3 vWorld;
void main(){
  vec3 n = normalize(vNor);
  vec3 l1 = normalize(vec3(0.55, 0.85, 0.65));
  vec3 l2 = normalize(vec3(-0.7, 0.2, 0.4));
  float d1 = max(dot(n, l1), 0.0);
  float d2 = max(dot(n, l2), 0.0);
  vec3 v = normalize(uCam - vWorld);
  vec3 h = normalize(l1 + v);
  float spec = pow(max(dot(n, h), 0.0), uShine) * 0.55;
  vec3 col = uColor * (0.16 + 0.95 * d1 * vec3(1.0, 0.93, 0.8) + 0.22 * d2 * vec3(0.6, 0.7, 0.9));
  col += spec * vec3(1.0, 0.96, 0.88);
  float fog = smoothstep(16.0, 7.0, length(uCam - vWorld));
  col *= 0.35 + 0.65 * fog;
  gl_FragColor = vec4(col, uAlpha);
}`;
const BGSH = `
precision mediump float;
varying vec2 vUv;
void main(){
  float t = vUv.y;
  vec3 top = vec3(0.028, 0.028, 0.034);
  vec3 mid = vec3(0.012, 0.012, 0.016);
  vec3 col = mix(mid, top, smoothstep(0.25, 1.0, t));
  float glow = exp(-pow(distance(vUv, vec2(0.5, 0.58)) * 2.6, 2.0));
  col += glow * vec3(0.05, 0.042, 0.028);
  gl_FragColor = vec4(col, 1.0);
}`;

function createRenderer(canvas) {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
  if (!gl) return null;
  function shader(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VSH));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FSH));
  gl.linkProgram(prog);
  const bgProg = gl.createProgram();
  gl.attachShader(bgProg, shader(gl.VERTEX_SHADER, `
    attribute vec2 aP; varying vec2 vUv;
    void main(){ vUv = aP * 0.5 + 0.5; gl_Position = vec4(aP, 0.999, 1.0); }`));
  gl.attachShader(bgProg, shader(gl.FRAGMENT_SHADER, BGSH));
  gl.linkProgram(bgProg);
  const bgBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1]), gl.STATIC_DRAW);

  const U = {
    mvp: gl.getUniformLocation(prog, 'uMVP'), model: gl.getUniformLocation(prog, 'uModel'),
    color: gl.getUniformLocation(prog, 'uColor'), shine: gl.getUniformLocation(prog, 'uShine'),
    alpha: gl.getUniformLocation(prog, 'uAlpha'), cam: gl.getUniformLocation(prog, 'uCam'),
  };
  const aPos = gl.getAttribLocation(prog, 'aPos'), aNor = gl.getAttribLocation(prog, 'aNor');

  function mesh(geoArr) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, geoArr, gl.STATIC_DRAW);
    return { buf, count: geoArr.length / 6 };
  }
  const M = {
    box: mesh(new Geo().box(1, 1, 1).done()),
    drvPlain: mesh(new Geo().boxAt(0.52, 0.8, 0.52, 0, 0.4, 0).done()),
    drvSpool: mesh(new Geo()
      .boxAt(0.52, 0.26, 0.52, 0, 0.13, 0)
      .boxAt(0.3, 0.28, 0.3, 0, 0.4, 0)
      .boxAt(0.52, 0.26, 0.52, 0, 0.67, 0).done()),
    drvShroom: mesh(new Geo()
      .boxAt(0.3, 0.52, 0.3, 0, 0.26, 0)
      .boxAt(0.62, 0.28, 0.62, 0, 0.66, 0).done()),
    drvSerrated: mesh(new Geo()
      .boxAt(0.46, 0.8, 0.46, 0, 0.4, 0)
      .boxAt(0.57, 0.07, 0.57, 0, 0.22, 0)
      .boxAt(0.57, 0.07, 0.57, 0, 0.52, 0).done()),
    keyPin: mesh(new Geo().box(0.46, 1, 0.46).done()),
    tip: mesh(new Geo().coneY(0.23, 0.3, 10).done()),
    spring5: mesh(new Geo().coil(0.16, 0.05, 5, 8, 0.3).done()),
    spring7: mesh(new Geo().coil(0.16, 0.05, 7, 8, 0.3).done()),
    spring9: mesh(new Geo().coil(0.16, 0.05, 9, 8, 0.3).done()),
    spring11: mesh(new Geo().coil(0.16, 0.05, 11, 8, 0.3).done()),
    plugShell: mesh(new Geo().cylX(1.06, 7.0, 28, Math.PI * 0.88, Math.PI * 2.12, false).done()),
    cap: mesh(new Geo().cylX(1.06, 0.3, 28, 0, Math.PI * 2, true).done()),
  };
  /* the bodies: one lock, several metals. setBody() re-dresses every
     surface; the void behind it never changes. */
  const BODIES = {
    brass: {
      BRASS: [0.44, 0.32, 0.14], BRASS_HI: [0.56, 0.42, 0.19], PLUG_CORE: [0.27, 0.21, 0.11],
      PIN_L: [0.58, 0.6, 0.64], PIN_ACT: [0.74, 0.6, 0.32], DRIVER: [0.31, 0.3, 0.28],
      STEEL: [0.5, 0.53, 0.58], STEEL_D: [0.47, 0.49, 0.54], HOUSING: [0.13, 0.13, 0.15],
      DARK: [0.05, 0.05, 0.06], BLUED: [0.2, 0.25, 0.34], GAP: [1.0, 0.85, 0.5],
    },
    blued: {
      BRASS: [0.36, 0.42, 0.52], BRASS_HI: [0.48, 0.55, 0.66], PLUG_CORE: [0.1, 0.12, 0.16],
      PIN_L: [0.55, 0.58, 0.63], PIN_ACT: [0.72, 0.8, 0.92], DRIVER: [0.22, 0.24, 0.28],
      STEEL: [0.52, 0.56, 0.62], STEEL_D: [0.42, 0.46, 0.52], HOUSING: [0.09, 0.1, 0.13],
      DARK: [0.04, 0.045, 0.06], BLUED: [0.16, 0.2, 0.28], GAP: [0.78, 0.87, 1.0],
    },
    verdigris: {
      BRASS: [0.4, 0.3, 0.13], BRASS_HI: [0.53, 0.41, 0.18], PLUG_CORE: [0.12, 0.1, 0.06],
      PIN_L: [0.55, 0.57, 0.6], PIN_ACT: [0.86, 0.63, 0.22], DRIVER: [0.27, 0.28, 0.25],
      STEEL: [0.48, 0.52, 0.5], STEEL_D: [0.4, 0.45, 0.42], HOUSING: [0.08, 0.13, 0.11],
      DARK: [0.04, 0.06, 0.05], BLUED: [0.2, 0.25, 0.34], GAP: [0.66, 1.0, 0.84],
    },
  };
  let BRASS, BRASS_HI, PLUG_CORE, PIN_L, PIN_ACT, DRIVER, STEEL, STEEL_D, HOUSING, DARK, BLUED, GAP;
  function setBody(name) {
    const P = BODIES[name] || BODIES.brass;
    BRASS = P.BRASS; BRASS_HI = P.BRASS_HI; PLUG_CORE = P.PLUG_CORE;
    PIN_L = P.PIN_L; PIN_ACT = P.PIN_ACT; DRIVER = P.DRIVER;
    STEEL = P.STEEL; STEEL_D = P.STEEL_D; HOUSING = P.HOUSING;
    DARK = P.DARK; BLUED = P.BLUED; GAP = P.GAP;
  }
  setBody('brass');

  let proj = mIdent(), view = mIdent(), camPos = [0, 0, 10];
  let curSway = 0;
  function draw(m, model, color, shine, alpha) {
    const mvp = mMul(proj, mMul(view, model));
    gl.uniformMatrix4fv(U.mvp, false, mvp);
    gl.uniformMatrix4fv(U.model, false, model);
    gl.uniform3fv(U.color, color);
    gl.uniform1f(U.shine, shine);
    gl.uniform1f(U.alpha, alpha === undefined ? 1 : alpha);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
    gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aNor);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(aNor, 3, gl.FLOAT, false, 24, 12);
    gl.drawArrays(gl.TRIANGLES, 0, m.count);
  }

  /* view: { lock, activePin, push, tensionIn, openT 0..1, snapT, time } */
  function frame(view3) {
    const w = canvas.width, h = canvas.height;
    gl.viewport(0, 0, w, h);
    const aspect = w / h;
    const fov = aspect < 0.8 ? 0.98 : aspect < 1.3 ? 0.82 : 0.68;
    const dist = aspect < 0.8 ? 11.5 : aspect < 1.3 ? 10.2 : 9.4;
    proj = mPersp(fov, aspect, 0.1, 60);
    const sway = Math.sin(view3.time * 0.00023) * 0.35;
    camPos = [sway, 0.55 + Math.sin(view3.time * 0.00017) * 0.12, dist];
    curSway = sway;
    view = mMul(mTrans(-camPos[0], -camPos[1], -camPos[2]), mRotX(-0.05));

    // backdrop
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(bgProg);
    const bgA = gl.getAttribLocation(bgProg, 'aP');
    gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf);
    gl.enableVertexAttribArray(bgA);
    gl.vertexAttribPointer(bgA, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(prog);
    gl.uniform3fv(U.cam, camPos);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const lock = view3.lock;
    const PX = pinXArr(lock.stacks.length);
    const plugAng = (lock.plug * Math.PI / 180) * (1 - view3.openT) + view3.openT * 1.25;
    const plugM = rotAboutX(plugAng, PLUG_PIVOT_Y);
    const openSlide = view3.openT * 0.5;

    // tray shadow + floor
    draw(M.box, compose(0, -3.28, -0.6, 0, 0, 0, 10.5, 0.1, 4.4), [0.02, 0.02, 0.025], 8, 1);
    // housing: back plate, a top cap, and webs BETWEEN the chambers —
    // the chambers themselves are open slots in the cut face
    draw(M.box, compose(0, 0.15, -0.78, 0, 0, 0, 7.6, 5.3, 0.35), HOUSING, 18);
    draw(M.box, compose(0, 2.47, -0.28, 0, 0, 0, 7.6, 0.36, 1.15), HOUSING, 22);
    for (let i = 0; i < PX.length - 1; i++)
      draw(M.box, compose((PX[i] + PX[i + 1]) / 2, 1.15, -0.28, 0, 0, 0, 0.55, 2.3, 1.15), HOUSING, 22);
    draw(M.box, compose(-3.62, 0.55, -0.28, 0, 0, 0, 0.55, 3.5, 1.15), HOUSING, 22);
    draw(M.box, compose(3.62, 0.55, -0.28, 0, 0, 0, 0.55, 3.5, 1.15), HOUSING, 22);
    // chamber darkness behind each stack
    for (let i = 0; i < PX.length; i++)
      draw(M.box, compose(PX[i], 0.55, -0.52, 0, 0, 0, 0.78, 3.9, 0.3), DARK, 4);
    // a hairline of brass inlay along the shear line
    draw(M.box, compose(0, 0.012, 0.34, 0, 0, 0, 7.15, 0.024, 0.02), BRASS, 60);

    // plug: shell (open toward camera), body block behind the section, end cap
    const plugSlideM = mMul(mTrans(openSlide, 0, 0), plugM);
    draw(M.plugShell, mMul(plugSlideM, mTrans(0, PLUG_PIVOT_Y, -0.1)), BRASS, 46);
    draw(M.box, mMul(plugSlideM, compose(0, -1.32, -0.62, 0, 0, 0, 7.0, 2.1, 0.55)), PLUG_CORE, 30);
    draw(M.cap, mMul(plugSlideM, mTrans(-3.62, PLUG_PIVOT_Y, -0.1)), BRASS_HI, 52);
    draw(M.cap, mMul(plugSlideM, mMul(mTrans(-3.8, PLUG_PIVOT_Y, -0.1), mScale(0.55, 0.55, 1))), PLUG_CORE, 30);
    // keyway slot on the cap + an index notch so the give is readable
    draw(M.box, mMul(plugSlideM, compose(-3.44, -1.62, -0.1, 0, 0, 0, 0.06, 0.95, 0.5)), DARK, 4);
    draw(M.box, mMul(plugSlideM, compose(-3.44, PLUG_PIVOT_Y + 0.86, -0.1, 0, 0, 0, 0.07, 0.3, 0.14)), DARK, 4);

    // stacks
    for (let i = 0; i < lock.stacks.length; i++) {
      const s = lock.stacks[i];
      const kl = keyLen(s.need);
      const liftV = s.lift * VIS;
      const x = PX[i];
      // key pin + its tip ride with the plug
      const keyBase = FLOOR_Y + liftV;
      const keyM = mMul(plugSlideM, compose(x, keyBase + kl / 2, -0.12, 0, 0, 0, 1, kl, 1));
      draw(M.keyPin, keyM, i === view3.activePin ? PIN_ACT : PIN_L, 42);
      draw(M.tip, mMul(plugSlideM, compose(x, keyBase + kl, -0.12, 0, 0, 0, 1, 1, 1)), i === view3.activePin ? PIN_ACT : PIN_L, 42);
      // driver: housing side; a set driver floats a breath above the gap
      let dLift = liftV;
      if (s.state === 'set' && s.lift <= s.need + 0.001) dLift = s.need * VIS + 0.15;
      const drvBase = FLOOR_Y + kl + dLift;
      const drvMesh = s.kind === 'spool' ? M.drvSpool : s.kind === 'shroom' ? M.drvShroom : s.kind === 'serrated' ? M.drvSerrated : M.drvPlain;
      draw(drvMesh, compose(x, drvBase, -0.12, 0, 0, 0, 1, 1, 1), DRIVER, 30);
      // spring, squashed between driver top and the chamber ceiling:
      // the nearest honest variant, scaled only a breath
      const springBase = drvBase + 0.8, springH = Math.max(0.12, CEIL_Y - springBase);
      const variant = springH < 1.8 ? M.spring5 : springH < 2.4 ? M.spring7 : springH < 3.0 ? M.spring9 : M.spring11;
      const vH = springH < 1.8 ? 1.5 : springH < 2.4 ? 2.1 : springH < 3.0 ? 2.7 : 3.3;
      draw(variant, compose(x, springBase, -0.12, 0, 0, 0, 1, springH / vH, 1), STEEL_D, 26);
      // the tell: light through the shear gap of a set stack
      if (s.state === 'set')
        draw(M.box, compose(x, 0.02, 0.1, 0, 0, 0, 0.56, 0.035, 0.3), GAP, 90, 0.85);
      if (s.state === 'over')
        draw(M.box, compose(x, 0.02, 0.1, 0, 0, 0, 0.56, 0.035, 0.3), [0.62, 0.2, 0.14], 40, 0.5);
      if (s.state === 'false')
        draw(M.box, compose(x, 0.02, 0.1, 0, 0, 0, 0.56, 0.035, 0.3), [0.5, 0.38, 0.16], 40, 0.42);
    }

    // tension wrench: an L of blued steel at the plug's mouth, flexing
    const tenFlex = view3.tensionIn * 0.1 + lock.tension * 0.06;
    draw(M.box, mMul(plugSlideM, compose(-2.95, -2.28 + tenFlex * 0.4, 0.32, -tenFlex, 0, 0, 1.5, 0.13, 0.07)), BLUED, 34);
    draw(M.box, mMul(plugSlideM, compose(-3.62, -2.02, 0.32, -tenFlex, 0, 0, 0.13, 0.62, 0.07)), BLUED, 34);

    // the pick: shaft, a rising lifter, a tip — bending under stress
    if (view3.snapT <= 0) {
      const ax = PX[Math.max(0, view3.activePin)];
      const s = lock.stacks[Math.max(0, view3.activePin)];
      const tipY = FLOOR_Y + (view3.push > 0.02 ? s.lift * VIS : 0.02);
      const bend = lock.stress * 0.34 + (lock.stress > 0.7 ? Math.sin(view3.time * 0.09) * 0.05 * lock.stress : 0);
      const baseX = ax - 3.4, midX = ax - 0.55;
      draw(M.box, compose((baseX + midX) / 2, FLOOR_Y + 0.06, 0.3, 0, 0, bend * 0.25, midX - baseX, 0.085, 0.06), BLUED, 40);
      const lifterLen = Math.hypot(ax - midX, tipY - FLOOR_Y);
      const ang = Math.atan2(tipY - FLOOR_Y, ax - midX);
      draw(M.box, compose((midX + ax) / 2, (FLOOR_Y + tipY) / 2 + 0.03, 0.3, 0, 0, ang - bend * 0.5, lifterLen, 0.08, 0.06), PIN_L, 44);
      draw(M.box, compose(ax, tipY - 0.015, 0.3, 0, 0, -bend * 0.4, 0.5, 0.06, 0.06), PIN_L, 44);
    } else {
      // the snapped tip, tumbling away
      const t = view3.snapT;
      draw(M.box, compose(PX[Math.max(0, view3.activePin)] + t * 1.4, FLOOR_Y + 0.4 - t * t * 2.4, 0.3, 0, 0, t * 5, 0.5, 0.05, 0.045), STEEL_D, 30);
    }
  }
  return { frame, setBody, sway: () => curSway };
}

const TNR = { createRenderer, PIN_X, VIS, pinXArr };
if (typeof module !== 'undefined' && module.exports) module.exports = TNR;
