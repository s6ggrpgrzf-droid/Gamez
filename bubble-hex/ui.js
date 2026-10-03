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
        amp: 12 + Math.random() * 22
      });
    }
    mists = [];
    for (var j = 0; j < 3; j++) {
      mists.push({ x: Math.random() * W, y: H * (0.35 + j * 0.2), sp: 6 + j * 5, w: W * 0.7, a: 0.05 + j * 0.02 });
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
      owlsFlying: [], blastArmed: false
    };
    state.current = newShooterBubble();
    state.next = newShooterBubble();
    state.orbEl = $('orb-fill');
    view = 'game';
    updateHUD();
    showScreen('game');
    HexAudio.music(true);
    if (state.wilbur) {
      // Wilbur gloats on arrival; the taunt arrives async and never blocks play
      setTimeout(function () { if (state && state.wilbur && !state.over) wilburTaunt(idx, 100); }, 1200);
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

  function drawBoardBubble(x, y, bub, scale, alpha) {
    scale = scale || 1; alpha = alpha == null ? 1 : alpha;
    var r = R * scale, d = r * 2;
    ctx.globalAlpha = alpha;
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
        ctx.globalAlpha = alpha;
      }
    }
    ctx.globalAlpha = 1;
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
    $('orb-wrap').classList.remove('full');
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
      popFx(cc[2], cc[3], bub, true);
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
          dropFx(xy2[0], xy2[1] + BOARD_TOP, bb2);
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
      popFx(xy[0], xy[1] + BOARD_TOP, { color: rc[2] || 'Y' }, res.popped.length >= 6);
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
      state.score += total;
      state.orb = Math.min(state.orbMax, state.orb + res.popped.length);
      if (state.orb >= state.orbMax) {
        $('orb-wrap').classList.add('full');
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
      state.shake = { t: 0, dur: 0.3, mag: 8 };
    }
    for (i = 0; i < res.dropped.length; i++) {
      rc = res.dropped[i];
      xy = E.cellXY(rc[0], rc[1], R);
      dropFx(xy[0], xy[1] + BOARD_TOP, { color: rc[2] || 'B' });
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

  var lastT = 0;
  function tick(t) {
    requestAnimationFrame(tick);
    if (view !== 'game' || !state) return;
    var dt = Math.min((t - lastT) / 1000 || 0.016, 0.1);
    lastT = t;
    update(dt, t / 1000);
    render(t / 1000);
  }

  function update(dt, now) {
    var s = state;
    s.stellaBob += dt * 2;
    s.aimPulse += dt * 3;
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
        wb.x = W / 2 + Math.sin(now * 1.3) * 14;
        wb.y = 6 + Math.sin(now * 2.1) * 4 + boardDY();
      }
      if (wb.hitT > 0) wb.hitT -= dt;
    }
    // orb glow pulse on Stella handled in render
  }

  function render(now) {
    var s = state;
    ctx.save();
    if (s.shake) {
      var st = s.shake.t / s.shake.dur;
      var mag = s.shake.mag * (1 - st);
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }
    ctx.clearRect(-30, -30, W + 60, H + 60);

    // background layers
    var bgs = Art.background(W, H);
    ctx.drawImage(bgs[0], 0, 0, W, H);
    ctx.drawImage(bgs[1], 0, 0, W, H);
    drawMist(now);
    ctx.drawImage(bgs[2], 0, 0, W, H);
    drawFireflies(now);

    var dy = boardDY();

    // branch ceiling
    var br = Art.branch(W);
    ctx.drawImage(br, 0, BOARD_TOP - 52 + dy, W, 64);

    // Wilbur perched above branch
    if (s.wilbur && !s.wilbur.fleeGone) {
      var wb = s.wilbur;
      var ws = 96;
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

    // board bubbles
    var keys = Object.keys(s.board);
    for (var i = 0; i < keys.length; i++) {
      var p = keys[i].split(','), xy = E.cellXY(+p[0], +p[1], R);
      drawBoardBubble(xy[0], xy[1] + BOARD_TOP + dy, s.board[keys[i]]);
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
    drawNero(now);

    // next-bubble preview
    if (s.next && !s.over) {
      var nxx = W / 2 - R * 3.6, nyy = SHOOT_Y + 26;
      ctx.globalAlpha = 0.85;
      var nd = R * 1.1;
      ctx.drawImage(Art.bubble(bubbleKey(s.next)), nxx - nd / 2, nyy - nd / 2, nd, nd);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.font = '600 10px ui-rounded, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NEXT', nxx, nyy + R * 1.15);
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

    // particles (additive-ish)
    var dot = Art.dot();
    for (var pi = 0; pi < particles.length; pi++) {
      var pt = particles[pi];
      if (!pt.on) continue;
      var lt = pt.age / pt.life;
      ctx.globalAlpha = 1 - lt;
      ctx.fillStyle = pt.color;
      var psz = pt.size * (1 - lt * 0.5);
      ctx.drawImage(dot, pt.x - psz, pt.y - psz, psz * 2, psz * 2);
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
        ctx.globalAlpha = 1 - ft * ft;
        ctx.font = '800 ' + (fl.big ? 22 : 16) + 'px ui-rounded, system-ui, sans-serif';
        ctx.fillStyle = fl.big ? '#ffe14d' : '#fff';
        ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 6;
        ctx.fillText(fl.text, fl.x, fl.y - ft * 44);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
    }

    // cinematic vignette during Hex Blast
    if (s.castT > 0) {
      ctx.fillStyle = 'rgba(10,4,24,' + (0.45 * Math.min(1, s.castT)) + ')';
      ctx.fillRect(-30, -30, W + 60, H + 60);
      if (s.castBeam) drawBeam(s.castBeam, now); // beam above vignette
    }

    ctx.restore();
  }

  function drawMist(now) {
    for (var i = 0; i < mists.length; i++) {
      var m = mists[i];
      var mx = ((m.x + now * m.sp) % (W + m.w)) - m.w / 2;
      var g = ctx.createRadialGradient(mx, m.y, 10, mx, m.y, m.w / 2);
      g.addColorStop(0, 'rgba(150,130,220,' + m.a + ')');
      g.addColorStop(1, 'rgba(150,130,220,0)');
      ctx.fillStyle = g;
      ctx.fillRect(mx - m.w / 2, m.y - 60, m.w, 120);
    }
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

  function drawStella(now) {
    var s = state;
    var pose = s.stellaPose;
    var img = Art.stella(pose);
    var dw = STELLA_W, dh = STELLA_W * 132 / 120;
    var a = stellaAnchor();
    var bob = Math.sin(s.stellaBob) * 3;
    // orb-full aura
    if (s.orb >= s.orbMax) {
      var pulse = 0.5 + 0.5 * Math.sin(now * 5);
      var g = ctx.createRadialGradient(a[0], a[1] - 70, 8, a[0], a[1] - 70, 90);
      g.addColorStop(0, 'rgba(255,225,77,' + (0.28 + pulse * 0.14) + ')');
      g.addColorStop(1, 'rgba(255,225,77,0)');
      ctx.fillStyle = g;
      ctx.fillRect(a[0] - 90, a[1] - 160, 180, 180);
    }
    ctx.drawImage(img, a[0] - dw / 2, a[1] - dh + bob, dw, dh);
    // idle wand sparkles
    if (Math.random() < 0.06) {
      var wt = wandTip();
      spawnP(wt[0], wt[1], (Math.random() - 0.5) * 40, -30 - Math.random() * 30, 0.6, 4, '#ffe14d', 0);
    }
  }

  function drawNero(now) {
    var s = state;
    var nx = W / 2 + R * 3.4, ny = SHOOT_Y + 34;
    var img = Art.nero(s.neroEat > 0);
    var dw = 62, dh = 62 * 70 / 76;
    var bob = Math.sin(now * 2.2 + 2) * 2;
    ctx.drawImage(img, nx - dw / 2, ny - dh + bob, dw, dh);
    // discard counter
    if (s.nero > 0) {
      ctx.fillStyle = '#0e0818';
      ctx.font = '800 13px ui-rounded, system-ui, sans-serif';
      ctx.textAlign = 'center';
      var label = s.nero + '/4';
      var tw = ctx.measureText(label).width + 14;
      ctx.fillStyle = 'rgba(14,8,24,.78)';
      roundRect(nx - tw / 2, ny + 8, tw, 20, 10); ctx.fill();
      ctx.fillStyle = '#ffd34d';
      ctx.fillText(label, nx, ny + 22);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.4)';
      ctx.font = '600 10px ui-rounded, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAP NERO', nx, ny + 20);
    }
    s.neroXY = [nx, ny - 20];
  }

  function drawAimGuide(now) {
    var s = state;
    var o = wandTip();
    var vx = Math.cos(s.aimAngle), vy = Math.sin(s.aimAngle);
    var x = o[0], y = o[1];
    var dot = Art.dot();
    var stepLen = 15, drawn = 0;
    ctx.globalAlpha = 0.85;
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
      var ds = 5 + Math.sin(now * 8 - drawn * 0.55) * 1.4;
      ctx.drawImage(dot, x - ds, y - ds, ds * 2, ds * 2);
      drawn++;
    }
    ctx.globalAlpha = 1;
    // landing ring
    var pulse = 1 + Math.sin(now * 6) * 0.12;
    var rs = R * 1.15 * pulse;
    var ring = Art.ring();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(ring, x - rs, y - rs, rs * 2, rs * 2);
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
    $('score-num').textContent = s.score.toLocaleString();
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
    // orb
    s.orbEl.style.width = (s.orb / s.orbMax * 100) + '%';
    $('orb-wrap').classList.toggle('full', s.orb >= s.orbMax);
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
    // BWS2-style Bubble Rain: leftover shots shower down as bonus points
    var rainBonus = s.shots * 50;
    s.score += rainBonus;
    if (rainBonus > 0) {
      banner('🌧 <b>Bubble Rain!</b> +' + rainBonus.toLocaleString());
      var n = Math.min(s.shots, 24);
      for (var i = 0; i < n; i++) {
        (function (k) {
          setTimeout(function () {
            if (state !== s) return;
            var rx = Math.random() * W;
            for (var j = 0; j < 4; j++) {
              spawnP(rx, -10, (Math.random() - 0.5) * 40, 200 + Math.random() * 120, 1.1, 5, '#ffe14d', 60);
            }
            HexAudio.tick();
          }, k * 55);
        })(i);
      }
    }
    updateHUD();
    setTimeout(function () { if (state === s && view === 'game') showWinModal(); }, rainBonus > 0 ? 1450 : 250);
  }

  function showWinModal() {
    var s = state;
    var st = starsEarned();
    if (!s.daily) saveStars(s.idx, st);
    var isDaily = !!s.daily;
    var title = isDaily ? '📅 Daily Hex Complete!' : 'Level Complete!';
    showModal(title,
      '<div class="win-stars" id="win-stars">☆☆☆</div>' +
      '<div class="win-score">Score: <b id="win-score">0</b></div>' +
      (isDaily ? '<div class="win-sub">Come back tomorrow for a new board</div>' : '') +
      '<div id="arc-lb" class="arc-lb"></div>',
      [{ t: s.daily ? 'Replay Daily' : (s.idx + 1 < LEVELS.length ? 'Next Level →' : 'Map'), fn: function () { hideModal(); if (s.daily) playDaily(); else if (s.idx + 1 < LEVELS.length) showIntro(s.idx + 1); else { showScreen('map'); renderMap(); } } },
       { t: 'Replay', fn: function () { hideModal(); if (s.daily) playDaily(); else showIntro(s.idx); } },
       { t: 'Map', fn: function () { hideModal(); showScreen('map'); renderMap(); } }]);
    // animated stars + count-up
    var si = 0;
    var starTimer = setInterval(function () {
      si++;
      var el = $('win-stars');
      if (el) el.textContent = '★'.repeat(Math.min(si, st)) + '☆'.repeat(3 - Math.min(si, st));
      if (si >= 3) clearInterval(starTimer);
    }, 350);
    var shown = 0, target = s.score;
    var cntTimer = setInterval(function () {
      shown += Math.max(1, Math.ceil((target - shown) / 8));
      if (shown >= target) { shown = target; clearInterval(cntTimer); }
      var el2 = $('win-score');
      if (el2) el2.textContent = shown.toLocaleString();
      else clearInterval(cntTimer);
    }, 40);
    var board = isDaily ? 'daily-' + dailyDateStr() : 'level-' + (s.idx + 1);
    arcadeLevelComplete('bubble-hex', board, isDaily ? 0 : s.idx + 1, s.score, isDaily);
  }

  function lose(reason) {
    var s = state;
    if (!s || s.over) return;
    s.over = true;
    HexAudio.lose();
    showModal('So close!', (reason || 'Try a different approach.') +
      '<div id="arc-lb" class="arc-lb"></div>',
      [{ t: 'Retry', fn: function () { hideModal(); if (s.daily) playDaily(); else showIntro(s.idx); } },
       { t: 'Map', fn: function () { hideModal(); showScreen('map'); renderMap(); } }]);
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

  function renderMap() {
    var saved = getStars();
    var total = 0;
    Object.keys(saved).forEach(function (k) { total += saved[k]; });
    $('total-stars').textContent = total;
    var path = $('map-path');
    path.innerHTML = '';
    // Daily Hex card
    var dc = document.createElement('div');
    dc.className = 'daily-card';
    dc.innerHTML = '<div class="dc-cal">📅</div><div class="dc-body"><b>Daily Hex</b>' +
      '<span id="daily-sub">a fresh board every day…</span></div>' +
      '<div class="dc-best" id="daily-best"></div>';
    dc.onclick = function () { HexAudio.click(); playDaily(); };
    path.appendChild(dc);
    fetchDaily();
    // level nodes
    LEVELS.forEach(function (L, i) {
      var unlocked = i === 0 || saved[i - 1];
      var n = document.createElement('div');
      n.className = 'level-node' + (unlocked ? '' : ' locked');
      var typeIcon = { clear: '✨', rescue: '🦉', ghost: '👻', boss: '🐈‍⬛' }[L.type] || '✨';
      n.innerHTML = '<span class="ln-num">' + (i + 1) + '</span>' +
        '<span class="ln-stars">' + (saved[i] ? '★'.repeat(saved[i]) + '☆'.repeat(3 - saved[i]) : (unlocked ? '☆☆☆' : '🔒')) + '</span>' +
        '<span class="ln-name">' + typeIcon + ' ' + L.name + '</span>';
      if (unlocked) n.onclick = function () { HexAudio.click(); showIntro(i); };
      path.appendChild(n);
    });
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
    view = which === 'game' ? 'game' : 'map';
    $('screen-map').classList.toggle('hidden', which !== 'map');
    $('screen-game').classList.toggle('hidden', which !== 'game');
    if (which === 'game') { resize(); }
    if (which === 'map') HexAudio.music(false);
  }
  function showModal(title, html, buttons) {
    var m = $('modal'), card = $('modal-card');
    card.innerHTML = '<h2>' + title + '</h2><div class="modal-body">' + html + '</div><div class="modal-btns"></div>';
    var btns = card.querySelector('.modal-btns');
    buttons.forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'mbtn'; btn.textContent = b.t; btn.onclick = b.fn;
      btns.appendChild(btn);
    });
    m.classList.remove('hidden');
  }
  function hideModal() { $('modal').classList.add('hidden'); }

  $('btn-quit').onclick = function () { HexAudio.click(); showScreen('map'); renderMap(); };
  $('btn-pause').onclick = function () {
    if (!state || state.over || view !== 'game') return;
    HexAudio.click();
    showModal('Paused', 'Take a breath, witch.',
      [{ t: 'Resume', fn: hideModal },
       { t: 'Restart', fn: function () { hideModal(); showIntro(state.idx, state.daily); } },
       { t: 'Map', fn: function () { hideModal(); showScreen('map'); renderMap(); } }]);
  };
  $('btn-music').onclick = function () {
    var on = HexAudio.musicToggle();
    $('btn-music').textContent = on ? '🎵' : '🔇';
    $('btn-music').classList.toggle('off', !on);
  };
  $('orb-wrap').onclick = function () {
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

  /* ================= Boot ================= */
  Art.warm();
  resize();
  renderMap();
  showScreen('map');
  requestAnimationFrame(tick);
})();
