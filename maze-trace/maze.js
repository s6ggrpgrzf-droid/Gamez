/* Arrow Slide — arrow-grid puzzle (Amaze GO-style).
   Arrows are LONG and skinny: each spans multiple cells. Tap an arrow to slide
   the whole thing off the grid — only if its head has a clear path to the edge.
   Clear all arrows to win. Wrong taps cost drops. */
'use strict';
window.ArrowGen = (function () {
  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]; // N E S W

  function key(x, y) { return x + ',' + y; }

  // cells occupied by an arrow: tail (x,y), extends len cells in dir
  function occupied(x, y, dir, len) {
    var cells = [];
    for (var i = 0; i < len; i++) cells.push([x + DX[dir] * i, y + DY[dir] * i]);
    return cells;
  }
  function headOf(x, y, dir, len) {
    return [x + DX[dir] * (len - 1), y + DY[dir] * (len - 1)];
  }
  // downstream cells from the head to the edge, exclusive of head
  function pathCells(w, h, x, y, dir, len) {
    var hd = headOf(x, y, dir, len);
    var cells = [];
    var cx = hd[0] + DX[dir], cy = hd[1] + DY[dir];
    while (cx >= 0 && cy >= 0 && cx < w && cy < h) {
      cells.push([cx, cy]);
      cx += DX[dir]; cy += DY[dir];
    }
    return cells;
  }

  // occ: map cellKey -> arrowId ; arrows: id -> {x,y,dir,len}
  function hasCycle(arrows, occ) {
    var ids = Object.keys(arrows);
    var adj = {};
    ids.forEach(function (id) { adj[id] = []; });
    ids.forEach(function (id) {
      var a = arrows[id];
      pathCells(a.bw, a.bh, a.x, a.y, a.dir, a.len).forEach(function (c) {
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

  // generate a solvable board of long skinny arrows
  function generate(w, h, fillRatio, minLen, maxLen) {
    var arrows = {}, occ = {}, nextId = 1;
    var spots = [];
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) spots.push([x, y]);
    for (var i = spots.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var t = spots[i]; spots[i] = spots[j]; spots[j] = t;
    }
    var target = Math.round(w * h * fillRatio);
    var used = 0;
    for (var s = 0; s < spots.length && used < target; s++) {
      var sx = spots[s][0], sy = spots[s][1];
      if (occ[key(sx, sy)]) continue;
      var dirs = [0, 1, 2, 3].sort(function () { return Math.random() - 0.5; });
      var placed = false;
      for (var di = 0; di < 4 && !placed; di++) {
        var dir = dirs[di];
        var len = minLen + ((Math.random() * (maxLen - minLen + 1)) | 0);
        var cells = occupied(sx, sy, dir, len);
        // must fit in bounds and not overlap
        var ok = cells.every(function (c) {
          return c[0] >= 0 && c[1] >= 0 && c[0] < w && c[1] < h && !occ[key(c[0], c[1])];
        });
        if (!ok) continue;
        var id = 'a' + (nextId++);
        arrows[id] = { x: sx, y: sy, dir: dir, len: len, bw: w, bh: h };
        cells.forEach(function (c) { occ[key(c[0], c[1])] = id; });
        if (hasCycle(arrows, occ)) {
          delete arrows[id];
          cells.forEach(function (c) { delete occ[key(c[0], c[1])]; });
        } else {
          used += len; placed = true;
        }
      }
    }
    // ensure at least one arrow is free to move
    var ids = Object.keys(arrows);
    var open = ids.some(function (id) {
      var a = arrows[id];
      return pathCells(w, h, a.x, a.y, a.dir, a.len).every(function (c) { return !occ[key(c[0], c[1])]; });
    });
    if (!open && ids.length) {
      var rid = ids[(Math.random() * ids.length) | 0], ra = arrows[rid];
      pathCells(w, h, ra.x, ra.y, ra.dir, ra.len).forEach(function (c) {
        var oid = occ[key(c[0], c[1])];
        if (oid && oid !== rid) {
          var oc = occupied(arrows[oid].x, arrows[oid].y, arrows[oid].dir, arrows[oid].len);
          oc.forEach(function (cc) { delete occ[key(cc[0], cc[1])]; });
          delete arrows[oid];
        }
      });
    }
    return { w: w, h: h, arrows: arrows, occ: occ, count: Object.keys(arrows).length };
  }

  function freeArrows(board) {
    var out = [];
    Object.keys(board.arrows).forEach(function (id) {
      var a = board.arrows[id];
      var blocked = pathCells(board.w, board.h, a.x, a.y, a.dir, a.len).some(function (c) {
        return board.occ.hasOwnProperty(key(c[0], c[1]));
      });
      if (!blocked) out.push(id);
    });
    return out;
  }

  function removeArrow(board, id) {
    var a = board.arrows[id];
    occupied(a.x, a.y, a.dir, a.len).forEach(function (c) { delete board.occ[key(c[0], c[1])]; });
    delete board.arrows[id];
  }

  return {
    generate: generate, freeArrows: freeArrows, pathCells: pathCells,
    occupied: occupied, headOf: headOf, removeArrow: removeArrow,
    DX: DX, DY: DY, key: key
  };
})();
