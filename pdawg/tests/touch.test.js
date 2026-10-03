/* Touch coordinate test: toBoard must map viewport (client) coords to board
 * coords accounting for the canvas's own viewport offset (the topbar sits
 * above the canvas). Regression test for the iPhone "touches don't pick up
 * pieces" bug: toBoard used to ignore the canvas offset, shifting every
 * hit-test by topbarHeight / zoom in board units. */
'use strict';
const J = require('../jigsaw.js');
const G = J.Game;

let fails = 0;
function ok(cond, name) {
  if (!cond) { fails++; console.log('FAIL:', name); }
  else console.log('ok:', name);
}
function near(a, b, name) { ok(Math.abs(a - b) < 1e-9, name + ' (got ' + a + ', want ' + b + ')'); }

// Simulate an iPhone: 390x700 CSS canvas, topbar pushes canvas 70px down
// in the viewport. Camera centered on board point (500,500) at 0.5 zoom.
G.cw = 390; G.ch = 700;
G._rectL = 0; G._rectT = 70;
G.cam = { x: 500, y: 500, s: 0.5 };

// Touch at the canvas center in viewport coords: (195, 70+350) = (195,420).
// Must map to the camera center (500,500). The old code returned y=640.
let b = G.toBoard(195, 420);
near(b.x, 500, 'center touch -> board x');
near(b.y, 500, 'center touch -> board y (offset subtracted)');

// Touch at canvas top-left corner in viewport coords (0,70) -> board (110, 500-700... )
b = G.toBoard(0, 70);
near(b.x, 500 - 195 / 0.5, 'corner touch -> board x');
near(b.y, 500 - 350 / 0.5, 'corner touch -> board y');

// No cached rect yet (fresh boot): must not throw, must not NaN.
G._rectL = undefined; G._rectT = undefined;
b = G.toBoard(195, 350);
ok(isFinite(b.x) && isFinite(b.y), 'toBoard without rect cache stays finite');

// A horizontal page offset (not just vertical) is handled too.
G._rectL = 12; G._rectT = 70;
b = G.toBoard(195, 420);
near(b.x, 500 - 12 / 0.5, 'left offset subtracted from x');

console.log(fails ? 'TOUCH TEST: FAIL' : 'TOUCH TEST: PASS');
process.exit(fails ? 1 : 0);
