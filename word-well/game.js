/* Word Well — UI/controller (game #9 in the Gamez arcade).
 * Logic engine contract (ladder.js, global WW):
 *   WW.dailyPuzzle("YYYY-MM-DD") -> {date,start,end,par,rope,fortuneIdx}
 *   WW.practicePuzzle(seedUint32) -> {start,end,par,rope,date:null}
 *   WW.buildAnswerGraph() -> Map word->neighbors
 *   WW.validateGuess(word,prev,usedSet,adj) -> {ok}|{ok,code}
 *   WW.hintNext(from,end,adj) -> word|null
 *   WW.bfs(from,to,adj) -> word[]|null
 *   WW.starsFor(steps,par) -> 3|2|1
 *   WW.hashSeed(str) -> uint32
 * Words display UPPERCASE; logic uses lowercase. No <input> elements anywhere.
 */
(function () {
'use strict';

/* ============================== pure helpers ============================== */
function $(id) { return document.getElementById(id); }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function dateStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function todayStr() { return dateStr(new Date()); }
function yesterdayStr() { var d = new Date(); d.setDate(d.getDate() - 1); return dateStr(d); }
function fmtDate(ds) {
  var p = String(ds).split('-');
  var d = new Date(+p[0], (+p[1]) - 1, +p[2]);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function starGlyphs(n) { return '★★★'.slice(0, n) + '☆☆☆'.slice(0, 3 - n); }

/* 24 hand-written, wry, Pip-flavored fortunes. fortuneIdx 0-23 is deterministic per date. */
var FORTUNES = [
  "The well says: even the deepest water started as rain.",
  "The well says: you changed one letter at a time. That is also how people change.",
  "The well says: the bottom was always the point. The rope was just the excuse.",
  "The well says: echoes down here repeat everything you drop. Choose wisely.",
  "The well says: still water runs deep, but so do you, apparently.",
  "The well says: every ladder is just stairs that committed.",
  "The well says: you were never lost. You were taking the scenic route down.",
  "The well says: mind the rope. It minds you.",
  "The well says: darkness is only light that has not finished its descent.",
  "The well says: the stones remember every word you stepped on.",
  "The well says: going down is easy. Coming back up builds character.",
  "The well says: a pebble dropped in kindness ripples further than you think.",
  "The well says: the well is deep, but your vocabulary is deeper.",
  "The well says: cold at the top, warm at the bottom. Some things improve on the way down.",
  "The well says: fortune favors the well-prepared speller.",
  "The well says: you did not find the bottom. The bottom found you.",
  "The well says: words are ladders we build between thoughts.",
  "The well says: the rope held. It always believed in you.",
  "The well says: depth is a feature, not a bug.",
  "The well says: congratulations. The water down here is lovely.",
  "The well says: one letter at a time is how all great descents happen.",
  "The well says: you came, you saw, you spelled.",
  "The well says: the best view of the sky is from the bottom of a well.",
  "The well says: keep this between us \u2014 the other wells are jealous."
];
function fortuneFor(puz) {
  if (puz && typeof puz.fortuneIdx === 'number') return FORTUNES[((puz.fortuneIdx % 24) + 24) % 24];
  var h = 0;
  try { h = WW.hashSeed(puz.start + '>' + puz.end); } catch (e) { h = (puz.start.length * 31 + puz.end.length) >>> 0; }
  return FORTUNES[h % 24];
}
function shareText(puz, steps, streakCount) {
  var stars = WW.starsFor(steps, puz.par);
  var where = puz.date ? 'Word Well ' + puz.date : 'Word Well Practice';
  var s = '\u{1FAA2} ' + where + ' \u2014 ' +
    puz.start.toUpperCase() + ' \u2192 ' + puz.end.toUpperCase() +
    ' \u00B7 ' + steps + ' rungs (par ' + puz.par + ') ' + starGlyphs(stars);
  if (typeof streakCount === 'number') s += ' \u00B7 \u{1F525} streak ' + streakCount;
  return s;
}

/* ============================== persistence ============================== */
var STREAK_KEY = 'ww_streak_v1';
function loadStreak() {
  try {
    var s = JSON.parse(localStorage.getItem(STREAK_KEY));
    if (s && typeof s.count === 'number') return { count: s.count, longest: s.longest | 0, last: s.last || null };
  } catch (e) {}
  return { count: 0, longest: 0, last: null };
}
function saveStreak(s) { try { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); } catch (e) {} }
function streakAfter(s, d, y) { /* pure core, testable */
  var n = { count: s.count, longest: s.longest, last: s.last };
  if (n.last === d) { /* already counted today: keep */ }
  else if (n.last === y) { n.count += 1; }
  else { n.count = 1; }
  if (n.count > n.longest) n.longest = n.count;
  n.last = d;
  return n;
}
function bumpStreak(d) { var s = streakAfter(loadStreak(), d, yesterdayStr()); saveStreak(s); return s; }
function dailyKey(d) { return 'ww_daily_v1_' + d; }
function saveDaily() {
  if (!G || G.mode !== 'daily' || !G.puz.date) return;
  try {
    localStorage.setItem(dailyKey(G.puz.date),
      JSON.stringify({ rungs: G.rungs, ropeLeft: G.ropeLeft, status: G.status }));
  } catch (e) {}
}
function loadDaily(d) {
  try { var s = localStorage.getItem(dailyKey(d)); return s ? JSON.parse(s) : null; }
  catch (e) { return null; }
}
function arcadeName() { try { return (localStorage.getItem('arcade_name') || '').trim(); } catch (e) { return ''; } }

/* ============================== audio ============================== */
var AC = null;
function audioEnsure() {
  try {
    if (!AC) { var Ctx = window.AudioContext || window.webkitAudioContext; if (Ctx) AC = new Ctx(); }
    if (AC && AC.state === 'suspended') AC.resume();
  } catch (e) {}
}
function tone(freq, dur, type, vol, delay, slideTo) {
  if (!AC) return;
  try {
    var t0 = AC.currentTime + (delay || 0);
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(AC.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  } catch (e) {}
}
var sfx = {
  key:   function () { tone(620, 0.06, 'square', 0.05); },
  thunk: function () { tone(180, 0.18, 'triangle', 0.35, 0, 90); },
  error: function () { tone(120, 0.22, 'square', 0.14); },
  hint:  function () { tone(880, 0.14, 'sine', 0.2, 0, 440); },
  win:   function () { tone(659.25, 0.16, 'triangle', 0.25); tone(783.99, 0.16, 'triangle', 0.25, 0.14); tone(987.77, 0.32, 'triangle', 0.25, 0.28); },
  lose:  function () { tone(420, 0.7, 'sawtooth', 0.18, 0, 70); }
};

/* ============================== state ============================== */
var G = null;            /* {puz, mode:'daily'|'practice', rungs[], ropeMax, ropeLeft, status, streak} */
var GRAPH = null;        /* WW.buildAnswerGraph() */
var GUESS_SET = null;    /* Set(WW_GUESSES) for validateGuess */
var slots = [];          /* current guess, uppercase letters */
var kbMode = null;       /* 'play' | 'name' | null — routes physical keyboard */
var nameHandler = null;  /* active name-entry key handler */
var msgTimer = null;

/* ============================== screens ============================== */
var SCREENS = ['menu', 'intro', 'play', 'win', 'lose'];
function show(name) {
  kbMode = null; nameHandler = null;
  SCREENS.forEach(function (s) { $('scr-' + s).classList.toggle('on', s === name); });
}
function showMsg(t, sticky) {
  var m = $('msg'); m.textContent = t || '';
  if (msgTimer) { clearTimeout(msgTimer); msgTimer = null; }
  if (t && !sticky) msgTimer = setTimeout(function () { m.textContent = ''; }, 1900);
}
function shakeSlots() {
  var s = $('slots');
  s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake');
  setTimeout(function () { s.classList.remove('shake'); }, 450);
}

/* ============================== keyboard (no inputs) ============================== */
var KB_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
function buildKeyboard(el, onKey) {
  el.innerHTML = '';
  KB_ROWS.forEach(function (row, ri) {
    var r = document.createElement('div'); r.className = 'kb-row';
    if (ri === 2) r.appendChild(mkKey('\u232B', 'wide', 'Backspace', function () { onKey('BKSP'); }));
    row.split('').forEach(function (ch) { r.appendChild(mkKey(ch, '', 'letter ' + ch, function () { onKey(ch); })); });
    if (ri === 2) r.appendChild(mkKey('ENTER', 'wide enter', 'Enter', function () { onKey('ENTER'); }));
    el.appendChild(r);
  });
}
function mkKey(label, cls, aria, fn) {
  var b = document.createElement('button');
  b.type = 'button'; b.className = ('key ' + cls).trim(); b.textContent = label;
  b.setAttribute('aria-label', aria);
  b.addEventListener('click', function () { audioEnsure(); fn(); });
  return b;
}

/* ============================== rungs & shaft ============================== */
function renderRung(word, prev, animate, tag) {
  var div = document.createElement('div');
  div.className = 'rung' + (animate ? ' drop' : '');
  var w = word.toUpperCase(), p = prev ? prev.toUpperCase() : null, diff = -1, i;
  if (p) for (i = 0; i < 4; i++) { if (w[i] !== p[i]) { diff = i; break; } }
  for (i = 0; i < 4; i++) {
    var t = document.createElement('div');
    t.className = 'tile' + (i === diff ? ' gold' : '');
    t.textContent = w[i];
    div.appendChild(t);
  }
  if (tag) {
    var s = document.createElement('span'); s.className = 'rung-tag'; s.textContent = tag;
    div.appendChild(s);
  }
  return div;
}
function renderSlots() {
  var els = $('slots').children, i;
  for (i = 0; i < 4; i++) {
    els[i].textContent = slots[i] || '';
    els[i].classList.toggle('full', !!slots[i]);
  }
}
function updateRope() {
  $('rope-count').textContent = '\u00D7' + G.ropeLeft;
  $('rope-fill').style.height = Math.max(0, 100 * G.ropeLeft / G.ropeMax) + '%';
  $('rope-col').classList.toggle('danger', G.ropeLeft <= 2);
  $('btn-hint').disabled = !(G.status === 'playing' && G.ropeLeft >= 2);
}
function scrollShaft() { var sh = $('shaft'); sh.scrollTop = sh.scrollHeight; }

/* ============================== game flow ============================== */
function ensureData() {
  if (!GRAPH) GRAPH = WW.buildAnswerGraph();
  if (!GUESS_SET) GUESS_SET = new Set(WW_GUESSES);
}
function startGame(puz, mode, saved) {
  ensureData();
  G = {
    puz: puz, mode: mode,
    rungs: saved ? saved.rungs.slice() : [puz.start],
    ropeMax: puz.rope, ropeLeft: saved ? saved.ropeLeft : puz.rope,
    status: 'playing', streak: loadStreak()
  };
  slots = [];
  var sh = $('shaft'); sh.innerHTML = '';
  for (var i = 0; i < G.rungs.length; i++)
    sh.appendChild(renderRung(G.rungs[i], i ? G.rungs[i - 1] : null, false, i === 0 ? 'START' : null));
  renderSlots(); updateRope(); showMsg('');
  $('play-mode').textContent = mode === 'daily' ? fmtDate(puz.date) : 'Practice';
  show('play');
  kbMode = 'play';
  scrollShaft();
  if (mode === 'daily' && !saved) saveDaily();
}
function openDaily() {
  var t = todayStr(), puz;
  try { puz = WW.dailyPuzzle(t); } catch (e) { showMsg(''); return; }
  var st = loadDaily(t);
  if (!st) { renderIntro(puz); return; }
  if (st.status === 'playing') { startGame(puz, 'daily', st); return; }
  /* finished earlier today: show the result again */
  startGameSilent(puz, 'daily', st);
  if (st.status === 'won') onWin(false); else onLose(false);
}
function startGameSilent(puz, mode, saved) {
  /* builds G without switching to the play screen (for showing old results) */
  ensureData();
  G = {
    puz: puz, mode: mode,
    rungs: saved.rungs.slice(), ropeMax: puz.rope, ropeLeft: saved.ropeLeft,
    status: saved.status, streak: loadStreak()
  };
}
function startPractice() {
  var seed = (Math.random() * 4294967296) >>> 0;
  var puz = WW.practicePuzzle(seed);
  startGame(puz, 'practice', null);
}
function replayAsPractice() {
  if (!G) return;
  var path = null;
  try { path = WW.bfs(G.puz.start, G.puz.end, GRAPH); } catch (e) {}
  var par = path ? path.length - 1 : G.puz.par;
  startGame({ start: G.puz.start, end: G.puz.end, par: par, rope: par + 3, date: null }, 'practice', null);
}

/* ---------- guessing ---------- */
function pressLetter(ch) {
  if (!G || G.status !== 'playing') return;
  if (slots.length >= 4) return;
  slots.push(ch); sfx.key(); renderSlots();
}
function pressBksp() {
  if (!G || G.status !== 'playing') return;
  if (slots.length) { slots.pop(); sfx.key(); renderSlots(); }
}
function submitGuess() {
  if (!G || G.status !== 'playing') return;
  if (slots.length < 4) { sfx.error(); shakeSlots(); showMsg('Four letters, friend.'); return; }
  var word = slots.join('').toLowerCase();
  var prev = G.rungs[G.rungs.length - 1];
  var res;
  try { res = WW.validateGuess(word, prev, new Set(G.rungs), GUESS_SET); }
  catch (e) { res = { ok: false, code: 'not-word' }; }
  if (!res.ok) {
    sfx.error(); shakeSlots();
    showMsg(res.code === 'not-word' ? 'Not in the word list' :
            res.code === 'repeat' ? 'Already climbed that word' : 'Change just one letter');
    return;
  }
  G.rungs.push(word); G.ropeLeft -= 1;
  slots = []; renderSlots();
  $('shaft').appendChild(renderRung(word, prev, true));
  sfx.thunk(); updateRope(); scrollShaft();
  if (G.mode === 'daily') saveDaily();
  if (word === G.puz.end) { onWin(true); return; }
  if (G.ropeLeft <= 0) { onLose(true); return; }
  if (G.ropeLeft <= 2) showMsg('The rope is fraying\u2026');
}
function useHint() {
  if (!G || G.status !== 'playing' || G.ropeLeft < 2) return;
  var from = G.rungs[G.rungs.length - 1], h = null;
  try { h = WW.hintNext(from, G.puz.end, GRAPH); } catch (e) {}
  if (!h) { showMsg('The well is silent\u2026'); return; }
  G.ropeLeft -= 1; updateRope(); sfx.hint();
  slots = h.toUpperCase().split(''); renderSlots();
  showMsg('The pebble whispers: ' + h.toUpperCase());
  if (G.mode === 'daily') saveDaily();
}

/* ---------- win / lose ---------- */
function onWin(fresh) {
  G.status = 'won';
  if (G.mode === 'daily') saveDaily();
  if (fresh) sfx.win();
  var steps = G.rungs.length - 1, puz = G.puz;
  var stars = WW.starsFor(steps, puz.par);
  if (G.mode === 'daily' && fresh) G.streak = bumpStreak(puz.date);
  else G.streak = loadStreak();

  var wr = $('win-rung'); wr.innerHTML = '';
  var prev = G.rungs.length > 1 ? G.rungs[G.rungs.length - 2] : null;
  var tmp = renderRung(puz.end, prev, false);
  while (tmp.firstChild) wr.appendChild(tmp.firstChild);
  /* restart the drop-into-water animation */
  wr.classList.remove('end-rung'); void wr.offsetWidth; wr.classList.add('end-rung');

  $('win-fortune').textContent = fortuneFor(puz);
  $('win-stars').textContent = starGlyphs(stars);
  $('win-stats').textContent = steps + ' rungs (par ' + puz.par + ')';
  var sl = $('win-streak');
  if (G.mode === 'daily') {
    var c = G.streak.count;
    sl.textContent = c > 0
      ? '\u{1F525} ' + c + ' day streak' + (c === 1 ? '' : 's') + ' \u00B7 best ' + G.streak.longest
      : 'Streak starts tomorrow \u2014 come back!';
    sl.style.display = '';
  } else { sl.style.display = 'none'; }

  var shareBtn = $('btn-share');
  shareBtn.onclick = function () {
    audioEnsure();
    var txt = shareText(puz, steps, G.mode === 'daily' ? G.streak.count : null);
    copyText(txt, function (ok) {
      shareBtn.textContent = ok ? 'Copied \u2713' : 'Copy failed \u2014 sorry';
      setTimeout(function () { shareBtn.textContent = '\u{1F4CB} Share'; }, 1600);
    });
  };

  $('btn-replay-practice').hidden = G.mode !== 'daily';
  show('win'); /* show() clears kbMode/nameHandler, so arcade setup must come after */
  var box = $('arc-lb');
  if (G.mode === 'daily') { box.hidden = false; arcadeDaily(steps, fresh); }
  else { box.hidden = true; }
}
function onLose(fresh) {
  G.status = 'lost';
  if (G.mode === 'daily') saveDaily();
  if (fresh) sfx.lose();
  var path = null;
  try { path = WW.bfs(G.puz.start, G.puz.end, GRAPH); } catch (e) {}
  $('lose-path').textContent = path
    ? path.map(function (w) { return w.toUpperCase(); }).join(' \u2192 ')
    : 'The well keeps its secrets.';
  $('btn-lose-replay').hidden = G.mode !== 'daily';
  show('lose');
}

/* ---------- daily intro + invisible AI theme ---------- */
var AI_URL = 'https://gamez-ai.chaoticutopia84.workers.dev/g';
function renderIntro(puz) {
  $('intro-date').textContent = fmtDate(puz.date);
  $('intro-start').textContent = puz.start.toUpperCase();
  $('intro-end').textContent = puz.end.toUpperCase();
  $('intro-par').textContent = 'Par ' + puz.par + ' \u00B7 Rope \u{1FAA2}' + puz.rope;
  var theme = $('intro-theme');
  theme.textContent = 'Today\u2019s descent: ' + puz.start.toUpperCase() + ' \u2192 ' + puz.end.toUpperCase();
  show('intro');
  fetchTheme(puz.start.toUpperCase(), puz.end.toUpperCase(), function (t) {
    if (t) theme.textContent = t; /* silent swap; fallback already shown */
  });
}
function fetchTheme(startU, endU, cb) {
  /* invisible AI: silent local fallback on ANY failure; no spinners, no labels */
  var done = false;
  var timer = setTimeout(function () { fin(null); }, 7000);
  function fin(t) { if (done) return; done = true; clearTimeout(timer); cb(t); }
  try {
    fetch(AI_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'well', game: 'word-well', ctx: { start: startU, end: endU } })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) { fin(d && d.text ? String(d.text).slice(0, 140) : null); })
      .catch(function () { fin(null); });
  } catch (e) { fin(null); }
}

/* ---------- clipboard ---------- */
function copyText(t, cb) {
  function legacy() {
    try {
      var ta = document.createElement('textarea');
      ta.value = t; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.top = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      cb(!!ok);
    } catch (e) { cb(false); }
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(t).then(function () { cb(true); }, legacy);
    else legacy();
  } catch (e) { legacy(); }
}

/* ---------- arcade leaderboard (daily wins only) ---------- */
var ARCADE_BASE = 'https://gamez-arcade.chaoticutopia84.workers.dev';
function arcadeFetch(path, body, cb) {
  var done = false, timer = null;
  function fin(e, d) { if (!done) { done = true; if (timer) clearTimeout(timer); cb(e, d); } }
  timer = setTimeout(function () { fin(new Error('timeout')); }, 12000);
  try {
    fetch(ARCADE_BASE + path, body ?
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
      .then(function (r) { return r.json(); })
      .then(function (d) { fin(null, d); })
      .catch(function (e) { fin(e); });
  } catch (e) { fin(e); }
}
function arcadeDaily(steps, fresh) {
  var box = $('arc-lb');
  var boardId = 'daily-' + G.puz.date;
  var name = arcadeName();
  if (fresh && name) { submitScore(box, steps, boardId, name); return; }
  if (fresh && !name) { renderNameEntry(box, steps, boardId); return; }
  /* resumed win: show the board without re-posting */
  arcadeFetch('/scores?game=word-well&board=' + encodeURIComponent(boardId), null, function (e, d) {
    if (d && d.top && d.top.length) renderBoard(box, d.top, 0, name, boardId);
    else box.hidden = true;
  });
}
function submitScore(box, steps, boardId, name) {
  kbMode = null; nameHandler = null;
  box.innerHTML = '<div class="arc-lb-empty">\u{1F3C6} sending\u2026</div>';
  var score = Math.max(1, 100 - steps);
  arcadeFetch('/score', { game: 'word-well', board: boardId, name: name, score: score }, function (err, res) {
    if (res && res.top) { renderBoard(box, res.top, res.rank || 0, name, boardId); return; }
    arcadeFetch('/scores?game=word-well&board=' + encodeURIComponent(boardId), null, function (e2, d2) {
      if (d2 && d2.top && d2.top.length) renderBoard(box, d2.top, 0, name, boardId);
      else box.hidden = true; /* backend unavailable: UI unaffected */
    });
  });
}
function renderBoard(box, top, rank, hlName, boardId) {
  var medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
  var html = '<div class="arc-lb-title">\u{1F3C6} DAILY BOARD</div>';
  if (rank > 0) html += '<div class="arc-lb-rank">GLOBAL #' + rank + '!</div>';
  html += top.slice(0, 3).map(function (e, i) {
    var st = Math.max(1, 100 - e.score);
    return '<div class="arc-lb-row' + (e.name === hlName ? ' me' : '') + '"><span>' +
      (medals[i] || (i + 1) + '.') + ' ' + esc(e.name) + '</span><b>' + st + ' rungs</b></div>';
  }).join('');
  box.innerHTML = html;
}
/* input-less name entry: the game's own keyboard, maxlength 12 */
function renderNameEntry(box, steps, boardId) {
  var nameBuf = '';
  box.innerHTML =
    '<div class="arc-lb-title">\u{1F3C6} DAILY LEADERBOARD</div>' +
    '<div class="arc-name-prompt">Carve your name to join the board:</div>' +
    '<div class="arc-name-disp" id="arc-name-disp"></div>' +
    '<div class="kb mini" id="arc-kb"></div>';
  function paint() {
    var d = $('arc-name-disp');
    if (d) d.innerHTML = esc(nameBuf) + '<span class="cursor">|</span>';
  }
  nameHandler = function (k) {
    if (k === 'BKSP') { nameBuf = nameBuf.slice(0, -1); sfx.key(); }
    else if (k === 'ENTER') {
      if (!nameBuf.length) return;
      try { localStorage.setItem('arcade_name', nameBuf); } catch (e) {}
      submitScore(box, steps, boardId, nameBuf);
      return;
    }
    else if (nameBuf.length < 12) { nameBuf += k; sfx.key(); }
    paint();
  };
  buildKeyboard($('arc-kb'), nameHandler);
  paint();
  kbMode = 'name';
}

/* ============================== menu ============================== */
function refreshMenu() {
  var s = loadStreak();
  $('menu-streak').textContent = s.count > 0
    ? '\u{1F525} ' + s.count + ' day streak' + (s.count === 1 ? '' : 's') + ' \u00B7 best ' + s.longest
    : 'No streak yet \u2014 start one today!';
  $('daily-date').textContent = fmtDate(todayStr());
}

/* ============================== init ============================== */
function init() {
  if (!window.WW || !window.WW_ANSWERS || !window.WW_GUESSES) {
    $('menu-streak').textContent = 'The well is still being dug (missing word data).';
    return;
  }
  document.addEventListener('pointerdown', audioEnsure);
  document.addEventListener('keydown', function (e) {
    audioEnsure();
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    if (kbMode === 'play') {
      if (k === 'Backspace') { e.preventDefault(); pressBksp(); }
      else if (k === 'Enter') { submitGuess(); }
      else if (/^[a-zA-Z]$/.test(k)) pressLetter(k.toUpperCase());
    } else if (kbMode === 'name' && nameHandler) {
      if (k === 'Backspace') { e.preventDefault(); nameHandler('BKSP'); }
      else if (k === 'Enter') { nameHandler('ENTER'); }
      else if (/^[a-zA-Z]$/.test(k)) nameHandler(k.toUpperCase());
    }
  });

  buildKeyboard($('kb'), function (k) {
    if (k === 'BKSP') pressBksp();
    else if (k === 'ENTER') submitGuess();
    else pressLetter(k);
  });

  $('btn-daily').addEventListener('click', function () { audioEnsure(); openDaily(); });
  $('btn-practice').addEventListener('click', function () { audioEnsure(); startPractice(); });
  $('btn-how').addEventListener('click', function () {
    audioEnsure();
    var c = $('rules-card'); c.hidden = !c.hidden;
  });
  $('btn-begin').addEventListener('click', function () {
    audioEnsure();
    try {
      var puz = WW.dailyPuzzle(todayStr());
      startGame(puz, 'daily', null);
    } catch (e) { show('menu'); }
  });
  $('btn-intro-menu').addEventListener('click', function () { refreshMenu(); show('menu'); });
  $('btn-quit').addEventListener('click', function () { refreshMenu(); show('menu'); });
  $('btn-hint').addEventListener('click', function () { audioEnsure(); useHint(); });
  $('btn-win-practice').addEventListener('click', startPractice);
  $('btn-win-menu').addEventListener('click', function () { refreshMenu(); show('menu'); });
  $('btn-lose-practice').addEventListener('click', startPractice);
  $('btn-lose-menu').addEventListener('click', function () { refreshMenu(); show('menu'); });
  $('btn-replay-practice').addEventListener('click', replayAsPractice);
  $('btn-lose-replay').addEventListener('click', replayAsPractice);

  /* unrequested touch: tap the rope logo and the well whispers a fortune */
  var whisperTimer = null;
  $('menu-logo').addEventListener('click', function () {
    audioEnsure();
    var f = FORTUNES[(Math.random() * FORTUNES.length) | 0].replace(/^The well says: /, '');
    var w = $('menu-whisper');
    w.textContent = 'The well whispers: \u201C' + f + '\u201D';
    if (whisperTimer) clearTimeout(whisperTimer);
    whisperTimer = setTimeout(function () { w.textContent = ''; }, 5000);
  });

  refreshMenu();
  show('menu');
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FORTUNES: FORTUNES, fortuneFor: fortuneFor, starGlyphs: starGlyphs,
    shareText: shareText, streakAfter: streakAfter,
    dateStr: dateStr, yesterdayStr: yesterdayStr
  };
}

})();
