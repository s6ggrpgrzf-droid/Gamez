/* Fairway Rivals — ART: prerendered sprite library.
   Everything is painted ONCE at load into offscreen canvases; the game loop
   only blits (drawImage). No per-frame allocation, no per-frame text, no filters.
   Hand-drawn crispness in code — no emojis, no pixel art, no neon.
   Palette: televised golf — deep greens, golden-hour light, broadcast white/gold.

   Usage: ART.init(); then ART.get('ball'), ART.get('tileFairway'), ...
*/
'use strict';
(function () {
  var ART = window.ART = { ready: false };
  var S = {}; // name -> canvas

  function PAL() {
    var d = { fairway: '#2e7d3f', rough: '#256b34', green: '#3da34d', sand: '#e6cf8e',
      water: '#2f7ba3', skyTop: '#7fb2e5', skyGold: '#ffd9a0', sun: '#ffcf6e',
      treeDark: '#1d4d28', treeLite: '#4da55c', trunk: '#6b4a2f', white: '#ffffff',
      gold: '#ffd23f', navy: '#0d2b52', red: '#c0392b', blue: '#2471a3', ink: '#0a1a12' };
    try { if (window.FRCFG && FRCFG.palette) for (var k in d) if (FRCFG.palette[k]) d[k] = FRCFG.palette[k]; }
    catch (e) {}
    return d;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function cv(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function blade(ctx, rng, x, y, len, ang, w, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len * 0.5 - len * 0.2,
      x + Math.cos(ang) * len, y + Math.sin(ang) * len - len * 0.35);
    ctx.stroke();
  }

  /* ---------------- tiles (256px, seamless-ish organic) ---------------- */
  function tileRough(P) {
    var c = cv(256, 256), x = c.getContext('2d'), rng = mulberry32(11);
    x.fillStyle = P.rough; x.fillRect(0, 0, 256, 256);
    var cols = ['#1d5a2b', '#2b7a3b', '#1f6330', '#337f42'];
    for (var i = 0; i < 1100; i++) {
      blade(x, rng, rng() * 256, rng() * 256, 5 + rng() * 9,
        -Math.PI / 2 + (rng() - 0.5) * 0.9, 1.4, cols[(rng() * 4) | 0]);
    }
    // soft vignette so fairway reads as "mowed path"
    var g = x.createRadialGradient(128, 128, 60, 128, 128, 190);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.22)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    return c;
  }
  function tileFairway(P) {
    var c = cv(256, 256), x = c.getContext('2d'), rng = mulberry32(22);
    x.fillStyle = P.fairway; x.fillRect(0, 0, 256, 256);
    // mow stripes
    for (var s = 0; s < 4; s++) {
      x.fillStyle = s % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
      x.fillRect(0, s * 64, 256, 64);
    }
    var cols = ['#2a7239', '#37924a', '#2f8140', '#43a355'];
    for (var i = 0; i < 850; i++) {
      blade(x, rng, rng() * 256, rng() * 256, 4 + rng() * 7,
        -Math.PI / 2 + (rng() - 0.5) * 0.7, 1.3, cols[(rng() * 4) | 0]);
    }
    return c;
  }
  function tileGreen(P) {
    var c = cv(256, 256), x = c.getContext('2d'), rng = mulberry32(33);
    x.fillStyle = P.green; x.fillRect(0, 0, 256, 256);
    var cols = ['#35a047', '#48b45c', '#3cab52', '#2f9440'];
    for (var i = 0; i < 700; i++) {
      blade(x, rng, rng() * 256, rng() * 256, 2.5 + rng() * 4,
        -Math.PI / 2 + (rng() - 0.5) * 1.1, 1.1, cols[(rng() * 4) | 0]);
    }
    var g = x.createRadialGradient(128, 128, 20, 128, 128, 180);
    g.addColorStop(0, 'rgba(255,255,220,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.10)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    return c;
  }
  function tileSand(P) {
    var c = cv(256, 256), x = c.getContext('2d'), rng = mulberry32(44);
    x.fillStyle = P.sand; x.fillRect(0, 0, 256, 256);
    var cols = ['#d9bd7c', '#f2e0a4', '#cfae6e', '#e8d391'];
    for (var i = 0; i < 700; i++) {
      x.fillStyle = cols[(rng() * 4) | 0];
      x.beginPath();
      x.arc(rng() * 256, rng() * 256, 0.8 + rng() * 1.8, 0, 6.283);
      x.fill();
    }
    // wind ripples
    x.strokeStyle = 'rgba(160,130,80,0.35)'; x.lineWidth = 1.5;
    for (var r = 0; r < 7; r++) {
      x.beginPath();
      var y = 20 + r * 34 + rng() * 10;
      for (var px = 0; px <= 256; px += 16) x.lineTo(px, y + Math.sin(px / 40 + r) * 5);
      x.stroke();
    }
    return c;
  }
  function tileWater(P) {
    var c = cv(256, 256), x = c.getContext('2d'), rng = mulberry32(55);
    var g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#3d8ab5'); g.addColorStop(1, '#24607f');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    // sun glint streak
    var gg = x.createLinearGradient(100, 0, 160, 0);
    gg.addColorStop(0, 'rgba(255,220,150,0)');
    gg.addColorStop(0.5, 'rgba(255,220,150,0.28)');
    gg.addColorStop(1, 'rgba(255,220,150,0)');
    x.fillStyle = gg; x.fillRect(80, 0, 100, 256);
    // ripples
    for (var i = 0; i < 46; i++) {
      var y = rng() * 256, w = 20 + rng() * 60, px = rng() * 256;
      x.strokeStyle = 'rgba(255,255,255,' + (0.10 + rng() * 0.16) + ')';
      x.lineWidth = 1 + rng() * 1.5;
      x.beginPath(); x.moveTo(px, y);
      x.quadraticCurveTo(px + w / 2, y - 3, px + w, y);
      x.stroke();
    }
    return c;
  }

  /* ---------------- ball + shadow ---------------- */
  function ball(P) {
    var c = cv(48, 48), x = c.getContext('2d');
    var g = x.createRadialGradient(17, 15, 3, 24, 24, 22);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.75, '#eef2f4'); g.addColorStop(1, '#b9c4c9');
    x.fillStyle = g;
    x.beginPath(); x.arc(24, 24, 21, 0, 6.283); x.fill();
    // dimples
    x.fillStyle = 'rgba(120,140,150,0.5)';
    var rng = mulberry32(7);
    for (var i = 0; i < 46; i++) {
      var a = rng() * 6.283, r = rng() * 15;
      var dx = Math.cos(a) * r, dy = Math.sin(a) * r;
      if (dx * dx + dy * dy > 17 * 17) continue;
      x.beginPath(); x.arc(24 + dx, 24 + dy, 1.6, 0, 6.283); x.fill();
    }
    // seam ring + outline
    x.strokeStyle = 'rgba(40,60,70,0.55)'; x.lineWidth = 1.5;
    x.beginPath(); x.arc(24, 24, 20.5, 0, 6.283); x.stroke();
    return c;
  }
  function ballShadow() {
    var c = cv(64, 40), x = c.getContext('2d');
    var g = x.createRadialGradient(32, 20, 2, 32, 20, 30);
    g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.save(); x.scale(1, 0.55); x.beginPath(); x.arc(32, 36, 29, 0, 6.283); x.fill(); x.restore();
    return c;
  }

  /* ---------------- cup + flagstick (2 ripple frames) ---------------- */
  function cup(P) {
    var c = cv(96, 64), x = c.getContext('2d');
    // mown ring
    x.strokeStyle = 'rgba(255,255,255,0.25)'; x.lineWidth = 5;
    x.beginPath(); x.ellipse(48, 32, 30, 17, 0, 0, 6.283); x.stroke();
    // hole
    var g = x.createRadialGradient(48, 30, 2, 48, 32, 26);
    g.addColorStop(0, '#000000'); g.addColorStop(0.8, '#0a0f0a'); g.addColorStop(1, 'rgba(10,15,10,0)');
    x.fillStyle = g;
    x.beginPath(); x.ellipse(48, 32, 26, 15, 0, 0, 6.283); x.fill();
    // top grass lip highlight
    x.strokeStyle = 'rgba(255,255,200,0.5)'; x.lineWidth = 2;
    x.beginPath(); x.ellipse(48, 32, 26, 15, 0, Math.PI * 1.15, Math.PI * 1.85); x.stroke();
    return c;
  }
  function flagFrame(P, phase) {
    var c = cv(96, 170), x = c.getContext('2d');
    // pole
    var g = x.createLinearGradient(44, 0, 52, 0);
    g.addColorStop(0, '#8a97a3'); g.addColorStop(0.5, '#e8eef2'); g.addColorStop(1, '#7c8894');
    x.fillStyle = g; x.fillRect(45, 6, 6, 158);
    x.fillStyle = P.gold; x.beginPath(); x.arc(48, 6, 6, 0, 6.283); x.fill(); // finial
    // waving flag (triangle with sine ripple)
    x.fillStyle = P.gold;
    x.strokeStyle = 'rgba(120,80,0,0.6)'; x.lineWidth = 2;
    x.beginPath();
    x.moveTo(51, 12);
    var tipX = 92, tipY = 26 + Math.sin(phase) * 4;
    x.quadraticCurveTo(72, 10 + Math.sin(phase + 1) * 5, tipX, tipY);
    x.quadraticCurveTo(72, 34 + Math.sin(phase + 2) * 5, 51, 40);
    x.closePath(); x.fill(); x.stroke();
    // number "1" on flag
    x.fillStyle = P.navy; x.font = 'bold 15px sans-serif';
    x.textAlign = 'center'; x.fillText('1', 68, 30);
    return c;
  }

  /* ---------------- trees (3 variants, golden-hour rim) ---------------- */
  function tree(P, variant) {
    var c = cv(170, 210), x = c.getContext('2d'), rng = mulberry32(100 + variant);
    // trunk
    x.fillStyle = P.trunk;
    x.beginPath();
    x.moveTo(78, 208); x.quadraticCurveTo(82, 150, 80, 120);
    x.lineTo(92, 120); x.quadraticCurveTo(90, 150, 94, 208);
    x.closePath(); x.fill();
    x.fillStyle = 'rgba(255,220,160,0.35)';
    x.fillRect(82, 130, 4, 70);
    // canopy blobs
    function blob(bx, by, br, col) {
      x.fillStyle = col;
      x.beginPath(); x.arc(bx, by, br, 0, 6.283); x.fill();
    }
    var centers = variant === 0
      ? [[85, 70, 52], [55, 95, 38], [115, 95, 38], [85, 45, 34]]
      : variant === 1
      ? [[85, 90, 46], [85, 55, 36], [85, 25, 24], [60, 105, 30], [110, 105, 30]]
      : [[85, 80, 58], [50, 70, 30], [120, 70, 30], [85, 110, 44]];
    for (var i = 0; i < centers.length; i++) {
      var b = centers[i];
      blob(b[0], b[1], b[2], P.treeDark);
      blob(b[0] - 6, b[1] - 8, b[2] * 0.72, P.treeLite);
    }
    // leafy texture strokes
    for (var j = 0; j < 260; j++) {
      var b2 = centers[(rng() * centers.length) | 0];
      var a = rng() * 6.283, rr = rng() * b2[2];
      blade(x, rng, b2[0] + Math.cos(a) * rr, b2[1] + Math.sin(a) * rr,
        4 + rng() * 6, -Math.PI / 2 + (rng() - 0.5), 1.6,
        rng() < 0.5 ? P.treeLite : P.treeDark);
    }
    // golden-hour rim on top edges
    x.strokeStyle = 'rgba(255,217,160,0.85)'; x.lineWidth = 3;
    for (var k = 0; k < centers.length; k++) {
      var b3 = centers[k];
      x.beginPath(); x.arc(b3[0], b3[1], b3[2] - 2, Math.PI * 1.15, Math.PI * 1.85); x.stroke();
    }
    // ground shadow
    var sg = x.createRadialGradient(86, 200, 4, 86, 200, 46);
    sg.addColorStop(0, 'rgba(0,0,0,0.35)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = sg;
    x.save(); x.scale(1, 0.35); x.beginPath(); x.arc(86, 580, 44, 0, 6.283); x.fill(); x.restore();
    return c;
  }

  /* ---------------- wind arrow ---------------- */
  function windArrow(P) {
    var c = cv(72, 72), x = c.getContext('2d');
    x.translate(36, 36);
    x.fillStyle = P.white;
    x.strokeStyle = P.navy; x.lineWidth = 3;
    x.beginPath();
    x.moveTo(0, -24); x.lineTo(16, -4); x.lineTo(6, -4);
    x.lineTo(6, 22); x.lineTo(-6, 22); x.lineTo(-6, -4); x.lineTo(-16, -4);
    x.closePath(); x.fill(); x.stroke();
    // chevrons on shaft
    x.strokeStyle = P.gold; x.lineWidth = 4;
    for (var i = 0; i < 2; i++) {
      var y = 2 + i * 9;
      x.beginPath(); x.moveTo(-9, y); x.lineTo(0, y + 6); x.lineTo(9, y); x.stroke();
    }
    return c;
  }

  /* ---------------- needle dial ---------------- */
  function needleDialBg(P) {
    var c = cv(240, 150), x = c.getContext('2d');
    var cx = 120, cy = 135, R = 105;
    // outer ring
    x.fillStyle = P.navy;
    x.beginPath(); x.arc(cx, cy, R + 12, Math.PI, 0); x.closePath(); x.fill();
    // face
    var g = x.createLinearGradient(0, 20, 0, 150);
    g.addColorStop(0, '#fdfbf3'); g.addColorStop(1, '#e9e2cd');
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, R, Math.PI, 0); x.closePath(); x.fill();
    // zones: red edges, white mid, gold perfect
    function arc(a0, a1, col) {
      x.strokeStyle = col; x.lineWidth = 22;
      x.beginPath(); x.arc(cx, cy, R - 16, Math.PI + a0, Math.PI + a1); x.stroke();
    }
    arc(0, 0.5, P.red); arc(0.5, 1.25, '#e8e2cd');
    arc(1.25, 1.89, P.gold);            // perfect wedge (center)
    arc(1.89, 2.64, '#e8e2cd'); arc(2.64, 3.14, P.red);
    // tick marks
    x.strokeStyle = P.navy; x.lineWidth = 2;
    for (var i = 0; i <= 20; i++) {
      var a = Math.PI + (i / 20) * Math.PI;
      var r0 = R - 30, r1 = R - 38;
      x.beginPath();
      x.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      x.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      x.stroke();
    }
    // hub
    x.fillStyle = P.navy; x.beginPath(); x.arc(cx, cy, 10, 0, 6.283); x.fill();
    x.fillStyle = P.gold; x.beginPath(); x.arc(cx, cy, 5, 0, 6.283); x.fill();
    return c;
  }
  function needle(P) {
    var c = cv(240, 150), x = c.getContext('2d');
    var cx = 120, cy = 135;
    x.fillStyle = P.red;
    x.strokeStyle = P.navy; x.lineWidth = 2;
    x.beginPath();
    x.moveTo(cx - 5, cy); x.lineTo(cx, cy - 88); x.lineTo(cx + 5, cy);
    x.closePath(); x.fill(); x.stroke();
    x.fillStyle = P.navy;
    x.beginPath(); x.arc(cx, cy + 22, 9, 0, 6.283); x.fill(); // counterweight
    return c;
  }

  /* ---------------- broadcast chrome (3-slice) ---------------- */
  function sliceChrome(P, h, kind) {
    // returns {l, mid, r}; game stretches mid to any width
    function cap(left) {
      var w = 34, c = cv(w, h), x = c.getContext('2d');
      x.fillStyle = P.navy;
      x.beginPath();
      if (left) { x.moveTo(0, 8); x.quadraticCurveTo(0, 0, 8, 0); x.lineTo(w, 0); x.lineTo(w, h); x.lineTo(8, h); x.quadraticCurveTo(0, h, 0, h - 8); }
      else { x.moveTo(0, 0); x.lineTo(w - 8, 0); x.quadraticCurveTo(w, 0, w, 8); x.lineTo(w, h - 8); x.quadraticCurveTo(w, h, w - 8, h); x.lineTo(0, h); }
      x.closePath(); x.fill();
      // gold underline
      x.fillStyle = P.gold;
      x.fillRect(left ? 8 : 0, h - 5, left ? w - 8 : w - 8, 5);
      // top sheen
      x.fillStyle = 'rgba(255,255,255,0.14)';
      if (left) { x.beginPath(); x.moveTo(0, 8); x.quadraticCurveTo(0, 0, 8, 0); x.lineTo(w, 0); x.lineTo(w, 10); x.lineTo(8, 10); x.quadraticCurveTo(0, 10, 0, 8); x.closePath(); x.fill(); }
      else x.fillRect(0, 0, w - 4, 10);
      return c;
    }
    var mid = cv(4, h), mx = mid.getContext('2d');
    mx.fillStyle = P.navy; mx.fillRect(0, 0, 4, h);
    mx.fillStyle = P.gold; mx.fillRect(0, h - 5, 4, 5);
    mx.fillStyle = 'rgba(255,255,255,0.14)'; mx.fillRect(0, 0, 4, 10);
    var out = { l: cap(true), mid: mid, r: cap(false) };
    if (kind === 'lower') { // lower third: taller, white name plate variant
      for (var kk = 0; kk < 3; kk++) {
        var cc = [out.l, out.mid, out.r][kk], cx2 = cc.getContext('2d');
        cx2.fillStyle = 'rgba(255,255,255,0.92)';
        cx2.fillRect(0, 0, cc.width, h - 14);
      }
    }
    return out;
  }

  /* ---------------- versus medallions ---------------- */
  function medallion(P, accent, pose) {
    var c = cv(144, 144), x = c.getContext('2d'), rng = mulberry32(pose ? 9 : 5);
    // golden-hour backdrop
    var g = x.createLinearGradient(0, 0, 0, 144);
    g.addColorStop(0, '#8fb8e8'); g.addColorStop(0.55, P.skyGold); g.addColorStop(1, '#e8935a');
    x.fillStyle = g;
    x.beginPath(); x.arc(72, 72, 64, 0, 6.283); x.fill();
    // sun
    x.fillStyle = 'rgba(255,240,200,0.9)';
    x.beginPath(); x.arc(100, 44, 14, 0, 6.283); x.fill();
    // fairway hill
    x.fillStyle = '#2e7d3f';
    x.beginPath(); x.ellipse(72, 150, 80, 44, 0, Math.PI, 0); x.fill();
    // golfer silhouette (simple, readable)
    x.fillStyle = P.navy;
    x.strokeStyle = P.navy; x.lineWidth = 7; x.lineCap = 'round';
    if (pose === 0) { // follow-through
      x.beginPath(); x.arc(66, 62, 10, 0, 6.283); x.fill();           // head
      x.beginPath(); x.moveTo(66, 74); x.lineTo(60, 104); x.stroke(); // torso
      x.beginPath(); x.moveTo(60, 104); x.lineTo(50, 128); x.stroke(); // legs
      x.beginPath(); x.moveTo(60, 104); x.lineTo(72, 128); x.stroke();
      x.beginPath(); x.moveTo(64, 80); x.lineTo(92, 66); x.stroke();  // arms
      x.lineWidth = 4;
      x.beginPath(); x.moveTo(92, 66); x.lineTo(112, 40); x.stroke(); // club
    } else { // address stance
      x.beginPath(); x.arc(78, 60, 10, 0, 6.283); x.fill();
      x.beginPath(); x.moveTo(78, 72); x.lineTo(76, 102); x.stroke();
      x.beginPath(); x.moveTo(76, 102); x.lineTo(66, 128); x.stroke();
      x.beginPath(); x.moveTo(76, 102); x.lineTo(88, 128); x.stroke();
      x.beginPath(); x.moveTo(77, 80); x.lineTo(60, 96); x.stroke();
      x.lineWidth = 4;
      x.beginPath(); x.moveTo(60, 96); x.lineTo(52, 122); x.stroke();
    }
    // ring
    x.lineWidth = 8; x.strokeStyle = accent;
    x.beginPath(); x.arc(72, 72, 66, 0, 6.283); x.stroke();
    x.lineWidth = 2; x.strokeStyle = P.gold;
    x.beginPath(); x.arc(72, 72, 58, 0, 6.283); x.stroke();
    return c;
  }
  function vsBadge(P) {
    var c = cv(112, 112), x = c.getContext('2d');
    var g = x.createRadialGradient(48, 44, 6, 56, 56, 54);
    g.addColorStop(0, '#ffe9a8'); g.addColorStop(1, '#d9a92e');
    x.fillStyle = g;
    x.beginPath(); x.arc(56, 56, 52, 0, 6.283); x.fill();
    x.lineWidth = 5; x.strokeStyle = P.navy;
    x.beginPath(); x.arc(56, 56, 52, 0, 6.283); x.stroke();
    x.fillStyle = P.navy;
    x.font = 'italic 900 44px Georgia, serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('VS', 56, 60);
    return c;
  }

  /* ---------------- icons: star / trophy / chest ---------------- */
  function star(P, s) {
    s = s || 64;
    var c = cv(s, s), x = c.getContext('2d');
    x.translate(s / 2, s / 2);
    var g = x.createLinearGradient(0, -s / 2, 0, s / 2);
    g.addColorStop(0, '#ffe9a8'); g.addColorStop(1, '#e0a92e');
    x.fillStyle = g; x.strokeStyle = '#8a6414'; x.lineWidth = 2;
    x.beginPath();
    for (var i = 0; i < 10; i++) {
      var r = i % 2 ? s * 0.20 : s * 0.44;
      var a = -Math.PI / 2 + i * Math.PI / 5;
      x[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    x.closePath(); x.fill(); x.stroke();
    // facet highlight
    x.fillStyle = 'rgba(255,255,255,0.55)';
    x.beginPath();
    x.moveTo(0, -s * 0.30); x.lineTo(s * 0.10, -s * 0.05); x.lineTo(-s * 0.02, -s * 0.02);
    x.closePath(); x.fill();
    return c;
  }
  function trophy(P) {
    var c = cv(104, 120), x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, 120);
    g.addColorStop(0, '#ffe9a8'); g.addColorStop(0.6, P.gold); g.addColorStop(1, '#c08f24');
    // handles
    x.strokeStyle = '#c08f24'; x.lineWidth = 8;
    x.beginPath(); x.arc(22, 40, 18, Math.PI * 0.4, Math.PI * 1.4); x.stroke();
    x.beginPath(); x.arc(82, 40, 18, Math.PI * -0.4, Math.PI * 0.6); x.stroke();
    // cup body
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(24, 14); x.lineTo(80, 14);
    x.quadraticCurveTo(78, 62, 52, 74);
    x.quadraticCurveTo(26, 62, 24, 14);
    x.closePath(); x.fill();
    x.strokeStyle = '#8a6414'; x.lineWidth = 2.5; x.stroke();
    // rim + highlight
    x.fillStyle = '#fff3c4'; x.fillRect(24, 14, 56, 7);
    x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect(34, 24, 8, 40);
    // stem + base
    x.fillStyle = g; x.fillRect(46, 74, 12, 16);
    x.beginPath();
    x.moveTo(30, 104); x.lineTo(74, 104); x.lineTo(66, 90); x.lineTo(38, 90);
    x.closePath(); x.fill(); x.stroke();
    x.fillStyle = P.navy; x.fillRect(30, 104, 44, 8);
    return c;
  }
  function chest(P) {
    var c = cv(110, 100), x = c.getContext('2d');
    // glow
    var gg = x.createRadialGradient(55, 50, 6, 55, 50, 60);
    gg.addColorStop(0, 'rgba(255,210,63,0.5)'); gg.addColorStop(1, 'rgba(255,210,63,0)');
    x.fillStyle = gg; x.fillRect(0, 0, 110, 100);
    // body
    var wg = x.createLinearGradient(0, 30, 0, 92);
    wg.addColorStop(0, '#8a5a33'); wg.addColorStop(1, '#5e3a1e');
    x.fillStyle = wg;
    x.fillRect(14, 40, 82, 52);
    x.strokeStyle = '#3a2410'; x.lineWidth = 3; x.strokeRect(14, 40, 82, 52);
    // lid (slightly open, light spilling)
    x.fillStyle = '#9a6538';
    x.beginPath();
    x.moveTo(14, 40); x.lineTo(96, 40); x.lineTo(88, 18); x.lineTo(22, 18);
    x.closePath(); x.fill(); x.stroke();
    x.fillStyle = 'rgba(255,230,150,0.85)';
    x.fillRect(20, 36, 70, 5);
    // gold bands + latch
    x.fillStyle = P.gold;
    x.fillRect(26, 40, 10, 52); x.fillRect(74, 40, 10, 52);
    x.fillStyle = '#c08f24';
    x.fillRect(48, 44, 14, 18);
    x.fillStyle = P.navy;
    x.beginPath(); x.arc(55, 53, 4, 0, 6.283); x.fill();
    return c;
  }

  /* ---------------- juice particles ---------------- */
  function puff() {
    var c = cv(64, 64), x = c.getContext('2d');
    var g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return c;
  }
  function ring(P) {
    var c = cv(72, 48), x = c.getContext('2d');
    x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 4;
    x.beginPath(); x.ellipse(36, 24, 28, 14, 0, 0, 6.283); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 8;
    x.beginPath(); x.ellipse(36, 24, 22, 10, 0, 0, 6.283); x.stroke();
    return c;
  }
  function sparkle(P) {
    var c = cv(48, 48), x = c.getContext('2d');
    var g = x.createRadialGradient(24, 24, 1, 24, 24, 22);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, P.gold); g.addColorStop(1, 'rgba(255,210,63,0)');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(24, 0); x.quadraticCurveTo(27, 21, 48, 24); x.quadraticCurveTo(27, 27, 24, 48);
    x.quadraticCurveTo(21, 27, 0, 24); x.quadraticCurveTo(21, 21, 24, 0);
    x.closePath(); x.fill();
    return c;
  }

  /* ---------------- init ---------------- */
  ART.init = function () {
    if (ART.ready) return ART;
    var P = PAL();
    S.tileRough = tileRough(P);
    S.tileFairway = tileFairway(P);
    S.tileGreen = tileGreen(P);
    S.tileSand = tileSand(P);
    S.tileWater = tileWater(P);
    S.ball = ball(P);
    S.ballShadow = ballShadow();
    S.cup = cup(P);
    S.flag = [flagFrame(P, 0), flagFrame(P, 2.1)];
    S.tree = [tree(P, 0), tree(P, 1), tree(P, 2)];
    S.windArrow = windArrow(P);
    S.needleDial = needleDialBg(P);
    S.needle = needle(P);
    var bug = sliceChrome(P, 56, 'bug');
    S.bugL = bug.l; S.bugMid = bug.mid; S.bugR = bug.r;
    var low = sliceChrome(P, 88, 'lower');
    S.lowerL = low.l; S.lowerMid = low.mid; S.lowerR = low.r;
    S.medalYou = medallion(P, P.blue, 0);
    S.medalRival = medallion(P, P.red, 1);
    S.vsBadge = vsBadge(P);
    S.star = star(P, 64);
    S.starBig = star(P, 96);
    S.trophy = trophy(P);
    S.chest = chest(P);
    S.puff = puff();
    S.ring = ring(P);
    S.sparkle = sparkle(P);
    ART.ready = true;
    return ART;
  };
  ART.get = function (name) { return S[name] || null; };
  ART.size = function (name) {
    var c = S[name];
    return c ? { w: c.width, h: c.height } : null;
  };
  ART.names = function () { return Object.keys(S); };
})();
