/* Nebula Drift — sky.js
 * Pure sky data + astronomy math. No DOM, no canvas. Node-testable.
 *
 * The bright-star catalogue is real: J2000 right ascension (hours),
 * declination (degrees), visual magnitude, and spectral class for the
 * stars that make up the recognisable figures. Positions are computed
 * for "tonight" — the viewer's own date at 22:00 local — over a
 * city-level home location (Edmond, Oklahoma), so the arrangement in
 * the game is the arrangement actually up that night.
 *
 * Nebula anchors are real deep-sky objects at real coordinates; their
 * palettes follow the actual emission physics of each object
 * (hydrogen-alpha rose, doubly-ionised oxygen teal, sulfur gold).
 */
'use strict';

/* Home sky: city-level coordinates (Edmond, OK). Not a street address —
 * just the patch of Earth the sky is computed for. */
var HOME = { lat: 35.65, lon: -97.47, name: 'Edmond' };

/* [name, raHours, decDeg, mag, spectralClass] */
var STARS = [
  /* Cygnus — high in the west on an October night */
  ['Deneb', 20.690, 45.28, 1.25, 'A2'], ['Sadr', 20.370, 40.26, 2.20, 'F8'],
  ['Albireo', 19.512, 27.96, 3.18, 'K3'], ['Delta Cygni', 19.749, 45.13, 2.86, 'B9'],
  ['Gienah Cygni', 20.770, 33.79, 2.48, 'K0'],
  /* Lyra */
  ['Vega', 18.616, 38.78, 0.03, 'A0'], ['Sheliak', 18.834, 33.36, 3.52, 'B7'],
  ['Sulafat', 18.982, 32.69, 3.25, 'B9'], ['Double Double', 18.735, 39.67, 4.30, 'A3'],
  /* Aquila */
  ['Altair', 19.846, 8.87, 0.76, 'A7'], ['Tarazed', 19.770, 10.61, 2.72, 'K3'],
  ['Alshain', 19.922, 6.41, 3.71, 'G8'],
  /* Cassiopeia — the W, high in the north-east */
  ['Caph', 0.153, 59.15, 2.27, 'F2'], ['Schedar', 0.675, 56.54, 2.24, 'K0'],
  ['Gamma Cassiopeiae', 0.945, 60.72, 2.47, 'B0'], ['Ruchbah', 1.430, 60.24, 2.68, 'A5'],
  ['Segin', 1.906, 63.67, 3.38, 'B3'],
  /* Pegasus — the Great Square, high in the south */
  ['Markab', 23.079, 15.21, 2.49, 'B9'], ['Scheat', 23.063, 28.08, 2.42, 'M2'],
  ['Algenib', 0.221, 15.18, 2.84, 'B2'], ['Enif', 21.736, 9.88, 2.39, 'K2'],
  ['Matar', 22.717, 30.22, 2.94, 'G2'], ['Homam', 22.683, 10.83, 3.41, 'B8'],
  ['Baham', 22.174, 6.20, 3.53, 'A2'],
  /* Andromeda */
  ['Alpheratz', 0.139, 29.09, 2.07, 'B8'], ['Mirach', 1.162, 35.62, 2.06, 'M0'],
  ['Almach', 2.065, 42.33, 2.26, 'K3'], ['Delta Andromedae', 0.657, 30.86, 3.27, 'K3'],
  /* Perseus — climbing in the north-east */
  ['Mirfak', 3.405, 49.86, 1.79, 'F5'], ['Gamma Persei', 3.079, 53.51, 2.93, 'G8'],
  ['Delta Persei', 3.715, 47.79, 3.01, 'B5'], ['Algol', 3.136, 40.96, 2.09, 'B8'],
  ['Epsilon Persei', 3.964, 40.01, 2.89, 'B0'],
  /* Cepheus — the little house, near the pole */
  ['Alderamin', 21.309, 62.59, 2.44, 'A7'], ['Alfirk', 21.477, 70.56, 3.23, 'B1'],
  ['Gamma Cephei', 23.655, 77.63, 3.21, 'K1'], ['Zeta Cephei', 22.181, 58.20, 3.35, 'K1'],
  ['Delta Cephei', 22.486, 58.41, 3.48, 'F5'],
  /* Ursa Minor */
  ['Polaris', 2.530, 89.26, 1.98, 'F7'], ['Kochab', 14.845, 74.16, 2.08, 'K4'],
  ['Pherkad', 15.345, 71.83, 3.00, 'A2'], ['Yildun', 17.536, 86.59, 4.36, 'A1'],
  /* Ursa Major — skimming the northern horizon in October */
  ['Dubhe', 11.062, 61.75, 1.79, 'K0'], ['Merak', 11.031, 56.38, 2.37, 'A1'],
  ['Phecda', 11.897, 53.69, 2.44, 'A0'], ['Megrez', 12.257, 57.03, 3.31, 'A3'],
  ['Alioth', 12.901, 55.96, 1.77, 'A1'], ['Mizar', 13.399, 54.93, 2.27, 'A2'],
  ['Alkaid', 13.792, 49.31, 1.86, 'B3'],
  /* Draco — winding between the Bears */
  ['Eltanin', 17.943, 51.49, 2.23, 'K5'], ['Rastaban', 17.507, 52.30, 2.79, 'G2'],
  ['Thuban', 14.074, 64.38, 3.65, 'A0'],
  /* Aries — rising in the east (Starlight's figure) */
  ['Hamal', 2.119, 23.46, 2.00, 'K2'], ['Sheratan', 1.911, 20.81, 2.64, 'A5'],
  /* Taurus — rising late in the east */
  ['Aldebaran', 4.599, 16.51, 0.86, 'K5'], ['Elnath', 5.438, 28.61, 1.68, 'B7'],
  ['Alcyone', 3.784, 24.12, 2.87, 'B7'],
  /* Auriga — climbing in the north-east */
  ['Capella', 5.278, 45.99, 0.08, 'G8'], ['Menkalinan', 5.992, 44.95, 1.90, 'A2'],
  /* Aquarius */
  ['Sadalsuud', 21.526, -5.57, 2.90, 'G0'], ['Sadalmelik', 22.096, -0.32, 2.96, 'G2'],
  ['Skat', 23.901, -15.58, 3.27, 'A3'],
  /* Piscis Austrinus — the southern fish, Fomalhaut alone in the south */
  ['Fomalhaut', 22.961, -29.62, 1.16, 'A3'],
  /* Pisces */
  ['Alrescha', 2.034, 2.76, 3.82, 'A2'],
  /* Capricornus — sinking in the south-west */
  ['Deneb Algedi', 21.783, -16.13, 2.85, 'A5'], ['Dabih', 20.350, -14.78, 3.05, 'K0'],
  /* Ophiuchus + Hercules — the west, going down */
  ['Rasalhague', 17.560, 12.56, 2.07, 'A5'], ['Cebalrai', 17.724, 4.57, 2.77, 'K2'],
  ['Sabik', 17.173, -15.72, 2.43, 'A2'], ['Kornephoros', 16.499, 21.49, 2.77, 'G7'],
  ['Rasalgethi', 17.244, 14.39, 3.40, 'M5'], ['Zeta Herculis', 16.688, 31.60, 2.81, 'F9'],
  /* Orion — the Hunter, climbing the winter east (added 2026-10-23;
   * Betelgeuse is a semiregular variable, ~0.0–1.3 — 0.42 is its mean) */
  ['Betelgeuse', 5.920, 7.41, 0.42, 'M2'], ['Rigel', 5.242, -8.20, 0.18, 'B8'],
  ['Bellatrix', 5.419, 6.35, 1.64, 'B2'], ['Alnilam', 5.604, -1.20, 1.69, 'B0'],
  ['Alnitak', 5.679, -1.94, 1.88, 'O9'], ['Mintaka', 5.533, -0.30, 2.20, 'B0'],
  ['Saiph', 5.796, -9.67, 2.07, 'B0'], ['Meissa', 5.586, 9.93, 3.33, 'O8'],
  /* Canis Major — the Hunter's dog, low in the winter south */
  ['Sirius', 6.753, -16.71, -1.46, 'A1'], ['Mirzam', 6.378, -17.96, 1.98, 'B1'],
  ['Adhara', 6.977, -28.97, 1.50, 'B2'], ['Wezen', 7.140, -26.39, 1.83, 'F8'],
  ['Aludra', 7.402, -29.30, 2.45, 'B5']
];

/* Deep-sky anchors: [name, raHours, decDeg, kind, palette, size]
 * kind: 'emission' | 'remnant' | 'planetary' | 'galaxy' | 'cluster' | 'reflection'
 * palette keys map to physical emission colours in game.js.            */
var NEBULAE = [
  ['North America Nebula', 20.976, 44.53, 'emission', 'rose', 3.2],
  ['Pelican Nebula', 20.843, 44.33, 'emission', 'rose', 2.0],
  ['Crescent Nebula', 20.200, 38.35, 'emission', 'goldrose', 1.1],
  ['Cocoon Nebula', 21.893, 47.27, 'emission', 'rose', 0.8],
  ['Veil Nebula', 20.855, 30.70, 'remnant', 'tealrose', 2.2],
  ['Ring Nebula', 18.893, 33.03, 'planetary', 'teal', 0.55],
  ['Dumbbell Nebula', 19.993, 22.72, 'planetary', 'tealgold', 0.8],
  ['Andromeda Galaxy', 0.712, 41.27, 'galaxy', 'gold', 2.4],
  ['Triangulum Galaxy', 1.564, 30.66, 'galaxy', 'pearl', 1.2],
  ['Heart Nebula', 2.550, 61.45, 'emission', 'rose', 2.2],
  ['California Nebula', 4.050, 36.37, 'emission', 'rose', 1.8],
  ['Pleiades', 3.783, 24.12, 'reflection', 'blue', 1.3],
  ['Double Cluster', 2.320, 57.13, 'cluster', 'pearl', 0.9],
  ['Great Hercules Cluster', 16.695, 36.46, 'cluster', 'pearl', 0.7]
];

/* Real distances in light-years (catalogue values, rounded). These are
 * what make a constellation an illusion: the figure's stars are at
 * wildly different depths, and only line up from here. */
var DISTANCES = {
  'Deneb': 2615, 'Sadr': 1830, 'Albireo': 434, 'Delta Cygni': 165, 'Gienah Cygni': 73,
  'Vega': 25, 'Sheliak': 960, 'Sulafat': 634, 'Double Double': 162,
  'Altair': 17, 'Tarazed': 395, 'Alshain': 45,
  'Caph': 55, 'Schedar': 228, 'Gamma Cassiopeiae': 613, 'Ruchbah': 99, 'Segin': 442,
  'Markab': 133, 'Scheat': 196, 'Algenib': 391, 'Enif': 670, 'Matar': 167, 'Homam': 204, 'Baham': 93,
  'Alpheratz': 97, 'Mirach': 199, 'Almach': 355, 'Delta Andromedae': 101,
  'Mirfak': 510, 'Gamma Persei': 256, 'Delta Persei': 528, 'Algol': 93, 'Epsilon Persei': 540,
  'Alderamin': 49, 'Alfirk': 690, 'Gamma Cephei': 45, 'Zeta Cephei': 836, 'Delta Cephei': 887,
  'Polaris': 433, 'Kochab': 131, 'Pherkad': 486, 'Yildun': 183,
  'Dubhe': 123, 'Merak': 79, 'Phecda': 84, 'Megrez': 81, 'Alioth': 83, 'Mizar': 83, 'Alkaid': 104,
  'Eltanin': 148, 'Rastaban': 380, 'Thuban': 303,
  'Hamal': 66, 'Sheratan': 60,
  'Aldebaran': 65, 'Elnath': 134, 'Alcyone': 444,
  'Capella': 43, 'Menkalinan': 82,
  'Sadalsuud': 540, 'Sadalmelik': 520, 'Skat': 160,
  'Fomalhaut': 25, 'Alrescha': 151, 'Deneb Algedi': 39, 'Dabih': 344,
  'Rasalhague': 49, 'Cebalrai': 82, 'Sabik': 88,
  'Kornephoros': 148, 'Rasalgethi': 360, 'Zeta Herculis': 35,
  'Betelgeuse': 643, 'Rigel': 773, 'Bellatrix': 243, 'Alnilam': 1342,
  'Alnitak': 817, 'Mintaka': 916, 'Saiph': 721, 'Meissa': 1055,
  'Sirius': 9, 'Mirzam': 499, 'Adhara': 431, 'Wezen': 1791, 'Aludra': 3196
};

/* The figures: stick lines over catalogue stars, plus the one line of
 * story the sky is allowed to whisper about each. */
var FIGURES = [
  { name: 'Cygnus', story: 'The Swan, flying down the river of the Milky Way.',
    lines: [['Deneb', 'Sadr'], ['Sadr', 'Albireo'], ['Sadr', 'Gienah Cygni'], ['Sadr', 'Delta Cygni']] },
  { name: 'Lyra', story: 'Orpheus’s lyre — its music could charm stones into listening.',
    lines: [['Vega', 'Double Double'], ['Vega', 'Sheliak'], ['Sheliak', 'Sulafat'], ['Sulafat', 'Double Double']] },
  { name: 'Aquila', story: 'The Eagle that carried the thunderbolts of Zeus.',
    lines: [['Tarazed', 'Altair'], ['Altair', 'Alshain']] },
  { name: 'Cassiopeia', story: 'The vain queen, set circling the pole in her chair forever.',
    lines: [['Caph', 'Schedar'], ['Schedar', 'Gamma Cassiopeiae'], ['Gamma Cassiopeiae', 'Ruchbah'], ['Ruchbah', 'Segin']] },
  { name: 'Pegasus', story: 'The winged horse — this is his Great Square, high in the south.',
    lines: [['Markab', 'Scheat'], ['Scheat', 'Alpheratz'], ['Alpheratz', 'Algenib'], ['Algenib', 'Markab'],
            ['Scheat', 'Matar'], ['Markab', 'Homam'], ['Homam', 'Baham'], ['Baham', 'Enif']] },
  { name: 'Andromeda', story: 'The chained princess, rescued from the sea-monster by Perseus.',
    lines: [['Alpheratz', 'Delta Andromedae'], ['Delta Andromedae', 'Mirach'], ['Mirach', 'Almach']] },
  { name: 'Perseus', story: 'The hero — Algol is the Gorgon’s eye, and it winks.',
    lines: [['Gamma Persei', 'Mirfak'], ['Mirfak', 'Delta Persei'], ['Mirfak', 'Epsilon Persei'], ['Epsilon Persei', 'Algol']] },
  { name: 'Cepheus', story: 'The king. A whole royal family is set in this corner of sky.',
    lines: [['Alderamin', 'Alfirk'], ['Alfirk', 'Gamma Cephei'], ['Gamma Cephei', 'Delta Cephei'],
            ['Delta Cephei', 'Zeta Cephei'], ['Zeta Cephei', 'Alderamin']] },
  { name: 'Ursa Minor', story: 'The Little Bear — the pole star burns at his tail’s end.',
    lines: [['Polaris', 'Yildun'], ['Yildun', 'Kochab'], ['Kochab', 'Pherkad']] },
  { name: 'Ursa Major', story: 'The Great Bear. Five of these stars travel together; Dubhe and Alkaid are strangers passing through.',
    lines: [['Dubhe', 'Merak'], ['Merak', 'Phecda'], ['Phecda', 'Megrez'], ['Megrez', 'Dubhe'],
            ['Megrez', 'Alioth'], ['Alioth', 'Mizar'], ['Mizar', 'Alkaid']] },
  { name: 'Draco', story: 'The dragon that guarded the golden apples of the Hesperides.',
    lines: [['Eltanin', 'Rastaban'], ['Rastaban', 'Thuban']] },
  { name: 'Aries', story: 'The golden-fleeced ram, rising in the east.',
    lines: [['Hamal', 'Sheratan']] },
  { name: 'Taurus', story: 'The Bull, carrying Europa across the sea on his back.',
    lines: [['Aldebaran', 'Elnath'], ['Aldebaran', 'Alcyone']] },
  { name: 'Auriga', story: 'The Charioteer, a goat — Capella — slung over his shoulder.',
    lines: [['Capella', 'Menkalinan'], ['Capella', 'Elnath']] },
  { name: 'Aquarius', story: 'The Water Bearer, pouring his stream south toward the Fish.',
    lines: [['Sadalsuud', 'Sadalmelik'], ['Sadalmelik', 'Skat']] },
  { name: 'Hercules', story: 'The strongman, kneeling forever in the middle of his labours.',
    lines: [['Kornephoros', 'Zeta Herculis'], ['Zeta Herculis', 'Rasalgethi']] },
  { name: 'Ophiuchus', story: 'The Serpent Bearer, the healer who learned to wake the dead.',
    lines: [['Rasalhague', 'Cebalrai'], ['Rasalhague', 'Sabik']] },
  { name: 'Orion', story: 'The Hunter — the red star on his shoulder is Betelgeuse, swollen and near its end.',
    lines: [['Betelgeuse', 'Alnitak'], ['Alnitak', 'Alnilam'], ['Alnilam', 'Mintaka'],
            ['Mintaka', 'Bellatrix'], ['Betelgeuse', 'Bellatrix'], ['Alnitak', 'Saiph'],
            ['Mintaka', 'Rigel'], ['Saiph', 'Rigel'], ['Bellatrix', 'Meissa']] },
  { name: 'Canis Major', story: 'The Hunter’s dog — Sirius, the brightest star in the sky, sits just nine light-years away.',
    lines: [['Mirzam', 'Sirius'], ['Sirius', 'Adhara'], ['Adhara', 'Wezen'],
            ['Wezen', 'Aludra'], ['Sirius', 'Wezen']] }
];

/* ---------- seeded PRNG (mulberry32) — reproducible fields ---------- */
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- time / sidereal math ---------- */
function jdFromDate(date) { return date.getTime() / 86400000 + 2440587.5; }

function gmstDeg(jd) {
  var d = jd - 2451545.0;
  var g = (280.46061837 + 360.98564736629 * d) % 360;
  return g < 0 ? g + 360 : g;
}
function lstDeg(jd, lonDeg) {
  var l = (gmstDeg(jd) + lonDeg) % 360;
  return l < 0 ? l + 360 : l;
}

/* "Tonight" = the viewer's current calendar date at 22:00 local time. */
function tonightDate(now) {
  var t = new Date(now.getTime());
  t.setHours(22, 0, 0, 0);
  return t;
}

/* RA/Dec + observer lat/LST -> {alt, az} in degrees. Az from north, eastward. */
function altAz(raH, decDeg, latDeg, lst) {
  var ha = ((lst - raH * 15 + 540) % 360) - 180;
  var har = ha * Math.PI / 180, dec = decDeg * Math.PI / 180, lat = latDeg * Math.PI / 180;
  var alt = Math.asin(Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(har));
  var az = Math.atan2(Math.sin(har), Math.cos(har) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat));
  return { alt: alt * 180 / Math.PI, az: (az * 180 / Math.PI + 180) % 360 };
}

/* Alt/az -> unit direction in world space: x = east, y = up, z = -north. */
function dirFromAltAz(altDeg, azDeg) {
  var alt = altDeg * Math.PI / 180, az = azDeg * Math.PI / 180;
  var ca = Math.cos(alt);
  return [ca * Math.sin(az), Math.sin(alt), -ca * Math.cos(az)];
}
function dirFromRaDec(raH, decDeg, latDeg, lst) {
  var a = altAz(raH, decDeg, latDeg, lst);
  return dirFromAltAz(a.alt, a.az);
}

/* ---------- star colour from spectral class (real temperatures) ---------- */
var SPEC_COLORS = {
  O: [174, 200, 255], B: [186, 208, 255], A: [232, 238, 255], F: [255, 246, 224],
  G: [255, 238, 196], K: [255, 205, 148], M: [255, 166, 116]
};
function spectralColor(spec) {
  var c = SPEC_COLORS[(spec || 'A').charAt(0)] || SPEC_COLORS.A;
  return [c[0], c[1], c[2]];
}
/* Field-star temperature mix, roughly the real sky's proportions. */
var FIELD_SPEC_MIX = [
  ['B', 0.06], ['A', 0.16], ['F', 0.30], ['G', 0.52], ['K', 0.78], ['M', 1.0]
];
function fieldSpec(r) {
  for (var i = 0; i < FIELD_SPEC_MIX.length; i++) if (r <= FIELD_SPEC_MIX[i][1]) return FIELD_SPEC_MIX[i][0];
  return 'M';
}

/* Full tonight arrangement: every catalogue star with its computed
 * direction for tonight 22:00 local at the home location. */
function tonightSky(now, home) {
  home = home || HOME;
  var t = tonightDate(now || new Date());
  var lst = lstDeg(jdFromDate(t), home.lon);
  var stars = STARS.map(function (s) {
    var a = altAz(s[1], s[2], home.lat, lst);
    return {
      name: s[0], ra: s[1], dec: s[2], mag: s[3], spec: s[4],
      dist: DISTANCES[s[0]] || null,
      alt: a.alt, az: a.az, dir: dirFromAltAz(a.alt, a.az), color: spectralColor(s[4])
    };
  });
  var nebs = NEBULAE.map(function (n) {
    var a = altAz(n[1], n[2], home.lat, lst);
    return {
      name: n[0], ra: n[1], dec: n[2], kind: n[3], palette: n[4], size: n[5],
      alt: a.alt, az: a.az, dir: dirFromAltAz(a.alt, a.az)
    };
  });
  return { date: t, lst: lst, stars: stars, nebulae: nebs };
}

var SKY = {
  HOME: HOME, STARS: STARS, NEBULAE: NEBULAE, DISTANCES: DISTANCES, FIGURES: FIGURES,
  mulberry32: mulberry32, jdFromDate: jdFromDate, gmstDeg: gmstDeg, lstDeg: lstDeg,
  tonightDate: tonightDate, altAz: altAz, dirFromAltAz: dirFromAltAz, dirFromRaDec: dirFromRaDec,
  spectralColor: spectralColor, fieldSpec: fieldSpec, tonightSky: tonightSky
};
if (typeof window !== 'undefined') window.SKY = SKY;
if (typeof module !== 'undefined' && module.exports) module.exports = SKY;
