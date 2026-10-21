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
ok(SKY.STARS.every(s => s[3] > -1 && s[3] <= 4.5), 'magnitudes sane');
ok(SKY.NEBULAE.length >= 12, 'nebula anchor count', SKY.NEBULAE.length);

/* Direction vectors are unit length */
const d = SKY.dirFromAltAz(37, 123);
ok(near(Math.hypot(d[0], d[1], d[2]), 1, 1e-9), 'dirFromAltAz unit vector');

/* Spectral colours: B stars blue, M stars warm — and different. */
const cb = SKY.spectralColor('B8'), cm = SKY.spectralColor('M5');
ok(cb[2] === 255 && cm[0] === 255 && cb[0] < cm[0], 'spectral colours run blue->red');

/* Seeded RNG is reproducible */
const r1 = SKY.mulberry32(42), r2 = SKY.mulberry32(42);
ok(r1() === r2() && r1() === r2(), 'mulberry32 deterministic');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
