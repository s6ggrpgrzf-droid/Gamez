
/* Dominoes sim — pure game logic, no DOM.
 * Classic Draw rules: double-six, 2 players, 7 tiles each, boneyard draws,
 * highest double opens, race to 100. Seeded PRNG (mulberry32) throughout.
 * (Also kept verbatim at ../sim.js so node tests run against this code.) */
'use strict';

function rngNext(st) {
  st.rngS = (st.rngS + 0x6D2B79F5) | 0;
  let t = Math.imul(st.rngS ^ (st.rngS >>> 15), 1 | st.rngS);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function mulberry32(seed) {
  const box = { rngS: seed >>> 0 };
  return function () { return rngNext(box); };
}

function newSet() {
  const tiles = [];
  for (let a = 0; a <= 6; a++)
    for (let b = a; b <= 6; b++) tiles.push({ a, b });
  return tiles; // 28 tiles, a <= b
}

function pips(t) { return t.a + t.b; }
function handPips(hand) { return hand.reduce((s, t) => s + pips(t), 0); }
function tileKey(t) { return t.a + '-' + t.b; }

function shuffled(set, st) {
  const d = set.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rngNext(st) * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/* Board node: {id, a, b, headVal} — headVal is the pip value of the half
 * facing the head (left) end of the chain. Tail value = a + b - headVal.
 * board[0] is the head-most tile, board[n-1] the tail-most. */
let _nextId = 1;
function nodeId() { return _nextId++; }

function exposed(state) {
  const b = state.board;
  if (!b.length) return { head: -1, tail: -1 };
  const h = b[0], t = b[b.length - 1];
  return { head: h.headVal, tail: t.a + t.b - t.headVal };
}

function legalMoves(hand, ends) {
  const moves = [];
  for (let i = 0; i < hand.length; i++) {
    const t = hand[i];
    if (t.a === ends.head || t.b === ends.head) moves.push({ tileIdx: i, end: 'head' });
    if (t.a === ends.tail || t.b === ends.tail) moves.push({ tileIdx: i, end: 'tail' });
  }
  return moves;
}

function canPlay(state, player) {
  return legalMoves(state.hands[player], exposed(state)).length > 0;
}

function newGame(seed, target, mode) {
  _nextId = 1;
  const st = {
    rngS: (seed == null ? (Date.now() % 2147483647) : seed) >>> 0,
    target: target || 100, round: 1,
    mode: mode === 'fives' ? 'fives' : 'draw',
    scores: [0, 0],           // [you, house]
    hands: [[], []], boneyard: [], board: [],
    turn: 0, phase: 'play', passes: 0,
    winner: null, roundPts: 0, roundReason: null,
    knockSuits: { player: -1, suits: [] },
    drawnOn: [[], []],        // pip values each player has drawn on (Shark's memory)
    fives: [0, 0],            // points scored from multiples of 5 this round
    lastEvents: [],
  };
  dealRound(st);
  return st;
}

function highestOpener(hands) {
  let best = null;
  for (let p = 0; p < 2; p++) {
    for (let i = 0; i < hands[p].length; i++) {
      const t = hands[p][i];
      const score = (t.a === t.b ? 100 : 0) + t.a + t.b;
      const tiebreak = Math.max(t.a, t.b);
      if (!best || score > best.score || (score === best.score && tiebreak > best.tiebreak))
        best = { player: p, tileIdx: i, score, tiebreak };
    }
  }
  return best;
}

function dealRound(st) {
  const deck = shuffled(newSet(), st);
  st.hands = [[], []];
  for (let i = 0; i < 7; i++) { st.hands[0].push(deck.pop()); st.hands[1].push(deck.pop()); }
  st.boneyard = deck;
  st.board = [];
  st.passes = 0;
  st.winner = null; st.roundPts = 0; st.roundReason = null;
  st.knockSuits = { player: -1, suits: [] };
  st.drawnOn = [[], []];
  st.fives = [0, 0];
  st.phase = 'play';
  const op = highestOpener(st.hands);
  const tile = st.hands[op.player].splice(op.tileIdx, 1)[0];
  st.board.push({ id: nodeId(), a: tile.a, b: tile.b, headVal: tile.a, opener: true });
  st.turn = 1 - op.player;
  const openEv = { t: 'open', player: op.player, tile: { a: tile.a, b: tile.b }, nodeId: st.board[0].id };
  if (st.mode === 'fives' && (tile.a + tile.b) % 5 === 0) {
    st.fives[op.player] += tile.a + tile.b;
    openEv.fives = tile.a + tile.b;
  }
  st.lastEvents = [openEv];
}

function playTile(st, player, tileIdx, end) {
  st.lastEvents = [];
  if (st.phase !== 'play') return { ok: false, err: 'not-playing' };
  if (player !== st.turn) return { ok: false, err: 'not-your-turn' };
  const hand = st.hands[player];
  if (tileIdx < 0 || tileIdx >= hand.length) return { ok: false, err: 'bad-tile' };
  const ends = exposed(st);
  const t = hand[tileIdx];
  const ev = end === 'head' ? ends.head : end === 'tail' ? ends.tail : -1;
  if (ev < 0 || (t.a !== ev && t.b !== ev)) return { ok: false, err: 'no-match' };
  hand.splice(tileIdx, 1);
  const headVal = end === 'tail' ? ev : (t.a + t.b - ev);
  const node = { id: nodeId(), a: t.a, b: t.b, headVal };
  if (end === 'tail') st.board.push(node); else st.board.unshift(node);
  st.passes = 0;
  const pEv = { t: 'play', player, tile: { a: t.a, b: t.b }, end, nodeId: node.id };
  if (st.mode === 'fives') {
    const e2 = exposed(st);
    const sum = e2.head + e2.tail;
    if (sum > 0 && sum % 5 === 0) {
      st.fives[player] += sum;
      pEv.fives = sum;
    }
  }
  st.lastEvents.push(pEv);
  if (hand.length === 0) { endRound(st, 'domino', player); }
  else st.turn = 1 - player;
  return { ok: true, events: st.lastEvents };
}

function drawTile(st, player) {
  st.lastEvents = [];
  if (st.phase !== 'play') return { ok: false, err: 'not-playing' };
  if (player !== st.turn) return { ok: false, err: 'not-your-turn' };
  if (!st.boneyard.length) return { ok: false, err: 'boneyard-empty' };
  if (canPlay(st, player)) return { ok: false, err: 'has-move' };
  const ends = exposed(st);
  // remember the suits this player was stuck on (Shark uses this)
  if (!st.drawnOn[player].includes(ends.head)) st.drawnOn[player].push(ends.head);
  if (!st.drawnOn[player].includes(ends.tail)) st.drawnOn[player].push(ends.tail);
  const t = st.boneyard.pop();
  st.hands[player].push(t);
  st.lastEvents.push({ t: 'draw', player, tile: { a: t.a, b: t.b }, boneyard: st.boneyard.length });
  return { ok: true, events: st.lastEvents };
}

function knock(st, player) {
  st.lastEvents = [];
  if (st.phase !== 'play') return { ok: false, err: 'not-playing' };
  if (player !== st.turn) return { ok: false, err: 'not-your-turn' };
  if (st.boneyard.length) return { ok: false, err: 'boneyard-not-empty' };
  if (canPlay(st, player)) return { ok: false, err: 'has-move' };
  const ends = exposed(st);
  st.knockSuits = { player, suits: [ends.head, ends.tail] };
  st.passes++;
  st.lastEvents.push({ t: 'knock', player });
  if (st.passes >= 2) endRound(st, 'blocked', -1);
  else st.turn = 1 - player;
  return { ok: true, events: st.lastEvents };
}

function endRound(st, reason, dominoPlayer) {
  st.phase = 'roundEnd';
  st.roundReason = reason;
  const round5 = (n) => Math.round(n / 5) * 5;
  const p0 = handPips(st.hands[0]), p1 = handPips(st.hands[1]);
  const bone = st.boneyard.reduce((s, t) => s + pips(t), 0);
  if (reason === 'domino') {
    st.winner = dominoPlayer;
    const base = dominoPlayer === 0 ? p1 : p0;
    st.roundPts = st.mode === 'fives' ? round5(base + bone) : base + bone;
  } else {
    if (p0 === p1) { st.winner = null; st.roundPts = 0; }
    else {
      st.winner = p0 < p1 ? 0 : 1;
      st.roundPts = st.mode === 'fives' ? round5(Math.abs(p0 - p1)) : Math.abs(p0 - p1);
    }
  }
  if (st.winner != null) {
    st.scores[st.winner] += st.roundPts + st.fives[st.winner];
    st.scores[1 - st.winner] += st.fives[1 - st.winner];
    st.lastEvents.push({
      t: 'roundEnd', reason, winner: st.winner, pts: st.roundPts,
      fives: st.fives.slice(), handPips: [p0, p1], scores: st.scores.slice(),
    });
    if (st.scores[st.winner] >= st.target) {
      st.phase = 'matchEnd';
      st.lastEvents.push({ t: 'matchEnd', winner: st.winner, scores: st.scores.slice() });
    }
  } else {
    st.scores[0] += st.fives[0];
    st.scores[1] += st.fives[1];
    st.lastEvents.push({ t: 'roundEnd', reason, winner: null, pts: 0, fives: st.fives.slice(), handPips: [p0, p1], scores: st.scores.slice() });
  }
}

function nextRound(st) {
  if (st.phase !== 'roundEnd') return { ok: false, err: 'not-round-end' };
  st.round++;
  dealRound(st);
  return { ok: true, events: st.lastEvents };
}

/* ---------------- AI ----------------
 * 0 Casual: pure random legal move — loose and beatable.
 * 1 Sharp:  dumps heavy tiles early, keeps future options.
 * 2 Shark:  Sharp's brain plus a memory — it remembers the suits you drew
 *            on and prefers to leave those values exposed, blocking you. */
function scoreMove(st, player, mv, difficulty) {
  const hand = st.hands[player];
  const t = hand[mv.tileIdx];
  const ends = exposed(st);
  const ev = mv.end === 'head' ? ends.head : ends.tail;
  const other = t.a + t.b - ev; // the new exposed value after this play
  const early = st.board.length < 10;
  let s = 0;
  if (t.a === t.b) s += 3 + (early ? 2 : 0);
  s += pips(t) * (difficulty === 1 && early ? 0.55 : 0.35); // Sharp dumps heavy early
  if (st.knockSuits.player !== player && st.knockSuits.suits.includes(other)) s += 3;
  if (difficulty === 2) {
    const opp = 1 - player;
    if (st.drawnOn[opp].includes(other)) s += 4.5; // block suits they drew on
    if (hand.length <= 4) s += pips(t) * 0.3;      // endgame discipline
  }
  const newEnds = mv.end === 'head'
    ? { head: other, tail: ends.tail } : { head: ends.head, tail: other };
  if (st.mode === 'fives') {
    const sum = newEnds.head + newEnds.tail;
    if (sum > 0 && sum % 5 === 0) s += sum * 1.2; // chase multiples of 5
  }
  let future = 0;
  for (let i = 0; i < hand.length; i++) {
    if (i === mv.tileIdx) continue;
    const h = hand[i];
    if (h.a === newEnds.head || h.b === newEnds.head || h.a === newEnds.tail || h.b === newEnds.tail) future++;
  }
  s += future * 0.6;
  if (hand.length - 1 <= 2) s += 5;
  if (hand.length - 1 === 0) s += 50;
  return s;
}

function aiChoose(st, player, difficulty) {
  const moves = legalMoves(st.hands[player], exposed(st));
  if (!moves.length) {
    if (st.boneyard.length) return { type: 'draw' };
    return { type: 'knock' };
  }
  if (difficulty === 0) {
    const mv = moves[Math.floor(rngNext(st) * moves.length)];
    return { type: 'play', tileIdx: mv.tileIdx, end: mv.end };
  }
  let best = null, bestS = -1e9;
  for (const mv of moves) {
    let s = scoreMove(st, player, mv, difficulty);
    if (difficulty === 1) s += (rngNext(st) - 0.5) * 2.5; // Sharp: a little looseness
    if (s > bestS) { bestS = s; best = mv; }
  }
  return { type: 'play', tileIdx: best.tileIdx, end: best.end };
}

// Snapshots for undo: the state is all plain data (the rng stream lives in
// the rngS integer), so a snapshot is a lossless JSON copy. Restore re-seeds
// the stream anyway — undo starts a new timeline, as it always has.
function snapshot(st) {
  return JSON.stringify({ nextId: _nextId, st });
}
function restore(snap) {
  const o = JSON.parse(snap);
  _nextId = o.nextId;
  const st = o.st;
  st.rngS = (Date.now() % 2147483647) || 1;
  return st;
}

const api = {
  mulberry32, rngNext, newSet, newGame, dealRound, playTile, drawTile, knock,
  nextRound, legalMoves, canPlay, exposed, aiChoose, pips, handPips, tileKey,
  snapshot, restore, scoreMove,
};
export default api;
