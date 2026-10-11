/* ============================================================================
 * Fernwild art — storybook canvas rendering. All sprites are pre-rendered
 * to offscreen canvases once (variants keyed by type+stage+variant), then
 * blitted. Per-tile hash jitter keeps the forest from looking stamped.
 * ========================================================================== */
'use strict';
var FArt = (function () {
  var cache = {};
  var S = 128; /* sprite supersample size */

  function hash(x, y) {
    var h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >> 13)) | 0; h = Math.imul(h, 1274126177);
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  }
  function mk() { var c = document.createElement('canvas'); c.width = c.height = S; return [c, c.getContext('2d')]; }
  function get(key, draw) {
    if (!cache[key]) { var m = mk(); draw(m[1]); cache[key] = m[0]; }
    return cache[key];
  }
  function ell(g, x, y, rx, ry, fill) {
    g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 6.2832); g.fill();
  }

  /* ---------- trees ---------- */
  function canopy(g, cx, cy, r, c1, c2, c3, seed) {
    var blobs = 7;
    for (var i = 0; i < blobs; i++) {
      var a = (i / blobs) * 6.2832 + seed;
      var bx = cx + Math.cos(a) * r * 0.55, by = cy + Math.sin(a) * r * 0.42;
      var br = r * (0.52 + hash(i, seed * 97 | 0) * 0.22);
      ell(g, bx, by, br, br * 0.88, i % 3 === 0 ? c3 : (i % 3 === 1 ? c1 : c2));
    }
    /* dappled light */
    for (var j = 0; j < 9; j++) {
      var h1 = hash(j * 3, seed), h2 = hash(j * 7 + 1, seed * 3 | 0);
      ell(g, cx - r * 0.5 + h1 * r, cy - r * 0.45 + h2 * r * 0.7, r * 0.13, r * 0.1, 'rgba(255,244,200,0.20)');
    }
  }
  function trunk(g, cx, baseY, w, h, col) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(cx - w / 2, baseY); g.lineTo(cx - w * 0.32, baseY - h);
    g.lineTo(cx + w * 0.32, baseY - h); g.lineTo(cx + w / 2, baseY);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx - w * 0.18, baseY - 4); g.lineTo(cx - w * 0.1, baseY - h + 6); g.stroke();
  }
  var TREE_STYLE = {
    pine:  { trunk: '#4e3823', c1: '#2e6b34', c2: '#3a7d40', c3: '#245427', pine: true },
    berry: { trunk: '#54402a', c1: '#4d8a44', c2: '#5d9a4e', c3: '#3c6e36', berry: true },
    oak:   { trunk: '#5d4227', c1: '#3a7a38', c2: '#4c8c42', c3: '#2c5e2e', oak: true },
    aspen: { trunk: '#d9d4c2', c1: '#69a854', c2: '#7dbc60', c3: '#54853f', aspen: true }
  };
  function tree(type, stage, v, burnt, season, variant) {
    season = (season == null ? 1 : season) % 4;
    variant = variant || '';
    return get('tree' + type + stage + 'v' + (v % 3) + (burnt ? 'b' : '') + 's' + season + variant, function (g) {
      var st = TREE_STYLE[type], cx = S / 2, baseY = S - 14;
      var j = hash(v, stage) - 0.5;
      /* seasonal palette */
      var c1 = st.c1, c2 = st.c2, c3 = st.c3;
      var bare = (season === 3 && !st.pine && !burnt);   /* winter: deciduous lose leaves */
      var snowy = (season === 3 && st.pine && !burnt);
      if (!burnt && !bare) {
        if (variant === 'golden') { c1 = '#d8a93b'; c2 = '#e8c04b'; c3 = '#b8862e'; }
        else if (variant === 'rainbow') { c1 = '#7fb069'; c2 = '#e88ca0'; c3 = '#6aa8d8'; }
        else if (season === 2 && !st.pine) { c1 = '#c97a2e'; c2 = '#d89a3b'; c3 = '#a85a24'; }
        else if (season === 0 && !st.pine) { c1 = '#5da34f'; c2 = '#6fb45a'; c3 = '#4a8a42'; }
      }
      function snowCap(x, y, w) {
        ell(g, x, y, w, w * 0.32, 'rgba(240,246,250,0.92)');
      }
      function bareBranches(bx, by, hgt, seed) {
        g.strokeStyle = st.trunk; g.lineCap = 'round';
        for (var b = 0; b < 5; b++) {
          var ang = -Math.PI / 2 + (b - 2) * 0.42 + (hash(b, seed) - 0.5) * 0.2;
          var len = hgt * (0.5 + hash(b * 3, seed) * 0.3);
          var x2 = bx + Math.cos(ang) * len, y2 = by - hgt * 0.35 + Math.sin(ang) * len;
          g.lineWidth = 5 - b * 0.5;
          g.beginPath(); g.moveTo(bx, by - hgt * 0.3); g.lineTo(x2, y2); g.stroke();
          for (var t = 0; t < 3; t++) {
            var ta = ang + (hash(t, b * 7 + seed) - 0.5) * 1.2;
            g.lineWidth = 2;
            g.beginPath(); g.moveTo(x2, y2);
            g.lineTo(x2 + Math.cos(ta) * len * 0.35, y2 + Math.sin(ta) * len * 0.35); g.stroke();
          }
        }
        if (season === 3) { /* snow dusting on branches */
          g.fillStyle = 'rgba(240,246,250,0.8)';
          for (var sb = 0; sb < 5; sb++) {
            var sang = -Math.PI / 2 + (sb - 2) * 0.42;
            ell(g, bx + Math.cos(sang) * hgt * 0.3, by - hgt * 0.35 + Math.sin(sang) * hgt * 0.3, 7, 3, 'rgba(240,246,250,0.8)');
          }
        }
      }
      function aspenBark(bx, by, w, h) {
        /* white bark with dark knots */
        g.fillStyle = '#d9d4c2';
        g.beginPath();
        g.moveTo(bx - w / 2, by); g.lineTo(bx - w * 0.32, by - h);
        g.lineTo(bx + w * 0.32, by - h); g.lineTo(bx + w / 2, by);
        g.closePath(); g.fill();
        g.fillStyle = 'rgba(50,45,35,0.55)';
        for (var kn = 0; kn < 4; kn++) {
          var ky = by - 8 - kn * (h / 4.5);
          ell(g, bx + (hash(kn, v) - 0.5) * w * 0.4, ky, w * 0.13, w * 0.09, 'rgba(50,45,35,0.55)');
        }
      }
      if (stage === 1) { /* seed: little mound + seed */
        ell(g, cx, baseY - 6, 16, 7, 'rgba(0,0,0,0.18)');
        ell(g, cx + j * 8, baseY - 12, 6, 8, '#8a6b42');
        ell(g, cx + j * 8 - 2, baseY - 14, 2.5, 3.5, 'rgba(255,240,210,0.5)');
      } else if (stage === 2) { /* sprout */
        g.strokeStyle = '#4d8a44'; g.lineWidth = 5; g.lineCap = 'round';
        g.beginPath(); g.moveTo(cx, baseY); g.quadraticCurveTo(cx + j * 10, baseY - 22, cx + j * 6, baseY - 34); g.stroke();
        ell(g, cx + j * 6 - 9, baseY - 34, 10, 6.5, '#5da34f');
        ell(g, cx + j * 6 + 9, baseY - 30, 10, 6.5, '#4d8a44');
      } else if (stage === 3) { /* sapling */
        if (st.aspen) aspenBark(cx, baseY, 12, 34); else trunk(g, cx, baseY, 13, 34, st.trunk);
        if (bare) bareBranches(cx, baseY, 52, v);
        else if (st.pine) {
          for (var i = 0; i < 3; i++) {
            var w = 44 - i * 11, y = baseY - 30 - i * 20;
            g.fillStyle = [c3, c1, c2][i];
            g.beginPath(); g.moveTo(cx - w / 2, y); g.lineTo(cx, y - 22); g.lineTo(cx + w / 2, y); g.closePath(); g.fill();
            if (snowy) snowCap(cx, y - 20, w * 0.28);
          }
        } else canopy(g, cx, baseY - 52, 30, c1, c2, c3, v);
        if (!bare && season === 0 && !st.pine) { /* spring blossom */
          for (var bl = 0; bl < 6; bl++)
            ell(g, cx - 22 + hash(bl, v * 3) * 44, baseY - 66 + hash(bl * 7, v) * 30, 3.4, 3.4,
              bl % 2 ? '#f2c9d4' : '#fbeef2');
        }
        if (!bare && variant === 'rainbow') {
          var rcols = ['#e88ca0', '#f2d06b', '#6aa8d8', '#b08cd8'];
          for (var rb = 0; rb < 8; rb++)
            ell(g, cx - 24 + hash(rb, v * 5) * 48, baseY - 68 + hash(rb * 11, v) * 34, 3.6, 3.6, rcols[rb % 4]);
        }
        if (st.berry) for (var b = 0; b < 4; b++) {
          ell(g, cx - 18 + hash(b, v) * 36, baseY - 60 + hash(b * 3, v) * 26, 4, 4, '#c94f5e');
        }
      } else if (stage === 4 || stage === 5) { /* adult / ancient */
        var big = stage === 5 ? 1.18 : 1;
        if (st.aspen) aspenBark(cx, baseY, 19 * big, 62, v); else trunk(g, cx, baseY, 20 * big, 62, st.trunk);
        if (bare) bareBranches(cx, baseY, 110 * big, v + stage);
        else if (st.pine) {
          for (var k = 0; k < 4; k++) {
            var w2 = (62 - k * 12) * big, y2 = baseY - 52 - k * 24;
            g.fillStyle = [c3, c1, c2, c1][k];
            g.beginPath(); g.moveTo(cx - w2 / 2, y2); g.lineTo(cx + j * 6, y2 - 30 * big); g.lineTo(cx + w2 / 2, y2); g.closePath(); g.fill();
            if (snowy) snowCap(cx + j * 6, y2 - 28 * big, w2 * 0.24);
          }
        } else {
          canopy(g, cx + j * 8, baseY - 92 * big, 46 * big, c1, c2, c3, v + stage);
          canopy(g, cx - 26 + j * 8, baseY - 66, 26, c2, c3, c1, v + 40);
          if (season === 0) { /* spring blossom */
            for (var bl2 = 0; bl2 < 10; bl2++)
              ell(g, cx - 40 + hash(bl2, v * 3) * 80, baseY - 120 + hash(bl2 * 7, v) * 70, 3.6, 3.6,
                bl2 % 2 ? '#f2c9d4' : '#fbeef2');
          }
          if (variant === 'rainbow') {
            var rcols2 = ['#e88ca0', '#f2d06b', '#6aa8d8', '#b08cd8'];
            for (var rb2 = 0; rb2 < 14; rb2++)
              ell(g, cx - 42 + hash(rb2, v * 5) * 84, baseY - 122 + hash(rb2 * 11, v) * 72, 4, 4, rcols2[rb2 % 4]);
          }
        }
        if (st.berry && !bare) for (var f = 0, fmax = variant === 'bloom' ? 18 : 10; f < fmax; f++) {
          var fx = cx - 34 + hash(f, v * 2) * 68, fy = baseY - 118 + hash(f * 5, v) * 66;
          var bcol = variant === 'bloom' ? (f % 2 ? '#f2b8d0' : '#fbeef2') : '#e8e4da';
          ell(g, fx, fy, 5.5, 5.5, bcol);           /* blossom */
          ell(g, fx, fy, 2.4, 2.4, '#e9a13b');
        }
        if (stage === 5) { /* ancient: hanging moss + gnarl */
          g.strokeStyle = 'rgba(140,170,120,0.75)'; g.lineWidth = 3;
          for (var mI = 0; mI < 6; mI++) {
            var mx = cx - 34 + hash(mI, v * 7) * 68;
            g.beginPath(); g.moveTo(mx, baseY - 110); g.quadraticCurveTo(mx + 4, baseY - 92, mx - 2, baseY - 78); g.stroke();
          }
        }
      } else if (stage === 6) { /* fallen trunk */
        g.save(); g.translate(cx, baseY - 16); g.rotate(-0.06 + j * 0.08);
        var barkCol = burnt ? '#2b2320' : st.trunk;
        g.fillStyle = barkCol; g.beginPath(); g.roundRect(-46, -13, 92, 26, 12); g.fill();
        g.fillStyle = burnt ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.2)';
        g.beginPath(); g.ellipse(42, 0, 7, 12, 0, 0, 6.2832); g.fill();
        g.strokeStyle = burnt ? 'rgba(120,90,60,0.35)' : 'rgba(60,40,20,0.5)'; g.lineWidth = 2.5;
        for (var r = -30; r < 36; r += 14) { g.beginPath(); g.moveTo(r, -11); g.lineTo(r + 5, 11); g.stroke(); }
        if (!burnt) {
          /* moss cap + tiny mushrooms */
          ell(g, -20, -13, 16, 6, '#5d8a48'); ell(g, 14, -14, 12, 5, '#5d8a48');
          g.fillStyle = '#e8dcc2'; g.fillRect(-26, -24, 5, 10); ell(g, -23.5, -25, 7, 5, '#c96a5e');
          g.fillRect(20, -22, 4, 8); ell(g, 22, -23, 5.5, 4, '#c96a5e');
        } else {
          /* ember glow in the cracks */
          g.fillStyle = 'rgba(255,120,40,0.5)';
          for (var em = 0; em < 4; em++) ell(g, -30 + em * 22 + hash(em, v) * 8, 2, 3, 1.8, 'rgba(255,120,40,0.5)');
        }
        g.restore();
      }
    });
  }

  /* ---------- mushroom ---------- */
  function mushroom(v) {
    return get('mush' + (v % 3), function (g) {
      var cx = S / 2, baseY = S - 18;
      function cap(x, h, r, col) {
        g.fillStyle = '#e8dcc2'; g.fillRect(x - 3, baseY - h, 6, h);
        ell(g, x, baseY - h - 3, r, r * 0.72, col);
        ell(g, x - r * 0.3, baseY - h - 6, r * 0.16, r * 0.12, 'rgba(255,255,255,0.65)');
      }
      cap(cx - 16, 26, 15, '#c96a5e'); cap(cx + 12, 20, 11, '#b85a4e'); cap(cx + 2, 14, 8, '#d08060');
      ell(g, cx - 24, baseY - 2, 20, 6, 'rgba(0,0,0,0.15)');
    });
  }

  /* ---------- animals (cute, simple, readable at small size) ---------- */
  function animal(sp, v) {
    return get('an' + sp + (v % 2), function (g) {
      var cx = S / 2, cy = S / 2 + 8;
      function eye(x, y, r) { ell(g, x, y, r, r, '#241a12'); ell(g, x - r * 0.3, y - r * 0.3, r * 0.35, r * 0.35, '#fff'); }
      function shadow(w) { ell(g, cx, cy + 34, w, 7, 'rgba(0,0,0,0.16)'); }
      function rim(x, y, rx, ry) { ell(g, x, y - ry * 0.55, rx * 0.8, ry * 0.35, 'rgba(255,246,220,0.28)'); }
      function blush(x, y) { ell(g, x, y, 4.5, 3, 'rgba(230,130,130,0.4)'); }
      if (sp === 'squirrel') {
        shadow(34);
        /* big fluffy tail with fur bands */
        ell(g, cx + 22, cy + 4, 17, 28, '#96602f');
        ell(g, cx + 24, cy - 8, 12, 20, '#a9713d');
        g.strokeStyle = 'rgba(90,55,25,0.5)'; g.lineWidth = 2.5;
        for (var st1 = 0; st1 < 4; st1++) { g.beginPath(); g.moveTo(cx + 12, cy - 16 + st1 * 11); g.quadraticCurveTo(cx + 24, cy - 12 + st1 * 11, cx + 34, cy - 18 + st1 * 11); g.stroke(); }
        /* hind foot + front paw */
        ell(g, cx - 6, cy + 26, 10, 5.5, '#8a5a30'); ell(g, cx + 10, cy + 20, 7, 5, '#a9713d');
        /* body with cream belly */
        ell(g, cx, cy + 8, 18, 22, '#b57a44');
        ell(g, cx - 3, cy + 14, 11, 14, '#e8cfa8');
        rim(cx, cy - 12, 18, 22);
        /* head, ears with tufts */
        ell(g, cx, cy - 14, 14.5, 13.5, '#bd8349');
        ell(g, cx - 9, cy - 27, 5.5, 9, '#a9713d'); ell(g, cx + 9, cy - 27, 5.5, 9, '#a9713d');
        ell(g, cx - 9, cy - 27, 2.6, 5, '#7d4e26'); ell(g, cx + 9, cy - 27, 2.6, 5, '#7d4e26');
        ell(g, cx - 9, cy - 34, 2, 4, '#3a2412'); ell(g, cx + 9, cy - 34, 2, 4, '#3a2412');
        ell(g, cx, cy - 6, 5.5, 4, '#f0d9b5');
        eye(cx - 6, cy - 15, 3.6); eye(cx + 6, cy - 15, 3.6);
        blush(cx - 10, cy - 9); blush(cx + 10, cy - 9);
        ell(g, cx, cy - 8.5, 2.2, 1.8, '#5a3a22');
      } else if (sp === 'rabbit') {
        shadow(36);
        /* fluffy cotton tail */
        ell(g, cx + 19, cy + 12, 7, 6, '#f2ece0');
        /* long ears with pink inner */
        ell(g, cx - 7, cy - 24, 7.5, 21, '#b39d83'); ell(g, cx + 7, cy - 24, 7.5, 21, '#b39d83');
        ell(g, cx - 7, cy - 24, 3.6, 14, '#e8b9b9'); ell(g, cx + 7, cy - 24, 3.6, 14, '#e8b9b9');
        ell(g, cx - 7, cy - 42, 3, 5, '#8a7458'); ell(g, cx + 7, cy - 42, 3, 5, '#8a7458');
        /* body */
        ell(g, cx, cy + 10, 20, 17, '#bfae93');
        ell(g, cx - 2, cy + 15, 13, 11, '#e3d7c2');
        rim(cx, cy - 5, 20, 17);
        /* haunch + feet */
        ell(g, cx - 12, cy + 18, 11, 8, '#ad9a80');
        ell(g, cx - 14, cy + 28, 8, 4.5, '#9a8770'); ell(g, cx + 12, cy + 28, 8, 4.5, '#9a8770');
        /* head */
        ell(g, cx, cy - 2, 15.5, 14.5, '#c9b898');
        ell(g, cx, cy + 3, 6, 4.5, '#efe6d4');
        eye(cx - 6.5, cy - 4, 3.6); eye(cx + 6.5, cy - 4, 3.6);
        ell(g, cx, cy + 1.5, 3, 2.4, '#d98a94');
        g.strokeStyle = '#a08a6e'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(cx, cy + 4); g.lineTo(cx, cy + 7); g.stroke();
      } else if (sp === 'butterfly') {
        shadow(20);
        var w1 = '#eba9cd', w2 = '#d47ba8', w3 = '#8a4a72';
        /* upper wings with spots */
        ell(g, cx - 14, cy - 8, 15, 20, w1); ell(g, cx + 14, cy - 8, 15, 20, w1);
        ell(g, cx - 14, cy - 12, 9, 12, w2); ell(g, cx + 14, cy - 12, 9, 12, w2);
        ell(g, cx - 16, cy - 14, 3.5, 3.5, '#fff'); ell(g, cx + 12, cy - 4, 3, 3, '#fff');
        ell(g, cx - 9, cy - 2, 2.4, 2.4, w3); ell(g, cx + 9, cy - 2, 2.4, 2.4, w3);
        /* lower wings */
        ell(g, cx - 12, cy + 15, 10.5, 12.5, w2); ell(g, cx + 12, cy + 15, 10.5, 12.5, w2);
        ell(g, cx - 12, cy + 17, 4, 5, w3); ell(g, cx + 12, cy + 17, 4, 5, w3);
        /* wing edges */
        g.strokeStyle = 'rgba(120,60,95,0.6)'; g.lineWidth = 2;
        g.beginPath(); g.ellipse(cx - 14, cy - 8, 15, 20, 0.15, 0, 6.2832); g.stroke();
        g.beginPath(); g.ellipse(cx + 14, cy - 8, 15, 20, -0.15, 0, 6.2832); g.stroke();
        /* body + antennae */
        g.fillStyle = '#4a3423'; g.beginPath(); g.ellipse(cx, cy + 2, 4.5, 14, 0, 0, 6.2832); g.fill();
        ell(g, cx, cy - 6, 3, 5, '#6a4a30');
        g.strokeStyle = '#4a3423'; g.lineWidth = 2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(cx - 2, cy - 12); g.quadraticCurveTo(cx - 8, cy - 24, cx - 13, cy - 26); g.stroke();
        g.beginPath(); g.moveTo(cx + 2, cy - 12); g.quadraticCurveTo(cx + 8, cy - 24, cx + 13, cy - 26); g.stroke();
        ell(g, cx - 13, cy - 26, 2.2, 2.2, '#4a3423'); ell(g, cx + 13, cy - 26, 2.2, 2.2, '#4a3423');
      } else if (sp === 'fox') {
        shadow(40);
        /* big brush tail with white tip */
        ell(g, cx + 24, cy + 12, 21, 10, '#c9722e');
        ell(g, cx + 30, cy + 8, 13, 8, '#d8843c');
        ell(g, cx + 40, cy + 9, 8.5, 7, '#f4e8d2');
        /* legs */
        g.fillStyle = '#8a4a1e';
        g.fillRect(cx - 15, cy + 18, 6.5, 16); g.fillRect(cx + 8, cy + 18, 6.5, 16);
        ell(g, cx - 12, cy + 34, 5, 3, '#5a3010'); ell(g, cx + 11, cy + 34, 5, 3, '#5a3010');
        /* body with cream chest */
        ell(g, cx, cy + 8, 23, 18, '#d07f36');
        ell(g, cx - 6, cy + 12, 13, 12, '#f4e2c6');
        rim(cx, cy - 8, 23, 18);
        /* head: white cheeks, dark ears */
        ell(g, cx, cy - 10, 16.5, 15.5, '#dd8f42');
        ell(g, cx - 11, cy - 25, 7.5, 10.5, '#c9722e'); ell(g, cx + 11, cy - 25, 7.5, 10.5, '#c9722e');
        ell(g, cx - 11, cy - 25, 3.6, 5.8, '#6a3410'); ell(g, cx + 11, cy - 25, 3.6, 5.8, '#6a3410');
        ell(g, cx - 9, cy - 3, 8, 6, '#f4e8d2'); ell(g, cx + 9, cy - 3, 8, 6, '#f4e8d2');
        eye(cx - 7, cy - 12, 3.8); eye(cx + 7, cy - 12, 3.8);
        ell(g, cx, cy - 5, 3.6, 3, '#3a2415');
        g.strokeStyle = '#8a4a1e'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(cx, cy - 2); g.quadraticCurveTo(cx - 4, cy + 1, cx - 7, cy + 1); g.stroke();
        g.beginPath(); g.moveTo(cx, cy - 2); g.quadraticCurveTo(cx + 4, cy + 1, cx + 7, cy + 1); g.stroke();
      } else if (sp === 'owl') {
        shadow(30);
        /* ear tufts */
        ell(g, cx - 9, cy - 22, 6.5, 9, '#7d6242'); ell(g, cx + 9, cy - 22, 6.5, 9, '#7d6242');
        /* body with scalloped feather rows */
        ell(g, cx, cy + 4, 21, 25, '#8a6f4d');
        g.fillStyle = 'rgba(60,45,25,0.35)';
        for (var fr = 0; fr < 4; fr++) for (var fc = 0; fc < 3; fc++)
          ell(g, cx - 11 + fc * 11, cy + 2 + fr * 10, 5, 3.4, 'rgba(60,45,25,0.35)');
        ell(g, cx, cy + 13, 13, 14, '#b39a6e');
        rim(cx, cy - 18, 21, 25);
        /* facial disks */
        ell(g, cx - 8.5, cy - 6, 10, 11, '#f2e8d0'); ell(g, cx + 8.5, cy - 6, 10, 11, '#f2e8d0');
        eye(cx - 8.5, cy - 6, 5); eye(cx + 8.5, cy - 6, 5);
        ell(g, cx, cy + 1.5, 3.8, 4.8, '#e9a13b');
        /* feet gripping */
        g.fillStyle = '#e9a13b';
        ell(g, cx - 9, cy + 30, 4, 3, '#e9a13b'); ell(g, cx + 9, cy + 30, 4, 3, '#e9a13b');
        /* folded wings */
        g.strokeStyle = 'rgba(60,45,25,0.5)'; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(cx - 20, cy); g.quadraticCurveTo(cx - 26, cy + 12, cx - 18, cy + 22); g.stroke();
        g.beginPath(); g.moveTo(cx + 20, cy); g.quadraticCurveTo(cx + 26, cy + 12, cx + 18, cy + 22); g.stroke();
      } else if (sp === 'deer') {
        shadow(38);
        /* legs with dark hooves */
        g.fillStyle = '#a1763f';
        g.fillRect(cx - 17, cy + 18, 7, 24); g.fillRect(cx + 10, cy + 18, 7, 24);
        g.fillStyle = '#4a3a26';
        g.fillRect(cx - 18, cy + 38, 9, 6); g.fillRect(cx + 9, cy + 38, 9, 6);
        /* body, cream belly, white spots */
        ell(g, cx, cy + 10, 25, 19, '#b0824f');
        ell(g, cx - 2, cy + 16, 16, 11, '#e3cfa8');
        rim(cx, cy - 7, 25, 19);
        for (var sI = 0; sI < 6; sI++) ell(g, cx - 13 + hash(sI, 3) * 26, cy + 2 + hash(sI, 7) * 14, 2.8, 2.8, '#f4ead2');
        /* neck + head */
        ell(g, cx - 2, cy - 12, 11, 16, '#b0824f');
        ell(g, cx - 2, cy - 24, 13.5, 13, '#bb8f58');
        /* ears */
        ell(g, cx - 12, cy - 34, 5.5, 9, '#a1763f'); ell(g, cx + 8, cy - 34, 5.5, 9, '#a1763f');
        ell(g, cx - 12, cy - 34, 2.6, 5, '#e3cfa8'); ell(g, cx + 8, cy - 34, 2.6, 5, '#e3cfa8');
        /* antlers with tines */
        g.strokeStyle = '#8a6f4d'; g.lineWidth = 3.6; g.lineCap = 'round';
        g.beginPath(); g.moveTo(cx - 7, cy - 34); g.lineTo(cx - 16, cy - 50); g.moveTo(cx - 12, cy - 42); g.lineTo(cx - 20, cy - 44); g.stroke();
        g.beginPath(); g.moveTo(cx + 3, cy - 34); g.lineTo(cx + 12, cy - 50); g.moveTo(cx + 8, cy - 42); g.lineTo(cx + 16, cy - 44); g.stroke();
        eye(cx - 8, cy - 24, 3.6); eye(cx + 4, cy - 24, 3.6);
        ell(g, cx - 2, cy - 16, 4.5, 3.4, '#4a3a26');
        /* short tail */
        ell(g, cx + 24, cy + 6, 6, 8, '#e3cfa8');
      } else if (sp === 'hedgehog') {
        shadow(34);
        /* spines: layered quills with light tips */
        g.fillStyle = '#6e5138';
        for (var q = 0; q < 18; q++) {
          var qa = (q / 18) * 6.2832, qx = cx + Math.cos(qa) * 19, qy = cy + 6 + Math.sin(qa) * 12;
          g.beginPath(); g.moveTo(qx, qy); g.lineTo(qx + Math.cos(qa) * 11, qy + Math.sin(qa) * 11 - 3); g.lineTo(qx + 4, qy + 2); g.closePath(); g.fill();
        }
        g.fillStyle = 'rgba(240,230,200,0.5)';
        for (var q2 = 0; q2 < 10; q2++) {
          var qb = (q2 / 10) * 6.2832;
          ell(g, cx + Math.cos(qb) * 27, cy + 4 + Math.sin(qb) * 17, 1.8, 1.8, 'rgba(240,230,200,0.55)');
        }
        ell(g, cx, cy + 8, 20, 13, '#5f4630');
        /* face */
        ell(g, cx + 15, cy + 10, 10.5, 8.5, '#c9a97e');
        ell(g, cx + 19, cy + 13, 6, 5, '#e0c49a');
        eye(cx + 16, cy + 7, 3);
        ell(g, cx + 24, cy + 11, 2.6, 2.2, '#3a2415');
        blush(cx + 12, cy + 13);
        /* tiny feet */
        ell(g, cx - 8, cy + 20, 5, 3, '#8a6f52'); ell(g, cx + 8, cy + 20, 5, 3, '#8a6f52');
      } else if (sp === 'frog') {
        shadow(32);
        /* haunches */
        ell(g, cx - 17, cy + 14, 11, 12, '#4c8a41'); ell(g, cx + 17, cy + 14, 11, 12, '#4c8a41');
        ell(g, cx - 17, cy + 14, 6, 7, '#6cb85e'); ell(g, cx + 17, cy + 14, 6, 7, '#6cb85e');
        /* webbed feet */
        ell(g, cx - 22, cy + 24, 7, 3.5, '#3c6e36'); ell(g, cx + 22, cy + 24, 7, 3.5, '#3c6e36');
        /* body with light belly */
        ell(g, cx, cy + 10, 20, 15, '#5da34f');
        ell(g, cx, cy + 15, 13, 8, '#cfe8b8');
        rim(cx, cy - 3, 20, 15);
        /* eye bumps */
        ell(g, cx - 12, cy - 6, 9.5, 9.5, '#5da34f'); ell(g, cx + 12, cy - 6, 9.5, 9.5, '#5da34f');
        ell(g, cx - 12, cy - 8, 7, 7, '#8fce6e'); ell(g, cx + 12, cy - 8, 7, 7, '#8fce6e');
        eye(cx - 12, cy - 8, 3.8); eye(cx + 12, cy - 8, 3.8);
        /* smile + spots */
        g.strokeStyle = '#3c6e36'; g.lineWidth = 2.4; g.lineCap = 'round';
        g.beginPath(); g.arc(cx, cy + 8, 9, 0.3, 2.84); g.stroke();
        for (var dI = 0; dI < 5; dI++) ell(g, cx - 11 + hash(dI, 11) * 22, cy + 2 + hash(dI, 13) * 10, 2.6, 2.6, '#3c6e36');
      } else if (sp === 'vole') {
        shadow(24);
        /* plump tunnel body */
        ell(g, cx, cy + 12, 17, 12, '#7a5c40');
        ell(g, cx - 2, cy + 15, 11, 8, '#93765a');
        rim(cx, cy + 2, 17, 12);
        /* head low to the ground */
        ell(g, cx + 13, cy + 12, 10, 8.5, '#846845');
        /* tiny rounded ears */
        ell(g, cx + 8, cy + 5, 3.6, 3.2, '#6a4f34'); ell(g, cx + 15, cy + 4, 3.6, 3.2, '#6a4f34');
        /* pink nose + buck teeth */
        ell(g, cx + 22, cy + 12, 3, 2.6, '#d98a94');
        g.fillStyle = '#f4ead2'; g.fillRect(cx + 19.5, cy + 15, 2.4, 3.4); g.fillRect(cx + 22.3, cy + 15, 2.4, 3.4);
        eye(cx + 13, cy + 9, 3);
        /* whiskers */
        g.strokeStyle = 'rgba(240,230,210,0.7)'; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(cx + 20, cy + 10); g.lineTo(cx + 30, cy + 6); g.moveTo(cx + 20, cy + 13); g.lineTo(cx + 30, cy + 14); g.stroke();
        /* digging paws + short tail */
        ell(g, cx + 8, cy + 22, 5, 3.4, '#5f4630'); ell(g, cx - 6, cy + 22, 5, 3.4, '#5f4630');
        g.strokeStyle = '#6a4f34'; g.lineWidth = 3; g.lineCap = 'round';
        g.beginPath(); g.moveTo(cx - 16, cy + 10); g.quadraticCurveTo(cx - 24, cy + 8, cx - 26, cy + 2); g.stroke();
        /* kicked-up dirt */
        ell(g, cx - 22, cy + 18, 5, 3.4, '#5a4632'); ell(g, cx - 28, cy + 15, 3.4, 2.6, '#6a5340');
      } else if (sp === 'heron') {
        /* statue-still fisher */
        g.strokeStyle = '#3a3a3a'; g.lineWidth = 4; g.lineCap = 'round';
        g.beginPath(); g.moveTo(cx - 6, cy + 34); g.lineTo(cx - 6, cy + 12); g.stroke();
        g.beginPath(); g.moveTo(cx + 6, cy + 34); g.lineTo(cx + 6, cy + 14); g.stroke();
        /* body: slate torpedo */
        ell(g, cx, cy + 2, 15, 22, '#8a94a0');
        ell(g, cx - 4, cy - 2, 8, 15, '#a8b2bc');
        rim(cx, cy - 18, 15, 22);
        /* folded wing */
        ell(g, cx + 2, cy + 4, 9, 16, '#6e7884');
        /* long S neck */
        g.strokeStyle = '#9aa4ae'; g.lineWidth = 9;
        g.beginPath(); g.moveTo(cx + 2, cy - 14);
        g.quadraticCurveTo(cx + 14, cy - 30, cx + 4, cy - 44);
        g.quadraticCurveTo(cx - 2, cy - 52, cx + 6, cy - 58); g.stroke();
        /* head + dagger beak */
        ell(g, cx + 7, cy - 60, 9, 7, '#aeb8c2');
        g.fillStyle = '#e8b83a';
        g.beginPath(); g.moveTo(cx + 14, cy - 62); g.lineTo(cx + 34, cy - 58); g.lineTo(cx + 14, cy - 55); g.closePath(); g.fill();
        eye(cx + 8, cy - 61, 3);
        /* crest plume */
        g.strokeStyle = '#4a545e'; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(cx + 1, cy - 64); g.quadraticCurveTo(cx - 8, cy - 70, cx - 14, cy - 66); g.stroke();
      }
    });
  }

  /* ---------- wildfire flames (2 animation frames) + dung mound ---------- */
  function fire(v) {
    return get('fire' + (v % 2), function (g) {
      var cx = S / 2, baseY = S - 12, ph = (v % 2) * 0.5;
      /* smoke wisps */
      g.fillStyle = 'rgba(90,85,80,0.35)';
      ell(g, cx - 14 + ph * 8, baseY - 92, 10, 14, 'rgba(90,85,80,0.3)');
      ell(g, cx + 10 - ph * 6, baseY - 108, 12, 16, 'rgba(90,85,80,0.22)');
      /* outer flame */
      function flame(x, w, h, col) {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(x - w / 2, baseY);
        g.quadraticCurveTo(x - w / 2, baseY - h * 0.6, x - w * 0.12 + ph * 6, baseY - h);
        g.quadraticCurveTo(x + w * 0.3 - ph * 6, baseY - h * 0.55, x + w / 2, baseY);
        g.closePath(); g.fill();
      }
      flame(cx - 22, 34, 52, 'rgba(200,60,20,0.9)');
      flame(cx + 20, 38, 64, 'rgba(210,70,22,0.9)');
      flame(cx, 46, 80, 'rgba(230,90,25,0.92)');
      flame(cx - 10, 28, 46, 'rgba(245,150,40,0.95)');
      flame(cx + 8, 30, 54, 'rgba(250,170,50,0.95)');
      flame(cx, 18, 34, 'rgba(255,220,120,0.95)');
      /* sparks */
      g.fillStyle = 'rgba(255,180,80,0.9)';
      for (var s2 = 0; s2 < 6; s2++)
        ell(g, cx - 26 + hash(s2, v) * 52, baseY - 60 - hash(s2, v * 3) * 50, 2, 2.6, 'rgba(255,180,80,0.9)');
    });
  }
  function dung(v) {
    return get('dung' + (v % 2), function (g) {
      var cx = S / 2, baseY = S - 10, j = (v % 2) * 6 - 3;
      ell(g, cx + j, baseY - 4, 20, 9, 'rgba(0,0,0,0.15)');
      ell(g, cx + j - 8, baseY - 10, 12, 9, '#6a4f30');
      ell(g, cx + j + 7, baseY - 11, 10, 8, '#75573a');
      ell(g, cx + j, baseY - 16, 9, 7, '#7d5f42');
      ell(g, cx + j - 4, baseY - 19, 3.4, 2.6, '#8f7050');
      ell(g, cx + j + 3, baseY - 18, 2.8, 2.2, '#8f7050');
      /* grass flecks */
      g.strokeStyle = 'rgba(120,150,80,0.7)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(cx + j - 10, baseY - 14); g.lineTo(cx + j - 13, baseY - 20); g.stroke();
      g.beginPath(); g.moveTo(cx + j + 9, baseY - 15); g.lineTo(cx + j + 12, baseY - 21); g.stroke();
    });
  }

  /* ---------- pond life: lily pads, koi, dragonflies, drought cracks ---------- */
  function lilyPad(v) {
    return get('lily' + (v % 3), function (g) {
      var cx = S / 2, cy = S / 2;
      var r = 32 + (v % 3) * 5;
      g.fillStyle = '#4d8a44';
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, 0.5, 5.9); g.closePath(); g.fill();
      g.fillStyle = '#5da34f';
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r * 0.7, 0.7, 5.7); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(30,60,30,0.4)'; g.lineWidth = 2;
      for (var i = 0; i < 6; i++) {
        var a = 0.8 + i * 0.85;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85); g.stroke();
      }
      if (v % 2 === 0) {
        for (var p = 0; p < 6; p++) {
          var pa = p * 1.047;
          ell(g, cx + Math.cos(pa) * 8, cy - 6 + Math.sin(pa) * 8, 7, 4.5, '#f2b8d0');
        }
        ell(g, cx, cy - 6, 5, 5, '#fbeef2');
        ell(g, cx, cy - 6, 2.4, 2.4, '#e9a13b');
      }
    });
  }
  function koi(v) {
    return get('koi' + (v % 3), function (g) {
      var cx = S / 2, cy = S / 2;
      var cols = [['#e07840', '#f4ead2'], ['#f4ead2', '#e07840'], ['#d8a93b', '#f4ead2']][v % 3];
      ell(g, cx, cy, 20, 9, cols[0]);
      ell(g, cx - 4, cy - 2, 10, 5, cols[1]);
      g.fillStyle = cols[0];
      g.beginPath(); g.moveTo(cx - 18, cy); g.lineTo(cx - 32, cy - 9); g.lineTo(cx - 32, cy + 9); g.closePath(); g.fill();
      ell(g, cx + 2, cy + 8, 6, 3, cols[0]);
      ell(g, cx + 10, cy - 2, 2.4, 2.4, '#241a12');
      ell(g, cx + 9.2, cy - 2.8, 0.9, 0.9, '#fff');
    });
  }
  function dragonfly(v) {
    return get('dfly' + (v % 2), function (g) {
      var cx = S / 2, cy = S / 2;
      g.fillStyle = 'rgba(200,230,250,0.55)';
      ell(g, cx - 10, cy - 8, 16, 5, 'rgba(200,230,250,0.55)');
      ell(g, cx + 10, cy - 8, 16, 5, 'rgba(200,230,250,0.55)');
      ell(g, cx - 8, cy + 6, 12, 4, 'rgba(200,230,250,0.4)');
      ell(g, cx + 8, cy + 6, 12, 4, 'rgba(200,230,250,0.4)');
      g.fillStyle = '#3a8a8a';
      g.beginPath(); g.moveTo(cx - 2, cy - 14); g.lineTo(cx + 2, cy - 14); g.lineTo(cx + 1, cy + 18); g.lineTo(cx - 1, cy + 18); g.closePath(); g.fill();
      ell(g, cx, cy - 16, 5, 5, '#2a6a6a');
      ell(g, cx - 2, cy - 17, 1.8, 1.8, '#7ad0d0'); ell(g, cx + 2, cy - 17, 1.8, 1.8, '#7ad0d0');
    });
  }
  function cracks(v) {
    return get('cracks' + (v % 2), function (g) {
      g.strokeStyle = 'rgba(40,26,14,0.55)'; g.lineWidth = 3; g.lineCap = 'round';
      var cx = S / 2, cy = S / 2;
      for (var i = 0; i < 5; i++) {
        var a = hash(i, v * 7 + 1) * 6.2832;
        var x2 = cx + Math.cos(a) * 44, y2 = cy + Math.sin(a) * 30;
        g.beginPath(); g.moveTo(cx, cy);
        g.lineTo((cx + x2) / 2 + (hash(i, 3) - 0.5) * 16, (cy + y2) / 2);
        g.lineTo(x2, y2); g.stroke();
      }
    });
  }

  /* ---------- mycorrhizal web: glowing threads between root zones ---------- */
  function drawWeb(g, links, tsec) {
    if (!links.length) return;
    g.save();
    g.lineCap = 'round';
    var pulse = 0.55 + 0.25 * Math.sin(tsec * 2.2);
    for (var i = 0; i < links.length; i++) {
      var L = links[i];
      var sagY = Math.max(L.y1, L.y2) + 26, midX = (L.x1 + L.x2) / 2;
      g.strokeStyle = 'rgba(150,220,130,0.20)'; g.lineWidth = 9;
      g.beginPath(); g.moveTo(L.x1, L.y1);
      g.quadraticCurveTo(midX, sagY, L.x2, L.y2); g.stroke();
      g.strokeStyle = 'rgba(196,240,170,' + pulse.toFixed(3) + ')'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(L.x1, L.y1);
      g.quadraticCurveTo(midX, sagY, L.x2, L.y2); g.stroke();
      var t = (tsec * 0.35 + i * 0.37) % 1, u = 1 - t;
      var mx = u * u * L.x1 + 2 * u * t * midX + t * t * L.x2;
      var my = u * u * L.y1 + 2 * u * t * sagY + t * t * L.y2;
      g.fillStyle = 'rgba(230,255,205,0.95)';
      g.beginPath(); g.arc(mx, my, 4, 0, 6.2832); g.fill();
    }
    g.restore();
  }

  /* ---------- root systems (cached sprites, 160x200, origin top-center) ---------- */
  function roots(type, stage, seed) {
    var key = 'root' + type + stage + 's' + (seed % 5);
    return get(key, function (g) {
      var cx = 80;
      g.lineCap = 'round';
      function branch(x, y, ang, len, w) {
        var x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len * 0.55 + len * 0.3;
        g.strokeStyle = '#5f4128'; g.lineWidth = w;
        g.beginPath(); g.moveTo(x, y);
        g.quadraticCurveTo(x + (x2 - x) * 0.5 + (hash(x | 0, y | 0) - 0.5) * 10, y + (y2 - y) * 0.6, x2, y2);
        g.stroke();
        return [x2, y2];
      }
      if (stage <= 1) { branch(cx, 4, Math.PI / 2 + 0.2, 10, 3); return; }
      var depth = [0, 0, 46, 96, 150, 186][stage] || 60;
      var nLat = [0, 0, 3, 6, 10, 13][stage] || 4;
      var tx = cx, ty = 2;
      for (var sgi = 0; sgi < 5; sgi++) {
        var ny = ty + depth / 5, nx = tx + (hash(seed, sgi * 3) - 0.5) * 22;
        g.strokeStyle = '#523a20'; g.lineWidth = 8.5 - sgi * 1.2;
        g.beginPath(); g.moveTo(tx, ty);
        g.quadraticCurveTo((tx + nx) / 2 + 6, (ty + ny) / 2, nx, ny); g.stroke();
        tx = nx; ty = ny;
      }
      for (var li = 0; li < nLat; li++) {
        var side = li % 2 ? 1 : -1;
        var ly = 8 + hash(seed, li * 7) * depth * 0.55;
        var lx = cx + (hash(seed, li * 11) - 0.5) * 14;
        var ang = Math.PI / 2 + side * (0.5 + hash(seed, li * 13) * 0.55);
        var len = (30 + hash(seed, li * 17) * 55) * (depth / 150 + 0.35);
        var end = branch(lx, ly, ang, len, 4);
        var nb = 2 + ((hash(seed, li * 19) * 2) | 0);
        for (var bi = 0; bi < nb; bi++) {
          var t = 0.4 + 0.6 * (bi / nb);
          branch(lx + (end[0] - lx) * t, ly + (end[1] - ly) * t,
                 ang + side * (0.5 + hash(seed, bi * 23 + li) * 0.5), len * 0.32, 2);
        }
      }
      g.strokeStyle = 'rgba(224,196,150,0.6)'; g.lineWidth = 1.3;
      for (var hi = 0; hi < 14; hi++) {
        var hx = cx + (hash(seed, hi * 29) - 0.5) * 130;
        var hy = 20 + hash(seed, hi * 31) * depth * 0.9;
        g.beginPath(); g.moveTo(hx, hy);
        g.lineTo(hx + (hash(seed, hi * 37) - 0.5) * 14, hy + 4 + hash(seed, hi * 41) * 8); g.stroke();
      }
    });
  }

  /* ---------- mycelium fan under mushroom spots ---------- */
  function mycelium(seed) {
    return get('myc' + (seed % 5), function (g) {
      var cx = 80;
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(232,220,194,0.75)'; g.lineWidth = 1.6;
      for (var i = 0; i < 16; i++) {
        var ang = Math.PI * (0.15 + 0.7 * (i / 15)) + (hash(seed, i) - 0.5) * 0.2;
        var len = 40 + hash(seed, i * 3) * 55;
        var x2 = cx + Math.cos(ang) * len, y2 = 6 + Math.sin(ang) * len * 0.55;
        g.beginPath(); g.moveTo(cx, 4);
        g.quadraticCurveTo(cx + (x2 - cx) * 0.5, 4 + (y2 - 4) * 0.3, x2, y2); g.stroke();
      }
      g.fillStyle = 'rgba(232,220,194,0.5)';
      for (var d = 0; d < 20; d++) {
        g.beginPath(); g.arc(cx + (hash(seed, d * 7) - 0.5) * 150, 10 + hash(seed, d * 11) * 60, 1.4, 0, 6.2832); g.fill();
      }
    });
  }

  /* ---------- underground cross-section (cached per resize) ---------- */
  function underground(w, h, surfFn, botY) {
    var key = 'ug' + w + 'x' + h;
    if (cache[key]) return cache[key];
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d');
    var top = h;
    for (var x0 = 0; x0 < w; x0 += 8) top = Math.min(top, surfFn(x0));
    g.fillStyle = '#33271a'; g.fillRect(0, top - 4, w, botY - top + 8);
    g.fillStyle = '#3d2e1f';
    g.beginPath(); g.moveTo(0, top - 4); g.lineTo(w, top - 4);
    var ym = top + 0.55 * (botY - top);
    for (var x = w; x >= 0; x -= 16) g.lineTo(x, ym + Math.sin(x * 0.018 + 1.2) * 9 + (hash(x, 5) - 0.5) * 10);
    g.closePath(); g.fill();
    g.fillStyle = '#4a3826';
    g.beginPath(); g.moveTo(0, top - 4); g.lineTo(w, top - 4);
    var yt = top + 0.28 * (botY - top);
    for (var x2 = w; x2 >= 0; x2 -= 16) g.lineTo(x2, yt + Math.sin(x2 * 0.023 + 4.0) * 7 + (hash(x2, 9) - 0.5) * 8);
    g.closePath(); g.fill();
    for (var i = 0; i < 340; i++) {
      var px = hash(i, 101) * w, py = top + 8 + hash(i, 103) * (botY - top - 12);
      if (py < surfFn(px) + 5) continue;
      g.fillStyle = hash(i, 107) > 0.5 ? 'rgba(0,0,0,0.14)' : 'rgba(255,235,200,0.06)';
      g.beginPath(); g.arc(px, py, 1 + hash(i, 109) * 2.6, 0, 6.2832); g.fill();
    }
    for (var sN = 0; sN < 12; sN++) {
      var qx = hash(sN, 201) * w, qy = top + 20 + hash(sN, 203) * (botY - top - 40);
      if (qy < surfFn(qx) + 14) continue;
      var qr = 5 + hash(sN, 205) * 9;
      ell(g, qx, qy, qr, qr * 0.72, '#5a5148');
      ell(g, qx - qr * 0.25, qy - qr * 0.2, qr * 0.4, qr * 0.28, 'rgba(255,255,255,0.10)');
    }
    /* deep zone: big buried stones + faint ancient root traces */
    for (var dS = 0; dS < 5; dS++) {
      var dx = hash(dS, 401) * w, dy = top + (botY - top) * (0.62 + hash(dS, 403) * 0.3);
      var dr = 12 + hash(dS, 405) * 16;
      ell(g, dx, dy, dr, dr * 0.66, '#4e463d');
      ell(g, dx - dr * 0.25, dy - dr * 0.2, dr * 0.38, dr * 0.26, 'rgba(255,255,255,0.08)');
    }
    g.strokeStyle = 'rgba(0,0,0,0.20)'; g.lineWidth = 5; g.lineCap = 'round';
    for (var oR = 0; oR < 4; oR++) {
      var ox = hash(oR, 411) * w, oy = top + (botY - top) * (0.7 + hash(oR, 413) * 0.22);
      g.beginPath(); g.moveTo(ox, oy);
      g.quadraticCurveTo(ox + 40 - hash(oR, 415) * 80, oy + 24, ox + 90 - hash(oR, 417) * 180, oy + 44);
      g.stroke();
    }
    g.strokeStyle = '#5da34f'; g.lineWidth = 2; g.lineCap = 'round';
    for (var tI = 0; tI < 130; tI++) {
      var gx = hash(tI, 301) * w, gy = surfFn(gx);
      var gh = 5 + hash(tI, 303) * 8, lean = (hash(tI, 305) - 0.5) * 8;
      g.beginPath(); g.moveTo(gx, gy + 2);
      g.quadraticCurveTo(gx + lean * 0.4, gy - gh * 0.6, gx + lean, gy - gh); g.stroke();
    }
    g.strokeStyle = 'rgba(140,220,140,0.28)'; g.lineWidth = 3;
    g.beginPath();
    for (var sx = 0; sx <= w; sx += 8) { var sy = surfFn(sx); if (sx === 0) g.moveTo(sx, sy); else g.lineTo(sx, sy); }
    g.stroke();
    cache[key] = c;
    return c;
  }

  /* ---------- backgrounds ---------- */
  function gameBG(w, h, surfBaseY, tsec, season) {
    season = (season == null ? 1 : season) % 4;
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d');
    /* seasonal skies */
    var skies = [
      ['#8fc7e8', '#c4e2d8', '#e9efd2', '#dfe8c8'],  /* spring: fresh */
      ['#7fb8e0', '#b8d8cc', '#e4e8c4', '#d4dcb8'],  /* summer: deep */
      ['#a8b8d8', '#d8c4a8', '#f0d8a8', '#e0d0a0'],  /* autumn: golden */
      ['#a8bdd0', '#c8d4dc', '#e4e8ec', '#dfe4e8']   /* winter: pale */
    ][season];
    var sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, skies[0]); sky.addColorStop(0.5, skies[1]);
    sky.addColorStop(0.78, skies[2]); sky.addColorStop(1, skies[3]);
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    var sunX = w * 0.8, sunY = h * 0.13;
    var sunCol = season === 2 ? '255,230,180' : season === 3 ? '240,244,250' : '255,250,220';
    var sg = g.createRadialGradient(sunX, sunY, 6, sunX, sunY, w * 0.3);
    sg.addColorStop(0, 'rgba(' + sunCol + ',0.95)'); sg.addColorStop(1, 'rgba(' + sunCol + ',0)');
    g.fillStyle = sg; g.fillRect(0, 0, w, h * 0.6);
    for (var ci = 0; ci < 5; ci++) {
      var cxp = hash(ci, 501) * w, cyp = h * (0.08 + hash(ci, 503) * 0.22), cw = 46 + hash(ci, 504) * 60;
      var cloudCol = season === 3 ? 'rgba(245,248,250,0.85)' : 'rgba(255,255,255,0.7)';
      ell(g, cxp, cyp, cw, cw * 0.32, cloudCol);
      ell(g, cxp - cw * 0.4, cyp + 6, cw * 0.6, cw * 0.24, cloudCol);
      ell(g, cxp + cw * 0.4, cyp + 6, cw * 0.6, cw * 0.24, cloudCol);
    }
    var hy = surfBaseY - 4;
    g.fillStyle = season === 3 ? '#dfe8ee' : season === 2 ? '#7a8a4a' : season === 0 ? '#7aa872' : '#6f9a6a';
    g.beginPath(); g.moveTo(0, hy + 34);
    for (var x = 0; x <= w; x += 18) {
      var th = 26 + hash(x, 601) * 46 + (hash(x, 602) > 0.72 ? 30 : 0);
      g.lineTo(x, hy - th); g.lineTo(x + 9, hy + 8);
    }
    g.lineTo(w, hy + 34); g.closePath(); g.fill();
    if (season === 3) { /* snow sparkle */
      g.fillStyle = 'rgba(255,255,255,0.5)';
      for (var sn = 0; sn < 40; sn++)
        ell(g, hash(sn, 603) * w, hy - hash(sn, 604) * 60, 2.2, 1.6, 'rgba(255,255,255,0.5)');
    }
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(0, hy - 64, w, 64);
    g.strokeStyle = 'rgba(60,70,80,0.6)'; g.lineWidth = 2;
    for (var b = 0; b < 3; b++) {
      var bx = hash(b, 701) * w, by = h * (0.12 + hash(b, 702) * 0.14);
      g.beginPath(); g.moveTo(bx - 8, by); g.quadraticCurveTo(bx - 3, by - 5, bx, by);
      g.quadraticCurveTo(bx + 3, by - 5, bx + 8, by); g.stroke();
    }
    return c;
  }
  function titleBG(w, h, tsec) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d');
    var sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#d8e6c2'); sky.addColorStop(0.42, '#a3c48f'); sky.addColorStop(0.75, '#5d7f52'); sky.addColorStop(1, '#2c4429');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    /* sun glow upper right */
    var sg = g.createRadialGradient(w * 0.74, h * 0.16, 8, w * 0.74, h * 0.16, w * 0.55);
    sg.addColorStop(0, 'rgba(255,248,214,0.9)'); sg.addColorStop(1, 'rgba(255,248,214,0)');
    g.fillStyle = sg; g.fillRect(0, 0, w, h);
    function pine(px, py, ph, col, lean) {
      var pw = ph * 0.44;
      g.fillStyle = col;
      for (var k = 0; k < 4; k++) {
        var ww = pw * (1 - k * 0.19), yy = py - k * ph * 0.21;
        g.beginPath();
        g.moveTo(px - ww / 2 + lean * k, yy);
        g.lineTo(px + lean * (k + 1.6), yy - ph * 0.3);
        g.lineTo(px + ww / 2 + lean * k, yy);
        g.closePath(); g.fill();
      }
      g.fillStyle = 'rgba(74,52,32,0.85)';
      g.fillRect(px - pw * 0.05 + lean * 3, py - 2, pw * 0.1, ph * 0.1);
    }
    /* back ridge: small hazy pines */
    for (var i = 0; i < 12; i++) {
      var bx = (i / 11) * (w + 60) - 30 + (hash(i, 3) - 0.5) * 36;
      pine(bx, h * 0.36, h * (0.10 + hash(i, 4) * 0.06), 'rgba(110,150,105,0.5)', (hash(i, 5) - 0.5) * 8);
    }
    /* mist band one */
    mist(h * 0.38, 60, tsec * 0.1);
    /* mid band: varied pines, clear of the text zone edges */
    for (var j = 0; j < 10; j++) {
      var mx = (j / 9) * (w + 80) - 40 + (hash(j, 11) - 0.5) * 44;
      if (mx > w * 0.2 && mx < w * 0.8 && hash(j, 12) > 0.35) mx += (mx < w / 2 ? -1 : 1) * w * 0.22;
      pine(mx, h * 0.56, h * (0.16 + hash(j, 13) * 0.09), 'rgba(58,96,58,' + (0.55 + hash(j, 14) * 0.25) + ')', (hash(j, 15) - 0.5) * 12);
    }
    /* mist band two, drifting */
    mist(h * 0.58, 84, -tsec * 0.07 + 2);
    /* ground */
    var gr = g.createLinearGradient(0, h * 0.66, 0, h);
    gr.addColorStop(0, 'rgba(44,68,41,0)'); gr.addColorStop(1, 'rgba(22,36,20,0.9)');
    g.fillStyle = gr; g.fillRect(0, h * 0.66, w, h * 0.34);
    /* front framing pines: big, dark, at the edges only */
    pine(w * 0.06, h * 0.92, h * 0.42, '#223c22', 6);
    pine(w * 0.16, h * 0.95, h * 0.3, '#2a4a28', -4);
    pine(w * 0.94, h * 0.92, h * 0.44, '#223c22', -6);
    pine(w * 0.84, h * 0.96, h * 0.3, '#2a4a28', 5);
    /* cardinal perched on the right front pine */
    var cardX = w * 0.9, cardY = h * 0.62 + Math.sin(tsec * 1.3) * 4;
    g.strokeStyle = '#223c22'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(w * 0.86, h * 0.72); g.lineTo(w * 0.94, h * 0.66); g.stroke();
    ell(g, cardX, cardY, 8, 11, '#c0392b');
    ell(g, cardX - 11, cardY + 2, 9, 4.5, '#a93226');
    ell(g, cardX + 3, cardY - 12, 4, 5, '#c0392b');
    ell(g, cardX + 5, cardY - 9, 2, 2.6, '#2b1a12');
    return c;

    function mist(y, bandH, off) {
      var mg = g.createLinearGradient(0, y - bandH / 2, 0, y + bandH / 2);
      mg.addColorStop(0, 'rgba(238,244,228,0)');
      mg.addColorStop(0.5, 'rgba(238,244,228,0.22)');
      mg.addColorStop(1, 'rgba(238,244,228,0)');
      g.fillStyle = mg;
      var moff = Math.sin(off) * 30;
      g.fillRect(-50 + moff, y - bandH / 2, w + 100, bandH);
    }
  }

  /* ---------- night sky: stars, moon, winter aurora ---------- */
  function nightSky(g, w, h, tsec, winter) {
    for (var i = 0; i < 70; i++) {
      var sx = hash(i, 801) * w, sy = hash(i, 802) * h * 0.62;
      g.globalAlpha = (0.35 + 0.65 * Math.abs(Math.sin(tsec * 1.5 + i))) * 0.9;
      g.fillStyle = '#fff';
      g.fillRect(sx, sy, 2, 2);
    }
    g.globalAlpha = 1;
    var mx = w * 0.78, my = h * 0.13;
    var mg = g.createRadialGradient(mx, my, 20, mx, my, 95);
    mg.addColorStop(0, 'rgba(244,240,220,0.4)'); mg.addColorStop(1, 'rgba(244,240,220,0)');
    g.fillStyle = mg; g.fillRect(mx - 95, my - 95, 190, 190);
    g.fillStyle = '#f4f0dc';
    g.beginPath(); g.arc(mx, my, 24, 0, 6.2832); g.fill();
    g.fillStyle = 'rgba(190,185,160,0.55)';
    g.beginPath(); g.arc(mx - 8, my - 5, 5.5, 0, 6.2832); g.fill();
    g.beginPath(); g.arc(mx + 7, my + 8, 4, 0, 6.2832); g.fill();
    g.beginPath(); g.arc(mx + 2, my - 11, 3, 0, 6.2832); g.fill();
    if (winter) {
      for (var b = 0; b < 3; b++) {
        var yb = h * (0.07 + b * 0.07);
        var hue = 140 + b * 30 + Math.sin(tsec * 0.4 + b) * 20;
        var ag = g.createLinearGradient(0, yb - 30, 0, yb + 30);
        ag.addColorStop(0, 'hsla(' + hue + ',60%,60%,0)');
        ag.addColorStop(0.5, 'hsla(' + hue + ',60%,60%,0.16)');
        ag.addColorStop(1, 'hsla(' + hue + ',60%,60%,0)');
        g.fillStyle = ag;
        g.beginPath(); g.moveTo(0, yb);
        for (var x = 0; x <= w; x += 40)
          g.lineTo(x, yb + Math.sin(x * 0.01 + tsec * 0.5 + b * 2) * 18);
        g.lineTo(w, yb + 34); g.lineTo(0, yb + 34); g.closePath(); g.fill();
      }
    }
  }

  return {
    tree: tree, mushroom: mushroom, animal: animal, fire: fire, dung: dung,
    drawWeb: drawWeb, gameBG: gameBG, titleBG: titleBG, hash: hash, nightSky: nightSky,
    lilyPad: lilyPad, koi: koi, dragonfly: dragonfly, cracks: cracks,
    roots: roots, mycelium: mycelium, underground: underground
  };
})();
