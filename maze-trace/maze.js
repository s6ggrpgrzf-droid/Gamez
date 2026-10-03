/* Maze Trace — maze generation (recursive backtracker) + BFS distance field */
'use strict';
window.MazeGen = (function () {
  // directions: N E S W
  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

  function generate(w, h) {
    // walls[c] = [N,E,S,W] true = wall present
    var walls = [];
    for (var i = 0; i < w * h; i++) walls.push([true, true, true, true]);
    var visited = new Uint8Array(w * h);
    function idx(x, y) { return y * w + x; }

    // iterative backtracker
    var sx = (Math.random() * w) | 0, sy = (Math.random() * h) | 0;
    var stack = [[sx, sy]];
    visited[idx(sx, sy)] = 1;
    while (stack.length) {
      var top = stack[stack.length - 1], x = top[0], y = top[1];
      var opts = [];
      for (var d = 0; d < 4; d++) {
        var nx = x + DX[d], ny = y + DY[d];
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && !visited[idx(nx, ny)]) opts.push(d);
      }
      if (!opts.length) { stack.pop(); continue; }
      var dir = opts[(Math.random() * opts.length) | 0];
      var mx = x + DX[dir], my = y + DY[dir];
      walls[idx(x, y)][dir] = false;
      walls[idx(mx, my)][(dir + 2) % 4] = false;
      visited[idx(mx, my)] = 1;
      stack.push([mx, my]);
    }

    // start on left edge, exit on right edge — pick rows far apart
    var startY = (Math.random() * h) | 0;
    var exitY = (Math.random() * h) | 0;
    if (Math.abs(exitY - startY) < ((h / 2) | 0)) exitY = (startY + ((h / 2) | 0) + 1) % h;
    walls[idx(0, startY)][3] = false;       // open west of start
    walls[idx(w - 1, exitY)][1] = false;    // open east of exit

    return { w: w, h: h, walls: walls, start: [0, startY], exit: [w - 1, exitY] };
  }

  // BFS distances from exit; also arrow direction per cell (toward exit)
  function solve(mz) {
    var w = mz.w, h = mz.h;
    function idx(x, y) { return y * w + x; }
    var dist = new Int32Array(w * h).fill(-1);
    var q = [mz.exit];
    dist[idx(mz.exit[0], mz.exit[1])] = 0;
    while (q.length) {
      var c = q.shift(), x = c[0], y = c[1];
      for (var d = 0; d < 4; d++) {
        if (mz.walls[idx(x, y)][d]) continue;
        var nx = x + DX[d], ny = y + DY[d];
        // allow stepping outside at start/exit openings
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (dist[idx(nx, ny)] === -1) { dist[idx(nx, ny)] = dist[idx(x, y)] + 1; q.push([nx, ny]); }
      }
    }
    // arrow dir: neighbor with smallest dist (toward exit)
    var arrows = new Int8Array(w * h).fill(-1);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (x === mz.exit[0] && y === mz.exit[1]) continue;
      var best = -1, bd = Infinity;
      for (var d2 = 0; d2 < 4; d2++) {
        if (mz.walls[idx(x, y)][d2]) continue;
        var ax = x + DX[d2], ay = y + DY[d2];
        if (ax < 0 || ay < 0 || ax >= w || ay >= h) continue;
        if (dist[idx(ax, ay)] >= 0 && dist[idx(ax, ay)] < bd) { bd = dist[idx(ax, ay)]; best = d2; }
      }
      arrows[idx(x, y)] = best;
    }
    return { dist: dist, arrows: arrows, length: dist[idx(mz.start[0], mz.start[1])] };
  }

  // corridor segments for hit-testing: [x1,y1,x2,y2] in cell coords (cell centers)
  function segments(mz) {
    var segs = [];
    function idx(x, y) { return y * mz.w + x; }
    for (var y = 0; y < mz.h; y++) for (var x = 0; x < mz.w; x++) {
      for (var d = 0; d < 4; d++) {
        if (mz.walls[idx(x, y)][d]) continue;
        var nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= mz.w || ny >= mz.h) {
          // stub leading outside (start/exit)
          segs.push([x, y, x + DX[d] * 0.6, y + DY[d] * 0.6]);
        } else if (d === 1 || d === 2) {
          // draw each interior corridor once (E and S)
          segs.push([x, y, nx, ny]);
        }
      }
    }
    return segs;
  }

  return { generate: generate, solve: solve, segments: segments, DX: DX, DY: DY };
})();
