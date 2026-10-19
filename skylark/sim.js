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
      stall: 36, maxTW: 0.34, cd0: 0.133, ki: 0.025, ponder: 0.85, stab: 1.5, flapD: 0.35 },
    { id: 'kestrel', name: 'Kestrel', desc: 'A honest twin-prop. Faster, roomier, thirstier.',
      maxSpeed: 150, cruiseSpeed: 115, climb: 80, vr: 62, pax: 4, cargo: 3,
      stripNeed: 520, price: 2400, fuelUse: 1.8, forgive: 1.0,
      stall: 55, maxTW: 0.38, cd0: 0.059, ki: 0.048, ponder: 1.0, stab: 1.0, flapD: 0.22 },
    { id: 'merlin', name: 'Merlin', desc: 'A regional jet with manners. Long strips only.',
      maxSpeed: 230, cruiseSpeed: 180, climb: 120, vr: 95, pax: 6, cargo: 6,
      stripNeed: 800, price: 9800, fuelUse: 3.0, forgive: 0.8,
      stall: 88, maxTW: 0.44, cd0: 0.029, ki: 0.086, ponder: 1.35, stab: 0.8, flapD: 0.12 },
  ];

  var STRIP_NAMES = ['Meadowlark Field', 'Cinder Hollow', 'Pebblebrook', 'Foxglove Meadows',
    'Tern Point', 'Alder Flats', 'Wrenwick', 'Harebell Downs', 'Duskmere', 'Larkspur Vale',
    'Briar Patch', 'Cloudcroft', 'Mothlight', 'Sedgewick', 'Poppyfield', 'Owler\'s Roost'];

  /* ---------- airline management: the valley network ----------
     10 strips, each with a class (grass/dirt/paved) gating which planes can land.
     Own strips, run jobs between them, assign background flights. */
  var STRIPS = [
    { id: 'meadowlark', name: 'Meadowlark Field', cls: 'grass', cost: 0,
      mx: 50, my: 62, desc: 'Home. A ragged grass strip with a windsock and big sky.' },
    { id: 'pebblebrook', name: 'Pebblebrook', cls: 'grass', cost: 600,
      mx: 22, my: 38, desc: 'A brook-side meadow. Geese on short final.' },
    { id: 'cinder', name: 'Cinder Hollow', cls: 'dirt', cost: 1400,
      mx: 74, my: 30, desc: 'Old cinder pit, graded flat. Smells of rain.' },
    { id: 'foxglove', name: 'Foxglove Meadows', cls: 'grass', cost: 900,
      mx: 38, my: 78, desc: 'Wildflower meadows. Land long — the far end is soft.' },
    { id: 'tern', name: 'Tern Point', cls: 'dirt', cost: 2200,
      mx: 85, my: 58, desc: 'A point over the water. Crosswinds off the lake.' },
    { id: 'alder', name: 'Alder Flats', cls: 'dirt', cost: 2600,
      mx: 60, my: 82, desc: 'Wide flats by the alders. Room to breathe.' },
    { id: 'wrenwick', name: 'Wrenwick', cls: 'paved', cost: 5200,
      mx: 30, my: 18, desc: 'The valley\'s one paved strip. Proper lights, proper tea.' },
    { id: 'harebell', name: 'Harebell Downs', cls: 'grass', cost: 1200,
      mx: 68, my: 72, desc: 'Rolling downs. Sheep have right of way.' },
    { id: 'duskmere', name: 'Duskmere', cls: 'dirt', cost: 3400,
      mx: 15, my: 58, desc: 'By the dark mere. Mist on the mornings.' },
    { id: 'larkspur', name: 'Larkspur Vale', cls: 'paved', cost: 7800,
      mx: 52, my: 12, desc: 'The far vale. Long paved strip, big payouts.' },
  ];
  function stripById(id) {
    for (var i = 0; i < STRIPS.length; i++) if (STRIPS[i].id === id) return STRIPS[i];
    return STRIPS[0];
  }
  // can this plane land at this strip class?
  function planeCanLand(planeId, stripCls) {
    if (stripCls === 'paved') return true;
    if (stripCls === 'dirt') return planeId !== 'merlin';
    return planeId === 'kite'; // grass: Kite only
  }

  /* jobs board: passengers + cargo waiting at a strip, seeded per time bucket.
     Each job: {id, kind:'pax'|'cargo', name, story, dest, payout} */
  var CARGO_KINDS = ['a crate of', 'a parcel of', 'a sack of', 'a bundle of'];
  var CARGO_WHAT = ['apples', 'honey jars', 'wool', 'letters', 'spare parts', 'seed packets',
    'pies', 'fiddle strings', 'lamp oil', 'tea', 'bluebells', 'wrenches'];
  function jobBucket() { return Math.floor(Date.now() / (3 * 3600 * 1000)); } // new board every 3h
  function genJobs(stripId, bucket) {
    var rnd = rng(hashStr(stripId) + bucket * 7919);
    var jobs = [];
    var n = 3 + Math.floor(rnd() * 3); // 3-5 jobs
    var others = [];
    for (var i = 0; i < STRIPS.length; i++) if (STRIPS[i].id !== stripId) others.push(STRIPS[i].id);
    for (var j = 0; j < n; j++) {
      var dest = others[Math.floor(rnd() * others.length)];
      var isPax = rnd() < 0.6;
      var dist = Math.abs(stripById(stripId).mx - stripById(dest).mx) +
                 Math.abs(stripById(stripId).my - stripById(dest).my);
      var payout = Math.round(40 + dist * 2.2 + rnd() * 40);
      if (isPax) {
        jobs.push({ id: stripId + '-' + bucket + '-p' + j, kind: 'pax',
          name: PAX_FIRST[Math.floor(rnd() * PAX_FIRST.length)] + ' ' +
                PAX_LAST[Math.floor(rnd() * PAX_LAST.length)],
          story: FALLBACK_STORIES[Math.floor(rnd() * FALLBACK_STORIES.length)],
          dest: dest, payout: payout });
      } else {
        jobs.push({ id: stripId + '-' + bucket + '-c' + j, kind: 'cargo',
          name: CARGO_KINDS[Math.floor(rnd() * CARGO_KINDS.length)] + ' ' +
                CARGO_WHAT[Math.floor(rnd() * CARGO_WHAT.length)],
          story: 'bound for ' + stripById(dest).name,
          dest: dest, payout: payout });
      }
    }
    return jobs;
  }
  function hashStr(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (h >>> 0) || 1;
  }

  /* airline state lives on the pilot object:
     pilot.strips = ['meadowlark', ...]            owned strip ids
     pilot.fleet = [{plane:'kite', at:'meadowlark', status:'idle'|'enroute',
                     dest:null, jobs:[], departAt:0, arriveAt:0}]
     pilot.jobsTaken = {jobId: true}               jobs already loaded (per bucket)
     pilot.inbox = [{t, text, who}]                 arrived-flight messages for the tower feed
  */
  function ensureAirline(pilot) {
    if (!pilot.strips) pilot.strips = ['meadowlark'];
    if (!pilot.fleet) {
      pilot.fleet = [];
      for (var i = 0; i < pilot.planes.length; i++)
        pilot.fleet.push({ plane: pilot.planes[i], at: 'meadowlark', status: 'idle',
                           dest: null, jobs: [], departAt: 0, arriveAt: 0 });
    } else {
      // sync: new planes bought get fleet entries; sold/removed planes drop out
      var have = {};
      for (var f = 0; f < pilot.fleet.length; f++) have[pilot.fleet[f].plane] = true;
      for (var p = 0; p < pilot.planes.length; p++)
        if (!have[pilot.planes[p]])
          pilot.fleet.push({ plane: pilot.planes[p], at: pilot.strips[0], status: 'idle',
                             dest: null, jobs: [], departAt: 0, arriveAt: 0 });
    }
    if (!pilot.jobsTaken) pilot.jobsTaken = {};
    if (!pilot.inbox) pilot.inbox = [];
    if (!pilot.jobBucket) pilot.jobBucket = jobBucket();
    return pilot;
  }

  function buyStrip(pilot, stripId) {
    ensureAirline(pilot);
    var s = stripById(stripId);
    if (pilot.strips.indexOf(stripId) >= 0) return { ok: false, why: 'owned' };
    if (pilot.money < s.cost) return { ok: false, why: 'money' };
    pilot.money -= s.cost;
    pilot.strips.push(stripId);
    pilot.xp += 25;
    pilot.rank = rankFor(pilot.xp);
    return { ok: true };
  }

  // flight time: 10-30 min by map distance (cozy, not Pocket Planes hours)
  function legMinutes(fromId, toId, planeId) {
    var a = stripById(fromId), b = stripById(toId);
    var d = Math.sqrt(Math.pow(a.mx - b.mx, 2) + Math.pow(a.my - b.my, 2)); // 0-~100
    var speed = planeId === 'merlin' ? 1.6 : planeId === 'kestrel' ? 1.2 : 1.0;
    return Math.round(10 + (d / 100) * 20 / speed);
  }

  /* assign a background flight: plane must be idle at fromId, dest must be owned,
     plane must be able to land at dest. jobs: array of job objects (already validated).
     Returns {ok} or {ok:false, why}. */
  function assignFlight(pilot, fleetIdx, destId, jobs) {
    ensureAirline(pilot);
    var f = pilot.fleet[fleetIdx];
    if (!f || f.status !== 'idle') return { ok: false, why: 'busy' };
    if (pilot.strips.indexOf(destId) < 0) return { ok: false, why: 'strip' };
    if (!planeCanLand(f.plane, stripById(destId).cls)) return { ok: false, why: 'class' };
    var now = Date.now();
    var mins = legMinutes(f.at, destId, f.plane);
    f.status = 'enroute';
    f.dest = destId;
    f.jobs = jobs || [];
    f.departAt = now;
    f.arriveAt = now + mins * 60000;
    // mark jobs taken
    for (var i = 0; i < f.jobs.length; i++) pilot.jobsTaken[f.jobs[i].id] = true;
    return { ok: true, mins: mins };
  }

  // 25% same-destination bonus: all jobs share one dest → +25% each
  function flightPayout(jobs) {
    if (!jobs || !jobs.length) return 0;
    var same = true, d0 = jobs[0].dest;
    for (var i = 1; i < jobs.length; i++) if (jobs[i].dest !== d0) { same = false; break; }
    var total = 0;
    for (var j = 0; j < jobs.length; j++) total += jobs[j].payout;
    if (same && jobs.length > 1) total = Math.round(total * 1.25);
    return { total: total, bonus: same && jobs.length > 1 };
  }

  /* tick: resolve arrived background flights. Call on load and periodically.
     Returns array of arrival events for the tower feed. */
  function tickAirline(pilot) {
    ensureAirline(pilot);
    var now = Date.now();
    var arrivals = [];
    // new jobs bucket?
    var b = jobBucket();
    if (b !== pilot.jobBucket) { pilot.jobBucket = b; pilot.jobsTaken = {}; }
    for (var i = 0; i < pilot.fleet.length; i++) {
      var f = pilot.fleet[i];
      if (f.status === 'enroute' && now >= f.arriveAt) {
        var pay = flightPayout(f.jobs);
        pilot.money += pay.total;
        pilot.xp += 8 + f.jobs.length * 3;
        var pn = planeName(f.plane);
        var msg = pay.bonus
          ? pn + ' landed at ' + stripById(f.dest).name + ' — full load, one stop! +' + money(pay.total)
          : pn + ' landed at ' + stripById(f.dest).name + ' +' + money(pay.total);
        arrivals.push({ t: now, text: msg, who: 'kit' });
        pilot.inbox.push({ t: now, text: msg, who: 'kit' });
        if (pilot.inbox.length > 12) pilot.inbox.shift();
        f.at = f.dest; f.dest = null; f.jobs = []; f.status = 'idle';
        f.departAt = 0; f.arriveAt = 0;
      }
    }
    pilot.rank = rankFor(pilot.xp);
    return arrivals;
  }
  function planeName(id) {
    for (var i = 0; i < PLANES.length; i++) if (PLANES[i].id === id) return PLANES[i].name;
    return id;
  }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

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
    // flying weather: clear | rain | wind (gusty) | snow — seeded, shown on the card
    var wxr = rnd();
    var wx = wxr < 0.45 ? 'clear' : (wxr < 0.68 ? 'rain' : (wxr < 0.84 ? 'wind' : 'snow'));
    var base = 120 + Math.round(dist / 120) + paxN * 45 + cargoN * 30;
    return {
      from: homeName, to: names[0], dist: dist,
      paxN: paxN, cargoN: cargoN, weather: weather, wind: wind, wx: wx,
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
    // tower weather briefing — Mabel tells you what you're flying into
    var wxBrief = '';
    if (route.wx === 'rain') wxBrief = 'Tower: Rain over ' + route.to + '. She\'ll be slick — easy on the rollout.';
    else if (route.wx === 'wind') wxBrief = 'Tower: Gusty out there today. Watch the needle, mind the drift.';
    else if (route.wx === 'snow') wxBrief = 'Tower: Snow on the way to ' + route.to + '. She\'ll feel heavy — carry a touch more speed.';
    return {
      seed: seed, rndState: null, // (we re-seed decor separately in render)
      route: route, plane: plane,
      pilot: pilot || { name: 'Pilot', xp: 0, money: 300, planes: ['kite'], rank: 0 },
      pax: pax,
      // physics — real lift/drag/thrust/weight. Units: kts, ft, ft/s, deg.
      x: 0, lat: 0, alt: 0, speed: 0, vspeed: 0,
      pitch: 0, bank: 0, aoa: 0, stalled: false,
      throttle: 0, flaps: 0,
      wx: route.wx || 'clear', // flying weather: clear | rain | wind | snow
      ice: 0, // snow: icing builds slowly, throttle heat melts it
      gustT: 0, gust: 0, // wind: shifting gusts
      massF: 1.0, // 1.0 full → ~0.93 empty (fuel burn lightens)
      phase: 'takeoff', // takeoff | cruise | final | done
      runwayX: 0, runwayLen: 850, destX: route.dist, destLen: 850,
      wind: route.wind,
      fuel: 100,
      // scoring
      touchdownVs: null, touchdownOff: null, goArounds: 0,
      ribbon: [], // {x, alt, smooth} trail for the sky-ribbon
      ribbonT: 0,
      messages: [{ t: 0, text: 'Tower: ' + quip }].concat(
        wxBrief ? [{ t: 0, text: wxBrief, who: 'mabel' }] : []),
      msgT: 0,
      time: 0, done: false, landed: false,
      score: 0, payout: 0, xpGain: 0,
      skipped: false,
    };
  }

  /* input: {throttle 0..1, pitch -1..1, lateral -1..1, flaps 0..1} — logical actions.
     pitch: -1 push (nose down) … +1 pull (nose up). lateral: -1 left … +1 right.
     flaps: 0 clean … 1 full — more lift at low speed, much more drag. */
  var G = 32.2; // ft/s^2
  function step(st, inp, dt) {
    dt = Math.min(dt, 0.05);
    st.time += dt;
    var P = st.plane;

    // smooth the inputs (heavier planes feel ponderous)
    var resp = 3.2 / P.ponder;
    if (inp && typeof inp.throttle === 'number')
      st.throttle += (Math.max(0, Math.min(1, inp.throttle)) - st.throttle) * Math.min(1, dt * 3);
    if (inp && typeof inp.flaps === 'number')
      st.flaps += (Math.max(0, Math.min(1, inp.flaps)) - st.flaps) * Math.min(1, dt * 2.5);
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

    // weather: gusts shift through the flight (deterministic in st.time)
    var isRain = st.wx === 'rain', isWind = st.wx === 'wind', isSnow = st.wx === 'snow';
    if (isWind) {
      st.gustT += dt;
      st.gust = Math.sin(st.gustT * 0.9) * 4 + Math.sin(st.gustT * 2.17 + 1.3) * 2.5;
    } else st.gust = 0;
    var wEff = st.wind + st.gust; // effective wind incl. gusts
    // snow: icing builds slowly on the wings, throttle heat melts it off
    if (isSnow) {
      st.ice = Math.min(1, st.ice + dt * 0.008);
      st.ice = Math.max(0, st.ice - st.throttle * dt * 0.03);
    } else st.ice = Math.max(0, st.ice - dt * 0.05);

    if (onGround) {
      // takeoff roll (rain: slick runway, longer roll)
      var twRoll = st.throttle * P.maxTW;
      var dwRoll = 0.03 + 0.0004 * st.speed * st.speed / 100;
      if (isRain) dwRoll *= 0.65;
      if (isSnow) dwRoll *= 1.5;
      var accelKts = (twRoll - dwRoll) * G / 1.688 - (wEff > 0 ? wEff * 0.02 : 0);
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

      // load factor n = L/W — flaps lower the stall speed (more lift at low speed)
      var vStall = P.stall * (1 - 0.28 * st.flaps) * 1.688;
      var nBase = (vFps * vFps) / (vStall * vStall) * Math.max(-0.6, Math.min(1.45, st.aoa / 6));
      nBase /= st.massF; // lighter = floatier
      if (isSnow) nBase *= 0.93 * (1 - 0.08 * st.ice); // heavy air + icing
      var n = st.stalled ? nBase * 0.68 : nBase;

      // vertical: lift (banked) vs weight
      var ay = (n * Math.cos(bankRad) - 1) * G;
      st.vspeed += ay * dt;
      // wind: turbulence bumps on approach — she shudders in the gusts
      if (isWind && (st.phase === 'final' || st.alt < 150)) {
        st.vspeed += Math.sin(st.time * 7.3) * 7 * dt;
        st.bank += Math.sin(st.time * 5.1 + 2) * 5 * dt;
      }
      st.vspeed *= (1 - 0.12 * dt); // damping
      st.vspeed = Math.max(-90, Math.min(90, st.vspeed));
      st.alt = Math.max(0, st.alt + st.vspeed * dt);

      // drag: parasitic + induced (ground effect eases induced < 50ft)
      var v100 = Math.max(vFps / 100, 0.35);
      var induced = P.ki * n * n / (v100 * v100);
      if (st.alt < 50) induced *= 0.35 + 0.65 * (st.alt / 50); // ground effect: flares float
      var dw = P.cd0 * v100 * v100 + induced;
      dw += st.flaps * (P.flapD || 0.3) * v100 * v100; // flaps: strong when fast, gentle when slow; per-plane so the Cub can drag it in and the jet can still fly the approach
      if (isRain) dw *= 1.12; // rain: wet wings, more drag
      if (isSnow) dw *= 1.18;
      var tw = st.throttle * P.maxTW;
      var ax = (tw - dw) * G - G * Math.sin(fpa) * 0.9;
      st.speed = Math.max(0, st.speed + ax / 1.688 * dt);

      // lateral: banked turn + crosswind drift on final (gusts push harder)
      st.lat += Math.sin(bankRad) * vFps * dt;
      if (st.phase === 'final' || st.alt < 120) st.lat += wEff * (isWind ? -1.6 : -0.9) * dt;

      // along-track: wind affects ground speed
      var gndKts = Math.max(0, st.speed + wEff * 0.35);
      st.x += gndKts * dt * 3;

      // fuel burn
      st.fuel = Math.max(0, st.fuel - dt * (0.25 + st.throttle * 0.55) * P.fuelUse * 0.35);

      // phase: final when close to destination — scaled to the plane so the
      // stable approach (full flaps, idle, gentle nose-down) reaches the runway
      var finalDist = 4200 * (P.cruiseSpeed / 70);
      var distToDest = st.destX - st.x;
      // high? tower calls it earlier — the descent must always be flyable
      var callDist = finalDist + Math.max(0, st.alt - 400) * 8;
      if (st.phase === 'cruise' && distToDest < callDist) {
        st.phase = 'final';
        pushMsg(st, 'Tower: ' + st.route.to + ' in sight. Wind ' +
          (st.wind >= 0 ? 'calm' : 'light') + '. Runway is yours. Flaps out, ease her down.', 'kit');
      }

      // Mabel's high warning: stranded upstairs? she'll tell you early.
      // 3° profile: alt should be ~ d*0.052. If you're 250ft+ above it with
      // less than 9000px to go, you're not making it without starting down NOW.
      if (!st._highWarn && !st.done && (st.phase === 'cruise' || st.phase === 'final')) {
        var dAimH = st.destX + st.destLen * 0.18 - st.x;
        if (dAimH > 0 && dAimH < 9000) {
          var profAlt = dAimH * 0.052;
          if (st.alt > profAlt + 250) {
            st._highWarn = true;
            pushMsg(st, 'Tower: You\'re high — start her down or you\'ll overshoot ' + st.route.to + '.', 'mabel');
          }
        }
      }

      // landing procedure: tower talks you down the final
      if (st.phase === 'final' && !st.done) {
        var dFinal = st.destX + st.destLen * 0.18 - st.x; // to aim point
        if (!st._proc1 && dFinal < finalDist * 0.45) {
          st._proc1 = true;
          pushMsg(st, 'Tower: Line up on final. Follow the beacon needle.', 'mabel');
        } else if (st._proc1 && !st._proc2 && dFinal < finalDist * 0.26) {
          st._proc2 = true;
          var p = papi(st);
          var hint = p.white === 2 ? 'Two white, two red — right on the slope.'
            : p.white > 2 ? 'Mostly white — ease her down a touch.'
            : 'Mostly red — you\'re low, add a breath of power.';
          pushMsg(st, 'Tower: Check the lights by the runway. ' + hint, 'mabel');
        } else if (st._proc2 && !st._proc3 && dFinal < 700) {
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
          st.x = st.destX - finalDist * 0.55; st.alt = Math.max(st.alt, 350); st.lat = 0;
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
    var finalDist = 4200 * (st.plane.cruiseSpeed / 70);
    var callDist = finalDist + Math.max(0, st.alt - 400) * 8;
    st.x = st.destX - callDist;
    st.alt = Math.max(st.alt, 380);
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
    // — flown once in each weather type.
    var wxs = ['clear', 'rain', 'wind', 'snow'];
    for (var wi = 0; wi < wxs.length; wi++) {
      var r = flyOnce(wxs[wi]);
      if (r !== 'PASS') return 'FAIL[' + wxs[wi] + ']: ' + r;
    }
    // airline management sim
    var m = mgmtTest();
    if (m !== 'PASS') return 'FAIL[mgmt]: ' + m;
    return 'PASS';
  }

  function mgmtTest() {
    var pilot = newPilot('Test');
    pilot.money = 20000;
    ensureAirline(pilot);
    if (pilot.strips.length !== 1 || pilot.strips[0] !== 'meadowlark') return 'home strip missing';
    if (pilot.fleet.length !== 1 || pilot.fleet[0].plane !== 'kite') return 'fleet init wrong';
    // buy a strip
    var b = buyStrip(pilot, 'pebblebrook');
    if (!b.ok) return 'buyStrip failed';
    if (pilot.strips.indexOf('pebblebrook') < 0) return 'strip not owned';
    // class gating: Kite can land grass, Merlin cannot
    if (!planeCanLand('kite', 'grass')) return 'kite should land grass';
    if (planeCanLand('merlin', 'grass')) return 'merlin should not land grass';
    if (!planeCanLand('merlin', 'paved')) return 'merlin should land paved';
    // jobs
    var jobs = genJobs('meadowlark', 12345);
    if (!jobs.length || jobs.length > 6) return 'jobs count wrong: ' + jobs.length;
    // bonus: same dest
    var j1 = { dest: 'pebblebrook', payout: 100 }, j2 = { dest: 'pebblebrook', payout: 100 };
    var p1 = flightPayout([j1, j2]);
    if (p1.total !== 250 || !p1.bonus) return 'same-dest bonus wrong: ' + p1.total;
    var j3 = { dest: 'cinder', payout: 100 };
    var p2 = flightPayout([j1, j3]);
    if (p2.total !== 200 || p2.bonus) return 'mixed-dest should not bonus';
    // assign + instant arrival (hack arriveAt to past)
    var a = assignFlight(pilot, 0, 'pebblebrook', [j1, j2]);
    if (!a.ok) return 'assignFlight failed: ' + a.why;
    if (pilot.fleet[0].status !== 'enroute') return 'not enroute';
    pilot.fleet[0].arriveAt = Date.now() - 1000;
    var before = pilot.money;
    var arr = tickAirline(pilot);
    if (!arr.length) return 'no arrival';
    if (pilot.fleet[0].status !== 'idle' || pilot.fleet[0].at !== 'pebblebrook') return 'not arrived';
    if (pilot.money !== before + 250) return 'payout wrong: ' + (pilot.money - before);
    return 'PASS';
  }

  function flyOnce(wx) {
    var pilot = newPilot('Test');
    var route = makeRoute(rng(7), pilot.home);
    route.dist = 6000; route.wind = 0; route.wx = wx;
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
    PLANES: PLANES, RANKS: RANKS, STRIPS: STRIPS,
    newFlight: newFlight, step: step, skipToFinal: skipToFinal,
    newPilot: newPilot, applyFlightResult: applyFlightResult,
    dailyRoutes: dailyRoutes, buyPlane: buyPlane, rankFor: rankFor,
    ribbonSmooth: ribbonSmooth, papi: papi, landingVerdict: landingVerdict,
    CHALLENGES: CHALLENGES, trainingProgress: trainingProgress, rudyLine: rudyLine,
    selfTest: selfTest, rng: rng,
    // airline management
    stripById: stripById, planeCanLand: planeCanLand, genJobs: genJobs, jobBucket: jobBucket,
    ensureAirline: ensureAirline, buyStrip: buyStrip, legMinutes: legMinutes,
    assignFlight: assignFlight, flightPayout: flightPayout, tickAirline: tickAirline,
  };
})();

if (typeof module !== 'undefined') module.exports = SK;
