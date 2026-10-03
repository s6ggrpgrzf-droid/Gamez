/* Arrow Slide — arrow-grid puzzle (Amaze GO-style).
   Tap an arrow to slide it off the grid. It only slides if its straight-line
   path to the edge is clear. Clear all arrows to win. Wrong taps cost drops. */
'use strict';
window.ArrowGen = (function () {
  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]; // N E S W

  // downstream cells from (x,y) in direction d, exclusive of (x,y)
  function pathCells(w, h, x, y, d) {
    var cells = [];
    var cx = x + DX[d], cy = y + DY[d];
    while (cx >= 0 && cy >= 0 && cx < w && cy < h) {
      cells.push([cx, cy]);
      cx += DX[d]; cy += DY[d];
    }
    return cells;
  }

  function hasCycle(w, h, arrows) {
    // arrows: map "x,y" -> dir. dependency: A depends on arrows in A's path.
    var keys = Object.keys(arrows);
    var adj = {};
    keys.forEach(function (k) { adj[k] = []; });
    keys.forEach(function (k) {
      var p = k.split(','), x = +p[0], y = +p[1], d = arrows[k];
      pathCells(w, h, x, y, d).forEach(function (c) {
        var ck = c[0] + ',' + c[1];
        if (arrows.hasOwnProperty(ck)) adj[k].push(ck);
      });
    });
    // DFS cycle detect
    var state = {};
    function visit(k) {
      if (state[k] === 1) return true;
      if (state[k] === 2) return false;
      state[k] = 1;
      for (var i = 0; i < adj[k].length; i++) if (visit(adj[k][i])) return true;
      state[k] = 2;
      return false;
    }
    for (var i = 0; i < keys.length; i++) if (visit(keys[i])) return true;
    return false;
  }

  // generate a solvable board: random arrows, reject placements that create cycles
  function generate(w, h, fillRatio) {
    var arrows = {};
    var cells = [];
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) cells.push([x, y]);
    // shuffle
    for (var i = cells.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var t = cells[i]; cells[i] = cells[j]; cells[j] = t;
    }
    var target = Math.round(w * h * fillRatio);
    var placed = 0;
    for (var c = 0; c < cells.length && placed < target; c++) {
      var x = cells[c][0], y = cells[c][1];
      var dirs = [0, 1, 2, 3].sort(function () { return Math.random() - 0.5; });
      for (var d = 0; d < 4; d++) {
        var k = x + ',' + y;
        arrows[k] = dirs[d];
        if (!hasCycle(w, h, arrows)) { placed++; break; }
        delete arrows[k];
      }
    }
    // ensure at least one arrow has a clear path (almost always true, but check)
    var keys = Object.keys(arrows);
    var open = keys.some(function (k) {
      var p = k.split(','), x = +p[0], y = +p[1];
      return pathCells(w, h, x, y, arrows[k]).every(function (cc) {
        return !arrows.hasOwnProperty(cc[0] + ',' + cc[1]);
      });
    });
    if (!open && keys.length) {
      // force: clear the path of a random arrow
      var rk = keys[(Math.random() * keys.length) | 0];
      var rp = rk.split(','), rx = +rp[0], ry = +rp[1];
      pathCells(w, h, rx, ry, arrows[rk]).forEach(function (cc) {
        delete arrows[cc[0] + ',' + cc[1]];
      });
    }
    return { w: w, h: h, arrows: arrows, count: Object.keys(arrows).length };
  }

  // arrows currently free to slide (clear path to edge)
  function freeArrows(board) {
    var out = [];
    Object.keys(board.arrows).forEach(function (k) {
      var p = k.split(','), x = +p[0], y = +p[1];
      var blocked = pathCells(board.w, board.h, x, y, board.arrows[k]).some(function (cc) {
        return board.arrows.hasOwnProperty(cc[0] + ',' + cc[1]);
      });
      if (!blocked) out.push(k);
    });
    return out;
  }

  return { generate: generate, freeArrows: freeArrows, pathCells: pathCells, DX: DX, DY: DY };
})();
