/* Bubble Hex UI — v2 "Witchwood" overhaul.
 * Canvas game with pre-rendered sprite art, Stella the witch at the shooter,
 * Nero the cat discard, Wilbur boss, owl familiars, ghost, spell-orb Hex Blast
 * cinematic, level intro cards, animated score bar, Daily Hex Challenge
 * (Cloudflare /daily seed), and a generative music-box soundtrack.
 */
(function () {
  'use strict';
  var E = window.HexEngine;
  var LEVELS = window.HEX_LEVELS || [];
  var Art = window.HexArt;
  if (!E || !Art) { console.error('Bubble Hex: engine/art missing'); return; }

  /* ================= DOM ================= */
  function $(id) { return document.getElementById(id); }
  var canvas = $('game'), ctx = canvas.getContext('2d');
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  var W = 0, H = 0, R = 18;          // css px
  var BOARD_TOP = 64;                // below HUD branch area
  var SHOOT_Y = 0;                   // set in resize
  var STELLA_W = 120, STELLA_H = 132;

  /* ================= State ================= */
  var state = null;
  var view = 'map';                  // map | intro | game
  var fireflies = [], mists = [];
  var particles = [];                // pooled
  var floaters = [];
  var rings = [];
  var beams = [];

  for (var pi = 0; pi < 220; pi++) particles.push({ on: false });
  function spawnP(x, y, vx, vy, life, size, color, grav) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (!p.on) {
        p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
        p.life = life; p.age = 0; p.size = size; p.color = color; p.grav = grav || 0;
        p.glint = false;
        return;
      }
    }
  }
  function burst(x, y, n, color, speed, life, size) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      spawnP(x, y, Math.cos(a) * s, Math.sin(a) * s - 40,
        life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), color, 160);
    }
  }

  /* ================= Feel: floaty, magical, dreamy =================
   * Haptics (guarded so they can never throw — iOS has no vibrate),
   * soap-bubble motes that drift UPWARD instead of shard bursts, gentle
   * squash on impacts, slow-mo micro-dips. NO screen shake by design —
   * only a whisper-soft shimmer on the biggest drops. Central event →
   * effects map so feel tunes without touching gameplay code. */
  var reduceMotion = false;
  try { reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { reduceMotion = false; }
  var hapOn = true;
  try { hapOn = localStorage.getItem('bubblehex_hap') !== 'off'; } catch (e) { hapOn = true; }
  function hap(pattern) {
    if (reduceMotion || !hapOn) return;
    try {
      if (typeof navigator !== 'undefined' && navigator && 'vibrate' in navigator) {
        try { navigator.vibrate(0); } catch (e0) {} // cancel in-flight buzz (Android ignores retrigger otherwise)
        navigator.vibrate(pattern);
      }
    } catch (e) {}
  }

  /* idle shimmer glints: sparkle sprites that twinkle on board bubbles */
  function spawnGlint(x, y, size, vy) {
    if (reduceMotion) return;
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (!p.on) {
        p.on = true; p.x = x; p.y = y; p.vx = 0; p.vy = vy || -14;
        p.life = 0.6; p.age = 0; p.size = size; p.color = '#ffffff';
        p.grav = 0; p.glint = true;
        return;
      }
    }
  }
  var MOTES = ['#ffe9f5', '#d9f2ff', '#e8dcff', '#fffbe8', '#ffd9f2'];
  function moteBurst(x, y, n) {
    if (reduceMotion) n = Math.max(1, Math.ceil(n / 3));
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 16 + Math.random() * 44; // slow drift
      spawnP(x, y, Math.cos(a) * s, Math.sin(a) * s - 30,
        1.2 + Math.random() * 0.9, 3 + Math.random() * 3.5,
        MOTES[(Math.random() * MOTES.length) | 0], -55); // negative grav: floats up
    }
  }

  /* Gentle squash pulses keyed by board cell. */
  function pulseAround(r, c, self) {
    if (!state || !state.pulseCells) return;
    if (self) state.pulseCells[E.key(r, c)] = 0;
    var ns = E.neighbors(r, c);
    for (var i = 0; i < ns.length; i++) {
      var k = E.key(ns[i][0], ns[i][1]);
      if (E.get(state.board, ns[i][0], ns[i][1]) && state.pulseCells[k] == null) state.pulseCells[k] = 0;
    }
  }

  var Feel = {
    pop: function (x, y, bub, big) {
      popFx(x, y, bub, big);
      moteBurst(x, y, big ? 10 : 5);
      scatterFlies(x, y);
    },
    drop: function (x, y, bub) {
      dropFx(x, y, bub);
      moteBurst(x, y, 6);
      scatterFlies(x, y);
    }
  };

  /* Pre-rendered runtime sprites: mist puff, orb aura, Nero/NEXT labels.
   * Paint once, blit per frame — no per-frame gradients or canvas text. */
  function uiDpr() { return Math.min(window.devicePixelRatio || 1, 2); }
  var mistSprite = null;
  function getMistSprite() {
    if (!mistSprite) {
      var c = document.createElement('canvas');
      var d = uiDpr();
      c.width = 360 * d; c.height = 120 * d;
      var x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0);
      var g = x.createRadialGradient(180, 60, 10, 180, 60, 180);
      g.addColorStop(0, 'rgba(150,130,220,.14)');
      g.addColorStop(1, 'rgba(150,130,220,0)');
      x.fillStyle = g; x.fillRect(0, 0, 360, 120);
      mistSprite = c;
    }
    return mistSprite;
  }
  var auraSprite = null;
  function getAuraSprite() {
    if (!auraSprite) {
      var c = document.createElement('canvas');
      var d = uiDpr();
      c.width = 180 * d; c.height = 180 * d;
      var x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0);
      var g = x.createRadialGradient(90, 90, 8, 90, 90, 90);
      g.addColorStop(0, 'rgba(255,225,77,.42)');
      g.addColorStop(1, 'rgba(255,225,77,0)');
      x.fillStyle = g; x.fillRect(0, 0, 180, 180);
      auraSprite = c;
    }
    return auraSprite;
  }
  var neroLabelCache = {};
  function neroLabel(n) {
    var k = n > 0 ? 'n' + n : 'tap';
    if (!neroLabelCache[k]) {
      var big = n > 0;
      var d = uiDpr();
      var label = big ? (n + '/4') : 'TAP NERO';
      var font = (big ? '800 13px' : '600 10px') + ' ui-rounded, system-ui, sans-serif';
      var meas = document.createElement('canvas').getContext('2d');
      meas.font = font;
      var tw = Math.ceil(meas.measureText(label).width) + 16;
      var c = document.createElement('canvas');
      c.width = tw * d; c.height = 22 * d;
      var x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0);
      x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
      if (big) {
        x.fillStyle = 'rgba(14,8,24,.78)';
        x.beginPath();
        x.moveTo(11, 1); x.arcTo(tw - 1, 1, tw - 1, 21, 10);
        x.arcTo(tw - 1, 21, 1, 21, 10); x.arcTo(1, 21, 1, 1, 10);
        x.arcTo(1, 1, tw - 1, 1, 10); x.closePath(); x.fill();
      }
      x.fillStyle = big ? '#ffd34d' : 'rgba(255,255,255,.4)';
      x.fillText(label, tw / 2, 11.5);
      neroLabelCache[k] = { c: c, w: tw };
    }
    return neroLabelCache[k];
  }
  var nextLabelSprite = null;
  function nextLabel() {
    if (!nextLabelSprite) {
      var d = uiDpr();
      var c = document.createElement('canvas');
      c.width = 64 * d; c.height = 16 * d;
      var x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0);
      x.font = '600 10px ui-rounded, system-ui, sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = 'rgba(255,255,255,.55)';
      x.fillText('NEXT', 32, 8.5);
      nextLabelSprite = { c: c, w: 64 };
    }
    return nextLabelSprite;
  }

  /* ================= Resize ================= */
  function resize() {
    var wrap = canvas.parentElement;
    W = Math.min(wrap.clientWidth || 400, 520);
    H = Math.max(420, Math.min(window.innerHeight * 0.66, 680));
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    R = Math.max(15, Math.min(21, W / (E.COLS * 2.25)));
    SHOOT_Y = H - 78;
    Art.background(W, H);
    seedAmbient();
  }
  window.addEventListener('resize', resize);

  function seedAmbient() {
    fireflies = [];
    for (var i = 0; i < 16; i++) {
      fireflies.push({
        x: Math.random() * W, y: Math.random() * H * 0.8,
        ph: Math.random() * 7, sp: 0.4 + Math.random() * 0.8,
        amp: 12 + Math.random() * 22, svx: 0, svy: 0
      });
    }
    mists = [];
    for (var j = 0; j < 3; j++) {
      mists.push({ x: Math.random() * W, y: H * (0.35 + j * 0.2), sp: 6 + j * 5, w: W * 0.7, a: 0.05 + j * 0.02 });
    }
  }

  /* Fireflies scatter away from nearby pops, then drift back. The unrequested touch. */
  function scatterFlies(x, y) {
    if (reduceMotion) return;
    for (var i = 0; i < fireflies.length; i++) {
      var f = fireflies[i];
      var dx = f.x - x, dy = f.y - y;
      var d2 = dx * dx + dy * dy;
      if (d2 < 130 * 130 && d2 > 1) {
        var d = Math.sqrt(d2);
        f.svx += dx / d * 110;
        f.svy += dy / d * 110;
      }
    }
  }

  /* ================= Level loading ================= */
  function colorFor(ch, colors, r, c) {
    if (ch === 'K') return 'K'; // black doom bubble (BWS3 trouble bubble)
    if (E.COLORS.indexOf(ch) >= 0) return ch;
    return colors[(r * 7 + c * 3) % colors.length]; // deterministic scatter
  }

  function loadLevel(idx, dailyObj) {
    var L = dailyObj || LEVELS[idx];
    resize();
    var board = E.newBoard();
    var colors = E.COLORS.slice(0, L.colors);
    L.layout.forEach(function (row, r) {
      for (var c = 0; c < row.length && c < E.COLS; c++) {
        var ch = row[c];
        if (ch === '.' || ch === ' ') continue;
        var bub = null;
        if (ch === '#') bub = { color: 'X', blocker: true };
        else if (ch === 'F') bub = { color: colorFor('?', colors, r, c), familiar: true };
        else if (ch === 'W') bub = { color: 'W' };
        else bub = { color: colorFor(ch, colors, r, c) };
        E.set(board, r, c, bub);
      }
    });
    state = {
      idx: idx, daily: dailyObj || null, level: L, board: board, colors: colors,
      shots: L.shots, score: 0, orb: 0, orbMax: 14,
      current: null, next: null, flying: null,
      ghost: L.ghostStart ? { r: L.ghostStart[0], c: L.ghostStart[1] } : null,
      rescued: 0, familiarsTotal: countFamiliars(board),
      wilbur: L.type === 'boss' ? { hp: L.shield || 10, maxHp: L.shield || 10, x: W / 2, y: 0, flee: 0, hitT: 0 } : null,
      aiming: false, aimAngle: -Math.PI / 2,
      over: false, won: false, combo: 0, missStreak: 0,
      nero: 0, neroEat: 0,
      descendAnim: 0, shake: null, castT: 0, castBeam: null,
      lastColors: [], shotsSinceDrop: 0,
      stellaPose: 'idle', stellaBob: Math.random() * 7,
      aimPulse: 0, introT: 0,
      owlsFlying: [], blastArmed: false,
      pulseCells: {}, enterT: 0, aimIn: 1, slowmo: null
    };
    state.current = newShooterBubble();
    state.next = newShooterBubble();
    state.orbEl = $('orb-fill');
    view = 'game';
    updateHUD();
    showScreen('game');
    HexAudio.music(true);
    coachForLevel(idx, L);
    if (state.wilbur) {
      // Wilbur gloats on arrival; the taunt arrives async and never blocks play
      setTimeout(function () { if (state && state.wilbur && !state.over) wilburTaunt(idx, 100); }, 1200);
    }
  }

  /* ---- Coach marks: one tiny pointer, never a text wall ---- */
  var coachTimer = null;
  function lsFlag(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k) { try { localStorage.setItem(k, '1'); } catch (e) {} }
  function showCoach(html, holdMs) {
    var c = $('coach');
    c.innerHTML = '<span class="hand">👆</span>' + html;
    c.classList.remove('hidden');
    if (coachTimer) clearTimeout(coachTimer);
    if (holdMs) coachTimer = setTimeout(hideCoach, holdMs);
  }
  function hideCoach() {
    $('coach').classList.add('hidden');
    if (coachTimer) { clearTimeout(coachTimer); coachTimer = null; }
  }
  function coachForLevel(idx, L) {
    hideCoach();
    if (idx === 0 && !lsFlag('bubblehex_coached')) {
      lsSet('bubblehex_coached');
      showCoach('<b>Drag to aim</b>, release to shoot!<br>Match 3+ bubbles to pop them.');
      return;
    }
    // contextual coach the first time doom bubbles appear
    var hasDoom = L.layout.some(function (row) { return row.indexOf('K') >= 0; });
    if (hasDoom && !lsFlag('bubblehex_doomseen')) {
      lsSet('bubblehex_doomseen');
      showCoach('😈 <b>Doom bubbles</b> can\'t be matched —<br>drop them or blast around them!', 7000);
    }
  }

  function countFamiliars(board) {
    var n = 0;
    Object.keys(board).forEach(function (k) { if (board[k].familiar) n++; });
    return n;
  }

  /* BW3-style balanced queue: never 3 of the same color in a row.
   * 6% rainbow, 4% bomb, 3% lightning on top. */
  function newShooterBubble() {
    var colors = E.boardColors(state ? state.board : {});
    var last = state ? state.lastColors : [];
    var avail = colors.filter(function (c) {
      return !(last.length >= 2 && last[last.length - 1] === c && last[last.length - 2] === c);
    });
    if (!avail.length) avail = colors;
    var pick = avail[(Math.random() * avail.length) | 0];
    if (state) state.lastColors = last.concat([pick]).slice(-3);
    var roll = Math.random();
    if (roll < 0.06) return { color: 'W' };
    if (roll < 0.10) return { color: pick, special: 'bomb' };
    if (roll < 0.13) return { color: pick, special: 'lightning' };
    return { color: pick };
  }

  function bubbleKey(bub) {
    if (bub.blocker) return '#';
    var k = bub.color;
    if (bub.special === 'bomb') k += 'bomb';
    else if (bub.special === 'lightning') k += 'light';
    return k;
  }

  function drawBoardBubble(x, y, bub, scale, alpha, sqx, sqy) {
    scale = scale || 1; alpha = alpha == null ? 1 : alpha;
    var r = R * scale, d = r * 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (sqx || sqy) { ctx.translate(x, y); ctx.scale(sqx || 1, sqy || 1); ctx.translate(-x, -y); }
    if (bub.blocker) {
      ctx.drawImage(Art.blocker(), x - d / 2, y - d / 2, d, d);
    } else {
      ctx.drawImage(Art.bubble(bubbleKey(bub)), x - d / 2, y - d / 2, d, d);
      if (bub.familiar) {
        // owl peeking out of its bubble
        var os = d * 0.72;
        ctx.drawImage(Art.owl(), x - os / 2, y - os / 2 - r * 0.06, os, os);
        // glassy shell over owl
        ctx.globalAlpha = alpha * 0.28;
        ctx.drawImage(Art.bubble('W'), x - d / 2, y - d / 2, d, d);
      }
    }
    ctx.restore();
  }

  /* ================= Input ================= */
  var aimOX = 0, aimOY = 0; // aim origin (wand tip), css px

  function canvasPos(e) {
    var rect = canvas.getBoundingClientRect();
    var t = e.touches ? e.touches[0] : e;
    return [t.clientX - rect.left, t.clientY - rect.top];
  }

  function stellaAnchor() {
    return [W / 2, SHOOT_Y + 44]; // feet
  }
  function wandTip() {
    // matches paintStella geometry: sprite 120x132, wand tip stored in sprite coords
    var spr = Art.stella(state && state.aiming ? 'aim' : 'idle');
    var tip = spr._wandTip, anch = spr._anchor;
    var a = stellaAnchor();
    var scale = STELLA_W / 120;
    return [a[0] + (tip[0] - anch[0]) * scale, a[1] - (anch[1] - tip[1]) * scale];
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (!state || state.over || state.flying || state.castT > 0 || view !== 'game') return;
    var p = canvasPos(e);
    // Nero tap → discard current bubble to the cat
    var nx = W / 2 + R * 3.4, ny = SHOOT_Y + 34;
    var dx = p[0] - nx, dy = p[1] - ny;
    if (dx * dx + dy * dy < 42 * 42) { feedNero(); return; }
    HexAudio.unlock();
    state.aiming = true;
    state.aimIn = 0; // aim guide unfurls with an eased fade-in
    state.stellaPose = 'aim';
    updateAim(p);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!state || !state.aiming) return;
    updateAim(canvasPos(e));
  });
  function endAimFire(e) {
    if (!state || !state.aiming) return;
    state.aiming = false;
    state.stellaPose = 'idle';
    fire();
  }
  canvas.addEventListener('pointerup', endAimFire);
  canvas.addEventListener('pointercancel', function () {
    if (state) { state.aiming = false; state.stellaPose = 'idle'; }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state) { state.aiming = false; state.stellaPose = 'idle'; }
  });

  function updateAim(p) {
    var o = wandTip();
    aimOX = o[0]; aimOY = o[1];
    var dx = p[0] - o[0], dy = p[1] - o[1];
    if (dy > -8) dy = -8;
    var ang = Math.atan2(dy, dx);
    var min = -Math.PI + 0.22, max = -0.22;
    if (ang < min) ang = min;
    if (ang > max) ang = max;
    state.aimAngle = ang;
  }

  function feedNero() {
    if (!state || state.over || state.flying) return;
    HexAudio.click();
    state.neroEat = 1; // mouth-open anim timer
    // tossed bubble arcs into Nero's mouth
    var sx = W / 2, sy = SHOOT_Y;
    var nx = W / 2 + R * 3.4, ny = SHOOT_Y + 30;
    state.tossAnim = { x0: sx, y0: sy, x1: nx, y1: ny, t: 0, bub: state.current };
    state.nero++;
    if (state.nero >= 4) {
      state.nero = 0;
      state.current = { color: 'W' };
      banner('🐈‍⬛ Nero coughed up a <b>rainbow bubble</b>!');
      HexAudio.orb();
      burst(nx, ny - 20, 14, '#ffffff', 130, 0.7, 5);
    } else {
      state.current = state.next;
      state.next = newShooterBubble();
    }
    setTimeout(function () { if (state) state.neroEat = 0; }, 450);
  }

  /* ================= Firing ================= */
  function fire() {
    if (!state || state.flying || state.over || state.castT > 0) return;
    hideCoach(); // the pointing hand did its job
    var bub = state.current;
    var armed = state.orb >= state.orbMax;
    if (armed) {
      startHexBlast();
      return;
    }
    HexAudio.shoot();
    state.stellaPose = 'cast';
    setTimeout(function () { if (state && !state.aiming) state.stellaPose = 'idle'; }, 260);
    var o = wandTip();
    state.flying = {
      x: o[0], y: o[1],
      vx: Math.cos(state.aimAngle) * 10.5, vy: Math.sin(state.aimAngle) * 10.5,
      bub: bub, trail: 0
    };
    state.current = state.next;
    state.next = newShooterBubble();
    state.shots--;
    updateHUD();
  }

  function stepFlight(dt) {
    var f = state.flying;
    if (!f) return;
    // vx/vy are px/frame at 60fps; scale by real dt
    f.x += f.vx * dt * 60; f.y += f.vy * dt * 60;
    if (f.x < R) { f.x = R; f.vx = -f.vx; HexAudio.tick(); }
    if (f.x > W - R) { f.x = W - R; f.vx = -f.vx; HexAudio.tick(); }
    // sparkle trail
    f.trail += dt;
    if (f.trail > 0.03) {
      f.trail = 0;
      spawnP(f.x, f.y, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.35, 4, '#fff3b0', 0);
    }
    if (f.y <= R + BOARD_TOP) { landBubble(f, true, null); return; }
    var hit = null;
    var keys = Object.keys(state.board);
    for (var i = 0; i < keys.length; i++) {
      var p = keys[i].split(','), xy = E.cellXY(+p[0], +p[1], R);
      var dx = f.x - xy[0], dy = f.y - (xy[1] + BOARD_TOP + boardDY());
      if (dx * dx + dy * dy < (R * 1.9) * (R * 1.9)) { hit = [+p[0], +p[1]]; break; }
    }
    if (hit) {
      var cell = E.nearestEmptyCell(state.board, f.x, f.y - BOARD_TOP, R);
      if (cell && E.isAttachable(state.board, cell[0], cell[1])) landBubble(f, false, cell);
      else {
        var ns = E.neighbors(hit[0], hit[1]);
        for (var j = 0; j < ns.length; j++) {
          if (!E.get(state.board, ns[j][0], ns[j][1])) { landBubble(f, false, ns[j]); return; }
        }
        landBubble(f, false, [hit[0] + 1, hit[1]]);
      }
      return;
    }
    if (f.y > H + 40 || f.x < -40 || f.x > W + 40) { state.flying = null; endTurn(); }
  }

  function landBubble(f, topRow, cell) {
    var r, c;
    if (topRow) { r = 0; c = Math.max(0, Math.min(E.COLS - 1, Math.round((f.x - R) / (2 * R)))); }
    else { r = cell[0]; c = cell[1]; }
    E.set(state.board, r, c, f.bub);
    HexAudio.stick();
    pulseAround(r, c, true); // gentle squash on the landed bubble + neighbors
    var res = E.resolveBoard(state.board, r, c);
    var xy = E.cellXY(r, c, R);
    state.flying = null;
    applyResolve(res, xy[0], xy[1] + BOARD_TOP, f.bub);
  }

  /* ================= Hex Blast (spell orb cinematic) ================= */
  function startHexBlast() {
    state.orb = 0;
    state.castT = 1.6; // seconds of cinematic
    state.stellaPose = 'cast';
    HexAudio.orbBlast();
    var o = wandTip();
    state.castBeam = { x: o[0], y: o[1], ang: state.aimAngle, w: 0 };
    state.current = state.next;
    state.next = newShooterBubble();
    state.shots--;
    state.shake = { t: 0, dur: 1.2, mag: 10 };
    updateHUD();
    $('orb-btn').classList.remove('full');
  }

  function stepBlast(dt) {
    var b = state.castBeam;
    if (!b) return;
    b.w = Math.min(1, b.w + dt * 3);
    // sweep the beam angle slightly for drama
    b.ang += dt * 0.25 * Math.sin(state.castT * 6);
    // destroy bubbles inside the beam cone progressively
    var cleared = [];
    var keys = Object.keys(state.board);
    var dirx = Math.cos(b.ang), diry = Math.sin(b.ang);
    var halfW = R * 2.6 * b.w;
    for (var i = 0; i < keys.length; i++) {
      var p = keys[i].split(','), xy = E.cellXY(+p[0], +p[1], R);
      var bx = xy[0], by = xy[1] + BOARD_TOP;
      var rx = bx - b.x, ry = by - b.y;
      var along = rx * dirx + ry * diry;
      if (along < 0 || along > H) continue;
      var perp = Math.abs(rx * -diry + ry * dirx);
      if (perp < halfW + R) {
        // stagger by distance so it sweeps upward
        if (Math.random() < 0.5 || along < 120) cleared.push([+p[0], +p[1], bx, by]);
      }
    }
    cleared.forEach(function (cc) {
      var bub = E.get(state.board, cc[0], cc[1]);
      if (!bub || bub.blocker) return;
      E.del(state.board, cc[0], cc[1]);
      Feel.pop(cc[2], cc[3], bub, true);
      state.score += 150;
      if (bub.familiar) rescueOwl(cc[2], cc[3]);
      damageWilbur(1);
    });
    // beam particles
    for (var s = 0; s < 6; s++) {
      var t = Math.random() * H;
      var px = b.x + dirx * t + (Math.random() - 0.5) * halfW * 2;
      var py = b.y + diry * t + (Math.random() - 0.5) * halfW * 2;
      spawnP(px, py, (Math.random() - 0.5) * 60, -120 - Math.random() * 80, 0.6, 5,
        ['#fff3b0', '#ff9df5', '#9df5ff', '#c44dff'][(Math.random() * 4) | 0], 0);
    }
    if (state.castT <= 0) {
      state.castBeam = null;
      state.stellaPose = 'idle';
      // drops after the blast
      var anchored = E.findAnchored(state.board);
      var dropped = [];
      Object.keys(state.board).forEach(function (k) {
        if (!anchored[k]) dropped.push(k);
      });
      dropped.forEach(function (k) {
        var pp = k.split(','), xy2 = E.cellXY(+pp[0], +pp[1], R);
        var bb2 = E.get(state.board, +pp[0], +pp[1]);
        E.del(state.board, +pp[0], +pp[1]);
        if (bb2 && !bb2.blocker) {
          Feel.drop(xy2[0], xy2[1] + BOARD_TOP, bb2);
          state.score += 60;
          if (bb2.familiar) rescueOwl(xy2[0], xy2[1] + BOARD_TOP);
        }
      });
      if (dropped.length) HexAudio.drop();
      updateGhost();
      endTurn();
    }
  }

  /* ================= Resolve / scoring ================= */
  function popFx(x, y, bub, big) {
    var cols = { R: '#ff7d95', B: '#8fc4ff', G: '#9dffb8', Y: '#fff3a0', P: '#df9dff', W: '#ffffff', X: '#8a8a9a' };
    burst(x, y, big ? 16 : 9, cols[bub.color] || '#fff', big ? 200 : 130, 0.6, 5);
    rings.push({ x: x, y: y, t: 0, dur: big ? 0.5 : 0.35, max: big ? R * 3.2 : R * 2.2 });
  }
  function dropFx(x, y, bub) {
    floaters.push({ x: x, y: y, vy: 190, t: 0, dur: 0.8, text: '', bub: bub, kind: 'drop' });
  }

  function applyResolve(res, x, y, shotBub) {
    var i, rc, xy;
    for (i = 0; i < res.popped.length; i++) {
      rc = res.popped[i];
      xy = E.cellXY(rc[0], rc[1], R);
      Feel.pop(xy[0], xy[1] + BOARD_TOP, { color: rc[2] || 'Y' }, res.popped.length >= 6);
      pulseAround(rc[0], rc[1], false); // neighbors wobble gently
    }
    // Puzzle Bobble-style exponential drop scoring: 20, 40, 80, ...
    var dropScore = 0;
    for (var di = 0; di < res.dropped.length; di++) dropScore += 20 * Math.pow(2, di);
    // combo multiplier (up to x5), resets on a miss
    var mult = 1;
    if (res.popped.length) {
      state.combo++;
      mult = Math.min(state.combo, 5);
      if (mult > 1) banner('🔥 <b>Combo x' + mult + '</b>');
    } else {
      state.combo = 0;
      state.missStreak++;
    }
    var total = (res.score + dropScore) * mult;
    if (res.popped.length) {
      HexAudio.pop(res.popped.length, mult);
      hap([20]); // light tap on every match
      state.score += total;
      state.orb = Math.min(state.orbMax, state.orb + res.popped.length);
      if (state.orb >= state.orbMax) {
        $('orb-btn').classList.add('full');
        banner('✦ <b>HEX BLAST READY</b> — fire to unleash it!');
        HexAudio.orbReady();
      }
      floaters.push({ x: x, y: y - 10, t: 0, dur: 0.9, text: '+' + total, kind: 'text', big: mult > 1 });
      // Wilbur takes damage per popped bubble
      for (var w = 0; w < res.popped.length; w++) damageWilbur(1);
    }
    if (dropScore > 0) {
      floaters.push({ x: x, y: y - 34, t: 0, dur: 1.2, text: 'DROP +' + dropScore * mult, kind: 'text' });
    }
    if (res.popped.length >= 6 || res.dropped.length >= 4) {
      // escalating shake on big pops (whisper-soft stays for small moments)
      var pc = res.popped.length + res.dropped.length;
      if (!reduceMotion) state.shake = { t: 0, dur: 0.34, mag: Math.min(18, 5 + pc * 1.4) };
      if (pc >= 6 && !reduceMotion) state.flash = Math.min(0.4, 0.1 + pc * 0.025);
    }
    for (i = 0; i < res.dropped.length; i++) {
      rc = res.dropped[i];
      xy = E.cellXY(rc[0], rc[1], R);
      Feel.drop(xy[0], xy[1] + BOARD_TOP, { color: rc[2] || 'B' });
    }
    if (res.dropped.length) HexAudio.drop();
    updateGhost();
    updateHUD();
    // ceiling pressure: every 4 shots the branch descends a row
    state.shotsSinceDrop++;
    if (state.shotsSinceDrop >= 4) {
      state.shotsSinceDrop = 0;
      descendBoard();
    }
    if (!state.over) endTurn();
  }

  function damageWilbur(n) {
    var wb = state && state.wilbur;
    if (!wb || wb.flee) return;
    wb.hp -= n;
    wb.hitT = 0.35;
    HexAudio.caw();
    // taunt at damage milestones (once each)
    var frac = wb.maxHp ? wb.hp / wb.maxHp : 0;
    if (frac <= 0.66 && !wb.taunt66) { wb.taunt66 = 1; wilburTaunt(state.idx, 66); }
    else if (frac <= 0.33 && !wb.taunt33) { wb.taunt33 = 1; wilburTaunt(state.idx, 33); }
    var fx = wb.x, fy = 54;
    for (var i = 0; i < 5; i++) {
      floaters.push({
        x: fx + (Math.random() - 0.5) * 60, y: fy + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 60,
        t: 0, dur: 1.1, kind: 'feather'
      });
    }
    if (wb.hp <= 0) {
      wb.hp = 0; wb.flee = 1;
      state.score += 2000;
      banner('🐈‍⬛ <b>Wilbur is defeated!</b> +2000');
      floaters.push({ x: fx, y: fy, t: 0, dur: 1.4, text: '+2000 WILBUR DOWN!', kind: 'text', big: true });
      HexAudio.wilburDown();
    }
    updateHUD();
  }

  function rescueOwl(x, y) {
    state.rescued++;
    HexAudio.hoot();
    state.owlsFlying.push({ x: x, y: y, t: 0, vx: (Math.random() - 0.5) * 60, vy: -160 });
    burst(x, y, 10, '#ffe9b0', 120, 0.7, 5);
  }

  function descendBoard() {
    var nb = E.newBoard(), gameOver = false;
    Object.keys(state.board).forEach(function (k) {
      var p = k.split(','), r = +p[0] + 1, c = +p[1];
      if (r >= E.ROWS - 2) gameOver = true;
      if (r < E.ROWS) E.set(nb, r, c, state.board[k]);
    });
    state.board = nb;
    state.descendAnim = 0; // animates 0→1 in render
    state.descending = true;
    if (state.ghost) state.ghost.r = Math.min(state.ghost.r + 1, E.ROWS - 1);
    HexAudio.rumble();
    if (!gameOver) banner('⚠️ The branches <b>descend</b>!');
    else lose('The bubbles reached Stella!');
  }

  function updateGhost() {
    var g = state.ghost;
    if (!g) return;
    while (g.r > 0 && !E.get(state.board, g.r - 1, g.c)) g.r--;
    if (g.r === 0) {
      state.ghost = null;
      state.score += 1000;
      banner('👻 <b>Spirit freed!</b> +1000');
      floaters.push({ x: W / 2, y: BOARD_TOP + 60, t: 0, dur: 1.4, text: '+1000 SPIRIT FREED!', kind: 'text', big: true });
      HexAudio.ghostFree();
      burst(W / 2, BOARD_TOP + 60, 22, '#c9d4ff', 170, 1, 6);
    }
  }

  function endTurn() {
    if (!state || state.over) return;
    var remaining = 0;
    Object.keys(state.board).forEach(function (k) { if (!state.board[k].blocker) remaining++; });
    if (remaining === 0) { win(); return; }
    if (state.shots <= 0) { lose('Out of shots!'); return; }
    updateHUD();
  }

  /* ================= Render ================= */
  function boardDY() {
    if (!state || !state.descending) return 0;
    return -(1 - state.descendAnim) * R * 1.732;
  }

  var lastT = 0, lastDt = 0.016;
  function tick(t) {
    requestAnimationFrame(tick);
    if (view !== 'game' || !state) return;
    var dt = Math.min((t - lastT) / 1000 || 0.016, 0.1);
    lastT = t; lastDt = dt;
    var timeScale = 1;
    if (state.slowmo) {
      // slow-mo micro-dip: sim eases back to full speed, visuals stay realtime
      state.slowmo.t += dt;
      var st2 = Math.min(1, state.slowmo.t / state.slowmo.dur);
      var e2 = st2 * st2 * (3 - 2 * st2);
      timeScale = 0.35 + 0.65 * e2;
      if (st2 >= 1) state.slowmo = null;
    }
    update(dt * timeScale, t / 1000);
    render(t / 1000);
  }

  function update(dt, now) {
    var s = state;
    s.stellaBob += dt * 2;
    s.aimPulse += dt * 3;
    if (s.aiming) s.aimIn = Math.min(1, (s.aimIn || 0) + dt * 5);
    if (s.enterT < 1) s.enterT = Math.min(1, s.enterT + dt / 0.9); // level enter fade
    // gentle squash pulses age out
    if (s.pulseCells) {
      var pk = Object.keys(s.pulseCells);
      for (var qi = 0; qi < pk.length; qi++) {
        s.pulseCells[pk[qi]] += dt;
        if (s.pulseCells[pk[qi]] > 0.5) delete s.pulseCells[pk[qi]];
      }
    }
    if (s.descending) {
      s.descendAnim += dt * 2.2;
      if (s.descendAnim >= 1) { s.descendAnim = 1; s.descending = false; }
    }
    if (s.shake) {
      s.shake.t += dt;
      if (s.shake.t >= s.shake.dur) s.shake = null;
    }
    if (s.castT > 0) { s.castT -= dt; stepBlast(dt); }
    if (s.flying) stepFlight(dt);
    // particles
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (!p.on) continue;
      p.age += dt;
      if (p.age >= p.life) { p.on = false; continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    // floaters
    for (var f = floaters.length - 1; f >= 0; f--) {
      var fl = floaters[f];
      fl.t += dt;
      if (fl.t >= fl.dur) { floaters.splice(f, 1); continue; }
      if (fl.kind === 'drop') fl.vy += 500 * dt;
      if (fl.vx) fl.x += fl.vx * dt;
      if (fl.vy) fl.y += fl.vy * dt;
    }
    for (var ri = rings.length - 1; ri >= 0; ri--) {
      rings[ri].t += dt;
      if (rings[ri].t >= rings[ri].dur) rings.splice(ri, 1);
    }
    // owls flying off
    for (var oi = s.owlsFlying.length - 1; oi >= 0; oi--) {
      var ow = s.owlsFlying[oi];
      ow.t += dt;
      ow.x += ow.vx * dt; ow.y += ow.vy * dt;
      if (ow.y < -60) s.owlsFlying.splice(oi, 1);
    }
    // firefly scatter drift (decays back to ambient)
    for (var fly = 0; fly < fireflies.length; fly++) {
      var ff = fireflies[fly];
      if (ff.svx || ff.svy) {
        ff.x += ff.svx * dt; ff.y += ff.svy * dt;
        var dec = Math.max(0, 1 - dt * 2.2);
        ff.svx *= dec; ff.svy *= dec;
        if (Math.abs(ff.svx) < 2) ff.svx = 0;
        if (Math.abs(ff.svy) < 2) ff.svy = 0;
      }
    }
    // Nero idly paws at the shooter bubble every few seconds
    if (s.neroPaw > 0) s.neroPaw -= dt;
    else if (!s.aiming && !s.flying && !s.over && Math.random() < dt * 0.16) s.neroPaw = 0.55;
    // screen flash decay
    if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 0.55);
    // Nero toss anim
    if (s.tossAnim) {
      s.tossAnim.t += dt * 2.4;
      if (s.tossAnim.t >= 1) { s.tossAnim = null; HexAudio.gulp(); }
    }
    // Wilbur flee
    var wb = s.wilbur;
    if (wb) {
      if (wb.flee) { wb.x += dt * 260; wb.y -= dt * 200; }
      else {
        // slow menacing hover (was twitchy; now a dreadnought drift)
        wb.x = W / 2 + Math.sin(now * 0.65) * 18;
        wb.y = 6 + Math.sin(now * 1.05) * 6 + boardDY();
      }
      if (wb.hitT > 0) wb.hitT -= dt;
    }
    // orb glow pulse on Stella handled in render
  }

  function render(now) {
    var s = state;
    ctx.save();
    if (s.shake && !reduceMotion) {
      // whisper-soft shimmer, not a shake: smooth drift, a few px at most
      var st = s.shake.t / s.shake.dur;
      var mag = s.shake.mag * (1 - st) * 0.35;
      ctx.translate(Math.sin(st * Math.PI * 3) * mag, Math.cos(st * Math.PI * 2.3) * mag * 0.7);
    }
    ctx.clearRect(-30, -30, W + 60, H + 60);

    // background layers
    var bgs = Art.background(W, H);
    // bg layers: 0 sky, 1 far pines, 2 mid pines (wide, sways), 3 near trees
    ctx.drawImage(bgs[0], 0, 0, W, H);
    ctx.drawImage(bgs[1], 0, 0, W, H);
    var swayX = reduceMotion ? 0 : Math.sin(now * 0.22) * 12;
    ctx.drawImage(bgs[2], -24 + swayX, 0, W + 48, H);
    drawMist(now);
    ctx.drawImage(bgs[3], 0, 0, W, H);
    drawTwinkles(now);
    drawFireflies(now);

    var dy = boardDY();

    // branch ceiling
    var br = Art.branch(W);
    ctx.drawImage(br, 0, BOARD_TOP - 52 + dy, W, 64);

    // Wilbur perched above branch
    if (s.wilbur && !s.wilbur.fleeGone) {
      var wb = s.wilbur;
      var ws = 96;
      // menacing aura, pulsing slowly
      if (!reduceMotion) {
        var ap = 0.7 + 0.3 * Math.sin(now * 1.4);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = ap;
        var aura = Art.wilburAura();
        ctx.drawImage(aura, wb.x - ws, wb.y - 20 - ws / 2, ws * 2, ws * 2);
        ctx.restore();
      }
      var wimg = Art.wilbur(wb.hitT > 0);
      ctx.drawImage(wimg, wb.x - ws / 2, wb.y - 20, ws, ws * 132 / 130);
      // hp bar
      var hw = 110, hx = wb.x - hw / 2, hy = wb.y + 78;
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      roundRect(hx - 3, hy - 3, hw + 6, 12, 6); ctx.fill();
      ctx.fillStyle = '#3a2a5a'; roundRect(hx, hy, hw, 6, 3); ctx.fill();
      ctx.fillStyle = wb.hp / wb.maxHp > 0.35 ? '#ff5f6d' : '#ffb52e';
      roundRect(hx, hy, hw * Math.max(0, wb.hp / wb.maxHp), 6, 3); ctx.fill();
      if (wb.flee && wb.x > W + 120) wb.fleeGone = true;
    }

    // board bubbles (gentle squash from recent impacts)
    var keys = Object.keys(s.board);
    for (var i = 0; i < keys.length; i++) {
      var p = keys[i].split(','), xy = E.cellXY(+p[0], +p[1], R);
      var pt = s.pulseCells ? s.pulseCells[keys[i]] : null;
      var sqx = 1, sqy = 1;
      if (pt != null) {
        var ph = Math.min(1, pt / 0.5);
        var wob = Math.sin(ph * Math.PI) * 0.12 * (1 - ph * 0.35);
        sqx = 1 + wob; sqy = 1 - wob * 0.85;
      }
      var bbx = xy[0], bby = xy[1] + BOARD_TOP + dy;
      var bdat = s.board[keys[i]];
      drawBoardBubble(bbx, bby, bdat, 1, 1, sqx, sqy);
      if (!reduceMotion) {
        if (bdat.color === 'K') {
          // doom bubbles pulse with animated purple crackle
          var cp = 0.5 + 0.5 * Math.sin(now * 6.5 + bbx * 0.05 + bby * 0.07);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.4 + 0.45 * cp;
          var gring = Art.glowRing('K');
          ctx.drawImage(gring, bbx - R * 1.7, bby - R * 1.7, R * 3.4, R * 3.4);
          ctx.restore();
        } else if (Math.random() < lastDt * 0.045) {
          // idle shimmer: a glint drifts off a random bubble every so often
          spawnGlint(bbx + (Math.random() - 0.5) * R, bby + (Math.random() - 0.5) * R, 4 + Math.random() * 4);
        }
      }
    }
    // ghost
    if (s.ghost) {
      var gx = E.cellXY(s.ghost.r, s.ghost.c, R);
      var gs = R * 2.4;
      var bob = Math.sin(now * 3 + 1) * 5;
      ctx.globalAlpha = 0.92;
      ctx.drawImage(Art.ghost(), gx[0] - gs / 2, gx[1] + BOARD_TOP + dy - gs / 2 + bob, gs, gs * 76 / 64);
      ctx.globalAlpha = 1;
      if (Math.random() < 0.1) spawnP(gx[0], gx[1] + BOARD_TOP + dy + 14, (Math.random() - 0.5) * 20, 30, 0.8, 4, '#c9d4ff', 0);
    }

    // flying bubble + trail
    if (s.flying) {
      var f = s.flying;
      drawBoardBubble(f.x, f.y, f.bub);
    }

    // aim guide
    if (s.aiming && !s.flying && !s.over && s.castT <= 0) drawAimGuide(now);

    // Hex Blast beam
    if (s.castBeam) drawBeam(s.castBeam, now);

    drawStella(now);
    drawCurrentBubble(now); // after Stella: nothing ever covers the loaded ball
    drawNero(now);

    // next-bubble preview (pre-rendered NEXT label: no per-frame text)
    if (s.next && !s.over) {
      var nxx = W / 2 - R * 3.6, nyy = SHOOT_Y + 26;
      ctx.globalAlpha = 0.85;
      var nd = R * 1.1;
      ctx.drawImage(Art.bubble(bubbleKey(s.next)), nxx - nd / 2, nyy - nd / 2, nd, nd);
      ctx.globalAlpha = 1;
      var nxl = nextLabel();
      ctx.drawImage(nxl.c, nxx - nxl.w / 2, nyy + R * 1.15 - 8, nxl.w, 16);
    }

    // tossed bubble → Nero
    if (s.tossAnim) {
      var ta = s.tossAnim, tt = ta.t;
      var txp = ta.x0 + (ta.x1 - ta.x0) * tt;
      var typ = ta.y0 + (ta.y1 - ta.y0) * tt - Math.sin(tt * Math.PI) * 46;
      drawBoardBubble(txp, typ, ta.bub, 0.8);
    }

    // owls flying free
    for (var oi = 0; oi < s.owlsFlying.length; oi++) {
      var ow = s.owlsFlying[oi];
      var os = R * 1.6, oa = Math.max(0, 1 - ow.t / 1.4);
      ctx.globalAlpha = oa;
      ctx.drawImage(Art.owl(), ow.x - os / 2, ow.y - os / 2, os, os);
      ctx.globalAlpha = 1;
    }

    // particles + rings: additive glow pass for the dreamy look
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var dot = Art.dot(), glintS = Art.glint();
    for (var pi = 0; pi < particles.length; pi++) {
      var pt = particles[pi];
      if (!pt.on) continue;
      var lt = pt.age / pt.life;
      ctx.globalAlpha = 1 - lt;
      var psz = pt.size * (1 - lt * 0.5);
      if (pt.glint) {
        ctx.drawImage(glintS, pt.x - psz, pt.y - psz, psz * 2, psz * 2);
      } else {
        ctx.fillStyle = pt.color;
        ctx.drawImage(dot, pt.x - psz, pt.y - psz, psz * 2, psz * 2);
      }
      ctx.globalAlpha = 1;
    }
    // rings
    var ring = Art.ring();
    for (var ri = 0; ri < rings.length; ri++) {
      var rg = rings[ri], rt = rg.t / rg.dur;
      ctx.globalAlpha = 1 - rt;
      var rs = rg.max * (0.3 + rt * 0.7);
      ctx.drawImage(ring, rg.x - rs, rg.y - rs, rs * 2, rs * 2);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // floaters
    ctx.textAlign = 'center';
    for (var fi = 0; fi < floaters.length; fi++) {
      var fl = floaters[fi], ft = fl.t / fl.dur;
      if (fl.kind === 'drop') {
        ctx.globalAlpha = 1 - ft;
        drawBoardBubble(fl.x, fl.y, fl.bub, 1 - ft * 0.3);
        ctx.globalAlpha = 1;
      } else if (fl.kind === 'feather') {
        ctx.globalAlpha = 1 - ft;
        var fs2 = 20;
        ctx.drawImage(Art.feather(), fl.x - fs2 / 2, fl.y - fs2 / 2 + ft * 30, fs2, fs2);
        ctx.globalAlpha = 1;
      } else {
        // gentle scale-pop (ease-out) + cheap stroke outline instead of shadowBlur
        var pop = 1;
        if (ft < 0.3) { var pe2 = 1 - ft / 0.3; pop = 1 + 0.42 * pe2 * pe2; }
        ctx.save();
        ctx.globalAlpha = 1 - ft * ft;
        ctx.translate(fl.x, fl.y - ft * 44);
        ctx.scale(pop, pop);
        ctx.font = '800 ' + (fl.big ? 22 : 16) + 'px ui-rounded, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(12,4,26,.85)';
        ctx.strokeText(fl.text, 0, 0);
        ctx.fillStyle = fl.big ? '#ffe14d' : '#fff';
        ctx.fillText(fl.text, 0, 0);
        ctx.restore();
      }
    }

    // cinematic vignette during Hex Blast
    if (s.castT > 0) {
      ctx.fillStyle = 'rgba(10,4,24,' + (0.45 * Math.min(1, s.castT)) + ')';
      ctx.fillRect(-30, -30, W + 60, H + 60);
      if (s.castBeam) drawBeam(s.castBeam, now); // beam above vignette
    }

    ctx.restore();

    // soft screen flash on big pops (6+), decaying via s.flash
    if (s.flash > 0) {
      ctx.fillStyle = 'rgba(255,246,224,' + (s.flash * 0.5).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    // dreamy level-enter fade (eased)
    if (s.enterT < 1) {
      var et2 = 1 - s.enterT;
      ctx.fillStyle = 'rgba(13,6,32,' + (et2 * et2 * 0.6).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawMist(now) {
    var spr = getMistSprite();
    for (var i = 0; i < mists.length; i++) {
      var m = mists[i];
      var mx = ((m.x + now * m.sp) % (W + m.w)) - m.w / 2;
      ctx.globalAlpha = m.a / 0.14;
      ctx.drawImage(spr, mx - m.w / 2, m.y - 60, m.w, 120);
    }
    ctx.globalAlpha = 1;
  }

  function drawTwinkles(now) {
    if (reduceMotion) return;
    var tw = Art.twinkles(W, H);
    var glint = Art.glint();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < tw.length; i++) {
      var t = tw[i];
      var a = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(now * 1.6 + t[3]));
      ctx.globalAlpha = a * 0.8;
      var s2 = t[2] * 2;
      ctx.drawImage(glint, t[0] - s2, t[1] - s2, s2 * 2, s2 * 2);
    }
    ctx.restore();
  }

  function drawFireflies(now) {
    var dot = Art.dot();
    for (var i = 0; i < fireflies.length; i++) {
      var f = fireflies[i];
      var fx = f.x + Math.sin(now * f.sp + f.ph) * f.amp;
      var fy = f.y + Math.cos(now * f.sp * 0.7 + f.ph) * f.amp * 0.6;
      var tw = 0.35 + 0.65 * Math.abs(Math.sin(now * 1.7 + f.ph * 2));
      ctx.globalAlpha = tw * 0.8;
      var s = 7;
      ctx.drawImage(dot, fx - s, fy - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
  }

  /* The loaded shooter bubble — Jimmy's hard requirement.
   * LARGE (1.32x), wrapped in a soft additive glow ring tinted in its OWN
   * color, with a gentle pulse. Drawn AFTER Stella so she, the aim guide,
   * and every effect never obscure it. Positioned at the wand tip — the
   * exact spot the shot launches from. The next-bubble preview and the HUD
   * ammo chip back it up. */
  function drawCurrentBubble(now) {
    var s = state;
    if (!s.current || s.over) return;
    var wt = wandTip();
    var key = bubbleKey(s.current);
    var d = R * 2 * 1.32;
    var pulse = reduceMotion ? 1 : 1 + Math.sin(now * 3.2) * 0.035;
    // color-tinted glow ring (additive, behind the bubble)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = reduceMotion ? 0.65 : 0.65 + 0.3 * (0.5 + 0.5 * Math.sin(now * 3.2));
    var gr = Art.glowRing(key);
    var gd = d * 2.4;
    ctx.drawImage(gr, wt[0] - gd / 2, wt[1] - gd / 2, gd, gd);
    ctx.restore();
    // the bubble itself
    var dd = d * pulse;
    ctx.drawImage(Art.bubble(key), wt[0] - dd / 2, wt[1] - dd / 2, dd, dd);
  }

  function drawStella(now) {
    var s = state;
    var pose = s.stellaPose;
    var img = Art.stella(pose);
    var dw = STELLA_W, dh = STELLA_W * 132 / 120;
    var a = stellaAnchor();
    var bob = Math.sin(s.stellaBob) * 3;
    // cast flick: Stella leans into the shot for a beat
    var flick = 0, stretchY = 1;
    if (s.castT > 0 && !reduceMotion) {
      flick = Math.sin(Math.min(1, s.castT / 0.25) * Math.PI) * 6;
      stretchY = 1 + Math.sin(Math.min(1, s.castT / 0.25) * Math.PI) * 0.04;
    }
    // idle breathing: gentle scale on the draw height
    var breathe = reduceMotion ? 1 : 1 + Math.sin(now * 2.2) * 0.008;
    // orb-full aura (pre-rendered sprite, pulsed)
    if (s.orb >= s.orbMax) {
      var pulse = 0.5 + 0.5 * Math.sin(now * 5);
      ctx.globalAlpha = 0.55 + pulse * 0.35;
      ctx.drawImage(getAuraSprite(), a[0] - 90, a[1] - 160, 180, 180);
      ctx.globalAlpha = 1;
    }
    var dh2 = dh * breathe * stretchY;
    ctx.drawImage(img, a[0] - dw / 2 + flick, a[1] - dh2 + bob, dw, dh2);
    // idle wand sparkles
    if (Math.random() < 0.06) {
      var wt = wandTip();
      spawnP(wt[0], wt[1], (Math.random() - 0.5) * 40, -30 - Math.random() * 30, 0.6, 4, '#ffe14d', 0);
    }
  }

  function drawNero(now) {
    var s = state;
    var nx = W / 2 + R * 3.4, ny = SHOOT_Y + 34;
    var img = Art.nero(s.neroEat > 0, s.neroPaw > 0);
    var dw = 62, dh = 62 * 70 / 76;
    var bob = Math.sin(now * 2.2 + 2) * 2;
    ctx.drawImage(img, nx - dw / 2, ny - dh + bob, dw, dh);
    // discard counter / hint: pre-rendered label sprite, no per-frame text
    var nl = neroLabel(s.nero);
    ctx.drawImage(nl.c, nx - nl.w / 2, ny + 8, nl.w, 22);
    s.neroXY = [nx, ny - 20];
  }

  function drawAimGuide(now) {
    var s = state;
    var o = wandTip();
    var vx = Math.cos(s.aimAngle), vy = Math.sin(s.aimAngle);
    var x = o[0], y = o[1];
    var stepLen = 15, drawn = 0;
    var ain = s.aimIn == null ? 1 : s.aimIn;
    ain = 1 - (1 - ain) * (1 - ain); // easeOutQuad: guide unfurls gently
    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; // soft additive glow on the path
    ctx.globalAlpha = 0.85 * ain;
    var dot = Art.aimDot();
    for (var i = 0; i < 90; i++) {
      x += vx * stepLen; y += vy * stepLen;
      if (x < R) { x = R; vx = -vx; }
      if (x > W - R) { x = W - R; vx = -vx; }
      if (y <= R + BOARD_TOP) break;
      var hitB = false;
      var keys = Object.keys(s.board);
      for (var k = 0; k < keys.length; k++) {
        var p = keys[k].split(','), xy = E.cellXY(+p[0], +p[1], R);
        var dx = x - xy[0], dyy = y - (xy[1] + BOARD_TOP + boardDY());
        if (dx * dx + dyy * dyy < (R * 1.7) * (R * 1.7)) { hitB = true; break; }
      }
      if (hitB) break;
      var ds = (5 + Math.sin(now * 8 - drawn * 0.55) * 1.4) * (0.35 + 0.65 * ain);
      ctx.drawImage(dot, x - ds, y - ds, ds * 2, ds * 2);
      drawn++;
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    // landing ring: double ring, pulsing
    var pulse = 1 + Math.sin(now * 6) * 0.14;
    var ring = Art.ring();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.95 * ain;
    var rs = R * 1.15 * pulse;
    ctx.drawImage(ring, x - rs, y - rs, rs * 2, rs * 2);
    ctx.globalAlpha = 0.4 * ain;
    var rs2 = R * 1.5 * (1.6 - pulse * 0.6);
    ctx.drawImage(ring, x - rs2, y - rs2, rs2 * 2, rs2 * 2);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawBeam(b, now) {
    var len = H * 1.2;
    var dirx = Math.cos(b.ang), diry = Math.sin(b.ang);
    var wdt = R * 3.4 * b.w * (1 + Math.sin(now * 20) * 0.08);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.ang + Math.PI / 2);
    var g = ctx.createLinearGradient(0, 0, 0, -len);
    var cols = ['#fff3b0', '#ff9df5', '#9df5ff', '#c44dff', '#fff3b0'];
    for (var i = 0; i < cols.length; i++) g.addColorStop(i / (cols.length - 1), cols[i]);
    ctx.globalAlpha = 0.75 * b.w;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-wdt, 0); ctx.lineTo(-wdt * 1.9, -len);
    ctx.lineTo(wdt * 1.9, -len); ctx.lineTo(wdt, 0);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.9 * b.w;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-wdt * 0.28, -len, wdt * 0.56, len);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ================= HUD ================= */
  function starThresholds(L, board) {
    var n = 0;
    Object.keys(board).forEach(function (k) { if (!board[k].blocker) n++; });
    var par = n * 130 + (L.type === 'rescue' ? 4 * 300 : 0) +
      (L.type === 'ghost' ? 1000 : 0) + (L.type === 'boss' ? 2000 : 0);
    par = Math.max(par, 1500);
    return [par * 0.45, par * 0.75, par * 1.05];
  }

  function updateHUD() {
    var s = state;
    if (!s) return;
    $('shots').textContent = s.shots;
    // shots warning: amber + pulse + warning icon at ≤5 (never color alone)
    $('hud-shots').classList.toggle('low', s.shots <= 5 && !s.over);
    $('score-num').textContent = s.score.toLocaleString();
    // ammo chip: loaded bubble → next bubble (backup for the wand-ball)
    var curKey = s.current ? bubbleKey(s.current) : '', nextKey = s.next ? bubbleKey(s.next) : '';
    if (curKey !== s._ammoCur) { s._ammoCur = curKey; if (curKey) $('ammo-cur').src = Art.bubbleImg(curKey); }
    if (nextKey !== s._ammoNext) { s._ammoNext = nextKey; if (nextKey) $('ammo-next').src = Art.bubbleImg(nextKey); }
    var L = s.level, goal = '';
    if (L.type === 'clear') goal = '✨ Pop every bubble';
    else if (L.type === 'rescue') {
      var left = 0;
      Object.keys(s.board).forEach(function (k) { if (s.board[k].familiar) left++; });
      goal = '🦉 Rescue the owls: ' + left + ' left';
    }
    else if (L.type === 'ghost') goal = s.ghost ? '👻 Guide the spirit up!' : '👻 Spirit freed!';
    else if (L.type === 'boss') goal = s.wilbur && s.wilbur.hp > 0 ? '🐈‍⬛ Defeat Wilbur!' : '✨ Pop every bubble';
    $('hud-goal').textContent = goal;
    // star bar
    if (!s.thresholds) s.thresholds = starThresholds(L, s.board);
    var th = s.thresholds, max = th[2];
    var pct = Math.min(100, s.score / max * 100);
    $('star-fill').style.width = pct + '%';
    for (var i = 0; i < 3; i++) {
      var mk = $('star-mk' + (i + 1));
      mk.style.left = (th[i] / max * 100) + '%';
      mk.classList.toggle('lit', s.score >= th[i]);
    }
    // orb: chunky round button, fills bottom-up
    s.orbEl.style.height = (s.orb / s.orbMax * 100) + '%';
    $('orb-btn').classList.toggle('full', s.orb >= s.orbMax);
    // music tension rises as shots run low
    HexAudio.setTension(s.shots <= 10 ? 1 - s.shots / 10 : 0);
  }

  var bannerTimer = null;
  function banner(html) {
    var b = $('banner');
    b.innerHTML = html;
    b.classList.remove('hidden');
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { b.classList.add('hidden'); }, 1900);
  }

  function starsEarned() {
    var s = state;
    if (!s.thresholds) return 1;
    if (s.score >= s.thresholds[2]) return 3;
    if (s.score >= s.thresholds[0]) return 2;
    return 1;
  }

  /* ================= Win / Lose ================= */
  function win() {
    var s = state;
    if (!s || s.over) return;
    s.over = true; s.won = true;
    HexAudio.win();
    hap([10, 40, 10]); // success shimmer on clear
    if (!reduceMotion) s.slowmo = { t: 0, dur: 0.9 }; // dreamy micro-dip for the Bubble Rain
    // BWS2-style Bubble Rain, now GOLD confetti with rising chimes
    var rainBonus = s.shots * 50;
    s.score += rainBonus;
    if (rainBonus > 0) {
      banner('✨ <b>Gold Bubble Rain!</b> +' + rainBonus.toLocaleString());
      var n = Math.min(s.shots, 24);
      var golds = ['#ffd34d', '#fff3b0', '#ffb52e', '#ffe14d', '#ffdf80'];
      for (var i = 0; i < n; i++) {
        (function (k) {
          setTimeout(function () {
            if (state !== s) return;
            var rx = Math.random() * W;
            for (var j = 0; j < 4; j++) {
              spawnP(rx, -10, (Math.random() - 0.5) * 40, 200 + Math.random() * 120, 1.1, 5,
                golds[(Math.random() * golds.length) | 0], 60);
            }
            HexAudio.rainTick(k); // pitch climbs as the rain falls
          }, k * 55);
        })(i);
      }
    }
    updateHUD();
    setTimeout(function () { if (state === s && view === 'game') showWinModal(); }, rainBonus > 0 ? 1450 : 250);
  }

  /* Daily streak persistence (pure logic lives in daily.js). */
  function streakRec() {
    try { return JSON.parse(localStorage.getItem('bubblehex_streak') || 'null') || { last: null, streak: 0, dates: [] }; }
    catch (e) { return { last: null, streak: 0, dates: [] }; }
  }
  function streakBump() {
    var rec = HexDaily.streakUpdate(streakRec(), dailyDateStr());
    try { localStorage.setItem('bubblehex_streak', JSON.stringify(rec)); } catch (e) {}
    return rec;
  }

  function showWinModal() {
    var s = state;
    var st = starsEarned();
    if (!s.daily) saveStars(s.idx, st);
    var isDaily = !!s.daily;
    var title = isDaily ? '📅 Daily Hex Complete!' : 'Level Complete!';
    var streakHtml = '';
    if (isDaily) {
      var rec = streakBump();
      streakHtml = '<div class="win-streak">🔥 ' + rec.streak + '-day streak!' +
        (rec.streak >= 3 ? ' · ×' + Math.min(rec.streak, 5) + ' coin bonus' : '') + '</div>';
    }
    showModal(title,
      '<img class="win-stella' + (st === 3 ? ' twirl' : '') + '" src="' + Art.stellaImg('win') + '" alt="Stella celebrates">' +
      '<div class="win-stars" id="win-stars"><span class="wstar" data-i="0">★</span><span class="wstar" data-i="1">★</span><span class="wstar" data-i="2">★</span></div>' +
      streakHtml +
      '<div class="win-score">Score: <b id="win-score">0</b></div>' +
      (isDaily ? '<div class="win-sub">Come back tomorrow for a new board</div>' : '') +
      '<div id="arc-lb" class="arc-lb"></div>',
      [{ t: isDaily ? 'Replay Daily' : (s.idx + 1 < LEVELS.length ? 'Next Level →' : 'Map'), cls: 'primary', fn: function () { hideModal(); if (s.daily) playDaily(); else if (s.idx + 1 < LEVELS.length) showIntro(s.idx + 1); else { showScreen('map'); renderMap(); } } },
       { t: 'Replay', cls: 'quiet', fn: function () { hideModal(); if (s.daily) playDaily(); else showIntro(s.idx); } },
       { t: 'Map', cls: 'quiet', fn: function () { hideModal(); showScreen('map'); renderMap(); } }]);
    // Staged ceremony — banner → stars one at a time with rising chimes →
    // score count-up → Next pulses in the thumb zone. Tap skips, never auto-skips.
    var timers = [], ceremonyDone = false;
    function finishCeremony() {
      if (ceremonyDone) return; ceremonyDone = true;
      timers.forEach(clearTimeout);
      var ws = document.querySelectorAll('#win-stars .wstar');
      for (var i = 0; i < 3; i++) ws[i].classList.toggle('lit', i < st);
      var se = $('win-score'); if (se) se.textContent = s.score.toLocaleString();
      var nb = document.querySelector('#modal-card .mbtn.primary'); if (nb) nb.classList.add('ready');
    }
    var i;
    for (i = 0; i < st; i++) {
      (function (ii) {
        timers.push(setTimeout(function () {
          var el = document.querySelector('#win-stars .wstar[data-i="' + ii + '"]');
          if (el) el.classList.add('lit');
          HexAudio.starTick(ii);
        }, reduceMotion ? 80 : 550 + ii * 520));
      })(i);
    }
    timers.push(setTimeout(function () {
      var el2 = $('win-score');
      if (!el2) { finishCeremony(); return; }
      var shown = 0, target = s.score;
      var cntTimer = setInterval(function () {
        shown += Math.max(1, Math.ceil((target - shown) / 8));
        if (shown >= target) { shown = target; clearInterval(cntTimer); finishCeremony(); }
        var e2 = $('win-score');
        if (e2) e2.textContent = shown.toLocaleString(); else clearInterval(cntTimer);
      }, 40);
    }, reduceMotion ? 80 : 550 + st * 520));
    if (isDaily) HexAudio.coinBurst();
    $('modal-card').onclick = function () { finishCeremony(); };
    var board = isDaily ? 'daily-' + dailyDateStr() : 'level-' + (s.idx + 1);
    arcadeLevelComplete('bubble-hex', board, isDaily ? 0 : s.idx + 1, s.score, isDaily);
  }

  function lose(reason) {
    var s = state;
    if (!s || s.over) return;
    s.over = true;
    HexAudio.lose();
    var copy = [
      'The woods believe in you. One more try?',
      'So close! The bubbles are rooting for you.',
      'Shake it off, witch — the next one\'s yours.'
    ];
    // retry-first: one big hopeful Retry, quiet Map exit, consoling Stella
    showModal('So close!',
      '<img class="fail-stella" src="' + Art.stellaImg('sad') + '" alt="Stella looks sad">' +
      '<div class="fail-reason">' + (reason || copy[Math.floor(Math.random() * copy.length)]) + '</div>' +
      '<div id="arc-lb" class="arc-lb"></div>',
      [{ t: '↻ Retry', cls: 'primary', fn: function () { hideModal(); if (s.daily) playDaily(); else showIntro(s.idx); } },
       { t: 'Map', cls: 'quiet', fn: function () { hideModal(); showScreen('map'); renderMap(); } }]);
  }

  /* ================= Map ================= */
  function saveStars(idx, st) {
    try {
      var d = JSON.parse(localStorage.getItem('bubblehex') || '{}');
      d[idx] = Math.max(d[idx] || 0, st);
      localStorage.setItem('bubblehex', JSON.stringify(d));
    } catch (e) {}
  }
  function getStars() {
    try { return JSON.parse(localStorage.getItem('bubblehex') || '{}'); } catch (e) { return {}; }
  }

  var dailyInfo = null; // {date, seed}
  function dailyDateStr() {
    return dailyInfo ? dailyInfo.date : new Date().toISOString().slice(0, 10);
  }

  /* Winding moonlit level path: 3 episodes of 10, level 1 at the bottom. */
  var EPISODES = ['Moonlit Hollow', 'The Deep Woods', "Wilbur's Roost"];
  function renderMap() {
    var saved = getStars();
    var total = 0;
    Object.keys(saved).forEach(function (k) { total += saved[k]; });
    $('total-stars').textContent = total;
    var wind = $('map-wind');
    wind.innerHTML = '';
    // Daily Hex card (top): 7-day strip + streak flame
    var rec = streakRec();
    var todayStr = new Date().toISOString().slice(0, 10);
    var strip = HexDaily.weekStrip(rec.dates, todayStr);
    var DOW = 'SMTWTFS';
    var stripHtml = strip.map(function (d) {
      var dow = DOW[new Date(d.date + 'T12:00:00').getDay()];
      return '<div class="dc-day' + (d.hit ? ' hit' : '') + (d.today ? ' today' : '') + '" title="' + d.date + '">' + dow + '</div>';
    }).join('');
    var dc = document.createElement('div');
    dc.className = 'daily-card';
    dc.innerHTML = '<div class="dc-cal">📅</div><div class="dc-body"><b>Daily Hex</b>' +
      '<span id="daily-sub">a fresh board every day…</span></div>' +
      (rec.streak > 0 ? '<div class="dc-streak">🔥 ' + rec.streak + '</div>' : '') +
      '<div class="dc-week">' + stripHtml + '</div>';
    dc.onclick = function () { HexAudio.click(); playDaily(); };
    wind.appendChild(dc);
    fetchDaily();
    // winding path (extra breathing room between episodes for the gates)
    var ROW = 118, EP_GAP = 96, TOP = 60, BOT = 110;
    var Hh = 30 * ROW + 2 * EP_GAP + TOP + BOT;
    var wpath = document.createElement('div');
    wpath.className = 'wind';
    wpath.style.height = Hh + 'px';
    // node centers (level 1 at bottom)
    function nodeXY(i) {
      var y = Hh - BOT - (i * ROW + Math.floor(i / 10) * EP_GAP) - ROW / 2;
      var x = 50 + 30 * Math.sin(i * 0.72);
      return [x, y];
    }
    // dotted moonlit trail through all nodes
    var dAttr = '';
    for (var s = 0; s <= 300; s++) {
      var fi = s / 300 * 29;
      var i0 = Math.floor(fi), f = fi - i0;
      var p0 = nodeXY(i0), p1 = nodeXY(Math.min(29, i0 + 1));
      var px = p0[0] + (p1[0] - p0[0]) * f, py = p0[1] + (p1[1] - p0[1]) * f;
      dAttr += (s === 0 ? 'M' : 'L') + px.toFixed(1) + ',' + py.toFixed(1);
    }
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'wind-path-svg');
    svg.setAttribute('viewBox', '0 0 100 ' + Hh);
    svg.setAttribute('preserveAspectRatio', 'none');
    var pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', dAttr);
    pathEl.setAttribute('fill', 'none');
    pathEl.setAttribute('stroke', 'rgba(255,230,160,.4)');
    pathEl.setAttribute('stroke-width', '1.6');
    pathEl.setAttribute('vector-effect', 'non-scaling-stroke');
    pathEl.setAttribute('stroke-dasharray', '1 5');
    pathEl.setAttribute('stroke-linecap', 'round');
    svg.appendChild(pathEl);
    wpath.appendChild(svg);
    // episode gates every 10 levels, centered in the episode gaps
    for (var ep = 0; ep < 3; ep++) {
      var gp = nodeXY(ep * 10);
      var gate = document.createElement('div');
      gate.className = 'wind-gate';
      gate.style.top = (gp[1] + ROW / 2 + EP_GAP / 2 - 20) + 'px';
      gate.textContent = '✦ ' + EPISODES[ep] + ' ✦';
      wpath.appendChild(gate);
    }
    // nodes
    var typeIcon = { clear: '✨', rescue: '🦉', ghost: '👻', boss: '🐈‍⬛' };
    var firstUnplayed = -1;
    LEVELS.forEach(function (L, i) {
      var unlocked = i === 0 || saved[i - 1];
      var played = !!saved[i];
      if (firstUnplayed < 0 && unlocked && !played) firstUnplayed = i;
      var pos = nodeXY(i);
      var el = document.createElement(unlocked ? 'button' : 'div');
      el.className = 'wind-node' + (unlocked ? '' : ' locked') + (i === firstUnplayed ? ' current' : '');
      el.style.left = pos[0] + '%';
      el.style.top = (pos[1] - 40) + 'px';
      el.setAttribute('aria-label', 'Level ' + (i + 1) + ': ' + L.name + (unlocked ? '' : ' (locked)'));
      el.innerHTML = '<span class="wn-circle">' + (unlocked ? (i + 1) : '🔒') + '</span>' +
        '<span class="wn-stars">' + (played ? '★'.repeat(saved[i]) + '☆'.repeat(3 - saved[i]) : (unlocked ? '☆☆☆' : '')) + '</span>' +
        '<span class="wn-name">' + (typeIcon[L.type] || '✨') + ' ' + L.name + '</span>';
      if (unlocked) {
        (function (idx) { el.onclick = function () { HexAudio.click(); showIntro(idx); }; })(i);
      }
      wpath.appendChild(el);
    });
    wind.appendChild(wpath);
    // scroll the current level into view
    var cur = wpath.querySelector('.wind-node.current');
    if (cur && cur.scrollIntoView) {
      setTimeout(function () { cur.scrollIntoView({ block: 'center', behavior: 'auto' }); }, 60);
    }
  }

  function fetchDaily() {
    arcadeFetch('/daily?game=bubble-hex', null, function (err, d) {
      var sub = $('daily-sub'), best = $('daily-best');
      if (!sub) return;
      if (d && d.seed != null) {
        dailyInfo = { date: d.date, seed: d.seed >>> 0 };
        sub.textContent = d.date + ' · same board worldwide';
        // today's best
        arcadeFetch('/scores?game=bubble-hex&board=daily-' + d.date, null, function (e2, d2) {
          if (best && d2 && d2.top && d2.top.length) {
            best.innerHTML = '🏆 ' + arcadeEsc(d2.top[0].name) + ' ' + (+d2.top[0].score).toLocaleString();
          } else if (best) best.innerHTML = '🏆 no scores yet';
        });
      } else {
        // offline fallback: deterministic local seed from date
        var ds = new Date().toISOString().slice(0, 10);
        var h = 0;
        for (var i = 0; i < ds.length; i++) h = (h * 31 + ds.charCodeAt(i)) >>> 0;
        dailyInfo = { date: ds, seed: h };
        sub.textContent = ds + ' · offline board';
      }
    });
  }

  function playDaily() {
    if (!dailyInfo) { banner('Fetching today’s board…'); fetchDaily(); return; }
    var L = window.HexDaily.genDailyLevel(dailyInfo.seed);
    showIntro(-1, L);
  }

  /* ================= Intro card ================= */
  var GOAL_COPY = {
    clear: ['✨', 'Pop every last bubble to clear the board.'],
    rescue: ['🦉', 'Free the trapped owls — pop or drop their bubbles.'],
    ghost: ['👻', 'Clear a path so the spirit can float to the top.'],
    boss: ['🐈‍⬛', 'Pelt Wilbur with pops, then clear every bubble.']
  };
  function showIntro(idx, dailyL) {
    var L = dailyL || LEVELS[idx];
    var saved = getStars();
    var best = idx >= 0 && saved[idx] ? '★'.repeat(saved[idx]) + '☆'.repeat(3 - saved[idx]) : '';
    var g = GOAL_COPY[L.type] || GOAL_COPY.clear;
    showModal((idx >= 0 ? 'Level ' + (idx + 1) : '📅 Daily Hex'),
      '<div class="intro-name">' + g[0] + ' ' + L.name + '</div>' +
      '<div class="intro-goal">' + g[1] + '</div>' +
      '<div class="intro-meta">' + L.shots + ' shots · ' + best + '</div>' +
      '<div class="intro-tip">' + introTip(L) + '</div>',
      [{ t: 'Play! 🪄', fn: function () { hideModal(); loadLevel(idx, dailyL || null); } },
       { t: 'Map', fn: function () { hideModal(); showScreen('map'); renderMap(); } }]);
    view = 'intro';
  }
  function introTip(L) {
    var tips = [
      'Tip: bank shots off the walls to reach tricky spots.',
      'Tip: feed bubbles you don’t need to Nero — 4 treats earn a rainbow.',
      'Tip: dropping a whole branch scores exponentially. Aim for the roots!',
      'Tip: charge the spell orb, then fire for the HEX BLAST.',
      'Tip: rainbow bubbles match any color. Save them for jams.'
    ];
    if (L.type === 'rescue') return 'Tip: owls count as rescued when their bubble pops OR drops.';
    if (L.type === 'ghost') return 'Tip: the spirit rises through any empty column.';
    if (L.type === 'boss') return 'Tip: every pop wounds Wilbur. Big drops hurt most.';
    return tips[(L.name.length + (L.shots || 0)) % tips.length];
  }

  /* ================= Screens & modal ================= */
  function showScreen(which) {
    view = which === 'game' ? 'game' : which;
    $('screen-title').classList.toggle('hidden', which !== 'title');
    $('screen-map').classList.toggle('hidden', which !== 'map');
    $('screen-game').classList.toggle('hidden', which !== 'game');
    if (which === 'game') { resize(); }
    if (which === 'title' || which === 'map') HexAudio.music(false);
  }
  function showModal(title, html, buttons) {
    var m = $('modal'), card = $('modal-card');
    card.innerHTML = '<h2>' + title + '</h2><div class="modal-body">' + html + '</div><div class="modal-btns"></div>';
    card.onclick = null; // ceremony skip hooks attach their own
    var btns = card.querySelector('.modal-btns');
    buttons.forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'mbtn' + (b.cls ? ' ' + b.cls : ''); btn.textContent = b.t; btn.onclick = b.fn;
      btns.appendChild(btn);
    });
    m.classList.remove('hidden');
  }
  function hideModal() { $('modal').classList.add('hidden'); }

  /* inline settings rows (pause menu + title gear): sound/music/haptics */
  function settingsHtml() {
    function row(icon, label, key, on) {
      return '<div class="set-row"><span>' + icon + ' ' + label + '</span>' +
        '<button class="set-tog" data-set="' + key + '" aria-pressed="' + on + '">' + (on ? 'ON' : 'OFF') + '</button></div>';
    }
    return row('🔊', 'Sound FX', 'sfx', HexAudio.sfx()) +
           row('🎵', 'Music', 'music', HexAudio.music()) +
           row('📳', 'Haptics', 'hap', hapOn);
  }
  function wireSettings(card) {
    var btns = card.querySelectorAll('.set-tog');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.onclick = function (e) {
          if (e && e.stopPropagation) e.stopPropagation();
          HexAudio.click();
          var k = b.getAttribute('data-set'), on;
          if (k === 'sfx') on = HexAudio.sfxToggle();
          else if (k === 'music') on = HexAudio.musicToggle();
          else {
            hapOn = !hapOn;
            try { localStorage.setItem('bubblehex_hap', hapOn ? 'on' : 'off'); } catch (e2) {}
            on = hapOn;
            if (on) hap([12]);
          }
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
          b.textContent = on ? 'ON' : 'OFF';
        };
      })(btns[i]);
    }
  }

  $('btn-pause').onclick = function () {
    if (!state || state.over || view !== 'game') return;
    HexAudio.click();
    showModal('Paused', 'Take a breath, witch.' + settingsHtml(),
      [{ t: '▶ Resume', cls: 'primary', fn: hideModal },
       { t: '↻ Restart', cls: 'quiet', fn: function () { hideModal(); showIntro(state.idx, state.daily); } },
       { t: 'Map', cls: 'quiet', fn: function () { hideModal(); showScreen('map'); renderMap(); } }]);
    wireSettings($('modal-card'));
  };
  $('orb-btn').onclick = function () {
    if (!state) return;
    if (state.orb >= state.orbMax) banner('✦ <b>HEX BLAST armed</b> — your next shot unleashes it!');
    else banner('✦ Pop bubbles to charge the spell orb (' + state.orb + '/' + state.orbMax + ')');
  };

  /* ================= Gamez Arcade (Cloudflare) ================= */
  var ARCADE_BASE = 'https://gamez-arcade.chaoticutopia84.workers.dev';
  var AI_BASE = 'https://gamez-ai.chaoticutopia84.workers.dev';
  function aiFetch(kind, ctx2, cb) {
    var done = false, timer = null;
    function fin(t) { if (!done) { done = true; if (timer) clearTimeout(timer); cb(t); } }
    timer = setTimeout(function () { fin(null); }, 7000);
    try {
      fetch(AI_BASE + '/g', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: kind, game: 'bubble-hex', ctx: ctx2 })
      }).then(function (r) { return r.json(); })
        .then(function (d) { fin(d && d.text ? d.text : null); })
        .catch(function () { fin(null); });
    } catch (e) { fin(null); }
  }
  var WILBUR_TAUNTS = [
    'You pop bubbles. I end bloodlines, little witch.',
    'Is that your best shot? My hairballs hit harder.',
    'I have lived nine lives. You will barely survive this level.',
    'Stella, Stella. All that wand-waving, and still so… mortal.',
    'Every bubble you pop only makes my entrance more dramatic.',
    'I once sneezed on a wizard. He is a frog now.'
  ];
  function wilburTaunt(levelIdx, hpBucket) {
    var slot = (levelIdx * 3 + hpBucket) % WILBUR_TAUNTS.length;
    function show(t) { banner('🐈‍⬛ <i>' + (t || WILBUR_TAUNTS[slot]) + '</i>'); }
    aiFetch('taunt', { level: levelIdx, hp: hpBucket }, show);
    setTimeout(function () { if (!$('banner').classList.contains('hidden')) return; show(null); }, 2500);
  }
  function arcadeFetch(path, body, cb) {
    var done = false, timer = null;
    function fin(e, d) { if (!done) { done = true; if (timer) clearTimeout(timer); cb(e, d); } }
    timer = setTimeout(function () { fin(new Error('timeout')); }, 10000);
    try {
      fetch(ARCADE_BASE + path, body ?
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
        .then(function (r) { return r.json(); })
        .then(function (d) { fin(null, d); })
        .catch(function (e) { fin(e); });
    } catch (e) { fin(e); }
  }
  function arcadeEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function arcadeBoardHtml(top, hl) {
    if (!top || !top.length) return '<div class="arc-lb-empty">No scores yet — be the first!</div>';
    var medals = ['🥇', '🥈', '🥉'];
    return top.slice(0, 3).map(function (e, i) {
      return '<div class="arc-lb-row' + (e.name === hl ? ' me' : '') + '"><span>' +
        (medals[i] || (i + 1) + '.') + ' ' + arcadeEsc(e.name) + '</span><b>' +
        (+e.score).toLocaleString() + '</b></div>';
    }).join('');
  }
  function arcadeEnsureName(box, cb) {
    var name = '';
    try { name = (localStorage.getItem('arcade_name') || '').trim(); } catch (e) {}
    if (name) { cb(name); return; }
    box.innerHTML = '<div class="arc-lb-form"><input id="arc-lb-name" maxlength="12" placeholder="YOUR NAME" autocomplete="off">' +
      '<button id="arc-lb-go" class="mbtn">SAVE</button></div>';
    $('arc-lb-go').onclick = function () {
      var v = $('arc-lb-name').value.trim().slice(0, 12);
      if (!v) return;
      try { localStorage.setItem('arcade_name', v); } catch (e) {}
      cb(v);
    };
  }
  function arcadeLevelComplete(game, board, levelN, score, isDaily) {
    var box = $('arc-lb');
    if (!box || !(score > 0)) return;
    box.innerHTML = '<div class="arc-lb-empty">🏆 loading scores…</div>';
    arcadeEnsureName(box, function (name) {
      box.innerHTML = '<div class="arc-lb-empty">🏆 sending…</div>';
      arcadeFetch('/score', { game: game, board: board, name: name, score: score }, function (err, res) {
        function done(top, rank) {
          var r = rank > 0 ? '<div class="arc-lb-rank">GLOBAL #' + rank + '!</div>' : '';
          var title = isDaily ? '📅 TODAY’S BEST' : '🏆 LEVEL ' + levelN + ' BEST';
          box.innerHTML = r + '<div class="arc-lb-title">' + title + '</div>' + arcadeBoardHtml(top, name);
        }
        if (res && res.top) done(res.top, res.rank);
        else arcadeFetch('/scores?game=' + game + '&board=' + board, null, function (e2, d2) {
          done(d2 && d2.top ? d2.top : null, 0);
        });
      });
    });
  }

  /* ================= Title screen ================= */
  function renderTitle() {
    var stella = $('title-stella');
    stella.src = Art.stellaImg('idle');
    stella.alt = 'Stella the witch';
    var saved = getStars(), total = 0;
    Object.keys(saved).forEach(function (k) { total += saved[k]; });
    $('title-stars').textContent = total;
    $('title-streak').textContent = streakRec().streak;
    // floating bubbles drift behind the logo
    var box = $('title-bubbles');
    box.innerHTML = '';
    var cols = ['R', 'B', 'G', 'Y', 'P'];
    for (var i = 0; i < 8; i++) {
      var img = document.createElement('img');
      img.src = Art.bubbleImg(cols[i % cols.length]);
      img.alt = '';
      var sz = 28 + (i * 37) % 44;
      img.style.width = sz + 'px'; img.style.height = sz + 'px';
      img.style.left = (4 + (i * 41) % 84) + '%';
      img.style.top = (3 + (i * 29) % 26) + '%';
      img.style.animationDelay = (i * 0.55) + 's';
      box.appendChild(img);
    }
  }

  $('title-play').onclick = function () {
    HexAudio.click();
    HexAudio.music(true); // AudioContext must start on a user gesture
    showScreen('map');
    renderMap();
  };
  $('title-gear').onclick = function () {
    HexAudio.click();
    showModal('⚙️ Settings', settingsHtml(),
      [{ t: 'Done', cls: 'primary', fn: hideModal }]);
    wireSettings($('modal-card'));
  };

  /* Debug hook: ?hexdebug=1 exposes a tiny API for scripted screenshots.
   * Never shown in production UI. */
  if (location.search.indexOf('hexdebug=1') >= 0) {
    window.HexUI = {
      showScreen: showScreen, renderMap: renderMap, showIntro: showIntro,
      loadLevel: loadLevel, win: win, lose: lose,
      fireAt: function (ang) { if (state) { state.aimAngle = ang; state.aiming = true; fire(); } },
      get state() { return state; },
      showCoach: showCoach, hideCoach: hideCoach
    };
  }

  /* ================= Boot ================= */
  Art.warm();
  resize();
  renderTitle();
  renderMap();
  showScreen('title');
  requestAnimationFrame(tick);
})();
