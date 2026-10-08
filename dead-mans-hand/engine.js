/* Dead Man's Hand — Klondike solitaire engine. Pure logic: zero DOM,
 * zero canvas, zero audio. Runs headless in node (tests/) and in the
 * browser (game.js renders it). Seeded PRNG (mulberry32): same seed ->
 * same deal. Undo is snapshot-based; history capped at 300.
 */
'use strict';

var SOL = (function () {

  /* ---------------- PRNG ---------------- */

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // FNV-1a 32-bit hash of 'YYYY-MM-DD'. Same date worldwide -> same deal.
  function dailySeed(dateStr) {
    var h = 0x811c9dc5;
    for (var i = 0; i < dateStr.length; i++) {
      h ^= dateStr.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /* ---------------- cards ---------------- */

  // card: {r: 1..13 (1=A, 11=J, 12=Q, 13=K), s: 0..3 (spade heart diamond club), up: bool}
  var SUITS = ['\u2660', '\u2665', '\u2666', '\u2663'];
  var SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];

  function isRed(s) { return s === 1 || s === 2; }
  function rankLabel(r) {
    return r === 1 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r);
  }

  function makeDeck() {
    var d = [], r, s;
    for (s = 0; s < 4; s++) for (r = 1; r <= 13; r++) d.push({ r: r, s: s, up: false });
    return d;
  }

  function shuffle(deck, rng) {
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    return deck;
  }

  function top(pile) { return pile.length ? pile[pile.length - 1] : null; }

  /* ---------------- game state ---------------- */

  function newGame(seed, drawCount) {
    var rng = mulberry32(seed >>> 0);
    var deck = shuffle(makeDeck(), rng);
    var tableau = [[], [], [], [], [], [], []];
    var i, j;
    for (i = 0; i < 7; i++) {
      for (j = 0; j <= i; j++) tableau[i].push(deck.pop());
      top(tableau[i]).up = true;
    }
    var stock = deck; // 24 cards, face down
    for (i = 0; i < stock.length; i++) stock[i].up = false;
    return {
      seed: seed >>> 0,
      draw: drawCount === 3 ? 3 : 1,
      tableau: tableau,
      foundations: [[], [], [], []], // index = suit
      stock: stock,
      waste: [],
      score: 0,
      moves: 0,
      passes: 0,
      history: [],
      startT: 0,
      won: false,
      over: false
    };
  }

  function snapshot(st) {
    return {
      tableau: JSON.parse(JSON.stringify(st.tableau)),
      foundations: JSON.parse(JSON.stringify(st.foundations)),
      stock: JSON.parse(JSON.stringify(st.stock)),
      waste: JSON.parse(JSON.stringify(st.waste)),
      score: st.score, moves: st.moves, passes: st.passes
    };
  }

  function restore(st, snap) {
    st.tableau = snap.tableau; st.foundations = snap.foundations;
    st.stock = snap.stock; st.waste = snap.waste;
    st.score = snap.score; st.moves = snap.moves; st.passes = snap.passes;
    st.won = false; st.over = false;
  }

  function checkpoint(st) {
    st.history.push(snapshot(st));
    if (st.history.length > 300) st.history.shift();
  }

  function undo(st) {
    if (!st.history.length) return false;
    restore(st, st.history.pop());
    return true;
  }

  function addScore(st, n) {
    st.score = Math.max(0, st.score + n);
  }

  /* ---------------- move legality ---------------- */

  // Can `card` land on tableau pile `pile`? (top card or empty slot)
  function canTableau(card, pile) {
    var t = top(pile);
    if (!t) return card.r === 13; // empty column takes only a King
    return t.up && isRed(t.s) !== isRed(card.s) && t.r === card.r + 1;
  }

  // Can `card` land on foundation `f` (array)?
  function canFoundation(card, f) {
    var t = top(f);
    if (!t) return card.r === 1; // empty foundation takes only an Ace
    return card.s === t.s && card.r === t.r + 1;
  }

  // A stack tableau[i][k..] is movable iff every card from k up is face-up
  // and forms a valid descending alternating sequence.
  function movableStack(pile, k) {
    for (var i = k; i < pile.length; i++) {
      if (!pile[i].up) return false;
      if (i > k) {
        var a = pile[i - 1], b = pile[i];
        if (!(isRed(a.s) !== isRed(b.s) && a.r === b.r + 1)) return false;
      }
    }
    return true;
  }

  // first face-up index in a tableau pile (-1 if none)
  function firstUp(pile) {
    for (var i = 0; i < pile.length; i++) if (pile[i].up) return i;
    return -1;
  }

  /* ---------------- mutations (all checkpoint first) ---------------- */

  function flipExposed(st, i) {
    var t = top(st.tableau[i]);
    if (t && !t.up) { t.up = true; addScore(st, 5); return true; }
    return false;
  }

  // draw from stock -> waste, or redeal waste -> stock
  function draw(st) {
    if (st.won) return { ok: false };
    checkpoint(st);
    if (!st.stock.length) {
      if (!st.waste.length) { st.history.pop(); return { ok: false }; }
      // redeal: waste flips back over, order preserved
      while (st.waste.length) {
        var c = st.waste.pop();
        c.up = false;
        st.stock.push(c);
      }
      st.passes++;
      addScore(st, st.draw === 1 ? -100 : -20);
      st.moves++;
      return { ok: true, kind: 'redeal' };
    }
    var n = Math.min(st.draw, st.stock.length);
    for (var k = 0; k < n; k++) {
      var d = st.stock.pop();
      d.up = true;
      st.waste.push(d);
    }
    st.moves++;
    return { ok: true, kind: 'draw', n: n };
  }

  // move waste top -> tableau i
  function wasteToTableau(st, i) {
    var c = top(st.waste);
    if (!c || !canTableau(c, st.tableau[i])) return { ok: false };
    checkpoint(st);
    st.tableau[i].push(st.waste.pop());
    addScore(st, 5);
    st.moves++;
    return { ok: true };
  }

  // move waste top -> its foundation
  function wasteToFoundation(st) {
    var c = top(st.waste);
    if (!c || !canFoundation(c, st.foundations[c.s])) return { ok: false };
    checkpoint(st);
    st.foundations[c.s].push(st.waste.pop());
    addScore(st, 10);
    st.moves++;
    checkWin(st);
    return { ok: true };
  }

  // move tableau stack pile[i][k..] -> tableau j
  function tableauToTableau(st, i, j, k) {
    if (i === j) return { ok: false };
    var pile = st.tableau[i];
    if (k < 0 || k >= pile.length || !movableStack(pile, k)) return { ok: false };
    if (!canTableau(pile[k], st.tableau[j])) return { ok: false };
    checkpoint(st);
    var stack = pile.splice(k);
    for (var q = 0; q < stack.length; q++) st.tableau[j].push(stack[q]);
    flipExposed(st, i);
    st.moves++;
    return { ok: true, n: stack.length };
  }

  // move tableau i top -> its foundation
  function tableauToFoundation(st, i) {
    var pile = st.tableau[i], c = top(pile);
    if (!c || !c.up || !canFoundation(c, st.foundations[c.s])) return { ok: false };
    checkpoint(st);
    st.foundations[c.s].push(pile.pop());
    addScore(st, 10);
    flipExposed(st, i);
    st.moves++;
    checkWin(st);
    return { ok: true };
  }

  // move foundation top back to tableau i (costs 15)
  function foundationToTableau(st, f, i) {
    var pile = st.foundations[f], c = top(pile);
    if (!c || !canTableau(c, st.tableau[i])) return { ok: false };
    checkpoint(st);
    st.tableau[i].push(pile.pop());
    addScore(st, -15);
    st.moves++;
    return { ok: true };
  }

  // one auto-complete step: move a "safe" card to foundation
  function autoStep(st) {
    var mv = findSafeFoundationMove(st);
    if (!mv) return { ok: false };
    var r;
    if (mv.from === 'waste') r = wasteToFoundation(st);
    else r = tableauToFoundation(st, mv.i);
    return r;
  }

  function checkWin(st) {
    for (var s = 0; s < 4; s++) if (st.foundations[s].length !== 13) return;
    st.won = true; st.over = true;
  }

  /* ---------------- hints & auto-complete ---------------- */

  // A foundation move is "safe" (can't strand a needed card) when the card
  // is an Ace/Two, or both opposite-color foundations are at least rank-1.
  function safeForFoundation(card, st) {
    if (card.r <= 2) return true;
    var need = card.r - 1;
    for (var s = 0; s < 4; s++) {
      if (isRed(s) !== isRed(card.s)) {
        var t = top(st.foundations[s]);
        if (!t || t.r < need) return false;
      }
    }
    return true;
  }

  function findSafeFoundationMove(st) {
    var i, c;
    var w = top(st.waste);
    if (w && canFoundation(w, st.foundations[w.s]) && safeForFoundation(w, st))
      return { from: 'waste' };
    for (i = 0; i < 7; i++) {
      c = top(st.tableau[i]);
      if (c && c.up && canFoundation(c, st.foundations[c.s]) && safeForFoundation(c, st))
        return { from: 'tableau', i: i };
    }
    return null;
  }

  // ordered hint list; first entry is the suggested move
  function findMoves(st) {
    var hints = [], i, k, c, pile;
    // 1. safe foundation moves
    var w = top(st.waste);
    if (w && canFoundation(w, st.foundations[w.s])) {
      hints.push({ kind: safeForFoundation(w, st) ? 'w2f-safe' : 'w2f', label: 'Waste ' + rankLabel(w.r) + SUITS[w.s] + ' → foundation' });
    }
    for (i = 0; i < 7; i++) {
      c = top(st.tableau[i]);
      if (c && c.up && canFoundation(c, st.foundations[c.s])) {
        hints.push({ kind: 't2f', i: i, safe: safeForFoundation(c, st),
          label: rankLabel(c.r) + SUITS[c.s] + ' → foundation' });
      }
    }
    // 2. waste -> tableau
    if (w) for (i = 0; i < 7; i++) {
      if (canTableau(w, st.tableau[i]))
        hints.push({ kind: 'w2t', i: i, label: 'Waste ' + rankLabel(w.r) + SUITS[w.s] + ' → column ' + (i + 1) });
    }
    // 3. tableau -> tableau (only if it flips a card or moves a King to empty)
    for (i = 0; i < 7; i++) {
      pile = st.tableau[i];
      var fu = firstUp(pile);
      if (fu < 0) continue;
      for (k = fu; k < pile.length; k++) {
        for (var j = 0; j < 7; j++) {
          if (i === j || !canTableau(pile[k], st.tableau[j])) continue;
          var flips = (k > 0 && !pile[k - 1].up);
          var kingToEmpty = (pile[k].r === 13 && !st.tableau[j].length);
          if (flips || kingToEmpty || k === fu)
            hints.push({ kind: 't2t', i: i, j: j, k: k,
              label: rankLabel(pile[k].r) + SUITS[pile[k].s] + ' → column ' + (j + 1) });
        }
      }
    }
    // 4. draw
    if (st.stock.length || st.waste.length)
      hints.push({ kind: 'draw', label: st.stock.length ? 'Draw from stock' : 'Redeal the waste' });
    return hints;
  }

  function canAutoComplete(st) {
    if (st.stock.length || st.waste.length || st.won) return false;
    for (var i = 0; i < 7; i++)
      for (var k = 0; k < st.tableau[i].length; k++)
        if (!st.tableau[i][k].up) return false;
    return !!findSafeFoundationMove(st);
  }

  /* ---------------- scoring ---------------- */

  function winBonus(st, seconds) {
    var timeBonus = Math.max(0, (st.draw === 1 ? 700 : 500) - Math.floor(seconds));
    return (st.draw === 1 ? 700 : 500) + timeBonus;
  }

  /* ---------------- public API ---------------- */

  return {
    newGame: newGame,
    dailySeed: dailySeed,
    draw: draw,
    wasteToTableau: wasteToTableau,
    wasteToFoundation: wasteToFoundation,
    tableauToTableau: tableauToTableau,
    tableauToFoundation: tableauToFoundation,
    foundationToTableau: foundationToTableau,
    autoStep: autoStep,
    undo: undo,
    findMoves: findMoves,
    findSafeFoundationMove: findSafeFoundationMove,
    canAutoComplete: canAutoComplete,
    winBonus: winBonus,
    canTableau: canTableau,
    canFoundation: canFoundation,
    movableStack: movableStack,
    firstUp: firstUp,
    top: top,
    isRed: isRed,
    rankLabel: rankLabel,
    SUITS: SUITS,
    SUIT_NAMES: SUIT_NAMES
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SOL;
