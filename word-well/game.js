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
function toast(msg, ms) {
  var t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2200);
}
function lsGet(k, dflt) {
  try { var v = localStorage.getItem(k); return v == null ? dflt : v; } catch (e) { return dflt; }
}
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

/* ---------------- constants ---------------- */
var ARCADE = 'https://gamez-arcade.chaoticutopia84.workers.dev';
var GAME_KEY = 'word-well';
var BUILD_TAG = 'build 20261008a';
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

/* ---------------- screens ---------------- */
var SCREENS = ['scr-load', 'scr-menu', 'scr-diff', 'scr-game', 'scr-over'];
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
      el.innerHTML = '<div class="lb-empty">no scores yet today — be the first</div>';
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
  var st = dailyStreak();
  $('menu-streak').textContent = st > 0 ? st + '-day daily streak' : 'no daily streak yet';
  $('build-tag').textContent = BUILD_TAG;
  renderMenuBoard();
  show('scr-menu');
}
function bindMenu() {
  $('btn-solo').onclick = function () { WWAU.ensure(); WWAU.tap(); show('scr-diff'); };
  $('btn-pass').onclick = function () { WWAU.ensure(); WWAU.tap(); startPass(); };
  $('btn-daily').onclick = function () { WWAU.ensure(); WWAU.tap(); startDaily(); };
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
    d.classList.remove('hint', 'ghost');
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
function setTurnBanner() {
  var st = G.st, el = $('turn-banner');
  if (st.over) { el.textContent = 'the well is still'; return; }
  if (G.mode === 'solo' || G.mode === 'daily') {
    el.textContent = st.turn === 0 ? 'your turn — cast your stones' : 'the Well Warden is thinking…';
  } else {
    el.textContent = G.names[st.turn] + ' — cast your stones';
  }
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
  $('btn-menu2').onclick = function () { WWAU.tap(); show('scr-menu'); renderMenuBoard(); };
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
  if (v.bingo) { WWAU.bingo(); toast('BINGO! +35'); }
  else WWAU.play();
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
  if (!needHuman()) return;
  if (G.hindsightArmed) { G.hindsightArmed = false; renderBoosts(); toast('hindsight stood down'); return; }
  if (BOOSTS.hindsight <= 0) { toast('no hindsight stones left — win games to earn more'); return; }
  BOOSTS.hindsight--; saveBoosts();
  G.hindsightArmed = true; renderBoosts();
  WWAU.turn();
  toast('hindsight armed — play, and the well will show what you missed');
}
function onSwapPlus() {
  if (!needHuman()) return;
  if (G.st.bag.length < 7) { toast('the well is too low to swap (needs 7 stones)'); return; }
  if (BOOSTS.swapp <= 0) { toast('no swap+ stones left — win games to earn more'); return; }
  G.swapMode = true; G.swapPlus = true; G.swapSel = [];
  WWAU.tap(); renderRack(); renderSwapBtn();
  toast('tap stones to swap — your turn continues after');
}
function onTilePile() {
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
  html += '<div class="pile-cell"><b>␣</b><span>' + (counts.blank || 0) + '</span></div></div>';
  html += '<div class="pile-note">' + G.st.bag.length + ' stones remain in the well</div>';
  $('ov-pile-body').innerHTML = html;
  $('ov-pile').classList.remove('hidden');
  WWAU.tap();
}

/* ---------------- game over ---------------- */
function gameOver() {
  var st = G.st;
  G.over = true;
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
  G: G, WWF: WWF,
  newSolo: function (diff) { startSolo(diff || 'medium'); },
  ui: { tapRack: tapRack, tapCell: tapCell, onPlay: onPlay, onSwap: onSwap, onPass: onPass,
        onRadar: onRadar, startDaily: startDaily, startPass: startPass },
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
