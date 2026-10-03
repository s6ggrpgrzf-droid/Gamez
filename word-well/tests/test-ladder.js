/* Word Well — headless tests for ladder.js (run: node tests/test-ladder.js)
 * NOTE: no 'use strict' here — words.js declares globals via `var` and the
 * eval() trick only hoists them into module scope in sloppy mode. */
var fs = require('fs');
var path = require('path');
// words.js and ladder.js declare/use globals via `var` — load in this order.
eval(fs.readFileSync(path.join(__dirname, '..', 'words.js'), 'utf8'));
var WW = eval(fs.readFileSync(path.join(__dirname, '..', 'ladder.js'), 'utf8') +
  '\n;module.exports;'); // ladder.js assigns module.exports in node

var passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL: ' + name); }
}
function eq(a, b, name) { ok(a === b, name + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

// ---------------------------------------------------------------- setup
var adj = WW.buildAnswerGraph();
ok(adj instanceof Map && adj.size === 1100, 'graph has 1100 nodes');
var cachedAgain = WW.buildAnswerGraph();
ok(cachedAgain === adj, 'buildAnswerGraph returns cached instance');
var giantSet = new Set(WW_GIANT);
var giantNodes = WW_GIANT.filter(function (w) { return adj.has(w); });
ok(giantNodes.length === 874, 'all 874 GIANT words are graph nodes');
ok(giantSet.has('cold') === false || true, 'giant set sanity'); // no-op guard

// ============================================================== 1. BFS
var pair = null; // find any (a,b) with dist(a,b) == 3
outer:
for (var gi = 0; gi < WW_GIANT.length; gi++) {
  var d = WW.distFrom(WW_GIANT[gi], adj, 3);
  var it = d.entries();
  var e = it.next();
  while (!e.done) {
    if (e.value[1] === 3) { pair = [WW_GIANT[gi], e.value[0]]; break outer; }
    e = it.next();
  }
}
ok(pair !== null, 'found a distance-3 pair in the graph');
var p = WW.bfs(pair[0], pair[1], adj);
eq(p.length, 4, 'bfs dist-3 pair returns 4 words');
eq(p[0], pair[0], 'bfs path starts at from');
eq(p[p.length - 1], pair[1], 'bfs path ends at to');
var stepsOk = true;
for (var s = 0; s < p.length - 1; s++) if (!WW.diffOne(p[s], p[s + 1])) stepsOk = false;
ok(stepsOk, 'every consecutive pair in bfs path diffOne');

var cw = WW.bfs('cold', 'warm', adj);
ok(Array.isArray(cw) && cw.length >= 2, 'bfs(cold,warm) returns a path');
eq(cw[0], 'cold', 'cold->warm path starts at cold');
eq(cw[cw.length - 1], 'warm', 'cold->warm path ends at warm');
var cwOk = true;
for (var c = 0; c < cw.length - 1; c++) if (!WW.diffOne(cw[c], cw[c + 1])) cwOk = false;
ok(cwOk, 'cold->warm path steps all diffOne');
ok(WW.bfs('cold', 'cold', adj).join(',') === 'cold', 'bfs(x,x) returns [x]');
ok(WW.bfs('cold', 'zzzz', adj) === null, 'bfs to missing word returns null');
ok(WW.bfs('zzzz', 'cold', adj) === null, 'bfs from missing word returns null');

// ================================================== 2. daily determinism
var d1 = WW.dailyPuzzle('2026-10-04');
var d2 = WW.dailyPuzzle('2026-10-04');
eq(JSON.stringify(d1), JSON.stringify(d2), 'dailyPuzzle deterministic for same date');
console.log('   sample 2026-10-04: start=' + d1.start + ' end=' + d1.end +
  ' par=' + d1.par + ' rope=' + d1.rope + ' fortuneIdx=' + d1.fortuneIdx);

var datesOk = true;
for (var day = 1; day <= 20; day++) {
  var ds = '2026-10-' + (day < 10 ? '0' + day : day);
  var pz = WW.dailyPuzzle(ds);
  var good = giantSet.has(pz.start) && giantSet.has(pz.end) &&
    pz.start !== pz.end && pz.par >= 4 && pz.par <= 7 &&
    pz.rope === pz.par + 3 && pz.date === ds &&
    pz.start === pz.start.toLowerCase() && pz.end === pz.end.toLowerCase() &&
    Number.isInteger(pz.fortuneIdx) && pz.fortuneIdx >= 0 && pz.fortuneIdx < 24;
  var path = WW.bfs(pz.start, pz.end, adj);
  good = good && path !== null && path.length === pz.par + 1;
  if (!good) { console.error('FAIL: daily puzzle bad for ' + ds + ': ' + JSON.stringify(pz)); datesOk = false; }
}
ok(datesOk, '20 daily puzzles (2026-10-01..20) all valid with bfs length par+1');

var pA = WW.practicePuzzle(12345), pB = WW.practicePuzzle(12345);
eq(JSON.stringify(pA), JSON.stringify(pB), 'practicePuzzle deterministic for same seed');
ok(pA.date === null && pA.par >= 4 && pA.par <= 7, 'practicePuzzle shape: date null, par 4..7');
ok(JSON.stringify(WW.practicePuzzle(999)) !== JSON.stringify(WW.practicePuzzle(1000)),
  'practicePuzzle differs for different seeds');

// ======================================================= 3. validation
var used = new Set(['cold']);
var r = WW.validateGuess('zzzz', 'cold', used, adj);
ok(!r.ok && r.code === 'not-word', "validateGuess('zzzz',...) -> not-word");
r = WW.validateGuess('cord', 'cold', used, adj);
ok(r.ok === true, "validateGuess('cord','cold',used) -> ok");
r = WW.validateGuess('cord', 'warm', used, adj);
ok(!r.ok && r.code === 'not-one-letter', "validateGuess('cord','warm',...) -> not-one-letter");
r = WW.validateGuess('cold', 'cord', new Set(['cold', 'cord']), adj);
ok(!r.ok && r.code === 'repeat', "validateGuess('cold',...) with cold used -> repeat");
// check order: not-word beats repeat; repeat beats not-one-letter
r = WW.validateGuess('zzzz', 'cold', new Set(['zzzz']), adj);
ok(!r.ok && r.code === 'not-word', 'order: not-word checked before repeat');
r = WW.validateGuess('cold', 'warm', new Set(['cold']), adj); // 'cold' in guesses, in used
ok(!r.ok && r.code === 'repeat', 'order: repeat checked before not-one-letter');
// used as plain array
r = WW.validateGuess('cord', 'cold', ['cold'], adj);
ok(r.ok === true, 'validateGuess accepts used as array');
ok(WW.validateGuess('COLD', 'warm', new Set(), adj).code === 'not-word',
  'uppercase not in guesses (contract is lowercase)');

// =========================================================== 4. scoring
eq(WW.starsFor(4, 4), 3, 'starsFor(4,4)===3');
eq(WW.starsFor(5, 4), 2, 'starsFor(5,4)===2');
eq(WW.starsFor(6, 4), 1, 'starsFor(6,4)===1');
eq(WW.starsFor(9, 4), 1, 'starsFor(9,4)===1');
eq(WW.starsFor(3, 4), 3, 'starsFor(3,4)===3 (steps <= par)');
eq(WW.starsFor(7, 5), 1, 'starsFor(7,5)===1');

// ============================================================== 5. hint
var hintOk = true;
var sampleDays = ['2026-10-04', '2026-10-07', '2026-10-11', '2026-10-15', '2026-10-19'];
for (var hi = 0; hi < sampleDays.length; hi++) {
  var hp = WW.dailyPuzzle(sampleDays[hi]);
  var dEnd = WW.distFrom(hp.end, adj, 50);
  var cur = hp.start;
  var walkSteps = 0;
  while (cur !== hp.end && walkSteps < 60) {
    var h = WW.hintNext(cur, hp.end, adj);
    if (h === null) { hintOk = false; console.error('FAIL: hintNext null at ' + cur); break; }
    if (!(dEnd.get(h) === dEnd.get(cur) - 1)) {
      hintOk = false;
      console.error('FAIL: hint ' + h + ' not one closer than ' + cur);
      break;
    }
    cur = h; walkSteps++;
  }
  if (cur !== hp.end) { hintOk = false; console.error('FAIL: hint walk did not reach end for ' + sampleDays[hi]); }
  if (walkSteps !== hp.par) {
    hintOk = false;
    console.error('FAIL: hint walk took ' + walkSteps + ' steps, par ' + hp.par + ' for ' + sampleDays[hi]);
  }
}
ok(hintOk, 'hintNext walks start->end in exactly par steps (5 puzzles)');
ok(WW.hintNext('warm', 'warm', adj) === null, 'hintNext(x,x) -> null');
ok(WW.hintNext('cold', 'warm', adj) !== null, 'hintNext(cold,warm) non-null');
// player standing on a GUESSES-only word (not in answer graph)
var guessOnly = null;
for (var x = 0; x < WW_GUESSES.length; x++) {
  if (!adj.has(WW_GUESSES[x])) { guessOnly = WW_GUESSES[x]; break; }
}
if (guessOnly) {
  var dE = WW.distFrom('warm', adj, 50);
  var best = null, bestD = Infinity;
  for (var y = 0; y < WW_ANSWERS.length; y++) {
    if (WW.diffOne(WW_ANSWERS[y], guessOnly) && dE.has(WW_ANSWERS[y]) && dE.get(WW_ANSWERS[y]) < bestD) {
      bestD = dE.get(WW_ANSWERS[y]); best = WW_ANSWERS[y];
    }
  }
  if (best) {
    eq(WW.hintNext(guessOnly, 'warm', adj), best,
      'hintNext from GUESSES-only word scans answers (' + guessOnly + ' -> ' + best + ')');
  } else {
    ok(WW.hintNext(guessOnly, 'warm', adj) === null, 'hintNext null when no closer neighbor exists');
  }
} else {
  console.log('   note: no GUESSES-only word found; scan-branch untested');
}

// ======================================================= 6. mulberry32
var g1 = WW.mulberry32(42), g2 = WW.mulberry32(42);
var vals1 = [], vals2 = [];
for (var k = 0; k < 5; k++) { vals1.push(g1()); vals2.push(g2()); }
eq(JSON.stringify(vals1), JSON.stringify(vals2), 'mulberry32 same seed -> identical first 5 values');
var g3 = WW.mulberry32(43);
ok(g3() !== vals1[0], 'mulberry32 different seeds differ');
ok(vals1.every(function (v) { return v >= 0 && v < 1; }), 'mulberry32 values in [0,1)');
var h1 = WW.hashSeed('2026-10-04'), h2 = WW.hashSeed('2026-10-04');
eq(h1, h2, 'hashSeed deterministic');
ok(Number.isInteger(h1) && h1 >= 0 && h1 <= 0xFFFFFFFF, 'hashSeed returns uint32');
ok(WW.hashSeed('2026-10-05') !== h1, 'hashSeed differs across dates');

// diffOne spot checks
ok(WW.diffOne('cold', 'cord') === true, 'diffOne cold/cord');
ok(WW.diffOne('cold', 'cold') === false, 'diffOne identical');
ok(WW.diffOne('cold', 'warm') === false, 'diffOne 4-differs');
ok(WW.diffOne('cold', 'colder') === false, 'diffOne length mismatch');

// -------------------------------------------------------------- report
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
