// Night Market — sim.js — PURE simulation. No DOM, no canvas, no rAF,
// no Date. Time enters only via explicit params (seconds, nowMs, dateStr).
// Randomness: mulberry32 in state.rng, advanced ONLY by sim functions.
var NM = window.NM || {};

var SIM_TICK = 0.1;              // fixed sub-step, seconds (10 ticks/sec)
var SIM_MAX_STEPS = 1000000;     // sanity cap on advance() chunking
var SIM_DISH_SECS_PER_DISH = 20; // one dish per 20 food-stall-seconds
var SIM_DISH_VALUE_MULT = 10;    // one dish sells for 10 food-stall-seconds
var SIM_DISH_OVERFLOW_RATE = 0.5;// tray overflow auto-sells at 50% value
var SIM_VISIT_BASE = 0.008;      // visits/sec per owned stall (capped below)
var SIM_VISIT_CAP = 0.05;        // visits/sec hard cap
var SIM_DEFAULT_SEED = 123456789;

// --- random encounters -----------------------------------------------------
// A visitor wanders in every 1-2 min of play (never while away; see offline).
// The player claims 'windfall' (300 x cps coins) or 'boost' (2x cps, 30s).
// Timers are playTime-seconds, so they pause when the market is closed.
var SIM_ENC_FIRST_AT = 90;      // first encounter at ~90s of play
var SIM_ENC_GAP_BASE = 60;      // then every 60..120s of play
var SIM_ENC_GAP_SPREAD = 60;
var SIM_ENC_ACTIVE_SECS = 25;   // unclaimed encounters wander off after 25s
var SIM_ENC_WINDFALL_MULT = 300;
var SIM_ENC_BOOST_SECS = 30;
var SIM_ENC_BOOST_MULT = 2;

// --- PRNG ---------------------------------------------------------------
// mulberry32. st = {rng: uint32}. Returns [0,1).
function SIM_rand(st) {
  st.rng |= 0;
  st.rng = (st.rng + 0x6D2B79F5) | 0;
  var t = Math.imul(st.rng ^ (st.rng >>> 15), 1 | st.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// --- state --------------------------------------------------------------
function SIM_createState(seed) {
  var s = {
    v: 2, t: 0, coins: 20, lanterns: 0, gems: 0,
    stalls: { noodle: 1 },
    upgrades: {},
    seasonUpgrades: {},   // spend-lantern upgrades; survive New Season
    staff: [],
    dishes: 0,
    gong: { taps: 0, rushUntil: 0, rushSecs: 0 },
    regulars: {},
    encounters: { nextAt: SIM_ENC_FIRST_AT, active: null }, // playTime-sec timers
    boostUntil: 0,        // playTime-sec timestamp; >playTime => cps x2 active
    quests: { date: '', done: {}, prog: {}, streak: 0 },
    season: { n: 1, startedAt: 0, earned: 0 },
    stats: { earnedTotal: 0, playTime: 0, taps: 0, dishesSold: 0,
             stallsBought: 0, rushes: 0 },
    settings: { mute: false },
    flags: { staffSeen: false, bookSeen: false, seasonSeen: false, hourglassDate: '' },
    rng: (seed === undefined || seed === null) ? SIM_DEFAULT_SEED : (seed >>> 0),
    rates: null
  };
  SIM_recalcRates(s);
  return s;
}

// --- milestones ----------------------------------------------------------
function SIM_milestoneMult(count) {
  var ms = NM.content.MILESTONES;
  var n = 0;
  for (var i = 0; i < ms.length; i++) if (count >= ms[i]) n++;
  return Math.pow(2, n);
}

function SIM_isStallUnlocked(state, id) {
  var def = NM.content.STALL_MAP[id];
  if (!def) return false;
  if (!def.unlockAt) return true;
  return (state.stalls[def.unlockAt.stall] || 0) >= def.unlockAt.count;
}

// --- rates ---------------------------------------------------------------
function SIM_applyEffect(acc, eff) {
  if (!eff) return;
  if (eff.kind === 'cps') acc.cps *= eff.mult;
  else if (eff.kind === 'stall' && eff.stall) {
    acc.stall[eff.stall] = (acc.stall[eff.stall] || 1) * eff.mult;
  }
  else if (eff.kind === 'dish') acc.dish *= eff.mult;
}

// Rebuilds state.rates from owned things. Call on load + every purchase.
// rates = {coinsPerSec, perStall, dishValue, dishPerSec, cpsMult,
//          foodCps, totalStalls, eligibleRegulars, stallMult}
function SIM_recalcRates(state) {
  var C = NM.content;
  var acc = { cps: 1, stall: {}, dish: 1 };
  var id;
  for (id in state.upgrades) {
    if (state.upgrades[id] && C.UPGRADE_MAP[id]) SIM_applyEffect(acc, C.UPGRADE_MAP[id].effect);
  }
  for (id in state.seasonUpgrades) {
    if (state.seasonUpgrades[id] && C.SEASON_UPGRADE_MAP[id]) SIM_applyEffect(acc, C.SEASON_UPGRADE_MAP[id].effect);
  }
  for (var i = 0; i < state.staff.length; i++) {
    var sd = C.STAFF_MAP[state.staff[i]];
    if (sd) SIM_applyEffect(acc, sd.effect);
  }
  acc.cps *= (1 + 0.02 * (state.lanterns || 0)); // hoarded lanterns glow
  // Active encounter boost: 2x cps while the boost timer runs (playTime-sec).
  // Boost expiry is detected per tick in SIM_step (which then recalcs).
  if ((state.boostUntil || 0) > state.stats.playTime) acc.cps *= SIM_ENC_BOOST_MULT;

  var perStall = {}, stallMultOut = {};
  var total = 0, foodCps = 0, totalStalls = 0;
  for (var si = 0; si < C.STALLS.length; si++) {
    var def = C.STALLS[si];
    var count = state.stalls[def.id] || 0;
    totalStalls += count;
    if (count > 0) {
      var sm = (acc.stall[def.id] || 1) * SIM_milestoneMult(count);
      stallMultOut[def.id] = sm;
      var c = count * def.baseRate * sm * acc.cps;
      perStall[def.id] = c;
      total += c;
      if (def.dish) foodCps += c;
    }
  }
  var eligibleRegulars = [];
  for (var ri = 0; ri < C.REGULARS.length; ri++) {
    var reg = C.REGULARS[ri];
    if ((state.stalls[reg.favorite] || 0) > 0) eligibleRegulars.push(reg.id);
  }
  state.rates = {
    coinsPerSec: total,
    perStall: perStall,
    dishValue: Math.max(1, foodCps * SIM_DISH_VALUE_MULT * acc.dish),
    dishPerSec: foodCps / SIM_DISH_SECS_PER_DISH,
    cpsMult: acc.cps,
    foodCps: foodCps,
    totalStalls: totalStalls,
    eligibleRegulars: eligibleRegulars,
    stallMult: stallMultOut
  };
  return state.rates;
}

// --- quests --------------------------------------------------------------
function SIM_addQuestProg(state, key, n) {
  if (!(n > 0)) return;
  var q = state.quests;
  q.prog[key] = (q.prog[key] || 0) + n;
  var defs = NM.content.QUEST_DEFS;
  for (var i = 0; i < defs.length; i++) {
    var d = defs[i];
    if (d.progKey === key && !q.done[d.id] && q.prog[key] >= d.target) {
      q.done[d.id] = true;
      if (d.reward) {
        if (d.reward.coins) {
          state.coins += d.reward.coins;
          state.season.earned += d.reward.coins;
          state.stats.earnedTotal += d.reward.coins;
        }
        if (d.reward.gems) state.gems += d.reward.gems;
      }
    }
  }
}

// Rolls the daily quests to dateStr ('YYYY-MM-DD'). Pure. Returns true if rolled.
function SIM_checkQuestDay(state, dateStr) {
  if (state.quests.date === dateStr) return false;
  var defs = NM.content.QUEST_DEFS;
  var allDone = true;
  for (var i = 0; i < defs.length; i++) {
    if (!state.quests.done[defs[i].id]) { allDone = false; break; }
  }
  state.quests = {
    date: dateStr, done: {}, prog: {},
    streak: allDone ? (state.quests.streak || 0) + 1 : 0
  };
  SIM_addQuestProg(state, 'openday', 1);
  return true;
}

// --- visitors ------------------------------------------------------------
function SIM_rollVisitors(state, dt) {
  var elig = state.rates.eligibleRegulars;
  if (!elig || elig.length === 0) return;
  var p = dt * Math.min(SIM_VISIT_CAP, SIM_VISIT_BASE * state.rates.totalStalls);
  if (p <= 0) return;
  if (SIM_rand(state) < p) {
    var rid = elig[Math.floor(SIM_rand(state) * elig.length)];
    var rec = state.regulars[rid];
    if (!rec) rec = state.regulars[rid] = { visits: 0, memento: false };
    rec.visits++;
    var th = NM.content.MEMENTO_VISITS;
    for (var i = 0; i < th.length; i++) {
      if (!rec.memento && rec.visits === th[i]) {
        rec.memento = true;
        state.gems += 1;
        state.flags.bookSeen = true;
        break;
      }
    }
  }
}

// --- encounters ------------------------------------------------------------
// Spawns + expiry live here (per tick) so everything stays deterministic on
// the shared state.rng: identical call order in both halves of the
// composability test keeps identical rng streams.
function SIM_spawnEncounter(state) {
  var list = NM.content.VISITORS;
  if (!list || list.length === 0) return;
  var kind = list[Math.floor(SIM_rand(state) * list.length)].id;
  var pt = state.stats.playTime;
  state.encounters.active = { kind: kind, expiresAt: pt + SIM_ENC_ACTIVE_SECS };
  state.encounters.nextAt = pt + SIM_ENC_GAP_BASE + SIM_rand(state) * SIM_ENC_GAP_SPREAD;
}

function SIM_stepEncounters(state) {
  var enc = state.encounters;
  if (!enc) { state.encounters = enc = { nextAt: SIM_ENC_FIRST_AT, active: null }; }
  var pt = state.stats.playTime;
  if (enc.active) {
    if (pt >= enc.active.expiresAt) enc.active = null; // wandered off
  } else if (pt >= enc.nextAt) {
    SIM_spawnEncounter(state);
  }
}

// Claim an active encounter. choice: 'windfall' | 'boost'.
// windfall: 300 x current cps coins. boost: 2x cps for 30 playTime-secs.
function SIM_claimEncounter(state, choice, nowMs) {
  var enc = state.encounters;
  if (!enc || !enc.active) return { ok: false, reason: 'none' };
  var pt = state.stats.playTime;
  if (pt >= enc.active.expiresAt) {
    enc.active = null;
    return { ok: false, reason: 'expired' };
  }
  var kind = enc.active.kind;
  enc.active = null;
  if (choice === 'windfall') {
    if (!state.rates) SIM_recalcRates(state);
    var coins = Math.max(1, Math.floor(state.rates.coinsPerSec * SIM_ENC_WINDFALL_MULT));
    state.coins += coins;
    state.season.earned += coins;
    state.stats.earnedTotal += coins;
    SIM_addQuestProg(state, 'earn', coins);
    return { ok: true, kind: kind, coins: coins };
  }
  if (choice === 'boost') {
    state.boostUntil = pt + SIM_ENC_BOOST_SECS;
    SIM_recalcRates(state);
    return { ok: true, kind: kind, boostSecs: SIM_ENC_BOOST_SECS };
  }
  return { ok: false, reason: 'choice' };
}

// Expired/unclaimed encounters just clear; nothing accrues.
function SIM_dismissEncounter(state) {
  var enc = state.encounters;
  var had = !!(enc && enc.active);
  if (enc) enc.active = null;
  return { ok: true, cleared: had };
}

// --- advance --------------------------------------------------------------
function SIM_step(state, dt) {
  // boost expiry: drop the 2x and rebuild rates the moment it lapses
  if (state.boostUntil && state.stats.playTime >= state.boostUntil) {
    state.boostUntil = 0;
    SIM_recalcRates(state);
  }
  var r = state.rates;
  var rushMult = state.gong.rushSecs > 0 ? NM.content.GONG_RUSH_MULT : 1;
  var gain = r.coinsPerSec * rushMult * dt;
  state.coins += gain;
  state.season.earned += gain;
  state.stats.earnedTotal += gain;
  SIM_addQuestProg(state, 'earn', gain);

  if (r.dishPerSec > 0) {
    state.dishes += r.dishPerSec * dt;
    if (state.dishes > NM.content.DISH_CAP) {
      var over = state.dishes - NM.content.DISH_CAP;
      state.dishes = NM.content.DISH_CAP;
      var autoCoins = over * r.dishValue * SIM_DISH_OVERFLOW_RATE;
      state.coins += autoCoins;
      state.season.earned += autoCoins;
      state.stats.earnedTotal += autoCoins;
      state.stats.dishesSold += over;
      SIM_addQuestProg(state, 'earn', autoCoins);
      SIM_addQuestProg(state, 'dishes', over);
    }
  }
  state.stats.playTime += dt;
  SIM_stepEncounters(state);
  if (state.gong.rushSecs > 0) {
    state.gong.rushSecs = Math.max(0, state.gong.rushSecs - dt);
  }
  SIM_rollVisitors(state, dt);
}

// Composable: advance(S,60) === 600 x advance(S,0.1) up to float noise.
// Fixed sub-steps with uniform dt keep the op order identical in both paths.
function SIM_advance(state, seconds) {
  if (!(seconds > 0)) return;
  if (!state.rates) SIM_recalcRates(state);
  var steps = Math.ceil(seconds / SIM_TICK - 1e-9);
  if (steps < 1) steps = 1;
  if (steps > SIM_MAX_STEPS) steps = SIM_MAX_STEPS;
  var dt = seconds / steps;
  for (var i = 0; i < steps; i++) SIM_step(state, dt);
}

// --- costs: closed forms, never iterate -----------------------------------
// Cost of buying `qty` units when `owned` are already held:
//   base * ratio^owned * (ratio^qty - 1) / (ratio - 1)
function SIM_stallCost(id, owned, qty) {
  var def = NM.content.STALL_MAP[id];
  if (!def || !(qty > 0)) return qty > 0 ? Infinity : 0;
  var r = def.costRatio;
  return def.baseCost * Math.pow(r, owned) * (Math.pow(r, qty) - 1) / (r - 1);
}

// Max units affordable with `coins` (defaults to state.coins):
//   k = floor( log( coins*(r-1)/(base*r^owned) + 1 ) / log(r) )
// then a bounded +/- correction so float error can never misprice.
function SIM_maxAffordable(state, id, coins) {
  var def = NM.content.STALL_MAP[id];
  if (!def) return 0;
  if (coins === undefined || coins === null) coins = state.coins;
  var owned = state.stalls[id] || 0;
  var r = def.baseCost, ratio = def.costRatio;
  if (coins < SIM_stallCost(id, owned, 1)) return 0;
  var k = Math.floor(Math.log(coins * (ratio - 1) / (r * Math.pow(ratio, owned)) + 1) / Math.log(ratio));
  if (!(k >= 0)) k = 0;
  if (k > 1e6) k = 1e6;
  while (k > 0 && SIM_stallCost(id, owned, k) > coins) k--;
  while (SIM_stallCost(id, owned, k + 1) <= coins) k++;
  return k;
}

function SIM_buyStall(state, id, qty, nowMs) {
  var def = NM.content.STALL_MAP[id];
  if (!def || !SIM_isStallUnlocked(state, id)) return { ok: false, bought: 0, spent: 0 };
  if (qty === 'max') qty = SIM_maxAffordable(state, id);
  qty = Math.floor(qty);
  if (!(qty >= 1)) return { ok: false, bought: 0, spent: 0 };
  var owned = state.stalls[id] || 0;
  var cost = SIM_stallCost(id, owned, qty);
  if (state.coins < cost) return { ok: false, bought: 0, spent: 0 };
  state.coins -= cost;
  state.stalls[id] = owned + qty;
  state.stats.stallsBought += qty;
  SIM_recalcRates(state);
  SIM_addQuestProg(state, 'stalls', qty);
  return { ok: true, bought: qty, spent: cost };
}

function SIM_buyUpgrade(state, id) {
  var def = NM.content.UPGRADE_MAP[id];
  if (!def) return { ok: false };
  if (state.upgrades[id]) return { ok: false, reason: 'owned' };
  if (state.coins < def.cost) return { ok: false, reason: 'coins' };
  state.coins -= def.cost;
  state.upgrades[id] = true;
  SIM_recalcRates(state);
  return { ok: true };
}

function SIM_hireStaff(state, id) {
  var def = NM.content.STAFF_MAP[id];
  if (!def) return { ok: false };
  if (state.staff.indexOf(id) !== -1) return { ok: false, reason: 'hired' };
  if (state.coins < def.cost) return { ok: false, reason: 'coins' };
  state.coins -= def.cost;
  state.staff.push(id);
  state.flags.staffSeen = true;
  SIM_recalcRates(state);
  return { ok: true };
}

// Season upgrades are bought with banked lanterns and survive New Season.
function SIM_buySeasonUpgrade(state, id) {
  var def = NM.content.SEASON_UPGRADE_MAP[id];
  if (!def) return { ok: false };
  if (state.seasonUpgrades[id]) return { ok: false, reason: 'owned' };
  if (state.lanterns < def.cost) return { ok: false, reason: 'lanterns' };
  state.lanterns -= def.cost;
  state.seasonUpgrades[id] = true;
  SIM_recalcRates(state);
  return { ok: true };
}

// --- gong -----------------------------------------------------------------
function SIM_tapGong(state, nowMs) {
  var C = NM.content;
  var tapCoins = Math.max(1, state.rates.coinsPerSec * 2);
  state.coins += tapCoins;
  state.season.earned += tapCoins;
  state.stats.earnedTotal += tapCoins;
  state.stats.taps++;
  state.gong.taps++;
  SIM_addQuestProg(state, 'gong', 1);
  SIM_addQuestProg(state, 'earn', tapCoins);
  var rush = false;
  if (state.gong.taps >= C.GONG_RUSH_TAPS) {
    state.gong.taps = 0;
    state.gong.rushUntil = nowMs + C.GONG_RUSH_SECS * 1000; // wall display
    state.gong.rushSecs = C.GONG_RUSH_SECS;                // sim-pure twin
    state.stats.rushes++;
    rush = true;
  }
  return { rush: rush, coins: tapCoins };
}

// --- dishes ---------------------------------------------------------------
function SIM_collectDishes(state) {
  var n = Math.floor(state.dishes);
  if (n < 1) return { coins: 0, n: 0 };
  var coins = n * state.rates.dishValue;
  state.dishes -= n;
  state.coins += coins;
  state.season.earned += coins;
  state.stats.earnedTotal += coins;
  state.stats.dishesSold += n;
  SIM_addQuestProg(state, 'dishes', n);
  SIM_addQuestProg(state, 'earn', coins);
  return { coins: coins, n: n };
}

// --- seasons (prestige) ----------------------------------------------------
function SIM_newSeasonPreview(state) {
  var lanterns = Math.floor(12 * Math.sqrt(state.season.earned / 1e6));
  if (!(lanterns >= 1)) lanterns = 0;
  return {
    lanterns: lanterns,
    multNow: 1 + 0.02 * (state.lanterns || 0),
    multNext: 1 + 0.02 * ((state.lanterns || 0) + lanterns)
  };
}

function SIM_applyNewSeason(state, nowMs) {
  var preview = SIM_newSeasonPreview(state);
  if (preview.lanterns < 1) return { ok: false, reason: 'not-ready' };
  state.lanterns = (state.lanterns || 0) + preview.lanterns;
  state.coins = 20;
  state.stalls = { noodle: 1 };
  state.upgrades = {};
  state.staff = [];
  state.dishes = 0;
  state.gong = { taps: 0, rushUntil: 0, rushSecs: 0 };
  state.season = { n: state.season.n + 1, startedAt: nowMs, earned: 0 };
  state.flags.seasonSeen = true;
  if (state.encounters) state.encounters.active = null; // fresh season, fresh faces
  // KEPT: regulars, quests, stats, settings, flags, rng, seasonUpgrades, lanterns
  SIM_recalcRates(state);
  return { ok: true, lanterns: preview.lanterns };
}

// --- helpers ---------------------------------------------------------------
function SIM_timeToAfford(cost, cps) {
  if (!(cps > 0)) return Infinity;
  return Math.max(0, cost / cps);
}

// Cheapest time-to-afford across next stall unit / upgrades / staff.
function SIM_recommendedBuy(state) {
  var C = NM.content;
  var cps = state.rates.coinsPerSec;
  var best = null;
  function consider(kind, id, cost) {
    if (!(cost > 0)) return;
    var t = cps > 0 ? Math.max(0, cost - state.coins) / cps : Infinity;
    if (!best || t < best.t - 1e-12 || (Math.abs(t - best.t) <= 1e-12 && cost < best.cost)) {
      best = { kind: kind, id: id, cost: cost, t: t };
    }
  }
  for (var i = 0; i < C.STALLS.length; i++) {
    var def = C.STALLS[i];
    if (SIM_isStallUnlocked(state, def.id)) {
      consider('stall', def.id, SIM_stallCost(def.id, state.stalls[def.id] || 0, 1));
    }
  }
  for (var u = 0; u < C.UPGRADES.length; u++) {
    if (!state.upgrades[C.UPGRADES[u].id]) consider('upgrade', C.UPGRADES[u].id, C.UPGRADES[u].cost);
  }
  for (var s = 0; s < C.STAFF.length; s++) {
    if (state.staff.indexOf(C.STAFF[s].id) === -1) consider('staff', C.STAFF[s].id, C.STAFF[s].cost);
  }
  if (!best) return null;
  return { kind: best.kind, id: best.id, cost: best.cost };
}

NM.sim = {
  TICK: SIM_TICK,
  createState: SIM_createState,
  recalcRates: SIM_recalcRates,
  advance: SIM_advance,
  stallCost: SIM_stallCost,
  maxAffordable: SIM_maxAffordable,
  buyStall: SIM_buyStall,
  buyUpgrade: SIM_buyUpgrade,
  hireStaff: SIM_hireStaff,
  buySeasonUpgrade: SIM_buySeasonUpgrade,
  tapGong: SIM_tapGong,
  collectDishes: SIM_collectDishes,
  newSeasonPreview: SIM_newSeasonPreview,
  applyNewSeason: SIM_applyNewSeason,
  timeToAfford: SIM_timeToAfford,
  recommendedBuy: SIM_recommendedBuy,
  checkQuestDay: SIM_checkQuestDay,
  questProg: SIM_addQuestProg,
  claimEncounter: SIM_claimEncounter,
  dismissEncounter: SIM_dismissEncounter,
  encounterBoostSecs: SIM_ENC_BOOST_SECS,
  encounterWindfallMult: SIM_ENC_WINDFALL_MULT,
  milestoneMult: SIM_milestoneMult,
  isStallUnlocked: SIM_isStallUnlocked,
  rand: SIM_rand
};
