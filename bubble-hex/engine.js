/* Bubble Hex engine — bubble shooter logic (no DOM).
 * Hex grid with offset rows. Bubbles snap to nearest empty cell on collision.
 * Pops: 3+ connected same-color. Orphans: disconnected from top row fall.
 */
'use strict';

var COLORS = ['R', 'B', 'G', 'Y', 'P']; // red blue green yellow purple
var ROWS = 12, COLS = 11;

/* Cell key helpers */
function key(r, c) { return r + ',' + c; }
function parseKey(k) { var p = k.split(','); return [+p[0], +p[1]]; }

/* Hex neighbors for offset ("odd-r") grid */
function neighbors(r, c) {
  var odd = (r % 2) === 1;
  var d = odd
    ? [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]]
    : [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];
  var out = [];
  for (var i = 0; i < d.length; i++) {
    var nr = r + d[i][0], nc = c + d[i][1];
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) out.push([nr, nc]);
  }
  return out;
}

/* Create empty board: map key -> bubble object {color, special} */
function newBoard() { return {}; }
function get(b, r, c) { return b[key(r, c)] || null; }
function set(b, r, c, bub) { b[key(r, c)] = bub; }
function del(b, r, c) { delete b[key(r, c)]; }

/* Flood fill from (r,c) matching color (rainbow matches all).
 * Black 'K' doom bubbles never join a cluster — they can't be popped by
 * color matching (BWS3 trouble bubble); only drops and blasts remove them. */
function findCluster(board, r, c) {
  var start = get(board, r, c);
  if (!start || start.color === 'K') return [];
  var target = start.color;
  var seen = {}, out = [], stack = [[r, c]];
  seen[key(r, c)] = 1;
  while (stack.length) {
    var rc = stack.pop(), cr = rc[0], cc = rc[1];
    var bub = get(board, cr, cc);
    if (!bub) continue;
    if (bub.color === 'K') continue;
    if (bub.color !== 'W' && target !== 'W' && bub.color !== target) continue;
    out.push([cr, cc, bub.color]);
    var ns = neighbors(cr, cc);
    for (var i = 0; i < ns.length; i++) {
      var k = key(ns[i][0], ns[i][1]);
      if (!seen[k] && get(board, ns[i][0], ns[i][1])) { seen[k] = 1; stack.push(ns[i]); }
    }
  }
  return out;
}

/* All cells connected to top row (row 0) */
function findAnchored(board) {
  var seen = {}, stack = [];
  for (var c = 0; c < COLS; c++) {
    if (get(board, 0, c)) { seen[key(0, c)] = 1; stack.push([0, c]); }
  }
  while (stack.length) {
    var rc = stack.pop();
    var ns = neighbors(rc[0], rc[1]);
    for (var i = 0; i < ns.length; i++) {
      var k = key(ns[i][0], ns[i][1]);
      if (!seen[k] && get(board, ns[i][0], ns[i][1])) { seen[k] = 1; stack.push(ns[i]); }
    }
  }
  return seen;
}

/* Resolve a placed bubble: returns {popped: [[r,c]], dropped: [[r,c]], score} */
function resolveBoard(board, r, c) {
  var popped = [], dropped = [], score = 0;
  var placed = get(board, r, c);

  // Bomb bubble: clears radius 2 (explosions DO crack black doom bubbles)
  if (placed && placed.special === 'bomb') {
    var seen = {};
    var q = [[r, c, 0]];
    seen[key(r, c)] = 1;
    while (q.length) {
      var cur = q.shift();
      var cb = get(board, cur[0], cur[1]);
      popped.push([cur[0], cur[1], cb ? cb.color : '?']);
      if (cur[2] < 2) {
        var ns = neighbors(cur[0], cur[1]);
        for (var i = 0; i < ns.length; i++) {
          var k = key(ns[i][0], ns[i][1]);
          if (!seen[k] && get(board, ns[i][0], ns[i][1])) { seen[k] = 1; q.push([ns[i][0], ns[i][1], cur[2] + 1]); }
        }
      }
    }
  } else if (placed && placed.special === 'lightning') {
    // Lightning: clears entire row (cracks black doom bubbles too)
    for (var cc = 0; cc < COLS; cc++) {
      var lb = get(board, r, cc);
      if (lb) popped.push([r, cc, lb.color]);
    }
  } else {
    var cluster = findCluster(board, r, c);
    if (cluster.length >= 3) popped = cluster;
  }

  // Remove popped
  for (var i = 0; i < popped.length; i++) {
    del(board, popped[i][0], popped[i][1]);
    score += 100;
  }
  // Chain bonus
  if (popped.length >= 6) score += (popped.length - 5) * 50;

  // Orphans drop (black doom bubbles drop like anything else)
  var anchored = findAnchored(board);
  var allKeys = Object.keys(board);
  for (var i = 0; i < allKeys.length; i++) {
    if (!anchored[allKeys[i]]) {
      var db = board[allKeys[i]];
      dropped.push([parseKey(allKeys[i])[0], parseKey(allKeys[i])[1], db ? db.color : '?']);
      score += 50;
    }
  }
  for (var i = 0; i < dropped.length; i++) del(board, dropped[i][0], dropped[i][1]);

  return { popped: popped, dropped: dropped, score: score };
}

/* Colors currently on board (for shooter generation) */
function boardColors(board) {
  var s = {};
  Object.keys(board).forEach(function (k) {
    var b = board[k];
    if (b.color !== 'W' && b.color !== 'K' && b.color !== 'X') s[b.color] = 1;
  });
  var out = Object.keys(s);
  return out.length ? out : COLORS.slice();
}

/* Geometry: cell center in pixels. GRID_DX centers the grid horizontally
   (set by the UI after R is known); defaults to 0 so engine tests are unaffected. */
var GRID_DX = 0;
function cellXY(r, c, R) {
  var x = GRID_DX + R + c * 2 * R + (r % 2 ? R : 0);
  var y = R + r * R * 1.732;
  return [x, y];
}

/* Find nearest empty cell to pixel point */
function nearestEmptyCell(board, px, py, R) {
  var best = null, bestD = 1e9;
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      if (get(board, r, c)) continue;
      var xy = cellXY(r, c, R);
      var d = (xy[0] - px) * (xy[0] - px) + (xy[1] - py) * (xy[1] - py);
      if (d < bestD) { bestD = d; best = [r, c]; }
    }
  }
  return best;
}

/* Check if cell is adjacent to an existing bubble or top row */
function isAttachable(board, r, c) {
  if (r === 0) return true;
  var ns = neighbors(r, c);
  for (var i = 0; i < ns.length; i++) {
    if (get(board, ns[i][0], ns[i][1])) return true;
  }
  return false;
}

if (typeof module !== 'undefined') {
  module.exports = {
    COLORS: COLORS, ROWS: ROWS, COLS: COLS,
    newBoard: newBoard, get: get, set: set, del: del,
    neighbors: neighbors, findCluster: findCluster, findAnchored: findAnchored,
    resolveBoard: resolveBoard, boardColors: boardColors,
    cellXY: cellXY, nearestEmptyCell: nearestEmptyCell, isAttachable: isAttachable,
    key: key, setGridDX: function (dx) { GRID_DX = dx; }, gridDX: function () { return GRID_DX; }
  };
}
if (typeof window !== 'undefined') {
  window.HexEngine = {
    COLORS: COLORS, ROWS: ROWS, COLS: COLS,
    newBoard: newBoard, get: get, set: set, del: del,
    neighbors: neighbors, findCluster: findCluster, findAnchored: findAnchored,
    resolveBoard: resolveBoard, boardColors: boardColors,
    cellXY: cellXY, nearestEmptyCell: nearestEmptyCell, isAttachable: isAttachable,
    key: key, setGridDX: function (dx) { GRID_DX = dx; }, gridDX: function () { return GRID_DX; }
  };
}
