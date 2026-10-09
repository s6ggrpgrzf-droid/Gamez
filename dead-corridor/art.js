/* Dead Man's Corridor — procedural art. All textures/sprites painted once
 * at boot to offscreen canvases. Horror-industrial style: grimy panels,
 * rust, warning stripes; enemies as dark silhouettes with hot rim light.
 */
(function () {
  'use strict';
  var A = window.DC_ART = {};
  var T = 64;

  function cv(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return [c, c.getContext('2d')];
  }
  function R(a, b) { return a + Math.random() * (b - a); }
  function speckle(x, n, cols, s0, s1) {
    for (var i = 0; i < n; i++) {
      x.fillStyle = cols[(Math.random() * cols.length) | 0];
      var s = R(s0, s1);
      x.fillRect(R(0, T), R(0, T), s, s);
    }
  }
  function grime(x, n, alpha) {
    for (var i = 0; i < n; i++) {
      var g = x.createRadialGradient(R(0, T), R(0, T), 0, R(0, T), R(0, T), R(6, 20));
      g.addColorStop(0, 'rgba(0,0,0,' + alpha + ')');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, T, T);
    }
  }

  /* ---------- wall textures ---------- */
  function texConcrete() {
    var c = cv(T, T), x = c[1];
    x.fillStyle = '#3a3a40'; x.fillRect(0, 0, T, T);
    // panel seams
    x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = 2;
    x.strokeRect(1, 1, T - 2, T - 2);
    x.beginPath(); x.moveTo(0, T / 2); x.lineTo(T, T / 2); x.stroke();
    // rivets
    x.fillStyle = '#222';
    [[6, 6], [T - 6, 6], [6, T - 6], [T - 6, T - 6], [6, T / 2], [T - 6, T / 2]].forEach(function (p) {
      x.beginPath(); x.arc(p[0], p[1], 2.2, 0, 7); x.fill();
    });
    speckle(x, 260, ['#43434a', '#333338', '#4a4a52'], 1, 3);
    grime(x, 7, 0.35);
    // faint rust bleed from seams
    var g2 = x.createLinearGradient(0, 0, 0, T);
    g2.addColorStop(0, 'rgba(120,60,20,0)'); g2.addColorStop(0.5, 'rgba(120,60,20,.12)'); g2.addColorStop(1, 'rgba(120,60,20,0)');
    x.fillStyle = g2; x.fillRect(0, 0, T, T);
    return c[0];
  }
  function texRust() {
    var c = cv(T, T), x = c[1];
    x.fillStyle = '#5a3a22'; x.fillRect(0, 0, T, T);
    speckle(x, 420, ['#6e4a2a', '#4a2e1a', '#7d5a34', '#3a2412'], 1, 4);
    // vertical drip streaks
    for (var i = 0; i < 9; i++) {
      var px = R(0, T), w = R(2, 6);
      var g = x.createLinearGradient(0, 0, 0, T);
      g.addColorStop(0, 'rgba(30,15,5,.5)'); g.addColorStop(1, 'rgba(30,15,5,0)');
      x.fillStyle = g; x.fillRect(px, 0, w, T);
    }
    grime(x, 6, 0.3);
    return c[0];
  }
  function texFlesh() {
    var c = cv(T, T), x = c[1];
    x.fillStyle = '#4a1620'; x.fillRect(0, 0, T, T);
    // veins
    x.strokeStyle = 'rgba(140,30,40,.7)'; x.lineWidth = 1.6;
    for (var i = 0; i < 7; i++) {
      x.beginPath();
      var vx = R(0, T), vy = 0;
      x.moveTo(vx, vy);
      while (vy < T) { vx += R(-14, 14); vy += R(8, 18); x.lineTo(vx, vy); }
      x.stroke();
    }
    speckle(x, 200, ['#5c1e28', '#3a1018', '#6e2830'], 1, 4);
    // wet sheen
    var g = x.createLinearGradient(0, 0, T, T);
    g.addColorStop(0, 'rgba(255,120,120,.10)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.25)');
    x.fillStyle = g; x.fillRect(0, 0, T, T);
    return c[0];
  }
  function texDoor() {
    var c = cv(T, T), x = c[1];
    x.fillStyle = '#2c2c34'; x.fillRect(0, 0, T, T);
    x.strokeStyle = '#111'; x.lineWidth = 3; x.strokeRect(4, 2, T - 8, T - 4);
    // hazard stripes top/bottom
    for (var i = 0; i < 8; i++) {
      x.fillStyle = i % 2 ? '#c8a020' : '#181818';
      x.save(); x.translate(i * 8, 0); x.rotate(0);
      x.fillRect(0, 4, 4, 6); x.fillRect(0, T - 10, 4, 6);
      x.restore();
    }
    // small window, dark
    x.fillStyle = '#0a0d12'; x.fillRect(T / 2 - 9, 14, 18, 12);
    x.strokeStyle = '#555'; x.lineWidth = 2; x.strokeRect(T / 2 - 9, 14, 18, 12);
    // window glow: something behind the glass
    x.fillStyle = 'rgba(255,60,40,.25)'; x.fillRect(T / 2 - 7, 16, 14, 8);
    speckle(x, 120, ['#34343c', '#24242a'], 1, 3);
    grime(x, 5, 0.35);
    return c[0];
  }
  function texFloor() {
    // designed for vertical stretch: strong HORIZONTAL bands survive,
    // speckle would smear into streaks
    var c = cv(T, T), x = c[1];
    x.fillStyle = '#232326'; x.fillRect(0, 0, T, T);
    // plate rows
    for (var r = 0; r < 4; r++) {
      var y0 = r * 16;
      x.fillStyle = r % 2 ? '#26262b' : '#202024';
      x.fillRect(0, y0, T, 16);
      x.fillStyle = 'rgba(0,0,0,.65)';
      x.fillRect(0, y0, T, 2);
      x.fillStyle = 'rgba(255,255,255,.05)';
      x.fillRect(0, y0 + 2, T, 1);
      // rivets per plate
      x.fillStyle = '#151518';
      x.beginPath(); x.arc(8, y0 + 8, 1.8, 0, 7); x.fill();
      x.beginPath(); x.arc(T - 8, y0 + 8, 1.8, 0, 7); x.fill();
    }
    // vertical seams (sparse, offset per row)
    x.fillStyle = 'rgba(0,0,0,.5)';
    for (var s = 0; s < 4; s++) x.fillRect((s * 37 + 11) % T, s * 16, 2, 16);
    // grime wash
    grime(x, 5, 0.3);
    return c[0];
  }
  function texFlat() {
    var c = cv(T, T), x = c[1];
    x.fillStyle = '#101014'; x.fillRect(0, 0, T, T);
    return c[0];
  }
  function texCeil() {
    // barely-there ceiling panels; mostly swallowed by dark, just enough to kill the void
    var c = cv(T, T), x = c[1];
    x.fillStyle = '#131318'; x.fillRect(0, 0, T, T);
    x.strokeStyle = 'rgba(0,0,0,.7)'; x.lineWidth = 2;
    x.strokeRect(1, 1, T - 2, T - 2);
    x.beginPath(); x.moveTo(0, T / 2); x.lineTo(T, T / 2); x.stroke();
    // pipe run across the top
    var g = x.createLinearGradient(0, 8, 0, 22);
    g.addColorStop(0, '#23232a'); g.addColorStop(0.5, '#17171c'); g.addColorStop(1, '#0c0c10');
    x.fillStyle = g; x.fillRect(0, 8, T, 14);
    x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(0, 20, T, 2);
    speckle(x, 90, ['#17171c', '#0e0e12'], 1, 3);
    return c[0];
  }

  /* ---------- enemy sprites ----------
   * Painted ~96x128, anchored bottom-center. Dark bodies, hot rim light
   * from the left (key light), ember eyes. Frames: [walk0, walk1, attack, dead0, dead1]
   */
  function limb(x, x0, y0, x1, y1, w, col) {
    x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round';
    x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
  }
  function rimLight(x, pts, col) {
    x.strokeStyle = col; x.lineWidth = 2.5; x.lineCap = 'round';
    x.beginPath();
    pts.forEach(function (p, i) { i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); });
    x.stroke();
  }
  function eyes(x, y, dx, glow) {
    x.save();
    x.shadowColor = glow; x.shadowBlur = 8;
    x.fillStyle = glow;
    x.beginPath(); x.arc(x0(dx - 5), y, 2.6, 0, 7); x.fill();
    x.beginPath(); x.arc(x0(dx + 5), y, 2.6, 0, 7); x.fill();
    x.restore();
    function x0(v) { return v; }
  }

  /* ---------- enemy sprites ----------
   * Frame scheme per type: { walk:[4], attack, dead:[2] }.
   * mode 0 = walk (ph 0..3), mode 1 = attack, mode 2 = dead (ph 0..1). */
  function paintHusk(mode, ph) {
    // shambling humanoid
    var c = cv(96, 128), x = c[1];
    var cx = 48, hipY = 78, shY = 46;
    var body = '#1a1418';
    if (mode === 2) {
      // dead: crumple then flatten
      var flat = ph === 0 ? 0 : 1;
      x.save();
      x.translate(0, flat ? 26 : 12);
      x.scale(1, flat ? 0.42 : 0.7);
      x.globalAlpha = flat ? 0.85 : 1;
      x.drawImage(paintHusk(0, 0), 0, flat ? -30 : -14);
      x.restore();
      // pooling blood under the body
      x.fillStyle = 'rgba(120,10,16,.75)';
      x.beginPath(); x.ellipse(cx, 116, flat ? 30 : 18, 8, 0, 0, 7); x.fill();
      return c[0];
    }
    // walk cycle: legs swing through 4 phases, torso sways, head bobs
    var swing = [1, 0.35, -1, -0.35][ph || 0];
    var bob = [0, -2, 0, -2][ph || 0];
    var sway = [2, 0, -2, 0][ph || 0];
    var attacking = mode === 1;
    x.save();
    x.translate(sway, bob);
    // legs
    limb(x, cx - 6, hipY, cx - 10 + swing * 8, 122, 9, body);
    limb(x, cx + 6, hipY, cx + 10 - swing * 8, 122, 9, body);
    // torso (hunched)
    x.fillStyle = body;
    x.beginPath();
    x.ellipse(cx + 3, 62, 15, 20, 0.15, 0, 7); x.fill();
    // ribs hint
    x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 1.5;
    for (var r = 0; r < 3; r++) {
      x.beginPath(); x.ellipse(cx + 3, 56 + r * 8, 12, 4, 0.1, 0.3, Math.PI - 0.3); x.stroke();
    }
    // arms: reach further on attack
    var reach = attacking ? 16 : 6 + Math.abs(swing) * 3;
    limb(x, cx - 10, shY + 4, cx - 22, shY + 26 + reach, 7, body);
    limb(x, cx + 14, shY + 4, cx + 24, shY + 24 + reach, 7, body);
    // claws
    x.fillStyle = '#c8b89a';
    x.fillRect(cx - 26, shY + 28 + reach, 8, 3);
    x.fillRect(cx + 20, shY + 26 + reach, 8, 3);
    // head: gaunt, jaw open (wider on attack)
    x.fillStyle = '#241a1e';
    x.beginPath(); x.ellipse(cx + 5, 30, 11, 13, 0.1, 0, 7); x.fill();
    x.fillStyle = '#0a0608';
    x.beginPath(); x.ellipse(cx + 8, 38, 5, attacking ? 9 : 7, 0, 0, 7); x.fill();
    // ember eyes (brighter when attacking = telegraph)
    var eg = attacking ? 14 : 9;
    x.save(); x.shadowColor = '#ff5a22'; x.shadowBlur = eg; x.fillStyle = '#ffb066';
    x.beginPath(); x.arc(cx + 1, 27, attacking ? 3.2 : 2.6, 0, 7); x.fill();
    x.beginPath(); x.arc(cx + 10, 27, attacking ? 3.2 : 2.6, 0, 7); x.fill();
    x.restore();
    // rim light (key from upper-left)
    rimLight(x, [[cx - 8, 20], [cx - 12, 40], [cx - 14, 62], [cx - 16, 84]], 'rgba(255,120,80,.55)');
    rimLight(x, [[cx - 12, 80], [cx - 16, 100], [cx - 18, 120]], 'rgba(255,120,80,.35)');
    x.restore();
    return c[0];
  }

  function paintCrawler(mode, ph) {
    // low fast quadruped
    var c = cv(96, 96), x = c[1];
    var cx = 48, by = 58;
    var body = '#171216';
    if (mode === 2) {
      var flat = ph === 0 ? 0 : 1;
      x.save();
      x.translate(0, flat ? 22 : 10);
      x.scale(1, flat ? 0.4 : 0.68);
      x.globalAlpha = flat ? 0.8 : 1;
      x.drawImage(paintCrawler(0, 0), 0, flat ? -26 : -12);
      x.restore();
      x.fillStyle = 'rgba(120,10,16,.7)';
      x.beginPath(); x.ellipse(cx, 88, flat ? 26 : 15, 6, 0, 0, 7); x.fill();
      return c[0];
    }
    // scuttle: legs alternate in 4 phases, body weaves
    var s = [1, 0.4, -1, -0.4][ph || 0];
    var weave = [-3, 0, 3, 0][ph || 0];
    var attacking = mode === 1;
    x.save();
    x.translate(weave, attacking ? 4 : 0);
    x.fillStyle = body;
    x.beginPath(); x.ellipse(cx, by, 24, 13, s * 0.06, 0, 7); x.fill();
    limb(x, cx - 14, by + 6, cx - 20 + s * 7, 88, 6, body);
    limb(x, cx + 14, by + 6, cx + 20 - s * 7, 88, 6, body);
    limb(x, cx - 14, by - 6, cx - 22 - s * 7, 30, 6, body);
    limb(x, cx + 14, by - 6, cx + 22 + s * 7, 30, 6, body);
    // head low + jaw (snaps open on attack)
    x.fillStyle = '#201418';
    x.beginPath(); x.ellipse(cx + 24, by + 2, 10, 8, 0.3, 0, 7); x.fill();
    x.fillStyle = '#0a0608';
    x.beginPath(); x.ellipse(cx + 28, by + 8, 6, attacking ? 5 : 3, 0.3, 0, 7); x.fill();
    // teeth
    x.fillStyle = '#c8b89a';
    for (var t = 0; t < 4; t++) x.fillRect(cx + 23 + t * 3, by + 7, 1.6, 3);
    // eyes
    x.save(); x.shadowColor = '#ff3a1a'; x.shadowBlur = attacking ? 12 : 8; x.fillStyle = '#ff8a5a';
    x.beginPath(); x.arc(cx + 22, by - 2, 2.4, 0, 7); x.fill();
    x.beginPath(); x.arc(cx + 29, by - 3, 2.4, 0, 7); x.fill();
    x.restore();
    // spine ridges (bristle on attack)
    x.fillStyle = '#2c1e24';
    for (var sp = 0; sp < 5; sp++) {
      var hgt = attacking ? 12 : 9;
      x.beginPath();
      x.moveTo(cx - 18 + sp * 9, by - 11); x.lineTo(cx - 14 + sp * 9, by - 11 - hgt); x.lineTo(cx - 10 + sp * 9, by - 11);
      x.closePath(); x.fill();
    }
    rimLight(x, [[cx - 20, by - 12], [cx - 24, by], [cx - 22, by + 10]], 'rgba(255,110,70,.5)');
    x.restore();
    return c[0];
  }

  function paintBrute(mode, ph) {
    // big tanky mass
    var c = cv(128, 144), x = c[1];
    var cx = 64;
    var body = '#141014', hi = '#241a20';
    if (mode === 2) {
      var flat = ph === 0 ? 0 : 1;
      x.save();
      x.translate(0, flat ? 34 : 16);
      x.scale(1, flat ? 0.42 : 0.7);
      x.globalAlpha = flat ? 0.8 : 1;
      x.drawImage(paintBrute(0, 0), 0, flat ? -40 : -18);
      x.restore();
      x.fillStyle = 'rgba(120,10,16,.8)';
      x.beginPath(); x.ellipse(cx, 132, flat ? 44 : 26, 9, 0, 0, 7); x.fill();
      return c[0];
    }
    // ponderous 4-phase stomp: mass shifts side to side, arms swing
    var sw = [6, 2, -6, -2][ph || 0];
    var lift = [0, -5, 0, -5][ph || 0];
    var attacking = mode === 1;
    var slam = attacking ? 12 : 0;
    x.save();
    x.translate(sw * 0.6, lift * 0.4);
    x.fillStyle = body;
    x.beginPath(); x.ellipse(cx, 88, 34, 44, sw * 0.004, 0, 7); x.fill();
    x.fillStyle = hi;
    x.beginPath(); x.ellipse(cx - 8, 78, 20, 30, -0.2, 0, 7); x.fill();
    // massive arms (raised to slam on attack)
    var armY = attacking ? -18 : sw * 0.5;
    limb(x, cx - 28, 70, cx - 44, 118 + slam + armY, 16, body);
    limb(x, cx + 28, 70, cx + 44, 118 + slam - armY, 16, body);
    // fists
    x.fillStyle = '#1e1418';
    x.beginPath(); x.arc(cx - 44, 120 + slam + armY, 11, 0, 7); x.fill();
    x.beginPath(); x.arc(cx + 44, 120 + slam - armY, 11, 0, 7); x.fill();
    // small head sunk in shoulders
    x.fillStyle = '#1c1216';
    x.beginPath(); x.ellipse(cx, 40, 14, 12, 0, 0, 7); x.fill();
    // triple eyes (flare on attack)
    x.save(); x.shadowColor = '#ff2a1a'; x.shadowBlur = attacking ? 18 : 11; x.fillStyle = '#ff7a4a';
    [-6, 0, 6].forEach(function (o) { x.beginPath(); x.arc(cx + o, 38, attacking ? 3.6 : 2.8, 0, 7); x.fill(); });
    x.restore();
    // cracks with ember glow (pulse on attack)
    x.strokeStyle = 'rgba(255,80,30,' + (attacking ? 0.85 : 0.5) + ')'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(cx - 10, 60); x.lineTo(cx - 4, 90); x.lineTo(cx - 12, 110); x.stroke();
    rimLight(x, [[cx - 32, 50], [cx - 36, 90], [cx - 34, 120]], 'rgba(255,120,80,.4)');
    x.restore();
    return c[0];
  }

  function paintSpitter(mode, ph) {
    // bloated ranged enemy, glowing sac
    var c = cv(96, 128), x = c[1];
    var cx = 48;
    var body = '#18121a';
    if (mode === 2) {
      var flat = ph === 0 ? 0 : 1;
      x.save();
      x.translate(0, flat ? 26 : 12);
      x.scale(1, flat ? 0.42 : 0.7);
      x.globalAlpha = flat ? 0.8 : 1;
      x.drawImage(paintSpitter(0, 0), 0, flat ? -30 : -14);
      x.restore();
      // sac bursts: green splatter
      x.fillStyle = 'rgba(110,160,40,.7)';
      x.beginPath(); x.ellipse(cx, 114, flat ? 28 : 16, 8, 0, 0, 7); x.fill();
      return c[0];
    }
    // breathing 4-phase: sac swells and subsides
    var breathe = [0, 0.5, 1, 0.5][ph || 0];
    var attacking = mode === 1;
    var charge = attacking ? 1 : 0.35 + breathe * 0.3;
    x.save();
    x.translate(0, breathe * -2);
    x.fillStyle = body;
    x.beginPath(); x.ellipse(cx, 84, 22, 30, 0, 0, 7); x.fill();
    // legs stubby (slight shift)
    var sh = [-2, 0, 2, 0][ph || 0];
    limb(x, cx - 10, 104, cx - 12 + sh, 124, 9, body);
    limb(x, cx + 10, 104, cx + 12 - sh, 124, 9, body);
    // head
    x.fillStyle = '#1e161c';
    x.beginPath(); x.ellipse(cx, 44, 13, 12, 0, 0, 7); x.fill();
    // glowing throat sac (charges before spitting)
    var sg = x.createRadialGradient(cx, 66, 2, cx, 66, 16);
    sg.addColorStop(0, 'rgba(180,255,120,' + (0.9 * charge + 0.1) + ')');
    sg.addColorStop(0.6, 'rgba(120,220,80,.45)');
    sg.addColorStop(1, 'rgba(80,160,40,0)');
    x.fillStyle = sg;
    x.beginPath(); x.arc(cx, 66, 16, 0, 7); x.fill();
    x.fillStyle = 'rgba(200,255,150,.9)';
    x.beginPath(); x.arc(cx, 66, 6 * charge + 2, 0, 7); x.fill();
    // eyes
    x.save(); x.shadowColor = '#aaff55'; x.shadowBlur = attacking ? 12 : 7; x.fillStyle = '#d6ff9a';
    x.beginPath(); x.arc(cx - 5, 42, 2.4, 0, 7); x.fill();
    x.beginPath(); x.arc(cx + 5, 42, 2.4, 0, 7); x.fill();
    x.restore();
    rimLight(x, [[cx - 20, 60], [cx - 23, 90], [cx - 21, 110]], 'rgba(160,255,120,.4)');
    x.restore();
    return c[0];
  }

  /* white silhouette variants for hit-flash (baked at boot) */
  function whiteOut(src) {
    var c = cv(src.width, src.height), x = c[1];
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#fff';
    x.fillRect(0, 0, src.width, src.height);
    return c[0];
  }

  /* telegraph glow: pulsing red halo drawn under an attacking foe */
  function paintGlow() {
    var c = cv(64, 64), x = c[1];
    var g = x.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,60,30,.55)');
    g.addColorStop(0.6, 'rgba(255,40,20,.22)');
    g.addColorStop(1, 'rgba(255,40,20,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill();
    return c[0];
  }

  /* animated wall textures: 2-frame variants, swapped by engine clock */
  function texWarn() {
    // concrete panel with emergency light strip (off / blazing)
    function frame(on) {
      var c = cv(T, T), x = c[1];
      x.fillStyle = '#33333a'; x.fillRect(0, 0, T, T);
      x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = 2;
      x.strokeRect(1, 1, T - 2, T - 2);
      speckle(x, 150, ['#3a3a42', '#2c2c32'], 1, 3);
      // light housing
      x.fillStyle = '#141416';
      x.fillRect(8, 8, T - 16, 14);
      if (on) {
        x.save();
        x.shadowColor = '#ff3a22'; x.shadowBlur = 12;
        x.fillStyle = '#ff6a3a';
        x.fillRect(10, 10, T - 20, 10);
        x.restore();
        x.fillStyle = 'rgba(255,80,40,.25)';
        x.fillRect(0, 0, T, T);
      } else {
        x.fillStyle = '#3a1a12';
        x.fillRect(10, 10, T - 20, 10);
      }
      grime(x, 5, 0.3);
      return c[0];
    }
    return [frame(false), frame(true)];
  }
  function texMonitor() {
    // dark wall with a flickering monitor (static / alert)
    function frame(alert) {
      var c = cv(T, T), x = c[1];
      x.fillStyle = '#2a2a30'; x.fillRect(0, 0, T, T);
      speckle(x, 140, ['#323238', '#222226'], 1, 3);
      x.fillStyle = '#0c0e14';
      x.fillRect(10, 14, T - 20, 26);
      x.strokeStyle = '#111'; x.lineWidth = 3;
      x.strokeRect(10, 14, T - 20, 26);
      if (alert) {
        x.fillStyle = 'rgba(255,50,40,.8)';
        x.font = '700 9px monospace'; x.textAlign = 'center';
        x.fillText('!!', T / 2, 32);
      } else {
        x.strokeStyle = 'rgba(120,220,160,.5)'; x.lineWidth = 1;
        for (var i = 0; i < 4; i++) {
          x.beginPath(); x.moveTo(14, 22 + i * 5);
          x.lineTo(14 + ((i * 37) % 30) + 6, 22 + i * 5); x.stroke();
        }
      }
      grime(x, 5, 0.32);
      return c[0];
    }
    return [frame(false), frame(true)];
  }


  /* ---------- gun viewmodel ---------- */
  function paintGun(recoil) {
    // chunky semi-auto pistol, seen from behind-below (classic FPS viewmodel)
    var c = cv(200, 150), x = c[1];
    var cx = 100;
    var kick = recoil * 16;
    var top = 26 + kick * 0.7;

    // barrel / muzzle
    x.fillStyle = '#0d0d10';
    x.fillRect(cx - 9, top, 18, 14);
    x.fillStyle = '#000';
    x.beginPath(); x.ellipse(cx, top + 7, 6, 4.5, 0, 0, 7); x.fill();

    // slide: long, beveled, top highlight
    var sg = x.createLinearGradient(0, top + 12, 0, top + 44);
    sg.addColorStop(0, '#4a4a55'); sg.addColorStop(0.35, '#2c2c33');
    sg.addColorStop(1, '#141417');
    x.fillStyle = sg;
    x.fillRect(cx - 17, top + 12, 34, 32);
    // slide top highlight
    x.fillStyle = 'rgba(255,255,255,.16)';
    x.fillRect(cx - 17, top + 12, 34, 3);
    // rear serrations
    x.fillStyle = 'rgba(0,0,0,.55)';
    for (var s = 0; s < 5; s++) x.fillRect(cx - 17, top + 16 + s * 5, 5, 2.5);
    // front sight
    x.fillStyle = '#0a0a0c';
    x.fillRect(cx - 3, top + 4, 6, 9);
    x.fillStyle = '#7dff9a';
    x.fillRect(cx - 1.5, top + 5, 3, 3);
    // rear sight notch
    x.fillStyle = '#0a0a0c';
    x.fillRect(cx - 10, top + 8, 7, 6);
    x.fillRect(cx + 3, top + 8, 7, 6);

    // frame under slide
    var fg = x.createLinearGradient(0, top + 44, 0, top + 62);
    fg.addColorStop(0, '#33333a'); fg.addColorStop(1, '#1a1a1e');
    x.fillStyle = fg;
    x.fillRect(cx - 13, top + 44, 26, 18);
    // trigger guard + trigger
    x.strokeStyle = '#1c1c20'; x.lineWidth = 5;
    x.beginPath(); x.moveTo(cx - 12, top + 62); x.lineTo(cx - 12, top + 78);
    x.quadraticCurveTo(cx - 12, top + 86, cx - 2, top + 86); x.stroke();
    x.fillStyle = '#0e0e11';
    x.fillRect(cx - 4, top + 62, 5, 16);

    // grip: angled back, checkered
    x.save();
    x.translate(cx + 2, top + 62); x.rotate(0.30);
    var gg = x.createLinearGradient(-16, 0, 16, 0);
    gg.addColorStop(0, '#4a3220'); gg.addColorStop(0.5, '#2e1f14'); gg.addColorStop(1, '#170f09');
    x.fillStyle = gg;
    x.beginPath();
    x.moveTo(-15, 0); x.lineTo(13, 0); x.lineTo(9, 58); x.lineTo(-19, 58);
    x.closePath(); x.fill();
    // checkering
    x.strokeStyle = 'rgba(0,0,0,.4)'; x.lineWidth = 1;
    for (var ch = 6; ch < 56; ch += 7) {
      x.beginPath(); x.moveTo(-17, ch); x.lineTo(11, ch); x.stroke();
    }
    // grip highlight
    x.fillStyle = 'rgba(255,200,150,.08)';
    x.fillRect(-15, 0, 5, 58);
    x.restore();

    // muzzle flash
    if (recoil > 0.5) {
      var f = (recoil - 0.5) / 0.5;
      x.save();
      x.globalCompositeOperation = 'lighter';
      var fg2 = x.createRadialGradient(cx, top, 2, cx, top, 46 * f + 10);
      fg2.addColorStop(0, 'rgba(255,244,200,' + (0.95 * f) + ')');
      fg2.addColorStop(0.35, 'rgba(255,170,70,' + (0.75 * f) + ')');
      fg2.addColorStop(1, 'rgba(255,80,20,0)');
      x.fillStyle = fg2;
      x.beginPath(); x.arc(cx, top, 46 * f + 10, 0, 7); x.fill();
      x.strokeStyle = 'rgba(255,225,160,' + (0.85 * f) + ')'; x.lineWidth = 4;
      for (var sp = 0; sp < 7; sp++) {
        var a = sp * Math.PI / 3.5 + 0.3;
        var len = 34 * f + 12 + (sp % 2) * 14;
        x.beginPath(); x.moveTo(cx, top);
        x.lineTo(cx + Math.cos(a - Math.PI / 2) * len * 0.4, top - Math.abs(Math.sin(a)) * len);
        x.lineTo(cx + Math.cos(a - Math.PI / 2) * len, top - Math.abs(Math.sin(a)) * len * 0.5);
        x.stroke();
      }
      x.restore();
    }
    return c[0];
  }

  /* ---------- pickups / fx ---------- */
  function paintCharge() {
    var c = cv(32, 32), x = c[1];
    var g = x.createRadialGradient(16, 16, 2, 16, 16, 15);
    g.addColorStop(0, '#eaffff'); g.addColorStop(0.4, '#7df9ff');
    g.addColorStop(0.8, 'rgba(40,180,220,.6)'); g.addColorStop(1, 'rgba(40,180,220,0)');
    x.fillStyle = g; x.beginPath(); x.arc(16, 16, 15, 0, 7); x.fill();
    return c[0];
  }
  function paintBolt() {
    // enemy projectile: sizzling spit
    var c = cv(24, 24), x = c[1];
    var g = x.createRadialGradient(12, 12, 1, 12, 12, 11);
    g.addColorStop(0, '#f4ffd6'); g.addColorStop(0.5, '#a8e04a');
    g.addColorStop(1, 'rgba(120,180,40,0)');
    x.fillStyle = g; x.beginPath(); x.arc(12, 12, 11, 0, 7); x.fill();
    return c[0];
  }
  function paintSplat() {
    // irregular dried-blood splat, drawn flat as a floor decal
    var c = cv(48, 48), x = c[1];
    x.fillStyle = 'rgba(90,8,14,.92)';
    x.beginPath();
    var cx = 24, cy = 24;
    for (var a = 0; a < 6.3; a += 0.35) {
      var r = 10 + Math.random() * 9;
      var px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r * 0.8;
      a === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
    }
    x.closePath(); x.fill();
    // darker core + satellite droplets
    x.fillStyle = 'rgba(50,4,8,.9)';
    x.beginPath(); x.ellipse(cx, cy, 8, 6, 0, 0, 7); x.fill();
    for (var i = 0; i < 7; i++) {
      x.beginPath();
      x.arc(cx + R(-20, 20), cy + R(-18, 18), R(1, 3), 0, 7);
      x.fill();
    }
    return c[0];
  }

  var cache = {};
  function reg() {
    if (cache.done) return cache;
    // engine textures
    DC_ENGINE.tex('concrete', texConcrete());
    DC_ENGINE.tex('rust', texRust());
    DC_ENGINE.tex('flesh', texFlesh());
    DC_ENGINE.tex('door', texDoor());
    DC_ENGINE.tex('floor', texFloor());
    DC_ENGINE.tex('ceil', texCeil());
    DC_ENGINE.tex('_flat', texFlat());
    // animated (2-frame) wall textures — engine swaps by clock
    DC_ENGINE.tex('warn', texWarn());
    DC_ENGINE.tex('monitor', texMonitor());
    cache.done = true;
    return cache;
  }

  A.reg = reg;
  function buildSet(painter) {
    var walk = [0, 1, 2, 3].map(function (p) { return painter(0, p); });
    var set = {
      walk: walk,
      attack: painter(1, 0),
      dead: [painter(2, 0), painter(2, 1)]
    };
    // baked white silhouettes for hit-flash
    set.white = {
      walk: walk.map(whiteOut),
      attack: whiteOut(set.attack),
      dead: set.dead.map(whiteOut)
    };
    return set;
  }
  A.sprites = {
    husk: buildSet(paintHusk),
    crawler: buildSet(paintCrawler),
    brute: buildSet(paintBrute),
    spitter: buildSet(paintSpitter)
  };
  A.glowTex = paintGlow();
  // frame roles: walk[0..3] cycle, attack, dead[0..1] staged
  A.gun = [0, 0.35, 0.7, 1].map(paintGun);
  A.chargeTex = paintCharge();
  A.boltTex = paintBolt();
  A.splatTex = paintSplat();
})();
