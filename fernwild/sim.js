/* ============================================================================
 * Fernwild sim — pure ecosystem logic. No DOM, no canvas, no rAF.
 * Seeded PRNG (mulberry32). Testable headless: `node sim.js` runs self-tests.
 * Time is in seconds; the caller clamps dt and steps in chunks.
 * ========================================================================== */
'use strict';
var FW = (function () {
  var GRID = 8;

  /* growth stages */
  var ST = { EMPTY: 0, SEED: 1, SPROUT: 2, SAPLING: 3, ADULT: 4, ANCIENT: 5, FALLEN: 6 };

  var PLANTS = {
    pine:  { name: 'Pine',       cost: 5,  times: [20, 45, 80],  desc: 'Quick and hardy',        color: '#2f5d33' },
    berry: { name: 'Berry bush',  cost: 12, times: [25, 55, 95],  desc: 'Flowers feed butterflies', color: '#3f7038' },
    oak:   { name: 'Oak',        cost: 20, times: [35, 80, 150],  desc: 'Slow and mighty',        color: '#2a5230' }
  };
  var ANCIENT_T = 260;   /* adult -> ancient */
  var FALLEN_T = 140;    /* ancient -> fallen trunk */
  var MUSH_COST = 8;
  var STORM_COST = 40, STORM_LEN = 20;

  var ACH = {
    'first-sprout': { name: 'Baby Steps',        desc: 'Grow your first sprout' },
    'first-friend': { name: 'Hello There',       desc: 'Welcome your first animal' },
    'free-tree':    { name: 'Free Tree',         desc: 'A squirrel plants a pine for you' },
    'web3':         { name: 'The Wood Wide Web', desc: 'Link 3 trees in one web' },
    'web10':        { name: 'Internet of Trees', desc: 'Link 10 trees in one web' },
    'old-growth':   { name: 'Old Growth',        desc: 'Grow an ancient tree' },
    'circle':       { name: 'Circle of Life',    desc: 'A fallen trunk becomes a home' },
    'social':       { name: 'Social Butterfly',  desc: 'Tap animals 25 times' },
    'doolittle':    { name: 'Dr. Doolittle',     desc: 'Tap animals 100 times' },
    'rainmaker':    { name: 'Rainmaker',         desc: 'Summon a storm' },
    'rich':         { name: 'Thousand Leaves',   desc: 'Hold 1,000 leaves at once' },
    'full-house':   { name: 'Full House',        desc: 'All 8 species move in' }
  };
  function unlock(st, id) {
    if (!st.ach[id]) { st.ach[id] = 1; ev(st, { t: 'ach', id: id }); }
  }

  var ANIMALS = {
    squirrel:  { name: 'Squirrel',  need: 'An adult tree',   small: true,
                 check: function (s) { return s.adultTrees >= 1; },
                 tapText: 'buries an acorn!' },
    rabbit:    { name: 'Rabbit',    need: '2 berry bushes',  small: true,
                 check: function (s) { return s.bushes >= 2; },
                 tapText: 'digs happily!' },
    butterfly: { name: 'Butterfly', need: 'A flowering bush', small: false,
                 check: function (s) { return s.flowering >= 1; },
                 tapText: 'pollinates the blooms!' },
    fox:       { name: 'Fox',       need: '3 small animals',  small: false,
                 check: function (s) { return s.small >= 3; },
                 tapText: 'pounces playfully!' },
    owl:       { name: 'Owl',       need: '2 adult trees',    small: false,
                 check: function (s) { return s.adultTrees >= 2; },
                 tapText: 'hoots a greeting!' },
    deer:      { name: 'Deer',      need: '4 adult trees',    small: false,
                 check: function (s) { return s.adultTrees >= 4; },
                 tapText: 'grazes softly.' },
    hedgehog:  { name: 'Hedgehog',  need: 'A fallen trunk',   small: true,
                 check: function (s) { return s.fallen >= 1; },
                 tapText: 'snuffles about!' },
    frog:      { name: 'Frog',      need: '8 plants',         small: false,
                 check: function (s) { return s.plants >= 8; },
                 tapText: 'croaks for rain!' }
  };
  var ANIMAL_IDS = Object.keys(ANIMALS);
  var TAP_COOLDOWN = 25;
  var MAX_ANIMALS = 14;

  /* ---------- rng ---------- */
  function rnd(st) {
    st._rs = (st._rs + 0x6D2B79F5) >>> 0;
    var t = st._rs;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rint(st, n) { return Math.floor(rnd(st) * n); }
  function pick(st, arr) { return arr[rint(st, arr.length)]; }

  /* ---------- state ---------- */
  function newGame(seed) {
    var tiles = [];
    for (var i = 0; i < GRID * GRID; i++) tiles.push({ plant: null, mush: false, net: 0 });
    return {
      v: 1, seed: seed >>> 0 || 1, _rs: (seed >>> 0 || 1),
      tiles: tiles, points: 30, day: 1, dayT: 0,
      animals: [], visiting: [],   /* visiting: [{species, t}] */
      nextAid: 1, events: [],
      ach: {}, storm: 0,
      stats: { grown: 0, tapped: 0, speciesSeen: [], plantsSeen: [], plantedAny: false, arrivals: 0, peak: 30 }
    };
  }
  function tile(st, x, y) { return st.tiles[y * GRID + x]; }
  function inGrid(x, y) { return x >= 0 && y >= 0 && x < GRID && y < GRID; }

  function stats(st) {
    var s = { adultTrees: 0, bushes: 0, flowering: 0, fallen: 0, plants: 0, small: 0, trees: 0 };
    for (var i = 0; i < st.tiles.length; i++) {
      var p = st.tiles[i].plant;
      if (!p) continue;
      s.plants++;
      if (p.stage >= ST.SAPLING) s.trees++;
      if (p.stage >= ST.ADULT && p.stage <= ST.ANCIENT) s.adultTrees++;
      if (p.type === 'berry' && p.stage >= ST.SAPLING) s.bushes++;
      if (p.type === 'berry' && (p.stage === ST.ADULT || p.stage === ST.ANCIENT)) s.flowering++;
      if (p.stage === ST.FALLEN) s.fallen++;
    }
    for (var a = 0; a < st.animals.length; a++)
      if (ANIMALS[st.animals[a].species].small) s.small++;
    return s;
  }

  function ev(st, e) { st.events.push(e); }
  function addPoints(st, n, why, x, y) {
    st.points += n;
    ev(st, { t: 'points', n: n, why: why, x: x, y: y });
  }

  /* ---------- planting ---------- */
  function plant(st, x, y, type) {
    if (!inGrid(x, y)) return { ok: false, reason: 'edge' };
    var tl = tile(st, x, y);
    if (tl.plant) return { ok: false, reason: 'taken' };
    var def = PLANTS[type];
    if (!def) return { ok: false, reason: 'seed' };
    if (st.points < def.cost) return { ok: false, reason: 'poor' };
    st.points -= def.cost;
    tl.plant = { type: type, stage: ST.SEED, t: 0, boostUntil: 0 };
    if (st.stats.plantsSeen.indexOf(type) < 0) st.stats.plantsSeen.push(type);
    if (!st.stats.plantedAny) { st.stats.plantedAny = true; tl.plant.fast = true; } /* tutorial pine grows 3x */
    ev(st, { t: 'planted', x: x, y: y, type: type });
    return { ok: true };
  }
  function plantMushroom(st, x, y) {
    if (!inGrid(x, y)) return { ok: false, reason: 'edge' };
    var tl = tile(st, x, y);
    if (tl.plant || tl.mush) return { ok: false, reason: 'taken' };
    if (st.points < MUSH_COST) return { ok: false, reason: 'poor' };
    /* mushrooms want tree neighbors */
    var near = false;
    var dx = [1, -1, 0, 0], dy = [0, 0, 1, -1];
    for (var d = 0; d < 4; d++) {
      var nx = x + dx[d], ny = y + dy[d];
      if (inGrid(nx, ny)) { var p = tile(st, nx, ny).plant; if (p && p.stage >= ST.SAPLING) near = true; }
    }
    if (!near) return { ok: false, reason: 'lonely' };
    st.points -= MUSH_COST;
    tl.mush = true;
    ev(st, { t: 'mushroom', x: x, y: y });
    return { ok: true };
  }
  function clearTile(st, x, y) {
    if (!inGrid(x, y)) return { ok: false };
    var tl = tile(st, x, y);
    if (tl.plant && tl.plant.stage === ST.FALLEN) {
      tl.plant = null;
      addPoints(st, 2, 'cleared trunk', x, y);
      ev(st, { t: 'cleared', x: x, y: y });
      return { ok: true };
    }
    return { ok: false, reason: 'living' };
  }

  /* ---------- mushroom network ----------
   * Components over tiles that are tree-like (stage>=SAPLING, not fallen)
   * or mushrooms, via 4-adjacency. A component with >=3 tree tiles is a
   * living web: its trees grow 30% faster and it earns 1 pt / 12s per 3 trees. */
  function computeNetworks(st, now) {
    var comp = new Array(st.tiles.length).fill(-1);
    var comps = [];
    function node(i) {
      var tl = st.tiles[i];
      if (tl.mush) return true;
      return tl.plant && tl.plant.stage >= ST.SAPLING && tl.plant.stage <= ST.ANCIENT;
    }
    for (var i = 0; i < st.tiles.length; i++) {
      if (!node(i) || comp[i] >= 0) continue;
      var id = comps.length, trees = 0, stack = [i];
      comp[i] = id;
      while (stack.length) {
        var c = stack.pop(), cx = c % GRID, cy = (c / GRID) | 0;
        var tl = st.tiles[c];
        if (tl.plant && tl.plant.stage >= ST.SAPLING && tl.plant.stage <= ST.ANCIENT) trees++;
        var dx = [1, -1, 0, 0], dy = [0, 0, 1, -1];
        for (var d = 0; d < 4; d++) {
          var nx = cx + dx[d], ny = cy + dy[d];
          if (!inGrid(nx, ny)) continue;
          var ni = ny * GRID + nx;
          if (node(ni) && comp[ni] < 0) { comp[ni] = id; stack.push(ni); }
        }
      }
      comps.push({ trees: trees, live: trees >= 3, income: 0 });
    }
    for (var k = 0; k < st.tiles.length; k++) st.tiles[k].net = comp[k] >= 0 && comps[comp[k]].live ? comp[k] + 1 : 0;
    return comps;
  }

  function growthMul(st, tl, now) {
    var m = 1;
    if (tl.net > 0) m *= 1.3;
    if (tl.plant && tl.plant.boostUntil > now) m *= 1.6;
    if (tl.plant && tl.plant.fast && tl.plant.stage <= ST.SAPLING) m *= 3;
    return m;
  }
  function stageTime(type, stage) {
    if (stage === ST.SEED) return PLANTS[type].times[0];
    if (stage === ST.SPROUT) return PLANTS[type].times[1];
    if (stage === ST.SAPLING) return PLANTS[type].times[2];
    if (stage === ST.ADULT) return ANCIENT_T;
    if (stage === ST.ANCIENT) return FALLEN_T;
    return 0;
  }

  /* ---------- animals ---------- */
  function emptyTileNear(st, x, y) {
    var opts = [];
    for (var i = 0; i < st.tiles.length; i++) {
      var tx = i % GRID, ty = (i / GRID) | 0;
      if (!st.tiles[i].plant && !st.tiles[i].mush) opts.push({ x: tx, y: ty });
    }
    return opts.length ? pick(st, opts) : null;
  }
  function addAnimal(st, species, now) {
    var spot = emptyTileNear(st, 0, 0) || { x: 3, y: 3 };
    var a = { id: st.nextAid++, species: species, x: spot.x, y: spot.y, cd: 0, wt: 2 + rnd(st) * 5, ph: rnd(st) * 6.28 };
    st.animals.push(a);
    if (st.stats.speciesSeen.indexOf(species) < 0) {
      st.stats.speciesSeen.push(species);
      addPoints(st, 15, 'new friend: ' + ANIMALS[species].name, a.x, a.y);
      if (st.stats.speciesSeen.length >= ANIMAL_IDS.length) unlock(st, 'full-house');
    }
    st.stats.arrivals++;
    if (st.stats.arrivals === 1) unlock(st, 'first-friend');
    ev(st, { t: 'arrived', species: species, x: a.x, y: a.y });
    return a;
  }
  function checkArrivals(st, now) {
    if (st.animals.length + st.visiting.length >= MAX_ANIMALS) return;
    var s = stats(st);
    var present = {};
    st.animals.forEach(function (a) { present[a.species] = 1; });
    st.visiting.forEach(function (v) { present[v.species] = 1; });
    for (var i = 0; i < ANIMAL_IDS.length; i++) {
      var id = ANIMAL_IDS[i];
      if (present[id]) continue;
      if (ANIMALS[id].check(s)) {
        st.visiting.push({ species: id, t: 8 + rnd(st) * 8 });
        ev(st, { t: 'sniffing', species: id });
        break; /* one at a time — arrivals feel special */
      }
    }
  }
  /* animals leave when their habitat is gone — the forest feels alive */
  function checkDepartures(st) {
    var s = stats(st);
    for (var i = st.animals.length - 1; i >= 0; i--) {
      var a = st.animals[i];
      if (!ANIMALS[a.species].check(s)) {
        st.animals.splice(i, 1);
        ev(st, { t: 'left', species: a.species, x: a.x, y: a.y });
      }
    }
  }
  /* summonable storm: 20s of hard rain; old giants may topple */
  function summonStorm(st) {
    if (st.storm > 0) return { ok: false, reason: 'storm' };
    if (st.points < STORM_COST) return { ok: false, reason: 'poor' };
    st.points -= STORM_COST;
    st.storm = STORM_LEN;
    ev(st, { t: 'storm-start' });
    unlock(st, 'rainmaker');
    return { ok: true };
  }
  function tapAnimal(st, id, now) {
    var a = null;
    for (var i = 0; i < st.animals.length; i++) if (st.animals[i].id === id) a = st.animals[i];
    if (!a) return { ok: false };
    if (a.cd > now) return { ok: false, reason: 'resting' };
    a.cd = now + TAP_COOLDOWN;
    st.stats.tapped++;
    if (st.stats.tapped >= 25) unlock(st, 'social');
    if (st.stats.tapped >= 100) unlock(st, 'doolittle');
    var sp = a.species, msg = ANIMALS[sp].name + ' ' + ANIMALS[sp].tapText, fx = null;
    if (sp === 'squirrel') {
      var spot = emptyTileNear(st, a.x, a.y);
      if (spot) {
        tile(st, spot.x, spot.y).plant = { type: 'pine', stage: ST.SPROUT, t: 0, boostUntil: 0 };
        ev(st, { t: 'planted', x: spot.x, y: spot.y, type: 'pine', free: true });
        unlock(st, 'free-tree');
        msg += ' A pine sprout pops up!';
      } else addPoints(st, 4, 'acorn', a.x, a.y);
    } else if (sp === 'rabbit') {
      var pts = 6; if (rnd(st) < 0.25) { pts += 10; msg += ' Found a cache!'; }
      addPoints(st, pts, 'rabbit', a.x, a.y); fx = 'hearts';
    } else if (sp === 'butterfly') {
      for (var k = 0; k < st.tiles.length; k++) {
        var tx = k % GRID, ty = (k / GRID) | 0;
        if (Math.abs(tx - a.x) <= 1 && Math.abs(ty - a.y) <= 1 && st.tiles[k].plant)
          st.tiles[k].plant.boostUntil = Math.max(st.tiles[k].plant.boostUntil, now + 60);
      }
      addPoints(st, 5, 'pollinated', a.x, a.y); fx = 'petals';
    } else if (sp === 'fox') {
      addPoints(st, 12, 'fox', a.x, a.y); fx = 'hearts';
    } else if (sp === 'owl') {
      addPoints(st, 8, 'owl', a.x, a.y);
    } else if (sp === 'deer') {
      addPoints(st, 10, 'deer', a.x, a.y);
      var saps = [];
      for (var j = 0; j < st.tiles.length; j++)
        if (st.tiles[j].plant && st.tiles[j].plant.stage === ST.SAPLING) saps.push(j);
      if (saps.length) {
        var c = pick(st, saps), pl = st.tiles[c].plant;
        pl.stage = ST.SPROUT; pl.t = 0;
        ev(st, { t: 'nibbled', x: c % GRID, y: (c / GRID) | 0 });
        msg += ' It nibbles a sapling.';
      }
    } else if (sp === 'hedgehog') {
      addPoints(st, 8, 'hedgehog', a.x, a.y); fx = 'sparkle';
    } else if (sp === 'frog') {
      for (var m = 0; m < st.tiles.length; m++)
        if (st.tiles[m].plant) st.tiles[m].plant.boostUntil = Math.max(st.tiles[m].plant.boostUntil, now + 30);
      addPoints(st, 5, 'rain', a.x, a.y); fx = 'rain';
    }
    ev(st, { t: 'tapped', species: sp, x: a.x, y: a.y, fx: fx });
    return { ok: true, msg: msg, fx: fx, x: a.x, y: a.y };
  }

  /* ---------- main step ---------- */
  var _now = 0;
  function step(st, dt) {
    _now += dt;
    var now = _now;
    st.dayT += dt;
    if (st.dayT >= 180) { st.dayT -= 180; st.day++; ev(st, { t: 'day', day: st.day }); }
    var comps = computeNetworks(st, now);
    /* web achievements */
    var biggest = 0;
    for (var cb = 0; cb < comps.length; cb++) if (comps[cb].live) biggest = Math.max(biggest, comps[cb].trees);
    if (biggest >= 3) unlock(st, 'web3');
    if (biggest >= 10) unlock(st, 'web10');
    /* peak wealth */
    if (st.points > st.stats.peak) {
      st.stats.peak = st.points;
      if (st.stats.peak >= 1000) unlock(st, 'rich');
    }
    /* storm */
    if (st.storm > 0) {
      st.storm -= dt;
      for (var sb = 0; sb < st.tiles.length; sb++) {
        var sp = st.tiles[sb].plant;
        if (sp) sp.boostUntil = Math.max(sp.boostUntil, now + 2);
      }
      if (st.storm <= 0) {
        for (var tp = 0; tp < st.tiles.length; tp++) {
          var ap = st.tiles[tp].plant;
          if (ap && ap.stage === ST.ANCIENT && rnd(st) < 0.3) {
            ap.stage = ST.FALLEN; ap.t = 0;
            ev(st, { t: 'grew', x: tp % GRID, y: (tp / GRID) | 0, stage: ST.FALLEN, type: ap.type, toppled: true });
          }
        }
        ev(st, { t: 'storm-end' });
      }
    }
    /* fallen trunks sprout free mushrooms — death feeds the web */
    st._spore = (st._spore || 0) + dt;
    if (st._spore > 45) {
      st._spore = 0;
      var sdx = [1, -1, 0, 0], sdy = [0, 0, 1, -1];
      for (var fi = 0; fi < st.tiles.length; fi++) {
        var fp = st.tiles[fi].plant;
        if (!fp || fp.stage !== ST.FALLEN || rnd(st) >= 0.5) continue;
        var fx = fi % GRID, fy = (fi / GRID) | 0, spots = [];
        for (var sd = 0; sd < 4; sd++) {
          var sx = fx + sdx[sd], sy = fy + sdy[sd];
          if (inGrid(sx, sy)) { var stl = tile(st, sx, sy); if (!stl.plant && !stl.mush) spots.push({ x: sx, y: sy }); }
        }
        if (spots.length) {
          var ch = pick(st, spots);
          tile(st, ch.x, ch.y).mush = true;
          ev(st, { t: 'mushroom', x: ch.x, y: ch.y, free: true });
        }
      }
    }
    /* network income */
    st._inc = (st._inc || 0);
    for (var c = 0; c < comps.length; c++) {
      if (!comps[c].live) continue;
      st._inc += dt * (comps[c].trees / 3) / 12;
      if (st._inc >= 1) { var n = Math.floor(st._inc); st._inc -= n; addPoints(st, n, 'web', -1, -1); }
    }
    /* plants */
    for (var i = 0; i < st.tiles.length; i++) {
      var tl = st.tiles[i], p = tl.plant;
      if (!p || p.stage === ST.FALLEN) continue;
      p.t += dt * growthMul(st, tl, now);
      var need = stageTime(p.type, p.stage);
      if (p.t >= need) {
        p.stage++; p.t = 0;
        var tx = i % GRID, ty = (i / GRID) | 0;
        ev(st, { t: 'grew', x: tx, y: ty, stage: p.stage, type: p.type });
        if (p.stage === ST.SPROUT) unlock(st, 'first-sprout');
        if (p.stage === ST.ADULT) addPoints(st, 5, 'grown', tx, ty);
        if (p.stage === ST.ANCIENT) { addPoints(st, 10, 'ancient', tx, ty); unlock(st, 'old-growth'); }
        if (p.stage === ST.FALLEN) unlock(st, 'circle');
        st.stats.grown++;
      }
    }
    /* visiting -> resident */
    for (var v = st.visiting.length - 1; v >= 0; v--) {
      st.visiting[v].t -= dt;
      if (st.visiting[v].t <= 0) { addAnimal(st, st.visiting[v].species, now); st.visiting.splice(v, 1); }
    }
    /* wander */
    for (var a = 0; a < st.animals.length; a++) {
      var an = st.animals[a];
      an.wt -= dt;
      if (an.wt <= 0) {
        an.wt = 4 + rnd(st) * 6;
        var nx = an.x + rint(st, 3) - 1, ny = an.y + rint(st, 3) - 1;
        if (inGrid(nx, ny)) { an.x = nx; an.y = ny; }
      }
    }
    checkArrivals(st, now);
    checkDepartures(st);
    return st.events.splice(0);
  }

  function drainEvents(st) { return st.events.splice(0); }
  function now() { return _now; }

  /* ---------- save ---------- */
  function serialize(st) {
    return JSON.stringify({
      v: 1, seed: st.seed, _rs: st._rs, tiles: st.tiles, points: st.points,
      day: st.day, dayT: st.dayT, animals: st.animals, visiting: st.visiting,
      nextAid: st.nextAid, stats: st.stats, ach: st.ach || {}, storm: st.storm || 0,
      savedAt: Date.now()
    });
  }
  function deserialize(json) {
    try {
      var d = JSON.parse(json);
      if (!d || d.v !== 1 || !Array.isArray(d.tiles)) return null;
      d.events = [];
      if (!d.ach) d.ach = {};
      if (!d.stats.plantsSeen) d.stats.plantsSeen = [];
      if (typeof d.storm !== 'number') d.storm = 0;
      return d;
    } catch (e) { return null; }
  }

  /* ---------- self-test ---------- */
  function selfTest() {
    var fails = 0;
    function ok(c, name) { if (!c) { fails++; console.log('FAIL:', name); } }
    var st = newGame(42);
    ok(st.points === 30, 'start points');
    ok(st.tiles.length === 64, 'grid 8x8');
    var r = plant(st, 0, 0, 'pine');
    ok(r.ok && st.points === 25, 'plant pine costs 5');
    ok(!plant(st, 0, 0, 'pine').ok, 'no double plant');
    ok(plant(st, 1, 1, 'oak').ok, 'oak affordable at 25 pts');
    ok(plant(st, 2, 2, 'oak').reason === 'poor', 'cannot afford second oak at 5 pts');
    st.points = 500;
    plant(st, 1, 0, 'oak'); plant(st, 2, 0, 'berry'); plant(st, 3, 0, 'berry');
    /* force adults */
    [[1,0],[2,0],[3,0]].forEach(function (c) { tile(st, c[0], c[1]).plant.stage = ST.ADULT; });
    var evs = step(st, 0.1);
    ok(st.visiting.length >= 1 || st.animals.length >= 1, 'arrival triggered: ' + JSON.stringify(evs.map(function(e){return e.t;})));
    /* grow a pine to adult via steps */
    var st2 = newGame(7); st2.points = 500;
    plant(st2, 4, 4, 'pine');
    var p = tile(st2, 4, 4).plant, guard = 0;
    while (p.stage < ST.ADULT && guard++ < 5000) { step(st2, 5); p = tile(st2, 4, 4).plant; }
    ok(p.stage === ST.ADULT, 'pine reaches adult, guard=' + guard);
    /* mushroom network */
    var st3 = newGame(9); st3.points = 500;
    plant(st3, 0, 0, 'pine'); plant(st3, 2, 0, 'pine'); plant(st3, 4, 0, 'pine');
    [[0,0],[2,0],[4,0]].forEach(function (c) { tile(st3, c[0], c[1]).plant.stage = ST.SAPLING; });
    ok(plantMushroom(st3, 1, 0).ok, 'mushroom between trees');
    ok(plantMushroom(st3, 3, 0).ok, 'mushroom between trees 2');
    ok(plantMushroom(st3, 7, 7).reason === 'lonely', 'mushroom needs tree neighbor');
    var comps = computeNetworks(st3, 0);
    ok(comps.some(function (c) { return c.live && c.trees === 3; }), '3-tree web is live');
    ok(tile(st3, 0, 0).net > 0, 'tile marked in network');
    /* tap cooldown */
    var st4 = newGame(11); st4.points = 500;
    var an = addAnimal(st4, 'fox', 0);
    ok(tapAnimal(st4, an.id, 100).ok, 'tap fox');
    ok(!tapAnimal(st4, an.id, 110).ok, 'tap cooldown');
    ok(tapAnimal(st4, an.id, 130).ok, 'tap after cooldown');
    /* deer nibble */
    var st5 = newGame(12); st5.points = 500;
    plant(st5, 0, 0, 'pine'); tile(st5, 0, 0).plant.stage = ST.SAPLING;
    var dr = addAnimal(st5, 'deer', 0);
    tapAnimal(st5, dr.id, 200);
    ok(tile(st5, 0, 0).plant.stage === ST.SPROUT, 'deer nibbles sapling');
    /* serialize round-trip */
    var s = serialize(st5), back = deserialize(s);
    ok(back && back.points === st5.points && back.tiles.length === 64, 'save round-trip');
    /* fallen trunk + hedgehog */
    var st6 = newGame(13); st6.points = 500;
    plant(st6, 5, 5, 'oak'); tile(st6, 5, 5).plant.stage = ST.FALLEN;
    step(st6, 0.1);
    ok(st6.visiting.some(function (v) { return v.species === 'hedgehog'; }) || st6.animals.some(function (a) { return a.species === 'hedgehog'; }), 'hedgehog likes fallen trunk');
    ok(clearTile(st6, 5, 5).ok && !tile(st6, 5, 5).plant, 'clear fallen trunk');
    /* eviction: squirrel leaves when its tree is gone */
    var st7 = newGame(14); st7.points = 500;
    plant(st7, 0, 0, 'pine'); tile(st7, 0, 0).plant.stage = ST.ADULT;
    addAnimal(st7, 'squirrel', 0);
    tile(st7, 0, 0).plant.stage = ST.SEED; /* tree effectively gone */
    var evs7 = step(st7, 0.1);
    ok(st7.animals.length === 0 && evs7.some(function (e) { return e.t === 'left'; }), 'squirrel moves on without trees');
    /* storm */
    var st8 = newGame(15); st8.points = 500;
    plant(st8, 0, 0, 'pine'); tile(st8, 0, 0).plant.stage = ST.ANCIENT;
    var sr = summonStorm(st8);
    ok(sr.ok && st8.storm > 0 && st8.ach['rainmaker'], 'storm summoned, achievement unlocked');
    ok(summonStorm(st8).reason === 'storm', 'no double storm');
    st8.points = 10;
    var st8b = newGame(16);
    ok(summonStorm(st8b).reason === 'poor', 'storm needs leaves');
    step(st8, 25);
    ok(st8.storm <= 0, 'storm passes');
    /* fast first tree */
    var st9 = newGame(17); st9.points = 500;
    plant(st9, 0, 0, 'pine');
    ok(tile(st9, 0, 0).plant.fast === true, 'first plant is fast');
    plant(st9, 1, 1, 'pine');
    ok(!tile(st9, 1, 1).plant.fast, 'second plant is normal speed');
    /* achievements fire through play */
    var st10 = newGame(18); st10.points = 500;
    plant(st10, 2, 2, 'pine');
    step(st10, 30); /* fast tree: 20s/3 -> sprout */
    ok(st10.ach['first-sprout'], 'first-sprout achievement');
    console.log(fails === 0 ? 'SIM SELF-TEST: ALL PASS' : 'SIM SELF-TEST: ' + fails + ' FAILURES');
    return fails;
  }

  return {
    GRID: GRID, ST: ST, PLANTS: PLANTS, ANIMALS: ANIMALS, ANIMAL_IDS: ANIMAL_IDS,
    MUSH_COST: MUSH_COST, TAP_COOLDOWN: TAP_COOLDOWN, STORM_COST: STORM_COST,
    ACH: ACH,
    newGame: newGame, step: step, plant: plant, plantMushroom: plantMushroom,
    clearTile: clearTile, tapAnimal: tapAnimal, stats: stats, summonStorm: summonStorm,
    computeNetworks: computeNetworks, drainEvents: drainEvents, now: now,
    serialize: serialize, deserialize: deserialize, selfTest: selfTest
  };
})();
if (typeof module !== 'undefined' && require.main === module) {
  process.exit(FW.selfTest() ? 1 : 0);
}
