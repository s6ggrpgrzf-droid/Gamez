/* Bubble Hex — Daily Hex Challenge.
 *
 * Uses the Gamez Arcade Cloudflare worker's GET /daily?game=bubble-hex endpoint,
 * which returns a deterministic {date, seed} that is identical for every player
 * in the world on a given day. We turn that seed into a full level with a
 * seeded PRNG (mulberry32), so the Daily Hex board is the same for everyone,
 * and scores post to the worker's per-day leaderboard board.
 *
 * No DOM. Pure data + a solver-friendly generator.
 */
'use strict';

function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

var DAILY_TYPES = ['clear', 'rescue', 'ghost', 'boss'];
var DAILY_NAMES = {
  clear:  ['Daily Drizzle', 'Morning Mist', 'Hex of the Day', 'Daily Dew', 'Witch\'s Errand'],
  rescue: ['Daily Rescue', 'Owl Watch', 'Feathered Friends', 'Dawn Patrol'],
  ghost:  ['Daily Drift', 'Spirit Walk', 'Morning Haunt'],
  boss:   ['Wilbur Wednesday', 'Daily Showdown', 'Beak Buster', 'Crow Call']
};

/* Build a level layout (array of row strings) that is rich in 3+ clusters
 * near the bottom so a greedy bot (and a human) can win. We lay out color
 * "blobs": pick random seed cells and flood them with one color, which
 * guarantees clusters of every color on board. */
function genLayout(rng, rows, cols, nColors, special) {
  var letters = ['R', 'B', 'G', 'Y', 'P'].slice(0, nColors);
  var grid = [];
  for (var r = 0; r < rows; r++) { grid.push(new Array(cols).fill('.')); }
  // blob paint: 40% of cells as colored blobs of size 4-9
  var target = Math.floor(rows * cols * 0.72);
  var painted = 0, guard = 0;
  while (painted < target && guard++ < 400) {
    var col = letters[(rng() * letters.length) | 0];
    var sr = (rng() * rows) | 0, sc = (rng() * cols) | 0;
    var size = 4 + ((rng() * 6) | 0);
    var stack = [[sr, sc]], seen = {};
    while (stack.length && size > 0) {
      var cell = stack.pop(), cr = cell[0], cc = cell[1];
      var k = cr + ',' + cc;
      if (seen[k]) continue; seen[k] = 1;
      if (cr < 0 || cr >= rows || cc < 0 || cc >= cols) continue;
      if (grid[cr][cc] !== '.') continue;
      grid[cr][cc] = col; painted++; size--;
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var i = 0; i < dirs.length; i++) {
        if (rng() < 0.75) stack.push([cr + dirs[i][0], cc + dirs[i][1]]);
      }
    }
  }
  // special placements
  if (special.familiars) {
    var placed = 0, g2 = 0;
    while (placed < special.familiars && g2++ < 300) {
      var fr = 2 + ((rng() * (rows - 2)) | 0), fc = (rng() * cols) | 0;
      if (grid[fr][fc] !== '.' && grid[fr][fc] !== 'F') { grid[fr][fc] = 'F'; placed++; }
    }
  }
  if (special.blockers) {
    var b2 = 0, g3 = 0;
    while (b2 < special.blockers && g3++ < 200) {
      var br = 1 + ((rng() * (rows - 3)) | 0), bc = (rng() * cols) | 0;
      if (grid[br][bc] !== '.' && grid[br][bc] !== '#' && grid[br][bc] !== 'F') { grid[br][bc] = '#'; b2++; }
    }
  }
  return grid.map(function (row) { return row.join(''); });
}

function genDailyLevel(seed) {
  var rng = mulberry32(seed);
  var type = DAILY_TYPES[(rng() * DAILY_TYPES.length) | 0];
  var names = DAILY_NAMES[type];
  var name = names[(rng() * names.length) | 0];
  var nColors = 5;
  var rows = 8 + ((rng() * 3) | 0);   // 8-10 rows
  var cols = 11;
  var shots = 42 + ((rng() * 14) | 0); // 42-55
  var special = {
    familiars: type === 'rescue' ? 4 + ((rng() * 3) | 0) : 0,
    blockers: rng() < 0.6 ? 3 + ((rng() * 4) | 0) : 0
  };
  var layout = genLayout(rng, rows, cols, nColors, special);
  var L = {
    name: name, type: type, colors: nColors, shots: shots, layout: layout,
    daily: true
  };
  if (type === 'rescue') L.need = special.familiars;
  if (type === 'ghost') L.ghostStart = [rows - 1, (rng() * cols) | 0];
  if (type === 'boss') L.shield = 12 + ((rng() * 8) | 0);
  return L;
}

/* Human-readable daily id, e.g. "2026-10-03". */
function dailyId(dateStr) { return dateStr; }

if (typeof module !== 'undefined') {
  module.exports = { mulberry32: mulberry32, genDailyLevel: genDailyLevel, dailyId: dailyId };
}
if (typeof window !== 'undefined') {
  window.HexDaily = { mulberry32: mulberry32, genDailyLevel: genDailyLevel, dailyId: dailyId };
}
