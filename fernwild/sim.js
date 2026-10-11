/* ============================================================================
 * Fernwild sim — pure ecosystem logic. No DOM, no canvas, no rAF.
 * Seeded PRNG (mulberry32). Testable headless: `node sim.js` runs self-tests.
 * Time is in seconds; the caller clamps dt and steps in chunks.
 * ========================================================================== */
'use strict';
var FW = (function () {
  var GW = 20, GH = 1; /* side view: one row of 20 soil spots */

  /* growth stages */
  var ST = { EMPTY: 0, SEED: 1, SPROUT: 2, SAPLING: 3, ADULT: 4, ANCIENT: 5, FALLEN: 6 };

  var PLANTS = {
    pine:  { name: 'Pine',       cost: 5,  times: [20, 45, 80],  desc: 'Quick and hardy',        color: '#2f5d33', ever: true },
    berry: { name: 'Berry bush',  cost: 12, times: [25, 55, 95],  desc: 'Flowers feed butterflies', color: '#3f7038' },
    aspen: { name: 'Aspen',       cost: 14, times: [22, 50, 90],  desc: 'Clones itself through roots', color: '#4a7a4a' },
    oak:   { name: 'Oak',        cost: 20, times: [35, 80, 150],  desc: 'Slow and mighty',        color: '#2a5230' }
  };
  var ANCIENT_T = 260;   /* adult -> ancient */
  var FALLEN_T = 140;    /* ancient -> fallen trunk */
  var MUSH_COST = 8;
  var STORM_COST = 40, STORM_LEN = 20;

  /* seasons: 0 spring, 1 summer, 2 autumn, 3 winter; 4 in-game days each */
  var SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  var SEASON_DAYS = 4;
  var DAY_NIGHT_LEN = 240; /* seconds per full day/night cycle */
  function seasonOf(st) { return SEASONS[st.season % 4]; }
  function isNight(st) { return st.tod < 0.25 || st.tod >= 0.75; }
  function dayLight(st) {
    if (st.tod < 0.25 || st.tod >= 0.75) return 0;
    var d = (st.tod - 0.25) / 0.5;
    return Math.sin(d * Math.PI);
  }
  /* weather: the sky has moods; each lasts a while, the next is forecast */
  var WEATHERS = ['clear', 'cloudy', 'rain', 'storm', 'drought', 'fog', 'wind'];
  var WX_DURATION = [50, 110]; /* seconds per weather */
  function rollWeather(st) {
    var se = st.season % 4, r = rnd(st), w = 'clear';
    if (se === 0) {          /* spring: rain and sun */
      w = r < 0.3 ? 'rain' : r < 0.5 ? 'cloudy' : r < 0.62 ? 'wind' : r < 0.68 ? 'fog' : 'clear';
    } else if (se === 1) {   /* summer: heat, dry spells */
      w = r < 0.22 ? 'drought' : r < 0.34 ? 'cloudy' : r < 0.46 ? 'wind' : r < 0.52 ? 'rain' : 'clear';
    } else if (se === 2) {   /* autumn: grey and gusty */
      w = r < 0.3 ? 'cloudy' : r < 0.48 ? 'rain' : r < 0.62 ? 'wind' : r < 0.72 ? 'fog' : 'clear';
    } else {                 /* winter: pale and still */
      w = r < 0.36 ? 'cloudy' : r < 0.5 ? 'fog' : r < 0.58 ? 'wind' : r < 0.66 ? 'rain' : 'clear';
    }
    if (r > 0.95 && w !== 'drought') w = 'storm'; /* rare storm */
    return w;
  }
  function weatherOf(st) { return st.weather.kind; }

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
    'full-house':   { name: 'Full House',        desc: 'Every species moves in' },
    'pando':        { name: 'Pando',             desc: 'Grow a grove of 8 aspens' },
    'collector':    { name: 'Rare Collector',    desc: 'Find all 3 rare tree variants' }
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
                 tapText: 'croaks for rain!' },
    vole:      { name: 'Vole',      need: '3 adult trees',     small: true, underground: true,
                 check: function (s) { return s.adultTrees >= 3; },
                 tapText: 'squeaks and dives!' },
    heron:     { name: 'Heron',     need: '10 plants',           small: false,
                 check: function (s) { return s.plants >= 10; },
                 tapText: 'blinks slowly.' }
  };
  var ANIMAL_IDS = Object.keys(ANIMALS);
  var TAP_COOLDOWN = 25;
  var MAX_ANIMALS = 16;

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
    for (var i = 0; i < GW * GH; i++) tiles.push({ x: i, plant: null, mush: false, net: 0, fire: 0, gnawedUntil: 0 });
    return {
      v: 1, seed: seed >>> 0 || 1, _rs: (seed >>> 0 || 1),
      tiles: tiles, points: 30, day: 1, dayT: 0,
      season: 0, seasonDay: 0, tod: 0.32,   /* spring morning */
      weather: { kind: 'clear', until: 90, next: 'cloudy' },
      pond: { fish: [{ a: 0, sp: 0.5 }, { a: 2.1, sp: 0.42 }, { a: 4.2, sp: 0.55 }], respawn: 0 },
      animals: [], visiting: [],   /* visiting: [{species, t}] */
      dung: [],                    /* [{x, until}] fertilizer mounds */
      nextAid: 1, events: [],
      ach: {}, storm: 0, questClaimed: {},
      streak: { last: '', n: 0 },
      stats: { grown: 0, tapped: 0, speciesSeen: [], plantsSeen: [], plantedAny: false, arrivals: 0, peak: 30,
               tallest: 0, widestWeb: 0, ancients: 0, firesSmothered: 0, variantsSeen: [] }
    };
  }
  function tile(st, x, y) { return st.tiles[y * GW + x]; }
  function inGrid(x, y) { return x >= 0 && y >= 0 && x < GW && y < GH; }

  function stats(st) {
    var s = { adultTrees: 0, bushes: 0, flowering: 0, fallen: 0, plants: 0, small: 0, trees: 0, oaks: 0, aspens: 0 };
    for (var i = 0; i < st.tiles.length; i++) {
      var p = st.tiles[i].plant;
      if (!p) continue;
      s.plants++;
      if (p.stage >= ST.SAPLING) s.trees++;
      if (p.stage >= ST.ADULT && p.stage <= ST.ANCIENT) s.adultTrees++;
      if (p.type === 'berry' && p.stage >= ST.SAPLING) s.bushes++;
      if (p.type === 'berry' && (p.stage === ST.ADULT || p.stage === ST.ANCIENT)) s.flowering++;
      if (p.stage === ST.FALLEN) s.fallen++;
      if (p.type === 'oak' && p.stage >= ST.ADULT && p.stage <= ST.ANCIENT) s.oaks++;
      if (p.type === 'aspen' && p.stage >= ST.SAPLING) s.aspens++;
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
    /* rare variants: a little magic in the seed packet */
    if (rnd(st) < 0.06) {
      tl.plant.variant = type === 'aspen' ? (rnd(st) < 0.5 ? 'rainbow' : 'golden')
        : type === 'berry' ? 'bloom' : 'golden';
      if (st.stats.variantsSeen.indexOf(tl.plant.variant) < 0) {
        st.stats.variantsSeen.push(tl.plant.variant);
        addPoints(st, 10, 'rare variant!', x, y);
        ev(st, { t: 'variant', x: x, y: y, variant: tl.plant.variant, type: type });
      }
      if (st.stats.variantsSeen.length >= 3) unlock(st, 'collector');
    }
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
        var c = stack.pop(), cx = c % GW, cy = (c / GW) | 0;
        var tl = st.tiles[c];
        if (tl.plant && tl.plant.stage >= ST.SAPLING && tl.plant.stage <= ST.ANCIENT) trees++;
        var dx = [1, -1, 0, 0], dy = [0, 0, 1, -1];
        for (var d = 0; d < 4; d++) {
          var nx = cx + dx[d], ny = cy + dy[d];
          if (!inGrid(nx, ny)) continue;
          var ni = ny * GW + nx;
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
    if (tl.gnawedUntil > now) m *= 0.45;                       /* vole damage */
    /* seasons */
    var se = st.season % 4, ever = tl.plant && PLANTS[tl.plant.type].ever;
    if (se === 0) m *= 1.2;                                    /* spring surge */
    else if (se === 2) m *= 0.8;                               /* autumn slows */
    else if (se === 3) m *= ever ? 0.7 : 0.25;                 /* winter dormancy */
    /* weather */
    var wx = st.weather.kind;
    if (wx === 'rain') m *= 1.3;
    else if (wx === 'drought') m *= 0.6;
    if (st.dung.length) {                                       /* poop fertilizer */
      for (var d = 0; d < st.dung.length; d++) {
        var dg = st.dung[d];
        if (dg.until > now && Math.abs(dg.x - tl.x) <= 1) { m *= 1.5; break; }
      }
    }
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
      var tx = i % GW, ty = (i / GW) | 0;
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
    if (st.season % 4 === 3) return; /* winter: the forest sleeps, no new arrivals */
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
  /* wild-event gifts: the AI writes the story, the sim applies the outcome */
  function wildGift(st, kind, now) {
    if (kind === 'seed') {
      var empty = [];
      for (var i = 0; i < st.tiles.length; i++) if (!st.tiles[i].plant && !st.tiles[i].mush) empty.push(i);
      if (!empty.length) return { ok: false };
      var ti = pick(st, empty), types = ['pine', 'aspen', 'berry', 'oak'];
      var ty = pick(st, types);
      st.tiles[ti].plant = { type: ty, stage: ST.SEED, t: 0, boostUntil: 0, gift: true };
      ev(st, { t: 'planted', x: ti % GW, y: (ti / GW) | 0, type: ty, free: true });
      return { ok: true, x: ti % GW, y: 0, what: 'seed' };
    }
    if (kind === 'mush') {
      var spots = [];
      for (var m = 0; m < st.tiles.length; m++) {
        if (st.tiles[m].plant || st.tiles[m].mush) continue;
        var mx = m % GW, ok2 = false;
        if (mx > 0 && st.tiles[m - 1].plant) ok2 = true;
        if (mx < GW - 1 && st.tiles[m + 1].plant) ok2 = true;
        if (ok2) spots.push(m);
      }
      if (!spots.length) return { ok: false };
      var mi = pick(st, spots);
      st.tiles[mi].mush = true;
      ev(st, { t: 'mushroom', x: mi % GW, y: (mi / GW) | 0, free: true });
      return { ok: true, x: mi % GW, y: 0, what: 'mushroom' };
    }
    if (kind === 'boost') {
      var n = 0;
      for (var b = 0; b < st.tiles.length; b++) {
        var bp = st.tiles[b].plant;
        if (bp && bp.stage < ST.FALLEN) { bp.boostUntil = Math.max(bp.boostUntil, now + 90); n++; }
      }
      return { ok: n > 0, what: 'boost' };
    }
    if (kind === 'rare') {
      /* a gift sapling with a guaranteed rare variant */
      var empty2 = [];
      for (var q = 0; q < st.tiles.length; q++) if (!st.tiles[q].plant && !st.tiles[q].mush) empty2.push(q);
      if (!empty2.length) return { ok: false };
      var ri = pick(st, empty2);
      var rtypes = ['pine', 'aspen', 'berry', 'oak'];
      var rt = pick(st, rtypes);
      st.tiles[ri].plant = { type: rt, stage: ST.SAPLING, t: 0, boostUntil: 0, gift: true,
        variant: rt === 'aspen' ? 'rainbow' : rt === 'berry' ? 'bloom' : 'golden' };
      if (st.stats.variantsSeen.indexOf(st.tiles[ri].plant.variant) < 0)
        st.stats.variantsSeen.push(st.tiles[ri].plant.variant);
      if (st.stats.variantsSeen.length >= 3) unlock(st, 'collector');
      ev(st, { t: 'planted', x: ri % GW, y: (ri / GW) | 0, type: rt, free: true });
      return { ok: true, x: ri % GW, y: 0, what: 'rare' };
    }
    return { ok: false };
  }
  /* ---------- gentle quests: no timers, no fail states ---------- */
  var QUESTS = [
    { id: 'sprout3', name: 'First Sprouts',  desc: 'Grow 3 sprouts',            reward: 10,
      prog: function (st, s) { return Math.min(3, st.stats.grown); }, need: 3 },
    { id: 'oak2',    name: 'Mighty Oaks',    desc: 'Grow 2 adult oaks',         reward: 20,
      prog: function (st, s) { return Math.min(2, s.oaks); }, need: 2 },
    { id: 'friends5', name: 'New Friends',   desc: 'Welcome 5 animals',         reward: 15,
      prog: function (st, s) { return Math.min(5, st.stats.arrivals); }, need: 5 },
    { id: 'web5',    name: 'Weaving the Web', desc: 'Link 5 trees in one web',  reward: 25,
      prog: function (st, s) { return Math.min(5, st.stats.widestWeb); }, need: 5 },
    { id: 'ancient1', name: 'Old Soul',      desc: 'Grow an ancient tree',      reward: 30,
      prog: function (st, s) { return Math.min(1, st.stats.ancients); }, need: 1 },
    { id: 'fire1',   name: 'Firekeeper',     desc: 'Smother a wildfire',        reward: 20,
      prog: function (st, s) { return Math.min(1, st.stats.firesSmothered); }, need: 1 },
    { id: 'taps10',  name: 'Hello, Neighbors', desc: 'Tap animals 10 times',    reward: 10,
      prog: function (st, s) { return Math.min(10, st.stats.tapped); }, need: 10 },
    { id: 'aspen4',  name: 'Pando Dreams',   desc: 'Grow 4 aspens',             reward: 20,
      prog: function (st, s) { return Math.min(4, s.aspens); }, need: 4 }
  ];
  function questState(st, q) {
    var p = q.prog(st, stats(st));
    return { id: q.id, name: q.name, desc: q.desc, reward: q.reward,
             progress: p, need: q.need, done: p >= q.need, claimed: !!st.questClaimed[q.id] };
  }
  function quests(st) { return QUESTS.map(function (q) { return questState(st, q); }); }
  function claimQuest(st, id) {
    for (var i = 0; i < QUESTS.length; i++) {
      if (QUESTS[i].id !== id) continue;
      var qs = questState(st, QUESTS[i]);
      if (!qs.done || qs.claimed) return { ok: false };
      st.questClaimed[id] = 1;
      addPoints(st, qs.reward, 'quest: ' + qs.name, -1, -1);
      ev(st, { t: 'quest', id: id });
      return { ok: true, reward: qs.reward, name: qs.name };
    }
    return { ok: false };
  }
  /* ---------- daily streak (real-world days) ---------- */
  function dayStr(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function dailyStatus(st, today) {
    today = today || dayStr(new Date());
    if (st.streak.last === today) return { available: false, day: st.streak.n };
    var tp = today.split('-');
    var td = new Date(+tp[0], (+tp[1] || 1) - 1, +tp[2] || 1);
    td.setDate(td.getDate() - 1);
    var cont = st.streak.last === dayStr(td);
    return { available: true, day: cont ? st.streak.n + 1 : 1 };
  }
  function claimDaily(st, now, today) {
    var ds = dailyStatus(st, today);
    if (!ds.available) return { ok: false };
    today = today || dayStr(new Date());
    st.streak.n = ds.day; st.streak.last = today;
    var d = ds.day, gift;
    if (d === 1) { gift = wildGift(st, 'seed', now); gift.label = 'a gift seed'; }
    else if (d === 2) { addPoints(st, 15, 'daily gift', -1, -1); gift = { ok: true, what: 'leaves', label: '15 leaves' }; }
    else if (d === 3) { gift = wildGift(st, 'rare', now); gift.label = 'a rare sapling'; }
    else if (d === 4) { addPoints(st, 25, 'daily gift', -1, -1); gift = { ok: true, what: 'leaves', label: '25 leaves' }; }
    else { addPoints(st, 40, 'daily gift', -1, -1); var m = wildGift(st, 'mush', now); gift = { ok: true, what: 'feast', label: '40 leaves' + (m.ok ? ' and a mushroom' : '') }; }
    ev(st, { t: 'daily', day: d });
    return { ok: true, day: d, gift: gift.label || 'a gift' };
  }
  function dropDung(st, x, now, loud) {
    if (st.dung.length >= 6) st.dung.shift();
    st.dung.push({ x: Math.max(0, Math.min(GW - 1, Math.round(x))), until: now + 90 });
    ev(st, { t: 'pooped', x: x, y: 0, loud: !!loud });
  }
  /* tap a burning tree to beat at the flames */
  function smother(st, x, y, now) {
    var tl = tile(st, x, y);
    if (!tl || !tl.fire) return { ok: false };
    tl.fire -= 9;
    if (tl.fire <= 0) {
      tl.fire = 0;
      st.stats.firesSmothered++;
      ev(st, { t: 'smothered', x: x, y: y });
      return { ok: true, out: true };
    }
    return { ok: true, out: false };
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
    if (sp === 'vole') {
      /* shooed! the vole flees the forest */
      for (var vi = 0; vi < st.animals.length; vi++) if (st.animals[vi].id === id) st.animals.splice(vi, 1);
      addPoints(st, 4, 'vole shooed', a.x, a.y);
      ev(st, { t: 'fled', species: sp, x: a.x, y: a.y });
      return { ok: true, msg: 'The vole flees underground!', fx: null, x: a.x, y: a.y };
    }
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
      dropDung(st, a.x, now, true);
    } else if (sp === 'butterfly') {
      for (var k = 0; k < st.tiles.length; k++) {
        var tx = k % GW, ty = (k / GW) | 0;
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
      dropDung(st, a.x, now, true);
      var saps = [];
      for (var j = 0; j < st.tiles.length; j++)
        if (st.tiles[j].plant && st.tiles[j].plant.stage === ST.SAPLING) saps.push(j);
      if (saps.length) {
        var c = pick(st, saps), pl = st.tiles[c].plant;
        pl.stage = ST.SPROUT; pl.t = 0;
        ev(st, { t: 'nibbled', x: c % GW, y: (c / GW) | 0 });
        msg += ' It nibbles a sapling.';
      }
    } else if (sp === 'hedgehog') {
      addPoints(st, 8, 'hedgehog', a.x, a.y); fx = 'sparkle';
    } else if (sp === 'frog') {
      for (var m = 0; m < st.tiles.length; m++)
        if (st.tiles[m].plant) st.tiles[m].plant.boostUntil = Math.max(st.tiles[m].plant.boostUntil, now + 30);
      addPoints(st, 5, 'rain', a.x, a.y); fx = 'rain';
    } else if (sp === 'heron') {
      addPoints(st, 12, 'heron', a.x, a.y); fx = 'sparkle';
      msg += ' It stands perfectly still.';
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
    if (st.dayT >= 180) {
      st.dayT -= 180; st.day++;
      st.seasonDay++;
      if (st.seasonDay >= SEASON_DAYS) {
        st.seasonDay = 0;
        st.season = (st.season + 1) % 4;
        ev(st, { t: 'season', season: st.season });
      }
      ev(st, { t: 'day', day: st.day });
    }
    st.tod = (st.tod + dt / DAY_NIGHT_LEN) % 1;
    /* ---- weather: moods roll in, the next is forecast ---- */
    if (now >= st.weather.until) {
      st.weather.kind = st.weather.next;
      st.weather.next = rollWeather(st);
      st.weather.until = now + WX_DURATION[0] + rnd(st) * (WX_DURATION[1] - WX_DURATION[0]);
      ev(st, { t: 'weather', kind: st.weather.kind });
      if (st.weather.kind === 'storm' && st.storm <= 0) st.storm = Math.min(20, STORM_LEN);
    }
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
            ev(st, { t: 'grew', x: tp % GW, y: (tp / GW) | 0, stage: ST.FALLEN, type: ap.type, toppled: true });
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
        var fx = fi % GW, fy = (fi / GW) | 0, spots = [];
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
      st._inc += dt * (comps[c].trees / 3) / 8;
      if (st._inc >= 1) { var n = Math.floor(st._inc); st._inc -= n; addPoints(st, n, 'web', -1, -1); }
    }
    /* plants */
    for (var i = 0; i < st.tiles.length; i++) {
      var tl = st.tiles[i], p = tl.plant;
      if (!p || p.stage === ST.FALLEN || tl.fire > 0) continue;
      p.t += dt * growthMul(st, tl, now);
      var need = stageTime(p.type, p.stage);
      if (p.t >= need) {
        p.stage++; p.t = 0;
        var tx = i % GW, ty = (i / GW) | 0;
        ev(st, { t: 'grew', x: tx, y: ty, stage: p.stage, type: p.type });
        if (p.stage === ST.SPROUT) unlock(st, 'first-sprout');
        if (p.stage === ST.ADULT) {
          addPoints(st, 8, 'grown', tx, ty);
          if (p.variant) addPoints(st, 6, 'rare ' + p.variant, tx, ty);
        }
        if (p.stage === ST.ANCIENT) {
          addPoints(st, 15, 'ancient', tx, ty); unlock(st, 'old-growth');
          st.stats.ancients++;
          if (p.variant) addPoints(st, 10, 'rare ' + p.variant, tx, ty);
        }
        if (p.stage === ST.FALLEN) unlock(st, 'circle');
        st.stats.grown++;
      }
    }
    /* visiting -> resident */
    for (var v = st.visiting.length - 1; v >= 0; v--) {
      st.visiting[v].t -= dt;
      if (st.visiting[v].t <= 0) { addAnimal(st, st.visiting[v].species, now); st.visiting.splice(v, 1); }
    }
    /* ---- aspen root suckers: Pando-style cloning ---- */
    for (var as = 0; as < st.tiles.length; as++) {
      var atl = st.tiles[as], ap = atl.plant;
      if (!ap || ap.type !== 'aspen' || ap.stage < ST.ADULT) continue;
      ap.suckT = (ap.suckT || 40 + rnd(st) * 40) - dt;
      if (ap.suckT <= 0) {
        ap.suckT = 50 + rnd(st) * 40;
        if ((ap.suckers || 0) < 4) {
          var ax = as % GW, spots2 = [];
          if (ax > 0 && !st.tiles[as - 1].plant) spots2.push(as - 1);
          if (ax < GW - 1 && !st.tiles[as + 1].plant) spots2.push(as + 1);
          if (spots2.length) {
            var si = pick(st, spots2);
            st.tiles[si].plant = { type: 'aspen', stage: ST.SPROUT, t: 0, boostUntil: 0, fast: true, sucker: true };
            ap.suckers = (ap.suckers || 0) + 1;
            ev(st, { t: 'sucker', x: si % GW, y: (si / GW) | 0 });
          }
        }
      }
    }
    /* pando achievement: a grove of 8 aspens */
    var aspens = 0;
    for (var ac = 0; ac < st.tiles.length; ac++) {
      var acp = st.tiles[ac].plant;
      if (acp && acp.type === 'aspen' && acp.stage >= ST.SAPLING) aspens++;
    }
    if (aspens >= 8) unlock(st, 'pando');
    /* ---- wildfire: ignition, spread, burnout ---- */
    var wxk = st.weather.kind;
    var wet = wxk === 'rain' || wxk === 'storm' || wxk === 'fog';
    if (st.day >= 3 && st.storm <= 0 && !wet) {
      st._fireT = (st._fireT || 60) - dt;
      if (st._fireT <= 0) {
        st._fireT = 90 + rnd(st) * 120;
        var burnables = [];
        for (var bi = 0; bi < st.tiles.length; bi++) {
          var bp = st.tiles[bi].plant;
          if (bp && bp.stage >= ST.SAPLING && bp.stage < ST.FALLEN && !st.tiles[bi].fire) burnables.push(bi);
        }
        var ip = st.season % 4 === 1 ? 0.55 : 0.35;
        if (wxk === 'drought') ip *= 1.6;
        if (wxk === 'wind') ip *= 1.2;
        if (burnables.length >= 4 && rnd(st) < ip) {
          var fi2 = pick(st, burnables);
          st.tiles[fi2].fire = 25;
          ev(st, { t: 'ignited', x: fi2 % GW, y: (fi2 / GW) | 0 });
        }
      }
    }
    for (var fb = 0; fb < st.tiles.length; fb++) {
      var ftl = st.tiles[fb];
      if (!ftl.fire) continue;
      if (st.storm > 0) ftl.fire -= dt * 10; else ftl.fire -= dt;
      /* spread to neighboring trees */
      if (ftl.fire > 0 && st.storm <= 0) {
        var fx2 = fb % GW, nb = [];
        if (fx2 > 0) nb.push(fb - 1);
        if (fx2 < GW - 1) nb.push(fb + 1);
        for (var nb2 = 0; nb2 < nb.length; nb2++) {
          var ntl = st.tiles[nb[nb2]], np = ntl.plant;
          if (!ntl.fire && np && np.stage >= ST.SAPLING && np.stage < ST.FALLEN && rnd(st) < dt * 0.06 * (wxk === 'wind' ? 1.5 : 1)) {
            ntl.fire = 25;
            ev(st, { t: 'ignited', x: nb[nb2] % GW, y: (nb[nb2] / GW) | 0 });
          }
        }
      }
      if (ftl.fire <= 0) {
        ftl.fire = 0;
        if (ftl.plant && ftl.plant.stage >= ST.SAPLING) {
          ftl.plant.stage = ST.FALLEN; ftl.plant.t = 0; ftl.plant.charred = true;
          ev(st, { t: 'burnout', x: fb % GW, y: (fb / GW) | 0, type: ftl.plant.type });
          unlock(st, 'circle');
          /* ash fertilizes neighbors */
          var fx3 = fb % GW, ash = [];
          if (fx3 > 0) ash.push(fb - 1);
          if (fx3 < GW - 1) ash.push(fb + 1);
          for (var ai = 0; ai < ash.length; ai++) {
            var apl = st.tiles[ash[ai]].plant;
            if (apl) apl.boostUntil = Math.max(apl.boostUntil, now + 120);
          }
        }
      }
    }
    /* ---- voles gnaw roots ---- */
    for (var vo = 0; vo < st.animals.length; vo++) {
      var va = st.animals[vo];
      if (va.species !== 'vole') continue;
      if (va.diveUntil > now) continue; /* laying low after an owl swoop */
      /* pick a tree to gnaw */
      if (va.gnaw == null || va.gnaw < 0 || !st.tiles[va.gnaw] || !st.tiles[va.gnaw].plant ||
          st.tiles[va.gnaw].plant.stage < ST.SAPLING) {
        var trees = [];
        for (var ti = 0; ti < st.tiles.length; ti++) {
          var tp2 = st.tiles[ti].plant;
          if (tp2 && tp2.stage >= ST.SAPLING && tp2.stage < ST.FALLEN) trees.push(ti);
        }
        va.gnaw = trees.length ? pick(st, trees) : -1;
      }
      if (va.gnaw >= 0) {
        /* scurry toward the target tile, about one spot per 2.5s */
        va._mx = (va._mx || 0) + dt;
        var gx = va.gnaw % GW;
        if (va._mx >= 2.5) {
          va._mx = 0;
          if (va.x < gx) va.x++; else if (va.x > gx) va.x--;
          va.y = 0;
        }
        if (va.x === gx) st.tiles[va.gnaw].gnawedUntil = now + 20;
      }
    }
    /* ---- dung expiry + passive poop ---- */
    for (var dg2 = st.dung.length - 1; dg2 >= 0; dg2--) if (st.dung[dg2].until <= now) st.dung.splice(dg2, 1);
    st._poopT = (st._poopT || 40 + rnd(st) * 30) - dt;
    if (st._poopT <= 0) {
      st._poopT = 50 + rnd(st) * 40;
      var poopers = [];
      for (var pp = 0; pp < st.animals.length; pp++)
        if (st.animals[pp].species === 'rabbit' || st.animals[pp].species === 'deer') poopers.push(st.animals[pp]);
      if (poopers.length) { var pz = pick(st, poopers); dropDung(st, pz.x, now); }
    }
    /* ---- records ---- */
    var hm = {}; hm[ST.SPROUT] = 0.5; hm[ST.SAPLING] = 2; hm[ST.ADULT] = 12; hm[ST.ANCIENT] = 30;
    for (var ri = 0; ri < st.tiles.length; ri++) {
      var rp = st.tiles[ri].plant;
      if (rp && hm[rp.stage] > st.stats.tallest) st.stats.tallest = hm[rp.stage];
    }
    if (biggest > st.stats.widestWeb) st.stats.widestWeb = biggest;
    /* ---- pond: koi circle, the heron fishes ---- */
    var pond = st.pond;
    for (var kf = 0; kf < pond.fish.length; kf++) {
      var koi = pond.fish[kf];
      koi.a += dt * koi.sp;
      koi.x = Math.cos(koi.a) * 0.72; koi.y = Math.sin(koi.a) * 0.42;
    }
    var heronHere = false;
    for (var hz = 0; hz < st.animals.length; hz++) if (st.animals[hz].species === 'heron') heronHere = true;
    if (heronHere && pond.fish.length) {
      st._heronT = (st._heronT || 45 + rnd(st) * 30) - dt;
      if (st._heronT <= 0) {
        st._heronT = 55 + rnd(st) * 40;
        pond.fish.shift();
        pond.respawn = now + 90;
        addPoints(st, 8, 'heron fishes', 15, 0);
        ev(st, { t: 'heroncatch', x: 15, y: 0 });
      }
    }
    if (!pond.fish.length && pond.respawn && now >= pond.respawn) {
      pond.fish = [{ a: rnd(st) * 6.28, sp: 0.5 }, { a: rnd(st) * 6.28, sp: 0.42 }, { a: rnd(st) * 6.28, sp: 0.55 }];
      pond.respawn = 0;
      ev(st, { t: 'fishreturn', x: 15, y: 0 });
    }
    /* ---- food chain: foxes hunt rabbits, owls hunt voles at night ---- */
    var nightNow = isNight(st);
    st._huntT = (st._huntT || 0) - dt;
    for (var ha = 0; ha < st.animals.length; ha++) {
      var hunter = st.animals[ha];
      if (hunter.mode !== 'hunt') continue;
      var prey = null;
      for (var pi = 0; pi < st.animals.length; pi++)
        if (st.animals[pi].id === hunter.preyId) prey = st.animals[pi];
      if (!prey || (hunter.species === 'owl' && !nightNow)) { hunter.mode = null; continue; }
      hunter._hm = (hunter._hm || 0) + dt;
      if (hunter._hm >= (hunter.species === 'owl' ? 1.1 : 1.6)) {
        hunter._hm = 0;
        if (hunter.x < prey.x) hunter.x++; else if (hunter.x > prey.x) hunter.x--;
        hunter.y = 0;
      }
      if (hunter.x === prey.x) {
        /* caught! cozy rules: the prey dashes away unharmed */
        var hspot = emptyTileNear(st, prey.x, 0);
        if (hspot) { prey.x = hspot.x; prey.y = hspot.y; }
        if (hunter.species === 'owl') prey.diveUntil = now + 40; /* vole lays low */
        ev(st, { t: hunter.species === 'owl' ? 'owlhunt' : 'foxhunt', x: prey.x, y: 0 });
        addPoints(st, 6, hunter.species + ' hunt', hunter.x, 0);
        hunter.mode = null; hunter._hm = 0;
        st._huntT = 75;
      }
    }
    if (st._huntT <= 0) {
      for (var hb = 0; hb < st.animals.length; hb++) {
        var h2 = st.animals[hb];
        if (h2.mode === 'hunt') continue;
        var want = h2.species === 'fox' ? 'rabbit' : (h2.species === 'owl' && nightNow ? 'vole' : null);
        if (!want) continue;
        var tgt = null;
        for (var pc = 0; pc < st.animals.length; pc++) {
          var cand = st.animals[pc];
          if (cand.species === want && !(cand.diveUntil > now)) { tgt = cand; break; }
        }
        if (tgt && Math.abs(tgt.x - h2.x) <= 6) {
          h2.mode = 'hunt'; h2.preyId = tgt.id; h2._hm = 0;
          st._huntT = 20;
          break;
        }
      }
    }
    /* wander */
    for (var a = 0; a < st.animals.length; a++) {
      var an = st.animals[a];
      if (an.species === 'vole') continue; /* voles tunnel with purpose */
      if (an.species === 'heron') continue; /* the heron stands statue-still */
      if (an.mode === 'hunt') continue;    /* hunters move with purpose */
      /* diurnal animals rest at night */
      if (nightNow && (an.species === 'butterfly' || an.species === 'squirrel' ||
          an.species === 'rabbit' || an.species === 'deer' || an.species === 'fox')) continue;
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
      v: 3, seed: st.seed, _rs: st._rs, tiles: st.tiles, points: st.points,
      day: st.day, dayT: st.dayT, animals: st.animals, visiting: st.visiting, dung: st.dung,
      nextAid: st.nextAid, stats: st.stats, ach: st.ach || {}, storm: st.storm || 0,
      season: st.season || 0, seasonDay: st.seasonDay || 0, tod: (st.tod == null ? 0.32 : st.tod),
      questClaimed: st.questClaimed || {}, streak: st.streak || { last: '', n: 0 },
      weather: st.weather || { kind: 'clear', until: 0, next: 'cloudy' },
      pond: st.pond || { fish: [{ a: 0, sp: 0.5 }, { a: 2.1, sp: 0.42 }, { a: 4.2, sp: 0.55 }], respawn: 0 },
      savedAt: Date.now()
    });
  }
  function deserialize(json) {
    try {
      var d = JSON.parse(json);
      /* v1 was the top-down 8x8 build, v2 the 12-spot row; v3 is the 20-spot forest */
      if (!d || d.v !== 3 || !Array.isArray(d.tiles) || d.tiles.length !== GW * GH) return null;
      d.events = [];
      if (!d.ach) d.ach = {};
      if (!d.dung) d.dung = [];
      if (!d.stats.plantsSeen) d.stats.plantsSeen = [];
      if (typeof d.storm !== 'number') d.storm = 0;
      /* living-forest fields: graceful defaults, no save wipe */
      if (typeof d.season !== 'number') d.season = 0;
      if (typeof d.seasonDay !== 'number') d.seasonDay = 0;
      if (typeof d.tod !== 'number') d.tod = 0.32;
      if (!d.questClaimed) d.questClaimed = {};
      if (!d.streak) d.streak = { last: '', n: 0 };
      if (typeof d.stats.ancients !== 'number') d.stats.ancients = 0;
      if (typeof d.stats.firesSmothered !== 'number') d.stats.firesSmothered = 0;
      if (!d.stats.variantsSeen) d.stats.variantsSeen = [];
      if (!d.weather) d.weather = { kind: 'clear', until: 0, next: 'cloudy' };
      if (!d.pond) d.pond = { fish: [{ a: 0, sp: 0.5 }, { a: 2.1, sp: 0.42 }, { a: 4.2, sp: 0.55 }], respawn: 0 };
      return d;
    } catch (e) { return null; }
  }

  /* ---------- self-test ---------- */
  function selfTest() {
    var fails = 0;
    function ok(c, name) { if (!c) { fails++; console.log('FAIL:', name); } }
    var st = newGame(42);
    ok(st.points === 30, 'start points');
    ok(st.tiles.length === 20, 'one row of 20 spots');
    var r = plant(st, 0, 0, 'pine');
    ok(r.ok && st.points === 25, 'plant pine costs 5');
    ok(!plant(st, 0, 0, 'pine').ok, 'no double plant');
    ok(plant(st, 5, 0, 'oak').ok, 'oak affordable at 25 pts');
    ok(plant(st, 6, 0, 'oak').reason === 'poor', 'cannot afford second oak at 5 pts');
    ok(plant(st, 0, 1, 'pine').reason === 'edge', 'single row: y=1 is outside');
    st.points = 500;
    plant(st, 1, 0, 'oak'); plant(st, 2, 0, 'berry'); plant(st, 3, 0, 'berry');
    /* force adults */
    [[1,0],[2,0],[3,0]].forEach(function (c) { tile(st, c[0], c[1]).plant.stage = ST.ADULT; });
    var evs = step(st, 0.1);
    ok(st.visiting.length >= 1 || st.animals.length >= 1, 'arrival triggered: ' + JSON.stringify(evs.map(function(e){return e.t;})));
    /* grow a pine to adult via steps */
    var st2 = newGame(7); st2.points = 500;
    plant(st2, 4, 0, 'pine');
    var p = tile(st2, 4, 0).plant, guard = 0;
    while (p.stage < ST.ADULT && guard++ < 5000) { step(st2, 5); p = tile(st2, 4, 0).plant; }
    ok(p.stage === ST.ADULT, 'pine reaches adult, guard=' + guard);
    /* mushroom network */
    var st3 = newGame(9); st3.points = 500;
    plant(st3, 0, 0, 'pine'); plant(st3, 2, 0, 'pine'); plant(st3, 4, 0, 'pine');
    [[0,0],[2,0],[4,0]].forEach(function (c) { tile(st3, c[0], c[1]).plant.stage = ST.SAPLING; });
    ok(plantMushroom(st3, 1, 0).ok, 'mushroom between trees');
    ok(plantMushroom(st3, 3, 0).ok, 'mushroom between trees 2');
    ok(plantMushroom(st3, 9, 0).reason === 'lonely', 'mushroom needs tree neighbor');
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
    ok(back && back.points === st5.points && back.tiles.length === 20, 'save round-trip');
    ok(deserialize('{"v":1,"tiles":[]}') === null, 'old top-down save rejected');
    ok(deserialize('{"v":2,"tiles":[]}') === null, 'v2 12-spot save rejected');
    /* fallen trunk + hedgehog */
    var st6 = newGame(13); st6.points = 500;
    plant(st6, 5, 0, 'oak'); tile(st6, 5, 0).plant.stage = ST.FALLEN;
    step(st6, 0.1);
    ok(st6.visiting.some(function (v) { return v.species === 'hedgehog'; }) || st6.animals.some(function (a) { return a.species === 'hedgehog'; }), 'hedgehog likes fallen trunk');
    ok(clearTile(st6, 5, 0).ok && !tile(st6, 5, 0).plant, 'clear fallen trunk');
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
    plant(st9, 6, 0, 'pine');
    ok(!tile(st9, 6, 0).plant.fast, 'second plant is normal speed');
    /* achievements fire through play */
    var st10 = newGame(18); st10.points = 500;
    plant(st10, 7, 0, 'pine');
    step(st10, 30); /* fast tree: 20s/3 -> sprout */
    ok(st10.ach['first-sprout'], 'first-sprout achievement');
    /* vole gnaws roots, tap shoos it */
    var st11 = newGame(19); st11.points = 500;
    plant(st11, 5, 0, 'pine'); plant(st11, 6, 0, 'pine'); plant(st11, 7, 0, 'pine');
    [[5,0],[6,0],[7,0]].forEach(function (c) { tile(st11, c[0], c[1]).plant.stage = ST.ADULT; });
    var vl = addAnimal(st11, 'vole', 0);
    for (var vg = 0; vg < 40; vg++) step(st11, 1);
    ok(tile(st11, 5, 0).gnawedUntil > 0 || tile(st11, 6, 0).gnawedUntil > 0 || tile(st11, 7, 0).gnawedUntil > 0, 'vole gnaws the tree roots');
    var tl11 = tile(st11, 5, 0);
    tl11.gnawedUntil = now() + 60;
    ok(growthMul(st11, tl11, now()) < 1, 'gnawed roots slow growth');
    ok(tapAnimal(st11, vl.id, 100).ok && !st11.animals.some(function (a) { return a.species === 'vole'; }), 'tap shoos the vole');
    /* dung fertilizes */
    var st12 = newGame(20); st12.points = 500;
    plant(st12, 8, 0, 'pine');
    dropDung(st12, 8, now());
    ok(st12.dung.length === 1, 'dung dropped');
    ok(growthMul(st12, tile(st12, 8, 0), now()) > 1, 'dung boosts growth');
    /* aspen suckers + pando */
    var st13 = newGame(21); st13.points = 500;
    for (var ai2 = 0; ai2 < 8; ai2++) { plant(st13, ai2 * 2, 0, 'aspen'); tile(st13, ai2 * 2, 0).plant.stage = ST.SAPLING; }
    step(st13, 0.1);
    ok(st13.ach['pando'], 'pando: 8 aspens');
    var st13b = newGame(22); st13b.points = 500;
    plant(st13b, 10, 0, 'aspen');
    var asp = tile(st13b, 10, 0).plant; asp.stage = ST.ADULT; asp.suckT = 0.01; asp.fast = false;
    step(st13b, 1);
    ok(tile(st13b, 9, 0).plant || tile(st13b, 11, 0).plant, 'aspen sends up a root sucker');
    /* wildfire: ignite, smother, burnout */
    var st14 = newGame(23); st14.points = 500;
    plant(st14, 3, 0, 'pine'); tile(st14, 3, 0).plant.stage = ST.ADULT;
    tile(st14, 3, 0).fire = 25;
    step(st14, 1);
    ok(tile(st14, 3, 0).fire === 24, 'fire burns down');
    var sm1 = smother(st14, 3, 0, now());
    ok(sm1.ok && !sm1.out, 'smother weakens fire');
    smother(st14, 3, 0, now()); smother(st14, 3, 0, now());
    ok(tile(st14, 3, 0).fire === 0, 'three taps smother the fire');
    tile(st14, 3, 0).fire = 0.5;
    step(st14, 1);
    ok(tile(st14, 3, 0).plant.stage === ST.FALLEN && tile(st14, 3, 0).plant.charred, 'burned tree becomes charred trunk');
    /* records */
    var st15 = newGame(24); st15.points = 500;
    plant(st15, 0, 0, 'oak'); tile(st15, 0, 0).plant.stage = ST.ANCIENT;
    step(st15, 0.1);
    ok(st15.stats.tallest === 30, 'tallest tree tracked in meters');
    /* seasons: 4 days each, starting in spring */
    var st16 = newGame(25);
    ok(st16.season === 0 && seasonOf(st16) === 'spring', 'new grove starts in spring');
    for (var sd = 0; sd < 4; sd++) step(st16, 180);
    ok(st16.season === 1 && st16.day === 5, 'summer after 4 days, got season=' + st16.season + ' day=' + st16.day);
    /* day/night */
    var st17 = newGame(26);
    ok(!isNight(st17) && dayLight(st17) > 0.3, 'morning is day');
    st17.tod = 0.9;
    ok(isNight(st17) && dayLight(st17) === 0, 'tod 0.9 is night');
    st17.tod = 0.5;
    ok(!isNight(st17) && Math.abs(dayLight(st17) - 1) < 0.01, 'tod 0.5 is noon');
    /* winter slows deciduous growth, pine keeps going */
    var st18 = newGame(27); st18.points = 500; st18.season = 3;
    plant(st18, 0, 0, 'oak'); plant(st18, 1, 0, 'pine');
    tile(st18, 0, 0).plant.fast = false; tile(st18, 1, 0).plant.fast = false;
    var oakM = growthMul(st18, tile(st18, 0, 0), now());
    var pineM = growthMul(st18, tile(st18, 1, 0), now());
    ok(oakM < 0.5 && pineM > 0.5, 'winter: oak dormant, pine hardy (oak=' + oakM.toFixed(2) + ' pine=' + pineM.toFixed(2) + ')');
    /* quests: progress + claim */
    var st19 = newGame(28); st19.points = 500;
    var qs = quests(st19);
    ok(qs.length === 8 && qs[0].id === 'sprout3' && !qs[0].done, '8 quests listed, none done yet');
    st19.stats.tapped = 10;
    var qs2 = quests(st19).filter(function (q) { return q.id === 'taps10'; })[0];
    ok(qs2.done && !qs2.claimed, 'taps quest done after 10 taps');
    var cl = claimQuest(st19, 'taps10');
    ok(cl.ok && cl.reward === 10 && st19.points === 510, 'quest claim pays leaves');
    ok(!claimQuest(st19, 'taps10').ok, 'quest cannot be claimed twice');
    /* daily streak with injected dates */
    var st20 = newGame(29); st20.points = 500;
    ok(dailyStatus(st20, '2026-10-11').available, 'first daily gift available');
    var dc = claimDaily(st20, now(), '2026-10-11');
    ok(dc.ok && dc.day === 1, 'day 1 streak claimed');
    ok(!dailyStatus(st20, '2026-10-11').available, 'no double-dip same day');
    ok(dailyStatus(st20, '2026-10-12').available && dailyStatus(st20, '2026-10-12').day === 2, 'streak continues next day');
    ok(dailyStatus(st20, '2026-10-14').day === 1, 'streak resets after a missed day');
    /* rare variants appear */
    var st21 = newGame(30); st21.points = 5000; var seenV = false;
    for (var pv = 0; pv < 60; pv++) { plant(st21, pv % 20, 0, pv % 2 ? 'aspen' : 'pine'); var pl = tile(st21, pv % 20, 0).plant; if (pl && pl.variant) seenV = true; tile(st21, pv % 20, 0).plant = null; st21.points = 5000; }
    ok(seenV, 'rare variants appear when planting (6%)');
    /* fox hunts rabbit: cozy catch, rabbit flees unharmed */
    var st22 = newGame(31); st22.points = 500;
    plant(st22, 0, 0, 'pine'); plant(st22, 1, 0, 'pine'); plant(st22, 2, 0, 'pine');
    plant(st22, 3, 0, 'berry'); plant(st22, 4, 0, 'berry');
    [[0,0],[1,0],[2,0],[3,0],[4,0]].forEach(function (c) { tile(st22, c[0], c[1]).plant.stage = ST.ADULT; });
    tile(st22, 6, 0).plant = { type: 'oak', stage: ST.FALLEN, t: 0, boostUntil: 0 };
    addAnimal(st22, 'squirrel', 0); addAnimal(st22, 'hedgehog', 0);
    var rb = addAnimal(st22, 'rabbit', 0); var fx = addAnimal(st22, 'fox', 0);
    fx.x = 5; rb.x = 7;
    var hunted = false;
    for (var hh = 0; hh < 200 && !hunted; hh++) { step(st22, 1); if (st22.animals.some(function (a) { return a.mode === 'hunt'; })) hunted = true; }
    ok(hunted, 'fox starts hunting a nearby rabbit');
    var rbAlive = st22.animals.some(function (a) { return a.species === 'rabbit'; });
    for (var hh2 = 0; hh2 < 300; hh2++) step(st22, 1);
    ok(rbAlive && st22.animals.some(function (a) { return a.species === 'rabbit'; }), 'rabbit survives the hunt (cozy rules)');
    /* graceful save migration: v3 save without living-forest fields */
    var oldSave = JSON.stringify({ v: 3, tiles: st22.tiles, points: 10, day: 2, dayT: 0, animals: [], visiting: [], nextAid: 1, stats: { grown: 0, tapped: 0, speciesSeen: [], plantsSeen: [], plantedAny: true, arrivals: 0, peak: 10, tallest: 0, widestWeb: 0 }, ach: {}, storm: 0, seed: 5, _rs: 5 });
    var mig = deserialize(oldSave);
    ok(mig && mig.season === 0 && mig.tod === 0.32 && mig.streak.n === 0 && mig.stats.ancients === 0, 'old v3 save migrates with defaults');
    /* weather: transitions, drought slows, rain boosts */
    var st23 = newGame(32); st23.points = 500;
    plant(st23, 0, 0, 'pine'); tile(st23, 0, 0).plant.fast = false;
    st23.weather = { kind: 'drought', until: 1e9, next: 'rain' };
    ok(growthMul(st23, tile(st23, 0, 0), now()) < 1, 'drought slows growth');
    st23.weather.kind = 'rain';
    ok(growthMul(st23, tile(st23, 0, 0), now()) > 1, 'rain boosts growth');
    st23.weather.until = 0;
    var evw = step(st23, 0.1);
    ok(st23.weather.kind === 'rain' && evw.some(function (e) { return e.t === 'weather'; }), 'weather transitions to forecast');
    ok(WEATHERS.indexOf(st23.weather.next) >= 0, 'next weather forecast');
    /* pond: koi swim, heron arrives and fishes */
    var st24 = newGame(33); st24.points = 500;
    for (var px = 0; px < 10; px++) { plant(st24, px, 0, 'pine'); tile(st24, px, 0).plant.stage = ST.ADULT; }
    /* park the other species as "present" so the heron gets the arrival slot */
    ['squirrel', 'rabbit', 'butterfly', 'fox', 'owl', 'deer', 'hedgehog', 'frog', 'vole'].forEach(function (sp) {
      st24.visiting.push({ species: sp, t: 9999 });
    });
    step(st24, 0.1);
    ok(st24.visiting.some(function (v) { return v.species === 'heron'; }) || st24.animals.some(function (a) { return a.species === 'heron'; }), 'heron visits a lush forest');
    var f0 = st24.pond.fish[0].a;
    step(st24, 5);
    ok(st24.pond.fish[0].a !== f0, 'koi swim');
    var hr = addAnimal(st24, 'heron', 0);
    var fn = st24.pond.fish.length;
    st24._heronT = 0.01;
    step(st24, 1);
    ok(st24.pond.fish.length === fn - 1, 'heron catches a fish');
    ok(tapAnimal(st24, hr.id, 500).ok, 'tap heron');
    console.log(fails === 0 ? 'SIM SELF-TEST: ALL PASS' : 'SIM SELF-TEST: ' + fails + ' FAILURES');
    return fails;
  }

  return {
    GW: GW, GH: GH, ST: ST, PLANTS: PLANTS, ANIMALS: ANIMALS, ANIMAL_IDS: ANIMAL_IDS,
    MUSH_COST: MUSH_COST, TAP_COOLDOWN: TAP_COOLDOWN, STORM_COST: STORM_COST,
    ACH: ACH, SEASONS: SEASONS, QUESTS: QUESTS, WEATHERS: WEATHERS,
    newGame: newGame, step: step, plant: plant, plantMushroom: plantMushroom,
    clearTile: clearTile, tapAnimal: tapAnimal, smother: smother, wildGift: wildGift, stats: stats, summonStorm: summonStorm,
    computeNetworks: computeNetworks, drainEvents: drainEvents, now: now,
    seasonOf: seasonOf, isNight: isNight, dayLight: dayLight, weatherOf: weatherOf,
    quests: quests, claimQuest: claimQuest, dailyStatus: dailyStatus, claimDaily: claimDaily,
    serialize: serialize, deserialize: deserialize, selfTest: selfTest
  };
})();
if (typeof module !== 'undefined' && require.main === module) {
  process.exit(FW.selfTest() ? 1 : 0);
}
