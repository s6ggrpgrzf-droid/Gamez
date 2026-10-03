/* Arrow Slide — tap arrows to slide them off the grid (Amaze GO-style) */
'use strict';
(function () {
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, DPR = 1;

  var LEVELS = [];
  (function () {
    // [cols, rows, fill, minLen, maxLen, difficulty]
    var defs = [
      [5, 5, .40, 2, 2, 'Easy'], [5, 6, .42, 2, 2, 'Easy'], [6, 6, .44, 2, 3, 'Easy'], [6, 7, .46, 2, 3, 'Easy'],
      [7, 7, .48, 2, 3, 'Medium'], [7, 8, .50, 2, 3, 'Medium'], [8, 8, .52, 2, 3, 'Medium'], [8, 9, .54, 2, 3, 'Medium'],
      [9, 9, .56, 2, 4, 'Hard'], [9, 10, .58, 2, 4, 'Hard'], [10, 10, .60, 2, 4, 'Hard'], [10, 11, .60, 2, 4, 'Hard'],
      [10, 12, .62, 3, 4, 'Hard'], [11, 12, .62, 3, 4, 'Expert'], [11, 13, .64, 3, 4, 'Expert'], [12, 13, .64, 3, 4, 'Expert'],
      [12, 14, .66, 3, 4, 'Expert'], [13, 14, .66, 3, 5, 'Expert'], [13, 15, .68, 3, 5, 'Master'], [14, 15, .68, 3, 5, 'Master'],
      [14, 16, .70, 3, 5, 'Master'], [15, 16, .70, 4, 5, 'Master'], [15, 17, .72, 4, 5, 'Master'], [16, 17, .72, 4, 6, 'Master'],
    ];
    defs.forEach(function (d, i) { LEVELS.push({ w: d[0], h: d[1], fill: d[2], minLen: d[3], maxLen: d[4], diff: d[5], n: i + 1 }); });
  })();

  var S = null;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (S) fitBoard(false);
  }
  window.addEventListener('resize', resize);

  function best() { try { return JSON.parse(localStorage.getItem('as_progress') || '{}'); } catch (e) { return {}; } }
  function saveProgress(p) { try { localStorage.setItem('as_progress', JSON.stringify(p)); } catch (e) {} }

  // view transform
  var zoom = 1, panX = 0, panY = 0, cell = 56;
  function boardW() { return S.board.w * cell; }
  function boardH() { return S.board.h * cell; }
  function fitBoard(reset) {
    if (!S) return;
    var topPad = 96, botPad = 40;
    var z = Math.min((W - 28) / boardW(), (H - topPad - botPad) / boardH());
    zoom = Math.min(z, 1.15);
    if (reset) {
      panX = (W - boardW() * zoom) / 2;
      panY = topPad + ((H - topPad - botPad) - boardH() * zoom) / 2;
    }
  }
  function toScreen(mx, my) { return [mx * zoom + panX, my * zoom + panY]; }
  function toMaze(sx, sy) { return [(sx - panX) / zoom, (sy - panY) / zoom]; }
  function cellCenter(cx, cy) { return [(cx + 0.5) * cell, (cy + 0.5) * cell]; }

  function newLevel(n) {
    var L = LEVELS[n - 1];
    var board = ArrowGen.generate(L.w, L.h, L.fill, L.minLen, L.maxLen);
    S = {
      n: n, L: L, board: board,
      lives: 3, mistakes: 0, cleared: 0, total: board.count,
      t0: Date.now(), won: false,
      flying: [],   // slide-off animations {x,y,dx,dy,t,color}
      trails: [],   // fading trail segments
      shake: 0, badFlash: null,
      hintKey: null, hintT: 0,
    };
    fitBoard(true);
    updateHUD();
    hideOverlays();
    document.getElementById('hint-toast').classList.remove('show');
    draw();
  }

  /* ---------- rules ---------- */
  function tapCell(cx, cy) {
    if (!S || S.won) return;
    var b = S.board;
    var id = b.occ[cx + ',' + cy];
    if (!id) return; // tapped empty space
    var a = b.arrows[id];
    var blocked = ArrowGen.pathCells(b.w, b.h, a.x, a.y, a.dir, a.len).some(function (cc) {
      return b.occ.hasOwnProperty(cc[0] + ',' + cc[1]);
    });
    if (blocked) { wrongTap(id); return; }
    // slide the whole arrow off!
    var dx = ArrowGen.DX[a.dir], dy = ArrowGen.DY[a.dir];
    var hd = ArrowGen.headOf(a.x, a.y, a.dir, a.len);
    var hc = cellCenter(hd[0], hd[1]);
    var dist;
    if (a.dir === 0) dist = hc[1] + 80;
    else if (a.dir === 2) dist = boardH() - hc[1] + 80;
    else if (a.dir === 3) dist = hc[0] + 80;
    else dist = boardW() - hc[0] + 80;
    var tc = cellCenter(a.x, a.y);
    S.flying.push({ x: tc[0], y: tc[1], dx: dx, dy: dy, dist: dist, len: a.len, t: 0, dur: 0.42, dir: a.dir });
    // trail along its exit path
    ArrowGen.pathCells(b.w, b.h, a.x, a.y, a.dir, a.len).forEach(function (cc, i) {
      var pc = cellCenter(cc[0], cc[1]);
      S.trails.push({ x: pc[0], y: pc[1], t: -i * 0.02, life: 0.5 });
    });
    ArrowGen.removeArrow(b, id);
    S.cleared++;
    S.hintKey = null;
    try { MT_Audio.slide(); } catch (e) {}
    updateHUD();
    if (Object.keys(b.arrows).length === 0) win();
    else draw();
  }

  function wrongTap(id) {
    S.mistakes++;
    S.lives--;
    S.shake = 9;
    S.badFlash = { id: id, t: 0 };
    try { MT_Audio.bad(); } catch (e) {}
    updateHUD();
    draw();
    if (S.lives <= 0) setTimeout(showOutOfLives, 400);
  }

  function win() {
    if (S.won) return;
    S.won = true;
    var secs = Math.round((Date.now() - S.t0) / 1000);
    var stars = S.mistakes === 0 ? 3 : S.mistakes === 1 ? 2 : 1;
    var p = best();
    p[S.n] = Math.max(p[S.n] || 0, stars);
    saveProgress(p);
    try { MT_Audio.win(); } catch (e) {}
    arcadeBoardSubmit(S.n, secs);
    setTimeout(function () { showWin(stars, secs); }, 600);
  }

  function hint() {
    if (!S || S.won) return;
    var free = ArrowGen.freeArrows(S.board);
    if (!free.length) return;
    S.hintKey = free[(Math.random() * free.length) | 0];
    S.hintT = 2.5;
    document.getElementById('hint-toast').classList.remove('show');
    try { MT_Audio.click(); } catch (e) {}
    draw();
  }

  /* ---------- rendering ---------- */
  var INK = '#6b5a4e', INK_LT = '#9a8878', CREAM = '#faf6ef';
  var ACOLORS = ['#e0644b', '#4da3ff', '#7bc96f', '#b48a5e'];

  function arrowColor(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return ACOLORS[Math.abs(h) % ACOLORS.length];
  }

  // long skinny arrow: shaft from tail to head + arrowhead at the head
  function drawLongArrow(tx, ty, hx, hy, dir, color, widthScale) {
    var ang = Math.atan2(hy - ty, hx - tx);
    var wdt = cell * zoom * 0.16 * (widthScale || 1); // skinny shaft
    var hl = cell * zoom * 0.42; // head length
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = wdt;
    ctx.lineCap = 'round';
    // shaft (stop short so the head sits clean)
    var ex = hx - Math.cos(ang) * hl * 0.7, ey = hy - Math.sin(ang) * hl * 0.7;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(ex, ey); ctx.stroke();
    // head
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(hl, 0);
    ctx.lineTo(-hl * 0.35, -hl * 0.62);
    ctx.lineTo(-hl * 0.35, hl * 0.62);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function draw() {
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, W, H);
    if (!S) return;
    ctx.save();
    if (S.shake > 0) ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);

    var b = S.board;

    // grid dots
    ctx.fillStyle = 'rgba(154,136,120,0.30)';
    for (var gy = 0; gy <= b.h; gy++) for (var gx = 0; gx <= b.w; gx++) {
      var gp = toScreen(gx * cell, gy * cell);
      ctx.beginPath(); ctx.arc(gp[0], gp[1], 1.6, 0, 7); ctx.fill();
    }

    // trails
    S.trails.forEach(function (tr) {
      if (tr.t < 0) return;
      var a = Math.max(0, 1 - tr.t / tr.life);
      var p = toScreen(tr.x, tr.y);
      ctx.fillStyle = 'rgba(224,100,75,' + (a * 0.5).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(p[0], p[1], cell * zoom * 0.30 * a + 2, 0, 7); ctx.fill();
    });

    // arrows (long & skinny)
    Object.keys(b.arrows).forEach(function (id) {
      var a = b.arrows[id];
      var tc = cellCenter(a.x, a.y);
      var hd = ArrowGen.headOf(a.x, a.y, a.dir, a.len);
      var hc = cellCenter(hd[0], hd[1]);
      var tq = toScreen(tc[0], tc[1]), hq = toScreen(hc[0], hc[1]);
      var col = arrowColor(id);
      if (S.badFlash && S.badFlash.id === id) col = '#e02020';
      var pulse = (S.hintKey === id) ? 1 + 0.18 * Math.sin(Date.now() / 130) : 1;
      // touch halo over the whole arrow
      ctx.strokeStyle = S.hintKey === id ? '#4da3ff' : 'rgba(255,255,255,0.55)';
      ctx.lineWidth = cell * zoom * 0.52;
      ctx.lineCap = 'round';
      if (S.hintKey === id) { ctx.save(); ctx.setLineDash([]); }
      ctx.beginPath(); ctx.moveTo(tq[0], tq[1]); ctx.lineTo(hq[0], hq[1]); ctx.stroke();
      if (S.hintKey === id) ctx.restore();
      drawLongArrow(tq[0], tq[1], hq[0], hq[1], a.dir, col, pulse);
    });

    // flying arrows
    S.flying.forEach(function (f) {
      var p = 1 - Math.pow(1 - f.t / f.dur, 2); // easeOut
      var mx = f.x + f.dx * f.dist * p, my = f.y + f.dy * f.dist * p;
      var q = toScreen(mx, my);
      // head leads: offset tail back along direction
      var back = (f.len - 1) * cell;
      var tqx = q[0] - f.dx * back * zoom, tqy = q[1] - f.dy * back * zoom;
      ctx.globalAlpha = 1 - p * 0.6;
      drawLongArrow(tqx, tqy, q[0], q[1], f.dir, '#e0644b', 1);
      ctx.globalAlpha = 1;
    });

    ctx.restore();
  }

  /* ---------- input ---------- */
  var touches = {};
  var pinchD0 = 0, zoom0 = 1;
  var downPos = {};

  function onDown(id, sx, sy) {
    touches[id] = { x: sx, y: sy };
    downPos[id] = { x: sx, y: sy };
    if (Object.keys(touches).length === 2) {
      var ids = Object.keys(touches);
      var a = touches[ids[0]], bb = touches[ids[1]];
      pinchD0 = Math.hypot(a.x - bb.x, a.y - bb.y);
      zoom0 = zoom;
    }
  }
  function onMove(id, sx, sy) {
    var t = touches[id];
    if (!t) return;
    t.x = sx; t.y = sy;
    var ids = Object.keys(touches);
    if (ids.length === 2 && pinchD0 > 0) {
      var a = touches[ids[0]], bb = touches[ids[1]];
      var d = Math.hypot(a.x - bb.x, a.y - bb.y);
      zoomAtPoint(Math.max(0.5, Math.min(3, zoom0 * d / pinchD0)), (a.x + bb.x) / 2, (a.y + bb.y) / 2);
    } else if (ids.length === 1) {
      // single-finger drag pans
      var dp = downPos[id];
      if (dp && Math.hypot(sx - dp.x, sy - dp.y) > 12) {
        panX += sx - t.px; panY += sy - t.py;
        dp.moved = true;
      }
    }
    t.px = sx; t.py = sy;
  }
  function onUp(id, sx, sy) {
    var dp = downPos[id];
    delete touches[id]; delete downPos[id];
    if (Object.keys(touches).length < 2) pinchD0 = 0;
    // tap (no drag): convert to cell
    if (dp && !dp.moved && S && !S.won) {
      var m = toMaze(sx, sy);
      var cx = Math.floor(m[0] / cell), cy = Math.floor(m[1] / cell);
      if (cx >= 0 && cy >= 0 && cx < S.board.w && cy < S.board.h) tapCell(cx, cy);
    }
  }
  function zoomAtPoint(nz, sx, sy) {
    var m = toMaze(sx, sy);
    zoom = nz;
    panX = sx - m[0] * zoom; panY = sy - m[1] * zoom;
  }

  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      onDown(t.identifier, t.clientX, t.clientY);
      touches[t.identifier].px = t.clientX; touches[t.identifier].py = t.clientY;
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      onMove(t.identifier, t.clientX, t.clientY);
    }
  }, { passive: false });
  canvas.addEventListener('touchend', function (e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      onUp(t.identifier, t.clientX, t.clientY);
    }
  });
  canvas.addEventListener('touchcancel', function (e) {
    for (var i = 0; i < e.changedTouches.length; i++) onUp(e.changedTouches[i].identifier, 0, 0);
  });
  // mouse fallback
  var mDown = false;
  canvas.addEventListener('mousedown', function (e) { mDown = true; onDown('m', e.clientX, e.clientY); touches['m'].px = e.clientX; touches['m'].py = e.clientY; });
  canvas.addEventListener('mousemove', function (e) { if (mDown) onMove('m', e.clientX, e.clientY); });
  window.addEventListener('mouseup', function (e) { if (mDown) { mDown = false; onUp('m', e.clientX, e.clientY); } });

  /* ---------- HUD / overlays ---------- */
  function updateHUD() {
    document.getElementById('lvl-label').textContent = 'Level ' + S.n;
    document.getElementById('diff-label').textContent = S.L.diff;
    document.getElementById('clear-label').textContent = S.cleared + '/' + S.total;
    var drops = '';
    for (var i = 0; i < 3; i++) drops += i < S.lives ? '💧' : '🤍';
    document.getElementById('lives').textContent = drops;
  }
  function hideOverlays() {
    ['win-modal', 'lives-modal', 'map-modal'].forEach(function (id) {
      document.getElementById(id).classList.remove('show');
    });
  }
  function showWin(stars, secs) {
    document.getElementById('win-stars').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
    document.getElementById('win-time').textContent = fmtTime(secs);
    document.getElementById('win-moves').textContent = S.mistakes + ' miss' + (S.mistakes === 1 ? '' : 'es');
    document.getElementById('next-btn').style.display = S.n < LEVELS.length ? '' : 'none';
    document.getElementById('win-modal').classList.add('show');
  }
  function showOutOfLives() { document.getElementById('lives-modal').classList.add('show'); }
  function fmtTime(s) { return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function showMap() {
    var p = best();
    var grid = document.getElementById('map-grid');
    grid.innerHTML = '';
    LEVELS.forEach(function (L) {
      var b = document.createElement('button');
      b.className = 'map-cell' + (p[L.n] ? ' done' : '') + (L.n === S.n ? ' cur' : '');
      b.innerHTML = '<span class="mc-n">' + L.n + '</span><span class="mc-s">' + ('⭐'.repeat(p[L.n] || 0) || L.diff) + '</span>';
      b.addEventListener('click', function () { newLevel(L.n); });
      grid.appendChild(b);
    });
    document.getElementById('map-modal').classList.add('show');
  }

  document.getElementById('map-btn').addEventListener('click', showMap);
  document.getElementById('map-close').addEventListener('click', function () {
    document.getElementById('map-modal').classList.remove('show');
  });
  document.getElementById('hint-btn').addEventListener('click', hint);
  document.getElementById('retry-btn').addEventListener('click', function () { newLevel(S.n); });
  document.getElementById('retry-btn2').addEventListener('click', function () { newLevel(S.n); });
  document.getElementById('next-btn').addEventListener('click', function () { newLevel(Math.min(S.n + 1, LEVELS.length)); });
  document.getElementById('win-map-btn').addEventListener('click', showMap);
  document.getElementById('lives-map-btn').addEventListener('click', showMap);
  setInterval(function () {
    if (S && !S.won && Date.now() - S.t0 > 25000 && !document.getElementById('hint-toast').classList.contains('show')) {
      document.getElementById('hint-toast').classList.add('show');
    }
  }, 5000);

  /* ---------- main loop ---------- */
  var last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    var dt = Math.min((ts - last) / 1000 || 0.016, 0.05);
    last = ts;
    if (!S) return;
    var dirty = false;
    if (S.shake > 0) { S.shake = Math.max(0, S.shake - dt * 40); dirty = true; }
    if (S.badFlash) { S.badFlash.t += dt; if (S.badFlash.t > 0.6) S.badFlash = null; dirty = true; }
    if (S.hintT > 0) { S.hintT -= dt; if (S.hintT <= 0) S.hintKey = null; dirty = true; }
    else if (S.hintKey) dirty = true;
    for (var i = S.flying.length - 1; i >= 0; i--) {
      var f = S.flying[i];
      f.t += dt; dirty = true;
      if (f.t >= f.dur) S.flying.splice(i, 1);
    }
    for (var j = S.trails.length - 1; j >= 0; j--) {
      var tr = S.trails[j];
      tr.t += dt;
      if (tr.t > tr.life) S.trails.splice(j, 1); else dirty = true;
    }
    if (dirty || !S._drawn) { draw(); S._drawn = true; }
  }

  /* ---------- boot ---------- */
  resize();
  var p0 = best(), startN = 1;
  for (var i = 1; i <= LEVELS.length; i++) if (p0[i]) startN = i + 1;
  startN = Math.min(startN, LEVELS.length);
  newLevel(startN);
  document.getElementById('menu').classList.add('show');
  document.getElementById('play-btn').addEventListener('click', function () {
    document.getElementById('menu').classList.remove('show');
    try { MT_Audio.init(); } catch (e) {}
  });
  window.MT_LEVELS = LEVELS.length;
  // expose for tests
  window.MT_DEBUG = { tapCell: tapCell, getS: function () { return S; }, newLevel: newLevel };
  requestAnimationFrame(loop);

  /* ---------- Gamez Arcade: global leaderboards ----------
     Fastest solve per board. Scores are stored as (3600 - seconds) so that
     faster times rank higher; the board converts them back to m:ss. */
  var ARCADE_BASE = 'https://gamez-arcade.chaoticutopia84.workers.dev'; // Gamez Arcade backend, e.g. https://gamez-arcade.xxx.workers.dev
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
  function arcadeEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function arcadeTimeHtml(top, hl) {
    if (!top || !top.length) return '<div class="arc-lb-empty">No times yet — be the first!</div>';
    var medals = ['🥇', '🥈', '🥉'];
    return top.slice(0, 3).map(function (e, i) {
      return '<div class="arc-lb-row' + (e.name === hl ? ' me' : '') + '"><span>' +
        (medals[i] || (i + 1) + '.') + ' ' + arcadeEsc(e.name) + '</span><b>' +
        fmtTime(Math.max(0, 3600 - e.score)) + '</b></div>';
    }).join('');
  }
  function arcadeBoardSubmit(boardN, secs) {
    var box = document.getElementById('arc-lb');
    if (!box || !ARCADE_BASE || !(secs >= 0)) return;
    var score = Math.max(1, 3600 - Math.min(secs, 3599));
    box.innerHTML = '<div class="arc-lb-empty">🏆 loading times…</div>';
    var name = '';
    try { name = (localStorage.getItem('arcade_name') || '').trim(); } catch (e) {}
    function go(n) {
      box.innerHTML = '<div class="arc-lb-empty">🏆 sending…</div>';
      arcadeFetch('/score', { game: 'maze-trace', board: 'board-' + boardN, name: n, score: score }, function (err, res) {
        function done(top, rank) {
          var r = rank > 0 ? '<div class="arc-lb-rank">GLOBAL #' + rank + '!</div>' : '';
          box.innerHTML = r + '<div class="arc-lb-title">🏆 BOARD ' + boardN + ' FASTEST</div>' + arcadeTimeHtml(top, n);
        }
        if (res && res.top) done(res.top, res.rank);
        else arcadeFetch('/scores?game=maze-trace&board=board-' + boardN, null, function (e2, d2) {
          done(d2 && d2.top ? d2.top : null, 0);
        });
      });
    }
    if (name) { go(name); return; }
    box.innerHTML = '<div class="arc-lb-form"><input id="arc-lb-name" maxlength="12" placeholder="YOUR NAME" autocomplete="off">' +
      '<button id="arc-lb-go" class="ghost-btn">SAVE</button></div>';
    document.getElementById('arc-lb-go').onclick = function () {
      var v = document.getElementById('arc-lb-name').value.trim().slice(0, 12);
      if (!v) return;
      try { localStorage.setItem('arcade_name', v); } catch (e) {}
      go(v);
    };
  }
})();
