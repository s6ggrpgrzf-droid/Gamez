'use strict';
/* The Night Shelf — pure sim. No DOM, no canvas: testable headless in node.
   Geometry: half-tile units; every tile's footprint is 2x2.
   Turtle layout coordinates adapted from an MIT-licensed reference
   (secaicandido/mahjong, (c) Claudio Candido) — data only. */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildLayout() {
  const p = [];
  const range = (a, b) => { const o = []; for (let i = a; i <= b; i += 2) o.push(i); return o; };
  const rows = [
    [0, range(2, 24)], [2, range(6, 20)], [4, range(4, 22)], [6, range(2, 24)],
    [8, range(2, 24)], [10, range(4, 22)], [12, range(6, 20)], [14, range(2, 24)],
  ];
  for (const [y, xs] of rows) for (const x of xs) p.push({ x, y, z: 0 });
  p.push({ x: 0, y: 7, z: 0 }, { x: 26, y: 7, z: 0 }, { x: 28, y: 7, z: 0 });
  const grid = (z, xs, ys) => { for (const y of ys) for (const x of xs) p.push({ x, y, z }); };
  grid(1, range(8, 18), range(2, 12));
  grid(2, range(10, 16), range(4, 10));
  grid(3, range(12, 14), range(6, 8));
  p.push({ x: 13, y: 7, z: 4 });
  return p;
}

const LAYOUT = buildLayout();
const FAMILIES = ['moon', 'vial', 'herb', 'key', 'candle', 'bell', 'moth', 'scroll'];
const FACE_COUNT = 72; // 8 families x 9 ranks; face id = family*9 + (rank-1); each face dealt exactly twice

function overlaps(a, b) { return a.x < b.x + 2 && a.x + 2 > b.x && a.y < b.y + 2 && a.y + 2 > b.y; }
function yOverlap(a, b) { return a.y < b.y + 2 && a.y + 2 > b.y; }

/* A position is free among the set of still-standing position indices when:
   - nothing standing on a higher layer overlaps its footprint, and
   - it is not closed on BOTH long sides: a same-layer neighbour whose
     footprint crosses the one-unit strip beside the tile blocks that side. */
function isFreePos(idx, standing, pos) {
  const t = pos[idx];
  let left = false, right = false;
  for (const j of standing) {
    if (j === idx) continue;
    const o = pos[j];
    if (o.z > t.z && overlaps(o, t)) return false;
    if (o.z === t.z && yOverlap(o, t)) {
      if (o.x < t.x && o.x + 2 > t.x - 1) left = true;
      if (o.x > t.x && o.x < t.x + 3) right = true;
    }
  }
  return !(left && right);
}

function shuffled(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

/* Deal by construction: walk the layout down in legal pairs. The recorded
   order is a proof the shelf can be cleared — a loss is never the deal's fault. */
function dealFaces(seed) {
  const rand = mulberry32(seed);
  const pos = LAYOUT;
  for (let attempt = 0; attempt < 800; attempt++) {
    const faces = shuffled(Array.from({ length: FACE_COUNT }, (_, i) => i), rand);
    const standing = new Set(pos.map((_, i) => i));
    const assign = new Array(pos.length);
    const order = [];
    let ok = true;
    for (let pair = 0; pair < FACE_COUNT; pair++) {
      const free = [];
      for (const i of standing) if (isFreePos(i, standing, pos)) free.push(i);
      if (free.length < 2) { ok = false; break; }
      const a = free[Math.floor(rand() * free.length)];
      let b = a;
      while (b === a) b = free[Math.floor(rand() * free.length)];
      assign[a] = faces[pair]; assign[b] = faces[pair];
      standing.delete(a); standing.delete(b);
      order.push([a, b]);
    }
    if (ok) return { assign, order };
  }
  throw new Error('dealer could not construct a shelf');
}

function newGame(seed) {
  const dealt = dealFaces(seed);
  return {
    seed,
    tiles: LAYOUT.map((p, i) => ({ id: i, x: p.x, y: p.y, z: p.z, face: dealt.assign[i], removed: false })),
    solution: dealt.order,
    moves: [],        // [[tileIdA, tileIdB], ...]
    reshuffles: 1,
    status: 'playing', // 'playing' | 'won' | 'stuck'
  };
}

function tileFree(game, tile) {
  if (tile.removed) return false;
  const standing = new Set();
  for (const t of game.tiles) if (!t.removed) standing.add(t.id);
  return isFreePos(tile.id, standing, game.tiles);
}

function freeTiles(game) { return game.tiles.filter(t => tileFree(game, t)); }

function availableMoves(game) {
  const byFace = new Map();
  for (const t of freeTiles(game)) {
    if (!byFace.has(t.face)) byFace.set(t.face, []);
    byFace.get(t.face).push(t.id);
  }
  const out = [];
  for (const ids of byFace.values()) if (ids.length >= 2) out.push([ids[0], ids[1]]);
  return out;
}

function remainingCount(game) { return game.tiles.reduce((n, t) => n + (t.removed ? 0 : 1), 0); }

function refreshStatus(game) {
  if (remainingCount(game) === 0) game.status = 'won';
  else if (availableMoves(game).length === 0) game.status = 'stuck';
  else game.status = 'playing';
  return game.status;
}

function applyMove(game, a, b) {
  const ta = game.tiles[a], tb = game.tiles[b];
  if (!ta || !tb || a === b || ta.face !== tb.face) return false;
  if (!tileFree(game, ta) || !tileFree(game, tb)) return false;
  ta.removed = true; tb.removed = true;
  game.moves.push([a, b]);
  refreshStatus(game);
  return true;
}

function undo(game) {
  const m = game.moves.pop();
  if (!m) return false;
  game.tiles[m[0]].removed = false;
  game.tiles[m[1]].removed = false;
  game.status = 'playing';
  return true;
}

function hint(game) {
  const moves = availableMoves(game);
  return moves.length ? moves[0] : null;
}

/* Reshuffle the standing tiles by the same construction: the faces on the
   table are whole pairs (pairs only ever leave together), so the remainder
   can always be re-dealt into a clearable arrangement. Clears undo history:
   the shelf you had is gone; this is a new arrangement of what's left. */
function reshuffle(game, seedSalt) {
  if (game.reshuffles < 1) return false;
  const standingIds = game.tiles.filter(t => !t.removed).map(t => t.id);
  if (standingIds.length < 2) return false;
  const rand = mulberry32((game.seed ^ 0x9E3779B9) + (seedSalt || 0));
  const pairFaces = [];
  const counts = new Map();
  for (const id of standingIds) {
    const f = game.tiles[id].face;
    counts.set(f, (counts.get(f) || 0) + 1);
  }
  for (const [f, c] of counts) { if (c % 2 !== 0) return false; for (let k = 0; k < c / 2; k++) pairFaces.push(f); }
  const pos = game.tiles;
  for (let attempt = 0; attempt < 800; attempt++) {
    const bag = shuffled(pairFaces.slice(), rand);
    const standing = new Set(standingIds);
    const assign = new Map();
    let ok = true;
    for (let k = 0; k < bag.length; k++) {
      const free = [];
      for (const i of standing) if (isFreePos(i, standing, pos)) free.push(i);
      if (free.length < 2) { ok = false; break; }
      const a = free[Math.floor(rand() * free.length)];
      let b = a;
      while (b === a) b = free[Math.floor(rand() * free.length)];
      assign.set(a, bag[k]); assign.set(b, bag[k]);
      standing.delete(a); standing.delete(b);
    }
    if (ok) {
      for (const [id, f] of assign) game.tiles[id].face = f;
      game.moves = [];
      game.reshuffles -= 1;
      game.status = 'playing';
      return true;
    }
  }
  return false;
}

/* A hand-laid game on any position list — the teaching shelf lives here.
   faces[i] is the face dealt to position i. */
function customGame(positions, faces) {
  return {
    seed: -1,
    tiles: positions.map((p, i) => ({ id: i, x: p.x, y: p.y, z: p.z, face: faces[i], removed: false })),
    solution: null,
    moves: [],
    reshuffles: 0,
    status: 'playing',
  };
}

/* Why a tile stays: 'covered' (a tile rests on it), 'shut' (closed on both
   long sides), or 'free'. The coach teaches by naming the reason. */
function heldReason(game, tile) {
  if (tile.removed) return 'free';
  let left = false, right = false;
  for (const o of game.tiles) {
    if (o === tile || o.removed) continue;
    if (o.z > tile.z && overlaps(o, tile)) return 'covered';
    if (o.z === tile.z && yOverlap(o, tile)) {
      if (o.x < tile.x && o.x + 2 > tile.x - 1) left = true;
      if (o.x > tile.x && o.x < tile.x + 3) right = true;
    }
  }
  return left && right ? 'shut' : 'free';
}

const NS = { mulberry32, LAYOUT, FAMILIES, FACE_COUNT, overlaps, yOverlap, isFreePos, dealFaces, newGame, customGame, heldReason, tileFree, freeTiles, availableMoves, remainingCount, refreshStatus, applyMove, undo, hint, reshuffle };
if (typeof module !== 'undefined' && module.exports) module.exports = NS;
if (typeof window !== 'undefined') window.NS = NS;
