/* Nebula Drift — planets ephemeris tests. Run: node tests/planets.test.js
 * Ground truth: JPL Horizons observer ephemerides (geocentric, QUANTITIES
 * 1,9), fetched 2026-10-23 for the two instants below. Tolerances reflect
 * the JPL approximate elements' known accuracy (arcminutes for the inner
 * planets, ~5 arcmin for Saturn) and Saturn's un-modelled rings. */
'use strict';
const PLANETS = require('../planets.js');
const SKY = require('../sky.js');
let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, detail || ''); }
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }
function sepDeg(g, t) {
  const dRa = Math.abs(g.ra - t[0]) * 15 * Math.cos(t[1] * Math.PI / 180);
  return Math.hypot(dRa, Math.abs(g.dec - t[1]));
}

const EPOCHS = [
  { iso: '2026-10-24T03:00:00Z', truth: {
    Mercury: [15.1541, -20.810, 0.497], Venus: [13.7267, -17.705, -4.192],
    Mars: [9.1392, 17.950, 0.937], Jupiter: [9.6993, 14.502, -1.963],
    Saturn: [0.6485, 1.253, 0.425] } },
  { iso: '2025-12-26T04:00:00Z', truth: {
    Mercury: [17.2392, -22.908, -0.544], Venus: [18.1097, -23.709, -3.914],
    Mars: [18.5749, -24.055, 1.181], Jupiter: [7.5679, 21.904, -2.657],
    Saturn: [23.7845, -3.883, 0.995] } }
];
for (const ep of EPOCHS) {
  const got = PLANETS.positions(new Date(ep.iso));
  ok(got.length === 5, ep.iso + ': five planets', 'got ' + got.length);
  for (const g of got) {
    const t = ep.truth[g.name];
    ok(sepDeg(g, t) <= 0.15, ep.iso + ' ' + g.name + ' position vs Horizons',
      'sep ' + sepDeg(g, t).toFixed(3) + ' deg');
    ok(near(g.mag, t[2], 0.35), ep.iso + ' ' + g.name + ' magnitude vs Horizons',
      'got ' + g.mag.toFixed(2) + ' true ' + t[2]);
  }
}

/* Tonight over Edmond (the game's 22:00 instant, 2026-10-23 local):
 * Saturn is the one planet up; the rest are honestly below the horizon. */
const tonight = new Date(Date.UTC(2026, 9, 24, 3, 0, 0));
const lstT = SKY.lstDeg(SKY.jdFromDate(tonight), SKY.HOME.lon);
const alts = {};
for (const p of PLANETS.positions(tonight)) {
  alts[p.name] = SKY.altAz(p.ra, p.dec, SKY.HOME.lat, lstT).alt;
}
ok(alts.Saturn > 20, 'tonight: Saturn well up at 22:00', 'alt ' + alts.Saturn.toFixed(1));
ok(alts.Venus < 0 && alts.Jupiter < 0 && alts.Mars < 0 && alts.Mercury < 0,
  'tonight: Venus/Jupiter/Mars/Mercury below the horizon at 22:00',
  JSON.stringify(alts));

/* A year of monthly samples: nothing blows up, magnitudes stay in the
 * plausible naked-eye bands, distances stay in each planet's range. */
const BANDS = {
  Mercury: [-2.6, 2.9, 0.25, 1.5], Venus: [-5.0, -3.7, 0.25, 1.75],
  Mars: [-2.9, 1.9, 0.4, 2.7], Jupiter: [-2.9, -1.4, 4.2, 6.5],
  Saturn: [-0.6, 1.3, 8.1, 10.7]
};
let sane = true, worst = '';
for (let m = 0; m < 12; m++) {
  for (const p of PLANETS.positions(new Date(Date.UTC(2026, m, 15, 3, 0, 0)))) {
    const b = BANDS[p.name];
    if (!isFinite(p.ra) || !isFinite(p.dec) || !isFinite(p.mag)) { sane = false; worst = p.name + ' NaN month ' + m; }
    if (p.mag < b[0] || p.mag > b[1]) { sane = false; worst = p.name + ' mag ' + p.mag.toFixed(2) + ' month ' + m; }
    if (p.distAU < b[2] || p.distAU > b[3]) { sane = false; worst = p.name + ' dist ' + p.distAU.toFixed(2) + ' month ' + m; }
  }
}
ok(sane, 'monthly sweep 2026: finite, in-band magnitudes and distances', worst);

/* describeCompany geometry: figure centres and radii rebuilt from the
 * SKY catalogue exactly as game.js builds them. */
function figGeoFor(date) {
  const sky = SKY.tonightSky(date, SKY.HOME);
  const byName = {};
  sky.stars.forEach(s => { byName[s.name] = s; });
  return SKY.FIGURES.map(f => {
    const used = new Set(); f.lines.flat().forEach(n => used.add(n));
    const acc = [0, 0, 0];
    used.forEach(n => { const d = byName[n].dir; acc[0] += d[0]; acc[1] += d[1]; acc[2] += d[2]; });
    const len = Math.hypot(acc[0], acc[1], acc[2]) || 1;
    const centre = [acc[0] / len, acc[1] / len, acc[2] / len];
    let radius = 0;
    used.forEach(n => { radius = Math.max(radius, PLANETS.angBetween(byName[n].dir, centre)); });
    return { name: f.name, centre, radius };
  });
}
{
  const geo = figGeoFor(tonight);
  const sky = SKY.tonightSky(tonight, SKY.HOME);
  const sat = PLANETS.positions(tonight).find(p => p.name === 'Saturn');
  const satDir = SKY.dirFromRaDec(sat.ra, sat.dec, SKY.HOME.lat, sky.lst);
  const co = PLANETS.describeCompany(satDir, geo, sky.stars);
  ok(co.host === null, 'tonight: Saturn hosts in no drawn figure (Pisces gap)', 'host=' + co.host);
  ok(co.near.length === 2 && co.near[0].name === 'Aries' && co.near[1].name === 'Pegasus',
    'tonight: Saturn stands between Aries and Pegasus (nearest centre first)',
    'near=' + co.near.map(n => n.name).join(','));
  const aries = geo.find(g => g.name === 'Aries');
  const inAries = PLANETS.describeCompany(aries.centre, geo, sky.stars);
  ok(inAries.host === 'Aries', 'synthetic: a point at the Aries centre is its guest', 'host=' + inAries.host);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
