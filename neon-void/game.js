/* Neon Void — Geometry Wars-style twin-stick arena shooter */
'use strict';
(function () {
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildGrid();
  }
  window.addEventListener('resize', resize);

  /* ---------- warped grid (spring physics) ---------- */
  var grid = [], GW = 24, GH = 0, GS = 40;
  function buildGrid() {
    GW = Math.ceil(W / GS) + 2; GH = Math.ceil(H / GS) + 2;
    grid = [];
    for (var y = 0; y < GH; y++) {
      grid[y] = [];
      for (var x = 0; x < GW; x++) grid[y][x] = { ox: 0, oy: 0, vx: 0, vy: 0 };
    }
  }
  function warpGrid(x, y, force) {
    var gx = Math.round(x / GS), gy = Math.round(y / GS);
    for (var dy = -5; dy <= 5; dy++) for (var dx = -5; dx <= 5; dx++) {
      var ix = gx + dx, iy = gy + dy;
      if (ix < 0 || iy < 0 || ix >= GW || iy >= GH) continue;
      var d = Math.sqrt(dx * dx + dy * dy) || 0.5;
      var p = grid[iy][ix];
      p.vx += (dx / d) * force / d; p.vy += (dy / d) * force / d;
    }
  }
  // ambient background churn — the grid never sits still
  var churnT = 0;
  function churnGrid(dt) {
    churnT += dt;
    // slow rolling waves across the whole field
    for (var y = 0; y < GH; y += 2) for (var x = 0; x < GW; x += 2) {
      var p = grid[y][x];
      var wave = Math.sin(churnT * 1.3 + x * 0.55 + y * 0.4) * 2.2
               + Math.sin(churnT * 0.7 - x * 0.3 + y * 0.6) * 1.6;
      p.vx += Math.cos(churnT * 0.9 + y * 0.5) * wave * dt * 3;
      p.vy += Math.sin(churnT * 1.1 + x * 0.5) * wave * dt * 3;
    }
    // random micro-impacts to keep it alive
    if (Math.random() < dt * 6) {
      warpGrid(Math.random() * W, Math.random() * H, 10 + Math.random() * 14);
    }
  }
  function updateGrid() {
    for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) {
      var p = grid[y][x];
      p.vx += (-p.ox * 0.12 - p.vx * 0.08);
      p.vy += (-p.oy * 0.12 - p.vy * 0.08);
      p.ox += p.vx; p.oy += p.vy;
    }
  }
  function drawGrid() {
    ctx.strokeStyle = 'rgba(40,80,180,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var y = 0; y < GH; y++) {
      for (var x = 0; x < GW - 1; x++) {
        var a = grid[y][x], b = grid[y][x + 1];
        ctx.moveTo(x * GS + a.ox, y * GS + a.oy);
        ctx.lineTo((x + 1) * GS + b.ox, y * GS + b.oy);
      }
    }
    for (var x2 = 0; x2 < GW; x2++) {
      for (var y2 = 0; y2 < GH - 1; y2++) {
        var c = grid[y2][x2], d = grid[y2 + 1][x2];
        ctx.moveTo(x2 * GS + c.ox, y2 * GS + c.oy);
        ctx.lineTo(x2 * GS + d.ox, (y2 + 1) * GS + d.oy);
      }
    }
    ctx.stroke();
    // playfield border
    ctx.strokeStyle = 'rgba(80,140,255,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, W - 16, H - 16);
  }

  /* ---------- state ---------- */
  var S = null;
  function newGame() {
    S = {
      px: W / 2, py: H / 2, pvx: 0, pvy: 0, aim: -Math.PI / 2,
      bullets: [], enemies: [], geoms: [], parts: buildPool(), floaters: [],
      wells: [], stars: [],
      score: 0, mult: 1, geomsGot: 0, lives: 3, bombs: 3,
      time: 0, spawnT: 0, diff: 1, over: false,
      shake: 0, slowmo: 0, invuln: 2,
      fireT: 0, wellT: 8,
      freezeT: 0, flash: 0, flashColor: '#ff2244',
      killT: 0, killChain: 0, kick: 0,
    };
    for (var i = 0; i < 60; i++) S.stars.push({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 1.5 + 0.5 });
    updateHUD();
  }

  /* ---------- audio ---------- */
  function beep(f, d, type, vol) {
    try { NV_Audio.tone(f, d, type, vol); } catch (e) {}
  }

  /* ---------- spawning ---------- */
  var ETYPES = ['wanderer', 'seeker', 'weaver', 'spinner'];
  function spawnEnemy(force) {
    var t = force || ETYPES[(Math.random() * Math.min(ETYPES.length, 1 + (S.diff / 3 | 0))) | 0];
    // spawn at edge, away from player
    var x, y, tries = 0;
    do {
      var edge = (Math.random() * 4) | 0;
      if (edge === 0) { x = Math.random() * W; y = 20; }
      else if (edge === 1) { x = Math.random() * W; y = H - 20; }
      else if (edge === 2) { x = 20; y = Math.random() * H; }
      else { x = W - 20; y = Math.random() * H; }
      tries++;
    } while (tries < 8 && Math.hypot(x - S.px, y - S.py) < 180);
    var e = { type: t, x: x, y: y, vx: 0, vy: 0, t: 0, hp: 1, r: 12, pop: 0 };
    if (t === 'wanderer') { e.vx = (Math.random() - 0.5) * 60; e.vy = (Math.random() - 0.5) * 60; e.color = '#c060ff'; e.score = 25; }
    if (t === 'seeker') { e.color = '#40e0ff'; e.score = 50; e.r = 10; }
    if (t === 'weaver') { e.color = '#ff60c0'; e.score = 100; e.r = 11; }
    if (t === 'spinner') { e.color = '#ffb040'; e.score = 100; e.r = 13; e.spin = 0; }
    S.enemies.push(e);
  }
  function spawnWell() {
    var x = 60 + Math.random() * (W - 120), y = 60 + Math.random() * (H - 120);
    S.wells.push({ x: x, y: y, r: 8, grow: 0, suck: 0 });
    banner('⚫ GRAVITY WELL');
    beep(80, 0.5, 'sawtooth', 0.15);
  }

  /* ============ FEEL IDENTITY: ELECTRIC / SHARP / RELENTLESS ============
     Every juice choice serves it: shake is sharp with a fast snappy decay
     (never soft/rolling), particles are neon SHARDS (never petals/bubbles),
     additive glow, hit-stop on big moments, red 0.15s damage flash,
     squash-stretch on the ship and spawn-pops on enemies, snappy easings.
     Centralized event->effects map: tune feel here, not in gameplay code. */
  var RM = (function () { // honor the OS reduce-motion setting
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { return false; }
  })();
  var NVSET = { haptics: true };
  try {
    var _s = JSON.parse(localStorage.getItem('nv_settings') || '{}');
    if (typeof _s.haptics === 'boolean') NVSET.haptics = _s.haptics;
  } catch (e) {}
  function saveSettings() { try { localStorage.setItem('nv_settings', JSON.stringify(NVSET)); } catch (e) {} }
  /* guarded haptics: never throws (iOS has no vibrate); respects toggle + reduce-motion */
  function buzz(pattern) {
    try {
      if (!NVSET.haptics || RM || !('vibrate' in navigator)) return;
      navigator.vibrate(pattern);
    } catch (e) {}
  }
  var FX = {
    shake: function (amt) { if (RM) return; S.shake = Math.min(S.shake + amt, 26); },
    hitStop: function (ms) { if (RM) return; S.freezeT = Math.max(S.freezeT, ms / 1000); },
    slowDip: function (t) { if (RM) return; S.slowmo = Math.max(S.slowmo, t); },
    flash: function (color) { if (RM) return; S.flash = 0.15; S.flashColor = color; }
  };
  function easeOutBack(t) {
    var c1 = 1.70158, c3 = c1 + 1;
    t = Math.min(1, Math.max(0, t));
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  /* ---------- pooled neon-shard particles (additive, capped, zero per-frame alloc) ---------- */
  var POOL_N = 420;
  function buildPool() {
    var a = [];
    for (var i = 0; i < POOL_N; i++) a.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 1, color: '#fff', kind: 0, len: 6 });
    return a;
  }
  var poolCursor = 0;
  function spawnP(x, y, vx, vy, life, color, kind, len) {
    var p = S.parts[poolCursor];
    poolCursor = (poolCursor + 1) % POOL_N;
    p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.t = 0; p.life = life; p.color = color; p.kind = kind; p.len = len;
  }
  /* kind 1 = shard (streak along velocity), kind 0 = spark (tiny hot rect) */
  function explode(x, y, color, n, spd, quiet) {
    n = n || 24;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = (0.3 + Math.random() * 0.7) * (spd || 260);
      if (Math.random() < 0.5) spawnP(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.3 + Math.random() * 0.35, color, 1, 6 + Math.random() * 10);
      else spawnP(x, y, Math.cos(a) * s * 0.7, Math.sin(a) * s * 0.7, 0.4 + Math.random() * 0.4, color, 0, 0);
    }
    if (!quiet) { warpGrid(x, y, 30); FX.shake(8); }
  }

  /* ---------- combat ---------- */
  function killEnemy(e, idx) {
    S.enemies.splice(idx, 1);
    explode(e.x, e.y, e.color, 26, 300);
    // multikill chain — relentless rewards for relentless flying
    if (S.killT > 0) S.killChain++; else S.killChain = 1;
    S.killT = 0.7;
    var pts = e.score * S.mult;
    S.score += pts;
    S.floaters.push({ x: e.x, y: e.y, text: '+' + pts, t: 0, color: '#fff' });
    if (S.killChain === 3 || S.killChain === 5 || S.killChain === 8) {
      var label = S.killChain === 3 ? 'TRIPLE KILL' : S.killChain === 5 ? 'RAMPAGE' : 'VOID FRENZY';
      S.floaters.push({ x: S.px, y: S.py - 46, text: label + ' x' + S.killChain, t: 0, color: '#66ffff' });
      FX.hitStop(60); FX.slowDip(0.3); FX.shake(12);
      buzz([10, 40, 10]);
      beep(900 + S.killChain * 120, 0.15, 'square', 0.1);
    }
    // drop geom
    S.geoms.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, t: 0, life: 6 });
    S.geomsGot++;
    var nm = 1 + (S.geomsGot / 25 | 0);
    if (nm > S.mult && S.mult < 150) {
      S.mult = Math.min(nm, 150);
      S.floaters.push({ x: S.px, y: S.py - 30, text: '×' + S.mult, t: 0, color: '#ffe14d' });
      beep(600 + S.mult * 8, 0.12, 'square', 0.08);
    }
    beep(200 + Math.random() * 300, 0.08, 'square', 0.06);
    // spinner splits
    if (e.type === 'spinner' && e.r > 7) {
      for (var i = 0; i < 3; i++) {
        S.enemies.push({ type: 'spinner', x: e.x + (Math.random() - 0.5) * 20, y: e.y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200, t: 0, r: 6, color: '#ffb040', score: 50, spin: Math.random() * 6, pop: 0 });
      }
    }
    updateHUD();
  }

  function die() {
    if (S.invuln > 0 || S.over) return;
    explode(S.px, S.py, '#ffffff', 60, 400);
    S.lives--;
    S.mult = 1; S.geomsGot = 0;
    S.invuln = 3;
    FX.slowDip(S.lives === 1 ? 0.9 : 0.6); // near-death: deeper dip on last life
    FX.hitStop(70);
    FX.shake(24);
    FX.flash(S.lives <= 0 ? '#ff2244' : '#ff6644'); // 0.15s red flash on damage
    buzz(S.lives <= 0 ? [40, 80, 40, 40, 80, 40] : [30]);
    beep(110, 0.5, 'sawtooth', 0.2);
    updateHUD();
    if (S.lives <= 0) gameOver();
    else { S.px = W / 2; S.py = H / 2; S.pvx = 0; S.pvy = 0; }
  }

  function bomb() {
    if (!S || S.over || S.bombs <= 0) return;
    S.bombs--;
    // clear all enemies + wells
    S.enemies.forEach(function (e) { explode(e.x, e.y, e.color, 20, 260); S.score += e.score * S.mult; });
    S.enemies = [];
    S.wells.forEach(function (w) { explode(w.x, w.y, '#000000', 40, 300); });
    S.wells = [];
    S.bullets = [];
    warpGrid(W / 2, H / 2, 120);
    FX.shake(26);
    FX.hitStop(80);
    FX.slowDip(0.4);
    FX.flash('#88ccff');
    S.floaters.push({ x: W / 2, y: H / 2, text: '💥 BOMB', t: 0, color: '#fff' });
    beep(60, 0.8, 'sawtooth', 0.25);
    updateHUD();
  }

  function gameOver() {
    S.over = true;
    var best = +(localStorage.getItem('nv_best') || 0);
    if (S.score > best) { best = S.score; localStorage.setItem('nv_best', best); }
    document.getElementById('final-score').textContent = S.score.toLocaleString();
    document.getElementById('best2').textContent = best.toLocaleString();
    setTimeout(function () { document.getElementById('over').classList.add('show'); }, 900);
    submitScore();
  }

  /* ============ Gamez Arcade: global leaderboards ============
     Scores post to a shared Cloudflare worker; everything degrades
     silently offline so the game never depends on the network. */
  var ARCADE_BASE = "https://gamez-arcade.chaoticutopia84.workers.dev"; // Gamez Arcade backend
  var NV_GAME = 'neon-void';
  function arcadeFetch(path, body, cb) {
    var done = false, timer = null;
    function fin(e, d) { if (!done) { done = true; if (timer) clearTimeout(timer); cb(e, d); } }
    timer = setTimeout(function () { fin(new Error('timeout')); }, 12000);
    try {
      fetch(ARCADE_BASE + path, body ?
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
        .then(function (r) { return r.json(); })
        .then(function (d) { fin(null, d); })
        .catch(function (e) { fin(e); });
    } catch (e) { fin(e); }
  }
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function renderBoard(id, top, hlName) {
    var el = document.getElementById(id);
    if (!el) return;
    if (!top || !top.length) {
      el.innerHTML = '<div class="lb-empty">no scores yet — be the first</div>';
      return;
    }
    el.innerHTML = top.map(function (e, i) {
      var medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
      var me = hlName && e.name === hlName ? ' me' : '';
      return '<div class="lb-row' + me + '"><span>' + medal + ' ' + escHtml(e.name) +
        '</span><b>' + (+e.score).toLocaleString() + '</b></div>';
    }).join('');
  }
  function loadBoards() {
    if (!ARCADE_BASE) return;
    arcadeFetch('/scores?game=' + NV_GAME, null, function (err, data) {
      var top = (!err && data) ? data.top : null;
      renderBoard('menu-lb', top);
      renderBoard('over-lb', top, localStorage.getItem('nv_name'));
    });
  }
  function submitScore() {
    if (!ARCADE_BASE || S._submitted || !(S.score > 0)) return;
    var name = (localStorage.getItem('nv_name') || '').trim();
    if (!name) {
      var form = document.getElementById('lb-form');
      form.style.display = 'flex';
      document.getElementById('lb-save').onclick = function () {
        var v = document.getElementById('lb-name').value.trim().slice(0, 12);
        if (!v) return;
        try { localStorage.setItem('nv_name', v); } catch (e) {}
        form.style.display = 'none';
        postScore(v);
      };
      return;
    }
    postScore(name);
  }
  function postScore(name) {
    S._submitted = true;
    var rankEl = document.getElementById('lb-rank');
    rankEl.textContent = 'sending…';
    arcadeFetch('/score', { game: NV_GAME, name: name, score: S.score }, function (err, data) {
      if (err || !data) { rankEl.textContent = ''; return; }
      rankEl.textContent = data.rank > 0 ? '🌍 GLOBAL RANK #' + data.rank : '';
      renderBoard('over-lb', data.top, name);
      renderBoard('menu-lb', data.top, name);
    });
  }

  /* ---------- update ---------- */
  function update(dt) {
    S.time += dt;
    S.diff = 1 + S.time / 45;
    if (S.invuln > 0) S.invuln -= dt;
    if (S.slowmo > 0) { S.slowmo -= dt; dt *= 0.3; }
    if (S.killT > 0) { S.killT -= dt; if (S.killT <= 0) S.killChain = 0; }
    if (S.kick > 0) S.kick = Math.max(0, S.kick - dt * 8);
    if (S.flash > 0) S.flash = Math.max(0, S.flash - dt);

    // --- player movement (left stick) ---
    var mx = stickL.dx, my = stickL.dy;
    var spd = 340;
    S.pvx += (mx * spd - S.pvx) * Math.min(1, dt * 10);
    S.pvy += (my * spd - S.pvy) * Math.min(1, dt * 10);
    S.px = clamp(S.px + S.pvx * dt, 20, W - 20);
    S.py = clamp(S.py + S.pvy * dt, 20, H - 20);

    // --- firing (right stick) ---
    if (stickR.mag > 0.35) {
      S.aim = Math.atan2(stickR.dy, stickR.dx);
      S.fireT -= dt;
      if (S.fireT <= 0) {
        S.fireT = 0.09;
        var bx = S.px + Math.cos(S.aim) * 18, by = S.py + Math.sin(S.aim) * 18;
        S.bullets.push({ x: bx, y: by, vx: Math.cos(S.aim) * 700 + S.pvx * 0.5, vy: Math.sin(S.aim) * 700 + S.pvy * 0.5, t: 0 });
        S.kick = 1; // fire recoil — feeds ship squash
        warpGrid(bx, by, 1.2);
        beep(800 + Math.random() * 200, 0.04, 'square', 0.03);
      }
    }

    // bullets
    for (var i = S.bullets.length - 1; i >= 0; i--) {
      var b = S.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.t += dt;
      if (b.x < 0 || b.x > W || b.y < 0 || b.y > H || b.t > 1.2) S.bullets.splice(i, 1);
    }

    // --- spawning ---
    S.spawnT -= dt;
    if (S.spawnT <= 0) {
      S.spawnT = Math.max(0.25, 1.4 - S.diff * 0.09);
      var n = 1 + (S.diff / 4 | 0);
      for (var s = 0; s < n && S.enemies.length < 60; s++) spawnEnemy();
    }
    S.wellT -= dt;
    if (S.wellT <= 0) { S.wellT = 14 + Math.random() * 10; if (S.wells.length < 2) spawnWell(); }

    // --- enemies ---
    for (var ei = S.enemies.length - 1; ei >= 0; ei--) {
      var e = S.enemies[ei];
      e.t += dt;
      if (e.pop < 1) e.pop = Math.min(1, e.pop + dt * 7); // spawn pop (snappy)
      var dx = S.px - e.x, dy = S.py - e.y, d = Math.hypot(dx, dy) || 1;
      if (e.type === 'wanderer') {
        if (Math.random() < dt * 0.8) { e.vx = (Math.random() - 0.5) * 90; e.vy = (Math.random() - 0.5) * 90; }
        e.x += e.vx * dt; e.y += e.vy * dt;
      } else if (e.type === 'seeker') {
        var sp = Math.min(60 + e.t * 14, 300);
        e.vx += (dx / d * sp - e.vx) * dt * 3;
        e.vy += (dy / d * sp - e.vy) * dt * 3;
        e.x += e.vx * dt; e.y += e.vy * dt;
      } else if (e.type === 'weaver') {
        var wsp = 170;
        var px2 = -dy / d, py2 = dx / d;
        var wob = Math.sin(e.t * 6) * 120;
        e.x += (dx / d * wsp + px2 * wob) * dt;
        e.y += (dy / d * wsp + py2 * wob) * dt;
      } else if (e.type === 'spinner') {
        e.spin += dt * 5;
        e.x += (e.vx || 0) * dt; e.y += (e.vy || 0) * dt;
        e.vx = (e.vx || 0) + dx / d * 60 * dt;
        e.vy = (e.vy || 0) + dy / d * 60 * dt;
        if (!e.vx && !e.vy) { e.vx = dx / d * 80; e.vy = dy / d * 80; }
      }
      // gravity wells pull enemies
      S.wells.forEach(function (w) {
        var wx = w.x - e.x, wy = w.y - e.y, wd = Math.hypot(wx, wy) || 1;
        if (wd < 260) { e.x += wx / wd * 320 * dt * (1 - wd / 260); e.y += wy / wd * 320 * dt * (1 - wd / 260); }
        if (wd < w.r + 6) { // sucked in
          w.suck += e.score * S.mult;
          explode(e.x, e.y, e.color, 10, 150);
          S.enemies.splice(S.enemies.indexOf(e), 1);
        }
      });
      // bounce off walls
      if (e.x < 16) { e.x = 16; e.vx = Math.abs(e.vx || 50); }
      if (e.x > W - 16) { e.x = W - 16; e.vx = -Math.abs(e.vx || 50); }
      if (e.y < 16) { e.y = 16; e.vy = Math.abs(e.vy || 50); }
      if (e.y > H - 16) { e.y = H - 16; e.vy = -Math.abs(e.vy || 50); }
      // touch player = death
      if (S.invuln <= 0 && Math.hypot(e.x - S.px, e.y - S.py) < e.r + 10) { die(); break; }
    }

    // --- gravity wells ---
    for (var wi = S.wells.length - 1; wi >= 0; wi--) {
      var w = S.wells[wi];
      w.grow += dt;
      w.r = 8 + Math.sin(w.grow * 3) * 3 + Math.min(w.suck / 2000, 14);
      // wells constantly churn the grid around them
      if (Math.random() < dt * 20) warpGrid(w.x + (Math.random() - 0.5) * 120, w.y + (Math.random() - 0.5) * 120, -18);
      // pull player
      var pdx = S.px - w.x, pdy = S.py - w.y, pd = Math.hypot(pdx, pdy) || 1;
      if (pd < 300) {
        S.px -= pdx / pd * 260 * dt * (1 - pd / 300);
        S.py -= pdy / pd * 260 * dt * (1 - pd / 300);
      }
      // pull bullets in (they orbit/die)
      for (var bi = S.bullets.length - 1; bi >= 0; bi--) {
        var bb = S.bullets[bi];
        var bdx = w.x - bb.x, bdy = w.y - bb.y, bd = Math.hypot(bdx, bdy) || 1;
        if (bd < 200) {
          bb.vx += bdx / bd * 900 * dt; bb.vy += bdy / bd * 900 * dt;
          if (bd < w.r + 8) { explode(bb.x, bb.y, '#8844ff', 6, 120); S.bullets.splice(bi, 1); }
        }
      }
      if (pd < w.r + 10 && S.invuln <= 0) { die(); }
      // well collapses after 25s in a big bang
      if (w.grow > 25) {
        explode(w.x, w.y, '#aa66ff', 80, 500);
        S.score += (150 + (w.suck | 0)) * S.mult;
        S.floaters.push({ x: w.x, y: w.y - 20, text: '+' + ((150 + (w.suck | 0)) * S.mult), t: 0, color: '#cc99ff' });
        S.wells.splice(wi, 1);
        S.shake = 22;
        beep(50, 0.9, 'sawtooth', 0.25);
        updateHUD();
      }
    }

    // --- bullets vs enemies ---
    for (var k = S.bullets.length - 1; k >= 0; k--) {
      var bl = S.bullets[k];
      var hit = false;
      for (var m = S.enemies.length - 1; m >= 0; m--) {
        var en = S.enemies[m];
        if (Math.hypot(bl.x - en.x, bl.y - en.y) < en.r + 4) {
          S.bullets.splice(k, 1); hit = true;
          killEnemy(en, m);
          break;
        }
      }
      if (hit) continue;
    }

    // --- geoms ---
    for (var gi = S.geoms.length - 1; gi >= 0; gi--) {
      var g = S.geoms[gi];
      g.t += dt;
      g.x += g.vx * dt; g.y += g.vy * dt;
      g.vx *= 0.96; g.vy *= 0.96;
      // magnet to player
      var gdx = S.px - g.x, gdy = S.py - g.y, gd = Math.hypot(gdx, gdy) || 1;
      if (gd < 110) { g.x += gdx / gd * 420 * dt; g.y += gdy / gd * 420 * dt; }
      if (gd < 20) {
        S.geoms.splice(gi, 1);
        S.score += 10 * S.mult;
        explode(S.px, S.py, '#ffe14d', 5, 120, true); // quiet pickup sparks
        beep(1200, 0.05, 'sine', 0.04);
        updateHUD();
        continue;
      }
      if (g.t > g.life) S.geoms.splice(gi, 1);
    }

    // --- particles (pooled — no alloc, no splice) ---
    for (var pi = 0; pi < POOL_N; pi++) {
      var p = S.parts[pi];
      if (!p.on) continue;
      p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.97; p.vy *= 0.97;
      if (p.t > p.life) p.on = false;
    }
    for (var fi = S.floaters.length - 1; fi >= 0; fi--) {
      var f = S.floaters[fi];
      f.t += dt; f.y -= 40 * dt;
      if (f.t > 1) S.floaters.splice(fi, 1);
    }
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 110); // sharp electric decay
    churnGrid(dt);
    updateGrid();
  }

  /* ---------- render ---------- */
  function neon(color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
  }
  function drawShip() {
    ctx.save();
    ctx.translate(S.px, S.py);
    ctx.rotate(S.aim);
    // squash & stretch: stretch along velocity, recoil kick on fire — sharp, never soft
    var spdN = Math.min(1, Math.hypot(S.pvx, S.pvy) / 340);
    var sq = spdN * 0.22 + S.kick * 0.12;
    ctx.scale(1 + sq, 1 - Math.min(sq, 0.35));
    if (S.invuln > 0 && (S.time * 10 | 0) % 2 === 0) ctx.globalAlpha = 0.35;
    neon('#ffffff', 2.5);
    ctx.beginPath();
    // claw ship
    ctx.moveTo(16, 0); ctx.lineTo(-8, -11); ctx.lineTo(-3, 0); ctx.lineTo(-8, 11); ctx.closePath();
    ctx.stroke();
    neon('#66ccff', 1.5);
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.stroke();
    ctx.restore();
    ctx.shadowBlur = 0;
  }
  function drawEnemies() {
    S.enemies.forEach(function (e) {
      ctx.save(); ctx.translate(e.x, e.y);
      if (e.pop < 1) { var sc = easeOutBack(e.pop); ctx.scale(sc, sc); } // spawn pop
      neon(e.color, 2);
      if (e.type === 'wanderer') {
        ctx.rotate(e.t * 1.5);
        var s = e.r;
        ctx.strokeRect(-s / 1.4, -s / 1.4, s * 1.4, s * 1.4);
        ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.stroke();
      } else if (e.type === 'seeker') {
        ctx.rotate(Math.atan2(e.vy, e.vx));
        var r = e.r;
        ctx.beginPath();
        ctx.moveTo(r, 0); ctx.lineTo(-r, r * 0.7); ctx.lineTo(-r * 0.4, 0); ctx.lineTo(-r, -r * 0.7);
        ctx.closePath(); ctx.stroke();
      } else if (e.type === 'weaver') {
        ctx.rotate(e.t * 3);
        ctx.beginPath();
        for (var i = 0; i <= 6; i++) {
          var a = i / 6 * Math.PI * 2, rr = e.r * (i % 2 ? 0.55 : 1);
          var px = Math.cos(a) * rr, py = Math.sin(a) * rr;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath(); ctx.stroke();
      } else if (e.type === 'spinner') {
        ctx.rotate(e.spin);
        var n = 8, sr = e.r;
        ctx.beginPath();
        for (var j = 0; j < n; j++) {
          var a2 = j / n * Math.PI * 2;
          ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a2) * sr, Math.sin(a2) * sr);
        }
        ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, sr * 0.35, 0, 7); ctx.stroke();
      }
      ctx.restore();
    });
    ctx.shadowBlur = 0;
  }
  function drawWells() {
    S.wells.forEach(function (w) {
      ctx.save(); ctx.translate(w.x, w.y);
      var grd = ctx.createRadialGradient(0, 0, 0, 0, 0, w.r * 4);
      grd.addColorStop(0, 'rgba(0,0,0,1)');
      grd.addColorStop(0.35, 'rgba(60,0,120,0.9)');
      grd.addColorStop(1, 'rgba(120,40,255,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, w.r * 4, 0, 7); ctx.fill();
      neon('#aa66ff', 2);
      ctx.beginPath(); ctx.arc(0, 0, w.r, 0, 7); ctx.stroke();
      ctx.rotate(w.grow * 4);
      ctx.beginPath(); ctx.arc(0, 0, w.r + 8, 0, 4); ctx.stroke();
      ctx.restore();
    });
    ctx.shadowBlur = 0;
  }
  function render() {
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (S.shake > 0) ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
    // stars
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    S.stars.forEach(function (st) { ctx.fillRect(st.x, st.y, st.s, st.s); });
    drawGrid();
    drawWells();
    // geoms
    S.geoms.forEach(function (g) {
      var a = 1 - g.t / g.life;
      ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.t * 4);
      ctx.globalAlpha = Math.max(0.25, a);
      neon('#ffe14d', 2);
      var s = 5;
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.lineTo(-s, 0); ctx.closePath(); ctx.stroke();
      ctx.restore();
    });
    ctx.shadowBlur = 0;
    drawEnemies();
    // bullets
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff'; ctx.shadowBlur = 8;
    S.bullets.forEach(function (b) {
      ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, 7); ctx.fill();
    });
    ctx.shadowBlur = 0;
    if (!S.over) drawShip();
    // particles — additive neon shards (never soft circles): streaks + hot sparks
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 2;
    for (var qi = 0; qi < POOL_N; qi++) {
      var q = S.parts[qi];
      if (!q.on) continue;
      var qa = 1 - q.t / q.life;
      ctx.globalAlpha = qa;
      if (q.kind === 1) {
        ctx.strokeStyle = q.color;
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x - q.vx * 0.035, q.y - q.vy * 0.035);
        ctx.stroke();
      } else {
        ctx.fillStyle = q.color;
        ctx.fillRect(q.x - 1, q.y - 1, 2.5, 2.5);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // floaters — scale-pop numbers (snappy ease-out-back)
    ctx.textAlign = 'center';
    S.floaters.forEach(function (f) {
      ctx.globalAlpha = Math.max(0, 1 - f.t);
      ctx.fillStyle = f.color;
      ctx.font = 'bold ' + (15 * easeOutBack(f.t / 0.22)).toFixed(1) + 'px sans-serif';
      ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
    // damage flash — full-screen 0.15s red (steady, outside the shake transform)
    if (S.flash > 0) {
      ctx.globalAlpha = Math.min(0.35, S.flash / 0.15 * 0.35);
      ctx.fillStyle = S.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    drawSticks();
  }

  /* ---------- twin sticks ---------- */
  var stickL = { id: null, ox: 0, oy: 0, dx: 0, dy: 0, mag: 0 };
  var stickR = { id: null, ox: 0, oy: 0, dx: 0, dy: 0, mag: 0 };
  function drawSticks() {
    [[stickL, '#40e0ff'], [stickR, '#ff60c0']].forEach(function (pair) {
      var st = pair[0];
      if (st.id === null) return;
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = pair[1]; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(st.ox, st.oy, 52, 0, 7); ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = pair[1];
      ctx.beginPath(); ctx.arc(st.ox + st.dx * 52, st.oy + st.dy * 52, 22, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    });
  }
  function touchPos(t) { return [t.clientX, t.clientY]; }
  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    if (!S || S.over) return;
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i], p = touchPos(t);
      var st = p[0] < W / 2 ? stickL : stickR;
      if (st.id === null) { st.id = t.identifier; st.ox = p[0]; st.oy = p[1]; st.dx = 0; st.dy = 0; st.mag = 0; }
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i], p = touchPos(t);
      [stickL, stickR].forEach(function (st) {
        if (st.id === t.identifier) {
          var dx = p[0] - st.ox, dy = p[1] - st.oy;
          var m = Math.hypot(dx, dy), max = 52;
          if (m > max) { dx = dx / m * max; dy = dy / m * max; m = max; }
          st.dx = dx / max; st.dy = dy / max; st.mag = m / max;
        }
      });
    }
  }, { passive: false });
  function endTouch(e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      var id = e.changedTouches[i].identifier;
      [stickL, stickR].forEach(function (st) {
        if (st.id === id) { st.id = null; st.dx = 0; st.dy = 0; st.mag = 0; }
      });
    }
  }
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);
  // mouse fallback for desktop testing
  var mouseDown = false;
  canvas.addEventListener('mousedown', function (e) {
    if (!S || S.over) return;
    mouseDown = true;
    var p = [e.clientX, e.clientY];
    var st = p[0] < W / 2 ? stickL : stickR;
    st.id = 'mouse'; st.ox = p[0]; st.oy = p[1];
  });
  canvas.addEventListener('mousemove', function (e) {
    if (!mouseDown) return;
    var p = [e.clientX, e.clientY];
    [stickL, stickR].forEach(function (st) {
      if (st.id === 'mouse') {
        var dx = p[0] - st.ox, dy = p[1] - st.oy, m = Math.hypot(dx, dy), max = 52;
        if (m > max) { dx = dx / m * max; dy = dy / m * max; m = max; }
        st.dx = dx / max; st.dy = dy / max; st.mag = m / max;
      }
    });
  });
  window.addEventListener('mouseup', function () { mouseDown = false; stickL.id = null; stickR.id = null; stickL.mag = 0; stickR.mag = 0; });

  document.getElementById('bomb-btn').addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); bomb(); }, { passive: false });
  document.getElementById('bomb-btn').addEventListener('click', function (e) { e.stopPropagation(); bomb(); });

  /* ---------- HUD ---------- */
  function updateHUD() {
    document.getElementById('score').textContent = S.score.toLocaleString();
    document.getElementById('mult').textContent = '×' + S.mult;
    document.getElementById('lives').textContent = '🚀'.repeat(Math.max(0, S.lives)) + '💣'.repeat(Math.max(0, S.bombs));
  }
  var bannerT = null;
  function banner(text) {
    var el = document.getElementById('score');
    el.textContent = text;
    clearTimeout(bannerT);
    bannerT = setTimeout(updateHUD, 1600);
  }

  /* ---------- flavor text (shared backend; silent local fallback) ---------- */
  var AI_BASE = "https://gamez-ai.chaoticutopia84.workers.dev";
  function aiFetch(kind, ctx, cb) {
    var done = false, timer = null;
    function fin(t) { if (!done) { done = true; if (timer) clearTimeout(timer); cb(t); } }
    timer = setTimeout(function () { fin(null); }, 7000);
    try {
      fetch(AI_BASE + '/g', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: kind, game: 'neon-void', ctx: ctx })
      }).then(function (r) { return r.json(); })
        .then(function (d) { fin(d && d.text ? d.text : null); })
        .catch(function () { fin(null); });
    } catch (e) { fin(null); }
  }
  var BRIEF_FALLBACKS = [
    'Sector 7: pirate swarm near the shattered moon. Weapons hot.',
    'Deep field patrol: hostiles converging on the trade lane.',
    'Nebula breach: something big is waking up in the dust.',
    'Border skirmish: hold the line until the convoy clears.',
    'Derelict station ahead: salvage rights go to the survivor.',
    'Void storm incoming: fly fast, shoot faster.'
  ];
  var aiRuns = 0, briefT = null;
  function showBriefing() {
    var slot = aiRuns % BRIEF_FALLBACKS.length;
    aiRuns++;
    var el = document.getElementById('brief');
    function show(t) {
      if (!el) return;
      el.textContent = '📡 ' + (t || BRIEF_FALLBACKS[slot]);
      el.classList.add('show');
      clearTimeout(briefT);
      briefT = setTimeout(function () { el.classList.remove('show'); }, 4500);
    }
    aiFetch('briefing', { v: slot }, show);
    // if the fetch is slow, show the fallback right away so the run always has a briefing
    setTimeout(function () { if (el && !el.classList.contains('show')) show(null); }, 1200);
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------- loop ---------- */
  var last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    var rdt = Math.min((ts - last) / 1000 || 0.016, 0.05);
    last = ts;
    if (!S || document.getElementById('menu').classList.contains('show') || S.paused) return;
    if (S.freezeT > 0) { // hit-stop: freeze the sim 40-80ms, keep drawing — sharp, electric
      S.freezeT -= rdt;
      if (S.shake > 0) S.shake = Math.max(0, S.shake - rdt * 110);
      render();
      return;
    }
    update(rdt);
    render();
  }

  /* ---------- boot ---------- */
  resize();
  document.getElementById('best').textContent = (+(localStorage.getItem('nv_best') || 0)).toLocaleString();
  document.getElementById('menu').classList.add('show');
  loadBoards();
  document.getElementById('start').addEventListener('click', function () {
    document.getElementById('menu').classList.remove('show');
    document.getElementById('over').classList.remove('show');
    newGame();
    showBriefing();
    try { NV_Audio.init(); } catch (e) {}
  });
  document.getElementById('again').addEventListener('click', function () {
    document.getElementById('over').classList.remove('show');
    newGame();
    showBriefing();
  });
  // haptics toggle (settings persist in localStorage; separate from save data)
  var hb = document.getElementById('haptics-btn');
  function syncHapticsBtn() {
    hb.textContent = '📳 HAPTICS: ' + (NVSET.haptics ? 'ON' : 'OFF');
    hb.classList.toggle('off', !NVSET.haptics);
  }
  syncHapticsBtn();
  hb.addEventListener('click', function () {
    NVSET.haptics = !NVSET.haptics;
    saveSettings();
    syncHapticsBtn();
    buzz([10]);
  });
  requestAnimationFrame(loop);
})();
