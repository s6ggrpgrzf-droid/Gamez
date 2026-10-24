/* Nebula Drift — moon.js
 * Pure lunar ephemeris. No DOM, no canvas. Node-testable.
 *
 * The Moon is not a catalogue star and not a planet — it gets its own
 * arithmetic: Paul Schlyter's compact lunar theory (orbital elements
 * plus the principal perturbation terms in longitude, latitude and
 * distance), good to a few arcminutes in position and well under a
 * percent in distance for any date in the game's lifetime. That is
 * the same honesty standard planets.js is held to, and the test file
 * pins it against real anchors: the August 2026 eclipse conjunction,
 * full and new moons, and tonight's distance.
 *
 * Illumination and waxing come from the true geometry: the angle
 * between the Moon's and Sun's directions as seen from Earth (the
 * elongation), and which side of the Sun the Moon stands on. The
 * phase the game draws is the phase the sky is actually showing.
 */
'use strict';

var MOON_R = Math.PI / 180;
function moonRev(x) { x = x % 360; return x < 0 ? x + 360 : x; }
function moonSin(x) { return Math.sin(x * MOON_R); }
function moonCos(x) { return Math.cos(x * MOON_R); }

/* Days since 2000 Jan 0.0 (JD 2451543.5) — Schlyter's epoch. */
function moonDayNumber(date) { return date.getTime() / 86400000 + 2440587.5 - 2451543.5; }

/* The Sun's mean longitude and anomaly at day number d, and its true
 * ecliptic longitude (needed for the perturbation arguments and for
 * the elongation). */
function moonSun(d) {
  var w = 282.9404 + 4.70935e-5 * d;            // longitude of perihelion
  var e = 0.016709 - 1.151e-9 * d;
  var M = moonRev(356.0470 + 0.9856002585 * d); // mean anomaly
  var Ls = moonRev(M + w);                      // mean longitude
  // eccentric anomaly, then true longitude (first-order series is
  // plenty: the Sun's own position is only a perturbation argument)
  var E = M + e / MOON_R * moonSin(M) * (1 + e * moonCos(M));
  var x = Math.cos(E * MOON_R) - e, y = Math.sqrt(1 - e * e) * Math.sin(E * MOON_R);
  var v = Math.atan2(y, x) / MOON_R;
  var lon = moonRev(v + w);
  return { M: M, Ls: Ls, lon: lon };
}

/* Geocentric lunar position for a JS Date.
 * Returns J2000-style equatorial RA (hours) / Dec (degrees) for the
 * instant given, the Earth–Moon distance in km, the illuminated
 * fraction (0..1), whether the Moon is waxing, the elongation in
 * degrees, and the ecliptic longitude/latitude. */
function moonPosition(date) {
  var d = moonDayNumber(date);
  var sun = moonSun(d);
  var Ms = sun.M;

  /* lunar orbital elements */
  var N = moonRev(125.1228 - 0.0529538083 * d);  // longitude of ascending node
  var incl = 5.1454;                             // inclination
  var w = moonRev(318.0634 + 0.1643573223 * d);  // argument of perigee
  var a = 60.2666;                               // semi-major axis (Earth radii)
  var e = 0.054900;
  var M = moonRev(115.3654 + 13.0649929509 * d); // mean anomaly

  /* eccentric anomaly by iteration (e is small but not negligible) */
  var E = M + e / MOON_R * moonSin(M) * (1 + e * moonCos(M));
  for (var k = 0; k < 3; k++) {
    E = E - (E - e / MOON_R * moonSin(E) - M) / (1 - e * moonCos(E));
  }
  var xv = a * (moonCos(E) - e);
  var yv = a * (Math.sqrt(1 - e * e) * moonSin(E));
  var v = Math.atan2(yv, xv) / MOON_R;           // true anomaly
  var r = Math.sqrt(xv * xv + yv * yv);          // distance, Earth radii

  /* position in the ecliptic plane */
  var u = v + w;
  var xh = r * (moonCos(N) * moonCos(u) - moonSin(N) * moonSin(u) * moonCos(incl));
  var yh = r * (moonSin(N) * moonCos(u) + moonCos(N) * moonSin(u) * moonCos(incl));
  var zh = r * (moonSin(u) * moonSin(incl));
  var lon = moonRev(Math.atan2(yh, xh) / MOON_R);
  var lat = Math.atan2(zh, Math.sqrt(xh * xh + yh * yh)) / MOON_R;

  /* the principal perturbations — the Moon is the one body in this
   * sky whose path is visibly bent by the Sun, and these terms are
   * most of that bend (the largest single one swings longitude by
   * over a degree) */
  var Lm = moonRev(N + w + M);                   // Moon's mean longitude
  var D = moonRev(Lm - sun.Ls);                  // mean elongation
  var F = moonRev(Lm - N);                       // argument of latitude
  lon += -1.274 * moonSin(M - 2 * D) + 0.658 * moonSin(2 * D) - 0.186 * moonSin(Ms)
       - 0.059 * moonSin(2 * M - 2 * D) - 0.057 * moonSin(M - 2 * D + Ms)
       + 0.053 * moonSin(M + 2 * D) + 0.046 * moonSin(2 * D - Ms)
       + 0.041 * moonSin(M - Ms) - 0.035 * moonSin(D) - 0.031 * moonSin(M + Ms)
       - 0.015 * moonSin(2 * F - 2 * D) + 0.011 * moonSin(M - 4 * D);
  lat += -0.173 * moonSin(F - 2 * D) - 0.055 * moonSin(M - F - 2 * D)
       - 0.046 * moonSin(M + F - 2 * D) + 0.033 * moonSin(F + 2 * D)
       + 0.017 * moonSin(2 * M + F);
  r += -0.58 * moonCos(M - 2 * D) - 0.46 * moonCos(2 * D);

  var distKm = r * 6378.14;

  /* ecliptic -> equatorial */
  var ecl = 23.4393 - 3.563e-7 * d;
  var xe = moonCos(lon) * moonCos(lat), ye = moonSin(lon) * moonCos(lat), ze = moonSin(lat);
  var yq = ye * moonCos(ecl) - ze * moonSin(ecl), zq = ye * moonSin(ecl) + ze * moonCos(ecl);
  var ra = moonRev(Math.atan2(yq, xe) / MOON_R) / 15;
  var dec = Math.atan2(zq, Math.sqrt(xe * xe + yq * yq)) / MOON_R;

  /* phase geometry: elongation = angle between the Moon's and the
   * Sun's directions from Earth; illumination follows from it, and
   * waxing is which side of the Sun the Moon has reached */
  var xs = moonCos(sun.lon), ys = moonSin(sun.lon);
  var elong = Math.acos(Math.max(-1, Math.min(1, xe * xs + ye * ys))) / MOON_R;
  var illum = (1 - Math.cos(elong * MOON_R)) / 2;
  var waxing = moonRev(lon - sun.lon) < 180;

  /* the Sun's own equatorial place (ecliptic latitude zero) — the
   * game needs its direction to light the disc truthfully */
  var sunRa = moonRev(Math.atan2(moonSin(sun.lon) * moonCos(ecl), moonCos(sun.lon)) / MOON_R) / 15;
  var sunDec = Math.asin(moonSin(sun.lon) * moonSin(ecl)) / MOON_R;

  return {
    ra: ra, dec: dec, distKm: distKm, illum: illum, waxing: waxing,
    elong: elong, eclLon: lon, eclLat: lat,
    sunRa: sunRa, sunDec: sunDec, sunEclLon: sun.lon
  };
}

var MOON = { position: moonPosition, dayNumber: moonDayNumber };
if (typeof window !== 'undefined') window.MOON = MOON;
if (typeof module !== 'undefined' && module.exports) module.exports = MOON;
