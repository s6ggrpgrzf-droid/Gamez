/* Gamez hub: hero canvas, player name, continue-playing rail. */
'use strict';
(function () {
  /* ---------- hero canvas: drifting dust + shooting star ---------- */
  var cv = document.getElementById('sky'), ctx = cv.getContext('2d');
  var W = 0, H = 0, parts = [], DPR = Math.min(window.devicePixelRatio || 1, 2);
  var running = true, gid = 0;
  function size() {
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function seed() {
    parts = [];
    var n = Math.min(90, Math.floor(W * H / 9000));
    for (var i = 0; i < n; i++) parts.push({
      x: Math.random() * W, y: Math.random() * H,
      r: .6 + Math.random() * 1.8,
      vy: .08 + Math.random() * .3, vx: (Math.random() - .5) * .15,
      tw: Math.random() * Math.PI * 2,
      hue: ['255,211,77', '255,95,162', '77,227,255', '200,160,255'][i % 4]
    });
  }
  var shoot = null;
  function frame(myGid) {
    if (myGid !== gid || !running) return;
    ctx.clearRect(0, 0, W, H);
    var t = performance.now() / 1000;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.x += p.vx; p.y -= p.vy;
      if (p.y < -6) { p.y = H + 6; p.x = Math.random() * W; }
      if (p.x < -6) p.x = W + 6; if (p.x > W + 6) p.x = -6;
      var a = .25 + .45 * Math.abs(Math.sin(t * 1.4 + p.tw));
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283);
      ctx.fillStyle = 'rgba(' + p.hue + ',' + a.toFixed(2) + ')'; ctx.fill();
    }
    if (!shoot && Math.random() < .006)
      shoot = { x: Math.random() * W * .7 + W * .15, y: -20, vx: -5, vy: 5, life: 1 };
    if (shoot) {
      shoot.x += shoot.vx; shoot.y += shoot.vy; shoot.life -= .02;
      var g = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - shoot.vx * 12, shoot.y - shoot.vy * 12);
      g.addColorStop(0, 'rgba(255,255,255,' + Math.max(0, shoot.life) + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y);
      ctx.lineTo(shoot.x - shoot.vx * 12, shoot.y - shoot.vy * 12); ctx.stroke();
      if (shoot.life <= 0 || shoot.y > H + 40) shoot = null;
    }
    requestAnimationFrame(function () { frame(myGid); });
  }
  function start() {
    gid++; size(); seed();
    var my = gid;
    if (running) requestAnimationFrame(function () { frame(my); });
  }
  start();
  window.addEventListener('resize', start);
  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    if (running) start();
  });

  /* ---------- marquee bulbs ---------- */
  document.querySelectorAll('.bulbs').forEach(function (row) {
    var n = Math.max(14, Math.floor(row.parentElement.clientWidth / 26));
    for (var i = 0; i < n; i++) {
      var b = document.createElement('i');
      b.style.animationDelay = (-i * .13).toFixed(2) + 's';
      row.appendChild(b);
    }
  });

  /* ---------- player name pill (shared arcade_name) ---------- */
  var pill = document.getElementById('namepill');
  function getName() {
    try { return localStorage.getItem('arcade_name') || ''; } catch (e) { return ''; }
  }
  function renderName() {
    var n = getName();
    pill.innerHTML = '🎟️ Playing as <b>' + (n ? escapeHtml(n) : 'Guest') + '</b> ✎';
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  pill.addEventListener('click', function () {
    var cur = getName();
    pill.innerHTML = '🎟️ <input id="nameedit" maxlength="16" value="' + escapeHtml(cur) + '" placeholder="your name">';
    var inp = document.getElementById('nameedit');
    inp.focus(); inp.select();
    function done(save) {
      if (save) {
        var v = inp.value.trim().slice(0, 16);
        try {
          if (v) localStorage.setItem('arcade_name', v);
          else localStorage.removeItem('arcade_name');
        } catch (e) {}
      }
      renderName();
    }
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') done(true);
      if (e.key === 'Escape') done(false);
      e.stopPropagation();
    });
    inp.addEventListener('blur', function () { done(true); });
    inp.addEventListener('click', function (e) { e.stopPropagation(); });
  });
  renderName();

  /* ---------- continue playing rail ---------- */
  function read(key) {
    try { var v = localStorage.getItem(key); return v == null ? null : v; }
    catch (e) { return null; }
  }
  function readJSON(key) {
    var v = read(key);
    if (!v) return null;
    try { return JSON.parse(v); } catch (e) { return null; }
  }
  var GAMES = [
    { id: 'candy-cascade', name: 'Candy Cascade', cls: 'art-candy-cascade' },
    { id: 'bubble-hex', name: 'Bubble Hex', cls: 'art-bubble-hex' },
    { id: 'bloom-defense', name: 'Bloom Defense', cls: 'art-bloom-defense' },
    { id: 'neon-void', name: 'Neon Void', cls: 'art-neon-void' },
    { id: 'maze-trace', name: 'Arrow Slide', cls: 'art-arrow-slide' },
    { id: 'life-story', name: 'Life Story', cls: 'art-life-story' },
    { id: 'reel-empire', name: 'Reel Empire', cls: 'art-reel-empire' },
    { id: 'pdawg', name: 'Pdawg Puzzles', cls: 'art-pdawg' },
    { id: 'word-well', name: 'Word Well', cls: 'art-word-well' }
  ];
  function progressFor(id) {
    // returns {label, frac} or null
    try {
      if (id === 'candy-cascade') {
        var c = readJSON('cc_progress_v1'); if (!c) return null;
        var stars = 0, keys = c.stars || {};
        Object.keys(keys).forEach(function (k) { stars += +keys[k] || 0; });
        return { label: 'Level ' + (c.unlocked || 1) + ' of 25 · ★' + stars, frac: ((c.unlocked || 1) - 1) / 25 };
      }
      if (id === 'bubble-hex') {
        var b = readJSON('bubblehex'); if (!b) return null;
        var unlocked = 0, bst = 0;
        Object.keys(b).forEach(function (k) {
          if (k === 'muted' || k === 'name') return;
          if (b[k]) { unlocked++; bst += (typeof b[k] === 'number' ? b[k] : 0); }
        });
        if (!unlocked) return null;
        return { label: 'Level ' + unlocked + ' of 30 · ★' + bst, frac: unlocked / 30 };
      }
      if (id === 'bloom-defense') {
        var bb = +(read('bloom2_best') || 0); if (!bb) return null;
        return { label: 'Best ' + bb.toLocaleString(), frac: Math.min(1, bb / 50000) };
      }
      if (id === 'neon-void') {
        var nv = +(read('nv_best') || 0); if (!nv) return null;
        return { label: 'Best ' + nv.toLocaleString(), frac: Math.min(1, nv / 100000) };
      }
      if (id === 'maze-trace') {
        var m = readJSON('as_progress'); if (!m) return null;
        var cl = m.cleared || m.best || 0;
        if (!cl) return null;
        return { label: cl + ' boards cleared', frac: Math.min(1, cl / 24) };
      }
      if (id === 'life-story') {
        var l = readJSON('lifestory'); if (!l) return null;
        var lives = l.lives || 0, wins = l.wins || 0;
        if (!lives) return null;
        return { label: lives + ' lives · 🏆' + wins, frac: Math.min(1, wins / 4) };
      }
      if (id === 'reel-empire') {
        var r = readJSON('reel-empire-v1'); if (!r || r.cash == null) return null;
        return { label: '$' + Math.round(r.cash) + 'M studio', frac: Math.min(1, r.cash / 1000) };
      }
      if (id === 'pdawg') {
        var p = readJSON('pdawg-daily');
        var today = new Date().toISOString().slice(0, 10);
        if (p && p.date === today && p.ms != null) {
          var s = Math.round(p.ms / 1000);
          var mm = Math.floor(s / 60), ss = ('' + (s % 60)).padStart(2, '0');
          return { label: "Today's daily: " + mm + ':' + ss, frac: 1 };
        }
        var t = readJSON('pdawg-table');
        if (t) return { label: 'Puzzle in progress', frac: .5 };
        return null;
      }
      if (id === 'word-well') {
        var w = readJSON('ww_streak_v1');
        if (!w || !w.count) return null;
        return { label: '🔥 ' + w.count + '-day streak', frac: Math.min(1, w.count / 30) };
      }
    } catch (e) { return null; }
    return null;
  }
  var rail = document.getElementById('rail'), any = false;
  GAMES.forEach(function (g) {
    var pr = progressFor(g.id);
    if (!pr) return;
    any = true;
    var a = document.createElement('a');
    a.className = 'chip ' + g.cls; a.href = './' + g.id + '/';
    a.innerHTML = '<div class="scrim"></div><div class="info"><b>' +
      escapeHtml(g.name) + '</b><span>' + escapeHtml(pr.label) + '</span></div>';
    rail.appendChild(a);
  });
  if (any) document.getElementById('continue').style.display = 'block';

  /* ---------- per-card progress bars ---------- */
  document.querySelectorAll('.card[data-game]').forEach(function (card) {
    var pr = progressFor(card.getAttribute('data-game'));
    if (!pr) return;
    var bar = card.querySelector('.pbar i');
    if (bar) bar.style.width = Math.round(pr.frac * 100) + '%';
    var lab = card.querySelector('.prog');
    if (lab) lab.textContent = pr.label;
  });
})();
