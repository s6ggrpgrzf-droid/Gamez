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
  /* the shared show rng runs mulberry32's exact algorithm with its
     state in a box, so a table show's precise draw position can be
     saved and restored across a refresh (improvement 4) — the draw
     sequence is bit-identical to the closure it replaces */
  var rngBox = { a: (Date.now() % 2147483647) || 7 };
  function rng() {
    rngBox.a = (rngBox.a + 0x6d2b79f5) | 0;
    var a = rngBox.a;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
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
  /* Design pass 5 — the difficulty ramp: each round's slots carry a
     fixed band profile (1 Warm, 2 Middle, 3 Deep Cut; see the bank's
     d field), non-decreasing across the round, and the dealer fills
     every slot from its target band. Guess slots override by schedule
     at the same positions, taking their bands from these same
     profiles: Round 1's nums are bands 1 and 2, Round 2's surveys 2
     and the Headline 3, Round 3's swing 3. A question's own diff
     still sets its dollar value — the ramp changes only WHICH
     questions land WHERE. */
  var R1_BANDS = [1, 1, 1, 2, 2, 2];
  var R2_BANDS = [2, 2, 2, 3, 3, 3];
  var R3_BANDS = [3, 3, 3];
  /* nearest-band fallback order: closest first, the LOWER band wins
     a tie (protect the early game) */
  var BAND_ORDER = { 1: [1, 2, 3], 2: [2, 1, 3], 3: [3, 2, 1] };
  /* exactly five guess questions: round:qInRound (0-based), interleaved,
     never first or last in a round */
  var GUESS_SLOTS = ["1:1", "1:4", "2:2", "2:5", "3:1"];
  /* Design pass 2 — the Headline Question: Round 2's LAST question
     (overall Q12) plays at double value again under a halved clock.
     Derived from POSITION (round + index) only — never from the seed,
     never persisted — so a host refresh recomputes it identically,
     and it lands on whatever kind the slot deals (pinned: survey;
     a substitution deals the same treatment to its kind). */
  function isHeadline(round, qInRound) { return round === 2 && qInRound === R2_COUNT - 1; }

  /* ---------- host lines (original writing — Sterling the playmate) ---------- */
  var HOST = {
    open: [
      "Good evening, I'm Sterling. Fifteen questions, everybody plays, and nobody goes home poorer. Those are the house rules — I invented them, so they're excellent.",
      "Welcome to The Gilded Hour: the questions are older than your first car and twice as reliable. I'm Sterling. Let's make some money.",
      "Evening, table. I'm Sterling — the questions are vintage, the money is pretend, and the company is the real prize. Shall we?",
      "Pull up a memory and settle in. Tonight we find out who actually remembers those years and who just dresses like them. I'm Sterling. We begin."
    ],
    r1: [
      "Round One — the Warm-Up. Easy money, loud opinions. Fingers at the ready, table.",
      "The Warm-Up. Six questions to loosen the wrists and the wallets. I pick the categories — the wheel and I have an understanding.",
      "The Warm-Up. Six gentle questions, priced like a yard sale and twice as fun to fight over.",
      "Round One. Nothing here bites — these are the questions your childhood left stuck to the fridge with a magnet."
    ],
    r2: [
      "Round Two — Double Money. Everything pays twice, and your Cut Two is live. Spend it wisely; there is exactly one.",
      "Double Money. The questions get nosier and the money gets louder. Sterling believes in you. Sterling believes in everybody. It's a flaw.",
      "Double Money, table. Every right answer just doubled in value — and every wrong one doubled in confidence.",
      "Round Two. The training wheels come off and the stakes have had a growth spurt. Your Cut Two is live: spend its moment like it matters, because it does."
    ],
    r3: [
      "The Big Finish. Three questions, three bets, and zero ways to lose money. This show is a terrible casino and a wonderful friend.",
      "Three questions left. Bet on yourselves — out loud, so the room can hold you to it.",
      "The Big Finish, where brave hearts bet on themselves. Three questions between this table and the Hour — make them count.",
      "The last three. Bets declared out loud, hearts worn on sleeves. This is the part of the evening you'll be describing at breakfast."
    ],
    spin: [
      "The wheel turns… and stops where it stops. {cat}! Blame the wheel.",
      "{cat}! The wheel has spoken. The wheel is never wrong, merely smug.",
      "Round she goes, and where she stops… {cat}! The wheel accepts applause and blame in equal measure.",
      "The wheel slows, the room leans in… {cat}. Even I didn't see that coming, and I own the wheel."
    ],
    read: [
      "Here's one from {cat}. Fingers limber, memories unlocked.",
      "{cat}, coming up. Somewhere in this room is a misspent youth about to pay off.",
      "From the deep vaults of {cat}. Dust it off, table — you know this one; you just don't know you know it.",
      "{cat}, from the archives. This one's been waiting thirty years to be asked, and it has dressed for the occasion."
    ],
    vote: [
      "Fingers up! Three, two, one — SHOW ME!",
      "Hands in the air like you actually know this one. Three, two, one — show me!",
      "Answers on fingers, please — no conferring, no asking the dog. Three, two, one — show me!",
      "Commit, table. A guess held high beats a certainty kept quiet. Three, two, one — show me!",
      "Lock it in with your fingers — three, two, one — SHOW ME!",
      "No hedging and no half-raised hands. Full commitment, table — three, two, one — show me!",
      "Fingers up: the international sign for 'I absolutely know this.' Three, two, one — show me!",
      "Brave, wrong, or gloriously both — up they go. Three, two, one — show me!"
    ],
    mark: [
      "Right — who had it? Tap their seats. Generosity is allowed; honesty is encouraged.",
      "Call it fairly, table. Tap the seats that earned it.",
      "The moment of account. Tap every seat that had it — Sterling trusts your eyes and your conscience.",
      "Who's holding the right answer? Point them out — tap their seats and make it official.",
      "Confession time. Tap the seats that knew it. The others may keep their dignity; it's all they have left.",
      "Accounting time. Tap the seats that earned it — Sterling is watching, but Sterling trusts you. Mostly.",
      "Who had it? Point them out. The honour system has carried this show for years, and it is not starting to wobble tonight.",
      "Mark them, table — every seat that knew it gets its due. Tap them in.",
      "The reckoning. Tap the seats whose fingers told the truth; the rest may remain in comfortable denial.",
      "Confessions over, verdicts in: whose hands were honest? Tap those seats and we'll make it official."
    ],
    allHit: [
      "EVERYBODY. The whole table, paid in full. I shall alert the newspapers.",
      "A clean sweep! Drinks are on the house. The house is me. The drinks are imaginary.",
      "The WHOLE table. Every last one of you. I'm not saying it was easy — I'm saying you made it look that way.",
      "A clean sweep, with witnesses! If this were a casino, they'd be escorting us out by now."
    ],
    someHit: [
      "{name} had it — and has company. The finger-vote never lies. Usually.",
      "Paid out to the sharp-eyed. The rest of you: beautiful confidence, wrong answer.",
      "{name} leads the believers home. The money moves, the room murmurs — this, table, is the good stuff.",
      "Banked, and banked properly. The rest of the table is taking notes it will pretend not to need."
    ],
    allMiss: [
      "Nobody. Not one finger. The question retires undefeated, and slightly smug about it.",
      "The whole table looked straight at that one and blinked. It happens to the best rooms. Once.",
      "A swing and a miss from the entire orchestra. That question leaves in a limousine, undefeated.",
      "Not a soul had it. The answer slips out the stage door and into the night — and we shall speak of it at breakfast anyway."
    ],
    numQ: [
      "Closest number wins this one. No options, no hiding — just a number and the courage to shout it.",
      "A numbers question. Shout your best guess when I call it — the nearest shout takes the money.",
      "A closest-number question. No options, no hiding — just a number and the nerve to shout it.",
      "Numbers, out loud. Nobody needs to be exactly right; somebody needs to be nearest. Make it you."
    ],
    numHit: [
      "{name} called it closest. Somewhere, a maths teacher just felt a small disturbance of pride.",
      "Closest shout: {name}. The number has been respected, and so have you.",
      "Nearest the mark: {name}. Precision like that deserves its own sound effect — the money will have to do.",
      "{name}, closest to the pin. The rest of you were answering a slightly different question, I can only assume."
    ],
    numMiss: [
      "Nobody got near it. The number remains at large.",
      "Those guesses were… geographically diverse. No winner this time.",
      "The guesses have scattered to the four winds, and the truth sits untouched in the middle, waving. No money this time.",
      "Somewhere between the bravest guess and the shyest sits the number, unbothered. It keeps the money."
    ],
    cut: [
      "{name} spends the Cut Two! Two wrong answers leave the building. Security will escort them out.",
      "Cut Two, called by {name}. Half the lying is over — the other half is up to you.",
      "The Cut Two falls, called by {name}! Two wrong answers are shown the door — they'll be outside, telling the car park their side of it.",
      "{name} plays the Cut Two. The field narrows, the odds preen, and this question just got personal."
    ],
    /* Design pass 6 — Cut Two's moment. When the lifeline is spent,
       the moment speaks with THIS pool, drawn locally through the
       shuffle-bag (hostSay) so the line lands with the slash itself
       rather than whenever a fetched beat happens to return — the
       same discipline as the quick-draw call-out. Scissors forward:
       the play is the show's one scarcity being spent in public. */
    cutmoment: [
      "{name} reaches for the scissors — Cut Two! Two wrong answers are snipped clean out of the picture.",
      "Snip, snip — {name} spends the Cut Two. The picture narrows, and the room's breathing with it.",
      "{name} cuts two loose! The blades are out, the net draws tight — now choose well.",
      "The scissors flash for {name} — Cut Two, spent in broad daylight. Two answers fall away."
    ],
    bet: [
      "Bets out loud, please. Declare your chips on yourself. Confidence is free; chips are a hundred dollars.",
      "The Big Finish wants your bet and your bravado in equal measure. Declare your bets — the room is listening, and it will remember.",
      "Chips talk in the Big Finish. One chip says cautious; three say certain. Declare yours where the room can hear.",
      "Your bet, table — stake your pride in hundreds and say it like a headline. The cheap seats are listening."
    ],
    longshot: [
      "{name} takes the Long Shot — {chips} chips, a {amount} swing on a single answer. The room leans in."
    ],
    headline: [
      "The Headline Question, table — double money again, half the clock, and every eye in the room on one card. Make it a good one.",
      "Front page, table: the Headline Question. Twice the money, half the time, all the nerve.",
      "Here it is — the one they print above the fold. The Headline Question: double value, double-quick clock.",
      "Last question of the round, and it's the Headline. Double money again — but the clock runs twice as fast, so think like a headline: fast and bold."
    ],
    /* Design pass 3: the Quick-Draw call-out. When the first correct
     * lock-in is banked, this pool REPLACES the reveal's beat line
     * entirely — revealSay / ogRevealSay check for a quick-draw
     * winner first and never consume the AI beat latches on such a
     * reveal, so the call-out and the AI beat never fight. */
    quickdraw: [
      "Quick draw, {name}! First hand up, and right — fifty dollars for the fastest finger in the room.",
      "{name} beats the whole table to it — first in, and correct. The quick-draw fifty is yours.",
      "Fastest finger: {name}. Locked in first, locked in right — fifty dollars, no waiting.",
      "A gunslinger's answer from {name} — drawn first, aimed true. Fifty for the quick draw.",
      "{name} was in before the ink dried — first AND right. Fifty dollars for sheer speed."
    ],
    /* Hot Streaks (New programme pass 3): the named streak moments.
     * Same discipline as the quick-draw pool — a moment REPLACES the
     * reveal's generic beat and never consumes the AI beat latches.
     * At most one streak line per reveal: the settlement picks the
     * moment (reaching 5+ outranks reaching 3, which outranks a 4+
     * run dying; inside a family, the higher count, then the
     * earlier seat). All authored — no worker round-trip. */
    streak3: [
      "Three straight for {name} — the table has a problem, and its name is {name}.",
      "{name} again! Three in a row — the streak is lit, and every bank from here pays a bonus twenty-five.",
      "One, two, three — {name} is streaking, table. Somebody cool that seat down.",
      "{name} makes it three straight. The room has started watching that podium differently."
    ],
    streak5: [
      "Five straight for {name}! This is no longer a streak; it is a residency.",
      "{name} again — five in a row. Sterling is checking the questions for leaks. There are none. It's just {name}.",
      "Five! {name} is putting on a clinic and charging the rest of you tuition."
    ],
    streakdeath: [
      "{name}'s run ends at {n} — the room exhales.",
      "The streak dies at {n}. {name} gave it a beautiful life; the question that killed it should be ashamed.",
      "All good runs end: {name}'s stops at {n}. The table applauds the run, not the ending.",
      "{n} straight, and then the wall. {name}, the room will remember the run."
    ],
    winner: [
      "{name} takes the Gilded Hour! The confetti is real, the money is imaginary, and the glory is legally binding.",
      "And the Hour belongs to {name}. Table, applaud. {name}, bow. I shall pretend not to enjoy this.",
      "{name}, the Hour is yours. The rest of you were magnificent and narrowly outshone — Sterling applauds until his gloves wear thin.",
      "Raise the lights for {name}, champion of the Gilded Hour. The crown is invisible; the bragging rights are extremely visible."
    ],
    /* Design pass 4: the champion returns. Shown as its own small
       line in the online lobby when a seated player's name matches
       the defending champion's — never an edit of the greeting
       itself, whatever supplied it. */
    champreturn: [
      "And look who's back — {name}, the defending champion, returning to guard the crown.",
      "{name} has taken a seat. The defending champion does not surrender a title quietly.",
      "The champion returns: {name} is in the room, and tonight's crown suddenly has a guard."
    ],
    /* New programme pass 1 — the Decider. All four pools are LOCAL
       (authored, drawn through hostSay / authoredLine — no worker
       round-trip may gate the show's tensest beat). The intro names
       the two leaders through {a} and {b}; decideragain opens each
       re-dealt decider after a dead-level call; deciderhit speaks
       at the reveal when one call is closest; deciderlevel speaks
       when the closest calls are identical and it goes again;
       deciderwin is the finale's authored winner line when the
       crown was taken head-to-head. */
    decider: [
      "Dead level at the top — {a} and {b}, level on money and out of questions. So: one more. The Decider. Closest number takes the crown.",
      "The scoreboard refuses to split {a} and {b}, so we settle it the honest way — one question, two numbers, nearest to the truth takes the Hour.",
      "Nothing between them. Nothing at all. {a}, {b} — the Decider: one closest-number question, and the crown goes to the nearer call."
    ],
    decideragain: [
      "Still nothing between them — so we go again. A fresh number, a fresh call. The Decider does not blink.",
      "The Decider deals another. Same two, same crown, new number — somebody be nearer this time."
    ],
    deciderhit: [
      "{name} called it closest — the Decider has spoken, and so has the crown.",
      "Nearest the truth when everything rode on one number: {name}. The Decider is decisive after all."
    ],
    deciderlevel: [
      "Identical. The same distance, to the unit. The number refuses to choose — so the Decider goes again.",
      "Dead level AGAIN. Even the truth can't split them. Another question, then."
    ],
    deciderwin: [
      "{name} takes the Gilded Hour — and took it the hard way, closest to the truth with the whole show on one number.",
      "The crown goes to {name}, won head-to-head in the Decider. Nobody can say it was given away."
    ],
    /* Programme pass 4 — Rematch Night. winnernight is the finale's
       authored winner line when this show's win also took the
       NIGHT (the winner's third series win): the beat must
       acknowledge the night, not just the show, so it is spoken
       authored-only (sayWinnerAuthored — the worker's generic
       winner line knows nothing of the series and may not displace
       it). scattered is the online lobby's explanation when a
       rematch tap finds fewer than two players still seated: the
       room stays open, the night pauses, nobody is blamed. */
    winnernight: [
      "{name} takes the show — and with it, the night. Three wins in one evening: the argument is over, and {name} won it.",
      "The show is {name}'s, and so is the night — first to three, and reached in style. Somebody frame the evening.",
      "Once more, {name} — and that makes three. The night has a name on it now, table, and you are all looking at them."
    ],
    scattered: [
      "The table has scattered — a rematch needs two players still in their seats. The room stays open: gather your people, and Sterling will deal again.",
      "Half the table has wandered off, and a rematch deserves a fuller house. This room stays open while you round them up."
    ]
  };
  /* Improvement 5 — Sterling's category lines: reveal-moment pools
     keyed by category. "bank" lines read true whether one seat or the
     whole table banked; "miss" lines are for a whole-table miss. No
     line claims a fact about any specific question, so each is safe
     on every question its category can deal. */
  var CAT_LINES = {
    "Movies": {
      bank: [
        "The credits roll, and the money's already optioned for the sequel.",
        "Somewhere, a projectionist is nodding. Paid, and properly earned.",
        "Box-office gold. That answer just opened at number one."
      ],
      miss: [
        "That one goes straight to the cutting-room floor.",
        "The house lights come up on an empty cinema. Nobody had it.",
        "A twist ending — the question wins, the table applauds politely, and no money changes hands."
      ]
    },
    "TV": {
      bank: [
        "The ratings are in, and that answer is a hit. The money moves.",
        "A word from our sponsor — the sponsor is this table, and it's just been paid.",
        "Broadcast to the whole room and received in perfect quality: one correct answer, fully paid."
      ],
      miss: [
        "Dead air. That question was cancelled after a single showing.",
        "The test pattern comes up — nobody in the room was receiving that one.",
        "Someone changed the channel at exactly the wrong moment. That question is gone."
      ]
    },
    "Music": {
      bank: [
        "Straight in at number one. The money dances; let it.",
        "Gold-record behaviour. Played loud, paid in full.",
        "The B-side wins for once — and it pays like the A-side."
      ],
      miss: [
        "The needle skips clean over that one. Nobody was humming it.",
        "Off the charts in entirely the wrong direction. A blank, in stereo.",
        "That tune fades out with the whole room silent. A sad little outro."
      ]
    },
    "Ads & Jingles": {
      bank: [
        "Operators are standing by — and the money has already moved. Sold!",
        "But wait, there's more. There's money. Beautifully caught, table.",
        "That answer just moved the whole warehouse. Paid, with a jingle on top."
      ],
      miss: [
        "The offer expired while the table was still reading the small print.",
        "No sale. The product stays on the shelf — and so does the money.",
        "The jingle played to an empty room. A small tragedy, in three-part harmony."
      ]
    },
    "Toys & Games": {
      bank: [
        "Straight out of the toy box and into the bank. Paid!",
        "A winning move in the game inside the game. The money changes hands.",
        "Do not pass go — collect the money on your way past. Earned, table."
      ],
      miss: [
        "That one goes back in the box, unplayed.",
        "The whole table landed on the one square with nothing on it. The dice show no remorse.",
        "Some games you win; some games win you. That question just won."
      ]
    },
    "Saturday Morning": {
      bank: [
        "Part of a balanced breakfast: cartoons, cereal, and a cash prize.",
        "The cartoons would be proud — that answer earns the good cereal and the money to match.",
        "Saturday rules: stay in your pyjamas, get it right, get paid."
      ],
      miss: [
        "The bowl is empty and so is the table. That question went back to bed.",
        "Somebody changed the channel mid-cartoon, and the moment is gone.",
        "All that sugar on board, and still nobody caught it. The morning moves on."
      ]
    },
    "The Dial-Up Years": {
      bank: [
        "Connected at last — and this pays better than 56k ever did.",
        "The handshake completes, the page loads, the money arrives. Worth every beep.",
        "You've got mail, table — and it contains money."
      ],
      miss: [
        "Connection lost. That question timed out on everybody.",
        "A busy signal. The answer was engaged elsewhere.",
        "The download stalled at ninety-nine percent. So near, and yet so dial-up."
      ]
    }
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
  function resetLineBags() { lineBags = {}; lineLast = {}; revealPlayed = {}; revealLast = {}; }
  function authoredLine(kind, vars) {
    var line = drawLine(kind);
    if (vars) for (var k in vars) line = line.split("{" + k + "}").join(vars[k]);
    return line;
  }
  /* Improvement 5 — reveal draws for the five outcome pools run
     through one played-set per kind that folds the current question's
     category lines in with the generic pool: nothing repeats until
     everything eligible has played, a fresh cycle never opens with
     the line that just played, only the CURRENT category is ever
     eligible (a Movies line can land only on a Movies question), and
     with both pools stocked the category takes roughly half of the
     eligible reveals. */
  var revealPlayed = {}, revealLast = {};
  var REVEAL_BANK_KINDS = { allHit: true, someHit: true, numHit: true };
  var REVEAL_MISS_KINDS = { allMiss: true, numMiss: true };
  function drawRevealLine(kind, cat) {
    if (!REVEAL_BANK_KINDS[kind] && !REVEAL_MISS_KINDS[kind]) return drawLine(kind);
    var gen = HOST[kind] || ["…"];
    var sub = REVEAL_BANK_KINDS[kind] ? "bank" : "miss";
    var catPool = (cat && CAT_LINES[cat] && CAT_LINES[cat][sub]) || null;
    var played = revealPlayed[kind] || (revealPlayed[kind] = {});
    function candidates() {
      var out = [], i;
      for (i = 0; i < gen.length; i++) if (!played["g" + i]) out.push("g" + i);
      if (catPool) for (i = 0; i < catPool.length; i++) if (!played["c" + i]) out.push("c" + i);
      return out;
    }
    var cand = candidates();
    if (!cand.length) {
      revealPlayed[kind] = played = {};
      cand = candidates();
      if (cand.length > 1 && revealLast[kind]) {
        var lastId = revealLast[kind];
        cand = cand.filter(function (id) { return id !== lastId; });
      }
    }
    var id = cand[Math.floor(rng() * cand.length)];
    played[id] = true;
    revealLast[kind] = id;
    return id.charAt(0) === "g" ? gen[Number(id.slice(1))] : catPool[Number(id.slice(1))];
  }
  function revealLine(kind, vars, cat) {
    var line = drawRevealLine(kind, cat);
    if (vars) for (var k in vars) line = line.split("{" + k + "}").join(vars[k]);
    return line;
  }
  function hostSay(kind, vars) {
    $("hostLine").textContent = authoredLine(kind, vars);
  }
  /* a fully composed line (the Intermission's recap, the Rematch
     series framing) spoken verbatim — no pool draw, no fetch: the
     facts in it must land exactly as composed */
  function hostSayText(line) {
    var h = $("hostLine"); if (h) h.textContent = line;
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
  /* Cast pass 1 — Sterling redrawn to a portrait standard (the same
     man, better drawn): eyes with whites and irises around the SAME
     r=6.5 pupils the blink/glance/gesture CSS animates, shaped brows,
     a nose line instead of the blob, cel shading from one light
     (upper-left: one shade step on the face's lower-right, one on the
     suit's right side), a coif with a part, silver at the temples, and
     finished tailoring — notched lapels, a proper tie, a pocket
     square, and the wheel worn as a brass lapel pin. The title screen
     carries this same body inline (index.html); the badge carries it
     at 120-unit scale. Podium + arms below are untouched geometry. */
  var STERLING_BODY =
    '<path d="M52,380 L64,258 Q68,206 128,196 L192,196 Q252,206 256,258 L268,380 Z" fill="#241331"/>' +
    '<path d="M196,197 Q250,208 254,258 L266,380 L200,380 C206,320 206,250 196,197 Z" fill="#1D0E29"/>' +
    '<path d="M134,196 L186,196 L160,292 Z" fill="#FFF6E8"/>' +
    '<path d="M126,196 L160,242 L138,310 L110,216 L119,207 L105,199 Q114,193 126,196 Z" fill="#3A2150"/>' +
    '<path d="M194,196 L160,242 L182,310 L210,216 L201,207 L215,199 Q206,193 194,196 Z" fill="#2C1842"/>' +
    '<path d="M150,199 L170,199 L166,221 L154,221 Z" fill="#C93A68"/>' +
    '<path d="M154,221 L166,221 L171,261 L160,283 L149,261 Z" fill="#E8437C"/>' +
    '<path d="M160,221 L166,221 L171,261 L160,283 Z" fill="#D1356B"/>' +
    '<path d="M134,196 L152,196 L146,210 L133,205 Z" fill="#FFF6E8"/>' +
    '<path d="M186,196 L168,196 L174,210 L187,205 Z" fill="#F3E4CE"/>' +
    '<path d="M199,255 L223,249 L219,265 L203,265 Z" fill="#FFF6E8"/>' +
    '<path d="M211,252 L223,249 L221,257 Z" fill="#FFC93C"/>' +
    '<svg x="111" y="222" width="19" height="19" viewBox="0 0 120 120" aria-hidden="true"><use href="#emblem"></use></svg>' +
    '<rect x="146" y="158" width="28" height="42" rx="9" fill="#E89A63"/>' +
    '<rect x="146" y="184" width="28" height="13" fill="#D97F4A"/>' +
    '<circle cx="94" cy="124" r="13" fill="#F6B183"/><circle cx="93" cy="122" r="5" fill="#E89A63"/>' +
    '<circle cx="226" cy="124" r="13" fill="#F6B183"/><circle cx="227" cy="122" r="5" fill="#E89A63"/>' +
    '<ellipse cx="160" cy="118" rx="64" ry="70" fill="#F6B183"/>' +
    '<path d="M210,80 A64 70 0 0 1 154,188 C180,170 201,138 204,112 C205,98 208,88 210,80 Z" fill="#E89A63"/>' +
    '<path d="M163,113 L157,136 Q156,143 163,144 Q168,144 170,141" stroke="#D97F4A" stroke-width="4" stroke-linecap="round" fill="none"/>' +
    '<ellipse cx="110" cy="142" rx="11" ry="6.5" fill="#FF9D8A" opacity=".5"/>' +
    '<ellipse cx="206" cy="140" rx="10" ry="6" fill="#FF9D8A" opacity=".42"/>' +
    '<path d="M97,128 C90,84 96,40 128,26 C150,17 186,18 208,34 C226,48 232,84 223,128 C220,104 212,86 200,78 C192,84 184,84 176,72 C168,60 150,58 136,64 C118,70 104,92 97,128 Z" fill="#2A1530"/>' +
    '<path d="M148,31 C132,35 119,46 111,60 C121,44 134,35 148,31 Z" fill="#C9BCD6" opacity=".65"/>' +
    '<path d="M101,100 C104,84 110,72 120,65 C112,76 108,90 108,108 C104,105 102,102 101,100 Z" fill="#BBA9D2"/>' +
    '<path d="M219,100 C216,84 210,72 200,65 C208,76 212,90 212,108 C216,105 218,102 219,100 Z" fill="#BBA9D2"/>' +
    '<path d="M124,41 C142,30 166,28 186,34 C164,32 142,34 124,41 Z" fill="#452A5E" opacity=".85"/>';
  /* The eye: almond white, iris, the r=6.5 pupil the rig animates,
     one spec dot — wrapped in .st-eye so st-blink can flatten the
     whole eye now that there is a white to close (see style.css). */
  function STERLING_EYE(cx) {
    return '<g class="st-eye">' +
      '<path d="M' + (cx - 14) + ',110 Q' + cx + ',98 ' + (cx + 14) + ',110 Q' + cx + ',120 ' + (cx - 14) + ',110 Z" fill="#FFF9F0" stroke="#2A1530" stroke-width="3"/>' +
      '<circle cx="' + cx + '" cy="110" r="8.6" fill="#7A4A21"/>' +
      '<circle cx="' + cx + '" cy="110" r="6.5" fill="#2A1530"/>' +
      '<circle cx="' + (cx - 2.5) + '" cy="107.5" r="2.2" fill="#FFF6E8"/></g>';
  }
  var STERLING_FACE_SMIRK =
    '<path d="M106,93 Q128,84 151,89 L149,95 Q128,89 108,98 Z" fill="#2A1530"/>' +
    '<path d="M169,83 Q192,69 214,81 L212,88 Q192,76 171,89 Z" fill="#2A1530"/>' +
    STERLING_EYE(131) + STERLING_EYE(189) +
    '<path d="M125,149 Q160,168 197,139" stroke="#7C2D3E" stroke-width="6.5" stroke-linecap="round" fill="none"/>' +
    '<path d="M197,139 Q203,134 204,127" stroke="#7C2D3E" stroke-width="5" stroke-linecap="round" fill="none"/>';
  var STERLING_FACE_PRESENT =
    '<path d="M106,91 Q128,78 151,85 L149,91 Q128,84 108,96 Z" fill="#2A1530"/>' +
    '<path d="M169,85 Q192,78 214,91 L212,96 Q192,84 171,91 Z" fill="#2A1530"/>' +
    STERLING_EYE(131) + STERLING_EYE(189) +
    '<path d="M121,143 Q160,188 199,143 Q160,162 121,143 Z" fill="#7C2D3E"/>' +
    '<path d="M129,146 Q160,158 191,146 Q160,151.5 129,146 Z" fill="#FFFFFF"/>';
  /* Visual stage 2 — the podium + arms. The podium is drawn INSIDE
     Sterling's SVG, in front of the torso's lower half, so it scales
     with him in every layout for free: an ink lectern with a brass
     rail and the wheel medallion mounted on its front, its base on
     the SVG's own floor line (y=380). His arms pivot at the
     shoulders (84,218) / (236,218); at rest the forearms come in
     over the podium's top slab and the hands sit ON it — the
     natural host pose, and the pose every screenshot judges. The
     gesture classes (st-sweep / st-point-*) live on #scr-game and
     rotate these groups in style.css; the finale's "present" face
     keeps the same rest arms — the bow is the zone's own animation
     and no gesture ever fires there. */
  var STERLING_PODIUM =
    '<g class="st-podium">' +
    '<path d="M74,380 L88,306 L232,306 L246,380 Z" fill="#170B22"/>' +
    '<path d="M84,380 L96,314 L224,314 L236,380 Z" fill="#241331"/>' +
    '<path d="M100,372 L108,322 L212,322 L220,372 Z" fill="#2E1A40" stroke="#C6A45E" stroke-opacity=".45" stroke-width="2"/>' +
    '<svg x="132" y="318" width="56" height="56" viewBox="0 0 120 120" aria-hidden="true"><use href="#emblem"></use></svg>' +
    '<rect x="56" y="285" width="208" height="26" rx="12" fill="#170B22"/>' +
    '<rect x="56" y="285" width="208" height="8" rx="4" fill="#C6A45E" opacity=".8"/>' +
    '<rect x="56" y="306" width="208" height="5" fill="#C6A45E"/>' +
    "</g>";
  var STERLING_ARMS =
    '<g class="st-arm st-arm-l"><path d="M84,218 C60,238 54,262 70,282 C82,296 100,296 120,291" stroke="#4E2C68" stroke-width="29" stroke-linecap="round" fill="none"/><circle cx="104" cy="293" r="10" fill="#FFF6E8"/><circle cx="122" cy="290" r="13" fill="#F6B183"/></g>' +
    '<g class="st-arm st-arm-r"><path d="M236,218 C260,238 266,262 250,282 C238,296 220,296 200,291" stroke="#4E2C68" stroke-width="29" stroke-linecap="round" fill="none"/><circle cx="216" cy="293" r="10" fill="#FFF6E8"/><circle cx="198" cy="290" r="13" fill="#F6B183"/></g>';
  function sterlingSVG(variant, cls) {
    var inner = "";
    if (variant === "present") {
      inner = STERLING_BODY + STERLING_PODIUM + STERLING_ARMS + STERLING_FACE_PRESENT;
    } else { /* smirk — standings commentator, hands on the podium */
      inner = STERLING_BODY + STERLING_PODIUM + STERLING_ARMS + STERLING_FACE_SMIRK;
    }
    return '<svg class="' + (cls || "sterling sterling-md") + '" viewBox="0 0 320 380" aria-label="Sterling">' + inner + "</svg>";
  }

  /* player avatars (item 6): eight original flat bust portraits.
     Cast pass 2 — redrawn to the portrait standard Sterling set in
     cast pass 1, so all nine read as one cast from one hand: eyes
     with whites, warm-brown irises, ink pupils and a spec dot;
     tapered brow slivers set per character; Sterling's nose line in
     the darkened neck tone; one cel shade step (light from
     upper-left: a neck-tone crescent on the face's lower-right, the
     bust shade on its right side to match). Each bust rides a ground
     disc in the SEAT's colour, so a player's colour identity
     survives any portrait they pick.
     avatarSVG(avatarId, state, seatIdx): id 0..7, seat defaults to
     the id (which is exactly the old seat-index behaviour). */
  var PCHEAD = ["#35D461", "#38B6FF", "#FF6B5E", "#B07FE8"];
  function dk(hex, f) {
  var n = parseInt(hex.slice(1), 16);
  var r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
  return "rgb(" + r + "," + g + "," + b + ")";
}
var AVATARS = [
  { /* 0 — the Starlet: gold waves, hoop earrings, a beauty mark */
    skin: "#F6B183", neck: "#E89A63", shirt: "#E8437C", hair: "#F2C14E", brow: "#8A5A12",
    mouth: "#C2255C", blush: .5, mouthStyle: "lips",
    back: '<path d="M28,44 C24,16 40,6 60,6 C80,6 96,16 92,44 L94,78 C86,84 78,78 79,66 L80,44 C68,34 52,34 40,44 L41,66 C42,78 34,84 26,78 Z" fill="#F2C14E"/>',
    front: '<path d="M32,44 C31,19 45,10 60,10 C75,10 89,19 88,44 C86,31 80,25 71,25 C75,29 76,34 74.5,39 C68,30 55,28 46,32 C38,35 34,39 32,44 Z" fill="#F2C14E"/>' +
      '<path d="M40,20 Q56,13 76,19 Q58,18 40,20 Z" fill="#FFE29A" opacity=".8"/>' +
      '<path d="M38,26 Q50,20 64,22 Q50,23.5 38,26 Z" fill="#FFE29A" opacity=".5"/>',
    acc: '<circle cx="29.5" cy="60" r="4.4" fill="none" stroke="#FFC93C" stroke-width="2.4"/>' +
      '<circle cx="90.5" cy="60" r="4.4" fill="none" stroke="#FFC93C" stroke-width="2.4"/>' +
      '<circle cx="27.8" cy="57.8" r="1" fill="#FFF6E8"/><circle cx="88.8" cy="57.8" r="1" fill="#FFF6E8"/>' +
      '<circle cx="75" cy="55" r="1.7" fill="#2A1530"/>'
  },
  { /* 1 — the Crooner: swept quiff, gold chain over a blue shirt */
    skin: "#B96F3E", neck: "#9A5527", shirt: "#1563B2", hair: "#17101F", brow: "#17101F",
    mouth: "#5E2408", blush: .35, mouthStyle: "grin", ears: true,
    back: "",
    front: '<path d="M31,44 C30,20 44,10 58,10 C56,5 66,3 73,8 C86,13 90,26 89,44 C85,29 76,25 64,26 C49,27 37,30 31,44 Z" fill="#17101F"/>' +
      '<path d="M38,26 C46,16 58,12 70,14 C58,15 46,19 38,26 Z" fill="#4A3566" opacity=".85"/>',
    acc: '<path d="M38,92 Q60,106 82,92" stroke="#FFC93C" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
      '<path d="M52,97 L60,108 L68,97 L60,101 Z" fill="#FFC93C"/>',
    collar: '<path d="M48,88 L60,100 L72,88 L72,96 L60,106 L48,96 Z" fill="#FFF6E8"/>'
  },
  { /* 2 — the Kid: backwards cap, freckles, grin for days */
    skin: "#F2B183", neck: "#D98E57", shirt: "#3ECF6E", hair: "#2A1530", brow: "#2A1530",
    mouth: "#7C2D3E", blush: .5, mouthStyle: "kidgrin", ears: true, bigEyes: true,
    back: "",
    front: '<path d="M33,40 C36,24 46,17 60,17 C74,17 84,24 87,40 C76,31 44,31 33,40 Z" fill="#2A1530"/>' +
      '<path d="M30,33 C32,16 44,7 60,7 C76,7 88,16 90,33 C74,25 46,25 30,33 Z" fill="#E8437C"/>' +
      '<path d="M42,14 Q60,9 78,14 Q60,12.5 42,14 Z" fill="#C2255C" opacity=".65"/>' +
      '<rect x="12" y="24" width="20" height="7" rx="3.5" transform="rotate(14 22 27)" fill="#C2255C"/>' +
      '<circle cx="60" cy="10" r="3" fill="#FFC93C"/>',
    acc: '<circle cx="42" cy="54" r="1.7" fill="#D98E57"/><circle cx="48" cy="57" r="1.7" fill="#D98E57"/><circle cx="41" cy="59" r="1.7" fill="#D98E57"/>' +
      '<circle cx="78" cy="54" r="1.7" fill="#D98E57"/><circle cx="72" cy="57" r="1.7" fill="#D98E57"/><circle cx="79" cy="59" r="1.7" fill="#D98E57"/>'
  },
  { /* 3 — the Grandmother: silver bun, gold spectacles, pearls */
    skin: "#8A4B26", neck: "#6B3418", shirt: "#9B5DE5", hair: "#D8C9E8", brow: "#D8C9E8",
    mouth: "#4A1E08", blush: .3, mouthStyle: "warm",
    back: '<circle cx="60" cy="9" r="9.5" fill="#D8C9E8"/><path d="M31,46 C29,22 44,12 60,12 C76,12 91,22 89,46 C86,30 74,25 60,25 C46,25 34,30 31,46 Z" fill="#D8C9E8"/>' +
      '<path d="M40,20 Q60,13 80,20 Q60,17 40,20 Z" fill="#FFFFFF" opacity=".35"/>',
    front: "",
    acc: '<circle cx="31" cy="61" r="2.7" fill="#FFF6E8"/><circle cx="89" cy="61" r="2.7" fill="#FFF6E8"/>' +
      '<circle cx="60" cy="100" r="4.2" fill="#FFC93C"/><circle cx="60" cy="100" r="1.9" fill="#E8437C"/>',
    glasses: "#FFC93C"
  },
  { /* 4 — the Rocker: long mane, gold headband, lightning drop */
    skin: "#F6B183", neck: "#E89A63", shirt: "#3A2150", hair: "#8E3B2F", brow: "#5E2408",
    mouth: "#7C2D3E", blush: .42, mouthStyle: "half", lid: true,
    back: '<path d="M25,40 C23,11 42,3 60,3 C78,3 97,11 95,40 L98,104 L79,104 L80.5,50 C70,40 50,40 39.5,50 L41,104 L22,104 Z" fill="#8E3B2F"/>' +
      '<path d="M80.5,50 L79,104 L87,104 L86,42 C84,45.5 82.5,47.8 80.5,50 Z" fill="#6E2A20" opacity=".55"/>',
    front: '<path d="M32,41 C34,19 46,12 60,12 C74,12 86,19 88,41 L79,29 L72,40 L64,28 L56,39 L48,28 L40,38 Z" fill="#8E3B2F"/>' +
      '<rect x="31" y="31" width="58" height="7.5" rx="3.75" transform="rotate(-2 60 35)" fill="#FFC93C"/>',
    acc: '<path d="M91,58 L85,70 L89.5,70 L84,82 L95,66 L90.5,66 Z" fill="#FFC93C"/>',
    collar: '<path d="M43,89 L60,110 L51,91 L46,88 Z" fill="#1D0E29"/><path d="M77,89 L60,110 L69,91 L74,88 Z" fill="#1D0E29"/><circle cx="60" cy="97" r="2.2" fill="#C9BCD6"/>'
  },
  { /* 5 — the Cowboy: tan hat, moustache, neckerchief */
    skin: "#C68642", neck: "#A66A2E", shirt: "#17BEBB", hair: "#2A1530", brow: "#2A1530",
    mouth: "#5E2408", blush: .35, mouthStyle: "stache", squint: true,
    back: '<path d="M33,44 L33,64 L39,64 L39,46 Z M87,44 L87,64 L81,64 L81,46 Z" fill="#2A1530"/>',
    front: '<path d="M38,28 C39,13 46,6 60,6 C74,6 81,13 82,28 C69,23.5 51,23.5 38,28 Z" fill="#C97B3D"/>' +
      '<path d="M52,7.5 Q60,12.5 68,7.5 Q60,10 52,7.5 Z" fill="#A66A2E" opacity=".85"/>' +
      '<path d="M40.5,19.5 C52,16.5 68,16.5 79.5,19.5 L80,24 C66,20.8 54,20.8 40,24 Z" fill="#E8437C"/>' +
      '<path d="M23,29.5 C36,24 84,24 97,29.5 C84,35 36,35 23,29.5 Z" fill="#C97B3D"/>' +
      '<path d="M23,29.5 C36,35 84,35 97,29.5 C84,32.8 36,32.8 23,29.5 Z" fill="#A66A2E" opacity=".8"/>',
    acc: '<path d="M40,57 Q50,50 60,57 Q70,50 80,57 Q72,66 60,61.5 Q48,66 40,57 Z" fill="#2A1530"/>',
    collar: '<path d="M47,87 L60,104 L73,87 L66,87 L60,94 L54,87 Z" fill="#E8437C"/><circle cx="60" cy="96" r="3.4" fill="#FFC93C"/>',
    stache: true
  },
  { /* 6 — the Professor: side part, round glasses, bowtie + moustache */
    skin: "#F2B183", neck: "#D98E57", shirt: "#241331", hair: "#B9C7D6", brow: "#B9C7D6",
    mouth: "#7C2D3E", blush: .5, mouthStyle: "stache",
    back: '<path d="M31,52 C29,40 33,32 38,28 L40,44 C35,46 33,48 31,52 Z M89,52 C87,48 85,46 80,44 L82,28 C87,32 91,40 89,52 Z" fill="#B9C7D6"/>',
    front: '<path d="M34,38 C33,21 45,12 60,12 C73,12 84,18 87,28 C79,21 68,19 57,22 C45,25 37,30 34,38 Z" fill="#B9C7D6"/>' +
      '<path d="M47.5,14.5 Q44.5,21 45.5,27.5" stroke="#8FA2B5" stroke-width="1.7" stroke-linecap="round" fill="none"/>' +
      '<path d="M42,19 Q54,14.5 68,16.5 Q54,17.5 42,19 Z" fill="#E8EEF4" opacity=".55"/>',
    acc: '<path d="M41,59 Q51,53 60,59 Q69,53 79,59 Q71,67 60,63 Q49,67 41,59 Z" fill="#B9C7D6"/>',
    glasses: "#FFC93C",
    collar: '<path d="M50,88 L70,88 L60,102 Z" fill="#FFF6E8"/><path d="M60,96 L48,89 Q44,96 48,103 Z" fill="#E8437C"/><path d="M60,96 L72,89 Q76,96 72,103 Z" fill="#E8437C"/><rect x="55.5" y="92.5" width="9" height="8" rx="3" fill="#FFC93C"/>',
    stache: true
  },
  { /* 7 — the Mod: sharp black bob, gold hoops, unhurried */
    skin: "#8A4B26", neck: "#6B3418", shirt: "#FF8C42", hair: "#17101F", brow: "#17101F",
    mouth: "#E8437C", blush: .3, mouthStyle: "dry",
    back: '<path d="M27,42 C25,14 42,5 60,5 C78,5 95,14 93,42 L95,80 C86,85 81,79 81.5,68 L82,42 L38,42 L38.5,68 C39,79 34,85 25,80 Z" fill="#17101F"/>',
    front: '<path d="M33,40 C34,20 46,13 60,13 C74,13 86,20 87,40 L87,28 L33,32.5 Z" fill="#17101F"/>' +
      '<path d="M36,16 Q48,10 62,11 Q48,13 36,16 Z" fill="#452A5E" opacity=".9"/>',
    acc: '<circle cx="28.5" cy="66" r="4.6" fill="none" stroke="#FFC93C" stroke-width="2.4"/>' +
      '<circle cx="91.5" cy="66" r="4.6" fill="none" stroke="#FFC93C" stroke-width="2.4"/>',
    collar: '<path d="M45,81 L75,81 L76,92 Q60,96.5 44,92 Z" fill="#D96F24"/>',
    glassesBold: "#17101F"
  }
];
function avEye(A, cx, o) {
  o = o || {};
  var rx = o.rx || 6.6, ry = o.ry || 4.9, ir = o.ir || 4.1, pu = o.pu || 3.1, sw = o.sw || 1.7;
  var s = '<ellipse cx="' + cx + '" cy="46" rx="' + rx + '" ry="' + ry + '" fill="#FFF9F0" stroke="#2A1530" stroke-width="' + sw + '"/>' +
    '<circle cx="' + cx + '" cy="46" r="' + ir + '" fill="#7A4A21"/>' +
    '<circle cx="' + cx + '" cy="46" r="' + pu + '" fill="#2A1530"/>' +
    '<circle cx="' + (cx - 1) + '" cy="44.9" r="1" fill="#FFF6E8"/>';
  if (o.lid) s += '<path d="M' + (cx - rx) + ',' + (46 - ry + 0.6) + ' Q' + cx + ',' + (46 - ry - 2.8) + ' ' + (cx + rx) + ',' + (46 - ry + 0.6) + '" stroke="' + dk(A.neck, .8) + '" stroke-width="1.6" stroke-linecap="round" fill="none"/>';
  return s;
}
function avBrow(A, cx, o) {
  o = o || {};
  var y = o.y || 35, arch = o.arch != null ? o.arch : 3.5, th = o.th || 3.2, sp = o.sp || 9;
  var dL = o.dL || 0, dR = o.dR || 0;
  return '<path d="M' + (cx - sp) + ',' + (y + dL) + ' Q' + cx + ',' + (y - arch) + ' ' + (cx + sp) + ',' + (y + dR) +
    ' L' + (cx + sp - 1.4) + ',' + (y + dR + th) + ' Q' + cx + ',' + (y - arch + th + 1.2) + ' ' + (cx - sp + 1.4) + ',' + (y + dL + th) + ' Z" fill="' + A.brow + '"/>';
}
function avFeatures(A, id, state) {
  var sweat = '<path d="M98,18 C104,29 106,35 98,41 C90,35 92,29 98,18 Z" fill="#7FD4FF"/><circle cx="95.5" cy="32" r="2" fill="#E8FAFF"/>';
  var s = "";
  if (state === "cheer") {
    s += '<path d="M40.5,47 Q49,39.5 57.5,47" stroke="#2A1530" stroke-width="3.2" stroke-linecap="round" fill="none"/>' +
      '<path d="M62.5,47 Q71,39.5 79.5,47" stroke="#2A1530" stroke-width="3.2" stroke-linecap="round" fill="none"/>';
    if (!A.stache) s += '<path d="M44,58 Q60,80 76,58 Q60,67 44,58 Z" fill="' + A.mouth + '"/>' +
      '<path d="M52,68 Q60,74 68,68 Q60,71 52,68 Z" fill="#FF8FA3"/>';
    else s += '<path d="M50,66 Q60,74 70,66 Q60,69.5 50,66 Z" fill="' + A.mouth + '"/>';
  } else if (state === "slump") {
    s += avBrow(A, 49, { y: 34, arch: 1, th: 3.2, dL: 2.5, dR: -2 }) +
      avBrow(A, 71, { y: 34, arch: 1, th: 3.2, dL: -2, dR: 2.5 });
    s += '<path d="M40.5,44.5 Q49,50.5 57.5,44.5" stroke="#2A1530" stroke-width="3.2" stroke-linecap="round" fill="none"/>' +
      '<path d="M62.5,44.5 Q71,50.5 79.5,44.5" stroke="#2A1530" stroke-width="3.2" stroke-linecap="round" fill="none"/>';
    if (!A.stache) s += '<path d="M48,66 Q55,62 60,66 Q65,70 72,66" stroke="' + A.mouth + '" stroke-width="3.2" stroke-linecap="round" fill="none"/>';
    s += sweat;
  } else {
    /* brows — one sliver grammar, per-character set */
    var B = [
      [{ y: 34, arch: 4.6, th: 3.1 }, { y: 34, arch: 4.6, th: 3.1 }],
      [{ y: 35, arch: 3.4, th: 3.4 }, { y: 35, arch: 3.4, th: 3.4 }],
      [{ y: 31.5, arch: 4, th: 3, sp: 7.5 }, { y: 31.5, arch: 4, th: 3, sp: 7.5 }],
      [{ y: 33.5, arch: 4, th: 3 }, { y: 33.5, arch: 4, th: 3 }],
      [{ y: 36.5, arch: 1.8, th: 3.6, dR: 1.2 }, { y: 36.5, arch: 1.8, th: 3.6, dL: 1.2 }],
      [{ y: 35.5, arch: 2.2, th: 3.4 }, { y: 35.5, arch: 2.2, th: 3.4 }],
      [{ y: 33, arch: 2.2, th: 3.6 }, { y: 32, arch: 3.4, th: 3.6, dR: 1.2 }],
      [{ y: 33.5, arch: 2, th: 3.2 }, { y: 33.5, arch: 4.6, th: 3.2, dR: .8 }]
    ][id];
    s += avBrow(A, 49, B[0]) + avBrow(A, 71, B[1]);
    /* eyes — whites + iris + pupil + spec, one grammar */
    var eo = {};
    if (A.bigEyes) eo = { rx: 7.4, ry: 5, ir: 5, pu: 3.5, sw: 1.5 };
    else if (A.lid) eo = { ry: 4.3, lid: true };
    else if (A.squint) eo = { rx: 6.4, ry: 3.9, ir: 3.9, pu: 3 };
    else if (id === 3) eo = { rx: 6.2, ry: 4.6, ir: 3.9, pu: 3 };
    else if (id === 7) eo = { rx: 7, ry: 5.2, ir: 4.4, pu: 3.3 };
    s += avEye(A, 49, eo) + avEye(A, 71, eo);
    /* nose — Sterling's line, in the darkened neck tone */
    if (A.stache) s += '<path d="M61.5,49 L59.8,53.8 Q59.5,55.6 61.2,55.6 Q62.8,55.6 63.4,54.6" stroke="' + dk(A.neck, .85) + '" stroke-width="1.8" stroke-linecap="round" fill="none"/>';
    else if (A.bigEyes) s += '<path d="M60.8,49.5 L59.5,53.5 Q59.2,55.2 60.8,55.2 Q62.2,55.2 62.8,54.2" stroke="' + dk(A.neck, .85) + '" stroke-width="1.7" stroke-linecap="round" fill="none"/>';
    else s += '<path d="M61.5,49.5 L59.2,56.8 Q58.8,59.2 61.2,59.2 Q63.4,59.2 64.2,57.8" stroke="' + dk(A.neck, .85) + '" stroke-width="1.8" stroke-linecap="round" fill="none"/>';
    /* mouths — each character's own */
    switch (A.mouthStyle) {
      case "lips":
        s += '<path d="M44,59.5 Q60,73 76,59.5 Q60,63.8 44,59.5 Z" fill="' + A.mouth + '"/>'; break;
      case "grin":
        s += '<path d="M41,58 Q60,76 79,58 Q60,64.5 41,58 Z" fill="' + A.mouth + '"/>' +
          '<path d="M45,59.8 Q60,61.5 75,59.8 Q60,65.8 45,59.8 Z" fill="#FFF"/>'; break;
      case "kidgrin":
        s += '<path d="M43,58 Q60,75 77,58 Q60,64.5 43,58 Z" fill="' + A.mouth + '"/>' +
          '<rect x="52" y="60.6" width="6" height="3.6" rx="1.3" fill="#FFF"/><rect x="62" y="60.6" width="6" height="3.6" rx="1.3" fill="#FFF"/>'; break;
      case "warm":
        s += '<path d="M42,58.5 Q60,76 78,58.5 Q60,65.5 42,58.5 Z" fill="' + A.mouth + '"/>' +
          '<path d="M48.5,60.2 Q60,63 71.5,60.2 Q60,65.4 48.5,60.2 Z" fill="#FFF6E8"/>'; break;
      case "half":
        s += '<path d="M45,63 Q59,70.5 73,58.5" stroke="' + A.mouth + '" stroke-width="3" stroke-linecap="round" fill="none"/>' +
          '<path d="M73,58.5 Q77.5,56.5 78,52.5" stroke="' + A.mouth + '" stroke-width="3" stroke-linecap="round" fill="none"/>'; break;
      case "dry":
        s += '<path d="M50,62.5 Q60,67.5 70,60.5" stroke="' + A.mouth + '" stroke-width="2.8" stroke-linecap="round" fill="none"/>'; break;
      default: /* stache — the moustache is the mouth */
        break;
    }
  }
  if (A.glasses) {
    s += '<g stroke="' + A.glasses + '" stroke-width="2.8" fill="none">' +
      '<circle cx="49" cy="46" r="10"/><circle cx="71" cy="46" r="10"/>' +
      '<path d="M59,43.5 Q60,42 61,43.5 M39,43 L32.5,40.5 M81,43 L87.5,40.5"/></g>';
  }
  if (A.glassesBold) {
    s += '<g stroke="' + A.glassesBold + '" stroke-width="3.2" fill="none">' +
      '<rect x="38.5" y="37.5" width="20" height="16.5" rx="6"/><rect x="61.5" y="37.5" width="20" height="16.5" rx="6"/>' +
      '<path d="M58.5,42 L61.5,42 M38.5,41 L32,39 M81.5,41 L88,39"/></g>';
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
    '<path d="M106,124 Q102,90 60,88 L60,124 Z" fill="#000" opacity=".07"/>' +
    '<rect x="51" y="66" width="18" height="18" rx="6" fill="' + A.neck + '"/>';
  if (A.ears) s += '<circle cx="31.5" cy="49" r="5.5" fill="' + A.skin + '"/><circle cx="32.3" cy="48" r="2.4" fill="' + A.neck + '"/>' +
    '<circle cx="88.5" cy="49" r="5.5" fill="' + A.skin + '"/><circle cx="87.7" cy="48" r="2.4" fill="' + A.neck + '"/>';
  s += '<circle cx="60" cy="46" r="28" fill="' + A.skin + '"/>' +
    '<path d="M83,30 A28 28 0 0 1 56,74 C68,67 79,54 80,45 C80.5,39 81,34 83,30 Z" fill="' + A.neck + '"/>' +
    '<ellipse cx="43" cy="55" rx="5.5" ry="3.2" fill="#FF9D8A" opacity="' + (A.blush || .45) + '"/>' +
    '<ellipse cx="77" cy="55" rx="5.5" ry="3.2" fill="#FF9D8A" opacity="' + ((A.blush || .45) * .85) + '"/>' +
    A.front + avFeatures(A, id, state) + (A.acc || "") + (A.collar || "");
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
    _noiseBuf: function () {
      if (!this._noise) {
        var len = this.ctx.sampleRate, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        var d = buf.getChannelData(0); for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this._noise = buf;
      }
      return this._noise;
    },
    noise: function (dur, vol, freq) {
      if (!this.ctx || this.ctx.state !== "running") return;
      this._noiseBuf();
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
    /* one short noise burst through a bandpass — the click / knock /
       tick the category signatures are built from. Same discipline
       as tone()/noise(): guarded, envelope-shaped, stops itself. */
    burst: function (dur, vol, freq, delay, q) {
      if (!this.ctx || this.ctx.state !== "running") return;
      var t0 = this.ctx.currentTime + (delay || 0);
      var src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf();
      src.playbackRate.value = 0.9 + Math.random() * 0.2;
      var f = this.ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq || 2400; f.Q.value = q || 1.1;
      var g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.05);
    },
    /* ---------- category signatures (Improvement 3) ----------
       One short synthesized motif per category, played once when a
       question of that category opens — on the host only; the pads
       never call this. Punctuation under Sterling's voice, not
       performances: no element is driven past 0.36 where "correct"
       plays at 0.4 — and the bandpass bursts measure quieter than
       their drive, since the filter passes only a slice of the
       noise. The nightly special carries its
       underlying category in cat, so it signs with that category —
       the same rule as its emblem. */
    sig: {
      "Movies": function () { // projector clatter: a run of ticks that settles
        var d = [0, .06, .115, .165, .22, .285, .36, .45], v = [.35, .35, .31, .31, .28, .24, .21, .17], i;
        for (i = 0; i < d.length; i++) this.burst(.036, v[i], 2300, d[i], 1.2);
        this.tone(190, .06, "square", .07, .45);
      },
      "TV": function () { // channel-change zap: a static burst, then a clean test tone
        this.burst(.09, .3, 3000, 0, .7);
        this.burst(.06, .22, 1700, .06, .8);
        this.tone(1000, .22, "sine", .15, .16);
      },
      "Music": function () { // needle drop: a crackle tick, then one warm low note blooms
        this.burst(.018, .2, 4200, 0, .9);
        this.burst(.012, .11, 3700, .07, .9);
        this.tone(65.41, .8, "sine", .1, .05);
        this.tone(130.81, .82, "sine", .22, .05);
        this.tone(196.0, .68, "triangle", .06, .06);
      },
      "Ads & Jingles": function () { // a bright three-note jingle sting
        this.tone(659.25, .13, "triangle", .22, 0);
        this.tone(783.99, .13, "triangle", .22, .105);
        this.tone(1046.5, .32, "triangle", .24, .21);
        this.tone(1318.5, .2, "sine", .08, .21);
        this.tone(523.25, .3, "sine", .07, .21);
      },
      "Toys & Games": function () { // dice rattle: hard little knocks tumbling to rest
        var d = [0, .055, .14, .2, .315], fq = [2100, 1700, 2400, 1500, 1200], v = [.36, .29, .31, .24, .21], i;
        for (i = 0; i < d.length; i++) this.burst(.032, v[i], fq[i], d[i], 2);
        this.burst(.04, .24, 700, .4, 1.2);
        this.tone(180, .05, "square", .05, .4);
      },
      "Saturday Morning": function () { // cereal pour: a spray of tiny ticks, then a spoon clink
        var d = [0, .035, .06, .1, .13, .17, .205, .25, .29, .34, .385], i;
        for (i = 0; i < d.length; i++) this.burst(.014, i % 2 ? .13 : .09, 5400, d[i], 1.4);
        this.tone(3350, .16, "sine", .11, .46);
        this.tone(4750, .09, "sine", .05, .46);
      },
      "The Dial-Up Years": function () { // a tamed handshake: two answer tones and a short,
        // gentle chirp — the screech evoked, never assaulted
        this.tone(2225, .13, "sine", .09, 0);
        this.tone(2025, .11, "sine", .075, .15);
        this.tone(1250, .26, "sine", .065, .3, 1750);
        this.tone(1750, .2, "sine", .05, .36, 1200);
        this.tone(1046.5, .09, "sine", .07, .64);
      }
    },
    playSignature: function (cat) {
      if (this.muted || !this.ctx || this.ctx.state !== "running") return;
      var f = this.sig[cat];
      if (!f) return;
      try { f.call(this); } catch (e) {}
    },
    play: function (kind) {
      if (this.muted || !this.ctx || this.ctx.state !== "running") return;
      try {
        var i;
        if (kind === "theme") { var n = [196.0, 392.0, 523.25, 659.25, 783.99]; for (i = 0; i < n.length; i++) this.tone(n[i], 0.55, "triangle", 0.32, i * 0.09); this.tone(98.0, 0.9, "sine", 0.3, 0); }
        else if (kind === "correct") { this.tone(659.25, 0.16, "triangle", 0.4, 0); this.tone(987.77, 0.34, "triangle", 0.4, 0.09); }
        else if (kind === "gold") { var g = [1318.5, 1567.98, 2093.0]; for (i = 0; i < g.length; i++) this.tone(g[i], 0.22, "sine", 0.3, i * 0.06); }
        /* Design pass 6: the snip — two bandpass bursts off the kit's
           own noise primitive, a pair of scissor blades closing.
           Measured like the signatures: punctuation, not performance. */
        else if (kind === "snip") { this.burst(0.045, 0.34, 3600, 0, 2.2); this.burst(0.065, 0.27, 2600, 0.075, 2.2); }
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
  /* Visual stage 1: the footlights read the room's phase. Every
     phase presenter in both modes mirrors its phase here; the set's
     CSS warms the footlights on "reveal" and holds them full on
     "over". Event-driven only — no timers. */
  function stagePhase(p) { var g = $("scr-game"); if (g) g.setAttribute("data-phase", p); }
  /* Visual stage 3: the category backdrop. askCurrent and
     ogShowQuestion hand the question's category here at the same
     moment they call applyCat — so the nightly special wears its
     underlying category, exactly like its pill and its wash. The
     emblem swap is a two-copy crossfade: the dark copy takes the
     new emblem, then the .on class trades places, so no stale
     emblem can ever show. The back glow needs no code — it reads
     --cat-rgb like .set-mid does. Visibility is pure CSS, keyed to
     data-phase (question/reveal); the backdrop leaves with the
     question. A repeat of the current category is a no-op. */
  var catBackdropCat = null, catBackdropFlip = false;
  function setCatBackdrop(cat) {
    var id = CATEMBLEM[cat];
    if (!id || cat === catBackdropCat) return;
    var a = document.querySelector(".set-cat-a"), b = document.querySelector(".set-cat-b");
    if (!a || !b) return;
    catBackdropCat = cat; catBackdropFlip = !catBackdropFlip;
    var on = catBackdropFlip ? b : a, off = catBackdropFlip ? a : b;
    on.querySelector("use").setAttribute("href", "#" + id);
    on.classList.add("on"); off.classList.remove("on");
  }
  /* ---------- Visual stage 4: visible fortunes ----------
     Every seat wears a little cluster of brass coin stacks on the
     right-hand end of its desk. Height is the score told RELATIVELY:
     the leader's tallest stack stands full height, everyone else in
     proportion, so wealth reads across the room without a digit.
     $0 is an empty saucer spot — zero reads as zero. The piles are
     painted from displayed values (fortuneDisp / ogFortuneDisp) that
     chase the real scores more slowly than the count-up digits do,
     which times the growth to the coin flights: a bank's stack
     finishes rising just as the last coins land. One element per
     seat, three stack children, heights in px derived from --fmax
     (owned by the CSS per breakpoint); the only transition is the
     stacks' height. Painted at seat renders and from the same tick
     loops that run the score count-ups — no new timers. */
  var fortuneDisp = [], ogFortuneDisp = [];
  function fortuneHTML() {
    return '<div class="fortune zero" aria-hidden="true"><i class="fstk a"></i><i class="fstk b"></i><i class="fstk c"></i></div>';
  }
  /* stack heights as fractions of --fmax, ordered [mid, tall, short]:
     a pile grows a second stack past 30% of the leader and a third
     past 62%, and any money at all keeps a small pile standing */
  function fortuneFracs(score, scale) {
    if (!(score > 0) || !(scale > 0)) return null;
    var f = score / scale; if (f > 1) f = 1;
    var tall = Math.max(f, 0.18);
    var mid = f > 0.30 ? Math.max(f * 0.64, 0.13) : 0;
    var short = f > 0.62 ? Math.max(f * 0.40, 0.11) : 0;
    return [mid, tall, short];
  }
  function paintFortune(seat, dispVal, scale, isLead) {
    if (!seat) return;
    var f = seat.querySelector(".fortune");
    if (!f) return;
    var key = window.innerWidth + "x" + window.innerHeight;
    if (f._fkey !== key) {
      f._fkey = key;
      f._fmax = parseFloat(getComputedStyle(f).getPropertyValue("--fmax")) || 32;
    }
    var fr = fortuneFracs(dispVal, scale);
    var hs = fr ? fr.map(function (x) { return Math.round(x * f._fmax * 2) / 2; }) : [0, 0, 0];
    var sig = (fr ? hs.join(",") : "z") + (isLead ? "L" : "");
    if (f._fsig === sig) return;
    f._fsig = sig;
    f.classList.toggle("zero", !fr);
    f.classList.toggle("lead", !!isLead);
    var kids = f.children;
    for (var k = 0; k < 3; k++) if (kids[k]) {
      kids[k].style.height = hs[k] + "px";
      /* a stack with no height keeps its box (visibility, never
         display) so the height transition still runs when it
         grows back — a display flip would snap it */
      kids[k].classList.toggle("off", hs[k] <= 0);
    }
  }
  /* fortune rail: displayed totals tween toward real scores */
  function stepFortune(dt) {
    if (!G) return;
    var fortuneLead = 0, realLead = 0;
    G.players.forEach(function (p, i) {
      var dv = fortuneDisp[i] != null ? fortuneDisp[i] : p.score;
      if (dv > fortuneLead) fortuneLead = dv;
      if (p.score > realLead) realLead = p.score;
    });
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
      /* Visual stage 4: the pile chases the same score at a slower
         rate than the digits (dt*7 above), so growth lands with the
         coin flight instead of racing it */
      if (fortuneDisp[i] == null) fortuneDisp[i] = p.score;
      var fdiff = p.score - fortuneDisp[i];
      if (fdiff !== 0) {
        fortuneDisp[i] += fdiff * Math.min(1, dt * 2.8);
        if (Math.abs(p.score - fortuneDisp[i]) < 2) fortuneDisp[i] = p.score;
      }
      paintFortune(seat, fortuneDisp[i], fortuneLead, p.score > 0 && p.score >= realLead);
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
  /* Visual stage 2 — gestures. The presenting sweep: a question has
     just opened and the card sits centre-stage, which from Sterling's
     place (stage-left in the standings frame, the host bar in play)
     is always his right — so the right arm does the presenting, in
     concert with a glance the same way. The point: aimed by MEASURED
     geometry, not by seat number — the banking seat's centre against
     Sterling's own centre decides left / centre / right, so the same
     code aims correctly from the host bar, the standings frame, or
     the finale frame, and the pupils travel with the arm (the CSS
     moves both). Nobody banks → no point is ever fired. The finale
     never calls either helper: the bow owns that screen. */
  function stSweep() { stClass("st-sweep", 1500); }
  function stPoint(seatIdx) {
    var seat = document.querySelector('.seat[data-seat="' + seatIdx + '"]');
    var host = document.querySelector("#stage .sterling") || document.querySelector(".host-face");
    if (!seat || !host) return;
    var sr = seat.getBoundingClientRect(), hr = host.getBoundingClientRect();
    if (!sr.width || !hr.width) return;
    var dx = (sr.left + sr.width / 2) - (hr.left + hr.width / 2);
    /* the bands are reach, not just direction: a seat near him gets
       the dropped-arm centre point, only a seat across the room
       earns the wide swing, and a seat genuinely to his left (the
       finale frame stands him stage-right) gets the left arm */
    stClass(dx < -30 ? "st-point-l" : dx > 240 ? "st-point-r" : "st-point-c", 1300);
  }
  /* Design pass 6 — Cut Two's moment helpers. The banner is a pure
     overlay: absolutely positioned over the stage, pointer-events
     none, self-removing — no layout box moves and the question clock
     never waits on it. It is dealt ONLY by the live spend paths
     (useCut / ogOnCut), never by a render, so a repaint or a resumed
     show shows the cut state settled with no replay. The seat flash
     rides the spender's desk tag for the same beat. */
  function cutBanner(name) {
    var st = $("stage"); if (!st) return;
    var old = st.querySelector(".cut-banner"); if (old) old.remove();
    var b = document.createElement("div");
    b.className = "cut-banner";
    b.textContent = "✂ " + name + " CUTS TWO";
    st.appendChild(b);
    setTimeout(function () { if (b.isConnected) b.remove(); }, 1300);
  }
  function seatCutFlash(i) {
    var s = document.querySelector('.seat[data-seat="' + i + '"]');
    if (s) s.classList.add("cutflash");
  }
  /* Visual stage 5 — reveal theatre. The light sweep: as a reveal
     paints, one band of stage light crosses the question card and a
     matching sheen crosses the correct slab (the CSS does the moving;
     this only deals the classes, in the same transient idiom as the
     gestures above). The receipt: whySlip() below is the why-line's
     reveal markup — a paper slip in a slot-topped wrap that prints
     with a stepped advance. A SETTLED reveal (a resumed show
     repainting its reveal, an online snapshot resync) gets neither:
     the slip sits fully printed and no light moves — the reveal as
     shown, not the reveal again. */
  function revealTheatre(settled) {
    if (settled) return;
    var card = document.querySelector("#stage .q-text");
    if (card) card.classList.add("sweep");
    var ok = document.querySelector("#stage .ans-btn.correct");
    if (ok) ok.classList.add("sheen");
  }
  function whySlip(text, settled, tag) {
    return '<div class="why-wrap' + (settled ? "" : " printing") + '"><p class="why why-slip">' + (tag ? '<span class="why-tag">' + esc(tag) + "</span>" : "") + esc(text) + "</p></div>";
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
  /* Design pass 5 — the deck. `pools` is the show's dealing state and
     is persisted verbatim in the table save: { b1, b2, b3 } are the
     band pools for multiple-choice questions (shuffled id lists,
     unseen-first across shows), and catUse counts how often each
     category has been dealt this show. The pools are built EAGERLY
     when a show's deck is reset (startShow / ogBuildScript), so every
     draw afterwards is a pure function of this saved state plus the
     guess map — a host refresh resumes the identical deal, question
     for question. */
  var pools = {};
  function bandPoolIds(band) {
    var ids = BANK.filter(function (q) { return !q.kind && q.d === band; }).map(function (q) { return q.id; });
    var fresh = ids.filter(function (id) { return !seen[id]; });
    var rest = ids.filter(function (id) { return seen[id]; });
    return shuffle(fresh).concat(shuffle(rest));
  }
  function resetDeck() {
    pools = { b1: bandPoolIds(1), b2: bandPoolIds(2), b3: bandPoolIds(3), catUse: {} };
  }
  /* draw one multiple-choice question for a slot whose target band is
     `target`: the exact band while its pool lasts, else the nearest
     band (BAND_ORDER — lower wins a tie). Within a pool, category
     spread: take a card from a least-used category this show (the
     shuffled pool order breaks ties, so the seed still conducts).
     The draw itself consumes no rng — pools + catUse are the state. */
  function drawBand(target) {
    if (!pools.catUse) resetDeck(); // a save from before the ramp: build the deck now
    var order = BAND_ORDER[target] || BAND_ORDER[2];
    for (var oi = 0; oi < order.length; oi++) {
      var p = pools["b" + order[oi]];
      if (!p) { p = pools["b" + order[oi]] = bandPoolIds(order[oi]); }
      if (!p.length) continue;
      var best = 0, bestUse = Infinity;
      for (var i = 0; i < p.length; i++) {
        var u = pools.catUse[BANK[p[i]].cat] || 0;
        if (u < bestUse) { bestUse = u; best = i; if (u === 0) break; }
      }
      var id = p.splice(best, 1)[0];
      pools.catUse[BANK[id].cat] = (pools.catUse[BANK[id].cat] || 0) + 1;
      seen[id] = 1;
      return BANK[id];
    }
    /* every band pool empty — unreachable in a 10-draw show from an
       84-question bank; rebuild and deal on, as the old deck did */
    resetDeck();
    return drawBand(target);
  }
  /* the five guess slots: kinds PINNED to the slots in GUESS_SLOTS
     order — Round 1's two are closest-number, Round 2's two are
     surveys, Round 3's one is the swing (num or survey) — because
     Sterling's Round 1 intro promises the table exactly two
     closest-number questions, and his stated rules stay true every
     show. Ids drawn per kind at the slot's band, unseen preferred. */
  function buildGuessSchedule() {
    /* Design pass 5: each pinned slot also carries a target band from
       its round's profile (R1's nums 1 then 2, R2's surveys 2 then 3,
       the swing 3). A slot takes an unused question of its kind at the
       target band — unseen preferred — else the nearest band (lower
       wins a tie), else the other kind on the same ladder. */
    var profiles = { 1: R1_BANDS, 2: R2_BANDS, 3: R3_BANDS };
    var used = {};
    function slotTarget(slot) { var p = slot.split(":"); return profiles[+p[0]][+p[1]]; }
    function take(kind, target) {
      var order = BAND_ORDER[target];
      for (var oi = 0; oi < order.length; oi++) {
        var cand = BANK.filter(function (q) { return q.kind === kind && q.d === order[oi] && !used[q.id]; }).map(function (q) { return q.id; });
        if (!cand.length) continue;
        var fresh = cand.filter(function (id) { return !seen[id]; });
        var id = pick(fresh.length ? fresh : cand);
        used[id] = 1; seen[id] = 1;
        return id;
      }
      return null;
    }
    var kinds = ["num", "num", "survey", "survey", rng() < 0.5 ? "num" : "survey"];
    var map = {};
    GUESS_SLOTS.forEach(function (slot, i) {
      var id = take(kinds[i], slotTarget(slot));
      if (id == null) id = take(kinds[i] === "num" ? "survey" : "num", slotTarget(slot));
      if (id != null) map[slot] = id;
    });
    return map;
  }

  /* ---------- game state ---------- */
  var G = null;
  function newGame(names) {
    return {
      players: names.map(function (nm, i) {
        return { name: nm, color: PCOLORS[i], score: 0, cut: 1, bet: 1, streak: 0, avatar: tableAvatars[i] != null ? tableAvatars[i] : i };
      }),
      round: 1, qInRound: 0,
      showId: null,             // per-show key for the live Sterling lines
      decider: null,            // New programme pass 1: {eligible, usedIds, dealt, winner} once a tied finale triggers it
      facts: freshFacts(),      // New programme pass 2: the round-facts recorder the Intermission is told from
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
  var tableFx = null, ogFx = null, ogQdSeat = -1, ogStreakMoment = null;
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
    /* Design pass 3: the quick-draw tag lives in the same seat-name
       tag space as CLOSEST (the two never co-occur — guess kinds
       have no quick-draw, and only guess bankers wear CLOSEST). */
    if (fx.quickdraw) {
      var nm2 = s.querySelector(".seat-name");
      if (nm2) {
        var tg2 = document.createElement("span");
        tg2.className = "closest-tag qdtag";
        tg2.textContent = "QUICK DRAW +$50";
        nm2.appendChild(tg2);
      }
    }
    /* Hot Streaks (New programme pass 3): the streak tag rides the
       same seat-name tag space — a bank that earned the flat bonus
       wears it, and the banked figure in the delta already includes
       it. MCQ banks only, so it never collides with CLOSEST; it can
       share the line with QUICK DRAW when both fired on one bank. */
    if (fx.streakBonus > 0) {
      var nm3 = s.querySelector(".seat-name");
      if (nm3) {
        var tg3 = document.createElement("span");
        tg3.className = "closest-tag streaktag";
        tg3.textContent = "STREAK +$" + fx.streakBonus;
        nm3.appendChild(tg3);
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
      if (G.phase === "reveal" && G.cur && G.cur.marks) {
        /* the Decider's reveal: only the tied leaders play, so only
           they wear the verdict — the spectators keep their faces */
        state = (G.decider && G.decider.eligible.indexOf(i) < 0) ? "neutral" : (G.cur.marks[i] ? "cheer" : "slump");
      }
      var s = el('<div class="seat pod' + i + '" data-seat="' + i + '">' +
        '<div class="seat-ava">' + avatarSVG(snapAvatar(p, i), state, i) + "</div>" +
        '<div class="desk"><span class="seat-name">' + esc(p.name) + '</span>' +
        '<span class="seat-score">' + shown + '</span>' +
        '<span class="tag">' + tagsFor(i) + "</span>" + fortuneHTML() + "</div></div>");
      /* New programme pass 1: during the Decider, a seat that is not
         playing steps back — dimmed out of the light while the tied
         leaders settle it (the winner is crowned, the class lifts) */
      if (G.decider && G.decider.winner == null && G.decider.eligible.indexOf(i) < 0) s.classList.add("spectator");
      if (p.score === bestScore && bestScore > 0) s.classList.add("lead");
      if (G.cur && G.cur.marks && G.cur.marks[i]) s.classList.add("gotit");
      if (G.phase === "reveal" && tableFx) decorateSeat(s, tableFx.seats[i]);
      s.addEventListener("click", function () { onSeatTap(i); });
      bot.appendChild(s);
      /* Visual stage 4: a rebuilt seat paints its pile at the
         displayed value, so a mid-chase re-render (a vote tap, the
         reveal itself) never snaps the stacks — the tick loop
         keeps growing them from exactly here */
      paintFortune(s, fortuneDisp[i] != null ? fortuneDisp[i] : p.score,
        Math.max.apply(null, G.players.map(function (x, j) { return fortuneDisp[j] != null ? fortuneDisp[j] : x.score; })),
        p.score === bestScore && bestScore > 0);
    });
    updateLaurel("table");
  }
  /* Design pass 1 — the Long Shot: in the Big Finish a player's
     chip cap is 3 plus one per full $1,000 they trail the leader,
     never more than 5. It derives from the scores entering the
     question only; nothing about it is persisted. */
  function longShotCap(players, i) {
    if (!players || !players[i]) return 3;
    var lead = Math.max.apply(null, players.map(function (p) { return p.score; }));
    return Math.min(5, 3 + Math.floor(Math.max(0, lead - players[i].score) / 1000));
  }
  function tableBetCap(i) { return G ? longShotCap(G.players, i) : 3; }
  function betLabel(chips) { return chips + (chips === 1 ? " CHIP" : " CHIPS") + " · " + money(chips * 100); }
  /* Hot Streaks: the desk tag's streak segment — warm amber, deeper
     (and lit) at 5+. It is the LOWEST-priority segment on the line:
     in Round 3 the bet segment always precedes it, and the Long
     Shot line keeps its own grammar with the streak riding last. */
  function streakSegHTML(n) {
    if (!(n >= 3)) return "";
    return '<span class="streakseg' + (n >= 5 ? " hot" : "") + '">STREAK ×' + n + "</span>";
  }
  function tagsFor(i) {
    var p = G.players[i], t = [];
    var seg = streakSegHTML(p.streak || 0);
    if (G.round === 3 && ((G.phase === "bet" && tableBetCap(i) > 3) || p.bet > 3)) {
      return "LONG SHOT · BET " + p.bet + (p.bet === 1 ? " CHIP" : " CHIPS") + (seg ? " · " + seg : "");
    }
    t.push(p.cut > 0 ? "CUT TWO" : "CUT SPENT");
    if (G.round === 3) t.push("BET " + p.bet + (p.bet === 1 ? " CHIP" : " CHIPS"));
    if (seg) t.push(seg);
    return t.join(" · ");
  }
  function onSeatTap(i) {
    if (!G || !G.cur || G.phase !== "vote") return;
    /* the Decider's mark screen is for the tied leaders only — a
       spectator's seat is stepped back and takes no marks */
    if (G.decider && G.decider.eligible.indexOf(i) < 0) return;
    /* The tap order IS the table's lock order (Design pass 3): the
     * host's GOT IT taps are the game's record of who committed
     * first. Marking appends; unmarking withdraws the seat from the
     * order entirely, so a re-mark queues behind the seats that
     * stayed marked — the same standing-pick rule the server runs. */
    if (!Array.isArray(G.cur.lockOrder)) G.cur.lockOrder = [];
    if (G.cur.marks[i]) {
      delete G.cur.marks[i];
      G.cur.lockOrder = G.cur.lockOrder.filter(function (s) { return s !== i; });
    } else {
      G.cur.marks[i] = 1;
      G.cur.lockOrder.push(i);
    }
    renderSeats();
    saveTableShow();
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
    if (G && G.decider) {
      $("roundLabel").textContent = "★ THE DECIDER";
      $("qCounter").textContent = "WINNER TAKES THE CROWN";
      return;
    }
    $("roundLabel").textContent = labels[G.round] + (isHeadline(G.round, G.qInRound) ? " · ★ HEADLINE QUESTION" : "");
    var n = G.round === 1 ? G.qInRound + 1 : G.round === 2 ? R1_COUNT + G.qInRound + 1 : R1_COUNT + R2_COUNT + G.qInRound + 1;
    $("qCounter").textContent = "QUESTION " + Math.min(n, 15) + " OF 15";
  }
  function speedFrac(elapsed, total) { return Math.max(0, Math.min(1, 1 - elapsed / total)); }
  function earned(value, elapsed, total) { return round10(value * (0.5 + 0.5 * speedFrac(elapsed, total))); }

  /* ---------- screen wake lock (improvement 1) ----------
     A show must never be interrupted by the device deciding to
     sleep: the host screen going dark mid-question stops the whole
     party, and a pad in a player's hand is their controller. So
     while a show state exists — a table game (G), a host room (OG)
     or a joined pad (JP) — the screen stays awake; at the title
     and in the menus nothing holds a lock (a menu keeping a phone
     awake is a battery bug, not a feature). The desired state is
     DERIVED from the game's own state, at the lifecycle choke
     points only: startShow / ogJoinRoom / jpConnect sync on as
     their state is created; ogTeardown / jpTeardown and the table
     exits (btnLobby / btnQuit) sync off as it goes. The lock
     follows the game, never leads it. The API releases the
     sentinel itself when the page hides, so visibilitychange
     re-acquires while a show state still exists. Where the API is
     missing or a request refuses (older browsers, battery savers,
     insecure contexts) everything degrades silently: no UI, no
     error, no behaviour change. */
  var WakeLock = {
    want: false,
    sentinel: null,
    supported: function () {
      return typeof navigator !== "undefined" && !!navigator.wakeLock &&
        typeof navigator.wakeLock.request === "function";
    },
    sync: function () { this.set(!!G || !!OG || !!JP); },
    set: function (want) {
      this.want = !!want;
      if (this.want) this.acquire();
      else this.release();
    },
    acquire: function () {
      if (!this.want || this.sentinel || !this.supported()) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      var self = this, p = null;
      try { p = navigator.wakeLock.request("screen"); } catch (e) { return; }
      if (!p || typeof p.then !== "function") return;
      p.then(function (s) {
        if (!self.want) { /* the show ended while the request was in flight */
          if (s && typeof s.release === "function") { try { s.release(); } catch (e) {} }
          return;
        }
        self.sentinel = s || null;
        if (self.sentinel && typeof self.sentinel.addEventListener === "function") {
          try {
            self.sentinel.addEventListener("release", function () {
              if (self.sentinel === s) self.sentinel = null;
            });
          } catch (e) {}
        }
      }, function () { /* refused — silent by design */ });
    },
    release: function () {
      var s = this.sentinel;
      this.sentinel = null;
      if (s && typeof s.release === "function") { try { s.release(); } catch (e) {} }
    }
  };
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && WakeLock.want) WakeLock.acquire();
  });

  /* ---------- improvement 4: a table show survives a refresh ----------
     The whole show is reconstructible state: the players, the score
     sheet, the exact draw position (remaining pools + rng state + the
     seen list) and the question in flight. It is saved at every
     meaningful transition to gh_table_show {v:1}; on load, a valid
     unfinished save raises a brass chip on the title — RESUME rebuilds
     the show at the saved phase, DISCARD throws the save away. A show
     that finishes (or is ended) clears its save: a completed show
     never offers to resume. Sterling's exact last line is NOT part of
     the save — each phase re-speaks its own line on resume. */
  var TABLE_SAVE_KEY = "gh_table_show";
  function saveCurForSave(c) {
    if (!c) return null;
    var o = {
      kind: c.kind, cat: c.cat, diff: c.diff, value: c.value, clockTotal: c.clockTotal,
      opts: c.opts || null, marks: c.marks || {}, resolved: !!c.resolved, cutUsed: !!c.cutUsed,
      /* Design pass 3: the GOT IT tap order is the table's quick-draw
         record — it must survive a host refresh or the winner could
         change across a resume. */
      lockOrder: (c.lockOrder || []).slice(),
      betRound: !!c.betRound, bankValue: c.bankValue || 0,
      special: !!c.special, intro: c.intro || null,
      /* New programme pass 1: a decider question must repaint as a
         decider after a refresh (fx, stage, continue-routing) */
      decider: !!c.decider,
      /* Hot Streaks (New programme pass 3): the settled streak
         record — per-seat count + bonus paid, and the reveal's one
         named moment. A resumed reveal repaints from THESE, never
         by re-running the settlement, so the bonus can't re-pay. */
      streakFx: c.streakFx || null,
      streakMoment: c.streakMoment || null
    };
    /* bank questions rebuild from their id; the nightly special is a
       synthetic question and travels whole */
    if (c.q && c.q.id != null) o.qid = c.q.id; else o.q = c.q || null;
    return o;
  }
  function curFromSave(o) {
    if (!o) return null;
    var q = o.qid != null ? BANK[o.qid] : o.q;
    if (!q) return null;
    return {
      q: q, kind: o.kind, cat: o.cat, diff: o.diff, value: o.value,
      elapsed: 0, clockTotal: o.clockTotal,
      opts: o.opts || null, marks: o.marks || {}, resolved: !!o.resolved, cutUsed: !!o.cutUsed,
      /* older saves predate the quick-draw record: fall back to the
         numeric order of the seats already marked — deterministic */
      lockOrder: Array.isArray(o.lockOrder) ? o.lockOrder.slice()
        : Object.keys(o.marks || {}).map(Number).sort(function (a, b) { return a - b; }),
      betRound: !!o.betRound, bankValue: o.bankValue || 0, headline: false,
      special: !!o.special, intro: o.intro || null, decider: !!o.decider,
      /* saves written before Hot Streaks carry neither field; the
         reveal simply repaints without streak grammar */
      streakFx: o.streakFx || null, streakMoment: o.streakMoment || null
    };
  }
  function saveTableShow() {
    if (!G || G.phase === "over") { return; }
    try {
      localStorage.setItem(TABLE_SAVE_KEY, JSON.stringify({
        v: 1, savedAt: Date.now(),
        players: G.players.map(function (p) {
          /* Hot Streaks: the run count rides the save — a refresh
             mid-run resumes the streak, never restarts it */
          return { name: p.name, color: p.color, score: p.score, cut: p.cut, bet: p.bet, streak: p.streak || 0, avatar: p.avatar };
        }),
        round: G.round, qInRound: G.qInRound, showId: G.showId,
        bankedOnce: !!G.bankedOnce, bigLeadDone: !!G.bigLeadDone,
        /* the decider state rides the save: a refresh mid-decider
           resumes the same question, the same two names, and the
           same already-dealt decider questions (never re-dealt) */
        decider: G.decider ? {
          eligible: G.decider.eligible.slice(),
          usedIds: (G.decider.usedIds || []).slice(),
          dealt: G.decider.dealt || 0,
          winner: G.decider.winner != null ? G.decider.winner : null
        } : null,
        /* New programme pass 2: the facts ride the save — a refresh
           mid-break (or mid-anything) keeps the story the break
           will tell, exactly as recorded */
        facts: G.facts || null,
        phase: G.phase, guess: G.guess, lastStand: G.lastStand,
        cur: saveCurForSave(G.cur),
        pools: pools, rngState: rngBox.a,
        seen: Object.keys(seen).map(Number),
        nightly: (nightlyState && nightlyState.key === G.showId) ? nightlyState.data : null
      }));
    } catch (e) {}
  }
  function clearTableSave() { try { localStorage.removeItem(TABLE_SAVE_KEY); } catch (e) {} }
  var TABLE_PHASES = ["coldopen", "intro", "intermission", "spin", "bet", "question", "vote-count", "vote", "reveal"];
  function validTableSave(sv) {
    if (!sv || sv.v !== 1) return false;
    if (!Array.isArray(sv.players) || sv.players.length < 2 || sv.players.length > 4) return false;
    for (var i = 0; i < sv.players.length; i++) {
      var p = sv.players[i];
      if (!p || typeof p.name !== "string" || typeof p.score !== "number" ||
          typeof p.cut !== "number" || typeof p.bet !== "number") return false;
    }
    if (!(sv.round >= 1 && sv.round <= 3) || !(sv.qInRound >= 0 && sv.qInRound <= 5)) return false;
    if (TABLE_PHASES.indexOf(sv.phase) < 0) return false;
    if (!sv.guess || typeof sv.guess !== "object") return false;
    if (!sv.pools || typeof sv.pools !== "object") return false;
    if (typeof sv.rngState !== "number" || typeof sv.showId !== "string") return false;
    if (["spin", "bet", "question", "vote-count", "vote", "reveal"].indexOf(sv.phase) >= 0 && !curFromSave(sv.cur)) return false;
    return true;
  }
  function loadTableSave() {
    var raw = null, sv = null;
    try { raw = localStorage.getItem(TABLE_SAVE_KEY); } catch (e) {}
    if (raw == null) return null;
    try { sv = JSON.parse(raw); } catch (e) { sv = null; }
    if (!sv || !validTableSave(sv)) { clearTableSave(); return null; } /* corrupt or foreign: discard silently */
    return sv;
  }
  function paintTableResume() {
    var chip = $("resumeChip"); if (!chip) return;
    var sv = loadTableSave();
    chip.classList.toggle("hidden", !sv);
    var card = document.querySelector(".setup-card");
    if (card) card.classList.toggle("has-resume", !!sv);
    if (sv) {
      var base = sv.round === 1 ? 0 : sv.round === 2 ? R1_COUNT : R1_COUNT + R2_COUNT;
      var n = Math.min(base + sv.qInRound + 1, 15);
      $("resumeDetail").textContent = "ROUND " + sv.round + " OF 3 · QUESTION " + n + " OF 15";
    }
  }
  function resumeTableShow() {
    var sv = loadTableSave();
    if (!sv) { paintTableResume(); return; }
    pools = sv.pools || {};
    rngBox.a = sv.rngState | 0;
    seen = {}; (sv.seen || []).forEach(function (id) { seen[id] = 1; });
    nightlyState = { key: sv.showId, data: sv.nightly || null };
    G = {
      players: sv.players.map(function (p, i) {
        return {
          name: p.name, color: PCOLORS[i], score: p.score, cut: p.cut, bet: p.bet,
          /* a save written before Hot Streaks has no streak field */
          streak: (typeof p.streak === "number" && p.streak > 0) ? Math.floor(p.streak) : 0,
          avatar: (Number.isInteger(p.avatar) && p.avatar >= 0 && p.avatar < 8) ? p.avatar : i
        };
      }),
      round: sv.round, qInRound: sv.qInRound, showId: sv.showId,
      bankedOnce: !!sv.bankedOnce, bigLeadDone: !!sv.bigLeadDone,
      /* a save written before the Decider existed has no decider
         field at all; a malformed one is dropped, never trusted */
      decider: (sv.decider && Array.isArray(sv.decider.eligible) && sv.decider.eligible.length >= 2)
        ? {
          eligible: sv.decider.eligible.slice(),
          usedIds: Array.isArray(sv.decider.usedIds) ? sv.decider.usedIds.slice() : [],
          dealt: sv.decider.dealt | 0,
          winner: (typeof sv.decider.winner === "number") ? sv.decider.winner : null
        }
        : null,
      /* a save written before the Intermission existed has no
         facts field; the recorder simply starts empty */
      facts: factsFromSave(sv.facts),
      /* Rematch Night: the series context needs no save field of
         its own — at the table it is a pure function of the cast,
         so it is rebuilt from the saved names, and the opening
         line recomposed below from the stored series (this show
         has not advanced it yet, so the composition is identical) */
      seriesCtx: seriesCtxFor(sv.players.map(function (p) { return p.name; })),
      seriesLine: null,
      phase: sv.phase, cur: curFromSave(sv.cur), guess: sv.guess, lastStand: sv.lastStand
    };
    G.seriesLine = composeSeriesOpening(liveSeriesFor(G.seriesCtx), G.seriesCtx);
    if (G.cur) G.cur.headline = isHeadline(G.round, G.qInRound); // Design pass 2: position-derived, never saved
    tableFx = null;
    dispScore = G.players.map(function (p) { return p.score; });
    fortuneDisp = G.players.map(function (p) { return p.score; });
    writtenScore = [];
    lastShownValue = null;
    clearInterval(spinTimer); clearInterval(voteTimer); spinTimer = voteTimer = null;
    stopClock();
    showScreen("scr-game");
    $("scr-game").classList.remove("sealed");
    WakeLock.sync(); /* a resumed show re-acquires the lock like a fresh one */
    setLight(G.round === 1 ? "open" : G.round === 2 ? "hot" : "vault");
    seatsVisible(true);
    updateTop(); renderSeats();
    /* the phase function re-presents the beat; a question saved
       mid-answer restarts with a FRESH FULL clock (the fair rule),
       a reveal repaints as shown without re-banking */
    switch (G.phase) {
      case "coldopen": case "intro": roundIntro(); break;
      case "intermission": seatsVisible(false); paintIntermission(); break;
      case "spin": spinBeat(); break;
      case "bet": betBeat(); break;
      case "question": askCurrent(); break;
      case "vote-count": voteBeat(); break;
      case "vote": markScreen(); break;
      case "reveal": if (G.cur && G.cur.decider) buildDeciderFx(); else buildTableFx(); paintReveal(true); break;
      default: roundIntro();
    }
    saveTableShow();
  }

  /* ================= Design pass 4 — Sterling remembers =================
     The between-show layer. Every show this device HOSTS (table or
     online host screen — pads are guests and record nothing) writes
     one quiet record at the moment it completes: who played, who
     won, what they've banked across every show this screen has
     hosted, and who currently holds the crown. It lives in
     localStorage under gh_records_v1 and nowhere else; no gameplay
     number ever reads it, and a storage failure (full, blocked,
     private mode) degrades to amnesia, never to a broken finale —
     every touch is wrapped. Identity is the player NAME (trimmed,
     matched case-insensitively): two humans sharing a name share a
     record, which is household fuzz this design accepts on purpose.
     A show ended early records nothing at all — the write hangs off
     the finale transition, which an early END SHOW never reaches. */
  var RECORDS_KEY = "gh_records_v1";
  function recNameKey(name) { return String(name == null ? "" : name).trim().toLowerCase(); }
  function loadRecords() {
    var rec = null;
    try { rec = JSON.parse(localStorage.getItem(RECORDS_KEY) || "null"); } catch (e) { rec = null; }
    if (!rec || rec.v !== 1 || !rec.players || typeof rec.players !== "object") return { v: 1, players: {}, champion: null, lastShowId: null };
    if (!("champion" in rec)) rec.champion = null;
    if (!("lastShowId" in rec)) rec.lastShowId = null;
    return rec;
  }
  function saveRecords(rec) { try { localStorage.setItem(RECORDS_KEY, JSON.stringify(rec)); } catch (e) {} }
  function recToday() {
    var d = new Date(); function p2(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
  }
  /* Record one completed show, exactly once. finishers are
     [{name, avatar, score}] in seat order; winnerIdx is the winning
     finisher's index, or -1 for a drawn show (shows and purses still
     count; no win is recorded and the champion is NOT dethroned).
     The show's own id is the guard: a finale reached a second time
     — a refresh at the winner screen, a host rejoin — finds
     lastShowId already equal and writes nothing. */
  function recordShow(showId, finishers, winnerIdx) {
    try {
      if (!showId || !finishers || !finishers.length) return false;
      var rec = loadRecords();
      if (rec.lastShowId === showId) return false;
      finishers.forEach(function (f) {
        var key = recNameKey(f && f.name);
        if (!key) return;
        var r = rec.players[key];
        if (!r) { r = { name: "", avatar: 0, wins: 0, shows: 0, purse: 0 }; rec.players[key] = r; }
        r.name = String(f.name).trim();   /* the record wears the most recent sighting's name and face */
        if (Number.isInteger(f.avatar) && f.avatar >= 0 && f.avatar < 8) r.avatar = f.avatar;
        r.shows += 1;
        r.purse += Math.round(f.score || 0);
      });
      if (winnerIdx != null && winnerIdx >= 0 && finishers[winnerIdx]) {
        var wKey = recNameKey(finishers[winnerIdx].name), wr = rec.players[wKey];
        if (wr) {
          wr.wins += 1;
          var streak = (rec.champion && rec.champion.nameKey === wKey) ? (rec.champion.streak || 1) + 1 : 1;
          rec.champion = { nameKey: wKey, streak: streak, amount: Math.round(finishers[winnerIdx].score || 0), date: recToday() };
        }
      }
      rec.lastShowId = showId;
      saveRecords(rec);
      return true;
    } catch (e) { return false; }
  }
  /* The finale marquee's subline for a just-finished show, judged
     against the champion as they stood BEFORE this show recorded:
     a defence (with the new streak when it runs past one), a
     dethroning, or the first crowning this device has ever seen —
     which, the champion being null until somebody wins one, can
     only ever be printed for that one crowning. A drawn show and a
     failed read both earn the empty string. */
  function champSubline(prevChamp, winnerKey, newChamp) {
    if (!winnerKey) return "";
    if (prevChamp && prevChamp.nameKey === winnerKey)
      return "DEFENDS THE TITLE" + (newChamp && newChamp.streak > 1 ? " · ×" + newChamp.streak + " IN A ROW" : "");
    if (prevChamp) return "A NEW CHAMPION";
    return "FIRST CHAMPION";
  }
  /* ---------- the title plaque + the trophy shelf ---------- */
  function paintChampion() {
    var pl = $("champPlaque"); if (!pl) return;
    var rec = loadRecords(), c = rec.champion;
    if (!c) { pl.classList.add("hidden"); pl.textContent = ""; return; }
    var r = rec.players[c.nameKey];
    var nm = (r && r.name) || c.nameKey;
    var wins = r ? r.wins : 0, purse = r ? r.purse : 0;
    pl.textContent = "★ DEFENDING CHAMPION — " + nm +
      (c.streak > 1 ? " · ×" + c.streak + " IN A ROW" : "") +
      " · " + wins + (wins === 1 ? " WIN" : " WINS") +
      " · " + money(purse) + " BANKED";
    pl.classList.remove("hidden");
  }
  function renderRecordsSheet() {
    var list = $("recordsList"); if (!list) return;
    var rec = loadRecords();
    var rows = Object.keys(rec.players).map(function (k) { return { key: k, r: rec.players[k] }; })
      .sort(function (a, b) {
        return (b.r.wins - a.r.wins) || (b.r.purse - a.r.purse) || String(a.r.name).localeCompare(String(b.r.name));
      });
    if (!rows.length) {
      list.innerHTML = '<p class="records-empty">The shelf is bare — no show has finished on this screen yet. The first finale starts the story.</p>';
      return;
    }
    list.innerHTML = rows.map(function (row, idx) {
      var r = row.r, isChamp = !!(rec.champion && rec.champion.nameKey === row.key);
      return '<div class="record-row">' + avatarSVG(r.avatar, "neutral", idx % 4) +
        '<div class="record-who"><div class="record-name">' + esc(r.name) +
        (isChamp ? ' <span class="record-crown">★ REIGNING</span>' : "") + '</div>' +
        '<div class="record-sub">' + r.shows + (r.shows === 1 ? " SHOW" : " SHOWS") + "</div></div>" +
        '<div class="record-nums"><div class="record-wins">' + r.wins + (r.wins === 1 ? " WIN" : " WINS") + "</div>" +
        '<div class="record-purse">' + money(r.purse) + " LIFETIME</div></div></div>";
    }).join("");
  }
  var recordsClearArmed = false, recordsClearTimer = null;
  function paintRecordsClear() {
    var b = $("recordsClear"); if (!b) return;
    b.textContent = recordsClearArmed ? "ARE YOU SURE? TAP AGAIN TO CLEAR" : "CLEAR RECORDS";
    b.classList.toggle("armed", recordsClearArmed);
  }
  function disarmRecordsClear() {
    recordsClearArmed = false;
    if (recordsClearTimer) { clearTimeout(recordsClearTimer); recordsClearTimer = null; }
    paintRecordsClear();
  }
  (function wireRecords() {
    var pl = $("champPlaque"), ov = $("recordsOverlay");
    if (pl) pl.addEventListener("click", function () {
      Snd.ensure();
      renderRecordsSheet();
      disarmRecordsClear();
      if (ov) ov.classList.remove("hidden");
    });
    var cl = $("recordsClose");
    if (cl) cl.addEventListener("click", function () { if (ov) ov.classList.add("hidden"); });
    if (ov) ov.addEventListener("click", function (e) { if (e.target === ov) ov.classList.add("hidden"); });
    var cb = $("recordsClear");
    if (cb) cb.addEventListener("click", function () {
      if (!recordsClearArmed) {
        recordsClearArmed = true;
        paintRecordsClear();
        recordsClearTimer = setTimeout(disarmRecordsClear, 3000);
        return;
      }
      disarmRecordsClear();
      saveRecords({ v: 1, players: {}, champion: null, lastShowId: null });
      renderRecordsSheet();
      paintChampion();
    });
  })();
  /* the lobby acknowledgement: drawn once per room (the bag would
     otherwise re-draw on every join/leave re-render) and only while
     a seated player's name matches the champion's */
  var ogChampAckCache = { key: null, line: null };
  function ogChampAckLine() {
    var rec = loadRecords();
    if (!rec.champion || typeof OG === "undefined" || !OG) { ogChampAckCache = { key: null, line: null }; return null; }
    var hit = null;
    ogJoined().forEach(function (p) { if (!hit && recNameKey(p.name) === rec.champion.nameKey) hit = p; });
    if (!hit) return null;
    var key = rec.champion.nameKey + "|" + OG.code;
    if (ogChampAckCache.key !== key) ogChampAckCache = { key: key, line: authoredLine("champreturn", { name: hit.name }) };
    return ogChampAckCache.line;
  }

  /* ================= Programme pass 4 — Rematch Night =================
     The night gets a memory of its own: a SERIES, kept on the host
     device beside (and entirely separate from) Sterling Remembers.
     A series is one cast, one night: gh_series_v1 holds exactly one
     — {v, night, key, wins, shows, lastShowId} — and every show
     that COMPLETES with the same cast on the same host-local night
     advances it, however that show was started (the finale's
     REMATCH button, the old play-again path under its new name, or
     a fresh lobby start with the identical cast). A changed cast
     or a new day replaces it with a fresh one. Shows ended early
     count nothing: the advance hangs off the same finale transition
     as Records' write, is guarded by the show's own id exactly as
     Records is, and takes its winner from the finale's own verdict
     — so a crown taken through the Decider is a series point like
     any other (one definition of "the winner", reused). Records
     (gh_records_v1) is never read or written by this code; a
     rematch show records there exactly as every show does.
     The cast is captured when a show STARTS: at the table, the
     names at the seats; online, the players CONNECTED at that
     moment — so a rematch tapped after a player has wandered off
     deals a genuinely different cast, and the key, seeing to it,
     starts that table a fresh series. First to SERIES_TARGET wins
     takes the night. */
  var SERIES_KEY = "gh_series_v1";
  var SERIES_TARGET = 3;
  function loadSeries() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(SERIES_KEY) || "null"); } catch (e) { s = null; }
    if (!s || s.v !== 1 || typeof s.night !== "string" || typeof s.key !== "string" ||
        !s.wins || typeof s.wins !== "object" || typeof s.shows !== "number") return null;
    if (!("lastShowId" in s)) s.lastShowId = null;
    return s;
  }
  function saveSeries(s) { try { localStorage.setItem(SERIES_KEY, JSON.stringify(s)); } catch (e) {} }
  /* the cast key: who is at the table, order-free — the same cast
     in different seats is the same series */
  function castKeyFor(names) {
    return names.map(recNameKey).filter(Boolean).sort().join("|");
  }
  /* a show's series context: the key plus the roster in seat order
     (the lines are composed in roster order; the key is sorted) */
  function seriesCtxFor(names) {
    var roster = (names || []).map(function (n) {
      return { key: recNameKey(n), name: String(n == null ? "" : n).trim() };
    }).filter(function (r) { return !!r.key; });
    return { key: castKeyFor(names || []), roster: roster };
  }
  /* the stored series, when it belongs to this cast on this night */
  function liveSeriesFor(ctx) {
    if (!ctx || !ctx.key) return null;
    var s = loadSeries();
    return (s && s.night === recToday() && s.key === ctx.key) ? s : null;
  }
  /* The advance, as a pure function of the stored shape: given the
     current record (or null), a finished show's id, its cast and
     its winner, produce the record to store and whether THIS show
     took the night. A winnerless show (winnerKey null) and a show
     already counted (the id guard — a finale re-rendered after a
     refresh writes nothing twice) both leave the record untouched;
     nightWon still reports truly on the guarded path, because the
     winner who reached the target in the counted show still stands
     at exactly the target with this show as the last one counted. */
  function seriesAdvanceState(state, showId, ctx, winnerKey, night) {
    if (!showId || !ctx || !ctx.key || !winnerKey) return { state: state || null, counted: false, nightWon: false };
    var s = state;
    if (!s || s.night !== night || s.key !== ctx.key) {
      s = { v: 1, night: night, key: ctx.key, wins: {}, shows: 0, lastShowId: null };
    }
    var counted = false;
    if (s.lastShowId !== showId) {
      s.shows += 1;
      s.wins[winnerKey] = (s.wins[winnerKey] || 0) + 1;
      s.lastShowId = showId;
      counted = true;
    }
    return { state: s, counted: counted, nightWon: s.wins[winnerKey] === SERIES_TARGET && s.lastShowId === showId };
  }
  /* the storage wrapper the finales call, at the same moment (and
     under the same once-per-show discipline) as recordShow. With
     no winner to advance (a drawn finale) it writes nothing and
     simply reports this cast's standing, so the finale can still
     tell the night's score under its honours */
  function advanceSeries(showId, ctx, winnerKey) {
    try {
      if (!winnerKey) {
        var lv = liveSeriesFor(ctx);
        return lv ? { shows: lv.shows, wins: lv.wins, nightWon: false, counted: false } : null;
      }
      var r = seriesAdvanceState(loadSeries(), showId, ctx, winnerKey, recToday());
      if (r.counted) saveSeries(r.state);
      return r.state ? { shows: r.state.shows, wins: r.state.wins, nightWon: r.nightWon, counted: r.counted } : null;
    } catch (e) { return null; }
  }
  /* Sterling frames the night at a show's opening, composed from
     the stored series and this show's cast. Null when the cast has
     no live series (a first show together, a new cast, a new day)
     — the standard opening owns those. Otherwise ONE line: the
     score, then the night's situation in order of gravity — the
     first rematch teaches the house rule (first to three takes the
     night); a night already taken says so; a dead-level top with
     at least two shows played makes this show the decider of the
     night; a lone leader one win from the target plays for the
     night; and a cast member still waiting for a first win, on a
     night with no decider pending, gets the needle. */
  function composeSeriesOpening(state, ctx) {
    if (!state || !ctx || !ctx.roster.length || state.shows < 1) return null;
    var wins = state.wins || {};
    var scored = ctx.roster.map(function (r, i) {
      return { name: r.name, key: r.key, w: wins[r.key] || 0, seat: i };
    });
    var top = 0;
    scored.forEach(function (r) { if (r.w > top) top = r.w; });
    var leaders = scored.filter(function (r) { return r.w === top; });
    var byScore = scored.slice().sort(function (a, b) { return (b.w - a.w) || (a.seat - b.seat); });
    var line = "The score tonight: " + byScore.map(function (r) { return r.name + " " + r.w; }).join(", ") + ".";
    if (state.shows === 1) line += " First to three takes the night.";
    if (top >= SERIES_TARGET) {
      line += " " + leaders[0].name + " has the night at " + top + " — everything from here is pride, and the showing off is mandatory.";
      return line;
    }
    if (leaders.length > 1 && top >= 1 && state.shows >= 2) {
      line += " Dead level at the top — this show is the decider of the night.";
      return line;
    }
    if (leaders.length === 1 && top === SERIES_TARGET - 1) {
      line += " " + leaders[0].name + " plays for the night.";
      return line;
    }
    if (state.shows >= 2) {
      var winless = scored.filter(function (r) { return r.w === 0; });
      if (winless.length) line += " " + winless[0].name + " — the universe owes you one.";
    }
    return line;
  }
  /* ...and at the finale: nothing until the series has two
     completed shows; then the night's score in roster order (any
     winner from outside the roster — a reclaimed seat — appended
     with their count). On the one finale where a winner REACHES
     the target, the line is the taking of the night itself. */
  function composeSeriesFinale(state, ctx, nightWon, winnerName) {
    if (!state || !ctx) return null;
    if (nightWon && winnerName) return "★ " + String(winnerName).toUpperCase() + " TAKES THE NIGHT";
    if (state.shows < 2) return null;
    var wins = state.wins || {};
    var parts = ctx.roster.map(function (r) {
      return String(r.name).toUpperCase() + " " + (wins[r.key] || 0);
    });
    var inRoster = {};
    ctx.roster.forEach(function (r) { inRoster[r.key] = true; });
    Object.keys(wins).forEach(function (k) {
      if (!inRoster[k] && wins[k] > 0) parts.push(k.toUpperCase() + " " + wins[k]);
    });
    return "ON THE NIGHT — " + parts.join(" · ");
  }

  /* ---------- show flow ---------- */
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(function (s) { s.classList.remove("active"); });
    $(id).classList.add("active");
    if (id === "scr-title") { var g = $("scr-game"); if (g) g.classList.remove("sealed"); if (g) g.removeAttribute("data-phase"); paintTableResume(); paintChampion(); }
  }
  function startShow(names) {
    G = newGame(names);
    G.showId = "table-" + Date.now().toString(36) + "-" + ri(1000000);
    /* Rematch Night: the show takes its place in the night's
       series — the cast is captured now (its finale advance will
       be keyed by it, not by whoever happens to be around then),
       and if this cast already has a score tonight, Sterling's
       framing line is composed now and spoken at the Round 1
       intro, where the room can actually read it */
    G.seriesCtx = seriesCtxFor(names);
    G.seriesLine = composeSeriesOpening(liveSeriesFor(G.seriesCtx), G.seriesCtx);
    resetDeck();
    resetLineBags();
    G.guess = buildGuessSchedule();
    showScreen("scr-game");
    $("scr-game").classList.remove("sealed");
    WakeLock.sync(); /* a show is running: keep this screen awake */
    setLight("open");
    stopLeaves();
    dispScore = G.players.map(function () { return 0; });
    fortuneDisp = G.players.map(function () { return 0; });
    writtenScore = [];
    prefetchShowLines(names);
    sayLive("greeting", { names: names.slice() }, authoredLine("open"),
      { window: 2500, guard: function () { return !!G && G.phase === "coldopen"; } });
    fetchNightlyForShow(G.showId);
    renderSeats(); updateTop();
    Snd.ensure(); Snd.play("theme");
    G.phase = "coldopen"; stagePhase("coldopen");
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
    saveTableShow(); /* a fresh show overwrites any older save */
  }
  /* ================= New programme pass 2 — the Intermission =================
     Between rounds the show now rests, the way television does.
     A small recorder keeps the facts the break is told in — each
     round's biggest single bank (seat, amount, category) and the
     running quick-draw tally — written once per reveal from the
     numbers that reveal actually paid (at the table: revealAnswer's
     own gains; online: the reveal payload's banked figures, guarded
     by qid so a resynced reveal is never counted twice). Everything
     else on the card — the leader and the gap, the Cut Two status,
     the prospective Long Shot cap — is composed live from the
     standings at the moment of the break, so there is nothing else
     to keep in sync. The facts ride both show saves, and Sterling's
     recap line is a deterministic composition from them (authored
     fragments, never a fetch — the break must not wait on a
     worker), so a refresh mid-break returns to the identical card,
     word for word. */
  function freshFacts() { return { rounds: {}, qd: [0, 0, 0, 0], seen: {} }; }
  function factsFromSave(o) {
    var f = freshFacts();
    if (!o || typeof o !== "object") return f;
    if (o.rounds && typeof o.rounds === "object") {
      [1, 2, 3].forEach(function (r) {
        var rb = o.rounds[r], b = rb && rb.biggest;
        if (b && Number.isInteger(b.seat) && typeof b.amt === "number" && typeof b.cat === "string")
          f.rounds[r] = { biggest: { seat: b.seat, amt: b.amt, cat: b.cat } };
      });
    }
    if (Array.isArray(o.qd)) o.qd.forEach(function (n, i) { if (i < 4 && typeof n === "number" && n > 0) f.qd[i] = Math.floor(n); });
    if (o.seen && typeof o.seen === "object") Object.keys(o.seen).forEach(function (k) { f.seen[k] = 1; });
    return f;
  }
  function noteFacts(facts, round, gains, qdSeat, cat) {
    if (!facts) return;
    var rf = facts.rounds[round] || (facts.rounds[round] = { biggest: null });
    Object.keys(gains || {}).forEach(function (k) {
      var amt = gains[k];
      if (amt > 0 && (!rf.biggest || amt > rf.biggest.amt)) rf.biggest = { seat: Number(k), amt: amt, cat: cat };
    });
    if (qdSeat >= 0 && facts.qd[qdSeat] != null) facts.qd[qdSeat]++;
  }
  function joinNames(names) {
    if (names.length <= 1) return names.join("");
    if (names.length === 2) return names[0] + " and " + names[1];
    return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  }
  /* Compose the break from a normalised table — seats:
     [{seat, name, score, cut}] for everyone in the show. Pure: the
     same seats + facts always compose the same card. */
  function breakView(seats, facts, doneRound) {
    var sorted = seats.slice().sort(function (a, b) { return b.score - a.score || a.seat - b.seat; });
    var top = sorted[0], second = sorted.length > 1 ? sorted[1] : null;
    var tiedTop = sorted.filter(function (s) { return s.score === top.score; });
    var leaderLine, leaderFrag;
    if (tiedTop.length > 1) {
      var tn = joinNames(tiedTop.map(function (s) { return s.name; }));
      leaderLine = "Dead level at the top — " + tn + " matched on " + money(top.score) + ".";
      leaderFrag = "it is dead level at the top — " + tn + " matched on " + money(top.score);
    } else if (second) {
      leaderLine = top.name + " leads — " + money(top.score - second.score) + " clear of " + second.name + ".";
      leaderFrag = top.name + " leads " + second.name + " by " + money(top.score - second.score);
    } else {
      leaderLine = top.name + " leads on " + money(top.score) + ".";
      leaderFrag = top.name + " leads on " + money(top.score);
    }
    var rb = facts && facts.rounds ? facts.rounds[doneRound] : null;
    var big = rb && rb.biggest ? rb.biggest : null;
    var bigSeat = big ? (seats.filter(function (s) { return s.seat === big.seat; })[0] || null) : null;
    var bankLine = (big && bigSeat) ? bigSeat.name + " — " + money(big.amt) + " on " + big.cat + ", the biggest bank of the round." : null;
    var qdLine = null, qdFrag = "";
    if (facts && facts.qd) {
      var qmax = Math.max.apply(null, facts.qd);
      if (qmax > 0) {
        var qNames = seats.filter(function (s) { return facts.qd[s.seat] === qmax; }).map(function (s) { return s.name; });
        if (qNames.length === 1) {
          qdLine = qNames[0] + " owns the quick-draw — " + qmax + (qmax === 1 ? " first-and-right fifty" : " first-and-right fifties") + " so far.";
          qdFrag = qNames[0] + " is first-and-rightest, with " + qmax + (qmax === 1 ? " quick-draw fifty" : " quick-draw fifties");
        } else if (qNames.length > 1) {
          qdLine = joinNames(qNames) + " share the quick-draw — " + qmax + " apiece.";
          qdFrag = joinNames(qNames) + " share the quick-draw honours";
        }
      }
    }
    var holders = seats.filter(function (s) { return s.cut; }), spent = seats.filter(function (s) { return !s.cut; });
    var cutLine;
    if (!spent.length) cutLine = "Nobody has spent one — every blade is still in its pocket.";
    else if (!holders.length) cutLine = "All spent — the scissors are put away for the night.";
    else cutLine = joinNames(holders.map(function (s) { return s.name; })) + (holders.length === 1 ? " still holds one" : " still hold theirs") +
      " · " + joinNames(spent.map(function (s) { return s.name; })) + (spent.length === 1 ? " has spent theirs." : " have spent theirs.");
    var trailer = sorted[sorted.length - 1];
    var tGap = top.score - trailer.score;
    var cap = Math.min(5, 3 + Math.floor(Math.max(0, tGap) / 1000));
    var tease;
    if (doneRound === 1) {
      tease = "Double Money is next — every value doubles, and the round closes with the ★ Headline Question: twice the money, half the clock.";
    } else {
      tease = "The Big Finish is next — three questions, chips committed in the open, and a miss costs nothing." +
        (tGap === 0 ? " Dead level from first to last — nobody trails, so the Long Shot sleeps: three chips is everyone's cap."
          : cap > 3 ? " " + trailer.name + " trails by " + money(tGap) + " — the Long Shot lets a trailer ride up to " + cap + " chips."
            : " " + trailer.name + " trails by " + money(tGap) + " — not far enough to wake the Long Shot: three chips is the cap.");
    }
    var openers = ["Intermission, table. ", "We pause for breath. ", "The story so far. "];
    var recap = openers[(doneRound + (top ? top.seat : 0)) % openers.length] + leaderFrag + ".";
    if (big && bigSeat) recap += " The round's biggest bank was " + bigSeat.name + "'s — " + money(big.amt) + " on " + big.cat + ".";
    else recap += " Nobody banked a thing that round — a quiet table, saving its noise.";
    if (qdFrag) recap += " And " + qdFrag + ".";
    recap += doneRound === 1 ? " Refill something — Double Money does not wait." : " Refill something — the Big Finish does not wait.";
    return {
      leaderLine: leaderLine, bankLine: bankLine, qdLine: qdLine, cutLine: cutLine,
      tease: tease, recap: recap, cap: cap, nextRound: doneRound + 1
    };
  }
  function breakCardHTML(view, btnId) {
    function row(k, v) { return v ? '<div class="fact-row"><span class="fact-k">' + k + '</span><span class="fact-v">' + esc(v) + "</span></div>" : ""; }
    return '<div class="bumper break-card"><div class="round-kicker">THE GILDED HOUR · THE INTERMISSION</div>' +
      '<div class="round-title">THE STORY SO FAR</div>' +
      '<div class="fact-list">' +
      row("THE LEADER", view.leaderLine) + row("BIGGEST BANK", view.bankLine) +
      row("QUICK-DRAW", view.qdLine) + row("CUT TWO", view.cutLine) +
      "</div>" +
      '<p class="round-text break-tease">' + esc(view.tease) + "</p>" +
      '<button class="btn-gold" id="' + btnId + '">' + (view.nextRound === 2 ? "BEGIN ROUND TWO" : "BEGIN THE BIG FINISH") + "</button></div>";
  }
  function tableBreakSeats() {
    return G.players.map(function (p, i) { return { seat: i, name: p.name, score: p.score, cut: p.cut > 0 }; });
  }
  /* the break at the table: G.round has already advanced, so the
     round just played is G.round - 1 — at entry and on a resume
     alike, which is what makes the repaint identical */
  function paintIntermission() {
    stagePhase("intermission");
    setLight(G.round === 2 ? "open" : "hot"); /* the finished round's light — the break rests in it */
    var view = breakView(tableBreakSeats(), G.facts, G.round - 1);
    stage(breakCardHTML(view, "btnBreakGo"));
    $("hostLine").textContent = view.recap;
    $("btnBreakGo").addEventListener("click", function () { roundIntro(); });
  }
  function beginIntermission() {
    G.phase = "intermission";
    seatsVisible(false);
    updateTop(); renderSeats();
    paintIntermission();
    saveTableShow();
  }

  function roundIntro() {
    G.phase = "intro"; stagePhase("intro"); setLight(G.round === 1 ? "open" : G.round === 2 ? "hot" : "vault");
    seatsVisible(false);
    updateTop(); renderSeats();
    var titles = { 1: "THE WARM-UP", 2: "DOUBLE MONEY", 3: "THE BIG FINISH" };
    var texts = {
      1: "Six questions, and everybody answers every one. Sterling spins the category — the wheel and he have an understanding. Easy pays $100, medium $200, hard $300, and the value drains while the room thinks, so commit early. When the clock stops: fingers up, show 1, 2, 3 or 4. Everyone holding the right fingers banks the money. And on every question with fingers, the first right answer in also pockets a $50 quick-draw — be quick AND right. Three correct in a row starts a streak — every bank after that pays a bonus $25 while it lives. Twice this round, a closest-number question: no options, just shout a number — the nearest shout takes it.",
      2: "Same game, double money — $200, $400, $600. Your one lifeline is live: each of you holds a single Cut Two for the whole show. Call it before the fingers go up and two wrong answers vanish for everybody. Spend it like it's the last one. It is. And the round closes with the Headline Question — double money again, half the time on the clock.",
      3: "Three questions. Before each one, bet on yourself out loud — a chip is $100. Chasing the leader? The further behind you are, the more chips you may ride — up to five. Get it right and the bet pays in full: no drain, no deductions. Get it wrong and you lose nothing but face. Nobody leaves this show poorer than they arrived. That is the whole trick of it."
    };
    stage('<div class="bumper"><div class="round-kicker">ROUND ' + G.round + "</div>" +
      '<div class="round-title">' + titles[G.round] + "</div>" +
      '<p class="round-text">' + texts[G.round] + "</p>" +
      (G.round > 1 ? standingsHTML() : "") +
      '<button class="btn-gold" id="btnRoundGo">' + (G.round === 1 ? "START THE WARM-UP" : G.round === 2 ? "DOUBLE IT" : "TO THE BIG FINISH") + "</button></div>");
    /* Rematch Night: on a series show, Sterling's framing of the
       night owns the Round 1 intro — it waits on this screen for
       the host's tap, where the room can actually read the score */
    if (G.round === 1 && G.seriesLine) hostSayText(G.seriesLine);
    else hostSay("r" + G.round);
    $("btnRoundGo").addEventListener("click", function () { nextQuestion(); });
    saveTableShow();
  }
  function nextQuestion() {
    if (G.round === 1 && G.qInRound >= R1_COUNT) { G.round = 2; G.qInRound = 0; beginIntermission(); return; }
    if (G.round === 2 && G.qInRound >= R2_COUNT) { G.round = 3; G.qInRound = 0; beginIntermission(); return; }
    if (G.round === 3 && G.qInRound >= R3_COUNT) { finishShow(); return; }
    var gid = G.guess ? G.guess[G.round + ":" + G.qInRound] : null;
    if (gid != null) G.cur = makeCur(BANK[gid], BANK[gid].kind);
    else if (G.round === 1 && G.qInRound === 2 && nightlyState.data && nightlyState.key === G.showId) G.cur = makeCurServed(nightlyState.data);
    else G.cur = makeCur(drawNormal(), "mcq");
    if (G.round === 3) betBeat(); else spinBeat();
  }
  function drawNormal() {
    var pat = G.round === 1 ? R1_BANDS : G.round === 2 ? R2_BANDS : R3_BANDS;
    return drawBand(pat[G.qInRound] || 2);
  }
  function makeCur(q, kind) {
    var diff = q.diff || "medium";
    var betRound = G.round === 3;
    /* Design pass 2: the Headline folds into the two numbers every
       downstream path already reads — value carries the extra x2 (so
       the display shows the doubled figure natively and callIt banks
       drained x2 through the one earned() path), and clockTotal
       halves (so the drain reaches its 50% floor in half the window;
       the floor itself does not move). */
    var headline = isHeadline(G.round, G.qInRound);
    var cur = {
      q: q, kind: kind, cat: q.cat, diff: diff,
      value: betRound ? 0 : BASE_VALUES[diff] * (G.round === 2 ? 2 : 1) * (headline ? 2 : 1),
      elapsed: 0, clockTotal: (kind === "num" ? NUM_TIME : QTIME) / (headline ? 2 : 1),
      opts: null, marks: {}, resolved: false, cutUsed: false, lockOrder: [],
      betRound: betRound, bankValue: 0, headline: headline
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
    G.phase = "spin"; stagePhase("spin");
    seatsVisible(true);
    updateTop(); renderSeats();
    var chips = CATS.map(function (c) {
      var cs = catStyle(c);
      return '<span class="cat-chip" data-cat="' + esc(c) + '" style="--chip:' + cs.mid + ";--chipd:" + cs.sh + ";color:" + (CATTX[c] || "#FFF6E8") + '">' + catEmblem(c) + "<span>" + esc(c) + "</span></span>";
    }).join("");
    stage('<div class="q-cat">STERLING SPINS THE CATEGORIES</div>' +
      (G.cur.headline ? '<div class="hl-slot"><span class="headline-banner inflow">★ THE HEADLINE QUESTION ★</span></div>' : "") +
      spinFrameHTML(chips) +
      '<p class="round-text">Where it stops, nobody knows. Sterling knows. Sterling always knows.</p>');
    if (G.cur.special && G.cur.intro) $("hostLine").textContent = G.cur.intro;
    else if (G.cur.headline) { G.cur.headlineSaid = true; hostSay("headline", { cat: G.cur.cat }); }
    else hostSay("spin", { cat: G.cur.cat });
    Snd.play("spin");
    stClass("st-glance", 1600);
    clearInterval(spinTimer);
    runSpinChips(G.cur.cat,
      function () { return !!G && G.phase === "spin"; },
      function (id) { spinTimer = id; },
      function () { askCurrent(); });
    saveTableShow();
  }

  /* ---------- the Big Finish bet beat ---------- */
  function betBeat() {
    G.phase = "bet"; stagePhase("bet");
    var caps = G.players.map(function (_, i) { return tableBetCap(i); });
    G.players.forEach(function (p, i) { p.bet = Math.max(1, Math.min(caps[i], p.bet || 1)); });
    seatsVisible(true);
    updateTop(); renderSeats();
    var rows = G.players.map(function (p, i) {
      return '<div class="name-row bet-row" style="--pc:var(--p' + i + ')"><span class="name-dot" style="background:' + p.color + '"></span>' +
        '<span style="flex:1;text-align:left">' + esc(p.name) + "</span>" +
        (caps[i] > 3 ? '<span class="longshot-marker">LONG SHOT</span>' : "") +
        '<button class="chip" data-bet="' + i + '|-1">− 1</button>' +
        '<span class="bet-amt" id="betAmt' + i + '">' + betLabel(p.bet) + "</span>" +
        '<button class="chip" data-bet="' + i + '|1">+ 1</button></div>';
    }).join("");
    stage('<div class="round-kicker">THE BIG FINISH · QUESTION ' + (G.qInRound + 1) + " OF 3</div>" +
      '<p class="round-text">Bet on yourself, out loud — a chip is $100; right pays, wrong costs only pride. Chasing the leader? The further behind you are, the more chips you may ride — up to five.</p>' +
      '<div class="bet-rows">' + rows + "</div>" +
      '<button class="btn-gold" id="btnBetsDone">BETS ARE IN — SPIN THE CATEGORY</button>');
    hostSay("bet");
    var longShotCalled = {};
    document.querySelectorAll("[data-bet]").forEach(function (b) {
      b.addEventListener("click", function () {
        var parts = b.getAttribute("data-bet").split("|");
        var pi = parseInt(parts[0], 10), p = G.players[pi];
        p.bet = Math.max(1, Math.min(caps[pi], p.bet + parseInt(parts[1], 10)));
        var amt = $("betAmt" + pi);
        if (amt) amt.textContent = betLabel(p.bet);
        if (p.bet >= 4 && longShotCalled[pi] !== p.bet) {
          longShotCalled[pi] = p.bet;
          $("hostLine").textContent = authoredLine("longshot", { name: p.name, chips: p.bet, amount: money(p.bet * 100) });
        }
        renderSeats();
        saveTableShow();
      });
    });
    $("btnBetsDone").addEventListener("click", spinBeat);
    saveTableShow();
  }

  /* ---------- asking ---------- */
  function questionHTML() {
    var c = G.cur;
    var btns = c.opts.map(function (o, i) {
      return '<button class="ans-btn' + (o.gone ? " cut" : "") + '" style="--d:' + (i * 0.09).toFixed(2) + 's" disabled>' +
        '<span class="letter">' + (i + 1) + '</span><span>' + esc(o.t) + "</span></button>";
    }).join("");
    var head = c.kind === "survey" ? "MOST PEOPLE SAY…" : c.diff.toUpperCase();
    var pill = c.special ? "TONIGHT'S GILDED QUESTION" : esc(c.cat.toUpperCase()) + (c.headline ? " · HEADLINE" : "");
    return '<div class="q-headrow"><span class="cat-pill' + (c.special ? " gilded" : "") + (c.headline ? " headline" : "") + '">' + catEmblem(c.cat) + pill + '</span><span class="q-kind">' + head + "</span></div>" +
      '<div class="q-cardwrap">' + (c.headline ? '<div class="headline-banner">★ THE HEADLINE QUESTION ★</div>' : "") +
      '<div class="q-text' + (c.headline ? " headline-card" : "") + '">' + esc(c.q.q) + "</div></div>" +
      '<div class="q-meta">' +
      (c.betRound
        ? '<div class="q-for">Bets are in — this one pays the bet, and only the bet.</div>'
        : '<div class="q-value"><small>QUESTION VALUE</small><span id="qValue">' + money(c.value) + "</span></div>") +
      timerHTML() + "</div>" +
      '<div class="answers pop-in">' + btns + "</div>" + toolsHTML();
  }
  function numHTML() {
    var c = G.cur;
    /* the Decider wears its banner in the Headline's grammar (an
       overlay on the card — no layout box moves) and trades the
       money lines for the stakes: no money on it, the crown only */
    var vsLine = "";
    if (c.decider && G.decider) {
      var vsNames = G.decider.eligible.map(function (i) { return esc(G.players[i].name); });
      vsLine = vsNames.join(" vs ") + " — closest number takes the crown. Everybody else: witness.";
    }
    return '<div class="q-headrow"><span class="cat-pill' + (c.headline ? " headline" : "") + '">' + catEmblem(c.cat) + esc(c.cat.toUpperCase()) + (c.headline ? " · HEADLINE" : "") + '</span><span class="q-kind">CLOSEST NUMBER</span></div>' +
      '<div class="q-cardwrap">' + (c.decider ? '<div class="headline-banner decider-banner">★ THE DECIDER ★</div>' : (c.headline ? '<div class="headline-banner">★ THE HEADLINE QUESTION ★</div>' : "")) +
      '<div class="q-text' + (c.headline ? " headline-card" : "") + '">' + esc(c.q.q) + "</div></div>" +
      '<div class="q-meta">' +
      (c.decider
        ? '<div class="q-for">No money on this one — the crown only.</div>'
        : c.betRound
        ? '<div class="q-for">Bets are on — the closest shout takes their bet money.</div>'
        : '<div class="q-value"><small>QUESTION VALUE</small><span id="qValue">' + money(c.value) + "</span></div>") +
      timerHTML() + "</div>" +
      '<div class="q-for">' + (c.decider ? vsLine : "No options. No hiding. Think of a number — shout it when Sterling calls it.") + "</div>" +
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
    G.phase = "question"; stagePhase("question");
    applyCat(G.cur.cat); setCatBackdrop(G.cur.cat);
    seatsVisible(true);
    updateTop(); renderSeats();
    if (G.cur.kind === "num") {
      stage(numHTML());
      if (G.cur.decider && G.decider) {
        /* the Decider opens with its own authored line — the first
           deal names the two leaders; a re-deal after a dead-level
           call opens from the again pool */
        var names2 = G.decider.eligible.map(function (i) { return G.players[i].name; });
        hostSay(G.decider.dealt > 1 ? "decideragain" : "decider",
          { a: names2[0] || "", b: names2.slice(1).join(" and ") || "" });
      }
      else if (!G.cur.headline) hostSay("numQ", { cat: G.cur.cat });
    } else {
      stage(questionHTML());
      if (!G.cur.headline) hostSay("read", { cat: G.cur.cat });
    }
    if (G.cur.headline && !G.cur.headlineSaid) { G.cur.headlineSaid = true; hostSay("headline", { cat: G.cur.cat }); }
    Snd.playSignature(G.cur.cat);
    stSweep();
    wireQuestion();
    startClock(G.cur.clockTotal, function () { callIt(); });
    saveTableShow();
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
    shuffle(wrong).slice(0, 2).forEach(function (x) { x.o.gone = true; x.o.cut = true; });
    /* Design pass 6 — the moment. The rules are untouched (one cut
       per question, two wrong answers, the clock never stops); what
       changes is that the spend is STAGED: Sterling names it from
       the local cutmoment pool (drawn through hostSay so it lands
       with the slash, not on a fetch's schedule), the snip sounds,
       the two slabs shear under the fresh-cut animation, a banner
       names the play over the stage, the spender's tag flashes as
       it flips to CUT SPENT, and Sterling turns toward the seat.
       A repaint or resume renders the same state settled — the
       cut class without cutfresh, and no banner, line or sound. */
    hostSay("cutmoment", { name: p.name });
    Snd.play("snip");
    stage(questionHTML()); wireQuestion(); drawClock(); renderSeats();
    document.querySelectorAll(".answers .ans-btn.cut").forEach(function (b) { b.classList.add("cutfresh"); });
    cutBanner(p.name);
    seatCutFlash(i);
    stPoint(i);
    saveTableShow();
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
    G.cur.lockOrder = [];
    renderSeats();
    stage('<div class="q-cat">' + (G.cur.decider ? "THE DECIDER" : "EVERYBODY READY?") + '</div>' +
      '<div class="round-title" id="voteCount">FINGERS UP…</div>' +
      '<p class="round-text">' + (G.cur.decider && G.decider
        ? G.decider.eligible.map(function (i) { return esc(G.players[i].name); }).join(" and ") + " — numbers ready, shout yours on SHOW ME. Everybody else: witness."
        : G.cur.kind === "num"
        ? "Numbers ready — shout yours on SHOW ME."
        : "Hold up 1, 2, 3 or 4 fingers — your answer, held high, for the whole room to see.") + "</p>");
    hostSay("vote");
    Snd.play("vote");
    saveTableShow();
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
      '<p class="round-text">' + (G.cur.decider && G.decider
        ? "Only the tied leaders play this one. Who called the closest number? Tap their seat — a dead heat between them, tap both, and the Decider goes again."
        : G.cur.kind === "num"
        ? "Who called the closest number? Tap their seat — tap two seats if it's a dead heat."
        : "Tap the seat of everyone holding up the right fingers. Wrong fingers, no tap — and nobody loses a thing either way.") + "</p>" +
      '<button class="btn-gold" id="btnReveal">REVEAL THE ANSWER</button>');
    hostSay("mark");
    $("btnReveal").addEventListener("click", revealAnswer);
    saveTableShow();
  }

  /* ---------- the reveal (scores commit first, effects after) ---------- */
  /* Design pass 3: the Quick-Draw winner at the table. Multiple-
     choice only (guess kinds are excluded — closeness, not speed).
     The host's marks are the correctness record and cur.lockOrder is
     the commit order, so the winner is the first marked seat in lock
     order — recomputed identically by buildTableFx on a resumed
     reveal, which is why this is a pure function of marks+lockOrder. */
  function quickDrawWinner(c) {
    if (!c || c.kind !== "mcq") return -1;
    var order = Array.isArray(c.lockOrder) ? c.lockOrder : [];
    for (var k = 0; k < order.length; k++) if (c.marks[order[k]]) return order[k];
    /* a record with marks but no order (pre-pass saves): fall back to
       the earliest marked seat, deterministically */
    var marked = Object.keys(c.marks || {}).map(Number).sort(function (a, b) { return a - b; });
    return marked.length ? marked[0] : -1;
  }
  var QUICK_DRAW_BONUS = 50;
  /* ---------- Hot Streaks (New programme pass 3) ----------
     A streak is consecutive MULTIPLE-CHOICE questions banked.
     Guess kinds (num/survey) are NEUTRAL — they neither build nor
     break a run — and the Decider never reaches this code (its
     branch in revealAnswer returns first). From the bank that
     REACHES 3 onward, each bank pays a flat +$25: never scaled by
     the round multiplier, the Headline x2, or a Big Finish bet —
     the Quick-Draw's flat grammar, one size down. This function is
     the table's whole settlement, and it is PURE: given the kind,
     the marks and the runs going in, it returns the runs coming
     out, the bonus per seat, and the reveal's ONE named moment
     (reaching 5+ outranks reaching 3, which outranks a streak of
     4+ dying; inside a family the higher count wins, then the
     earlier seat). revealAnswer commits its verdict exactly once
     and records it on the question (streakFx/streakMoment), so a
     resumed reveal repaints from the record and never re-pays —
     the online room server runs the identical settlement. */
  var STREAK_BONUS = 25;
  function streakOutcomes(kind, marks, streaksIn) {
    var streakOut = {}, bonuses = {}, events = [];
    var seats = [];
    for (var k = 0; k < streaksIn.length; k++) seats.push(k);
    if (kind !== "mcq") {
      seats.forEach(function (i) { streakOut[i] = streaksIn[i] || 0; bonuses[i] = 0; });
      return { streakOut: streakOut, bonuses: bonuses, moment: null };
    }
    seats.forEach(function (i) {
      var before = streaksIn[i] || 0, after = 0, bonus = 0;
      if (marks[i]) {
        after = before + 1;
        if (after >= 3) bonus = STREAK_BONUS;
        if (after >= 5 && before < 5) events.push({ type: "reach5", seat: i, n: after });
        else if (after >= 3 && before < 3) events.push({ type: "reach3", seat: i, n: after });
      } else if (before >= 4) events.push({ type: "death", seat: i, n: before });
      streakOut[i] = after; bonuses[i] = bonus;
    });
    var rank = { reach5: 0, reach3: 1, death: 2 };
    events.sort(function (a, b) { return (rank[a.type] - rank[b.type]) || (b.n - a.n) || (a.seat - b.seat); });
    return { streakOut: streakOut, bonuses: bonuses, moment: events.length ? events[0] : null };
  }
  /* speaks a settled streak moment through the authored pools;
     returns true when it spoke (the caller then skips its generic
     beat — the AI beat latches are never consumed by a named
     moment, the quick-draw discipline) */
  function streakLineSay(moment, players) {
    if (!moment || !players) return false;
    var p = players[moment.seat];
    if (!p) return false;
    hostSay(moment.type === "death" ? "streakdeath" : (moment.type === "reach5" ? "streak5" : "streak3"),
      { name: p.name, n: moment.n });
    return true;
  }
  function revealAnswer() {
    if (!G || !G.cur || G.phase !== "vote") return;
    var c = G.cur;
    G.phase = "reveal";
    /* the Decider commits nothing but the verdict: scores frozen,
       no coins, no winner prefetch — the marked eligible seats ARE
       the closest call, and its fx paints only that */
    if (c.decider && G.decider) {
      buildDeciderFx();
      paintReveal();
      saveTableShow();
      return;
    }
    var winners = Object.keys(c.marks).map(Number).sort(function (a, b) { return a - b; });
    var qdSeat = quickDrawWinner(c);
    /* Hot Streaks: settle the runs BEFORE the money moves, so the
       bonus lands inside the same single commit as every other
       dollar this reveal pays; the record rides the question so a
       resumed reveal repaints it instead of re-paying it */
    var so = streakOutcomes(c.kind, c.marks, G.players.map(function (p) { return p.streak || 0; }));
    var gains = {};
    winners.forEach(function (i) {
      var p = G.players[i];
      var gain = c.betRound ? p.bet * 100 : c.bankValue;
      if (i === qdSeat) gain += QUICK_DRAW_BONUS; /* flat: never bet- or headline-scaled */
      if (so.bonuses[i]) gain += so.bonuses[i]; /* the streak bonus: flat $25, same rule */
      p.score += gain;
      gains[i] = gain;
    });
    c.streakFx = {}; c.streakMoment = so.moment;
    G.players.forEach(function (p, i) {
      p.streak = so.streakOut[i];
      c.streakFx[i] = { streak: so.streakOut[i], bonus: so.bonuses[i] || 0 };
    });
    /* New programme pass 2: the reveal writes the round's facts
       while the numbers are in its hands — biggest bank and the
       quick-draw tally the Intermission will be told from */
    noteFacts(G.facts, G.round, gains, qdSeat, c.cat);
    buildTableFx();
    /* the last question's reveal settles the final standings — start
       the winner line's generation now, not at the finale screen */
    if (G.round === 3 && G.qInRound === R3_COUNT - 1) winnerPrefetchAtReveal(winnerFactsFrom(G.players));
    paintReveal();
    saveTableShow();
  }
  /* Pass D4: this reveal's scoring grammar, painted at the seats by
     renderSeats. Marked seats banked; unmarked seats missed (at the
     table the host's marks ARE the answer record — an unmarked seat
     already slumps). Guess questions tag every banker CLOSEST so the
     room sees why the money moved. Factored out of revealAnswer so a
     resumed show can rebuild the same reveal WITHOUT re-applying the
     scores it already banked (improvement 4). */
  function buildTableFx() {
    var c = G.cur;
    var fxSeats = {}, bankSeq = 0, guessQ = (c.kind === "num" || c.kind === "survey");
    var qdSeat = quickDrawWinner(c);
    G.players.forEach(function (p, i) {
      /* Hot Streaks: the bank figure carries the settled bonus from
         the question's own record (c.streakFx) — a resumed reveal
         re-derives the same fx and never touches the scores */
      var sBonus = (c.streakFx && c.streakFx[i]) ? (c.streakFx[i].bonus || 0) : 0;
      if (c.marks[i]) fxSeats[i] = { delta: "bank", amt: (c.betRound ? p.bet * 100 : c.bankValue) + (i === qdSeat ? QUICK_DRAW_BONUS : 0) + sBonus, closest: guessQ, quickdraw: i === qdSeat, streakBonus: sBonus, delay: bankSeq++ * 0.12 };
      else fxSeats[i] = { delta: "miss", delay: i * 0.05 };
    });
    tableFx = { seats: fxSeats };
  }
  /* the Decider's seat grammar: no deltas (no money moved), only
     the CLOSEST tag on the marked eligible seats — the whole story
     of the reveal is who was nearest */
  function buildDeciderFx() {
    var c = G.cur, fxSeats = {};
    G.players.forEach(function (p, i) {
      fxSeats[i] = (c.marks && c.marks[i] && G.decider && G.decider.eligible.indexOf(i) >= 0)
        ? { closest: true } : null;
    });
    tableFx = { seats: fxSeats };
  }
  /* paints the reveal stage from G.cur exactly as revealAnswer left
     it — scores already committed, so this half is safe to re-run.
     settled=true is the resume repaint (improvement 4): the reveal
     lands as shown — slip printed, no sweep (visual stage 5) */
  function paintReveal(settled) {
    stagePhase("reveal");
    var c = G.cur;
    var winners = Object.keys(c.marks).map(Number).sort(function (a, b) { return a - b; });
    var nextBtn = '<div style="margin-top:12px"><button class="btn-gold" id="btnNext">CONTINUE</button></div>';
    if (c.kind === "num") {
      var dNum = "";
      if (c.decider) {
        /* the Decider's reveal speaks plainly: one closest call and
           the crown is decided; anything else goes again. The
           Sterling line is local (deciderhit / deciderlevel) — no
           live beat may claim money moved when none did */
        if (winners.length !== 1)
          dNum = '<div class="delta"><span class="down">Dead level — the closest calls are identical. The Decider goes again.</span></div>';
      } else if (!winners.length) {
        dNum = '<div class="delta"><span class="down">Nobody got close. The number keeps its dignity.</span></div>';
      }
      stage('<div class="q-headrow"><span class="cat-pill">' + catEmblem(c.cat) + esc(c.cat.toUpperCase()) + '</span><span class="q-kind">THE NUMBER WAS</span></div>' +
        '<div class="q-text' + (c.headline ? " headline-card" : "") + '" style="font-size:clamp(18px,3vw,25px)">' + esc(c.q.q) + "</div>" +
        '<div class="wager-amt">' + Number(c.q.num).toLocaleString("en-US") + "</div>" +
        dNum +
        whySlip(c.q.why, settled, c.headline ? "HEADLINE ×2" : null) + nextBtn);
      if (c.decider) {
        if (winners.length === 1) hostSay("deciderhit", { name: G.players[winners[0]].name });
        else hostSay("deciderlevel");
        Snd.play(winners.length === 1 ? "correct" : "wrong");
      } else {
        revealSay(winners.length ? "numHit" : "numMiss", { name: winners.length ? G.players[winners[0]].name : "" }, winners);
        Snd.play(winners.length ? "correct" : "wrong");
      }
    } else {
      var correctIdx = c.opts.findIndex(function (o) { return o.ok; });
      var btns = c.opts.map(function (o, i) {
        var cls = "ans-btn" + (i === correctIdx ? " correct" : (o.gone ? " dim wrong" : " dim"));
        return '<button class="' + cls + '" disabled><span class="letter">' + (i + 1) + '</span><span>' + esc(o.t) + "</span></button>";
      }).join("");
      var dMcq = winners.length ? ""
        : '<div class="delta"><span class="down">No fingers on it. The money stays in Sterling\'s pocket — this time.</span></div>';
      stage('<div class="q-headrow"><span class="cat-pill">' + catEmblem(c.cat) + esc(c.cat.toUpperCase()) + '</span><span class="q-kind">THE ANSWER</span></div>' +
        '<div class="q-text' + (c.headline ? " headline-card" : "") + '" style="font-size:clamp(18px,3vw,25px)">' + esc(c.q.q) + "</div>" +
        '<div class="answers">' + btns + "</div>" +
        dMcq +
        whySlip(c.q.why, settled, c.headline ? "HEADLINE ×2" : null) + nextBtn);
      var hk = winners.length === 0 ? "allMiss" : (winners.length === G.players.length ? "allHit" : "someHit");
      revealSay(hk, { name: winners.length ? G.players[winners[0]].name : "" }, winners);
      Snd.play(winners.length ? "correct" : "wrong");
    }
    renderSeats();
    /* Visual stage 5: the reveal's first beat is lit — the sweep
       crosses the card as the correct slab lights (its sheen rides
       along), with the footlights' warm-up from stage 1 */
    revealTheatre(settled);
    /* Pass P: Sterling leans in for the reveal; a fat bank earns the
       nod; and the money visibly travels to each winner's seat */
    stClass("st-lean", 1000);
    /* Visual stage 2: he points at the (first) banking seat — on a
       guess question the marked seats ARE the closest bankers, so
       the point lands on the story. A Big Finish bank points too:
       the reveal is an answer reveal and the seat did bank. */
    if (winners.length && (!c.decider || winners.length === 1)) stPoint(winners[0]);
    var maxGain = 0;
    winners.forEach(function (wi) { var gn = c.betRound ? G.players[wi].bet * 100 : c.bankValue; if (gn > maxGain) maxGain = gn; });
    if (maxGain >= 300) stClass("st-nod", 600);
    /* a decider banks nothing, so no coins fly for it — the point
       and the CLOSEST tag carry its reveal */
    if (!c.decider) winners.forEach(function (wi, k) { bankFx(wi, k * 0.12); });
    $("btnNext").addEventListener("click", function () {
      if (c.decider && G.decider && G.decider.winner == null) { deciderContinue(); return; }
      G.qInRound++; nextQuestion();
    });
  }

  /* ================= New programme pass 1 — the Decider (table) =================
     A finale reached with two or more players level at the top no
     longer crowns the earliest seat: the tied leaders play
     closest-number questions — drawn unused from the bank's num
     pool on the pass-5 band ladder (Deep Cut first) — until one of
     them is nearest alone. The machinery is the show's own guess
     machinery (askCurrent → callIt → vote → mark → reveal); what
     is new is only WHO may be marked (the eligible seats — the
     rest step back as spectators), that no score ever moves, and
     where the reveal's CONTINUE leads. G.decider carries
     {eligible, usedIds, dealt, winner} and rides the table save,
     so a refresh mid-decider resumes the same question with the
     same names and never re-deals a spent decider question. */
  function deciderUsedIds() {
    var used = {};
    if (G.guess) Object.keys(G.guess).forEach(function (k) { used[G.guess[k]] = 1; });
    (G.decider.usedIds || []).forEach(function (id) { used[id] = 1; });
    return used;
  }
  function drawDeciderQuestion() {
    var used = deciderUsedIds();
    var order = BAND_ORDER[3]; /* Deep Cut first, then the nearest band down */
    for (var oi = 0; oi < order.length; oi++) {
      var cand = BANK.filter(function (q) { return q.kind === "num" && q.d === order[oi] && !used[q.id]; }).map(function (q) { return q.id; });
      if (!cand.length) continue;
      var fresh = cand.filter(function (id) { return !seen[id]; });
      var id = pick(fresh.length ? fresh : cand);
      seen[id] = 1;
      return BANK[id];
    }
    /* the unused pool is dry — six num in the bank, at most three
       spent by the show's pinned slots, so this needs three prior
       deciders all dead level; rather than stall a live show,
       re-deal a num the show itself used but the decider hasn't */
    var again = BANK.filter(function (q) { return q.kind === "num" && (G.decider.usedIds || []).indexOf(q.id) < 0; });
    return again.length ? pick(again) : null;
  }
  function makeDeciderCur(q) {
    lastShownValue = null;
    return {
      q: q, kind: "num", cat: q.cat, diff: q.diff || "medium",
      value: 0, elapsed: 0, clockTotal: NUM_TIME,
      opts: null, marks: {}, resolved: false, cutUsed: false, lockOrder: [],
      betRound: false, bankValue: 0, headline: false, decider: true
    };
  }
  function beginDecider(tied) {
    G.decider = { eligible: tied.slice(), usedIds: [], dealt: 0, winner: null };
    dealDeciderQuestion();
  }
  function dealDeciderQuestion() {
    var q = drawDeciderQuestion();
    if (!q) { /* no number question exists at all — unreachable with
                this bank; fall back to the earliest tied seat, as
                finales did before the Decider */
      winnerScreen(G.decider.eligible[0], null);
      return;
    }
    G.decider.usedIds.push(q.id);
    G.decider.dealt++;
    G.cur = makeDeciderCur(q);
    askCurrent();
    saveTableShow();
  }
  /* the reveal's CONTINUE for a decider question — a pure function
     of the marks, so a resumed reveal routes identically: exactly
     one marked leader takes the crown; anything else (a dead heat
     between the marked, or nobody marked at all) deals another */
  function deciderContinue() {
    if (!G || !G.decider) return;
    var marked = G.decider.eligible.filter(function (i) { return G.cur && G.cur.marks && G.cur.marks[i]; });
    if (marked.length === 1) {
      G.decider.winner = marked[0];
      winnerScreen(marked[0], null);
      return;
    }
    dealDeciderQuestion();
  }

  /* ---------- the result ---------- */
  function finishShow() {
    var best = Math.max.apply(null, G.players.map(function (p) { return p.score; }));
    var tied = G.players.map(function (p, i) { return i; }).filter(function (i) { return G.players[i].score === best; });
    /* dead level at the top is not a result any more — the tied
       leaders settle it head-to-head in the Decider */
    if (tied.length > 1) { beginDecider(tied); return; }
    winnerScreen(tied[0], null);
  }
  function winnerScreen(i, tiedIdx) {
    G.phase = "over"; stagePhase("over");
    clearTableSave(); /* the show is complete — nothing left to resume */
    if (G.cur) G.cur.marks = {};
    var p = G.players[i];
    /* Design pass 4: the show is complete — Sterling writes it into
       the record (guarded by the show id, so this finale can render
       again without counting twice), and the marquee learns whether
       the crown was defended, taken, or crowned for the first time */
    var prevChampW = loadRecords().champion;
    recordShow(G.showId, G.players.map(function (pp, ii) { return { name: pp.name, avatar: snapAvatar(pp, ii), score: pp.score }; }), tiedIdx ? -1 : i);
    /* Programme pass 4 — Rematch Night: the night advances at the
       same guarded moment, under the same show id, on the finale's
       own verdict. What it earns — the night's score, or the
       taking of the night — is told under the show's honours */
    var sAdv = advanceSeries(G.showId, G.seriesCtx, tiedIdx ? null : recNameKey(p.name));
    var sNightWon = !!(sAdv && sAdv.nightWon);
    var sFinaleLine = composeSeriesFinale(sAdv, G.seriesCtx, sNightWon, p.name);
    var titleSub = champSubline(prevChampW, tiedIdx ? null : recNameKey(p.name), loadRecords().champion);
    /* a crown taken through the Decider is recorded exactly like
       any other (the purse is the winner's frozen score) — what
       differs is only the telling: the deciderwin line and the
       marker on the winner's podium */
    var deciderWon = !!(G.decider && G.decider.winner === i);
    var wStand = G.players.map(function (pp) { return { name: pp.name, score: pp.score }; })
      .sort(function (a, b) { return b.score - a.score; });
    /* a night taken is Sterling's biggest beat of the evening: its
       line is authored-only — the worker's winner line, which knows
       nothing of the series, may not displace it */
    if (sNightWon) sayWinnerAuthored(authoredLine("winnernight", { name: p.name }));
    else sayWinner({ winner: p.name, standings: wStand, topScore: p.score }, authoredLine(deciderWon ? "deciderwin" : "winner", { name: p.name }),
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
        ? ""
        : '<span class="rank-badge ' + badgeCls + '">' + (pos + 1) + "</span>";
      return '<div class="podium pod' + ii + " big rank" + (pos + 1) + (ii === i ? " winner-podium lit" : "") + '">' + top + (ii === i ? laurelBadge() : "") +
        avatarSVG(snapAvatar(pp, ii), ii === i ? "cheer" : "neutral", ii) +
        '<div class="desk"><div class="pname">' + esc(pp.name) + '</div><div class="pmoney">' + money(pp.score) + "</div>" +
        (ii === i && deciderWon ? '<div class="decider-marker">★ WON THE DECIDER</div>' : "") + "</div></div>";
    }).join("");
    var tieNote = "";
    if (tiedIdx) {
      var names = tiedIdx.map(function (ii) { return G.players[ii].name; }).join(" and ");
      tieNote = '<p class="round-text tie-note">Dead level at the top — ' + esc(names) + " matched at " + money(p.score) +
        ". The crown goes to the earliest seat, and the rematch is now legally mandatory.</p>";
    }
    stage('<div class="finale-wrap' + (sFinaleLine ? " has-series" : "") + '"><div class="spot-cone" aria-hidden="true"></div><div class="finale-main">' +
      '<div class="marquee finale-marquee"><div class="kicker">THE GILDED HOUR · FINAL RESULT</div>' +
      '<div class="winner-word">WINNER</div>' +
      '<div class="winner-name">' + esc(p.name) + '<span class="champ-tag">★ CHAMPION</span></div>' +
      '<div class="winner-total">' + money(p.score) + "</div>" +
      (titleSub ? '<div class="winner-sub">' + titleSub + "</div>" : "") +
      (sFinaleLine ? '<div class="winner-sub series-line' + (sNightWon ? " night-won" : "") + '">' + esc(sFinaleLine) + "</div>" : "") +
      '<span class="gold-seal" aria-hidden="true"><svg class="wheel-emblem emblem-seal" viewBox="0 0 120 120"><use href="#emblem"></use></svg></span></div>' +
      '<div class="sterling-zone"><div class="bubble bubble-finale">Sealed with a kiss of confetti — the hour is yours, ' + esc(p.name) + ".</div>" +
      sterlingSVG("present", "sterling sterling-lg") + "</div></div>" +
      tieNote +
      '<div class="podium-row finale-row">' + pods + "</div>" +
      '<div class="finale-btns"><button class="btn-gold" id="btnAgain">REMATCH</button>' +
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
    $("btnLobby").addEventListener("click", function () { stopLeaves(); clearTableSave(); showScreen("scr-title"); G = null; WakeLock.sync(); });
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
  /* improvement 4: the title's resume chip */
  $("btnResumeShow").addEventListener("click", function () { Snd.ensure(); resumeTableShow(); });
  $("btnDiscardShow").addEventListener("click", function () { clearTableSave(); paintTableResume(); });
  $("btnQuit").addEventListener("click", function () {
    stopClock(); stopLeaves(); saveSeen(); clearTableSave();
    seatsVisible(true);
    clearInterval(spinTimer); clearInterval(voteTimer); spinTimer = voteTimer = null;
    ogTeardown();
    G = null; showScreen("scr-title");
    WakeLock.sync(); /* back at the title: the screen may sleep again */
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
  /* Programme pass 4: the winner line for the night's biggest beat
     (a series taken) is spoken authored-only — the line is set
     directly and the winner sequence advances, so no in-flight
     generic winner fetch can land over it afterwards */
  function sayWinnerAuthored(line) {
    winnerSeq++;
    var hl = $("hostLine"); if (hl) hl.textContent = line;
  }
  /* reveal-time live beats for the table show: a whole-table miss, the
     first bank of the night, a runaway lead (>= $500, once per show).
     Anything else keeps the authored line the reveal already chose. */
  function revealSay(hk, vars, winners) {
    /* Hot Streaks: a named streak moment on this reveal speaks
       before everything — threshold crossings happen once per run,
       so the streak family outranks even the quick-draw call-out
       below; same discipline (authored pool, AI beat latches
       untouched). The moment was settled once, at the commit. */
    if (G && streakLineSay(G.cur && G.cur.streakMoment, G.players)) return;
    /* Design pass 3: a quick-draw reveal speaks the call-out and
       nothing else — the authored pool replaces the beat line, and
       the AI beat latches are NOT consumed, so a first_bank/big_lead
       beat that would have fired here simply lands on the next
       reveal instead of fighting the call-out for the bubble. */
    if (G && G.cur && G.cur.kind === "mcq" && tableFx) {
      var qdSeatT = -1;
      Object.keys(tableFx.seats).forEach(function (k) { if (tableFx.seats[k].quickdraw) qdSeatT = Number(k); });
      if (qdSeatT >= 0 && G.players[qdSeatT]) {
        hostSay("quickdraw", { name: G.players[qdSeatT].name });
        return;
      }
    }
    var cat = G && G.cur ? G.cur.cat : null;
    var authored = revealLine(hk, vars, cat);
    if (!G) { var h0 = $("hostLine"); if (h0) h0.textContent = authored; return; }
    if (winners.length === 0) { sayLive("beat", { beat: "whole_miss", category: cat || undefined }, authored); return; }
    if (!G.bankedOnce) {
      G.bankedOnce = true;
      sayLive("beat", { beat: "first_bank", name: G.players[winners[0]].name, category: cat || undefined }, authored);
      return;
    }
    if (!G.bigLeadDone) {
      var srt = G.players.map(function (p) { return p.score; }).sort(function (a, b) { return b - a; });
      if (srt.length > 1 && srt[0] - srt[1] >= 500) {
        G.bigLeadDone = true;
        var leadName = "";
        G.players.forEach(function (p) { if (p.score === srt[0] && !leadName) leadName = p.name; });
        sayLive("beat", { beat: "big_lead", name: leadName, lead: srt[0] - srt[1], category: cat || undefined }, authored, { window: 2500 });
        return;
      }
    }
    var hl = $("hostLine"); if (hl) hl.textContent = authored;
  }
  /* the same beats for the online host, against server scores */
  function ogRevealSay(hk, vars, winners) {
    /* Hot Streaks: the server's reveal named a streak moment
       (ogStreakMoment, set in ogOnReveal) — it speaks first, ahead
       of the quick-draw call-out, latches untouched. */
    if (OG && streakLineSay(ogStreakMoment, OG.players)) return;
    /* Design pass 3: same rule as the table — a quick-draw reveal
       speaks the call-out instead of the beat, and the AI beat
       latches stay unconsumed for the next reveal. The winner comes
       from the server's reveal (ogQdSeat, set in ogOnReveal). */
    if (OG && OG.cur && OG.cur.kind === "normal" && ogQdSeat >= 0 && OG.players[ogQdSeat]) {
      hostSay("quickdraw", { name: OG.players[ogQdSeat].name });
      return;
    }
    var cat = OG && OG.cur ? OG.cur.cat : null;
    var authored = revealLine(hk, vars, cat);
    if (!OG) { var h0 = $("hostLine"); if (h0) h0.textContent = authored; return; }
    if (winners.length === 0) { sayLive("beat", { beat: "whole_miss", category: cat || undefined }, authored); return; }
    if (!OG.bankedOnce) {
      OG.bankedOnce = true;
      var fp = OG.players[winners[0]];
      sayLive("beat", { beat: "first_bank", name: fp ? fp.name : "A player", category: cat || undefined }, authored);
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
        sayLive("beat", { beat: "big_lead", name: leadName2, lead: sc[0] - sc[1], category: cat || undefined }, authored, { window: 2500 });
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
      marks: {}, resolved: false, cutUsed: false, lockOrder: [],
      betRound: false, bankValue: 0, headline: false,
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
    resetDeck();
    var guess = buildGuessSchedule();
    var script = [];
    [[1, R1_COUNT, R1_BANDS], [2, R2_COUNT, R2_BANDS], [3, R3_COUNT, R3_BANDS]].forEach(function (rr) {
      G.round = rr[0];
      for (var qi = 0; qi < rr[1]; qi++) {
        G.qInRound = qi;
        var gid = guess[rr[0] + ":" + qi];
        var q, kind;
        if (gid != null) { q = BANK[gid]; kind = q.kind; }
        else { q = drawBand(rr[2][qi] || 2); kind = "normal"; }
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
  /* Programme pass 4: a one-note explanation the lobby renders when
     it has something to account for (a rematch that found the table
     scattered) — rendered until a show starts, then cleared */
  var ogLobbyNote = null;
  function ogPill(txt, warn) {
    var p = $("ogPill"); if (!p) return;
    if (!txt) { p.classList.add("hidden"); return; }
    p.textContent = txt; p.classList.toggle("warn", !!warn); p.classList.remove("hidden");
  }
  function ogSend(o) { if (OG && OG.ws && OG.ws.readyState === 1) { try { OG.ws.send(JSON.stringify(o)); return true; } catch (e) {} } return false; }
  function ogJoined() { return OG ? OG.players.filter(Boolean) : []; }
  /* ---------- improvement 4: the online host survives a refresh ----------
     The server owns the room (players, scores, the in-flight question
     and its deadline); the one thing only the host knows is the SHOW
     PLAN — the 15-question script it built. Both halves are saved:
     {code, hostToken} plus the plan, to gh_host_show {v:1}, on room
     creation and at every advance. Rejoining with the plan rebuilds
     OG as a CONTROLLING host on the server's snapshot; rejoining
     without one (the old sessionStorage ticket) keeps the view-only
     resync it always was. */
  var HOST_SAVE_KEY = "gh_host_show";
  function ogSaveEntry(e) {
    var o = {
      seq: e.seq, round: e.round, qInRound: e.qInRound, kind: e.kind, cat: e.cat, diff: e.diff,
      baseValue: e.baseValue, multiplier: e.multiplier, windowMs: e.windowMs, qid: e.qid
    };
    if (e.trueNum != null) o.trueNum = e.trueNum;
    if (e.answers) { o.answers = e.answers; o.correctIdx = e.correctIdx; o.cutIndices = e.cutIndices; }
    /* a decider entry is an ordinary bank num question plus its
       flag and its two (or more) names — the eligible list must
       survive the save or a restored host loses who may play */
    if (e.decider) { o.decider = true; o.eligible = e.eligible ? e.eligible.slice() : []; }
    /* the nightly special's synthetic bank travels whole; bank
       questions rebuild from their id */
    if (e.special) { o.special = true; o.intro = e.intro || null; o.bank = e.bank; }
    else o.bankId = (e.bank && e.bank.id != null) ? e.bank.id : null;
    return o;
  }
  function ogLoadEntry(o) {
    if (!o || typeof o.qid !== "string") return null;
    var e = {
      seq: o.seq, round: o.round, qInRound: o.qInRound, kind: o.kind, cat: o.cat, diff: o.diff,
      baseValue: o.baseValue, multiplier: o.multiplier, windowMs: o.windowMs, qid: o.qid
    };
    if (o.trueNum != null) e.trueNum = o.trueNum;
    if (o.answers) { e.answers = o.answers; e.correctIdx = o.correctIdx; e.cutIndices = o.cutIndices; }
    if (o.decider) { e.decider = true; e.eligible = Array.isArray(o.eligible) ? o.eligible.slice() : []; }
    if (o.special) { e.special = true; e.intro = o.intro || null; e.bank = o.bank; if (!e.bank) return null; }
    else { if (o.bankId == null || !BANK[o.bankId]) return null; e.bank = BANK[o.bankId]; }
    return e;
  }
  function ogSaveHostShow() {
    if (!OG || !OG.code || !OG.hostToken) return;
    try {
      localStorage.setItem(HOST_SAVE_KEY, JSON.stringify({
        v: 1, code: OG.code, hostToken: OG.hostToken,
        started: !!OG.started, idx: OG.idx || 0, curRound: OG.curRound || 0,
        bankedOnce: !!OG.bankedOnce, bigLeadDone: !!OG.bigLeadDone,
        /* New programme pass 2: the facts ride the host save, so a
           refresh anywhere — above all mid-break — keeps the story
           the Intermission tells (and the seen set keeps a
           resynced reveal from being counted twice) */
        facts: OG.facts || null,
        /* Programme pass 4: the series context rides the plan — it
           was captured from who was connected when this show
           started, and a restore cannot re-derive that moment */
        seriesCtx: OG.seriesCtx || null,
        seriesLine: OG.seriesLine || null,
        decider: OG.decider ? {
          eligible: OG.decider.eligible.slice(),
          winner: OG.decider.winner != null ? OG.decider.winner : null,
          used: (OG.decider.used || []).slice()
        } : null,
        lastStand: OG.lastStand || null,
        script: OG.script ? OG.script.map(ogSaveEntry) : null,
        savedAt: Date.now()
      }));
    } catch (e) {}
  }
  function ogDropHostSave() { try { localStorage.removeItem(HOST_SAVE_KEY); } catch (e) {} }
  function ogLoadHostSave() {
    var raw = null, sv = null;
    try { raw = localStorage.getItem(HOST_SAVE_KEY); } catch (e) {}
    if (raw == null) return null;
    try { sv = JSON.parse(raw); } catch (e) { sv = null; }
    /* any unusable saved plan is discarded on sight (the legacy
       sessionStorage ticket is a separate key and survives) */
    if (!sv || sv.v !== 1 || typeof sv.code !== "string" || typeof sv.hostToken !== "string") { ogDropHostSave(); return null; }
    if (sv.started) {
      if (!Array.isArray(sv.script) || !sv.script.length) { ogDropHostSave(); return null; }
      var script = sv.script.map(ogLoadEntry);
      if (script.some(function (e) { return !e; })) { ogDropHostSave(); return null; } /* a plan with a hole in it is no plan */
      sv.script = script;
    } else sv.script = null;
    return sv;
  }
  function ogClearHostSave() {
    try { localStorage.removeItem(HOST_SAVE_KEY); } catch (e) {}
    try { sessionStorage.removeItem("gh_host_room"); } catch (e) {}
  }
  function ogSavedHost() {
    var sv = ogLoadHostSave();
    if (sv) return sv;
    /* legacy ticket (this tab, pre-refresh): credentials only, so the
       rejoin stays the view-only resync it has always been */
    try { var x = JSON.parse(sessionStorage.getItem("gh_host_room") || "null"); if (x && x.code && x.hostToken) return { code: x.code, hostToken: x.hostToken, started: false, script: null }; } catch (e) {}
    return null;
  }
  function paintHostPanel() {
    var sv = ogSavedHost(), b = $("btnRejoinRoom");
    if (!b) return;
    b.classList.toggle("hidden", !sv);
    if (sv) b.textContent = sv.started ? "REJOIN YOUR SHOW · ROOM " + sv.code : "REJOIN ROOM " + sv.code;
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
  function ogJoinRoom(code, hostToken, plan) {
    ogTeardown(); /* (also clears any saved host state — the plan in hand is re-saved below) */
    ogLobbyNote = null; /* a new room has nothing to account for */
    ogFortuneDisp = []; /* Visual stage 4: a new room starts with empty desks */
    OG = {
      code: code, hostToken: hostToken, ws: null, dead: false,
      players: [null, null, null, null], snap: null, offset: 0,
      started: false, script: null, idx: 0, curRound: 0, cur: null,
      decider: null,           // New programme pass 1: {eligible, winner, used} once a tied finale triggers it
      facts: freshFacts(),     // New programme pass 2: the round-facts recorder the Intermission is told from
      seriesCtx: null, seriesLine: null, // Programme pass 4: the night's series, captured at the show's start
      phase: "connecting", lastRevealQid: null, revealState: {},
      bankedOnce: false, bigLeadDone: false,
      disp: [null, null, null, null], lastStand: null,
      backoff: 1000, tickInt: null, spinInt: null,
      restoring: false, welcomed: false, rejoin: !!plan
    };
    /* a saved plan for THIS room rebuilds a controlling host: the
       server's first snapshot then re-attaches the show in flight */
    if (plan && plan.code === code && plan.started && Array.isArray(plan.script) && plan.script.length) {
      OG.started = true;
      OG.script = plan.script;
      OG.idx = Math.min(Math.max(plan.idx | 0, 0), plan.script.length - 1);
      OG.curRound = plan.curRound | 0;
      OG.bankedOnce = !!plan.bankedOnce;
      OG.bigLeadDone = !!plan.bigLeadDone;
      OG.facts = factsFromSave(plan.facts);
      OG.lastStand = plan.lastStand || null;
      /* a saved plan mid-decider restores the decider with the
         script entries it dealt (they ride the script save below) */
      if (plan.decider && Array.isArray(plan.decider.eligible) && plan.decider.eligible.length >= 2) {
        OG.decider = {
          eligible: plan.decider.eligible.slice(),
          winner: (typeof plan.decider.winner === "number") ? plan.decider.winner : null,
          used: Array.isArray(plan.decider.used) ? plan.decider.used.slice() : []
        };
      }
      /* a saved plan from a series show restores its context
         (lightly shape-checked, like everything else in the plan);
         a plan written before Rematch Night has neither field */
      if (plan.seriesCtx && typeof plan.seriesCtx.key === "string" && Array.isArray(plan.seriesCtx.roster)) {
        OG.seriesCtx = {
          key: plan.seriesCtx.key,
          roster: plan.seriesCtx.roster
            .filter(function (r) { return r && typeof r.key === "string" && typeof r.name === "string"; })
            .map(function (r) { return { key: r.key, name: r.name }; })
        };
        OG.seriesLine = typeof plan.seriesLine === "string" ? plan.seriesLine : null;
      }
      OG.restoring = true;
    }
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
    WakeLock.sync(); /* hosting a room (lobby + show): stay awake */
    ogSaveHostShow();
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
    ogClearHostSave(); /* leaving a room for good retires its saved host state */
    OG.dead = true;
    if (OG.tickInt) clearInterval(OG.tickInt);
    if (OG.spinInt) clearInterval(OG.spinInt);
    if (OG.ws) { try { OG.ws.close(); } catch (e) {} }
    OG = null;
    WakeLock.sync(); /* no room, no show: release the screen */
    ogPill(null);
    var gg = $("scr-game"); if (gg) gg.classList.remove("sealed");
    clock.running = false;
  }
  /* a restore that discovers its room is gone (or its token no
     longer fits) retires the saved host state and lands at the title
     with the news, instead of resyncing a ghost */
  function ogHostGone() {
    ogTeardown(); /* clears the saved host state */
    showScreen("scr-title");
    setMode("host");
    var st = $("hostStatus");
    if (st) { st.classList.add("err"); st.textContent = "That room has closed — the show that was in it is over. Open a new room when you're ready."; }
    paintHostPanel();
  }
  function ogOnMsg(m) {
    if (!OG) return;
    if (m.t === "welcome") { OG.backoff = 1000; OG.welcomed = true; OG.restoring = false; ogPill("ONLINE · ROOM " + OG.code, false); return; }
    if (m.t === "error") {
      if (OG.rejoin && !OG.welcomed) {
        if (m.msg === "Bad host token." || m.msg === "Room expired.") { ogHostGone(); return; }
        /* "Host already connected." on a rejoin means the previous
           socket is still draining server-side — close this one and let
           the reconnect backoff retry the hello; the save stays */
        if (m.msg === "Host already connected." && OG.ws) { try { OG.ws.close(); } catch (e) {} return; }
      }
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
    if (s.phase === "lobby") {
      if (!OG.started) ogShowLobby();
      /* a restored host whose show never left the lobby room-side:
         re-present the round intro it was driving */
      else if (OG.phase === "connecting") ogIntro();
      else ogRenderSeats();
      return;
    }
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
    /* New programme pass 2: the room is resting between rounds.
       The server's phase is the ground truth — a host restored
       mid-break (its local phase still "connecting") repaints its
       card from its saved facts; a host already resting just
       refreshes its seats; a host that has already begun the next
       round locally ignores the lagging phase (the server clears
       it when the next question publishes). Handled — and returned
       from — before the script-position adoption below: the
       snapshot's question is still the finished round's last one,
       and adopting it would rewind the plan into that reveal. */
    if (s.phase === "intermission") {
      if (OG.phase === "intermission") ogRenderSeats();
      else if (OG.phase === "connecting") {
        var nr = (s.intermination && s.intermination.nextRound) || OG.curRound + 1;
        OG.phase = "intermission"; stagePhase("intermission");
        seatsVisible(false);
        $("roundLabel").textContent = { 2: "ROUND 2 · DOUBLE MONEY", 3: "ROUND 3 · THE BIG FINISH" }[nr] || "";
        $("qCounter").textContent = "THE INTERMISSION";
        ogPaintIntermission(nr);
      }
      return;
    }
    /* a restored host adopts the snapshot's position in its own
       script — the server's question is the ground truth */
    if (OG.script) {
      var snapQid = s.question ? s.question.qid : s.bet ? s.bet.qid : (s.phase === "reveal" && s.lastReveal ? s.lastReveal.qid : null);
      if (snapQid) for (var qi = 0; qi < OG.script.length; qi++) if (OG.script[qi].qid === snapQid) { OG.idx = qi; break; }
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
      if (OG.phase !== "reveal" && s.lastReveal) {
        /* a restored host lands mid-reveal with no current question —
           rebuild it from the script so the reveal can paint */
        if (OG.started && !OG.cur) OG.cur = ogEntryByQid(s.lastReveal.qid, null);
        if (OG.cur) ogOnReveal(s.lastReveal, true); else ogRenderSeats();
      }
      else ogRenderSeats();
    } else if (s.phase === "ended") {
      if (OG.phase !== "over") ogWinner();
    }
  }
  function ogShowLobby() {
    OG.phase = "lobby"; stagePhase("lobby");
    seatsVisible(true);
    ogRenderSeats();
    /* warm the predictable Sterling lines for the table as it stands;
       re-rendered on every join/leave, and the cache keys make a
       changed player set fetch only what is actually new */
    prefetchShowLines(ogJoined().map(function (p) { return p.name; }));
    var joined = ogJoined().length;
    /* Design pass 4: if the defending champion is among the seated,
       Sterling acknowledges the return — a line of its own under the
       greeting, never an edit of the greeting itself */
    var champAck = ogChampAckLine();
    stage('<div class="q-cat">YOUR ROOM IS OPEN — PLAYERS JOIN WITH THIS CODE</div>' +
      '<div class="og-coderow"><div class="og-code">' + esc(OG.code) + "</div>" +
      '<div class="og-qr" id="ogQr"><svg class="wheel-emblem emblem-lobby" viewBox="0 0 120 120" aria-hidden="true"><use href="#emblem-sm"></use></svg><canvas id="ogQrCanvas" width="240" height="240" aria-label="QR code to join this room"></canvas><div class="og-qr-cap">SCAN TO JOIN</div></div>' +
      '<button class="btn-ghost og-copy" id="ogCopy">COPY CODE</button></div>' +
      '<p class="round-text">' + (joined
        ? joined + (joined === 1 ? " player is" : " players are") + " in. Sterling is warming up the room."
        : "Waiting for players — they open the game on their phones, tap JOIN A ROOM, and type the code.") + "</p>" +
      (champAck ? '<p class="champ-return" id="ogChampReturn">' + esc(champAck) + "</p>" : "") +
      (ogLobbyNote ? '<p class="round-text og-lobby-note" id="ogLobbyNote">' + esc(ogLobbyNote) + "</p>" : "") +
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
      /* Hot Streaks: the same segment as the table's desk tag, read
         straight off the snapshot's per-player streak */
      var oseg = streakSegHTML(p.streak || 0);
      if (oseg) tags.push(oseg);
      var s = el('<div class="seat pod' + i + (p.connected ? "" : " away") + '" data-seat="' + i + '">' +
        '<div class="seat-ava">' + avatarSVG(snapAvatar(p, i), state, i) + "</div>" +
        '<div class="desk"><span class="seat-name">' + esc(p.name) + '</span>' +
        '<span class="seat-score">' + shown + '</span>' +
        '<span class="tag">' + tags.join(" · ") + "</span>" + fortuneHTML() + "</div></div>");
      if (p.score === best && best > 0) s.classList.add("lead");
      /* the Decider steps its spectators back on the big screen too */
      if (OG.cur && OG.cur.decider && OG.decider && OG.decider.winner == null && (OG.cur.eligible || []).indexOf(i) < 0) s.classList.add("spectator");
      if (OG.phase === "reveal" && ogFx && ogFx.qid === OG.lastRevealQid) decorateSeat(s, ogFx.seats[i]);
      bot.appendChild(s);
      /* Visual stage 4: same rule as the table seats — a rebuild
         paints the displayed pile, ogTick keeps growing it */
      paintFortune(s, ogFortuneDisp[i] != null ? ogFortuneDisp[i] : p.score,
        Math.max.apply(null, OG.players.map(function (x, j) { return x ? (ogFortuneDisp[j] != null ? ogFortuneDisp[j] : x.score) : 0; })),
        p.score === best && best > 0);
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
    /* Visual stage 4: the piles chase snapshot scores on this same
       100ms tick, a touch slower than the digits — a reveal's growth
       lands with its coin flight, and any snapshot that changes a
       score (a bet settling, a rejoin) grows the desk to match */
    var ogDispLead = 0, ogRealLead = 0;
    OG.players.forEach(function (p, i) {
      if (!p) return;
      var dv = ogFortuneDisp[i] != null ? ogFortuneDisp[i] : p.score;
      if (dv > ogDispLead) ogDispLead = dv;
      if (p.score > ogRealLead) ogRealLead = p.score;
    });
    OG.players.forEach(function (p, i) {
      if (!p) return;
      if (ogFortuneDisp[i] == null) ogFortuneDisp[i] = p.score;
      var fd = p.score - ogFortuneDisp[i];
      if (fd !== 0) {
        ogFortuneDisp[i] += fd * 0.22;
        if (Math.abs(p.score - ogFortuneDisp[i]) < 2) ogFortuneDisp[i] = p.score;
      }
      paintFortune(document.querySelector('.seat[data-seat="' + i + '"]'),
        ogFortuneDisp[i], ogDispLead, p.score > 0 && p.score >= ogRealLead);
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
        var v = Math.round((q.baseValue != null ? q.baseValue : OG.cur.baseValue) * (q.multiplier != null ? q.multiplier : OG.cur.multiplier) * (1 - 0.5 * frac));
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
    ogBeginShow();
  }
  /* the show-start core, shared by the lobby's START THE SHOW and
     the finale's REMATCH (Programme pass 4): a fresh script under
     the ramp, every per-show field reset, and the night's series
     context captured from the players CONNECTED at this moment —
     the cast the show will count for. On a series show the
     standard greeting stands down: Sterling's framing of the
     night is spoken at the Round 1 intro instead (ogIntro), where
     the room reads before the first question */
  function ogBeginShow() {
    OG.started = true;
    $("scr-game").classList.remove("sealed");
    resetLineBags();
    OG.script = ogBuildScript();
    OG.idx = 0; OG.curRound = 0;
    OG.cur = null; OG.decider = null;
    OG.facts = freshFacts();
    OG.lastRevealQid = null; OG.revealState = {};
    OG.bankedOnce = false; OG.bigLeadDone = false;
    ogFx = null; ogQdSeat = -1; ogStreakMoment = null;
    OG.disp = [null, null, null, null];
    ogFortuneDisp = [];
    OG.lastStand = { scores: [0, 0, 0, 0], ranks: {} };
    ogLobbyNote = null;
    OG.seriesCtx = seriesCtxFor(OG.players.filter(function (p) { return p && p.connected; }).map(function (p) { return p.name; }));
    OG.seriesLine = composeSeriesOpening(liveSeriesFor(OG.seriesCtx), OG.seriesCtx);
    Snd.ensure(); Snd.play("theme");
    if (!OG.seriesLine) sayLive("greeting", { names: ogJoined().map(function (p) { return p.name; }) }, authoredLine("open"),
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
      ogSaveHostShow(); /* the plan changed — the saved copy follows */
    });
    ogIntro();
    ogSaveHostShow();
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
    OG.phase = "intro"; stagePhase("intro");
    setLight(e.round === 1 ? "open" : e.round === 2 ? "hot" : "vault");
    seatsVisible(false);
    $("roundLabel").textContent = { 1: "ROUND 1 · THE WARM-UP", 2: "ROUND 2 · DOUBLE MONEY", 3: "ROUND 3 · THE BIG FINISH" }[e.round];
    $("qCounter").textContent = "QUESTION " + e.seq + " OF 15";
    var titles = { 1: "THE WARM-UP", 2: "DOUBLE MONEY", 3: "THE BIG FINISH" };
    var texts = {
      1: "Six questions, and everybody answers every one — on your own phones this time. Sterling spins the category. Easy pays $100, medium $200, hard $300, and the value drains while the room thinks. When the window closes, every correct phone banks the money. And on every multiple-choice question, the first correct answer in also pockets a $50 quick-draw — be quick AND right. Three correct in a row starts a streak — every bank after that pays a bonus $25 while it lives. Closest-number questions: type your number — the nearest takes it.",
      2: "Same game, double money — $200, $400, $600. Your one lifeline is live: each of you holds a single Cut Two for the whole show. Call it from your phone before the window closes and two wrong answers vanish for everybody. And the round closes with the Headline Question — double money again, half the time on the clock.",
      3: "Three questions. Before each one, bet on yourself from your phone — a chip is $100, and the bet stays secret until the reveal. Chasing the leader? The further behind you are, the more chips you may ride — up to five. Get it right and the bet pays in full. Get it wrong and you lose nothing but face."
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
       when the first question's spin begins, in ogSpinThenPublish.
       Rematch Night's exception: on a series show the greeting
       stood down in ogBeginShow precisely so this framing could
       own the bubble — no race, because nothing else was said. */
    if (e.round === 1 && OG.seriesLine) hostSayText(OG.seriesLine);
    else if (e.round !== 1) hostSay("r" + e.round);
    $("ogRoundGo").addEventListener("click", ogServe);
    ogSaveHostShow(); /* curRound moved with this intro — the save follows */
  }
  /* ================= New programme pass 1 — the Decider (online) =================
     The online mirror of the table's decider. When the fifteenth
     reveal leaves the room dead level at the top, ogAdvance does
     not finish: the host draws ONE extra closest-number question
     (unused, Deep Cut first on the pass-5 ladder) and appends it
     to its own script as a flagged entry — so the host save, the
     snapshot resync and the qid machinery all treat it as an
     ordinary script entry. It publishes through ogPublish with
     decider + eligible attached; the ROOM referees it (server:
     non-eligible answers rejected, no money moves, the reveal
     names deciderWinner). This screen only presents it and routes
     on the verdict: winner → the finale crowns them; still level
     → another is dealt. OG.decider rides the host save. */
  function ogTopTied() {
    var idxs = [];
    OG.players.forEach(function (p, i) { if (p) idxs.push(i); });
    if (idxs.length < 2) return idxs;
    var best = Math.max.apply(null, idxs.map(function (i) { return OG.players[i].score; }));
    return idxs.filter(function (i) { return OG.players[i].score === best; });
  }
  function ogDeciderEntryFor(q) {
    OG.decider.used.push(q.id);
    var seed = (Math.random() * 2147483646 + 1) | 0;
    var seq = OG.script.length + 1;
    return {
      seq: seq, round: 3, qInRound: 2 + OG.decider.used.length, bank: q, kind: "num",
      cat: q.cat, diff: q.diff || "medium",
      baseValue: BASE_VALUES[q.diff || "medium"], multiplier: 1, windowMs: NUM_TIME * 1000,
      trueNum: Number(q.num),
      qid: "q" + seq + "." + q.id + "." + seed.toString(36),
      decider: true, eligible: OG.decider.eligible.slice()
    };
  }
  function ogDrawDeciderEntry() {
    var used = {};
    (OG.script || []).forEach(function (e) { if (e.bank && e.bank.id != null) used[e.bank.id] = 1; });
    (OG.decider.used || []).forEach(function (id) { used[id] = 1; });
    var order = BAND_ORDER[3]; /* Deep Cut first, then the nearest band down */
    for (var oi = 0; oi < order.length; oi++) {
      var cand = BANK.filter(function (q) { return q.kind === "num" && q.d === order[oi] && !used[q.id]; });
      if (!cand.length) continue;
      var fresh = cand.filter(function (q) { return !seen[q.id]; });
      return ogDeciderEntryFor(pick(fresh.length ? fresh : cand));
    }
    /* the unused pool is dry (six num in the bank, at most three
       spent by the script's pinned slots) — re-deal a num the show
       used but the decider hasn't, rather than stall the room */
    var again = BANK.filter(function (q) { return q.kind === "num" && (OG.decider.used || []).indexOf(q.id) < 0; });
    return again.length ? ogDeciderEntryFor(pick(again)) : null;
  }
  function ogStartDecider(tied) {
    OG.decider = { eligible: tied.slice(), winner: null, used: [] };
    ogDealAnotherDecider();
  }
  function ogDealAnotherDecider() {
    var e = ogDrawDeciderEntry();
    if (!e) { ogFinish(); return; } /* no number question exists — unreachable with this bank */
    OG.script.push(e);
    OG.idx = OG.script.length - 1;
    ogSaveHostShow(); /* the plan grew — the saved copy follows */
    ogServe();
  }
  function ogServe() {
    if (!OG || !OG.script) return;
    var e = OG.script[OG.idx];
    if (!e) { ogFinish(); return; }
    OG.cur = e;
    seatsVisible(true);
    if (e.decider) {
      /* the Decider skips the spin and the bet phase both: banner,
         names, one question — published straight onto the stage */
      $("roundLabel").textContent = "★ THE DECIDER";
      $("qCounter").textContent = "WINNER TAKES THE CROWN";
      ogPublish(e);
      return;
    }
    $("qCounter").textContent = "QUESTION " + e.seq + " OF 15";
    if (e.round === 3) { ogSend({ t: "bet_phase", qid: e.qid }); ogBetWait(e); }
    else ogSpinThenPublish(e);
  }
  function ogBetWait(e) {
    OG.phase = "bet"; OG.cur = e; stagePhase("bet");
    seatsVisible(true); ogRenderSeats();
    stage('<div class="round-kicker">THE BIG FINISH · QUESTION ' + (e.qInRound + 1) + " OF 3</div>" +
      '<div class="round-title">BET TIME</div>' +
      '<p class="round-text">Bets are being placed on phones, secret until the reveal — a chip is $100; right pays the bet, wrong costs nothing. Chasing the leader? The further behind you are, the more chips you may ride — up to five.</p>' +
      '<div><span class="og-count">BETS IN&nbsp;<b id="ogBetsIn">0</b> / ' + ogJoined().length + "</span></div>" +
      '<div style="margin-top:14px"><button class="btn-gold" id="ogBetsGo">BETS ARE IN — SPIN THE CATEGORY</button></div>');
    hostSay("bet");
    $("ogBetsGo").addEventListener("click", function () { ogSpinThenPublish(e); });
    if (OG.snap && OG.snap.bet) ogPaintBets(OG.snap.bet.betsIn);
  }
  function ogPaintBets(n) { var b = $("ogBetsIn"); if (b) b.textContent = String(n || 0); }
  function ogSpinThenPublish(e) {
    OG.phase = "spin"; stagePhase("spin");
    seatsVisible(true); ogRenderSeats();
    var chips = CATS.map(function (c) {
      var cs = catStyle(c);
      return '<span class="cat-chip" data-cat="' + esc(c) + '" style="--chip:' + cs.mid + ";--chipd:" + cs.sh + ";color:" + (CATTX[c] || "#FFF6E8") + '">' + catEmblem(c) + "<span>" + esc(c) + "</span></span>";
    }).join("");
    var spinHeadline = isHeadline(e.round, e.qInRound);
    stage('<div class="q-cat">STERLING SPINS THE CATEGORIES</div>' +
      (spinHeadline ? '<div class="hl-slot"><span class="headline-banner inflow">★ THE HEADLINE QUESTION ★</span></div>' : "") +
      spinFrameHTML(chips) +
      '<p class="round-text">Where it stops, nobody knows. Sterling knows. Sterling always knows.</p>');
    if (e.special && e.intro) $("hostLine").textContent = e.intro;
    else if (spinHeadline) { e.headlineSaid = true; hostSay("headline", { cat: e.cat }); }
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
    /* the Decider rides the ordinary publish — the server validates
       the flag and the eligible list like any other field */
    if (e.decider) { msg.decider = true; msg.eligible = (e.eligible || []).slice(); }
    ogSend(msg);
  }
  function ogShowQuestion(e, q) {
    OG.phase = "answer"; OG.cur = e; stagePhase("question");
    applyCat(e.cat); setCatBackdrop(e.cat);
    seatsVisible(true); ogRenderSeats();
    /* the Decider's stage furniture: its own banner in the Headline
       grammar, the money line traded for the stakes, and the count
       over the eligible seats only */
    var isDec = !!e.decider;
    if (isDec) $("roundLabel").textContent = "★ THE DECIDER";
    $("qCounter").textContent = isDec ? "WINNER TAKES THE CROWN" : "QUESTION " + e.seq + " OF 15";
    var eligSeats = (q.eligible && q.eligible.length) ? q.eligible : (e.eligible || []);
    if (isDec && !e.eligible && eligSeats.length) e.eligible = eligSeats.slice();
    /* Design pass 2: the server derives the Headline itself and deals
       the effective figures in the snapshot — the host screen mirrors
       them (doubled multiplier, halved window), never its own claim */
    var headline = q.headline != null ? !!q.headline : isHeadline(e.round, e.qInRound);
    var head = e.kind === "survey" ? "MOST PEOPLE SAY…" : e.kind === "num" ? "CLOSEST NUMBER" : (e.diff || "").toUpperCase();
    var top = '<div class="q-headrow"><span class="cat-pill' + (e.special ? " gilded" : "") + (headline ? " headline" : "") + '">' + catEmblem(e.cat) + (e.special ? "TONIGHT'S GILDED QUESTION" : esc(e.cat.toUpperCase()) + (headline ? " · HEADLINE" : "")) + '</span><span class="q-kind">' + head + "</span></div>" +
      '<div class="q-cardwrap">' + (isDec ? '<div class="headline-banner decider-banner">★ THE DECIDER ★</div>' : (headline ? '<div class="headline-banner">★ THE HEADLINE QUESTION ★</div>' : "")) +
      '<div class="q-text' + (headline ? " headline-card" : "") + '">' + esc(e.bank.q) + "</div></div>";
    var meta = '<div class="q-meta">' + (isDec
      ? '<div class="q-for">No money on this one — the crown only.</div>'
      : q.betted
      ? '<div class="q-for">Bets are in — this one pays the bet, and only the bet.</div>'
      : '<div class="q-value"><small>QUESTION VALUE</small><span id="qValue">' + money((q.baseValue != null ? q.baseValue : e.baseValue) * (q.multiplier != null ? q.multiplier : e.multiplier)) + "</span></div>") + timerHTML() + "</div>";
    if (e.kind === "num") {
      var vsLine = isDec
        ? eligSeats.map(function (i) { return OG.players[i] ? esc(OG.players[i].name) : ""; }).filter(Boolean).join(" vs ") + " — closest number takes the crown. Everyone else watches."
        : "No options. No hiding. Numbers are being typed on phones — the closest takes it.";
      stage(top + meta +
        '<div class="q-for">' + vsLine + '</div>' +
        '<div><span class="og-count">ANSWERS IN&nbsp;<b id="ogCount">' + (q.answersIn || 0) + "</b> / " + (isDec ? eligSeats.length : ogJoined().length) + "</span></div>" +
        '<div style="margin-top:14px"><button class="btn-gold" id="ogCallIt">CALL IT — NUMBERS IN</button></div>');
    } else {
      /* Design pass 6: the host screen NEVER cuts its own slabs —
         it is the room's shared display, and dimming the two wrong
         answers here would hand the spender's help to everyone
         watching. The cut lives on the spender's pad; this screen
         only announces it (see ogOnCut). A snapshot that already
         carries q.cut therefore paints whole slabs here too. */
      var btns = e.answers.map(function (t, i) {
        return '<button class="ans-btn" style="--d:' + (i * 0.09).toFixed(2) + 's" disabled><span class="letter">' + (i + 1) + "</span><span>" + esc(t) + "</span></button>";
      }).join("");
      stage(top + meta +
        '<div class="answers pop-in">' + btns + "</div>" +
        '<div><span class="og-count">ANSWERS IN&nbsp;<b id="ogCount">' + (q.answersIn || 0) + "</b> / " + ogJoined().length + "</span></div>" +
        '<div style="margin-top:12px"><button class="btn-gold" id="ogCallIt">CALL IT — CLOSE THE WINDOW</button></div>');
    }
    if (isDec && !e.deciderSaid) {
      /* the Decider's opening line is authored and local, like the
         table's — the first deal names the leaders, a re-deal after
         a dead-level call opens from the again pool */
      e.deciderSaid = true;
      var dNames = eligSeats.map(function (i) { return OG.players[i] ? OG.players[i].name : ""; }).filter(Boolean);
      hostSay(OG.decider && (OG.decider.used || []).length > 1 ? "decideragain" : "decider",
        { a: dNames[0] || "", b: dNames.slice(1).join(" and ") || "" });
    }
    else if (headline && !e.headlineSaid) { e.headlineSaid = true; hostSay("headline", { cat: e.cat }); }
    else if (!headline) hostSay(e.kind === "num" ? "numQ" : "read", { cat: e.cat });
    Snd.playSignature(e.cat);
    stSweep();
    var call = $("ogCallIt");
    if (call) call.addEventListener("click", function () { ogSend({ t: "reveal", qid: e.qid }); });
    clock.total = (q.windowMs || e.windowMs) / 1000; clock.left = clock.total; clock.running = true; Snd._lw = -1;
    drawClock();
  }
  function ogOnCut(m) {
    if (!OG || !OG.cur || m.qid !== OG.cur.qid) return;
    /* Design pass 6 — the host's half of the moment is ANNOUNCEMENT
       ONLY. The server's cut broadcast already reaches this screen
       the instant a pad spends (no protocol addition needed), but
       the screen must not cut its own slabs: it is the room's
       shared display, and the two wrong answers stay standing on
       it. What the room gets instead is the play made public — the
       banner, Sterling's line from the local cutmoment pool, the
       snip, his turn toward the seat, and the spender's desk tag
       flipping to CUT SPENT under a flash. The flip is applied to
       OG.players here so it paints now; the next state snapshot
       carries the same cutTwo=false and agrees. Snapshots and
       re-renders never re-fire any of this — ogOnState does not
       call here — so a reconnected host sees the spent tag settled
       and hears nothing twice. */
    var p = OG.players[m.bySeat];
    if (p) p.cutTwo = false;
    ogRenderSeats();
    seatCutFlash(m.bySeat);
    cutBanner(p ? p.name : "A player");
    hostSay("cutmoment", { name: p ? p.name : "A player" });
    Snd.play("snip");
    stPoint(m.bySeat);
  }
  function ogOnReveal(r, fromSnap) {
    if (!OG || !OG.cur) return;
    if (OG.lastRevealQid === r.qid && OG.phase === "reveal") return;
    OG.lastRevealQid = r.qid;
    OG.phase = "reveal"; stagePhase("reveal");
    clock.running = false;
    (r.scores || []).forEach(function (sc, i) { if (OG.players[i] && sc != null) OG.players[i].score = sc; });
    /* the Decider's verdict lands on OG.decider the moment its
       reveal does (live or resynced — the routing in ogAdvance
       reads only this): a seat, or null while it stays dead level */
    if (r.decider && OG.decider) OG.decider.winner = (r.deciderWinner != null ? r.deciderWinner : null);
    /* the last question's reveal settles the final standings — start
       the winner line's generation now, not at the finale screen
       (a decider reveal settles nothing yet: skip it) */
    if (OG.script && OG.idx === OG.script.length - 1 && !(OG.cur && OG.cur.decider)) winnerPrefetchAtReveal(winnerFactsFrom(OG.players));
    var e = OG.cur;
    /* New programme pass 2: the host's facts recorder reads the
       reveal payload itself — the banked figure per seat, the
       quick-draw seat — exactly the numbers the room paid. The
       qid guard is the whole safety story: a reveal whose facts
       were already saved is never counted twice, and a resynced
       reveal (fromSnap) whose facts never reached a save is
       counted exactly once, here. Decider reveals record nothing
       — no money moved in them. */
    if (!r.decider && OG.facts && !OG.facts.seen[r.qid]) {
      OG.facts.seen[r.qid] = 1;
      var ogGains = {};
      (r.results || []).forEach(function (res) { if (res.banked > 0) ogGains[res.seat] = res.banked; });
      noteFacts(OG.facts, e.round, ogGains, r.quickDrawSeat != null ? r.quickDrawSeat : -1, e.cat);
    }
    var winners = [];
    OG.revealState = {};
    (r.results || []).forEach(function (res) {
      /* a decider's spectators never played — they keep their faces */
      OG.revealState[res.seat] = (r.decider && r.eligible && r.eligible.indexOf(res.seat) < 0)
        ? "neutral" : (res.correct ? "cheer" : "slump");
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
      /* Design pass 3: the server already decided the quick-draw —
         banked carries the +50; the client only wears the tag and
         names the winner (ogRevealSay reads ogQdSeat). */
      if (res.quickDraw) { fx = fx || {}; fx.quickdraw = true; }
      /* Hot Streaks: the server settled the streaks too — banked
         already carries the flat +25; the seat wears the tag from
         the per-result record, and the reveal's one named moment
         rides the payload (captured just below). */
      if (res.streakBonus > 0) { fx = fx || {}; fx.streakBonus = res.streakBonus; }
      if (fx) fxSeats[res.seat] = fx;
    });
    ogStreakMoment = r.streakMoment || null;
    ogQdSeat = (r.quickDrawSeat != null) ? r.quickDrawSeat
      : ((r.results || []).find(function (res) { return res.quickDraw; }) || {}).seat;
    if (ogQdSeat == null) ogQdSeat = -1;
    ogFx = { qid: r.qid, seats: fxSeats };
    ogRenderSeats();
    var nextBtn = '<div style="margin-top:12px"><button class="btn-gold" id="ogNext">CONTINUE</button></div>';
    var headline = r.headline != null ? !!r.headline : isHeadline(e.round, e.qInRound);
    var head = '<div class="q-headrow"><span class="cat-pill">' + catEmblem(e.cat) + esc(e.cat.toUpperCase()) + '</span><span class="q-kind">' + (e.kind === "num" ? "THE NUMBER WAS" : "THE ANSWER") + "</span></div>" +
      '<div class="q-text' + (headline ? " headline-card" : "") + '" style="font-size:clamp(18px,3vw,25px)">' + esc(e.bank.q) + "</div>";
    if (e.kind === "num") {
      var tn = r.trueNum != null ? r.trueNum : e.trueNum;
      if (r.decider) {
        /* the Decider's reveal: the truth, the verdict, and a local
           line — the generic num painting would announce banked
           money that never moved */
        var dWin = (r.deciderWinner != null && OG.players[r.deciderWinner]) ? OG.players[r.deciderWinner] : null;
        stage(head + '<div class="wager-amt">' + Number(tn).toLocaleString("en-US") + "</div>" +
          '<div class="q-for">' + (dWin
            ? esc(dWin.name) + " called it closest — the crown is decided."
            : "Dead level — the closest calls are identical. The Decider goes again.") + "</div>" +
          whySlip(e.bank.why, fromSnap, null) + nextBtn);
        if (dWin) hostSay("deciderhit", { name: dWin.name });
        else hostSay("deciderlevel");
      } else {
        stage(head + '<div class="wager-amt">' + Number(tn).toLocaleString("en-US") + "</div>" +
          (anyBank ? "" : '<div class="delta"><span class="down">Nobody got close. The number keeps its dignity.</span></div>') +
          whySlip(e.bank.why, fromSnap, headline ? "HEADLINE ×2" : null) + nextBtn);
        ogRevealSay(winners.length ? "numHit" : "numMiss", { name: winners.length && OG.players[winners[0]] ? OG.players[winners[0]].name : "" }, winners);
      }
    } else {
      var ci = r.correctIdx != null ? r.correctIdx : e.correctIdx;
      var btns = e.answers.map(function (t, i) {
        return '<button class="ans-btn' + (i === ci ? " correct" : " dim") + '" disabled><span class="letter">' + (i + 1) + "</span><span>" + esc(t) + "</span></button>";
      }).join("");
      stage(head + '<div class="answers">' + btns + "</div>" +
        (anyBank ? "" : '<div class="delta"><span class="down">No one had it. The money stays in Sterling\'s pocket — this time.</span></div>') +
        whySlip(e.bank.why, fromSnap, headline ? "HEADLINE ×2" : null) + nextBtn);
      var joined = ogJoined().length;
      var hk = winners.length === 0 ? "allMiss" : (winners.length === joined ? "allHit" : "someHit");
      ogRevealSay(hk, { name: winners.length && OG.players[winners[0]] ? OG.players[winners[0]].name : "" }, winners);
    }
    Snd.play(winners.length ? "correct" : "wrong");
    /* Visual stage 5: lit first beat, as at the table — a snapshot
       resync (fromSnap) repaints it settled, slip already printed */
    revealTheatre(fromSnap);
    /* Pass P: lean-in, the nod for a fat bank, coins to the winners */
    stClass("st-lean", 1000);
    /* Visual stage 2: point at the first seat that actually BANKED
       (a correct-but-unpaid seat is not the story; an all-miss
       reveal fires nothing) */
    var ogBankers = (r.results || []).filter(function (res) { return res.banked > 0; }).map(function (res) { return res.seat; });
    if (ogBankers.length) stPoint(ogBankers[0]);
    /* a decider banks nobody, but its winner still earns the point */
    if (r.decider && r.deciderWinner != null) stPoint(r.deciderWinner);
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
    ogSaveHostShow(); /* every advance re-pins the saved plan's position */
    if (OG.idx >= OG.script.length) {
      /* the script is spent. A resolved decider goes to the finale;
         a dead-level one deals another; a FRESH tie at the top
         opens the Decider; anything else is the finale the show
         always had */
      if (OG.decider) {
        if (OG.decider.winner != null) { ogFinish(); return; }
        ogDealAnotherDecider();
        return;
      }
      var tied = ogTopTied();
      if (tied.length > 1) { ogStartDecider(tied); return; }
      ogFinish(); return;
    }
    var e = OG.script[OG.idx];
    if (e.round !== OG.curRound) { ogIntermission(e.round); return; }
    ogServe();
  }
  function ogBreakSeats() {
    var out = [];
    OG.players.forEach(function (p, i) { if (p) out.push({ seat: i, name: p.name, score: p.score, cut: !!p.cutTwo }); });
    return out;
  }
  /* ================= New programme pass 2 — the Intermission (online) =================
     The host rests the room between rounds: it tells the server
     the phase and the round that follows (the one protocol
     addition of this pass — a pad cannot otherwise tell a break
     from the host still reading a reveal, and its card must
     survive a refresh), then paints the same story card the table
     shows, composed from the facts ogOnReveal recorded. BEGIN is
     the host's alone: the pads rest on their break cards through
     the round intro and move when the next question lands, as
     they always have. */
  function ogIntermission(nextRound) {
    OG.phase = "intermission"; stagePhase("intermission");
    seatsVisible(false);
    ogSend({ t: "intermission", nextRound: nextRound });
    $("roundLabel").textContent = { 2: "ROUND 2 · DOUBLE MONEY", 3: "ROUND 3 · THE BIG FINISH" }[nextRound] || "";
    $("qCounter").textContent = "THE INTERMISSION";
    ogPaintIntermission(nextRound);
    ogSaveHostShow();
  }
  function ogPaintIntermission(nextRound) {
    var view = breakView(ogBreakSeats(), OG.facts, nextRound - 1);
    stage(breakCardHTML(view, "ogBreakGo"));
    $("hostLine").textContent = view.recap;
    var b = $("ogBreakGo");
    if (b) b.addEventListener("click", function () { ogIntro(); });
  }
  /* Design pass 4: an online show's id for the record guard — the
     room code plus the script's first qid. A new room is a new code;
     a rejoined host driving the same show holds the same script, so
     a finale reached twice still records once. */
  function ogShowId() {
    if (!OG) return null;
    var q = (OG.script && OG.script.length && OG.script[0]) ? OG.script[0].qid : null;
    return "og-" + OG.code + "-" + (q || "show");
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
    OG.phase = "over"; stagePhase("over");
    ogClearHostSave(); /* the show ended — its save retires with it */
    clock.running = false;
    seatsVisible(false);
    var idxs = [];
    OG.players.forEach(function (p, i) { if (p) idxs.push(i); });
    if (!idxs.length) { ogTeardown(); showScreen("scr-title"); return; }
    var best = Math.max.apply(null, idxs.map(function (i) { return OG.players[i].score; }));
    var tied = idxs.filter(function (i) { return OG.players[i].score === best; });
    /* the Decider's winner outranks the tied scores it was frozen
       beside: when it resolved, its seat IS the champion and the
       show records a win, not a draw */
    var decWin = (OG.decider && OG.decider.winner != null && OG.players[OG.decider.winner]) ? OG.decider.winner : null;
    var winSeat = decWin != null ? decWin : tied[0], p = OG.players[winSeat];
    /* Design pass 4: the host screen keeps the record for the room
       it hosted (the pads record nothing) — same guard, same rules
       as the table: a drawn show crowns nobody */
    var prevChampO = loadRecords().champion;
    var hasWinner = decWin != null || tied.length === 1;
    recordShow(ogShowId(), idxs.map(function (ii) { return { name: OG.players[ii].name, avatar: snapAvatar(OG.players[ii], ii), score: OG.players[ii].score }; }), hasWinner ? winSeat : -1);
    /* Programme pass 4 — Rematch Night: the night advances at the
       same guarded moment, on the finale's own verdict — a crown
       the Decider chose is the series point, exactly as at the
       table (one definition of the winner, reused) */
    var sAdvO = advanceSeries(ogShowId(), OG.seriesCtx, hasWinner ? recNameKey(p.name) : null);
    var sNightWonO = !!(sAdvO && sAdvO.nightWon);
    var sFinaleLineO = composeSeriesFinale(sAdvO, OG.seriesCtx, sNightWonO, p.name);
    var titleSubO = champSubline(prevChampO, hasWinner ? recNameKey(p.name) : null, loadRecords().champion);
    var ogStand = idxs.map(function (ii) { return { name: OG.players[ii].name, score: OG.players[ii].score }; })
      .sort(function (a, b) { return b.score - a.score; });
    if (sNightWonO) sayWinnerAuthored(authoredLine("winnernight", { name: p.name }));
    else sayWinner({ winner: p.name, standings: ogStand, topScore: best }, authoredLine(decWin != null ? "deciderwin" : "winner", { name: p.name }),
      function () { return !!OG && OG.phase === "over"; });
    var order = idxs.slice().sort(function (a, b) { return OG.players[b].score - OG.players[a].score; });
    var ranks = {}; order.forEach(function (pi, pos) { ranks[pi] = pos; });
    var disp = order.slice();
    if (disp.length > 1) { var t = disp[0]; disp[0] = disp[1]; disp[1] = t; }
    var pods = disp.map(function (ii) {
      var pp = OG.players[ii], pos = ranks[ii];
      var badgeCls = pos === 1 ? "silver" : pos === 2 ? "bronze" : "plain";
      var top = ii === winSeat
        ? ""
        : '<span class="rank-badge ' + badgeCls + '">' + (pos + 1) + "</span>";
      return '<div class="podium pod' + ii + " big rank" + (pos + 1) + (ii === winSeat ? " winner-podium lit" : "") + '">' + top + (ii === winSeat ? laurelBadge() : "") +
        avatarSVG(snapAvatar(pp, ii), ii === winSeat ? "cheer" : "neutral", ii) +
        '<div class="desk"><div class="pname">' + esc(pp.name) + '</div><div class="pmoney">' + money(pp.score) + "</div>" +
        (ii === winSeat && decWin != null ? '<div class="decider-marker">★ WON THE DECIDER</div>' : "") + "</div></div>";
    }).join("");
    var tieNote = "";
    if (decWin == null && tied.length > 1) {
      var names = tied.map(function (ii) { return OG.players[ii].name; }).join(" and ");
      tieNote = '<p class="round-text tie-note">Dead level at the top — ' + esc(names) + " matched at " + money(best) +
        ". The crown goes to the earliest seat, and the rematch is now legally mandatory.</p>";
    }
    stage('<div class="finale-wrap' + (sFinaleLineO ? " has-series" : "") + '"><div class="spot-cone" aria-hidden="true"></div><div class="finale-main">' +
      '<div class="marquee finale-marquee"><div class="kicker">THE GILDED HOUR · FINAL RESULT</div>' +
      '<div class="winner-word">WINNER</div>' +
      '<div class="winner-name">' + esc(p.name) + '<span class="champ-tag">★ CHAMPION</span></div>' +
      '<div class="winner-total">' + money(p.score) + "</div>" +
      (titleSubO ? '<div class="winner-sub">' + titleSubO + "</div>" : "") +
      (sFinaleLineO ? '<div class="winner-sub series-line' + (sNightWonO ? " night-won" : "") + '">' + esc(sFinaleLineO) + "</div>" : "") +
      '<span class="gold-seal" aria-hidden="true"><svg class="wheel-emblem emblem-seal" viewBox="0 0 120 120"><use href="#emblem"></use></svg></span></div>' +
      '<div class="sterling-zone"><div class="bubble bubble-finale">Sealed with a kiss of confetti — the hour is yours, ' + esc(p.name) + ".</div>" +
      sterlingSVG("present", "sterling sterling-lg") + "</div></div>" +
      tieNote +
      '<div class="podium-row finale-row">' + pods + "</div>" +
      '<div class="finale-btns"><button class="btn-gold" id="ogAgain">REMATCH</button>' +
      '<button class="btn-ghost" id="ogLobby">BACK TO LOBBY</button></div></div>');
    Snd.play("finale");
    startLeaves();
    buildBulbs(document.querySelector(".finale-marquee"));
    finaleCeremony();
    $("ogAgain").addEventListener("click", function () { ogRematch(); });
    $("ogLobby").addEventListener("click", function () { stopLeaves(); ogTeardown(); showScreen("scr-title"); });
  }
  /* Programme pass 4 — the online rematch. The room stays
     together: the host asks the referee for a new show in the
     SAME room ({t:'new_show'} — this pass's one room-level
     addition; the server resets its per-show state and advances
     the room's show counter), and this screen deals a fresh show
     over the same seats. Nobody rejoins and nobody re-enters a
     code: the pads learn from their snapshots that the room is at
     a new show and flow on with it. With fewer than two players
     still CONNECTED there is no table to rematch with — the room
     still resets (its phase must leave 'ended' before the lobby
     can run another show at all), and the host returns to the
     room's own lobby with Sterling's explanation, to gather
     whoever is coming. */
  function ogRematch() {
    if (!OG || OG.phase !== "over") return;
    stopLeaves();
    ogSend({ t: "new_show" });
    var connected = OG.players.filter(function (p) { return p && p.connected; });
    if (connected.length < 2) {
      OG.started = false; OG.script = null; OG.decider = null;
      OG.seriesCtx = null; OG.seriesLine = null;
      ogLobbyNote = authoredLine("scattered");
      ogShowLobby();
      ogSaveHostShow(); /* the save now describes a lobby, not a finale */
      return;
    }
    ogBeginShow();
  }
  $("btnCreateRoom").addEventListener("click", function () { Snd.ensure(); ogCreate(); });
  $("btnRejoinRoom").addEventListener("click", function () {
    var sv = ogSavedHost();
    if (sv) { Snd.ensure(); ogJoinRoom(sv.code, sv.hostToken, sv); }
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
    WakeLock.sync(); /* joined a room (waiting + playing): stay awake */
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
    WakeLock.sync(); /* left the room: release the screen */
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
      if (c) {
        var q = JP.snap.question;
        var denom = (q && q.decider) ? (q.eligible || []).length : JP.snap.players.filter(Boolean).length;
        c.textContent = (m.answersIn || 0) + " / " + denom + " IN";
      }
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
      /* the Decider owns its word on every pad it touches */
      if (q.decider && (q.eligible || []).indexOf(JP.seat) < 0) return "THE DECIDER";
      var answered = q.kind === "num"
        ? (s.yourNum != null || (JP.sentNum && JP.sentNum.qid === q.qid))
        : s.yourPick != null;
      if (answered) return "LOCKED IN";
      return q.kind === "num" ? "YOUR NUMBER" : "ANSWER";
    }
    if (s.phase === "intermission") return "THE INTERMISSION";
    if (s.phase === "reveal") return (s.lastReveal && s.lastReveal.decider) ? "THE DECIDER" : "THE VERDICT";
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
    if (s.phase === "lobby" || s.phase === "bet" || s.phase === "ended" || s.phase === "intermission") $("scr-join").classList.remove("cat-on");
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
        /* Rematch Night: the room's show counter (the snapshot's
           showSeq, advanced only by the host's new_show) tells this
           pad the lobby it is sitting in belongs to a later show —
           the rematch beat, with no rejoin and no code to re-enter */
        (s.showSeq >= 2 ? '<div class="jp-rematch">★ REMATCH — SHOW ' + s.showSeq + '<span>THE TABLE STAYS TOGETHER</span></div>' : "") +
        '<p class="jp-sub">Watch the big screen — when a question lands,<br>this pad becomes your answer buttons.</p>' +
        (chips ? '<div class="jp-players">' + chips + "</div>" : "") +
        '<button class="btn-ghost jp-leave" id="jpLeave">LEAVE ROOM</button></div>';
    } else if (s.phase === "bet") {
      var effBet = s.yourBet != null ? s.yourBet : (JP.sentBet && s.bet && JP.sentBet.qid === s.bet.qid ? JP.sentBet.chips : null);
      var betCap = s.bet && Number.isInteger(s.bet.yourCap) ? Math.max(1, Math.min(5, s.bet.yourCap)) : 3;
      var cur = effBet != null ? effBet : JP.betSel;
      JP.betSel = Math.max(1, Math.min(betCap, cur || 1));
      main.innerHTML = '<div class="jp-pad">' + jpIdBar(false) +
        '<div class="jp-betmid"><div class="jp-betlabel">THE BIG FINISH · YOUR BET</div>' +
        (betCap > 3 ? '<div class="jp-longshot">LONG SHOT · RIDE UP TO ' + betCap + ' CHIPS</div>' : "") +
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
          stack.classList.toggle("many", JP.betSel >= 4);
        }
        if (amt) amt.textContent = JP.betSel + (JP.betSel === 1 ? " CHIP" : " CHIPS") + " · " + money(JP.betSel * 100);
      };
      paintBet();
      $("jpBetMinus").addEventListener("click", function () { JP.betSel = Math.max(1, JP.betSel - 1); paintBet(); });
      $("jpBetPlus").addEventListener("click", function () { JP.betSel = Math.min(betCap, JP.betSel + 1); paintBet(); });
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
        (d.q.headline ? '<div class="jp-headline">★ HEADLINE QUESTION — DOUBLE MONEY · HALF CLOCK</div>' : "") +
        (d.q.decider ? '<div class="jp-headline decider">★ THE DECIDER — CLOSEST NUMBER TAKES THE CROWN</div>' : "") +
        '<div class="jp-qline"><span class="jp-catemb">' + catEmblem(d.bank.cat) + '</span><span>' + esc(d.bank.q) + "</span></div>";
      /* Hot Streaks: your own run, live on the pad from two straight
         — at two, one more pays; at three-plus, every bank pays.
         Read off the snapshot's per-player streak. Guess questions
         are neutral, so the line rides those pads too (the run is
         simply waiting); the Decider's pad never shows it. */
      if (me && (me.streak || 0) >= 2 && !(d.q.kind === "num" && d.q.decider)) {
        padTop += '<div class="jp-streakline">' + (me.streak === 2
          ? "TWO STRAIGHT — ONE MORE PAYS +$25"
          : "STREAK ×" + me.streak + " — EVERY BANK PAYS +$25") + "</div>";
      }
      if (d.q.kind === "num" && d.q.decider && (d.q.eligible || []).indexOf(JP.seat) < 0) {
        /* the spectator's pad: a watch screen, not a dead one — the
           pairing, the stakes, and the count as the numbers land.
           No input exists here, and the server would refuse one */
        var vsNames = (d.q.eligible || []).map(function (i) { return s.players[i] ? esc(s.players[i].name) : ""; }).filter(Boolean).join(" vs ");
        main.innerHTML = '<div class="jp-card"><div class="jp-phaseword" id="jpPhaseWord">THE DECIDER</div>' +
          '<div class="jp-hi">★ THE DECIDER</div>' +
          '<div class="jp-decider-vs">' + vsNames + "</div>" +
          '<p class="jp-sub">Dead level at the top — closest number takes the crown.<br>You\'re watching this one: it is settled between them.</p>' +
          '<div class="jp-numstate"><span id="jpCount">' + (d.q.answersIn || 0) + " / " + (d.q.eligible || []).length + " IN</span></div></div>";
      } else if (d.q.kind === "num") {
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
          return '<button class="jp-ans' + (s.yourPick === i ? " sel" : "") + (cutIdx.indexOf(i) >= 0 ? " cut" : "") + '" data-pick="' + i + '"><span class="jp-numb">' + (i + 1) + '</span><span class="jp-ans-tx">' + esc(t) + '</span><span class="jp-ans-tag">✓ YOUR PICK</span></button>';
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
        if (cb) cb.addEventListener("click", function () { Snd.ensure(); JP._cutSentQid = d.q.qid; jpSend({ t: "cuttwo", qid: d.q.qid }); });
        /* Design pass 6: the spender's pad plays the moment when its
           own cut lands — the two slabs shear under the fresh-cut
           animation and the snip sounds. It is keyed to THIS pad's
           tap this session (_cutSentQid), so a repaint, a later
           snapshot or a rejoined pad paints the cut settled and
           never replays the slash. Other pads wear the settled cut
           class from the same render, without the animation. */
        if (d.q.cut && d.q.cut.bySeat === JP.seat && JP._cutSentQid === d.q.qid && JP._cutMomentQid !== d.q.qid) {
          JP._cutMomentQid = d.q.qid;
          main.querySelectorAll(".jp-ans.cut").forEach(function (b) { b.classList.add("cutfresh"); });
          Snd.play("snip");
        }
      }
    } else if (s.phase === "intermission") {
      /* New programme pass 2: the pad's own break card — its score
         and place, its gap to the leader, its Cut Two, and the
         next round's one-line promise, every number derived from
         the snapshot this pad already holds (the pass's server
         addition is only the phase and the round that follows).
         The pad cannot advance the show; it rests here until the
         host brings the next round, and a refresh lands it right
         back on this card. */
      var nx = (s.intermination && s.intermination.nextRound) || (s.question ? s.question.round + 1 : 2);
      var seated = s.players.filter(Boolean);
      var myScore = me ? me.score : 0;
      var myPlace = 1 + seated.filter(function (p) { return p.score > myScore; }).length;
      var leadP = jpLeader();
      var gapLine = "";
      if (leadP && leadP.seat === JP.seat) {
        var rest = seated.filter(function (p) { return p.seat !== JP.seat; });
        var top2 = rest.length ? Math.max.apply(null, rest.map(function (p) { return p.score; })) : null;
        gapLine = (top2 != null && top2 === myScore) ? "Dead level at the top — the crown is anybody's."
          : "You lead" + (top2 != null ? " by " + money(myScore - top2) : "") + ".";
      } else if (leadP) {
        gapLine = money(leadP.score - myScore) + " behind " + esc(leadP.name) + " — the lead is theirs, for now.";
      }
      var placeWord = ["", "1ST", "2ND", "3RD", "4TH"][myPlace] || (myPlace + "TH");
      main.innerHTML = '<div class="jp-card"><div class="jp-phaseword" id="jpPhaseWord">THE INTERMISSION</div>' +
        '<div class="jp-hi">YOU\'RE ' + placeWord + " · " + money(myScore) + "</div>" +
        (gapLine ? '<p class="jp-sub">' + gapLine + "</p>" : "") +
        '<p class="jp-sub">' + (me && me.cutTwo ? "Your Cut Two is still in your pocket — one blade, unspent." : "Your Cut Two is spent — no more scissors this show.") + "</p>" +
        '<p class="jp-sub">' + (nx === 3
          ? "Next: <b>the Big Finish</b> — three questions, chips committed in the open."
          : "Next: <b>Round 2 · Double Money</b> — every value doubles, and the ★ Headline Question closes the round.") + "</p>" +
        '<p class="jp-sub">Sterling is taking a breath — the show resumes from the big screen.</p></div>';
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
      if (lr.decider) {
        /* the Decider's verdict card: no money moved, so the generic
           verdict (with its gain line) would lie — the crown is the
           whole content here */
        var dWinner = lr.deciderWinner != null ? s.players[lr.deciderWinner] : null;
        var dAns = "The number was <b>" + Number(lr.trueNum).toLocaleString("en-US") + "</b>" + (mine && mine.num != null ? " — you said " + mine.num : "");
        if (lr.deciderWinner === JP.seat) {
          main.innerHTML = '<div class="jp-verdict"><div class="jp-phaseword" id="jpPhaseWord">THE DECIDER</div><div class="jp-vdisc">★</div>' +
            '<div class="jp-vword">YOU TAKE THE CROWN!</div>' +
            '<p class="jp-vans">' + dAns + " — the closest call of the night, with the whole show riding on it.</p>" + scoreLine + "</div>";
        } else if (dWinner) {
          main.innerHTML = '<div class="jp-verdict miss"><div class="jp-phaseword" id="jpPhaseWord">THE DECIDER</div><div class="jp-vdisc">★</div>' +
            '<div class="jp-vword">' + esc(dWinner.name).toUpperCase() + " TAKES THE DECIDER</div>" +
            '<p class="jp-vans">' + dAns + ". The crown is settled — eyes on the big screen for the crowning.</p>" + scoreLine + "</div>";
        } else {
          main.innerHTML = '<div class="jp-verdict miss"><div class="jp-phaseword" id="jpPhaseWord">THE DECIDER</div><div class="jp-vdisc">=</div>' +
            '<div class="jp-vword">DEAD LEVEL — IT GOES AGAIN</div>' +
            '<p class="jp-vans">' + dAns + ". Identical closest calls — another decider question is coming.</p>" + scoreLine + "</div>";
        }
      } else if (mine && mine.correct) {
        main.innerHTML = '<div class="jp-verdict"><div class="jp-phaseword" id="jpPhaseWord">THE VERDICT</div><div class="jp-vdisc">✓</div>' +
          '<div class="jp-vword">' + (lr.kind === "num" ? "CLOSEST!" : "YOU GOT IT!") + "</div>" +
          '<div class="jp-gain">' + mplus(mine.banked) + "</div>" +
          /* Design pass 3: the winner's own pad wears the tag too —
             the banked figure above already includes the $50. */
          (mine.quickDraw ? '<div class="jp-qdtag">QUICK DRAW +$50 · FIRST IN, AND RIGHT</div>' : "") +
          /* Hot Streaks: the bonus wears its own tag under the
             banked figure above, which already includes it */
          (mine.streakBonus > 0 ? '<div class="jp-qdtag streak">STREAK +$25 · ×' + (mine.streak || 0) + " AND COUNTING</div>" : "") +
          '<p class="jp-vans">' + ansLine + "</p>" + scoreLine + "</div>";
      } else {
        main.innerHTML = '<div class="jp-verdict miss"><div class="jp-phaseword" id="jpPhaseWord">THE VERDICT</div><div class="jp-vdisc">✗</div>' +
          '<div class="jp-vword">' + (mine && (mine.pick != null || mine.num != null) ? "NOT THAT ONE" : "NO ANSWER") + "</div>" +
          '<p class="jp-vans">' + ansLine + ". Nothing lost — nobody can lose money here.</p>" + scoreLine + "</div>";
      }
      if (!lr.decider && mine && mine.correct) jpBankPulse(me ? me.score : 0, mine.banked || 0);
    } else if (s.phase === "ended") {
      /* a decider-decided show still reads tied on points — the
         ended screen names the champion the decider chose, which
         the last reveal (and the ended broadcast) both carry */
      var decChamp = (s.lastReveal && s.lastReveal.decider && s.lastReveal.deciderWinner != null)
        ? s.players[s.lastReveal.deciderWinner] : null;
      var lead2 = decChamp || jpLeader();
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
    if (cnt) cnt.textContent = (q.answersIn || 0) + " / " + (q.decider ? (q.eligible || []).length : JP.snap.players.filter(Boolean).length) + " IN";
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
  paintTableResume(); /* improvement 4: offer an unfinished show, if one is saved */
  paintChampion(); /* Design pass 4: the defending champion's plaque, if this device has crowned one */

  /* ---------- test hooks ---------- */
  window.__game = {
    get G() { return G; }, get clock() { return clock; }, get Snd() { return Snd; },
    startShow: startShow, BANK: BANK, HOST: HOST, CAT_LINES: CAT_LINES, drawRevealLine: drawRevealLine, resetLineBags: resetLineBags
  };
  /* Pass P verification hooks: particle censuses for the polish fx */
  window.__fx = { leaves: leaves, coins: coins, motes: motes, laurelState: laurelState };
  window.__online = {
    get OG() { return OG; }, get JP() { return JP; },
    WORKER_URL: WORKER_URL
  };
})();
