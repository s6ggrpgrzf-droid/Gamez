/* Reel Empire — Movie Studio Tycoon. Vanilla JS, localStorage save. All money in $M. */
(function () {
"use strict";

/* ============ utils ============ */
function $(id) { return document.getElementById(id); }
function rnd(a, b) { return a + Math.random() * (b - a); }
function ri(a, b) { return Math.floor(rnd(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function fmtM(v) {
  var neg = v < 0; v = Math.abs(v);
  var s = v >= 1000 ? (v / 1000).toFixed(2) + "B" : v >= 1 ? v.toFixed(1) + "M" : Math.round(v * 1000) + "K";
  return (neg ? "-" : "") + "$" + s;
}
function stars(n) { var s = ""; for (var i = 0; i < 5; i++) s += i < Math.round(n) ? "★" : "☆"; return s; }
var uidc = 1;
function uid() { return "x" + (uidc++) + Date.now().toString(36); }

/* ============ time ============ */
var START_YEAR = 1955;
function dateOf(week) {
  var y = START_YEAR + Math.floor(week / 52), w = week % 52;
  var m = Math.floor(w / 4.33);
  var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return { y: y, m: MONTHS[clamp(m, 0, 11)], w: w };
}
function dateStr(week) { var d = dateOf(week); return d.m + " " + d.y; }

/* ============ state ============ */
var LS_KEY = "reel-empire-v1";
var S = null; // game state

function eraMult(week) { var y = dateOf(week).y; return 1 + (y - 1955) * 0.022; }
function unlockedGenres(week) {
  var y = dateOf(week).y, out = [];
  for (var g in GENRES) if (GENRES[g].from <= y) out.push(g);
  return out;
}

function newGame() {
  S = {
    v: 1, week: 0, cash: 30, prestige: 0,
    speed: 1, // 0 paused, 1 normal, 3 fast
    films: [], scripts: [], scriptTier: 1,
    talent: [], // hired
    techs: {}, // id -> {status:'researching', weeksLeft} or {status:'owned'}
    techRace: {}, // id -> rivalIndex or -1 if player won
    rivals: [],
    eventMods: [], // {genre, mod, untilWeek} or {legs, untilWeek}
    log: [],
    awards: [], // {year, category, film, studio}
    buffs: { boxoffice: 0, untilWeek: 0 }, // award buffs
    franchises: {}, // title -> {films, fanbase}
    stats: { released: 0, hits: 0, flops: 0, awardsWon: 0, totalGross: 0 },
    tutorial: false,
    lastSave: Date.now(),
    gameOver: false, won: false,
  };
  for (var i = 0; i < 3; i++) {
    S.rivals.push({ name: RIVAL_NAMES[i], slate: [], prestige: ri(10, 40), flavorCooldown: 0 });
  }
  refreshScripts(true);
  for (var j = 0; j < 3; j++) S.talent.push(genTalent("actor", true));
  for (var k = 0; k < 2; k++) S.talent.push(genTalent("director", true));
  scheduleRivalYear();
  log("🎬 Reel Empire opens its doors — January 1955. The western is king. Make history.");
}

function save() { S.lastSave = Date.now(); try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {} }
function load() {
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    S = JSON.parse(raw);
    return !!(S && S.v === 1);
  } catch (e) { return false; }
}

function log(msg) {
  S.log.unshift({ w: S.week, msg: msg });
  if (S.log.length > 120) S.log.length = 120;
}

/* ============ market: genre heat ============ */
function genreHeat(g, week) {
  week = week === undefined ? S.week : week;
  var base = 1 + 0.28 * Math.sin((week + g.length * 37) * 2 * Math.PI / 156);
  var mod = 0;
  for (var i = 0; i < S.eventMods.length; i++) {
    var e = S.eventMods[i];
    if (e.untilWeek >= week && e.genre === g) mod += e.mod;
  }
  return clamp(base + mod, 0.35, 1.8);
}
function genreTrend(g) {
  var now = genreHeat(g), past = genreHeat(g, S.week - 12);
  if (now > past + 0.06) return "up";
  if (now < past - 0.06) return "down";
  return "flat";
}

/* ============ talent ============ */
function genName(female) {
  var f = female === undefined ? Math.random() < 0.5 : female;
  return (f ? pick(FIRST_NAMES_F) : pick(FIRST_NAMES_M)) + " " + pick(LAST_NAMES);
}
function genTalent(type, starter) {
  var y = dateOf(S ? S.week : 0).y;
  var talent = starter ? ri(45, 75) : ri(25, 95);
  var fame = starter ? ri(30, 60) : ri(10, 95);
  var age = type === "actor" ? (starter ? ri(24, 38) : ri(18, 55)) : ri(28, 55);
  var t = {
    id: uid(), type: type, name: type === "director" ? genName(false) + " " + pick(["","Jr."]) : genName(),
    age: age, talent: talent, fame: fame,
    genreFit: {}, salary: 0, stress: ri(0, 20),
    films: 0, hired: !!starter, retired: false, scandal: 0,
  };
  if (type === "director") t.name = pick(DIRECTOR_SURNAMES) + " " + pick(["","Jr.","III"]);
  var gs = unlockedGenres(S ? S.week : 0);
  for (var i = 0; i < gs.length; i++) t.genreFit[gs[i]] = rnd(0.75, 1.25);
  // one signature genre
  t.genreFit[pick(gs)] = rnd(1.2, 1.45);
  t.salary = calcSalary(t);
  return t;
}
function calcSalary(t) {
  return Math.max(0.05, (t.fame * 0.012 + t.talent * 0.007) * eraMult(S ? S.week : 0));
}
function rosterCap() { return { actor: 4 + (S.lot || 0) * 2, director: 2 + (S.lot || 0) }; }

/* ============ scripts ============ */
function genTitle(genre) {
  var p = TITLE_PARTS[genre] || TITLE_PARTS.drama;
  return pick(p.a) + " " + pick(p.b);
}
function genScript() {
  var gs = unlockedGenres(S.week);
  var g = pick(gs);
  var maxQ = S.scriptTier === 1 ? 3 : S.scriptTier === 2 ? 4 : 5;
  var q = clamp(ri(1, maxQ) + (Math.random() < 0.25 ? 1 : 0), 1, 5);
  return { id: uid(), title: genTitle(g), genre: g, quality: q,
           price: q * 0.35 * eraMult(S.week) };
}
function refreshScripts(initial) {
  S.scripts = [];
  for (var i = 0; i < 5; i++) S.scripts.push(genScript());
  if (!initial) log("📝 Fresh scripts on the market.");
}

/* ============ film pipeline ============ */
function idealBudget(scriptStars) { return scriptStars * 4 * eraMult(S.week); }

function greenlight(scriptId, directorId, castIds, budget) {
  S.scriptsOwned = S.scriptsOwned || [];
  var si = -1;
  for (var i = 0; i < S.scriptsOwned.length; i++) if (S.scriptsOwned[i].id === scriptId) si = i;
  if (si < 0) return null;
  var sc = S.scriptsOwned.splice(si, 1)[0];
  var total = budget + sc.price;
  if (S.cash < total) { S.scripts.push(sc); return null; }
  S.cash -= total;
  var dur = Math.round(clamp(6 + budget / 8, 8, 26));
  var film = {
    id: uid(), title: sc.title, genre: sc.genre, scriptStars: sc.quality,
    budget: budget, marketing: 0, directorId: directorId, castIds: castIds.slice(),
    stage: "production", progress: 0, weeksTotal: dur, weeksLeft: dur,
    quality: 0, qmod: 0, costOver: 0,
    releaseWeek: -1, weeklyGross: [], totalGross: 0, critic: 0, breakdown: null,
    dilemmasDone: 0, buzz: 0, franchise: null, sequelOf: null,
    year: dateOf(S.week).y,
  };
  // cast stress
  eachTalent(castIds.concat([directorId]), function (t) { t.stress = clamp(t.stress + 15, 0, 100); t.films++; });
  S.films.push(film);
  log("🎬 <b>" + film.title + "</b> enters production (" + GENRES[film.genre].name + ", " + fmtM(budget) + " budget).");
  return film;
}

function eachTalent(ids, fn) {
  for (var i = 0; i < S.talent.length; i++)
    if (ids.indexOf(S.talent[i].id) >= 0) fn(S.talent[i]);
}
function talentById(id) {
  for (var i = 0; i < S.talent.length; i++) if (S.talent[i].id === id) return S.talent[i];
  return null;
}

function computeQuality(f) {
  var dir = talentById(f.directorId);
  var castT = 0, castF = 0;
  for (var i = 0; i < f.castIds.length; i++) {
    var t = talentById(f.castIds[i]);
    if (t) { castT += t.talent * (t.genreFit[f.genre] || 1); castF += t.fame; }
  }
  var castAvg = f.castIds.length ? castT / f.castIds.length : 50;
  var ideal = idealBudget(f.scriptStars);
  var budgetFit = clamp(10 - Math.abs(f.budget - ideal) / ideal * 14, -12, 10);
  var techB = 0;
  for (var tid in S.techs) {
    if (S.techs[tid].status !== "owned") continue;
    var gl = TECH_GENRES[tid] || [];
    if (gl.length === 0 || gl.indexOf(f.genre) >= 0) techB += tid === "cgi" ? 10 : 6;
  }
  techB = Math.min(techB, 16);
  var innov = innovatorBonus(f.genre);
  var q = 18 + f.scriptStars * 8 + (dir ? dir.talent * 0.22 * (dir.genreFit[f.genre] || 1) : 8)
        + castAvg * 0.18 + budgetFit + techB + innov + f.qmod + rnd(-4, 4);
  // franchise expectations
  if (f.sequelOf && S.franchises[f.sequelOf]) {
    var orig = S.franchises[f.sequelOf].quality;
    if (q < orig - 8) { q -= 6; f.fatigue = true; }
  }
  return clamp(Math.round(q), 5, 99);
}
function innovatorBonus(genre) {
  // recent innovator edge applies broadly
  for (var tid in S.techRace) if (S.techRace[tid] === -1 && S.techs[tid] && S.techs[tid].ownedWeek && S.week - S.techs[tid].ownedWeek < 104) return 4;
  return 0;
}

function releaseFilm(filmId, releaseWeek, marketing) {
  var f = null;
  for (var i = 0; i < S.films.length; i++) if (S.films[i].id === filmId) f = S.films[i];
  if (!f || f.stage !== "ready") return false;
  if (marketing > 0 && S.cash < marketing) return false;
  S.cash -= marketing;
  f.marketing = marketing;
  f.releaseWeek = releaseWeek;
  f.stage = "scheduled";
  if (marketing > f.budget * 0.8) { f.overexposed = true; }
  log("📣 <b>" + f.title + "</b> dated for " + dateStr(releaseWeek) + " (" + fmtM(marketing) + " marketing).");
  return true;
}

function competitionFactor(week) {
  var cf = 1;
  for (var r = 0; r < S.rivals.length; r++) {
    var sl = S.rivals[r].slate;
    for (var i = 0; i < sl.length; i++) {
      var d = Math.abs(sl[i].week - week);
      if (d === 0 && sl[i].hype > 70) cf *= 0.65;
      else if (d <= 1) cf *= 0.82;
      else if (d <= 2) cf *= 0.92;
    }
  }
  return cf;
}

function openFilm(f) {
  f.quality = f.quality || computeQuality(f);
  f.stage = "theatrical";
  f.weekNum = 0;
  var dir = talentById(f.directorId);
  var starPower = 0;
  for (var i = 0; i < f.castIds.length; i++) { var t = talentById(f.castIds[i]); if (t) starPower += t.fame; }
  starPower = starPower / 120;
  var mkt = 0.5 + Math.min(f.marketing / (f.budget + 0.5), 1.2);
  if (S.techs.blockbuster && S.techs.blockbuster.status === "owned") mkt *= 1.2;
  var heat = genreHeat(f.genre, f.releaseWeek);
  var legsBoost = 0;
  for (var i = 0; i < S.eventMods.length; i++) if (S.eventMods[i].legs && S.eventMods[i].untilWeek >= f.releaseWeek) legsBoost += S.eventMods[i].legs;
  var open = 7.0 * Math.pow(f.budget, 0.72) * (0.45 + 0.28 * starPower) * mkt
           * (0.55 + f.quality / 130) * heat * eraMult(f.releaseWeek);
  if (f.overexposed) open *= 0.85;
  if (f.quality < 50) open *= 0.6; // toxic word of mouth
  var buff = S.buffs.untilWeek >= S.week ? (1 + S.buffs.boxoffice) : 1;
  open *= buff;
  // franchise fanbase
  if (f.sequelOf && S.franchises[f.sequelOf]) open += S.franchises[f.sequelOf].fanbase * 0.15;
  f.opening = open;
  f.leg = f.quality >= 75 ? 0.62 : f.quality >= 55 ? 0.55 : 0.45;
  f.leg += legsBoost;
  f.totalMult = f.quality >= 75 ? 3.4 : f.quality >= 55 ? 2.6 : 1.8;
  f.critic = clamp(Math.round(f.quality + rnd(-10, 10) - (f.overexposed ? 5 : 0)), 1, 100);
  f.breakdown = {
    Script: clamp(Math.round(f.scriptStars * 20 + rnd(-6, 6)), 1, 100),
    Direction: clamp(Math.round((dir ? dir.talent : 50) + rnd(-6, 6)), 1, 100),
    Cast: clamp(Math.round((f.castIds.length ? starPower * 60 : 40) + rnd(-6, 6)), 1, 100),
    Craft: clamp(Math.round(f.quality + rnd(-8, 8)), 1, 100),
  };
  log("🎟 <b>" + f.title + "</b> opens to " + fmtM(open) + " — critics: <b>" + f.critic + "</b>/100.");
}

/* ============ weekly simulation ============ */
var pendingDilemma = null;

function advanceWeeks(n) {
  for (var k = 0; k < n; k++) {
    if (S.gameOver) break;
    S.week++;
    tickWeek();
    if (S.week % 4 === 0) save();
  }
  save();
}

function tickWeek() {
  var w = S.week, d = dateOf(w);
  // productions
  for (var i = S.films.length - 1; i >= 0; i--) {
    var f = S.films[i];
    if (f.stage === "production") {
      f.progress++;
      f.weeksLeft--;
      var frac = f.progress / f.weeksTotal;
      if (!f.d1 && frac >= 0.33) { f.d1 = true; queueDilemma(f); }
      if (!f.d2 && frac >= 0.66) { f.d2 = true; queueDilemma(f); }
      if (f.weeksLeft <= 0) {
        f.stage = "ready";
        f.quality = computeQuality(f);
        log("✅ <b>" + f.title + "</b> wraps production. Quality shaping up: <b>" + f.quality + "</b>/100. Date the release!");
        toast("🎬 " + f.title + " is ready to release!");
      }
    } else if (f.stage === "scheduled" && w >= f.releaseWeek) {
      openFilm(f);
    } else if (f.stage === "theatrical") {
      var gross = f.opening * Math.pow(f.leg, f.weekNum) * competitionFactor(w);
      gross = Math.max(gross, 0.01);
      f.weeklyGross.push(gross);
      f.totalGross += gross;
      S.cash += gross * 0.5; // studio share
      S.stats.totalGross += gross;
      f.weekNum++;
      var maxW = 8 + (S.techs.streaming && S.techs.streaming.status === "owned" ? 4 : 0);
      if (f.weekNum >= maxW) {
        f.stage = "released";
        S.stats.released++;
        var profit = f.totalGross * 0.5 - f.budget - f.marketing - scriptCostOf(f);
        if (f.critic >= 70 && f.totalGross * 0.5 > (f.budget + f.marketing) * 1.5) S.stats.hits++;
        if (profit < 0) S.stats.flops++;
        // franchise fanbase
        var key = f.franchise || f.title;
        if (!S.franchises[key]) S.franchises[key] = { films: 0, fanbase: 0, quality: 0 };
        S.franchises[key].films++;
        S.franchises[key].fanbase = Math.max(S.franchises[key].fanbase * 0.7, f.totalGross * 0.1);
        S.franchises[key].quality = f.quality;
        log("🏁 <b>" + f.title + "</b> ends its run: <b>" + fmtM(f.totalGross) + "</b> worldwide (" + (profit >= 0 ? "+" : "") + fmtM(profit) + " profit).");
        checkWin();
      }
    }
  }
  // monthly: salaries, overhead, script refresh
  if (w % 4 === 0) {
    var burn = 0;
    for (var t = 0; t < S.talent.length; t++) if (S.talent[t].hired && !S.talent[t].retired) burn += S.talent[t].salary / 12;
    burn += 0.15 * (1 + (S.lot || 0));
    S.cash -= burn;
    refreshScripts();
    if (S.cash < -5 && !S.gameOver) return gameOver();
  }
  // yearly: aging, events, awards, rival slates
  if (d.w === 0 && w > 0) {
    var yr = d.y;
    // age talent
    for (var a = 0; a < S.talent.length; a++) {
      var ta = S.talent[a];
      if (!ta.hired || ta.retired) continue;
      ta.age++;
      if (ta.age >= 70) { ta.retired = true; log("👋 " + ta.name + " retires at 70. A legend exits the stage."); }
      else { ta.salary = calcSalary(ta); }
      // stress decay for idle talent
      if (!isFilming(ta.id)) ta.stress = clamp(ta.stress - 8, 0, 100);
      // boredom: benched too long
      ta.benched = isFilming(ta.id) ? 0 : (ta.benched || 0) + 1;
      if (ta.benched > 52 && Math.random() < 0.3) {
        ta.hired = false;
        log("🚪 " + ta.name + " left — tired of waiting by the phone.");
      }
      // scandal risk
      if (ta.stress > 80 && Math.random() < 0.25) {
        ta.stress = 50; ta.fame = Math.max(10, ta.fame - 15); ta.scandal++;
        log("📰 Scandal! " + ta.name + " in the tabloids. Fame takes a hit.");
        toast("📰 Scandal: " + ta.name);
      }
    }
    yearlyEvent(yr);
    runAwards(yr - 1);
    scheduleRivalYear();
    // rival poaching
    if (Math.random() < 0.3) rivalPoach();
  }
  // tech research progress
  for (var tid in S.techs) {
    var tr = S.techs[tid];
    if (tr.status === "researching") {
      tr.weeksLeft--;
      if (tr.weeksLeft <= 0) {
        tr.status = "owned"; tr.ownedWeek = w;
        var first = S.techRace[tid] === undefined;
        if (first) S.techRace[tid] = -1;
        log("🔬 <b>" + techName(tid) + "</b> researched!" + (first ? " <b>Your studio got there first!</b>" : ""));
        toast("🔬 " + techName(tid) + " unlocked!");
      }
    }
  }
  // rival tech race: rivals may beat you
  for (var t2 in S.techs) {
    if (S.techs[t2].status === "researching" && S.techRace[t2] === undefined && Math.random() < 0.02) {
      S.techRace[t2] = ri(0, 2);
      log("🥀 " + S.rivals[S.techRace[t2]].name + " beats you to <b>" + techName(t2) + "</b>.");
    }
  }
  // event mods expire
  S.eventMods = S.eventMods.filter(function (e) { return e.untilWeek >= w; });
}

function isFilming(tid) {
  for (var i = 0; i < S.films.length; i++) {
    var f = S.films[i];
    if (f.stage === "production" && (f.directorId === tid || f.castIds.indexOf(tid) >= 0)) return true;
  }
  return false;
}
function scriptCostOf(f) { return 0; } // paid at greenlight

function queueDilemma(f) {
  pendingDilemma = { filmId: f.id, d: pick(DILEMMAS) };
  pauseForModal();
}

/* ============ rivals ============ */
function scheduleRivalYear() {
  var y = dateOf(S.week).y;
  for (var r = 0; r < S.rivals.length; r++) {
    var rv = S.rivals[r];
    rv.slate = [];
    var n = ri(2, 4);
    var gs = unlockedGenres(S.week);
    for (var i = 0; i < n; i++) {
      var wk = S.week + ri(4, 50);
      // weight by heat
      var g = pick(gs);
      if (Math.random() < 0.6) {
        var sorted = gs.slice().sort(function (a, b) { return genreHeat(b, wk) - genreHeat(a, wk); });
        g = sorted[ri(0, Math.min(2, sorted.length - 1))];
      }
      rv.slate.push({ title: genTitle(g), genre: g, week: wk, hype: ri(40, 95) });
    }
    rv.slate.sort(function (a, b) { return a.week - b.week; });
    if (rv.flavorCooldown <= 0 && Math.random() < 0.7) {
      log("🏢 " + rv.name + " " + pick(RIVAL_FLAVOR) + ".");
      rv.flavorCooldown = 2;
    } else rv.flavorCooldown--;
  }
}
function rivalPoach() {
  var hired = S.talent.filter(function (t) { return t.hired && !t.retired && t.fame > 60; });
  if (!hired.length) return;
  var t = pick(hired);
  var rv = pick(S.rivals);
  pendingPoach = { talentId: t.id, rival: rv.name, offer: t.salary * rnd(1.6, 2.4) };
  pauseForModal();
}
var pendingPoach = null;

/* ============ world events ============ */
function yearlyEvent(yr) {
  var pool = WORLD_EVENTS.filter(function (e) { return yr >= e.years[0] && yr <= e.years[1]; });
  if (!pool.length || Math.random() < 0.25) return;
  var ev = pick(pool);
  var mods = [];
  for (var g in (ev.heat || {})) {
    S.eventMods.push({ genre: g, mod: ev.heat[g], untilWeek: S.week + 52 });
    mods.push(GENRES[g].name + " " + (ev.heat[g] > 0 ? "▲" : "▼"));
  }
  if (ev.legs) S.eventMods.push({ legs: ev.legs, untilWeek: S.week + 52 });
  log("🌍 <b>" + ev.name + ":</b> " + ev.text + (mods.length ? " (" + mods.join(", ") + ")" : ""));
  toast("🌍 " + ev.name);
  pendingEvent = ev;
}

/* ============ awards ============ */
function runAwards(yr) {
  if (yr < 1955) return;
  var cands = [];
  for (var i = 0; i < S.films.length; i++) {
    var f = S.films[i];
    if (f.year === yr && f.stage === "released" && f.critic >= 60) cands.push({ f: f, studio: "you" });
  }
  // rival films (abstract)
  for (var r = 0; r < S.rivals.length; r++) {
    var n = ri(1, 3);
    for (var k = 0; k < n; k++) {
      cands.push({ f: { title: genTitle(pick(unlockedGenres(S.week))), critic: ri(45, 95), genre: pick(unlockedGenres(S.week)) }, studio: S.rivals[r].name });
    }
  }
  if (!cands.length) return;
  function score(c) { return c.f.critic + rnd(0, 18); }
  var cats = ["Best Picture", "Best Director", "Best Star"];
  var results = [];
  for (var c = 0; c < cats.length; c++) {
    var sorted = cands.slice().sort(function (a, b) { return score(b) - score(a); });
    var win = sorted[0];
    results.push({ cat: cats[c], title: win.f.title, studio: win.studio });
    if (win.studio === "you") {
      S.prestige += 2; S.stats.awardsWon++;
      S.buffs.boxoffice = Math.min(0.2, S.buffs.boxoffice + 0.04);
      S.buffs.untilWeek = S.week + 52;
    }
  }
  S.awards.unshift({ year: yr, results: results });
  var mine = results.filter(function (r) { return r.studio === "you"; });
  if (mine.length) {
    log("🏆 <b>Awards " + yr + ":</b> you win " + mine.map(function (m) { return m.cat; }).join(", ") + "! +2★ prestige each.");
    toast("🏆 You won " + mine.length + " award" + (mine.length > 1 ? "s" : "") + "!");
    confettiBurst();
    pendingAwards = { year: yr, results: results };
    pauseForModal();
  } else {
    log("🏆 Awards " + yr + ": " + results.map(function (r) { return r.cat + " — " + r.title + " (" + r.studio + ")"; }).join("; "));
  }
}
var pendingEvent = null, pendingAwards = null;

function techName(tid) { for (var i = 0; i < TECHS.length; i++) if (TECHS[i].id === tid) return TECHS[i].name; return tid; }

/* ============ win / lose ============ */
function studioValue() {
  var v = S.cash;
  for (var k in S.franchises) v += S.franchises[k].fanbase * 2;
  v += S.prestige * 2;
  return v;
}
function checkWin() {
  if (!S.won && studioValue() >= 1000) {
    S.won = true;
    pendingWin = true;
    pauseForModal();
    log("👑 <b>HOLLYWOOD LEGEND!</b> Your studio is worth over $1B. The town is yours.");
  }
}
var pendingWin = null;
function gameOver() {
  S.gameOver = true;
  pendingGameOver = true;
  pauseForModal();
  log("💸 <b>BANKRUPT.</b> The studio gates close. Final reel: " + S.stats.released + " films, " + fmtM(S.stats.totalGross) + " grossed.");
}
var pendingGameOver = null;

/* ============ time controls & offline ============ */
var tickTimer = null, modalPaused = false;
function pauseForModal() { modalPaused = true; }
function resumeFromModal() { modalPaused = false; }

function setSpeed(s) {
  S.speed = s;
  ["spdPause", "spd1", "spd3"].forEach(function (id) { $(id).classList.remove("on"); });
  $({ 0: "spdPause", 1: "spd1", 3: "spd3" }[s]).classList.add("on");
  save();
}
function startLoop() {
  stopLoop();
  tickTimer = setInterval(function () {
    if (S.speed === 0 || modalPaused || S.gameOver) return;
    advanceWeeks(S.speed === 3 ? 1 : 1);
    if (S.speed === 3) { /* 3x = 3 weeks per 1.5s tick */ }
    renderAll();
    drainModals();
  }, S.speed === 3 ? 500 : 1500);
}
function stopLoop() { if (tickTimer) clearInterval(tickTimer); tickTimer = null; }

function offlineProgress() {
  var mins = (Date.now() - (S.lastSave || Date.now())) / 60000;
  var weeks = Math.min(Math.floor(mins / 10), 104);
  if (weeks >= 2) {
    var cashBefore = S.cash;
    advanceWeeks(weeks);
    var delta = S.cash - cashBefore;
    showModal(
      "<h2>🎞 While you were away…</h2>" +
      "<p>" + weeks + " weeks passed at the studio.</p>" +
      "<div class='kv'><span>Box office & business</span><b class='" + (delta >= 0 ? "pos" : "neg") + "'>" + (delta >= 0 ? "+" : "") + fmtM(delta) + "</b></div>" +
      "<p class='sub'>Releases continued, salaries were paid, productions moved along.</p>" +
      "<button class='btn amber' onclick='closeModal()'>Back to the lot</button>"
    );
  }
}

/* ============ prestige shop & upgrades ============ */
var PRESTIGE_SHOP = [
  { id: "alister", name: "A-List Signing", cost: 4, desc: "A scout finds 3 famous stars willing to talk." },
  { id: "arthouse", name: "Arthouse Division", cost: 6, desc: "Prestige films earn double ★. Unlocks 'prestige picture' greenlights." },
  { id: "franchise", name: "Franchise Machine", cost: 5, desc: "Sequels cost 25% less and inherit more fanbase." },
  { id: "shield", name: "Ironclad Contracts", cost: 3, desc: "No poaching attempts for 2 years." },
];
function buyPrestige(id) {
  var item = null;
  for (var i = 0; i < PRESTIGE_SHOP.length; i++) if (PRESTIGE_SHOP[i].id === id) item = PRESTIGE_SHOP[i];
  if (!item || S.prestige < item.cost) return;
  if (id === "arthouse" && S.arthouse) return;
  if (id === "shield" && S.shieldUntil > S.week) return;
  S.prestige -= item.cost;
  if (id === "alister") { pendingScout = { count: 3, famed: true }; pauseForModal(); }
  if (id === "arthouse") S.arthouse = true;
  if (id === "franchise") S.franchiseMach = true;
  if (id === "shield") S.shieldUntil = S.week + 104;
  log("⭐ Prestige spent: <b>" + item.name + "</b>.");
  save(); renderAll();
}
var pendingScout = null;

function lotLevel() { return S.lot || 0; }
function lotUpgradeCost() { return [8, 25, 60][lotLevel()] || null; }
function buyLot() {
  var c = lotUpgradeCost();
  if (c === null || S.cash < c) return;
  S.cash -= c; S.lot = lotLevel() + 1;
  log("🏗 Studio lot upgraded to level " + S.lot + "! Bigger roster, better facilities.");
  toast("🏗 Lot upgraded!");
  save(); renderAll();
}
function researchTech(tid) {
  var t = null;
  for (var i = 0; i < TECHS.length; i++) if (TECHS[i].id === tid) t = TECHS[i];
  if (!t || S.techs[tid] || dateOf(S.week).y < t.year || S.cash < t.cost) return;
  // only one research at a time
  for (var k in S.techs) if (S.techs[k].status === "researching") { toast("Already researching!"); return; }
  S.cash -= t.cost;
  S.techs[tid] = { status: "researching", weeksLeft: t.weeks };
  log("🔬 Research begins: <b>" + t.name + "</b> (" + t.weeks + " weeks). Beat the rivals to it!");
  save(); renderAll();
}

/* ============ sequels ============ */
function makeSequel(filmId) {
  var f = null;
  for (var i = 0; i < S.films.length; i++) if (S.films[i].id === filmId) f = S.films[i];
  if (!f || f.stage !== "released") return;
  var key = f.franchise || f.title;
  var cost = f.budget * 0.8 * (S.franchiseMach ? 0.75 : 1);
  if (S.cash < cost) { toast("Not enough cash for the sequel."); return; }
  S.cash -= cost;
  var dur = Math.round(clamp(6 + cost / 8, 8, 22));
  var nf = {
    id: uid(), title: f.title + " II", genre: f.genre, scriptStars: f.scriptStars,
    budget: cost, marketing: 0, directorId: f.directorId, castIds: f.castIds.slice(),
    stage: "production", progress: 0, weeksTotal: dur, weeksLeft: dur,
    quality: 0, qmod: 0, costOver: 0, releaseWeek: -1, weeklyGross: [], totalGross: 0,
    critic: 0, breakdown: null, dilemmasDone: 0, buzz: 0,
    franchise: key, sequelOf: key, year: dateOf(S.week).y,
  };
  S.films.push(nf);
  log("🎬 Sequel greenlit: <b>" + nf.title + "</b>. The fans are waiting…");
  save(); renderAll();
}

/* ============ UI helpers ============ */
function toast(msg) {
  var d = document.createElement("div");
  d.className = "toast"; d.innerHTML = msg;
  $("toastRoot").appendChild(d);
  setTimeout(function () { d.style.opacity = "0"; d.style.transition = "opacity .4s"; }, 2600);
  setTimeout(function () { d.remove(); }, 3100);
}
function showModal(html) {
  var back = document.createElement("div");
  back.className = "mback"; back.id = "mback";
  back.innerHTML = "<div class='modal'>" + html + "</div>";
  $("modalRoot").appendChild(back);
}
function closeModal() {
  var b = $("mback"); if (b) b.remove();
  resumeFromModal();
}
function drainModals() {
  if ($("mback")) return;
  if (pendingGameOver) { pendingGameOver = null; return gameOverModal(); }
  if (pendingWin) { pendingWin = null; return winModal(); }
  if (pendingDilemma) { var p = pendingDilemma; pendingDilemma = null; return dilemmaModal(p); }
  if (pendingPoach) { var q = pendingPoach; pendingPoach = null; return poachModal(q); }
  if (pendingScout) { var s = pendingScout; pendingScout = null; return scoutModal(s); }
  if (pendingAwards) { var a = pendingAwards; pendingAwards = null; return awardsModal(a); }
  if (pendingEvent) { var e = pendingEvent; pendingEvent = null; return eventModal(e); }
}

var activeTab = "studio";
function switchTab(t) {
  activeTab = t;
  var btns = document.querySelectorAll("#bottomnav button");
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("on", btns[i].dataset.tab === t);
  var views = document.querySelectorAll(".view");
  for (var j = 0; j < views.length; j++) views[j].hidden = views[j].id !== "view-" + t;
  renderAll();
}

function renderAll() {
  if (!S) return;
  var d = dateOf(S.week);
  $("tbDate").textContent = d.m + " " + d.y;
  tweenCash(S.cash);
  $("tbPrestige").textContent = "★ " + S.prestige;
  setSpeedUI();
  ({ studio: renderStudio, films: renderFilms, talent: renderTalent, market: renderMarket, awards: renderAwards })[activeTab]();
}
function setSpeedUI() {
  $("spdPause").classList.toggle("on", S.speed === 0);
  $("spd1").classList.toggle("on", S.speed === 1);
  $("spd3").classList.toggle("on", S.speed === 3);
}

function posterImg(f, cls) {
  try { return "<img class='" + (cls || "pthumb") + "' src='" + getPoster(f) + "' alt=''>"; }
  catch (e) { return ""; }
}
function grossBars(f) {
  if (!f.weeklyGross || !f.weeklyGross.length) return "";
  var max = f.opening || 1, i;
  for (i = 0; i < f.weeklyGross.length; i++) if (f.weeklyGross[i] > max) max = f.weeklyGross[i];
  var bars = "";
  for (i = 0; i < f.weeklyGross.length; i++)
    bars += "<i style='height:" + Math.max(6, Math.round(f.weeklyGross[i] / max * 100)) + "%'></i>";
  return "<div class='gbars'>" + bars + "</div><div class='sub' style='margin:2px 0 0'>weekly box office</div>";
}
function eraOf(y) {
  if (y < 1968) return "Golden Age";
  if (y < 1975) return "New Hollywood";
  if (y < 1990) return "Blockbuster Era";
  if (y < 2010) return "Modern Era";
  return "Streaming Age";
}
function lotSVG() {
  var lvl = lotLevel(), b = "";
  b += "<rect x='40' y='150' width='120' height='80' rx='4' fill='#3a2f1c' stroke='#d4a94e'/>" +
       "<text x='100' y='196' text-anchor='middle' fill='#f2d488' font-size='12'>STAGE A</text>";
  if (lvl >= 1) b += "<rect x='180' y='160' width='90' height='70' rx='4' fill='#2c2517' stroke='#d4a94e'/>" +
       "<text x='225' y='198' text-anchor='middle' fill='#f2d488' font-size='11'>OFFICES</text>";
  if (lvl >= 2) b += "<rect x='300' y='140' width='130' height='90' rx='4' fill='#33281a' stroke='#d4a94e'/>" +
       "<text x='365' y='188' text-anchor='middle' fill='#f2d488' font-size='11'>BACKLOT</text>";
  if (lvl >= 3) b += "<rect x='450' y='155' width='110' height='75' rx='4' fill='#1e2c3a' stroke='#7ad4f7'/>" +
       "<text x='505' y='195' text-anchor='middle' fill='#8fd4f7' font-size='11'>CGI LAB</text>";
  return "<svg viewBox='0 0 600 260' class='lotsvg'>" +
    "<defs><linearGradient id='lsky' x1='0' y1='0' x2='0' y2='1'>" +
    "<stop offset='0' stop-color='#1c1008'/><stop offset='1' stop-color='#8f5c1c'/></linearGradient></defs>" +
    "<rect width='600' height='228' fill='url(#lsky)'/>" +
    "<circle cx='520' cy='52' r='30' fill='#f7dc9a' opacity='.85'/>" +
    "<rect y='228' width='600' height='32' fill='#100c07'/>" + b +
    "<g><rect x='262' y='62' width='8' height='66' fill='#5c4a2c'/><rect x='292' y='62' width='8' height='66' fill='#5c4a2c'/>" +
    "<ellipse cx='281' cy='56' rx='36' ry='27' fill='#d4a94e'/>" +
    "<text x='281' y='61' text-anchor='middle' font-size='11' font-weight='bold' fill='#1a1408'>REEL</text></g>" +
    "<rect x='0' y='200' width='600' height='6' fill='#d4a94e' opacity='.35'/></svg>";
}
var displayedCash = null, cashRaf = null;
function tweenCash(target) {
  var el = $("tbCash");
  if (typeof requestAnimationFrame === "undefined") {
    displayedCash = target; el.textContent = fmtM(target);
    el.classList.toggle("neg", target < 0); return;
  }
  if (displayedCash === null) displayedCash = target;
  if (Math.abs(displayedCash - target) < 0.05) {
    displayedCash = target; el.textContent = fmtM(target);
    el.classList.toggle("neg", target < 0); return;
  }
  if (cashRaf) cancelAnimationFrame(cashRaf);
  var from = displayedCash, start = null;
  function step(ts) {
    if (!start) start = ts;
    var p = Math.min(1, (ts - start) / 700);
    displayedCash = from + (target - from) * (1 - Math.pow(1 - p, 3));
    el.textContent = fmtM(displayedCash);
    el.classList.toggle("neg", target < 0);
    if (p < 1) cashRaf = requestAnimationFrame(step);
  }
  cashRaf = requestAnimationFrame(step);
}
function confettiBurst() {
  if (!document.body) return;
  var cols = ["#d4a94e", "#f2d488", "#e87b9c", "#7ad4a3", "#8fd4f7"];
  for (var i = 0; i < 60; i++) {
    var d = document.createElement("div");
    d.className = "confetti";
    d.style.left = (Math.random() * 100) + "vw";
    d.style.background = cols[i % cols.length];
    d.style.animationDelay = (Math.random() * 0.6) + "s";
    d.style.animationDuration = (1.8 + Math.random() * 1.4) + "s";
    document.body.appendChild(d);
    (function (el) { setTimeout(function () { el.remove(); }, 3600); })(d);
  }
}
function heatChips() {
  var gs = unlockedGenres(S.week), out = "";
  for (var i = 0; i < gs.length; i++) {
    var g = gs[i], tr = genreTrend(g), h = genreHeat(g);
    out += "<span class='chip " + (tr === "up" ? "up" : tr === "down" ? "down" : "") + "'>" +
      GENRES[g].icon + " " + GENRES[g].name + " " +
      (tr === "up" ? "▲" : tr === "down" ? "▼" : "•") + "</span>";
  }
  return out;
}
function filmStageLabel(f) {
  return { production: "🎬 In production", ready: "✅ Ready", scheduled: "📅 Dated " + dateStr(f.releaseWeek),
    theatrical: "🎟 In theaters W" + (f.weekNum + 1), released: "🏁 Released" }[f.stage] || f.stage;
}

/* ============ Studio tab ============ */
function renderStudio() {
  var el = $("view-studio");
  var released = S.films.filter(function (f) { return f.stage === "released"; });
  var avgC = released.length ? Math.round(released.reduce(function (a, f) { return a + f.critic; }, 0) / released.length) : 0;
  var inProd = S.films.filter(function (f) { return f.stage === "production"; }).length;
  var inTheaters = S.films.filter(function (f) { return f.stage === "theatrical"; }).length;
  var lotC = lotUpgradeCost();
  var html = "<h2 class='sec'>🎬 Studio Lot</h2><div class='sub'>" + eraOf(dateOf(S.week).y) + " · " + dateStr(S.week) + "</div>" +
    "<div class='card' style='padding:8px'>" + lotSVG() + "</div>" +
    "<div class='grid2'>" +
    "<div class='stat'><div class='v'>" + fmtM(S.cash) + "</div><div class='k'>Cash</div></div>" +
    "<div class='stat'><div class='v'>" + fmtM(studioValue()) + "</div><div class='k'>Studio value</div></div>" +
    "<div class='stat'><div class='v'>" + released.length + "</div><div class='k'>Films released</div></div>" +
    "<div class='stat'><div class='v'>" + (avgC || "—") + "</div><div class='k'>Avg critic score</div></div>" +
    "</div>" +
    "<div class='card mt'><h3>🏗 Lot level " + lotLevel() + "</h3>" +
    "<div class='sub'>Roster: " + S.talent.filter(function(t){return t.hired && t.type==="actor";}).length + "/" + rosterCap().actor + " actors · " +
    S.talent.filter(function(t){return t.hired && t.type==="director";}).length + "/" + rosterCap().director + " directors</div>" +
    (lotC !== null
      ? "<button class='btn amber small' onclick='buyLot()'>Upgrade lot — " + fmtM(lotC) + "</button>"
      : "<span class='pill'>Max level</span>") +
    "</div>" +
    "<h2 class='sec'>📈 Audience tastes</h2><div class='card'>" + heatChips() +
    "<div class='sub' style='margin:8px 0 0'>▲ heating up · ▼ cooling off. Time your genres.</div></div>" +
    "<h2 class='sec'>🎥 Right now</h2><div class='card'>" +
    "<div class='kv'><span>In production</span><b>" + inProd + "</b></div>" +
    "<div class='kv'><span>In theaters</span><b>" + inTheaters + "</b></div>" +
    "<div class='kv'><span>Monthly burn</span><b class='neg'>" + fmtM(monthlyBurn()) + "</b></div>" +
    "<div class='kv'><span>Hits / Flops</span><b>" + S.stats.hits + " / " + S.stats.flops + "</b></div>" +
    "</div>";
  var relWall = S.films.filter(function (f) { return f.stage === "released"; }).slice(-10).reverse();
  if (relWall.length) {
    html += "<h2 class='sec'>🎞 Poster wall</h2><div class='poster-wall'>" +
      relWall.map(function (f) { return posterImg(f).replace("class='pthumb'", ""); }).join("") + "</div>";
  }
  html += "<h2 class='sec'>📰 Studio wire</h2><div class='card log'>" +
    S.log.slice(0, 25).map(function (e) { return "<div><span class='t'>" + dateStr(e.w) + "</span>" + e.msg + "</div>"; }).join("") +
    "</div>";
  el.innerHTML = html;
}
function monthlyBurn() {
  var b = 0;
  for (var i = 0; i < S.talent.length; i++) if (S.talent[i].hired && !S.talent[i].retired) b += S.talent[i].salary / 12;
  return b + 0.15 * (1 + lotLevel());
}

/* ============ Films tab ============ */
function filmRow(f, body) {
  return "<div class='filmrow'>" + posterImg(f) +
    "<div class='finfo'><div class='pt'>" + f.title + "</div>" +
    "<div class='pg'>" + GENRES[f.genre].icon + " " + GENRES[f.genre].name + "</div>" + body + "</div></div>";
}
function renderFilms() {
  var el = $("view-films");
  var prod = S.films.filter(function (f) { return f.stage === "production"; });
  var ready = S.films.filter(function (f) { return f.stage === "ready"; });
  var sched = S.films.filter(function (f) { return f.stage === "scheduled"; });
  var theat = S.films.filter(function (f) { return f.stage === "theatrical"; });
  var rel = S.films.filter(function (f) { return f.stage === "released"; }).slice(-8).reverse();
  var html = "<h2 class='sec'>🎞 Films</h2>";

  if (prod.length) {
    html += "<h2 class='sec'>🎬 In production</h2>";
    prod.forEach(function (f) {
      var pct = Math.round(f.progress / f.weeksTotal * 100);
      html += filmRow(f,
        "<div class='bar'><i style='width:" + pct + "%'></i></div>" +
        "<div class='meta'><span>" + pct + "% · " + f.weeksLeft + " wks left · " + fmtM(f.budget) + "</span></div>");
    });
  }
  if (ready.length) {
    html += "<h2 class='sec'>✅ Ready to release</h2>";
    ready.forEach(function (f) {
      html += filmRow(f,
        "<div class='meta'><span>quality " + f.quality + "/100</span></div>" +
        "<div class='meta'><button class='btn amber small' onclick='releaseModal(\"" + f.id + "\")'>📅 Date the release</button></div>");
    });
  }
  if (sched.length) {
    html += "<h2 class='sec'>📅 Dated</h2>";
    sched.forEach(function (f) {
      html += filmRow(f,
        "<div class='meta'><span>" + dateStr(f.releaseWeek) + " · " + fmtM(f.marketing) + " marketing</span></div>");
    });
  }
  if (theat.length) {
    html += "<h2 class='sec'>🎟 In theaters</h2>";
    theat.forEach(function (f) {
      var last = f.weeklyGross.length ? f.weeklyGross[f.weeklyGross.length - 1] : 0;
      html += filmRow(f,
        "<div class='meta'><span>Week " + (f.weekNum + 1) + " · " + fmtM(last) + " this week · " + fmtM(f.totalGross) + " total</span></div>" +
        grossBars(f));
    });
  }
  html += "<h2 class='sec'>📝 Script market</h2><div class='sub'>Script office tier " + S.scriptTier + " (win awards to upgrade)</div>";
  S.scripts.forEach(function (s) {
    html += "<div class='card'><div class='row'><div><b>" + s.title + "</b><div class='sub' style='margin:2px 0 0'>" +
      GENRES[s.genre].icon + " " + GENRES[s.genre].name + " · <span class='stars'>" + stars(s.quality) + "</span></div></div>" +
      "<button class='btn amber small' onclick='buyScript(\"" + s.id + "\")'>" + fmtM(s.price) + "</button></div></div>";
  });
  if (S.scriptsOwned && S.scriptsOwned.length) {
    html += "<h2 class='sec'>📚 Owned scripts</h2>";
    S.scriptsOwned.forEach(function (s) {
      html += "<div class='card'><div class='row'><div><b>" + s.title + "</b><div class='sub' style='margin:2px 0 0'>" +
        GENRES[s.genre].icon + " " + GENRES[s.genre].name + " · <span class='stars'>" + stars(s.quality) + "</span></div></div>" +
        "<button class='btn amber small' onclick='greenlightModal(\"" + s.id + "\")'>Greenlight</button></div></div>";
    });
  }
  if (rel.length) {
    html += "<h2 class='sec'>🏁 Released</h2>";
    rel.forEach(function (f) {
      var profit = f.totalGross * 0.5 - f.budget - f.marketing;
      html += filmRow(f,
        "<div class='meta'><span>critic " + f.critic + "/100 · gross " + fmtM(f.totalGross) + "</span>" +
        "<span class='" + (profit >= 0 ? "pos" : "neg") + "'>" + (profit >= 0 ? "+" : "") + fmtM(profit) + "</span></div>" +
        grossBars(f) +
        (!f.sequelOf ? "<div class='meta'><button class='btn ghost small' onclick='makeSequel(\"" + f.id + "\")'>🎬 Sequel</button></div>" : ""));
    });
  }
  el.innerHTML = html;
}
function buyScript(id) {
  var i = -1;
  for (var k = 0; k < S.scripts.length; k++) if (S.scripts[k].id === id) i = k;
  if (i < 0) return;
  var s = S.scripts[i];
  if (S.cash < s.price) { toast("Not enough cash."); return; }
  S.cash -= s.price;
  S.scripts.splice(i, 1);
  S.scriptsOwned = S.scriptsOwned || [];
  S.scriptsOwned.push(s);
  // replace with a fresh script
  S.scripts.push(genScript());
  log("📝 Bought script: <b>" + s.title + "</b> (" + stars(s.quality) + ").");
  save(); renderAll();
}

/* ============ Talent tab ============ */
function renderTalent() {
  var el = $("view-talent");
  var actors = S.talent.filter(function (t) { return t.hired && t.type === "actor" && !t.retired; });
  var dirs = S.talent.filter(function (t) { return t.hired && t.type === "director" && !t.retired; });
  var retired = S.talent.filter(function (t) { return t.hired && t.retired; });
  function tcard(t) {
    var sc = t.stress > 75 ? "stress-high" : t.stress > 40 ? "stress-mid" : "stress-low";
    var filming = isFilming(t.id);
    return "<div class='card'><div class='talent-card'><div class='avatar'>" + t.name[0] + "</div><div style='flex:1'>" +
      "<b>" + t.name + "</b> <span class='pill'>" + t.age + "</span>" + (filming ? " <span class='pill'>🎬 filming</span>" : "") +
      "<div class='sub' style='margin:2px 0'>Talent " + t.talent + " · Fame " + t.fame + " · " + t.films + " films</div>" +
      "<div class='sub' style='margin:2px 0'>Salary " + fmtM(t.salary) + "/yr · Stress <b class='" + sc + "'>" + Math.round(t.stress) + "</b></div>" +
      "<div class='bar'><i class='" + (t.stress > 75 ? "bad" : "") + "' style='width:" + t.stress + "%'></i></div>" +
      "</div><button class='btn ghost small' onclick='fireTalent(\"" + t.id + "\")'>Let go</button></div></div>";
  }
  var html = "<h2 class='sec'>⭐ Talent</h2>" +
    "<div class='card'><div class='row'><div><b>Scout for talent</b><div class='sub' style='margin:2px 0 0'>Find 3 candidates — " + fmtM(2) + "</div></div>" +
    "<button class='btn amber small' onclick='scoutModal({count:3})'>Scout</button></div></div>" +
    "<h2 class='sec'>🎭 Actors (" + actors.length + "/" + rosterCap().actor + ")</h2>" +
    (actors.length ? actors.map(tcard).join("") : "<div class='card sub'>No actors. Scout some!</div>") +
    "<h2 class='sec'>🎥 Directors (" + dirs.length + "/" + rosterCap().director + ")</h2>" +
    (dirs.length ? dirs.map(tcard).join("") : "<div class='card sub'>No directors.</div>") +
    (retired.length ? "<h2 class='sec'>👋 Retired</h2>" + retired.map(function (t) {
      return "<div class='card sub'>" + t.name + " — " + t.films + " films, retired at 70.</div>";
    }).join("") : "");
  el.innerHTML = html;
}
function fireTalent(id) {
  var t = talentById(id);
  if (!t || isFilming(id)) { toast("They're mid-production!"); return; }
  t.hired = false;
  log("🚪 " + t.name + " released from the studio.");
  save(); renderAll();
}

/* ============ Market tab ============ */
function renderMarket() {
  var el = $("view-market");
  // 12-week calendar
  var html = "<h2 class='sec'>📅 Release calendar</h2><div class='sub'>Your dated films vs rival studios. Avoid their tentpoles (hype 70+).</div><div class='cal'>";
  for (var k = 0; k < 12; k++) {
    var w = S.week + k, d = dateOf(w);
    html += "<div class='wk" + (k === 0 ? " now" : "") + "'><div class='d'>" + d.m + " " + d.y + "</div>";
    S.films.forEach(function (f) {
      if (f.stage === "scheduled" && f.releaseWeek === w)
        html += "<div class='rel'>🎬 " + f.title.slice(0, 14) + "</div>";
    });
    S.rivals.forEach(function (rv) {
      rv.slate.forEach(function (s) {
        if (s.week === w)
          html += "<div class='rel rival' title='" + rv.name + "'>" + GENRES[s.genre].icon + " " + s.title.slice(0, 12) + " (" + s.hype + ")</div>";
      });
    });
    html += "</div>";
  }
  html += "</div>";
  // genre heat table
  html += "<h2 class='sec'>📈 Genre heat</h2><div class='card'>";
  var gs = unlockedGenres(S.week);
  gs.forEach(function (g) {
    var h = genreHeat(g), tr = genreTrend(g);
    html += "<div class='kv'><span>" + GENRES[g].icon + " " + GENRES[g].name + "</span><b class='" +
      (tr === "up" ? "pos" : tr === "down" ? "neg" : "") + "'>" + (h * 100).toFixed(0) + "% " +
      (tr === "up" ? "▲" : tr === "down" ? "▼" : "•") + "</b></div>";
  });
  html += "</div>";
  // tech tree
  html += "<h2 class='sec'>🔬 Technology</h2><div class='sub'>Research first for an innovator edge (+quality, 2 yrs).</div>";
  var y = dateOf(S.week).y;
  TECHS.forEach(function (t) {
    var st = S.techs[t.id];
    var locked = y < t.year;
    html += "<div class='card'><div class='row'><div><b>" + t.name + "</b>" +
      (locked ? " <span class='pill'>🔒 " + t.year + "</span>" : "") +
      "<div class='sub' style='margin:2px 0 0'>" + t.desc + "</div></div>" +
      (st ? (st.status === "owned" ? "<span class='pill'>✅ Owned</span>"
          : "<span class='pill'>🔬 " + st.weeksLeft + " wks</span>")
        : locked ? "" : "<button class='btn amber small' onclick='researchTech(\"" + t.id + "\")'>" + fmtM(t.cost) + "</button>") +
      "</div></div>";
  });
  // rivals
  html += "<h2 class='sec'>🏢 Rival studios</h2>";
  S.rivals.forEach(function (rv) {
    html += "<div class='card'><b>" + rv.name + "</b><div class='sub' style='margin:4px 0'>Upcoming: " +
      (rv.slate.length ? rv.slate.slice(0, 3).map(function (s) {
        return GENRES[s.genre].icon + " " + s.title + " (" + dateStr(s.week) + ")";
      }).join(" · ") : "quiet…") + "</div></div>";
  });
  el.innerHTML = html;
}

/* ============ Awards tab ============ */
function renderAwards() {
  var el = $("view-awards");
  var html = "<h2 class='sec'>🏆 Awards</h2>" +
    "<div class='stat'><div class='v'>★ " + S.prestige + "</div><div class='k'>Prestige</div></div>" +
    "<div class='sub' style='margin:8px 0'>Win December awards for prestige. Spend it on game-changing perks.</div>";
  PRESTIGE_SHOP.forEach(function (it) {
    var owned = (it.id === "arthouse" && S.arthouse) || (it.id === "shield" && S.shieldUntil > S.week);
    html += "<div class='card'><div class='row'><div><b>" + it.name + "</b><div class='sub' style='margin:2px 0 0'>" + it.desc + "</div></div>" +
      (owned ? "<span class='pill'>Owned</span>"
        : "<button class='btn amber small' " + (S.prestige < it.cost ? "disabled" : "") + " onclick='buyPrestige(\"" + it.id + "\")'>★ " + it.cost + "</button>") +
      "</div></div>";
  });
  if (S.scriptTier < 3) {
    html += "<div class='card'><div class='row'><div><b>📝 Script office tier " + (S.scriptTier + 1) + "</b>" +
      "<div class='sub' style='margin:2px 0 0'>Unlock " + (S.scriptTier + 1 === 2 ? "4★" : "5★") + " scripts</div></div>" +
      "<button class='btn amber small' " + (S.stats.awardsWon < 2 ? "disabled" : "") + " onclick='upgradeScriptOffice()'>" +
      (S.stats.awardsWon < 2 ? "Need 2 awards" : "★ 3") + "</button></div></div>";
  }
  html += "<h2 class='sec'>📜 Past ceremonies</h2>";
  if (!S.awards.length) html += "<div class='card sub'>No ceremonies yet. December comes every year…</div>";
  S.awards.slice(0, 6).forEach(function (a) {
    html += "<div class='card'><b>Awards " + a.year + "</b>" + a.results.map(function (r) {
      return "<div class='kv'><span>" + r.cat + "</span><b>" + r.title + " <span class='sub'>(" + r.studio + ")</span></b></div>";
    }).join("") + "</div>";
  });
  el.innerHTML = html;
}
function upgradeScriptOffice() {
  if (S.stats.awardsWon < 2 || S.prestige < 3 || S.scriptTier >= 3) return;
  S.prestige -= 3; S.scriptTier++;
  log("📝 Script office upgraded to tier " + S.scriptTier + "! Better scripts incoming.");
  save(); renderAll();
}

/* ============ modals ============ */
var GL = null; // greenlight draft
function greenlightModal(scriptId) {
  var s = null;
  S.scriptsOwned = S.scriptsOwned || [];
  for (var i = 0; i < S.scriptsOwned.length; i++) if (S.scriptsOwned[i].id === scriptId) s = S.scriptsOwned[i];
  if (!s) return;
  var dirs = S.talent.filter(function (t) { return t.hired && t.type === "director" && !t.retired && !isFilming(t.id); });
  var actors = S.talent.filter(function (t) { return t.hired && t.type === "actor" && !t.retired && !isFilming(t.id); });
  if (!dirs.length) { toast("No available director — hire or wait."); return; }
  GL = { scriptId: scriptId, directorId: dirs[0].id, castIds: [], budget: Math.round(idealBudget(s.quality)) };
  var ideal = idealBudget(s.quality);
  var html = "<h2>🎬 Greenlight: " + s.title + "</h2>" +
    "<div class='row'><div style='flex:1'><p class='sub'>" + GENRES[s.genre].icon + " " + GENRES[s.genre].name + " · script " + stars(s.quality) + "</p></div>" +
    posterImg({ title: s.title, genre: s.genre, scriptStars: s.quality }, "pthumb small") + "</div>" +
    "<div class='fld'><label>Director</label><select id='glDir'>" +
    dirs.map(function (d) { return "<option value='" + d.id + "'>" + d.name + " (talent " + d.talent + ")</option>"; }).join("") +
    "</select></div>" +
    "<div class='fld'><label>Cast (up to 3)</label><div class='opt-row' id='glCast'>" +
    actors.map(function (a) {
      return "<span class='opt' data-id='" + a.id + "' onclick='glToggleCast(\"" + a.id + "\")'>" + a.name + " ★" + a.fame + "</span>";
    }).join("") + "</div></div>" +
    "<div class='fld'><label>Budget: <b id='glBudgetLabel'>" + fmtM(GL.budget) + "</b> <span class='sub'>(sweet spot ~" + fmtM(ideal) + ")</span></label>" +
    "<input type='range' id='glBudget' min='0.5' max='" + Math.max(10, Math.round(ideal * 3)) + "' step='0.5' value='" + GL.budget + "' oninput='GL.budget=parseFloat(this.value);$(\"glBudgetLabel\").textContent=fmtM(GL.budget)'>" +
    "</div>" +
    "<div class='kv'><span>Total cost (budget + script)</span><b id='glTotal'>" + fmtM(GL.budget + s.price) + "</b></div>" +
    "<div class='mt'><button class='btn amber' onclick='glConfirm()'>🎬 Start production</button>" +
    "<button class='btn ghost' onclick='closeModal()'>Cancel</button></div>";
  pauseForModal();
  showModal(html);
}
function glToggleCast(id) {
  var i = GL.castIds.indexOf(id);
  var el = document.querySelector("#glCast [data-id='" + id + "']");
  if (i >= 0) { GL.castIds.splice(i, 1); el.classList.remove("on"); }
  else if (GL.castIds.length < 3) { GL.castIds.push(id); el.classList.add("on"); }
}
function glConfirm() {
  GL.directorId = $("glDir").value;
  var f = greenlight(GL.scriptId, GL.directorId, GL.castIds, GL.budget);
  GL = null;
  closeModal();
  if (f) { toast("🎬 Production started!"); renderAll(); }
  else toast("Not enough cash.");
}

function releaseModal(filmId) {
  var f = null;
  for (var i = 0; i < S.films.length; i++) if (S.films[i].id === filmId) f = S.films[i];
  if (!f) return;
  window._relFilm = filmId; window._relWeek = S.week + 2; window._relMkt = Math.round(f.budget * 0.5);
  var html = "<h2>📅 Release: " + f.title + "</h2>" +
    "<p class='sub'>Quality " + f.quality + "/100 · " + GENRES[f.genre].icon + " " + GENRES[f.genre].name +
    " (heat " + Math.round(genreHeat(f.genre) * 100) + "%)</p>" +
    "<div class='fld'><label>Release week</label><select id='relWeek'>" +
    (function () { var o = ""; for (var k = 1; k <= 12; k++) { var w = S.week + k; o += "<option value='" + w + "'" + (k === 2 ? " selected" : "") + ">" + dateStr(w) + rivalHint(w) + "</option>"; } return o; })() +
    "</select><div class='sub'>⚠️ = rival tentpole that week — expect a smaller opening.</div></div>" +
    "<div class='fld'><label>Marketing: <b id='relMktLabel'>" + fmtM(window._relMkt) + "</b></label>" +
    "<input type='range' id='relMkt' min='0' max='" + Math.round(f.budget * 1.5) + "' step='0.5' value='" + window._relMkt + "' " +
    "oninput='window._relMkt=parseFloat(this.value);$(\"relMktLabel\").textContent=fmtM(window._relMkt)+overWarn(" + f.budget + ")'>" +
    "<div class='sub' id='relWarn'>Over-spending (>" + fmtM(f.budget * 0.8) + ") risks over-exposure backlash.</div></div>" +
    "<div class='mt'><button class='btn amber' onclick='relConfirm()'>📣 Lock it in</button>" +
    "<button class='btn ghost' onclick='closeModal()'>Cancel</button></div>";
  pauseForModal();
  showModal(html);
}
function overWarn(budget) { return ""; }
function rivalHint(w) {
  for (var r = 0; r < S.rivals.length; r++)
    for (var i = 0; i < S.rivals[r].slate.length; i++) {
      var s = S.rivals[r].slate[i];
      if (s.week === w && s.hype > 70) return " ⚠️ " + S.rivals[r].name;
    }
  return "";
}
function relConfirm() {
  var ok = releaseFilm(window._relFilm, parseInt($("relWeek").value), window._relMkt);
  closeModal();
  if (ok) { toast("📅 Release dated!"); renderAll(); }
  else toast("Not enough cash for marketing.");
}

function dilemmaModal(p) {
  var f = null;
  for (var i = 0; i < S.films.length; i++) if (S.films[i].id === p.filmId) f = S.films[i];
  if (!f) { resumeFromModal(); return; }
  var html = "<h2>🎬 Set crisis</h2><p><b>" + f.title + "</b></p><p>" + p.d.text + "</p>";
  p.d.choices.forEach(function (c, i) {
    var fx = [];
    if (c.q) fx.push((c.q > 0 ? "+" : "") + c.q + " quality");
    if (c.cost) fx.push(fmtM(c.cost));
    if (c.weeks) fx.push((c.weeks > 0 ? "+" : "") + c.weeks + " wks");
    html += "<button class='choice' onclick='dilemmaPick(" + i + ")'><b>" + c.t + "</b><small>" + c.s +
      (fx.length ? " <i>(" + fx.join(" · ") + ")</i>" : "") + "</small></button>";
  });
  window._dilemma = p;
  showModal(html);
}
function dilemmaPick(i) {
  var p = window._dilemma, c = p.d.choices[i];
  var f = null;
  for (var k = 0; k < S.films.length; k++) if (S.films[k].id === p.filmId) f = S.films[k];
  if (f) {
    f.qmod += c.q || 0;
    if (c.cost) { f.budget += c.cost; S.cash -= c.cost; }
    if (c.weeks) { f.weeksTotal += c.weeks; f.weeksLeft += c.weeks; }
    if (c.buzz) f.buzz += c.buzz;
    if (c.stress) eachTalent(f.castIds.concat([f.directorId]), function (t) { t.stress = clamp(t.stress + c.stress, 0, 100); });
    log("🎲 <b>" + f.title + ":</b> " + c.t + ".");
  }
  window._dilemma = null;
  closeModal(); renderAll();
}

function poachModal(p) {
  var t = talentById(p.talentId);
  if (!t || !t.hired) { resumeFromModal(); return; }
  showModal("<h2>💼 Poach attempt!</h2><p><b>" + p.rival + "</b> is courting <b>" + t.name + "</b> with " +
    fmtM(p.offer) + "/yr (now " + fmtM(t.salary) + "/yr).</p>" +
    "<button class='choice' onclick='poachPick(1)'><b>Match it</b><small>Keep them at " + fmtM(p.offer) + "/yr.</small></button>" +
    "<button class='choice' onclick='poachPick(0)'><b>Let them go</b><small>Wish them well. Jerk.</small></button>");
  window._poach = p;
}
function poachPick(keep) {
  var p = window._poach, t = talentById(p.talentId);
  if (t) {
    if (keep) { t.salary = p.offer; log("💼 You matched the offer — " + t.name + " stays."); }
    else { t.hired = false; log("🚪 " + t.name + " jumps to " + p.rival + "."); }
  }
  window._poach = null;
  closeModal(); renderAll();
}

function scoutModal(o) {
  o.cands = o.cands || [];
  while (o.cands.length < o.count) o.cands.push(genTalent(Math.random() < 0.7 ? "actor" : "director", false));
  if (o.famed) o.cands.forEach(function (c) { c.fame = ri(70, 95); c.talent = ri(60, 95); c.salary = calcSalary(c); });
  var html = "<h2>🔭 Scouting report</h2><p class='sub'>" + pick(SCOUT_FLAVOR) + ", " + pick(SCOUT_FLAVOR) + ", " + pick(SCOUT_FLAVOR) + "…</p>";
  o.cands.forEach(function (c, i) {
    var bonus = Math.round(c.salary * 0.5 * 10) / 10;
    var cap = rosterCap()[c.type];
    var cur = S.talent.filter(function (t) { return t.hired && t.type === c.type && !t.retired; }).length;
    html += "<div class='card'><div class='row'><div><b>" + c.name + "</b> <span class='pill'>" + c.type + "</span>" +
      "<div class='sub' style='margin:2px 0 0'>Age " + c.age + " · Talent " + c.talent + " · Fame " + c.fame +
      " · " + fmtM(c.salary) + "/yr</div></div>" +
      (cur >= cap ? "<span class='pill'>Roster full</span>"
        : "<button class='btn amber small' onclick='scoutHire(" + i + ")'>Sign " + fmtM(bonus) + "</button>") +
      "</div></div>";
  });
  html += "<button class='btn ghost' onclick='closeModal()'>Pass</button>";
  window._scout = o;
  showModal(html);
}
function scoutHire(i) {
  var o = window._scout, c = o.cands[i];
  var bonus = Math.round(c.salary * 0.5 * 10) / 10;
  var cap = rosterCap()[c.type];
  var cur = S.talent.filter(function (t) { return t.hired && t.type === c.type && !t.retired; }).length;
  if (cur >= cap || S.cash < bonus + 2 && !o.free) { }
  var cost = (o.free ? 0 : 2) + bonus;
  if (S.cash < cost) { toast("Not enough cash."); return; }
  S.cash -= cost;
  c.hired = true;
  S.talent.push(c);
  o.cands.splice(i, 1);
  log("✍️ Signed <b>" + c.name + "</b> (" + c.type + ").");
  save();
  if (!o.cands.length) { window._scout = null; closeModal(); }
  else scoutModal(o);
  renderAll();
}

function eventModal(ev) {
  showModal("<h2>🌍 " + ev.name + "</h2><p>" + ev.text + "</p>" +
    "<button class='btn amber' onclick='closeModal()'>Understood</button>");
}
function awardsModal(a) {
  var html = "<h2>🏆 Awards " + a.year + "</h2>";
  a.results.forEach(function (r) {
    html += "<div class='kv'><span>" + r.cat + "</span><b>" + r.title + "<br><span class='sub'>" + r.studio + "</span></b></div>";
  });
  // script office upgrade check
  if (S.scriptTier === 1 && S.stats.awardsWon >= 2) { S.scriptTier = 2; log("📝 Script office tier 2 unlocked by awards!"); }
  else if (S.scriptTier === 2 && S.stats.awardsWon >= 6) { S.scriptTier = 3; log("📝 Script office tier 3 unlocked by awards!"); }
  html += "<button class='btn amber mt' onclick='closeModal()'>Take a bow</button>";
  showModal(html);
}
function winModal() {
  showModal("<h2>👑 Hollywood Legend!</h2><p>Your studio is worth over <b>$1B</b>. From westerns to world domination — the town is yours.</p>" +
    "<div class='kv'><span>Films released</span><b>" + S.stats.released + "</b></div>" +
    "<div class='kv'><span>Awards won</span><b>" + S.stats.awardsWon + "</b></div>" +
    "<div class='kv'><span>Total box office</span><b>" + fmtM(S.stats.totalGross) + "</b></div>" +
    "<button class='btn amber mt' onclick='closeModal()'>Keep building the empire</button>");
}
function gameOverModal() {
  showModal("<h2>💸 Bankrupt</h2><p>The studio gates close. The final reel:</p>" +
    "<div class='kv'><span>Films released</span><b>" + S.stats.released + "</b></div>" +
    "<div class='kv'><span>Awards won</span><b>" + S.stats.awardsWon + "</b></div>" +
    "<div class='kv'><span>Total box office</span><b>" + fmtM(S.stats.totalGross) + "</b></div>" +
    "<button class='btn amber mt' onclick='newGame();closeModal();renderAll();startLoop();'>🎬 Start a new studio</button>");
}
function tutorialModal() {
  showModal("<h2>🎬 Welcome to Reel Empire</h2>" +
    "<p><b>1.</b> Buy a <b>script</b> in Films, then <b>greenlight</b> it with a director, cast and budget.</p>" +
    "<p><b>2.</b> Survive production crises, then <b>date the release</b> — dodge rival tentpoles and ride hot genres (📈).</p>" +
    "<p><b>3.</b> Collect box office, win <b>awards</b> for ★ prestige, research <b>tech</b>, and don't go bankrupt.</p>" +
    "<p class='sub'>Time advances automatically. Check in anytime — the studio keeps running (a little) while you're away.</p>" +
    "<button class='btn amber' onclick='closeModal()'>Roll camera! 🎥</button>");
}

/* ============ init ============ */
function init() {
  var had = load();
  if (!had || !S || S.gameOver) {
    if (S && S.gameOver) { try { localStorage.removeItem(LS_KEY); } catch (e) {} }
    newGame();
  }
  // wire nav
  var btns = document.querySelectorAll("#bottomnav button");
  for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener("click", function () { switchTab(this.dataset.tab); });
  }
  $("spdPause").addEventListener("click", function () { setSpeed(0); startLoop(); });
  $("spd1").addEventListener("click", function () { setSpeed(1); startLoop(); });
  $("spd3").addEventListener("click", function () { setSpeed(3); startLoop(); });
  switchTab("studio");
  startLoop();
  if (!S.tutorial) { S.tutorial = true; save(); tutorialModal(); }
  else offlineProgress();
  renderAll();
}

/* Expose UI handlers to inline onclick attributes (this file is an IIFE,
   so without this every button in the game is dead). */
window.closeModal = closeModal;
window.newGame = newGame;
window.switchTab = switchTab;
window.buyLot = buyLot;
window.buyScript = buyScript;
window.greenlightModal = greenlightModal;
window.glToggleCast = glToggleCast;
window.glConfirm = glConfirm;
window.releaseModal = releaseModal;
window.relConfirm = relConfirm;
window.dilemmaPick = dilemmaPick;
window.poachPick = poachPick;
window.scoutModal = scoutModal;
window.scoutHire = scoutHire;
window.fireTalent = fireTalent;
window.researchTech = researchTech;
window.buyPrestige = buyPrestige;
window.upgradeScriptOffice = upgradeScriptOffice;
window.makeSequel = makeSequel;

document.addEventListener("DOMContentLoaded", init);
})();
