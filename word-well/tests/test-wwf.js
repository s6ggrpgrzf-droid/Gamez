/* Word Well WWF engine headless tests. Run: node tests/test-wwf.js */
'use strict';
const WWF = require('../wwf.js');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name); }
}
function eq(a, b, name) { ok(a === b, name + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

/* small dictionary for fast unit tests */
const MINI = ['HELLO','HI','AT','TO','CAT','ACT','DOG','GO','DO','AD','AX','OX','EX','YEA','ANY','AN','IN','ON','NO','EAT','ATE','TEA','STARRED','QI','ZA','XU','QUIZ','WE','EW','EGO','IT','IF'];
WWF.setWords(MINI);

function mkTile(ch) {
  if (ch === ' ') return { ch: ' ', v: 0, blank: true };
  return { ch: ch, v: WWF.VALUES[ch], blank: false };
}
function mkRack(str) { return str.split('').map(mkTile); }
function fresh() { return WWF.newGame(12345); }
function setRack(st, p, str) { st.racks[p] = mkRack(str); }
function place(st, p, word, r, c, dir, blanks) {
  /* build placements for NEW tiles only; existing board letters are skipped */
  const rack = st.racks[p], used = new Array(rack.length).fill(false);
  const pl = [];
  for (let i = 0; i < word.length; i++) {
    const L = word[i];
    const br = dir === 'down' ? r + i : r, bc = dir === 'across' ? c + i : c;
    const cell = st.board[br][bc];
    if (cell) {
      if (cell.ch !== L) throw new Error('board mismatch at ' + br + ',' + bc + ': ' + cell.ch + ' vs ' + L);
      continue;
    }
    const isBlankPos = blanks && blanks.indexOf(i) >= 0;
    let fi = -1;
    for (let k = 0; k < rack.length; k++) {
      if (used[k]) continue;
      const t = rack[k];
      if (isBlankPos ? t.blank : (!t.blank && t.ch === L)) { fi = k; break; }
    }
    if (fi < 0) throw new Error('rack lacks ' + L + ' for ' + word);
    used[fi] = true;
    pl.push({ r: br, c: bc, tile: rack[fi], blankCh: isBlankPos ? L : null });
  }
  return WWF.applyMove(st, pl, dir);
}

/* ---- 1. board premium counts + symmetry ---- */
(function () {
  const counts = { TW: 0, DW: 0, TL: 0, DL: 0 };
  let sym = true;
  for (let r = 0; r < 15; r++) for (let c = 0; c < 15; c++) {
    const pr = WWF.PREMIUM[r][c];
    if (pr) counts[pr]++;
    if (WWF.PREMIUM[r][c] !== WWF.PREMIUM[14 - r][c] || WWF.PREMIUM[r][c] !== WWF.PREMIUM[r][14 - c]) sym = false;
  }
  eq(counts.TW, 8, 'TW count');
  eq(counts.DW, 17, 'DW count (incl star)');
  eq(counts.TL, 12, 'TL count');
  eq(counts.DL, 24, 'DL count');
  ok(sym, 'board symmetric on both axes');
  eq(WWF.PREMIUM[7][7], 'DW', 'star is DW');
})();

/* ---- 2. bag ---- */
(function () {
  let total = 0;
  for (const ch in WWF.DIST) total += WWF.DIST[ch];
  eq(total + 2, 104, 'bag = 104 tiles');
  eq(WWF.VALUES.Q, 10, 'Q=10'); eq(WWF.VALUES.Z, 10, 'Z=10');
  eq(WWF.VALUES.X, 8, 'X=8'); eq(WWF.VALUES.K, 5, 'K=5');
  eq(WWF.VALUES.B, 4, 'B=4'); eq(WWF.VALUES.H, 3, 'H=3');
  eq(WWF.VALUES.D, 2, 'D=2'); eq(WWF.VALUES.E, 1, 'E=1');
})();

/* ---- 3. newGame determinism ---- */
(function () {
  const a = WWF.newGame(999), b = WWF.newGame(999);
  eq(a.racks[0].map(t => t.ch).join(''), b.racks[0].map(t => t.ch).join(''), 'same seed same rack');
  eq(a.racks[0].length, 7, 'rack 7 tiles');
  eq(a.bag.length, 90, 'bag 90 after deal');
})();

/* ---- 4. first move scoring: HELLO across, L on star ---- */
(function () {
  const st = fresh(); setRack(st, 0, 'HELLOAB');
  const v = place(st, 0, 'HELLO', 7, 5, 'across');
  ok(v.ok, 'HELLO plays');
  eq(v.score, 18, 'HELLO = (3+1+2+2+1)*2 = 18 (WWF values: H=3 L=2)');
  eq(v.main, 'HELLO', 'main word');
  eq(st.scores[0], 18, 'score applied');
  eq(st.turn, 1, 'turn advances');
})();

/* ---- 5. illegal placements ---- */
(function () {
  let st = fresh(); setRack(st, 0, 'HELLOAB');
  let v = place(st, 0, 'HELLO', 0, 0, 'across');
  eq(v.ok, false, 'first move off star rejected');
  eq(v.error, 'star', 'star error code');

  st = fresh(); setRack(st, 0, 'HELLOAB');
  place(st, 0, 'HELLO', 7, 5, 'across');
  setRack(st, 1, 'DOGZXCV');
  v = place(st, 1, 'DOG', 0, 0, 'across');
  eq(v.error, 'loose', 'disconnected rejected');

  st = fresh(); setRack(st, 0, 'HELLOAB');
  const rack = st.racks[0];
  const pl = [
    { r: 7, c: 6, tile: rack[0], blankCh: null },
    { r: 8, c: 6, tile: rack[1], blankCh: null }
  ];
  v = WWF.applyMove(st, pl, 'across');
  eq(v.error, 'crooked', 'non-linear rejected');

  st = fresh(); setRack(st, 0, 'HELLOAB');
  place(st, 0, 'HELLO', 7, 5, 'across');
  setRack(st, 1, 'XZQJKVB');
  v = place(st, 1, 'XZQ', 7, 4, 'down');
  eq(v.ok, false, 'bad word rejected');
})();

/* ---- 6. cross-word scoring: HI down from H ---- */
(function () {
  const st = fresh(); setRack(st, 0, 'HELLOAB');
  place(st, 0, 'HELLO', 7, 5, 'across');
  setRack(st, 1, 'IXYZQJK');
  const v = place(st, 1, 'HI', 7, 5, 'down'); /* H existing, I new */
  ok(v.ok, 'HI plays');
  eq(v.score, 4, 'HI = 3+1, no premium at (8,5)');
})();

/* ---- 7. DL on new tile only ---- */
(function () {
  const st = fresh(); setRack(st, 0, 'EWABCDX');
  place(st, 0, 'EW', 7, 6, 'across'); /* E(7,6) W(7,7*) => (1+4)*2=10 */
  eq(st.scores[0], 10, 'EW first = 10');
  setRack(st, 1, 'GOXYZQJ');
  const v = place(st, 1, 'GO', 8, 6, 'down'); /* EGO: E old, G new on DL(8,6), O new */
  ok(v.ok, 'EGO plays');
  eq(v.score, 8, 'EGO = 1 + 3*2 + 1 = 8 (DL on new G only; G=3)');
})();

/* ---- 8. TL ---- */
(function () {
  const st = fresh(); setRack(st, 0, 'ATBCDEX');
  place(st, 0, 'AT', 6, 7, 'down'); /* A(6,7) T(7,7*) => 4 */
  setRack(st, 1, 'YEXYZQJ');
  let v = place(st, 1, 'YE', 6, 5, 'across'); /* YEA: Y(6,5). E(6,6 DL) A old => 3+2+1=6 */
  ok(v.ok, 'YEA plays'); eq(v.score, 6, 'YEA = 6');
  setRack(st, 0, 'ANBCDEX');
  v = place(st, 0, 'AN', 4, 5, 'down'); /* ANY: A(4,5) N(5,5 TL) Y old => 1+6+3=10 */
  ok(v.ok, 'ANY plays'); eq(v.score, 10, 'ANY = 10 with TL (N=2)');
})();

/* ---- 9. TW ---- */
(function () {
  const st = fresh();
  st.firstDone = true;
  st.board[1][7] = { ch: 'A', v: 1, blank: false };
  st.board[2][7] = { ch: 'T', v: 1, blank: false };
  setRack(st, 0, 'EXYZQJK');
  const v = place(st, 0, 'E', 0, 7, 'down'); /* EAT with E on TW(0,7) => 9 */
  ok(v.ok, 'E on TW plays'); eq(v.score, 9, 'EAT = (1+1+1)*3 = 9');
})();

/* ---- 10. bingo ---- */
(function () {
  const st = fresh(); setRack(st, 0, 'STARRED');
  const v = place(st, 0, 'STARRED', 7, 4, 'across');
  ok(v.ok, 'STARRED plays');
  eq(v.bingo, true, 'bingo flagged');
  eq(v.score, 51, 'STARRED = 8*2 + 35 = 51');
})();

/* ---- 11. blank tile ---- */
(function () {
  const st = fresh(); setRack(st, 0, 'Q   ABCD'.replace(/ /g, '')); /* no blank; build manually */
  st.racks[0] = [mkTile('Q'), mkTile(' '), mkTile('A'), mkTile('B'), mkTile('C'), mkTile('D'), mkTile('E')];
  const v = place(st, 0, 'QI', 7, 6, 'across', [1]); /* blank as I */
  ok(v.ok, 'blank QI plays');
  eq(v.score, 20, 'QI = (10 + 0) * 2 = 20');
})();

/* ---- 12. swap / pass / end by passes ---- */
(function () {
  const st = fresh();
  const before = st.bag.length;
  const r = WWF.swapTiles(st, 0, [0, 1, 2]);
  ok(r.ok, 'swap ok');
  eq(st.turn, 1, 'swap loses turn');
  eq(st.racks[0].length, 7, 'rack refilled');
  eq(st.bag.length, before, 'bag count stable after swap');
  st.bag = st.bag.slice(0, 5);
  const r2 = WWF.swapTiles(st, 1, [0]);
  eq(r2.ok, false, 'swap rejected when bag < 7');

  const st2 = fresh();
  for (let i = 0; i < 6; i++) WWF.passTurn(st2);
  ok(st2.over, '6 passes ends game');

  const st3 = fresh();
  const r3 = WWF.swapTiles(st3, 0, [0, 1], true);
  ok(r3.ok && st3.turn === 0, 'swap+ keeps turn');
  eq(st3.scoreless, 0, 'swap+ not scoreless');
})();

/* ---- 13. end by empty rack + leftover scoring ---- */
(function () {
  const st = fresh();
  st.bag = [];
  st.firstDone = true;
  st.board[7][7] = { ch: 'A', v: 1, blank: false };
  st.racks[0] = [mkTile('T')];
  st.racks[1] = [mkTile('Z'), mkTile('Q')];
  const v = place(st, 0, 'T', 7, 8, 'across');
  ok(v.ok, 'final T plays');
  ok(st.over, 'game over on empty rack + empty bag');
  eq(st.winner, 0, 'player 0 wins');
  eq(st.scores[0], 22, 'finisher: 2 + 20 leftover');
  eq(st.scores[1], -20, 'opponent: 0 - 20 leftover');
})();

/* ---- 14. candidateWords ---- */
(function () {
  const c = WWF.candidateWords(WWF._trie, mkRack('CAT'), 500).map(x => x.w);
  ok(c.indexOf('CAT') >= 0 && c.indexOf('ACT') >= 0, 'CAT/ACT found');
})();

/* ---- 15. findMoves first move covers star ---- */
(function () {
  const st = fresh(); setRack(st, 0, 'CATDOGX');
  const moves = WWF.findMoves(st, 0, { wordCap: 400 });
  ok(moves.length > 0, 'first-move candidates exist');
  ok(moves.every(m => m.placements.some(p => p.r === 7 && p.c === 7)), 'all cover star');
  ok(moves.every(m => m.score > 0), 'all score');
})();

/* ---- 16. full-dictionary bot legality (mid-game board) ---- */
(function () {
  global.window = global.window || {};
  for (let i = 1; i <= 6; i++) require('../dict-' + i + '.js');
  const raw = global.window.WW_DICT.join('');
  const buf = Buffer.from(raw, 'base64');
  const words = require('zlib').gunzipSync(buf).toString().split('\n');
  const nn = WWF.setWords(words);
  ok(nn > 300000, 'full trie built (' + nn + ' nodes)');
  ok(WWF.hasWord('HELLO') && !WWF.hasWord('XYZQJ'), 'dict sanity');
  const st = WWF.newGame(20261008);
  /* play a few bot-vs-bot turns */
  let guard = 0;
  while (!st.over && guard++ < 12) {
    const mv = WWF.botMove(st, st.turn, 'medium', WWF.mulberry32(1000 + guard));
    if (mv.type === 'play') {
      const v = WWF.validatePlacement(st, mv.placements, mv.dir);
      ok(v.ok, 'bot move validates (turn ' + guard + ')');
      WWF.applyMove(st, mv.placements, mv.dir);
    } else if (mv.type === 'swap') WWF.swapTiles(st, st.turn, mv.idxs);
    else WWF.passTurn(st);
  }
  ok(guard > 3, 'bot game progressed (' + guard + ' turns, scores ' + st.scores.join('/') + ')');
  for (const d of ['easy', 'hard']) {
    const st2 = WWF.newGame(777);
    const mv = WWF.botMove(st2, 0, d, WWF.mulberry32(42));
    ok(mv.type === 'play' && WWF.validatePlacement(st2, mv.placements, mv.dir).ok, d + ' bot opening legal');
  }
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
