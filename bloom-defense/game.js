/* Bloom Defense — Gamez edition.
   Canvas lane-defense with PvZ systems: lawnmowers, telegraphed waves,
   6-slot loadout, differentiated zombies, damage states, text theater,
   Wally the worm, Daily Bloom (seeded), arcade leaderboards.
   Files: art.js (canvas art), audio.js (sfx), game.js (this: sim + UI). */
'use strict';
(function () {
  var A = window.BloomArt, AU = window.BloomAudio;
  var $ = function (id) { return document.getElementById(id); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  /* ================= CONFIG ================= */
  var ROWS = 5, COLS = 9;
  var ARCADE_BASE = 'https://gamez-arcade.chaoticutopia84.workers.dev';
  var BEST_KEY = 'bloom2_best', NAME_KEY = 'arcade_name';
  var SKY_SUN_EVERY = 9, SUN_VALUE = 25, SUNFLOWER_EVERY = 14, SUN_DESPAWN = 12;
  var PEA_DMG = 20, PEA_EVERY = 1.4, PEA_SPEED = 5.5;
  var MELON_DMG = 65, MELON_EVERY = 2.4;
  var BITE_DPS = 110;
  var WORM_EVERY = 26, WORM_VALUE = 50;

  var PLANTS = {
    sunflower:  { name: 'Sunflower',   cost: 50,  hp: 300,  cd: 7,
      desc: 'Makes bonus sun. Hums show tunes when nobody is listening.' },
    peashooter: { name: 'Peashooter',  cost: 100, hp: 300,  cd: 7,
      desc: 'Shoots peas down its lane. Has never once considered a career change.' },
    snowpea:    { name: 'Snow Pea',    cost: 175, hp: 300,  cd: 7,
      desc: 'Chilling peas slow zombies to a stroll. Emotionally unavailable.' },
    repeater:   { name: 'Repeater',    cost: 200, hp: 300,  cd: 7,
      desc: 'Fires two peas at once. An overachiever. Peashooter\u2019s insufferable cousin.' },
    wallnut:    { name: 'Wall-nut',    cost: 50,  hp: 4000, cd: 22,
      desc: 'A tough shell that blocks zombies. What more do you want?' },
    potatomine: { name: 'Potato Mine', cost: 25,  hp: 300,  cd: 22, armTime: 14,
      desc: 'Needs a nap before work. Then: BOOM. Worth the wait.' },
    cherrybomb: { name: 'Cherry Bomb', cost: 150, hp: 99999, cd: 35, fuse: 1.2,
      desc: 'Explodes. That is the entire resume. References available.' },
    melonpult:  { name: 'Melon-pult',  cost: 300, hp: 300,  cd: 7,
      desc: 'Lobs watermelons for splash damage. Picnic ruiner.' },
  };
  var PLANT_IDS = Object.keys(PLANTS);

  var ZTYPES = {
    basic:    { hp: 190,  speed: 0.30, score: 100,  name: 'Garden Zombie',
      desc: 'Shambles toward brains. Union-mandated lunch breaks.' },
    speedy:   { hp: 130,  speed: 0.55, score: 150,  name: 'Sprinter Zombie',
      desc: 'Skipped leg day never. Outruns your peas if you blink.' },
    conehead: { hp: 190,  speed: 0.26, score: 250,  name: 'Conehead Zombie', cone: 370,
      desc: 'Wears a traffic cone. Safety first, brains second.' },
    vaulter:  { hp: 335,  speed: 0.34, score: 300,  name: 'Pole Vaulter', vaults: true,
      desc: 'Pole-vaults over the first plant it meets. Rude. Effective.' },
    newspaper:{ hp: 190,  speed: 0.30, score: 350,  name: 'Newsreader', paper: 150, enrage: 2.3,
      desc: 'Loves the morning paper. HATES when you interrupt it.' },
    brute:    { hp: 3000, speed: 0.17, score: 1500, name: 'The Brute',
      desc: 'The final exam. Bring a wall. Bring two walls.' },
  };

  // waves: counts per type + spawn gap; huge/final get telegraphed
  var WAVES = [
    { basic: 4,  speedy: 0, conehead: 0, vaulter: 0, newspaper: 0, brute: 0, gap: 7 },
    { basic: 7,  speedy: 0, conehead: 0, vaulter: 0, newspaper: 0, brute: 0, gap: 6 },
    { basic: 8,  speedy: 3, conehead: 0, vaulter: 0, newspaper: 0, brute: 0, gap: 5.5 },
    { basic: 8,  speedy: 4, conehead: 3, vaulter: 0, newspaper: 0, brute: 0, gap: 5 },
    { basic: 12, speedy: 6, conehead: 5, vaulter: 0, newspaper: 0, brute: 0, gap: 4, huge: true },
    { basic: 8,  speedy: 5, conehead: 5, vaulter: 3, newspaper: 0, brute: 0, gap: 4.5 },
    { basic: 10, speedy: 6, conehead: 6, vaulter: 3, newspaper: 3, brute: 0, gap: 4 },
    { basic: 12, speedy: 8, conehead: 8, vaulter: 4, newspaper: 4, brute: 0, gap: 3.8 },
    { basic: 14, speedy: 8, conehead: 10, vaulter: 4, newspaper: 5, brute: 0, gap: 3.5 },
    { basic: 14, speedy: 10, conehead: 10, vaulter: 5, newspaper: 6, brute: 1, gap: 3.2, huge: true, fin: true },
  ];

  /* ================= STATE ================= */
  var S = null;
  function newState() {
    return {
      screen: 'menu', running: false, paused: false, over: false, won: false,
      time: 0, sun: 150, score: 0,
      wave: 0, waveState: 'idle', // idle | spawning | fighting | done
      spawnQueue: [], spawnT: 0, spawnGap: 5, waveKilled: 0, waveTotal: 0,
      plants: [], zombies: [], peas: [], melons: [], suns: [],
      mowers: [], craters: {}, cooldowns: {},
      loadout: ['sunflower', 'peashooter', 'wallnut', 'snowpea', 'repeater', 'cherrybomb'],
      selected: null, shovelMode: false,
      skyT: 4, wormT: 18, worm: null,
      shake: 0, bannerQ: [],
      daily: false, dailySeed: 0, dailyDate: '',
      rng: Math.random,
      hintStep: 0,
      stats: { mowersUsed: 0, planted: 0 },
    };
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ================= DOM ================= */
  var canvas, ctx, DPR = 1;
  function fitCanvas() {
    var r = canvas.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * DPR);
    canvas.height = Math.round(r.width * (A.H / A.W) * DPR);
  }
  function show(id) {
    ['menu', 'loadout', 'almanac', 'game'].forEach(function (s) {
      $('screen-' + s).classList.toggle('hidden', s !== id);
    });
    if (S) S.screen = id;
  }

  /* ================= MENU / LOADOUT / ALMANAC ================= */
  function plantIcon(id, size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    var s = size / 80;
    g.scale(s, s);
    A.drawPlant(g, id, 40, 72, 1.2, id === 'wallnut' ? { dmg: 0 } : id === 'potatomine' ? { armed: true } : {});
    return c;
  }
  function buildLoadout() {
    var grid = $('loadout-grid');
    grid.innerHTML = '';
    PLANT_IDS.forEach(function (id) {
      var p = PLANTS[id];
      var d = document.createElement('div');
      d.className = 'lo-card' + (S.loadout.indexOf(id) >= 0 ? ' sel' : '');
      d.appendChild(plantIcon(id, 64));
      d.insertAdjacentHTML('beforeend',
        '<b>' + p.name + '</b><span>☀️' + p.cost + '</span><i>' + p.desc + '</i>');
      d.addEventListener('click', function () {
        AU.click();
        var i = S.loadout.indexOf(id);
        if (i >= 0) {
          if (S.loadout.length <= 1) { AU.error(); return; }
          S.loadout.splice(i, 1);
        } else {
          if (S.loadout.length >= 6) { AU.error(); shakeEl(d); return; }
          S.loadout.push(id);
        }
        buildLoadout();
        $('loadout-count').textContent = S.loadout.length + ' / 6';
        $('start-btn').disabled = S.loadout.length !== 6;
      });
      grid.appendChild(d);
    });
    $('loadout-count').textContent = S.loadout.length + ' / 6';
    $('start-btn').disabled = S.loadout.length !== 6;
  }
  function shakeEl(el) {
    el.classList.remove('deny'); void el.offsetWidth; el.classList.add('deny');
  }
  function buildAlmanac() {
    function fill(elId, items, isPlant) {
      var el = $(elId); el.innerHTML = '';
      items.forEach(function (id) {
        var d = isPlant ? PLANTS[id] : ZTYPES[id];
        var card = document.createElement('div');
        card.className = 'al-card';
        if (isPlant) card.appendChild(plantIcon(id, 56));
        else {
          var c = document.createElement('canvas');
          c.width = 56; c.height = 56;
          var g = c.getContext('2d'); g.scale(0.7, 0.7);
          A.drawZombie(g, id, 40, 78, 1.2, { walk: 0.6 });
          card.appendChild(c);
        }
        var extra = isPlant
          ? '<span>☀️' + d.cost + ' · ❤️' + d.hp + '</span>'
          : '<span>❤️' + d.hp + ' · 👟' + d.speed + '/s</span>';
        card.insertAdjacentHTML('beforeend',
          '<div><b>' + d.name + '</b>' + extra + '<i>' + d.desc + '</i></div>');
        el.appendChild(card);
      });
    }
    fill('al-plants', PLANT_IDS, true);
    fill('al-zombies', Object.keys(ZTYPES), false);
  }

  /* ================= HUD ================= */
  function buildPackets() {
    var bar = $('packets');
    bar.innerHTML = '';
    S.loadout.forEach(function (id) {
      var p = PLANTS[id];
      var b = document.createElement('button');
      b.className = 'packet'; b.dataset.p = id;
      b.appendChild(plantIcon(id, 52));
      b.insertAdjacentHTML('beforeend',
        '<span class="pk-cost">☀️' + p.cost + '</span><span class="pk-cd"></span>');
      b.setAttribute('aria-label', p.name + ', ' + p.cost + ' sun. ' + p.desc);
      b.addEventListener('click', function () {
        AU.unlock();
        if (S.shovelMode) { S.shovelMode = false; }
        S.selected = (S.selected === id) ? null : id;
        AU.click();
        refreshPackets();
      });
      bar.appendChild(b);
    });
    var sh = document.createElement('button');
    sh.className = 'packet shovel'; sh.dataset.p = '__shovel';
    sh.innerHTML = '<span class="sh-emoji">🪏</span><span class="pk-cost">dig</span>';
    sh.setAttribute('aria-label', 'Shovel: remove a plant');
    sh.addEventListener('click', function () {
      S.shovelMode = !S.shovelMode; S.selected = null;
      AU.click(); refreshPackets();
    });
    bar.appendChild(sh);
    refreshPackets();
  }
  function refreshPackets() {
    var bar = $('packets');
    if (!bar) return;
    Array.prototype.forEach.call(bar.children, function (b) {
      var id = b.dataset.p;
      if (id === '__shovel') { b.classList.toggle('sel', S.shovelMode); return; }
      var p = PLANTS[id];
      var cdLeft = S.cooldowns[id] || 0;
      var afford = S.sun >= p.cost;
      b.classList.toggle('sel', S.selected === id);
      b.classList.toggle('cant', !afford || cdLeft > 0);
      b.style.setProperty('--cdp', cdLeft > 0 ? (cdLeft / p.cd).toFixed(3) : '0');
    });
    $('sun-count').textContent = S.sun;
    $('score-count').textContent = S.score;
  }
  function updateWavebar() {
    var pct = S.waveTotal > 0 ? (S.waveKilled / S.waveTotal) * 100 : 0;
    $('wave-fill').style.width = clamp(pct, 0, 100).toFixed(1) + '%';
    $('wave-label').textContent = S.wave === 0 ? 'get ready…' : 'wave ' + S.wave + ' / 10';
  }

  /* ================= GAME FLOW ================= */
  function startGame(daily) {
    S = newState();
    S.daily = !!daily;
    if (daily) {
      S.dailyDate = new Date().toISOString().slice(0, 10);
      S.dailySeed = 0;
    }
    for (var r = 0; r < ROWS; r++) S.mowers.push({ r: r, x: 34, used: false, running: false, runT: 0 });
    A.clearParts();
    buildPackets();
    updateWavebar();
    $('sun-count').textContent = S.sun;
    $('score-count').textContent = S.score;
    show('game');
    fitCanvas();
    S.running = true; S.paused = false;
    banner('READY…', 'SET…', 'BLOOM! 🌸', function () {
      banner('🌱', 'The weeds are coming…', 'Plant sunflowers first! ☀️');
      waitForSeedThen(1);
    });
    AU.ready();
    if (!daily) return;
    // daily: fetch seed, then it's the same for everyone today
    S.seedReady = false;
    fetch(ARCADE_BASE + '/daily?game=bloom-defense')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.seed != null) {
          S.dailySeed = d.seed; S.dailyDate = d.date;
          S.rng = mulberry32(d.seed);
          S.seedReady = true;
          toast('📅 Daily Bloom · ' + d.date);
        } else { S.seedReady = true; }
      })
      .catch(function () { S.seedReady = true; });
  }

  // Daily mode: don't start wave 1 until the seed arrives (else wave 1 differs per player)
  function waitForSeedThen(n) {
    if (!S.daily || S.seedReady) { beginWave1(n); return; }
    var tries = 0;
    var iv = setInterval(function () {
      if (!S.running || S.over) { clearInterval(iv); return; }
      if (S.seedReady || ++tries > 25) { clearInterval(iv); beginWave1(n); }
    }, 200);
  }
  function beginWave1(n) {
    setTimeout(function () { if (S.running && !S.over && !S.paused) startWave(n); }, 1200);
  }

  function buildWaveQueue(wi) {
    var w = WAVES[wi], q = [];
    Object.keys(ZTYPES).forEach(function (t) {
      var n = w[t === 'conehead' ? 'conehead' : t] || 0;
      for (var i = 0; i < n; i++) q.push(t);
    });
    var rng = S.rng;
    for (var i = q.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = q[i]; q[i] = q[j]; q[j] = tmp;
    }
    // rows: avoid stacking >2 in a row on the same lane early
    var rows = [];
    for (var k = 0; k < q.length; k++) rows.push(Math.floor(rng() * ROWS));
    return { types: q, rows: rows, gap: w.gap, huge: !!w.huge, fin: !!w.fin };
  }

  function startWave(n) {
    S.wave = n;
    var wq = buildWaveQueue(n - 1);
    S.spawnQueue = wq.types.map(function (t, i) { return { type: t, row: wq.rows[i] }; });
    S.spawnGap = wq.gap; S.spawnT = 1.2;
    S.waveTotal = S.spawnQueue.length;
    S.waveKilled = 0;
    S.waveState = 'spawning';
    updateWavebar();
    if (wq.huge) {
      banner('⚠️', wq.fin ? 'FINAL WAVE!' : 'A HUGE WAVE IS APPROACHING!', wq.fin ? 'Hold the lawn! 🌸' : 'Brace your petals…');
      AU.horn();
    } else if (n > 1) {
      banner('Wave ' + n, '', '');
      AU.click();
    }
  }

  function banner(a, b, c, done) {
    var el = $('banner');
    el.innerHTML = '<div class="b1">' + a + '</div>' +
      (b ? '<div class="b2">' + b + '</div>' : '') +
      (c ? '<div class="b3">' + c + '</div>' : '');
    el.classList.remove('hidden'); el.classList.remove('anim');
    void el.offsetWidth; el.classList.add('anim');
    clearTimeout(banner._t);
    banner._t = setTimeout(function () {
      el.classList.add('hidden');
      if (done) done();
    }, 1700);
  }
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.add('hidden'); }, 2600);
  }

  /* ================= SIM UPDATE ================= */
  function plantAt(r, c) {
    for (var i = 0; i < S.plants.length; i++) {
      var p = S.plants[i];
      if (p.r === r && p.c === c) return p;
    }
    return null;
  }
  function zombieAhead(r, xMin, xMax) {
    for (var i = 0; i < S.zombies.length; i++) {
      var z = S.zombies[i];
      if (z.r === r && z.x > xMin && z.x < xMax) return z;
    }
    return null;
  }

  function update(dt) {
    S.time += dt;
    var t = S.time;

    // cooldowns
    for (var id in S.cooldowns) {
      S.cooldowns[id] -= dt;
      if (S.cooldowns[id] <= 0) delete S.cooldowns[id];
    }
    // craters
    for (var k in S.craters) {
      S.craters[k] -= dt;
      if (S.craters[k] <= 0) delete S.craters[k];
    }

    // sky sun
    S.skyT -= dt;
    if (S.skyT <= 0) {
      S.skyT = SKY_SUN_EVERY * (0.85 + S.rng() * 0.3);
      spawnSun(A.MOWER_W + 40 + S.rng() * (COLS * 80 - 80), -20, true);
    }
    // worm
    S.wormT -= dt;
    if (S.wormT <= 0 && !S.worm) {
      S.wormT = WORM_EVERY * (0.7 + S.rng() * 0.6);
      if (S.rng() < 0.75) {
        S.worm = {
          x: A.MOWER_W + 60 + S.rng() * (COLS * 80 - 120),
          y: 40 + S.rng() * (A.H - 80), t: 0, ttl: 4.5, peek: 0
        };
        AU.worm();
      }
    }
    if (S.worm) {
      var w = S.worm;
      w.t += dt; w.ttl -= dt;
      w.peek = clamp(Math.min(w.t * 3, (w.ttl < 1 ? w.ttl : 1) * 3), 0, 1);
      if (w.ttl <= 0) S.worm = null;
    }

    // wave spawning
    if (S.waveState === 'spawning') {
      S.spawnT -= dt;
      if (S.spawnT <= 0) {
        if (S.spawnQueue.length) {
          var s = S.spawnQueue.shift();
          spawnZombie(s.type, s.row);
          S.spawnT = S.spawnGap * (0.8 + S.rng() * 0.4);
        } else {
          S.waveState = 'fighting';
        }
      }
    } else if (S.waveState === 'fighting') {
      if (S.zombies.length === 0) {
        // wave cleared
        var bonus = 250 * S.wave;
        S.score += bonus;
        toast('Wave ' + S.wave + ' cleared! +' + bonus);
        AU.sun();
        if (S.wave >= WAVES.length) return winGame();
        S.waveState = 'idle';
        setTimeout(function () { if (S.running && !S.over && !S.paused) startWave(S.wave + 1); }, 2600);
      }
    }

    updatePlants(dt, t);
    updateZombies(dt, t);
    updatePeas(dt);
    updateMelons(dt, t);
    updateSuns(dt);
    updateMowers(dt);
    A.updateParts(dt);
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 3);
    S.packetT = (S.packetT || 0) + dt;
    if (S.packetT > 0.2) { S.packetT = 0; refreshPackets(); }

    // first-time hints
    if (S.hintStep === 0 && S.time > 2) {
      S.hintStep = 1;
      if (!localStorage.getItem('bloom2_seen')) {
        toast('👆 Tap a seed packet, then tap the lawn to plant');
        localStorage.setItem('bloom2_seen', '1');
      }
    }
  }

  function spawnSun(x, y, falling) {
    S.suns.push({ x: x, y: y, x0: x, y0: y, yT: falling ? 60 + S.rng() * (A.H - 120) : y,
      t: 0, dur: falling ? 3.2 : 0, value: SUN_VALUE, ttl: SUN_DESPAWN, falling: falling });
  }

  function spawnZombie(type, r) {
    var z = ZTYPES[type];
    S.zombies.push({
      type: type, r: r, x: COLS + 0.4 + S.rng() * 0.5,
      hp: z.hp, maxHp: z.hp, walk: S.rng() * 6, slowT: 0,
      eatT: 0, coneHp: z.cone || 0, paperHp: z.paper || 0, enraged: false,
      vault: null, dead: false
    });
  }

  function updatePlants(dt, t) {
    for (var i = S.plants.length - 1; i >= 0; i--) {
      var p = S.plants[i], def = PLANTS[p.id];
      p.t += dt;
      if (p.recoil > 0) p.recoil = Math.max(0, p.recoil - dt * 4);
      var px = p.c + 1; // plant cell-left in lawn units

      if (p.id === 'sunflower') {
        p.sunT -= dt;
        if (p.sunT <= 0) {
          p.sunT = SUNFLOWER_EVERY * (0.9 + S.rng() * 0.2);
          p.glow = 1.2;
          spawnSun(A.cellX(p.c) + (S.rng() * 40 - 20), A.cellY(p.r) - 10, false);
          A.puff(A.cellX(p.c), A.cellY(p.r) - 50, 8, ['#ffe97a', '#fff3b0'], 60, 0.7, 3, 60);
        }
        if (p.glow > 0) p.glow -= dt;
      } else if (p.id === 'peashooter' || p.id === 'snowpea' || p.id === 'repeater') {
        p.cool -= dt;
        if (p.cool <= 0 && zombieAhead(p.r, px + 0.3, COLS + 1)) {
          firePea(p, p.id === 'snowpea');
          if (p.id === 'repeater') {
            (function (pp) { setTimeout(function () { if (S.running && !S.over && !S.paused && S.plants.indexOf(pp) >= 0) firePea(pp, false); }, 180); })(p);
          }
          p.cool = PEA_EVERY;
          p.recoil = 1;
        }
      } else if (p.id === 'melonpult') {
        p.cool -= dt;
        if (p.cool <= 0) {
          var z = zombieAhead(p.r, px + 0.3, COLS + 1);
          if (z) {
            S.melons.push({ r: p.r, x0: px * 80 + A.MOWER_W, x1: z.x * 80 + A.MOWER_W, y0: A.cellY(p.r) - 52, t: 0, dur: 0.85, dmg: MELON_DMG });
            AU.lob();
            p.cool = MELON_EVERY; p.recoil = 1;
          }
        }
      } else if (p.id === 'potatomine') {
        if (!p.armed) {
          p.armT -= dt;
          if (p.armT <= 0) { p.armed = true; AU.arm(); A.puff(A.cellX(p.c), A.cellY(p.r) - 20, 10, A.DIRT_COLS, 70, 0.6, 4, 200); }
        } else {
          var vz = zombieAhead(p.r, px - 0.35, px + 0.55);
          if (vz) {
            explode(A.cellX(p.c), A.cellY(p.r) - 20, 1.1, 1800);
            S.plants.splice(i, 1);
            continue;
          }
        }
      } else if (p.id === 'cherrybomb') {
        p.fuse -= dt;
        if ((p.fuse * 10 | 0) !== ((p.fuse + dt) * 10 | 0)) AU.fuse();
        if (p.fuse <= 0) {
          explode(A.cellX(p.c), A.cellY(p.r) - 20, 1.6, 1800);
          S.craters[p.r + ',' + p.c] = 8;
          S.plants.splice(i, 1);
          continue;
        }
      }
      if (p.hp <= 0 && p.id !== 'cherrybomb') {
        A.puff(A.cellX(p.c), A.cellY(p.r) - 20, 14, A.LEAF_COLS, 90, 0.8, 5, 260);
        AU.shovel();
        S.plants.splice(i, 1);
      }
    }
  }

  function firePea(p, frozen) {
    var px = (p.c + 1) * 80 + A.MOWER_W;
    S.peas.push({ r: p.r, x: px + 20, vx: PEA_SPEED * 80, frozen: frozen, dmg: PEA_DMG });
    AU.shoot();
  }

  function explode(x, y, radiusCells, dmg) {
    AU.boom();
    S.shake = 1;
    A.puff(x, y, 40, A.FIRE_COLS, 320, 0.9, 7, 260);
    A.puff(x, y, 24, A.DIRT_COLS, 220, 1.1, 6, 420);
    var rPx = radiusCells * 80;
    for (var i = S.zombies.length - 1; i >= 0; i--) {
      var z = S.zombies[i];
      var zx = z.x * 80 + A.MOWER_W, zy = A.cellY(z.r);
      if (Math.hypot(zx - x, zy - y) < rPx) hurtZombie(z, dmg, false);
    }
    // NB: explosions never hurt your own plants (PvZ rule)
  }

  function hurtZombie(z, dmg, frozen) {
    if (z.dead) return;
    // armor layers absorb first
    if (z.coneHp > 0) {
      var c = Math.min(z.coneHp, dmg);
      z.coneHp -= c; dmg -= c;
      z.coneDmg = 1 - z.coneHp / (ZTYPES[z.type].cone || 1);
    }
    if (dmg > 0 && z.paperHp > 0) {
      var pp = Math.min(z.paperHp, dmg);
      z.paperHp -= pp; dmg -= pp;
      z.paperDmg = 1 - z.paperHp / (ZTYPES[z.type].paper || 1);
      if (z.paperHp <= 0 && !z.enraged) {
        z.enraged = true;
        A.puff(z.x * 80 + A.MOWER_W, A.cellY(z.r) - 60, 12, ['#f2ede2', '#fff'], 120, 0.7, 4, 200);
        toast('📰 ' + ZTYPES[z.type].name + ' is FURIOUS!');
      }
    }
    z.hp -= dmg;
    z.dmg = 1 - Math.max(0, z.hp) / z.maxHp;
    if (frozen && z.type !== 'brute') z.slowT = 4;
    else if (frozen) z.slowT = 2;
    if (z.hp <= 0) killZombie(z);
  }

  function killZombie(z) {
    if (z.dead) return;
    z.dead = true;
    S.score += ZTYPES[z.type].score;
    S.waveKilled++;
    updateWavebar();
    var zx = z.x * 80 + A.MOWER_W, zy = A.cellY(z.r) - 40;
    A.puff(zx, zy, 16, ['#9db38a', '#6b5b4c', '#4a4a5a'], 130, 0.8, 5, 320);
    AU.gulp();
    refreshPackets();
  }

  function updateZombies(dt, t) {
    for (var i = S.zombies.length - 1; i >= 0; i--) {
      var z = S.zombies[i];
      if (z.dead) { S.zombies.splice(i, 1); continue; }
      var def = ZTYPES[z.type];
      var spd = def.speed * (z.slowT > 0 ? 0.5 : 1) * (z.enraged ? def.enrage : 1);
      if (z.slowT > 0) z.slowT -= dt;
      z.walk += dt * (4 + spd * 8);

      // vaulting
      if (z.vault != null) {
        z.vault += dt / 0.7;
        if (z.vault >= 1) {
          z.vault = null;
          z.vaulted = true;
        }
        continue;
      }

      var px = z.x; // lawn units
      // find plant in the way
      var blocker = null;
      for (var j = 0; j < S.plants.length; j++) {
        var p = S.plants[j];
        if (p.r !== z.r) continue;
        var pcx = p.c + 1; // cell-left
        if (px - 0.45 <= pcx + 0.9 && px >= pcx + 0.35 && p.id !== 'cherrybomb') { blocker = p; break; }
      }
      if (blocker) {
        if (def.vaults && !z.vaulted) {
          z.vault = 0;
          z.vaultX0 = px * 80 + A.MOWER_W; z.vaultX1 = (blocker.c + 0.15) * 80 + A.MOWER_W;
          z.vaultY0 = A.cellY(z.r);
          AU.click();
          continue;
        }
        // eat
        z.eatT += dt;
        blocker.hp -= BITE_DPS * dt * (z.type === 'brute' ? 1.8 : 1);
        if (z.eatT > 0.5) { z.eatT = 0; AU.chomp(); A.puff(A.cellX(blocker.c) + 20, A.cellY(blocker.r) - 40, 5, A.LEAF_COLS, 70, 0.5, 4, 240); }
      } else {
        z.x -= spd * dt;
        z.eatT = 0;
      }

      // mower check
      if (z.x < 0.45) {
        var m = S.mowers[z.r];
        if (!m.used) {
          m.used = true; m.running = true; m.runT = 0;
          S.stats.mowersUsed++;
          AU.mower();
          toast('🚜 Lawnmower save!');
        } else if (z.x < -0.1) {
          return loseGame();
        }
      }
    }
    // sweep dead (safety)
    for (var k = S.zombies.length - 1; k >= 0; k--) {
      if (S.zombies[k].dead) S.zombies.splice(k, 1);
    }
  }

  function updatePeas(dt) {
    for (var i = S.peas.length - 1; i >= 0; i--) {
      var pea = S.peas[i];
      pea.x += pea.vx * dt;
      var hit = false;
      for (var j = 0; j < S.zombies.length; j++) {
        var z = S.zombies[j];
        if (z.dead || z.r !== pea.r) continue;
        var zx = z.x * 80 + A.MOWER_W;
        if (Math.abs(pea.x - zx) < 22 && pea.x < zx + 20) {
          hurtZombie(z, pea.dmg, pea.frozen);
          A.puff(pea.x, A.cellY(pea.r) - 46, 6, pea.frozen ? ['#cfeeff', '#fff'] : A.PEA_COLS, 80, 0.4, 3.5, 160);
          if (pea.frozen) AU.freeze(); else AU.splat();
          hit = true;
          break;
        }
      }
      if (hit || pea.x > A.W) S.peas.splice(i, 1);
    }
  }

  function updateMelons(dt, t) {
    for (var i = S.melons.length - 1; i >= 0; i--) {
      var m = S.melons[i];
      m.t += dt;
      if (m.t >= m.dur) {
        // splash
        A.puff(m.x1, A.cellY(m.r) - 30, 22, ['#43a047', '#e0393e', '#7ee06a'], 170, 0.8, 6, 380);
        AU.splat();
        for (var j = S.zombies.length - 1; j >= 0; j--) {
          var z = S.zombies[j];
          if (z.dead || z.r !== m.r) continue;
          var zx = z.x * 80 + A.MOWER_W;
          if (Math.abs(zx - m.x1) < 80) hurtZombie(z, m.dmg, false);
        }
        S.melons.splice(i, 1);
      }
    }
  }

  function updateSuns(dt) {
    for (var i = S.suns.length - 1; i >= 0; i--) {
      var s = S.suns[i];
      s.t += dt; s.ttl -= dt;
      if (s.falling && s.t < s.dur) {
        s.y = s.y0 + (s.yT - s.y0) * Math.min(1, s.t / s.dur);
      }
      if (s.ttl <= 0) S.suns.splice(i, 1);
    }
  }

  function updateMowers(dt) {
    S.mowers.forEach(function (m) {
      if (m.running) {
        m.runT += dt;
        m.x += dt * 420;
        // kill zombies in row
        for (var i = S.zombies.length - 1; i >= 0; i--) {
          var z = S.zombies[i];
          if (z.dead || z.r !== m.r) continue;
          var zx = z.x * 80 + A.MOWER_W;
          if (zx > m.x - 40 && zx < m.x + 60) {
            A.puff(zx, A.cellY(z.r) - 40, 18, ['#9db38a', '#e0393e'], 200, 0.8, 6, 300);
            killZombie(z);
          }
        }
        if (m.x > A.W + 40) m.running = false;
      }
    });
  }

  /* ================= RENDER ================= */
  function render() {
    var t = S.time;
    var cw = canvas.width, scale = cw / A.W;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (S.shake > 0) {
      ctx.translate((Math.random() - 0.5) * 10 * S.shake, (Math.random() - 0.5) * 8 * S.shake);
    }
    A.drawLawn(ctx, t);

    // craters
    for (var k in S.craters) {
      var rc = k.split(',');
      var cx = A.cellX(+rc[1]), cy = A.cellY(+rc[0]);
      ctx.fillStyle = 'rgba(20,12,6,0.55)';
      A._ell(ctx, cx, cy + 6, 30, 12, 0); ctx.fill();
    }

    // plants sorted by row
    var ps = S.plants.slice().sort(function (a, b) { return a.r - b.r; });
    ps.forEach(function (p) {
      var x = A.cellX(p.c), y = A.cellY(p.r) + 8;
      var o = { recoil: p.recoil || 0 };
      if (p.id === 'wallnut') o.dmg = 1 - p.hp / p.maxHp;
      if (p.id === 'potatomine') o.armed = p.armed;
      if (p.id === 'cherrybomb') o.fuse = clamp(p.fuse / PLANTS.cherrybomb.fuse, 0, 1);
      if (p.id === 'sunflower') o.glow = p.glow > 0;
      // eat shake
      A.drawPlant(ctx, p.id, x, y, p.t, o);
    });

    // mowers (behind zombies)
    S.mowers.forEach(function (m) {
      if (!m.used || m.running) A.drawMower(ctx, m.x, A.cellY(m.r) + 10, t, m.running);
    });

    // zombies sorted by row then x
    var zs = S.zombies.slice().sort(function (a, b) { return (a.r - b.r) || (a.x - b.x); });
    zs.forEach(function (z) {
      var x = z.x * 80 + A.MOWER_W, y = A.cellY(z.r) + 8;
      var o = { walk: z.walk, dmg: z.dmg || 0, slowed: z.slowT > 0, coneDmg: z.coneDmg || 0, paperDmg: z.paperDmg || 0 };
      if (z.vault != null) {
        o.vault = z.vault; o.vaultX0 = z.vaultX0; o.vaultX1 = z.vaultX1; o.vaultY0 = z.vaultY0;
        A.drawZombie(ctx, z.type, 0, 0, t, o);
      } else {
        A.drawZombie(ctx, z.type, x, y, t, o);
      }
    });

    // peas & melons
    S.peas.forEach(function (p) { A.drawPea(ctx, p.x, A.cellY(p.r) - 46, p.frozen); });
    S.melons.forEach(function (m) {
      var k = m.t / m.dur;
      var mx = m.x0 + (m.x1 - m.x0) * k;
      var my = m.y0 - Math.sin(k * Math.PI) * 130;
      A.drawMelon(ctx, mx, my, t);
    });

    // worm
    if (S.worm) A.drawWorm(ctx, S.worm.x, S.worm.y, S.worm.t, S.worm.peek);

    A.drawParts(ctx);

    // suns on top
    S.suns.forEach(function (s) {
      var fade = s.ttl < 2 ? (0.4 + 0.6 * Math.abs(Math.sin(t * 6))) : 1;
      ctx.globalAlpha = fade;
      A.drawSun(ctx, s.x, s.y, t, 20);
      ctx.globalAlpha = 1;
    });

    // placement ghost
    if ((S.selected || S.shovelMode) && S.hover) {
      var h = S.hover;
      if (h.r >= 0 && h.r < ROWS && h.c >= 0 && h.c < COLS) {
        ctx.fillStyle = S.shovelMode ? 'rgba(255,80,80,0.25)' : 'rgba(255,255,255,0.22)';
        A._rr(ctx, A.MOWER_W + h.c * 80 + 3, h.r * 100 + 3, 74, 94, 10);
        ctx.fill();
      }
    }
  }

  /* ================= INPUT ================= */
  function canvasPos(e) {
    var r = canvas.getBoundingClientRect();
    var cx = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX);
    var cy = (e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY);
    return {
      x: (cx - r.left) / r.width * A.W,
      y: (cy - r.top) / r.height * A.H
    };
  }
  function onTap(e) {
    if (!S.running || S.paused || S.over) return;
    AU.unlock();
    var p = canvasPos(e);
    // worm?
    if (S.worm && Math.hypot(p.x - S.worm.x, p.y - (S.worm.y - 20)) < 34) {
      S.sun += WORM_VALUE;
      A.puff(S.worm.x, S.worm.y - 30, 14, ['#ffe97a', '#fff3b0'], 110, 0.8, 4, 120);
      toast('🪱 Wally says thanks! +' + WORM_VALUE + ' sun');
      AU.sun();
      S.worm = null;
      refreshPackets();
      return;
    }
    // sun?
    for (var i = S.suns.length - 1; i >= 0; i--) {
      var s = S.suns[i];
      if (Math.hypot(p.x - s.x, p.y - s.y) < 34) {
        S.suns.splice(i, 1);
        S.sun += s.value;
        A.puff(s.x, s.y, 10, ['#ffe97a', '#fff3b0'], 90, 0.6, 3.5, 80);
        AU.sun();
        refreshPackets();
        bumpSun();
        return;
      }
    }
    // lawn tile?
    if (p.x > A.MOWER_W && p.x < A.MOWER_W + COLS * 80) {
      var c = Math.floor((p.x - A.MOWER_W) / 80);
      var r = Math.floor(p.y / 100);
      if (r >= 0 && r < ROWS) {
        if (S.shovelMode) {
          var pl = plantAt(r, c);
          if (pl) {
            A.puff(A.cellX(c), A.cellY(r) - 20, 12, A.LEAF_COLS, 90, 0.7, 5, 260);
            AU.shovel();
            S.plants.splice(S.plants.indexOf(pl), 1);
            S.shovelMode = false;
            refreshPackets();
          }
          return;
        }
        if (S.selected) tryPlant(r, c);
      }
    }
  }
  function bumpSun() {
    var el = $('sun-bank');
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }
  function tryPlant(r, c) {
    var id = S.selected, def = PLANTS[id];
    if (plantAt(r, c)) { AU.error(); return; }
    if (S.craters[r + ',' + c]) { toast('🌋 The soil is still scorched!'); AU.error(); return; }
    if (S.sun < def.cost) { toast('Not enough sun! ☀️'); AU.error(); return; }
    if (S.cooldowns[id]) { AU.error(); return; }
    S.sun -= def.cost;
    S.cooldowns[id] = def.cd;
    var p = { id: id, r: r, c: c, hp: def.hp, maxHp: def.hp, t: Math.random() * 5, cool: 0.4, sunT: 6, armT: def.armTime || 0, armed: false, fuse: def.fuse || 0, recoil: 0, glow: 0 };
    S.plants.push(p);
    S.stats.planted++;
    A.puff(A.cellX(c), A.cellY(r) + 4, 10, A.DIRT_COLS, 80, 0.6, 4, 260);
    AU.plant();
    if (!S.keepSelected) S.selected = null;
    refreshPackets();
  }

  /* ================= WIN / LOSE ================= */
  function winGame() {
    S.over = true; S.won = true; S.running = false;
    var mowerBonus = (ROWS - S.stats.mowersUsed) * 500;
    S.score += mowerBonus;
    var best = +(localStorage.getItem(BEST_KEY) || 0);
    if (S.score > best) { best = S.score; localStorage.setItem(BEST_KEY, best); }
    AU.win();
    A.puff(A.W / 2, A.H / 2, 80, ['#ffe97a', '#ff9d9d', '#7ee06a', '#aee3ff'], 300, 1.6, 6, 200);
    setTimeout(function () {
      $('win-score').textContent = S.score.toLocaleString();
      $('win-best').textContent = best.toLocaleString();
      $('win-sub').textContent = (S.daily ? '📅 Daily Bloom · ' + S.dailyDate : 'All 10 waves survived!') +
        (mowerBonus ? ' · 🚜 Mower bonus +' + mowerBonus : '');
      showModal('win');
      arcadeSubmit(S.daily ? 'daily-' + S.dailyDate : 'main');
    }, 1200);
  }
  function loseGame() {
    if (S.over) return;
    S.over = true; S.running = false;
    AU.lose();
    setTimeout(function () {
      $('lose-wave').textContent = 'The weeds overran wave ' + Math.max(1, S.wave) + '.';
      showModal('lose');
    }, 900);
  }
  function showModal(which) {
    $('modal-win').classList.toggle('hidden', which !== 'win');
    $('modal-lose').classList.toggle('hidden', which !== 'lose');
    $('modal').classList.remove('hidden');
  }
  function hideModal() { $('modal').classList.add('hidden'); }

  /* ================= ARCADE ================= */
  function arcadeSubmit(board) {
    var box = $('arcade-box');
    if (!box) return;
    box.innerHTML = '<div class="arc-empty">🏆 connecting…</div>';
    function renderBox(top, rank, name) {
      var rows = (!top || !top.length)
        ? '<div class="arc-empty">No scores yet — be the first!</div>'
        : top.slice(0, 5).map(function (e, i) {
            var medals = ['🥇', '🥈', '🥉'];
            return '<div class="arc-row' + (e.name === name ? ' me' : '') + '"><span>' +
              (medals[i] || (i + 1) + '.') + ' ' + escHtml(e.name) + '</span><b>' + (+e.score).toLocaleString() + '</b></div>';
          }).join('');
      box.innerHTML = (rank > 0 ? '<div class="arc-rank">🌍 GLOBAL #' + rank + '</div>' : '') +
        '<div class="arc-title">🏆 ' + (S.daily ? 'DAILY BLOOM BEST' : 'GLOBAL BEST') + '</div>' + rows;
    }
    function post(name) {
      fetch(ARCADE_BASE + '/score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: 'bloom-defense', board: board, name: name, score: S.score })
      }).then(function (r) { return r.json(); }).then(function (d) {
        renderBox(d.top, d.rank || 0, name);
      }).catch(function () { renderBox(null, 0, name); });
    }
    var name = '';
    try { name = (localStorage.getItem(NAME_KEY) || '').trim(); } catch (e) {}
    if (name) { post(name); return; }
    box.innerHTML = '<div class="arc-form"><input id="arc-name" maxlength="12" placeholder="YOUR NAME">' +
      '<button id="arc-go">SAVE</button></div>';
    $('arc-go').addEventListener('click', function () {
      var v = $('arc-name').value.trim().slice(0, 12);
      if (!v) return;
      try { localStorage.setItem(NAME_KEY, v); } catch (e) {}
      box.innerHTML = '<div class="arc-empty">🏆 sending…</div>';
      post(v);
    });
    // also load board behind the form
    fetch(ARCADE_BASE + '/scores?game=bloom-defense&board=' + encodeURIComponent(board))
      .then(function (r) { return r.json(); }).then(function (d) {
        if (d && d.top && !$('arc-name')) renderBox(d.top, 0, '');
      }).catch(function () {});
  }
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ================= LOOP ================= */
  var lastTs = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!S || !S.running || S.paused || S.screen !== 'game') return;
    var dt = Math.min((ts - lastTs) / 1000 || 0.016, 0.1);
    lastTs = ts;
    update(dt);
    render();
    // periodic HUD refresh (cheap parts every frame)
    $('sun-count').textContent = S.sun;
  }

  /* ================= BOOT ================= */
  function boot() {
    S = newState();
    canvas = $('board');
    ctx = canvas.getContext('2d');

    // menu
    $('play-btn').addEventListener('click', function () { AU.unlock(); AU.click(); buildLoadout(); show('loadout'); });
    $('daily-btn').addEventListener('click', function () { AU.unlock(); AU.click(); buildLoadout(); S.daily = true; show('loadout'); });
    $('almanac-btn').addEventListener('click', function () { AU.click(); buildAlmanac(); show('almanac'); });
    $('how-btn').addEventListener('click', function () { AU.click(); $('howto').classList.toggle('hidden'); });
    var best = +(localStorage.getItem(BEST_KEY) || 0);
    if (best > 0) $('menu-best').textContent = '🏆 best: ' + best.toLocaleString();

    // loadout
    $('lo-back').addEventListener('click', function () { AU.click(); S.daily = false; show('menu'); });
    $('start-btn').addEventListener('click', function () {
      AU.click();
      var daily = S.daily;
      startGame(daily);
    });

    // almanac
    $('al-back').addEventListener('click', function () { AU.click(); show('menu'); });
    Array.prototype.forEach.call(document.querySelectorAll('.al-tab'), function (t) {
      t.addEventListener('click', function () {
        AU.click();
        Array.prototype.forEach.call(document.querySelectorAll('.al-tab'), function (x) { x.classList.remove('on'); });
        t.classList.add('on');
        $('al-plants').classList.toggle('hidden', t.dataset.tab !== 'plants');
        $('al-zombies').classList.toggle('hidden', t.dataset.tab !== 'zombies');
      });
    });

    // game HUD
    $('pause-btn').addEventListener('click', function () {
      if (!S.running || S.over) return;
      S.paused = !S.paused;
      $('pause-btn').textContent = S.paused ? '▶️' : '⏸️';
      AU.click();
    });
    $('mute-btn').addEventListener('click', function () {
      var m = AU.toggle();
      $('mute-btn').textContent = m ? '🔇' : '🔊';
    });
    $('quit-btn').addEventListener('click', function () {
      AU.click();
      S.running = false; S.over = true;
      hideModal(); show('menu');
      var b = +(localStorage.getItem(BEST_KEY) || 0);
      if (b > 0) $('menu-best').textContent = '🏆 best: ' + b.toLocaleString();
    });

    // canvas input
    canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); onTap(e); }, { passive: false });
    canvas.addEventListener('pointermove', function (e) {
      if (!S) return;
      var p = canvasPos(e);
      if (p.x > A.MOWER_W && p.x < A.MOWER_W + COLS * 80 && p.y > 0 && p.y < A.H) {
        S.hover = { r: Math.floor(p.y / 100), c: Math.floor((p.x - A.MOWER_W) / 80) };
      } else S.hover = null;
    });
    canvas.addEventListener('pointerleave', function () { if (S) S.hover = null; });

    // modals
    $('again-btn').addEventListener('click', function () { AU.click(); hideModal(); buildLoadout(); S.daily = false; show('loadout'); });
    $('retry-btn').addEventListener('click', function () { AU.click(); hideModal(); buildLoadout(); show('loadout'); });
    $('win-menu-btn').addEventListener('click', function () { AU.click(); hideModal(); show('menu'); });
    $('lose-menu-btn').addEventListener('click', function () { AU.click(); hideModal(); show('menu'); });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && S && S.running && !S.over) {
        S.paused = true;
        var pb = $('pause-btn'); if (pb) pb.textContent = '▶️';
      }
    });
    window.addEventListener('resize', function () { if (S && S.screen === 'game') fitCanvas(); });

    buildAlmanac();
    show('menu');
    requestAnimationFrame(loop);
  }

  document.addEventListener('DOMContentLoaded', boot);

  // headless test hook (harmless in production)
  window.__bloomTest = { mulberry32: mulberry32, WAVES: WAVES, ZTYPES: ZTYPES, PLANTS: PLANTS };
})();
