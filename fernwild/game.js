/* Fernwild game — side-view cross-section. Scenes, input, HUD, tutorial, loop, persistence. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game'), ctx = canvas.getContext('2d');
  var titleCanvas = $('title-bg'), tctx = titleCanvas.getContext('2d');

  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0;
  var SY = 0, botY = 0, UD = 0, spotW = 0, padX = 16, pondX = 0;
  var ASZ = 46;
  var bgCache = null, soilCache = null, titleCache = null, lastTitleDraw = 0;

  var st = null;            /* FW sim state */
  var screen = 'title';
  var floaters = [], parts = [];
  var tutStep = 0, tutDone = false;
  var saveT = 0, elapsed = 0;
  var migrated = false;
  var selTile = null;       /* {x} awaiting seed choice */
  try { tutDone = localStorage.getItem('fw_tut') === '1'; } catch (e) {}

  var TREE_PX = { 1: 26, 2: 44, 3: 95, 4: 175, 5: 215, 6: 110 };
  function treeH(stage) { return (TREE_PX[stage] || 40) * 0.8; }

  /* ---------------- layout ---------------- */
  function pondDip(x) {
    var d = (x - pondX) / 55;
    return 24 * Math.exp(-d * d);
  }
  function surfY(x) {
    return SY + Math.sin(x * 0.008 + 1.7) * 10 - pondDip(x);
  }
  function spotX(i) { return padX + (i + 0.5) * spotW; }
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    [canvas, titleCanvas].forEach(function (c) {
      c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
    });
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    tctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var topPad = 96, botPad = 112;
    SY = topPad + (H - topPad - botPad) * 0.40;
    botY = H - botPad;
    UD = botY - SY;
    spotW = (W - padX * 2) / FW.GW;
    pondX = W * 0.78;
    ASZ = Math.max(34, Math.min(56, spotW * 1.5));
    bgCache = FArt.gameBG(Math.round(W), Math.round(H), Math.round(SY), 0);
    soilCache = FArt.underground(Math.round(W), Math.round(H), surfY, Math.round(botY));
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
      migrated = true; /* old top-down save: the new view starts fresh */
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
    floaters.push({ x: x, y: y, txt: txt, col: col || '#ffe9a8', t: 0 });
  }
  function burst(x, y, kind) {
    for (var i = 0; i < 10; i++) {
      var a = Math.random() * 6.2832, sp = 30 + Math.random() * 60;
      parts.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
        t: 0, life: 0.7 + Math.random() * 0.5, kind: kind,
        col: kind === 'hearts' ? '#e89bc0' : (kind === 'petals' ? '#f2c9de' : (kind === 'rain' ? '#9fd0ff' : '#ffe9a8'))
      });
    }
  }
  function evXY(e) {
    if (e.x >= 0) { var px = spotX(e.x); return { x: px, y: surfY(px) - 30 }; }
    return { x: W / 2, y: SY - 40 };
  }

  /* ---------------- seed sheet ---------------- */
  function openSheet(i) {
    selTile = { x: i, y: 0 };
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
      opt(k, p.name + ' seed', p.desc, p.cost, p.color, function () { return FW.plant(st, i, 0, k); });
    });
    opt('mush', 'Mushroom', 'Weaves the web — plant beside trees', FW.MUSH_COST,
      'radial-gradient(circle at 35% 35%, #e8dcc2, #c96a5e)',
      function () { return FW.plantMushroom(st, i, 0); });
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

  function nearestTree(x, minStage) {
    var best = -1, bd = 1e9;
    for (var i = 0; i < FW.GW; i++) {
      var p = st.tiles[i].plant;
      if (!p || p.stage < minStage || p.stage === FW.ST.FALLEN) continue;
      var d = Math.abs(spotX(i) - x);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function animalPos(a) {
    var sp = a.species;
    if (sp === 'frog') {
      var fx = pondX + Math.sin(elapsed * 0.9 + a.ph) * 26;
      return { x: fx, y: surfY(fx) + 2, s: ASZ * 0.95, ground: true };
    }
    if (sp === 'butterfly') {
      var bx = spotX(a.x) + Math.sin(elapsed * 1.2 + a.ph) * 42;
      return { x: bx, y: surfY(bx) - 118 - Math.sin(elapsed * 2.2 + a.ph) * 20, s: ASZ * 0.85, ground: false };
    }
    if (sp === 'squirrel') {
      var si = nearestTree(spotX(a.x), FW.ST.SAPLING);
      if (si >= 0) {
        var sx = spotX(si), sy = surfY(sx);
        var climb = 0.5 + 0.18 * Math.sin(elapsed * 0.8 + a.ph);
        return { x: sx + Math.sin(elapsed * 0.8 + a.ph) * 9, y: sy - treeH(st.tiles[si].plant.stage) * climb, s: ASZ * 0.9, ground: false };
      }
    }
    if (sp === 'owl') {
      var oi = nearestTree(spotX(a.x), FW.ST.ADULT);
      if (oi >= 0) {
        var ox = spotX(oi), oy = surfY(ox);
        return { x: ox + 12, y: oy - treeH(st.tiles[oi].plant.stage) * 0.94 + Math.sin(elapsed * 1.1 + a.ph) * 3, s: ASZ, ground: false };
      }
    }
    var gx = spotX(a.x) + Math.sin(elapsed * 0.6 + a.ph) * 14;
    var size = sp === 'deer' ? ASZ * 1.3 : (sp === 'fox' ? ASZ * 1.1 : ASZ);
    return { x: gx, y: surfY(gx), s: size, ground: true };
  }
  function spotAt(px, py) {
    var best = -1, bd = 1e9;
    for (var i = 0; i < FW.GW; i++) {
      var sx = spotX(i), d = Math.abs(px - sx);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0 || bd > spotW * 0.62) return -1;
    if (Math.abs(py - surfY(spotX(best))) > 70) return -1;
    return best;
  }
  function handleTap(px, py) {
    if (screen !== 'game' || !st) return;
    FAu.unlock();
    var best = null, bd = 1e9, bp = null;
    for (var i = 0; i < st.animals.length; i++) {
      var a = st.animals[i], ap = animalPos(a);
      var d = Math.hypot(px - ap.x, py - (ap.y - ap.s * 0.45));
      if (d < ap.s * 0.62 && d < bd) { bd = d; best = a; bp = ap; }
    }
    if (best) {
      var r = FW.tapAnimal(st, best.id, FW.now());
      if (r.ok) {
        FAu.tap();
        toast(r.msg);
        if (r.fx) burst(bp.x, bp.y - bp.s * 0.4, r.fx);
        tutAdvance('tap');
      } else if (r.reason === 'resting') toast(FW.ANIMALS[best.species].name + ' is resting…');
      return;
    }
    var si = spotAt(px, py);
    if (si < 0) return;
    var tl = st.tiles[si];
    if (!tl.plant && !tl.mush) { openSheet(si); return; }
    if (tl.plant && tl.plant.stage === FW.ST.FALLEN) {
      var cr = FW.clearTile(st, si, 0);
      if (cr.ok) { FAu.plant(); toast('Cleared the old trunk'); }
      return;
    }
    if (tl.plant) {
      var pn = FW.PLANTS[tl.plant.type].name;
      var sn = ['soil', 'seed', 'sprout', 'sapling', 'adult', 'ancient', 'fallen trunk'][tl.plant.stage];
      toast(pn + ' · ' + sn);
    } else toast('Mushroom · weaving the web');
  }

  /* ---------------- tutorial ---------------- */
  var TUTS = [
    'Tap a glowing patch of soil to plant your first seed',
    'Trees grow on their own — watch their roots spread below',
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
  function perfNow() { return performance.now() / 1000; }
  function handleEvents(evs) {
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i], p = evXY(e);
      if (e.t === 'planted' && e.free) floater(p.x, p.y, 'free sprout!', '#c9ecb0');
      else if (e.t === 'grew') {
        if (e.stage === 2) FAu.sprout();
        else if (e.stage === 4) { FAu.grow(); floater(p.x, p.y, 'grown!', '#c9ecb0'); }
        else if (e.stage === 5) floater(p.x, p.y, 'ancient', '#e8d9ae');
        else if (e.stage === 6) { toast('An old tree has fallen — new homes for small ones'); }
      }
      else if (e.t === 'sniffing') { toast('Something\'s sniffing around…'); }
      else if (e.t === 'arrived') {
        FAu.arrive();
        toast('A ' + FW.ANIMALS[e.species].name + ' moved in!');
        burst(p.x, p.y, 'sparkle');
        tutAdvance('arrive');
      }
      else if (e.t === 'points' && e.x >= 0) floater(p.x, p.y, '+' + e.n, '#ffe9a8');
      else if (e.t === 'day') toast('Day ' + e.day + ' in the forest');
      else if (e.t === 'mushroom') {
        FAu.mush(); tutAdvance('mush');
        if (e.free) floater(p.x, p.y, 'wild mushroom!', '#c9ecb0');
      }
      else if (e.t === 'tapped' && e.fx) burst(p.x, p.y, e.fx);
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
  function rootZoneY(i) {
    var p = st.tiles[i].plant;
    var depth = p && p.stage <= FW.ST.ANCIENT ? treeH(p.stage) * 0.55 : UD * 0.16;
    return surfY(spotX(i)) + depth;
  }
  function render(now) {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bgCache, 0, 0, W, H);
    ctx.drawImage(soilCache, 0, 0, W, H);
    /* pond */
    var ppy = surfY(pondX);
    ctx.fillStyle = '#6fa8c8';
    ctx.beginPath(); ctx.ellipse(pondX, ppy + 7, 62, 19, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath(); ctx.ellipse(pondX - 15, ppy + 3, 28, 7, -0.1, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#4d8a44';
    ctx.beginPath(); ctx.ellipse(pondX + 30, ppy + 8, 12, 5, 0.2, 0, 6.2832); ctx.fill();
    /* mycelium + roots */
    for (var i = 0; i < FW.GW; i++) {
      var tl = st.tiles[i], sx = spotX(i), sy = surfY(sx);
      if (tl.mush) {
        var my = FArt.mycelium(i % 5);
        var mw = spotW * 2.1, mh = mw * 80 / 160;
        ctx.drawImage(my, sx - mw / 2, sy + 1, mw, mh);
      }
      var p = tl.plant;
      if (p && p.stage >= FW.ST.SEED && p.stage <= FW.ST.ANCIENT) {
        var rs = FArt.roots(p.type, p.stage, i * 3 + p.stage);
        var rh = treeH(p.stage) * 1.0, rw = rh * 1.1;
        ctx.drawImage(rs, sx - rw / 2, sy + 1, rw, rh);
      }
    }
    /* the web, glowing between root zones */
    var links = [];
    for (var li = 0; li < FW.GW - 1; li++) {
      var n1 = st.tiles[li].net, n2 = st.tiles[li + 1].net;
      if (n1 && n1 === n2) {
        links.push({ x1: spotX(li), y1: rootZoneY(li), x2: spotX(li + 1), y2: rootZoneY(li + 1) });
      }
    }
    FArt.drawWeb(ctx, links, now);
    /* trees + mushrooms on the surface */
    for (var ti = 0; ti < FW.GW; ti++) {
      var t2 = st.tiles[ti], s2x = spotX(ti), s2y = surfY(s2x);
      var vv = (ti * 5) % 3;
      if (t2.mush) {
        var ms = spotW * 1.05;
        ctx.drawImage(FArt.mushroom(ti % 3), s2x - ms / 2, s2y - ms * 0.92, ms, ms);
      }
      if (t2.plant) {
        var ps = TREE_PX[t2.plant.stage] || 40;
        ctx.drawImage(FArt.tree(t2.plant.type, t2.plant.stage, vv), s2x - ps / 2, s2y - ps * 0.94, ps, ps);
      }
      if (!t2.plant && !t2.mush && tutStep === 0 && !tutDone && ti === 5) {
        var pu = 0.5 + 0.5 * Math.sin(now * 4);
        ctx.strokeStyle = 'rgba(255,235,170,' + (0.5 + 0.5 * pu).toFixed(3) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(s2x, s2y, spotW * 0.42, 12, 0, 0, 6.2832); ctx.stroke();
      }
    }
    /* animals */
    for (var a = 0; a < st.animals.length; a++) {
      var an = st.animals[a], ap = animalPos(an);
      if (ap.ground) {
        ctx.fillStyle = 'rgba(20,15,8,0.22)';
        ctx.beginPath(); ctx.ellipse(ap.x, surfY(ap.x) + 5, ap.s * 0.3, ap.s * 0.09, 0, 0, 6.2832); ctx.fill();
      }
      var bob = ap.ground ? 0 : Math.sin(now * 2.4 + an.ph) * 3;
      ctx.drawImage(FArt.animal(an.species, an.id % 2), ap.x - ap.s / 2, ap.y - ap.s * 0.94 + bob, ap.s, ap.s);
      if (an.cd > FW.now()) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '700 15px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('…', ap.x, ap.y - ap.s * 0.98);
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
    for (var pi = parts.length - 1; pi >= 0; pi--) {
      var pt = parts[pi];
      pt.t += 1 / 60;
      if (pt.t > pt.life) { parts.splice(pi, 1); continue; }
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
      ctx.font = '800 15px system-ui';
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
    if (!load()) {
      st = FW.newGame((Date.now() ^ (Math.random() * 1e9)) | 0);
      if (migrated) setTimeout(function () { toast('The forest has a new view — your grove regrew with it'); }, 600);
    }
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
    simNow: function () { return FW.now(); },
    spotXY: function (i) {
      var r = canvas.getBoundingClientRect(), sx = spotX(i);
      return { x: r.left + sx, y: r.top + surfY(sx) };
    }
  };
})();
