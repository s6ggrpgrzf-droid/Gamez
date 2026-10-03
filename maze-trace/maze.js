/* Arrow Slide — line-art arrow puzzle (Amaze GO-style).
 *
 * Arrows are winding line-art paths: each is an orthogonal polyline of cells
 * (tail -> head) drawn as one thin line with a small arrowhead. Shapes range
 * from straight bars to L, U, zigzag and spiral paths, scaled by difficulty.
 *
 * Rule (unchanged): tap an arrow; if the straight ray from its HEAD in its
 * head direction is clear of every arrow segment, the whole path slides off
 * the board. Clear all arrows to win. Wrong taps cost drops.
 *
 * generate() accepts an rng (default Math.random) so daily boards can be
 * deterministic via a seeded PRNG.
 */
'use strict';
(function (root) {
  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]; // N E S W

  function key(x, y) { return x + ',' + y; }
  function defaultRng() { return Math.random(); }

  // cells occupied by an arrow: its polyline points (tail -> head)
  function occupied(a) { return a.pts; }
  function headOf(a) { return a.pts[a.pts.length - 1]; }
  function headDirOf(a) { return a.dir; }

  // downstream cells from the head to the board edge, exclusive of the head
  function pathCells(w, h, a) {
    var hd = headOf(a), cells = [];
    var cx = hd[0] + DX[a.dir], cy = hd[1] + DY[a.dir];
    while (cx >= 0 && cy >= 0 && cx < w && cy < h) {
      cells.push([cx, cy]);
      cx += DX[a.dir]; cy += DY[a.dir];
    }
    return cells;
  }

  // true if any of the arrow's own cells lie on its exit ray.
  // such an arrow could never leave (its body can't move), so placement
  // must reject it — otherwise the board could deadlock.
  function selfBlocked(a) {
    var own = {};
    a.pts.forEach(function (p) { own[key(p[0], p[1])] = 1; });
    return pathCells(a.bw, a.bh, a).some(function (c) { return own[key(c[0], c[1])]; });
  }

  // deadlock detection: A -> B when B sits on A's exit ray. A cycle means
  // no move order can ever clear the board.
  function hasCycle(arrows, occ) {
    var ids = Object.keys(arrows);
    var adj = {};
    ids.forEach(function (id) { adj[id] = []; });
    ids.forEach(function (id) {
      var a = arrows[id];
      pathCells(a.bw, a.bh, a).forEach(function (c) {
        var oid = occ[key(c[0], c[1])];
        if (oid && oid !== id && adj[id].indexOf(oid) < 0) adj[id].push(oid);
      });
    });
    var state = {};
    function visit(id) {
      if (state[id] === 1) return true;
      if (state[id] === 2) return false;
      state[id] = 1;
      for (var i = 0; i < adj[id].length; i++) if (visit(adj[id][i])) return true;
      state[id] = 2;
      return false;
    }
    for (var i = 0; i < ids.length; i++) if (visit(ids[i])) return true;
    return false;
  }

  var LEFT = [3, 0, 1, 2], RIGHT = [1, 2, 3, 0]; // 90-degree turns

  // Random-walk placement: grow a len-cell orthogonal path from a free cell.
  // windy: 0 = always straight, higher = more turns (spirals emerge).
  function tryPlace(w, h, occ, rng, len, wind) {
    for (var att = 0; att < 80; att++) {
      var sx = (rng() * w) | 0, sy = (rng() * h) | 0;
      if (occ[key(sx, sy)]) continue;
      var dir = (rng() * 4) | 0;
      var pts = [[sx, sy]];
      var seen = {}; seen[key(sx, sy)] = 1;
      var ok = true;
      for (var s = 1; s < len; s++) {
        var nd = dir;
        if (wind > 0 && rng() < wind * 0.42) {
          nd = rng() < 0.5 ? LEFT[dir] : RIGHT[dir];
        }
        var nx = pts[s - 1][0] + DX[nd], ny = pts[s - 1][1] + DY[nd];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || occ[key(nx, ny)] || seen[key(nx, ny)]) {
          ok = false; break;
        }
        pts.push([nx, ny]); seen[key(nx, ny)] = 1; dir = nd;
      }
      if (!ok || pts.length < 2) continue;
      var a = { pts: pts, dir: dir, bw: w, bh: h };
      if (selfBlocked(a)) continue;
      return a;
    }
    return null;
  }

  // Generate a solvable board of winding line-art arrows.
  // wind: 0..1 — how often arrows take turns (0 = all straight bars).
  function generate(w, h, fillRatio, minLen, maxLen, rng, wind) {
    rng = rng || defaultRng;
    wind = wind == null ? 0 : wind;
    var arrows = {}, occ = {}, nextId = 1;
    var spots = [];
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) spots.push([x, y]);
    for (var i = spots.length - 1; i > 0; i--) {
      var j = (rng() * (i + 1)) | 0;
      var t = spots[i]; spots[i] = spots[j]; spots[j] = t;
    }
    var target = Math.round(w * h * fillRatio);
    var used = 0;
    for (var s = 0; s < spots.length && used < target; s++) {
      var sx = spots[s][0], sy = spots[s][1];
      if (occ[key(sx, sy)]) continue;
      var len = minLen + ((rng() * (maxLen - minLen + 1)) | 0);
      var windy = rng() < wind;
      var a = tryPlace(w, h, occ, rng, len, windy ? 1 : 0);
      if (!a) continue; // random-walk start failed; the spot loop keeps coverage even
      var id = 'a' + (nextId++);
      arrows[id] = a;
      a.pts.forEach(function (c) { occ[key(c[0], c[1])] = id; });
      if (hasCycle(arrows, occ)) {
        delete arrows[id];
        a.pts.forEach(function (c) { delete occ[key(c[0], c[1])]; });
      } else {
        used += a.pts.length;
      }
    }
    // ensure at least one arrow is free to move
    var ids = Object.keys(arrows);
    var open = ids.some(function (id) {
      var a = arrows[id];
      return pathCells(w, h, a).every(function (c) { return !occ[key(c[0], c[1])]; });
    });
    if (!open && ids.length) {
      var rid = ids[(rng() * ids.length) | 0], ra = arrows[rid];
      pathCells(w, h, ra).forEach(function (c) {
        var oid = occ[key(c[0], c[1])];
        if (oid && oid !== rid) removeArrow({ w: w, h: h, arrows: arrows, occ: occ }, oid);
      });
    }
    return { w: w, h: h, arrows: arrows, occ: occ, count: Object.keys(arrows).length };
  }

  function freeArrows(board) {
    var out = [];
    Object.keys(board.arrows).forEach(function (id) {
      var a = board.arrows[id];
      var blocked = pathCells(board.w, board.h, a).some(function (c) {
        return board.occ.hasOwnProperty(key(c[0], c[1]));
      });
      if (!blocked) out.push(id);
    });
    return out;
  }

  function removeArrow(board, id) {
    var a = board.arrows[id];
    if (!a) return;
    a.pts.forEach(function (c) { delete board.occ[key(c[0], c[1])]; });
    delete board.arrows[id];
  }

  var api = {
    generate: generate, freeArrows: freeArrows, pathCells: pathCells,
    occupied: occupied, headOf: headOf, headDirOf: headDirOf,
    removeArrow: removeArrow, selfBlocked: selfBlocked, hasCycle: hasCycle,
    DX: DX, DY: DY, key: key
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.ArrowGen = api;
})(typeof window !== 'undefined' ? window : globalThis);
