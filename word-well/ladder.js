/* Word Well — pure logic engine (ladder.js)
 *
 * No DOM, no Math.random. Seeded PRNG (mulberry32) only.
 * Works in node (module.exports) and the browser (window.WW).
 *
 * Public API (contract — do not rename):
 *   WW.mulberry32(seed)          -> PRNG function returning [0,1)
 *   WW.hashSeed(str)             -> uint32 from a string (FNV-1a)
 *   WW.diffOne(a, b)             -> true iff same length, exactly one letter differs
 *   WW.buildAnswerGraph()        -> Map word -> sorted array of neighbor words
 *                                    (built ONCE over WW_ANSWERS, cached)
 *   WW.bfs(from, to, adj)        -> shortest path array from->to inclusive, or null
 *   WW.distFrom(word, adj, maxDepth) -> Map word -> distance (edges), capped at maxDepth
 *   WW.dailyPuzzle(dateStr)      -> {date, start, end, par, rope, fortuneIdx}
 *   WW.practicePuzzle(seed)      -> same shape, date: null
 *   WW.validateGuess(word, prev, used, adj) -> {ok:true} | {ok:false, code}
 *   WW.hintNext(from, end, adj)  -> one step closer to end, or null
 *   WW.starsFor(steps, par)      -> 3 / 2 / 1
 *
 * Depends on globals from words.js: WW_ANSWERS, WW_GUESSES, WW_GIANT.
 */
(function (root, factory) {
  var WW = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WW;
  } else {
    root.WW = WW;
  }
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  // ---------------------------------------------------------------- PRNG

  /** mulberry32: deterministic PRNG returning floats in [0, 1). */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** FNV-1a 32-bit hash of a string -> uint32. */
  function hashSeed(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // ---------------------------------------------------------------- words

  /** True iff a and b have the same length and differ in exactly one letter. */
  function diffOne(a, b) {
    if (a.length !== b.length) return false;
    var diffs = 0;
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        diffs++;
        if (diffs > 1) return false;
      }
    }
    return diffs === 1;
  }

  // ------------------------------------------------------------ graph

  var _answerGraph = null;   // cached Map word -> sorted neighbor array
  var _guessSet = null;      // cached Set of WW_GUESSES

  function guessSet() {
    if (!_guessSet) _guessSet = new Set(WW_GUESSES);
    return _guessSet;
  }

  /**
   * Build the answer adjacency graph ONCE over WW_ANSWERS only.
   * Pattern buckets: for each word, for each of 4 positions, the key
   * word-with-'*'-at-that-position; words sharing a bucket are neighbors.
   * Neighbor arrays are sorted alphabetically for determinism.
   */
  function buildAnswerGraph() {
    if (_answerGraph) return _answerGraph;
    var words = WW_ANSWERS;
    var buckets = new Map(); // pattern -> array of words
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      for (var p = 0; p < w.length; p++) {
        var key = w.slice(0, p) + '*' + w.slice(p + 1);
        var arr = buckets.get(key);
        if (!arr) { arr = []; buckets.set(key, arr); }
        arr.push(w);
      }
    }
    var adj = new Map();
    for (var j = 0; j < words.length; j++) {
      var word = words[j];
      var neigh = new Set();
      for (var q = 0; q < word.length; q++) {
        var k = word.slice(0, q) + '*' + word.slice(q + 1);
        var mates = buckets.get(k);
        for (var m = 0; m < mates.length; m++) {
          if (mates[m] !== word) neigh.add(mates[m]);
        }
      }
      adj.set(word, Array.from(neigh).sort());
    }
    _answerGraph = adj;
    return adj;
  }

  // ---------------------------------------------------------------- BFS

  /**
   * Shortest path from `from` to `to` (inclusive), or null if unreachable
   * or an endpoint is missing from the graph.
   */
  function bfs(from, to, adj) {
    if (!adj.has(from) || !adj.has(to)) return null;
    if (from === to) return [from];
    var prev = new Map();
    prev.set(from, null);
    var queue = [from];
    var head = 0;
    while (head < queue.length) {
      var cur = queue[head++];
      var neigh = adj.get(cur);
      for (var i = 0; i < neigh.length; i++) {
        var n = neigh[i];
        if (!prev.has(n)) {
          prev.set(n, cur);
          if (n === to) {
            // reconstruct
            var path = [to];
            var c = to;
            while (prev.get(c) !== null) {
              c = prev.get(c);
              path.push(c);
            }
            path.reverse();
            return path;
          }
          queue.push(n);
        }
      }
    }
    return null;
  }

  /**
   * BFS distances (edge counts) from `word`, capped at maxDepth.
   * Returns Map word -> distance. Empty map if word not in graph.
   */
  function distFrom(word, adj, maxDepth) {
    var dist = new Map();
    if (!adj.has(word)) return dist;
    dist.set(word, 0);
    var queue = [word];
    var head = 0;
    while (head < queue.length) {
      var cur = queue[head++];
      var d = dist.get(cur);
      if (d >= maxDepth) continue;
      var neigh = adj.get(cur);
      for (var i = 0; i < neigh.length; i++) {
        var n = neigh[i];
        if (!dist.has(n)) {
          dist.set(n, d + 1);
          queue.push(n);
        }
      }
    }
    return dist;
  }

  // ------------------------------------------------------- puzzle gen

  function _pickPuzzle(rng, dateStr) {
    var adj = buildAnswerGraph();
    var giant = WW_GIANT;
    var start = giant[0];
    var dist = new Map();
    var candidates = [];
    for (var t = 0; t < 200; t++) {
      start = giant[Math.floor(rng() * giant.length)];
      dist = distFrom(start, adj, 7);
      candidates = [];
      dist.forEach(function (d, w) {
        if (d >= 4 && d <= 7) candidates.push(w);
      });
      if (candidates.length > 0) break;
    }
    if (candidates.length === 0) {
      // Practically unreachable (WW_GIANT is one connected component), but
      // keep generation total: scan deterministically for a viable start.
      for (var i = 0; i < giant.length && candidates.length === 0; i++) {
        start = giant[i];
        dist = distFrom(start, adj, 7);
        candidates = [];
        dist.forEach(function (d, w) {
          if (d >= 4 && d <= 7) candidates.push(w);
        });
      }
    }
    candidates.sort();
    var end = candidates[Math.floor(rng() * candidates.length)];
    var par = dist.get(end);
    return {
      date: dateStr,
      start: start,
      end: end,
      par: par,
      rope: par + 3,
      fortuneIdx: Math.floor(rng() * 24)
    };
  }

  /** Daily puzzle for "YYYY-MM-DD" — identical worldwide. */
  function dailyPuzzle(dateStr) {
    return _pickPuzzle(mulberry32(hashSeed(dateStr)), dateStr);
  }

  /** Practice puzzle from a uint32 seed — same shape, date: null. */
  function practicePuzzle(seed) {
    return _pickPuzzle(mulberry32(seed >>> 0), null);
  }

  // ------------------------------------------------------- validation

  /**
   * Validate a rung guess. Checks in order: not-word, repeat, not-one-letter.
   * `used` is a Set (or array) of lowercase used words.
   */
  function validateGuess(word, prev, used, adj) { // eslint-disable-line no-unused-vars
    if (!guessSet().has(word)) return { ok: false, code: 'not-word' };
    var usedSet = (used instanceof Set) ? used : new Set(used || []);
    if (usedSet.has(word)) return { ok: false, code: 'repeat' };
    if (!diffOne(word, prev)) return { ok: false, code: 'not-one-letter' };
    return { ok: true };
  }

  // ------------------------------------------------------- hint

  /**
   * Return a word one step closer to `end` along a shortest path from `from`,
   * or null (from===end, or no strictly-closer neighbor).
   * If `from` isn't in the graph (player standing on a GUESSES-only word),
   * scan WW_ANSWERS for diffOne neighbors instead.
   */
  function hintNext(from, end, adj) {
    if (from === end) return null;
    var dEnd = distFrom(end, adj, 50);
    var dFrom = dEnd.get(from);
    if (dFrom === undefined || dFrom === 0) return null;
    var neigh;
    if (adj.has(from)) {
      neigh = adj.get(from);
    } else {
      neigh = [];
      for (var i = 0; i < WW_ANSWERS.length; i++) {
        if (diffOne(WW_ANSWERS[i], from)) neigh.push(WW_ANSWERS[i]);
      }
    }
    var best = null;
    for (var j = 0; j < neigh.length; j++) {
      var n = neigh[j];
      if (dEnd.get(n) === dFrom - 1) {
        if (best === null || n < best) best = n; // alphabetical tie-break
      }
    }
    return best;
  }

  // ------------------------------------------------------- scoring

  /** Stars: steps <= par -> 3, par+1 -> 2, anything else -> 1. */
  function starsFor(steps, par) {
    if (steps <= par) return 3;
    if (steps === par + 1) return 2;
    return 1;
  }

  // ------------------------------------------------------------ API

  return {
    mulberry32: mulberry32,
    hashSeed: hashSeed,
    diffOne: diffOne,
    buildAnswerGraph: buildAnswerGraph,
    bfs: bfs,
    distFrom: distFrom,
    dailyPuzzle: dailyPuzzle,
    practicePuzzle: practicePuzzle,
    validateGuess: validateGuess,
    hintNext: hintNext,
    starsFor: starsFor
  };
}));
