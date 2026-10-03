/* Arrow Slide — tap winding line-art arrows to slide them off the grid.
 * Amaze GO-style: thin brown paths on warm paper, calm gold header, blue
 * drop lives. Long-press an arrow for Guidance (lane preview). Daily Slide
 * serves one shared board worldwide via the Gamez Arcade /daily seed. */
'use strict';
(function () {
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, DPR = 1;

  /* [cols, rows, fill, minLen, maxLen, difficulty, wind] — wind = how often
   * arrows take turns (0 = straight bars only). */
  var LEVELS = [];
  (function () {
    var defs = [
      [5, 5, .40, 2, 2, 'Easy', 0], [5, 6, .42, 2, 2, 'Easy', 0], [6, 6, .44, 2, 3, 'Easy', .10], [6, 7, .46, 2, 3, 'Easy', .15],
      [7, 7, .48, 2, 3, 'Medium', .30], [7, 8, .50, 2, 3, 'Medium', .35], [8, 8, .52, 2, 3, 'Medium', .40], [8, 9, .54, 2, 3, 'Medium', .45],
      [9, 9, .56, 2, 4, 'Hard', .50], [9, 10, .58, 2, 4, 'Hard', .55], [10, 10, .60, 2, 4, 'Hard', .60], [10, 11, .60, 2, 4, 'Hard', .60],
      [10, 12, .62, 3, 4, 'Hard', .65], [11, 12, .62, 3, 4, 'Expert', .70], [11, 13, .64, 3, 4, 'Expert', .70], [12, 13, .64, 3, 4, 'Expert', .75],
      [12, 14, .66, 3, 4, 'Expert', .75], [13, 14, .66, 3, 5, 'Expert', .80], [13, 15, .68, 3, 5, 'Master', .80], [14, 15, .68, 3, 5, 'Master', .85],
      [14, 16, .70, 4, 5, 'Master', .85], [15, 16, .70, 4, 5, 'Master', .85], [15, 17, .72, 4, 5, 'Master', .90], [16, 17, .72, 4, 6, 'Master', .90],
    ];
    defs.forEach(function (d, i) {
      LEVELS.push({ w: d[0], h: d[1], fill: d[2], minLen: d[3], maxLen: d[4], diff: d[5], wind: d[6], n: i + 1 });
    });
  })();
  var DAILY_SPEC = { w: 10, h: 10, fill: .55, minLen: 2, maxLen: 4, wind: .60, diff: 'Daily' };

  var S = null;

  /* ---------- themes ---------- */
  var THEMES = {
    day:   { bg: '#f6f1e3', ink: '#6f4f33', faint: 'rgba(111,79,51,.28)', gold: '#c08a2d',
             sub: '#a58a73', drop: '#4da3ff', paper: '#fffdf8', grain: '111,79,51' },
    night: { bg: '#221b13', ink: '#d9c9a4', faint: 'rgba(217,201,164,.25)', gold: '#e0a83e',
             sub: '#8d7c63', drop: '#4da3ff', paper: '#2e2417', grain: '217,201,164' },
  };
  function theme() { return THEMES[S && S.theme || 'day']; }
  function loadPref(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function savePref(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', S.theme);
    buildGrain();
    document.getElementById('sound-btn').textContent = S.sound ? '🔊' : '🔇';
    draw();
  }

  /* ---------- paper grain (pre-rendered tile, cheap) ---------- */
  var grainTile = null;
  function buildGrain() {
    var t = document.createElement('canvas');
    t.width = t.height = 140;
    var g = t.getContext('2d');
    var rgb = theme().grain;
    for (var i = 0; i < 260; i++) {
      var a = 0.015 + Math.random() * 0.035;
      g.fillStyle = 'rgba(' + rgb + ',' + a.toFixed(3) + ')';
      var r = 0.5 + Math.random() * 1.4;
      g.beginPath(); g.arc(Math.random() * 140, Math.random() * 140, r, 0, 7); g.fill();
    }
    grainTile = t;
  }

  /* ---------- sizing / view ---------- */
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildGrain();
    if (S) fitBoard(false);
    draw();
  }
  window.addEventListener('resize', resize);

  var zoom = 1, panX = 0, panY = 0, cell = 56;
  function boardW() { return S.board.w * cell; }
  function boardH() { return S.board.h * cell; }
  function fitBoard(reset) {
    if (!S) return;
    var topPad = 150, botPad = 120;
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

  /* ---------- seeded rng (mulberry32) for daily boards ---------- */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- levels ---------- */
  function newLevel(n) {
    var L = LEVELS[n - 1];
    var board = ArrowGen.generate(L.w, L.h, L.fill, L.minLen, L.maxLen, null, L.wind);
    startBoard({ n: n, L: L, board: board, daily: null });
  }
  function newDaily(dateStr, seed) {
    var rng = mulberry32(seed >>> 0);
    var L = DAILY_SPEC;
    var board = ArrowGen.generate(L.w, L.h, L.fill, L.minLen, L.maxLen, rng, L.wind);
    startBoard({ n: 0, L: L, board: board, daily: { date: dateStr, seed: seed >>> 0 } });
  }
  function startBoard(o) {
    S = {
      n: o.n, L: o.L, board: o.board, daily: o.daily,
      lives: 3, mistakes: 0, cleared: 0, total: o.board.count,
      t0: Date.now(), won: false,
      flying: [], trails: [], ripples: [],
      shake: 0, badFlash: null, hintKey: null, hintT: 0,
      guide: null, guideT: 0,
      theme: loadPref('as_theme', 'day'),
      sound: loadPref('as_sound', '1') === '1',
    };
    try { MT_Audio.setEnabled(S.sound); } catch (e) {}
    applyTheme();
    fitBoard(true);
    updateHUD();
    hideOverlays();
    document.getElementById('hint-toast').classList.remove('show');
    draw();
  }

  function best() { try { return JSON.parse(localStorage.getItem('as_progress') || '{}'); } catch (e) { return {}; } }
  function saveProgress(p) { try { localStorage.setItem('as_progress', JSON.stringify(p)); } catch (e) {} }

  /* ---------- rules ---------- */
  function arrowBlocked(b, a) {
    return ArrowGen.pathCells(b.w, b.h, a).some(function (cc) {
      return b.occ.hasOwnProperty(cc[0] + ',' + cc[1]);
    });
  }
  function blockerCell(b, a) {
    var cells = ArrowGen.pathCells(b.w, b.h, a);
    for (var i = 0; i < cells.length; i++) {
      if (b.occ.hasOwnProperty(cells[i][0] + ',' + cells[i][1])) return cells[i];
    }
    return null;
  }

  function tapCell(cx, cy) {
    if (!S || S.won) return;
    var b = S.board;
    var id = b.occ[cx + ',' + cy];
    if (!id) return;
    var a = b.arrows[id];
    if (arrowBlocked(b, a)) { wrongTap(id); return; }
    releaseArrow(id, a);
  }

  function releaseArrow(id, a) {
    var b = S.board;
    var dx = ArrowGen.DX[a.dir], dy = ArrowGen.DY[a.dir];
    var hd = ArrowGen.headOf(a);
    var hc = cellCenter(hd[0], hd[1]);
    var dist;
    if (a.dir === 0) dist = hc[1] + 90;
    else if (a.dir === 2) dist = boardH() - hc[1] + 90;
    else if (a.dir === 3) dist = hc[0] + 90;
    else dist = boardW() - hc[0] + 90;
    var isFinal = Object.keys(b.arrows).length === 1;
    S.flying.push({
      pts: a.pts.map(function (p) { return [p[0], p[1]]; }),
      dir: a.dir, dx: dx, dy: dy, dist: dist,
      t: 0, dur: isFinal ? 1.05 : 0.42, final: isFinal,
    });
    ArrowGen.pathCells(b.w, b.h, a).forEach(function (cc, i) {
      var pc = cellCenter(cc[0], cc[1]);
      S.trails.push({ x: pc[0], y: pc[1], t: -i * 0.02, life: 0.5 });
    });
    ArrowGen.removeArrow(b, id);
    S.cleared++;
    S.hintKey = null; S.guide = null;
    try { if (S.sound) MT_Audio.slide(); } catch (e) {}
    updateHUD();
    if (Object.keys(b.arrows).length === 0) win();
    else draw();
  }

  function wrongTap(id) {
    S.mistakes++;
    S.lives--;
    S.shake = 9;
    S.badFlash = { id: id, t: 0 };
    S.guide = null;
    try { if (S.sound) MT_Audio.bad(); } catch (e) {}
    updateHUD();
    draw();
    if (S.lives <= 0) setTimeout(showOutOfLives, 400);
  }

  function win() {
    if (S.won) return;
    S.won = true;
    var secs = Math.round((Date.now() - S.t0) / 1000);
    var stars = S.mistakes === 0 ? 3 : S.mistakes === 1 ? 2 : 1;
    var boardId, label;
    if (S.daily) {
      boardId = 'daily-' + S.daily.date;
      label = 'DAILY · ' + S.daily.date;
      try {
        var d = JSON.parse(localStorage.getItem('as_daily') || '{}');
        if (!d[S.daily.date] || secs < d[S.daily.date]) { d[S.daily.date] = secs; localStorage.setItem('as_daily', JSON.stringify(d)); }
      } catch (e) {}
    } else {
      boardId = 'board-' + S.n;
      label = 'BOARD ' + S.n;
      var p = best();
      p[S.n] = Math.max(p[S.n] || 0, stars);
      saveProgress(p);
    }
    try { if (S.sound) MT_Audio.win(); } catch (e) {}
    var delay = S.flying.length ? 1150 : 500; // let the final arrow finish its slow glide
    setTimeout(function () {
      arcadeBoardSubmit(boardId, label, secs);
      showWin(stars, secs);
    }, delay);
  }

  function hint() {
    if (!S || S.won) return;
    var free = ArrowGen.freeArrows(S.board);
    if (!free.length) return;
    S.hintKey = free[(Math.random() * free.length) | 0];
    S.hintT = 2.5;
    document.getElementById('hint-toast').classList.remove('show');
    try { if (S.sound) MT_Audio.click(); } catch (e) {}
    draw();
  }

  /* ---------- long-press Guidance ---------- */
  function showGuide(id) {
    var b = S.board, a = b.arrows[id];
    if (!a) return;
    var cells = ArrowGen.pathCells(b.w, b.h, a);
    S.guide = { id: id, cells: cells, blocked: blockerCell(b, a), t: 0 };
    S.guideT = 1.8;
    try { if (S.sound) MT_Audio.guide(); } catch (e) {}
    draw();
  }

  /* ---------- rendering ---------- */
  function strokePath(pts, close) {
    ctx.beginPath();
    pts.forEach(function (p, i) {
      var q = toScreen(p[0], p[1]);
      if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
    });
    if (close) ctx.closePath();
  }

  // one thin line-art arrow: polyline + small head. `pts` in maze coords.
  function drawArrowShape(pts, dir, color, widthScale) {
    var wdt = cell * zoom * 0.13 * (widthScale || 1);
    ctx.strokeStyle = color;
    ctx.lineWidth = wdt;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    strokePath(pts.map(function (c) { return cellCenter(c[0], c[1]); }));
    ctx.stroke();
    // head
    var hd = pts[pts.length - 1];
    var hc = cellCenter(hd[0], hd[1]);
    var q = toScreen(hc[0], hc[1]);
    var ang = Math.atan2(ArrowGen.DY[dir], ArrowGen.DX[dir]);
    var hl = cell * zoom * 0.38, hw = cell * zoom * 0.30;
    ctx.fillStyle = color;
    ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(hl * 0.75, 0);
    ctx.lineTo(-hl * 0.35, -hw * 0.5);
    ctx.lineTo(-hl * 0.35, hw * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function draw() {
    var T = theme();
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, W, H);
    if (grainTile) {
      ctx.fillStyle = ctx.createPattern(grainTile, 'repeat');
      ctx.fillRect(0, 0, W, H);
    }
    if (!S) return;
    ctx.save();
    if (S.shake > 0) ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);

    var b = S.board;

    // grid dots
    ctx.fillStyle = T.faint;
    for (var gy = 0; gy <= b.h; gy++) for (var gx = 0; gx <= b.w; gx++) {
      var gp = toScreen(gx * cell, gy * cell);
      ctx.beginPath(); ctx.arc(gp[0], gp[1], 1.5, 0, 7); ctx.fill();
    }

    // guidance lane (long-press preview)
    if (S.guide) {
      var ga = b.arrows[S.guide.id];
      if (ga) {
        var ghd = ArrowGen.headOf(ga);
        var ghc = cellCenter(ghd[0], ghd[1]);
        var gq = toScreen(ghc[0], ghc[1]);
        var lane = S.guide.cells.map(function (c) { var p = cellCenter(c[0], c[1]); return toScreen(p[0], p[1]); });
        lane.unshift(gq);
        ctx.save();
        ctx.setLineDash([7, 7]);
        ctx.strokeStyle = S.guide.blocked ? 'rgba(217,64,64,.55)' : 'rgba(77,163,255,.65)';
        ctx.lineWidth = Math.max(2, cell * zoom * 0.07);
        ctx.lineCap = 'round';
        ctx.beginPath();
        lane.forEach(function (p, i) { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
        ctx.stroke();
        ctx.restore();
        if (S.guide.blocked) {
          var bc = cellCenter(S.guide.blocked[0], S.guide.blocked[1]);
          var bq = toScreen(bc[0], bc[1]);
          var br = cell * zoom * 0.22;
          ctx.strokeStyle = 'rgba(217,64,64,.8)';
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(bq[0], bq[1], br, 0, 7); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(bq[0] - br * 0.5, bq[1] - br * 0.5); ctx.lineTo(bq[0] + br * 0.5, bq[1] + br * 0.5);
          ctx.moveTo(bq[0] + br * 0.5, bq[1] - br * 0.5); ctx.lineTo(bq[0] - br * 0.5, bq[1] + br * 0.5);
          ctx.stroke();
        }
      }
    }

    // trails
    S.trails.forEach(function (tr) {
      if (tr.t < 0) return;
      var a = Math.max(0, 1 - tr.t / tr.life);
      var p = toScreen(tr.x, tr.y);
      ctx.fillStyle = hexA(T.ink, a * 0.30);
      ctx.beginPath(); ctx.arc(p[0], p[1], cell * zoom * 0.28 * a + 1.5, 0, 7); ctx.fill();
    });

    // arrows — uniform line art
    Object.keys(b.arrows).forEach(function (id) {
      var a = b.arrows[id];
      var col = T.ink;
      if (S.badFlash && S.badFlash.id === id) col = '#d94040';
      var pulse = (S.hintKey === id) ? 1 + 0.25 * Math.sin(Date.now() / 130) : 1;
      if (S.hintKey === id) {
        // soft gold halo under the hinted arrow
        ctx.save();
        ctx.strokeStyle = hexA(T.gold, 0.30);
        ctx.lineWidth = cell * zoom * 0.42;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        strokePath(a.pts.map(function (c) { return cellCenter(c[0], c[1]); }));
        ctx.stroke();
        ctx.restore();
        col = T.gold;
      }
      drawArrowShape(a.pts, a.dir, col, pulse);
    });

    // flying arrows
    S.flying.forEach(function (f) {
      var p = 1 - Math.pow(1 - f.t / f.dur, 2); // easeOut
      var ox = f.dx * f.dist * p, oy = f.dy * f.dist * p;
      var moved = f.pts.map(function (c) { return [c[0] + ox / cell, c[1] + oy / cell]; });
      ctx.globalAlpha = f.final ? Math.max(0, 1 - p * 0.9) : 1 - p * 0.55;
      drawArrowShape(moved, f.dir, f.final ? T.gold : T.ink, 1);
      ctx.globalAlpha = 1;
    });

    // final-arrow ripple rings
    S.ripples.forEach(function (r) {
      var p = r.t / r.life;
      var q = toScreen(r.x, r.y);
      ctx.strokeStyle = hexA(T.gold, (1 - p) * 0.6);
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(q[0], q[1], 8 + p * cell * zoom * 1.6, 0, 7); ctx.stroke();
    });

    ctx.restore();
  }

  // '#rrggbb' + alpha -> 'rgba(...)'
  function hexA(hex, a) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
  }

  /* ---------- input: tap, long-press guidance, pan, pinch ---------- */
  var touches = {};
  var pinchD0 = 0, zoom0 = 1;
  var downPos = {};
  var lpTimer = {}, lpFired = {};

  function cancelLP(id) {
    if (lpTimer[id]) { clearTimeout(lpTimer[id]); delete lpTimer[id]; }
  }

  function onDown(id, sx, sy) {
    touches[id] = { x: sx, y: sy, px: sx, py: sy };
    downPos[id] = { x: sx, y: sy, moved: false };
    lpFired[id] = false;
    if (Object.keys(touches).length === 2) {
      var ids = Object.keys(touches);
      var a = touches[ids[0]], bb = touches[ids[1]];
      pinchD0 = Math.hypot(a.x - bb.x, a.y - bb.y);
      zoom0 = zoom;
      cancelLP(ids[0]); cancelLP(ids[1]);
      // a second finger means this gesture is a pinch, never a tap
      if (downPos[ids[0]]) downPos[ids[0]].pinched = true;
      if (downPos[ids[1]]) downPos[ids[1]].pinched = true;
    } else {
      (function (pid, px, py) {
        lpTimer[pid] = setTimeout(function () {
          delete lpTimer[pid];
          var dp = downPos[pid];
          if (!dp || dp.moved || !S || S.won) return;
          var m = toMaze(px, py);
          var cx = Math.floor(m[0] / cell), cy = Math.floor(m[1] / cell);
          if (cx < 0 || cy < 0 || cx >= S.board.w || cy >= S.board.h) return;
          var aid = S.board.occ[cx + ',' + cy];
          if (!aid) return;
          lpFired[pid] = true;
          showGuide(aid);
        }, 450);
      })(id, sx, sy);
    }
  }
  function onMove(id, sx, sy) {
    var t = touches[id];
    if (!t) return;
    var dp = downPos[id];
    if (dp && Math.hypot(sx - dp.x, sy - dp.y) > 12) {
      dp.moved = true;
      cancelLP(id);
      if (S) { S.guide = null; }
    }
    var ids = Object.keys(touches);
    t.px = t.x; t.py = t.y; t.x = sx; t.y = sy;
    if (ids.length === 2 && pinchD0 > 0) {
      var a = touches[ids[0]], bb = touches[ids[1]];
      var d = Math.hypot(a.x - bb.x, a.y - bb.y);
      zoomAtPoint(Math.max(0.5, Math.min(3, zoom0 * d / pinchD0)), (a.x + bb.x) / 2, (a.y + bb.y) / 2);
    } else if (ids.length === 1 && dp && dp.moved) {
      panX += sx - t.px; panY += sy - t.py;
    }
  }
  function onUp(id, sx, sy) {
    cancelLP(id);
    var dp = downPos[id];
    var wasGuide = lpFired[id];
    delete touches[id]; delete downPos[id]; delete lpFired[id];
    if (Object.keys(touches).length < 2) pinchD0 = 0;
    if (wasGuide) return; // long-press was guidance, not a move
    if (dp && !dp.moved && !dp.pinched && S && !S.won) {
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
  var mDown = false;
  canvas.addEventListener('mousedown', function (e) { mDown = true; onDown('m', e.clientX, e.clientY); });
  canvas.addEventListener('mousemove', function (e) { if (mDown) onMove('m', e.clientX, e.clientY); });
  window.addEventListener('mouseup', function (e) { if (mDown) { mDown = false; onUp('m', e.clientX, e.clientY); } });

  /* ---------- HUD / overlays ---------- */
  function updateHUD() {
    if (S.daily) {
      document.getElementById('lvl-label').textContent = 'Daily Slide';
      document.getElementById('diff-label').textContent = S.daily.date;
    } else {
      document.getElementById('lvl-label').textContent = 'Level ' + S.n;
      document.getElementById('diff-label').textContent = S.L.diff;
    }
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
    document.getElementById('win-title').textContent = S.mistakes === 0 ? 'Perfect Calm' : 'Board Clear';
    document.getElementById('win-time').textContent = fmtTime(secs);
    document.getElementById('win-moves').textContent = S.mistakes + ' miss' + (S.mistakes === 1 ? '' : 'es');
    var nb = document.getElementById('next-btn');
    if (S.daily) { nb.style.display = 'none'; }
    else { nb.style.display = S.n < LEVELS.length ? '' : 'none'; }
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
      b.className = 'map-cell' + (p[L.n] ? ' done' : '') + (L.n === S.n && !S.daily ? ' cur' : '');
      b.innerHTML = '<span class="mc-n">' + L.n + '</span><span class="mc-s">' + ('⭐'.repeat(p[L.n] || 0) || L.diff) + '</span>';
      b.addEventListener('click', function () { newLevel(L.n); });
      grid.appendChild(b);
    });
    document.getElementById('map-modal').classList.add('show');
  }

  document.getElementById('back-btn').addEventListener('click', showMap);
  document.getElementById('theme-btn').addEventListener('click', function () {
    S.theme = S.theme === 'day' ? 'night' : 'day';
    savePref('as_theme', S.theme);
    try { if (S.sound) MT_Audio.click(); } catch (e) {}
    applyTheme();
  });
  document.getElementById('sound-btn').addEventListener('click', function () {
    S.sound = !S.sound;
    savePref('as_sound', S.sound ? '1' : '0');
    try { MT_Audio.setEnabled(S.sound); MT_Audio.init(); if (S.sound) MT_Audio.click(); } catch (e) {}
    document.getElementById('sound-btn').textContent = S.sound ? '🔊' : '🔇';
  });
  document.getElementById('map-btn').addEventListener('click', showMap);
  document.getElementById('map-close').addEventListener('click', function () {
    document.getElementById('map-modal').classList.remove('show');
  });
  document.getElementById('hint-btn').addEventListener('click', hint);
  document.getElementById('retry-btn').addEventListener('click', function () {
    if (S.daily) newDaily(S.daily.date, S.daily.seed); else newLevel(S.n);
  });
  document.getElementById('retry-btn2').addEventListener('click', function () {
    if (S.daily) newDaily(S.daily.date, S.daily.seed); else newLevel(S.n);
  });
  document.getElementById('next-btn').addEventListener('click', function () {
    newLevel(Math.min(S.n + 1, LEVELS.length));
  });
  document.getElementById('win-map-btn').addEventListener('click', showMap);
  document.getElementById('lives-map-btn').addEventListener('click', showMap);
  document.getElementById('zoom-in').addEventListener('click', function () {
    zoomAtPoint(Math.min(3, zoom * 1.25), W / 2, H / 2);
  });
  document.getElementById('zoom-out').addEventListener('click', function () {
    zoomAtPoint(Math.max(0.5, zoom / 1.25), W / 2, H / 2);
  });
  setInterval(function () {
    if (S && !S.won && Date.now() - S.t0 > 25000 && !document.getElementById('hint-toast').classList.contains('show')) {
      document.getElementById('hint-toast').classList.add('show');
    }
  }, 5000);

  /* ---------- Daily Slide ---------- */
  var dailyInfo = null;
  function fetchDaily(cb) {
    arcadeFetch('/daily?game=maze-trace', null, function (err, d) {
      if (d && d.seed != null) {
        dailyInfo = { date: d.date, seed: d.seed >>> 0 };
      } else {
        var ds = new Date().toISOString().slice(0, 10);
        var h = 0;
        for (var i = 0; i < ds.length; i++) h = (h * 31 + ds.charCodeAt(i)) >>> 0;
        dailyInfo = { date: ds, seed: h };
      }
      updateDailyCard();
      if (cb) cb();
    });
  }
  function updateDailyCard() {
    var sub = document.getElementById('daily-sub');
    if (!sub || !dailyInfo) return;
    var bestStr = '';
    try {
      var dd = JSON.parse(localStorage.getItem('as_daily') || '{}');
      if (dd[dailyInfo.date] != null) bestStr = ' · your best ' + fmtTime(dd[dailyInfo.date]);
    } catch (e) {}
    sub.textContent = dailyInfo.date + ' · same board worldwide' + bestStr;
  }
  function playDaily() {
    if (!dailyInfo) {
      var b = document.getElementById('daily-btn');
      b.textContent = '☀️ fetching…';
      fetchDaily(function () {
        b.innerHTML = '☀️ Daily Slide';
        document.getElementById('menu').classList.remove('show');
        newDaily(dailyInfo.date, dailyInfo.seed);
      });
      return;
    }
    document.getElementById('menu').classList.remove('show');
    newDaily(dailyInfo.date, dailyInfo.seed);
  }
  document.getElementById('daily-btn').addEventListener('click', playDaily);

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
    if (S.guideT > 0) { S.guideT -= dt; if (S.guideT <= 0) S.guide = null; dirty = true; }
    else if (S.guide) dirty = true;
    for (var i = S.flying.length - 1; i >= 0; i--) {
      var f = S.flying[i];
      f.t += dt; dirty = true;
      if (f.t >= f.dur) {
        S.flying.splice(i, 1);
        if (f.final) {
          // the last arrow: chime + expanding ripple — the mental reset
          try { if (S.sound) MT_Audio.final(); } catch (e) {}
          var hd = f.pts[f.pts.length - 1];
          var hc = cellCenter(hd[0], hd[1]);
          S.ripples.push({ x: hc[0] + f.dx * f.dist / cell, y: hc[1] + f.dy * f.dist / cell, t: 0, life: 1.1 });
        }
      }
    }
    for (var j = S.trails.length - 1; j >= 0; j--) {
      var tr = S.trails[j];
      tr.t += dt;
      if (tr.t > tr.life) S.trails.splice(j, 1); else dirty = true;
    }
    for (var k = S.ripples.length - 1; k >= 0; k--) {
      var r = S.ripples[k];
      r.t += dt; dirty = true;
      if (r.t >= r.life) S.ripples.splice(k, 1);
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
  fetchDaily(); // prefetch today's board in the background
  window.MT_LEVELS = LEVELS.length;
  window.MT_DEBUG = { tapCell: tapCell, getS: function () { return S; }, newLevel: newLevel, newDaily: newDaily, showGuide: showGuide };
  requestAnimationFrame(loop);

  /* ---------- Gamez Arcade: global leaderboards ----------
     Fastest solve per board. Scores are stored as (3600 - seconds) so that
     faster times rank higher; the board converts them back to m:ss. */
  var ARCADE_BASE = 'https://gamez-arcade.chaoticutopia84.workers.dev';
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
  function arcadeBoardSubmit(boardId, label, secs) {
    var box = document.getElementById('arc-lb');
    if (!box || !ARCADE_BASE || !(secs >= 0)) return;
    var score = Math.max(1, 3600 - Math.min(secs, 3599));
    box.innerHTML = '<div class="arc-lb-empty">🏆 loading times…</div>';
    var name = '';
    try { name = (localStorage.getItem('arcade_name') || '').trim(); } catch (e) {}
    function go(n) {
      box.innerHTML = '<div class="arc-lb-empty">🏆 sending…</div>';
      arcadeFetch('/score', { game: 'maze-trace', board: boardId, name: n, score: score }, function (err, res) {
        function done(top, rank) {
          var r = rank > 0 ? '<div class="arc-lb-rank">GLOBAL #' + rank + '!</div>' : '';
          box.innerHTML = r + '<div class="arc-lb-title">🏆 ' + arcadeEsc(label) + ' FASTEST</div>' + arcadeTimeHtml(top, n);
        }
        if (res && res.top) done(res.top, res.rank);
        else arcadeFetch('/scores?game=maze-trace&board=' + encodeURIComponent(boardId), null, function (e2, d2) {
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
