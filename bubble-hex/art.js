/* Bubble Hex — art.js
 * All sprite pre-rendering + painterly background layers.
 * Everything is drawn once to offscreen canvases at load; the game loop
 * only blits. Cap DPR at 2. All characters are original vector art.
 */
(function () {
  'use strict';

  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  function mkCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * DPR));
    c.height = Math.max(1, Math.round(h * DPR));
    var x = c.getContext('2d');
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    return [c, x, w, h];
  }

  function circle(x, px, py, r) { x.beginPath(); x.arc(px, py, r, 0, 7); }
  function ell(x, px, py, rx, ry, rot) {
    x.beginPath(); x.ellipse(px, py, rx, ry, rot || 0, 0, 7);
  }

  /* ---------------- Bubbles ----------------
   * Glossy jewel orbs, layered: gemstone base gradient (light crown →
   * saturated mid → deep base → dark edge), big soft crescent highlight,
   * hot dot, inner sparkle, bottom bounce-light, bright rim light. */
  var BUBBLE_BASE = {
    R: ['#ff9db0', '#ff5f82', '#d81f4c', '#7d0c28'],
    B: ['#a8d4ff', '#5fa8f5', '#2f6fd6', '#123a7d'],
    G: ['#b8ffcc', '#5ff59a', '#22c75f', '#0c6e32'],
    Y: ['#fff7b8', '#ffe14d', '#f0b41a', '#8a5f06'],
    P: ['#eec2ff', '#c47df5', '#9333e0', '#4d1485'],
    K: ['#6a5586', '#453563', '#241a38', '#0a0614'], // black doom bubble (BWS3 trouble bubble)
    W: null // rainbow — special
  };
  var BUBBLE_GLOW = { R: '#ff5f82', B: '#5fa8f5', G: '#5ff59a', Y: '#ffe14d', P: '#c47df5', K: '#c44dff', W: '#ffffff', X: '#8a8a9a' };

  var bubbleCache = {};

  function paintBubble(key) {
    var S = 96, r = 44, cx = 48, cy = 48;
    var cv = mkCanvas(S, S), c = cv[0], x = cv[1];
    var isRainbow = key[0] === 'W';
    var special = key.length > 1 ? key.slice(1) : '';

    if (isRainbow) {
      // rainbow: conic-ish sweep approximated with arcs of spectral bands
      var bands = ['#ff5f6d', '#ffb35f', '#fff35f', '#5fff8a', '#5fb8ff', '#c45fff'];
      for (var i = 0; i < bands.length; i++) {
        x.fillStyle = bands[i];
        x.beginPath();
        x.arc(cx, cy, r, -Math.PI / 2 + i * (Math.PI * 2 / bands.length),
          -Math.PI / 2 + (i + 1.15) * (Math.PI * 2 / bands.length));
        x.lineTo(cx, cy); x.closePath(); x.fill();
      }
      var sheen = x.createRadialGradient(cx - 12, cy - 14, 4, cx, cy, r);
      sheen.addColorStop(0, 'rgba(255,255,255,.85)');
      sheen.addColorStop(0.5, 'rgba(255,255,255,.12)');
      sheen.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = sheen; circle(x, cx, cy, r); x.fill();
    } else {
      var cols = BUBBLE_BASE[key[0]];
      // gemstone base: light crown → saturated mid → deep base → dark edge
      var g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.08, cx, cy, r * 1.08);
      g.addColorStop(0, cols[0]);
      g.addColorStop(0.42, cols[1]);
      g.addColorStop(0.82, cols[2]);
      g.addColorStop(1, cols[3]);
      x.fillStyle = g; circle(x, cx, cy, r); x.fill();
      // inner depth shadow bottom
      var g2 = x.createRadialGradient(cx, cy + r * 0.55, r * 0.1, cx, cy + r * 0.55, r * 0.9);
      g2.addColorStop(0, 'rgba(0,0,0,.35)');
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g2; circle(x, cx, cy, r); x.fill();
      // inner facet sheen (gemstone cut feel)
      x.fillStyle = 'rgba(255,255,255,.10)';
      x.beginPath();
      x.moveTo(cx - r * 0.5, cy + r * 0.1);
      x.lineTo(cx, cy - r * 0.55); x.lineTo(cx + r * 0.5, cy + r * 0.1);
      x.lineTo(cx, cy + r * 0.42); x.closePath(); x.fill();
      // big crescent highlight
      x.fillStyle = 'rgba(255,255,255,.55)';
      x.beginPath();
      x.ellipse(cx - r * 0.32, cy - r * 0.38, r * 0.36, r * 0.21, -0.6, 0, 7);
      x.fill();
      // hot dot
      x.fillStyle = 'rgba(255,255,255,.95)';
      circle(x, cx - r * 0.40, cy - r * 0.48, r * 0.10); x.fill();
      // inner sparkle (tiny 4-point star)
      sparkle4(x, cx + r * 0.26, cy + r * 0.18, r * 0.13, 'rgba(255,255,255,.75)');
      sparkle4(x, cx - r * 0.12, cy + r * 0.34, r * 0.08, 'rgba(255,255,255,.5)');
      // bottom bounce light
      x.fillStyle = 'rgba(255,255,255,.22)';
      x.beginPath();
      x.ellipse(cx + r * 0.15, cy + r * 0.55, r * 0.35, r * 0.12, 0.25, 0, 7);
      x.fill();
    }
    // rim: dark edge + bright rim-light arc
    x.strokeStyle = 'rgba(10,4,24,.55)'; x.lineWidth = 3;
    circle(x, cx, cy, r - 1.5); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 2.5;
    x.beginPath(); x.arc(cx, cy, r - 3, -2.6, -0.4); x.stroke();

    // black doom bubble: cursed purple cracks
    if (key[0] === 'K') {
      x.save();
      x.shadowColor = '#c44dff'; x.shadowBlur = 8;
      x.strokeStyle = '#c44dff'; x.lineWidth = 2.5;
      x.beginPath(); x.moveTo(cx - 16, cy - 20); x.lineTo(cx - 4, cy - 4); x.lineTo(cx - 14, cy + 14); x.stroke();
      x.beginPath(); x.moveTo(cx + 14, cy - 16); x.lineTo(cx + 4, cy + 2); x.lineTo(cx + 16, cy + 18); x.stroke();
      x.beginPath(); x.moveTo(cx - 4, cy - 4); x.lineTo(cx + 4, cy + 2); x.stroke();
      x.restore();
      x.fillStyle = 'rgba(196,77,255,.85)';
      circle(x, cx - 8, cy - 10, 3); x.fill();
      circle(x, cx + 10, cy + 12, 2.4); x.fill();
    }

    // special overlays
    if (special === 'bomb' || special === 'light') {
      x.save();
      x.shadowColor = special === 'bomb' ? '#ff9d2e' : '#fff35f';
      x.shadowBlur = 14;
      x.fillStyle = '#fff';
      x.font = 'bold 34px ui-rounded, system-ui, sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(special === 'bomb' ? '✸' : '⚡', cx, cy + 2);
      x.restore();
    }
    if (key[0] === 'W' && !special) {
      x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 3;
      circle(x, cx, cy, r - 4); x.stroke();
    }
    return c;
  }

  function bubbleSprite(key) {
    if (!bubbleCache[key]) bubbleCache[key] = paintBubble(key);
    return bubbleCache[key];
  }

  function paintBlocker() {
    var S = 96, r = 44, cx = 48, cy = 48;
    var cv = mkCanvas(S, S), c = cv[0], x = cv[1];
    var g = x.createRadialGradient(cx - 10, cy - 12, 6, cx, cy, r);
    g.addColorStop(0, '#6a6a80'); g.addColorStop(0.6, '#3d3d52'); g.addColorStop(1, '#1e1e2c');
    x.fillStyle = g; circle(x, cx, cy, r); x.fill();
    // cracks
    x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 2.5;
    x.beginPath(); x.moveTo(cx - 18, cy - 20); x.lineTo(cx - 4, cy - 2); x.lineTo(cx - 14, cy + 16); x.stroke();
    x.beginPath(); x.moveTo(cx + 16, cy - 14); x.lineTo(cx + 6, cy + 6); x.lineTo(cx + 18, cy + 20); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,.18)'; x.lineWidth = 2;
    x.beginPath(); x.arc(cx, cy, r - 4, -2.6, -1.2); x.stroke();
    x.strokeStyle = 'rgba(8,4,18,.6)'; x.lineWidth = 3;
    circle(x, cx, cy, r - 1.5); x.stroke();
    return c;
  }
  var blockerSprite = null;

  /* ---------------- Characters ---------------- */

  // Stella — original chibi witch. Anchor: feet center. ~120px tall.
  var stellaCache = {};
  function paintStella(pose) {
    var Wd = 120, Ht = 132;
    var cv = mkCanvas(Wd, Ht), c = cv[0], x = cv[1];
    var cx = 60;
    var lean = pose === 'cast' ? -6 : (pose === 'aim' ? 2 : 0);
    x.translate(cx + lean, 0);

    var bobY = 0;
    // robe (violet, star pattern)
    var rg = x.createLinearGradient(0, 60, 0, 128);
    rg.addColorStop(0, '#7b4fd6'); rg.addColorStop(1, '#472a86');
    x.fillStyle = rg;
    x.beginPath();
    x.moveTo(-26, 66); x.quadraticCurveTo(-30, 104, -36, 126);
    x.lineTo(36, 126); x.quadraticCurveTo(30, 104, 26, 66);
    x.closePath(); x.fill();
    // robe shading
    x.fillStyle = 'rgba(0,0,0,.22)';
    x.beginPath(); x.moveTo(8, 66); x.quadraticCurveTo(12, 100, 14, 126); x.lineTo(36, 126); x.quadraticCurveTo(30, 104, 26, 66); x.closePath(); x.fill();
    // stars on robe
    x.fillStyle = '#ffd34d';
    [[-14, 92], [10, 104], [-4, 116]].forEach(function (p) {
      x.save(); x.translate(p[0], p[1] + bobY * 0); x.rotate(0.3);
      star(x, 0, 0, 5, 2.2); x.fill(); x.restore();
    });
    // belt
    x.fillStyle = '#2c1a52'; x.fillRect(-24, 78, 48, 7);
    x.fillStyle = '#ffd34d'; circle(x, 0, 81.5, 4); x.fill();

    // head
    var hy = 46;
    var hg = x.createRadialGradient(-6, hy - 8, 4, 0, hy, 24);
    hg.addColorStop(0, '#ffd9b8'); hg.addColorStop(1, '#f0a97e');
    x.fillStyle = hg; circle(x, 0, hy, 21); x.fill();
    // hair (auburn bob)
    x.fillStyle = '#b34a2e';
    x.beginPath(); x.arc(0, hy - 4, 22, Math.PI * 1.02, Math.PI * 1.98); x.fill();
    circle(x, -20, hy + 2, 7); x.fill(); circle(x, 20, hy + 2, 7); x.fill();
    // eyes
    x.fillStyle = '#2a1633';
    var eyeY = hy + 2, look = pose === 'aim' ? 1.5 : 0;
    if (pose === 'sad') {
      // closed, downcast eyes
      x.strokeStyle = '#2a1633'; x.lineWidth = 2.4; x.lineCap = 'round';
      x.beginPath(); x.arc(-8, eyeY - 1, 4.5, 0.3, Math.PI - 0.3); x.stroke();
      x.beginPath(); x.arc(8, eyeY - 1, 4.5, 0.3, Math.PI - 0.3); x.stroke();
      x.fillStyle = '#2a1633';
      // tear
      x.fillStyle = 'rgba(140,200,255,.9)';
      x.beginPath(); x.ellipse(-13, eyeY + 8, 2.2, 3.4, 0, 0, 7); x.fill();
    } else if (pose === 'win') {
      // happy ^ ^ eyes
      x.strokeStyle = '#2a1633'; x.lineWidth = 2.8; x.lineCap = 'round';
      x.beginPath(); x.arc(-8, eyeY + 2, 5, Math.PI + 0.3, -0.3); x.stroke();
      x.beginPath(); x.arc(8, eyeY + 2, 5, Math.PI + 0.3, -0.3); x.stroke();
      x.fillStyle = '#2a1633';
    } else {
      ell(x, -8, eyeY, 3.4, 4.4); x.fill(); ell(x, 8, eyeY, 3.4, 4.4); x.fill();
      x.fillStyle = '#fff';
      circle(x, -8 + look + 1.2, eyeY - 1.5, 1.3); x.fill();
      circle(x, 8 + look + 1.2, eyeY - 1.5, 1.3); x.fill();
    }
    // cheeks + smile
    x.fillStyle = 'rgba(255,120,130,.5)';
    circle(x, -13, eyeY + 7, 3.4); x.fill(); circle(x, 13, eyeY + 7, 3.4); x.fill();
    x.strokeStyle = '#5a2c1e'; x.lineWidth = 2; x.lineCap = 'round';
    if (pose === 'sad') {
      x.beginPath(); x.arc(0, eyeY + 12, 6, Math.PI + 0.35, -0.35); x.stroke(); // frown
    } else if (pose === 'win') {
      x.fillStyle = '#7a2c1e';
      x.beginPath(); x.ellipse(0, eyeY + 8, 6.5, 5, 0, 0, 7); x.fill(); // open happy mouth
    } else {
      x.beginPath(); x.arc(0, eyeY + 5, 6, 0.35, Math.PI - 0.35); x.stroke();
    }

    // witch hat
    var hg2 = x.createLinearGradient(0, -18, 0, 28);
    hg2.addColorStop(0, '#3a2066'); hg2.addColorStop(1, '#241243');
    x.fillStyle = hg2;
    x.beginPath();
    x.moveTo(-24, 30);
    x.quadraticCurveTo(-10, 2, -2, -16);   // left side up to bent tip
    x.quadraticCurveTo(4, -26, 12, -30);   // tip flop
    x.quadraticCurveTo(8, -18, 10, -6);
    x.quadraticCurveTo(14, 10, 24, 30);
    x.closePath(); x.fill();
    x.fillStyle = '#241243';
    ell(x, 0, 30, 34, 9); x.fill();          // brim
    x.fillStyle = '#ffd34d'; x.fillRect(-13, 20, 26, 6); // hat band
    x.fillStyle = '#ff8a3d'; star(x, 0, 23, 6, 2.6); x.fill();

    // arms + wand (right arm raised when aiming/casting; both up for win)
    x.strokeStyle = '#f0a97e'; x.lineWidth = 7; x.lineCap = 'round';
    if (pose === 'win') {
      x.beginPath(); x.moveTo(-16, 74); x.quadraticCurveTo(-30, 60, -34, 44); x.stroke(); // left arm up
    } else {
      x.beginPath(); x.moveTo(-16, 74); x.quadraticCurveTo(-26, 86, -24, 96); x.stroke(); // left arm
    }
    var wandAng = pose === 'win' ? -1.9 : (pose === 'cast' ? -1.15 : (pose === 'aim' ? -0.9 : -0.35));
    var ax = 16, ay = 74;
    var hx = ax + Math.cos(wandAng) * 20, hyy = ay + Math.sin(wandAng) * 20;
    x.beginPath(); x.moveTo(ax, ay); x.lineTo(hx, hyy); x.stroke();
    // wand
    x.strokeStyle = '#8a5a2e'; x.lineWidth = 4;
    var wx = hx + Math.cos(wandAng) * 26, wy = hyy + Math.sin(wandAng) * 26;
    x.beginPath(); x.moveTo(hx, hyy); x.lineTo(wx, wy); x.stroke();
    // wand tip star (glow)
    x.save();
    x.shadowColor = '#ffe14d'; x.shadowBlur = pose === 'cast' ? 22 : 10;
    x.fillStyle = '#ffe14d'; star(x, wx, wy, pose === 'cast' ? 11 : 8, 3.6); x.fill();
    x.restore();

    // store wand tip for aim origin (in sprite coords)
    c._wandTip = [cx + lean + wx, wy];
    c._anchor = [cx + lean, 126];
    return c;
  }

  function star(x, px, py, Rr, r2) {
    x.beginPath();
    for (var i = 0; i < 10; i++) {
      var rr = i % 2 === 0 ? Rr : r2;
      var a = -Math.PI / 2 + i * Math.PI / 5;
      var sx = px + Math.cos(a) * rr, sy = py + Math.sin(a) * rr;
      if (i === 0) x.moveTo(sx, sy); else x.lineTo(sx, sy);
    }
    x.closePath();
  }

  // tiny 4-point sparkle (inner bubble glints, idle shimmer)
  function sparkle4(x, px, py, r, fill) {
    x.fillStyle = fill;
    x.beginPath();
    x.moveTo(px, py - r);
    x.quadraticCurveTo(px, py, px + r, py);
    x.quadraticCurveTo(px, py, px, py + r);
    x.quadraticCurveTo(px, py, px - r, py);
    x.quadraticCurveTo(px, py, px, py - r);
    x.closePath(); x.fill();
  }

  function stella(pose) {
    if (!stellaCache[pose]) stellaCache[pose] = paintStella(pose);
    return stellaCache[pose];
  }

  // Nero — black cat familiar. Anchor: bottom center. Sitting ~64px.
  var neroCache = {};
  function paintNero(mouth, paw) {
    var Wd = 76, Ht = 70;
    var cv = mkCanvas(Wd, Ht), c = cv[0], x = cv[1];
    var cx = 38, base = 64;
    // tail (curl)
    x.strokeStyle = '#14101e'; x.lineWidth = 8; x.lineCap = 'round';
    x.beginPath(); x.moveTo(cx + 18, base - 6);
    x.quadraticCurveTo(cx + 34, base - 10, cx + 30, base - 30);
    x.stroke();
    // body
    var bg = x.createRadialGradient(cx - 6, base - 30, 4, cx, base - 22, 24);
    bg.addColorStop(0, '#2c2440'); bg.addColorStop(1, '#14101e');
    x.fillStyle = bg; ell(x, cx, base - 22, 19, 24); x.fill();
    // paws (one raised mid-bat when pawing at the shooter bubble)
    x.fillStyle = '#14101e';
    if (paw) {
      ell(x, cx + 10, base - 2, 8, 5); x.fill();
      x.strokeStyle = '#14101e'; x.lineWidth = 7; x.lineCap = 'round';
      x.beginPath(); x.moveTo(cx - 12, base - 22); x.quadraticCurveTo(cx - 26, base - 34, cx - 30, base - 46); x.stroke();
      ell(x, cx - 30, base - 48, 7, 6, -0.4); x.fill();
    } else {
      ell(x, cx - 10, base - 2, 8, 5); x.fill(); ell(x, cx + 10, base - 2, 8, 5); x.fill();
    }
    // head
    x.fillStyle = '#1a1428'; circle(x, cx, base - 46, 15); x.fill();
    // ears
    x.fillStyle = '#1a1428';
    [[-10, -12], [10, -12]].forEach(function (o) {
      x.beginPath();
      x.moveTo(cx + o[0] - 7, base - 46 + o[1] + 8);
      x.lineTo(cx + o[0], base - 46 + o[1] - 6);
      x.lineTo(cx + o[0] + 7, base - 46 + o[1] + 8);
      x.closePath(); x.fill();
      x.fillStyle = '#5a3a5a';
      x.beginPath();
      x.moveTo(cx + o[0] - 3.5, base - 46 + o[1] + 6);
      x.lineTo(cx + o[0], base - 46 + o[1] - 2);
      x.lineTo(cx + o[0] + 3.5, base - 46 + o[1] + 6);
      x.closePath(); x.fill();
      x.fillStyle = '#1a1428';
    });
    // eyes (green, glowing)
    x.save(); x.shadowColor = '#7dff6a'; x.shadowBlur = 6;
    x.fillStyle = '#8dff5a';
    ell(x, cx - 6.5, base - 48, 4.4, 5.2); x.fill();
    ell(x, cx + 6.5, base - 48, 4.4, 5.2); x.fill();
    x.restore();
    x.fillStyle = '#0c0a12';
    ell(x, cx - 6.5, base - 48, 1.4, 3.4); x.fill();
    ell(x, cx + 6.5, base - 48, 1.4, 3.4); x.fill();
    // nose
    x.fillStyle = '#ff8ab0';
    x.beginPath(); x.moveTo(cx - 2.5, base - 41); x.lineTo(cx + 2.5, base - 41); x.lineTo(cx, base - 38.5); x.closePath(); x.fill();
    // mouth
    if (mouth) {
      x.fillStyle = '#7a1e2e';
      ell(x, cx, base - 34, 6, 7.5); x.fill();
      x.fillStyle = '#ff9db0'; ell(x, cx, base - 31, 3, 3); x.fill();
    } else {
      x.strokeStyle = '#0c0a12'; x.lineWidth = 1.6;
      x.beginPath(); x.moveTo(cx, base - 38.5); x.lineTo(cx, base - 36.5);
      x.moveTo(cx, base - 36.5); x.quadraticCurveTo(cx - 4, base - 34.5, cx - 7, base - 37);
      x.moveTo(cx, base - 36.5); x.quadraticCurveTo(cx + 4, base - 34.5, cx + 7, base - 37);
      x.stroke();
    }
    // whiskers
    x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 1;
    [[-1, -44, -1, -40], [-1, -46, -1, -42], [1, -44, 1, -40], [1, -46, 1, -42]].forEach(function (w) {
      x.beginPath(); x.moveTo(cx + w[0] * 12, base + w[1]); x.lineTo(cx + w[2] * 24, base + w[3]); x.stroke();
    });
    return c;
  }
  function nero(mouth, paw) {
    var k = (mouth ? 'open' : 'shut') + (paw ? '-paw' : '');
    if (!neroCache[k]) neroCache[k] = paintNero(mouth, paw);
    return neroCache[k];
  }

  // Owl familiar (drawn inside its bubble). ~r*1.5 tall.
  var owlSprite = null;
  function paintOwl() {
    var S = 72;
    var cv = mkCanvas(S, S), c = cv[0], x = cv[1];
    var cx = 36, cy = 38;
    // ear tufts
    x.fillStyle = '#7a4a22';
    x.beginPath(); x.moveTo(cx - 16, cy - 16); x.lineTo(cx - 22, cy - 30); x.lineTo(cx - 8, cy - 20); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(cx + 16, cy - 16); x.lineTo(cx + 22, cy - 30); x.lineTo(cx + 8, cy - 20); x.closePath(); x.fill();
    // body
    var bg = x.createRadialGradient(cx - 8, cy - 10, 4, cx, cy, 24);
    bg.addColorStop(0, '#a06a35'); bg.addColorStop(1, '#5f3a18');
    x.fillStyle = bg; circle(x, cx, cy, 22); x.fill();
    // belly
    x.fillStyle = '#e8c890'; ell(x, cx, cy + 8, 13, 11); x.fill();
    // wings
    x.fillStyle = '#4a2c12';
    ell(x, cx - 20, cy + 4, 7, 12, 0.4); x.fill();
    ell(x, cx + 20, cy + 4, 7, 12, -0.4); x.fill();
    // big eyes
    x.fillStyle = '#fff'; circle(x, cx - 9, cy - 8, 9); x.fill(); circle(x, cx + 9, cy - 8, 9); x.fill();
    x.fillStyle = '#241408'; circle(x, cx - 9, cy - 8, 4.2); x.fill(); circle(x, cx + 9, cy - 8, 4.2); x.fill();
    x.fillStyle = '#fff'; circle(x, cx - 7.5, cy - 9.5, 1.5); x.fill(); circle(x, cx + 10.5, cy - 9.5, 1.5); x.fill();
    // beak
    x.fillStyle = '#ff9d2e';
    x.beginPath(); x.moveTo(cx - 4, cy); x.lineTo(cx + 4, cy); x.lineTo(cx, cy + 6); x.closePath(); x.fill();
    // feet
    x.strokeStyle = '#ff9d2e'; x.lineWidth = 2.5;
    x.beginPath(); x.moveTo(cx - 8, cy + 21); x.lineTo(cx - 8, cy + 25); x.moveTo(cx + 8, cy + 21); x.lineTo(cx + 8, cy + 25); x.stroke();
    return c;
  }

  // Wilbur — evil cat mage (BWS3's villain). Anchor: bottom center.
  var wilburCache = {};
  function paintWilbur(hit) {
    var Wd = 130, Ht = 132;
    var cv = mkCanvas(Wd, Ht), c = cv[0], x = cv[1];
    var cx = 65, base = 124;
    x.translate(hit ? 5 : 0, hit ? -3 : 0);
    // tattered cape
    x.fillStyle = hit ? '#3a1a3a' : '#2a1230';
    x.beginPath();
    x.moveTo(cx - 34, base - 60);
    x.quadraticCurveTo(cx - 46, base - 20, cx - 40, base - 4);
    x.lineTo(cx - 28, base - 12); x.lineTo(cx - 22, base - 2);
    x.lineTo(cx - 12, base - 12); x.lineTo(cx - 4, base - 2);
    x.lineTo(cx + 4, base - 10);
    x.quadraticCurveTo(cx + 10, base - 40, cx + 30, base - 58);
    x.closePath(); x.fill();
    // body (big dark cat)
    var bg = x.createRadialGradient(cx - 10, base - 60, 6, cx, base - 48, 34);
    bg.addColorStop(0, hit ? '#4a2a5a' : '#33204a');
    bg.addColorStop(1, '#120a20');
    x.fillStyle = bg; ell(x, cx, base - 48, 30, 36); x.fill();
    // paws gripping branch
    x.fillStyle = '#120a20';
    ell(x, cx - 13, base - 8, 9, 6); x.fill(); ell(x, cx + 13, base - 8, 9, 6); x.fill();
    // tail with spiked tip
    x.strokeStyle = '#1c1028'; x.lineWidth = 9; x.lineCap = 'round';
    x.beginPath(); x.moveTo(cx + 26, base - 30);
    x.quadraticCurveTo(cx + 48, base - 36, cx + 44, base - 58); x.stroke();
    x.fillStyle = '#5a2a7a';
    x.beginPath(); x.moveTo(cx + 44, base - 70); x.lineTo(cx + 36, base - 52); x.lineTo(cx + 52, base - 52); x.closePath(); x.fill();
    // head
    x.fillStyle = '#241640'; circle(x, cx, base - 88, 24); x.fill();
    // ears
    x.fillStyle = '#241640';
    [[-15, -18], [15, -18]].forEach(function (o) {
      x.beginPath();
      x.moveTo(cx + o[0] - 10, base - 88 + o[1] + 12);
      x.lineTo(cx + o[0], base - 88 + o[1] - 8);
      x.lineTo(cx + o[0] + 10, base - 88 + o[1] + 12);
      x.closePath(); x.fill();
    });
    // sorcerer hat (tall, bent, tattered brim)
    var hg = x.createLinearGradient(0, base - 160, 0, base - 96);
    hg.addColorStop(0, '#3a2066'); hg.addColorStop(1, '#1c0f33');
    x.fillStyle = hg;
    x.beginPath();
    x.moveTo(cx - 26, base - 100);
    x.quadraticCurveTo(cx - 14, base - 132, cx - 2, base - 150);
    x.quadraticCurveTo(cx + 8, base - 160, cx + 18, base - 156);
    x.quadraticCurveTo(cx + 8, base - 144, cx + 12, base - 128);
    x.quadraticCurveTo(cx + 18, base - 112, cx + 26, base - 100);
    x.closePath(); x.fill();
    x.fillStyle = '#150b26';
    ell(x, cx, base - 100, 36, 10); x.fill();
    x.fillStyle = '#c44dff'; x.fillRect(cx - 15, base - 112, 30, 7);
    x.save(); x.shadowColor = '#c44dff'; x.shadowBlur = 10;
    x.fillStyle = '#ff8af5'; star(x, cx, base - 108.5, 7, 3); x.fill();
    x.restore();
    // angry glowing eyes
    x.save(); x.shadowColor = hit ? '#ffffff' : '#ff2e88'; x.shadowBlur = hit ? 16 : 9;
    x.fillStyle = hit ? '#fff' : '#ff5f9e';
    x.beginPath(); x.moveTo(cx - 16, base - 92); x.lineTo(cx - 4, base - 92); x.lineTo(cx - 10, base - 84); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(cx + 4, base - 92); x.lineTo(cx + 16, base - 92); x.lineTo(cx + 10, base - 84); x.closePath(); x.fill();
    x.restore();
    x.strokeStyle = '#0c0616'; x.lineWidth = 4; x.lineCap = 'round';
    x.beginPath(); x.moveTo(cx - 19, base - 97); x.lineTo(cx - 2, base - 91); x.stroke();
    x.beginPath(); x.moveTo(cx + 19, base - 97); x.lineTo(cx + 2, base - 91); x.stroke();
    // snarling mouth
    x.strokeStyle = '#0c0616'; x.lineWidth = 2.5;
    x.beginPath(); x.moveTo(cx - 8, base - 72); x.quadraticCurveTo(cx, base - 68, cx + 8, base - 72); x.stroke();
    x.fillStyle = '#fff';
    x.beginPath(); x.moveTo(cx - 6, base - 72); x.lineTo(cx - 4, base - 66); x.lineTo(cx - 2, base - 72); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(cx + 2, base - 72); x.lineTo(cx + 4, base - 66); x.lineTo(cx + 6, base - 72); x.closePath(); x.fill();
    // Wilbur's orb clutched in paw (BWS3)
    var ox = cx + 34, oy = base - 52;
    x.save(); x.shadowColor = '#c44dff'; x.shadowBlur = 16;
    var og = x.createRadialGradient(ox - 3, oy - 4, 1, ox, oy, 11);
    og.addColorStop(0, '#f5c8ff'); og.addColorStop(0.5, '#c44dff'); og.addColorStop(1, '#5f1a9c');
    x.fillStyle = og; circle(x, ox, oy, 11); x.fill();
    x.restore();
    x.strokeStyle = '#1c1028'; x.lineWidth = 7; x.lineCap = 'round';
    x.beginPath(); x.moveTo(cx + 22, base - 44); x.quadraticCurveTo(cx + 30, base - 48, ox - 6, oy + 4); x.stroke();
    return c;
  }
  function wilbur(hit) {
    var k = hit ? 'hit' : 'idle';
    if (!wilburCache[k]) wilburCache[k] = paintWilbur(hit);
    return wilburCache[k];
  }

  // Ghost — cute sheet ghost. Anchor: center.
  var ghostSprite = null;
  function paintGhost() {
    var Wd = 64, Ht = 76;
    var cv = mkCanvas(Wd, Ht), c = cv[0], x = cv[1];
    var cx = 32, top = 8;
    var g = x.createLinearGradient(0, top, 0, Ht - 6);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c9d4ff');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(cx - 22, Ht - 10);
    // wavy bottom
    var waves = 4;
    for (var i = 0; i <= waves; i++) {
      var wx = cx - 22 + i * (44 / waves);
      x.quadraticCurveTo(wx + 44 / waves / 2, Ht - 20, wx + 44 / waves, Ht - 10);
    }
    x.lineTo(cx + 22, top + 22);
    x.arc(cx, top + 22, 22, 0, Math.PI, true);
    x.closePath(); x.fill();
    x.strokeStyle = 'rgba(120,140,220,.6)'; x.lineWidth = 2; x.stroke();
    // face
    x.fillStyle = '#2a2a4a';
    ell(x, cx - 8, top + 22, 4.5, 6); x.fill();
    ell(x, cx + 8, top + 22, 4.5, 6); x.fill();
    ell(x, cx, top + 38, 5, 7); x.fill(); // "ooh" mouth
    // blush
    x.fillStyle = 'rgba(255,150,180,.55)';
    circle(x, cx - 14, top + 32, 3.5); x.fill(); circle(x, cx + 14, top + 32, 3.5); x.fill();
    return c;
  }

  /* ---------------- Particles & fx sprites ---------------- */
  var dotSprite = null, sparkSprite = null, ringSprite = null, featherSprite = null;
  var glintSprite = null, wilburAuraSprite = null;
  var glowRingCache = {}, bubbleImgCache = {}, stellaImgCache = {};

  function paintDot() {
    var cv = mkCanvas(16, 16), c = cv[0], x = cv[1];
    var g = x.createRadialGradient(8, 8, 1, 8, 8, 8);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,240,200,.9)');
    g.addColorStop(1, 'rgba(255,240,200,0)');
    x.fillStyle = g; circle(x, 8, 8, 8); x.fill();
    return c;
  }
  // soft gold glow dot for the aim guide (additive)
  var aimDotSprite = null;
  function paintAimDot() {
    var cv = mkCanvas(24, 24), c = cv[0], x = cv[1];
    var g = x.createRadialGradient(12, 12, 1, 12, 12, 12);
    g.addColorStop(0, 'rgba(255,250,225,1)');
    g.addColorStop(0.35, 'rgba(255,225,140,.85)');
    g.addColorStop(1, 'rgba(255,200,100,0)');
    x.fillStyle = g; circle(x, 12, 12, 12); x.fill();
    return c;
  }
  // idle shimmer glint: 4-point star with halo
  function paintGlint() {
    var cv = mkCanvas(28, 28), c = cv[0], x = cv[1];
    var g = x.createRadialGradient(14, 14, 1, 14, 14, 14);
    g.addColorStop(0, 'rgba(255,255,255,.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; circle(x, 14, 14, 14); x.fill();
    sparkle4(x, 14, 14, 10, 'rgba(255,255,255,.95)');
    return c;
  }
  // color-tinted glow ring for the loaded shooter bubble (and doom pulse)
  function paintGlowRing(key) {
    var S = 128, cx = 64, cy = 64, r = 60;
    var cv = mkCanvas(S, S), c = cv[0], x = cv[1];
    var col = BUBBLE_GLOW[key[0]] || '#ffffff';
    var g = x.createRadialGradient(cx, cy, r * 0.28, cx, cy, r);
    g.addColorStop(0, hexA(col, 0));
    g.addColorStop(0.55, hexA(col, 0.5));
    g.addColorStop(0.8, hexA(col, 0.16));
    g.addColorStop(1, hexA(col, 0));
    x.fillStyle = g; circle(x, cx, cy, r); x.fill();
    return c;
  }
  function hexA(hex, a) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  function glowRing(key) {
    if (!glowRingCache[key]) glowRingCache[key] = paintGlowRing(key);
    return glowRingCache[key];
  }
  // Wilbur's menacing aura
  function paintWilburAura() {
    var S = 200, cx = 100, cy = 100;
    var cv = mkCanvas(S, S), c = cv[0], x = cv[1];
    var g = x.createRadialGradient(cx, cy, 20, cx, cy, 100);
    g.addColorStop(0, 'rgba(120,40,180,.35)');
    g.addColorStop(0.6, 'rgba(150,60,220,.18)');
    g.addColorStop(1, 'rgba(150,60,220,0)');
    x.fillStyle = g; circle(x, cx, cy, 100); x.fill();
    return c;
  }
  // bubble sprite as a data URL (HUD ammo chip, title art) — cached
  function bubbleImg(key) {
    if (!bubbleImgCache[key]) bubbleImgCache[key] = bubbleSprite(key).toDataURL();
    return bubbleImgCache[key];
  }
  function stellaImg(pose) {
    if (!stellaImgCache[pose]) stellaImgCache[pose] = stella(pose).toDataURL();
    return stellaImgCache[pose];
  }
  function paintSpark() {
    var cv = mkCanvas(28, 28), c = cv[0], x = cv[1];
    x.save(); x.shadowColor = '#ffe14d'; x.shadowBlur = 8;
    x.fillStyle = '#fff3b0'; star(x, 14, 14, 11, 4); x.fill();
    x.restore();
    return c;
  }
  function paintRing() {
    var cv = mkCanvas(64, 64), c = cv[0], x = cv[1];
    x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 4;
    x.shadowColor = '#c44dff'; x.shadowBlur = 10;
    circle(x, 32, 32, 26); x.stroke();
    return c;
  }
  function paintFeather() {
    var cv = mkCanvas(24, 24), c = cv[0], x = cv[1];
    x.fillStyle = '#2a1a48';
    x.save(); x.translate(12, 12); x.rotate(0.6);
    ell(x, 0, 0, 5, 10); x.fill();
    x.strokeStyle = 'rgba(150,110,230,.5)'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(0, -10); x.lineTo(0, 10); x.stroke();
    x.restore();
    return c;
  }

  /* ---------------- Background ----------------
   * Painted once per size: night sky, moon, two tree layers, branch ceiling.
   * Mist + fireflies animate at runtime. */
  var bgCache = { w: 0, h: 0, layers: [] };

  function paintBackground(w, h) {
    if (bgCache.w === w && bgCache.h === h && bgCache.layers.length) return bgCache.layers;
    var layers = [];

    // L0: sky + stars + moon
    var cv0 = mkCanvas(w, h), c0 = cv0[0], x0 = cv0[1];
    var sky = x0.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0d0620'); sky.addColorStop(0.55, '#1c0f3d'); sky.addColorStop(1, '#2b1450');
    x0.fillStyle = sky; x0.fillRect(0, 0, w, h);
    // stars
    var srng = mulberry(w * 7 + h * 13);
    var twinkles = [];
    for (var i = 0; i < 90; i++) {
      var sx = srng() * w, sy = srng() * h * 0.7, ss = srng();
      x0.fillStyle = 'rgba(255,255,255,' + (0.25 + ss * 0.6) + ')';
      circle(x0, sx, sy, ss < 0.85 ? 1 : 1.8); x0.fill();
      if (ss > 0.93) twinkles.push([sx, sy, 2 + srng() * 3, srng() * 7]); // x, y, size, phase
    }
    // moon
    var mx = w * 0.82, my = h * 0.13, mr = Math.min(w, h) * 0.09;
    var mglow = x0.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 2.6);
    mglow.addColorStop(0, 'rgba(255,244,214,.5)'); mglow.addColorStop(1, 'rgba(255,244,214,0)');
    x0.fillStyle = mglow; circle(x0, mx, my, mr * 2.6); x0.fill();
    var mg = x0.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.2, mx, my, mr);
    mg.addColorStop(0, '#fff8e2'); mg.addColorStop(1, '#e8d9a8');
    x0.fillStyle = mg; circle(x0, mx, my, mr); x0.fill();
    x0.fillStyle = 'rgba(190,170,130,.35)';
    circle(x0, mx - mr * 0.25, my - mr * 0.1, mr * 0.18); x0.fill();
    circle(x0, mx + mr * 0.2, my + mr * 0.25, mr * 0.12); x0.fill();
    circle(x0, mx + mr * 0.05, my - mr * 0.35, mr * 0.1); x0.fill();
    layers.push(c0);

    // L1: far pines (blue-violet silhouettes)
    var cv1 = mkCanvas(w, h), c1 = cv1[0], x1 = cv1[1];
    x1.fillStyle = 'rgba(46,32,92,.85)';
    var trng = mulberry(w * 3 + 5);
    for (var tx = -20; tx < w + 20; tx += 34 + trng() * 30) {
      var th = h * (0.10 + trng() * 0.10), tw = 26 + trng() * 22;
      pine(x1, tx, h * 0.94, tw, th);
    }
    layers.push(c1);

    // L1b: mid-distance pines (lighter, painted wide for parallax sway)
    var cv1b = mkCanvas(w + 48, h), c1b = cv1b[0], x1b = cv1b[1];
    x1b.fillStyle = 'rgba(64,44,120,.9)';
    var mrng = mulberry(w * 5 + 31);
    for (var tx2 = -20; tx2 < w + 68; tx2 += 52 + mrng() * 44) {
      var th2 = h * (0.14 + mrng() * 0.12), tw2 = 34 + mrng() * 26;
      pine(x1b, tx2, h * 0.96, tw2, th2);
    }
    layers.push(c1b);

    // L2: near twisted trees (dark) with hanging lanterns
    var cv2 = mkCanvas(w, h), c2 = cv2[0], x2 = cv2[1];
    x2.strokeStyle = '#0e0818'; x2.fillStyle = '#0e0818'; x2.lineCap = 'round';
    var nrng = mulberry(w * 11 + 77);
    var treeXs = [w * 0.04, w * 0.96];
    treeXs.forEach(function (txx, ti) {
      var baseX = txx, baseY = h * 1.02, th2 = h * (0.42 + nrng() * 0.12);
      x2.lineWidth = 16;
      x2.beginPath(); x2.moveTo(baseX, baseY);
      x2.quadraticCurveTo(baseX + (ti ? -30 : 30), baseY - th2 * 0.5, baseX + (ti ? -14 : 14), baseY - th2);
      x2.stroke();
      // branches
      x2.lineWidth = 7;
      for (var b = 0; b < 4; b++) {
        var by = baseY - th2 * (0.35 + b * 0.16);
        var dir = ti ? -1 : 1;
        var bx = baseX + dir * (14 + b * 8);
        x2.beginPath(); x2.moveTo(bx, by);
        x2.quadraticCurveTo(bx + dir * 46, by - 26, bx + dir * 70, by - 44);
        x2.stroke();
        // lantern on 1-2 branches
        if ((b + ti) % 2 === 0) {
          var lx = bx + dir * 66, ly = by - 40;
          x2.strokeStyle = '#0e0818'; x2.lineWidth = 2;
          x2.beginPath(); x2.moveTo(bx + dir * 70, by - 44); x2.lineTo(lx, ly - 10); x2.stroke();
          x2.strokeStyle = '#0e0818'; x2.lineCap = 'round';
          lantern(x2, lx, ly, 11 + nrng() * 4);
        }
      }
    });
    layers.push(c2);
    bgCache = { w: w, h: h, layers: layers, twinkles: twinkles, midW: w + 48 };
    return layers;
  }

  function bgTwinkles(w, h) {
    paintBackground(w, h);
    return bgCache.twinkles || [];
  }

  function pine(x, bx, by, w, h) {
    for (var i = 0; i < 4; i++) {
      var yy = by - (i / 4) * h, ww = w * (1 - i / 5);
      x.beginPath();
      x.moveTo(bx - ww / 2, yy); x.lineTo(bx + ww / 2, yy); x.lineTo(bx, yy - h / 3.2);
      x.closePath(); x.fill();
    }
    x.fillRect(bx - 3, by - 8, 6, 10);
  }

  function lantern(x, lx, ly, s) {
    x.save();
    x.shadowColor = '#ffb52e'; x.shadowBlur = 24;
    var g = x.createRadialGradient(lx, ly, 1, lx, ly, s);
    g.addColorStop(0, '#ffe9b0'); g.addColorStop(0.55, '#ff9d2e'); g.addColorStop(1, '#b35a10');
    x.fillStyle = g;
    x.beginPath(); x.ellipse(lx, ly, s * 0.72, s, 0, 0, 7); x.fill();
    x.restore();
    x.fillStyle = '#241408';
    x.fillRect(lx - s * 0.4, ly - s - 4, s * 0.8, 5);
    x.fillRect(lx - s * 0.4, ly + s - 1, s * 0.8, 5);
  }

  // branch ceiling the bubbles hang from (drawn above board, descends with it)
  var branchCache = null;
  function paintBranch(w) {
    if (branchCache && branchCache._w === w) return branchCache;
    var cv = mkCanvas(w, 64), c = cv[0], x = cv[1];
    x.strokeStyle = '#140b20'; x.lineCap = 'round';
    x.lineWidth = 13;
    x.beginPath(); x.moveTo(-10, 26);
    x.bezierCurveTo(w * 0.3, 14, w * 0.6, 38, w + 10, 22);
    x.stroke();
    x.lineWidth = 7;
    var brng = mulberry(42);
    for (var i = 0; i < 7; i++) {
      var bx = (i / 7) * w + brng() * 30;
      x.beginPath(); x.moveTo(bx, 24);
      x.quadraticCurveTo(bx + 20, 44, bx + 44, 52);
      x.stroke();
    }
    // leaves
    x.fillStyle = 'rgba(60,120,80,.9)';
    for (var j = 0; j < 26; j++) {
      var lx = brng() * w, ly = 20 + brng() * 34;
      x.save(); x.translate(lx, ly); x.rotate(brng() * 3);
      x.beginPath(); x.ellipse(0, 0, 9, 4.5, 0, 0, 7); x.fill();
      x.restore();
    }
    // hanging moss
    x.strokeStyle = 'rgba(90,140,90,.55)'; x.lineWidth = 2;
    for (var k = 0; k < 12; k++) {
      var mx = brng() * w;
      x.beginPath(); x.moveTo(mx, 30); x.lineTo(mx + 4, 44 + brng() * 12); x.stroke();
    }
    c._w = w;
    branchCache = c;
    return c;
  }

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* pre-warm everything */
  function warm() {
    ['R', 'B', 'G', 'Y', 'P', 'W', 'K', 'Rbomb', 'Bbomb', 'Gbomb', 'Ybomb', 'Pbomb',
     'Rlight', 'Blight', 'Glight', 'Ylight', 'Plight'].forEach(function (k) {
      bubbleSprite(k); glowRing(k); bubbleImg(k);
    });
    blockerSprite = paintBlocker();
    owlSprite = paintOwl();
    ghostSprite = paintGhost();
    dotSprite = paintDot(); sparkSprite = paintSpark();
    ringSprite = paintRing(); featherSprite = paintFeather();
    glintSprite = paintGlint(); aimDotSprite = paintAimDot();
    wilburAuraSprite = paintWilburAura();
    stella('idle'); stella('aim'); stella('cast'); stella('sad'); stella('win');
    stellaImg('sad'); stellaImg('win');
    nero(false, false); nero(true, false); nero(false, true);
    wilbur(false); wilbur(true);
  }

  window.HexArt = {
    bubble: bubbleSprite,
    bubbleImg: bubbleImg,
    blocker: function () { return blockerSprite; },
    owl: function () { return owlSprite; },
    ghost: function () { return ghostSprite; },
    stella: stella,
    stellaImg: stellaImg,
    nero: nero,
    wilbur: wilbur,
    wilburAura: function () { return wilburAuraSprite; },
    dot: function () { return dotSprite; },
    aimDot: function () { return aimDotSprite; },
    glint: function () { return glintSprite; },
    glowRing: glowRing,
    spark: function () { return sparkSprite; },
    ring: function () { return ringSprite; },
    feather: function () { return featherSprite; },
    background: paintBackground,
    twinkles: bgTwinkles,
    branch: paintBranch,
    star: star,
    warm: warm
  };
})();
