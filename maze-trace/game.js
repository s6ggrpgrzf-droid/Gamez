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
    day:   { bg: '#f6f1e3', ink: '#6f4f33', inkDeep: '#453322', faint: 'rgba(111,79,51,.28)', gold: '#c08a2d',
             goldDeep: '#8f6520', sub: '#a58a73', drop: '#4da3ff', paper: '#fffdf8', grain: '111,79,51',
             card: '#fffdf6', cardEdge: '#e3d5b8', vignette: 'rgba(111,79,51,.10)' },
    night: { bg: '#221b13', ink: '#d9c9a4', inkDeep: '#9d8a68', faint: 'rgba(217,201,164,.25)', gold: '#e0a83e',
             goldDeep: '#a97c26', sub: '#8d7c63', drop: '#4da3ff', paper: '#2e2417', grain: '217,201,164',
             card: '#33291a', cardEdge: '#5a4a30', vignette: 'rgba(0,0,0,.28)' },
  };
  function theme() { return THEMES[S && S.theme || 'day']; }
  function loadPref(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function savePref(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* reduced motion: calm the oscillation, never the gameplay */
  var REDUCED = (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || false;

  /* Haptics: feather-light taps, fully guarded so they can never throw.
   * iOS Safari has no navigator.vibrate — the typeof guard covers that.
   * Respects the settings toggle (S.haptic) and prefers-reduced-motion. */
  function haptic(pattern) {
    if (REDUCED) return;
    if (!S || !S.haptic) return;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch (e) {}
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', S.theme);
    buildGrain();
    buildStatic();
    document.getElementById('sound-btn').textContent = S.sound ? '🔊' : '🔇';
    document.getElementById('haptic-btn').textContent = S.haptic ? '📳' : '📴';
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

  /* ---------- brush-ink rendering ----------
   * The whole board (paper card + dots + arrows) is painted once into an
   * offscreen layer at fixed resolution (LR px per maze unit) and blitted
   * each frame. Arrows never overlap — every cell belongs to exactly one
   * arrow — so a released arrow is erased incrementally from the layer
   * instead of rebuilding it. Dynamic things (flying arrows, guide lane,
   * particles) draw on top every frame. */
  var LR = 112;        // layer px per maze unit (2x the 56px cell)
  var LPAD = 0.7;      // paper margin around the board, in units
  var layer = null;

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function polyPath(g, pts) {
    g.beginPath();
    for (var i = 0; i < pts.length; i++) {
      if (i === 0) g.moveTo(pts[i][0], pts[i][1]); else g.lineTo(pts[i][0], pts[i][1]);
    }
  }

  /* Paint one arrow as layered brush strokes. pts are in the target
   * context's pixels. o: { w (base width px), ink, deep, seed, alpha, mode }
   * mode 'full': wash + tapered jittered core + dry-brush edge + head.
   * mode 'wash': the pale wash pass only (halos, ghost previews). */
  function paintBrush(g, pts, o) {
    var n = pts.length;
    if (n < 2) return;
    var alpha = o.alpha == null ? 1 : o.alpha;
    var STEPS = 5, sub = [], i, s2;
    for (i = 0; i < n - 1; i++) {
      for (s2 = 0; s2 < STEPS; s2++) {
        var t0 = s2 / STEPS, t1 = (s2 + 1) / STEPS;
        sub.push([
          [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t0, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t0],
          [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t1, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t1],
          (i + t0) / (n - 1), (i + t1) / (n - 1)
        ]);
      }
    }
    function widthAt(t) { return o.w * (0.42 + 0.58 * Math.pow(t, 0.65)); }
    var rng = mulberry32((o.seed == null ? 1 : o.seed) >>> 0);
    var jits = [];
    for (i = 0; i < sub.length; i++) jits.push((rng() - 0.5) * o.w * 0.16);
    g.save();
    g.lineCap = 'round';
    function segPath(k, off) {
      var sg = sub[k], dx = sg[1][0] - sg[0][0], dy = sg[1][1] - sg[0][1];
      var len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, jo = off + jits[k];
      g.beginPath();
      g.moveTo(sg[0][0] + nx * jo, sg[0][1] + ny * jo);
      g.lineTo(sg[1][0] + nx * jo, sg[1][1] + ny * jo);
    }
    // pass 1: pale wash halo
    var washA = o.washA == null ? 0.16 : o.washA;
    g.strokeStyle = hexA(o.ink, washA * alpha);
    g.lineWidth = o.w * 1.7;
    polyPath(g, pts); g.stroke();
    if (o.mode === 'wash') { g.restore(); return; }
    // pass 2: tapered core, jittered like a hand
    for (i = 0; i < sub.length; i++) {
      g.strokeStyle = hexA(o.ink, 0.92 * alpha);
      g.lineWidth = Math.max(0.75, widthAt((sub[i][2] + sub[i][3]) / 2));
      segPath(i, 0); g.stroke();
    }
    // pass 3: dry-brush edge, darker, offset to one side
    for (i = 0; i < sub.length; i++) {
      g.strokeStyle = hexA(o.deep, 0.42 * alpha);
      g.lineWidth = Math.max(0.5, widthAt((sub[i][2] + sub[i][3]) / 2) * 0.45);
      segPath(i, o.w * 0.16); g.stroke();
    }
    // head: filled triangle + darker spine
    var hd = pts[n - 1], pv = pts[n - 2];
    var ang = Math.atan2(hd[1] - pv[1], hd[0] - pv[0]);
    var hl = o.w * 2.9, hw = o.w * 2.3;
    g.save(); g.translate(hd[0], hd[1]); g.rotate(ang);
    g.fillStyle = hexA(o.ink, 0.95 * alpha);
    g.beginPath();
    g.moveTo(hl * 0.75, 0); g.lineTo(-hl * 0.35, -hw * 0.5); g.lineTo(-hl * 0.35, hw * 0.5);
    g.closePath(); g.fill();
    g.strokeStyle = hexA(o.deep, 0.5 * alpha); g.lineWidth = Math.max(0.75, o.w * 0.14);
    g.beginPath(); g.moveTo(hl * 0.6, 0); g.lineTo(-hl * 0.3, 0); g.stroke();
    g.restore();
    g.restore();
  }

  /* deckled paper edge: jittered polygon around the board card, stable per board */
  var DECKLE_SEG = 9;
  function decklePath(g, R) {
    var b = S.board, pad = LPAD, j = S.deckle, pts = [];
    function edge(x0, y0, x1, y1, k0) {
      for (var i = 0; i <= DECKLE_SEG; i++) {
        var t = i / DECKLE_SEG, nx = -(y1 - y0), ny = (x1 - x0);
        var len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
        var off = j[(k0 + i) % j.length] * 0.09;
        pts.push([(x0 + (x1 - x0) * t + nx * off + pad) * R, (y0 + (y1 - y0) * t + ny * off + pad) * R]);
      }
    }
    edge(-pad, -pad, b.w + pad, -pad, 0);
    edge(b.w + pad, -pad, b.w + pad, b.h + pad, DECKLE_SEG + 1);
    edge(b.w + pad, b.h + pad, -pad, b.h + pad, 2 * (DECKLE_SEG + 1));
    edge(-pad, b.h + pad, -pad, -pad, 3 * (DECKLE_SEG + 1));
    polyPath(g, pts); g.closePath();
  }

  function paintDots(g, R) {
    var b = S.board, T = theme();
    g.fillStyle = T.faint;
    for (var gy = 0; gy <= b.h; gy++) for (var gx = 0; gx <= b.w; gx++) {
      g.beginPath();
      g.arc((gx + LPAD) * R, (gy + LPAD) * R, Math.max(1, R * 0.028), 0, 7);
      g.fill();
    }
  }

  function paintArrowOn(g, id, a, R, T) {
    paintBrush(g, a.pts.map(function (c) {
      return [((c[0] + 0.5) + LPAD) * R, ((c[1] + 0.5) + LPAD) * R];
    }), { w: R * 0.13, ink: T.ink, deep: T.inkDeep, seed: hashStr(id) });
  }

  function buildStatic() {
    if (!S) return;
    var b = S.board, T = theme(), R = LR;
    if (!layer) layer = document.createElement('canvas');
    layer.width = Math.ceil((b.w + 2 * LPAD) * R);
    layer.height = Math.ceil((b.h + 2 * LPAD) * R);
    var g = layer.getContext('2d');
    g.clearRect(0, 0, layer.width, layer.height);
    // soft shadow: expanding dark strokes behind the card (no ctx.filter — old Safari)
    g.save(); g.lineJoin = 'round';
    [[30, 0.05], [18, 0.08], [9, 0.12]].forEach(function (sw) {
      decklePath(g, R);
      g.strokeStyle = 'rgba(60,42,26,' + sw[1].toFixed(2) + ')';
      g.lineWidth = sw[0];
      g.stroke();
    });
    g.restore();
    // the paper card
    decklePath(g, R); g.fillStyle = T.card; g.fill();
    decklePath(g, R); g.strokeStyle = T.cardEdge; g.lineWidth = Math.max(1.5, R * 0.03); g.stroke();
    paintDots(g, R);
    Object.keys(b.arrows).forEach(function (id) { paintArrowOn(g, id, b.arrows[id], R, T); });
  }

  /* incremental erase: repaint card + dots inside the arrow's bbox only */
  function eraseArrowFromLayer(a) {
    if (!layer || !S) return;
    var R = LR, T = theme(), m = R * 0.5;
    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    a.pts.forEach(function (c) {
      var x = ((c[0] + 0.5) + LPAD) * R, y = ((c[1] + 0.5) + LPAD) * R;
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    });
    var g = layer.getContext('2d');
    g.save();
    g.beginPath(); g.rect(minX - m, minY - m, (maxX - minX) + 2 * m, (maxY - minY) + 2 * m); g.clip();
    decklePath(g, R); g.fillStyle = T.card; g.fill();
    paintDots(g, R);
    g.restore();
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
      flying: [], trails: [], ripples: [], motes: [], splashes: [], blots: [],
      glowT: 0, shake: null,
      badFlash: null, hintKey: null, hintT: 0,
      guide: null, guideT: 0,
      deckle: null, onboardId: null,
      theme: loadPref('as_theme', 'day'),
      sound: loadPref('as_sound', '1') === '1',
      haptic: loadPref('as_haptic', '1') === '1',
    };
    // deckled-edge jitter, one stable set per board
    S.deckle = [];
    for (var di = 0; di < 4 * (DECKLE_SEG + 1); di++) S.deckle.push(Math.random() * 2 - 1);
    try { MT_Audio.setEnabled(S.sound); } catch (e) {}
    applyTheme();
    fitBoard(true);
    buildStatic();
    // first-timer onboarding: pulse one free arrow until the first release
    if (!S.daily && S.n === 1 && loadPref('as_onboarded', '0') !== '1') {
      var free = ArrowGen.freeArrows(S.board);
      if (free.length) S.onboardId = free[(Math.random() * free.length) | 0];
    }
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
      t: 0, dur: isFinal ? 1.2 : 0.42, final: isFinal,
      ribbon: isFinal ? [] : null,
    });
    ArrowGen.pathCells(b.w, b.h, a).forEach(function (cc, i) {
      var pc = cellCenter(cc[0], cc[1]);
      S.trails.push({ x: pc[0], y: pc[1], t: -i * 0.02, life: 0.5 });
    });
    // ink splash at the exit edge: droplets + a fading splat decal
    (function () {
      var hd = ArrowGen.headOf(a), hc = cellCenter(hd[0], hd[1]);
      var ex = hc[0] + ArrowGen.DX[a.dir] * cell * 0.6, ey = hc[1] + ArrowGen.DY[a.dir] * cell * 0.6;
      var srng = mulberry32(((Date.now() & 0xffff) ^ hashStr(id)) >>> 0);
      var baseA = Math.atan2(ArrowGen.DY[a.dir], ArrowGen.DX[a.dir]);
      var drops = [];
      for (var si = 0; si < 14; si++) {
        var sang = baseA + (srng() - 0.5) * 1.7;
        var spd = (0.6 + srng() * 1.7) * cell;
        drops.push({
          x: ex, y: ey, vx: Math.cos(sang) * spd, vy: Math.sin(sang) * spd,
          t: 0, life: 0.45 + srng() * 0.35, r: 1.5 + srng() * 2.6
        });
      }
      var blobs = [];
      for (var bi = 0; bi < 7; bi++) {
        blobs.push({ ang: (bi / 7) * Math.PI * 2 + srng() * 0.6, d: srng() * 0.22, r: 0.10 + srng() * 0.14 });
      }
      S.splashes.push({ drops: drops, decal: { x: ex, y: ey, t: 0, life: 1.3, blobs: blobs }, gold: isFinal });
    })();
    // soft placement pulse: a slow, low-alpha gold ring breathing out from
    // the tail cell where the arrow was lifted from
    var tl = a.pts[0], tc = cellCenter(tl[0], tl[1]);
    S.ripples.push({ x: tc[0], y: tc[1], t: 0, life: 1.6, maxA: 0.22, grow: 2.4 });
    eraseArrowFromLayer(a);
    ArrowGen.removeArrow(b, id);
    S.cleared++;
    S.hintKey = null; S.guide = null;
    if (S.onboardId) { S.onboardId = null; savePref('as_onboarded', '1'); }
    try { if (S.sound) MT_Audio.slide(); } catch (e) {}
    haptic([10]);
    updateHUD();
    if (Object.keys(b.arrows).length === 0) win();
    else draw();
  }

  function wrongTap(id) {
    S.mistakes++;
    S.lives--;
    // a wrong tap: the smallest possible shake + an ink blot that spreads and fades
    S.shake = { t: 0, dur: 0.22, mag: REDUCED ? 0 : 4 };
    S.badFlash = { id: id, t: 0 };
    (function () {
      var a = S.board.arrows[id];
      if (!a) return;
      var hd = ArrowGen.headOf(a), hc = cellCenter(hd[0], hd[1]);
      var brng = mulberry32(((Date.now() & 0xffff) ^ hashStr(id + 'blot')) >>> 0);
      var blobs = [];
      for (var bi = 0; bi < 8; bi++) {
        blobs.push({ ang: (bi / 8) * Math.PI * 2 + brng() * 0.6, d: brng() * 0.25, r: 0.12 + brng() * 0.16 });
      }
      S.blots.push({ x: hc[0], y: hc[1], t: 0, life: 1.4, blobs: blobs });
    })();
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
    haptic([10, 40, 10]);
    // warm win glow + drifting motes: the glow breathes for a while, the motes
    // drift up and fade; both live behind the win card
    S.glowT = REDUCED ? 0.08 : 0.0001; // reduced motion: one faint static wash, no breathing
    for (var m = 0; m < 16; m++) {
      S.motes.push({
        x: Math.random() * W, y: H * 0.25 + Math.random() * H * 0.75,
        vx: (Math.random() - 0.5) * 10, vy: -(8 + Math.random() * 14),
        r: 1.5 + Math.random() * 2.5, ph: Math.random() * 7,
        t: -Math.random() * 2.5, life: 7 + Math.random() * 5,
        rect: m % 3 === 0, // every third mote is a tumbling paper fleck
        col: [theme().gold, theme().sub, theme().ink][m % 3]
      });
    }
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
  // screen-space pixel centers of an arrow's cells
  function arrowScreenPts(a) {
    return a.pts.map(function (c) {
      var p = cellCenter(c[0], c[1]);
      return toScreen(p[0], p[1]);
    });
  }

  // irregular ink blob from precomputed lobes; unitR scales the whole blob
  function blob(g, q, lobes, unitR, color, alpha, growT) {
    if (alpha <= 0.004) return;
    g.fillStyle = hexA(color, Math.max(0, Math.min(1, alpha)));
    var gr = 0.35 + 0.65 * Math.min(1, growT * 3);
    lobes.forEach(function (lb) {
      g.beginPath();
      g.arc(q[0] + Math.cos(lb.ang) * lb.d * unitR, q[1] + Math.sin(lb.ang) * lb.d * unitR,
        Math.max(0.5, unitR * lb.r * gr), 0, 7);
      g.fill();
    });
  }

  function draw() {
    var T = theme();
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, W, H);
    if (grainTile) {
      ctx.fillStyle = ctx.createPattern(grainTile, 'repeat');
      ctx.fillRect(0, 0, W, H);
    }
    // vignette: darker edges pull the eye to the board
    var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, T.vignette);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    if (!S) return;
    // win glow: warm gold light that breathes — faint, slow, sleepy
    if (S.won && S.glowT > 0) {
      var breathe = REDUCED ? 0.075 : 0.06 + 0.035 * (0.5 + 0.5 * Math.sin(S.glowT * 2 * Math.PI / 4.5));
      var grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
      grad.addColorStop(0, hexA(T.gold, breathe));
      grad.addColorStop(1, hexA(T.gold, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.save();
    // wrong-tap shake: tiny, damped, gone in a blink
    if (S.shake && S.shake.mag > 0 && S.shake.t < S.shake.dur) {
      var sp = 1 - S.shake.t / S.shake.dur;
      ctx.translate((Math.random() - 0.5) * S.shake.mag * sp, (Math.random() - 0.5) * S.shake.mag * sp);
    }
    var b = S.board;
    // the pre-painted board: paper card, dots, all arrows
    if (layer) {
      ctx.drawImage(layer,
        panX - LPAD * cell * zoom, panY - LPAD * cell * zoom,
        (b.w + 2 * LPAD) * cell * zoom, (b.h + 2 * LPAD) * cell * zoom);
    }

    // onboarding: one free arrow breathes gold until the first release
    if (S.onboardId && b.arrows[S.onboardId]) {
      var oa = b.arrows[S.onboardId];
      var op = REDUCED ? 0.4 : 0.3 + 0.22 * Math.sin(Date.now() / 430);
      paintBrush(ctx, arrowScreenPts(oa),
        { w: cell * zoom * 0.13, ink: T.gold, deep: T.goldDeep, seed: 7, mode: 'wash', washA: op });
      var ohd = ArrowGen.headOf(oa);
      var oq = toScreen((ohd[0] + 0.5) * cell, (ohd[1] + 0.5) * cell);
      var orr = (Date.now() / 1300) % 1;
      ctx.strokeStyle = hexA(T.gold, (1 - orr) * 0.65);
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(oq[0], oq[1], 6 + orr * cell * zoom * 0.5, 0, 7); ctx.stroke();
    }

    // hint halo: gold wash breathing over the hinted arrow
    if (S.hintKey && b.arrows[S.hintKey]) {
      var ha = b.arrows[S.hintKey];
      var hp = REDUCED ? 0.34 : 0.27 + 0.13 * Math.sin(Date.now() / 900);
      paintBrush(ctx, arrowScreenPts(ha),
        { w: cell * zoom * 0.13, ink: T.gold, deep: T.goldDeep, seed: hashStr(S.hintKey), mode: 'wash', washA: hp });
    }

    // guidance lane (long-press preview): soft wash + chevrons marching to the exit
    if (S.guide) {
      var ga = b.arrows[S.guide.id];
      if (ga) {
        var ghd = ArrowGen.headOf(ga);
        var lane = S.guide.cells.map(function (c) { var p = cellCenter(c[0], c[1]); return toScreen(p[0], p[1]); });
        lane.unshift(toScreen((ghd[0] + 0.5) * cell, (ghd[1] + 0.5) * cell));
        var gcol = S.guide.blocked ? '217,64,64' : '77,163,255';
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(' + gcol + ',' + (S.guide.blocked ? 0.30 : 0.32) + ')';
        ctx.lineWidth = Math.max(3, cell * zoom * 0.10);
        polyPath(ctx, lane); ctx.stroke();
        var cum = [0], li;
        for (li = 0; li < lane.length - 1; li++) {
          cum.push(cum[li] + Math.hypot(lane[li + 1][0] - lane[li][0], lane[li + 1][1] - lane[li][1]));
        }
        var totalLen = cum[cum.length - 1];
        var csp = Math.max(20, cell * zoom * 0.55);
        var march = REDUCED ? 0 : (Date.now() / 26) % csp;
        ctx.strokeStyle = 'rgba(' + gcol + ',0.85)';
        ctx.lineWidth = Math.max(2, cell * zoom * 0.055);
        for (var dpos = march + csp * 0.5; dpos < totalLen; dpos += csp) {
          var si = 0;
          while (si < cum.length - 2 && cum[si + 1] < dpos) si++;
          var segL = (cum[si + 1] - cum[si]) || 1;
          var gt = (dpos - cum[si]) / segL;
          var gx = lane[si][0] + (lane[si + 1][0] - lane[si][0]) * gt;
          var gy = lane[si][1] + (lane[si + 1][1] - lane[si][1]) * gt;
          var gta = Math.atan2(lane[si + 1][1] - lane[si][1], lane[si + 1][0] - lane[si][0]);
          var cs = Math.max(5, cell * zoom * 0.15);
          ctx.beginPath();
          ctx.moveTo(gx - Math.cos(gta - 0.5) * cs, gy - Math.sin(gta - 0.5) * cs);
          ctx.lineTo(gx, gy);
          ctx.lineTo(gx - Math.cos(gta + 0.5) * cs, gy - Math.sin(gta + 0.5) * cs);
          ctx.stroke();
        }
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
      var ta = Math.max(0, 1 - tr.t / tr.life);
      var tp = toScreen(tr.x, tr.y);
      ctx.fillStyle = hexA(T.ink, ta * 0.30);
      ctx.beginPath(); ctx.arc(tp[0], tp[1], cell * zoom * 0.28 * ta + 1.5, 0, 7); ctx.fill();
    });

    // wrong-tap flash: red brush painted over the layer's ink arrow
    if (S.badFlash && b.arrows[S.badFlash.id]) {
      var bfa = b.arrows[S.badFlash.id];
      var bfp = Math.max(0, 1 - S.badFlash.t / 0.6);
      paintBrush(ctx, arrowScreenPts(bfa),
        { w: cell * zoom * 0.13, ink: '#d94040', deep: '#8f2424', seed: hashStr(S.badFlash.id), alpha: 0.35 + 0.65 * bfp });
    }

    // flying arrows — the final one glides on a smoothstep ease (slow start,
    // slow landing) instead of the snappier easeOut used for the rest
    S.flying.forEach(function (f) {
      var fx = Math.min(1, f.t / f.dur);
      var p = f.final ? fx * fx * (3 - 2 * fx) : 1 - Math.pow(1 - fx, 2);
      var ox = f.dx * f.dist * p, oy = f.dy * f.dist * p;
      var moved = f.pts.map(function (c) {
        var q = cellCenter(c[0] + ox / cell, c[1] + oy / cell);
        return toScreen(q[0], q[1]);
      });
      // gold ribbon unfurling behind the final arrow
      if (f.final && f.ribbon && f.ribbon.length > 1) {
        ctx.save(); ctx.lineCap = 'round';
        for (var ri = 1; ri < f.ribbon.length; ri++) {
          var rfr = ri / f.ribbon.length;
          ctx.strokeStyle = hexA(T.gold, 0.45 * rfr * (1 - p * 0.4));
          ctx.lineWidth = Math.max(1, cell * zoom * 0.09 * rfr);
          ctx.beginPath();
          ctx.moveTo(f.ribbon[ri - 1][0], f.ribbon[ri - 1][1]);
          ctx.lineTo(f.ribbon[ri][0], f.ribbon[ri][1]);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = f.final ? Math.max(0, 1 - p * 0.9) : 1 - p * 0.55;
      paintBrush(ctx, moved, {
        w: cell * zoom * 0.13, ink: f.final ? T.gold : T.ink,
        deep: f.final ? T.goldDeep : T.inkDeep, seed: 99
      });
      ctx.restore();
    });

    // ink splashes: droplets + a fading splat decal at the exit edge
    S.splashes.forEach(function (sp2) {
      var spInk = sp2.gold ? T.gold : T.ink;
      var dc = sp2.decal;
      if (dc.t < dc.life) {
        blob(ctx, toScreen(dc.x, dc.y), dc.blobs, cell * zoom, spInk, (1 - dc.t / dc.life) * 0.30, dc.t);
      }
      sp2.drops.forEach(function (dr) {
        if (dr.t >= dr.life) return;
        var da = 1 - dr.t / dr.life;
        var dq = toScreen(dr.x, dr.y);
        ctx.fillStyle = hexA(spInk, da * 0.75);
        ctx.beginPath(); ctx.arc(dq[0], dq[1], Math.max(0.4, dr.r * (cell * zoom / 56) * da), 0, 7); ctx.fill();
      });
    });

    // wrong-tap ink blots: spread, then fade
    S.blots.forEach(function (bl) {
      var bap = bl.t < 0.9 ? 0.45 : Math.max(0, 0.45 * (1 - (bl.t - 0.9) / 0.5));
      blob(ctx, toScreen(bl.x, bl.y), bl.blobs, cell * zoom, '#8a2a2a', bap, bl.t);
    });

    // soft ripples — placement pulses (low alpha, wide) and the final ripple
    S.ripples.forEach(function (r) {
      var rp = r.t / r.life;
      var rq = toScreen(r.x, r.y);
      ctx.strokeStyle = hexA(T.gold, (1 - rp) * (r.maxA == null ? 0.6 : r.maxA));
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(rq[0], rq[1], 8 + rp * cell * zoom * (r.grow == null ? 1.6 : r.grow), 0, 7); ctx.stroke();
    });

    // drifting motes on win: warm specks and paper flecks floating up
    S.motes.forEach(function (mo) {
      if (mo.t < 0) return;
      var ma = Math.sin(Math.PI * Math.min(1, mo.t / mo.life)) * 0.35;
      if (mo.rect) {
        ctx.save(); ctx.translate(mo.x, mo.y); ctx.rotate(mo.ph + mo.t * 0.4);
        ctx.fillStyle = hexA(mo.col, ma);
        ctx.fillRect(-mo.r, -mo.r * 0.6, mo.r * 2, mo.r * 1.2);
        ctx.restore();
      } else {
        ctx.fillStyle = hexA(T.gold, ma);
        ctx.beginPath(); ctx.arc(mo.x, mo.y, mo.r, 0, 7); ctx.fill();
      }
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
      (function () {
        var n = S.n, el = document.getElementById('lvl-label');
        levelEpithet(n, function (ep) {
          // only apply if the player hasn't moved on to another level meanwhile
          if (!S.daily && S.n === n && el) el.textContent = 'Level ' + n + ' · ' + ep;
        });
      })();
      document.getElementById('diff-label').textContent = S.L.diff;
    }
    document.getElementById('clear-label').textContent = S.cleared + '/' + S.total;
    var prog = document.getElementById('prog-fill');
    if (prog) prog.style.width = (S.total ? Math.round(100 * S.cleared / S.total) : 0) + '%';
    var drops = document.querySelectorAll('#lives .drop');
    for (var i = 0; i < drops.length; i++) {
      drops[i].classList.toggle('lost', i >= S.lives);
    }
  }
  function hideOverlays() {
    ['win-modal', 'lives-modal', 'map-modal'].forEach(function (id) {
      document.getElementById(id).classList.remove('show');
    });
  }
  function showWin(stars, secs) {
    document.getElementById('win-stars').innerHTML =
      '<span class="on">' + '★'.repeat(stars) + '</span><span class="off">' + '★'.repeat(3 - stars) + '</span>';
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
  /* level-map thumbnails: seeded mini boards, painted once per theme and cached */
  var thumbCache = {};
  function drawThumb(cv, th, T) {
    var g = cv.getContext('2d');
    var cw = cv.width, ch = cv.height;
    g.clearRect(0, 0, cw, ch);
    var s = Math.min(cw / (th.w + 1.2), ch / (th.h + 1.2));
    var ox = (cw - th.w * s) / 2, oy = (ch - th.h * s) / 2;
    th.a.forEach(function (ar, i) {
      var pts = [];
      for (var k = 1; k < ar.length; k++) {
        var v = ar[k];
        pts.push([ox + ((((v / 32) | 0) + 0.5) * s), oy + (((v % 32) + 0.5) * s)]);
      }
      paintBrush(g, pts, { w: Math.max(1.1, s * 0.15), ink: T.ink, deep: T.inkDeep, seed: 5000 + i * 13 });
    });
  }
  function showMap() {
    var p = best(), T = theme();
    var grid = document.getElementById('map-grid');
    grid.innerHTML = '';
    var thumbs = window.MT_THUMBS || [];
    LEVELS.forEach(function (L) {
      var b = document.createElement('button');
      b.className = 'map-cell' + (p[L.n] ? ' done' : '') + (L.n === S.n && !S.daily ? ' cur' : '');
      var stars = '★'.repeat(p[L.n] || 0);
      b.innerHTML = '<canvas class="mc-thumb" width="72" height="72"></canvas>' +
        '<span class="mc-n">' + L.n + '</span><span class="mc-s">' + (stars || L.diff) + '</span>';
      b.addEventListener('click', function () { newLevel(L.n); });
      grid.appendChild(b);
      var th = thumbs[L.n - 1];
      if (th) {
        var key = L.n + ':' + S.theme;
        var cv = b.querySelector('.mc-thumb');
        if (!thumbCache[key]) {
          drawThumb(cv, th, T);
          var cc = document.createElement('canvas');
          cc.width = cv.width; cc.height = cv.height;
          cc.getContext('2d').drawImage(cv, 0, 0);
          thumbCache[key] = cc;
        } else {
          cv.getContext('2d').drawImage(thumbCache[key], 0, 0);
        }
      }
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
  document.getElementById('haptic-btn').addEventListener('click', function () {
    S.haptic = !S.haptic;
    savePref('as_haptic', S.haptic ? '1' : '0');
    try { if (S.sound) MT_Audio.click(); } catch (e) {}
    document.getElementById('haptic-btn').textContent = S.haptic ? '📳' : '📴';
    haptic([10]); // feather-light confirmation
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
    if (S.badFlash) { S.badFlash.t += dt; if (S.badFlash.t > 0.6) S.badFlash = null; dirty = true; }
    if (S.shake && S.shake.t < S.shake.dur) { S.shake.t += dt; dirty = true; }
    if (S.onboardId) dirty = true; // breathing halo + tap ring animate
    for (var si = S.splashes.length - 1; si >= 0; si--) {
      var sp = S.splashes[si], spLive = false;
      sp.decal.t += dt;
      if (sp.decal.t < sp.decal.life) spLive = true;
      for (var di = 0; di < sp.drops.length; di++) {
        var dr = sp.drops[di];
        if (dr.t < dr.life) {
          spLive = true;
          dr.t += dt;
          dr.vy += 300 * dt; // maze-px gravity
          dr.x += dr.vx * dt; dr.y += dr.vy * dt;
        }
      }
      if (spLive) dirty = true; else S.splashes.splice(si, 1);
    }
    for (var bi = S.blots.length - 1; bi >= 0; bi--) {
      var bl = S.blots[bi];
      bl.t += dt;
      if (bl.t >= bl.life) S.blots.splice(bi, 1); else dirty = true;
    }
    if (S.hintT > 0) { S.hintT -= dt; if (S.hintT <= 0) S.hintKey = null; dirty = true; }
    else if (S.hintKey) dirty = true;
    if (S.guideT > 0) { S.guideT -= dt; if (S.guideT <= 0) S.guide = null; dirty = true; }
    else if (S.guide) dirty = true;
    for (var i = S.flying.length - 1; i >= 0; i--) {
      var f = S.flying[i];
      f.t += dt; dirty = true;
      if (f.final && f.ribbon) {
        // record the head's screen trail for the gold ribbon
        var fhd = f.pts[f.pts.length - 1];
        var fx2 = Math.min(1, f.t / f.dur);
        var fp = fx2 * fx2 * (3 - 2 * fx2);
        var hq = cellCenter(fhd[0] + f.dx * f.dist * fp / cell, fhd[1] + f.dy * f.dist * fp / cell);
        f.ribbon.push(toScreen(hq[0], hq[1]));
        if (f.ribbon.length > 42) f.ribbon.shift();
      }
      if (f.t >= f.dur) {
        S.flying.splice(i, 1);
        if (f.final) {
          // the last arrow: chime + expanding ripple — the mental reset
          try { if (S.sound) MT_Audio.final(); } catch (e) {}
          var hd = f.pts[f.pts.length - 1];
          var hc = cellCenter(hd[0], hd[1]);
          S.ripples.push({ x: hc[0] + f.dx * f.dist / cell, y: hc[1] + f.dy * f.dist / cell, t: 0, life: 1.1, maxA: 0.6, grow: 1.6 });
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
    // win ambience: the glow breathes for ~25s, the motes drift up and fade.
    // (reduced motion: glow was set static at win; motes hang still)
    if (S.won && !REDUCED && S.glowT < 25) {
      S.glowT += dt; dirty = true;
      for (var m2 = S.motes.length - 1; m2 >= 0; m2--) {
        var mo = S.motes[m2];
        mo.t += dt;
        if (mo.t >= 0) {
          mo.x += (mo.vx + Math.sin(mo.t * 0.8 + mo.ph) * 6) * dt;
          mo.y += mo.vy * dt;
        }
        if (mo.t > mo.life) S.motes.splice(m2, 1); else dirty = true;
      }
    }
    if (dirty || !S._drawn) { draw(); S._drawn = true; }
  }

  /* ---------- Gamez Arcade flavor text (shared backend; silent local fallback).
     Placed BEFORE the boot block: updateHUD() -> levelEpithet() runs during boot,
     and `var` assignments below the boot line would still be undefined at that
     point (the game.js:734 crash). ---------- */
  var AI_BASE = 'https://gamez-ai.chaoticutopia84.workers.dev';
  var TITLE_KEY = 'mazetrace_titles';
  function titleCache() {
    try { return JSON.parse(localStorage.getItem(TITLE_KEY) || '{}'); } catch (e) { return {}; }
  }
  function aiFetch(kind, ctx2, cb) {
    var done = false, timer = null;
    function fin(t) { if (!done) { done = true; if (timer) clearTimeout(timer); cb(t); } }
    timer = setTimeout(function () { fin(null); }, 7000);
    try {
      fetch(AI_BASE + '/g', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: kind, game: 'maze-trace', ctx: ctx2 })
      }).then(function (r) { return r.json(); })
        .then(function (d) { fin(d && d.text ? d.text : null); })
        .catch(function () { fin(null); });
    } catch (e) { fin(null); }
  }
  var TITLE_FALLBACKS = [
    'Still Water', 'The Long Turn', 'Quiet Geometry', 'Paper Path', 'Gentle Bend',
    'Morning Line', 'Soft Corner', 'The Patient Curve', 'Ink Trail', 'Calm Crossing',
    'Slow River', 'The Winding Way', 'Dusk Line', 'Pebble Path', 'Silent Arrow',
    'The Deep Breath', 'Meadow Walk', 'Still Point', 'The Far Turn', 'Low Tide',
    'Paper Crane', 'The Quiet Mile', 'Drift', 'Arrive'
  ];
  var titleFetching = {};
  function levelEpithet(n, cb) {
    var cache = titleCache();
    if (cache[n]) { cb(cache[n]); return; }
    cb(TITLE_FALLBACKS[n % TITLE_FALLBACKS.length]);
    if (titleFetching[n]) return;
    titleFetching[n] = true;
    aiFetch('title', { level: n }, function (t) {
      titleFetching[n] = false;
      if (!t) return;
      try {
        var c = titleCache(); c[n] = t;
        localStorage.setItem(TITLE_KEY, JSON.stringify(c));
      } catch (e) {}
      cb(t);
    });
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
  /* flavor-text helpers (AI_BASE, TITLE_KEY, aiFetch, TITLE_FALLBACKS, levelEpithet)
     were moved above the boot block — boot calls them via updateHUD(). */
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
