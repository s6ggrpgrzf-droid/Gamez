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
    "Movies":           { hi: "#F0568C", mid: "#E8437C", lo: "#C2255C", sh: "#8E1E47", rgb: "232,67,124" },
    "TV":               { hi: "#5AB0FF", mid: "#2E9BFF", lo: "#1B7FD4", sh: "#0F5E94", rgb: "46,155,255" },
    "Music":            { hi: "#B983F0", mid: "#9B5DE5", lo: "#7C3AC9", sh: "#55239E", rgb: "155,93,229" },
    "Ads & Jingles":    { hi: "#FFA25E", mid: "#FF8C42", lo: "#E56F1D", sh: "#A34D0E", rgb: "255,140,66" },
    "Toys & Games":     { hi: "#5CE38A", mid: "#3ECF6E", lo: "#27AE54", sh: "#177A38", rgb: "62,207,110" },
    "Saturday Morning": { hi: "#FFD76A", mid: "#FFC93C", lo: "#F0A90B", sh: "#A87408", rgb: "255,201,60" },
    "The Dial-Up Years": { hi: "#3FD8D4", mid: "#17BEBB", lo: "#0FA3A0", sh: "#076B6E", rgb: "23,190,187" }
  };
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
    g.style.setProperty("--cat-tx", CATTX[cat] || "#FFF6E8");
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
      "Hands in the air like you actually know this one. Three, two, one — show me!"
    ],
    mark: [
      "Right — who had it? Tap their seats. Generosity is allowed; honesty is encouraged.",
      "Call it fairly, table. Tap the seats that earned it."
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
  function hostSay(kind, vars) {
    var line = pick(HOST[kind] || ["…"]);
    if (vars) for (var k in vars) line = line.split("{" + k + "}").join(vars[k]);
    $("hostLine").textContent = line;
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

  /* player avatars: four designs x neutral / cheer / slump.
     Design 2 (deep skin) uses cream eye-whites and bold features so the
     face reads at couch distance — the study's low-contrast fix. */
  function avatarSVG(i, state) {
    var open = '<svg class="avatar" viewBox="0 0 120 124" aria-hidden="true">';
    var sweat = '<path d="M98,18 C104,29 106,35 98,41 C90,35 92,29 98,18 Z" fill="#7FD4FF"/><circle cx="95.5" cy="32" r="2" fill="#E8FAFF"/>';
    var s = "";
    if (i === 0) { /* green — the grinner */
      if (state === "cheer") {
        s = '<path d="M20,102 Q0,80 6,52" stroke="#35D461" stroke-width="13" stroke-linecap="round" fill="none"/>' +
          '<path d="M100,102 Q120,80 114,52" stroke="#35D461" stroke-width="13" stroke-linecap="round" fill="none"/>' +
          '<circle cx="6" cy="47" r="8.5" fill="#F2B183"/><circle cx="114" cy="47" r="8.5" fill="#F2B183"/>';
      }
      s += '<path d="M14,124 Q18,90 60,88 Q102,90 106,124 Z" fill="#35D461"/>' +
        '<path d="M14,124 Q18,90 60,88 L60,124 Z" fill="#000" opacity=".07"/>' +
        '<rect x="51" y="66" width="18" height="18" rx="6" fill="#D98E57"/>' +
        '<circle cx="60" cy="46" r="28" fill="#F2B183"/>' +
        '<path d="M32,44 C32,22 46,14 60,14 C74,14 88,22 88,44 C84,30 74,26 60,26 C46,26 36,30 32,44 Z" fill="#2A1530"/>';
      if (state === "cheer") {
        s += '<path d="M41,47 Q49,40 57,47" stroke="#2A1530" stroke-width="3.5" stroke-linecap="round" fill="none"/>' +
          '<path d="M63,47 Q71,40 79,47" stroke="#2A1530" stroke-width="3.5" stroke-linecap="round" fill="none"/>' +
          '<path d="M44,58 Q60,80 76,58 Q60,67 44,58 Z" fill="#7C2D3E"/>' +
          '<path d="M52,68 Q60,74 68,68 Q60,71 52,68 Z" fill="#FF8FA3"/>';
      } else if (state === "slump") {
        s += '<rect x="39" y="35" width="16" height="5.5" rx="2.75" transform="rotate(16 47 38)" fill="#2A1530"/>' +
          '<rect x="65" y="35" width="16" height="5.5" rx="2.75" transform="rotate(-16 73 38)" fill="#2A1530"/>' +
          '<path d="M40,48 Q49,55 58,48" stroke="#2A1530" stroke-width="3.5" stroke-linecap="round" fill="none"/>' +
          '<path d="M62,48 Q71,55 80,48" stroke="#2A1530" stroke-width="3.5" stroke-linecap="round" fill="none"/>' +
          '<path d="M48,64 Q55,60 60,64 Q65,68 72,64" stroke="#7C2D3E" stroke-width="3.5" stroke-linecap="round" fill="none"/>' + sweat;
        return open + '<g transform="translate(0 5) rotate(3 60 60)">' + s + "</g></svg>";
      } else {
        s += '<rect x="40" y="33" width="15" height="5.5" rx="2.75" transform="rotate(-6 47 36)" fill="#2A1530"/>' +
          '<rect x="65" y="33" width="15" height="5.5" rx="2.75" transform="rotate(6 72 36)" fill="#2A1530"/>' +
          '<circle cx="49" cy="46" r="3.4" fill="#2A1530"/><circle cx="71" cy="46" r="3.4" fill="#2A1530"/>' +
          '<path d="M45,58 Q60,72 75,58 Q60,65 45,58 Z" fill="#7C2D3E"/>' +
          '<path d="M49,59.5 Q60,66 71,59.5 Q60,62.5 49,59.5 Z" fill="#FFF"/>';
      }
      return open + s + "</svg>";
    }
    if (i === 1) { /* blue — cool shades */
      if (state === "cheer") {
        s = '<path d="M20,102 Q0,80 6,52" stroke="#38B6FF" stroke-width="13" stroke-linecap="round" fill="none"/>' +
          '<path d="M100,102 Q120,80 114,52" stroke="#38B6FF" stroke-width="13" stroke-linecap="round" fill="none"/>' +
          '<circle cx="6" cy="47" r="8.5" fill="#B96F3E"/><circle cx="114" cy="47" r="8.5" fill="#B96F3E"/>';
      }
      s += '<path d="M14,124 Q18,90 60,88 Q102,90 106,124 Z" fill="#38B6FF"/>' +
        '<path d="M14,124 Q18,90 60,88 L60,124 Z" fill="#000" opacity=".07"/>' +
        '<rect x="51" y="66" width="18" height="18" rx="6" fill="#9A5527"/>' +
        '<circle cx="60" cy="46" r="28" fill="#B96F3E"/>' +
        '<path d="M31,42 C33,20 46,13 60,13 C74,13 87,20 89,42 L89,47 C70,39 50,39 31,47 Z" fill="#177FBF"/>' +
        '<rect x="24" y="45" width="72" height="8" rx="4" fill="#0F5E94"/>' +
        '<rect x="36" y="40" width="20" height="13" rx="6" fill="#1D0B26"/>' +
        '<rect x="64" y="40" width="20" height="13" rx="6" fill="#1D0B26"/>' +
        '<rect x="54" y="44" width="12" height="4" fill="#1D0B26"/>' +
        '<rect x="39" y="42.5" width="9" height="3.5" rx="1.75" transform="rotate(-18 43 44)" fill="#FFF" opacity=".35"/>';
      if (state === "cheer") {
        s += '<path d="M45,58 Q60,72 75,58 Q60,65 45,58 Z" fill="#5E2408"/>' +
          '<path d="M49,59.5 Q60,66 71,59.5 Q60,62.5 49,59.5 Z" fill="#FFF"/>';
      } else if (state === "slump") {
        s += '<path d="M50,66 L70,66" stroke="#401F0E" stroke-width="4" stroke-linecap="round"/>' + sweat;
        return open + '<g transform="translate(0 4) rotate(-3 60 60)">' + s + "</g></svg>";
      } else {
        s += '<path d="M48,63 Q62,69 74,59" stroke="#401F0E" stroke-width="4" stroke-linecap="round" fill="none"/>';
      }
      return open + s + "</svg>";
    }
    if (i === 2) { /* coral — determined, deep skin, high-contrast features */
      if (state === "cheer") {
        s = '<path d="M20,102 Q0,80 6,52" stroke="#FF6B5E" stroke-width="13" stroke-linecap="round" fill="none"/>' +
          '<path d="M100,102 Q120,80 114,52" stroke="#FF6B5E" stroke-width="13" stroke-linecap="round" fill="none"/>' +
          '<circle cx="6" cy="47" r="8.5" fill="#8A4B26"/><circle cx="114" cy="47" r="8.5" fill="#8A4B26"/>';
      }
      s += '<path d="M14,124 Q18,90 60,88 Q102,90 106,124 Z" fill="#FF6B5E"/>' +
        '<path d="M14,124 Q18,90 60,88 L60,124 Z" fill="#000" opacity=".07"/>' +
        '<rect x="51" y="66" width="18" height="18" rx="6" fill="#6B3418"/>' +
        '<circle cx="60" cy="48" r="28" fill="#8A4B26"/>' +
        '<circle cx="40" cy="28" r="11" fill="#1E0F26"/><circle cx="60" cy="20" r="13" fill="#1E0F26"/>' +
        '<circle cx="80" cy="28" r="11" fill="#1E0F26"/><circle cx="30" cy="40" r="9" fill="#1E0F26"/>' +
        '<circle cx="90" cy="40" r="9" fill="#1E0F26"/>';
      if (state === "cheer") {
        s += '<path d="M41,49 Q49,41 57,49" stroke="#FFE9D6" stroke-width="4" stroke-linecap="round" fill="none"/>' +
          '<path d="M63,49 Q71,41 79,49" stroke="#FFE9D6" stroke-width="4" stroke-linecap="round" fill="none"/>' +
          '<path d="M45,60 Q60,73 75,60 Q60,67 45,60 Z" fill="#4A1E08"/>' +
          '<path d="M49,61.5 Q60,67 71,61.5 Q60,64 49,61.5 Z" fill="#FFF"/>';
      } else if (state === "slump") {
        s += '<rect x="39" y="38" width="16" height="6" rx="3" transform="rotate(-16 47 41)" fill="#241105"/>' +
          '<rect x="65" y="38" width="16" height="6" rx="3" transform="rotate(16 73 41)" fill="#241105"/>' +
          '<path d="M40,54 Q49,61 58,54" stroke="#FFE9D6" stroke-width="3.5" stroke-linecap="round" fill="none"/>' +
          '<path d="M62,54 Q71,61 80,54" stroke="#FFE9D6" stroke-width="3.5" stroke-linecap="round" fill="none"/>' +
          '<path d="M48,70 Q55,66 60,70 Q65,74 72,70" stroke="#FFE9D6" stroke-width="3.5" stroke-linecap="round" fill="none"/>' + sweat;
        return open + '<g transform="translate(0 5) rotate(3 60 60)">' + s + "</g></svg>";
      } else {
        s += '<rect x="39" y="35" width="16" height="6" rx="3" transform="rotate(14 47 38)" fill="#241105"/>' +
          '<rect x="65" y="35" width="16" height="6" rx="3" transform="rotate(-14 73 38)" fill="#241105"/>' +
          '<ellipse cx="49" cy="48" rx="6" ry="4.6" fill="#FFF6E8"/><ellipse cx="71" cy="48" rx="6" ry="4.6" fill="#FFF6E8"/>' +
          '<circle cx="49" cy="48" r="2.6" fill="#1D0D05"/><circle cx="71" cy="48" r="2.6" fill="#1D0D05"/>' +
          '<path d="M46,62 Q60,71 74,61" stroke="#2A1206" stroke-width="4.5" stroke-linecap="round" fill="none"/>';
      }
      return open + s + "</svg>";
    }
    /* purple — the coiled newcomer */
    if (state === "cheer") {
      s = '<path d="M20,102 Q0,80 6,52" stroke="#B07FE8" stroke-width="13" stroke-linecap="round" fill="none"/>' +
        '<path d="M100,102 Q120,80 114,52" stroke="#B07FE8" stroke-width="13" stroke-linecap="round" fill="none"/>' +
        '<circle cx="6" cy="47" r="8.5" fill="#C68642"/><circle cx="114" cy="47" r="8.5" fill="#C68642"/>';
    }
    s += '<path d="M14,124 Q18,90 60,88 Q102,90 106,124 Z" fill="#B07FE8"/>' +
      '<path d="M14,124 Q18,90 60,88 L60,124 Z" fill="#000" opacity=".07"/>' +
      '<rect x="51" y="66" width="18" height="18" rx="6" fill="#A66A2E"/>' +
      '<circle cx="60" cy="46" r="28" fill="#C68642"/>' +
      '<path d="M32,42 C32,22 46,14 60,14 C74,14 88,22 88,42 C84,29 74,25 60,25 C46,25 36,29 32,42 Z" fill="#17101F"/>' +
      '<circle cx="46" cy="15" r="7" fill="#17101F"/><circle cx="60" cy="11" r="8" fill="#17101F"/><circle cx="74" cy="15" r="7" fill="#17101F"/>';
    if (state === "cheer") {
      s += '<path d="M41,47 Q49,40 57,47" stroke="#241105" stroke-width="3.5" stroke-linecap="round" fill="none"/>' +
        '<path d="M63,47 Q71,40 79,47" stroke="#241105" stroke-width="3.5" stroke-linecap="round" fill="none"/>' +
        '<path d="M44,58 Q60,80 76,58 Q60,67 44,58 Z" fill="#5E2408"/>' +
        '<path d="M52,68 Q60,74 68,68 Q60,71 52,68 Z" fill="#FF8FA3"/>';
    } else if (state === "slump") {
      s += '<rect x="39" y="35" width="16" height="5.5" rx="2.75" transform="rotate(16 47 38)" fill="#17101F"/>' +
        '<rect x="65" y="35" width="16" height="5.5" rx="2.75" transform="rotate(-16 73 38)" fill="#17101F"/>' +
        '<path d="M40,48 Q49,55 58,48" stroke="#241105" stroke-width="3.5" stroke-linecap="round" fill="none"/>' +
        '<path d="M62,48 Q71,55 80,48" stroke="#241105" stroke-width="3.5" stroke-linecap="round" fill="none"/>' +
        '<path d="M48,64 Q55,60 60,64 Q65,68 72,64" stroke="#5E2408" stroke-width="3.5" stroke-linecap="round" fill="none"/>' + sweat;
      return open + '<g transform="translate(0 5) rotate(3 60 60)">' + s + "</g></svg>";
    } else {
      s += '<rect x="40" y="33" width="15" height="5.5" rx="2.75" transform="rotate(-6 47 36)" fill="#17101F"/>' +
        '<rect x="65" y="33" width="15" height="5.5" rx="2.75" transform="rotate(6 72 36)" fill="#17101F"/>' +
        '<circle cx="49" cy="46" r="3.4" fill="#241105"/><circle cx="71" cy="46" r="3.4" fill="#241105"/>' +
        '<path d="M45,58 Q60,72 75,58 Q60,65 45,58 Z" fill="#5E2408"/>' +
        '<path d="M49,59.5 Q60,66 71,59.5 Q60,62.5 49,59.5 Z" fill="#FFF"/>';
    }
    return open + s + "</svg>";
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
  /* gold leaf finale — pooled particles, capped, no per-frame allocation */
  var leaves = { active: false, parts: [], cv: null, cx: null, dpr: 1 };
  var LEAF_COLORS = ["#E8437C", "#2E9BFF", "#9B5DE5", "#FF8C42", "#3ECF6E", "#FFC93C", "#17BEBB", "#FFD76A"];
  function resetLeaf(p, scatter) {
    var cv = leaves.cv; if (!cv) return;
    p.x = Math.random() * cv.width;
    p.y = scatter ? Math.random() * cv.height : -20 - Math.random() * 60;
    p.w = 4 + Math.random() * 6; p.h = p.w * 1.5;
    p.vy = 26 + Math.random() * 34; p.ph = Math.random() * 6.28;
    p.rot = Math.random() * 6.28; p.vr = (Math.random() - 0.5) * 2.4;
    p.col = ri(LEAF_COLORS.length);
  }
  function startLeaves() {
    var cv = $("leafCanvas"); if (!cv) return;
    leaves.dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.floor(window.innerWidth * leaves.dpr);
    cv.height = Math.floor(window.innerHeight * leaves.dpr);
    leaves.cv = cv; leaves.cx = cv.getContext("2d");
    if (!leaves.parts.length) {
      for (var i = 0; i < 56; i++) leaves.parts.push({ x: 0, y: 0, w: 5, h: 8, vy: 0, ph: 0, rot: 0, vr: 0, col: 0 });
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
      cx.fillStyle = LEAF_COLORS[p.col]; cx.globalAlpha = 0.85;
      cx.fillRect(-p.w * dpr / 2, -p.h * dpr / 2, p.w * dpr, p.h * dpr * (0.4 + 0.6 * Math.abs(Math.sin(p.ph))));
      cx.restore();
    });
    cx.globalAlpha = 1;
  }
  function stopLeaves() { leaves.active = false; var cv = $("leafCanvas"); if (cv) cv.classList.remove("on"); }

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
  /* the five guess slots: kinds shuffled (2 num + 2 survey + 1 swing),
     ids drawn per kind, unseen preferred */
  function buildGuessSchedule() {
    function idsFor(kind) {
      var all = BANK.filter(function (q) { return q.kind === kind; }).map(function (q) { return q.id; });
      var fresh = all.filter(function (id) { return !seen[id]; });
      return shuffle(fresh.length ? fresh : all.slice());
    }
    var nums = idsFor("num"), survs = idsFor("survey");
    var kinds = shuffle(["num", "num", "survey", "survey", rng() < 0.5 ? "num" : "survey"]);
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
        return { name: nm, color: PCOLORS[i], score: 0, cut: 1, bet: 1 };
      }),
      round: 1, qInRound: 0,
      phase: "intro",           // intro|spin|bet|question|vote-count|vote|reveal|over
      cur: null,                // current question runtime
      guess: null,              // "round:qInRound" -> bank id for the 5 guess slots
      lastStand: {              // standings snapshot for race delta chips
        scores: names.map(function () { return 0; }),
        ranks: names.reduce(function (m, _n, i) { m[i] = i; return m; }, {})
      }
    };
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
        '<div class="seat-ava">' + avatarSVG(i, state) + "</div>" +
        '<div class="desk"><span class="seat-name">' + esc(p.name) + '</span>' +
        '<span class="seat-score">' + shown + '</span>' +
        '<span class="tag">' + tagsFor(i) + "</span></div></div>");
      if (p.score === bestScore && bestScore > 0) s.classList.add("lead");
      if (G.cur && G.cur.marks && G.cur.marks[i]) s.classList.add("gotit");
      s.addEventListener("click", function () { onSeatTap(i); });
      bot.appendChild(s);
    });
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
    if (!pageHidden) { stepFortune(dt); drawValue(); stepLeaves(dt); }
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
        '<span class="rank-badge ' + badgeCls + '">' + (pos + 1) + "</span>" + chips +
        avatarSVG(pi, pos === 0 ? "cheer" : "neutral") +
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
  }
  function startShow(names) {
    G = newGame(names);
    pools = {};
    G.guess = buildGuessSchedule();
    showScreen("scr-game");
    setLight("open");
    stopLeaves();
    dispScore = G.players.map(function () { return 0; });
    writtenScore = [];
    hostSay("open");
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

  /* ---------- the spin (Sterling chooses the category — pure theatre) ---------- */
  function spinBeat() {
    G.phase = "spin";
    seatsVisible(true);
    updateTop(); renderSeats();
    var chips = CATS.map(function (c) {
      var cs = catStyle(c);
      return '<span class="cat-chip" data-cat="' + esc(c) + '" style="--chip:' + cs.mid + ";--chipd:" + cs.sh + ";color:" + (CATTX[c] || "#FFF6E8") + '">' + esc(c) + "</span>";
    }).join("");
    stage('<div class="q-cat">STERLING SPINS THE CATEGORIES</div>' +
      '<div class="cat-row">' + chips + "</div>" +
      '<p class="round-text">Where it stops, nobody knows. Sterling knows. Sterling always knows.</p>');
    hostSay("spin", { cat: G.cur.cat });
    Snd.play("spin");
    var ticks = 0, totalTicks = 10 + ri(3);
    clearInterval(spinTimer);
    spinTimer = setInterval(function () {
      if (!G || G.phase !== "spin") { clearInterval(spinTimer); spinTimer = null; return; }
      ticks++;
      var cat = ticks >= totalTicks ? G.cur.cat : CATS[ticks % CATS.length];
      document.querySelectorAll(".cat-chip").forEach(function (ch) {
        ch.classList.toggle("sel", ch.getAttribute("data-cat") === cat);
      });
      if (ticks >= totalTicks) {
        clearInterval(spinTimer); spinTimer = null;
        setTimeout(function () { if (G && G.phase === "spin") askCurrent(); }, 350);
      }
    }, 85);
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
      '<div style="display:flex;flex-direction:column;gap:6px;width:min(480px,94vw);margin:8px auto">' + rows + "</div>" +
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
    return '<div class="q-headrow"><span class="cat-pill">' + esc(c.cat.toUpperCase()) + '</span><span class="q-kind">' + head + "</span></div>" +
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
    return '<div class="q-headrow"><span class="cat-pill">' + esc(c.cat.toUpperCase()) + '</span><span class="q-kind">CLOSEST NUMBER</span></div>' +
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
    hostSay("cut", { name: p.name });
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
    stage('<div class="q-headrow"><span class="cat-pill">' + esc(G.cur.cat.toUpperCase()) + '</span><span class="q-kind">WHO HAD IT?</span></div>' +
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
    var parts = [];
    winners.forEach(function (i) {
      var p = G.players[i];
      var gain = c.betRound ? p.bet * 100 : c.bankValue;
      p.score += gain;
      parts.push('<span class="up">' + mplus(gain) + " to " + esc(p.name) + "</span>");
    });
    var nextBtn = '<div style="margin-top:12px"><button class="btn-gold" id="btnNext">CONTINUE</button></div>';
    if (c.kind === "num") {
      var dNum = parts.length ? parts.join(" &nbsp;")
        : '<span class="down">Nobody got close. The number keeps its dignity.</span>';
      stage('<div class="q-headrow"><span class="cat-pill">' + esc(c.cat.toUpperCase()) + '</span><span class="q-kind">THE NUMBER WAS</span></div>' +
        '<div class="q-text" style="font-size:clamp(18px,3vw,25px)">' + esc(c.q.q) + "</div>" +
        '<div class="wager-amt">' + Number(c.q.num).toLocaleString("en-US") + "</div>" +
        '<div class="delta">' + dNum + "</div>" +
        '<p class="why">' + esc(c.q.why) + "</p>" + nextBtn);
      hostSay(winners.length ? "numHit" : "numMiss", { name: winners.length ? G.players[winners[0]].name : "" });
      Snd.play(winners.length ? "correct" : "wrong");
    } else {
      var correctIdx = c.opts.findIndex(function (o) { return o.ok; });
      var btns = c.opts.map(function (o, i) {
        var cls = "ans-btn" + (i === correctIdx ? " correct" : (o.gone ? " dim wrong" : " dim"));
        return '<button class="' + cls + '" disabled><span class="letter">' + (i + 1) + '</span><span>' + esc(o.t) + "</span></button>";
      }).join("");
      var dMcq = parts.length ? parts.join(" &nbsp;")
        : '<span class="down">No fingers on it. The money stays in Sterling\'s pocket — this time.</span>';
      stage('<div class="q-headrow"><span class="cat-pill">' + esc(c.cat.toUpperCase()) + '</span><span class="q-kind">THE ANSWER</span></div>' +
        '<div class="q-text" style="font-size:clamp(18px,3vw,25px)">' + esc(c.q.q) + "</div>" +
        '<div class="answers">' + btns + "</div>" +
        '<div class="delta">' + dMcq + "</div>" +
        '<p class="why">' + esc(c.q.why) + "</p>" + nextBtn);
      var hk = winners.length === 0 ? "allMiss" : (winners.length === G.players.length ? "allHit" : "someHit");
      hostSay(hk, { name: winners.length ? G.players[winners[0]].name : "" });
      Snd.play(winners.length ? "correct" : "wrong");
    }
    renderSeats();
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
    hostSay("winner", { name: p.name });
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
      return '<div class="podium pod' + ii + " big rank" + (pos + 1) + (ii === i ? " winner-podium lit" : "") + '">' + top +
        avatarSVG(ii, ii === i ? "cheer" : "neutral") +
        '<div class="desk"><div class="pname">' + esc(pp.name) + '</div><div class="pmoney">' + money(pp.score) + "</div></div></div>";
    }).join("");
    var tieNote = "";
    if (tiedIdx) {
      var names = tiedIdx.map(function (ii) { return G.players[ii].name; }).join(" and ");
      tieNote = '<p class="round-text tie-note">Dead level at the top — ' + esc(names) + " matched at " + money(p.score) +
        ". The crown goes to the earliest seat, and the rematch is now legally mandatory.</p>";
    }
    stage('<div class="finale-wrap"><div class="finale-main">' +
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
    $("btnAgain").addEventListener("click", function () {
      stopLeaves();
      startShow(G.players.map(function (pp) { return pp.name; }));
    });
    $("btnLobby").addEventListener("click", function () { stopLeaves(); showScreen("scr-title"); G = null; });
  }

  /* ---------- setup screen ---------- */
  var playerCount = 3;
  function renderPodiumPreview() {
    var wrap = $("podiumPreview");
    if (!wrap) return;
    var inputs = document.querySelectorAll(".name-input");
    var html = "";
    for (var i = 0; i < playerCount; i++) {
      var nm = (inputs[i] && inputs[i].value.trim()) || PNAMES[i];
      html += '<div class="podium pod' + i + '">' + avatarSVG(i, "neutral") +
        '<div class="desk"><div class="pname">' + esc(nm) + '</div><div class="pmoney">$0</div></div></div>';
    }
    wrap.innerHTML = html;
  }
  function buildNameRows() {
    var wrap = $("nameRows"); wrap.innerHTML = "";
    for (var i = 0; i < playerCount; i++) {
      var row = el('<div class="name-row"><span class="name-dot" style="background:' + PCOLORS[i] + '"></span>' +
        '<input class="name-input" maxlength="14" value="' + PNAMES[i] + '">' +
        '<span class="name-seat">SEAT ' + (i + 1) + "</span></div>");
      row.querySelector(".name-input").addEventListener("input", renderPodiumPreview);
      wrap.appendChild(row);
    }
    renderPodiumPreview();
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
    var names = Array.prototype.map.call(document.querySelectorAll(".name-input"), function (inp, i) {
      return inp.value.trim() || PNAMES[i];
    });
    startShow(names);
  });
  $("btnQuit").addEventListener("click", function () {
    stopClock(); stopLeaves(); saveSeen();
    seatsVisible(true);
    clearInterval(spinTimer); clearInterval(voteTimer); spinTimer = voteTimer = null;
    G = null; showScreen("scr-title");
  });
  buildNameRows();
  buildBulbs($("marqueeTitle"));
  /* mute toggle on the title screen — persisted; the show reads fully silent */
  var btnMute = $("btnMute");
  function paintMute() {
    if (!btnMute) return;
    btnMute.textContent = Snd.muted ? "SOUND: OFF" : "SOUND: ON";
    btnMute.classList.toggle("on", !Snd.muted);
  }
  if (btnMute) btnMute.addEventListener("click", function () {
    Snd.ensure(); Snd.setMuted(!Snd.muted); paintMute();
    if (!Snd.muted) Snd.play("correct");
  });
  paintMute();
  /* the cold open is skippable — a tap never traps the table */
  $("stage").addEventListener("click", function () {
    if (G && G.phase === "coldopen") { clearTimeout(coldTimer); roundIntro(); }
  });
  /* heavy animation and audio rest while the tab is hidden */
  document.addEventListener("visibilitychange", function () {
    pageHidden = document.hidden;
    if (Snd.ctx) { try { if (document.hidden) Snd.ctx.suspend(); else Snd.ctx.resume(); } catch (e) {} }
  });
  requestAnimationFrame(loop);

  /* ---------- test hooks ---------- */
  window.__game = {
    get G() { return G; }, get clock() { return clock; },
    startShow: startShow, BANK: BANK
  };
})();
