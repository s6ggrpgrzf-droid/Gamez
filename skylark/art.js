/* Skylark art — chunky pixel sprites, pre-rendered once to offscreen canvases.
 * Flat toy-box cartoon palette. Our style: cheerful pocket-planes-like pixel
 * diorama — original art, not borrowed.
 */
'use strict';
var PX = (function () {

  /* palette — warm postcard */
  var PAL = {
    '.': null,
    'K': '#2b1d12', // outline dark
    'B': '#f2b134', // kite amber body
    'b': '#d98e2b', // kite wing dark
    'W': '#cfeef5', // window glass
    'P': '#efe6d4', // prop blur
    'D': '#5b3a1e', // dark brown detail
    'T': '#2e8b8b', // kestrel teal body
    't': '#1f6b6b', // kestrel dark
    'M': '#f4ead8', // merlin cream
    'm': '#c94f38', // merlin red accent
    'J': '#3a3f4a', // jet dark
    'G': '#7fb069', // leaf green
    'g': '#5c8a4d', // leaf dark
    'N': '#2f5d3a', // pine green
    'n': '#22452b', // pine dark
    'R': '#a34a2a', // roof red-brown
    'r': '#7d381f',
    'H': '#e8dcc0', // house cream
    'S': '#8a6f4d', // trunk
    's': '#6b543a',
    'C': '#ffffff', // cloud white
    'c': '#f2e3c8', // cloud shade
    'O': '#ffb347', // windsock orange
    'o': '#e08a2d',
    'V': '#cfe3ef', // pale sky blue (birch)
    'Y': '#ffd94d', // sun yellow
    // portraits
    '1': '#f2c9a0', // skin light
    '2': '#d9a066', // skin medium
    '3': '#8a5a30', // skin deep
    '4': '#c98f5f', // skin shadow
    '5': '#b8b0a8', // gray hair
    '6': '#4a2f1a', // brown hair
    '7': '#1c1a18', // black hair
    '8': '#a34a2a', // mouth
    '9': '#3a3f4a', // headset dark
    '0': '#c94f38', // headset accent
    'Q': '#2e8b8b', // mabel teal blouse
    'q': '#e07b39', // kit orange shirt
    'Z': '#4a6b8a', // rudy denim
    'z': '#d94f30', // rudy cap red
  };

  var SCALE = 3;
  var cache = {};

  function compile(name, rows) {
    var h = rows.length, w = rows[0].length;
    var cv = document.createElement('canvas');
    cv.width = w * SCALE; cv.height = h * SCALE;
    var g = cv.getContext('2d');
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var c = PAL[rows[y][x]];
        if (!c) continue;
        g.fillStyle = c;
        g.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
      }
    }
    cache[name] = cv;
    return cv;
  }

  function get(name) { return cache[name]; }

  /* ---------------- planes (facing right) ---------------- */

  /* Kite — Super Cub: high wing, struts, big cabin windows, tall tail fin,
     bush wheels. Prop at nose (sprite-relative +48, +8). */
  var KITE = [
    '............KKKKKKKKKKKKKKKK............',
    '...........KBBBBBBBBBBBBBBBBK...........',
    '...........KBBBBBBBBBBBBBBBBK...........',
    '..KK.......KBBBBBBBBBBBBBBBBK...........',
    '.KBBK.......KKKBBKKKKKBBKKKK............',
    '.KBBKK........KBBK...KBBK...............',
    '.KBBBBK.......KBBK...KBBK...............',
    '.KBBBBKK......KBBK...KBBK...............',
    'KKBBBBBBK.....KBBK...KBBK...............',
    'BBBBBBBBKKKKKKKKKKKKKKKKKKKKKKKKKK......',
    'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBKK....',
    'KKKBBBBBBBBBBBBBBBBBBBBBWWWWWWBBBBBBK...',
    '..KBBBBBBBBBBBBBBBBBBBBBWWWWWWBBBBBBBK..',
    '..KBBBBBBBBBBBBBBBBBBBBBWWWWWWBBBBBBBK..',
    '..KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK..',
    '..KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK...',
    '...KDDKKKKKKKKDDDKKKKKKKKKDDDKKKKKKK....',
    '...KDDK......KDDDK.......KDDDK..........',
    '....KK.......KDDDK.......KDDDK..........',
    '..............KKK.........KKK...........',
  ];

  /* Kestrel — Twin Otter: long high-wing twin, engine nacelle, pax windows.
     Prop at nacelle nose (sprite-relative +18, -15). */
  var KESTREL = [
    '..........KKKKKKKKKKKKKKKKKKKKK.........',
    '.........KTTTTTTTTTTTTTTTTTTTTTK........',
    '.KK......KTTTTTTTTTTTTTTTTTTTTTK........',
    'KTTK.....KTTTTTTTTTTTTTTTTTTTTTK........',
    'KTTKK.....KKKKKKKKtttttttttKKKK.........',
    'KTTTTK...........KtttttttttK............',
    'KTTTTKK..........KtttttttKK.............',
    'KTTTTTTK..........KKKKKKK...............',
    'TTTTTTTKKKKKKKKKKKKKKKKKKKKKKKKKKKKK....',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTKK..',
    'KKTTTTTTTTTTWWTTWWTTWWTTWWTTTTWWWWWTTTK.',
    '.KTTTTTTTTTTWWTTWWTTWWTTWWTTTTWWWWWTTTK.',
    '.KTTTTTTTTTTTTTTTTTTTTTTTTTTTTWWWWWTTTK.',
    '.KTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTK.',
    '.KTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTKK..',
    '..KDDKKKKKKKKKKDDDKKKKKKKKKDDDKKKKKK....',
    '..KDDK........KDDDK.......KDDDK.........',
    '...KK.........KDDDK.......KDDDK.........',
    '...............KKK.........KKK..........',
  ];

  /* Merlin — regional jet: T-tail, tapered nose, swept wing, underwing jets.
     Fan blur at nose intake (sprite-relative +48, +2). */
  var MERLIN = [
    '........................................',
    '........................................',
    'KKKKKKK.................................',
    'mmmmmmmK................................',
    'mmmmmmmK................................',
    'KKMMKKK.................................',
    '.KMMK...................................',
    '.KmmK...................................',
    '.KmmK...................................',
    '.KmmKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.....',
    '..KMMMMMMMMMMMMMMMMMMMMMMMMMMWWWWMMKK...',
    '..KMMMMMMMMMMMMMMMMMMMMMMMMMMWWWWMMMMK..',
    '..KMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMKK...',
    '..KMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMKK.....',
    '...KKKKKKKKKJJMMMMMMMMMKKKKKJJKKK.......',
    '...........KJJKKKJJJKKJJJK.KJJK.........',
    '............KK..KJJJKKJJJK..KK..........',
    '.................KKK..KKK...............',
  ];

  /* ---------------- scenery ---------------- */

  var PINE = [
    '....KK....',
    '...KNnK...',
    '...KNnK...',
    '..KNNnnK..',
    '..KNnnnK..',
    '.KNNnnnnK.',
    '.KNnnnnnK.',
    'KNNnnnnnnK',
    '....KSK...',
    '....KSK...',
  ];

  var ROUND_TREE = [
    '...KKKK...',
    '..KGGGGK..',
    '.KGGGGGGK.',
    '.KGgGGgGK.',
    'KGGGGGGGGK',
    'KGgGGGGgGK',
    '.KGGGGGGK.',
    '..KGGGGK..',
    '...KSK....',
    '...KSK....',
  ];

  var BIRCH = [
    '...KKK....',
    '..KGGGK...',
    '..KGgGK...',
    '...KVK....',
    '..KGGGK...',
    '...KVK....',
    '..KGGGK...',
    '...KVK....',
    '...KVK....',
    '...KVK....',
  ];

  var HOUSE = [
    '......KKKKKK......',
    '....KKRRRRRRKK....',
    '..KKRRRRRRRRRRKK..',
    '.KRRRRRRRRRRRRRRK.',
    'KKKKKKKKKKKKKKKKKK',
    'KHHHHHHHKHHHHHHHK.',
    'KHWWWWWHKHHHDHHHK.',
    'KHWWWWWHKHHHDHHHK.',
    'KHHHHHHHKHHHDHHHK.',
    'KKKKKKKKKKKKKKKKKK',
  ];

  var HANGAR = [
    '........KKKKKKKKKKKKKK........',
    '......KKRRRRRRRRRRRRRRKK......',
    '....KKRRRRRRRRRRRRRRRRRRKK....',
    '..KKRRRRRRRRRRRRRRRRRRRRRRKK..',
    '.KRRRRRRRRRRRRRRRRRRRRRRRRRRK.',
    'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
    'KHHHHHHHKKKKKKKKKKKKHHHHHHHK.',
    'KHHHHHHHKDDDDDDDDDDKHHHHHHHK.',
    'KHHHHHHHKDDDDDDDDDDKHHHHHHHK.',
    'KHHHHHHHKDDDDDDDDDDKHHHHHHHK.',
    'KHHHHHHHKDDDDDDDDDDKHHHHHHHK.',
    'KKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
  ];

  var WINDSOCK = [
    'K....',
    'K....',
    'KOOOO',
    'KOOOo',
    'KOOOO',
    'K....',
    'K....',
    'K....',
    'K....',
    'KSK..',
  ];

  var CLOUD1 = [
    '....KKKKKK.....',
    '..KKCCCCCCKK...',
    '.KCCCCCCCCCCK..',
    'KCCCCCcCCCCCCK.',
    'KCCCCCCCCCCCCCK',
    '.KKKKKKKKKKKKK.',
  ];

  /* tall cumulus — puffy */
  var CLOUD2 = [
    '.....KKKK.......',
    '...KKCCCCKK.....',
    '..KCCCCCCCCK....',
    '.KCCCCCCCCCCKK..',
    'KCCCCcCCCCCCCCK.',
    'KCCCCCCCCCCCCCCK',
    'KCCcCCCCCCcCCCCK',
    '.KKKKKKKKKKKKKK.',
  ];

  /* flat stratus — long and low */
  var CLOUD3 = [
    '........................',
    '.....KKKKKKKKKKKK.......',
    '..KKKCCCCCCCCCCCCKKK....',
    '.KCCCCCCCCCCCCCCCCCCCK..',
    'KCCCCcCCCCCCCCCCcCCCCCK.',
    '.KKKKKKKKKKKKKKKKKKKKK..',
  ];

  /* wispy cirrus */
  var CLOUD4 = [
    '..KK....KKK......KK...',
    '.KCCKKKCCCCKK..KKCCK..',
    'KCCCCCCCCCCCCCKCCCCCK.',
    '.KKKKKKKKKKKKKKKKKKK..',
  ];

  var BIRD1 = ['K..K', 'KKKK'];
  var BIRD2 = ['....', 'KKKK'];

  /* propeller frames — side-view disc. 0=vertical, 1=diagonal, 2=edge-on */
  var PROP0 = [
    '...KK...',
    '...KK...',
    '...KK...',
    '...KK...',
    '...KK...',
    '...KK...',
    '...KK...',
    '...KK...',
    '...KK...',
    '...KK...',
    '...KK...',
    '...KK...',
  ];
  var PROP1 = [
    'KK.....K',
    '.KK...K.',
    '..KK.K..',
    '...KK...',
    '...KK...',
    '..K.KK..',
    '.K...KK.',
    'K.....KK',
    '......KK',
    '.....KK.',
    '....KK..',
    '...KK...',
  ];
  var PROP2 = [
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    'KKKKKKKKK',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
  ];
  /* prop blur disc — drawn translucent */
  var PROPBLUR = [
    '..KKKKK..',
    '.KKKKKKK.',
    'KKKKKKKKK',
    'KKKKKKKKK',
    'KKKKKKKKK',
    'KKKKKKKKK',
    'KKKKKKKKK',
    '.KKKKKKK.',
    '..KKKKK..',
  ];
  /* jet intake fan blur (Merlin) — subtle */
  var FANBLUR = [
    '.KKKKK.',
    'KKKKKKK',
    'KKKKKKK',
    'KKKKKKK',
    'KKKKKKK',
    'KKKKKKK',
    '.KKKKK.',
  ];

  function init() {
    compile('kite', KITE);
    compile('kestrel', KESTREL);
    compile('merlin', MERLIN);
    compile('prop0', PROP0);
    compile('prop1', PROP1);
    compile('prop2', PROP2);
    compile('propblur', PROPBLUR);
    compile('fanblur', FANBLUR);
    compile('pine', PINE);
    compile('round', ROUND_TREE);
    compile('birch', BIRCH);
    compile('house', HOUSE);
    compile('hangar', HANGAR);
    compile('windsock', WINDSOCK);
    compile('cloud1', CLOUD1);
    compile('cloud2', CLOUD2);
    compile('cloud3', CLOUD3);
    compile('cloud4', CLOUD4);
    compile('bird1', BIRD1);
    compile('bird2', BIRD2);
    compile('mabel', MABEL);
    compile('kit', KIT);
    compile('rudy', RUDY);
  }

  /* ---------------- tower crew portraits (20x24) ---------------- */
  // Mabel — senior tower op. Warm, unflappable, 30 years on the radio.
  var MABEL = [
    '........5555........',
    '.......555555.......',
    '.......555555.......',
    '......55555555......',
    '.....9555555559.....',
    '.....9533333359.....',
    '....995333333599....',
    '....993333333399....',
    '....993EE33EE399....',
    '....993Ee33eE399....',
    '....993333333399....',
    '....993338833399....',
    '.....9334444339.....',
    '.....9333888339.....',
    '.....9333333339.....',
    '......933333339.....',
    '......533333335.....',
    '.......333333.......',
    '......QQQQQQQQ......',
    '.....QQQQQQQQQQ.....',
    '.....QQQQQQQQQQ.....',
    '.....QQQQQQQQQQ.....',
    '.....QQQQQQQQQQ.....',
    '.....QQQQQQQQQQ.....',
  ];
  // Kit — junior tower op. Excitable, big grin, learning from Mabel.
  var KIT = [
    '.....77777777.......',
    '....7777777777......',
    '...777777777777.....',
    '...777111111777.....',
    '...791111111197.....',
    '....91111111119.....',
    '....91111111119.....',
    '....911EE11EE119....',
    '....911Ee11eE119....',
    '....911111111119....',
    '....911144111119....',
    '....911188881119....',
    '.....9118888119.....',
    '.....9111111119.....',
    '......911111119.....',
    '......711111117.....',
    '.......111111.......',
    '.......111111.......',
    '......qqqqqqqq......',
    '.....qqqqqqqqqq.....',
    '.....qqqqqqqqqq.....',
    '.....qqqqqqqqqq.....',
    '.....qqqqqqqqqq.....',
    '.....qqqqqqqqqq.....',
  ];
  // Rudy "Wrench" Kowalski — mechanic. Beard, cap, big heart, bigger jokes.
  var RUDY = [
    '......zzzzzzzz......',
    '.....zzzzzzzzzz.....',
    '.....zzzzzzzzzz.....',
    '.....6666666666.....',
    '.....6222222226.....',
    '.....6222222226.....',
    '.....62EE22EE26.....',
    '.....62Ee22eE26.....',
    '.....6222222226.....',
    '.....6224422226.....',
    '.....6266666626.....',
    '.....6666688666.....',
    '.....6666888866.....',
    '.....6666666666.....',
    '......66666666......',
    '......66666666......',
    '.......222222.......',
    '.......222222.......',
    '......ZZZZZZZZ......',
    '.....ZZZZZZZZZZ.....',
    '.....ZZZZZZZZZZ.....',
    '.....ZZZZZZZZZZ.....',
    '.....ZZZZZZZZZZ.....',
    '.....ZZZZZZZZZZ.....',
  ];

  /* ---------------- generated passenger faces (passport photos) ---------------- */
  // Seeded variations: skin x4, hair color x4, hair style x4 = 64 faces
  var FACE_SKINS = ['1', '2', '3', '4'];
  var FACE_HAIR = ['5', '6', '7', 'K'];
  var faceCache = {};
  function face(seed) {
    var key = 'face' + (seed % 64);
    if (faceCache[key]) return faceCache[key];
    var s = seed;
    function rnd() { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }
    var skin = FACE_SKINS[Math.floor(rnd() * 4)];
    var hair = FACE_HAIR[Math.floor(rnd() * 4)];
    var style = Math.floor(rnd() * 4); // 0 short, 1 long, 2 bald-ish, 3 curly
    var rows = [];
    for (var y = 0; y < 24; y++) {
      var row = '';
      for (var x = 0; x < 20; x++) row += '.';
      rows.push(row);
    }
    function px(x, y, c) {
      if (x < 0 || x > 19 || y < 0 || y > 23) return;
      rows[y] = rows[y].substring(0, x) + c + rows[y].substring(x + 1);
    }
    function rect(x0, y0, x1, y1, c) {
      for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) px(x, y, c);
    }
    // photo background
    rect(0, 0, 19, 23, 'V');
    // shoulders/shirt
    var shirt = ['Q', 'q', 'Z', 'T'][Math.floor(rnd() * 4)];
    rect(3, 19, 16, 23, shirt);
    // neck + face
    rect(8, 16, 11, 18, skin);
    rect(6, 6, 13, 17, skin);
    rect(6, 12, 13, 14, '4'); // cheek shading band (subtle)
    rect(6, 6, 13, 17, skin); // re-fill (keeps shading light)
    // hair by style
    if (style === 0) { rect(5, 3, 14, 6, hair); rect(5, 6, 6, 10, hair); rect(13, 6, 14, 10, hair); }
    else if (style === 1) { rect(5, 3, 14, 7, hair); rect(4, 7, 5, 16, hair); rect(14, 7, 15, 16, hair); }
    else if (style === 2) { rect(6, 4, 13, 5, hair); }
    else { rect(5, 2, 14, 6, hair); rect(4, 5, 5, 8, hair); rect(14, 5, 15, 8, hair); rect(6, 2, 13, 3, hair); }
    // eyes
    rect(7, 9, 8, 10, 'E'); rect(11, 9, 12, 10, 'E');
    px(8, 10, 'e'); px(11, 10, 'e');
    // nose + mouth (smile varies)
    px(9, 12, '4'); px(10, 12, '4');
    var smile = Math.floor(rnd() * 3);
    if (smile === 0) { rect(8, 14, 11, 14, '8'); }
    else if (smile === 1) { rect(7, 14, 12, 14, '8'); px(7, 13, '8'); px(12, 13, '8'); }
    else { px(8, 14, '8'); px(9, 15, '8'); px(10, 15, '8'); px(11, 14, '8'); }
    var cv = document.createElement('canvas');
    cv.width = 20 * SCALE; cv.height = 24 * SCALE;
    var g = cv.getContext('2d');
    for (var yy = 0; yy < 24; yy++) for (var xx = 0; xx < 20; xx++) {
      var c = PAL[rows[yy][xx]];
      if (!c) continue;
      g.fillStyle = c;
      g.fillRect(xx * SCALE, yy * SCALE, SCALE, SCALE);
    }
    faceCache[key] = cv;
    return cv;
  }

  return { init: init, get: get, face: face, SCALE: SCALE };
})();

if (typeof module !== 'undefined') module.exports = PX;
