/* Castaway Cove — sim.js (pure logic, zero DOM, node-testable).
 * Global: CC
 * Fish tables, spawn weighting, bite windows, catch resolution,
 * upgrade economy, seeded daily big catch.
 */
(function () {
'use strict';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* FNV-1a 32-bit — stable hash for the daily seed (same worldwide). */
function hashSeed(str) {
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

var ZONES = ['shallows', 'mid', 'deep'];
var RARITIES = ['common', 'uncommon', 'rare', 'legendary'];

/* ~40 species. time: day/night/dawn/dusk/any. weather: clear/rain/fog/any. */
var FISH = [
  /* ---- shallows (14) ---- */
  { id: 'sunbream',        name: 'Sunbream',        zone: 0, rarity: 'common',    coins: 8,   time: ['day'],          weather: ['clear'],        size: 1.0, color: '#e8a34d', lore: 'Sunbathing professionally since forever.' },
  { id: 'pebble-minnow',   name: 'Pebble Minnow',   zone: 0, rarity: 'common',    coins: 5,   time: ['any'],          weather: ['any'],          size: 0.7, color: '#9fb3c8', lore: 'Small, round, and unbothered.' },
  { id: 'reed-perch',      name: 'Reed Perch',      zone: 0, rarity: 'common',    coins: 9,   time: ['day'],          weather: ['clear', 'fog'],  size: 1.1, color: '#7fb069', lore: 'Hides in reeds, judges from reeds.' },
  { id: 'puddle-jumper',   name: 'Puddle Jumper',   zone: 0, rarity: 'common',    coins: 7,   time: ['any'],          weather: ['rain'],         size: 0.8, color: '#6aa8d8', lore: 'Only comes out when the sky cries.' },
  { id: 'glass-shrimp',    name: 'Glass Shrimp',    zone: 0, rarity: 'common',    coins: 6,   time: ['night'],        weather: ['any'],          size: 0.6, color: '#cfe8ef', lore: 'Ninety percent window, ten percent shrimp.' },
  { id: 'cattail-carp',    name: 'Cattail Carp',    zone: 0, rarity: 'common',    coins: 10,  time: ['day'],          weather: ['any'],          size: 1.2, color: '#c98f3d', lore: 'Thinks it is a koi. Almost right.' },
  { id: 'button-crab',     name: 'Button Crab',     zone: 0, rarity: 'common',    coins: 6,   time: ['any'],          weather: ['any'],          size: 0.7, color: '#d86a5a', lore: 'Walks sideways through life, confidently.' },
  { id: 'lily-padder',     name: 'Lily Padder',     zone: 0, rarity: 'common',    coins: 8,   time: ['day'],          weather: ['clear'],        size: 0.9, color: '#8fd18f', lore: 'Naps on lily pads. Dreams of flies.' },
  { id: 'silt-catfish',    name: 'Silt Catfish',    zone: 0, rarity: 'common',    coins: 9,   time: ['night'],        weather: ['rain', 'fog'],  size: 1.2, color: '#8a7f72', lore: 'Whiskers full of secrets, mostly mud.' },
  { id: 'old-bootfish',    name: 'Old Bootfish',    zone: 0, rarity: 'common',    coins: 4,   time: ['any'],          weather: ['rain'],         size: 1.1, color: '#7a5c3e', lore: 'Technically a boot. Spiritually a fish.' },
  { id: 'dawn-koi',        name: 'Dawn Koi',        zone: 0, rarity: 'uncommon',  coins: 28,  time: ['dawn'],         weather: ['clear'],        size: 1.3, color: '#f5d5c0', lore: 'A quiet fish with loud dreams.' },
  { id: 'firefly-tetra',   name: 'Firefly Tetra',   zone: 0, rarity: 'uncommon',  coins: 24,  time: ['night'],        weather: ['clear'],        size: 0.8, color: '#ffe066', lore: 'Blinks in Morse code. Says nothing.' },
  { id: 'willow-eel',      name: 'Willow Eel',      zone: 0, rarity: 'uncommon',  coins: 30,  time: ['dawn','night'], weather: ['fog'],          size: 1.4, color: '#6f8f6a', lore: 'Braids itself through the willow roots.' },
  { id: 'lantern-goby',    name: 'Lantern Goby',    zone: 0, rarity: 'uncommon',  coins: 26,  time: ['night'],        weather: ['any'],          size: 0.9, color: '#ffd166', lore: 'Carries its own nightlight. Polite.' },
  /* ---- mid (14) ---- */
  { id: 'coral-darter',    name: 'Coral Darter',    zone: 1, rarity: 'common',    coins: 14,  time: ['day'],          weather: ['clear'],        size: 1.0, color: '#ef8354', lore: 'Darts first, thinks never.' },
  { id: 'silverfin',       name: 'Silverfin',       zone: 1, rarity: 'common',    coins: 12,  time: ['any'],          weather: ['any'],          size: 1.1, color: '#c0ccd8', lore: 'Shiny enough to see your future.' },
  { id: 'kelp-bass',       name: 'Kelp Bass',       zone: 1, rarity: 'common',    coins: 15,  time: ['day'],          weather: ['any'],          size: 1.3, color: '#5e8c5a', lore: 'The bass of the kelp-forest PTA.' },
  { id: 'barnacle-bream',  name: 'Barnacle Bream',  zone: 1, rarity: 'common',    coins: 11,  time: ['any'],          weather: ['fog'],          size: 1.0, color: '#a89f91', lore: 'Crusty outside, soft inside.' },
  { id: 'moon-jelly',      name: 'Moon Jelly',      zone: 1, rarity: 'uncommon',  coins: 32,  time: ['night'],        weather: ['clear'],        size: 1.2, color: '#dccdf2', lore: 'A ghost that pays rent in glow.' },
  { id: 'ink-squid',       name: 'Ink Squid',       zone: 1, rarity: 'uncommon',  coins: 34,  time: ['night'],        weather: ['any'],          size: 1.2, color: '#5a5a72', lore: 'Writes memoirs. Eats the drafts.' },
  { id: 'prism-wrasse',    name: 'Prism Wrasse',    zone: 1, rarity: 'uncommon',  coins: 36,  time: ['day'],          weather: ['clear'],        size: 1.1, color: '#7ad3d0', lore: 'Refracts compliments, returns rainbows.' },
  { id: 'lanternfish',     name: 'Lanternfish',     zone: 1, rarity: 'uncommon',  coins: 30,  time: ['night'],        weather: ['any'],          size: 1.0, color: '#ffe9a3', lore: 'Commutes with its headlights on.' },
  { id: 'duskwater-sturgeon', name: 'Duskwater Sturgeon', zone: 1, rarity: 'uncommon', coins: 40, time: ['dusk'],    weather: ['any'],          size: 1.6, color: '#8d99ae', lore: 'Old soul, older scales.' },
  { id: 'fog-ray',         name: 'Fog Ray',         zone: 1, rarity: 'rare',      coins: 75,  time: ['any'],          weather: ['fog'],          size: 1.8, color: '#b8c4ce', lore: 'You do not find it. It finds you.' },
  { id: 'thunder-eel',     name: 'Thunder Eel',     zone: 1, rarity: 'rare',      coins: 80,  time: ['any'],          weather: ['rain'],         size: 1.5, color: '#4d6fa5', lore: 'Hums during storms. In key.' },
  { id: 'opal-gourami',    name: 'Opal Gourami',    zone: 1, rarity: 'rare',      coins: 85,  time: ['dawn'],         weather: ['clear'],        size: 1.2, color: '#f4e1f4', lore: 'Wears sunrise like jewelry.' },
  { id: 'drift-singer',    name: 'Drift Singer',    zone: 1, rarity: 'rare',      coins: 90,  time: ['night'],        weather: ['clear'],        size: 1.3, color: '#9db4e8', lore: 'Sings the current to sleep.' },
  { id: 'aurora-koi',      name: 'Aurora Koi',      zone: 1, rarity: 'legendary', coins: 320, time: ['dawn'],         weather: ['clear'],        size: 1.6, color: '#c3f0e8', lore: 'The sky, practicing to be a fish.' },
  /* ---- deep (12) ---- */
  { id: 'gloomfin',        name: 'Gloomfin',        zone: 2, rarity: 'common',    coins: 18,  time: ['night'],        weather: ['any'],          size: 1.2, color: '#4a5568', lore: 'Cheerful, despite everything.' },
  { id: 'anglers-lantern', name: "Angler's Lantern", zone: 2, rarity: 'uncommon', coins: 44,  time: ['night'],        weather: ['any'],          size: 1.1, color: '#ffca7a', lore: 'Fishes for fishermen. Meta.' },
  { id: 'crystal-shrimp',  name: 'Crystal Shrimp',  zone: 2, rarity: 'uncommon',  coins: 42,  time: ['any'],          weather: ['any'],          size: 0.8, color: '#d8f3f5', lore: 'Transparent about its intentions.' },
  { id: 'pebble-dragonet', name: 'Pebble Dragonet', zone: 2, rarity: 'uncommon',  coins: 46,  time: ['any'],          weather: ['fog'],          size: 1.2, color: '#9c8ea8', lore: 'A dragon, if dragons were pebbles.' },
  { id: 'pale-seahorse',   name: 'Pale Seahorse',   zone: 2, rarity: 'uncommon',  coins: 38,  time: ['dawn'],         weather: ['fog'],          size: 0.9, color: '#e8d5c0', lore: 'Upright citizen of the deep.' },
  { id: 'starlight-eel',   name: 'Starlight Eel',   zone: 2, rarity: 'rare',      coins: 110, time: ['night'],        weather: ['clear'],        size: 1.5, color: '#a9b8e8', lore: 'Swims in constellations, briefly.' },
  { id: 'abyssal-grinner', name: 'Abyssal Grinner', zone: 2, rarity: 'rare',      coins: 120, time: ['night'],        weather: ['any'],          size: 1.7, color: '#6b7280', lore: 'Smiles so you do not worry.' },
  { id: 'ghost-octopus',   name: 'Ghost Octopus',   zone: 2, rarity: 'rare',      coins: 130, time: ['night'],        weather: ['fog'],          size: 1.4, color: '#e8e8f0', lore: 'Eight arms, zero worries.' },
  { id: 'crown-jelly',     name: 'Crown Jelly',     zone: 2, rarity: 'rare',      coins: 115, time: ['any'],          weather: ['any'],          size: 1.3, color: '#f2c4de', lore: 'Royalty. Demands nothing. Glows anyway.' },
  { id: 'brine-king',      name: 'Brine King',      zone: 2, rarity: 'rare',      coins: 105, time: ['any'],          weather: ['rain'],         size: 1.4, color: '#7fa8a0', lore: 'Rules a kingdom of salt.' },
  { id: 'gilded-wreckfish', name: 'Gilded Wreckfish', zone: 2, rarity: 'legendary', coins: 420, time: ['any'],       weather: ['any'],          size: 1.8, color: '#e8c15a', lore: 'Ate a treasure chest. Kept the shine.' },
  { id: 'grandfather-trench', name: 'Grandfather Trench', zone: 2, rarity: 'legendary', coins: 500, time: ['night'], weather: ['fog'],          size: 2.2, color: '#5a6b7d', lore: 'Older than the cove. Tired, kind.' }
];

var BY_ID = {};
FISH.forEach(function (f) { BY_ID[f.id] = f; });

/* Daily big-catch pool: rares + legendaries only. */
var BIG_POOL = FISH.filter(function (f) {
  return f.rarity === 'rare' || f.rarity === 'legendary';
});

/* ---------------- upgrades ---------------- */
var UPGRADES = {
  rod:  { name: 'Rod',  desc: 'Wider bite window',     costs: [0, 50, 120, 250, 450] },
  line: { name: 'Line', desc: 'Fish deeper water',     costs: [0, 60, 150, 300, 550] },
  lure: { name: 'Lure', desc: 'Luckier, richer bites', costs: [0, 80, 180, 350, 650] }
};
var MAX_LEVEL = 5;

function upgradeCost(kind, fromLevel) {
  /* cost to go from `fromLevel` to `fromLevel + 1`; null when maxed. */
  if (!UPGRADES[kind] || fromLevel < 1 || fromLevel >= MAX_LEVEL) return null;
  return UPGRADES[kind].costs[fromLevel];
}
function maxLevel() { return MAX_LEVEL; }

/* ---------------- depth ---------------- */
var MAX_DEPTH_BY_LINE = [0, 1.0, 1.7, 2.3, 2.8, 3.4]; /* index = line level 1..5 */
function maxDepthFor(lineLevel) {
  lineLevel = Math.max(1, Math.min(MAX_LEVEL, lineLevel | 0));
  return MAX_DEPTH_BY_LINE[lineLevel];
}
function zoneForDepth(d) { return d < 1 ? 0 : (d < 2 ? 1 : 2); }
function castDepth(holdMs, lineLevel) {
  var maxD = maxDepthFor(lineLevel);
  var frac = Math.max(0, Math.min(1, holdMs / 2500));
  return Math.max(0.15, frac * maxD);
}

/* ---------------- bite ---------------- */
var BITE_BASE = { common: 2600, uncommon: 2100, rare: 1600, legendary: 1100 };
function biteWindowMs(rarity, rodLevel) {
  rodLevel = Math.max(1, Math.min(MAX_LEVEL, rodLevel | 0));
  return (BITE_BASE[rarity] || 2000) + (rodLevel - 1) * 180;
}
function biteDelayMs(rng) { return 2500 + rng() * 4500; } /* 2.5s – 7s */

/* ---------------- spawn ---------------- */
var RARITY_WEIGHT = { common: 58, uncommon: 28, rare: 11, legendary: 2 };

function spawnWeight(f, timeCat, weather, lureLevel, dailyId) {
  var w = RARITY_WEIGHT[f.rarity] || 1;
  var timeOk = f.time.indexOf('any') >= 0 || f.time.indexOf(timeCat) >= 0;
  var wxOk = f.weather.indexOf('any') >= 0 || f.weather.indexOf(weather) >= 0;
  if (!timeOk) w *= 0.15;
  if (!wxOk) w *= 0.3;
  if (f.rarity === 'rare') w *= 1 + 0.30 * (lureLevel - 1);
  if (f.rarity === 'legendary') w *= 1 + 0.40 * (lureLevel - 1);
  if (dailyId && f.id === dailyId) w *= 6; /* the daily big catch is hungry */
  return w;
}

/* opts: {depth, timeCat, weather, lureLevel, dailyId} -> fish object */
function pickFish(rng, opts) {
  opts = opts || {};
  var zone = zoneForDepth(opts.depth == null ? 0.5 : opts.depth);
  var timeCat = opts.timeCat || 'day';
  var weather = opts.weather || 'clear';
  var lureLevel = opts.lureLevel || 1;
  var pool = FISH.filter(function (f) { return f.zone === zone; });
  var total = 0, i, w;
  var weights = pool.map(function (f) {
    w = spawnWeight(f, timeCat, weather, lureLevel, opts.dailyId);
    total += w;
    return w;
  });
  var roll = rng() * total;
  for (i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/* ---------------- catch ---------------- */
var DAILY_MULT = 3;
function catchCoins(fish, lureLevel, isDaily) {
  var v = fish.coins * (1 + 0.08 * ((lureLevel || 1) - 1));
  if (isDaily) v *= DAILY_MULT;
  return Math.round(v);
}

/* opts: {rng, depth, timeCat, weather, upgrades:{rod,line,lure}, dailyId}
   -> {fish, coins, isDaily, biteWindowMs} */
function resolveCatch(opts) {
  var rng = opts.rng;
  var up = opts.upgrades || { rod: 1, line: 1, lure: 1 };
  var fish = pickFish(rng, {
    depth: opts.depth, timeCat: opts.timeCat, weather: opts.weather,
    lureLevel: up.lure, dailyId: opts.dailyId
  });
  var isDaily = !!(opts.dailyId && fish.id === opts.dailyId);
  return {
    fish: fish,
    coins: catchCoins(fish, up.lure, isDaily),
    isDaily: isDaily,
    biteWindowMs: biteWindowMs(fish.rarity, up.rod)
  };
}

/* ---------------- daily big catch (seeded, worldwide) ---------------- */
function dailyBigCatch(dateStr) {
  /* dateStr: "YYYY-MM-DD". Deterministic: same date -> same fish everywhere. */
  var rng = mulberry32(hashSeed('castaway-cove|' + dateStr));
  var f = BIG_POOL[Math.floor(rng() * BIG_POOL.length)];
  return {
    date: dateStr,
    fishId: f.id,
    fish: f,
    value: catchCoins(f, 1, true)
  };
}

/* ---------------- journal + streak (pure helpers) ---------------- */
function journalRecord(journal, fishId, coins) {
  var e = journal[fishId] || { count: 0, biggest: 0 };
  e.count += 1;
  if (coins > e.biggest) e.biggest = coins;
  journal[fishId] = e;
  return e;
}
function yesterdayOf(dateStr) {
  var p = String(dateStr).split('-');
  var d = new Date(+p[0], (+p[1]) - 1, +p[2]);
  d.setDate(d.getDate() - 1);
  var m = '' + (d.getMonth() + 1), dd = '' + d.getDate();
  return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (dd.length < 2 ? '0' + dd : dd);
}
function nextStreak(streak, todayStr) {
  streak = streak || { last: null, count: 0 };
  if (streak.last === todayStr) return { last: streak.last, count: streak.count };
  var cont = streak.last === yesterdayOf(todayStr);
  return { last: todayStr, count: cont ? streak.count + 1 : 1 };
}

var CC = {
  mulberry32: mulberry32,
  hashSeed: hashSeed,
  FISH: FISH,
  BY_ID: BY_ID,
  BIG_POOL: BIG_POOL,
  ZONES: ZONES,
  RARITIES: RARITIES,
  UPGRADES: UPGRADES,
  maxLevel: maxLevel,
  upgradeCost: upgradeCost,
  maxDepthFor: maxDepthFor,
  zoneForDepth: zoneForDepth,
  castDepth: castDepth,
  biteWindowMs: biteWindowMs,
  biteDelayMs: biteDelayMs,
  spawnWeight: spawnWeight,
  pickFish: pickFish,
  catchCoins: catchCoins,
  resolveCatch: resolveCatch,
  dailyBigCatch: dailyBigCatch,
  DAILY_MULT: DAILY_MULT,
  journalRecord: journalRecord,
  yesterdayOf: yesterdayOf,
  nextStreak: nextStreak
};

if (typeof module !== 'undefined' && module.exports) module.exports = CC;
else this.CC = CC;
}).call(typeof window !== 'undefined' ? window : this);
