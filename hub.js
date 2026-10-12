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
    pill.innerHTML = '<b>' + (n ? escapeHtml(n) : 'Guest') + '</b> &#9998;';
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
    { id: 'word-well', name: 'Word Well', cls: 'art-word-well' },
    { id: 'blood-moon', name: 'Blood Moon', cls: 'art-blood-moon' },
    { id: 'tiny-fairway', name: 'Tiny Fairway', cls: 'art-tiny-fairway' },
    { id: 'castaway-cove', name: 'Castaway Cove', cls: 'art-castaway-cove' },
    { id: 'neon-drift', name: 'Neon Drift', cls: 'art-neon-drift' },
    { id: 'dead-mans-hand', name: "Dead Man's Hand", cls: 'art-dead-mans-hand' },
    { id: 'skyhook', name: 'Skyhook', cls: 'art-skyhook' },
    { id: 'dead-corridor', name: "Dead Man's Corridor", cls: 'art-dead-corridor' },
    { id: 'fernwild', name: 'Fernwild', cls: 'art-fernwild' },
    { id: 'golden-acre', name: 'Golden Acre', cls: 'art-golden-acre' },
    { id: 'greywater', name: 'Greywater Light', cls: 'art-greywater' },
    { id: 'skyline-sparrow', name: 'Skyline Sparrow', cls: 'art-skyline-sparrow' },
    { id: 'emberline', name: 'Emberline', cls: 'art-emberline' },
    { id: 'skylark', name: 'Skylark', cls: 'art-skylark' },
    { id: 'food-truck', name: 'Food Truck Manager', cls: 'art-food-truck' }
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
      if (id === 'skyhook') {
        var sh = +(read('skyhook_best') || 0); if (!sh) return null;
        return { label: 'Best ' + sh, frac: Math.min(1, sh / 50) };
      }
      if (id === 'dead-corridor') {
        var dc = +(read('dc_best') || 0); if (!dc) return null;
        return { label: 'Best ' + dc.toLocaleString(), frac: Math.min(1, dc / 9000) };
      }
      if (id === 'fernwild') {
        var fw = +(read('fw_best') || 0); if (!fw) return null;
        return { label: 'Richest ' + fw.toLocaleString(), frac: Math.min(1, fw / 2000) };
      }
      if (id === 'golden-acre') {
        var ga = readJSON('ga_arcade'); if (!ga || !ga.value) return null;
        return { label: 'Worth $' + (+ga.value).toLocaleString(), frac: Math.min(1, ga.value / 50000) };
      }
      if (id === 'greywater') {
        var gw = readJSON('greywater-save-v1'); if (!gw || !gw.sim) return null;
        try {
          var gs = JSON.parse(gw.sim);
          return { label: 'Day ' + gs.day + ' · ' + (+gs.stats.guided || 0) + ' guided', frac: Math.min(1, gs.day / 60) };
        } catch (e) { return null; }
      }
      if (id === 'skyline-sparrow') {
        var ss = readJSON('ss_save_v1'); if (!ss || !ss.best || !ss.best.score) return null;
        return { label: 'Best ' + (+ss.best.score).toLocaleString() + ' pts', frac: Math.min(1, ss.best.score / 5000) };
      }
      if (id === 'food-truck') {
        var f = readJSON('ftm_save_v1'); if (!f || !f.shifts) return null;
        return { label: f.shifts + ' shifts' + ((f.totalStars || 0) ? ' · ★' + (f.totalStars || 0) : ''), frac: Math.min(1, f.shifts / 30) };
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
      if (id === 'castaway-cove') {
        var ccv = readJSON('castaway_cove_v1');
        if (!ccv) return null;
        var jc = ccv.journal ? Object.keys(ccv.journal).length : 0;
        var cs = (ccv.streak && ccv.streak.count) || 0;
        if (!jc && !cs) return null;
        return { label: '📖 ' + jc + '/40 · 🔥' + cs, frac: Math.min(1, jc / 40) };
      }
      if (id === 'neon-drift') {
        var nd = readJSON('nd_save_v1');
        if (!nd || !nd.tokens) return null;
        return { label: '🏎️ ' + nd.tokens + ' ◈ · ' + (nd.cupsUnlocked || 1) + '/4 cups', frac: Math.min(1, (nd.cupsUnlocked || 1) / 4) };
      }
      if (id === 'dead-mans-hand') {
        var dmh = readJSON('dmh_progress_v1');
        if (!dmh) return null;
        return { label: '🃏 Best ' + (dmh.best || 0) + ' · ' + (dmh.rooms || 0) + '/5 rooms', frac: Math.min(1, (dmh.rooms || 0) / 5) };
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
    var wrap = document.getElementById('editorial');
    if (!wrap) return;
    var picksEl = document.getElementById('edPicks');
    var FALLBACK = [
      { game: 'greywater', blurb: 'Fog on the water tonight and ships standing into the narrows. They need their keeper.' },
      { game: 'neon-void', blurb: 'Turn it up, thread the gravity wells, and try not to blink. The swarm is waiting.' },
      { game: 'castaway-cove', blurb: 'One cast, one fish, one quiet dawn. The heron will judge your form regardless.' }
    ];
    function cardFor(id) {
      return document.querySelector('.card[data-game="' + id + '"]');
    }
    function render(picks) {
      if (!picksEl) return;
      picksEl.innerHTML = '';
      picks.forEach(function (p, i) {
        var card = cardFor(p.game);
        if (!card) return;
        var a = document.createElement('a');
        a.className = 'ed-pick rvl';
        a.href = card.getAttribute('href');
        a.style.setProperty('--glow', card.style.getPropertyValue('--glow') || '#4de3ff');
        a.style.transitionDelay = (i * 90) + 'ms';
        var art = card.querySelector('.art');
        var acls = '';
        if (art) art.className.split(/\s+/).forEach(function (k) { if (k.indexOf('art-') === 0 && k !== 'art') acls = k; });
        a.innerHTML = '<span class="ed-art ' + acls + '" aria-hidden="true"></span>' +
          '<span class="ed-body"><b>' + escapeHtml(card.querySelector('h3').textContent.replace(/^(\p{Extended_Pictographic}\uFE0F?\s+)+/u, '')) + '</b>' +
          '<i>' + escapeHtml(p.blurb) + '</i></span>' +
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

  /* ---------- scroll reveals: cards rise in, staggered ---------- */
  var revealIO = null;
  function observeReveals() {
    var els = document.querySelectorAll('.rvl:not(.in)');
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
  document.querySelectorAll('.card,.daily,.chip,.shead').forEach(function (el) { el.classList.add('rvl'); });
  observeReveals();
  var WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];
  var cardEls = document.querySelectorAll('.card');
  var wcEl = document.getElementById('worldcount');
  if (wcEl) wcEl.textContent = WORDS[cardEls.length] || String(cardEls.length);

  /* spotlight: driven by the live card grid — change SPOTLIGHT_ID to swap */
  var SPOTLIGHT_ID = 'unfold';
  (function () {
    var sc = document.querySelector('.card[data-game="' + SPOTLIGHT_ID + '"]');
    var sp = document.getElementById('spotlight');
    if (!sc || !sp) return;
    sp.href = './' + SPOTLIGHT_ID + '/';
    var sart = sc.querySelector('.art'), acls = '';
    if (sart) sart.className.split(/\s+/).forEach(function (k) {
      if (k.indexOf('art-') === 0) acls = k;
    });
    var spArt = document.getElementById('spArt');
    if (spArt && acls) spArt.className = 'sp-art ' + acls;
    /* clone the card's art scene (glyph, CSS scene, or key art) minus chrome */
    var artSrc = sc.querySelector('.art');
    if (spArt && artSrc) {
      var ac = artSrc.cloneNode(true);
      ac.querySelectorAll('.badge,.pbar,.shine').forEach(function (x) { x.remove(); });
      ac.removeAttribute('id');
      while (ac.firstChild) spArt.appendChild(ac.firstChild);
    }
    var sh3 = sc.querySelector('h3');
    if (sh3) document.getElementById('spName').textContent = sh3.textContent.replace(/^(\p{Extended_Pictographic}\uFE0F?\s+)+/u, '');
    var spp = sc.querySelector('.body p');
    if (spp) document.getElementById('spBlurb').textContent = spp.textContent.trim();
  })();

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
  document.querySelectorAll('.card,.daily,.chip,.spotlight,.namepill').forEach(function (el) {
    el.addEventListener('pointerdown', tick);
  });
  var sndbtn = document.getElementById('sndbtn');
  function renderSnd() {
    if (!sndbtn) return;
    sndbtn.innerHTML = hubSnd ? '&#x1F50A;' : '&#x1F507;';
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
