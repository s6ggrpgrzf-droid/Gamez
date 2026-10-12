/* Skylark — a bush pilot's tale. Render + input + screens.
 * Visual identity: vintage aviation postcard. The world is the UI.
 */
'use strict';
/* globals SK, PX, AU */

function $(id) { return document.getElementById(id); }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }

/* ---------------- pilot persistence ---------------- */
var PILOT_KEY = 'skylark_pilot_v1';
function loadPilot() {
  try {
    var p = JSON.parse(localStorage.getItem(PILOT_KEY));
    if (p && typeof p.xp === 'number') return p;
  } catch (e) {}
  return SK.newPilot('Pilot');
}
function savePilot() {
  try { localStorage.setItem(PILOT_KEY, JSON.stringify(pilot)); } catch (e) {}
}
var pilot = loadPilot();
try {
  var savedName = localStorage.getItem('gamez_name');
  if (savedName) pilot.name = savedName;
} catch (e) {}

function keeperName() {
  try { return localStorage.getItem('gamez_name') || pilot.name || 'Pilot'; }
  catch (e) { return 'Pilot'; }
}

/* ---------------- date / seed ---------------- */
function dateKey() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
function hashStr(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0) || 1;
}

/* ---------------- toast ---------------- */
var toastT = null;
function toast(msg) {
  var el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(function () { el.classList.remove('show'); }, 2200);
}

/* ---------------- AI: skyvista (daily valley scenery) ---------------- */
var vistaCache = {}; // dateKey -> vista data
function seededVista(seed) {
  // local fallback: seeded, always works offline. AI enriches when reachable.
  var rnd = SK.rng(seed);
  var palettes = [
    { top: '#5aa9dd', mid: '#9fd4e8', bot: '#f9d976', sun: '#fff3c4', cloud: '255,255,255',
      hill1: '#8fae6e', hill2: '#6d9154', mtn: '#a8bdd0', far: '#c3d4e2', ground: '#a8c686' },
    { top: '#6a5f9e', mid: '#e08a6d', bot: '#ffcf7d', sun: '#ffe9b8', cloud: '255,235,220',
      hill1: '#7d8a68', hill2: '#5f7050', mtn: '#9a8ba8', far: '#b8a9c0', ground: '#93a06f' },
    { top: '#3d2f5e', mid: '#c65f4a', bot: '#ff9e4f', sun: '#ffdf9e', cloud: '255,220,200',
      hill1: '#6e7a5c', hill2: '#54604a', mtn: '#8d7390', far: '#a894a8', ground: '#86915f' },
    { top: '#4a90c4', mid: '#a8d8e8', bot: '#fdf6d8', sun: '#fffbe8', cloud: '255,255,255',
      hill1: '#9ab878', hill2: '#7a9c5e', mtn: '#b0c4d8', far: '#ccdcec', ground: '#b0cc8e' },
    { top: '#7b6ba8', mid: '#f0a080', bot: '#ffd8a0', sun: '#fff0c8', cloud: '255,240,225',
      hill1: '#8a9468', hill2: '#6a7452', mtn: '#a898b0', far: '#c4b4c8', ground: '#9aa878' },
  ];
  var pal = palettes[Math.floor(rnd() * palettes.length)];
  var lmTypes = ['water tower', 'barn', 'radio mast', 'windmill', 'church', 'lighthouse'];
  var landmarks = [];
  var nLm = 2 + Math.floor(rnd() * 3);
  for (var i = 0; i < nLm; i++)
    landmarks.push({ type: lmTypes[Math.floor(rnd() * lmTypes.length)], x: 0.1 + rnd() * 0.8 });
  // cloud variety: each cloud gets a type (1-4), opacity, drift
  var clouds = [];
  var nCl = 12 + Math.floor(rnd() * 10);
  for (var ci = 0; ci < nCl; ci++) {
    clouds.push({
      type: 1 + Math.floor(rnd() * 4),
      x: rnd(), y: 0.06 + rnd() * 0.42,
      s: 0.6 + rnd() * 1.4, o: 0.45 + rnd() * 0.4,
      v: 3 + rnd() * 9,
    });
  }
  return {
    date: dateKey(),
    ridges: [
      { seed: 1000 + Math.floor(rnd() * 90000), height: 110 + rnd() * 80, haze: 0.55 + rnd() * 0.2, snow: rnd() < 0.6 },
      { seed: 1000 + Math.floor(rnd() * 90000), height: 70 + rnd() * 60, haze: 0.35 + rnd() * 0.2, snow: false },
      { seed: 1000 + Math.floor(rnd() * 90000), height: 40 + rnd() * 50, haze: 0.15 + rnd() * 0.2, snow: false },
    ],
    palette: pal,
    sun: { x: 0.6 + rnd() * 0.2, y: 0.16 + rnd() * 0.14 },
    landmarks: landmarks,
    clouds: clouds,
    birds: { flocks: 1 + Math.floor(rnd() * 3) },
    godrays: rnd() < 0.7,
    _local: true,
  };
}
function fetchVista(st) {
  var dk = dateKey();
  // seeded fallback is live immediately; AI overwrites when reachable
  if (!vistaCache[dk]) vistaCache[dk] = seededVista(hashStr('skylark-vista-' + dk));
  F.vista = vistaCache[dk];
  try {
    fetch(AI_URL + '/g', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'skyvista', game: 'skylark', ctx: { date: dk } })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.ridges && d.palette && F) {
        vistaCache[dk] = d;
        F.vista = d;
      }
    }).catch(function () {});
  } catch (e) {}
}

/* ---------------- AI: skypax (named passengers) ---------------- */
var AI_URL = 'https://gamez-ai.chaoticutopia84.workers.dev';
function enrichPassengers(st) {
  // local fallback stories are already in sim; AI overwrites when reachable
  try {
    fetch(AI_URL + '/g', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'skypax', game: 'skylark',
        ctx: { date: dateKey(), count: st.pax.length, dest: st.route.to } })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.passengers && d.passengers.length) {
        for (var i = 0; i < st.pax.length && i < d.passengers.length; i++) {
          if (d.passengers[i].name) st.pax[i].name = String(d.passengers[i].name).slice(0, 40);
          if (d.passengers[i].story) st.pax[i].story = String(d.passengers[i].story).slice(0, 120);
        }
      }
    }).catch(function () {});
  } catch (e) {}
}

/* ---------------- leaderboard ---------------- */
var ARCADE_URL = 'https://gamez-arcade.chaoticutopia84.workers.dev';
function postScore(score) {
  try {
    fetch(ARCADE_URL + '/score', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'skylark', name: keeperName(), score: Math.round(score) }) })
      .catch(function () {});
  } catch (e) {}
}

/* ---------------- screens ---------------- */
var screen = 'title';
function show(id) {
  ['title', 'hangar', 'summary', 'manifest'].forEach(function (s) { $(s).classList.add('hidden'); });
  $('hud').classList.add('hidden');
  if (id) $(id).classList.remove('hidden');
  screen = id || 'flight';
  if (id === null) $('hud').classList.remove('hidden');
}

/* ---------------- hangar ---------------- */
var routes = [];
var selectedRoute = 0;

function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

function renderHangar() {
  $('pilot-name').textContent = pilot.name;
  $('pilot-rank').textContent = SK.RANKS[pilot.rank] || 'Student';
  $('pilot-money').textContent = money(pilot.money);

  // route cards
  var rc = $('route-cards');
  rc.innerHTML = '';
  routes.forEach(function (r, i) {
    var b = document.createElement('button');
    b.className = 'route-card';
    var wicon = r.weather === 'night' ? 'night' : r.weather;
    var mins = Math.max(1, Math.round(r.dist / 210 / 60 * 2) / 2);
    b.innerHTML =
      '<span class="rc-pay">' + money(r.payout) + '</span>' +
      '<div class="rc-route">' + r.from + ' &rarr; ' + r.to + '</div>' +
      '<div class="rc-meta">' + r.paxN + ' passengers &middot; ' + r.cargoN + ' cargo &middot; ' +
      '~' + mins + ' min &middot; ' + wicon +
      (r.wind ? ' &middot; wind ' + Math.abs(r.wind) + 'kts' : '') + '</div>' +
      '<span class="rc-go">FLY THIS ROUTE &rsaquo;</span>';
    b.addEventListener('click', function () { AU.click(); showManifest(i); });
    rc.appendChild(b);
  });

  // planes
  var pr = $('plane-row');
  pr.innerHTML = '';
  previewCanvases.length = 0; // re-rendered; drop stale refs
  SK.PLANES.forEach(function (pl) {
    var owned = pilot.planes.indexOf(pl.id) >= 0;
    var active = pilot.activePlane === pl.id;
    var d = document.createElement('div');
    d.className = 'plane-card' + (owned ? ' owned' : ' locked') + (active ? ' active' : '');
    d.innerHTML =
      '<canvas class="pc-preview" width="120" height="64"></canvas>' +
      '<div class="pc-name">' + pl.name + '</div>' +
      '<div class="pc-desc">' + pl.desc + '</div>' +
      '<div class="pc-foot">' + (owned
        ? (active ? '<span class="pc-owned">ready</span>' : '<span class="pc-owned">tap to ready</span>')
        : '<span class="pc-buy">buy ' + money(pl.price) + '</span>') + '</div>';
    d.addEventListener('click', function () {
      AU.click();
      if (owned) { pilot.activePlane = pl.id; savePilot(); renderHangar(); }
      else if (SK.buyPlane(pilot, pl.id)) {
        pilot.activePlane = pl.id; savePilot(); renderHangar();
        AU.coin(); toast('The ' + pl.name + ' is yours.');
      } else toast('Not enough for the ' + pl.name + ' yet.');
    });
    pr.appendChild(d);
    // animated preview: plane + spinning prop
    drawPlanePreview(d.querySelector('.pc-preview'), pl.id);
  });
  startPreviewLoop();

  // logbook
  var lb = $('logbook');
  lb.innerHTML = '<b>' + pilot.name + '</b> &middot; ' + (SK.RANKS[pilot.rank] || 'Student') +
    '<br>Flights: ' + pilot.flights + ' &middot; XP: ' + pilot.xp +
    '<br>Fleet: ' + pilot.planes.length + ' aircraft &middot; Hangar: ' + pilot.home +
    (pilot.best != null ? '<br>Best landing: ' + pilot.best : '');

  // training challenges
  var tr = $('training');
  tr.innerHTML = '';
  if (!pilot.training) { var np0 = SK.newPilot('x'); pilot.training = np0.training; pilot.trainingDone = np0.trainingDone; }
  SK.CHALLENGES.forEach(function (ch) {
    var cur = ch.id === 'greasers' ? Math.min(3, pilot.training.greasers) : Math.min(5, pilot.training.circuits);
    var done = !!pilot.trainingDone[ch.id];
    var d = document.createElement('div');
    d.className = 'train-card' + (done ? ' done' : '');
    var pips = '';
    for (var pi = 0; pi < ch.goal; pi++) pips += '<span class="pip' + (pi < cur ? ' on' : '') + '"></span>';
    d.innerHTML =
      '<div class="tc-name">' + ch.name + (done ? ' <span class="tc-stamp">CLEARED</span>' : '') + '</div>' +
      '<div class="tc-desc">' + ch.desc + '</div>' +
      '<div class="tc-pips">' + pips + '<span class="tc-xp">+' + ch.xp + ' XP</span></div>';
    tr.appendChild(d);
  });
}

/* hangar plane previews: tiny canvases with spinning props */
var previewCanvases = [];
function drawPlanePreview(cv, planeId) {
  previewCanvases.push({ cv: cv, id: planeId });
}
function startPreviewLoop() {
  if (startPreviewLoop.on) return;
  startPreviewLoop.on = true;
  var last = 0;
  (function loop(now) {
    requestAnimationFrame(loop);
    if (screen !== 'hangar') return;
    if (now - last < 90) return; // ~11fps is plenty for props
    last = now;
    var t = now / 1000;
    for (var i = 0; i < previewCanvases.length; i++) {
      var p = previewCanvases[i];
      if (!p.cv.isConnected) continue;
      var g = p.cv.getContext('2d');
      var spr = PX.get(p.id);
      g.clearRect(0, 0, 120, 64);
      // soft sky wash
      var bg = g.createLinearGradient(0, 0, 0, 64);
      bg.addColorStop(0, '#9fd4e8'); bg.addColorStop(1, '#f9d976');
      g.fillStyle = bg; g.fillRect(0, 0, 120, 64);
      // ground line
      g.fillStyle = '#a8c686'; g.fillRect(0, 52, 120, 12);
      var sc = 1.1;
      g.save();
      g.translate(60, 34); g.scale(sc, sc);
      g.drawImage(spr, -spr.width / 2, -spr.height / 2);
      drawProp(g, p.id, 0.35, t, 0.09); // idle-ish spin
      g.restore();
    }
  })(performance.now());
}

/* ---------------- summary ---------------- */
function showSummary(st, feeInfo) {
  var r = st.route;
  $('sum-route').textContent = r.from + ' → ' + r.to;
  $('sum-num').textContent = st.score;
  var word = st.verdict || (st.score >= 85 ? 'a greaser — butter' : st.score >= 65 ? 'a soft one' :
             st.score >= 40 ? 'a firm arrival' : 'an exciting arrival');
  $('sum-word').textContent = word;
  $('sum-pay').textContent = money(st.payout) + ' (hangar ' + money(feeInfo.fee) + ')';
  $('sum-xp').textContent = '+' + st.xpGain + ' XP';
  $('sum-pax').textContent = st.pax.length + ' souls';
  var say = st.pax.length ? '\u201C' + st.pax[0].name.split(' ')[0] + ': ' +
    (st.score >= 65 ? 'smoother than my morning coffee.' :
     st.score >= 40 ? 'I\'ve had worse. Barely.' : 'I\'m walking the last mile.') + '\u201D' : '';
  $('sum-paxsay').textContent = say;
  var award = $('sum-award');
  if (st.trainingAward) {
    award.textContent = 'Training cleared: ' + st.trainingAward.name + ' (+' + st.trainingAward.xp + ' XP)';
    award.classList.remove('hidden');
  } else {
    award.classList.add('hidden');
  }
  show('summary');
}

/* ---------------- boot ---------------- */
PX.init();
routes = SK.dailyRoutes(hashStr('skylark-' + dateKey()), pilot.home);

$('begin').addEventListener('click', function () {
  AU.ensure(); AU.click();
  $('title').classList.add('hide');
  setTimeout(function () { $('title').style.display = 'none'; }, 850);
  renderHangar();
  show('hangar');
});
$('to-title').addEventListener('click', function () {
  AU.click();
  $('title').style.display = 'flex';
  requestAnimationFrame(function () { $('title').classList.remove('hide'); });
  show('title');
});
$('b-again').addEventListener('click', function () { AU.click(); showManifest(selectedRoute); });
$('b-board').addEventListener('click', function () { AU.click(); AU.ensure(); startFlight(); });
$('b-manifest-back').addEventListener('click', function () { AU.click(); pendingFlight = null; renderHangar(); show('hangar'); });
$('b-hangar').addEventListener('click', function () { AU.click(); renderHangar(); show('hangar'); });
$('hud-mute').addEventListener('click', function (e) {
  e.stopPropagation();
  var m = AU.toggleMute();
  $('hud-mute').innerHTML = m ? '&#x266A;' : '&#x266B;';
});
$('view-toggle').addEventListener('click', function (e) {
  e.stopPropagation();
  AU.click();
  if (!F) return;
  F.view = (F.view === 'cockpit') ? 'side' : 'cockpit';
  $('view-toggle').textContent = (F.view === 'cockpit') ? 'outside' : 'cockpit';
  $('view-toggle').classList.toggle('on', F.view === 'cockpit');
});

document.addEventListener('visibilitychange', function () {
  if (document.hidden && typeof stopFlightLoop === 'function') stopFlightLoop();
});

/* ================= FLIGHT ================= */
'use strict';
/* globals SK, PX, AU, $, clamp, lerp, pilot, savePilot, enrichPassengers, postScore,
          showSummary, show, toast, dateKey, hashStr, keeperName */

var canvas = $('sky'), ctx2d = canvas.getContext('2d');
var DPR = 1, W = 0, H = 0;
function sizeCanvas() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  ctx2d.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', sizeCanvas);
sizeCanvas();

/* weather palettes */
var SKIES = {
  day:   { top: '#5aa9dd', mid: '#9fd4e8', bot: '#f9d976', sun: '#fff3c4', cloud: '255,255,255', hill1: '#8fae6e', hill2: '#6d9154', mtn: '#a8bdd0', ground: '#a8c686' },
  dawn:  { top: '#6a5f9e', mid: '#e08a6d', bot: '#ffcf7d', sun: '#ffe9b8', cloud: '255,235,220', hill1: '#7d8a68', hill2: '#5f7050', mtn: '#9a8ba8', ground: '#93a06f' },
  dusk:  { top: '#3d2f5e', mid: '#c65f4a', bot: '#ff9e4f', sun: '#ffdf9e', cloud: '255,220,200', hill1: '#6e7a5c', hill2: '#54604a', mtn: '#8d7390', ground: '#86915f' },
  night: { top: '#0b1526', mid: '#16294a', bot: '#2c4a6e', sun: '#f4ead8', cloud: '120,140,180', hill1: '#2c3d33', hill2: '#223028', mtn: '#2c3a55', ground: '#31453a' },
};

function makeDecor(seed, destX) {
  var rnd = SK.rng(seed ^ 0x9e3779b9);
  var trees = [];
  var n = Math.floor(destX / 260);
  for (var i = 0; i < n; i++) {
    var x = -500 + rnd() * (destX + 1800);
    // keep strips clear
    if (Math.abs(x) < 500 || Math.abs(x - destX) < 700) continue;
    var t = rnd();
    trees.push({ x: x, k: t < 0.45 ? 'pine' : (t < 0.8 ? 'round' : 'birch'),
                 s: 0.8 + rnd() * 0.7 });
  }
  var clouds = [];
  for (var c = 0; c < 16; c++)
    clouds.push({ x: rnd() * (destX + 2000) - 600, y: 0.08 + rnd() * 0.4, s: 0.7 + rnd() * 1.3, v: 4 + rnd() * 8 });
  var stars = [];
  for (var s2 = 0; s2 < 90; s2++) stars.push({ x: rnd(), y: rnd() * 0.6, tw: rnd() * 6.28 });
  var houses = [];
  for (var hI = 0; hI < 5; hI++)
    houses.push({ x: 900 + rnd() * (destX - 1800), s: 0.9 + rnd() * 0.4 });
  return {
    trees: trees, clouds: clouds, stars: stars, houses: houses,
    p1: rnd() * 6.28, p2: rnd() * 6.28, p3: rnd() * 6.28,
    q1: rnd() * 6.28, q2: rnd() * 6.28,
  };
}

function hillH(d, x) {
  return 46 * Math.sin(x * 0.0011 + d.p1) + 26 * Math.sin(x * 0.0027 + d.p2) + 12 * Math.sin(x * 0.0061 + d.p3);
}
function mtnH(d, x) {
  return 90 * Math.sin(x * 0.0009 + d.q1) + 45 * Math.sin(x * 0.0021 + d.q2) + 70;
}

/* flight session */
var F = null;

/* manifest: passport-style boarding docs, shown before each flight */
var pendingFlight = null;
function showManifest(i) {
  selectedRoute = i;
  var route = routes[i];
  if (pilot.planes.indexOf(pilot.activePlane) < 0) pilot.activePlane = pilot.planes[0];
  var st = SK.newFlight(hashStr('skylark-' + dateKey() + '-r' + i), route, pilot.activePlane, pilot);
  var decor = makeDecor(st.seed, route.dist + 700);
  pendingFlight = { st: st, decor: decor };
  enrichPassengers(st);
  // render passports
  $('mani-route').textContent = route.from + ' → ' + route.to;
  $('mani-plane').textContent = st.plane.name + ' · ' + st.pax.length + ' passenger' + (st.pax.length > 1 ? 's' : '');
  var list = $('mani-pax');
  list.innerHTML = '';
  st.pax.forEach(function (p, idx) {
    var d = document.createElement('div');
    d.className = 'passport';
    var cv = document.createElement('canvas');
    cv.className = 'pp-photo'; cv.width = 60; cv.height = 72;
    var g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(PX.face(hashStr(p.name) + idx * 7), 0, 0, 60, 72);
    var info = document.createElement('div');
    info.className = 'pp-info';
    info.innerHTML =
      '<div class="pp-name">' + p.name + '</div>' +
      '<div class="pp-story">' + (p.story || '') + '</div>' +
      '<div class="pp-dest">&rarr; ' + route.to.toUpperCase() + '</div>' +
      '<div class="pp-mrz">SKY&gt;&gt;&gt;' + p.name.replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 12) +
      '&gt;&gt;' + dateKey().replace(/-/g, '') + '</div>';
    var stamp = document.createElement('div');
    stamp.className = 'pp-stamp';
    stamp.textContent = 'BOARDED';
    d.appendChild(cv); d.appendChild(info); d.appendChild(stamp);
    list.appendChild(d);
  });
  if (!st.pax.length) {
    list.innerHTML = '<div class="pp-empty">Cargo run — no passengers, just the hum of the engine.</div>';
  }
  show('manifest');
}

function startFlight(i) {
  selectedRoute = (typeof i === 'number') ? i : selectedRoute;
  var route = routes[selectedRoute];
  var st, decor;
  if (pendingFlight && pendingFlight.st.route === route) {
    st = pendingFlight.st; decor = pendingFlight.decor;
    pendingFlight = null;
  } else {
    if (pilot.planes.indexOf(pilot.activePlane) < 0) pilot.activePlane = pilot.planes[0];
    st = SK.newFlight(hashStr('skylark-' + dateKey() + '-r' + selectedRoute), route, pilot.activePlane, pilot);
    decor = makeDecor(st.seed, route.dist + 700);
    enrichPassengers(st);
  }
  F = { st: st, decor: decor, input: { throttle: 0, pitch: 0, lateral: 0, flaps: 0 },
        lastT: 0, running: false, lastMsg: 0, landPlayed: false, endT: 0,
        pitchTouch: null, thrTouch: false, lastDetent: 0, view: 'side', vista: null };
  fetchVista(st);
  initParts(F);
  F.camXS = 0; // smoothed camera x
  F.camSettle = 0; // landing camera dip
  show(null);
  $('skip-final').classList.add('hidden');
  $('telegrams').innerHTML = '';
  F.lastMsg = 0;
  // throttle UI reset
  setThrottleUI(0);
  startLoop();
  var lm = st.messages[st.messages.length - 1];
  say(lm.text, lm.who);
}

function stopFlightLoop() {
  if (F) F.running = false;
}

function setThrottleUI(v) {
  var knob = $('thr-knob'), track = $('thr-track');
  var h = track.clientHeight || 200;
  knob.style.top = ((1 - v) * (h - 38)) + 'px';
  track.setAttribute('aria-valuenow', Math.round(v * 100));
}

/* tower telegrams — with character portraits */
var CREW = {
  mabel: { name: 'Mabel', role: 'Tower · 30 yrs', spr: 'mabel' },
  kit: { name: 'Kit', role: 'Tower · rookie', spr: 'kit' },
  rudy: { name: 'Rudy “Wrench”', role: 'Mechanic', spr: 'rudy' },
};
function say(text, who) {
  var box = $('telegrams');
  var d = document.createElement('div');
  d.className = 'telegram';
  var c = CREW[who] || CREW.mabel;
  var clean = String(text).replace(/^Tower:\s*/, '');
  var cv = document.createElement('canvas');
  cv.className = 'tg-face';
  cv.width = 60; cv.height = 72;
  var g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  var spr = PX.get(c.spr);
  if (spr) g.drawImage(spr, 0, 0, 60, 72);
  var nm = document.createElement('div');
  nm.className = 'tg-name';
  nm.textContent = c.name + ' · ' + c.role;
  var tx = document.createElement('div');
  tx.className = 'tg-text';
  tx.textContent = clean;
  var body = document.createElement('div');
  body.className = 'tg-body';
  body.appendChild(nm); body.appendChild(tx);
  d.appendChild(cv); d.appendChild(body);
  box.appendChild(d);
  AU.towerBlip();
  while (box.children.length > 2) box.removeChild(box.firstChild);
  setTimeout(function () {
    d.style.transition = 'opacity .8s'; d.style.opacity = '0';
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 850);
  }, 6200);
}

/* ---------- input ---------- */
var planeScreenX = function () { return W * 0.35; };
var groundY = function () { return H * 0.80; };
var altScale = function () { return (groundY() - H * 0.10) / 900; };
function altToY(alt) { return groundY() - alt * altScale(); }

canvas.addEventListener('pointerdown', function (e) {
  if (!F || !F.running) return;
  F.pitchTouch = e.pointerId;
  canvas.setPointerCapture(e.pointerId);
  pitchTo(e.clientX, e.clientY);
});
canvas.addEventListener('pointermove', function (e) {
  if (F && F.running && F.pitchTouch === e.pointerId) pitchTo(e.clientX, e.clientY);
});
function pitchEnd(e) {
  if (F && F.pitchTouch === e.pointerId) {
    F.pitchTouch = null;
    $('pitch-marker').classList.add('hidden');
  }
}
canvas.addEventListener('pointerup', pitchEnd);
canvas.addEventListener('pointercancel', pitchEnd);

function pitchTo(clientX, clientY) {
  var r = canvas.getBoundingClientRect();
  // vertical: top of screen = pull up (+1), bottom = push down (-1)
  var py = 1 - (clientY - r.top) / r.height;
  F.input.pitch = clamp(py * 2 - 0.15, -1, 1);
  // horizontal: bank into the drag
  var px = (clientX - r.left) / r.width;
  F.input.lateral = clamp((px - 0.35) * 2.2, -1, 1);
  var m = $('pitch-marker');
  m.classList.remove('hidden');
  m.style.left = (planeScreenX() - 60) + 'px';
  m.style.top = (clientY - r.top - 1) + 'px';
  m.style.width = '120px';
  updateYoke();
}

/* the wooden yoke mirrors your hands: pull = toward you, bank = tilt */
function updateYoke() {
  if (!F) return;
  var st = F.st;
  var yoke = $('yoke'), wheel = $('yoke-wheel');
  var dy = F.input.pitch * -22; // pull (+1) = yoke down toward you
  yoke.style.transform = 'translateY(' + dy.toFixed(1) + 'px)';
  wheel.style.transform = 'rotate(' + (st.bank * 0.9).toFixed(1) + 'deg)';
}

/* throttle slider */
var thrTrack = $('thr-track');
thrTrack.addEventListener('pointerdown', function (e) {
  e.stopPropagation();
  if (!F) return;
  F.thrTouch = true;
  thrTrack.setPointerCapture(e.pointerId);
  thrTo(e.clientY);
});
thrTrack.addEventListener('pointermove', function (e) {
  if (F && F.thrTouch) thrTo(e.clientY);
});
function thrEnd() { if (F) F.thrTouch = false; }
thrTrack.addEventListener('pointerup', thrEnd);
thrTrack.addEventListener('pointercancel', thrEnd);

/* flaps lever: 3 detents — UP (0), 1 (0.5), FULL (1) */
var flapTrack = $('flap-track'), flapKnob = $('flap-knob');
flapTrack.addEventListener('pointerdown', function (e) {
  e.stopPropagation();
  if (!F) return;
  F.flapTouch = true;
  flapTrack.setPointerCapture(e.pointerId);
  flapTo(e.clientY);
});
flapTrack.addEventListener('pointermove', function (e) {
  if (F && F.flapTouch) flapTo(e.clientY);
});
function flapEnd() { if (F) F.flapTouch = false; }
flapTrack.addEventListener('pointerup', flapEnd);
flapTrack.addEventListener('pointercancel', flapEnd);
function flapTo(clientY) {
  var r = flapTrack.getBoundingClientRect();
  var v = clamp(1 - (clientY - r.top) / r.height, 0, 1);
  // snap to 3 detents: 0 / 0.5 / 1
  var detents = [0, 0.5, 1], snapped = detents[0];
  for (var i = 0; i < detents.length; i++)
    if (Math.abs(v - detents[i]) < Math.abs(v - snapped)) snapped = detents[i];
  v = snapped;
  if (F && v !== F.lastFlap) {
    F.lastFlap = v;
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {}
    AU.tick();
    if (v > 0) say('Flaps ' + (v >= 1 ? 'FULL' : '1') + ' — she\'ll slow down and settle.', 'mabel');
  }
  F.input.flaps = v;
  // knob position: top = UP (0), bottom = FULL (1)
  flapKnob.style.top = (8 + v * (r.height - 50)) + 'px';
}
function thrTo(clientY) {
  var r = thrTrack.getBoundingClientRect();
  var v = clamp(1 - (clientY - r.top) / r.height, 0, 1);
  // detents: snap softly to 0 / 25 / 50 / 75 / 100
  var detents = [0, 0.25, 0.5, 0.75, 1];
  var snapped = v, nearest = 0;
  for (var i = 0; i < detents.length; i++) {
    if (Math.abs(v - detents[i]) < Math.abs(v - snapped)) { snapped = detents[i]; nearest = i; }
  }
  if (Math.abs(v - snapped) < 0.035) v = snapped;
  // haptic tick on detent crossing
  if (F && nearest !== F.lastDetent) {
    F.lastDetent = nearest;
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {}
    AU.tick();
  }
  F.input.throttle = v;
  setThrottleUI(v);
}

$('skip-final').addEventListener('click', function (e) {
  e.stopPropagation();
  if (F && SK.skipToFinal(F.st)) {
    AU.click();
    $('skip-final').classList.add('hidden');
    say(F.st.messages[F.st.messages.length - 1].text);
  }
});

/* ---------- particles: pooled, zero per-frame allocation ---------- */
var PMAX = 90;
function initParts(F) {
  F.parts = [];
  for (var i = 0; i < PMAX; i++)
    F.parts.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, sz: 2, kind: 0, on: false });
  F.partsN = 0;
}
function spawnPart(F, x, y, vx, vy, life, sz, kind) {
  for (var i = 0; i < PMAX; i++) {
    var p = F.parts[i];
    if (!p.on) {
      p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.life = life; p.max = life; p.sz = sz; p.kind = kind;
      return;
    }
  }
}
function stepParts(F, dt) {
  for (var i = 0; i < PMAX; i++) {
    var p = F.parts[i];
    if (!p.on) continue;
    p.life -= dt;
    if (p.life <= 0) { p.on = false; continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 1) { p.vy += 60 * dt; p.vx *= (1 - dt * 1.5); } // dust settles
    if (p.kind === 2) { p.vx -= 300 * dt; } // wind streaks stream back
    if (p.kind === 3) { p.vy += 140 * dt; p.vx *= (1 - dt * 2); } // gold sparkles fall gently
  }
}
function drawParts(F, camX) {
  for (var i = 0; i < PMAX; i++) {
    var p = F.parts[i];
    if (!p.on) continue;
    var a = p.life / p.max;
    var sx = p.x - camX;
    if (sx < -40 || sx > W + 40) continue;
    if (p.kind === 0) { // dust mote: soft gold dot
      ctx2d.fillStyle = 'rgba(255,240,210,' + (a * 0.5).toFixed(3) + ')';
      ctx2d.fillRect(sx, p.y, p.sz, p.sz);
    } else if (p.kind === 1) { // touchdown puff: warm tan, grows
      var gr = p.sz * (1.6 - a * 0.6);
      ctx2d.fillStyle = 'rgba(214,186,140,' + (a * 0.55).toFixed(3) + ')';
      ctx2d.beginPath(); ctx2d.arc(sx, p.y, gr, 0, 6.29); ctx2d.fill();
    } else if (p.kind === 3) { // gold payoff burst: bright sparkles
      var tw = 0.6 + 0.4 * Math.sin(p.life * 25);
      ctx2d.fillStyle = 'rgba(255,215,90,' + (a * tw).toFixed(3) + ')';
      var gs = p.sz * (0.5 + a * 0.8);
      ctx2d.fillRect(sx - gs / 2, p.y - gs / 2, gs, gs);
      ctx2d.fillStyle = 'rgba(255,240,180,' + (a * tw * 0.8).toFixed(3) + ')';
      ctx2d.fillRect(sx - gs / 4, p.y - gs / 4, gs / 2, gs / 2);
    } else { // wind streak: thin white line
      ctx2d.strokeStyle = 'rgba(255,255,255,' + (a * 0.35).toFixed(3) + ')';
      ctx2d.lineWidth = 1.5;
      ctx2d.beginPath(); ctx2d.moveTo(sx, p.y); ctx2d.lineTo(sx + 26 * a, p.y); ctx2d.stroke();
    }
  }
}

/* ---------- main loop ---------- */
function startLoop() {
  if (!F || F.running) return;
  F.running = true;
  F.lastT = performance.now();
  requestAnimationFrame(frame);
}

function frame(now) {
  if (!F || !F.running) return;
  var dt = Math.min(0.1, (now - F.lastT) / 1000);
  F.lastT = now;
  var st = F.st;

  SK.step(st, F.input, dt);

  // particles
  stepParts(F, dt);
  // ambient dust motes drifting through the light
  if (Math.random() < dt * 6) {
    var mwx = F.camXS + Math.random() * W;
    spawnPart(F, mwx, Math.random() * H * 0.7, -12 - Math.random() * 10, 4, 3 + Math.random() * 2, 2, 0);
  }
  // wind streaks at speed
  if (st.speed > 110 && st.alt > 5 && Math.random() < dt * (st.speed - 100) * 0.12) {
    spawnPart(F, F.camXS + W * 0.2 + Math.random() * W * 0.7,
      Math.random() * H * 0.6, 0, 0, 0.5, 2, 2);
  }
  // touchdown dust burst + camera settle (+ gold burst for butter)
  if (st.done && !F.dustBurst) {
    F.dustBurst = true;
    F.camSettle = 1;
    var gx = st.x, gy2 = groundY();
    for (var di = 0; di < 22; di++) {
      var ang = Math.PI + (Math.random() - 0.5) * 1.6;
      var sp = 40 + Math.random() * 130;
      spawnPart(F, gx + (Math.random() - 0.5) * 60, gy2 - Math.random() * 8,
        Math.cos(ang) * sp, Math.sin(ang) * sp * 0.5 - 30,
        0.7 + Math.random() * 0.8, 5 + Math.random() * 7, 1);
    }
    if (st.butter) {
      // golden payoff burst — butter landing reward
      for (var gi = 0; gi < 40; gi++) {
        var ga = Math.random() * Math.PI * 2;
        var gs = 60 + Math.random() * 200;
        spawnPart(F, gx + (Math.random() - 0.5) * 40, gy2 - 20 - Math.random() * 30,
          Math.cos(ga) * gs, Math.sin(ga) * gs * 0.7 - 90,
          1.1 + Math.random() * 1.2, 3 + Math.random() * 5, 3);
      }
      setTimeout(function () { say('Butter. Absolute butter. The runway sends its regards.', 'kit'); }, 900);
    }
  }
  // camera: buttery horizontal ease + landing settle dip
  var targetCamX = st.x - planeScreenX();
  F.camXS += (targetCamX - F.camXS) * Math.min(1, dt * 5);
  if (F.camSettle > 0) F.camSettle = Math.max(0, F.camSettle - dt * 1.4);

  // new tower messages
  var latest = st.messages[st.messages.length - 1];
  if (latest.t !== F.lastMsgT) {
    F.lastMsgT = latest.t;
    // the initial briefing was already shown; say everything after
    if (F.saidInit) say(latest.text, latest.who);
    else F.saidInit = true;
  }

  // skip button visibility
  if (st.phase === 'cruise' && !st.skipped) $('skip-final').classList.remove('hidden');
  else $('skip-final').classList.add('hidden');

  // HUD
  updateHUD(st);
  updateYoke();

  // audio
  var airborne = st.alt > 1 || st.phase !== 'takeoff';
  AU.engine(st.throttle, st.speed * 3, airborne);

  if (F.view === 'cockpit' && typeof CKPT !== 'undefined') {
    var pp = SK.papi(st);
    st.papiW = pp.white;
    CKPT.render(ctx2d, W, H, st, F.input, F.vista);
  } else {
    render(st, F.decor, now / 1000, dt);
  }

  if (st.done && !F.landPlayed) {
    F.landPlayed = true;
    F.endT = now;
    AU.thud(st.score < 40);
    if (st.score >= 65) setTimeout(function () { AU.chime(); }, 350);
  }
  if (st.done && now - F.endT > 1600) {
    F.running = false;
    finishFlight(st);
    return;
  }
  requestAnimationFrame(frame);
}

function updateHUD(st) {
  $('fd-speed').textContent = Math.round(st.speed);
  $('fd-alt').textContent = Math.round(st.alt * 3);
  var dx = st.destX - st.x;
  var rot = Math.atan2(dx, Math.max(40, st.alt * 2)) * 180 / Math.PI;
  $('needle').style.transform = 'translate(-50%,-100%) rotate(' + rot.toFixed(1) + 'deg)';
}

/* propeller: spin frames at low RPM → blur disc at high RPM. Positions are
   sprite-local (3x) coords inside the plane's transform. */
/* propeller: continuous RPM-driven blend. Low RPM = motion-blurred blades
   sweeping smoothly; high RPM = blades dissolve into a translucent disc with
   bright hub and faint blade ghosts. No hard frames, no hard switch.
   F.propAngle advances with throttle-driven RPM. Positions are sprite-local
   (3x) coords inside the plane's transform. */
function drawProp(g, planeId, throttle, t, dt) {
  var i;
  if (planeId === 'merlin') {
    // jet intake fan: subtle shimmer, never a prop
    var shimmer = 0.10 + throttle * 0.25 + Math.sin(t * 31) * 0.03;
    g.globalAlpha = Math.max(0.06, shimmer);
    var spr = PX.get('fanblur');
    g.drawImage(spr, 48 - spr.width / 2, 2 - spr.height / 2);
    g.globalAlpha = 1;
    return;
  }
  var spots = planeId === 'kestrel' ? [[18, -15]] : [[48, 8]];
  // RPM: windmilling at idle, screaming at full throttle
  var rpm = 2 + throttle * 38; // revs per second
  if (typeof F !== 'undefined' && F && dt > 0) {
    F.propAngle = (F.propAngle || 0) + rpm * Math.PI * 2 * dt;
  }
  var ang = (typeof F !== 'undefined' && F && F.propAngle) ? F.propAngle : t * 4;
  // blend factors: blades fade as disc takes over — smooth, speed-driven
  var bladeA = 1 - smoothstep(0.12, 0.72, throttle);   // 1 → 0
  var discA = smoothstep(0.22, 0.62, throttle);          // 0 → 1
  var ghostA = smoothstep(0.45, 0.8, throttle) * 0.10;   // faint blade ghosts
  var bladeLen = 24, bladeWid = 5;
  // angular step per frame for motion-blur samples
  var dA = rpm * Math.PI * 2 * Math.min(dt || 0.016, 0.05);

  for (var si = 0; si < spots.length; si++) {
    var bx = spots[si][0], by = spots[si][1];

    // ---- motion-blurred blades: 3 samples, trailing angles, falling alpha
    if (bladeA > 0.02) {
      for (var b = 0; b < 2; b++) { // 2 blades, opposite
        var baseA = ang + b * Math.PI;
        for (var s = 0; s < 3; s++) {
          var sa = baseA - s * dA * 1.6;
          var salpha = bladeA * [0.85, 0.42, 0.18][s];
          if (salpha < 0.02) continue;
          g.save();
          g.translate(bx, by);
          g.rotate(sa);
          // tapered blade: wide at hub, narrow at tip
          g.fillStyle = 'rgba(43,29,18,' + salpha.toFixed(3) + ')';
          g.beginPath();
          g.moveTo(3, -bladeWid / 2);
          g.lineTo(bladeLen, -bladeWid / 2 + 1.2);
          g.lineTo(bladeLen, bladeWid / 2 - 1.2);
          g.lineTo(3, bladeWid / 2);
          g.closePath(); g.fill();
          g.restore();
        }
      }
    }

    // ---- translucent disc: denser at rim (blade-tip sweep), bright hub
    if (discA > 0.02) {
      var br = 27;
      var shim = 0.93 + 0.07 * Math.sin(t * 43 + bx * 0.7 + si * 2.1);
      var da = discA * shim;
      var grad = g.createRadialGradient(bx, by, 2, bx, by, br);
      grad.addColorStop(0.00, 'rgba(255,244,220,' + (0.55 * da).toFixed(3) + ')');
      grad.addColorStop(0.18, 'rgba(240,230,212,' + (0.28 * da).toFixed(3) + ')');
      grad.addColorStop(0.62, 'rgba(240,230,212,' + (0.42 * da).toFixed(3) + ')');
      grad.addColorStop(0.85, 'rgba(240,230,212,' + (0.30 * da).toFixed(3) + ')');
      grad.addColorStop(1.00, 'rgba(240,230,212,0)');
      g.fillStyle = grad;
      g.save();
      g.translate(bx, by); g.scale(0.42, 1); g.translate(-bx, -by);
      g.beginPath(); g.arc(bx, by, br, 0, 6.29); g.fill();
      g.restore();
      // bright hub
      g.fillStyle = 'rgba(255,248,230,' + (0.75 * da).toFixed(3) + ')';
      g.beginPath(); g.arc(bx, by, 5, 0, 6.29); g.fill();
      g.fillStyle = 'rgba(43,29,18,' + (0.5 * da).toFixed(3) + ')';
      g.beginPath(); g.arc(bx, by, 2.2, 0, 6.29); g.fill();
      // faint blade ghosts: curved arcs at current blade angles, not X shapes
      if (ghostA > 0.015) {
        g.strokeStyle = 'rgba(60,42,24,' + ghostA.toFixed(3) + ')';
        g.lineWidth = 7;
        g.lineCap = 'round';
        for (var gb = 0; gb < 2; gb++) {
          var ga2 = ang + gb * Math.PI;
          g.beginPath();
          g.arc(bx, by, bladeLen * 0.62, ga2 - 0.5, ga2 + 0.5);
          g.stroke();
        }
      }
    }
  }
  g.globalAlpha = 1;
}

function smoothstep(a, b, x) {
  var t = (x - a) / (b - a);
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  return t * t * (3 - 2 * t);
}

/* ---------- render ---------- */
function render(st, d, t, dt) {
  var vista = (typeof F !== 'undefined' && F && F.vista) ? F.vista : null;
  var isNight = st.route.weather === 'night';
  // vista palette is the day's look; night keeps its own sky
  var pal = (!isNight && vista && vista.palette) ? vista.palette
    : (SKIES[st.route.weather] || SKIES.day);
  // smoothed cinematic camera (F.camXS eases toward target; settle dips on touchdown)
  var camX = (typeof F !== 'undefined' && F && F.camXS != null) ? F.camXS : st.x - planeScreenX();
  var settleY = (typeof F !== 'undefined' && F && F.camSettle) ? Math.sin(F.camSettle * Math.PI) * 10 : 0;
  var gy = groundY() + settleY, as = altScale();

  // sky
  var g = ctx2d.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.top); g.addColorStop(0.55, pal.mid); g.addColorStop(1, pal.bot);
  ctx2d.fillStyle = g;
  ctx2d.fillRect(0, 0, W, H);

  // atmosphere: warm haze band above horizon (expensive feel)
  var hz = ctx2d.createLinearGradient(0, gy - 160, 0, gy + 20);
  hz.addColorStop(0, 'rgba(255,240,210,0)');
  hz.addColorStop(1, 'rgba(255,240,210,' + (isNight ? '0.04' : '0.16') + ')');
  ctx2d.fillStyle = hz;
  ctx2d.fillRect(0, gy - 160, W, 180);

  // stars / sun
  if (isNight) {
    ctx2d.fillStyle = '#fff';
    for (var si = 0; si < d.stars.length; si++) {
      var s = d.stars[si];
      var tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + s.tw));
      ctx2d.globalAlpha = tw * 0.9;
      ctx2d.fillRect(s.x * W, s.y * H, 2, 2);
    }
    ctx2d.globalAlpha = 1;
    // moon
    ctx2d.fillStyle = pal.sun;
    ctx2d.beginPath(); ctx2d.arc(W * 0.78, H * 0.16, 26, 0, 6.29); ctx2d.fill();
    ctx2d.fillStyle = 'rgba(11,21,38,.35)';
    ctx2d.beginPath(); ctx2d.arc(W * 0.78 - 10, H * 0.16 - 6, 22, 0, 6.29); ctx2d.fill();
  } else {
    var sunPos = (vista && vista.sun) ? vista.sun : { x: 0.72, y: st.route.weather === 'day' ? 0.2 : 0.32 };
    var sunX = W * sunPos.x, sunY = H * sunPos.y;
    var sg = ctx2d.createRadialGradient(sunX, sunY, 4, sunX, sunY, 110);
    sg.addColorStop(0, pal.sun); sg.addColorStop(1, 'rgba(255,240,200,0)');
    ctx2d.fillStyle = sg;
    ctx2d.fillRect(sunX - 90, sunY - 90, 180, 180);
    ctx2d.fillStyle = pal.sun;
    ctx2d.beginPath(); ctx2d.arc(sunX, sunY, 24, 0, 6.29); ctx2d.fill();
  }

  // clouds — vista-driven variety (parallax .18), drifting
  var vClouds = (vista && vista.clouds && vista.clouds.length) ? vista.clouds : d.clouds;
  var isVClouds = !!(vista && vista.clouds && vista.clouds.length);
  for (var ci = 0; ci < vClouds.length; ci++) {
    var c = vClouds[ci];
    var ctype, cx, cy, cw2, cop;
    if (isVClouds) {
      ctype = 'cloud' + c.type;
      cx = ((c.x * (W + 900) - camX * 0.18 + t * c.v) % (W + 900) + (W + 900)) % (W + 900) - 450;
      cy = c.y * H * 0.8;
      cw2 = Math.min(190, 60 * c.s + 50);
      cop = c.o;
    } else {
      ctype = 'cloud1';
      cx = ((c.x - camX * 0.25 + t * c.v) % (W + 600) + (W + 600)) % (W + 600) - 300;
      cy = c.y * H * 0.75;
      cw2 = Math.min(110, 46 * c.s + 30);
      cop = 0.7;
    }
    var cspr = PX.get(ctype) || PX.get('cloud1');
    // warm sun-side tint
    var tintA = isNight ? 0 : 0.14;
    ctx2d.globalAlpha = cop;
    ctx2d.drawImage(cspr, cx - cw2 / 2, cy, cw2, cw2 * 0.45);
    if (tintA > 0) {
      ctx2d.globalCompositeOperation = 'source-atop';
      ctx2d.fillStyle = 'rgba(255,220,170,' + tintA.toFixed(2) + ')';
      // (tint skipped on shared sprite — applied via overlay rect clipped to cloud bbox)
      ctx2d.globalCompositeOperation = 'source-over';
    }
  }
  ctx2d.globalAlpha = 1;

  // god rays at dawn/dusk (from the sun, slow rotation)
  if (!isNight && vista && vista.godrays && (st.route.weather === 'dawn' || st.route.weather === 'dusk')) {
    ctx2d.save();
    ctx2d.globalAlpha = 0.10;
    ctx2d.translate(sunX, sunY);
    ctx2d.rotate(Math.sin(t * 0.05) * 0.08);
    ctx2d.fillStyle = pal.sun;
    for (var gri = 0; gri < 4; gri++) {
      var ga = (gri / 4) * Math.PI * 2 + 0.4;
      ctx2d.save();
      ctx2d.rotate(ga);
      ctx2d.beginPath();
      ctx2d.moveTo(0, 0);
      ctx2d.lineTo(320, -26); ctx2d.lineTo(320, 26);
      ctx2d.closePath(); ctx2d.fill();
      ctx2d.restore();
    }
    ctx2d.restore();
    ctx2d.globalAlpha = 1;
  }

  // far mountains (parallax .15) — haziest, with snowcaps
  var ridgeF = (vista && vista.ridges && vista.ridges[0]) || null;
  var farHgt = ridgeF ? ridgeF.height : 130;
  var farSeed = ridgeF ? (ridgeF.seed % 628) / 100 : 0;
  var farHaze = ridgeF ? ridgeF.haze : 0.6;
  var farSnow = ridgeF ? ridgeF.snow : false;
  ctx2d.fillStyle = pal.far || pal.mtn;
  ctx2d.globalAlpha = 1 - farHaze * 0.55;
  ctx2d.beginPath();
  ctx2d.moveTo(0, gy);
  var farPts = [];
  for (var fx = 0; fx <= W; fx += 16) {
    var fwx = camX * 0.15 + fx;
    var fh = gy - farHgt - mtnH(d, fwx + farSeed * 1000) * (farHgt / 110);
    farPts.push([fx, fh]);
    ctx2d.lineTo(fx, fh);
  }
  ctx2d.lineTo(W, gy); ctx2d.closePath(); ctx2d.fill();
  // snowcaps on the tallest far peaks
  if (farSnow && !isNight) {
    ctx2d.fillStyle = 'rgba(255,252,245,0.85)';
    for (var spi = 0; spi < farPts.length; spi++) {
      var spx = farPts[spi][0], spy = farPts[spi][1];
      var peakH = gy - spy;
      if (peakH > farHgt * 1.35) {
        ctx2d.beginPath();
        ctx2d.moveTo(spx - 14, spy + 16);
        ctx2d.lineTo(spx, spy);
        ctx2d.lineTo(spx + 14, spy + 16);
        ctx2d.lineTo(spx + 7, spy + 12);
        ctx2d.lineTo(spx, spy + 16);
        ctx2d.lineTo(spx - 7, spy + 12);
        ctx2d.closePath(); ctx2d.fill();
      }
    }
  }
  ctx2d.globalAlpha = 1;

  // mountains (parallax .3) — vista ridges modulate height + haze
  var ridge0 = (vista && vista.ridges && vista.ridges[1]) || null;
  var mtnHaze = ridge0 ? ridge0.haze : 0;
  var mtnHgt = ridge0 ? ridge0.height : 90;
  var mtnSeed = ridge0 ? (ridge0.seed % 628) / 100 : 0;
  ctx2d.fillStyle = pal.mtn;
  ctx2d.globalAlpha = 1 - mtnHaze * 0.5;
  ctx2d.beginPath();
  ctx2d.moveTo(0, gy);
  for (var mx = 0; mx <= W; mx += 14) {
    var wx = camX * 0.3 + mx;
    ctx2d.lineTo(mx, gy - mtnHgt - mtnH(d, wx + mtnSeed * 1000) * (mtnHgt / 90));
  }
  ctx2d.lineTo(W, gy); ctx2d.closePath(); ctx2d.fill();
  ctx2d.globalAlpha = 1;

  // hills (parallax .6) — third vista ridge
  var ridge1 = (vista && vista.ridges && vista.ridges[2]) || null;
  var hillHgt = ridge1 ? ridge1.height : 110;
  var hillSeed = ridge1 ? (ridge1.seed % 628) / 100 : 0;
  ctx2d.fillStyle = pal.hill1;
  ctx2d.beginPath();
  ctx2d.moveTo(0, gy);
  for (var hx = 0; hx <= W; hx += 10) {
    var hwx = camX * 0.6 + hx;
    ctx2d.lineTo(hx, gy - hillHgt - hillH(d, hwx + hillSeed * 1000) * 1.3 * (hillHgt / 110));
  }
  ctx2d.lineTo(W, gy); ctx2d.closePath(); ctx2d.fill();

  // distant bird flocks — always alive up here (parallax .5)
  var nFlocks = (vista && vista.birds) ? vista.birds.flocks : 2;
  for (var fi = 0; fi < nFlocks; fi++) {
    var fseed = (st.seed || 7) * 13 + fi * 977;
    var fx2 = ((fseed % 1400) - camX * 0.5 + t * (6 + fi * 3)) % (W + 500);
    if (fx2 < 0) fx2 += (W + 500);
    fx2 -= 250;
    var fy2 = H * (0.18 + (fseed % 100) / 100 * 0.25) + Math.sin(t * 0.7 + fi * 2) * 12;
    for (var fb = 0; fb < 4; fb++) {
      var bx2 = fx2 + fb * 22 + Math.sin(t * 1.3 + fb + fi) * 5;
      var by2 = fy2 + (fb % 2) * 14 + Math.cos(t + fb * 1.7) * 4;
      var bframe = Math.floor(t * 5 + fb * 1.3 + fi) % 2 ? 'bird1' : 'bird2';
      ctx2d.globalAlpha = 0.55;
      ctx2d.drawImage(PX.get(bframe), bx2, by2, 18, 9);
    }
  }
  ctx2d.globalAlpha = 1;

  // ground
  var flat = flattenAt(st, camX);
  ctx2d.fillStyle = pal.ground;
  ctx2d.beginPath();
  ctx2d.moveTo(0, H);
  for (var gx = 0; gx <= W; gx += 10) {
    var gwx = camX + gx;
    var hh = hillH(d, gwx);
    var fl = flat(gwx);
    ctx2d.lineTo(gx, gy - hh * (1 - fl));
  }
  ctx2d.lineTo(W, H); ctx2d.closePath(); ctx2d.fill();
  // grass detail strip
  ctx2d.fillStyle = 'rgba(255,255,255,.08)';
  ctx2d.beginPath();
  ctx2d.moveTo(0, H);
  for (var gx2 = 0; gx2 <= W; gx2 += 10) {
    var gwx2 = camX + gx2;
    ctx2d.lineTo(gx2, gy - hillH(d, gwx2) * (1 - flat(gwx2)) - 6);
  }
  ctx2d.lineTo(W, H); ctx2d.closePath(); ctx2d.fill();

  // houses
  for (var hi = 0; hi < d.houses.length; hi++) {
    var hs = d.houses[hi];
    var hx2 = hs.x - camX;
    if (hx2 < -100 || hx2 > W + 100) continue;
    var hy = gy - hillH(d, hs.x) * (1 - flat(hs.x));
    var spr = PX.get('house');
    ctx2d.drawImage(spr, hx2 - spr.width * hs.s / 2, hy - spr.height * hs.s + 6, spr.width * hs.s, spr.height * hs.s);
  }

  // airstrips
  drawStrip(st.runwayX, st.runwayLen, camX, gy, d, true, st);
  drawStrip(st.destX, st.destLen, camX, gy, d, false, st);

  // vista landmarks — procedural silhouettes in the mid-ground
  if (vista && vista.landmarks) drawLandmarks(st, vista, camX, gy, d, flat);

  // trees
  for (var ti = 0; ti < d.trees.length; ti++) {
    var tr = d.trees[ti];
    var tx = tr.x - camX;
    if (tx < -60 || tx > W + 60) continue;
    var ty = gy - hillH(d, tr.x) * (1 - flat(tr.x));
    var ts = PX.get(tr.k);
    var tw2 = ts.width * tr.s, th2 = ts.height * tr.s;
    ctx2d.drawImage(ts, tx - tw2 / 2, ty - th2 + 4, tw2, th2);
  }

  // sky-ribbon (the original touch)
  drawRibbon(st, camX, as, gy);

  // particles: dust, touchdown puffs, wind streaks
  if (typeof F !== 'undefined' && F && F.parts) drawParts(F, camX);

  // birds: join on smooth cruise
  if (st.alt > 60 && st.phase !== 'done') {
    var sm = SK.ribbonSmooth(st);
    if (sm > 0.72) {
      for (var bi = 0; bi < 3; bi++) {
        var bx = planeScreenX() - 70 - bi * 26 + Math.sin(t * 3 + bi * 2) * 6;
        var by = altToY(st.alt) - 24 - bi * 12 + Math.cos(t * 2.4 + bi) * 5;
        ctx2d.drawImage(PX.get(Math.floor(t * 6 + bi) % 2 ? 'bird1' : 'bird2'), bx, by, 24, 12);
      }
    }
  }

  // plane (drawn slightly under natural size so the world feels big)
  var pspr = PX.get(st.plane.id);
  var px = planeScreenX(), py = altToY(st.alt);
  var pscale = 0.65;
  var pitch = clamp(st.pitch / 57.3, -0.30, 0.30); // true attitude
  if (st.phase === 'takeoff' && st.alt <= 0.5) pitch = 0;
  // bank: roll the sprite slightly for turns
  var roll = clamp(st.bank / 57.3 * 0.5, -0.25, 0.25);
  if (st.alt > 2) {
    var shA = clamp(0.3 - st.alt / 2500, 0.04, 0.3);
    ctx2d.fillStyle = 'rgba(20,15,10,' + shA.toFixed(3) + ')';
    ctx2d.beginPath();
    ctx2d.ellipse(px, gy + 8, pspr.width * 0.42 * pscale, 8, 0, 0, 6.29);
    ctx2d.fill();
  }
  ctx2d.save();
  ctx2d.translate(px, py);
  ctx2d.rotate(-pitch);
  ctx2d.scale(pscale, pscale);
  // subtle roll for banked turns (skew the sprite)
  ctx2d.transform(1, roll * 0.4, 0, 1, 0, 0);
  ctx2d.drawImage(pspr, -pspr.width / 2, -pspr.height / 2);
  drawProp(ctx2d, st.plane.id, st.throttle, t, dt);
  // sun glint: warm rim light on the sun side
  if (!isNight) {
    var sunSide = sunX > px ? 1 : -1;
    var glint = ctx2d.createLinearGradient(-pspr.width / 2, 0, pspr.width / 2, 0);
    if (sunSide > 0) {
      glint.addColorStop(0, 'rgba(255,240,200,0)');
      glint.addColorStop(1, 'rgba(255,240,200,.38)');
    } else {
      glint.addColorStop(0, 'rgba(255,240,200,.38)');
      glint.addColorStop(1, 'rgba(255,240,200,0)');
    }
    ctx2d.globalCompositeOperation = 'source-atop';
    ctx2d.fillStyle = glint;
    ctx2d.fillRect(-pspr.width / 2, -pspr.height / 2, pspr.width, pspr.height);
    ctx2d.globalCompositeOperation = 'source-over';
  }
  ctx2d.restore();

  // night: lamp glow
  if (st.route.weather === 'night' && st.alt > 1) {
    var lg = ctx2d.createRadialGradient(px + 40, py, 4, px + 40, py, 130);
    lg.addColorStop(0, 'rgba(255,240,200,.35)');
    lg.addColorStop(1, 'rgba(255,240,200,0)');
    ctx2d.fillStyle = lg;
    ctx2d.fillRect(px - 100, py - 130, 320, 260);
  }
}

/* vista landmarks: simple painterly silhouettes, parallax .8 */
function drawLandmarks(st, vista, camX, gy, d, flat) {
  var destX = st.destX + 700;
  for (var i = 0; i < vista.landmarks.length; i++) {
    var lm = vista.landmarks[i];
    var wx = lm.x * destX;
    if (Math.abs(wx) < 600 || Math.abs(wx - st.destX) < 800) continue; // keep strips clear
    var sx = wx - camX * 0.8;
    if (sx < -120 || sx > W + 120) continue;
    var baseY = gy - hillH(d, wx) * (1 - flat(wx)) + 4;
    var night = st.route.weather === 'night';
    var dk = night ? '#1c2030' : 'rgba(58,44,28,.85)';
    ctx2d.fillStyle = dk;
    ctx2d.strokeStyle = dk;
    if (lm.type === 'water tower') {
      ctx2d.fillRect(sx - 3, baseY - 64, 6, 64); // legs
      ctx2d.fillRect(sx - 14, baseY - 64, 28, 6);
      ctx2d.beginPath(); ctx2d.ellipse(sx, baseY - 78, 20, 14, 0, 0, 6.29); ctx2d.fill();
      ctx2d.beginPath(); ctx2d.moveTo(sx - 20, baseY - 78); ctx2d.lineTo(sx, baseY - 96); ctx2d.lineTo(sx + 20, baseY - 78); ctx2d.fill();
    } else if (lm.type === 'barn') {
      ctx2d.fillRect(sx - 30, baseY - 34, 60, 34);
      ctx2d.beginPath(); ctx2d.moveTo(sx - 34, baseY - 34); ctx2d.lineTo(sx, baseY - 52); ctx2d.lineTo(sx + 34, baseY - 34); ctx2d.fill();
      ctx2d.fillRect(sx - 4, baseY - 24, 8, 24); // door
    } else if (lm.type === 'lighthouse') {
      ctx2d.fillRect(sx - 8, baseY - 72, 16, 72);
      ctx2d.fillRect(sx - 12, baseY - 84, 24, 12); // lamp room
      if (night) {
        var lg = ctx2d.createRadialGradient(sx, baseY - 78, 2, sx, baseY - 78, 40);
        lg.addColorStop(0, 'rgba(255,244,214,.9)'); lg.addColorStop(1, 'rgba(255,244,214,0)');
        ctx2d.fillStyle = lg; ctx2d.fillRect(sx - 40, baseY - 118, 80, 80);
        ctx2d.fillStyle = dk;
      }
    } else if (lm.type === 'radio mast') {
      ctx2d.lineWidth = 3;
      ctx2d.beginPath(); ctx2d.moveTo(sx, baseY); ctx2d.lineTo(sx, baseY - 88); ctx2d.stroke();
      ctx2d.beginPath(); ctx2d.moveTo(sx - 12, baseY - 60); ctx2d.lineTo(sx + 12, baseY - 60); ctx2d.stroke();
      ctx2d.beginPath(); ctx2d.moveTo(sx - 9, baseY - 74); ctx2d.lineTo(sx + 9, baseY - 74); ctx2d.stroke();
      ctx2d.lineWidth = 1;
      if (night) {
        ctx2d.fillStyle = '#ff5040';
        ctx2d.beginPath(); ctx2d.arc(sx, baseY - 88, 3, 0, 6.29); ctx2d.fill();
        ctx2d.fillStyle = dk;
      }
    } else if (lm.type === 'windmill') {
      ctx2d.fillRect(sx - 2, baseY - 56, 4, 56);
      ctx2d.save(); ctx2d.translate(sx, baseY - 60); ctx2d.rotate(0.5);
      ctx2d.fillRect(-3, -26, 6, 26); ctx2d.fillRect(-3, 0, 6, 26);
      ctx2d.fillRect(-26, -3, 26, 6); ctx2d.fillRect(0, -3, 26, 6);
      ctx2d.restore();
    } else { // church steeple
      ctx2d.fillRect(sx - 16, baseY - 36, 32, 36);
      ctx2d.beginPath(); ctx2d.moveTo(sx - 16, baseY - 36); ctx2d.lineTo(sx, baseY - 66); ctx2d.lineTo(sx + 16, baseY - 36); ctx2d.fill();
      ctx2d.fillRect(sx - 1.5, baseY - 74, 3, 10);
    }
  }
}

/* how flat the ground is at world x (1 = runway flat) */
function flattenAt(st, camX) {
  var zones = [
    { x: st.runwayX + st.runwayLen / 2, r: st.runwayLen },
    { x: st.destX + st.destLen / 2, r: st.destLen },
  ];
  return function (wx) {
    var f = 0;
    for (var i = 0; i < zones.length; i++) {
      var dd = Math.abs(wx - zones[i].x) / zones[i].r;
      if (dd < 1) f = Math.max(f, 1 - dd);
    }
    return f * f;
  };
}

function drawStrip(x0, len, camX, gy, d, isHome, st) {
  var sx = x0 - camX;
  if (sx + len < -140 || sx > W + 140) return;
  var night = st && st.route.weather === 'night';

  // paved strip — asphalt with warm tint
  ctx2d.fillStyle = night ? '#3d3a45' : '#6e6a63';
  ctx2d.fillRect(sx, gy - 6, len, 14);
  // subtle wear bands
  ctx2d.fillStyle = night ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.07)';
  ctx2d.fillRect(sx, gy - 6, len, 3);
  ctx2d.fillStyle = 'rgba(0,0,0,.18)';
  ctx2d.fillRect(sx, gy + 4, len, 4);
  // edges
  ctx2d.fillStyle = night ? '#8f8a7a' : '#e8dcc0';
  ctx2d.fillRect(sx, gy - 7, len, 2);
  ctx2d.fillRect(sx, gy + 7, len, 2);

  // threshold piano keys (8 bars each end)
  ctx2d.fillStyle = night ? '#f5e9d0' : '#fbf3df';
  for (var k = 0; k < 8; k++) {
    var ky = gy - 5 + k * 1.6;
    ctx2d.fillRect(sx + 10, ky, 30, 1.1);
    ctx2d.fillRect(sx + len - 40, ky, 30, 1.1);
  }
  // centerline dashes
  for (var cd = 90; cd < len - 90; cd += 64) {
    ctx2d.fillRect(sx + cd, gy - 0.8, 34, 1.6);
  }
  // touchdown zone markers (pairs of bars)
  for (var tz = 0; tz < 3; tz++) {
    var tx = sx + 150 + tz * 110;
    ctx2d.fillRect(tx, gy - 4.5, 44, 2.2);
    ctx2d.fillRect(tx, gy + 2.3, 44, 2.2);
  }
  // aim point: big solid bars
  ctx2d.fillRect(sx + len * 0.18 - 26, gy - 4.5, 52, 2.4);
  ctx2d.fillRect(sx + len * 0.18 - 26, gy + 2.1, 52, 2.4);

  // PAPI lights — 4 units beside the approach threshold (dest strip only)
  if (!isHome && st && st.phase !== 'done') {
    var p = SK.papi(st);
    var px0 = sx + 40, py0 = gy + 16;
    for (var pi = 0; pi < 4; pi++) {
      var isWhite = pi < p.white;
      var lx = px0 + pi * 22;
      // housing
      ctx2d.fillStyle = '#2b1d12';
      ctx2d.fillRect(lx - 1, py0 - 1, 15, 11);
      // lens with glow
      var col = isWhite ? '255,244,214' : '255,70,60';
      if (night || true) {
        var pg = ctx2d.createRadialGradient(lx + 6, py0 + 4, 1, lx + 6, py0 + 4, 16);
        pg.addColorStop(0, 'rgba(' + col + ',.85)');
        pg.addColorStop(1, 'rgba(' + col + ',0)');
        ctx2d.fillStyle = pg;
        ctx2d.fillRect(lx - 10, py0 - 12, 34, 34);
      }
      ctx2d.fillStyle = isWhite ? '#fff4d6' : '#ff463c';
      ctx2d.fillRect(lx + 1, py0 + 1, 11, 7);
    }
  }

  // windsock
  var ws = PX.get('windsock');
  ctx2d.drawImage(ws, sx + len + 26, gy - ws.height - 10);
  // hangar at home
  if (isHome) {
    var hg = PX.get('hangar');
    var hs2 = 0.62;
    ctx2d.drawImage(hg, sx - hg.width * hs2 - 30, gy - hg.height * hs2 + 2, hg.width * hs2, hg.height * hs2);
  }
}

function drawRibbon(st, camX, as, gy) {
  var rb = st.ribbon;
  if (rb.length < 2) return;
  ctx2d.lineWidth = 5;
  ctx2d.lineCap = 'round';
  for (var i = 1; i < rb.length; i++) {
    var a = rb[i - 1], b = rb[i];
    var age = i / rb.length; // 0 old → 1 new
    var gold = b.s === 1;
    ctx2d.strokeStyle = gold
      ? 'rgba(255,196,90,' + (0.12 + age * 0.5).toFixed(3) + ')'
      : 'rgba(255,248,232,' + (0.06 + age * 0.22).toFixed(3) + ')';
    ctx2d.beginPath();
    ctx2d.moveTo(a.x - camX, gy - a.alt * as);
    ctx2d.lineTo(b.x - camX, gy - b.alt * as);
    ctx2d.stroke();
  }
}

/* ---------- finish ---------- */
function finishFlight(st) {
  var feeInfo = SK.applyFlightResult(pilot, st);
  if (pilot.best == null || st.score > pilot.best) pilot.best = st.score;
  savePilot();
  postScore(st.score + st.payout / 50);
  showSummary(st, feeInfo);
  AU.coin();
}

/* ---------- title: cinematic poster scene ---------- */
var TD = null;          // title decor (built once)
var pineDark = null, cloudWarm = null, grainTile = null;
var TRAIL_N = 44;
var trail = [], trailHead = 0, trailCount = 0, trailTick = 0;

function tintSprite(spr, color, atop) {
  var c = document.createElement('canvas');
  c.width = spr.width; c.height = spr.height;
  var x = c.getContext('2d');
  x.drawImage(spr, 0, 0);
  x.globalCompositeOperation = atop ? 'source-atop' : 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}
function buildTitleAssets() {
  if (TD) return;
  var rnd = SK.rng(0x5eed42);
  var cloudsFar = [], cloudsNear = [], motes = [], birds = [], pines = [], i;
  for (i = 0; i < 5; i++) cloudsFar.push({ x: rnd() * 1400 - 200, y: 0.08 + rnd() * 0.22, s: 1.1 + rnd() * 0.9, v: 5 + rnd() * 5 });
  for (i = 0; i < 4; i++) cloudsNear.push({ x: rnd() * 1400 - 200, y: 0.30 + rnd() * 0.24, s: 0.7 + rnd() * 0.7, v: 12 + rnd() * 8 });
  for (i = 0; i < 26; i++) motes.push({ x: rnd(), y: rnd(), s: 1 + rnd() * 2, ph: rnd() * 6.28, v: 0.008 + rnd() * 0.02 });
  for (i = 0; i < 3; i++) birds.push({ x: rnd() * 1.3 - 0.15, y: 0.14 + rnd() * 0.10, v: 0.010 + rnd() * 0.008, ph: rnd() * 6.28 });
  for (i = 0; i < 16; i++) pines.push({ x: i / 15 + (rnd() - 0.5) * 0.035, s: 0.9 + rnd() * 1.2 });
  TD = { cloudsFar: cloudsFar, cloudsNear: cloudsNear, motes: motes, birds: birds, pines: pines,
         p1: rnd() * 6.28, p2: rnd() * 6.28 };
  for (i = 0; i < TRAIL_N; i++) trail.push({ x: 0, y: 0 });
  pineDark = tintSprite(PX.get('pine'), '#100b18', false);
  cloudWarm = tintSprite(PX.get('cloud1'), 'rgba(255,170,110,0.5)', true);
  // film grain tile
  grainTile = document.createElement('canvas');
  grainTile.width = 96; grainTile.height = 96;
  var gx = grainTile.getContext('2d');
  var img = gx.createImageData(96, 96), dd = img.data;
  for (i = 0; i < dd.length; i += 4) {
    var v = (rnd() * 255) | 0;
    dd[i] = v; dd[i + 1] = v; dd[i + 2] = v; dd[i + 3] = 255;
  }
  gx.putImageData(img, 0, 0);
}
function tRidgeH(x, t, k) {
  if (k === 1) return 60 * Math.sin(x * 0.008 + t * 0.020 + TD.p1) + 30 * Math.sin(x * 0.021 + TD.p2) + 92;
  return 46 * Math.sin(x * 0.011 + 2.1 + t * 0.030 + TD.p1) + 22 * Math.sin(x * 0.027 + 1.2 + TD.p2) + 68;
}
function pineRidgeH(x) {
  return 20 * Math.sin(x * 0.013 + 0.7) + 10 * Math.sin(x * 0.031 + 2.2) + 26;
}

function renderTitle(t, dt) {
  buildTitleAssets();
  var i, cx, cy, cw, s;

  // 1. sky
  var g = ctx2d.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1f2347'); g.addColorStop(0.35, '#6e3f63');
  g.addColorStop(0.62, '#c65f4a'); g.addColorStop(0.82, '#f0955a');
  g.addColorStop(1, '#f7c873');
  ctx2d.fillStyle = g;
  ctx2d.fillRect(0, 0, W, H);

  // 2. sun + glow
  var sunX = W * 0.68, sunY = H * 0.47;
  var shimmer = 0.92 + 0.08 * Math.sin(t * 2.1);
  var hg = ctx2d.createRadialGradient(sunX, sunY, 8, sunX, sunY, 200);
  hg.addColorStop(0, 'rgba(255,238,196,' + (0.9 * shimmer).toFixed(3) + ')');
  hg.addColorStop(0.3, 'rgba(255,198,128,' + (0.42 * shimmer).toFixed(3) + ')');
  hg.addColorStop(1, 'rgba(255,180,120,0)');
  ctx2d.fillStyle = hg;
  ctx2d.fillRect(sunX - 200, sunY - 200, 400, 400);
  // god rays
  ctx2d.save();
  ctx2d.translate(sunX, sunY);
  for (i = 0; i < 4; i++) {
    ctx2d.save();
    ctx2d.rotate(t * 0.045 + i * 1.72 + 0.4);
    ctx2d.fillStyle = 'rgba(255,222,160,0.055)';
    ctx2d.beginPath();
    ctx2d.moveTo(0, 0); ctx2d.lineTo(300, -36); ctx2d.lineTo(300, 36);
    ctx2d.closePath(); ctx2d.fill();
    ctx2d.restore();
  }
  ctx2d.restore();
  ctx2d.fillStyle = '#ffedb8';
  ctx2d.beginPath(); ctx2d.arc(sunX, sunY, 24, 0, 6.29); ctx2d.fill();
  ctx2d.fillStyle = 'rgba(255,244,214,.85)';
  ctx2d.beginPath(); ctx2d.arc(sunX, sunY, 15, 0, 6.29); ctx2d.fill();

  // 3. far clouds (warm, slow)
  for (i = 0; i < TD.cloudsFar.length; i++) {
    s = TD.cloudsFar[i];
    cx = (((s.x + t * s.v) % (W + 400)) + (W + 400)) % (W + 400) - 200;
    cy = s.y * H;
    cw = 120 * s.s;
    ctx2d.globalAlpha = 0.68;
    ctx2d.drawImage(cloudWarm, cx - cw / 2, cy, cw, cw * 0.42);
  }
  ctx2d.globalAlpha = 1;

  // 4. mountain ridges (two depths, slow drift)
  ctx2d.fillStyle = '#5c4572';
  ctx2d.beginPath(); ctx2d.moveTo(0, H * 0.70);
  for (cx = 0; cx <= W; cx += 12) ctx2d.lineTo(cx, H * 0.70 - tRidgeH(cx, t, 1));
  ctx2d.lineTo(W, H * 0.70); ctx2d.closePath(); ctx2d.fill();
  ctx2d.fillStyle = '#46355c';
  ctx2d.beginPath(); ctx2d.moveTo(0, H * 0.76);
  for (cx = 0; cx <= W; cx += 12) ctx2d.lineTo(cx, H * 0.76 - tRidgeH(cx, t, 2));
  ctx2d.lineTo(W, H * 0.76); ctx2d.closePath(); ctx2d.fill();

  // 5. near clouds
  for (i = 0; i < TD.cloudsNear.length; i++) {
    s = TD.cloudsNear[i];
    cx = (((s.x + t * s.v) % (W + 400)) + (W + 400)) % (W + 400) - 200;
    cy = s.y * H;
    cw = 100 * s.s;
    ctx2d.globalAlpha = 0.75;
    ctx2d.drawImage(PX.get('cloud1'), cx - cw / 2, cy, cw, cw * 0.42);
  }
  ctx2d.globalAlpha = 1;

  // 6. distant birds (stroked "v" gulls, flapping)
  ctx2d.strokeStyle = 'rgba(24,16,32,0.85)';
  ctx2d.lineWidth = 2.5; ctx2d.lineCap = 'round';
  for (i = 0; i < TD.birds.length; i++) {
    var b = TD.birds[i];
    var bx = (((b.x + t * b.v) % 1.4) + 1.4) % 1.4 - 0.2;
    var by = b.y * H + Math.sin(t * 1.3 + b.ph) * 8;
    var flap = Math.sin(t * 6 + b.ph) * 4.5;
    bx *= W;
    ctx2d.beginPath();
    ctx2d.moveTo(bx - 12, by - flap);
    ctx2d.lineTo(bx, by + 2);
    ctx2d.lineTo(bx + 12, by - flap);
    ctx2d.stroke();
  }

  // 7. hero flyby + gold ribbon
  var cyc = ((t + 10) % 20) / 20; // phase: mid-screen at load
  var px = -140 + cyc * (W + 280);
  var py = H * 0.50 + Math.sin(cyc * 6.283) * 22 - cyc * 36;
  var bank = Math.cos(cyc * 6.283) * 0.10 - 0.03;
  trailTick++;
  if (trailTick % 2 === 0) {
    trailHead = (trailHead + 1) % TRAIL_N;
    trail[trailHead].x = px; trail[trailHead].y = py;
    if (trailCount < TRAIL_N) trailCount++;
  }
  ctx2d.lineWidth = 4; ctx2d.lineCap = 'round';
  for (i = 0; i < trailCount - 1; i++) {
    var ia = trail[(trailHead - trailCount + 1 + i + TRAIL_N * 2) % TRAIL_N];
    var ib = trail[(trailHead - trailCount + 2 + i + TRAIL_N * 2) % TRAIL_N];
    var al = 0.06 + 0.5 * (i / TRAIL_N);
    ctx2d.strokeStyle = 'rgba(255,196,90,' + al.toFixed(3) + ')';
    ctx2d.beginPath(); ctx2d.moveTo(ia.x, ia.y); ctx2d.lineTo(ib.x, ib.y); ctx2d.stroke();
  }
  var pspr = PX.get('kite');
  var psc = 2.2;
  ctx2d.save();
  ctx2d.translate(px, py);
  ctx2d.rotate(-bank);
  ctx2d.scale(psc, psc);
  ctx2d.drawImage(pspr, -pspr.width / 2, -pspr.height / 2);
  drawProp(ctx2d, 'kite', 0.65, t, dt); // cruising throttle: happy blur
  ctx2d.restore();

  // 8. dust motes
  for (i = 0; i < TD.motes.length; i++) {
    var m = TD.motes[i];
    var mx = (((m.x + t * 0.004) % 1) + 1) % 1 * W + Math.sin(t * 0.7 + m.ph) * 12;
    var my = (((m.y - t * m.v) % 1) + 1) % 1 * H;
    var ma = 0.10 + 0.10 * Math.sin(t * 1.8 + m.ph);
    ctx2d.fillStyle = 'rgba(255,240,210,' + ma.toFixed(3) + ')';
    ctx2d.fillRect(mx, my, m.s, m.s);
  }

  // 9. foreground pine ridge
  var ridgeY = H * 0.88;
  ctx2d.fillStyle = '#1c1528';
  ctx2d.beginPath(); ctx2d.moveTo(0, H);
  for (cx = 0; cx <= W; cx += 12) ctx2d.lineTo(cx, ridgeY - pineRidgeH(cx));
  ctx2d.lineTo(W, H); ctx2d.closePath(); ctx2d.fill();
  for (i = 0; i < TD.pines.length; i++) {
    var pn = TD.pines[i];
    var pnx = pn.x * W;
    var pny = ridgeY - pineRidgeH(pnx) + 8;
    var pw = pineDark.width * 0.9 * pn.s, ph = pineDark.height * 0.9 * pn.s;
    ctx2d.drawImage(pineDark, pnx - pw / 2, pny - ph, pw, ph);
  }

  // 10. film grain
  var gox = (t * 17) % 96, goy = (t * 11) % 96;
  ctx2d.globalAlpha = 0.05;
  ctx2d.drawImage(grainTile, -gox, -goy, W + 96, H + 96);
  ctx2d.globalAlpha = 1;
}

/* ---------- attract mode (title backdrop) ---------- */
var attract = null;
function startAttract() {
  var route = { from: '', to: '', dist: 16000, paxN: 0, pax: [], cargoN: 0, weather: 'dawn', wind: 0, payout: 0 };
  var st = SK.newFlight(1234, route, 'kite', SK.newPilot(''));
  st.phase = 'cruise'; st.x = 4000; st.alt = 420; st.speed = 70; st.throttle = 0.6;
  var decor = makeDecor(1234, 17000);
  attract = { st: st, decor: decor, lastT: performance.now() };
  setTimeout(function () { $('title').classList.add('t-live'); }, 2600);
  (function loop(now) {
    if (screen !== 'title') return;
    var tdt = Math.min(0.1, (now - (attract.lastT || now)) / 1000) || 0.016;
    attract.lastT = now;
    renderTitle(now / 1000, tdt);
    requestAnimationFrame(loop);
  })(performance.now());
}
startAttract();

/* ---------- debug hook (smoke test) ---------- */
window.__skylark = {
  state: function () { return F ? F.st : (attract ? attract.st : null); },
  pilot: function () { return pilot; },
  startFlight: startFlight,
  step: function (n) {
    if (!F) return null;
    for (var i = 0; i < n; i++) SK.step(F.st, F.input, 1 / 60);
    return F.st;
  },
  setThrottle: function (v) { if (F) { F.input.throttle = v; setThrottleUI(v); } },
  setPitch: function (v) { if (F) F.input.pitch = v; },
  setLateral: function (v) { if (F) F.input.lateral = v; },
  skip: function () { return F ? SK.skipToFinal(F.st) : false; },
};
