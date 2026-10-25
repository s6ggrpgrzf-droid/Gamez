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
function twkStyle(id, dim) {
  var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  var dur = (2.6 + (h % 23) / 10).toFixed(2), del = (-(h % 40) / 10).toFixed(2);
  return 'animation:' + (dim ? 'twkDim ' : 'twk ') + dur + 's ease-in-out ' + del + 's infinite';
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

function showTracker() {
  if (printTimer) { clearInterval(printTimer); printTimer = null; }
  trkrUp = true;
  mduPage.textContent = 'STR TRKR';
  var lines = LINKS.map(function (pr) {
    var a = xy(POS[pr[0]]), b = xy(POS[pr[1]]);
    return '<line class="lk" pathLength="1" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>';
  }).join('');
  var stars = Object.keys(POS).map(function (id) {
    var raw = POS[id], p = xy(raw).concat([raw[4]]), r = [0, 0.85, 1.2, 1.7][p[2]], g = byId(id);
    if (g) starXY[id] = [p[0], p[1]];
    if (!g) return '<circle class="star" style="' + twkStyle(id, true) + '" cx="' + p[0] + '" cy="' + p[1] + '" r="' + (r * .85) + '" opacity=".75"/>';
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
      '<circle class="star" style="' + twkStyle(id, false) + '" cx="' + p[0] + '" cy="' + p[1] + '" r="' + r + '"/>' + ticks + tgt +
      '<text class="slab" x="' + lx + '" y="' + ly + '" text-anchor="' + anchor + '">' + SHORT[id] + '</text></g>';
  }).join('');
  main.innerHTML =
    '<div class="trkr-wrap"><div class="trkr-head"><span><b>STR TRKR</b> · FIX: LIVE</span><span id="trkrClock"></span></div>' +
    '<svg id="trkr" class="' + (acquiredOnce ? '' : 'acq') + '" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Star tracker — the collection as a constellation">' +
    '<defs><linearGradient id="swg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4ce8a4" stop-opacity="0"/><stop offset=".5" stop-color="#4ce8a4" stop-opacity=".16"/><stop offset="1" stop-color="#4ce8a4" stop-opacity="0"/></linearGradient></defs>' +
    lines + stars + '<rect class="sweep" x="0" y="-18" width="100" height="16" fill="url(#swg)"/>' + '</svg>' +
    '<div class="trkr-foot"><span>SELECT STAR &#8594; CALL UP</span><span class="amb">14 UNITS</span></div></div>';
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
  main.innerHTML =
    '<div class="gpage"><svg class="wm" viewBox="0 0 24 24" aria-hidden="true">' + g.glyph + '</svg><div class="cls">UNIT CALLED UP // MDU 1</div>' +
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
    setTimeout(function () { window.location.href = href; }, 430);
  });
  document.getElementById('mdu1').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* the tracker repaints itself every half minute while it is up */
setInterval(function () {
  var sw = document.querySelector('#trkr .sweep');
  if (!sw) return;
  sw.classList.remove('go');
  void sw.getBoundingClientRect();
  sw.classList.add('go');
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
    el.innerHTML = '<p class="nodata"><b>NO DATA.</b><br>No flights logged on this device yet. Play any unit and its telemetry reports here — scores, levels, streaks, as live values.</p>' +
      '<div class="fleet"><div class="frow"><span>UNITS REPORTING</span><b>0 / ' + GAMES.length + '</b></div>' +
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
    fleetHtml = '<div class="fleet"><div class="frow"><span>UNITS REPORTING</span><b>' + rows.length + ' / ' + GAMES.length + '</b></div>' +
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

showTracker();
tickClock();
})();
