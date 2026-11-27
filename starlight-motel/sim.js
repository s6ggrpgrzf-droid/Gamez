/*SIM-BEGIN*/
const SIM = (() => {
  'use strict';

  // ---------- seeded RNG (mulberry32, state carried on the game object) ----------
  function rnd(g){
    g.rng = (g.rng + 0x6D2B79F5) >>> 0;
    let t = g.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const ri = (g, lo, hi) => lo + Math.floor(rnd(g) * (hi - lo + 1));       // inclusive int
  const rf = (g, lo, hi) => lo + rnd(g) * (hi - lo);
  const pick = (g, arr) => arr[Math.floor(rnd(g) * arr.length)];
  const clamp = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);

  // ---------- content (defaults; the UI may pass a richer pack) ----------
  const DEF_FIRST = ['James','Mary','Robert','Patricia','John','Jennifer','Michael','Linda','David','Elizabeth','William','Barbara','Richard','Susan','Joseph','Jessica','Thomas','Sarah','Charles','Karen','Daniel','Nancy','Matthew','Lisa','Anthony','Betty','Mark','Margaret','Donald','Sandra','Steven','Ashley','Paul','Kimberly','Andrew','Emily','Kenneth','Michelle','Kevin','Dorothy','Brian','Amanda','Timothy','Melissa','Gary','Deborah','Larry','Rebecca','Jeffrey','Sharon','Eric','Laura','Raymond','Cynthia','Gregory','Kathleen','Jose','Maria','Miguel','Rosa','Juan','Carmen','Carlos','Elena','Dale','Wanda','Earl','Gladys','Vernon','Lorene','Cody','Cheyenne','Dakota','Sierra'];
  const DEF_LAST = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson','Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores','Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell','Carter','Roberts','Standing Bear','Proctor','Tsoodle','Harjo','Tiger','Fixico','Butler','Freeman','Holt','Boone','Crain','Pruitt','Sells','Wann','Karty','Redbird'];
  const DEF_FRAGMENTS = {
    clean:     { bad:["Bathroom had seen things.","Hair in the tub. Enough said.","Floor crunched under my shoes."],
                 good:["Spotless. I mean it — spotless.","Cleaner than my own house, and I live alone."] },
    condition: { bad:["The AC rattled like a shopping cart.","Shower ran brown for a second. A second too long."],
                 good:["Bed was better than the one at home.","Everything worked. When does everything work?"] },
    wait:      { bad:["Stood at the desk forever.","Rang the bell three times."],
                 good:["Checked in before I'd shut the car door.","Key in my hand in under a minute."] },
    amenities: { bad:["Ice machine empty. Vending machine emptier."],
                 good:["Coffee at dawn saved my drive.","Hot water that stays hot. Rare and appreciated."] },
    noise:     { bad:["Walls are paper. Heard every word next door."],
                 good:["Quiet as a library at 2 AM."] },
    match:     { bad:["Asked for one thing at the desk. Got the opposite.","Told them what I needed. Watched them nod. Didn't happen."],
                 good:["They gave me exactly the room I asked for. Exactly.","Somebody at that desk pays attention."] },
    mid:       ["Fine for a night off the highway.","Does what it says on the sign.","Nothing fancy. Nothing broken, either."]
  };

  // ---------- segments ----------
  // dow index: 0=Mon .. 6=Sun
  const SEGMENTS = {
    trucker:  { label:'Trucker',       base:0.95, ref:69,  elast:1.50, dow:[1.1,1.1,1.1,1.1,1.0,0.8,0.85], post:0.45, loud:0.8, tol:0.8,
                w:{clean:.26,condition:.17,wait:.22,amenities:.09,noise:.14,match:.12}, dirtMod:2,  stay:g=>1 },
    family:   { label:'Family',        base:0.85, ref:95,  elast:1.10, dow:[0.55,0.55,0.55,0.55,1.5,1.8,0.9], post:0.80, loud:1.3, tol:1.0,
                w:{clean:.26,condition:.14,wait:.07,amenities:.15,noise:.14,match:.24}, dirtMod:8,  stay:g=> 1 + (rnd(g)<0.4?1:0) },
    crew:     { label:'Work crew',     base:0.45, ref:62,  elast:1.60, dow:[1.3,1.1,1.1,1.1,0.5,0.3,0.6], post:0.35, loud:1.1, tol:0.9,
                w:{clean:.20,condition:.13,wait:.17,amenities:.13,noise:.23,match:.14}, dirtMod:12, stay:g=> 3 + Math.floor(rnd(g)*2) },
    longstay: { label:'Long-stay',     base:0.12, ref:45,  elast:1.80, dow:[1,1,1,1,1,1,1], post:0.30, loud:0.7, tol:1.1,
                w:{clean:.24,condition:.19,wait:.04,amenities:.16,noise:.17,match:.20}, dirtMod:15, stay:g=> 5 + Math.floor(rnd(g)*3) },
    tourist:  { label:'Route 66 tourist', base:0.42, ref:110, elast:0.90, dow:[0.8,0.8,0.8,0.8,1.2,1.4,1.0], post:0.65, loud:1.0, tol:1.15,
                w:{clean:.23,condition:.19,wait:.07,amenities:.12,noise:.17,match:.22}, dirtMod:0,  stay:g=> 1 + (rnd(g)<0.3?1:0) }
  };
  const SEG_KEYS = Object.keys(SEGMENTS);
  // Pass J6: the court's big rooms — the two ends and every fourth door,
  // the way a motor court was actually built.
  function roomSize(id){ return (id === 1 || id % 4 === 0) ? 'large' : 'standard'; }
  const DOW_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const CLEAN_LEVELS = {
    deep:     { label:'Deep',     min:45, dirt:2 },
    standard: { label:'Standard', min:25, dirt:10 },
    quick:    { label:'Quick',    min:10, dirt:32 },
    skip:     { label:'Skip',     min:0,  dirt:null }
  };
  const BASE_MINUTES = 300, EXTRA_MINUTES = 150, EXTRA_COST = 55, HK_WAGE = 0.30;
  const MORTGAGE = 110, BANKRUPT_AT = -1500;
  const SEASON_NIGHTS = 84, CREDIT_LIMIT = 8000;
  const roundMoney = n => Math.round(n * 100) / 100;

  // ---------- Pass 4: the season ----------
  const UPGRADES = [
    { id:'website',   name:'Booking website',        cost:400,  amenity:0,  blurb:'Your own page on the internet, taking reservations direct. Every pool +8%.' },
    { id:'sign',      name:'Neon sign repair',       cost:500,  amenity:0,  blurb:'Every tube lit, every letter honest. The highway can read you again — every pool +12%.' },
    { id:'vending',   name:'Vending & ice machines', cost:600,  amenity:5,  blurb:'Cold drinks and ice that is actually there. Amenities +5, and about $1.60 a room a night.' },
    { id:'security',  name:'Security lights & cameras', cost:800, amenity:0, blurb:'A lit court and a camera over the office. Trouble at the desk gets about a third rarer.' },
    { id:'wifi',      name:'Wi-Fi throughout',       cost:750,  amenity:12, blurb:'A signal in every room, not just near the office. Amenities +12.' },
    { id:'laundry',   name:'In-house laundry',       cost:800,  amenity:0,  blurb:'Sheets washed on site. Laundry costs −60%, and housekeeping runs about 10% faster.' },
    { id:'mattress',  name:'Mattress refresh',       cost:1250, amenity:0,  blurb:'Every bed in the house replaced, once. Every room’s condition +20.' },
    { id:'deepclean', name:'Deep-clean equipment',   cost:1100, amenity:0,  blurb:'A real extractor and a cart that fits the walkway. Cleaning minutes cost about a third less.' },
    { id:'ac',        name:'AC overhaul',            cost:1400, amenity:10, blurb:'Every unit serviced and sealed. Amenities +10, heat waves stop hurting, rooms wear slower.' },
    { id:'breakfast', name:'Breakfast nook',         cost:1500, amenity:12, blurb:'Coffee, toast and a place to sit. Amenities +12; families forgive $8 more on the rate. Costs $3.80 a room a night to run.' },
    { id:'pool',      name:'Pool resurface',         cost:2100, amenity:12, blurb:'New plaster, honest blue. Amenities +12, and families look for you first in the high weeks.' },
    { id:'truckpad',  name:'Truck pad & EV chargers', cost:900,  amenity:0,  blurb:'A gravel pad out back and two chargers on the wall. Truckers find you first (+15%), and road-trippers in EVs too (+6%).' },
    { id:'pets',      name:'Pet-friendly & dog run', cost:700,  amenity:4,  blurb:'A fenced run by the far wing and a welcome for dogs. Amenities +4, families travelling with dogs look for you (+8%) — and about one room in five pays the $12 pet fee. Dogs do knock, though.' },
    { id:'piewindow', name:'Pie & coffee window',   cost:1100, amenity:6,  blurb:'A hatch in the office wall: coffee at dawn, pie till late. Amenities +6, about $2.60 a room a night over the counter, and families forgive $5 more on the rate.' },
    { id:'solar',     name:'Solar panels',          cost:2600, amenity:0,  blurb:'Panels over the office and the east wing. The meter runs backward — utilities fall by more than half, every night, sold or empty.' },
    { id:'billboard', name:'Highway billboard (leased)', cost:250, amenity:0, blurb:'Your star, forty feet tall, two miles out. Every pool +10% — but the lease is $13 a night, every night, whether they come or not. It runs to the end of the season.' }
  ];
  const EXPANSIONS = [
    { rooms:2, cost:3600, unlock:15, name:'Rooms 9–10 — the east court' },
    { rooms:2, cost:4400, unlock:30, name:'Rooms 11–12 — past the pool' },
    { rooms:2, cost:5400, unlock:45, name:'Rooms 13–14 — the back wing' },
    { rooms:2, cost:6200, unlock:60, name:'Rooms 15–16 — the whole court' }
  ];
  // Combos (after Hot Springs Story): two things that belong together draw
  // a named crowd. A combo is not a third purchase — it is what a pair you
  // already own starts doing on its own, so it is derived from the upgrade
  // list and never stored.
  const COMBOS = [
    { id:'pieplunge',     name:'Pie & a Plunge',       a:'piewindow', b:'pool',      seg:{ family:1.15 },
      line:'Families hear about the pair of them — the word travels fast.' },
    { id:'trucksupper',   name:'The Trucker’s Supper', a:'truckpad',  b:'vending',   seg:{ trucker:1.12 },
      line:'A place to park and a hot bite off the wall — the pad fills first.' },
    { id:'seenhighway',   name:'Seen From the Highway', a:'sign',     b:'billboard', seg:{ tourist:1.15 },
      line:'The star twice — once on the board, once over the court. Road-trippers turn in.' },
    { id:'workingweek',   name:'The Working Week',     a:'wifi',      b:'breakfast', seg:{ crew:1.12 },
      line:'Signal and a hot breakfast: crews book the week, not the night.' },
    { id:'backroom',      name:'The Back Room',        a:'laundry',   b:'deepclean', minutes:0.85,
      line:'Washed on site, cleaned with real kit — the morning’s minutes stretch further.' }
  ];
  function activeCombos(g){ return COMBOS.filter(c => hasUpgrade(g, c.a) && hasUpgrade(g, c.b)); }
  // Demand events carry their effects with them; calendar notices (inspections,
  // the competitor) are listed alongside so the whole season reads on one page.
  const CALENDAR = [
    { id:'festival',  from:5,  to:7,  name:'Founders’ Day Festival', kind:'event', all:1.08, seg:{ family:1.35, tourist:1.30 }, note:'The town fills up. Families and Route 66 tourists everywhere.' },
    { id:'fishing',   from:12, to:14, name:'Fishing Tournament',     kind:'event', seg:{ trucker:0.75, family:1.25, tourist:1.20 }, note:'Boats on trailers at dawn. Truckers give the lake roads a miss.' },
    { id:'heat',      from:19, to:21, name:'Heat Wave',              kind:'event', utilities:1.5, amenityPenalty:12, note:'Over 100° for three days. Utilities ×1.5 — and guests judge a weak AC hard.' },
    { id:'roadwork',  from:26, to:29, name:'Highway Roadwork',       kind:'event', seg:{ trucker:0.85 }, noiseRoad:12, note:'One lane, flaggers, dust. Truckers thin out; the road-side rooms hear it.' },
    { id:'inspection1', from:30, to:30, name:'Health Inspection',    kind:'notice', note:'The inspector comes this morning. Last week’s check-in cleanliness decides it: under 45 earns a $400 fine, 80 or better earns a framed certificate.' },
    { id:'storm',     from:36, to:37, name:'Storm Front',            kind:'event', all:0.68, price:1.25, note:'The highway empties — but the stranded who do stop will pay. Knocks at the desk get likelier.' },
    { id:'competitor', from:43, to:84, name:'The Starling Suites Opens', kind:'notice', note:'A chain motel opens across the highway. It takes almost nothing from a 4★ house, about an eighth from a middling one — and a tired house under 3.4 stars bleeds a fifth of the road, then more.' },
    { id:'suites-soft', from:36, to:36, name:'The Suites Hang Their Sign', kind:'notice', note:'Across the highway the chain takes its first bookings, quiet-like, a week before the grand opening. Half the pull the opening will have — and a tired house feels it first.' },
    { id:'crew',      from:50, to:52, name:'Tinker Crew Contract',   kind:'event', seg:{ crew:1.60 }, note:'A big contract out at the base. Work crews are looking for rooms all week.' },
    { id:'inspection2', from:60, to:60, name:'Health Inspection',    kind:'notice', note:'The inspector returns this morning. Same rules as night 30.' },
    { id:'homegame',  from:64, to:66, name:'Home-Game Weekend',      kind:'event', all:1.08, seg:{ family:1.45, tourist:1.35 }, note:'The game fills the county. Families and tourists pay weekend prices gladly.' },
    { id:'fair',      from:82, to:84, name:'State Fair Finale',      kind:'event', all:1.12, seg:{ family:1.60, tourist:1.45 }, noiseAll:6, note:'The last big window of the summer. Full, loud, and worth money.' }
  ];
  // Pass C: the summer is dealt, not printed. Summer One is the authored
  // calendar above, word for word. Every summer after, the seven event windows
  // are dealt from a pool of eleven and shifted a night or two either way —
  // the inspections, the Starling Suites and the State Fair keep their dates,
  // because some things a keeper can set a watch by.
  const ROTATING_EVENTS = [
    { id:'festival',  name:'Founders’ Day Festival', kind:'event', all:1.08, seg:{ family:1.35, tourist:1.30 }, note:'The town fills up. Families and Route 66 tourists everywhere.' },
    { id:'fishing',   name:'Fishing Tournament',     kind:'event', seg:{ trucker:0.75, family:1.25, tourist:1.20 }, note:'Boats on trailers at dawn. Truckers give the lake roads a miss.' },
    { id:'heat',      name:'Heat Wave',              kind:'event', utilities:1.5, amenityPenalty:12, note:'Over 100° for three days. Utilities ×1.5 — and guests judge a weak AC hard.' },
    { id:'roadwork',  name:'Highway Roadwork',       kind:'event', seg:{ trucker:0.85 }, noiseRoad:12, note:'One lane, flaggers, dust. Truckers thin out; the road-side rooms hear it.' },
    { id:'storm',     name:'Storm Front',            kind:'event', all:0.68, price:1.25, note:'The highway empties — but the stranded who do stop will pay. Knocks at the desk get likelier.' },
    { id:'crew',      name:'Tinker Crew Contract',   kind:'event', seg:{ crew:1.60 }, note:'A big contract out at the base. Work crews are looking for rooms all week.' },
    { id:'homegame',  name:'Home-Game Weekend',      kind:'event', all:1.08, seg:{ family:1.45, tourist:1.35 }, note:'The game fills the county. Families and tourists pay weekend prices gladly.' },
    { id:'rodeo',     name:'County Rodeo',           kind:'event', seg:{ family:1.30, tourist:1.25, trucker:0.85 }, note:'Boots, hats, and horse trailers in every lot in the county. The town smells of dust and fry oil.' },
    { id:'film',      name:'A Film Crew in Town',    kind:'event', seg:{ crew:1.70, tourist:1.10 }, noiseRoad:8, note:'They are shooting a picture two blocks over and have rented half the town. Generators hum past midnight.' },
    { id:'reunion',   name:'The Alvarez Reunion',    kind:'event', seg:{ family:1.45, longstay:1.15 }, note:'Ninety Alvarezes, three generations, one famous potato salad. They book in clusters and stay up late.' },
    { id:'revival',   name:'Tent Revival Week',      kind:'event', seg:{ tourist:1.15, family:1.15 }, noiseRoad:-6, note:'A tent, a choir, and the quietest week of the summer. The highway itself seems to lower its voice.' }
  ];
  const EVENT_SLOTS = [[5, 7], [12, 14], [19, 21], [26, 29], [36, 37], [50, 52], [64, 66]];
  function buildCalendar(season, seed){
    if (!season || season <= 1) return CALENDAR;
    let state = (((seed >>> 0) * 31) + season * 1013) >>> 0;
    const r = () => { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pool = ROTATING_EVENTS.slice();
    for (let i = pool.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    const dealt = EVENT_SLOTS.map((slot, i) => {
      const shift = Math.floor(r() * 5) - 2;
      let from = slot[0] + shift, to = slot[1] + shift;
      if (from < 3){ to += 3 - from; from = 3; }
      if (to > 80){ from -= to - 80; to = 80; }
      if (from <= 30 && to >= 30) to = 29; // the inspector keeps his morning
      return Object.assign({}, pool[i], { from, to });
    });
    const fixed = CALENDAR.filter(e => e.kind === 'notice' || e.id === 'fair');
    return dealt.concat(fixed).sort((a, b) => a.from - b.from);
  }
  function calOf(g){ return (g && g.calendar) || CALENDAR; }
  function activeEvent(g, night){ const cal = calOf(g); return cal.find(e => e.kind === 'event' && night >= e.from && night <= e.to) || null; }
  function calendarEntry(g, night){
    const cal = calOf(g);
    const exact = cal.find(e => night >= e.from && night <= e.to && e.kind === 'notice' && e.from === night);
    return exact || activeEvent(g, night) || (night >= 43 ? cal.find(e => e.id === 'competitor') : null);
  }
  function nextCalendar(g, night){ return calOf(g).find(e => e.from > night) || null; }
  function seasonArc(night){
    if (night <= 14) return 0.94;
    if (night <= 28) return 1.00;
    if (night <= 56) return 1.10;
    if (night <= 70) return 1.00;
    if (night <= 77) return 0.93;
    return 0.88;
  }
  function ensureSeason(g){
    if (!Array.isArray(g.upgrades)) g.upgrades = [];
    if (typeof g.credit !== 'number') g.credit = 0;
    if (typeof g.expansions !== 'number') g.expansions = Math.max(0, Math.floor((g.rooms.length - 8) / 2));
    if (!Array.isArray(g.cleanLog)) g.cleanLog = [];
    if (g.lastInspection === undefined) g.lastInspection = null;
    if (g.bankLetter === undefined) g.bankLetter = null;
    if (!g.challenges || typeof g.challenges !== 'object') g.challenges = freshChallenges();
    for (const cid of Object.keys(CHALLENGES)) if (!g.challenges[cid]) g.challenges[cid] = { met:false, stays:0, happy:0, done:false };
    if (g.challengeNote === undefined) g.challengeNote = null;
    if (!g.grudges || typeof g.grudges !== 'object') g.grudges = {};
    if (g.ratePremium === undefined) g.ratePremium = null;
    if (g.phone === undefined) g.phone = null;
    if (!Array.isArray(g.blocks)) g.blocks = [];
    if (g.regular === undefined) g.regular = null;
    if (g.regularGone === undefined) g.regularGone = false;
    if (g.regularLine === undefined) g.regularLine = null;
    if (g.squeeze === undefined) g.squeeze = false;
    if (!g.staff || typeof g.staff !== 'object') g.staff = { hk: null, clerk: null };
    if (g.staff.watch === undefined) g.staff.watch = null;
    if (g.ejectWord === undefined) g.ejectWord = null;
    if (g.serviceTicket === undefined) g.serviceTicket = null;
    if (g.guide === undefined) g.guide = null;
    if (g.guidePrev === undefined) g.guidePrev = null;
    if (g.guideWord === undefined) g.guideWord = null;
    if (!g.mkt) g.mkt = { focus: {}, ad: 0, pkg: { weekend: false, weekly: false } };
    if (!Array.isArray(g.town)) g.town = [];
    if (!g.segXp) g.segXp = { trucker: { xp: 0 }, family: { xp: 0 }, crew: { xp: 0 }, longstay: { xp: 0 }, tourist: { xp: 0 } };
    if (!g.referrers) g.referrers = {};
    if (!g.forecourt) g.forecourt = {};
    if (!g.shop) g.shop = { stock: 0, price: 6 };
    if (!g.pump) g.pump = { mode: 'match' };
    if (!g.placards && !g.tonight) g.placards = dealPlacards(g);
    if (typeof g.foreEarned !== 'number') g.foreEarned = 0;
    if (typeof g.drewOnce !== 'boolean') g.drewOnce = false;
    if (typeof g.vouchersTonight !== 'boolean') g.vouchersTonight = false;
    for (const r of g.rooms) if (!r.size) r.size = roomSize(r.id);
    if (!g.people || typeof g.people !== 'object') g.people = {};
    if (!g.shifts || typeof g.shifts !== 'object') g.shifts = { hk: 'day', clerk: 'night' };
    if (g.staff.hk === true) g.staff.hk = 'mabel'; else if (g.staff.hk === false) g.staff.hk = null;
    if (g.staff.clerk === true) g.staff.clerk = 'eddie'; else if (g.staff.clerk === false) g.staff.clerk = null;
    if (!g.plant || typeof g.plant !== 'object') g.plant = {};
    for (const pid of ['pool', 'laundry', 'vending'])
      if (Array.isArray(g.upgrades) && g.upgrades.includes(pid) && !g.plant[pid]) g.plant[pid] = { c: 80, broken: false };
    if (typeof g.season !== 'number' || g.season < 1) g.season = 1;
    if (!Array.isArray(g.calendar) || !g.calendar.length) g.calendar = buildCalendar(g.season, g.seed);
    if (!Array.isArray(g.ledger)) g.ledger = [];
    if (g.standing === undefined) g.standing = null;
    if (typeof g.roadMood !== 'number') g.roadMood = 1;
    if (g.ending === undefined) g.ending = null;
    if (typeof g.handymanTonight !== 'boolean') g.handymanTonight = false;
    const s = g.stats;
    const defs = { guests:0, reviews:0, checkouts:0, roomNights:0, possibleRoomNights:0, fullHouses:0, fiveStarReviews:0, oneStarReviews:0, returners:0,
                   incidents:0, incidentsHandled:0, certificates:0, bestNightProfit:null,
                   lowestRatingAfter20:null, maxCredit:g.credit || 0 };
    for (const k of Object.keys(defs)) if (s[k] === undefined) s[k] = defs[k];
    if (!Array.isArray(g.cashHistory)) g.cashHistory = [g.cash];
    if (!Array.isArray(g.quirkDeck)) g.quirkDeck = [];
    for (const r of g.rooms) if (!r.quirk) r.quirk = drawQuirk(g);
    if (typeof s.peakCash !== 'number') s.peakCash = g.cash;
    for (const r of g.rooms) if (!r.tier) r.tier = 'standard';
    for (const r of g.rooms){ if (!Array.isArray(r.fittings)) r.fittings = []; if (r.finish === undefined) r.finish = null; if (r.tier === 'renovated' && !r.finish) r.finish = 'quiet'; }
    if (!g.staff) g.staff = { hk: false, clerk: false };
    return g;
  }
  function hasUpgrade(g, id){ return Array.isArray(g.upgrades) && g.upgrades.includes(id); }
  function competitorFactor(g, night){
    if (night < 36) return 1;
    // The Suites take almost nothing from a 4★ house, an eighth from a middling
    // one — and a tired house bleeds: below 3.4 the shiny place takes a fifth,
    // below 3.0 a quarter and more. That gradient is the season's real cliff.
    // Pass F6: the drag starts at the soft opening (night 30) at half
    // strength — success gets expensive before the grand opening lands.
    const full = g.rating >= 4 ? 0.96 : g.rating >= 3.4 ? 0.88 : g.rating >= 3.0 ? 0.80 : 0.72;
    if (night < 43) return 1 - (1 - full) * 0.5;
    return full;
  }
  // ---------- Pass J3: THE HIRING BOOK (Travellers Rest's staff) ----------
  // You don't hire a role any more; you hire a person — a gift and a catch,
  // and the catch never comes off. g.staff holds person ids ('mabel'), with
  // the E3 boolean shape migrated by ensureSeason (true = the steady hand).
  const PEOPLE = {
    darlene: { role:'hk', name:'Darlene Voss', wage:44, minutes:150,
      gift:'Thorough — +150 housekeeping minutes a day, the deepest pool on the book.',
      flaw:'Heavy-handed — the plant wears a point faster every night it runs under her care.' },
    mabel:   { role:'hk', name:'Mabel Okafor', wage:38, minutes:120,
      gift:'Steady — the classic +120 minutes, no surprises either way.',
      flaw:'Set in her ways — supplies run $5 a night over, every night, itemised and unrepentant.' },
    rosa:    { role:'hk', name:'Rosa Delgado', wage:33, minutes:135,
      gift:'Fast — +135 minutes a day at the lowest wage on the book.',
      flaw:'Cuts corners — a room she has cleaned is never cleaner than 8. The corners show.' },
    eddie:   { role:'clerk', name:'Eddie Kowalski', wage:30, soften:4,
      gift:'A night owl — a knock he has half-answered lands softer (+4).',
      flaw:'Forgets to charge — the till comes up $1.20 short for every room in house.' },
    frankie: { role:'clerk', name:'Frankie Boone', wage:36, soften:7,
      gift:'A silver tongue — a knock he has half-answered lands softer still (+7).',
      flaw:'Generous with comps — a comped guest costs $10 over the rate. He throws in pie.' },
    wanda:   { role:'clerk', name:'Wanda Pierce', wage:26, soften:4,
      gift:'By the book — a knock she has half-answered lands softer (+4), at the lowest wage on the book.',
      flaw:'Rubs people wrong — your review replies travel a quarter less far under her hand.' },
    hollis:  { role:'watch', name:'Hollis Brandt', wage:34, deter:0.25, eject:true,
      gift:'A presence — trouble at the desk runs a quarter rarer, and he can walk a loud party out.',
      flaw:'A face like weather — families and tourists judge the amenities 2 colder with him looming in the dark.' },
    petra:   { role:'watch', name:'Petra Lindqvist', wage:28, deter:0.10, eject:false,
      gift:'Quiet rounds — the court stays hushed under her: every stay judges the noise 4 kinder.',
      flaw:'Won’t lay a hand — under Petra there is no ejecting anybody. She will fetch you to the desk and watch you handle it.' },
    doyle:   { role:'watch', name:'Doyle Riggs', wage:42, deter:0.40, eject:true,
      gift:'Ex-cop — trouble at the desk runs 40% rarer, and his ejects are final.',
      flaw:'The road talks — every eject under Doyle is highway gossip by morning: the next night’s pools run 4% thin.' }
  };
  function staffPerson(g, role){
    const v = g.staff && g.staff[role];
    if (!v) return null;
    if (v === true) return PEOPLE[role === 'hk' ? 'mabel' : 'eddie'];
    return PEOPLE[v] || null;
  }
  function hireStaff(g, role, who){
    ensureSeason(g);
    if (g.phase !== 'morning' || g.over) return { error: 'Hiring happens in the morning.' };
    const p = PEOPLE[who];
    if (!p || p.role !== role) return { error: 'No such person for that job.' };
    if (!g.staff) g.staff = { hk: null, clerk: null };
    if (g.staff[role]) return { error: `${staffPerson(g, role).name} holds that job — let them go first.` };
    g.staff[role] = who;
    if (!g.people) g.people = {};
    if (!g.people[who]) g.people[who] = { xp: 0 };
    return { ok: true, staff: g.staff };
  }
  // ---------- Pass J4: THE ROSTER ----------
  // People learn the place. XP is nights worked (a busy night, six rooms or
  // more in house, teaches double); levels land at 8, 20, 38 and 60 nights.
  // A level is worth +8 minutes and a cleaner clean to a housekeeper, +1
  // softening every other level to a clerk, and +6% wages to either.
  // Shifts: a housekeeper on the evening turn leaves the morning pool and
  // keeps the rooms' dirt down instead; a clerk on morning cover turns
  // rooms early (+20 minutes) and writes the replies (+0.03 of travel) but
  // is home by noon — no softening when the knocks come.
  const LEVEL_XP = [8, 20, 38, 60];
  function personLevel(g, who){
    const xp = (g.people && g.people[who] && g.people[who].xp) || 0;
    let lvl = 1; for (const t of LEVEL_XP) if (xp >= t) lvl++;
    return lvl;
  }
  function wageOf(g, role){
    const p = staffPerson(g, role);
    if (!p) return 0;
    return Math.round(p.wage * (1 + 0.06 * (personLevel(g, g.staff[role]) - 1)));
  }
  function setShift(g, role, shift){
    ensureSeason(g);
    if (g.phase !== 'morning' || g.over) return { error: 'The roster is set in the morning.' };
    if (role !== 'hk' && role !== 'clerk') return { error: 'No such job.' };
    const ok = role === 'hk' ? ['day', 'evening'] : ['night', 'morning'];
    if (!ok.includes(shift)) return { error: 'No such shift for that job.' };
    if (!g.staff || !g.staff[role]) return { error: 'Nobody holds that job.' };
    if (!g.shifts) g.shifts = { hk: 'day', clerk: 'night' };
    g.shifts[role] = shift;
    return { ok: true, shifts: g.shifts };
  }
  function fireStaff(g, role){
    ensureSeason(g);
    if (g.phase !== 'morning' || g.over) return { error: 'Letting go happens in the morning.' };
    if (role !== 'hk' && role !== 'clerk' && role !== 'watch') return { error: 'No such job.' };
    if (!g.staff) g.staff = { hk: null, clerk: null, watch: null };
    g.staff[role] = null;
    return { ok: true, staff: g.staff };
  }
  function housekeepingPool(g, extra){
    const hk = staffPerson(g, 'hk');
    let mins = 0;
    if (hk && !(g.shifts && g.shifts.hk === 'evening')) mins = hk.minutes + (personLevel(g, g.staff.hk) - 1) * 8;
    const clerkCover = g.shifts && g.shifts.clerk === 'morning' && staffPerson(g, 'clerk') ? 20 : 0;
    return BASE_MINUTES + Math.max(0, g.rooms.length - 8) * 20 + (extra ? EXTRA_MINUTES : 0) + mins + clerkCover;
  }
  // ---------- Pass E3: staff, review replies, weekly-rate deals ----------
  // Kept as the steady hands' shorthand: on = hire the baseline person.
  function setStaff(g, role, on){
    if (role !== 'hk' && role !== 'clerk' && role !== 'watch') return { error: 'No such job.' };
    return on ? hireStaff(g, role, role === 'hk' ? 'mabel' : role === 'clerk' ? 'eddie' : 'hollis') : fireStaff(g, role);
  }
  const REPLIES = {
    gracious: { good: 'Thank you for saying so — and for staying with us. The star will be lit when you pass this way again.',
                mid: 'Thank you for the honest word. We read every one, and the morning crew hears about it.',
                bad: 'You are right to say it plainly, and we are sorry. It has been seen to, and the coffee is on us if you pass again.' },
    funny:    { good: 'Careful — praise like that and the neon will get a swelled head.',
                mid: 'Fair. We are a work in progress with excellent parking.',
                bad: 'We would like to blame the bedspread, but the bedspread has retained a lawyer. Sorry — truly.' },
    firm:     { good: 'Glad the room suited. It was ready because the crew takes pride in it.',
                mid: 'Noted. We keep the place honest and the rate fair, and we will keep at it.',
                bad: 'We have read this twice. The room has been seen to. That is all we will say, and it is true.' }
  };
  function replyMult(tone, stars){
    // Pass H1: the numbers now honour what the morning hint teaches — the
    // right tone moves the road by a tenth, the wrong one costs as much,
    // and the effect rides two nights (full, then half-strength).
    if (stars >= 4) return tone === 'funny' ? 1.12 : tone === 'gracious' ? 1.06 : 0.90;
    if (stars === 3) return tone === 'gracious' ? 1.10 : tone === 'funny' ? 1.04 : 0.95;
    return tone === 'firm' ? 1.12 : tone === 'gracious' ? 1.05 : 0.88;
  }
  function replyToReview(g, idx, tone){
    ensureSeason(g);
    if (g.phase !== 'morning' || g.over) return { error: 'Replies are written in the morning.' };
    if (!REPLIES[tone]) return { error: 'No such tone.' };
    if (g.reply && g.reply.night === g.night) return { error: 'One reply a morning — the road has read it.' };
    const rep = g.lastReport;
    if (!rep || rep.night !== g.night - 1) return { error: 'No fresh cards to answer.' };
    const co = rep.checkouts[idx];
    if (!co || !co.review) return { error: 'That card has no review on it.' };
    const stars = co.review.stars;
    const bucket = stars >= 4 ? 'good' : stars === 3 ? 'mid' : 'bad';
    let rMult = replyMult(tone, stars);
    if (g.staff && g.staff.clerk === 'wanda') rMult = 1 + (rMult - 1) * 0.75; // Wanda's hand: the word travels less far
    if (g.staff && g.staff.clerk && g.shifts && g.shifts.clerk === 'morning') rMult += 0.03; // morning cover writes the replies fresh
    g.reply = { night: g.night, idx, tone, stars, mult: rMult, text: REPLIES[tone][bucket] };
    if (Array.isArray(g.reviewWall)){
      const w = g.reviewWall.find(e => e.night === rep.night && e.name === co.name);
      if (w) w.reply = { tone, text: g.reply.text };
    }
    return { ok: true, reply: g.reply };
  }
  function dealFor(g, segKey, nights, rate, salt){
    if (segKey !== 'crew' && segKey !== 'longstay') return null;
    // The deal roll runs on its own hash stream, never the season's rng —
    // an unanswered offer shouldn't reshuffle the whole summer's luck.
    let h = ((g.seed >>> 0) * 2654435761 + g.night * 40503 + (salt || 0) * 977 + 17) >>> 0;
    const draw = () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
    if (draw() < 0.45) return null;
    // Pass H1: deals used to all price at the same flat 80% of the card, so
    // the answer was always the same. Now the spread is honest — a third of
    // offers are fair (88–95%), the middle are standard (78–87%), and the
    // rest are poor (60–74%) with a longer lock-in: a big lump that reads
    // generous until you divide it by the nights. The desk shows tonight's
    // card; judging the offer against it is the player's job again.
    const kind = draw();
    // Pass H5: in the squeeze, the desk's deals run meaner — the fair band
    // thins and the poor band fattens. Word travels among crews, too.
    const squeezed = g.credit >= 6000 || g.cash < 0;
    const fairCut = squeezed ? 0.15 : 0.35, stdCut = squeezed ? 0.55 : 0.75;
    let f, extra = 0;
    if (kind < fairCut) f = 0.88 + draw() * 0.07;
    else if (kind < stdCut) f = 0.78 + draw() * 0.09;
    else { f = 0.60 + draw() * 0.14; extra = 1 + Math.floor(draw() * 2); }
    const ratePer = clamp(Math.round(rate * f / 5) * 5, 30, 200);
    if (ratePer >= rate) return null;
    return { nights: nights + 2 + Math.floor(draw() * 3) + extra, ratePer };
  }
  function answerDeal(g, arrivalId, accept){
    const a = g.queue.find(q => q.id === arrivalId);
    if (!a || !a.deal) return { error: 'No deal on the table.' };
    if (a.dealTaken || a.dealDeclined) return { error: 'That deal is settled.' };
    if (accept) a.dealTaken = true; else a.dealDeclined = true;
    return { ok: true };
  }
  function cleanMinutes(g, levelKey){
    let m = CLEAN_LEVELS[levelKey].min;
    if (hasUpgrade(g, 'laundry')) m *= 0.90;
    if (hasUpgrade(g, 'deepclean')) m *= 0.62;
    if (hasUpgrade(g, 'laundry') && hasUpgrade(g, 'deepclean')) m *= 0.85; // The Back Room combo
    return Math.ceil(m);
  }
  function queueCap(g){ return Math.max(12, g.rooms.length + 4); }
  // Pay for something, drawing on the credit line only for what cash can't cover.
  function payWithCredit(g, cost){
    ensureSeason(g);
    if (g.cash >= cost){ g.cash = roundMoney(g.cash - cost); return true; }
    const need = roundMoney(cost - g.cash);
    if (g.credit + need > CREDIT_LIMIT) return false;
    g.credit = roundMoney(g.credit + need);
    g.stats.maxCredit = Math.max(g.stats.maxCredit || 0, g.credit);
    g.cash = 0;
    return true;
  }
  function applyCreditDraw(g){
    ensureSeason(g);
    if (g.cash >= 0) return 0;
    const drawn = Math.min(CREDIT_LIMIT - g.credit, -g.cash);
    if (drawn <= 0) return 0;
    g.credit = roundMoney(g.credit + drawn);
    g.cash = roundMoney(g.cash + drawn);
    g.stats.maxCredit = Math.max(g.stats.maxCredit || 0, g.credit);
    return drawn;
  }
  // Pass J2 — THE PLANT (Hotel Magnate's utilities & maintenance). Machines
  // wear out: every plant item and the three machine upgrades (pool, laundry,
  // vending) carry a condition that decays nightly and can fail outright
  // under 20. A machine's benefit scales with its health — sound 1, tired
  // (15–39) a half, failing or broken nothing. Decay and breakdowns run on
  // their own hash stream, like the deal roll, so the season's rng — and
  // every balance gate measured on it — never moves.
  const PLANT = {
    heater:      { name:'Water heater',     cost:650, svc:70, rep:175, glyph:'flame',
                   blurb:'Hot water in every room, on demand. Amenities +3 while it holds — and a dead heater on a full night is cold showers and long memories.' },
    ice:         { name:'Ice machine',      cost:420, svc:45, rep:110, glyph:'ice',
                   blurb:'A bin by the office that never runs empty. Amenities +2 while it holds.' },
    transformer: { name:'Sign transformer', cost:380, svc:40, rep:95,  glyph:'bolt',
                   blurb:'Clean power for the neon. The star burns steadier and reads further — every pool +4% while it holds.' },
    pool:        { name:'Pool plant',       svc:80, rep:200, glyph:'pool', via:'pool',
                   blurb:'The pump and filter behind the blue. Families look for the pool first in the high weeks — while it runs.' },
    laundry:     { name:'Laundry machines', svc:60, rep:150, glyph:'laundry', via:'laundry',
                   blurb:'The washers and dryers out back. Sheets on site cost 60% less — scaled by how well the machines run.' },
    vending:     { name:'Vending machines', svc:35, rep:85,  glyph:'vending', via:'vending',
                   blurb:'Cold drinks at midnight prices — about $1.60 a room a night, scaled by whether the machine gives or eats.' }
  };
  const PLANT_BROKEN_LINES = {
    heater: 'The water heater gave out in the night — cold showers all round. Repair it in the catalog before it costs you stars.',
    ice: 'The ice machine died in the night — warm drinks and thin patience until it is repaired.',
    transformer: 'The sign transformer blew in the night — the star buzzed, dimmed, and held. It wants repair in the catalog.',
    pool: 'The pool pump seized in the night — the water will turn by the weekend if it is not repaired.',
    laundry: 'A laundry machine threw its belt in the night — sheets by hand until it is repaired.',
    vending: 'The vending machine ate a dollar and gave nothing back, all night. It wants repair.'
  };
  function plantHash(g, id, salt){
    let h = ((g.seed >>> 0) * 2654435761 + g.night * 40503 + salt * 977 + 31) >>> 0;
    for (let i = 0; i < id.length; i++) h = ((h * 1664525 + id.charCodeAt(i) * 1013904223) >>> 0);
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  }
  function plantFactor(g, id){
    const p = g.plant && g.plant[id];
    if (!p) return 1;
    if (p.broken) return 0;
    return p.c >= 40 ? 1 : p.c >= 15 ? 0.5 : 0;
  }
  function plantBroken(g, id){ return !!(g.plant && g.plant[id] && g.plant[id].broken); }
  function plantAmenity(g){
    let a = 0;
    if (g.plant && g.plant.heater) a += 3 * plantFactor(g, 'heater');
    if (g.plant && g.plant.ice) a += 2 * plantFactor(g, 'ice');
    return a;
  }
  function buyPlant(g, id){
    ensureSeason(g);
    if (g.phase !== 'morning' || g.over) return { error: 'The catalog only opens in the morning.' };
    const p = PLANT[id];
    if (!p || !p.cost) return { error: 'Not plant stock.' };
    if (g.plant && g.plant[id]) return { error: 'Already installed.' };
    if (!payWithCredit(g, p.cost)) return { error: 'Not enough cash or credit for that.' };
    if (!g.plant) g.plant = {};
    g.plant[id] = { c: 100, broken: false };
    return { ok: true, item: p };
  }
  function servicePlant(g, id){
    ensureSeason(g);
    if (g.phase !== 'morning' || g.over) return { error: 'The plant is serviced in the morning.' };
    const p = PLANT[id], cur = g.plant && g.plant[id];
    if (!p || !cur) return { error: 'No such machine.' };
    if (!cur.broken && cur.c >= 100) return { error: 'Sound — nothing to do.' };
    const cost = cur.broken ? p.rep : p.svc;
    if (!payWithCredit(g, cost)) return { error: 'Not enough cash or credit for that.' };
    cur.c = 100; cur.broken = false;
    return { ok: true, cost };
  }
  function settlePlant(g){
    // Nightly wear, settled in resolveNight. Returns the ids that broke.
    const broke = [];
    if (!g.plant) return broke;
    const heavyHand = g.staff && g.staff.hk === 'darlene' ? 1 : 0; // Darlene's catch
    for (const id of Object.keys(g.plant)){
      const p = g.plant[id];
      if (p.broken) continue;
      p.c = clamp(p.c - (2 + Math.floor(plantHash(g, id, 3) * 4) + heavyHand), 0, 100);
      if (p.c < 20 && plantHash(g, id, 7) * 100 < (20 - p.c) * 2){ p.broken = true; p.c = 0; broke.push(id); }
    }
    return broke;
  }
  function purchase(g, id){
    ensureSeason(g);
    if (g.phase !== 'morning' || g.over) return { error: 'The catalog only opens in the morning.' };
    const u = UPGRADES.find(x => x.id === id);
    if (!u) return { error: 'Not in the catalog.' };
    if (g.upgrades.includes(id)) return { error: 'Already yours.' };
    if (!payWithCredit(g, u.cost)) return { error: 'Not enough cash or credit for that.' };
    g.upgrades.push(id);
    if (PLANT[id] && PLANT[id].via){ if (!g.plant) g.plant = {}; g.plant[id] = { c: 100, broken: false }; }
    if (u.amenity) g.amenities = clamp(g.amenities + u.amenity, 0, 110);
    if (id === 'mattress') for (const r of g.rooms) r.condition = clamp(r.condition + 20, 0, 100);
    const lit = COMBOS.find(c => (c.a === id || c.b === id) && hasUpgrade(g, c.a) && hasUpgrade(g, c.b));
    return { ok: true, item: u, comboLit: lit ? lit.name : null, comboLine: lit ? lit.line : null };
  }
  function purchaseExpansion(g){
    ensureSeason(g);
    if (g.phase !== 'morning' || g.over) return { error: 'Building only happens in the morning.' };
    const ex = EXPANSIONS[g.expansions];
    if (!ex) return { error: 'The court is complete — sixteen rooms.' };
    if (g.night < ex.unlock) return { error: `The crew can start on night ${ex.unlock}.` };
    if (!payWithCredit(g, ex.cost)) return { error: 'Not enough cash or credit to build.' };
    for (let i = 0; i < ex.rooms; i++){
      g.rooms.push({ id: g.rooms.length + 1, state: 'ready', dirt: ri(g, 0, 6), condition: 90, tier: 'standard', finish: null, fittings: [], quirk: drawQuirk(g), guest: null, size: roomSize(g.rooms.length + 1) });
    }
    g.expansions++;
    return { ok: true, expansion: ex };
  }
  function roomWork(g, kind, roomId, extra){
    ensureSeason(g);
    if (g.phase !== 'morning' || g.over) return { error: 'Room work happens in the morning.' };
    const room = g.rooms.find(r => r.id === roomId);
    if (!room) return { error: 'No such room.' };
    if (room.state === 'occupied') return { error: 'There is a guest in that room — work waits for checkout.' };
    if (kind === 'repair'){
      if (room.condition >= 100) return { error: 'That room needs nothing.' };
      if (!payWithCredit(g, 55)) return { error: 'Not enough cash or credit.' };
      room.condition = clamp(room.condition + 25, 0, 100);
      return { ok: true };
    }
    if (kind === 'renovate'){
      if (room.tier === 'renovated') return { error: 'Already renovated.' };
      const finish = FINISHES[extra] ? extra : 'quiet';
      if (!payWithCredit(g, 950)) return { error: 'Not enough cash or credit.' };
      room.condition = 100; room.tier = 'renovated'; room.finish = finish;
      return { ok: true, finish };
    }
    if (kind === 'fitting'){
      const f = FITTINGS[extra];
      if (!f) return { error: 'No such fitting.' };
      if (!Array.isArray(room.fittings)) room.fittings = [];
      if (room.fittings.includes(extra)) return { error: 'Already fitted.' };
      if (room.fittings.length >= 2) return { error: 'Two fittings to a room — the walls are only so big.' };
      if (!payWithCredit(g, f.cost)) return { error: 'Not enough cash or credit.' };
      room.fittings.push(extra);
      return { ok: true };
    }
    return { error: 'Unknown work.' };
  }
  function adjustCredit(g, amount){
    ensureSeason(g);
    if (g.phase !== 'morning' || g.over) return { error: 'The bank envelope only opens in the morning.' };
    if (amount === 'repayAll') amount = -g.credit;
    amount = Math.round(amount);
    if (amount > 0){
      if (g.credit + amount > CREDIT_LIMIT) return { error: 'That is past the $8,000 line.' };
      g.credit = roundMoney(g.credit + amount); g.cash = roundMoney(g.cash + amount);
      g.stats.maxCredit = Math.max(g.stats.maxCredit || 0, g.credit);
    } else if (amount < 0){
      const repay = Math.min(-amount, g.credit);
      if (g.cash < repay) return { error: 'Not enough cash in the till to repay that.' };
      g.credit = roundMoney(g.credit - repay); g.cash = roundMoney(g.cash - repay);
    }
    return { ok: true, credit: g.credit, cash: g.cash };
  }

  function repMult(rating){
    // Below 3 stars the market stops forgiving: conversion falls off a shelf,
    // and the shelf steepens the further you slide (tuned Pass 3, seed 11).
    return rating < 3 ? clamp(0.30 + rating * 0.17, 0.55, 0.81)
                      : clamp(0.84 + (rating - 3) * 0.27, 0.84, 1.38);
  }
  function dowOf(night){ return (4 + night - 1) % 7; } // night 1 = Friday: the season opens on a weekend

  function segmentPool(g, segKey, night){
    const s = SEGMENTS[segKey];
    let f = seasonArc(night) * competitorFactor(g, night);
    const ev = activeEvent(g, night);
    if (ev){
      if (ev.all) f *= ev.all;
      if (ev.seg && ev.seg[segKey]) f *= ev.seg[segKey];
    }
    if (hasUpgrade(g, 'website')) f *= 1.08;
    if (hasUpgrade(g, 'sign')) f *= 1.12;
    if (segKey === 'family' && hasUpgrade(g, 'pool') && seasonArc(night) >= 1) f *= 1 + 0.22 * plantFactor(g, 'pool');
    if (segKey === 'trucker' && hasUpgrade(g, 'truckpad')) f *= 1.15;
    if (segKey === 'tourist' && hasUpgrade(g, 'truckpad')) f *= 1.06;
    if (segKey === 'family' && hasUpgrade(g, 'pets')) f *= 1.08;
    if (hasUpgrade(g, 'billboard')) f *= 1.10;
    if (g.plant && g.plant.transformer) f *= 1 + 0.04 * plantFactor(g, 'transformer');
    for (const c of activeCombos(g)) if (c.seg && c.seg[segKey]) f *= c.seg[segKey];
    if (g.challenges){
      if (g.challenges.marla && g.challenges.marla.done && (segKey === 'family' || segKey === 'tourist')) f *= 1.06;
      if (g.challenges.june && g.challenges.june.done && segKey === 'tourist') f *= 1.10;
    }
    if (g.reply && g.reply.night === night) f *= g.reply.mult;
    else if (g.reply && g.reply.night === night - 1) f *= Math.sqrt(g.reply.mult); // the word is still travelling, fainter
    if (g.ejectWord && g.ejectWord.night === night) f *= 0.96; // Pass J5: Doyle's eject is highway gossip for a night
    if (g.guideWord && night >= g.guideWord.from && night <= g.guideWord.until) f *= g.guideWord.mult; // Pass J8: the guide is being carried this week
    if (g.mkt){
      if (g.mkt.focus[segKey]) f *= 1.25; // Pass J9: a campaign talks to one road at a time
      f *= AD_TIERS[g.mkt.ad || 0].mult;  // Pass J9: the paper, the radio
    }
    if (g.town && g.town.length){ // Pass J10: what you put into the town comes back as traffic
      if (hasTown(g, 'piecase') && (segKey === 'family' || segKey === 'tourist')) f *= 1.06;
      if (hasTown(g, 'garage') && segKey === 'trucker') f *= 1.08;
      if (hasTown(g, 'church') && segKey === 'longstay') f *= 1.10;
      if (hasTown(g, 'drivein') && segKey === 'tourist') f *= 1.12;
    }
    const sl = segLevel(g, segKey); if (sl) f *= 1 + 0.03 * sl; // Pass J11: a road that loves you sends more of its own (3% a level, balanced against the value forgiveness in bookProb/scoreStay — see the J11 tuning note in the suite)
    if (segKey === 'tourist' && g.forecourt && g.forecourt.pump && g.pump && g.pump.mode === 'premium') f *= 0.98; // Pass J12: the premium sign is highway talk
    if (segKey === 'trucker' && g.regular && g.regular.kept >= 3) f *= 1.04; // Earl's word at the truck stops
    // The road has moods: some nights the highway is generous, some nights it
    // is not, and no rate card changes that. Rolled once per night (createGame,
    // resolveNight); the forecast reports a hint, never the number.
    if (night === g.night && typeof g.roadMood === 'number') f *= g.roadMood;
    return s.base * s.dow[dowOf(night)] * f;
  }
  function rollRoadMood(g){ return Math.round((0.85 + rnd(g) * 0.35) * 100) / 100; }
  // ---------- Pass J7: THE GROUNDS ----------
  // Prestige is the property as the road reads it: what has been built,
  // how the rooms are kept, whether the plant is sound, and what the
  // stars say. It buys a little pricing room everywhere — the fair price
  // runs up to a tenth kinder — and it is placed, not just totalled: the
  // rooms beside the pool and the breakfast nook judge their amenities
  // gentler, because that is what the guest is actually looking at.
  const PRESTIGE = { pool:6, sign:5, breakfast:4, piewindow:4, solar:4, ac:3, wifi:3, billboard:3,
                     website:2, vending:2, pets:2, truckpad:2, mattress:2, security:2, laundry:1, deepclean:1 };
  function prestigeDetail(g){
    const parts = [];
    let score = 0;
    for (const u of UPGRADES){ if (hasUpgrade(g, u.id) && PRESTIGE[u.id]){ parts.push({ label: u.name.toLowerCase(), pts: PRESTIGE[u.id] }); score += PRESTIGE[u.id]; } }
    const ren = g.rooms.filter(r => r.tier === 'renovated').length;
    if (ren){ const pts = Math.min(16, ren * 2); parts.push({ label: ren === 1 ? 'a renovated room' : `${ren} renovated rooms`, pts }); score += pts; }
    const plush = g.rooms.filter(r => r.finish === 'plush').length;
    if (plush){ const pts = Math.min(8, plush); parts.push({ label: 'plush finishes', pts }); score += pts; }
    const fits = g.rooms.reduce((a, r) => a + (r.fittings || []).length, 0);
    if (fits >= 3){ const pts = Math.min(6, Math.floor(fits / 3)); parts.push({ label: 'the fittings', pts }); score += pts; }
    const plantIds = Object.keys(g.plant || {});
    if (plantIds.length){
      const avg = plantIds.reduce((a, id) => a + (g.plant[id].broken ? 0 : g.plant[id].c), 0) / plantIds.length;
      const pts = Math.round(avg / 25);
      if (pts > 0){ parts.push({ label: 'a sound plant', pts }); score += pts; }
    }
    const starPts = Math.round((g.rating - 3) * 4);
    if (starPts > 0){ parts.push({ label: 'the stars themselves', pts: starPts }); score += starPts; }
    parts.sort((a, b) => b.pts - a.pts);
    return { score: Math.max(0, score), parts };
  }
  function prestige(g){ return prestigeDetail(g).score; }
  function prestigeRefMult(g){ return 1 + Math.min(0.10, prestige(g) * 0.0015); }
  function poolRooms(g){ const mid = Math.ceil(g.rooms.length / 2); return [mid, mid + 1]; }
  // ---------- Pass J8: THE HIGHWAY GUIDE ----------
  // Twice a summer the guide prints its rankings for this stretch of
  // highway: the Starlight against the Starling Suites across the road,
  // the Desert Inn at the county line, and the Palm Court Lodge, fading
  // politely. The player's mark is real — stars, prestige, and how full
  // the court has run. Print high and travellers carry the guide for a
  // week: the road runs thicker.
  function guideHash(g, salt){
    let h = (g.seed >>> 0) ^ 0x9e3779b9;
    const s = String(salt);
    for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i) + (h << 5); h = Math.imul(h, 16777619) >>> 0; }
    return ((h >>> 0) % 1000) / 1000;
  }
  const GUIDE_RIVALS = [
    { name: 'The Starling Suites', line: 'The chain across the highway. Everything new, nothing remembered.' },
    { name: 'The Desert Inn', line: 'At the county line. A fair court, a famous pie case, no hurry in it.' },
    { name: 'The Palm Court Lodge', line: 'Fading politely since the interstate. The regulars are loyal; the paint is not.' }
  ];
  function guideRows(g){
    const occPct = g.stats.possibleRoomNights ? 100 * g.stats.roomNights / g.stats.possibleRoomNights : 0;
    const you = Math.round(g.rating * 18 + prestige(g) * 0.6 + occPct * 0.25);
    const n = g.night;
    const scores = {
      'The Starling Suites': Math.round(84 + Math.max(0, n - 43) * 0.35 + guideHash(g, 'starling') * 4),
      'The Desert Inn': Math.round(76 + (guideHash(g, 'desert') - 0.5) * 6),
      'The Palm Court Lodge': Math.round(74 - n * 0.08 + (guideHash(g, 'palm') - 0.5) * 4)
    };
    const rows = [{ name: 'The Starlight Motel', score: you, you: true,
                    line: you >= 95 ? 'The court everybody talks about at the diner.' : you >= 85 ? 'A kept court with a lit sign — the pick of the independents.' : you >= 75 ? 'Honest rooms, honestly kept. The guide has its eye on it.' : 'A plain court on a loud highway. The guide is waiting to be impressed.' },
                  ...GUIDE_RIVALS.map(r => ({ name: r.name, score: scores[r.name], line: r.line }))];
    rows.sort((a, b) => b.score - a.score);
    const prev = g.guidePrev || [];
    for (const r of rows){
      const was = prev.indexOf(r.name);
      r.move = was >= 0 ? was - rows.indexOf(r) : null;
    }
    return rows;
  }
  // ---------- Pass J9: THE WORD GETS OUT ----------
  // Marketing is a running spend, not a purchase: a campaign per road
  // ($25 a night, that segment's pool ×1.25 while it runs), one standing
  // advert (the county paper, the radio spot), and two packages that
  // reshape the drive-up trade in genQueue. All of it settles nightly.
  const AD_TIERS = [
    { name: 'No advert running', cost: 0, mult: 1 },
    { name: 'The county paper', cost: 18, mult: 1.05 },
    { name: 'The radio spot', cost: 45, mult: 1.10 }
  ];
  function mktCost(g){
    if (!g.mkt) return 0;
    let c = AD_TIERS[g.mkt.ad || 0].cost;
    for (const k in g.mkt.focus) if (g.mkt.focus[k]) c += 25;
    return c;
  }
  function setFocus(g, seg, on){ if (!g.mkt || !SEGMENTS[seg]) return { error: 'No such road.' }; g.mkt.focus[seg] = !!on; return { ok: true }; }
  function setAdTier(g, i){ if (!g.mkt || !AD_TIERS[i]) return { error: 'No such advert.' }; g.mkt.ad = i; return { ok: true }; }
  function setPackage(g, key, on){ if (!g.mkt || !(key in g.mkt.pkg)) return { error: 'No such package.' }; g.mkt.pkg[key] = !!on; return { ok: true }; }

  // ---------- Pass J10: THE TOWN ----------
  // The motel is not the whole world. Money put into the town — the
  // diner's pie case, the garage's tow rig, the church hall's roof, the
  // drive-in's second screen — comes back as traffic on specific roads,
  // for good. The pie case also unlocks a sellable extra: diner vouchers
  // at the desk, $5 a room over the counter, on nights you choose (the
  // pie window stays dark those nights — your guests are eating out).
  const TOWN = [
    { id:'piecase', name:'The diner — a new pie case', cost:900,  line:'Families and tourists run 6% thicker — folks stop for pie and stay the night. Unlocks diner vouchers at the desk.' },
    { id:'garage',  name:'The garage — a tow rig',     cost:1200, line:'Truckers run 8% thicker, and the garage owes you: a handyman callout is $50, not $80.' },
    { id:'church',  name:'The church hall — a new roof', cost:750, line:'Long-stay traffic runs 10% thicker — retreats, visiting preachers, cousins in for the reunion.' },
    { id:'drivein', name:'The drive-in — a second screen', cost:1500, line:'Tourists run 12% thicker, and families and tourists judge the court 2 kinder — a night at the pictures counts.' }
  ];
  function hasTown(g, id){ return !!g.town && g.town.includes(id); }
  function buyTown(g, id){
    const t = TOWN.find(x => x.id === id);
    if (!t) return { error: 'No such place in town.' };
    if (hasTown(g, id)) return { error: 'Already done — the town remembers.' };
    if (g.cash < t.cost) return { error: 'Not enough in the till.' };
    g.cash = Math.round((g.cash - t.cost) * 100) / 100;
    (g.town = g.town || []).push(id);
    return { ok: true };
  }

  // ---------- Pass J11: WORD OF MOUTH ----------
  // Every road forms its own opinion. Serve a segment well and its
  // standing climbs (12 / 30 / 55 / 90 good turns): the road runs
  // thicker — loyal — and its people notice more — demanding, dirt
  // reads deeper against them. From the first level they also send
  // their own: a referred arrival names the guest who sent them and
  // arrives half-sold (+8 match, carried into the stay).
  const SEG_XP_AT = [12, 30, 55, 90];
  function segLevel(g, seg){
    const x = g.segXp && g.segXp[seg];
    if (!x) return 0;
    let l = 0; for (const at of SEG_XP_AT) if (x.xp >= at) l++;
    return l;
  }

  // ---------- Pass J12: THE FORECOURT ----------
  // A second business on the same concrete. The shop trades on stock
  // and a shelf price you set; the pump trades on a price sign you
  // choose (a cent under brings the road in, premium takes more and
  // the tourists hear about it); the wash is a coin box that earns
  // against a full court. Each keeps its own little P&L in the register.
  const FORE = [
    { id:'shop', name:'The forecourt shop', cost:800,  line:'A counter, a fridge, a shelf of road food. You stock it by the case and set the shelf price; it sells against the night\u2019s occupancy.' },
    { id:'pump', name:'The fuel pump',      cost:1400, line:'One pump on the forecourt. Set the sign: match the highway, a cent under it, or premium — the take follows, and so does the talk.' },
    { id:'wash', name:'The car wash',       cost:950,  line:'A coin-box wash at the court\u2019s edge. Six dollars a car, and a full court washes more cars.' }
  ];
  const SHELF_PRICES = [4, 6, 8, 10];
  const SHELF_TAKE = { 4: 0.9, 6: 0.7, 8: 0.5, 10: 0.32 };
  const PUMP_MODES = { match: { mult: 1, label: 'at the highway price' }, under: { mult: 1.15, label: 'a cent under the highway' }, premium: { mult: 1.30, label: 'at the premium price' } };
  function buyForecourt(g, id){
    const t = FORE.find(x => x.id === id);
    if (!t) return { error: 'No such fixture.' };
    if (g.forecourt && g.forecourt[id]) return { error: 'Already standing.' };
    if (g.cash < t.cost) return { error: 'Not enough in the till.' };
    g.cash = Math.round((g.cash - t.cost) * 100) / 100;
    (g.forecourt = g.forecourt || {})[id] = true;
    return { ok: true };
  }
  function buyStock(g, cases){
    if (!g.forecourt || !g.forecourt.shop) return { error: 'No shop to stock.' };
    const cost = 24 * cases;
    if (g.cash < cost) return { error: 'Not enough in the till.' };
    g.cash = Math.round((g.cash - cost) * 100) / 100;
    g.shop.stock += 12 * cases;
    return { ok: true };
  }
  function setShelfPrice(g, p){ if (!SHELF_PRICES.includes(p)) return { error: 'No such shelf price.' }; g.shop.price = p; return { ok: true }; }
  function setPumpMode(g, m){ if (!PUMP_MODES[m]) return { error: 'No such sign.' }; g.pump.mode = m; return { ok: true }; }

  // ---------- Pass J13: THE PLACARDS ----------
  // The highway association pins three placards in the office each
  // season — one for the money, one for the house, one for the road —
  // dealt by hash from authored sets. Meet one and it comes down with
  // a bounty in an envelope; they are the genre's level goals, hung
  // on a corkboard by the desk.
  const PLACARDS = [
    { id:'cash8',     fam:'money', name:'Eight Thousand Clear', line:'Hold $8,000 in the till at a night\u2019s settlement.', bounty:300, test:(g) => g.cash >= 8000 },
    { id:'offline',   fam:'money', name:'Off the Line', line:'Draw on the credit line, then pay it back to nothing.', bounty:250, test:(g) => !!g.drewOnce && g.credit === 0 },
    { id:'forepay',   fam:'money', name:'The Forecourt Pays', line:'Take $400 across the forecourt in a season.', bounty:200, test:(g) => (g.foreEarned || 0) >= 400 },
    { id:'bignight',  fam:'money', name:'A Nine-Hundred Night', line:'Settle a single night at $900 or better, all told.', bounty:200, test:(g, ctx) => ctx.revenue >= 900 },
    { id:'stars4',    fam:'house', name:'Four Stars Standing', line:'Hold four stars at a night\u2019s settlement.', bounty:250, test:(g) => g.rating >= 4.0 },
    { id:'gloves',    fam:'house', name:'White Gloves', line:'Five or more checkouts in one night, every one scoring 80 or better.', bounty:300, test:(g, ctx) => ctx.checkouts.length >= 5 && ctx.checkouts.every(c => c.score >= 80) },
    { id:'plantsound',fam:'house', name:'The Plant, Sound', line:'Three or more machines standing, every one at 70 or better.', bounty:200, test:(g) => { const ps = Object.values(g.plant || {}); return ps.length >= 3 && ps.every(p => p.c >= 70); } },
    { id:'doors16',   fam:'house', name:'Sixteen Doors', line:'Grow the court to sixteen doors.', bounty:400, test:(g) => g.rooms.length >= 16 },
    { id:'roadtaken', fam:'road',  name:'A Road Taken', line:'Bring any one road to standing 2.', bounty:250, test:(g) => Object.keys(SEGMENTS).some(s => segLevel(g, s) >= 2) },
    { id:'inguide',   fam:'road',  name:'In the Guide', line:'Stand first or second when the Highway Guide prints.', bounty:300, test:(g) => !!g.guide && g.guide.pos <= 2 },
    { id:'town3',     fam:'road',  name:'The Town Stands With You', line:'Put money into three places in town.', bounty:300, test:(g) => (g.town || []).length >= 3 },
    { id:'fullfri',   fam:'road',  name:'Full Court Friday', line:'Fill every door on a Friday night.', bounty:350, test:(g, ctx) => (g.night - 1) % 7 === 0 && ctx.occ > 0 && ctx.occ === g.rooms.length }
  ];
  function dealPlacards(g){
    const dealt = [];
    for (const fam of ['money', 'house', 'road']){
      const set = PLACARDS.filter(p => p.fam === fam);
      dealt.push(set[Math.floor(ticketHash(g, 'placard-' + fam) * set.length)].id);
    }
    return { dealt, won: {} };
  }

  function bookProb(g, segKey, rate){
    const s = SEGMENTS[segKey];
    let ref = s.ref;
    if (segKey === 'family' && hasUpgrade(g, 'breakfast')) ref += 10;
    if (segKey === 'family' && hasUpgrade(g, 'piewindow')) ref += 5;
    ref *= prestigeRefMult(g); // Pass J7: a kept house is forgiven a little more on the card
    ref *= 1 + 0.03 * segLevel(g, segKey); // Pass J11: a road that loves you forgives the card, too
    const ev = activeEvent(g, g.night);
    const fair = ref * repMult(g.rating) * (ev && ev.price ? ev.price : 1);
    // Asymmetric: demand falls off much faster above the fair price than it
    // rises below it — guests comparison-shop the premium away instantly.
    const e = rate > fair ? s.elast * 1.7 : s.elast;
    return clamp(Math.pow(fair / rate, e), 0.02, 1);
  }

  function createGame(seed, content, season){
    const seasonNum = (typeof season === 'number' && season > 0) ? Math.floor(season) : 1;
    const g = {
      version: 2, seed: seed >>> 0, rng: seed >>> 0,
      season: seasonNum, calendar: buildCalendar(seasonNum, seed >>> 0), ledger: [], standing: null,
      night: 1, phase: 'morning', cash: 4250, rating: 3.4,
      rate: 79, ratePremium: null, seasonFactor: seasonArc(1), amenities: 60,
      rooms: [], queue: [], processed: 0,
      lastReport: null, lastPlan: null, over: null,
      guestBook: [], reviewWall: [], inquiry: null, incident: null,
      challenges: freshChallenges(), challengeNote: null, grudges: {},
      phone: null, blocks: [],
      credit: 0, upgrades: [], expansions: 0, cleanLog: [],
      lastInspection: null, bankLetter: null, ending: null, handymanTonight: false,
      cashHistory: [4250], quirkDeck: [],
      content: content || null,
      stats: { nights:0, revenue:0, guests:0, turnedAway:0, droveOn:0, reviews:0, checkouts:0,
               roomNights:0, possibleRoomNights:0, fullHouses:0, fiveStarReviews:0, oneStarReviews:0, returners:0,
               incidents:0, incidentsHandled:0, certificates:0, bestNightProfit:null,
               lowestRatingAfter20:null, maxCredit:0, peakCash:4250 }
    };
    const conds = [88, 82, 79, 76, 74, 71, 68, 65];
    for (let i = 0; i < 8; i++){
      g.rooms.push({ id: i + 1, state: 'ready', dirt: ri(g, 0, 6), condition: conds[i], tier: 'standard', finish: null, fittings: [], quirk: drawQuirk(g), guest: null, size: roomSize(i + 1) });
    }
    g.roadMood = rollRoadMood(g);
    return g;
  }

  function names(g){
    const c = g.content || {};
    return { first: c.firstNames || DEF_FIRST, last: c.lastNames || DEF_LAST };
  }
  function guestName(g){
    const n = names(g);
    return pick(g, n.first) + ' ' + pick(g, n.last);
  }

  // ---------- traits, incidents, inquiries (Pass 3) ----------
  const TRAITS = {
    'light-sleeper': { label: 'Light sleeper', hint: 'Hears everything — end rooms are the quiet ones.' },
    'neat':          { label: 'Neat', hint: 'Will notice the cleaning — or the lack of it.' },
    'road-worn':     { label: 'Road-worn', hint: 'Wants the ice, the coffee, the little things working.' },
    'chatty':        { label: 'Chatty', hint: 'Tells people how it went — likely to leave a review.' },
    'easygoing':     { label: 'Easygoing', hint: 'Hard to ruffle. Forgives a lot.' }
  };
  function rollTrait(g){
    const r = rnd(g);
    if (r < 0.40) return null;
    if (r < 0.52) return 'light-sleeper';
    if (r < 0.64) return 'neat';
    if (r < 0.75) return 'road-worn';
    if (r < 0.85) return 'chatty';
    return 'easygoing';
  }

  // ---------- Pass A: every room has a character, every guest a want ----------
  const QUIRKS = {
    'icebox':       { name:'Icebox AC',         short:'Icebox AC',  ask:'an ice-cold room',              seg:{ family:6 },            trait:{ 'road-worn':14 } },
    'thin-walls':   { name:'Thin walls',        short:'Thin walls', ask:'',                              noise:-12,                   trait:{ 'light-sleeper':-18 } },
    'big-tub':      { name:'The big tub',       short:'Big tub',    ask:'the big tub',                   seg:{ family:14, tourist:8 }, trait:{ 'road-worn':6 } },
    'sagging-bed':  { name:'Sagging bed',       short:'Sagging bed', ask:'',                             seg:{ family:-12, longstay:-12, tourist:-6, trucker:-2 }, trait:{ 'road-worn':-14 } },
    'fresh-paint':  { name:'Fresh paint',       short:'Fresh paint', ask:'',                            seg:{ tourist:-3, family:-3 }, trait:{ neat:-16 } },
    'quiet-back':   { name:'Behind the office', short:'Quiet back', ask:'the quiet room behind the office', noise:10, seg:{ longstay:6 }, trait:{ 'light-sleeper':14 } },
    'highway-view': { name:'Highway view',      short:'Hwy view',   ask:'a view of the highway',         seg:{ tourist:10, trucker:6 }, trait:{ 'light-sleeper':-8 } },
    'cloud-bed':    { name:'Cloud-soft bed',    short:'Soft bed',   ask:'the soft bed',                  seg:{ family:6, longstay:8 }, trait:{ 'road-worn':12 } },
    'big-tv':       { name:'The big TV',        short:'Big TV',     ask:'the big TV',                    seg:{ family:8, tourist:6, crew:6 } },
    'drafty':       { name:'Drafty window',     short:'Drafty',     ask:'',                                                            trait:{ neat:-6, 'road-worn':-4 } }
  };
  const QUIRK_KEYS = Object.keys(QUIRKS);
  function drawQuirk(g){
    if (!Array.isArray(g.quirkDeck) || !g.quirkDeck.length){
      g.quirkDeck = QUIRK_KEYS.slice();
      for (let i = g.quirkDeck.length - 1; i > 0; i--){
        const j = Math.floor(rnd(g) * (i + 1));
        const t = g.quirkDeck[i]; g.quirkDeck[i] = g.quirkDeck[j]; g.quirkDeck[j] = t;
      }
    }
    return g.quirkDeck.pop();
  }
  // ---------- Pass F2: challenge guests (after Hot Springs Story) ----------
  // Three named guests keep their own appointments with the desk. Each must
  // leave happy — four stars or better — twice; then they put the Starlight
  // somewhere it cannot buy its way into. Their visits are scheduled by the
  // calendar, never by dice, so the road's stream is undisturbed.
  const CHALLENGES = {
    marla: { id:'marla', name:'Marla Quinn', segment:'tourist', trait:'chatty', want:'quiet-back', nights:2, first:9, every:12, goal:2,
      title:'Judges the county rodeo — the circuit trusts her word.',
      wantLine:'Sleeps before dawn rides: the quiet room behind the office, and a clean one.',
      line:'In for the rodeo — she judges at dawn and sleeps like it matters.',
      unlockLine:'In the programme — the Starlight is printed in the rodeo programme.',
      note:'Marla Quinn put the Starlight in the rodeo programme before she left — a line of print, and the road reads it. Families and road-trippers will find you a little easier from here on.' },
    ray: { id:'ray', name:'Ray Delgado', segment:'crew', trait:'road-worn', want:'icebox', nights:3, first:14, every:12, goal:2,
      title:'Runs the Delgado crew — one long job out at the base.',
      wantLine:'His men want the cold rooms and an early night; he judges the place by how they sleep.',
      line:'The crew boss himself, checking the place his men will sleep.',
      unlockLine:'The standing contract — Ray phones on his rhythm: three rooms, three nights, at the contract rate.',
      note:'Ray Delgado shook on it at the desk: his crew books with you first — three rooms, three nights at the contract rate, on a fortnight’s rhythm. The phone will ring on his weeks now.' },
    june: { id:'june', name:'June Calloway', segment:'tourist', trait:'neat', want:'highway-view', nights:2, first:19, every:12, goal:2,
      title:'Writing the new Route 66 guide — the one the gift shops stock.',
      wantLine:'She writes what she sees: a view of the highway, and a room kept honest.',
      line:'A notebook, a camera, and all the time in the world.',
      unlockLine:'In the guidebook — the Starlight gets its paragraph.',
      note:'June Calloway left with her notebook full. The new Route 66 guide will carry the Starlight in print — road-trippers will plan their stop around you from here on.' }
  };
  const CHALLENGE_NAMES = {}; for (const c of Object.values(CHALLENGES)) CHALLENGE_NAMES[c.name] = c.id;
  function freshChallenges(){ const o = {}; for (const id of Object.keys(CHALLENGES)) o[id] = { met:false, stays:0, happy:0, done:false }; return o; }

  // ---------- Pass E1: finishes chosen at renovate, fittings bought per room ----------
  const FINISHES = {
    quiet:  { name:'Quiet finish', short:'Quiet', blurb:'Thick doors, sealed frames. The room runs quiet (+10 noise), and a quiet room troubles its neighbours half as much.' },
    plush:  { name:'Plush finish', short:'Plush', blurb:'Deep carpet, heavy curtains, the good mattress. Guests judge the room 8 kinder, and it wears at half the usual rate.' },
    bright: { name:'Bright finish', short:'Bright', blurb:'Big windows washed, warm lamps, colour on the wall. Families and tourists take to it (+8 match).' }
  };
  const FITTINGS = {
    curtains: { name:'Blackout curtains', short:'Curtains', cost:120, ask:'the blackout curtains', noise:8, trait:{ 'light-sleeper':10 } },
    desk:     { name:'Work desk & lamp', short:'Desk', cost:140, ask:'a room with a desk', seg:{ crew:10, longstay:10 } },
    fridge:   { name:'Mini-fridge', short:'Fridge', cost:160, ask:'a fridge in the room', seg:{ family:8, longstay:6 } },
    shower:   { name:'Rainfall shower', short:'Shower', cost:220, ask:'the rainfall shower', seg:{ tourist:8, family:6 }, trait:{ 'road-worn':8 }, cond:3 }
  };
  const WANT_BY_SEG = {
    family: ['big-tub', 'cloud-bed', 'big-tv'],
    tourist: ['highway-view', 'big-tv', 'big-tub'],
    trucker: ['icebox', 'highway-view'],
    crew: ['big-tv', 'icebox', 'desk'],
    longstay: ['cloud-bed', 'quiet-back']
  };
  function rollWant(g, segKey, trait){
    if (trait === 'light-sleeper'){ const lw = rnd(g); return lw < 0.55 ? 'quiet-back' : (lw < 0.8 ? 'curtains' : null); }
    if (trait === 'road-worn') return rnd(g) < 0.60 ? pick(g, ['cloud-bed', 'icebox', 'shower']) : null;
    if (trait === 'neat' || trait === 'easygoing') return rnd(g) < 0.25 ? pick(g, WANT_BY_SEG[segKey]) : null;
    return rnd(g) < 0.55 ? pick(g, WANT_BY_SEG[segKey]) : null;
  }
  function matchScore(g, room, guest){
    let m = 72;
    const q = QUIRKS[room.quirk];
    if (q){
      if (q.seg && q.seg[guest.segment]) m += q.seg[guest.segment];
      if (q.trait && guest.trait && q.trait[guest.trait]) m += q.trait[guest.trait];
      const ev = activeEvent(g, g.night);
      if (ev && ev.id === 'heat' && room.quirk === 'icebox') m += 8;
    }
    const fits = room.fittings || [];
    for (const fid of fits){
      const f = FITTINGS[fid];
      if (!f) continue;
      if (f.seg && f.seg[guest.segment]) m += f.seg[guest.segment];
      if (f.trait && guest.trait && f.trait[guest.trait]) m += f.trait[guest.trait];
    }
    if (room.finish === 'bright' && (guest.segment === 'family' || guest.segment === 'tourist')) m += 8;
    if (guest.want && (room.quirk === guest.want || fits.includes(guest.want))) m += 24;
    if (guest.big) m += room.size === 'large' ? 14 : -10; // Pass J6: the size want, honoured or not
    if (guest.referred) m += 8; // Pass J11: they arrived half-sold
    return clamp(m, 5, 100);
  }
  function segLine(g, segKey){
    const c = g.content && g.content.segmentLines;
    if (c && c[segKey] && c[segKey].length) return pick(g, c[segKey]);
    return null;
  }
  const INCIDENTS = {
    rattle:   { label: 'The AC is rattling', text: 'Knocked twice already. Says it sounds like a spoon in a garbage disposal.', text2: 'The unit kicks on every twenty minutes like it is clearing its throat.' },
    plumbing: { label: 'The tap won\'t stop dripping', text: 'Counted it instead of sleeping. Got to four hundred.', text2: 'There is a towel in the sink and a rhythm section in the bathroom.' },
    tv:       { label: 'The TV gave up', text: 'Screen went grey right at the good part. He is taking it personally.', text2: 'Remote works. Picture does not. He has tried both, twice, and is done being reasonable.' },
    noise:    { label: 'Noise through the wall', text: 'The room next door is having a better night than she is.', text2: 'A television, a laugh track, and somebody learning the guitar. Through her wall.' },
    petmess:  { label: 'A dog got at the bedspread', text: 'The little dog was lovely. The bedspread was not up to him.', text2: 'Muddy paws, one chewed corner, and a guest who is very sorry in two languages.' }
  };
  const INQUIRY_TEXT = {
    crew: [
      '{name} called from the job site — needs {rooms} rooms for {nights} nights for the crew, if you will do ${rate} a room.',
      '{name} is foreman on the county job. Wants {rooms} rooms, {nights} nights, at ${rate} a room. Cash on Friday, no trouble.'
    ],
    family: [
      '{name} is bringing the family through — {rooms} rooms for {nights} nights at ${rate} a room, if the dates hold.',
      'Reunion weekend for {name}\'s people: {rooms} rooms, {nights} nights, ${rate} a room. Kids, a dog, one guitar.'
    ],
    longstay: [
      '{name} is working the season nearby and wants the one room for {nights} nights straight, at ${rate} a night.',
      '{name} asked about a weekly arrangement — {nights} nights in the same room, ${rate} a night, pays up front.'
    ]
  };
  function buildInquiry(g, seg){
    const s = SEGMENTS[seg];
    let rooms, nights, disc;
    if (seg === 'crew'){ rooms = ri(g, 2, 4); nights = ri(g, 3, 4); disc = 0.82; }
    else if (seg === 'family'){ rooms = ri(g, 2, 3); nights = 2; disc = 0.88; }
    else { rooms = 1; nights = ri(g, 5, 7); disc = 0.78; }
    const ratePer = clamp(Math.round(s.ref * repMult(g.rating) * disc / 5) * 5, 35, 180);
    const name = guestName(g);
    const text = pick(g, INQUIRY_TEXT[seg])
      .replace('{name}', name).replace('{rooms}', rooms).replace('{nights}', nights).replace('{rate}', ratePer);
    return { seg, rooms, nights, ratePer, name, text };
  }
  function genInquiry(g){
    g.inquiry = null;
    // Ray Delgado's standing contract (Pass F2): once the crew boss is won,
    // his call comes on a fortnight's rhythm — three rooms, three nights at
    // the contract rate. It is the one call that never misses its week.
    if (g.challenges && g.challenges.ray && g.challenges.ray.done && g.night >= 33 && (g.night - 33) % 14 === 0){
      const ratePer = clamp(Math.round(g.rate * 0.85 / 5) * 5, 35, 180);
      g.inquiry = { seg: 'crew', rooms: 3, nights: 3, ratePer, name: 'Ray Delgado', contract: true,
        text: `Ray Delgado on the phone — the standing contract. Three rooms, three nights for the crew at $${ratePer} a night, the way you shook on it.` };
      return;
    }
    // During the Tinker contract, the phone mostly rings with crews.
    const ev = activeEvent(g, g.night);
    if (ev && ev.id === 'crew' && rnd(g) < 0.62){ g.inquiry = buildInquiry(g, 'crew'); return; }
    if (rnd(g) >= 0.38) return;
    // Pass D: from night 20, sometimes the phone is a regular — somebody in
    // the guest book, asking for the room they had last time. The book stops
    // being a list and starts being a business: give them their room and the
    // stay starts warm; hand them another and it starts slightly owed.
    if (g.night >= 20 && Array.isArray(g.guestBook) && rnd(g) < 0.30){
      const known = g.guestBook.filter(e => e.lastRoom && e.lastStars >= 3);
      if (known.length){
        const e = pick(g, known);
        const s = SEGMENTS[e.segment];
        const nights = ri(g, 1, 2);
        const ratePer = clamp(Math.round(s.ref * repMult(g.rating) * 0.95 / 5) * 5, 35, 180);
        g.inquiry = { seg: e.segment, rooms: 1, nights, ratePer, name: e.name, regular: true,
          roomWanted: e.lastRoom,
          text: `${e.name} on the phone — stayed with you before, night ${e.lastNight}. Asks for Room ${e.lastRoom} again, ${nights} night${nights > 1 ? 's' : ''}, at $${ratePer} a night. Some guests you take care of.` };
        return;
      }
    }
    const roll = rnd(g);
    const seg = roll < 0.40 ? 'crew' : roll < 0.70 ? 'family' : 'longstay';
    g.inquiry = buildInquiry(g, seg);
  }
  function genIncident(g){
    g.incident = null;
    ensureSeason(g);
    const occRooms = g.rooms.filter(r => r.state === 'occupied');
    // Pass F5: trouble remembers. A knock the desk earned comes before the
    // road's ordinary luck — a trouble ridden out on a guest who has come
    // back, still unfixed, knocks again and says so.
    for (const room of occRooms){
      const guest = room.guest;
      if (guest.returning && g.grudges[guest.name]){
        const kind = g.grudges[guest.name];
        delete g.grudges[guest.name];
        g.incident = { roomId: room.id, kind, resolved: null, variant: 1,
          cause: 'The same trouble as last time — ridden out at this desk, and never fixed. It kept.' };
        g.stats.incidents++;
        return;
      }
    }
    // And a deal stay, into its run, can turn rowdy: the knock lands on the
    // room next door, once a stay, and only if there is a next door to hear it.
    for (const room of occRooms){
      const guest = room.guest;
      if (!guest.dealStay || guest.rowdyDone || guest.nightsLeft >= guest.dealNights) continue;
      const neighbour = occRooms.find(r => Math.abs(r.id - room.id) === 1 && r.guest !== guest);
      if (!neighbour) continue;
      guest.rowdyDone = true;
      if (rnd(g) < 0.5){
        g.incident = { roomId: neighbour.id, kind: 'noise', resolved: null, variant: 1,
          cause: 'Your deal guests, into their stay — this is the room next door, at the desk about it.' };
        g.stats.incidents++;
        return;
      }
    }
    const occ = occRooms.length;
    const ev = activeEvent(g, g.night);
    for (const room of occRooms){
      const guest = room.guest;
      const p = troubleP(g, room, guest, occ, ev);
      if (rnd(g) < p){
        let kind;
        if (guest.trait === 'light-sleeper' && occ >= 5 && rnd(g) < 0.5) kind = 'noise';
        else kind = pick(g, room.condition < 72 ? ['rattle', 'plumbing', 'tv'] : ['rattle', 'plumbing', 'tv', 'noise']);
        if (hasUpgrade(g, 'pets') && rnd(g) < 0.25) kind = 'petmess';
        g.incident = { roomId: room.id, kind, resolved: null, variant: rnd(g) < 0.5 ? 0 : 1 };
        g.stats.incidents++;
        return;
      }
    }
  }
  // One room's chance of a knock tonight. The watchman's presence scales
  // the same roll — deterrence changes the threshold, never the draw count.
  function troubleP(g, room, guest, occ, ev){
    let p = 0.09;
    if (room.condition < 72) p += 0.13;
    if (room.condition < 55) p += 0.15;
    if (room.condition < 40) p += 0.15;
    if (guest.trait === 'light-sleeper' && occ >= 5) p += 0.10;
    if (ev && ev.id === 'storm') p *= 1.6;
    if (hasUpgrade(g, 'security')) p *= 0.7;
    if (g.handymanTonight) p *= 0.8;
    const watchP = staffPerson(g, 'watch');
    if (watchP) p *= 1 - Math.min(0.6, (watchP.deter || 0) + 0.02 * (personLevel(g, g.staff.watch) - 1));
    return p;
  }
  function resolveIncident(g, action, targetRoomId){
    const inc = g.incident;
    if (!inc || inc.resolved) return { error: 'Nothing to see to.' };
    const room = g.rooms.find(r => r.id === inc.roomId);
    if (!room || !room.guest) { g.incident = null; return { error: 'They already left.' }; }
    const guest = room.guest;
    // Pass D: the knock is a decision again. Fixing is the tradesman's answer —
    // real money, a solid but not magical recovery. Moving is the best night
    // you can hand a guest (a fresh room undoes the complaint) but it spends
    // a room you could have sold, so on a full night it does not exist.
    // Comping costs the whole rate and buys something money otherwise can't:
    // a comped guest does not savage you in public (scoreStay floors their
    // stars at 3), which also keeps a regular from striking out in the book.
    // Riding it out stays free, and stays a gamble.
    if (action === 'eject'){
      // Pass J5: the watchman walks the LOUD room out — the knock is a
      // neighbour complaint, so the party next door is the one who leaves.
      // The desk keeps the complainant (recovery 10, the quiet itself) and
      // loses the ejected room for the night: no rate, no review, a dirty
      // room at 55. Under Doyle the road talks — tomorrow's pools run thin.
      if (inc.kind !== 'noise') return { error: 'The watchman handles people, not plumbing.' };
      const watchP = staffPerson(g, 'watch');
      if (!watchP) return { error: 'Nobody on watch to walk them out.' };
      if (!watchP.eject) return { error: `${watchP.name} won’t lay a hand — that was the catch, in the open.` };
      const loud = g.rooms.filter(r => Math.abs(r.id - room.id) === 1 && r.state === 'occupied' && r.guest)
        .sort((a, b) => (b.guest.dealStay ? 1 : 0) - (a.guest.dealStay ? 1 : 0))[0];
      if (!loud) return { error: 'Nobody next door to walk out — that noise is a television, not a party.' };
      loud.guest = null; loud.state = 'dirty'; loud.dirt = 55;
      if (g.staff.watch === 'doyle'){ ensureSeason(g); g.ejectWord = { night: g.night + 1 }; }
      guest.recovery = 10;
    }
    else if (action === 'fix'){ g.cash = Math.round((g.cash - 28) * 100) / 100; guest.recovery = 12; }
    else if (action === 'comp'){ g.cash = Math.round((g.cash - guest.ratePaid - (g.staff && g.staff.clerk === 'frankie' ? 10 : 0)) * 100) / 100; guest.recovery = 12; guest.compProtected = true; }
    else if (action === 'ride'){ guest.recovery = -14; }
    else if (action === 'move'){
      const target = g.rooms.find(r => r.id === targetRoomId);
      if (!target || target.state !== 'ready') return { error: 'No ready room to move them to.' };
      guest.recovery = 18; guest.dirtAtCheckIn = target.dirt;
      target.state = 'occupied'; target.guest = guest;
      room.state = 'dirty'; room.dirt = Math.max(room.dirt, 30); room.guest = null;
    }
    else return { error: 'Unknown response.' };
    const clerkP = staffPerson(g, 'clerk');
    if (clerkP && guest.recovery > 0 && !(g.shifts && g.shifts.clerk === 'morning'))
      guest.recovery += (clerkP.soften || 4) + Math.floor((personLevel(g, g.staff.clerk) - 1) / 2);
    inc.resolved = action;
    ensureSeason(g); g.stats.incidentsHandled++;
    // Pass F5: a trouble ridden out is remembered by name; a trouble seen
    // to — by any road — is forgiven.
    if (action === 'ride') g.grudges[guest.name] = inc.kind;
    else if (g.grudges[guest.name] === inc.kind) delete g.grudges[guest.name];
    return { ok: true };
  }

  // The morning forecast. The keeper hears the road, not the spreadsheet:
  // segmentPool tonight carries the night's road mood, so the honest forecast
  // divides the mood back out and quotes a RANGE around the ordinary road,
  // with a hint about tonight's mood — busy, quiet, or nothing to write home
  // about. Pricing into that uncertainty is the rate decision now.
  function forecast(g, rate){
    const mood = (typeof g.roadMood === 'number' && g.roadMood > 0) ? g.roadMood : 1;
    const bySeg = {}; let total = 0;
    for (const k of SEG_KEYS){
      const e = segmentPool(g, k, g.night) * bookProb(g, k, rate) / mood;
      bySeg[k] = e; total += e;
    }
    const free = g.rooms.filter(r => r.state === 'ready').length;
    const occupied = g.rooms.filter(r => r.state === 'occupied').length;
    const moodHint = mood >= 1.08 ? 'busy' : mood <= 0.93 ? 'quiet' : 'ordinary';
    return { total, bySeg, free, occupied, arc: seasonArc(g.night),
             lo: Math.max(0, Math.floor(total * 0.72)), hi: Math.ceil(total * 1.38),
             moodHint, mood,
             event: activeEvent(g, g.night), competitor: competitorFactor(g, g.night) };
  }

  // Apply the morning plan: rate + cleaning choices + optional extra cleaner.
  // Returns {ok} or {error}.
  function planDay(g, plan){
    ensureSeason(g);
    const pool = housekeepingPool(g, !!plan.extraCleaner);
    let used = 0;
    for (const room of g.rooms){
      if (room.state !== 'dirty') continue;
      used += cleanMinutes(g, plan.cleans[room.id] || 'skip');
    }
    // Pass J6: mid-stay services spend the same minutes — a towel run and a
    // tidy for a guest in house, 20 minutes a room, once a stay.
    const services = Array.isArray(plan.services) ? plan.services : [];
    for (const rid of services){
      const r = g.rooms.find(x => x.id === rid);
      if (r && r.state === 'occupied' && r.guest && !r.guest.serviced) used += 20;
    }
    if (used > pool) return { error: 'Not enough housekeeping minutes for that plan.' };
    for (const room of g.rooms){
      if (room.state !== 'dirty') continue;
      const lvl = CLEAN_LEVELS[plan.cleans[room.id] || 'skip'];
      if (lvl.dirt !== null){ room.dirt = lvl.dirt; room.state = 'ready';
        if (staffPerson(g, 'hk') && !(g.shifts && g.shifts.hk === 'evening')){ const hkLvl = personLevel(g, g.staff.hk); if (hkLvl > 1) room.dirt = Math.max(0, room.dirt - (hkLvl - 1) * 2); }
        if (g.staff && g.staff.hk === 'rosa') room.dirt = Math.max(room.dirt, 8); }
    }
    g.rate = clamp(Math.round(plan.rate), 35, 180);
    // Pass F3: the premium card. It exists only while a renovated room does;
    // the first morning it can be set, it opens at the standard card + $25.
    if (g.rooms.some(r => r.tier === 'renovated')){
      if (plan.premiumRate != null) g.ratePremium = clamp(Math.round(plan.premiumRate), 35, 220);
      else if (g.ratePremium == null) g.ratePremium = clamp(g.rate + 25, 35, 220);
    } else g.ratePremium = null;
    // A promise made at the desk comes due (Pass P1): a block booked by
    // phone fills its rooms out of the morning's ready stock, before the
    // evening's line forms. The keeper cleans for them like anyone.
    if (Array.isArray(g.blocks) && g.blocks.length){
      const due = g.blocks.filter(b => b.night === g.night);
      if (due.length){
        g.blocks = g.blocks.filter(b => b.night !== g.night);
        for (const b of due){
          let left = b.rooms, filled = 0;
          for (const room of g.rooms){
            if (!left) break;
            if (room.state !== 'ready') continue;
            room.state = 'occupied';
            room.guest = { name: guestName(g), segment: 'crew', nightsLeft: 1, ratePaid: b.rate,
              dirtAtCheckIn: room.dirt, waitScore: 95, trait: null, returning: false, visits: 1,
              recovery: 0, challenge: null, dealStay: false, dealNights: 0, rowdyDone: false, phoneBlock: true };
            left--; filled++; g.stats.guests++;
          }
          if (filled) g.blockFilled = { rooms: filled, rate: b.rate };
        }
      }
    }
    g.droveOn = 0;
    g.handymanTonight = !!plan.handyman;
    g.vouchersTonight = !!plan.vouchers; // Pass J10: diner vouchers at the desk tonight
    for (const rid of services){
      const r = g.rooms.find(x => x.id === rid);
      if (r && r.state === 'occupied' && r.guest && !r.guest.serviced) r.guest.serviced = true;
    }
    g.lastPlan = { minutesUsed: used, extraCleaner: !!plan.extraCleaner, handyman: !!plan.handyman };
    g.phase = 'arrivals';
    genQueue(g);
    // A block inquiry accepted this morning joins the line as guaranteed guests.
    if (plan.inquiryDecision === 'accept' && g.inquiry){
      const inq = g.inquiry;
      for (let i = 0; i < inq.rooms; i++){
        const tr = rollTrait(g);
        g.queue.push({ id: 100 + i, segment: inq.seg, name: i === 0 ? inq.name : guestName(g),
          nights: inq.nights, ratePaid: inq.ratePer, inquiry: true,
          wantRoom: (i === 0 && inq.regular) ? inq.roomWanted : null,
          trait: tr, want: rollWant(g, inq.seg, tr), line: segLine(g, inq.seg) });
      }
      while (g.queue.length > queueCap(g)){
        const idx = g.queue.map((q, i) => q.inquiry ? -1 : i).filter(i => i >= 0).pop();
        if (idx === undefined) break;
        g.queue.splice(idx, 1);
      }
    }
    g.inquiry = null;
    genIncident(g);
    return { ok: true, minutesUsed: used, pool };
  }

  function genQueue(g){
    g.queue = []; g.processed = 0;
    if (!g.guestBook) g.guestBook = [];
    let id = 1;
    for (const k of SEG_KEYS){
      const expected = segmentPool(g, k, g.night) * bookProb(g, k, g.rate);
      let n = Math.floor(expected) + (rnd(g) < (expected % 1) ? 1 : 0);
      if (rnd(g) < 0.10) n += 1; // a little weather on the highway
      for (let i = 0; i < n; i++){
        const tr = rollTrait(g);
        const nm = guestName(g);
        const stayNights = SEGMENTS[k].stay(g);
        g.queue.push({ id: id++, segment: k, name: nm, nights: stayNights,
          ratePaid: g.rate, trait: tr, want: rollWant(g, k, tr), line: segLine(g, k),
          deal: dealFor(g, k, stayNights, g.rate, id) });
      }
    }
    // Regulars come back: a happy name from the guest book may take a slot.
    const usedNames = new Set();
    for (const a of g.queue){
      if (rnd(g) >= 0.16) continue;
      const pool = g.guestBook.filter(e => e.segment === a.segment && e.lastStars >= 3 && !usedNames.has(e.name) && !CHALLENGE_NAMES[e.name]);
      if (!pool.length) continue;
      const entry = pick(g, pool);
      usedNames.add(entry.name);
      a.name = entry.name; a.returning = true; a.visits = entry.visits + 1;
      if (entry.trait) a.trait = entry.trait;
    }
    // Some walk-ins name a price (Pass F4): they will take a room at their
    // ask, or meet the desk's one counter — or they drive on. The floor
    // under their ask is theirs to know and the desk's to guess.
    if (g.rate >= 60){
      for (const a of g.queue){
        if (a.deal) continue;
        if (rnd(g) >= 0.22) continue;
        const ask = Math.round(g.rate * (0.62 + rnd(g) * 0.13) / 5) * 5;
        const floor = Math.round(g.rate * (0.78 + rnd(g) * 0.10) / 5) * 5;
        a.haggle = { ask, floor: Math.max(floor, ask + 5) };
      }
    }
    // shuffle the queue so segments interleave
    for (let i = g.queue.length - 1; i > 0; i--){
      const j = Math.floor(rnd(g) * (i + 1));
      const t = g.queue[i]; g.queue[i] = g.queue[j]; g.queue[j] = t;
    }
    if (g.queue.length > queueCap(g)) g.queue.length = queueCap(g);
    // Challenge guests keep their own appointments (Pass F2): they are dealt
    // by the calendar after the shuffle, with no dice rolled, and they stand
    // at the front of the line — they phoned ahead, in their way.
    ensureSeason(g);
    for (const c of Object.values(CHALLENGES)){
      const st = g.challenges[c.id];
      if (!st || st.done) continue;
      if (g.night < c.first || (g.night - c.first) % c.every !== 0) continue;
      st.met = true;
      // They pay the going rate for their kind, not the card: a named guest
      // who phones ahead is not a walk-in to be skimmed, and a rate-gouger
      // earns nothing extra from their loyalty.
      const fairRate = clamp(Math.round(SEGMENTS[c.segment].ref * repMult(g.rating) / 5) * 5, 35, 180);
      g.queue.unshift({ id: 900 + c.first, segment: c.segment, name: c.name, nights: c.nights,
        ratePaid: fairRate, trait: c.trait, want: c.want, line: c.line, deal: null,
        challenge: c.id, returning: st.stays > 0, visits: st.stays + 1 });
    }
    // Pass P1: some nights, the phone rings at the desk. Dealt here, at
    // the end of the queue's making, so the night's line is already what
    // it is — the call is an offer laid over the evening, never a
    // replacement for it. One call a night, none in the season's first
    // days, and never in Tonight Only, where the night is the whole game.
    g.phone = null;
    if (g.night >= 4 && !g.tonight){
      // Pass H5: in the squeeze the phone rings far more — a motel clawing
      // back from the bank's dearest money takes every call it can get.
      if (rnd(g) < ((g.credit >= 6000 || g.cash < 0) ? 0.8 : 0.34)){
        let kind = pick(g, ['wedding', 'bus', 'scout']);
        if (kind === 'scout' && g.night + 3 > SEASON_NIGHTS) kind = 'wedding';
        if (kind === 'wedding'){
          g.phone = { kind, status: 'ringing', rooms: 3 + Math.floor(rnd(g) * 3),
            rate: Math.round(g.rate * 0.85 / 5) * 5,
            party: pick(g, ['Alvarez', 'Okafor', 'Lindqvist', 'Marsh', 'Petrov', 'Whitfield']) };
        } else if (kind === 'bus'){
          g.phone = { kind, status: 'ringing', count: 4 + Math.floor(rnd(g) * 3) };
        } else {
          g.phone = { kind, status: 'ringing', deposit: 200, night: g.night + 3, rooms: 4,
            rate: Math.round(g.rate * 1.15 / 5) * 5 };
        }
      }
    }
    // Pass J6: size wants ride the hash, not the stream.
    for (const a of g.queue){
      const p = a.segment === 'family' ? 0.35 : a.segment === 'longstay' ? 0.30 : a.segment === 'tourist' ? 0.15 : 0;
      if (p && ticketHash(g, 'big' + a.id) < p) a.big = true;
    }
    // Pass J9: packages reshape the drive-up trade, hash-dealt like the
    // size wants. The Weekend Two-Night (family/tourist, Fri–Sat) trades
    // a tenth off the rate for a guaranteed second night; the Trucker
    // Weekly locks five to seven nights at 85%. Regulars and challenge
    // guests keep their own arrangements.
    if (g.mkt){
      const dow = (g.night - 1) % 7; // night 1 is a Friday: 0 Fri, 1 Sat
      for (const a of g.queue){
        if (a.regular || a.challenge || a.pkg) continue;
        if (g.mkt.pkg.weekend && dow <= 1 && (a.segment === 'family' || a.segment === 'tourist') && ticketHash(g, 'pkgw' + a.id) < 0.6){
          a.nights = Math.max(a.nights, 2);
          a.ratePaid = Math.max(35, Math.round(a.ratePaid * 0.9));
          a.pkg = 'The Weekend Two-Night';
        } else if (g.mkt.pkg.weekly && a.segment === 'trucker' && ticketHash(g, 'pkgt' + a.id) < 0.5){
          a.nights = 5 + Math.floor(ticketHash(g, 'pkgn' + a.id) * 3);
          a.ratePaid = Math.max(35, Math.round(a.ratePaid * 0.85));
          a.pkg = 'The Trucker Weekly';
        }
      }
    }
    // Pass J11: referrals — a road that has taken to the place sends its
    // own. The sender is a real past guest of that road, remembered at
    // settlement for a stay that scored 80 or better.
    if (g.segXp){
      for (const a of g.queue){
        if (a.regular || a.challenge || a.referred) continue;
        const lvl = segLevel(g, a.segment);
        const senders = (g.referrers && g.referrers[a.segment]) || [];
        if (lvl >= 1 && senders.length && ticketHash(g, 'ref' + a.id) < 0.10 + 0.03 * lvl){
          a.referred = senders[Math.floor(ticketHash(g, 'refn' + a.id) * senders.length)];
        }
      }
    }
  }

  // ---------- Pass J6: the room-service ticket ----------
  // A guest in house leaves a supper ticket at the desk some mornings —
  // hash-dealt like everything else that must not touch the stream. Send
  // it up and the night carries the price, the kitchen carries the cost,
  // and the guest remembers it kindly (+8). Let it go and nothing happens,
  // which is also a kind of answer.
  function ticketHash(g, salt){
    let h = (g.seed >>> 0) ^ (g.night * 7919) >>> 0;
    const s = String(salt);
    for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  function genTicket(g){
    g.serviceTicket = null;
    if (g.tonight) return;
    const staying = g.rooms.filter(r => r.state === 'occupied' && r.guest && r.guest.nightsLeft >= 1);
    if (!staying.length) return;
    if (ticketHash(g, 'ticket') > 0.45) return;
    const room = staying[Math.floor(ticketHash(g, 'ticketroom') * staying.length)];
    g.serviceTicket = { roomId: room.id, name: room.guest.name,
      item: ticketHash(g, 'ticketitem') < 0.5 ? 'a supper tray' : 'pie and coffee',
      price: 12 + Math.floor(ticketHash(g, 'ticketprice') * 4) * 2, cost: 6, status: 'waiting' };
  }
  function answerTicket(g, send){
    const t = g.serviceTicket;
    if (!t || t.status !== 'waiting') return { error: 'No ticket waiting.' };
    if (g.phase !== 'morning') return { error: 'The ticket is a morning decision.' };
    t.status = send ? 'sent' : 'let';
    return { ok: true, ticket: t };
  }
  function assignRoom(g, arrivalId, roomId){
    const a = g.queue.find(q => q.id === arrivalId);
    const room = g.rooms.find(r => r.id === roomId);
    if (!a || !room || room.state !== 'ready') return { error: 'That will not work.' };
    room.state = 'occupied';
    // New-wing and renovated rooms let over the card rate — the guest agreed to
    // the card, and the room itself earns the difference. Phone bookings keep
    // the rate they were promised.
    // Pass F3: a renovated room lets over the premium card — its own price,
    // set at the desk in the morning, replacing the old flat $7 (and the
    // new-wing $8: the premium card is the whole price for such a room).
    // Phone bookings and named guests keep the rate they were promised.
    const premium = (a.inquiry || a.challenge) ? 0
      : (room.tier === 'renovated' ? (g.ratePremium != null ? g.ratePremium - g.rate : 7) : 0)
      + (room.id > 8 && room.tier !== 'renovated' ? 8 : 0);
    const deal = a.dealTaken && a.deal ? a.deal : null;
    room.guest = { name: a.name, segment: a.segment, nightsLeft: deal ? deal.nights : a.nights, ratePaid: deal ? deal.ratePer : a.ratePaid + premium,
                   dirtAtCheckIn: room.dirt, waitScore: clamp(100 - g.processed * 11, 35, 100),
                   trait: a.trait || null, returning: !!a.returning, visits: a.visits || 0,
                   // A regular who phoned for their room: getting it starts the
                   // stay warm (+8); any other door starts it slightly owed (−4).
                   recovery: a.wantRoom ? (a.wantRoom === room.id ? 8 : -4) : 0,
                   challenge: a.challenge || null, big: !!a.big, referred: a.referred || null,
                   dealStay: !!deal, dealNights: deal ? deal.nights : 0, rowdyDone: false };
    g.queue = g.queue.filter(q => q.id !== arrivalId);
    g.processed++; g.stats.guests++;
    if (a.returning){ ensureSeason(g); g.stats.returners++; }
    return { ok: true };
  }

  // Pass F4: the desk answers a named price. Take it, counter once at the
  // midpoint, or let them drive on — and the register remembers the ones
  // who drove.
  function answerHaggle(g, arrivalId, action){
    const a = g.queue.find(q => q.id === arrivalId);
    if (!a || !a.haggle) return { error: 'Nobody there.' };
    if (action === 'take'){
      a.ratePaid = a.haggle.ask;
      a.settled = a.haggle.ask;
      a.haggle = null;
      return { ok: true, outcome: 'settled', price: a.settled };
    }
    if (action === 'counter'){
      const price = Math.round((a.haggle.ask + a.ratePaid) / 2 / 5) * 5;
      if (price <= a.haggle.floor){
        a.ratePaid = price;
        a.settled = price;
        a.haggle = null;
        return { ok: true, outcome: 'settled', price };
      }
    }
    // A refused counter, or the desk passing outright: they drive on.
    g.queue = g.queue.filter(q => q.id !== arrivalId);
    g.processed++;
    g.stats.droveOn = (g.stats.droveOn || 0) + 1;
    g.droveOn = (g.droveOn || 0) + 1;
    return { ok: true, outcome: 'droveon' };
  }

  // Pass P1: the desk answers the phone. Take it, and the caller's terms
  // happen now; let it ring, and the night is simply the night it was.
  // Neither answer is punished — the judgment is the game.
  function answerPhone(g, take){
    const ev = g.phone;
    if (!ev || ev.status !== 'ringing') return { error: 'The phone is not ringing.' };
    if (!take){ ev.status = 'let'; return { ok: true, outcome: 'let' }; }
    ev.status = 'taken';
    if (ev.kind === 'wedding'){
      let filled = 0;
      for (const room of g.rooms){
        if (filled >= ev.rooms) break;
        if (room.state !== 'ready') continue;
        room.state = 'occupied';
        room.guest = { name: guestName(g), segment: 'family', nightsLeft: filled === 0 ? 2 : 1, ratePaid: ev.rate,
          dirtAtCheckIn: room.dirt, waitScore: 92, trait: null, returning: false, visits: 1,
          recovery: 0, challenge: null, dealStay: false, dealNights: 0, rowdyDone: false, phoneWedding: true };
        filled++; g.stats.guests++;
      }
      ev.filled = filled;
      return { ok: true, outcome: 'wedding', filled };
    }
    if (ev.kind === 'bus'){
      const segs = ['tourist', 'family', 'trucker', 'tourist', 'family', 'crew'];
      let added = 0;
      for (let i = 0; i < ev.count; i++){
        const k = segs[i % segs.length];
        const tr = rollTrait(g);
        g.queue.unshift({ id: 700 + i, segment: k, name: guestName(g), nights: SEGMENTS[k].stay(g),
          ratePaid: g.rate, trait: tr, want: rollWant(g, k, tr), line: segLine(g, k), deal: null, phone: true });
        added++;
      }
      ev.added = added;
      return { ok: true, outcome: 'bus', added };
    }
    // The scout: a deposit the audit will show, and a promise on the books.
    if (!Array.isArray(g.blocks)) g.blocks = [];
    g.blocks.push({ night: ev.night, rooms: ev.rooms, rate: ev.rate });
    return { ok: true, outcome: 'scout' };
  }

  function turnAway(g, arrivalId){
    const a = g.queue.find(q => q.id === arrivalId);
    if (!a) return { error: 'Nobody there.' };
    g.queue = g.queue.filter(q => q.id !== arrivalId);
    g.processed++; g.stats.turnedAway++;
    return { ok: true };
  }

  // Pass H3: the Friday regular. From night 29, Earl Dobbins drives the
  // same route every Friday (nights 29, 36, 43, …) and Room 4 is his. If
  // the room stands empty and ready when the desk closes, he takes it at
  // the card — no line, no haggling — and keeping him compounds: every
  // three kept Fridays he pays $5 more, and the truckers hear his word.
  // Leave the room dark or let it twice running and he takes his route
  // to the Desert Inn for the rest of the season.
  function regularDue(g){ return !g.tonight && !g.over && g.night >= 29 && (g.night - 1) % 7 === 0; }
  function settleRegular(g){
    if (!regularDue(g) || g.regularGone) return;
    ensureSeason(g);
    if (!g.regular) g.regular = { name: 'Earl Dobbins', roomId: 4, kept: 0, missed: 0, streakMiss: 0 };
    const reg = g.regular;
    const room = g.rooms.find(r => r.id === reg.roomId);
    const premium = Math.min(15, Math.floor(reg.kept / 3) * 5);
    if (room && room.state === 'ready'){
      room.state = 'occupied';
      room.guest = { name: reg.name, segment: 'trucker', nightsLeft: 1, ratePaid: g.rate + premium,
        dirtAtCheckIn: room.dirt, waitScore: 96, trait: null, returning: true, visits: reg.kept,
        recovery: 6, challenge: null, dealStay: false, dealNights: 0, rowdyDone: false, regularStay: true };
      g.stats.guests++;
      reg.kept++; reg.streakMiss = 0;
      g.regularLine = `${reg.name} kept his Friday — Room ${reg.roomId}, $${g.rate + premium}, no fuss.${premium ? ` The extra $${premium} is loyalty, and he pays it gladly.` : ''}`;
    } else {
      reg.missed++; reg.streakMiss++;
      if (reg.streakMiss >= 2){
        g.regularGone = true; g.regular = null;
        g.regularLine = `${reg.name} found Room ${reg.roomId} dark two Fridays running. He has taken his route to the Desert Inn.`;
      } else {
        g.regularLine = `Room ${reg.roomId} wasn't ready. ${reg.name} drove on — he won't wait in a lot.`;
      }
    }
  }

  function closeDesk(g){
    settleRegular(g);
    // A knock nobody answered answers itself, and not in your favour.
    if (g.incident && !g.incident.resolved){
      const room = g.rooms.find(r => r.id === g.incident.roomId);
      if (room && room.guest) room.guest.recovery = -14;
    }
    g.incident = null;
    g.stats.turnedAway += g.queue.length;
    g.queue = [];
    return resolveNight(g);
  }

  function scoreStay(g, room, occCount, occIds){
    const guest = room.guest, s = SEGMENTS[guest.segment];
    let neighbourBurden = 0;
    if (occIds){
      for (const nid of [room.id - 1, room.id + 1]){
        if (!occIds.has(nid)) continue;
        const nb = g.rooms.find(r => r.id === nid);
        let nbBase = (nb && nb.finish === 'quiet') ? 0.5 : 1;
        if (nb && nb.guest) nbBase *= (SEGMENTS[nb.guest.segment].loud || 1); // Pass J5: noise is per-type now
        neighbourBurden += nbBase;
      }
    }
    const ev = activeEvent(g, g.night);
    let noise = 88 - Math.max(0, occCount - 4) * 5 - neighbourBurden * 6 + rf(g, -5, 5);
    if (ev && ev.noiseAll) noise -= ev.noiseAll;
    if (ev && ev.noiseRoad && room.id <= 4) noise -= ev.noiseRoad;
    const qk = QUIRKS[room.quirk];
    if (qk && qk.noise) noise += qk.noise;
    if (room.finish === 'quiet') noise += 10;
    if ((room.fittings || []).includes('curtains')) noise += 8;
    noise = 100 - (100 - noise) * (s.tol || 1); // Pass J5: tolerance is per-type — a trucker shrugs off what ends a tourist's night
    if (g.staff && g.staff.watch === 'petra') noise += 4 + (personLevel(g, 'petra') - 1); // her quiet rounds
    let amen = g.amenities + plantAmenity(g) + rf(g, -4, 4);
    if (plantBroken(g, 'heater')) amen -= 6;
    if (plantBroken(g, 'ice')) amen -= 2;
    if (g.staff && g.staff.watch === 'hollis' && (guest.segment === 'family' || guest.segment === 'tourist')) amen -= 2; // his face, looming
    if (hasUpgrade(g, 'pool') && plantFactor(g, 'pool') > 0 && poolRooms(g).includes(room.id)) amen += 5; // Pass J7: beside the pool
    if (hasUpgrade(g, 'breakfast') && room.id <= 2) amen += 4; // Pass J7: beside the breakfast nook
    if (hasTown(g, 'drivein') && (guest.segment === 'family' || guest.segment === 'tourist')) amen += 2; // Pass J10: a night at the pictures counts
    if (ev && ev.amenityPenalty && !hasUpgrade(g, 'ac')) amen -= ev.amenityPenalty;
    const dirtIn = guest.serviced ? Math.max(0, guest.dirtAtCheckIn - 25) : guest.dirtAtCheckIn; // Pass J6: the towel run shows at checkout
    const dirtJudged = dirtIn * (1 + 0.03 * segLevel(g, guest.segment)); // Pass J11: a loyal road notices dirt deeper (3% a level — tuned in-pass: 6% taxed the best houses out of Legend range)
    const comp = {
      clean: 100 - dirtJudged,
      condition: clamp(room.condition + (room.tier === 'renovated' ? 8 : 0) + (room.finish === 'plush' ? 8 : 0) + ((room.fittings || []).includes('shower') ? 3 : 0), 0, 100),
      wait: guest.waitScore,
      amenities: clamp(amen, 0, 100),
      noise: clamp(noise, 30, 100),
      match: matchScore(g, room, guest)
    };
    const w = Object.assign({}, s.w);
    if (guest.trait === 'light-sleeper') w.noise *= 1.9;
    if (guest.trait === 'neat') w.clean *= 1.7;
    if (guest.trait === 'road-worn') w.amenities *= 1.6;
    let wSum = 0; for (const k of Object.keys(w)) wSum += w[k];
    let raw = 0; for (const k of Object.keys(w)) raw += (w[k] / wSum) * comp[k];
    const vf = clamp(Math.pow(s.ref * (1 + 0.03 * segLevel(g, guest.segment)) / guest.ratePaid, 0.65), 0.62, 1.12); // Pass J11: loyalty forgives the rate in the judging, too
    let score = raw * vf;
    if (guest.trait === 'easygoing') score += (72 - score) * 0.35;
    score += (guest.recovery || 0) + (guest.returning ? 4 : 0);
    score = clamp(score, 0, 100);
    let stars = score >= 85 ? 5 : score >= 70 ? 4 : score >= 55 ? 3 : score >= 40 ? 2 : 1;
    // A comped night is a kept promise: the guest may not have loved it, but
    // they do not post the savage review — and a regular does not strike out.
    if (guest.compProtected && stars < 3) stars = 3;
    let worst = 'clean', best = 'clean';
    for (const k of Object.keys(comp)){ if (comp[k] < comp[worst]) worst = k; if (comp[k] > comp[best]) best = k; }
    return { comp, score, stars, worst, best };
  }

  function reviewText(g, segKey, stars, worst, best){
    const c = (g.content && g.content.reviewFragments) || DEF_FRAGMENTS;
    if (stars >= 4 && c[best] && c[best].good) return pick(g, c[best].good);
    if (stars <= 2 && c[worst] && c[worst].bad) return pick(g, c[worst].bad);
    if (stars === 3 && c.mid) return pick(g, c.mid);
    if (c[worst] && c[worst].bad && stars <= 3) return pick(g, c[worst].bad);
    return pick(g, DEF_FRAGMENTS.mid);
  }

  function maybeInspection(g){
    if (g.night !== 30 && g.night !== 60) return;
    if (g.lastInspection && g.lastInspection.night === g.night) return;
    const recent = g.cleanLog.filter(e => e.night > g.night - 8 && e.night < g.night);
    let avg;
    if (recent.length) avg = recent.reduce((a, e) => a + e.clean, 0) / recent.length;
    else {
      const rs = g.rooms.map(r => r.guest ? 100 - r.guest.dirtAtCheckIn : 100 - r.dirt);
      avg = rs.reduce((a, b) => a + b, 0) / rs.length;
    }
    avg = Math.round(avg);
    if (avg < 45){
      g.cash = roundMoney(g.cash - 400);
      g.rating = clamp(g.rating - 0.3, 1.5, 5);
      applyCreditDraw(g);
      g.lastInspection = { night: g.night, avg, outcome: 'fine', fine: 400,
        text: `The inspector averaged last week's check-in cleanliness at ${avg}. Under 45 is a $400 fine and a word with the county — it came out of the till this morning, and the rating took the knock.` };
    } else if (avg >= 80){
      g.amenities = clamp(g.amenities + 3, 0, 110);
      g.stats.certificates++;
      g.lastInspection = { night: g.night, avg, outcome: 'certificate', fine: 0,
        text: `The inspector averaged last week's check-in cleanliness at ${avg} and left a framed certificate for the office wall. The place reads better for it — amenities +3, for good.` };
    } else {
      g.lastInspection = { night: g.night, avg, outcome: 'pass', fine: 0,
        text: `The inspector averaged last week's check-in cleanliness at ${avg}. Passed — nothing framed, nothing fined. The certificate wants 80; the fine waits under 45.` };
    }
  }

  function computeEnding(g){
    ensureSeason(g);
    const cash = Math.round(g.cash), rating = g.rating;
    let tier, title, text;
    if (cash >= 18000 && rating >= 4.2){ tier = 'legend'; title = 'Starlight Legend';
      text = 'The till is full, the board is kind, and the star over the court is the one drivers plan their night around. You did not just keep the Starlight — you made it the stop.'; }
    else if (cash >= 10000 && rating >= 3.5){ tier = 'saved'; title = 'Season Saved';
      text = 'The Starlight comes through the summer with money in the drawer and its name in good standing. The mortgage company sends statements, not warnings.'; }
    else if (cash >= 4000){ tier = 'scraped'; title = 'Scraped By';
      text = 'The sign stays lit and the deed stays yours — barely. Another summer like this one and the arithmetic changes, but this summer, you held.'; }
    else { tier = 'bank'; title = 'The Bank Takes the Sign';
      text = 'The season ends with the numbers where they are. The bank is patient right up until it is not, and this was the summer it stopped being patient.'; }
    const st = g.stats, trophies = [];
    if (st.fullHouses >= 10) trophies.push({ name: 'Full House Habit', text: `${st.fullHouses} nights with every door sold.` });
    if (st.certificates >= 2) trophies.push({ name: 'Clean Sheet', text: 'Both inspections ended with a framed certificate.' });
    else if (st.certificates === 1) trophies.push({ name: 'Framed Certificate', text: 'An inspector left something for the office wall.' });
    if (st.returners >= 10) trophies.push({ name: 'The Regulars’ Place', text: `${st.returners} stays were people coming back.` });
    if (g.rooms.length >= 16) trophies.push({ name: 'The Whole Court', text: 'Sixteen rooms by summer’s end.' });
    if ((st.maxCredit || 0) === 0) trophies.push({ name: 'Never Borrowed', text: 'The credit line stayed in its envelope all season.' });
    if (st.lowestRatingAfter20 !== null && st.lowestRatingAfter20 < 2.9 && rating >= 3.8)
      trophies.push({ name: 'The Comeback', text: `Down to ${st.lowestRatingAfter20.toFixed(1)}★ and back up to ${rating.toFixed(1)}★.` });
    if (st.fiveStarReviews >= 25) trophies.push({ name: 'Five-Star Wall', text: `${st.fiveStarReviews} five-star reviews pinned to the board.` });
    if (st.incidentsHandled >= 6) trophies.push({ name: 'Calm Hands', text: `${st.incidentsHandled} knocks at the desk, seen to in person.` });
    if (g.upgrades.length >= 8) trophies.push({ name: 'Kept Improving', text: `${g.upgrades.length} lines of the catalog, bought and bolted on.` });
    return { tier, title, text, cash, rating, trophies };
  }

  function resolveNight(g){
    const occRooms = g.rooms.filter(r => r.state === 'occupied');
    const occ = occRooms.length;
    const occIds = new Set(occRooms.map(r => r.id));
    let revenue = 0; for (const r of occRooms) revenue += r.guest.ratePaid;
    const roomRevenue = revenue;
    const vendingRevenue = hasUpgrade(g, 'vending') ? roundMoney(1.6 * occ * plantFactor(g, 'vending')) : 0;
    revenue = roundMoney(revenue + vendingRevenue);
    // Pass J12: the forecourt trades on its own account.
    let foreRevenue = 0; const foreLines = [];
    if (g.forecourt && occ > 0){
      if (g.forecourt.shop && g.shop && g.shop.stock > 0){
        const units = Math.min(g.shop.stock, Math.round(occ * (SHELF_TAKE[g.shop.price] || 0.7) * (0.85 + ticketHash(g, 'shop') * 0.3)));
        if (units > 0){ g.shop.stock -= units; foreRevenue += units * g.shop.price; foreLines.push(`The shop sold ${units} off the shelf at $${g.shop.price} — $${units * g.shop.price}, with ${g.shop.stock} left in the back.`); }
      }
      if (g.forecourt.pump){
        const mode = (g.pump && g.pump.mode) || 'match';
        const take = Math.round((14 + 3.5 * occ) * PUMP_MODES[mode].mult * (0.85 + ticketHash(g, 'pump') * 0.3));
        foreRevenue += take; foreLines.push(`The pump took $${take}, ${PUMP_MODES[mode].label}.`);
      }
      if (g.forecourt.wash){
        const washes = Math.floor(occ * 0.35 * (0.7 + ticketHash(g, 'wash') * 0.6));
        if (washes > 0){ foreRevenue += washes * 6; foreLines.push(`The wash ran ${washes} car${washes === 1 ? '' : 's'} through — $${washes * 6}.`); }
      }
    }
    foreRevenue = roundMoney(foreRevenue);
    const pieRevenue = hasUpgrade(g, 'piewindow') ? (g.vouchersTonight ? 0 : roundMoney(2.6 * occ)) : 0; // Pass J10: voucher nights, they eat at the diner
    const voucherRevenue = (hasTown(g, 'piecase') && g.vouchersTonight) ? roundMoney(5 * occ) : 0; // Pass J10
    let petRevenue = 0;
    if (hasUpgrade(g, 'pets')){ for (let i = 0; i < occ; i++) if (rnd(g) < 0.18) petRevenue += 12; petRevenue = roundMoney(petRevenue); }
    revenue = roundMoney(revenue + pieRevenue + petRevenue + voucherRevenue + foreRevenue);
    // Pass P1: a scout's deposit taken at the desk is income like any
    // other, and the register says what the phone did with the night.
    const phoneDeposit = (g.phone && g.phone.status === 'taken' && g.phone.kind === 'scout') ? g.phone.deposit : 0;
    if (phoneDeposit) revenue = roundMoney(revenue + phoneDeposit);
    // Pass J6: a sent room-service ticket settles tonight — the price on
    // the bill, the cost out of the kitchen, and the guest remembers it
    // kindly when the stay is scored.
    let serviceCost = 0, serviceLine = '';
    if (g.serviceTicket && g.serviceTicket.status === 'sent'){
      const t = g.serviceTicket;
      revenue = roundMoney(revenue + t.price);
      serviceCost = t.cost;
      const tRoom = g.rooms.find(r => r.id === t.roomId);
      if (tRoom && tRoom.guest && tRoom.guest.name === t.name) tRoom.guest.recovery += 8;
      serviceLine = `${t.name} in Room ${t.roomId} sent up ${t.item} — $${t.price} on the bill, $${t.cost} out of the kitchen.`;
    }
    const regularLine = g.regularLine || ''; g.regularLine = null;
    let phoneLine = '';
    if (g.phone && g.phone.status === 'taken'){
      if (g.phone.kind === 'wedding') phoneLine = `The phone: the ${g.phone.party} wedding took ${g.phone.filled || 0} room${g.phone.filled === 1 ? '' : 's'} at $${g.phone.rate} a door.`;
      else if (g.phone.kind === 'bus') phoneLine = `The phone: the broken-down bus sent ${g.phone.added || 0} more parties to the line.`;
      else if (g.phone.kind === 'scout') phoneLine = `The phone: the location scout put ${g.phone.rooms} rooms on the books for night ${g.phone.night}, at $${g.phone.rate} a door.`;
    }
    const blockLine = g.blockFilled ? `The film crew kept the scout's promise — ${g.blockFilled.rooms} room${g.blockFilled.rooms === 1 ? '' : 's'} at $${g.blockFilled.rate} a door.` : '';
    g.blockFilled = null;
    ensureSeason(g);
    g.stats.roomNights += occ;
    g.stats.possibleRoomNights += g.rooms.length;
    if (occ === g.rooms.length && occ > 0) g.stats.fullHouses++;

    const wear = hasUpgrade(g, 'ac') ? 0.3 : 0.6;
    const checkouts = [];
    for (const room of occRooms){
      room.guest.nightsLeft--;
      if (room.guest.nightsLeft > 0){
        room.condition = clamp(Math.round((room.condition - wear * (room.finish === 'plush' ? 0.5 : 1)) * 10) / 10, 35, 100);
        continue;
      }
      const guest = room.guest;
      const sc = scoreStay(g, room, occ, occIds);
      const s = SEGMENTS[guest.segment];
      let review = null;
      let postP = s.post;
      if (guest.trait === 'chatty') postP *= 1.6;
      if (guest.trait === 'easygoing') postP *= 0.6;
      if (guest.returning) postP += 0.2;
      const posts = rnd(g) < (sc.stars <= 2 ? Math.max(postP, 0.75) : Math.min(postP, 0.95));
      const before = g.rating;
      if (posts){
        g.rating = clamp(g.rating + 0.12 * (sc.stars - g.rating), 1.5, 5);
        review = { stars: sc.stars, text: reviewText(g, guest.segment, sc.stars, sc.worst, sc.best),
                   name: guest.name, segment: guest.segment, worst: sc.worst };
        g.stats.reviews++;
        if (sc.stars === 5) g.stats.fiveStarReviews++;
        if (sc.stars === 1) g.stats.oneStarReviews++;
        if (!g.reviewWall) g.reviewWall = [];
        g.reviewWall.push({ night: g.night, name: guest.name, stars: sc.stars, text: review.text, worst: sc.worst });
        if (g.reviewWall.length > 60) g.reviewWall.shift();
      }
      checkouts.push({ roomId: room.id, name: guest.name, segment: guest.segment,
                       stars: sc.stars, score: Math.round(sc.score), review,
                       ratingBefore: before, ratingAfter: g.rating });
      // The guest book remembers everyone who stayed the course of a visit.
      if (!g.guestBook) g.guestBook = [];
      const bi = g.guestBook.findIndex(e => e.name === guest.name && e.segment === guest.segment);
      if (guest.returning && sc.stars <= 2){ if (bi >= 0) g.guestBook.splice(bi, 1); }
      else if (bi >= 0){ const e = g.guestBook[bi]; e.visits++; e.lastStars = sc.stars; e.lastScore = Math.round(sc.score); e.lastNight = g.night; e.lastRoom = room.id; if (guest.trait) e.trait = guest.trait; }
      else g.guestBook.push({ name: guest.name, segment: guest.segment, visits: 1, lastStars: sc.stars, lastScore: Math.round(sc.score), lastNight: g.night, lastRoom: room.id, trait: guest.trait || null });
      // Challenge guests (Pass F2): a happy stay — four stars or better —
      // is a kept promise. Two of them, and their business with the desk
      // is done: the unlock is theirs to give, and it is given for good.
      if (guest.challenge){
        ensureSeason(g);
        const cst = g.challenges[guest.challenge];
        const cc = CHALLENGES[guest.challenge];
        if (cst && cc && !cst.done){
          cst.stays++;
          if (sc.stars >= 4){
            cst.happy++;
            if (cst.happy >= cc.goal){ cst.done = true; g.challengeNote = { night: g.night + 1, text: cc.note }; }
          }
        }
      }
      g.cleanLog.push({ night: g.night, clean: 100 - guest.dirtAtCheckIn });
      room.condition = clamp(Math.round((room.condition - wear * (room.finish === 'plush' ? 0.5 : 1)) * 10) / 10, 35, 100);
      room.dirt = clamp(Math.round(45 + rnd(g) * 35 + s.dirtMod), 30, 95);
      if (g.staff && g.staff.hk && g.shifts && g.shifts.hk === 'evening') room.dirt = Math.round(room.dirt * 0.6); // the evening turn-down
      room.state = 'dirty'; room.guest = null;
      g.stats.checkouts++;
    }

    if (g.handymanTonight) for (const r of g.rooms) r.condition = clamp(r.condition + 1, 0, 100);
    const plan = g.lastPlan || { minutesUsed: 0, extraCleaner: false };
    const evNow = activeEvent(g, g.night);
    const costs = {
      mortgage: MORTGAGE + Math.max(0, g.rooms.length - 8) * 8,
      utilities: roundMoney((16 + 6.5 * occ) * (evNow && evNow.utilities ? evNow.utilities : 1) * (hasUpgrade(g, 'solar') ? 0.45 : 1)),
      housekeeping: roundMoney(plan.minutesUsed * HK_WAGE + (plan.extraCleaner ? EXTRA_COST : 0)),
      laundry: roundMoney(2.1 * occ * (hasUpgrade(g, 'laundry') ? 1 - 0.6 * plantFactor(g, 'laundry') : 1)),
      supplies: roundMoney(1.4 * occ)
    };
    if (hasUpgrade(g, 'breakfast')) costs.breakfast = roundMoney(3.8 * occ);
    if (g.handymanTonight) costs.handyman = hasTown(g, 'garage') ? 50 : 80; // Pass J10: the garage owes you
    const staffWage = wageOf(g, 'hk') + wageOf(g, 'clerk') + wageOf(g, 'watch');
    if (staffWage) costs.staff = staffWage;
    if (g.staff && g.staff.hk === 'mabel') costs.supplies = roundMoney(costs.supplies + 5); // her ways, itemised
    if (g.staff && g.staff.clerk === 'eddie' && occ > 0) costs.tillshort = roundMoney(1.2 * occ); // he forgets to charge
    if (serviceCost) costs.service = serviceCost;
    const mkt = mktCost(g); if (mkt) costs.marketing = mkt; // Pass J9: the word gets out, nightly
    // Insurance and the county are owed whether a single door sold or not —
    // the fixed nut an empty motel still pays, and the reason standing still
    // is a way to die, just a slower one.
    costs.insurance = 24;
    if (hasUpgrade(g, 'billboard')) costs.billboard = 13;
    if (g.credit > 0) costs.interest = roundMoney(Math.min(g.credit, 4000) * 0.0025 + Math.min(Math.max(0, g.credit - 4000), 2000) * 0.005 + Math.max(0, g.credit - 6000) * 0.0075);
    const costTotal = roundMoney(Object.values(costs).reduce((a, b) => a + b, 0));
    let profit = roundMoney(revenue - costTotal);
    g.cash = roundMoney(g.cash + profit);
    g.stats.nights++; g.stats.revenue += revenue;
    if (g.stats.bestNightProfit === null || profit > g.stats.bestNightProfit) g.stats.bestNightProfit = profit;
    if (g.night >= 20) g.stats.lowestRatingAfter20 = g.stats.lowestRatingAfter20 === null ? g.rating : Math.min(g.stats.lowestRatingAfter20, g.rating);
    const creditDrawn = applyCreditDraw(g);
    // Pass D closes an old accounting hole: a draw used to cover only what
    // the line had left and quietly forgive the rest, so a motel could owe
    // money nobody collected. Now a night the cash and the line together
    // cannot cover is the night the bank takes the sign.
    if (g.cash < 0) g.cash = BANKRUPT_AT - 1;
    g.stats.peakCash = Math.max(g.stats.peakCash || 0, g.cash);
    g.cashHistory.push(g.cash);
    if (g.cashHistory.length > 120) g.cashHistory.shift();

    // Pass H5: the squeeze. The bank's cliff used to arrive unannounced —
    // fine, fine, fine, taken. Now the approach is a state of play: past
    // $6,000 on the line (or under water on cash) the phone rings more,
    // the desk's deals run meaner, and the register says where you stand
    // every night until you claw back out.
    const wasSqueezed = !!g.squeeze;
    g.squeeze = !g.tonight && (g.credit >= 6000 || g.cash < 0);
    let squeezeLine = '';
    if (g.squeeze && !wasSqueezed) squeezeLine = 'The squeeze is on: the line stands deep in the bank’s dearest money. The phone rings more now, the desk’s deals run meaner, and every night is a claw-back.';
    else if (g.squeeze) squeezeLine = `The squeeze holds — the line stands at $${g.credit.toLocaleString('en-US')} of $8,000. Rings are lifelines now; answer them like it matters, because it does.`;
    else if (wasSqueezed) squeezeLine = 'The line is back under $6,000 and the cash is your own again. The bank’s letters go back to being polite.';
    // Pass J2: the plant settles its wear after the night is scored — a
    // breakdown announced this morning bites tonight if it goes unrepaired.
    const plantBroke = settlePlant(g);
    let plantLine = '';
    if (plantBroke.length) plantLine = plantBroke.map(id => PLANT_BROKEN_LINES[id]).join(' ');
    else if (g.plant){
      let worst = null;
      for (const id of Object.keys(g.plant)){ const p = g.plant[id]; if (!p.broken && p.c < 40 && (!worst || p.c < g.plant[worst].c)) worst = id; }
      if (worst) plantLine = `The plant wants attention: the ${PLANT[worst].name.toLowerCase()} stands at ${Math.round(g.plant[worst].c)} and falling. A service in the catalog is cheaper than a breakdown.`;
    }
    // Pass J4: the roster learns. XP lands after the night is worked;
    // a level-up is named in the register the morning it lands.
    const levelUps = [];
    if (g.staff && g.people){
      for (const role of ['hk', 'clerk', 'watch']){
        const who = g.staff[role];
        if (!who || typeof who !== 'string') continue;
        if (!g.people[who]) g.people[who] = { xp: 0 };
        const before = personLevel(g, who);
        g.people[who].xp += occ >= 6 ? 2 : 1;
        const after = personLevel(g, who);
        if (after > before) levelUps.push(`${PEOPLE[who].name} has the run of the place a little more tonight — ${role === 'hk' ? 'housekeeper' : role === 'clerk' ? 'night clerk' : 'night watchman'}, level ${after}. The wage rises to $${wageOf(g, role)}, and the work shows it.`);
      }
    }
    const levelLine = levelUps.join(' ');
    const ejectLine = (g.ejectWord && g.ejectWord.night === g.night)
      ? 'The road is talking about the ejection at the Starlight — the pools run thin tonight, and Doyle calls it rent.' : '';
    // Pass J11: the roads form their opinions at settlement — good turns
    // bank standing, poor ones spend it, and a delighted guest's name
    // goes in the referral book.
    let segLine = '';
    if (g.segXp){
      const ups = [];
      for (const c of checkouts){
        const rec = g.segXp[c.segment]; if (!rec) continue;
        const was = segLevel(g, c.segment);
        rec.xp = Math.max(0, rec.xp + (c.score >= 80 ? 2 : c.score >= 60 ? 1 : c.score < 40 ? -1 : 0));
        if (segLevel(g, c.segment) > was) ups.push(c.segment);
        if (c.score >= 80){
          const list = (g.referrers[c.segment] = g.referrers[c.segment] || []);
          if (!list.includes(c.name)){ list.push(c.name); if (list.length > 12) list.shift(); }
        }
      }
      if (ups.length) segLine = `Word of mouth: the ${SEGMENTS[ups[0]].label} road has taken to the place — it runs thicker now, and its people notice more.`;
    }
    // Pass J13: the placards are judged at settlement.
    let placardLine = '', placardBounty = 0;
    g.foreEarned = (g.foreEarned || 0) + foreRevenue;
    if (g.credit > 0) g.drewOnce = true;
    if (g.placards){
      const wonLines = [];
      for (const id of g.placards.dealt){
        if (g.placards.won[id]) continue;
        const p = PLACARDS.find(x => x.id === id);
        if (p && p.test(g, { revenue, checkouts, occ })){
          g.placards.won[id] = g.night;
          g.cash = roundMoney(g.cash + p.bounty);
          placardBounty += p.bounty;
          wonLines.push(`A placard comes down: ${p.name} — $${p.bounty} in an envelope from the highway association.`);
        }
      }
      placardLine = wonLines.join(' ');
      // The envelope is part of the night's taking: it joins the profit
      // so the till and the register agree, to the cent.
      if (placardBounty) profit = roundMoney(profit + placardBounty);
    }
    const report = { night: g.night, dow: DOW_NAMES[dowOf(g.night)], revenue, roomRevenue, vendingRevenue, voucherRevenue, foreRevenue, foreLine: foreLines.join(' '), costs, costTotal,
                     profit, cashAfter: g.cash, occupied: occ, checkouts,
                     ratingAfter: g.rating, turnedAwayTotal: g.stats.turnedAway, droveOn: g.droveOn || 0,
                     phoneDeposit, phoneLine, blockLine, regularLine, squeezeLine, plantLine, levelLine, ejectLine, serviceLine,
                     creditDrawn, creditAfter: g.credit };
    if (segLine) report.segLine = segLine;
    if (placardLine) report.placardLine = placardLine;
    if (placardBounty) report.placardBounty = placardBounty;
    g.lastReport = report;
    // Past $4,000 on the line, the bank writes — once.
    if (g.credit > 4000 && !g.bankLetter) g.bankLetter = { night: g.night + 1, credit: g.credit };
    // Night 42 is the halfway mark: the standing gets written down, pace and all.
    if (report.night === 42 && !g.standing){
      const proj = Math.round(2 * g.cash - 4250);
      const pace = (g.rating >= 4.2 && proj >= 18000) ? 'Starlight Legend'
                 : (g.rating >= 3.5 && proj >= 10000) ? 'Season Saved'
                 : (proj >= 4000) ? 'Scraped By' : 'The Bank Takes the Sign';
      g.standing = { night: 43, cash: Math.round(g.cash), rating: +g.rating.toFixed(2),
                     occ: g.stats.possibleRoomNights ? Math.round(100 * g.stats.roomNights / g.stats.possibleRoomNights) : 0,
                     pace, proj };
    }
    // Pass J8: the guide prints at the halfway mark and again in the run-in.
    if (!g.tonight && (report.night === 42 || report.night === 77)){
      const rows = guideRows(g);
      const pos = rows.findIndex(r => r.you) + 1;
      g.guidePrev = rows.map(r => r.name);
      g.guide = { night: g.night + 1, rows, pos };
      if (pos === 1) g.guideWord = { from: g.night + 1, until: g.night + 7, mult: 1.06 };
      else if (pos === 2) g.guideWord = { from: g.night + 1, until: g.night + 7, mult: 1.03 };
      report.guideLine = `The Highway Guide printed this morning — the Starlight stands ${['', 'first', 'second', 'third', 'fourth'][pos]} of four along this stretch.${pos <= 2 ? ' Travellers are carrying the guide this week, and the road runs thicker for it.' : ''}`;
    }
    g.lastPlan = null;
    g.handymanTonight = false;
    if (g.cash < BANKRUPT_AT){ g.over = 'bankrupt'; return report; }
    if (g.night >= SEASON_NIGHTS){
      g.night = SEASON_NIGHTS + 1;
      g.phase = 'morning';
      g.ending = computeEnding(g);
      g.over = 'season';
      return report;
    }
    g.night++;
    g.roadMood = rollRoadMood(g);
    g.phase = 'morning';
    g.seasonFactor = seasonArc(g.night);
    maybeInspection(g);
    if (g.cash < BANKRUPT_AT){ g.over = 'bankrupt'; return report; }
    genInquiry(g);
    genTicket(g);
    return report;
  }

  // Pass C: the motel closes for winter and opens again — a fresh court, a
  // fresh till, a newly dealt summer. What carries is what a keeper actually
  // keeps: the guest book (regulars return, the struck stay struck) and the
  // ledger of summers on the title screen.
  function startNextSeason(g, content){
    ensureSeason(g);
    const season = (g.season || 1) + 1;
    const summary = { season: g.season || 1, tier: g.ending ? g.ending.tier : null,
                      title: g.ending ? g.ending.title : '',
                      cash: Math.round(g.cash), rating: +g.rating.toFixed(2),
                      occ: g.stats.possibleRoomNights ? Math.round(100 * g.stats.roomNights / g.stats.possibleRoomNights) : 0,
                      trophies: g.ending && g.ending.trophies ? g.ending.trophies.length : 0,
                      rooms: g.rooms.length };
    const ng = createGame(((g.seed >>> 0) + season * 7919) >>> 0, content || g.content, season);
    ng.guestBook = JSON.parse(JSON.stringify(g.guestBook || []));
    ng.ledger = (g.ledger || []).concat([summary]);
    return ng;
  }

  /* Pass 6 — Tonight Only: the daily seed deals one standing motel on the
   * morning of night 43 — the Suites just opened across the highway, ten
   * rooms, a book with names in it — and the player runs exactly one night.
   * The state is an ordinary season state, so every system the night touches
   * (desk, knocks, the book, the Suites) behaves exactly as it does in a
   * season; the UI stops it after one resolve and grades the night. */
  function buildTonight(seed, content){
    const g = createGame(seed >>> 0, content);
    g.night = 43;
    g.cash = 5200;
    g.rating = 3.9;
    g.upgrades = ['sign', 'wifi', 'laundry'];
    // the second wing: rooms 9 and 10, dealt quirks like any expansion
    for (let i = 0; i < 2; i++)
      g.rooms.push({ id: g.rooms.length + 1, state: 'ready', dirt: ri(g, 0, 6), condition: 90, tier: 'standard', finish: null, fittings: [], quirk: drawQuirk(g), guest: null, size: roomSize(g.rooms.length + 1) });
    g.expansions = 1;
    const conds = [88, 74, 91, 63, 79, 55, 84, 70, 95, 68];
    g.rooms.forEach((r, i) => { r.condition = conds[i]; });
    // three parties already in the house from last night
    const stays = [
      { roomId: 1, segment: 'family', nightsLeft: 2, ratePaid: 88, visits: 2 },
      { roomId: 2, segment: 'trucker', nightsLeft: 1, ratePaid: 66, visits: 0 },
      { roomId: 3, segment: 'crew', nightsLeft: 1, ratePaid: 58, visits: 0 }
    ];
    for (const s of stays){
      const room = g.rooms.find(r => r.id === s.roomId);
      const trait = rollTrait(g);
      room.state = 'occupied'; room.dirt = 30;
      room.guest = { name: guestName(g), segment: s.segment, trait, nights: s.nightsLeft + 1,
        nightsLeft: s.nightsLeft, ratePaid: s.ratePaid, dirtAtCheckIn: 6, waitScore: 92,
        want: rollWant(g, s.segment, trait), wantRoom: null, line: segLine(g, s.segment),
        recovery: 0, returning: s.visits > 0, visits: s.visits, compProtected: false, wantsQuiet: false };
    }
    // last night's leavers left their rooms in honest states
    const dirt = { 4: 65, 5: 40, 6: 85, 7: 25, 8: 2, 9: 5, 10: 0 };
    for (const id in dirt){ const room = g.rooms.find(r => r.id === +id); room.dirt = dirt[id]; room.state = dirt[id] >= 15 ? 'dirty' : 'ready'; }
    // the book has names in it by night 43 — one of them keeps Room 8
    g.guestBook = [
      { name: 'Wanda Pepper', segment: 'family', visits: 3, lastStars: 5, lastScore: 91, lastNight: 36, trait: 'neat', lastRoom: 8 },
      { name: 'Earl Boone', segment: 'trucker', visits: 2, lastStars: 4, lastScore: 78, lastNight: 30, trait: null, lastRoom: 2 },
      { name: 'Marlene Kovich', segment: 'family', visits: 1, lastStars: 4, lastScore: 81, lastNight: 22, trait: 'chatty', lastRoom: 5 },
      { name: 'Doyle Rusk', segment: 'crew', visits: 1, lastStars: 3, lastScore: 63, lastNight: 18, trait: null, lastRoom: 6 }
    ];
    // a plausible summer so far behind the register
    g.stats = { nights: 42, revenue: 38140, guestsServed: 186, guests: 186, reviews: 121, checkouts: 186, roomNights: 231, possibleRoomNights: 42 * 9, reviewsPosted: 121, fiveStars: 34, turnedAway: 41 };
    g.cashHistory = [];
    let walk = 4250;
    for (let n = 0; n < 42; n++){ walk += ri(g, -160, 210); g.cashHistory.push(Math.max(900, walk)); }
    g.cashHistory.push(5200);
    g.roadMood = +(0.85 + rnd(g) * 0.35).toFixed(3);
    genInquiry(g);
    g.tonight = { night: 43, ratingBefore: 3.9 };
    return g;
  }

  return { createGame, forecast, planDay, assignRoom, turnAway, closeDesk, resolveIncident,
           startNextSeason, buildCalendar, genInquiry, buildTonight,
           purchase, purchaseExpansion, roomWork, adjustCredit, ensureSeason, hasUpgrade,
           PLANT, buyPlant, servicePlant, settlePlant, plantFactor,
           PEOPLE, hireStaff, fireStaff, staffPerson, personLevel, wageOf, setShift, troubleP, answerTicket, roomSize,
           prestige, prestigeDetail, bookProb, guideRows,
           AD_TIERS, mktCost, setFocus, setAdTier, setPackage,
           TOWN, hasTown, buyTown, segLevel, SEG_XP_AT,
           FORE, SHELF_PRICES, PUMP_MODES, buyForecourt, buyStock, setShelfPrice, setPumpMode,
           PLACARDS, dealPlacards,
           SEGMENTS, SEG_KEYS, CLEAN_LEVELS, DOW_NAMES, dowOf, repMult,
           TRAITS, INCIDENTS, UPGRADES, EXPANSIONS, CALENDAR, COMBOS, activeCombos, CHALLENGES,
           activeEvent, calendarEntry, nextCalendar, seasonArc, competitorFactor, segmentPool, bookProb,
           QUIRKS, FITTINGS, FINISHES, matchScore, scoreStay, SEGMENTS, INCIDENTS,
           setStaff, replyToReview, answerDeal, answerHaggle, answerPhone, REPLIES,
           housekeepingPool, cleanMinutes, queueCap,
           SEASON_NIGHTS, CREDIT_LIMIT,
           BASE_MINUTES, EXTRA_MINUTES, EXTRA_COST, MORTGAGE };
})();
/*SIM-END*/
