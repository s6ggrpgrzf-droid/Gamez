/* Castaway Cove REMAKE — sim.js (pure logic, zero DOM, node-testable).
 * Global: CC
 * Inlined data (authoritative: fish-data.js): 42 fish, LEGEND_COND, RUMORS,
 * SPOTS, AQUA_RATE/AQUA_MAX/AQUA_CAP_H.
 * Systems: spots+licenses, spawn weighting, visible targeting, nibbles,
 * reel sessions, catch quality, records, rumors, aquarium, upgrades,
 * seeded daily big catch, journal/streak helpers, v1 -> v2 migration.
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

/* ---------------- inlined fish data (from fish-data.js) ---------------- */
var FISH = [
/* ---------------- sunny-cove (14) ---------------- */
{id:'sunbream', name:'Sunbream', spots:['sunny-cove'], zone:0, rarity:'common', behavior:'steady', coins:8, time:['day'], weather:['clear'], size:1.0, color:'#e8a34d', pun:'I caught a sunbream! It\'s ray-diant!', lore:'Sunbathing professionally since forever.'},
{id:'pebble-minnow', name:'Pebble Minnow', spots:['sunny-cove'], zone:0, rarity:'common', behavior:'nibbler', coins:5, time:['any'], weather:['any'], size:0.7, color:'#9fb3c8', pun:'I caught a pebble minnow! Small but boulder!', lore:'Small, round, and unbothered.'},
{id:'reed-perch', name:'Reed Perch', spots:['sunny-cove','misty-marsh'], zone:0, rarity:'common', behavior:'steady', coins:9, time:['day'], weather:['clear','fog'], size:1.1, color:'#7fb069', pun:'I caught a reed perch! Outstanding in its field!', lore:'Hides in reeds, judges from reeds.'},
{id:'lily-padder', name:'Lily Padder', spots:['sunny-cove'], zone:0, rarity:'common', behavior:'nibbler', coins:8, time:['day'], weather:['clear'], size:0.9, color:'#8fd18f', pun:'I caught a lily padder! Just hopping by!', lore:'Naps on lily pads. Dreams of flies.'},
{id:'cattail-carp', name:'Cattail Carp', spots:['sunny-cove'], zone:0, rarity:'common', behavior:'steady', coins:10, time:['day'], weather:['any'], size:1.2, color:'#c98f3d', pun:'I caught a cattail carp! The tail wags the fish!', lore:'Thinks it is a koi. Almost right.'},
{id:'dawn-koi', name:'Dawn Koi', spots:['sunny-cove'], zone:0, rarity:'uncommon', behavior:'steady', coins:28, time:['dawn'], weather:['clear'], size:1.3, color:'#f5d5c0', pun:'I caught a dawn koi! Rise and shine!', lore:'A quiet fish with loud dreams.'},
{id:'button-crab', kind:'crab', name:'Button Crab', spots:['sunny-cove'], zone:0, rarity:'common', behavior:'nibbler', coins:6, time:['any'], weather:['any'], size:0.7, color:'#d86a5a', pun:'I caught a button crab! It\'s pushing my buttons!', lore:'Walks sideways through life, confidently.'},
{id:'coral-darter', name:'Coral Darter', spots:['sunny-cove'], zone:1, rarity:'common', behavior:'darter', coins:14, time:['day'], weather:['clear'], size:1.0, color:'#ef8354', pun:'I caught a coral darter! Blink and you\'ll miss it!', lore:'Darts first, thinks never.'},
{id:'silverfin', name:'Silverfin', spots:['sunny-cove','moonlit-pier'], zone:1, rarity:'common', behavior:'steady', coins:12, time:['any'], weather:['any'], size:1.1, color:'#c0ccd8', pun:'I caught a silverfin! Shiny and proud!', lore:'Shiny enough to see your future.'},
{id:'kelp-bass', name:'Kelp Bass', spots:['sunny-cove'], zone:1, rarity:'common', behavior:'steady', coins:15, time:['day'], weather:['any'], size:1.3, color:'#5e8c5a', pun:'I caught a kelp bass! What a catch — literally!', lore:'The bass of the kelp-forest PTA.'},
{id:'prism-wrasse', name:'Prism Wrasse', spots:['sunny-cove'], zone:1, rarity:'uncommon', behavior:'darter', coins:36, time:['day'], weather:['clear'], size:1.1, color:'#7ad3d0', pun:'I caught a prism wrasse! What a colorful character!', lore:'Refracts compliments, returns rainbows.'},
{id:'firefly-tetra', name:'Firefly Tetra', spots:['sunny-cove'], zone:0, rarity:'uncommon', behavior:'darter', coins:24, time:['night'], weather:['clear'], size:0.8, color:'#ffe066', pun:'I caught a firefly tetra! It\'s glowing with pride!', lore:'Blinks in Morse code. Says nothing.'},
{id:'opal-gourami', name:'Opal Gourami', spots:['sunny-cove'], zone:1, rarity:'rare', behavior:'steady', coins:85, time:['dawn'], weather:['clear'], size:1.2, color:'#f4e1f4', pun:'I caught an opal gourami! A real gem!', lore:'Wears sunrise like jewelry.'},
{id:'aurora-koi', name:'Aurora Koi', spots:['sunny-cove'], zone:1, rarity:'legendary', behavior:'steady', coins:320, time:['dawn'], weather:['clear'], size:1.6, color:'#c3f0e8', pun:'I caught an AURORA KOI! The sky is jealous!', lore:'The sky, practicing to be a fish.'},
/* ---------------- misty-marsh (13) ---------------- */
{id:'puddle-jumper', name:'Puddle Jumper', spots:['misty-marsh'], zone:0, rarity:'common', behavior:'darter', coins:7, time:['any'], weather:['rain'], size:0.8, color:'#6aa8d8', pun:'I caught a puddle jumper! It made quite a splash!', lore:'Only comes out when the sky cries.'},
{id:'silt-catfish', name:'Silt Catfish', spots:['misty-marsh'], zone:0, rarity:'common', behavior:'lurker', coins:9, time:['night'], weather:['rain','fog'], size:1.2, color:'#8a7f72', pun:'I caught a silt catfish! It\'s feline fine!', lore:'Whiskers full of secrets, mostly mud.'},
{id:'old-bootfish', name:'Old Bootfish', spots:['misty-marsh'], zone:0, rarity:'common', behavior:'nibbler', coins:4, time:['any'], weather:['rain'], size:1.1, color:'#7a5c3e', pun:'I caught an old bootfish! What a load of footwear!', lore:'Technically a boot. Spiritually a fish.'},
{id:'barnacle-bream', name:'Barnacle Bream', spots:['misty-marsh'], zone:1, rarity:'common', behavior:'nibbler', coins:11, time:['any'], weather:['fog'], size:1.0, color:'#a89f91', pun:'I caught a barnacle bream! It\'s stuck on me!', lore:'Crusty outside, soft inside.'},
{id:'fog-ray', kind:'ray', name:'Fog Ray', spots:['misty-marsh'], zone:1, rarity:'rare', behavior:'steady', coins:75, time:['any'], weather:['fog'], size:1.8, color:'#b8c4ce', pun:'I caught a fog ray! A ray of... fog!', lore:'You do not find it. It finds you.'},
{id:'thunder-eel', kind:'eel', name:'Thunder Eel', spots:['misty-marsh'], zone:1, rarity:'rare', behavior:'darter', coins:80, time:['any'], weather:['rain'], size:1.5, color:'#4d6fa5', pun:'I caught a thunder eel! Absolutely shocking!', lore:'Hums during storms. In key.'},
{id:'willow-eel', kind:'eel', name:'Willow Eel', spots:['misty-marsh'], zone:0, rarity:'uncommon', behavior:'steady', coins:30, time:['dawn','night'], weather:['fog'], size:1.4, color:'#6f8f6a', pun:'I caught a willow eel! Long time no sea!', lore:'Braids itself through the willow roots.'},
{id:'pebble-dragonet', name:'Pebble Dragonet', spots:['misty-marsh'], zone:2, rarity:'uncommon', behavior:'steady', coins:46, time:['any'], weather:['fog'], size:1.2, color:'#9c8ea8', pun:'I caught a pebble dragonet! A tiny terror!', lore:'A dragon, if dragons were pebbles.'},
{id:'pale-seahorse', kind:'seahorse', name:'Pale Seahorse', spots:['misty-marsh'], zone:2, rarity:'uncommon', behavior:'steady', coins:38, time:['dawn'], weather:['fog'], size:0.9, color:'#e8d5c0', pun:'I caught a pale seahorse! Swim, don\'t neigh!', lore:'Upright citizen of the deep.'},
{id:'glass-shrimp', kind:'shrimp', name:'Glass Shrimp', spots:['misty-marsh'], zone:0, rarity:'common', behavior:'nibbler', coins:6, time:['night'], weather:['any'], size:0.6, color:'#cfe8ef', pun:'I caught a glass shrimp! I see right through it!', lore:'Ninety percent window, ten percent shrimp.'},
{id:'lantern-goby', name:'Lantern Goby', spots:['misty-marsh'], zone:0, rarity:'uncommon', behavior:'steady', coins:26, time:['night'], weather:['any'], size:0.9, color:'#ffd166', pun:'I caught a lantern goby! Light of my life!', lore:'Carries its own nightlight. Polite.'},
{id:'lanternfish', name:'Lanternfish', spots:['misty-marsh','moonlit-pier'], zone:1, rarity:'uncommon', behavior:'steady', coins:30, time:['night'], weather:['any'], size:1.0, color:'#ffe9a3', pun:'I caught a lanternfish! It\'s lit!', lore:'Commutes with its headlights on.'},
{id:'grandfather-trench', name:'Grandfather Trench', spots:['misty-marsh'], zone:2, rarity:'legendary', behavior:'lurker', coins:500, time:['any'], weather:['fog'], size:2.2, color:'#5a6b7d', pun:'I caught GRANDFATHER TRENCH! Respect your elders!', lore:'Older than the cove. Tired, kind.'},
/* ---------------- moonlit-pier (15) ---------------- */
{id:'moon-jelly', kind:'jelly', name:'Moon Jelly', spots:['moonlit-pier'], zone:1, rarity:'uncommon', behavior:'steady', coins:32, time:['night'], weather:['clear'], size:1.2, color:'#dccdf2', pun:'I caught a moon jelly! Over the moon!', lore:'A ghost that pays rent in glow.'},
{id:'ink-squid', kind:'squid', name:'Ink Squid', spots:['moonlit-pier'], zone:1, rarity:'uncommon', behavior:'steady', coins:34, time:['night'], weather:['any'], size:1.2, color:'#5a5a72', pun:'I caught an ink squid! A real character!', lore:'Writes memoirs. Eats the drafts.'},
{id:'drift-singer', name:'Drift Singer', spots:['moonlit-pier'], zone:1, rarity:'rare', behavior:'darter', coins:90, time:['night'], weather:['clear'], size:1.3, color:'#9db4e8', pun:'I caught a drift singer! It\'s got pipes!', lore:'Sings the current to sleep.'},
{id:'duskwater-sturgeon', name:'Duskwater Sturgeon', spots:['moonlit-pier'], zone:1, rarity:'uncommon', behavior:'lurker', coins:40, time:['dusk'], weather:['any'], size:1.6, color:'#8d99ae', pun:'I caught a duskwater sturgeon! A general of the dusk!', lore:'Old soul, older scales.'},
{id:'anglers-lantern', name:'Angler\'s Lantern', spots:['moonlit-pier'], zone:2, rarity:'uncommon', behavior:'lurker', coins:44, time:['night'], weather:['any'], size:1.1, color:'#ffca7a', pun:'I caught an angler\'s lantern! The tables have turned!', lore:'Fishes for fishermen. Meta.'},
{id:'crystal-shrimp', kind:'shrimp', name:'Crystal Shrimp', spots:['moonlit-pier'], zone:2, rarity:'uncommon', behavior:'nibbler', coins:42, time:['any'], weather:['any'], size:0.8, color:'#d8f3f5', pun:'I caught a crystal shrimp! Crystal-clear victory!', lore:'Transparent about its intentions.'},
{id:'starlight-eel', kind:'eel', name:'Starlight Eel', spots:['moonlit-pier'], zone:2, rarity:'rare', behavior:'darter', coins:110, time:['night'], weather:['clear'], size:1.5, color:'#a9b8e8', pun:'I caught a starlight eel! A star is born!', lore:'Swims in constellations, briefly.'},
{id:'abyssal-grinner', name:'Abyssal Grinner', spots:['moonlit-pier'], zone:2, rarity:'rare', behavior:'lurker', coins:120, time:['night'], weather:['any'], size:1.7, color:'#6b7280', pun:'I caught an abyssal grinner! Smile for the camera!', lore:'Smiles so you do not worry.'},
{id:'ghost-octopus', kind:'octopus', name:'Ghost Octopus', spots:['moonlit-pier'], zone:2, rarity:'rare', behavior:'steady', coins:130, time:['any'], weather:['fog'], size:1.4, color:'#e8e8f0', pun:'I caught a ghost octopus! Boo! I mean... woo!', lore:'Eight arms, zero worries.'},
{id:'crown-jelly', kind:'jelly', name:'Crown Jelly', spots:['moonlit-pier'], zone:2, rarity:'rare', behavior:'steady', coins:115, time:['any'], weather:['any'], size:1.3, color:'#f2c4de', pun:'I caught a crown jelly! All hail!', lore:'Royalty. Demands nothing. Glows anyway.'},
{id:'brine-king', name:'Brine King', spots:['moonlit-pier'], zone:2, rarity:'rare', behavior:'lurker', coins:105, time:['any'], weather:['rain'], size:1.4, color:'#7fa8a0', pun:'I caught a brine king! Long may it reign!', lore:'Rules a kingdom of salt.'},
{id:'gloomfin', name:'Gloomfin', spots:['moonlit-pier'], zone:2, rarity:'common', behavior:'lurker', coins:18, time:['night'], weather:['any'], size:1.2, color:'#4a5568', pun:'I caught a gloomfin! Cheer up, little guy!', lore:'Cheerful, despite everything.'},
{id:'gilded-wreckfish', name:'Gilded Wreckfish', spots:['moonlit-pier'], zone:2, rarity:'legendary', behavior:'steady', coins:420, time:['any'], weather:['any'], size:1.8, color:'#e8c15a', pun:'I caught a GILDED WRECKFISH! Treasure? Hardly know her!', lore:'Ate a treasure chest. Kept the shine.'},
{id:'tidepool-crab', kind:'crab', name:'Tidepool Crab', spots:['moonlit-pier'], zone:0, rarity:'common', behavior:'nibbler', coins:7, time:['night'], weather:['any'], size:0.7, color:'#d8a0a0', pun:'I caught a tidepool crab! It\'s claw-some!', lore:'Pinches first, asks later.'},
{id:'night-bass', name:'Night Bass', spots:['moonlit-pier'], zone:1, rarity:'common', behavior:'steady', coins:13, time:['night'], weather:['any'], size:1.2, color:'#4a6b5a', pun:'I caught a night bass! It\'s a real night owl... fish!', lore:'Sings bass. Obviously.'}
];

/* Legendary hunt conditions (discoverable via Marlow's rumors). */
var LEGEND_COND = {
  'aurora-koi':         { spot:'sunny-cove',   time:['dawn'],  weather:['clear'] },
  'grandfather-trench': { spot:'misty-marsh',  time:['any'],   weather:['fog'] },
  'gilded-wreckfish':   { spot:'moonlit-pier', time:['night'], weather:['any'] }
};

/* Marlow's rumors: 3 escalating hints per legendary. costs in coins. */
var RUMORS = {
  'aurora-koi': [
    { cost: 50,  text: 'Marlow leans in: "Something shimmers at the edge of morning, friend. Before the sun\'s properly up."' },
    { cost: 150, text: 'Marlow whispers: "Clear dawns. Not a cloud. That\'s when the sky practices being a fish."' },
    { cost: 300, text: 'Marlow slides you a map: "Aurora Koi. Sunny Cove. Dawn. Clear skies. Tell no one. ...Tell everyone."' }
  ],
  'grandfather-trench': [
    { cost: 50,  text: 'Marlow shivers: "Down in the marsh, when the fog\'s thick as soup... something old moves."' },
    { cost: 150, text: 'Marlow mutters: "The fog\'s the key. It only rises when the marsh disappears."' },
    { cost: 300, text: 'Marlow grips your shoulder: "Grandfather Trench. Misty Marsh. Fog. Any hour. Bring respect."' }
  ],
  'gilded-wreckfish': [
    { cost: 50,  text: 'Marlow grins, gold tooth flashing: "The pier at night, eh? Things glow down there that shouldn\'t."' },
    { cost: 150, text: 'Marlow taps the counter: "Night dives. Moonlit Pier. Follow the glints."' },
    { cost: 300, text: 'Marlow winks: "Gilded Wreckfish. Moonlit Pier. Night. It ate a treasure chest once. Kept the shine."' }
  ]
};

/* Spots: id, name, license cost (0 = open), tagline, palette key. */
var SPOTS = [
  { id:'sunny-cove',   name:'Sunny Cove',   license:0,    tagline:'Where it all began. Warm water, easy fish.',
    palette:{ sky:['#f9d9a8','#f2a988','#c98aa0'], water:['#8fc3d8','#5d9dbd','#2f6a8f'] } },
  { id:'misty-marsh',  name:'Misty Marsh',  license:800,  tagline:'Fog, reeds, and things that hum in the rain.',
    palette:{ sky:['#cfd8c8','#aebfae','#7e8f86'], water:['#7fa8a0','#5d8a84','#3a5f5c'] } },
  { id:'moonlit-pier', name:'Moonlit Pier', license:2500, tagline:'Night water, deep water. Bring a lantern.',
    palette:{ sky:['#0e1a33','#1c2c4e','#3a4a63'], water:['#2c3e57','#20344c','#101c2e'] } }
];

/* Aquarium: coins per hour by rarity. Tank holds 6. Offline cap 8h. */
var AQUA_RATE = { common: 2, uncommon: 5, rare: 12, legendary: 30 };
var AQUA_MAX = 6, AQUA_CAP_H = 8;

var BY_ID = {};
FISH.forEach(function (f) { BY_ID[f.id] = f; });
var SPOT_BY_ID = {};
SPOTS.forEach(function (s) { SPOT_BY_ID[s.id] = s; });

var ZONES = ['shallows', 'mid', 'deep'];
var RARITIES = ['common', 'uncommon', 'rare', 'legendary'];

/* Daily big-catch pool: rares + legendaries across all spots. */
var BIG_POOL = FISH.filter(function (f) {
  return f.rarity === 'rare' || f.rarity === 'legendary';
});
var DAILY_MULT = 3;

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

/* ---------------- spots & licenses ---------------- */
function spotFish(spotId) {
  return FISH.filter(function (f) { return f.spots.indexOf(spotId) >= 0; });
}
function canAccess(spotId, save) {
  var s = SPOT_BY_ID[spotId];
  if (!s) return false;
  if (s.license === 0) return true; /* Sunny Cove is always open */
  return !!(save && save.licenses && save.licenses[spotId]);
}
function buyLicense(save, spotId) {
  var s = SPOT_BY_ID[spotId];
  if (!s) return { ok: false, reason: 'unknown' };
  if (s.license === 0) return { ok: true }; /* already free */
  save.licenses = save.licenses || {};
  if (save.licenses[spotId]) return { ok: false, reason: 'owned' };
  if ((save.coins || 0) < s.license) return { ok: false, reason: 'broke' };
  save.coins -= s.license;
  save.licenses[spotId] = true;
  return { ok: true };
}

/* ---------------- spawn weighting & targeting ---------------- */
var RARITY_WEIGHT = { common: 58, uncommon: 28, rare: 11, legendary: 2 };

function condMatches(cond, spotId, timeCat, weather) {
  var spotOk = !spotId || cond.spot === spotId;
  var tOk = cond.time.indexOf('any') >= 0 || cond.time.indexOf(timeCat) >= 0;
  var wOk = cond.weather.indexOf('any') >= 0 || cond.weather.indexOf(weather) >= 0;
  return spotOk && tOk && wOk;
}

/* opts: {spotId, timeCat, weather, lureLevel, dailyId} -> number */
function spawnWeight(f, opts) {
  opts = opts || {};
  var timeCat = opts.timeCat || 'day';
  var weather = opts.weather || 'clear';
  var lureLevel = Math.max(1, opts.lureLevel || 1);
  var w = RARITY_WEIGHT[f.rarity] || 1;
  var timeOk = f.time.indexOf('any') >= 0 || f.time.indexOf(timeCat) >= 0;
  var wxOk = f.weather.indexOf('any') >= 0 || f.weather.indexOf(weather) >= 0;
  if (!timeOk) w *= 0.15;
  if (!wxOk) w *= 0.3;
  if (f.rarity === 'rare') w *= 1 + 0.30 * (lureLevel - 1);
  if (f.rarity === 'legendary') w *= 1 + 0.40 * (lureLevel - 1);
  var cond = LEGEND_COND[f.id];
  if (cond && f.rarity === 'legendary' && condMatches(cond, opts.spotId, timeCat, weather)) {
    w *= 20; /* the legendary is out hunting under its conditions */
  }
  if (opts.dailyId && f.id === opts.dailyId) w *= 6; /* the daily big catch is hungry */
  return w;
}

/* opts: {spotId, targetId, depth, timeCat, weather, lureLevel, dailyId} -> fish */
function pickFish(rng, opts) {
  opts = opts || {};
  var spotId = opts.spotId || 'sunny-cove';
  var zone = zoneForDepth(opts.depth == null ? 0.5 : opts.depth);
  var pool = spotFish(spotId);
  /* Depth gate: only fish that live in the cast zone. If this spot has no
   * fish at that zone (e.g. zone 2 at Sunny Cove), fall back to the nearest
   * zone that does — the player still catches something. */
  var zoned = pool.filter(function (f) { return f.zone === zone; });
  if (!zoned.length) {
    var z, i;
    for (z = zone - 1; z >= 0 && !zoned.length; z--) {
      zoned = pool.filter(function (f) { return f.zone === z; });
    }
    for (z = zone + 1; z <= 2 && !zoned.length; z++) {
      zoned = pool.filter(function (f) { return f.zone === z; });
    }
    if (zoned.length) pool = zoned;
    else pool = FISH; /* unknown spot: never crash */
  } else {
    pool = zoned;
  }
  var total = 0, i, w;
  var weights = pool.map(function (f) {
    w = spawnWeight(f, {
      spotId: spotId, timeCat: opts.timeCat, weather: opts.weather,
      lureLevel: opts.lureLevel, dailyId: opts.dailyId
    });
    if (opts.targetId && f.id === opts.targetId) w *= 8; /* visible targeting */
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

/* ---------------- nibbles & reel session (per-fish personality) ---------------- */
var NIBBLE_MIN = { darter: 1, lurker: 0, nibbler: 2, steady: 1 };
var NIBBLE_MAX = { darter: 2, lurker: 1, nibbler: 4, steady: 3 };

/* -> {nibbles} — fake-out nibbles before the real bite */
function nibblePlan(rng, fish) {
  var b = fish.behavior || 'steady';
  var lo = NIBBLE_MIN[b] != null ? NIBBLE_MIN[b] : 1;
  var hi = NIBBLE_MAX[b] != null ? NIBBLE_MAX[b] : 3;
  return { nibbles: lo + Math.floor(rng() * (hi - lo + 1)) };
}

var PULL_MIN = { darter: 4, lurker: 2, nibbler: 3, steady: 3 };
var PULL_MAX = { darter: 5, lurker: 3, nibbler: 3, steady: 3 };

/* -> [{at, dur}] pull events in ms: tap-and-hold in time with the fish */
function reelSession(rng, fish) {
  var b = fish.behavior || 'steady';
  var lo = PULL_MIN[b] != null ? PULL_MIN[b] : 3;
  var hi = PULL_MAX[b] != null ? PULL_MAX[b] : 3;
  var n = lo + Math.floor(rng() * (hi - lo + 1));
  if (fish.rarity === 'legendary') n += 1;
  var pulls = [];
  var at = Math.round(500 + rng() * 200); /* first pull ~600ms in */
  for (var i = 0; i < n; i++) {
    pulls.push({ at: at, dur: Math.round(600 + rng() * 300) }); /* 600-900ms */
    at += Math.round(700 + rng() * 900); /* pulls 700-1600ms apart */
  }
  return pulls;
}

/* ---------------- catch quality ---------------- */
/* results: array of 'gentle'|'rough' per pull -> 1|2|3 stars */
function scoreQuality(results) {
  results = results || [];
  var gentle = results.filter(function (r) { return r === 'gentle'; }).length;
  if (gentle === results.length) return 3; /* all gentle: patient reeling */
  if (gentle * 2 >= results.length) return 2; /* at least half gentle */
  return 1;
}
function qualityMult(q) {
  var m = { 1: 1, 2: 1.25, 3: 1.5 }[q];
  return m == null ? 1 : m;
}

/* ---------------- catch resolution ---------------- */
function catchSize(rng, fish) {
  /* cm, one decimal */
  return Math.round(fish.size * (14 + rng() * 10) * 10) / 10;
}

/* per-species personal best (biggest size in cm). Returns true on new record. */
function checkRecord(journal, fishId, sizeCm) {
  var e = journal[fishId] || { count: 0, biggest: 0 };
  var isNew = e.record == null || sizeCm > e.record;
  if (isNew) e.record = sizeCm;
  journal[fishId] = e;
  return isNew;
}

function coinsFor(fish, quality, lureLevel, isDaily) {
  var v = fish.coins * qualityMult(quality) * (1 + 0.08 * ((lureLevel || 1) - 1));
  if (isDaily) v *= DAILY_MULT;
  return Math.round(v);
}

/* Legacy helper (v1 signature): base coins, no quality axis. */
function catchCoins(fish, lureLevel, isDaily) {
  return coinsFor(fish, 1, lureLevel, isDaily);
}

/* opts: {rng, spotId, targetId, depth, timeCat, weather, upgrades, dailyId}
   -> {fish, sizeCm, isDaily, biteWindowMs, reelPulls}
   (NOT coins/quality — those need the player's reel input.) */
function resolveCatch(opts) {
  opts = opts || {};
  var rng = opts.rng;
  var up = opts.upgrades || { rod: 1, line: 1, lure: 1 };
  var fish = pickFish(rng, {
    spotId: opts.spotId, targetId: opts.targetId, depth: opts.depth,
    timeCat: opts.timeCat, weather: opts.weather,
    lureLevel: up.lure, dailyId: opts.dailyId
  });
  var isDaily = !!(opts.dailyId && fish.id === opts.dailyId);
  return {
    fish: fish,
    sizeCm: catchSize(rng, fish),
    isDaily: isDaily,
    biteWindowMs: biteWindowMs(fish.rarity, fish.behavior, up.rod),
    reelPulls: reelSession(rng, fish)
  };
}

/* {fish, sizeCm, pullResults, lureLevel, isDaily} -> {coins, quality} */
function finishCatch(o) {
  o = o || {};
  var quality = scoreQuality(o.pullResults);
  return { coins: coinsFor(o.fish, quality, o.lureLevel, o.isDaily), quality: quality };
}

/* ---------------- bite window ---------------- */
var BITE_BASE = { common: 2600, uncommon: 2100, rare: 1600, legendary: 1100 };
var BITE_BEHAVIOR_MULT = { darter: 0.8, lurker: 1.25 }; /* else 1.0 */

function biteWindowMs(rarity, behavior, rodLevel) {
  var base = BITE_BASE[rarity] || 2000;
  var mult = BITE_BEHAVIOR_MULT[behavior] || 1.0;
  rodLevel = Math.max(1, Math.min(MAX_LEVEL, rodLevel | 0 || 1));
  var w = base * mult + (rodLevel - 1) * 180;
  return Math.max(900, Math.round(w)); /* never tighter than 900ms */
}
function biteDelayMs(rng) { return 2500 + rng() * 4500; } /* 2.5s – 7s */

/* ---------------- Marlow's rumors ---------------- */
/* Buys the next unbought rumor for a legendary. Mutates save.coins + save.rumors[id]. */
function buyRumor(save, legendaryId) {
  var list = RUMORS[legendaryId];
  if (!list) return { ok: false, reason: 'unknown' };
  save.rumors = save.rumors || {};
  var idx = save.rumors[legendaryId] || 0;
  if (idx >= list.length) return { ok: false, reason: 'maxed' };
  var cost = list[idx].cost;
  if ((save.coins || 0) < cost) return { ok: false, reason: 'broke' };
  save.coins -= cost;
  save.rumors[legendaryId] = idx + 1;
  return { ok: true, text: list[idx].text, cost: cost, idx: idx };
}

/* ---------------- aquarium ---------------- */
function aquariumAdd(save, fishId) {
  if (!BY_ID[fishId]) return { ok: false, reason: 'unknown' };
  save.aqua = save.aqua || { tank: [], lastCollect: 0 };
  if (save.aqua.tank.length >= AQUA_MAX) return { ok: false, reason: 'full' };
  if (save.aqua.tank.indexOf(fishId) >= 0) return { ok: false, reason: 'duplicate' };
  save.aqua.tank.push(fishId);
  return { ok: true };
}
function aquariumRemove(save, fishId) {
  save.aqua = save.aqua || { tank: [], lastCollect: 0 };
  var i = save.aqua.tank.indexOf(fishId);
  if (i < 0) return { ok: false, reason: 'absent' };
  save.aqua.tank.splice(i, 1);
  return { ok: true };
}
/* Passive coins: per-hour rates by rarity, capped at AQUA_CAP_H hours.
 * Mutates save.aqua.lastCollect; returns coins earned (int). */
function aquariumTick(save, nowMs) {
  save.aqua = save.aqua || { tank: [], lastCollect: nowMs };
  var last = save.aqua.lastCollect || nowMs;
  var elapsedH = Math.max(0, (nowMs - last) / 3600000);
  var cappedH = Math.min(elapsedH, AQUA_CAP_H);
  var perHour = 0;
  save.aqua.tank.forEach(function (id) {
    var f = BY_ID[id];
    if (f) perHour += AQUA_RATE[f.rarity] || 0;
  });
  var coins = Math.floor(cappedH * perHour);
  save.aqua.lastCollect = nowMs;
  return coins;
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
    value: coinsFor(f, 1, 1, true) /* same value as v1: base coins x3 */
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

/* ---------------- v1 -> v2 migration ---------------- */
function cloneVal(o) {
  if (o == null) return o;
  return JSON.parse(JSON.stringify(o));
}
function migrateV1(v1) {
  v1 = v1 || {};
  var up = { rod: 1, line: 1, lure: 1 };
  if (v1.up) {
    ['rod', 'line', 'lure'].forEach(function (k) {
      var lv = v1.up[k] | 0;
      up[k] = Math.max(1, Math.min(MAX_LEVEL, lv || 1));
    });
  }
  return {
    v: 2,
    coins: v1.coins || 0,
    up: up,
    journal: v1.journal ? cloneVal(v1.journal) : {},
    streak: v1.streak ? cloneVal(v1.streak) : { last: null, count: 0 },
    daily: v1.daily ? cloneVal(v1.daily) : { date: null, fishId: null, caught: false },
    lore: v1.lore ? cloneVal(v1.lore) : {},
    best: v1.best || 0,
    muted: !!v1.muted,
    seenHelp: !!v1.seenHelp,
    spot: 'sunny-cove',
    licenses: { 'misty-marsh': false, 'moonlit-pier': false },
    aqua: { tank: [], lastCollect: Date.now() },
    rumors: {},
    dailyBest: v1.dailyBest ? cloneVal(v1.dailyBest) : { date: null, value: 0 },
    arcadeSent: v1.arcadeSent ? cloneVal(v1.arcadeSent) : { date: null, value: 0 }
  };
}

var CC = {
  mulberry32: mulberry32,
  hashSeed: hashSeed,
  FISH: FISH,
  BY_ID: BY_ID,
  SPOTS: SPOTS,
  BIG_POOL: BIG_POOL,
  ZONES: ZONES,
  RARITIES: RARITIES,
  UPGRADES: UPGRADES,
  RARITY_WEIGHT: RARITY_WEIGHT,
  RUMORS: RUMORS,
  LEGEND_COND: LEGEND_COND,
  AQUA_RATE: AQUA_RATE,
  AQUA_MAX: AQUA_MAX,
  AQUA_CAP_H: AQUA_CAP_H,
  maxLevel: maxLevel,
  upgradeCost: upgradeCost,
  maxDepthFor: maxDepthFor,
  zoneForDepth: zoneForDepth,
  castDepth: castDepth,
  canAccess: canAccess,
  buyLicense: buyLicense,
  spotFish: spotFish,
  spawnWeight: spawnWeight,
  pickFish: pickFish,
  nibblePlan: nibblePlan,
  reelSession: reelSession,
  scoreQuality: scoreQuality,
  qualityMult: qualityMult,
  catchSize: catchSize,
  checkRecord: checkRecord,
  coinsFor: coinsFor,
  catchCoins: catchCoins,
  resolveCatch: resolveCatch,
  finishCatch: finishCatch,
  biteWindowMs: biteWindowMs,
  biteDelayMs: biteDelayMs,
  buyRumor: buyRumor,
  aquariumAdd: aquariumAdd,
  aquariumRemove: aquariumRemove,
  aquariumTick: aquariumTick,
  dailyBigCatch: dailyBigCatch,
  DAILY_MULT: DAILY_MULT,
  journalRecord: journalRecord,
  yesterdayOf: yesterdayOf,
  nextStreak: nextStreak,
  migrateV1: migrateV1
};

if (typeof module !== 'undefined' && module.exports) module.exports = CC;
else this.CC = CC;
}).call(typeof window !== 'undefined' ? window : this);
