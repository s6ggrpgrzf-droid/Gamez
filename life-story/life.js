/* Life Story — life simulator engine. Pure logic, no DOM (testable in node). */
'use strict';
var LifeSim = (function () {
  var R = Math.random;
  function setRng(fn) { R = fn; }
  function ri(n) { return (R() * n) | 0; }             // 0..n-1
  function rf(a, b) { return a + R() * (b - a); }      // float a..b
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
    { t: 'Model', sal: 125000, req: { looks: 85 } },
    { t: 'Actor', sal: 155000, req: { looks: 75 } },
    { t: 'Musician', sal: 82000, req: { looks: 50 } },
    { t: 'Pro Athlete', sal: 210000, req: { health: 85 } },
    { t: 'Executive', sal: 310000, req: { edu: 3, smarts: 80 } }
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

  function fullName(gender) {
    var f = gender === 'F' ? pick(FEMALE) : pick(MALE);
    return f + ' ' + pick(SURNAMES);
  }

  function newLife(inherit) {
    var gender = chance(0.5) ? 'M' : 'F';
    var cc = pick(COUNTRIES);
    var S = {
      name: fullName(gender), gender: gender,
      country: cc.c, city: pick(cc.cities),
      age: 0, alive: true, deathCause: null,
      happy: ri(31) + 50, health: ri(21) + 70, smarts: ri(61) + 20, looks: ri(61) + 20,
      money: inherit && inherit.money ? inherit.money : 0,
      edu: 0, studying: null,               // studying: {type:'uni'|'grad', years}
      job: null,                            // {t, sal, perf}
      partner: null,                        // {name, looks, affection, married}
      kids: [],                             // {name, age}
      houses: [], cars: [],
      jail: 0, jailTotal: 0, crimes: 0,
      log: []
    };
    log(S, '🍼 ' + S.name + ' was born in ' + S.city + ', ' + S.country + '.');
    if (inherit && inherit.money > 0) log(S, '💰 Inherited ' + fmt(inherit.money) + ' from a parent.');
    return S;
  }

  function log(S, text) {
    S.log.unshift({ age: S.age, text: text });
    if (S.log.length > 250) S.log.length = 250;
  }

  function stat(S, k, d) { S[k] = clamp(Math.round(S[k] + d), 0, 100); }

  function netWorth(S) {
    var w = S.money;
    S.houses.forEach(function (h) { w += h.value; });
    S.cars.forEach(function (c) { w += c.value; });
    return Math.round(w);
  }

  /* ---------------- yearly tick ---------------- */
  function ageUp(S) {
    if (!S.alive) return;
    S.age++;

    // prison year
    if (S.jail > 0) {
      S.jail--;
      stat(S, 'happy', -8); stat(S, 'health', -4);
      log(S, '🔒 Year ' + (S.jailTotal - S.jail) + ' behind bars. The food is terrible.');
      if (S.jail === 0) log(S, '🕊️ Released from prison. Time to start over.');
      tickKids(S);
      deathCheck(S);
      return;
    }

    // school auto-progress
    if (S.age === 6) log(S, '🎒 Started elementary school.');
    if (S.age === 18 && S.edu === 0) { S.edu = 1; log(S, '🎓 Graduated high school.'); }
    if (S.studying) {
      S.studying.years--;
      stat(S, 'smarts', 4);
      if (S.studying.years <= 0) {
        if (S.studying.type === 'uni') { S.edu = 2; log(S, '🎓 Graduated university!'); }
        else { S.edu = 3; log(S, '🎓 Finished graduate school. Dr. ' + S.name + '!'); }
        S.studying = null;
      } else {
        log(S, '📚 Year ' + S.studying.years + ' of ' + (S.studying.type === 'uni' ? 'university' : 'grad school') + ' to go.');
      }
    }

    // work income & expenses
    if (S.job) {
      var raise = 1 + (S.job.perf > 80 ? 0.04 : S.job.perf > 50 ? 0.02 : 0);
      S.job.sal = Math.round(S.job.sal * raise);
      S.money += S.job.sal;
      S.job.perf = clamp(S.job.perf + ri(11) - 5, 0, 100);
      if (S.job.perf < 15 && chance(0.25)) {
        log(S, '📦 Fired from ' + S.job.t + ' for poor performance.');
        S.job = null;
      }
    }
    var living = S.age < 18 ? 0 : 12000 + (S.houses.length * 6000) + (S.cars.length * 2500) + (S.kids.length * 8000);
    S.money -= living;

    // assets drift
    S.houses.forEach(function (h) { h.value = Math.round(h.value * rf(1.02, 1.09)); });
    S.cars.forEach(function (c) { c.value = Math.round(c.value * 0.88); });

    // relationships drift
    if (S.partner) {
      S.partner.affection = clamp(S.partner.affection + ri(11) - 5, 0, 100);
      if (S.partner.affection < 12 && chance(0.3)) {
        log(S, '💔 ' + S.partner.name + ' left you. It hurts.');
        stat(S, 'happy', -15);
        S.partner = null;
      }
    }
    tickKids(S);

    // stat drift
    stat(S, 'health', S.age < 40 ? -1 : S.age < 60 ? -2 : -3);
    stat(S, 'looks', S.age > 35 ? -1 : 0);
    if (S.age >= 18) stat(S, 'happy', -1);

    // random event
    if (chance(S.age < 18 ? 0.30 : 0.38)) randomEvent(S);

    deathCheck(S);
  }

  function tickKids(S) {
    S.kids.forEach(function (k) { k.age++; });
  }

  var EVENTS = [
    { w: 3, ok: function (S) { return true; }, run: function (S) { var f = ri(200) + 10; S.money += f; stat(S, 'happy', 4); return '🍀 Found ' + fmt(f) + ' on the sidewalk. Lucky day!'; } },
    { w: 3, ok: function (S) { return S.age >= 10; }, run: function (S) { stat(S, 'health', -12); stat(S, 'happy', -6); return '🤒 Caught a nasty flu. Bed rest for a week.'; } },
    { w: 2, ok: function (S) { return S.age >= 16; }, run: function (S) { var c = ri(3000) + 500; S.money -= c; stat(S, 'health', -8); return '🚗 Fender bender! Repairs cost ' + fmt(c) + '.'; } },
    { w: 2, ok: function (S) { return true; }, run: function (S) { stat(S, 'happy', 8); return '🎉 An old friend visited. You laughed until it hurt.'; } },
    { w: 2, ok: function (S) { return S.age >= 18; }, run: function (S) { var m = ri(900) + 100; S.money -= m; stat(S, 'happy', -8); return '🥷 Mugged on the way home! Lost ' + fmt(m) + '.'; } },
    { w: 2, ok: function (S) { return S.age >= 25; }, run: function (S) { var m = ri(20000) + 5000; S.money += m; stat(S, 'happy', 10); return '📜 A distant relative left you ' + fmt(m) + ' in their will.'; } },
    { w: 2, ok: function (S) { return S.age >= 12; }, run: function (S) { stat(S, 'health', -8); return '🏋️ Pulled a muscle working out. Ouch.'; } },
    { w: 2, ok: function (S) { return true; }, run: function (S) { stat(S, 'happy', 6); return '🌈 A stranger complimented you today. You glowed all afternoon.'; } },
    { w: 2, ok: function (S) { return S.age >= 8; }, run: function (S) { stat(S, 'health', -6); stat(S, 'happy', -4); return '🤢 Food poisoning from sketchy street tacos.'; } },
    { w: 2, ok: function (S) { return S.age >= 16; }, run: function (S) { var m = ri(900) + 100; S.money += m; return '📻 Won ' + fmt(m) + ' in a radio call-in contest!'; } },
    { w: 2, ok: function (S) { return S.houses.length > 0; }, run: function (S) { var m = ri(4000) + 1000; S.money -= m; return '🏠 The roof started leaking. Repairs: ' + fmt(m) + '.'; } },
    { w: 2, ok: function (S) { return S.partner; }, run: function (S) { S.partner.affection = clamp(S.partner.affection - 12, 0, 100); stat(S, 'happy', -6); return '🗯️ Big argument with ' + S.partner.name + ' about nothing.'; } },
    { w: 2, ok: function (S) { return S.kids.length > 0; }, run: function (S) { stat(S, 'happy', 8); return '🎭 Your kid starred in the school play. Proud parent moment.'; } },
    { w: 2, ok: function (S) { return S.job; }, run: function (S) { S.job.perf = clamp(S.job.perf + 12, 0, 100); return '⭐ Your boss praised your work at ' + S.job.t + '.'; } },
    { w: 1, ok: function (S) { return S.age >= 18; }, run: function (S) { var m = ri(40000) + 10000; S.money += m; stat(S, 'happy', 12); return '📈 Your investments surged! +' + fmt(m) + '.'; } },
    { w: 1, ok: function (S) { return S.age >= 18; }, run: function (S) { var m = Math.min(S.money, ri(20000) + 5000); S.money -= m; stat(S, 'happy', -10); return '📉 Market crash. You lost ' + fmt(m) + '.'; } },
    { w: 1, ok: function (S) { return S.age >= 40; }, run: function (S) { stat(S, 'health', -15); return '🩺 The doctor found high blood pressure. Take it easy.'; } },
    { w: 1, ok: function (S) { return S.age < 18; }, run: function (S) { stat(S, 'smarts', 6); stat(S, 'happy', 4); return '🏆 Won the school science fair!'; } },
    { w: 1, ok: function (S) { return S.age < 18; }, run: function (S) { stat(S, 'happy', -8); return '😢 Got rejected by your crush. It stings.'; } },
    { w: 1, ok: function (S) { return S.age >= 21; }, run: function (S) { stat(S, 'happy', 10); stat(S, 'health', -4); return '🍻 Epic night out with friends. Worth the headache.'; } },
    { w: 1, ok: function (S) { return S.age >= 30; }, run: function (S) { stat(S, 'happy', -6); return '🪞 Found your first gray hair. Time marches on.'; } },
    { w: 1, ok: function (S) { return true; }, run: function (S) { stat(S, 'happy', 5); return '🐶 A stray dog followed you home. You kept it.'; } }
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
    if (S.age >= 122) return die(S, 'died of old age at 122 — a legend');
    if (chance(Math.min(p, 0.85))) {
      var causes = S.age > 70 ? ['died of old age', 'died in their sleep', 'died of heart failure']
        : ['died in a freak accident', 'died of an illness', 'died in a car crash'];
      die(S, pick(causes));
    }
  }

  function die(S, cause) {
    S.alive = false;
    S.deathCause = cause;
    S.ribbon = awardRibbon(S);
    log(S, '⚰️ ' + S.name + ' ' + cause + ' at age ' + S.age + '.');
  }

  function awardRibbon(S) {
    var w = netWorth(S);
    if (w >= 5000000) return { e: '💰', t: 'Loaded', d: 'Died worth over $5M. Money can\'t buy happiness, but it tried.' };
    if (w >= 1000000) return { e: '💵', t: 'Rich', d: 'Broke the million mark. Not bad for one lifetime.' };
    if (S.jailTotal >= 5 || S.crimes >= 8) return { e: '🔫', t: 'Kingpin', d: 'Crime paid... until it didn\'t.' };
    if (S.kids.length >= 4) return { e: '👪', t: 'Fertile', d: S.kids.length + ' kids. The family tree is a forest.' };
    if (S.age >= 100) return { e: '🎂', t: 'Centenarian', d: 'A full century of life. What a run.' };
    if (S.edu === 3 && S.smarts >= 85) return { e: '🎓', t: 'Scholar', d: 'Big brain energy. Graduate school and genius smarts.' };
    if (S.looks >= 90) return { e: '✨', t: 'Heartthrob', d: 'Devastatingly good looking to the very end.' };
    if (S.age < 35) return { e: '🪦', t: 'Gone Too Soon', d: 'A short life, but a memorable one.' };
    if (!S.everWorked && w < 5000) return { e: '🛋️', t: 'Couch Potato', d: 'Never worked a day. Respect the commitment.' };
    if (S.happy >= 85) return { e: '😊', t: 'Joyful', d: 'Genuinely happy. The real high score.' };
    return { e: '😐', t: 'Mediocre', d: 'A perfectly average life. Nothing wrong with that.' };
  }

  /* ---------------- actions (return {ok, msg}) ---------------- */
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
    log(S, '📖 Hit the books. Smarts up.');
    return { ok: true };
  };
  A.gym = function (S) {
    var e = need(S, 10); if (e) return { ok: false, msg: e };
    stat(S, 'health', ri(6) + 4); stat(S, 'looks', ri(4) + 1); stat(S, 'happy', 2);
    log(S, '🏋️ Gym session. Feeling strong.');
    return { ok: true };
  };
  A.library = function (S) {
    var e = need(S, 8); if (e) return { ok: false, msg: e };
    stat(S, 'smarts', ri(5) + 3); stat(S, 'happy', 1);
    log(S, '📚 Quiet afternoon at the library.');
    return { ok: true };
  };
  A.doctor = function (S) {
    var e = need(S, 0); if (e) return { ok: false, msg: e };
    if (S.money < 200 && S.age >= 18) return { ok: false, msg: 'Doctor costs $200.' };
    if (S.age >= 18) S.money -= 200;
    stat(S, 'health', ri(10) + 8);
    log(S, '🩺 Checkup. Doctor says looking good.');
    return { ok: true };
  };
  A.meditate = function (S) {
    var e = need(S, 8); if (e) return { ok: false, msg: e };
    stat(S, 'happy', ri(8) + 5);
    log(S, '🧘 Meditated. Mind like still water.');
    return { ok: true };
  };
  A.lottery = function (S) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (S.money < 10) return { ok: false, msg: 'A ticket costs $10.' };
    S.money -= 10;
    var r = R();
    if (r < 0.002) { S.money += 1000000; stat(S, 'happy', 25); log(S, '🎰 JACKPOT! Won $1,000,000 on the lottery!!!'); }
    else if (r < 0.03) { S.money += 1000; log(S, '🎰 Won $1,000 on a scratcher!'); }
    else { stat(S, 'happy', -2); log(S, '🎰 Lottery ticket. Nothing. Again.'); }
    return { ok: true };
  };
  A.vacation = function (S) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (S.money < 3000) return { ok: false, msg: 'A vacation costs $3,000.' };
    S.money -= 3000;
    stat(S, 'happy', ri(10) + 10); stat(S, 'health', 4);
    log(S, '🏝️ ' + pick(['Beach', 'Mountain', 'City', 'Cruise']) + ' vacation. Recharged.');
    return { ok: true };
  };

  A.goUniversity = function (S) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (S.edu >= 2 || S.studying) return { ok: false, msg: 'Already in school.' };
    if (S.money < 40000) return { ok: false, msg: 'Tuition is $40,000.' };
    S.money -= 40000;
    S.studying = { type: 'uni', years: 4 };
    log(S, '🎓 Enrolled in university. Four years to go.');
    return { ok: true };
  };
  A.goGrad = function (S) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (S.edu < 2 || S.studying) return { ok: false, msg: 'Need a university degree first.' };
    if (S.money < 60000) return { ok: false, msg: 'Grad school is $60,000.' };
    S.money -= 60000;
    S.studying = { type: 'grad', years: 2 };
    log(S, '🎓 Started graduate school. Two years to go.');
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
      return { i: i, t: j.t, sal: j.sal, lock: S.age < 18 ? 'Age 18+' : meetsReq(S, j.req) };
    });
  };
  A.applyJob = function (S, i) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    var j = JOBS[i];
    var lock = meetsReq(S, j.req);
    if (lock) return { ok: false, msg: lock };
    if (S.job) return { ok: false, msg: 'Quit your current job first.' };
    // interview: better stats = better odds
    var odds = 0.55 + (S.smarts / 400) + (S.looks / 500);
    if (chance(Math.min(odds, 0.95))) {
      S.job = { t: j.t, sal: j.sal, perf: 50 };
      S.everWorked = true;
      log(S, '💼 Hired as ' + j.t + ' at ' + fmt(j.sal) + '/yr!');
      return { ok: true };
    }
    log(S, '❌ Interviewed for ' + j.t + '. Didn\'t get it.');
    return { ok: true, msg: 'Didn\'t get the job.' };
  };
  A.workHard = function (S) {
    if (!S.job) return { ok: false, msg: 'No job.' };
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    S.job.perf = clamp(S.job.perf + ri(8) + 6, 0, 100);
    stat(S, 'happy', -4); stat(S, 'health', -2);
    log(S, '💪 Put in extra hours at work.');
    return { ok: true };
  };
  A.askRaise = function (S) {
    if (!S.job) return { ok: false, msg: 'No job.' };
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (S.job.perf >= 65) {
      S.job.sal = Math.round(S.job.sal * 1.1);
      log(S, '💰 Got a 10% raise! Now ' + fmt(S.job.sal) + '/yr.');
    } else {
      stat(S, 'happy', -4);
      log(S, '🙄 Asked for a raise. Boss laughed.');
    }
    return { ok: true };
  };
  A.quitJob = function (S) {
    if (!S.job) return { ok: false, msg: 'No job.' };
    log(S, '🚪 Quit ' + S.job.t + '. Freedom!');
    S.job = null;
    stat(S, 'happy', 5);
    return { ok: true };
  };

  A.findLove = function (S) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (S.partner) return { ok: false, msg: 'Already taken.' };
    var g = S.gender === 'M' ? 'F' : 'M';
    S.partner = { name: fullName(g), looks: ri(61) + 20, affection: ri(30) + 40, married: false };
    stat(S, 'happy', 10);
    log(S, '💘 Started dating ' + S.partner.name + '. Butterflies!');
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
      log(S, '💍 Married ' + S.partner.name + '! What a day.');
      return { ok: true };
    }
    S.partner.affection = clamp(S.partner.affection - 20, 0, 100);
    log(S, '💔 Proposed... and got rejected. Awkward.');
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
    log(S, '👶 ' + baby.name + ' was born! Welcome to the world.');
    return { ok: true };
  };
  A.dateNight = function (S) {
    if (!S.partner) return { ok: false, msg: 'No partner.' };
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    S.partner.affection = clamp(S.partner.affection + ri(10) + 8, 0, 100);
    stat(S, 'happy', 8);
    log(S, '🌹 Date night with ' + S.partner.name + '. Sparks.');
    return { ok: true };
  };
  A.breakup = function (S) {
    if (!S.partner) return { ok: false, msg: 'No partner.' };
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    if (S.partner.married) {
      var split = Math.round(S.money / 2);
      S.money -= split;
      log(S, '⚖️ Divorced ' + S.partner.name + '. Lost ' + fmt(split) + ' in the split.');
    } else log(S, '💔 Broke up with ' + S.partner.name + '.');
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
    log(S, '🏠 Bought a ' + h.t + ' for ' + fmt(h.price) + '!');
    return { ok: true };
  };
  A.buyCar = function (S, i) {
    var e = need(S, 18); if (e) return { ok: false, msg: e };
    var c = CARS[i];
    if (S.money < c.price) return { ok: false, msg: 'Need ' + fmt(c.price) + '.' };
    S.money -= c.price;
    S.cars.push({ t: c.t, value: c.price });
    stat(S, 'happy', 6);
    log(S, '🚗 Bought a ' + c.t + ' for ' + fmt(c.price) + '. Vroom.');
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

  A.crime = function (S, i) {
    var e = need(S, 14); if (e) return { ok: false, msg: e };
    var c = CRIMES[i];
    S.crimes++;
    if (chance(1 - c.risk)) {
      var take = Math.round(c.reward * rf(0.6, 1.6));
      S.money += take;
      stat(S, 'happy', 4);
      log(S, '🕶️ ' + c.t + ' went smooth. +' + fmt(take) + '.');
    } else {
      S.jail = c.jail; S.jailTotal += c.jail;
      stat(S, 'happy', -15);
      log(S, '🚨 Caught ' + (c.t === 'Bank Robbery' ? 'robbing the bank' : c.t.toLowerCase() + 'ing') + '! Sentenced to ' + c.jail + ' year' + (c.jail > 1 ? 's' : '') + '.');
    }
    return { ok: true };
  };

  return {
    newLife: newLife, ageUp: ageUp, die: die, netWorth: netWorth, fmt: fmt,
    actions: A, JOBS: JOBS, HOUSES: HOUSES, CARS: CARS, CRIMES: CRIMES,
    EDU_NAMES: EDU_NAMES, setRng: setRng
  };
})();
if (typeof module !== 'undefined') module.exports = LifeSim;
