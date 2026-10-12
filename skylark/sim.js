/* Skylark sim — pure logic, no DOM. Seeded PRNG, fixed-dt friendly.
 * Side-view bush-pilot flights: takeoff, cruise, landing. No fail states.
 */
'use strict';
var SK = (function () {

  /* seeded PRNG (mulberry32) */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- data ---------- */
  var PLANES = [
    { id: 'kite', name: 'Kite', desc: 'A ragged little bush Cub. Forgiving, lands anywhere.',
      maxSpeed: 95, cruiseSpeed: 70, climb: 55, vr: 42, pax: 2, cargo: 1,
      stripNeed: 300, price: 0, fuelUse: 1.0, forgive: 1.35 },
    { id: 'kestrel', name: 'Kestrel', desc: 'A honest twin-prop. Faster, roomier, thirstier.',
      maxSpeed: 150, cruiseSpeed: 115, climb: 80, vr: 62, pax: 4, cargo: 3,
      stripNeed: 520, price: 2400, fuelUse: 1.8, forgive: 1.0 },
    { id: 'merlin', name: 'Merlin', desc: 'A regional jet with manners. Long strips only.',
      maxSpeed: 230, cruiseSpeed: 180, climb: 120, vr: 95, pax: 6, cargo: 6,
      stripNeed: 800, price: 9800, fuelUse: 3.0, forgive: 0.8 },
  ];

  var STRIP_NAMES = ['Meadowlark Field', 'Cinder Hollow', 'Pebblebrook', 'Foxglove Meadows',
    'Tern Point', 'Alder Flats', 'Wrenwick', 'Harebell Downs', 'Duskmere', 'Larkspur Vale',
    'Briar Patch', 'Cloudcroft', 'Mothlight', 'Sedgewick', 'Poppyfield', 'Owler\'s Roost'];

  var PAX_FIRST = ['Mara', 'Theo', 'June', 'Silas', 'Wren', 'Otto', 'Lena', 'Pippa', 'Hugo',
    'Iris', 'Felix', 'Nora', 'Emmett', 'Clara', 'Rufus', 'Tilda', 'Amos', 'Bea', 'Casper', 'Della'];
  var PAX_LAST = ['Bramble', 'Nettle', 'Thistledown', 'Fernhill', 'Cloud', 'Marsh', 'Alder',
    'Brook', 'Hollow', 'Meadow', 'Wren', 'Finch', 'Sorrel', 'Tansy', 'Yarrow'];

  var TOWER_QUIPS = [
    'Winds are gentle. Enjoy it up there.',
    'Skies are clear all the way to {dest}.',
    'Mind the geese near the river bend.',
    'Lovely day for it. Take your time.',
  ];

  var RANKS = ['Student', 'Private Pilot', 'Commercial Pilot', 'Captain', 'Skylark'];

  /* ---------- world gen ---------- */
  function pickNames(rnd, n, avoid) {
    var pool = STRIP_NAMES.slice(), out = [];
    while (out.length < n && pool.length) {
      var i = Math.floor(rnd() * pool.length);
      var nm = pool.splice(i, 1)[0];
      if (avoid && avoid.indexOf(nm) >= 0) continue;
      out.push(nm);
    }
    return out;
  }

  /* A route: home strip -> dest strip, seeded */
  function makeRoute(rnd, homeName, avoid) {
    var names = pickNames(rnd, 1, avoid || [homeName]);
    var dist = 9000 + Math.floor(rnd() * 14000); // world px
    var paxN = 1 + Math.floor(rnd() * 3);
    var cargoN = Math.floor(rnd() * 3);
    var weather = rnd() < 0.25 ? 'dusk' : (rnd() < 0.15 ? 'dawn' : 'day');
    if (rnd() < 0.08) weather = 'night';
    var wind = Math.round((rnd() * 16 - 8)); // kts headwind +/-
    var base = 120 + Math.round(dist / 120) + paxN * 45 + cargoN * 30;
    return {
      from: homeName, to: names[0], dist: dist,
      paxN: paxN, cargoN: cargoN, weather: weather, wind: wind,
      payout: base,
    };
  }

  function makePax(rnd, n) {
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push({
        name: PAX_FIRST[Math.floor(rnd() * PAX_FIRST.length)] + ' ' +
              PAX_LAST[Math.floor(rnd() * PAX_LAST.length)],
        story: null, // filled by AI or local fallback
        mood: 1.0,
      });
    }
    return out;
  }

  /* local fallback stories (AI enriches when online) */
  var FALLBACK_STORIES = [
    'carrying a pie still warm from the oven',
    'going to see a grandchild for the first time',
    'with a fiddle case and a wedding to play',
    'chasing a rumor of bluebells in the next valley',
    'bringing seeds for the spring planting',
    'with a letter that couldn\'t wait for the post',
    'off to mend a fence and a friendship',
    'carrying honey from forty hives',
    'going home after a long season away',
    'with sketches of birds nobody has named yet',
  ];

  /* ---------- flight state ---------- */
  function newFlight(seed, route, planeId, pilot) {
    var rnd = rng(seed);
    var plane = PLANES[0];
    for (var i = 0; i < PLANES.length; i++) if (PLANES[i].id === planeId) plane = PLANES[i];
    var pax = makePax(rnd, Math.min(route.paxN, plane.pax));
    // assign fallback stories now; AI may overwrite
    for (var j = 0; j < pax.length; j++) {
      pax[j].story = FALLBACK_STORIES[Math.floor(rnd() * FALLBACK_STORIES.length)];
    }
    var quip = TOWER_QUIPS[Math.floor(rnd() * TOWER_QUIPS.length)].replace('{dest}', route.to);
    return {
      seed: seed, rndState: null, // (we re-seed decor separately in render)
      route: route, plane: plane,
      pilot: pilot || { name: 'Pilot', xp: 0, money: 300, planes: ['kite'], rank: 0 },
      pax: pax,
      // physics
      x: 0, alt: 0, speed: 0, vspeed: 0,
      throttle: 0, targetAlt: 0,
      phase: 'takeoff', // takeoff | cruise | final | done
      runwayX: 0, runwayLen: 850, destX: route.dist, destLen: 850,
      wind: route.wind,
      fuel: 100,
      // scoring
      touchdownVs: null, touchdownOff: null, goArounds: 0,
      ribbon: [], // {x, alt, smooth} trail for the sky-ribbon
      ribbonT: 0,
      messages: [{ t: 0, text: 'Tower: ' + quip }],
      msgT: 0,
      time: 0, done: false, landed: false,
      score: 0, payout: 0, xpGain: 0,
      skipped: false,
    };
  }

  /* input: {throttle 0..1, targetAlt} — logical actions */
  function step(st, inp, dt) {
    dt = Math.min(dt, 0.05);
    st.time += dt;
    var P = st.plane;

    if (inp && typeof inp.throttle === 'number')
      st.throttle += (Math.max(0, Math.min(1, inp.throttle)) - st.throttle) * Math.min(1, dt * 3);
    if (inp && typeof inp.targetAlt === 'number')
      st.targetAlt = Math.max(0, Math.min(900, inp.targetAlt));

    var onGround = st.alt <= 0.5 && st.phase === 'takeoff';
    var targetSpeed = st.throttle * P.maxSpeed;

    if (onGround) {
      // takeoff roll: accelerate, slight headwind help
      var accel = (targetSpeed - st.speed) * 0.9 + st.throttle * 22 - (st.wind > 0 ? st.wind * 0.4 : 0);
      st.speed = Math.max(0, st.speed + accel * dt);
      st.x += st.speed * dt * 3; // world px per sec (scaled)
      st.vspeed = 0;
      if (st.speed >= P.vr && st.targetAlt > 30) {
        st.phase = 'cruise';
        st.alt = 2;
        pushMsg(st, 'Tower: Rotate! You\'re flying.');
      } else if (st.x > st.runwayX + st.runwayLen + 400 && st.speed < P.vr) {
        // ran out of runway, gently: tower talks you through it
        pushMsg(st, 'Tower: Ease off, taxi back. No hurry.');
        st.x = st.runwayX; st.speed = 0;
      }
    } else {
      // airborne
      st.speed += (targetSpeed - st.speed) * Math.min(1, dt * 0.8);
      var effSpeed = Math.max(0, st.speed + st.wind * 0.3);
      st.x += effSpeed * dt * 3;

      // climb toward targetAlt, limited by plane + speed (mush when slow)
      var speedFactor = Math.min(1, st.speed / (P.vr * 1.15));
      var maxClimb = P.climb * (0.35 + 0.65 * speedFactor);
      var want = (st.targetAlt - st.alt) * 1.4;
      want = Math.max(-P.climb * 1.2, Math.min(maxClimb, want));
      st.vspeed += (want - st.vspeed) * Math.min(1, dt * 2.2);
      st.alt = Math.max(0, st.alt + st.vspeed * dt);

      // fuel burn
      st.fuel = Math.max(0, st.fuel - dt * (0.25 + st.throttle * 0.55) * P.fuelUse * 0.35);

      // phase: final when close to destination
      var distToDest = st.destX - st.x;
      if (st.phase === 'cruise' && distToDest < 2600) {
        st.phase = 'final';
        pushMsg(st, 'Tower: ' + st.route.to + ' in sight. Wind ' +
          (st.wind >= 0 ? 'calm' : 'light') + '. Runway is yours.');
      }

      // touchdown check
      if (st.alt <= 0.5 && st.vspeed <= 0) {
        var overRunway = st.x >= st.destX - 150 && st.x <= st.destX + st.destLen + 150;
        if (overRunway && st.phase !== 'done') {
          land(st);
        } else if (st.x > st.destX + st.destLen + 600) {
          // flew past everything: gentle go-around
          st.goArounds++;
          pushMsg(st, 'Tower: Go around, line up again. Easy does it.');
          st.x = st.destX - 2200; st.alt = Math.max(st.alt, 350); st.targetAlt = 350;
          st.phase = 'final';
        } else if (!overRunway && st.x > st.runwayX + 500 && st.phase === 'cruise' && st.alt <= 0.5) {
          // mushy meadow landing (never a crash)
          st.alt = 0;
          land(st, true);
        }
      }

      // ribbon trail (the sky-ribbon original touch)
      st.ribbonT += dt;
      if (st.ribbonT > 0.12) {
        st.ribbonT = 0;
        var smooth = Math.abs(st.vspeed) < 40 ? 1 : 0;
        st.ribbon.push({ x: st.x, alt: st.alt, s: smooth });
        if (st.ribbon.length > 600) st.ribbon.shift();
      }
    }

    // messages expire
    st.msgT += dt;

    // fuel empty: glide, tower cheers you on (no failure)
    if (st.fuel <= 0 && st.throttle > 0 && !st._fuelMsg) {
      st._fuelMsg = true;
      pushMsg(st, 'Tower: She\'s gliding! You\'ve got this.');
    }
    if (st.fuel <= 0) st.throttle = Math.max(0, st.throttle - dt * 0.5);

    return st;
  }

  function pushMsg(st, text) {
    st.messages.push({ t: st.time, text: text });
    if (st.messages.length > 4) st.messages.shift();
  }

  function land(st, meadow) {
    var P = st.plane;
    st.alt = 0;
    var vsFpm = Math.abs(st.vspeed) * 12; // cosmetic fpm
    var centerX = st.destX + st.destLen / 2;
    var off = Math.abs(st.x - centerX) / (st.destLen / 2); // 0=center
    st.touchdownVs = vsFpm;
    st.touchdownOff = off;
    st.phase = 'done'; st.done = true; st.landed = true;

    // scoring: softness matters most, centerline next
    var soft = Math.max(0, 1 - vsFpm / (320 * P.forgive));
    var line = Math.max(0, 1 - off);
    var smoothBonus = st.ribbon.length ? ribbonSmooth(st) : 0.5;
    var landingScore = Math.round((soft * 0.55 + line * 0.25 + smoothBonus * 0.2) * 100);
    if (meadow) landingScore = Math.round(landingScore * 0.45);

    var r = st.route;
    var tip = Math.round(st.pax.length * (4 + landingScore * 0.22));
    var cargoPay = r.cargoN * 22;
    st.payout = Math.round(r.payout * (0.75 + landingScore / 400) + tip + cargoPay);
    st.xpGain = 12 + Math.round(landingScore / 5) + (meadow ? 0 : 6);
    st.score = landingScore;

    // passenger moods
    for (var i = 0; i < st.pax.length; i++)
      st.pax[i].mood = Math.max(0.3, Math.min(1.2, 0.55 + landingScore / 130));

    var word = landingScore >= 85 ? 'a greaser' : landingScore >= 65 ? 'a soft one' :
               landingScore >= 40 ? 'a firm arrival' : 'an exciting arrival';
    pushMsg(st, 'Tower: ' + (meadow ? 'Meadow landing! The sheep applaud.' :
      'Touchdown — ' + word + '. Welcome to ' + r.to + '.'));
  }

  function ribbonSmooth(st) {
    var s = 0;
    for (var i = 0; i < st.ribbon.length; i++) s += st.ribbon[i].s;
    return st.ribbon.length ? s / st.ribbon.length : 0.5;
  }

  /* skip-to-final: jump to short final, keep altitude energy */
  function skipToFinal(st) {
    if (st.phase !== 'cruise' || st.skipped) return false;
    st.x = st.destX - 2400;
    st.alt = Math.max(st.alt, 420); st.targetAlt = 420;
    st.throttle = Math.min(st.throttle, 0.45);
    st.phase = 'final'; st.skipped = true;
    pushMsg(st, 'Tower: Skipping ahead — final approach, ' + st.route.to + '.');
    return true;
  }

  /* ---------- hangar / career ---------- */
  function newPilot(name) {
    return { name: name || 'Pilot', xp: 0, money: 350, planes: ['kite'], activePlane: 'kite',
             rank: 0, flights: 0, upgrades: {}, home: 'Meadowlark Field' };
  }

  function rankFor(xp) {
    if (xp >= 600) return 4; if (xp >= 300) return 3; if (xp >= 140) return 2; if (xp >= 50) return 1;
    return 0;
  }

  function applyFlightResult(pilot, st) {
    pilot.money += st.payout;
    pilot.xp += st.xpGain;
    pilot.flights++;
    // hangar fee: scales gently with fleet (the LP tax joke, kept light)
    var fee = Math.round(8 * Math.pow(pilot.planes.length, 1.6));
    pilot.money = Math.max(0, pilot.money - fee);
    pilot.rank = rankFor(pilot.xp);
    return { fee: fee };
  }

  function dailyRoutes(seed, home) {
    var rnd = rng(seed), out = [], used = [home];
    for (var i = 0; i < 3; i++) {
      var r = makeRoute(rnd, home, used);
      used.push(r.to);
      out.push(r);
    }
    return out;
  }

  function buyPlane(pilot, id) {
    var pl = null;
    for (var i = 0; i < PLANES.length; i++) if (PLANES[i].id === id) pl = PLANES[i];
    if (!pl || pilot.planes.indexOf(id) >= 0 || pilot.money < pl.price) return false;
    pilot.money -= pl.price;
    pilot.planes.push(id);
    return true;
  }

  function selfTest() {
    // headless sanity: full flight must complete without errors
    var pilot = newPilot('Test');
    var route = makeRoute(rng(7), pilot.home);
    route.dist = 6000;
    var st = newFlight(7, route, 'kite', pilot);
    var inp = { throttle: 1, targetAlt: 0 };
    var steps = 0;
    while (!st.done && steps < 20000) {
      if (st.phase === 'takeoff' && st.speed > 50) inp.targetAlt = 400;
      if (st.phase === 'cruise') {
        inp.targetAlt = 400;
        if (st.destX - st.x < 1500) inp.targetAlt = 60;
      }
      if (st.phase === 'final') {
        var d = st.destX + st.destLen / 2 - st.x;
        inp.targetAlt = Math.max(0, d * 0.12);
        inp.throttle = d > 400 ? 0.35 : 0.15;
      }
      step(st, inp, 1 / 60);
      steps++;
    }
    if (!st.done) return 'FAIL: flight did not complete in ' + steps + ' steps';
    if (!(st.score >= 0 && st.score <= 100)) return 'FAIL: score out of range ' + st.score;
    if (!(st.payout > 0)) return 'FAIL: no payout';
    // skip-to-final path
    var st2 = newFlight(9, route, 'kite', pilot);
    step(st2, { throttle: 1, targetAlt: 400 }, 1 / 60);
    st2.phase = 'cruise'; st2.x = 1000; st2.alt = 400;
    if (!skipToFinal(st2)) return 'FAIL: skipToFinal refused';
    if (st2.phase !== 'final') return 'FAIL: skip did not set final';
    // career
    var r = applyFlightResult(pilot, st);
    if (pilot.flights !== 1 || pilot.money <= 0) return 'FAIL: career apply';
    if (!buyPlane(pilot, 'kestrel') && pilot.money >= 2400) return 'FAIL: buy';
    return 'PASS';
  }

  return {
    PLANES: PLANES, RANKS: RANKS,
    newFlight: newFlight, step: step, skipToFinal: skipToFinal,
    newPilot: newPilot, applyFlightResult: applyFlightResult,
    dailyRoutes: dailyRoutes, buyPlane: buyPlane, rankFor: rankFor,
    ribbonSmooth: ribbonSmooth, selfTest: selfTest, rng: rng,
  };
})();

if (typeof module !== 'undefined') module.exports = SK;
