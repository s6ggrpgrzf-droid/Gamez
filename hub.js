/* GAMEZ flight deck — hub.js v56
 * Flat panels, working displays: MDU 1 star tracker / unit pages,
 * MDU 2 flight plan (editorial picks, AI-enhanced), MDU 3 systems
 * telemetry (the same save keys the old hub read), display bank. */
(function () {
'use strict';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}


function cleanLabel(s) {
  var t = String(s || '').replace(/^(\p{Extended_Pictographic}\uFE0F?\s*)+/gu, '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}
function read(key) {
  try { var v = localStorage.getItem(key); return v == null ? null : v; }
  catch (e) { return null; }
}
function readJSON(key) {
  try { var v = read(key); return v ? JSON.parse(v) : null; }
  catch (e) { return null; }
}

var GAMES = [
  { id:'candy-cascade', name:'CANDY CASCADE', cls:'25 LEVELS', ops:['arcade','puzzle'], href:'./candy-cascade/',
    glyph:'<path d="M12 3 L20 12 L12 21 L4 12 Z"/><path d="M12 7.5 L16 12 L12 16.5 L8 12 Z"/>',
    blurb:'Swap, match and chain candy combos across 25 levels: swipe-directed stripes, the Lollipop Hammer, falling cherries.' },
  { id:'bubble-hex', name:'BUBBLE HEX', cls:'REVAMPED · DAILY', ops:['daily','arcade','puzzle'], href:'./bubble-hex/',
    glyph:'<path d="M12 3 L19.5 7.5 L19.5 16.5 L12 21 L4.5 16.5 L4.5 7.5 Z"/><circle cx="12" cy="12" r="3"/>',
    blurb:'The Witchwood revamp: 30 levels with Stella & Nero, Wilbur boss battles, doom bubbles, Hex Blast spells and a daily challenge.' },
  { id:'bloom-defense', name:'BLOOM DEFENSE', cls:'DAILY · DEFENSE', ops:['daily','arcade'], href:'./bloom-defense/',
    glyph:'<circle cx="12" cy="12" r="3.4"/><path d="M12 3.6 V5.8 M12 18.2 V20.4 M3.6 12 H5.8 M18.2 12 H20.4 M6.1 6.1 L7.6 7.6 M16.4 16.4 L17.9 17.9 M17.9 6.1 L16.4 7.6 M7.6 16.4 L6.1 17.9"/><circle cx="10.7" cy="11" r=".5" fill="currentColor"/><circle cx="13.3" cy="13" r=".5" fill="currentColor"/>',
    blurb:'Hold the lawn through 10 waves of weeds: sunflowers, wall-nuts, cherry bombs, lawnmowers — and a daily bloom for everyone.' },
  { id:'neon-void', name:'NEON VOID', cls:'ARCADE', ops:['arcade'], href:'./neon-void/',
    glyph:'<path d="M12 4 L21 20 L3 20 Z"/><path d="M12 11 L16.5 18 L7.5 18 Z"/>',
    blurb:'Twin-stick neon arena shooter. Blast geometric swarms, vacuum up geoms, thread the gravity wells. Don’t blink.' },
  { id:'maze-trace', name:'ARROW SLIDE', cls:'DAILY BOARDS', ops:['daily','puzzle'], href:'./maze-trace/',
    glyph:'<path d="M4 18 L4 8 L14 8"/><path d="M11 4.5 L14.5 8 L11 11.5"/><path d="M14 15 L20 15 L20 20"/>',
    blurb:'Tap each arrow to slide it clean off the grid — but only if its path is clear. 24 levels of winding paths, plus a daily slide.' },
  { id:'life-story', name:'LIFE STORY', cls:'4 SCENARIOS', ops:['long'], href:'./life-story/',
    glyph:'<path d="M3 12 H8 L10.5 5.5 L13.5 18.5 L16 12 H21"/>',
    blurb:'Live a whole life one tap at a time — four scenarios, fame, fortune, crime, prison breaks. What will your obituary say?' },
  { id:'reel-empire', name:'REEL EMPIRE', cls:'TYCOON', ops:['long'], href:'./reel-empire/',
    glyph:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="7.6" r="1.7"/><circle cx="12" cy="16.4" r="1.7"/><circle cx="7.6" cy="12" r="1.7"/><circle cx="16.4" cy="12" r="1.7"/>',
    blurb:'Run a movie studio from 1955: greenlight scripts, manage stars, dodge scandals, chase awards — and the $1B dream.' },
  { id:'pdawg', name:'PDAWG PUZZLES', cls:'DAILY PUZZLE', ops:['daily','puzzle'], href:'./pdawg/',
    glyph:'<path d="M5 9 H8.8 a3.2 3.2 0 1 0 6.4 0 H19 V9.8 a2.6 2.6 0 1 0 0 5.2 V19.5 H5 Z"/>',
    blurb:'Hand-cut jigsaws on a real puzzle table: hidden whimsy pieces, a daily for everyone — and your own photos.' },
  { id:'word-well', name:'WORD WELL', cls:'DAILY · VS BOT', ops:['daily','puzzle'], href:'./word-well/',
    glyph:'<circle cx="12" cy="12" r="8.5"/><path d="M8 8.5 L10 15 L12 10.5 L14 15 L16 8.5"/>',
    blurb:'Cast letter-stones into the deep: a crossword tile duel in the style of Words With Friends. Solo vs the Well Warden, pass & play, and one daily well for everyone.' },
  { id:'tiny-fairway', name:'TINY FAIRWAY', cls:'NEW · DAILY', ops:['daily','arcade'], href:'./tiny-fairway/',
    glyph:'<path d="M8 21 L8 4"/><path d="M8 4 L17 6.5 L8 9"/><path d="M3 21 L21 21"/>',
    blurb:'One-touch golf: drag back anywhere and let fly. Endless seeded holes, a daily hole, stars for beating par — and a turtle who judges your bogeys.' },
  { id:'skylark', name:'SKYLARK', cls:'NEW', ops:['long'], href:'./skylark/',
    glyph:'<path d="M3 15 L21 8 L15 21 L12 16 Z"/><path d="M12 16 L21 8"/>',
    blurb:'A bush pilot’s tale — fly short hops between tiny airstrips. Drag the sky to climb, mind the throttle, and grease the landing for passengers with stories.' },
  { id:'dominoes', name:'DOMINOES', cls:'NEW · VS HOUSE', ops:['puzzle'], href:'./dominoes/',
    glyph:'<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M6 12 L18 12"/><circle cx="12" cy="7.5" r=".4" fill="currentColor"/><circle cx="9.5" cy="16.5" r=".4"/><circle cx="14.5" cy="16.5" r=".4"/>',
    blurb:'The café-table classic: match tiles to the open ends, draw from the boneyard when you’re stuck, and take the round off the House. First to 100.' },
  { id:'cathedral', name:'CATHEDRAL', cls:'OLD TIME RADIO', ops:['long'], href:'https://s6ggrpgrzf-droid.github.io/Cathedral/',
    glyph:'<path d="M5 21 L5 11 a7 6.5 0 0 1 14 0 L19 21"/><path d="M9 21 L9 12.5 a3 3 0 0 1 6 0 L15 21"/><path d="M3 21 L21 21"/>',
    blurb:'Old time radio on a 1940s cathedral set. Power it on, drag the needle through the static, and land on whatever’s on the air tonight — suspense, sci-fi, noir, comedy. 1,800+ episodes.' },
  { id:'starlight-drums', name:'STARLIGHT DRUMS', cls:'DAILY · RHYTHM', ops:['daily','arcade'], href:'./starlight-drums/',
    glyph:'<path d="M12 3 L14 9.5 L21 10 L15.5 14 L17.5 21 L12 17 L6.5 21 L8.5 14 L3 10 L10 9.5 Z"/>',
    blurb:'Tap the beat under a night sky: two drums, real songs, and every true hit wakes a star — light them all and the Swan completes. One daily sky for everyone, an endless rotation after.' }
];
function byId(id) { for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) return GAMES[i]; return null; }

/* the collection's sky — the same assignment the hub has always flown
 * (deliberately unnamed here, as ever). [portrait x,y, landscape x,y, size] */
var POS = {
  'candy-cascade': [37, 24, 38, 25, 2], 'bubble-hex': [52, 30, 54, 31, 1],
  'bloom-defense': [30, 37, 30, 37, 1], 'neon-void': [72, 37, 75, 37, 2],
  'maze-trace': [23, 31, 23, 32, 1], 'word-well': [16, 76, 14, 76, 1],
  'pdawg': [20, 4, 19, 5, 1], 'life-story': [15, 91, 13, 91, 1],
  'reel-empire': [76, 61, 79, 62, 1], 'tiny-fairway': [69, 53, 72, 53, 3],
  'skylark': [65, 21, 68, 22, 2], 'dominoes': [88, 40, 92, 39, 1],
  'cathedral': [30, 9, 29, 10, 1],
  'starlight-drums': [71, 75, 73, 74, 3],
  'aries-1': [42, 80, 43, 80, 1], 'aries-2': [45, 79, 46, 78, 1],
  'aries-3': [56, 74, 58, 73, 2], 'aries-4': [62, 64, 64, 63, 1]
};
var LINKS = [['dominoes', 'neon-void'], ['neon-void', 'tiny-fairway'],
  ['tiny-fairway', 'bloom-defense'], ['bloom-defense', 'maze-trace'],
  ['maze-trace', 'candy-cascade'], ['candy-cascade', 'bubble-hex'],
  ['bubble-hex', 'neon-void'], ['neon-void', 'skylark'],
  ['tiny-fairway', 'reel-empire'], ['pdawg', 'cathedral'],
  ['cathedral', 'maze-trace'], ['bloom-defense', 'word-well'], ['word-well', 'life-story'],
  ['aries-1', 'aries-2'], ['aries-2', 'aries-3'],
  ['aries-3', 'starlight-drums'], ['aries-3', 'aries-4']];
var LABOVE = { 'neon-void': 1 };
var SHORT = {'candy-cascade':'CANDY','bubble-hex':'BUBBLE','bloom-defense':'BLOOM','neon-void':'VOID',
  'maze-trace':'ARROW','word-well':'WELL','pdawg':'PDAWG','life-story':'LIFE','reel-empire':'REEL',
  'tiny-fairway':'FAIRWAY','skylark':'SKYLARK','dominoes':'DOMINOES','cathedral':'CATHEDRAL','starlight-drums':'DRUMS'};
function xy(p) { return (window.innerWidth > window.innerHeight) ? [p[2], p[3]] : [p[0], p[1]]; }
function twkStyle(id, dim, lit) {
  var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  var dur = (2.6 + (h % 23) / 10).toFixed(2), del = (-(h % 40) / 10).toFixed(2);
  return 'animation:' + (lit ? 'twkLit ' : dim ? 'twkDim ' : 'twk ') + dur + 's ease-in-out ' + del + 's infinite';
}

/* the figures, as union-find over the link graph — a figure is lit when
   every game in it has flight data */
function figureStats() {
  var parent = {};
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  Object.keys(POS).forEach(function (id) { parent[id] = id; });
  LINKS.forEach(function (pr) { var a = find(pr[0]), b = find(pr[1]); if (a !== b) parent[a] = b; });
  var comps = {}, rootOf = {};
  GAMES.forEach(function (g) { var r = find(g.id); rootOf[g.id] = r; (comps[r] = comps[r] || []).push(g.id); });
  var total = 0, done = 0, doneRoots = {};
  Object.keys(comps).forEach(function (r) {
    var ids = comps[r];
    if (ids.length < 2) return;
    total++;
    if (ids.every(function (id) { return !!progressFor(id); })) { done++; doneRoots[r] = true; }
  });
  return { done: done, total: total, doneRoots: doneRoots, rootOf: rootOf };
}
function isCharged(id, fs) {
  if (byId(id)) return !!progressFor(id);
  return LINKS.some(function (pr) {
    var other = pr[0] === id ? pr[1] : pr[1] === id ? pr[0] : null;
    return other && byId(other) && !!progressFor(other);
  });
}

/* ---------- progress: the readers the hub has always used ---------- */
function progressFor(id) {
  // returns {label, frac} or null
  try {
    if (id === 'candy-cascade') {
      var c = readJSON('cc_progress_v1'); if (!c) return null;
      var stars = 0, keys = c.stars || {};
      Object.keys(keys).forEach(function (k) { stars += +keys[k] || 0; });
      return { label: 'Level ' + (c.unlocked || 1) + ' of 25 · ★' + stars, frac: ((c.unlocked || 1) - 1) / 25 };
    }
    if (id === 'bubble-hex') {
      var b = readJSON('bubblehex'); if (!b) return null;
      var unlocked = 0, bst = 0;
      Object.keys(b).forEach(function (k) {
        if (k === 'muted' || k === 'name') return;
        if (b[k]) { unlocked++; bst += (typeof b[k] === 'number' ? b[k] : 0); }
      });
      if (!unlocked) return null;
      return { label: 'Level ' + unlocked + ' of 30 · ★' + bst, frac: unlocked / 30 };
    }
    if (id === 'bloom-defense') {
      var bb = +(read('bloom2_best') || 0); if (!bb) return null;
      return { label: 'Best ' + bb.toLocaleString(), frac: Math.min(1, bb / 50000) };
    }
    if (id === 'neon-void') {
      var nv = +(read('nv_best') || 0); if (!nv) return null;
      return { label: 'Best ' + nv.toLocaleString(), frac: Math.min(1, nv / 100000) };
    }
    if (id === 'maze-trace') {
      var m = readJSON('as_progress'); if (!m) return null;
      var cl = m.cleared || m.best || 0;
      if (!cl) return null;
      return { label: cl + ' boards cleared', frac: Math.min(1, cl / 24) };
    }
    if (id === 'life-story') {
      var l = readJSON('lifestory'); if (!l) return null;
      var lives = l.lives || 0, wins = l.wins || 0;
      if (!lives) return null;
      return { label: lives + ' lives · 🏆' + wins, frac: Math.min(1, wins / 4) };
    }
    if (id === 'reel-empire') {
      var r = readJSON('reel-empire-v1'); if (!r || r.cash == null) return null;
      return { label: '$' + Math.round(r.cash) + 'M studio', frac: Math.min(1, r.cash / 1000) };
    }
    if (id === 'pdawg') {
      var p = readJSON('pdawg-daily');
      var today = new Date().toISOString().slice(0, 10);
      if (p && p.date === today && p.ms != null) {
        var s = Math.round(p.ms / 1000);
        var mm = Math.floor(s / 60), ss = ('' + (s % 60)).padStart(2, '0');
        return { label: "Today's daily: " + mm + ':' + ss, frac: 1 };
      }
      var t = readJSON('pdawg-table');
      if (t) return { label: 'Puzzle in progress', frac: .5 };
      return null;
    }
    if (id === 'word-well') {
      var w = readJSON('wwf_daily');
      if (!w || !w.streak) return null;
      return { label: '🔥 ' + w.streak + '-day streak', frac: Math.min(1, w.streak / 30) };
    }
    if (id === 'blood-moon') {
      var bm = readJSON('bm_meta');
      if (!bm) return null;
      var bn = bm.nightsSurvived || 0, bk = bm.bestKills || 0;
      if (!bn && !bk) return null;
      return { label: '🌙 ' + bn + ' night' + (bn === 1 ? '' : 's') + ' · 🩸' + bk + ' best', frac: Math.min(1, bn / 5) };
    }
    if (id === 'tiny-fairway') {
      var tf = readJSON('tf_best');
      if (!tf || !tf.holes) return null;
      var tst = tf.stars || 0, th = tf.holes;
      return { label: '⛳ best ' + tf.strokes + ' strokes · ★' + tst, frac: Math.min(1, tst / (th * 3)) };
    }
    if (id === 'starlight-drums') {
      var sd = readJSON('sd-records-v1');
      var best = null;
      if (sd && sd.songs) Object.keys(sd.songs).forEach(function (k) {
        if (!best || sd.songs[k].pct > best.pct) best = sd.songs[k];
      });
      if (!best) { var ob = readJSON('sd-best-v1'); if (ob && ob.pct != null) best = ob; }
      if (!best) return null;
      var stk = (sd && sd.streak && sd.streak.count >= 2) ? ' · 🔥 ' + sd.streak.count + '-day streak' : '';
      return { label: 'Best ' + best.letter + ' · ' + (+best.pct).toFixed(1) + '%' + stk, frac: Math.min(1, best.pct / 100) };
    }
  } catch (e) { return null; }
  return null;
}

/* ---------- MDU 1: star tracker + unit pages ---------- */
var main = document.getElementById('mainScreen');
var mduPage = document.getElementById('mduPage');
var trkrUp = false, selectedId = null, acquiredOnce = false, starXY = {}, printTimer = null;
function printOn(el, text) {
  if (printTimer) clearInterval(printTimer);
  el.textContent = '';
  var cur = document.createElement('span');
  cur.className = 'cursor'; cur.textContent = '\u258c';
  el.appendChild(cur);
  var i = 0;
  printTimer = setInterval(function () {
    i++;
    el.textContent = text.slice(0, i);
    if (i < text.length) { el.appendChild(cur); }
    else { clearInterval(printTimer); printTimer = null; }
  }, 11);
}

/* deterministic scatter for the depth layers */
function rnd1(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

/* the real Moon, from the synodic cycle — the tracker shows tonight's sky too */
function moonInfo() {
  var syn = 29.53058867;
  var age = ((Date.now() / 864e5 - 10962.76) % syn + syn) % syn;
  var phase = age / syn;
  var illum = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  var name = phase < 0.033 || phase > 0.967 ? 'NEW' : phase < 0.217 ? 'WAXING CRESCENT' :
    phase < 0.283 ? 'FIRST QUARTER' : phase < 0.467 ? 'WAXING GIBBOUS' :
    phase < 0.533 ? 'FULL' : phase < 0.717 ? 'WANING GIBBOUS' :
    phase < 0.783 ? 'LAST QUARTER' : 'WANING CRESCENT';
  return { phase: phase, illum: illum, name: name };
}
var MOONRAW = [88, 10, 90, 13];
function moonSvg(MXY) {
  var m = moonInfo(), x = MXY[0], y = MXY[1];
  var dark = '';
  if (m.illum < 0.985) {
    var off = (1 - m.illum) * 9 * (m.phase < 0.5 ? -1 : 1);
    dark = '<circle cx="' + (x + off).toFixed(1) + '" cy="' + y + '" r="5" fill="#060a09" opacity=".88"/>';
  }
  var disc = m.illum < 0.02
    ? '<circle cx="' + x + '" cy="' + y + '" r="5" fill="none" stroke="rgba(220,235,228,.35)" stroke-width=".4"/>'
    : '<circle cx="' + x + '" cy="' + y + '" r="9.5" fill="url(#mhalo)"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="5" fill="#e9e7de"/>' +
      '<ellipse cx="' + (x - 1.6) + '" cy="' + (y - 1.2) + '" rx="1.5" ry="1.1" fill="#b9b6aa" opacity=".35"/>' +
      '<ellipse cx="' + (x + 1.8) + '" cy="' + (y + 1.6) + '" rx="1.1" ry=".8" fill="#b9b6aa" opacity=".3"/>' +
      '<ellipse cx="' + (x + .6) + '" cy="' + (y - 2.4) + '" rx=".8" ry=".6" fill="#b9b6aa" opacity=".25"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="5" fill="url(#msph)"/>' +
      '<path d="M' + (x - 4.9) + ' ' + (y - .9) + ' A5 5 0 0 1 ' + (x + 1.3) + ' ' + (y - 4.8) + '" stroke="rgba(255,255,255,.38)" stroke-width=".35" fill="none" stroke-linecap="round"/>' + dark;
  return '<g class="moon" id="moonG" aria-hidden="true">' + disc +
    '<text class="slab" x="' + x + '" y="' + (y - 7.6) + '" text-anchor="middle">MOON</text></g>';
}

/* depth: background layers drift against the scroll by a breath */
var pxEls = null, pxT = 0, pxRaf = 0;
function pxApply() {
  pxRaf = 0;
  document.documentElement.style.setProperty('--drift', pxT.toFixed(2));
  document.body.style.setProperty('--glare', pxT.toFixed(2));
  var feed = document.querySelector('.feed');
  if (feed) feed.style.setProperty('--feedRx', (pxT * -2.4).toFixed(2) + 'deg');
  var fp = document.querySelector('.feed .feedpar');
  if (fp) fp.style.transform = 'translateY(' + (pxT * -3).toFixed(1) + 'px)';
  /* layer transforms live in tiltStep now — it combines scroll + tilt */
  kickTilt();
}
function pxMeasure() {
  var svg = document.getElementById('trkr');
  if (!svg) {
    pxEls = null;
    pxT = Math.max(-1, Math.min(1, (window.scrollY - 200) / 500));
    if (!pxRaf) pxRaf = requestAnimationFrame(pxApply);
    return;
  }
  var far = document.getElementById('bgFar'), near = document.getElementById('bgNear'), neb = document.getElementById('nebG');
  if (!far || !near || !neb) { pxEls = null; return; }
  pxEls = { far: far, near: near, neb: neb };
  var r = svg.getBoundingClientRect();
  var c = r.top + r.height / 2 - window.innerHeight / 2;
  pxT = Math.max(-1, Math.min(1, c / (window.innerHeight * .7)));
  if (!pxRaf) pxRaf = requestAnimationFrame(pxApply);
}
window.addEventListener('scroll', pxMeasure, { passive: true });
window.addEventListener('resize', pxMeasure);

/* the hologram: the tracker plane tilts, and every depth layer answers
   at its own rate — pointer on desktop, gyro (with iOS permission) on phone */
var tiltPX = 0, tiltPY = 0, tiltGX = 0, tiltGY = 0, tiltCX = 0, tiltCY = 0, tiltRunning = false;
function kickTilt() { if (!tiltRunning) { tiltRunning = true; requestAnimationFrame(tiltStep); } }
function tiltStep() {
  var tx = tiltGX || tiltPX, ty = tiltGY || tiltPY;
  tiltCX += (tx - tiltCX) * .1;
  tiltCY += (ty - tiltCY) * .1;
  var svg = document.getElementById('trkr');
  if (svg) {
    svg.style.setProperty('--tiltX', tiltCX.toFixed(2) + 'deg');
    svg.style.setProperty('--tiltY', tiltCY.toFixed(2) + 'deg');
    var fig = document.getElementById('figG'), moon = document.getElementById('moonG');
    if (fig) fig.setAttribute('transform', 'translate(' + (-tiltCY * .35).toFixed(2) + ' ' + (tiltCX * .3).toFixed(2) + ')');
    if (moon) moon.setAttribute('transform', 'translate(' + (-tiltCY * .18).toFixed(2) + ' ' + (tiltCX * .16).toFixed(2) + ')');
    if (pxEls) {
      pxEls.far.setAttribute('transform', 'translate(' + (pxT * -1.1 - tiltCY * .55).toFixed(2) + ' ' + (pxT * .8 + tiltCX * .45).toFixed(2) + ')');
      pxEls.near.setAttribute('transform', 'translate(' + (pxT * -2.3 - tiltCY * 1.15).toFixed(2) + ' ' + (pxT * 1.6 + tiltCX * .9).toFixed(2) + ')');
      pxEls.neb.setAttribute('transform', 'translate(' + (pxT * -.5 - tiltCY * .3).toFixed(2) + ' ' + (pxT * .4 + tiltCX * .25).toFixed(2) + ')');
    }
  }
  if (Math.abs(tx - tiltCX) > .02 || Math.abs(ty - tiltCY) > .02 || tiltGX || tiltGY) requestAnimationFrame(tiltStep);
  else tiltRunning = false;
}
document.addEventListener('pointermove', function (e) {
  var svg = document.getElementById('trkr');
  if (!svg || !trkrUp) return;
  var r = svg.getBoundingClientRect();
  if (e.clientX < r.left - 30 || e.clientX > r.right + 30 || e.clientY < r.top - 30 || e.clientY > r.bottom + 30) {
    if (tiltPX || tiltPY) { tiltPX = 0; tiltPY = 0; kickTilt(); }
    return;
  }
  tiltPY = ((e.clientX - r.left) / r.width - .5) * 7;
  tiltPX = -((e.clientY - r.top) / r.height - .5) * 6;
  kickTilt();
}, { passive: true });
if (window.DeviceOrientationEvent) {
  var gyroOn = false, gyroAsked = false;
  var gyroKey = document.getElementById('gyroKey');
  var enableGyro = function () {
    if (gyroOn) return; gyroOn = true;
    window.addEventListener('deviceorientation', function (e) {
      if (e.gamma == null || !trkrUp) return;
      tiltGY = Math.max(-7, Math.min(7, e.gamma * .18));
      tiltGX = Math.max(-6, Math.min(6, (e.beta - 45) * .12));
      kickTilt();
    });
  };
  function renderGyro(state) {
    if (!gyroKey) return;
    gyroKey.textContent = 'GYRO ' + state;
    gyroKey.classList.toggle('on', state === 'ON');
  }
  function askGyro() {
    if (gyroOn) return;
    gyroAsked = true;
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(function (r) {
        if (r === 'granted') { enableGyro(); renderGyro('ON'); ccSay('GYRO ONLINE · TILT THE PHONE', 2200); }
        else { renderGyro('DENIED'); ccSay('MOTION DENIED · ALLOW IT IN SAFARI WEBSITE SETTINGS', 3000, true); }
      }).catch(function () { renderGyro('OFF'); });
    } else { enableGyro(); renderGyro('ON'); }
  }
  if (gyroKey) gyroKey.addEventListener('click', askGyro);
  renderGyro('OFF');
  /* one polite auto-ask on the first tracker tap — the key stays as the manual path */
  document.addEventListener('pointerdown', function h(e) {
    if (gyroAsked || !e.target.closest || !e.target.closest('#mainScreen')) return;
    document.removeEventListener('pointerdown', h);
    askGyro();
  });
} else {
  var gk = document.getElementById('gyroKey');
  if (gk) gk.style.display = 'none';
}

/* a shooting star, now and then — never on a schedule you'd notice */
(function () {
  var paths = [[82, 7, 54, 22], [96, 18, 68, 34], [58, 3, 32, 17], [90, 30, 64, 44]];
  function fire() {
    var g = document.getElementById('meteor');
    if (g && trkrUp && !document.hidden) {
      var p = paths[Math.floor(Math.random() * paths.length)];
      var t0 = performance.now();
      (function step(now) {
        var k = Math.min(1, (now - t0) / 950), e = 1 - Math.pow(1 - k, 2.2);
        var x = p[0] + (p[2] - p[0]) * e, y = p[1] + (p[3] - p[1]) * e;
        g.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')');
        g.setAttribute('opacity', (Math.sin(k * Math.PI) * .95).toFixed(2));
        if (k < 1) requestAnimationFrame(step); else g.setAttribute('opacity', '0');
      })(t0);
    }
    setTimeout(fire, 40000 + Math.random() * 50000);
  }
  setTimeout(fire, 16000 + Math.random() * 22000);
})();

function showTracker() {
  if (printTimer) { clearInterval(printTimer); printTimer = null; }
  trkrUp = true;
  mduPage.textContent = 'STR TRKR';
  function bgStars(n, seed, rMin, rMax, oMin, oMax) {
    var out = '';
    for (var i = 0; i < n; i++) {
      var bx = (rnd1(seed + i * 3.1) * 104 - 2).toFixed(1), by = (rnd1(seed + i * 7.7 + 40) * 104 - 2).toFixed(1);
      var br = (rMin + rnd1(seed + i * 1.3) * (rMax - rMin)).toFixed(2);
      var bo = (oMin + rnd1(seed + i * 2.9) * (oMax - oMin)).toFixed(2);
      out += '<circle class="bgstar" cx="' + bx + '" cy="' + by + '" r="' + br + '" opacity="' + bo + '"/>';
    }
    return out;
  }
  var nebulae = '<g id="nebG">' +
    '<ellipse cx="27" cy="30" rx="36" ry="23" fill="url(#neb1)"/>' +
    '<ellipse cx="75" cy="64" rx="32" ry="21" fill="url(#neb2)"/>' +
    '<ellipse cx="62" cy="14" rx="24" ry="15" fill="url(#neb3)"/></g>';
  var MXY = xy(MOONRAW);
  var bgFar = '<g id="bgFar">' + bgStars(30, 11, .28, .55, .10, .26) + '</g>';
  var bgNear = '<g id="bgNear">' + bgStars(15, 97, .5, .85, .22, .42) + '</g>';
  var fs = figureStats();
  var lines = LINKS.map(function (pr) {
    var a = xy(POS[pr[0]]), b = xy(POS[pr[1]]);
    var cls = 'lk';
    if (isCharged(pr[0], fs) && isCharged(pr[1], fs)) cls += fs.doneRoots[fs.rootOf[pr[0]]] && fs.rootOf[pr[0]] === fs.rootOf[pr[1]] ? ' done' : ' hot';
    return '<line class="lkg' + cls.slice(2) + '" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>' +
      '<line class="' + cls + '" pathLength="1" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>';
  }).join('');
  var stars = Object.keys(POS).map(function (id) {
    var raw = POS[id], p = xy(raw).concat([raw[4]]), r = [0, 0.85, 1.2, 1.7][p[2]], g = byId(id);
    var glare = Math.hypot(p[0] - MXY[0], p[1] - MXY[1]) < 17;
    if (g) starXY[id] = [p[0], p[1]];
    if (!g) return '<circle class="star" style="' + twkStyle(id, true) + '" cx="' + p[0] + '" cy="' + p[1] + '" r="' + (r * .85) + '" opacity="' + (glare ? .38 : .75) + '"/>';
    var lit = !!progressFor(id);
    var crowded = Object.keys(POS).some(function (o) {
      if (o === id) return false; var q = xy(POS[o]);
      return q[0] > p[0] && q[0] - p[0] < 19 && Math.abs(q[1] - p[1]) < 6;
    });
    var anchor = (p[0] > 84 || crowded) ? 'end' : 'start';
    var lx = anchor === 'end' ? p[0] - 2.6 : p[0] + 2.6;
    var ly = p[1] + 1.1;
    if (LABOVE[id]) { anchor = 'middle'; lx = p[0]; ly = p[1] - 3.8; }
    var ticks = p[2] === 3 ? '<path d="M' + (p[0] - 3.1) + ' ' + p[1] + ' L' + (p[0] + 3.1) + ' ' + p[1] + ' M' + p[0] + ' ' + (p[1] - 3.1) + ' L' + p[0] + ' ' + (p[1] + 3.1) + '" stroke="rgba(76,232,164,.5)" stroke-width=".4"/>' : '';
    var tgt = '';
    if (id === selectedId) {
      var d = 4.4, x0 = p[0] - d, x1 = p[0] + d, y0 = p[1] - d, y1 = p[1] + d, c = 1.7;
      tgt = '<path class="tgt lock" d="M' + x0 + ' ' + (y0 + c) + ' L' + x0 + ' ' + y0 + ' L' + (x0 + c) + ' ' + y0 +
        ' M' + (x1 - c) + ' ' + y0 + ' L' + x1 + ' ' + y0 + ' L' + x1 + ' ' + (y0 + c) +
        ' M' + x1 + ' ' + (y1 - c) + ' L' + x1 + ' ' + y1 + ' L' + (x1 - c) + ' ' + y1 +
        ' M' + (x0 + c) + ' ' + y1 + ' L' + x0 + ' ' + y1 + ' L' + x0 + ' ' + (y1 - c) + '"/>';
    }
    var delay = acquiredOnce ? 0 : (120 + (3 - p[2]) * 110);
    return '<g class="starwrap" style="animation-delay:' + delay + 'ms" data-call="' + id + '" role="button" tabindex="0" aria-label="' + g.name + '">' +
      '<circle class="halo" cx="' + p[0] + '" cy="' + p[1] + '" r="6.5"/>' +
      '<circle class="star" style="' + twkStyle(id, false, lit) + '" cx="' + p[0] + '" cy="' + p[1] + '" r="' + (lit ? (r * 1.15).toFixed(2) : r) + '"' + (glare ? ' opacity=".55"' : '') + '/>' + ticks + tgt +
      '<text class="slab' + (lit ? ' lit' : '') + '" x="' + lx + '" y="' + ly + '" text-anchor="' + anchor + '">' + SHORT[id] + '</text></g>';
  }).join('');
  main.innerHTML =
    '<div class="trkr-wrap"><div class="trkr-head"><span><b>STR TRKR</b> · FIX: LIVE</span><span id="trkrClock"></span></div>' +
    '<svg id="trkr" class="' + (acquiredOnce ? '' : 'acq') + '" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Star tracker — the collection as a constellation">' +
    '<defs><linearGradient id="swg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4ce8a4" stop-opacity="0"/><stop offset=".5" stop-color="#4ce8a4" stop-opacity=".16"/><stop offset="1" stop-color="#4ce8a4" stop-opacity="0"/></linearGradient>' +
    '<radialGradient id="neb1"><stop offset="0" stop-color="#2e7d5f" stop-opacity=".13"/><stop offset="1" stop-color="#2e7d5f" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="neb2"><stop offset="0" stop-color="#33507e" stop-opacity=".12"/><stop offset="1" stop-color="#33507e" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="neb3"><stop offset="0" stop-color="#5b3a78" stop-opacity=".10"/><stop offset="1" stop-color="#5b3a78" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="mhalo"><stop offset="0" stop-color="#f4f1e4" stop-opacity=".13"/><stop offset="1" stop-color="#f4f1e4" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="msph" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#ffffff" stop-opacity=".20"/><stop offset=".45" stop-color="#ffffff" stop-opacity="0"/><stop offset=".78" stop-color="#0a0e0c" stop-opacity=".10"/><stop offset="1" stop-color="#0a0e0c" stop-opacity=".34"/></radialGradient>' +
    '<linearGradient id="metg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="-13" y2="6.5"><stop offset="0" stop-color="#ffffff" stop-opacity=".9"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs>' +
    nebulae + bgFar + bgNear + '<g id="figG">' + lines + stars + '</g>' + moonSvg(MXY) +
    '<g id="meteor" opacity="0"><line x1="0" y1="0" x2="-13" y2="6.5" stroke="url(#metg)" stroke-width=".8" stroke-linecap="round"/><circle cx="0" cy="0" r=".9" fill="#eafff5"/></g>' +
    '<rect class="sweep" x="0" y="-18" width="100" height="16" fill="url(#swg)"/></svg>' +
    '<div class="trkr-foot"><span>SELECT STAR &#8594; CALL UP</span><span class="amb">MOON · ' + moonInfo().name + '</span></div></div>';
  requestAnimationFrame(pxMeasure);
  main.querySelectorAll('[data-call]').forEach(function (el) {
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.dispatchEvent(new Event('click')); }
    });
    el.addEventListener('click', function () {
      var id = el.getAttribute('data-call'), c = starXY[id];
      if (c && !el.querySelector('.tgt')) {
        var d = 4.4, x0 = c[0] - d, x1 = c[0] + d, y0 = c[1] - d, y1 = c[1] + d, k = 1.7;
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'tgt lock');
        path.setAttribute('d', 'M' + x0 + ' ' + (y0 + k) + ' L' + x0 + ' ' + y0 + ' L' + (x0 + k) + ' ' + y0 +
          ' M' + (x1 - k) + ' ' + y0 + ' L' + x1 + ' ' + y0 + ' L' + x1 + ' ' + (y0 + k) +
          ' M' + x1 + ' ' + (y1 - k) + ' L' + x1 + ' ' + y1 + ' L' + (x1 - k) + ' ' + y1 +
          ' M' + (x0 + k) + ' ' + y1 + ' L' + x0 + ' ' + y1 + ' L' + x0 + ' ' + (y1 - k));
        el.appendChild(path);
        setTimeout(function () { callUp(id); }, 210);
      } else {
        callUp(id);
      }
    });
  });
  if (!acquiredOnce) {
    /* safety: whatever happens to the draw-in animation, the links
       must be fully drawn shortly after first acquire */
    setTimeout(function () {
      var t = document.getElementById('trkr');
      if (t) t.classList.remove('acq');
    }, 1400);
  }
  acquiredOnce = true;
  tickClock();
}

function callUp(id) {
  var g = byId(id); if (!g) return;
  trkrUp = false; selectedId = id;
  mduPage.textContent = 'UNIT · ' + g.name;
  document.querySelectorAll('.tile').forEach(function (t) { t.classList.toggle('sel', t.getAttribute('data-id') === id); });
  var pr = progressFor(id);
  var dataText = pr ? cleanLabel(pr.label) : 'NO FLIGHT DATA LOGGED';
  var tele = '<dt>CLASS</dt><dd>' + g.cls + '</dd>' +
    '<dt>STATUS</dt><dd>' + (pr ? 'IN PROGRESS' : 'READY') + '</dd>' +
    '<dt>DATA</dt><dd class="dataVal"></dd>';
  var bar = pr ? '<div class="bar"><i style="width:' + Math.round(pr.frac * 100) + '%"></i></div>' : '';
  var verb = id === 'cathedral' ? 'LISTEN' : 'PLAY';
  var cssArt = id === 'cathedral' || id === 'dominoes' || id === 'starlight-drums';
  var artChild = id === 'cathedral' ? '<i class="cr2"></i>' : id === 'dominoes' ? '<i class="dm2"></i>' : '';
  var feed = '<div class="feed" aria-hidden="true"><div class="feedpar"><div class="artimg art-' + id + (cssArt ? ' cssart' : '') + '">' + artChild + '</div></div>' +
    '<div class="feedshade"></div><div class="feedhud"><span>EXT CAM · ' + SHORT[id] + '</span><span class="fl">FEED &#9679;</span></div><div class="feedband"></div></div>';
  main.innerHTML =
    '<div class="gpage"><svg class="wm" viewBox="0 0 24 24" aria-hidden="true">' + g.glyph + '</svg><div class="cls">UNIT CALLED UP // MDU 1</div>' + feed +
    '<h2>' + g.name + '</h2><p class="blurb">' + g.blurb + '</p>' +
    '<dl class="tele">' + tele + '</dl>' + bar +
    '<div class="execrow"><button class="key rtn" id="rtnBtn">&#9664; TRKR</button>' +
    '<a class="key amb exec" href="' + g.href + '">EXEC &#9654; ' + verb + '</a></div></div>';
  document.getElementById('rtnBtn').addEventListener('click', showTracker);
  var dv = main.querySelector('.dataVal');
  if (dv) printOn(dv, dataText);
  var exec = main.querySelector('.exec'), committing = false;
  if (exec) exec.addEventListener('click', function (e) {
    if (committing) { e.preventDefault(); return; }
    committing = true;
    e.preventDefault();
    var href = exec.getAttribute('href');
    main.classList.add('commit');
    exec.classList.add('lit');
    confirmTone();
    buzz([10, 40, 10]);
    var dds = main.querySelectorAll('.tele dd');
    dds.forEach(function (dd, i) {
      setTimeout(function () { dd.innerHTML += '<span class="chk"> \u2713</span>'; }, 90 + i * 100);
    });
    setTimeout(function () {
      /* the launch: back to the tracker, and the deck flies into the star */
      showTracker();
      var wrap = main.querySelector('.trkr-wrap'), svg = document.getElementById('trkr');
      var gel = main.querySelector('[data-call="' + id + '"]');
      if (!wrap || !svg || !gel) { window.location.href = href; return; }
      var sr = svg.getBoundingClientRect(), gr = gel.getBoundingClientRect();
      var ox = ((gr.left + gr.width / 2 - sr.left) / sr.width) * 100;
      var oy = ((gr.top + gr.height / 2 - sr.top) / sr.height) * 100;
      wrap.style.transformOrigin = ox.toFixed(1) + '% ' + oy.toFixed(1) + '%';
      wrap.classList.add('zooming');
      setTimeout(function () { window.location.href = href; }, 460);
    }, 430);
  });
  document.getElementById('mdu1').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* the tracker repaints itself every half minute while it is up */
setInterval(function () {
  var sw = document.querySelector('#trkr .sweep');
  if (sw) {
    sw.classList.remove('go');
    void sw.getBoundingClientRect();
    sw.classList.add('go');
  }
  var fb = document.querySelector('.feed .feedband');
  if (fb) {
    fb.classList.remove('go');
    void fb.getBoundingClientRect();
    fb.classList.add('go');
  }
}, 30000);

/* ---------- MDU 2: flight plan (editorial picks; AI replaces when it lands) ---------- */
(function () {
  var el = document.getElementById('fpln');
  if (!el) return;
  var FALLBACK = [
    { game: 'skylark', blurb: 'Golden hour over the valley. Load the Kite, chase the route bonus.' },
    { game: 'neon-void', blurb: 'Thread the gravity wells. Don’t blink — the swarm is waiting.' },
    { game: 'tiny-fairway', blurb: 'One hole, worldwide. Drag back, let fly. The turtle judges.' }
  ];
  function fitBlurb(s) {
    s = String(s || '');
    if (s.length <= 84) return s;
    var cut = s.slice(0, 84);
    var sent = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    if (sent > 40) return cut.slice(0, sent + 1);
    var sp = cut.lastIndexOf(' ');
    return (sp > 40 ? cut.slice(0, sp) : cut).replace(/[.,;:!?—-]+$/, '') + '…';
  }
  var renderCount = 0;
  function render(picks) {
    var wave = renderCount++ > 0;
    el.innerHTML = '';
    picks.forEach(function (p, i) {
      var g = byId(p.game); if (!g) return;
      var pr = progressFor(p.game);
      var row = document.createElement('button');
      row.className = 'opsrow' + (wave ? ' wave' : '');
      if (wave) row.style.animationDelay = (i * 45) + 'ms';
      row.innerHTML = '<span class="no">OPS ' + (i + 1) + '</span><span class="nm">' + g.name +
        '</span><span class="st">' + (pr ? escapeHtml(cleanLabel(pr.label)) : 'STANDING BY') + '</span>' +
        '<span class="bl">' + escapeHtml(fitBlurb(p.blurb)) + '</span>';
      row.addEventListener('click', function () { callUp(p.game); });
      el.appendChild(row);
    });
  }
  function dateKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  render(FALLBACK);
  try {
    var ctl = new AbortController();
    var to = setTimeout(function () { ctl.abort(); }, 6000);
    fetch('https://gamez-ai.chaoticutopia84.workers.dev/g', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'arcadeeditorial', game: 'hub', ctx: { date: dateKey() } }),
      signal: ctl.signal
    }).then(function (r) { clearTimeout(to); return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.picks && d.picks.length === 3) render(d.picks); })
      .catch(function () { /* fallback stays */ });
  } catch (e) { /* fallback stays */ }
})();

/* ---------- MDU 3: systems summary (continue telemetry) ---------- */
(function () {
  var el = document.getElementById('sys');
  if (!el) return;
  var rows = [];
  var fleetHtml = '';
  GAMES.forEach(function (g) { var pr = progressFor(g.id); if (pr) rows.push({ g: g, pr: pr }); });
  if (!rows.length) {
    var sec = el.closest('section'); if (sec) sec.classList.add('sysfold');
    var fs0 = figureStats();
    el.innerHTML = '<p class="nodata"><b>NO DATA.</b><br>No flights logged on this device yet. Play any unit and its telemetry reports here — scores, levels, streaks, as live values.</p>' +
      '<div class="fleet"><div class="frow"><span>UNITS REPORTING</span><b>0 / ' + GAMES.length + '</b></div>' +
      '<div class="frow"><span>FIGURES LIT</span><b>' + fs0.done + ' / ' + fs0.total + '</b></div>' +
      '<div class="frow"><span>DAILY RESET</span><b id="fleetReset">--:--:--</b></div></div>';
  } else {
    el.innerHTML = rows.map(function (r) {
      var finalLabel = cleanLabel(r.pr.label);
      var zeroed = finalLabel.replace(/\d[\d,]*/g, '0');
      return '<div class="telrow"><span class="nm">' + r.g.name + '</span><span class="vl" data-final="' + escapeHtml(finalLabel) + '">' + escapeHtml(zeroed) +
        '</span><span class="bar"><i data-w="' + Math.round(r.pr.frac * 100) + '" style="width:0%"></i></span></div>';
    }).join('');
    var revealed = false;
    function reveal() {
      if (revealed) return; revealed = true;
      el.querySelectorAll('.telrow').forEach(function (row) {
        var bar = row.querySelector('.bar i');
        if (bar) requestAnimationFrame(function () { bar.style.width = bar.getAttribute('data-w') + '%'; });
        var vl = row.querySelector('.vl'), fin = vl.getAttribute('data-final');
        var t0 = performance.now();
        (function step(now) {
          var k = Math.min(1, (now - t0) / 950), e = 1 - Math.pow(1 - k, 3);
          vl.textContent = fin.replace(/\d[\d,]*/g, function (tok, off) {
            if (/of $/.test(fin.slice(0, off))) return tok;
            var n = parseInt(tok.replace(/,/g, ''), 10);
            return Math.round(n * e).toLocaleString('en-US');
          });
          if (k < 1) requestAnimationFrame(step);
        })(t0);
      });
    }
    var fsx = figureStats();
    fleetHtml = '<div class="fleet"><div class="frow"><span>UNITS REPORTING</span><b>' + rows.length + ' / ' + GAMES.length + '</b></div>' +
      '<div class="frow"><span>FIGURES LIT</span><b>' + fsx.done + ' / ' + fsx.total + '</b></div>' +
      '<div class="frow"><span>DAILY RESET</span><b id="fleetReset">--:--:--</b></div></div>';
    el.innerHTML += fleetHtml;
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        if (es.some(function (x) { return x.isIntersecting; })) { reveal(); io.disconnect(); }
      }, { threshold: .25 });
      io.observe(el);
    } else { reveal(); }
  }
})();

/* ---------- display bank + OPS filter keys ---------- */
(function () {
  var bank = document.getElementById('bank');
  if (!bank) return;
  document.getElementById('bankCnt').textContent = '14 UNITS · TAP TO CALL UP';
  bank.innerHTML = GAMES.map(function (g) {
    var pr = progressFor(g.id);
    return '<button class="tile" data-id="' + g.id + '"><span class="screen">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true">' + g.glyph + '</svg>' +
      '<span class="nm">' + g.name + '</span><span class="cls">' + g.cls + '</span>' +
      '<span class="st' + (pr ? '' : ' none') + '">' + (pr ? escapeHtml(cleanLabel(pr.label)) : 'READY') + '</span>' +
      '</span></button>';
  }).join('');
  bank.querySelectorAll('.tile').forEach(function (t) {
    t.addEventListener('click', function () { callUp(t.getAttribute('data-id')); });
    var scr = t.querySelector('.screen');
    t.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch' || !scr) return;
      var r = t.getBoundingClientRect();
      var dx = (e.clientX - r.left) / r.width - .5, dy = (e.clientY - r.top) / r.height - .5;
      scr.style.setProperty('--try', (dx * 3.4).toFixed(2) + 'deg');
      scr.style.setProperty('--trx', (-dy * 3.4).toFixed(2) + 'deg');
    });
    t.addEventListener('pointerleave', function () {
      if (!scr) return;
      scr.style.setProperty('--try', '0deg');
      scr.style.setProperty('--trx', '0deg');
    });
  });
  document.querySelectorAll('.opsbar .key').forEach(function (k) {
    k.addEventListener('click', function () {
      document.querySelectorAll('.opsbar .key').forEach(function (x) { x.classList.remove('on'); });
      k.classList.add('on');
      var f = k.getAttribute('data-ops');
      if (f === 'all') {
        bank.classList.remove('dim');
        bank.querySelectorAll('.tile').forEach(function (t) { t.classList.remove('hit'); });
        return;
      }
      bank.classList.add('dim');
      bank.querySelectorAll('.tile').forEach(function (t, ix) {
        var g = byId(t.getAttribute('data-id'));
        t.style.transitionDelay = (ix * 16) + 'ms';
        t.classList.toggle('hit', g.ops.indexOf(f) >= 0);
        setTimeout(function () { t.style.transitionDelay = ''; }, 600);
      });
    });
  });
})();

/* ---------- clocks: MET + local ---------- */
var t0 = Date.now();
function pad(n) { return ('' + n).padStart(2, '0'); }
function tickClock() {
  var s = Math.floor((Date.now() - t0) / 1000);
  var met = document.getElementById('met');
  if (met) met.textContent = pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60);
  var d = new Date();
  var loc = document.getElementById('loc');
  if (loc) loc.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
  var dow = document.getElementById('dow'), dateEl = document.getElementById('date');
  if (dow) dow.textContent = ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getDay()];
  if (dateEl) dateEl.textContent = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()] + ' ' + pad(d.getDate());
  var fr = document.getElementById('fleetReset');
  if (fr) {
    var mid = new Date(d); mid.setHours(24, 0, 0, 0);
    var rs = Math.max(0, Math.floor((mid - d) / 1000));
    fr.textContent = pad(Math.floor(rs / 3600)) + ':' + pad(Math.floor(rs / 60) % 60) + ':' + pad(rs % 60);
  }
  var hh = d.getHours() + d.getMinutes() / 60;
  var w = hh >= 5 && hh < 7.5 ? 'dawn' : hh >= 7.5 && hh < 17.5 ? 'day' : hh >= 17.5 && hh < 21.5 ? 'eve' : 'night';
  if (document.body.getAttribute('data-watch') !== w) document.body.setAttribute('data-watch', w);
  var tc = document.getElementById('trkrClock');
  if (tc) tc.textContent = 'LOC ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}
setInterval(tickClock, 1000);

/* ---------- rotation: re-plot the tracker on the landscape fix ---------- */
var rszT;
window.addEventListener('resize', function () {
  clearTimeout(rszT);
  rszT = setTimeout(function () { if (trkrUp) showTracker(); }, 250);
});

/* ---------- tap tick + sound key (the hub's own tick, carried over) ---------- */
var hubSnd = true;
try { hubSnd = localStorage.getItem('hub_sound') !== 'off'; } catch (e) {}
var tickAC = null, noiseBuf = null;
function tick() {
  if (!hubSnd) return;
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!tickAC) tickAC = new AC();
    if (tickAC.state === 'suspended') tickAC.resume();
    var t = tickAC.currentTime;
    if (!noiseBuf) {
      noiseBuf = tickAC.createBuffer(1, tickAC.sampleRate * 0.03, tickAC.sampleRate);
      var ch = noiseBuf.getChannelData(0);
      for (var i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    }
    /* the contact: a 30ms noise snap through a bandpass — a switch, not a tone */
    var ns = tickAC.createBufferSource(); ns.buffer = noiseBuf;
    var bp = tickAC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2100; bp.Q.value = 0.9;
    var ng = tickAC.createGain();
    ng.gain.setValueAtTime(0.14, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    ns.connect(bp); bp.connect(ng); ng.connect(tickAC.destination);
    ns.start(t); ns.stop(t + 0.035);
    /* the body: one low soft thock underneath */
    var bo = tickAC.createOscillator(), bg = tickAC.createGain();
    bo.type = 'triangle'; bo.frequency.value = 185;
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(0.05, t + 0.006);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    bo.connect(bg); bg.connect(tickAC.destination);
    bo.start(t); bo.stop(t + 0.06);
  } catch (e) {}
}
function confirmTone() {
  if (!hubSnd) return;
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!tickAC) tickAC = new AC();
    if (tickAC.state === 'suspended') tickAC.resume();
    [880, 1318.5].forEach(function (f, i) {
      var o = tickAC.createOscillator(), g = tickAC.createGain();
      var t = tickAC.currentTime + i * 0.07;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(g); g.connect(tickAC.destination);
      o.start(t); o.stop(t + 0.11);
    });
  } catch (e) {}
}
function buzz(p) {
  try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {}
}
function bleed(e, amb) {
  var scr = e.target.closest('.screen');
  if (!scr) return;
  var r = scr.getBoundingClientRect();
  var d = document.createElement('span');
  d.className = 'bleed' + (amb ? ' amb' : '');
  var S = 150;
  d.style.width = d.style.height = S + 'px';
  d.style.left = (e.clientX - r.left - S / 2) + 'px';
  d.style.top = (e.clientY - r.top - S / 2) + 'px';
  scr.appendChild(d);
  setTimeout(function () { d.remove(); }, 340);
}
document.addEventListener('pointerdown', function (e) {
  var hit = e.target.closest('.tile,.key,.opsrow,.starwrap,.exec');
  if (hit) {
    var pressEl = e.target.closest('.tile,.key,.opsrow');
    if (pressEl) {
      pressEl.classList.add('pressing');
      var clear = function () { pressEl.classList.remove('pressing'); document.removeEventListener('pointerup', clear); document.removeEventListener('pointercancel', clear); };
      document.addEventListener('pointerup', clear);
      document.addEventListener('pointercancel', clear);
    }
    if (!e.target.closest('.starwrap')) bleed(e, !!e.target.closest('.exec'));
  }
  if (e.target.closest('.exec')) { confirmTone(); return; }
  if (hit) { tick(); buzz(8); }
});
var sndKey = document.getElementById('sndKey');
function renderSnd() {
  if (!sndKey) return;
  sndKey.textContent = hubSnd ? 'SND ON' : 'SND OFF';
  sndKey.classList.toggle('on', hubSnd);
}
if (sndKey) sndKey.addEventListener('click', function () {
  hubSnd = !hubSnd;
  try { localStorage.setItem('hub_sound', hubSnd ? 'on' : 'off'); } catch (e) {}
  renderSnd();
  tick();
});
renderSnd();

/* ---------- flight log: the deck reports, in rotation, only what's true ---------- */
var ccTimer = null, ccIdx = 0;
function ccEntries() {
  var out = [];
  GAMES.forEach(function (g) { var pr = progressFor(g.id); if (pr) out.push(g.name.toUpperCase() + ' · ' + cleanLabel(pr.label).toUpperCase()); });
  var m = moonInfo();
  out.push('MOON · ' + m.name + ' · ' + Math.round(m.illum * 100) + '% LIT');
  var d = new Date(), mid = new Date(d); mid.setHours(24, 0, 0, 0);
  var rs = Math.max(0, Math.floor((mid - d) / 1000));
  out.push('DAILY RESET IN ' + pad(Math.floor(rs / 3600)) + ':' + pad(Math.floor(rs / 60) % 60) + ':' + pad(rs % 60));
  var names = Array.prototype.map.call(document.querySelectorAll('#fpln .opsrow .nm'), function (e) { return e.textContent; });
  if (names.length) out.push('TONIGHT\'S OPS · ' + names.join(' / ').toUpperCase());
  var rep = GAMES.filter(function (g) { return !!progressFor(g.id); }).length;
  out.push('FLEET · ' + rep + ' OF ' + GAMES.length + ' UNITS REPORTING');
  var fs = figureStats();
  if (fs.total) out.push('FIGURES LIT · ' + fs.done + ' OF ' + fs.total);
  return out;
}
function ccType(text, done) {
  var el = document.getElementById('ccLine');
  if (!el) { if (done) done(); return; }
  if (document.hidden) { el.textContent = text; if (done) done(); return; }
  el.textContent = '';
  var i = 0;
  (function step() {
    el.textContent = text.slice(0, ++i);
    if (i < text.length) ccTimer = setTimeout(step, 9);
    else if (done) done();
  })();
}
function ccRotate() {
  if (window.__systest) return;
  var es = ccEntries();
  if (!es.length) return;
  var el = document.getElementById('ccLine');
  if (el) el.classList.remove('amb');
  ccType(es[ccIdx++ % es.length], function () { ccTimer = setTimeout(ccRotate, 5400); });
}
function ccSay(text, holdMs, amber) {
  clearTimeout(ccTimer);
  var el = document.getElementById('ccLine');
  if (el) el.classList.toggle('amb', !!amber);
  ccType(text, function () {
    ccTimer = setTimeout(function () { if (!window.__systest) ccRotate(); }, holdMs || 1500);
  });
}
(function ccBoot() {
  if (document.documentElement.classList.contains('boot')) { setTimeout(ccBoot, 300); return; }
  ccRotate();
})();

/* ---------- power-on: the deck wakes in order, once a visit ---------- */
(function bootSeq() {
  if (!document.documentElement.classList.contains('boot')) return;
  var subs = document.querySelectorAll('.subrow .mdu');
  var els = [document.querySelector('.capcom'), document.getElementById('mdu1'), subs[0], subs[1],
    document.querySelector('.opsbar'), document.querySelector('.bankwrap'), document.querySelector('.studio')];
  var timers = [], done = false;
  var deck = document.querySelector('.deck');
  function finish() {
    if (done) return; done = true;
    timers.forEach(clearTimeout);
    els.forEach(function (e) { if (e) e.classList.add('wake'); });
    document.documentElement.classList.remove('boot');
    document.documentElement.classList.remove('flight');
    if (deck) deck.style.transform = '';
    try { sessionStorage.setItem('gz_boot', '1'); } catch (e) {}
  }
  /* the front door: the deck flies in from the dark, displays lighting
     in sequence as it docks — the wake stagger below is the lighting */
  if (deck) {
    document.documentElement.classList.add('flight');
    var ft0 = performance.now(), FDUR = 1550;
    (function fly(now) {
      if (done) return;
      var k = Math.min(1, (now - ft0) / FDUR), e = 1 - Math.pow(1 - k, 3);
      deck.style.transform = 'rotateX(' + ((1 - e) * 15).toFixed(2) + 'deg) rotateY(' + ((1 - e) * -8).toFixed(2) +
        'deg) translateZ(' + ((1 - e) * -150).toFixed(0) + 'px) translateY(' + ((1 - e) * 30).toFixed(0) + 'px)';
      if (k < 1) requestAnimationFrame(fly);
    })(ft0);
  }
  els.forEach(function (e, i) { if (e) timers.push(setTimeout(function () { e.classList.add('wake'); }, 220 + i * 200)); });
  timers.push(setTimeout(finish, 220 + els.length * 200 + 400));
  window.addEventListener('pointerdown', function h() { finish(); window.removeEventListener('pointerdown', h); });
})();

/* ---------- systems check: hold the wordmark ---------- */
function sysCheck() {
  if (window.__systest) return;
  window.__systest = true;
  var subs = document.querySelectorAll('.subrow .mdu');
  var targets = [document.getElementById('mdu1'), subs[0], subs[1], document.querySelector('.strip'), document.querySelector('.opsbar')];
  var steps = ['MDU 1', 'MDU 2', 'MDU 3', 'AUDIO', 'UPLINK'];
  ccSay('SYS CHECK IN PROGRESS', 800);
  steps.forEach(function (s, i) {
    setTimeout(function () {
      tick();
      var t = targets[i];
      if (t) { t.classList.remove('testflash'); void t.offsetWidth; t.classList.add('testflash'); }
      ccSay('SYS CHECK · ' + steps.slice(0, i + 1).map(function (x) { return x + ' \u2713'; }).join(' · '), 600);
    }, 400 + i * 400);
  });
  setTimeout(function () {
    confirmTone(); buzz([10, 40, 10]);
    window.__systest = false;
    ccSay('ALL SYSTEMS GO', 2800, true);
  }, 400 + steps.length * 400 + 300);
}
(function () {
  var brand = document.querySelector('.strip .brand');
  if (!brand) return;
  var t = null, fired = false;
  brand.addEventListener('pointerdown', function () {
    fired = false;
    brand.classList.add('holding');
    t = setTimeout(function () { fired = true; brand.classList.remove('holding'); sysCheck(); }, 650);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
    brand.addEventListener(ev, function () { clearTimeout(t); brand.classList.remove('holding'); });
  });
  brand.addEventListener('click', function (e) { if (fired) { e.preventDefault(); fired = false; } });
})();

showTracker();
tickClock();
})();
