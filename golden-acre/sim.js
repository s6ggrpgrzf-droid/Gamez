/* Golden Acre — sim.js
 * Pure farm simulation. No DOM, no canvas, no requestAnimationFrame.
 * Seeded RNG (xorshift32); the rng state lives on st.rs so saved games
 * stay deterministic across load/offline simulation.
 * Faithful to SimFarm '93 systems: plow/plant/tend/harvest, seasons,
 * weather, pests, market prices, loans, livestock, disasters, county fair.
 */
(function (root) {
'use strict';

/* ---------------- seeded PRNG ---------------- */
function RNG(seed) { this.s = (seed >>> 0) || 1; }
RNG.prototype.next = function () {
  var s = this.s | 0;
  s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
  this.s = s >>> 0;
  return this.s / 4294967296;
};
RNG.prototype.range = function (a, b) { return a + this.next() * (b - a); };
RNG.prototype.below = function (p) { return this.next() < p; };
RNG.prototype.int = function (a, b) { return a + Math.floor(this.next() * (b - a + 1)); };

/* ---------------- constants ---------------- */
var W = 18, H = 12, TILES = W * H;
var DAY_LEN = 100;          /* real seconds per game day at 1x speed */
var SEASON_DAYS = 8;
var SEASONS = ['spring', 'summer', 'fall', 'winter'];
var SEASON_NAME = { spring: 'Spring', summer: 'Summer', fall: 'Fall', winter: 'Winter' };

var CROPS = {
  wheat:  { name: 'Wheat',    seasons: ['spring', 'summer', 'fall'], grow: 6,  water: 25, seed: 12, yield: 12, price: 18, pest: 0.30 },
  corn:   { name: 'Corn',     seasons: ['spring', 'summer'],        grow: 7,  water: 30, seed: 18, yield: 14, price: 22, pest: 0.35 },
  cotton: { name: 'Cotton',   seasons: ['summer', 'fall'],          grow: 8,  water: 28, seed: 20, yield: 10, price: 35, pest: 0.40 },
  soy:    { name: 'Soybeans', seasons: ['spring', 'summer'],        grow: 6,  water: 25, seed: 14, yield: 11, price: 24, pest: 0.25 },
  potato: { name: 'Potatoes', seasons: ['spring', 'fall'],          grow: 7,  water: 28, seed: 10, yield: 16, price: 14, pest: 0.30 },
  orange: { name: 'Oranges',  seasons: ['spring'],                  grow: 20, water: 20, seed: 60, yield: 20, price: 30, pest: 0.15, perennial: true }
};
var CROP_IDS = Object.keys(CROPS);

/* seasonal demand multiplier per crop, indexed by season 0..3 */
var DEMAND = {
  wheat:  [1.00, 0.95, 1.15, 1.25],
  corn:   [1.05, 1.00, 1.20, 1.15],
  cotton: [0.95, 1.05, 1.25, 1.10],
  soy:    [1.10, 1.00, 1.15, 1.05],
  potato: [1.00, 0.95, 1.20, 1.30],
  orange: [1.00, 1.10, 1.15, 1.35]
};

var BUILDINGS = {
  farmhouse: { name: 'Farmhouse',    w: 2, h: 2, cost: 0 },
  barn:      { name: 'Barn',         w: 2, h: 2, cost: 2500 },
  silo:      { name: 'Silo',         w: 1, h: 1, cost: 1200, storage: 500 },
  coop:      { name: 'Chicken Coop', w: 1, h: 1, cost: 800 },
  pigpen:    { name: 'Pigpen',       w: 2, h: 1, cost: 1000 }
};
var HOME_FOR = { cow: 'barn', chicken: 'coop', pig: 'pigpen' };
var HOME_CAP = { cow: 10, chicken: 20, pig: 8 };

var ANIMALS = {
  cow:     { name: 'Cow',     cost: 500, feed: 3,   milk: 6, milkPrice: 2 },
  chicken: { name: 'Chicken', cost: 25,  feed: 0.2, eggs: 1, eggPrice: 0.5 },
  pig:     { name: 'Pig',     cost: 150, feed: 1,   porkPrice: 4 }
};

var TOOL_COST = { plow: 5, water: 3, fert: 8, spray: 10 };
var LOAN_MAX = 20000, LOAN_RATE = 0.08, FORECLOSE_AT = -10000;
var BASE_STORAGE = 200, LAND_VALUE = 50;
var FAIR_FOLKS = ['Harlan Briggs', 'Mabel Thorn', 'Otis Kade', 'June Calloway', 'Ruth Abernathy'];
var RIBBONS = [
  { name: 'Blue ribbon',  prize: 1000, color: '#2f6fd6' },
  { name: 'Red ribbon',   prize: 500,  color: '#d63a2f' },
  { name: 'White ribbon', prize: 250,  color: '#e8e4da' }
];

/* ---------------- state ---------------- */
function blankTile() {
  return { crop: null, plowed: false, prog: 0, moisture: 45,
           fert: false, pest: 0, pestDays: 0, sprayT: 0,
           wilt: 0, well: 0, ruined: false, b: 0, notified: false };
}

function newGame(seed) {
  seed = (seed >>> 0) || ((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0) || 1;
  var rng = new RNG(seed);
  var st = {
    v: 1, seed: seed, rs: rng.s,
    year: 1, season: 0, day: 1, dayT: 0,
    cash: 4000, loan: 0,
    tiles: [], buildings: [], animals: [],
    store: {}, market: {},
    weather: { cur: 'sunny', forecast: ['sunny', 'sunny', 'sunny'], drought: 0 },
    fair: { active: false, entered: null, results: null, neighbors: [] },
    over: null,
    stats: { earned: 0, harvested: 0, lost: 0, fairsWon: 0, bestBatch: null },
    events: [],
    idc: 1
  };
  for (var i = 0; i < TILES; i++) st.tiles.push(blankTile());
  /* pre-built farmhouse, bottom-left */
  buildAt(st, 'farmhouse', 1, 9, true);
  rollWeather(st, rng);
  priceDay(st, rng);
  st.rs = rng.s;
  return st;
}

function tileAt(st, x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return null;
  return st.tiles[y * W + x];
}
function seasonName(st) { return SEASONS[st.season]; }
function dateStr(st) {
  return SEASON_NAME[seasonName(st)] + ' · Day ' + st.day + ' · Yr ' + st.year;
}
function storageCap(st) {
  var cap = BASE_STORAGE;
  for (var i = 0; i < st.buildings.length; i++) {
    var b = BUILDINGS[st.buildings[i].type];
    if (b.storage) cap += b.storage;
  }
  return cap;
}
function storedTotal(st) {
  var n = 0;
  for (var k in st.store) n += st.store[k];
  return n;
}
function cropStage(t) {
  if (!t.crop) return -1;
  if (t.prog >= 1) return 3;
  return Math.min(2, Math.floor(t.prog * 3));
}
function canGrow(st, cropId) {
  var s = seasonName(st);
  if (CROPS[cropId].perennial) return s !== 'winter';
  return CROPS[cropId].seasons.indexOf(s) >= 0;
}

/* ---------------- market ---------------- */
function priceDay(st, rng) {
  for (var i = 0; i < CROP_IDS.length; i++) {
    var c = CROP_IDS[i];
    var p = CROPS[c].price * DEMAND[c][st.season] * (0.7 + 0.6 * rng.next());
    st.market[c] = Math.max(1, Math.round(p * 100) / 100);
  }
}

/* ---------------- weather ---------------- */
function rollOne(rng, season, drought) {
  var rainP = [0.30, 0.22, 0.25, 0.20][season];
  if (drought > 0) rainP *= 0.3;
  var r = rng.next();
  if (r < rainP * 0.22) return 'storm';
  if (r < rainP) return 'rain';
  if (r < rainP + 0.25) return 'cloudy';
  return 'sunny';
}
function rollWeather(st, rng) {
  var w = rollOne(rng, st.season, st.weather.drought);
  st.weather.cur = w;
  if (w === 'rain' || w === 'storm') st.weather.drought = 0;
  else st.weather.drought++;
  if (st.weather.drought === 6) {
    st.events.push({ t: 'banner', msg: 'Drought grips the valley — irrigate!' });
  }
  st.weather.forecast = [
    rollOne(rng, st.season, st.weather.drought),
    rollOne(rng, st.season, st.weather.drought),
    rollOne(rng, st.season, st.weather.drought)
  ];
}

/* ---------------- tile actions ---------------- */
function spend(st, n) {
  if (st.cash < n) return false;
  st.cash = Math.round((st.cash - n) * 100) / 100;
  return true;
}
function plowAt(st, x, y) {
  var t = tileAt(st, x, y);
  if (!t || t.b || t.crop || t.plowed) return { ok: false, why: 'Nothing to plow here.' };
  if (!spend(st, TOOL_COST.plow)) return { ok: false, why: 'Not enough cash.' };
  t.plowed = true; t.moisture = 50;
  return { ok: true };
}
function plantAt(st, x, y, cropId) {
  var t = tileAt(st, x, y), c = CROPS[cropId];
  if (!t || !c) return { ok: false, why: 'Bad tile or crop.' };
  if (t.b) return { ok: false, why: 'A building stands here.' };
  if (t.crop) return { ok: false, why: 'Something already grows here.' };
  if (!t.plowed) return { ok: false, why: 'Plow the soil first.' };
  if (c.seasons.indexOf(seasonName(st)) < 0)
    return { ok: false, why: c.name + ' is planted in ' + c.seasons.join('/') + '.' };
  if (!spend(st, c.seed)) return { ok: false, why: 'Not enough cash for seed.' };
  t.crop = cropId; t.prog = 0; t.fert = false; t.pest = 0;
  t.pestDays = 0; t.wilt = 0; t.well = 0; t.ruined = false; t.notified = false;
  return { ok: true };
}
function waterAt(st, x, y) {
  var t = tileAt(st, x, y);
  if (!t || t.b || !t.crop) return { ok: false, why: 'Water a growing crop.' };
  if (!spend(st, TOOL_COST.water)) return { ok: false, why: 'Not enough cash.' };
  t.moisture = Math.min(100, t.moisture + 40);
  return { ok: true };
}
function fertAt(st, x, y) {
  var t = tileAt(st, x, y);
  if (!t || t.b || !t.crop || t.fert) return { ok: false, why: 'Nothing to fertilize.' };
  if (!spend(st, TOOL_COST.fert)) return { ok: false, why: 'Not enough cash.' };
  t.fert = true;
  return { ok: true };
}
function sprayAt(st, x, y) {
  var t = tileAt(st, x, y);
  if (!t || t.b || !t.crop) return { ok: false, why: 'Spray a growing crop.' };
  if (!spend(st, TOOL_COST.spray)) return { ok: false, why: 'Not enough cash.' };
  t.pest = 0; t.pestDays = 0; t.sprayT = 3; t.notified = false;
  return { ok: true };
}
function harvestQuality(t, cropId) {
  var c = CROPS[cropId];
  var q = 45 + 40 * Math.min(1, t.well / c.grow) + (t.fert ? 10 : 0) - (t.ruined ? 25 : 0);
  return Math.max(5, Math.min(100, Math.round(q)));
}
function harvestAt(st, x, y) {
  var t = tileAt(st, x, y);
  if (!t || !t.crop) return { ok: false, why: 'Nothing to harvest.' };
  if (t.prog < 1) return { ok: false, why: 'Not ripe yet.' };
  var rng = new RNG(st.rs);
  var c = CROPS[t.crop];
  var units = Math.round(c.yield * (t.fert ? 1.25 : 1) * (t.ruined ? 0.5 : 1) * rng.range(0.9, 1.1));
  units = Math.max(1, units);
  var q = harvestQuality(t, t.crop);
  var bb = st.stats.bestBatch;
  if (!bb || q > bb.q) st.stats.bestBatch = { crop: t.crop, q: q, units: units };
  st.stats.harvested += units;
  addStore(st, t.crop, units, rng);
  st.events.push({ t: 'harvest', x: x, y: y, units: units, crop: t.crop, q: q });
  if (c.perennial) {
    t.prog = 0.35; t.fert = false; t.well = 0; t.ruined = false; /* orchard regrows */
  } else {
    t.crop = null; t.prog = 0; t.fert = false; t.pest = 0;
    t.pestDays = 0; t.wilt = 0; t.well = 0; t.ruined = false; t.notified = false;
  }
  st.rs = rng.s;
  return { ok: true, units: units, quality: q };
}
function bulldozeAt(st, x, y) {
  var t = tileAt(st, x, y);
  if (!t) return { ok: false, why: 'Bad tile.' };
  if (t.b) {
    var bi = -1;
    for (var i = 0; i < st.buildings.length; i++)
      if (st.buildings[i].id === t.b) bi = i;
    if (bi < 0) return { ok: false, why: 'Nothing there.' };
    var b = st.buildings[bi];
    if (b.type === 'farmhouse') return { ok: false, why: 'The farmhouse stays.' };
    for (var j = 0; j < st.animals.length; j++) {
      if (HOME_FOR[st.animals[j].kind] === b.type)
        return { ok: false, why: 'Move the animals out first.' };
    }
    var refund = Math.round(BUILDINGS[b.type].cost * 0.3);
    for (var dy = 0; dy < b.h; dy++) for (var dx = 0; dx < b.w; dx++) {
      var tt = tileAt(st, b.x + dx, b.y + dy);
      if (tt) { tt.b = 0; tt.plowed = false; tt.crop = null; }
    }
    st.buildings.splice(bi, 1);
    st.cash += refund;
    return { ok: true, refund: refund };
  }
  if (t.crop || t.plowed) {
    t.crop = null; t.plowed = false; t.prog = 0; t.fert = false;
    t.pest = 0; t.pestDays = 0; t.wilt = 0; t.well = 0; t.ruined = false;
    return { ok: true };
  }
  return { ok: false, why: 'Nothing to clear.' };
}

/* ---------------- storage & market ---------------- */
function addStore(st, cropId, units, rng) {
  var cap = storageCap(st);
  var total = storedTotal(st);
  if (total + units > cap) {
    var over = total + units - cap;
    var kept = units - over;
    st.store[cropId] = (st.store[cropId] || 0) + kept;
    var got = Math.round(over * st.market[cropId] * 100) / 100;
    st.cash = Math.round((st.cash + got) * 100) / 100;
    st.stats.earned = Math.round((st.stats.earned + got) * 100) / 100;
    st.events.push({ t: 'toast', msg: 'Storage full — sold ' + over + ' ' + CROPS[cropId].name + ' for $' + got.toFixed(0) });
  } else {
    st.store[cropId] = (st.store[cropId] || 0) + units;
  }
}
function sellCrop(st, cropId, units) {
  var have = st.store[cropId] || 0;
  units = Math.max(0, Math.min(units, have));
  if (units <= 0) return { ok: false, why: 'Nothing to sell.' };
  var got = Math.round(units * st.market[cropId] * 100) / 100;
  st.store[cropId] = have - units;
  st.cash = Math.round((st.cash + got) * 100) / 100;
  st.stats.earned = Math.round((st.stats.earned + got) * 100) / 100;
  return { ok: true, got: got, units: units };
}

/* ---------------- bank ---------------- */
function borrow(st, amt) {
  amt = Math.floor(amt);
  if (amt <= 0) return { ok: false, why: 'Name an amount.' };
  if (st.loan + amt > LOAN_MAX) return { ok: false, why: 'The bank caps loans at $' + LOAN_MAX + '.' };
  st.loan += amt; st.cash += amt;
  return { ok: true };
}
function repay(st, amt) {
  amt = Math.floor(amt);
  if (amt <= 0) return { ok: false, why: 'Name an amount.' };
  amt = Math.min(amt, st.loan, Math.floor(st.cash));
  if (amt <= 0) return { ok: false, why: 'Nothing to repay.' };
  st.loan -= amt; st.cash -= amt;
  return { ok: true, paid: amt };
}

/* ---------------- buildings ---------------- */
function buildAt(st, type, x, y, free) {
  var b = BUILDINGS[type];
  if (!b) return { ok: false, why: 'Unknown building.' };
  if (x < 0 || y < 0 || x + b.w > W || y + b.h > H) return { ok: false, why: 'No room there.' };
  for (var dy = 0; dy < b.h; dy++) for (var dx = 0; dx < b.w; dx++) {
    var t = tileAt(st, x + dx, y + dy);
    if (!t || t.b || t.crop) return { ok: false, why: 'The ground is occupied.' };
  }
  if (!free) {
    if (!spend(st, b.cost)) return { ok: false, why: 'Not enough cash.' };
  }
  var id = st.idc++;
  st.buildings.push({ id: id, type: type, x: x, y: y, w: b.w, h: b.h });
  for (var dy2 = 0; dy2 < b.h; dy2++) for (var dx2 = 0; dx2 < b.w; dx2++) {
    var t2 = tileAt(st, x + dx2, y + dy2);
    t2.b = id; t2.plowed = false; t2.crop = null;
  }
  return { ok: true };
}
function countHome(st, type) {
  var n = 0;
  for (var i = 0; i < st.buildings.length; i++)
    if (st.buildings[i].type === type) n++;
  return n;
}
function countAnimals(st, kind) {
  var n = 0;
  for (var i = 0; i < st.animals.length; i++)
    if (st.animals[i].kind === kind) n++;
  return n;
}

/* ---------------- livestock ---------------- */
function buyAnimal(st, kind) {
  var a = ANIMALS[kind];
  if (!a) return { ok: false, why: 'Unknown animal.' };
  var home = HOME_FOR[kind];
  if (countHome(st, home) === 0)
    return { ok: false, why: 'Build a ' + BUILDINGS[home].name + ' first.' };
  if (countAnimals(st, kind) >= countHome(st, home) * HOME_CAP[kind])
    return { ok: false, why: 'No room — build another ' + BUILDINGS[home].name + '.' };
  if (!spend(st, a.cost)) return { ok: false, why: 'Not enough cash.' };
  st.animals.push({ id: st.idc++, kind: kind, health: 100, weight: kind === 'pig' ? 40 : 0 });
  return { ok: true };
}
function sellAnimal(st, id) {
  var ix = -1;
  for (var i = 0; i < st.animals.length; i++)
    if (st.animals[i].id === id) ix = i;
  if (ix < 0) return { ok: false, why: 'No such animal.' };
  var a = st.animals[ix], got;
  if (a.kind === 'pig') got = Math.round(a.weight * ANIMALS.pig.porkPrice * (a.health / 100) * 100) / 100;
  else got = Math.round(ANIMALS[a.kind].cost * (a.health / 100) * 0.8 * 100) / 100;
  st.animals.splice(ix, 1);
  st.cash = Math.round((st.cash + got) * 100) / 100;
  st.stats.earned = Math.round((st.stats.earned + got) * 100) / 100;
  return { ok: true, got: got };
}

/* ---------------- county fair ---------------- */
function startFair(st, rng) {
  st.fair.active = true;
  st.fair.entered = null;
  st.fair.results = null;
  st.fair.neighbors = FAIR_FOLKS.map(function (n) {
    return { name: n, cropQ: Math.round(52 + rng.next() * 40), animalQ: Math.round(52 + rng.next() * 40) };
  });
  st.events.push({ t: 'banner', msg: 'The County Fair is in town — enter your best!' });
}
function enterFair(st, cropId, animalId) {
  if (!st.fair.active) return { ok: false, why: 'The fair is not in town.' };
  if (st.fair.entered) return { ok: false, why: 'Already entered.' };
  if (!(st.store[cropId] >= 10)) return { ok: false, why: 'Need 10 ' + CROPS[cropId].name + ' in storage to enter.' };
  var a = null;
  for (var i = 0; i < st.animals.length; i++)
    if (st.animals[i].id === animalId) a = st.animals[i];
  if (!a) return { ok: false, why: 'Pick one of your animals.' };
  st.store[cropId] -= 10;
  var bb = st.stats.bestBatch;
  var cropQ = (bb && bb.crop === cropId) ? bb.q : 60;
  var animalQ = a.kind === 'pig'
    ? Math.round(Math.min(100, a.weight * 0.5 + a.health * 0.5))
    : Math.round(a.health);
  st.fair.entered = { cropId: cropId, cropQ: cropQ, animalId: animalId, animalQ: animalQ, animalKind: a.kind };
  return { ok: true };
}
function ribbonFor(rank) {
  return rank <= 3 ? RIBBONS[rank - 1] : null;
}
function judgeFair(st, rng) {
  var e = st.fair.entered;
  var res = { crop: null, animal: null, prize: 0 };
  if (e) {
    var cf = st.fair.neighbors.map(function (n) {
      return { name: n.name, q: n.cropQ + rng.range(-6, 6) };
    });
    cf.push({ name: 'You', q: e.cropQ, you: true });
    cf.sort(function (a, b) { return b.q - a.q; });
    var crank = cf.findIndex(function (x) { return x.you; }) + 1;
    var af = st.fair.neighbors.map(function (n) {
      return { name: n.name, q: n.animalQ + rng.range(-6, 6) };
    });
    af.push({ name: 'You', q: e.animalQ, you: true });
    af.sort(function (a, b) { return b.q - a.q; });
    var arank = af.findIndex(function (x) { return x.you; }) + 1;
    var cr = ribbonFor(crank), ar = ribbonFor(arank);
    res.crop = { rank: crank, ribbon: cr, of: cf.length };
    res.animal = { rank: arank, ribbon: ar, of: af.length };
    if (cr) res.prize += cr.prize;
    if (ar) res.prize += ar.prize;
    if (crank === 1 || arank === 1) st.stats.fairsWon++;
    st.cash = Math.round((st.cash + res.prize) * 100) / 100;
    st.events.push({ t: 'fair', results: res });
  }
  st.fair.results = res;
  st.fair.active = false;
  st.fair.entered = null;
  return res;
}

/* ---------------- net worth ---------------- */
function netWorth(st) {
  var v = st.cash - st.loan + TILES * LAND_VALUE;
  for (var i = 0; i < st.buildings.length; i++)
    v += BUILDINGS[st.buildings[i].type].cost * 0.7;
  for (var j = 0; j < st.animals.length; j++) {
    var a = st.animals[j];
    if (a.kind === 'pig') v += a.weight * ANIMALS.pig.porkPrice * (a.health / 100);
    else v += ANIMALS[a.kind].cost * (a.health / 100);
  }
  for (var k in st.store) v += (st.store[k] || 0) * CROPS[k].price;
  return Math.round(v);
}

/* ---------------- the day tick ---------------- */
function advanceDay(st) {
  if (st.over) return st.events;
  var rng = new RNG(st.rs);
  st.events = [];
  var w = st.weather;

  /* 1. weather */
  rollWeather(st, rng);
  var cur = st.weather.cur;

  /* 2. crops drink, grow, suffer */
  var died = 0, pestHit = 0;
  for (var i = 0; i < TILES; i++) {
    var t = st.tiles[i];
    if (cur === 'rain') t.moisture = Math.min(100, t.moisture + 35);
    else if (cur === 'storm') t.moisture = Math.min(100, t.moisture + 25);
    if (!t.crop) {
      if (t.plowed) t.moisture = Math.max(0, t.moisture - 10);
      continue;
    }
    var c = CROPS[t.crop];
    t.moisture = Math.max(0, t.moisture - c.water);
    if (t.moisture < 15) {
      t.wilt++;
      if (t.wilt >= 3) {
        t.crop = null; t.prog = 0; t.fert = false; t.pest = 0;
        t.pestDays = 0; t.wilt = 0; t.well = 0; t.ruined = false; t.notified = false;
        died++; st.stats.lost++;
        continue;
      }
    } else {
      t.wilt = 0;
      if (t.moisture >= c.water * 0.7) t.well++;
    }
    if (t.prog < 1 && canGrow(st, t.crop)) {
      t.prog = Math.min(1, t.prog + (1 / c.grow) * (t.fert ? 1.25 : 1));
    }
    if (t.sprayT > 0) { t.sprayT--; if (t.pest) { t.pest = 0; t.pestDays = 0; t.notified = false; } }
    if (t.prog < 1 && !t.pest && t.sprayT === 0 && rng.below(c.pest / 9)) {
      t.pest = 1; t.pestDays = 0; pestHit++;
    }
    if (t.pest) {
      t.pestDays++;
      if (t.pestDays >= 2 && !t.ruined) {
        t.ruined = true;
        if (!t.notified) {
          t.notified = true;
          st.events.push({ t: 'toast', msg: 'Pests are ruining your ' + c.name + ' — spray soon!' });
        }
      }
    }
  }
  if (died > 0) st.events.push({ t: 'toast', msg: died + ' crop' + (died > 1 ? 's' : '') + ' withered from thirst.' });
  else if (pestHit > 0 && died === 0) st.events.push({ t: 'toast', msg: 'Pests spotted in the fields.' });

  /* 3. livestock: feed, then milk & eggs */
  var feed = 0;
  for (var a2 = 0; a2 < st.animals.length; a2++) feed += ANIMALS[st.animals[a2].kind].feed;
  feed = Math.round(feed * 100) / 100;
  st.cash = Math.round((st.cash - feed) * 100) / 100;
  var broke = st.cash < 0;
  var dairy = 0;
  for (var a3 = 0; a3 < st.animals.length; a3++) {
    var an = st.animals[a3];
    if (broke) { an.health = Math.max(0, an.health - 12); }
    else {
      an.health = Math.min(100, an.health + 2);
      if (an.kind === 'cow') dairy += an.milk * ANIMALS.cow.milkPrice * (an.health / 100);
      else if (an.kind === 'chicken') dairy += an.eggs * ANIMALS.chicken.eggPrice * (an.health / 100);
      else if (an.kind === 'pig') an.weight += 3;
    }
  }
  if (dairy > 0) {
    dairy = Math.round(dairy * 100) / 100;
    st.cash = Math.round((st.cash + dairy) * 100) / 100;
    st.stats.earned = Math.round((st.stats.earned + dairy) * 100) / 100;
  }
  if (broke && st.animals.length)
    st.events.push({ t: 'toast', msg: 'No cash for feed — the animals are going hungry.' });

  /* 4. market */
  priceDay(st, rng);

  /* 5. disasters */
  if (cur === 'storm' && rng.below(0.35)) {
    var hit = 0;
    for (var h = 0; h < TILES; h++) {
      var th = st.tiles[h];
      if (th.crop && th.prog < 1 && rng.below(0.25)) {
        th.prog -= 0.35;
        if (th.prog <= 0) { th.crop = null; th.prog = 0; st.stats.lost++; }
        hit++;
      }
    }
    if (hit > 0) st.events.push({ t: 'banner', msg: 'Hailstorm! ' + hit + ' crop' + (hit > 1 ? 's' : '') + ' damaged.' });
  }
  var sName = seasonName(st);
  if ((sName === 'spring' || sName === 'summer') && rng.below(0.006)) {
    var tx = rng.int(2, W - 3);
    var wrecked = 0;
    for (var ty = 0; ty < H; ty++) {
      for (var txo = -1; txo <= 1; txo++) {
        var tt = tileAt(st, tx + txo, ty);
        if (!tt) continue;
        if (tt.b) {
          var bid = tt.b;
          for (var bix = st.buildings.length - 1; bix >= 0; bix--) {
            if (st.buildings[bix].id === bid && st.buildings[bix].type !== 'farmhouse') {
              var bb2 = st.buildings.splice(bix, 1)[0];
              for (var ddy = 0; ddy < bb2.h; ddy++) for (var ddx = 0; ddx < bb2.w; ddx++) {
                var cc = tileAt(st, bb2.x + ddx, bb2.y + ddy);
                if (cc) { cc.b = 0; cc.plowed = false; cc.crop = null; }
              }
              wrecked++;
            }
          }
        } else if (tt.crop || tt.plowed) {
          tt.crop = null; tt.plowed = false; tt.prog = 0;
          wrecked++;
        }
      }
    }
    if (wrecked > 0) st.events.push({ t: 'tornado', x: tx, msg: 'Tornado tore through the farm!' });
  }

  /* 6. roll the calendar */
  st.day++;
  if (st.day > SEASON_DAYS) {
    st.day = 1;
    endOfSeason(st, rng);
  } else if (st.season === 1 && st.day >= 6 && !st.fair.active && !st.fair.results) {
    startFair(st, rng);
  }

  st.rs = rng.s;
  return st.events;
}

function endOfSeason(st, rng) {
  var was = st.season;
  /* fair judging at the close of summer */
  if (was === 1 && st.fair.active) judgeFair(st, rng);
  st.season = (st.season + 1) % 4;
  if (st.season === 0) st.year++;
  /* loan interest */
  if (st.loan > 0) {
    var intr = Math.round(st.loan * LOAN_RATE * 100) / 100;
    st.loan = Math.round((st.loan + intr) * 100) / 100;
    st.events.push({ t: 'toast', msg: 'Bank interest: $' + intr.toFixed(0) + ' added to your loan.' });
  }
  /* winter kills field crops; orchards go dormant */
  if (st.season === 3) {
    var killed = 0;
    for (var i = 0; i < TILES; i++) {
      var t = st.tiles[i];
      if (t.crop && !CROPS[t.crop].perennial) {
        t.crop = null; t.prog = 0; t.fert = false; t.pest = 0;
        t.pestDays = 0; t.wilt = 0; t.well = 0; t.ruined = false; t.notified = false;
        killed++; st.stats.lost++;
      }
      t.moisture = Math.min(100, t.moisture + 20);
    }
    if (killed > 0) st.events.push({ t: 'banner', msg: 'Winter came — ' + killed + ' field crop' + (killed > 1 ? 's' : '') + ' died off.' });
  }
  st.events.push({ t: 'season', name: SEASON_NAME[SEASONS[st.season]] });
  /* foreclosure */
  if (st.cash < FORECLOSE_AT) {
    st.over = { reason: 'foreclosure', netWorth: netWorth(st), year: st.year };
    st.events.push({ t: 'over' });
  }
}

/* ---------------- daily scenario ("Today's Valley") ---------------- */
function dailyValley() {
  var d = new Date();
  var seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  var rng = new RNG(seed);
  var w = rollOne(rng, 1, 0);
  var mods = [];
  for (var i = 0; i < CROP_IDS.length; i++) {
    var c = CROP_IDS[i];
    mods.push(c + ':' + (0.85 + rng.next() * 0.3).toFixed(2));
  }
  return { date: d.toDateString(), weather: w, mods: mods };
}

/* ---------------- serialize ---------------- */
function serialize(st) {
  var c = {};
  for (var k in st) if (k !== 'events') c[k] = st[k];
  c.events = [];
  return c;
}

root.GA = {
  W: W, H: H, DAY_LEN: DAY_LEN, SEASON_DAYS: SEASON_DAYS,
  SEASONS: SEASONS, SEASON_NAME: SEASON_NAME,
  CROPS: CROPS, CROP_IDS: CROP_IDS,
  BUILDINGS: BUILDINGS, ANIMALS: ANIMALS, HOME_FOR: HOME_FOR, HOME_CAP: HOME_CAP,
  TOOL_COST: TOOL_COST, LOAN_MAX: LOAN_MAX, LOAN_RATE: LOAN_RATE,
  RIBBONS: RIBBONS,
  newGame: newGame, tileAt: tileAt, dateStr: dateStr, seasonName: seasonName,
  cropStage: cropStage, storageCap: storageCap, storedTotal: storedTotal,
  plowAt: plowAt, plantAt: plantAt, waterAt: waterAt, fertAt: fertAt,
  sprayAt: sprayAt, harvestAt: harvestAt, bulldozeAt: bulldozeAt,
  addStore: addStore, sellCrop: sellCrop,
  borrow: borrow, repay: repay,
  buildAt: buildAt, countHome: countHome, countAnimals: countAnimals,
  buyAnimal: buyAnimal, sellAnimal: sellAnimal,
  startFair: startFair, enterFair: enterFair, judgeFair: judgeFair,
  advanceDay: advanceDay, netWorth: netWorth,
  dailyValley: dailyValley, serialize: serialize
};

})(typeof window !== 'undefined' ? window : globalThis);
