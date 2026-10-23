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

  /* ---- star points ---- */
  var starProg = makeProgram(
    'attribute vec3 aPos; attribute vec3 aCol; attribute float aSize;' +
    'attribute float aPhase; attribute float aTwk; attribute float aSpike;' +
    'uniform mat4 uProj; uniform mat4 uRot; uniform vec3 uShift;' +
    'uniform float uTime; uniform float uScaleH; uniform float uAlphaMul;' +
    'varying vec3 vCol; varying float vAlpha; varying float vSpike;' +
    'void main(){' +
    '  vec4 vp = uRot * vec4(aPos - uShift, 1.0);' +
    '  gl_Position = uProj * vp;' +
    '  float tw = 0.86 + 0.14 * sin(uTime * aTwk + aPhase);' +
    '  vCol = aCol; vAlpha = tw * uAlphaMul; vSpike = aSpike;' +
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

  var catByName = {}, catStars = [];
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
    var cLen = Math.hypot(centreAcc[0], centreAcc[1], centreAcc[2]) || 1;
    var figObj = {
      name: fDef.name, story: fDef.story, lines: idxLines,
      centre: [centreAcc[0] / cLen, centreAcc[1] / cLen, centreAcc[2] / cLen],
      upFrac: totStars ? upStars / totStars : 0, near: nearSt, far: farSt
    };
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
          col: paletteShade(neb.palette, rng), size: neb.size * (270 + rng() * 240),
          alpha: neb.kind === 'cluster' ? 0.10 : 0.08, phase: rng() * 6.283, kind: 0,
          rot: shape.rot + (rng() - 0.5) * 0.35, aspect: shape.aspect * (0.9 + rng() * 0.2)
        });
        if (li === 0 && (neb.kind === 'galaxy' || neb.kind === 'cluster')) {
          /* a bright core so a galaxy reads as a galaxy */
          puffs.push({
            pos: [neb.dir[0] * (dist + 30), neb.dir[1] * (dist + 30), neb.dir[2] * (dist + 30)],
            col: paletteShade(neb.palette, rng), size: neb.size * 130,
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
    for (var c = 0; c < 26; c++) {
      gasClusters.push({
        pos: [(r() - 0.5) * BOX, (r() - 0.5) * BOX, (r() - 0.5) * BOX],
        pal: palNames[Math.floor(r() * palNames.length)]
      });
    }
    var puffs = [];
    gasClusters.forEach(function (cl) {
      var nP = 34 + Math.floor(r() * 14);
      for (var i = 0; i < nP; i++) {
        puffs.push({
          pos: [
            cl.pos[0] + ((r() + r() + r()) / 3 - 0.5) * 560,
            cl.pos[1] + ((r() + r() + r()) / 3 - 0.5) * 560,
            cl.pos[2] + ((r() + r() + r()) / 3 - 0.5) * 560
          ],
          col: paletteShade(cl.pal, r), size: 95 + r() * 210,
          alpha: 0.055 + r() * 0.07, phase: r() * 6.283, kind: 0,
          rot: r() * 3.14, aspect: 1 + r() * 0.8
        });
      }
    });
    for (var d = 0; d < 130; d++) {
      var host = puffs[Math.floor(r() * puffs.length)];
      puffs.push({
        pos: [host.pos[0] + (r() - 0.5) * 90, host.pos[1] + (r() - 0.5) * 90, host.pos[2] + (r() - 0.5) * 90],
        col: [0.008, 0.008, 0.02], size: 120 + r() * 150,
        alpha: 0.15 + r() * 0.16, phase: r() * 6.283, kind: 1,
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
        alpha: 0.26 + r() * 0.08, phase: r() * 6.283, kind: 1,
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
  var P2 = { activeName: null, drawFig: null, alpha: 0, actT: 0, activeFor: 0, voyage: 0, voyageTarget: 0, engaged: false, chimed: false, unravelled: false };
  var hasVoyaged = false;
  try { hasVoyaged = !!window.localStorage.getItem('nd-voyaged'); } catch (e) { /* private mode */ }

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
  var tonightSub = 'drag to look — it drifts on its own';

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
      date: aiDateKey(tonight.date)
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
      aiFetch('driftnight', { date: dateStr, up: upStr, bright: bright }, function (t) {
        if (t) aiTonightSub = t;
      });
      ups.slice(0, 3).forEach(function (u) { ensureFigAi(u.fig); });
    } catch (e) { /* silent — authored lines carry the night */ }
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
  function updateWhisper(t) {
    var fig = P2.drawFig;
    if (!bootGreetDone && (t >= tapFlashUntil || t >= BOOT_GREET_SECS)) bootGreetDone = true;
    if (fig && P2.alpha > 0.3 && P2.voyage > 0.35) {
      setWhisper('dis:' + fig.name, fig.name + ', dissolved',
        fig.near.name + ' is ' + fmtDist(fig.near.dist) + ' light-years away · ' +
        fig.far.name + ' is ' + fmtDist(fig.far.dist) + ' — the shape only exists from home');
    } else if (t < tapFlashUntil && !bootGreetDone) {
      /* the boot greeting holds the whisper for its first seconds — a
       * figure may settle and draw its threads beneath it; its story
       * takes the whisper once the greeting's beat is done */
      setWhisper('tonight' + (aiTonightSub ? ':ai' : ''), tonightMain, aiTonightSub || tonightSub);
    } else if (fig && P2.alpha > 0.3) {
      var hintOn = !hasVoyaged && P2.activeFor > 7 && P2.activeFor < 17;
      var aiFig = aiFigText[fig.name] || null;
      setWhisper('fig:' + fig.name + (hintOn ? ':h' : aiFig ? ':ai' : ':s'), fig.name,
        hintOn ? 'press and hold — step sideways, off the Earth viewpoint' : (aiFig || fig.story));
    } else if (t < tapFlashUntil) {
      setWhisper('tonight' + (aiTonightSub ? ':ai' : ''), tonightMain, aiTonightSub || tonightSub);
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
    gl.drawArrays(gl.POINTS, 0, geo.count);
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
      tgtC = [acc[0] / wSum, acc[1] / wSum, acc[2] / wSum];
      tgtA = Math.min(0.10, wSum * 0.07);
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
    voyVec = [rgtB[0] * P2.voyage * 115, rgtB[1] * P2.voyage * 115, rgtB[2] * P2.voyage * 115];
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
        rebuildBoost(nextFig);
        ensureFigAi(nextFig);
        if (AU) AU.setRegion(nextFig.name);
      }
      P2.drawFig = nextFig;
      P2.alpha = Math.min(1, P2.alpha + dt * 0.8);
    } else {
      P2.alpha = Math.max(0, P2.alpha - dt * 0.7);
      if (P2.alpha === 0) { P2.activeName = null; P2.drawFig = null; rebuildBoost(null); }
    }
    P2.activeFor = P2.activeName ? t - P2.actT : 0;

    /* sound events (ported) */
    if (AU && P2.drawFig && !P2.chimed && P2.alpha > 0.6 && P2.voyage < 0.2 &&
        t - P2.actT > (P2.drawFig.lines.length - 1) * 0.13 + 0.95) {
      P2.chimed = true;
      AU.figureComplete(P2.drawFig.name);
    }
    if (AU && P2.drawFig && !P2.unravelled && P2.voyage > 0.6) {
      P2.unravelled = true;
      AU.unravel(P2.drawFig.name);
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

  Object.assign(window.__nebula, {
    cam: cam, tonight: tonight, visibleUp: upCount,
    catalogue: catStars.length, fieldStars: shellCount,
    gasPuffs: localGas.puffCount + anchorGas.puffCount,
    camPos: camPos, pass2: P2, audio: AU ? AU.state : null
  });
  window.__nebula.bankNow = function () { return bankCur; };
  window.__nebula.face = function (name) {
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
