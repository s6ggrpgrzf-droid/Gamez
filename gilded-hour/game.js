/* THE GILDED HOUR — Pass B format.
   A 15-question party show for 2-4 players at one table. ONE VERB: ANSWER.
   Everybody answers every question with a finger-vote (hold up 1-4 fingers);
   the host taps in who had it right. Round 1 The Warm-Up x6, Round 2 Double
   Money x6, Round 3 The Big Finish x3 (public 1-3 chip bets). Five of the
   fifteen are guess questions: closest-number shouts and most-people-say
   surveys. One lifeline only: Cut Two, one per player per show. Nobody can
   ever lose money. Pure show logic + DOM rendering; the rAF loop feeds dt. */
(function () {
  "use strict";

  /* ---------- seeded rng ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rng = mulberry32((Date.now() % 2147483647) || 7);
  function ri(n) { return Math.floor(rng() * n); }
  function pick(arr) { return arr[ri(arr.length)]; }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) { var j = ri(i + 1); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  function round10(n) { return Math.max(0, Math.round(n / 10) * 10); }
  function money(n) { return (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US"); }
  function mplus(n) { return "+" + money(n); }

  /* ---------- constants ---------- */
  var PCOLORS = ["var(--p0)", "var(--p1)", "var(--p2)", "var(--p3)"];
  /* category colours — the study palette; the question's category takes
     over the slabs, chip, value figures and spotlight pool */
  var CATSTYLE = {
    "Movies":           { hi: "#F0568C", mid: "#E8437C", lo: "#C2255C", sh: "#8E1E47", rgb: "232,67,124", shi: "#C04570", smid: "#C83A6B" },
    "TV":               { hi: "#1B70C6", mid: "#1563B2", lo: "#10518F", sh: "#0A3D6E", rgb: "21,99,178" },
    "Music":            { hi: "#B983F0", mid: "#9B5DE5", lo: "#7C3AC9", sh: "#55239E", rgb: "155,93,229", shi: "#855EAD", smid: "#8C54CE" },
    "Ads & Jingles":    { hi: "#FFA25E", mid: "#FF8C42", lo: "#E56F1D", sh: "#A34D0E", rgb: "255,140,66" },
    "Toys & Games":     { hi: "#5CE38A", mid: "#3ECF6E", lo: "#34B35E", sh: "#177A38", rgb: "62,207,110" },
    "Saturday Morning": { hi: "#FFD76A", mid: "#FFC93C", lo: "#F0A90B", sh: "#A87408", rgb: "255,201,60" },
    "The Dial-Up Years": { hi: "#3FD8D4", mid: "#17BEBB", lo: "#27ACAA", sh: "#076B6E", rgb: "23,190,187" }
  };
  /* shi/smid are the answer-slab gradient stops (perfectionist fix #3):
     the identity hi/mid stay untouched for chips, pills and emblems,
     but cream slab text on Movies/Music measured 2.59–3.55:1 — under
     even the large-text floor. The slab-only stops deepen those two
     gradients so cream clears 4.5:1 at every stop; Toys/Dial-Up lo
     stops are lightened a step for the same reason (dark text). */
  function catStyle(cat) { return CATSTYLE[cat] || CATSTYLE["Movies"]; }
  var CATTX = { "Ads & Jingles": "#431A04", "Toys & Games": "#0B3D1C", "Saturday Morning": "#4A3200", "The Dial-Up Years": "#063A3B" };
  function applyCat(cat) {
    var cs = catStyle(cat), g = $("scr-game");
    if (!g) return;
    g.style.setProperty("--cat", cs.mid);
    g.style.setProperty("--cat-hi", cs.hi);
    g.style.setProperty("--cat-lo", cs.lo);
    g.style.setProperty("--cat-sh", cs.sh);
    g.style.setProperty("--cat-rgb", cs.rgb);
    g.style.setProperty("--cat-shi", cs.shi || cs.hi);
    g.style.setProperty("--cat-smid", cs.smid || cs.mid);
    g.style.setProperty("--cat-tx", CATTX[cat] || "#FFF6E8");
  }
  /* category emblems (item 6): the seven symbols live in index.html;
     this stamps one beside a category name anywhere, at any size */
  var CATEMBLEM = {
    "Movies": "emb-movies", "TV": "emb-tv", "Music": "emb-music",
    "Ads & Jingles": "emb-ads", "Toys & Games": "emb-toys",
    "Saturday Morning": "emb-sat", "The Dial-Up Years": "emb-dial"
  };
  function catEmblem(cat) {
    var id = CATEMBLEM[cat];
    if (!id) return "";
    return '<svg class="emb" viewBox="0 0 48 48" aria-hidden="true"><use href="#' + id + '"></use></svg>';
  }
  var PNAMES = ["Player One", "Player Two", "Player Three", "Player Four"];
  var BASE_VALUES = { easy: 100, medium: 200, hard: 300 };
  var R1_COUNT = 6, R2_COUNT = 6, R3_COUNT = 3;
  var QTIME = 20, NUM_TIME = 30;
  /* difficulty shape per round (guess slots override by schedule) */
  var R1_DIFFS = ["easy", "easy", "medium", "easy", "medium", "hard"];
  var R2_DIFFS = ["medium", "easy", "hard", "medium", "hard", "medium"];
  var R3_DIFFS = ["medium", "hard", "medium"];
  /* exactly five guess questions: round:qInRound (0-based), interleaved,
     never first or last in a round */
  var GUESS_SLOTS = ["1:1", "1:4", "2:2", "2:5", "3:1"];

  /* ---------- host lines (original writing — Sterling the playmate) ---------- */
  var HOST = {
    open: [
      "Good evening, I'm Sterling. Fifteen questions, everybody plays, and nobody goes home poorer. Those are the house rules — I invented them, so they're excellent.",
      "Welcome to The Gilded Hour: the questions are older than your first car and twice as reliable. I'm Sterling. Let's make some money."
    ],
    r1: [
      "Round One — the Warm-Up. Easy money, loud opinions. Fingers at the ready, table.",
      "The Warm-Up. Six questions to loosen the wrists and the wallets. I pick the categories — the wheel and I have an understanding."
    ],
    r2: [
      "Round Two — Double Money. Everything pays twice, and your Cut Two is live. Spend it wisely; there is exactly one.",
      "Double Money. The questions get nosier and the money gets louder. Sterling believes in you. Sterling believes in everybody. It's a flaw."
    ],
    r3: [
      "The Big Finish. Three questions, three bets, and zero ways to lose money. This show is a terrible casino and a wonderful friend.",
      "Three questions left. Bet on yourselves — out loud, so the room can hold you to it."
    ],
    spin: [
      "The wheel turns… and stops where it stops. {cat}! Blame the wheel.",
      "{cat}! The wheel has spoken. The wheel is never wrong, merely smug."
    ],
    read: [
      "Here's one from {cat}. Fingers limber, memories unlocked.",
      "{cat}, coming up. Somewhere in this room is a misspent youth about to pay off."
    ],
    vote: [
      "Fingers up! Three, two, one — SHOW ME!",
      "Hands in the air like you actually know this one. Three, two, one — show me!",
      "Answers on fingers, please — no conferring, no asking the dog. Three, two, one — show me!",
      "Commit, table. A guess held high beats a certainty kept quiet. Three, two, one — show me!"
    ],
    mark: [
      "Right — who had it? Tap their seats. Generosity is allowed; honesty is encouraged.",
      "Call it fairly, table. Tap the seats that earned it.",
      "The moment of account. Tap every seat that had it — Sterling trusts your eyes and your conscience.",
      "Who's holding the right answer? Point them out — tap their seats and make it official.",
      "Confession time. Tap the seats that knew it. The others may keep their dignity; it's all they have left."
    ],
    allHit: [
      "EVERYBODY. The whole table, paid in full. I shall alert the newspapers.",
      "A clean sweep! Drinks are on the house. The house is me. The drinks are imaginary."
    ],
    someHit: [
      "{name} had it — and has company. The finger-vote never lies. Usually.",
      "Paid out to the sharp-eyed. The rest of you: beautiful confidence, wrong answer."
    ],
    allMiss: [
      "Nobody. Not one finger. The question retires undefeated, and slightly smug about it.",
      "The whole table looked straight at that one and blinked. It happens to the best rooms. Once."
    ],
    numQ: [
      "Closest number wins this one. No options, no hiding — just a number and the courage to shout it.",
      "A numbers question. Shout your best guess when I call it — the nearest shout takes the money."
    ],
    numHit: [
      "{name} called it closest. Somewhere, a maths teacher just felt a small disturbance of pride.",
      "Closest shout: {name}. The number has been respected, and so have you."
    ],
    numMiss: [
      "Nobody got near it. The number remains at large.",
      "Those guesses were… geographically diverse. No winner this time."
    ],
    cut: [
      "{name} spends the Cut Two! Two wrong answers leave the building. Security will escort them out.",
      "Cut Two, called by {name}. Half the lying is over — the other half is up to you."
    ],
    bet: [
      "Bets out loud, please. One, two or three chips on yourself. Confidence is free; chips are a hundred dollars.",
      "The Big Finish wants your bet and your bravado in equal measure. Declare your bets — the room is listening, and it will remember."
    ],
    winner: [
      "{name} takes the Gilded Hour! The confetti is real, the money is imaginary, and the glory is legally binding.",
      "And the Hour belongs to {name}. Table, applaud. {name}, bow. I shall pretend not to enjoy this."
    ]
  };
  /* Host lines are drawn from a shuffle-bag per pool: every variant
     plays once before any variant repeats, and a refill never opens
     with the line that just played — so even a two-line pool cycled
     fifteen times a show stops sounding like a loop. Bags reset with
     each new show (startShow / ogStartShow). */
  var lineBags = {}, lineLast = {};
  function drawLine(kind) {
    var pool = HOST[kind] || ["…"];
    var bag = lineBags[kind];
    if (!bag || !bag.length) {
      bag = shuffle(pool.map(function (_, i) { return i; }));
      if (pool.length > 1 && bag[0] === lineLast[kind]) { var t = bag[0]; bag[0] = bag[1]; bag[1] = t; }
      lineBags[kind] = bag;
    }
    var idx = bag.shift();
    lineLast[kind] = idx;
    return pool[idx];
  }
  function resetLineBags() { lineBags = {}; lineLast = {}; }
  function authoredLine(kind, vars) {
    var line = drawLine(kind);
    if (vars) for (var k in vars) line = line.split("{" + k + "}").join(vars[k]);
    return line;
  }
  function hostSay(kind, vars) {
    $("hostLine").textContent = authoredLine(kind, vars);
  }

  /* ---------- dom helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function el(html) { var d = document.createElement("div"); d.innerHTML = html; return d.firstElementChild; }
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

  /* ---------- marquee bulbs (study): spaced around a frame, chasing ---------- */
  function buildBulbs(frame) {
    if (!frame || frame.dataset.bulbs) return;
    var w = frame.clientWidth, h = frame.clientHeight;
    if (!w || !h) return;
    frame.dataset.bulbs = "1";
    var spacing = 44, n = 0, x, y, b;
    function add(bx, by) {
      b = document.createElement("span");
      b.className = "bulb" + (n++ % 2 ? " b" : "");
      b.style.left = bx + "px"; b.style.top = by + "px";
      frame.appendChild(b);
    }
    for (x = spacing / 2; x < w; x += spacing) { add(x, 0); add(x, h); }
    for (y = spacing; y < h - 4; y += spacing) { add(0, y); add(w, y); }
  }

  /* ---------- the cast (original flat illustration, from the study) ---------- */
  var STERLING_BODY =
    '<path d="M52,380 L64,258 Q68,206 128,196 L192,196 Q252,206 256,258 L268,380 Z" fill="#241331"/>' +
    '<path d="M136,198 L184,198 L160,288 Z" fill="#FFF6E8"/>' +
    '<path d="M128,196 L160,240 L136,306 L114,212 Z" fill="#3A2150"/>' +
    '<path d="M192,196 L160,240 L184,306 L206,212 Z" fill="#3A2150"/>' +
    '<path d="M160,208 L131,193 Q124,208 131,223 Z" fill="#E8437C"/>' +
    '<path d="M160,208 L189,193 Q196,208 189,223 Z" fill="#E8437C"/>' +
    '<rect x="151" y="199" width="18" height="18" rx="6" fill="#FFC93C"/>' +
    '<rect x="146" y="158" width="28" height="42" rx="9" fill="#E89A63"/>' +
    '<circle cx="94" cy="124" r="13" fill="#F6B183"/>' +
    '<circle cx="226" cy="124" r="13" fill="#F6B183"/>' +
    '<ellipse cx="160" cy="118" rx="64" ry="70" fill="#F6B183"/>' +
    '<path d="M94,112 C90,44 126,26 160,26 C196,26 230,46 226,112 C222,80 206,64 186,68 C168,80 150,60 128,66 C106,72 98,88 94,112 Z" fill="#2A1530"/>' +
    '<path d="M112,56 Q142,36 178,44 Q142,46 112,56 Z" fill="#452A5E" opacity=".85"/>' +
    '<ellipse cx="160" cy="128" rx="7" ry="10" fill="#E89A63"/>' +
    '<ellipse cx="110" cy="142" rx="11" ry="6.5" fill="#FF9D8A" opacity=".5"/>' +
    '<ellipse cx="210" cy="142" rx="11" ry="6.5" fill="#FF9D8A" opacity=".5"/>';
  function sterlingSVG(variant, cls) {
    var inner = "";
    if (variant === "present") {
      inner =
        '<path d="M252,250 Q298,262 308,302" stroke="#4E2C68" stroke-width="29" stroke-linecap="round" fill="none"/>' +
        '<circle cx="309" cy="307" r="14" fill="#F6B183"/>' + STERLING_BODY +
        '<rect x="110" y="80" width="38" height="11" rx="5.5" transform="rotate(-11 129 86)" fill="#2A1530"/>' +
        '<rect x="172" y="80" width="38" height="11" rx="5.5" transform="rotate(11 191 86)" fill="#2A1530"/>' +
        '<circle cx="131" cy="110" r="6.5" fill="#2A1530"/><circle cx="189" cy="110" r="6.5" fill="#2A1530"/>' +
        '<circle cx="129" cy="108" r="2" fill="#FFF6E8"/><circle cx="187" cy="108" r="2" fill="#FFF6E8"/>' +
        '<path d="M114,142 Q160,190 206,142 Q160,161 114,142 Z" fill="#7C2D3E"/>' +
        '<path d="M122,145 Q160,165 198,145 Q160,155 122,145 Z" fill="#FFFFFF"/>';
    } else { /* smirk — standings commentator, arms crossed */
      inner = STERLING_BODY +
        '<rect x="92" y="256" width="136" height="27" rx="13.5" transform="rotate(17 160 270)" fill="#2E1A40"/>' +
        '<rect x="92" y="256" width="136" height="27" rx="13.5" transform="rotate(-17 160 270)" fill="#241331"/>' +
        '<rect x="110" y="78" width="38" height="11" rx="5.5" transform="rotate(-7 129 84)" fill="#2A1530"/>' +
        '<rect x="172" y="92" width="38" height="11" rx="5.5" transform="rotate(3 191 98)" fill="#2A1530"/>' +
        '<circle cx="131" cy="110" r="6.5" fill="#2A1530"/><circle cx="189" cy="110" r="6.5" fill="#2A1530"/>' +
        '<circle cx="129" cy="108" r="2" fill="#FFF6E8"/><circle cx="187" cy="108" r="2" fill="#FFF6E8"/>' +
        '<path d="M124,150 Q162,166 198,140" stroke="#7C2D3E" stroke-width="6.5" stroke-linecap="round" fill="none"/>';
    }
    return '<svg class="' + (cls || "sterling sterling-md") + '" viewBox="0 0 320 380" aria-label="Sterling">' + inner + "</svg>";
  }

  /* player avatars (item 6): eight original flat bust portraits in
     Sterling's hand — round faces, bold features that read at couch
     distance, cream eye-whites on deep skin (the study's contrast
     fix). Each bust rides a ground disc in the SEAT's colour, so a
     player's colour identity survives any portrait they pick.
     avatarSVG(avatarId, state, seatIdx): id 0..7, seat defaults to
     the id (which is exactly the old seat-index behaviour). */
  var PCHEAD = ["#35D461", "#38B6FF", "#FF6B5E", "#B07FE8"];
  var AVATARS = [
    { /* 0 — the Starlet: gold waves, hoop earrings, a beauty mark */
      skin: "#F6B183", neck: "#E89A63", shirt: "#E8437C", hair: "#F2C14E", brow: "#8A5A12",
      mouth: "#C2255C", eye: "dark",
      back: '<path d="M28,44 C24,16 40,6 60,6 C80,6 96,16 92,44 L94,78 C86,84 78,78 79,66 L80,44 C68,34 52,34 40,44 L41,66 C42,78 34,84 26,78 Z" fill="#F2C14E"/>',
      front: '<path d="M32,42 C32,20 46,12 60,12 C74,12 88,20 88,42 C84,28 74,24 66,27 C56,30 44,24 38,29 C34,32 33,37 32,42 Z" fill="#F2C14E"/>' +
        '<path d="M40,20 Q56,13 76,19 Q58,18 40,20 Z" fill="#FFE29A" opacity=".8"/>',
      acc: '<circle cx="29.5" cy="60" r="4.4" fill="none" stroke="#FFC93C" stroke-width="2.4"/>' +
        '<circle cx="90.5" cy="60" r="4.4" fill="none" stroke="#FFC93C" stroke-width="2.4"/>' +
        '<circle cx="75" cy="55" r="1.7" fill="#2A1530"/>',
      lips: true
    },
    { /* 1 — the Crooner: swept quiff, gold chain over a blue shirt */
      skin: "#B96F3E", neck: "#9A5527", shirt: "#1563B2", hair: "#17101F", brow: "#17101F",
      mouth: "#5E2408", eye: "dark",
      back: "",
      front: '<path d="M31,44 C30,20 44,10 58,10 C56,5 66,3 73,8 C86,13 90,26 89,44 C85,29 76,25 64,26 C49,27 37,30 31,44 Z" fill="#17101F"/>',
      acc: '<path d="M38,92 Q60,106 82,92" stroke="#FFC93C" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
        '<path d="M52,97 L60,108 L68,97 L60,101 Z" fill="#FFC93C"/>',
      collar: '<path d="M48,88 L60,100 L72,88 L72,96 L60,106 L48,96 Z" fill="#FFF6E8"/>'
    },
    { /* 2 — the Kid: backwards cap, freckles, grin for days */
      skin: "#F2B183", neck: "#D98E57", shirt: "#3ECF6E", hair: "#2A1530", brow: "#2A1530",
      mouth: "#7C2D3E", eye: "dark",
      back: "",
      front: '<path d="M33,40 C36,24 46,17 60,17 C74,17 84,24 87,40 C76,31 44,31 33,40 Z" fill="#2A1530"/>' +
        '<path d="M30,33 C32,16 44,7 60,7 C76,7 88,16 90,33 C74,25 46,25 30,33 Z" fill="#E8437C"/>' +
        '<rect x="12" y="24" width="20" height="7" rx="3.5" transform="rotate(14 22 27)" fill="#C2255C"/>' +
        '<circle cx="60" cy="10" r="3" fill="#FFC93C"/>',
      acc: '<circle cx="42" cy="54" r="1.5" fill="#D98E57"/><circle cx="48" cy="57" r="1.5" fill="#D98E57"/><circle cx="41" cy="59" r="1.5" fill="#D98E57"/>' +
        '<circle cx="78" cy="54" r="1.5" fill="#D98E57"/><circle cx="72" cy="57" r="1.5" fill="#D98E57"/><circle cx="79" cy="59" r="1.5" fill="#D98E57"/>'
    },
    { /* 3 — the Grandmother: silver bun, gold spectacles, pearls */
      skin: "#8A4B26", neck: "#6B3418", shirt: "#9B5DE5", hair: "#D8C9E8", brow: "#D8C9E8",
      mouth: "#4A1E08", eye: "cream",
      back: '<circle cx="60" cy="9" r="9.5" fill="#D8C9E8"/><path d="M31,46 C29,22 44,12 60,12 C76,12 91,22 89,46 C86,30 74,25 60,25 C46,25 34,30 31,46 Z" fill="#D8C9E8"/>',
      front: "",
      acc: '<circle cx="31" cy="61" r="2.7" fill="#FFF6E8"/><circle cx="89" cy="61" r="2.7" fill="#FFF6E8"/>',
      glasses: "#FFC93C"
    },
    { /* 4 — the Rocker: long mane, gold headband, lightning drop */
      skin: "#F6B183", neck: "#E89A63", shirt: "#3A2150", hair: "#8E3B2F", brow: "#5E2408",
      mouth: "#7C2D3E", eye: "dark",
      back: '<path d="M26,40 C24,12 42,4 60,4 C78,4 96,12 94,40 L97,102 L78,102 L80,50 C70,40 50,40 40,50 L42,102 L23,102 Z" fill="#8E3B2F"/>',
      front: '<path d="M32,40 C34,20 46,13 60,13 C74,13 86,20 88,40 L78,30 L70,39 L60,29 L50,39 L42,30 Z" fill="#8E3B2F"/>' +
        '<rect x="31" y="31" width="58" height="7.5" rx="3.75" transform="rotate(-2 60 35)" fill="#FFC93C"/>',
      acc: '<path d="M91,58 L85,70 L89.5,70 L84,82 L95,66 L90.5,66 Z" fill="#FFC93C"/>'
    },
    { /* 5 — the Cowboy: tan hat, moustache, neckerchief */
      skin: "#C68642", neck: "#A66A2E", shirt: "#17BEBB", hair: "#2A1530", brow: "#2A1530",
      mouth: "#5E2408", eye: "dark",
      back: '<path d="M33,44 L33,64 L39,64 L39,46 Z M87,44 L87,64 L81,64 L81,46 Z" fill="#2A1530"/>',
      front: '<ellipse cx="60" cy="27" rx="35" ry="8" fill="#C97B3D"/>' +
        '<path d="M39,27 C40,11 48,5 60,5 C72,5 80,11 81,27 C68,22 52,22 39,27 Z" fill="#C97B3D"/>' +
        '<path d="M41.5,20.5 C52,17 68,17 78.5,20.5 L79,25 C66,21.5 54,21.5 41,25 Z" fill="#E8437C"/>',
      acc: '<path d="M40,57 Q50,50 60,57 Q70,50 80,57 Q72,66 60,61.5 Q48,66 40,57 Z" fill="#2A1530"/>',
      collar: '<path d="M47,87 L60,104 L73,87 L66,87 L60,94 L54,87 Z" fill="#E8437C"/><circle cx="60" cy="96" r="3.4" fill="#FFC93C"/>',
      stache: true
    },
    { /* 6 — the Professor: bald pate, round glasses, bowtie + moustache */
      skin: "#F2B183", neck: "#D98E57", shirt: "#241331", hair: "#B9C7D6", brow: "#B9C7D6",
      mouth: "#7C2D3E", eye: "dark",
      back: '<path d="M31,52 C29,40 33,32 38,28 L40,44 C35,46 33,48 31,52 Z M89,52 C87,48 85,46 80,44 L82,28 C87,32 91,40 89,52 Z" fill="#B9C7D6"/>',
      front: "",
      acc: '<path d="M41,59 Q51,53 60,59 Q69,53 79,59 Q71,67 60,63 Q49,67 41,59 Z" fill="#B9C7D6"/>',
      glasses: "#FFC93C",
      collar: '<path d="M50,88 L70,88 L60,102 Z" fill="#FFF6E8"/><path d="M60,96 L48,89 Q44,96 48,103 Z" fill="#E8437C"/><path d="M60,96 L72,89 Q76,96 72,103 Z" fill="#E8437C"/><rect x="55.5" y="92.5" width="9" height="8" rx="3" fill="#FFC93C"/>',
      stache: true
    },
    { /* 7 — the Mod: sharp black bob, gold hoops, unhurried */
      skin: "#8A4B26", neck: "#6B3418", shirt: "#FF8C42", hair: "#17101F", brow: "#17101F",
      mouth: "#E8437C", eye: "cream",
      back: '<path d="M27,42 C25,14 42,5 60,5 C78,5 95,14 93,42 L95,80 C86,85 81,79 81.5,68 L82,42 L38,42 L38.5,68 C39,79 34,85 25,80 Z" fill="#17101F"/>',
      front: '<path d="M33,40 C34,20 46,13 60,13 C74,13 86,20 87,40 L87,33 L33,33 Z" fill="#17101F"/>',
      acc: '<circle cx="28.5" cy="66" r="4.6" fill="none" stroke="#FFC93C" stroke-width="2.4"/>' +
        '<circle cx="91.5" cy="66" r="4.6" fill="none" stroke="#FFC93C" stroke-width="2.4"/>',
      lips: true
    }
  ];
  function avFeatures(A, state) {
    var sweat = '<path d="M98,18 C104,29 106,35 98,41 C90,35 92,29 98,18 Z" fill="#7FD4FF"/><circle cx="95.5" cy="32" r="2" fill="#E8FAFF"/>';
    var eyeCol = A.eye === "cream" ? "#FFE9D6" : "#2A1530";
    var s = "";
    if (state === "cheer") {
      s += '<path d="M41,47 Q49,40 57,47" stroke="' + eyeCol + '" stroke-width="3.5" stroke-linecap="round" fill="none"/>' +
        '<path d="M63,47 Q71,40 79,47" stroke="' + eyeCol + '" stroke-width="3.5" stroke-linecap="round" fill="none"/>';
      if (!A.stache) s += '<path d="M44,58 Q60,80 76,58 Q60,67 44,58 Z" fill="' + A.mouth + '"/>' +
        '<path d="M52,68 Q60,74 68,68 Q60,71 52,68 Z" fill="#FF8FA3"/>';
      else s += '<path d="M50,66 Q60,74 70,66 Q60,69.5 50,66 Z" fill="' + A.mouth + '"/>';
    } else if (state === "slump") {
      s += '<rect x="39" y="35" width="16" height="5.5" rx="2.75" transform="rotate(16 47 38)" fill="' + A.brow + '"/>' +
        '<rect x="65" y="35" width="16" height="5.5" rx="2.75" transform="rotate(-16 73 38)" fill="' + A.brow + '"/>' +
        '<path d="M40,48 Q49,55 58,48" stroke="' + eyeCol + '" stroke-width="3.5" stroke-linecap="round" fill="none"/>' +
        '<path d="M62,48 Q71,55 80,48" stroke="' + eyeCol + '" stroke-width="3.5" stroke-linecap="round" fill="none"/>';
      if (!A.stache) s += '<path d="M48,66 Q55,62 60,66 Q65,70 72,66" stroke="' + A.mouth + '" stroke-width="3.5" stroke-linecap="round" fill="none"/>';
      s += sweat;
    } else {
      s += '<rect x="40" y="33" width="15" height="5.5" rx="2.75" transform="rotate(-6 47 36)" fill="' + A.brow + '"/>' +
        '<rect x="65" y="33" width="15" height="5.5" rx="2.75" transform="rotate(6 72 36)" fill="' + A.brow + '"/>';
      if (A.eye === "cream") {
        s += '<ellipse cx="49" cy="46" rx="6" ry="4.6" fill="#FFF6E8"/><ellipse cx="71" cy="46" rx="6" ry="4.6" fill="#FFF6E8"/>' +
          '<circle cx="49" cy="46" r="2.6" fill="#1D0D05"/><circle cx="71" cy="46" r="2.6" fill="#1D0D05"/>';
      } else {
        s += '<circle cx="49" cy="46" r="3.4" fill="#2A1530"/><circle cx="71" cy="46" r="3.4" fill="#2A1530"/>';
      }
      if (!A.stache) {
        if (A.lips) s += '<path d="M46,59 Q60,71 74,59 Q60,64 46,59 Z" fill="' + A.mouth + '"/>';
        else s += '<path d="M45,58 Q60,72 75,58 Q60,65 45,58 Z" fill="' + A.mouth + '"/>' +
          '<path d="M49,59.5 Q60,66 71,59.5 Q60,62.5 49,59.5 Z" fill="#FFF"/>';
      }
    }
    if (A.glasses) {
      s += '<g stroke="' + A.glasses + '" stroke-width="2.6" fill="none">' +
        '<circle cx="49" cy="46" r="10"/><circle cx="71" cy="46" r="10"/>' +
        '<path d="M59,46 L61,46 M39,44 L32,41 M81,44 L88,41"/></g>';
    }
    return s;
  }
  function avatarSVG(id, state, seat) {
    id = Number.isInteger(id) && id >= 0 && id < 8 ? id : 0;
    var A = AVATARS[id];
    var si = Number.isInteger(seat) ? ((seat % 4) + 4) % 4 : id % 4;
    var open = '<svg class="avatar" viewBox="0 0 120 124" aria-hidden="true">';
    var s = '<circle cx="60" cy="57" r="54" fill="' + PCHEAD[si] + '"/>' +
      '<circle cx="60" cy="57" r="54" fill="none" stroke="#FFC93C" stroke-width="2" opacity=".45"/>';
    if (state === "cheer") {
      s += '<path d="M20,102 Q0,80 6,52" stroke="' + A.shirt + '" stroke-width="13" stroke-linecap="round" fill="none"/>' +
        '<path d="M100,102 Q120,80 114,52" stroke="' + A.shirt + '" stroke-width="13" stroke-linecap="round" fill="none"/>' +
        '<circle cx="6" cy="47" r="8.5" fill="' + A.skin + '"/><circle cx="114" cy="47" r="8.5" fill="' + A.skin + '"/>';
    }
    s += A.back +
      '<path d="M14,124 Q18,90 60,88 Q102,90 106,124 Z" fill="' + A.shirt + '"/>' +
      '<path d="M14,124 Q18,90 60,88 L60,124 Z" fill="#000" opacity=".07"/>' +
      '<rect x="51" y="66" width="18" height="18" rx="6" fill="' + A.neck + '"/>' +
      '<circle cx="60" cy="46" r="28" fill="' + A.skin + '"/>' +
      A.front + avFeatures(A, state) + (A.acc || "") + (A.collar || "");
    if (state === "slump") return open + '<g transform="translate(0 5) rotate(3 60 60)">' + s + "</g></svg>";
    return open + s + "</svg>";
  }
  /* a snapshot player's portrait: their chosen avatar when the
     server sent a valid one, else the seat default — so an old
     server (no avatar field) renders exactly as before */
  function snapAvatar(p, i) {
    return p && Number.isInteger(p.avatar) && p.avatar >= 0 && p.avatar < 8 ? p.avatar : i % 8;
  }

  /* ---------- sound (synthesized with WebAudio only — no files) ---------- */
  var Snd = {
    ctx: null, master: null, _lw: -1, _noise: null, muted: false,
    init: function () { try { this.muted = localStorage.getItem("gh_mute") === "1"; } catch (e) {} },
    ensure: function () {
      if (this.ctx) { if (this.ctx.state === "suspended") { var pr = this.ctx.resume(); if (pr && pr.catch) pr.catch(function () {}); } return true; }
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.22;
        this.master.connect(this.ctx.destination);
        return true;
      } catch (e) { return false; }
    },
    tone: function (freq, dur, type, vol, delay, slideTo) {
      if (!this.ctx || this.ctx.state !== "running") return;
      var t0 = this.ctx.currentTime + (delay || 0);
      var o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || "triangle"; o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.5, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + dur + 0.05);
    },
    noise: function (dur, vol, freq) {
      if (!this.ctx || this.ctx.state !== "running") return;
      if (!this._noise) {
        var len = this.ctx.sampleRate, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        var d = buf.getChannelData(0); for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this._noise = buf;
      }
      var t0 = this.ctx.currentTime;
      var src = this.ctx.createBufferSource(); src.buffer = this._noise; src.loop = true;
      var f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 240;
      var g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.5, t0 + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t0); src.stop(t0 + dur + 0.05);
    },
    play: function (kind) {
      if (this.muted || !this.ctx || this.ctx.state !== "running") return;
      try {
        var i;
        if (kind === "theme") { var n = [196.0, 392.0, 523.25, 659.25, 783.99]; for (i = 0; i < n.length; i++) this.tone(n[i], 0.55, "triangle", 0.32, i * 0.09); this.tone(98.0, 0.9, "sine", 0.3, 0); }
        else if (kind === "correct") { this.tone(659.25, 0.16, "triangle", 0.4, 0); this.tone(987.77, 0.34, "triangle", 0.4, 0.09); }
        else if (kind === "gold") { var g = [1318.5, 1567.98, 2093.0]; for (i = 0; i < g.length; i++) this.tone(g[i], 0.22, "sine", 0.3, i * 0.06); }
        else if (kind === "wrong") { this.tone(220.0, 0.32, "sawtooth", 0.15, 0, 207.65); this.tone(110.0, 0.36, "sine", 0.3, 0.02); }
        else if (kind === "spin") { for (i = 0; i < 5; i++) this.tone(520 + i * 90, 0.07, "square", 0.07, i * 0.09); }
        else if (kind === "vote") { this.tone(392.0, 0.12, "triangle", 0.32, 0); this.tone(392.0, 0.12, "triangle", 0.32, 0.45); this.tone(392.0, 0.12, "triangle", 0.32, 0.9); this.tone(783.99, 0.42, "triangle", 0.36, 1.35); }
        else if (kind === "finale") { var c = [523.25, 659.25, 783.99, 1046.5]; for (i = 0; i < c.length; i++) this.tone(c[i], 1.5, "triangle", 0.19, i * 0.05); this.tone(261.63, 1.6, "sine", 0.22, 0); }
        else if (kind === "tick") { this.tone(64.0, 0.07, "sine", 0.5, 0); }
      } catch (e) {}
    },
    setMuted: function (m) { this.muted = m; try { localStorage.setItem("gh_mute", m ? "1" : "0"); } catch (e) {} }
  };
  Snd.init();

  /* ---------- production state (Pass 3 machinery, format-neutral) ---------- */
  var dispScore = [], writtenScore = [];
  var pageHidden = false, lastShownValue = null, coldTimer = null;
  var spinTimer = null, voteTimer = null;
  function setLight(state) { var g = $("scr-game"); if (g) g.setAttribute("data-light", state); }
  /* fortune rail: displayed totals tween toward real scores */
  function stepFortune(dt) {
    if (!G) return;
    G.players.forEach(function (p, i) {
      if (dispScore[i] == null) dispScore[i] = p.score;
      var diff = p.score - dispScore[i];
      if (diff !== 0) {
        dispScore[i] += diff * Math.min(1, dt * 7);
        if (Math.abs(p.score - dispScore[i]) < 1) dispScore[i] = p.score;
      }
      var seat = document.querySelector('.seat[data-seat="' + i + '"]');
      if (!seat) return;
      if (diff > 0.5) { seat.classList.add("tick-up"); seat.classList.remove("tick-down"); }
      else if (diff < -0.5) { seat.classList.add("tick-down"); seat.classList.remove("tick-up"); }
      else { seat.classList.remove("tick-up"); seat.classList.remove("tick-down"); }
      var txt = money(Math.round(dispScore[i]));
      if (writtenScore[i] !== txt) {
        writtenScore[i] = txt;
        var sc = seat.querySelector(".seat-score"); if (sc) sc.textContent = txt;
      }
    });
  }
  /* live question value: the very figure the reveal banks (elapsed-based decay) */
  function drawValue() {
    var vEl = $("qValue");
    if (!vEl || !G || !G.cur || G.cur.value <= 0 || G.cur.betRound) return;
    var v = earned(G.cur.value, G.cur.elapsed, G.cur.clockTotal || QTIME);
    if (v !== lastShownValue) {
      lastShownValue = v;
      vEl.textContent = money(v);
      var wrap = vEl.parentElement;
      if (wrap) {
        wrap.classList.toggle("low", v <= G.cur.value * 0.6);
        wrap.classList.remove("bump"); void wrap.offsetWidth; wrap.classList.add("bump");
      }
    }
  }
  /* gold leaf finale — pooled particles, capped, no per-frame allocation.
     Pass P: three depths (far/mid/near — size, speed and alpha ride the
     depth), leaf-shaped flecks among the rounds, and gold runs heavy. */
  var leaves = { active: false, parts: [], cv: null, cx: null, dpr: 1 };
  var LEAF_COLORS = ["#E8437C", "#2E9BFF", "#9B5DE5", "#FF8C42", "#3ECF6E", "#FFC93C", "#17BEBB", "#FFD76A", "#FFB03A", "#FFE29A"];
  var LEAF_GOLD = [5, 7, 8, 9];
  var LEAF_DEPTH_SIZE = [0.55, 1, 1.55], LEAF_DEPTH_SPEED = [0.55, 1, 1.5], LEAF_DEPTH_ALPHA = [0.45, 0.8, 0.95];
  function resetLeaf(p, scatter) {
    var cv = leaves.cv; if (!cv) return;
    var ds = LEAF_DEPTH_SIZE[p.depth];
    p.x = Math.random() * cv.width;
    p.y = scatter ? Math.random() * cv.height : -20 - Math.random() * 60;
    p.w = (4 + Math.random() * 6) * ds; p.h = p.w * 1.5;
    p.vy = (26 + Math.random() * 34) * LEAF_DEPTH_SPEED[p.depth]; p.ph = Math.random() * 6.28;
    p.rot = Math.random() * 6.28; p.vr = (Math.random() - 0.5) * 2.4;
    p.col = Math.random() < 0.45 ? LEAF_GOLD[ri(LEAF_GOLD.length)] : ri(LEAF_COLORS.length);
  }
  function startLeaves() {
    var cv = $("leafCanvas"); if (!cv) return;
    leaves.dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.floor(window.innerWidth * leaves.dpr);
    cv.height = Math.floor(window.innerHeight * leaves.dpr);
    leaves.cv = cv; leaves.cx = cv.getContext("2d");
    if (!leaves.parts.length) {
      for (var i = 0; i < 56; i++) leaves.parts.push({ x: 0, y: 0, w: 5, h: 8, vy: 0, ph: 0, rot: 0, vr: 0, col: 0, depth: i % 3, leaf: i % 5 < 2 });
      leaves.parts.forEach(function (p) { resetLeaf(p, true); });
    }
    leaves.active = true; cv.classList.add("on");
  }
  function stepLeaves(dt) {
    if (!leaves.active || !leaves.cx) return;
    var cx = leaves.cx, cv = leaves.cv, dpr = leaves.dpr;
    cx.clearRect(0, 0, cv.width, cv.height);
    leaves.parts.forEach(function (p) {
      p.ph += dt * 1.6; p.rot += p.vr * dt;
      p.y += p.vy * dpr * dt; p.x += Math.sin(p.ph) * 22 * dpr * dt;
      if (p.y > cv.height + 24) resetLeaf(p, false);
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot);
      cx.fillStyle = LEAF_COLORS[p.col]; cx.globalAlpha = LEAF_DEPTH_ALPHA[p.depth];
      var flut = 0.35 + 0.65 * Math.abs(Math.sin(p.ph));
      if (p.leaf) {
        cx.beginPath();
        cx.ellipse(0, 0, p.w * dpr * 0.5, p.h * dpr * 0.5 * flut, 0, 0, 6.2832);
        cx.fill();
      } else {
        cx.fillRect(-p.w * dpr / 2, -p.h * dpr / 2, p.w * dpr, p.h * dpr * flut);
      }
      cx.restore();
    });
    cx.globalAlpha = 1;
  }
  function stopLeaves() { leaves.active = false; var cv = $("leafCanvas"); if (cv) cv.classList.remove("on"); }

  /* ================= Pass P — polish effects =================
     All pooled, all event-driven except the stage's own breathing
     (CSS) and the dust motes. Nothing here allocates per frame. */

  /* ---- dust motes in the stage light (26 pooled motes) ---- */
  var MOTES = 26;
  var motes = { parts: [], cv: null, cx: null, dpr: 1 };
  function sizeMotes() {
    var cv = $("moteCanvas"); if (!cv) return;
    motes.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    cv.width = Math.floor(window.innerWidth * motes.dpr);
    cv.height = Math.floor(window.innerHeight * motes.dpr);
    motes.cv = cv; motes.cx = cv.getContext("2d");
    if (!motes.parts.length) {
      for (var i = 0; i < MOTES; i++) {
        motes.parts.push({
          x: Math.random(), y: Math.random(), r: 0.8 + Math.random() * 1.5,
          vy: 3 + Math.random() * 7, ph: Math.random() * 6.28, sw: 4 + Math.random() * 9
        });
      }
    }
  }
  function stepMotes(dt) {
    var g = $("scr-game");
    if (!g || !g.classList.contains("active")) return;
    if (!motes.cx) sizeMotes();
    if (!motes.cx) return;
    var cx = motes.cx, cv = motes.cv, dpr = motes.dpr, W = cv.width, H = cv.height;
    cx.clearRect(0, 0, W, H);
    cx.fillStyle = "#FFD478";
    for (var i = 0; i < motes.parts.length; i++) {
      var p = motes.parts[i];
      p.ph += dt * 0.7; p.y -= p.vy * dt / H;
      if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
      var tw = 0.10 + 0.16 * (0.5 + 0.5 * Math.sin(p.ph * 1.7));
      cx.globalAlpha = tw;
      cx.beginPath();
      cx.arc((p.x + Math.sin(p.ph) * p.sw / W) * W, p.y * H, p.r * dpr, 0, 6.2832);
      cx.fill();
    }
    cx.globalAlpha = 1;
  }

  /* ---- Sterling, alive: timed expression classes on the host face ---- */
  var stFx = { nextBlink: 0 };
  function stClass(cls, ms) {
    var g = $("scr-game"); if (!g) return;
    g.classList.add(cls);
    setTimeout(function () { g.classList.remove(cls); }, ms);
  }
  function stepSterling(t) {
    if (!stFx.nextBlink) { stFx.nextBlink = t + 2400; return; }
    if (t < stFx.nextBlink) return;
    stFx.nextBlink = t + 2900 + Math.random() * 4400;
    var g = $("scr-game");
    if (g && g.classList.contains("active")) stClass("st-blink", 150);
  }

  /* ---- the landing bloom: the category's colour washes the stage ---- */
  function stageBloom(cat) {
    var b = $("bloom"); if (!b) return;
    var cs = catStyle(cat);
    b.style.background = "radial-gradient(52% 46% at 50% 40%, rgba(" + cs.rgb + ",.5), rgba(" + cs.rgb + ",0) 70%)";
    b.classList.remove("on"); void b.offsetWidth; b.classList.add("on");
    setTimeout(function () { b.classList.remove("on"); }, 1050);
  }

  /* ---- money you can see move: pooled coin flights (cap 42) ---- */
  var COINS = 42;
  var coins = { parts: [], cv: null, cx: null, dpr: 1, busy: false };
  (function () {
    for (var i = 0; i < COINS; i++) coins.parts.push({ on: false, t: 0, dur: 0, delay: 0, linger: 0, x0: 0, y0: 0, cx: 0, cy: 0, x1: 0, y1: 0, spin: 0, flight: null });
  })();
  function coinCanvas() {
    var cv = $("coinCanvas"); if (!cv) return null;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.floor(window.innerWidth * dpr), h = Math.floor(window.innerHeight * dpr);
    if (coins.cv !== cv || cv.width !== w || cv.height !== h) {
      cv.width = w; cv.height = h; coins.cv = cv; coins.cx = cv.getContext("2d"); coins.dpr = dpr;
    }
    return cv;
  }
  function coinFlight(x0, y0, x1, y1, n, baseDelay, onArrive) {
    var cv = coinCanvas(); if (!cv) { if (onArrive) onArrive(); return; }
    cv.classList.add("on"); coins.busy = true;
    var flight = { left: 0, onArrive: onArrive };
    for (var i = 0; i < coins.parts.length && flight.left < n; i++) {
      var p = coins.parts[i];
      if (p.on) continue;
      p.on = true; p.t = 0; p.linger = 0.14; p.flight = flight;
      p.dur = 0.68 + Math.random() * 0.18;
      p.delay = baseDelay + flight.left * 0.05;
      p.x0 = x0 + (Math.random() - 0.5) * 26; p.y0 = y0 + (Math.random() - 0.5) * 14;
      p.x1 = x1; p.y1 = y1;
      p.cx = (p.x0 + x1) / 2 + (Math.random() - 0.5) * 30;
      p.cy = Math.min(p.y0, y1) - 80 - Math.random() * 60;
      p.spin = Math.random() * 6.28;
      flight.left++;
    }
    if (!flight.left && onArrive) onArrive();
  }
  function stepCoins(dt) {
    if (!coins.busy) return;
    var cx = coins.cx, cv = coins.cv;
    if (!cx || !cv) { coins.busy = false; return; }
    var dpr = coins.dpr;
    cx.clearRect(0, 0, cv.width, cv.height);
    var anyOn = false;
    for (var i = 0; i < coins.parts.length; i++) {
      var p = coins.parts[i];
      if (!p.on) continue;
      anyOn = true;
      if (p.delay > 0) { p.delay -= dt; continue; }
      if (p.t < 1) {
        p.t = Math.min(1, p.t + dt / p.dur);
        if (p.t >= 1 && p.flight) {
          var fl = p.flight; p.flight = null; fl.left--;
          if (fl.left <= 0 && fl.onArrive) { var cb = fl.onArrive; fl.onArrive = null; cb(); }
        }
      } else {
        p.linger -= dt;
        if (p.linger <= 0) { p.on = false; continue; }
      }
      var t = p.t, u = 1 - t;
      var x = (u * u * p.x0 + 2 * u * t * p.cx + t * t * p.x1) * dpr;
      var y = (u * u * p.y0 + 2 * u * t * p.cy + t * t * p.y1) * dpr;
      var sq = Math.abs(Math.cos(p.spin + t * 9));
      cx.save(); cx.translate(x, y); cx.scale(Math.max(0.18, sq), 1);
      cx.beginPath(); cx.arc(0, 0, 8.5 * dpr, 0, 6.2832);
      cx.fillStyle = "#D9930D"; cx.fill();
      cx.beginPath(); cx.arc(0, 0, 6.8 * dpr, 0, 6.2832);
      cx.fillStyle = "#FFC93C"; cx.fill();
      cx.beginPath(); cx.arc(-1.6 * dpr, -1.6 * dpr, 3.4 * dpr, 0, 6.2832);
      cx.fillStyle = "#FFE29A"; cx.fill();
      cx.restore();
    }
    if (!anyOn) { coins.busy = false; cv.classList.remove("on"); cx.clearRect(0, 0, cv.width, cv.height); }
  }
  /* ---- the finale ceremony: seal stamp, the tip, the spotlight ---- */
  function finaleCeremony() {
    var g = $("scr-game");
    if (g) g.classList.add("sealed");
    stClass("st-tip", 1700);
    requestAnimationFrame(function () {
      var cone = document.querySelector(".spot-cone");
      var pod = document.querySelector(".finale-row .winner-podium");
      var wrap = document.querySelector(".finale-wrap");
      if (!cone || !pod || !wrap) return;
      var wr = wrap.getBoundingClientRect(), pr = pod.getBoundingClientRect();
      cone.style.left = ((pr.left + pr.width / 2 - wr.left) / wr.width * 100) + "%";
      cone.style.top = "2px";
      cone.style.height = Math.max(60, pr.top - wr.top - 6) + "px";
      cone.style.width = (pr.width * 2.1) + "px";
      cone.classList.add("on");
    });
  }

  /* a bank lands: coins arc from the answer to the seat, then the
     seat's score shimmers as the count-up runs */
  function bankFx(seatIdx, delayBase) {
    var from = document.querySelector(".ans-btn.correct") || document.querySelector(".wager-amt") || document.querySelector("#stage .delta");
    var seat = document.querySelector('.seat[data-seat="' + seatIdx + '"]');
    if (!seat) return;
    var toEl = seat.querySelector(".seat-score") || seat;
    var tr = toEl.getBoundingClientRect();
    var tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
    var fx = tx, fy = ty - 140;
    if (from) { var fr = from.getBoundingClientRect(); fx = fr.left + fr.width / 2; fy = fr.top + fr.height / 2; }
    coinFlight(fx, fy, tx, ty, 9, delayBase || 0, function () {
      var s2 = document.querySelector('.seat[data-seat="' + seatIdx + '"]');
      if (!s2) return;
      s2.classList.remove("banking"); void s2.offsetWidth; s2.classList.add("banking");
      setTimeout(function () { s2.classList.remove("banking"); }, 950);
    });
  }

  /* ---- the laurel: one marker that travels to whoever leads ---- */
  var LAUREL_SVG = '<svg viewBox="0 0 40 40" aria-hidden="true">' +
    '<g fill="none" stroke="#FFC93C" stroke-width="2.1" stroke-linecap="round">' +
    '<path d="M13,33 C7,27 5,17 9,7"/><path d="M27,33 C33,27 35,17 31,7"/></g>' +
    '<g fill="#FFC93C">' +
    '<ellipse cx="8.5" cy="24" rx="2.1" ry="3.6" transform="rotate(-24 8.5 24)"/>' +
    '<ellipse cx="10.5" cy="15.5" rx="2.1" ry="3.6" transform="rotate(-38 10.5 15.5)"/>' +
    '<ellipse cx="15" cy="8.5" rx="2.1" ry="3.6" transform="rotate(-58 15 8.5)"/>' +
    '<ellipse cx="31.5" cy="24" rx="2.1" ry="3.6" transform="rotate(24 31.5 24)"/>' +
    '<ellipse cx="29.5" cy="15.5" rx="2.1" ry="3.6" transform="rotate(38 29.5 15.5)"/>' +
    '<ellipse cx="25" cy="8.5" rx="2.1" ry="3.6" transform="rotate(58 25 8.5)"/></g>' +
    '<path d="M20,3.4 L21.4,7 L25,7.2 L22.2,9.4 L23.1,12.8 L20,10.9 L16.9,12.8 L17.8,9.4 L15,7.2 L18.6,7 Z" fill="#FFE29A"/></svg>';
  var laurelState = { seat: -1 };
  function laurelBadge() { return '<span class="laurel-badge">' + LAUREL_SVG + "</span>"; }
  function updateLaurel(source) {
    var wrap = $("laurel"); if (!wrap) return;
    if (!wrap.innerHTML) wrap.innerHTML = LAUREL_SVG;
    var players = null;
    if (source === "og") players = OG ? OG.players : null;
    else if (source === "table") players = G ? G.players : null;
    else players = ghMode === "host" ? (OG ? OG.players : null) : (G ? G.players : null);
    var lead = -1, best = 0;
    if (players) {
      players.forEach(function (p, i) { if (p && p.score > best) { best = p.score; lead = i; } });
    }
    var table = $("table");
    var seat = lead >= 0 ? document.querySelector('.seat[data-seat="' + lead + '"]') : null;
    if (!seat || !table) {
      wrap.classList.add("off"); laurelState.seat = -1; return;
    }
    var ava = seat.querySelector(".seat-ava") || seat;
    var tr = table.getBoundingClientRect(), ar = ava.getBoundingClientRect();
    var snap = laurelState.seat === -1;
    wrap.classList.toggle("snap", snap);
    wrap.style.left = (ar.left + ar.width / 2 - tr.left) + "px";
    wrap.style.top = (ar.top - tr.top + 6) + "px";
    wrap.classList.remove("off");
    if (snap) { void wrap.offsetWidth; wrap.classList.remove("snap"); }
    laurelState.seat = lead;
  }

  /* ---------- bank / deck ---------- */
  var BANK = (window.GH_BANK || []).map(function (q, i) { q.id = i; return q; });
  var CATS = []; BANK.forEach(function (q) { if (CATS.indexOf(q.cat) < 0) CATS.push(q.cat); });
  var seen = {};
  try { (JSON.parse(localStorage.getItem("gh_seen_v1") || "[]")).forEach(function (id) { seen[id] = 1; }); } catch (e) {}
  function saveSeen() {
    try { localStorage.setItem("gh_seen_v1", JSON.stringify(Object.keys(seen).map(Number))); } catch (e) {}
  }
  var pools = {}; // "cat|diff" -> shuffled [ids] — multiple-choice questions only
  function poolFor(cat, diff) {
    var key = cat + "|" + diff;
    if (!pools[key]) {
      var ids = BANK.filter(function (q) { return q.cat === cat && q.diff === diff && !q.kind; }).map(function (q) { return q.id; });
      var fresh = ids.filter(function (id) { return !seen[id]; });
      pools[key] = shuffle(fresh.length >= 1 ? fresh : ids.slice());
    }
    return pools[key];
  }
  function drawQuestion(cat, diff) {
    var p = poolFor(cat, diff);
    if (!p.length) { p = poolFor(cat, diff); } // rebuilt above on exhaustion
    if (!p.length) { // fall back: any unseen question of this difficulty, then any at all
      var any = BANK.filter(function (q) { return q.diff === diff && !q.kind && !seen[q.id]; });
      if (!any.length) any = BANK.filter(function (q) { return !q.kind; });
      var q = pick(any); seen[q.id] = 1; return q;
    }
    var id = p.pop(); seen[id] = 1;
    return BANK[id];
  }
  /* the five guess slots: kinds PINNED to the slots in GUESS_SLOTS
     order — Round 1's two are closest-number, Round 2's two are
     surveys, Round 3's one is the swing (num or survey) — because
     Sterling's Round 1 intro promises the table exactly two
     closest-number questions, and his stated rules stay true every
     show. Ids drawn per kind, unseen preferred. */
  function buildGuessSchedule() {
    function idsFor(kind) {
      var all = BANK.filter(function (q) { return q.kind === kind; }).map(function (q) { return q.id; });
      var fresh = all.filter(function (id) { return !seen[id]; });
      return shuffle(fresh.length ? fresh : all.slice());
    }
    var nums = idsFor("num"), survs = idsFor("survey");
    var kinds = ["num", "num", "survey", "survey", rng() < 0.5 ? "num" : "survey"];
    var map = {};
    GUESS_SLOTS.forEach(function (slot, i) {
      var src = kinds[i] === "num" ? nums : survs;
      if (!src.length) src = kinds[i] === "num" ? survs : nums;
      var id = src.pop();
      if (id == null) return;
      map[slot] = id; seen[id] = 1;
    });
    return map;
  }

  /* ---------- game state ---------- */
  var G = null;
  function newGame(names) {
    return {
      players: names.map(function (nm, i) {
        return { name: nm, color: PCOLORS[i], score: 0, cut: 1, bet: 1, avatar: tableAvatars[i] != null ? tableAvatars[i] : i };
      }),
      round: 1, qInRound: 0,
      showId: null,             // per-show key for the live Sterling lines
      bankedOnce: false, bigLeadDone: false, // live-beat latches (Pass 5)
      phase: "intro",           // intro|spin|bet|question|vote-count|vote|reveal|over
      cur: null,                // current question runtime
      guess: null,              // "round:qInRound" -> bank id for the 5 guess slots
      lastStand: {              // standings snapshot for race delta chips
        scores: names.map(function () { return 0; }),
        ranks: names.reduce(function (m, _n, i) { m[i] = i; return m; }, {})
      }
    };
  }

  /* ---------- Pass D4: one scoring grammar for every host reveal ----------
     bank -> a gold "+$N" (.seat-delta.bank) rises from the seat while the
             coins fly (bankFx) and the score counts up under its shimmer
     miss -> a muted "$0" (.seat-delta.miss) falls away from the seat
     guess questions (num + survey): banking seats also wear a CLOSEST
     chip beside the name for the whole reveal, so the room sees WHY.
     Each reveal rebuilds a descriptor (seat -> treatment); the seat
     renderers paint it whenever the phase is "reveal", so a mid-reveal
     re-render (an online snapshot, a seat going AWAY) repaints the
     same grammar instead of wiping it. */
  var tableFx = null, ogFx = null;
  function decorateSeat(s, fx) {
    if (!fx) return;
    if (fx.closest) {
      var nm = s.querySelector(".seat-name");
      if (nm) {
        var tg = document.createElement("span");
        tg.className = "closest-tag";
        tg.textContent = "CLOSEST";
        nm.appendChild(tg);
      }
    }
    if (fx.delta) {
      var desk = s.querySelector(".desk");
      var d = document.createElement("span");
      d.className = "seat-delta " + fx.delta;
      d.textContent = fx.delta === "bank" ? mplus(fx.amt) : "$0";
      d.style.animationDelay = (fx.delay || 0) + "s";
      /* The span rides the SEAT, not the desk: the desk's clip-path
         trapezoid clips any child painted above its top edge. Its
         height comes from the desk's offset, so it still floats
         exactly off the desk's top-centre in every layout. */
      d.style.top = ((desk ? desk.offsetTop : 0) - 13) + "px";
      s.appendChild(d);
    }
  }

  /* ---------- seats (the podium row) ---------- */
  function seatsVisible(v) { var g = $("scr-game"); if (g) g.classList.toggle("noseats", !v); }
  function renderSeats() {
    var top = $("seatsTop"), bot = $("seatsBottom");
    top.innerHTML = ""; bot.innerHTML = "";
    if (!G) return;
    var bestScore = Math.max.apply(null, G.players.map(function (x) { return x.score; }));
    G.players.forEach(function (p, i) {
      var shown = money(Math.round(dispScore[i] != null ? dispScore[i] : p.score));
      writtenScore[i] = shown;
      var state = "neutral";
      if (G.phase === "reveal" && G.cur && G.cur.marks) state = G.cur.marks[i] ? "cheer" : "slump";
      var s = el('<div class="seat pod' + i + '" data-seat="' + i + '">' +
        '<div class="seat-ava">' + avatarSVG(snapAvatar(p, i), state, i) + "</div>" +
        '<div class="desk"><span class="seat-name">' + esc(p.name) + '</span>' +
        '<span class="seat-score">' + shown + '</span>' +
        '<span class="tag">' + tagsFor(i) + "</span></div></div>");
      if (p.score === bestScore && bestScore > 0) s.classList.add("lead");
      if (G.cur && G.cur.marks && G.cur.marks[i]) s.classList.add("gotit");
      if (G.phase === "reveal" && tableFx) decorateSeat(s, tableFx.seats[i]);
      s.addEventListener("click", function () { onSeatTap(i); });
      bot.appendChild(s);
    });
    updateLaurel("table");
  }
  function tagsFor(i) {
    var p = G.players[i], t = [];
    t.push(p.cut > 0 ? "CUT TWO" : "CUT SPENT");
    if (G.round === 3) t.push("BET " + p.bet + (p.bet === 1 ? " CHIP" : " CHIPS"));
    return t.join(" · ");
  }
  function onSeatTap(i) {
    if (!G || !G.cur || G.phase !== "vote") return;
    if (G.cur.marks[i]) delete G.cur.marks[i]; else G.cur.marks[i] = 1;
    renderSeats();
  }

  /* ---------- clock ---------- */
  var clock = { left: 0, total: 0, running: false, onEnd: null };
  function startClock(seconds, onEnd) {
    clock.left = seconds; clock.total = seconds; clock.running = true; clock.onEnd = onEnd;
    Snd._lw = -1;
    drawClock();
  }
  function stopClock() { clock.running = false; var d = $("dangerFx"); if (d) d.classList.remove("on"); }
  var lastT = 0;
  function loop(t) {
    var dt = Math.min((t - lastT) / 1000 || 0, 0.1); lastT = t;
    if (clock.running && G && G.cur) {
      clock.left -= dt; G.cur.elapsed += dt;
      if (clock.left <= 0) { clock.left = 0; clock.running = false; drawClock(); if (clock.onEnd) clock.onEnd(); }
      else drawClock();
    }
    if (!pageHidden) { stepFortune(dt); drawValue(); stepLeaves(dt); stepMotes(dt); stepCoins(dt); stepSterling(t); }
    requestAnimationFrame(loop);
  }
  function drawClock() {
    var num = $("timerNum"), ring = $("timerProg");
    if (!num || !ring) return;
    var C = 2 * Math.PI * 30;
    var frac = clock.total ? clock.left / clock.total : 0;
    ring.style.strokeDashoffset = String(C * (1 - frac));
    num.textContent = String(Math.ceil(clock.left));
    $("timerSvg").classList.toggle("low", clock.left <= 5.05);
    var dfx = $("dangerFx");
    if (dfx) dfx.classList.toggle("on", clock.running && clock.left <= 5.05 && clock.left > 0);
    if (clock.running) {
      var w = Math.ceil(clock.left);
      if (w !== Snd._lw) { Snd._lw = w; if (w <= 10 && w >= 1) Snd.play("tick"); }
    }
  }
  function timerHTML() {
    var C = (2 * Math.PI * 30).toFixed(1);
    return '<div class="timer-wrap"><svg id="timerSvg" class="timer-ring" width="76" height="76" viewBox="0 0 76 76">' +
      '<circle class="track" cx="38" cy="38" r="30" fill="none" stroke-width="5"></circle>' +
      '<circle id="timerProg" class="prog" cx="38" cy="38" r="30" fill="none" stroke-width="5" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="0"></circle>' +
      '<text id="timerNum" class="timer-num" x="38" y="44" transform="rotate(90 38 38)">20</text></svg></div>';
  }

  /* ---------- stage ---------- */
  function stage(html) { var st = $("stage"); st.innerHTML = '<div class="stage-inner enter">' + html + "</div>"; st.scrollTop = 0; }
  function standingsHTML() {
    var order = G.players.map(function (p, i) { return i; }).sort(function (a, b) { return G.players[b].score - G.players[a].score; });
    var ranks = {}; order.forEach(function (pi, pos) { ranks[pi] = pos; });
    var prev = G.lastStand;
    var disp = order.slice();
    if (disp.length > 1) { var t = disp[0]; disp[0] = disp[1]; disp[1] = t; } // 2nd, 1st, 3rd, 4th
    var pods = disp.map(function (pi) {
      var p = G.players[pi], pos = ranks[pi];
      var chips = "";
      if (prev) {
        var gain = p.score - prev.scores[pi];
        var rd = prev.ranks[pi] - pos;
        if (gain > 0) chips += '<span class="gain-chip">' + mplus(gain) + "</span>";
        if (rd > 0) chips += '<span class="delta up">▲ ' + rd + "</span>";
        else if (rd < 0) chips += '<span class="delta down">▼ ' + (-rd) + "</span>";
      }
      var badgeCls = pos === 0 ? "gold" : pos === 1 ? "silver" : pos === 2 ? "bronze" : "plain";
      return '<div class="podium pod' + pi + " big rank" + (pos + 1) + (pos === 0 ? " lit" : "") + '">' +
        '<span class="rank-badge ' + badgeCls + '">' + (pos + 1) + "</span>" + (pos === 0 ? laurelBadge() : "") + chips +
        avatarSVG(snapAvatar(p, pi), pos === 0 ? "cheer" : "neutral", pi) +
        '<div class="desk"><div class="pname">' + esc(p.name) + '</div><div class="pmoney">' + money(p.score) + "</div></div></div>";
    }).join("");
    var leadName = G.players[order[0]].name, lastName = G.players[order[order.length - 1]].name;
    var line = order[0] === order[order.length - 1]
      ? "Dead level at the top. The kitchen is everybody's tonight."
      : esc(leadName) + " is cooking. " + esc(lastName) + " — the kitchen is still open.";
    G.lastStand = { scores: G.players.map(function (p) { return p.score; }), ranks: ranks };
    return '<div class="race-wrap"><div class="race-stage">' +
      '<div class="race-sterling"><div class="bubble bubble-stand">' + line + "</div>" + sterlingSVG("smirk") + "</div>" +
      '<div class="race-podiums">' +
      '<svg class="swap-arrows" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="M28,34 Q40,4 54,10" fill="none" stroke="#35D461" stroke-width="1.1" stroke-linecap="round" stroke-dasharray="3 2.6" opacity=".55"/>' +
      '<path d="M54,10 l-4.4,.4 M54,10 l-1.2,4.2" stroke="#35D461" stroke-width="1.1" stroke-linecap="round" opacity=".55"/>' +
      '<path d="M58,8 Q70,32 82,28" fill="none" stroke="#FF6B5E" stroke-width="1.1" stroke-linecap="round" stroke-dasharray="3 2.6" opacity=".45"/></svg>' +
      pods + "</div></div></div>";
  }
  function updateTop() {
    var labels = { 1: "ROUND 1 · THE WARM-UP", 2: "ROUND 2 · DOUBLE MONEY", 3: "ROUND 3 · THE BIG FINISH" };
    $("roundLabel").textContent = labels[G.round];
    var n = G.round === 1 ? G.qInRound + 1 : G.round === 2 ? R1_COUNT + G.qInRound + 1 : R1_COUNT + R2_COUNT + G.qInRound + 1;
    $("qCounter").textContent = "QUESTION " + Math.min(n, 15) + " OF 15";
  }
  function speedFrac(elapsed, total) { return Math.max(0, Math.min(1, 1 - elapsed / total)); }
  function earned(value, elapsed, total) { return round10(value * (0.5 + 0.5 * speedFrac(elapsed, total))); }

  /* ---------- show flow ---------- */
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(function (s) { s.classList.remove("active"); });
    $(id).classList.add("active");
    if (id === "scr-title") { var g = $("scr-game"); if (g) g.classList.remove("sealed"); }
  }
  function startShow(names) {
    G = newGame(names);
    G.showId = "table-" + Date.now().toString(36) + "-" + ri(1000000);
    pools = {};
    resetLineBags();
    G.guess = buildGuessSchedule();
    showScreen("scr-game");
    $("scr-game").classList.remove("sealed");
    setLight("open");
    stopLeaves();
    dispScore = G.players.map(function () { return 0; });
    writtenScore = [];
    prefetchShowLines(names);
    sayLive("greeting", { names: names.slice() }, authoredLine("open"),
      { window: 2500, guard: function () { return !!G && G.phase === "coldopen"; } });
    fetchNightlyForShow(G.showId);
    renderSeats(); updateTop();
    Snd.ensure(); Snd.play("theme");
    G.phase = "coldopen";
    var letters = "THE GILDED HOUR".split("").map(function (ch, i) {
      return '<span class="co-l" style="animation-delay:' + (i * 45) + 'ms">' + (ch === " " ? "&nbsp;" : ch) + "</span>";
    }).join("");
    stage('<div class="coldopen"><div class="co-marquee marquee"><div class="co-sweep"></div>' +
      '<div class="co-kicker">STERLING PRESENTS</div>' +
      '<div class="co-title">' + letters + "</div>" +
      '<div class="co-sub">Fifteen questions · everybody plays · the clock is money</div></div></div>');
    buildBulbs(document.querySelector(".co-marquee"));
    seatsVisible(false);
    coldTimer = setTimeout(function () { if (G && G.phase === "coldopen") roundIntro(); }, 2100);
  }
  function roundIntro() {
    G.phase = "intro"; setLight(G.round === 1 ? "open" : G.round === 2 ? "hot" : "vault");
    seatsVisible(false);
    updateTop(); renderSeats();
    var titles = { 1: "THE WARM-UP", 2: "DOUBLE MONEY", 3: "THE BIG FINISH" };
    var texts = {
      1: "Six questions, and everybody answers every one. Sterling spins the category — the wheel and he have an understanding. Easy pays $100, medium $200, hard $300, and the value drains while the room thinks, so commit early. When the clock stops: fingers up, show 1, 2, 3 or 4. Everyone holding the right fingers banks the money. Twice this round, a closest-number question: no options, just shout a number — the nearest shout takes it.",
      2: "Same game, double money — $200, $400, $600. Your one lifeline is live: each of you holds a single Cut Two for the whole show. Call it before the fingers go up and two wrong answers vanish for everybody. Spend it like it's the last one. It is.",
      3: "Three questions. Before each one, bet on yourself out loud: 1, 2 or 3 chips — a chip is $100. Get it right and the bet pays in full: no drain, no deductions. Get it wrong and you lose nothing but face. Nobody leaves this show poorer than they arrived. That is the whole trick of it."
    };
    stage('<div class="bumper"><div class="round-kicker">ROUND ' + G.round + "</div>" +
      '<div class="round-title">' + titles[G.round] + "</div>" +
      '<p class="round-text">' + texts[G.round] + "</p>" +
      (G.round > 1 ? standingsHTML() : "") +
      '<button class="btn-gold" id="btnRoundGo">' + (G.round === 1 ? "START THE WARM-UP" : G.round === 2 ? "DOUBLE IT" : "TO THE BIG FINISH") + "</button></div>");
    hostSay("r" + G.round);
    $("btnRoundGo").addEventListener("click", function () { nextQuestion(); });
  }
  function nextQuestion() {
    if (G.round === 1 && G.qInRound >= R1_COUNT) { G.round = 2; G.qInRound = 0; roundIntro(); return; }
    if (G.round === 2 && G.qInRound >= R2_COUNT) { G.round = 3; G.qInRound = 0; roundIntro(); return; }
    if (G.round === 3 && G.qInRound >= R3_COUNT) { finishShow(); return; }
    var gid = G.guess ? G.guess[G.round + ":" + G.qInRound] : null;
    if (gid != null) G.cur = makeCur(BANK[gid], BANK[gid].kind);
    else if (G.round === 1 && G.qInRound === 2 && nightlyState.data && nightlyState.key === G.showId) G.cur = makeCurServed(nightlyState.data);
    else G.cur = makeCur(drawNormal(), "mcq");
    if (G.round === 3) betBeat(); else spinBeat();
  }
  function drawNormal() {
    var pat = G.round === 1 ? R1_DIFFS : G.round === 2 ? R2_DIFFS : R3_DIFFS;
    return drawQuestion(pick(CATS), pat[G.qInRound] || "medium");
  }
  function makeCur(q, kind) {
    var diff = q.diff || "medium";
    var betRound = G.round === 3;
    var cur = {
      q: q, kind: kind, cat: q.cat, diff: diff,
      value: betRound ? 0 : BASE_VALUES[diff] * (G.round === 2 ? 2 : 1),
      elapsed: 0, clockTotal: kind === "num" ? NUM_TIME : QTIME,
      opts: null, marks: {}, resolved: false, cutUsed: false,
      betRound: betRound, bankValue: 0
    };
    if (kind !== "num") {
      cur.opts = shuffle([{ t: q.a, ok: true }].concat(q.w.map(function (w) { return { t: w, ok: false }; })));
    }
    lastShownValue = null;
    return cur;
  }

  /* Pass P: the spin as a wheel — a planned highlight sequence: fast
     cycles, an ease-out deceleration, one step PAST the landing slot
     (the overshoot), then the settle back onto it. The brass needle
     tracks the lit chip; on landing the category blooms across the
     stage. The outcome is untouched — the plan is built around the
     category already chosen. */
  function spinFrameHTML(chips) {
    return '<div class="spin-frame"><div class="spin-needle"></div><div class="spin-glint"></div><div class="cat-row">' + chips + "</div></div>";
  }
  function runSpinChips(targetCat, alive, store, onDone) {
    var chips = Array.prototype.slice.call(document.querySelectorAll(".cat-chip"));
    var frame = document.querySelector(".spin-frame");
    var needle = frame ? frame.querySelector(".spin-needle") : null;
    var targetIdx = CATS.indexOf(targetCat);
    if (targetIdx < 0) targetIdx = 0;
    var startIdx = ri(CATS.length);
    var steps = 11 + ri(3);
    while ((startIdx + steps) % CATS.length !== targetIdx) steps++;
    var plan = [];
    for (var k = 0; k <= steps; k++) {
      var f = steps ? k / steps : 1;
      plan.push({ cat: CATS[(startIdx + k) % CATS.length], delay: k === 0 ? 30 : Math.round(46 + 118 * f * f) });
    }
    plan.push({ cat: CATS[(targetIdx + 1) % CATS.length], delay: 175, over: true });
    plan.push({ cat: targetCat, delay: 120, settle: true });
    var i = 0;
    function storeId(id) { if (store) store(id); }
    function light(cat) {
      var chip = null;
      chips.forEach(function (ch) {
        var on = ch.getAttribute("data-cat") === cat;
        ch.classList.toggle("sel", on);
        if (on) chip = ch;
      });
      if (needle && frame && chip) {
        var fr = frame.getBoundingClientRect(), cr = chip.getBoundingClientRect();
        needle.style.transform = "translateX(calc(-50% + " + ((cr.left + cr.width / 2) - (fr.left + fr.width / 2)).toFixed(1) + "px))";
      }
    }
    if (frame) { frame.classList.add("spinning"); frame.classList.add("fast"); }
    if (needle) needle.classList.add("snap");
    light(plan[0].cat);
    if (needle) { void needle.offsetWidth; needle.classList.remove("snap"); }
    function step() {
      if (!alive()) { storeId(null); return; }
      i++;
      if (i >= plan.length) {
        if (frame) frame.classList.remove("spinning");
        storeId(setTimeout(function () { if (alive()) onDone(); }, 350));
        return;
      }
      var s = plan[i];
      light(s.cat);
      if (frame && plan.length - i <= 4) frame.classList.remove("fast");
      if (s.settle) {
        if (needle) { needle.classList.remove("settle"); void needle.offsetWidth; needle.classList.add("settle"); }
        stageBloom(targetCat);
      }
      storeId(setTimeout(step, s.delay));
    }
    storeId(setTimeout(step, plan[0].delay));
  }

  /* ---------- the spin (Sterling chooses the category — pure theatre) ---------- */
  function spinBeat() {
    G.phase = "spin";
    seatsVisible(true);
    updateTop(); renderSeats();
    var chips = CATS.map(function (c) {
      var cs = catStyle(c);
      return '<span class="cat-chip" data-cat="' + esc(c) + '" style="--chip:' + cs.mid + ";--chipd:" + cs.sh + ";color:" + (CATTX[c] || "#FFF6E8") + '">' + catEmblem(c) + "<span>" + esc(c) + "</span></span>";
    }).join("");
    stage('<div class="q-cat">STERLING SPINS THE CATEGORIES</div>' +
      spinFrameHTML(chips) +
      '<p class="round-text">Where it stops, nobody knows. Sterling knows. Sterling always knows.</p>');
    if (G.cur.special && G.cur.intro) $("hostLine").textContent = G.cur.intro;
    else hostSay("spin", { cat: G.cur.cat });
    Snd.play("spin");
    stClass("st-glance", 1600);
    clearInterval(spinTimer);
    runSpinChips(G.cur.cat,
      function () { return !!G && G.phase === "spin"; },
      function (id) { spinTimer = id; },
      function () { askCurrent(); });
  }

  /* ---------- the Big Finish bet beat ---------- */
  function betBeat() {
    G.phase = "bet";
    seatsVisible(true);
    updateTop(); renderSeats();
    var rows = G.players.map(function (p, i) {
      return '<div class="name-row bet-row" style="--pc:var(--p' + i + ')"><span class="name-dot" style="background:' + p.color + '"></span>' +
        '<span style="flex:1;text-align:left">' + esc(p.name) + "</span>" +
        '<button class="chip" data-bet="' + i + '|-1">− 1</button>' +
        '<span class="bet-amt" id="betAmt' + i + '">' + p.bet + (p.bet === 1 ? " CHIP" : " CHIPS") + " · " + money(p.bet * 100) + "</span>" +
        '<button class="chip" data-bet="' + i + '|1">+ 1</button></div>';
    }).join("");
    stage('<div class="round-kicker">THE BIG FINISH · QUESTION ' + (G.qInRound + 1) + " OF 3</div>" +
      '<p class="round-text">Bet on yourself, out loud — 1, 2 or 3 chips. A chip is $100. Right pays the bet; wrong costs nothing but pride.</p>' +
      '<div class="bet-rows">' + rows + "</div>" +
      '<button class="btn-gold" id="btnBetsDone">BETS ARE IN — SPIN THE CATEGORY</button>');
    hostSay("bet");
    document.querySelectorAll("[data-bet]").forEach(function (b) {
      b.addEventListener("click", function () {
        var parts = b.getAttribute("data-bet").split("|");
        var pi = parseInt(parts[0], 10), p = G.players[pi];
        p.bet = Math.max(1, Math.min(3, p.bet + parseInt(parts[1], 10)));
        var amt = $("betAmt" + pi);
        if (amt) amt.textContent = p.bet + (p.bet === 1 ? " CHIP" : " CHIPS") + " · " + money(p.bet * 100);
        renderSeats();
      });
    });
    $("btnBetsDone").addEventListener("click", spinBeat);
  }

  /* ---------- asking ---------- */
  function questionHTML() {
    var c = G.cur;
    var btns = c.opts.map(function (o, i) {
      return '<button class="ans-btn' + (o.gone ? " dim" : "") + '" style="--d:' + (i * 0.09).toFixed(2) + 's" disabled>' +
        '<span class="letter">' + (i + 1) + '</span><span>' + esc(o.t) + "</span></button>";
    }).join("");
    var head = c.kind === "survey" ? "MOST PEOPLE SAY…" : c.diff.toUpperCase();
    var pill = c.special ? "TONIGHT'S GILDED QUESTION" : esc(c.cat.toUpperCase());
    return '<div class="q-headrow"><span class="cat-pill' + (c.special ? " gilded" : "") + '">' + catEmblem(c.cat) + pill + '</span><span class="q-kind">' + head + "</span></div>" +
      '<div class="q-text">' + esc(c.q.q) + "</div>" +
      '<div class="q-meta">' +
      (c.betRound
        ? '<div class="q-for">Bets are in — this one pays the bet, and only the bet.</div>'
        : '<div class="q-value"><small>QUESTION VALUE</small><span id="qValue">' + money(c.value) + "</span></div>") +
      timerHTML() + "</div>" +
      '<div class="answers pop-in">' + btns + "</div>" + toolsHTML();
  }
  function numHTML() {
    var c = G.cur;
    return '<div class="q-headrow"><span class="cat-pill">' + catEmblem(c.cat) + esc(c.cat.toUpperCase()) + '</span><span class="q-kind">CLOSEST NUMBER</span></div>' +
      '<div class="q-text">' + esc(c.q.q) + "</div>" +
      '<div class="q-meta">' +
      (c.betRound
        ? '<div class="q-for">Bets are on — the closest shout takes their bet money.</div>'
        : '<div class="q-value"><small>QUESTION VALUE</small><span id="qValue">' + money(c.value) + "</span></div>") +
      timerHTML() + "</div>" +
      '<div class="q-for">No options. No hiding. Think of a number — shout it when Sterling calls it.</div>' +
      '<div style="margin-top:14px"><button class="btn-gold" id="btnCallIt">CALL IT — NUMBERS OUT</button></div>';
  }
  function toolsHTML() {
    if (!G.cur || G.cur.kind === "num") return "";
    var h = '<div class="tools">';
    G.players.forEach(function (p, i) {
      h += '<button class="tool-btn" data-cut="' + i + '"' + (p.cut > 0 && !G.cur.cutUsed ? "" : " disabled") + ">CUT TWO<small>" + esc(p.name) + "'s one lifeline</small></button>";
    });
    h += '<button class="tool-btn" id="btnCallIt">CALL IT<small>everybody — fingers up</small></button>';
    return h + "</div>";
  }
  function askCurrent() {
    G.phase = "question";
    applyCat(G.cur.cat);
    seatsVisible(true);
    updateTop(); renderSeats();
    if (G.cur.kind === "num") {
      stage(numHTML());
      hostSay("numQ", { cat: G.cur.cat });
    } else {
      stage(questionHTML());
      hostSay("read", { cat: G.cur.cat });
    }
    wireQuestion();
    startClock(G.cur.clockTotal, function () { callIt(); });
  }
  function wireQuestion() {
    document.querySelectorAll("[data-cut]").forEach(function (b) {
      b.addEventListener("click", function () { useCut(parseInt(b.getAttribute("data-cut"), 10)); });
    });
    var call = $("btnCallIt");
    if (call) call.addEventListener("click", callIt);
    var qt = document.querySelector(".q-text");
    if (qt) qt.addEventListener("click", callIt);
  }
  function useCut(i) {
    var c = G.cur, p = G.players[i];
    if (!c || G.phase !== "question" || c.kind === "num" || c.cutUsed || p.cut <= 0) return;
    p.cut--; c.cutUsed = true;
    var wrong = c.opts.map(function (o, ix) { return { o: o, i: ix }; }).filter(function (x) { return !x.o.ok; });
    shuffle(wrong).slice(0, 2).forEach(function (x) { x.o.gone = true; });
    sayLive("beat", { beat: "cut_used", name: p.name }, authoredLine("cut", { name: p.name }));
    Snd.play("gold");
    stage(questionHTML()); wireQuestion(); drawClock(); renderSeats();
  }

  /* ---------- the finger-vote ---------- */
  function callIt() {
    if (!G || !G.cur || G.phase !== "question" || G.cur.resolved) return;
    G.cur.resolved = true; stopClock();
    G.cur.bankValue = G.cur.betRound ? 0 : earned(G.cur.value, G.cur.elapsed, G.cur.clockTotal);
    voteBeat();
  }
  function voteBeat() {
    G.phase = "vote-count";
    G.cur.marks = {};
    renderSeats();
    stage('<div class="q-cat">EVERYBODY READY?</div>' +
      '<div class="round-title" id="voteCount">FINGERS UP…</div>' +
      '<p class="round-text">' + (G.cur.kind === "num"
        ? "Numbers ready — shout yours on SHOW ME."
        : "Hold up 1, 2, 3 or 4 fingers — your answer, held high, for the whole room to see.") + "</p>");
    hostSay("vote");
    Snd.play("vote");
    var steps = ["3", "2", "1", "SHOW ME!"];
    var si = 0;
    clearInterval(voteTimer);
    voteTimer = setInterval(function () {
      var vc = $("voteCount");
      if (!vc || !G || G.phase !== "vote-count") { clearInterval(voteTimer); voteTimer = null; return; }
      vc.textContent = steps[si];
      vc.classList.remove("pop"); void vc.offsetWidth; vc.classList.add("pop");
      si++;
      if (si >= steps.length) { clearInterval(voteTimer); voteTimer = null; markScreen(); }
    }, 450);
  }
  function markScreen() {
    G.phase = "vote";
    renderSeats();
    stage('<div class="q-headrow"><span class="cat-pill">' + catEmblem(G.cur.cat) + esc(G.cur.cat.toUpperCase()) + '</span><span class="q-kind">WHO HAD IT?</span></div>' +
      '<div class="q-text" style="font-size:clamp(18px,3vw,25px)">' + esc(G.cur.q.q) + "</div>" +
      '<p class="round-text">' + (G.cur.kind === "num"
        ? "Who called the closest number? Tap their seat — tap two seats if it's a dead heat."
        : "Tap the seat of everyone holding up the right fingers. Wrong fingers, no tap — and nobody loses a thing either way.") + "</p>" +
      '<button class="btn-gold" id="btnReveal">REVEAL THE ANSWER</button>');
    hostSay("mark");
    $("btnReveal").addEventListener("click", revealAnswer);
  }

  /* ---------- the reveal (scores commit first, effects after) ---------- */
  function revealAnswer() {
    if (!G || !G.cur || G.phase !== "vote") return;
    var c = G.cur;
    G.phase = "reveal";
    var winners = Object.keys(c.marks).map(Number).sort(function (a, b) { return a - b; });
    winners.forEach(function (i) {
      var p = G.players[i];
      var gain = c.betRound ? p.bet * 100 : c.bankValue;
      p.score += gain;
    });
    /* Pass D4: this reveal's scoring grammar, painted at the seats by
       renderSeats below. Marked seats banked; unmarked seats missed
       (at the table the host's marks ARE the answer record — an
       unmarked seat already slumps). Guess questions tag every
       banker CLOSEST so the room sees why the money moved. */
    var fxSeats = {}, bankSeq = 0, guessQ = (c.kind === "num" || c.kind === "survey");
    G.players.forEach(function (p, i) {
      if (c.marks[i]) fxSeats[i] = { delta: "bank", amt: c.betRound ? p.bet * 100 : c.bankValue, closest: guessQ, delay: bankSeq++ * 0.12 };
      else fxSeats[i] = { delta: "miss", delay: i * 0.05 };
    });
    tableFx = { seats: fxSeats };
    /* the last question's reveal settles the final standings — start
       the winner line's generation now, not at the finale screen */
    if (G.round === 3 && G.qInRound === R3_COUNT - 1) winnerPrefetchAtReveal(winnerFactsFrom(G.players));
    var nextBtn = '<div style="margin-top:12px"><button class="btn-gold" id="btnNext">CONTINUE</button></div>';
    if (c.kind === "num") {
      var dNum = winners.length ? ""
        : '<div class="delta"><span class="down">Nobody got close. The number keeps its dignity.</span></div>';
      stage('<div class="q-headrow"><span class="cat-pill">' + catEmblem(c.cat) + esc(c.cat.toUpperCase()) + '</span><span class="q-kind">THE NUMBER WAS</span></div>' +
        '<div class="q-text" style="font-size:clamp(18px,3vw,25px)">' + esc(c.q.q) + "</div>" +
        '<div class="wager-amt">' + Number(c.q.num).toLocaleString("en-US") + "</div>" +
        dNum +
        '<p class="why">' + esc(c.q.why) + "</p>" + nextBtn);
      revealSay(winners.length ? "numHit" : "numMiss", { name: winners.length ? G.players[winners[0]].name : "" }, winners);
      Snd.play(winners.length ? "correct" : "wrong");
    } else {
      var correctIdx = c.opts.findIndex(function (o) { return o.ok; });
      var btns = c.opts.map(function (o, i) {
        var cls = "ans-btn" + (i === correctIdx ? " correct" : (o.gone ? " dim wrong" : " dim"));
        return '<button class="' + cls + '" disabled><span class="letter">' + (i + 1) + '</span><span>' + esc(o.t) + "</span></button>";
      }).join("");
      var dMcq = winners.length ? ""
        : '<div class="delta"><span class="down">No fingers on it. The money stays in Sterling\'s pocket — this time.</span></div>';
      stage('<div class="q-headrow"><span class="cat-pill">' + catEmblem(c.cat) + esc(c.cat.toUpperCase()) + '</span><span class="q-kind">THE ANSWER</span></div>' +
        '<div class="q-text" style="font-size:clamp(18px,3vw,25px)">' + esc(c.q.q) + "</div>" +
        '<div class="answers">' + btns + "</div>" +
        dMcq +
        '<p class="why">' + esc(c.q.why) + "</p>" + nextBtn);
      var hk = winners.length === 0 ? "allMiss" : (winners.length === G.players.length ? "allHit" : "someHit");
      revealSay(hk, { name: winners.length ? G.players[winners[0]].name : "" }, winners);
      Snd.play(winners.length ? "correct" : "wrong");
    }
    renderSeats();
    /* Pass P: Sterling leans in for the reveal; a fat bank earns the
       nod; and the money visibly travels to each winner's seat */
    stClass("st-lean", 1000);
    var maxGain = 0;
    winners.forEach(function (wi) { var gn = c.betRound ? G.players[wi].bet * 100 : c.bankValue; if (gn > maxGain) maxGain = gn; });
    if (maxGain >= 300) stClass("st-nod", 600);
    winners.forEach(function (wi, k) { bankFx(wi, k * 0.12); });
    $("btnNext").addEventListener("click", function () { G.qInRound++; nextQuestion(); });
  }

  /* ---------- the result ---------- */
  function finishShow() {
    var best = Math.max.apply(null, G.players.map(function (p) { return p.score; }));
    var tied = G.players.map(function (p, i) { return i; }).filter(function (i) { return G.players[i].score === best; });
    winnerScreen(tied[0], tied.length > 1 ? tied : null);
  }
  function winnerScreen(i, tiedIdx) {
    G.phase = "over";
    if (G.cur) G.cur.marks = {};
    var p = G.players[i];
    var wStand = G.players.map(function (pp) { return { name: pp.name, score: pp.score }; })
      .sort(function (a, b) { return b.score - a.score; });
    sayWinner({ winner: p.name, standings: wStand, topScore: p.score }, authoredLine("winner", { name: p.name }),
      function () { return !!G && G.phase === "over"; });
    seatsVisible(false);
    var order = G.players.map(function (pp, ii) { return ii; }).sort(function (a, b) { return G.players[b].score - G.players[a].score; });
    var ranks = {}; order.forEach(function (pi, pos) { ranks[pi] = pos; });
    var disp = order.slice();
    if (disp.length > 1) { var t = disp[0]; disp[0] = disp[1]; disp[1] = t; } // 2nd, 1st, 3rd, 4th
    var pods = disp.map(function (ii) {
      var pp = G.players[ii], pos = ranks[ii];
      var badgeCls = pos === 1 ? "silver" : pos === 2 ? "bronze" : "plain";
      var top = ii === i
        ? '<span class="champ-tag">★ CHAMPION</span>'
        : '<span class="rank-badge ' + badgeCls + '">' + (pos + 1) + "</span>";
      return '<div class="podium pod' + ii + " big rank" + (pos + 1) + (ii === i ? " winner-podium lit" : "") + '">' + top + (ii === i ? laurelBadge() : "") +
        avatarSVG(snapAvatar(pp, ii), ii === i ? "cheer" : "neutral", ii) +
        '<div class="desk"><div class="pname">' + esc(pp.name) + '</div><div class="pmoney">' + money(pp.score) + "</div></div></div>";
    }).join("");
    var tieNote = "";
    if (tiedIdx) {
      var names = tiedIdx.map(function (ii) { return G.players[ii].name; }).join(" and ");
      tieNote = '<p class="round-text tie-note">Dead level at the top — ' + esc(names) + " matched at " + money(p.score) +
        ". The crown goes to the earliest seat, and the rematch is now legally mandatory.</p>";
    }
    stage('<div class="finale-wrap"><div class="spot-cone" aria-hidden="true"></div><div class="finale-main">' +
      '<div class="marquee finale-marquee"><div class="kicker">THE GILDED HOUR · FINAL RESULT</div>' +
      '<div class="winner-word">WINNER</div>' +
      '<div class="winner-name">' + esc(p.name) + "</div>" +
      '<div class="winner-total">' + money(p.score) + "</div></div>" +
      '<div class="sterling-zone"><div class="bubble bubble-finale">Sealed with a kiss of confetti — the hour is yours, ' + esc(p.name) + ".</div>" +
      sterlingSVG("present", "sterling sterling-lg") + "</div></div>" +
      tieNote +
      '<div class="podium-row finale-row">' + pods + "</div>" +
      '<div class="finale-btns"><button class="btn-gold" id="btnAgain">PLAY AGAIN</button>' +
      '<button class="btn-ghost" id="btnLobby">BACK TO LOBBY</button></div></div>');
    Snd.play("finale");
    startLeaves();
    saveSeen();
    renderSeats();
    buildBulbs(document.querySelector(".finale-marquee"));
    finaleCeremony();
    $("btnAgain").addEventListener("click", function () {
      stopLeaves();
      startShow(G.players.map(function (pp) { return pp.name; }));
    });
    $("btnLobby").addEventListener("click", function () { stopLeaves(); showScreen("scr-title"); G = null; });
  }

  /* ---------- setup screen ---------- */
  var playerCount = 3;
  /* table-mode portraits (item 6): one pick per seat slot, defaulting
     to the seat's own avatar; tapping the disc in a name row cycles.
     Remembered on this device like the join name is — presentation
     only, never part of the game state the show scores from */
  var tableAvatars = [0, 1, 2, 3];
  try {
    var _ta = JSON.parse(localStorage.getItem("gh_table_avatars") || "null");
    if (Array.isArray(_ta)) _ta.forEach(function (v, i) {
      if (i < 4 && Number.isInteger(v) && v >= 0 && v < 8) tableAvatars[i] = v;
    });
  } catch (e) {}
  function saveTableAvatars() {
    try { localStorage.setItem("gh_table_avatars", JSON.stringify(tableAvatars)); } catch (e) {}
  }
  function renderPodiumPreview() {
    var wrap = $("podiumPreview");
    if (!wrap) return;
    var inputs = $("panelTable").querySelectorAll(".name-input");
    var html = "";
    for (var i = 0; i < playerCount; i++) {
      var nm = (inputs[i] && inputs[i].value.trim()) || PNAMES[i];
      html += '<div class="podium pod' + i + '">' + avatarSVG(tableAvatars[i], "neutral", i) +
        '<div class="desk"><div class="pname">' + esc(nm) + '</div><div class="pmoney">$0</div></div></div>';
    }
    wrap.innerHTML = html;
  }
  function buildNameRows() {
    var wrap = $("nameRows"); wrap.innerHTML = "";
    for (var i = 0; i < playerCount; i++) {
      var row = el('<div class="name-row"><button class="ava-pick" data-avaseat="' + i + '" aria-label="Portrait for seat ' + (i + 1) + ' — tap to change">' +
        avatarSVG(tableAvatars[i], "neutral", i) + "</button>" +
        '<input class="name-input" maxlength="14" value="' + PNAMES[i] + '">' +
        '<span class="name-seat">SEAT ' + (i + 1) + "</span></div>");
      row.querySelector(".name-input").addEventListener("input", renderPodiumPreview);
      (function (seat) {
        row.querySelector(".ava-pick").addEventListener("click", function () {
          Snd.ensure();
          tableAvatars[seat] = (tableAvatars[seat] + 1) % 8;
          saveTableAvatars();
          paintAvaPicks();
          renderPodiumPreview();
        });
      })(i);
      wrap.appendChild(row);
    }
    renderPodiumPreview();
  }
  /* repaint just the picker discs (a cycle tap must not rebuild the
     rows — that would throw away names being typed) */
  function paintAvaPicks() {
    document.querySelectorAll(".ava-pick").forEach(function (b) {
      var seat = parseInt(b.getAttribute("data-avaseat"), 10);
      b.innerHTML = avatarSVG(tableAvatars[seat], "neutral", seat);
    });
  }
  document.querySelectorAll(".count-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".count-btn").forEach(function (x) { x.classList.remove("sel"); });
      b.classList.add("sel");
      playerCount = parseInt(b.getAttribute("data-n"), 10);
      buildNameRows();
    });
  });
  $("btnStart").addEventListener("click", function () {
    Snd.ensure();
    var names = Array.prototype.map.call($("panelTable").querySelectorAll(".name-input"), function (inp, i) {
      return inp.value.trim() || PNAMES[i];
    });
    startShow(names);
  });
  $("btnQuit").addEventListener("click", function () {
    stopClock(); stopLeaves(); saveSeen();
    seatsVisible(true);
    clearInterval(spinTimer); clearInterval(voteTimer); spinTimer = voteTimer = null;
    ogTeardown();
    G = null; showScreen("scr-title");
  });
  buildNameRows();
  buildBulbs($("marqueeTitle"));
  /* mute toggles — one on the title screen, one in the show topbar —
     same gh_mute persistence and wording; the show reads fully silent */
  var muteBtns = [$("btnMute"), $("btnMuteShow")].filter(Boolean);
  function paintMute() {
    muteBtns.forEach(function (b) {
      b.textContent = Snd.muted ? "SOUND: OFF" : "SOUND: ON";
      b.classList.toggle("on", !Snd.muted);
    });
  }
  muteBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      Snd.ensure(); Snd.setMuted(!Snd.muted); paintMute();
      if (!Snd.muted) Snd.play("correct");
    });
  });
  paintMute();
  /* ---------- how tonight works (teaching cards) ----------
     A manual overlay off the title screen: three beats, no game
     state touched. gh_taught only records that a player checked
     "Don't show this again" — the entry point stays either way,
     and picks up a quiet tick when the table has been taught. */
  var howBeat = 0;
  function howTaught() { try { return localStorage.getItem("gh_taught") === "1"; } catch (e) { return false; } }
  function paintHowEntry() { $("btnHow").textContent = howTaught() ? "HOW TONIGHT WORKS ✓" : "HOW TONIGHT WORKS"; }
  function showBeat(n) {
    howBeat = n;
    document.querySelectorAll(".how-beat").forEach(function (p) { p.classList.toggle("hidden", +p.getAttribute("data-beat") !== n); });
    document.querySelectorAll(".how-dot").forEach(function (d, i) { d.classList.toggle("sel", i === n); });
    var last = n === 2;
    $("howNext").classList.toggle("hidden", last);
    $("howClose").classList.toggle("hidden", !last);
    $("howStart").classList.toggle("hidden", !last);
  }
  function openHow() {
    $("howAgain").checked = howTaught(); showBeat(0);
    /* the last beat's gold button only starts a show at the table —
       in the online modes it merely closes, so it says so (fix #9) */
    $("howStart").textContent = ghMode === "table" ? "START THE SHOW" : "GOT IT";
    $("howOverlay").classList.remove("hidden");
  }
  function closeHow() { $("howOverlay").classList.add("hidden"); }
  $("btnHow").addEventListener("click", function () { Snd.ensure(); openHow(); });
  $("howSkip").addEventListener("click", closeHow);
  $("howClose").addEventListener("click", closeHow);
  $("howNext").addEventListener("click", function () { showBeat(Math.min(2, howBeat + 1)); });
  $("howStart").addEventListener("click", function () {
    closeHow();
    if (ghMode === "table") $("btnStart").click();
  });
  $("howAgain").addEventListener("change", function () {
    try {
      if ($("howAgain").checked) localStorage.setItem("gh_taught", "1");
      else localStorage.removeItem("gh_taught");
    } catch (e) {}
    paintHowEntry();
  });
  paintHowEntry();
  /* the cold open is skippable — a tap never traps the table */
  $("stage").addEventListener("click", function () {
    if (G && G.phase === "coldopen") { clearTimeout(coldTimer); roundIntro(); }
  });
  /* heavy animation and audio rest while the tab is hidden */
  document.addEventListener("visibilitychange", function () {
    pageHidden = document.hidden;
    if (Snd.ctx) { try { if (document.hidden) Snd.ctx.suspend(); else Snd.ctx.resume(); } catch (e) {} }
  });
  window.addEventListener("resize", function () { sizeMotes(); updateLaurel(); });
  requestAnimationFrame(loop);

  /* ================= Pass 4: online rooms =================
     The room server (gilded-hour-rooms) referees the same format:
     the host screen publishes questions, players answer privately on
     their own phones, the server clock owns the window and the scores.
     Local pass-and-play above is untouched and remains the default. */
  /* ---- the one clearly-marked endpoint (parent deploys the worker;
     override for local testing with ?ghw=<url> or localStorage gh_worker) ---- */
  var WORKER_URL = "https://gilded-hour-rooms.chaoticutopia84.workers.dev";
  try {
    var _ghw = new URLSearchParams(location.search).get("ghw");
    if (_ghw) WORKER_URL = _ghw.replace(/\/+$/, "");
    else { var _lsw = localStorage.getItem("gh_worker"); if (_lsw) WORKER_URL = _lsw.replace(/\/+$/, ""); }
  } catch (e) {}
  function wsBase() { return WORKER_URL.replace(/^http/, "ws"); }

  /* ================= Pass 5: the Sterling + nightly workers =================
     Two small AI workers lend the show a live voice and one special
     question a night. Everything they offer is decoration on top of the
     authored game: every fetch is timeout-capped and fail-soft, a line
     (prefetched or authored) always renders instantly, and nothing
     anywhere waits on the network. No labels, no spinners — Sterling
     just sounds like Sterling, on his good nights slightly more so. */
  var STERLING_URL = "https://gilded-hour-sterling.chaoticutopia84.workers.dev";
  var NIGHTLY_URL = "https://gilded-hour-nightly.chaoticutopia84.workers.dev";
  /* The live workers belong to the HOSTED game. A page served over
     http(s) — or pointed at a local worker with the ?ghw= override —
     uses them; a file:// copy is a fully self-contained build and
     makes no network attempts at all (a refused fetch logs a console
     error even when handled, so "fail-soft" alone cannot keep an
     offline copy error-free — the gate is what guarantees it). */
  var LIVE_OK = /^https?:$/.test(location.protocol) || !!_ghw;
  /* fetch JSON with a hard timeout; resolves null on ANY failure
     (offline, timeout, bad status, bad JSON) and never rejects */
  function fetchJSON(url, opts, timeoutMs) {
    return new Promise(function (resolve) {
      var done = false, timer = null, ctrl = null;
      function fin(v) { if (!done) { done = true; if (timer) clearTimeout(timer); resolve(v); } }
      try {
        var o = opts || {};
        if (typeof AbortController !== "undefined") { ctrl = new AbortController(); o.signal = ctrl.signal; }
        timer = setTimeout(function () { if (ctrl) { try { ctrl.abort(); } catch (e) {} } fin(null); }, timeoutMs || 2500);
        fetch(url, o).then(function (r) {
          if (!r || !r.ok) { fin(null); return null; }
          return r.json();
        }).then(function (j) { fin(j == null ? null : j); }).catch(function () { fin(null); });
      } catch (e) { fin(null); }
    });
  }
  function sterlingLine(kind, facts, timeoutMs) {
    var body = { kind: kind };
    for (var k in facts) body[k] = facts[k];
    return fetchJSON(STERLING_URL + "/g", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    }, timeoutMs || 2500).then(function (j) {
      return j && typeof j.line === "string" && j.line.trim() ? j.line : null;
    });
  }
  function liveShowKey() {
    if (OG && OG.code) return "room-" + OG.code;
    if (G && G.showId) return G.showId;
    return null;
  }
  /* ---------- prefetch + patient swaps ----------
     Cold Workers AI generation takes seconds, not milliseconds, so
     the old fetch-at-the-moment-and-swap-within-900ms almost never
     landed a generated line. Now the lines whose facts are knowable
     in advance — the greeting for the names at the table, a first
     bank or a Cut Two for each of them, a whole-table miss — are
     fetched BEFORE the moment (the online lobby, table show start)
     into a per-show cache; at the beat, a cached line simply renders
     and no swap is involved. The lines whose facts cannot be known
     in advance (a runaway lead's margin, the winner's standings)
     still fetch at the moment, but with beat-specific patience, and
     the sequence-token + bubble-text guards keep any late reply from
     overwriting a newer line. A prefetch that times out or fails
     just leaves the authored line in place — nothing retries. The
     winner is the extreme case: its facts exist only once the final
     reveal settles, yet a cold generation outran even a 4s finale
     window in production — so the winner request fires AT that
     reveal (sayWinner's prefetch, 9s budget) and the finale rides
     the in-flight promise on its own guard channel. */
  var livePrefetch = { scope: null, map: {} };
  function pfFactsKey(facts) {
    if (facts.names) return "names:" + facts.names.join(",");
    if (facts.beat) return facts.beat + "|" + (facts.name || "");
    return "";
  }
  function pfKey(kind, facts) { return kind + "|" + pfFactsKey(facts); }
  function prefetchEntry(kind, facts) {
    var scope = liveShowKey();
    if (!scope) return null;
    if (livePrefetch.scope !== scope) livePrefetch = { scope: scope, map: {} };
    return livePrefetch.map[pfKey(kind, facts)] || null;
  }
  function prefetchLine(kind, facts, timeoutMs) {
    if (!LIVE_OK) return;
    var scope = liveShowKey();
    if (!scope) return;
    if (livePrefetch.scope !== scope) livePrefetch = { scope: scope, map: {} };
    var k = pfKey(kind, facts);
    if (livePrefetch.map[k]) return;   // fetched or fetching — never twice
    var entry = { status: "wait", line: null, promise: null };
    livePrefetch.map[k] = entry;
    var f = {}; for (var key in facts) f[key] = facts[key];
    f.showKey = scope;
    entry.promise = sterlingLine(kind, f, timeoutMs).then(function (line) {
      if (livePrefetch.map[k] !== entry) return line;  // a newer show owns the cache now
      entry.status = line ? "ok" : "miss";
      entry.line = line || null;
      return line;
    });
  }
  /* the predictable set for a table of names — fired in the online
     lobby and re-fired whenever the player set changes (the greeting
     key carries the names, so a changed set fetches a fresh greeting
     while unchanged per-player lines stay cached), and at table
     show start */
  function prefetchShowLines(names) {
    if (!LIVE_OK || !names || !names.length) return;
    prefetchLine("greeting", { names: names.slice() });
    prefetchLine("beat", { beat: "whole_miss" });
    names.forEach(function (n) {
      prefetchLine("beat", { beat: "first_bank", name: n });
      prefetchLine("beat", { beat: "cut_used", name: n });
    });
  }
  /* Render a Sterling line for this beat. A prefetched line renders
     as-is. Otherwise the authored line renders NOW and the live reply
     may still swap in within this beat's window (opts.window; default
     2500ms — greeting 2500, big_lead 2500) — but only while the
     sequence token is current, the bubble still shows that same
     authored line, and the caller's guard (opts.guard, if any) still
     holds. If the matching prefetch is still in flight, ride it
     instead of asking the worker twice. (The winner line has its own
     channel — sayWinner, below — with a longer patience.) */
  var saySeq = 0;
  function sayLive(kind, facts, authored, opts) {
    var hl = $("hostLine"); if (!hl) return;
    var seq = ++saySeq;
    var entry = LIVE_OK ? prefetchEntry(kind, facts) : null;
    if (entry && entry.status === "ok") { hl.textContent = entry.line; return; }
    hl.textContent = authored;
    if (!LIVE_OK) return;
    var key = liveShowKey();
    if (!key) return;
    var windowMs = (opts && opts.window) || 2500;
    var guard = opts && opts.guard;
    var promise;
    if (entry && entry.status === "wait" && entry.promise) {
      promise = entry.promise;
    } else {
      var f = {}; for (var k in facts) f[k] = facts[k];
      f.showKey = key;
      promise = sterlingLine(kind, f, Math.max(2500, windowMs + 500));
    }
    var t0 = Date.now();
    promise.then(function (line) {
      if (!line) return;
      if (Date.now() - t0 > windowMs) return;    // too late — the moment has passed
      if (seq !== saySeq) return;                // a newer line was requested since
      var el2 = $("hostLine");
      if (!el2 || el2.textContent !== authored) return; // the bubble has moved on
      if (guard && !guard()) return;             // the beat's stage has passed
      el2.textContent = line;
    });
  }
  /* ---------- the winner line: fired early, on its own channel ----
     The winner's facts are final the instant the LAST question's
     reveal settles, seconds before the finale screen renders — so
     the request fires there (winnerPrefetchAtReveal, both modes)
     with a 9s fetch budget, and the finale's sayWinner rides the
     in-flight prefetch instead of asking at the last moment. The
     finale screen then dwells until PLAY AGAIN, so the swap window
     is also 9s: a single late swap there reads as Sterling adding a
     thought, never as a glitch. The guard is deliberately NOT the
     shared saySeq — unrelated beats settling between the final
     reveal and the finale must not kill the swap. sayWinner has its
     own sequence (winnerSeq) and requires: still on the finale
     screen (the caller's isFinale closure over its own mode state),
     and the bubble still showing the authored winner line the
     finale rendered. The static .bubble-finale inside the finale
     stage is a different element and is never the target. */
  var winnerSeq = 0;
  function winnerFactsFrom(players) {
    var best = -Infinity, wi = -1;
    players.forEach(function (p, i) { if (p && p.score > best) { best = p.score; wi = i; } });
    if (wi < 0) return null;
    var standings = players.filter(function (p) { return !!p; })
      .map(function (p) { return { name: p.name, score: p.score }; })
      .sort(function (a, b) { return b.score - a.score; });
    return { winner: players[wi].name, standings: standings, topScore: best };
  }
  /* fire the winner request the moment the final standings exist */
  function winnerPrefetchAtReveal(facts) {
    if (!facts) return;
    prefetchLine("winner", facts, 9000);
  }
  function sayWinner(facts, authored, isFinale) {
    var hl = $("hostLine"); if (!hl) return;
    var seq = ++winnerSeq;
    var entry = LIVE_OK ? prefetchEntry("winner", facts) : null;
    if (entry && entry.status === "ok") { hl.textContent = entry.line; return; }
    hl.textContent = authored;
    if (!LIVE_OK) return;
    var key = liveShowKey();
    if (!key) return;
    var promise;
    if (entry && entry.status === "wait" && entry.promise) {
      promise = entry.promise;   // fired at the final reveal — ride it
    } else {
      var f = {}; for (var k in facts) f[k] = facts[k];
      f.showKey = key;
      promise = sterlingLine("winner", f, 9000);
    }
    var t0 = Date.now();
    promise.then(function (line) {
      if (!line) return;
      if (Date.now() - t0 > 9000) return;         // past the finale's patience
      if (seq !== winnerSeq) return;             // a newer finale owns the bubble
      if (isFinale && !isFinale()) return;       // the finale screen has passed
      var el2 = $("hostLine");
      if (!el2 || el2.textContent !== authored) return; // the bubble has moved on
      el2.textContent = line;
    });
  }
  /* reveal-time live beats for the table show: a whole-table miss, the
     first bank of the night, a runaway lead (>= $500, once per show).
     Anything else keeps the authored line the reveal already chose. */
  function revealSay(hk, vars, winners) {
    var authored = authoredLine(hk, vars);
    if (!G) { var h0 = $("hostLine"); if (h0) h0.textContent = authored; return; }
    if (winners.length === 0) { sayLive("beat", { beat: "whole_miss" }, authored); return; }
    if (!G.bankedOnce) {
      G.bankedOnce = true;
      sayLive("beat", { beat: "first_bank", name: G.players[winners[0]].name }, authored);
      return;
    }
    if (!G.bigLeadDone) {
      var srt = G.players.map(function (p) { return p.score; }).sort(function (a, b) { return b - a; });
      if (srt.length > 1 && srt[0] - srt[1] >= 500) {
        G.bigLeadDone = true;
        var leadName = "";
        G.players.forEach(function (p) { if (p.score === srt[0] && !leadName) leadName = p.name; });
        sayLive("beat", { beat: "big_lead", name: leadName, lead: srt[0] - srt[1] }, authored, { window: 2500 });
        return;
      }
    }
    var hl = $("hostLine"); if (hl) hl.textContent = authored;
  }
  /* the same beats for the online host, against server scores */
  function ogRevealSay(hk, vars, winners) {
    var authored = authoredLine(hk, vars);
    if (!OG) { var h0 = $("hostLine"); if (h0) h0.textContent = authored; return; }
    if (winners.length === 0) { sayLive("beat", { beat: "whole_miss" }, authored); return; }
    if (!OG.bankedOnce) {
      OG.bankedOnce = true;
      var fp = OG.players[winners[0]];
      sayLive("beat", { beat: "first_bank", name: fp ? fp.name : "A player" }, authored);
      return;
    }
    if (!OG.bigLeadDone) {
      var sc = [];
      OG.players.forEach(function (p) { if (p) sc.push(p.score); });
      sc.sort(function (a, b) { return b - a; });
      if (sc.length > 1 && sc[0] - sc[1] >= 500) {
        OG.bigLeadDone = true;
        var leadName2 = "";
        OG.players.forEach(function (p) { if (p && p.score === sc[0] && !leadName2) leadName2 = p.name; });
        sayLive("beat", { beat: "big_lead", name: leadName2, lead: sc[0] - sc[1] }, authored, { window: 2500 });
        return;
      }
    }
    var hl = $("hostLine"); if (hl) hl.textContent = authored;
  }
  /* ---------- tonight's special question (served ready-made) ---------- */
  function chicagoDateStr() {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    } catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  function validServed(j) {
    return !!(j && j.question && j.question.kind === "normal" &&
      typeof j.question.q === "string" && Array.isArray(j.question.a) && j.question.a.length === 4 &&
      Number.isInteger(j.question.correct) && j.question.correct >= 0 && j.question.correct <= 3 &&
      typeof j.question.cat === "string");
  }
  /* table mode: one fetch per show, keyed by the show id; the result
     (or the lack of one) is simply read when Round 1 reaches slot 3 */
  var nightlyState = { key: null, data: null };
  function fetchNightlyForShow(key) {
    nightlyState = { key: key, data: null };
    if (!LIVE_OK) return;
    fetchJSON(NIGHTLY_URL + "/tonight", null, 2500).then(function (j) {
      if (nightlyState.key !== key) return;
      if (validServed(j)) nightlyState.data = j;
    });
  }
  /* a table-show runtime for the special: options arrive pre-shuffled
     from the worker and are used exactly as served — the parallel path
     alongside makeCur, which builds options from a bank entry */
  function makeCurServed(sv) {
    var q = sv.question;
    var diff = BASE_VALUES[q.diff] ? q.diff : "medium";
    var cur = {
      q: { q: q.q, why: q.why || "", cat: q.cat, diff: diff, special: true },
      kind: "mcq", cat: q.cat, diff: diff,
      value: BASE_VALUES[diff],   // the special only ever sits in Round 1 (x1)
      elapsed: 0, clockTotal: QTIME,
      opts: q.a.map(function (t, i) { return { t: t, ok: i === q.correct }; }),
      marks: {}, resolved: false, cutUsed: false,
      betRound: false, bankValue: 0,
      special: true, intro: sv.intro || null
    };
    lastShownValue = null;
    return cur;
  }
  /* an online script entry for the special: same served order, a qid
     the phones recognise ("nightly.<date>.<seed36>"), and a pair of
     cut indices chosen the way ogOptsFor chooses them (seeded) */
  function ogSpecialEntry(sv, seed) {
    var q = sv.question;
    var diff = BASE_VALUES[q.diff] ? q.diff : "medium";
    var wrong = [0, 1, 2, 3].filter(function (i) { return i !== q.correct; });
    var r = mulberry32(seed);
    for (var i = wrong.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = wrong[i]; wrong[i] = wrong[j]; wrong[j] = t; }
    return {
      seq: 3, round: 1, qInRound: 2,
      bank: { q: q.q, why: q.why || "", cat: q.cat, diff: diff },
      kind: "normal", cat: q.cat, diff: diff,
      baseValue: BASE_VALUES[diff], multiplier: 1, windowMs: QTIME * 1000,
      answers: q.a.slice(), correctIdx: q.correct,
      cutIndices: wrong.slice(0, 2).sort(function (a, b) { return a - b; }),
      special: true, intro: sv.intro || null,
      qid: "nightly." + chicagoDateStr() + "." + seed.toString(36)
    };
  }

  /* Protocol note: publish_question carries ids and secrets, never the
     question wording — so the host encodes the bank id and the shuffle
     seed in the qid ("q<seq>.<bankId>.<seed36>"), and player clients
     rebuild the exact question and answer order from their own copy of
     the bank with this shared seeded shuffle. Picks, numbers and bets
     stay server-secret until the reveal; only the public wording of a
     question already on the big screen is reconstructed. */
  function ogOptsFor(q, seed) {
    var r = mulberry32(seed);
    var opts = [{ t: q.a, ok: true }].concat(q.w.map(function (w) { return { t: w, ok: false }; }));
    for (var i = opts.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = opts[i]; opts[i] = opts[j]; opts[j] = t; }
    var correctIdx = -1;
    opts.forEach(function (o, i) { if (o.ok) correctIdx = i; });
    var wrong = opts.map(function (o, i) { return i; }).filter(function (i) { return i !== correctIdx; });
    for (var k = wrong.length - 1; k > 0; k--) { var j2 = Math.floor(r() * (k + 1)); var t2 = wrong[k]; wrong[k] = wrong[j2]; wrong[j2] = t2; }
    return { answers: opts.map(function (o) { return o.t; }), correctIdx: correctIdx, cutIndices: wrong.slice(0, 2) };
  }
  function ogParseQid(qid) {
    var m = /^q(\d+)\.(\d+)\.([0-9a-z]+)$/.exec(String(qid || ""));
    if (!m) return null;
    return { seq: parseInt(m[1], 10), bankId: parseInt(m[2], 10), seed: parseInt(m[3], 36) };
  }
  /* build the 15-question script with the same deck machinery the
     local show uses (pools, seen-set, the five guess slots) */
  function ogBuildScript() {
    var saved = G;
    G = newGame(["—", "—", "—", "—"]); // scratch state for the shared draw helpers
    pools = {};
    var guess = buildGuessSchedule();
    var script = [];
    [[1, R1_COUNT, R1_DIFFS], [2, R2_COUNT, R2_DIFFS], [3, R3_COUNT, R3_DIFFS]].forEach(function (rr) {
      G.round = rr[0];
      for (var qi = 0; qi < rr[1]; qi++) {
        G.qInRound = qi;
        var gid = guess[rr[0] + ":" + qi];
        var q, kind;
        if (gid != null) { q = BANK[gid]; kind = q.kind; }
        else { q = drawQuestion(pick(CATS), rr[2][qi] || "medium"); kind = "normal"; }
        var seed = (Math.random() * 2147483646 + 1) | 0;
        var e = {
          seq: script.length + 1, round: rr[0], qInRound: qi, bank: q, kind: kind,
          cat: q.cat, diff: q.diff || "medium",
          baseValue: BASE_VALUES[q.diff || "medium"],
          multiplier: rr[0] === 2 ? 2 : 1,
          windowMs: kind === "num" ? NUM_TIME * 1000 : QTIME * 1000
        };
        if (kind === "num") e.trueNum = Number(q.num);
        else { var o = ogOptsFor(q, seed); e.answers = o.answers; e.correctIdx = o.correctIdx; e.cutIndices = o.cutIndices; }
        e.qid = "q" + e.seq + "." + q.id + "." + seed.toString(36);
        script.push(e);
      }
    });
    G = saved;
    saveSeen();
    return script;
  }

  /* ---------- title: mode choice ---------- */
  var ghMode = "table";
  function setMode(m) {
    ghMode = m;
    document.querySelectorAll(".mode-tab").forEach(function (b) { b.classList.toggle("sel", b.getAttribute("data-mode") === m); });
    $("panelTable").classList.toggle("hidden", m !== "table");
    $("panelHost").classList.toggle("hidden", m !== "host");
    $("panelJoin").classList.toggle("hidden", m !== "join");
    $("btnStart").classList.toggle("hidden", m !== "table");
    var ml = document.querySelector(".microline");
    if (ml) ml.textContent = m === "table" ? "Pass-and-play · 2–4 players · One phone, one TV"
      : m === "host" ? "Online · you run the show · friends join on their phones"
      : "Online · join the show from your phone";
    paintHostPanel(); paintJoinPanel();
  }
  document.querySelectorAll(".mode-tab").forEach(function (b) {
    b.addEventListener("click", function () { Snd.ensure(); setMode(b.getAttribute("data-mode")); });
  });

  /* ================= host (online show screen) ================= */
  var OG = null;
  function ogPill(txt, warn) {
    var p = $("ogPill"); if (!p) return;
    if (!txt) { p.classList.add("hidden"); return; }
    p.textContent = txt; p.classList.toggle("warn", !!warn); p.classList.remove("hidden");
  }
  function ogSend(o) { if (OG && OG.ws && OG.ws.readyState === 1) { try { OG.ws.send(JSON.stringify(o)); return true; } catch (e) {} } return false; }
  function ogJoined() { return OG ? OG.players.filter(Boolean) : []; }
  function ogSavedHost() { try { return JSON.parse(sessionStorage.getItem("gh_host_room") || "null"); } catch (e) { return null; } }
  function paintHostPanel() {
    var sv = ogSavedHost(), b = $("btnRejoinRoom");
    if (!b) return;
    b.classList.toggle("hidden", !sv);
    if (sv) b.textContent = "REJOIN ROOM " + sv.code;
  }
  function ogCreate() {
    var st = $("hostStatus");
    st.classList.remove("err"); st.textContent = "Opening your room…";
    $("btnCreateRoom").disabled = true;
    fetch(WORKER_URL + "/room", { method: "POST" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) {
        if (!j.code || !j.hostToken) throw new Error("bad reply");
        try { sessionStorage.setItem("gh_host_room", JSON.stringify({ code: j.code, hostToken: j.hostToken })); } catch (e) {}
        ogJoinRoom(j.code, j.hostToken);
      })
      .catch(function () {
        st.classList.add("err");
        st.textContent = "The room server didn't answer. Check your connection and try again — the table game is unaffected.";
      })
      .then(function () { $("btnCreateRoom").disabled = false; });
  }
  function ogJoinRoom(code, hostToken) {
    ogTeardown();
    OG = {
      code: code, hostToken: hostToken, ws: null, dead: false,
      players: [null, null, null, null], snap: null, offset: 0,
      started: false, script: null, idx: 0, curRound: 0, cur: null,
      phase: "connecting", lastRevealQid: null, revealState: {},
      bankedOnce: false, bigLeadDone: false,
      disp: [null, null, null, null], lastStand: null,
      backoff: 1000, tickInt: null, spinInt: null
    };
    showScreen("scr-game");
    seatsVisible(true);
    setLight("open");
    $("roundLabel").textContent = "ONLINE ROOM";
    $("qCounter").textContent = "ROOM " + code;
    ogPill("CONNECTING…", true);
    stage('<div class="q-cat">OPENING THE ROOM</div><div class="round-title">One moment…</div><p class="round-text">Waking Sterling up and chalking the board.</p>');
    hostSay("open");
    OG.tickInt = setInterval(ogTick, 100);
    ogOpenSocket();
  }
  function ogOpenSocket() {
    if (!OG || OG.dead) return;
    var ws;
    try { ws = new WebSocket(wsBase() + "/room/" + OG.code); } catch (e) { ogScheduleReconnect(); return; }
    OG.ws = ws;
    ws.onopen = function () { ogSend({ t: "hello", role: "host", hostToken: OG.hostToken }); };
    ws.onmessage = function (ev) { var m; try { m = JSON.parse(ev.data); } catch (e) { return; } ogOnMsg(m); };
    ws.onclose = function () { if (OG && !OG.dead) { ogPill("RECONNECTING…", true); ogScheduleReconnect(); } };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }
  function ogScheduleReconnect() {
    if (!OG || OG.dead) return;
    var d = OG.backoff; OG.backoff = Math.min(OG.backoff * 2, 8000);
    setTimeout(function () { if (OG && !OG.dead) ogOpenSocket(); }, d);
  }
  function ogTeardown() {
    if (!OG) return;
    OG.dead = true;
    if (OG.tickInt) clearInterval(OG.tickInt);
    if (OG.spinInt) clearInterval(OG.spinInt);
    if (OG.ws) { try { OG.ws.close(); } catch (e) {} }
    OG = null;
    ogPill(null);
    var gg = $("scr-game"); if (gg) gg.classList.remove("sealed");
    clock.running = false;
  }
  function ogOnMsg(m) {
    if (!OG) return;
    if (m.t === "welcome") { OG.backoff = 1000; ogPill("ONLINE · ROOM " + OG.code, false); return; }
    if (m.t === "error") {
      var ls = $("ogLobbyStatus");
      if (ls && OG.phase === "lobby") { ls.textContent = m.msg || ""; ls.classList.add("err"); }
      return;
    }
    if (m.t === "counts") {
      if (OG.phase === "answer") { var c = $("ogCount"); if (c) c.textContent = String(m.answersIn); }
      if (OG.phase === "bet") ogPaintBets(m.betsIn);
      return;
    }
    if (m.t === "cut") { ogOnCut(m); return; }
    if (m.t === "reveal") { ogOnReveal(m, false); return; }
    if (m.t === "ended") { ogOnEnded(m); return; }
    if (m.t === "state") { ogOnState(m.state); return; }
  }
  function ogEntryByQid(qid, snapQ) {
    if (OG.script) {
      for (var i = 0; i < OG.script.length; i++) if (OG.script[i].qid === qid) return OG.script[i];
    }
    if (snapQ) { // resync after a reconnect: rebuild the entry from the snapshot + bank
      var p = ogParseQid(qid);
      if (!p || !BANK[p.bankId]) return null;
      var q = BANK[p.bankId];
      var e = {
        seq: p.seq, round: snapQ.round, qInRound: 0, bank: q, kind: snapQ.kind, cat: snapQ.category,
        diff: q.diff || "medium", baseValue: snapQ.baseValue, multiplier: snapQ.multiplier, windowMs: snapQ.windowMs,
        qid: qid
      };
      if (snapQ.kind === "num") e.trueNum = snapQ.trueNum;
      else { var o = ogOptsFor(q, p.seed); e.answers = o.answers; e.correctIdx = snapQ.correctIdx != null ? snapQ.correctIdx : o.correctIdx; e.cutIndices = o.cutIndices; }
      return e;
    }
    return null;
  }
  function ogOnState(s) {
    if (!OG || !s) return;
    OG.snap = s;
    if (s.players) OG.players = s.players;
    if (s.question) OG.offset = s.question.openedAt - Date.now();
    if (s.phase === "lobby") { if (!OG.started) ogShowLobby(); else ogRenderSeats(); return; }
    if (!OG.started && s.phase !== "lobby") {
      // rejoined a room whose show is already running, without the script:
      // this screen can watch the room but cannot drive it
      if (OG.phase !== "watching") {
        OG.phase = "watching";
        seatsVisible(true); ogRenderSeats();
        stage('<div class="q-cat">ROOM ' + esc(OG.code) + '</div><div class="round-title">This show is already running</div>' +
          '<p class="round-text">This screen rejoined mid-show. The script lived in the tab that started it, so this screen can only watch the scores — start a new room to run a new show.</p>' +
          '<button class="btn-gold" id="ogWatchLobby">BACK TO THE TITLE</button>');
        $("ogWatchLobby").addEventListener("click", function () { ogTeardown(); showScreen("scr-title"); });
      } else ogRenderSeats();
      return;
    }
    if (s.phase === "bet") {
      if (OG.phase !== "bet") { var be = ogEntryByQid(s.bet && s.bet.qid, null); if (be) ogBetWait(be); }
      else ogPaintBets(s.bet ? s.bet.betsIn : 0);
      ogRenderSeats();
    } else if (s.phase === "answer") {
      if (OG.phase !== "answer" || !OG.cur || OG.cur.qid !== s.question.qid) {
        var ae = ogEntryByQid(s.question.qid, s.question);
        if (ae) ogShowQuestion(ae, s.question);
      } else ogRenderSeats();
    } else if (s.phase === "reveal") {
      if (OG.phase !== "reveal" && s.lastReveal) ogOnReveal(s.lastReveal, true);
      else ogRenderSeats();
    } else if (s.phase === "ended") {
      if (OG.phase !== "over") ogWinner();
    }
  }
  function ogShowLobby() {
    OG.phase = "lobby";
    seatsVisible(true);
    ogRenderSeats();
    /* warm the predictable Sterling lines for the table as it stands;
       re-rendered on every join/leave, and the cache keys make a
       changed player set fetch only what is actually new */
    prefetchShowLines(ogJoined().map(function (p) { return p.name; }));
    var joined = ogJoined().length;
    stage('<div class="q-cat">YOUR ROOM IS OPEN — PLAYERS JOIN WITH THIS CODE</div>' +
      '<div class="og-coderow"><div class="og-code">' + esc(OG.code) + "</div>" +
      '<div class="og-qr" id="ogQr"><svg class="wheel-emblem emblem-lobby" viewBox="0 0 120 120" aria-hidden="true"><use href="#emblem-sm"></use></svg><canvas id="ogQrCanvas" width="240" height="240" aria-label="QR code to join this room"></canvas><div class="og-qr-cap">SCAN TO JOIN</div></div>' +
      '<button class="btn-ghost og-copy" id="ogCopy">COPY CODE</button></div>' +
      '<p class="round-text">' + (joined
        ? joined + (joined === 1 ? " player is" : " players are") + " in. Sterling is warming up the room."
        : "Waiting for players — they open the game on their phones, tap JOIN A ROOM, and type the code.") + "</p>" +
      '<button class="btn-gold" id="ogStart"' + (joined >= 2 ? "" : " disabled") + ">START THE SHOW</button>" +
      '<div class="og-statusline" id="ogLobbyStatus"></div>');
    var b = $("ogStart"); if (b) b.addEventListener("click", ogStartShow);
    ogPaintQr();
    var bc = $("ogCopy");
    if (bc) bc.addEventListener("click", function () {
      function copied() {
        bc.textContent = "COPIED ✓";
        setTimeout(function () { if (bc.isConnected) bc.textContent = "COPY CODE"; }, 1600);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(OG.code).then(copied, function () { ogCopyFallback(bc, copied); });
      } else ogCopyFallback(bc, copied);
    });
  }
  /* the join deep link: this page's own directory + ?room=<CODE>,
     derived from the live URL so it works on any host with no
     hardcoded environment; the join side reads ?room= at boot */
  function ogJoinUrl() {
    var base = location.href.split(/[?#]/)[0].replace(/[^/]+\.html?$/i, "");
    if (base.charAt(base.length - 1) !== "/") base += "/";
    return base + "?room=" + OG.code;
  }
  /* draw the lobby QR with the vendored offline generator (qr.js);
     if the library somehow failed to load, the plate hides itself
     and the big code + COPY CODE still carry the lobby */
  function ogPaintQr() {
    var plate = $("ogQr"), cv = $("ogQrCanvas");
    if (!plate || !cv) return;
    var url = ogJoinUrl();
    plate.setAttribute("data-payload", url);
    if (typeof qrcode !== "function") { plate.style.display = "none"; return; }
    try {
      var qr = qrcode(0, "M");
      qr.addData(url);
      qr.make();
      var n = qr.getModuleCount(), quiet = 4, total = n + quiet * 2;
      var px = cv.width, cell = px / total;
      var ctx = cv.getContext("2d");
      ctx.fillStyle = "#FFF6E8";
      ctx.fillRect(0, 0, px, px);
      ctx.fillStyle = "#241331";
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
        if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, Math.ceil(cell), Math.ceil(cell));
      }
    } catch (e) { plate.style.display = "none"; }
  }
  /* clipboard fallback for browsers without the async API */
  function ogCopyFallback(btn, done) {
    try {
      var ta = document.createElement("textarea");
      ta.value = OG.code;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) { done(); return; }
    } catch (e) {}
    btn.textContent = "CODE: " + OG.code;
    setTimeout(function () { if (btn.isConnected) btn.textContent = "COPY CODE"; }, 1600);
  }
  function ogRenderSeats() {
    if (!OG) return;
    var top = $("seatsTop"), bot = $("seatsBottom");
    top.innerHTML = ""; bot.innerHTML = "";
    var best = -1;
    OG.players.forEach(function (p) { if (p && p.score > best) best = p.score; });
    OG.players.forEach(function (p, i) {
      if (!p) return;
      var state = OG.phase === "reveal" && OG.revealState ? (OG.revealState[i] || "neutral") : "neutral";
      var shown = money(Math.round(OG.disp[i] != null ? OG.disp[i] : p.score));
      var tags = [p.cutTwo ? "CUT TWO" : "CUT SPENT"];
      if (!p.connected) tags.push("AWAY");
      var s = el('<div class="seat pod' + i + (p.connected ? "" : " away") + '" data-seat="' + i + '">' +
        '<div class="seat-ava">' + avatarSVG(snapAvatar(p, i), state, i) + "</div>" +
        '<div class="desk"><span class="seat-name">' + esc(p.name) + '</span>' +
        '<span class="seat-score">' + shown + '</span>' +
        '<span class="tag">' + tags.join(" · ") + "</span></div></div>");
      if (p.score === best && best > 0) s.classList.add("lead");
      if (OG.phase === "reveal" && ogFx && ogFx.qid === OG.lastRevealQid) decorateSeat(s, ogFx.seats[i]);
      bot.appendChild(s);
    });
    updateLaurel("og");
  }
  function ogTick() {
    if (!OG) return;
    OG.players.forEach(function (p, i) {
      if (!p) return;
      if (OG.disp[i] == null) OG.disp[i] = p.score;
      var diff = p.score - OG.disp[i];
      if (diff !== 0) {
        OG.disp[i] += diff * 0.35;
        if (Math.abs(p.score - OG.disp[i]) < 1) OG.disp[i] = p.score;
        var seat = document.querySelector('.seat[data-seat="' + i + '"]');
        if (seat) {
          seat.classList.toggle("tick-up", diff > 0.5);
          var sc = seat.querySelector(".seat-score");
          if (sc) sc.textContent = money(Math.round(OG.disp[i]));
        }
      }
    });
    if (OG.phase === "answer" && OG.snap && OG.snap.question) {
      var q = OG.snap.question;
      var rem = q.deadline - (Date.now() + OG.offset);
      if (rem < 0) rem = 0;
      clock.left = rem / 1000;
      drawClock();
      var vEl = $("qValue");
      if (vEl && OG.cur && !q.betted) {
        var frac = Math.min(Math.max((q.windowMs - rem) / q.windowMs, 0), 1);
        var v = Math.round(OG.cur.baseValue * OG.cur.multiplier * (1 - 0.5 * frac));
        var txt = money(v);
        if (vEl.textContent !== txt) {
          vEl.textContent = txt;
          var wrap = vEl.parentElement;
          if (wrap) wrap.classList.toggle("low", frac > 0.75);
        }
      }
      if (rem <= 0) clock.running = false;
    }
  }
  function ogStartShow() {
    if (!OG || OG.started || ogJoined().length < 2) return;
    OG.started = true;
    $("scr-game").classList.remove("sealed");
    resetLineBags();
    OG.script = ogBuildScript();
    OG.idx = 0; OG.curRound = 0;
    OG.lastStand = { scores: [0, 0, 0, 0], ranks: {} };
    Snd.ensure(); Snd.play("theme");
    sayLive("greeting", { names: ogJoined().map(function (p) { return p.name; }) }, authoredLine("open"),
      { window: 2500, guard: function () { return !!OG && OG.phase === "intro"; } });
    /* tonight's special: fetched once per show; if it lands before
       Round 1 reaches its third question, it takes that slot in the
       script (the phones only ever see its qid at publish time) */
    var ogRef = OG;
    if (LIVE_OK) fetchJSON(NIGHTLY_URL + "/tonight", null, 2500).then(function (j) {
      if (!ogRef || OG !== ogRef || ogRef.dead || !validServed(j)) return;
      if (!ogRef.script || ogRef.idx > 2) return;
      var slot = ogRef.script[2];
      if (!slot || slot.round !== 1 || slot.qInRound !== 2 || slot.special) return;
      ogRef.script[2] = ogSpecialEntry(j, (Math.random() * 2147483646 + 1) | 0);
    });
    ogIntro();
  }
  function ogStandingsHTML() {
    var idxs = [];
    OG.players.forEach(function (p, i) { if (p) idxs.push(i); });
    var order = idxs.slice().sort(function (a, b) { return OG.players[b].score - OG.players[a].score; });
    var ranks = {}; order.forEach(function (pi, pos) { ranks[pi] = pos; });
    var prev = OG.lastStand || { scores: [0, 0, 0, 0], ranks: {} };
    var disp = order.slice();
    if (disp.length > 1) { var t = disp[0]; disp[0] = disp[1]; disp[1] = t; }
    var pods = disp.map(function (pi) {
      var p = OG.players[pi], pos = ranks[pi];
      var chips = "";
      var gain = p.score - (prev.scores[pi] || 0);
      var rd = (prev.ranks[pi] != null ? prev.ranks[pi] : pos) - pos;
      if (gain > 0) chips += '<span class="gain-chip">' + mplus(gain) + "</span>";
      if (rd > 0) chips += '<span class="delta up">▲ ' + rd + "</span>";
      else if (rd < 0) chips += '<span class="delta down">▼ ' + (-rd) + "</span>";
      var badgeCls = pos === 0 ? "gold" : pos === 1 ? "silver" : pos === 2 ? "bronze" : "plain";
      return '<div class="podium pod' + pi + " big rank" + (pos + 1) + (pos === 0 ? " lit" : "") + '">' +
        '<span class="rank-badge ' + badgeCls + '">' + (pos + 1) + "</span>" + (pos === 0 ? laurelBadge() : "") + chips +
        avatarSVG(snapAvatar(p, pi), pos === 0 ? "cheer" : "neutral", pi) +
        '<div class="desk"><div class="pname">' + esc(p.name) + '</div><div class="pmoney">' + money(p.score) + "</div></div></div>";
    }).join("");
    var line = order.length < 2
      ? "The race is young. The kitchen is everybody's tonight."
      : esc(OG.players[order[0]].name) + " is cooking. " + esc(OG.players[order[order.length - 1]].name) + " — the kitchen is still open.";
    OG.lastStand = { scores: OG.players.map(function (p) { return p ? p.score : 0; }), ranks: ranks };
    return '<div class="race-wrap"><div class="race-stage">' +
      '<div class="race-sterling"><div class="bubble bubble-stand">' + line + "</div>" + sterlingSVG("smirk") + "</div>" +
      '<div class="race-podiums">' +
      '<svg class="swap-arrows" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="M28,34 Q40,4 54,10" fill="none" stroke="#35D461" stroke-width="1.1" stroke-linecap="round" stroke-dasharray="3 2.6" opacity=".55"/>' +
      '<path d="M54,10 l-4.4,.4 M54,10 l-1.2,4.2" stroke="#35D461" stroke-width="1.1" stroke-linecap="round" opacity=".55"/>' +
      '<path d="M58,8 Q70,32 82,28" fill="none" stroke="#FF6B5E" stroke-width="1.1" stroke-linecap="round" stroke-dasharray="3 2.6" opacity=".45"/></svg>' +
      pods + "</div></div></div>";
  }
  function ogIntro() {
    var e = OG.script[OG.idx]; if (!e) return;
    OG.curRound = e.round;
    OG.phase = "intro";
    setLight(e.round === 1 ? "open" : e.round === 2 ? "hot" : "vault");
    seatsVisible(false);
    $("roundLabel").textContent = { 1: "ROUND 1 · THE WARM-UP", 2: "ROUND 2 · DOUBLE MONEY", 3: "ROUND 3 · THE BIG FINISH" }[e.round];
    $("qCounter").textContent = "QUESTION " + e.seq + " OF 15";
    var titles = { 1: "THE WARM-UP", 2: "DOUBLE MONEY", 3: "THE BIG FINISH" };
    var texts = {
      1: "Six questions, and everybody answers every one — on your own phones this time. Sterling spins the category. Easy pays $100, medium $200, hard $300, and the value drains while the room thinks. When the window closes, every correct phone banks the money. Closest-number questions: type your number — the nearest takes it.",
      2: "Same game, double money — $200, $400, $600. Your one lifeline is live: each of you holds a single Cut Two for the whole show. Call it from your phone before the window closes and two wrong answers vanish for everybody.",
      3: "Three questions. Before each one, bet on yourself from your phone: 1, 2 or 3 chips — a chip is $100, and the bet stays secret until the reveal. Get it right and the bet pays in full. Get it wrong and you lose nothing but face."
    };
    stage('<div class="bumper"><div class="round-kicker">ROUND ' + e.round + "</div>" +
      '<div class="round-title">' + titles[e.round] + "</div>" +
      '<p class="round-text">' + texts[e.round] + "</p>" +
      (e.round > 1 ? ogStandingsHTML() : "") +
      '<button class="btn-gold" id="ogRoundGo">' + (e.round === 1 ? "START THE WARM-UP" : e.round === 2 ? "DOUBLE IT" : "TO THE BIG FINISH") + "</button></div>");
    /* Round 1 does NOT set its bumper line here: the greeting owns
       the bubble for this screen (setting the bumper line in the same
       tick as ogStartShow's greeting was the same-tick overwrite that
       killed every live greeting). The Round-1 bumper line is set
       when the first question's spin begins, in ogSpinThenPublish. */
    if (e.round !== 1) hostSay("r" + e.round);
    $("ogRoundGo").addEventListener("click", ogServe);
  }
  function ogServe() {
    if (!OG || !OG.script) return;
    var e = OG.script[OG.idx];
    if (!e) { ogFinish(); return; }
    OG.cur = e;
    seatsVisible(true);
    $("qCounter").textContent = "QUESTION " + e.seq + " OF 15";
    if (e.round === 3) { ogSend({ t: "bet_phase", qid: e.qid }); ogBetWait(e); }
    else ogSpinThenPublish(e);
  }
  function ogBetWait(e) {
    OG.phase = "bet"; OG.cur = e;
    seatsVisible(true); ogRenderSeats();
    stage('<div class="round-kicker">THE BIG FINISH · QUESTION ' + (e.qInRound + 1) + " OF 3</div>" +
      '<div class="round-title">BET TIME</div>' +
      '<p class="round-text">Bets are being placed on phones — 1, 2 or 3 chips, secret until the reveal. A chip is $100; right pays the bet, wrong costs nothing.</p>' +
      '<div><span class="og-count">BETS IN&nbsp;<b id="ogBetsIn">0</b> / ' + ogJoined().length + "</span></div>" +
      '<div style="margin-top:14px"><button class="btn-gold" id="ogBetsGo">BETS ARE IN — SPIN THE CATEGORY</button></div>');
    hostSay("bet");
    $("ogBetsGo").addEventListener("click", function () { ogSpinThenPublish(e); });
    if (OG.snap && OG.snap.bet) ogPaintBets(OG.snap.bet.betsIn);
  }
  function ogPaintBets(n) { var b = $("ogBetsIn"); if (b) b.textContent = String(n || 0); }
  function ogSpinThenPublish(e) {
    OG.phase = "spin";
    seatsVisible(true); ogRenderSeats();
    var chips = CATS.map(function (c) {
      var cs = catStyle(c);
      return '<span class="cat-chip" data-cat="' + esc(c) + '" style="--chip:' + cs.mid + ";--chipd:" + cs.sh + ";color:" + (CATTX[c] || "#FFF6E8") + '">' + catEmblem(c) + "<span>" + esc(c) + "</span></span>";
    }).join("");
    stage('<div class="q-cat">STERLING SPINS THE CATEGORIES</div>' +
      spinFrameHTML(chips) +
      '<p class="round-text">Where it stops, nobody knows. Sterling knows. Sterling always knows.</p>');
    if (e.special && e.intro) $("hostLine").textContent = e.intro;
    else if (e.round === 1 && e.qInRound === 0) hostSay("r1");   // the Round-1 bumper line, set where the first spin's lines are set (see ogIntro)
    else hostSay("spin", { cat: e.cat });
    Snd.play("spin");
    stClass("st-glance", 1600);
    clearInterval(OG.spinInt);
    runSpinChips(e.cat,
      function () { return !!OG && OG.phase === "spin"; },
      function (id) { OG.spinInt = id; },
      function () { ogPublish(e); });
  }
  function ogPublish(e) {
    OG.phase = "publishing";
    var msg = {
      t: "publish_question", qid: e.qid, round: e.round, kind: e.kind, category: e.cat,
      deadlineMs: e.windowMs, baseValue: e.baseValue, multiplier: e.multiplier
    };
    if (e.kind === "num") msg.trueNum = e.trueNum;
    else { msg.correctIdx = e.correctIdx; msg.answersCount = 4; msg.cutIndices = e.cutIndices; }
    ogSend(msg);
  }
  function ogShowQuestion(e, q) {
    OG.phase = "answer"; OG.cur = e;
    applyCat(e.cat);
    seatsVisible(true); ogRenderSeats();
    $("qCounter").textContent = "QUESTION " + e.seq + " OF 15";
    var head = e.kind === "survey" ? "MOST PEOPLE SAY…" : e.kind === "num" ? "CLOSEST NUMBER" : (e.diff || "").toUpperCase();
    var top = '<div class="q-headrow"><span class="cat-pill' + (e.special ? " gilded" : "") + '">' + catEmblem(e.cat) + (e.special ? "TONIGHT'S GILDED QUESTION" : esc(e.cat.toUpperCase())) + '</span><span class="q-kind">' + head + "</span></div>" +
      '<div class="q-text">' + esc(e.bank.q) + "</div>";
    var meta = '<div class="q-meta">' + (q.betted
      ? '<div class="q-for">Bets are in — this one pays the bet, and only the bet.</div>'
      : '<div class="q-value"><small>QUESTION VALUE</small><span id="qValue">' + money(e.baseValue * e.multiplier) + "</span></div>") + timerHTML() + "</div>";
    if (e.kind === "num") {
      stage(top + meta +
        '<div class="q-for">No options. No hiding. Numbers are being typed on phones — the closest takes it.</div>' +
        '<div><span class="og-count">ANSWERS IN&nbsp;<b id="ogCount">' + (q.answersIn || 0) + "</b> / " + ogJoined().length + "</span></div>" +
        '<div style="margin-top:14px"><button class="btn-gold" id="ogCallIt">CALL IT — NUMBERS IN</button></div>');
    } else {
      var btns = e.answers.map(function (t, i) {
        var cut = q.cut && q.cut.indices.indexOf(i) >= 0;
        return '<button class="ans-btn' + (cut ? " dim" : "") + '" style="--d:' + (i * 0.09).toFixed(2) + 's" disabled><span class="letter">' + (i + 1) + "</span><span>" + esc(t) + "</span></button>";
      }).join("");
      stage(top + meta +
        '<div class="answers pop-in">' + btns + "</div>" +
        '<div><span class="og-count">ANSWERS IN&nbsp;<b id="ogCount">' + (q.answersIn || 0) + "</b> / " + ogJoined().length + "</span></div>" +
        '<div style="margin-top:12px"><button class="btn-gold" id="ogCallIt">CALL IT — CLOSE THE WINDOW</button></div>');
    }
    hostSay(e.kind === "num" ? "numQ" : "read", { cat: e.cat });
    var call = $("ogCallIt");
    if (call) call.addEventListener("click", function () { ogSend({ t: "reveal", qid: e.qid }); });
    clock.total = e.windowMs / 1000; clock.left = clock.total; clock.running = true; Snd._lw = -1;
    drawClock();
  }
  function ogOnCut(m) {
    if (!OG || !OG.cur || m.qid !== OG.cur.qid) return;
    document.querySelectorAll(".answers .ans-btn").forEach(function (b, i) { if (m.indices.indexOf(i) >= 0) b.classList.add("dim"); });
    var p = OG.players[m.bySeat];
    sayLive("beat", { beat: "cut_used", name: p ? p.name : "A player" }, authoredLine("cut", { name: p ? p.name : "A player" }));
    Snd.play("gold");
  }
  function ogOnReveal(r, fromSnap) {
    if (!OG || !OG.cur) return;
    if (OG.lastRevealQid === r.qid && OG.phase === "reveal") return;
    OG.lastRevealQid = r.qid;
    OG.phase = "reveal";
    clock.running = false;
    (r.scores || []).forEach(function (sc, i) { if (OG.players[i] && sc != null) OG.players[i].score = sc; });
    /* the last question's reveal settles the final standings — start
       the winner line's generation now, not at the finale screen */
    if (OG.script && OG.idx === OG.script.length - 1) winnerPrefetchAtReveal(winnerFactsFrom(OG.players));
    var e = OG.cur;
    var winners = [];
    OG.revealState = {};
    (r.results || []).forEach(function (res) {
      OG.revealState[res.seat] = res.correct ? "cheer" : "slump";
      if (res.correct) winners.push(res.seat);
    });
    /* Pass D4: the table's scoring grammar, derived from this very
       payload. banked > 0 banks; a wrong answer that was actually
       given (pick/num present) misses; a seat that never answered
       keeps the plain slump it already had — no third treatment.
       Guess questions tag their correct seats CLOSEST. Painted at
       the seats by ogRenderSeats, and repainted by any mid-reveal
       snapshot re-render via ogFx. */
    var guessQ = (e.kind === "num" || e.kind === "survey");
    var fxSeats = {}, bankSeq = 0, anyBank = false;
    (r.results || []).forEach(function (res) {
      var fx = null;
      if (res.banked > 0) { fx = { delta: "bank", amt: res.banked, delay: bankSeq++ * 0.12 }; anyBank = true; }
      else if (!res.correct && (res.pick != null || res.num != null)) fx = { delta: "miss", delay: res.seat * 0.05 };
      if (guessQ && res.correct) { fx = fx || {}; fx.closest = true; }
      if (fx) fxSeats[res.seat] = fx;
    });
    ogFx = { qid: r.qid, seats: fxSeats };
    ogRenderSeats();
    var nextBtn = '<div style="margin-top:12px"><button class="btn-gold" id="ogNext">CONTINUE</button></div>';
    var head = '<div class="q-headrow"><span class="cat-pill">' + catEmblem(e.cat) + esc(e.cat.toUpperCase()) + '</span><span class="q-kind">' + (e.kind === "num" ? "THE NUMBER WAS" : "THE ANSWER") + "</span></div>" +
      '<div class="q-text" style="font-size:clamp(18px,3vw,25px)">' + esc(e.bank.q) + "</div>";
    if (e.kind === "num") {
      var tn = r.trueNum != null ? r.trueNum : e.trueNum;
      stage(head + '<div class="wager-amt">' + Number(tn).toLocaleString("en-US") + "</div>" +
        (anyBank ? "" : '<div class="delta"><span class="down">Nobody got close. The number keeps its dignity.</span></div>') +
        '<p class="why">' + esc(e.bank.why) + "</p>" + nextBtn);
      ogRevealSay(winners.length ? "numHit" : "numMiss", { name: winners.length && OG.players[winners[0]] ? OG.players[winners[0]].name : "" }, winners);
    } else {
      var ci = r.correctIdx != null ? r.correctIdx : e.correctIdx;
      var btns = e.answers.map(function (t, i) {
        return '<button class="ans-btn' + (i === ci ? " correct" : " dim") + '" disabled><span class="letter">' + (i + 1) + "</span><span>" + esc(t) + "</span></button>";
      }).join("");
      stage(head + '<div class="answers">' + btns + "</div>" +
        (anyBank ? "" : '<div class="delta"><span class="down">No one had it. The money stays in Sterling\'s pocket — this time.</span></div>') +
        '<p class="why">' + esc(e.bank.why) + "</p>" + nextBtn);
      var joined = ogJoined().length;
      var hk = winners.length === 0 ? "allMiss" : (winners.length === joined ? "allHit" : "someHit");
      ogRevealSay(hk, { name: winners.length && OG.players[winners[0]] ? OG.players[winners[0]].name : "" }, winners);
    }
    Snd.play(winners.length ? "correct" : "wrong");
    /* Pass P: lean-in, the nod for a fat bank, coins to the winners */
    stClass("st-lean", 1000);
    var ogMax = 0;
    (r.results || []).forEach(function (res) { if (res.banked > ogMax) ogMax = res.banked; });
    if (ogMax >= 300) stClass("st-nod", 600);
    (r.results || []).forEach(function (res, k) { if (res.banked > 0) bankFx(res.seat, k * 0.12); });
    $("ogNext").addEventListener("click", function () { OG.idx++; ogAdvance(); });
  }
  function ogAdvance() {
    if (!OG || !OG.script) {
      stage('<div class="round-title">This screen can\'t drive the show</div><p class="round-text">It rejoined without the script. Start a new room for the next show.</p><button class="btn-gold" id="ogWatchLobby2">BACK TO THE TITLE</button>');
      var b = $("ogWatchLobby2"); if (b) b.addEventListener("click", function () { ogTeardown(); showScreen("scr-title"); });
      return;
    }
    if (OG.idx >= OG.script.length) { ogFinish(); return; }
    var e = OG.script[OG.idx];
    if (e.round !== OG.curRound) { ogIntro(); return; }
    ogServe();
  }
  function ogFinish() {
    OG.phase = "finishing";
    ogSend({ t: "end_show" });
    setTimeout(function () { if (OG && OG.phase === "finishing") ogWinner(); }, 700);
  }
  function ogOnEnded(m) {
    if (!OG) return;
    (m.scores || []).forEach(function (sc, i) { if (OG.players[i] && sc != null) OG.players[i].score = sc; });
    ogWinner();
  }
  function ogWinner() {
    if (!OG || OG.phase === "over") return;
    OG.phase = "over";
    clock.running = false;
    seatsVisible(false);
    var idxs = [];
    OG.players.forEach(function (p, i) { if (p) idxs.push(i); });
    if (!idxs.length) { ogTeardown(); showScreen("scr-title"); return; }
    var best = Math.max.apply(null, idxs.map(function (i) { return OG.players[i].score; }));
    var tied = idxs.filter(function (i) { return OG.players[i].score === best; });
    var winSeat = tied[0], p = OG.players[winSeat];
    var ogStand = idxs.map(function (ii) { return { name: OG.players[ii].name, score: OG.players[ii].score }; })
      .sort(function (a, b) { return b.score - a.score; });
    sayWinner({ winner: p.name, standings: ogStand, topScore: best }, authoredLine("winner", { name: p.name }),
      function () { return !!OG && OG.phase === "over"; });
    var order = idxs.slice().sort(function (a, b) { return OG.players[b].score - OG.players[a].score; });
    var ranks = {}; order.forEach(function (pi, pos) { ranks[pi] = pos; });
    var disp = order.slice();
    if (disp.length > 1) { var t = disp[0]; disp[0] = disp[1]; disp[1] = t; }
    var pods = disp.map(function (ii) {
      var pp = OG.players[ii], pos = ranks[ii];
      var badgeCls = pos === 1 ? "silver" : pos === 2 ? "bronze" : "plain";
      var top = ii === winSeat
        ? '<span class="champ-tag">★ CHAMPION</span>'
        : '<span class="rank-badge ' + badgeCls + '">' + (pos + 1) + "</span>";
      return '<div class="podium pod' + ii + " big rank" + (pos + 1) + (ii === winSeat ? " winner-podium lit" : "") + '">' + top + (ii === winSeat ? laurelBadge() : "") +
        avatarSVG(snapAvatar(pp, ii), ii === winSeat ? "cheer" : "neutral", ii) +
        '<div class="desk"><div class="pname">' + esc(pp.name) + '</div><div class="pmoney">' + money(pp.score) + "</div></div></div>";
    }).join("");
    var tieNote = "";
    if (tied.length > 1) {
      var names = tied.map(function (ii) { return OG.players[ii].name; }).join(" and ");
      tieNote = '<p class="round-text tie-note">Dead level at the top — ' + esc(names) + " matched at " + money(best) +
        ". The crown goes to the earliest seat, and the rematch is now legally mandatory.</p>";
    }
    stage('<div class="finale-wrap"><div class="spot-cone" aria-hidden="true"></div><div class="finale-main">' +
      '<div class="marquee finale-marquee"><div class="kicker">THE GILDED HOUR · FINAL RESULT</div>' +
      '<div class="winner-word">WINNER</div>' +
      '<div class="winner-name">' + esc(p.name) + "</div>" +
      '<div class="winner-total">' + money(p.score) + "</div></div>" +
      '<div class="sterling-zone"><div class="bubble bubble-finale">Sealed with a kiss of confetti — the hour is yours, ' + esc(p.name) + ".</div>" +
      sterlingSVG("present", "sterling sterling-lg") + "</div></div>" +
      tieNote +
      '<div class="podium-row finale-row">' + pods + "</div>" +
      '<div class="finale-btns"><button class="btn-gold" id="ogAgain">PLAY AGAIN — NEW ROOM</button>' +
      '<button class="btn-ghost" id="ogLobby">BACK TO LOBBY</button></div></div>');
    Snd.play("finale");
    startLeaves();
    buildBulbs(document.querySelector(".finale-marquee"));
    finaleCeremony();
    $("ogAgain").addEventListener("click", function () {
      stopLeaves();
      ogTeardown();
      showScreen("scr-title");
      setMode("host");
      ogCreate();
    });
    $("ogLobby").addEventListener("click", function () { stopLeaves(); ogTeardown(); showScreen("scr-title"); });
  }
  $("btnCreateRoom").addEventListener("click", function () { Snd.ensure(); ogCreate(); });
  $("btnRejoinRoom").addEventListener("click", function () {
    var sv = ogSavedHost();
    if (sv) { Snd.ensure(); ogJoinRoom(sv.code, sv.hostToken); }
  });

  /* ================= player (online podium) ================= */
  var JP = null;
  function jpSaved() { try { return JSON.parse(localStorage.getItem("gh_player") || "null"); } catch (e) { return null; } }
  /* the pad's portrait pick (item 6): remembered on-device under its
     own key, beside the remembered name and never with the room
     code. null = never picked, in which case no avatar field is
     sent and the server's seat default applies */
  function jpAvatarPref() {
    try {
      var v = parseInt(localStorage.getItem("gh_avatar"), 10);
      return Number.isInteger(v) && v >= 0 && v < 8 ? v : null;
    } catch (e) { return null; }
  }
  function jpOwnAvatar() {
    var me = jpMe();
    if (me && Number.isInteger(me.avatar) && me.avatar >= 0 && me.avatar < 8) return me.avatar;
    if (JP && Number.isInteger(JP.avatar)) return JP.avatar;
    return JP && JP.seat != null ? JP.seat % 8 : 0;
  }
  /* the room a deep link (?room= / ?code=) prefilled, if any — when
     it differs from the saved seat's room, the two doors on the join
     screen must say they lead to different rooms (fix #10) */
  var jpDeepRoom = null;
  function paintJoinPanel() {
    var sv = jpSaved(), b = $("btnResumePlayer");
    if (!b) return;
    b.classList.toggle("hidden", !sv);
    if (sv) {
      b.textContent = "REJOIN AS " + (sv.name || "PLAYER") + " · ROOM " + sv.code +
        (jpDeepRoom && jpDeepRoom !== sv.code ? " — A DIFFERENT ROOM" : "");
    }
  }
  function jpSetConn(txt, warn) {
    var c = $("jpConn"); if (!c) return;
    c.textContent = txt; c.classList.toggle("warn", !!warn);
  }
  function jpToast(msg) {
    var t = $("jpToast"); if (!t) return;
    t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(jpToast._t);
    jpToast._t = setTimeout(function () { t.classList.add("hidden"); }, 2600);
  }
  function jpSend(o) { if (JP && JP.ws && JP.ws.readyState === 1) { try { JP.ws.send(JSON.stringify(o)); return true; } catch (e) {} } return false; }
  function jpConnect(code, name, reclaimToken) {
    jpTeardown();
    JP = {
      code: code, name: name || "", seat: null, reclaimToken: reclaimToken || null,
      avatar: jpAvatarPref(),
      ws: null, snap: null, offset: 0, dead: false, welcomed: false,
      backoff: 1000, tickInt: null, betSel: 1, sentNum: null, sentBet: null
    };
    showScreen("scr-join");
    $("jpRoom").textContent = "ROOM " + code;
    jpSetConn("JOINING…", true);
    $("jpMain").innerHTML = '<div class="jp-card"><div class="jp-phaseword" id="jpPhaseWord">JOINING</div><div class="jp-hi">Joining the room…</div><p class="jp-sub">Finding your podium.</p></div>';
    jpPaintClock();
    JP.tickInt = setInterval(jpTick, 250);
    jpOpenSocket();
  }
  function jpOpenSocket() {
    if (!JP || JP.dead) return;
    var ws;
    try { ws = new WebSocket(wsBase() + "/room/" + JP.code); } catch (e) { jpScheduleReconnect(); return; }
    JP.ws = ws;
    ws.onopen = function () {
      var hello = JP.reclaimToken
        ? { t: "hello", role: "player", reclaimToken: JP.reclaimToken, name: JP.name || undefined }
        : { t: "hello", role: "player", name: JP.name };
      /* the portrait pick rides the hello when there is one; without
         a pick the field stays off the wire entirely (server keeps
         its stored/default avatar, old-server compatible) */
      if (Number.isInteger(JP.avatar)) hello.avatar = JP.avatar;
      jpSend(hello);
    };
    ws.onmessage = function (ev) { var m; try { m = JSON.parse(ev.data); } catch (e) { return; } jpOnMsg(m); };
    ws.onclose = function () {
      if (!JP || JP.dead) return;
      JP.welcomed = false;
      jpSetConn("REJOINING…", true);
      jpScheduleReconnect();
    };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }
  function jpScheduleReconnect() {
    if (!JP || JP.dead) return;
    var d = JP.backoff; JP.backoff = Math.min(JP.backoff * 2, 5000);
    setTimeout(function () { if (JP && !JP.dead) jpOpenSocket(); }, d);
  }
  function jpTeardown() {
    if (!JP) return;
    JP.dead = true;
    if (JP.tickInt) clearInterval(JP.tickInt);
    if (JP.ws) { try { JP.ws.close(); } catch (e) {} }
    JP = null;
  }
  function jpOnMsg(m) {
    if (!JP) return;
    if (m.t === "welcome") {
      JP.seat = m.seat;
      if (m.reclaimToken) JP.reclaimToken = m.reclaimToken;
      JP.welcomed = true; JP.backoff = 1000;
      try { localStorage.setItem("gh_player", JSON.stringify({ code: JP.code, reclaimToken: JP.reclaimToken, name: JP.name })); } catch (e) {}
      /* the remembered name: a successful join keeps just the name
         on the device so the join screen can prefill it next time
         (the room code is never stored here — gh_player above is
         the separate seat-reclaim record) */
      if (JP.name) { try { localStorage.setItem("gh_name", JP.name); } catch (e) {} }
      jpSetConn("IN THE ROOM", false);
      paintJoinPanel();
      return;
    }
    if (m.t === "error") {
      if (!JP.welcomed && /Seat not found|Room is full/.test(m.msg || "")) {
        try { localStorage.removeItem("gh_player"); } catch (e) {}
        jpTeardown();
        showScreen("scr-title");
        setMode("join");
        var st = $("joinStatus");
        st.classList.add("err");
        st.textContent = (m.msg || "Couldn't join.") + " Check the code with your host.";
        paintJoinPanel();
        return;
      }
      jpToast(m.msg || "That didn't land.");
      return;
    }
    if (m.t === "counts") {
      if (!JP.snap) return;
      if (JP.snap.question && m.qid === JP.snap.question.qid) JP.snap.question.answersIn = m.answersIn;
      if (JP.snap.bet && m.qid === JP.snap.bet.qid) JP.snap.bet.betsIn = m.betsIn;
      var c = $("jpCount");
      if (c) c.textContent = (m.answersIn || 0) + " / " + JP.snap.players.filter(Boolean).length + " IN";
      return;
    }
    if (m.t === "state") {
      var prevQid = JP.snap && JP.snap.question ? JP.snap.question.qid : null;
      JP.snap = m.state;
      /* the clock offset anchors when a question first appears and is
         HELD while that question runs: a state snapshot re-sent mid-
         question (above all the reconnect/resync snapshot) must not
         restart the pad's clocks at a full window */
      if (m.state.question && m.state.question.qid !== prevQid) JP.offset = m.state.question.openedAt - Date.now();
      jpRender();
      return;
    }
    /* counts / accepted / cut / reveal / ended: the state snapshot that
       follows carries everything the podium needs */
  }
  /* a category the pad genuinely can't place (a fallback pad whose
     question never resolved) degrades to neutral gold, never to
     another category's colours */
  var JP_GOLD = { hi: "#FFE29A", mid: "#FFB03A", lo: "#FF8A3C", sh: "#B96A12", rgb: "255,185,58", tx: "#431A04" };
  function jpApplyCat(cat) {
    var known = !!CATSTYLE[cat];
    var cs = known ? catStyle(cat) : JP_GOLD, g = $("scr-join");
    if (!g) return;
    g.style.setProperty("--cat", cs.mid);
    g.style.setProperty("--cat-hi", cs.hi);
    g.style.setProperty("--cat-lo", cs.lo);
    g.style.setProperty("--cat-sh", cs.sh);
    g.style.setProperty("--cat-rgb", cs.rgb);
    g.style.setProperty("--cat-shi", cs.shi || cs.hi);
    g.style.setProperty("--cat-smid", cs.smid || cs.mid);
    g.style.setProperty("--cat-tx", known ? (CATTX[cat] || "#FFF6E8") : JP_GOLD.tx);
    g.classList.add("cat-on");
  }
  /* the bank pulse: gold rises up the pad when THIS player's answer
     banks — once per reveal, keyed to the new score so snapshot
     re-renders never re-fire it */
  function jpBankPulse(score, banked) {
    var key = score + "|" + banked;
    if (JP._pulseKey === key) return;
    JP._pulseKey = key;
    var g = $("scr-join"); if (!g) return;
    var d = document.createElement("div");
    d.className = "jp-pulse";
    g.appendChild(d);
    d.addEventListener("animationend", function () { d.remove(); });
    setTimeout(function () { if (d.isConnected) d.remove(); }, 1600);
  }
  /* Design pass item 2 — the pad clock. The drain line and the phase
     word are DERIVED from the snapshot and the server's timestamps on
     every paint, never accumulated, so a reconnect or a resync lands
     on the true fraction and the true word at once.
     Timing source: the state snapshot's question {openedAt, deadline,
     windowMs}; JP.offset maps pad time onto server time — anchored
     when a question first appears and held while it runs (jpOnMsg),
     the same arithmetic jpTick has always used for the in-pad bar and
     the seconds pill. The bet snapshot
     carries NO deadline — the host closes betting by publishing the
     question, and the server stamps nothing for the bet window — so
     the bet phase is never drained: the line rests full and dim and
     the word carries the moment instead. */
  function jpPhaseWord() {
    if (!JP) return "";
    var s = JP.snap;
    if (!s || JP.seat == null) return "JOINING";
    if (s.phase === "lobby") return "IN THE LOBBY";
    if (s.phase === "bet") return "YOUR BET";
    if (s.phase === "answer") {
      var q = s.question;
      if (!q || JP._blind) return "WATCH THE SCREEN";
      var answered = q.kind === "num"
        ? (s.yourNum != null || (JP.sentNum && JP.sentNum.qid === q.qid))
        : s.yourPick != null;
      if (answered) return "LOCKED IN";
      return q.kind === "num" ? "YOUR NUMBER" : "ANSWER";
    }
    if (s.phase === "reveal") return "THE VERDICT";
    if (s.phase === "ended") return "ENDED";
    return "";
  }
  function jpClockState() {
    if (!JP || !JP.snap) return null;
    var s = JP.snap;
    if (s.phase !== "answer" || !s.question) return null;
    var q = s.question;
    if (!q.windowMs || q.deadline == null) return null;
    var rem = q.deadline - (Date.now() + JP.offset);
    if (rem < 0) rem = 0;
    return { frac: Math.min(1, rem / q.windowMs), rem: rem };
  }
  function jpPaintClock() {
    if (!JP) return;
    var fill = $("jpClockFill");
    if (fill) {
      var cs = jpClockState();
      if (!cs) { fill.style.width = "100%"; fill.classList.add("idle"); fill.classList.remove("low"); }
      else {
        fill.style.width = (cs.frac * 100) + "%";
        fill.classList.remove("idle");
        fill.classList.toggle("low", cs.rem < 5000);
      }
    }
    var w = $("jpPhaseWord");
    if (w) { var t = jpPhaseWord(); if (t && w.textContent !== t) w.textContent = t; }
  }
  function jpMe() { return JP && JP.snap && JP.seat != null ? JP.snap.players[JP.seat] : null; }
  function jpLeader() {
    if (!JP || !JP.snap) return null;
    var best = null;
    JP.snap.players.forEach(function (p) { if (p && (!best || p.score > best.score)) best = p; });
    return best;
  }
  function jpStandRows() {
    var rows = JP.snap.players.map(function (p, i) { return p ? { p: p, seat: i } : null; }).filter(Boolean)
      .sort(function (a, b) { return b.p.score - a.p.score; });
    return rows.map(function (r, pos) {
      return '<div class="jp-standrow' + (r.seat === JP.seat ? " me" : "") + '"><span class="name-dot" style="background:' + PCOLORS[r.seat] + '"></span>' +
        "<span>" + (pos + 1) + ". " + esc(r.p.name) + (r.p.connected ? "" : " (away)") + '</span><span class="sc">' + money(r.p.score) + "</span></div>";
    }).join("");
  }
  /* tonight's special is not in the bank: for a "nightly." qid the pad
     fetches the same served question from the nightly worker (its
     answer order is date-seeded, identical on every phone). Until the
     fetch lands — or if it never does — the pad falls back to four
     numbered buttons and the show screen carries the wording, so the
     pad is never dead and a pick always works. */
  var jpNightly = { qid: null, data: null };
  function jpNightlyFor(qid) {
    if (jpNightly.qid !== qid) {
      jpNightly = { qid: qid, data: null };
      if (!LIVE_OK) return null;
      fetchJSON(NIGHTLY_URL + "/tonight", null, 2500).then(function (j) {
        if (jpNightly.qid !== qid) return;
        if (validServed(j)) jpNightly.data = j.question;
        if (JP && !JP.dead) jpRender();
      });
    }
    return jpNightly.data;
  }
  function jpQuestionData() {
    var q = JP.snap && JP.snap.question;
    if (!q) return null;
    var p = ogParseQid(q.qid);
    if (!p) {
      if (/^nightly\.\d{4}-\d{2}-\d{2}\.[0-9a-z]+$/.test(String(q.qid || ""))) {
        var sv = jpNightlyFor(q.qid);
        if (sv) return { q: q, bank: { q: sv.q, why: sv.why || "", cat: sv.cat }, opts: { answers: sv.a.slice(), correctIdx: sv.correct, cutIndices: [] } };
        return {
          q: q,
          bank: { q: "Tonight's Gilded Question — eyes on the show screen", why: "", cat: q.category },
          opts: { answers: ["Answer 1", "Answer 2", "Answer 3", "Answer 4"], correctIdx: -1, cutIndices: [] },
          nightlyPad: true
        };
      }
      return null;
    }
    if (!BANK[p.bankId]) return null;
    var bank = BANK[p.bankId];
    var d = { q: q, bank: bank, opts: null };
    if (q.kind !== "num") d.opts = ogOptsFor(bank, p.seed);
    return d;
  }
  /* the identity bar rides every control phase: your face, your
     colour, your name, your money — this pad belongs to one person */
  function jpIdBar(secs) {
    var me = jpMe();
    /* the identity bar as a mini podium: avatar, name, your standing
       place on a medal disc, your money, the clock */
    var place = 1;
    if (me && JP.snap) JP.snap.players.forEach(function (p) { if (p && p.score > me.score) place++; });
    var ord = ["1ST", "2ND", "3RD", "4TH"][place - 1] || (place + "TH");
    return '<div class="jp-id" style="--me:' + PCOLORS[JP.seat] + '">' +
      '<span class="jp-id-ava">' + avatarSVG(jpOwnAvatar(), "neutral", JP.seat || 0) + "</span>" +
      '<span class="jp-id-idcol"><span class="jp-id-name">' + esc(me ? me.name : (JP.name || "Player")) + '</span>' +
      '<span class="jp-phaseword" id="jpPhaseWord">' + jpPhaseWord() + "</span></span>" +
      '<span class="jp-id-place p' + Math.min(place, 4) + '">' + ord + "</span>" +
      '<span class="jp-id-score">' + money(me ? me.score : 0) + "</span>" +
      (secs ? '<span class="jp-id-secs" id="jpSecs"></span>' : "") + "</div>";
  }
  function jpRender() {
    if (!JP) return;
    var main = $("jpMain");
    var numKeep = null, numFocus = false;
    var oldNum = $("jpNum");
    if (oldNum) { numKeep = oldNum.value; numFocus = document.activeElement === oldNum; }
    var s = JP.snap;
    if (!s || JP.seat == null) {
      main.innerHTML = '<div class="jp-card"><div class="jp-phaseword" id="jpPhaseWord">JOINING</div><div class="jp-hi">Joining the room…</div><p class="jp-sub">Finding your podium.</p></div>';
      jpPaintClock();
      return;
    }
    JP._blind = false;
    var me = jpMe();
    var myName = me ? me.name : (JP.name || "Player");
    if (s.phase === "lobby" || s.phase === "bet" || s.phase === "ended") $("scr-join").classList.remove("cat-on");
    if (s.phase === "lobby") {
      var chips = s.players.map(function (p, i) {
        return p && i !== JP.seat ? '<span class="jp-pchip' + (p.connected ? "" : " away") + '"><span class="name-dot" style="background:' + PCOLORS[i] + '"></span>' + esc(p.name) + "</span>" : "";
      }).join("");
      main.innerHTML = '<div class="jp-hero" style="--me:' + PCOLORS[JP.seat] + '">' +
        '<div class="jp-hero-ava">' + avatarSVG(jpOwnAvatar(), "neutral", JP.seat || 0) + "</div>" +
        '<div class="jp-herotag">THAT\'S YOU</div>' +
        '<div class="jp-heroname">' + esc(myName) + "</div>" +
        '<div class="jp-colorband"></div>' +
        '<div class="jp-phaseword" id="jpPhaseWord">IN THE LOBBY</div>' +
        '<p class="jp-sub">Watch the big screen — when a question lands,<br>this pad becomes your answer buttons.</p>' +
        (chips ? '<div class="jp-players">' + chips + "</div>" : "") +
        '<button class="btn-ghost jp-leave" id="jpLeave">LEAVE ROOM</button></div>';
    } else if (s.phase === "bet") {
      var effBet = s.yourBet != null ? s.yourBet : (JP.sentBet && s.bet && JP.sentBet.qid === s.bet.qid ? JP.sentBet.chips : null);
      var cur = effBet != null ? effBet : JP.betSel;
      JP.betSel = Math.max(1, Math.min(3, cur || 1));
      main.innerHTML = '<div class="jp-pad">' + jpIdBar(false) +
        '<div class="jp-betmid"><div class="jp-betlabel">THE BIG FINISH · YOUR BET</div>' +
        '<div class="jp-chipstack" id="jpChipStack"></div>' +
        '<div class="jp-betamt" id="jpBetAmt"></div>' +
        '<div class="jp-betrow"><button class="jp-step" id="jpBetMinus" aria-label="One chip less">−</button>' +
        '<button class="jp-step" id="jpBetPlus" aria-label="One chip more">+</button></div></div>' +
        '<button class="btn-gold jp-lockbtn" id="jpBetLock">' + (effBet != null ? "CHANGE MY BET" : "LOCK IN MY BET") + "</button>" +
        (effBet != null ? '<div class="jp-betstate">BET IN · <b>' + effBet + (effBet === 1 ? " CHIP" : " CHIPS") + "</b> — change it any time before the question</div>" : '<div class="jp-betstate">SECRET UNTIL THE REVEAL · A CHIP IS $100</div>') +
        "</div>";
      var paintBet = function () {
        var stack = $("jpChipStack"), amt = $("jpBetAmt");
        if (stack) {
          var discs = "";
          for (var k = 0; k < JP.betSel; k++) discs += '<span class="jp-chipdisc">$100</span>';
          stack.innerHTML = discs;
        }
        if (amt) amt.textContent = JP.betSel + (JP.betSel === 1 ? " CHIP" : " CHIPS") + " · " + money(JP.betSel * 100);
      };
      paintBet();
      $("jpBetMinus").addEventListener("click", function () { JP.betSel = Math.max(1, JP.betSel - 1); paintBet(); });
      $("jpBetPlus").addEventListener("click", function () { JP.betSel = Math.min(3, JP.betSel + 1); paintBet(); });
      $("jpBetLock").addEventListener("click", function () {
        Snd.ensure();
        JP.sentBet = { qid: s.bet.qid, chips: JP.betSel };
        jpSend({ t: "bet", qid: s.bet.qid, chips: JP.betSel });
        jpRender(); // the server confirms by counts, not snapshot — echo the lock now
      });
    } else if (s.phase === "answer") {
      var d = jpQuestionData();
      if (!d) { JP._blind = true; main.innerHTML = '<div class="jp-card"><div class="jp-phaseword" id="jpPhaseWord">WATCH THE SCREEN</div><div class="jp-hi">Question on the big screen</div><p class="jp-sub">This pad couldn\'t load the question — watch the screen and sit this one out.</p></div>'; jpPaintClock(); return; }
      jpApplyCat(d.q.category);
      var padTop = jpIdBar(true) +
        '<div class="jp-barwrap" id="jpBarWrap"><div class="jp-bar" id="jpBar" style="width:100%"></div></div>' +
        '<div class="jp-qline"><span class="jp-catemb">' + catEmblem(d.bank.cat) + '</span><span>' + esc(d.bank.q) + "</span></div>";
      if (d.q.kind === "num") {
        if (JP.sentNum && JP.sentNum.qid !== d.q.qid) JP.sentNum = null;
        var effNum = s.yourNum != null ? s.yourNum : (JP.sentNum ? JP.sentNum.num : null);
        main.innerHTML = '<div class="jp-pad">' + padTop +
          '<div class="jp-numpad">' +
          '<input id="jpNum" class="jp-num" type="number" inputmode="decimal" placeholder="Your number" value="' + (numKeep != null ? esc(numKeep) : (effNum != null ? effNum : "")) + '">' +
          '<div class="jp-numstate" id="jpNumState">' + (effNum != null ? "SENT · <b>" + effNum + "</b> — send a new one to change it" : "CLOSEST NUMBER TAKES IT · <span id=\"jpCount\">" + (d.q.answersIn || 0) + " / " + s.players.filter(Boolean).length + " IN</span>") + "</div>" +
          '<button class="btn-gold jp-sendbig" id="jpNumSend">SEND NUMBER</button></div></div>';
        $("jpNumSend").addEventListener("click", function () {
          var v = parseFloat($("jpNum").value);
          if (!isFinite(v)) { jpToast("Give a number first."); return; }
          Snd.ensure();
          JP.sentNum = { qid: d.q.qid, num: v };
          jpPaintClock(); // the word flips to LOCKED IN on the tap, not on the next tick
          jpSend({ t: "answer", qid: d.q.qid, num: v });
          var ns = $("jpNumState");
          if (ns) ns.innerHTML = "SENT · <b>" + v + "</b> — send a new one to change it";
        });
        if (numFocus && $("jpNum")) $("jpNum").focus();
      } else {
        var cutIdx = d.q.cut ? d.q.cut.indices : [];
        var btns = d.opts.answers.map(function (t, i) {
          return '<button class="jp-ans' + (s.yourPick === i ? " sel" : "") + (cutIdx.indexOf(i) >= 0 ? " dim" : "") + '" data-pick="' + i + '"><span class="jp-numb">' + (i + 1) + '</span><span class="jp-ans-tx">' + esc(t) + '</span><span class="jp-ans-tag">✓ YOUR PICK</span></button>';
        }).join("");
        var cutBtn = "";
        if (me && me.cutTwo && !d.q.cut) cutBtn = '<button class="jp-cut" id="jpCut">✂ CUT TWO — KILL TWO WRONG ANSWERS</button>';
        else if (d.q.cut) cutBtn = '<div class="jp-cutnote">CUT TWO PLAYED — TWO ANSWERS ARE GONE</div>';
        main.innerHTML = '<div class="jp-pad">' + padTop +
          '<div class="jp-answers">' + btns + "</div>" +
          '<div class="jp-pickstate" id="jpPickState">' + (s.yourPick != null ? "✓ <b>PICK " + (s.yourPick + 1) + " IS IN</b> — TAP ANOTHER TO CHANGE IT" : "TAP YOUR ANSWER · <span id=\"jpCount\">" + (d.q.answersIn || 0) + " / " + s.players.filter(Boolean).length + " IN</span>") + "</div>" +
          cutBtn + "</div>";
        main.querySelectorAll(".jp-ans").forEach(function (b) {
          b.addEventListener("click", function () {
            Snd.ensure();
            var i = parseInt(b.getAttribute("data-pick"), 10);
            if (JP.snap) JP.snap.yourPick = i;
            main.querySelectorAll(".jp-ans").forEach(function (x) { x.classList.toggle("sel", parseInt(x.getAttribute("data-pick"), 10) === i); });
            var ps = $("jpPickState");
            if (ps) ps.innerHTML = "✓ <b>PICK " + (i + 1) + " IS IN</b> — TAP ANOTHER TO CHANGE IT";
            jpPaintClock(); // the word flips to LOCKED IN on the tap, not on the next tick
            jpSend({ t: "answer", qid: d.q.qid, pick: i });
          });
        });
        var cb = $("jpCut");
        if (cb) cb.addEventListener("click", function () { jpSend({ t: "cuttwo", qid: d.q.qid }); });
      }
    } else if (s.phase === "reveal") {
      var lr = s.lastReveal;
      var d2 = jpQuestionData();
      if (d2 && d2.bank && d2.bank.cat) jpApplyCat(d2.bank.cat);
      if (!lr) { main.innerHTML = '<div class="jp-card"><div class="jp-phaseword" id="jpPhaseWord">THE VERDICT</div><div class="jp-hi">The reveal…</div><p class="jp-sub">Eyes on the big screen.</p></div>'; jpPaintClock(); return; }
      var mine = null;
      (lr.results || []).forEach(function (r) { if (r.seat === JP.seat) mine = r; });
      var lead = jpLeader();
      var ansLine = "";
      if (lr.kind === "num") ansLine = "The number was <b>" + Number(lr.trueNum).toLocaleString("en-US") + "</b>" + (mine && mine.num != null ? " — you said " + mine.num : "");
      else if (d2 && d2.opts && lr.correctIdx != null) ansLine = "The answer was <b>" + esc(d2.opts.answers[lr.correctIdx]) + "</b>";
      var scoreLine = '<div class="jp-vscore">YOU <b>' + money(me ? me.score : 0) + "</b>" + (lead ? " · LEADER — " + esc(lead.name) + " <b>" + money(lead.score) + "</b>" : "") + "</div>";
      if (mine && mine.correct) {
        main.innerHTML = '<div class="jp-verdict"><div class="jp-phaseword" id="jpPhaseWord">THE VERDICT</div><div class="jp-vdisc">✓</div>' +
          '<div class="jp-vword">' + (lr.kind === "num" ? "CLOSEST!" : "YOU GOT IT!") + "</div>" +
          '<div class="jp-gain">' + mplus(mine.banked) + "</div>" +
          '<p class="jp-vans">' + ansLine + "</p>" + scoreLine + "</div>";
      } else {
        main.innerHTML = '<div class="jp-verdict miss"><div class="jp-phaseword" id="jpPhaseWord">THE VERDICT</div><div class="jp-vdisc">✗</div>' +
          '<div class="jp-vword">' + (mine && (mine.pick != null || mine.num != null) ? "NOT THAT ONE" : "NO ANSWER") + "</div>" +
          '<p class="jp-vans">' + ansLine + ". Nothing lost — nobody can lose money here.</p>" + scoreLine + "</div>";
      }
      if (mine && mine.correct) jpBankPulse(me ? me.score : 0, mine.banked || 0);
    } else if (s.phase === "ended") {
      var lead2 = jpLeader();
      main.innerHTML = '<div class="jp-card"><div class="jp-phaseword" id="jpPhaseWord">ENDED</div><div class="q-cat">FINAL RESULT</div>' +
        '<div class="jp-hi">' + (lead2 ? esc(lead2.name) + " takes the Hour!" : "Show's over!") + "</div>" +
        jpStandRows() +
        '<button class="btn-ghost jp-leave" id="jpLeave">LEAVE ROOM</button></div>';
    }
    var lv = $("jpLeave");
    if (lv) lv.addEventListener("click", function () { jpTeardown(); showScreen("scr-title"); setMode("join"); });
    jpPaintClock();
  }
  function jpTick() {
    if (!JP) return;
    jpPaintClock(); // the pad clock rides the pad's one existing tick — no second timer
    if (!JP.snap || JP.snap.phase !== "answer" || !JP.snap.question) return;
    var q = JP.snap.question;
    var rem = q.deadline - (Date.now() + JP.offset);
    if (rem < 0) rem = 0;
    var bar = $("jpBar");
    if (bar) bar.style.width = (q.windowMs ? (rem / q.windowMs) * 100 : 0) + "%";
    var wrap = $("jpBarWrap");
    if (wrap) wrap.classList.toggle("low", rem < 5000);
    var secs = $("jpSecs");
    if (secs) secs.textContent = Math.ceil(rem / 1000) + "s";
    var cnt = $("jpCount");
    if (cnt) cnt.textContent = (q.answersIn || 0) + " / " + JP.snap.players.filter(Boolean).length + " IN";
  }
  /* ---------- join letter boxes: four single-character boxes ----------
     auto-uppercase, auto-advance, paste fills the row; the joined
     value is the same 4-letter string the old single input produced */
  var joinBoxEls = Array.prototype.slice.call(document.querySelectorAll("#joinBoxes .code-box"));
  function joinCodeClean(s) { return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4); }
  function joinCodeValue() {
    return joinBoxEls.map(function (b) { return b.value || ""; }).join("").toUpperCase();
  }
  function paintJoinBtn() {
    var b = $("btnJoinRoom");
    if (b) b.disabled = joinCodeValue().length !== 4;
  }
  function setJoinCode(str) {
    var clean = joinCodeClean(str);
    joinBoxEls.forEach(function (b, i) { b.value = clean.charAt(i) || ""; });
    paintJoinBtn();
    return clean;
  }
  function joinDistribute(from, clean) {
    for (var k = 0; k < clean.length && from + k < 4; k++) joinBoxEls[from + k].value = clean.charAt(k);
    paintJoinBtn();
    if (joinCodeValue().length === 4) { var nm = $("joinName"); if (nm) { nm.focus(); return; } }
    var next = Math.min(from + clean.length, 3);
    joinBoxEls[next].focus();
  }
  joinBoxEls.forEach(function (box, i) {
    box.addEventListener("input", function () {
      var v = (box.value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (v.length > 1) { box.value = ""; joinDistribute(i, v); return; }
      box.value = v;
      paintJoinBtn();
      if (v && i < 3) joinBoxEls[i + 1].focus();
    });
    box.addEventListener("keydown", function (ev) {
      if (ev.key === "Backspace") {
        if (!box.value && i > 0) {
          ev.preventDefault();
          joinBoxEls[i - 1].value = "";
          paintJoinBtn();
          joinBoxEls[i - 1].focus();
        }
      } else if (ev.key === "ArrowLeft" && i > 0) { ev.preventDefault(); joinBoxEls[i - 1].focus(); }
      else if (ev.key === "ArrowRight" && i < 3) { ev.preventDefault(); joinBoxEls[i + 1].focus(); }
      else if (ev.key === "Home") { ev.preventDefault(); joinBoxEls[0].focus(); }
      else if (ev.key === "End") { ev.preventDefault(); joinBoxEls[3].focus(); }
    });
    box.addEventListener("paste", function (ev) {
      ev.preventDefault();
      var text = "";
      try { text = (ev.clipboardData || window.clipboardData).getData("text") || ""; } catch (e) {}
      var clean = joinCodeClean(text);
      if (clean) joinDistribute(i, clean);
    });
    box.addEventListener("focus", function () { box.select(); });
  });
  /* the pad's portrait picker: eight tappable busts under the name
     field. A tap stores the pick on this device (gh_avatar) and it
     rides the next hello; no pick yet = nothing highlighted and the
     server assigns the seat's own portrait */
  function buildAvaGrid() {
    var grid = $("jpAvaGrid");
    if (!grid) return;
    var sel = jpAvatarPref();
    grid.innerHTML = "";
    for (var k = 0; k < 8; k++) {
      var b = el('<button class="jp-ava-btn' + (sel === k ? " sel" : "") + '" data-ava="' + k + '" aria-label="Player portrait ' + (k + 1) + '">' +
        avatarSVG(k, "neutral", k) + "</button>");
      (function (kk, btn) {
        btn.addEventListener("click", function () {
          Snd.ensure();
          try { localStorage.setItem("gh_avatar", String(kk)); } catch (e) {}
          grid.querySelectorAll(".jp-ava-btn").forEach(function (x) {
            x.classList.toggle("sel", parseInt(x.getAttribute("data-ava"), 10) === kk);
          });
        });
      })(k, b);
      grid.appendChild(b);
    }
  }
  $("btnJoinRoom").addEventListener("click", function () {
    Snd.ensure();
    var code = joinCodeValue();
    var name = ($("joinName").value || "").trim();
    var st = $("joinStatus");
    if (code.length !== 4) { st.classList.add("err"); st.textContent = "The code is four letters — check the big screen."; return; }
    st.classList.remove("err");
    var sv = jpSaved();
    if (sv && sv.code === code && sv.reclaimToken) jpConnect(code, name || sv.name, sv.reclaimToken);
    else jpConnect(code, name, null);
  });
  $("btnResumePlayer").addEventListener("click", function () {
    var sv = jpSaved();
    if (sv) { Snd.ensure(); jpConnect(sv.code, sv.name, sv.reclaimToken); }
  });
  /* deep links: ?room=XXXX (the lobby QR's payload) opens the join
     view with the boxes filled and the name field focused — a fresh
     join, never an auto-connect; an invalid value is ignored
     silently. The older ?code=XXXX keeps its meaning: prefill, and
     if it matches the saved seat, walk straight back in (also the
     mid-show refresh path — the server hands seat and score back) */
  try {
    var _qs = new URLSearchParams(location.search);
    var _room = _qs.get("room");
    var _sv = jpSaved();
    if (_room && /^[A-Za-z]{4}$/.test(_room.trim())) {
      setMode("join");
      jpDeepRoom = setJoinCode(_room);
      var _nm = $("joinName");
      if (_nm) _nm.focus();
    } else {
      var _qc = _qs.get("code");
      if (_qc) {
        setMode("join");
        var _clean = setJoinCode(_qc);
        jpDeepRoom = _clean;
        if (_sv && _sv.code === _clean && _clean.length === 4 && _sv.reclaimToken) {
          $("joinName").value = _sv.name || "";
          jpConnect(_sv.code, _sv.name, _sv.reclaimToken);
        }
      }
    }
  } catch (e) {}
  /* remembered name: prefill the join field (deep-link seat reclaim
     above has already filled it in the case that applies there) */
  try {
    var _rn = localStorage.getItem("gh_name");
    if (_rn && !$("joinName").value) $("joinName").value = _rn;
  } catch (e) {}
  paintJoinBtn();
  buildAvaGrid();
  paintHostPanel();
  paintJoinPanel();

  /* ---------- test hooks ---------- */
  window.__game = {
    get G() { return G; }, get clock() { return clock; },
    startShow: startShow, BANK: BANK
  };
  /* Pass P verification hooks: particle censuses for the polish fx */
  window.__fx = { leaves: leaves, coins: coins, motes: motes, laurelState: laurelState };
  window.__online = {
    get OG() { return OG; }, get JP() { return JP; },
    WORKER_URL: WORKER_URL
  };
})();
