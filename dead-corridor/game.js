/* Dead Man's Corridor — game logic. On-rails horror shooter.
 * The camera rides a fixed rail through the facility; the player drags to
 * look and the gun auto-fires on target. Tap also fires manually.
 */
(function () {
  'use strict';
  var E = window.DC_ENGINE, A = window.DC_ART;
  var TAU = Math.PI * 2;

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function angDiff(a, b) {
    var d = a - b;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return d;
  }
  // seeded rng for daily
  function mulberry32(s) {
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ================= map ================= */
  var MW = 28, MH = 44;
  var grid;
  function buildMap() {
    grid = new Uint8Array(MW * MH);
    grid.fill(1);   // 1 = concrete wall; carve open space as 0
    function carve(x0, y0, x1, y1) {
      for (var y = y0; y <= y1; y++)
        for (var x = x0; x <= x1; x++)
          grid[y * MW + x] = 0;
    }
    carve(8, 2, 20, 10);     // arena 3 (flesh zone walls around it)
    carve(12, 11, 15, 15);   // corridor
    carve(8, 16, 20, 24);    // arena 2
    carve(12, 25, 15, 29);   // corridor
    carve(8, 30, 20, 38);    // arena 1
    carve(12, 39, 15, 42);   // entrance
    // texture paint: rust corridors, flesh arena 3 (walls only, around carved space)
    function paint(x0, y0, x1, y1, v) {
      for (var y = y0; y <= y1; y++)
        for (var x = x0; x <= x1; x++) {
          var i = y * MW + x;
          if (grid[i] !== 0) grid[i] = v;
        }
    }
    paint(11, 10, 16, 16, 2); paint(11, 24, 16, 30, 2); paint(11, 38, 16, 43, 2);
    paint(7, 1, 21, 11, 3);
    // doors (decor) flanking arena mouths
    grid[15 * MW + 11] = 4; grid[15 * MW + 16] = 4;
    grid[29 * MW + 11] = 4; grid[29 * MW + 16] = 4;
    grid[10 * MW + 11] = 4; grid[10 * MW + 16] = 4;
    // animated accent walls: warning strips in corridors, monitors in the wards
    grid[14 * MW + 11] = 5; grid[12 * MW + 16] = 5;
    grid[28 * MW + 11] = 5; grid[26 * MW + 16] = 5;
    grid[20 * MW + 7] = 6; grid[20 * MW + 21] = 6;
    grid[6 * MW + 7] = 5; grid[6 * MW + 21] = 5;
  }
  var TEX_FOR = { 1: 'concrete', 2: 'rust', 3: 'flesh', 4: 'door', 5: 'warn', 6: 'monitor' };
  var mapDef = null;
  function getMap() {
    if (!mapDef) mapDef = {
      grid: grid, w: MW,
      texFor: function (c) { return TEX_FOR[c] || 'concrete'; },
      ceilColor: '#0a0712', floorTex: 'floor', wallTex: 'concrete'
    };
    return mapDef;
  }
  function solidAt(x, y) {
    var mx = Math.floor(x), my = Math.floor(y);
    if (mx < 0 || my < 0 || mx >= MW || my >= MH) return true;
    return grid[my * MW + mx] !== 0;
  }

  /* ================= rail ================= */
  var NORTH = -Math.PI / 2;
  var RAIL = [
    { x: 13.5, y: 41.5, a: NORTH },
    { x: 13.5, y: 34.5, a: NORTH, dwell: 'w1' },
    { x: 13.5, y: 20.5, a: NORTH, dwell: 'w2' },
    { x: 13.5, y: 6.5, a: NORTH, dwell: 'w3' }
  ];
  var RAIL_SPEED = 1.7;

  /* ================= waves ================= */
  // comp: [type, count, delay]
  var WAVES = {
    w1: { name: 'SECTOR 1 — INTAKE', comp: [['husk', 3, 0.8], ['crawler', 1, 4]] },
    w2: { name: 'SECTOR 2 — WARDS', comp: [['husk', 5, 0.5], ['crawler', 3, 2], ['spitter', 1, 5]] },
    w3: { name: 'SECTOR 3 — THE HEART', comp: [['brute', 1, 1], ['husk', 3, 3], ['spitter', 1, 6], ['crawler', 3, 9]] }
  };
  var FOE = {
    husk:    { hp: 3,  speed: 1.3, dmg: 8,  score: 100, scale: 0.85, radius: 0.42 },
    crawler: { hp: 2,  speed: 2.4, dmg: 6,  score: 150, scale: 0.62, radius: 0.36 },
    brute:   { hp: 12, speed: 0.9, dmg: 16, score: 300, scale: 1.35, radius: 0.6 },
    spitter: { hp: 4,  speed: 1.2, dmg: 10, score: 200, scale: 0.9,  radius: 0.42 }
  };

  /* ================= state ================= */
  var state = 'title';   // title | ride | over
  var canvas, ctx, cw, ch;
  var G = null;          // run state

  /* ================= MATRON — facility AI voice (additive flavor) =================
   * Today's content pack is fetched from the dead-corridor-matron worker.
   * Everything here degrades to MATRON_FALLBACK when offline — the game
   * never waits on, and never needs, the network to be playable. */
  var MATRON_URL = 'https://dead-corridor-matron.chaoticutopia84.workers.dev';
  var Mpack = null;
  var MATRON_FALLBACK = {
    fallback: true,
    sectors: [
      { name: 'SECTOR 1 \u2014 INTAKE', intro: 'Intake is open. Leave your courage at the door.', clear: 'Intake sterilized. You may proceed.' },
      { name: 'SECTOR 2 \u2014 WARDS', intro: 'The wards are restless tonight. Mind the patients.', clear: 'Wards quiet. For now.' },
      { name: 'SECTOR 3 \u2014 THE HEART', intro: 'You have reached the heart. It has been waiting.', clear: 'The heart is still. Remarkable.' }
    ],
    barks: {
      streak: ['Matron notes your efficiency. Do not let it go to your head.', 'Such precision. The facility approves.'],
      hurt: ['That looked painful. Shall I call someone?', 'Bleeding is discouraged in the corridors.'],
      novaReady: ['NOVA charge complete. Do try not to miss.'],
      nova: ['NOVA discharged. The walls felt that.'],
      lowAmmo: ['Your magazine is empty. Reload, quickly.'],
      brute: ['Attention: large patient loose in Sector 3.']
    },
    mutator: {
      id: 'frenzy', title: 'HEIGHTENED AGITATION',
      flavor: 'Sedatives wearing off. The patients are quicker today.',
      params: { foeSpeedMul: 1.15, scoreMul: 1.1 }
    },
    logs: []
  };
  function matronPack() { return Mpack || MATRON_FALLBACK; }
  function mpick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  /* MATRON's spoken voice: server-synthesized clips for the day's 4 key lines
   * (3 sector intros + mutator announcement). Preloaded at title; played on
   * the letterboxed cards. Text always shows too, so silence never loses info. */
  var Mvoice = { clips: {}, enabled: true };
  try { Mvoice.enabled = localStorage.getItem('dc_matron_voice') !== '0'; } catch (e) {}
  function loadMatronVoice() {
    try {
      var a = matronPack().audio;
      if (!a) return;
      ['s0', 's1', 's2', 'mut'].forEach(function (id) {
        if (a[id] && !Mvoice.clips[id]) {
          var au = new Audio(MATRON_URL + a[id]);
          au.preload = 'auto';
          try { au.load(); } catch (e2) {}
          Mvoice.clips[id] = au;
        }
      });
    } catch (e) {}
  }
  function matronVoice(id) {
    try {
      if (!Mvoice.enabled) return;
      var au = Mvoice.clips[id];
      if (!au) return;
      au.currentTime = 0;
      var pr = au.play();
      if (pr && pr.catch) pr.catch(function () {});
    } catch (e) {}
  }
  function mutatorHint(mp) {
    if (!mp || !mp.params) return '';
    var pr = mp.params, bits = [];
    if (pr.foeSpeedMul > 1) bits.push('foes ' + Math.round((pr.foeSpeedMul - 1) * 100) + '% faster');
    if (pr.magSize < 8) bits.push(pr.magSize + '-round mag');
    if (pr.hp < 100) bits.push(pr.hp + ' HP');
    if (pr.boltBonus > 0) bits.push('spitters +' + pr.boltBonus + ' bolt');
    if (pr.scoreMul > 1) bits.push('+' + Math.round((pr.scoreMul - 1) * 100) + '% score');
    return bits.join(' \u00B7 ');
  }
  /* title-screen daily briefing card */
  function fillMatronDaily() {
    try {
      var p = matronPack();
      var sec = (p.sectors && p.sectors[0]) || {};
      if (sec.intro) $('md-line').textContent = '\u201C' + sec.intro + '\u201D';
      var mp = p.mutator;
      if (mp) {
        $('md-mut-title').textContent = 'FACILITY CONDITION \u2014 ' + String(mp.title || mp.id).toUpperCase();
        var hint = mutatorHint(mp);
        $('md-mut-flavor').textContent = (mp.flavor || '') + (hint ? '   \u00B7   ' + hint : '');
        $('md-mutator').style.display = '';
      } else {
        $('md-mutator').style.display = 'none';
      }
      $('matron-daily').classList.remove('hidden');
    } catch (e) {}
  }
  function fetchMatronPack() {
    try {
      var d = new Date();
      var ds = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      var ctl = new AbortController();
      var to = setTimeout(function () { try { ctl.abort(); } catch (e) {} }, 3500);
      fetch(MATRON_URL + '/daily?date=' + ds, { signal: ctl.signal })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (p) { clearTimeout(to); if (p && p.sectors && p.barks) { Mpack = p; fillMatronDaily(); loadMatronVoice(); } })
        .catch(function () { clearTimeout(to); });
    } catch (e) {}
  }
  // MATRON-voiced banner: cold cyan PA voice, visually distinct from system banners
  function matronSay(txt) {
    var b = $('banner');
    b.textContent = txt;
    b.classList.remove('hidden');
    b.classList.remove('show');
    b.classList.add('matron');
    void b.offsetWidth; b.classList.add('show');
    clearTimeout(b._t);
    b._t = setTimeout(function () { b.classList.add('hidden'); b.classList.remove('matron'); }, 2600);
  }
  /* sector intro card: letterboxed title card with MATRON's line, spoken aloud */
  function sectorCard(name, intro, lineId) {
    try {
      var c = $('sector-card');
      $('sc-name').textContent = name;
      $('sc-intro').textContent = '\u201C' + intro + '\u201D';
      c.classList.remove('hidden'); c.classList.remove('hide');
      void c.offsetWidth; c.classList.add('show');
      if (lineId) matronVoice(lineId);
      clearTimeout(c._t);
      c._t = setTimeout(function () {
        c.classList.add('hide');
        setTimeout(function () {
          c.classList.remove('show'); c.classList.add('hidden'); c.classList.remove('hide');
        }, 420);
      }, 2500);
    } catch (e) {}
  }

  function newRun(dailySeed) {
    var rng = dailySeed != null ? mulberry32(dailySeed) : Math.random;
    var run = {
      rng: rng, daily: dailySeed != null, dailySeed: dailySeed || null,
      railI: 0, railT: 0, moving: true, dwell: null, spawnQueue: [], spawnT: 0,
      trickleT: 4,
      px: RAIL[0].x, py: RAIL[0].y, baseA: NORTH,
      lookYaw: 0, lookPitch: 0,
      foes: [], bolts: [], orbs: [], parts: [], decals: [],
      hp: 100, maxHp: 100,
      ammo: 8, magSize: 8, reloading: 0,
      foeSpeedMul: 1, scoreMul: 1, boltBonus: 0,
      barkFlags: {}, mutator: null, pendingBruteBark: 0, dwellT0: 0,
      fireCd: 0, flash: 0, recoil: 0, recoilV: 0, smoothYaw: 0, smoothPitch: 0,
      charge: 0, novaReady: false,
      score: 0, kills: 0, shots: 0, hits: 0, combo: 0, maxCombo: 0, comboPop: 0,
      dmgFlash: 0, shake: 0, hitStop: 0, slowmo: 0,
      waveName: '', waveClearT: 0,
      time: 0, over: false, win: false,
      hurtT: 0
    };
    // MATRON daily mutator (additive; unknown ids/params are ignored)
    try {
      var mp = matronPack().mutator;
      if (mp && mp.params && typeof mp.params === 'object') {
        var pr = mp.params;
        if (typeof pr.foeSpeedMul === 'number') run.foeSpeedMul = pr.foeSpeedMul;
        if (typeof pr.scoreMul === 'number') run.scoreMul = pr.scoreMul;
        if (typeof pr.boltBonus === 'number') run.boltBonus = pr.boltBonus;
        if (typeof pr.magSize === 'number') { run.magSize = pr.magSize; run.ammo = pr.magSize; }
        if (typeof pr.hp === 'number') { run.hp = pr.hp; run.maxHp = pr.hp; }
        run.mutator = mp;
      }
    } catch (e) {}
    return run;
  }

  /* ================= spawning ================= */
  function arenaBounds(dwell) {
    if (dwell === 'w1') return { x0: 9, x1: 19, y0: 31, y1: 37 };
    if (dwell === 'w2') return { x0: 9, x1: 19, y0: 17, y1: 23 };
    return { x0: 9, x1: 19, y0: 3, y1: 9 };
  }
  function spawnFoe(type, bx) {
    var F = FOE[type];
    // sample until we find open ground (never inside a wall)
    var x = 0, y = 0, tries = 0;
    do {
      x = bx.x0 + G.rng() * (bx.x1 - bx.x0);
      y = bx.y0 + G.rng() * (bx.y1 - bx.y0);
      tries++;
    } while (solidAt(x, y) && tries < 16);
    if (solidAt(x, y)) return;   // no open cell — skip the spawn
    // keep out of the player's face
    if (Math.hypot(x - G.px, y - G.py) < 4) {
      y = bx.y0 + 1;
      if (solidAt(x, y)) return;
    }
    G.foes.push({
      type: type, x: x, y: y,
      hp: F.hp, maxHp: F.hp,
      state: 'spawn', spawnT: 0, t: G.rng() * 10, atkT: 0,
      hitFlash: 0, deadT: 0, vy: 0
    });
    // spawn reveal: ember burst where it claws through
    burstFx(x, y, '#ff5a22', 8);
    if (type === 'brute' && !G.barkFlags.brute) {
      G.barkFlags.brute = 1;
      G.pendingBruteBark = G.time + 4;
    }
  }
  function startDwell(dwell) {
    G.dwell = dwell;
    var w = WAVES[dwell];
    G.waveName = w.name;
    G.spawnQueue = [];
    w.comp.forEach(function (c) {
      for (var i = 0; i < c[1]; i++) G.spawnQueue.push({ type: c[0], at: c[2] + i * 1.6 });
    });
    G.spawnT = 0;
    G.dwellT0 = G.time;
    var si = dwell === 'w1' ? 0 : dwell === 'w2' ? 1 : 2;
    var sec = matronPack().sectors[si] || matronPack().sectors[0];
    G.waveName = sec.name;
    sectorCard(sec.name, sec.intro, 's' + si);
  }

  /* ================= combat ================= */
  function targets() {
    // shootable things: foes + bolts, with screen x
    var out = [];
    var bs = E.bufSize();
    function consider(x, y, radius, ref, kind, scale) {
      var dx = x - G.px, dy = y - G.py;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 14) return;
      var ad = angDiff(Math.atan2(dy, dx), G.baseA + G.lookYaw);
      if (Math.abs(ad) > 0.62) return;
      var sx = (0.5 + 0.5 * Math.tan(ad) / Math.tan(36 * Math.PI / 180)) * bs.w;
      var col = clamp(Math.floor(sx), 0, bs.w - 1);
      if (E.zbuf && E.zbuf[col] < dist * 0.95) return;   // occluded
      out.push({ sx: sx, dist: dist, ref: ref, kind: kind, radius: radius,
                 size: bs.h / Math.max(0.6, dist) * (scale || 0.8) });
    }
    G.foes.forEach(function (f) {
      if (f.state === 'dead') return;
      consider(f.x, f.y, FOE[f.type].radius, f, 'foe', FOE[f.type].scale);
    });
    G.bolts.forEach(function (b) { consider(b.x, b.y, 0.22, b, 'bolt', 0.35); });
    return out;
  }

  function fire() {
    if (G.reloading > 0 || G.ammo <= 0) { startReload(); return; }
    if (G.fireCd > 0) return;
    G.fireCd = 0.24;
    G.ammo--; G.shots++;
    G.flash = 1.5; G.recoilV = 9;
    G.shake = Math.max(G.shake, 3);
    DCSfx.shoot();
    // ejecting shell casings (screen space, from the gun)
    var b2 = E.bufSize();
    for (var ci = 0; ci < 2; ci++)
      G.parts.push({ x: b2.w * 0.56, y: b2.h * 0.78, vx: 50 + Math.random() * 60, vy: -50 - Math.random() * 40,
        life: 0.8, t: -ci * 0.05, col: '#d8a832', sz: 2 });
    var bs = E.bufSize(), cx = bs.w / 2;
    var best = null, bestScore = 1e9;
    targets().forEach(function (t) {
      var win = t.size * 0.34;   // generous: about a third of the sprite
      var d = Math.abs(t.sx - cx);
      if (d < win) {
        var s = t.dist + d * 0.05;
        if (s < bestScore) { bestScore = s; best = t; }
      }
    });
    if (best) {
      G.hits++;
      G.combo++;
      G.comboPop = 1;
      if (G.combo > G.maxCombo) G.maxCombo = G.combo;
      if ((G.combo === 10 || G.combo === 20 || G.combo === 30) && !G.barkFlags['streak' + G.combo]) {
        G.barkFlags['streak' + G.combo] = 1;
        matronSay(mpick(matronPack().barks.streak));
      }
      if (best.kind === 'bolt') {
        best.ref.dead = true;
        addScore(25, best.ref.x, best.ref.y);
        burstFx(best.ref.x, best.ref.y, '#a8e04a', 8);
      } else {
        damageFoe(best.ref, 1, best.sx);
      }
    } else {
      G.combo = 0;   // clean miss breaks the combo
      // wall impact puff at crosshair ray
      var r = E.castRay(getMap().grid, MW, G.px, G.py, G.baseA + G.lookYaw);
      burstFx(r.hx, r.hy, '#ffd9a0', 3);
      burstFx(r.hx, r.hy, '#ff8a3a', 4);
      burstFx(r.hx, r.hy, '#8a8a92', 2);
    }
    if (G.ammo <= 0) startReload();
  }

  function damageFoe(f, dmg, sx) {
    f.hp -= dmg;
    f.hitFlash = 0.12;
    DCSfx.hit();
    var bs = E.bufSize();
    bloodFx(sx == null ? bs.w / 2 : sx, bs.h * 0.42, 10);
    if (f.hp <= 0 && f.state !== 'dead') killFoe(f);
  }

  /* combo-scaled scoring, with a floating combat-text pop */
  function addScore(base, wx, wy) {
    var pts = Math.round(base * (1 + G.combo * 0.1) * (G.scoreMul || 1));
    G.score += pts;
    if (wx != null) {
      var dx = wx - G.px, dy = wy - G.py;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var ad = angDiff(Math.atan2(dy, dx), G.baseA + G.lookYaw);
      var bs = E.bufSize();
      var sx = (0.5 + 0.5 * Math.tan(ad) / Math.tan(36 * Math.PI / 180)) * bs.w;
      var sy = bs.h * 0.5 - (bs.h / dist) * 0.15;
      G.parts.push({ x: sx, y: sy, vx: 0, vy: -34, life: 0.8, t: 0,
        col: '#ffe14d', sz: 0, text: '+' + pts });
    }
  }

  function killFoe(f) {
    f.state = 'dead'; f.deadT = 0;
    var F = FOE[f.type];
    G.kills++;
    addScore(F.score, f.x, f.y);
    G.hitStop = Math.max(G.hitStop, 0.05);
    DCSfx.kill();
    // persistent blood decal where it fell (capped, recycled)
    G.decals.push({ x: f.x, y: f.y, t: 0, s: 0.5 + Math.random() * 0.5 });
    if (G.decals.length > 28) G.decals.shift();
    // charge orbs
    var n = f.type === 'brute' ? 4 : (f.type === 'spitter' ? 2 : 1);
    for (var i = 0; i < n; i++)
      G.orbs.push({ x: f.x + (Math.random() - 0.5), y: f.y + (Math.random() - 0.5), t: 0 });
    checkWaveClear();
  }

  function checkWaveClear() {
    if (!G.dwell) return;
    var alive = G.foes.some(function (f) { return f.state !== 'dead'; });
    if (!alive && G.spawnQueue.length === 0) {
      G.score += 500;
      G.hp = Math.min(G.maxHp, G.hp + 30);   // catch your breath
      var ci = G.dwell === 'w1' ? 0 : G.dwell === 'w2' ? 1 : 2;
      matronSay((matronPack().sectors[ci] || matronPack().sectors[0]).clear + '  +500');
      G.waveClearT = 1.6;
      G.dwell = null;
      // resume the rail after a beat
      setTimeout(function () {
        if (G && !G.over && state === 'ride') { G.moving = true; }
      }, 1400);
    }
  }

  function hurtPlayer(dmg, src) {
    if (G.over) return;
    G.hp -= dmg;
    if (src) { G.dmgBy = G.dmgBy || {}; G.dmgBy[src] = (G.dmgBy[src] || 0) + dmg; }
    G.combo = 0;   // taking a hit breaks the combo
    G.dmgFlash = 1;
    try {
      var hpb = $('hud-hp');
      hpb.classList.remove('dmg'); void hpb.offsetWidth; hpb.classList.add('dmg');
    } catch (e) {}
    G.shake = Math.max(G.shake, 9);
    G.hitStop = Math.max(G.hitStop, 0.06);
    G.hurtT = G.time;
    DCSfx.hurt();
    if (G.time - (G.barkFlags.hurtT || -99) > 8) {
      G.barkFlags.hurtT = G.time;
      matronSay(mpick(matronPack().barks.hurt));
    }
    if (G.hp <= 0) { G.hp = 0; gameOver(false); }
  }

  function startReload() {
    if (G.reloading > 0 || G.ammo >= G.magSize) return;
    if (G.ammo === 0 && !G.barkFlags.lowAmmo) {
      G.barkFlags.lowAmmo = 1;
      matronSay(mpick(matronPack().barks.lowAmmo));
    }
    G.reloading = 1.3;
    DCSfx.reload();
  }

  function nova() {
    if (!G.novaReady || G.over) return;
    G.novaReady = false; G.charge = 0;
    G.flash = 1.6; G.shake = 16;
    DCSfx.nova();
    targets().forEach(function (t) {
      if (t.kind === 'foe' && t.ref.state !== 'dead') damageFoe(t.ref, 6);
    });
    G.bolts.forEach(function (b) { b.dead = true; });
    G.parts.push({ ring: true, x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 0.55 });
    matronSay(mpick(matronPack().barks.nova));
  }

  /* ================= fx (screen space) ================= */
  function bloodFx(sx, sy, n) {
    var bsb = E.bufSize();
    var dir = sx < bsb.w / 2 ? -1 : 1;   // spray away from the shooter's line
    for (var i = 0; i < n; i++)
      G.parts.push({ x: sx, y: sy, vx: dir * (50 + Math.random() * 130), vy: -40 - Math.random() * 130,
        life: 0.5 + Math.random() * 0.3, t: 0, col: Math.random() < 0.3 ? '#d02832' : '#a01822', sz: 2 + Math.random() * 3 });
  }
  function burstFx(wx, wy, col, n) {
    // world -> screen for wall impacts
    var dx = wx - G.px, dy = wy - G.py;
    var dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
    var ad = angDiff(Math.atan2(dy, dx), G.baseA + G.lookYaw);
    var bs = E.bufSize();
    var sx = (0.5 + 0.5 * Math.tan(ad) / Math.tan(36 * Math.PI / 180)) * bs.w;
    var sy = bs.h * 0.5 - (bs.h / dist) * 0.12;
    for (var i = 0; i < n; i++)
      G.parts.push({ x: sx, y: sy, vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.5) * 90,
        life: 0.35, t: 0, col: col, sz: 1.5 + Math.random() * 2 });
  }

  function banner(txt) {
    var b = $('banner');
    b.textContent = txt;
    b.classList.remove('matron');
    b.classList.remove('hidden');
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(b._t);
    b._t = setTimeout(function () { b.classList.add('hidden'); }, 2200);
  }

  /* ================= update ================= */
  var lights = [];
  function buildLights() {
    lights = [];
    function L(x, y, r, i, fl, cr, cg, cb) { lights.push({ x: x, y: y, radius: r, intensity: i, baseFl: 1, fl: fl || 0, ph: Math.random() * 7, cr: cr, cg: cg, cb: cb }); }
    var BLUE = [0.55, 0.75, 1.0], WHITE = [1, 1, 1], GREEN = [0.7, 1.0, 0.65], RED = [1.0, 0.22, 0.16];
    // corridor fluorescents (flickery), tinted by sector
    for (var y = 40; y >= 4; y -= 6) {
      var tn = y > 29 ? BLUE : (y > 23 ? WHITE : (y > 15 ? GREEN : (y > 9 ? WHITE : RED)));
      L(13.5, y, 6, 0.85, 1, tn[0], tn[1], tn[2]);
    }
    // arena lights
    L(13.5, 34.5, 9, 1.0, 1, BLUE[0], BLUE[1], BLUE[2]);
    L(13.5, 20.5, 9, 1.0, 1, GREEN[0], GREEN[1], GREEN[2]);
    L(13.5, 6.5, 9, 1.1, 0, RED[0], RED[1], RED[2]);   // the heart: steady blood-red
    return lights;
  }

  function update(dt) {
    G.time += dt;
    // decay
    G.flash = Math.max(0, G.flash - dt * 6);
    // spring recoil: kicks up, settles with a whisper of overshoot
    G.recoilV += (-G.recoil * 130 - G.recoilV * 13) * dt;
    G.recoil += G.recoilV * dt;
    if (G.recoil < -0.18) { G.recoil = -0.18; G.recoilV = 0; }
    // smoothed look: buttery, no input-lag feel
    var sk = Math.min(1, dt * 16);
    G.smoothYaw += angDiff(G.lookYaw, G.smoothYaw) * sk;
    G.smoothPitch += (G.lookPitch - G.smoothPitch) * sk;
    G.fireCd = Math.max(0, G.fireCd - dt);
    G.dmgFlash = Math.max(0, G.dmgFlash - dt * 2.2);
    G.comboPop = Math.max(0, G.comboPop - dt * 3.2);
    G.shake = Math.max(0, G.shake - dt * 26);
    G.hitStop = Math.max(0, G.hitStop - dt);
    if (G.reloading > 0) {
      G.reloading -= dt;
      if (G.reloading <= 0) { G.ammo = G.magSize; }
    }
    // light flicker
    for (var li = 0; li < lights.length; li++) {
      var L = lights[li];
      if (L.fl) {
        var s = Math.sin(G.time * 13 + L.ph) * Math.sin(G.time * 7.3 + L.ph * 2);
        L.flick = s < -0.93 ? 0.25 : (0.8 + 0.2 * s);
      } else L.flick = 1;
    }

    if (G.hitStop > 0) return;   // freeze world, fx still decayed above

    // rail movement
    if (G.moving && !G.over) {
      var a = RAIL[G.railI], b = RAIL[G.railI + 1];
      if (!b) { gameOver(true); return; }
      var dx = b.x - a.x, dy = b.y - a.y;
      var segLen = Math.hypot(dx, dy);
      G.railT += (RAIL_SPEED * dt) / segLen;
      if (G.railT >= 1) {
        G.railI++; G.railT = 0;
        var nb = RAIL[G.railI];
        G.px = nb.x; G.py = nb.y; G.baseA = nb.a;
        if (nb.dwell) { G.moving = false; startDwell(nb.dwell); }
        // else: keep rolling to the next node
      } else {
        G.px = lerp(a.x, b.x, G.railT);
        G.py = lerp(a.y, b.y, G.railT);
        G.baseA = a.a + angDiff(b.a, a.a) * G.railT;
      }
      // trickle spawns in corridors: a crawler now and then
      G.trickleT -= dt;
      if (G.trickleT <= 0 && G.foes.length < 3) {
        G.trickleT = 5 + Math.random() * 4;
        spawnFoe('crawler', { x0: G.px - 2, x1: G.px + 2, y0: G.py - 7, y1: G.py - 5 });
      }
    }

    // dwell spawning
    if (G.dwell) {
      G.spawnT += dt;
      var bx = arenaBounds(G.dwell);
      for (var qi = G.spawnQueue.length - 1; qi >= 0; qi--) {
        if (G.spawnQueue[qi].at <= G.spawnT) {
          spawnFoe(G.spawnQueue[qi].type, bx);
          G.spawnQueue.splice(qi, 1);
          DCSfx.spawn();
        }
      }
    }

    // foes — cap concurrent rushers: beyond the 3 nearest, they shamble
    // in slowly instead of swarming (staggered arrivals, fairer fights)
    var rank = G.foes
      .filter(function (f) { return f.state !== 'dead'; })
      .map(function (f) { return { f: f, d: Math.hypot(f.x - G.px, f.y - G.py) }; })
      .sort(function (a, b) { return a.d - b.d; });
    var i, f, F;
    for (i = G.foes.length - 1; i >= 0; i--) {
      f = G.foes[i]; F = FOE[f.type];
      f.t += dt;
      f.hitFlash = Math.max(0, f.hitFlash - dt);
      if (f.state === 'dead') {
        f.deadT += dt;
        if (f.deadT > 1.4) G.foes.splice(i, 1);
        continue;
      }
      if (f.state === 'spawn') {
        // clawing through: brief reveal, then it hunts
        f.spawnT += dt;
        if (f.spawnT > 0.6) f.state = 'walk';
        continue;
      }
      var fdx = G.px - f.x, fdy = G.py - f.y;
      var fdist = Math.hypot(fdx, fdy) || 0.01;
      var isRusher = rank.findIndex(function (r) { return r.f === f; }) < 3;
      var spMul = isRusher ? 1 : 0.45;
      if (f.type === 'spitter' && fdist < 6.5 && fdist > 3.5) {
        // hold range, charge, spit
        f.state = 'attack'; f.atkT += dt;
        if (f.atkT > 1.1) {
          f.atkT = 0;
          var ang = Math.atan2(fdy, fdx);
          G.bolts.push({ x: f.x, y: f.y, vx: Math.cos(ang) * 4.2, vy: Math.sin(ang) * 4.2, life: 4, dead: false });
          if (G.boltBonus) G.bolts.push({ x: f.x, y: f.y, vx: Math.cos(ang + 0.18) * 4.2, vy: Math.sin(ang + 0.18) * 4.2, life: 4, dead: false });
          DCSfx.spit();
        }
      } else if (fdist < 1.25) {
        // lunge attack
        if (f.state !== 'attack') { f.state = 'attack'; f.atkT = 0; DCSfx.telegraph(); }
        f.atkT += dt;
        if (f.atkT > 0.45) {
          f.atkT = -0.9;   // cooldown before next lunge
          hurtPlayer(F.dmg, f.type);
          // lunge visual: quick push toward player
          f.x += fdx / fdist * 0.35; f.y += fdy / fdist * 0.35;
        }
      } else {
        f.state = 'walk';
        // steer toward player, slide on walls (non-rushers shamble)
        var sp = F.speed * spMul * (G.foeSpeedMul || 1) * dt;
        var nx = f.x + fdx / fdist * sp, ny = f.y + fdy / fdist * sp;
        if (!solidAt(nx, f.y)) f.x = nx;
        if (!solidAt(f.x, ny)) f.y = ny;
      }
    }

    // bolts
    for (i = G.bolts.length - 1; i >= 0; i--) {
      var bl = G.bolts[i];
      if (bl.dead) { G.bolts.splice(i, 1); continue; }
      bl.x += bl.vx * dt; bl.y += bl.vy * dt; bl.life -= dt;
      if (solidAt(bl.x, bl.y)) { bl.dead = true; burstFx(bl.x, bl.y, '#a8e04a', 5); continue; }
      if (Math.hypot(bl.x - G.px, bl.y - G.py) < 0.55) {
        bl.dead = true;
        hurtPlayer(10, 'bolt');
        continue;
      }
      if (bl.life <= 0) bl.dead = true;
    }

    // charge orbs fly to player
    for (i = G.orbs.length - 1; i >= 0; i--) {
      var o = G.orbs[i];
      o.t += dt;
      var k = Math.min(1, o.t / 0.7);
      o.x = lerp(o.x, G.px, k * 0.2); o.y = lerp(o.y, G.py, k * 0.2);
      if (Math.hypot(o.x - G.px, o.y - G.py) < 0.5 || o.t > 1.2) {
        G.orbs.splice(i, 1);
        G.charge = Math.min(100, G.charge + 20);   // ~5 kills to a full nova
        if (G.pendingBruteBark && G.time >= G.pendingBruteBark) {
          G.pendingBruteBark = 0;
          matronSay(mpick(matronPack().barks.brute));
        }
        if (G.charge >= 100 && !G.novaReady) { G.novaReady = true; matronSay(mpick(matronPack().barks.novaReady)); DCSfx.ready(); }
      }
    }

    // auto-fire: crosshair on target (generous window = aim assist)
    if (!G.over && G.fireCd <= 0 && G.reloading <= 0 && G.ammo > 0) {
      var bs = E.bufSize(), cx = bs.w / 2;
      var anyOn = targets().some(function (t) {
        return Math.abs(t.sx - cx) < t.size * 0.34;
      });
      if (anyOn) fire();
    }

    // particles
    for (i = G.parts.length - 1; i >= 0; i--) {
      var p = G.parts[i];
      p.t += dt;
      if (p.t >= p.life) { G.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (!p.text) p.vy += 260 * dt;   // combat text floats, debris falls
    }
    // blood decals age out slowly
    for (i = G.decals.length - 1; i >= 0; i--) {
      G.decals[i].t += dt;
      if (G.decals[i].t > 30) G.decals.splice(i, 1);
    }
  }

  /* ================= render ================= */
  var grainCv = null;
  function getGrain() {
    if (grainCv) return grainCv;
    var c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    var x = c.getContext('2d');
    var id = x.createImageData(128, 128);
    for (var i = 0; i < id.data.length; i += 4) {
      var v = (Math.random() * 255) | 0;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 22;
    }
    x.putImageData(id, 0, 0);
    grainCv = c;
    return c;
  }

  function foeSprite(f) {
    var set = A.sprites[f.type];
    var wset = f.hitFlash > 0 ? set.white : set;   // white hit-flash silhouette
    if (f.state === 'dead') return wset.dead[f.deadT > 0.45 ? 1 : 0];   // crumple, then flatten
    if (f.state === 'spawn') return wset.walk[0];
    if (f.state === 'attack') return wset.attack;
    return wset.walk[Math.floor(f.t * 7) % 4];   // 4-frame walk cycle
  }

  function render() {
    var bobA = G.moving ? 3 : 1.2, bobF = G.moving ? 7 : 2.6;
    var view = {
      x: G.px, y: G.py,
      ang: G.baseA + G.smoothYaw,
      pitch: G.smoothPitch + Math.sin(G.time * bobF) * bobA,
      flash: G.flash,
      time: G.time
    };
    // camera shake
    if (G.shake > 0.2) {
      view.x += (Math.random() - 0.5) * G.shake * 0.02;
      view.y += (Math.random() - 0.5) * G.shake * 0.02;
    }
    var sprites = [];
    G.foes.forEach(function (f) {
      var F = FOE[f.type];
      var fade = f.state === 'dead' ? Math.max(0, 1 - f.deadT / 1.4) : 1;
      if (fade <= 0) return;
      var sc = F.scale * (f.state === 'dead' ? 0.8 : 1);
      var alpha = fade;
      if (f.state === 'spawn') {
        // scale-pop reveal
        var k = clamp(f.spawnT / 0.6, 0, 1);
        sc *= 0.3 + 0.7 * k;
        alpha = Math.min(1, k * 2.5);
      }
      if (f.state === 'attack') {
        // telegraph glow: pulsing red halo under the attacker
        sprites.push({
          x: f.x, y: f.y, tex: A.glowTex, scale: F.scale * 1.7,
          vMove: f.type === 'crawler' ? 60 : 0,
          alpha: 0.45 + 0.4 * Math.sin(G.time * 16)
        });
      }
      sprites.push({
        x: f.x, y: f.y, tex: foeSprite(f), scale: sc,
        vMove: f.type === 'crawler' ? 60 : 0,
        yOff: 0, alpha: alpha, hitFlash: f.hitFlash
      });
    });
    G.bolts.forEach(function (b) {
      if (b.dead) return;
      sprites.push({ x: b.x, y: b.y, tex: A.boltTex, scale: 0.35, vMove: 0 });
      // comet trail
      sprites.push({ x: b.x - b.vx * 0.045, y: b.y - b.vy * 0.045, tex: A.boltTex, scale: 0.24, alpha: 0.5 });
      sprites.push({ x: b.x - b.vx * 0.09, y: b.y - b.vy * 0.09, tex: A.boltTex, scale: 0.16, alpha: 0.25 });
    });
    G.orbs.forEach(function (o) {
      sprites.push({ x: o.x, y: o.y, tex: A.chargeTex,
        scale: 0.3 + 0.05 * Math.sin(G.time * 10 + o.t * 20), vMove: -40 });
    });
    // blood decals: flat on the floor where foes fell
    G.decals.forEach(function (d) {
      var fade = d.t < 24 ? 1 : Math.max(0, 1 - (d.t - 24) / 6);
      if (fade > 0) sprites.push({ x: d.x, y: d.y, tex: A.splatTex, scale: 0.42 * d.s,
        vMove: 0, yOff: 2.2, alpha: 0.85 * fade, decal: true });
    });
    // far -> near
    sprites.sort(function (a, b) {
      var da = (a.x - G.px) * (a.x - G.px) + (a.y - G.py) * (a.y - G.py);
      var db = (b.x - G.px) * (b.x - G.px) + (b.y - G.py) * (b.y - G.py);
      return db - da;
    });

    var buf = E.render(view, getMap(), lights, sprites);
    var bctx = buf.getContext('2d');
    var bs = E.bufSize();

    // hit-flash: white silhouette over damaged foes (screen-space, cheap)
    // (skip: handled via brightness pulse below)

    // screen-space particles (blood, sparks) + floating combat text
    G.parts.forEach(function (p) {
      var a = clamp(1 - p.t / p.life, 0, 1);
      if (p.ring) {
        // nova shockwave: expanding ring
        var rk = clamp(p.t / p.life, 0, 1);
        bctx.globalAlpha = 1 - rk;
        bctx.strokeStyle = '#bfe8ff';
        bctx.lineWidth = 3;
        bctx.beginPath();
        bctx.arc(bs.w / 2, bs.h * 0.44, 8 + rk * bs.w * 0.45, 0, 7);
        bctx.stroke();
      } else if (p.text) {
        bctx.globalAlpha = Math.min(1, a * 1.6);
        bctx.fillStyle = p.col;
        bctx.font = '700 13px system-ui';
        bctx.textAlign = 'center';
        bctx.fillText(p.text, p.x, p.y);
      } else {
        bctx.globalAlpha = a;
        bctx.fillStyle = p.col;
        bctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
      }
    });
    bctx.globalAlpha = 1;

    E.present(ctx, cw, ch, function (c2, w, h) {
      var i;
      // gun viewmodel: idle sway, spring recoil, reload tilt
      var rkk = clamp(G.recoil, 0, 1);
      var gun = A.gun[rkk > 0.66 ? 3 : (rkk > 0.33 ? 2 : (rkk > 0.05 ? 1 : 0))];
      var gw = Math.min(w * 0.52, 300), gh = gw * 0.75;
      var gx = w / 2 - gw / 2 + Math.sin(G.time * 1.7) * 4;
      var gy = h - gh * 0.92 + clamp(G.recoil, -0.18, 1.2) * 16 + Math.cos(G.time * 2.3) * 3;
      var tilt = 0;
      if (G.reloading > 0) { gy += Math.sin(G.time * 30) * 6; tilt = -0.16; }
      c2.save();
      c2.translate(gx + gw / 2, gy + gh);
      c2.rotate(tilt);
      c2.drawImage(gun, -gw / 2, -gh, gw, gh);
      c2.restore();

      // crosshair (dynamic)
      var chx = w / 2, chy = h * 0.44;
      var onT = targets().some(function (t) { return Math.abs(t.sx - bs.w / 2) < t.size * 0.34; });
      c2.strokeStyle = onT ? 'rgba(255,80,60,.95)' : 'rgba(255,255,255,.75)';
      c2.lineWidth = 2;
      var gap = onT ? 7 : 10, len = 7;
      c2.beginPath();
      c2.moveTo(chx - gap - len, chy); c2.lineTo(chx - gap, chy);
      c2.moveTo(chx + gap, chy); c2.lineTo(chx + gap + len, chy);
      c2.moveTo(chx, chy - gap - len); c2.lineTo(chx, chy - gap);
      c2.moveTo(chx, chy + gap); c2.lineTo(chx, chy + gap + len);
      c2.stroke();
      if (G.ammo === 0) {
        c2.fillStyle = 'rgba(255,80,60,.9)';
        c2.font = '700 13px system-ui'; c2.textAlign = 'center';
        c2.fillText('RELOADING…', chx, chy + 34);
      }
      // combo meter under the crosshair: pops on each kill, heats up with tier
      if (G.combo >= 3) {
        var ccol = G.combo >= 30 ? '#cfeaff' : G.combo >= 20 ? '#ff7a3c' : G.combo >= 10 ? '#ffe14d' : 'rgba(255,255,255,.85)';
        var cpop = 1 + 0.55 * G.comboPop;
        c2.save();
        c2.translate(chx, chy + 52);
        c2.scale(cpop, cpop);
        c2.fillStyle = ccol;
        c2.font = '800 15px system-ui'; c2.textAlign = 'center'; c2.textBaseline = 'middle';
        c2.fillText('×' + G.combo + ' COMBO', 0, 0);
        c2.restore();
      }

      // off-screen enemy indicators: look toward the threat
      var vA = G.baseA + G.lookYaw;
      G.foes.forEach(function (f) {
        if (f.state === 'dead') return;
        var fdx = f.x - G.px, fdy = f.y - G.py;
        var fdist = Math.sqrt(fdx * fdx + fdy * fdy);
        if (fdist > 11) return;
        var ad = angDiff(Math.atan2(fdy, fdx), vA);
        if (Math.abs(ad) < 0.55) return;   // already on screen
        var edgeX = ad > 0 ? w - 26 : 26;
        var edgeY = h * 0.44 - clamp((fdist - 3) * 12, 0, 90);
        var pulse = 0.55 + 0.45 * Math.sin(G.time * (f.state === 'attack' ? 14 : 7));
        c2.save();
        c2.globalAlpha = pulse;
        c2.fillStyle = f.state === 'attack' ? '#ff5a22' : '#c01824';
        c2.beginPath();
        if (ad > 0) { c2.moveTo(edgeX + 12, edgeY); c2.lineTo(edgeX - 6, edgeY - 10); c2.lineTo(edgeX - 6, edgeY + 10); }
        else { c2.moveTo(edgeX - 12, edgeY); c2.lineTo(edgeX + 6, edgeY - 10); c2.lineTo(edgeX + 6, edgeY + 10); }
        c2.closePath(); c2.fill();
        c2.restore();
      });

      // film grain
      c2.globalAlpha = 0.5;
      var gr = getGrain();
      var ox = (Math.random() * 128) | 0, oy = (Math.random() * 128) | 0;
      for (i = 0; i < w; i += 128)
        for (var j = 0; j < h; j += 128)
          c2.drawImage(gr, ox, oy, 128, 128, i, j, 128, 128);
      c2.globalAlpha = 1;

      // vignette
      var vg = c2.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,.55)');
      c2.fillStyle = vg;
      c2.fillRect(0, 0, w, h);

      // damage flash + low-hp pulse
      var dh = G.dmgFlash;
      if (G.hp < 30 && !G.over) dh = Math.max(dh, 0.25 + 0.2 * Math.sin(G.time * 6));
      if (dh > 0.01) {
        var dg = c2.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
        dg.addColorStop(0, 'rgba(160,0,0,0)');
        dg.addColorStop(1, 'rgba(180,10,10,' + (0.65 * dh).toFixed(2) + ')');
        c2.fillStyle = dg;
        c2.fillRect(0, 0, w, h);
      }
      // nova white flash
      if (G.flash > 1) {
        c2.fillStyle = 'rgba(255,255,240,' + clamp((G.flash - 1) * 0.9, 0, 0.85).toFixed(2) + ')';
        c2.fillRect(0, 0, w, h);
      }
    });
  }

  /* ================= HUD ================= */
  function updateHUD() {
    $('hud-hp-fill').style.width = (100 * G.hp / G.maxHp) + '%';
    $('hud-hp-fill').classList.toggle('low', G.hp < 30);
    $('hud-score').textContent = G.score;
    $('hud-charge-fill').style.width = G.charge + '%';
    $('btn-nova').classList.toggle('ready', G.novaReady);
    $('ammo-num').textContent = G.ammo;
    var ap = $('ammo-pips');
    var s = '';
    for (var i = 0; i < G.magSize; i++)
      s += '<i class="' + (i < G.ammo ? 'on' : '') + (G.reloading > 0 ? ' rel' : '') + '"></i>';
    if (ap._s !== s) { ap.innerHTML = s; ap._s = s; }
  }

  /* ================= input ================= */
  var dragId = null, dragX = 0, dragY = 0, dragMoved = 0, dragT = 0;
  function bindInput() {
    var el = canvas;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', function (e) {
      if (state !== 'ride' || G.over) return;
      dragId = e.pointerId; dragX = e.clientX; dragY = e.clientY;
      dragMoved = 0; dragT = performance.now();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic/no-active-pointer */ }
    });
    el.addEventListener('pointermove', function (e) {
      if (e.pointerId !== dragId) return;
      var dx = e.clientX - dragX, dy = e.clientY - dragY;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      // free look: the rail moves your body, your head turns without limit
      G.lookYaw -= dx * 0.0042;
      G.lookPitch = clamp(G.lookPitch - dy * 0.35, -60, 60);
      dragX = e.clientX; dragY = e.clientY;
    });
    function up(e) {
      if (e.pointerId !== dragId) return;
      dragId = null;
      // tap = manual fire
      if (dragMoved < 14 && performance.now() - dragT < 350) fire();
    }
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', function () { dragId = null; });
    $('btn-reload').addEventListener('click', function () { startReload(); });
    $('btn-nova').addEventListener('click', function () { nova(); });
  }

  /* ================= flow ================= */
  function showScreen(id) {
    ['screen-title', 'screen-game', 'screen-over'].forEach(function (s) {
      $(s).classList.toggle('hidden', s !== id);
    });
  }
  function rankFor(score) {
    if (score >= 9000) return 'S';
    if (score >= 6500) return 'A';
    if (score >= 4000) return 'B';
    return 'C';
  }
  function gameOver(win) {
    if (G.over) return;
    G.over = true; G.win = win;
    var acc = G.shots ? Math.round(100 * G.hits / G.shots) : 0;
    if (win) G.score += Math.round(G.hp * 10) + acc * 5;   // survivor bonus
    var rank = rankFor(G.score);
    setTimeout(function () {
      state = 'over';
      $('over-title').textContent = win ? 'CORRIDOR CLEARED' : 'YOU DIED';
      $('over-rank').textContent = rank;
      $('over-rank').className = 'rank r' + rank;
      $('over-score').textContent = G.score;
      $('over-stats').textContent = G.kills + ' kills · ' + acc + '% accuracy · ×' + G.maxCombo + ' best combo';
      var best = 0;
      try {
        best = parseInt(localStorage.getItem('dc_best') || '0', 10);
        if (G.score > best) { best = G.score; localStorage.setItem('dc_best', String(best)); }
      } catch (e) {}
      $('over-best').textContent = best;
      showScreen('screen-over');
      submitScore(G.score);
      DCSfx.gameover(win);
    }, win ? 1200 : 900);
  }

  function submitScore(score) {
    try {
      var name = localStorage.getItem('arcade_name') || 'PLAYER';
      fetch('https://gamez-arcade.chaoticutopia84.workers.dev/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: 'dead-corridor', name: name, score: score })
      }).catch(function () {});
    } catch (e) {}
  }

  function startRide(dailySeed) {
    A.reg();
    buildLights();
    G = newRun(dailySeed);
    state = 'ride';
    showScreen('screen-game');
    updateHUD();
    banner('FIND THE HEART. KILL EVERYTHING.');
    if (G.mutator) {
      var gg = G;
      setTimeout(function () {
        if (G === gg && !G.over) { matronSay(G.mutator.title + ' \u2014 ' + G.mutator.flavor); matronVoice('mut'); }
      }, 2400);
    }
    DCSfx.start();
  }

  /* ================= main loop ================= */
  var last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!last) last = ts;
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (state === 'ride' && G && !document.hidden) {
      update(dt);
      render();
      updateHUD();
    }
  }

  /* ================= title backdrop ================= */
  var titleT = 0, titleLast = 0;
  function sizeTitleBg() {
    try {
      var cv = $('title-bg');
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      cv.width = Math.round(cv.clientWidth * dpr);
      cv.height = Math.round(cv.clientHeight * dpr);
    } catch (e) {}
  }
  function titleBg(ts) {
    requestAnimationFrame(titleBg);
    if (state !== 'title') { titleLast = 0; return; }
    var cv = $('title-bg');
    if (!cv || !cv.width) return;
    if (!titleLast) titleLast = ts;
    var dt = Math.min(0.05, (ts - titleLast) / 1000);
    titleLast = ts;
    titleT += dt;
    var w = cv.width, h = cv.height, c = cv.getContext('2d');
    var vpx = w / 2, vpy = h * 0.44;
    var g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0b0616'); g.addColorStop(0.55, '#150a2a'); g.addColorStop(1, '#05030a');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    /* fluorescent flicker with the occasional brownout */
    var fl = 0.82 + 0.18 * Math.sin(titleT * 13) * Math.sin(titleT * 7.3);
    if (Math.sin(titleT * 0.63) > 0.986) fl *= 0.35;
    /* converging corridor lines */
    c.lineWidth = Math.max(1.5, w / 200);
    var i, k;
    for (i = -4; i <= 4; i++) {
      c.strokeStyle = 'rgba(170,84,104,' + (0.5 * fl).toFixed(3) + ')';
      c.beginPath();
      c.moveTo(vpx + i * w * 0.028, vpy);
      c.lineTo(vpx + i * w * 0.24, h);
      c.stroke();
    }
    /* ceiling light strip, narrow at the vanishing point */
    var lg = c.createLinearGradient(0, vpy, 0, h);
    lg.addColorStop(0, 'rgba(255,216,172,' + (0.6 * fl).toFixed(3) + ')');
    lg.addColorStop(1, 'rgba(255,216,172,0)');
    c.fillStyle = lg;
    c.beginPath();
    c.moveTo(vpx - 3, vpy); c.lineTo(vpx + 3, vpy);
    c.lineTo(vpx + w * 0.085, h); c.lineTo(vpx - w * 0.085, h);
    c.closePath(); c.fill();
    /* door frames rushing toward the viewer */
    for (k = 0; k < 4; k++) {
      var z = (titleT * 0.32 + k * 0.25) % 1;
      var sc2 = Math.pow(z, 2.4);
      var fw = w * (0.05 + 0.52 * sc2), fh = h * (0.045 + 0.44 * sc2);
      c.strokeStyle = 'rgba(210,96,108,' + (0.16 + 0.5 * sc2 * fl).toFixed(3) + ')';
      c.lineWidth = 1.5 + 5 * sc2;
      c.strokeRect(vpx - fw / 2, vpy - fh / 2, fw, fh);
    }
    /* drifting fog */
    for (var f = 0; f < 2; f++) {
      var fx = w * (0.3 + 0.4 * f) + Math.sin(titleT * 0.4 + f * 2.4) * w * 0.08;
      var fy = h * (0.62 + 0.1 * f) + Math.cos(titleT * 0.3 + f * 1.7) * h * 0.05;
      var fr = w * 0.36;
      var fg = c.createRadialGradient(fx, fy, 0, fx, fy, fr);
      fg.addColorStop(0, 'rgba(150,120,200,0.10)');
      fg.addColorStop(1, 'rgba(150,120,200,0)');
      c.fillStyle = fg;
      c.fillRect(fx - fr, fy - fr, fr * 2, fr * 2);
    }
  }

  /* ================= boot ================= */
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = window.innerWidth; ch = window.innerHeight;
    canvas.width = cw * dpr; canvas.height = ch * dpr;
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function boot() {
    canvas = $('game');
    ctx = canvas.getContext('2d');
    buildMap();
    A.reg();
    E.init(270, 480);
    resize();
    window.addEventListener('resize', resize);
    bindInput();
    fetchMatronPack();
    sizeTitleBg();
    window.addEventListener('resize', sizeTitleBg);
    fillMatronDaily();
    requestAnimationFrame(titleBg);
    $('btn-play').addEventListener('click', function () { DCSfx.init(); startRide(null); });
    $('btn-how').addEventListener('click', function () { $('howto').classList.toggle('hidden'); });
    try { $('voice-state').textContent = Mvoice.enabled ? 'ON' : 'OFF'; } catch (e) {}
    $('btn-voice').addEventListener('click', function () {
      Mvoice.enabled = !Mvoice.enabled;
      try { localStorage.setItem('dc_matron_voice', Mvoice.enabled ? '1' : '0'); } catch (e) {}
      $('voice-state').textContent = Mvoice.enabled ? 'ON' : 'OFF';
    });
    $('btn-daily').addEventListener('click', function () {
      DCSfx.init();
      var d = new Date();
      var seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
      startRide(seed);
    });
    $('btn-again').addEventListener('click', function () { startRide(G && G.daily ? G.dailySeed : null); });
    $('btn-title').addEventListener('click', function () { state = 'title'; showScreen('screen-title'); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state === 'ride') banner('PAUSED');
    });
    // title best
    try { $('title-best').textContent = localStorage.getItem('dc_best') || '0'; } catch (e) {}
    requestAnimationFrame(loop);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // debug hook
  window.DC = { get state() { return state; }, get G() { return G; }, startRide: startRide };
})();
