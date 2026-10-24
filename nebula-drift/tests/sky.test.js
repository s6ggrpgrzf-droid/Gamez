/* Nebula Drift — sky math tests. Run: node tests/sky.test.js */
'use strict';
const SKY = require('../sky.js');
let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, detail || ''); }
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

/* Reference instant: tonight, 2026-10-21 22:00 CDT = 2026-10-22 03:00 UTC.
 * Independently computed (python): LST 338.0 deg, Deneb alt 67, Vega 44,
 * Fomalhaut 24.5, Polaris alt ~= latitude. */
const T = new Date(Date.UTC(2026, 9, 22, 3, 0, 0));
const jd = SKY.jdFromDate(T);
const lst = SKY.lstDeg(jd, SKY.HOME.lon);
ok(near(lst, 338.0, 0.4), 'LST for 2026-10-22 03:00 UTC at Edmond lon', 'got ' + lst.toFixed(2));

const pol = SKY.altAz(2.530, 89.26, SKY.HOME.lat, lst);
ok(near(pol.alt, SKY.HOME.lat, 1.2), 'Polaris altitude ~= latitude', 'got ' + pol.alt.toFixed(2));

const deneb = SKY.altAz(20.690, 45.28, SKY.HOME.lat, lst);
ok(deneb.alt > 60 && deneb.alt < 74, 'Deneb high tonight', 'alt ' + deneb.alt.toFixed(1));
const vega = SKY.altAz(18.616, 38.78, SKY.HOME.lat, lst);
ok(vega.alt > 36 && vega.alt < 52, 'Vega mid-west tonight', 'alt ' + vega.alt.toFixed(1));
const fom = SKY.altAz(22.961, -29.62, SKY.HOME.lat, lst);
ok(fom.alt > 16 && fom.alt < 33, 'Fomalhaut low south tonight', 'alt ' + fom.alt.toFixed(1));
const arc = SKY.altAz(14.261, 19.18, SKY.HOME.lat, lst);
ok(arc.alt < 0, 'Arcturus already set tonight', 'alt ' + arc.alt.toFixed(1));

/* Tonight's arrangement: the evening figures must be up. */
const sky = SKY.tonightSky(new Date(2026, 9, 21, 15, 25), SKY.HOME);
const up = sky.stars.filter(s => s.alt > 0);
ok(up.length >= 55, 'most catalogue stars up tonight', up.length + ' up of ' + sky.stars.length);
for (const name of ['Deneb', 'Vega', 'Altair', 'Caph', 'Markab', 'Fomalhaut', 'Mirfak', 'Polaris']) {
  const s = sky.stars.find(x => x.name === name);
  ok(s && s.alt > 3, name + ' above horizon tonight', s ? 'alt ' + s.alt.toFixed(1) : 'missing');
}
const nebUp = sky.nebulae.filter(n => n.alt > -5);
ok(nebUp.length >= 11, 'tonight nebula anchors placed', nebUp.length + ' of ' + sky.nebulae.length);

/* Catalogue integrity */
ok(SKY.STARS.length >= 70, 'catalogue size', SKY.STARS.length);
ok(SKY.STARS.every(s => s[1] >= 0 && s[1] < 24 && s[2] >= -90 && s[2] <= 90), 'RA/Dec ranges sane');
ok(SKY.STARS.every(s => s[3] >= -1.5 && s[3] <= 4.5), 'magnitudes sane'); // lower bound is Sirius, the brightest star there is
ok(SKY.NEBULAE.length >= 12, 'nebula anchor count', SKY.NEBULAE.length);

/* Direction vectors are unit length */
const d = SKY.dirFromAltAz(37, 123);
ok(near(Math.hypot(d[0], d[1], d[2]), 1, 1e-9), 'dirFromAltAz unit vector');

/* Spectral colours: B stars blue, M stars warm — and different. */
const cb = SKY.spectralColor('B8'), cm = SKY.spectralColor('M5');
ok(cb[2] === 255 && cm[0] === 255 && cb[0] < cm[0], 'spectral colours run blue->red');

/* Figures + distances (Pass 2) */
const catNames = new Set(SKY.STARS.map(s => s[0]));
ok(SKY.FIGURES.length >= 15, 'figure count', SKY.FIGURES.length);
let figStarsOk = true, distOk = true, linesOk = true;
for (const f of SKY.FIGURES) {
  if (!f.lines.length) linesOk = false;
  const used = new Set();
  for (const [a, b] of f.lines) {
    if (!catNames.has(a) || !catNames.has(b)) figStarsOk = false;
    used.add(a); used.add(b);
  }
  for (const n of used) {
    const d = SKY.DISTANCES[n];
    if (!(d > 0 && d < 10000)) distOk = false;
  }
}
ok(figStarsOk, 'every figure line joins catalogue stars');
ok(distOk, 'every figure star has a real distance');
ok(linesOk, 'every figure has at least one line');
const cyg = SKY.FIGURES.find(f => f.name === 'Cygnus');
const cygDists = [...new Set(cyg.lines.flat())].map(n => SKY.DISTANCES[n]);
ok(Math.max(...cygDists) - Math.min(...cygDists) > 2000, 'Cygnus depths really are wildly different',
   'span ' + (Math.max(...cygDists) - Math.min(...cygDists)));
ok(SKY.DISTANCES['Vega'] === 25 && SKY.DISTANCES['Deneb'] === 2615, 'anchor distances right (Vega 25, Deneb 2615)');
const skyFig = SKY.tonightSky(new Date(2026, 9, 21, 15, 25), SKY.HOME);
ok(skyFig.stars.find(s => s.name === 'Deneb').dist === 2615, 'tonight stars carry distance');

/* Seeded RNG is reproducible */
const r1 = SKY.mulberry32(42), r2 = SKY.mulberry32(42);
ok(r1() === r2() && r1() === r2(), 'mulberry32 deterministic');

/* Orion + Canis Major (constellations Pass 1, 2026-10-23): reference
 * data from the Wikipedia star lists (Hipparcos). In December evenings
 * both figures stand up over Edmond; on the October reference night
 * they are honestly still below the horizon at 22:00. */
const figNames = SKY.FIGURES.map(f => f.name);
ok(figNames.includes('Orion') && figNames.includes('Canis Major'), 'figures include Orion + Canis Major');
const starNameSet = new Set(SKY.STARS.map(s => s[0]));
let allWired = true;
SKY.FIGURES.forEach(f => f.lines.flat().forEach(n => { if (!starNameSet.has(n) || !SKY.DISTANCES[n]) allWired = false; }));
ok(allWired, 'every figure line names a catalogued star with a distance');
const DEC = new Date(Date.UTC(2026, 11, 22, 4, 0, 0)); // Dec 21, 22:00 CST
const lstDec = SKY.lstDeg(SKY.jdFromDate(DEC), SKY.HOME.lon);
const betD = SKY.altAz(5.920, 7.41, SKY.HOME.lat, lstDec);
ok(betD.alt > 35, 'December 22:00: Betelgeuse high in the east', 'alt ' + betD.alt.toFixed(1));
const sirD = SKY.altAz(6.753, -16.71, SKY.HOME.lat, lstDec);
ok(sirD.alt > 12 && sirD.alt < 30, 'December 22:00: Sirius up, low in the south', 'alt ' + sirD.alt.toFixed(1));
const betO = SKY.altAz(5.920, 7.41, SKY.HOME.lat, lst);
ok(betO.alt < 0, 'October 22:00: Orion honestly below the horizon', 'alt ' + betO.alt.toFixed(1));

/* Gemini + Leo (constellations Pass 2, 2026-10-23): Gemini is a winter
 * evening figure, Leo a spring one; in October both are still down. */
ok(figNames.includes('Gemini') && figNames.includes('Leo'), 'figures include Gemini + Leo');
const polD = SKY.altAz(7.755, 28.03, SKY.HOME.lat, lstDec);
ok(polD.alt > 30, 'December 22:00: Pollux high — Gemini owns the winter evening', 'alt ' + polD.alt.toFixed(1));
const regD = SKY.altAz(10.140, 11.97, SKY.HOME.lat, lstDec);
ok(regD.alt < 2, 'December 22:00: Regulus still on the horizon — Leo not yet risen', 'alt ' + regD.alt.toFixed(1));
const APR = new Date(Date.UTC(2026, 3, 16, 3, 0, 0)); // Apr 15, 22:00 CDT
const lstApr = SKY.lstDeg(SKY.jdFromDate(APR), SKY.HOME.lon);
const regA = SKY.altAz(10.140, 11.97, SKY.HOME.lat, lstApr);
ok(regA.alt > 55, 'April 22:00: Regulus near the top of the sky', 'alt ' + regA.alt.toFixed(1));
const casA = SKY.altAz(7.577, 31.89, SKY.HOME.lat, lstApr);
ok(casA.alt > 45, 'April 22:00: Castor still high in the west — both spring figures up', 'alt ' + casA.alt.toFixed(1));
const polO = SKY.altAz(7.755, 28.03, SKY.HOME.lat, lst);
const regO = SKY.altAz(10.140, 11.97, SKY.HOME.lat, lst);
ok(polO.alt < 0 && regO.alt < 0, 'October 22:00: Gemini and Leo both honestly below the horizon');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
