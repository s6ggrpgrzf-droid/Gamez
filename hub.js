/* Gamez hub: hero canvas, player name, continue-playing rail. */
'use strict';
(function () {
  document.documentElement.classList.add('js');
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
      /* Atlas 7: ambient dust is monochrome — ice and warm-white only.
         Saturated specks read as dead pixels at chart scale; on this page
         color is information, and it belongs to the stars alone */
      hue: ['205,228,255', '255,240,216', '228,238,255', '255,226,178'][i % 4]
    });
  }
  var shoot = null;
  var shootForced = false;
  document.addEventListener('sky-shoot', function () { shootForced = true; });
  function phaseOf(h) { return h >= 5 && h < 11 ? 0 : h >= 11 && h < 17 ? 1 : h >= 17 && h < 22 ? 2 : 3; }
  function hx(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')'; }
  /* celestial body: one sun/moon that re-casts itself per phase —
     creeps up at dawn, hangs high at noon, sinks ember at dusk, moon at night */
  var cel = {
    x: -200, y: -200, r: 30, a: 0, disc: hx('#ffd97a'), glow: hx('#ffbe5a'),
    tx: 0, ty: 0, tr: 30, tdisc: hx('#ffd97a'), tglow: hx('#ffbe5a'), moon: false, tmoon: false
  };
  var celFade = 1; /* Atlas 1: eased scroll fade, 1 at the hero */
  /* Observatory 3: parallax state — the field's document position is
     cached at measure time so the frame loop never forces layout */
  var fieldEl = document.querySelector('.field');
  var fieldTopDoc = -1, fieldH = 0, drift = 0, driftApplied = 0;
  function measureField() {
    if (!fieldEl) return;
    var r = fieldEl.getBoundingClientRect();
    fieldTopDoc = r.top + (window.scrollY || window.pageYOffset || 0) - driftApplied;
    fieldH = r.height;
  }
  var lastPhase = -1;
  /* the celestial disc must never sit on the words: measure the hero's
     content rects (headline, surprise button) in canvas coords and let
     aimCel steer the disc clear of them at narrow widths */
  var clearRects = [];
  var heroBand = 0;
  function measureHero() {
    var hr = cv.getBoundingClientRect();
    var heroEl = document.querySelector('.hero');
    heroBand = heroEl ? heroEl.offsetHeight : 0;
    var out = [];
    ['opendoor', 'surprise'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var r = el.getBoundingClientRect();
      out.push({ l: r.left - hr.left, t: r.top - hr.top, r: r.right - hr.left, b: r.bottom - hr.top });
    });
    clearRects = out;
  }
  function circleHits(cx, cy, rad) {
    for (var i = 0; i < clearRects.length; i++) {
      var q = clearRects[i];
      var nx = Math.max(q.l, Math.min(cx, q.r)), ny = Math.max(q.t, Math.min(cy, q.b));
      var dx = cx - nx, dy = cy - ny;
      if (dx * dx + dy * dy < rad * rad) return true;
    }
    return false;
  }
  function aimCel(p) {
    var cx = W * 0.78;
    cel.tmoon = (p === 3);
    if (p === 0)      { cel.tx = cx; cel.ty = H * 0.70; cel.tr = 30; cel.tdisc = hx('#ffd97a'); cel.tglow = hx('#ffbe5a'); }
    else if (p === 1) { cel.tx = W - 54; cel.ty = 54; cel.tr = 24; cel.tdisc = hx('#fff6e0'); cel.tglow = hx('#ffe9b8'); }
    else if (p === 2) { cel.tx = cx; cel.ty = H * 0.78; cel.tr = 40; cel.tdisc = hx('#ff9a52'); cel.tglow = hx('#ff7a3c'); }
    else              { cel.tx = W - 50; cel.ty = 50; cel.tr = 22; cel.tdisc = hx('#e9f1ff'); cel.tglow = hx('#a9c6ff'); }
    /* the canvas is the whole viewport now, but the body belongs to the
       hero band at the top of the sky — keep phase targets up there... */
    if (heroBand) cel.ty = Math.max(cel.tr + 6, Math.min(cel.ty, heroBand - cel.tr - 8));
    /* ...then steering has the final word: if the disc still lands on the
       headline/button, drop it below the content, whatever band that takes */
    var need = cel.tr + 14;
    if (clearRects.length && circleHits(cel.tx, cel.ty, need)) {
      var low = 0;
      for (var i = 0; i < clearRects.length; i++) low = Math.max(low, clearRects[i].b);
      cel.ty = Math.min(low + need + 2, H - cel.tr - 8);
    }
    if (p !== lastPhase) {
      if (p === 0) { cel.x = cel.tx; cel.y = H + 100; }        /* creep up from below */
      else if (p === 2) { cel.x = cel.tx; cel.y = -100; }     /* sink down from above */
      else { cel.x = cel.tx; cel.y = cel.ty; cel.a = 0; }     /* fade in place */
      cel.disc = cel.tdisc.slice(); cel.glow = cel.tglow.slice();
      cel.moon = cel.tmoon;
      lastPhase = p;
    }
  }
  function drawCel() {
    if (cel.a * celFade < 0.01) return;
    var i, c;
    /* ambient wash */
    var washR = cel.r * 7;
    var wash = ctx.createRadialGradient(cel.x, cel.y, 0, cel.x, cel.y, washR);
    wash.addColorStop(0, rgba(cel.glow, (0.13 * cel.a * celFade).toFixed(3)));
    wash.addColorStop(1, rgba(cel.glow, 0));
    ctx.fillStyle = wash;
    ctx.beginPath(); ctx.arc(cel.x, cel.y, washR, 0, 6.283); ctx.fill();
    /* halo */
    var halo = ctx.createRadialGradient(cel.x, cel.y, cel.r * 0.3, cel.x, cel.y, cel.r * 3.2);
    halo.addColorStop(0, rgba(cel.glow, (0.5 * cel.a * celFade).toFixed(3)));
    halo.addColorStop(1, rgba(cel.glow, 0));
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cel.x, cel.y, cel.r * 3.2, 0, 6.283); ctx.fill();
    /* disc */
    ctx.beginPath(); ctx.arc(cel.x, cel.y, cel.r, 0, 6.283);
    var dg = ctx.createLinearGradient(cel.x, cel.y - cel.r, cel.x, cel.y + cel.r);
    dg.addColorStop(0, rgba([255, 255, 255], (cel.a * celFade).toFixed(3)));
    dg.addColorStop(0.45, rgba(cel.disc, (cel.a * celFade).toFixed(3)));
    var dk = [];
    for (i = 0; i < 3; i++) dk[i] = cel.disc[i] * 0.7;
    dg.addColorStop(1, rgba(dk, (cel.a * celFade).toFixed(3)));
    ctx.fillStyle = dg; ctx.fill();
    if (cel.moon) {
      ctx.fillStyle = rgba([150, 170, 205], (0.28 * cel.a * celFade).toFixed(3));
      var craters = [[-0.3, -0.12, 0.22], [0.28, 0.3, 0.15], [0.02, -0.38, 0.12]];
      for (c = 0; c < craters.length; c++) {
        ctx.beginPath();
        ctx.arc(cel.x + craters[c][0] * cel.r, cel.y + craters[c][1] * cel.r, craters[c][2] * cel.r, 0, 6.283);
        ctx.fill();
      }
    }
  }
  function frame(myGid) {
    if (myGid !== gid || !running) return;
    ctx.clearRect(0, 0, W, H);
    var t = performance.now() / 1000;
    var ph = phaseOf(new Date().getHours());
    aimCel(ph);
    /* ease toward the phase targets — the creep itself */
    var k = 0.028, i;
    cel.x += (cel.tx - cel.x) * k;
    cel.y += (cel.ty - cel.y) * k;
    cel.r += (cel.tr - cel.r) * k;
    cel.a += (1 - cel.a) * k;
    for (i = 0; i < 3; i++) {
      cel.disc[i] += (cel.tdisc[i] - cel.disc[i]) * k;
      cel.glow[i] += (cel.tglow[i] - cel.glow[i]) * k;
    }
    /* Atlas 1: past the hero the celestial recedes to weather */
    var syNow = window.scrollY || window.pageYOffset || 0;
    var hbNow = heroBand || H * 0.9;
    var fTgt = syNow <= hbNow * 0.3 ? 1 : (syNow >= hbNow ? 0.15 :
      1 - (syNow - hbNow * 0.3) / (hbNow * 0.7) * 0.85);
    celFade += (fTgt - celFade) * 0.07;
    /* Observatory 3: the parallax whisper — the constellation field rides
       a breath in front of the fixed sky, drifting up to 9px against it
       as the page scrolls; the field moves as one rigid plate (lines,
       stars, wash, bloom and all). Eased like everything else on this
       page. */
    /* the field element is built by the collection script, which runs
       after this one — bind lazily, the first frame it exists */
    if (!fieldEl) { fieldEl = document.querySelector('.field'); if (fieldEl) fieldTopDoc = -1; }
    if (fieldEl && fieldTopDoc < 0) measureField();
    if (fieldEl) {
      var prog = ((syNow + H / 2) - (fieldTopDoc + fieldH / 2)) / (H / 2 + fieldH / 2);
      if (prog > 1) prog = 1; if (prog < -1) prog = -1;
      drift += (prog * 9 - drift) * 0.055;
      if (Math.abs(drift - driftApplied) > 0.05) {
        driftApplied = drift;
        fieldEl.style.transform = 'translate3d(0,' + drift.toFixed(2) + 'px,0)';
        /* Depth pass: publish the same eased drift as a variable — each
           depth tier's stars ride an extra slice of it (CSS translate), so
           the plate stays rigid for the lines while the stars separate
           into layers against it */
        fieldEl.style.setProperty('--pdrift', drift.toFixed(2) + 'px');
      }
    }
    drawCel();
    var dustA = ph === 3 ? 1 : (ph === 1 ? 0.22 : 0.45);
    for (var j = 0; j < parts.length; j++) {
      var p = parts[j];
      p.x += p.vx; p.y -= p.vy;
      if (p.y < -6) { p.y = H + 6; p.x = Math.random() * W; }
      if (p.x < -6) p.x = W + 6; if (p.x > W + 6) p.x = -6;
      var a = (.25 + .45 * Math.abs(Math.sin(t * 1.4 + p.tw))) * dustA;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283);
      ctx.fillStyle = 'rgba(' + p.hue + ',' + a.toFixed(2) + ')'; ctx.fill();
    }
    /* Atlas 8: ambient streaks belong to the upper sky — once the hero has
       scrolled away they read as scratches on the chart, so they stop
       spawning (the deliberate Surprise streak is exempt: shootForced) */
    if (!shoot && (shootForced || (ph !== 1 && syNow < hbNow && Math.random() < .006))) {
      shoot = shootForced
        ? { x: W * .78, y: H * .1, vx: -6.2, vy: 4.4, life: 1 }
        : { x: Math.random() * W * .7 + W * .15, y: -20, vx: -5, vy: 5, life: 1 };
      shootForced = false;
    }
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
  measureHero();
  measureField();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measureHero(); measureField(); });
  setTimeout(measureHero, 1500);
  window.addEventListener('resize', function () { start(); measureHero(); fieldTopDoc = -1; });
  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    if (running) start();
  });

  /* ---------- open door: one living line, time-aware, animated ---------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  (function () {
    var el = document.getElementById('opendoor');
    if (!el) return;
    var LINES = [
      'Good morning. The machines are warming up.',
      'Good afternoon. The arcade is open.',
      'Good evening. The arcade is open.',
      'Up late? The arcade never closes.'
    ];
    function phase(h) {
      return h >= 5 && h < 11 ? 0 : h >= 11 && h < 17 ? 1 : h >= 17 && h < 22 ? 2 : 3;
    }
    function render(line) {
      /* word masks for the rise-in */
      el.classList.remove('shimmer');
      el.innerHTML = '';
      var words = line.split(' ');
      words.forEach(function (word, i) {
        var mask = document.createElement('span'); mask.className = 'w';
        var inner = document.createElement('span');
        inner.textContent = word;
        inner.style.animationDelay = (i * 0.055).toFixed(3) + 's';
        mask.appendChild(inner);
        el.appendChild(mask);
        el.appendChild(document.createTextNode(' '));
      });
      /* sheen sweep once the rise settles: flatten first, so no transformed
         descendants break background-clip:text */
      setTimeout(function () {
        el.textContent = line;
        el.classList.add('shimmer');
      }, 400 + words.length * 55);
    }
    var cur = phase(new Date().getHours());
    render(LINES[cur]);
    /* keep it honest all day: re-check the clock, crossfade on phase change */
    setInterval(function () {
      var p = phase(new Date().getHours());
      if (p === cur) return;
      cur = p;
      el.classList.remove('shimmer');
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      setTimeout(function () {
        render(LINES[cur]);
        el.style.opacity = '';
        el.style.transform = '';
      }, 320);
    }, 30000);
  })();

  /* ---------- surprise me: a shooting star picks a random star ---------- */
  (function () {
    var btn = document.getElementById('surprise');
    if (!btn) return;
    var cards = Array.prototype.slice.call(document.querySelectorAll('.card[data-game][href]'));
    if (!cards.length) return;
    var busy = false;
    btn.addEventListener('click', function () {
      if (busy) return;
      var pick = cards[Math.floor(Math.random() * cards.length)];
      var id = pick.getAttribute('data-game');
      var star = id && document.querySelector('.star[data-game="' + id + '"]');
      if (!star) { window.location.href = pick.getAttribute('href'); return; }
      busy = true;
      document.dispatchEvent(new CustomEvent('sky-shoot'));
      star.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function () {
        document.dispatchEvent(new CustomEvent('bloom-star', { detail: id }));
        busy = false;
      }, 850);
    });
  })();

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
    { id: 'word-well', name: 'Word Well', cls: 'art-word-well' },
    { id: 'blood-moon', name: 'Blood Moon', cls: 'art-blood-moon' },
    { id: 'tiny-fairway', name: 'Tiny Fairway', cls: 'art-tiny-fairway' },
    { id: 'skylark', name: 'Skylark', cls: 'art-skylark' },
    { id: 'dominoes', name: 'Dominoes', cls: 'art-dominoes' },
    { id: 'cathedral', name: 'Cathedral', cls: 'art-cathedral' },
    { id: 'starlight-drums', name: 'Starlight Drums', cls: 'art-starlight-drums' },
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
        var w = readJSON('wwf_daily');
        if (!w || !w.streak) return null;
        return { label: '🔥 ' + w.streak + '-day streak', frac: Math.min(1, w.streak / 30) };
      }
      if (id === 'blood-moon') {
        var bm = readJSON('bm_meta');
        if (!bm) return null;
        var bn = bm.nightsSurvived || 0, bk = bm.bestKills || 0;
        if (!bn && !bk) return null;
        return { label: '🌙 ' + bn + ' night' + (bn === 1 ? '' : 's') + ' · 🩸' + bk + ' best', frac: Math.min(1, bn / 5) };
      }
      if (id === 'tiny-fairway') {
        var tf = readJSON('tf_best');
        if (!tf || !tf.holes) return null;
        var tst = tf.stars || 0, th = tf.holes;
        return { label: '⛳ best ' + tf.strokes + ' strokes · ★' + tst, frac: Math.min(1, tst / (th * 3)) };
      }
      if (id === 'starlight-drums') {
        var sd = readJSON('sd-records-v1');
        var best = null;
        if (sd && sd.songs) Object.keys(sd.songs).forEach(function (k) {
          if (!best || sd.songs[k].pct > best.pct) best = sd.songs[k];
        });
        if (!best) { var ob = readJSON('sd-best-v1'); if (ob && ob.pct != null) best = ob; }
        if (!best) return null;
        var stk = (sd && sd.streak && sd.streak.count >= 2) ? ' · 🔥 ' + sd.streak.count + '-day streak' : '';
        return { label: 'Best ' + best.letter + ' · ' + (+best.pct).toFixed(1) + '%' + stk, frac: Math.min(1, best.pct / 100) };
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
  /* ---------- tonight at the arcade: daily curator picks ---------- */
  (function () {
    var picksEl = document.getElementById('edPicks');
    if (!picksEl) return;
    var FALLBACK = [
      { game: 'skylark', blurb: 'Golden hour over the valley. Load the Kite, chase the route bonus.' },
      { game: 'neon-void', blurb: 'Thread the gravity wells. Don\u2019t blink \u2014 the swarm is waiting.' },
      { game: 'tiny-fairway', blurb: 'One hole, worldwide. Drag back, let fly. The turtle judges.' }
    ];
    function cardFor(id) {
      return document.querySelector('.card[data-game="' + id + '"]');
    }
    /* picks render in ~2 lines: never let a blurb (curated or AI-written)
       get ellipsized mid-word by the clamp — trim at a sentence or word edge */
    function fitBlurb(s) {
      s = String(s || '');
      if (s.length <= 84) return s;
      var cut = s.slice(0, 84);
      var sent = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
      if (sent > 40) return cut.slice(0, sent + 1);
      var sp = cut.lastIndexOf(' ');
      return (sp > 40 ? cut.slice(0, sp) : cut).replace(/[.,;:!?—-]+$/, '') + '\u2026';
    }
    function render(picks) {
      if (!picksEl) return;
      picksEl.innerHTML = '';
      picks.forEach(function (p, i) {
        var card = cardFor(p.game);
        if (!card) return;
        var a = document.createElement('a');
        a.className = 'ed-pick rv';
        a.href = card.getAttribute('href');
        a.style.setProperty('--glow', card.style.getPropertyValue('--glow') || '#4de3ff');
        a.style.transitionDelay = (i * 90) + 'ms';
        var art = card.querySelector('.art');
        var acls = '';
        if (art) art.className.split(/\s+/).forEach(function (k) { if (k.indexOf('art-') === 0 && k !== 'art') acls = k; });
        a.innerHTML = '<span class="ed-art ' + acls + '" aria-hidden="true"></span>' +
          '<span class="ed-body"><b>' + escapeHtml(card.querySelector('h3').textContent.replace(/^(\p{Extended_Pictographic}\uFE0F?\s+)+/u, '')) + '</b>' +
          '<i>' + escapeHtml(fitBlurb(p.blurb)) + '</i></span>' +
          '<span class="ed-go" aria-hidden="true">&rarr;</span>';
        picksEl.appendChild(a);
      });
      observeReveals();
    }
    function dateKey() {
      var d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    // static picks first (instant), AI replaces them when it lands
    render(FALLBACK);
    try {
      var ctl = new AbortController();
      var to = setTimeout(function () { ctl.abort(); }, 6000);
      fetch('https://gamez-ai.chaoticutopia84.workers.dev/g', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'arcadeeditorial', game: 'hub', ctx: { date: dateKey() } }),
        signal: ctl.signal
      }).then(function (r) { clearTimeout(to); return r.ok ? r.json() : null; })
        .then(function (d) {
          if (d && d.picks && d.picks.length === 3) render(d.picks);
        }).catch(function () { /* fallback stays */ });
    } catch (e) { /* fallback stays */ }
  })();

  /* ---------- feature presentation: tonight's double feature ---------- */
  (function () {
    var el = document.getElementById('featShows');
    if (!el) return;
    var SHOWS = [
      { title: 'Wagon Train', meta: '1957–1965 · 269 episodes', accent: '#e8a33d' },
      { title: 'The Cisco Kid', meta: '1950–1956 · 40 episodes', accent: '#d0523c' },
      { title: 'Annie Oakley', meta: '1954–1957 · 32 episodes', accent: '#5aa9a0' },
      { title: 'The Range Rider', meta: '1951–1953 · 27 episodes', accent: '#9a7b4f' },
      { title: 'Judge Roy Bean', meta: '1955–1957 · 19 episodes', accent: '#c9a227' }
    ];
    var day = Math.floor(Date.now() / 86400000);
    var a = day % SHOWS.length, b = (day * 7 + 3) % SHOWS.length;
    if (b === a) b = (b + 2) % SHOWS.length;
    var times = ['7:00 PM', '8:45 PM'];
    [a, b].forEach(function (si, i) {
      var s = SHOWS[si];
      var d = document.createElement('div');
      d.className = 'feat-show';
      d.style.setProperty('--sac', s.accent);
      d.innerHTML = '<span class="t">' + times[i] + '</span><b>' +
        escapeHtml(s.title) + '</b><span>' + escapeHtml(s.meta) + '</span>';
      el.appendChild(d);
    });
  })();

  /* ---------- Living Sky step 2: the constellation field ---------- */
  (function () {
    var main = document.querySelector('main.collection');
    var gamesEl = document.getElementById('games');
    if (!main || !gamesEl) return;
    /* hand-placed star map: x/y portrait, xd/yd wide — two skies, one field */
    /* Re-plot (2026-10-20): the field now traces one classic chart figure —
       positions computed from real star-chart coordinates (dense body in the
       upper middle, a handle west, a spout east, two outliers trailing to
       the low-left), lightly nudged only where labels would collide. The
       figure is deliberately unnamed anywhere in the product. */
    var POS = {
      'candy-cascade': [37, 24, 38, 25, 2], 'bubble-hex': [52, 30, 54, 31, 1],
      'bloom-defense': [30, 37, 30, 37, 1], 'neon-void': [72, 37, 75, 37, 2],
      'maze-trace': [23, 31, 23, 32, 1], 'word-well': [16, 76, 14, 76, 1],
      'pdawg': [20, 4, 19, 5, 1], 'life-story': [15, 91, 13, 91, 1],
      'reel-empire': [76, 61, 79, 62, 1], 'tiny-fairway': [69, 53, 72, 53, 3],
      'skylark': [65, 21, 68, 22, 2], 'dominoes': [88, 40, 92, 39, 1],
      'cathedral': [30, 9, 29, 10, 1],
      /* a second, younger figure in the lower-right sky: a five-star ram.
       * Four of its stars are pure asterism; the bright head is a game. */
      'starlight-drums': [71, 75, 73, 74, 3],
      'aries-1': [42, 80, 43, 80, 1], 'aries-2': [45, 79, 46, 78, 1],
      'aries-3': [56, 74, 58, 73, 2], 'aries-4': [62, 64, 64, 63, 1]
    };
    var LINKS = [['dominoes', 'neon-void'], ['neon-void', 'tiny-fairway'],
      ['tiny-fairway', 'bloom-defense'], ['bloom-defense', 'maze-trace'],
      ['maze-trace', 'candy-cascade'], ['candy-cascade', 'bubble-hex'],
      ['bubble-hex', 'neon-void'], ['neon-void', 'skylark'],
      ['tiny-fairway', 'reel-empire'], ['pdawg', 'cathedral'],
      ['cathedral', 'maze-trace'], ['bloom-defense', 'word-well'], ['word-well', 'life-story'],
      ['aries-1', 'aries-2'], ['aries-2', 'aries-3'],
      ['aries-3', 'starlight-drums'], ['aries-3', 'aries-4']];
    var SIZES = { 1: 9, 2: 11, 3: 14 };
    var field = document.createElement('div');
    field.className = 'field';
    field.setAttribute('aria-label', 'The Collection, as a constellation');
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'field-lines');
    svg.setAttribute('aria-hidden', 'true');
    field.appendChild(svg);
    var stars = {}, order = [];
    document.querySelectorAll('.card[data-game]').forEach(function (card) {
      var id = card.getAttribute('data-game');
      var p = POS[id];
      if (!p) return;
      var wide = window.innerWidth >= 700;
      var b = document.createElement('button');
      b.className = 'star';
      /* Depth pass: magnitude doubles as a depth tier (t3 nearest, t1 far) */
      b.classList.add('t' + p[4]);
      b.type = 'button';
      b.dataset.game = id;
      b.setAttribute('aria-label', 'Open ' + card.querySelector('h3').textContent.trim());
      b.style.left = (wide ? p[2] : p[0]) + '%';
      b.style.top = (wide ? p[3] : p[1]) + '%';
      b.style.setProperty('--glow', card.style.getPropertyValue('--glow') || '#4da6ff');
      b.style.setProperty('--s', SIZES[p[4]] + 'px');
      b.style.setProperty('--td', (-Math.random() * 3).toFixed(2) + 's');
      /* Observatory 1: stars of magnitude 2+ carry a diffraction glint */
      if (p[4] >= 2) {
        b.classList.add('glinted');
        b.style.setProperty('--gl', (p[4] === 3 ? 58 : 40) + 'px');
        b.style.setProperty('--gd', (-Math.random() * 5).toFixed(2) + 's');
      }
      b.innerHTML = (p[4] >= 2 ? '<span class="glint" aria-hidden="true"></span>' : '') +
        '<span class="core"></span><span class="lab">' +
        escapeHtml(card.querySelector('h3').textContent.replace(/^(\p{Extended_Pictographic}\uFE0F?\s+)+/u, '')) + '</span>';
      b.addEventListener('click', function (ev) { ev.stopPropagation(); openBloom(id, b); });
      field.appendChild(b);
      stars[id] = b; order.push(id);
    });
    /* the ram's minor stars: pure asterism — present so the figure reads,
     * but no cards behind them, so they are spans, not buttons; they join
     * the stars map only so the filament lines can find their endpoints. */
    var decorOrder = [];
    ['aries-1', 'aries-2', 'aries-3', 'aries-4'].forEach(function (id) {
      var p = POS[id];
      if (!p) return;
      var wide = window.innerWidth >= 700;
      var s = document.createElement('span');
      s.className = 'star decor t' + p[4];
      s.setAttribute('aria-hidden', 'true');
      s.style.left = (wide ? p[2] : p[0]) + '%';
      s.style.top = (wide ? p[3] : p[1]) + '%';
      s.style.setProperty('--glow', '#cfe0ff');
      s.style.setProperty('--s', SIZES[p[4]] + 'px');
      s.style.setProperty('--td', (-Math.random() * 3).toFixed(2) + 's');
      if (p[4] >= 2) {
        s.classList.add('glinted');
        s.style.setProperty('--gl', '40px');
        s.style.setProperty('--gd', (-Math.random() * 5).toFixed(2) + 's');
      }
      s.innerHTML = (p[4] >= 2 ? '<span class="glint" aria-hidden="true"></span>' : '') +
        '<span class="core"></span>';
      field.appendChild(s);
      stars[id] = s; decorOrder.push(id);
    });
    if (!order.length) return;
    LINKS.forEach(function (pair) {
      if (!stars[pair[0]] || !stars[pair[1]]) return;
      /* Depth pass: every link is a filament — a wide faint glow pass with a
         crisp core line over it; the core's brightness follows the depths of
         the two stars it joins (near-to-near burns brightest). drawLines
         already updates every line carrying data-a/data-b, so both passes
         stay glued with no extra bookkeeping. */
      var mk = function (cls) {
        var l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l.setAttribute('class', cls);
        l.dataset.a = pair[0]; l.dataset.b = pair[1];
        svg.appendChild(l); return l;
      };
      mk('lg');
      var lc = mk('lc');
      var avg = (POS[pair[0]][4] + POS[pair[1]][4]) / 2;
      lc.style.opacity = (0.16 + 0.13 * avg).toFixed(2);
    });
    var bloom = document.createElement('div');
    bloom.className = 'card bloom';
    bloom.setAttribute('role', 'dialog');
    bloom.innerHTML = '<button class="bclose" type="button" aria-label="Close">&times;</button>' +
      '<div class="art"><span class="badge"></span><div class="pbar"><i></i></div></div>' +
      '<div class="body"><h3></h3><p></p><div class="meta"><a class="play" href="#">Play</a><span class="prog"></span></div></div>';
    field.appendChild(bloom);
    main.insertBefore(field, gamesEl);
    main.classList.add('has-field');
    /* first visit: one bright star beckons — the floor's invitation */
    try {
      if (!localStorage.getItem('gamez-star-hint')) {
        localStorage.setItem('gamez-star-hint', '1');
        var beckon = null;
        order.forEach(function (id) {
          if (!beckon && stars[id] && stars[id].classList.contains('t3')) beckon = stars[id];
        });
        if (!beckon && order.length) beckon = stars[order[0]];
        if (beckon) {
          var ring = document.createElement('span');
          ring.className = 'hint-ring'; ring.setAttribute('aria-hidden', 'true');
          beckon.appendChild(ring);
        }
      }
    } catch (e) {}
    /* two faces for the floor: stars or grid — the visitor's pick sticks */
    var vtS = document.getElementById('vtStars'), vtG = document.getElementById('vtGrid');
    var colSub = document.getElementById('colSub');
    function setView(v) {
      var grid = v === 'grid';
      main.classList.toggle('view-grid', grid);
      main.classList.toggle('has-field', !grid);
      if (vtS) vtS.classList.toggle('on', !grid);
      if (vtG) vtG.classList.toggle('on', grid);
      if (colSub) colSub.textContent = grid
        ? 'Every machine on the floor. Tap a card to open it.'
        : 'Every machine on the floor. Tap a star to open it.';
      try { localStorage.setItem('gamez-view', v); } catch (e) {}
      if (!grid) layout();
    }
    if (vtS) vtS.addEventListener('click', function () { setView('stars'); });
    if (vtG) vtG.addEventListener('click', function () { setView('grid'); });
    var savedView = 'stars';
    try { savedView = localStorage.getItem('gamez-view') || 'stars'; } catch (e) {}
    if (savedView === 'grid') setView('grid');
    var openId = null, openBtn = null;
    function drawLines() {
      var fr = field.getBoundingClientRect();
      svg.querySelectorAll('line').forEach(function (ln) {
        var a = stars[ln.dataset.a], b = stars[ln.dataset.b];
        if (!a || !b) return;
        var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        ln.setAttribute('x1', ra.left + ra.width / 2 - fr.left);
        ln.setAttribute('y1', ra.top + ra.height / 2 - fr.top);
        ln.setAttribute('x2', rb.left + rb.width / 2 - fr.left);
        ln.setAttribute('y2', rb.top + rb.height / 2 - fr.top);
      });
    }
    function layout() {
      var wide = window.innerWidth >= 700;
      order.forEach(function (id) {
        var p = POS[id];
        stars[id].style.left = (wide ? p[2] : p[0]) + '%';
        stars[id].style.top = (wide ? p[3] : p[1]) + '%';
      });
      decorOrder.forEach(function (id) {
        var p = POS[id];
        stars[id].style.left = (wide ? p[2] : p[0]) + '%';
        stars[id].style.top = (wide ? p[3] : p[1]) + '%';
      });
      drawLines();
    }
    function openBloom(id, btn) {
      var card = document.querySelector('.card[data-game="' + id + '"]');
      if (!card) return;
      /* Atlas 5: the panel wears the tapped star's color */
      bloom.style.setProperty('--glow',
        btn.style.getPropertyValue('--glow') || card.style.getPropertyValue('--glow') || '#4da6ff');
      if (openBtn) openBtn.classList.remove('open');
      openId = id; openBtn = btn;
      btn.classList.add('open');
      var art = card.querySelector('.art');
      var ba = bloom.querySelector('.art');
      ba.className = 'art';
      if (art) art.classList.forEach(function (k) { if (k.indexOf('art-') === 0) ba.classList.add(k); });
      bloom.style.setProperty('--glow', card.style.getPropertyValue('--glow') || '#4da6ff');
      var badge = card.querySelector('.badge');
      bloom.querySelector('.badge').textContent = badge ? badge.textContent : '';
      bloom.querySelector('h3').textContent = card.querySelector('h3').textContent;
      bloom.querySelector('p').textContent = card.querySelector('p').textContent;
      var play = bloom.querySelector('.play');
      play.href = card.getAttribute('href');
      var prog = card.querySelector('.prog');
      bloom.querySelector('.prog').textContent = prog ? prog.textContent : '';
      var bar = card.querySelector('.pbar i');
      bloom.querySelector('.pbar i').style.width = bar ? bar.style.width : '0';
      field.classList.add('blooming');
    }
    function closeBloom() {
      if (openBtn) { openBtn.classList.remove('open'); openBtn.focus({ preventScroll: true }); }
      openId = null; openBtn = null;
      field.classList.remove('blooming');
    }
    document.addEventListener('bloom-star', function (ev) {
      var btn = stars[ev.detail];
      if (btn) openBloom(ev.detail, btn);
    });
    bloom.querySelector('.bclose').addEventListener('click', function (ev) { ev.stopPropagation(); closeBloom(); });
    field.addEventListener('click', function () { if (openId) closeBloom(); });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && openId) closeBloom(); });
    window.addEventListener('resize', layout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawLines);
    requestAnimationFrame(drawLines);
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { field.classList.add('lit'); drawLines(); io.disconnect(); } });
      }, { threshold: 0.15 });
      io.observe(field);
    } else field.classList.add('lit');
  })();

  /* ---------- scroll reveals: cards rise in, staggered ---------- */
  var revealIO = null;
  function observeReveals() {
    var els = document.querySelectorAll('.rv:not(.in)');
    if (!('IntersectionObserver' in window) || !els.length) {
      els.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    if (!revealIO) {
      revealIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('in'); revealIO.unobserve(en.target); }
        });
      }, { threshold: 0.12 });
    }
    els.forEach(function (el) { revealIO.observe(el); });
  }
  document.querySelectorAll('.card:not(.bloom),.chip,.shead,.feature,.featured').forEach(function (el) { el.classList.add('rv'); });
  observeReveals();
  var WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];
  var cardEls = document.querySelectorAll('.card:not(.bloom)');
  var wcEl = document.getElementById('worldcount');
  if (wcEl) wcEl.textContent = WORDS[cardEls.length] || String(cardEls.length);

  /* shine sweep element per card art */
  cardEls.forEach(function (card, ci) {
    var cart = card.querySelector('.art');
    if (!cart) return;
    var shn = document.createElement('span');
    shn.className = 'shine'; shn.setAttribute('aria-hidden', 'true');
    cart.appendChild(shn);
    card.style.setProperty('--sd', ((ci * 0.9) % 7.5).toFixed(2) + 's');
  });

  /* reveal-once: cards wave, section heads follow */
  function revealInit() {
    var targets = [];
    cardEls.forEach(function (card, ci) {
      card.classList.add('rv');
      card.style.setProperty('--rd', ((ci % 6) * 0.07).toFixed(2) + 's');
      targets.push(card);
    });
    document.querySelectorAll('.rvx').forEach(function (el, ei) {
      el.style.setProperty('--rd', (ei * 0.08).toFixed(2) + 's');
      targets.push(el);
    });
    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var rio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); rio.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0 });
    targets.forEach(function (el) { rio.observe(el); });
  }
  revealInit();

  /* ---------- cards: 3D pointer tilt (hover devices only) ---------- */
  (function () {
    if (!window.matchMedia('(hover:hover)').matches) return;
    cardEls.forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        card.style.transform = 'perspective(780px) rotateX(' + ((0.5 - py) * 13).toFixed(2) +
          'deg) rotateY(' + ((px - 0.5) * 16).toFixed(2) + 'deg) translateY(-6px)';
        card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      });
      card.addEventListener('pointerleave', function () { card.style.transform = ''; });
    });
  })();

  /* tap tick + sound toggle (subtle; stored preference) */
  var hubSnd = true;
  try { hubSnd = localStorage.getItem('hub_sound') !== 'off'; } catch (e) {}
  var tickAC = null;
  function tick() {
    if (!hubSnd) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!tickAC) tickAC = new AC();
      if (tickAC.state === 'suspended') tickAC.resume();
      var to = tickAC.createOscillator(), tg = tickAC.createGain();
      to.type = 'sine'; to.frequency.value = 1320;
      tg.gain.setValueAtTime(0.0001, tickAC.currentTime);
      tg.gain.exponentialRampToValueAtTime(0.07, tickAC.currentTime + 0.008);
      tg.gain.exponentialRampToValueAtTime(0.0001, tickAC.currentTime + 0.06);
      to.connect(tg); tg.connect(tickAC.destination);
      to.start(); to.stop(tickAC.currentTime + 0.07);
    } catch (e) {}
  }
  document.querySelectorAll('.card,.chip,.ed-pick,.feat3d,#surprise').forEach(function (el) {
    el.addEventListener('pointerdown', tick);
  });
  var sndbtn = document.getElementById('sndbtn');
  function renderSnd() {
    if (!sndbtn) return;
    sndbtn.textContent = hubSnd ? 'Sound on' : 'Sound off';
    sndbtn.classList.toggle('off', !hubSnd);
  }
  if (sndbtn) sndbtn.addEventListener('click', function () {
    hubSnd = !hubSnd;
    try { localStorage.setItem('hub_sound', hubSnd ? 'on' : 'off'); } catch (e) {}
    renderSnd();
    tick();
  });
  renderSnd();
})();
