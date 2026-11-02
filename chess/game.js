'use strict';
/* Chess UI — Lichess-shaped: setup sheet -> quiet board. Rules/AI live in sim.js;
   AI search runs in ai-worker.js (falls back to the main thread if workers fail). */
const S = ChessSim;
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const LV_GLYPH = ['♟', '♞', '♜', '♛'];
const $ = id => document.getElementById(id);
const boardEl = $('board');

let game = S.parseFEN(S.START_FEN);
let settings = { mode: 'ai', level: 0, side: 'w' };
let humanSide = 'w';
let flipped = false;
let selected = -1, legalCache = [], lastMove = null, hintPair = null;
let movesUci = [], helpUsed = 0, thinking = false, drag = null, resignArmed = false;
let worker = null, workerOK = false;
let daily = null; // {date, seed, level, side} while a daily-challenge game runs
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 1779033703; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return h >>> 0; }
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dailyPairing(date) { const seed = hashStr('chess-daily-' + date); const rng = mulberry32(seed); return { date, seed, level: Math.floor(rng() * 4), side: rng() < 0.5 ? 'w' : 'b' }; }
function dailyRecords() { try { return JSON.parse(localStorage.getItem('chess_daily_v1') || '{}'); } catch (e) { return {}; } }
function dailyStreak(rec) {
  if (!rec.plays) return 0;
  const dates = Object.keys(rec.plays).sort();
  if (!dates.length) return 0;
  const last = dates[dates.length - 1];
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yStr = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
  if (last !== todayStr() && last !== yStr) return 0;
  return rec.plays[last].streak || 1;
}
function recordDaily(res) {
  const rec = dailyRecords(); rec.plays = rec.plays || {};
  if (rec.plays[daily.date]) return rec.plays[daily.date];
  const y = new Date(daily.date + 'T12:00:00'); y.setDate(y.getDate() - 1);
  const yStr = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
  const streak = rec.plays[yStr] ? (rec.plays[yStr].streak || 1) + 1 : 1;
  rec.plays[daily.date] = { result: res, level: daily.level, side: daily.side, streak };
  rec.wins = (rec.wins || 0) + (res === 'win' ? 1 : 0);
  try { localStorage.setItem('chess_daily_v1', JSON.stringify(rec)); } catch (e) {}
  const score = res === 'win' ? 700 + daily.level * 100 : res === 'draw' ? 300 + daily.level * 25 : 50;
  try {
    const name = (localStorage.getItem('arcade_name') || 'You').slice(0, 12);
    fetch('https://gamez-arcade.chaoticutopia84.workers.dev/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game: 'chess', board: 'daily-' + daily.date, name, score }) }).catch(() => {});
  } catch (e) {}
  return rec.plays[daily.date];
}
let pieceSetName = 'staunton';
try { const sv = localStorage.getItem('chess_set_v1'); if (sv === 'court' || sv === 'starfall') pieceSetName = sv; } catch (e) {}
function applySet(name) {
  pieceSetName = name;
  const src = PIECE_SETS[name];
  for (const k of Object.keys(PIECES)) PIECES[k] = src[k];
  document.body.classList.toggle('set-court', name === 'court');
  document.body.classList.toggle('set-star', name === 'starfall');
  try { localStorage.setItem('chess_set_v1', name); } catch (e) {}
  for (const x of $('segSet').children) x.classList.toggle('on', x.dataset.v === name);
  buildLevels();
  document.querySelector('.setupGlyph').innerHTML = PIECES.n;
  if (movesUci.length || document.querySelector('#board .piece')) render();
}
function refreshDailyLine() {
  const p = dailyPairing(todayStr());
  const rec = dailyRecords(); const played = rec.plays && rec.plays[p.date];
  const st = dailyStreak(rec);
  $('dailyLine').textContent = played
    ? "Today's challenge is done — you " + (played.result === 'win' ? 'won' : played.result === 'draw' ? 'drew' : 'lost') + ' as ' + (played.side === 'w' ? 'White' : 'Black') + ' vs ' + S.LEVELS[played.level].name + '.' + (st > 1 ? ' Streak ' + st + ' days.' : '')
    : 'Today: play ' + (p.side === 'w' ? 'White' : 'Black') + ' against ' + S.LEVELS[p.level].name + ' — the same pairing for everyone.' + (st > 1 ? ' Streak ' + st + ' days.' : '');
}
try {
  worker = new Worker('ai-worker.js?v=20261101a');
  worker.onmessage = e => { workerOK = true; onAiMessage(e.data); };
  worker.onerror = () => { workerOK = false; };
} catch (e) { workerOK = false; }
let pendingAi = null; // {kind:'move'|'hint', resolve}
function askAi(kind) {
  return new Promise(resolve => {
    pendingAi = { kind, resolve };
    const msg = { fen: S.toFEN(game), level: settings.level, hint: kind === 'hint', seed: daily && kind === 'move' ? ((daily.seed ^ Math.imul(movesUci.length + 1, 2654435761)) >>> 0) : null };
    if (worker) { try { worker.postMessage(msg); setTimeout(() => { if (pendingAi && pendingAi.kind === kind && !workerOK) fallbackAi(msg, resolve); }, 60); return; } catch (e) { /* fall through */ } }
    fallbackAi(msg, resolve);
  });
}
function fallbackAi(msg, resolve) {
  setTimeout(() => {
    const st = S.parseFEN(msg.fen);
    const m = msg.hint ? S.hintMove(st) : S.chooseMove(st, msg.level, msg.seed == null ? undefined : mulberry32(msg.seed >>> 0));
    resolve(m ? { from: m.from, to: m.to, promo: m.promo || null } : null);
  }, 30);
}
function onAiMessage(data) {
  if (!pendingAi) return;
  const p = pendingAi; pendingAi = null; p.resolve(data);
}

function displayOrder() {
  const arr = [];
  for (let d = 0; d < 64; d++) {
    const r = flipped ? 7 - (d >> 3) : (d >> 3), f = flipped ? 7 - (d & 7) : (d & 7);
    arr.push(r * 8 + f);
  }
  return arr;
}
function buildBoard() {
  boardEl.innerHTML = '';
  const order = displayOrder();
  order.forEach((idx, d) => {
    const el = document.createElement('div');
    const f = idx & 7, r = idx >> 3;
    el.className = 'sq ' + (((f + r) % 2 === 0) ? 'light' : 'dark');
    el.dataset.sq = idx;
    if ((d >> 3) === 7) { const c = document.createElement('span'); c.className = 'fcoord'; c.textContent = 'abcdefgh'[f]; el.appendChild(c); }
    if (idx === 0 || idx === 7 || idx === 56 || idx === 63) { const sm = document.createElement('span'); sm.className = 'seam' + ((idx === 7 || idx === 56) ? ' flip' : ''); el.appendChild(sm); }
    boardEl.appendChild(el);
  });
  buildFrameCoords();
}
/* Coordinates engraved into the frame itself, not printed on the squares. */
function buildFrameCoords() {
  const fc = $('fcoords'), rc = $('rcoords');
  fc.innerHTML = ''; rc.innerHTML = '';
  for (let d = 0; d < 8; d++) {
    const r = flipped ? d : 7 - d;
    const rs = document.createElement('span');
    rs.textContent = r + 1;
    rs.style.top = 'calc(13px + (100% - 26px) * ' + (d + 0.5) + ' / 8)';
    rc.appendChild(rs);
  }
}
function capturedBy(color) {
  // pieces of the enemy that `color` has captured, from the starting set
  const start = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const now = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  const enemy = color === 'w' ? 'b' : 'w';
  for (const p of game.b) if (p && (enemy === 'w' ? p === p.toUpperCase() : p === p.toLowerCase())) { const t = p.toLowerCase(); if (now[t] !== undefined) now[t]++; }
  // promotion inflates counts; clamp so extra queens never show as negative captures
  const caps = [];
  let mat = 0;
  for (const t of ['q', 'r', 'b', 'n', 'p']) {
    const missing = Math.max(0, start[t] - now[t]);
    for (let i = 0; i < missing; i++) caps.push(t);
    mat += missing * S.VAL[t] / 100;
  }
  return { caps, mat };
}
function render() {
  const topColor = flipped ? 'w' : 'b', botColor = flipped ? 'b' : 'w';
  const setBar = (which, color) => {
    const isAI = settings.mode === 'ai' && color !== humanSide;
    $('name' + which).textContent = settings.mode === '2p' ? (color === 'w' ? 'White' : 'Black')
      : isAI ? S.LEVELS[settings.level].name + ' — Computer' : 'You';
    const taken = capturedBy(color);
    $('cap' + which).innerHTML = taken.caps.map(t => '<span class="capPc ' + (color === 'w' ? 'pcb' : 'pcw') + '">' + PIECES[t] + '</span>').join('');
    const other = capturedBy(color === 'w' ? 'b' : 'w');
    const diff = taken.mat - other.mat;
    $('mat' + which).textContent = diff > 0 ? '+' + diff : '';
    $('bar' + which).classList.toggle('active', game.turn === color && !game.over);
  };
  setBar('Top', topColor); setBar('Bottom', botColor);
  $('thinkTop').classList.toggle('on', thinking && topColor !== humanSide && settings.mode === 'ai');
  $('thinkBottom').classList.toggle('on', thinking && settings.mode === 'ai' && botColor !== humanSide);
  $('statusLine').textContent = game.over ? game.over.text
    : (S.inCheck(game, game.turn) ? 'Check — ' : '') + (game.turn === 'w' ? 'White' : 'Black') + ' to move';
  // board squares
  const legalTos = new Map(legalCache.filter(m => m.from === selected).map(m => [m.to, m]));
  for (const el of boardEl.children) {
    const idx = +el.dataset.sq;
    el.classList.toggle('last', !!lastMove && (lastMove.from === idx || lastMove.to === idx));
    el.classList.toggle('sel', idx === selected);
    el.classList.toggle('check', !!game.b[idx] && game.b[idx].toLowerCase() === 'k' && S.inCheck(game, game.b[idx] === 'K' ? 'w' : 'b'));
    el.classList.toggle('hintFrom', !!hintPair && hintPair.from === idx);
    el.classList.toggle('hintTo', !!hintPair && hintPair.to === idx);
    let dot = el.querySelector('.dot,.ring'); if (dot) dot.remove();
    if (legalTos.has(idx)) {
      const d = document.createElement('div');
      d.className = legalTos.get(idx).cap || legalTos.get(idx).epCap ? 'ring' : 'dot';
      el.appendChild(d);
    }
    let pc = el.querySelector('.piece'); if (pc) pc.remove();
    const p = game.b[idx];
    if (p) {
      const s = document.createElement('span');
      s.className = 'piece ' + (p === p.toUpperCase() ? 'pcw' : 'pcb');
      s.innerHTML = PIECES[p.toLowerCase()];
      el.appendChild(s);
    }
  }
  // move list
  const ml = $('moveList'); ml.innerHTML = '';
  for (let i = 0; i < game.sanList.length; i += 2) {
    const li = document.createElement('li');
    const w = game.sanList[i], b = game.sanList[i + 1];
    li.innerHTML = '<b>' + (i / 2 + 1) + '.</b>' + w + (b ? ' &nbsp;' + b : '');
    ml.appendChild(li);
  }
  ml.scrollTop = ml.scrollHeight;
  $('btnUndo').disabled = !movesUci.length || thinking;
  $('btnHint').disabled = !!game.over || thinking || (settings.mode === 'ai' && game.turn !== humanSide);
  // lit moments: the room dims on check; the winner's plate warms at the end
  const chkNow = !game.over && S.inCheck(game, game.turn);
  document.body.classList.toggle('checklit', chkNow);
  const winColor = game.over && game.over.result !== '1/2-1/2' ? (game.over.result === '1-0' ? 'w' : 'b') : null;
  $('barTop').classList.toggle('winner', winColor === topColor);
  $('barBottom').classList.toggle('winner', winColor === botColor);
  saveGame();
}
function saveGame() {
  try {
    if (!movesUci.length) { localStorage.removeItem('chess_save_v1'); return; }
    localStorage.setItem('chess_save_v1', JSON.stringify({ movesUci, settings, humanSide, helpUsed, daily }));
  } catch (e) {}
}
function loadSave() {
  try {
    const raw = localStorage.getItem('chess_save_v1'); if (!raw) return false;
    const sv = JSON.parse(raw); if (!sv.movesUci || !sv.movesUci.length) return false;
    settings = sv.settings; humanSide = sv.humanSide; helpUsed = sv.helpUsed || 0;
    daily = sv.daily && sv.daily.date === todayStr() ? sv.daily : null;
    game = S.parseFEN(S.START_FEN); movesUci = []; lastMove = null;
    for (const u of sv.movesUci) {
      const m = S.legalMoves(game).find(x => uciOf(x) === u);
      if (!m) return false;
      S.applyMove(game, m); movesUci.push(u); lastMove = m;
    }
    flipped = settings.mode === 'ai' && humanSide === 'b';
    return true;
  } catch (e) { return false; }
}
const uciOf = m => S.sqName(m.from) + S.sqName(m.to) + (m.promo ? m.promo.toLowerCase() : '');
function refreshLegal() { legalCache = game.over ? [] : S.legalMoves(game); }

function humanTurn() {
  if (game.over) return false;
  return settings.mode === '2p' || game.turn === humanSide;
}
/* --- synthesized sound: wood, felt, a little brass. No audio files. --- */
let AC = null, soundOn = true;
try { soundOn = localStorage.getItem('chess_sound') !== '0'; } catch (e) {}
function ensureAudio() {
  if (!soundOn) return;
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
  } catch (e) {}
}
document.addEventListener('pointerdown', ensureAudio, { passive: true });
function tone(f0, f1, dur, gain, type, when) {
  if (!soundOn || !AC) return;
  const t = AC.currentTime + (when || 0);
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'triangle';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(AC.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function sfx(kind) {
  if (!soundOn) return;
  ensureAudio(); if (!AC) return;
  if (kind === 'move') tone(300, 130, 0.09, 0.20);
  else if (kind === 'capture') { tone(210, 80, 0.13, 0.26); tone(140, 70, 0.1, 0.15, 'triangle', 0.03); }
  else if (kind === 'castle') { tone(300, 130, 0.08, 0.18); tone(300, 130, 0.08, 0.18, 'triangle', 0.1); }
  else if (kind === 'check') { tone(1175, 1150, 0.16, 0.07, 'sine'); tone(1760, 1720, 0.12, 0.04, 'sine', 0.01); }
  else if (kind === 'end') { tone(392, 390, 0.22, 0.09, 'sine'); tone(523, 520, 0.3, 0.09, 'sine', 0.14); }
  else if (kind === 'select') tone(660, 640, 0.04, 0.045, 'sine');
}
function doMove(m) {
  const wasCapture = !!(m.cap || m.epCap);
  const san = S.applyMove(game, m);
  movesUci.push(uciOf(m));
  lastMove = m; selected = -1; hintPair = null; resignArmed = false; $('btnResign').classList.remove('armed'); $('btnResign').textContent = 'Resign';
  refreshLegal(); render();
  animateSlide(m);
  sfx(game.over ? 'end' : san.includes('+') || san.includes('#') ? 'check' : m.castle ? 'castle' : wasCapture ? 'capture' : 'move');
  if (navigator.vibrate) navigator.vibrate(wasCapture ? [10, 30, 10] : 8);
  if (game.over) { showEnd(); return; }
  maybeAi();
}
/* FLIP-lite slide: the piece glides from its old square, lifted, and settles. */
function animateSlide(m) {
  const toEl = boardEl.querySelector('[data-sq="' + m.to + '"]');
  const pc = toEl && toEl.querySelector('.piece');
  if (!pc) return;
  const rect = boardEl.getBoundingClientRect();
  const sq = rect.width / 8;
  const disp = idx => ({ f: flipped ? 7 - (idx & 7) : (idx & 7), r: flipped ? 7 - (idx >> 3) : (idx >> 3) });
  const a = disp(m.from), b = disp(m.to);
  const dx = (a.f - b.f) * sq, dy = (a.r - b.r) * sq;
  if (!dx && !dy) return;
  pc.classList.add('flying');
  pc.style.transition = 'none';
  pc.style.transform = 'translate(' + dx + 'px,' + dy + 'px) translateY(-4%) scale(1.13)';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    pc.style.transition = 'transform .27s cubic-bezier(.25,.8,.3,1)';
    pc.style.transform = '';
    setTimeout(() => pc.classList.remove('flying'), 300);
  }));
}
function maybeAi() {
  if (settings.mode !== 'ai' || game.over || game.turn === humanSide) return;
  thinking = true; render();
  const wait = 350 + Math.random() * 500;
  setTimeout(async () => {
    const res = await askAi('move');
    thinking = false;
    if (!res) { render(); return; }
    const m = S.legalMoves(game).find(x => x.from === res.from && x.to === res.to && (x.promo || null) === res.promo) || S.legalMoves(game).find(x => x.from === res.from && x.to === res.to);
    if (m) doMove(m); else render();
  }, wait);
}
function tryMove(from, to) {
  const opts = legalCache.filter(m => m.from === from && m.to === to);
  if (!opts.length) return false;
  if (opts[0].promo) { openPromo(opts); return true; }
  doMove(opts[0]);
  return true;
}
function openPromo(opts) {
  const sheet = $('promoSheet'), row = $('promoRow');
  row.innerHTML = '';
  const color = game.turn;
  for (const m of opts) {
    const b = document.createElement('button');
    b.className = 'promoBtn ' + (color === 'w' ? 'pcw' : 'pcb');
    b.innerHTML = PIECES[m.promo.toLowerCase()];
    b.onclick = () => { sheet.classList.add('hidden'); doMove(m); };
    row.appendChild(b);
  }
  sheet.classList.remove('hidden');
}
$('promoSheet').addEventListener('pointerdown', e => { if (e.target === $('promoSheet')) $('promoSheet').classList.add('hidden'); });

/* input: tap-tap + drag */
function sqFromPoint(x, y) {
  const r = boardEl.getBoundingClientRect();
  if (x < r.left || x >= r.right || y < r.top || y >= r.bottom) return -1;
  const df = Math.floor((x - r.left) / (r.width / 8)), dr = Math.floor((y - r.top) / (r.height / 8));
  const f = flipped ? 7 - df : df, rr = flipped ? 7 - dr : dr;
  return rr * 8 + f;
}
boardEl.addEventListener('pointerdown', e => {
  if (!humanTurn() || thinking) return;
  const sq = sqFromPoint(e.clientX, e.clientY); if (sq < 0) return;
  const p = game.b[sq];
  if (selected >= 0 && sq !== selected && legalCache.some(m => m.from === selected && m.to === sq)) { tryMove(selected, sq); return; }
  if (p && (settings.mode === '2p' ? (p === p.toUpperCase() ? 'w' : 'b') === game.turn : (p === p.toUpperCase() ? 'w' : 'b') === humanSide)) {
    selected = sq; hintPair = null; render(); sfx('select');
    drag = { from: sq, ghost: null, x: e.clientX, y: e.clientY, moved: false };
  } else { selected = -1; render(); }
});
boardEl.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 9) return;
  if (!drag.ghost) {
    const src = boardEl.querySelector('[data-sq="' + drag.from + '"] .piece');
    if (!src) return;
    drag.ghost = src.cloneNode(true); drag.ghost.classList.add('dragGhost');
    document.body.appendChild(drag.ghost);
    src.style.opacity = '.35';
  }
  drag.moved = true;
  drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
});
function endDrag(e) {
  if (!drag) return;
  const wasDrag = drag.moved, from = drag.from;
  if (drag.ghost) {
    drag.ghost.remove();
    const src = boardEl.querySelector('[data-sq="' + from + '"] .piece'); if (src) src.style.opacity = '';
    const to = sqFromPoint(e.clientX, e.clientY);
    if (to >= 0 && to !== from) tryMove(from, to);
  }
  drag = null; if (!wasDrag) return;
}
boardEl.addEventListener('pointerup', endDrag);
boardEl.addEventListener('pointercancel', () => { if (drag && drag.ghost) { drag.ghost.remove(); const src = boardEl.querySelector('[data-sq="' + drag.from + '"] .piece'); if (src) src.style.opacity = ''; } drag = null; });

/* actions */
$('btnUndo').onclick = () => {
  if (thinking || !movesUci.length) return;
  const n = settings.mode === 'ai' ? Math.min(2, movesUci.length) : 1;
  for (let i = 0; i < n; i++) { S.undoMove(game); movesUci.pop(); }
  lastMove = null; selected = -1; game.over = null;
  // recompute lastMove marker from scratch
  refreshLegal(); render(); $('endSheet').classList.add('hidden');
};
$('btnHint').onclick = async () => {
  if (game.over || thinking) return;
  thinking = true; render();
  const res = await askAi('hint');
  thinking = false;
  if (res) { hintPair = res; helpUsed++; render(); setTimeout(() => { hintPair = null; render(); }, 1600); }
  else render();
};
$('btnFlip').onclick = () => { flipped = !flipped; buildBoard(); render(); };
function syncSoundBtn() { $('btnSound').textContent = soundOn ? 'Sound on' : 'Sound off'; }
$('btnSound').onclick = () => {
  soundOn = !soundOn;
  try { localStorage.setItem('chess_sound', soundOn ? '1' : '0'); } catch (e) {}
  syncSoundBtn(); if (soundOn) sfx('select');
};
/* In wide landscape the toolbar lives in the ledger column, under the moves;
   in portrait it sits back under the board. */
function placeActions() {
  const wide = window.matchMedia('(orientation: landscape) and (min-width: 700px)').matches;
  document.body.classList.toggle('wide', wide);
  const act = $('actions');
  if (wide) { if (act.parentElement !== $('panel')) $('panel').appendChild(act); }
  else if (act.parentElement !== $('boardZone')) $('boardZone').appendChild(act);
}
let rzT = null;
window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(placeActions, 120); });
$('btnResign').onclick = () => {
  if (game.over) return;
  if (!resignArmed) { resignArmed = true; $('btnResign').classList.add('armed'); $('btnResign').textContent = 'Sure?'; setTimeout(() => { resignArmed = false; $('btnResign').classList.remove('armed'); $('btnResign').textContent = 'Resign'; }, 2600); return; }
  const loser = settings.mode === 'ai' ? humanSide : game.turn;
  game.over = { result: loser === 'w' ? '0-1' : '1-0', reason: 'resign', text: (loser === 'w' ? 'White' : 'Black') + ' resigned' };
  render(); showEnd();
};
$('btnNew').onclick = () => { $('setup').classList.remove('hidden'); refreshContinue(); };

function showEnd() {
  const o = game.over; if (!o) return;
  $('endGlyph').innerHTML = PIECES[o.result === '1/2-1/2' ? 'k' : 'q'];
  $('endTitle').textContent = o.reason === 'checkmate' ? 'Checkmate' : o.reason === 'resign' ? 'Resigned' : 'Draw';
  let who = '';
  if (o.result === '1-0') who = 'White wins. ';
  if (o.result === '0-1') who = 'Black wins. ';
  let extra = '';
  if (settings.mode === 'ai' && o.result !== '1/2-1/2') {
    const youWon = (o.result === '1-0') === (humanSide === 'w');
    extra = youWon ? (helpUsed ? ' You used ' + helpUsed + ' hint' + (helpUsed > 1 ? 's' : '') + ' — a clean win with no help earns the full crown next time.' : ' And with no hints and no undos counted against you — a clean win.') : ' The ' + S.LEVELS[settings.level].name + ' opponent takes this one.';
  }
  let dailyTxt = '';
  if (daily && daily.date === todayStr()) {
    const res = o.result === '1/2-1/2' ? 'draw' : ((o.result === '1-0') === (humanSide === 'w') ? 'win' : 'loss');
    const entry = recordDaily(res);
    dailyTxt = " Today's challenge: " + (res === 'win' ? 'won' : res === 'draw' ? 'drawn' : 'lost') + ' against ' + S.LEVELS[daily.level].name + (entry.streak > 1 ? ' — day streak ' + entry.streak : '') + '.';
  }
  $('endText').textContent = who + o.text + '.' + extra + dailyTxt;
  setTimeout(() => $('endSheet').classList.remove('hidden'), 650);
}
$('btnRematch').onclick = () => { $('endSheet').classList.add('hidden'); startGame(settings); };
$('btnEndNew').onclick = () => { $('endSheet').classList.add('hidden'); $('setup').classList.remove('hidden'); refreshContinue(); };

/* setup sheet */
function segWire(id, fn) {
  $(id).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    for (const x of $(id).children) x.classList.toggle('on', x === b);
    fn(b.dataset.v);
  });
}
segWire('segMode', v => { settings.mode = v; $('grpLevel').style.opacity = v === 'ai' ? '1' : '.35'; $('grpLevel').style.pointerEvents = v === 'ai' ? '' : 'none'; });
segWire('segSide', v => { settings.side = v; });
segWire('segSet', v => applySet(v));
const lvList = $('levelList');
function buildLevels() {
  lvList.innerHTML = '';
  S.LEVELS.forEach((L, i) => {
    const b = document.createElement('button');
    b.className = 'levelBtn' + (i === settings.level ? ' on' : '');
    b.innerHTML = '<span class="lvGlyph pcg">' + PIECES[['p', 'n', 'r', 'q'][i]] + '</span><span><span class="lvName">' + L.name + '</span><span class="lvBlurb">' + L.blurb + '</span></span>';
    b.onclick = () => { settings.level = i; for (const x of lvList.children) x.classList.toggle('on', x === b); };
    lvList.appendChild(b);
  });
}
function startGame(cfg) {
  settings = Object.assign({}, cfg);
  humanSide = settings.mode === '2p' ? 'w' : settings.side === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : settings.side;
  game = S.parseFEN(S.START_FEN);
  movesUci = []; lastMove = null; selected = -1; hintPair = null; helpUsed = 0; thinking = false;
  flipped = settings.mode === 'ai' && humanSide === 'b';
  buildBoard(); refreshLegal(); render();
  $('setup').classList.add('hidden');
  setDownPieces();
  maybeAi();
}
/* The start, lit: light settles on the frame, pieces are set down back rank first. */
function setDownPieces() {
  try {
    $('boardFrame').animate([{ filter: 'brightness(1.14)' }, { filter: 'brightness(1)' }], { duration: 650, easing: 'ease-out' });
    const pcs = [...boardEl.querySelectorAll('.piece')];
    pcs.forEach((pc, i) => {
      pc.animate([
        { opacity: 0, transform: 'translateY(-9px) scale(.9)' },
        { opacity: 1, transform: 'translateY(-4%) scale(1)' }
      ], { duration: 300, delay: 40 + i * 16, easing: 'cubic-bezier(.2,.8,.3,1.15)', fill: 'backwards' });
    });
  } catch (e) {}
}
$('btnPlay').onclick = () => { daily = null; startGame(settings); };
$('btnDaily').onclick = () => { const p = dailyPairing(todayStr()); daily = p; startGame({ mode: 'ai', level: p.level, side: p.side }); };
function refreshContinue() {
  let has = false;
  try { has = !!localStorage.getItem('chess_save_v1'); } catch (e) {}
  $('btnContinue').classList.toggle('hidden', !has);
  refreshDailyLine();
}
$('btnContinue').onclick = () => {
  if (loadSave()) {
    buildBoard(); refreshLegal(); render();
    $('setup').classList.add('hidden');
    maybeAi();
  }
};
/* test hook */
window.__chess = { get game() { return game; }, get settings() { return settings; }, get pieceSet() { return pieceSetName; }, startGame, sim: S };
document.querySelector('.setupGlyph').innerHTML = PIECES.n;
document.querySelector('.setupGlyph').classList.add('pcg');
$('endGlyph').classList.add('pcg');
applySet(pieceSetName);
buildBoard(); refreshLegal(); render(); refreshContinue(); syncSoundBtn(); placeActions();
