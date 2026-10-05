/* Wildgrove — simulation engine.
 * Pure logic: no DOM, no canvas, no rAF. Wall-clock driven; tick(now)
 * advances the world from its last timestamp, so the forest lives while
 * the player is away. Seeded PRNG keeps ambient variation reproducible.
 * Soft-wild: predators chase, prey ALWAYS reaches cover. Nothing dies.
 */
(function () {
  // NB: reference globals via window — a bare `FLORA` here would resolve
  // to this IIFE's own hoisted `var FLORA` (undefined), not species.js.
  var S = (typeof module !== "undefined") ? require("./species.js")
      : { FLORA: window.FLORA, FAUNA: window.FAUNA, ZONES: window.ZONES, VITALITY_STAGES: window.VITALITY_STAGES };
  var FLORA = S.FLORA, FAUNA = S.FAUNA, ZONES = S.ZONES, STAGES = S.VITALITY_STAGES;

  var MIN = 60000, HOUR = 3600000, DAY = 86400000;
  var WORLD_W = 1000, WORLD_H = 1600;
  var MAX_CATCHUP = 30 * DAY;
  var CHUNK = 10 * MIN;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function dist(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy);
  }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

  /* ---------------- world construction ---------------- */

  function createWorld(seed, now) {
    var rng = mulberry32(seed >>> 0);
    return {
      seed: seed >>> 0, rngState: seed >>> 0,
      now: now, nextId: 1,
      plants: [], animals: [],
      weather: "clear", weatherDay: Math.floor(now / DAY),
      seasonIdx: 0, seasonStart: now,
      arrivals: {},        // speciesId -> last arrival timestamp
      nestCooldown: {},    // speciesId -> last nesting timestamp
      alarmAt: 0,          // last blue-jay alarm
      stats: { planted: 0, watered: 0, arrivals: 0, births: 0, chases: 0 },
      _events: [],
      _rng: rng
    };
  }

  function rngNext(w) {
    // advance and persist the seeded rng so saves stay deterministic
    var a = w.rngState | 0;
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    w.rngState = a | 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function emit(w, type, data) {
    data = data || {};
    data.t = w.now; data.type = type;
    w._events.push(data);
  }

  function zoneAt(y) {
    for (var i = 0; i < ZONES.length; i++) {
      var z = ZONES[i];
      if (y >= z.y[0] && y <= z.y[1]) return z;
    }
    return ZONES[0];
  }

  function zoneUnlocked(w, zoneId) {
    for (var i = 0; i < ZONES.length; i++) {
      if (ZONES[i].id === zoneId) return vitality(w) >= ZONES[i].vitality;
    }
    return false;
  }

  function seasonOf(w) {
    return ["spring", "summer", "autumn", "winter"][w.seasonIdx % 4];
  }

  function hourOf(ms) {
    var d = new Date(ms);
    return d.getHours() + d.getMinutes() / 60;
  }

  function isActive(sp, hour) {
    for (var i = 0; i < sp.active.length; i++) {
      var a = sp.active[i][0], b = sp.active[i][1];
      if (a <= b) { if (hour >= a && hour < b) return true; }
      else { if (hour >= a || hour < b) return true; }
    }
    return false;
  }

  /* ---------------- vitality ---------------- */

  function vitality(w) {
    var plantScore = 0;
    for (var i = 0; i < w.plants.length; i++) {
      var p = w.plants[i], cfg = FLORA[p.sp];
      var stage = plantStage(p, w);
      if (stage === "mature") plantScore += cfg.kind === "tree" ? 4 : (cfg.kind === "bush" ? 2 : 1);
      else if (stage === "young") plantScore += 0.5;
    }
    plantScore = Math.min(40, plantScore);
    var speciesSeen = {}, residents = 0;
    for (var j = 0; j < w.animals.length; j++) {
      speciesSeen[w.animals[j].sp] = true;
      if (w.animals[j].resident) residents++;
    }
    var diversity = Math.min(40, Object.keys(speciesSeen).length * 4);
    var residentScore = Math.min(10, residents);
    var pairBonus = Math.min(10, breedingPairs(w) * 2);
    return Math.round(clamp(plantScore + diversity + residentScore + pairBonus, 0, 100));
  }

  function breedingPairs(w) {
    var bySp = {};
    for (var i = 0; i < w.animals.length; i++) {
      var a = w.animals[i];
      if (!a.resident || a.juvenile) continue;
      bySp[a.sp] = bySp[a.sp] || { m: 0, f: 0 };
      bySp[a.sp][a.sex]++;
    }
    var n = 0;
    for (var k in bySp) n += Math.min(bySp[k].m, bySp[k].f);
    return n;
  }

  function stageOf(w) {
    var v = vitality(w), s = STAGES[0];
    for (var i = 0; i < STAGES.length; i++) if (v >= STAGES[i].min) s = STAGES[i];
    return s;
  }

  function plantStage(p, w) {
    var cfg = FLORA[p.sp];
    var ageDays = (w.now - p.plantedAt) / DAY;
    var frac = ageDays / cfg.growthDays;
    if (frac >= 1) return "mature";
    if (frac >= 0.5) return "young";
    if (frac >= 0.12) return "sprout";
    return "seed";
  }

  function matureCount(w, floraId) {
    var n = 0;
    for (var i = 0; i < w.plants.length; i++)
      if (w.plants[i].sp === floraId && plantStage(w.plants[i], w) === "mature") n++;
    return n;
  }

  function matureTrees(w) {
    var n = 0;
    for (var i = 0; i < w.plants.length; i++) {
      var p = w.plants[i];
      if (FLORA[p.sp].kind === "tree" && plantStage(p, w) === "mature") n++;
    }
    return n;
  }

  function foodAvailable(w, diet) {
    for (var i = 0; i < w.plants.length; i++) {
      var p = w.plants[i];
      if (plantStage(w.plants[i], w) !== "mature") continue;
      var foods = FLORA[p.sp].food;
      for (var d = 0; d < diet.length; d++)
        if (foods.indexOf(diet[d]) >= 0) return p;
    }
    return null;
  }

  function countSpecies(w, spId) {
    var n = 0;
    for (var i = 0; i < w.animals.length; i++) if (w.animals[i].sp === spId) n++;
    return n;
  }

  /* ---------------- player actions ---------------- */

  function plant(w, floraId, x, y, now) {
    var cfg = FLORA[floraId];
    if (!cfg) return { error: "unknown plant" };
    var z = zoneAt(y);
    if (!zoneUnlocked(w, z.id)) return { error: "that part of the grove is still asleep" };
    x = clamp(x, 30, WORLD_W - 30); y = clamp(y, z.y[0] + 20, z.y[1] - 20);
    var minDist = cfg.kind === "tree" ? 90 : 40;
    for (var i = 0; i < w.plants.length; i++) {
      if (dist(x, y, w.plants[i].x, w.plants[i].y) < minDist)
        return { error: "too close to another plant" };
    }
    var p = {
      id: w.nextId++, sp: floraId, x: x, y: y,
      plantedAt: now, water: 0.8
    };
    w.plants.push(p);
    w.stats.planted++;
    emit(w, "planted", { plantId: p.id, flora: floraId });
    return { ok: true, plant: p };
  }

  function water(w, x, y, now) {
    var n = 0;
    for (var i = 0; i < w.plants.length; i++) {
      var p = w.plants[i];
      if (dist(x, y, p.x, p.y) < 130 && p.water < 1) { p.water = 1; n++; }
    }
    if (n > 0) w.stats.watered += n;
    return { watered: n };
  }

  /* ---------------- fauna ---------------- */

  function freeName(w, spId) {
    var pool = FAUNA[spId].names.slice();
    var used = {};
    for (var i = 0; i < w.animals.length; i++)
      if (w.animals[i].sp === spId) used[w.animals[i].name] = true;
    var avail = pool.filter(function (n) { return !used[n]; });
    if (avail.length) return avail[Math.floor(rngNext(w) * avail.length)];
    return FAUNA[spId].name + " " + (countSpecies(w, spId) + 1);
  }

  function spawnAnimal(w, spId, x, y, opts) {
    opts = opts || {};
    var sp = FAUNA[spId];
    var a = {
      id: w.nextId++, sp: spId, name: opts.name || freeName(w, spId),
      sex: opts.sex || (rngNext(w) < 0.5 ? "m" : "f"),
      x: x, y: y, tx: x, ty: y,
      denX: opts.denX != null ? opts.denX : x,
      denY: opts.denY != null ? opts.denY : y,
      state: "wander", stateAt: w.now,
      hunger: 70, thirst: 70, energy: 80, fear: 0,
      resident: !!opts.resident, visits: opts.resident ? 3 : 1,
      juvenile: !!opts.juvenile, bornAt: opts.bornAt || w.now,
      gen: opts.gen || 1,
      motherId: opts.motherId || null, fatherId: opts.fatherId || null,
      pregnant: null, hidingUntil: 0, lastSeen: w.now
    };
    w.animals.push(a);
    return a;
  }

  function arrivalSpot(w, spId) {
    // arrive at the edge of a suitable unlocked zone
    var sp = FAUNA[spId];
    var z = ZONES[0];
    if (sp.requires.water && zoneUnlocked(w, "pond")) z = ZONES[1];
    else if ((sp.requires.matureTrees || 0) >= 4 && zoneUnlocked(w, "deepwood")) z = ZONES[2];
    else if (zoneUnlocked(w, "pond") && rngNext(w) < 0.4) z = ZONES[1];
    return {
      x: 80 + rngNext(w) * (WORLD_W - 160),
      y: z.y[0] + 60 + rngNext(w) * (z.y[1] - z.y[0] - 120)
    };
  }

  function requirementsMet(w, spId) {
    var sp = FAUNA[spId], req = sp.requires;
    var v = vitality(w);
    if (v < req.vitality) return false;
    if (req.water && !zoneUnlocked(w, "pond")) return false;
    if (req.matureTrees && matureTrees(w) < req.matureTrees) return false;
    if (req.plants) {
      for (var f in req.plants) {
        var n = 0;
        for (var i =  0; i < w.plants.length; i++)
          if (w.plants[i].sp === f && plantStage(w.plants[i], w) !== "seed") n++;
        if (n < req.plants[f]) return false;
      }
    }
    if (req.anyFood && !foodAvailable(w, req.anyFood)) return false;
    if (req.prey) {
      var prey = 0;
      for (var s = 0; s < sp.predator.prey.length; s++) prey += countSpecies(w, sp.predator.prey[s]);
      if (prey < req.prey) return false;
    }
    return true;
  }

  function tryArrivals(w) {
    var hour = hourOf(w.now);
    for (var spId in FAUNA) {
      var sp = FAUNA[spId];
      var cap = sp.social === "flock" || sp.social === "herd" ? 8 : 5;
      if (countSpecies(w, spId) >= cap) continue;
      var last = w.arrivals[spId] || 0;
      if (w.now - last < 2 * DAY) continue;
      if (!requirementsMet(w, spId)) continue;
      // arrivals happen when the species is becoming active (they show up at dawn/dusk edges)
      var p = 0.45;
      if (rngNext(w) < p) {
        var s = arrivalSpot(w, spId);
        var n = sp.social === "solitary" ? 1 : (sp.social === "pair" ? 2 : 2 + Math.floor(rngNext(w) * 3));
        n = Math.min(n, cap - countSpecies(w, spId));
        var first = null;
        for (var i = 0; i < n; i++) {
          var a = spawnAnimal(w, spId,
            clamp(s.x + (rngNext(w) - 0.5) * 120, 40, WORLD_W - 40),
            clamp(s.y + (rngNext(w) - 0.5) * 120, 40, WORLD_H - 40));
          if (!first) first = a;
        }
        w.arrivals[spId] = w.now;
        w.stats.arrivals++;
        emit(w, "arrival", { species: spId, name: first.name, count: n, hour: Math.round(hour) });
      }
    }
  }

  function nearestCover(w, a) {
    // dense plants or the den — prey always reaches it in soft-wild
    var best = null, bd = 1e9;
    for (var i = 0; i < w.plants.length; i++) {
      var p = w.plants[i], cfg = FLORA[p.sp];
      if (cfg.shelter >= 0.5 && plantStage(p, w) !== "seed") {
        var d = dist(a.x, a.y, p.x, p.y);
        if (d < bd) { bd = d; best = p; }
      }
    }
    var dd = dist(a.x, a.y, a.denX, a.denY);
    if (dd < bd) return { x: a.denX, y: a.denY };
    return best ? { x: best.x, y: best.y } : { x: a.denX, y: a.denY };
  }

  function updateAnimal(w, a, dt) {
    var sp = FAUNA[a.sp];
    var hour = hourOf(w.now);
    var active = isActive(sp, hour);
    var speed = sp.speed * (a.juvenile ? 0.65 : 1);

    // juvenile growth
    if (a.juvenile && (w.now - a.bornAt) / DAY >= sp.breed.matureDays) {
      a.juvenile = false;
      emit(w, "grown", { animalId: a.id, species: a.sp, name: a.name });
    }

    // needs integrate (dt in seconds)
    var hungerRate = 100 / (9 * 3600);   // empty in ~9h
    var thirstRate = 100 / (7 * 3600);
    a.hunger = clamp(a.hunger - hungerRate * dt, 0, 100);
    a.thirst = clamp(a.thirst - thirstRate * dt, 0, 100);
    if (active) a.energy = clamp(a.energy - dt * 100 / (14 * 3600), 0, 100);
    else a.energy = clamp(a.energy + dt * 100 / (6 * 3600), 0, 100); // sleep restores
    a.fear = clamp(a.fear - dt * 20, 0, 100);

    // --- state transitions ---
    if (a.state === "flee") {
      // reached cover?
      if (dist(a.x, a.y, a.tx, a.ty) < 12) {
        a.state = "hide"; a.stateAt = w.now;
        a.hidingUntil = w.now + (2 + rngNext(w) * 4) * MIN;
        emit(w, "escaped", { animalId: a.id, species: a.sp, name: a.name });
      }
    } else if (a.state === "hide") {
      if (w.now >= a.hidingUntil && a.fear < 30) { a.state = "wander"; a.stateAt = w.now; }
    } else if (!active && a.energy < 92) {
      if (a.state !== "sleep") { a.state = "sleep"; a.stateAt = w.now; }
    } else if (a.state === "sleep" && (active || a.energy >= 99)) {
      a.state = "wander"; a.stateAt = w.now;
    } else if (a.fear > 60 && a.state !== "flee") {
      var c = nearestCover(w, a);
      a.tx = c.x; a.ty = c.y; a.state = "flee"; a.stateAt = w.now;
    } else if (a.thirst < 35 && zoneUnlocked(w, "pond")) {
      if (a.state !== "drink") { a.state = "drink"; a.stateAt = w.now; a.tx = 500; a.ty = 800; }
      if (dist(a.x, a.y, 500, 800) < 30) a.thirst = Math.min(100, a.thirst + dt * 8);
      if (a.thirst > 90) { a.state = "wander"; a.stateAt = w.now; }
    } else if (a.hunger < 45 && !sp.predator) {
      var food = foodAvailable(w, sp.diet);
      if (food) {
        if (a.state !== "forage") { a.state = "forage"; a.stateAt = w.now; a.tx = food.x; a.ty = food.y; }
        if (dist(a.x, a.y, food.x, food.y) < 26) a.hunger = Math.min(100, a.hunger + dt * 6);
        if (a.hunger > 85) { a.state = "wander"; a.stateAt = w.now; }
      } else if (a.state !== "wander") { a.state = "wander"; a.stateAt = w.now; }
    } else if (sp.predator && a.hunger < 55) {
      // HUNT — soft-wild: the chase always ends with escape
      if (a.state !== "hunt") {
        var prey = findPrey(w, a);
        if (prey) {
          a.state = "hunt"; a.stateAt = w.now; a.preyId = prey.id;
          prey.fear = 100;
          var pc = nearestCover(w, prey);
          prey.tx = pc.x; prey.ty = pc.y; prey.state = "flee"; prey.stateAt = w.now;
          w.stats.chases++;
          jayAlarm(w, a);
          emit(w, "chase", { predatorId: a.id, predator: a.sp, predatorName: a.name, preyId: prey.id, prey: prey.sp, preyName: prey.name });
        }
      }
    } else if (a.state === "hunt") {
      var pr = byId(w, a.preyId);
      if (!pr || pr.state === "hide" || w.now - a.stateAt > 25000) {
        // give up — ate "elsewhere", off screen, never shown
        a.state = "wander"; a.stateAt = w.now; a.preyId = null;
        a.hunger = Math.min(100, a.hunger + 30);
      } else { a.tx = pr.x; a.ty = pr.y; }
    } else if (a.pregnant && w.now >= a.pregnant.dueAt) {
      giveBirth(w, a);
    } else if (a.state === "wander" && w.now - a.stateAt > (20 + rngNext(w) * 40) * 1000) {
      // pick a new amble target in home range
      var ang = rngNext(w) * Math.PI * 2, r = rngNext(w) * sp.homeRange;
      a.tx = clamp(a.denX + Math.cos(ang) * r, 40, WORLD_W - 40);
      a.ty = clamp(a.denY + Math.sin(ang) * r, 40, WORLD_H - 40);
      a.stateAt = w.now;
      // autumn caching behavior — visible realism
      if (sp.cache && seasonOf(w) === "autumn" && rngNext(w) < 0.3) {
        var oak = foodAvailable(w, ["acorn"]);
        if (oak) { a.tx = oak.x; a.ty = oak.y; }
      }
    }

    // --- movement ---
    if (a.state === "sleep") return;
    var dx = a.tx - a.x, dy = a.ty - a.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d > 4) {
      var step = speed * dt * (a.state === "flee" ? 1.5 : 1) * (a.state === "hunt" ? 1.15 : 1);
      // prey is always slightly faster than the hunter — escape is guaranteed
      if (a.state === "flee") step *= 1.12;
      var mv = Math.min(d, step);
      a.x += dx / d * mv; a.y += dy / d * mv;
    }
  }

  function byId(w, id) {
    for (var i = 0; i < w.animals.length; i++) if (w.animals[i].id === id) return w.animals[i];
    return null;
  }

  function findPrey(w, hunter) {
    var sp = FAUNA[hunter.sp];
    var best = null, bd = 1e9;
    for (var i = 0; i < w.animals.length; i++) {
      var a = w.animals[i];
      if (sp.predator.prey.indexOf(a.sp) < 0) continue;
      if (a.state === "hide") continue;
      if (sp.predator.nightOnly) {
        var h = hourOf(w.now);
        if (h >= 6 && h < 19) continue;
      }
      var d = dist(hunter.x, hunter.y, a.x, a.y);
      if (d < 320 && d < bd) { bd = d; best = a; }
    }
    return best;
  }

  function jayAlarm(w, predator) {
    if (w.now - w.alarmAt < 5 * MIN) return;
    for (var i = 0; i < w.animals.length; i++) {
      var a = w.animals[i];
      if (a.sp === "blue_jay" && dist(a.x, a.y, predator.x, predator.y) < 420) {
        w.alarmAt = w.now;
        emit(w, "alarm", { jayId: a.id, jayName: a.name, predator: predator.sp });
        // everyone nearby dives for cover
        for (var j = 0; j < w.animals.length; j++) {
          var b = w.animals[j];
          var bsp = FAUNA[b.sp];
          if (bsp.fears.indexOf(predator.sp) >= 0 && dist(b.x, b.y, predator.x, predator.y) < 380) {
            b.fear = Math.max(b.fear, 70);
          }
        }
        return;
      }
    }
  }

  /* ---------------- breeding ---------------- */

  function nestSiteOk(w, spId) {
    var need = FAUNA[spId].breed.need;
    if (need === "den" || need === "sandy_patch") return zoneUnlocked(w, "pond");
    if (need === "oak_mature") return matureCount(w, "white_oak") >= 1;
    if (need === "tree_hollow" || need === "tree" || need === "cover") return matureTrees(w) >= 2;
    if (need === "ground_nest") return matureCount(w, "bluestem") >= 2;
    if (need === "shrub") return matureCount(w, "blackberry") >= 1;
    if (need.indexOf("shelter_") === 0) {
      var needV = parseFloat(need.slice(8));
      var shelter = 0;
      for (var i = 0; i < w.plants.length; i++) {
        var p = w.plants[i];
        if (plantStage(p, w) !== "seed") shelter += FLORA[p.sp].shelter * 0.2;
      }
      return shelter >= needV;
    }
    return true;
  }

  function tryBreeding(w) {
    for (var spId in FAUNA) {
      var sp = FAUNA[spId];
      if (w.now - (w.nestCooldown[spId] || 0) < 6 * DAY) continue;
      if (!nestSiteOk(w, spId)) continue;
      var males = [], females = [];
      for (var i = 0; i < w.animals.length; i++) {
        var a = w.animals[i];
        if (a.sp !== spId || !a.resident || a.juvenile || a.pregnant) continue;
        (a.sex === "m" ? males : females).push(a);
      }
      if (!males.length || !females.length) continue;
      if (countSpecies(w, spId) >= (sp.social === "flock" || sp.social === "herd" ? 8 : 5)) continue;
      var mom = females[Math.floor(rngNext(w) * females.length)];
      var dad = males[Math.floor(rngNext(w) * males.length)];
      var litter = sp.breed.litter[0] + Math.floor(rngNext(w) * (sp.breed.litter[1] - sp.breed.litter[0] + 1));
      mom.pregnant = { fatherId: dad.id, dueAt: w.now + (2 + rngNext(w) * 2) * DAY, litter: litter };
      w.nestCooldown[spId] = w.now;
      emit(w, "nesting", { species: spId, motherId: mom.id, motherName: mom.name, fatherName: dad.name });
    }
  }

  function giveBirth(w, mom) {
    var sp = FAUNA[mom.sp];
    var litter = mom.pregnant.litter;
    mom.pregnant = null;
    var kids = [];
    for (var i = 0; i < litter; i++) {
      var k = spawnAnimal(w, mom.sp,
        clamp(mom.denX + (rngNext(w) - 0.5) * 60, 40, WORLD_W - 40),
        clamp(mom.denY + (rngNext(w) - 0.5) * 60, 40, WORLD_H - 40),
        { juvenile: true, bornAt: w.now, gen: mom.gen + 1, motherId: mom.id, resident: true });
      kids.push(k.name);
    }
    w.stats.births += litter;
    emit(w, "birth", { species: mom.sp, motherId: mom.id, motherName: mom.name, count: litter, names: kids });
  }

  function updateResidency(w) {
    // visitors become residents after repeated days; animals leave if habitat collapses
    for (var i = w.animals.length - 1; i >= 0; i--) {
      var a = w.animals[i];
      if (!a.resident) {
        a.visits += 0.5; // called once per sim-day
        if (a.visits >= 3) {
          a.resident = true;
          emit(w, "resident", { animalId: a.id, species: a.sp, name: a.name });
        }
      } else if (!a.juvenile && !requirementsMet(w, a.sp)) {
        a.neglectDays = (a.neglectDays || 0) + 1;
        if (a.neglectDays > 3) {
          w.animals.splice(i, 1);
          emit(w, "departure", { species: a.sp, name: a.name });
        }
      } else {
        a.neglectDays = 0;
      }
    }
  }

  /* ---------------- plants ---------------- */

  function updatePlants(w, dt) {
    var season = seasonOf(w);
    var raining = w.weather === "rain" || w.weather === "storm";
    for (var i = 0; i < w.plants.length; i++) {
      var p = w.plants[i], cfg = FLORA[p.sp];
      if (raining) p.water = 1;
      else p.water = clamp(p.water - dt / (2 * DAY), 0, 1);
      // self-seeding
      if (plantStage(p, w) === "mature" && rngNext(w) < cfg.spread * (dt / DAY)) {
        var ang = rngNext(w) * Math.PI * 2, r = 60 + rngNext(w) * 120;
        var nx = clamp(p.x + Math.cos(ang) * r, 30, WORLD_W - 30);
        var ny = clamp(p.y + Math.sin(ang) * r, 30, WORLD_H - 30);
        var ok = true;
        for (var j = 0; j < w.plants.length; j++)
          if (dist(nx, ny, w.plants[j].x, w.plants[j].y) < 35) { ok = false; break; }
        if (ok && zoneUnlocked(w, zoneAt(ny).id)) {
          w.plants.push({ id: w.nextId++, sp: p.sp, x: nx, y: ny, plantedAt: w.now, water: 0.7 });
          emit(w, "selfseed", { flora: p.sp });
        }
      }
    }
  }

  function updateWeather(w) {
    var day = Math.floor(w.now / DAY);
    if (day === w.weatherDay) return;
    w.weatherDay = day;
    var r = rngNext(w), prev = w.weather;
    if (prev === "clear") w.weather = r < 0.7 ? "clear" : (r < 0.9 ? "cloudy" : "rain");
    else if (prev === "cloudy") w.weather = r < 0.45 ? "clear" : (r < 0.75 ? "cloudy" : "rain");
    else if (prev === "rain") w.weather = r < 0.4 ? "clear" : (r < 0.65 ? "cloudy" : (r < 0.95 ? "rain" : "storm"));
    else w.weather = r < 0.6 ? "rain" : "cloudy";
    if (w.weather === "rain" || w.weather === "storm")
      emit(w, "weather", { weather: w.weather });
    // season advance: 14-day cycle
    var seasonIdx = Math.floor((w.now - w.seasonStart) / (14 * DAY)) % 4;
    if (seasonIdx !== w.seasonIdx) {
      w.seasonIdx = seasonIdx;
      emit(w, "season", { season: seasonOf(w) });
    }
    updateResidency(w);
  }

  /* ---------------- main tick ---------------- */

  function tick(w, now) {
    w._events = [];
    if (now < w.now) now = w.now; // time-travel guard
    var elapsed = Math.min(now - w.now, MAX_CATCHUP);
    var prevStage = stageOf(w).name;
    while (elapsed > 0) {
      var step = Math.min(elapsed, CHUNK);
      w.now += step;
      updateWeather(w);
      updatePlants(w, step / 1000);
      for (var i = 0; i < w.animals.length; i++) updateAnimal(w, w.animals[i], step / 1000);
      tryArrivals(w);
      tryBreeding(w);
      elapsed -= step;
    }
    w.now = now > w.now ? now : w.now;
    var st = stageOf(w).name;
    if (st !== prevStage) emit(w, "stage", { stage: st, vitality: vitality(w) });
    var ev = w._events;
    w._events = [];
    return ev;
  }

  /* ---------------- observation (for the inspect UI) ---------------- */

  function describeActivity(sp, hour) {
    if (isActive(sp, hour)) {
      if (hour < 7) return "out at first light";
      if (hour < 11) return "busy this morning";
      if (hour < 15) return "active midday";
      if (hour < 19) return "out in the evening";
      return "prowling the night";
    }
    return "resting now";
  }

  function observe(w, animalId) {
    var a = byId(w, animalId);
    if (!a) return null;
    var sp = FAUNA[a.sp];
    var hour = hourOf(w.now);
    var windows = sp.active.map(function (win) {
      function fmt(h) {
        var hh = Math.floor(h), mm = Math.round((h - hh) * 60);
        var ap = hh >= 12 ? "pm" : "am", h12 = hh % 12; if (h12 === 0) h12 = 12;
        return h12 + (mm ? ":" + (mm < 10 ? "0" : "") + mm : "") + ap;
      }
      return fmt(win[0]) + "–" + fmt(win[1]);
    }).join(", ");
    return {
      name: a.name, species: sp.name, blurb: sp.blurb,
      state: a.state, activity: describeActivity(sp, hour),
      activeHours: windows,
      diet: sp.diet.join(", "),
      resident: a.resident,
      juvenile: a.juvenile,
      generation: a.gen,
      likes: (sp.diet.join(" & ") || "hunting") + "; " +
        (sp.fears.length ? "fears " + sp.fears.filter(function (f) { return FAUNA[f]; })
          .map(function (f) { return FAUNA[f].name; }).join(", ") : "fears nothing here")
    };
  }

  /* ---------------- persistence ---------------- */

  function serialize(w) {
    return JSON.stringify({
      seed: w.seed, rngState: w.rngState, now: w.now, nextId: w.nextId,
      plants: w.plants, animals: w.animals,
      weather: w.weather, weatherDay: w.weatherDay,
      seasonIdx: w.seasonIdx, seasonStart: w.seasonStart,
      arrivals: w.arrivals, nestCooldown: w.nestCooldown,
      alarmAt: w.alarmAt, stats: w.stats
    });
  }

  function deserialize(json) {
    var d = JSON.parse(json);
    var w = createWorld(d.seed, d.now);
    w.rngState = d.rngState; w.nextId = d.nextId;
    w.plants = d.plants; w.animals = d.animals;
    w.weather = d.weather; w.weatherDay = d.weatherDay;
    w.seasonIdx = d.seasonIdx; w.seasonStart = d.seasonStart;
    w.arrivals = d.arrivals; w.nestCooldown = d.nestCooldown;
    w.alarmAt = d.alarmAt; w.stats = d.stats;
    return w;
  }

  var api = {
    createWorld: createWorld, tick: tick,
    plant: plant, water: water, observe: observe,
    vitality: vitality, stageOf: stageOf, stageName: function (w) { return stageOf(w).name; },
    seasonOf: seasonOf, hourOf: hourOf, isActive: isActive,
    zoneAt: zoneAt, zoneUnlocked: zoneUnlocked,
    plantStage: plantStage, serialize: serialize, deserialize: deserialize,
    WORLD_W: WORLD_W, WORLD_H: WORLD_H, DAY: DAY, HOUR: HOUR,
    FLORA: FLORA, FAUNA: FAUNA, ZONES: ZONES, STAGES: STAGES,
    _test: {
      spawnAnimal: spawnAnimal, requirementsMet: requirementsMet,
      tryArrivals: tryArrivals, tryBreeding: tryBreeding,
      nestSiteOk: nestSiteOk, byId: byId, updateResidency: updateResidency
    }
  };

  if (typeof module !== "undefined") module.exports = api;
  else { window.WG = api; }
})();
