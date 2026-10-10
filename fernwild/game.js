/* Fernwild game — scenes, input, HUD, tutorial, loop, persistence. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game'), ctx = canvas.getContext('2d');
  var titleCanvas = $('title-bg'), tctx = titleCanvas.getContext('2d');

  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0, TS = 0, OX = 0, OY = 0;
  var bgCache = null, titleCache = null, lastTitleDraw = 0;

  var st = null;            /* FW sim state */
  var screen = 'title';
  var floaters = [], parts = [];
  var tutStep = 0, tutDone = false;
  var saveT = 0, elapsed = 0;
  var selTile = null;       /* {x,y} awaiting seed choice */
  try { tutDone = localStorage.getItem('fw_tut') === '1'; } catch (e) {}

  /* ---------------- layout ---------------- */
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    [canvas, titleCanvas].forEach(function (c) {
      c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
    });
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    tctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var topPad = 96, botPad = 120;
    TS = Math.min((W - 28) / 8, (H - topPad - botPad) / 8);
    OX = (W - TS * 8) / 2; OY = topPad + ((H - topPad - botPad) - TS * 8) / 2;
    bgCache = FArt.gameBG(Math.round(W), Math.round(H), 0);
    titleCache = null;
  }
  window.addEventListener('resize', resize);

  /* ---------------- save / load ---------------- */
  function save() {
    try {
      localStorage.setItem('fw_save', FW.serialize(st));
      var best = 0;
      try { best = parseInt(localStorage.getItem('fw_best') || '0', 10); } catch (e) {}
      if (st.points > best) localStorage.setItem('fw_best', String(st.points));
    } catch (e) {}
  }
  function load() {
    var raw = null;
    try { raw = localStorage.getItem('fw_save'); } catch (e) {}
    if (raw) {
      var s = FW.deserialize(raw);
      if (s) {
        st = s;
        /* offline growth at half rate, capped at 8h */
        var away = Math.min((Date.now() - (s.savedAt || Date.now())) / 1000, 8 * 3600) * 0.5;
        if (away > 60) {
          var p0 = st.points, g0 = st.stats.grown;
          var n = Math.ceil(away / 60);
          for (var i = 0; i < n; i++) FW.step(st, Math.min(60, away - i * 60));
          FW.drainEvents(st);
          toast('While you were away: +' + (st.points - p0) + ' leaves, ' + (st.stats.grown - g0) + ' growths');
        }
        return true;
      }
    }
    return false;
  }

  /* ---------------- UI helpers ---------------- */
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.add('hidden'); }, ms || 2400);
  }
  function hint(msg) {
    var h = $('hint-bar');
    if (!msg) { h.classList.add('hidden'); return; }
    h.textContent = msg; h.classList.remove('hidden');
  }
  function floater(x, y, txt, col) {
    floaters.push({ x: OX + x * TS + TS / 2, y: OY + y * TS, txt: txt, col: col || '#ffe9a8', t: 0 });
  }
  function burst(x, y, kind) {
    for (var i = 0; i < 10; i++) {
      var a = Math.random() * 6.2832, sp = 30 + Math.random() * 60;
      parts.push({
        x: OX + x * TS + TS / 2, y: OY + y * TS + TS / 2,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
        t: 0, life: 0.7 + Math.random() * 0.5, kind: kind,
        col: kind === 'hearts' ? '#e89bc0' : (kind === 'petals' ? '#f2c9de' : (kind === 'rain' ? '#9fd0ff' : '#ffe9a8'))
      });
    }
  }

  /* ---------------- seed sheet ---------------- */
  function openSheet(x, y) {
    selTile = { x: x, y: y };
    var list = $('seed-list'); list.innerHTML = '';
    function opt(key, name, desc, cost, dot, fn) {
      var b = document.createElement('button');
      b.className = 'seed-opt' + (st.points < cost ? ' cant' : '');
      b.innerHTML = '<span class="seed-dot" style="background:' + dot + '"></span>' +
        '<span><span class="seed-name">' + name + '</span>' +
        '<span class="seed-desc">' + desc + '</span></span>' +
        '<span class="seed-cost"><span class="leaf-glyph"></span>' + cost + '</span>';
      b.addEventListener('click', function () {
        var r = fn();
        if (r.ok) { FAu.plant(); closeSheet(); tutAdvance('plant'); }
        else {
          FAu.error();
          toast(r.reason === 'poor' ? 'Not enough leaves yet' : (r.reason === 'lonely' ? 'Mushrooms need a tree neighbor' : 'Nothing to plant there'));
        }
      });
      list.appendChild(b);
    }
    Object.keys(FW.PLANTS).forEach(function (k) {
      var p = FW.PLANTS[k];
      opt(k, p.name + ' seed', p.desc, p.cost, p.color, function () { return FW.plant(st, x, y, k); });
    });
    opt('mush', 'Mushroom', 'Weaves the web — plant beside trees', FW.MUSH_COST,
      'radial-gradient(circle at 35% 35%, #e8dcc2, #c96a5e)',
      function () { return FW.plantMushroom(st, x, y); });
    $('seed-sheet').classList.remove('hidden');
    $('seed-sheet').setAttribute('aria-hidden', 'false');
  }
  function closeSheet() {
    selTile = null;
    $('seed-sheet').classList.add('hidden');
    $('seed-sheet').setAttribute('aria-hidden', 'true');
  }
  $('seed-cancel').addEventListener('click', closeSheet);

  /* ---------------- input ---------------- */
  var pdown = null;
  canvas.addEventListener('pointerdown', function (e) {
    pdown = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerup', function (e) {
    if (!pdown) return;
    var dx = e.clientX - pdown.x, dy = e.clientY - pdown.y;
    pdown = null;
    if (dx * dx + dy * dy > 144) return; /* it was a drag */
    handleTap(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointercancel', function () { pdown = null; });

  function tileAt(px, py) {
    var x = Math.floor((px - OX) / TS), y = Math.floor((py - OY) / TS);
    return (x >= 0 && y >= 0 && x < 8 && y < 8) ? { x: x, y: y } : null;
  }
  function handleTap(px, py) {
    if (screen !== 'game' || !st) return;
    FAu.unlock();
    /* animals first (generous hit radius) */
    var best = null, bd = 1e9;
    for (var i = 0; i < st.animals.length; i++) {
      var a = st.animals[i];
      var ax = OX + a.x * TS + TS / 2, ay = OY + a.y * TS + TS / 2;
      var d = Math.hypot(px - ax, py - ay);
      if (d < TS * 0.55 && d < bd) { bd = d; best = a; }
    }
    if (best) {
      var r = FW.tapAnimal(st, best.id, FW.now());
      if (r.ok) {
        FAu.tap();
        toast(r.msg);
        if (r.fx) burst(r.x, r.y, r.fx);
        tutAdvance('tap');
      } else if (r.reason === 'resting') toast(FW.ANIMALS[best.species].name + ' is resting…');
      return;
    }
    var t = tileAt(px, py);
    if (!t) return;
    var tl = st.tiles[t.y * 8 + t.x];
    if (!tl.plant && !tl.mush) { openSheet(t.x, t.y); return; }
    if (tl.plant && tl.plant.stage === FW.ST.FALLEN) {
      var cr = FW.clearTile(st, t.x, t.y);
      if (cr.ok) { FAu.plant(); toast('Cleared the old trunk'); }
      return;
    }
    if (tl.plant) {
      var pn = FW.PLANTS[tl.plant.type].name;
      var sn = ['soil', 'seed', 'sprout', 'sapling', 'adult', 'ancient', 'fallen trunk'][tl.plant.stage];
      toast(pn + ' · ' + sn);
    }
  }

  /* ---------------- tutorial ---------------- */
  var TUTS = [
    'Tap a glowing patch of soil to plant your first seed',
    'Trees grow on their own — keep an eye on them',
    'Someone moved in! Tap animals to see what they do',
    'Plant mushrooms beside trees to weave the web'
  ];
  function tutAdvance(kind) {
    if (tutDone) return;
    if (kind === 'plant' && tutStep === 0) tutStep = 1;
    else if (kind === 'arrive' && tutStep === 1) tutStep = 2;
    else if (kind === 'tap' && tutStep === 2) tutStep = 3;
    else if (kind === 'mush' && tutStep === 3) { tutStep = 4; tutDone = true; try { localStorage.setItem('fw_tut', '1'); } catch (e) {} }
    hint(tutStep < 4 ? TUTS[tutStep] : null);
  }

  /* ---------------- events ---------------- */
  function perfNow() { return performance.now() / 1000; } /* visuals only; sim uses FW.now() */
  function handleEvents(evs) {
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e.t === 'planted' && !e.free) { /* sfx already played */ }
      else if (e.t === 'planted' && e.free) floater(e.x, e.y, 'free sprout!', '#c9ecb0');
      else if (e.t === 'grew') {
        if (e.stage === 2) FAu.sprout();
        else if (e.stage === 4) { FAu.grow(); floater(e.x, e.y, 'grown!', '#c9ecb0'); }
        else if (e.stage === 5) floater(e.x, e.y, 'ancient', '#e8d9ae');
        else if (e.stage === 6) { toast('An old tree has fallen — new homes for small ones'); }
      }
      else if (e.t === 'sniffing') { toast('Something\'s sniffing around…'); }
      else if (e.t === 'arrived') {
        FAu.arrive();
        toast('A ' + FW.ANIMALS[e.species].name + ' moved in!');
        burst(e.x, e.y, 'sparkle');
        tutAdvance('arrive');
      }
      else if (e.t === 'points' && e.x >= 0) floater(e.x, e.y, '+' + e.n, '#ffe9a8');
      else if (e.t === 'day') toast('Day ' + e.day + ' in the forest');
      else if (e.t === 'mushroom') {
        FAu.mush(); tutAdvance('mush');
        if (e.free) floater(e.x, e.y, 'wild mushroom!', '#c9ecb0');
      }
      else if (e.t === 'tapped' && e.fx) burst(e.x, e.y, e.fx);
      else if (e.t === 'left') { FAu.leave(); toast('The ' + FW.ANIMALS[e.species].name + ' moved on…'); }
      else if (e.t === 'ach') { FAu.achieve(); achToast(FW.ACH[e.id].name, FW.ACH[e.id].desc); }
      else if (e.t === 'storm-start') { FAu.storm(); toast('A storm rolls in!'); }
      else if (e.t === 'storm-end') { toast('The storm passes'); }
    }
  }
  function achToast(title, sub) {
    var t = $('toast');
    t.innerHTML = '';
    var b = document.createElement('b'); b.textContent = 'Achievement: ' + title;
    var s = document.createElement('span'); s.textContent = ' · ' + sub;
    s.style.fontWeight = '400'; s.style.fontSize = '12px';
    t.appendChild(b); t.appendChild(s);
    t.classList.add('ach-toast'); t.classList.remove('hidden');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.add('hidden'); t.classList.remove('ach-toast'); }, 3400);
  }

  /* ---------------- journal ---------------- */
  function buildJournal() {
    var sp = $('journal-species'); sp.innerHTML = '';
    function row(name, desc, found, draw) {
      var d = document.createElement('div');
      d.className = 'jsp' + (found ? '' : ' locked');
      var cv = document.createElement('canvas'); cv.width = cv.height = 88;
      draw(cv.getContext('2d'));
      var tx = document.createElement('div');
      var nm = document.createElement('span'); nm.className = 'jsp-name'; nm.textContent = found ? name : '???';
      var ds = document.createElement('span'); ds.className = 'jsp-desc'; ds.textContent = found ? desc : 'Not discovered yet';
      tx.appendChild(nm); tx.appendChild(ds);
      d.appendChild(cv); d.appendChild(tx); sp.appendChild(d);
    }
    Object.keys(FW.PLANTS).forEach(function (k) {
      var p = FW.PLANTS[k];
      row(p.name, p.desc, st.stats.plantsSeen.indexOf(k) >= 0, function (g) { g.drawImage(FArt.tree(k, 4, 0), 0, 0, 88, 88); });
    });
    var mushFound = st.tiles.some(function (t) { return t.mush; });
    row('Mushroom', 'Weaves the web', mushFound, function (g) { g.drawImage(FArt.mushroom(0), 0, 0, 88, 88); });
    FW.ANIMAL_IDS.forEach(function (id) {
      var a = FW.ANIMALS[id];
      row(a.name, a.need, st.stats.speciesSeen.indexOf(id) >= 0, function (g) { g.drawImage(FArt.animal(id, 0), 0, 0, 88, 88); });
    });
    $('disc-count').textContent = (st.stats.plantsSeen.length + (mushFound ? 1 : 0) + st.stats.speciesSeen.length) + ' / 12';
    var al = $('journal-ach'); al.innerHTML = '';
    var ids = Object.keys(FW.ACH), un = 0;
    ids.forEach(function (id) {
      var got = !!st.ach[id]; if (got) un++;
      var d = document.createElement('div');
      d.className = 'ach' + (got ? ' unlocked' : ' locked');
      var star = document.createElement('span'); star.className = 'ach-star'; star.textContent = got ? '★' : '·';
      var tx = document.createElement('span');
      var nm = document.createElement('span'); nm.className = 'ach-name'; nm.textContent = FW.ACH[id].name;
      var ds = document.createElement('span'); ds.className = 'ach-desc'; ds.textContent = FW.ACH[id].desc;
      tx.appendChild(nm); tx.appendChild(ds);
      d.appendChild(star); d.appendChild(tx); al.appendChild(d);
    });
    $('ach-count').textContent = un + ' / ' + ids.length;
  }

  /* ---------------- render ---------------- */
  function render(now) {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bgCache, 0, 0, W, H);
    /* mycorrhizal threads under everything */
    var links = [];
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
      var n = st.tiles[y * 8 + x].net;
      if (!n) continue;
      if (x + 1 < 8 && st.tiles[y * 8 + x + 1].net === n) links.push({ x1: x, y1: y, x2: x + 1, y2: y });
      if (y + 1 < 8 && st.tiles[(y + 1) * 8 + x].net === n) links.push({ x1: x, y1: y, x2: x, y2: y + 1 });
    }
    if (links.length) FArt.drawThreads(ctx, OX, OY, TS, links, now);
    /* tiles */
    for (var ty = 0; ty < 8; ty++) for (var tx = 0; tx < 8; tx++) {
      var tl = st.tiles[ty * 8 + tx];
      var v = (tx * 7 + ty * 13) % 4;
      ctx.drawImage(FArt.soil(v), OX + tx * TS + 2, OY + ty * TS + 2, TS - 4, TS - 4);
      if (tl.net > 0) {
        ctx.fillStyle = 'rgba(170,225,140,0.16)';
        ctx.fillRect(OX + tx * TS + 2, OY + ty * TS + 2, TS - 4, TS - 4);
      }
      if (!tl.plant && !tl.mush && tutStep === 0 && !tutDone && tx === 3 && ty === 4) {
        var pu = 0.5 + 0.5 * Math.sin(now * 4);
        ctx.strokeStyle = 'rgba(255,235,170,' + (0.5 + 0.5 * pu) + ')';
        ctx.lineWidth = 3;
        ctx.strokeRect(OX + tx * TS + 6, OY + ty * TS + 6, TS - 12, TS - 12);
      }
      if (tl.mush) ctx.drawImage(FArt.mushroom(tx * 3 + ty), OX + tx * TS + TS * 0.03, OY + ty * TS + TS * 0.02, TS * 0.94, TS * 0.94);
      if (tl.plant) {
        var vv = (tx * 5 + ty * 11) % 3;
        var ps = TS * 1.55;
        ctx.drawImage(FArt.tree(tl.plant.type, tl.plant.stage, vv), OX + tx * TS + TS / 2 - ps / 2, OY + ty * TS + TS / 2 - ps / 2 - TS * 0.18, ps, ps);
      }
    }
    /* animals */
    for (var a = 0; a < st.animals.length; a++) {
      var an = st.animals[a];
      var bob = Math.sin(now * 3 + an.ph) * TS * 0.03;
      var s2 = TS * 0.92;
      var acx = OX + an.x * TS + TS / 2, acy = OY + an.y * TS + TS / 2;
      ctx.fillStyle = 'rgba(20,15,8,0.22)';
      ctx.beginPath(); ctx.ellipse(acx, acy + s2 * 0.38, s2 * 0.3, s2 * 0.1, 0, 0, 6.2832); ctx.fill();
      ctx.drawImage(FArt.animal(an.species, an.id % 2), acx - s2 / 2, acy - s2 / 2 + bob, s2, s2);
      if (an.cd > FW.now()) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '700 ' + Math.round(TS * 0.28) + 'px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('…', OX + an.x * TS + TS / 2, OY + an.y * TS + TS * 0.16);
      }
    }
    /* storm: dim + rain streaks */
    if (st.storm > 0) {
      ctx.fillStyle = 'rgba(30,42,70,0.16)';
      ctx.fillRect(0, 0, W, H);
      for (var ri = 0; ri < 7; ri++) {
        parts.push({
          x: Math.random() * (W + 80) - 40, y: -12, vx: -50, vy: 430,
          t: 0, life: 1.8, kind: 'streak', col: 'rgba(160,200,255,0.55)'
        });
      }
    }
    /* particles */
    for (var p = parts.length - 1; p >= 0; p--) {
      var pt = parts[p];
      pt.t += 1 / 60;
      if (pt.t > pt.life) { parts.splice(p, 1); continue; }
      pt.x += pt.vx / 60; pt.y += pt.vy / 60; pt.vy += (pt.kind === 'streak' ? 0 : 60) / 60;
      if (pt.kind === 'streak') {
        ctx.globalAlpha = 0.55 * (1 - pt.t / pt.life);
        ctx.strokeStyle = pt.col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(pt.x - pt.vx * 0.035, pt.y - pt.vy * 0.035); ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.globalAlpha = 1 - pt.t / pt.life;
      ctx.fillStyle = pt.col;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 3.2, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
    }
    /* floaters */
    ctx.textAlign = 'center';
    for (var f = floaters.length - 1; f >= 0; f--) {
      var fl = floaters[f];
      fl.t += 1 / 60;
      if (fl.t > 1.4) { floaters.splice(f, 1); continue; }
      ctx.globalAlpha = 1 - fl.t / 1.4;
      ctx.font = '800 ' + Math.round(TS * 0.3) + 'px system-ui';
      ctx.fillStyle = fl.col;
      ctx.strokeStyle = 'rgba(30,25,15,0.7)'; ctx.lineWidth = 3;
      var fy = fl.y - fl.t * 34;
      ctx.strokeText(fl.txt, fl.x, fy); ctx.fillText(fl.txt, fl.x, fy);
      ctx.globalAlpha = 1;
    }
  }

  /* ---------------- HUD ---------------- */
  var lastPts = -1, lastDay = -1;
  function hud() {
    if (st.points !== lastPts) {
      lastPts = st.points; $('points-num').textContent = st.points;
      $('fab-storm').classList.toggle('poor', st.points < FW.STORM_COST || st.storm > 0);
    }
    if (st.day !== lastDay) { lastDay = st.day; $('hud-day').textContent = 'DAY ' + st.day; }
  }

  /* ---------------- loop ---------------- */
  var last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!last) last = ts;
    var dt = Math.min(0.1, (ts - last) / 1000);
    last = ts;
    if (screen === 'title') {
      if (!titleCache || ts - lastTitleDraw > 220) {
        titleCache = FArt.titleBG(Math.round(W), Math.round(H), ts / 1000);
        lastTitleDraw = ts;
      }
      tctx.drawImage(titleCache, 0, 0, W, H);
      return;
    }
    if (!st) return;
    elapsed += dt;
    /* step sim in small chunks */
    var rem = dt, n = 0;
    while (rem > 0 && n++ < 4) { var c = Math.min(rem, 0.05); handleEvents(FW.step(st, c)); rem -= c; }
    var now = perfNow();
    render(now);
    hud();
    saveT += dt;
    if (saveT > 5) { saveT = 0; save(); }
  }

  /* ---------------- boot ---------------- */
  function showScreen(id) {
    ['screen-title', 'screen-game'].forEach(function (s) { $(s).classList.add('hidden'); });
    $(id).classList.remove('hidden');
  }
  function startGame() {
    FAu.unlock();
    if (!load()) st = FW.newGame((Date.now() ^ (Math.random() * 1e9)) | 0);
    screen = 'game';
    showScreen('screen-game');
    hud(); lastPts = -1;
    if (!tutDone) hint(TUTS[tutStep]);
    toast('Welcome to your forest');
  }
  $('btn-play').addEventListener('click', startGame);
  $('btn-how').addEventListener('click', function () { $('howto').classList.toggle('hidden'); });
  $('btn-mute').addEventListener('click', function () {
    var m = FAu.toggleMute();
    $('mute-glyph').textContent = m ? '✕' : '♪';
    $('btn-mute').style.opacity = m ? 0.5 : 1;
  });
  $('fab-storm').addEventListener('click', function () {
    if (screen !== 'game' || !st) return;
    FAu.unlock();
    var r = FW.summonStorm(st);
    if (!r.ok) {
      FAu.error();
      toast(r.reason === 'storm' ? 'A storm is already passing' : 'Need ' + FW.STORM_COST + ' leaves to call rain');
    }
  });
  $('fab-guide').addEventListener('click', function () {
    if (screen !== 'game' || !st) return;
    buildJournal();
    $('journal').classList.remove('hidden');
  });
  $('journal-close').addEventListener('click', function () { $('journal').classList.add('hidden'); });
  $('journal').addEventListener('click', function (e) { if (e.target === $('journal')) $('journal').classList.add('hidden'); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);
  document.addEventListener('pointerdown', function () { FAu.unlock(); }, { once: true });

  /* title best + mute state */
  try {
    $('title-best').textContent = localStorage.getItem('fw_best') || '0';
    $('storm-cost').textContent = FW.STORM_COST;
    if (FAu.isMuted()) { $('mute-glyph').textContent = '✕'; $('btn-mute').style.opacity = 0.5; }
  } catch (e) {}

  resize();
  requestAnimationFrame(loop);

  /* debug handle for smoke tests */
  window.FWDebug = {
    state: function () { return st; },
    step: function (dt) { if (st) handleEvents(FW.step(st, dt)); },
    simNow: function () { return FW.now(); }
  };
})();
