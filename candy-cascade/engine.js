'use strict';
/* =====================================================================
   CANDY CASCADE — match-3 engine (pure logic, no DOM)
   Works in Node (tests) and the browser (UI replays the step list).

   Board: st.board[r][c] with r=0 at the TOP.
   Cell: { t:'c', color:0..5|null, sp:null|'sh'|'sv'|'w'|'b' }
         { t:'f', hp:1..2 }                       (frosting blocker)
         { t:'x', hp:1 }                          (chocolate blocker: spreads
                                                  one cell per move unless
                                                  damaged that turn)
         { t:'i' }                               (ingredient: falls, immune to
                                                  clears, collected at bottom)
         null                                    (empty, mid-resolution)
   Specials: sh = striped-horizontal (clears row), sv = striped-vertical
             (clears column), w = wrapped (3x3 double blast),
             b = color bomb (colorless, never matches by color).
   Stripe orientation follows the PLAYER'S SWIPE direction (horizontal
   swipe -> horizontal stripes -> clears row), not the match line.

   trySwap(st, a, b, swipeDir) returns { ok, steps } where steps is a replayable list:
     {k:'invalid', a, b}
     {k:'swap', a, b}
     {k:'round', round, matches, creations, clear, effects, jellyCleared,
               orders, frostHits, frostBroken, gain, fall}
     {k:'combo', clear, effects, jellyCleared, orders, frostHits,
               frostBroken, gain, fall}
     {k:'hammer', ...round-shaped, hammerAt, collected}
     {k:'collect', items, gain, fall}
     {k:'shuffle', tiles:[{r,c,color,special}]}
     {k:'sugar', spawns, clear, effects, jellyCleared, orders, frostHits,
               frostBroken, gain, fall}   (Sugar Crush fireworks: leftover
               moves become free striped candies, auto-detonated)
     {k:'choc', grows}                    (chocolate spread to grows[])
     {k:'end', won, stars, score, bonus, best}
   hammer(st, r, c) smashes one cell for free (no move spent).
   hint(st) suggests a swap {a, b}, preferring special forges.
   ===================================================================== */

const CC = (() => {

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const key = (r, c) => r + ',' + c;
const inB = (st, p) => p.r >= 0 && p.r < st.rows && p.c >= 0 && p.c < st.cols;
const adjacent = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

function gridFromStrings(rows, R, C) {
  const g = Array.from({ length: R }, () => Array(C).fill(0));
  if (!rows) return g;
  for (let r = 0; r < R && r < rows.length; r++) {
    const line = rows[r] || '';
    for (let c = 0; c < C && c < line.length; c++) {
      const v = parseInt(line[c], 10);
      g[r][c] = Number.isFinite(v) ? v : 0;
    }
  }
  return g;
}

/* ---------------- game setup ---------------- */

function newGame(def, seed) {
  const rng = mulberry32(seed == null ? (Math.random() * 1e9) | 0 : seed);
  const st = {
    def, rows: 9, cols: 9, colors: def.colors || 6, rng,
    board: null, jelly: gridFromStrings(def.jelly, 9, 9),
    movesLeft: def.moves, score: 0,
    ordersLeft: def.goal && def.goal.orders ? Object.assign({}, def.goal.orders) : null,
    over: false, won: false, stars: 0, endBonus: 0, cascadeBest: 0,
    ingredientsCollected: 0, ingredientsSpawned: 0, pendingIngredient: false, movesUsed: 0,
    _chocDamaged: false, // set when chocolate takes a hit this move (blocks spread)
  };
  const frostGrid = gridFromStrings(def.frost, 9, 9);
  const chocGrid = gridFromStrings(def.choc, 9, 9);
  // constructive fill: never create a match while placing (works for any
  // color count), then retry only if the board has no possible move at all
  let guard = 0;
  do {
    st.board = Array.from({ length: 9 }, () => Array(9).fill(null));
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (chocGrid[r][c] > 0) { st.board[r][c] = { t: 'x', hp: 1 }; continue; }
      if (frostGrid[r][c] > 0) { st.board[r][c] = { t: 'f', hp: frostGrid[r][c] }; continue; }
      const banned = new Set();
      const l1 = st.board[r][c - 1], l2 = st.board[r][c - 2];
      if (l1 && l2 && l1.t === 'c' && l2.t === 'c' && l1.color != null && l1.color === l2.color) banned.add(l1.color);
      const u1 = r > 0 ? st.board[r - 1][c] : null, u2 = r > 1 ? st.board[r - 2][c] : null;
      if (u1 && u2 && u1.t === 'c' && u2.t === 'c' && u1.color != null && u1.color === u2.color) banned.add(u1.color);
      let color, tries = 0;
      do { color = (rng() * st.colors) | 0; tries++; } while (banned.has(color) && tries < 50);
      st.board[r][c] = { t: 'c', color, sp: null };
    }
    guard++;
  } while (guard < 200 && !hasPossibleMove(st.board));
  if (def.type === 'ingredients') {
    // seed a couple of cherries near the top so the goal is visible immediately
    const goal = (def.goal && def.goal.ingredients) || 0;
    const n = Math.min(2, goal);
    const cols = [];
    for (let c = 0; c < 9; c++) cols.push(c);
    for (let i = cols.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const t = cols[i]; cols[i] = cols[j]; cols[j] = t;
    }
    for (let i = 0; i < n; i++) {
      st.board[1 + i][cols[i]] = { t: 'i' };
      st.ingredientsSpawned++;
    }
  }
  return st;
}

/* ---------------- match detection ---------------- */

function findMatches(board) {
  const R = board.length, C = board[0].length, out = [];
  for (let r = 0; r < R; r++) {
    let c = 0;
    while (c < C) {
      const cell = board[r][c];
      if (!cell || cell.t !== 'c' || cell.color == null) { c++; continue; }
      let k = c + 1;
      while (k < C) {
        const n = board[r][k];
        if (n && n.t === 'c' && n.color === cell.color) k++; else break;
      }
      if (k - c >= 3) {
        const cells = [];
        for (let i = c; i < k; i++) cells.push({ r, c: i });
        out.push({ cells, dir: 'h', len: k - c, color: cell.color });
      }
      c = k;
    }
  }
  for (let c = 0; c < C; c++) {
    let r = 0;
    while (r < R) {
      const cell = board[r][c];
      if (!cell || cell.t !== 'c' || cell.color == null) { r++; continue; }
      let k = r + 1;
      while (k < R) {
        const n = board[k][c];
        if (n && n.t === 'c' && n.color === cell.color) k++; else break;
      }
      if (k - r >= 3) {
        const cells = [];
        for (let i = r; i < k; i++) cells.push({ r: i, c });
        out.push({ cells, dir: 'v', len: k - r, color: cell.color });
      }
      r = k;
    }
  }
  return out;
}

function clusterize(matches) {
  const parent = new Map();
  const find = (x) => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(x) !== x) { const n = parent.get(x); parent.set(x, root); x = n; }
    return root;
  };
  for (const m of matches) for (const cell of m.cells) {
    const k = key(cell.r, cell.c);
    if (!parent.has(k)) parent.set(k, k);
  }
  for (const m of matches) for (let i = 1; i < m.cells.length; i++) {
    const a = key(m.cells[0].r, m.cells[0].c), b = key(m.cells[i].r, m.cells[i].c);
    parent.set(find(a), find(b));
  }
  const groups = new Map();
  for (const m of matches) {
    const root = find(key(m.cells[0].r, m.cells[0].c));
    if (!groups.has(root)) groups.set(root, { matches: [], cells: new Map() });
    const g = groups.get(root);
    g.matches.push(m);
    for (const cell of m.cells) g.cells.set(key(cell.r, cell.c), cell);
  }
  return [...groups.values()];
}

function pickCell(cluster, prefer, run) {
  if (prefer) {
    const k = key(prefer.r, prefer.c);
    if (cluster.cells.has(k)) return { r: prefer.r, c: prefer.c };
  }
  const mid = run.cells[Math.floor(run.cells.length / 2)];
  return { r: mid.r, c: mid.c };
}

/* Decide which special (if any) a cluster of matches forges.
   Stripe orientation follows the player's swipe ('h' -> sh clears the row,
   'v' -> sv clears the column); cascade-forged stripes fall back to the
   match line so headless play stays deterministic. */
function planCreation(board, cluster, prefer, swipeDir) {
  for (const cell of cluster.cells.values()) {
    if (board[cell.r][cell.c].sp) return null; // existing special: it just fires
  }
  const ms = cluster.matches;
  const straight5 = ms.find(m => m.len >= 5);
  if (straight5) return { kind: 'b', color: null, at: pickCell(cluster, prefer, straight5) };
  const hasH = ms.some(m => m.dir === 'h'), hasV = ms.some(m => m.dir === 'v');
  if (hasH && hasV && cluster.cells.size >= 5) {
    const longest = ms.reduce((a, b) => (b.len > a.len ? b : a));
    return { kind: 'w', color: longest.color, at: pickCell(cluster, prefer, longest) };
  }
  const four = ms.find(m => m.len === 4);
  if (four) {
    const kind = swipeDir ? (swipeDir === 'h' ? 'sh' : 'sv')
                          : (four.dir === 'h' ? 'sh' : 'sv');
    return { kind, color: four.color, at: pickCell(cluster, prefer, four) };
  }
  return null;
}

/* ---------------- clearing machinery ---------------- */

function addClear(clear, r, c) {
  const k = key(r, c);
  if (!clear.has(k)) clear.set(k, { r, c });
}

/* Damage or clear the cell at (r,c): frosting takes a hit, a candy is
   marked for clearing (and queued if it's a live special). */
function hit(st, r, c, clear, queue, qset, frostHits) {
  if (r < 0 || r >= st.rows || c < 0 || c >= st.cols) return;
  const cell = st.board[r][c];
  if (!cell) return;
  if (cell.t === 'f') { cell.hp--; frostHits.push({ r, c, hp: cell.hp, t: 'f' }); return; }
  if (cell.t === 'x') {
    cell.hp--; st._chocDamaged = true;
    frostHits.push({ r, c, hp: cell.hp, t: 'x' }); return;
  }
  if (cell.t !== 'c') return;
  const k = key(r, c);
  if (!clear.has(k)) {
    clear.set(k, { r, c });
    if (cell.sp && !qset.has(k)) { qset.add(k); queue.push({ r, c }); }
  }
}

/* Fire the special at (r,c). It is consumed; its effect fans out through hit(). */
function activate(st, r, c, clear, effects, queue, qset, frostHits) {
  const cell = st.board[r] && st.board[r][c];
  if (!cell || cell.t !== 'c') return;
  const sp = cell.sp;
  if (!sp) return;
  cell.sp = null;
  if (sp === 'sh') {
    effects.push({ t: 'beamH', r });
    for (let cc = 0; cc < st.cols; cc++) hit(st, r, cc, clear, queue, qset, frostHits);
  } else if (sp === 'sv') {
    effects.push({ t: 'beamV', c });
    for (let rr = 0; rr < st.rows; rr++) hit(st, rr, c, clear, queue, qset, frostHits);
  } else if (sp === 'w') {
    effects.push({ t: 'blast', r, c, rad: 1, dbl: true });
    for (let p = 0; p < 2; p++)
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++)
        hit(st, r + dr, c + dc, clear, queue, qset, frostHits);
  } else if (sp === 'b') {
    effects.push({ t: 'blast', r, c, rad: 1 });
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++)
      hit(st, r + dr, c + dc, clear, queue, qset, frostHits);
  }
}

function drainQueue(st, clear, effects, queue, qset, frostHits) {
  let guard = 0;
  while (queue.length && guard++ < 500) {
    const { r, c } = queue.shift();
    activate(st, r, c, clear, effects, queue, qset, frostHits);
  }
}

/* Shared tail: score/goals from `clear`, apply removals, break frosting,
   run gravity, emit the step. creationKeys cells survive removal. */
function applyRoundTail(st, steps, stepKind, clear, effects, frostHits, round, extra) {
  extra = extra || {};
  let cleared = 0;
  const jellyCleared = [], orders = {};
  for (const { r, c } of clear.values()) {
    const cell = st.board[r][c];
    if (cell && cell.t === 'c') {
      cleared++;
      if (st.jelly[r][c] > 0) { st.jelly[r][c]--; jellyCleared.push({ r, c, left: st.jelly[r][c] }); }
      if (cell.color != null) orders[cell.color] = (orders[cell.color] || 0) + 1;
    }
  }
  // matches adjacent to frosting/chocolate crack it
  for (const { r, c } of clear.values()) {
    for (const [dr, dc] of DIRS) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= st.rows || nc < 0 || nc >= st.cols) continue;
      const n = st.board[nr][nc];
      if (n && (n.t === 'f' || n.t === 'x')) {
        n.hp--; if (n.t === 'x') st._chocDamaged = true;
        frostHits.push({ r: nr, c: nc, hp: n.hp, t: n.t });
      }
    }
  }
  const createBonus = (extra.creations || []).reduce(
    (s, p) => s + (p.kind === 'b' ? 1000 : p.kind === 'w' ? 400 : 200), 0);
  const gain = cleared * 60 * round + createBonus;
  st.score += gain;
  if (st.ordersLeft) for (const col in orders) {
    if (st.ordersLeft[col] != null) st.ordersLeft[col] = Math.max(0, st.ordersLeft[col] - orders[col]);
  }
  const ckeys = extra.creationKeys || new Set();
  for (const { r, c } of clear.values()) {
    if (!ckeys.has(key(r, c))) st.board[r][c] = null;
  }
  const frostBroken = [];
  for (const h of frostHits) {
    const cell = st.board[h.r] && st.board[h.r][h.c];
    if (h.hp <= 0 && cell && (cell.t === 'f' || cell.t === 'x')) {
      st.board[h.r][h.c] = null;
      frostBroken.push({ r: h.r, c: h.c, t: cell.t });
    }
  }
  const fall = applyGravity(st);
  const step = Object.assign({ k: stepKind, round, clear: [...clear.values()], effects,
    jellyCleared, orders, frostHits, frostBroken, gain, fall }, extra.public || {});
  steps.push(step);
  st.cascadeBest = Math.max(st.cascadeBest, round);
}

/* ---------------- gravity ---------------- */

function applyGravity(st) {
  const moves = [], spawns = [];
  // ingredient dispenser: convert the first fresh spawn (in random column
  // order) into an ingredient; if nothing spawns this pass, stay pending
  const colOrder = Array.from({ length: st.cols }, (_, i) => i);
  const dispensing = st.pendingIngredient && st.def.type === 'ingredients';
  if (dispensing) {
    for (let i = colOrder.length - 1; i > 0; i--) {
      const j = (st.rng() * (i + 1)) | 0;
      const t = colOrder[i]; colOrder[i] = colOrder[j]; colOrder[j] = t;
    }
  }
  let ingPlaced = false;
  const posOf = new Map();
  for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
    const cell = st.board[r][c];
    if (cell) posOf.set(cell, { r, c });
  }
  for (const c of colOrder) {
    let r = st.rows - 1;
    while (r >= 0) {
      const cell = st.board[r][c];
      if (cell && (cell.t === 'f' || cell.t === 'x')) { r--; continue; }
      let segBot = r, segTop = r;
      while (segTop - 1 >= 0) {
        const up = st.board[segTop - 1][c];
        if (up && (up.t === 'f' || up.t === 'x')) break;
        segTop--;
      }
      const candies = [];
      for (let rr = segBot; rr >= segTop; rr--) {
        const cc = st.board[rr][c];
        if (cc && (cc.t === 'c' || cc.t === 'i')) candies.push(cc);
      }
      let rr = segBot, idx = 0;
      for (; idx < candies.length; idx++, rr--) {
        const obj = candies[idx];
        st.board[rr][c] = obj;
        const old = posOf.get(obj);
        if (old.r !== rr || old.c !== c) moves.push({ fr: old.r, fc: old.c, tr: rr, tc: c });
      }
      for (; rr >= segTop; rr--) {
        const makeIng = dispensing && !ingPlaced && rr === segTop;
        const obj = makeIng ? { t: 'i' }
                            : { t: 'c', color: (st.rng() * st.colors) | 0, sp: null };
        if (makeIng) { ingPlaced = true; st.pendingIngredient = false; st.ingredientsSpawned++; }
        st.board[rr][c] = obj;
        spawns.push({ r: rr, c, color: obj.color, drop: (segTop - rr) + 2, ing: makeIng });
      }
      r = segTop - 1;
    }
  }
  return { moves, spawns };
}

/* ---------------- cascade resolution ---------------- */

function resolveRound(st, steps, round, prefer, swipeDir) {
  const matches = findMatches(st.board);
  if (matches.length === 0) return false;
  const clusters = clusterize(matches);
  const creations = [], creationKeys = new Set();
  for (const cl of clusters) {
    const plan = planCreation(st.board, cl, prefer, round === 1 ? swipeDir : null);
    if (plan) { creations.push(plan); creationKeys.add(key(plan.at.r, plan.at.c)); }
  }
  const clear = new Map(), effects = [], queue = [], qset = new Set(), frostHits = [];
  for (const cl of clusters) for (const cell of cl.cells.values()) {
    if (creationKeys.has(key(cell.r, cell.c))) continue;
    hit(st, cell.r, cell.c, clear, queue, qset, frostHits);
  }
  drainQueue(st, clear, effects, queue, qset, frostHits);
  // forge the specials (they survive the clear)
  for (const p of creations) {
    const cell = st.board[p.at.r][p.at.c];
    if (cell && cell.t === 'c') {
      cell.sp = p.kind;
      cell.color = p.kind === 'b' ? null : p.color;
    }
  }
  applyRoundTail(st, steps, 'round', clear, effects, frostHits, round, {
    creations,
    creationKeys,
    public: {
      matches: matches.map(m => ({ cells: m.cells, dir: m.dir, len: m.len })),
      creations: creations.map(p => ({ r: p.at.r, c: p.at.c, special: p.kind, color: p.color })),
    },
  });
  return true;
}

function doCascades(st, steps, prefer, swipeDir) {
  let round = 0;
  while (round < 60) {
    round++;
    if (!resolveRound(st, steps, round, prefer, swipeDir)) break;
    prefer = null;
  }
}

/* ---------------- special-swap combos ---------------- */

const isB = x => x === 'b', isS = x => x === 'sh' || x === 'sv', isW = x => x === 'w';

function doCombo(st, a, b, sa, sb, steps) {
  // post-swap: board[a] holds OB (special sb), board[b] holds OA (special sa)
  const OA = st.board[b.r][b.c], OB = st.board[a.r][a.c];
  const clear = new Map(), effects = [], queue = [], qset = new Set(), frostHits = [];
  // both swapped specials are consumed by the combo (no individual firing)
  OA.sp = null; OB.sp = null;
  addClear(clear, a.r, a.c); addClear(clear, b.r, b.c);

  if (isB(sa) && isB(sb)) {
    effects.push({ t: 'boardclear' });
    for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
      const cell = st.board[r][c];
      if (!cell) continue;
      if (cell.t === 'c') hit(st, r, c, clear, queue, qset, frostHits);
      else if (cell.t === 'f' || cell.t === 'x') {
        cell.hp--; if (cell.t === 'x') st._chocDamaged = true;
        frostHits.push({ r, c, hp: cell.hp, t: cell.t });
      }
    }
  } else if (isB(sa) || isB(sb)) {
    const other = isB(sa) ? OB : OA;
    const osp = isB(sa) ? sb : sa;
    const ocol = other.color;
    if (!osp) {
      effects.push({ t: 'colorwash', color: ocol });
      for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
        const cell = st.board[r][c];
        if (cell && cell.t === 'c' && cell.color === ocol) hit(st, r, c, clear, queue, qset, frostHits);
      }
    } else {
      const into = isS(osp) ? 'striped' : 'wrapped';
      effects.push({ t: 'colorwash', color: ocol, into });
      for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
        const cell = st.board[r][c];
        if (cell && cell.t === 'c' && cell.color === ocol) {
          cell.sp = into === 'striped' ? (st.rng() < 0.5 ? 'sh' : 'sv') : 'w';
          const k = key(r, c);
          if (!clear.has(k)) clear.set(k, { r, c });
          if (!qset.has(k)) { qset.add(k); queue.push({ r, c }); }
        }
      }
    }
  } else if (isS(sa) && isS(sb)) {
    effects.push({ t: 'beamH', r: a.r }, { t: 'beamV', c: a.c });
    for (let cc = 0; cc < st.cols; cc++) hit(st, a.r, cc, clear, queue, qset, frostHits);
    for (let rr = 0; rr < st.rows; rr++) hit(st, rr, a.c, clear, queue, qset, frostHits);
  } else if ((isS(sa) && isW(sb)) || (isW(sa) && isS(sb))) {
    effects.push({ t: 'megablast', r: a.r, c: a.c });
    for (let rr = a.r - 1; rr <= a.r + 1; rr++)
      for (let cc = 0; cc < st.cols; cc++) hit(st, rr, cc, clear, queue, qset, frostHits);
    for (let cc = a.c - 1; cc <= a.c + 1; cc++)
      for (let rr = 0; rr < st.rows; rr++) hit(st, rr, cc, clear, queue, qset, frostHits);
  } else if (isW(sa) && isW(sb)) {
    const mr = Math.round((a.r + b.r) / 2), mc = Math.round((a.c + b.c) / 2);
    effects.push({ t: 'blast', r: mr, c: mc, rad: 2 });
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++)
      hit(st, mr + dr, mc + dc, clear, queue, qset, frostHits);
  }
  drainQueue(st, clear, effects, queue, qset, frostHits);
  applyRoundTail(st, steps, 'combo', clear, effects, frostHits, 1, {});
}

/* ---------------- moves ---------------- */

const swappable = x => x && (x.t === 'c' || x.t === 'i');

function trySwap(st, a, b, swipeDir) {
  const steps = [];
  if (st.over) return { ok: false, steps };
  st._chocDamaged = false; // fresh move: chocolate spreads unless damaged
  if (!inB(st, a) || !inB(st, b) || !adjacent(a, b))
    return { ok: false, steps: [{ k: 'invalid', a, b }] };
  const A = st.board[a.r][a.c], B = st.board[b.r][b.c];
  if (!swappable(A) || !swappable(B))
    return { ok: false, steps: [{ k: 'invalid', a, b }] };
  st.board[a.r][a.c] = B;
  st.board[b.r][b.c] = A;
  const sa = A.sp, sb = B.sp;
  const bothCandy = A.t === 'c' && B.t === 'c';
  let combo = false;
  if (bothCandy && sa && sb) combo = true;
  else if (bothCandy && (sa === 'b' || sb === 'b')) combo = true;
  else if (findMatches(st.board).length === 0) {
    st.board[a.r][a.c] = A;
    st.board[b.r][b.c] = B;
    return { ok: false, steps: [{ k: 'invalid', a, b }] };
  }
  st.movesLeft--;
  steps.push({ k: 'swap', a: { r: a.r, c: a.c }, b: { r: b.r, c: b.c } });
  if (combo) { doCombo(st, a, b, sa, sb, steps); doCascades(st, steps, null, null); }
  else doCascades(st, steps, b, swipeDir);
  collectIngredients(st, steps);
  doCascades(st, steps, null, null);
  finishMove(st, steps);
  return { ok: true, steps };
}

/* Lollipop hammer: smash one cell for free — no move spent, no specials
   detonated. Frosting loses one layer; an ingredient is collected. */
function hammer(st, r, c) {
  const steps = [];
  if (st.over) return { ok: false, steps };
  st._chocDamaged = false;
  const p = { r, c };
  if (!inB(st, p)) return { ok: false, steps: [{ k: 'invalid', a: p, b: p }] };
  const cell = st.board[r][c];
  if (!cell) return { ok: false, steps: [{ k: 'invalid', a: p, b: p }] };
  const clear = new Map(), effects = [], queue = [], qset = new Set(), frostHits = [];
  let wasIngredient = false;
  if (cell.t === 'f' || cell.t === 'x') {
    cell.hp--; if (cell.t === 'x') st._chocDamaged = true;
    frostHits.push({ r, c, hp: cell.hp, t: cell.t });
  }
  else { cell.sp = null; wasIngredient = cell.t === 'i'; addClear(clear, r, c); }
  applyRoundTail(st, steps, 'hammer', clear, effects, frostHits, 1, {
    public: { hammerAt: { r, c } },
  });
  const step = steps[steps.length - 1];
  step.collected = [];
  if (wasIngredient) {
    st.ingredientsCollected++;
    st.score += 940; // +60 from the clear = 1000 total
    step.collected = [{ r, c }];
    step.gain += 940;
  }
  doCascades(st, steps, null, null);
  collectIngredients(st, steps);
  doCascades(st, steps, null, null);
  finishMove(st, steps);
  return { ok: true, steps };
}

function countIngredients(st) {
  let n = 0;
  for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
    const cell = st.board[r][c];
    if (cell && cell.t === 'i') n++;
  }
  return n;
}

/* Sweep ingredients sitting on the bottom row into the goal. Loops because
   gravity can drop more ingredients down after each collection. */
function collectIngredients(st, steps) {
  if (st.def.type !== 'ingredients') return;
  let guard = 0;
  for (;;) {
    const items = [];
    for (let c = 0; c < st.cols; c++) {
      const cell = st.board[st.rows - 1][c];
      if (cell && cell.t === 'i') {
        items.push({ r: st.rows - 1, c });
        st.board[st.rows - 1][c] = null;
        st.ingredientsCollected++;
      }
    }
    if (!items.length || guard++ > 12) break;
    const gain = items.length * 1000;
    st.score += gain;
    const fall = applyGravity(st);
    steps.push({ k: 'collect', items, gain, fall });
  }
}

/* Suggest a swap for idle hints: prefers forging specials, then big clears. */
function hint(st) {
  const swaps = validSwaps(st);
  if (!swaps.length) return null;
  let best = null, bestScore = -1;
  for (const [a, b] of swaps) {
    const A = st.board[a.r][a.c], B = st.board[b.r][b.c];
    st.board[a.r][a.c] = B; st.board[b.r][b.c] = A;
    const ms = findMatches(st.board);
    let score = 0;
    if (ms.length) {
      const clusters = clusterize(ms);
      for (const cl of clusters) {
        const plan = planCreation(st.board, cl, null, null);
        if (plan) score += plan.kind === 'b' ? 100 : plan.kind === 'w' ? 50 : 20;
        score += cl.cells.size;
      }
      if (A.sp || B.sp) score += 30;
    }
    st.board[a.r][a.c] = A; st.board[b.r][b.c] = B;
    if (score > bestScore) { bestScore = score; best = { a, b }; }
  }
  return best;
}

/* Non-mutating validity check (used by bot + UI hints). */
function swapValid(board, a, b) {
  const A = board[a.r][a.c], B = board[b.r][b.c];
  if (!swappable(A) || !swappable(B)) return false;
  if (A.t === 'c' && B.t === 'c' && ((A.sp && B.sp) || A.sp === 'b' || B.sp === 'b')) return true;
  board[a.r][a.c] = B; board[b.r][b.c] = A;
  const ok = findMatches(board).length > 0;
  board[a.r][a.c] = A; board[b.r][b.c] = B;
  return ok;
}

function validSwaps(st) {
  const out = [];
  for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= st.rows || nc >= st.cols) continue;
      const a = { r, c }, b = { r: nr, c: nc };
      if (swapValid(st.board, a, b)) out.push([a, b]);
    }
  }
  return out;
}

function hasPossibleMove(board) {
  const R = board.length, C = board[0].length;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const A = board[r][c];
    if (!swappable(A)) continue;
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= R || nc >= C) continue;
      const B = board[nr][nc];
      if (!swappable(B)) continue;
      if (A.t === 'c' && B.t === 'c' && ((A.sp && B.sp) || A.sp === 'b' || B.sp === 'b')) return true;
      board[r][c] = B; board[nr][nc] = A;
      const m = findMatches(board).length > 0;
      board[r][c] = A; board[nr][nc] = B;
      if (m) return true;
    }
  }
  return false;
}

function shuffleBoard(st) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const items = [];
    for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
      const cell = st.board[r][c];
      if (cell && cell.t === 'c') items.push({ color: cell.color, sp: cell.sp });
    }
    for (let i = items.length - 1; i > 0; i--) {
      const j = (st.rng() * (i + 1)) | 0;
      const t = items[i]; items[i] = items[j]; items[j] = t;
    }
    let i = 0;
    for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
      const cell = st.board[r][c];
      if (cell && cell.t === 'c') { cell.color = items[i].color; cell.sp = items[i].sp; i++; }
    }
    if (findMatches(st.board).length === 0 && hasPossibleMove(st.board)) {
      const tiles = [];
      for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
        const cell = st.board[r][c];
        if (cell && cell.t === 'c') tiles.push({ r, c, color: cell.color, special: cell.sp });
      }
      return tiles;
    }
  }
  return [];
}

/* ---------------- win / lose ---------------- */

function checkWin(st) {
  const g = st.def.goal || {};
  if (st.def.type === 'score') return st.score >= (g.score || 0);
  if (st.def.type === 'jelly') {
    for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++)
      if (st.jelly[r][c] > 0) return false;
    return true;
  }
  if (st.def.type === 'order') {
    for (const k in st.ordersLeft) if (st.ordersLeft[k] > 0) return false;
    return true;
  }
  if (st.def.type === 'mixed') {
    for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++)
      if (st.jelly[r][c] > 0) return false;
    for (const k in st.ordersLeft) if (st.ordersLeft[k] > 0) return false;
    return true;
  }
  if (st.def.type === 'ingredients') {
    return st.ingredientsCollected >= (g.ingredients || 0);
  }
  return false;
}

/* Pick a random plain candy cell, preferring cells with jelly underneath
   (so Sugar Crush fireworks help jelly levels most). */
function randomCandyCell(st) {
  const jelly = [], plain = [];
  for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
    const cell = st.board[r][c];
    if (cell && cell.t === 'c' && !cell.sp) {
      (st.jelly[r][c] > 0 ? jelly : plain).push({ r, c });
    }
  }
  const pool = jelly.length ? jelly : plain;
  if (!pool.length) return null;
  return pool[(st.rng() * pool.length) | 0];
}

/* Sugar Crush fireworks: every leftover move becomes a free striped candy
   that auto-detonates, after all pre-existing board specials fire in
   reading order. Pure celebration — no moves spent, cascades resolve. */
function sugarCrush(st, steps) {
  let first = true; // the very first sugar step carries the banner
  // 1. pre-existing specials fire in reading order
  for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
    const cell = st.board[r][c];
    if (!cell || cell.t !== 'c' || !cell.sp) continue;
    const clear = new Map(), effects = [], queue = [], qset = new Set(), frostHits = [];
    queue.push({ r, c }); qset.add(key(r, c));
    drainQueue(st, clear, effects, queue, qset, frostHits);
    applyRoundTail(st, steps, 'sugar', clear, effects, frostHits, 1,
      { public: { first } });
    first = false;
    doCascades(st, steps, null, null);
  }
  const moves = st.movesLeft;
  if (moves <= 0) return;
  // 2. leftover moves spawn striped candy, batched into <= 8 visual beats
  const nSteps = Math.min(moves, 8);
  const per = Math.ceil(moves / nSteps);
  let remaining = moves;
  for (let s = 0; s < nSteps && remaining > 0; s++) {
    const n = Math.min(per, remaining);
    remaining -= n;
    const spawns = [];
    for (let i = 0; i < n; i++) {
      const p = randomCandyCell(st);
      if (!p) break;
      const cell = st.board[p.r][p.c];
      cell.sp = st.rng() < 0.5 ? 'sh' : 'sv';
      spawns.push({ r: p.r, c: p.c, special: cell.sp, color: cell.color });
    }
    if (!spawns.length) break;
    const clear = new Map(), effects = [], queue = [], qset = new Set(), frostHits = [];
    for (const sp of spawns) { queue.push({ r: sp.r, c: sp.c }); qset.add(key(sp.r, sp.c)); }
    drainQueue(st, clear, effects, queue, qset, frostHits);
    applyRoundTail(st, steps, 'sugar', clear, effects, frostHits, 1,
      { public: { spawns, first } });
    first = false;
    doCascades(st, steps, null, null);
  }
}

/* Chocolate: spreads to one adjacent plain candy per move, unless any
   chocolate was damaged that turn. */
function spreadChocolate(st, steps) {
  if (st._chocDamaged) return;
  const choc = [];
  for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
    const cell = st.board[r][c];
    if (cell && cell.t === 'x') choc.push({ r, c });
  }
  if (!choc.length) return;
  const src = choc[(st.rng() * choc.length) | 0];
  const opts = [];
  for (const [dr, dc] of DIRS) {
    const nr = src.r + dr, nc = src.c + dc;
    if (nr < 0 || nr >= st.rows || nc < 0 || nc >= st.cols) continue;
    const cell = st.board[nr][nc];
    if (cell && cell.t === 'c' && !cell.sp) opts.push({ r: nr, c: nc });
  }
  if (!opts.length) return;
  const p = opts[(st.rng() * opts.length) | 0];
  st.board[p.r][p.c] = { t: 'x', hp: 1 };
  steps.push({ k: 'choc', grows: [{ r: p.r, c: p.c }] });
}

function finishMove(st, steps) {
  if (checkWin(st)) {
    st.won = true; st.over = true;
    sugarCrush(st, steps);
    st.endBonus = st.movesLeft * 250;
    st.score += st.endBonus;
    const s = st.def.stars || [0, 0, 0];
    const s3 = s[3] != null ? s[3] : Math.round(s[2] * 1.6); // Sugar Star: far above 3-star
    st.stars = st.score >= s3 ? 4 : st.score >= s[2] ? 3 : st.score >= s[1] ? 2 : 1;
    steps.push({ k: 'end', won: true, stars: st.stars, score: st.score, bonus: st.endBonus, best: st.cascadeBest });
    return;
  }
  spreadChocolate(st, steps);
  // ingredient dispenser cadence
  if (st.def.type === 'ingredients') {
    st.movesUsed++;
    const goal = (st.def.goal && st.def.goal.ingredients) || 0;
    const every = st.def.ingredientEvery || 5;
    if (st.ingredientsSpawned < goal && countIngredients(st) < 3 && st.movesUsed % every === 0) {
      st.pendingIngredient = true;
    }
  }
  if (st.movesLeft <= 0) {
    st.over = true;
    steps.push({ k: 'end', won: false, score: st.score, best: st.cascadeBest });
    return;
  }
  if (!hasPossibleMove(st.board)) {
    steps.push({ k: 'shuffle', tiles: shuffleBoard(st) });
  }
}

/* Simple random bot for tuning + smoke tests. */
function botPlay(def, seed) {
  const st = newGame(def, seed);
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  let moves = 0;
  while (!st.over && moves < 500) {
    const swaps = validSwaps(st);
    if (!swaps.length) break;
    const [a, b] = swaps[(rng() * swaps.length) | 0];
    trySwap(st, a, b);
    moves++;
  }
  return { won: st.won, score: st.score, stars: st.stars, moves };
}

return {
  newGame, trySwap, hammer, hint, findMatches, hasPossibleMove, validSwaps,
  swapValid, checkWin, botPlay, shuffleBoard, mulberry32,
  gridFromStrings,
};

})();

if (typeof module !== 'undefined' && module.exports) module.exports = CC;
