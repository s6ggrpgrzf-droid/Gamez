/* Dead Man's Hand — Klondike solitaire rendering + input.
 * Reads SOL engine state; mutates only through engine calls. DOM cards,
 * pointer drag + tap-to-move + double-tap-to-foundation. All network
 * fail-silent.
 */
(function () {
'use strict';

/* ---------------- helpers ---------------- */

function $(id) { return document.getElementById(id); }
function readJSON(k) {
  try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
function writeJSON(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
}
function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fmtTime(sec) {
  sec = Math.floor(sec);
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}
function vibrate(p) {
  try { if (SET.haptic && navigator.vibrate) navigator.vibrate(p); } catch (e) {}
}

/* ---------------- network (fail-silent) ---------------- */

var ARCADE = 'https://gamez-arcade.chaoticutopia84.workers.dev';
function arcadeFetch(path, body, cb, timeoutMs) {
  var done = false;
  var timer = setTimeout(function () { fin(new Error('timeout')); }, timeoutMs || 10000);
  function fin(e, d) { if (done) return; done = true; clearTimeout(timer); cb(e, d); }
  try {
    fetch(ARCADE + path, body ?
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
      .then(function (r) { return r.json(); })
      .then(function (d) { fin(null, d); })
      .catch(function (e) { fin(e); });
  } catch (e) { fin(e); }
}

/* ---------------- settings & stats ---------------- */

var SET = Object.assign({ draw: 1, haptic: true }, readJSON('dmh_sol_set') || {});
function saveSet() { writeJSON('dmh_sol_set', { draw: SET.draw, haptic: SET.haptic }); }
function getStats() {
  return Object.assign({ played: 0, won: 0, bestScore: 0, bestTime: 0, bestStreak: 0 }, readJSON('dmh_sol_stats') || {});
}
function saveStats(s) { writeJSON('dmh_sol_stats', s); }
function getDaily() { return readJSON('dmh_sol_daily') || { last: null, streak: 0 }; }
function saveDaily(d) { writeJSON('dmh_sol_daily', d); }

/* ---------------- game state ---------------- */

var G = {
  st: null,
  mode: 'deal',       // 'deal' | 'daily'
  date: null,
  counted: true,
  sel: null,          // {kind:'waste'} | {kind:'tab', i, k} | {kind:'found', f}
  busy: false,
  elapsed: 0,
  timerId: null,
  autoId: null,
  lastTap: 0,
  lastTapKey: ''
};

/* ---------------- card DOM ---------------- */

function cardEl(c, opts) {
  var d = document.createElement('div');
  d.className = 'card' + (c.up ? '' : ' down') + (SOL.isRed(c.s) ? ' red' : ' black');
  if (c.up) {
    d.innerHTML = '<div class="corner tl"><b>' + SOL.rankLabel(c.r) + '</b><span>' + SOL.SUITS[c.s] + '</span></div>' +
      '<div class="pip">' + SOL.SUITS[c.s] + '</div>' +
      '<div class="corner br"><b>' + SOL.rankLabel(c.r) + '</b><span>' + SOL.SUITS[c.s] + '</span></div>';
  }
  d.dataset.r = c.r; d.dataset.s = c.s;
  if (opts && opts.key) d.dataset.key = opts.key;
  return d;
}

function slotEl(cls, inner) {
  var d = document.createElement('div');
  d.className = 'slot ' + cls;
  d.innerHTML = inner || '';
  return d;
}

/* ---------------- render ---------------- */

var DOWN_OFF = 0.22, UP_OFF = 0.34; // fractions of card width

function render() {
  if (!G.st) return;
  renderTop();
  renderTableau();
  renderHud();
}

function renderHud() {
  $('pill-score').textContent = G.st.score;
  $('pill-moves').textContent = G.st.moves;
  $('pill-time').textContent = fmtTime(G.elapsed);
  $('btn-undo').disabled = !G.st.history.length;
  var ac = !$('btn-auto').classList.contains('hidden');
  var can = SOL.canAutoComplete(G.st);
  if (can && !ac) { $('btn-auto').classList.remove('hidden'); }
  else if (!can && ac) { $('btn-auto').classList.add('hidden'); }
}

function renderTop() {
  var st = G.st;
  var row = $('toprow');
  row.innerHTML = '';

  // stock
  var stock = slotEl('stock', st.stock.length ? '<div class="card down deck"></div>' : '<div class="slot-empty">↻</div>');
  if (st.stock.length) stock.innerHTML += '<span class="count">' + st.stock.length + '</span>';
  stock.dataset.pile = 'stock';
  row.appendChild(stock);

  // waste: fan last 3
  var waste = slotEl('waste');
  var w = st.waste.slice(-3);
  w.forEach(function (c, idx) {
    var ce = cardEl(c, { key: 'w' });
    ce.style.left = (idx * 22) + '%';
    ce.classList.add('fan');
    if (idx === w.length - 1) ce.dataset.top = '1';
    waste.appendChild(ce);
  });
  if (!w.length) waste.innerHTML = '<div class="slot-empty"></div>';
  waste.dataset.pile = 'waste';
  row.appendChild(waste);

  row.appendChild(slotEl('gap'));

  // foundations
  for (var s = 0; s < 4; s++) {
    var f = slotEl('found');
    var t = SOL.top(st.foundations[s]);
    if (t) f.appendChild(cardEl(t, { key: 'f' + s }));
    else f.innerHTML = '<div class="slot-empty suit">' + SOL.SUITS[s] + '</div>';
    f.dataset.pile = 'found';
    f.dataset.f = s;
    row.appendChild(f);
  }
}

function renderTableau() {
  var st = G.st;
  var tab = $('tableau');
  tab.innerHTML = '';
  // measure a column width for offsets
  var probe = document.createElement('div');
  probe.className = 'tcol';
  tab.appendChild(probe);
  var cw = probe.clientWidth || tab.clientWidth / 7;
  probe.remove();
  var downPx = cw * DOWN_OFF, upPx = cw * UP_OFF;

  for (var i = 0; i < 7; i++) {
    (function (i) {
      var col = document.createElement('div');
      col.className = 'tcol';
      col.dataset.pile = 'tab';
      col.dataset.i = i;
      var pile = st.tableau[i];
      var y = 0;
      pile.forEach(function (c, k) {
        var ce = cardEl(c, { key: 't' + i + '_' + k });
        ce.style.top = y + 'px';
        if (isSel({ kind: 'tab', i: i, k: k })) ce.classList.add('sel');
        col.appendChild(ce);
        y += c.up ? upPx : downPx;
      });
      if (!pile.length) {
        var ph = document.createElement('div');
        ph.className = 'slot-empty col-empty';
        ph.textContent = 'K';
        col.appendChild(ph);
      }
      // size the column so later columns don't overlap
      col.style.minHeight = (y + cw * 1.4) + 'px';
      tab.appendChild(col);
    })(i);
  }
  // waste selection highlight
  if (isSel({ kind: 'waste' })) {
    var wt = document.querySelector('#toprow .waste .card[data-top="1"]');
    if (wt) wt.classList.add('sel');
  }
  if (G.sel && G.sel.kind === 'found') {
    var fc = document.querySelector('#toprow .found[data-f="' + G.sel.f + '"] .card');
    if (fc) fc.classList.add('sel');
  }
}

function isSel(s) {
  var g = G.sel;
  if (!g || g.kind !== s.kind) return false;
  if (s.kind === 'tab') return g.i === s.i && g.k === s.k;
  if (s.kind === 'found') return g.f === s.f;
  return true;
}

function toast(msg, ms) {
  var t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._h);
  t._h = setTimeout(function () { t.classList.add('hidden'); }, ms || 2400);
}

/* ---------------- selection & moves ---------------- */

function clearSel() { G.sel = null; }

function movableFromTab(i, k) {
  var pile = G.st.tableau[i];
  return k >= 0 && k < pile.length && pile[k].up && SOL.movableStack(pile, k);
}

// describe the currently selected single card (for foundation attempts)
function selSingleCard() {
  var g = G.sel, st = G.st;
  if (!g) return null;
  if (g.kind === 'waste') { var w = SOL.top(st.waste); return w ? { card: w, from: g } : null; }
  if (g.kind === 'tab') {
    var pile = st.tableau[g.i];
    if (g.k === pile.length - 1 && pile[g.k].up) return { card: pile[g.k], from: g };
    return null;
  }
  if (g.kind === 'found') {
    var f = SOL.top(st.foundations[g.f]);
    return f ? { card: f, from: g } : null;
  }
  return null;
}

function tryMoveSelToTableau(j) {
  var g = G.sel, st = G.st;
  if (!g) return false;
  var r;
  if (g.kind === 'waste') r = SOL.wasteToTableau(st, j);
  else if (g.kind === 'tab') r = SOL.tableauToTableau(st, g.i, j, g.k);
  else if (g.kind === 'found') r = SOL.foundationToTableau(st, g.f, j);
  else return false;
  if (r.ok) { afterMove('snap'); return true; }
  deny();
  return false;
}

function tryMoveSelToFoundation() {
  var sc = selSingleCard();
  if (!sc) return false;
  var st = G.st, r;
  if (sc.from.kind === 'waste') r = SOL.wasteToFoundation(st);
  else if (sc.from.kind === 'tab') r = SOL.tableauToFoundation(st, sc.from.i);
  else return false;
  if (r.ok) { afterMove('chime'); return true; }
  deny();
  return false;
}

function deny() {
  AU.untick();
  vibrate(30);
}

function afterMove(sound) {
  clearSel();
  if (sound === 'snap') AU.snap();
  else if (sound === 'chime') AU.chime();
  vibrate(12);
  render();
  checkWinSoon();
}

function checkWinSoon() {
  if (G.st.won) setTimeout(onWin, 450);
  else if (SOL.canAutoComplete(G.st)) toast('Tap FINISH to auto-complete');
}

/* ---------------- stock ---------------- */

function doDraw() {
  if (G.busy || G.st.won) return;
  AU.init();
  var r = SOL.draw(G.st);
  if (!r.ok) { deny(); return; }
  AU.whoosh();
  vibrate(10);
  clearSel();
  startTimer();
  render();
}

/* ---------------- undo / hint / auto ---------------- */

function doUndo() {
  if (G.busy) return;
  if (SOL.undo(G.st)) { AU.tick(); clearSel(); stopAuto(); render(); }
  else deny();
}

function doHint() {
  if (G.busy || G.st.won) return;
  AU.init();
  var hints = SOL.findMoves(G.st);
  if (!hints.length) { toast('No moves — start a new deal'); return; }
  var h = hints[0];
  AU.click();
  toast(h.label);
  // highlight
  document.querySelectorAll('.hint-src,.hint-dst').forEach(function (e) { e.classList.remove('hint-src', 'hint-dst'); });
  var src = null, dst = null;
  if (h.kind === 'w2f' || h.kind === 'w2f-safe') {
    src = document.querySelector('#toprow .waste .card[data-top="1"]');
    dst = document.querySelector('#toprow .found[data-f="' + SOL.top(G.st.waste).s + '"]');
  } else if (h.kind === 't2f') {
    src = document.querySelector('.tcol[data-i="' + h.i + '"] .card:last-of-type');
    dst = document.querySelector('#toprow .found[data-f="' + SOL.top(G.st.tableau[h.i]).s + '"]');
  } else if (h.kind === 'w2t') {
    src = document.querySelector('#toprow .waste .card[data-top="1"]');
    dst = document.querySelector('.tcol[data-i="' + h.i + '"]');
  } else if (h.kind === 't2t') {
    src = document.querySelector('.tcol[data-i="' + h.i + '"] .card[data-key="t' + h.i + '_' + h.k + '"]');
    dst = document.querySelector('.tcol[data-i="' + h.j + '"]');
  } else if (h.kind === 'draw') {
    dst = document.querySelector('#toprow .stock');
  }
  if (src) src.classList.add('hint-src');
  if (dst) dst.classList.add('hint-dst');
  setTimeout(function () {
    document.querySelectorAll('.hint-src,.hint-dst').forEach(function (e) { e.classList.remove('hint-src', 'hint-dst'); });
  }, 2600);
}

function doAuto() {
  if (G.busy || G.st.won || !SOL.canAutoComplete(G.st)) return;
  G.busy = true;
  clearSel();
  toast('Auto-finishing…');
  G.autoId = setInterval(function () {
    var r = SOL.autoStep(G.st);
    if (r.ok) { AU.tick(); render(); }
    if (!r.ok || G.st.won) { stopAuto(); G.busy = false; render(); checkWinSoon(); }
  }, 150);
}

function stopAuto() {
  if (G.autoId) { clearInterval(G.autoId); G.autoId = null; }
}

/* ---------------- timer ---------------- */

function startTimer() {
  if (G.timerId || G.st.won) return;
  G.st.startT = G.st.startT || Date.now();
  G.timerId = setInterval(function () {
    G.elapsed = Math.floor((Date.now() - G.st.startT) / 1000);
    $('pill-time').textContent = fmtTime(G.elapsed);
  }, 1000);
}
function stopTimer() {
  if (G.timerId) { clearInterval(G.timerId); G.timerId = null; }
}

/* ---------------- win ---------------- */

function onWin() {
  stopTimer(); stopAuto();
  var st = G.st;
  var bonus = SOL.winBonus(st, G.elapsed);
  st.score += bonus;
  var stats = getStats();
  stats.played++;
  stats.won++;
  stats.bestScore = Math.max(stats.bestScore, st.score);
  if (!stats.bestTime || G.elapsed < stats.bestTime) stats.bestTime = G.elapsed;
  saveStats(stats);
  // daily streak
  if (G.mode === 'daily' && G.counted) {
    var d = getDaily(), ds = G.date;
    var y = new Date(); y.setDate(y.getDate() - 1);
    var ys = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
    d.streak = (d.last === ys) ? d.streak + 1 : 1;
    d.last = ds;
    saveDaily(d);
    stats.bestStreak = Math.max(stats.bestStreak, d.streak);
    saveStats(stats);
    G.counted = false;
  }
  AU.fanfare();
  vibrate([40, 60, 40]);
  render();
  waterfall();
  // sheet
  $('win-score').textContent = st.score.toLocaleString();
  $('win-sub').textContent = fmtTime(G.elapsed) + ' · ' + st.moves + ' moves · draw-' + st.draw +
    ' · bonus +' + bonus;
  var lb = $('arc-lb');
  lb.innerHTML = '';
  if (G.mode === 'daily') submitDailyScore(st.score, lb);
  showOverlay('over-overlay');
}

function submitDailyScore(score, lb) {
  var board = 'daily-' + G.date;
  var name = '';
  try { name = (localStorage.getItem('arcade_name') || '').trim(); } catch (e) {}
  var sc = Math.max(1, Math.min(score, 999999));
  var go = function (n) {
    lb.innerHTML = '<div class="arc-lb-empty">sending…</div>';
    arcadeFetch('/score', { game: 'dead-mans-hand', board: board, name: n, score: sc }, function (err, res) {
      if (res && res.top) renderBoard(res.top, res.rank, n, lb);
      else arcadeFetch('/scores?game=dead-mans-hand&board=' + encodeURIComponent(board), null, function (e2, d2) {
        renderBoard(d2 && d2.top, 0, n, lb);
      });
    }, 12000);
  };
  if (name) go(name);
  else {
    lb.innerHTML = '<div class="arc-lb-title">DAILY BOARD</div><div class="arc-lb-form">' +
      '<input id="arc-lb-name" maxlength="12" placeholder="YOUR NAME" autocomplete="off">' +
      '<button id="arc-lb-go" class="btn" type="button">SAVE</button></div>';
    $('arc-lb-go').addEventListener('click', function () {
      var v = $('arc-lb-name').value.trim().slice(0, 12);
      if (!v) return;
      try { localStorage.setItem('arcade_name', v); } catch (e) {}
      go(v);
    });
  }
}

function renderBoard(top, rank, name, lb) {
  if (!top || !top.length) { lb.innerHTML = '<div class="arc-lb-empty">no scores yet — yours is first</div>'; return; }
  var h = '<div class="arc-lb-title">DAILY BOARD' + (rank ? ' · YOU #' + rank : '') + '</div><ol class="arc-lb-list">';
  top.slice(0, 8).forEach(function (e, i) {
    h += '<li class="' + (e.name === name ? 'me' : '') + '"><span>#' + (i + 1) + ' ' +
      String(e.name).replace(/[<>&]/g, '') + '</span><b>' + Number(e.score).toLocaleString() + '</b></li>';
  });
  lb.innerHTML = h + '</ol>';
}

// classic cascading-cards win animation
function waterfall() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var layer = $('fx-layer');
  var suits = ['\u2660', '\u2665', '\u2666', '\u2663'];
  for (var i = 0; i < 52; i++) {
    (function (i) {
      setTimeout(function () {
        var c = document.createElement('div');
        c.className = 'card down fall' + (i % 2 ? ' red2' : '');
        c.textContent = suits[i % 4];
        c.style.left = (8 + Math.random() * 84) + 'vw';
        layer.appendChild(c);
        var dx = (Math.random() - 0.5) * 220;
        c.animate([
          { transform: 'translate(0,-12vh) rotate(0deg)', opacity: 1 },
          { transform: 'translate(' + dx + 'px,108vh) rotate(' + (Math.random() * 720 - 360) + 'deg)', opacity: 1 }
        ], { duration: 2600 + Math.random() * 1800, easing: 'cubic-bezier(.3,.6,.6,1)' }).onfinish = function () { c.remove(); };
      }, i * 90);
    })(i);
  }
}

/* ---------------- new game ---------------- */

function newDeal(mode) {
  stopTimer(); stopAuto();
  G.busy = false; G.elapsed = 0;
  clearSel();
  G.mode = mode;
  G.counted = true;
  var seed;
  if (mode === 'daily') {
    G.date = todayStr();
    seed = SOL.dailySeed(G.date);
  } else {
    G.date = null;
    seed = (Math.random() * 0xffffffff) >>> 0;
  }
  G.st = SOL.newGame(seed, SET.draw);
  var stats = getStats();
  stats.played++;
  saveStats(stats);
  hideOverlays();
  show('screen-game');
  $('daily-tag').textContent = mode === 'daily' ? 'DAILY · ' + G.date : 'DRAW-' + SET.draw;
  render();
  toast(mode === 'daily' ? 'Daily deal — good luck!' : 'New deal. Make it count.');
}

/* ---------------- menu ---------------- */

function refreshMenu() {
  var stats = getStats();
  var d = getDaily();
  $('menu-stats').textContent = stats.played ?
    stats.won + '/' + stats.played + ' won · best ' + stats.bestScore.toLocaleString() +
    (stats.bestTime ? ' · fastest ' + fmtTime(stats.bestTime) : '') : 'No deals yet. The saloon waits.';
  var ds = todayStr();
  if (d.last === ds) {
    $('btn-daily').textContent = 'REPLAY DAILY (PRACTICE)';
    $('daily-sub').textContent = ds + ' · streak ' + d.streak + ' · replay won\'t extend it';
  } else {
    $('btn-daily').textContent = 'DAILY DEAL';
    $('daily-sub').textContent = ds + ' · one deal, worldwide' + (d.streak ? ' · streak ' + d.streak : '');
  }
  $('btn-draw').textContent = 'DRAW ' + SET.draw;
  $('btn-mute').textContent = AU.isMuted() ? '🔇' : '🔊';
  $('btn-haptic').textContent = SET.haptic ? '📳 ON' : '📳 OFF';
  $('btn-haptic').setAttribute('aria-pressed', SET.haptic ? 'true' : 'false');
}

function show(id) {
  ['screen-menu', 'screen-game'].forEach(function (s) { $(s).classList.toggle('hidden', s !== id); });
}
function showOverlay(id) {
  ['over-overlay', 'help-sheet'].forEach(function (s) { $(s).classList.toggle('hidden', s !== id); });
}
function hideOverlays() {
  ['over-overlay', 'help-sheet'].forEach(function (s) { $(s).classList.add('hidden'); });
}

/* ---------------- pointer input: drag, tap, double-tap ---------------- */

var drag = null; // {els:[], from, dx, dy, moved}
var suppressClick = false;

function pileFromEvent(e) {
  var t = document.elementFromPoint(e.clientX, e.clientY);
  if (!t) return null;
  var p = t.closest('[data-pile]');
  return p;
}

function onPointerDown(e) {
  if (G.busy || !G.st || G.st.won) return;
  AU.init();
  var card = e.target.closest('.card');
  if (!card || card.classList.contains('down')) return;
  // identify source
  var from = null;
  if (card.dataset.key === 'w' && card.dataset.top === '1') from = { kind: 'waste' };
  else if (card.dataset.key && card.dataset.key[0] === 't') {
    var parts = card.dataset.key.slice(1).split('_');
    var i = +parts[0], k = +parts[1];
    if (!movableFromTab(i, k)) return;
    from = { kind: 'tab', i: i, k: k };
  } else if (card.dataset.key && card.dataset.key[0] === 'f') {
    from = { kind: 'found', f: +card.dataset.key.slice(1) };
  }
  if (!from) return;
  // collect the stack elements (tab: k..end)
  var els = [card];
  if (from.kind === 'tab') {
    var col = card.closest('.tcol');
    var all = Array.prototype.slice.call(col.querySelectorAll('.card'));
    els = all.slice(all.indexOf(card));
  }
  var r = card.getBoundingClientRect();
  drag = {
    from: from, els: els, moved: false,
    dx: e.clientX - r.left, dy: e.clientY - r.top,
    ghost: null, startX: e.clientX, startY: e.clientY
  };
  e.preventDefault();
}

function onPointerMove(e) {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 9) return;
  if (!drag.moved) {
    drag.moved = true;
    var gh = document.createElement('div');
    gh.className = 'drag-ghost';
    drag.els.forEach(function (c, idx) {
      var cl = c.cloneNode(true);
      cl.style.top = (idx * 26) + 'px';
      gh.appendChild(cl);
    });
    var r0 = drag.els[0].getBoundingClientRect();
    gh.style.width = r0.width + 'px';
    gh.style.height = (r0.height + (drag.els.length - 1) * 26) + 'px';
    document.body.appendChild(gh);
    drag.ghost = gh;
    drag.els.forEach(function (c) { c.classList.add('lifting'); });
  }
  drag.ghost.style.left = (e.clientX - drag.dx) + 'px';
  drag.ghost.style.top = (e.clientY - drag.dy) + 'px';
}

function onPointerUp(e) {
  if (!drag) return;
  var d = drag;
  drag = null;
  if (d.ghost) d.ghost.remove();
  d.els.forEach(function (c) { c.classList.remove('lifting'); });

  if (!d.moved) { handleTap(e, d.from); return; }
  suppressClick = true;
  setTimeout(function () { suppressClick = false; }, 50);

  // drop: find target pile under pointer
  var p = pileFromEvent(e);
  if (!p) { render(); return; }
  var kind = p.dataset.pile;
  var moved = false;
  if (kind === 'tab') {
    var j = +p.dataset.i;
    moved = dropStackOnTableau(d.from, j);
  } else if (kind === 'found') {
    moved = dropSingleOnFoundation(d.from, +p.dataset.f);
  }
  if (!moved) { AU.untick(); render(); }
}

function dropStackOnTableau(from, j) {
  var st = G.st, r;
  if (from.kind === 'waste') r = SOL.wasteToTableau(st, j);
  else if (from.kind === 'tab') r = SOL.tableauToTableau(st, from.i, j, from.k);
  else if (from.kind === 'found') r = SOL.foundationToTableau(st, from.f, j);
  if (r && r.ok) { afterMove('snap'); return true; }
  return false;
}

function dropSingleOnFoundation(from, f) {
  var st = G.st, sc = null;
  if (from.kind === 'waste') sc = SOL.top(st.waste);
  else if (from.kind === 'tab') {
    var pile = st.tableau[from.i];
    if (from.k === pile.length - 1) sc = pile[from.k];
  } else return false;
  if (!sc || sc.s !== f) return false;
  var r = from.kind === 'waste' ? SOL.wasteToFoundation(st) : SOL.tableauToFoundation(st, from.i);
  if (r.ok) { afterMove('chime'); return true; }
  return false;
}

function sameSel(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'tab') return a.i === b.i && a.k === b.k;
  if (a.kind === 'found') return a.f === b.f;
  return true;
}

function handleTap(e, from) {
  var now = Date.now();
  var key = from.kind + (from.i !== undefined ? from.i : '') + (from.k !== undefined ? '_' + from.k : '') + (from.f !== undefined ? 'f' + from.f : '');
  var isDouble = (now - G.lastTap < 350 && G.lastTapKey === key);
  G.lastTap = now; G.lastTapKey = key;

  // double-tap: send single card to foundation
  if (isDouble) {
    G.sel = from;
    if (tryMoveSelToFoundation()) return;
  }

  // tapping the selected card again deselects
  if (sameSel(G.sel, from)) { clearSel(); render(); return; }

  // if something is selected and we tapped a destination, try the move
  if (G.sel) {
    var col = e.target.closest('.tcol');
    if (col) {
      if (tryMoveSelToTableau(+col.dataset.i)) return;
      // miss: fall through and reselect the tapped card
    } else {
      var found = e.target.closest('.found');
      if (found && tryMoveSelToFoundation()) return;
    }
  }
  // otherwise select the tapped card
  G.sel = from;
  AU.click();
  render();
}

function onBoardTap(e) {
  if (suppressClick) return;
  if (G.busy || !G.st || G.st.won) return;
  var p = e.target.closest('[data-pile]');
  if (!p) { if (G.sel) { clearSel(); render(); } return; }
  var kind = p.dataset.pile;
  if (kind === 'stock') { doDraw(); return; }
  if (kind === 'tab' && !e.target.closest('.card')) {
    // tapped empty column area
    if (G.sel) {
      if (tryMoveSelToTableau(+p.dataset.i)) return;
      clearSel(); render();
    }
    return;
  }
  if (kind === 'found' && !e.target.closest('.card')) {
    if (G.sel && tryMoveSelToFoundation()) return;
    if (G.sel) { clearSel(); render(); }
    return;
  }
  if (kind === 'waste' && !e.target.closest('.card')) {
    if (G.sel) { clearSel(); render(); }
  }
}

/* ---------------- wiring ---------------- */

function bind() {
  var board = $('board');
  board.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', function () {
    if (drag) { if (drag.ghost) drag.ghost.remove(); drag.els.forEach(function (c) { c.classList.remove('lifting'); }); drag = null; render(); }
  });
  board.addEventListener('click', onBoardTap);

  $('btn-undo').addEventListener('click', function () { AU.init(); doUndo(); });
  $('btn-hint').addEventListener('click', function () { AU.init(); doHint(); });
  $('btn-auto').addEventListener('click', function () { AU.init(); doAuto(); });
  $('btn-new').addEventListener('click', function () { AU.init(); newDeal('deal'); });
  $('btn-menu2').addEventListener('click', function () { stopTimer(); stopAuto(); show('screen-menu'); refreshMenu(); });

  $('btn-deal').addEventListener('click', function () { AU.init(); newDeal('deal'); });
  $('btn-daily').addEventListener('click', function () { AU.init(); newDeal('daily'); });
  $('btn-draw').addEventListener('click', function () {
    SET.draw = SET.draw === 1 ? 3 : 1; saveSet(); AU.click(); refreshMenu();
  });
  $('btn-help').addEventListener('click', function () { AU.click(); showOverlay('help-sheet'); });
  $('btn-close-help').addEventListener('click', function () { AU.click(); hideOverlays(); });
  $('btn-mute').addEventListener('click', function () {
    AU.init(); AU.setMuted(!AU.isMuted()); refreshMenu();
  });
  $('btn-haptic').addEventListener('click', function () {
    SET.haptic = !SET.haptic; saveSet(); vibrate(20); refreshMenu();
  });
  $('btn-again').addEventListener('click', function () { AU.init(); newDeal(G.mode); });
  $('btn-menu').addEventListener('click', function () { show('screen-menu'); refreshMenu(); });

  document.addEventListener('visibilitychange', function () { if (document.hidden) stopTimer(); else if (G.st && !G.st.won && G.st.moves) startTimer(); });
  window.addEventListener('resize', function () { if (G.st) render(); });
  // block page scroll/zoom gestures on the board
  board.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
}

/* ---------------- boot ---------------- */

// scripts load at end of body: DOM is ready.
bind();
refreshMenu();
show('screen-menu');
window.__sol = G;

})();
