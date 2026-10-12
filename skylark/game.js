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
  ['title', 'hangar', 'summary'].forEach(function (s) { $(s).classList.add('hidden'); });
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
    b.addEventListener('click', function () { AU.click(); startFlight(i); });
    rc.appendChild(b);
  });

  // planes
  var pr = $('plane-row');
  pr.innerHTML = '';
  SK.PLANES.forEach(function (pl) {
    var owned = pilot.planes.indexOf(pl.id) >= 0;
    var active = pilot.activePlane === pl.id;
    var d = document.createElement('div');
    d.className = 'plane-card' + (owned ? ' owned' : ' locked') + (active ? ' active' : '');
    d.innerHTML =
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
  });

  // logbook
  var lb = $('logbook');
  lb.innerHTML = '<b>' + pilot.name + '</b> &middot; ' + (SK.RANKS[pilot.rank] || 'Student') +
    '<br>Flights: ' + pilot.flights + ' &middot; XP: ' + pilot.xp +
    '<br>Fleet: ' + pilot.planes.length + ' aircraft &middot; Hangar: ' + pilot.home +
    (pilot.best != null ? '<br>Best landing: ' + pilot.best : '');
}

/* ---------------- summary ---------------- */
function showSummary(st, feeInfo) {
  var r = st.route;
  $('sum-route').textContent = r.from + ' → ' + r.to;
  $('sum-num').textContent = st.score;
  var word = st.score >= 85 ? 'a greaser — butter' : st.score >= 65 ? 'a soft one' :
             st.score >= 40 ? 'a firm arrival' : 'an exciting arrival';
  $('sum-word').textContent = word;
  $('sum-pay').textContent = money(st.payout) + ' (hangar ' + money(feeInfo.fee) + ')';
  $('sum-xp').textContent = '+' + st.xpGain + ' XP';
  $('sum-pax').textContent = st.pax.length + ' souls';
  var say = st.pax.length ? '\u201C' + st.pax[0].name.split(' ')[0] + ': ' +
    (st.score >= 65 ? 'smoother than my morning coffee.' :
     st.score >= 40 ? 'I\'ve had worse. Barely.' : 'I\'m walking the last mile.') + '\u201D' : '';
  $('sum-paxsay').textContent = say;
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
$('b-again').addEventListener('click', function () { AU.click(); startFlight(selectedRoute); });
$('b-hangar').addEventListener('click', function () { AU.click(); renderHangar(); show('hangar'); });
$('hud-mute').addEventListener('click', function (e) {
  e.stopPropagation();
  var m = AU.toggleMute();
  $('hud-mute').innerHTML = m ? '&#x266A;' : '&#x266B;';
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

function startFlight(i) {
  selectedRoute = i;
  var route = routes[i];
  if (pilot.planes.indexOf(pilot.activePlane) < 0) pilot.activePlane = pilot.planes[0];
  var st = SK.newFlight(hashStr('skylark-' + dateKey() + '-r' + i), route, pilot.activePlane, pilot);
  var decor = makeDecor(st.seed, route.dist + 700);
  F = { st: st, decor: decor, input: { throttle: 0, targetAlt: 0 },
        lastT: 0, running: false, lastMsg: 0, landPlayed: false, endT: 0,
        pitchTouch: null, thrTouch: false };
  enrichPassengers(st);
  show(null);
  $('skip-final').classList.add('hidden');
  $('telegrams').innerHTML = '';
  F.lastMsg = 0;
  // throttle UI reset
  setThrottleUI(0);
  startLoop();
  say(st.messages[st.messages.length - 1].text);
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

/* tower telegrams */
function say(text) {
  var box = $('telegrams');
  var d = document.createElement('div');
  d.className = 'telegram';
  d.textContent = text;
  box.appendChild(d);
  AU.towerBlip();
  while (box.children.length > 2) box.removeChild(box.firstChild);
  setTimeout(function () {
    d.style.transition = 'opacity .8s'; d.style.opacity = '0';
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 850);
  }, 5200);
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
  pitchTo(e.clientY);
});
canvas.addEventListener('pointermove', function (e) {
  if (F && F.running && F.pitchTouch === e.pointerId) pitchTo(e.clientY);
});
function pitchEnd(e) {
  if (F && F.pitchTouch === e.pointerId) {
    F.pitchTouch = null;
    $('pitch-marker').classList.add('hidden');
  }
}
canvas.addEventListener('pointerup', pitchEnd);
canvas.addEventListener('pointercancel', pitchEnd);

function pitchTo(clientY) {
  var r = canvas.getBoundingClientRect();
  var t = 1 - (clientY - r.top) / r.height;
  F.input.targetAlt = clamp(t * 1050 - 40, 0, 900);
  var m = $('pitch-marker');
  m.classList.remove('hidden');
  m.style.left = (planeScreenX() - 60) + 'px';
  m.style.top = (altToY(F.input.targetAlt) - 1) + 'px';
  m.style.width = '120px';
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
function thrTo(clientY) {
  var r = thrTrack.getBoundingClientRect();
  var v = clamp(1 - (clientY - r.top) / r.height, 0, 1);
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

  // new tower messages
  var latest = st.messages[st.messages.length - 1];
  if (latest.t !== F.lastMsgT) {
    F.lastMsgT = latest.t;
    // the initial briefing was already shown; say everything after
    if (F.saidInit) say(latest.text);
    else F.saidInit = true;
  }

  // skip button visibility
  if (st.phase === 'cruise' && !st.skipped) $('skip-final').classList.remove('hidden');
  else $('skip-final').classList.add('hidden');

  // HUD
  updateHUD(st);

  // audio
  var airborne = st.alt > 1 || st.phase !== 'takeoff';
  AU.engine(st.throttle, st.speed * 3, airborne);

  render(st, F.decor, now / 1000);

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

/* ---------- render ---------- */
function render(st, d, t) {
  var pal = SKIES[st.route.weather] || SKIES.day;
  var camX = st.x - planeScreenX();
  var gy = groundY(), as = altScale();

  // sky
  var g = ctx2d.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.top); g.addColorStop(0.55, pal.mid); g.addColorStop(1, pal.bot);
  ctx2d.fillStyle = g;
  ctx2d.fillRect(0, 0, W, H);

  // stars / sun
  if (st.route.weather === 'night') {
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
    var sunX = W * 0.72, sunY = H * (st.route.weather === 'day' ? 0.2 : 0.32);
    var sg = ctx2d.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
    sg.addColorStop(0, pal.sun); sg.addColorStop(1, 'rgba(255,240,200,0)');
    ctx2d.fillStyle = sg;
    ctx2d.fillRect(sunX - 90, sunY - 90, 180, 180);
    ctx2d.fillStyle = pal.sun;
    ctx2d.beginPath(); ctx2d.arc(sunX, sunY, 24, 0, 6.29); ctx2d.fill();
  }

  // clouds (parallax .25) — small, high, wispy
  for (var ci = 0; ci < d.clouds.length; ci++) {
    var c = d.clouds[ci];
    var cx = ((c.x - camX * 0.25 + t * c.v) % (W + 600) + (W + 600)) % (W + 600) - 300;
    var cy = c.y * H * 0.75;
    var cw = Math.min(110, 46 * c.s + 30);
    ctx2d.globalAlpha = 0.7;
    ctx2d.drawImage(PX.get('cloud1'), cx - cw / 2, cy, cw, cw * 0.42);
  }
  ctx2d.globalAlpha = 1;

  // mountains (parallax .3) — thin hazy ridge
  ctx2d.fillStyle = pal.mtn;
  ctx2d.beginPath();
  ctx2d.moveTo(0, gy);
  for (var mx = 0; mx <= W; mx += 14) {
    var wx = camX * 0.3 + mx;
    ctx2d.lineTo(mx, gy - 90 - mtnH(d, wx));
  }
  ctx2d.lineTo(W, gy); ctx2d.closePath(); ctx2d.fill();

  // hills (parallax .6) — hazy, rolling, the main mid-ground
  ctx2d.fillStyle = pal.hill1;
  ctx2d.beginPath();
  ctx2d.moveTo(0, gy);
  for (var hx = 0; hx <= W; hx += 10) {
    var hwx = camX * 0.6 + hx;
    ctx2d.lineTo(hx, gy - 110 - hillH(d, hwx) * 1.3);
  }
  ctx2d.lineTo(W, gy); ctx2d.closePath(); ctx2d.fill();

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
  drawStrip(st.runwayX, st.runwayLen, camX, gy, d, true);
  drawStrip(st.destX, st.destLen, camX, gy, d, false);

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

  // plane (drawn 1.25x for readability)
  var pspr = PX.get(st.plane.id);
  var px = planeScreenX(), py = altToY(st.alt);
  var pscale = 1.25;
  var pitch = clamp(st.vspeed / 320, -0.32, 0.32);
  if (st.phase === 'takeoff') pitch = 0;
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
  ctx2d.drawImage(pspr, -pspr.width / 2, -pspr.height / 2);
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

function drawStrip(x0, len, camX, gy, d, isHome) {
  var sx = x0 - camX;
  if (sx + len < -100 || sx > W + 100) return;
  // dirt strip
  ctx2d.fillStyle = '#a8895c';
  ctx2d.fillRect(sx, gy - 4, len, 10);
  ctx2d.fillStyle = 'rgba(90,66,36,.35)';
  for (var i = 0; i < len; i += 46) ctx2d.fillRect(sx + i, gy - 4, 22, 10);
  // threshold markers
  ctx2d.fillStyle = '#f5e9d0';
  ctx2d.fillRect(sx + 6, gy - 8, 26, 4);
  ctx2d.fillRect(sx + len - 32, gy - 8, 26, 4);
  // windsock
  var ws = PX.get('windsock');
  ctx2d.drawImage(ws, sx + len + 26, gy - ws.height - 4);
  // hangar at home
  if (isHome) {
    var hg = PX.get('hangar');
    var hs2 = 0.62;
    ctx2d.drawImage(hg, sx - hg.width * hs2 - 30, gy - hg.height * hs2 + 6, hg.width * hs2, hg.height * hs2);
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

/* ---------- attract mode (title backdrop) ---------- */
var attract = null;
function startAttract() {
  var route = { from: '', to: '', dist: 16000, paxN: 0, cargoN: 0, weather: 'dawn', wind: 0, payout: 0 };
  var st = SK.newFlight(1234, route, 'kite', SK.newPilot(''));
  st.phase = 'cruise'; st.x = 4000; st.alt = 420; st.speed = 70; st.throttle = 0.6;
  var decor = makeDecor(1234, 17000);
  attract = { st: st, decor: decor, lastT: performance.now() };
  (function loop(now) {
    if (screen !== 'title') return;
    var dt = Math.min(0.1, (now - attract.lastT) / 1000);
    attract.lastT = now;
    SK.step(st, { throttle: 0.6, targetAlt: 420 + Math.sin(now / 4000) * 90 }, dt);
    if (st.x > 15000) { st.x = 0; st.ribbon = []; }
    render(st, decor, now / 1000);
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
  setTargetAlt: function (v) { if (F) F.input.targetAlt = v; },
  skip: function () { return F ? SK.skipToFinal(F.st) : false; },
};
