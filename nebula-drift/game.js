/* Nebula Drift — the real 3D rebuild.
 *
 * Jimmy's catch (2026-10-21): Passes 1–3 were a Canvas-2D projection —
 * flat sprites, a camera that rotated in place, and a "voyage" that was
 * a render-time offset. This file replaces the renderer wholesale with
 * raw WebGL and a persistent world:
 *
 *   - a star shell in true 3D: tonight's catalogue at log-scaled real
 *     distances, field stars and the Milky Way on a far shell;
 *   - gas as billboarded puffs in two true volumes — the distant anchor
 *     complexes at their real sky positions, and a local nebula volume
 *     (wrapping, coloured regions) that the camera genuinely flies
 *     through forever, with density fog when you're inside a cloud;
 *   - a camera that actually travels: position integrates forward
 *     every frame; the press-hold voyage is now a literal sideways
 *     translation of the viewpoint, and figures dissolve because the
 *     geometry says so.
 *
 * sky.js (data + astronomy) and audio.js (the soundscape) are unchanged.
 * Whisper, detection, tour and input behaviour carry over from Pass 2/3.
 */
'use strict';
(function () {
  var SKY = window.SKY;
  var cv = document.getElementById('cv');
  var whisperEl = document.getElementById('whisper');
  var whisperMain = document.getElementById('whisperMain');
  var whisperSub = document.getElementById('whisperSub');

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var AU = window.ND_AUDIO || null;
  var mutedPref = false;
  try { mutedPref = !!window.localStorage.getItem('nd-muted'); } catch (e) { /* private mode */ }

  var tonight = SKY.tonightSky(new Date(), SKY.HOME);
  var rng = SKY.mulberry32(20261021);

  /* ================= WebGL setup ================= */
  var gl = null;
  try {
    gl = cv.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, alpha: false, depth: false, stencil: false });
  } catch (e) { gl = null; }
  window.__nebula = { ready: false, frameCount: 0, renderer: gl ? 'webgl' : 'none' };
  if (!gl) {
    whisperMain.textContent = 'This sky needs WebGL';
    whisperSub.textContent = 'try a newer browser to drift';
    whisperEl.classList.add('show');
    window.__nebula.error = 'webgl unavailable';
    return;
  }

  function makeProgram(vsSrc, fsSrc) {
    function shader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('shader: ' + gl.getShaderInfoLog(s));
      }
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    return p;
  }
  function attribLoc(prog, name) { return gl.getAttribLocation(prog, name); }
  function uniformLoc(prog, name) { return gl.getUniformLocation(prog, name); }
  function makeBuffer(target, data, usage) {
    var b = gl.createBuffer();
    gl.bindBuffer(target, b);
    gl.bufferData(target, data, usage || gl.STATIC_DRAW);
    return b;
  }

  /* ---- star points ----
   * HONEST AIR (review Pass J): the vertex shader reads each star's
   * true altitude off its world direction and treats the low sky the
   * way air does — scintillation grows (wider, faster twinkle),
   * extinction dims, and the colour warms as a star sinks toward
   * the horizon plane. High stars keep the original calm twinkle
   * exactly; planets, pinned at aTwk 0, stay steady but still dim
   * and warm when low, the way Venus does at dusk. */
  var starProg = makeProgram(
    'attribute vec3 aPos; attribute vec3 aCol; attribute float aSize;' +
    'attribute float aPhase; attribute float aTwk; attribute float aSpike;' +
    'uniform mat4 uProj; uniform mat4 uRot; uniform vec3 uShift;' +
    'uniform float uTime; uniform float uScaleH; uniform float uAlphaMul;' +
    'uniform vec3 uMoonDir; uniform float uMoonDim;' +
    'varying vec3 vCol; varying float vAlpha; varying float vSpike;' +
    'void main(){' +
    '  vec4 vp = uRot * vec4(aPos - uShift, 1.0);' +
    '  gl_Position = uProj * vp;' +
    '  float sinAlt = normalize(aPos).y;' +
    '  float lowAir = 1.0 - smoothstep(0.02, 0.34, sinAlt);' +
    '  float twAmp = mix(0.14, 0.30, lowAir);' +
    '  float tw = (1.0 - twAmp) + twAmp * sin(uTime * aTwk * (1.0 + 1.3 * lowAir) + aPhase);' +
    '  float ext = mix(1.0, 0.52, lowAir);' +
    '  vec3 dirW = normalize(aPos - uShift);' +
    '  float mDim = 1.0 - uMoonDim * smoothstep(0.966, 0.9986, dot(dirW, uMoonDir)) * 0.62;' +
    '  vCol = mix(aCol, aCol * vec3(1.0, 0.78, 0.58), lowAir * 0.55); vAlpha = tw * uAlphaMul * mDim * ext; vSpike = aSpike;' +
    '  gl_PointSize = clamp(aSize * uScaleH / max(1.0, -vp.z), 1.0, 64.0);' +
    '}',
    'precision mediump float;' +
    'varying vec3 vCol; varying float vAlpha; varying float vSpike;' +
    'void main(){' +
    '  vec2 pc = gl_PointCoord - 0.5;' +
    '  float d = length(pc) * 2.0;' +
    '  float a = pow(max(0.0, 1.0 - d), 2.4);' +
    '  if (vSpike > 0.01) {' +
    '    float cx = pow(max(0.0, 1.0 - abs(pc.y) * 2.0), 18.0) * pow(max(0.0, 1.0 - abs(pc.x) * 2.0), 2.0);' +
    '    float cy = pow(max(0.0, 1.0 - abs(pc.x) * 2.0), 18.0) * pow(max(0.0, 1.0 - abs(pc.y) * 2.0), 2.0);' +
    '    a += (cx + cy) * vSpike * 0.55 * (1.0 - d);' +
    '  }' +
    '  if (a < 0.004) discard;' +
    '  gl_FragColor = vec4(vCol, a * vAlpha);' +
    '}'
  );

  /* ---- gas puffs (billboarded quads) ---- */
  var gasProg = makeProgram(
    'attribute vec3 aPos; attribute vec2 aCorner; attribute vec3 aCol;' +
    'attribute float aSize; attribute float aAlpha; attribute float aPhase; attribute float aKind;' +
    'attribute float aRot; attribute float aAspect;' +
    'uniform mat4 uProj; uniform mat4 uRot;' +
    'uniform vec3 uCamPos; uniform vec3 uOrigin; uniform float uWrap; uniform float uBox;' +
    'uniform float uBreathe;' +
    'varying vec2 vUv; varying vec3 vCol; varying float vAlpha; varying float vPhase; varying float vKind;' +
    'void main(){' +
    '  vUv = aCorner; vCol = aCol; vPhase = aPhase; vKind = aKind;' +
    '  vec3 wp;' +
    '  if (uWrap > 0.5) { wp = mod(aPos - uCamPos, uBox) - uBox * 0.5; }' +
    '  else { wp = aPos + uOrigin - uCamPos; }' +
    '  vec4 vp = uRot * vec4(wp, 1.0);' +
    '  float depth = max(1.0, -vp.z);' +
    '  float nearFade = smoothstep(6.0, 95.0, depth);' +
    '  float farFade = 1.0 - uWrap * smoothstep(uBox * 0.34, uBox * 0.5, length(wp));' +
    '  float crA = cos(aRot), srA = sin(aRot);' +
    '  vec2 rc = vec2(aCorner.x * crA - aCorner.y * srA, aCorner.x * srA + aCorner.y * crA);' +
    '  rc.x *= aAspect;' +
    '  vp.xy += rc * (aSize * 0.5);' +
    '  gl_Position = uProj * vp;' +
    '  vAlpha = aAlpha * nearFade * farFade * uBreathe;' +
    '}',
    'precision mediump float;' +
    'varying vec2 vUv; varying vec3 vCol; varying float vAlpha; varying float vPhase; varying float vKind;' +
    'uniform float uKind;' +
    'void main(){' +
    '  if (abs(vKind - uKind) > 0.5) discard;' +
    '  float d = length(vUv);' +
    '  float fall = pow(max(0.0, 1.0 - d), 1.8);' +
    '  vec2 np1 = vUv * vec2(5.0, 4.0);' +
    '  float nz = 0.50 * (0.5 + 0.5 * sin(np1.x + vPhase) * sin(np1.y - vPhase * 1.3));' +
    '  vec2 np2 = vec2(vUv.x * 0.8 - vUv.y * 0.6, vUv.x * 0.6 + vUv.y * 0.8) * 10.5;' +
    '  nz += 0.30 * (0.5 + 0.5 * sin(np2.x - vPhase * 2.1) * sin(np2.y + vPhase));' +
    '  vec2 np3 = vec2(vUv.x * 0.6 + vUv.y * 0.8, -vUv.x * 0.8 + vUv.y * 0.6) * 23.0;' +
    '  nz += 0.20 * (0.5 + 0.5 * sin(np3.x + vPhase * 3.7) * sin(np3.y - vPhase * 0.7));' +
    '  float erode = smoothstep(0.16, 0.9, nz + (1.0 - d) * 0.38);' +
    '  float a = fall * erode * vAlpha * 1.3;' +
    '  if (a < 0.003) discard;' +
    '  gl_FragColor = vec4(vCol, a);' +
    '}'
  );

  /* ---- ribbons (threads of light, the meteor) ---- */
  var ribbonProg = makeProgram(
    'attribute vec3 aPos; attribute vec2 aOff; attribute float aAlpha;' +
    'uniform mat4 uProj; uniform mat4 uRot; uniform vec3 uShift;' +
    'varying float vA;' +
    'void main(){' +
    '  vec4 vp = uRot * vec4(aPos - uShift, 1.0);' +
    '  vp.xy += aOff;' +
    '  gl_Position = uProj * vp;' +
    '  vA = aAlpha;' +
    '}',
    'precision mediump float;' +
    'uniform vec3 uCol; varying float vA;' +
    'void main(){ gl_FragColor = vec4(uCol, vA); }'
  );

  /* ---- the Moon: one billboarded quad, lit by the real Sun ----
   * The disc lives in a celestial frame (p.x toward increasing RA,
   * p.y toward the north celestial pole, both projected per frame on
   * the CPU), so the maria keep their true place among the stars and
   * the terminator falls where the Sun's actual direction puts it.
   * Maria are a handful of soft dark plains in their approximate true
   * positions — a portrait, not a photograph. The dark side is near-
   * black and occludes: no earthshine, by design. */
  var moonProg = makeProgram(
    'attribute vec3 aPos; attribute vec2 aCorner;' +
    'uniform mat4 uProj; uniform mat4 uRot; uniform vec3 uShift; uniform float uSize;' +
    'varying vec2 vQ;' +
    'void main(){' +
    '  vec4 vp = uRot * vec4(aPos - uShift, 1.0);' +
    '  vp.xy += aCorner * (uSize * 0.5);' +
    '  gl_Position = uProj * vp;' +
    '  vQ = aCorner;' +
    '}',
    'precision mediump float;' +
    'varying vec2 vQ;' +
    'uniform vec2 uEast; uniform vec2 uNorth; uniform vec3 uSun; uniform float uDiscR;' +
    'float blob(vec2 p, vec2 c, float r){ vec2 d = p - c; return smoothstep(r, r * 0.30, length(d)); }' +
    'void main(){' +
    '  vec2 p = vec2(dot(vQ, uEast), dot(vQ, uNorth));' +
    '  float rp = length(p);' +
    '  vec3 col; float alpha;' +
    '  if (rp <= uDiscR) {' +
    '    vec2 dn = p / uDiscR;' +
    '    float z = sqrt(max(0.0, 1.0 - dot(dn, dn)));' +
    '    vec3 n = vec3(dn, z);' +
    '    float li = dot(n, normalize(uSun));' +
    '    float maria = 0.0;' +
    '    maria += 0.55 * blob(dn, vec2(-0.36, 0.16), 0.46);' +  /* Oceanus Procellarum */
    '    maria += 0.50 * blob(dn, vec2(-0.28, 0.50), 0.21);' +  /* Imbrium */
    '    maria += 0.45 * blob(dn, vec2(0.16, 0.30), 0.25);' +   /* Serenitatis */
    '    maria += 0.50 * blob(dn, vec2(0.30, 0.02), 0.27);' +   /* Tranquillitatis */
    '    maria += 0.55 * blob(dn, vec2(0.63, 0.27), 0.115);' +  /* Crisium */
    '    maria += 0.40 * blob(dn, vec2(-0.06, -0.33), 0.23);' + /* Nubium */
    '    maria += 0.35 * blob(dn, vec2(0.10, -0.60), 0.19);' +  /* southern highlands shade */
    '    maria = clamp(maria, 0.0, 0.72);' +
    '    vec3 base = mix(vec3(0.93, 0.90, 0.82), vec3(0.46, 0.45, 0.43), maria);' +
    '    float shade = smoothstep(-0.10, 0.28, li);' +
    '    col = base * (0.015 + 0.985 * shade);' +
    '    alpha = 1.0;' +
    '  } else {' +
    '    float g = exp(-pow(max(0.0, rp - uDiscR) * 3.4, 1.6));' +
    '    col = vec3(0.82, 0.85, 0.95);' +
    '    alpha = g * 0.16;' +
    '    if (alpha < 0.004) discard;' +
    '  }' +
    '  gl_FragColor = vec4(col, alpha);' +
    '}'
  );

  /* ---- meteors: small streak quads, CPU-steered ---- */
  var meteorProg = makeProgram(
    'attribute vec3 aPos; attribute float aU; attribute float aSide; attribute float aA;' +
    'uniform mat4 uProj; uniform mat4 uRot; uniform vec3 uShift;' +
    'varying float vU; varying float vSide; varying float vA;' +
    'void main(){' +
    '  gl_Position = uProj * (uRot * vec4(aPos - uShift, 1.0));' +
    '  vU = aU; vSide = aSide; vA = aA;' +
    '}',
    'precision mediump float;' +
    'varying float vU; varying float vSide; varying float vA;' +
    'void main(){' +
    '  float body = pow(vU, 2.0) * (1.0 - abs(vSide));' +
    '  float a = body * vA;' +
    '  if (a < 0.004) discard;' +
    '  gl_FragColor = vec4(vec3(1.0, 0.96, 0.88), a);' +
    '}'
  );

  /* ---- fullscreen fog quad ---- */
  var fogProg = makeProgram(
    'attribute vec2 aP;' +
    'void main(){ gl_Position = vec4(aP, 0.0, 1.0); }',
    'precision mediump float;' +
    'uniform vec3 uCol; uniform float uAlpha;' +
    'void main(){ gl_FragColor = vec4(uCol, uAlpha); }'
  );

  /* ================= shared data ================= */
  function hexRgb(hex) {
    return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
  }
  var PALETTES = {
    rose: ['#ff8fab', '#e8487a', '#6e1d47'], teal: ['#8ff0e2', '#2bb3a3', '#0b5560'],
    gold: ['#ffe1a1', '#eda854', '#7a4a1f'], pearl: ['#eef2ff', '#b3c2e8', '#54648f'],
    blue: ['#a9c8ff', '#5f8ce8', '#22397a'], tealrose: ['#8ff0e2', '#e8487a', '#123f5e'],
    tealgold: ['#8ff0e2', '#eda854', '#0b5560'], goldrose: ['#ffe1a1', '#e8487a', '#7a4a1f']
  };
  Object.keys(PALETTES).forEach(function (k) { PALETTES[k] = PALETTES[k].map(hexRgb); });
  function paletteShade(pal, r) {
    var p = PALETTES[pal];
    var c = r() < 0.3 ? p[0] : (r() < 0.62 ? p[1] : p[2]);
    var v = 0.75 + r() * 0.5;
    return [c[0] * v, c[1] * v, c[2] * v];
  }
  function depthFor(dist) { return 120 + Math.log(dist || 400) * 48; }
  function tangentBasis(dir) {
    var up = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    var tx = up[1] * dir[2] - up[2] * dir[1], ty = up[2] * dir[0] - up[0] * dir[2], tz = up[0] * dir[1] - up[1] * dir[0];
    var tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    return { t1: [tx, ty, tz], t2: [ty * dir[2] - tz * dir[1], tz * dir[0] - tx * dir[2], tx * dir[1] - ty * dir[0]] };
  }

  /* ================= star shell ================= */
  var shellCount = 0;
  var starGeo = null;
  function buildStarBuffer(entries) {
    var n = entries.length;
    var pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    var size = new Float32Array(n), phase = new Float32Array(n), twk = new Float32Array(n), spike = new Float32Array(n);
    entries.forEach(function (e, i) {
      pos.set(e.pos, i * 3); col.set(e.col, i * 3);
      size[i] = e.size; phase[i] = e.phase; twk[i] = e.twk; spike[i] = e.spike || 0;
    });
    return {
      count: n,
      pos: makeBuffer(gl.ARRAY_BUFFER, pos), col: makeBuffer(gl.ARRAY_BUFFER, col),
      size: makeBuffer(gl.ARRAY_BUFFER, size), phase: makeBuffer(gl.ARRAY_BUFFER, phase),
      twk: makeBuffer(gl.ARRAY_BUFFER, twk), spike: makeBuffer(gl.ARRAY_BUFFER, spike)
    };
  }
  function specCol(spec) {
    var c = SKY.spectralColor(spec);
    return [c[0] / 255, c[1] / 255, c[2] / 255];
  }
  function sizeFactorForMag(mag) { return Math.max(0.3, Math.min(1.9, 1.9 - mag * 0.33)); }

  var catByName = {}, catStars = [], planetPts = [];
  (function buildShell() {
    var r = SKY.mulberry32(777);
    var entries = [];
    /* field stars on the far shell */
    for (var i = 0; i < 1500; i++) {
      var u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      var distF = 2600 + r() * 1600;
      var magF = 4.6 + Math.pow(r(), 1.7) * 3.6;
      var spF = SKY.fieldSpec(r());
      entries.push({
        pos: [s * Math.cos(th) * distF, u * distF, s * Math.sin(th) * distF],
        col: specCol(spF), size: distF * 0.0105 * sizeFactorForMag(magF),
        phase: r() * 6.283, twk: 0.3 + r() * 0.8
      });
    }
    /* the Milky Way: a dense faint river on the real galactic plane */
    var lstNow = tonight.lst;
    var pole = SKY.dirFromRaDec(12.857, 27.13, SKY.HOME.lat, lstNow);
    var node = SKY.dirFromRaDec(18.857, 0, SKY.HOME.lat, lstNow);
    var bx = node, bz = pole;
    var byv = [bz[1] * bx[2] - bz[2] * bx[1], bz[2] * bx[0] - bz[0] * bx[2], bz[0] * bx[1] - bz[1] * bx[0]];
    var byl = Math.hypot(byv[0], byv[1], byv[2]) || 1; byv = [byv[0] / byl, byv[1] / byl, byv[2] / byl];
    var bx2 = [byv[1] * bz[2] - byv[2] * bz[1], byv[2] * bz[0] - byv[0] * bz[2], byv[0] * bz[1] - byv[1] * bz[0]];
    for (var m = 0; m < 1400; m++) {
      var lon = r() * Math.PI * 2;
      var latG = ((r() + r() + r()) / 3 - 0.5) * 0.42;
      var cl = Math.cos(latG);
      var gd = [
        cl * Math.cos(lon) * bx2[0] + cl * Math.sin(lon) * byv[0] + Math.sin(latG) * bz[0],
        cl * Math.cos(lon) * bx2[1] + cl * Math.sin(lon) * byv[1] + Math.sin(latG) * bz[1],
        cl * Math.cos(lon) * bx2[2] + cl * Math.sin(lon) * byv[2] + Math.sin(latG) * bz[2]
      ];
      var gl2 = Math.hypot(gd[0], gd[1], gd[2]) || 1;
      var distM = 2500 + r() * 1300, magM = 6.4 + r() * 2.6, spM = SKY.fieldSpec(r());
      entries.push({
        pos: [gd[0] / gl2 * distM, gd[1] / gl2 * distM, gd[2] / gl2 * distM],
        col: specCol(spM), size: distM * 0.0105 * sizeFactorForMag(magM),
        phase: r() * 6.283, twk: 0.3 + r() * 0.8
      });
    }
    /* tonight's catalogue, at true relative depths */
    tonight.stars.forEach(function (s, sIdx) {
      var dep = depthFor(s.dist);
      var csObj = {
        dir: s.dir, mag: s.mag, spec: s.spec.charAt(0), name: s.name, dist: s.dist,
        pos: [s.dir[0] * dep, s.dir[1] * dep, s.dir[2] * dep],
        ph: rng() * 6.283, tw: 0.25 + rng() * 0.6, fig: null, shellIndex: entries.length
      };
      catByName[s.name] = sIdx;
      catStars.push(csObj);
      entries.push({
        pos: csObj.pos, col: specCol(csObj.spec),
        size: dep * 0.0105 * sizeFactorForMag(s.mag) * 1.12,
        phase: csObj.ph, twk: csObj.tw, spike: s.mag <= 1.8 ? 1 : 0
      });
    });
    /* tonight's planets — the near layer. Computed for the same 22:00
     * instant as the stars (planets.js), hung at 190 units: inside the
     * nearest catalogue depth, so a voyage's sideways shift moves them
     * against the star shell, as their real closeness should. They do
     * not twinkle (aTwk 0 with phase pi/2 pins the shader's twinkle
     * factor at exactly 1) and carry no diffraction spike — a bright
     * planet is a small steady disc with a halo, not a star. */
    if (typeof PLANETS !== 'undefined') {
      var pDepth = 190;
      PLANETS.positions(tonight.date).forEach(function (p) {
        var pa = SKY.altAz(p.ra, p.dec, SKY.HOME.lat, tonight.lst);
        var pdir = SKY.dirFromAltAz(pa.alt, pa.az);
        var ppos = [pdir[0] * pDepth, pdir[1] * pDepth, pdir[2] * pDepth];
        var pcol = [p.color[0] / 255, p.color[1] / 255, p.color[2] / 255];
        var core = pDepth * 0.0105 * sizeFactorForMag(Math.max(p.mag, -0.6)) * 1.5;
        planetPts.push({ name: p.name, dir: pdir, alt: pa.alt, az: pa.az, mag: p.mag, pos: ppos });
        entries.push({ pos: ppos, col: pcol, size: core, phase: Math.PI / 2, twk: 0, spike: 0 });
        if (p.mag < 1.0) {
          entries.push({
            pos: ppos, size: core * 3.0, phase: Math.PI / 2, twk: 0, spike: 0,
            col: [pcol[0] * 0.30, pcol[1] * 0.30, pcol[2] * 0.30]
          });
        }
      });
    }
    starGeo = buildStarBuffer(entries);
    shellCount = entries.length;
  })();
  var upCount = tonight.stars.filter(function (s) { return s.alt > 0; }).length;

  /* figures resolved against tonight's stars (unchanged from Pass 2) */
  var figures = [], figuresByName = {};
  SKY.FIGURES.forEach(function (fDef) {
    var idxLines = [], usedSet = {}, centreAcc = [0, 0, 0], upStars = 0, totStars = 0;
    fDef.lines.forEach(function (ln) {
      idxLines.push([catByName[ln[0]], catByName[ln[1]]]);
      [ln[0], ln[1]].forEach(function (nm) { usedSet[nm] = true; });
    });
    var nearSt = null, farSt = null;
    Object.keys(usedSet).forEach(function (nm) {
      var st = tonight.stars[catByName[nm]];
      centreAcc[0] += st.dir[0]; centreAcc[1] += st.dir[1]; centreAcc[2] += st.dir[2];
      totStars++; if (st.alt > -2) upStars++;
      if (!nearSt || st.dist < nearSt.dist) nearSt = { name: nm, dist: st.dist };
      if (!farSt || st.dist > farSt.dist) farSt = { name: nm, dist: st.dist };
    });
    /* the middle witness (review Pass G): the star whose distance
     * sits nearest the geometric mean of near and far — the third
     * distance the long-voyage whisper names */
    var midSt = null;
    if (nearSt && farSt && totStars > 2) {
      var midTarget = Math.sqrt(nearSt.dist * farSt.dist);
      Object.keys(usedSet).forEach(function (nm) {
        if (nm === nearSt.name || nm === farSt.name) return;
        var d = tonight.stars[catByName[nm]].dist;
        if (!midSt || Math.abs(Math.log(d / midTarget)) < Math.abs(Math.log(midSt.dist / midTarget))) midSt = { name: nm, dist: d };
      });
    }
    var cLen = Math.hypot(centreAcc[0], centreAcc[1], centreAcc[2]) || 1;
    var figObj = {
      name: fDef.name, story: fDef.story, lines: idxLines,
      centre: [centreAcc[0] / cLen, centreAcc[1] / cLen, centreAcc[2] / cLen],
      upFrac: totStars ? upStars / totStars : 0, near: nearSt, far: farSt, mid: midSt
    };
    /* angular radius: the farthest of the figure's own stars from its
     * centre — what "inside the figure" means for a visiting planet */
    figObj.radius = 0;
    Object.keys(usedSet).forEach(function (nm) {
      var sd = tonight.stars[catByName[nm]].dir;
      var cosA = sd[0] * figObj.centre[0] + sd[1] * figObj.centre[1] + sd[2] * figObj.centre[2];
      var angA = Math.acos(Math.max(-1, Math.min(1, cosA)));
      if (angA > figObj.radius) figObj.radius = angA;
    });
    Object.keys(usedSet).forEach(function (nm) { catStars[catByName[nm]].fig = figObj; });
    figures.push(figObj); figuresByName[fDef.name] = figObj;
  });

  /* ================= gas geometry ================= */
  function buildGasBuffer(puffs) {
    var n = puffs.length;
    var vertsPer = 4;
    var pos = new Float32Array(n * vertsPer * 3), corner = new Float32Array(n * vertsPer * 2);
    var col = new Float32Array(n * vertsPer * 3), size = new Float32Array(n * vertsPer);
    var alpha = new Float32Array(n * vertsPer), phase = new Float32Array(n * vertsPer), kind = new Float32Array(n * vertsPer);
    var rot = new Float32Array(n * vertsPer), aspect = new Float32Array(n * vertsPer);
    var idx = new Uint16Array(n * 6);
    var corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    puffs.forEach(function (p, i) {
      for (var v = 0; v < 4; v++) {
        var vi = i * 4 + v;
        pos.set(p.pos, vi * 3); col.set(p.col, vi * 3);
        corner.set(corners[v], vi * 2);
        size[vi] = p.size; alpha[vi] = p.alpha; phase[vi] = p.phase; kind[vi] = p.kind;
        rot[vi] = p.rot || 0; aspect[vi] = p.aspect || 1;
      }
      var io = i * 6, vo = i * 4;
      idx[io] = vo; idx[io + 1] = vo + 1; idx[io + 2] = vo + 2;
      idx[io + 3] = vo; idx[io + 4] = vo + 2; idx[io + 5] = vo + 3;
    });
    return {
      count: n, indexCount: n * 6,
      pos: makeBuffer(gl.ARRAY_BUFFER, pos), corner: makeBuffer(gl.ARRAY_BUFFER, corner),
      col: makeBuffer(gl.ARRAY_BUFFER, col), size: makeBuffer(gl.ARRAY_BUFFER, size),
      alpha: makeBuffer(gl.ARRAY_BUFFER, alpha), phase: makeBuffer(gl.ARRAY_BUFFER, phase),
      kind: makeBuffer(gl.ARRAY_BUFFER, kind),
      rot: makeBuffer(gl.ARRAY_BUFFER, rot), aspect: makeBuffer(gl.ARRAY_BUFFER, aspect),
      index: makeBuffer(gl.ELEMENT_ARRAY_BUFFER, idx)
    };
  }

  /* distant anchor complexes, in shell space at their real directions */
  function anchorShade(pal, r) {
    var raw = paletteShade(pal, r);
    var lum = 0.35 * raw[0] + 0.45 * raw[1] + 0.20 * raw[2];
    var warm = raw[0] > raw[2] + 0.02;
    var gMix = warm ? 0.52 : 0.26;
    var gTint = warm ? [lum * 0.92, lum * 0.98, lum * 1.08] : [lum, lum, lum];
    return [raw[0] + (gTint[0] - raw[0]) * gMix, raw[1] + (gTint[1] - raw[1]) * gMix, raw[2] + (gTint[2] - raw[2]) * gMix];
  }
  var anchorGas = null;
  (function buildAnchors() {
    var puffs = [];
    tonight.nebulae.forEach(function (neb, ni) {
      if (neb.alt < -6) return;
      var basis = tangentBasis(neb.dir);
      /* shape: galaxies are tilted discs, not discs facing us — M31
       * most of all; everything else gets a mild individual stretch */
      var shape = { aspect: 1.1 + rng() * 0.5, rot: rng() * 3.14 };
      if (neb.name === 'Andromeda Galaxy') { shape.aspect = 2.7; shape.rot = -0.55; }
      else if (neb.name === 'Triangulum Galaxy') { shape.aspect = 1.8; shape.rot = 0.4; }
      else if (neb.kind === 'galaxy') { shape.aspect = 1.7; }
      else if (neb.kind === 'planetary') { shape.aspect = 1.2; }
      var layers = neb.kind === 'cluster' ? 3 : 7;
      for (var li = 0; li < layers; li++) {
        var dist = 2350 + li * 230 + rng() * 120;
        var j1 = (rng() - 0.5) * neb.size * 190, j2 = (rng() - 0.5) * neb.size * 190;
        puffs.push({
          pos: [
            neb.dir[0] * dist + basis.t1[0] * j1 + basis.t2[0] * j2,
            neb.dir[1] * dist + basis.t1[1] * j1 + basis.t2[1] * j2,
            neb.dir[2] * dist + basis.t1[2] * j1 + basis.t2[2] * j2
          ],
          col: anchorShade(neb.palette, rng), size: neb.size * (270 + rng() * 240),
          alpha: neb.kind === 'cluster' ? 0.085 : 0.066, phase: rng() * 6.283, kind: 0,
          rot: shape.rot + (rng() - 0.5) * 0.35, aspect: shape.aspect * (0.9 + rng() * 0.2)
        });
        if (li === 0 && (neb.kind === 'galaxy' || neb.kind === 'cluster')) {
          /* a bright core so a galaxy reads as a galaxy */
          puffs.push({
            pos: [neb.dir[0] * (dist + 30), neb.dir[1] * (dist + 30), neb.dir[2] * (dist + 30)],
            col: anchorShade(neb.palette, rng), size: neb.size * 130,
            alpha: 0.16, phase: rng() * 6.283, kind: 0, rot: shape.rot, aspect: shape.aspect
          });
        }
        if (neb.kind === 'emission' && li === 2) {
          puffs.push({
            pos: [neb.dir[0] * (dist + 40), neb.dir[1] * (dist + 40), neb.dir[2] * (dist + 40)],
            col: [0.008, 0.008, 0.02], size: neb.size * 240,
            alpha: 0.34, phase: rng() * 6.283, kind: 1,
            rot: shape.rot, aspect: 1.5 + rng() * 0.6
          });
        }
      }
    });
    anchorGas = buildGasBuffer(puffs);
    anchorGas.puffCount = puffs.length;
  })();

  /* the local volume: coloured regions of gas you fly through, forever */
  var BOX = 2400;
  var localGas = null, gasClusters = [];
  (function buildLocal() {
    var r = SKY.mulberry32(4242);
    var palNames = Object.keys(PALETTES);
    /* RESTRAINT (2026-10-23 review tour): the near volume had grown
     * louder than the sky — big saturated banks sitting on the
     * subjects, the gold clusters reading as smudges. Fewer, smaller,
     * dimmer; every colour pulled toward its own grey, warm colours
     * greying harder and cooling — gold belongs to the far anchors
     * and the star cores. The Milky Way river carries the colour. */
    for (var c = 0; c < 18; c++) {
      gasClusters.push({
        pos: [(r() - 0.5) * BOX, (r() - 0.5) * BOX, (r() - 0.5) * BOX],
        pal: palNames[Math.floor(r() * palNames.length)]
      });
    }
    var puffs = [];
    gasClusters.forEach(function (cl) {
      var nP = 26 + Math.floor(r() * 10);
      for (var i = 0; i < nP; i++) {
        var raw = paletteShade(cl.pal, r);
        var lum = 0.35 * raw[0] + 0.45 * raw[1] + 0.20 * raw[2];
        var warm = raw[0] > raw[2] + 0.02;
        var gMix = warm ? 0.66 : 0.38;
        var gTint = warm ? [lum * 0.90, lum * 0.97, lum * 1.10] : [lum, lum, lum];
        puffs.push({
          pos: [
            cl.pos[0] + ((r() + r() + r()) / 3 - 0.5) * 560,
            cl.pos[1] + ((r() + r() + r()) / 3 - 0.5) * 560,
            cl.pos[2] + ((r() + r() + r()) / 3 - 0.5) * 560
          ],
          col: [raw[0] + (gTint[0] - raw[0]) * gMix, raw[1] + (gTint[1] - raw[1]) * gMix, raw[2] + (gTint[2] - raw[2]) * gMix],
          size: 80 + r() * 150,
          alpha: 0.035 + r() * 0.05, phase: r() * 6.283, kind: 0,
          rot: r() * 3.14, aspect: 1 + r() * 0.8
        });
      }
    });
    for (var d = 0; d < 90; d++) {
      var host = puffs[Math.floor(r() * puffs.length)];
      puffs.push({
        pos: [host.pos[0] + (r() - 0.5) * 90, host.pos[1] + (r() - 0.5) * 90, host.pos[2] + (r() - 0.5) * 90],
        col: [0.008, 0.008, 0.02], size: 120 + r() * 150,
        alpha: 0.10 + r() * 0.12, phase: r() * 6.283, kind: 1,
        rot: r() * 3.14, aspect: 1.5 + r() * 1.1
      });
    }
    /* foreground silhouettes for home waters (improvement pass 8):
     * a few large dark clouds near the origin — several ahead along
     * the opening line of flight — so the first minutes have a near
     * layer to drift past, not just distant weather */
    var sdDir = null, dnDir = null;
    tonight.stars.forEach(function (s) {
      if (s.name === 'Sadr') sdDir = s.dir;
      if (s.name === 'Deneb') dnDir = s.dir;
    });
    var homeDir = null;
    if (sdDir && dnDir) {
      var hv = [sdDir[0] + dnDir[0] * 0.55, sdDir[1] + dnDir[1] * 0.55, sdDir[2] + dnDir[2] * 0.55];
      var hl = Math.hypot(hv[0], hv[1], hv[2]) || 1;
      homeDir = [hv[0] / hl, hv[1] / hl, hv[2] / hl];
    }
    for (var hd = 0; hd < 11; hd++) {
      var hPos;
      if (hd < 5 && homeDir) {
        var hBasis = tangentBasis(homeDir);
        var hDist = 480 + r() * 300, hJa = (r() - 0.5) * 380, hJb = (r() - 0.5) * 380;
        hPos = [
          homeDir[0] * hDist + hBasis.t1[0] * hJa + hBasis.t2[0] * hJb,
          homeDir[1] * hDist + hBasis.t1[1] * hJa + hBasis.t2[1] * hJb,
          homeDir[2] * hDist + hBasis.t1[2] * hJa + hBasis.t2[2] * hJb
        ];
      } else {
        var hTh = r() * 6.283, hPh = Math.acos(r() * 2 - 1), hRr = 360 + r() * 420;
        hPos = [hRr * Math.sin(hPh) * Math.cos(hTh), hRr * Math.cos(hPh), hRr * Math.sin(hPh) * Math.sin(hTh)];
      }
      puffs.push({
        pos: hPos, col: [0.006, 0.006, 0.016], size: 300 + r() * 130,
        alpha: 0.19 + r() * 0.07, phase: r() * 6.283, kind: 1,
        rot: r() * 3.14, aspect: 1.8 + r() * 0.8
      });
    }
    localGas = buildGasBuffer(puffs);
    localGas.puffCount = puffs.length;
  })();

  /* bright-star halos (improvement pass 7): a second, much larger and
   * fainter point on the handful of genuinely bright stars, so the
   * sky has landmarks again — Vega should feel like Vega */
  var haloGeo = null;
  (function buildHalos() {
    var entries = [];
    catStars.forEach(function (cs) {
      if (cs.mag > 2.3) return;
      var dep = depthFor(cs.dist);
      entries.push({
        pos: cs.pos, col: specCol(cs.spec),
        size: dep * 0.0105 * sizeFactorForMag(cs.mag) * 5.2,
        phase: cs.ph, twk: cs.tw * 0.5
      });
    });
    if (entries.length) haloGeo = buildStarBuffer(entries);
  })();

  /* figure-star boost points (rebuilt when the settled figure changes) */
  var boostGeo = null;
  function rebuildBoost(fig) {
    if (!fig) { boostGeo = null; return; }
    var seen = {}, entries = [];
    fig.lines.forEach(function (ln) {
      [ln[0], ln[1]].forEach(function (ci) {
        if (seen[ci]) return; seen[ci] = true;
        var cs = catStars[ci];
        var dep = depthFor(cs.dist);
        entries.push({
          pos: cs.pos, col: specCol(cs.spec),
          size: dep * 0.0105 * sizeFactorForMag(cs.mag) * 2.3,
          phase: cs.ph, twk: cs.tw
        });
      });
    });
    boostGeo = buildStarBuffer(entries);
  }

  /* ================= Pass 2 state (ported) ================= */
  var P2 = { activeName: null, drawFig: null, alpha: 0, actT: 0, activeFor: 0, voyage: 0, voyageTarget: 0, voyageHold: 0, longV: 0, engaged: false, chimed: false, unravelled: false,
    planet: null, pAlpha: 0, pActT: 0, planetAng: 9, figAng: 9,
    moon: null, mAlpha: 0, mActT: 0, moonAng: 9,
    loggedFig: null, loggedPlanet: null, loggedMoon: false,
    firstNotes: { fig: null, planet: null, moon: null, neb: null, star: null },
    mileNotes: { fig: null, moon: false },
    neb: null, nbAlpha: 0, nbActT: 0, nebAng: 9, loggedNeb: null,
    star: null, stAlpha: 0, stActT: 0, starAng: 9, loggedStar: null };
  var hasVoyaged = false;
  try { hasVoyaged = !!window.localStorage.getItem('nd-voyaged'); } catch (e) { /* private mode */ }
  /* the long-voyage lesson (perfectionist Pass L): three small
   * remembered facts — a dissolve has been seen, the deeper step
   * has been taken, and the hint bridging them has been shown */
  var dissolveSeen = false, longVoyaged = false, longHintShown = false, longHintActive = false;
  try {
    dissolveSeen = !!window.localStorage.getItem('nd-dissolved');
    longVoyaged = !!window.localStorage.getItem('nd-longed');
    longHintShown = !!window.localStorage.getItem('nd-longhint');
  } catch (e) { /* private mode */ }

  /* ================= camera + travel ================= */
  function dirToAzAlt(d) { return { az: Math.atan2(d[0], -d[2]), alt: Math.asin(Math.max(-1, Math.min(1, d[1]))) }; }
  function starByName(nm) { return tonight.stars.filter(function (s) { return s.name === nm; })[0]; }
  var deneb = starByName('Deneb');
  var vega = starByName('Vega');
  var sadr = starByName('Sadr');
  var albireo = starByName('Albireo');
  var startDir = [0, 0, -1];
  if (deneb && sadr) {
    /* frame the swan along its own diagonal — body (Sadr) centred,
     * tail (Deneb) and head (Albireo) pulling the tall portrait frame
     * full, instead of the bird floating over a black lower third */
    startDir = [0, 0, 0];
    var blendParts = [[sadr, 1.0], [deneb, 0.55], [albireo, 0.85], [vega, 0.3]];
    blendParts.forEach(function (bp) {
      if (!bp[0]) return;
      startDir[0] += bp[0].dir[0] * bp[1]; startDir[1] += bp[0].dir[1] * bp[1]; startDir[2] += bp[0].dir[2] * bp[1];
    });
    var sl = Math.hypot(startDir[0], startDir[1], startDir[2]); startDir = [startDir[0] / sl, startDir[1] / sl, startDir[2] / sl];
  } else if (deneb && vega) {
    startDir = [deneb.dir[0] + vega.dir[0] * 0.7, deneb.dir[1] + vega.dir[1] * 0.7, deneb.dir[2] + vega.dir[2] * 0.7];
    var sl2 = Math.hypot(startDir[0], startDir[1], startDir[2]); startDir = [startDir[0] / sl2, startDir[1] / sl2, startDir[2] / sl2];
  }
  var startAA = dirToAzAlt(startDir);
  var cam = { az: startAA.az, alt: startAA.alt, vaz: 0, valt: 0 };
  var baseAz = cam.az, baseAlt = cam.alt;
  var camPos = [0, 0, 0];            /* the camera really goes somewhere now */
  var TRAVEL_SPEED = 13;

  /* ================= input (ported) ================= */
  var pointers = new Map();
  var lastTouchAt = -30, downAt = 0, downX = 0, downY = 0, movedPx = 0, downStamp = 0;
  var elapsed = 0;
  function perfNow() { return elapsed; }
  cv.addEventListener('pointerdown', function (e) {
    if (AU) { AU.init(mutedPref); if (P2.activeName) AU.setRegion(P2.activeName); }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) { downAt = performance.now(); downStamp = downAt; downX = e.clientX; downY = e.clientY; movedPx = 0; }
    lastTouchAt = perfNow();
    try { cv.setPointerCapture && cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
  });
  cv.addEventListener('pointermove', function (e) {
    if (!pointers.has(e.pointerId)) return;
    var prev = pointers.get(e.pointerId);
    var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size !== 1) return;
    if (P2.engaged) return;
    movedPx += Math.abs(dx) + Math.abs(dy);
    var k = 0.0028;
    cam.az += dx * k; cam.alt += dy * k;
    cam.vaz = dx * k * 60; cam.valt = dy * k * 60;
    lastTouchAt = perfNow();
  });
  function endPointer(e) {
    var wasTap = pointers.size === 1 && (performance.now() - downAt) < 350 && movedPx < 9;
    pointers.delete(e.pointerId);
    if (P2.engaged) { P2.engaged = false; P2.voyageTarget = 0; }
    lastTouchAt = perfNow();
    if (wasTap) showWhisper(5000);
  }
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);
  window.addEventListener('blur', function () {
    pointers.clear(); cam.vaz = 0; cam.valt = 0;
    P2.engaged = false; P2.voyageTarget = 0;
  });

  /* ================= whisper (ported) ================= */
  var dateStr = tonight.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  var tonightMain = 'Tonight · ' + dateStr + ' · the sky over ' + SKY.HOME.name;
  var tonightSub = 'Drag to look — it drifts on its own.';

  /* ================= gamez-ai whispers (silent, Pass 1) =================
   * Tonight's opening line and fresh figure stories come from the shared
   * gamez-ai worker when it answers; the authored lines stay as the
   * instant fallback and the game is unchanged if it never does.
   * Prefetch hides the latency: tonight + the three highest figures at
   * boot, every other figure lazily the first time it settles. */
  var AI_BASE = 'https://gamez-ai.chaoticutopia84.workers.dev';
  var aiTonightSub = null;
  var aiFigText = {}, aiFigPending = {};
  function aiFetch(kind, ctx2, cb) {
    var done = false, timer = null;
    function fin(t) { if (!done) { done = true; if (timer) clearTimeout(timer); cb(t); } }
    timer = setTimeout(function () { fin(null); }, 7000);
    try {
      fetch(AI_BASE + '/g', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: kind, game: 'nebula-drift', ctx: ctx2 })
      }).then(function (r) { return r.json(); })
        .then(function (d) { fin(d && d.text ? String(d.text) : null); })
        .catch(function () { fin(null); });
    } catch (e) { fin(null); }
  }
  function aiDateKey(d) {
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  var COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  function dirAltAz(dir) {
    var alt = Math.asin(Math.max(-1, Math.min(1, dir[1]))) * 180 / Math.PI;
    var az = (Math.atan2(dir[0], -dir[2]) * 180 / Math.PI + 360) % 360;
    return { alt: alt, az: az };
  }
  function skyPhrase(dir) {
    var a = dirAltAz(dir);
    var sector = COMPASS[Math.round(a.az / 45) % 8];
    return (a.alt >= 50 ? 'high in the ' : a.alt >= 26 ? 'in the ' : 'low in the ') + sector;
  }
  function upFigures() {
    var ups = [];
    figures.forEach(function (fig) {
      var a = dirAltAz(fig.centre);
      if (fig.upFrac > 0.5 && a.alt > 12) ups.push({ fig: fig, alt: a.alt });
    });
    ups.sort(function (x, y) { return y.alt - x.alt; });
    return ups;
  }
  function ensureFigAi(fig) {
    if (!fig || aiFigText[fig.name] || aiFigPending[fig.name]) return;
    aiFigPending[fig.name] = true;
    aiFetch('driftfig', {
      figure: fig.name, seed: fig.story,
      nearName: fig.near.name, nearDist: fmtDist(fig.near.dist),
      farName: fig.far.name, farDist: fmtDist(fig.far.dist),
      date: aiDateKey(tonight.date),
      guest: fig.guest || ''
    }, function (t) {
      aiFigPending[fig.name] = false;
      if (t) aiFigText[fig.name] = t;
    });
  }
  (function prefetchAiWhispers() {
    try {
      var ups = upFigures();
      var upStr = ups.slice(0, 5).map(function (u) { return u.fig.name + ' ' + skyPhrase(u.fig.centre); }).join(', ');
      var bright = tonight.stars.filter(function (s) { return s.alt > 20; })
        .sort(function (a, b) { return a.mag - b.mag; }).slice(0, 3)
        .map(function (s) { return s.name; }).join(', ');
      var upPlanets = planetPts.filter(function (p) { return p.alt > 0; })
        .sort(function (a, b) { return a.mag - b.mag; })
        .map(function (p) { return p.name + ' ' + skyPhrase(p.dir) + ', magnitude ' + p.mag.toFixed(1); }).join('; ');
      aiFetch('driftnight', { date: dateStr, up: upStr, bright: bright, planets: upPlanets }, function (t) {
        if (t) aiTonightSub = t;
      });
      ups.slice(0, 3).forEach(function (u) { ensureFigAi(u.fig); });
    } catch (e) { /* silent — authored lines carry the night */ }
  })();

  /* ================= planet lines (authored, planets Pass 2) =================
   * Each planet gets one authored line for the night, composed at boot
   * from computed facts only: where it stands (skyPhrase), whose
   * company it keeps (planets.js describeCompany against the real
   * figures and stars), and how bright it truly is tonight. The
   * character clauses are fixed and factual. A planet standing inside
   * a figure also marks that figure — its story gains a guest line. */
  var PLANET_VOICE = {
    Mercury: { who: 'the swift one, who never strays far from the Sun', pro: 'he' },
    Venus: { who: 'the brightest of all the wanderers', pro: 'she' },
    Mars: { who: 'the red wanderer', pro: 'he' },
    Jupiter: { who: 'the giant, slow and certain in his rounds', pro: 'he' },
    Saturn: { who: 'the slowest wanderer — a generation to cross the whole sky', pro: 'he' }
  };
  function planetBrightness(mag) {
    if (mag <= -3) return 'Blazing — outshone only by the Moon.';
    if (mag <= -1.5) return 'Bright enough to be mistaken for something landing.';
    if (mag <= 0.2) return 'Steady and unmistakable.';
    return 'Modest tonight — but no true star holds its light so steady.';
  }
  (function composePlanetLines() {
    if (typeof PLANETS === 'undefined' || !PLANETS.describeCompany) return;
    var figGeo = figures.map(function (f) { return { name: f.name, centre: f.centre, radius: f.radius }; });
    planetPts.forEach(function (p) {
      var v = PLANET_VOICE[p.name]; if (!v) return;
      var co = PLANETS.describeCompany(p.dir, figGeo, tonight.stars);
      p.host = co.host;
      var company = '';
      if (co.host) company = ', a guest of ' + co.host;
      else if (co.nearStar) company = ', close beside ' + co.nearStar.name;
      else if (co.near.length === 2 && co.near[1].ang < 0.7) company = ', between ' + co.near[0].name + ' and ' + co.near[1].name;
      p.line = p.name + ' — ' + v.who + '. Tonight ' + v.pro + ' stands ' +
        skyPhrase(p.dir) + company + '. ' + planetBrightness(p.mag);
      if (co.host && p.alt > 0) {
        var hf = figuresByName[co.host];
        if (hf && !hf.guest) hf.guest = p.name;
      }
    });
  })();

  /* ================= the Moon (Pass 1 of the 2026-10-23 picks) =========
   * Computed at boot for the same 22:00 instant as everything else
   * (moon.js — Schlyter's lunar theory, perturbation terms included),
   * hung nearer than the planets (130 against their 190, inside the
   * nearest catalogue depth ~225), so a voyage's sideways step moves
   * it against the star shell harder than anything else in the sky —
   * which is simply true: it IS the nearest thing here. Its whisper
   * line is composed like the planets', from computed facts only.
   * It does NOT take the figure-guest slot: the planets own that
   * channel (and its AI guarantee), and the Moon changes hosts every
   * couple of nights — its own line names its host instead. */
  var MOON_DEPTH = 130;
  var moonPt = null, moonGeo = null;
  function moonPhaseClause(mp) {
    var theta = mp.waxing ? mp.elong : 360 - mp.elong;   // 0 new, 180 full
    if (mp.illum > 0.985) return 'Full tonight';
    var name;
    if (mp.illum < 0.03) name = 'New tonight — a dark disc among the stars';
    else if (mp.illum < 0.42) name = mp.waxing ? 'A waxing crescent' : 'A waning crescent';
    else if (mp.illum < 0.58) name = mp.waxing ? 'At first quarter' : 'At last quarter';
    else if (mp.waxing) {
      var n = Math.round((180 - theta) / 12.19);
      var nw = ['one', 'two', 'three', 'four'][n - 1];
      name = 'A waxing gibbous' + (nw ? ', ' + nw + (n === 1 ? ' night' : ' nights') + ' short of full' : '');
    } else {
      var n2 = Math.round((theta - 180) / 12.19);
      var nw2 = ['one', 'two', 'three', 'four'][n2 - 1];
      name = 'A waning gibbous' + (nw2 ? ', ' + nw2 + (n2 === 1 ? ' night' : ' nights') + ' past full' : '');
    }
    return name;
  }
  (function buildMoon() {
    if (typeof MOON === 'undefined') return;
    var mp = MOON.position(tonight.date);
    var maa = SKY.altAz(mp.ra, mp.dec, SKY.HOME.lat, tonight.lst);
    var mdir = SKY.dirFromAltAz(maa.alt, maa.az);
    var saa = SKY.altAz(mp.sunRa, mp.sunDec, SKY.HOME.lat, tonight.lst);
    var sunDirW = SKY.dirFromAltAz(saa.alt, saa.az);
    moonPt = {
      name: 'Moon', dir: mdir, alt: maa.alt, az: maa.az, ra: mp.ra, dec: mp.dec,
      distKm: mp.distKm, illum: mp.illum, waxing: mp.waxing, elong: mp.elong,
      sunDirW: sunDirW,
      pos: [mdir[0] * MOON_DEPTH, mdir[1] * MOON_DEPTH, mdir[2] * MOON_DEPTH]
    };
    /* drawn size: the true angular diameter, magnified 5.5x so the
     * disc and its phase read on a phone — the planets take the
     * same licence with their cores */
    var angDiam = 2 * Math.atan(1737.4 / mp.distKm);
    var discWorld = 2 * MOON_DEPTH * Math.tan(angDiam * 5.5 / 2);
    moonPt.quadSize = discWorld * 2.8;
    moonPt.discR = 1 / 2.8;
    /* the authored line, composed from tonight's computed facts */
    var figGeo = figures.map(function (f) { return { name: f.name, centre: f.centre, radius: f.radius }; });
    var co = PLANETS.describeCompany(mdir, figGeo, tonight.stars);
    var company = '';
    if (co.host) company = ', a guest of ' + co.host;
    else if (co.nearStar) company = ', close beside ' + co.nearStar.name;
    else if (co.near.length === 2 && co.near[1].ang < 0.7) company = ', between ' + co.near[0].name + ' and ' + co.near[1].name;
    var lightSecs = mp.distKm / 299792.458;
    moonPt.line = 'Moon — the near one, lit by borrowed sunlight. Tonight she stands ' +
      skyPhrase(mdir) + company + '. ' + moonPhaseClause(mp) + ' — ' +
      Math.round(mp.distKm).toLocaleString('en-US') + ' km away, and its light left ' +
      lightSecs.toFixed(1) + ' seconds ago.';
    /* one quad, six vertices */
    var corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    var pos = new Float32Array(6 * 3), cor = new Float32Array(6 * 2);
    corners.forEach(function (c, i) { pos.set(moonPt.pos, i * 3); cor.set(c, i * 2); });
    moonGeo = { pos: makeBuffer(gl.ARRAY_BUFFER, pos), corner: makeBuffer(gl.ARRAY_BUFFER, cor), count: 6 };
  })();

  /* ================= nebulae speak (Pass 3) =================
   * The painted anchors were scenery; the bright half of them are
   * destinations in their own right. Their lines are authored under
   * the planets' discipline: what it is, a true distance, one true
   * striking fact — stable astronomy, stated once, not per-night
   * claims. The faint half stays scenery on purpose: a whisper for
   * everything would leave nothing quiet. */
  var NEBULA_LINES = {
    'Andromeda Galaxy': 'Andromeda Galaxy — a spiral of a trillion stars, 2.5 million light-years away: the farthest thing the naked eye can reach. It is drifting toward us, and in some four billion years our two galaxies will begin to merge.',
    'Triangulum Galaxy': 'Triangulum Galaxy — a face-on spiral 2.7 million light-years out, the third great city of the Local Group. Under the darkest skies it is the most distant object the unaided eye can hold.',
    'Pleiades': 'The Pleiades — a young family of hot blue stars 444 light-years away, barely a hundred million years old. The mist shining around them is not their birthplace; it is dust they are only passing through.',
    'Double Cluster': 'The Double Cluster — twin swarms of young stars 7,500 light-years away, born from the same cloud and still travelling together across the dark.',
    'Great Hercules Cluster': 'The Great Hercules Cluster — a single ball of some 300,000 ancient stars, 22,000 light-years away. In 1974 the Arecibo telescope sent a message toward it; the message is still on its way.',
    'Ring Nebula': 'The Ring Nebula — the shed outer skin of a dying star much like the Sun, 2,300 light-years away. The white dwarf that lit it still burns at its centre.',
    'Dumbbell Nebula': 'The Dumbbell Nebula — the first planetary nebula ever catalogued, in 1764: the cast-off envelope of a dying star, 1,360 light-years away and still expanding into the dark.'
  };
  var nebPts = tonight.nebulae
    .filter(function (n) { return !!NEBULA_LINES[n.name]; })
    .map(function (n) { return { name: n.name, dir: n.dir, alt: n.alt, az: n.az, line: NEBULA_LINES[n.name] }; });

  /* ================= bright stars speak (Pass D) =================
   * The fifteen brightest stars in the catalogue get the nebula
   * treatment: settle, an authored line, a true distance and one
   * true fact. Their distances were already in the game — the
   * dissolve whisper has quoted them since the voyages began. */
  var STAR_LINES = {
    'Sirius': 'Sirius — the Dog Star, the brightest in the sky and one of the nearest at 8.6 light-years. What looks like one star is two: a white dwarf the size of the Earth circles it.',
    'Arcturus': 'Arcturus — an orange giant 37 light-years away. It does not travel with the local stars; it is a visitor, falling through the galaxy on a road of its own.',
    'Vega': 'Vega — a blue-white star 25 light-years away, spinning so fast it bulges at its equator. Twelve thousand years ago it was the pole star; in twelve thousand more it will be again.',
    'Capella': 'Capella — not one star but four: two golden giants and two red dwarfs, 43 light-years away, locked in two close pairs.',
    'Rigel': 'Rigel — a blue supergiant some 860 light-years away, burning tens of thousands of times brighter than the Sun. Its light has been travelling since the age of the Crusades.',
    'Procyon': 'Procyon — the little dog star, 11.5 light-years away, one of our nearest neighbours, with a white dwarf companion like the one at Sirius.',
    'Betelgeuse': 'Betelgeuse — a red supergiant some 550 light-years away, so large it would swallow the orbit of Jupiter. It is dying, and restless: it dims and brightens on no schedule.',
    'Altair': 'Altair — the eagle’s eye, 17 light-years away, spinning once in nine hours: so fast the star is shaped like a squashed ball.',
    'Aldebaran': 'Aldebaran — the eye of the Bull, an orange giant 65 light-years away. It only pretends to sit in the Hyades cluster behind it; it is less than half as far.',
    'Antares': 'Antares — the rival of Mars, a red supergiant some 550 light-years away. Set it where the Sun sits and its surface would reach past the orbit of Mars.',
    'Spica': 'Spica — two blue stars in a four-day dance, 250 light-years away, so close they raise tides on each other and neither one stays round.',
    'Pollux': 'Pollux — an orange giant 34 light-years away, the brighter head of the Twins, with a giant planet in orbit around it.',
    'Fomalhaut': 'Fomalhaut — a young white star 25 light-years away, ringed by a great disc of dust and rubble: a solar system still being built.',
    'Deneb': 'Deneb — the Swan’s tail, one of the most luminous stars known: thousands of light-years away, and still it stands among the brightest in our sky.',
    'Regulus': 'Regulus — the little king, a blue-white star 79 light-years away, spinning so fast it is stretched a third wider than it is tall.'
  };
  var starPts = tonight.stars
    .filter(function (st) { return !!STAR_LINES[st.name]; })
    .map(function (st) { return { name: st.name, dir: st.dir, alt: st.alt, az: st.az, line: STAR_LINES[st.name] }; });

  /* ================= the remembering log (Pass 2) =================
   * On-device only, schema-versioned, silent: who he has met under
   * this sky, and when he first met them. Nothing leaves the phone,
   * nothing is scored — it is a journal, not a checklist. A settle is
   * recorded on the same beat the completion chime uses (figure
   * threads fully drawn, planet/moon held a moment), once per
   * activation. The first-ever meeting earns one quiet sentence in
   * that object's own whisper, for that activation only. */
  var LOG_KEY = 'nd-log-v1';
  var log = { v: 1, nights: [], figs: {}, planets: {}, stars: {}, nebulae: {}, moon: { first: null, n: 0, phases: [] }, notes: [] };
  function saveLog() {
    try { window.localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch (e) { /* private mode */ }
  }
  (function loadLog() {
    try {
      var raw = window.localStorage.getItem(LOG_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && p.v === 1) {
          log.nights = p.nights || []; log.figs = p.figs || {};
          log.planets = p.planets || {};
          log.nebulae = p.nebulae || {};   /* added by Pass 3; older logs default empty */
          log.stars = p.stars || {};       /* added by review Pass D; same rule */
          log.notes = p.notes || [];       /* added by review Pass H; same rule */
          if (p.moon) log.moon = p.moon;
        }
      }
    } catch (e) { /* a fresh log is a fine beginning */ }
    var tk = aiDateKey(tonight.date);
    if (log.nights.indexOf(tk) === -1) { log.nights.push(tk); saveLog(); }
  })();
  function moonPhaseName(mp) {
    if (mp.illum > 0.985) return 'Full';
    if (mp.illum < 0.03) return 'New';
    if (mp.illum < 0.42) return mp.waxing ? 'Waxing crescent' : 'Waning crescent';
    if (mp.illum < 0.58) return mp.waxing ? 'First quarter' : 'Last quarter';
    return mp.waxing ? 'Waxing gibbous' : 'Waning gibbous';
  }
  function recordMeet(kind, name) {
    var tk = aiDateKey(tonight.date);
    if (kind === 'fig') {
      if (!log.figs[name]) {
        log.figs[name] = { first: tk, n: 1 }; P2.firstNotes.fig = name;
        if (Object.keys(log.figs).length === 10) P2.mileNotes.fig = name;   /* review Pass I */
      }
      else log.figs[name].n++;
    } else if (kind === 'planet') {
      if (!log.planets[name]) { log.planets[name] = { first: tk, n: 1 }; P2.firstNotes.planet = name; }
      else log.planets[name].n++;
    } else if (kind === 'star') {
      if (!log.stars[name]) { log.stars[name] = { first: tk, n: 1 }; P2.firstNotes.star = name; }
      else log.stars[name].n++;
    } else if (kind === 'neb') {
      if (!log.nebulae[name]) { log.nebulae[name] = { first: tk, n: 1 }; P2.firstNotes.neb = name; }
      else log.nebulae[name].n++;
    } else if (kind === 'moon' && moonPt) {
      if (!log.moon.first) { log.moon.first = tk; P2.firstNotes.moon = 'Moon'; }
      log.moon.n++;
      var ph = moonPhaseName(moonPt);
      if (ph === 'Full' && log.moon.phases.indexOf('Full') === -1) P2.mileNotes.moon = true;   /* review Pass I */
      if (log.moon.phases.indexOf(ph) === -1) log.moon.phases.push(ph);
    }
    saveLog();
    trackFieldNote(name);
  }
  /* the tenth night (review Pass I): true for the whole of the
   * night on which the log's night count stands at ten — the
   * greeting speaks it once, that night only, and never again */
  var mileNight = log.nights.length === 10;

  /* ================= field notes (review Pass H) =================
   * The deferred AI tier, homed at last: once a night has three
   * distinct meetings in it, the worker writes one dated line for
   * the journal from that night's own facts — and if it never
   * answers, an authored line composed of the same facts takes its
   * place, so a real night's drifting is never left unrecorded.
   * One attempt per night; the note itself is the guard. */
  var metTonight = [], noteAttempted = false;
  function trackFieldNote(name) {
    if (metTonight.indexOf(name) === -1) metTonight.push(name);
    if (metTonight.length < 3 || noteAttempted) return;
    var tk = aiDateKey(tonight.date);
    if (log.notes.some(function (n) { return n.d === tk; })) { noteAttempted = true; return; }
    noteAttempted = true;
    /* the note is written a little after the third meeting, not in
     * the moment — a journal entry, considered once the drifting has
     * had time to add whoever else the night brings (the list is read
     * when the timer fires, and a figure whose threads completed
     * while you gazed at its guest is honestly among them) */
    setTimeout(writeFieldNote, 20000);
  }
  function writeFieldNote() {
    var met = metTonight.slice(0, 5);
    var joined = met.length > 2
      ? met.slice(0, -1).join(', ') + ', and ' + met[met.length - 1]
      : met.join(' and ');
    var moonFact = moonPt ? moonPhaseName(moonPt) + ', ' + Math.round(moonPt.illum * 100) + '% lit' : '';
    aiFetch('driftlog', {
      date: dateStr, met: met.join(', '),
      moon: moonFact, event: skyEvent || ''
    }, function (t) {
      if (t) addFieldNote(t);
      else {
        addFieldNote(moonPt
          ? joined + ' — met under a ' + moonPhaseName(moonPt).toLowerCase() + ' Moon.'
          : joined + ' — met tonight.');
      }
    });
  }
  function addFieldNote(text) {
    var tk = aiDateKey(tonight.date);
    if (log.notes.some(function (n) { return n.d === tk; })) return;
    log.notes.push({ d: tk, text: String(text).trim() });
    while (log.notes.length > 60) log.notes.shift();
    saveLog();
    if (logPanel.classList.contains('show')) renderLog();
  }

  /* ================= the living sky: meteors (Pass B) =================
   * Real showers on their real nights, radiating from their true
   * radiants; sporadic strays otherwise. Rates are scaled to what
   * one watcher facing one patch of sky would actually catch —
   * whole-sky ZHR figures would flood a single view — and a shower
   * only performs while its radiant is up. Pure ambience: no text,
   * no log, nothing scored. */
  var SHOWERS = [
    { name: 'Quadrantids', peak: 3, half: 4, zhr: 80, ra: 15.30, dec: 49.7 },
    { name: 'Lyrids', peak: 112, half: 8, zhr: 18, ra: 18.07, dec: 33.5 },
    { name: 'Eta Aquariids', peak: 125, half: 19, zhr: 50, ra: 22.45, dec: -1.0 },
    { name: 'Perseids', peak: 224, half: 19, zhr: 110, ra: 3.13, dec: 58.0 },
    { name: 'Orionids', peak: 294, half: 18, zhr: 20, ra: 6.32, dec: 15.5 },
    { name: 'Leonids', peak: 321, half: 12, zhr: 15, ra: 10.13, dec: 21.8 },
    { name: 'Geminids', peak: 347, half: 10, zhr: 130, ra: 7.55, dec: 32.3 },
    { name: 'Ursids', peak: 356, half: 5, zhr: 10, ra: 14.50, dec: 75.7 }
  ];
  var meteorInfo = { shower: null, meanSec: 400 };
  (function planMeteors() {
    var d = tonight.date;
    var doy = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86400000);
    var rate = 9; /* sporadics, per hour, one patch of sky */
    SHOWERS.forEach(function (sh) {
      var dd = Math.abs(doy - sh.peak); dd = Math.min(dd, 365 - dd);
      if (dd > sh.half) return;
      var fall = (1 + Math.cos(Math.PI * dd / sh.half)) / 2;
      var aa = SKY.altAz(sh.ra, sh.dec, SKY.HOME.lat, tonight.lst);
      /* the game's sky stands at 22:00, but a shower night belongs
       * to the whole night — a radiant near rising still performs,
       * and its first meteors are earthgrazers */
      var altF = aa.alt < 0 ? 0.45 : (aa.alt < 25 ? 0.75 : 1);
      var add = sh.zhr * fall * altF * 2.0;
      if (add > 4) { rate += add; if (!meteorInfo.shower || add > meteorInfo.best) { meteorInfo.shower = sh.name; meteorInfo.best = add; } }
    });
    meteorInfo.meanSec = Math.max(14, Math.min(400, 3600 / rate));
    if (meteorInfo.shower) {
      var shD = SHOWERS.find(function (x) { return x.name === meteorInfo.shower; });
      var yr = tonight.date.getFullYear();
      meteorInfo.peakLabel = new Date(yr, 0, shD.peak).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    meteorInfo.radiantDir = null;
    if (meteorInfo.shower) {
      var sh2 = SHOWERS.find(function (x) { return x.name === meteorInfo.shower; });
      meteorInfo.radiantDir = SKY.dirFromRaDec(sh2.ra, sh2.dec, SKY.HOME.lat, tonight.lst);
    }
  })();
  var METEOR_DIST = 1500, METEOR_POOL = 8;
  var meteors = [];
  for (var mi = 0; mi < METEOR_POOL; mi++) meteors.push({ on: false, t0: 0, dur: 1, S: null, V: null, len: 200, wid: 7, bright: 0.8 });
  var meteorGeo = {
    pos: makeBuffer(gl.ARRAY_BUFFER, new Float32Array(METEOR_POOL * 6 * 3)),
    u: makeBuffer(gl.ARRAY_BUFFER, new Float32Array(METEOR_POOL * 6)),
    side: makeBuffer(gl.ARRAY_BUFFER, new Float32Array(METEOR_POOL * 6)),
    a: makeBuffer(gl.ARRAY_BUFFER, new Float32Array(METEOR_POOL * 6))
  };
  var nextMeteorAt = 6 + meteorInfo.meanSec * 0.35;
  function spawnMeteor(t, fwd) {
    var m = null;
    for (var i = 0; i < meteors.length; i++) if (!meteors[i].on) { m = meteors[i]; break; }
    if (!m) return false;
    var R = meteorInfo.radiantDir;
    /* a start point in the watched sky, up off the horizon */
    var S = null;
    for (var tries = 0; tries < 12; tries++) {
      var th = Math.random() * 6.283, ph = Math.acos(Math.random() * 2 - 1);
      var cand = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
      if (cand[1] < 0.10) continue;
      /* witness bias (perfectionist Pass O): the first tries hold
       * out for a start well inside the watched sky, so a shower
       * night is actually seen; the last tries relax to the old
       * whole-sky honesty — some meteors still belong to the sky
       * nobody is facing, and simply go unwitnessed */
      if (fwd && cand[0] * fwd[0] + cand[1] * fwd[1] + cand[2] * fwd[2] < (tries < 8 ? 0.45 : 0.15)) continue;
      S = cand; break;
    }
    if (!S) return false;
    /* travel away from the radiant, along the great circle */
    var V;
    if (R) {
      var proj = R[0] * S[0] + R[1] * S[1] + R[2] * S[2];
      V = [S[0] - R[0] * proj, S[1] - R[1] * proj, S[2] - R[2] * proj];
    } else {
      V = [S[2], 0.15, -S[0]];
    }
    var vl = Math.hypot(V[0], V[1], V[2]);
    if (vl < 0.05) { V = [S[2], 0.2, -S[0]]; vl = Math.hypot(V[0], V[1], V[2]) || 1; }
    V = [V[0] / vl, V[1] / vl, V[2] / vl];
    /* a sporadic may travel either way along its line, so if its
     * path would cross only unwatched sky, send it the other way;
     * a shower meteor's direction is the radiant's and never flips */
    if (!R && fwd) {
      var mx = S[0] + V[0] * 0.3, my = S[1] + V[1] * 0.3, mz = S[2] + V[2] * 0.3;
      var ml = Math.hypot(mx, my, mz) || 1;
      if ((mx / ml) * fwd[0] + (my / ml) * fwd[1] + (mz / ml) * fwd[2] < 0.25) V = [-V[0], -V[1], -V[2]];
    }
    var speed = (28 + Math.random() * 26) * Math.PI / 180;   /* rad/s across the sky */
    var fireball = Math.random() < 0.08;
    m.on = true; m.t0 = t; m.dur = 0.55 + Math.random() * 0.5;
    m.S = S; m.V = [V[0] * speed * METEOR_DIST, V[1] * speed * METEOR_DIST, V[2] * speed * METEOR_DIST];
    m.len = speed * METEOR_DIST * 0.30;
    m.wid = fireball ? 13 : 6.5;
    m.bright = fireball ? 1.0 : 0.55 + Math.random() * 0.35;
    return true;
  }
  function drawMeteors(proj, rot, shift, t) {
    var pos = new Float32Array(METEOR_POOL * 6 * 3), uu = new Float32Array(METEOR_POOL * 6),
        sd = new Float32Array(METEOR_POOL * 6), aa = new Float32Array(METEOR_POOL * 6);
    var any = false, vi = 0;
    meteors.forEach(function (m) {
      var base = vi * 6; vi++;
      if (!m.on) { for (var q = 0; q < 6; q++) aa[base + q] = 0; return; }
      var el = t - m.t0, u = el / m.dur;
      if (u >= 1) { m.on = false; for (var q2 = 0; q2 < 6; q2++) aa[base + q2] = 0; return; }
      any = true;
      var cx = m.S[0] * METEOR_DIST + m.V[0] * el, cy = m.S[1] * METEOR_DIST + m.V[1] * el, cz = m.S[2] * METEOR_DIST + m.V[2] * el;
      var vl = Math.hypot(m.V[0], m.V[1], m.V[2]) || 1;
      var vx = m.V[0] / vl, vy = m.V[1] / vl, vz = m.V[2] / vl;
      var bx = vy * m.S[2] - vz * m.S[1], by = vz * m.S[0] - vx * m.S[2], bz = vx * m.S[1] - vy * m.S[0];
      var bl = Math.hypot(bx, by, bz) || 1; bx = bx / bl * m.wid / 2; by = by / bl * m.wid / 2; bz = bz / bl * m.wid / 2;
      var hx = vx * m.len / 2, hy = vy * m.len / 2, hz = vz * m.len / 2;
      var env = Math.pow(Math.sin(Math.PI * Math.min(1, u)), 0.7) * m.bright;
      /* front(+hx, u=1) two verts, back(-hx, u=0) two, as two triangles */
      var corners = [
        [cx + hx - bx, cy + hy - by, cz + hz - bz, 1, -1], [cx + hx + bx, cy + hy + by, cz + hz + bz, 1, 1],
        [cx - hx + bx, cy - hy + by, cz - hz + bz, 0, 1],
        [cx + hx - bx, cy + hy - by, cz + hz - bz, 1, -1], [cx - hx + bx, cy - hy + by, cz - hz + bz, 0, 1],
        [cx - hx - bx, cy - hy - by, cz - hz - bz, 0, -1]
      ];
      corners.forEach(function (c, q3) {
        pos.set([c[0], c[1], c[2]], (base + q3) * 3);
        uu[base + q3] = c[3]; sd[base + q3] = c[4]; aa[base + q3] = env;
      });
    });
    if (!any) return;
    gl.useProgram(meteorProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, meteorGeo.pos); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
    bindAttr(meteorProg, 'aPos', meteorGeo.pos, 3);
    gl.bindBuffer(gl.ARRAY_BUFFER, meteorGeo.u); gl.bufferData(gl.ARRAY_BUFFER, uu, gl.DYNAMIC_DRAW);
    bindAttr(meteorProg, 'aU', meteorGeo.u, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, meteorGeo.side); gl.bufferData(gl.ARRAY_BUFFER, sd, gl.DYNAMIC_DRAW);
    bindAttr(meteorProg, 'aSide', meteorGeo.side, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, meteorGeo.a); gl.bufferData(gl.ARRAY_BUFFER, aa, gl.DYNAMIC_DRAW);
    bindAttr(meteorProg, 'aA', meteorGeo.a, 1);
    gl.uniformMatrix4fv(uniformLoc(meteorProg, 'uProj'), false, proj);
    gl.uniformMatrix4fv(uniformLoc(meteorProg, 'uRot'), false, rot);
    gl.uniform3f(uniformLoc(meteorProg, 'uShift'), shift[0], shift[1], shift[2]);
    gl.drawArrays(gl.TRIANGLES, 0, METEOR_POOL * 6);
  }

  /* ================= tonight's news: sky events (Pass C) =================
   * The ephemerides already know when the sky does something worth
   * remarking on; the greeting should say it. One event, the best
   * one, computed for tonight and tomorrow at 22:00: a close Moon,
   * failing that a close planet pair. Words only — nothing drawn,
   * nothing scored. */
  var skyEvent = '';
  (function computeSkyEvent() {
    if (typeof MOON === 'undefined' || typeof PLANETS === 'undefined') return;
    function sepDeg(a, b) {
      var c = Math.sin(a.dec * Math.PI / 180) * Math.sin(b.dec * Math.PI / 180) +
        Math.cos(a.dec * Math.PI / 180) * Math.cos(b.dec * Math.PI / 180) *
        Math.cos((a.ra - b.ra) * 15 * Math.PI / 180);
      return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
    }
    function degWords(n) {
      var w = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
      return n >= 1 && n <= 9 ? w[n - 1] : '' + n;
    }
    var t0 = tonight.date.getTime();
    var best = null;
    [0, 1].forEach(function (off) {
      var d = new Date(t0 + off * 86400000);
      var mp = MOON.position(d);
      PLANETS.positions(d).forEach(function (pl) {
        if (pl.alt < -4) return;
        var sep = sepDeg(mp, pl);
        var limit = off === 0 ? 9 : 6.5;
        if (sep < limit && (!best || sep < best.sep)) best = { sep: sep, name: pl.name, off: off };
      });
    });
    if (best) {
      var r = Math.round(best.sep);
      if (best.off === 0) {
        skyEvent = best.sep <= 3.2
          ? 'Tonight the Moon passes close by ' + best.name + ' — about ' + degWords(r) + (r === 1 ? ' degree' : ' degrees') + ' off.'
          : 'Tonight the Moon stands about ' + degWords(r) + ' degrees from ' + best.name + '.';
      } else {
        skyEvent = 'Tomorrow night the Moon closes in on ' + best.name + ', passing about ' + degWords(r) + (r === 1 ? ' degree' : ' degrees') + ' away.';
      }
      return;
    }
    var ps = PLANETS.positions(tonight.date), pair = null;
    for (var i = 0; i < ps.length; i++) for (var j = i + 1; j < ps.length; j++) {
      if (ps[i].alt < 0 || ps[j].alt < 0) continue;
      var sp = sepDeg(ps[i], ps[j]);
      if (sp < 2.6 && (!pair || sp < pair.sep)) pair = { sep: sp, a: ps[i].name, b: ps[j].name };
    }
    if (pair) skyEvent = pair.a + ' and ' + pair.b + ' stand close tonight — about ' + degWords(Math.round(pair.sep)) + ' degrees apart.';
  })();

  /* ================= the almanac (review Pass F) =================
   * Tonight's computed facts, gathered in one place in the Field
   * Log: the Moon's hours and phase, the planets riding, the active
   * shower, and the next full and new moons. Everything is worked
   * from the game's own ephemerides — moonrise and moonset by
   * walking the evening in ten-minute steps and bisecting the
   * horizon crossing; the lunations by following the Moon's
   * elongation from the Sun until it turns. */
  var almanac = null;
  (function computeAlmanac() {
    if (typeof MOON === 'undefined') return;
    var mp = MOON.position(tonight.date);
    function moonAltAt(date) {
      var m2 = MOON.position(date);
      return SKY.altAz(m2.ra, m2.dec, SKY.HOME.lat, SKY.lstDeg(SKY.jdFromDate(date), SKY.HOME.lon)).alt;
    }
    function fmtTime(d) { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
    function fmtDay(d) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
    var noon = new Date(tonight.date.getTime()); noon.setHours(12, 0, 0, 0);
    var rise = null, set = null;
    var prevA = moonAltAt(noon), prevT = noon.getTime();
    for (var tt = prevT + 600000; tt <= prevT + 86400000 && (!rise || !set); tt += 600000) {
      var a2 = moonAltAt(new Date(tt));
      if ((prevA < 0) !== (a2 < 0)) {
        var lo = prevT, hi = tt, alo = prevA;
        for (var bi = 0; bi < 24; bi++) {
          var mid = (lo + hi) / 2, am = moonAltAt(new Date(mid));
          if ((alo < 0) === (am < 0)) { lo = mid; alo = am; } else hi = mid;
        }
        if (prevA < 0 && !rise) rise = new Date((lo + hi) / 2);
        if (prevA >= 0 && !set) set = new Date((lo + hi) / 2);
      }
      prevA = a2; prevT = tt;
    }
    function thetaAt(d) { var m3 = MOON.position(d); return ((m3.eclLon - m3.sunEclLon) % 360 + 360) % 360; }
    var full = null, newM = null;
    var lastTh = thetaAt(tonight.date);
    for (var t2 = tonight.date.getTime() + 21600000; t2 < tonight.date.getTime() + 34 * 86400000 && (!full || !newM); t2 += 21600000) {
      var th = thetaAt(new Date(t2));
      if (!full && lastTh < 180 && th >= 180) {
        var flo = t2 - 21600000, fhi = t2;
        for (var fb = 0; fb < 22; fb++) { var fm = (flo + fhi) / 2; if (thetaAt(new Date(fm)) < 180) flo = fm; else fhi = fm; }
        full = new Date((flo + fhi) / 2);
      }
      if (!newM && th < lastTh - 180) {
        var nlo = t2 - 21600000, nhi = t2;
        for (var nb2 = 0; nb2 < 22; nb2++) { var nm2 = (nlo + nhi) / 2; if (thetaAt(new Date(nm2)) > 180) nlo = nm2; else nhi = nm2; }
        newM = new Date((nlo + nhi) / 2);
      }
      lastTh = th;
    }
    /* day-part honesty (perfectionist Pass Q): a moonrise that
     * happens in broad morning or afternoon is a fact of the date,
     * not of the night — the row says which it is. Dawn and dusk
     * events belong to the watch and stay unlabelled. */
    function dayNote(d) {
      if (!d) return '';
      var h = d.getHours();
      if (h >= 7 && h < 12) return 'morning';
      if (h >= 12 && h < 18) return 'afternoon';
      return '';
    }
    almanac = {
      phase: moonPhaseName(mp), illumPct: Math.round(mp.illum * 100),
      rise: rise ? fmtTime(rise) : null, set: set ? fmtTime(set) : null,
      riseNote: dayNote(rise), setNote: dayNote(set),
      planetsUp: planetPts.filter(function (pl) { return pl.alt > 0; }).map(function (pl) { return pl.name; }),
      shower: meteorInfo.shower, showerPeak: meteorInfo.peakLabel || null,
      full: full ? fmtDay(full) : null, newMoon: newM ? fmtDay(newM) : null
    };
  })();

  var tapFlashUntil = 9;
  var bootGreetDone = false, BOOT_GREET_SECS = 4;
  function showWhisper(ms) { tapFlashUntil = elapsed + ms / 1000; }
  var lastWhisperKey = '__boot';
  function setWhisper(key, main, sub) {
    if (key === lastWhisperKey) return;
    lastWhisperKey = key;
    if (!main) { whisperEl.classList.remove('show'); return; }
    whisperMain.textContent = main;
    whisperSub.textContent = sub || '';
    whisperEl.classList.add('show');
  }
  function fmtDist(d) { return d ? d.toLocaleString('en-US') : ''; }
  function greetSub() {
    return (aiTonightSub || tonightSub) + (skyEvent ? ' ' + skyEvent : '') +
      (mileNight ? ' Your tenth night under this sky.' : '');
  }
  function updateWhisper(t) {
    var fig = P2.drawFig;
    if (!(fig && P2.alpha > 0.3 && P2.voyage > 0.35)) longHintActive = false;
    if (!bootGreetDone && (t >= tapFlashUntil || t >= BOOT_GREET_SECS)) bootGreetDone = true;
    if (fig && P2.alpha > 0.3 && P2.voyage > 0.35) {
      if (P2.longV < 0.22 && dissolveSeen && !longVoyaged && !longHintShown) {
        /* once ever, on a dissolved hold after a first dissolve is
         * already behind him: the deeper step exists — say so */
        longHintShown = true; longHintActive = true;
        try { window.localStorage.setItem('nd-longhint', '1'); } catch (e) { /* private mode */ }
      }
      if (P2.longV >= 0.22) {
        setWhisper('disL:' + fig.name, fig.name + ', dissolved',
          fig.near.name + ' is ' + fmtDist(fig.near.dist) + ' light-years away · ' +
          (fig.mid ? fig.mid.name + ' is ' + fmtDist(fig.mid.dist) + ' · ' : '') +
          fig.far.name + ' is ' + fmtDist(fig.far.dist) +
          ' — from out here, nothing of the shape survives');
      } else if (longHintActive) {
        setWhisper('disH:' + fig.name, fig.name + ', dissolved', 'Keep holding — go farther out.');
      } else {
        setWhisper('dis:' + fig.name, fig.name + ', dissolved',
          fig.near.name + ' is ' + fmtDist(fig.near.dist) + ' light-years away · ' +
          fig.far.name + ' is ' + fmtDist(fig.far.dist) + ' — the shape only exists from home');
      }
    } else if (t < tapFlashUntil && !bootGreetDone) {
      /* the boot greeting holds the whisper for its first seconds — a
       * figure may settle and draw its threads beneath it; its story
       * takes the whisper once the greeting's beat is done */
      setWhisper('tonight' + (aiTonightSub ? ':ai' : ''), tonightMain, greetSub());
    } else if (P2.moon && P2.mAlpha > 0.3 && P2.moon.line &&
               (!P2.planet || P2.moonAng <= P2.planetAng) &&
               (!P2.neb || P2.moonAng <= P2.nebAng) &&
               (!P2.star || P2.moonAng <= P2.starAng) &&
               (!fig || P2.moonAng <= P2.figAng)) {
      var moNote = P2.firstNotes.moon === 'Moon';
      var moMile = P2.mileNotes.moon;
      setWhisper('mo:Moon' + (moNote ? ':f' : '') + (moMile ? ':m' : ''), 'Moon',
        P2.moon.line + (moNote ? ' First time you’ve met her.' : '') +
        (moMile ? ' Your first full Moon under this sky.' : ''));
    } else if (P2.planet && P2.pAlpha > 0.3 && P2.planet.line && (!fig || P2.planetAng <= P2.figAng) &&
               (!P2.moon || P2.planetAng <= P2.moonAng) &&
               (!P2.star || P2.planetAng <= P2.starAng) &&
               (!P2.neb || P2.planetAng <= P2.nebAng)) {
      var plNote = P2.firstNotes.planet === P2.planet.name;
      var plSuffix = plNote ? ' First time you’ve met ' + (PLANET_VOICE[P2.planet.name].pro === 'she' ? 'her' : 'him') + '.' : '';
      setWhisper('pl:' + P2.planet.name + (plNote ? ':f' : ''), P2.planet.name, P2.planet.line + plSuffix);
    } else if (P2.neb && P2.nbAlpha > 0.3 && P2.neb.line &&
               (!P2.moon || P2.nebAng <= P2.moonAng) &&
               (!P2.planet || P2.nebAng <= P2.planetAng) &&
               (!P2.star || P2.nebAng <= P2.starAng) &&
               (!fig || P2.nebAng <= P2.figAng)) {
      var nbNote = P2.firstNotes.neb === P2.neb.name;
      setWhisper('nb:' + P2.neb.name + (nbNote ? ':f' : ''), P2.neb.name,
        P2.neb.line + (nbNote ? ' First time you’ve found it.' : ''));
    } else if (P2.star && P2.stAlpha > 0.3 && P2.star.line &&
               (!P2.moon || P2.starAng <= P2.moonAng) &&
               (!P2.planet || P2.starAng <= P2.planetAng) &&
               (!P2.neb || P2.starAng <= P2.nebAng) &&
               (!fig || P2.starAng <= P2.figAng)) {
      var stNote = P2.firstNotes.star === P2.star.name;
      setWhisper('st:' + P2.star.name + (stNote ? ':f' : ''), P2.star.name,
        P2.star.line + (stNote ? ' First time you’ve found it.' : ''));
    } else if (fig && P2.alpha > 0.3 && (!P2.neb || P2.nbAlpha <= 0.3 || P2.figAng <= P2.nebAng) &&
               (!P2.star || P2.stAlpha <= 0.3 || P2.figAng <= P2.starAng)) {
      var hintOn = !hasVoyaged && P2.activeFor > 7 && P2.activeFor < 17;
      var aiFig = aiFigText[fig.name] || null;
      var figNote = P2.firstNotes.fig === fig.name && !aiFig && !hintOn;
      var figMile = P2.mileNotes.fig === fig.name && !aiFig && !hintOn;
      var storyShown = aiFig || (fig.story + (fig.guest ? ' ' + fig.guest + ' visits tonight.' : '') + (figNote ? ' First time you’ve found it.' : '') + (figMile ? ' Your tenth figure.' : ''));
      setWhisper('fig:' + fig.name + (hintOn ? ':h' : aiFig ? ':ai' : ':s') + (fig.guest && !aiFig && !hintOn ? ':g' : '') + (figNote ? ':n' : '') + (figMile ? ':m10' : ''), fig.name,
        hintOn ? 'Press and hold — step sideways, off the Earth viewpoint' : storyShown);
    } else if (t < tapFlashUntil) {
      setWhisper('tonight' + (aiTonightSub ? ':ai' : ''), tonightMain, greetSub());
    } else {
      setWhisper('none', null);
    }
  }

  /* ================= matrices + draw helpers ================= */
  var CW = 0, CH = 0, DPR = 1, projMat = null, scaleH = 1;
  var FOV_WIDE = 1.187, FOV_IN = 0.977, fovCur = FOV_WIDE, fovApplied = 0;
  function perspectiveMat(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ]);
  }
  function applyProj() {
    projMat = perspectiveMat(fovCur, CW / Math.max(1, CH), 0.5, 12000);
    scaleH = cv.height / (2 * Math.tan(fovCur / 2));
    fovApplied = fovCur;
  }
  function rotationMat(rgt, upv, fwd) {
    return new Float32Array([
      rgt[0], upv[0], -fwd[0], 0,
      rgt[1], upv[1], -fwd[1], 0,
      rgt[2], upv[2], -fwd[2], 0,
      0, 0, 0, 1
    ]);
  }
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    CW = window.innerWidth; CH = window.innerHeight;
    cv.width = Math.round(CW * DPR * renderScale); cv.height = Math.round(CH * DPR * renderScale);
    cv.style.width = CW + 'px'; cv.style.height = CH + 'px';
    gl.viewport(0, 0, cv.width, cv.height);
    applyProj();
    buildBloomTargets();
  }
  window.addEventListener('resize', resize);

  function bindAttr(prog, name, buffer, size) {
    var loc = attribLoc(prog, name);
    if (loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }
  function drawStars(geo, proj, rot, shift, alphaMul, time) {
    gl.useProgram(starProg);
    bindAttr(starProg, 'aPos', geo.pos, 3); bindAttr(starProg, 'aCol', geo.col, 3);
    bindAttr(starProg, 'aSize', geo.size, 1); bindAttr(starProg, 'aPhase', geo.phase, 1);
    bindAttr(starProg, 'aTwk', geo.twk, 1); bindAttr(starProg, 'aSpike', geo.spike, 1);
    gl.uniformMatrix4fv(uniformLoc(starProg, 'uProj'), false, proj);
    gl.uniformMatrix4fv(uniformLoc(starProg, 'uRot'), false, rot);
    gl.uniform3f(uniformLoc(starProg, 'uShift'), shift[0], shift[1], shift[2]);
    gl.uniform1f(uniformLoc(starProg, 'uTime'), time);
    gl.uniform1f(uniformLoc(starProg, 'uScaleH'), scaleH);
    gl.uniform1f(uniformLoc(starProg, 'uAlphaMul'), alphaMul);
    if (moonPt) {
      gl.uniform3f(uniformLoc(starProg, 'uMoonDir'), moonPt.dir[0], moonPt.dir[1], moonPt.dir[2]);
      gl.uniform1f(uniformLoc(starProg, 'uMoonDim'), moonPt.alt > -3 ? moonPt.illum : 0);
    } else {
      gl.uniform3f(uniformLoc(starProg, 'uMoonDir'), 0, 1, 0);
      gl.uniform1f(uniformLoc(starProg, 'uMoonDim'), 0);
    }
    gl.drawArrays(gl.POINTS, 0, geo.count);
  }
  function drawMoon(proj, rot, shift) {
    if (!moonPt || !moonGeo) return;
    /* the Sun and the celestial frame, carried into view space by
     * the same rotation the renderer uses, then expressed in the
     * disc's own frame: x toward increasing RA, y toward the pole */
    var s = moonPt.sunDirW;
    var sunView = [
      rot[0] * s[0] + rot[4] * s[1] + rot[8] * s[2],
      rot[1] * s[0] + rot[5] * s[1] + rot[9] * s[2],
      rot[2] * s[0] + rot[6] * s[1] + rot[10] * s[2]
    ];
    var pole = SKY.dirFromRaDec(0, 90, SKY.HOME.lat, tonight.lst);
    var md = moonPt.dir;
    var pd = pole[0] * md[0] + pole[1] * md[1] + pole[2] * md[2];
    var nT = [pole[0] - md[0] * pd, pole[1] - md[1] * pd, pole[2] - md[2] * pd];
    var nl = Math.hypot(nT[0], nT[1], nT[2]) || 1; nT = [nT[0] / nl, nT[1] / nl, nT[2] / nl];
    var eT = [nT[1] * md[2] - nT[2] * md[1], nT[2] * md[0] - nT[0] * md[2], nT[0] * md[1] - nT[1] * md[0]];
    function toView(v) {
      return [
        rot[0] * v[0] + rot[4] * v[1] + rot[8] * v[2],
        rot[1] * v[0] + rot[5] * v[1] + rot[9] * v[2]
      ];
    }
    var e2 = toView(eT), n2 = toView(nT);
    var el = Math.hypot(e2[0], e2[1]) || 1; e2 = [e2[0] / el, e2[1] / el];
    var nl2 = Math.hypot(n2[0], n2[1]) || 1; n2 = [n2[0] / nl2, n2[1] / nl2];
    var sunCel = [
      sunView[0] * e2[0] + sunView[1] * e2[1],
      sunView[0] * n2[0] + sunView[1] * n2[1],
      sunView[2]
    ];
    gl.useProgram(moonProg);
    bindAttr(moonProg, 'aPos', moonGeo.pos, 3); bindAttr(moonProg, 'aCorner', moonGeo.corner, 2);
    gl.uniformMatrix4fv(uniformLoc(moonProg, 'uProj'), false, proj);
    gl.uniformMatrix4fv(uniformLoc(moonProg, 'uRot'), false, rot);
    gl.uniform3f(uniformLoc(moonProg, 'uShift'), shift[0], shift[1], shift[2]);
    gl.uniform1f(uniformLoc(moonProg, 'uSize'), moonPt.quadSize);
    gl.uniform2f(uniformLoc(moonProg, 'uEast'), e2[0], e2[1]);
    gl.uniform2f(uniformLoc(moonProg, 'uNorth'), n2[0], n2[1]);
    gl.uniform3f(uniformLoc(moonProg, 'uSun'), sunCel[0], sunCel[1], sunCel[2]);
    gl.uniform1f(uniformLoc(moonProg, 'uDiscR'), moonPt.discR);
    gl.drawArrays(gl.TRIANGLES, 0, moonGeo.count);
  }
  function drawGas(geo, kindPass, wrap, origin, proj, rot, rendCam, breathe, frac) {
    gl.useProgram(gasProg);
    bindAttr(gasProg, 'aPos', geo.pos, 3); bindAttr(gasProg, 'aCorner', geo.corner, 2);
    bindAttr(gasProg, 'aCol', geo.col, 3); bindAttr(gasProg, 'aSize', geo.size, 1);
    bindAttr(gasProg, 'aAlpha', geo.alpha, 1); bindAttr(gasProg, 'aPhase', geo.phase, 1);
    bindAttr(gasProg, 'aKind', geo.kind, 1);
    bindAttr(gasProg, 'aRot', geo.rot, 1); bindAttr(gasProg, 'aAspect', geo.aspect, 1);
    gl.uniformMatrix4fv(uniformLoc(gasProg, 'uProj'), false, proj);
    gl.uniformMatrix4fv(uniformLoc(gasProg, 'uRot'), false, rot);
    gl.uniform3f(uniformLoc(gasProg, 'uCamPos'), rendCam[0], rendCam[1], rendCam[2]);
    gl.uniform3f(uniformLoc(gasProg, 'uOrigin'), origin[0], origin[1], origin[2]);
    gl.uniform1f(uniformLoc(gasProg, 'uWrap'), wrap);
    gl.uniform1f(uniformLoc(gasProg, 'uBox'), BOX);
    gl.uniform1f(uniformLoc(gasProg, 'uBreathe'), breathe);
    gl.uniform1f(uniformLoc(gasProg, 'uKind'), kindPass);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geo.index);
    var cnt = Math.floor(geo.indexCount * (frac || 1) / 6) * 6;
    gl.drawElements(gl.TRIANGLES, cnt, gl.UNSIGNED_SHORT, 0);
  }

  /* ribbon scratch buffers */
  var MAXRIB = 1024;
  var ribPos = new Float32Array(MAXRIB * 3), ribOff = new Float32Array(MAXRIB * 2), ribA = new Float32Array(MAXRIB);
  var ribPosB = makeBuffer(gl.ARRAY_BUFFER, ribPos, gl.DYNAMIC_DRAW);
  var ribOffB = makeBuffer(gl.ARRAY_BUFFER, ribOff, gl.DYNAMIC_DRAW);
  var ribAB = makeBuffer(gl.ARRAY_BUFFER, ribA, gl.DYNAMIC_DRAW);
  function drawRibbons(verts, colArr, proj, rot, shift) {
    var n = Math.min(verts.length, MAXRIB);
    for (var i = 0; i < n; i++) {
      ribPos.set(verts[i].p, i * 3); ribOff.set(verts[i].o, i * 2); ribA[i] = verts[i].a;
    }
    gl.useProgram(ribbonProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, ribPosB); gl.bufferData(gl.ARRAY_BUFFER, ribPos, gl.DYNAMIC_DRAW);
    bindAttr(ribbonProg, 'aPos', ribPosB, 3);
    gl.bindBuffer(gl.ARRAY_BUFFER, ribOffB); gl.bufferData(gl.ARRAY_BUFFER, ribOff, gl.DYNAMIC_DRAW);
    bindAttr(ribbonProg, 'aOff', ribOffB, 2);
    gl.bindBuffer(gl.ARRAY_BUFFER, ribAB); gl.bufferData(gl.ARRAY_BUFFER, ribA, gl.DYNAMIC_DRAW);
    bindAttr(ribbonProg, 'aAlpha', ribAB, 1);
    gl.uniformMatrix4fv(uniformLoc(ribbonProg, 'uProj'), false, proj);
    gl.uniformMatrix4fv(uniformLoc(ribbonProg, 'uRot'), false, rot);
    gl.uniform3f(uniformLoc(ribbonProg, 'uShift'), shift[0], shift[1], shift[2]);
    gl.uniform3f(uniformLoc(ribbonProg, 'uCol'), colArr[0], colArr[1], colArr[2]);
    gl.drawArrays(gl.TRIANGLES, 0, n);
  }
  /* one ribbon for a 3D segment: returns 6 verts appended to out[] */
  function pushRibbon(out, A, B, width, aA, aB, rot) {
    var dvx = B[0] - A[0], dvy = B[1] - A[1], dvz = B[2] - A[2];
    /* direction in view space (rotation only, translation-free) */
    var vx = rot[0] * dvx + rot[4] * dvy + rot[8] * dvz;
    var vy = rot[1] * dvx + rot[5] * dvy + rot[9] * dvz;
    var vl = Math.hypot(vx, vy);
    if (vl < 1e-5) return;
    var px = -vy / vl * width / 2, py = vx / vl * width / 2;
    out.push(
      { p: A, o: [px, py], a: aA }, { p: A, o: [-px, -py], a: aA }, { p: B, o: [px, py], a: aB },
      { p: A, o: [-px, -py], a: aA }, { p: B, o: [-px, -py], a: aB }, { p: B, o: [px, py], a: aB }
    );
  }

  /* fog quad */
  var fogBuf = makeBuffer(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]));
  var fogCol = [0.02, 0.02, 0.05], fogAlpha = 0;
  function updateFog(dt) {
    var acc = [0, 0, 0], wSum = 0;
    for (var i = 0; i < gasClusters.length; i++) {
      var cl = gasClusters[i];
      var dx = ((cl.pos[0] - camPos[0]) % BOX + BOX * 1.5) % BOX - BOX / 2;
      var dy = ((cl.pos[1] - camPos[1]) % BOX + BOX * 1.5) % BOX - BOX / 2;
      var dz = ((cl.pos[2] - camPos[2]) % BOX + BOX * 1.5) % BOX - BOX / 2;
      var dist = Math.hypot(dx, dy, dz);
      var w = Math.max(0, 1 - dist / 640);
      if (w <= 0) continue;
      /* tint from the region's BRIGHT shade, not its murkiest */
      var mid = PALETTES[cl.pal][0];
      acc[0] += mid[0] * w; acc[1] += mid[1] * w; acc[2] += mid[2] * w;
      wSum += w;
    }
    /* restraint: a lower cap, and eased so crossing a region's edge
     * is a gradient, never a step into soup */
    var tgtA = 0, tgtC = fogCol;
    if (wSum > 0.05) {
      /* restraint pass: the fog tint is greyed like the near gas and
       * capped lower — a wash of colour, never weather */
      var fc = [acc[0] / wSum, acc[1] / wSum, acc[2] / wSum];
      var fLum = 0.35 * fc[0] + 0.45 * fc[1] + 0.20 * fc[2];
      var fWarm = fc[0] > fc[2] + 0.02;
      var fMix = fWarm ? 0.66 : 0.38;
      var fTint = fWarm ? [fLum * 0.90, fLum * 0.97, fLum * 1.10] : [fLum, fLum, fLum];
      tgtC = [fc[0] + (fTint[0] - fc[0]) * fMix, fc[1] + (fTint[1] - fc[1]) * fMix, fc[2] + (fTint[2] - fc[2]) * fMix];
      tgtA = Math.min(0.07, wSum * 0.055);
    }
    var ease = 1 - Math.exp(-dt * 1.1);
    fogCol = [
      fogCol[0] + (tgtC[0] - fogCol[0]) * ease,
      fogCol[1] + (tgtC[1] - fogCol[1]) * ease,
      fogCol[2] + (tgtC[2] - fogCol[2]) * ease
    ];
    fogAlpha += (tgtA - fogAlpha) * ease;
  }
  function drawFog() {
    if (fogAlpha < 0.004) return;
    gl.useProgram(fogProg);
    bindAttr(fogProg, 'aP', fogBuf, 2);
    gl.uniform3f(uniformLoc(fogProg, 'uCol'), fogCol[0], fogCol[1], fogCol[2]);
    gl.uniform1f(uniformLoc(fogProg, 'uAlpha'), fogAlpha);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ================= bloom (improvement pass 5) =================
   * The scene renders into an offscreen target; highlights are
   * extracted, blurred at quarter resolution (two separable passes,
   * twice), and composited back additively — so Deneb, Vega and the
   * thread cores glow the way bright things do in a long exposure.
   * Any framebuffer failure falls back to direct rendering. */
  var postVS = 'attribute vec2 aP; varying vec2 vUv;' +
    'void main(){ vUv = aP * 0.5 + 0.5; gl_Position = vec4(aP, 0.0, 1.0); }';
  var brightProg = makeProgram(postVS,
    'precision mediump float; varying vec2 vUv; uniform sampler2D uTex;' +
    'void main(){ vec3 c = texture2D(uTex, vUv).rgb;' +
    '  float lum = dot(c, vec3(0.299, 0.587, 0.114));' +
    '  float w = smoothstep(0.45, 0.95, lum);' +
    '  gl_FragColor = vec4(c * w, 1.0); }');
  var blurProg = makeProgram(postVS,
    'precision mediump float; varying vec2 vUv; uniform sampler2D uTex; uniform vec2 uStep;' +
    'void main(){ vec3 s = texture2D(uTex, vUv).rgb * 0.227027;' +
    '  s += texture2D(uTex, vUv + uStep * 1.3846).rgb * 0.3162162;' +
    '  s += texture2D(uTex, vUv - uStep * 1.3846).rgb * 0.3162162;' +
    '  s += texture2D(uTex, vUv + uStep * 3.2308).rgb * 0.0702703;' +
    '  s += texture2D(uTex, vUv - uStep * 3.2308).rgb * 0.0702703;' +
    '  gl_FragColor = vec4(s, 1.0); }');
  var compProg = makeProgram(postVS,
    'precision mediump float; varying vec2 vUv;' +
    'uniform sampler2D uTex; uniform sampler2D uBloom; uniform float uStrength;' +
    'void main(){ vec3 base = texture2D(uTex, vUv).rgb;' +
    '  vec3 glow = texture2D(uBloom, vUv).rgb;' +
    '  gl_FragColor = vec4(base + glow * uStrength, 1.0); }');
  var sceneT = null, blurA = null, blurB = null, bloomOK = false;
  function makeTarget(w, h) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex: tex, fb: fb, w: w, h: h, ok: ok };
  }
  function buildBloomTargets() {
    [sceneT, blurA, blurB].forEach(function (tt) {
      if (tt) { gl.deleteTexture(tt.tex); gl.deleteFramebuffer(tt.fb); }
    });
    if (!cv.width || !cv.height) { bloomOK = false; return; }
    sceneT = makeTarget(cv.width, cv.height);
    blurA = makeTarget(Math.max(1, cv.width >> 2), Math.max(1, cv.height >> 2));
    blurB = makeTarget(Math.max(1, cv.width >> 2), Math.max(1, cv.height >> 2));
    bloomOK = !!(sceneT.ok && blurA.ok && blurB.ok);
  }
  function runBloom() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, blurA.fb);
    gl.viewport(0, 0, blurA.w, blurA.h);
    gl.useProgram(brightProg);
    bindAttr(brightProg, 'aP', fogBuf, 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
    gl.uniform1i(uniformLoc(brightProg, 'uTex'), 0);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    var src = blurA, dst = blurB;
    gl.useProgram(blurProg);
    bindAttr(blurProg, 'aP', fogBuf, 2);
    gl.uniform1i(uniformLoc(blurProg, 'uTex'), 0);
    for (var i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
      gl.viewport(0, 0, dst.w, dst.h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform2f(uniformLoc(blurProg, 'uStep'), (i + 1) / src.w, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, src.fb);
      gl.viewport(0, 0, src.w, src.h);
      gl.bindTexture(gl.TEXTURE_2D, dst.tex);
      gl.uniform2f(uniformLoc(blurProg, 'uStep'), 0, (i + 1) / src.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cv.width, cv.height);
    gl.useProgram(compProg);
    bindAttr(compProg, 'aP', fogBuf, 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
    gl.uniform1i(uniformLoc(compProg, 'uTex'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(uniformLoc(compProg, 'uBloom'), 1);
    gl.uniform1f(uniformLoc(compProg, 'uStrength'), 0.55);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.BLEND);
  }

  /* ================= shooting star ================= */
  var meteor = null, nextMeteor = 18 + rng() * 25;

  /* ================= main loop ================= */
  var raf = 0, lastT = 0, qualityGas = 1, qualityLevel = 0, renderScale = 1, lastRawT = 0, slowTime = 0;
  var azVel = 0, bankCur = 0;
  var rendCam = [0, 0, 0], voyVec = [0, 0, 0];

  function frame(nowMs) {
    raf = requestAnimationFrame(frame);
    var now = nowMs / 1000;
    var dt = Math.min(now - (lastT || now), 0.1); lastT = now;
    elapsed += dt;
    var t = elapsed;
    var prevAz = cam.az;

    /* adaptive quality, judged in wall-clock time (not frames — at
     * 2 fps a frame counter takes forever to notice): thin the gas,
     * then drop render scale. Real insurance for weak GPUs, and for
     * software-GL test rigs. */
    var rawDt = lastRawT ? now - lastRawT : 0; lastRawT = now;
    if (rawDt > 0.03) {
      slowTime += rawDt;
      if (slowTime > 1.2 && qualityLevel < 2) {
        qualityLevel++; slowTime = 0;
        if (qualityLevel === 1) qualityGas = 0.55;
        if (qualityLevel === 2) { qualityGas = 0.3; renderScale = 0.72; resize(); }
      }
    } else slowTime = Math.max(0, slowTime - rawDt);

    /* camera: glide + idle tour (ported) */
    var idleFor = t - lastTouchAt;
    if (pointers.size === 0) {
      cam.az += cam.vaz * dt; cam.alt += cam.valt * dt;
      var damp = Math.exp(-dt * 2.6); cam.vaz *= damp; cam.valt *= damp;
      if (idleFor > 20 && !reduced) {
        var tAz = baseAz + Math.sin(t * 0.021) * 0.17 + Math.sin(t * 0.0083 + 1.3) * 0.1;
        var tAlt = baseAlt + Math.sin(t * 0.015 + 2.0) * 0.07;
        var ease = 1 - Math.exp(-dt * 0.22);
        var dAz = ((tAz - cam.az + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        cam.az += dAz * ease; cam.alt += (tAlt - cam.alt) * ease;
      }
    }
    if (cam.alt > 1.52) cam.alt = 1.52; if (cam.alt < -1.45) cam.alt = -1.45;

    /* the voyage (ported): a still hold steps sideways; now it is a
     * literal translation of the camera, and the world does the rest */
    if (pointers.size === 1 && !P2.engaged && movedPx < 10 && performance.now() - downStamp > 450) P2.engaged = true;
    if (P2.engaged) P2.voyageTarget = 1;
    P2.voyage += (P2.voyageTarget - P2.voyage) * Math.min(1, dt * 1.05);
    /* THE LONG VOYAGE (review Pass G): keep holding past the first
     * step and the step itself keeps growing — from 115 units out to
     * 545 over about five more seconds, far enough that a figure's
     * nearest stars sweep past the traveller and the shape does not
     * loosen but come apart. Release, and both eases bring you home. */
    if (P2.engaged) P2.voyageHold += dt; else P2.voyageHold = 0;
    var longTgt = P2.engaged ? Math.max(0, Math.min(1, (P2.voyageHold - 1.15) / 5.5)) : 0;
    P2.longV += (longTgt - P2.longV) * Math.min(1, dt * (P2.engaged ? 0.85 : 1.7));
    if (P2.voyage > 0.5 && !hasVoyaged) {
      hasVoyaged = true;
      try { window.localStorage.setItem('nd-voyaged', '1'); } catch (e) { /* private mode */ }
    }

    /* camera basis, with bank: the horizon leans a few degrees into a
     * turn (smoothed azimuth rate drives it) and settles back level —
     * the difference between a tripod head and a body floating */
    var azDelta = ((cam.az - prevAz + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    if (dt > 0.001) azVel += ((azDelta / dt) - azVel) * Math.min(1, dt * 5);
    var bankTgt = reduced ? 0 : Math.max(-0.055, Math.min(0.055, -azVel * 0.05));
    bankCur += (bankTgt - bankCur) * Math.min(1, dt * 3.5);
    var cosA = Math.cos(cam.az), sinA = Math.sin(cam.az), cosH = Math.cos(cam.alt), sinH = Math.sin(cam.alt);
    var fwd = [cosH * sinA, sinH, -cosH * cosA];
    var rgt = [cosA, 0, sinA];
    var upv = [-sinH * sinA, cosH, sinH * cosA];
    var cb = Math.cos(bankCur), sb = Math.sin(bankCur);
    var rgtB = [rgt[0] * cb + upv[0] * sb, rgt[1] * cb + upv[1] * sb, rgt[2] * cb + upv[2] * sb];
    var upvB = [upv[0] * cb - rgt[0] * sb, upv[1] * cb - rgt[1] * sb, upv[2] * cb - rgt[2] * sb];

    /* TRAVEL: the camera moves through the world, always, gently */
    if (!reduced) {
      camPos[0] += fwd[0] * TRAVEL_SPEED * dt;
      camPos[1] += fwd[1] * TRAVEL_SPEED * dt;
      camPos[2] += fwd[2] * TRAVEL_SPEED * dt;
    }
    var lvSm = P2.longV * P2.longV * (3 - 2 * P2.longV);
    P2.stepLen = P2.voyage * (115 + 430 * lvSm);
    voyVec = [rgtB[0] * P2.stepLen, rgtB[1] * P2.stepLen, rgtB[2] * P2.stepLen];
    rendCam = [camPos[0] + voyVec[0], camPos[1] + voyVec[1], camPos[2] + voyVec[2]];

    /* figure detection (ported) */
    var curFig = P2.activeName ? figuresByName[P2.activeName] : null;
    var curAng = 9, candFig = null, candAng = 9;
    for (var fgi = 0; fgi < figures.length; fgi++) {
      var fgCand = figures[fgi];
      if (fgCand.upFrac < 0.6) continue;
      var cosFc = fgCand.centre[0] * fwd[0] + fgCand.centre[1] * fwd[1] + fgCand.centre[2] * fwd[2];
      var angFc = Math.acos(Math.max(-1, Math.min(1, cosFc)));
      if (angFc < candAng) { candAng = angFc; candFig = fgCand; }
      if (fgCand === curFig) curAng = angFc;
    }
    var nextFig = null;
    if (curFig && curAng < 0.61 && !(candFig && candAng < curAng - 0.14)) nextFig = curFig;
    else if (candFig && candAng < 0.47) nextFig = candFig;
    if (nextFig) {
      if (nextFig.name !== P2.activeName) {
        P2.activeName = nextFig.name; P2.actT = t;
        P2.chimed = false; P2.unravelled = false;
        P2.loggedFig = null;
        if (P2.firstNotes.fig && P2.firstNotes.fig !== nextFig.name) P2.firstNotes.fig = null;
        if (P2.mileNotes.fig && P2.mileNotes.fig !== nextFig.name) P2.mileNotes.fig = null;
        rebuildBoost(nextFig);
        ensureFigAi(nextFig);
        if (AU) AU.setRegion(nextFig.name);
      }
      P2.drawFig = nextFig;
      P2.alpha = Math.min(1, P2.alpha + dt * 0.8);
    } else {
      P2.alpha = Math.max(0, P2.alpha - dt * 0.7);
      if (P2.alpha === 0) {
        P2.activeName = null; P2.drawFig = null; rebuildBoost(null);
        P2.firstNotes.fig = null; P2.mileNotes.fig = null;
      }
    }
    P2.figAng = nextFig ? (nextFig === curFig ? curAng : candAng) : 9;

    /* planet detection — a planet is a point, not a region, so its
     * gate is tighter than a figure's; same hysteresis spirit. Only
     * planets actually up tonight can settle. */
    var pCur = P2.planet, pCurAng = 9, pCand = null, pCandAng = 9;
    for (var pdi = 0; pdi < planetPts.length; pdi++) {
      var pd = planetPts[pdi];
      if (pd.alt <= 0) continue;
      var cosPd = pd.dir[0] * fwd[0] + pd.dir[1] * fwd[1] + pd.dir[2] * fwd[2];
      var angPd = Math.acos(Math.max(-1, Math.min(1, cosPd)));
      if (angPd < pCandAng) { pCandAng = angPd; pCand = pd; }
      if (pd === pCur) pCurAng = angPd;
    }
    var nextP = null;
    if (pCur && pCurAng < 0.24 && !(pCand && pCandAng < pCurAng - 0.08)) nextP = pCur;
    else if (pCand && pCandAng < 0.16) nextP = pCand;
    if (nextP) {
      if (nextP !== P2.planet) { P2.planet = nextP; P2.pActT = t; }
      P2.planetAng = nextP === pCur ? pCurAng : pCandAng;
      P2.pAlpha = Math.min(1, P2.pAlpha + dt * 0.8);
    } else {
      P2.pAlpha = Math.max(0, P2.pAlpha - dt * 0.7);
      if (P2.pAlpha === 0) {
        P2.planet = null; P2.loggedPlanet = null;
        P2.firstNotes.planet = null;
      }
    }
    /* moon detection — a single point, gated exactly like a planet */
    var mAng = 9;
    if (moonPt && moonPt.alt > 0) {
      var cosMd = moonPt.dir[0] * fwd[0] + moonPt.dir[1] * fwd[1] + moonPt.dir[2] * fwd[2];
      mAng = Math.acos(Math.max(-1, Math.min(1, cosMd)));
    }
    if (moonPt && moonPt.alt > 0 && (P2.moon ? mAng < 0.24 : mAng < 0.16)) {
      if (P2.moon !== moonPt) { P2.moon = moonPt; P2.mActT = t; }
      P2.moonAng = mAng;
      P2.mAlpha = Math.min(1, P2.mAlpha + dt * 0.8);
    } else {
      P2.mAlpha = Math.max(0, P2.mAlpha - dt * 0.7);
      if (P2.mAlpha === 0) {
        P2.moon = null; P2.loggedMoon = false;
        P2.firstNotes.moon = null; P2.mileNotes.moon = false;
      }
    }

    /* nebula detection — the nearest speakable anchor near centre,
     * gated a hair wider than the planets: these are patches of
     * light, not points */
    var nbCand = null, nbAng = 9;
    for (var nbi = 0; nbi < nebPts.length; nbi++) {
      var nbp = nebPts[nbi];
      if (nbp.alt < 0) continue;
      var cosNb = nbp.dir[0] * fwd[0] + nbp.dir[1] * fwd[1] + nbp.dir[2] * fwd[2];
      var aNb = Math.acos(Math.max(-1, Math.min(1, cosNb)));
      if (aNb < nbAng) { nbAng = aNb; nbCand = nbp; }
    }
    if (nbCand && (P2.neb ? nbAng < 0.25 : nbAng < 0.17)) {
      if (P2.neb !== nbCand) { P2.neb = nbCand; P2.nbActT = t; }
      P2.nebAng = nbAng;
      P2.nbAlpha = Math.min(1, P2.nbAlpha + dt * 0.8);
    } else {
      P2.nbAlpha = Math.max(0, P2.nbAlpha - dt * 0.7);
      P2.nebAng = 9;
      if (P2.nbAlpha === 0) { P2.neb = null; P2.loggedNeb = null; P2.firstNotes.neb = null; }
    }

    /* bright-star detection — a point, gated exactly like a planet */
    var stCand = null, stAng = 9;
    for (var sti = 0; sti < starPts.length; sti++) {
      var stp = starPts[sti];
      if (stp.alt < 0) continue;
      var cosSt = stp.dir[0] * fwd[0] + stp.dir[1] * fwd[1] + stp.dir[2] * fwd[2];
      var aSt = Math.acos(Math.max(-1, Math.min(1, cosSt)));
      if (aSt < stAng) { stAng = aSt; stCand = stp; }
    }
    if (stCand && (P2.star ? stAng < 0.24 : stAng < 0.16)) {
      if (P2.star !== stCand) { P2.star = stCand; P2.stActT = t; }
      P2.starAng = stAng;
      P2.stAlpha = Math.min(1, P2.stAlpha + dt * 0.8);
    } else {
      P2.stAlpha = Math.max(0, P2.stAlpha - dt * 0.7);
      P2.starAng = 9;
      if (P2.stAlpha === 0) { P2.star = null; P2.loggedStar = null; P2.firstNotes.star = null; }
    }

    P2.activeFor = P2.activeName ? t - P2.actT : 0;

    /* sound events (ported) */
    if (AU && P2.drawFig && !P2.chimed && P2.alpha > 0.6 && P2.voyage < 0.2 &&
        t - P2.actT > (P2.drawFig.lines.length - 1) * 0.13 + 0.95) {
      P2.chimed = true;
      AU.figureComplete(P2.drawFig.name);
    }
    if (P2.drawFig && !dissolveSeen && P2.voyage > 0.6) {
      dissolveSeen = true;
      try { window.localStorage.setItem('nd-dissolved', '1'); } catch (e) { /* private mode */ }
    }
    if (P2.longV > 0.5 && !longVoyaged) {
      longVoyaged = true;
      try { window.localStorage.setItem('nd-longed', '1'); } catch (e) { /* private mode */ }
    }
    if (AU && P2.drawFig && !P2.unravelled && P2.voyage > 0.6) {
      P2.unravelled = true;
      AU.unravel(P2.drawFig.name);
    }

    /* the log records its meetings on the chime's beat, AU or not */
    if (P2.drawFig && P2.loggedFig !== P2.drawFig.name && P2.alpha > 0.6 && P2.voyage < 0.2 &&
        t - P2.actT > (P2.drawFig.lines.length - 1) * 0.13 + 0.95) {
      P2.loggedFig = P2.drawFig.name;
      recordMeet('fig', P2.drawFig.name);
    }
    if (P2.planet && P2.loggedPlanet !== P2.planet.name && P2.pAlpha > 0.6 && t - P2.pActT > 1.2) {
      P2.loggedPlanet = P2.planet.name;
      recordMeet('planet', P2.planet.name);
    }
    if (P2.moon && !P2.loggedMoon && P2.mAlpha > 0.6 && t - P2.mActT > 1.2) {
      P2.loggedMoon = true;
      recordMeet('moon', 'Moon');
    }
    if (P2.neb && P2.loggedNeb !== P2.neb.name && P2.nbAlpha > 0.6 && t - P2.nbActT > 1.2) {
      P2.loggedNeb = P2.neb.name;
      recordMeet('neb', P2.neb.name);
    }
    if (P2.star && P2.loggedStar !== P2.star.name && P2.stAlpha > 0.6 && t - P2.stActT > 1.2) {
      P2.loggedStar = P2.star.name;
      recordMeet('star', P2.star.name);
    }

    /* meteors arrive on their own schedule */
    if (t > nextMeteorAt) {
      spawnMeteor(t, fwd);
      nextMeteorAt = t + meteorInfo.meanSec * (0.45 + Math.random() * 1.1);
    }

    /* the lean-in: when a figure has settled and you're not voyaging,
     * the view breathes from 68 deg toward 56 deg — an arrival, not a
     * zoom. Skipped under reduced motion. */
    var fovTgt = (P2.drawFig && P2.alpha > 0.55 && P2.voyage < 0.3 && !reduced) ? FOV_IN : FOV_WIDE;
    fovCur += (fovTgt - fovCur) * Math.min(1, dt * 0.55);
    if (Math.abs(fovTgt - fovCur) < 0.001) fovCur = fovTgt;
    if (Math.abs(fovCur - fovApplied) > 0.0004) applyProj();

    /* ================= render ================= */
    var rot = rotationMat(rgtB, upvB, fwd);
    var breathe = reduced ? 1 : 0.88 + 0.12 * Math.sin(t * 0.924);
    var useBloom = bloomOK && qualityLevel < 2;
    if (useBloom) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneT.fb);
      gl.viewport(0, 0, cv.width, cv.height);
    }
    gl.clearColor(0.008, 0.012, 0.035, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);

    /* star shell + figure boost */
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    drawStars(starGeo, projMat, rot, voyVec, 1, t);
    if (haloGeo) drawStars(haloGeo, projMat, rot, voyVec, 0.15, t);
    if (boostGeo && P2.alpha > 0.02) {
      drawStars(boostGeo, projMat, rot, voyVec, P2.alpha * (0.5 + P2.voyage * 0.9), t);
    }

    /* distant anchor complexes (shell space), glow then dust */
    drawGas(anchorGas, 0, 0, camPos, projMat, rot, rendCam, breathe, 1);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    drawGas(anchorGas, 1, 0, camPos, projMat, rot, rendCam, 1, 1);

    /* the local volume you fly through, glow then dust */
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    drawGas(localGas, 0, 1, camPos, projMat, rot, rendCam, breathe, qualityGas);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    drawGas(localGas, 1, 1, camPos, projMat, rot, rendCam, 1, qualityGas);

    /* the Moon — drawn with normal blending so its dark side truly
     * occludes the stars behind it, then additive resumes */
    if (moonPt) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      drawMoon(projMat, rot, voyVec);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    }

    /* meteors streak above the gas, below the threads */
    drawMeteors(projMat, rot, voyVec, t);

    /* threads of light */
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    if (P2.drawFig && P2.alpha > 0.02) {
      var threadA = P2.alpha * Math.max(0, 1 - P2.voyage * 1.5);
      if (threadA > 0.01) {
        var ribVerts = [];
        var threadFig = P2.drawFig;
        for (var sgi = 0; sgi < threadFig.lines.length; sgi++) {
          var segPair = threadFig.lines[sgi];
          var segProg = Math.max(0, Math.min(1, (t - P2.actT - sgi * 0.13) / 0.75));
          if (segProg <= 0) continue;
          var pA = catStars[segPair[0]].pos;
          var pB = catStars[segPair[1]].pos;
          var pE = [pA[0] + (pB[0] - pA[0]) * segProg, pA[1] + (pB[1] - pA[1]) * segProg, pA[2] + (pB[2] - pA[2]) * segProg];
          pushRibbon(ribVerts, pA, pE, 2.1, 0.10 * threadA * segProg, 0.10 * threadA * segProg, rot);
          pushRibbon(ribVerts, pA, pE, 0.65, 0.62 * threadA * segProg, 0.62 * threadA * segProg, rot);
        }
        if (ribVerts.length) drawRibbons(ribVerts, [1.0, 0.93, 0.80], projMat, rot, voyVec);
      }
    }

    /* a shooting star, now and then */
    if (!meteor && t > nextMeteor && !reduced) {
      var mAz = cam.az + (rng() - 0.5) * 0.9, mAlt = cam.alt + 0.25 + rng() * 0.3;
      meteor = {
        t0: t, dur: 1.1,
        from: SKY.dirFromAltAz(mAlt * 57.2958, mAz * 57.2958),
        vel: [(rng() - 0.5) * 0.55, -0.16 - rng() * 0.1, (rng() - 0.5) * 0.55]
      };
      nextMeteor = t + 22 + rng() * 30;
    }
    if (meteor) {
      var mt = (t - meteor.t0) / meteor.dur;
      if (mt >= 1) meteor = null;
      else {
        var headD = [
          meteor.from[0] + meteor.vel[0] * mt * 0.5,
          meteor.from[1] + meteor.vel[1] * mt * 0.5,
          meteor.from[2] + meteor.vel[2] * mt * 0.5
        ];
        var hl = Math.hypot(headD[0], headD[1], headD[2]);
        var headP = [headD[0] / hl * 3050, headD[1] / hl * 3050, headD[2] / hl * 3050];
        var tailP = [
          headP[0] - meteor.vel[0] * 260, headP[1] - meteor.vel[1] * 260, headP[2] - meteor.vel[2] * 260
        ];
        var mAlpha = Math.sin(mt * Math.PI) * 0.8;
        var mVerts = [];
        pushRibbon(mVerts, tailP, headP, 1.5, 0, mAlpha, rot);
        if (mVerts.length) drawRibbons(mVerts, [0.85, 0.91, 1.0], projMat, rot, voyVec);
      }
    }

    /* inside-the-cloud fog */
    updateFog(dt);
    drawFog();

    if (useBloom) runBloom();

    updateWhisper(t);
    window.__nebula.frameCount++;
  }

  /* ================= boot ================= */
  var sndBtn = document.getElementById('sndBtn');
  if (mutedPref) sndBtn.classList.add('off');
  sndBtn.addEventListener('click', function () {
    mutedPref = !mutedPref;
    sndBtn.classList.toggle('off', mutedPref);
    try {
      if (mutedPref) window.localStorage.setItem('nd-muted', '1');
      else window.localStorage.removeItem('nd-muted');
    } catch (e) { /* private mode */ }
    if (AU) { AU.init(mutedPref); AU.setMuted(mutedPref); }
  });

  /* ================= the field log panel ================= */
  var logBtn = document.getElementById('logBtn');
  var logPanel = document.getElementById('logPanel');
  var logScrim = document.getElementById('logScrim');
  var logOpen = false;
  function fmtLogDate(key) {
    var p = key.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function logRow(parent, name, meta) {
    var row = document.createElement('div'); row.className = 'logRow';
    var n = document.createElement('div'); n.className = 'logName'; n.textContent = name;
    var m = document.createElement('div'); m.className = 'logMeta'; m.textContent = meta;
    row.appendChild(n); row.appendChild(m); parent.appendChild(row);
  }
  function logSection(parent, label) {
    var s = document.createElement('div'); s.className = 'logSec'; s.textContent = label;
    parent.appendChild(s);
  }
  function renderLog() {
    var body = document.getElementById('logBody');
    while (body.firstChild) body.removeChild(body.firstChild);
    if (almanac) {
      logSection(body, 'ALMANAC');
      logRow(body, 'Moon', almanac.phase + ' · ' + almanac.illumPct + '% lit');
      if (almanac.rise) logRow(body, 'Moonrise', almanac.rise + (almanac.riseNote ? ' · ' + almanac.riseNote : ''));
      if (almanac.set) logRow(body, 'Moonset', almanac.set + (almanac.setNote ? ' · ' + almanac.setNote : ''));
      if (almanac.planetsUp.length) logRow(body, 'Planets riding', almanac.planetsUp.join(' · '));
      if (almanac.shower) logRow(body, 'Showers', almanac.shower + (almanac.showerPeak ? ' — peak ' + almanac.showerPeak : ''));
      if (almanac.full) logRow(body, 'Full moon', almanac.full);
      if (almanac.newMoon) logRow(body, 'New moon', almanac.newMoon);
    }
    var figNames = Object.keys(log.figs);
    document.getElementById('logSummary').textContent =
      log.nights.length + (log.nights.length === 1 ? ' night' : ' nights') + ' under this sky · ' +
      figNames.length + ' of ' + figures.length + ' figures met';
    function byFirst(a, b) { return a[1].first < b[1].first ? 1 : -1; }
    function metaOf(e) { return 'first met ' + fmtLogDate(e.first) + (e.n > 1 ? ' · ×' + e.n : ''); }
    if (figNames.length) {
      logSection(body, 'FIGURES');
      figNames.map(function (n) { return [n, log.figs[n]]; }).sort(byFirst)
        .forEach(function (pair) { logRow(body, pair[0], metaOf(pair[1])); });
    }
    var plNames = Object.keys(log.planets);
    if (plNames.length) {
      logSection(body, 'PLANETS');
      plNames.map(function (n) { return [n, log.planets[n]]; }).sort(byFirst)
        .forEach(function (pair) { logRow(body, pair[0], metaOf(pair[1])); });
    }
    var stNames = Object.keys(log.stars);
    if (stNames.length) {
      logSection(body, 'STARS');
      stNames.map(function (n) { return [n, log.stars[n]]; }).sort(byFirst)
        .forEach(function (pair) { logRow(body, pair[0], metaOf(pair[1])); });
    }
    var nbNames = Object.keys(log.nebulae);
    if (nbNames.length) {
      logSection(body, 'DEEP SKY');
      nbNames.map(function (n) { return [n, log.nebulae[n]]; }).sort(byFirst)
        .forEach(function (pair) { logRow(body, pair[0], metaOf(pair[1])); });
    }
    if (log.moon.first) {
      logSection(body, 'THE MOON');
      logRow(body, 'Moon', metaOf(log.moon));
      if (log.moon.phases.length) {
        var ph = document.createElement('div'); ph.className = 'logLine';
        ph.textContent = 'Seen as: ' + log.moon.phases.join(' · ');
        body.appendChild(ph);
      }
    }
    if (log.notes.length) {
      logSection(body, 'FIELD NOTES');
      log.notes.slice(-6).reverse().forEach(function (n) {
        var nd = document.createElement('div'); nd.className = 'logLine';
        var ds = document.createElement('span'); ds.className = 'logNoteD';
        var dp = n.d.split('-');
        ds.textContent = new Date(+dp[0], +dp[1] - 1, +dp[2]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        nd.appendChild(ds);
        nd.appendChild(document.createTextNode(' — ' + n.text));
        body.appendChild(nd);
      });
    }
    if (!figNames.length && !plNames.length && !stNames.length && !nbNames.length && !log.moon.first) {
      var em = document.createElement('div'); em.className = 'logLine';
      em.textContent = 'Nothing remembered yet. Settle on a figure, a planet, or the Moon, and tonight will be kept here.';
      body.appendChild(em);
    }
  }
  function setLogOpen(open) {
    logOpen = open;
    if (open) renderLog();
    logPanel.classList.toggle('show', open);
    logScrim.classList.toggle('show', open);
    whisperEl.classList.toggle('hiddenByPanel', open);
    logPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
  }
  if (logBtn) logBtn.addEventListener('click', function () { setLogOpen(!logOpen); });
  if (logScrim) logScrim.addEventListener('click', function () { setLogOpen(false); });
  window.__nebula.getLog = function () { return JSON.parse(JSON.stringify(log)); };

  /* ================= astronomer's red (Pass E) =================
   * Real observers guard their dark adaptation with red light; this
   * is the same courtesy from the app. One veil, multiplied over
   * everything, remembered between nights. */
  var redBtn = document.getElementById('redBtn');
  var redVeil = document.getElementById('redVeil');
  var redOn = false;
  try { redOn = window.localStorage.getItem('nd-red') === '1'; } catch (e) { /* private mode */ }
  function applyRed() {
    if (redVeil) redVeil.classList.toggle('on', redOn);
    if (redBtn) redBtn.classList.toggle('on', redOn);
  }
  if (redBtn) redBtn.addEventListener('click', function () {
    redOn = !redOn;
    try { window.localStorage.setItem('nd-red', redOn ? '1' : '0'); } catch (e) { /* private mode */ }
    applyRed();
  });
  applyRed();
  window.__nebula.redOn = function () { return redOn; };

  Object.assign(window.__nebula, {
    cam: cam, tonight: tonight, visibleUp: upCount,
    catalogue: catStars.length, fieldStars: shellCount, planets: planetPts, moon: moonPt, nebulae: nebPts, brightStars: starPts,
    meteors: meteorInfo, skyEvent: skyEvent, almanac: almanac,
    voyageState: function () { return { engaged: P2.engaged, hold: P2.voyageHold, v: P2.voyage, longV: P2.longV, step: P2.stepLen || 0 }; },
    milestones: function () { return { night: mileNight, fig: P2.mileNotes.fig, moon: P2.mileNotes.moon }; }, spawnMeteor: function (fwd) { return spawnMeteor(elapsed, fwd || null); },
    meteorPool: function () { return meteors.map(function (m) { return m.on ? { S: m.S, V: m.V } : null; }); },
    meteorsActive: function () { return meteors.filter(function (m) { return m.on; }).length; },
    gasPuffs: localGas.puffCount + anchorGas.puffCount,
    camPos: camPos, pass2: P2, audio: AU ? AU.state : null
  });
  window.__nebula.bankNow = function () { return bankCur; };
  window.__nebula.face = function (name) {
    for (var sfi = 0; sfi < starPts.length; sfi++) {
      if (starPts[sfi].name === name) {
        var aaS = dirToAzAlt(starPts[sfi].dir);
        cam.az = aaS.az; cam.alt = aaS.alt; cam.vaz = 0; cam.valt = 0;
        lastTouchAt = perfNow();
        return true;
      }
    }
    for (var nfi = 0; nfi < nebPts.length; nfi++) {
      if (nebPts[nfi].name === name) {
        var aaN = dirToAzAlt(nebPts[nfi].dir);
        cam.az = aaN.az; cam.alt = aaN.alt; cam.vaz = 0; cam.valt = 0;
        lastTouchAt = perfNow();
        return true;
      }
    }
    var plT = null;
    for (var pli = 0; pli < planetPts.length; pli++) if (planetPts[pli].name === name) plT = planetPts[pli];
    if (plT) {
      var aaP = dirToAzAlt(plT.dir);
      cam.az = aaP.az; cam.alt = aaP.alt; cam.vaz = 0; cam.valt = 0;
      lastTouchAt = perfNow();
      return true;
    }
    if (name === 'Moon' && moonPt) {
      var aaM = dirToAzAlt(moonPt.dir);
      cam.az = aaM.az; cam.alt = aaM.alt; cam.vaz = 0; cam.valt = 0;
      lastTouchAt = perfNow();
      return true;
    }
    var figT = figuresByName[name];
    if (!figT) return false;
    var aaT = dirToAzAlt(figT.centre);
    cam.az = aaT.az; cam.alt = aaT.alt; cam.vaz = 0; cam.valt = 0;
    lastTouchAt = perfNow();
    return true;
  };

  resize();
  showWhisper(8000);
  requestAnimationFrame(function (ms) {
    window.__nebula.ready = true;
    frame(ms);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(raf); lastT = 0; if (AU) AU.suspend(); }
    else { raf = requestAnimationFrame(frame); if (AU) AU.resume(); }
  });
})();
