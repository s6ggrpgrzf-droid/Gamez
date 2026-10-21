/* Nebula Drift — Pass 1: The Place.
 * A true 3D drift through tonight's sky. No DOM game code beyond the
 * canvas + the whisper line; the sky math lives in sky.js.
 *
 * Rendering rules from the house playbook: clamp dt, prerender every
 * sprite once (no per-frame gradients, no shadowBlur), cap DPR at 2,
 * pause on hidden, seeded randomness only.
 */
'use strict';
(function () {
  var SKY = window.SKY;
  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d');
  var whisperEl = document.getElementById('whisper');
  var whisperMain = document.getElementById('whisperMain');
  var whisperSub = document.getElementById('whisperSub');

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- tonight's sky ---------------- */
  var tonight = SKY.tonightSky(new Date(), SKY.HOME);
  var rng = SKY.mulberry32(20261021);

  /* ---------------- canvas / sizing ---------------- */
  var CW = 0, CH = 0, DPR = 1, bgCanvas = null;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    CW = window.innerWidth; CH = window.innerHeight;
    cv.width = Math.round(CW * DPR); cv.height = Math.round(CH * DPR);
    cv.style.width = CW + 'px'; cv.style.height = CH + 'px';
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = Math.max(2, Math.round(CW / 3)); bgCanvas.height = Math.max(2, Math.round(CH / 3));
    var bctx = bgCanvas.getContext('2d');
    var grad = bctx.createRadialGradient(
      bgCanvas.width * 0.5, bgCanvas.height * 0.42, 10,
      bgCanvas.width * 0.5, bgCanvas.height * 0.5, bgCanvas.height * 0.95);
    grad.addColorStop(0, '#0a1026'); grad.addColorStop(0.45, '#060a1a');
    grad.addColorStop(1, '#02030a');
    bctx.fillStyle = grad; bctx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
  }
  window.addEventListener('resize', resize);

  /* ---------------- prerendered sprites ---------------- */
  function makeCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function rgba(col, a) { return 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + a + ')'; }
  function hexRgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }

  /* soft star point, tinted */
  function starSprite(col) {
    var c = makeCanvas(64, 64), g = c.getContext('2d');
    var grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, rgba(col, 0.95));
    grad.addColorStop(0.45, rgba(col, 0.28));
    grad.addColorStop(1, rgba(col, 0));
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return c;
  }
  /* diffraction spikes for the very brightest stars */
  function spikeSprite(col) {
    var c = makeCanvas(128, 128), g = c.getContext('2d');
    g.translate(64, 64);
    for (var i = 0; i < 2; i++) {
      var lg = g.createLinearGradient(-64, 0, 64, 0);
      lg.addColorStop(0, rgba(col, 0)); lg.addColorStop(0.5, rgba(col, 0.5)); lg.addColorStop(1, rgba(col, 0));
      g.fillStyle = lg; g.fillRect(-64, -1.1, 128, 2.2);
      g.rotate(Math.PI / 2);
    }
    var cg = g.createRadialGradient(0, 0, 0, 0, 0, 20);
    cg.addColorStop(0, 'rgba(255,255,255,0.9)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = cg; g.fillRect(-20, -20, 40, 40);
    return c;
  }

  /* Irregular gas blob: overlapping radial puffs + thin filaments,
   * ragged silhouette (bites erased at the rim), and a radial feather
   * mask so a sprite's edge can never print as a visible circle. */
  function blobSprite(colCore, colMid, colEdge, seed) {
    var r = SKY.mulberry32(seed);
    var c = makeCanvas(256, 256), g = c.getContext('2d');
    g.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 11; i++) {
      var bx = 128 + (r() - 0.5) * 120, by = 128 + (r() - 0.5) * 120;
      var brad = 30 + r() * 66;
      var col = i === 0 ? colCore : (r() < 0.5 ? colMid : colEdge);
      var grad = g.createRadialGradient(bx, by, 0, bx, by, brad);
      grad.addColorStop(0, rgba(col, 0.3)); grad.addColorStop(0.6, rgba(col, 0.11)); grad.addColorStop(1, rgba(col, 0));
      g.fillStyle = grad;
      g.beginPath(); g.arc(bx, by, brad, 0, 6.2832); g.fill();
    }
    for (var fi2 = 0; fi2 < 3; fi2++) {          /* filaments: stretched thin puffs */
      g.save();
      g.translate(128 + (r() - 0.5) * 90, 128 + (r() - 0.5) * 90);
      g.rotate(r() * 3.14); g.scale(1, 0.22 + r() * 0.12);
      var fg = g.createRadialGradient(0, 0, 0, 0, 0, 62 + r() * 40);
      fg.addColorStop(0, rgba(colCore, 0.16)); fg.addColorStop(1, rgba(colCore, 0));
      g.fillStyle = fg;
      g.beginPath(); g.arc(0, 0, 102, 0, 6.2832); g.fill();
      g.restore();
    }
    g.globalCompositeOperation = 'destination-out';
    for (var bi = 0; bi < 4; bi++) {            /* ragged rim bites */
      var ang = r() * 6.283, bd = 96 + r() * 26;
      var ex = 128 + Math.cos(ang) * bd, ey = 128 + Math.sin(ang) * bd, er = 22 + r() * 34;
      var eg = g.createRadialGradient(ex, ey, 0, ex, ey, er);
      eg.addColorStop(0, 'rgba(0,0,0,0.75)'); eg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = eg;
      g.beginPath(); g.arc(ex, ey, er, 0, 6.2832); g.fill();
    }
    var mask = g.createRadialGradient(128, 128, 60, 128, 128, 128);
    mask.addColorStop(0, 'rgba(0,0,0,0)'); mask.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = mask; g.fillRect(0, 0, 256, 256);
    return c;
  }
  function dustSprite(seed) {
    var r = SKY.mulberry32(seed);
    var c = makeCanvas(256, 256), g = c.getContext('2d');
    for (var i = 0; i < 5; i++) {
      var bx = 128 + (r() - 0.5) * 90, by = 128 + (r() - 0.5) * 90, brad = 34 + r() * 55;
      var grad = g.createRadialGradient(bx, by, 0, bx, by, brad);
      grad.addColorStop(0, 'rgba(1,1,5,0.55)'); grad.addColorStop(1, 'rgba(1,1,5,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(bx, by, brad, 0, 6.2832); g.fill();
    }
    return c;
  }

  var PALETTES = {
    rose:     ['#ff8fab', '#e8487a', '#6e1d47'],
    teal:     ['#8ff0e2', '#2bb3a3', '#0b5560'],
    gold:     ['#ffe1a1', '#eda854', '#7a4a1f'],
    pearl:    ['#eef2ff', '#b3c2e8', '#54648f'],
    blue:     ['#a9c8ff', '#5f8ce8', '#22397a'],
    tealrose: ['#8ff0e2', '#e8487a', '#123f5e'],
    tealgold: ['#8ff0e2', '#eda854', '#0b5560'],
    goldrose: ['#ffe1a1', '#e8487a', '#7a4a1f']
  };
  var blobSprites = {};   /* palette -> [3 variants] */
  Object.keys(PALETTES).forEach(function (key, ki) {
    var p = PALETTES[key];
    blobSprites[key] = [0, 1, 2].map(function (v) {
      return blobSprite(hexRgb(p[0]), hexRgb(p[1]), hexRgb(p[2]), 5000 + ki * 131 + v * 17);
    });
  });
  var dustSprites = [dustSprite(9101), dustSprite(9207)];
  var specSprites = {}, specSpikes = {};
  ['O', 'B', 'A', 'F', 'G', 'K', 'M'].forEach(function (k) {
    specSprites[k] = starSprite(SKY.spectralColor(k));
    specSpikes[k] = spikeSprite(SKY.spectralColor(k));
  });

  /* ---------------- scene construction ---------------- */
  function tangentBasis(dir) {
    var up = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    var tx = up[1] * dir[2] - up[2] * dir[1], ty = up[2] * dir[0] - up[0] * dir[2], tz = up[0] * dir[1] - up[1] * dir[0];
    var tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    return { t1: [tx, ty, tz], t2: [ty * dir[2] - tz * dir[1], tz * dir[0] - tx * dir[2], tx * dir[1] - ty * dir[0]] };
  }

  /* field stars: directions on the whole celestial sphere */
  function faintCss(spec, a) {
    var c = SKY.spectralColor(spec);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  var fieldStars = [];
  (function buildField() {
    var r = SKY.mulberry32(777);
    for (var i = 0; i < 1500; i++) {
      var u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      var mag = 4.6 + Math.pow(r(), 1.7) * 3.6;      /* shaped: few bright, many faint */
      var sp = SKY.fieldSpec(r());
      fieldStars.push({
        dir: [s * Math.cos(th), u, s * Math.sin(th)], mag: mag,
        spec: sp, ph: r() * 6.283, tw: 0.3 + r() * 0.8, css: faintCss(sp, 0.5)
      });
    }
    /* the Milky Way: a dense faint river along the galactic plane.
     * North galactic pole at RA 12h51m, Dec +27.1 (real). */
    var lstNow = tonight.lst;
    var pole = SKY.dirFromRaDec(12.857, 27.13, SKY.HOME.lat, lstNow);
    var node = SKY.dirFromRaDec(18.857, 0, SKY.HOME.lat, lstNow); /* near galactic centre direction */
    var bx = node, bz = pole;
    var by = [bz[1] * bx[2] - bz[2] * bx[1], bz[2] * bx[0] - bz[0] * bx[2], bz[0] * bx[1] - bz[1] * bx[0]];
    var byl = Math.hypot(by[0], by[1], by[2]) || 1; by = [by[0] / byl, by[1] / byl, by[2] / byl];
    var bx2 = [by[1] * bz[2] - by[2] * bz[1], by[2] * bz[0] - by[0] * bz[2], by[0] * bz[1] - by[1] * bz[0]];
    for (var m = 0; m < 1400; m++) {
      var lon = r() * Math.PI * 2;
      var latG = ((r() + r() + r()) / 3 - 0.5) * 0.42;   /* concentrated near the plane */
      var cl = Math.cos(latG);
      var gd = [
        cl * Math.cos(lon) * bx2[0] + cl * Math.sin(lon) * by[0] + Math.sin(latG) * bz[0],
        cl * Math.cos(lon) * bx2[1] + cl * Math.sin(lon) * by[1] + Math.sin(latG) * bz[1],
        cl * Math.cos(lon) * bx2[2] + cl * Math.sin(lon) * by[2] + Math.sin(latG) * bz[2]
      ];
      var gl = Math.hypot(gd[0], gd[1], gd[2]) || 1;
      var msp = SKY.fieldSpec(r());
      fieldStars.push({
        dir: [gd[0] / gl, gd[1] / gl, gd[2] / gl], mag: 6.4 + r() * 2.6,
        spec: msp, ph: r() * 6.283, tw: 0.3 + r() * 0.8, mw: true, css: faintCss(msp, 0.34)
      });
    }
  })();

  /* catalogue stars, as placed for tonight — each at a depth from its
   * real distance (log-scaled), so a sideways step shears them truly. */
  function depthFor(dist) { return 120 + Math.log(dist || 400) * 48; }
  var catByName = {};
  var catStars = tonight.stars.map(function (s, sIdx) {
    var csObj = {
      dir: s.dir, mag: s.mag, spec: s.spec.charAt(0), name: s.name, dist: s.dist,
      pos: [s.dir[0] * depthFor(s.dist), s.dir[1] * depthFor(s.dist), s.dir[2] * depthFor(s.dist)],
      ph: rng() * 6.283, tw: 0.25 + rng() * 0.6, _vis: false, _sx: 0, _sy: 0, fig: null
    };
    catByName[s.name] = sIdx;
    return csObj;
  });
  var upCount = tonight.stars.filter(function (s) { return s.alt > 0; }).length;

  /* figures resolved against tonight's placed stars */
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

  /* Pass 2 state: the active figure + the voyage (Earth-viewpoint offset) */
  var P2 = { activeName: null, drawFig: null, alpha: 0, actT: 0, activeFor: 0, voyage: 0, voyageTarget: 0, engaged: false };
  var hasVoyaged = false;
  try { hasVoyaged = !!window.localStorage.getItem('nd-voyaged'); } catch (e) { /* private mode */ }

  /* nebula complexes: layered sprites along each anchor's real direction */
  var nebSprites = [];
  tonight.nebulae.forEach(function (neb, ni) {
    if (neb.alt < -6) return;                 /* not part of tonight's sky at all */
    var basis = tangentBasis(neb.dir);
    var layers = neb.kind === 'cluster' ? 3 : 6;
    var dist0 = 300 + rng() * 120;
    for (var li = 0; li < layers; li++) {
      var dist = dist0 + li * 46 + rng() * 26;
      var j1 = (rng() - 0.5) * neb.size * 26, j2 = (rng() - 0.5) * neb.size * 26;
      var pos = [
        neb.dir[0] * dist + basis.t1[0] * j1 + basis.t2[0] * j2,
        neb.dir[1] * dist + basis.t1[1] * j1 + basis.t2[1] * j2,
        neb.dir[2] * dist + basis.t1[2] * j1 + basis.t2[2] * j2
      ];
      nebSprites.push({
        pos: pos, size: neb.size * (95 + rng() * 85), rot: rng() * 6.283,
        spr: blobSprites[neb.palette][Math.floor(rng() * 3)],
        alpha: neb.kind === 'cluster' ? 0.10 + rng() * 0.06 : 0.075 + rng() * 0.075,
        ph: rng() * 6.283
      });
      if (neb.kind === 'emission' && li === 2) {   /* one dark dust lane per big cloud */
        nebSprites.push({
          pos: [pos[0] + basis.t1[0] * 14, pos[1] + basis.t1[1] * 14, pos[2] + basis.t1[2] * 14],
          size: neb.size * 82, rot: rng() * 6.283,
          spr: dustSprites[ni % 2], alpha: 0.5, dust: true, ph: 0
        });
      }
    }
  });

  /* near-camera gas motes: the volume you actually move through */
  var MOTES = 170, moteBox = 300;
  var motes = [];
  (function buildMotes() {
    var r = SKY.mulberry32(4242);
    var cols = [[255, 143, 171], [143, 240, 226], [255, 225, 161], [238, 242, 255]];
    for (var i = 0; i < MOTES; i++) {
      motes.push({
        p: [(r() - 0.5) * moteBox * 2, (r() - 0.5) * moteBox * 2, (r() - 0.5) * moteBox * 2],
        s: 14 + r() * 46, col: cols[Math.floor(r() * cols.length)], a: 0.016 + r() * 0.03,
        spr: blobSprites[['rose', 'teal', 'gold', 'pearl'][Math.floor(r() * 4)]][Math.floor(r() * 3)]
      });
    }
  })();

  /* ---------------- camera ---------------- */
  function dirToAzAlt(d) { return { az: Math.atan2(d[0], -d[2]), alt: Math.asin(Math.max(-1, Math.min(1, d[1]))) }; }
  var deneb = tonight.stars.filter(function (s) { return s.name === 'Deneb'; })[0];
  var vega = tonight.stars.filter(function (s) { return s.name === 'Vega'; })[0];
  var startDir = [0, 0, -1];
  if (deneb && vega) {
    startDir = [deneb.dir[0] + vega.dir[0] * 0.7, deneb.dir[1] + vega.dir[1] * 0.7, deneb.dir[2] + vega.dir[2] * 0.7];
    var sl = Math.hypot(startDir[0], startDir[1], startDir[2]); startDir = [startDir[0] / sl, startDir[1] / sl, startDir[2] / sl];
  }
  var startAA = dirToAzAlt(startDir);
  var cam = { az: startAA.az, alt: startAA.alt, vaz: 0, valt: 0 };
  var baseAz = cam.az, baseAlt = cam.alt;
  var camPos = [0, 0, 0];

  /* ---------------- input: drag to look, tap for the whisper ---------------- */
  var pointers = new Map();
  var lastTouchAt = -30, downAt = 0, downX = 0, downY = 0, movedPx = 0, downStamp = 0;
  cv.addEventListener('pointerdown', function (e) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) { downAt = performance.now(); downStamp = downAt; downX = e.clientX; downY = e.clientY; movedPx = 0; }
    lastTouchAt = perfNow();
    try { cv.setPointerCapture && cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic / already-released pointer */ }
  });
  cv.addEventListener('pointermove', function (e) {
    if (!pointers.has(e.pointerId)) return;
    var prev = pointers.get(e.pointerId);
    var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size !== 1) return;
    if (P2.engaged) return;   /* holding still = the voyage; moves do not steer it */
    movedPx += Math.abs(dx) + Math.abs(dy);
    var k = 0.0028;
    cam.az += dx * k; cam.alt += dy * k;
    cam.vaz = dx * k * 60; cam.valt = dy * k * 60;
    lastTouchAt = perfNow();
  });
  function endPointer(e) {
    var wasTap = pointers.size === 1 && (performance.now() - downAt) < 350 && movedPx < 9;
    pointers.delete(e.pointerId);
    if (P2.engaged) { P2.engaged = false; P2.voyageTarget = 0; }   /* release: glide home */
    lastTouchAt = perfNow();
    if (wasTap) showWhisper(5000);
  }
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);
  window.addEventListener('blur', function () {
    pointers.clear(); cam.vaz = 0; cam.valt = 0;
    P2.engaged = false; P2.voyageTarget = 0;
  });

  /* ---------------- whisper ----------------
   * One quiet line, state-driven: a dissolved figure speaks first, then
   * a settled figure (its story, or the voyage hint until you've taken
   * one), then tonight's line at open / on tap. Otherwise, silence. */
  var dateStr = tonight.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  var tonightMain = 'Tonight · ' + dateStr + ' · the sky over ' + SKY.HOME.name;
  var tonightSub = 'drag to look — it drifts on its own';
  var tapFlashUntil = 9;   /* tonight's line greets you, then fades */
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
    if (fig && P2.alpha > 0.3 && P2.voyage > 0.35) {
      setWhisper('dis:' + fig.name, fig.name + ', dissolved',
        fig.near.name + ' is ' + fmtDist(fig.near.dist) + ' light-years away · ' +
        fig.far.name + ' is ' + fmtDist(fig.far.dist) + ' — the shape only exists from home');
    } else if (fig && P2.alpha > 0.3) {
      var hintOn = !hasVoyaged && P2.activeFor > 7 && P2.activeFor < 17;
      setWhisper('fig:' + fig.name + (hintOn ? ':h' : ':s'), fig.name,
        hintOn ? 'press and hold — step sideways, off the Earth viewpoint' : fig.story);
    } else if (t < tapFlashUntil) {
      setWhisper('tonight', tonightMain, tonightSub);
    } else {
      setWhisper('none', null);
    }
  }

  /* ---------------- shooting star (rare, quiet) ---------------- */
  var meteor = null, nextMeteor = 18 + rng() * 25;

  /* ---------------- main loop ---------------- */
  var raf = 0, lastT = 0, elapsed = 0, quality = 1, slowFrames = 0;
  function perfNow() { return elapsed; }

  function frame(nowMs) {
    raf = requestAnimationFrame(frame);
    var now = nowMs / 1000;
    var dt = Math.min(now - (lastT || now), 0.1); lastT = now;
    elapsed += dt;
    var t = elapsed;

    /* adaptive quality: if frames run long, thin the faint field out */
    if (dt > 0.026) { if (++slowFrames > 50 && quality > 0.4) { quality -= 0.3; slowFrames = 0; } }
    else if (slowFrames > 0) slowFrames--;

    /* camera: user glide, else the slow tour after 20 s idle */
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

    /* the voyage: a still press-and-hold steps the viewpoint sideways;
     * release glides it home. Slow on purpose — this is a drift, not a dash. */
    if (pointers.size === 1 && !P2.engaged && movedPx < 10 && performance.now() - downStamp > 450) P2.engaged = true;
    if (P2.engaged) P2.voyageTarget = 1;
    P2.voyage += (P2.voyageTarget - P2.voyage) * Math.min(1, dt * 1.05);
    if (P2.voyage > 0.5 && !hasVoyaged) {
      hasVoyaged = true;
      try { window.localStorage.setItem('nd-voyaged', '1'); } catch (e) { /* private mode */ }
    }

    /* the drift: a slow sway inside the nebula, never a journey */
    if (!reduced) {
      camPos = [Math.sin(t * 0.011) * 26, Math.sin(t * 0.0073 + 1.7) * 13, Math.cos(t * 0.0091) * 26];
    }

    /* camera basis */
    var cosA = Math.cos(cam.az), sinA = Math.sin(cam.az), cosH = Math.cos(cam.alt), sinH = Math.sin(cam.alt);
    var fwd = [cosH * sinA, sinH, -cosH * cosA];
    var rgt = [cosA, 0, sinA];
    var upv = [-sinH * sinA, cosH, sinH * cosA];
    var focal = (CH * DPR / 2) / Math.tan(0.594);   /* ~68 deg vertical fov */
    var cxp = CW * DPR / 2, cyp = CH * DPR / 2;
    var breathe = reduced ? 1 : 0.88 + 0.12 * Math.sin(t * 0.924);  /* ~6.8 s breath */

    /* the render viewpoint: sway position + the voyage's sideways step */
    var voyOff = P2.voyage * 115;
    var rendCam = [
      camPos[0] + rgt[0] * voyOff, camPos[1] + rgt[1] * voyOff, camPos[2] + rgt[2] * voyOff
    ];

    /* figure detection: nearest figure whose centre has settled into
     * view, with hysteresis so figures don't flicker at the edge */
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
      if (nextFig.name !== P2.activeName) { P2.activeName = nextFig.name; P2.actT = t; }
      P2.drawFig = nextFig;
      P2.alpha = Math.min(1, P2.alpha + dt * 0.8);
    } else {
      P2.alpha = Math.max(0, P2.alpha - dt * 0.7);
      if (P2.alpha === 0) { P2.activeName = null; P2.drawFig = null; }
    }
    P2.activeFor = P2.activeName ? t - P2.actT : 0;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(bgCanvas, 0, 0, CW * DPR, CH * DPR);

    function projectDir(d) {
      var cz = d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2];
      if (cz < 0.08) return null;
      var cx = d[0] * rgt[0] + d[1] * rgt[1] + d[2] * rgt[2];
      var cy = d[0] * upv[0] + d[1] * upv[1] + d[2] * upv[2];
      return [cxp + focal * cx / cz, cyp - focal * cy / cz, cz];
    }
    function projectPos(p) {
      var rx = p[0] - rendCam[0], ry = p[1] - rendCam[1], rz = p[2] - rendCam[2];
      var cz = rx * fwd[0] + ry * fwd[1] + rz * fwd[2];
      if (cz < 6) return null;
      var cx = rx * rgt[0] + ry * rgt[1] + rz * rgt[2];
      var cy = rx * upv[0] + ry * upv[1] + rz * upv[2];
      return [cxp + focal * cx / cz, cyp - focal * cy / cz, cz];
    }

    /* faint field + Milky Way river: bright ones get a soft sprite,
     * the faint majority are honest points (fillRect, no image sampling) */
    ctx.globalCompositeOperation = 'lighter';
    var step = quality >= 0.95 ? 1 : (quality >= 0.65 ? 2 : 3);
    ctx.globalAlpha = 1;
    for (var fi = 0; fi < fieldStars.length; fi += step) {
      var fs = fieldStars[fi];
      var fp = projectDir(fs.dir);
      if (!fp) continue;
      if (!fs.mw && fs.mag < 5.7) {
        var bsz = (8.5 - (fs.mag - 4.6) * 1.15) * DPR * 0.62;
        ctx.globalAlpha = 0.36 * (0.85 + 0.15 * Math.sin(t * fs.tw + fs.ph));
        ctx.drawImage(specSprites[fs.spec], fp[0] - bsz / 2, fp[1] - bsz / 2, bsz, bsz);
        ctx.globalAlpha = 1;
      } else {
        var psz = (fs.mw ? 1.35 : 1.7) * DPR;
        ctx.fillStyle = fs.css;
        ctx.fillRect(fp[0] - psz / 2, fp[1] - psz / 2, psz, psz);
      }
    }

    /* nebula complexes, far to near */
    nebSprites.sort(function (a, b) {
      var da = (a.pos[0] - rendCam[0]) * fwd[0] + (a.pos[1] - rendCam[1]) * fwd[1] + (a.pos[2] - rendCam[2]) * fwd[2];
      var db = (b.pos[0] - rendCam[0]) * fwd[0] + (b.pos[1] - rendCam[1]) * fwd[1] + (b.pos[2] - rendCam[2]) * fwd[2];
      return db - da;
    });
    for (var ni2 = 0; ni2 < nebSprites.length; ni2++) {
      var ns = nebSprites[ni2];
      var np = projectPos(ns.pos);
      if (!np) continue;
      var nsz = focal * ns.size / np[2];
      if (nsz < 8 || nsz > 2600) continue;
      /* a cloud that fills the sky should read as atmosphere, not as a
       * lampshade: the bigger it looms, the thinner it gets */
      var bigFade = nsz > 850 ? Math.max(0.3, 850 / nsz) : 1;
      ctx.globalCompositeOperation = ns.dust ? 'source-over' : 'lighter';
      ctx.globalAlpha = (ns.dust ? ns.alpha : ns.alpha * breathe * (0.9 + 0.1 * Math.sin(t * 0.5 + ns.ph))) * bigFade;
      ctx.drawImage(ns.spr, np[0] - nsz / 2, np[1] - nsz / 2, nsz, nsz);
    }

    /* catalogue stars shine through the gas — now at true finite depth,
     * so the voyage's sideways step shears them against each other */
    for (var ci = 0; ci < catStars.length; ci++) {
      var cs = catStars[ci];
      var cp = projectPos(cs.pos);
      if (!cp) { cs._vis = false; continue; }
      cs._vis = true; cs._sx = cp[0]; cs._sy = cp[1];
      var csz = (15.5 - cs.mag * 2.6) * DPR;
      if (csz < 3.4) csz = 3.4;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.95 * (0.88 + 0.12 * Math.sin(t * cs.tw + cs.ph));
      var cspr = specSprites[cs.spec];
      ctx.drawImage(cspr, cp[0] - csz / 2, cp[1] - csz / 2, csz, csz);
      if (cs.mag <= 1.3) {
        var ssz = csz * 6.4;
        ctx.globalAlpha = 0.5;
        ctx.drawImage(specSpikes[cs.spec], cp[0] - ssz / 2, cp[1] - ssz / 2, ssz, ssz);
      }
      if (P2.drawFig && cs.fig === P2.drawFig) {   /* the settled figure's stars breathe brighter —
          and as the voyage kills the threads, the scattered stars themselves keep the glow */
        var bsz2 = csz * 2.2;
        ctx.globalAlpha = (0.16 + P2.voyage * 0.3) * P2.alpha;
        ctx.drawImage(cspr, cp[0] - bsz2 / 2, cp[1] - bsz2 / 2, bsz2, bsz2);
      }
    }

    /* the threads of light: drawn on segment by segment when a figure
     * settles — and the first casualty of the voyage, thinning to
     * nothing as the viewpoint leaves home */
    if (P2.drawFig && P2.alpha > 0.02) {
      var threadFig = P2.drawFig;
      var threadA = P2.alpha * Math.max(0, 1 - P2.voyage * 1.5);
      if (threadA > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (var sgi = 0; sgi < threadFig.lines.length; sgi++) {
          var segPair = threadFig.lines[sgi];
          var segA = catStars[segPair[0]], segB = catStars[segPair[1]];
          if (!segA._vis || !segB._vis) continue;
          var segProg = Math.max(0, Math.min(1, (t - P2.actT - sgi * 0.13) / 0.75));
          if (segProg <= 0) continue;
          var segEx = segA._sx + (segB._sx - segA._sx) * segProg;
          var segEy = segA._sy + (segB._sy - segA._sy) * segProg;
          ctx.strokeStyle = 'rgba(255,238,205,' + (0.10 * threadA * segProg).toFixed(3) + ')';
          ctx.lineWidth = 3.4 * DPR;
          ctx.beginPath(); ctx.moveTo(segA._sx, segA._sy); ctx.lineTo(segEx, segEy); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,246,224,' + (0.6 * threadA * segProg).toFixed(3) + ')';
          ctx.lineWidth = 1.1 * DPR;
          ctx.beginPath(); ctx.moveTo(segA._sx, segA._sy); ctx.lineTo(segEx, segEy); ctx.stroke();
        }
      }
    }

    /* near gas motes streaming gently past */
    for (var mi = 0; mi < motes.length; mi++) {
      var mo = motes[mi];
      var mp = [mo.p[0], mo.p[1], mo.p[2]];
      for (var ax = 0; ax < 3; ax++) {
        var rel = mp[ax] - camPos[ax];
        rel = ((rel + moteBox) % (moteBox * 2) + moteBox * 2) % (moteBox * 2) - moteBox;
        mp[ax] = camPos[ax] + rel;
      }
      var mpp = projectPos(mp);
      if (!mpp) continue;
      var msz = focal * mo.s / mpp[2];
      if (msz < 6 || msz > 1500) continue;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = mo.a * breathe;
      ctx.drawImage(mo.spr, mpp[0] - msz / 2, mpp[1] - msz / 2, msz, msz);
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
        var head = [
          meteor.from[0] + meteor.vel[0] * mt * 0.5,
          meteor.from[1] + meteor.vel[1] * mt * 0.5,
          meteor.from[2] + meteor.vel[2] * mt * 0.5
        ];
        var hl = Math.hypot(head[0], head[1], head[2]); head = [head[0] / hl, head[1] / hl, head[2] / hl];
        var tail = [head[0] - meteor.vel[0] * 0.07, head[1] - meteor.vel[1] * 0.07, head[2] - meteor.vel[2] * 0.07];
        var hp = projectDir(head), tp = projectDir(tail);
        if (hp && tp) {
          var mgrad = ctx.createLinearGradient(tp[0], tp[1], hp[0], hp[1]);
          var ma = Math.sin(mt * Math.PI) * 0.75;
          mgrad.addColorStop(0, 'rgba(220,232,255,0)');
          mgrad.addColorStop(1, 'rgba(230,240,255,' + ma + ')');
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 1;
          ctx.strokeStyle = mgrad; ctx.lineWidth = 1.6 * DPR;
          ctx.beginPath(); ctx.moveTo(tp[0], tp[1]); ctx.lineTo(hp[0], hp[1]); ctx.stroke();
        }
      }
    }

    ctx.globalAlpha = 1;
    updateWhisper(t);
    window.__nebula.frameCount++;
  }

  /* ---------------- boot ---------------- */
  window.__nebula = {
    ready: false, frameCount: 0, cam: cam, tonight: tonight,
    visibleUp: upCount, nebulaSprites: nebSprites.length,
    fieldStars: fieldStars.length, catalogue: catStars.length,
    pass2: P2
  };
  /* test/inspection hook: aim the camera at a figure's centre */
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
    if (document.hidden) { cancelAnimationFrame(raf); lastT = 0; }
    else { raf = requestAnimationFrame(frame); }
  });
})();
