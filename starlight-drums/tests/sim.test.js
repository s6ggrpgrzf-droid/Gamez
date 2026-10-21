/* Starlight Drums sim tests — deterministic, headless. */
const SIM = require('../sim.js');
let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.log('FAIL:', msg); } }
function eq(a, b, msg) { ok(a === b, msg + ' (' + a + ' !== ' + b + ')'); }

// determinism: same seed -> identical chart, different seed -> different chart
const c1 = SIM.makeChart(20261021), c2 = SIM.makeChart(20261021), c3 = SIM.makeChart(42);
eq(JSON.stringify(c1), JSON.stringify(c2), 'same seed, same chart');
ok(JSON.stringify(c1) !== JSON.stringify(c3), 'different seed, different chart');

// shape: duration and note count in a playable band
ok(Math.abs(c1.duration - 88.7) < 1.5, 'duration ~88.7s, got ' + c1.duration);
ok(c1.notes.length >= 80 && c1.notes.length <= 190, 'note count in band, got ' + c1.notes.length);
ok(c1.bed.length > 30, 'bed has events, got ' + c1.bed.length);

// notes sorted, all inside the song, drums valid, stars in the sky region
let sorted = true, inSong = true, drumsOk = true, starsOk = true;
let sameDrumGap = Infinity, anyGap = Infinity;
for (let i = 0; i < c1.notes.length; i++) {
  const n = c1.notes[i];
  if (i && n.t < c1.notes[i - 1].t) sorted = false;
  if (n.t < SIM.BAR || n.t > c1.duration) inSong = false;
  if (n.drum !== 0 && n.drum !== 1) drumsOk = false;
  if (n.sx < 0.05 || n.sx > 0.95 || n.sy < 0.03 || n.sy > 0.6) starsOk = false;
  if (i) {
    const g = n.t - c1.notes[i - 1].t;
    if (g > 0.001 && g < anyGap) anyGap = g;
  }
  for (let j = i + 1; j < c1.notes.length; j++) {
    if (c1.notes[j].drum === n.drum) {
      const g2 = c1.notes[j].t - n.t;
      if (g2 < sameDrumGap) sameDrumGap = g2;
      break;
    }
  }
}
ok(sorted, 'notes sorted by time');
ok(inSong, 'all notes after the count-in bar and inside the song');
ok(drumsOk, 'drums are 0 or 1');
ok(starsOk, 'every star lives in the sky region');
// the star field must not collapse onto a diagonal: (sx+sy) mod 1 spread out
let diagMean = 0; const diagVals = c1.notes.map(n => (n.sx + n.sy) % 1);
diagVals.forEach(v => diagMean += v / diagVals.length);
let diagVar = 0; diagVals.forEach(v => diagVar += (v - diagMean) * (v - diagMean) / diagVals.length);
ok(Math.sqrt(diagVar) > 0.18, 'star field is not a diagonal line (std ' + Math.sqrt(diagVar).toFixed(2) + ')');
ok(sameDrumGap >= 0.28, 'same-drum gap >= 0.28s (an 8th at 92bpm), got ' + sameDrumGap.toFixed(3));

// judgment windows (signed: negative early, positive late; late side wider)
eq(SIM.judge(0), 'perfect', 'judge 0ms');
eq(SIM.judge(60), 'perfect', 'judge +60ms late still perfect');
eq(SIM.judge(61), 'good', 'judge +61ms');
eq(SIM.judge(-55), 'perfect', 'judge -55ms early still perfect');
eq(SIM.judge(-56), 'good', 'judge -56ms');
eq(SIM.judge(135), 'good', 'judge +135ms late still good');
eq(SIM.judge(136), 'miss', 'judge +136ms');
eq(SIM.judge(-115), 'good', 'judge -115ms');
eq(SIM.judge(-116), 'miss', 'judge -116ms');

// star assignment is shared with the real-track chart and stays in the sky
const rawNotes = [{ t: 1, drum: 0 }, { t: 2, drum: 1 }, { t: 3, drum: 0 }];
SIM.assignStars(rawNotes, 42);
ok(rawNotes.every(n => n.sx >= 0.05 && n.sx <= 0.95 && n.sy >= 0.03 && n.sy <= 0.6 && n.state === 0),
   'assignStars places stars in the sky and inits state');
ok(rawNotes.every(n => typeof n.sf === 'number' && n.sf >= 0.22 && n.sf <= 1 && (n.sy > 0.38 || n.sf === 1)),
   'assignStars depth fade: sf in [0.22,1], full strength above the fade band');

// the constellation: 20 figure stars spread across the whole song
const fig = SIM.makeFigure(c1.notes, 7);
eq(fig.idxs.length, 20, 'figure has 20 stars');
eq(fig.idxs[0], 0, 'figure starts at the first note');
eq(fig.idxs[19], c1.notes.length - 1, 'figure ends at the last note');
let spread = true;
for (let i = 1; i < fig.idxs.length; i++) if (fig.idxs[i] <= fig.idxs[i - 1]) spread = false;
ok(spread, 'figure indices strictly increase through the song');
ok(fig.links.every(l => l[0] >= 0 && l[0] < 20 && l[1] >= 0 && l[1] < 20 && l[0] !== l[1]),
   'all links join two distinct figure stars');
ok(fig.pts.every(p => p[0] > 0.03 && p[0] < 0.7 && p[1] > 0.03 && p[1] < 0.36),
   'figure points live in the sky');
eq(JSON.stringify(SIM.makeFigure(c1.notes, 7)), JSON.stringify(fig), 'figure is deterministic');

// the daily pick: same date, same song, for everyone; the week rotates
eq(SIM.pickDaily('2026-10-21', 3), SIM.pickDaily('2026-10-21', 3), 'daily pick is deterministic');
const seen = new Set();
for (let d = 1; d <= 28; d++) seen.add(SIM.pickDaily('2026-11-' + String(d).padStart(2, '0'), 3));
eq(seen.size, 3, 'daily pick rotates through the whole library over a month');
eq(SIM.pickDaily('2026-10-21', 0), 0, 'daily pick survives an empty library');

// scoring + grades
const s = SIM.createScore();
SIM.applyJudge(s, 'perfect'); SIM.applyJudge(s, 'perfect'); SIM.applyJudge(s, 'good');
eq(s.streak, 3, 'streak builds');
eq(s.maxStreak, 3, 'max streak tracked');
ok(Math.abs(s.lit - 2.55) < 1e-9, 'lit accumulates 1 + 1 + 0.55');
SIM.applyJudge(s, 'miss');
eq(s.streak, 0, 'miss breaks streak');
const perfectRun = SIM.createScore();
for (let i = 0; i < 100; i++) SIM.applyJudge(perfectRun, 'perfect');
eq(SIM.gradeFor(perfectRun, 100).letter, 'S', 'all perfect = S');
eq(SIM.gradeFor(perfectRun, 100).pct, 100, 'all perfect = 100%');
const empty = SIM.createScore();
eq(SIM.gradeFor(empty, 100).letter, 'D', 'nothing hit = D');
const goods = SIM.createScore();
for (let i = 0; i < 100; i++) SIM.applyJudge(goods, 'good');
ok(Math.abs(SIM.gradeFor(goods, 100).pct - 55) < 1e-6, 'all good = 55%');

console.log(fails ? ('SIM TEST: ' + fails + ' FAILURES') : 'SIM TEST: PASS (' + c1.notes.length + ' notes, ' + c1.duration.toFixed(1) + 's song)');
process.exit(fails ? 1 : 0);
