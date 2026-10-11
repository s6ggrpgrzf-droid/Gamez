/* Golden Acre — ui.js
 * DOM, HUD, toolbar, sheets, game loop, touch input, saves, leaderboard.
 * Sim stays pure in sim.js; rendering stays in render.js.
 */
(function () {
'use strict';

var GA = window.GA, AU = window.AU, R = window.R;
var BUILD = 'v20261011a';
var SAVE_KEY = 'ga_save_v1';
var ARCADE_BASE = 'https://gamez-arcade.chaoticutopia84.workers.dev';

var G = {
  st: null, tool: 'plow', cropSel: 'wheat', buildSel: 'barn',
  selTile: null, paused: false, speed: 1, time: 0, last: 0,
  fx: [], shake: 0, calm: false, tornadoFx: null,
  dragging: false, lastTileKey: '',
  arcadeSent: { date: '', value: 0 },
  screen: 'menu'
};

function $(id) { return document.getElementById(id); }
function fmt(n) {
  n = Math.round(n * 100) / 100;
  var neg = n < 0;
  var s = Math.abs(n).toFixed(n % 1 === 0 ? 0 : 2);
  s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-$' : '$') + s;
}
try { G.calm = localStorage.getItem('ga_calm') === '1'; } catch (e) {}
try {
  var as = JSON.parse(localStorage.getItem('ga_arcade') || 'null');
  if (as) G.arcadeSent = as;
} catch (e) {}

/* ================= SVG icons (hand-drawn, zero emoji) ================= */
function icon(name) {
  var s = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">';
  var p = '';
  if (name === 'plow') p = '<path d="M4 16 L14 6"/><path d="M4 16 h13 v3 h-13 z"/><path d="M14 6 l5 -2"/>';
  else if (name === 'plant') p = '<path d="M12 21 v-8"/><path d="M12 13 c-4 0 -6 -2 -6 -6 c4 0 6 2 6 6"/><path d="M12 13 c4 0 6 -2 6 -6 c-4 0 -6 2 -6 6"/>';
  else if (name === 'water') p = '<path d="M12 3 c4 5 6 8 6 11 a6 6 0 0 1 -12 0 c0 -3 2 -6 6 -11 z"/><path d="M9 14 a3 3 0 0 0 3 3"/>';
  else if (name === 'fert') p = '<path d="M8 8 h8 v12 h-8 z"/><path d="M8 8 c0 -3 2 -4 4 -4 s4 1 4 4"/><path d="M12 12 v5 M10 14 h4"/>';
  else if (name === 'spray') p = '<path d="M10 8 h6 v13 h-6 z"/><path d="M10 8 l-3 -3 M13 8 V4 h4 v2"/><path d="M17 4 l3 -1"/>';
  else if (name === 'harvest') p = '<path d="M12 21 v-9"/><path d="M12 12 l-4 -3 M12 12 l4 -3 M12 9 l-3 -3 M12 9 l3 -3"/><circle cx="12" cy="4" r="1.6"/>';
  else if (name === 'build') p = '<path d="M4 11 l8 -6 l8 6"/><path d="M6 10 v9 h12 v-9"/><path d="M10 19 v-5 h4 v5"/>';
  else if (name === 'bulldoze') p = '<path d="M5 5 l14 14 M19 5 l-14 14"/>';
  else if (name === 'market') p = '<path d="M4 9 h16 l-1.5 11 h-13 z"/><path d="M4 9 c0 -3 3 -5 8 -5 s8 2 8 5"/>';
  else if (name === 'bank') p = '<path d="M3 9 l9 -6 l9 6"/><path d="M5 9 v10 M9.5 9 v10 M14.5 9 v10 M19 9 v10"/><path d="M3 19 h18"/>';
  else if (name === 'animals') p = '<circle cx="9" cy="10" r="4"/><circle cx="16" cy="14" r="3"/><path d="M9 6 v-2 M5 8 l-2 -1 M13 8 l2 -1"/>';
  else if (name === 'fair') p = '<path d="M4 20 v-8 l4 -6 l4 6 l4 -6 l4 6 v8"/><path d="M4 12 h16"/>';
  else if (name === 'pause') p = '<path d="M9 5 v14 M15 5 v14"/>';
  else if (name === 'play') p = '<path d="M8 5 l11 7 l-11 7 z"/>';
  else if (name === 'mute') p = '<path d="M4 9 v6 h4 l5 4 v-14 l-5 4 z"/><path d="M16 9 l6 6 M22 9 l-6 6"/>';
  else if (name === 'sound') p = '<path d="M4 9 v6 h4 l5 4 v-14 l-5 4 z"/><path d="M16 9 a5 5 0 0 1 0 6 M18.5 7 a8 8 0 0 1 0 10"/>';
  else if (name === 'sun') p = '<circle cx="12" cy="12" r="4"/><path d="M12 2 v3 M12 19 v3 M2 12 h3 M19 12 h3 M4.5 4.5 l2 2 M17.5 17.5 l2 2 M19.5 4.5 l-2 2 M6.5 17.5 l-2 2"/>';
  else if (name === 'cloud') p = '<path d="M7 18 a4 4 0 0 1 0 -8 a5.5 5.5 0 0 1 10.6 1.6 a3.5 3.5 0 0 1 -0.6 6.4 z"/>';
  else if (name === 'rain') p = '<path d="M7 14 a4 4 0 0 1 0 -8 a5.5 5.5 0 0 1 10.6 1.6 a3.5 3.5 0 0 1 -0.6 6.4 z"/><path d="M8 17 l-1 3 M12 17 l-1 3 M16 17 l-1 3"/>';
  else if (name === 'storm') p = '<path d="M7 14 a4 4 0 0 1 0 -8 a5.5 5.5 0 0 1 10.6 1.6 a3.5 3.5 0 0 1 -0.6 6.4 z"/><path d="M12 14 l-3 5 h4 l-2 4"/>';
  else if (name === 'close') p = '<path d="M6 6 l12 12 M18 6 l-12 12"/>';
  else if (name === 'coin') p = '<circle cx="12" cy="12" r="8"/><path d="M12 7 v10 M9.5 9.5 c0 -1 1 -2 2.5 -2 c1.7 0 2.5 1 2.5 2 c0 3 -5 2 -5 5 c0 1 1 2 2.5 2 c1.5 0 2.5 -1 2.5 -2"/>';
  return s + p + '</svg>';
}
function wxIcon(w) { return icon(w === 'sunny' ? 'sun' : w === 'cloudy' ? 'cloud' : w); }

/* ================= toast & banner ================= */
var toastQ = [], toastBusy = false;
function toast(msg) {
  toastQ.push(msg);
  if (!toastBusy) nextToast();
}
function nextToast() {
  var m = toastQ.shift();
  if (!m) { toastBusy = false; return; }
  toastBusy = true;
  var el = $('toast');
  el.textContent = m;
  el.classList.add('on');
  setTimeout(function () {
    el.classList.remove('on');
    setTimeout(nextToast, 250);
  }, 2100);
}
function banner(msg, ms) {
  var el = $('banner');
  el.textContent = msg;
  el.classList.add('on');
  setTimeout(function () { el.classList.remove('on'); }, ms || 2600);
}
function popFx(x, y, txt, color) {
  var u = R.tileSize();
  G.fx.push({ kind: 'pop', x: x * u + u / 2, y: y * u, txt: txt, color: color, born: G.time });
}
function squashFx(x, y) { G.fx.push({ kind: 'squash', x: x, y: y, born: G.time }); }
function confetti(n) {
  if (G.calm) n = Math.min(n, 20);
  var wpx = $('game').width, hpx = $('game').height;
  var cols = ['#d63a2f', '#f2ede2', '#2f6fd6', '#e8a93a', '#4d9a4d'];
  for (var i = 0; i < n; i++) {
    G.fx.push({ kind: 'confetti', x: Math.random() * wpx, y: -20,
      vx: (Math.random() - 0.5) * 2, vy: Math.random() * 1.2 + 0.4,
      color: cols[i % cols.length], spin: (Math.random() - 0.5) * 12,
      seed: Math.random() * 9, born: G.time });
  }
}

/* ================= screens ================= */
function show(id) {
  ['screen-menu', 'screen-play', 'screen-over'].forEach(function (s) {
    $(s).classList.toggle('on', s === id);
  });
  G.screen = id === 'screen-menu' ? 'menu' : id === 'screen-play' ? 'play' : 'over';
}

/* ================= game flow ================= */
function startPlay(seed) {
  G.st = GA.newGame(seed);
  G.tool = 'plow'; G.fx = []; G.shake = 0; G.tornadoFx = null;
  G.paused = false; G.speed = 1;
  show('screen-play');
  sizeCanvas();
  buildToolbar();
  updateHud();
  updateSpeedBtn();
  toast('Plow some soil, then plant. Spring is short!');
}

function doDay() {
  var evs = GA.advanceDay(G.st);
  handleEvents(evs);
  updateHud();
  save();
  maybePostScore();
}

function handleEvents(evs) {
  for (var i = 0; i < evs.length; i++) {
    var e = evs[i];
    if (e.t === 'toast') toast(e.msg);
    else if (e.t === 'banner') { banner(e.msg); AU.thunder && e.msg.indexOf('Hail') === 0 && AU.thunder(); }
    else if (e.t === 'season') toast(e.name + ' arrives.');
    else if (e.t === 'harvest') {
      popFx(e.x, e.y, '+' + e.units, '#ffd75e');
      squashFx(e.x, e.y);
      AU.pop();
    }
    else if (e.t === 'tornado') {
      G.tornadoFx = { x: e.x, t: 0 };
      G.shake = 1;
      AU.thunder();
      banner(e.msg, 3200);
    }
    else if (e.t === 'fair' && e.results) {
      openFairResults(e.results);
    }
    else if (e.t === 'over') {
      showOver();
    }
  }
  if (G.st.fair.active) $('btn-fair').hidden = false;
  else $('btn-fair').hidden = true;
}

/* ================= HUD ================= */
function updateHud() {
  var st = G.st;
  if (!st) return;
  $('hud-cash').textContent = fmt(st.cash);
  $('hud-cash').classList.toggle('neg', st.cash < 0);
  $('hud-date').textContent = GA.dateStr(st);
  $('hud-weather').innerHTML = wxIcon(st.weather.cur);
  $('hud-weather').title = st.weather.cur;
  var fc = '';
  for (var i = 0; i < 3; i++) fc += '<span class="fc" title="day +' + (i + 1) + '">' + wxIcon(st.weather.forecast[i]) + '</span>';
  $('hud-forecast').innerHTML = fc;
  $('hud-net').textContent = 'Worth ' + fmt(GA.netWorth(st));
  $('daybar-fill').style.width = (st.dayT * 100).toFixed(1) + '%';
  /* ticker */
  var tk = '';
  for (var c = 0; c < GA.CROP_IDS.length; c++) {
    var id = GA.CROP_IDS[c];
    var base = GA.CROPS[id].price, p = st.market[id];
    var arrow = p >= base ? '▲' : '▼';
    tk += '<span class="tk"><b>' + GA.CROPS[id].name + '</b> $' + p.toFixed(2) +
      ' <i class="' + (p >= base ? 'up' : 'dn') + '">' + arrow + '</i></span>';
  }
  $('ticker').innerHTML = tk;
  var loanTxt = st.loan > 0 ? ' · Loan ' + fmt(st.loan) : '';
  $('hud-loan').textContent = loanTxt;
}
function tickCash() {
  var el = $('hud-cash');
  el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick');
}

/* ================= toolbar ================= */
var TOOLS = [
  { id: 'plow', label: 'Plow' }, { id: 'plant', label: 'Plant' },
  { id: 'water', label: 'Water' }, { id: 'fert', label: 'Feed' },
  { id: 'spray', label: 'Spray' }, { id: 'harvest', label: 'Reap' },
  { id: 'build', label: 'Build' }, { id: 'bulldoze', label: 'Clear' }
];
function buildToolbar() {
  var bar = $('toolbar');
  bar.innerHTML = '';
  TOOLS.forEach(function (t) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'tool' + (G.tool === t.id ? ' sel' : '');
    b.dataset.tool = t.id;
    b.setAttribute('aria-label', t.label);
    b.innerHTML = icon(t.id) + '<span>' + t.label + '</span>';
    b.addEventListener('click', function () { AU.ensure(); AU.tick(); selectTool(t.id); });
    bar.appendChild(b);
  });
}
function selectTool(id) {
  if (id === 'plant') openCropPicker();
  else if (id === 'build') openBuildPicker();
  else { G.tool = id; buildToolbar(); }
}

/* ================= canvas input ================= */
function sizeCanvas() {
  var wrap = $('game-wrap'), c = $('game');
  var r = wrap.getBoundingClientRect();
  c.style.width = r.width + 'px';
  c.style.height = r.height + 'px';
  R.resize(r.width, r.height);
}
function evTile(ev) {
  var c = $('game'), r = c.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  var k = c.width / r.width; /* backing px per css px */
  var o = R.origin(), tw = R.tileSize();
  var x = Math.floor(((ev.clientX - r.left) * k - o.x) / tw);
  var y = Math.floor(((ev.clientY - r.top) * k - o.y) / tw);
  if (x < 0 || y < 0 || x >= GA.W || y >= GA.H) return null;
  return { x: x, y: y };
}
function applyTool(x, y) {
  var st = G.st, r;
  if (G.tool === 'plow') { r = GA.plowAt(st, x, y); if (r.ok) AU.plowSnd(); }
  else if (G.tool === 'plant') { r = GA.plantAt(st, x, y, G.cropSel); if (r.ok) { AU.tick(); squashFx(x, y); } }
  else if (G.tool === 'water') { r = GA.waterAt(st, x, y); if (r.ok) AU.waterSnd(); }
  else if (G.tool === 'fert') { r = GA.fertAt(st, x, y); if (r.ok) AU.tick(); }
  else if (G.tool === 'spray') { r = GA.sprayAt(st, x, y); if (r.ok) AU.waterSnd(); }
  else if (G.tool === 'harvest') {
    r = GA.harvestAt(st, x, y);
    if (r.ok) { popFx(x, y, '+' + r.units, '#ffd75e'); squashFx(x, y); AU.pop(); tickCash(); }
  }
  else if (G.tool === 'bulldoze') {
    r = GA.bulldozeAt(st, x, y);
    if (r.ok) { AU.tick(); if (r.refund) toast('Cleared — salvaged ' + fmt(r.refund) + '.'); }
  }
  else if (G.tool === 'build') { r = GA.buildAt(st, G.buildSel, x, y); if (r.ok) AU.coin(); }
  if (!r.ok && r.why) { toast(r.why); AU.error(); }
  else updateHud();
}
function bindCanvas() {
  var c = $('game');
  c.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  c.addEventListener('pointerdown', function (e) {
    AU.ensure();
    if (G.screen !== 'play' || G.paused || (G.st && G.st.over)) return;
    var t = evTile(e);
    if (!t) return;
    G.selTile = t;
    c.setPointerCapture && c.setPointerCapture(e.pointerId);
    var drag = (G.tool === 'plow' || G.tool === 'water' || G.tool === 'fert' || G.tool === 'spray');
    G.dragging = drag;
    G.lastTileKey = t.x + ',' + t.y;
    applyTool(t.x, t.y);
    e.preventDefault();
  });
  c.addEventListener('pointermove', function (e) {
    if (!G.dragging) return;
    var t = evTile(e);
    if (!t) return;
    var k = t.x + ',' + t.y;
    if (k === G.lastTileKey) return;
    G.lastTileKey = k;
    G.selTile = t;
    applyTool(t.x, t.y);
  });
  function up() { G.dragging = false; G.selTile = null; }
  c.addEventListener('pointerup', up);
  c.addEventListener('pointercancel', up);
}

/* ================= sheets ================= */
function openSheet(html) {
  $('sheet-card').innerHTML = html;
  $('sheet').classList.remove('hidden');
  $('sheet-close').onclick = function () { AU.tick(); closeSheet(); };
}
function closeSheet() { $('sheet').classList.add('hidden'); }
function sheetHead(title) {
  return '<h2>' + title + '</h2>';
}

function openCropPicker() {
  var h = sheetHead('Plant what?');
  h += '<div class="pick-grid">';
  GA.CROP_IDS.forEach(function (id) {
    var c = GA.CROPS[id];
    h += '<button class="pick' + (G.cropSel === id ? ' sel' : '') + '" data-crop="' + id + '">' +
      '<b>' + c.name + '</b>' +
      '<span>Seed ' + fmt(c.seed) + ' · ' + c.grow + ' days</span>' +
      '<span class="dim">' + c.seasons.join(' / ') + (c.perennial ? ' · orchard, fruits for years' : '') + '</span>' +
      '</button>';
  });
  h += '</div>';
  openSheet(h);
  Array.prototype.forEach.call($('sheet-card').querySelectorAll('[data-crop]'), function (b) {
    b.addEventListener('click', function () {
      G.cropSel = b.dataset.crop;
      G.tool = 'plant';
      buildToolbar();
      closeSheet();
      AU.tick();
      toast('Planting ' + GA.CROPS[G.cropSel].name + ' — tap plowed soil.');
    });
  });
}

function openBuildPicker() {
  var h = sheetHead('Raise a building');
  h += '<div class="pick-grid">';
  ['barn', 'silo', 'coop', 'pigpen'].forEach(function (id) {
    var b = GA.BUILDINGS[id];
    var extra = b.storage ? ' · +' + b.storage + ' storage'
      : id === 'barn' ? ' · houses ' + GA.HOME_CAP.cow + ' cows'
      : id === 'coop' ? ' · houses ' + GA.HOME_CAP.chicken + ' chickens'
      : ' · houses ' + GA.HOME_CAP.pig + ' pigs';
    h += '<button class="pick' + (G.buildSel === id ? ' sel' : '') + '" data-b="' + id + '">' +
      '<b>' + b.name + '</b><span>' + fmt(b.cost) + extra + '</span></button>';
  });
  h += '</div><p class="dim">Tap open ground to place. Buildings are 1–2 tiles.</p>';
  openSheet(h);
  Array.prototype.forEach.call($('sheet-card').querySelectorAll('[data-b]'), function (btn) {
    btn.addEventListener('click', function () {
      G.buildSel = btn.dataset.b;
      G.tool = 'build';
      buildToolbar();
      closeSheet();
      AU.tick();
    });
  });
}

function openMarket() {
  var st = G.st;
  var h = sheetHead('Market — sell your harvest');
  h += '<p class="dim">Storage ' + GA.storedTotal(st) + ' / ' + GA.storageCap(st) + ' · build silos for more room.</p>';
  h += '<div class="rows">';
  GA.CROP_IDS.forEach(function (id) {
    var have = st.store[id] || 0;
    var p = st.market[id];
    h += '<div class="row"><div><b>' + GA.CROPS[id].name + '</b><span class="dim"> ' + have + ' in store · $' + p.toFixed(2) + '</span></div>' +
      '<div class="row-btns">' +
      '<button data-sell="' + id + '" data-n="10">10</button>' +
      '<button data-sell="' + id + '" data-n="100">100</button>' +
      '<button data-sell="' + id + '" data-n="999999">All</button>' +
      '</div></div>';
  });
  h += '</div>';
  openSheet(h);
  Array.prototype.forEach.call($('sheet-card').querySelectorAll('[data-sell]'), function (b) {
    b.addEventListener('click', function () {
      var r = GA.sellCrop(st, b.dataset.sell, parseInt(b.dataset.n, 10));
      if (r.ok) { AU.coin(); tickCash(); toast('Sold ' + r.units + ' for ' + fmt(r.got) + '.'); openMarket(); updateHud(); save(); }
      else { AU.error(); toast(r.why); }
    });
  });
}

function openBank() {
  var st = G.st;
  function amtBtns(kind) {
    var out = '';
    [1000, 5000, 10000].forEach(function (n) {
      out += '<button data-' + kind + '="' + n + '">' + fmt(n) + '</button>';
    });
    out += '<button data-' + kind + '="max">' + (kind === 'borrow' ? 'Max' : 'All') + '</button>';
    return out;
  }
  var h = sheetHead('Valley Bank');
  h += '<p>Cash <b>' + fmt(st.cash) + '</b> · Loan <b>' + fmt(st.loan) + '</b></p>' +
    '<p class="dim">Loans up to ' + fmt(GA.LOAN_MAX) + '. Interest ' + Math.round(GA.LOAN_RATE * 100) + '% is added each season. ' +
    'If your cash falls below -$10,000 at season\'s end, the bank forecloses.</p>' +
    '<h3>Borrow</h3><div class="row-btns">' + amtBtns('borrow') + '</div>' +
    '<h3>Repay</h3><div class="row-btns">' + amtBtns('repay') + '</div>';
  openSheet(h);
  function wire(attr, fn) {
    Array.prototype.forEach.call($('sheet-card').querySelectorAll('[' + attr + ']'), function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute(attr);
        var n = v === 'max' ? (attr === 'data-borrow' ? GA.LOAN_MAX - st.loan : st.loan) : parseInt(v, 10);
        var r = fn(n);
        if (r.ok) { AU.coin(); openBank(); updateHud(); save(); }
        else { AU.error(); toast(r.why); }
      });
    });
  }
  wire('data-borrow', function (n) { return GA.borrow(st, n); });
  wire('data-repay', function (n) { return GA.repay(st, n); });
}

function openAnimals() {
  var st = G.st;
  var h = sheetHead('Livestock');
  var feed = 0;
  st.animals.forEach(function (a) { feed += GA.ANIMALS[a.kind].feed; });
  h += '<p class="dim">Feed costs ' + fmt(feed) + ' / day, taken automatically. Hungry animals lose health and give less.</p>';
  ['cow', 'chicken', 'pig'].forEach(function (kind) {
    var a = GA.ANIMALS[kind];
    var home = GA.HOME_FOR[kind];
    var owned = GA.countAnimals(st, kind), homes = GA.countHome(st, home);
    var cap = homes * GA.HOME_CAP[kind];
    h += '<h3>' + a.name + 's <span class="dim">' + owned + ' / ' + cap + ' · ' + fmt(a.cost) + ' each</span></h3>';
    if (homes === 0) h += '<p class="dim">Needs a ' + GA.BUILDINGS[home].name + '.</p>';
    else h += '<div class="row-btns"><button data-buy="' + kind + '">Buy ' + a.name + '</button></div>';
    var list = st.animals.filter(function (x) { return x.kind === kind; });
    if (list.length) {
      h += '<div class="rows">';
      list.forEach(function (an) {
        var desc = kind === 'pig' ? an.weight + ' lb · health ' + Math.round(an.health)
          : 'health ' + Math.round(an.health);
        h += '<div class="row"><div><b>' + a.name + ' #' + an.id + '</b><span class="dim"> ' + desc + '</span></div>' +
          '<div class="row-btns"><button data-sellan="' + an.id + '">Sell</button></div></div>';
      });
      h += '</div>';
    }
  });
  openSheet(h);
  Array.prototype.forEach.call($('sheet-card').querySelectorAll('[data-buy]'), function (b) {
    b.addEventListener('click', function () {
      var r = GA.buyAnimal(st, b.dataset.buy);
      if (r.ok) { AU.coin(); openAnimals(); updateHud(); save(); }
      else { AU.error(); toast(r.why); }
    });
  });
  Array.prototype.forEach.call($('sheet-card').querySelectorAll('[data-sellan]'), function (b) {
    b.addEventListener('click', function () {
      var r = GA.sellAnimal(st, parseInt(b.dataset.sellan, 10));
      if (r.ok) { AU.coin(); tickCash(); toast('Sold for ' + fmt(r.got) + '.'); openAnimals(); updateHud(); save(); }
      else { AU.error(); toast(r.why); }
    });
  });
}

function openFair() {
  var st = G.st;
  if (!st.fair.active) { toast('The fair has packed up for the year.'); return; }
  if (st.fair.entered) { toast('You are entered. Judging is on the last day of summer.'); return; }
  var h = sheetHead('County Fair — enter the contests');
  h += '<p class="dim">Best Crop and Finest Animal. Blue ribbon pays $1,000, red $500, white $250.</p>';
  h += '<h3>Your crop (10 units from storage)</h3><div class="pick-grid">';
  var anyCrop = false;
  GA.CROP_IDS.forEach(function (id) {
    if ((st.store[id] || 0) >= 10) {
      anyCrop = true;
      var bb = st.stats.bestBatch;
      var q = (bb && bb.crop === id) ? bb.q : 60;
      h += '<button class="pick" data-fcrop="' + id + '"><b>' + GA.CROPS[id].name + '</b><span>quality ~' + q + '</span></button>';
    }
  });
  h += '</div>';
  if (!anyCrop) h += '<p class="dim">Harvest and store at least 10 of one crop first.</p>';
  h += '<h3>Your animal</h3><div class="pick-grid">';
  if (!st.animals.length) h += '<p class="dim">You own no animals yet.</p>';
  st.animals.forEach(function (an) {
    var nm = GA.ANIMALS[an.kind].name + ' #' + an.id;
    var d = an.kind === 'pig' ? an.weight + ' lb' : 'health ' + Math.round(an.health);
    h += '<button class="pick" data-fanimal="' + an.id + '"><b>' + nm + '</b><span>' + d + '</span></button>';
  });
  h += '</div><p class="dim">Rivals: ' + st.fair.neighbors.map(function (n) { return n.name; }).join(', ') + '</p>';
  openSheet(h);
  var selC = null, selA = null;
  function refresh() {
    Array.prototype.forEach.call($('sheet-card').querySelectorAll('[data-fcrop]'), function (b) {
      b.classList.toggle('sel', b.dataset.fcrop === selC);
    });
    Array.prototype.forEach.call($('sheet-card').querySelectorAll('[data-fanimal]'), function (b) {
      b.classList.toggle('sel', b.dataset.fanimal === String(selA));
    });
    var go = $('fair-go');
    if (go) go.disabled = !(selC && selA);
  }
  Array.prototype.forEach.call($('sheet-card').querySelectorAll('[data-fcrop]'), function (b) {
    b.addEventListener('click', function () { selC = b.dataset.fcrop; AU.tick(); refresh(); });
  });
  Array.prototype.forEach.call($('sheet-card').querySelectorAll('[data-fanimal]'), function (b) {
    b.addEventListener('click', function () { selA = parseInt(b.dataset.fanimal, 10); AU.tick(); refresh(); });
  });
  var goWrap = document.createElement('div');
  goWrap.innerHTML = '<div class="row-btns"><button id="fair-go" class="primary" disabled>Enter the fair</button></div>';
  $('sheet-card').appendChild(goWrap);
  $('fair-go').addEventListener('click', function () {
    var r = GA.enterFair(st, selC, selA);
    if (r.ok) { AU.fanfare(); closeSheet(); banner('Entered! Judging on the last day of summer.'); save(); }
    else { AU.error(); toast(r.why); }
  });
}

function ribbonHtml(res, label) {
  if (!res) return '';
  var rb = res.ribbon;
  var txt = label + ': ' + (rb ? rb.name + ' — ' + fmt(rb.prize) : 'no ribbon') +
    ' <span class="dim">(placed ' + res.rank + ' of ' + res.of + ')</span>';
  var dot = rb ? '<span class="ribbon-dot" style="background:' + rb.color + '"></span>' : '';
  return '<p>' + dot + txt + '</p>';
}
function openFairResults(res) {
  var h = sheetHead('County Fair — results');
  h += ribbonHtml(res.crop, 'Best Crop') + ribbonHtml(res.animal, 'Finest Animal');
  if (res.prize > 0) h += '<p><b>You won ' + fmt(res.prize) + ' in prizes!</b></p>';
  else h += '<p class="dim">No ribbons this year. The neighbors send their regards.</p>';
  h += '<div class="row-btns"><button id="fair-ok" class="primary">Back to the farm</button></div>';
  openSheet(h);
  confetti(90);
  AU.fanfare();
  tickCash(); updateHud(); save();
  $('fair-ok').addEventListener('click', function () { closeSheet(); AU.tick(); });
  maybePostScore();
}

function openHelp() {
  var h = sheetHead('How to farm');
  h += '<div class="help">' +
    '<p><b>Plow</b> soil, <b>plant</b> in the right season, keep crops <b>watered</b> — rain helps, irrigation never hurts. <b>Feed</b> (fertilize) boosts growth and yield; <b>spray</b> kills pests.</p>' +
    '<p><b>Reap</b> when crops turn ripe, then <b>sell at the Market</b> — prices move every day with the season. Silos let you hold out for better prices.</p>' +
    '<p>Buy <b>animals</b> once you have their buildings. Cows give milk and chickens lay eggs daily, sold automatically. Pigs fatten up — sell them heavy.</p>' +
    '<p>The <b>Bank</b> lends up to $20,000 with 8% interest each season. Drop below -$10,000 at season\'s end and the farm is foreclosed.</p>' +
    '<p>The <b>County Fair</b> rolls in for the last 3 days of summer. Enter your best crop and animal for ribbons and prize money.</p>' +
    '<p class="dim">A day lasts 100 seconds. The farm keeps working while you are away (up to 8 hours).</p>' +
    '</div>';
  openSheet(h);
}

function showOver() {
  var st = G.st, o = st.over;
  show('screen-over');
  $('over-title').textContent = 'Foreclosed';
  $('over-text').textContent = 'The Valley Bank has taken the farm. You farmed ' + o.year +
    (o.year > 1 ? ' years' : ' year') + ' and walked away with a net worth of ' + fmt(o.netWorth) + '.';
  $('over-stats').innerHTML =
    '<span>Harvested <b>' + st.stats.harvested + '</b> crops</span>' +
    '<span>Earned <b>' + fmt(st.stats.earned) + '</b></span>' +
    '<span>Fair wins <b>' + st.stats.fairsWon + '</b></span>';
  maybePostScore(true);
}

/* ================= pause ================= */
function openPause() {
  var h = sheetHead('Paused');
  h += '<div class="row-btns"><button id="p-resume" class="primary">Resume</button></div>' +
    '<div class="row-btns"><button id="p-mute">' + (AU.isMuted() ? 'Unmute' : 'Mute') + '</button>' +
    '<button id="p-calm">Calm motion: ' + (G.calm ? 'On' : 'Off') + '</button></div>' +
    '<div class="row-btns"><button id="p-menu">Save & menu</button></div>';
  openSheet(h);
  $('p-resume').addEventListener('click', function () { G.paused = false; closeSheet(); updateSpeedBtn(); AU.tick(); });
  $('p-mute').addEventListener('click', function () {
    AU.ensure(); AU.setMuted(!AU.isMuted()); openPause(); updateMuteBtns();
  });
  $('p-calm').addEventListener('click', function () {
    G.calm = !G.calm;
    try { localStorage.setItem('ga_calm', G.calm ? '1' : '0'); } catch (e) {}
    openPause(); AU.tick();
  });
  $('p-menu').addEventListener('click', function () {
    save(); G.paused = false; closeSheet(); show('screen-menu'); refreshMenu(); AU.tick();
  });
}
function updateSpeedBtn() {
  $('btn-speed').innerHTML = icon(G.paused ? 'play' : 'pause') +
    '<span>' + (G.paused ? 'Go' : (G.speed === 1 ? '1x' : '3x')) + '</span>';
}

/* ================= save / load / offline ================= */
function save() {
  if (!G.st) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      savedAt: Date.now(), st: GA.serialize(G.st), arcade: G.arcadeSent
    }));
  } catch (e) {}
}
function loadSave() {
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}
function continueGame() {
  var sv = loadSave();
  if (!sv || !sv.st) return;
  G.st = sv.st;
  if (sv.arcade) G.arcadeSent = sv.arcade;
  /* offline simulation, capped at 8 hours */
  var elapsed = Date.now() - (sv.savedAt || Date.now());
  var days = Math.min(288, Math.floor(elapsed / (GA.DAY_LEN * 1000)));
  var rep = null;
  if (days > 0 && !G.st.over) {
    var e0 = G.st.stats.earned, l0 = G.st.stats.lost, h0 = G.st.stats.harvested;
    var seasons = 0, fairs = G.st.stats.fairsWon;
    for (var d = 0; d < days; d++) {
      var evs = GA.advanceDay(G.st);
      for (var i = 0; i < evs.length; i++) if (evs[i].t === 'season') seasons++;
      if (G.st.over) break;
    }
    var hrs = Math.floor(elapsed / 3600000), min = Math.floor((elapsed % 3600000) / 60000);
    rep = {
      when: hrs > 0 ? hrs + 'h ' + min + 'm' : min + 'm',
      days: d,
      earned: Math.round((G.st.stats.earned - e0) * 100) / 100,
      lost: G.st.stats.lost - l0,
      grown: G.st.stats.harvested - h0,
      seasons: seasons,
      over: !!G.st.over
    };
  }
  G.fx = []; G.shake = 0; G.tornadoFx = null; G.paused = false; G.speed = 1;
  show('screen-play');
  sizeCanvas();
  buildToolbar();
  updateHud();
  updateSpeedBtn();
  if (G.st.over) showOver();
  else if (rep) {
    var h = sheetHead('While you were away (' + rep.when + ')');
    h += '<div class="help">' +
      '<p>The farm worked <b>' + rep.days + '</b> days without you.</p>' +
      '<p>Milk & eggs earned <b>' + fmt(rep.earned) + '</b>.</p>' +
      (rep.lost > 0 ? '<p><b>' + rep.lost + '</b> crops withered or died.</p>' : '<p>No crops were lost.</p>') +
      (rep.seasons > 0 ? '<p><b>' + rep.seasons + '</b> season' + (rep.seasons > 1 ? 's' : '') + ' turned.</p>' : '') +
      '</div><div class="row-btns"><button id="off-ok" class="primary">Back to work</button></div>';
    openSheet(h);
    $('off-ok').addEventListener('click', function () { closeSheet(); AU.tick(); });
  }
  save();
}

/* ================= leaderboard ================= */
function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
function maybePostScore(force) {
  try {
    var name = (localStorage.getItem('arcade_name') || '').trim();
    if (!name || !G.st) return;
    var v = GA.netWorth(G.st);
    var day = todayStr();
    if (!force && G.arcadeSent.date === day && G.arcadeSent.value >= v) return;
    fetch(ARCADE_BASE + '/score', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'golden-acre', board: 'networth', name: name, score: v })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && typeof d.score === 'number') {
        G.arcadeSent = { date: day, value: v };
        try { localStorage.setItem('ga_arcade', JSON.stringify(G.arcadeSent)); } catch (e) {}
      }
    }).catch(function () {});
  } catch (e) {}
}

/* ================= menu ================= */
function refreshMenu() {
  var sv = loadSave();
  $('btn-continue').hidden = !(sv && sv.st && !sv.st.over);
  var v = GA.dailyValley();
  $('menu-valley').innerHTML = '<b>Today\'s Valley</b> — ' + v.date +
    '<br>Skies lean <b>' + v.weather + '</b> today. ' +
    '<span class="dim">New farms start in Spring.</span>';
  $('build-tag').textContent = BUILD;
  updateMuteBtns();
}
function updateMuteBtns() {
  $('btn-mute').innerHTML = icon(AU.isMuted() ? 'mute' : 'sound') + '<span>' + (AU.isMuted() ? 'Muted' : 'Sound') + '</span>';
}

/* ================= main loop ================= */
function uiView() {
  return { time: G.time, fx: G.fx, shake: G.shake, calm: G.calm,
           selTile: G.selTile, tornadoFx: G.tornadoFx };
}
function loop(ts) {
  requestAnimationFrame(loop);
  var dt = Math.min(0.1, (ts - G.last) / 1000 || 0);
  G.last = ts;
  G.time += dt;
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 2.4);
  if (G.tornadoFx) {
    G.tornadoFx.t += dt / 2.4;
    if (G.tornadoFx.t >= 1) G.tornadoFx = null;
  }
  if (G.screen === 'play' && G.st && !G.paused && !G.st.over) {
    G.st.dayT += dt * G.speed / GA.DAY_LEN;
    if (G.st.dayT >= 1) { G.st.dayT -= 1; doDay(); }
    $('daybar-fill').style.width = (G.st.dayT * 100).toFixed(1) + '%';
  }
  var st = G.st;
  AU.update(dt, st ? st.weather.cur : 'sunny', !!st && hasKind('cow'), !!st && hasKind('chicken'));
  if (G.screen === 'play' && st) R.draw(st, uiView());
  else if (G.screen === 'menu') R.drawMenu($('menu-art'));
}
function hasKind(k) {
  for (var i = 0; i < G.st.animals.length; i++) if (G.st.animals[i].kind === k) return true;
  return false;
}

/* ================= boot ================= */
function boot() {
  R.init($('game'));
  var mc = $('menu-art');
  (function sizeMenu() {
    var r = mc.parentElement.getBoundingClientRect();
    var d = Math.min(2, window.devicePixelRatio || 1);
    mc.width = Math.max(2, Math.round(r.width * d));
    mc.height = Math.max(2, Math.round(r.height * d));
  })();
  refreshMenu();
  $('btn-new').addEventListener('click', function () {
    AU.ensure(); AU.tick(); startPlay();
  });
  $('btn-continue').addEventListener('click', function () {
    AU.ensure(); AU.tick(); continueGame();
  });
  $('btn-how').addEventListener('click', function () { AU.ensure(); AU.tick(); openHelp(); });
  $('btn-mute').addEventListener('click', function () {
    AU.ensure(); AU.setMuted(!AU.isMuted()); updateMuteBtns(); AU.tick();
  });
  $('btn-market').addEventListener('click', function () { AU.tick(); openMarket(); });
  $('btn-bank').addEventListener('click', function () { AU.tick(); openBank(); });
  $('btn-animals').addEventListener('click', function () { AU.tick(); openAnimals(); });
  $('btn-fair').addEventListener('click', function () { AU.tick(); openFair(); });
  $('btn-pause').addEventListener('click', function () { AU.tick(); openPause(); });
  $('btn-speed').addEventListener('click', function () {
    AU.ensure(); AU.tick();
    if (G.paused) { G.paused = false; }
    else G.speed = G.speed === 1 ? 3 : 1;
    updateSpeedBtn();
  });
  $('btn-mute2').addEventListener('click', function () {
    AU.ensure(); AU.setMuted(!AU.isMuted()); updateMuteBtns(); updateMuteBtn2(); AU.tick();
  });
  bindCanvas();
  window.addEventListener('resize', function () {
    if (G.screen === 'play') sizeCanvas();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (G.screen === 'play' && G.st && !G.st.over) { G.paused = true; updateSpeedBtn(); }
      save();
    }
  });
  window.addEventListener('pagehide', save);
  requestAnimationFrame(loop);
}
function updateMuteBtn2() {
  $('btn-mute2').innerHTML = icon(AU.isMuted() ? 'mute' : 'sound');
  $('btn-mute2').setAttribute('aria-label', AU.isMuted() ? 'Unmute' : 'Mute');
}

document.addEventListener('DOMContentLoaded', boot);

/* ================= test hooks ================= */
window.__goldenacre = {
  newGame: function (seed) { startPlay(seed); return 'seeded'; },
  state: function () { return G.st; },
  GA: GA,
  plow: function (x, y) { return GA.plowAt(G.st, x, y); },
  plant: function (x, y, c) { return GA.plantAt(G.st, x, y, c); },
  water: function (x, y) { return GA.waterAt(G.st, x, y); },
  fert: function (x, y) { return GA.fertAt(G.st, x, y); },
  spray: function (x, y) { return GA.sprayAt(G.st, x, y); },
  harvest: function (x, y) { return GA.harvestAt(G.st, x, y); },
  advanceDay: function () { var e = GA.advanceDay(G.st); handleEvents(e); updateHud(); return e; },
  sell: function (c, n) { return GA.sellCrop(G.st, c, n); },
  saveGame: function () { save(); return 'saved'; },
  continueGame: function () { continueGame(); return 'continued'; },
  toMenu: function () { show('screen-menu'); refreshMenu(); return 'menu'; }
};

})();
