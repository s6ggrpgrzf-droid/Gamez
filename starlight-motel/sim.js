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
    trucker:  { label:'Trucker',       base:0.95, ref:69,  elast:1.50, dow:[1.1,1.1,1.1,1.1,1.0,0.8,0.85], post:0.45,
                w:{clean:.26,condition:.17,wait:.22,amenities:.09,noise:.14,match:.12}, dirtMod:2,  stay:g=>1 },
    family:   { label:'Family',        base:0.85, ref:95,  elast:1.10, dow:[0.55,0.55,0.55,0.55,1.5,1.8,0.9], post:0.80,
                w:{clean:.26,condition:.14,wait:.07,amenities:.15,noise:.14,match:.24}, dirtMod:8,  stay:g=> 1 + (rnd(g)<0.4?1:0) },
    crew:     { label:'Work crew',     base:0.45, ref:62,  elast:1.60, dow:[1.3,1.1,1.1,1.1,0.5,0.3,0.6], post:0.35,
                w:{clean:.20,condition:.13,wait:.17,amenities:.13,noise:.23,match:.14}, dirtMod:12, stay:g=> 3 + Math.floor(rnd(g)*2) },
    longstay: { label:'Long-stay',     base:0.12, ref:45,  elast:1.80, dow:[1,1,1,1,1,1,1], post:0.30,
                w:{clean:.24,condition:.19,wait:.04,amenities:.16,noise:.17,match:.20}, dirtMod:15, stay:g=> 5 + Math.floor(rnd(g)*3) },
    tourist:  { label:'Route 66 tourist', base:0.42, ref:110, elast:0.90, dow:[0.8,0.8,0.8,0.8,1.2,1.4,1.0], post:0.65,
                w:{clean:.23,condition:.19,wait:.07,amenities:.12,noise:.17,match:.22}, dirtMod:0,  stay:g=> 1 + (rnd(g)<0.3?1:0) }
  };
  const SEG_KEYS = Object.keys(SEGMENTS);
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
    if (night < 43) return 1;
    // The Suites take almost nothing from a 4★ house, an eighth from a middling
    // one — and a tired house bleeds: below 3.4 the shiny place takes a fifth,
    // below 3.0 a quarter and more. That gradient is the season's real cliff.
    if (g.rating >= 4) return 0.96;
    if (g.rating >= 3.4) return 0.88;
    if (g.rating >= 3.0) return 0.80;
    return 0.72;
  }
  function housekeepingPool(g, extra){
    return BASE_MINUTES + Math.max(0, g.rooms.length - 8) * 20 + (extra ? EXTRA_MINUTES : 0) + (g.staff && g.staff.hk ? 120 : 0);
  }
  // ---------- Pass E3: staff, review replies, weekly-rate deals ----------
  function setStaff(g, role, on){
    ensureSeason(g);
    if (g.phase !== 'morning' || g.over) return { error: 'Hiring happens in the morning.' };
    if (role !== 'hk' && role !== 'clerk') return { error: 'No such job.' };
    if (!g.staff) g.staff = { hk: false, clerk: false };
    g.staff[role] = !!on;
    return { ok: true, staff: g.staff };
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
    if (stars >= 4) return tone === 'funny' ? 1.05 : tone === 'gracious' ? 1.03 : 0.97;
    if (stars === 3) return tone === 'gracious' ? 1.03 : tone === 'funny' ? 1.02 : 1.01;
    return tone === 'firm' ? 1.04 : tone === 'gracious' ? 1.02 : 0.96;
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
    g.reply = { night: g.night, idx, tone, stars, mult: replyMult(tone, stars), text: REPLIES[tone][bucket] };
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
    const ratePer = clamp(Math.round(rate * 0.8 / 5) * 5, 30, 200);
    if (ratePer >= rate) return null;
    return { nights: nights + 2 + Math.floor(draw() * 3), ratePer };
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
  function purchase(g, id){
    ensureSeason(g);
    if (g.phase !== 'morning' || g.over) return { error: 'The catalog only opens in the morning.' };
    const u = UPGRADES.find(x => x.id === id);
    if (!u) return { error: 'Not in the catalog.' };
    if (g.upgrades.includes(id)) return { error: 'Already yours.' };
    if (!payWithCredit(g, u.cost)) return { error: 'Not enough cash or credit for that.' };
    g.upgrades.push(id);
    if (u.amenity) g.amenities = clamp(g.amenities + u.amenity, 0, 110);
    if (id === 'mattress') for (const r of g.rooms) r.condition = clamp(r.condition + 20, 0, 100);
    return { ok: true, item: u };
  }
  function purchaseExpansion(g){
    ensureSeason(g);
    if (g.phase !== 'morning' || g.over) return { error: 'Building only happens in the morning.' };
    const ex = EXPANSIONS[g.expansions];
    if (!ex) return { error: 'The court is complete — sixteen rooms.' };
    if (g.night < ex.unlock) return { error: `The crew can start on night ${ex.unlock}.` };
    if (!payWithCredit(g, ex.cost)) return { error: 'Not enough cash or credit to build.' };
    for (let i = 0; i < ex.rooms; i++){
      g.rooms.push({ id: g.rooms.length + 1, state: 'ready', dirt: ri(g, 0, 6), condition: 90, tier: 'standard', finish: null, fittings: [], quirk: drawQuirk(g), guest: null });
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
      if (!payWithCredit(g, 40)) return { error: 'Not enough cash or credit.' };
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
    if (segKey === 'family' && hasUpgrade(g, 'pool') && seasonArc(night) >= 1) f *= 1.22;
    if (segKey === 'trucker' && hasUpgrade(g, 'truckpad')) f *= 1.15;
    if (segKey === 'tourist' && hasUpgrade(g, 'truckpad')) f *= 1.06;
    if (segKey === 'family' && hasUpgrade(g, 'pets')) f *= 1.08;
    if (hasUpgrade(g, 'billboard')) f *= 1.10;
    if (g.reply && g.reply.night === night) f *= g.reply.mult;
    // The road has moods: some nights the highway is generous, some nights it
    // is not, and no rate card changes that. Rolled once per night (createGame,
    // resolveNight); the forecast reports a hint, never the number.
    if (night === g.night && typeof g.roadMood === 'number') f *= g.roadMood;
    return s.base * s.dow[dowOf(night)] * f;
  }
  function rollRoadMood(g){ return Math.round((0.85 + rnd(g) * 0.35) * 100) / 100; }
  function bookProb(g, segKey, rate){
    const s = SEGMENTS[segKey];
    let ref = s.ref;
    if (segKey === 'family' && hasUpgrade(g, 'breakfast')) ref += 10;
    if (segKey === 'family' && hasUpgrade(g, 'piewindow')) ref += 5;
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
      rate: 79, seasonFactor: seasonArc(1), amenities: 60,
      rooms: [], queue: [], processed: 0,
      lastReport: null, lastPlan: null, over: null,
      guestBook: [], reviewWall: [], inquiry: null, incident: null,
      credit: 0, upgrades: [], expansions: 0, cleanLog: [],
      lastInspection: null, bankLetter: null, ending: null, handymanTonight: false,
      cashHistory: [4250], quirkDeck: [],
      content: content || null,
      stats: { nights:0, revenue:0, guests:0, turnedAway:0, reviews:0, checkouts:0,
               roomNights:0, possibleRoomNights:0, fullHouses:0, fiveStarReviews:0, oneStarReviews:0, returners:0,
               incidents:0, incidentsHandled:0, certificates:0, bestNightProfit:null,
               lowestRatingAfter20:null, maxCredit:0, peakCash:4250 }
    };
    const conds = [88, 82, 79, 76, 74, 71, 68, 65];
    for (let i = 0; i < 8; i++){
      g.rooms.push({ id: i + 1, state: 'ready', dirt: ri(g, 0, 6), condition: conds[i], tier: 'standard', finish: null, fittings: [], quirk: drawQuirk(g), guest: null });
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
    const occ = occRooms.length;
    const ev = activeEvent(g, g.night);
    for (const room of occRooms){
      const guest = room.guest;
      let p = 0.09;
      if (room.condition < 72) p += 0.13;
      if (room.condition < 55) p += 0.15;
      if (room.condition < 40) p += 0.15;
      if (guest.trait === 'light-sleeper' && occ >= 5) p += 0.10;
      if (ev && ev.id === 'storm') p *= 1.6;
      if (hasUpgrade(g, 'security')) p *= 0.7;
      if (g.handymanTonight) p *= 0.8;
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
    if (action === 'fix'){ g.cash = Math.round((g.cash - 28) * 100) / 100; guest.recovery = 12; }
    else if (action === 'comp'){ g.cash = Math.round((g.cash - guest.ratePaid) * 100) / 100; guest.recovery = 12; guest.compProtected = true; }
    else if (action === 'ride'){ guest.recovery = -14; }
    else if (action === 'move'){
      const target = g.rooms.find(r => r.id === targetRoomId);
      if (!target || target.state !== 'ready') return { error: 'No ready room to move them to.' };
      guest.recovery = 18; guest.dirtAtCheckIn = target.dirt;
      target.state = 'occupied'; target.guest = guest;
      room.state = 'dirty'; room.dirt = Math.max(room.dirt, 30); room.guest = null;
    }
    else return { error: 'Unknown response.' };
    if (g.staff && g.staff.clerk && guest.recovery > 0) guest.recovery += 4;
    inc.resolved = action;
    ensureSeason(g); g.stats.incidentsHandled++;
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
    if (used > pool) return { error: 'Not enough housekeeping minutes for that plan.' };
    for (const room of g.rooms){
      if (room.state !== 'dirty') continue;
      const lvl = CLEAN_LEVELS[plan.cleans[room.id] || 'skip'];
      if (lvl.dirt !== null){ room.dirt = lvl.dirt; room.state = 'ready'; }
    }
    g.rate = clamp(Math.round(plan.rate), 35, 180);
    g.handymanTonight = !!plan.handyman;
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
      const pool = g.guestBook.filter(e => e.segment === a.segment && e.lastStars >= 3 && !usedNames.has(e.name));
      if (!pool.length) continue;
      const entry = pick(g, pool);
      usedNames.add(entry.name);
      a.name = entry.name; a.returning = true; a.visits = entry.visits + 1;
      if (entry.trait) a.trait = entry.trait;
    }
    // shuffle the queue so segments interleave
    for (let i = g.queue.length - 1; i > 0; i--){
      const j = Math.floor(rnd(g) * (i + 1));
      const t = g.queue[i]; g.queue[i] = g.queue[j]; g.queue[j] = t;
    }
    if (g.queue.length > queueCap(g)) g.queue.length = queueCap(g);
  }

  function assignRoom(g, arrivalId, roomId){
    const a = g.queue.find(q => q.id === arrivalId);
    const room = g.rooms.find(r => r.id === roomId);
    if (!a || !room || room.state !== 'ready') return { error: 'That will not work.' };
    room.state = 'occupied';
    // New-wing and renovated rooms let over the card rate — the guest agreed to
    // the card, and the room itself earns the difference. Phone bookings keep
    // the rate they were promised.
    const premium = a.inquiry ? 0 : (room.tier === 'renovated' ? 7 : 0) + (room.id > 8 ? 8 : 0);
    const deal = a.dealTaken && a.deal ? a.deal : null;
    room.guest = { name: a.name, segment: a.segment, nightsLeft: deal ? deal.nights : a.nights, ratePaid: deal ? deal.ratePer : a.ratePaid + premium,
                   dirtAtCheckIn: room.dirt, waitScore: clamp(100 - g.processed * 11, 35, 100),
                   trait: a.trait || null, returning: !!a.returning, visits: a.visits || 0,
                   // A regular who phoned for their room: getting it starts the
                   // stay warm (+8); any other door starts it slightly owed (−4).
                   recovery: a.wantRoom ? (a.wantRoom === room.id ? 8 : -4) : 0 };
    g.queue = g.queue.filter(q => q.id !== arrivalId);
    g.processed++; g.stats.guests++;
    if (a.returning){ ensureSeason(g); g.stats.returners++; }
    return { ok: true };
  }

  function turnAway(g, arrivalId){
    const a = g.queue.find(q => q.id === arrivalId);
    if (!a) return { error: 'Nobody there.' };
    g.queue = g.queue.filter(q => q.id !== arrivalId);
    g.processed++; g.stats.turnedAway++;
    return { ok: true };
  }

  function closeDesk(g){
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
        neighbourBurden += (nb && nb.finish === 'quiet') ? 0.5 : 1;
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
    let amen = g.amenities + rf(g, -4, 4);
    if (ev && ev.amenityPenalty && !hasUpgrade(g, 'ac')) amen -= ev.amenityPenalty;
    const comp = {
      clean: 100 - guest.dirtAtCheckIn,
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
    const vf = clamp(Math.pow(s.ref / guest.ratePaid, 0.65), 0.62, 1.12);
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
    const vendingRevenue = hasUpgrade(g, 'vending') ? roundMoney(1.6 * occ) : 0;
    revenue = roundMoney(revenue + vendingRevenue);
    const pieRevenue = hasUpgrade(g, 'piewindow') ? roundMoney(2.6 * occ) : 0;
    let petRevenue = 0;
    if (hasUpgrade(g, 'pets')){ for (let i = 0; i < occ; i++) if (rnd(g) < 0.18) petRevenue += 12; petRevenue = roundMoney(petRevenue); }
    revenue = roundMoney(revenue + pieRevenue + petRevenue);
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
      g.cleanLog.push({ night: g.night, clean: 100 - guest.dirtAtCheckIn });
      room.condition = clamp(Math.round((room.condition - wear * (room.finish === 'plush' ? 0.5 : 1)) * 10) / 10, 35, 100);
      room.dirt = clamp(Math.round(45 + rnd(g) * 35 + s.dirtMod), 30, 95);
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
      laundry: roundMoney(2.1 * occ * (hasUpgrade(g, 'laundry') ? 0.4 : 1)),
      supplies: roundMoney(1.4 * occ)
    };
    if (hasUpgrade(g, 'breakfast')) costs.breakfast = roundMoney(3.8 * occ);
    if (g.handymanTonight) costs.handyman = 60;
    const staffWage = (g.staff && g.staff.hk ? 38 : 0) + (g.staff && g.staff.clerk ? 30 : 0);
    if (staffWage) costs.staff = staffWage;
    // Insurance and the county are owed whether a single door sold or not —
    // the fixed nut an empty motel still pays, and the reason standing still
    // is a way to die, just a slower one.
    costs.insurance = 24;
    if (hasUpgrade(g, 'billboard')) costs.billboard = 13;
    if (g.credit > 0) costs.interest = roundMoney(Math.min(g.credit, 4000) * 0.0025 + Math.min(Math.max(0, g.credit - 4000), 2000) * 0.005 + Math.max(0, g.credit - 6000) * 0.0075);
    const costTotal = roundMoney(Object.values(costs).reduce((a, b) => a + b, 0));
    const profit = roundMoney(revenue - costTotal);
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

    const report = { night: g.night, dow: DOW_NAMES[dowOf(g.night)], revenue, roomRevenue, vendingRevenue, costs, costTotal,
                     profit, cashAfter: g.cash, occupied: occ, checkouts,
                     ratingAfter: g.rating, turnedAwayTotal: g.stats.turnedAway,
                     creditDrawn, creditAfter: g.credit };
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
      g.rooms.push({ id: g.rooms.length + 1, state: 'ready', dirt: ri(g, 0, 6), condition: 90, tier: 'standard', finish: null, fittings: [], quirk: drawQuirk(g), guest: null });
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
           SEGMENTS, SEG_KEYS, CLEAN_LEVELS, DOW_NAMES, dowOf, repMult,
           TRAITS, INCIDENTS, UPGRADES, EXPANSIONS, CALENDAR,
           activeEvent, calendarEntry, nextCalendar, seasonArc, competitorFactor, segmentPool, bookProb,
           QUIRKS, FITTINGS, FINISHES, matchScore, scoreStay, SEGMENTS, INCIDENTS,
           setStaff, replyToReview, answerDeal, REPLIES,
           housekeepingPool, cleanMinutes, queueCap,
           SEASON_NIGHTS, CREDIT_LIMIT,
           BASE_MINUTES, EXTRA_MINUTES, EXTRA_COST, MORTGAGE };
})();
/*SIM-END*/
