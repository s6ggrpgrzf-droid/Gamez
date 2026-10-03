/* Life Story v2 — life simulator engine. Pure logic, no DOM (testable in node). */
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

  function fullName(gender) {
    var f = gender === 'F' ? pick(FEMALE) : pick(MALE);
    return f + ' ' + pick(SURNAMES);
  }

  function newLife(scenarioId, inherit) {
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
      log: []
    };
    if (sc === 'rags') { S.happy = ri(20) + 30; S.health = ri(20) + 50; S.smarts = ri(40) + 20; S.looks = ri(40) + 20; }
    if (sc === 'nepo') { S.money = 2000000; S.looks = ri(11) + 85; S.happy = ri(21) + 70; }
    if (inherit && inherit.money > 0) S.money += inherit.money;
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

    if (chance(S.age < 18 ? 0.32 : 0.40)) randomEvent(S);

    deathCheck(S);
  }

  function tickKids(S) { S.kids.forEach(function (k) { k.age++; }); }

  var EVENTS = [
    { w: 3, ok: function (S) { return true; }, run: function (S) { var f = ri(200) + 10; S.money += f; stat(S, 'happy', 4); return '🍀 Found ' + fmt(f) + ' on the sidewalk. Today, the universe provides.'; } },
    { w: 3, ok: function (S) { return S.age >= 10; }, run: function (S) { stat(S, 'health', -12); stat(S, 'happy', -6); return '🤒 Caught a flu that felt personally insulting. Bed rest.'; } },
    { w: 2, ok: function (S) { return S.age >= 16; }, run: function (S) { var c = ri(3000) + 500; S.money -= c; stat(S, 'health', -8); return '🚗 Someone "didn\'t see" your car. Repairs: ' + fmt(c) + '.'; } },
    { w: 2, ok: function (S) { return true; }, run: function (S) { stat(S, 'happy', 8); return '🎉 An old friend visited. You laughed about things you can\'t post online.'; } },
    { w: 2, ok: function (S) { return S.age >= 18; }, run: function (S) { var m = ri(900) + 100; S.money -= m; stat(S, 'happy', -8); return '🥷 Mugged by someone with excellent cardio. Lost ' + fmt(m) + '.'; } },
    { w: 2, ok: function (S) { return S.age >= 25; }, run: function (S) { var m = ri(20000) + 5000; S.money += m; stat(S, 'happy', 10); return '📜 A relative you met twice left you ' + fmt(m) + '. Grief, but make it profitable.'; } },
    { w: 2, ok: function (S) { return S.age >= 12; }, run: function (S) { stat(S, 'health', -8); return '🏋️ Pulled a muscle demonstrating a workout you saw online.'; } },
    { w: 2, ok: function (S) { return true; }, run: function (S) { stat(S, 'happy', 6); return '🌈 A stranger said you have "main character energy." You believed them.'; } },
    { w: 2, ok: function (S) { return S.age >= 8; }, run: function (S) { stat(S, 'health', -6); stat(S, 'happy', -4); return '🤢 Street tacos: 10/10 flavor, 0/10 consequences.'; } },
    { w: 2, ok: function (S) { return S.age >= 16; }, run: function (S) { var m = ri(900) + 100; S.money += m; return '📻 Won ' + fmt(m) + ' as caller number nine. Your mom is thrilled.'; } },
    { w: 2, ok: function (S) { return S.houses.length > 0; }, run: function (S) { var m = ri(4000) + 1000; S.money -= m; return '🏠 The roof is now more of a suggestion. Repairs: ' + fmt(m) + '.'; } },
    { w: 2, ok: function (S) { return !!S.partner; }, run: function (S) { S.partner.affection = clamp(S.partner.affection - 12, 0, 100); stat(S, 'happy', -6); return '🗯️ Huge fight with ' + S.partner.name + ' over how to load a dishwasher.'; } },
    { w: 2, ok: function (S) { return S.kids.length > 0; }, run: function (S) { stat(S, 'happy', 8); return '🎭 Your kid played "Tree #3" in the school play. You wept anyway.'; } },
    { w: 2, ok: function (S) { return !!S.job; }, run: function (S) { S.job.perf = clamp(S.job.perf + 12, 0, 100); return '⭐ Your boss praised you publicly. Your coworkers hate you a little now.'; } },
    { w: 1, ok: function (S) { return S.age >= 18; }, run: function (S) { var m = ri(40000) + 10000; S.money += m; stat(S, 'happy', 12); return '📈 Investments mooned. +' + fmt(m) + '. You tell everyone it was skill.'; } },
    { w: 1, ok: function (S) { return S.age >= 18 && S.money > 5000; }, run: function (S) { var m = Math.min(S.money, ri(20000) + 5000); S.money -= m; stat(S, 'happy', -10); return '📉 Market crash. -' + fmt(m) + '. Diamond hands, paper wallet.'; } },
    { w: 1, ok: function (S) { return S.age >= 40; }, run: function (S) { stat(S, 'health', -15); return '🩺 Doctor: "Your blood pressure has opinions." Prescribed kale.'; } },
    { w: 1, ok: function (S) { return S.age < 18; }, run: function (S) { stat(S, 'smarts', 6); stat(S, 'happy', 4); return '🏆 Won the science fair with a volcano. A classic. An icon.'; } },
    { w: 1, ok: function (S) { return S.age < 18; }, run: function (S) { stat(S, 'happy', -8); return '😢 Rejected by your crush via a read receipt. Brutal efficiency.'; } },
    { w: 1, ok: function (S) { return S.age >= 21; }, run: function (S) { stat(S, 'happy', 10); stat(S, 'health', -4); return '🍻 A night out that will be spoken of in legend (and group chats).'; } },
    { w: 1, ok: function (S) { return S.age >= 30; }, run: function (S) { stat(S, 'happy', -6); return '🪞 Found a gray hair. Plucked it. Two grew back out of spite.'; } },
    { w: 1, ok: function (S) { return true; }, run: function (S) { stat(S, 'happy', 5); return '🐶 A stray dog chose you. You didn\'t find a dog; a dog found staff.'; } },
    // fame & social
    { w: 2, ok: function (S) { return S.fame >= 30; }, run: function (S) { var g = ri(90000) + 10000; S.followers += g; S.fame = clamp(S.fame + 4, 0, 100); stat(S, 'happy', 8); return '📱 A clip of you went viral. +' + fmtN(g) + ' followers overnight.'; } },
    { w: 2, ok: function (S) { return S.fame >= 40; }, run: function (S) { S.fame = clamp(S.fame - 10, 0, 100); stat(S, 'happy', -12); return '📰 TABLOID: unflattering photos of you exist now. Your publicist is "handling it."'; } },
    { w: 1, ok: function (S) { return S.fame >= 60; }, run: function (S) { S.fame = clamp(S.fame + 6, 0, 100); stat(S, 'happy', 10); return '🏆 Award nomination! You practiced your surprised face for weeks.'; } },
    { w: 1, ok: function (S) { return S.fame >= 40 && !!S.partner; }, run: function (S) { S.partner.affection = clamp(S.partner.affection - 15, 0, 100); return '📸 Paparazzi caught ' + S.partner.name + ' arguing with you. Romance is dead; content is king.'; } },
    // money life
    { w: 1, ok: function (S) { return S.age >= 18; }, run: function (S) { var tip = ri(5000) + 1000; S.stocks += tip; return '💡 A "friend" tipped you a hot stock. You threw ' + fmt(tip) + ' at it. YOLO.'; } },
    { w: 1, ok: function (S) { return !!S.business; }, run: function (S) { var b = ri(30000) + 5000; S.money += b; return '🏪 ' + S.business.name + ' landed a huge client. +' + fmt(b) + '.'; } },
    // health drama
    { w: 1, ok: function (S) { return S.age >= 30; }, run: function (S) { stat(S, 'health', -18); return '🤕 Threw your back out sneezing. The body keeps score.'; } },
    { w: 1, ok: function (S) { return S.age >= 50; }, run: function (S) { stat(S, 'health', -12); stat(S, 'happy', -5); return '🦷 Root canal. You now understand true fear.'; } },
    // kid chaos
    { w: 1, ok: function (S) { return S.kids.length > 0; }, run: function (S) { var m = ri(2000) + 500; S.money -= m; stat(S, 'happy', -4); return '🧒 Your kid "borrowed" ' + fmt(m) + ' for "school supplies." Sure.'; } },
    { w: 1, ok: function (S) { return S.kids.length > 0; }, run: function (S) { stat(S, 'happy', 10); return '💌 Your kid wrote you a card that said you\'re "the best cooker." Fridge-worthy.'; } },
    // crime world
    { w: 1, ok: function (S) { return S.crimes > 0 && S.jail === 0; }, run: function (S) { stat(S, 'happy', -8); return '👀 Pretty sure that cop recognized you. You took the long way home for a month.'; } },
    { w: 1, ok: function (S) { return S.jail > 0; }, run: function (S) { stat(S, 'happy', 4); return '📚 Joined the prison book club. The discussions are intense.'; } },
    // work life
    { w: 1, ok: function (S) { return !!S.job; }, run: function (S) { stat(S, 'happy', -6); return '📧 Your boss scheduled a meeting titled "quick sync." It was neither.'; } },
    { w: 1, ok: function (S) { return !!S.job && S.job.perf > 70; }, run: function (S) { var b = Math.round(S.job.sal * 0.15); S.money += b; return '🎁 Year-end bonus: ' + fmt(b) + '. You earned every cent.'; } }
  ];

  function randomEvent(S) {
    var pool = [], tw = 0, i, e;
    for (i = 0; i < EVENTS.length; i++) { e = EVENTS[i]; if (e.ok(S)) { pool.push(e); tw += e.w; } }
    if (!pool.length) return;
    var r = R() * tw;
    for (i = 0; i < pool.length; i++) { r -= pool[i].w; if (r <= 0) { log(S, pool[i].run(S)); return; } }
    log(S, pool[pool.length - 1].run(S));
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

  function awardRibbon(S) {
    var w = netWorth(S);
    if (S.won) return { e: '🏆', t: 'Living Legend', d: 'Beat the scenario. Immortality: achieved.' };
    if (w >= 5000000) return { e: '💰', t: 'Loaded', d: 'Died worth over $5M. Money tried its best.' };
    if (w >= 1000000) return { e: '💵', t: 'Rich', d: 'Seven figures. The grind paid off.' };
    if (S.jailTotal >= 5 || S.crimes >= 8) return { e: '🔫', t: 'Kingpin', d: 'Crime paid. Then it collected.' };
    if (S.escaped >= 1) return { e: '🕳️', t: 'Escape Artist', d: 'Broke out of prison. Houdini nods approvingly.' };
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
    if (chance(0.85)) { stat(S, 'looks', ri(10) + 12); stat(S, 'happy', 8); log(S, '✨ Plastic surgery: flawless. The surgeon is an artist.'); }
    else { stat(S, 'looks', -10); stat(S, 'happy', -15); log(S, '✨ Plastic surgery: botched. You now look "distinctive."'); }
    return { ok: true };
  };
  A.lottery = function (S) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (S.money < 10) return { ok: false, msg: 'A ticket costs $10.' };
    S.money -= 10;
    var r = R();
    if (r < 0.002) { S.money += 1000000; stat(S, 'happy', 25); log(S, '🎰 JACKPOT! $1,000,000! You screamed in a gas station.'); }
    else if (r < 0.03) { S.money += 1000; log(S, '🎰 Won $1,000 on a scratcher. Lunch is on you.'); }
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
  A.postSocial = function (S) {
    var e = need(S, 13); if (e) return { ok: false, msg: e };
    var gain = Math.round(rf(10, 200) * (1 + S.looks / 25) * (1 + S.fame / 20));
    if (chance(0.06)) { gain *= 20; log(S, '📱 Your post went MEGA-viral! +' + fmtN(gain) + ' followers.'); }
    else log(S, '📱 Posted. +' + fmtN(gain) + ' followers. The algorithm smiled today.');
    S.followers += gain;
    S.fame = clamp(S.fame + (gain > 5000 ? 3 : 1), 0, 100);
    stat(S, 'happy', 3);
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
    if (chance(Math.min(odds, 0.95))) {
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
    if (chance(1 - c.risk)) {
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

  return {
    newLife: newLife, ageUp: ageUp, die: die, netWorth: netWorth, fmt: fmt, fmtN: fmtN,
    actions: A, JOBS: JOBS, HOUSES: HOUSES, CARS: CARS, CRIMES: CRIMES,
    SCENARIOS: SCENARIOS, EDU_NAMES: EDU_NAMES, setRng: setRng
  };
})();
if (typeof module !== 'undefined') module.exports = LifeSim;
