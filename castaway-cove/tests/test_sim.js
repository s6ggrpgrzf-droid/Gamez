/* Castaway Cove headless tests — run with: node tests/test_sim.js */
'use strict';
var assert = require('assert');
var CC = require('../sim.js');

var passed = 0;
function t(name, fn) {
  try { fn(); passed++; /* console.log('ok - ' + name); */ }
  catch (e) { console.error('FAIL: ' + name + '\n  ' + e.message); process.exitCode = 1; }
}

/* ---------- fish table sanity ---------- */
t('40 fish across 3 zones', function () {
  assert.strictEqual(CC.FISH.length, 40);
  [0, 1, 2].forEach(function (z) {
    assert.ok(CC.FISH.some(function (f) { return f.zone === z; }), 'zone ' + z + ' has fish');
  });
  var rar = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
  CC.FISH.forEach(function (f) {
    assert.ok(f.id && f.name && f.coins > 0 && f.lore && f.color, 'fields: ' + f.id);
    assert.ok(CC.RARITIES.indexOf(f.rarity) >= 0, 'rarity: ' + f.id);
    rar[f.rarity]++;
  });
  assert.ok(rar.legendary >= 2 && rar.legendary <= 5, 'legendaries: ' + rar.legendary);
  assert.ok(rar.rare >= 5, 'rares: ' + rar.rare);
  var ids = CC.FISH.map(function (f) { return f.id; });
  assert.strictEqual(new Set(ids).size, 40, 'unique ids');
});

t('coin values scale with rarity', function () {
  var avg = {};
  ['common', 'uncommon', 'rare', 'legendary'].forEach(function (r) {
    var fs = CC.FISH.filter(function (f) { return f.rarity === r; });
    avg[r] = fs.reduce(function (a, f) { return a + f.coins; }, 0) / fs.length;
  });
  assert.ok(avg.common < avg.uncommon && avg.uncommon < avg.rare && avg.rare < avg.legendary,
    JSON.stringify(avg));
});

/* ---------- bite window math ---------- */
t('bite windows: rarer = shorter, rod widens', function () {
  var c = CC.biteWindowMs('common', 1), l = CC.biteWindowMs('legendary', 1);
  assert.ok(l < c, 'legendary window shorter than common');
  assert.ok(CC.biteWindowMs('legendary', 5) > CC.biteWindowMs('legendary', 1), 'rod widens');
  assert.ok(CC.biteWindowMs('common', 5) - CC.biteWindowMs('common', 1) === 4 * 180, 'rod step = 180ms');
  assert.ok(CC.biteWindowMs('legendary', 1) >= 900, 'legendary still hookable: ' + l);
});

/* ---------- depth / zones ---------- */
t('line level gates depth zones', function () {
  assert.strictEqual(CC.zoneForDepth(0.5), 0);
  assert.strictEqual(CC.zoneForDepth(1.5), 1);
  assert.strictEqual(CC.zoneForDepth(2.5), 2);
  var d1 = CC.maxDepthFor(1), d5 = CC.maxDepthFor(5);
  assert.ok(d1 <= 1.0, 'line 1 stays shallow');
  assert.ok(d5 >= 3, 'line 5 reaches deep');
  for (var l = 1; l < 5; l++) assert.ok(CC.maxDepthFor(l) < CC.maxDepthFor(l + 1), 'depth grows');
  var full = CC.castDepth(99999, 1);
  assert.ok(Math.abs(full - CC.maxDepthFor(1)) < 1e-9, 'full hold = max depth');
  assert.ok(CC.castDepth(0, 3) >= 0.15, 'min depth clamp');
});

/* ---------- rarity odds ---------- */
t('legendary < 2% across typical conditions (no daily boost)', function () {
  var zones = [0.5, 1.5, 2.5], times = ['day', 'night', 'dawn'], wxs = ['clear', 'rain', 'fog'];
  var n = 0, leg = 0;
  zones.forEach(function (depth) {
    times.forEach(function (tm) {
      wxs.forEach(function (wx) {
        var rng = CC.mulberry32(CC.hashSeed('odds|' + depth + '|' + tm + '|' + wx));
        for (var i = 0; i < 4000; i++) {
          var f = CC.pickFish(rng, { depth: depth, timeCat: tm, weather: wx, lureLevel: 1, dailyId: null });
          n++;
          if (f.rarity === 'legendary') leg++;
          assert.strictEqual(CC.zoneForDepth(depth), f.zone, 'fish matches zone');
        }
      });
    });
  });
  var frac = leg / n;
  assert.ok(frac < 0.02, 'legendary frac ' + frac.toFixed(4));
  assert.ok(frac > 0.0005, 'legendaries actually possible: ' + frac.toFixed(4));
});

t('lure boosts rare/legendary weight', function () {
  var f = CC.BY_ID['gilded-wreckfish'];
  var w1 = CC.spawnWeight(f, 'day', 'clear', 1, null);
  var w5 = CC.spawnWeight(f, 'day', 'clear', 5, null);
  assert.ok(w5 > w1, 'lure 5 > lure 1');
});

/* ---------- daily big catch ---------- */
t('daily big catch: same date -> same fish worldwide, no Math.random', function () {
  var realRandom = Math.random;
  Math.random = function () { throw new Error('Math.random used in daily logic'); };
  try {
    var a = CC.dailyBigCatch('2026-10-03');
    var b = CC.dailyBigCatch('2026-10-03');
    assert.strictEqual(a.fishId, b.fishId, 'deterministic');
    assert.strictEqual(a.value, b.value, 'deterministic value');
    assert.ok(a.fish.rarity === 'rare' || a.fish.rarity === 'legendary', 'big pool only');
    assert.strictEqual(a.value, a.fish.coins * CC.DAILY_MULT, 'daily x' + CC.DAILY_MULT);
    var seen = {};
    for (var d = 1; d <= 30; d++) {
      var ds = '2026-10-' + (d < 10 ? '0' + d : d);
      seen[CC.dailyBigCatch(ds).fishId] = true;
    }
    assert.ok(Object.keys(seen).length > 3, 'varies across days');
  } finally { Math.random = realRandom; }
});

/* ---------- economy ---------- */
t('upgrade costs strictly increasing; maxed returns null', function () {
  ['rod', 'line', 'lure'].forEach(function (k) {
    var prev = 0;
    for (var lv = 1; lv < CC.maxLevel(); lv++) {
      var c = CC.upgradeCost(k, lv);
      assert.ok(c > prev, k + ' lvl ' + lv + ' cost ' + c + ' not increasing');
      prev = c;
    }
    assert.strictEqual(CC.upgradeCost(k, CC.maxLevel()), null, k + ' maxed');
    assert.strictEqual(CC.upgradeCost('nope', 1), null, 'bad kind');
  });
});

t('cannot buy without coins (purchase simulation)', function () {
  var coins = 40, up = { rod: 1, line: 1, lure: 1 };
  function buy(kind) {
    var cost = CC.upgradeCost(kind, up[kind]);
    if (cost == null || coins < cost) return false;
    coins -= cost; up[kind]++;
    return true;
  }
  assert.strictEqual(buy('rod'), false, 'rod costs 50, have 40');
  coins = 1000;
  assert.strictEqual(buy('rod'), true);
  assert.strictEqual(up.rod, 2);
  assert.strictEqual(coins, 950);
  buy('rod'); buy('rod'); buy('rod');
  assert.strictEqual(up.rod, 5);
  assert.strictEqual(buy('rod'), false, 'maxed out');
});

/* ---------- catch resolution ---------- */
t('resolveCatch returns sane catch', function () {
  var rng = CC.mulberry32(42);
  for (var i = 0; i < 200; i++) {
    var r = CC.resolveCatch({
      rng: rng, depth: 0.5, timeCat: 'day', weather: 'clear',
      upgrades: { rod: 2, line: 1, lure: 3 }, dailyId: null
    });
    assert.ok(r.fish && r.coins > 0 && r.biteWindowMs > 0, 'catch shape');
    assert.strictEqual(r.fish.zone, 0, 'shallow depth -> shallow fish');
    assert.strictEqual(r.isDaily, false);
  }
});

t('daily catch pays triple and flags', function () {
  var d = CC.dailyBigCatch('2026-10-03');
  var rng = CC.mulberry32(7);
  var found = null;
  for (var i = 0; i < 400 && !found; i++) {
    var r = CC.resolveCatch({
      rng: rng, depth: 2.5, timeCat: 'night', weather: 'fog',
      upgrades: { rod: 1, line: 5, lure: 1 }, dailyId: d.fishId
    });
    if (r.fish.id === d.fishId) found = r;
  }
  assert.ok(found, 'daily fish catchable');
  assert.strictEqual(found.isDaily, true);
  assert.strictEqual(found.coins, d.fish.coins * CC.DAILY_MULT);
});

/* ---------- journal ---------- */
t('journal: catch registers, duplicates counted, biggest tracked', function () {
  var j = {};
  CC.journalRecord(j, 'sunbream', 8);
  assert.strictEqual(j.sunbream.count, 1);
  assert.strictEqual(j.sunbream.biggest, 8);
  CC.journalRecord(j, 'sunbream', 5);
  assert.strictEqual(j.sunbream.count, 2);
  assert.strictEqual(j.sunbream.biggest, 8, 'biggest kept');
  CC.journalRecord(j, 'sunbream', 12);
  assert.strictEqual(j.sunbream.biggest, 12);
});

/* ---------- streak ---------- */
t('streak: consecutive days increment, gaps reset', function () {
  var s = CC.nextStreak({ last: null, count: 0 }, '2026-10-03');
  assert.deepStrictEqual(s, { last: '2026-10-03', count: 1 });
  s = CC.nextStreak(s, '2026-10-03');
  assert.strictEqual(s.count, 1, 'same day no double count');
  s = CC.nextStreak(s, '2026-10-04');
  assert.strictEqual(s.count, 2, 'consecutive');
  s = CC.nextStreak(s, '2026-10-06');
  assert.strictEqual(s.count, 1, 'gap resets');
  assert.strictEqual(CC.yesterdayOf('2026-10-01'), '2026-09-30', 'month boundary');
  assert.strictEqual(CC.yesterdayOf('2026-01-01'), '2025-12-31', 'year boundary');
});

console.log('PASS: ' + passed + ' tests');
