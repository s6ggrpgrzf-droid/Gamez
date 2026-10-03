/* Maze Trace — trace the arrows from entrance to exit */
'use strict';
(function () {
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, DPR = 1;

  var LEVELS = [];
  (function () {
    var defs = [
      [7, 10, 'Easy'], [8, 11, 'Easy'], [9, 12, 'Easy'], [10, 13, 'Easy'],
      [11, 14, 'Medium'], [12, 15, 'Medium'], [13, 16, 'Medium'], [14, 17, 'Medium'],
      [15, 19, 'Hard'], [16, 20, 'Hard'], [17, 21, 'Hard'], [18, 22, 'Hard'],
      [19, 24, 'Hard'], [20, 25, 'Expert'], [21, 26, 'Expert'], [22, 27, 'Expert'],
      [23, 29, 'Expert'], [24, 30, 'Expert'], [25, 32, 'Master'], [26, 33, 'Master'],
      [27, 34, 'Master'], [28, 36, 'Master'], [29, 37, 'Master'], [30, 38, 'Master'],
    ];
    defs.forEach(function (d, i) { LEVELS.push({ w: d[0], h: d[1], diff: d[2], n: i + 1 }); });
  })();

  var S = null; // game state

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (S) fitMaze(false);
  }
  window.addEventListener('resize', resize);

  function best() { try { return JSON.parse(localStorage.getItem('mt_progress') || '{}'); } catch (e) { return {}; } }
  function saveProgress(p) { try { localStorage.setItem('mt_progress', JSON.stringify(p)); } catch (e) {} }

  function newLevel(n) {
    var L = LEVELS[n - 1];
    var mz = MazeGen.generate(L.w, L.h);
    var sol = MazeGen.solve(mz);
    var segs = MazeGen.segments(mz);
    S = {
      n: n, L: L, mz: mz, sol: sol, segs: segs,
      cell: 34, ox: 0, oy: 0,           // view transform
      trace: [], tracing: false,         // trace points in maze px
      lives: 3, mistakes: 0, moves: 0,
      t0: Date.now(), won: false,
      hint: 0,                           // hint flash timer
      shake: 0,
      startPx: null, exitPx: null,
    };
    S.startPx = cellXY(mz.start[0] - 0.6, mz.start[1]);
    S.exitPx = cellXY(mz.exit[0] + 0.6, mz.exit[1]);
    fitMaze(true);
    S.trace = [S.startPx.slice()];
    updateHUD();
    hideOverlays();
    document.getElementById('hint-toast').classList.remove('show');
  }

  function cellXY(cx, cy) { // cell coords -> maze px (unscaled)
    return [(cx + 0.5) * S.cell, (cy + 0.5) * S.cell];
  }
  function mazeW() { return S.mz.w * S.cell; }
  function mazeH() { return S.mz.h * S.cell; }

  // view transform: screen = maze * zoom + pan
  var zoom = 1, panX = 0, panY = 0;
  function fitMaze(reset) {
    if (!S) return;
    var topPad = 86, botPad = 30;
    var availW = W - 24, availH = H - topPad - botPad;
    zoom = Math.min(availW / mazeW(), availH / mazeH());
    zoom = Math.min(zoom, 1.6);
    if (reset) {
      panX = (W - mazeW() * zoom) / 2;
      panY = topPad + (availH - mazeH() * zoom) / 2;
    }
  }
  function toScreen(mx, my) { return [mx * zoom + panX, my * zoom + panY]; }
  function toMaze(sx, sy) { return [(sx - panX) / zoom, (sy - panY) / zoom]; }

  /* ---------- rendering ---------- */
  var TAUPE = '#8a6f5c', TAUPE_LT = '#a58a73', CREAM = '#faf6ef';

  function draw() {
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, W, H);
    if (!S) return;
    ctx.save();
    if (S.shake > 0) ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);

    var cw = S.cell * 0.52; // corridor width in maze px

    // corridors
    ctx.strokeStyle = TAUPE;
    ctx.lineWidth = cw * zoom;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    S.segs.forEach(function (sg) {
      var a = toScreen(sg[0] * S.cell + S.cell / 2, sg[1] * S.cell + S.cell / 2);
      var b = toScreen(sg[2] * S.cell + S.cell / 2, sg[3] * S.cell + S.cell / 2);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    });
    ctx.stroke();

    // arrows (guide toward exit)
    ctx.fillStyle = TAUPE_LT;
    var idx = function (x, y) { return y * S.mz.w + x; };
    for (var y = 0; y < S.mz.h; y++) for (var x = 0; x < S.mz.w; x++) {
      var d = S.sol.arrows[idx(x, y)];
      if (d < 0) continue;
      var c = toScreen((x + 0.5) * S.cell, (y + 0.5) * S.cell);
      var s = Math.max(5, S.cell * zoom * 0.16);
      var ang = [Math.PI * 1.5, 0, Math.PI * 0.5, Math.PI][d];
      ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(-s, -s * 0.7); ctx.lineTo(0, 0); ctx.lineTo(-s, s * 0.7);
      ctx.lineTo(-s, s * 0.28); ctx.lineTo(-s * 2.1, s * 0.28); ctx.lineTo(-s * 2.1, -s * 0.28); ctx.lineTo(-s, -s * 0.28);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // hint: flash solution path
    if (S.hint > 0) {
      ctx.strokeStyle = 'rgba(90,140,255,0.75)';
      ctx.lineWidth = Math.max(3, cw * zoom * 0.35);
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      // walk arrows from start
      var hx = S.mz.start[0], hy = S.mz.start[1], guard = 0;
      var hp = toScreen((hx + 0.5) * S.cell, (hy + 0.5) * S.cell);
      ctx.moveTo(hp[0], hp[1]);
      while (guard++ < 4000) {
        var hd = S.sol.arrows[hy * S.mz.w + hx];
        if (hd < 0) break;
        hx += MazeGen.DX[hd]; hy += MazeGen.DY[hd];
        if (hx < 0 || hy < 0 || hx >= S.mz.w || hy >= S.mz.h) break;
        var np = toScreen((hx + 0.5) * S.cell, (hy + 0.5) * S.cell);
        ctx.lineTo(np[0], np[1]);
        if (hx === S.mz.exit[0] && hy === S.mz.exit[1]) break;
      }
      ctx.stroke(); ctx.setLineDash([]);
    }

    // start / exit markers
    var sp = toScreen(S.startPx[0], S.startPx[1]);
    var ep = toScreen(S.exitPx[0], S.exitPx[1]);
    ctx.fillStyle = '#4da3ff';
    ctx.beginPath(); ctx.arc(sp[0], sp[1], Math.max(7, cw * zoom * 0.42), 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.max(9, cw * zoom * 0.4) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('▶', sp[0] + 1, sp[1]);
    // exit flag
    ctx.strokeStyle = '#3a2c22'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(ep[0], ep[1] - 14 * zoom); ctx.lineTo(ep[0], ep[1] + 10 * zoom); ctx.stroke();
    ctx.fillStyle = '#e14b4b';
    ctx.beginPath(); ctx.moveTo(ep[0], ep[1] - 14 * zoom); ctx.lineTo(ep[0] + 16 * zoom, ep[1] - 9 * zoom); ctx.lineTo(ep[0], ep[1] - 4 * zoom); ctx.closePath(); ctx.fill();

    // trace
    if (S.trace.length > 1) {
      ctx.strokeStyle = '#e0644b';
      ctx.lineWidth = Math.max(4, cw * zoom * 0.42);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      S.trace.forEach(function (p, i) {
        var q = toScreen(p[0], p[1]);
        i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
      });
      ctx.stroke();
      // head dot
      var hl = S.trace[S.trace.length - 1], hq = toScreen(hl[0], hl[1]);
      ctx.fillStyle = '#e0644b';
      ctx.beginPath(); ctx.arc(hq[0], hq[1], Math.max(5, cw * zoom * 0.3), 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  /* ---------- input: trace / pan / pinch ---------- */
  var touches = {}; // id -> {x,y}
  var pinchD0 = 0, zoom0 = 1, panMid0 = null;
  var traceId = null, panId = null;

  function distToSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var L2 = dx * dx + dy * dy;
    var t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    var cx = ax + dx * t, cy = ay + dy * t;
    return { d: Math.hypot(px - cx, py - cy), x: cx, y: cy };
  }
  function nearestCorridor(mx, my) {
    var best = null, bd = Infinity;
    for (var i = 0; i < S.segs.length; i++) {
      var sg = S.segs[i];
      var ax = (sg[0] + 0.5) * S.cell, ay = (sg[1] + 0.5) * S.cell;
      var bx = (sg[2] + 0.5) * S.cell, by = (sg[3] + 0.5) * S.cell;
      var r = distToSeg(mx, my, ax, ay, bx, by);
      if (r.d < bd) { bd = r.d; best = r; }
    }
    return { d: bd, x: best.x, y: best.y };
  }

  function headMaze() { return S.trace[S.trace.length - 1]; }

  function onDown(id, sx, sy) {
    touches[id] = { x: sx, y: sy };
    var ids = Object.keys(touches);
    if (ids.length === 2) {
      // start pinch
      var a = touches[ids[0]], b = touches[ids[1]];
      pinchD0 = Math.hypot(a.x - b.x, a.y - b.y);
      zoom0 = zoom;
      panMid0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, panX: panX, panY: panY };
      traceId = null;
      return;
    }
    if (S.won) return;
    var m = toMaze(sx, sy);
    var hd = headMaze();
    // near trace head (or start when trace is fresh) -> trace
    if (Math.hypot((m[0] - hd[0]) * zoom, (m[1] - hd[1]) * zoom) < 44) {
      traceId = id; panId = null;
    } else {
      panId = id; traceId = null;
      touches[id].lpX = panX; touches[id].lpY = panY;
    }
  }
  function onMove(id, sx, sy) {
    var t = touches[id];
    if (!t) return;
    t.x = sx; t.y = sy;
    var ids = Object.keys(touches);
    if (ids.length === 2 && pinchD0 > 0) {
      var a = touches[ids[0]], b = touches[ids[1]];
      var d = Math.hypot(a.x - b.x, a.y - b.y);
      var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      // zoom about midpoint
      var nz = Math.max(0.4, Math.min(4, zoom0 * d / pinchD0));
      var mm = toMaze(mid.x, mid.y);
      zoom = nz;
      panX = mid.x - mm[0] * zoom;
      panY = mid.y - mm[1] * zoom;
      // pan with midpoint drift
      panX += mid.x - panMid0.x; panY += mid.y - panMid0.y;
      return;
    }
    if (id === panId) {
      panX = t.lpX + (sx - t.ox0); panY = t.lpY + (sy - t.oy0);
      return;
    }
    if (id === traceId && !S.won) {
      var m = toMaze(sx, sy);
      var hd = headMaze();
      // must stay near head (continuity)
      if (Math.hypot((m[0] - hd[0]) * zoom, (m[1] - hd[1]) * zoom) > 90) { mistake(); traceId = null; return; }
      var nc = nearestCorridor(m[0], m[1]);
      var tol = S.cell * 0.42;
      if (nc.d > tol) { mistake(); traceId = null; return; }
      // append if moved enough
      var last = S.trace[S.trace.length - 1];
      if (Math.hypot(nc.x - last[0], nc.y - last[1]) > S.cell * 0.12) {
        S.trace.push([nc.x, nc.y]);
        S.moves++;
        // reached exit?
        var ex = toMaze.apply(null, [0, 0]); // noop
        var ecell = [(S.mz.exit[0] + 0.5) * S.cell, (S.mz.exit[1] + 0.5) * S.cell];
        if (Math.hypot(nc.x - ecell[0], nc.y - ecell[1]) < S.cell * 0.45) win();
      }
    }
  }
  function onUp(id) {
    delete touches[id];
    if (id === traceId) traceId = null;
    if (id === panId) panId = null;
    if (Object.keys(touches).length < 2) pinchD0 = 0;
  }

  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      onDown(t.identifier, t.clientX, t.clientY);
      touches[t.identifier].ox0 = t.clientX; touches[t.identifier].oy0 = t.clientY;
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
    for (var i = 0; i < e.changedTouches.length; i++) onUp(e.changedTouches[i].identifier);
  });
  canvas.addEventListener('touchcancel', function (e) {
    for (var i = 0; i < e.changedTouches.length; i++) onUp(e.changedTouches[i].identifier);
  });
  // mouse for desktop testing
  var mDown = false;
  canvas.addEventListener('mousedown', function (e) { mDown = true; onDown('m', e.clientX, e.clientY); touches['m'].ox0 = e.clientX; touches['m'].oy0 = e.clientY; });
  canvas.addEventListener('mousemove', function (e) { if (mDown) onMove('m', e.clientX, e.clientY); });
  window.addEventListener('mouseup', function () { mDown = false; onUp('m'); });

  /* ---------- rules ---------- */
  function mistake() {
    if (S.won) return;
    S.mistakes++;
    S.lives--;
    S.shake = 10;
    S.trace = [S.startPx.slice()];
    try { MT_Audio.bad(); } catch (e) {}
    updateHUD();
    if (S.lives <= 0) {
      setTimeout(showOutOfLives, 350);
    }
  }
  function win() {
    if (S.won) return;
    S.won = true;
    traceId = null;
    var secs = Math.round((Date.now() - S.t0) / 1000);
    var stars = S.mistakes === 0 ? 3 : S.mistakes === 1 ? 2 : 1;
    var p = best();
    p[S.n] = Math.max(p[S.n] || 0, stars);
    saveProgress(p);
    try { MT_Audio.win(); } catch (e) {}
    // confetti burst
    setTimeout(function () { showWin(stars, secs); }, 450);
  }

  /* ---------- HUD / overlays ---------- */
  function updateHUD() {
    document.getElementById('lvl-label').textContent = 'Level ' + S.n;
    document.getElementById('diff-label').textContent = S.L.diff;
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
    document.getElementById('win-moves').textContent = S.mistakes + ' slip' + (S.mistakes === 1 ? '' : 's');
    var nb = document.getElementById('next-btn');
    nb.style.display = S.n < LEVELS.length ? '' : 'none';
    document.getElementById('win-modal').classList.add('show');
  }
  function showOutOfLives() {
    document.getElementById('lives-modal').classList.add('show');
  }
  function fmtTime(s) {
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function showMap() {
    var p = best();
    var grid = document.getElementById('map-grid');
    grid.innerHTML = '';
    LEVELS.forEach(function (L) {
      var b = document.createElement('button');
      b.className = 'map-cell' + (p[L.n] ? ' done' : '') + (L.n === S.n ? ' cur' : '');
      b.innerHTML = '<span class="mc-n">' + L.n + '</span><span class="mc-s">' + ('⭐'.repeat(p[L.n] || 0) || '·') + '</span>';
      b.addEventListener('click', function () { newLevel(L.n); });
      grid.appendChild(b);
    });
    document.getElementById('map-modal').classList.add('show');
  }

  /* ---------- wire up ---------- */
  document.getElementById('map-btn').addEventListener('click', showMap);
  document.getElementById('map-close').addEventListener('click', function () {
    document.getElementById('map-modal').classList.remove('show');
  });
  document.getElementById('hint-btn').addEventListener('click', function () {
    if (!S || S.won) return;
    S.hint = 2.2;
    var toast = document.getElementById('hint-toast');
    toast.classList.remove('show');
    try { MT_Audio.click(); } catch (e) {}
  });
  document.getElementById('zoom-in').addEventListener('click', function () { zoomAt(1.25); });
  document.getElementById('zoom-out').addEventListener('click', function () { zoomAt(0.8); });
  function zoomAt(f) {
    var nz = Math.max(0.4, Math.min(4, zoom * f));
    var cx = W / 2, cy = H / 2;
    var m = toMaze(cx, cy);
    zoom = nz;
    panX = cx - m[0] * zoom; panY = cy - m[1] * zoom;
  }
  document.getElementById('retry-btn').addEventListener('click', function () { newLevel(S.n); });
  document.getElementById('retry-btn2').addEventListener('click', function () { newLevel(S.n); });
  document.getElementById('next-btn').addEventListener('click', function () { newLevel(Math.min(S.n + 1, LEVELS.length)); });
  document.getElementById('win-map-btn').addEventListener('click', showMap);
  document.getElementById('lives-map-btn').addEventListener('click', showMap);
  // "stuck" toast appears after 25s without winning
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
    if (S) {
      if (S.hint > 0) S.hint -= dt;
      if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 40);
      draw();
    }
  }

  /* ---------- boot ---------- */
  resize();
  // start at highest unlocked+1? just start at 1, map shows progress
  var p0 = best();
  var startN = 1;
  for (var i = 1; i <= LEVELS.length; i++) if (p0[i]) startN = i + 1;
  startN = Math.min(startN, LEVELS.length);
  newLevel(startN);
  document.getElementById('menu').classList.add('show');
  document.getElementById('play-btn').addEventListener('click', function () {
    document.getElementById('menu').classList.remove('show');
    try { MT_Audio.init(); } catch (e) {}
  });
  // expose level count for hub/tests
  window.MT_LEVELS = LEVELS.length;
  requestAnimationFrame(loop);
})();
