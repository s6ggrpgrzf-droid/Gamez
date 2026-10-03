/* Bubble Hex UI — canvas rendering, input, animations */
(function () {
  'use strict';
  var E = window.HexEngine;
  if (!E) { console.error('HexEngine not loaded'); return; }
  var LEVELS = window.HEX_LEVELS || [];

  var COLORS = { R: '#ff4d6d', B: '#4da6ff', G: '#4dff88', Y: '#ffe14d', P: '#c44dff', W: '#ffffff' };
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var R = 18; // bubble radius
  var W = 0, H = 0;

  var state = null; // current game state

  function resize() {
    var wrap = canvas.parentElement;
    W = Math.min(wrap.clientWidth || 400, 500);
    H = Math.min(window.innerHeight * 0.62, 620);
    canvas.width = W * devicePixelRatio;
    canvas.height = H * devicePixelRatio;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    R = Math.max(14, Math.min(20, W / (E.COLS * 2.2)));
  }
  window.addEventListener('resize', resize);

  /* ---------- Level setup ---------- */
  function loadLevel(idx) {
    var L = LEVELS[idx];
    resize();
    var board = E.newBoard();
    var colors = E.COLORS.slice(0, L.colors);
    L.layout.forEach(function (row, r) {
      for (var c = 0; c < row.length && c < E.COLS; c++) {
        var ch = row[c];
        if (ch === '.' || ch === ' ') continue;
        var bub = null;
        if (ch === '#') bub = { color: 'X', blocker: true };
        else if (ch === 'F') bub = { color: colors[(Math.random() * colors.length) | 0], familiar: true };
        else if (ch === 'W') bub = { color: 'W' };
        else if (ch === 'X') bub = { color: colors[(Math.random() * colors.length) | 0], special: 'bomb' };
        else if (E.COLORS.indexOf(ch) >= 0) bub = { color: ch };
        else bub = { color: colors[(Math.random() * colors.length) | 0] };
        E.set(board, r, c, bub);
      }
    });
    state = {
      idx: idx, level: L, board: board, colors: colors,
      shots: L.shots, score: 0, orb: 0, orbMax: 12,
      current: null, next: null, flying: null,
      ghost: L.ghostStart ? { r: L.ghostStart[0], c: L.ghostStart[1] } : null,
      rescued: 0, shieldLeft: L.shield || 0,
      aiming: false, aimAngle: -Math.PI / 2,
      anims: [], over: false, missStreak: 0,
      nero: 0 // bubbles tossed to Nero; every 4 = rainbow power-up
    };
    state.current = newShooterBubble();
    state.next = newShooterBubble();
    updateHUD();
    showScreen('game');
  }

  function newShooterBubble() {
    var colors = E.boardColors(state ? state.board : {});
    // Balanced queue: avoid 3+ same color in a row (BW3-style)
    var last = state ? state.lastColors || [] : [];
    var avail = colors.filter(function (c) {
      if (last.length >= 2 && last[last.length - 1] === c && last[last.length - 2] === c) return false;
      return true;
    });
    if (!avail.length) avail = colors;
    var pick = avail[(Math.random() * avail.length) | 0];
    if (state) { state.lastColors = (state.lastColors || []).concat([pick]).slice(-3); }
    // 6% rainbow, 4% bomb
    var roll = Math.random();
    if (roll < 0.06) return { color: 'W' };
    if (roll < 0.10) return { color: pick, special: 'bomb' };
    return { color: pick };
  }

  /* ---------- Rendering ---------- */
  function drawBubble(x, y, bub, scale, alpha) {
    scale = scale || 1; alpha = alpha == null ? 1 : alpha;
    var r = R * scale;
    ctx.globalAlpha = alpha;
    if (bub.blocker) {
      ctx.fillStyle = '#3a3a4a';
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.strokeStyle = '#5a5a6a'; ctx.lineWidth = 2; ctx.stroke();
    } else {
      var col = COLORS[bub.color] || '#fff';
      var g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.25, col);
      g.addColorStop(1, shade(col, -30));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      if (bub.color === 'W') { // rainbow
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r - 2, 0, 7); ctx.stroke();
      }
      if (bub.special === 'bomb') {
        ctx.fillStyle = '#fff'; ctx.font = 'bold ' + (r * 0.9) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('✸', x, y + 1);
      }
      if (bub.familiar) {
        ctx.fillStyle = '#fff'; ctx.font = (r * 0.85) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🦉', x, y + 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawAimPreview(sx, sy) {
    var boardTop = 10;
    var x = sx, y = sy;
    var vx = Math.cos(state.aimAngle), vy = Math.sin(state.aimAngle);
    // BW3-style: aiming line extends all the way to the top
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, y);
    var bounces = 0;
    for (var i = 0; i < 200; i++) {
      x += vx * 12; y += vy * 12;
      if (x < R) { x = R; vx = -vx; bounces++; }
      if (x > W - R) { x = W - R; vx = -vx; bounces++; }
      if (y <= R + boardTop + 4) break;
      var hitBub = false;
      Object.keys(state.board).forEach(function (k) {
        if (hitBub) return;
        var p = k.split(','), xy = E.cellXY(+p[0], +p[1], R);
        var dx = x - xy[0], dy = y - (xy[1] + boardTop);
        if (dx * dx + dy * dy < (R * 1.8) * (R * 1.8)) hitBub = true;
      });
      if (hitBub || bounces > 3) break;
    }
    ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
  }

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.max(0, Math.min(255, (n >> 16) + amt));
    var g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    var b = Math.max(0, Math.min(255, (n & 255) + amt));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  function render() {
    if (!state) return;
    ctx.save();
    // screen shake
    if (state.shake && Date.now() - state.shake.t0 < state.shake.dur) {
      var st = (Date.now() - state.shake.t0) / state.shake.dur;
      var mag = state.shake.mag * (1 - st);
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }
    ctx.clearRect(-20, -20, W + 40, H + 40);
    var boardTop = 10;

    // Draw board bubbles
    Object.keys(state.board).forEach(function (k) {
      var p = k.split(','), r = +p[0], c = +p[1];
      var xy = E.cellXY(r, c, R);
      // ghost
      if (state.ghost && state.ghost.r === r && state.ghost.c === c) {
        ctx.font = (R * 1.4) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('👻', xy[0], xy[1] + boardTop);
      }
      drawBubble(xy[0], xy[1] + boardTop, state.board[k]);
    });

    // Draw flying bubble
    if (state.flying) {
      var f = state.flying;
      drawBubble(f.x, f.y + boardTop, f.bub);
    }

    // Shooter
    var sx = W / 2, sy = H - 40;
    // aim line with bounce preview
    if (state.aiming && !state.flying && !state.over) {
      drawAimPreview(sx, sy);
    }
    // next bubble preview
    if (state.next) drawBubble(sx - R * 2.6, sy + 6, state.next, 0.6, 0.8);
    // current bubble
    if (state.current && !state.flying) drawBubble(sx, sy, state.current);
    // Nero the cat (discard) — tap to toss current bubble
    var nx = sx + R * 2.8, ny = sy + 4;
    ctx.font = (R * 1.6) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🎩', nx, ny - 6);
    ctx.font = (R * 1.1) + 'px sans-serif';
    ctx.fillText('🐱', nx, ny + 8);
    if (state.nero > 0) {
      ctx.fillStyle = '#ffd34d'; ctx.font = 'bold 12px sans-serif';
      ctx.fillText(state.nero + '/4', nx, ny + R + 8);
    }
    state.neroPos = [nx, ny];
    // shooter base
    ctx.fillStyle = '#2a1a4a';
    ctx.beginPath(); ctx.arc(sx, sy + R + 6, R * 1.3, Math.PI, 0); ctx.fill();

    // Animations
    state.anims = state.anims.filter(function (a) {
      var t = (Date.now() - a.t0) / a.dur;
      if (t >= 1) return false;
      if (a.type === 'pop') {
        drawBubble(a.x, a.y + boardTop, a.bub, 1 + t * 0.6, 1 - t);
        // pop particles
        if (!a.spawned) {
          a.spawned = true;
          for (var i = 0; i < 8; i++) {
            var ang = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 120;
            state.anims.push({ type: 'particle', x: a.x, y: a.y,
              vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
              color: a.color || '#ffe14d', t0: Date.now(), dur: 400 + Math.random() * 300 });
          }
        }
      } else if (a.type === 'particle') {
        var px = a.x + a.vx * t, py = a.y + a.vy * t - 40 * t * t;
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = a.color;
        ctx.beginPath(); ctx.arc(px, py + boardTop, 3 * (1 - t) + 1, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (a.type === 'floater') {
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = '#ffd34d'; ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(a.text, a.x, a.y + boardTop - t * 40);
        ctx.globalAlpha = 1;
      } else if (a.type === 'drop') {
        drawBubble(a.x, a.y + boardTop + t * 120, a.bub, 1, 1 - t);
      } else if (a.type === 'blast') {
        ctx.strokeStyle = 'rgba(255,220,100,' + (1 - t) + ')';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(a.x, a.y + boardTop, t * R * 5, 0, 7); ctx.stroke();
      }
      return true;
    });

    ctx.restore();
    if (!state.over) requestAnimationFrame(render);
  }

  /* ---------- Input ---------- */
  var shooterX = 0, shooterY = 0;
  function canvasPos(e) {
    var rect = canvas.getBoundingClientRect();
    var t = e.touches ? e.touches[0] : e;
    return [t.clientX - rect.left, t.clientY - rect.top];
  }
  canvas.addEventListener('pointerdown', function (e) {
    if (!state || state.over || state.flying) return;
    var p = canvasPos(e);
    // Nero tap: discard current bubble
    if (state.neroPos) {
      var dx = p[0] - state.neroPos[0], dy = p[1] - state.neroPos[1];
      if (dx * dx + dy * dy < (R * 1.8) * (R * 1.8)) {
        state.nero++;
        HexAudio.click();
        if (state.nero >= 4) {
          state.nero = 0;
          state.current = { color: 'W' }; // rainbow power-up!
          banner('🎩 Nero grants a rainbow bubble!');
          HexAudio.orb();
        } else {
          state.current = state.next;
          state.next = newShooterBubble();
        }
        return;
      }
    }
    shooterX = W / 2; shooterY = H - 40;
    state.aiming = true;
    updateAim(p);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!state || !state.aiming) return;
    updateAim(canvasPos(e));
  });
  canvas.addEventListener('pointerup', function (e) {
    if (!state || !state.aiming) return;
    state.aiming = false;
    fire();
  });
  function updateAim(p) {
    var dx = p[0] - shooterX, dy = p[1] - shooterY;
    if (dy > -10) dy = -10; // only upward
    state.aimAngle = Math.atan2(dy, dx);
    // clamp to reasonable cone
    var min = -Math.PI + 0.25, max = -0.25;
    if (state.aimAngle < min) state.aimAngle = min;
    if (state.aimAngle > max) state.aimAngle = max;
  }

  /* ---------- Firing ---------- */
  function fire() {
    if (!state || state.flying || state.over) return;
    var bub = state.current;
    // Spell orb: if full, this shot is a mega blast
    var isBlast = state.orb >= state.orbMax;
    if (isBlast) { state.orb = 0; HexAudio.orb(); }
    else HexAudio.shoot();
    state.flying = {
      x: W / 2, y: H - 40,
      vx: Math.cos(state.aimAngle) * 9, vy: Math.sin(state.aimAngle) * 9,
      bub: bub, blast: isBlast
    };
    state.current = state.next;
    state.next = newShooterBubble();
    state.shots--;
    updateHUD();
    requestAnimationFrame(stepFlight);
  }

  function stepFlight() {
    var f = state.flying;
    if (!f) return;
    f.x += f.vx; f.y += f.vy;
    // wall bounce
    if (f.x < R) { f.x = R; f.vx = -f.vx; }
    if (f.x > W - R) { f.x = W - R; f.vx = -f.vx; }
    // top hit
    if (f.y <= R + 10) { landBubble(f, 0); return; }
    // bubble collision
    var boardTop = 10;
    var hit = null;
    Object.keys(state.board).forEach(function (k) {
      if (hit) return;
      var p = k.split(','), xy = E.cellXY(+p[0], +p[1], R);
      var dx = f.x - xy[0], dy = f.y - (xy[1] + boardTop);
      if (dx * dx + dy * dy < (R * 1.9) * (R * 1.9)) hit = [+p[0], +p[1]];
    });
    if (hit) {
      var cell = E.nearestEmptyCell(state.board, f.x, f.y - boardTop, R);
      if (cell && E.isAttachable(state.board, cell[0], cell[1])) landBubble(f, null, cell);
      else { // fallback: place at hit neighbor
        var ns = E.neighbors(hit[0], hit[1]);
        for (var i = 0; i < ns.length; i++) {
          if (!E.get(state.board, ns[i][0], ns[i][1])) { landBubble(f, null, ns[i]); return; }
        }
        landBubble(f, null, [hit[0] + 1, hit[1]]);
      }
      return;
    }
    // bottom = miss (shouldn't happen, but safety)
    if (f.y > H) { state.flying = null; endTurn(false); return; }
    requestAnimationFrame(stepFlight);
  }

  function landBubble(f, topRow, cell) {
    var r, c;
    if (topRow !== null && topRow !== undefined) { r = 0; c = Math.max(0, Math.min(E.COLS - 1, Math.round((f.x - R) / (2 * R)))); }
    else { r = cell[0]; c = cell[1]; }
    // Blast: clear radius 3, no snapping needed beyond placement
    if (f.blast) {
      var xy = E.cellXY(r, c, R);
      state.anims.push({ type: 'blast', x: xy[0], y: xy[1], t0: Date.now(), dur: 400 });
      HexAudio.blast();
      E.set(state.board, r, c, f.bub);
      var res = E.resolveBoard(state.board, r, c);
      // Blast clears extra radius manually
      var extra = [];
      Object.keys(state.board).forEach(function (k) {
        var p = k.split(','), bxy = E.cellXY(+p[0], +p[1], R);
        var dx = bxy[0] - xy[0], dy = bxy[1] - xy[1];
        if (dx * dx + dy * dy < (R * 3.2) * (R * 3.2)) extra.push([+p[0], +p[1]]);
      });
      extra.forEach(function (rc) {
        if (!res.popped.some(function (pp) { return pp[0] === rc[0] && pp[1] === rc[1]; })) {
          res.popped.push(rc); E.del(state.board, rc[0], rc[1]); res.score += 100;
        }
      });
      applyResolve(res, xy[0], xy[1]);
    } else {
      E.set(state.board, r, c, f.bub);
      HexAudio.stick();
      var res2 = E.resolveBoard(state.board, r, c);
      var xy2 = E.cellXY(r, c, R);
      applyResolve(res2, xy2[0], xy2[1]);
    }
    state.flying = null;
  }

  function applyResolve(res, x, y) {
    var boardTop = 10;
    var popColor = '#ffe14d';
    res.popped.forEach(function (rc) {
      var xy = E.cellXY(rc[0], rc[1], R);
      state.anims.push({ type: 'pop', x: xy[0], y: xy[1], bub: { color: 'Y' }, color: popColor, t0: Date.now(), dur: 300 });
    });
    // score floater
    if (res.score > 0) {
      state.anims.push({ type: 'floater', x: x, y: y, text: '+' + res.score, t0: Date.now(), dur: 900 });
    }
    // screen shake on big pops
    if (res.popped.length >= 6) {
      state.shake = { t0: Date.now(), dur: 300, mag: 8 };
    }
    res.dropped.forEach(function (rc) {
      var xy = E.cellXY(rc[0], rc[1], R);
      state.anims.push({ type: 'drop', x: xy[0], y: xy[1], bub: { color: 'B' }, t0: Date.now(), dur: 500 });
    });
    if (res.popped.length) {
      HexAudio.pop(res.popped.length);
      state.score += res.score;
      state.orb = Math.min(state.orbMax, state.orb + res.popped.length);
      if (state.orb >= state.orbMax) { document.getElementById('orb-wrap').classList.add('full'); }
      state.missStreak = 0;
    } else {
      state.missStreak++;
      // BW3-style: ceiling descends every 5 shots without a pop
      if (state.missStreak >= 5) {
        state.missStreak = 0;
        descendBoard();
        if (!state.over) banner('⚠️ The ceiling descends!');
      }
    }
    if (res.dropped.length) HexAudio.drop();
    // Ghost movement: ghost rises when bubbles above it are cleared
    updateGhost();
    updateHUD();
    endTurn(true);
  }

  function descendBoard() {
    var nb = E.newBoard();
    var gameOver = false;
    Object.keys(state.board).forEach(function (k) {
      var p = k.split(','), r = +p[0] + 1, c = +p[1];
      if (r >= E.ROWS - 2) gameOver = true;
      if (r < E.ROWS) E.set(nb, r, c, state.board[k]);
    });
    state.board = nb;
    if (state.ghost) state.ghost.r = Math.min(state.ghost.r + 1, E.ROWS - 1);
    if (gameOver) { lose(); }
  }

  function updateGhost() {
    if (!state.ghost) return;
    // Ghost floats up through empty cells
    var g = state.ghost;
    while (g.r > 0 && !E.get(state.board, g.r - 1, g.c)) g.r--;
    if (g.r === 0) {
      // Ghost reached top!
      state.ghost = null;
      state.score += 1000;
      banner('👻 Ghost freed! +1000');
    }
  }

  function endTurn(wasShot) {
    if (state.over) return;
    var L = state.level;
    // BW3: you win when ALL bubbles are popped, regardless of level type
    var remaining = Object.keys(state.board).filter(function (k) {
      return !state.board[k].blocker;
    }).length;
    if (remaining === 0) return win();
    if (state.shots <= 0) return lose();
    if (!state.flying) render();
  }

  function updateHUD() {
    document.getElementById('shots').textContent = state.shots;
    var goal = '';
    var L = state.level;
    if (L.type === 'clear') goal = 'Clear all bubbles';
    else if (L.type === 'rescue') {
      var left = 0;
      Object.keys(state.board).forEach(function (k) { if (state.board[k].familiar) left++; });
      goal = '🦉 Rescue: ' + left + ' left';
    }
    else if (L.type === 'ghost') goal = state.ghost ? '👻 Guide ghost up!' : '👻 Freed!';
    else if (L.type === 'boss') goal = '💀 Beat Wilbur!';
    document.getElementById('hud-goal').textContent = goal;
    document.getElementById('orb-fill').style.width = (state.orb / state.orbMax * 100) + '%';
  }

  function banner(txt) {
    var b = document.getElementById('banner');
    b.textContent = txt; b.classList.remove('hidden');
    setTimeout(function () { b.classList.add('hidden'); }, 1800);
  }

  function stars() {
    // simple: 3 stars if shots remaining > 40%, 2 if > 15%, else 1
    var pct = state.shots / state.level.shots;
    return pct > 0.4 ? 3 : pct > 0.15 ? 2 : 1;
  }

  function win() {
    state.over = true;
    HexAudio.win();
    var s = stars();
    saveStars(state.idx, s);
    showModal('Level Complete!', '★'.repeat(s) + '☆'.repeat(3 - s) + '<br>Score: ' + state.score,
      [{ t: state.idx + 1 < LEVELS.length ? 'Next Level →' : 'Map', fn: function () { hideModal(); if (state.idx + 1 < LEVELS.length) loadLevel(state.idx + 1); else showScreen('map'); renderMap(); } },
       { t: 'Replay', fn: function () { hideModal(); loadLevel(state.idx); } },
       { t: 'Map', fn: function () { hideModal(); showScreen('map'); renderMap(); } }]);
  }
  function lose() {
    state.over = true;
    HexAudio.lose();
    showModal('Out of shots!', 'Try a different approach.',
      [{ t: 'Retry', fn: function () { hideModal(); loadLevel(state.idx); } },
       { t: 'Map', fn: function () { hideModal(); showScreen('map'); renderMap(); } }]);
  }

  /* ---------- Map ---------- */
  function saveStars(idx, s) {
    try {
      var d = JSON.parse(localStorage.getItem('bubblehex') || '{}');
      d[idx] = Math.max(d[idx] || 0, s);
      localStorage.setItem('bubblehex', JSON.stringify(d));
    } catch (e) {}
  }
  function getStars() {
    try { return JSON.parse(localStorage.getItem('bubblehex') || '{}'); } catch (e) { return {}; }
  }
  function renderMap() {
    var saved = getStars();
    var total = 0;
    Object.keys(saved).forEach(function (k) { total += saved[k]; });
    document.getElementById('total-stars').textContent = total;
    var path = document.getElementById('map-path');
    path.innerHTML = '';
    LEVELS.forEach(function (L, i) {
      var unlocked = i === 0 || saved[i - 1];
      var n = document.createElement('div');
      n.className = 'level-node' + (unlocked ? '' : ' locked');
      n.innerHTML = '<span class="ln-num">' + (i + 1) + '</span><span class="ln-stars">' +
        (saved[i] ? '★'.repeat(saved[i]) : (unlocked ? '☆☆☆' : '🔒')) + '</span><span class="ln-name">' + L.name + '</span>';
      if (unlocked) n.onclick = function () { HexAudio.click(); loadLevel(i); };
      path.appendChild(n);
    });
  }

  /* ---------- Screens & modal ---------- */
  function showScreen(which) {
    document.getElementById('screen-map').classList.toggle('hidden', which !== 'map');
    document.getElementById('screen-game').classList.toggle('hidden', which !== 'game');
    if (which === 'game') { resize(); render(); }
  }
  function showModal(title, html, buttons) {
    var m = document.getElementById('modal'), card = document.getElementById('modal-card');
    card.innerHTML = '<h2>' + title + '</h2><div class="modal-body">' + html + '</div><div class="modal-btns"></div>';
    var btns = card.querySelector('.modal-btns');
    buttons.forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'mbtn'; btn.textContent = b.t; btn.onclick = b.fn;
      btns.appendChild(btn);
    });
    m.classList.remove('hidden');
  }
  function hideModal() { document.getElementById('modal').classList.add('hidden'); }

  document.getElementById('btn-quit').onclick = function () { HexAudio.click(); showScreen('map'); renderMap(); };
  document.getElementById('btn-pause').onclick = function () {
    if (!state || state.over) return;
    showModal('Paused', 'Take a breath, witch.',
      [{ t: 'Resume', fn: hideModal }, { t: 'Restart', fn: function () { hideModal(); loadLevel(state.idx); } },
       { t: 'Map', fn: function () { hideModal(); showScreen('map'); renderMap(); } }]);
  };
  document.getElementById('orb-wrap').onclick = function () {
    if (state && state.orb >= state.orbMax) banner('✦ Next shot is a HEX BLAST!');
    else if (state) banner('✦ Pop bubbles to charge (' + state.orb + '/' + state.orbMax + ')');
  };

  // boot
  renderMap();
  showScreen('map');
})();
