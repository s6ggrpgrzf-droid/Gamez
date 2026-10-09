/* Word Well — Words-With-Friends-style crossword tile game (UI/controller).
 * Engine: WWF (wwf.js, pure sim). Dictionary: WW_DICT chunks (gzip+base64).
 * Screens: load, menu, diff, game, over. No <input> elements; no emojis.
 */
(function () {
'use strict';

/* ---------------- helpers ---------------- */
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '&lt;': '&lt;', '&gt;': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function dateStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function todayStr() { return dateStr(new Date()); }
var toastTimer = null;
function toast(msg, ms, cls) {
  var t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (cls ? ' ' + cls : '');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.className = 'toast'; }, ms || 2200);
}
function lsGet(k, dflt) {
  try { var v = localStorage.getItem(k); return v == null ? dflt : v; } catch (e) { return dflt; }
}
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

/* ---------------- constants ---------------- */
var ARCADE = 'https://gamez-arcade.chaoticutopia84.workers.dev';
var ROOMS = 'https://wordwell-rooms.chaoticutopia84.workers.dev';
var GAME_KEY = 'word-well';
var BUILD_TAG = 'build 20261009a';
var WARDEN_NAME = 'Well Warden';

var WARDEN_THINKING = [
  'The well says: hmm…',
  'The well says: let me see…',
  'The well says: the stones are whispering…',
  'The well says: patience, the letters settle…'
];
var WARDEN_GOOD = [
  'The well says: a fine casting of stones.',
  'The well says: the deep approves.',
  'The well says: even the dark noticed that one.'
];
var WARDEN_WIN = [
  'The well says: the deep keeps your stones. Better luck next descent.',
  'The well says: I have swallowed brighter players. Well played.'
];
var WARDEN_LOSE = [
  'The well says: the water ripples with respect. You win.',
  'The well says: a worthy descent. The well remembers.'
];
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

/* ---------------- boosts ---------------- */
var BOOSTS = (function () {
  var b;
  try { b = JSON.parse(lsGet('wwf_boosts', '')) || null; } catch (e) { b = null; }
  if (!b || typeof b !== 'object') b = { radar: 2, hindsight: 2, swapp: 2, pile: 2 };
  return b;
})();
function saveBoosts() { lsSet('wwf_boosts', JSON.stringify(BOOSTS)); }
function earnBoost(n) {
  var keys = ['radar', 'hindsight', 'swapp', 'pile'];
  for (var i = 0; i < (n || 1); i++) BOOSTS[keys[(Math.random() * keys.length) | 0]]++;
  saveBoosts();
}

/* ---------------- game state ---------------- */
var G = {
  mode: null, diff: 'medium', st: null,
  rackView: [], sel: null,
  tent: [], dir: 'across',
  swapMode: false, swapPlus: false, swapSel: [],
  hindsightArmed: false,
  over: false, busy: false,
  names: ['You', WARDEN_NAME]
};

/* ---------------- online (async multiplayer) ---------------- */
var OL = {
  code: null, token: null, seat: -1,
  pollTimer: null, lastJson: '',
  rackAuth: [],            /* authoritative rack order from the server (never shuffled) */
  codeEntry: ''
};

/* ---------------- screens ---------------- */
var SCREENS = ['scr-load', 'scr-menu', 'scr-diff', 'scr-game', 'scr-over', 'scr-online'];
function show(id) {
  SCREENS.forEach(function (s) { $(s).classList.toggle('hidden', s !== id); });
  window.scrollTo(0, 0);
}

/* ---------------- dictionary load ---------------- */
function setLoadMsg(t) { $('loadmsg').textContent = t; }
function loadDictionary() {
  if (!window.DecompressionStream) {
    setLoadMsg('This well needs a browser with gzip support (DecompressionStream) to hold its 170,000 words. Try a recent Safari or Chrome.');
    return;
  }
  if (!window.WW_DICT || !window.WW_DICT.length) {
    setLoadMsg('The dictionary stones are missing. Check your connection and reload.');
    return;
  }
  setLoadMsg('Filling the well with words…');
  setTimeout(function () {
    try {
      var raw = window.WW_DICT.join('');
      var bin = atob(raw);
      var u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      setLoadMsg('Lowering the word-stones…');
      setTimeout(function () {
        var stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
        new Response(stream).text().then(function (text) {
          setLoadMsg('Waking the Well Warden…');
          setTimeout(function () {
            var words = text.split('\n');
            var n = WWF.setWords(words);
            if (!n) { setLoadMsg('The words would not settle. Reload to try again.'); return; }
            window.WW_DICT = null;
            boot();
          }, 30);
        }).catch(function () { setLoadMsg('The words slipped. Reload to try again.'); });
      }, 30);
    } catch (e) { setLoadMsg('The words slipped. Reload to try again.'); }
  }, 30);
}

/* ---------------- menu ---------------- */
function arcadeName() { return (lsGet('arcade_name', '') || '').trim(); }
function arcadeFetch(path, body, cb) {
  var done = false, timer = null;
  function fin(e, d) { if (!done) { done = true; if (timer) clearTimeout(timer); cb(e, d); } }
  timer = setTimeout(function () { fin(new Error('timeout')); }, 12000);
  try {
    fetch(ARCADE + path, body ?
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
      .then(function (r) { return r.json(); })
      .then(function (d) { fin(null, d); })
      .catch(function (e) { fin(e); });
  } catch (e) { fin(e); }
}
function renderMenuBoard() {
  var el = $('menu-board');
  arcadeFetch('/scores?game=' + GAME_KEY + '&board=daily-' + todayStr(), null, function (err, data) {
    if (err || !data || !data.top || !data.top.length) {
      el.innerHTML = '<div class="lb-empty">the well is quiet today — be the first to cast a score</div>';
      return;
    }
    el.innerHTML = data.top.slice(0, 5).map(function (e, i) {
      return '<div class="lb-row"><span>' + (i + 1) + '. ' + esc(e.name) + '</span><b>' + (+e.score) + '</b></div>';
    }).join('');
  });
}
function dailyStreak() {
  try {
    var d = JSON.parse(lsGet('wwf_daily', '') || '{}');
    return d.streak || 0;
  } catch (e) { return 0; }
}
function boot() {
  buildBoard();
  buildRack();
  bindMenu();
  bindOnline();
  var st = dailyStreak();
  $('menu-streak').textContent = st > 0 ? st + '-day daily streak' : 'no daily streak yet';
  $('build-tag').textContent = BUILD_TAG;
  renderMenuBoard();
  show('scr-menu');
  /* poll when the tab comes back into view */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && G.mode === 'online' && OL.code && !G.over) olPollGame();
  });
  /* share-link join: #join=CODE */
  var m = location.hash.match(/#join=([A-Za-z2-9]{6})/i);
  if (m) {
    try { history.replaceState(null, '', location.pathname + location.search); }
    catch (e) { location.hash = ''; }
    var code = m[1].toUpperCase();
    showOnline(code);
    toast('code ' + code + ' is ready — tap join the game');
  }
}
function bindMenu() {
  $('btn-solo').onclick = function () { WWAU.ensure(); WWAU.tap(); show('scr-diff'); };
  $('btn-passplay').onclick = function () { WWAU.ensure(); WWAU.tap(); startPass(); };
  $('btn-daily').onclick = function () { WWAU.ensure(); WWAU.tap(); startDaily(); };
  $('btn-online').onclick = function () { WWAU.ensure(); WWAU.tap(); showOnline(); };
  $('btn-how').onclick = function () { WWAU.tap(); $('ov-how').classList.remove('hidden'); };
  $('ov-how-close').onclick = function () { WWAU.tap(); $('ov-how').classList.add('hidden'); };
  $('btn-mute').onclick = function () {
    var m = WWAU.toggleMute();
    $('btn-mute').textContent = m ? 'sound off' : 'sound on';
  };
  $('btn-mute').textContent = WWAU.isMuted() ? 'sound off' : 'sound on';
  var diffBtns = document.querySelectorAll('#scr-diff [data-diff]');
  for (var i = 0; i < diffBtns.length; i++) {
    (function (b) {
      b.onclick = function () { WWAU.tap(); startSolo(b.getAttribute('data-diff')); };
    })(diffBtns[i]);
  }
  $('diff-back').onclick = function () { WWAU.tap(); show('scr-menu'); };
}

/* ---------------- game setup ---------------- */
function startSolo(diff) {
  G.mode = 'solo'; G.diff = diff;
  G.names = ['You', WARDEN_NAME];
  var seed = (Math.random() * 0xFFFFFFFF) >>> 0;
  newEngineGame(seed);
}
function startPass() {
  G.mode = 'pass'; G.diff = 'medium';
  G.names = ['Player 1', 'Player 2'];
  var seed = (Math.random() * 0xFFFFFFFF) >>> 0;
  newEngineGame(seed);
}
function startDaily() {
  G.mode = 'daily'; G.diff = 'medium';
  G.names = ['You', WARDEN_NAME];
  var seed = WWF.hashSeed('word-well|' + todayStr());
  newEngineGame(seed);
  toast('Daily well: same stones for everyone today');
}
function newEngineGame(seed) {
  G.st = WWF.newGame(seed);
  G.sel = null; G.tent = []; G.dir = 'across';
  G.swapMode = false; G.swapPlus = false; G.swapSel = [];
  G.hindsightArmed = false; G.over = false; G.busy = false;
  G.rackView = G.st.racks[0].slice();
  bindGame();
  renderAll();
  show('scr-game');
  setTurnBanner();
  if (!G.st.firstDone) toast('First word must cover the glowing star');
}

/* ---------------- board + rack DOM ---------------- */
var cellEls = [];
function premiumLabel(pr, r, c) {
  if (r === 7 && c === 7) return '✦';
  if (pr === 'TW') return 'TW';
  if (pr === 'DW') return 'DW';
  if (pr === 'TL') return 'TL';
  if (pr === 'DL') return 'DL';
  return '';
}
function buildBoard() {
  var bd = $('board');
  bd.innerHTML = '';
  cellEls = [];
  for (var r = 0; r < 15; r++) {
    cellEls.push([]);
    for (var c = 0; c < 15; c++) {
      (function (rr, cc) {
        var d = document.createElement('div');
        d.className = 'cell';
        var pr = WWF.PREMIUM[rr][cc];
        if (pr === 'TW') d.classList.add('p-tw');
        else if (pr === 'DW') d.classList.add('p-dw');
        else if (pr === 'TL') d.classList.add('p-tl');
        else if (pr === 'DL') d.classList.add('p-dl');
        if (rr === 7 && cc === 7) d.classList.add('star');
        d.innerHTML = '<span class="plab">' + premiumLabel(pr, rr, cc) + '</span><span class="tlet"></span><span class="tval"></span>';
        d.addEventListener('click', function () { tapCell(rr, cc); });
        bd.appendChild(d);
        cellEls[rr].push(d);
      })(r, c);
    }
  }
}
function buildRack() {
  var rk = $('rack');
  rk.innerHTML = '';
  for (var i = 0; i < 7; i++) {
    (function (ix) {
      var d = document.createElement('div');
      d.className = 'rslot';
      d.innerHTML = '<span class="tlet"></span><span class="tval"></span>';
      d.addEventListener('click', function () { tapRack(ix); });
      rk.appendChild(d);
    })(i);
  }
}
function tileLabel(t) { return t.blank ? '·' : t.ch; }
function tileVal(t) { return t.blank ? '' : String(t.v); }

function renderBoard() {
  var st = G.st;
  for (var r = 0; r < 15; r++) for (var c = 0; c < 15; c++) {
    var d = cellEls[r][c], t = st.board[r][c];
    var tent = tentAt(r, c);
    d.classList.toggle('filled', !!t);
    d.classList.toggle('tent', !!tent);
    /* seat-relative side colors: your stones vs theirs, WWF-style */
    var isOpp = t && (G.mode === 'online' ? (OL.seat >= 0 && t.own !== OL.seat) : (t.own === 1));
    d.classList.toggle('opp', !!isOpp);
    d.classList.remove('hint', 'ghost', 'lastmv');
    var tl = d.querySelector('.tlet'), tv = d.querySelector('.tval'), pl = d.querySelector('.plab');
    if (t) {
      tl.textContent = t.ch; tv.textContent = t.v > 0 ? t.v : '';
      pl.style.display = 'none';
      d.classList.toggle('wasblank', !!t.blank);
    } else if (tent) {
      tl.textContent = tent.blankCh || tileLabel(tent.tile);
      tv.textContent = tent.tile.blank ? '' : String(tent.tile.v);
      pl.style.display = 'none';
    } else {
      tl.textContent = ''; tv.textContent = '';
      pl.style.display = '';
    }
  }
  /* last-move highlight: who played what, WWF-style */
  var lm = st.lastMove;
  if (lm && lm.cells) {
    for (var i = 0; i < lm.cells.length; i++) {
      var cc = lm.cells[i];
      if (cellEls[cc.r] && cellEls[cc.r][cc.c]) cellEls[cc.r][cc.c].classList.add('lastmv');
    }
  }
}
function renderRack() {
  var rk = $('rack').children;
  for (var i = 0; i < 7; i++) {
    var d = rk[i], t = G.rackView[i];
    var tl = d.querySelector('.tlet'), tv = d.querySelector('.tval');
    if (t) {
      tl.textContent = tileLabel(t); tv.textContent = tileVal(t);
      d.classList.add('has');
      d.classList.toggle('sel', G.sel === t);
      d.classList.toggle('swapsel', G.swapSel.indexOf(t) >= 0);
      d.classList.toggle('used', tentUses(t));
    } else {
      tl.textContent = ''; tv.textContent = '';
      d.classList.remove('has', 'sel', 'swapsel', 'used');
    }
  }
}
function renderHUD() {
  var st = G.st;
  $('hud-s0').textContent = G.names[0] + ': ' + st.scores[0];
  $('hud-s1').textContent = G.names[1] + ': ' + st.scores[1];
  $('hud-s0').classList.toggle('turn', st.turn === 0 && !st.over);
  $('hud-s1').classList.toggle('turn', st.turn === 1 && !st.over);
  $('hud-bag').textContent = 'stones left: ' + st.bag.length;
}
function renderBoosts() {
  $('b-radar-n').textContent = BOOSTS.radar;
  $('b-hind-n').textContent = BOOSTS.hindsight;
  $('b-swapp-n').textContent = BOOSTS.swapp;
  $('b-pile-n').textContent = BOOSTS.pile;
  $('b-hind').classList.toggle('armed', G.hindsightArmed);
}
function renderAll() {
  renderBoard(); renderRack(); renderHUD(); renderBoosts(); renderPreview();
}
function oppName() {
  if (G.mode !== 'online' || OL.seat < 0) return '';
  var n = G.names[1 - OL.seat];
  return n || 'your friend';
}
function setTurnBanner() {
  var st = G.st, el = $('turn-banner');
  if (st.over) { el.textContent = 'the well is still'; el.classList.remove('thinking'); return; }
  if (G.mode === 'online') {
    var mine = st.turn === OL.seat;
    el.textContent = mine ? 'your turn — cast your stones' : 'waiting on ' + oppName() + '…';
    el.classList.toggle('thinking', !mine);
    return;
  }
  if (G.mode === 'solo' || G.mode === 'daily') {
    var warden = st.turn === 1;
    el.textContent = warden ? 'the Well Warden is thinking' : 'your turn — cast your stones';
    el.classList.toggle('thinking', warden);
  } else {
    el.textContent = G.names[st.turn] + ' — cast your stones';
    el.classList.remove('thinking');
  }
}
function popPreview() {
  var pv = $('preview');
  pv.classList.remove('pop');
  void pv.offsetWidth;
  pv.classList.add('pop');
}

/* ---------------- tentative placement ---------------- */
function tentAt(r, c) {
  for (var i = 0; i < G.tent.length; i++) {
    var t = G.tent[i];
    if (t.r === r && t.c === c) return t;
  }
  return null;
}
function tentUses(tile) {
  for (var i = 0; i < G.tent.length; i++) if (G.tent[i].tile === tile) return true;
  return false;
}
function placementsFromTent() {
  return G.tent.map(function (t) {
    return { r: t.r, c: t.c, tile: t.tile, blankCh: t.blankCh || null };
  });
}
function detectDir() {
  if (G.tent.length >= 2) {
    var a = G.tent[0], b = G.tent[1];
    G.dir = (a.r === b.r) ? 'across' : 'down';
  }
}
function renderPreview() {
  var el = $('preview');
  if (!G.st || G.st.over) { el.textContent = ''; return; }
  if (G.mode === 'online' && !isHumanTurn()) {
    el.textContent = 'waiting on ' + oppName() + ' — the well will ripple when they play';
    el.className = 'preview idle';
    return;
  }
  if (!G.tent.length) {
    el.textContent = G.st.firstDone ? 'tap a stone, then tap the board' : 'first word must cover the glowing star ✦';
    el.className = 'preview idle';
    return;
  }
  var v = WWF.validatePlacement(G.st, placementsFromTent(), G.dir);
  if (v.ok) {
    var words = v.words.map(function (w) { return w.word; }).join(', ');
    el.textContent = words + ' · ' + v.score + ' pts' + (v.bingo ? ' · BINGO +35' : '');
    el.className = 'preview good';
  } else {
    el.textContent = friendlyError(v);
    el.className = 'preview bad';
  }
}
function friendlyError(v) {
  switch (v.error) {
    case 'star': return 'first word must cover the glowing star';
    case 'crooked': return 'stones must form one straight line';
    case 'gap': return 'stones must connect without gaps';
    case 'loose': return 'words must touch the well';
    case 'word': return v.message;
    case 'short': return 'words need at least 2 letters';
    case 'occupied': return 'that cell is taken';
    case 'blank': return 'choose a letter for the blank stone';
    default: return 'that placement will not hold';
  }
}

/* ---------------- interaction ---------------- */
function isHumanTurn() {
  if (G.over || G.busy || !G.st || G.st.over) return false;
  if (G.mode === 'pass') return true;
  if (G.mode === 'online') return G.st.turn === OL.seat;
  return G.st.turn === 0;
}
function tapRack(ix) {
  if (!isHumanTurn()) return;
  var t = G.rackView[ix];
  if (!t || tentUses(t)) return;
  WWAU.ensure();
  if (G.swapMode) {
    var si = G.swapSel.indexOf(t);
    if (si >= 0) G.swapSel.splice(si, 1); else G.swapSel.push(t);
    WWAU.tap();
    renderRack(); renderSwapBtn();
    return;
  }
  G.sel = (G.sel === t) ? null : t;
  WWAU.tap();
  renderRack();
}
function tapCell(r, c) {
  if (!isHumanTurn()) return;
  var st = G.st;
  if (st.board[r][c]) return;
  var ex = tentAt(r, c);
  if (ex) {
    G.tent.splice(G.tent.indexOf(ex), 1);
    if (G.sel === ex.tile) G.sel = null;
    WWAU.recall();
    detectDir(); renderAll();
    return;
  }
  if (!G.sel) return;
  /* keep placements in one line */
  if (G.tent.length === 1) {
    var a = G.tent[0];
    if (a.r !== r && a.c !== c) { toast('stones must form one straight line'); return; }
    G.dir = (a.r === r) ? 'across' : 'down';
  } else if (G.tent.length > 1) {
    var okLine = G.dir === 'across' ? (r === G.tent[0].r) : (c === G.tent[0].c);
    if (!okLine) { toast('stones must form one straight line'); return; }
  }
  var tile = G.sel;
  if (tile.blank) {
    openBlankPicker(r, c, tile);
    return;
  }
  G.tent.push({ r: r, c: c, tile: tile, blankCh: null });
  G.sel = null;
  WWAU.clack();
  detectDir(); renderAll();
}
function openBlankPicker(r, c, tile) {
  var ov = $('ov-blank'), grid = $('blank-grid');
  grid.innerHTML = '';
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(function (L) {
    var b = document.createElement('button');
    b.className = 'bkey';
    b.textContent = L;
    b.onclick = function () {
      WWAU.clack();
      G.tent.push({ r: r, c: c, tile: tile, blankCh: L });
      G.sel = null;
      ov.classList.add('hidden');
      detectDir(); renderAll();
    };
    grid.appendChild(b);
  });
  $('ov-blank-cancel').onclick = function () { ov.classList.add('hidden'); };
  ov.classList.remove('hidden');
}

/* ---------------- buttons ---------------- */
function renderSwapBtn() {
  $('btn-swap').textContent = G.swapMode ? ('swap ' + G.swapSel.length + ' ✓') : 'swap';
}
function bindGame() {
  $('btn-play').onclick = onPlay;
  $('btn-swap').onclick = onSwap;
  $('btn-pass').onclick = onPass;
  $('btn-shuffle').onclick = function () {
    if (!isHumanTurn()) return;
    for (var i = G.rackView.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var t = G.rackView[i]; G.rackView[i] = G.rackView[j]; G.rackView[j] = t;
    }
    WWAU.tap(); renderRack();
  };
  $('btn-recall').onclick = function () {
    if (!isHumanTurn() || !G.tent.length) return;
    G.tent = []; G.sel = null;
    WWAU.recall(); renderAll();
  };
  $('btn-flip').onclick = function () {
    if (!isHumanTurn()) return;
    G.dir = (G.dir === 'across') ? 'down' : 'across';
    WWAU.tap(); renderPreview();
    toast(G.dir === 'across' ? 'placing → across' : 'placing → down');
  };
  $('btn-menu2').onclick = function () { WWAU.tap(); olStopPoll(); show('scr-menu'); renderMenuBoard(); };
  document.querySelector('#scr-game .boosts').style.display = (G.mode === 'online') ? 'none' : '';
  $('btn-radar').onclick = onRadar;
  $('b-hind').onclick = onHindsight;
  $('btn-swapp').onclick = onSwapPlus;
  $('btn-pile').onclick = onTilePile;
  $('ov-pile-close').onclick = function () { $('ov-pile').classList.add('hidden'); };
  renderSwapBtn();
}
function currentPlayer() { return G.st.turn; }

function onPlay() {
  if (!isHumanTurn()) return;
  var st = G.st, player = st.turn;
  if (G.swapMode) { exitSwapMode(); return; }
  if (!G.tent.length) { toast('place some stones first'); return; }
  if (G.mode === 'online') {
    var pv = WWF.validatePlacement(G.st, placementsFromTent(), G.dir);
    if (!pv.ok) { WWAU.error(); toast(friendlyError(pv)); return; }
    olSubmitMove();
    return;
  }
  var placements = placementsFromTent();
  var hindBest = null;
  if (G.hindsightArmed) {
    var cands = WWF.findMoves(st, player, { wordCap: 900, placeCap: 30000 });
    if (cands.length) {
      cands.sort(function (a, b) { return b.score - a.score; });
      hindBest = cands[0];
    }
  }
  var v = WWF.applyMove(st, placements, G.dir);
  if (!v.ok) { WWAU.error(); toast(friendlyError(v)); return; }
  G.hindsightArmed = false;
  G.tent = []; G.sel = null;
  if (v.bingo) { WWAU.bingo(); toast('BINGO! +35', 2600, 'big'); }
  else WWAU.play();
  popPreview();
  afterHumanMove(player, v, hindBest);
}
function afterHumanMove(player, v, hindBest) {
  /* rackView follows whoever's turn it is now */
  G.rackView = G.st.racks[G.st.turn].slice();
  renderAll(); setTurnBanner();
  if (hindBest && !G.st.over) showHindsight(hindBest);
  if (G.st.over) { gameOver(); return; }
  if (G.mode === 'solo' || G.mode === 'daily') {
    if (G.st.turn === 1) {
      G.busy = true;
      setTurnBanner();
      setTimeout(botPlay, 750);
    }
  } else {
    G.rackView = G.st.racks[G.st.turn].slice();
    renderAll(); setTurnBanner();
    toast(G.names[G.st.turn] + ' — pass the phone');
  }
}
function showHindsight(best) {
  flashCells(best.placements.map(function (p) { return [p.r, p.c]; }), 'ghost', 3200);
  var words = best.words.map(function (w) { return w.word; }).join(', ');
  toast('The well whispers: ' + words + ' was worth ' + best.score, 3200);
}
function flashCells(cells, cls, ms) {
  cells.forEach(function (cc) { cellEls[cc[0]][cc[1]].classList.add(cls); });
  setTimeout(function () {
    cells.forEach(function (cc) { cellEls[cc[0]][cc[1]].classList.remove(cls); });
  }, ms || 2500);
}

function onSwap() {
  if (!isHumanTurn()) return;
  var st = G.st;
  if (G.mode === 'online') {
    if (!G.swapMode) {
      if (st.bag.length < 7) { toast('the well is too low to swap (needs 7 stones)'); return; }
      G.swapMode = true; G.swapSel = [];
      WWAU.tap(); renderRack(); renderSwapBtn();
      toast('tap stones to swap, then tap swap again');
      return;
    }
    if (!G.swapSel.length) { exitSwapMode(); return; }
    var oidxs = G.swapSel.map(function (t) { return OL.rackAuth.indexOf(t); })
      .filter(function (i) { return i >= 0; });
    exitSwapMode();
    olSubmitSwap(oidxs);
    return;
  }
  if (!G.swapMode) {
    if (st.bag.length < 7) { toast('the well is too low to swap (needs 7 stones)'); return; }
    G.swapMode = true; G.swapSel = [];
    WWAU.tap(); renderRack(); renderSwapBtn();
    toast('tap stones to swap, then tap swap again');
    return;
  }
  /* commit */
  if (!G.swapSel.length) { exitSwapMode(); return; }
  var idxs = G.swapSel.map(function (t) { return G.rackView.indexOf(t); }).filter(function (i) { return i >= 0; });
  var keep = G.swapPlus;
  if (keep) {
    if (BOOSTS.swapp <= 0) { toast('no swap+ stones left'); exitSwapMode(); return; }
    BOOSTS.swapp--; saveBoosts();
  }
  var r = WWF.swapTiles(st, st.turn, idxs, keep);
  exitSwapMode();
  if (!r.ok) { toast('the swap slipped'); return; }
  WWAU.play();
  G.rackView = st.racks[st.turn].slice();
  renderAll(); setTurnBanner();
  if (keep) toast('swapped without losing your turn');
  else afterSwapOrPass();
}
function exitSwapMode() {
  G.swapMode = false; G.swapPlus = false; G.swapSel = [];
  renderRack(); renderSwapBtn();
}
function afterSwapOrPass() {
  if (G.st.over) { gameOver(); return; }
  if ((G.mode === 'solo' || G.mode === 'daily') && G.st.turn === 1) {
    G.busy = true; setTurnBanner();
    setTimeout(botPlay, 750);
  } else {
    G.rackView = G.st.racks[G.st.turn].slice();
    renderAll(); setTurnBanner();
    if (G.mode === 'pass') toast(G.names[G.st.turn] + ' — pass the phone');
  }
}
function onPass() {
  if (!isHumanTurn()) return;
  if (G.swapMode) exitSwapMode();
  if (G.mode === 'online') { olSubmitPass(); return; }
  WWF.passTurn(G.st);
  WWAU.tap();
  toast(G.names[1 - G.st.turn] + ' passed');
  afterSwapOrPass();
}

/* ---------------- bot ---------------- */
function botPlay() {
  var st = G.st;
  if (!st || st.over || st.turn !== 1) { G.busy = false; return; }
  toast(pick(WARDEN_THINKING));
  setTimeout(function () {
    var mv = WWF.botMove(st, 1, G.diff, Math.random);
    G.busy = false;
    if (mv.type === 'play') {
      var v = WWF.applyMove(st, mv.placements, mv.dir);
      if (v.ok) {
        if (v.score >= 30 || v.bingo) toast(pick(WARDEN_GOOD) + ' (' + v.score + ')');
        else WWAU.play();
        if (v.bingo) WWAU.bingo();
        popPreview();
      }
    } else if (mv.type === 'swap') {
      WWF.swapTiles(st, 1, mv.idxs);
      toast('The well says: these stones displease me. (swap)');
    } else {
      WWF.passTurn(st);
      toast('The well says: I pass.');
    }
    G.rackView = st.racks[st.turn].slice();
    renderAll(); setTurnBanner();
    if (st.over) gameOver();
  }, 650);
}

/* ---------------- boosts ---------------- */
function needHuman() { return isHumanTurn(); }
function onRadar() {
  if (G.mode === 'online') return; /* no boosts in friend games */
  if (!needHuman()) return;
  if (BOOSTS.radar <= 0) { toast('no radar stones left — win games to earn more'); return; }
  var st = G.st;
  var moves = WWF.findMoves(st, st.turn, { wordCap: 900, placeCap: 30000 });
  if (!moves.length) { toast('the radar finds nothing'); return; }
  moves.sort(function (a, b) { return b.score - a.score; });
  var best = moves[0];
  BOOSTS.radar--; saveBoosts(); renderBoosts();
  WWAU.turn();
  flashCells(best.placements.map(function (p) { return [p.r, p.c]; }), 'hint', 3000);
  var words = best.words.map(function (w) { return w.word; }).join(', ');
  toast('Radar: ' + words + ' for ' + best.score + ' pts', 3000);
}
function onHindsight() {
  if (G.mode === 'online') return; /* no boosts in friend games */
  if (!needHuman()) return;
  if (G.hindsightArmed) { G.hindsightArmed = false; renderBoosts(); toast('hindsight stood down'); return; }
  if (BOOSTS.hindsight <= 0) { toast('no hindsight stones left — win games to earn more'); return; }
  BOOSTS.hindsight--; saveBoosts();
  G.hindsightArmed = true; renderBoosts();
  WWAU.turn();
  toast('hindsight armed — play, and the well will show what you missed');
}
function onSwapPlus() {
  if (G.mode === 'online') return; /* no boosts in friend games */
  if (!needHuman()) return;
  if (G.st.bag.length < 7) { toast('the well is too low to swap (needs 7 stones)'); return; }
  if (BOOSTS.swapp <= 0) { toast('no swap+ stones left — win games to earn more'); return; }
  G.swapMode = true; G.swapPlus = true; G.swapSel = [];
  WWAU.tap(); renderRack(); renderSwapBtn();
  toast('tap stones to swap — your turn continues after');
}
function onTilePile() {
  if (G.mode === 'online') return; /* no boosts in friend games */
  if (!G.st) return;
  if (BOOSTS.pile <= 0 && !$('ov-pile').classList.contains('hidden')) { $('ov-pile').classList.add('hidden'); return; }
  if (BOOSTS.pile <= 0) { toast('no tile-pile stones left — win games to earn more'); return; }
  BOOSTS.pile--; saveBoosts(); renderBoosts();
  var counts = {}, i;
  G.st.bag.forEach(function (t) {
    var k = t.blank ? 'blank' : t.ch;
    counts[k] = (counts[k] || 0) + 1;
  });
  var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  var html = '<div class="pile-grid">';
  letters.forEach(function (L) {
    html += '<div class="pile-cell"><b>' + L + '</b><span>' + (counts[L] || 0) + '</span></div>';
  });
  html += '<div class="pile-cell"><b title="blank stone">·</b><span>' + (counts.blank || 0) + '</span></div></div>';
  html += '<div class="pile-note">' + G.st.bag.length + ' stones remain in the well</div>';
  $('ov-pile-body').innerHTML = html;
  $('ov-pile').classList.remove('hidden');
  WWAU.tap();
}

/* ---------------- online multiplayer ---------------- */
function roomsFetch(path, body, cb) {
  var done = false, timer = null;
  function fin(e, d) { if (!done) { done = true; if (timer) clearTimeout(timer); cb(e, d); } }
  timer = setTimeout(function () { fin(new Error('timeout')); }, 15000);
  var opts = body ?
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } :
    { method: 'GET' };
  try {
    fetch(ROOMS + path, opts)
      .then(function (r) { return r.json(); })
      .then(function (d) { fin(null, d); })
      .catch(function (e) { fin(e); });
  } catch (e) { fin(e); }
}
function olDeviceTag() {
  var t = lsGet('wwf_device', '');
  if (!t) {
    t = Math.random().toString(36).slice(2, 6);
    lsSet('wwf_device', t);
  }
  return t;
}
/* arcade name when set; otherwise a stable per-device name so two
 * default-named players can still join the same game */
function olName() { return arcadeName() || ('player-' + olDeviceTag()); }
function olMyGames() {
  try { return JSON.parse(lsGet('wwf_online_games', '') || '[]'); }
  catch (e) { return []; }
}
function olSaveMyGames(list) { lsSet('wwf_online_games', JSON.stringify(list.slice(0, 20))); }
function olUpsertGame(entry) {
  var list = olMyGames().filter(function (g) { return g.code !== entry.code; });
  list.unshift(entry);
  olSaveMyGames(list);
}
function olSig(s) { return JSON.stringify([s.board, s.scores, s.turn, s.over]); }
function olTouchMyGame(over) {
  olUpsertGame({
    code: OL.code, token: OL.token, seat: OL.seat,
    vs: oppName(), myTurn: !over && G.st.turn === OL.seat, waiting: false,
    over: !!over, updated: Date.now()
  });
}
function olStartPoll(ms, fn) { olStopPoll(); OL.pollTimer = setInterval(fn, ms); }
function olStopPoll() { if (OL.pollTimer) { clearInterval(OL.pollTimer); OL.pollTimer = null; } }

function showOnline(prefill) {
  olStopPoll();
  G.mode = null;
  $('ol-who').textContent = 'playing as ' + olName();
  $('ol-waiting').classList.add('hidden');
  $('ol-joinbox').classList.remove('hidden');
  OL.codeEntry = prefill || '';
  olRenderPad(); olRenderSlots(); olRenderGames();
  show('scr-online');
}
var OL_KEYS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function olRenderPad() {
  var pad = $('ol-pad');
  pad.innerHTML = '';
  OL_KEYS.split('').forEach(function (k) {
    var b = document.createElement('button');
    b.className = 'bkey'; b.type = 'button'; b.textContent = k;
    b.onclick = function () {
      if (OL.codeEntry.length >= 6) return;
      OL.codeEntry += k; WWAU.tap(); olRenderSlots();
    };
    pad.appendChild(b);
  });
  var del = document.createElement('button');
  del.className = 'bkey'; del.type = 'button'; del.textContent = '⌫';
  del.onclick = function () { OL.codeEntry = OL.codeEntry.slice(0, -1); WWAU.tap(); olRenderSlots(); };
  pad.appendChild(del);
}
function olRenderSlots() {
  var html = '';
  for (var i = 0; i < 6; i++) {
    html += '<span class="ol-slot' + (i < OL.codeEntry.length ? ' fill' : '') + '">' +
      esc(OL.codeEntry[i] || '') + '</span>';
  }
  $('ol-slots').innerHTML = html;
}
function olRenderGames() {
  var el = $('ol-games');
  var list = olMyGames();
  if (!list.length) {
    el.innerHTML = '<div class="lb-empty">no friend games yet — start one above</div>';
    return;
  }
  el.innerHTML = list.map(function (g, i) {
    var badge = g.over ? 'done' : (g.myTurn ? 'your turn' : (g.waiting ? 'waiting' : 'their turn'));
    return '<div class="lb-row ol-game" data-i="' + i + '"><span>vs ' + esc(g.vs) +
      ' <span class="ol-code-sm">' + esc(g.code) + '</span></span><b class="ol-badge' +
      (g.myTurn && !g.over ? ' hot' : '') + '">' + badge + '</b></div>';
  }).join('');
  var rows = el.querySelectorAll('.ol-game');
  for (var i = 0; i < rows.length; i++) {
    (function (r) {
      r.onclick = function () {
        var g = olMyGames()[+r.getAttribute('data-i')];
        if (g) { WWAU.tap(); olJoin(g.code, g.token); }
      };
    })(rows[i]);
  }
}
function bindOnline() {
  $('btn-ol-new').onclick = function () { WWAU.tap(); olNewGame(); };
  $('btn-ol-share').onclick = function () { olShare(); };
  $('btn-ol-cancel').onclick = function () { WWAU.tap(); showOnline(); };
  $('btn-ol-join').onclick = function () { WWAU.tap(); olJoin(OL.codeEntry); };
  $('ol-back').onclick = function () { WWAU.tap(); olStopPoll(); show('scr-menu'); };
}
function olNewGame() {
  if (G.busy) return;
  G.busy = true;
  roomsFetch('/create', { name: olName() }, function (err, d) {
    G.busy = false;
    if (err || !d || !d.ok) { toast('the well could not be reached — try again'); return; }
    olUpsertGame({
      code: d.code, token: d.token, seat: d.seat, vs: 'a friend',
      myTurn: true, waiting: true, over: false, updated: Date.now()
    });
    olShowWaiting(d.code, d.token);
  });
}
function olShowWaiting(code, token) {
  OL.code = code; OL.token = token; OL.seat = 0;
  $('ol-joinbox').classList.add('hidden');
  $('ol-waiting').classList.remove('hidden');
  $('ol-code').textContent = code.split('').join(' ');
  olPollWaiting();
  olStartPoll(8000, olPollWaiting);
}
function olPollWaiting() {
  if (!OL.code || G.mode === 'online') return;
  roomsFetch('/state?code=' + OL.code + '&token=' + OL.token, null, function (err, d) {
    if (err || !d || !d.ok || G.mode === 'online') return;
    var s = d.state;
    if (s.names && s.names[1]) olEnterGame({ code: OL.code, token: OL.token, seat: 0, state: s }, true);
  });
}
function olShare() {
  WWAU.tap();
  var url = location.origin + location.pathname + '#join=' + OL.code;
  var text = 'Join my Word Well game — code ' + OL.code;
  if (navigator.share) {
    navigator.share({ title: 'Word Well', text: text, url: url }).catch(function () {});
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(
      function () { toast('link copied — send it to your friend'); },
      function () { toast('code: ' + OL.code); });
  } else {
    toast('code: ' + OL.code);
  }
}
function olJoin(code, token) {
  if (G.busy) return;
  code = (code || '').toUpperCase();
  if (code.length !== 6) { toast('codes are 6 letters'); return; }
  G.busy = true;
  var body = { code: code, name: olName() };
  if (token) body.token = token;
  roomsFetch('/join', body, function (err, d) {
    G.busy = false;
    if (err || !d || !d.ok) {
      toast((d && d.message) || 'the well could not be reached — try again');
      return;
    }
    olEnterGame(d, false);
  });
}
function applyServerState(s) {
  var mine = s.rack || [];
  var hasTile = false;
  for (var r = 0; r < 15 && !hasTile; r++)
    for (var c = 0; c < 15; c++)
      if (s.board[r][c]) { hasTile = true; break; }
  G.st = {
    board: s.board,
    racks: [mine],
    scores: s.scores,
    turn: s.turn,
    over: s.over,
    winner: s.winner,
    bag: { length: s.bag },
    lastMove: s.lastMove,
    firstDone: hasTile
  };
  OL.rackAuth = mine;
  G.rackView = mine.slice();
  G.tent = []; G.sel = null;
  G.names = [s.names[0] || 'a friend', s.names[1] || 'a friend'];
}
function olEnterGame(d, isNew) {
  olStopPoll();
  OL.code = d.code; OL.token = d.token; OL.seat = d.seat;
  G.mode = 'online';
  G.sel = null; G.tent = []; G.dir = 'across';
  G.swapMode = false; G.swapPlus = false; G.swapSel = [];
  G.hindsightArmed = false; G.over = false; G.busy = false;
  applyServerState(d.state);
  OL.lastJson = olSig(d.state);
  bindGame();
  renderAll(); setTurnBanner();
  show('scr-game');
  olTouchMyGame(!!d.state.over);
  if (d.state.over) { gameOver(); return; }
  olStartPoll(20000, olPollGame);
  if (isNew) toast('your friend joined — cast the first stones');
  else if (d.rejoin) toast('welcome back to the well');
}
function olPollGame() {
  if (G.mode !== 'online' || G.over || !OL.code || G.busy) return;
  roomsFetch('/state?code=' + OL.code + '&token=' + OL.token, null, function (err, d) {
    if (err || !d || !d.ok) return;
    var s = d.state;
    var sig = olSig(s);
    if (sig === OL.lastJson) return;
    applyServerState(s);
    OL.lastJson = sig;
    renderAll(); setTurnBanner();
    var lm = s.lastMove;
    if (lm && lm.player !== OL.seat) {
      if (lm.dir === 'play') {
        var words = (lm.words || []).map(function (w) { return w.word; }).join(', ');
        toast(oppName() + ' played ' + words + ' for ' + lm.score, 2600);
        WWAU.play();
      } else if (lm.dir === 'swap') {
        toast(oppName() + ' swapped stones');
      } else if (lm.dir === 'pass') {
        toast(oppName() + ' passed');
      }
    }
    olTouchMyGame(!!s.over);
    if (s.over) gameOver();
  });
}
function olSubmitMove() {
  var placements = placementsFromTent();
  var pls = [], i, p, ix;
  for (i = 0; i < placements.length; i++) {
    p = placements[i];
    ix = OL.rackAuth.indexOf(p.tile);
    if (ix < 0) { toast('those stones slipped — syncing'); olPollGame(); return; }
    pls.push({ r: p.r, c: p.c, i: ix, b: p.tile.blank ? (p.blankCh || '') : '' });
  }
  var bingo = pls.length === 7;
  G.busy = true;
  roomsFetch('/move',
    { code: OL.code, token: OL.token, placements: pls, dir: G.dir },
    function (err, d) {
      G.busy = false;
      if (err || !d || !d.ok) {
        toast((d && d.message) || 'the well could not be reached — try again');
        return;
      }
      applyServerState(d.state);
      OL.lastJson = olSig(d.state);
      renderAll(); setTurnBanner();
      var words = (d.words || []).map(function (w) { return w.word; }).join(', ');
      if (bingo) { WWAU.bingo(); toast('BINGO! +35', 2600, 'big'); }
      else { WWAU.play(); toast(words + ' · ' + d.scored + ' pts'); }
      popPreview();
      olTouchMyGame(!!d.state.over);
      if (d.state.over) gameOver();
    });
}
function olSubmitSwap(idxs) {
  G.busy = true;
  roomsFetch('/swap', { code: OL.code, token: OL.token, idxs: idxs }, function (err, d) {
    G.busy = false;
    if (err || !d || !d.ok) {
      toast((d && d.message) || 'the swap slipped — try again');
      return;
    }
    WWAU.play();
    applyServerState(d.state);
    OL.lastJson = olSig(d.state);
    renderAll(); setTurnBanner();
    toast('stones swapped');
    olTouchMyGame(!!d.state.over);
    if (d.state.over) gameOver();
  });
}
function olSubmitPass() {
  G.busy = true;
  roomsFetch('/pass', { code: OL.code, token: OL.token }, function (err, d) {
    G.busy = false;
    if (err || !d || !d.ok) {
      toast((d && d.message) || 'the well could not be reached — try again');
      return;
    }
    WWAU.tap();
    applyServerState(d.state);
    OL.lastJson = olSig(d.state);
    renderAll(); setTurnBanner();
    toast('you passed');
    olTouchMyGame(!!d.state.over);
    if (d.state.over) gameOver();
  });
}

/* ---------------- game over ---------------- */
function gameOver() {
  var st = G.st;
  G.over = true;
  olStopPoll();
  if (G.mode === 'online') {
    var w = st.winner;
    $('over-title').textContent = w < 0 ? 'a tied descent' :
      (w === OL.seat ? 'you win the well' : oppName() + ' wins the well');
    $('over-sub').textContent = '';
    $('over-s0').textContent = G.names[0] + ': ' + st.scores[0];
    $('over-s1').textContent = G.names[1] + ': ' + st.scores[1];
    $('over-earn').textContent = '';
    $('over-daily').textContent = 'a friend game — no boosts, just glory';
    $('btn-again').textContent = 'back to the lobby';
    $('btn-again').onclick = function () { WWAU.tap(); showOnline(); };
    $('btn-over-menu').onclick = function () { WWAU.tap(); show('scr-menu'); renderMenuBoard(); };
    renderBoard(); renderHUD();
    show('scr-over');
    return;
  }
  /* restore over-screen buttons for local modes */
  $('btn-again').textContent = 'descend again';
  $('btn-again').onclick = function () { location.reload(); };
  $('btn-over-menu').onclick = function () { location.reload(); };
  var w = st.winner;
  var title, sub;
  if (G.mode === 'pass') {
    title = w < 0 ? 'a tied descent' : G.names[w] + ' wins the well';
  } else if (w === 0) {
    title = 'you win the well';
    sub = pick(WARDEN_LOSE);
    WWAU.win();
  } else if (w === 1) {
    title = 'the Well Warden wins';
    sub = pick(WARDEN_WIN);
  } else {
    title = 'a tied descent';
  }
  var best = null;
  /* best word this game */
  $('over-title').textContent = title;
  $('over-sub').textContent = sub || '';
  $('over-s0').textContent = G.names[0] + ': ' + st.scores[0];
  $('over-s1').textContent = G.names[1] + ': ' + st.scores[1];
  /* boosts earned */
  var humanWon = (G.mode !== 'pass' && w === 0);
  earnBoost(humanWon ? 2 : 1);
  renderBoosts();
  $('over-earn').textContent = humanWon ? '+2 boost stones earned' : '+1 boost stone earned';
  /* daily: streak + leaderboard */
  if (G.mode === 'daily') {
    updateDailyStreak();
    var name = arcadeName() || 'wanderer';
    arcadeFetch('/score', { game: GAME_KEY, board: 'daily-' + todayStr(), name: name, score: st.scores[0] }, function () {});
    $('over-daily').textContent = 'daily score cast into the well' + (arcadeName() ? ' as ' + arcadeName() : '');
  } else {
    $('over-daily').textContent = '';
  }
  renderBoard(); renderHUD();
  show('scr-over');
}
function updateDailyStreak() {
  var t = todayStr();
  var d;
  try { d = JSON.parse(lsGet('wwf_daily', '') || '{}'); } catch (e) { d = {}; }
  var y = new Date(); y.setDate(y.getDate() - 1);
  if (d.last === dateStr(y)) d.streak = (d.streak || 0) + 1;
  else if (d.last !== t) d.streak = 1;
  d.last = t;
  lsSet('wwf_daily', JSON.stringify(d));
}

/* ---------------- debug hook (smoke test) ---------------- */
window.WWFB = {
  G: G, WWF: WWF, OL: OL,
  newSolo: function (diff) { startSolo(diff || 'medium'); },
  ui: { tapRack: tapRack, tapCell: tapCell, onPlay: onPlay, onSwap: onSwap, onPass: onPass,
        onRadar: onRadar, startDaily: startDaily, startPass: startPass },
  ol: { showOnline: showOnline, olJoin: olJoin, olNewGame: olNewGame,
        olEnterGame: olEnterGame, applyServerState: applyServerState,
        olPollGame: olPollGame, olPollWaiting: olPollWaiting,
        roomsFetch: roomsFetch, ROOMS: ROOMS },
  state: function () {
    return {
      mode: G.mode, over: G.st ? G.st.over : null,
      turn: G.st ? G.st.turn : null,
      scores: G.st ? G.st.scores.slice() : null,
      rack: G.rackView.map(function (t) { return t.ch; }).join(''),
      bag: G.st ? G.st.bag.length : null
    };
  }
};

document.addEventListener('DOMContentLoaded', loadDictionary);
})();
