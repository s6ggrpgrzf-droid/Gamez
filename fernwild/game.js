/* Fernwild game — side-view cross-section. Scenes, input, HUD, tutorial, loop, persistence. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game'), ctx = canvas.getContext('2d');
  var titleCanvas = $('title-bg'), tctx = titleCanvas.getContext('2d');

  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0;
  var SY = 0, botY = 0, UD = 0, spotW = 0, padX = 16, pondX = 0, worldW = 0;
  var ASZ = 46;
  var bgCache = null, soilCache = null, titleCache = null, lastTitleDraw = 0, bgSeason = -1;
  function rebuildBG() {
    bgSeason = st ? st.season : 1;
    bgCache = FArt.gameBG(Math.round(worldW), Math.round(H), Math.round(SY), 0, bgSeason);
  }
  /* camera: world coords at z=1 match the old screen layout; camX = world x at screen center */
  var camX = 0, camZ = 1, fdt = 0;
  var VISIBLE_SPOTS = 12;

  var st = null;            /* FW sim state */
  var screen = 'title';
  var floaters = [], parts = [], ripples = [], rippleT = 1;
  var flashT = 0, shakeT = 0, seasonSweepT = 0, wxShown = null, wxFade = 1, bounceMap = {};
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
    spotW = (W - padX * 2) / VISIBLE_SPOTS;
    worldW = padX * 2 + FW.GW * spotW;
    pondX = worldW * 0.78;
    ASZ = Math.max(34, Math.min(56, spotW * 1.5));
    bgCache = FArt.gameBG(Math.round(worldW), Math.round(H), Math.round(SY), 0, st ? st.season : 1);
    bgSeason = st ? st.season : 1;
    soilCache = FArt.underground(Math.round(worldW), Math.round(H), surfY, Math.round(botY));
    titleCache = null;
    if (!camX) camX = padX + (VISIBLE_SPOTS / 2) * spotW; /* start framed on the first grove */
    clampCam();
  }
  function clampCam() {
    var viewW = W / camZ;
    if (viewW >= worldW) camX = worldW / 2;
    else camX = Math.max(viewW / 2, Math.min(worldW - viewW / 2, camX));
  }
  function w2sX(wx) { return W / 2 + (wx - camX) * camZ; }   /* world -> screen */
  function s2wX(sx) { return camX + (sx - W / 2) / camZ; }     /* screen -> world */
  function applyCam() {
    var shx = shakeT > 0 ? (Math.random() * 2 - 1) * 5 * shakeT : 0;
    var shy = shakeT > 0 ? (Math.random() * 2 - 1) * 3 * shakeT : 0;
    ctx.setTransform(DPR * camZ, 0, 0, DPR * camZ, DPR * (W / 2 - (camX + shx) * camZ), shy * DPR * camZ);
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
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
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

  /* ---------------- forest AI (gamez-ai worker; everything optional) ---------------- */
  var AI_BASE = 'https://gamez-ai.chaoticutopia84.workers.dev';
  function aiFetch(kind, payload, cb) {
    var done = false;
    var timer = setTimeout(function () { fin(null); }, 7000);
    function fin(t) { if (!done) { done = true; clearTimeout(timer); cb(t); } }
    try {
      fetch(AI_BASE + '/g', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: kind, game: 'fernwild', ctx: payload })
      }).then(function (r) { return r.json(); })
        .then(function (d) { fin(d && !d.error ? d : null); })
        .catch(function () { fin(null); });
    } catch (e) { fin(null); }
  }
  /* chronicle: one storybook line per day, stored locally */
  var chronLog = [], dayNotes = [];
  try { chronLog = JSON.parse(localStorage.getItem('fw_chron') || '[]'); } catch (e) { chronLog = []; }
  function saveChron() {
    try {
      if (chronLog.length > 30) chronLog = chronLog.slice(-30);
      localStorage.setItem('fw_chron', JSON.stringify(chronLog));
    } catch (e) {}
  }
  function noteDay(s) {
    dayNotes.push(s);
    if (dayNotes.length > 8) dayNotes.shift();
  }
  function writeChronicle(day) {
    if (!dayNotes.length) return;
    var summary = dayNotes.join('; ');
    dayNotes = [];
    aiFetch('chronicle', { day: day, events: summary, seed: st.seed }, function (d) {
      if (d && d.text) {
        chronLog.push({ day: day, text: d.text });
        saveChron();
      }
    });
  }

  /* ---------------- wandering events: the AI writes the story, the sim applies it ---------------- */
  var WILD_TEMPLATES = [
    { kind: 'seed',  hint: 'a jay drops a strange seed at the forest edge' },
    { kind: 'mush',  hint: 'a fairy ring of mushrooms glows at dusk' },
    { kind: 'boost', hint: 'a traveling painted lady butterfly rests on a leaf' },
    { kind: 'boost', hint: 'a warm sun-shower drifts over the canopy' }
  ];
  function maybeWildEvent(day) {
    if (day < 2 || !st) return;
    var lastDay = 0;
    try { lastDay = parseInt(localStorage.getItem('fw_wildday') || '0', 10); } catch (e) {}
    if (lastDay >= day) return;
    var tpl = WILD_TEMPLATES[day % WILD_TEMPLATES.length];
    aiFetch('wildevent', { day: day, hint: tpl.hint, seed: st.seed }, function (d) {
      if (!d || !d.title || !d.text) return;
      try { localStorage.setItem('fw_wildday', String(day)); } catch (e) {}
      showWildEvent(d, tpl.kind);
    });
  }
  function showWildEvent(d, kind) {
    $('wild-title').textContent = d.title;
    $('wild-text').textContent = d.text;
    var ba = $('wild-a'), bb = $('wild-b');
    ba.textContent = d.a || 'Tend it';
    bb.textContent = d.b || 'Just watch';
    function close() { $('wild-event').classList.add('hidden'); }
    ba.onclick = function () {
      close(); FAu.tap();
      var r = FW.wildGift(st, kind, FW.now());
      if (r.ok && r.x >= 0) {
        var px = spotX(r.x);
        floater(px, surfY(px) - 50, r.what === 'seed' ? 'a wild seed sprouts!' : (r.what === 'mushroom' ? 'wild mushrooms!' : 'the forest glows!'), '#c9ecb0');
        burst(px, surfY(px) - 30, 'petals');
        noteDay('something wild happened at the forest edge');
      } else if (r.ok) {
        floater(W / 2, SY - 60, 'the forest glows!', '#c9ecb0');
      } else {
        st.points += 8;
        toast('The forest thanks you anyway (+8 leaves)');
      }
    };
    bb.onclick = function () {
      close(); FAu.tap();
      st.points += 6;
      toast('You watch quietly (+6 leaves)');
    };
    $('wild-event').classList.remove('hidden');
    FAu.arrive();
  }
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

  /* ---------------- input: tap, drag-pan, pinch-zoom ---------------- */
  var pointers = {}, pdown = null, pinchD0 = 0, pinchZ0 = 1, pinchMid0 = 0, movedFar = false;
  canvas.addEventListener('pointerdown', function (e) {
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 1) {
      pdown = { x: e.clientX, y: e.clientY };
      movedFar = false;
    } else if (ids.length === 2) {
      var p1 = pointers[ids[0]], p2 = pointers[ids[1]];
      pinchD0 = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      pinchZ0 = camZ; pinchMid0 = (p1.x + p2.x) / 2;
      pdown = null; /* a pinch is never a tap */
    }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!pointers[e.pointerId]) return;
    var prev = pointers[e.pointerId];
    var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      var p1 = pointers[ids[0]], p2 = pointers[ids[1]];
      var d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      if (pinchD0 > 0 && d > 0) {
        var mid = (p1.x + p2.x) / 2;
        var nz = Math.max(0.5, Math.min(1.8, pinchZ0 * d / pinchD0));
        /* keep the world point under the pinch midpoint stable */
        var worldUnder = camX + (pinchMid0 - W / 2) / pinchZ0;
        camZ = nz;
        camX = worldUnder - (mid - W / 2) / nz;
        clampCam();
      }
      return;
    }
    if (pdown && ids.length === 1) {
      var tdx = e.clientX - pdown.x, tdy = e.clientY - pdown.y;
      if (tdx * tdx + tdy * tdy > 144) movedFar = true;
      if (movedFar) { camX -= dx / camZ; clampCam(); }
    }
  });
  function endPointer(e) {
    var wasTap = !!(pdown && !movedFar && Object.keys(pointers).length === 1);
    delete pointers[e.pointerId];
    if (Object.keys(pointers).length === 0) {
      if (wasTap) handleTap(e.clientX, e.clientY);
      pdown = null;
    } else if (Object.keys(pointers).length === 1) {
      /* dropping from pinch back to one finger: re-anchor */
      var id = Object.keys(pointers)[0];
      pdown = { x: pointers[id].x, y: pointers[id].y };
      movedFar = true; /* don't fire a tap after pinching */
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', function (e) {
    if (screen !== 'game') return;
    e.preventDefault();
    var nz = Math.max(0.5, Math.min(1.8, camZ * (e.deltaY < 0 ? 1.12 : 0.89)));
    var worldUnder = camX + (e.clientX - W / 2) / camZ;
    camZ = nz;
    camX = worldUnder - (e.clientX - W / 2) / nz;
    clampCam();
  }, { passive: false });

  /* ---------------- animal visual state (movement FSM, game-side only) ---------------- */
  var avis = {};
  function animV(a) {
    var v = avis[a.id];
    if (!v) v = avis[a.id] = {
      x: spotX(a.x), y: surfY(spotX(a.x)), tx: spotX(a.x), ty: 0,
      mode: 'idle', t: 1 + Math.random() * 3, hopT: 0, sx: 0, sy: 0, init: false
    };
    return v;
  }
  function gcAvis() {
    var alive = {};
    for (var i = 0; i < st.animals.length; i++) alive[st.animals[i].id] = 1;
    for (var id in avis) if (!alive[id]) delete avis[id];
  }
  function wanderGround(a, v, homeX) {
    v.t -= fdt;
    if (Math.abs(v.x - homeX) > spotW * 4) { v.x = homeX; v.tx = homeX; v.mode = 'idle'; v.t = 1; }
    if (v.mode === 'idle') {
      if (v.t <= 0) {
        v.mode = 'walk';
        v.tx = Math.max(padX + 8, Math.min(worldW - padX - 8, homeX + (Math.random() * 2 - 1) * spotW * 3));
      }
    } else {
      var dx = v.tx - v.x, sp = 36;
      v.x += Math.sign(dx) * Math.min(Math.abs(dx), sp * fdt);
      if (Math.abs(dx) < 2) { v.mode = 'idle'; v.t = 2 + Math.random() * 4; }
    }
  }
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
    var sp = a.species, v = animV(a);
    if (sp === 'vole') {
      var vx = spotX(a.x), vy = surfY(vx) + 36;
      var gnawing = st.tiles[a.x] && st.tiles[a.x].gnawedUntil > FW.now();
      var wig = gnawing ? Math.sin(elapsed * 9 + a.ph) * 4 : Math.sin(elapsed * 2 + a.ph) * 2;
      return { x: vx + wig, y: vy, s: ASZ * 0.8, ground: false, vole: true, gnawing: !!gnawing };
    }
    if (sp === 'frog') {
      if (!v.init) { v.init = true; v.x = pondX; v.y = surfY(pondX) + 2; v.tx = v.x; v.ty = v.y; }
      v.t -= fdt;
      if (v.mode === 'idle' && v.t <= 0) {
        v.mode = 'hop'; v.hopT = 0; v.sx = v.x; v.sy = v.y;
        v.tx = pondX + (Math.random() * 2 - 1) * 44;
        v.ty = surfY(v.tx) + 2;
      } else if (v.mode === 'hop') {
        v.hopT += fdt / 0.55;
        if (v.hopT >= 1) { v.mode = 'idle'; v.t = 2 + Math.random() * 4; v.x = v.tx; v.y = v.ty; }
        else {
          v.x = v.sx + (v.tx - v.sx) * v.hopT;
          v.y = v.sy + (v.ty - v.sy) * v.hopT - Math.sin(v.hopT * Math.PI) * 46;
        }
      }
      var croak = 1 + 0.18 * Math.max(0, Math.sin(elapsed * 2.2 + a.ph * 3));
      return { x: v.x, y: v.y, s: ASZ * 0.95 * croak, ground: true, hopping: v.mode === 'hop' };
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
        var dart = Math.sin(elapsed * 0.23 + a.ph * 2) > 0.93 ? 14 : 0; /* sudden dash */
        return { x: sx + Math.sin(elapsed * 0.8 + a.ph) * 9 + dart, y: sy - treeH(st.tiles[si].plant.stage) * climb, s: ASZ * 0.9, ground: false };
      }
    }
    if (sp === 'owl') {
      var oi = nearestTree(spotX(a.x), FW.ST.ADULT);
      if (oi >= 0) {
        var ox = spotX(oi), oy = surfY(ox);
        var sway = Math.sin(elapsed * 1.1 + a.ph) * 3;
        var look = Math.sin(elapsed * 0.31 + a.ph * 2) > 0.7 ? 6 : 0; /* head turn */
        return { x: ox + 12 + look, y: oy - treeH(st.tiles[oi].plant.stage) * 0.94 + sway, s: ASZ, ground: false };
      }
    }
    if (sp === 'heron') {
      /* statue at the pond's edge */
      var hx = pondX - 82, hy = surfY(hx);
      var breathe = Math.sin(elapsed * 0.9 + a.ph) * 1.5;
      return { x: hx, y: hy + breathe, s: ASZ * 1.5, ground: true };
    }
    /* ground wanderers: rabbit, fox, deer, hedgehog */
    var homeX = spotX(a.x);
    wanderGround(a, v, homeX);
    var gy = surfY(v.x), graze = 0, hopY = 0;
    if (sp === 'deer') {
      var gc = (elapsed * 0.45 + a.ph) % 9;
      if (gc < 1.6) graze = 13 * Math.sin(gc / 1.6 * Math.PI);
    }
    if (sp === 'rabbit' && v.mode === 'walk') hopY = Math.abs(Math.sin(elapsed * 11)) * 15;
    if (sp === 'fox' && v.mode === 'walk') hopY = Math.abs(Math.sin(elapsed * 13)) * 7;
    if (sp === 'hedgehog') v.x += Math.sin(elapsed * 22 + a.ph) * 0.8; /* shuffle */
    var size = sp === 'deer' ? ASZ * 1.3 : (sp === 'fox' ? ASZ * 1.1 : ASZ);
    return { x: v.x, y: gy - hopY + graze, s: size, ground: true, walking: v.mode === 'walk' };
  }
  function spotAt(px, py) {
    var wx = s2wX(px);
    var best = -1, bd = 1e9;
    for (var i = 0; i < FW.GW; i++) {
      var sx = spotX(i), d = Math.abs(wx - sx);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0 || bd > spotW * 0.62) return -1;
    if (Math.abs(py - surfY(spotX(best))) > 70) return -1;
    return best;
  }
  function handleTap(px, py) {
    if (screen !== 'game' || !st) return;
    FAu.unlock();
    var wx = s2wX(px);
    var best = null, bd = 1e9, bp = null;
    for (var i = 0; i < st.animals.length; i++) {
      var a = st.animals[i], ap = animalPos(a);
      var d = Math.hypot(wx - ap.x, py - (ap.y - ap.s * 0.45));
      if (d < ap.s * 0.62 && d < bd) { bd = d; best = a; bp = ap; }
    }
    if (best) {
      var r = FW.tapAnimal(st, best.id, FW.now());
      if (r.ok) {
        FAu.tap();
        var tmsg = r.msg;
        if (best.name) tmsg = tmsg.replace(FW.ANIMALS[best.species].name, best.name);
        toast(tmsg);
        if (r.fx) burst(bp.x, bp.y - bp.s * 0.4, r.fx);
        tutAdvance('tap');
      } else if (r.reason === 'resting') toast((best.name || FW.ANIMALS[best.species].name) + ' is resting…');
      return;
    }
    var si = spotAt(px, py);
    if (si < 0) return;
    var tl = st.tiles[si];
    if (!tl.plant && !tl.mush) { openSheet(si); return; }
    if (tl.fire > 0) {
      var sm = FW.smother(st, si, 0, FW.now());
      if (sm.out) { FAu.tap(); floater(spotX(si), surfY(spotX(si)) - 60, 'smothered!', '#cfe8ff'); }
      else if (sm.ok) { FAu.tap(); floater(spotX(si), surfY(spotX(si)) - 60, 'pfft…', '#cfe8ff'); }
      return;
    }
    if (tl.plant && tl.plant.stage === FW.ST.FALLEN) {
      var cr = FW.clearTile(st, si, 0);
      if (cr.ok) { FAu.plant(); toast('Cleared the old trunk'); }
      return;
    }
    if (tl.plant) {
      var pn = FW.PLANTS[tl.plant.type].name;
      var sn = ['soil', 'seed', 'sprout', 'sapling', 'adult', 'ancient', 'fallen trunk'][tl.plant.stage];
      toast(pn + ' · ' + sn + (tl.gnawedUntil > FW.now() ? ' · roots gnawed!' : ''));
    } else toast('Mushroom · weaving the web');
  }

  /* ---------------- tutorial ---------------- */
  var TUTS = [
    'Tap a glowing patch of soil to plant your first seed',
    'Trees grow on their own — swipe to look around, pinch to zoom out',
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
      if (e.t === 'planted') {
        if (e.free) floater(p.x, p.y, 'free sprout!', '#c9ecb0');
        for (var pf = 0; pf < 8; pf++) {
          var pfa = Math.random() * 6.2832, pfsp = 20 + Math.random() * 40;
          parts.push({
            x: p.x, y: p.y, vx: Math.cos(pfa) * pfsp, vy: -30 - Math.random() * 30,
            t: 0, life: 0.5 + Math.random() * 0.3, kind: 'puff', col: '#8a6f52'
          });
        }
      }
      else if (e.t === 'grew') {
        var gti = e.y * FW.GW + e.x;
        if (e.stage === 2 || e.stage === 4) { bounceMap[gti] = 1; burst(p.x, p.y - 24, 'sparkle'); }
        if (e.stage === 2) FAu.sprout();
        else if (e.stage === 4) { FAu.grow(); floater(p.x, p.y, 'grown!', '#c9ecb0'); }
        else if (e.stage === 5) { floater(p.x, p.y, 'ancient', '#e8d9ae'); noteDay('a ' + (FW.PLANTS[e.type] || {}).name.toLowerCase() + ' turned ancient'); }
        else if (e.stage === 6) { toast('An old tree has fallen — new homes for small ones'); noteDay('an old tree fell'); }
      }
      else if (e.t === 'sniffing') { toast('Something\'s sniffing around…'); }
      else if (e.t === 'arrived') {
        FAu.arrive();
        burst(p.x, p.y, 'sparkle');
        tutAdvance('arrive');
        noteDay('a ' + FW.ANIMALS[e.species].name.toLowerCase() + ' moved in');
        /* name the newcomer, then announce */
        (function (sp, ex, why) {
          aiFetch('crittername', { species: sp, n: st.stats.arrivals }, function (d) {
            var nm = d && d.text ? d.text : null, an = null, bestId = -1;
            for (var i = 0; i < st.animals.length; i++) {
              var ca = st.animals[i];
              if (ca.species === sp && ca.id > bestId) { bestId = ca.id; an = ca; }
            }
            if (an && nm) an.name = nm;
            var who = (an && an.name ? an.name + ' the ' : 'A ') + FW.ANIMALS[sp].name.toLowerCase();
            toast(who.charAt(0).toUpperCase() + who.slice(1) + ' moved in!');
          });
        })(e.species, e.x, e.y);
      }
      else if (e.t === 'points' && e.x >= 0) floater(p.x, p.y, '+' + e.n, '#ffe9a8');
      else if (e.t === 'day') {
        toast('Day ' + e.day + ' in the forest');
        writeChronicle(e.day);
        maybeWildEvent(e.day);
      }
      else if (e.t === 'mushroom') {
        FAu.mush(); tutAdvance('mush');
        if (e.free) floater(p.x, p.y, 'wild mushroom!', '#c9ecb0');
      }
      else if (e.t === 'tapped' && e.fx) burst(p.x, p.y, e.fx);
      else if (e.t === 'left') { FAu.leave(); toast('The ' + FW.ANIMALS[e.species].name + ' moved on…'); }
      else if (e.t === 'ach') { FAu.achieve(); achToast(FW.ACH[e.id].name, FW.ACH[e.id].desc); }
      else if (e.t === 'storm-start') { FAu.storm(); toast('A storm rolls in!'); noteDay('a storm rolled through'); }
      else if (e.t === 'storm-end') { toast('The storm passes'); }
      else if (e.t === 'ignited') { FAu.storm(); flashT = 1; shakeT = 1; toast('Lightning struck a tree! Tap the flames — or call a storm'); noteDay('lightning struck a tree'); }
      else if (e.t === 'burnout') { toast('The tree burned down — its ash feeds the soil'); noteDay('a tree burned down'); }
      else if (e.t === 'smothered') { /* floater already shown at tap */ }
      else if (e.t === 'sucker') { FAu.sprout(); floater(p.x, p.y, 'root sucker!', '#c9ecb0'); noteDay('an aspen sent up a root sucker'); }
      else if (e.t === 'fled') { /* tap toast already shown */ }
      else if (e.t === 'pooped' && e.loud) { floater(p.x, p.y - 8, 'poop!', '#c9b083'); }
      else if (e.t === 'season') {
        var snames = ['Spring arrives', 'Summer arrives', 'Autumn arrives', 'Winter arrives'];
        var snotes = ['blossoms opened across the forest', 'the forest hums with heat',
                      'leaves turned amber and gold', 'the first snow fell'];
        toast(snames[e.season] + '!');
        noteDay(snotes[e.season]);
        rebuildBG();
        FAu.season();
        seasonSweepT = 1;
        /* celebration: leaves, petals, or snow drifting down over the visible forest */
        var skind = e.season === 3 ? 'snow' : e.season === 2 ? 'leaf' : 'petals';
        var scol = skind === 'snow' ? '#f4f8fb' : skind === 'leaf' ? '#d8a24a' : '#f2c9de';
        var svx = camX - W / camZ / 2, svw = W / camZ;
        for (var si2 = 0; si2 < 36; si2++) {
          parts.push({
            x: svx + Math.random() * svw, y: -20 - Math.random() * 120,
            vx: (Math.random() * 2 - 1) * 22, vy: 44 + Math.random() * 44,
            t: 0, life: 3 + Math.random() * 2, kind: skind, col: scol
          });
        }
      }
      else if (e.t === 'variant') {
        var vnames = { golden: 'a golden sapling', rainbow: 'a rainbow sapling', bloom: 'a blooming sapling' };
        toast('Rare! ' + (vnames[e.variant] || 'a rare sapling') + ' sprouted!');
        noteDay('a rare ' + e.variant + ' ' + e.type + ' sprouted');
      }
      else if (e.t === 'foxhunt') { toast('The fox chases the rabbit!'); noteDay('the fox chased a rabbit'); }
      else if (e.t === 'owlhunt') { toast('The owl swoops at a vole!'); noteDay('the owl hunted at night'); }
      else if (e.t === 'quest') { FAu.achieve(); toast('Quest complete: ' + e.id + ' — claim it in the quest board!'); refreshQuests(); }
      else if (e.t === 'daily') { /* modal handles it */ }
      else if (e.t === 'weather') {
        var wnames = { clear: 'The sky clears', cloudy: 'Clouds gather', rain: 'Rain sweeps in', storm: 'A storm rolls in!',
                       drought: 'A dry spell settles in', fog: 'Fog drifts through', wind: 'The wind picks up' };
        if (wnames[e.kind]) toast(wnames[e.kind]);
        if (e.kind === 'storm') FAu.rumble();
        if (e.kind === 'rain' || e.kind === 'drought') noteDay(wnames[e.kind].toLowerCase());
      }
      else if (e.t === 'heroncatch') {
        toast('The heron spears a fish!'); noteDay('the heron caught a fish');
        FAu.plip();
        var hpy = surfY(pondX);
        for (var hr = 0; hr < 2; hr++) {
          ripples.push({ x: pondX + (Math.random() * 2 - 1) * 30, y: hpy + 4 + Math.random() * 8, t: hr * 0.3 });
        }
      }
      else if (e.t === 'fishreturn') { toast('Fish return to the pond'); }
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
  var ECO = {
    pine: 'Keeps each needle for years — one needle can photosynthesize for a decade.',
    berry: 'Berries are built to be eaten — seeds that pass through a bird sprout better.',
    aspen: 'A grove is often one organism — Utah\u2019s Pando clone weighs 6,000 tons.',
    oak: 'One oak can shelter 2,000 species — more than any other tree.',
    mushroom: 'The biggest living thing on Earth is an Oregon honey fungus — miles of mycelium.',
    squirrel: 'Forgets most buried acorns — the forgotten ones plant forests.',
    rabbit: 'Teeth never stop growing — constant gnawing keeps them filed.',
    butterfly: 'Tastes with its feet — drums on leaves to pick the right plant.',
    fox: 'Hears a mouse squeak from 100 meters and pounces on it.',
    owl: 'Fringed wing feathers muffle sound — its flight is nearly silent.',
    deer: 'No upper front teeth — grinds plants with tough dental pads.',
    hedgehog: 'Shrugs off most snake venom — and happily eats snakes.',
    frog: 'Drinks through its skin — it soaks, never sips.',
    heron: 'Stands motionless for hours — then strikes faster than you can blink.',
    vole: 'Its tunnels aerate the soil — an engineer, and a root-nibbler.'
  };
  function buildJournal() {
    var sp = $('journal-species'); sp.innerHTML = '';
    /* forest records */
    var rl = $('journal-records'); rl.innerHTML = '';
    var recs = [
      [Math.round(st.stats.tallest || 0) + ' m', 'tallest tree'],
      [(st.stats.widestWeb || 0) + ' trees', 'widest web'],
      ['Day ' + st.day, 'forest age']
    ];
    recs.forEach(function (r) {
      var d = document.createElement('div'); d.className = 'rec';
      var b = document.createElement('b'); b.textContent = r[0];
      var s = document.createElement('span'); s.textContent = r[1];
      d.appendChild(b); d.appendChild(s); rl.appendChild(d);
    });
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
      row(p.name, p.desc + ' — ' + ECO[k], st.stats.plantsSeen.indexOf(k) >= 0, function (g) { g.drawImage(FArt.tree(k, 4, 0), 0, 0, 88, 88); });
    });
    /* rare variants */
    var VNAMES = {
      golden: ['Golden tree', 'A rare golden variant — bonus leaves when it grows'],
      rainbow: ['Rainbow aspen', 'A rare rainbow aspen — bonus leaves when it grows'],
      bloom: ['Bloom bush', 'A berry bush heavy with extra blossom']
    };
    Object.keys(VNAMES).forEach(function (vk) {
      row(VNAMES[vk][0], VNAMES[vk][1], st.stats.variantsSeen.indexOf(vk) >= 0, function (g) {
        var tt = vk === 'rainbow' ? 'aspen' : vk === 'bloom' ? 'berry' : 'pine';
        g.drawImage(FArt.tree(tt, 4, 1, 0, 1, vk), 0, 0, 88, 88);
      });
    });
    var mushFound = st.tiles.some(function (t) { return t.mush; });
    row('Mushroom', 'Weaves the web — ' + ECO.mushroom, mushFound, function (g) { g.drawImage(FArt.mushroom(0), 0, 0, 88, 88); });
    FW.ANIMAL_IDS.forEach(function (id) {
      var a = FW.ANIMALS[id];
      row(a.name, 'Needs: ' + a.need + ' — ' + ECO[id], st.stats.speciesSeen.indexOf(id) >= 0, function (g) { g.drawImage(FArt.animal(id, 0), 0, 0, 88, 88); });
    });
    $('disc-count').textContent = (st.stats.plantsSeen.length + (mushFound ? 1 : 0) + st.stats.speciesSeen.length) + ' / ' +
      (Object.keys(FW.PLANTS).length + 1 + FW.ANIMAL_IDS.length);
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
    /* chronicle */
    var ch = $('journal-chron'); ch.innerHTML = '';
    if (!chronLog.length) {
      var ce = document.createElement('div'); ce.className = 'chron-empty';
      ce.textContent = 'The forest is still young — its story begins soon.';
      ch.appendChild(ce);
    } else {
      for (var ci = chronLog.length - 1; ci >= 0; ci--) {
        var en = chronLog[ci];
        var cd = document.createElement('div'); cd.className = 'chron';
        var cb = document.createElement('b'); cb.textContent = 'DAY ' + en.day;
        var ct = document.createElement('span'); ct.textContent = en.text;
        cd.appendChild(cb); cd.appendChild(ct); ch.appendChild(cd);
      }
    }
  }

  /* ---------------- render ---------------- */
  function rootZoneY(i) {
    var p = st.tiles[i].plant;
    var depth = p && p.stage <= FW.ST.ANCIENT ? treeH(p.stage) * 0.55 : UD * 0.16;
    return surfY(spotX(i)) + depth;
  }
  function render(now) {
    /* clear in screen pixels first: when zoomed out the camera view extends past the world */
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    /* polish timers */
    flashT = Math.max(0, flashT - fdt * 3.2);
    shakeT = Math.max(0, shakeT - fdt * 2.6);
    seasonSweepT = Math.max(0, seasonSweepT - fdt / 1.6);
    var wk0 = st.weather.kind;
    if (wxShown !== wk0) { wxShown = wk0; wxFade = 0; }
    wxFade = Math.min(1, wxFade + fdt / 2.5);
    for (var bk in bounceMap) { bounceMap[bk] -= fdt * 2.2; if (bounceMap[bk] <= 0) delete bounceMap[bk]; }
    applyCam();
    var vx = camX - W / camZ / 2 - 4, vw = W / camZ + 8; /* visible world region */
    ctx.drawImage(bgCache, 0, 0, worldW, H);
    ctx.drawImage(soilCache, 0, 0, worldW, H);
    /* deep soil continues below the cached strata when zoomed out */
    ctx.fillStyle = '#33271a';
    ctx.fillRect(0, botY, worldW, H / camZ);
    /* pond */
    var ppy = surfY(pondX);
    var wxk = st.weather.kind;
    ctx.fillStyle = wxk === 'drought' ? '#5f93ad' : '#6fa8c8';
    ctx.beginPath(); ctx.ellipse(pondX, ppy + 7, 62, 19, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath(); ctx.ellipse(pondX - 15, ppy + 3, 28, 7, -0.1, 0, 6.2832); ctx.fill();
    /* koi circling beneath the surface */
    for (var kf = 0; kf < st.pond.fish.length; kf++) {
      var koi = st.pond.fish[kf];
      var kx = pondX + koi.x * 62, ky = ppy + 7 + koi.y * 19;
      var ksz = 30, facing = Math.cos(koi.a) < 0 ? -1 : 1;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.translate(kx, ky); ctx.scale(facing, 1);
      var wig = Math.sin(now * 6 + koi.a * 3) * 4;
      ctx.drawImage(FArt.koi(kf % 3), -ksz / 2, -ksz / 2 + wig * 0.2, ksz, ksz);
      ctx.restore();
    }
    /* lily pads drifting */
    for (var lp = 0; lp < 2; lp++) {
      var lpx = pondX - 28 + lp * 52 + Math.sin(now * 0.24 + lp * 2.4) * 7;
      var lpy = ppy + 9 + (lp % 2) * 6 + Math.cos(now * 0.3 + lp) * 2.5;
      var lsz = 44 - lp * 8;
      ctx.drawImage(FArt.lilyPad(lp), lpx - lsz / 2, lpy - lsz / 2, lsz, lsz);
    }
    /* dragonflies on warm days */
    if (!night && st.season !== 3) {
      for (var df = 0; df < 2; df++) {
        var dfx = pondX + Math.sin(now * 1.7 + df * 3.1) * 52 + Math.sin(now * 5.3 + df) * 9;
        var dfy = ppy - 26 - Math.abs(Math.sin(now * 2.3 + df * 1.7)) * 30;
        var dsz = 26;
        ctx.drawImage(FArt.dragonfly(df), dfx - dsz / 2, dfy - dsz / 2, dsz, dsz);
      }
    }
    /* ripples */
    rippleT -= fdt;
    if (rippleT <= 0) {
      rippleT = 1.6 + Math.random() * 1.6;
      ripples.push({ x: pondX + (Math.random() * 2 - 1) * 44, y: ppy + 4 + Math.random() * 10, t: 0 });
    }
    for (var rp = ripples.length - 1; rp >= 0; rp--) {
      var rip = ripples[rp];
      rip.t += fdt;
      if (rip.t > 1.6) { ripples.splice(rp, 1); continue; }
      ctx.globalAlpha = 0.4 * (1 - rip.t / 1.6);
      ctx.strokeStyle = '#e8f4fa'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(rip.x, rip.y, 6 + rip.t * 22, 2.5 + rip.t * 8, 0, 0, 6.2832); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    /* moonlight on the water */
    if (night) {
      ctx.fillStyle = 'rgba(244,240,220,' + (0.22 + 0.08 * Math.sin(now * 1.7)).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(pondX + 12, ppy + 6, 16, 5, 0.1, 0, 6.2832); ctx.fill();
    }
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
        var bnc = bounceMap[ti] > 0 ? 1 + Math.sin(bounceMap[ti] * Math.PI) * 0.18 : 1;
        var bps = ps * bnc;
        var timg = FArt.tree(t2.plant.type, t2.plant.stage, vv, t2.plant.charred, st.season, t2.plant.variant);
        var tdx = s2x - bps / 2, tdy = s2y - bps * 0.94;
        var swx = st.weather.kind, stg = t2.plant.stage;
        if (stg >= 3 && stg <= 5 && !t2.plant.charred) {
          /* trunk stays planted; only the crown pivots in the wind */
          var pivY = tdy + (stg === 3 ? 80 : stg === 5 ? 41 : 52) / 128 * bps;
          var wamp = swx === 'wind' ? 0.05 : swx === 'storm' ? 0.04 : 0.01;
          var wang = wamp * Math.sin(now * 2.1 + ti * 1.3);
          ctx.save();
          ctx.beginPath(); ctx.rect(tdx - 10, pivY, bps + 20, tdy + bps - pivY + 10); ctx.clip();
          ctx.drawImage(timg, tdx, tdy, bps, bps);
          ctx.restore();
          ctx.save();
          ctx.beginPath(); ctx.rect(tdx - 10, tdy - 10, bps + 20, pivY - tdy + 10); ctx.clip();
          ctx.translate(s2x, pivY); ctx.rotate(wang); ctx.translate(-s2x, -pivY);
          ctx.drawImage(timg, tdx, tdy, bps, bps);
          ctx.restore();
        } else {
          ctx.drawImage(timg, tdx, tdy, bps, bps);
        }
      }
      /* wildfire flames */
      if (t2.fire > 0) {
        var fr = (now * 7) | 0;
        var glow = 0.35 + 0.15 * Math.sin(now * 9 + ti);
        ctx.fillStyle = 'rgba(255,120,30,' + glow.toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(s2x, s2y - 40, 46, 60, 0, 0, 6.2832); ctx.fill();
        ctx.drawImage(FArt.fire(fr), s2x - 42, s2y - 96, 84, 84);
        if (Math.random() < fdt * 6) {
          parts.push({ x: s2x + (Math.random() * 2 - 1) * 24, y: s2y - 80, vx: (Math.random() * 2 - 1) * 20, vy: -60 - Math.random() * 40, t: 0, life: 0.9, kind: 'ember', col: '#ffb050' });
        }
      }
      /* vole gnaw warning */
      if (t2.gnawedUntil > FW.now() && t2.plant && t2.plant.stage >= FW.ST.SAPLING) {
        var gw2 = 0.55 + 0.45 * Math.sin(now * 6);
        ctx.fillStyle = 'rgba(215,70,45,' + gw2.toFixed(3) + ')';
        ctx.font = '800 22px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('!', s2x, s2y - treeH(t2.plant.stage) - 18);
      }
      if (!t2.plant && !t2.mush && tutStep === 0 && !tutDone && ti === 5) {
        var pu = 0.5 + 0.5 * Math.sin(now * 4);
        ctx.strokeStyle = 'rgba(255,235,170,' + (0.5 + 0.5 * pu).toFixed(3) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(s2x, s2y, spotW * 0.42, 12, 0, 0, 6.2832); ctx.stroke();
      }
    }
    /* dung mounds */
    for (var dg = 0; dg < st.dung.length; dg++) {
      var dgm = st.dung[dg], dsx = spotX(dgm.x), dsy = surfY(dsx);
      ctx.drawImage(FArt.dung(dgm.x % 2, st.season), dsx - 24, dsy - 44, 48, 48);
    }
    /* animals */
    for (var a = 0; a < st.animals.length; a++) {
      var an = st.animals[a], ap = animalPos(an);
      if (ap.vole) {
        /* tunneling: dark trail + dirt */
        ctx.fillStyle = 'rgba(30,22,14,0.30)';
        ctx.beginPath(); ctx.ellipse(ap.x, ap.y + 4, ap.s * 0.42, ap.s * 0.2, 0, 0, 6.2832); ctx.fill();
      } else if (ap.ground) {
        ctx.fillStyle = 'rgba(20,15,8,0.22)';
        ctx.beginPath(); ctx.ellipse(ap.x, surfY(ap.x) + 5, ap.s * 0.3, ap.s * 0.09, 0, 0, 6.2832); ctx.fill();
      }
      var bob = ap.ground && !ap.hopping ? 0 : Math.sin(now * 2.4 + an.ph) * 3;
      var spr = FArt.animal(an.species, an.id % 2);
      if (an.species === 'butterfly') {
        var fl = 0.7 + 0.3 * Math.abs(Math.sin(now * 9 + an.ph)); /* wing flap */
        ctx.drawImage(spr, ap.x - ap.s / 2, ap.y - ap.s * fl * 0.94 + bob, ap.s, ap.s * fl);
      } else {
        ctx.drawImage(spr, ap.x - ap.s / 2, ap.y - ap.s * 0.94 + bob, ap.s, ap.s);
      }
      if (ap.gnawing && Math.random() < fdt * 3) {
        parts.push({ x: ap.x + (Math.random() * 2 - 1) * 14, y: ap.y - 6, vx: (Math.random() * 2 - 1) * 26, vy: -24 - Math.random() * 20, t: 0, life: 0.7, kind: 'dirt', col: '#8a6f4d' });
      }
      if (an.cd > FW.now()) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '700 15px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('…', ap.x, ap.y - ap.s * 0.98);
      }
    }
    /* weather: rain streaks, fog bands, drought cracks (crossfaded in) */
    var wxk2 = st.weather.kind;
    if (wxk2 === 'rain' || st.storm > 0) {
      var dense = Math.round((st.storm > 0 ? 7 : 4) * wxFade);
      ctx.globalAlpha = wxFade;
      ctx.fillStyle = st.storm > 0 ? 'rgba(30,42,70,0.16)' : 'rgba(40,55,85,0.08)';
      ctx.fillRect(vx, 0, vw, H);
      ctx.globalAlpha = 1;
      for (var ri = 0; ri < dense; ri++) {
        parts.push({
          x: vx + Math.random() * vw, y: -12, vx: -50, vy: 430,
          t: 0, life: 1.8, kind: 'streak', col: 'rgba(160,200,255,' + (0.55 * wxFade).toFixed(3) + ')'
        });
      }
    }
    if (wxk2 === 'fog') {
      for (var fgi = 0; fgi < 4; fgi++) {
        var fgy = H * (0.2 + fgi * 0.16);
        var fgoff = (now * 14 + fgi * 340) % (vw + 400) - 200;
        var fgrd = ctx.createLinearGradient(vx + fgoff, 0, vx + fgoff + 340, 0);
        fgrd.addColorStop(0, 'rgba(230,238,242,0)');
        fgrd.addColorStop(0.5, 'rgba(230,238,242,' + (0.38 * wxFade).toFixed(3) + ')');
        fgrd.addColorStop(1, 'rgba(230,238,242,0)');
        ctx.fillStyle = fgrd;
        ctx.fillRect(vx + fgoff, fgy - 40, 340, 80);
      }
    }
    if (wxk2 === 'drought') {
      ctx.globalAlpha = wxFade;
      for (var cr = 0; cr < FW.GW; cr += 2) {
        var csx = spotX(cr), csy = surfY(csx);
        ctx.drawImage(FArt.cracks(cr % 2), csx - 40, csy + 4, 80, 80);
      }
      ctx.globalAlpha = 1;
    }
    /* lightning flash + season-change sweep */
    if (flashT > 0) {
      ctx.fillStyle = 'rgba(255,252,240,' + (flashT * 0.6).toFixed(3) + ')';
      ctx.fillRect(vx, 0, vw, H);
    }
    if (seasonSweepT > 0) {
      var scol = st.season === 3 ? '240,248,252' : st.season === 2 ? '232,180,120' : st.season === 0 ? '250,220,230' : '255,250,220';
      var sgrd = ctx.createLinearGradient(0, 0, 0, H);
      sgrd.addColorStop(0, 'rgba(' + scol + ',' + (0.32 * seasonSweepT).toFixed(3) + ')');
      sgrd.addColorStop(1, 'rgba(' + scol + ',0)');
      ctx.fillStyle = sgrd;
      ctx.fillRect(vx, 0, vw, H);
    }
    /* day/night: stars, moon, dark veil */
    var light = FW.dayLight(st), night = FW.isNight(st);
    if (light < 0.85) {
      var skyA = Math.min(1, Math.max(0, 0.55 - light) * 2.5);
      if (skyA > 0) {
        ctx.save();
        ctx.globalAlpha = skyA;
        ctx.translate(vx, 0);
        FArt.nightSky(ctx, vw, H, now, st.season === 3);
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(8,14,38,' + ((1 - light) * 0.42).toFixed(3) + ')';
      ctx.fillRect(vx, 0, vw, H);
    }
    /* fireflies on warm nights */
    if (night && st.season !== 3 && Math.random() < fdt * 3) {
      parts.push({
        x: vx + 4 + Math.random() * (vw - 8), y: SY * 0.35 + Math.random() * SY * 0.55,
        vx: (Math.random() * 2 - 1) * 14, vy: (Math.random() * 2 - 1) * 10,
        t: 0, life: 2.5, kind: 'glow', col: '#d8f27a'
      });
    }
    /* seasonal drift: snow, falling leaves, blossom petals */
    var se = st.season % 4;
    if (se === 3 && Math.random() < fdt * 14) {
      parts.push({
        x: vx + Math.random() * vw, y: -10, vx: -18 + Math.random() * 18, vy: 42 + Math.random() * 30,
        t: 0, life: 7, kind: 'snow', col: '#ffffff'
      });
    } else if (se === 2 && Math.random() < fdt * 4) {
      var lcols = ['#c97a2e', '#d89a3b', '#a85a24', '#b8682e'];
      parts.push({
        x: vx + Math.random() * vw, y: SY * 0.25 + Math.random() * SY * 0.3,
        vx: -34 + Math.random() * 20, vy: 26 + Math.random() * 22,
        t: 0, life: 5, kind: 'leaf', col: lcols[(Math.random() * 4) | 0]
      });
    } else if (se === 0 && Math.random() < fdt * 3) {
      parts.push({
        x: vx + Math.random() * vw, y: SY * 0.3 + Math.random() * SY * 0.3,
        vx: -26 + Math.random() * 16, vy: 20 + Math.random() * 18,
        t: 0, life: 5, kind: 'leaf', col: Math.random() < 0.5 ? '#f2c9d4' : '#fbeef2'
      });
    }
    /* particles */
    for (var pi = parts.length - 1; pi >= 0; pi--) {
      var pt = parts[pi];
      pt.t += 1 / 60;
      if (pt.t > pt.life) { parts.splice(pi, 1); continue; }
      pt.x += pt.vx / 60; pt.y += pt.vy / 60; pt.vy += (pt.kind === 'streak' ? 0 : 60) / 60;
      if (pt.kind === 'snow' || pt.kind === 'leaf') pt.x += Math.sin(now * 2 + pt.t * 3 + pt.y * 0.02) * 0.7;
      if (pt.kind === 'glow') {
        var ga = Math.max(0, (1 - pt.t / pt.life) * (0.6 + 0.4 * Math.sin(now * 6 + pt.x)));
        ctx.globalAlpha = ga * 0.35;
        ctx.fillStyle = pt.col;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 8, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = ga;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 3, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
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
    var nowS = perfNow();
    if (nowS - lastDial > 1) { lastDial = nowS; drawDial(); drawWx(); }
    if (nowS - lastDailyCheck > 30) { lastDailyCheck = nowS; checkDaily(); }
  }

  /* ---------------- loop ---------------- */
  var last = 0, ambT = 0;
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
    fdt = dt;
    var rem = dt, n = 0;
    while (rem > 0 && n++ < 4) { var c = Math.min(rem, 0.05); handleEvents(FW.step(st, c)); rem -= c; }
    var now = perfNow();
    render(now);
    hud();
    /* ambience follows the forest: birds by day, crickets by night, rain, fire */
    ambT += dt;
    if (ambT > 1) {
      ambT = 0;
      var anyFire = false;
      for (var fi = 0; fi < FW.GW; fi++) if (st.tiles[fi].fire > 0) { anyFire = true; break; }
      FAu.ambTick({ night: FW.isNight(st), storm: st.storm > 0, fire: anyFire,
                    rain: st.weather.kind === 'rain', wind: st.weather.kind === 'wind' });
    }
    saveT += dt;
    if (saveT > 5) { saveT = 0; gcAvis(); save(); }
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
    checkDaily();
    refreshQuests();
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

  /* ---------------- season dial ---------------- */
  var lastDial = 0;
  function drawDial() {
    var dc = $('hud-dial'); if (!dc) return;
    var g = dc.getContext('2d');
    var cx = 44, cy = 44;
    g.clearRect(0, 0, 88, 88);
    var se = st.season % 4;
    var ringCols = ['#7fb069', '#d9a441', '#c97a2e', '#a8c8e0'];
    g.fillStyle = 'rgba(22,33,15,0.72)';
    g.beginPath(); g.arc(cx, cy, 40, 0, 6.2832); g.fill();
    g.lineWidth = 5; g.strokeStyle = ringCols[se];
    g.beginPath(); g.arc(cx, cy, 36, 0, 6.2832); g.stroke();
    var night = FW.isNight(st), px, py;
    if (!night) {
      var ang = (st.tod - 0.25) / 0.5 * Math.PI;
      px = cx - Math.cos(ang) * 22; py = cy - Math.sin(ang) * 22;
    } else {
      var nt = st.tod < 0.25 ? st.tod + 1 : st.tod;
      var na = (nt - 0.75) / 0.5 * Math.PI;
      px = cx - Math.cos(na) * 22; py = cy - Math.sin(na) * 22;
    }
    g.strokeStyle = 'rgba(242,232,201,0.35)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx - 24, cy); g.lineTo(cx + 24, cy); g.stroke();
    if (!night) {
      g.fillStyle = 'rgba(255,217,100,0.3)';
      g.beginPath(); g.arc(px, py, 13, 0, 6.2832); g.fill();
      g.fillStyle = '#ffd964';
      g.beginPath(); g.arc(px, py, 8, 0, 6.2832); g.fill();
    } else {
      g.fillStyle = '#e8ecf4';
      g.beginPath(); g.arc(px, py, 7, 0, 6.2832); g.fill();
      g.fillStyle = 'rgba(22,33,15,0.9)';
      g.beginPath(); g.arc(px - 3, py - 2, 6, 0, 6.2832); g.fill();
    }
    g.fillStyle = '#f2e8c9'; g.font = '700 12px system-ui'; g.textAlign = 'center';
    g.fillText(FW.SEASONS[se].slice(0, 3).toUpperCase(), cx, cy + 30);
  }

  /* ---------------- weather glyph ---------------- */
  function drawWxIcon(g, kind, cx, cy, s) {
    g.lineWidth = Math.max(2, s * 0.09); g.lineCap = 'round';
    if (kind === 'clear' || kind === 'drought') {
      g.strokeStyle = kind === 'drought' ? '#e8933a' : '#ffd964';
      g.fillStyle = kind === 'drought' ? '#e8933a' : '#ffd964';
      g.beginPath(); g.arc(cx, cy - s * 0.1, s * 0.32, 0, 6.2832); g.fill();
      for (var i = 0; i < 8; i++) {
        var a = i * 0.785;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * s * 0.44, cy - s * 0.1 + Math.sin(a) * s * 0.44);
        g.lineTo(cx + Math.cos(a) * s * 0.58, cy - s * 0.1 + Math.sin(a) * s * 0.58);
        g.stroke();
      }
      if (kind === 'drought') {
        g.strokeStyle = 'rgba(232,147,58,0.7)';
        for (var h = 0; h < 2; h++) {
          g.beginPath(); g.moveTo(cx - s * 0.4 + h * s * 0.4, cy + s * 0.42);
          g.quadraticCurveTo(cx - s * 0.3 + h * s * 0.4, cy + s * 0.52, cx - s * 0.4 + h * s * 0.4, cy + s * 0.62); g.stroke();
        }
      }
    } else if (kind === 'cloudy' || kind === 'rain' || kind === 'storm' || kind === 'fog') {
      g.fillStyle = 'rgba(232,238,244,0.92)';
      g.beginPath();
      g.ellipse(cx - s * 0.22, cy - s * 0.05, s * 0.3, s * 0.2, 0, 0, 6.2832);
      g.ellipse(cx + s * 0.18, cy - s * 0.05, s * 0.36, s * 0.24, 0, 0, 6.2832);
      g.ellipse(cx, cy - s * 0.22, s * 0.3, s * 0.2, 0, 0, 6.2832);
      g.fill();
      if (kind === 'rain' || kind === 'storm') {
        g.strokeStyle = '#7ab8e0';
        for (var r = 0; r < 3; r++) {
          var rx = cx - s * 0.3 + r * s * 0.3;
          g.beginPath(); g.moveTo(rx, cy + s * 0.22); g.lineTo(rx - s * 0.06, cy + s * 0.42); g.stroke();
        }
      }
      if (kind === 'storm') {
        g.fillStyle = '#ffd964';
        g.beginPath(); g.moveTo(cx + s * 0.05, cy + s * 0.1); g.lineTo(cx - s * 0.08, cy + s * 0.42);
        g.lineTo(cx + s * 0.06, cy + s * 0.42); g.lineTo(cx - s * 0.04, cy + s * 0.66);
        g.lineTo(cx + s * 0.14, cy + s * 0.3); g.lineTo(cx, cy + s * 0.3); g.closePath(); g.fill();
      }
      if (kind === 'fog') {
        g.strokeStyle = 'rgba(232,238,244,0.8)';
        for (var f = 0; f < 3; f++) {
          g.beginPath(); g.moveTo(cx - s * 0.5, cy + s * 0.28 + f * s * 0.14);
          g.lineTo(cx + s * 0.5, cy + s * 0.28 + f * s * 0.14); g.stroke();
        }
      }
    } else if (kind === 'wind') {
      g.strokeStyle = 'rgba(180,220,235,0.95)';
      for (var w = 0; w < 3; w++) {
        var wy = cy - s * 0.3 + w * s * 0.3;
        g.beginPath(); g.moveTo(cx - s * 0.5, wy);
        g.quadraticCurveTo(cx, wy - s * 0.18, cx + s * 0.5, wy);
        g.stroke();
      }
    }
  }
  function drawWx() {
    var c = $('hud-wx'); if (!c || !st) return;
    var g = c.getContext('2d');
    g.clearRect(0, 0, 72, 72);
    g.fillStyle = 'rgba(22,33,15,0.72)';
    g.beginPath(); g.arc(36, 36, 33, 0, 6.2832); g.fill();
    g.strokeStyle = 'rgba(217,164,65,0.4)'; g.lineWidth = 3;
    g.beginPath(); g.arc(36, 36, 31, 0, 6.2832); g.stroke();
    drawWxIcon(g, st.weather.kind, 32, 32, 44);
    /* forecast: tiny next-weather in the corner */
    drawWxIcon(g, st.weather.next, 56, 56, 22);
  }
  function refreshQuests() {
    if (!st) return;
    var list = $('quest-list'); list.innerHTML = '';
    var anyClaimable = false;
    FW.quests(st).forEach(function (q) {
      if (q.done && !q.claimed) anyClaimable = true;
      var d = document.createElement('div');
      d.className = 'quest' + (q.done ? ' done' : '') + (q.claimed ? ' claimed' : '');
      var name = document.createElement('div'); name.className = 'q-name'; name.textContent = q.name;
      var desc = document.createElement('div'); desc.className = 'q-desc'; desc.textContent = q.desc;
      var bar = document.createElement('div'); bar.className = 'q-bar';
      var fill = document.createElement('div'); fill.className = 'q-fill';
      fill.style.width = Math.round(q.progress / q.need * 100) + '%';
      bar.appendChild(fill);
      var foot = document.createElement('div'); foot.className = 'q-foot';
      var prog = document.createElement('span'); prog.className = 'q-prog';
      prog.textContent = q.progress + ' / ' + q.need;
      foot.appendChild(prog);
      if (!q.claimed) {
        var btn = document.createElement('button');
        btn.className = 'q-claim'; btn.type = 'button';
        if (q.done) {
          btn.textContent = 'Claim +' + q.reward;
          (function (id) {
            btn.addEventListener('click', function () {
              var r = FW.claimQuest(st, id);
              if (r.ok) {
                FAu.coins();
                toast('Quest complete: ' + r.name + ' (+' + r.reward + ' leaves)');
                refreshQuests(); save();
              }
            });
          })(q.id);
        } else { btn.textContent = '+' + q.reward; btn.style.opacity = 0.55; btn.style.pointerEvents = 'none'; }
        foot.appendChild(btn);
      } else {
        var done = document.createElement('span'); done.className = 'q-prog'; done.textContent = 'claimed';
        foot.appendChild(done);
      }
      d.appendChild(name); d.appendChild(desc); d.appendChild(bar); d.appendChild(foot);
      list.appendChild(d);
    });
    $('quest-dot').classList.toggle('hidden', !anyClaimable);
  }
  $('fab-quests').addEventListener('click', function () {
    if (screen !== 'game' || !st) return;
    refreshQuests();
    $('quest-panel').classList.remove('hidden');
  });
  $('quest-close').addEventListener('click', function () { $('quest-panel').classList.add('hidden'); });
  $('quest-panel').addEventListener('click', function (e) { if (e.target === $('quest-panel')) $('quest-panel').classList.add('hidden'); });

  /* ---------------- daily gift ---------------- */
  var lastDailyCheck = 0;
  function giftPreview(day) {
    if (day === 1) return 'a gift seed, planted free';
    if (day === 2) return '15 leaves';
    if (day === 3) return 'a rare sapling';
    if (day === 4) return '25 leaves';
    return '40 leaves and a wild mushroom';
  }
  function checkDaily() {
    if (!st) return;
    var ds = FW.dailyStatus(st);
    $('fab-gift').classList.toggle('hidden', !ds.available);
  }
  $('fab-gift').addEventListener('click', function () {
    if (screen !== 'game' || !st) return;
    var ds = FW.dailyStatus(st);
    if (!ds.available) return;
    $('gift-streak').textContent = ds.day > 1 ? 'DAY ' + ds.day + ' STREAK' : 'WELCOME BACK';
    $('gift-text').textContent = 'The forest offers ' + giftPreview(ds.day) + '.';
    $('gift-modal').classList.remove('hidden');
  });
  $('gift-claim').addEventListener('click', function () {
    var r = FW.claimDaily(st, FW.now());
    $('gift-modal').classList.add('hidden');
    if (r.ok) {
      FAu.achieve();
      toast('Day ' + r.day + ' gift: ' + r.gift + '!');
      noteDay('received a daily gift');
      checkDaily(); save();
    }
  });
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
    setCam: function (z, x) { camZ = z; if (x !== undefined) camX = x; clampCam(); render(perfNow()); },
    spotXY: function (i) {
      var r = canvas.getBoundingClientRect(), sx = spotX(i);
      return { x: r.left + W / 2 + (sx - camX) * camZ, y: r.top + surfY(sx) };
    }
  };
})();
