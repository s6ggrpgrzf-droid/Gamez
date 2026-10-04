/* Tiny Fairway sim tests — node, no dependencies.
 * Run: node tests/test-sim.js  (from ~/workspace/gamez/tiny-fairway) */
'use strict';

require('../sim.js');
var TF = globalThis.TF;

var failures = 0;
var checks = 0;

function ok(cond, name) {
  checks++;
  if (!cond) {
    failures++;
    console.log('  FAIL: ' + name);
  }
}

function group(name, fn) {
  var before = failures;
  fn();
  console.log((failures === before ? 'PASS' : 'FAIL') + ' — ' + name);
}

/* Flat, hazard-free hole for pure physics checks. */
function flatHole() {
  var hole = TF.genHole(7);
  hole.terrain = {
    h: function () { return 20; },
    slope: function () { return 0; }
  };
  hole.sand = [];
  hole.water = [];
  hole.waterLevel = -1000;
  hole.tee = { x: 10, y: 21 };
  hole.cup = { x: 70, y: 20 };
  return hole;
}

function settle(hole, ball, maxSecs) {
  var steps = 0, max = Math.floor(60 * (maxSecs || 25));
  while (!ball.resting && !ball.inCup && !ball.inWater && steps < max) {
    TF.simStep(hole, ball);
    steps++;
  }
  return steps;
}

/* ---------------- RNG ---------------- */

group('rng: mulberry32 deterministic, dailySeed stable', function () {
  var g1 = TF.mulberry32(12345), g2 = TF.mulberry32(12345);
  var same = true;
  for (var i = 0; i < 10; i++) {
    var v = g1();
    ok(v >= 0 && v < 1, 'mulberry32 value ' + i + ' in [0,1)');
    if (v !== g2()) same = false;
  }
  ok(same, 'same seed -> identical stream');
  ok(TF.mulberry32(1)() !== TF.mulberry32(2)(), 'different seeds differ');

  ok(TF.dailySeed('2026-10-04') === TF.dailySeed('2026-10-04'), 'dailySeed stable');
  ok(TF.dailySeed('2026-10-04') !== TF.dailySeed('2026-10-05'), 'dailySeed differs by date');
  var ds = TF.dailySeed('2026-10-04');
  ok(Number.isInteger(ds) && ds >= 0 && ds <= 0xffffffff, 'dailySeed is uint32');
});

/* ---------------- constants ---------------- */

group('constants present', function () {
  ok(TF.GRAV > 0, 'GRAV');
  ok(Math.abs(TF.REST - 0.45) < 0.01, 'REST ~0.45');
  ok(TF.BALL_R > 0, 'BALL_R');
  ok(TF.CUP_R > TF.BALL_R, 'CUP_R > BALL_R');
  ok(TF.MAX_POWER > 0, 'MAX_POWER');
});

/* ---------------- physics ---------------- */

group('physics: dropped ball comes to rest on flat ground', function () {
  var hole = flatHole();
  var ball = TF.newBall(hole);
  ball.y = 45; ball.resting = false;
  settle(hole, ball);
  ok(ball.resting, 'ball resting');
  ok(Math.abs(ball.y - 21) < 0.01, 'ball sits on surface, y=' + ball.y.toFixed(3));
  ok(Math.abs(ball.x - 10) < 0.01, 'no horizontal drift, x=' + ball.x.toFixed(3));
});

group('physics: bounce height decays', function () {
  var hole = flatHole();
  var ball = TF.newBall(hole);
  ball.y = 45; ball.resting = false;
  // Record the upward speed each time the ball leaves the ground after a bounce.
  var leaveSpeeds = [];
  var wasTouching = false;
  for (var i = 0; i < 60 * 20 && leaveSpeeds.length < 6; i++) {
    TF.simStep(hole, ball);
    var touching = (ball.y - TF.BALL_R) <= 20.0001;
    if (wasTouching && !touching && ball.vy > 0.5) leaveSpeeds.push(ball.vy);
    wasTouching = touching;
    if (ball.resting && leaveSpeeds.length) break;
  }
  ok(leaveSpeeds.length >= 3, 'recorded >=3 bounces (got ' + leaveSpeeds.length + ')');
  for (var a = 1; a < leaveSpeeds.length; a++) {
    ok(leaveSpeeds[a] < leaveSpeeds[a - 1] * 0.9,
      'bounce ' + a + ' decays: ' + leaveSpeeds[a - 1].toFixed(2) + ' -> ' + leaveSpeeds[a].toFixed(2));
  }
});

group('physics: water hazard triggers inWater', function () {
  var hole = flatHole();
  hole.water = [{ x0: 40, x1: 48 }];
  hole.waterLevel = 21.5;
  var ball = TF.newBall(hole);
  ball.x = 44; ball.y = 40; ball.resting = false;
  settle(hole, ball);
  ok(ball.inWater, 'inWater set');
  ok(ball.vx === 0 && ball.vy === 0, 'velocity zeroed');
  ok(!ball.inCup, 'not in cup');
});

group('physics: slow ball near cup is captured', function () {
  var hole = flatHole();
  var ball = TF.newBall(hole);
  ball.x = 63; ball.y = 21;
  TF.shoot(ball, 9, 0.5);
  settle(hole, ball);
  ok(ball.inCup, 'inCup set');
  ok(ball.resting, 'resting after capture');
  ok(Math.abs(ball.x - hole.cup.x) < 0.01, 'snapped to cup x');
});

group('physics: fast flyby is not captured (lips out)', function () {
  var hole = flatHole();
  var ball = TF.newBall(hole);
  ball.x = 60; ball.y = 21;
  TF.shoot(ball, 40, 4);
  // Step until the ball has clearly passed the cup; it must not be
  // captured during the high-speed flyby itself.
  var crossed = false;
  for (var i = 0; i < 600 && !crossed; i++) {
    TF.simStep(hole, ball);
    if (ball.x > hole.cup.x + 3) crossed = true;
  }
  ok(crossed, 'ball flew past the cup');
  ok(!ball.inCup, 'fast ball not captured on the flyby');
});

group('physics: shoot caps speed at MAX_POWER', function () {
  var hole = flatHole();
  var ball = TF.newBall(hole);
  TF.shoot(ball, 1000, 0);
  ok(Math.hypot(ball.vx, ball.vy) <= TF.MAX_POWER + 1e-9, 'capped');
  ok(!ball.resting, 'resting cleared');
});

group('physics: steep slope slides instead of sticking', function () {
  var hole = TF.genHole(11);
  // Find a steep-ish spot on this generated terrain.
  var sx = -1;
  for (var x = 2; x < hole.W - 2; x += 0.25) {
    if (Math.abs(hole.terrain.slope(x)) > 0.6) { sx = x; break; }
  }
  if (sx < 0) { ok(true, 'no steep spot on this seed (skip)'); return; }
  var ball = TF.newBall(hole);
  ball.x = sx; ball.y = hole.terrain.h(sx) + TF.BALL_R;
  ball.resting = true;
  for (var i = 0; i < 60 * 6; i++) TF.simStep(hole, ball);
  ok(!ball.resting || Math.abs(ball.x - sx) > 0.5,
    'ball slid on steep slope (x ' + sx.toFixed(1) + ' -> ' + ball.x.toFixed(1) + ')');
});

group('physics: inSand / inWater helpers', function () {
  var hole = flatHole();
  hole.sand = [{ x0: 20, x1: 30 }];
  hole.water = [{ x0: 40, x1: 48 }];
  ok(TF.inSand(hole, 25) && !TF.inSand(hole, 35), 'inSand');
  ok(TF.inWater(hole, 44) && !TF.inWater(hole, 35), 'inWater');
});

/* ---------------- terrain ---------------- */

group('terrain: 50 holes valid (par, bounds, smoothness)', function () {
  var TAN50 = Math.tan(50 * Math.PI / 180);
  var parSeen = {};
  for (var s = 0; s < 50; s++) {
    var hole = TF.genHole(2000 + s);
    ok(hole.W === 100 && hole.H === 60, 'seed ' + (2000 + s) + ': W/H');
    ok(hole.par >= 2 && hole.par <= 5, 'seed ' + (2000 + s) + ': par in 2..5 (got ' + hole.par + ')');
    parSeen[hole.par] = true;
    ok(hole.tee.x > 0 && hole.tee.x < hole.W, 'tee.x inside');
    ok(hole.cup.x > 0 && hole.cup.x < hole.W, 'cup.x inside');
    ok(hole.tee.y > 0 && hole.tee.y < hole.H, 'tee.y inside');
    ok(hole.cup.y > 0 && hole.cup.y < hole.H, 'cup.y inside');
    ok(hole.biome >= 0 && hole.biome <= 3, 'biome 0..3');
    // Smoothness: sample slope densely, nothing near cliff-steep.
    var maxS = 0;
    for (var x = 0; x <= hole.W; x += 0.1) {
      var sl = Math.abs(hole.terrain.slope(x));
      if (sl > maxS) maxS = sl;
    }
    ok(maxS < TAN50, 'seed ' + (2000 + s) + ': max slope ' + maxS.toFixed(3) + ' < tan50');
    // Tee/cup never inside water.
    ok(!TF.inWater(hole, hole.tee.x), 'tee not in water');
    ok(!TF.inWater(hole, hole.cup.x), 'cup not in water');
    // Water is narrow enough to carry.
    for (var wi = 0; wi < hole.water.length; wi++) {
      ok(hole.water[wi].x1 - hole.water[wi].x0 <= 9.5, 'water narrow');
    }
  }
  ok(Object.keys(parSeen).length >= 2, 'par variety across seeds (' + Object.keys(parSeen).join(',') + ')');
});

/* ---------------- solvability: greedy bot ---------------- */

function hazardsBetween(hole, x0, x1) {
  var lo = Math.min(x0, x1), hi = Math.max(x0, x1);
  var sand = false, water = false;
  for (var i = 0; i < hole.sand.length; i++) {
    var s = hole.sand[i];
    if (s.x1 > lo + 1 && s.x0 < hi - 1) sand = true;
  }
  for (var j = 0; j < hole.water.length; j++) {
    var w = hole.water[j];
    if (w.x1 > lo + 1 && w.x0 < hi - 1) water = true;
  }
  return { sand: sand, water: water };
}

function botPlay(hole) {
  var ball = TF.newBall(hole);
  var strokes = 0;
  var lastRest = { x: ball.x, y: ball.y };
  var restHistory = [ball.x];
  var stall = 0, loftBoost = 0, cycleBreak = 0;
  while (!ball.inCup && strokes < 12) {
    var dx = hole.cup.x - ball.x, dy = hole.cup.y - ball.y;
    var dist = Math.hypot(dx, dy);
    var baseAng = Math.atan2(dy, dx);
    // Path sample: highest terrain (+ its x) and steepest slope ball->cup.
    var hBall = hole.terrain.h(ball.x), hCup = hole.terrain.h(hole.cup.x);
    var maxH = Math.max(hBall, hCup), maxSlope = 0, xHill = ball.x;
    for (var sx = Math.min(ball.x, hole.cup.x); sx <= Math.max(ball.x, hole.cup.x); sx += 1) {
      var sh = hole.terrain.h(sx);
      if (sh > maxH) { maxH = sh; xHill = sx; }
      var ss = Math.abs(hole.terrain.slope(sx));
      if (ss > maxSlope) maxSlope = ss;
    }
    var climb = Math.max(0, maxH - hBall);
    var pathClear = (maxH - Math.max(hBall, hCup)) < 1.0;
    var greenFlat = maxSlope < 0.3;
    var hz = hazardsBetween(hole, ball.x, hole.cup.x);
    var ang, power;

    if (!hz.sand && !TF.inSand(hole, ball.x) && pathClear && greenFlat &&
        climb < 1.5 && dist < 35) {
      // Putt (short or long on the flat green): energy to beat rolling
      // resistance (rr=5) plus elevation. Stays on the ground: no rollout.
      var e = 2 * (5.0 * dist + TF.GRAV * (hCup - hBall)); // may be negative downhill
      if (e < 6) e = 6;
      ang = baseAng;
      power = Math.sqrt(e) * 1.08 + 0.2;
      if (power > 22) power = 22;
    } else {
      // Exact ballistic at the cup. Steep lob when close or when a hill or
      // water must be carried; the trajectory is verified to clear the
      // highest point on the path (lambda is raised until it does).
      var adx = hole.cup.x - ball.x, ady = hCup - hBall;
      var D = Math.abs(adx);
      if (D < 0.5) D = 0.5;
      var dirX = adx >= 0 ? 1 : -1;
      var phi = Math.atan2(ady, D); // direct-line elevation to the cup
      var theta = D < 25 ? 1.0 : 0.5; // steep lob when close, flatter drive when far
      if (hz.water || !pathClear) theta = Math.max(theta, 1.0); // carry it high
      theta += stall * 0.15 + (hz.sand ? 0.25 : 0) + loftBoost + cycleBreak * 0.2;
      if (theta > 1.15) theta = 1.15;
      var lambda = Math.max(theta, phi + 0.3); // clear the cup height with margin
      if (lambda > 1.3) lambda = 1.3;
      var dHill = Math.abs(xHill - ball.x);
      var hHill = maxH - hBall + 1.0; // clearance needed over the hill
      // Raise lambda until the trajectory clears the hill (max 4 tries).
      for (var att = 0; att < 4; att++) {
        var tl = Math.tan(lambda), cl = Math.cos(lambda);
        var denom = D * tl - ady;
        if (denom < 0.5) denom = 0.5;
        var vv2 = TF.GRAV * D * D / (2 * cl * cl * denom);
        // Trajectory height at the hill's x:
        var yHill = dHill * tl - TF.GRAV * dHill * dHill / (2 * vv2 * cl * cl);
        if (dHill < 0.5 || yHill >= hHill) break;
        lambda = Math.min(1.3, lambda + 0.2);
      }
      var tl2 = Math.tan(lambda), cl2 = Math.cos(lambda);
      var denom2 = D * tl2 - ady;
      if (denom2 < 0.5) denom2 = 0.5;
      var vv2b = TF.GRAV * D * D / (2 * cl2 * cl2 * denom2);
      // Land-short fudge scales v^2 (range ~ v^2); never short into water.
      var fudge = hz.water ? 1.0 : (cycleBreak > 0 ? 0.8 : (D < 25 ? 0.92 : 0.95));
      power = Math.sqrt(Math.max(1, vv2b * fudge)) * (1 + stall * 0.1);
      if (D < 25 && power > 34) power = 34;
      power = Math.min(TF.MAX_POWER * 0.97, power);
      ang = Math.atan2(Math.sin(lambda), dirX * Math.cos(lambda));
    }
    TF.shoot(ball, Math.cos(ang) * power, Math.sin(ang) * power);
    strokes++;
    settle(hole, ball, 30);
    if (ball.inWater) {
      strokes++; // +1 penalty; ball returns to previous rest spot (spec rule)
      ball.x = lastRest.x; ball.y = lastRest.y;
      ball.vx = 0; ball.vy = 0;
      ball.resting = true; ball.inWater = false;
      loftBoost = Math.min(loftBoost + 0.22, 0.8);
      stall = 0;
      continue;
    }
    if (ball.resting && !ball.inCup) {
      // Cycle detection: revisiting an old rest spot -> break the pattern.
      cycleBreak = 0;
      for (var r = 0; r < restHistory.length - 1; r++) {
        if (Math.abs(ball.x - restHistory[r]) < 3) { cycleBreak = 1; break; }
      }
      restHistory.push(ball.x);
      if (restHistory.length > 6) restHistory.shift();
      if (Math.abs(ball.x - lastRest.x) < 2.5) stall = Math.min(stall + 1, 4);
      else stall = 0;
      lastRest = { x: ball.x, y: ball.y };
    }
  }
  return { strokes: strokes, finished: ball.inCup };
}

group('solvability: greedy bot finishes all 50 holes, 45+ within par+2', function () {
  var finished = 0, withinPar2 = 0;
  var worst = [];
  for (var s = 0; s < 50; s++) {
    var hole = TF.genHole(3000 + s);
    var r = botPlay(hole);
    if (r.finished) finished++;
    if (r.finished && r.strokes <= hole.par + 2) withinPar2++;
    else if (!r.finished || r.strokes > hole.par + 2) {
      worst.push('seed ' + (3000 + s) + ': par ' + hole.par + ' strokes ' + r.strokes +
        (r.finished ? '' : ' DNF'));
    }
  }
  ok(finished === 50, 'bot finished ' + finished + '/50');
  ok(withinPar2 >= 45, 'bot <= par+2 on ' + withinPar2 + '/50 (need 45)');
  if (worst.length) console.log('  slowest: ' + worst.slice(0, 8).join(' | '));
});

/* ---------------- daily determinism ---------------- */

group('daily: same date string -> identical hole', function () {
  var h1 = TF.genHole(TF.dailySeed('2026-10-04'));
  var h2 = TF.genHole(TF.dailySeed('2026-10-04'));
  ok(h1.tee.x === h2.tee.x && h1.tee.y === h2.tee.y, 'tee identical');
  ok(h1.cup.x === h2.cup.x && h1.cup.y === h2.cup.y, 'cup identical');
  ok(h1.par === h2.par && h1.biome === h2.biome, 'par/biome identical');
  ok(h1.waterLevel === h2.waterLevel &&
     JSON.stringify(h1.sand) === JSON.stringify(h2.sand) &&
     JSON.stringify(h1.water) === JSON.stringify(h2.water), 'hazards identical');
  var same = true;
  for (var x = 0; x <= 100; x += 5) {
    if (h1.terrain.h(x) !== h2.terrain.h(x)) { same = false; break; }
  }
  ok(same, 'terrain samples identical');
});

/* ---------------- scoring ---------------- */

group('scoring: starsFor', function () {
  ok(TF.starsFor(3, 3) === 3, 'par -> 3');
  ok(TF.starsFor(1, 4) === 3, 'under par -> 3');
  ok(TF.starsFor(4, 3) === 2, 'par+1 -> 2');
  ok(TF.starsFor(5, 4) === 2, 'par+1 -> 2 (b)');
  ok(TF.starsFor(5, 3) === 1, 'par+2 -> 1');
  ok(TF.starsFor(9, 3) === 1, 'way over -> 1');
});

console.log('\n' + checks + ' checks, ' + failures + ' failures.');
process.exit(failures ? 1 : 0);
