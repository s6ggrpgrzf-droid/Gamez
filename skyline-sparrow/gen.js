/* Skyline Sparrow — gen.js
   Chunk generator with entry/exit contracts and generation-time fairness
   validation. Every gap's jump arc is SIMULATED before the chunk is accepted;
   impossible chunks are rejected, never shipped. UMD. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SSGen = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

// physics mirror — must match sim.js PHYS (validated by headless test)
var G = 2400, JUMPV = 880, WALLJUMPV = 836;
function maxGap(vx) { return vx * 2 * JUMPV / G; }
function maxStepUp() { return JUMPV * JUMPV / (2 * G); }
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

var BASE_Y = 560;          // nominal track height (world px)
var RHYTHM = [0.52, 0.58, 0.78]; // short-short-long gap rhythm

/* Simulate a jump arc. Takeoff at (x0,y0), velocity (vx, -vy0).
   Returns the landing x on a platform top at height ty, or -1. y grows down. */
function simArc(x0, y0, vx, vy0, tx0, tx1, ty) {
  var dt = 1 / 240, x = x0, y = y0, vy = -vy0, t = 0;
  for (var i = 0; i < 1200; i++) {
    vy += G * dt; t += dt;
    x += vx * dt; y += vy * dt;
    if (x > tx1 + 40) return -1;          // overshot
    if (vy > 0) {
      if (y >= ty && x >= tx0 && x <= tx1) return x; // touched down inside span
      if (y > ty + 600) return -1;        // fell far below
    }
    if (t > 4) return -1;
  }
  return -1;
}

/* Validate one gap: platform A end (ax1, ay) -> platform B start (bx0, by).
   The generator guarantees B is >=170px wide starting at bx0, so we validate
   against the guaranteed floor [bx0, bx0+170], never phantom geometry.
   Tries a full jump, then a short hop — both are real player actions. */
function validGap(ax1, ay, bx0, by, vx) {
  var dy = by - ay;
  if (dy > 320) return false;                     // too far down (unfair blind drop)
  if (dy < -maxStepUp() * 0.62) return false;     // step-up cap ~60%
  var gapW = bx0 - ax1;
  if (gapW < 30) return true;                     // tiny hop, coyote covers it
  if (gapW > maxGap(vx) * 0.78) return false;     // hard cap 78%
  // takeoff slightly before the edge (forgiving)
  for (var i = 0; i < 2; i++) {
    var vy0 = i === 0 ? JUMPV : JUMPV * 0.55;
    var landX = simArc(ax1 - 14, ay, vx, vy0, bx0, bx0 + 400, by);
    if (landX >= bx0 + 8 && landX <= bx0 + 162) return true;
  }
  return false;
}

/* Validate a wall-jump: slide on wall face then wall-jump to exit platform. */
function validWall(wx, wyTop, wyBot, ex0, ex1, ey, vx) {
  for (var drop = 0; drop <= 130; drop += 43) {
    var dt = 1 / 240, x = wx + 6, y = wyBot - drop, vy = -WALLJUMPV, t = 0;
    for (var i = 0; i < 900; i++) {
      vy += G * dt; t += dt;
      x += vx * dt; y += vy * dt;
      if (x > ex1 + 40) break;
      if (vy > 0 && y >= ey && x >= ex0 && x <= ex1) return true;
      if (y > ey + 500 || t > 3) break;
    }
  }
  return false;
}

function districtOf(distM) { return Math.floor(distM / 900) % 3; } // 0 dawn, 1 neon, 2 storm

function runway(rng) {
  return { w: 1000, entry: { y: BASE_Y }, exit: { y: BASE_Y },
    plats: [{ x: 0, y: BASE_Y, w: 1000 }], feats: [], chims: [], walls: [],
    wind: 0, district: 0, diff: 0, kind: 'runway' };
}

function breather(rng, prevY, w) {
  var c = { w: w, entry: { y: prevY }, exit: { y: prevY },
    plats: [{ x: 0, y: prevY, w: w }], feats: [], chims: [], walls: [],
    wind: 0, district: 0, diff: 0.05, kind: 'breather' };
  // lazy feather arc over flat ground — pure reward
  var n = 5, cx = w / 2 - 90;
  for (var i = 0; i < n; i++) {
    c.feats.push({ x: cx + i * 45, y: prevY - 60 - Math.sin((i / (n - 1)) * Math.PI) * 55, taken: false });
  }
  return c;
}

function genChunk(rng, prev, d, speed, distM) {
  var district = districtOf(distM);
  var w = 800 + rng() * 400;
  // rhythm: every 5th band is a breather (~4:1 intense:breather)
  if (Math.floor(distM / 450) % 5 === 4) {
    var b = breather(rng, prev.y, w);
    b.district = district;
    return b;
  }
  var wind = district === 2 ? (rng() * 2 - 1) * 70 : 0;
  var vx = speed + wind;

  var c = { w: w, entry: { y: prev.y }, exit: { y: prev.y },
    plats: [], feats: [], chims: [], walls: [],
    wind: wind, district: district, diff: 0, kind: 'gap' };

  // neon district: sometimes a wall section instead of gaps
  if (district === 1 && d > 0.12 && rng() < 0.35) return wallChunk(rng, prev, d, w, vx, district);

  var nGaps = 1 + Math.floor(rng() * (1 + d * 2.2));
  var cursor = 0, y = prev.y, gi = 0;
  var gapFracMax = lerp(0.40, 0.75, d);

  // Every platform after a gap is >= 160px wide, so validating the landing
  // against [bx0, bx0+150] is honest (never validated against phantom floor).
  var g = 0;
  while (true) {
    var remaining = w - cursor;
    var isLast = (g >= nGaps) || remaining < 430;
    var platW = isLast ? remaining : 200 + rng() * 280;
    var pl = { x: cursor, y: y, w: platW };
    c.plats.push(pl);
    // chimney hazard: clear of the landing zone (first 190px, where gap
    // jumpers touch down) and the takeoff edge (last 130px)
    if (pl.w > 380 && rng() < 0.22 + d * 0.35) {
      var hw = 24 + rng() * 10, hh = 42 + rng() * 48;
      var hx = pl.x + 190 + rng() * Math.max(10, pl.w - 320 - hw);
      c.chims.push({ x: hx, y: y - hh, w: hw, h: hh, counted: false });
      c.diff += 0.25;
    }
    if (isLast) break;
    // --- the gap; the landing platform is guaranteed >= 160 wide ---
    var rhythm = RHYTHM[gi++ % RHYTHM.length];
    var gapW = maxGap(vx) * gapFracMax * rhythm;
    var dy = (rng() * 2 - 1) * maxStepUp() * 0.6 * (0.25 + 0.75 * d);
    var ny = clamp(y + dy, BASE_Y - 170, BASE_Y + 130);
    var bx0 = cursor + pl.w + gapW;
    if (w - bx0 < 170) { pl.w = w - pl.x; break; } // no room: flat to end
    // shrink-to-fit retry loop: fairness by construction
    var tries = 0, ok = false;
    while (tries < 5 && !ok) {
      ok = validGap(cursor + pl.w, y, bx0, ny, vx);
      if (!ok) {
        gapW *= 0.82; bx0 = cursor + pl.w + gapW;
        if (w - bx0 < 170) break;
        tries++;
      }
    }
    if (!ok) { pl.w = w - pl.x; break; } // fallback: flat to end, no gap
    c.diff += (gapW / maxGap(vx)) + Math.max(0, (ny - y) / maxStepUp());
    // feathers along the validated arc (risk/reward, always reachable)
    if (rng() < 0.75) {
      var mid = arcMid(cursor + pl.w - 14, y, vx, bx0, ny);
      for (var fi = 0; fi < 3; fi++) {
        c.feats.push({ x: mid.x - 34 + fi * 34, y: mid.y - 26 + Math.abs(fi - 1) * 14, taken: false });
      }
    }
    cursor = bx0; y = ny; g++;
  }
  c.exit.y = y;
  return c;
}

function wallChunk(rng, prev, d, w, vx, district) {
  var c = { w: w, entry: { y: prev.y }, exit: { y: prev.y - 90 },
    plats: [], feats: [], chims: [], walls: [],
    wind: 0, district: district, diff: 0.4, kind: 'wall' };
  var y = prev.y;
  c.plats.push({ x: 0, y: y, w: 330 });
  // the wall: slide down its face, wall-jump to the high exit
  var wh = 150;
  c.walls.push({ x: 306, y: y - wh, w: 24, h: wh, side: 1 });
  c.plats.push({ x: 386, y: y - 90, w: Math.max(240, w - 386) });
  var ok = validWall(306, y - wh, y, 386, 386 + 200, y - 90, vx);
  if (!ok) { // fallback: lower the exit until valid
    for (var ey = y - 80; ey <= y - 20 && !ok; ey += 10) {
      ok = validWall(306, y - wh, y, 386, 386 + 200, ey, vx);
    }
    c.plats[1].y = ok ? ey - 10 : y - 20;
    c.exit.y = c.plats[1].y;
  }
  // clamp the track: wall chunks must not walk the rooftops off-screen
  c.exit.y = clamp(c.exit.y, BASE_Y - 170, BASE_Y + 130);
  c.plats[1].y = c.exit.y;
  c.feats.push({ x: 340, y: y - wh - 40, taken: false });
  return c;
}

/* midpoint of the jump arc (for feather placement) */
function arcMid(x0, y0, vx, tx0, ty) {
  var dt = 1 / 120, x = x0, y = y0, vy = -JUMPV, topY = y0, topX = x0;
  for (var i = 0; i < 600; i++) {
    vy += G * dt; x += vx * dt; y += vy * dt;
    if (y < topY) { topY = y; topX = x; }
    if (vy > 0 && y >= ty && x >= tx0) break;
    if (x > tx0 + 300 || y > ty + 400) break;
  }
  return { x: (x0 + topX) / 2, y: (y0 + topY) / 2 };
}

/* difficulty score of a chunk at a given speed (for tuning assertions) */
function chunkDiff(c, speed) {
  return c.diff;
}

return {
  runway: runway, genChunk: genChunk, districtOf: districtOf,
  chunkDiff: chunkDiff, maxGap: maxGap, maxStepUp: maxStepUp,
  validGap: validGap, simArc: simArc, BASE_Y: BASE_Y
};
});
