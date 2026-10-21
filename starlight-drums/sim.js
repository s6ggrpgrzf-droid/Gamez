/* Starlight Drums — pure logic core. No DOM, no audio, no canvas.
 * Chart generation, judgment windows, scoring and grades.
 * Seeded everywhere (mulberry32) so a chart is reproducible from its seed.
 * Loaded as a classic script before game.js; also require()-able in node. */
(function (global) {
'use strict';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* Judgment: groove first. Signed milliseconds from the note's true time —
 * negative is early, positive is late. The late side runs a little wider:
 * every input chain (touch, handler, speaker) pushes real taps late, so the
 * honest window leans that way too. */
var PERFECT_MS = 55;        // early edge for perfect
var PERFECT_LATE_MS = 60;
var GOOD_MS = 115;          // early edge for good
var GOOD_LATE_MS = 135;
function judge(dtMs) {
  var a = Math.abs(dtMs);
  if (dtMs >= -PERFECT_MS && dtMs <= PERFECT_LATE_MS) return 'perfect';
  if (dtMs >= -GOOD_MS && dtMs <= GOOD_LATE_MS) return 'good';
  return 'miss';
}

/* ---- the song ------------------------------------------------------------
 * 92 BPM, 34 bars: intro 4 · verse 8 · chorus 8 · verse 6 · chorus 6 · outro 2
 * Notes live on the 8th-note grid, placed from per-section rhythm templates
 * (musical, not dice), drums assigned by accent: downbeats lean low, offbeats
 * lean high, runs alternate. Chorus bars may add a 16th pickup on the
 * opposite drum. Every note also owns a star: a place in the sky it lights
 * when hit, spread by a golden-ratio walk so the figure fills evenly. */
var BPM = 92;
var BEAT = 60 / BPM;          // seconds per beat
var BAR = BEAT * 4;            // seconds per bar
var SECTIONS = [
  { name: 'intro',  bars: 4, density: 0.45 },
  { name: 'verse',  bars: 8, density: 0.62 },
  { name: 'chorus', bars: 8, density: 0.85 },
  { name: 'verse',  bars: 6, density: 0.66 },
  { name: 'chorus', bars: 6, density: 0.9 },
  { name: 'outro',  bars: 2, density: 0.4 }
];
/* 8th-slot templates, 1 = a hit. Slot 0 is the bar's downbeat. */
var TEMPLATES = {
  intro:  [[1,0,0,0, 0,0,0,0], [1,0,0,0, 0,0,1,0], [0,0,1,0, 0,0,0,0]],
  verse:  [[1,0,1,0, 1,0,1,0], [1,0,0,1, 0,1,0,0], [1,0,1,0, 0,1,0,1],
           [1,0,0,0, 1,0,1,0], [0,1,0,1, 1,0,0,1]],
  chorus: [[1,0,1,1, 0,1,1,0], [1,1,0,1, 1,0,1,1], [1,0,1,0, 1,1,0,1],
           [1,1,1,0, 1,0,1,0], [1,0,1,1, 1,0,1,0]],
  outro:  [[1,0,0,0, 0,0,0,0], [1,0,0,0, 0,0,0,0]]
};
/* chord roots for the bed (A minor): A2 C3 F2 G2 in midi */
var ROOTS = [45, 48, 41, 43];

function makeChart(seed) {
  var rng = mulberry32(seed >>> 0);
  var notes = [];
  var bed = [];
  var barIndex = 0;
  var prevDrum = 1; // so the first accent flips to the low drum
  for (var s = 0; s < SECTIONS.length; s++) {
    var sec = SECTIONS[s];
    for (var b = 0; b < sec.bars; b++, barIndex++) {
      var barT = barIndex * BAR;
      // the bed: a soft bass root on the bar, a pluck motif in busier sections
      bed.push({ t: barT, kind: 'bass', midi: ROOTS[barIndex % 4] });
      if (sec.name !== 'intro' && sec.name !== 'outro') {
        var plucks = sec.name === 'chorus' ? 3 : 2;
        for (var pk = 0; pk < plucks; pk++) {
          var slot = 1 + Math.floor(rng() * 7);
          bed.push({ t: barT + slot * (BAR / 8), kind: 'pluck',
                     midi: 69 + [0, 3, 5, 7, 10, 12][Math.floor(rng() * 6)] });
        }
      }
      if (sec.name === 'intro' && b === 0) continue; // one full bar of count-in sky
      var tmpl = TEMPLATES[sec.name][Math.floor(rng() * TEMPLATES[sec.name].length)];
      for (var i = 0; i < 8; i++) {
        if (!tmpl[i]) continue;
        if (rng() > sec.density + 0.25) continue; // density breathes
        var drum;
        if (i % 4 === 0) drum = rng() < 0.78 ? 0 : 1;       // downbeats lean low
        else if (i % 2 === 0) drum = rng() < 0.5 ? 0 : 1;   // quarter offbeats even
        else drum = prevDrum === 0 ? 1 : 0;                  // 8th offbeats alternate
        // keep an 8th of air around a drum's own hits
        var t = barT + i * (BAR / 8);
        var clash = false;
        for (var n = notes.length - 1; n >= 0 && notes[n].t > t - 0.3; n--) {
          if (notes[n].drum === drum && t - notes[n].t < (BAR / 8) * 0.9) { clash = true; break; }
        }
        if (clash) drum = 1 - drum;
        notes.push({ t: t, drum: drum, state: 0 }); // state: 0 open · 1 hit · 2 missed
        prevDrum = drum;
        // chorus sparkle: a 16th pickup on the opposite drum, now and then
        if (sec.name === 'chorus' && i < 7 && tmpl[i + 1] && rng() < 0.3) {
          notes.push({ t: t + BAR / 16, drum: 1 - drum, state: 0 });
          prevDrum = 1 - drum;
        }
      }
    }
  }
  notes.sort(function (a, b2) { return a.t - b2.t; });
  assignStars(notes, seed);
  var duration = barIndex * BAR;
  return { bpm: BPM, duration: duration, notes: notes, bed: bed, seed: seed >>> 0 };
}

/* every note owns a star in the sky (stage-relative). x rides the golden
 * walk for an even spread; y comes from the rng stream itself — walking y on
 * the conjugate fraction (0.382 = 1 − 0.618) traced a perfect diagonal.
 * Shared by the synth chart and the real-track chart (song.js). */
function assignStars(notes, seed) {
  var rng = mulberry32((seed >>> 0) ^ 0x57A2);
  for (var k = 0; k < notes.length; k++) {
    notes[k].sx = 0.07 + 0.86 * ((k * 0.61803 + rng() * 0.05) % 1);
    notes[k].sy = 0.05 + 0.42 * rng();
    notes[k].id = k;
    if (notes[k].state == null) notes[k].state = 0;
  }
  return notes;
}

/* ---- scoring ------------------------------------------------------------- */
function createScore() {
  return { perfect: 0, good: 0, miss: 0, streak: 0, maxStreak: 0, lit: 0 };
}
function applyJudge(score, result) {
  if (result === 'perfect') { score.perfect++; score.lit += 1; score.streak++; }
  else if (result === 'good') { score.good++; score.lit += 0.55; score.streak++; }
  else { score.miss++; score.streak = 0; return score; }
  if (score.streak > score.maxStreak) score.maxStreak = score.streak;
  return score;
}
function gradeFor(score, totalNotes) {
  var pct = totalNotes > 0 ? (score.lit / totalNotes) * 100 : 0;
  var letter = pct >= 95 ? 'S' : pct >= 88 ? 'A' : pct >= 78 ? 'B' : pct >= 65 ? 'C' : 'D';
  return { pct: pct, letter: letter };
}

/* ---- the constellation -----------------------------------------------------
 * One figure hides in every chart: a swan of twenty stars, spread evenly
 * across the song's timeline so it assembles as you play. Figure notes take
 * their star homes from the figure; the rest of the chart scatters around it.
 * Points are stage-relative; links join figure indices. */
var FIGURE_NAME = 'The Swan';
var FIGURE_PTS = [
  [0.100, 0.300], [0.080, 0.235], [0.110, 0.185],   // 0-2  tail fan
  [0.175, 0.260],                                   // 3    rear
  [0.260, 0.238], [0.350, 0.218],                   // 4-5  back
  [0.305, 0.135], [0.385, 0.088], [0.475, 0.112],   // 6-8  raised wing
  [0.445, 0.200],                                   // 9    wing root
  [0.475, 0.238],                                   // 10   front
  [0.535, 0.228],                                   // 11   neck base
  [0.570, 0.178], [0.590, 0.128],                   // 12-13 neck
  [0.620, 0.098], [0.652, 0.108],                   // 14 head · 15 beak
  [0.550, 0.272],                                   // 16   chest
  [0.425, 0.283], [0.300, 0.288], [0.205, 0.286]    // 17-19 belly
];
var FIGURE_LINKS = [
  [0, 3], [1, 3], [2, 3], [3, 4], [4, 5], [5, 10],
  [4, 6], [6, 7], [7, 8], [8, 9], [9, 10],
  [10, 11], [11, 12], [12, 13], [13, 14], [14, 15],
  [11, 16], [16, 17], [17, 18], [18, 19], [19, 3]
];
function makeFigure(notes, seed) {
  var F = FIGURE_PTS.length;
  var rng = mulberry32(((seed >>> 0) || 1) ^ 0xF16);
  var idxs = [], pts = [];
  for (var k = 0; k < F; k++) {
    idxs.push(Math.round(k * (notes.length - 1) / (F - 1)));
    pts.push([
      FIGURE_PTS[k][0] + (rng() - 0.5) * 0.016,
      FIGURE_PTS[k][1] + (rng() - 0.5) * 0.014
    ]);
  }
  return { name: FIGURE_NAME, idxs: idxs, pts: pts, links: FIGURE_LINKS };
}

var SD_SIM = {
  mulberry32: mulberry32, hashStr: hashStr,
  PERFECT_MS: PERFECT_MS, PERFECT_LATE_MS: PERFECT_LATE_MS,
  GOOD_MS: GOOD_MS, GOOD_LATE_MS: GOOD_LATE_MS, judge: judge,
  BPM: BPM, BEAT: BEAT, BAR: BAR,
  makeChart: makeChart, assignStars: assignStars,
  makeFigure: makeFigure, FIGURE_PTS: FIGURE_PTS, FIGURE_LINKS: FIGURE_LINKS,
  createScore: createScore,
  applyJudge: applyJudge, gradeFor: gradeFor
};
global.SD_SIM = SD_SIM;
if (typeof module !== 'undefined' && module.exports) module.exports = SD_SIM;
})(typeof window !== 'undefined' ? window : globalThis);
