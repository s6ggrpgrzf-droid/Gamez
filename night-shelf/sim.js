'use strict';
/* The Night Shelf — pure sim. No DOM, no canvas: testable headless in node.
   Geometry: half-tile units; every tile's footprint is 2x2.
   Turtle layout coordinates adapted from an MIT-licensed reference
   (secaicandido/mahjong, (c) Claudio Candido) — data only.

   Faces are the traditional mahjong set, dealt whole: the three suits
   (Dots, Bamboo, Characters, 1-9), the four Winds and the three Dragons,
   four copies each; the four Flowers and the four Seasons, one each.
   Matching is by kind: identical faces match, and — as tradition allows —
   any Flower matches any Flower, any Season any Season. */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const range2 = (a, b) => { const o = []; for (let i = a; i <= b; i += 2) o.push(i); return o; };
function gridInto(p, z, xs, ys) { for (const y of ys) for (const x of xs) p.push({ x, y, z }); }
function ringInto(p, z, xs, ys) {
  for (const x of xs) { p.push({ x, y: ys[0], z }); p.push({ x, y: ys[ys.length - 1], z }); }
  for (let i = 1; i < ys.length - 1; i++) { p.push({ x: xs[0], y: ys[i], z }); p.push({ x: xs[xs.length - 1], y: ys[i], z }); }
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

/* The other shelves — classic shapes in the same half-unit language, each
   exactly 144 slots so the whole traditional set deals onto any of them.
   The Turtle stays the shelf itself: the daily, the cover, the default. */
function buildPyramid() {
  const p = [];
  gridInto(p, 0, range2(2, 22), range2(2, 14));
  gridInto(p, 1, range2(4, 20), range2(4, 12));
  gridInto(p, 2, range2(6, 18), range2(6, 10));
  p.push({ x: 12, y: 8, z: 3 });
  return p;
}
function buildFortress() {
  const p = [];
  gridInto(p, 0, range2(0, 22), range2(0, 14));
  ringInto(p, 1, range2(0, 22), range2(0, 14));
  gridInto(p, 1, range2(8, 14), range2(6, 8));
  p.push({ x: 0, y: 0, z: 2 }, { x: 22, y: 0, z: 2 }, { x: 0, y: 14, z: 2 }, { x: 22, y: 14, z: 2 });
  return p;
}
function buildSpider() {
  const p = [];
  gridInto(p, 0, range2(10, 24), range2(4, 16));
  gridInto(p, 1, range2(12, 22), range2(6, 14));
  gridInto(p, 2, range2(16, 18), range2(8, 10));
  for (const y of [4, 8, 12, 16]) { gridInto(p, 0, range2(2, 8), [y]); gridInto(p, 0, range2(26, 32), [y]); }
  for (const y of [2, 18]) { gridInto(p, 0, range2(2, 8), [y]); gridInto(p, 0, range2(26, 32), [y]); }
  p.push({ x: 34, y: 8, z: 0 }, { x: 34, y: 12, z: 0 }, { x: 0, y: 2, z: 0 }, { x: 34, y: 2, z: 0 }, { x: 0, y: 18, z: 0 }, { x: 34, y: 18, z: 0 });
  return p;
}
function buildArena() {
  const p = [];
  gridInto(p, 0, range2(0, 8), range2(0, 14));
  gridInto(p, 0, range2(18, 26), range2(0, 14));
  gridInto(p, 0, range2(10, 16), range2(0, 2));
  gridInto(p, 0, range2(10, 16), range2(12, 14));
  gridInto(p, 1, range2(0, 4), range2(2, 12));
  gridInto(p, 1, range2(22, 26), range2(2, 12));
  gridInto(p, 1, range2(10, 16), range2(6, 8));
  p.push({ x: 2, y: 6, z: 2 }, { x: 2, y: 8, z: 2 }, { x: 24, y: 6, z: 2 }, { x: 24, y: 8, z: 2 });
  return p;
}
const LAYOUTS = { turtle: LAYOUT, pyramid: buildPyramid(), fortress: buildFortress(), spider: buildSpider(), arena: buildArena() };

/* ---------- the traditional faces ---------- */
const SUITS = ['dot', 'bam', 'char'];
const WIND_FACES = ['windE', 'windS', 'windW', 'windN'];
const DRAGON_FACES = ['dragR', 'dragG', 'dragW'];
const FLOWER_FACES = ['flo1', 'flo2', 'flo3', 'flo4'];
const SEASON_FACES = ['sea1', 'sea2', 'sea3', 'sea4'];

/* The match group of a face: Flowers share one group, Seasons share one,
   everything else matches only itself. */
function matchKey(face) {
  if (typeof face === 'string') {
    if (face.startsWith('flo')) return 'FLOWERS';
    if (face.startsWith('sea')) return 'SEASONS';
  }
  return face;
}
function facesMatch(a, b) { return matchKey(a) === matchKey(b); }

/* The 72 pairings a full set deals into. Identical faces pair with
   themselves; the Flowers and Seasons pair within their own four. */
function pairSpecs() {
  const specs = [];
  for (const s of SUITS) for (let n = 1; n <= 9; n++) { specs.push([s + n, s + n]); specs.push([s + n, s + n]); }
  for (const f of WIND_FACES.concat(DRAGON_FACES)) { specs.push([f, f]); specs.push([f, f]); }
  specs.push(['flo1', 'flo2'], ['flo3', 'flo4'], ['sea1', 'sea2'], ['sea3', 'sea4']);
  return specs;
}
/* Face -> copies in a fresh set (144 tiles in all). */
const CENSUS = (() => {
  const c = {};
  for (const [a, b] of pairSpecs()) { c[a] = (c[a] || 0) + 1; c[b] = (c[b] || 0) + 1; }
  return c;
})();

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

/* Deal at random, the old way (his call, 2026-10-29 — option C): the
   whole set shuffled and laid onto the shelf as it falls. No solution is
   recorded, because none is promised: most shelves can be cleared, some
   cannot, and the free reshuffle answers a shelf that walls you in. */
function dealFaces(seed, pos) {
  const rand = mulberry32(seed);
  pos = pos || LAYOUT;
  const faces = [];
  for (const [a, b] of pairSpecs()) { faces.push(a, b); }
  shuffled(faces, rand);
  const assign = new Array(pos.length);
  for (let i = 0; i < pos.length; i++) assign[i] = faces[i];
  return { assign, order: null };
}

function newGame(seed, layoutName) {
  const name = LAYOUTS[layoutName] ? layoutName : 'turtle';
  const pos = LAYOUTS[name];
  const dealt = dealFaces(seed, pos);
  let mx = 0, my = 0;
  for (const p of pos) { if (p.x > mx) mx = p.x; if (p.y > my) my = p.y; }
  return {
    seed,
    layout: name,
    space: { W: mx + 3.6, H: my + 3.6 },
    tiles: pos.map((p, i) => ({ id: i, x: p.x, y: p.y, z: p.z, face: dealt.assign[i], removed: false })),
    solution: dealt.order,
    moves: [],        // [[tileIdA, tileIdB], ...]
    reshuffles: 0,    // a count of reshuffles USED — they are unlimited and free; the ledger notes them
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
  const byKey = new Map();
  for (const t of freeTiles(game)) {
    const k = matchKey(t.face);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(t.id);
  }
  const out = [];
  for (const ids of byKey.values()) if (ids.length >= 2) out.push([ids[0], ids[1]]);
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
  if (!ta || !tb || a === b || !facesMatch(ta.face, tb.face)) return false;
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

/* The hint earns its keep (developer-review fix 2, Oct 29). Every pairing
   of free matching tiles is scored by how many standing tiles it sets
   free — the move that opens the shelf — tie-broken by how much the pair
   was holding down in total. Returns [idA, idB] or null. The old hint
   returned the first pair in list order, which could quietly be the
   worst move on the board. */
function hint(game) {
  const free = freeTiles(game);
  const byKey = new Map();
  for (const t of free) {
    const k = matchKey(t.face);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(t);
  }
  const freeNow = new Set(free.map(t => t.id));
  let best = null, bestFreed = -1, bestHold = -1;
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const a = group[i], b = group[j];
      a.removed = b.removed = true;
      let freed = 0;
      for (const t of game.tiles) if (!t.removed && !freeNow.has(t.id) && tileFree(game, t)) freed++;
      let hold = 0;
      for (const t of game.tiles) if (!t.removed && (overlaps(t, a) || overlaps(t, b))) hold++;
      a.removed = b.removed = false;
      if (freed > bestFreed || (freed === bestFreed && hold > bestHold)) {
        bestFreed = freed; bestHold = hold; best = [a.id, b.id];
      }
    }
  }
  return best;
}

/* Reshuffle: the standing tiles' own faces, shuffled among the standing
   positions — the same tiles re-dealt at random, exactly as a fresh shelf
   is dealt. What stands is always whole match-groups (pairs only ever
   leave together), so the faces still pair up; whether the new
   arrangement can be cleared is the deal's luck, as it is on any shelf.
   Clears undo history; no solution is recorded. */
function reshuffle(game, seedSalt) {
  const standingIds = game.tiles.filter(t => !t.removed).map(t => t.id);
  if (standingIds.length < 2 || standingIds.length % 2 !== 0) return false;
  const rand = mulberry32((game.seed ^ 0x9E3779B9) + (seedSalt || 0));
  const faces = shuffled(standingIds.map(id => game.tiles[id].face), rand);
  standingIds.forEach((id, i) => { game.tiles[id].face = faces[i]; });
  game.moves = [];
  game.solution = null;
  game.reshuffles += 1;
  game.status = 'playing';
  return true;
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

const NS = { mulberry32, LAYOUT, LAYOUTS, SUITS, WIND_FACES, DRAGON_FACES, FLOWER_FACES, SEASON_FACES, CENSUS, matchKey, facesMatch, pairSpecs, overlaps, yOverlap, isFreePos, dealFaces, newGame, customGame, heldReason, tileFree, freeTiles, availableMoves, remainingCount, reshuffle, refreshStatus, applyMove, undo, hint };
if (typeof module !== 'undefined' && module.exports) module.exports = NS;
if (typeof window !== 'undefined') window.NS = NS;
