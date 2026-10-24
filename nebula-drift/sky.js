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
  ['Aludra', 7.402, -29.30, 2.45, 'B5'],
  /* Gemini — the Twins, winter's second pair (added 2026-10-23;
   * Castor's magnitude is the combined light of its A+B pair) */
  ['Castor', 7.577, 31.89, 1.53, 'A2'], ['Pollux', 7.755, 28.03, 1.16, 'K0'],
  ['Alhena', 6.629, 16.40, 1.93, 'A0'], ['Tejat', 6.383, 22.51, 2.87, 'M3'],
  ['Mebsuta', 6.732, 25.13, 3.06, 'G8'], ['Alzirr', 6.755, 12.90, 3.35, 'F5'],
  ['Wasat', 7.335, 21.98, 3.50, 'F0'],
  /* Leo — the Lion, spring's figure (Algieba's magnitude is the
   * combined light of its pair; Eta Leonis has no common proper name) */
  ['Regulus', 10.140, 11.97, 1.36, 'B7'], ['Eta Leonis', 10.122, 16.76, 3.48, 'A0'],
  ['Algieba', 10.333, 19.84, 2.11, 'K0'], ['Adhafera', 10.278, 23.42, 3.43, 'F0'],
  ['Ras Elased', 9.764, 23.77, 2.97, 'G0'], ['Zosma', 11.235, 20.52, 2.56, 'A4'],
  ['Chertan', 11.237, 15.43, 3.33, 'A2'], ['Denebola', 11.818, 14.57, 2.14, 'A3'],
  /* Virgo — the Maiden, spring's second figure (added 2026-10-23;
   * Porrima's magnitude is the combined light of its pair) */
  ['Spica', 13.420, -11.16, 0.98, 'B1'], ['Porrima', 12.694, -1.45, 2.36, 'F0'],
  ['Vindemiatrix', 13.036, 10.96, 2.85, 'G8'], ['Heze', 13.578, -0.60, 3.38, 'A3'],
  ['Zavijava', 11.845, 1.77, 3.59, 'F8'], ['Zaniah', 12.332, -0.67, 3.89, 'A2'],
  /* Scorpius — the Scorpion, summer's low southern arc (Antares is a
   * semiregular variable, ~0.75–1.21; Acrab's magnitude is combined) */
  ['Acrab', 16.091, -19.81, 2.49, 'B0'], ['Dschubba', 16.006, -22.62, 2.29, 'B0'],
  ['Pi Scorpii', 15.981, -26.11, 2.89, 'B1'], ['Sigma Scorpii', 16.353, -25.59, 2.90, 'B1'],
  ['Antares', 16.490, -26.43, 0.91, 'M1'], ['Tau Scorpii', 16.598, -28.22, 2.82, 'B0'],
  ['Wei', 16.836, -34.29, 2.29, 'K2'], ['Mu Scorpii', 16.865, -38.05, 3.00, 'B1'],
  ['Eta Scorpii', 17.203, -43.24, 3.32, 'F3'], ['Sargas', 17.622, -43.00, 1.86, 'F1'],
  ['Girtab', 17.708, -39.03, 2.39, 'B1'], ['Lesath', 17.513, -37.30, 2.70, 'B2'],
  ['Shaula', 17.560, -37.10, 1.62, 'B2'],
  /* Sagittarius — the Archer, drawn as the Teapot (summer, low south) */
  ['Kaus Australis', 18.403, -34.38, 1.85, 'B9'], ['Kaus Media', 18.350, -29.83, 2.72, 'K3'],
  ['Kaus Borealis', 18.466, -25.42, 2.82, 'K1'], ['Alnasl', 18.097, -30.42, 2.98, 'K0'],
  ['Ascella', 19.044, -29.88, 2.60, 'A3'], ['Nunki', 18.921, -26.30, 2.05, 'B2'],
  ['Phi Sagittarii', 18.761, -26.99, 3.17, 'B8'], ['Tau Sagittarii', 19.116, -27.67, 3.32, 'K1'],
  /* Capricornus completed (pass 4, 2026-10-23) — Deneb Algedi and
   * Dabih were already catalogued; these six finish the sea-goat */
  ['Algedi', 20.301, -12.54, 3.58, 'G6'], ['Nashira', 21.668, -16.66, 3.69, 'A7'],
  ['Zeta Capricorni', 21.445, -22.41, 3.77, 'G4'], ['Theta Capricorni', 21.099, -17.23, 4.08, 'A1'],
  ['Psi Capricorni', 20.768, -25.27, 4.13, 'F5'], ['Omega Capricorni', 20.864, -26.92, 4.12, 'K4'],
  /* Pisces completed (pass 4) — Alrescha, the knot, was already
   * catalogued; these ten draw the western fish, the cord, and the
   * northern fish's one bright star, Kullat Nunu */
  ['Kullat Nunu', 1.525, 15.35, 3.62, 'G8'], ['Gamma Piscium', 23.286, 3.28, 3.70, 'G7'],
  ['Omega Piscium', 23.989, 6.86, 4.03, 'F4'], ['Iota Piscium', 23.666, 5.63, 4.13, 'F7'],
  ['Omicron Piscium', 1.757, 9.16, 4.26, 'K0'], ['Epsilon Piscium', 1.049, 7.89, 4.27, 'K0'],
  ['Theta Piscium', 23.466, 6.38, 4.27, 'K1'], ['Delta Piscium', 0.811, 7.59, 4.44, 'K5'],
  ['Fumalsamakah', 23.065, 3.82, 4.48, 'B6'], ['Lambda Piscium', 23.701, 1.78, 4.49, 'A7'],
  /* Piscis Austrinus completed (pass 4) — Fomalhaut was catalogued
   * alone; these six give the southern fish its body and tail */
  ['Epsilon Piscis Austrini', 22.678, -27.04, 4.18, 'B8'], ['Delta Piscis Austrini', 22.933, -32.54, 4.20, 'G8'],
  ['Beta Piscis Austrini', 22.525, -32.35, 4.29, 'A1'], ['Iota Piscis Austrini', 21.749, -33.03, 4.35, 'B9'],
  ['Gamma Piscis Austrini', 22.875, -32.88, 4.46, 'A0'], ['Mu Piscis Austrini', 22.140, -32.99, 4.50, 'A2']
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
  'Sirius': 9, 'Mirzam': 499, 'Adhara': 431, 'Wezen': 1791, 'Aludra': 3196,
  'Castor': 52, 'Pollux': 34, 'Alhena': 105, 'Tejat': 232, 'Mebsuta': 903,
  'Alzirr': 57, 'Wasat': 59,
  'Regulus': 77, 'Eta Leonis': 2131, 'Algieba': 126, 'Adhafera': 260,
  'Ras Elased': 251, 'Zosma': 58, 'Chertan': 178, 'Denebola': 36,
  'Spica': 262, 'Porrima': 39, 'Vindemiatrix': 102, 'Heze': 73,
  'Zavijava': 36, 'Zaniah': 250,
  'Acrab': 530, 'Dschubba': 401, 'Pi Scorpii': 459, 'Sigma Scorpii': 734,
  'Antares': 553, 'Tau Scorpii': 430, 'Wei': 65, 'Mu Scorpii': 821,
  'Eta Scorpii': 72, 'Sargas': 272, 'Girtab': 464, 'Lesath': 518, 'Shaula': 703,
  'Kaus Australis': 143, 'Kaus Media': 306, 'Kaus Borealis': 77, 'Alnasl': 96,
  'Ascella': 89, 'Nunki': 225, 'Phi Sagittarii': 231, 'Tau Sagittarii': 120,
  'Algedi': 109, 'Nashira': 139, 'Zeta Capricorni': 398, 'Theta Capricorni': 158,
  'Psi Capricorni': 48, 'Omega Capricorni': 628,
  'Kullat Nunu': 294, 'Gamma Piscium': 131, 'Omega Piscium': 106, 'Iota Piscium': 45,
  'Omicron Piscium': 258, 'Epsilon Piscium': 190, 'Theta Piscium': 159, 'Delta Piscium': 305,
  'Fumalsamakah': 492, 'Lambda Piscium': 101,
  'Epsilon Piscis Austrini': 744, 'Delta Piscis Austrini': 170, 'Beta Piscis Austrini': 148,
  'Iota Piscis Austrini': 205, 'Gamma Piscis Austrini': 222, 'Mu Piscis Austrini': 130
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
            ['Wezen', 'Aludra'], ['Sirius', 'Wezen']] },
  { name: 'Gemini', story: 'The Twins — golden Pollux stands just thirty-four light-years off; white Castor is six stars bound as one.',
    lines: [['Castor', 'Pollux'], ['Castor', 'Mebsuta'], ['Mebsuta', 'Tejat'],
            ['Tejat', 'Alhena'], ['Pollux', 'Wasat'], ['Wasat', 'Alzirr'],
            ['Mebsuta', 'Wasat']] },
  { name: 'Leo', story: 'The Lion — Regulus, the little king at his heart, spins so fast the star bulges wide.',
    lines: [['Regulus', 'Eta Leonis'], ['Eta Leonis', 'Algieba'], ['Algieba', 'Adhafera'],
            ['Adhafera', 'Ras Elased'], ['Algieba', 'Zosma'], ['Zosma', 'Chertan'],
            ['Chertan', 'Denebola'], ['Zosma', 'Denebola']] },
  { name: 'Virgo', story: 'The Maiden — Spica, the wheat sheaf in her hand, is two blue stars in a four-day dance.',
    lines: [['Zavijava', 'Zaniah'], ['Zaniah', 'Porrima'], ['Porrima', 'Heze'],
            ['Heze', 'Spica'], ['Porrima', 'Vindemiatrix']] },
  { name: 'Scorpius', story: 'The Scorpion — Antares, his heart, is a red giant so vast it would swallow the orbit of Mars.',
    lines: [['Acrab', 'Dschubba'], ['Dschubba', 'Pi Scorpii'], ['Pi Scorpii', 'Sigma Scorpii'],
            ['Sigma Scorpii', 'Antares'], ['Antares', 'Tau Scorpii'], ['Tau Scorpii', 'Wei'],
            ['Wei', 'Mu Scorpii'], ['Mu Scorpii', 'Eta Scorpii'], ['Eta Scorpii', 'Sargas'],
            ['Sargas', 'Girtab'], ['Girtab', 'Lesath'], ['Lesath', 'Shaula']] },
  { name: 'Sagittarius', story: 'The Archer — every eye finds the Teapot first, and the steam above its spout is the Milky Way’s heart.',
    lines: [['Alnasl', 'Kaus Media'], ['Kaus Media', 'Kaus Borealis'], ['Kaus Borealis', 'Phi Sagittarii'],
            ['Phi Sagittarii', 'Ascella'], ['Ascella', 'Kaus Australis'], ['Kaus Australis', 'Kaus Media'],
            ['Phi Sagittarii', 'Nunki'], ['Nunki', 'Tau Sagittarii'], ['Tau Sagittarii', 'Ascella']] },
  { name: 'Capricornus', story: 'The Sea-Goat — Babylon drew him thousands of years before Greece had letters to name him.',
    lines: [['Algedi', 'Dabih'], ['Dabih', 'Theta Capricorni'], ['Theta Capricorni', 'Nashira'],
            ['Nashira', 'Deneb Algedi'], ['Dabih', 'Psi Capricorni'], ['Psi Capricorni', 'Omega Capricorni'],
            ['Omega Capricorni', 'Zeta Capricorni'], ['Zeta Capricorni', 'Deneb Algedi']] },
  { name: 'Pisces', story: 'The Two Fish — fleeing a monster, they tied their tails with a cord and leapt into the river together.',
    lines: [['Fumalsamakah', 'Gamma Piscium'], ['Gamma Piscium', 'Theta Piscium'], ['Theta Piscium', 'Iota Piscium'],
            ['Iota Piscium', 'Omega Piscium'], ['Omega Piscium', 'Lambda Piscium'], ['Lambda Piscium', 'Gamma Piscium'],
            ['Omega Piscium', 'Delta Piscium'], ['Delta Piscium', 'Epsilon Piscium'], ['Epsilon Piscium', 'Omicron Piscium'],
            ['Omicron Piscium', 'Alrescha'], ['Omicron Piscium', 'Kullat Nunu']] },
  { name: 'Piscis Austrinus', story: 'The Southern Fish — Fomalhaut at its mouth keeps the loneliest vigil of any bright star.',
    lines: [['Fomalhaut', 'Epsilon Piscis Austrini'], ['Epsilon Piscis Austrini', 'Beta Piscis Austrini'],
            ['Beta Piscis Austrini', 'Gamma Piscis Austrini'], ['Gamma Piscis Austrini', 'Delta Piscis Austrini'],
            ['Delta Piscis Austrini', 'Fomalhaut'], ['Beta Piscis Austrini', 'Mu Piscis Austrini'],
            ['Mu Piscis Austrini', 'Iota Piscis Austrini']] }
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
