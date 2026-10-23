/* Nebula Drift — planets.js
 * Pure planetary ephemeris. No DOM, no canvas. Node-testable.
 *
 * The stars in sky.js are a fixed catalogue, but the planets wander —
 * their positions are computed fresh for any date from the JPL
 * approximate Keplerian elements (Standish 1992, Table 1; valid
 * 1800–2050, arcminute-class for the outer planets). Each planet's
 * orbit is solved (Kepler's equation, Newton iteration), placed in
 * the ecliptic, made geocentric against Earth's own orbit, and
 * returned as J2000 right ascension / declination plus an apparent
 * visual magnitude (absolute magnitude + distance modulus + a phase
 * correction per planet). Magnitudes ignore Saturn's rings, so
 * Saturn can read ~0.3 mag off near a ring-plane crossing — noted
 * here rather than hidden.
 *
 * Colours are the honest naked-eye tints: Venus warm white, Jupiter
 * cream, Saturn pale gold, Mars rust, Mercury a pale ember.
 */
'use strict';

/* [name, a(AU), aRate, e, eRate, I(deg), IRate, L(deg), LRate,
 *   longPeri(deg), longPeriRate, longNode(deg), longNodeRate,
 *   H (abs mag), phase coeffs [c1, c2, c3] (per degree of phase angle),
 *   colour [r, g, b] ]
 * Elements and rates are per Julian century past J2000. */
var PLANET_ELEMENTS = [
  ['Mercury', 0.38709927, 0.00000037, 0.20563593, 0.00001906, 7.00497902, -0.00594749,
    252.25032350, 149472.67411175, 77.45779628, 0.16047689, 48.33076593, -0.12534081,
    -0.613, [0.0380, -0.000273, 0.0000020], [235, 224, 208]],
  ['Venus', 0.72333566, 0.00000390, 0.00677672, -0.00004107, 3.39467605, -0.00078890,
    181.97909950, 58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418,
    -4.384, [0, 0, 0], [255, 250, 232]],
  ['Mars', 1.52371034, 0.00001847, 0.09339410, 0.00007882, 1.84969142, -0.00813131,
    -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343,
    -1.601, [0.0227, -0.000130, 0], [255, 148, 88]],
  ['Jupiter', 5.20288700, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714,
    34.39644051, 3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106,
    -9.395, [0.0056, 0, 0], [255, 239, 213]],
  ['Saturn', 9.53667594, -0.00125060, 0.05386179, -0.00050991, 2.48599187, 0.00193609,
    49.95424423, 1222.49362201, 92.59887831, -0.41897216, 113.66242448, -0.28867794,
    -8.914, [0.0010, 0, 0], [255, 206, 122]]
];
/* Earth (EM Bary) — needed for the geocentric view; never rendered. */
var EARTH_ELEMENTS = ['Earth', 1.00000261, 0.00000562, 0.01671123, -0.00004392,
  -0.00001531, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364,
  0.0, 0.0, 0, [0, 0, 0], [0, 0, 0]];

var OBLIQUITY_DEG = 23.43928;

function planetJdFromDate(date) { return date.getTime() / 86400000 + 2440587.5; }

function norm360(x) { x = x % 360; return x < 0 ? x + 360 : x; }

/* Heliocentric ecliptic rectangular coordinates (AU, J2000 ecliptic)
 * for one element row at Julian date jd. */
function helioXYZ(el, jd) {
  var T = (jd - 2451545.0) / 36525;
  var a = el[1] + el[2] * T;
  var e = el[3] + el[4] * T;
  var I = (el[5] + el[6] * T) * Math.PI / 180;
  var L = norm360(el[7] + el[8] * T) * Math.PI / 180;
  var wBar = (el[9] + el[10] * T) * Math.PI / 180;   // longitude of perihelion
  var Om = (el[11] + el[12] * T) * Math.PI / 180;    // longitude of ascending node
  var w = wBar - Om;                                  // argument of perihelion
  var M = L - wBar;                                   // mean anomaly
  // Kepler's equation E - e*sinE = M (Newton, degrees-of-freedom small e)
  var E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
  for (var k = 0; k < 8; k++) {
    E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }
  var xp = a * (Math.cos(E) - e);
  var yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  var r = Math.sqrt(xp * xp + yp * yp);
  var cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(Om), sO = Math.sin(Om);
  var cI = Math.cos(I), sI = Math.sin(I);
  var x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
  var y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
  var z = (sw * sI) * xp + (cw * sI) * yp;
  return { x: x, y: y, z: z, r: r };
}

/* Geocentric J2000 RA (hours), Dec (degrees), apparent magnitude and
 * distances for one planet element row at Julian date jd. */
function planetPosition(el, earth, jd) {
  var h = helioXYZ(el, jd);
  var gx = h.x - earth.x, gy = h.y - earth.y, gz = h.z - earth.z;
  var d = Math.sqrt(gx * gx + gy * gy + gz * gz);
  // ecliptic -> equatorial (rotate about x by the obliquity)
  var eps = OBLIQUITY_DEG * Math.PI / 180;
  var qy = gy * Math.cos(eps) - gz * Math.sin(eps);
  var qz = gy * Math.sin(eps) + gz * Math.cos(eps);
  var ra = norm360(Math.atan2(qy, gx) * 180 / Math.PI) / 15;
  var dec = Math.atan2(qz, Math.sqrt(gx * gx + qy * qy)) * 180 / Math.PI;
  // phase angle at the planet between Sun and Earth (degrees)
  var cosI = (h.r * h.r + d * d - earth.r * earth.r) / (2 * h.r * d);
  cosI = Math.max(-1, Math.min(1, cosI));
  var phase = Math.acos(cosI) * 180 / Math.PI;
  var pc = el[14];
  /* Mercury's cubic phase polynomial is only fitted to ~150 deg; past
   * that (a hairline crescent against the Sun, never observable) the
   * cubic term explodes, so the phase is clamped for magnitude use. */
  var mph = Math.min(phase, 150);
  var mag = el[13] + 5 * Math.log10(h.r * d)
    + pc[0] * mph + pc[1] * mph * mph + pc[2] * mph * mph * mph;
  if (el[0] === 'Venus') {
    /* Venus breaks the shared polynomial: its atmosphere forward-
     * scatters, so a hair-thin crescent stays bright (mag ~-4.2 at
     * phase 172 deg, where a Lambert sphere would read ~+4), and the
     * bare distance modulus over-brightens it at crescent phases.
     * This quadratic is fitted to three JPL Horizons anchors:
     * phase 6 deg -> +0.02, phase 116 deg -> +2.07, 172 deg -> +3.72. */
    mag += 0.0100 * phase + 0.0000673 * phase * phase;
  }
  return {
    name: el[0], ra: ra, dec: dec, mag: mag,
    distAU: d, helioAU: h.r, phase: phase, color: el[15].slice()
  };
}

/* All five naked-eye planets for a JS Date (interpreted as the exact
 * instant given; the game passes its 22:00 "tonight" date). */
function planetPositions(date) {
  var jd = planetJdFromDate(date);
  var earth = helioXYZ(EARTH_ELEMENTS, jd);
  return PLANET_ELEMENTS.map(function (el) { return planetPosition(el, earth, jd); });
}

/* Where a planet keeps its company tonight, in the game's terms:
 * the figure whose drawn shape it stands inside (centre distance
 * within the figure's own angular radius plus a small margin), else
 * the two nearest figure centres it stands between, else the nearest
 * bright star. Pure geometry on unit vectors; the game supplies the
 * figures and stars, so this stays Node-testable.
 * figs:  [{name, centre: [x,y,z], radius: radians}]
 * stars: [{name, dir: [x,y,z]}]                                */
function angBetween(a, b) {
  var d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(Math.max(-1, Math.min(1, d)));
}
function describeCompany(dir, figs, stars) {
  var ranked = figs.map(function (f) {
    return { name: f.name, ang: angBetween(dir, f.centre), radius: f.radius || 0 };
  }).sort(function (a, b) { return a.ang - b.ang; });
  var host = null;
  for (var i = 0; i < ranked.length; i++) {
    if (ranked[i].ang <= ranked[i].radius + 0.10) { host = ranked[i].name; break; }
  }
  var nearStar = null;
  for (var s = 0; s < stars.length; s++) {
    var sa = angBetween(dir, stars[s].dir);
    if (sa < 0.14 && (!nearStar || sa < nearStar.ang)) nearStar = { name: stars[s].name, ang: sa };
  }
  return {
    host: host,
    near: ranked.slice(0, 2).map(function (r) { return { name: r.name, ang: r.ang }; }),
    nearStar: nearStar
  };
}

var PLANETS = {
  ELEMENTS: PLANET_ELEMENTS, positions: planetPositions,
  helioXYZ: helioXYZ, position: planetPosition, jdFromDate: planetJdFromDate,
  describeCompany: describeCompany, angBetween: angBetween
};
if (typeof window !== 'undefined') window.PLANETS = PLANETS;
if (typeof module !== 'undefined' && module.exports) module.exports = PLANETS;
