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

  /* ---------- soil ---------- */
  function soil(v) {
    return get('soil' + v, function (g) {
      var base = ['#5a4630', '#54422c', '#5e4a33', '#52402b'][v % 4];
      g.fillStyle = base;
      g.beginPath(); g.roundRect(2, 2, S - 4, S - 4, 22); g.fill();
      /* speckles */
      for (var i = 0; i < 26; i++) {
        var h1 = hash(v * 31 + i, i * 7 + v), h2 = hash(i * 13, v * 17 + i);
        g.fillStyle = h1 > 0.5 ? 'rgba(0,0,0,0.13)' : 'rgba(255,240,210,0.07)';
        g.beginPath(); g.arc(8 + h1 * (S - 16), 8 + h2 * (S - 16), 1.5 + h2 * 3, 0, 6.2832); g.fill();
      }
      /* soft inner edge */
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 5;
      g.beginPath(); g.roundRect(4, 4, S - 8, S - 8, 20); g.stroke();
    });
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
    oak:   { trunk: '#5d4227', c1: '#3a7a38', c2: '#4c8c42', c3: '#2c5e2e', oak: true }
  };
  function tree(type, stage, v) {
    return get('tree' + type + stage + 'v' + (v % 3), function (g) {
      var st = TREE_STYLE[type], cx = S / 2, baseY = S - 14;
      var j = hash(v, stage) - 0.5;
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
        trunk(g, cx, baseY, 13, 34, st.trunk);
        if (st.pine) {
          for (var i = 0; i < 3; i++) {
            var w = 44 - i * 11, y = baseY - 30 - i * 20;
            g.fillStyle = [st.c3, st.c1, st.c2][i];
            g.beginPath(); g.moveTo(cx - w / 2, y); g.lineTo(cx, y - 22); g.lineTo(cx + w / 2, y); g.closePath(); g.fill();
          }
        } else canopy(g, cx, baseY - 52, 30, st.c1, st.c2, st.c3, v);
        if (st.berry) for (var b = 0; b < 4; b++) {
          ell(g, cx - 18 + hash(b, v) * 36, baseY - 60 + hash(b * 3, v) * 26, 4, 4, '#c94f5e');
        }
      } else if (stage === 4 || stage === 5) { /* adult / ancient */
        var big = stage === 5 ? 1.18 : 1;
        trunk(g, cx, baseY, 20 * big, 62, st.trunk);
        if (st.pine) {
          for (var k = 0; k < 4; k++) {
            var w2 = (62 - k * 12) * big, y2 = baseY - 52 - k * 24;
            g.fillStyle = [st.c3, st.c1, st.c2, st.c1][k];
            g.beginPath(); g.moveTo(cx - w2 / 2, y2); g.lineTo(cx + j * 6, y2 - 30 * big); g.lineTo(cx + w2 / 2, y2); g.closePath(); g.fill();
          }
        } else {
          canopy(g, cx + j * 8, baseY - 92 * big, 46 * big, st.c1, st.c2, st.c3, v + stage);
          canopy(g, cx - 26 + j * 8, baseY - 66, 26, st.c2, st.c3, st.c1, v + 40);
        }
        if (st.berry) for (var f = 0; f < 10; f++) {
          var fx = cx - 34 + hash(f, v * 2) * 68, fy = baseY - 118 + hash(f * 5, v) * 66;
          ell(g, fx, fy, 5.5, 5.5, '#e8e4da');           /* blossom */
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
        g.fillStyle = st.trunk; g.beginPath(); g.roundRect(-46, -13, 92, 26, 12); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.2)';
        g.beginPath(); g.ellipse(42, 0, 7, 12, 0, 0, 6.2832); g.fill();
        g.strokeStyle = 'rgba(60,40,20,0.5)'; g.lineWidth = 2.5;
        for (var r = -30; r < 36; r += 14) { g.beginPath(); g.moveTo(r, -11); g.lineTo(r + 5, 11); g.stroke(); }
        /* moss cap + tiny mushrooms */
        ell(g, -20, -13, 16, 6, '#5d8a48'); ell(g, 14, -14, 12, 5, '#5d8a48');
        g.fillStyle = '#e8dcc2'; g.fillRect(-26, -24, 5, 10); ell(g, -23.5, -25, 7, 5, '#c96a5e');
        g.fillRect(20, -22, 4, 8); ell(g, 22, -23, 5.5, 4, '#c96a5e');
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
      if (sp === 'squirrel') {
        ell(g, cx + 20, cy + 6, 16, 26, '#a06a3c');            /* tail */
        ell(g, cx + 20, cy - 12, 10, 12, '#8a5a32');
        ell(g, cx, cy + 8, 17, 21, '#b57a44');                 /* body */
        ell(g, cx, cy - 14, 14, 13, '#c08a52');                /* head */
        ell(g, cx - 9, cy - 26, 5, 8, '#b57a44'); ell(g, cx + 9, cy - 26, 5, 8, '#b57a44');
        ell(g, cx - 9, cy - 26, 2.4, 4.5, '#8a5a32'); ell(g, cx + 9, cy - 26, 2.4, 4.5, '#8a5a32');
        eye(cx - 6, cy - 14, 3.4); eye(cx + 6, cy - 14, 3.4);
        ell(g, cx, cy - 6, 5, 3.6, '#f0d9b5');                 /* muzzle */
      } else if (sp === 'rabbit') {
        ell(g, cx, cy + 10, 19, 16, '#b9a58e');
        ell(g, cx - 7, cy - 22, 7, 20, '#b9a58e'); ell(g, cx + 7, cy - 22, 7, 20, '#b9a58e');
        ell(g, cx - 7, cy - 22, 3.4, 13, '#e8c9c9'); ell(g, cx + 7, cy - 22, 3.4, 13, '#e8c9c9');
        ell(g, cx, cy - 2, 15, 14, '#c4b096');
        eye(cx - 6, cy - 4, 3.4); eye(cx + 6, cy - 4, 3.4);
        ell(g, cx, cy + 3, 3, 2.4, '#d98a94');
      } else if (sp === 'butterfly') {
        var w1 = '#e89bc0', w2 = '#c96a9a';
        ell(g, cx - 13, cy - 6, 14, 19, w1); ell(g, cx + 13, cy - 6, 14, 19, w1);
        ell(g, cx - 12, cy + 14, 10, 12, w2); ell(g, cx + 12, cy + 14, 10, 12, w2);
        ell(g, cx - 13, cy - 8, 4, 4, '#fff'); ell(g, cx + 11, cy + 2, 3, 3, '#fff');
        g.fillStyle = '#4a3423'; g.beginPath(); g.ellipse(cx, cy + 2, 4.5, 13, 0, 0, 6.2832); g.fill();
        g.strokeStyle = '#4a3423'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(cx - 2, cy - 10); g.quadraticCurveTo(cx - 8, cy - 22, cx - 12, cy - 24); g.stroke();
        g.beginPath(); g.moveTo(cx + 2, cy - 10); g.quadraticCurveTo(cx + 8, cy - 22, cx + 12, cy - 24); g.stroke();
      } else if (sp === 'fox') {
        ell(g, cx + 22, cy + 10, 20, 9, '#c9722e'); ell(g, cx + 36, cy + 8, 8, 7, '#f0e2cc');
        ell(g, cx, cy + 8, 22, 17, '#d07f36');
        ell(g, cx, cy - 10, 16, 15, '#dd8f42');
        ell(g, cx - 11, cy - 24, 7, 10, '#d07f36'); ell(g, cx + 11, cy - 24, 7, 10, '#d07f36');
        ell(g, cx - 11, cy - 24, 3.4, 5.5, '#8a4a1e'); ell(g, cx + 11, cy - 24, 3.4, 5.5, '#8a4a1e');
        ell(g, cx, cy - 2, 9, 6.5, '#f0e2cc');
        eye(cx - 7, cy - 12, 3.6); eye(cx + 7, cy - 12, 3.6);
        ell(g, cx, cy - 5, 3.4, 2.8, '#3a2415');
      } else if (sp === 'owl') {
        ell(g, cx, cy + 4, 20, 24, '#8a6f4d');
        ell(g, cx, cy + 12, 14, 15, '#a8895f');
        ell(g, cx - 8, cy - 20, 6, 8, '#8a6f4d'); ell(g, cx + 8, cy - 20, 6, 8, '#8a6f4d');
        ell(g, cx - 8, cy - 6, 9, 10, '#f0e6cc'); ell(g, cx + 8, cy - 6, 9, 10, '#f0e6cc');
        eye(cx - 8, cy - 6, 4.6); eye(cx + 8, cy - 6, 4.6);
        ell(g, cx, cy + 1, 3.6, 4.6, '#e9a13b');
        g.strokeStyle = 'rgba(60,40,20,0.4)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(cx - 20, cy + 2); g.lineTo(cx - 28, cy + 8); g.stroke();
        g.beginPath(); g.moveTo(cx + 20, cy + 2); g.lineTo(cx + 28, cy + 8); g.stroke();
      } else if (sp === 'deer') {
        ell(g, cx, cy + 12, 24, 18, '#a97e4f');
        g.fillStyle = '#a97e4f';
        g.fillRect(cx - 16, cy + 20, 7, 22); g.fillRect(cx + 9, cy + 20, 7, 22);
        ell(g, cx, cy - 14, 14, 17, '#b58a58');
        ell(g, cx - 10, cy - 28, 5, 9, '#a97e4f'); ell(g, cx + 10, cy - 28, 5, 9, '#a97e4f');
        g.strokeStyle = '#7a5a36'; g.lineWidth = 3.4; g.lineCap = 'round';
        g.beginPath(); g.moveTo(cx - 6, cy - 30); g.lineTo(cx - 14, cy - 44); g.moveTo(cx - 10, cy - 38); g.lineTo(cx - 18, cy - 40); g.stroke();
        g.beginPath(); g.moveTo(cx + 6, cy - 30); g.lineTo(cx + 14, cy - 44); g.moveTo(cx + 10, cy - 38); g.lineTo(cx + 18, cy - 40); g.stroke();
        for (var sI = 0; sI < 5; sI++) ell(g, cx - 12 + hash(sI, 3) * 24, cy + 4 + hash(sI, 7) * 16, 2.6, 2.6, '#f0e6cc');
        eye(cx - 6, cy - 14, 3.4); eye(cx + 6, cy - 14, 3.4);
      } else if (sp === 'hedgehog') {
        ell(g, cx, cy + 8, 22, 15, '#6e5138');
        g.fillStyle = '#7d5f42';
        for (var q = 0; q < 16; q++) {
          var qa = (q / 16) * 6.2832, qx = cx + Math.cos(qa) * 19, qy = cy + 6 + Math.sin(qa) * 12;
          g.beginPath(); g.moveTo(qx, qy); g.lineTo(qx + Math.cos(qa) * 9, qy + Math.sin(qa) * 9 - 3); g.lineTo(qx + 4, qy + 2); g.closePath(); g.fill();
        }
        ell(g, cx + 14, cy + 10, 10, 8, '#c9a97e');
        eye(cx + 16, cy + 7, 2.8);
        ell(g, cx + 23, cy + 11, 2.4, 2, '#3a2415');
      } else if (sp === 'frog') {
        ell(g, cx, cy + 10, 20, 14, '#5da34f');
        ell(g, cx - 12, cy - 6, 9, 9, '#5da34f'); ell(g, cx + 12, cy - 6, 9, 9, '#5da34f');
        ell(g, cx - 12, cy - 8, 6.5, 6.5, '#8fce6e'); ell(g, cx + 12, cy - 8, 6.5, 6.5, '#8fce6e');
        eye(cx - 12, cy - 8, 3.6); eye(cx + 12, cy - 8, 3.6);
        g.strokeStyle = '#3c6e36'; g.lineWidth = 2.4;
        g.beginPath(); g.arc(cx, cy + 8, 9, 0.3, 2.84); g.stroke();
        for (var dI = 0; dI < 4; dI++) ell(g, cx - 10 + hash(dI, 11) * 20, cy + 4 + hash(dI, 13) * 10, 2.4, 2.4, '#3c6e36');
      }
    });
  }

  /* ---------- network glow threads ---------- */
  function drawThreads(g, ox, oy, ts, links, tsec) {
    g.save();
    g.strokeStyle = 'rgba(190,235,165,' + (0.5 + 0.2 * Math.sin(tsec * 2.4)) + ')';
    g.lineWidth = Math.max(2.5, ts * 0.06); g.lineCap = 'round';
    g.shadowColor = 'rgba(150,220,130,0.9)'; g.shadowBlur = 10;
    for (var i = 0; i < links.length; i++) {
      var L = links[i];
      g.beginPath();
      g.moveTo(ox + L.x1 * ts + ts / 2, oy + L.y1 * ts + ts * 0.72);
      g.quadraticCurveTo(
        ox + (L.x1 + L.x2) / 2 * ts + ts / 2, oy + (L.y1 + L.y2) / 2 * ts + ts * 0.95,
        ox + L.x2 * ts + ts / 2, oy + L.y2 * ts + ts * 0.72);
      g.stroke();
    }
    g.restore();
  }

  /* ---------- backgrounds ---------- */
  function gameBG(w, h, tsec) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d');
    var sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#9dc3a5'); sky.addColorStop(0.45, '#7ba76f'); sky.addColorStop(1, '#4a6b3f');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    /* distant treeline */
    g.fillStyle = '#3d6034';
    g.beginPath(); g.moveTo(0, h * 0.34);
    for (var x = 0; x <= w; x += 24) g.lineTo(x, h * 0.34 - 14 - hash(x, 7) * 44 - (hash(x, 13) > 0.7 ? 26 : 0));
    g.lineTo(w, h * 0.42); g.lineTo(0, h * 0.42); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,250,220,0.10)';
    for (var i = 0; i < 26; i++) {
      var lx = hash(i, 21) * w, lw = 20 + hash(i, 22) * 46;
      g.save(); g.translate(lx, 0); g.rotate(0.22);
      g.fillRect(0, -40, lw, h * 0.75); g.restore();
    }
    /* drifting motes */
    g.fillStyle = 'rgba(255,250,220,0.5)';
    for (var m = 0; m < 22; m++) {
      var mx = (hash(m, 31) * w + tsec * (6 + hash(m, 32) * 10)) % w;
      var my = hash(m, 33) * h * 0.7 + Math.sin(tsec * 0.9 + m) * 12;
      g.beginPath(); g.arc(mx, my, 1.4 + hash(m, 34) * 1.6, 0, 6.2832); g.fill();
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

  return {
    soil: soil, tree: tree, mushroom: mushroom, animal: animal,
    drawThreads: drawThreads, gameBG: gameBG, titleBG: titleBG, hash: hash
  };
})();
