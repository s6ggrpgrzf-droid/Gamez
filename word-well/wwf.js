/* Word Well — Words-With-Friends-style crossword engine.
 * PURE SIM: no DOM, no Math.random. Seeded mulberry32 PRNG.
 * Works in node (module.exports) and browsers (global WWF).
 *
 * Board: 15x15. Premium codes: TW triple word, DW double word,
 * TL triple letter, DL double letter, * = center star (counts as DW).
 * Tile bag: 104 tiles, WWF distribution + values. Bingo +35.
 */
(function () {
'use strict';

var N = 15;
var BINGO = 35;
var RACK_N = 7;

/* Premium layout rows. T=TW W=DW t=TL d=DL *=star(DW) .=none */
var PREMIUM_ROWS = [
  "T..d...T...d..T",
  ".W...t...t...W.",
  "..W...d.d...W..",
  "d..W...d...W..d",
  "....W.....W....",
  ".t...t...t...t.",
  "..d...d.d...d..",
  "T..d...*...d..T",
  "..d...d.d...d..",
  ".t...t...t...t.",
  "....W.....W....",
  "d..W...d...W..d",
  "..W...d.d...W..",
  ".W...t...t...W.",
  "T..d...T...d..T"
];

var PREMIUM = PREMIUM_ROWS.map(function (row) {
  return row.split('').map(function (ch) {
    if (ch === 'T') return 'TW';
    if (ch === 'W') return 'DW';
    if (ch === 't') return 'TL';
    if (ch === 'd') return 'DL';
    if (ch === '*') return 'DW';
    return '';
  });
});

var DIST = { A:9,B:2,C:2,D:5,E:13,F:2,G:3,H:4,I:8,J:1,K:1,L:4,M:2,N:5,O:8,P:2,Q:1,R:6,S:5,T:7,U:4,V:2,W:2,X:1,Y:2,Z:1 };
var VALUES = { A:1,E:1,I:1,O:1,R:1,S:1,T:1,
               D:2,L:2,N:2,U:2,
               G:3,H:3,Y:3,
               B:4,C:4,F:4,M:4,P:4,W:4,
               K:5,V:5,
               X:8,
               J:10,Q:10,Z:10 };

/* ---------------- PRNG ---------------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(str) {
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ---------------- compact trie (flattened, ~7MB for 173k words) ---------------- */
function buildTrie(words) {
  var next = [Object.create(null)];
  var end = [0];
  for (var wi = 0; wi < words.length; wi++) {
    var w = words[wi], n = 0;
    for (var i = 0; i < w.length; i++) {
      var ch = w[i], c = next[n][ch];
      if (c === undefined) {
        c = next.length;
        next[n][ch] = c;
        next.push(Object.create(null));
        end.push(0);
      }
      n = c;
    }
    end[n] = 1;
  }
  var NN = next.length;
  var childStart = new Int32Array(NN + 1);
  var total = 0, n2;
  for (n2 = 0; n2 < NN; n2++) { childStart[n2] = total; total += Object.keys(next[n2]).length; }
  childStart[NN] = total;
  var childData = new Int32Array(total * 2);
  var isEnd = new Uint8Array(NN);
  var cur = new Int32Array(NN);
  for (n2 = 0; n2 < NN; n2++) cur[n2] = childStart[n2];
  for (n2 = 0; n2 < NN; n2++) {
    isEnd[n2] = end[n2];
    for (var k in next[n2]) {
      var p = cur[n2]++;
      childData[p * 2] = k.charCodeAt(0);
      childData[p * 2 + 1] = next[n2][k];
    }
  }
  return { n: NN, cs: childStart, cd: childData, end: isEnd };
}
function trieChild(t, node, code) {
  var cd = t.cd;
  for (var p = t.cs[node]; p < t.cs[node + 1]; p++) {
    if (cd[p * 2] === code) return cd[p * 2 + 1];
  }
  return -1;
}
function trieHas(t, word) {
  var n = 0;
  for (var i = 0; i < word.length; i++) {
    n = trieChild(t, n, word.charCodeAt(i));
    if (n < 0) return false;
  }
  return t.end[n] === 1;
}

/* ---------------- game state ---------------- */
function emptyBoard() {
  var b = new Array(N);
  for (var r = 0; r < N; r++) { b[r] = new Array(N); for (var c = 0; c < N; c++) b[r][c] = null; }
  return b;
}
function buildBag() {
  var bag = [];
  for (var ch in DIST) {
    for (var i = 0; i < DIST[ch]; i++) bag.push({ ch: ch, v: VALUES[ch], blank: false });
  }
  bag.push({ ch: ' ', v: 0, blank: true });
  bag.push({ ch: ' ', v: 0, blank: true });
  return bag;
}
function newGame(seed) {
  var rng = mulberry32(seed >>> 0);
  var bag = buildBag();
  for (var i = bag.length - 1; i > 0; i--) {
    var j = (rng() * (i + 1)) | 0;
    var t = bag[i]; bag[i] = bag[j]; bag[j] = t;
  }
  var st = {
    seed: seed >>> 0, rs: (seed >>> 0) ^ 0x9E3779B9,
    board: emptyBoard(), bag: bag,
    racks: [[], []], scores: [0, 0], turn: 0,
    scoreless: 0, over: false, winner: -1, finisher: -1,
    firstDone: false, moves: 0, lastMove: null, passes: [0, 0]
  };
  drawTiles(st, 0, RACK_N);
  drawTiles(st, 1, RACK_N);
  return st;
}
function rnd(st) {
  var a = st.rs | 0;
  a = (a + 0x6D2B79F5) | 0;
  st.rs = a;
  var t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function drawTiles(st, p, n) {
  var rack = st.racks[p];
  while (n-- > 0 && st.bag.length && rack.length < RACK_N) rack.push(st.bag.pop());
}
function rackValue(rack) {
  var s = 0;
  for (var i = 0; i < rack.length; i++) s += rack[i].v;
  return s;
}

/* ---------------- validation + scoring ---------------- */
function err(code, msg) { return { ok: false, error: code, message: msg }; }

function validatePlacement(st, placements, dir) {
  var trie = WWF._trie;
  if (!trie) return err('no-dict', 'dictionary not loaded');
  if (st.over) return err('over', 'game is over');
  var n = placements.length;
  if (!n) return err('empty', 'no tiles placed');
  if (n > RACK_N) return err('too-many', 'more than 7 tiles');
  var dr = dir === 'down' ? 1 : 0, dc = dir === 'down' ? 0 : 1;
  var seen = {}, i, p;
  for (i = 0; i < n; i++) {
    p = placements[i];
    if (p.r < 0 || p.r >= N || p.c < 0 || p.c >= N) return err('bounds', 'off the board');
    if (st.board[p.r][p.c]) return err('occupied', 'cell is taken');
    var perp = dr ? p.c : p.r;
    var along = dr ? p.r : p.c;
    if (i === 0) { var line = perp; }
    else if (perp !== line) return err('crooked', 'tiles must form one straight line');
    if (!p.tile) return err('no-tile', 'missing tile');
    var key = p.r + ',' + p.c;
    if (seen[key]) return err('dup', 'two tiles on one cell');
    seen[key] = 1;
    if (p.tile.blank && !p.blankCh) return err('blank', 'blank tile needs a letter');
  }
  var coords = placements.map(function (q) { return dr ? q.r : q.c; }).sort(function (a, b) { return a - b; });
  var fixed = line;
  function cellAt(a) { return dr ? st.board[a][fixed] : st.board[fixed][a]; }
  function newAt(a) {
    for (var k = 0; k < n; k++) { var q = placements[k]; if ((dr ? q.r : q.c) === a) return q; }
    return null;
  }
  /* extend span over existing tiles */
  var a0 = coords[0], b0 = coords[n - 1], a = a0, b = b0;
  while (a > 0 && cellAt(a - 1)) a--;
  while (b < N - 1 && cellAt(b + 1)) b++;
  /* every cell in span must be filled */
  for (i = a; i <= b; i++) { if (!cellAt(i) && !newAt(i)) return err('gap', 'tiles must connect without gaps'); }
  function letterAt(k) {
    var q = newAt(k);
    if (q) return q.tile.blank ? q.blankCh : q.tile.ch;
    return cellAt(k).ch;
  }
  var mainWord = '';
  for (i = a; i <= b; i++) mainWord += letterAt(i);
  var words = [], total = 0;
  function premiumAt(r, c) { return PREMIUM[r][c]; }
  function scoreSpan(cells) {
    /* cells: [{r,c,tile,isNew}] */
    var ls = 0, wm = 1, k2;
    for (k2 = 0; k2 < cells.length; k2++) {
      var cc = cells[k2], lv = cc.tile.v, pr = cc.isNew ? premiumAt(cc.r, cc.c) : '';
      if (pr === 'DL') lv *= 2; else if (pr === 'TL') lv *= 3;
      ls += lv;
      if (pr === 'DW') wm *= 2; else if (pr === 'TW') wm *= 3;
    }
    return ls * wm;
  }
  function spanCells(aa, bb, isMain) {
    var out = [];
    for (var k = aa; k <= bb; k++) {
      var q = newAt(k);
      var r = dr ? k : fixed, c = dr ? fixed : k;
      if (q) out.push({ r: r, c: c, tile: { ch: q.tile.blank ? q.blankCh : q.tile.ch, v: q.tile.v, blank: q.tile.blank }, isNew: true });
      else { var t = cellAt(k); out.push({ r: r, c: c, tile: t, isNew: false }); }
    }
    return out;
  }
  var formedAny = false;
  if (mainWord.length >= 2) {
    if (!trieHas(trie, mainWord)) return err('word', mainWord + ' is not in the well dictionary');
    total += scoreSpan(spanCells(a, b, true));
    words.push({ word: mainWord, main: true });
    formedAny = true;
  }
  /* cross words at each new tile */
  for (i = 0; i < n; i++) {
    p = placements[i];
    var pa = dr ? p.c : p.r, pr2 = dr ? p.r : p.c;
    function cCell(k) { return dr ? st.board[pr2][k] : st.board[k][pa]; }
    var x0 = pa, x1 = pa;
    while (x0 > 0 && cCell(x0 - 1)) x0--;
    while (x1 < N - 1 && cCell(x1 + 1)) x1++;
    if (x1 - x0 + 1 >= 2) {
      var cw = '';
      for (var k = x0; k <= x1; k++) {
        if (k === pa) cw += p.tile.blank ? p.blankCh : p.tile.ch;
        else cw += cCell(k).ch;
      }
      if (!trieHas(trie, cw)) return err('word', cw + ' is not in the well dictionary');
      var xc = [];
      for (k = x0; k <= x1; k++) {
        var rr = dr ? pr2 : k, cc2 = dr ? k : pa;
        if (k === pa) xc.push({ r: rr, c: cc2, tile: { ch: p.tile.blank ? p.blankCh : p.tile.ch, v: p.tile.v, blank: p.tile.blank }, isNew: true });
        else xc.push({ r: rr, c: cc2, tile: cCell(k), isNew: false });
      }
      total += scoreSpan(xc);
      words.push({ word: cw, main: false });
      formedAny = true;
    }
  }
  if (!formedAny) return err('short', 'words must be at least 2 letters');
  /* first move must cover the star */
  if (!st.firstDone) {
    var covers = false;
    for (i = a; i <= b; i++) { var rr = dr ? i : fixed, cc3 = dr ? fixed : i; if (rr === 7 && cc3 === 7) covers = true; }
    if (!covers) return err('star', 'first word must cover the glowing star');
    if (mainWord.length < 2) return err('short', 'first word must be at least 2 letters');
  } else {
    /* must connect to existing tiles */
    var connected = false;
    for (i = a; i <= b; i++) { if (cellAt(i) && !newAt(i)) { connected = true; break; } }
    if (!connected) {
      for (i = 0; i < n; i++) {
        p = placements[i];
        if ((p.r > 0 && st.board[p.r - 1][p.c]) || (p.r < N - 1 && st.board[p.r + 1][p.c]) ||
            (p.c > 0 && st.board[p.r][p.c - 1]) || (p.c < N - 1 && st.board[p.r][p.c + 1])) { connected = true; break; }
      }
    }
    if (!connected) return err('loose', 'words must connect to the well');
  }
  var bingo = (n === RACK_N);
  if (bingo) total += BINGO;
  return { ok: true, score: total, words: words, bingo: bingo, main: mainWord };
}

function removeTile(rack, tile) {
  for (var i = 0; i < rack.length; i++) if (rack[i] === tile) { rack.splice(i, 1); return true; }
  return false;
}

function applyMove(st, placements, dir) {
  var v = validatePlacement(st, placements, dir);
  if (!v.ok) return v;
  var player = st.turn, rack = st.racks[player], i;
  for (i = 0; i < placements.length; i++) {
    var p = placements[i];
    st.board[p.r][p.c] = { ch: p.tile.blank ? p.blankCh : p.tile.ch, v: p.tile.v, blank: p.tile.blank, own: player };
    removeTile(rack, p.tile);
  }
  st.scores[player] += v.score;
  st.firstDone = true;
  st.moves++;
  st.scoreless = (v.score > 0) ? 0 : st.scoreless + 1;
  st.lastMove = { player: player, dir: dir, score: v.score, words: v.words, bingo: v.bingo,
                  cells: placements.map(function (p) { return { r: p.r, c: p.c, ch: p.tile.blank ? p.blankCh : p.tile.ch }; }) };
  if (rack.length === 0 && st.bag.length === 0) {
    endGame(st, player);
  } else {
    drawTiles(st, player, RACK_N - rack.length);
    st.turn = 1 - player;
    if (st.scoreless >= 6) endGame(st, -1);
  }
  return v;
}

function swapTiles(st, player, idxs, keepTurn) {
  if (st.over) return err('over', 'game is over');
  if (st.turn !== player) return err('turn', 'not your turn');
  if (!idxs || !idxs.length) return err('empty', 'choose tiles to swap');
  if (st.bag.length < 7) return err('bag', 'the well is too low to swap');
  var rack = st.racks[player], tiles = [], i;
  var seen = {};
  for (i = 0; i < idxs.length; i++) {
    var ix = idxs[i];
    if (ix < 0 || ix >= rack.length || seen[ix]) return err('idx', 'bad tile choice');
    seen[ix] = 1; tiles.push(rack[ix]);
  }
  for (i = 0; i < tiles.length; i++) removeTile(rack, tiles[i]);
  drawTiles(st, player, tiles.length);
  for (i = 0; i < tiles.length; i++) st.bag.push(tiles[i]);
  for (i = st.bag.length - 1; i > 0; i--) {
    var j = (rnd(st) * (i + 1)) | 0, t = st.bag[i];
    st.bag[i] = st.bag[j]; st.bag[j] = t;
  }
  if (!keepTurn) st.scoreless++;
  st.moves++;
  st.lastMove = { player: player, dir: 'swap', score: 0, words: [], swap: tiles.length };
  st.turn = keepTurn ? player : 1 - player;
  if (!keepTurn && st.scoreless >= 6) endGame(st, -1);
  return { ok: true, swapped: tiles.length };
}

function passTurn(st) {
  if (st.over) return err('over', 'game is over');
  var player = st.turn;
  st.scoreless++;
  st.moves++;
  st.passes[player]++;
  st.lastMove = { player: player, dir: 'pass', score: 0, words: [] };
  st.turn = 1 - player;
  if (st.scoreless >= 6) endGame(st, -1);
  return { ok: true };
}

function endGame(st, finisher) {
  st.over = true;
  st.finisher = finisher;
  if (finisher >= 0) {
    for (var p = 0; p < 2; p++) {
      if (p === finisher) continue;
      var pen = rackValue(st.racks[p]);
      st.scores[p] -= pen;
      st.scores[finisher] += pen;
      st.racks[p] = [];
    }
  }
  st.winner = st.scores[0] === st.scores[1] ? -1 : (st.scores[0] > st.scores[1] ? 0 : 1);
}

/* ---------------- move generation ---------------- */
function anchors(st) {
  if (!st.firstDone) return [{ r: 7, c: 7, first: true }];
  var out = [], seen = {}, r, c;
  for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
    if (!st.board[r][c]) continue;
    var nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]], k;
    for (k = 0; k < 4; k++) {
      var nr = nb[k][0], nc = nb[k][1];
      if (nr < 0 || nr >= N || nc < 0 || nc >= N || st.board[nr][nc]) continue;
      var key = nr + ',' + nc;
      if (!seen[key]) { seen[key] = 1; out.push({ r: nr, c: nc }); }
    }
  }
  return out;
}

/* all distinct dictionary words (len 1..7) formable from rack tiles */
function candidateWords(trie, rack, cap) {
  var counts = {}, blanks = 0, i;
  for (i = 0; i < rack.length; i++) {
    var t = rack[i];
    if (t.blank) blanks++;
    else counts[t.ch] = (counts[t.ch] || 0) + 1;
  }
  var out = [], seen = {}, visits = 0;
  var MAXV = 600000;
  (function dfs(node, cur, bpos) {
    if (++visits > MAXV || out.length >= cap) return;
    if (trie.end[node] && cur.length >= 1 && !seen[cur]) {
      seen[cur] = 1;
      out.push({ w: cur, b: bpos.slice() });
    }
    if (cur.length >= RACK_N || out.length >= cap) return;
    var cs = trie.cs, cd = trie.cd;
    for (var p = cs[node]; p < cs[node + 1]; p++) {
      if (out.length >= cap || visits > MAXV) return;
      var L = String.fromCharCode(cd[p * 2]), child = cd[p * 2 + 1];
      if (counts[L] > 0) { counts[L]--; dfs(child, cur + L, bpos); counts[L]++; }
      else if (blanks > 0) { blanks--; bpos.push(cur.length); dfs(child, cur + L, bpos); bpos.pop(); blanks++; }
    }
  })(0, '', []);
  return out;
}

/* assign actual rack tile objects to a candidate word at a board position */
function assignTiles(rack, cand) {
  var used = new Array(rack.length).fill(false);
  var tiles = [], blanksAt = {};
  for (var i = 0; i < cand.b.length; i++) blanksAt[cand.b[i]] = 1;
  for (i = 0; i < cand.w.length; i++) {
    var L = cand.w[i], found = -1;
    for (var k = 0; k < rack.length; k++) {
      if (used[k]) continue;
      var t = rack[k];
      if (blanksAt[i] ? t.blank : (!t.blank && t.ch === L)) { found = k; break; }
    }
    if (found < 0) return null;
    used[found] = true;
    tiles.push({ tile: rack[found], blankCh: blanksAt[i] ? L : null });
  }
  return tiles;
}

function findMoves(st, player, opts) {
  opts = opts || {};
  var trie = WWF._trie;
  if (!trie || st.over) return [];
  var wordCap = opts.wordCap || 1500;
  var placeCap = opts.placeCap || 60000;
  var rack = st.racks[player];
  var cands = candidateWords(trie, rack, wordCap);
  var moves = [], checked = 0;
  var dirs = ['across', 'down'];
  if (!st.firstDone) {
    for (var ci = 0; ci < cands.length; ci++) {
      var cw = cands[ci];
      if (cw.w.length < 2) continue;
      for (var di = 0; di < 2; di++) {
        var dir = dirs[di];
        for (var k = 0; k < cw.w.length; k++) {
          var r = dir === 'down' ? 7 - k : 7;
          var c = dir === 'across' ? 7 - k : 7;
          if (r < 0 || c < 0 || (dir === 'down' ? r + cw.w.length > N : c + cw.w.length > N)) continue;
          var at = assignTiles(rack, cw);
          if (!at) continue;
          var pl = [];
          for (var i2 = 0; i2 < cw.w.length; i2++) {
            pl.push({ r: dir === 'down' ? r + i2 : r, c: dir === 'across' ? c + i2 : c,
                      tile: at[i2].tile, blankCh: at[i2].blankCh });
          }
          var v = validatePlacement(st, pl, dir);
          if (v.ok) moves.push({ placements: pl, dir: dir, score: v.score, words: v.words, bingo: v.bingo });
          if (++checked >= placeCap) return moves;
        }
      }
    }
    return moves;
  }
  var anchs = anchors(st);
  for (var ai = 0; ai < anchs.length; ai++) {
    var a = anchs[ai];
    for (var dj = 0; dj < 2; dj++) {
      var d2 = dirs[dj], ddr = d2 === 'down' ? 1 : 0, dcc = d2 === 'down' ? 0 : 1;
      for (var cj = 0; cj < cands.length; cj++) {
        var cd2 = cands[cj], L2 = cd2.w.length;
        for (var kk = 0; kk < L2; kk++) {
          var sr = a.r - ddr * kk, sc = a.c - dcc * kk;
          var er = sr + ddr * (L2 - 1), ec = sc + dcc * (L2 - 1);
          if (sr < 0 || sc < 0 || er >= N || ec >= N) continue;
          /* quick pattern check */
          var at2 = assignTiles(rack, cd2);
          if (!at2) continue;
          var okp = true, newCount = 0;
          for (var q = 0; q < L2; q++) {
            var rr = sr + ddr * q, ccq = sc + dcc * q;
            var cell = st.board[rr][ccq];
            if (cell) { if (cell.ch !== cd2.w[q]) { okp = false; break; } }
            else newCount++;
          }
          if (!okp || newCount === 0 || newCount > RACK_N) continue;
          var pl2 = [];
          for (q = 0; q < L2; q++) {
            rr = sr + ddr * q; ccq = sc + dcc * q;
            if (!st.board[rr][ccq]) pl2.push({ r: rr, c: ccq, tile: at2[q].tile, blankCh: at2[q].blankCh });
          }
          var v2 = validatePlacement(st, pl2, d2);
          if (v2.ok) moves.push({ placements: pl2, dir: d2, score: v2.score, words: v2.words, bingo: v2.bingo });
          if (++checked >= placeCap) return moves;
        }
      }
    }
  }
  return moves;
}

function botMove(st, player, difficulty, rng) {
  rng = rng || Math.random;
  var easy = difficulty === 'easy';
  var moves = findMoves(st, player, { wordCap: easy ? 250 : 1500, placeCap: easy ? 8000 : 60000 });
  if (!moves.length) {
    var rack = st.racks[player];
    if (st.bag.length >= 7 && rack.length > 0) {
      var idxs = [];
      for (var i = 0; i < rack.length; i++) idxs.push(i);
      return { type: 'swap', idxs: idxs };
    }
    return { type: 'pass' };
  }
  moves.sort(function (x, y) { return y.score - x.score; });
  var pick;
  if (difficulty === 'hard') {
    var top = moves[0].score, tied = moves.filter(function (m) { return m.score === top; });
    pick = tied[(rng() * tied.length) | 0];
  } else if (difficulty === 'medium') {
    var half = Math.max(1, (moves.length / 2) | 0);
    pick = moves[(rng() * half) | 0];
  } else {
    pick = moves[(rng() * moves.length) | 0];
  }
  return { type: 'play', placements: pick.placements, dir: pick.dir };
}

/* ---------------- public API ---------------- */
var WWF = {
  N: N, BINGO: BINGO, RACK_N: RACK_N,
  PREMIUM: PREMIUM, DIST: DIST, VALUES: VALUES,
  _trie: null,
  setWords: function (words) { WWF._trie = buildTrie(words); return WWF._trie.n; },
  hasWord: function (w) { return WWF._trie ? trieHas(WWF._trie, w) : false; },
  mulberry32: mulberry32,
  hashSeed: hashSeed,
  newGame: newGame,
  drawTiles: drawTiles,
  validatePlacement: validatePlacement,
  applyMove: applyMove,
  swapTiles: swapTiles,
  passTurn: passTurn,
  anchors: anchors,
  candidateWords: candidateWords,
  findMoves: findMoves,
  botMove: botMove
};

if (typeof module !== 'undefined' && module.exports) module.exports = WWF;
else this.WWF = WWF;
}).call(typeof window !== 'undefined' ? window : this);
