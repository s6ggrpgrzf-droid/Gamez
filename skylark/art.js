/* Skylark art — chunky pixel sprites, pre-rendered once to offscreen canvases.
 * Warm golden-hour palette. Our style: storybook pixel diorama, NOT LP's 3D.
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

  /* Kite — little bush Cub, high wing, amber (prop drawn separately, animated) */
  var KITE = [
    '............KKKK..............',
    '..........KKWWWWKK............',
    '.........KWWWWWWWWK...........',
    '.........KWWWWWWWWK...........',
    '......KKKKKKKKKKKKKK..........',
    '....KKBBBBBBBBBBBBBBKK........',
    '..KKBBBBBKWWBBBBBBBBBBKK......',
    '.KBBBBBBBBBWWBBBBBBBBBBBK.....',
    '.KBBBBBBBBBBBBBBBBBBBBBBK.....',
    '.KBBBBBBBBBBBBBBBBBBBBBBK.....',
    '..KKBBBBBBBBBBBBBBBBBBKK......',
    '....KKBBBBBBBBBBBBBBKK........',
    '......KKKKKKKKKKKKKK..........',
    '........KKK......KKK..........',
    '.......KDDDK....KDDDK.........',
    '.......KDDDK....KDDDK.........',
  ];

  /* Kestrel — twin-prop, teal, bigger (props drawn separately, animated) */
  var KESTREL = [
    '..............KKKKKK................',
    '............KKWWWWWWKK..............',
    '...........KWWWWWWWWWWK.............',
    '...........KWWWWWWWWWWK.............',
    '........KKKKKKKKKKKKKKKKKK..........',
    '......KKTTTTTTTTTTTTTTTTTTKK........',
    '....KKTTTTKWWWTTTTTTTTTTTTTTKK......',
    '..KKTTTTTTTTWWWTTTTTTTTTTTTTTK......',
    '..KKTTTTTTTTTTTTTTTTTTTTTTTTTK......',
    '..KKTTTTTTTTTTTTTTTTTTTTTTTTTK......',
    '....KKTTTTTTTTTTTTTTTTTTTKTTKK......',
    '......KKTTTTTTTTTTTTTTTTTTKK........',
    '........KKKKKKKKKKKKKKKKKK..........',
    '..........KKK........KKK...........',
    '.........KDDDK......KDDDK..........',
    '.........KDDDK......KDDDK..........',
  ];

  /* Merlin — sleek regional jet, cream + red */
  var MERLIN = [
    '....................................',
    '..........KKKKKKKKKK.................',
    '........KKWWWWWWWWWWKK...............',
    '.......KWWWWWWWWWWWWWWK..............',
    '......KKKKKKKKKKKKKKKKKKK............',
    '....KKMMMMMMMMMMMMMMMMMMMK.....KK....',
    '..KKMMMMMKWWWMMMMMMMMMMMMMMKKKKmmK...',
    '.KMMMMMMMMMWWWMMMMMMMMMMMMMMMMMmmmK..',
    'KMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMmmK.',
    '.KMMMMMMMMMMMMMMMMMMMMMMMMMMMMMmmmK..',
    '..KKMMMMMMMMMMMMMMMMMMMMMMKKKKmmK....',
    '....KKMMMMMMMMMMMMMMMMMMMK.....KK....',
    '......KKKKKKKKKKKKKKKKKKK............',
    '.........JJJ..........JJJ...........',
    '.........JJJ..........JJJ...........',
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
    compile('bird1', BIRD1);
    compile('bird2', BIRD2);
  }

  return { init: init, get: get, SCALE: SCALE };
})();

if (typeof module !== 'undefined') module.exports = PX;
