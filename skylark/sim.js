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
      stripNeed: 300, price: 0, fuelUse: 1.0, forgive: 1.5,
      stall: 36, maxTW: 0.34, cd0: 0.133, ki: 0.025, ponder: 0.85, stab: 1.5 },
    { id: 'kestrel', name: 'Kestrel', desc: 'A honest twin-prop. Faster, roomier, thirstier.',
      maxSpeed: 150, cruiseSpeed: 115, climb: 80, vr: 62, pax: 4, cargo: 3,
      stripNeed: 520, price: 2400, fuelUse: 1.8, forgive: 1.0,
      stall: 55, maxTW: 0.38, cd0: 0.059, ki: 0.048, ponder: 1.0, stab: 1.0 },
    { id: 'merlin', name: 'Merlin', desc: 'A regional jet with manners. Long strips only.',
      maxSpeed: 230, cruiseSpeed: 180, climb: 120, vr: 95, pax: 6, cargo: 6,
      stripNeed: 800, price: 9800, fuelUse: 3.0, forgive: 0.8,
      stall: 88, maxTW: 0.44, cd0: 0.029, ki: 0.086, ponder: 1.35, stab: 0.8 },
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
      // physics — real lift/drag/thrust/weight. Units: kts, ft, ft/s, deg.
      x: 0, lat: 0, alt: 0, speed: 0, vspeed: 0,
      pitch: 0, bank: 0, aoa: 0, stalled: false,
      throttle: 0,
      massF: 1.0, // 1.0 full → ~0.93 empty (fuel burn lightens)
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

  /* input: {throttle 0..1, pitch -1..1, lateral -1..1} — logical actions.
     pitch: -1 push (nose down) … +1 pull (nose up). lateral: -1 left … +1 right. */
  var G = 32.2; // ft/s^2
  function step(st, inp, dt) {
    dt = Math.min(dt, 0.05);
    st.time += dt;
    var P = st.plane;

    // smooth the inputs (heavier planes feel ponderous)
    var resp = 3.2 / P.ponder;
    if (inp && typeof inp.throttle === 'number')
      st.throttle += (Math.max(0, Math.min(1, inp.throttle)) - st.throttle) * Math.min(1, dt * 3);
    var pitchIn = (inp && typeof inp.pitch === 'number') ? Math.max(-1, Math.min(1, inp.pitch)) : 0;
    var latIn = (inp && typeof inp.lateral === 'number') ? Math.max(-1, Math.min(1, inp.lateral)) : 0;
    var sloppy = st.stalled ? 0.45 : 1; // stalled controls get mushy
    st.pitch += (pitchIn * 15 * sloppy - st.pitch) * Math.min(1, dt * resp);
    st.bank += (latIn * 28 * sloppy - st.bank) * Math.min(1, dt * resp * 0.8);
    // self-leveling: truly hands off the yoke and she settles toward a gentle trim.
    // Only engages near zero input — small corrective pressures are respected.
    // Friendlier planes (higher stab) level out faster — the Kite practically flies herself.
    if (Math.abs(pitchIn) < 0.05 && !onGround && !st.stalled) {
      st.pitch += (1.5 - st.pitch) * Math.min(1, dt * 0.7 * (P.stab || 1));
    }
    if (Math.abs(latIn) < 0.05 && !onGround && !st.stalled) {
      st.bank += (0 - st.bank) * Math.min(1, dt * 0.9 * (P.stab || 1));
    }

    // weight: fuel burn lightens the plane
    st.massF = 1 - (100 - st.fuel) / 100 * 0.07;

    var vFps = Math.max(0, st.speed * 1.688); // kts → ft/s
    var onGround = st.alt <= 0.5 && st.phase === 'takeoff';

    if (onGround) {
      // takeoff roll
      var twRoll = st.throttle * P.maxTW;
      var dwRoll = 0.03 + 0.0004 * st.speed * st.speed / 100;
      var accelKts = (twRoll - dwRoll) * G / 1.688 - (st.wind > 0 ? st.wind * 0.02 : 0);
      st.speed = Math.max(0, st.speed + accelKts * dt);
      st.x += st.speed * dt * 3;
      st.vspeed = 0; st.lat = 0;
      // rotate: at Vr with back-pressure, she flies
      if (st.speed >= P.vr && st.pitch > 2.5) {
        st.phase = 'cruise';
        st.alt = 3;
        st.vspeed = 6;
        pushMsg(st, 'Tower: Rotate! You\'re flying.', 'kit');
      } else if (st.x > st.runwayX + st.runwayLen + 400 && st.speed < P.vr) {
        pushMsg(st, 'Tower: Ease off, taxi back. No hurry.', 'mabel');
        st.x = st.runwayX; st.speed = 0;
      }
    } else {
      // ---- airborne: lift / drag / thrust / weight ----
      var bankRad = st.bank * Math.PI / 180;

      // flight path angle from current vspeed
      var fpa = Math.atan2(st.vspeed, Math.max(vFps, 30)); // radians
      st.aoa = st.pitch - fpa * 57.3;

      // stall: gentle mush with plenty of warning, never a spin
      var stallAoA = 14 + P.forgive * 3;
      var slowFactor = Math.max(0, Math.min(1, (st.speed - P.stall * 0.92) / (P.stall * 0.25)));
      // pre-stall buffet: tower warns you before she lets go
      if (!st.stalled && !st._buffet && st.aoa > stallAoA - 3.5 && slowFactor < 0.95) {
        st._buffet = true;
        pushMsg(st, 'Tower: Easy — she\'s getting heavy. Nose down a touch, add power.', 'mabel');
      } else if (st._buffet && (st.aoa < stallAoA - 5 || slowFactor >= 1)) {
        st._buffet = false;
      }
      if (!st.stalled && st.aoa > stallAoA && slowFactor < 0.9) {
        st.stalled = true;
        pushMsg(st, 'Tower: She\'s mushing — ease the nose down, add a breath of power.', 'mabel');
      } else if (st.stalled && (st.aoa < stallAoA - 4 || slowFactor >= 1)) {
        st.stalled = false;
        pushMsg(st, 'Tower: There she is — flying again. Nicely handled.', 'mabel');
      }
      if (st.stalled) st.pitch -= 5.5 * dt; // nose mushes down slowly on its own

      // load factor n = L/W
      var vStall = P.stall * 1.688;
      var nBase = (vFps * vFps) / (vStall * vStall) * Math.max(0, Math.min(1.45, st.aoa / 6));
      nBase /= st.massF; // lighter = floatier
      var n = st.stalled ? nBase * 0.68 : nBase;

      // vertical: lift (banked) vs weight
      var ay = (n * Math.cos(bankRad) - 1) * G;
      st.vspeed += ay * dt;
      st.vspeed *= (1 - 0.12 * dt); // damping
      st.vspeed = Math.max(-90, Math.min(90, st.vspeed));
      st.alt = Math.max(0, st.alt + st.vspeed * dt);

      // drag: parasitic + induced (ground effect eases induced < 50ft)
      var v100 = Math.max(vFps / 100, 0.35);
      var induced = P.ki * n * n / (v100 * v100);
      if (st.alt < 50) induced *= 0.35 + 0.65 * (st.alt / 50); // ground effect: flares float
      var dw = P.cd0 * v100 * v100 + induced;
      var tw = st.throttle * P.maxTW;
      var ax = (tw - dw) * G - G * Math.sin(fpa) * 0.9;
      st.speed = Math.max(0, st.speed + ax / 1.688 * dt);

      // lateral: banked turn + crosswind drift on final
      st.lat += Math.sin(bankRad) * vFps * dt;
      if (st.phase === 'final' || st.alt < 120) st.lat += st.wind * -0.9 * dt;

      // along-track: wind affects ground speed
      var gndKts = Math.max(0, st.speed + st.wind * 0.35);
      st.x += gndKts * dt * 3;

      // fuel burn
      st.fuel = Math.max(0, st.fuel - dt * (0.25 + st.throttle * 0.55) * P.fuelUse * 0.35);

      // phase: final when close to destination
      var distToDest = st.destX - st.x;
      if (st.phase === 'cruise' && distToDest < 2600) {
        st.phase = 'final';
        pushMsg(st, 'Tower: ' + st.route.to + ' in sight. Wind ' +
          (st.wind >= 0 ? 'calm' : 'light') + '. Runway is yours.', 'kit');
      }

      // landing procedure: tower talks you down the final
      if (st.phase === 'final' && !st.done) {
        var dFinal = st.destX + st.destLen * 0.18 - st.x; // to aim point
        if (!st._proc1 && dFinal < 1900) {
          st._proc1 = true;
          pushMsg(st, 'Tower: Line up on final. Follow the beacon needle.', 'mabel');
        } else if (st._proc1 && !st._proc2 && dFinal < 1100) {
          st._proc2 = true;
          var p = papi(st);
          var hint = p.white === 2 ? 'Two white, two red — right on the slope.'
            : p.white > 2 ? 'Mostly white — ease her down a touch.'
            : 'Mostly red — you\'re low, add a breath of power.';
          pushMsg(st, 'Tower: Check the lights by the runway. ' + hint, 'mabel');
        } else if (st._proc2 && !st._proc3 && dFinal < 420) {
          st._proc3 = true;
          pushMsg(st, 'Tower: Easy… flare! Nose up, let her settle.', 'kit');
        }
      }

      // touchdown check
      if (st.alt <= 0.5 && st.vspeed <= 0) {
        var centerLat = 0;
        var latOff = Math.abs(st.lat) / 260; // 0 = centerline
        var overRunway = st.x >= st.destX - 150 && st.x <= st.destX + st.destLen + 150;
        if (overRunway && st.phase !== 'done') {
          st.touchdownLat = latOff;
          land(st);
        } else if (st.x > st.destX + st.destLen + 600) {
          // flew past everything: gentle go-around
          st.goArounds++;
          pushMsg(st, 'Tower: Go around, line up again. Easy does it.', 'mabel');
          st.x = st.destX - 2200; st.alt = Math.max(st.alt, 350); st.lat = 0;
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
        var smooth = Math.abs(st.vspeed) < 12 && !st.stalled ? 1 : 0;
        st.ribbon.push({ x: st.x, alt: st.alt, s: smooth });
        if (st.ribbon.length > 600) st.ribbon.shift();
      }
    }

    // messages expire
    st.msgT += dt;

    // fuel empty: glide, tower cheers you on (no failure)
    if (st.fuel <= 0 && st.throttle > 0 && !st._fuelMsg) {
      st._fuelMsg = true;
      pushMsg(st, 'Tower: She\'s gliding! You\'ve got this.', 'kit');
    }
    if (st.fuel <= 0) st.throttle = Math.max(0, st.throttle - dt * 0.5);

    return st;
  }

  function pushMsg(st, text, who) {
    st.messages.push({ t: st.time, text: text, who: who || 'mabel' });
    if (st.messages.length > 4) st.messages.shift();
  }

  /* Rudy "Wrench" Kowalski — the mechanic. Shows up after rough landings
     with a joke instead of a punishment. */
  var RUDY_LINES = [
    'Rudy here. I\'ve seen smoother landings on a trampoline. She\'ll fly again, don\'t worry.',
    'That one rearranged the luggage AND my spine. Ha! The Kite forgives you.',
    'I felt that in the hangar. On the plus side, the tires are now perfectly round.',
    'Firm! I like a pilot who commits. The gear does too, mostly.',
    'Whoa. Let\'s check the struts, check your pride, and go again.',
    'I\'ve landed worse. Once. In a simulator. That I built. It doesn\'t count.',
  ];
  function rudyLine(st) {
    // seeded-ish pick so it varies per flight
    var i = Math.floor(((st.seed || 1) * 7 + st.pilot.flights * 13) % RUDY_LINES.length);
    return RUDY_LINES[i];
  }

  /* PAPI glideslope: 4 lights — 2W2R on path, more white=high, more red=low.
     Returns {white:0..4, red:0..4} for the approach to destX. */
  function papi(st) {
    var touchX = st.destX + st.destLen * 0.18; // aim point: just past threshold
    var dx = touchX - st.x;
    if (dx <= 50 || st.phase === 'done') return { white: 2, red: 2 };
    var ang = Math.atan2(st.alt, dx) * 180 / Math.PI; // degrees above horizon
    var w;
    if (ang >= 4.2) w = 4; else if (ang >= 3.4) w = 3;
    else if (ang >= 2.6) w = 2; else if (ang >= 1.8) w = 1; else w = 0;
    return { white: w, red: 4 - w };
  }

  /* landing verdict tiers — cozy words, never a fail */
  function landingVerdict(vsFpm, forgive) {
    var v = vsFpm / forgive; // normalize by plane forgiveness
    if (v < 100) return { word: 'butter', praise: 'Buttery. The tires barely whispered.' };
    if (v < 190) return { word: 'a soft one', praise: 'A soft one — nice and easy.' };
    if (v < 300) return { word: 'a firm arrival', praise: 'A firm arrival! The landing gear forgives you.' };
    return { word: 'an exciting arrival', praise: 'An exciting arrival! The tower felt that one and grinned.' };
  }

  function land(st, meadow) {
    var P = st.plane;
    st.alt = 0;
    st.meadow = !!meadow;
    var vsFpm = Math.abs(st.vspeed) * 60; // vspeed is ft/s → fpm
    var centerX = st.destX + st.destLen / 2;
    var offX = Math.abs(st.x - centerX) / (st.destLen / 2); // 0=center
    var offLat = Math.min(1, (st.touchdownLat || 0)); // 0=centerline
    var off = Math.max(offX, offLat);
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

    var word = landingVerdict(vsFpm, P.forgive).word;
    var praise = landingVerdict(vsFpm, P.forgive).praise;
    var rough = (word === 'a firm arrival' || word === 'an exciting arrival') && !meadow;
    if (meadow) {
      pushMsg(st, 'Tower: Meadow landing! The sheep applaud.', 'kit');
    } else if (rough) {
      pushMsg(st, 'Tower: Touchdown — ' + praise + ' Welcome to ' + r.to + '.', 'mabel');
      pushMsg(st, rudyLine(st), 'rudy');
    } else {
      pushMsg(st, 'Tower: Touchdown — ' + praise + ' Welcome to ' + r.to + '.',
        word === 'butter' ? 'kit' : 'mabel');
    }
    st.verdict = word;
    st.butter = (word === 'butter' && !meadow);
  }

  function ribbonSmooth(st) {
    var s = 0;
    for (var i = 0; i < st.ribbon.length; i++) s += st.ribbon[i].s;
    return st.ribbon.length ? s / st.ribbon.length : 0.5;
  }

  /* skip-to-final: jump to short final with approach energy */
  function skipToFinal(st) {
    if (st.phase !== 'cruise' || st.skipped) return false;
    st.x = st.destX - 2400;
    st.alt = Math.max(st.alt, 420);
    st.speed = Math.max(st.speed, st.plane.cruiseSpeed * 0.75);
    st.vspeed = -8; st.pitch = -2; st.bank = 0; st.lat = 0;
    st.throttle = Math.min(st.throttle, 0.45);
    st.phase = 'final'; st.skipped = true;
    pushMsg(st, 'Tower: Skipping ahead — final approach, ' + st.route.to + '.', 'kit');
    return true;
  }

  /* ---------- hangar / career ---------- */
  function newPilot(name) {
    return { name: name || 'Pilot', xp: 0, money: 350, planes: ['kite'], activePlane: 'kite',
             rank: 0, flights: 0, upgrades: {}, home: 'Meadowlark Field',
             training: { greasers: 0, circuits: 0 }, trainingDone: {} };
  }

  /* Named training challenges — formalized practice, LP-style.
     "Three Greasers": 3 butter landings (touchdown < 150fpm normalized).
     "Touch and Goes": 5 completed flights (pattern work). */
  var CHALLENGES = [
    { id: 'greasers', name: 'Three Greasers', desc: 'Grease three landings — touchdown under 150 fpm.',
      goal: 3, xp: 60 },
    { id: 'circuits', name: 'Touch and Goes', desc: 'Complete five full flights, takeoff to touchdown.',
      goal: 5, xp: 40 },
  ];
  function trainingProgress(pilot, st) {
    var t = pilot.training, done = pilot.trainingDone, newly = [];
    if (st.landed && !st.meadow) {
      var normVs = st.touchdownVs / (st.plane.forgive || 1);
      if (normVs < 150) {
        t.greasers++;
        if (t.greasers >= 3 && !done.greasers) { done.greasers = true; newly.push('greasers'); }
      }
      t.circuits++;
      if (t.circuits >= 5 && !done.circuits) { done.circuits = true; newly.push('circuits'); }
    }
    return newly;
  }

  function rankFor(xp) {
    if (xp >= 600) return 4; if (xp >= 300) return 3; if (xp >= 140) return 2; if (xp >= 50) return 1;
    return 0;
  }

  function applyFlightResult(pilot, st) {
    pilot.money += st.payout;
    pilot.xp += st.xpGain;
    pilot.flights++;
    // training challenges
    if (!pilot.training) { var np = newPilot('x'); pilot.training = np.training; pilot.trainingDone = np.trainingDone; }
    var newlyDone = trainingProgress(pilot, st);
    for (var i = 0; i < newlyDone.length; i++) {
      for (var j = 0; j < CHALLENGES.length; j++) {
        if (CHALLENGES[j].id === newlyDone[i]) {
          pilot.xp += CHALLENGES[j].xp;
          st.trainingAward = CHALLENGES[j];
        }
      }
    }
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
    // headless sanity: full flight must complete without errors (new physics model)
    var pilot = newPilot('Test');
    var route = makeRoute(rng(7), pilot.home);
    route.dist = 6000; route.wind = 0;
    var st = newFlight(7, route, 'kite', pilot);
    var inp = { throttle: 1, pitch: 0, lateral: 0 };
    var steps = 0, stalledOnce = false;
    while (!st.done && steps < 30000) {
      if (st.stalled) stalledOnce = true;
      if (st.phase === 'takeoff') {
        inp.throttle = 1;
        inp.pitch = st.speed > 44 ? 0.55 : 0; // rotate at Vr
      } else if (st.phase === 'cruise') {
        // hold ~400ft, then descend to pattern when approaching
        var distC = st.destX - st.x;
        var targetAlt = distC < 5000 ? 150 : 400;
        var altErr = targetAlt - st.alt;
        inp.pitch = Math.max(-0.5, Math.min(0.6, altErr / 300));
        inp.throttle = 0.62;
        if (distC < 1500) { inp.pitch = -0.35; inp.throttle = 0.3; }
      } else if (st.phase === 'final') {
        // stabilized approach: 50kts, gentle descent to the aim point
        // (if high, descend to intercept; if low, just ease down — never climb on final)
        var d = st.destX + st.destLen * 0.18 - st.x;
        var gsAlt = Math.max(0, d * 0.052); // 3° glideslope altitude
        var targetSpd = 50;
        var spdErr = targetSpd - st.speed;
        inp.throttle = Math.max(0.08, Math.min(0.6, 0.28 + spdErr * 0.02));
        if (st.alt > gsAlt + 30) {
          // above glideslope: 800fpm descent to intercept
          var vsErr2 = -13 - st.vspeed;
          inp.pitch = Math.max(-0.45, Math.min(0.3, vsErr2 / 25));
        } else {
          // at or below glideslope: gentle -400fpm down to the runway
          var vsErr3 = -6.5 - st.vspeed;
          inp.pitch = Math.max(-0.4, Math.min(0.4, vsErr3 / 25));
        }
        inp.lateral = Math.max(-0.4, Math.min(0.4, -st.lat / 400)); // line up
        if (d < 200 && st.alt < 30) inp.pitch = 0.5; // flare
      }
      step(st, inp, 1 / 60);
      steps++;
      // sanity: never NaN, never absurd
      if (!isFinite(st.alt) || !isFinite(st.speed) || st.alt > 2000)
        return 'FAIL: non-physical state at step ' + steps;
    }
    if (!st.done) return 'FAIL: flight did not complete in ' + steps + ' steps';
    if (!(st.score >= 0 && st.score <= 100)) return 'FAIL: score out of range ' + st.score;
    if (!(st.payout > 0)) return 'FAIL: no payout';
    if (st.touchdownVs == null) return 'FAIL: no touchdown recorded';
    // stall recovery path: yank back at low speed, must recover without crash
    var st3 = newFlight(11, route, 'kite', pilot);
    st3.phase = 'cruise'; st3.x = 1000; st3.alt = 500; st3.speed = 55;
    var inp3 = { throttle: 0.25, pitch: 1, lateral: 0 };
    var recSteps = 0, sawStall = false;
    while (recSteps < 3000) {
      step(st3, inp3, 1 / 60);
      if (st3.stalled) sawStall = true;
      if (sawStall && !st3.stalled) break; // recovered
      if (sawStall && st3.aoa < 5) { inp3.pitch = 0.1; inp3.throttle = 0.8; } // recover: nose down + power
      recSteps++;
    }
    if (!sawStall) return 'FAIL: stall never triggered in stall test';
    if (st3.stalled) return 'FAIL: stall did not recover';
    // skip-to-final path
    var st2 = newFlight(9, route, 'kite', pilot);
    step(st2, { throttle: 1, pitch: 0.3, lateral: 0 }, 1 / 60);
    st2.phase = 'cruise'; st2.x = 1000; st2.alt = 400; st2.speed = 70;
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
    ribbonSmooth: ribbonSmooth, papi: papi, landingVerdict: landingVerdict,
    CHALLENGES: CHALLENGES, trainingProgress: trainingProgress, rudyLine: rudyLine,
    selfTest: selfTest, rng: rng,
  };
})();

if (typeof module !== 'undefined') module.exports = SK;
