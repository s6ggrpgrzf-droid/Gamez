// Night Market — offline.js — wall-clock catch-up. Pure math on the state;
// no Date, no DOM. elapsedSec and dateSeed are caller-supplied.
var NM = window.NM || {};

var OFF_CAP = 8 * 3600;   // saturating cap: 8h of value, approached smoothly
var OFF_TAU = 8 * 3600;   // time constant of the saturation curve
var OFF_MAX = 48 * 3600;  // sanity clamp on elapsed input
var OFF_MIN_EFFECTIVE = 60; // below this, not worth reporting

// Saturating cap: at elapsed=CAP you get ~63% of CAP; asymptote is CAP.
function OFF_effectiveSeconds(elapsedSec) {
  var e = elapsedSec || 0;
  if (!(e > 0)) return 0;
  if (e > OFF_MAX) e = OFF_MAX;
  return OFF_CAP * (1 - Math.exp(-e / OFF_TAU));
}

// Closed-form gains + deterministic visitor rolls (mulberry32(dateSeed)).
// Mutates state; returns a welcome-back summary, or null if not worth it.
// Generous: coin amounts round UP in the player's favor.
function OFF_applyOffline(state, elapsedSec, dateSeed) {
  var C = NM.content;
  var eff = OFF_effectiveSeconds(elapsedSec);
  if (eff < OFF_MIN_EFFECTIVE) return null;
  NM.sim.recalcRates(state); // cheap, guarantees fresh derived rates
  var r = state.rates;

  // --- coins: closed form, rounded up (generous) ---
  var coins = Math.ceil(r.coinsPerSec * eff);

  // --- dishes: closed form; tray overflow auto-sells at 50% (rounded up) ---
  var gained = r.dishPerSec * eff;
  var total = state.dishes + gained;
  var over = 0;
  if (total > C.DISH_CAP) {
    over = total - C.DISH_CAP;
    total = C.DISH_CAP;
  }
  var overCoins = Math.ceil(over * r.dishValue * 0.5);
  coins += overCoins;
  state.dishes = total;

  state.coins += coins;
  state.season.earned += coins;
  state.stats.earnedTotal += coins;
  state.stats.playTime += eff;
  state.stats.dishesSold += over;
  state.gong.rushSecs = Math.max(0, state.gong.rushSecs - eff);

  // --- encounters: none accrue while away. Push the spawn timer forward by
  // the full away period (capped sanely), clear any stale active visitor,
  // and let any boost lapse — boosts are for tending the market, not sleeping.
  var enc = state.encounters;
  if (enc) {
    enc.active = null;
    enc.nextAt = (enc.nextAt || 0) + Math.min(Math.max(0, elapsedSec || 0), OFF_MAX);
  }
  state.boostUntil = 0;

  // --- quests: fold the offline haul into progress; note completions ---
  var doneBefore = {};
  var defs = C.QUEST_DEFS;
  for (var di = 0; di < defs.length; di++) doneBefore[defs[di].id] = !!state.quests.done[defs[di].id];
  NM.sim.questProg(state, 'earn', coins);
  NM.sim.questProg(state, 'dishes', over);
  var milestones = [];
  for (var dj = 0; dj < defs.length; dj++) {
    if (!doneBefore[defs[dj].id] && state.quests.done[defs[dj].id]) milestones.push(defs[dj].id);
  }

  // --- visitors: deterministic rolls from dateSeed; can't be farmed ---
  var rngSt = { rng: (dateSeed >>> 0) || 1 };
  var elig = r.eligibleRegulars || [];
  var visitors = [];
  var newMementos = [];
  if (elig.length > 0) {
    var rate = Math.min(0.05, 0.008 * (r.totalStalls || 0)); // mirrors sim roll rate
    var expected = eff * rate;
    var n = Math.floor(expected);
    if (NM.sim.rand(rngSt) < expected - n) n++;
    var counts = {};
    for (var i = 0; i < n; i++) {
      var rid = elig[Math.floor(NM.sim.rand(rngSt) * elig.length)];
      counts[rid] = (counts[rid] || 0) + 1;
    }
    var thresholds = C.MEMENTO_VISITS;
    for (var id in counts) {
      var rec = state.regulars[id];
      if (!rec) rec = state.regulars[id] = { visits: 0, memento: false };
      var before = rec.visits;
      rec.visits += counts[id];
      visitors.push({ id: id, visits: counts[id] });
      if (!rec.memento) {
        for (var ti = 0; ti < thresholds.length; ti++) {
          if (before < thresholds[ti] && rec.visits >= thresholds[ti]) {
            rec.memento = true;
            state.gems += 1;
            state.flags.bookSeen = true;
            var def = C.REGULAR_MAP[id];
            newMementos.push({ id: id, name: def && def.memento ? def.memento.name : id });
            break;
          }
        }
      }
    }
    visitors.sort(function (a, b) { return b.visits - a.visits; });
  }

  return {
    awaySec: elapsedSec,
    coins: coins,
    lanterns: 0,
    dishes: state.dishes,
    visitors: visitors,
    milestones: milestones,
    newMementos: newMementos
  };
}

NM.offline = {
  CAP: OFF_CAP,
  effectiveSeconds: OFF_effectiveSeconds,
  applyOffline: OFF_applyOffline
};
