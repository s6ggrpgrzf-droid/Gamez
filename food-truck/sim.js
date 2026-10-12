/* Food Truck Manager — pure simulation. No DOM, no canvas, no Math.random.
 * All randomness flows through the seeded PRNG so shifts are reproducible
 * and the whole thing runs headless under node for tests.
 *
 * Usage:
 *   var s = FTSIM.createShift(seed, opts);
 *   FTSIM.update(s, dt, actions);   // dt seconds; actions = logical actions
 *   var evts = FTSIM.drain(s);      // events for the UI/juice layer
 *
 * Actions (logical, UI normalizes pointer input into these):
 *   {t:'cook',  dish, slot}                 start dish on grill slot
 *   {t:'serve', cust, src}                  src = {kind:'grill'|'holding'|'cooler', i}
 *   {t:'hold',  slot, h}                    move grill food -> holding station
 *   {t:'trash', kind, i}                    kind 'grill'|'holding'; clear burnt/spoiled/stale
 *   {t:'usual', cust}                       one-tap prep a regular's favorite
 */
'use strict';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

var FTSIM = (function () {
  var C = (typeof FTC !== 'undefined') ? FTC : null; // config injected by page/tests

  function cfg() {
    if (!C) throw new Error('FTC config required');
    return C;
  }

  function pickWeighted(rng, table) {
    var total = 0, i;
    for (i = 0; i < table.length; i++) total += table[i].w;
    var r = rng() * total;
    for (i = 0; i < table.length; i++) { r -= table[i].w; if (r <= 0) return table[i].v; }
    return table[table.length - 1].v;
  }

  /* ---------------- shift creation ---------------- */

  function createShift(seed, opts) {
    var c = cfg();
    opts = opts || {};
    var rng = mulberry32(seed >>> 0);
    var menu = (opts.menu && opts.menu.length) ? opts.menu.slice() : ['taco', 'quesadilla', 'agua'];
    var up = opts.upgrades || {};
    var holdingN = c.HOLDING_SLOTS + (up.warmer ? 1 : 0);
    var grill = [], holding = [], i;
    for (i = 0; i < c.GRILL_SLOTS; i++) grill.push({ dish: null, t: 0, warned: false });
    for (i = 0; i < holdingN; i++) holding.push({ dish: null, fresh: 1 });
    return {
      seed: seed >>> 0, rng: rng,
      t: 0, dur: c.SHIFT_LEN, phase: 'shift',
      menu: menu, up: up,
      grill: grill, holding: holding,
      customers: [], driveup: [],
      nextId: 1, nextSeq: 1, nextDuSeq: 1,
      arriveT: 1.2, duArriveT: 6,
      buzz: (opts.buzz != null) ? opts.buzz : c.BUZZ_START,
      combo: 0, maxCombo: 0,
      revenue: 0, coins: 0,
      stats: { served: 0, perfect: 0, ok: 0, bad: 0, walkouts: 0, burntTrashed: 0, spoiledTrashed: 0, usualPreps: 0 },
      regulars: (opts.regulars || []).map(function (r) {
        return { name: r.name, story: r.story || '', fav: r.fav, visits: r.visits || 0, unlocked: !!r.unlocked, schedule: r.schedule || null };
      }),
      criticServed: false, criticFailed: false,
      events: [],
      sunday: !!opts.sunday,
      special: opts.special || null, // today's grease-penciled special: +50% tips
      done: false, summary: null
    };
  }

  function ev(s, e) { s.events.push(e); }
  function drain(s) { var e = s.events; s.events = []; return e; }

  /* ---------------- spawning ---------------- */

  function patienceFor(s, archId) {
    var c = cfg();
    var p = c.PATIENCE_BASE + (s.buzz / 5) * c.PATIENCE_PER5;
    if (p < c.PATIENCE_MIN) p = c.PATIENCE_MIN;
    var mult = c.ARCH[archId].patience;
    if (s.up.lights) mult *= 1.12;
    return p * mult * (0.85 + s.rng() * 0.3);
  }

  function orderFor(s, archId) {
    // 1-2 dishes from the menu; critics order the two hardest.
    var menu = s.menu, n = 1 + (s.rng() < 0.35 ? 1 : 0);
    var dishes = [], i, d;
    if (archId === 'critic') {
      var sorted = menu.slice().sort(function (a, b) { return cfg().DISHES[b].pts - cfg().DISHES[a].pts; });
      for (i = 0; i < Math.min(2, sorted.length); i++) dishes.push(sorted[i]);
      return dishes;
    }
    for (i = 0; i < n; i++) { d = menu[(s.rng() * menu.length) | 0]; dishes.push(d); }
    return dishes;
  }

  function spawnCustomer(s, channel) {
    var c = cfg();
    var list = (channel === 'du') ? s.driveup : s.customers;
    var max = (channel === 'du') ? c.MAX_DRIVEUP : c.MAX_WINDOW;
    if (list.length >= max) return null;
    var arch = pickWeighted(s.rng, [
      { v: 'std', w: c.ARCH.std.weight },
      { v: 'biz', w: c.ARCH.biz.weight },
      { v: 'senior', w: c.ARCH.senior.weight },
      { v: 'critic', w: (s.sunday && !s.criticServed && channel !== 'du') ? 40 : 0 }
    ]);
    var cust = {
      id: s.nextId++, arch: arch,
      seq: (channel === 'du') ? s.nextDuSeq++ : s.nextSeq++,
      channel: channel,
      dishes: orderFor(s, arch), got: [],
      patience: 0, maxPatience: 0,
      state: 'waiting', usual: false, regIdx: -1, name: null
    };
    // Regulars: scheduled familiar faces ("The Usual").
    if (channel !== 'du' && s.regulars.length && s.rng() < c.REGULAR_CHANCE) {
      var ri = (s.rng() * s.regulars.length) | 0;
      var r = s.regulars[ri];
      cust.regIdx = ri; cust.name = r.name;
      cust.dishes = [r.fav];
      if (r.unlocked) cust.usual = true;
    }
    cust.maxPatience = patienceFor(s, arch);
    if (channel === 'du' && s.up.awning) cust.maxPatience *= 1.25;
    cust.patience = cust.maxPatience;
    list.push(cust);
    ev(s, channel === 'du' ? { k: 'duArrive', id: cust.id } : { k: 'arrive', id: cust.id, usual: cust.usual });
    return cust;
  }

  /* ---------------- grill ---------------- */

  function grillState(s, g) {
    var c = cfg();
    if (!g.dish) return 'empty';
    var d = c.DISHES[g.dish];
    if (g.t < d.cook) return 'cooking';
    if (g.t < d.cook + d.perfect) return 'perfect';
    if (g.t < d.cook + d.perfect + c.BURN_GRACE) return 'burning';
    return 'burnt';
  }

  function startCook(s, dish, slot) {
    var c = cfg();
    var g = s.grill[slot];
    if (!g || g.dish || !c.DISHES[dish] || !c.DISHES[dish].grill) return false;
    if (s.menu.indexOf(dish) < 0) return false;
    g.dish = dish; g.t = 0; g.warned = false;
    ev(s, { k: 'cookStart', slot: slot, dish: dish });
    return true;
  }

  /* ---------------- serving ---------------- */

  function findCust(s, id) {
    var i;
    for (i = 0; i < s.customers.length; i++) if (s.customers[i].id === id) return s.customers[i];
    for (i = 0; i < s.driveup.length; i++) if (s.driveup[i].id === id) return s.driveup[i];
    return null;
  }

  function expectedSeq(s, channel) {
    var list = (channel === 'du') ? s.driveup : s.customers;
    var m = Infinity, i;
    for (i = 0; i < list.length; i++) {
      var cu = list[i];
      if (cu.state === 'waiting' && cu.seq < m) m = cu.seq;
    }
    return m;
  }

  function rateFood(s, src) {
    // -> 'perfect' | 'ok' | 'bad' | null (nothing servable)
    var c = cfg();
    if (src.kind === 'cooler') return 'perfect';
    if (src.kind === 'grill') {
      var g = s.grill[src.i];
      if (!g || !g.dish) return null;
      var st = grillState(s, g);
      if (st === 'perfect') return 'perfect';
      if (st === 'burning') return 'ok';
      return null; // cooking, burnt, empty
    }
    if (src.kind === 'holding') {
      var h = s.holding[src.i];
      if (!h || !h.dish) return null;
      if (h.fresh > c.HOLD_PERFECT) return 'perfect';
      if (h.fresh > c.HOLD_OK) return 'ok';
      return 'bad';
    }
    return null;
  }

  function srcDish(s, src) {
    if (src.kind === 'cooler') return 'agua';
    if (src.kind === 'grill') return s.grill[src.i] ? s.grill[src.i].dish : null;
    if (src.kind === 'holding') return s.holding[src.i] ? s.holding[src.i].dish : null;
    return null;
  }

  function clearSrc(s, src) {
    if (src.kind === 'grill') { s.grill[src.i].dish = null; s.grill[src.i].t = 0; s.grill[src.i].warned = false; }
    else if (src.kind === 'holding') { s.holding[src.i].dish = null; s.holding[src.i].fresh = 1; }
  }

  function buzzBy(s, d) {
    var c = cfg();
    s.buzz += d;
    if (s.buzz < 0) s.buzz = 0;
    if (s.buzz > c.BUZZ_MAX) s.buzz = c.BUZZ_MAX;
  }

  function serve(s, custId, src) {
    var c = cfg();
    var cust = findCust(s, custId);
    if (!cust || cust.state !== 'waiting') return false;
    var dish = srcDish(s, src);
    if (!dish) return false;
    var wantIdx = -1, i;
    for (i = 0; i < cust.dishes.length; i++) {
      if (cust.got.indexOf(i) < 0 && cust.dishes[i] === dish) { wantIdx = i; break; }
    }
    if (wantIdx < 0) { // wrong dish for this customer: a mistake, food kept
      ev(s, { k: 'wrongDish', id: custId });
      loseCombo(s);
      return false;
    }
    var rating = rateFood(s, src);
    if (!rating) return false; // not ready / burnt — UI should trash instead
    clearSrc(s, src);
    cust.got.push(wantIdx);
    var d = c.DISHES[dish];
    var inSeq = cust.seq === expectedSeq(s, cust.channel);
    var mult = 1, comboNote = null;
    if (rating === 'perfect') {
      if (inSeq) {
        s.combo++;
        if (s.combo > s.maxCombo) s.maxCombo = s.combo;
        mult = 1 + Math.min(s.combo, c.COMBO_CAP) * c.COMBO_STEP;
        if (c.COMBO_MILESTONES.indexOf(s.combo) >= 0) comboNote = s.combo;
      } else {
        loseCombo(s); // served out of order: clean plate, no combo
      }
      buzzBy(s, c.BUZZ_PERFECT);
      s.stats.perfect++;
    } else if (rating === 'ok') {
      buzzBy(s, c.BUZZ_OK);
      s.stats.ok++;
    } else {
      buzzBy(s, c.BUZZ_BAD);
      loseCombo(s);
      s.stats.bad++;
      if (cust.arch === 'critic') s.criticFailed = true;
    }
    var tipMult = c.ARCH[cust.arch].tip * (s.up.chalk ? 1.12 : 1);
    var tip = d.price * tipMult * mult;
    var isSpecial = !!(s.special && dish === s.special);
    if (isSpecial) tip *= 1.5;
    s.revenue += d.price + tip;
    s.coins += d.price + tip;
    s.stats.served++;
    if (cust.regIdx >= 0) {
      var r = s.regulars[cust.regIdx];
      r.visits++;
      if (!r.unlocked && r.visits >= c.USUAL_VISITS) {
        r.unlocked = true;
        ev(s, { k: 'usual', name: r.name });
      }
    }
    if (cust.arch === 'critic') s.criticServed = true;
    if (cust.got.length >= cust.dishes.length) {
      cust.state = 'served';
      ev(s, { k: 'served', id: cust.id, rating: rating, tip: tip, combo: s.combo, milestone: comboNote, channel: cust.channel, special: isSpecial });
      removeCust(s, cust);
    } else {
      ev(s, { k: 'servedPart', id: cust.id, rating: rating, tip: tip, combo: s.combo, milestone: comboNote, special: isSpecial });
    }
    return true;
  }

  function loseCombo(s) {
    if (s.combo >= 3) ev(s, { k: 'comboLost', n: s.combo });
    s.combo = 0;
  }

  function removeCust(s, cust) {
    var list = (cust.channel === 'du') ? s.driveup : s.customers;
    var i = list.indexOf(cust);
    if (i >= 0) list.splice(i, 1);
  }

  function walkout(s, cust) {
    cust.state = 'walked';
    ev(s, { k: cust.channel === 'du' ? 'duWalkout' : 'walkout', id: cust.id, arch: cust.arch });
    buzzBy(s, cfg().BUZZ_WALKOUT);
    loseCombo(s);
    s.stats.walkouts++;
    if (cust.arch === 'critic') s.criticFailed = true;
    removeCust(s, cust);
  }

  /* ---------------- actions ---------------- */

  function doAction(s, a) {
    var c = cfg();
    switch (a.t) {
      case 'cook': return startCook(s, a.dish, a.slot);
      case 'serve': return serve(s, a.cust, a.src);
      case 'hold': {
        var g = s.grill[a.slot], h = s.holding[a.h];
        if (!g || !h || !g.dish || h.dish) return false;
        var st = grillState(s, g);
        if (st === 'burnt' || st === 'cooking') return false;
        h.dish = g.dish; h.fresh = 1;
        g.dish = null; g.t = 0; g.warned = false;
        ev(s, { k: 'held', h: a.h, dish: h.dish });
        return true;
      }
      case 'trash': {
        if (a.kind === 'grill') {
          var gg = s.grill[a.i];
          if (!gg || !gg.dish) return false;
          var gst = grillState(s, gg);
          if (gst === 'burnt') { s.stats.burntTrashed++; buzzBy(s, c.BUZZ_BURNT_TRASH); }
          gg.dish = null; gg.t = 0; gg.warned = false;
          ev(s, { k: 'trashed', kind: 'grill', i: a.i });
          return true;
        }
        if (a.kind === 'holding') {
          var hh = s.holding[a.i];
          if (!hh || !hh.dish) return false;
          if (hh.fresh <= 0) s.stats.spoiledTrashed++;
          hh.dish = null; hh.fresh = 1;
          ev(s, { k: 'trashed', kind: 'holding', i: a.i });
          return true;
        }
        return false;
      }
      case 'usual': {
        // One-tap prep: start the regular's favorite on a free grill slot (or cooler).
        var cust = findCust(s, a.cust);
        if (!cust || cust.regIdx < 0 || !cust.usual) return false;
        var fav = s.regulars[cust.regIdx].fav;
        var dd = c.DISHES[fav];
        if (!dd.grill) { // agua: instant, straight onto their ticket
          cust.got.push(cust.dishes.indexOf(fav));
          s.stats.usualPreps++;
          ev(s, { k: 'usualPrep', id: cust.id, dish: fav, instant: true });
          if (cust.got.length >= cust.dishes.length) { cust.state = 'served'; removeCust(s, cust); }
          return true;
        }
        for (var i = 0; i < s.grill.length; i++) {
          if (!s.grill[i].dish) {
            s.grill[i].dish = fav; s.grill[i].t = 0; s.grill[i].warned = false;
            s.stats.usualPreps++;
            ev(s, { k: 'usualPrep', id: cust.id, dish: fav, slot: i });
            return true;
          }
        }
        ev(s, { k: 'usualFail', id: cust.id });
        return false;
      }
      case 'extinguish': return false; // reserved
      default: return false;
    }
  }

  /* ---------------- update ---------------- */

  function update(s, dt, actions) {
    var c = cfg();
    if (s.phase !== 'shift' || dt <= 0) return;
    if (dt > 0.1) dt = 0.1; // clamp: a lag spike must never spiral the sim
    var i, g, cust;

    s.t += dt;

    // arrivals
    s.arriveT -= dt;
    if (s.arriveT <= 0) {
      spawnCustomer(s, 'win');
      var interval = c.ARRIVE_BASE + (c.ARRIVE_MIN - c.ARRIVE_BASE) * (s.buzz / c.BUZZ_MAX);
      s.arriveT = interval * (1 - c.ARRIVE_JITTER + s.rng() * 2 * c.ARRIVE_JITTER);
    }
    s.duArriveT -= dt;
    if (s.duArriveT <= 0) {
      spawnCustomer(s, 'du');
      s.duArriveT = (14 + s.rng() * 10) * (1 - 0.4 * (s.buzz / c.BUZZ_MAX));
    }

    // grill timers
    for (i = 0; i < s.grill.length; i++) {
      g = s.grill[i];
      if (!g.dish) continue;
      var was = grillState(s, g);
      g.t += dt;
      var now = grillState(s, g);
      var d = c.DISHES[g.dish];
      if (was === 'cooking' && now !== 'cooking') ev(s, { k: 'done', slot: i, dish: g.dish });
      var warnAt = d.cook + d.perfect + c.BURN_GRACE - (c.WARN_EARLY + (s.up.alarm ? 4 : 0));
      if (!g.warned && g.t >= warnAt && now !== 'burnt') { g.warned = true; ev(s, { k: 'burnWarn', slot: i }); }
      if (now === 'burnt' && was !== 'burnt') ev(s, { k: 'burnt', slot: i });
      // auto-scraper upgrade clears burnt food by itself
      if (s.up.scraper && now === 'burnt') {
        g.scrapeT = (g.scrapeT || 0) + dt;
        if (g.scrapeT >= 4) { g.dish = null; g.t = 0; g.warned = false; g.scrapeT = 0; ev(s, { k: 'scraped', slot: i }); }
      }
    }

    // holding spoilage
    var spoilRate = 1 / (c.HOLD_SPOIL * (s.up.warmer ? 1.3 : 1));
    for (i = 0; i < s.holding.length; i++) {
      var h = s.holding[i];
      if (!h.dish) continue;
      var wasFresh = h.fresh;
      h.fresh -= dt * spoilRate;
      if (h.fresh <= 0) { h.fresh = 0; ev(s, { k: 'spoiled', h: i }); }
      else if (wasFresh > 0.2 && h.fresh <= 0.2) ev(s, { k: 'staleWarn', h: i });
    }

    // patience
    var all = s.customers.concat(s.driveup);
    for (i = all.length - 1; i >= 0; i--) {
      cust = all[i];
      if (cust.state !== 'waiting') continue;
      cust.patience -= dt;
      if (cust.patience <= 0) walkout(s, cust);
    }

    // actions
    if (actions) for (i = 0; i < actions.length; i++) doAction(s, actions[i]);

    // shift end
    if (s.t >= s.dur && !s.done) {
      s.done = true; s.phase = 'done';
      s.summary = makeSummary(s);
      ev(s, { k: 'shiftEnd', summary: s.summary });
    }
  }

  function makeSummary(s) {
    var c = cfg();
    var stars = 3;
    if (s.stats.walkouts > 0 || s.stats.bad > 0) stars = 2;
    if (s.stats.walkouts > 2 || s.stats.bad > 2) stars = 1;
    if (s.criticFailed) stars = Math.min(stars, 1);
    if (s.stats.served === 0) stars = 0;
    var score = Math.round(s.revenue * c.SCORE_REV + s.stats.perfect * c.SCORE_PERFECT + s.maxCombo * c.SCORE_COMBO);
    return {
      revenue: Math.round(s.revenue * 100) / 100,
      served: s.stats.served, perfect: s.stats.perfect, ok: s.stats.ok, bad: s.stats.bad,
      walkouts: s.stats.walkouts, maxCombo: s.maxCombo,
      stars: stars, score: score, buzz: Math.round(s.buzz)
    };
  }

  /* menu budget: pure helper for the menu screen */
  function menuPoints(menu) {
    var c = cfg(), pts = 0;
    for (var i = 0; i < menu.length; i++) pts += (c.DISHES[menu[i]] || { pts: 0 }).pts;
    return pts;
  }

  return {
    createShift: createShift,
    update: update,
    drain: drain,
    grillState: grillState,
    menuPoints: menuPoints,
    hashStr: hashStr,
    mulberry32: mulberry32
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { FTSIM: FTSIM, FTC: (typeof FTC !== 'undefined' ? FTC : null) };
