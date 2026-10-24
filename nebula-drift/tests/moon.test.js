/* Nebula Drift — moon ephemeris tests.
 * Run: node tests/moon.test.js
 *
 * The Moon is held to the same standard as the planets: positions
 * from a real algorithm (Schlyter's lunar theory, moon.js), checked
 * against anchors nobody can argue with — a total solar eclipse is a
 * conjunction, a total lunar eclipse is an opposition, and the 2026
 * full/new moon dates are published facts. */
'use strict';
const MOON = require('../moon.js');
const PLANETS = require('../planets.js');
let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

/* tonight (Fri Oct 23 2026, 22:00 CDT) — the night this shipped */
const tonight = new Date(Date.UTC(2026, 9, 24, 3, 0, 0));
const m = MOON.position(tonight);
ok(m.illum > 0.90 && m.illum < 0.985, 'tonight: waxing gibbous, ~95% lit', 'illum ' + m.illum.toFixed(3));
ok(m.waxing === true, 'tonight: waxing (full moon is Oct 25)');
ok(m.distKm > 370000 && m.distKm < 386000, 'tonight: distance in the near half of its range', Math.round(m.distKm) + ' km');
ok(m.ra > 0.05 && m.ra < 0.30 && m.dec > 3.2 && m.dec < 5.4, 'tonight: in Pisces, RA ~0.2h Dec ~+4', 'RA ' + m.ra.toFixed(2) + ' Dec ' + m.dec.toFixed(2));

/* Moon–Saturn tonight: ~8 degrees apart, the Moon west and closing
 * (an earlier chat-side prototype of this check used a faulty
 * separation formula and printed 2.8 — the module's own geometry,
 * pinned here, is the correction) */
const sat = PLANETS.positions(tonight).find(p => p.name === 'Saturn');
const cosS = Math.sin(m.dec * Math.PI / 180) * Math.sin(sat.dec * Math.PI / 180) +
  Math.cos(m.dec * Math.PI / 180) * Math.cos(sat.dec * Math.PI / 180) *
  Math.cos((m.ra - sat.ra) * 15 * Math.PI / 180);
const sep = Math.acos(Math.max(-1, Math.min(1, cosS))) * 180 / Math.PI;
ok(sep > 7.0 && sep < 9.0, 'tonight: Moon stands ~8 deg west of Saturn', sep.toFixed(2) + ' deg');

/* total solar eclipse, Aug 12 2026, greatest eclipse 17:47 UTC:
 * the Moon must sit essentially on top of the Sun */
const ec = MOON.position(new Date(Date.UTC(2026, 7, 12, 17, 47, 0)));
ok(ec.elong < 1.3, 'Aug 12 2026 eclipse: Moon–Sun conjunction', 'elong ' + ec.elong.toFixed(2));
ok(ec.illum < 0.005, 'eclipse day: illumination ~zero', ec.illum.toFixed(4));

/* total lunar eclipse, Mar 3 2026, greatest 11:34 UTC:
 * the Moon must sit essentially opposite the Sun */
const le = MOON.position(new Date(Date.UTC(2026, 2, 3, 11, 34, 0)));
ok(le.elong > 178.5, 'Mar 3 2026 lunar eclipse: Moon at opposition', 'elong ' + le.elong.toFixed(2));
ok(le.illum > 0.995, 'lunar eclipse: illumination ~full', le.illum.toFixed(4));

/* published phase dates, 2026 */
const fm = MOON.position(new Date(Date.UTC(2026, 9, 26, 3, 0, 0))); // Oct 25 evening CDT
ok(fm.illum > 0.985, 'Oct 25 2026 evening: essentially full', fm.illum.toFixed(3));
const nm = MOON.position(new Date(Date.UTC(2026, 9, 10, 12, 0, 0)));
ok(nm.illum < 0.02, 'Oct 10 2026: essentially new', nm.illum.toFixed(4));

/* the distance breathes inside its physical envelope all month */
let mn = 1e9, mx = 0;
for (let d = 1; d <= 31; d++) {
  const p = MOON.position(new Date(Date.UTC(2026, 9, d, 12, 0, 0)));
  mn = Math.min(mn, p.distKm); mx = Math.max(mx, p.distKm);
}
ok(mn > 356000 && mx < 407000, 'October: distance stays inside 356k–407k km', Math.round(mn) + '–' + Math.round(mx));

/* it travels eastward at the Moon's own pace, ~13 deg a day */
const a = MOON.position(new Date(Date.UTC(2026, 9, 20, 3, 0, 0)));
const b = MOON.position(new Date(Date.UTC(2026, 9, 27, 3, 0, 0)));
let dra = b.ra - a.ra; if (dra < 0) dra += 24;
const perDay = dra / 7 * 15;
ok(perDay > 10.5 && perDay < 15.5, 'eastward motion ~13 deg/day', perDay.toFixed(1) + ' deg/day in RA-longitude terms');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
