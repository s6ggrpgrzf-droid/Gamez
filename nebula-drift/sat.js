/* SAT — the space station from its two-line elements.
 *
 * Deliberately not SGP4. For pass *timing* over one observer, a Kepler
 * ellipse with J2 secular precession (nodal regression, apsidal
 * advance, mean-motion correction) is good to well under a minute for
 * days either side of the epoch, and the whole propagator fits in one
 * readable file. Elements older than ~10 days are flagged by the
 * caller, never silently trusted: the game refreshes them whenever it
 * can reach the worker, and falls back to its bundled set.
 *
 * Frames, stated once because everything else depends on them:
 * positionAt returns ECI kilometres (x toward vernal equinox, z toward
 * the north pole). eciToRaDec turns that into RA hours / Dec degrees,
 * and the game's own SKY.altAz turns RA/Dec into the horizon frame the
 * renderer lives in. Nothing here knows about the screen. */

var SAT = (function () {
  var MU = 398600.4418, RE = 6378.137, J2 = 1.08262668e-3;
  var D2R = Math.PI / 180;

  function cksum(line) {
    var s = 0;
    for (var i = 0; i < 68 && i < line.length; i++) {
      var ch = line.charAt(i);
      if (ch >= '0' && ch <= '9') s += ch.charCodeAt(0) - 48;
      else if (ch === '-') s += 1;
    }
    return s % 10;
  }
  function num(s, a, b) { var v = parseFloat(s.substring(a, b)); return isNaN(v) ? 0 : v; }

  /* Parse a 3-line (or 2-line) TLE. Returns null on garbage; checksum
   * mismatches are reported, not fatal — a slightly damaged element
   * set still predicts tonight better than none at all. */
  function parseTLE(text) {
    var lines = String(text || '').split(/\r?\n/).filter(function (l) { return l.trim().length > 0; });
    var l1, l2, name = 'ISS';
    if (lines.length >= 3 && lines[0].charAt(0) !== '1') { name = lines[0].trim(); l1 = lines[1]; l2 = lines[2]; }
    else if (lines.length >= 2) { l1 = lines[0]; l2 = lines[1]; }
    else return null;
    if (l1.charAt(0) !== '1' || l2.charAt(0) !== '2') return null;
    var yr = num(l1, 18, 20), day = num(l1, 20, 32);
    var fullYr = yr < 57 ? 2000 + yr : 1900 + yr;
    var epochMs = Date.UTC(fullYr, 0, 1) + (day - 1) * 86400000;
    var eccRaw = l2.substring(26, 33).trim();
    var el = {
      name: name,
      epochMs: epochMs,
      incl: num(l2, 8, 16) * D2R,
      raan: num(l2, 17, 25) * D2R,
      ecc: parseFloat('0.' + eccRaw) || 0,
      argp: num(l2, 34, 42) * D2R,
      ma: num(l2, 43, 51) * D2R,
      mm: num(l2, 52, 63),
      cksumOk: (l1.length > 68 ? parseInt(l1.charAt(68), 10) : -1) === cksum(l1) &&
        (l2.length > 68 ? parseInt(l2.charAt(68), 10) : -1) === cksum(l2)
    };
    if (!(el.mm > 0) || !(el.incl >= 0)) return null;
    return el;
  }

  /* ECI position (km) at a date. J2 secular rates, Kepler solved by
   * Newton iteration — eight rounds is overkill for e < 0.01, which
   * is the point: it cannot fail to converge for station-like sets. */
  function positionAt(el, dateMs) {
    var dt = (dateMs - el.epochMs) / 86400000;   /* days since epoch */
    var n0 = el.mm * 2 * Math.PI;                /* rad/day */
    var a = Math.pow(MU / Math.pow(n0 / 86400, 2), 1 / 3);
    var p = a * (1 - el.ecc * el.ecc);
    var k = 1.5 * J2 * Math.pow(RE / p, 2);
    var ci = Math.cos(el.incl);
    var raan = el.raan - k * n0 * ci * dt;
    var argp = el.argp + (k / 2) * n0 * (5 * ci * ci - 1) * dt;
    var M = el.ma + (n0 + (k / 2) * n0 * Math.sqrt(1 - el.ecc * el.ecc) * (3 * ci * ci - 1)) * dt;
    M = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    var E = M;
    for (var i = 0; i < 8; i++) E = E - (E - el.ecc * Math.sin(E) - M) / (1 - el.ecc * Math.cos(E));
    var xp = a * (Math.cos(E) - el.ecc), yp = a * Math.sqrt(1 - el.ecc * el.ecc) * Math.sin(E);
    var cO = Math.cos(raan), sO = Math.sin(raan), cw = Math.cos(argp), sw = Math.sin(argp);
    var si = Math.sin(el.incl), cI = Math.cos(el.incl);
    var X = (cO * cw - sO * sw * cI) * xp + (-cO * sw - sO * cw * cI) * yp;
    var Y = (sO * cw + cO * sw * cI) * xp + (-sO * sw + cO * cw * cI) * yp;
    var Z = (sw * si) * xp + (cw * si) * yp;
    return { x: X, y: Y, z: Z, r: Math.sqrt(X * X + Y * Y + Z * Z) };
  }

  function eciToRaDec(p) {
    var r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    var ra = Math.atan2(p.y, p.x) * 180 / Math.PI / 15;
    if (ra < 0) ra += 24;
    return { raH: ra, decDeg: Math.asin(p.z / r) * 180 / Math.PI, rKm: r };
  }

  /* Sunlit, by the cylinder test: lit unless the station is behind the
   * Earth as seen from the Sun. Penumbra ignored — a few seconds of
   * dusk either way, invisible against a whole pass. */
  function sunlit(p, sunRaH, sunDecDeg) {
    var sd = sunDecDeg * D2R, sr = sunRaH * 15 * D2R;
    var sx = Math.cos(sd) * Math.cos(sr), sy = Math.cos(sd) * Math.sin(sr), sz = Math.sin(sd);
    var r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    var s = (p.x * sx + p.y * sy + p.z * sz) / r;
    if (s >= 0) return true;
    return r * Math.sqrt(1 - s * s) >= RE;
  }

  /* The observer's ECI position (km, spherical Earth — the same
   * approximation the game's sky math already uses). */
  function obsEci(latDeg, lonDeg, gmstDeg) {
    var la = latDeg * D2R, th = (gmstDeg + lonDeg) * D2R;
    return {
      x: RE * Math.cos(la) * Math.cos(th),
      y: RE * Math.cos(la) * Math.sin(th),
      z: RE * Math.sin(la)
    };
  }

  /* Topocentric RA/Dec: the station is 420 km up, not infinitely far,
   * so the observer's offset from Earth's centre moves it by up to
   * ~70 degrees from its geocentric place. The game's star math
   * assumes infinite distance; for the station that assumption is
   * exactly wrong, and this is the correction. */
  function topoRaDec(p, latDeg, lonDeg, gmstDeg) {
    var o = obsEci(latDeg, lonDeg, gmstDeg);
    return eciToRaDec({ x: p.x - o.x, y: p.y - o.y, z: p.z - o.z });
  }

  /* Passes over one observer in [fromMs, toMs]. Callbacks keep this
   * file free of the game's sky math: lstAt(ms) -> LST degrees,
   * gmstAt(ms) -> GMST degrees, lat/lon on the options,
   * altAzOf(raH, decDeg, lst) -> {alt, az}, sunAt(ms) -> {raH, decDeg}
   * for the Sun, sunAltAt(ms) -> observer Sun altitude degrees.
   * A pass counts when the station is above 10 degrees, sunlit, and
   * the observer is in civil-or-deeper dark. Culmination is refined
   * parabolically from the three samples around the peak. */
  function scanPasses(el, fromMs, toMs, o) {
    var STEP = 20000, passes = [], cur = null;
    function sample(t) {
      var p = positionAt(el, t);
      var rd = topoRaDec(p, o.lat, o.lon, o.gmstAt(t));
      var aa = o.altAzOf(rd.raH, rd.decDeg, o.lstAt(t));
      var sun = o.sunAt(t);
      var lit = sunlit(p, sun.raH, sun.decDeg);
      var dark = o.sunAltAt(t) < -6;
      return { t: t, alt: aa.alt, az: aa.az, raH: rd.raH, decDeg: rd.decDeg, vis: aa.alt > 10 && lit && dark };
    }
    var prev = sample(fromMs);
    if (prev.vis) cur = { samples: [prev] };
    for (var t = fromMs + STEP; t <= toMs; t += STEP) {
      var s = sample(t);
      if (s.vis) {
        if (!cur) cur = { samples: [] };
        cur.samples.push(s);
      } else if (cur) {
        cur.samples.push(s);
        passes.push(finishPass(cur));
        cur = null;
      }
      prev = s;
    }
    if (cur) { cur.samples.push(sample(toMs)); passes.push(finishPass(cur)); }
    function finishPass(c) {
      var sm = c.samples, best = sm[0], bi = 0;
      for (var i = 1; i < sm.length; i++) if (sm[i].alt > best.alt) { best = sm[i]; bi = i; }
      var culmMs = best.t, maxAlt = best.alt;
      if (bi > 0 && bi < sm.length - 1) {
        var y0 = sm[bi - 1].alt, y1 = sm[bi].alt, y2 = sm[bi + 1].alt;
        var denom = (y0 - 2 * y1 + y2);
        if (Math.abs(denom) > 1e-9) {
          var off = 0.5 * (y0 - y2) / denom;
          if (Math.abs(off) <= 1) { culmMs = best.t + off * STEP; maxAlt = y1 - 0.25 * (y0 - y2) * off; }
        }
      }
      return {
        startMs: sm[0].t, endMs: sm[sm.length - 1].t, culmMs: culmMs, maxAlt: maxAlt,
        culmRaH: best.raH, culmDecDeg: best.decDeg,
        durMin: (sm[sm.length - 1].t - sm[0].t) / 60000,
        /* Peak sample on a boundary means the true peak fell outside
         * the window (a pass already underway when darkness began, or
         * still rising when the window closed). The visible part is
         * real; the caller must not quote culmMs as the true peak. */
        truncated: bi === 0 || bi === sm.length - 1
      };
    }
    return passes.filter(function (pp) { return pp.durMin >= 1 && pp.maxAlt >= 10; });
  }

  return {
    MU: MU, RE: RE, cksum: cksum, parseTLE: parseTLE, positionAt: positionAt,
    eciToRaDec: eciToRaDec, obsEci: obsEci, topoRaDec: topoRaDec,
    sunlit: sunlit, scanPasses: scanPasses
  };
})();

if (typeof window !== 'undefined') window.SAT = SAT;
if (typeof module !== 'undefined' && module.exports) module.exports = SAT;
