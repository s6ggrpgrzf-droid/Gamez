/* Life Story v3 "Rebirth" — life simulator engine. Pure logic, no DOM (testable in node). */
'use strict';
var LifeSim = (function () {
  var R = Math.random;
  function setRng(fn) { R = fn; }
  function ri(n) { return (R() * n) | 0; }
  function rf(a, b) { return a + R() * (b - a); }
  function pick(a) { return a[ri(a.length)]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function chance(p) { return R() < p; }

  function fmt(n) {
    var neg = n < 0, v = Math.abs(Math.round(n));
    var s;
    if (v >= 1e9) s = (v / 1e9).toFixed(2) + 'B';
    else if (v >= 1e6) s = (v / 1e6).toFixed(2) + 'M';
    else if (v >= 1e3) s = (v / 1e3).toFixed(1) + 'K';
    else s = '' + v;
    return (neg ? '-$' : '$') + s;
  }
  function fmtN(n) {
    var v = Math.abs(Math.round(n));
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return '' + v;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var MALE = ['James', 'John', 'Robert', 'Michael', 'David', 'William', 'Liam', 'Noah', 'Oliver', 'Elijah', 'Mateo', 'Lucas', 'Leo', 'Owen', 'Ezra', 'Kai', 'Felix', 'Hugo', 'Theo', 'Jasper'];
  var FEMALE = ['Mary', 'Jennifer', 'Emma', 'Olivia', 'Ava', 'Sophia', 'Isabella', 'Mia', 'Luna', 'Camila', 'Aria', 'Zoe', 'Nora', 'Ivy', 'Elif', 'Yuki', 'Priya', 'Sofia', 'Chloe', 'Ruby'];
  var SURNAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Martin', 'Lee', 'Walker'];
  var COUNTRIES = [
    { c: 'USA', cities: ['New York', 'Los Angeles', 'Chicago', 'Miami', 'Austin'] },
    { c: 'UK', cities: ['London', 'Manchester', 'Bristol'] },
    { c: 'Canada', cities: ['Toronto', 'Vancouver', 'Montreal'] },
    { c: 'Australia', cities: ['Sydney', 'Melbourne', 'Brisbane'] },
    { c: 'Mexico', cities: ['Mexico City', 'Guadalajara'] },
    { c: 'Spain', cities: ['Madrid', 'Barcelona'] },
    { c: 'France', cities: ['Paris', 'Lyon'] },
    { c: 'Japan', cities: ['Tokyo', 'Osaka'] },
    { c: 'Brazil', cities: ['Sao Paulo', 'Rio de Janeiro'] },
    { c: 'India', cities: ['Mumbai', 'Delhi'] }
  ];
  var EDU_NAMES = ['No diploma', 'High school', 'University', 'Graduate school'];
  var BIZ_NAMES = ['Corner Store', 'Taco Truck', 'Barbershop', 'Car Wash', 'Tech Startup', 'Record Label'];
  var SKINS = ['#FFDFC4', '#F0C8A0', '#D8A066', '#A06A3B', '#5C3A1E'];

  var JOBS = [
    { t: 'Barista', sal: 24000, req: {} },
    { t: 'Retail Clerk', sal: 26000, req: {} },
    { t: 'Janitor', sal: 28000, req: {} },
    { t: 'Truck Driver', sal: 46000, req: {} },
    { t: 'Electrician', sal: 54000, req: { smarts: 30 } },
    { t: 'Plumber', sal: 52000, req: {} },
    { t: 'Real Estate Agent', sal: 58000, req: { looks: 40 } },
    { t: 'Teacher', sal: 48000, req: { edu: 2 } },
    { t: 'Nurse', sal: 66000, req: { edu: 2 } },
    { t: 'Police Officer', sal: 59000, req: { health: 50 } },
    { t: 'Firefighter', sal: 57000, req: { health: 50 } },
    { t: 'Journalist', sal: 52000, req: { edu: 2, smarts: 40 } },
    { t: 'Software Developer', sal: 98000, req: { edu: 2, smarts: 60 } },
    { t: 'Engineer', sal: 92000, req: { edu: 2, smarts: 55 } },
    { t: 'Architect', sal: 85000, req: { edu: 2, smarts: 55 } },
    { t: 'Accountant', sal: 68000, req: { edu: 2, smarts: 45 } },
    { t: 'Lawyer', sal: 145000, req: { edu: 3, smarts: 70 } },
    { t: 'Doctor', sal: 225000, req: { edu: 3, smarts: 80 } },
    { t: 'Surgeon', sal: 330000, req: { edu: 3, smarts: 90 } },
    { t: 'Executive', sal: 310000, req: { edu: 3, smarts: 80 } },
    { t: 'Influencer', sal: 60000, req: { looks: 60 }, fame: true },
    { t: 'Model', sal: 125000, req: { looks: 85 }, fame: true },
    { t: 'Musician', sal: 82000, req: { looks: 50 }, fame: true },
    { t: 'Actor', sal: 155000, req: { looks: 75 }, fame: true },
    { t: 'Pro Athlete', sal: 210000, req: { health: 85 }, fame: true }
  ];

  var HOUSES = [
    { t: 'Cozy Cottage', price: 140000 },
    { t: 'Suburban Home', price: 320000 },
    { t: 'City Loft', price: 550000 },
    { t: 'Beach Villa', price: 1200000 },
    { t: 'Grand Mansion', price: 3500000 }
  ];
  var CARS = [
    { t: 'Used Sedan', price: 8000 },
    { t: 'Family SUV', price: 32000 },
    { t: 'Sports Coupe', price: 75000 },
    { t: 'Luxury Sedan', price: 110000 },
    { t: 'Supercar', price: 280000 }
  ];
  var CRIMES = [
    { t: 'Pickpocket', reward: 300, risk: 0.22, jail: 1 },
    { t: 'Shoplift', reward: 800, risk: 0.28, jail: 1 },
    { t: 'Burglary', reward: 3500, risk: 0.36, jail: 2 },
    { t: 'Car Theft', reward: 12000, risk: 0.45, jail: 3 },
    { t: 'Bank Robbery', reward: 90000, risk: 0.60, jail: 8 }
  ];

  var SCENARIOS = [
    { id: 'classic', name: '📖 Classic', desc: 'No goal. Just live a life.' },
    { id: 'rags', name: '💸 Rags to Riches', desc: 'Start broke. Die worth $1M+.', check: function (S) { return netWorth(S) >= 1000000; } },
    { id: 'nepo', name: '🍼 Nepo Baby', desc: 'Born rich & gorgeous. Reach 90 fame.', check: function (S) { return S.fame >= 90; } },
    { id: 'crime', name: '🔫 Crime Lord', desc: 'Commit 10 crimes and live to 60.', check: function (S) { return S.crimes >= 10 && S.age >= 60; } }
  ];

  /* ---------------- birth dossier data ---------------- */
  var PARENT_JOBS = [
    'Bus Driver', 'Dental Hygienist', 'Grocery Cashier', 'Plumber',
    'Substitute Teacher', 'Mail Carrier', 'Landscaper', 'Call Center Rep',
    'Diner Waitress', 'Warehouse Worker', 'School Janitor', 'Nursing Assistant',
    'Auto Mechanic', 'Office Manager', 'Librarian', 'Security Guard',
    'Bank Teller', 'Hairdresser', 'Electrician', 'Receptionist',
    'Truck Driver', 'Line Cook', 'Insurance Agent', 'City Clerk'
  ];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var CONCEPTIONS = [
    'Your parents were high-school sweethearts. The rest is biology.',
    'A prom night, a borrowed tux, and a decision nobody regrets out loud.',
    'Nine months after a very awkward New Year\'s Eve party.',
    'Your parents met in traffic court. Honestly, it worked out.',
    'A slow dance at a wedding where neither of them knew the couple.',
    'Your mom\'s version: "the power went out." Your dad\'s version: "the power went out."',
    'A second date that went extremely well, apparently.',
    'Your parents bonded over a shared hatred of line dancing.',
    'A beach vacation, a sunset, and absolutely zero planning.',
    'They say lightning never strikes twice. You are the twice.'
  ];
  var SIGNS = [
    { name: 'Aries', bonus: { stat: 'happy', amt: 3 }, joke: 'Bold and brave. Mostly brave. Occasionally just loud.' },
    { name: 'Taurus', bonus: { stat: 'health', amt: 3 }, joke: 'Stubborn as a mule. Naps like one too.' },
    { name: 'Gemini', bonus: { stat: 'smarts', amt: 3 }, joke: 'Two personalities, both charming, neither on time.' },
    { name: 'Cancer', bonus: { stat: 'happy', amt: 3 }, joke: 'Feels everything deeply. Cries at commercials.' },
    { name: 'Leo', bonus: { stat: 'looks', amt: 3 }, joke: 'Born for the spotlight. The mirror agrees.' },
    { name: 'Virgo', bonus: { stat: 'smarts', amt: 3 }, joke: 'Organized chaos. Emphasis on chaos.' },
    { name: 'Libra', bonus: { stat: 'looks', amt: 3 }, joke: 'Charming and balanced. Cannot pick a restaurant.' },
    { name: 'Scorpio', bonus: { stat: 'health', amt: 3 }, joke: 'Intense. Probably plotting something. Probably fine.' },
    { name: 'Sagittarius', bonus: { stat: 'happy', amt: 3 }, joke: 'Adventurous free spirit. Allergic to commitment.' },
    { name: 'Capricorn', bonus: { stat: 'smarts', amt: 3 }, joke: 'Ambitious and disciplined. Fun at parties (allegedly).' },
    { name: 'Aquarius', bonus: { stat: 'smarts', amt: 3 }, joke: 'A visionary ahead of their time. Nobody knows why.' },
    { name: 'Pisces', bonus: { stat: 'happy', amt: 3 }, joke: 'Dreamy and artistic. Lost in thought since birth.' }
  ];

  function fullName(gender) {
    var f = gender === 'F' ? pick(FEMALE) : pick(MALE);
    return f + ' ' + pick(SURNAMES);
  }

  function genDossier() {
    var father = { name: fullName('M'), job: pick(PARENT_JOBS) };
    var mother = { name: fullName('F'), job: pick(PARENT_JOBS) };
    var sign = pick(SIGNS);
    var nSib = ri(4); // 0-3
    var siblings = [], i;
    for (i = 0; i < nSib; i++) {
      var g = chance(0.5) ? 'F' : 'M';
      siblings.push(fullName(g) + ' (' + (ri(10) + 1) + ')');
    }
    var wealthRoll = R();
    var wealth = wealthRoll < 0.25 ? 'struggling' : wealthRoll < 0.75 ? 'comfortable' : 'well-off';
    return {
      father: father, mother: mother,
      dob: pick(MONTHS) + ' ' + (ri(28) + 1),
      sign: { name: sign.name, bonus: sign.bonus, joke: sign.joke },
      conception: pick(CONCEPTIONS),
      siblings: siblings,
      wealth: wealth
    };
  }

  function newLife(scenarioId, inherit, dossier) {
    var gender = chance(0.5) ? 'M' : 'F';
    var cc = pick(COUNTRIES);
    var sc = scenarioId || 'classic';
    var S = {
      name: fullName(gender), gender: gender,
      country: cc.c, city: pick(cc.cities),
      age: 0, alive: true, deathCause: null, won: false,
      scenario: sc,
      happy: ri(31) + 50, health: ri(21) + 70, smarts: ri(61) + 20, looks: ri(61) + 20,
      fame: 0, followers: 0,
      money: 0, stocks: 0,
      business: null,
      edu: 0, studying: null,
      job: null,
      partner: null, partnersTotal: 0,
      kids: [],
      houses: [], cars: [],
      jail: 0, jailTotal: 0, crimes: 0, escaped: 0,
      donated: 0, vacations: 0, willWritten: false,
      everWorked: false,
      karma: 50, secondChance: true, prayedYear: -1,
      daily: null, dailyFlags: {}, platform: null,
      skin: pick(SKINS), pendingEvent: null,
      log: []
    };
    if (sc === 'rags') { S.happy = ri(20) + 30; S.health = ri(20) + 50; S.smarts = ri(40) + 20; S.looks = ri(40) + 20; }
    if (sc === 'nepo') { S.money = 2000000; S.looks = ri(11) + 85; S.happy = ri(21) + 70; }
    if (inherit && inherit.money > 0) S.money += inherit.money;
    if (dossier) {
      if (dossier.sign && dossier.sign.bonus) stat(S, dossier.sign.bonus.stat, dossier.sign.bonus.amt);
      S.parents = { father: dossier.father, mother: dossier.mother };
      S.siblings = dossier.siblings || [];
      S.dob = dossier.dob;
      S.birthWealth = dossier.wealth;
    }
    log(S, '🍼 ' + S.name + ' was born in ' + S.city + ', ' + S.country + '.');
    if (sc !== 'classic') {
      var scd = SCENARIOS.filter(function (x) { return x.id === sc; })[0];
      log(S, '🎯 Scenario: ' + scd.name + ' — ' + scd.desc);
    }
    if (inherit && inherit.money > 0) log(S, '💰 Inherited ' + fmt(inherit.money) + ' from a parent.');
    return S;
  }

  function log(S, text) {
    S.log.unshift({ age: S.age, text: text });
    if (S.log.length > 250) S.log.length = 250;
  }
  function stat(S, k, d) { S[k] = clamp(Math.round(S[k] + d), 0, 100); }
  function karma(S, d) { S.karma = clamp(Math.round(S.karma + d), 0, 100); }
  function luckF(S) { return 1 + (S.karma - 50) / 200; }
  function kchance(S, p, good) { return good ? chance(p * luckF(S)) : chance(p / luckF(S)); }
  function karmaVerdict(S) {
    var k = S.karma;
    if (k >= 85) return 'Saintly';
    if (k >= 65) return 'Decent soul';
    if (k >= 45) return 'Morally beige';
    if (k >= 25) return 'Shady';
    return 'Certified menace';
  }

  function netWorth(S) {
    var w = S.money + S.stocks;
    if (S.business) w += S.business.value;
    S.houses.forEach(function (h) { w += h.value; });
    S.cars.forEach(function (c) { w += c.value; });
    return Math.round(w);
  }

  /* ---------------- yearly tick ---------------- */
  function ageUp(S) {
    if (!S.alive) return;
    S.age++;

    if (S.jail > 0) {
      S.jail--;
      stat(S, 'happy', -8); stat(S, 'health', -4);
      log(S, '🔒 Year ' + (S.jailTotal - S.jail) + ' behind bars. The food is a war crime.');
      if (chance(0.15)) { S.jail += 1; S.jailTotal += 1; log(S, '🥊 Prison fight! Sentence extended by a year.'); }
      if (S.jail === 0) log(S, '🕊️ Released. The sky has never looked so good.');
      tickKids(S);
      deathCheck(S);
      return;
    }

    if (S.age === 6) log(S, '🎒 Started elementary school. The glue tastes weird.');
    if (S.age === 13) log(S, '😬 Teenage years. Everything is embarrassing now.');
    if (S.age === 18 && S.edu === 0) { S.edu = 1; log(S, '🎓 Graduated high school. Adult-ish.'); }
    if (S.studying) {
      S.studying.years--;
      stat(S, 'smarts', 4);
      if (S.studying.years <= 0) {
        if (S.studying.type === 'uni') { S.edu = 2; log(S, '🎓 Graduated university! The debt was worth it. Probably.'); }
        else { S.edu = 3; log(S, '🎓 Finished graduate school. Call me Doctor.'); }
        S.studying = null;
      }
    }

    if (S.job) {
      var jdef = JOBS.filter(function (j) { return j.t === S.job.t; })[0];
      var raise = 1 + (S.job.perf > 80 ? 0.04 : S.job.perf > 50 ? 0.02 : 0);
      S.job.sal = Math.round(S.job.sal * raise);
      S.money += S.job.sal;
      S.job.perf = clamp(S.job.perf + ri(11) - 5, 0, 100);
      if (jdef && jdef.fame) {
        var fg = Math.round(S.job.perf / 12) + (S.looks > 70 ? 2 : 0);
        S.fame = clamp(S.fame + fg, 0, 100);
        if (S.fame >= 30 && chance(0.3)) {
          var fw = ri(40000) + 5000;
          S.money += fw;
          log(S, '📣 Endorsement deal! +' + fmt(fw) + ' for smiling near a product.');
        }
      }
      if (S.job.perf < 15 && chance(0.25)) {
        log(S, '📦 Fired from ' + S.job.t + ' for being spectacularly mediocre.');
        S.job = null;
      }
    }
    var living = S.age < 18 ? 0 : 12000 + (S.houses.length * 6000) + (S.cars.length * 2500) + (S.kids.length * 8000);
    if (S.fame >= 60) living += 30000; // fame is expensive
    S.money -= living;

    // investments
    if (S.stocks > 0) {
      S.stocks = Math.round(S.stocks * rf(0.75, 1.35));
      if (S.stocks < 1) { S.stocks = 0; log(S, '📉 Your stocks went to zero. A masterclass in optimism.'); }
    }
    if (S.business) {
      var profit = Math.round(S.business.value * rf(-0.12, 0.28));
      S.money += profit;
      S.business.value = Math.max(5000, Math.round(S.business.value * rf(0.95, 1.12)));
      if (profit >= 0) log(S, '🏪 ' + S.business.name + ' profited ' + fmt(profit) + ' this year.');
      else log(S, '🏪 ' + S.business.name + ' lost ' + fmt(-profit) + ' this year. The market is cruel.');
    }

    S.houses.forEach(function (h) { h.value = Math.round(h.value * rf(1.02, 1.09)); });
    S.cars.forEach(function (c) { c.value = Math.round(c.value * 0.88); });

    if (S.partner) {
      S.partner.affection = clamp(S.partner.affection + ri(11) - 5, 0, 100);
      if (S.partner.affection < 12 && chance(0.3)) {
        log(S, '💔 ' + S.partner.name + ' left you for a yoga instructor. Namaste.');
        stat(S, 'happy', -15);
        S.partner = null;
      }
    }
    tickKids(S);

    stat(S, 'health', S.age < 40 ? -1 : S.age < 60 ? -2 : -3);
    stat(S, 'looks', S.age > 35 ? -1 : 0);
    if (S.age >= 18) stat(S, 'happy', -1);
    if (S.fame > 0) S.followers = Math.round(S.followers * rf(0.97, 1.08) + S.fame * 40);

    if (chance(S.age < 18 ? 0.32 : 0.40)) S.pendingEvent = pickEvent(S);

    deathCheck(S);
  }

  function tickKids(S) { S.kids.forEach(function (k) { k.age++; }); }

  /* ---------------- choice events ----------------
     Every event: 2-3 choices, every choice moves something.
     The third option is chaos. Karmic tradeoffs, never consequence-free. */
  var EVENTS = [
    { w: 3, ok: function (S) { return true; }, title: '🍀 Sidewalk cash',
      text: 'A crisp $20 bill is lying on the sidewalk, pretending it has no owner.',
      choices: [
        { label: 'Pocket it', run: function (S) { var f = ri(30) + 10; S.money += f; karma(S, -3); return '🍀 Pocketed ' + fmt(f) + ' off the sidewalk. Finders keepers, losers weepers.'; } },
        { label: 'Leave it for someone luckier', run: function (S) { karma(S, 2); stat(S, 'happy', 2); return '🍀 Left the money. Some kid is about to have the best day of their life.'; } },
        { label: 'Buy a lottery ticket with it', run: function (S) { karma(S, -2); if (kchance(S, 0.002, true)) { S.money += 1000000; stat(S, 'happy', 20); return '🍀 The sidewalk money bought a jackpot ticket: $1,000,000! Destiny is real and it shops curbside.'; } stat(S, 'happy', -2); return '🍀 Spent the sidewalk cash on a lottery ticket. Won nothing. The universe provides, then invoices.'; } }
      ] },
    { w: 3, ok: function (S) { return S.age >= 10; }, title: '🤒 The flu',
      text: 'A flu with main-character energy has chosen you as its host. It will not be leaving quietly.',
      choices: [
        { label: 'Tough it out', run: function (S) { stat(S, 'health', -8); stat(S, 'happy', -4); return '🤒 Rode out the flu on soup and spite. Your immune system sends its regards.'; } },
        { label: 'See a doctor ($200)', run: function (S) { if (S.age >= 18) S.money -= 200; stat(S, 'health', 6); stat(S, 'happy', -2); return '🤒 Doctor prescribed rest and a bill. The bill worked immediately.'; } },
        { label: 'Lick a shopping cart "for immunity"', run: function (S) { stat(S, 'health', -16); stat(S, 'happy', 4); return '🤒 Licked a shopping cart for immunity. You are now patient zero of something with a Latin name.'; } }
      ] },
    { w: 2, ok: function (S) { return S.age >= 16; }, title: '🚗 Fender bender',
      text: 'Someone "didn\'t see" your car in the parking lot. They left a note. The note says "sorry." The handwriting says "lol."',
      choices: [
        { label: 'Pay for repairs', run: function (S) { var c = ri(3000) + 500; S.money -= c; stat(S, 'happy', -4); return '🚗 Paid ' + fmt(c) + ' for repairs. The note-writer is living their best life.'; } },
        { label: 'Drive it as-is', run: function (S) { stat(S, 'happy', -6); stat(S, 'looks', -2); return '🚗 Driving with a dented bumper now. It gives the car "character."'; } },
        { label: 'File it as a hit-and-run', run: function (S) { var c = ri(3000) + 500; S.money += c; karma(S, -6); return '🚗 Filed an insurance claim for a hit-and-run. Insurance paid ' + fmt(c) + '. The universe is now watching you.'; } }
      ] },
    { w: 2, ok: function (S) { return true; }, title: '🎉 Old friend',
      text: 'An old friend shows up unannounced with snacks and stories you are legally not allowed to repeat.',
      choices: [
        { label: 'Catch up all night', run: function (S) { stat(S, 'happy', 10); stat(S, 'health', -2); return '🎉 Stayed up till 3am laughing. Your liver filed a formal complaint.'; } },
        { label: 'Say you\'re busy', run: function (S) { stat(S, 'happy', -4); karma(S, -2); return '🎉 Pretended to be busy. The friendship cooled by exactly four degrees.'; } },
        { label: 'Introduce them to your ex', run: function (S) { karma(S, -4); stat(S, 'happy', 4); return '🎉 Introduced them to your ex "as a joke." Nobody is laughing. Everybody is texting.'; } }
      ] },
    { w: 2, ok: function (S) { return S.age >= 18; }, title: '🥷 Mugged',
      text: 'A mugger with excellent cardio demands your wallet. They are faster than you. This is not a negotiation.',
      choices: [
        { label: 'Hand it over', run: function (S) { var m = ri(900) + 100; S.money -= m; stat(S, 'happy', -6); return '🥷 Handed over ' + fmt(m) + '. The mugger said "thanks, man." Rude AND polite.'; } },
        { label: 'Run', run: function (S) { if (chance(0.5)) { stat(S, 'happy', 6); return '🥷 Ran. Cardio paid off. You are the main character in a chase scene now.'; } var m = ri(900) + 100; S.money -= m; stat(S, 'health', -8); return '🥷 Ran. Tripped. Lost ' + fmt(m) + ' and some dignity. The mugger waited patiently. Embarrassing for everyone.'; } },
        { label: 'Try to mug THEM back', run: function (S) { stat(S, 'health', -12); karma(S, -6); stat(S, 'happy', 2); return '🥷 Attempted a reverse-mugging. You are now the cautionary tale they tell at mugger school.'; } }
      ] },
    { w: 2, once: true, ok: function (S) { return S.age >= 25; }, title: '📜 Inheritance',
      text: function (S) { var m = 5000 + ((S.age * 37) % 20000); return 'Your twice-removed Uncle Gerald has died and left you ' + fmt(m) + '. You met him twice. He remembered you anyway.'; },
      choices: [
        { label: 'Accept graciously', run: function (S) { var m = 5000 + ((S.age * 37) % 20000); S.money += m; stat(S, 'happy', 8); return '📜 Inherited ' + fmt(m) + ' from Gerald. Grief, but make it profitable.'; } },
        { label: 'Donate half in his name', run: function (S) { var m = 5000 + ((S.age * 37) % 20000); S.money += Math.round(m / 2); karma(S, 8); stat(S, 'happy', 4); return '📜 Gave half to charity in Gerald\'s name. Gerald would have hated that. He loved money.'; } },
        { label: 'Contest the will for ALL of it', run: function (S) { var m = 5000 + ((S.age * 37) % 20000); karma(S, -6); if (chance(0.5)) { S.money += Math.round(m * 1.5); karma(S, -4); return '📜 Contested the will and won ' + fmt(Math.round(m * 1.5)) + '. Gerald\'s cat got nothing. You feel nothing. That\'s the problem.'; } stat(S, 'happy', -8); return '📜 Contested the will and lost. The judge called it "audacious." Gerald\'s cat sends its regards.'; } }
      ] },
    { w: 2, ok: function (S) { return S.age >= 12; }, title: '🏋️ Gym injury',
      text: 'You pulled a muscle demonstrating a workout you saw online. The video had 12 views. You are the 12th injury.',
      choices: [
        { label: 'Rest it off', run: function (S) { stat(S, 'health', -6); stat(S, 'happy', -2); return '🏋️ Rested the muscle. It healed. Your pride is still in physical therapy.'; } },
        { label: 'Train through the pain', run: function (S) { stat(S, 'health', -12); stat(S, 'looks', 2); return '🏋️ Trained through the pain. Your form was terrible. Your commitment: inspiring. Your limp: permanent-ish.'; } },
        { label: 'Post the injury for sympathy', run: function (S) { S.followers += ri(400) + 100; stat(S, 'happy', 6); karma(S, -2); return '🏋️ Posted the injury online. 400 likes. Zero sympathy. The internet is a hospital with no nurses.'; } }
      ] },
    { w: 2, ok: function (S) { return true; }, title: '🌈 Main character energy',
      text: 'A stranger stopped you on the street to say you have "main character energy." They did not elaborate. They never elaborate.',
      choices: [
        { label: 'Believe them', run: function (S) { stat(S, 'happy', 6); stat(S, 'looks', 2); return '🌈 You ARE the main character. Everyone else is an NPC. You walk differently now.'; } },
        { label: 'Ask what that means', run: function (S) { stat(S, 'smarts', 2); stat(S, 'happy', 2); return '🌈 Asked for clarification. They said "you\'ll know." You do not know.'; } },
        { label: 'Charge $5 for the compliment', run: function (S) { S.money += 5; karma(S, -4); stat(S, 'happy', 2); return '🌈 Charged $5 for the compliment. They paid. Capitalism wins again.'; } }
      ] },
    { w: 2, ok: function (S) { return S.age >= 8; }, title: '🤢 Street tacos',
      text: 'Street tacos at 1am. 10/10 flavor. The truck had no name, no permit, and one very confident cook named Big Mike.',
      choices: [
        { label: 'Worth it', run: function (S) { stat(S, 'health', -6); stat(S, 'happy', 6); return '🤢 The tacos were transcendent. Your stomach disagrees. Both things are true.'; } },
        { label: 'Never again', run: function (S) { stat(S, 'happy', -4); karma(S, 1); return '🤢 Swore off street tacos forever. You will be back on Friday.'; } },
        { label: 'Invest in Big Mike\'s taco empire', run: function (S) { S.money -= 2000; if (chance(0.3)) { S.money += 8000; stat(S, 'happy', 8); return '🤢 Invested $2,000 in Big Mike\'s taco empire. It franchised. You are a taco baron now.'; } stat(S, 'happy', -4); return '🤢 Invested $2,000 in Big Mike\'s taco empire. The health inspector disagreed with the business plan.'; } }
      ] },
    { w: 2, ok: function (S) { return S.age >= 16; }, title: '📻 Caller number nine',
      text: function (S) { var m = ri(900) + 100; return 'You are caller number nine on the morning show! The prize is ' + fmt(m) + '. The catch: you must answer a trivia question on live radio.'; },
      choices: [
        { label: 'Answer confidently', run: function (S) { var m = ri(900) + 100; if (chance(0.4 + S.smarts / 200)) { S.money += m; stat(S, 'happy', 8); return '📻 Nailed the trivia! Won ' + fmt(m) + '. Your mom is telling everyone.'; } stat(S, 'happy', -6); return '📻 Froze on live radio. 40,000 people heard you breathe. The host still brings it up.'; } },
        { label: 'Hang up', run: function (S) { stat(S, 'happy', -4); return '📻 Hung up. The prize went to caller ten. Caller ten is insufferable about it.'; } },
        { label: 'Shout out your ex on air', run: function (S) { karma(S, -4); stat(S, 'happy', 6); return '📻 Used your five seconds of fame to air grievances about your ex. Ratings gold. Dignity: gone.'; } }
      ] },
    { w: 2, ok: function (S) { return S.houses.length > 0; }, title: '🏠 Roof trouble',
      text: 'The roof is now more of a suggestion. The forecast says rain. The contractor walked in, looked up, and said "yikes."',
      choices: [
        { label: 'Pay for repairs', run: function (S) { var m = ri(4000) + 1000; S.money -= m; return '🏠 Repairs: ' + fmt(m) + '. The contractor charged extra for the "yikes."'; } },
        { label: 'DIY it', run: function (S) { var m = ri(4000) + 1000; if (chance(0.5)) { S.money -= Math.round(m / 3); stat(S, 'happy', 6); return '🏠 DIY roof repair: success! YouTube made it look easy. For once, YouTube was right.'; } S.money -= m; stat(S, 'health', -8); return '🏠 DIY roof repair: YouTube made it look easy. YouTube lied. Gravity did not.'; } },
        { label: 'Just put a bucket under it', run: function (S) { stat(S, 'happy', -6); karma(S, -1); return '🏠 The bucket strategy. It\'s not a leak if you monetize the drip. (You cannot monetize the drip.)'; } }
      ] },
    { w: 2, ok: function (S) { return !!S.partner; }, title: '🗯️ The dishwasher war',
      text: function (S) { var pn = S.partner ? S.partner.name : 'your partner'; return 'A huge fight with ' + pn + ' about the correct way to load a dishwasher. This is about the dishwasher. It is not about the dishwasher.'; },
      choices: [
        { label: 'Apologize first', run: function (S) { S.partner.affection = clamp(S.partner.affection + 10, 0, 100); stat(S, 'happy', 2); return '🗯️ Apologized. You were wrong about the bowls. The bowls were the hill you almost died on.'; } },
        { label: 'Stand your ground', run: function (S) { S.partner.affection = clamp(S.partner.affection - 12, 0, 100); stat(S, 'happy', -4); return '🗯️ Stood your ground. The forks point UP. You will die on this hill. Alone, probably.'; } },
        { label: 'Buy a second dishwasher', run: function (S) { S.money -= 800; S.partner.affection = clamp(S.partner.affection + 6, 0, 100); stat(S, 'happy', 4); return '🗯️ Bought a second dishwasher. Problem solved with money, the way nature intended.'; } }
      ] },
    { w: 2, ok: function (S) { return S.kids.length > 0; }, title: '🎭 School play',
      text: 'Your kid played "Tree #3" in the school play. They had one line: "rustle." They nailed it.',
      choices: [
        { label: 'Cheer like crazy', run: function (S) { stat(S, 'happy', 8); return '🎭 Cheered like they won an Oscar. Tree #3 will never be forgotten.'; } },
        { label: 'Miss it for work', run: function (S) { stat(S, 'happy', -8); karma(S, -3); return '🎭 Missed the play for work. Tree #3 rustled without you. The guilt has tenure.'; } },
        { label: 'Demand a bigger role for them', run: function (S) { karma(S, -4); stat(S, 'happy', 2); return '🎭 Demanded the director recast Tree #3 as Tree #1. You are banned from the auditorium.'; } }
      ] },
    { w: 2, ok: function (S) { return !!S.job; }, title: '⭐ Public praise',
      text: 'Your boss praised you publicly in the meeting. Your coworkers now hate you a little.',
      choices: [
        { label: 'Soak it in', run: function (S) { S.job.perf = clamp(S.job.perf + 12, 0, 100); stat(S, 'happy', 6); return '⭐ Soaked it in. Your coworkers hate you a little more now. Worth it.'; } },
        { label: 'Credit the team', run: function (S) { S.job.perf = clamp(S.job.perf + 6, 0, 100); karma(S, 3); stat(S, 'happy', 4); return '⭐ Credited the team. Your coworkers hate you slightly less. Your boss thinks you\'re management material.'; } },
        { label: 'Take credit for Dave\'s project too', run: function (S) { S.job.perf = clamp(S.job.perf + 18, 0, 100); karma(S, -8); return '⭐ Also took credit for Dave\'s project. Dave knows. Dave is updating his resume AND a voodoo doll.'; } }
      ] },
    { w: 1, ok: function (S) { return S.age >= 18; }, title: '📈 Investments mooned',
      text: function (S) { var m = ri(40000) + 10000; return 'Your investments mooned overnight: +' + fmt(m) + '. You are about to tell everyone it was skill.'; },
      choices: [
        { label: 'Cash out half', run: function (S) { var m = ri(40000) + 10000; S.money += Math.round(m / 2); stat(S, 'happy', 6); return '📈 Took profits. Boring. Profitable. Your future self says thanks.'; } },
        { label: 'Let it ride', run: function (S) { var m = ri(40000) + 10000; if (chance(0.5)) { S.money += m * 2; stat(S, 'happy', 12); return '📈 Let it ride and it kept riding. Diamond hands. Paper wallet. The duality of man.'; } stat(S, 'happy', -8); return '📈 Let it ride. It rode straight off a cliff. The memes are forever; the money is not.'; } },
        { label: 'Tell everyone it was skill', run: function (S) { stat(S, 'happy', 6); karma(S, -3); return '📈 Told everyone it was skill. It was luck. Everyone knows. You\'ve started a finance podcast.'; } }
      ] },
    { w: 1, ok: function (S) { return S.age >= 18 && S.money > 5000; }, title: '📉 Market crash',
      text: 'Market crash. Your portfolio is doing a trust fall and nobody is catching it.',
      choices: [
        { label: 'Hold', run: function (S) { var m = Math.min(S.money, ri(20000) + 5000); S.money -= m; stat(S, 'happy', -6); return '📉 Held through the crash: -' + fmt(m) + '. Diamond hands, paper wallet.'; } },
        { label: 'Panic sell', run: function (S) { var m = Math.min(S.money, ri(20000) + 5000); S.money -= Math.round(m * 1.3); stat(S, 'happy', -10); return '📉 Panic-sold at the bottom. You have purchased the dip for someone else. Generous.'; } },
        { label: 'Buy MORE', run: function (S) { var m = Math.min(S.money, ri(20000) + 5000); if (chance(0.5)) { S.money += m; stat(S, 'happy', 10); return '📉 Doubled down and caught the rebound: +' + fmt(m) + '. Genius. (This time.)'; } S.money -= m * 2; stat(S, 'happy', -12); return '📉 Doubled down into a falling knife. Either a genius or a cautionary tale. It\'s the second one.'; } }
      ] },
    { w: 1, ok: function (S) { return S.age >= 40; }, title: '🩺 Blood pressure',
      text: 'Doctor: "Your blood pressure has opinions." Prescribed kale and judgment.',
      choices: [
        { label: 'Eat the kale', run: function (S) { stat(S, 'health', 6); stat(S, 'happy', -4); return '🩺 Ate the kale. Blood pressure: down. Will to live: down, but differently.'; } },
        { label: 'Ignore it', run: function (S) { stat(S, 'health', -10); stat(S, 'happy', 4); return '🩺 Ignored the doctor. Ate a burger out of spite. The spite was delicious.'; } },
        { label: 'Get a second opinion from the internet', run: function (S) { stat(S, 'health', -4); stat(S, 'happy', -6); return '🩺 The internet diagnosed four rare diseases and prescribed cinnamon. Blood pressure: unchanged. Anxiety: +40.'; } }
      ] },
    { w: 1, ok: function (S) { return S.age < 18; }, title: '🏆 Science fair',
      text: 'The science fair. Your volcano is ready. Your rival\'s robot is... also ready. Suspiciously ready.',
      choices: [
        { label: 'Play fair', run: function (S) { stat(S, 'smarts', 6); stat(S, 'happy', 6); karma(S, 2); return '🏆 Won with the volcano. A classic. An icon. The baking soda industry thanks you.'; } },
        { label: 'Sabotage the robot', run: function (S) { if (chance(0.6)) { stat(S, 'happy', 8); karma(S, -10); return '🏆 "Borrowed" a wire from the robot. It now only spins in circles. Like your moral compass.'; } stat(S, 'happy', -10); karma(S, -6); return '🏆 Caught sabotaging the robot. Disqualified. The robot won. The robot sends its regards.'; } },
        { label: 'Aim the volcano AT the judges', run: function (S) { stat(S, 'happy', 10); karma(S, -6); stat(S, 'smarts', -2); return '🏆 Aimed the volcano at the judges. Disqualified. Legendary. The trophy was never the point. (The trophy was the point.)'; } }
      ] },
    { w: 1, ok: function (S) { return S.age < 18; }, title: '😢 Crush rejection',
      text: 'Rejected by your crush via read receipt. 2:47pm. Brutal efficiency.',
      choices: [
        { label: 'Cry it out', run: function (S) { stat(S, 'happy', -6); return '😢 Cried to sad songs. The playlist was immaculate. The healing: in progress.'; } },
        { label: 'Play it cool', run: function (S) { stat(S, 'happy', -2); stat(S, 'looks', 2); return '😢 Played it cool. Nobody believed you. You believed you, and that\'s growth.'; } },
        { label: 'Write a diss track', run: function (S) { if (chance(0.4)) { stat(S, 'happy', 8); S.fame = clamp(S.fame + 2, 0, 100); return '😢 The diss track has 12 views. All 12 are your crush. Checkmate.'; } stat(S, 'happy', -8); return '😢 The diss track flopped. Your crush made a response track. It\'s better. This is rock bottom with a beat.'; } }
      ] },
    { w: 1, ok: function (S) { return S.age >= 21; }, title: '🍻 Legendary night out',
      text: 'A night out that will be spoken of in legend. And in group chats. Mostly in group chats.',
      choices: [
        { label: 'Pace yourself', run: function (S) { stat(S, 'happy', 8); stat(S, 'health', -2); return '🍻 Paced yourself. Remembered the whole night. Slightly disappointed by how normal it was.'; } },
        { label: 'Full send', run: function (S) { stat(S, 'happy', 14); stat(S, 'health', -8); return '🍻 Full send. Woke up with a traffic cone, a new friend named Big Mike, and no memory of either.'; } },
        { label: 'Karaoke. Obviously.', run: function (S) { stat(S, 'happy', 12); karma(S, -2); return '🍻 Did eleven minutes of karaoke. The bar now has a "no you specifically" policy.'; } }
      ] },
    { w: 1, ok: function (S) { return S.age >= 30; }, title: '🪞 Gray hair',
      text: 'Found a gray hair. Plucked it. Two grew back out of spite.',
      choices: [
        { label: 'Embrace it', run: function (S) { stat(S, 'happy', 4); stat(S, 'looks', 2); return '🪞 Embracing the silver. Distinguished. Like a fox. A tired fox.'; } },
        { label: 'Dye it', run: function (S) { S.money -= 80; stat(S, 'looks', 4); return '🪞 Dyed it. The box said "natural black." The mirror says "liar."'; } },
        { label: 'Shave it ALL off', run: function (S) { stat(S, 'looks', -6); stat(S, 'happy', 6); return '🪞 Shaved everything. Bold. The head shape: a surprise to everyone, mostly you.'; } }
      ] },
    { w: 1, ok: function (S) { return true; }, title: '🐶 Stray dog',
      text: 'A stray dog has chosen you. You didn\'t find a dog; a dog found staff.',
      choices: [
        { label: 'Adopt it', run: function (S) { stat(S, 'happy', 10); S.money -= 1200; karma(S, 4); return '🐶 Adopted. Named it Biscuit. Biscuit has separation anxiety and your whole heart.'; } },
        { label: 'Take it to a shelter', run: function (S) { karma(S, 6); stat(S, 'happy', 2); return '🐶 Took it to a no-kill shelter. Cried in the parking lot. A good cry.'; } },
        { label: 'Teach it to fetch wallets', run: function (S) { karma(S, -2); if (chance(0.4)) { S.money += 300; return '🐶 Trained Biscuit to fetch wallets. He found $300 on the ground. The neighbors are "concerned."'; } stat(S, 'happy', -4); return '🐶 Trained Biscuit to fetch wallets. He fetches EVERYONE\'S wallet. There have been complaints.'; } }
      ] },
    { w: 2, ok: function (S) { return S.fame >= 30; }, title: '📱 Viral clip',
      text: function (S) { var g = ri(90000) + 10000; return 'A clip of you went viral overnight: +' + fmtN(g) + ' followers. Your DMs are a crime scene.'; },
      choices: [
        { label: 'Ride the wave', run: function (S) { var g = ri(90000) + 10000; S.followers += g; S.fame = clamp(S.fame + 4, 0, 100); stat(S, 'happy', 8); return '📱 Rode the wave: +' + fmtN(g) + ' followers. Strike while the algorithm is hot.'; } },
        { label: 'Stay mysterious', run: function (S) { S.fame = clamp(S.fame + 2, 0, 100); stat(S, 'happy', 4); karma(S, 1); return '📱 Posted nothing. Mystery is a strategy. Your manager disagrees. Your manager is poor.'; } },
        { label: 'Feud with a bigger celebrity', run: function (S) { karma(S, -6); if (chance(0.5)) { S.fame = clamp(S.fame + 10, 0, 100); var g = ri(90000) + 10000; S.followers += g * 2; return '📱 Started a feud with a bigger star. Career move. Probably. The subtweets write themselves.'; } S.fame = clamp(S.fame - 8, 0, 100); stat(S, 'happy', -10); return '📱 Feuded with a bigger star. They didn\'t notice. Their fans did. Your mentions are a war zone.'; } }
      ] },
    { w: 2, ok: function (S) { return S.fame >= 40; }, title: '📰 Tabloid photos',
      text: 'TABLOID: unflattering photos of you exist now. Your publicist is "handling it."',
      choices: [
        { label: 'Laugh it off', run: function (S) { stat(S, 'happy', -6); S.fame = clamp(S.fame - 4, 0, 100); return '📰 Laughed it off. The photos are unflattering AND accurate. That\'s the worst part.'; } },
        { label: 'Sue them', run: function (S) { S.money -= 15000; if (chance(0.5)) { S.money += 40000; S.fame = clamp(S.fame + 2, 0, 100); return '📰 Sued and won $40,000. Justice is blind but it cashes checks.'; } stat(S, 'happy', -8); return '📰 Sued and lost. The photos are now legally certified unflattering.'; } },
        { label: 'Lean into it. Sell merch.', run: function (S) { S.money += 12000; S.fame = clamp(S.fame + 4, 0, 100); karma(S, -2); return '📰 Made the bad photo your merch. It sold out. Shame is a renewable resource.'; } }
      ] },
    { w: 1, ok: function (S) { return S.fame >= 60; }, title: '🏆 Award nomination',
      text: 'Award nomination! You practiced your surprised face for weeks. It still looks like gas.',
      choices: [
        { label: 'Campaign for it', run: function (S) { if (chance(0.5)) { S.fame = clamp(S.fame + 8, 0, 100); stat(S, 'happy', 12); return '🏆 Campaigned and WON. The speech mentioned your mom, your agent, and Mercury being in retrograde.'; } S.fame = clamp(S.fame + 2, 0, 100); stat(S, 'happy', -6); return '🏆 Campaigned hard and lost. The winner thanked "everyone who believed." You believed. Rude.'; } },
        { label: 'Play it cool', run: function (S) { S.fame = clamp(S.fame + 3, 0, 100); stat(S, 'happy', 6); return '🏆 Played it cool. "It\'s an honor just to be nominated." It is not. You want the trophy.'; } },
        { label: 'Bribe a voter with a gift basket', run: function (S) { S.money -= 2000; karma(S, -8); if (chance(0.5)) { S.fame = clamp(S.fame + 10, 0, 100); return '🏆 Sent a "totally normal" gift basket to a voter. The basket had cash in it. The cash had your headshot on it. It worked.'; } S.fame = clamp(S.fame - 6, 0, 100); return '🏆 The gift basket was reported. The basket is now evidence. The evidence is delicious.'; } }
      ] },
    { w: 1, ok: function (S) { return S.fame >= 40 && !!S.partner; }, title: '📸 Paparazzi fight',
      text: function (S) { var pn = S.partner ? S.partner.name : 'your partner'; return 'Paparazzi caught you and ' + pn + ' mid-argument outside a restaurant. The headline: "LOVE ON THE ROCKS?"'; },
      choices: [
        { label: 'Stage a romantic photo op', run: function (S) { S.partner.affection = clamp(S.partner.affection + 8, 0, 100); S.fame = clamp(S.fame + 2, 0, 100); return '📸 Staged a kiss for the cameras. It worked. The argument continued in the car.'; } },
        { label: 'Ignore it', run: function (S) { S.partner.affection = clamp(S.partner.affection - 8, 0, 100); stat(S, 'happy', -6); return '📸 Ignored it. The internet has decided you\'re divorcing. The internet is very invested.'; } },
        { label: 'Argue HARDER for the cameras', run: function (S) { S.fame = clamp(S.fame + 6, 0, 100); S.partner.affection = clamp(S.partner.affection - 15, 0, 100); stat(S, 'happy', 4); return '📸 Gave them a SHOW. Ratings gold. Your relationship: content now.'; } }
      ] },
    { w: 1, ok: function (S) { return S.age >= 18; }, title: '💡 Hot stock tip',
      text: 'A "friend" tipped you a hot stock. He heard it from his cousin. His cousin heard it from a guy. The guy is in prison.',
      choices: [
        { label: 'Throw money at it', run: function (S) { var tip = ri(5000) + 1000; if (S.money < tip) { stat(S, 'happy', -2); return '💡 Wanted to YOLO but you\'re broke. The stock tripled. This one will haunt you.'; } S.money -= tip; S.stocks += tip; return '💡 Threw ' + fmt(tip) + ' at the tip. YOLO is a financial strategy if you say it confidently.'; } },
        { label: 'Politely decline', run: function (S) { stat(S, 'happy', 2); karma(S, 1); return '💡 Declined. The stock tripled. You think about this every single day now.'; } },
        { label: 'Tip HIM back with a worse stock', run: function (S) { karma(S, -4); stat(S, 'happy', 4); return '💡 Tipped him back an even worse stock. The circle of financial life. He bought in. You\'re both going down.'; } }
      ] },
    { w: 1, ok: function (S) { return !!S.business; }, title: '🏪 Huge client',
      text: function (S) { var bn = S.business ? S.business.name : 'business'; return 'Your ' + bn + ' landed a huge client! They want everything. They want it yesterday. They pay in 90 days.'; },
      choices: [
        { label: 'Take the deal', run: function (S) { var b = ri(30000) + 5000; S.money += b; stat(S, 'happy', 6); return '🏪 Took the deal: +' + fmt(b) + '. The client pays in 90 days. You\'ll believe it when you see it.'; } },
        { label: 'Negotiate harder', run: function (S) { var b = ri(30000) + 5000; if (chance(0.5)) { S.money += Math.round(b * 1.5); stat(S, 'happy', 8); return '🏪 Negotiated hard: +' + fmt(Math.round(b * 1.5)) + '. Genius. (This time.)'; } stat(S, 'happy', -6); return '🏪 Negotiated hard. They walked. Either a genius or unemployed by Friday. It\'s Friday.'; } },
        { label: 'Outsource it all, take a vacation', run: function (S) { var b = ri(30000) + 5000; S.money += Math.round(b / 2); karma(S, -4); stat(S, 'happy', 10); return '🏪 Outsourced everything, took a vacation. The client never knew. Your conscience knows. Your conscience is on a beach.'; } }
      ] },
    { w: 1, ok: function (S) { return S.age >= 30; }, title: '🤕 Sneezing injury',
      text: 'Threw your back out sneezing. The sneeze was a 4/10. The injury is a 9/10. The body keeps score.',
      choices: [
        { label: 'Rest', run: function (S) { stat(S, 'health', -10); stat(S, 'happy', -2); return '🤕 Bed rest. You sneezed like a Victorian child and paid like a daredevil.'; } },
        { label: 'Chiropractor ($300)', run: function (S) { S.money -= 300; stat(S, 'health', 4); stat(S, 'happy', -2); return '🤕 The chiropractor cracked things you didn\'t know could crack. 12% taller, 100% poorer.'; } },
        { label: 'Sneeze AGAIN to "reset" it', run: function (S) { if (chance(0.3)) { stat(S, 'health', 8); return '🤕 Sneezed it back into place. Science: 0. You: somehow still here.'; } stat(S, 'health', -12); return '🤕 Tried to sneeze it back into place. It did not go back into place.'; } }
      ] },
    { w: 1, ok: function (S) { return S.age >= 50; }, title: '🦷 Root canal',
      text: 'Root canal. The dentist said "you might feel pressure." The pressure was existential.',
      choices: [
        { label: 'Get it done ($1,200)', run: function (S) { S.money -= 1200; stat(S, 'health', 4); stat(S, 'happy', -4); return '🦷 Root canal done. You now understand true fear. And true bills.'; } },
        { label: 'Tough it out', run: function (S) { stat(S, 'health', -10); stat(S, 'happy', -4); return '🦷 Toughed it out. Your tooth has declared independence. Negotiations are ongoing.'; } },
        { label: 'Ask for the laughing gas "for fun"', run: function (S) { S.money -= 1200; stat(S, 'happy', 10); stat(S, 'health', -4); return '🦷 Requested extra laughing gas. You laughed. Then you cried. Then you tipped 40%.'; } }
      ] },
    { w: 1, ok: function (S) { return S.kids.length > 0; }, title: '🧒 "School supplies"',
      text: function (S) { var m = ri(2000) + 500; return 'Your kid "borrowed" ' + fmt(m) + ' for "school supplies." The supplies were V-Bucks.'; },
      choices: [
        { label: 'Let it slide', run: function (S) { var m = ri(2000) + 500; S.money -= m; stat(S, 'happy', 2); return '🧒 Let it slide. The "school supplies" were digital. Parenting in the modern age.'; } },
        { label: 'Make them earn it back', run: function (S) { stat(S, 'happy', 4); karma(S, 2); return '🧒 Assigned chores at minimum wage. They unionized by dinner.'; } },
        { label: 'Charge interest', run: function (S) { var m = ri(2000) + 500; S.money += Math.round(m * 0.1); karma(S, -6); stat(S, 'happy', 4); return '🧒 Charged 10% interest. Teaching financial literacy AND fear. Mostly fear.'; } }
      ] },
    { w: 1, ok: function (S) { return S.kids.length > 0; }, title: '💌 Fridge art',
      text: 'Your kid made you a card that says you\'re "the best cooker." It\'s on the fridge. It\'s staying on the fridge.',
      choices: [
        { label: 'Treasure it forever', run: function (S) { stat(S, 'happy', 10); return '💌 Fridge-worthy. Museum-worthy. You\'re the best cooker alive and no one can tell you otherwise.'; } },
        { label: 'Frame it ($50)', run: function (S) { S.money -= 50; stat(S, 'happy', 12); return '💌 Spent $50 framing a crayon card. Worth every cent. The kid is insufferable about it now.'; } },
        { label: 'Grade it with red pen', run: function (S) { stat(S, 'happy', -6); karma(S, -4); return '💌 Corrected the spelling in red pen. It now says "best cooker (sic)." You monster.'; } }
      ] },
    { w: 1, ok: function (S) { return S.crimes > 0 && S.jail === 0; }, title: '👀 Recognized',
      text: 'Pretty sure that cop recognized you at the grocery store. You\'ve been taking the long way home for a month.',
      choices: [
        { label: 'Lay low', run: function (S) { stat(S, 'happy', -4); return '👀 Laying low. Buying groceries at 2am like a raccoon with anxiety.'; } },
        { label: '"Vacation" out of town', run: function (S) { S.money -= 1500; stat(S, 'happy', 2); return '👀 "Vacation." The cop waved at you yesterday. It might have been friendly. It was not friendly.'; } },
        { label: 'Befriend the cop', run: function (S) { if (chance(0.5)) { karma(S, 4); stat(S, 'happy', 6); return '👀 Befriended the cop. Poker nights now. He\'s great. He still asks about "that night."'; } karma(S, -2); stat(S, 'happy', -8); return '👀 Tried to befriend the cop. He took notes. Literal notes. In a little book.'; } }
      ] },
    { w: 1, ok: function (S) { return S.jail > 0; }, title: '📚 Prison book club',
      text: 'Joined the prison book club. This month: a 900-page Russian novel. The discussions are intense. So is everything here.',
      choices: [
        { label: 'Actually read it', run: function (S) { stat(S, 'smarts', 6); stat(S, 'happy', 4); return '📚 Read all 900 pages. You have thoughts about suffering now. So does everyone here.'; } },
        { label: 'Fake it', run: function (S) { if (chance(0.5)) { stat(S, 'happy', 4); return '📚 Faked having read it. Fooled everyone except Big Tony. Big Tony read it.'; } stat(S, 'happy', -6); return '📚 Faked it. Big Tony called you out. Big Tony does not forgive.'; } },
        { label: 'Start a RIVAL book club', run: function (S) { stat(S, 'happy', 8); karma(S, -2); return '📚 Started a rival book club. Manga only. The schism has divided the cell block.'; } }
      ] },
    { w: 1, ok: function (S) { return !!S.job; }, title: '📧 "Quick sync"',
      text: 'Your boss scheduled a meeting titled "quick sync." It was neither quick nor a sync.',
      choices: [
        { label: 'Endure it', run: function (S) { stat(S, 'happy', -4); S.job.perf = clamp(S.job.perf + 4, 0, 100); return '📧 Endured 47 minutes about synergy. Your soul left at minute 12. Your body stayed for the donuts.'; } },
        { label: 'Multitask through it', run: function (S) { S.job.perf = clamp(S.job.perf - 4, 0, 100); stat(S, 'happy', 2); return '📧 Answered emails during the meeting about emails. Efficiency. Your camera was on. You were not blinking.'; } },
        { label: 'Pitch YOUR idea instead', run: function (S) { if (chance(0.4)) { S.job.perf = clamp(S.job.perf + 15, 0, 100); stat(S, 'happy', 8); return '📧 Hijacked the sync with your own pitch. Bold. The boss blinked. Dave slow-clapped.'; } S.job.perf = clamp(S.job.perf - 10, 0, 100); return '📧 Hijacked the sync. The room went silent. Dave stopped slow-clapping.'; } }
      ] },
    { w: 1, ok: function (S) { return !!S.job && S.job.perf > 70; }, title: '🎁 Year-end bonus',
      text: function (S) { var sal = S.job ? S.job.sal : 50000; var b = Math.round(sal * 0.15); return 'Year-end bonus: ' + fmt(b) + '! You earned every cent. (The company earned more, but still.)'; },
      choices: [
        { label: 'Save it', run: function (S) { var b = Math.round(S.job.sal * 0.15); S.money += b; stat(S, 'happy', 4); return '🎁 Saved the bonus. Responsible. Boring. Your future self high-fives you.'; } },
        { label: 'Splurge', run: function (S) { var b = Math.round(S.job.sal * 0.15); S.money += Math.round(b * 0.4); stat(S, 'happy', 12); return '🎁 Spent most of it on something shiny. The dopamine: immediate. The regret: scheduled.'; } },
        { label: 'Gift it back to your boss', run: function (S) { karma(S, 6); S.job.perf = clamp(S.job.perf + 10, 0, 100); stat(S, 'happy', 6); return '🎁 Gifted the bonus BACK to your boss. Power move. They\'re confused. You\'re promoted in spirit.'; } }
      ] },
    /* ---- NEW v3 events ---- */
    { w: 2, ok: function (S) { return S.age >= 6 && S.age <= 22; }, title: '📝 The wandering eyes',
      text: 'The kid next to you is openly copying your test. The teacher is grading papers. Justice is a choice.',
      choices: [
        { label: 'Let them copy', run: function (S) { karma(S, 3); stat(S, 'happy', 2); return '📝 Let them copy. They got a B. You got a B. Socialism, but for grades.'; } },
        { label: 'Cover your answers', run: function (S) { karma(S, 1); stat(S, 'happy', -2); return '📝 Covered your answers. They failed. You feel weird about it. That\'s called a conscience.'; } },
        { label: 'Copy THEIR answers instead', run: function (S) { karma(S, -4); if (chance(0.5)) { stat(S, 'smarts', 2); stat(S, 'happy', 4); return '📝 Copied THEIR answers. Bold reversal. Their answers were better. You\'re welcome, everyone.'; } stat(S, 'smarts', -2); return '📝 Copied THEIR answers. Their answers were wrong. You failed together. Beautiful.'; } }
      ] },
    { w: 2, cooldown: 4, ok: function (S) { return S.age >= 6 && S.age < 18; }, title: '🍎 Teacher\'s pet',
      text: 'Ms. Alvarez asked who wants to be class helper. It comes with a shiny badge and the quiet resentment of your peers.',
      choices: [
        { label: 'Volunteer', run: function (S) { stat(S, 'smarts', 4); stat(S, 'happy', -4); return '🍎 Became class helper. The badge is shiny. Your social life is not.'; } },
        { label: 'Stay seated', run: function (S) { stat(S, 'happy', 2); return '🍎 Stayed seated. Cool points: intact. Badge: someone else\'s problem.'; } },
        { label: 'Volunteer AND tattle on everyone', run: function (S) { stat(S, 'smarts', 6); karma(S, -8); stat(S, 'happy', -6); return '🍎 Volunteered, then tattled on the whole class. The badge is now a target.'; } }
      ] },
    { w: 2, ok: function (S) { return S.age >= 18; }, title: '💒 Friend\'s wedding',
      text: 'Your friend is getting married! The invitation says "plus one." You are currently plus zero.',
      choices: [
        { label: 'Go solo and mingle', run: function (S) { stat(S, 'happy', 8); return '💒 Went solo. Caught the bouquet. It\'s decorative now. The DJ played your song. You have no song.'; } },
        { label: 'Bring a date ($300)', run: function (S) { S.money -= 300; stat(S, 'happy', 10); return '💒 Brought a date. They cried during the vows. You\'ve known them six days. Weddings are powerful.'; } },
        { label: 'Object during the ceremony', run: function (S) { karma(S, -12); stat(S, 'happy', 6); return '💒 Objected "as a joke." It was not taken as a joke. You are no longer invited to anything. Ever.'; } }
      ] },
    { w: 2, ok: function (S) { return S.age >= 35; }, title: '🏎️ Midlife crisis',
      text: function (S) { return 'You\'re ' + S.age + '. A red convertible just winked at you from the dealership lot. This is a medical event.'; },
      choices: [
        { label: 'Buy it ($45,000)', run: function (S) { S.money -= 45000; stat(S, 'happy', 15); karma(S, -2); return '🏎️ Bought the convertible. Your back hurts getting in. Your soul soars getting out. Worth it.'; } },
        { label: 'Be sensible', run: function (S) { stat(S, 'happy', -6); karma(S, 2); return '🏎️ Walked away. Sensible. Your 401k thanks you. Your inner 17-year-old does not.'; } },
        { label: 'Rent it for ONE weekend', run: function (S) { S.money -= 1200; stat(S, 'happy', 12); return '🏎️ Rented it for a weekend. Drove nowhere fast. Felt everything. Returned it Monday. Cried a little.'; } }
      ] },
    { w: 2, ok: function (S) { return S.age >= 10; }, title: '👻 Haunted house',
      text: 'The old house on your street is for sale. CHEAP. The listing says "as-is." The neighbors say "don\'t."',
      choices: [
        { label: 'Buy it ($90,000)', run: function (S) { S.money -= 90000; S.houses.push({ t: 'Haunted House', value: 90000 }); stat(S, 'happy', 8); if (chance(0.3)) { stat(S, 'health', -6); stat(S, 'happy', -4); return '👻 Bought the haunted house. Something touched your foot at 3am. It pays no rent but the hallway ambience is great.'; } return '👻 Bought the haunted house. Quiet so far. Suspiciously quiet. Great investment, probably.'; } },
        { label: 'Pass', run: function (S) { stat(S, 'happy', -2); return '👻 Passed. Someone else bought it. They seem happy. They seem TOO happy.'; } },
        { label: 'Spend the night there first', run: function (S) { if (chance(0.4)) { stat(S, 'happy', 10); return '👻 Slept over. Nothing happened. Best story at parties for a year.'; } stat(S, 'health', -8); stat(S, 'happy', -6); return '👻 Slept over. Something touched your foot at 3am. It might have been a draft. It was not a draft.'; } }
      ] },
    { w: 2, ok: function (S) { return S.age >= 18; }, title: '🔺 Soap opportunity',
      text: 'Your cousin\'s friend wants to tell you about an "amazing business opportunity." It involves buying soap. A LOT of soap.',
      choices: [
        { label: 'Buy in ($2,000)', run: function (S) { S.money -= 2000; if (chance(0.25)) { S.money += 6000; stat(S, 'happy', 8); return '🔺 Bought the soap. Recruited two friends. You\'re "management" now. The soap pyramid stands.'; } stat(S, 'happy', -6); return '🔺 Bought the soap. You now own 400 bars of "Mystic Lavender." Your shower has never been so stocked.'; } },
        { label: 'Decline politely', run: function (S) { stat(S, 'happy', 2); karma(S, 1); return '🔺 Declined. He called you "negative." You\'re still friends. He\'s still selling soap.'; } },
        { label: 'Recruit HIM into YOUR scheme', run: function (S) { karma(S, -8); if (chance(0.4)) { S.money += 3000; return '🔺 Pitched him YOUR "opportunity" (bottled air). He bought in. You feel terrible. You feel rich. Both.'; } stat(S, 'happy', -6); return '🔺 Pitched him your bottled-air scheme. He saw through it. He\'s telling everyone. The soap people are laughing.'; } }
      ] },
    { w: 2, ok: function (S) { return S.age >= 13; }, title: '💃 Viral dance',
      text: 'A dance challenge is sweeping the internet. It involves a hat, a chair, and poor decisions. Your followers are watching.',
      choices: [
        { label: 'Post your attempt', run: function (S) { var g = Math.round(rf(500, 5000) * (1 + S.looks / 50)); S.followers += g; stat(S, 'happy', 8); return '💃 Posted the dance: +' + fmtN(g) + ' followers. Your knees filed for retirement.'; } },
        { label: 'Sit this one out', run: function (S) { stat(S, 'happy', -2); return '💃 Sat it out. Dignity: intact. Relevance: questionable.'; } },
        { label: 'Do it in a mascot costume', run: function (S) { karma(S, -1); if (chance(0.3)) { var g = Math.round(rf(5000, 20000)); S.followers += g; S.fame = clamp(S.fame + 3, 0, 100); stat(S, 'happy', 10); return '💃 Mascot costume. +' + fmtN(g) + ' followers. Iconic. The internet has decided.'; } S.followers += 100; stat(S, 'happy', -8); return '💃 Mascot costume. 100 followers. The costume smelled like 2009. The internet has decided otherwise.'; } }
      ] },
    { w: 1, ok: function (S) { return S.age >= 18; }, title: '⚖️ Jury duty',
      text: 'Jury duty summons. The case: a man who allegedly stole 400 garden gnomes. This is real. This is your civic duty.',
      choices: [
        { label: 'Serve proudly', run: function (S) { karma(S, 6); stat(S, 'happy', -4); return '⚖️ Served. Deliberated six hours over gnomes. Justice was served. The gnomes were returned. Democracy works.'; } },
        { label: 'Try to get dismissed', run: function (S) { if (chance(0.6)) { stat(S, 'happy', 4); return '⚖️ Claimed a deep bias against gnomes. Dismissed. The system works.'; } karma(S, -2); stat(S, 'happy', -6); return '⚖️ Tried to get dismissed. The judge saw through you. You now know 400 gnomes intimately.'; } },
        { label: 'Hang the jury for fun', run: function (S) { karma(S, -10); stat(S, 'happy', 8); return '⚖️ Hung the jury "on principle." The principle was chaos. The gnomes remain in legal limbo.'; } }
      ] },
    { w: 2, ok: function (S) { return S.age >= 8; }, title: '👛 Lost wallet',
      text: 'You found a wallet on the bus. $420 cash inside. The ID belongs to someone named "Chip." Chip looks trustworthy in his photo.',
      choices: [
        { label: 'Turn it in', run: function (S) { karma(S, 8); stat(S, 'happy', 6); return '👛 Turned it in. Chip cried. You felt like a movie character. A good one.'; } },
        { label: 'Keep the cash, ditch the wallet', run: function (S) { S.money += 420; karma(S, -10); return '👛 Kept the $420. Chip is out there, wallet-less, trusting no one. You bought shoes. The shoes judge you.'; } },
        { label: 'Track down Chip, demand a reward', run: function (S) { karma(S, -6); if (chance(0.5)) { S.money += 100; return '👛 Found Chip and "suggested" a reward. He gave you $100 and a look that will haunt you.'; } stat(S, 'happy', -6); return '👛 Found Chip and demanded a reward. He called the police. The police know Chip. Everyone knows Chip.'; } }
      ] },
    { w: 2, ok: function (S) { return S.age >= 8; }, title: '🐱 Stray cat',
      text: 'A stray cat is screaming at your door at 2am. It has chosen violence and also, apparently, you.',
      choices: [
        { label: 'Adopt it', run: function (S) { stat(S, 'happy', 8); S.money -= 800; karma(S, 4); return '🐱 Adopted. Named it Chairman Meow. It screams at 2am. It is your alarm now. It is your boss now.'; } },
        { label: 'Ignore it', run: function (S) { stat(S, 'happy', -4); karma(S, -2); return '🐱 Ignored it. It screamed louder. The neighbors think you\'re running a haunted house.'; } },
        { label: 'Adopt it AND start its Instagram', run: function (S) { S.money -= 800; stat(S, 'happy', 10); if (chance(0.3)) { var g = ri(20000) + 5000; S.followers += g; return '🐱 Chairman Meow now has ' + fmtN(g) + ' followers. You have 200. The cat is the breadwinner. You manage "merch."'; } S.followers += 150; return '🐱 Started the cat\'s Instagram. 150 followers. The cat is disappointed in the algorithm.'; } }
      ] },
    { w: 2, ok: function (S) { return S.age >= 18 && S.houses.length > 0; }, title: '🏡 Neighbor feud',
      text: 'Your neighbor mows his lawn at 6am. Every Saturday. In a bathrobe. This is war.',
      choices: [
        { label: 'Talk it out like adults', run: function (S) { karma(S, 4); stat(S, 'happy', 4); return '🏡 Talked it out. He apologized. You apologized for the leaf blower incident. Peace. Suspicious, lasting peace.'; } },
        { label: 'Mow at 5:30am out of spite', run: function (S) { karma(S, -4); stat(S, 'happy', 6); return '🏡 Mowed at 5:30am. In a better bathrobe. The feud escalates. The street is entertained.'; } },
        { label: 'Build a fence. A BIG fence.', run: function (S) { S.money -= 3000; stat(S, 'happy', 8); karma(S, -2); return '🏡 Built an 8-foot fence. He built a 9-foot fence. The Cold War has excellent landscaping.'; } }
      ] },
    { w: 2, ok: function (S) { return S.age >= 25; }, title: '🎓 High school reunion',
      text: 'High school reunion invite. Everyone will be there. Everyone is lying about their job titles.',
      choices: [
        { label: 'Go and glow up', run: function (S) { S.money -= 200; stat(S, 'happy', 8); return '🎓 Went. Looked amazing. Told everyone you\'re "in tech." You work somewhere tech-adjacent. Close enough.'; } },
        { label: 'Skip it', run: function (S) { stat(S, 'happy', 2); return '🎓 Skipped. Saw the photos. Everyone looks tired. You look rested. Victory.'; } },
        { label: 'Rent a sports car for the night', run: function (S) { S.money -= 1500; stat(S, 'happy', 12); karma(S, -4); return '🎓 Rented a sports car. Told everyone it\'s yours. It is not yours. The lie was delicious. The rental fee was not.'; } }
      ] },
    { w: 2, ok: function (S) { return S.age >= 18; }, title: '🪙 Crypto cousin',
      text: 'Your cousin won\'t stop talking about "DogeElonMoonCoin." He turned $200 into $40,000. He shows you the screenshot. It might be real.',
      choices: [
        { label: 'Invest $1,000', run: function (S) { S.money -= 1000; if (chance(0.35)) { S.money += 8000; stat(S, 'happy', 10); return '🪙 Bought DogeElonMoonCoin. It mooned! You are a genius. (Do not check back in a month.)'; } stat(S, 'happy', -8); return '🪙 Bought DogeElonMoonCoin. To the moon! (The moon was a cliff.)'; } },
        { label: 'Stay away', run: function (S) { stat(S, 'happy', 2); return '🪙 Stayed away. The coin crashed. You feel smug. Smugness is free. Unlike the coin.'; } },
        { label: 'Launch your OWN coin', run: function (S) { S.money -= 500; karma(S, -6); if (chance(0.2)) { S.money += 15000; stat(S, 'happy', 12); return '🪙 Launched "PipCoin." The whitepaper was a napkin. Investors: your cousin. Somehow it worked.'; } stat(S, 'happy', -4); return '🪙 Launched "PipCoin." Market cap: vibes. Investors: your cousin. Your cousin wants his money back.'; } }
      ] }
  ];

  function pickEvent(S) {
    if (!S.seenEvents) S.seenEvents = {};
    var pool = [], tw = 0, i, e, key, last;
    for (i = 0; i < EVENTS.length; i++) {
      e = EVENTS[i];
      if (!e.ok(S)) continue;
      key = e.title;
      last = S.seenEvents[key];
      if (e.once && last != null) continue;                       // one-shot narrative events
      if (e.cooldown && last != null && (S.age - last) < e.cooldown) continue; // recurring but not yearly
      pool.push(e); tw += e.w;
    }
    if (!pool.length) return null;
    var r = R() * tw, chosen = pool[pool.length - 1];
    for (i = 0; i < pool.length; i++) { r -= pool[i].w; if (r <= 0) { chosen = pool[i]; break; } }
    S.seenEvents[chosen.title] = S.age;
    return chosen;
  }

  function deathCheck(S) {
    var p = 0.0008;
    if (S.age > 50) p += (S.age - 50) * 0.0016;
    if (S.age > 80) p += (S.age - 80) * 0.02;
    if (S.age > 100) p += (S.age - 100) * 0.08;
    p += Math.max(0, 55 - S.health) * 0.0022;
    if (S.happy <= 5 && chance(0.02)) return die(S, 'died of a broken heart');
    if (S.age >= 122) return die(S, 'died of old age at 122 — an absolute legend');
    if (chance(Math.min(p, 0.85))) {
      var causes = S.age > 70 ? ['died of old age', 'died peacefully in their sleep', 'died of heart failure']
        : ['died in a freak llama incident', 'died of an embarrassingly preventable illness', 'died in a car crash'];
      die(S, pick(causes));
    }
  }

  function die(S, cause) {
    S.alive = false;
    S.deathCause = cause;
    var scd = SCENARIOS.filter(function (x) { return x.id === S.scenario; })[0];
    S.won = !!(scd.check && scd.check(S));
    S.ribbon = awardRibbon(S);
    var w = netWorth(S);
    log(S, '⚰️ ' + S.name + ' ' + cause + ' at age ' + S.age + '.');
    if (S.willWritten && S.kids.length) log(S, '📜 Per the will, ' + S.kids[0].name + ' inherits ' + fmt(w) + '.');
    if (S.won) log(S, '🏆 SCENARIO COMPLETE: ' + scd.name + '!');
  }

  function dailyComplete(S) {
    if (!S.daily || !S.daily.objs || !S.daily.objs.length) return false;
    for (var i = 0; i < S.daily.objs.length; i++) {
      if (!S.dailyFlags[S.daily.objs[i].id]) return false;
    }
    return true;
  }

  function awardRibbon(S) {
    var w = netWorth(S);
    if (S.won) return { e: '🏆', t: 'Living Legend', d: 'Beat the scenario. Immortality: achieved.' };
    if (S.karma >= 85) return { e: '😇', t: 'Saint', d: 'A genuinely good person. Suspiciously good, honestly.' };
    if (S.karma <= 15) return { e: '😈', t: 'Menace', d: 'The universe kept receipts. All of them.' };
    if (w >= 5000000) return { e: '💰', t: 'Loaded', d: 'Died worth over $5M. Money tried its best.' };
    if (w >= 1000000) return { e: '💵', t: 'Rich', d: 'Seven figures. The grind paid off.' };
    if (S.jailTotal >= 5 || S.crimes >= 8) return { e: '🔫', t: 'Kingpin', d: 'Crime paid. Then it collected.' };
    if (S.escaped >= 1) return { e: '🕳️', t: 'Escape Artist', d: 'Broke out of prison. Houdini nods approvingly.' };
    if (dailyComplete(S)) return { e: '📅', t: 'Daily Grinder', d: 'Finished all 4 daily objectives. Discipline: alarming.' };
    if (S.fame >= 80) return { e: '🌟', t: 'Superstar', d: 'Famous enough to be recognized in airports.' };
    if (S.followers >= 1000000) return { e: '📱', t: 'Influencer', d: fmtN(S.followers) + ' followers. Touch grass? Never met her.' };
    if (S.business && S.business.value >= 1000000) return { e: '🏢', t: 'Tycoon', d: 'Built a business empire from nothing.' };
    if (S.kids.length >= 4) return { e: '👪', t: 'Fertile', d: S.kids.length + ' kids. The minivan has seen things.' };
    if (S.partnersTotal >= 5) return { e: '💔', t: 'Heartbreaker', d: S.partnersTotal + ' partners. Emotionally unavailable, physically present.' };
    if (S.age >= 100) return { e: '🎂', t: 'Centenarian', d: 'A century of life. Saw it all, forgot half.' };
    if (S.edu === 3 && S.smarts >= 85) return { e: '🎓', t: 'Scholar', d: 'Graduate school. Genius smarts. Student debt: also genius.' };
    if (S.looks >= 90) return { e: '✨', t: 'Heartthrob', d: 'Devastatingly good looking to the very end.' };
    if (S.donated >= 100000) return { e: '🕊️', t: 'Philanthropist', d: 'Gave away ' + fmt(S.donated) + '. A genuinely good one.' };
    if (S.vacations >= 5) return { e: '🧳', t: 'Globetrotter', d: S.vacations + ' vacations. Passport: exhausted.' };
    if (S.age < 35) return { e: '🪦', t: 'Gone Too Soon', d: 'A short life, but the group chat will never forget.' };
    if (!S.everWorked && w < 5000) return { e: '🛋️', t: 'Couch Potato', d: 'Never worked a day. The couch has a permanent dent.' };
    if (S.happy >= 85) return { e: '😊', t: 'Joyful', d: 'Genuinely happy. The real high score.' };
    return { e: '😐', t: 'Mediocre', d: 'A perfectly average life. The bar was low; it was met.' };
  }

  function tombstone(S) {
    var w = netWorth(S);
    return {
      ribbon: S.ribbon || awardRibbon(S),
      cause: S.deathCause,
      age: S.age,
      worth: w,
      career: S.job ? S.job.t : (S.age >= 65 ? 'Retired' : 'Unemployed'),
      edu: EDU_NAMES[S.edu],
      kids: S.kids.length,
      lovers: S.partnersTotal,
      crimes: S.crimes,
      prison: S.jailTotal,
      happy: S.happy,
      karmaV: karmaVerdict(S)
    };
  }

  function localObit(S) {
    var t = tombstone(S);
    var w = fmt(t.worth);
    var kidBit = t.kids === 0 ? 'no kids' : (t.kids === 1 ? 'one kid' : t.kids + ' kids');
    var loverBit = t.lovers === 0 ? 'nobody special' : (t.lovers === 1 ? 'one great love' : t.lovers + ' exes');
    var cause = (S.deathCause || 'died').replace(/^died /, '');
    var v = t.karmaV.charAt(0).toLowerCase() + t.karmaV.slice(1);
    return pick([
      S.name + ' lived ' + t.age + ' years as a ' + t.career.toLowerCase() + ', ' + cause + ', leaving behind ' + w + ', ' + kidBit + ', and ' + loverBit + ' to remember them. Moral verdict: ' + v + '.',
      S.name + ', ' + t.age + ', ' + cause + '. They die a ' + t.ribbon.t + ' (' + t.ribbon.e + '), worth ' + w + ', survived by ' + kidBit + ' and a karma score the universe described as "' + v + '."',
      'Here lies ' + S.name + ': ' + t.edu.toLowerCase() + ', ' + t.career.toLowerCase() + ', ' + t.crimes + ' crimes, ' + t.prison + ' years in prison, ' + w + ' to their name. ' + S.name.split(' ')[0] + ' ' + cause + ' at ' + t.age + '. The universe has closed the tab.'
    ]);
  }

  /* ---------------- actions ---------------- */
  function need(S, minAge) {
    if (!S.alive) return 'You are dead.';
    if (S.jail > 0) return 'You are in prison.';
    if (S.age < minAge) return 'Come back at age ' + minAge + '.';
    return null;
  }

  var A = {};
  A.study = function (S) {
    var e = need(S, 6); if (e) return { ok: false, msg: e };
    stat(S, 'smarts', ri(6) + 4); stat(S, 'happy', -3);
    log(S, '📖 Hit the books. The mitochondria is the powerhouse of the cell.');
    return { ok: true };
  };
  A.gym = function (S) {
    var e = need(S, 10); if (e) return { ok: false, msg: e };
    stat(S, 'health', ri(6) + 4); stat(S, 'looks', ri(4) + 1); stat(S, 'happy', 2);
    log(S, '🏋️ Gym session. Leg day was a mistake.');
    return { ok: true };
  };
  A.library = function (S) {
    var e = need(S, 8); if (e) return { ok: false, msg: e };
    stat(S, 'smarts', ri(5) + 3); stat(S, 'happy', 1);
    log(S, '📚 Library afternoon. Shushed a stranger. Felt powerful.');
    return { ok: true };
  };
  A.doctor = function (S) {
    var e = need(S, 0); if (e) return { ok: false, msg: e };
    if (S.money < 200 && S.age >= 18) return { ok: false, msg: 'Doctor costs $200.' };
    if (S.age >= 18) S.money -= 200;
    stat(S, 'health', ri(10) + 8);
    log(S, '🩺 Checkup. "You\'re fine. Stop googling symptoms."');
    return { ok: true };
  };
  A.meditate = function (S) {
    var e = need(S, 8); if (e) return { ok: false, msg: e };
    stat(S, 'happy', ri(8) + 5);
    log(S, '🧘 Meditated. Achieved inner peace for 40 seconds.');
    return { ok: true };
  };
  A.reflect = function (S) {
    var e = need(S, 12); if (e) return { ok: false, msg: e };
    var v = karmaVerdict(S);
    log(S, '🧘 You reflect on your life choices. The universe has notes.');
    log(S, '🧘 Karma revealed: ' + S.karma + ' — ' + v + '.');
    return { ok: true, karma: S.karma, verdict: v };
  };
  A.pray = function (S, blessing) {
    var e = need(S, 0); if (e) return { ok: false, msg: e };
    if (S.prayedYear === S.age) return { ok: false, msg: 'Already prayed this year.' };
    S.prayedYear = S.age;
    if (chance(0.10)) {
      log(S, '🙏 You pray to Pip. Pip is on lunch break. Nothing happens.');
      return { ok: true, whiff: true };
    }
    if (blessing === 'health') {
      stat(S, 'health', 8);
      log(S, '🙏 You pray to Pip for health. Pip bumps your cardio. The treadmill is still on you.');
    } else if (blessing === 'wealth') {
      S.money += 2500;
      log(S, '🙏 You pray to Pip for wealth. $2,500 appears. Pip\'s accountant will have questions.');
    } else if (blessing === 'love') {
      stat(S, 'happy', 8);
      if (S.partner) S.partner.affection = clamp(S.partner.affection + 8, 0, 100);
      log(S, '🙏 You pray to Pip for love. Somewhere, a stranger thinks about texting you.');
    } else {
      stat(S, 'happy', 2);
      log(S, '🙏 You pray to Pip for "' + blessing + '." Pip squints. That\'s not on the menu.');
    }
    return { ok: true };
  };
  A.salon = function (S) {
    var e = need(S, 12); if (e) return { ok: false, msg: e };
    if (S.money < 150 && S.age >= 18) return { ok: false, msg: 'Salon costs $150.' };
    if (S.age >= 18) S.money -= 150;
    stat(S, 'looks', ri(5) + 4); stat(S, 'happy', 4);
    log(S, '💇 Fresh cut. You look like money.');
    return { ok: true };
  };
  A.surgery = function (S) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (S.money < 8000) return { ok: false, msg: 'Surgery costs $8,000.' };
    S.money -= 8000;
    if (kchance(S, 0.85, true)) { stat(S, 'looks', ri(10) + 12); stat(S, 'happy', 8); log(S, '✨ Plastic surgery: flawless. The surgeon is an artist.'); }
    else { stat(S, 'looks', -10); stat(S, 'happy', -15); log(S, '✨ Plastic surgery: botched. You now look "distinctive."'); }
    return { ok: true };
  };
  A.lottery = function (S) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (S.money < 10) return { ok: false, msg: 'A ticket costs $10.' };
    S.money -= 10;
    if (kchance(S, 0.002, true)) { S.money += 1000000; stat(S, 'happy', 25); log(S, '🎰 JACKPOT! $1,000,000! You screamed in a gas station.'); }
    else if (chance(0.03)) { S.money += 1000; log(S, '🎰 Won $1,000 on a scratcher. Lunch is on you.'); }
    else { stat(S, 'happy', -2); log(S, '🎰 Lottery ticket. Donated $10 to the state.'); }
    return { ok: true };
  };
  A.vacation = function (S) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (S.money < 3000) return { ok: false, msg: 'A vacation costs $3,000.' };
    S.money -= 3000;
    S.vacations++;
    stat(S, 'happy', ri(10) + 10); stat(S, 'health', 4);
    log(S, '🏝️ ' + pick(['Beach', 'Mountain', 'Tokyo', 'Paris', 'Cruise']) + ' vacation. Out-of-office: on.');
    return { ok: true };
  };
  A.postSocial = function (S, platform) {
    var e = need(S, 13); if (e) return { ok: false, msg: e };
    var gain = Math.round(rf(10, 200) * (1 + S.looks / 25) * (1 + S.fame / 20));
    var mult = 1, why = '';
    if (platform === 'chirp') { mult = rf(0.5, 3.0); why = 'Chirp ate up the controversy.'; }
    else if (platform === 'glam') { mult = (S.looks >= 70 ? 2.2 : 0.8); why = S.looks >= 70 ? 'GlamGram loves a face like yours.' : 'GlamGram was unimpressed.'; }
    else if (platform === 'tok') { mult = chance(0.12) ? 12 : 0.6; why = 'TokTick: the viral lottery.'; }
    gain = Math.round(gain * mult);
    if (chance(0.06)) { gain *= 20; log(S, '📱 MEGA-VIRAL on ' + (platform || 'social') + '! +' + fmtN(gain) + ' followers. Your phone is melting.'); }
    else log(S, '📱 Posted on ' + (platform || 'social') + '. +' + fmtN(gain) + ' followers. ' + why);
    S.followers += gain;
    S.fame = clamp(S.fame + (gain > 5000 ? 3 : 1), 0, 100);
    stat(S, 'happy', 3);
    S.platform = platform || null;
    return { ok: true };
  };
  A.interview = function (S) {
    var e = need(S, 16); if (e) return { ok: false, msg: e };
    if (S.fame < 20) return { ok: false, msg: 'Nobody cares yet. Get famous first.' };
    S.fame = clamp(S.fame + ri(4) + 2, 0, 100);
    var pay = Math.round(S.fame * 500);
    S.money += pay;
    log(S, '🎤 ' + pick(['Talk show', 'Podcast', 'Magazine']) + ' interview. +' + fmt(pay) + '. You were "so real."');
    return { ok: true };
  };

  A.goUniversity = function (S) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (S.edu >= 2 || S.studying) return { ok: false, msg: 'Already in school.' };
    if (S.money < 40000) return { ok: false, msg: 'Tuition is $40,000.' };
    S.money -= 40000;
    S.studying = { type: 'uni', years: 4 };
    log(S, '🎓 Enrolled in university. Four years of ramen begin.');
    return { ok: true };
  };
  A.goGrad = function (S) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (S.edu < 2 || S.studying) return { ok: false, msg: 'Need a university degree first.' };
    if (S.money < 60000) return { ok: false, msg: 'Grad school is $60,000.' };
    S.money -= 60000;
    S.studying = { type: 'grad', years: 2 };
    log(S, '🎓 Started graduate school. Sleep is now theoretical.');
    return { ok: true };
  };

  function meetsReq(S, req) {
    if ((req.edu || 0) > S.edu) return 'Requires ' + EDU_NAMES[req.edu] + '.';
    if ((req.smarts || 0) > S.smarts) return 'Requires ' + req.smarts + ' smarts.';
    if ((req.looks || 0) > S.looks) return 'Requires ' + req.looks + ' looks.';
    if ((req.health || 0) > S.health) return 'Requires ' + req.health + ' health.';
    return null;
  }
  A.jobList = function (S) {
    return JOBS.map(function (j, i) {
      return { i: i, t: j.t, sal: j.sal, fame: !!j.fame, lock: S.age < 18 ? 'Age 18+' : meetsReq(S, j.req) };
    });
  };
  A.applyJob = function (S, i) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    var j = JOBS[i];
    var lock = meetsReq(S, j.req);
    if (lock) return { ok: false, msg: lock };
    if (S.job) return { ok: false, msg: 'Quit your current job first.' };
    var odds = 0.55 + (S.smarts / 400) + (S.looks / 500);
    if (kchance(S, Math.min(odds, 0.95), true)) {
      S.job = { t: j.t, sal: j.sal, perf: 50 };
      S.everWorked = true;
      log(S, '💼 Hired as ' + j.t + ' at ' + fmt(j.sal) + '/yr! New email signature, who dis.');
      return { ok: true };
    }
    log(S, '❌ Interviewed for ' + j.t + '. They "went another direction." Rude.');
    return { ok: true, msg: 'Didn\'t get the job.' };
  };
  A.workHard = function (S) {
    if (!S.job) return { ok: false, msg: 'No job.' };
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    S.job.perf = clamp(S.job.perf + ri(8) + 6, 0, 100);
    stat(S, 'happy', -4); stat(S, 'health', -2);
    log(S, '💪 Answered emails at midnight. Hustle culture claims another.');
    return { ok: true };
  };
  A.askRaise = function (S) {
    if (!S.job) return { ok: false, msg: 'No job.' };
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (S.job.perf >= 65) {
      S.job.sal = Math.round(S.job.sal * 1.1);
      log(S, '💰 Got a 10% raise! Now ' + fmt(S.job.sal) + '/yr. Know your worth.');
    } else {
      stat(S, 'happy', -4);
      log(S, '🙄 Asked for a raise. Boss laughed, then gave you more work.');
    }
    return { ok: true };
  };
  A.quitJob = function (S) {
    if (!S.job) return { ok: false, msg: 'No job.' };
    log(S, '🚪 Quit ' + S.job.t + '. Sent a resignation email with a GIF.');
    S.job = null;
    stat(S, 'happy', 5);
    return { ok: true };
  };

  A.findLove = function (S) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (S.partner) return { ok: false, msg: 'Already taken.' };
    var g = S.gender === 'M' ? 'F' : 'M';
    S.partner = { name: fullName(g), looks: ri(61) + 20, affection: ri(30) + 40, married: false };
    S.partnersTotal++;
    stat(S, 'happy', 10);
    log(S, '💘 Started dating ' + S.partner.name + '. Butterflies. Terrible playlists.');
    return { ok: true };
  };
  A.propose = function (S) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (!S.partner) return { ok: false, msg: 'No partner.' };
    if (S.partner.married) return { ok: false, msg: 'Already married.' };
    if (S.money < 5000) return { ok: false, msg: 'A wedding costs $5,000.' };
    if (S.partner.affection >= 55 || chance(0.4)) {
      S.money -= 5000;
      S.partner.married = true;
      stat(S, 'happy', 15);
      log(S, '💍 Married ' + S.partner.name + '! The cake had three tiers. So did the drama.');
      return { ok: true };
    }
    S.partner.affection = clamp(S.partner.affection - 20, 0, 100);
    log(S, '💔 Proposed in public. Got rejected in public. Bold strategy.');
    return { ok: true };
  };
  A.haveBaby = function (S) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (!S.partner || !S.partner.married) return { ok: false, msg: 'Need to be married first.' };
    if (S.age > 50) return { ok: false, msg: 'Too late for that.' };
    var g = chance(0.5) ? 'M' : 'F';
    var baby = { name: fullName(g), age: 0 };
    S.kids.push(baby);
    stat(S, 'happy', 12);
    log(S, '👶 ' + baby.name + ' was born! Sleeps 20 minutes at a time, like a tiny CEO.');
    return { ok: true };
  };
  A.dateNight = function (S) {
    if (!S.partner) return { ok: false, msg: 'No partner.' };
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    S.partner.affection = clamp(S.partner.affection + ri(10) + 8, 0, 100);
    stat(S, 'happy', 8);
    log(S, '🌹 Date night with ' + S.partner.name + '. No phones. Well, fewer phones.');
    return { ok: true };
  };
  A.breakup = function (S) {
    if (!S.partner) return { ok: false, msg: 'No partner.' };
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (S.partner.married) {
      var split = Math.round(S.money / 2);
      S.money -= split;
      log(S, '⚖️ Divorced ' + S.partner.name + '. Lost ' + fmt(split) + '. Love is priceless; divorce is itemized.');
    } else log(S, '💔 Broke up with ' + S.partner.name + '. "It\'s not you, it\'s my attachment style."');
    stat(S, 'happy', -12);
    S.partner = null;
    return { ok: true };
  };

  A.buyHouse = function (S, i) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    var h = HOUSES[i];
    if (S.money < h.price) return { ok: false, msg: 'Need ' + fmt(h.price) + '.' };
    S.money -= h.price;
    S.houses.push({ t: h.t, value: h.price });
    stat(S, 'happy', 8);
    log(S, '🏠 Bought a ' + h.t + ' for ' + fmt(h.price) + '! Housewarming: you + pizza.');
    return { ok: true };
  };
  A.buyCar = function (S, i) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    var c = CARS[i];
    if (S.money < c.price) return { ok: false, msg: 'Need ' + fmt(c.price) + '.' };
    S.money -= c.price;
    S.cars.push({ t: c.t, value: c.price });
    stat(S, 'happy', 6);
    log(S, '🚗 Bought a ' + c.t + ' for ' + fmt(c.price) + '. New car smell: achieved.');
    return { ok: true };
  };
  A.sellHouse = function (S, i) {
    var h = S.houses[i]; if (!h) return { ok: false, msg: 'No house.' };
    S.money += h.value;
    S.houses.splice(i, 1);
    log(S, '🏠 Sold the ' + h.t + ' for ' + fmt(h.value) + '.');
    return { ok: true };
  };
  A.sellCar = function (S, i) {
    var c = S.cars[i]; if (!c) return { ok: false, msg: 'No car.' };
    S.money += c.value;
    S.cars.splice(i, 1);
    log(S, '🚗 Sold the ' + c.t + ' for ' + fmt(c.value) + '.');
    return { ok: true };
  };
  A.buyStocks = function (S, amt) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (S.money < amt) return { ok: false, msg: 'Need ' + fmt(amt) + '.' };
    S.money -= amt; S.stocks += amt;
    log(S, '📈 Invested ' + fmt(amt) + ' in stocks. To the moon (hopefully).');
    return { ok: true };
  };
  A.sellStocks = function (S) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (S.stocks < 1) return { ok: false, msg: 'No stocks to sell.' };
    var v = Math.round(S.stocks);
    S.money += v; S.stocks = 0;
    log(S, '📉 Cashed out stocks for ' + fmt(v) + '.');
    return { ok: true };
  };
  A.buyBusiness = function (S) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (S.business) return { ok: false, msg: 'Already own a business.' };
    if (S.money < 200000) return { ok: false, msg: 'A business costs $200,000.' };
    S.money -= 200000;
    S.business = { name: pick(BIZ_NAMES), value: 200000 };
    log(S, '🏪 Bought a ' + S.business.name + '! You\'re a job creator now.');
    return { ok: true };
  };
  A.sellBusiness = function (S) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (!S.business) return { ok: false, msg: 'No business.' };
    var v = S.business.value;
    S.money += v;
    log(S, '🏪 Sold ' + S.business.name + ' for ' + fmt(v) + '.');
    S.business = null;
    return { ok: true };
  };
  A.donate = function (S, amt) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (S.money < amt) return { ok: false, msg: 'Need ' + fmt(amt) + '.' };
    S.money -= amt; S.donated += amt;
    stat(S, 'happy', 6);
    karma(S, 4);
    log(S, '🕊️ Donated ' + fmt(amt) + ' to charity. Your halo is showing.');
    return { ok: true };
  };
  A.writeWill = function (S) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (S.willWritten) return { ok: false, msg: 'Will already written.' };
    S.willWritten = true;
    log(S, '📜 Wrote your will. Morbid, but responsible.');
    return { ok: true };
  };

  A.crime = function (S, i) {
    var e = need(S, 14); if (e) return { ok: false, msg: e };
    var c = CRIMES[i];
    S.crimes++;
    karma(S, -6);
    if (kchance(S, 1 - c.risk, true)) {
      var take = Math.round(c.reward * rf(0.6, 1.6));
      S.money += take;
      stat(S, 'happy', 4);
      log(S, '🕶️ ' + c.t + ': clean getaway. +' + fmt(take) + '.');
    } else {
      S.jail = c.jail; S.jailTotal += c.jail;
      stat(S, 'happy', -15);
      log(S, '🚨 Busted! ' + c.jail + ' year' + (c.jail > 1 ? 's' : '') + ' for ' + c.t.toLowerCase() + '. The getaway driver sends regards.');
    }
    return { ok: true };
  };
  A.escape = function (S, method) {
    if (!S.alive) return { ok: false, msg: 'You are dead.' };
    if (S.jail <= 0) return { ok: false, msg: 'Not in prison.' };
    var odds = { bribe: 0.4, tunnel: 0.35, riot: 0.25 }[method] || 0.3;
    var names = { bribe: 'bribed a guard', tunnel: 'dug a tunnel with a spoon', riot: 'started a riot' };
    if (method === 'bribe') {
      if (S.money < 5000) return { ok: false, msg: 'A bribe costs $5,000.' };
      S.money -= 5000;
    }
    if (chance(odds)) {
      S.jail = 0; S.escaped++;
      stat(S, 'happy', 20);
      log(S, '🕳️ ESCAPED! You ' + names[method] + ' and vanished into the night. Legend.');
    } else {
      var extra = method === 'riot' ? 3 : 1;
      S.jail += extra; S.jailTotal += extra;
      stat(S, 'happy', -10);
      log(S, '🚨 Escape failed! +' + extra + ' year' + (extra > 1 ? 's' : '') + '. The spoon has been confiscated.');
    }
    return { ok: true };
  };

  /* ---------------- AI hooks ---------------- */
  function aiState(S) {
    var kt = S.karma >= 65 ? "kind" : S.karma >= 45 ? "morally beige" : "a little rough";
    return {
      age: S.age, job: S.job ? S.job.t : null, worth: netWorth(S),
      happy: S.happy, health: S.health, smarts: S.smarts, looks: S.looks, fame: S.fame,
      partner: !!S.partner, kids: S.kids.length, scenario: S.scenario,
      country: S.country || null,
      partnerName: S.partner ? S.partner.name : null,
      crimes: S.crimes || 0,
      karmaTier: kt
    };
  }
  function applyAiChoice(S, ev, i) {
    var ch = ev && ev.choices && ev.choices[i];
    if (!ch) return null;
    ['happy', 'health', 'smarts', 'looks'].forEach(function (k) {
      if (typeof ch[k] === 'number' && isFinite(ch[k])) stat(S, k, ch[k]);
    });
    if (typeof ch.money === 'number' && isFinite(ch.money)) S.money += Math.round(ch.money);
    if (typeof ch.fame === 'number' && isFinite(ch.fame)) S.fame = clamp(S.fame + ch.fame, 0, 100);
    if (typeof ch.karma === 'number' && isFinite(ch.karma)) S.karma = clamp(S.karma + Math.round(ch.karma), 0, 100);
    var line = '✨ ' + ev.text + ' ' + ch.label;
    log(S, line);
    return line;
  }

  /* ---------------- daily objectives ---------------- */
  var DAILY_TEMPLATES = [
    { id: 'worth250k', text: '💰 Be worth $250K at any point', check: function (S) { return netWorth(S) >= 250000; } },
    { id: 'hiredJob', text: function (R) { var j = JOBS[(R() * JOBS.length) | 0]; this.job = j.t; return '💼 Get hired as a ' + j.t; }, check: function (S, o) { return !!(S.job && o && S.job.t === o.job); } },
    { id: 'crimes3', text: '🕶️ Commit 3 crimes', check: function (S) { return S.crimes >= 3; } },
    { id: 'kids2', text: '👶 Have 2 kids', check: function (S) { return S.kids.length >= 2; } },
    { id: 'fame50', text: '⭐ Reach 50 fame', check: function (S) { return S.fame >= 50; } },
    { id: 'married', text: '💍 Get married', check: function (S) { return !!(S.partner && S.partner.married); } },
    { id: 'age70', text: '🎂 Reach age 70', check: function (S) { return S.age >= 70; } },
    { id: 'house', text: '🏠 Buy a house', check: function (S) { return S.houses.length > 0; } },
    { id: 'escape', text: '🕳️ Escape from prison', check: function (S) { return S.escaped >= 1; } },
    { id: 'karma80', text: '😇 Reach 80 karma', check: function (S) { return S.karma >= 80; } },
    { id: 'business', text: '🏪 Own a business', check: function (S) { return !!S.business; } },
    { id: 'viral1m', text: '📱 Reach 1M followers', check: function (S) { return S.followers >= 1000000; } }
  ];

  function genDaily(seed) {
    var rng = mulberry32(seed);
    var pool = DAILY_TEMPLATES.slice();
    var objs = [];
    for (var i = 0; i < 4 && pool.length; i++) {
      var idx = (rng() * pool.length) | 0;
      var tpl = pool.splice(idx, 1)[0];
      var o = { id: tpl.id };
      if (typeof tpl.text === 'function') {
        var ctx = {};
        o.text = tpl.text.call(ctx, rng);
        if (ctx.job) o.job = ctx.job;
      } else {
        o.text = tpl.text;
      }
      objs.push(o);
    }
    return { seed: seed, objs: objs };
  }

  function checkDaily(S) {
    if (!S.daily || !S.daily.objs) return 0;
    var n = 0, i, j, tpl;
    for (i = 0; i < S.daily.objs.length; i++) {
      var o = S.daily.objs[i];
      if (S.dailyFlags[o.id]) continue;
      tpl = null;
      for (j = 0; j < DAILY_TEMPLATES.length; j++) if (DAILY_TEMPLATES[j].id === o.id) tpl = DAILY_TEMPLATES[j];
      if (tpl && tpl.check(S, o)) {
        S.dailyFlags[o.id] = true;
        if (S.daily.done) S.daily.done[i] = true;
        n++;
        log(S, '📅 Daily objective complete: ' + o.text);
      }
    }
    return n;
  }

  /* ---------------- mystery crates ---------------- */
  var CRATE_LABELS = { fate4: '✨ Fate Cache', cash50k: '💰 Cash Drop', stats10: '💪 Total Glow-Up', karma15: '😇 Karma Infusion' };
  var _crates = null;
  function rollCrates() {
    var order = ['fate4', 'cash50k', 'stats10', 'karma15'];
    var i, j, t;
    for (i = order.length - 1; i > 0; i--) {
      j = (R() * (i + 1)) | 0;
      t = order[i]; order[i] = order[j]; order[j] = t;
    }
    _crates = order.map(function (rw) { return { label: CRATE_LABELS[rw], reward: rw }; });
    return _crates;
  }
  function applyCrate(S, idx) {
    var c = (_crates && _crates[idx]) || { label: '🎁 Mystery Crate', reward: ['fate4', 'cash50k', 'stats10', 'karma15'][idx % 4] };
    var line;
    if (c.reward === 'fate4') {
      line = '🎁 Opened ' + c.label + ': +4 Fate Points! Spend them on your next birth, big spender. (Fate is tracked app-side.)';
    } else if (c.reward === 'cash50k') {
      S.money += 50000;
      line = '🎁 Opened ' + c.label + ': +$50,000! Money: the apology flowers of life.';
    } else if (c.reward === 'stats10') {
      stat(S, 'happy', 10); stat(S, 'health', 10); stat(S, 'smarts', 10); stat(S, 'looks', 10);
      line = '🎁 Opened ' + c.label + ': +10 to everything. You feel incredible. Suspiciously incredible.';
    } else {
      karma(S, 15);
      line = '🎁 Opened ' + c.label + ': +15 karma. The universe winks at you.';
    }
    log(S, line);
    return line;
  }

  return {
    newLife: newLife, ageUp: ageUp, die: die, netWorth: netWorth, fmt: fmt, fmtN: fmtN,
    actions: A, JOBS: JOBS, HOUSES: HOUSES, CARS: CARS, CRIMES: CRIMES,
    SCENARIOS: SCENARIOS, EDU_NAMES: EDU_NAMES, setRng: setRng,
    genDossier: genDossier, SIGNS: SIGNS,
    karma: karma, luckF: luckF, kchance: kchance, karmaVerdict: karmaVerdict,
    EVENTS: EVENTS, pickEvent: pickEvent,
    aiState: aiState, applyAiChoice: applyAiChoice,
    DAILY_TEMPLATES: DAILY_TEMPLATES, mulberry32: mulberry32,
    genDaily: genDaily, checkDaily: checkDaily,
    rollCrates: rollCrates, applyCrate: applyCrate,
    tombstone: tombstone, localObit: localObit
  };
})();
if (typeof module !== 'undefined') module.exports = LifeSim;
