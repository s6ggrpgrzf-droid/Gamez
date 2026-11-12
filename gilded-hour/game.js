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
  /* The Golden Question (The Ten, pass 4): exactly one question per
     show is secretly GOLDEN and pays double under the Headline's
     grammar, revealed only at its own reveal. It hides in Rounds
     1-2 only — the eleven slots below, overall questions 1-11,
     EXCLUDING Q12 ("2:5"), the Headline's own seat: the two
     doubles never stack. Round 3 is excluded by arithmetic
     honesty: the Big Finish pays bet x $100, not question value,
     so gold there would double nothing — a golden Round 3 question
     would be a lie. The Decider is never golden (it banks nothing
     either, and its curs are built outside makeCur besides). The
     pick is drawn from the show's seeded rng at show start; at
     the table it rides the show save (a resume never re-rolls it,
     and no pre-reveal render reads it), online the host marks its
     publish with a hidden field the room keeps off every snapshot
     until the reveal, exactly like the answer. */
  var GOLDEN_SLOTS = ["1:0", "1:1", "1:2", "1:3", "1:4", "1:5", "2:0", "2:1", "2:2", "2:3", "2:4"];
  function drawGoldenSlot() { return GOLDEN_SLOTS[ri(GOLDEN_SLOTS.length)]; }
  function isGoldenSlot(round, qInRound) { return !!G && G.goldenSlot === (round + ":" + qInRound); }
  function validGoldenSlot(s) { return typeof s === "string" && GOLDEN_SLOTS.indexOf(s) >= 0; }

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
    /* Show the Band (The Ten, pass 3): when the dealt question is a
       Deep Cut, Sterling's intro beat says so — this pool REPLACES
       the read / numQ intro on band-3 questions only (never the
       Headline's line, never the Decider's), drawn locally through
       hostSay like every intro: no worker round-trip, no AI latch
       anywhere near it. */
    deepcut: [
      "This one's a deep cut, table — {cat}, from the shelves only the devotees dust.",
      "A deep cut from {cat}. If you know it, you know it in your bones; if you don't — bluff like you do.",
      "From the deep end of {cat}, table. The casual fans just sat up a little straighter. Nervously.",
      "Deep cut, this — and {cat} keeps its secrets well. Somewhere out there is exactly one cousin who knows it cold. Be that cousin."
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
    /* Dynamics pass D2 — Second Wind: spoken at the break, only
       when the break actually granted one ({name} is the granted
       trailer, joined when the cellar is shared). The line is
       drawn once, at the moment of the grant, and carried with
       the break's state, so a resumed break repeats the same
       words — and a break that grants nothing stays silent. */
    wind: [
      "Second wind for {name} — the scissors come back. The house looks after its trailers.",
      "A kindness from the cellar: {name} takes the Cut Two back. Last place has its privileges.",
      "{name} sits last, so the house returns the blade — a second wind, and a second chance to spend it well."
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
    /* The Golden Question (The Ten, pass 4): the tease is spoken
       ONCE per show, at the Round 1 intro — the EXISTENCE is
       public from the first minute; the position never is. The
       line is drawn at show start and rides the save / host plan,
       so a resumed intro re-presents the same words. */
    goldtease: [
      "One house secret before we start, table: somewhere in the first two rounds, one question is golden. It pays double. I know which one. You don't.",
      "A confidence before the wheel turns: one question in the first two rounds tonight is worth double. Which one? That's my secret, and I keep it beautifully.",
      "House rules, one addition: a golden question hides somewhere in the first two rounds. Double money when it lands, no warning when it comes. It could be any of them. It is exactly one of them.",
      "Listen once, because I say this once: hiding in the first two rounds is a golden question — double pay, in plain sight. I know where it's buried. Dig carefully."
    ],
    /* ...and the reveal moment. Like the quick-draw call-out, a
       golden reveal speaks THIS pool instead of the generic beat
       and never consumes the AI beat latches; unlike it, the
       golden moment yields to a named streak moment (the streak
       arbitration was settled first, in its own pass). */
    golden: [
      "GOLDEN! There it is, table — that question was gold all along, and it pays DOUBLE.",
      "The gilt comes off: that was the Golden Question. Double money, exactly as secretly promised.",
      "Gold, table! Did you feel the clock hurry? That was why. The Golden Question — double, for everyone who had it.",
      "And THAT was the golden one. Hidden in plain sight, paid in double. Sterling keeps his secrets — and his promises."
    ],
    /* Dynamics pass D1 — the Table Pot. Three beats, all named
       moments in the reveal arbitration's grammar (an authored
       pool replaces the generic beat and never consumes the AI
       beat latches): potfirst is the night's first feed, potgrand
       is a feed that carries the pot past a thousand, potfinale
       is the award line printed at the crowning. {amount} is the
       pot's total after the beat. */
    potfirst: [
      "And that, table, is the pot's first feeding — {amount} sits in the brass, waiting for whoever takes the night.",
      "Nobody banked it, so the pot keeps it: {amount}. The champion takes every cent of it at the end.",
      "Into the pot it goes — {amount}. Unclaimed money doesn't leave this table; it just changes its plans."
    ],
    potgrand: [
      "The pot passes a thousand — {amount} in the brass, and growing teeth. Somebody's evening just got heavier.",
      "A thousand and beyond: the pot stands at {amount}. The misses are building somebody a very good night.",
      "Look at it grow — {amount} in the pot. Every question this room fails is a deposit in the champion's name."
    ],
    potfinale: [
      "And the pot — {amount} that this table left behind — goes to the champion with the crown.",
      "Plus the pot: {amount} in unclaimed money, every dollar of it earned by other people's misses.",
      "The brass is emptied into the winner's hands — {amount} from the pot, on top of everything."
    ],
    /* Pass N1 — The Report Card. report is the plain introduction
       printed over the finale's card; reportbig is drawn instead
       when the champion's biggest bank is the night's largest, and
       names only that recorded fact ({name}, {amount}) — Sterling
       reads the same card the table does, and invents nothing. */
    report: [
      "And now the part of the evening where I read your numbers back to you — the report card, table.",
      "Every show leaves its marks. Here is what the night recorded, exactly as it happened.",
      "Sterling keeps books, and tonight's are unusually well kept. The report card, for the record."
    ],
    reportbig: [
      "The report card holds one number I cannot let pass quietly: {name}'s biggest bank of the night — {amount}, in a single question.",
      "Read the card by all means — but note {name}'s {amount} bank. The night's largest single haul, and a beauty.",
      "One figure on that card deserves its own applause: {name} banked {amount} on one question — the biggest bank of the night."
    ],
    /* A3 review, proposal 2 (Jimmy's pick, 2026-11-11): when the
       night was settled by the decider, the report card's line
       says so — the podium's marker knew, and the card is the
       keepsake. Outranks reportbig in reportSayFor: the bank
       still stands as a fact on the champion's own row, but the
       decider is how the night ended. Facts only: a decider
       exists, it was one question, {name} took it. */
    reportdecider: [
      "It came down to one question — the decider — and {name} took it. The card below is the night's record; that was its final word.",
      "Fifteen questions could not separate this table. One more could — the decider — and {name} held their nerve.",
      "The night ended the way nights should: level, tense, one question for everything. {name} answered it. The report card follows."
    ],
    /* Pass N2 — House Rules. When the night plays under toggles
       the host chose at setup, Sterling names them once, at the
       Round 1 intro, appended to whichever line owns the bubble
       (the tease's own grammar). {rules} is the prose list of
       what is in force — facts only, composed by rulesProseText
       from the show's own record. The line is drawn once at show
       start and rides the save / the host plan, so a resumed show
       re-presents the identical words. */
    rules: [
      "House rules tonight, table: {rules}. Your call, your table — Sterling merely keeps the books.",
      "One note before the money moves: tonight we play with {rules}. Everything else is the Gilded Hour exactly as it ever was.",
      "The house has agreed to the table's terms: {rules}. I shall pretend they were my idea. We begin."
    ],
    /* The Ten, pass 5 — House Players. house is the solo show's
       Round 1 introduction: the arrangement is named honestly,
       with the two cast names drawn in ({a}, {b}); the line is
       drawn at show start and rides the save like the golden
       tease, so a resumed intro re-presents the same words.
       housewin is the finale's line when a house player takes the
       show — spoken authored-only (sayWinnerAuthored), because the
       worker's winner line knows nothing of the house. */
    house: [
      "One chair is yours; the other two belong to the house. {a} and {b} play for Sterling's side tonight — they answer, they bet, they can take the night. Beat them and it is truly yours.",
      "Playing alone? Not at this table. The house sends two of its own — {a} and {b} — to keep the contest honest. They play by every rule you do, and they play to win.",
      "A solo show, with company: {a} and {b} are house players. They think fast, bet their own chips, and spend their own Cut Two. Take the night from them if you can."
    ],
    housewin: [
      "The house takes it — {name} played a beautiful show, and the table applauds its own. The record books stay with the guests; the glory, tonight, stays in the family.",
      "{name} for the house! Somewhere, Sterling is smiling into his sleeve. Your crown waits for another night — and it will keep."
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
  /* Visual pass V1 — Sterling in planes: the flat figure is rebuilt
     as drawn planes inside the same footprint and poses. The cast
     shadow pools at his feet; the torso rides the body plane; the
     head (ears, face, hair — and the face variant, painted last
     inside the head plane exactly as it painted last before) rides
     the head plane; each arm keeps its own gesture group (.st-arm —
     geometry and timing untouched) inside a plane wrapper. Every
     plane carries a painted rim: a silhouette copy offset toward
     the light (upper-left, the cel shading's own light) wearing
     .st-rim, which style.css fills with the live category's colour
     — brass when no category is live. The pose classes the rig
     already fires translate the planes a few pixels with a hair of
     stagger (style.css): arm leads, head follows, body settles,
     the shadow drifts opposite. No pose changes shape — only
     depth. The title figure and the host-face bust in index.html
     wear the same groups, so every Sterling stands in planes. */
  var STERLING_DEFS =
    '<defs><radialGradient id="stShadGrad" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0" stop-color="#000" stop-opacity=".5"/>' +
    '<stop offset=".55" stop-color="#000" stop-opacity=".26"/>' +
    '<stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>';
  var STERLING_SHADOW =
    '<g class="st-shadow"><ellipse cx="150" cy="372" rx="122" ry="11" fill="url(#stShadGrad)"/></g>';
  var STERLING_TORSO =
    '<g class="st-rim" transform="translate(-2.5,-2)"><path d="M52,380 L64,258 Q68,206 128,196 L192,196 Q252,206 256,258 L268,380 Z"/></g>' +
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
    '<rect x="146" y="184" width="28" height="13" fill="#D97F4A"/>';
  var STERLING_HEADART =
    '<g class="st-rim" transform="translate(-2.5,-2)"><ellipse cx="160" cy="118" rx="64" ry="70"/><path d="M97,128 C90,84 96,40 128,26 C150,17 186,18 208,34 C226,48 232,84 223,128 C220,104 212,86 200,78 C192,84 184,84 176,72 C168,60 150,58 136,64 C118,70 104,92 97,128 Z"/></g>' +
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
    '<g class="st-plane st-plane-arm-l"><g class="st-arm st-arm-l"><path class="st-rim-stroke" transform="translate(-2,-2)" d="M84,218 C60,238 54,262 70,282 C82,296 100,296 120,291" stroke-width="29"/><path d="M84,218 C60,238 54,262 70,282 C82,296 100,296 120,291" stroke="#4E2C68" stroke-width="29" stroke-linecap="round" fill="none"/><circle cx="104" cy="293" r="10" fill="#FFF6E8"/><circle cx="122" cy="290" r="13" fill="#F6B183"/></g></g>' +
    '<g class="st-plane st-plane-arm-r"><g class="st-arm st-arm-r"><path class="st-rim-stroke" transform="translate(-2,-2)" d="M236,218 C260,238 266,262 250,282 C238,296 220,296 200,291" stroke-width="29"/><path d="M236,218 C260,238 266,262 250,282 C238,296 220,296 200,291" stroke="#4E2C68" stroke-width="29" stroke-linecap="round" fill="none"/><circle cx="216" cy="293" r="10" fill="#FFF6E8"/><circle cx="198" cy="290" r="13" fill="#F6B183"/></g></g>';
  function sterlingSVG(variant, cls) {
    var face = variant === "present" ? STERLING_FACE_PRESENT : STERLING_FACE_SMIRK;
    var inner = STERLING_DEFS + STERLING_SHADOW +
      '<g class="st-plane st-plane-body">' + STERLING_TORSO + "</g>" +
      STERLING_PODIUM + STERLING_ARMS +
      '<g class="st-plane st-plane-head">' + STERLING_HEADART + face + "</g>";
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
  } else if (state === "wince") {
    /* Visual pass V2 — WINCE: the flinch. Brows pressed down toward
       the nose, eyes squeezed into tight slants (never the slump's
       droopy arcs), lips flat-pressed into one straight line with
       hooked ends. Identity untouched: same hair, same face, only
       the expression layer moves. */
    s += avBrow(A, 49, { y: 32.5, arch: 0, th: 3.4, dL: -2, dR: 3.5 }) +
      avBrow(A, 71, { y: 32.5, arch: 0, th: 3.4, dL: 3.5, dR: -2 });
    s += '<path d="M41.5,43 L56.5,48.5" stroke="#2A1530" stroke-width="3.4" stroke-linecap="round" fill="none"/>' +
      '<path d="M78.5,43 L63.5,48.5" stroke="#2A1530" stroke-width="3.4" stroke-linecap="round" fill="none"/>' +
      '<path d="M43,50.5 L52,53" stroke="#2A1530" stroke-width="2" stroke-linecap="round" fill="none" opacity=".65"/>' +
      '<path d="M77,50.5 L68,53" stroke="#2A1530" stroke-width="2" stroke-linecap="round" fill="none" opacity=".65"/>';
    if (!A.stache) s += '<path d="M47,66 L47,63.5 L73,63.5 L73,66" stroke="' + A.mouth + '" stroke-width="3.2" stroke-linecap="round" fill="none"/>';
  } else if (state === "keen") {
    /* Visual pass V2 — KEEN: the focused face of a live streak.
       Brows level and low, eyes open but narrowed to a determined
       squint-lite (the neutral eye grammar, pulled in), the nose
       kept (the eyes are open, so the face keeps its full set), and
       the mouth set firm — a near-flat line with one corner risen. */
    s += avBrow(A, 49, { y: 36, arch: 0.6, th: 3.4 }) +
      avBrow(A, 71, { y: 36, arch: 0.6, th: 3.4 });
    var ko = { ry: 3.6, ir: 3.8, pu: 2.9 };
    if (A.bigEyes) ko = { rx: 7.4, ry: 3.9, ir: 4.6, pu: 3.2, sw: 1.5 };
    else if (A.lid) ko = { ry: 3.4, lid: true };
    else if (A.squint) ko = { rx: 6.4, ry: 3.1, ir: 3.6, pu: 2.8 };
    else if (id === 3) ko = { rx: 6.2, ry: 3.6, ir: 3.7, pu: 2.8 };
    else if (id === 7) ko = { rx: 7, ry: 4, ir: 4.1, pu: 3 };
    s += avEye(A, 49, ko) + avEye(A, 71, ko);
    if (A.stache) s += '<path d="M61.5,49 L59.8,53.8 Q59.5,55.6 61.2,55.6 Q62.8,55.6 63.4,54.6" stroke="' + dk(A.neck, .85) + '" stroke-width="1.8" stroke-linecap="round" fill="none"/>';
    else if (A.bigEyes) s += '<path d="M60.8,49.5 L59.5,53.5 Q59.2,55.2 60.8,55.2 Q62.2,55.2 62.8,54.2" stroke="' + dk(A.neck, .85) + '" stroke-width="1.7" stroke-linecap="round" fill="none"/>';
    else s += '<path d="M61.5,49.5 L59.2,56.8 Q58.8,59.2 61.2,59.2 Q63.4,59.2 64.2,57.8" stroke="' + dk(A.neck, .85) + '" stroke-width="1.8" stroke-linecap="round" fill="none"/>';
    if (!A.stache) s += '<path d="M49,63.5 Q60,64.8 71,61.8" stroke="' + A.mouth + '" stroke-width="3" stroke-linecap="round" fill="none"/>';
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
    /* The Ten, pass 1 — the wheel's two voices. The runner calls
       wheelTick on every segment boundary that passes the needle, so
       the tick rate IS the wheel's angular velocity (dense at speed,
       sparse in the settle) with no scheduling table to drift. The
       counters are the drive's ears: they count SCHEDULED ticks and
       clunks whether or not an audio context is live to voice them;
       gh_mute silences the sound exactly like every other voice. */
    _wheelTicks: 0, _wheelClunks: 0,
    wheelTick: function (vel) {
      this._wheelTicks++;
      if (this.muted || !this.ctx || this.ctx.state !== "running") return;
      try { this.burst(0.018, 0.05 + 0.13 * Math.max(0, Math.min(1, vel || 0)), 2900, 0, 3.2); } catch (e) {}
    },
    wheelClunk: function () {
      this._wheelClunks++;
      if (this.muted || !this.ctx || this.ctx.state !== "running") return;
      try { this.burst(0.07, 0.22, 420, 0, 1.1); this.tone(96, 0.13, "sine", 0.26, 0, 64); } catch (e) {}
    },
    /* The Ten, pass 2 — the dial's ratchet. The runners call
       dialTick as the needle climbs (frac = progress along the
       rail, or the odometer's fraction of the truth) and the pitch
       climbs with it — a ratchet that rises, never a fixed click
       track. A pin pass is struck harder than a travel tick. The
       counter is the drive's ear, on the wheel counters' terms:
       it counts SCHEDULED ticks whether or not audio is live;
       gh_mute silences the sound like every other voice. The
       landing itself is the wheel's clunk, reused whole. */
    _dialTicks: 0,
    dialTick: function (frac, strong) {
      this._dialTicks++;
      if (this.muted || !this.ctx || this.ctx.state !== "running") return;
      var f = Math.max(0, Math.min(1, frac || 0));
      try { this.burst(strong ? 0.03 : 0.016, strong ? 0.2 : 0.08, 1500 + 1500 * f, 0, strong ? 2.4 : 3.2); } catch (e) {}
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
        /* The Ten, pass 7: a landing coin — two soft sine partials,
           a coin kissing the stack. Deliberately quiet: a full
           flight lands nine of these, and punctuation must never
           become a performance (the signatures' own rule) */
        else if (kind === "coin") { this.tone(2093.0, 0.05, "sine", 0.09, 0); this.tone(2960.0, 0.08, "sine", 0.045, 0.012); }
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
  function stagePhase(p) { var g = $("scr-game"); if (g) g.setAttribute("data-phase", p); if (p !== "reveal" && p !== "over") setMood(""); }
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
    /* The Golden Question (pass 4): the banked figure is the
       drained DOUBLE, but the live display shows the un-doubled
       drain — a golden question must not price itself at double
       on the shared screen before its reveal. The drain still
       runs on the halved clock, so the room feels a brisk
       question; it learns why only when the gilt lands. */
    var dispBase = G.cur.golden ? G.cur.value / 2 : G.cur.value;
    var v = earned(dispBase, G.cur.elapsed, G.cur.clockTotal || QTIME);
    if (v !== lastShownValue) {
      lastShownValue = v;
      vEl.textContent = money(v);
      var wrap = vEl.closest ? vEl.closest(".q-value") : vEl.parentElement;
      if (wrap) {
        wrap.classList.toggle("low", v <= dispBase * 0.6);
        wrap.classList.remove("bump"); void wrap.offsetWidth; wrap.classList.add("bump");
      }
    }
  }
  /* ---------- Gameplay-visuals pass G1 — THE MELTING VALUE ----------
     The draining value gains a gauge: a slim vessel beside the
     numeral, filled with molten gold. The fill maps the value's LIVE
     multiplier — the very fraction earned() banks by, read off the
     same elapsed/clockTotal the one clock already keeps. This is a
     gauge on the existing clock, never a second one: it owns no
     timers and no state; the painters below only read the question's
     own figures and set a transform.

     Marks engraved on the glass, as fractions of the vessel height:
     the FLOOR line at 0.50 — the multiplier's floor, where every
     melt stops dead, the vessel's lower half below it an empty base;
     the FULL line at 0.86; and a 2x tick at the brim. A plain
     question fills to FULL and melts to the FLOOR. A doubled
     question (the Headline — its double is public) starts up at the
     2x tick and melts at its doubled rate, its clock being halved,
     to the SAME floor fraction: the floor line never moves. The
     Golden Question keeps pass 4's mask in the glass too — its
     numeral prints the un-doubled drain, so its vessel fills to
     FULL like any other; only the briskness of its melt (the halved
     clock again) hints at anything, and the double is still learned
     at the reveal, never from the gauge. The pad renders no draining
     value at all (its clock is a bar of time, its price lives on the
     shared screen), so the vessel rides the two screens that print
     the price: the table card and the online host card. */
  var MELT_FLOOR = 0.5, MELT_FULL = 0.86, MELT_2X = 1.0;
  function meltFrac(mult, doubled) {
    var s = Math.max(0, Math.min(1, (mult - 0.5) / 0.5));
    return MELT_FLOOR + ((doubled ? MELT_2X : MELT_FULL) - MELT_FLOOR) * s;
  }
  function meltMult(elapsed, total) { return 0.5 + 0.5 * speedFrac(elapsed, total); }
  function meltCool(mult) { return 0.38 * (1 - Math.max(0, Math.min(1, (mult - 0.5) / 0.5))); }
  /* the vessel's markup, painted at the question's true level in the
     HTML string itself — a repaint (resume, resync, a Cut Two
     re-stage) is born at the right level, no animation, no catch-up */
  function meltHTML(doubled, mult) {
    var f = meltFrac(mult, doubled);
    return '<div class="melt' + (doubled ? " dbl" : "") + '" aria-hidden="true"><div class="melt-glass">' +
      '<div class="melt-fill" style="transform:translateY(' + ((1 - f) * 100).toFixed(2) + '%)">' +
      '<div class="melt-cool" style="opacity:' + meltCool(mult).toFixed(3) + '"></div><div class="melt-men"></div></div>' +
      '<i class="melt-mark mk-floor"></i><i class="melt-mark mk-full"></i><i class="melt-mark mk-2x"></i>' +
      "</div></div>";
  }
  /* the tick painters: one cached element set, re-found whenever a
     stage repaint swaps the DOM out from under it. Transform and
     opacity only, per-frame allocation nil, and a write is skipped
     until the level has moved by a visible step */
  var meltCache = { fill: null, cool: null, f: -1, c: -1 };
  function meltPaint(mult, doubled) {
    var fill = meltCache.fill;
    if (!fill || !fill.isConnected) {
      fill = document.querySelector(".melt-fill");
      meltCache.fill = fill;
      meltCache.cool = fill ? fill.querySelector(".melt-cool") : null;
      meltCache.f = -1; meltCache.c = -1;
    }
    if (!fill) return;
    var f = meltFrac(mult, doubled);
    if (Math.abs(f - meltCache.f) > 0.0004) {
      meltCache.f = f;
      fill.style.transform = "translateY(" + ((1 - f) * 100).toFixed(2) + "%)";
    }
    var cool = meltCool(mult);
    if (meltCache.cool && Math.abs(cool - meltCache.c) > 0.004) {
      meltCache.c = cool;
      meltCache.cool.style.opacity = cool.toFixed(3);
    }
  }
  /* the table tick: rides beside drawValue() in the one rAF loop */
  function drawMelt() {
    if (!G || !G.cur) return;
    var mult = meltMult(G.cur.elapsed, G.cur.clockTotal || QTIME);
    /* V3: the card's gilt thins on the same multiplier — but only
       while the question phase stands; later beats (the mark
       screen's frozen card, the reveal's rested one) keep exactly
       the dress their own render gave them. A Big Finish card
       carries value 0 by construction (its money is the wager —
       no vessel, nothing to melt), yet its gilt still thins on
       its own clock: the card's time melts even when its money
       doesn't. The Decider abstains entirely, as its vessel does */
    if (G.cur.betRound) {
      if (G.phase === "question") giltPaint(mult);
      return;
    }
    if (G.cur.value <= 0) return;
    meltPaint(mult, !!G.cur.headline);
    if (G.phase === "question") giltPaint(mult);
  }
  /* ---------- Gameplay-visuals pass G7 — THE CLOCK AS LIGHT ----------
     The stage's rim of warm light is the clock: wide and soft at the
     window's open, contracting toward the card and deepening in amber
     as the window closes, so the closing is felt at the edge of
     vision before it is read off the ring. The mapping is the clock's
     own remaining fraction — the table reads clock.left/clock.total
     on the same rAF loop the melt rides; the online host feeds its
     window fraction (rimFeed, from ogTick's answer branch, the very
     rem/windowMs its numeral drains by) — so the light can never
     disagree with the drain or the melt beside the value. No new
     timers: drawClockLight rides the existing loop; the host's feed
     rides its existing 100ms tick and goes stale in a third of a
     second, whereupon the rim eases home. While a window is live the
     displayed fraction IS the true fraction (a repaint — resume,
     resync — is born at the true light, no sweep); when the question
     closes the rim eases back to its wide rest pose under the
     reveal's own footlight warmth, and the CSS keeps it only for the
     question's life (question + reveal phases). Paint is one custom
     property on change, past an epsilon — the layers cross-fade and
     contract on it by opacity/transform alone. */
  var rimEl = null, rimF = 1, rimPainted = -1;
  var rimOG = { frac: 1, stamp: 0 };
  function rimFeed(frac) { rimOG.frac = Math.max(0, Math.min(1, frac || 0)); rimOG.stamp = Date.now(); }
  function drawClockLight(dt) {
    var live = false, f = 1;
    if (clock.running && G && G.cur && clock.total > 0) { live = true; f = clock.left / clock.total; }
    else if (OG && OG.phase === "answer" && (Date.now() - rimOG.stamp) < 350) { live = true; f = rimOG.frac; }
    if (live) rimF = Math.max(0, Math.min(1, f));
    else if (rimF < 1) {
      rimF += (1 - rimF) * Math.min(1, dt * 5);
      if (1 - rimF < 0.004) rimF = 1;
    }
    if (Math.abs(rimF - rimPainted) > 0.0015) {
      if (!rimEl || !rimEl.isConnected) rimEl = document.querySelector(".set-rim");
      if (rimEl) { rimEl.style.setProperty("--rim-f", rimF.toFixed(4)); rimPainted = rimF; }
    }
  }
  /* ---------- Visual pass V3 — THE CARD AS AN OBJECT ----------
     The question card gains material life, in three drawn
     treatments (the CSS half lives with the golden frame's rules):
     THE GILT EDGE thins and dims as the value drains, on the melt's
     own s — giltS(mult) is the very s meltFrac maps from, so card,
     vessel and rim light can never tell different times. It is
     painted two ways, like the melt: born inline at the true level
     in each render's HTML (a repaint — resume, resync, the mark
     screen — is dressed exactly as the live card was), and ticked
     by giltPaint from the two places meltPaint already ticks from.
     The tick is gated on the live question (the table's question
     phase; the host's answer phase is ogTick's own gate), so it
     never re-drains a card a later beat dressed for itself — the
     mark screen's frozen gilt, the reveal's rested one.
     THE WEARING CORNERS are the round's state — cardWear() maps
     Round 1 crisp, Round 2 softened, Round 3 (and the Decider,
     the night's most-handled card) worn — set as a class at every
     card render, repaints identical.
     THE WAX SEAL exists only in a Golden Question's reveal render,
     appended by sealHTML from the unmasked record alone. During
     the question a golden card is built by the same helpers with
     the same inputs (its gilt rides its own halved clock exactly
     as its melt does — briskness is the only hint, and it was
     already the melt's), so nothing about the card names it. */
  function giltS(mult) { return Math.max(0, Math.min(1, (mult - 0.5) / 0.5)); }
  function cardWear(round, decider) { return (decider || round >= 3) ? 3 : (round === 2 ? 2 : 1); }
  function wearCls(round, decider) { var w = cardWear(round, decider); return w === 3 ? " wear3" : (w === 2 ? " wear2" : ""); }
  /* the card's two dressing children, born at the given multiplier's
     gilt level (mult 1 = the resting, full edge) */
  function cardDressHTML(mult) {
    return '<i class="card-gilt" style="--gilt-f:' + giltS(mult).toFixed(4) + '" aria-hidden="true"></i><i class="card-wear" aria-hidden="true"></i>';
  }
  /* the seal: golden reveals only; `settled` repaints wear it
     already landed, in the house rule for repaint theatre */
  function sealHTML(golden, settled) {
    return golden ? '<i class="wax-seal' + (settled ? " set" : "") + '" aria-hidden="true"></i>' : "";
  }
  var giltCache = { el: null, f: -1 };
  function giltPaint(mult) {
    var el = giltCache.el;
    if (!el || !el.isConnected) {
      el = document.querySelector("#stage .q-text .card-gilt");
      giltCache.el = el;
      giltCache.f = -1;
    }
    if (!el) return;
    var s = giltS(mult);
    if (Math.abs(s - giltCache.f) > 0.004) {
      giltCache.f = s;
      el.style.setProperty("--gilt-f", s.toFixed(4));
    }
  }
  /* ---------- Gameplay-visuals pass G2 — STAKES CALLOUTS ----------
     A ribbon under the question's header, computed ONCE at the
     question's open from the standings as they stand, and worn
     until the reveal: FOR THE LEAD when a seat that does not lead
     could pass the leader by banking this question's full award;
     FOR THE NIGHT in the Big Finish while the crown is still
     reachable. It is a snapshot, never a live wire — the value may
     drain and the clock may run, the ribbon neither flickers nor
     retracts mid-question, and a repaint (resume, resync, a Cut
     Two re-stage) recomputes it from the same open-time inputs
     (scores move only at reveals; the award is the question's full
     figure), so it repaints identical. Silence is the default: a
     question that decides nothing wears nothing, and early in a
     show almost every question decides nothing.

     One pure helper decides, both engines and every pad consult
     it: stakeCallout(ctx) -> null | {kind:"lead"|"night", seat}.
     ctx = { scores:[per-seat, null = no seat], round, award,
             bigFinish, decider, remaining:[per-seat] }.
     - decider: always null — its stake is self-evident.
     - lead (Rounds 1-2): the award is the question's full PUBLIC
       figure at open — the Headline's double included (it is
       public), a masked Golden's NEVER (the doubling is secret
       until its reveal; pricing a callout at the doubled figure
       would leak the gold, so call sites pass the masked figure
       exactly as the card prints it). A chaser must STRICTLY pass
       the leader; seats at the lead (joint leaders included)
       already lead and are never chasers — at 0-0-0 everybody
       leads, so the first question of a show is always silent.
     - night (the Big Finish): remaining[seat] is the most that
       seat can still bank from this question onward, this
       question's bet counted at its Long Shot cap like every
       question after it. The crown is live while some chaser can
       at least REACH the leader (a reach forces the Decider — the
       night is still decided tonight); beyond reach, null.
     - the seat is named only when exactly ONE seat carries the
       stake; several carriers wear the general ribbon.
     Sterling never speaks these and no sound attends them — the
     ribbon is the voice. */
  function stakeCallout(ctx) {
    if (!ctx || ctx.decider) return null;
    var scores = ctx.scores || [], lead = null, i, s;
    for (i = 0; i < scores.length; i++) {
      s = scores[i];
      if (typeof s !== "number") continue;
      if (lead === null || s > lead) lead = s;
    }
    if (lead === null) return null;
    var holders = [];
    if (ctx.bigFinish) {
      var rem = ctx.remaining || [];
      for (i = 0; i < scores.length; i++) {
        s = scores[i];
        if (typeof s !== "number" || s >= lead) continue;
        if (s + (rem[i] || 0) >= lead) holders.push(i);
      }
      if (!holders.length) return null;
      return { kind: "night", seat: holders.length === 1 ? holders[0] : null };
    }
    var award = ctx.award || 0;
    if (!(award > 0)) return null;
    for (i = 0; i < scores.length; i++) {
      s = scores[i];
      if (typeof s !== "number" || s >= lead) continue;
      if (s + award > lead) holders.push(i);
    }
    if (!holders.length) return null;
    return { kind: "lead", seat: holders.length === 1 ? holders[0] : null };
  }
  function stakeLabel(stake, players) {
    var label = stake.kind === "night" ? "FOR THE NIGHT" : "FOR THE LEAD";
    if (stake.seat != null && players && players[stake.seat] && players[stake.seat].name)
      label += " — " + esc(String(players[stake.seat].name).toUpperCase());
    return label;
  }
  /* the big screens: a zero-height overlay pinned across the card's
     top edge, in the headline banner's own grammar — it takes no
     layout height, so no measured fit moves */
  function stakeRibbonHTML(stake, players) {
    if (!stake) return "";
    return '<div class="stake-ribbon ' + stake.kind + '"><span>' + stakeLabel(stake, players) + "</span></div>";
  }
  /* the pads: an in-flow line in the pad's own grammar */
  function stakePadHTML(stake, players) {
    if (!stake) return "";
    return '<div class="jp-stakeribbon ' + stake.kind + '">' + stakeLabel(stake, players) + "</div>";
  }
  /* the table's context: scores as they stand, the award exactly
     as the card prints it (a golden question at its masked,
     un-doubled figure), the Big Finish's remaining money counted
     at each seat's Long Shot cap */
  function tableStakeCtx() {
    var scores = G.players.map(function (p) { return p.score; });
    if (G.round === 3) {
      var left = R3_COUNT - G.qInRound;
      return { scores: scores, round: 3, bigFinish: true, decider: !!G.cur.decider,
        remaining: G.players.map(function (_, i) { return left * tableBetCap(i) * 100; }) };
    }
    return { scores: scores, round: G.round, award: G.cur.golden ? G.cur.value / 2 : G.cur.value, decider: !!G.cur.decider };
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
  /* Designer's pass P16: Sterling's standing expression. The
     greeting face is the absence of a mood class; the reveal
     painters set delight (the moment landed for someone) or
     sorry (it landed for no one), the finales set delight, and
     stagePhase clears back to the greeting for every other
     phase — so a mood never outlives the beat that earned it. */
  function setMood(m) {
    var g = $("scr-game"); if (!g) return;
    g.classList.toggle("st-mood-delight", m === "delight");
    g.classList.toggle("st-mood-sorry", m === "sorry");
  }
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
  /* The Golden Question (pass 4): the reveal's gilt wrap — the
     question card (already wearing its .golden-card frame) is
     wrapped so the banner rides it in the Headline banner's
     grammar. Called ONLY by the reveal painters: the question
     phase never wraps, never banners, never gilds — that absence
     is the secrecy the mechanic runs on. */
  function goldenCardHTML(qTextDiv, golden) {
    if (!golden) return qTextDiv;
    return '<div class="q-cardwrap"><div class="headline-banner golden-banner">★ GOLDEN QUESTION — DOUBLE</div>' + qTextDiv + "</div>";
  }
  /* the why-slip tag for a doubled reveal: the Headline's name,
     or the Golden's — the two never share a question (the golden
     slot list excludes the Headline's seat), so the order here is
     only a formality */
  function doubleTag(headline, golden) {
    return headline ? "HEADLINE ×2" : (golden ? "Golden — doubled." : null);
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
  /* The Ten, pass 7 — Money That Flies: a flight's size is a pure
     function of the seat's TOTAL award for that reveal (the base
     bank + the flat quick-draw and streak bonuses, or the Big
     Finish bet figure). The band edges sit on doubling boundaries
     (90 / 180 / 360 / 720), so a Golden-doubled award always
     out-flies its undoubled twin; $0 — an all-miss reveal, the
     Decider — flies nothing at all. */
  function coinsForAward(amt) {
    amt = Math.floor(amt) || 0;
    if (amt <= 0) return 0;
    if (amt <= 90) return 3;
    if (amt <= 180) return 4;
    if (amt <= 360) return 6;
    if (amt <= 720) return 8;
    return 9;
  }
  /* a landing tick, throttled: coins landing inside the same
     breath share one kiss of sound instead of a machine-gun row */
  var lastCoinTickAt = 0;
  function coinLandTick() {
    var now = performance.now();
    if (now - lastCoinTickAt < 45) return;
    lastCoinTickAt = now;
    Snd.play("coin");
  }
  /* every coin down, NOW: the host advancing mid-flight (or any
     screen change) leaves no orphans drifting over the next card */
  function clearCoins() {
    for (var i = 0; i < coins.parts.length; i++) { coins.parts[i].on = false; coins.parts[i].flight = null; }
    coins.busy = false;
    var cv = coins.cv || $("coinCanvas");
    if (cv) cv.classList.remove("on");
    if (coins.cx && coins.cv) coins.cx.clearRect(0, 0, coins.cv.width, coins.cv.height);
  }
  /* one stepper for both coin pools (the host's flights and the
     pad's hop): same arc, same painted coin — a soft shadow riding
     the landing plane and tightening as the coin falls to it, and
     a slight swell at mid-flight. Transforms and canvas paint
     only; the pools are fixed, so a frame allocates nothing. */
  function stepCoinPool(pool, radius, dt) {
    if (!pool.busy) return;
    var cx = pool.cx, cv = pool.cv;
    if (!cx || !cv) { pool.busy = false; return; }
    var dpr = pool.dpr;
    cx.clearRect(0, 0, cv.width, cv.height);
    var anyOn = false;
    for (var i = 0; i < pool.parts.length; i++) {
      var p = pool.parts[i];
      if (!p.on) continue;
      anyOn = true;
      if (p.delay > 0) { p.delay -= dt; continue; }
      if (p.t < 1) {
        p.t = Math.min(1, p.t + dt / p.dur);
        if (p.t >= 1) {
          coinLandTick();
          if (p.flight) {
            var fl = p.flight; p.flight = null; fl.left--;
            if (fl.left <= 0 && fl.onArrive) { var cb = fl.onArrive; fl.onArrive = null; cb(); }
          }
        }
      } else {
        p.linger -= dt;
        if (p.linger <= 0) { p.on = false; continue; }
      }
      var t = p.t, u = 1 - t;
      var px = u * u * p.x0 + 2 * u * t * p.cx + t * t * p.x1;
      var py = u * u * p.y0 + 2 * u * t * p.cy + t * t * p.y1;
      var alt = (p.y1 - py) / 130; if (alt < 0) alt = 0; if (alt > 1) alt = 1;
      var sr = radius * (1 - 0.45 * alt) * dpr;
      cx.save();
      cx.globalAlpha = 0.30 * (1 - 0.5 * alt);
      cx.translate(px * dpr, p.y1 * dpr); cx.scale(1, 0.34);
      cx.beginPath(); cx.arc(0, 0, sr, 0, 6.2832); cx.fillStyle = "#140722"; cx.fill();
      cx.restore();
      var sq = Math.abs(Math.cos(p.spin + t * 9));
      var r = radius * (1 + 0.22 * Math.sin(3.14159 * t)) * dpr;
      cx.save(); cx.translate(px * dpr, py * dpr); cx.scale(Math.max(0.18, sq), 1);
      cx.beginPath(); cx.arc(0, 0, r, 0, 6.2832);
      cx.fillStyle = "#D9930D"; cx.fill();
      cx.beginPath(); cx.arc(0, 0, r * 0.8, 0, 6.2832);
      cx.fillStyle = "#FFC93C"; cx.fill();
      cx.beginPath(); cx.arc(-r * 0.19, -r * 0.19, r * 0.4, 0, 6.2832);
      cx.fillStyle = "#FFE29A"; cx.fill();
      cx.restore();
    }
    if (!anyOn) { pool.busy = false; cv.classList.remove("on"); cx.clearRect(0, 0, cv.width, cv.height); }
  }
  function stepCoins(dt) { stepCoinPool(coins, 8.5, dt); }
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
     seat's score shimmers as the count-up runs. Pass 7 sizes the
     flight by the award (coinsForAward) — a caller with no figure
     keeps the old flat nine, and a $0 award flies nothing. */
  function bankFx(seatIdx, delayBase, award) {
    var n = award == null ? 9 : coinsForAward(award);
    if (!n) return;
    var from = document.querySelector(".ans-btn.correct") || document.querySelector(".wager-amt") || document.querySelector(".dial") || document.querySelector("#stage .delta");
    var seat = document.querySelector('.seat[data-seat="' + seatIdx + '"]');
    if (!seat) return;
    var toEl = seat.querySelector(".seat-score") || seat;
    var tr = toEl.getBoundingClientRect();
    var tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
    var fx = tx, fy = ty - 140;
    if (from) { var fr = from.getBoundingClientRect(); fx = fr.left + fr.width / 2; fy = fr.top + fr.height / 2; }
    coinFlight(fx, fy, tx, ty, n, delayBase || 0, function () {
      var s2 = document.querySelector('.seat[data-seat="' + seatIdx + '"]');
      if (!s2) return;
      s2.classList.remove("banking"); void s2.offsetWidth; s2.classList.add("banking");
      setTimeout(function () { s2.classList.remove("banking"); }, 950);
    });
  }

  /* ---- Dynamics pass D1: the pot's vessel ----
     A brass pot stands at the front of the stage from the first
     question, wearing its running total. It is a child of #stage
     appended AFTER the screen's own paint (stage() replaces the
     stage's innerHTML, so paintPot re-raises it on every paint and
     a vessel born on any settled screen is born settled: a resync
     or a resume repaints the brass exactly as it stands, with no
     flight and no tick owed). Which engine's pot it wears follows
     the screen: the table's G, or the online host's OG with its
     room-mirrored total. At the finale it stands down — the award
     line in the marquee carries the pot from there. */
  var potDisp = 0, potDispTimer = null, potFeedPending = 0;
  function potState() {
    if (typeof OG !== "undefined" && OG) {
      if (!OG.started) return null;
      return { pot: OG.pot || 0, over: OG.phase === "over" };
    }
    if (G) return { pot: G.pot || 0, over: G.phase === "over" };
    return null;
  }
  function ensurePotVessel() {
    var st = $("stage"); if (!st) return null;
    var ps = potState();
    var v = st.querySelector(".pot-vessel");
    if (!ps || ps.over) { if (v) v.remove(); return null; }
    if (!v) {
      v = document.createElement("div");
      v.className = "pot-vessel";
      v.setAttribute("aria-hidden", "true");
      v.innerHTML = '<div class="pot-rim"></div><div class="pot-body"><span class="pot-shine"></span></div>' +
        '<div class="pot-label">THE POT</div><div class="pot-total">$0</div>';
      st.appendChild(v);
      /* born settled at the truth, minus a feed whose flight is
         still owed (a live reveal paints the vessel BEFORE its
         coins fly, so the total can tick up as they land) */
      potDisp = Math.max(0, ps.pot - (potFeedPending || 0));
    }
    return v;
  }
  function paintPot() {
    var v = ensurePotVessel(); if (!v) return;
    var t = v.querySelector(".pot-total");
    if (t) t.textContent = money(Math.round(potDisp));
  }
  /* a feed is a flight whose target is the pot (Money That Flies'
     own machinery and banding): the coins arc from the answer into
     the brass, and as they land the vessel's total ticks up to the
     settled figure and the pot takes a small fed glow. Fired ONLY
     by the live reveal paths — never by a render — so a repaint,
     a resume or a resync shows the pot standing, never feeding. */
  function potFeedFx(fed) {
    if (!(fed > 0)) return;
    potFeedPending = 0;
    var v = ensurePotVessel(); if (!v) return;
    var vr = v.getBoundingClientRect();
    if (!vr.width) { potDisp = (potState() || { pot: potDisp }).pot; paintPot(); return; }
    var from = document.querySelector(".ans-btn.correct") || document.querySelector(".wager-amt") || document.querySelector(".dial") || document.querySelector("#stage .delta");
    var tx = vr.left + vr.width / 2, ty = vr.top + vr.height * 0.28;
    var fx = tx, fy = ty - 140;
    if (from) { var fr = from.getBoundingClientRect(); fx = fr.left + fr.width / 2; fy = fr.top + fr.height / 2; }
    var fromDisp = potDisp;
    var target = (potState() || { pot: fromDisp + fed }).pot;
    coinFlight(fx, fy, tx, ty, coinsForAward(fed), 0, function () {
      if (potDispTimer) clearInterval(potDispTimer);
      var t0 = Date.now();
      potDispTimer = setInterval(function () {
        var f = Math.min(1, (Date.now() - t0) / 450);
        potDisp = fromDisp + (target - fromDisp) * f;
        paintPot();
        if (f >= 1) { clearInterval(potDispTimer); potDispTimer = null; }
      }, 40);
      var v2 = ensurePotVessel();
      if (v2) {
        v2.classList.remove("fed"); void v2.offsetWidth; v2.classList.add("fed");
        setTimeout(function () { v2.classList.remove("fed"); }, 950);
      }
    });
  }

  /* ---- the pad's hop (pass 7): the same drawn coin, a shorter
     arc, on the pad's own small pool. The host's coin canvas lives
     inside the game screen and sleeps while a pad is up, so the
     join screen grows a twin canvas of its own; the stepper, the
     arc and the painted coin are shared (stepCoinPool). The hop
     fires once per banked verdict, keyed like the bank pulse, so
     a snapshot re-render never re-fires it — and any pad render
     that leaves the reveal clears it, so no coin outlives its
     card. Flights are presentation only: the pad's score line
     already carries the settled figure the room sent. ---- */
  var JP_COINS = 12;
  var jpCoins = { parts: [], cv: null, cx: null, dpr: 1, busy: false };
  (function () {
    for (var i = 0; i < JP_COINS; i++) jpCoins.parts.push({ on: false, t: 0, dur: 0, delay: 0, linger: 0, x0: 0, y0: 0, cx: 0, cy: 0, x1: 0, y1: 0, spin: 0, flight: null });
  })();
  function jpCoinCanvas() {
    var cv = $("jpCoinCanvas");
    if (!cv) {
      var g = $("scr-join"); if (!g) return null;
      cv = document.createElement("canvas"); cv.id = "jpCoinCanvas"; cv.setAttribute("aria-hidden", "true");
      g.appendChild(cv);
    }
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.floor(window.innerWidth * dpr), h = Math.floor(window.innerHeight * dpr);
    if (jpCoins.cv !== cv || cv.width !== w || cv.height !== h) {
      cv.width = w; cv.height = h; jpCoins.cv = cv; jpCoins.cx = cv.getContext("2d"); jpCoins.dpr = dpr;
    }
    return cv;
  }
  function jpClearCoins() {
    for (var i = 0; i < jpCoins.parts.length; i++) { jpCoins.parts[i].on = false; jpCoins.parts[i].flight = null; }
    jpCoins.busy = false;
    if (jpCoins.cv) jpCoins.cv.classList.remove("on");
    if (jpCoins.cx && jpCoins.cv) jpCoins.cx.clearRect(0, 0, jpCoins.cv.width, jpCoins.cv.height);
  }
  function jpCoinHop(award) {
    var n = Math.min(coinsForAward(award), 5);
    if (!n) return;
    var to = document.querySelector("#jpMain .jp-vscore");
    if (!to) return;
    var cv = jpCoinCanvas(); if (!cv) return;
    var from = document.querySelector("#jpMain .jp-gain") || document.querySelector("#jpMain .jp-vdisc");
    var tr = to.getBoundingClientRect();
    var tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
    var fx = tx, fy = ty - 120;
    if (from) { var fr = from.getBoundingClientRect(); fx = fr.left + fr.width / 2; fy = fr.top + fr.height / 2; }
    cv.classList.add("on"); jpCoins.busy = true;
    var spawned = 0;
    for (var i = 0; i < jpCoins.parts.length && spawned < n; i++) {
      var p = jpCoins.parts[i];
      if (p.on) continue;
      p.on = true; p.t = 0; p.linger = 0.12; p.flight = null;
      p.dur = 0.5 + Math.random() * 0.1;
      p.delay = spawned * 0.05;
      p.x0 = fx + (Math.random() - 0.5) * 18; p.y0 = fy + (Math.random() - 0.5) * 8;
      p.x1 = tx; p.y1 = ty;
      p.cx = (p.x0 + tx) / 2 + (Math.random() - 0.5) * 16;
      p.cy = Math.min(p.y0, ty) - 44 - Math.random() * 22;
      p.spin = Math.random() * 6.28;
      spawned++;
    }
    if (!spawned) { jpCoins.busy = false; cv.classList.remove("on"); }
  }
  function jpCoinHopOnce(lr, mine) {
    var key = (lr.qid || "") + "|" + (mine.banked || 0);
    if (JP._hopKey === key) return;
    JP._hopKey = key;
    jpCoinHop(mine.banked || 0);
  }
  function stepJpCoins(dt) { stepCoinPool(jpCoins, 6.5, dt); }

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

  /* ================= Pass N2 — HOUSE RULES =================
     Three toggles the host sets at setup, bending only numbers
     that already exist: LONGER CLOCK (every question window
     x1.5, applied where windows are born), SECOND CUT (two Cut
     Two tokens a seat instead of one — the token becomes a
     count), CALM TABLE (the hurry layer stands down: no danger
     vignette, no footlight pulse, no audience hush, no danger
     state on the timer — the clock still ends the question
     exactly on time). All default OFF, and with all three off
     every code path below runs the figures it ran before this
     pass. The host's choices persist per device (gh_rules) and
     pre-fill the next setup; a table show's rules are fixed at
     its start and ride its save; online, the choices ride room
     creation and the ROOM keeps and enforces them — every screen
     reads them from the room's snapshots, never from its own
     memory of the setup screen. */
  var RULES_KEY = "gh_rules";
  var RULE_DEFS = [
    { key: "longerClock", name: "LONGER CLOCK", phrase: "a longer clock on every question" },
    { key: "secondCut", name: "SECOND CUT", phrase: "two Cut Two tokens apiece" },
    { key: "calmTable", name: "CALM TABLE", phrase: "a calm table — no alarms, no flashing lights" }
  ];
  /* normalize a rules value from anywhere (prefs, a save, a
     snapshot, a plan): only a literal true is on */
  function cleanRulesObj(v) {
    var r = (v && typeof v === "object") ? v : {};
    return { longerClock: r.longerClock === true, secondCut: r.secondCut === true, calmTable: r.calmTable === true };
  }
  function loadRulePrefs() {
    try { return cleanRulesObj(JSON.parse(localStorage.getItem(RULES_KEY) || "null")); }
    catch (e) { return cleanRulesObj(null); }
  }
  function saveRulePrefs(r) {
    try { localStorage.setItem(RULES_KEY, JSON.stringify(cleanRulesObj(r))); } catch (e) {}
  }
  function rulesActive(r) { return !!(r && (r.longerClock || r.secondCut || r.calmTable)); }
  /* the break card / lobby wording: LONGER CLOCK · SECOND CUT */
  function rulesCapsText(r) {
    if (!r) return "";
    return RULE_DEFS.filter(function (d) { return r[d.key]; }).map(function (d) { return d.name; }).join(" · ");
  }
  /* Sterling's wording: "a longer clock on every question, two
     Cut Two tokens apiece and a calm table — ..." */
  function rulesProseText(r) {
    if (!r) return "";
    var ps = RULE_DEFS.filter(function (d) { return r[d.key]; }).map(function (d) { return d.phrase; });
    if (ps.length <= 1) return ps.join("");
    return ps.slice(0, -1).join(", ") + " and " + ps[ps.length - 1];
  }
  /* the Cut Two count a seat starts a show with under these rules */
  function cutStartOf(r) { return (r && r.secondCut) ? 2 : 1; }
  /* a snapshot player's Cut Two count: the referee's cutCount
     when it deals one, else its boolean (true -> 1, the starting
     count of the game that wrote it) */
  function snapCutN(p) {
    if (!p) return 0;
    if (typeof p.cutCount === "number" && isFinite(p.cutCount)) return Math.max(0, Math.min(2, Math.floor(p.cutCount)));
    return p.cutTwo ? 1 : 0;
  }
  /* is the table calm right now? The online room's rules rule
     its screens while a room is open; otherwise the table
     show's own. (The pad asks its snapshot directly.) */
  function calmNow() {
    if (OG) return !!(OG.rules && OG.rules.calmTable);
    return !!(G && G.rules && G.rules.calmTable);
  }
  /* the table clock's stretch, read where table windows are born */
  function winScale() { return (G && G.rules && G.rules.longerClock) ? 1.5 : 1; }

  /* ---------- game state ---------- */
  var G = null;
  function newGame(names) {
    return {
      players: names.map(function (nm, i) {
        return { name: nm, color: PCOLORS[i], score: 0, cut: 1, bet: 1, streak: 0, avatar: tableAvatars[i] != null ? tableAvatars[i] : i };
      }),
      round: 1, qInRound: 0,
      rules: null,              // Pass N2: the night's House Rules, fixed by startShow before the first question is born
      rulesLine: null,          // Pass N2: Sterling's drawn naming of them, spoken once at the Round 1 intro
      report: names.map(function () { return freshReportSeat(); }), // Pass N1: the report card's raw tallies, per seat
      reportSeq: 0,             // Pass N1: questions settled this show — the earliest-bank clock for best-category ties
      pot: 0,                   // Dynamics pass D1: the table pot — unbanked money the champion takes
      goldenSlot: null,         // The Golden Question (pass 4): "round:qInRound" of the secret double, drawn at show start
      goldTease: null,          // the tease line drawn with it, spoken once at the Round 1 intro
      showId: null,             // per-show key for the live Sterling lines
      decider: null,            // New programme pass 1: {eligible, usedIds, dealt, winner} once a tied finale triggers it
      facts: freshFacts(),      // New programme pass 2: the round-facts recorder the Intermission is told from
      windBreak: null,          // Dynamics pass D2: {round, seats, line} — the current break's Second Wind grant, drawn once and ridden like the facts
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
  var tableFx = null, ogFx = null, ogQdSeat = -1, ogStreakMoment = null, ogRevealGolden = false, ogPotMoment = null;
  /* Visual pass V2 — the wince beat: {cur, seats} armed by the LIVE
     table reveal only, plus its settle timer (mirrored online by
     ogWinceTimer below) */
  var tableWince = null, tableWinceTimer = null, ogWinceTimer = null;
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
        /* Visual pass V2: the flinch rides the reveal's first beat —
           a seat the marks record as a miss wears WINCE, then the
           settle timer hands it the slump above. Armed only by the
           live revealAnswer (armTableWince), so a repaint or a
           resumed reveal (paintReveal(true)) lands settled */
        if (state === "slump" && tableWince && tableWince.cur === G.cur && tableWince.seats[i]) state = "wince";
      } else if ((G.phase === "question" || G.phase === "vote") && (p.streak || 0) >= 2 &&
        !(G.decider && G.decider.eligible.indexOf(i) < 0)) {
        /* Visual pass V2 — KEEN: a live streak (2+) focuses the
           face while the question is open; the reveal's verdict
           face replaces it when the reveal lands */
        state = "keen";
      }
      var s = el('<div class="seat pod' + i + (p.house != null ? " house" : "") + threatClass(p.streak || 0) + '" data-seat="' + i + '">' +
        '<div class="seat-ava">' + avatarSVG(snapAvatar(p, i), state, i) + "</div>" +
        '<div class="desk"><span class="seat-name">' + esc(p.name) + '</span>' +
        '<span class="seat-score">' + shown + '</span>' +
        '<span class="tag">' + tagsFor(i) + "</span>" + houseGuessHTML(p, i) + deskBetsHTML(p, i) + fortuneHTML() + "</div></div>");
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
    paintDeskHead();
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
  /* Gameplay-visuals pass G3 — the Bet Projector: while Big Finish
     bets are placed, the chips preview the standings they create.
     projStandings is the one pure computation both the extraction
     tests and the table strip consult: given [{score, bet}] it
     returns the seats in projected order — projected score (score
     + bet x $100) descending, ties ordered by the CURRENT standings
     (score descending, then seat) so the strip never shuffles
     equals. Ranks are competition ranks (1 + the seats strictly
     ahead) on BOTH sides, so a projected tie shares its rank and
     the movement marker (current rank - projected rank) can never
     inflate: level is level. Presentation only — settlement never
     reads a word of this. */
  function projStandings(list) {
    var curRank = list.map(function (e) {
      return 1 + list.filter(function (o) { return o.score > e.score; }).length;
    });
    var proj = list.map(function (e) { return e.score + (e.bet || 1) * 100; });
    var projRank = proj.map(function (v) {
      return 1 + proj.filter(function (o) { return o > v; }).length;
    });
    var order = list.map(function (_, i) { return i; }).sort(function (a, b) {
      return (proj[b] - proj[a]) || (list[b].score - list[a].score) || (a - b);
    });
    return order.map(function (i) {
      return { seat: i, proj: proj[i], rank: projRank[i], move: curRank[i] - projRank[i] };
    });
  }
  /* the pad's personal projection: my chips against the standings
     as the snapshot reports them — my own bet exact, everyone else
     standing pat (their bets are secret until the reveal, and the
     line's grammar says exactly what it assumes: where *I* land
     IF I BANK). A level finish reads JOINT, never a fake place. */
  function jpProjLine(myScore, otherScores, chips) {
    var proj = myScore + chips * 100;
    var place = 1 + otherScores.filter(function (s) { return s > proj; }).length;
    var joint = otherScores.some(function (s) { return s === proj; });
    var ord = ["1ST", "2ND", "3RD", "4TH"][place - 1] || (place + "TH");
    return chips + (chips === 1 ? " CHIP" : " CHIPS") + " → " + money(proj) + " · " +
      (joint ? "JOINT " : "") + ord + " IF YOU BANK";
  }
  /* Hot Streaks: the desk tag's streak segment — warm amber, deeper
     (and lit) at 5+. It is the LOWEST-priority segment on the line:
     in Round 3 the bet segment always precedes it, and the Long
     Shot line keeps its own grammar with the streak riding last. */
  function streakSegHTML(n) {
    if (!(n >= 3)) return "";
    return '<span class="streakseg' + (n >= 5 ? " hot" : "") + '">STREAK ×' + n + "</span>";
  }
  /* Gameplay-visuals pass G8 — Threat Displays: the streak made
     ambient. The tag PRINTS the run from 3; this maps the same
     settled streak onto the seat itself — kindling at 2 (one bank
     from the bonus), ember at 3–4 (the bonus is live), full ember
     at 5+ (the tag's own hot tier) — so a hot seat reads across
     the room without anyone reading a word. One mapping, three
     surfaces: the table desks (renderSeats), the online host
     desks (ogRenderSeats) and the pad's standings rows
     (jpStandRows). It is a pure function of the settled streak,
     repainted wherever those surfaces repaint, so it is born at
     the settlement that extends the run and dies at the one that
     breaks it — no state of its own, nothing extra revealed. */
  function threatClass(n) {
    if (n >= 5) return " ember emberfull";
    if (n >= 3) return " ember";
    if (n === 2) return " kindling";
    return "";
  }
  function tagsFor(i) {
    var p = G.players[i], t = [];
    var seg = streakSegHTML(p.streak || 0);
    /* House Players (pass 5): a house seat wears its allegiance
       first on the tag line — a small brass HOUSE segment ahead of
       the same cut/bet/streak grammar every seat carries. The
       house tiers in style.css squeeze this longer line a step
       further in the tight layouts, the portrait fix's own grammar */
    var houseSeg = p.house != null ? '<span class="houseseg">HOUSE</span>' : "";
    if (G.round === 3 && ((G.phase === "bet" && tableBetCap(i) > 3) || p.bet > 3)) {
      return (houseSeg ? houseSeg + " · " : "") + "LONG SHOT · BET " + p.bet + (p.bet === 1 ? " CHIP" : " CHIPS") + (seg ? " · " + seg : "");
    }
    if (houseSeg) t.push(houseSeg);
    /* Pass N2: a pocket holding two says so on the tag; one is
       the plain CUT TWO the tag has always worn */
    t.push(p.cut >= 2 ? "CUT TWO ×2" : p.cut > 0 ? "CUT TWO" : "CUT SPENT");
    if (G.round === 3) t.push("BET " + p.bet + (p.bet === 1 ? " CHIP" : " CHIPS"));
    if (seg) t.push(seg);
    return t.join(" · ");
  }
  /* Designer's pass P11 (2026-11-11): the bet steppers live on
     the desks now. In the table game's bet phase each desk grows
     its own − / amount / + row (a house desk shows its policy bet
     with no steppers — the house is never tapped for), and the
     tag line keeps its full grammar above it. The buttons carry
     the same data-bet address they always did; one delegated
     listener on the seats row (registered beside betBeat) works
     them, so the seats' constant rebuilding can't orphan them. */
  function deskBetsHTML(p, i) {
    if (!G || G.phase !== "bet" || typeof ghMode === "undefined" || ghMode !== "table") return "";
    if (p.house != null) {
      return '<div class="desk-bets house"><span class="house-bet">HOUSE BET</span>' +
        '<span class="bet-amt" id="betAmt' + i + '">' + betLabel(p.bet) + "</span></div>";
    }
    return '<div class="desk-bets"><button class="chip bet-step" data-bet="' + i + '|-1">− 1</button>' +
      '<span class="bet-amt" id="betAmt' + i + '">' + betLabel(p.bet) + "</span>" +
      '<button class="chip bet-step" data-bet="' + i + '|1">+ 1</button></div>';
  }
  /* P11: the projector strip is the desks' shared header — it
     lives in #deskHead, between the stage and the seats, filled
     for the table bet phase and emptied for everything else.
     renderSeats runs on every beat, so the header follows the
     phase exactly, and a stepper tap's re-render repaints the
     strip in its new order (the G3 promise, kept). */
  function paintDeskHead() {
    var dh = $("deskHead");
    if (!dh) return;
    if (G && G.phase === "bet" && typeof ghMode !== "undefined" && ghMode === "table") {
      dh.innerHTML = '<div class="proj-wrap"><div class="proj-label">IF THEY BANK</div><div class="proj-strip" id="projStrip"></div></div>';
      paintProjector();
    } else if (dh.innerHTML) {
      dh.innerHTML = "";
    }
  }
  /* House Players (pass 5): the lock order becomes a race on one
     clock. Every marked seat carries a lock-in TIME — a host tap's
     time is the question's burned elapsed plus the seconds this
     mark screen has been open (with a per-tap sequence whisker, so
     two taps in the same instant still order as tapped); a house
     seat's time is its simulated lock-in, drawn on the same scale
     at question open. syncLockOrder keeps cur.lockOrder as the
     marked seats sorted by those times, and quickDrawWinner reads
     the order exactly as it always has. For a table of humans the
     times increase tap by tap, so the sorted order IS the tap
     order Design pass 3 defined — marking appends, unmarking
     withdraws, a re-mark queues behind what stayed marked. */
  function syncLockOrder() {
    var c = G.cur; if (!c) return;
    var lt = c.lockTimes || {};
    c.lockOrder = Object.keys(c.marks || {}).map(Number).sort(function (a, b) {
      var ta = lt[a] != null ? lt[a] : 1e9 + a, tb = lt[b] != null ? lt[b] : 1e9 + b;
      return (ta - tb) || (a - b);
    });
  }
  function onSeatTap(i) {
    if (!G || !G.cur || G.phase !== "vote") return;
    /* the Decider's mark screen is for the tied leaders only — a
       spectator's seat is stepped back and takes no marks */
    if (G.decider && G.decider.eligible.indexOf(i) < 0) return;
    /* House Players (pass 5): on an option question a house seat's
       mark was settled by its own roll before this screen opened —
       the host never taps for them. On a closest-number question
       the tap IS the closest call, and house seats take it like
       any seat — their number is printed on the desk to be read. */
    if (G.players[i].house != null && G.cur.kind !== "num") return;
    if (!Array.isArray(G.cur.lockOrder)) G.cur.lockOrder = [];
    if (!G.cur.lockTimes) G.cur.lockTimes = {};
    if (G.cur.marks[i]) {
      delete G.cur.marks[i];
      delete G.cur.lockTimes[i];
    } else {
      G.cur.marks[i] = 1;
      G.cur.lockSeq = (G.cur.lockSeq || 0) + 1;
      var stamp = G.cur.elapsed + (G.cur.voteAt ? (Date.now() - G.cur.voteAt) / 1000 : 0) + G.cur.lockSeq * 0.000001;
      /* Audit A1: a resumed question's earlier locks were stamped
         on the pre-refresh timeline — curFromSave restarts elapsed
         and voteAt at zero, so a naive fresh stamp would undercut
         them and steal the quick-draw (and lie to the photo-finish
         margins and the report card's fastest hand, which read the
         same stamps). A new lock can never precede a lock already
         on the question: floor the stamp a whisker above the
         latest one standing. On a never-resumed question the fresh
         stamp already clears every standing one, so the live path
         is unchanged — only the dead refresh interval is lost
         from the margins, which is the honest loss: the mark
         screen was closed, nobody could lock. */
      var prevMax = 0, ltKeys = Object.keys(G.cur.lockTimes);
      for (var li = 0; li < ltKeys.length; li++) {
        var lv = G.cur.lockTimes[ltKeys[li]];
        if (typeof lv === "number" && lv > prevMax) prevMax = lv;
      }
      if (prevMax > 0 && stamp <= prevMax) stamp = prevMax + G.cur.lockSeq * 0.000001;
      G.cur.lockTimes[i] = stamp;
    }
    syncLockOrder();
    renderSeats();
    paintVoteChips();
    saveTableShow();
  }

  /* ---------- clock ---------- */
  var clock = { left: 0, total: 0, running: false, onEnd: null };
  function startClock(seconds, onEnd) {
    clock.left = seconds; clock.total = seconds; clock.running = true; clock.onEnd = onEnd;
    Snd._lw = -1;
    drawClock();
  }
  function stopClock() { clock.running = false; var d = $("dangerFx"); if (d) d.classList.remove("on"); var sg = $("scr-game"); if (sg) sg.classList.remove("hurry"); }
  var lastT = 0;
  function loop(t) {
    var dt = Math.min((t - lastT) / 1000 || 0, 0.1); lastT = t;
    if (clock.running && G && G.cur) {
      clock.left -= dt; G.cur.elapsed += dt;
      if (clock.left <= 0) { clock.left = 0; clock.running = false; drawClock(); if (clock.onEnd) clock.onEnd(); }
      else drawClock();
    }
    if (!pageHidden) { stepFortune(dt); drawValue(); drawMelt(); drawClockLight(dt); stepLeaves(dt); stepMotes(dt); stepCoins(dt); stepJpCoins(dt); stepSterling(t); }
    requestAnimationFrame(loop);
  }
  function drawClock() {
    var num = $("timerNum"), ring = $("timerProg");
    if (!num || !ring) return;
    var C = 2 * Math.PI * 30;
    var frac = clock.total ? clock.left / clock.total : 0;
    ring.style.strokeDashoffset = String(C * (1 - frac));
    num.textContent = String(Math.ceil(clock.left));
    /* Pass N2 — Calm Table: the whole hurry layer reads one
       gate. Under a calm table none of it ever raises — the
       ring's danger state, the footlights' pulse (and, riding
       .hurry in the CSS, the audience's hush) and the vignette
       all stand down — while the clock above keeps ending the
       question exactly on time. Calm is a manner, not a mercy. */
    var calm = calmNow();
    $("timerSvg").classList.toggle("low", !calm && clock.left <= 5.05);
    /* G7: the footlights' hurry rides the danger threshold's own
       condition — on the online host the shared clock's running flag
       is never raised, so an answer-phase room counts as running */
    var sg7 = $("scr-game");
    if (sg7) sg7.classList.toggle("hurry", !calm && clock.left <= 5.05 && clock.left > 0 && (clock.running || (OG && OG.phase === "answer")));
    var dfx = $("dangerFx");
    if (dfx) dfx.classList.toggle("on", !calm && clock.running && clock.left <= 5.05 && clock.left > 0);
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
  /* every stage repaint is a curtain: coins still in the air from
     the last card come down with it (pass 7) — flights start only
     after their own reveal has painted, so this never eats one */
  function stage(html) { clearCoins(); var st = $("stage"); st.innerHTML = '<div class="stage-inner enter">' + html + "</div>"; st.scrollTop = 0; paintPot(); }
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
      /* G6: the committed cut pair rides the save — a resumed
         question previews and spends the pair it was dealt, and a
         holding finger after a refresh sees the truth */
      cutPair: c.cutPair ? c.cutPair.slice() : null,
      /* Design pass 3: the GOT IT tap order is the table's quick-draw
         record — it must survive a host refresh or the winner could
         change across a resume. */
      lockOrder: (c.lockOrder || []).slice(),
      /* House Players (pass 5): the question's house record — each
         house seat's roll (ok/lock/guess/cut state), the lock-in
         times and the tap sequence — rides the save so a resumed
         question keeps the very rolls it was dealt, never re-rolls */
      house: c.house || null,
      lockTimes: c.lockTimes || null,
      lockSeq: c.lockSeq || 0,
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
      streakMoment: c.streakMoment || null,
      /* Dynamics pass D1: the question's feed record — the amount
         it fed the pot and the beat it earned. A resumed reveal
         repaints from these, never by re-running the feed, so the
         pot can't be fed twice for one question */
      potFed: c.potFed || 0,
      potMoment: c.potMoment || null
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
      /* G6: saves written before the commitment existed carry no
         pair — null here, and the first preview or spend commits
         one from the untouched wrong answers (commitCutPair) */
      cutPair: Array.isArray(o.cutPair) ? o.cutPair.slice() : null,
      /* older saves predate the quick-draw record: fall back to the
         numeric order of the seats already marked — deterministic */
      lockOrder: Array.isArray(o.lockOrder) ? o.lockOrder.slice()
        : Object.keys(o.marks || {}).map(Number).sort(function (a, b) { return a - b; }),
      /* House Players (pass 5): saves written before the house
         existed carry none of this — the question simply has no
         house record and plays as it always did */
      house: o.house || null,
      lockTimes: o.lockTimes || {},
      lockSeq: o.lockSeq || 0,
      voteAt: null,
      betRound: !!o.betRound, bankValue: o.bankValue || 0, headline: false, golden: false,
      special: !!o.special, intro: o.intro || null, decider: !!o.decider,
      /* saves written before Hot Streaks carry neither field; the
         reveal simply repaints without streak grammar */
      streakFx: o.streakFx || null, streakMoment: o.streakMoment || null,
      /* saves written before the Table Pot carry neither field;
         the reveal repaints without a feed record */
      potFed: o.potFed || 0, potMoment: o.potMoment || null
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
          /* House Players (pass 5): a house seat's profile index
             rides along — a resumed solo show restores the same
             cast members, brains included */
          return { name: p.name, color: p.color, score: p.score, cut: p.cut, bet: p.bet, streak: p.streak || 0, avatar: p.avatar, house: (p.house != null ? p.house : null) };
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
        /* Pass N1: the report tallies ride the save beside the
           facts — a resumed show keeps accumulating the same card,
           and its earliest-bank clock keeps its place */
        report: G.report || null,
        reportSeq: G.reportSeq || 0,
        /* The Golden Question (pass 4): the pick and its tease
           ride the save — a resume never re-rolls the pick, and
           the saved words are re-presented verbatim at the intro */
        golden: G.goldenSlot || null,
        goldTease: G.goldTease || null,
        /* Pass N2: the show's House Rules ride the save beside
           the tease — a resumed show keeps the night it started
           (its questions were born under these rules, its seats
           dealt their counts under them), and Sterling's naming
           of them is re-presented verbatim at a resumed intro */
        rules: G.rules || null,
        rulesLine: G.rulesLine || null,
        /* House Players (pass 5): the solo flag and its drawn
           introduction line ride the save, like the golden pair */
        solo: !!G.solo,
        soloLine: G.soloLine || null,
        /* Dynamics pass D1: the pot rides the save exactly — a
           refresh mid-show restores the brass as it stood, and a
           resumed reveal (whose feed is already inside this
           figure) can never feed it a second time */
        pot: G.pot || 0,
        /* Dynamics pass D2: the break's Second Wind record rides
           the save — the restored token is already in the seats
           above; this record is what lets a resumed break retell
           the grant (the card's row, Sterling's drawn words)
           instead of forgetting it happened */
        windBreak: G.windBreak ? { round: G.windBreak.round, seats: G.windBreak.seats.slice(), line: G.windBreak.line } : null,
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
          avatar: (Number.isInteger(p.avatar) && p.avatar >= 0 && p.avatar < 8) ? p.avatar : i,
          /* House Players (pass 5): a saved profile index restores
             the house seat; anything malformed deals a guest */
          house: (Number.isInteger(p.house) && HOUSE_PROFILES[p.house]) ? p.house : null
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
      /* Pass N1: the report tallies restored as recorded; a save
         written before the card existed starts it blank */
      report: reportFromSave(sv.report, sv.players.length),
      reportSeq: (typeof sv.reportSeq === "number" && sv.reportSeq > 0) ? Math.floor(sv.reportSeq) : 0,
      /* Dynamics pass D1: the pot is restored exactly; a save
         written before the pot existed resumes an empty one */
      pot: (typeof sv.pot === "number" && sv.pot > 0) ? Math.floor(sv.pot) : 0,
      /* Dynamics pass D2: the break's Second Wind record is
         restored as recorded — the token itself already rides
         in the seats; a save written before Second Wind (or a
         malformed record) resumes with none */
      windBreak: (sv.windBreak && Array.isArray(sv.windBreak.seats) && typeof sv.windBreak.line === "string" && sv.windBreak.seats.length)
        ? { round: sv.windBreak.round | 0, seats: sv.windBreak.seats.filter(function (n) { return Number.isInteger(n) && n >= 0 && n < sv.players.length; }), line: sv.windBreak.line }
        : null,
      /* The Golden Question (pass 4): the pick is restored from
         the save, validated against the very list it was drawn
         from — a save written before the Golden existed (or a
         hand-edited one) deals an un-gilded show this time rather
         than inventing a double mid-show */
      goldenSlot: validGoldenSlot(sv.golden) ? sv.golden : null,
      goldTease: typeof sv.goldTease === "string" ? sv.goldTease : null,
      /* Pass N2: the rules are restored as recorded; a save
         written before they existed resumes the plain game,
         which is the game that save was playing */
      rules: cleanRulesObj(sv.rules),
      rulesLine: typeof sv.rulesLine === "string" ? sv.rulesLine : null,
      /* House Players (pass 5): the solo arrangement is restored
         from the seats themselves (their profile indices are the
         fact; the flag and cast list are derived), and a missing
         introduction line is redrawn from the same pool */
      solo: !!sv.solo || sv.players.some(function (p) { return p.house != null; }),
      soloLine: typeof sv.soloLine === "string" ? sv.soloLine : null,
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
    /* House Players (pass 5): the cast list rides out of the
       restored seats (seat order is cast order), so a resumed solo
       show's rematch keeps the same two house players */
    G.houseCast = G.players.filter(function (p) { return p.house != null; }).map(function (p) { return p.house; });
    if (G.houseCast.length !== 2) G.houseCast = null;
    if (G.solo && !G.soloLine && G.players.length === 3)
      G.soloLine = authoredLine("house", { a: G.players[1].name, b: G.players[2].name });
    if (G.cur) G.cur.headline = isHeadline(G.round, G.qInRound); // Design pass 2: position-derived, never saved
    /* The Golden Question (pass 4): the flag is never saved on the
       question either — it is re-derived from the restored pick and
       the position, so a resumed golden question (even mid-reveal)
       wears its gilt, and no other question can borrow it */
    if (G.cur) G.cur.golden = !G.cur.decider && isGoldenSlot(G.round, G.qInRound);
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
    /* pass 7: leaving a screen lands its coins — no flight
       outlives the room it was flown in */
    if (id !== "scr-game") clearCoins();
    if (id !== "scr-join") jpClearCoins();
    document.querySelectorAll(".screen").forEach(function (s) { s.classList.remove("active"); });
    $(id).classList.add("active");
    if (id === "scr-title") { var g = $("scr-game"); if (g) g.classList.remove("sealed"); if (g) g.removeAttribute("data-phase"); paintTableResume(); paintChampion(); }
  }
  function startShow(names, soloCast, rulesOverride) {
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
    /* The Golden Question (pass 4): the pick is drawn from the
       show's rng NOW, at show start — one slot in rounds 1-2,
       never the Headline's seat — and the tease line with it, so
       the save carries both and a resume re-presents the identical
       words without ever re-rolling */
    G.goldenSlot = drawGoldenSlot();
    G.goldTease = authoredLine("goldtease");
    /* Pass N2 — HOUSE RULES: the night's toggles are fixed NOW,
       at the show's start — from the caller's hand (a rematch
       keeps the table it is played at) or from the device's
       saved setup choices — and every seat is dealt its starting
       Cut Two count under them. Sterling's naming of the rules
       is drawn with the tease, so the save re-presents the
       identical words at a resumed intro. */
    G.rules = cleanRulesObj(rulesOverride || loadRulePrefs());
    G.players.forEach(function (p) { p.cut = cutStartOf(G.rules); });
    G.rulesLine = rulesActive(G.rules) ? authoredLine("rules", { rules: rulesProseText(G.rules) }) : null;
    /* House Players (pass 5): a solo show's cast rides in with the
       names — two profile indices for seats 2-3, dealt by
       startSoloShow or carried over a rematch verbatim (one cast,
       one series key, all night). The seats take their profiles'
       faces, not the table's saved picks, and the introduction
       line is drawn now so the save re-presents it verbatim */
    if (Array.isArray(soloCast) && soloCast.length === 2) {
      G.solo = true;
      G.houseCast = soloCast.slice();
      soloCast.forEach(function (pi, k) {
        var p = G.players[k + 1];
        if (p && HOUSE_PROFILES[pi]) { p.house = pi; p.avatar = HOUSE_PROFILES[pi].avatar; }
      });
      G.soloLine = authoredLine("house", { a: names[1], b: names[2] });
    }
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
  /* ================= Pass N1 — THE REPORT CARD (the recorder) =====
     Four per-seat facts kept through the night and read back at
     the finale — recorded facts only, the Intermission's rule: a
     fact that wasn't recorded doesn't appear. The raw tally per
     seat: cats {cat -> {amt, n, first}} (money banked there, banks
     there, the settled-question number of the first bank there),
     fastest (the quickest correct lock-in, in the table clock's
     own seconds, read off the mark's stamp in cur.lockTimes — the
     very record the photo-finish strip reads), biggest (the
     largest settled single-question gain), peak (the highest run
     the streak settlement ever left standing). Written ONLY by
     noteReport, in the reveal's single commit, from the same
     gains the scores took — the Decider never reaches it (its
     reveal returns before the money moves). The online referee
     keeps the identical tallies in the room and derives the
     identical card (reportFor there, deriveReport here — one
     definition: most money, then most banks, then earliest). */
  function freshReportSeat() { return { cats: {}, fastest: null, biggest: 0, peak: 0 }; }
  function reportFromSave(o, n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(freshReportSeat());
    if (!Array.isArray(o)) return out;
    o.forEach(function (s, ix) {
      if (ix >= n || !s || typeof s !== "object") return;
      var st = out[ix];
      if (s.cats && typeof s.cats === "object") Object.keys(s.cats).forEach(function (cat) {
        var c = s.cats[cat];
        if (c && typeof c.amt === "number" && c.amt > 0 && Number.isInteger(c.n) && c.n > 0 && Number.isInteger(c.first) && c.first >= 1)
          st.cats[cat] = { amt: Math.floor(c.amt), n: c.n, first: c.first };
      });
      if (typeof s.fastest === "number" && s.fastest >= 0) st.fastest = s.fastest;
      if (typeof s.biggest === "number" && s.biggest > 0) st.biggest = Math.floor(s.biggest);
      if (typeof s.peak === "number" && s.peak > 0) st.peak = Math.floor(s.peak);
    });
    return out;
  }
  function deriveReport(st) {
    if (!st || typeof st !== "object") return { best: null, fastest: null, biggest: 0, peak: 0 };
    var best = null;
    Object.keys(st.cats || {}).forEach(function (cat) {
      var c = st.cats[cat];
      if (!c || !(c.amt > 0)) return;
      if (!best || c.amt > best.amt || (c.amt === best.amt && (c.n > best.n || (c.n === best.n && c.first < best.first))))
        best = { cat: cat, amt: c.amt, n: c.n, first: c.first };
    });
    return {
      best: best ? { cat: best.cat, amt: best.amt } : null,
      fastest: (typeof st.fastest === "number") ? st.fastest : null,
      biggest: st.biggest || 0,
      peak: st.peak || 0
    };
  }
  function noteReport(c, gains, so) {
    if (!G || !Array.isArray(G.report)) return;
    var seq = (G.reportSeq = (G.reportSeq || 0) + 1);
    G.players.forEach(function (p, i) {
      var st = G.report[i];
      if (!st) return;
      var pk = so && so.streakOut ? so.streakOut[i] : null;
      if (typeof pk === "number" && pk > st.peak) st.peak = pk;
      var gain = gains ? (gains[i] || 0) : 0;
      if (gain > 0) {
        if (gain > st.biggest) st.biggest = gain;
        if (c.cat) {
          var e = st.cats[c.cat] || (st.cats[c.cat] = { amt: 0, n: 0, first: 0 });
          if (!e.n) e.first = seq;
          e.amt += gain; e.n++;
        }
        /* the mark's own stamp is the lock moment — house seats
           carry their simulated stamp from the same record */
        if (c.lockTimes && typeof c.lockTimes[i] === "number" && c.lockTimes[i] >= 0
          && (st.fastest == null || c.lockTimes[i] < st.fastest)) st.fastest = c.lockTimes[i];
      }
    });
  }
  /* the server's derived entry, in the renderer's own units
     (fastest in seconds) — one card shape for every screen */
  function reportView(entry) {
    if (!entry || typeof entry !== "object") return null;
    return {
      best: entry.best || null,
      fastest: (typeof entry.fastestMs === "number") ? entry.fastestMs / 1000 : null,
      biggest: entry.biggest || 0,
      peak: entry.peak || 0
    };
  }
  /* the facts a derived card actually holds, in reading order —
     each present only if it was recorded. A peak of one is a
     bank, not a streak, so the run is told from two. */
  function reportFactsOf(d) {
    var out = [];
    if (!d) return out;
    if (d.best) out.push({ k: "BEST", full: "BEST CATEGORY", v: d.best.cat.toUpperCase() + " " + money(d.best.amt) });
    if (d.fastest != null) out.push({ k: "FASTEST HAND", full: "FASTEST HAND", v: (Math.round(d.fastest * 10) / 10).toFixed(1) + "s" });
    if (d.biggest > 0) out.push({ k: "BIGGEST BANK", full: "BIGGEST BANK", v: money(d.biggest) });
    if (d.peak >= 2) out.push({ k: "HOTTEST STREAK", full: "HOTTEST STREAK", v: String(d.peak) });
    return out;
  }
  /* A seat with nothing recorded still gets a sentence — Sterling
     does not leave a guest's line blank on the closing card
     (designer's pass, 2026-11-11). The line is voice, never a
     fact: it invents no numbers, only notes the quiet. The pad's
     own card keeps its stricter rule — an empty card is omitted
     there, because a player's own phone need not announce it. */
  var REPORT_QUIET = [
    "a quiet one — the chair was comfy",
    "unhurried, unbothered, unbanked",
    "all dignity, no dollars",
    "a spectator's masterclass",
    "saving it for the rematch, presumably"
  ];
  function quietLineFor(name, seat, taken) {
    var h = 0, s = String(name || "");
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    var idx = (h + seat) % REPORT_QUIET.length;
    if (taken[idx]) idx = (idx + 1) % REPORT_QUIET.length;
    taken[idx] = true;
    return REPORT_QUIET[idx];
  }
  function reportPanelHTML(rows, say) {
    var taken = {};
    var body = rows.map(function (r, seat) {
      var list = reportFactsOf(r.d);
      var facts;
      if (list.length) {
        facts = list.map(function (f) {
          return '<span class="report-fact"><span class="report-fk">' + f.k + "</span> " + esc(f.v) + "</span>";
        }).join('<span class="report-dot">·</span>');
      } else {
        facts = '<span class="report-fact report-quiet"><span class="report-fk">THE NIGHT</span> ' +
          esc(quietLineFor(r.name, seat, taken)) + "</span>";
      }
      return '<div class="report-row"><span class="report-name">' + esc(r.name) + '</span><span class="report-facts">' + facts + "</span></div>";
    }).join("");
    return '<div class="report-card"><div class="report-head">THE REPORT CARD</div>' +
      (say ? '<div class="report-say">' + esc(say) + "</div>" : "") + body + "</div>";
  }
  /* Sterling's one line over the card: when the champion's biggest
     bank is the night's largest, he names that fact and nothing
     else; otherwise the plain introduction */
  function reportSayFor(champName, champD, rows, viaDecider) {
    /* the decider line leads when the night ended in one: it is
       the rarer fact and the final one (proposal 2, above) */
    if (viaDecider) return authoredLine("reportdecider", { name: champName });
    var night = 0;
    rows.forEach(function (r) { if (r.d && r.d.biggest > night) night = r.d.biggest; });
    if (champD && champD.biggest > 0 && champD.biggest >= night)
      return authoredLine("reportbig", { name: champName, amount: money(champD.biggest) });
    return authoredLine("report", {});
  }
  /* ================= Pass N3 — SHARE THE NIGHT =================
     The finale becomes a card worth sending: a 1080x1350 portrait
     card composed on a canvas from the facts each screen already
     holds at its finale — the champion and their total exactly as
     the marquee states them (the pot folded in), the standings as
     the desks show them, the night's biggest bank from the Report
     Card's own tallies, the series line when the night has one.
     Recorded facts only, as always: a drawn online finale crowns
     nobody, so its card crowns nobody, and a pad — which never
     holds the night's series — prints no series line. The game
     posts nothing anywhere: the card leaves through the phone's
     own share sheet, or as a saved PNG where no sheet can take
     it. Each finale builds its data model as it renders and
     leaves it in shareNight; the button only ever opens it. */
  var shareNight = null;   /* the night on show: the card's data model */
  var shareReady = null;   /* Promise<Blob> for the composed card */
  var SHARE_W = 1080, SHARE_H = 1350;
  function shareDateStr() {
    var d = new Date();
    var days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
    var months = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
    return days[d.getDay()] + ", " + months[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
  }
  function shareFileName() {
    var dt = new Date();
    function p2(n) { return (n < 10 ? "0" : "") + n; }
    return "the-gilded-hour-" + dt.getFullYear() + "-" + p2(dt.getMonth() + 1) + "-" + p2(dt.getDate()) + ".png";
  }
  /* the night's biggest bank across a set of {name, d} report rows
     (either engine's derivation) — null when nobody banked at all */
  function nightBiggest(rows) {
    var best = null;
    (rows || []).forEach(function (r) {
      if (r && r.d && r.d.biggest > 0 && (!best || r.d.biggest > best.amt)) best = { name: r.name, amt: r.d.biggest };
    });
    return best;
  }
  function finishShareData(o) {
    o.date = shareDateStr();
    o.text = o.champion
      ? "★ THE GILDED HOUR — " + o.champion.name + " takes the night with " + money(o.champion.total) + " · " + o.date
      : "★ THE GILDED HOUR — dead level at " + money(o.standings.length ? o.standings[0].score : 0) + ", no crown tonight · " + o.date;
    return o;
  }
  /* the table's card: built inside winnerScreen, where the pot,
     the series line and the verdict are all in hand */
  function shareDataTable(i, potAmt, seriesLine) {
    var p = G.players[i];
    var order = G.players.map(function (pp, ii) { return ii; }).sort(function (a, b) { return G.players[b].score - G.players[a].score; });
    var rows = order.map(function (ii) { return { name: G.players[ii].name, d: deriveReport(G.report ? G.report[ii] : null) }; });
    return finishShareData({
      champion: { name: p.name, avatar: snapAvatar(p, i), seat: i, total: p.score + (potAmt || 0), house: p.house != null },
      pot: potAmt || 0,
      standings: order.map(function (ii) { return { name: G.players[ii].name, score: G.players[ii].score, avatar: snapAvatar(G.players[ii], ii), seat: ii }; }),
      seriesLine: seriesLine || null,
      flourish: nightBiggest(rows)
    });
  }
  /* the online host's card: built inside ogWinner — a drawn show
     (no decided champion) crowns nobody and awards no pot,
     exactly as its finale states */
  function shareDataHost(winSeat, hasWinner, potAmt, seriesLine) {
    var idxs = [];
    OG.players.forEach(function (p, ii) { if (p) idxs.push(ii); });
    var order = idxs.slice().sort(function (a, b) { return OG.players[b].score - OG.players[a].score; });
    var p = OG.players[winSeat];
    var rows = OG.report ? order.map(function (ii) { return { name: OG.players[ii].name, d: reportView(OG.report[ii]) }; }) : [];
    return finishShareData({
      champion: hasWinner ? { name: p.name, avatar: snapAvatar(p, winSeat), seat: winSeat, total: p.score + (potAmt || 0), house: false } : null,
      pot: hasWinner ? (potAmt || 0) : 0,
      standings: order.map(function (ii) { return { name: OG.players[ii].name, score: OG.players[ii].score, avatar: snapAvatar(OG.players[ii], ii), seat: ii }; }),
      seriesLine: seriesLine || null,
      flourish: nightBiggest(rows)
    });
  }
  /* the pad's card: everything it prints is on its ended snapshot
     — the champion its own screen names (a decider's pick, else a
     lone leader; a dead level crowns nobody), the pot the room
     reports, and the referee's full report card, which at the
     ended phase the room deals to every screen alike — so the
     night's biggest bank is a fact the pad honestly holds. The
     series is the host device's book, never the pad's: no line. */
  function jpShareData() {
    var s = JP && JP.snap;
    if (!s) return null;
    var seats = [];
    s.players.forEach(function (p, ii) { if (p) seats.push(ii); });
    var champSeat = null;
    if (s.lastReveal && s.lastReveal.decider && s.lastReveal.deciderWinner != null && s.players[s.lastReveal.deciderWinner]) champSeat = s.lastReveal.deciderWinner;
    else if (seats.length) {
      var mx = Math.max.apply(null, seats.map(function (ii) { return s.players[ii].score; }));
      var tops = seats.filter(function (ii) { return s.players[ii].score === mx; });
      if (tops.length === 1) champSeat = tops[0];
    }
    var order = seats.slice().sort(function (a, b) { return s.players[b].score - s.players[a].score; });
    var rows = s.report ? order.map(function (ii) { return { name: s.players[ii].name, d: reportView(s.report[ii]) }; }) : [];
    var cp = champSeat != null ? s.players[champSeat] : null;
    return finishShareData({
      champion: cp ? { name: cp.name, avatar: snapAvatar(cp, champSeat), seat: champSeat, total: cp.score + (s.pot || 0), house: false } : null,
      pot: cp ? (s.pot || 0) : 0,
      standings: order.map(function (ii) { return { name: s.players[ii].name, score: s.players[ii].score, avatar: snapAvatar(s.players[ii], ii), seat: ii }; }),
      seriesLine: null,
      flourish: nightBiggest(rows)
    });
  }
  /* one avatar, drawn from the game's own SVG: serialized with an
     explicit size (the bare string carries only a viewBox) into a
     same-origin blob — the canvas it lands on stays clean and
     exportable, which the toBlob in composeShareCard proves */
  function shareAvatarImage(id, state, seat) {
    return new Promise(function (resolve) {
      var svg = avatarSVG(id, state, seat).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="248" ');
      var url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
      var img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }
  function drawShareCard(d, av) {
    var cv = $("shareCanvas");
    if (!cv) return;
    var ctx = cv.getContext("2d");
    var W = SHARE_W, CX = W / 2;
    var F = "Fredoka, 'Arial Rounded MT Bold', sans-serif";
    var FM = "'GHTab', " + F;
    function centered(txt, y, font, fill, ls) {
      ctx.font = font; ctx.fillStyle = fill; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.shadowColor = "transparent"; ctx.shadowOffsetY = 0;
      try { ctx.letterSpacing = ls || "0px"; } catch (e) {}
      ctx.fillText(txt, CX, y);
      try { ctx.letterSpacing = "0px"; } catch (e) {}
    }
    function fitPx(txt, base, maxW, weight, fam) {
      var px = base;
      ctx.font = weight + " " + px + "px " + fam;
      while (px > 20 && ctx.measureText(txt).width > maxW) { px -= 4; ctx.font = weight + " " + px + "px " + fam; }
      return px;
    }
    function goldGrad(y0, y1) {
      var g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, "#FFE29A"); g.addColorStop(0.55, "#FFB03A"); g.addColorStop(1, "#FF8A3C");
      return g;
    }
    /* the room itself: deep plum, warmer at the heart */
    var bg = ctx.createLinearGradient(0, 0, 0, SHARE_H);
    bg.addColorStop(0, "#2B1138"); bg.addColorStop(0.45, "#24102F"); bg.addColorStop(1, "#150820");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, SHARE_H);
    var glow = ctx.createRadialGradient(CX, 430, 60, CX, 430, 660);
    glow.addColorStop(0, "rgba(255,176,58,.20)"); glow.addColorStop(1, "rgba(255,176,58,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, SHARE_H);
    /* the brass frame, double-ruled like the marquee's */
    ctx.strokeStyle = "#C6A45E"; ctx.lineWidth = 4; ctx.strokeRect(36, 36, W - 72, SHARE_H - 72);
    ctx.strokeStyle = "rgba(255,183,58,.45)"; ctx.lineWidth = 2; ctx.strokeRect(54, 54, W - 108, SHARE_H - 108);
    /* the masthead */
    centered("THE", 148, "600 30px " + F, "#FFF6E8", "14px");
    ctx.shadowColor = "#571C46"; ctx.shadowOffsetY = 5;
    centered("GILDED HOUR", 244, "700 96px " + F, goldGrad(160, 248));
    ctx.shadowColor = "transparent"; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = "rgba(198,164,94,.85)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(228, 294); ctx.lineTo(474, 294); ctx.moveTo(606, 294); ctx.lineTo(852, 294); ctx.stroke();
    centered("★", 310, "38px " + F, "#FFC93C");
    centered("FINAL RESULT", 356, "700 30px " + F, "#FFE29A", "7px");
    centered(d.date, 400, "500 29px " + F, "rgba(255,246,232,.78)", "2px");
    var cursor;
    if (d.champion) {
      if (av.champ) {
        ctx.save();
        ctx.beginPath(); ctx.arc(CX, 530, 104, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(av.champ, CX - 104, 530 - 108, 208, 215);
        ctx.restore();
        ctx.beginPath(); ctx.arc(CX, 530, 104, 0, Math.PI * 2);
        ctx.strokeStyle = "#FFC93C"; ctx.lineWidth = 5; ctx.stroke();
      }
      centered(d.champion.house ? "★ HOUSE WIN ★" : "★ CHAMPION ★", 700, "700 30px " + F, "#FFC93C", "6px");
      var nameUp = d.champion.name.toUpperCase();
      var npx = fitPx(nameUp, 66, 872, "700", F);
      centered(nameUp, 768, "700 " + npx + "px " + F, "#FFF6E8");
      var tot = money(d.champion.total);
      var tpx = fitPx(tot, 96, 820, "700", FM);
      ctx.shadowColor = "#571C46"; ctx.shadowOffsetY = 4;
      centered(tot, 862, "700 " + tpx + "px " + FM, goldGrad(786, 866));
      ctx.shadowColor = "transparent"; ctx.shadowOffsetY = 0;
      cursor = 916;
      if (d.pot > 0) {
        var potTxt = d.champion.house
          ? "THE HOUSE KEEPS THE POT TOO — " + money(d.pot)
          : "★ AND TOOK THE " + money(d.pot) + " POT ★";
        var ppx = fitPx(potTxt, 36, 872, "700", F);
        centered(potTxt, cursor + 20, "700 " + ppx + "px " + F, "#FFE29A");
        cursor += 76;
      }
    } else {
      ctx.shadowColor = "#571C46"; ctx.shadowOffsetY = 5;
      centered("DEAD LEVEL", 548, "700 88px " + F, goldGrad(478, 552));
      ctx.shadowColor = "transparent"; ctx.shadowOffsetY = 0;
      centered("NO CROWN TONIGHT — THE TABLE STANDS MATCHED AT " + money(d.standings.length ? d.standings[0].score : 0), 606, "500 30px " + F, "rgba(255,246,232,.85)");
      cursor = 668;
    }
    /* the standings, in the order the night left them */
    d.standings.forEach(function (r, k) {
      var base = cursor + k * 58;
      var isChamp = !!d.champion && r.seat === d.champion.seat;
      var img = av.rows[k];
      if (img) {
        ctx.save();
        ctx.beginPath(); ctx.arc(126, base - 14, 21, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(img, 105, base - 36, 42, 43);
        ctx.restore();
        ctx.beginPath(); ctx.arc(126, base - 14, 21, 0, Math.PI * 2);
        ctx.strokeStyle = isChamp ? "#FFC93C" : "rgba(255,201,60,.45)"; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.textBaseline = "alphabetic"; ctx.shadowColor = "transparent"; ctx.shadowOffsetY = 0;
      ctx.fillStyle = isChamp ? "#FFE29A" : "rgba(255,246,232,.6)";
      ctx.font = "700 36px " + F; ctx.textAlign = "left";
      ctx.fillText((k + 1) + ".", 168, base);
      ctx.fillStyle = isChamp ? "#FFE29A" : "#FFF6E8";
      var spx = fitPx(r.name.toUpperCase(), 38, 560, "700", F);
      ctx.font = "700 " + spx + "px " + F;
      ctx.fillText(r.name.toUpperCase(), 226, base);
      ctx.fillStyle = isChamp ? goldGrad(base - 34, base) : "#FFF6E8";
      ctx.font = "700 40px " + FM; ctx.textAlign = "right";
      ctx.fillText(money(r.score), 936, base);
    });
    cursor += d.standings.length * 58 + 18;
    /* the flourish: the night's biggest bank, from the same
       tallies the Report Card reads */
    if (d.flourish) {
      var fl = "★ BIGGEST BANK OF THE NIGHT — " + money(d.flourish.amt) + " BY " + d.flourish.name.toUpperCase();
      var fpx = fitPx(fl, 34, 880, "700", F);
      centered(fl, cursor + 16, "700 " + fpx + "px " + F, "#FFC93C");
      cursor += 66;
    }
    if (d.seriesLine) {
      var sx = fitPx(d.seriesLine, 31, 880, "700", F);
      centered(d.seriesLine, cursor + 16, "700 " + sx + "px " + F, "#C6A45E");
      cursor += 60;
    }
    centered("s6ggrpgrzf-droid.github.io/Gamez/gilded-hour", 1282, "500 23px " + F, "rgba(198,164,94,.8)", "1px");
  }
  /* compose the card: the real letterforms first (the draw waits
     on document.fonts), every needed avatar alongside, then the
     PNG itself — the toBlob is the proof the canvas stayed clean */
  function composeShareCard(d) {
    var av = { champ: null, rows: {} };
    var urls = [];
    var jobs = [];
    function take(key, id, state, seat) {
      jobs.push(shareAvatarImage(id, state, seat).then(function (got) {
        if (!got) return;
        urls.push(got.url);
        if (key === "champ") av.champ = got.img; else av.rows[key] = got.img;
      }));
    }
    if (d.champion) take("champ", d.champion.avatar, "cheer", d.champion.seat);
    d.standings.forEach(function (r, k) { take(k, r.avatar, "neutral", r.seat); });
    var loads = Promise.resolve();
    if (document.fonts && document.fonts.load) {
      loads = Promise.all([
        document.fonts.load("700 90px Fredoka"), document.fonts.load("600 30px Fredoka"),
        document.fonts.load("500 30px Fredoka"), document.fonts.load("700 90px GHTab", "$0")
      ]).catch(function () {});
    }
    var ready = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    return Promise.all([ready, loads].concat(jobs)).then(function () {
      drawShareCard(d, av);
      urls.forEach(function (u) { URL.revokeObjectURL(u); });
      return new Promise(function (resolve) {
        var cv = $("shareCanvas");
        if (cv && cv.toBlob) cv.toBlob(function (b) { resolve(b); }, "image/png");
        else resolve(null);
      });
    });
  }
  function openShareNight() {
    if (!shareNight) return;
    Snd.ensure();
    shareReady = composeShareCard(shareNight);
    var go = $("shareGo");
    if (go) go.classList.toggle("hidden", !(navigator.share || navigator.canShare));
    $("shareOverlay").classList.remove("hidden");
  }
  function closeShareNight() { var ov = $("shareOverlay"); if (ov) ov.classList.add("hidden"); }
  function saveShareImage() {
    if (!shareReady) return;
    shareReady.then(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = shareFileName();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    });
  }
  function shareGoNow() {
    if (!shareNight || !shareReady) return;
    var d = shareNight;
    shareReady.then(function (blob) {
      var file = null;
      try { if (blob) file = new File([blob], shareFileName(), { type: "image/png" }); } catch (e) {}
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: "The Gilded Hour", text: d.text }).catch(function () {});
      } else if (navigator.share) {
        /* the sheet without file support still carries the night —
           in words — and the image stays one tap away on SAVE */
        navigator.share({ title: "The Gilded Hour", text: d.text }).catch(function () {});
      } else saveShareImage();
    });
  }
  $("shareGo").addEventListener("click", shareGoNow);
  $("shareSave").addEventListener("click", saveShareImage);
  $("shareClose").addEventListener("click", closeShareNight);
  function joinNames(names) {
    if (names.length <= 1) return names.join("");
    if (names.length === 2) return names[0] + " and " + names[1];
    return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  }
  /* Dynamics pass D2 — Second Wind: who earns a Cut Two back at
     a break. Pure over the same normalised seats the card is
     composed from: every seat tied for last whose count stands
     below its STARTING count (Pass N2: seats carry the count,
     and the start is the caller's — one under the plain rule,
     two under Second Cut). A trailer already holding their full
     count is owed nothing — the grant tops up by one toward the
     start, never past it; at a starting count of one this is
     exactly the D2 rule as first dealt. Both engines ask this
     one question (the table of its seats, the online host of
     its mirror of the room — the room itself answers it
     authoritatively when the break message lands). */
  function windSeatsFor(seats, startCount) {
    if (!seats || !seats.length) return [];
    var start = (typeof startCount === "number" && startCount > 0) ? startCount : 1;
    var min = Math.min.apply(null, seats.map(function (s) { return s.score; }));
    return seats.filter(function (s) { return s.score === min && s.cut < start; }).map(function (s) { return s.seat; });
  }
  /* Compose the break from a normalised table — seats:
     [{seat, name, score, cut}] for everyone in the show. Pure: the
     same seats + facts always compose the same card. */
  function breakView(seats, facts, doneRound, pot, windNames, rules) {
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
    /* Pass N2: under Second Cut the pockets hold two apiece, and
       the row says so — a holder may also have spent one. Under
       the plain rule the wording is the D2 row, unchanged. */
    if (rules && rules.secondCut) {
      if (!spent.length) cutLine = "Nobody has spent both — every pocket still holds a blade.";
      else if (!holders.length) cutLine = "All spent, both apiece — the scissors are put away for the night.";
      else cutLine = joinNames(holders.map(function (s) { return s.name; })) + (holders.length === 1 ? " still holds a blade" : " still hold a blade") +
        " · " + joinNames(spent.map(function (s) { return s.name; })) + (spent.length === 1 ? " has spent both." : " have spent both.");
    }
    else if (!spent.length) cutLine = "Nobody has spent one — every blade is still in its pocket.";
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
    /* Dynamics pass D1: the pot is a recorded fact of the night,
       told like the rest — and, like an unbanked round, it is
       simply absent while it stands at nothing */
    var potLine = (typeof pot === "number" && pot > 0) ? "The pot stands at " + money(pot) + " — the champion takes it all." : null;
    if (potLine) recap += " " + potLine;
    /* Dynamics pass D2: a granted Second Wind is a recorded fact
       of the break, told like the rest — the granted names are
       handed in by whichever engine granted, and the row is
       simply absent when the standings granted nothing. The CUT
       TWO row above already reads the post-grant seats, so this
       row is the explanation, not a second account. */
    var windLine = (windNames && windNames.length)
      ? joinNames(windNames) + (windNames.length === 1 ? " gets" : " get") + " their Cut Two back."
      : null;
    recap += doneRound === 1 ? " Refill something — Double Money does not wait." : " Refill something — the Big Finish does not wait.";
    return {
      leaderLine: leaderLine, bankLine: bankLine, qdLine: qdLine, cutLine: cutLine, potLine: potLine, windLine: windLine,
      /* Pass N2: the night's rules, named on the card in one
         quiet line — present only while a rule is in force,
         omitted entirely under the plain game */
      rulesLine: rulesActive(rules) ? rulesCapsText(rules) : null,
      tease: tease, recap: recap, cap: cap, nextRound: doneRound + 1
    };
  }
  function breakCardHTML(view, btnId) {
    function row(k, v) { return v ? '<div class="fact-row"><span class="fact-k">' + k + '</span><span class="fact-v">' + esc(v) + "</span></div>" : ""; }
    return '<div class="bumper break-card"><div class="round-kicker">THE GILDED HOUR · THE INTERMISSION</div>' +
      '<div class="round-title">THE STORY SO FAR</div>' +
      '<div class="fact-list">' +
      row("THE LEADER", view.leaderLine) + row("BIGGEST BANK", view.bankLine) +
      row("QUICK-DRAW", view.qdLine) + row("THE POT", view.potLine) + row("CUT TWO", view.cutLine) +
      row("SECOND WIND", view.windLine) + row("HOUSE RULES", view.rulesLine) +
      "</div>" +
      '<p class="round-text break-tease">' + esc(view.tease) + "</p>" +
      '<button class="btn-gold" id="' + btnId + '">' + (view.nextRound === 2 ? "BEGIN ROUND TWO" : "BEGIN THE BIG FINISH") + "</button></div>";
  }
  function tableBreakSeats() {
    /* Pass N2: the seats carry the token COUNT now — breakView's
       holders/spent reading is the same truth at any count, and
       windSeatsFor measures the count against the show's start */
    return G.players.map(function (p, i) { return { seat: i, name: p.name, score: p.score, cut: p.cut }; });
  }
  /* the break at the table: G.round has already advanced, so the
     round just played is G.round - 1 — at entry and on a resume
     alike, which is what makes the repaint identical */
  function paintIntermission() {
    stagePhase("intermission");
    audDecider(false); /* V4: the break rests — no hush survives into it */
    setLight(G.round === 2 ? "open" : "hot"); /* the finished round's light — the break rests in it */
    /* Dynamics pass D2: this break's grant, retold from its
       record — the same seats, the same drawn words, on the
       first paint and on a resume alike */
    var wb = (G.windBreak && G.windBreak.round === G.round - 1 && G.windBreak.seats.length) ? G.windBreak : null;
    var view = breakView(tableBreakSeats(), G.facts, G.round - 1, G.pot || 0,
      wb ? wb.seats.map(function (si) { return G.players[si].name; }) : null, G.rules);
    stage(breakCardHTML(view, "btnBreakGo"));
    $("hostLine").textContent = view.recap + (wb && wb.line ? " " + wb.line : "");
    $("btnBreakGo").addEventListener("click", function () { roundIntro(); });
  }
  function beginIntermission() {
    G.phase = "intermission";
    /* Dynamics pass D2 — Second Wind: the grant fires HERE, at
       the moment the break begins — every seat tied for last
       with a spent Cut Two gets it back (house seats included:
       they are seats, and their brains simply hold a token
       again). The tokens are restored in the seats BEFORE the
       card is composed and the save is taken, so the break that
       is painted, saved and resumed is the break that was
       granted; the Sterling words are drawn once, now, and ride
       the state like the golden tease rides its save. */
    /* Pass N2: the grant is one token toward the show's starting
       count — under the plain rule that is the spent trailer's
       one blade back, exactly as D2 dealt it */
    var granted = windSeatsFor(tableBreakSeats(), cutStartOf(G.rules));
    G.windBreak = null;
    if (granted.length) {
      granted.forEach(function (si) { G.players[si].cut = Math.min(G.players[si].cut + 1, cutStartOf(G.rules)); });
      var wNames = granted.map(function (si) { return G.players[si].name; });
      G.windBreak = { round: G.round - 1, seats: granted.slice(), line: authoredLine("wind", { name: joinNames(wNames) }) };
    }
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
    /* Designer's pass P6 (2026-11-11, Jimmy's pick — shape B,
       the ledger): the bumper's wall of prose is now ruled rows
       in the break card's dress. Every fact from the old
       paragraphs survives, one per row; the online game's intro
       keeps its own phone-flavoured text, untouched. */
    var rows = {
      1: [["Questions", "Six — everybody answers every one"],
          ["The wheel", "Sterling spins the category"],
          ["The pay", "$100 easy · $200 medium · $300 hard"],
          ["The drain", "The value melts while the room thinks — commit early"],
          ["The fingers", "1, 2, 3 or 4 when the clock stops — right fingers bank"],
          ["Quick-draw", "First right answer in pockets +$50"],
          ["The streak", "Three in a row starts it — +$25 a bank while it lives"],
          ["Closest number", "Twice this round — shout a number, nearest takes it"]],
      2: (G.rules && G.rules.secondCut)
        ? [["The money", "Same game, double — $200 · $400 · $600"],
           ["Cut Two", "Two tokens each — yours for the whole show"],
           ["What it does", "Called before the fingers go up: two wrong answers vanish for everybody"],
           ["The spend", "Spend them like they matter — because they do"],
           ["The Headline", "The round closes with it — double money again, half the clock"]]
        : [["The money", "Same game, double — $200 · $400 · $600"],
           ["Cut Two", "One token each — yours for the whole show"],
           ["What it does", "Called before the fingers go up: two wrong answers vanish for everybody"],
           ["The spend", "Spend it like it's the last one — it is"],
           ["The Headline", "The round closes with it — double money again, half the clock"]],
      3: [["Questions", "Three"],
          ["The bet", "Before each one, bet on yourself out loud — a chip is $100"],
          ["The chase", "The further behind you are, the more chips you may ride — up to five"],
          ["The pay", "Get it right and the bet pays in full — no drain, no deductions"],
          ["The risk", "Get it wrong and you lose nothing but face"],
          ["The promise", "Nobody leaves this show poorer than they arrived"]]
    };
    var factRows = rows[G.round].map(function (r) {
      return '<div class="fact-row"><span class="fact-k">' + r[0] + '</span><span class="fact-v">' + r[1] + "</span></div>";
    }).join("");
    stage('<div class="bumper break-card"><div class="round-kicker">ROUND ' + G.round + "</div>" +
      '<div class="round-title">' + titles[G.round] + "</div>" +
      '<div class="fact-list">' + factRows + "</div>" +
      (G.round > 1 ? standingsHTML() : "") +
      '<button class="btn-gold" id="btnRoundGo">' + (G.round === 1 ? "START THE WARM-UP" : G.round === 2 ? "DOUBLE IT" : "TO THE BIG FINISH") + "</button></div>");
    /* Rematch Night: on a series show, Sterling's framing of the
       night owns the Round 1 intro — it waits on this screen for
       the host's tap, where the room can actually read the score */
    if (G.round === 1 && G.seriesLine) hostSayText(G.seriesLine);
    else hostSay("r" + G.round);
    /* The Golden Question (pass 4): the tease rides the Round 1
       intro — spoken once per show, appended to whichever line
       owns the bubble (the series framing or the round line).
       The words were drawn at show start and ride the save, so a
       resumed intro re-presents them verbatim */
    if (G.round === 1 && G.goldTease) { var hTease = $("hostLine"); if (hTease) hTease.textContent += " " + G.goldTease; }
    /* House Players (pass 5): the solo arrangement is named at the
       same intro, appended after the tease — the house is never a
       surprise sprung mid-show */
    if (G.round === 1 && G.soloLine) { var hSolo = $("hostLine"); if (hSolo) hSolo.textContent += " " + G.soloLine; }
    /* Pass N2 — House Rules: Sterling names the night's toggles
       at the same intro, appended after the tease and the house
       introduction — drawn at show start, ridden by the save,
       so a resumed intro re-presents the identical words */
    if (G.round === 1 && G.rulesLine) { var hRules = $("hostLine"); if (hRules) hRules.textContent += " " + G.rulesLine; }
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
    /* The Golden Question (pass 4) folds in under the Headline's
       EXACT grammar — value x2, clock halved to the same floor —
       through the same two numbers, so callIt banks the drained
       double through the one earned() path for MCQ and guess
       kinds alike, and the streak / quick-draw bonuses stay flat
       on top, as always. The two folds can never stack: the
       golden slot list excludes the Headline's seat by
       construction. One difference, and it is the whole point:
       the Headline's double is public and displays natively,
       while the golden double is a SECRET — the live value
       display masks it (drawValue and the question card print
       the un-doubled drain) so nothing prices this question at
       double until its reveal. Round 3 never folds (betRound
       pays by chips, not value). */
    var golden = !betRound && isGoldenSlot(G.round, G.qInRound);
    var cur = {
      q: q, kind: kind, cat: q.cat, diff: diff,
      value: betRound ? 0 : BASE_VALUES[diff] * (G.round === 2 ? 2 : 1) * (headline ? 2 : 1) * (golden ? 2 : 1),
      /* Pass N2 — Longer Clock: the stretch folds into the same
         one number everything downstream reads, applied to the
         base BEFORE the Headline/Golden halving, so a doubled
         question runs on half of the LONGER window; rules-off
         the scale is 1 and the figure is the one it always was */
      elapsed: 0, clockTotal: (kind === "num" ? NUM_TIME : QTIME) * winScale() / ((headline || golden) ? 2 : 1),
      opts: null, marks: {}, resolved: false, cutUsed: false, lockOrder: [],
      betRound: betRound, bankValue: 0, headline: headline, golden: golden
    };
    if (kind !== "num") {
      cur.opts = shuffle([{ t: q.a, ok: true }].concat(q.w.map(function (w) { return { t: w, ok: false }; })));
    }
    commitCutPair(cur);
    lastShownValue = null;
    return cur;
  }

  /* The Ten, pass 1 — THE WHEEL, REAL (retires Pass P's chip row).
     The spin is a drawn wheel now: seven segments in the category
     colours, each wearing its emblem and name, a brass rim and hub,
     one fixed needle at the top. The deal still decides everything —
     the wheel is presentation built around the predetermined
     category. wheelRotationFor computes a final rotation — at least
     two full turns on from wherever the wheel last rested — that
     leaves the target segment's CENTRE exactly under the needle, and
     the runner eases the rotor to precisely that angle, so the
     landing is exact by construction: wheelSegAtNeedle(final) is
     the target for every start (drive-wheel proves it with the
     wheel's own math, across every category). The runner keeps the
     retired runner's exact contract — (targetCat, alive, store,
     onDone), timer ids through store, the alive guard on every frame
     and again before onDone, the same 350ms tail — so both engines'
     phase flow downstream of the spin is untouched. Total beat:
     WHEEL_MS + 350 = 2000ms, against the chip plan's measured
     1675 / 2016 / 2356 (min / mean / max over its own rng). */
  var WHEEL_SEG = 360 / 7; /* the bank's seven categories are a locked format fact */
  var WHEEL_MS = 1650;
  var wheelRest = 0; /* where the wheel last stopped — a real wheel starts there */
  function wheelMod(a, n) { return ((a % n) + n) % n; }
  /* the segment index under the fixed needle at rotation rot:
     the wheel point at the needle has wheel-angle -rot (mod 360) */
  function wheelSegAtNeedle(rot) { return Math.floor(wheelMod(-rot, 360) / WHEEL_SEG) % CATS.length; }
  function wheelRotationFor(targetCat, fromRot) {
    var ti = CATS.indexOf(targetCat); if (ti < 0) ti = 0;
    var centre = (ti + 0.5) * WHEEL_SEG;
    var base = fromRot + 720; /* two full turns, minimum */
    return base + wheelMod(-centre - base, 360);
  }
  function wheelEase(f) { return 1 - Math.pow(1 - f, 4); } /* fast start, long settle */
  function wheelPolar(r, deg) { var a = deg * Math.PI / 180; return [200 + r * Math.sin(a), 200 - r * Math.cos(a)]; }
  function wheelFrameHTML(targetCat) {
    var parts = [];
    parts.push('<svg class="wheel-svg" viewBox="0 0 400 400" aria-hidden="true">');
    parts.push('<defs><linearGradient id="wheelBrass" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#FFE29A"/><stop offset=".45" stop-color="#C9971F"/>' +
      '<stop offset=".75" stop-color="#8A5E0D"/><stop offset="1" stop-color="#FFD76A"/></linearGradient></defs>');
    parts.push('<circle cx="200" cy="200" r="195" fill="#150820"/>');
    parts.push('<circle cx="200" cy="200" r="195" fill="none" stroke="url(#wheelBrass)" stroke-width="6"/>');
    parts.push('<g class="wheel-rotor" transform="rotate(' + wheelRest + ' 200 200)">');
    CATS.forEach(function (cat, i) {
      var cs = catStyle(cat), a0 = i * WHEEL_SEG, a1 = a0 + WHEEL_SEG, am = a0 + WHEEL_SEG / 2;
      var p1 = wheelPolar(184, a0), p2 = wheelPolar(184, a1), p3 = wheelPolar(63, a1), p4 = wheelPolar(63, a0);
      parts.push('<path d="M' + p4[0].toFixed(1) + "," + p4[1].toFixed(1) +
        " L" + p1[0].toFixed(1) + "," + p1[1].toFixed(1) +
        " A184,184 0 0 1 " + p2[0].toFixed(1) + "," + p2[1].toFixed(1) +
        " L" + p3[0].toFixed(1) + "," + p3[1].toFixed(1) +
        " A63,63 0 0 0 " + p4[0].toFixed(1) + "," + p4[1].toFixed(1) +
        ' Z" fill="' + cs.mid + '" stroke="#150820" stroke-width="2.5"/>');
      var bp = wheelPolar(178, a0);
      parts.push('<circle cx="' + bp[0].toFixed(1) + '" cy="' + bp[1].toFixed(1) + '" r="3.4" fill="#FFD76A" opacity=".85"/>');
      parts.push('<g transform="rotate(' + am.toFixed(2) + ' 200 200)">' +
        '<svg x="176" y="53" width="48" height="48" viewBox="0 0 48 48"><use href="#' + (CATEMBLEM[cat] || "") + '"/></svg>' +
        '<text class="wheel-label" x="200" y="34" fill="' + (CATTX[cat] || "#FFF6E8") + '">' + esc(cat.toUpperCase()) + "</text></g>");
    });
    parts.push("</g>");
    parts.push('<circle cx="200" cy="200" r="57" fill="#24102F" stroke="url(#wheelBrass)" stroke-width="4"/>');
    parts.push('<svg x="168" y="168" width="64" height="64" viewBox="0 0 120 120"><use href="#emblem"/></svg>');
    parts.push("</svg>");
    return '<div class="wheel-frame" data-target="' + esc(targetCat || "") + '"><div class="wheel-needle"></div>' + parts.join("") + "</div>";
  }
  function runWheel(targetCat, alive, store, onDone) {
    var frame = document.querySelector(".wheel-frame");
    var rotor = frame ? frame.querySelector(".wheel-rotor") : null;
    var needle = frame ? frame.querySelector(".wheel-needle") : null;
    function storeId(id) { if (store) store(id); }
    var from = wheelRest, to = wheelRotationFor(targetCat, from);
    if (frame) frame.setAttribute("data-rot", String(Math.round(to * 100) / 100));
    if (!rotor) { storeId(setTimeout(function () { if (alive()) onDone(); }, 60)); return; }
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    var lastRot = from, lastSeg = wheelSegAtNeedle(from), flick = 1;
    function frameStep() {
      if (!alive()) { storeId(null); return; }
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      var f = (now - t0) / WHEEL_MS; if (f > 1) f = 1;
      var rot = from + (to - from) * wheelEase(f);
      rotor.setAttribute("transform", "rotate(" + rot.toFixed(2) + " 200 200)");
      var seg = wheelSegAtNeedle(rot);
      if (seg !== lastSeg) {
        /* a segment boundary just passed the needle: tick, at a
           volume riding the actual angular velocity of this frame */
        Snd.wheelTick(Math.min(1, Math.abs(rot - lastRot) / (WHEEL_SEG * 0.6)));
        if (needle) { flick = -flick; needle.style.transform = "translateX(-50%) rotate(" + (flick * 7) + "deg)"; }
        lastSeg = seg;
      }
      lastRot = rot;
      if (f < 1) { storeId(setTimeout(frameStep, 16)); return; }
      /* landed — the exact angle, the clunk, the bloom, then the
         same 350ms held breath the chip plan ended on */
      wheelRest = to;
      rotor.setAttribute("transform", "rotate(" + to + " 200 200)");
      if (frame) frame.setAttribute("data-landed", targetCat);
      if (needle) { needle.style.transform = "translateX(-50%)"; needle.classList.remove("land"); void needle.offsetWidth; needle.classList.add("land"); }
      Snd.wheelClunk();
      stageBloom(targetCat);
      storeId(setTimeout(function () { if (alive()) onDone(); }, 350));
    }
    storeId(setTimeout(frameStep, 30));
  }

  /* ---------- the spin (Sterling chooses the category — pure theatre) ---------- */
  function spinBeat() {
    G.phase = "spin"; stagePhase("spin");
    seatsVisible(true);
    updateTop(); renderSeats();
    stage('<div class="q-cat">STERLING SPINS THE CATEGORIES</div>' +
      (G.cur.headline ? '<div class="hl-slot"><span class="headline-banner inflow">★ THE HEADLINE QUESTION ★</span></div>' : "") +
      wheelFrameHTML(G.cur.cat) +
      '<p class="round-text">Where it stops, nobody knows. Sterling knows. Sterling always knows.</p>');
    if (G.cur.special && G.cur.intro) $("hostLine").textContent = G.cur.intro;
    else if (G.cur.headline) { G.cur.headlineSaid = true; hostSay("headline", { cat: G.cur.cat }); }
    else hostSay("spin", { cat: G.cur.cat });
    Snd.play("spin");
    stClass("st-glance", 1600);
    clearInterval(spinTimer);
    runWheel(G.cur.cat,
      function () { return !!G && G.phase === "spin"; },
      function (id) { spinTimer = id; },
      function () { entArm(G.cur); askCurrent(); });
    saveTableShow();
  }

  /* G3: the projected standings strip. Painted from live state
     on every beat render (a resumed beat repaints betBeat, so
     the strip is rebuilt from the bets as they stand — no stale
     figures), and repainted inside the stepper handler so the
     sort follows a chip the moment it moves. Since the
     designer's pass P11 (2026-11-11) the strip is the desks'
     shared header (#deskHead via paintDeskHead); the painting
     itself is unchanged. */
  function paintProjector() {
    var strip = $("projStrip");
    if (!strip || !G) return;
    var rows = projStandings(G.players.map(function (p) { return { score: p.score, bet: p.bet || 1 }; }));
    strip.innerHTML = rows.map(function (r) {
      var p = G.players[r.seat];
      var mv = r.move > 0 ? '<span class="proj-move up">▲' + r.move + "</span>"
        : r.move < 0 ? '<span class="proj-move down">▼' + (-r.move) + "</span>"
        : '<span class="proj-move flat">—</span>';
      return '<span class="proj-seat">' + mv +
        '<span class="name-dot" style="background:' + p.color + '"></span>' +
        '<span class="proj-name">' + esc(p.name) + "</span>" +
        '<span class="proj-amt">' + money(r.proj) + "</span></span>";
    }).join("");
  }

  /* ---------- the Big Finish bet beat ---------- */
  function betBeat() {
    G.phase = "bet"; stagePhase("bet");
    var caps = G.players.map(function (_, i) { return tableBetCap(i); });
    G.players.forEach(function (p, i) { p.bet = Math.max(1, Math.min(caps[i], p.bet || 1)); });
    /* House Players (pass 5): house seats bet by policy — their
       read of the coming question's band, leaned on with both
       hands: three chips on a Warm question, two on a Middle, one
       on a Deep Cut — under the same Long Shot cap as every seat */
    G.players.forEach(function (p, i) {
      if (p.house != null) p.bet = Math.max(1, Math.min(caps[i], HOUSE_BET_BY_BAND[houseBandOf(G.cur)] || 1));
    });
    seatsVisible(true);
    updateTop(); renderSeats();
    /* Designer's pass P11 (2026-11-11): the per-player bet rows
       and the stage's strip are gone — the steppers live on the
       desks (deskBetsHTML, in renderSeats) and the strip is the
       desks' shared header (#deskHead, paintDeskHead). The stage
       keeps only the words and the way on. */
    stage('<div class="round-kicker">THE BIG FINISH · QUESTION ' + (G.qInRound + 1) + " OF 3</div>" +
      '<p class="round-text">Bet on yourself, out loud — a chip is $100; right pays, wrong costs only pride. Chasing the leader? The further behind you are, the more chips you may ride — up to five.</p>' +
      '<button class="btn-gold" id="btnBetsDone">BETS ARE IN — SPIN THE CATEGORY</button>');
    hostSay("bet");
    betLongShotCalled = {};
    $("btnBetsDone").addEventListener("click", spinBeat);
    saveTableShow();
  }
  /* P11: the steppers' one delegated listener — registered once,
     working every show, because the desks rebuild on every beat
     and per-button wiring would die with the first re-render.
     The cap is read at tap time (tableBetCap derives from the
     scores, which never move during the bet beat, so it equals
     the cap betBeat clamped with). */
  var betLongShotCalled = {};
  $("seatsBottom").addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest ? ev.target.closest("[data-bet]") : null;
    if (!b || !G || G.phase !== "bet") return;
    var parts = b.getAttribute("data-bet").split("|");
    var pi = parseInt(parts[0], 10), p = G.players[pi];
    if (!p || p.house != null) return;
    p.bet = Math.max(1, Math.min(tableBetCap(pi), p.bet + parseInt(parts[1], 10)));
    var amt = $("betAmt" + pi);
    if (amt) amt.textContent = betLabel(p.bet);
    if (p.bet >= 4 && betLongShotCalled[pi] !== p.bet) {
      betLongShotCalled[pi] = p.bet;
      $("hostLine").textContent = authoredLine("longshot", { name: p.name, chips: p.bet, amount: money(p.bet * 100) });
    }
    renderSeats();
    paintProjector();
    saveTableShow();
  });

  /* ================= The Ten, pass 6 — Seven Entrances =================
     Every category's question arrives its own way: one keyframed
     class on the question card, played ONLY on a fresh open — the
     wheel's landing at the table, the publish online. A pure skin
     on the open beat: an entrance touches nothing but the card's
     own transform/clip/opacity/filter (the inputs are live from
     the first frame — nothing gates a tap, nothing stops the
     clock), and the drain starts on the same timeline it always
     did, so an entrance can neither gift nor steal a tick of
     value. When the motion ends the classes come off and the
     settled card is byte-for-byte the card that always was.
     Freshness is proven, never assumed. At the table, the two
     fresh call sites — the wheel's onDone and the Decider's deal —
     hand askCurrent a one-shot token keyed to the very question
     object; a repaint through screen() carries no token and paints
     plain. Online, the host and each pad key the moment to
     room + question id in sessionStorage (the host-ticket's own
     store), so a reconnect or refresh mid-question — a snapshot
     repaint — never replays it, while the next question, a new
     id, arrives in character again. The sound is the category
     signature the open beat already plays (Improvement 3); this
     pass adds no voice. Depth is drawn throughout — gradients,
     clip-paths and shadows; no real 3D anything. */
  var ENTSLUG = {
    "Movies": "movies", "TV": "tv", "Music": "music",
    "Ads & Jingles": "ads", "Toys & Games": "toys",
    "Saturday Morning": "sat", "The Dial-Up Years": "dialup"
  };
  function entSlug(cat) { return ENTSLUG[cat] || null; }
  function entRun(host, animEl, slug) {
    if (!host || !animEl || !slug) return;
    host.classList.add("ent", "ent-" + slug);
    var done = false;
    var clean = function () {
      if (done) return; done = true;
      host.classList.remove("ent", "ent-" + slug);
    };
    animEl.addEventListener("animationend", function h(ev) {
      if (ev.target !== animEl || ev.pseudoElement || !/^ent/.test(ev.animationName || "")) return;
      animEl.removeEventListener("animationend", h); clean();
    });
    setTimeout(clean, 950);
  }
  function entApply(wrap, cat) {
    if (!wrap) return;
    entRun(wrap, wrap.querySelector(".q-text") || wrap, entSlug(cat));
  }
  function entPadApply(main, slug) {
    if (!main || !slug) return;
    var el = main.querySelector(".jp-pad, .jp-card");
    entRun(el, el, slug);
  }
  /* the table's fresh-open token: the question object itself */
  var entTokenQ = null;
  function entArm(q) { entTokenQ = q || null; }
  function entTake(q) { var ok = !!q && entTokenQ === q; entTokenQ = null; return ok; }
  /* online freshness: room + qid, once per browser session */
  var entSeenMem = {};
  function entOnce(key) {
    if (!key) return false;
    if (entSeenMem[key]) return false;
    entSeenMem[key] = 1;
    try {
      var s = JSON.parse(sessionStorage.getItem("gh_ent_seen") || "{}");
      if (s[key]) return false;
      s[key] = 1;
      sessionStorage.setItem("gh_ent_seen", JSON.stringify(s));
    } catch (e) {}
    return true;
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
    return '<div class="q-headrow"><span class="cat-pill' + (c.special ? " gilded" : "") + (c.headline ? " headline" : "") + '">' + catEmblem(c.cat) + pill + '</span>' + bandTagHTML(c.q && c.q.d) + '<span class="q-kind">' + head + "</span></div>" +
      stakeRibbonHTML(c.stake, G.players) +
      '<div class="q-cardwrap">' + (c.headline ? '<div class="headline-banner">★ THE HEADLINE QUESTION ★</div>' : "") +
      '<div class="q-text' + (c.headline ? " headline-card" : "") + wearCls(G.round, false) + '">' + esc(c.q.q) + cardDressHTML(c.betRound ? 1 : meltMult(c.elapsed, c.clockTotal)) + "</div></div>" +
      '<div class="q-meta">' +
      (c.betRound
        ? '<div class="q-for">Bets are in — this one pays the bet, and only the bet.</div>'
        : '<div class="q-value">' + meltHTML(!!c.headline, meltMult(c.elapsed, c.clockTotal)) + '<div class="q-valmain"><small>QUESTION VALUE</small><span id="qValue">' + money(c.golden ? c.value / 2 : c.value) + "</span></div></div>") +
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
    return '<div class="q-headrow"><span class="cat-pill' + (c.headline ? " headline" : "") + '">' + catEmblem(c.cat) + esc(c.cat.toUpperCase()) + (c.headline ? " · HEADLINE" : "") + '</span>' + bandTagHTML(c.q && c.q.d) + '<span class="q-kind">CLOSEST NUMBER</span></div>' +
      stakeRibbonHTML(c.stake, G.players) +
      '<div class="q-cardwrap">' + (c.decider ? '<div class="headline-banner decider-banner">★ THE DECIDER ★</div>' : (c.headline ? '<div class="headline-banner">★ THE HEADLINE QUESTION ★</div>' : "")) +
      '<div class="q-text' + (c.headline ? " headline-card" : "") + wearCls(G.round, !!c.decider) + '">' + esc(c.q.q) + cardDressHTML((c.decider || c.betRound) ? 1 : meltMult(c.elapsed, c.clockTotal)) + "</div></div>" +
      '<div class="q-meta">' +
      (c.decider
        ? '<div class="q-for">No money on this one — the crown only.</div>'
        : c.betRound
        ? '<div class="q-for">Bets are on — the closest shout takes their bet money.</div>'
        : '<div class="q-value">' + meltHTML(!!c.headline, meltMult(c.elapsed, c.clockTotal)) + '<div class="q-valmain"><small>QUESTION VALUE</small><span id="qValue">' + money(c.golden ? c.value / 2 : c.value) + "</span></div></div>") +
      timerHTML() + "</div>" +
      '<div class="q-for">' + (c.decider ? vsLine : "No options. No hiding. Think of a number — shout it when Sterling calls it.") + "</div>" +
      '<div style="margin-top:14px"><button class="btn-gold" id="btnCallIt">CALL IT — NUMBERS OUT</button></div>';
  }
  function toolsHTML() {
    if (!G.cur || G.cur.kind === "num") return "";
    var h = '<div class="tools">';
    G.players.forEach(function (p, i) {
      /* House Players (pass 5): a house seat's lifeline is spent by
         its own policy, never by the host's hand — its tool stands
         in the row (the row's shape is the show's grammar) but
         carries no data-cut and never arms */
      if (p.house != null) {
        h += '<button class="tool-btn" disabled>CUT TWO<small>' + esc(p.name) + '<span class="ct-rest"> plays their own</span></small></button>';
      } else {
        h += '<button class="tool-btn" data-cut="' + i + '"' + (p.cut > 0 && !G.cur.cutUsed ? "" : " disabled") + ">CUT TWO<small>" + esc(p.name) + '<span class="ct-rest">' + (p.cut >= 2 ? "'s lifeline · two in hand" : "'s one lifeline") + "</span></small></button>";
      }
    });
    h += '<button class="tool-btn" id="btnCallIt">CALL IT<small>everybody — fingers up</small></button>';
    return h + "</div>";
  }
  function askCurrent() {
    /* Visual pass V2: a fresh question buries the last reveal's
       flinch (the cur-keyed guard already refuses it; this keeps
       the state honest rather than merely unreachable) */
    tableWince = null;
    if (tableWinceTimer) { clearTimeout(tableWinceTimer); tableWinceTimer = null; }
    G.phase = "question"; stagePhase("question");
    audDecider(!!(G.cur && G.cur.decider)); /* V4: the Decider hushed from its first second */
    applyCat(G.cur.cat); setCatBackdrop(G.cur.cat);
    /* G2: the stakes snapshot — computed once, here at the open,
       from the standings as they stand; the card painters below
       (and any repaint of this question) wear exactly this */
    G.cur.stake = stakeCallout(tableStakeCtx());
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
      else if (!G.cur.headline) hostSay(G.cur.q && G.cur.q.d === 3 ? "deepcut" : "numQ", { cat: G.cur.cat });
    } else {
      stage(questionHTML());
      if (!G.cur.headline) hostSay(G.cur.q && G.cur.q.d === 3 ? "deepcut" : "read", { cat: G.cur.cat });
    }
    if (entTake(G.cur)) entApply(document.querySelector("#stage .q-cardwrap"), G.cur.cat);
    if (G.cur.headline && !G.cur.headlineSaid) { G.cur.headlineSaid = true; hostSay("headline", { cat: G.cur.cat }); }
    Snd.playSignature(G.cur.cat);
    stSweep();
    wireQuestion();
    houseRolls();
    startClock(G.cur.clockTotal, function () { callIt(); });
    saveTableShow();
  }
  /* Gameplay-visuals pass G6 — CUT TWO, PREVIEWED. The honesty
     premise: a preview can only show what a spend WILL cut if the
     pair is already committed, so the pair is committed HERE, at
     the deal — two of the question's three wrong answers, drawn on
     a DEDICATED mulberry32 stream seeded from the live rng state
     (read, never advanced: the shared stream's draw sequence stays
     bit-identical, so the house rolls and every other seeded beat
     are untouched) folded with a hash of the question's text. The
     distribution is the old spend-time roll's own — uniform over
     the three wrong answers, two kept — and nothing before a spend
     can remove an answer (answers go `gone` only BY a cut, and a
     question allows one), so the committed pair is always exactly
     the pair the old roll could have landed on. useCut consumes
     the committed pair and nothing else; the pair rides the table
     save, so a resume keeps the very commitment it was dealt. A
     save written before this pass carries no pair — the first
     touch (a preview or the spend itself) commits it then, from
     the same untouched wrong answers, by the same rule. */
  function commitCutPair(c) {
    if (!c || c.cutPair || c.cutUsed || c.kind === "num" || !c.opts) return;
    var wrong = [];
    c.opts.forEach(function (o, ix) { if (!o.ok && !o.gone) wrong.push(ix); });
    if (wrong.length < 2) return;
    var h = 2166136261, s = (c.q && c.q.q) || "";
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    var r = mulberry32((h ^ rngBox.a) | 0);
    for (var k = wrong.length - 1; k > 0; k--) { var j = Math.floor(r() * (k + 1)); var t = wrong[k]; wrong[k] = wrong[j]; wrong[j] = t; }
    c.cutPair = wrong.slice(0, 2).sort(function (a, b) { return a - b; });
  }
  /* the ghost: the committed pair wears the cut's slashed seam at
     ghost strength while a hold lasts. Pure presentation — it
     spends nothing, saves nothing, and leaves no trace on release:
     the classes come off and the slabs are the slabs again. */
  var CUT_HOLD_MS = 350;
  var cutGhostPair = null;
  function cutGhostShow(c0) {
    if (!G || G.cur !== c0 || G.phase !== "question") return;
    commitCutPair(c0);
    if (!c0.cutPair) return;
    cutGhostPair = c0.cutPair.slice();
    document.querySelectorAll(".answers .ans-btn").forEach(function (b, ix) {
      if (cutGhostPair.indexOf(ix) >= 0) b.classList.add("cutghost");
    });
  }
  function cutGhostHide() {
    cutGhostPair = null;
    document.querySelectorAll(".ans-btn.cutghost").forEach(function (b) { b.classList.remove("cutghost"); });
  }
  /* if the stage is rebuilt mid-hold (the clock calls it, a spend
     lands), the held button may never see its own release — the
     document hears it and puts the ghost away */
  document.addEventListener("pointerup", cutGhostHide);
  document.addEventListener("pointercancel", cutGhostHide);
  /* The gesture grammar for a Cut Two control, the same at the
     table and on a pad: a TAP spends (press and release under the
     hold threshold, released on the control); holding past the
     threshold is a PREVIEW for as long as the hold lasts, and
     releasing a preview NEVER spends, wherever the release lands.
     Sliding off or a cancelled press ends everything unspent.
     Two press-less arrivals spend, as a click always has: a
     keyboard/synthetic click (detail 0), and a real click whose
     pointer press never reached this control at all (a stream
     eaten upstream — the click is the only evidence of the tap,
     and the old wiring spent on it). A click trailing a RECORDED
     pointer press is that press's echo and is ignored: the press
     already settled itself, by spending or by previewing. */
  function wireCutHold(btn, hooks) {
    var downAt = 0, timer = null, previewing = false, lastDownAt = 0, seq = 0, previewSeq = -1;
    function endPress(spendIt, ev) {
      if (!downAt) return;
      downAt = 0;
      if (timer) { clearTimeout(timer); timer = null; }
      var was = previewing; previewing = false;
      btn.classList.remove("holding");
      if (was) { previewSeq = seq; hooks.hide(); return; }
      if (spendIt) {
        if (ev && ev.clientX != null) {
          var r = btn.getBoundingClientRect();
          if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return;
        }
        hooks.spend();
      }
    }
    btn.addEventListener("pointerdown", function () {
      if (btn.disabled) return;
      seq++;
      downAt = Date.now(); lastDownAt = downAt; previewing = false;
      timer = setTimeout(function () {
        timer = null;
        if (!downAt) return;
        previewing = true;
        btn.classList.add("holding");
        hooks.show();
      }, CUT_HOLD_MS);
    });
    btn.addEventListener("pointerup", function (e) { endPress(true, e); });
    btn.addEventListener("pointercancel", function () { endPress(false, null); });
    btn.addEventListener("pointerleave", function () { endPress(false, null); });
    btn.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    btn.addEventListener("click", function (e) {
      if (downAt || previewing) return;
      if (e.detail === 0) { hooks.spend(); return; }
      /* the echo of a settled preview is ignored WITHOUT the
         clock: the 1000ms recency window below used to be the only
         guard, so a preview held past a second — or a release whose
         click handling starved on a slow host — fell through it and
         SPENT on release, breaking the grammar this function states
         ( Audit A3: drive-cutpreview T3/P2, holds of ~0.8s landing
         past the window under load). A preview's release never
         spends, however long the hold or the machine took. */
      if (seq === previewSeq) return;
      if (!lastDownAt || Date.now() - lastDownAt > 1000) hooks.spend();
    });
  }
  function wireQuestion() {
    document.querySelectorAll("[data-cut]").forEach(function (b) {
      var seat = parseInt(b.getAttribute("data-cut"), 10);
      var c0 = G.cur;
      wireCutHold(b, {
        show: function () { cutGhostShow(c0); },
        hide: cutGhostHide,
        spend: function () { useCut(seat); }
      });
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
    /* G6: the spend consumes the pair committed at the deal (a
       pre-pass save commits its pair here, at first touch, by the
       same rule) — what a hold previewed is what falls */
    commitCutPair(c);
    (c.cutPair || []).forEach(function (ix) {
      var o = c.opts[ix];
      if (o && !o.ok) { o.gone = true; o.cut = true; }
    });
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
    houseLapseCuts();
    G.cur.bankValue = G.cur.betRound ? 0 : earned(G.cur.value, G.cur.elapsed, G.cur.clockTotal);
    voteBeat();
  }
  function voteBeat() {
    G.phase = "vote-count";
    G.cur.marks = {};
    G.cur.lockOrder = [];
    G.cur.lockTimes = {};
    G.cur.lockSeq = 0;
    G.cur.voteAt = null;
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
  /* Designer's pass P9 (2026-11-11): the mark screen keeps the
     answers on stage, dimmed — the room watches each marked
     seat's face gather on the right slab as the host taps,
     instead of marking against a question that vanished. The
     correct slab is the one wearing chips; a cut slab can never
     wear one (a cut option is never the answer). Guess questions
     (no slabs) and the Decider keep their text-only screen. */
  function markGridHTML() {
    var c = G.cur;
    if (!c || !c.opts || c.decider) return "";
    var btns = c.opts.map(function (o, i) {
      return '<button class="ans-btn' + (o.gone ? " cut" : "") + '" disabled>' +
        '<span class="letter">' + (i + 1) + '</span><span>' + esc(o.t) + '</span><span class="vote-chips"></span></button>';
    }).join("");
    return '<div class="answers marking">' + btns + "</div>";
  }
  function paintVoteChips() {
    var grid = document.querySelector(".answers.marking");
    if (!grid || !G || !G.cur || !G.cur.opts) return;
    var okIx = -1;
    G.cur.opts.forEach(function (o, i) { if (o.ok) okIx = i; });
    var slabs = grid.querySelectorAll(".ans-btn");
    slabs.forEach(function (b) { var box = b.querySelector(".vote-chips"); if (box) box.innerHTML = ""; });
    if (okIx < 0 || !slabs[okIx]) return;
    var box = slabs[okIx].querySelector(".vote-chips");
    if (!box) return;
    var order = (Array.isArray(G.cur.lockOrder) && G.cur.lockOrder.length) ? G.cur.lockOrder : Object.keys(G.cur.marks || {}).map(Number);
    var h = "";
    order.forEach(function (i) {
      if (!G.cur.marks || !G.cur.marks[i]) return;
      var p = G.players[i]; if (!p) return;
      h += '<span class="vote-chip pod' + i + '" title="' + esc(p.name) + '">' + avatarSVG(snapAvatar(p, i), "neutral", i) + "</span>";
    });
    box.innerHTML = h;
  }
  function markScreen() {
    G.phase = "vote";
    renderSeats();
    stage('<div class="q-headrow"><span class="cat-pill">' + catEmblem(G.cur.cat) + esc(G.cur.cat.toUpperCase()) + '</span><span class="q-kind">WHO HAD IT?</span></div>' +
      '<div class="q-text' + wearCls(G.round, !!G.cur.decider) + '" style="font-size:clamp(18px,3vw,25px)">' + esc(G.cur.q.q) + cardDressHTML((G.cur.decider || G.cur.betRound) ? 1 : meltMult(G.cur.elapsed, G.cur.clockTotal)) + "</div>" +
      '<p class="round-text">' + (G.cur.decider && G.decider
        ? "Only the tied leaders play this one. Who called the closest number? Tap their seat — a dead heat between them, tap both, and the Decider goes again."
        : G.cur.kind === "num"
        ? "Who called the closest number? Tap their seat — tap two seats if it's a dead heat."
        : "Tap the seat of everyone holding up the right fingers. Wrong fingers, no tap — and nobody loses a thing either way.") + "</p>" +
      markGridHTML() +
      '<button class="btn-gold" id="btnReveal">REVEAL THE ANSWER</button>');
    hostSay("mark");
    G.cur.voteAt = Date.now();
    housePreMark();
    paintVoteChips();
    $("btnReveal").addEventListener("click", revealAnswer);
    saveTableShow();
  }

  /* ================= The Ten, pass 3 — SHOW THE BAND =================
     The Difficulty Ramp (Design pass 5) dealt every question a band
     — 1 Warm, 2 Middle, 3 Deep Cut — and until now the band was the
     dealer's private knowledge, shaping the show from backstage.
     This pass prints it: a small engraved tag in the question
     card's header line, beside the category, on the table card,
     the online host card and every pad, from question open through
     the reveal (every header repaint carries it). The table reads
     the dealt entry itself (c.q.d); online, the band is public
     protocol — the host names it on publish, the room validates
     and deals it back in the snapshot's question view, and screens
     read THAT (falling back to the host's own dealt entry, the
     very record it published). A question with no band — the
     nightly special, whose served shape carries none — wears no
     tag; a band is never invented. Wording is exact and learned
     by the room: WARM · MIDDLE · DEEP CUT. */
  var BAND_WORDS = { 1: "WARM", 2: "MIDDLE", 3: "DEEP CUT" };
  function bandWord(d) { return (d === 1 || d === 2 || d === 3) ? BAND_WORDS[d] : null; }
  function bandTagHTML(d) {
    var w = bandWord(d);
    return w ? '<span class="band-tag b' + d + '">' + w + "</span>" : "";
  }
  function jpBandLine(d) {
    var w = bandWord(d);
    return w ? '<div class="jp-bandline b' + d + '">· ' + w + " ·</div>" : "";
  }
  /* Dynamics pass D1: the pot rides the pad's question and result
     cards as one small line — read off the snapshot the pad
     already holds (the room's pot is public from the first
     question), so a refreshed pad tells the same figure. A
     snapshot from a room that predates the pot carries no field
     and the line simply doesn't appear. */
  function jpPotLine() {
    var pot = JP && JP.snap ? JP.snap.pot : null;
    return (typeof pot === "number") ? '<div class="jp-potline">THE POT · ' + money(pot) + "</div>" : "";
  }
  /* Gameplay-visuals pass G5: the pad's own line of the photo-
     finish truth — where THIS player came in the race, computed
     from the reveal's lockMs alone. Silence when the pad wasn't a
     correct finisher, when the question wasn't a 'normal' one, or
     when the room is too old to carry lockMs at all. */
  function jpPhotoLine(lr) {
    if (!lr || lr.decider || lr.kind !== "normal") return "";
    var fin = (lr.results || []).filter(function (r) { return r.correct && r.lockMs != null; })
      .sort(function (a, b) { return a.lockMs - b.lockMs; });
    var rank = -1;
    fin.forEach(function (r, i) { if (r.seat === JP.seat) rank = i; });
    if (rank < 0) return "";
    if (fin.length === 1) return "ONLY FINISHER — QUICK DRAW +$50";
    if (rank === 0) return "FIRST IN — QUICK DRAW +$50";
    var ord = ["", "1ST", "2ND", "3RD", "4TH", "5TH", "6TH", "7TH", "8TH"][rank + 1] || (rank + 1) + "TH";
    return "YOU WERE " + ord + " IN — " + pfMargin(fin[rank].lockMs - fin[0].lockMs);
  }
  /* online, the band of the question on screen: the snapshot's
     public view first (the room's dealt fact), the host's own
     dealt entry behind it */
  function ogBandOf(q, e) {
    if (q && q.band != null) return q.band;
    return e && e.bank ? e.bank.d : null;
  }

  /* ================= The Ten, pass 2 — THE NUMBER DIAL =================
     Closest-number reveals get a machine, in two forms from one
     geometry, because the two rooms honestly hold different data.
     Online, every player's number exists (the pads submitted them;
     the reveal payload carries them), so the host paints the
     SPREAD: a brass rail spanning the padded extent of guesses ∪
     truth, a standing pin per guess in the seat's colour, the
     truth as a brass gate, and a needle that sweeps from the low
     end and stops dead ON the truth. At the table the numbers are
     shouted and never entered — only the closest seats are marked
     — so the table paints the COUNT: an odometer that races up
     from zero and lands exactly on the truth, which then takes the
     big-number treatment it has always had. No number is invented
     anywhere: the spread is drawn only from payload results, and
     the count shows only the truth. Pads get the settled spread —
     the map without the sweep; the sweep is host theatre. Survey
     reveals are answer reveals and are untouched.
     Depth is drawn, per the standing rule: pins stand on painted
     shadows with a lit top edge, the rail is brass with a bright
     top rim, the gate a framed portal — flat code, dimensional
     read, no 3D engine anywhere near it. */

  /* The geometry, pure: (guesses, truth) -> positions. guesses are
     {seat, name, num, crown?}; entries with num == null are not
     guesses and are dropped. The extent is the guesses ∪ truth,
     padded by 12% of the span on each side (a span of zero pads by
     5% of the value, floor 1), so no pin or the gate ever sits on
     the rail's very ends. Positions are percentages of that extent.
     A pin's distance is |num - truth|. Crowns: if ANY guess
     carries an explicit crown flag (the server's own verdict,
     online), crowns are taken verbatim; otherwise the closest by
     distance wear them, ties sharing. Rows: pins sort by position;
     a pin whose label would crowd the previous pin on a row (under
     11% of rail away) takes the other row — equal guesses always
     split across the two rows, a third at one spot falls back to
     row 0 rather than inventing a third. */
  var DIAL_PAD_FRAC = 0.12, DIAL_LABEL_GAP = 11;
  function dialLayout(guesses, truth) {
    var gs = (guesses || []).filter(function (g) { return g && g.num != null && isFinite(Number(g.num)); })
      .map(function (g) {
        return { seat: g.seat, name: g.name, num: Number(g.num), crown: g.crown != null ? !!g.crown : null };
      });
    var vals = gs.map(function (g) { return g.num; }); vals.push(truth);
    var lo0 = Math.min.apply(null, vals), hi0 = Math.max.apply(null, vals);
    var span = hi0 - lo0;
    var padAmt = span > 0 ? span * DIAL_PAD_FRAC : Math.max(1, Math.abs(truth) * 0.05);
    var lo = lo0 - padAmt, hi = hi0 + padAmt;
    function pct(v) { return (v - lo) / (hi - lo) * 100; }
    var anyCrown = gs.some(function (g) { return g.crown != null; });
    var minDist = null;
    gs.forEach(function (g) {
      g.dist = Math.abs(g.num - truth);
      if (minDist === null || g.dist < minDist) minDist = g.dist;
    });
    gs.forEach(function (g) {
      g.closest = anyCrown ? !!g.crown : (minDist !== null && g.dist === minDist);
      g.pct = pct(g.num);
    });
    gs.sort(function (a, b) { return (a.pct - b.pct) || (a.seat - b.seat); });
    var rowLast = [-Infinity, -Infinity];
    gs.forEach(function (g) {
      var row = 0;
      if (g.pct - rowLast[0] < DIAL_LABEL_GAP) row = (g.pct - rowLast[1] < DIAL_LABEL_GAP) ? 0 : 1;
      g.row = row; rowLast[row] = g.pct;
    });
    return { lo: lo, hi: hi, truthPct: pct(truth), pins: gs };
  }
  function dialFmt(n) { return Number(n).toLocaleString("en-US"); }
  /* the spread's guesses from a reveal payload: the seats that
     actually entered a number, crowned by the server's verdict */
  function dialGuesses(players, results) {
    return (results || []).filter(function (res) { return res.num != null; }).map(function (res) {
      var p = players && players[res.seat];
      return { seat: res.seat, name: p ? p.name : "Player " + (res.seat + 1), num: res.num, crown: !!res.correct };
    });
  }
  function spreadDialHTML(guesses, truth, opts) {
    opts = opts || {};
    var L = dialLayout(guesses, truth);
    var pins = L.pins.map(function (p) {
      var edge = p.pct < 9 ? " edge-l" : p.pct > 91 ? " edge-r" : "";
      return '<div class="dial-pin r' + p.row + (opts.mine === p.seat ? " mine" : "") + '" data-seat="' + p.seat + '" data-num="' + p.num + '" data-pct="' + p.pct.toFixed(2) + '" style="left:' + p.pct.toFixed(2) + '%">' +
        '<span class="dial-lab' + (opts.settled ? " lit" : "") + edge + '"><b>' + esc(p.name) + "</b> " + dialFmt(p.num) +
        "<i>" + (p.dist === 0 ? "EXACT" : "off by " + dialFmt(p.dist)) + "</i></span>" +
        '<span class="dial-stem"></span>' +
        '<span class="dial-disc' + (p.closest ? " closest" : "") + '" style="--pin:' + (PCOLORS[p.seat % PCOLORS.length]) + '">' + (p.closest ? "★" : "") + "</span></div>";
    }).join("");
    return '<div class="dial spread' + (opts.pad ? " pad" : "") + (opts.settled ? " landed" : "") + '" data-settled="' + (opts.settled ? "1" : "0") + '" data-truth="' + truth + '" data-truthpct="' + L.truthPct.toFixed(2) + '">' +
      '<div class="dial-rail"></div>' +
      '<div class="dial-gate" style="left:' + L.truthPct.toFixed(2) + '%"><span class="dial-gate-num">' + dialFmt(truth) + "</span></div>" +
      pins +
      '<div class="dial-needle" style="left:' + (opts.settled ? L.truthPct.toFixed(2) : "0") + '%"></div></div>';
  }
  function countDialHTML(truth, settled) {
    return '<div class="count-dial' + (settled ? " landed" : "") + '" data-truth="' + truth + '">' +
      '<div class="wager-amt count-num">' + dialFmt(settled ? truth : 0) + "</div>" +
      '<div class="count-rail"><div class="count-fill" style="width:' + (settled ? "100" : "0") + '%"></div></div></div>';
  }
  /* the sweep discipline is the wheel's: 16ms frames, an ease that
     dies into the stop, a run token + a still-in-the-DOM check so
     a phase change orphans nothing, and a snap — tapping the dial
     (CONTINUE is already on stage) finishes it instantly. The
     needle's final position is ASSIGNED from the layout's truthPct
     at the finish, never accumulated, so the stop is exact by
     construction. A settled repaint never calls the runners at
     all: its markup was born landed. */
  var DIAL_MS = 1600, COUNT_MS = 1500;
  function dialEase(f) { return 1 - Math.pow(1 - f, 4); }
  function dialNow() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function runSpreadDial(dial) {
    if (!dial || dial.getAttribute("data-settled") === "1") return;
    var needle = dial.querySelector(".dial-needle");
    var truthPct = parseFloat(dial.getAttribute("data-truthpct"));
    var pins = Array.prototype.slice.call(dial.querySelectorAll(".dial-pin"));
    var pinPcts = pins.map(function (p) { return parseFloat(p.getAttribute("data-pct")); });
    var run = (dial._dialRun || 0) + 1; dial._dialRun = run;
    var t0 = dialNow(), lastBand = 0, passed = {};
    function finish() {
      if (dial._dialRun !== run) return;
      dial._dialRun = run + 1000;
      if (needle) needle.style.left = truthPct + "%";
      pins.forEach(function (p) { var l = p.querySelector(".dial-lab"); if (l) l.classList.add("lit"); });
      dial.classList.add("landed");
      Snd.wheelClunk();
    }
    dial.addEventListener("click", finish);
    function step() {
      if (dial._dialRun !== run || !document.body.contains(dial)) return;
      var f = (dialNow() - t0) / DIAL_MS; if (f > 1) f = 1;
      var p = truthPct * dialEase(f);
      if (needle) needle.style.left = p + "%";
      pins.forEach(function (pin, i) {
        if (!passed[i] && p >= pinPcts[i] - 0.001) {
          passed[i] = 1;
          var l = pin.querySelector(".dial-lab"); if (l) l.classList.add("lit");
          Snd.dialTick(Math.min(1, pinPcts[i] / 100), true);
        }
      });
      var band = Math.floor(p / 7);
      if (band > lastBand) { lastBand = band; if (f < 1) Snd.dialTick(Math.min(1, p / 100), false); }
      if (f < 1) { setTimeout(step, 16); return; }
      finish();
    }
    setTimeout(step, 30);
  }
  function runCountDial(dial) {
    if (!dial || dial.classList.contains("landed")) return;
    var truth = parseFloat(dial.getAttribute("data-truth"));
    var numEl = dial.querySelector(".count-num");
    var fill = dial.querySelector(".count-fill");
    var run = (dial._dialRun || 0) + 1; dial._dialRun = run;
    var t0 = dialNow(), lastBand = 0;
    function finish() {
      if (dial._dialRun !== run) return;
      dial._dialRun = run + 1000;
      if (numEl) numEl.textContent = dialFmt(truth);
      if (fill) fill.style.width = "100%";
      dial.classList.add("landed");
      Snd.wheelClunk();
    }
    dial.addEventListener("click", finish);
    function step() {
      if (dial._dialRun !== run || !document.body.contains(dial)) return;
      var f = (dialNow() - t0) / COUNT_MS; if (f > 1) f = 1;
      var e = dialEase(f);
      if (numEl) numEl.textContent = dialFmt(Math.round(truth * e));
      if (fill) fill.style.width = (e * 100) + "%";
      var band = Math.floor(e * 14);
      if (band > lastBand) { lastBand = band; if (f < 1) Snd.dialTick(e, false); }
      if (f < 1) { setTimeout(step, 16); return; }
      finish();
    }
    setTimeout(step, 30);
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
  /* ---------- Gameplay-visuals pass G5 — THE PHOTO-FINISH ----------
     The reveal draws the race the quick-draw already judged: the
     correct finishers standing on a slim brass track, in the order
     they locked in, spaced by their margins. One builder serves
     both big screens — the table feeds it the lock order the
     settlement itself used (cur.lockOrder, so the strip can never
     disagree with who took the +$50) with margins from the stamped
     lockTimes the marks and the house seats' simulated lock-ins
     share; the online host feeds it the reveal's correct results
     ordered by the server-received lockMs. It is furniture, not a
     verdict: pure markup from the record, born complete on every
     repaint (a resync rebuilds it identically, with no racing
     animation), and it touches no settlement, timing or line. */
  function pfMargin(ms) { return "+" + (ms / 1000).toFixed(1) + "s"; }
  function photoFinishHTML(finishers, players) {
    if (!finishers || !finishers.length) return "";
    var n = finishers.length;
    var t0 = finishers[0].ms, tN = finishers[n - 1].ms;
    var span = (t0 != null && tN != null) ? (tN - t0) : 0;
    var pos = finishers.map(function (f, i) {
      if (n === 1) return 0;
      if (span > 0 && f.ms != null) return (f.ms - t0) / span * 100;
      return i / (n - 1) * 100;
    });
    /* near-ties would stack their labels: walk the line once and
       hold a minimum gap, order untouched — the labels still carry
       the true margins; the discs just queue politely */
    var GAP = 13;
    for (var i = 1; i < n; i++) if (pos[i] < pos[i - 1] + GAP) pos[i] = pos[i - 1] + GAP;
    if (n > 1 && pos[n - 1] > 100) {
      var over = pos[n - 1] - 100;
      for (var j = 0; j < n; j++) pos[j] = Math.max(0, pos[j] - over);
    }
    var chips = finishers.map(function (f, i) {
      var p = players && players[f.seat];
      var nm = p ? p.name : "Player " + (f.seat + 1);
      var tag;
      if (n === 1) tag = "ONLY FINISHER — +$50";
      else if (i === 0) tag = "FIRST · QUICK DRAW +$50";
      else tag = (f.ms != null && t0 != null) ? pfMargin(f.ms - t0) : "IN";
      var edge = pos[i] < 10 ? " edge-l" : pos[i] > 90 ? " edge-r" : "";
      return '<div class="pf-chip" data-seat="' + f.seat + '" data-ms="' + (f.ms != null ? Math.round(f.ms) : "") + '" style="left:' + pos[i].toFixed(2) + '%">' +
        '<span class="pf-lab' + edge + '"><b>' + esc(nm) + "</b><i>" + tag + "</i></span>" +
        '<span class="pf-disc' + (i === 0 ? " first" : "") + '" style="--pin:' + (PCOLORS[f.seat % PCOLORS.length]) + '">' + (i === 0 ? "★" : "") + "</span></div>";
    }).join("");
    return '<div class="pf-strip"><div class="pf-rail"></div>' + chips + '<div class="pf-cap">PHOTO FINISH</div></div>';
  }
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
  /* Dynamics pass D1 — THE TABLE POT (table settlement half).
     Money nobody banks feeds a pot the champion takes; the online
     room server runs the identical rule (closeQuestion in room.js).
     PURE: given the question in its settled state — the marks ARE
     the answer record at the table — and the seats' bets, it
     returns what this question feeds. Rounds 1-2 feed only on a
     FULL miss, and the figure is the question's settled bankValue:
     the drained amount a winner would have taken, with the
     Headline/Golden doubling already folded into it at deal time.
     The Big Finish has no bankValue, so each seat the room did NOT
     mark feeds its own stake instead — bet x $100. The Decider
     banks $0 by design and feeds nothing. The pot is never a
     score: it is added to the champion's DISPLAYED total and
     recorded purse at the finale, and only there. */
  function tablePotFeed(c, players) {
    if (!c || c.decider) return 0;
    var winners = Object.keys(c.marks || {}).map(Number);
    if (c.betRound) {
      var fed = 0;
      (players || []).forEach(function (p, i) { if (!c.marks[i]) fed += (p.bet || 1) * 100; });
      return fed;
    }
    return winners.length ? 0 : (c.bankValue || 0);
  }
  /* which named pot beat a feed earns, judged against the pot as
     it stood BEFORE this question: the night's first feeding, or
     the feeding that carries the pot past a thousand. Anything
     else feeds quietly — the vessel and the coins tell it. */
  function potMomentFor(before, fed) {
    if (!(fed > 0)) return null;
    if (!(before > 0)) return "first";
    if (before < 1000 && before + fed >= 1000) return "grand";
    return null;
  }
  /* Visual pass V2 — the table's flinch, armed by the LIVE reveal
     and by nothing else: every seat the marks record as a miss (at
     the table the marks ARE the answer record — an unmarked seat
     already slumps and already wears the miss delta; a Decider
     spectator, who never played, is excepted) wears WINCE for the
     reveal's opening ~1.2s, then settles into slump. Transient by
     construction: never saved, keyed to the question object, and
     the resumed-reveal path (paintReveal(true)) never arms it, so
     a repaint lands settled and the wince never replays. */
  function armTableWince() {
    var c = G.cur; if (!c) return;
    var seats = {};
    G.players.forEach(function (p, i) {
      if (c.marks && c.marks[i]) return;
      if (G.decider && G.decider.eligible.indexOf(i) < 0) return;
      seats[i] = 1;
    });
    if (!Object.keys(seats).length) return;
    tableWince = { cur: c, seats: seats };
    if (tableWinceTimer) clearTimeout(tableWinceTimer);
    tableWinceTimer = setTimeout(function () {
      tableWinceTimer = null;
      if (tableWince && tableWince.cur === c) {
        tableWince = null;
        if (G && G.cur === c && G.phase === "reveal") renderSeats();
      }
    }, 1250);
  }
  /* Visual pass V4 — THE AUDIENCE: the house answers the reveal.
     A bank ripples the row (a staggered lift, left to right), an
     all-miss dips it (a sympathetic slump); the class lives ~1.5s
     and is then lifted, and only a LIVE reveal arms it — a resumed
     reveal (paintReveal(true)) and a resynced snapshot (ogOnReveal
     with fromSnap) leave the crowd exactly as they found it. The
     Decider banks nothing, so its reveal never calls this: the
     room stays hushed through the verdict instead. */
  var audTimer = null;
  function audReact(banked) {
    var g = $("scr-game"); if (!g) return;
    g.classList.remove("aud-ripple", "aud-dip");
    void g.offsetWidth; /* restart the pass if a class ever re-lands */
    g.classList.add(banked ? "aud-ripple" : "aud-dip");
    if (audTimer) clearTimeout(audTimer);
    audTimer = setTimeout(function () {
      audTimer = null;
      var gg = $("scr-game");
      if (gg) gg.classList.remove("aud-ripple", "aud-dip");
    }, 1500);
  }
  /* the Decider's hush is the whole question, not just its last
     five seconds (those are .hurry's, and need no help): set at the
     question's open in both engines, lifted at its reveal and at
     the break. A fresh question also sweeps any reaction class a
     previous reveal somehow left standing. */
  function audDecider(on) {
    var g = $("scr-game"); if (!g) return;
    /* Pass N2 — Calm Table: the Decider's hush is part of the
       hurry layer, and a calm house does not hush — the crowd
       keeps its gentle bob even for the crown question */
    if (on && calmNow()) on = false;
    g.classList.toggle("aud-hush", !!on);
    if (on) g.classList.remove("aud-ripple", "aud-dip");
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
      armTableWince();
      audDecider(false); /* V4: no ripple for the Decider — nothing banked; the hush simply lifts */
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
    /* Dynamics pass D1: the pot settles in the same single commit
       as every other dollar this reveal moves — the feed and its
       named beat are recorded on the question (potFed/potMoment),
       so a resumed reveal repaints them instead of re-feeding */
    var potBefore = G.pot || 0;
    var potFed = tablePotFeed(c, G.players);
    G.pot = potBefore + potFed;
    c.potFed = potFed;
    c.potMoment = potMomentFor(potBefore, potFed);
    /* New programme pass 2: the reveal writes the round's facts
       while the numbers are in its hands — biggest bank and the
       quick-draw tally the Intermission will be told from */
    noteFacts(G.facts, G.round, gains, qdSeat, c.cat);
    /* Pass N1: the report card's tallies are written in the same
       commit, from the same gains and the same streak settlement */
    noteReport(c, gains, so);
    buildTableFx();
    /* the last question's reveal settles the final standings — start
       the winner line's generation now, not at the finale screen */
    if (G.round === 3 && G.qInRound === R3_COUNT - 1) winnerPrefetchAtReveal(winnerFactsFrom(G.players));
    potFeedPending = potFed; /* the vessel paints pre-feed; its coins are owed */
    armTableWince();
    audDecider(false); audReact(winners.length > 0); /* V4: the house ripples a bank, dips an all-miss */
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
    setMood(c.decider ? (winners.length === 1 ? "delight" : "sorry") : (winners.length ? "delight" : "sorry"));
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
      stage('<div class="q-headrow"><span class="cat-pill">' + catEmblem(c.cat) + esc(c.cat.toUpperCase()) + '</span>' + bandTagHTML(c.q && c.q.d) + '<span class="q-kind">THE NUMBER WAS</span></div>' +
        goldenCardHTML('<div class="q-text' + (c.headline ? " headline-card" : "") + (c.golden ? " golden-card" : "") + wearCls(G.round, !!c.decider) + '" style="font-size:clamp(18px,3vw,25px)">' + esc(c.q.q) + cardDressHTML(1) + sealHTML(c.golden, settled) + "</div>", c.golden) +
        countDialHTML(Number(c.q.num), settled) +
        dNum +
        whySlip(c.q.why, settled, doubleTag(c.headline, c.golden)) + nextBtn);
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
      /* Gameplay-visuals pass G5: the photo-finish strip joins an
         MCQ reveal — the marked seats in the settlement's own lock
         order, spaced by their stamped times. A repaint rebuilds
         it from the same record; a survey's closest call is not a
         race and a decider never reaches this branch. */
      var pfStrip = "";
      if (c.kind === "mcq") {
        var pfFin = (c.lockOrder || []).filter(function (si) { return c.marks[si]; }).map(function (si) {
          return { seat: si, ms: (c.lockTimes && c.lockTimes[si] != null) ? c.lockTimes[si] * 1000 : null };
        });
        pfStrip = photoFinishHTML(pfFin, G.players);
      }
      stage('<div class="q-headrow"><span class="cat-pill">' + catEmblem(c.cat) + esc(c.cat.toUpperCase()) + '</span>' + bandTagHTML(c.q && c.q.d) + '<span class="q-kind">THE ANSWER</span></div>' +
        goldenCardHTML('<div class="q-text' + (c.headline ? " headline-card" : "") + (c.golden ? " golden-card" : "") + wearCls(G.round, !!c.decider) + '" style="font-size:clamp(18px,3vw,25px)">' + esc(c.q.q) + cardDressHTML(1) + sealHTML(c.golden, settled) + "</div>", c.golden) +
        '<div class="answers">' + btns + "</div>" +
        pfStrip +
        dMcq +
        whySlip(c.q.why, settled, doubleTag(c.headline, c.golden)) + nextBtn);
      var hk = winners.length === 0 ? "allMiss" : (winners.length === G.players.length ? "allHit" : "someHit");
      revealSay(hk, { name: winners.length ? G.players[winners[0]].name : "" }, winners);
      Snd.play(winners.length ? "correct" : "wrong");
    }
    renderSeats();
    /* Visual stage 5: the reveal's first beat is lit — the sweep
       crosses the card as the correct slab lights (its sheen rides
       along), with the footlights' warm-up from stage 1 */
    revealTheatre(settled);
    /* The Ten, pass 2: a live num reveal runs the count dial; a
       settled repaint's dial was born landed in countDialHTML */
    if (c.kind === "num" && !settled) { var cdEl = document.querySelector(".count-dial"); if (cdEl) runCountDial(cdEl); }
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
       and the CLOSEST tag carry its reveal. Pass 7: the flights
       ride the LIVE reveal only (a settled repaint lands as
       shown, coinless), banking seats fly in lock-in order — the
       quick-draw's own record — and each flight is sized by that
       seat's total award for the reveal */
    if (!c.decider && !settled) {
      var flyOrder = winners.slice().sort(function (a, b) {
        var ia = (c.lockOrder || []).indexOf(a), ib = (c.lockOrder || []).indexOf(b);
        if (ia < 0) ia = 100 + a; if (ib < 0) ib = 100 + b;
        return ia - ib;
      });
      flyOrder.forEach(function (wi, k) {
        var fxr = tableFx && tableFx.seats ? tableFx.seats[wi] : null;
        bankFx(wi, k * 0.12, fxr ? fxr.amt : null);
      });
      /* Dynamics pass D1: what the room failed to bank flies the
         other way — from the card into the pot — in the same beat */
      if (c.potFed > 0) potFeedFx(c.potFed);
    }
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
      value: 0, elapsed: 0, clockTotal: NUM_TIME * winScale(), /* Pass N2: the Decider's window stretches like any other */
      opts: null, marks: {}, resolved: false, cutUsed: false, lockOrder: [],
      betRound: false, bankValue: 0, headline: false, golden: false, decider: true
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
    entArm(G.cur);
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
    setMood("delight");
    clearTableSave(); /* the show is complete — nothing left to resume */
    if (G.cur) G.cur.marks = {};
    var p = G.players[i];
    /* Design pass 4: the show is complete — Sterling writes it into
       the record (guarded by the show id, so this finale can render
       again without counting twice), and the marquee learns whether
       the crown was defended, taken, or crowned for the first time */
    var prevChampW = loadRecords().champion;
    /* House Players (pass 5): Sterling's record is a book for
       guests — house players are NEVER written to it (no purse, no
       wins, no crown), and a house win crowns nobody; the human's
       participation records exactly as any show does. The night's
       SERIES, advanced below, is a different book: it counts
       house seats like any seat at the table. */
    var guestFinishers = [], guestWin = -1;
    G.players.forEach(function (pp, ii) {
      if (pp.house != null) return;
      if (ii === i && !tiedIdx) guestWin = guestFinishers.length;
      /* Dynamics pass D1: the champion's recorded figure carries
         the pot — it is money they won, so the purse (and the
         crown's amount) includes it. Nobody else's figure moves:
         the pot was never part of any score */
      guestFinishers.push({ name: pp.name, avatar: snapAvatar(pp, ii), score: pp.score + (ii === i && !tiedIdx ? (G.pot || 0) : 0) });
    });
    if (guestFinishers.length) recordShow(G.showId, guestFinishers, guestWin);
    /* Programme pass 4 — Rematch Night: the night advances at the
       same guarded moment, under the same show id, on the finale's
       own verdict. What it earns — the night's score, or the
       taking of the night — is told under the show's honours */
    var sAdv = advanceSeries(G.showId, G.seriesCtx, tiedIdx ? null : recNameKey(p.name));
    var sNightWon = !!(sAdv && sAdv.nightWon);
    var sFinaleLine = composeSeriesFinale(sAdv, G.seriesCtx, sNightWon, p.name);
    var titleSub = champSubline(prevChampW, (tiedIdx || p.house != null) ? null : recNameKey(p.name), loadRecords().champion);
    /* a crown taken through the Decider is recorded exactly like
       any other (the purse is the winner's frozen score) — what
       differs is only the telling: the deciderwin line and the
       marker on the winner's podium */
    var deciderWon = !!(G.decider && G.decider.winner === i);
    /* Dynamics pass D1: the pot joins the champion's displayed
       final total — the score it rides on never moved, so the
       standings, the series verdict and the winner facts all keep
       reading the frozen score; only the crowning total (and the
       record written above) carries it. A $0 pot changes not one
       word of this screen. A house champion takes it narratively:
       the note under the total says so, and Records — written
       from guestFinishers alone — never hears of it. */
    var potAmt = G.pot || 0;
    var potLineHtml = potAmt > 0
      ? '<div class="winner-sub pot-line">' + esc(p.house != null
          ? "THE HOUSE KEEPS THE POT TOO — " + money(potAmt)
          : authoredLine("potfinale", { amount: money(potAmt) })) + "</div>"
      : "";
    var wStand = G.players.map(function (pp) { return { name: pp.name, score: pp.score }; })
      .sort(function (a, b) { return b.score - a.score; });
    /* a night taken is Sterling's biggest beat of the evening: its
       line is authored-only — the worker's winner line, which knows
       nothing of the series, may not displace it */
    if (p.house != null) sayWinnerAuthored(authoredLine("housewin", { name: p.name }));
    else if (sNightWon) sayWinnerAuthored(authoredLine("winnernight", { name: p.name }));
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
    /* Pass N1 — the Report Card panel: every seat's recorded
       night, in standing order, under the podium. Derived here
       from the tallies the reveals wrote; nothing on it was not
       first settled by a reveal. */
    var reportRowsT = order.map(function (ii) { return { name: G.players[ii].name, d: deriveReport(G.report ? G.report[ii] : null) }; });
    var reportHTMLT = reportPanelHTML(reportRowsT, reportSayFor(p.name, deriveReport(G.report ? G.report[i] : null), reportRowsT, deciderWon));
    /* Pass N3: the share card's data model, built from this same
       verdict — champion, pot and series line exactly as printed */
    shareNight = shareDataTable(i, potAmt, sFinaleLine);
    stage('<div class="finale-wrap has-report' + (sFinaleLine ? " has-series" : "") + '"><div class="spot-cone" aria-hidden="true"></div><div class="finale-main">' +
      '<div class="marquee finale-marquee"><div class="kicker">THE GILDED HOUR · FINAL RESULT</div>' +
      '<div class="winner-word">WINNER</div>' +
      '<div class="winner-name">' + esc(p.name) + (p.house != null ? '<span class="champ-tag">★ HOUSE WIN</span>' : '<span class="champ-tag">★ CHAMPION</span>') + '</div>' +
      '<div class="winner-total">' + money(p.score + potAmt) + "</div>" +
      potLineHtml +
      (titleSub ? '<div class="winner-sub">' + titleSub + "</div>" : "") +
      (sFinaleLine ? '<div class="winner-sub series-line' + (sNightWon ? " night-won" : "") + '">' + esc(sFinaleLine) + "</div>" : "") +
      '<span class="gold-seal" aria-hidden="true"><svg class="wheel-emblem emblem-seal" viewBox="0 0 120 120"><use href="#emblem"></use></svg></span></div>' +
      '<div class="sterling-zone"><div class="bubble bubble-finale">Sealed with a kiss of confetti — the hour is yours, ' + esc(p.name) + ".</div>" +
      sterlingSVG("present", "sterling sterling-lg") + "</div></div>" +
      tieNote +
      '<div class="podium-row finale-row">' + pods + "</div>" +
      reportHTMLT +
      '<div class="finale-btns"><button class="btn-gold" id="btnAgain">REMATCH</button>' +
      '<button class="btn-ghost" id="btnShareNight">SHARE THE NIGHT</button>' +
      '<button class="btn-ghost" id="btnLobby">BACK TO LOBBY</button></div></div>');
    Snd.play("finale");
    startLeaves();
    saveSeen();
    renderSeats();
    buildBulbs(document.querySelector(".finale-marquee"));
    finaleCeremony();
    $("btnShareNight").addEventListener("click", function () { openShareNight(); });
    $("btnAgain").addEventListener("click", function () {
      stopLeaves();
      /* Pass N2: a rematch keeps the same table's rules — the
         hand that dealt this show passes its toggles to the
         next, whatever the setup screen now says */
      startShow(G.players.map(function (pp) { return pp.name; }), G.solo ? G.houseCast : null, G.rules);
    });
    $("btnLobby").addEventListener("click", function () { stopLeaves(); clearTableSave(); showScreen("scr-title"); G = null; WakeLock.sync(); });
  }

  /* ================= The Ten, pass 5 — HOUSE PLAYERS =================
     A third way to play at the table: the SOLO SHOW. One human,
     and the house fills seats 2-3 with two of its own, so a lone
     player gets the full fifteen-question contest — every rule
     identical, every dollar settled through the same marks the
     host's taps settle for humans. The brain is local and seeded
     by the show rng (reproducible, no worker, no AI): each cast
     member is a profile — a skill offset and per-category leans —
     and at every question open each house seat's fate is rolled
     ONCE and recorded on the question (cur.house): correctness
     and a simulated lock-in time for option questions, a perturbed
     guess for closest-number ones. The mark screen then reads the
     record: option-question marks are pre-set by the rolls (the
     host never taps for a house seat), the quick-draw races the
     simulated times against the host's real tap times on one
     clock, and a closest-number guess is printed on the seat for
     the host to judge like any shouted number. Two books are kept
     differently, by design: Sterling's RECORD never writes a house
     player (no purse, no wins, no crown — see winnerScreen), while
     the night's SERIES counts them like any seat. */
  var HOUSE_PROFILES = [
    /* the Professor: sharp on the screen categories, lost online */
    { name: "Marlowe", avatar: 6, skill: 0.05, strong: ["Movies", "TV"], weak: ["The Dial-Up Years"] },
    /* the Starlet: raised on Saturday mornings and the jingles between them */
    { name: "Vivian", avatar: 0, skill: 0.02, strong: ["Saturday Morning", "Ads & Jingles"], weak: ["Toys & Games"] },
    /* the Cowboy: a toys-and-games hand, no ear for music at all */
    { name: "Caspar", avatar: 5, skill: -0.02, strong: ["Toys & Games", "The Dial-Up Years"], weak: ["Music"] },
    /* the Mod: the strongest seat in the house — music and movies are hers */
    { name: "Odette", avatar: 7, skill: 0.08, strong: ["Music", "Movies"], weak: ["Saturday Morning"] }
  ];
  /* correctness by the question's band (Design pass 5's ladder),
     before skill and leans; the clamp keeps every seat beatable
     and every seat dangerous */
  var HOUSE_BAND_PROB = { 1: 0.85, 2: 0.65, 3: 0.45 };
  /* Big Finish policy: chips leaned on the question's band */
  var HOUSE_BET_BY_BAND = { 1: 3, 2: 2, 3: 1 };
  /* a missed roll with an unspent token flips this coin to spend */
  var HOUSE_CUT_POLICY = 0.5;
  var houseCutTimer = null;
  /* a question's band for house purposes: the dealt entry's own d;
     the nightly special carries none, so its diff speaks instead */
  function houseBandOf(cur) {
    if (!cur) return 2;
    var d = cur.q && cur.q.d;
    if (d === 1 || d === 2 || d === 3) return d;
    return cur.diff === "easy" ? 1 : cur.diff === "hard" ? 3 : 2;
  }
  function houseProb(band, prof, cat) {
    var pr = (HOUSE_BAND_PROB[band] || 0.65) + (prof.skill || 0);
    if (prof.strong.indexOf(cat) >= 0) pr += 0.10;
    else if (prof.weak.indexOf(cat) >= 0) pr -= 0.10;
    return Math.max(0.05, Math.min(0.97, pr));
  }
  /* a house guess: the truth perturbed by a band-scaled spread
     (tight on Warm, wide on a Deep Cut), skill drawing it closer;
     an integer, never negative — a shout, not a measurement */
  function houseGuess(truth, band, prof) {
    var t = Number(truth) || 0;
    var frac = band === 1 ? 0.12 : band === 3 ? 0.60 : 0.30;
    var spread = Math.max(2, Math.abs(t) * frac) * (1 - (prof.skill || 0));
    var g = Math.round(t + (rng() * 2 - 1) * spread * (0.25 + rng() * 0.75));
    return g < 0 ? 0 : g;
  }
  /* the deal: two profiles from the show rng, neither wearing the
     face the human picked */
  function dealHouseCast(humanAvatar) {
    var order = shuffle([0, 1, 2, 3]), cast = [];
    for (var k = 0; k < order.length && cast.length < 2; k++) {
      if (HOUSE_PROFILES[order[k]].avatar !== humanAvatar) cast.push(order[k]);
    }
    return cast;
  }
  function startSoloShow(humanName) {
    var cast = dealHouseCast(tableAvatars[0]);
    startShow([humanName, HOUSE_PROFILES[cast[0]].name, HOUSE_PROFILES[cast[1]].name], cast);
  }
  /* the rolls, made once at question open (askCurrent) and kept on
     the question; a resumed question finds its record waiting and
     only re-arms a cut that was still pending */
  function houseRolls() {
    var c = G.cur;
    if (!c || !G.solo) return;
    if (c.house) { armHouseCuts(); return; }
    var band = houseBandOf(c), h = {}, any = false;
    G.players.forEach(function (p, i) {
      if (p.house == null) return;
      if (c.decider && G.decider && G.decider.eligible.indexOf(i) < 0) return;
      any = true;
      var prof = HOUSE_PROFILES[p.house];
      var e = { prob: 0, ok: false, lock: 0, guess: null, cut: "none" };
      if (c.kind === "num") {
        e.guess = houseGuess(c.q.num, band, prof);
      } else {
        e.prob = houseProb(band, prof, c.cat);
        e.ok = rng() < e.prob;
        /* the simulated lock-in: inside the question's own window,
           skill pulling it earlier — one honest number on the same
           clock the host's taps are timed by */
        e.lock = Math.max(1.2, (2 + rng() * Math.max(3, c.clockTotal - 4)) * (1 - (prof.skill || 0)));
        if (p.cut > 0 && !e.ok && rng() < HOUSE_CUT_POLICY) e.cut = "pending";
      }
      h[i] = e;
    });
    if (any) { c.house = h; armHouseCuts(); }
  }
  /* a pending house cut fires a few seconds into the question —
     through the very useCut a host tap fires, so the spend is
     staged identically (Sterling names it, the slabs shear, the
     banner flies, the tag flips). The question allows ONE cut;
     if the host's hand spends it first, the policy simply lapses.
     A spend re-rolls the seat's correctness at the improved odds
     of a two-option question: half the remaining doubt removed. */
  function armHouseCuts() {
    if (houseCutTimer) { clearTimeout(houseCutTimer); houseCutTimer = null; }
    var c = G.cur;
    if (!c || !c.house || c.kind === "num" || G.phase !== "question") return;
    var pend = Object.keys(c.house).filter(function (k) { return c.house[k].cut === "pending"; });
    if (!pend.length) return;
    var cur0 = c;
    houseCutTimer = setTimeout(function () {
      houseCutTimer = null;
      if (!G || G.cur !== cur0 || G.phase !== "question") return;
      pend.forEach(function (k) {
        var i = +k, e = cur0.house[i];
        if (!e || e.cut !== "pending") return;
        e.cut = "passed";
        if (cur0.cutUsed) return;
        var before = G.players[i].cut;
        useCut(i);
        if (G.players[i].cut < before) {
          e.cut = "spent";
          e.prob = Math.min(0.97, e.prob + (1 - e.prob) * 0.5);
          e.ok = rng() < e.prob;
          e.lock = cur0.elapsed + 1 + rng() * 3;
        }
      });
      saveTableShow();
    }, 2200 + rng() * 3800);
  }
  /* the question ended before a pending policy fired — the token
     stays unspent and the miss stands, exactly as rolled */
  function houseLapseCuts() {
    if (houseCutTimer) { clearTimeout(houseCutTimer); houseCutTimer = null; }
    var c = G.cur;
    if (c && c.house) Object.keys(c.house).forEach(function (k) {
      if (c.house[k].cut === "pending") c.house[k].cut = "passed";
    });
  }
  /* the mark screen opens with the house record already on it:
     every house seat that rolled correct is marked, at its
     simulated time — from here the race is the host's taps against
     those times, settled by the one sorted lock order */
  function housePreMark() {
    var c = G.cur;
    if (!c || !c.house || c.kind === "num") return;
    if (!c.lockTimes) c.lockTimes = {};
    Object.keys(c.house).forEach(function (k) {
      var i = +k, e = c.house[k];
      if (e && e.ok) { c.marks[i] = 1; c.lockTimes[i] = e.lock; }
    });
    syncLockOrder();
  }
  /* a house seat's shouted number, printed on its desk from the
     mark screen onward — the host judges closest across all seats
     by reading the room, and this seat's shout is on its desk */
  function houseGuessHTML(p, i) {
    var c = G.cur;
    if (p.house == null || !c || c.kind !== "num" || !c.house || !c.house[i] || c.house[i].guess == null) return "";
    if (G.phase !== "vote" && G.phase !== "reveal") return "";
    if (c.decider && G.decider && G.decider.eligible.indexOf(i) < 0) return "";
    return '<span class="seat-guess">SHOUTED ' + Number(c.house[i].guess).toLocaleString("en-US") + "</span>";
  }

  /* ---------- setup screen ---------- */
  var playerCount = 3;
  var soloMode = false;
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
    if (soloMode) {
      /* the cast is dealt at showtime, so the preview promises the
         arrangement, not the faces: one named guest, two chairs
         the house will fill */
      var nm0 = (inputs[0] && inputs[0].value.trim()) || PNAMES[0];
      wrap.innerHTML = '<div class="podium pod0">' + avatarSVG(tableAvatars[0], "neutral", 0) +
        '<div class="desk"><div class="pname">' + esc(nm0) + '</div><div class="pmoney">$0</div></div></div>' +
        '<div class="podium house-pod"><div class="house-q">?</div><div class="desk"><div class="pname">A HOUSE PLAYER</div><div class="pmoney">DEALT AT SHOWTIME</div></div></div>' +
        '<div class="podium house-pod"><div class="house-q">?</div><div class="desk"><div class="pname">A HOUSE PLAYER</div><div class="pmoney">DEALT AT SHOWTIME</div></div></div>';
      return;
    }
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
    var rowCount = soloMode ? 1 : playerCount;
    for (var i = 0; i < rowCount; i++) {
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
    if (soloMode) {
      wrap.appendChild(el('<div class="house-note">SEATS 2 &amp; 3 — THE HOUSE PLAYS ITS OWN<span>Two house players, dealt when the show starts. They answer, bet and spend like anyone at the table.</span></div>'));
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
      soloMode = false;
      paintSolo();
      buildNameRows();
    });
  });
  /* House Players (pass 5): the solo toggle — its own chip in the
     setup's grammar; picking a headcount instead stands it down */
  function paintSolo() {
    var b = $("btnSolo");
    if (b) b.classList.toggle("sel", soloMode);
  }
  var btnSoloEl = $("btnSolo");
  if (btnSoloEl) btnSoloEl.addEventListener("click", function () {
    Snd.ensure();
    soloMode = !soloMode;
    paintSolo();
    buildNameRows();
  });
  /* Pass N2 — HOUSE RULES setup: the three brass toggles share
     one per-device record (gh_rules) between the table and the
     online host — the table show reads it at its start, the room
     is created under it — and what is lit here is what the next
     setup shows, until the host changes their mind */
  function paintRuleToggles() {
    var prefs = loadRulePrefs();
    document.querySelectorAll(".rule-toggle").forEach(function (b) {
      b.classList.toggle("on", !!prefs[b.getAttribute("data-rule")]);
    });
  }
  document.querySelectorAll(".rule-toggle").forEach(function (b) {
    b.addEventListener("click", function () {
      Snd.ensure();
      var prefs = loadRulePrefs();
      var k = b.getAttribute("data-rule");
      prefs[k] = !prefs[k];
      saveRulePrefs(prefs);
      paintRuleToggles();
    });
  });
  paintRuleToggles();
  $("btnStart").addEventListener("click", function () {
    Snd.ensure();
    if (soloMode) {
      var inp = $("panelTable").querySelector(".name-input");
      startSoloShow((inp && inp.value.trim()) || PNAMES[0]);
      return;
    }
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
    /* The Golden Question (pass 4): a golden reveal speaks the
       golden pool — the question's own moment, once per show. It
       yields only to the streak arbitration above (settled in its
       own pass) and, like the quick-draw call-out below, replaces
       the generic beat without consuming the AI beat latches. */
    if (G && G.cur && G.cur.golden) { hostSay("golden", {}); return; }
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
    /* Dynamics pass D1: a named pot beat — the night's first
       feeding, or the one that carries the pot past a thousand —
       speaks its own pool below the question's own moments and
       above the generic beats, whose latches it never consumes.
       The beat was named once, at the commit (c.potMoment), so a
       resumed reveal re-speaks it from the record. */
    if (G && G.cur && G.cur.potMoment) { hostSay(G.cur.potMoment === "first" ? "potfirst" : "potgrand", { amount: money(G.pot || 0) }); return; }
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
    /* The Golden Question (pass 4): the server's reveal named this
       question golden (ogRevealGolden, set in ogOnReveal) — the
       host speaks the golden pool, same arbitration as the table:
       below the streak moment, above the quick-draw and the
       beats, latches untouched. */
    if (OG && ogRevealGolden) { hostSay("golden", {}); return; }
    /* Design pass 3: same rule as the table — a quick-draw reveal
       speaks the call-out instead of the beat, and the AI beat
       latches stay unconsumed for the next reveal. The winner comes
       from the server's reveal (ogQdSeat, set in ogOnReveal). */
    if (OG && OG.cur && OG.cur.kind === "normal" && ogQdSeat >= 0 && OG.players[ogQdSeat]) {
      hostSay("quickdraw", { name: OG.players[ogQdSeat].name });
      return;
    }
    /* Dynamics pass D1: the pot's named beats, same arbitration
       as the table — the room's reveal named the moment
       (ogPotMoment, derived in ogOnReveal from the payload's own
       pot/potFed, so a resync derives the identical beat) */
    if (OG && ogPotMoment) { hostSay(ogPotMoment === "first" ? "potfirst" : "potgrand", { amount: money(OG.pot || 0) }); return; }
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
    /* The Golden Question (pass 4): the special only ever sits in
       Round 1's third seat — which is one of the eleven golden
       slots. The pick names the SEAT, not the bank entry, so a
       special dealt into the golden seat is golden too, folded
       the same way (its value otherwise rides at Round 1's x1) */
    var golden = isGoldenSlot(1, 2);
    var cur = {
      q: { q: q.q, why: q.why || "", cat: q.cat, diff: diff, special: true },
      kind: "mcq", cat: q.cat, diff: diff,
      value: BASE_VALUES[diff] * (golden ? 2 : 1),   // the special only ever sits in Round 1 (x1)
      elapsed: 0, clockTotal: QTIME * winScale() / (golden ? 2 : 1), /* Pass N2: the special's window stretches too */
      opts: q.a.map(function (t, i) { return { t: t, ok: i === q.correct }; }),
      marks: {}, resolved: false, cutUsed: false, lockOrder: [],
      betRound: false, bankValue: 0, headline: false, golden: golden,
      special: true, intro: sv.intro || null
    };
    commitCutPair(cur);
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
    /* The Golden Question (pass 4): the host derives its pick the
       same way the table does — one slot drawn from the show's
       seeded rng at show start, from the same eleven slots
       (Rounds 1-2, the Headline's seat excluded). The flag lives
       on the script entry, host-side only: it rides the host's
       own saved plan (ogSaveEntry), is named on that one publish
       as a hidden field, and is otherwise never spoken, sent or
       shown until the room's reveal names it back. */
    var goldCands = script.filter(function (e) { return GOLDEN_SLOTS.indexOf(e.round + ":" + e.qInRound) >= 0; });
    if (goldCands.length) goldCands[ri(goldCands.length)].golden = true;
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
    /* Pass N2: the house rules belong to whoever runs the show —
       the table host and the room host share the one block; a
       joining phone sets no rules and never sees the toggles */
    var rb = $("rulesBlock");
    if (rb) rb.classList.toggle("hidden", m === "join");
    $("btnStart").classList.toggle("hidden", m !== "table");
    /* Designer's pass P7 (2026-11-11): the start actions live in
       the docked start bar now — each mode's button shows there,
       pinned to the sheet's bottom, instead of inside its panel */
    $("btnCreateRoom").classList.toggle("hidden", m !== "host");
    $("btnJoinRoom").classList.toggle("hidden", m !== "join");
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
    /* The Golden Question (pass 4): the pick must survive the
       host's own refresh — the save is this device's localStorage,
       so the secret rides it without leaving the host */
    if (e.golden) o.golden = true;
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
    if (o.golden) e.golden = true; // The Golden Question (pass 4): the restored plan keeps its pick
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
        /* The Golden Question (pass 4): the tease rides the plan
           with the series line — drawn once at the show's start */
        goldTease: OG.goldTease || null,
        /* Pass N2: the room's rules and Sterling's naming of them
           ride the plan as a repaint bridge, like the tease — the
           room remains their only authority */
        rules: OG.rules || null,
        rulesLine: OG.rulesLine || null,
        /* Dynamics pass D1: the pot rides the plan as a repaint
           bridge — the room remains its only authority */
        pot: OG.pot || 0,
        /* Dynamics pass D2: the break's Second Wind telling rides
           the plan like the tease — the granted names and the
           drawn words, so a host restored mid-break retells the
           grant exactly; the room remains the token's authority */
        breakWind: OG.breakWind ? { names: OG.breakWind.names.slice(), line: OG.breakWind.line } : null,
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
    /* Pass N2 — House Rules: the host's setup toggles ride the
       creation itself, so the room is born under them and keeps
       them for its whole life (its snapshots deal them to every
       screen; changing them later means a new room) */
    var rules = loadRulePrefs();
    fetch(WORKER_URL + "/room", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules: rules }) })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) {
        if (!j.code || !j.hostToken) throw new Error("bad reply");
        try { sessionStorage.setItem("gh_host_room", JSON.stringify({ code: j.code, hostToken: j.hostToken })); } catch (e) {}
        ogJoinRoom(j.code, j.hostToken, null, rules);
      })
      .catch(function () {
        st.classList.add("err");
        st.textContent = "The room server didn't answer. Check your connection and try again — the table game is unaffected.";
      })
      .then(function () { $("btnCreateRoom").disabled = false; });
  }
  function ogJoinRoom(code, hostToken, plan, createRules) {
    ogTeardown(); /* (also clears any saved host state — the plan in hand is re-saved below) */
    ogLobbyNote = null; /* a new room has nothing to account for */
    ogFortuneDisp = []; /* Visual stage 4: a new room starts with empty desks */
    OG = {
      code: code, hostToken: hostToken, ws: null, dead: false,
      rules: createRules ? cleanRulesObj(createRules) : null, // Pass N2: the toggles this room was created under — the room's snapshots are their authority and re-deal them on every state
      rulesLine: null,          // Pass N2: Sterling's drawn naming of them, drawn at show start like the tease
      players: [null, null, null, null], snap: null, offset: 0,
      started: false, script: null, idx: 0, curRound: 0, cur: null,
      decider: null,           // New programme pass 1: {eligible, winner, used} once a tied finale triggers it
      facts: freshFacts(),     // New programme pass 2: the round-facts recorder the Intermission is told from
      seriesCtx: null, seriesLine: null, // Programme pass 4: the night's series, captured at the show's start
      goldTease: null,         // The Golden Question (pass 4): the tease line drawn at the show's start
      pot: 0,                  // Dynamics pass D1: the room's pot, mirrored from its snapshots and reveals
      report: null,            // Pass N1: the referee's report card, dealt with the ended broadcast / ended snapshot
      breakWind: null,         // Dynamics pass D2: {names, line} — this break's Second Wind grant, as this screen tells it
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
      /* The Golden Question (pass 4): the tease rides the plan
         beside the series line; a plan written before the Golden
         existed simply has no tease to re-present */
      OG.goldTease = typeof plan.goldTease === "string" ? plan.goldTease : null;
      /* Pass N2: the plan's rules bridge the moments before the
         room's first snapshot lands; the snapshot remains their
         authority and overwrites this on arrival. A plan written
         before the rules existed leaves the mirror to the room. */
      if (plan.rules) OG.rules = cleanRulesObj(plan.rules);
      OG.rulesLine = typeof plan.rulesLine === "string" ? plan.rulesLine : null;
      /* Dynamics pass D1: the pot rides the plan as a repaint
         bridge only — the room's first snapshot re-deals the true
         figure and overwrites this; a plan written before the pot
         existed restarts it empty */
      OG.pot = (typeof plan.pot === "number" && plan.pot > 0) ? Math.floor(plan.pot) : 0;
      /* Dynamics pass D2: the break's Second Wind telling rides
         the plan beside the tease; a plan written before Second
         Wind has none, and the room's snapshot can still supply
         the names (ogOnState) */
      OG.breakWind = (plan.breakWind && Array.isArray(plan.breakWind.names) && plan.breakWind.names.length)
        ? { names: plan.breakWind.names.slice(), line: typeof plan.breakWind.line === "string" ? plan.breakWind.line : null }
        : null;
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
    /* Dynamics pass D1: the room's pot is the snapshot's fact —
       every state push re-deals it, so the vessel can never drift
       from the referee (a snapshot that predates the pot carries
       no field and leaves the mirror as it stands) */
    if (typeof s.pot === "number") OG.pot = s.pot;
    /* Pass N1: the report card rides only an ended snapshot — the
       mirror takes it when it is dealt and holds it for the finale
       this state is painting (a mid-show snapshot carries null
       and leaves the mirror alone) */
    if (s.report) OG.report = s.report;
    /* Pass N2: the room's rules are the snapshot's fact — every
       state push re-deals them, so this screen's lobby line,
       break card and calm manner can never drift from the
       referee's night (a snapshot that predates the rules
       carries no field and leaves the mirror as it stands) */
    if (s.rules) OG.rules = cleanRulesObj(s.rules);
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
      /* Dynamics pass D2: the room's record of the grant is the
         authority for the card's row. A host that predicted the
         grant at its own break already holds the same names; one
         restored into the break (or whose mirror lagged) learns
         them here — and if its card is already up without them,
         the card repaints so the row lands. The spoken line is
         not improvised here: it was drawn at the grant and rides
         the host save, or the recap stands alone. */
      if (s.intermission && Array.isArray(s.intermission.wind) && s.intermission.wind.length && !OG.breakWind) {
        var bwNames = s.intermission.wind.map(function (si) { return s.players && s.players[si] ? s.players[si].name : ""; }).filter(Boolean);
        if (bwNames.length) {
          OG.breakWind = { names: bwNames, line: null };
          if (OG.phase === "intermission") { ogPaintIntermission(s.intermission.nextRound || OG.curRound + 1); return; }
        }
      }
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
      /* Pass N2: the night's rules are named in the lobby, where
         the room gathers — only the ones in force, and nothing
         at all under the plain game */
      (rulesActive(OG.rules) ? '<p class="round-text og-rules-line">HOUSE RULES — ' + esc(rulesCapsText(OG.rules)) + "</p>" : "") +
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
      /* Visual pass V2 — KEEN on the big screen too: a seat whose
         snapshot streak is live (2+) wears the focused face while
         the question is open; the reveal's verdict replaces it.
         A Decider's spectators never play, so they never focus */
      if (state === "neutral" && OG.phase === "answer" && (p.streak || 0) >= 2 &&
        !(OG.cur && OG.cur.decider && OG.decider && (OG.cur.eligible || []).indexOf(i) < 0)) state = "keen";
      var shown = money(Math.round(OG.disp[i] != null ? OG.disp[i] : p.score));
      /* Pass N2: the desk tag reads the snapshot's count — two
         in hand says ×2, exactly as the table's tag does */
      var cutN2 = snapCutN(p);
      var tags = [cutN2 >= 2 ? "CUT TWO ×2" : cutN2 > 0 ? "CUT TWO" : "CUT SPENT"];
      if (!p.connected) tags.push("AWAY");
      /* Hot Streaks: the same segment as the table's desk tag, read
         straight off the snapshot's per-player streak */
      var oseg = streakSegHTML(p.streak || 0);
      if (oseg) tags.push(oseg);
      var s = el('<div class="seat pod' + i + (p.connected ? "" : " away") + threatClass(p.streak || 0) + '" data-seat="' + i + '">' +
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
        /* The Golden Question (pass 4): the tick keeps the
           question print's mask — a golden entry drains its own
           un-doubled figures on the room's halved window, so the
           shared screen never prices the double early */
        var v = Math.round((OG.cur.golden ? OG.cur.baseValue : (q.baseValue != null ? q.baseValue : OG.cur.baseValue)) * (OG.cur.golden ? OG.cur.multiplier : (q.multiplier != null ? q.multiplier : OG.cur.multiplier)) * (1 - 0.5 * frac));
        var txt = money(v);
        if (vEl.textContent !== txt) {
          vEl.textContent = txt;
          var wrap = vEl.closest ? vEl.closest(".q-value") : vEl.parentElement;
          if (wrap) wrap.classList.toggle("low", frac > 0.75);
        }
        /* G1: the vessel melts on the very window fraction this tick
           just drained the numeral by — one clock, two readings */
        meltPaint(1 - 0.5 * frac, !!OG.meltDbl);
        /* V3: the host card's gilt thins on the same fraction, in
           the same gated beat (answer phase, un-betted) */
        giltPaint(1 - 0.5 * frac);
      } else if (vEl && OG.cur && q.betted) {
        /* V3: a betted host card has no numeral to drain and no
           vessel, but its gilt still thins on the window */
        var bFrac = Math.min(Math.max((q.windowMs - rem) / q.windowMs, 0), 1);
        giltPaint(1 - 0.5 * bFrac);
      }
      /* G7: the host's rim drinks from the same window — rem/windowMs
         is the remaining share the light contracts by; fed on every
         answer tick (betted or not: the window closes either way) and
         left to go stale the moment the phase turns */
      rimFeed(q.windowMs ? rem / q.windowMs : 1);
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
    /* The Golden Question (pass 4): ogBuildScript has already
       marked the show's one golden entry (a rematch deals a FRESH
       pick, because the script is rebuilt here); the tease line is
       drawn with the show and spoken at the first spin's bumper
       beat (ogSpinThenPublish), where the Round 1 line is set */
    OG.goldTease = authoredLine("goldtease");
    /* Pass N2: Sterling's naming of the room's rules is drawn
       with the tease and spoken at the same beat — the rules
       themselves are the room's, read from its record, so a
       rematch (which keeps them) names the same night again */
    OG.rulesLine = rulesActive(OG.rules) ? authoredLine("rules", { rules: rulesProseText(OG.rules) }) : null;
    OG.idx = 0; OG.curRound = 0;
    OG.cur = null; OG.decider = null;
    OG.pot = 0; /* Dynamics pass D1: a fresh show's pot is empty — the room resets its own on new_show; this mirror follows */
    OG.report = null; /* Pass N1: a fresh show's card is unwritten until its own finale deals it */
    OG.facts = freshFacts();
    OG.lastRevealQid = null; OG.revealState = {};
    OG.bankedOnce = false; OG.bigLeadDone = false;
    ogFx = null; ogQdSeat = -1; ogStreakMoment = null; ogRevealGolden = false;
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
      /* The Golden Question (pass 4): the pick names the SEAT, not
         the entry — if the special takes the golden seat, the gold
         moves with the seat onto the special's entry */
      if (slot.golden) ogRef.script[2].golden = true;
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
      2: (OG.rules && OG.rules.secondCut)
        ? "Same game, double money — $200, $400, $600. Your lifelines are live: each of you holds TWO Cut Two tokens for the whole show. Call one from your phone before the window closes and two wrong answers vanish for everybody. And the round closes with the Headline Question — double money again, half the time on the clock."
        : "Same game, double money — $200, $400, $600. Your one lifeline is live: each of you holds a single Cut Two for the whole show. Call it from your phone before the window closes and two wrong answers vanish for everybody. And the round closes with the Headline Question — double money again, half the time on the clock.",
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
    var spinHeadline = isHeadline(e.round, e.qInRound);
    stage('<div class="q-cat">STERLING SPINS THE CATEGORIES</div>' +
      (spinHeadline ? '<div class="hl-slot"><span class="headline-banner inflow">★ THE HEADLINE QUESTION ★</span></div>' : "") +
      wheelFrameHTML(e.cat) +
      '<p class="round-text">Where it stops, nobody knows. Sterling knows. Sterling always knows.</p>');
    if (e.special && e.intro) $("hostLine").textContent = e.intro;
    else if (spinHeadline) { e.headlineSaid = true; hostSay("headline", { cat: e.cat }); }
    else if (e.round === 1 && e.qInRound === 0) {
      hostSay("r1");   // the Round-1 bumper line, set where the first spin's lines are set (see ogIntro)
      /* The Golden Question (pass 4): the tease rides that same
         beat — the host's Round 1 intro moment — appended to the
         bumper line, exactly as the table appends it at
         roundIntro. Drawn once at the show's start (ogBeginShow)
         and carried in the saved plan, never re-drawn */
      if (OG.goldTease) { var hTease2 = $("hostLine"); if (hTease2) hTease2.textContent += " " + OG.goldTease; }
      /* Pass N2: the rules are named at the same beat, after the
         tease — the table appends them at its Round 1 intro */
      if (OG.rulesLine) { var hRules2 = $("hostLine"); if (hRules2) hRules2.textContent += " " + OG.rulesLine; }
    }
    else hostSay("spin", { cat: e.cat });
    Snd.play("spin");
    stClass("st-glance", 1600);
    clearInterval(OG.spinInt);
    runWheel(e.cat,
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
    /* Show the Band (pass 3): the dealt entry's difficulty band
       rides the publish — public information by design; the room
       validates it to 1|2|3 and deals it back in the snapshot */
    if (e.bank && e.bank.d) msg.band = e.bank.d;
    /* The Golden Question (pass 4): the secret pick rides THIS
       publish as a hidden field — the room folds the double into
       the record, keeps the flag off every snapshot (the host's
       included), and names it back only inside the reveal. A
       room too old to know the field ignores it, and the
       question simply settles plain there */
    if (e.golden) msg.golden = true;
    /* the Decider rides the ordinary publish — the server validates
       the flag and the eligible list like any other field */
    if (e.decider) { msg.decider = true; msg.eligible = (e.eligible || []).slice(); }
    ogSend(msg);
  }
  /* G1: the melt's live multiplier for the host card, read off the
     snapshot's own window — the same figures ogTick drains by, so a
     resync repaint is born at the level the room's clock has reached */
  function ogMeltMult(q) {
    if (!q || !q.windowMs || q.deadline == null) return 1;
    var rem = q.deadline - (Date.now() + OG.offset);
    if (rem < 0) rem = 0;
    var frac = Math.min(1, Math.max(0, (q.windowMs - rem) / q.windowMs));
    return 1 - 0.5 * frac;
  }
  /* G2: the host's stakes context, from state this screen already
     holds — the seats' public scores, and the award exactly as
     this card prints it: the snapshot's effective figures for an
     ordinary question, the plan entry's own un-doubled figures
     for a golden one (the mask, exactly as the value line above
     keeps it). The Big Finish's remaining money is counted at
     each seat's Long Shot cap, derived from the same public
     scores by the one shared cap function */
  function ogStakeCtx(e, q) {
    var scores = OG.players.map(function (p) { return p ? p.score : null; });
    if (e.round === 3) {
      var left = R3_COUNT - (e.qInRound || 0);
      var san = OG.players.map(function (p) { return p ? { score: p.score } : { score: 0 }; });
      return { scores: scores, round: 3, bigFinish: true, decider: !!e.decider,
        remaining: OG.players.map(function (p, i) { return p ? left * longShotCap(san, i) * 100 : 0; }) };
    }
    var award = e.golden ? e.baseValue * e.multiplier
      : (q && q.baseValue != null ? q.baseValue : e.baseValue) * (q && q.multiplier != null ? q.multiplier : e.multiplier);
    return { scores: scores, round: e.round, award: award, decider: !!e.decider };
  }
  function ogShowQuestion(e, q) {
    if (ogWinceTimer) { clearTimeout(ogWinceTimer); ogWinceTimer = null; } /* V2: a fresh question buries the last flinch */
    OG.phase = "answer"; OG.cur = e; stagePhase("question");
    audDecider(!!e.decider); /* V4: the Decider hushed from its first second */
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
    OG.meltDbl = headline; /* G1: the vessel's doubled grammar follows the same flag the banner wears */
    var head = e.kind === "survey" ? "MOST PEOPLE SAY…" : e.kind === "num" ? "CLOSEST NUMBER" : (e.diff || "").toUpperCase();
    var top = '<div class="q-headrow"><span class="cat-pill' + (e.special ? " gilded" : "") + (headline ? " headline" : "") + '">' + catEmblem(e.cat) + (e.special ? "TONIGHT'S GILDED QUESTION" : esc(e.cat.toUpperCase()) + (headline ? " · HEADLINE" : "")) + '</span>' + bandTagHTML(ogBandOf(q, e)) + '<span class="q-kind">' + head + "</span></div>" +
      stakeRibbonHTML(stakeCallout(ogStakeCtx(e, q)), OG.players) +
      '<div class="q-cardwrap">' + (isDec ? '<div class="headline-banner decider-banner">★ THE DECIDER ★</div>' : (headline ? '<div class="headline-banner">★ THE HEADLINE QUESTION ★</div>' : "")) +
      '<div class="q-text' + (headline ? " headline-card" : "") + wearCls(e.round, isDec) + '">' + esc(e.bank.q) + cardDressHTML(isDec ? 1 : ogMeltMult(q)) + "</div></div>";
    var meta = '<div class="q-meta">' + (isDec
      ? '<div class="q-for">No money on this one — the crown only.</div>'
      : q.betted
      ? '<div class="q-for">Bets are in — this one pays the bet, and only the bet.</div>'
      /* The Golden Question (pass 4): the snapshot's figures are
         the room's EFFECTIVE ones (already doubled) — but the big
         screen must not price a golden question at double before
         its reveal, so a golden entry displays its own un-doubled
         figures here (the tick below keeps the same mask). The
         drain still runs on the room's halved window. */
      : '<div class="q-value">' + meltHTML(headline, ogMeltMult(q)) + '<div class="q-valmain"><small>QUESTION VALUE</small><span id="qValue">' + money(e.golden ? e.baseValue * e.multiplier : (q.baseValue != null ? q.baseValue : e.baseValue) * (q.multiplier != null ? q.multiplier : e.multiplier)) + "</span></div></div>") + timerHTML() + "</div>";
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
    else if (!headline) hostSay(ogBandOf(q, e) === 3 ? "deepcut" : (e.kind === "num" ? "numQ" : "read"), { cat: e.cat });
    Snd.playSignature(e.cat);
    stSweep();
    var call = $("ogCallIt");
    if (call) call.addEventListener("click", function () { ogSend({ t: "reveal", qid: e.qid }); });
    if (entOnce("og:" + OG.code + ":" + e.qid)) entApply(document.querySelector("#stage .q-cardwrap"), e.cat);
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
       flipping under a flash. The spend is applied to OG.players
       here so it paints now — Pass N2: as a decrement of the
       count (the mirror keeps the snapshot's dual shape, boolean
       and count together), so a seat holding a second blade
       keeps its CUT TWO tag; the next state snapshot carries the
       same count and agrees. Snapshots and re-renders never
       re-fire any of this — ogOnState does not call here — so a
       reconnected host sees the spent tag settled and hears
       nothing twice. */
    var p = OG.players[m.bySeat];
    if (p) { var leftAfter = Math.max(0, snapCutN(p) - 1); p.cutTwo = leftAfter > 0; p.cutCount = leftAfter; }
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
    /* Dynamics pass D1: the pot arrives on the reveal itself —
       the total after this question and what this question fed.
       The named beat is derived from those two figures alone
       (before = pot − potFed), so a resynced reveal derives the
       identical moment and the live one needs no other record.
       A legacy room whose reveal carries neither field leaves
       the mirror to the snapshots. */
    var rPotFed = typeof r.potFed === "number" ? r.potFed : 0;
    if (typeof r.pot === "number") OG.pot = r.pot;
    ogPotMoment = potMomentFor((OG.pot || 0) - rPotFed, rPotFed);
    potFeedPending = fromSnap ? 0 : rPotFed;
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
    var ogWincers = [];
    OG.revealState = {};
    (r.results || []).forEach(function (res) {
      /* a decider's spectators never played — they keep their faces */
      OG.revealState[res.seat] = (r.decider && r.eligible && r.eligible.indexOf(res.seat) < 0)
        ? "neutral" : (res.correct ? "cheer" : "slump");
      /* Visual pass V2: the flinch — a seat that ANSWERED and
         missed (the result carries its pick/num, the same record
         the D4 miss delta reads) opens the LIVE reveal with
         WINCE and settles into slump on the timer below. A
         resynced reveal (fromSnap) settles straight into slump,
         and a seat that never answered keeps its plain slump —
         it passed, it did not miss */
      if (!fromSnap && !res.correct && (res.pick != null || res.num != null) &&
        !(r.decider && r.eligible && r.eligible.indexOf(res.seat) < 0)) {
        OG.revealState[res.seat] = "wince";
        ogWincers.push(res.seat);
      }
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
    setMood((anyBank || winners.length) ? "delight" : "sorry");
    /* The Golden Question (pass 4): the reveal is the first place
       the flag exists outside the room — capture it for the gilt,
       the why-slip tag and Sterling's moment (ogRevealSay) */
    ogRevealGolden = r.golden === true;
    ogQdSeat = (r.quickDrawSeat != null) ? r.quickDrawSeat
      : ((r.results || []).find(function (res) { return res.quickDraw; }) || {}).seat;
    if (ogQdSeat == null) ogQdSeat = -1;
    ogFx = { qid: r.qid, seats: fxSeats };
    audDecider(false); /* V4: the hush lifts with the reveal */
    if (!fromSnap && !r.decider) audReact(anyBank); /* V4: the house answers a live reveal only — a resync never replays it */
    ogRenderSeats();
    /* Visual pass V2: the flinch settles — ~1.2s into the reveal
       the wincing seats trade WINCE for the slump the resync
       already wears. Guarded by the reveal's own qid, so a stale
       timer can never reach into a later question */
    if (ogWincers.length) {
      if (ogWinceTimer) clearTimeout(ogWinceTimer);
      var ogWinceQid = r.qid;
      ogWinceTimer = setTimeout(function () {
        ogWinceTimer = null;
        if (!OG || OG.phase !== "reveal" || OG.lastRevealQid !== ogWinceQid) return;
        ogWincers.forEach(function (si) { if (OG.revealState[si] === "wince") OG.revealState[si] = "slump"; });
        ogRenderSeats();
      }, 1250);
    }
    var nextBtn = '<div style="margin-top:12px"><button class="btn-gold" id="ogNext">CONTINUE</button></div>';
    var headline = r.headline != null ? !!r.headline : isHeadline(e.round, e.qInRound);
    var head = '<div class="q-headrow"><span class="cat-pill">' + catEmblem(e.cat) + esc(e.cat.toUpperCase()) + '</span>' + bandTagHTML(ogBandOf(OG.snap && OG.snap.question, e)) + '<span class="q-kind">' + (e.kind === "num" ? "THE NUMBER WAS" : "THE ANSWER") + "</span></div>" +
      goldenCardHTML('<div class="q-text' + (headline ? " headline-card" : "") + (ogRevealGolden ? " golden-card" : "") + wearCls(e.round, !!r.decider) + '" style="font-size:clamp(18px,3vw,25px)">' + esc(e.bank.q) + cardDressHTML(1) + sealHTML(ogRevealGolden, fromSnap) + "</div>", ogRevealGolden);
    if (e.kind === "num") {
      var tn = r.trueNum != null ? r.trueNum : e.trueNum;
      if (r.decider) {
        /* the Decider's reveal: the truth, the verdict, and a local
           line — the generic num painting would announce banked
           money that never moved */
        var dWin = (r.deciderWinner != null && OG.players[r.deciderWinner]) ? OG.players[r.deciderWinner] : null;
        stage(head + spreadDialHTML(dialGuesses(OG.players, r.results), tn, { settled: !!fromSnap }) +
          '<div class="q-for">' + (dWin
            ? esc(dWin.name) + " called it closest — the crown is decided."
            : "Dead level — the closest calls are identical. The Decider goes again.") + "</div>" +
          whySlip(e.bank.why, fromSnap, null) + nextBtn);
        if (dWin) hostSay("deciderhit", { name: dWin.name });
        else hostSay("deciderlevel");
      } else {
        stage(head + spreadDialHTML(dialGuesses(OG.players, r.results), tn, { settled: !!fromSnap }) +
          (anyBank ? "" : '<div class="delta"><span class="down">Nobody got close. The number keeps its dignity.</span></div>') +
          whySlip(e.bank.why, fromSnap, doubleTag(headline, ogRevealGolden)) + nextBtn);
        ogRevealSay(winners.length ? "numHit" : "numMiss", { name: winners.length && OG.players[winners[0]] ? OG.players[winners[0]].name : "" }, winners);
      }
    } else {
      var ci = r.correctIdx != null ? r.correctIdx : e.correctIdx;
      var btns = e.answers.map(function (t, i) {
        return '<button class="ans-btn' + (i === ci ? " correct" : " dim") + '" disabled><span class="letter">' + (i + 1) + "</span><span>" + esc(t) + "</span></button>";
      }).join("");
      /* Gameplay-visuals pass G5: the photo-finish strip joins a
         'normal' reveal — the correct results ordered by their
         server-received lockMs, which is the quick-draw's own
         order, so the first disc is always the seat the room paid
         the +$50. A resync rebuilds it from lastReveal's identical
         record; guess kinds never race. */
      var pfStripO = "";
      if (e.kind === "normal") {
        var pfFinO = (r.results || []).filter(function (res) { return res.correct && res.lockMs != null; })
          .sort(function (a, b) { return a.lockMs - b.lockMs; })
          .map(function (res) { return { seat: res.seat, ms: res.lockMs }; });
        pfStripO = photoFinishHTML(pfFinO, OG.players);
      }
      stage(head + '<div class="answers">' + btns + "</div>" +
        pfStripO +
        (anyBank ? "" : '<div class="delta"><span class="down">No one had it. The money stays in Sterling\'s pocket — this time.</span></div>') +
        whySlip(e.bank.why, fromSnap, doubleTag(headline, ogRevealGolden)) + nextBtn);
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
    /* Pass 7: live reveals only — a snapshot resync (fromSnap)
       repaints the desks as they stand, coinless; each banker's
       flight is sized by what the room says they banked */
    if (!fromSnap) {
      var flyK = 0;
      (r.results || []).forEach(function (res) { if (res.banked > 0) bankFx(res.seat, flyK++ * 0.12, res.banked); });
      /* Dynamics pass D1: what the room failed to bank flies
         into the pot in the same beat */
      if (rPotFed > 0) potFeedFx(rPotFed);
    }
    /* The Ten, pass 2: a live num reveal sweeps the spread dial;
       a snapshot resync's dial was born settled in the markup */
    if (e.kind === "num" && !fromSnap) { var sdEl = document.querySelector(".dial.spread"); if (sdEl) runSpreadDial(sdEl); }
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
    /* Pass N2: the count, as the table's seats carry it — the
       shared breakView and windSeatsFor read one shape */
    OG.players.forEach(function (p, i) { if (p) out.push({ seat: i, name: p.name, score: p.score, cut: snapCutN(p) }); });
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
    audDecider(false); /* V4: the break rests — no hush survives into it */
    seatsVisible(false);
    /* Dynamics pass D2 — Second Wind: the ROOM grants when this
       message lands (the token state lives there, and the grant
       is the referee's). This screen predicts it from the
       standings it already holds — scores and cut states both
       arrived from the room — so the card paints granted at
       once, the granted desks flip back to CUT TWO with the
       seats' next render, and the snapshot that follows confirms
       the identical state (and would correct the telling via
       ogOnState if it ever disagreed). */
    /* Pass N2: the prediction measures counts against the room's
       starting count, and the mirror grant is the same top-up by
       one the referee performs — never past the start */
    var grantedOg = windSeatsFor(ogBreakSeats(), cutStartOf(OG.rules));
    OG.breakWind = null;
    if (grantedOg.length) {
      grantedOg.forEach(function (si) {
        var pl = OG.players[si];
        if (pl) { var topped = Math.min(snapCutN(pl) + 1, cutStartOf(OG.rules)); pl.cutTwo = topped > 0; pl.cutCount = topped; }
      });
      var ogWindNames = grantedOg.map(function (si) { return OG.players[si].name; });
      OG.breakWind = { names: ogWindNames, line: authoredLine("wind", { name: joinNames(ogWindNames) }) };
    }
    ogSend({ t: "intermission", nextRound: nextRound });
    $("roundLabel").textContent = { 2: "ROUND 2 · DOUBLE MONEY", 3: "ROUND 3 · THE BIG FINISH" }[nextRound] || "";
    $("qCounter").textContent = "THE INTERMISSION";
    ogPaintIntermission(nextRound);
    ogSaveHostShow();
  }
  function ogPaintIntermission(nextRound) {
    var view = breakView(ogBreakSeats(), OG.facts, nextRound - 1, OG.pot || 0, OG.breakWind ? OG.breakWind.names : null, OG.rules);
    stage(breakCardHTML(view, "ogBreakGo"));
    $("hostLine").textContent = view.recap + (OG.breakWind && OG.breakWind.line ? " " + OG.breakWind.line : "");
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
    /* Pass N1: the card is dealt with this broadcast — the finale
       below reads it from the mirror */
    if (m.report) OG.report = m.report;
    ogWinner();
  }
  function ogWinner() {
    if (!OG || OG.phase === "over") return;
    OG.phase = "over"; stagePhase("over");
    setMood("delight");
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
    /* Dynamics pass D1: the room's pot (mirrored on OG from the
       snapshots and reveals) joins the champion's recorded figure
       and displayed total — the server's scores never carried it,
       and a drawn show (no decided champion) awards it to nobody */
    var potAmtO = OG.pot || 0;
    recordShow(ogShowId(), idxs.map(function (ii) { return { name: OG.players[ii].name, avatar: snapAvatar(OG.players[ii], ii), score: OG.players[ii].score + (hasWinner && ii === winSeat ? potAmtO : 0) }; }), hasWinner ? winSeat : -1);
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
    /* Pass N1 — the Report Card panel: the referee's card, in
       standing order, under the podium. No card was dealt (a room
       older than the pass) — no panel; the finale stands as it
       always has rather than inventing one. */
    var reportRowsO = OG.report ? order.map(function (ii) { return { name: OG.players[ii].name, d: reportView(OG.report[ii]) }; }) : null;
    var reportHTMLO = reportRowsO ? reportPanelHTML(reportRowsO, reportSayFor(p.name, reportView(OG.report[winSeat]), reportRowsO, decWin === winSeat)) : "";
    /* Pass N3: the share card's data model, from this same verdict */
    shareNight = shareDataHost(winSeat, hasWinner, potAmtO, sFinaleLineO);
    stage('<div class="finale-wrap' + (reportHTMLO ? " has-report" : "") + (sFinaleLineO ? " has-series" : "") + '"><div class="spot-cone" aria-hidden="true"></div><div class="finale-main">' +
      '<div class="marquee finale-marquee"><div class="kicker">THE GILDED HOUR · FINAL RESULT</div>' +
      '<div class="winner-word">WINNER</div>' +
      '<div class="winner-name">' + esc(p.name) + '<span class="champ-tag">★ CHAMPION</span></div>' +
      '<div class="winner-total">' + money(p.score + (hasWinner ? potAmtO : 0)) + "</div>" +
      (hasWinner && potAmtO > 0 ? '<div class="winner-sub pot-line">' + esc(authoredLine("potfinale", { amount: money(potAmtO) })) + "</div>" : "") +
      (titleSubO ? '<div class="winner-sub">' + titleSubO + "</div>" : "") +
      (sFinaleLineO ? '<div class="winner-sub series-line' + (sNightWonO ? " night-won" : "") + '">' + esc(sFinaleLineO) + "</div>" : "") +
      '<span class="gold-seal" aria-hidden="true"><svg class="wheel-emblem emblem-seal" viewBox="0 0 120 120"><use href="#emblem"></use></svg></span></div>' +
      '<div class="sterling-zone"><div class="bubble bubble-finale">Sealed with a kiss of confetti — the hour is yours, ' + esc(p.name) + ".</div>" +
      sterlingSVG("present", "sterling sterling-lg") + "</div></div>" +
      tieNote +
      '<div class="podium-row finale-row">' + pods + "</div>" +
      reportHTMLO +
      '<div class="finale-btns"><button class="btn-gold" id="ogAgain">REMATCH</button>' +
      '<button class="btn-ghost" id="ogShareNight">SHARE THE NIGHT</button>' +
      '<button class="btn-ghost" id="ogLobby">BACK TO LOBBY</button></div></div>');
    Snd.play("finale");
    startLeaves();
    buildBulbs(document.querySelector(".finale-marquee"));
    finaleCeremony();
    $("ogShareNight").addEventListener("click", function () { openShareNight(); });
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
      OG.seriesCtx = null; OG.seriesLine = null; OG.goldTease = null;
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
  /* G6 — Cut Two, Previewed, on the pad. Holding the pad's CUT
     TWO asks the room for the pair its spend would cut — committed
     server-side at publish, answered to this pad alone — and the
     ghost lives only on this pad's own answer list: the big screen
     ghosts nothing, other pads ghost nothing, and the hold itself
     broadcasts nothing (one unicast question, one unicast answer).
     The reply is honoured only while the hold that asked is still
     down on the same question; a late answer is read and dropped. */
  function jpCutGhostApply() {
    if (!JP || !JP._cutHold || !JP._cutPreview) return;
    if (JP._cutPreview.qid !== JP._cutHold.qid) return;
    document.querySelectorAll(".jp-ans").forEach(function (b) {
      var i = parseInt(b.getAttribute("data-pick"), 10);
      b.classList.toggle("cutghost", JP._cutPreview.indices.indexOf(i) >= 0);
    });
  }
  function jpCutGhostClear() {
    if (JP) { JP._cutHold = null; JP._cutPreview = null; }
    document.querySelectorAll(".jp-ans.cutghost").forEach(function (b) { b.classList.remove("cutghost"); });
  }
  function jpWirePadCut(btn, qid) {
    wireCutHold(btn, {
      show: function () {
        if (!JP) return;
        JP._cutHold = { qid: qid };
        jpSend({ t: "cut_preview", qid: qid });
      },
      hide: jpCutGhostClear,
      spend: function () {
        Snd.ensure();
        JP._cutSentQid = qid;
        jpSend({ t: "cuttwo", qid: qid });
      }
    });
  }
  function jpOnMsg(m) {
    if (!JP) return;
    if (m.t === "cut_preview") {
      if (JP._cutHold && JP._cutHold.qid === m.qid && Array.isArray(m.indices)) {
        JP._cutPreview = { qid: m.qid, indices: m.indices.slice() };
        jpCutGhostApply();
      }
      return;
    }
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
      /* G4: a state snapshot that carries this pad's own standing
         answer is the one moment the room's count provably
         includes it — jpToYouCtx may subtract one from that
         question's count, and from no other */
      if (m.state.question && (m.state.yourPick != null || m.state.yourNum != null)) JP._toyouCountedQid = m.state.question.qid;
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
        /* Pass N2 — Calm Table: the pad's bar keeps draining on
           the room's real window but never takes its danger
           colour — the room's rules, read off this pad's own
           snapshot, are the manner of the whole room */
        fill.classList.toggle("low", cs.rem < 5000 && !(JP.snap && JP.snap.rules && JP.snap.rules.calmTable));
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
      return '<div class="jp-standrow' + (r.seat === JP.seat ? " me" : "") + threatClass(r.p.streak || 0) + '"><span class="name-dot" style="background:' + PCOLORS[r.seat] + '"></span>' +
        "<span>" + (pos + 1) + ". " + esc(r.p.name) + (r.p.connected ? "" : " (away)") + '</span><span class="sc">' + money(r.p.score) + "</span></div>";
    }).join("");
  }
  /* Pass N1 — the pad's own report card: this seat's four facts
     from the referee's card (the ended snapshot carries it), in
     the break card's fact-row grammar. A seat with nothing
     recorded gets no card at all — omission, never invention. */
  function jpReportHTML(entry) {
    var facts = reportFactsOf(reportView(entry));
    if (!facts.length) return "";
    return '<div class="jp-report"><div class="jp-report-head">YOUR REPORT CARD</div>' +
      facts.map(function (f) {
        return '<div class="fact-row"><span class="fact-k">' + f.full + '</span><span class="fact-v">' + esc(f.v) + "</span></div>";
      }).join("") + "</div>";
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
  /* G2: the pad's stakes context, computed from what this pad
     already holds — the snapshot's PUBLIC scores, and an award
     rebuilt from public facts only: the bank entry's own base
     value, the round's multiplier, and the Headline's public
     double. The snapshot's effective figures are never used for
     this: on a golden question they carry the secret double, and
     a ribbon priced at double would leak the gold to the one
     screen that must never know. A pad whose question carries no
     bank difficulty (the nightly special's blind fallback) prices
     at zero and wears nothing — the big screen remains the shared
     truth. The Big Finish's remaining money is counted at each
     seat's Long Shot cap from the same public scores; the pad's
     place in the round is read off its qid's sequence number */
  function jpStakeCtx(d, s) {
    var scores = s.players.map(function (p) { return p ? p.score : null; });
    var round = (d.q && d.q.round) || 0;
    if (d.q && d.q.decider) return { scores: scores, round: round, decider: true };
    if (round === 3) {
      var pr = ogParseQid(d.q.qid);
      var qi = pr ? Math.max(0, Math.min(R3_COUNT - 1, pr.seq - (R1_COUNT + R2_COUNT + 1))) : 0;
      var left = R3_COUNT - qi;
      var san = s.players.map(function (pl) { return pl ? { score: pl.score } : { score: 0 }; });
      return { scores: scores, round: 3, bigFinish: true,
        remaining: s.players.map(function (pl, i) { return pl ? left * longShotCap(san, i) * 100 : 0; }) };
    }
    if (!d.bank || !BASE_VALUES[d.bank.diff]) return { scores: scores, round: round, award: 0 };
    var award = BASE_VALUES[d.bank.diff] * (round === 2 ? 2 : 1) * (d.q.headline ? 2 : 1);
    return { scores: scores, round: round, award: award };
  }
  /* G4: YOUR NUMBER, PERSONALLY — the pad's question card prices
     the question to its holder: TO YOU is what THIS player banks
     if they lock in correctly at this moment, composed from the
     settlement's own rules and only public facts. The full value
     is rebuilt exactly as jpStakeCtx rebuilds it — the bank
     entry's own base, the round multiplier, the Headline's public
     double — and NEVER from the snapshot's effective figures,
     which carry the Golden double: a masked Golden prices at its
     public figure here, as everywhere. The drain is the
     settlement's own: Math.round(full x (1 - 0.5 x elapsed)),
     the figure the referee stops the clock on. The flat extras
     ride as segments, each faithful to its rule: the streak's
     +$25 when this player's own run (the snapshot's per-player
     streak) makes their next bank the one that reaches three —
     MCQ only, guess kinds are neutral and never earn it; the
     quick-draw's +$50 as FIRST IN, shown only while it is still
     this pad's to take — the pad learns lock-ins as counts, never
     correctness or order, so the moment another seat's answer is
     in, FIRST IN can no longer be promised and the segment
     leaves. A Big Finish question prices at the player's own bet
     x $100 (an unplaced bet is settlement's default one chip).
     A guess question prices the pot figure the closest number
     takes, with no segments. The Decider banks $0 by design, so
     it wears no price at all; a question this pad cannot price
     from public facts (the nightly special, whose served shape
     carries no bank difficulty) wears none either — the big
     screen remains its truth, as with the stakes ribbon. */
  function jpToYou(ctx, frac) {
    if (!ctx || ctx.decider) return null;
    var guess = ctx.kind === "num";
    var base;
    if (ctx.betted) {
      base = (ctx.myBet != null ? ctx.myBet : 1) * 100;
    } else {
      if (!BASE_VALUES[ctx.diff]) return null;
      var full = BASE_VALUES[ctx.diff] * (ctx.round === 2 ? 2 : 1) * (ctx.headline ? 2 : 1);
      var f = Math.max(0, Math.min(1, frac || 0));
      base = Math.round(full * (1 - 0.5 * f));
    }
    var qd = !guess && (ctx.othersIn || 0) === 0;
    var streak = !guess && (ctx.myStreak || 0) >= 2;
    return { base: base, qd: qd, streak: streak, guess: guess,
      total: base + (qd ? QUICK_DRAW_BONUS : 0) + (streak ? STREAK_BONUS : 0) };
  }
  function jpToYouFormat(comp) {
    var t = "TO YOU: " + money(comp.total);
    if (comp.qd) t += " · FIRST IN " + mplus(QUICK_DRAW_BONUS);
    if (comp.streak) t += " · STREAK " + mplus(STREAK_BONUS);
    return t;
  }
  /* the composition's inputs, read off what this pad already
     holds: the question view and this player's own snapshot
     fields. myIn is this pad's own lock-in (its standing pick or
     sent number). othersIn is every OTHER seat's standing
     answer, and getting it right turns on one subtlety: the
     room's count and this pad's own pick are only a consistent
     pair inside a server state snapshot — the tap handler echoes
     the pick locally at once, tens of milliseconds before the
     room's count can include it, so a pad that subtracted its
     own pick from a count that never contained it would keep
     promising FIRST IN to a second locker. JP._toyouCountedQid
     names the question whose count, as last confirmed by a
     state snapshot carrying this pad's own answer, already
     includes it; only then is one subtracted. */
  function jpToYouCtx(d, s) {
    var q = d.q, me = jpMe();
    var myIn = q.kind === "num"
      ? (s.yourNum != null || (JP.sentNum && JP.sentNum.qid === q.qid))
      : s.yourPick != null;
    return { qid: q.qid, kind: q.kind, round: q.round || 0, headline: !!q.headline,
      decider: !!q.decider, betted: !!q.betted, diff: d.bank ? d.bank.diff : null,
      myStreak: me ? (me.streak || 0) : 0,
      myBet: s.yourBet != null ? s.yourBet : null,
      myIn: myIn, othersIn: Math.max(0, (q.answersIn || 0) - (JP._toyouCountedQid === q.qid ? 1 : 0)) };
  }
  /* the elapsed fraction on the snapshot's own window, the same
     arithmetic jpTick drains the bar by */
  function jpToYouFrac(q) {
    if (!q || !q.windowMs || q.deadline == null) return 0;
    var rem = q.deadline - (Date.now() + JP.offset);
    if (rem < 0) rem = 0;
    return Math.min(1, Math.max(0, 1 - rem / q.windowMs));
  }
  /* the line for a render: a frozen line (this pad locked in on
     this question) stands exactly as it froze; a live line is
     composed fresh, and the paint that first finds this pad
     locked in freezes it — the price at the lock-in instant is
     the locked truth the reveal will prove. */
  function jpToYouText(d, s) {
    var q = d.q;
    if (JP._toyouFrozen && JP._toyouFrozen.qid === q.qid) return JP._toyouFrozen.text;
    var ctx = jpToYouCtx(d, s);
    JP._toyouCtx = ctx;
    var comp = jpToYou(ctx, jpToYouFrac(q));
    if (!comp) return null;
    var text = jpToYouFormat(comp);
    if (ctx.myIn) JP._toyouFrozen = { qid: q.qid, text: text };
    return text;
  }
  /* the tick's repaint: rides jpTick, no new timer. The cached
     ctx's static facts stand; only the volatile fields are
     refreshed from the snapshot this pad already holds, so the
     tick allocates nothing per pass. */
  function jpToYouTick() {
    var el = $("jpToYou");
    if (!el || !JP || !JP.snap || JP.snap.phase !== "answer" || !JP.snap.question) return;
    var s = JP.snap, q = s.question;
    if (JP._toyouFrozen && JP._toyouFrozen.qid === q.qid) {
      if (el.textContent !== JP._toyouFrozen.text) el.textContent = JP._toyouFrozen.text;
      return;
    }
    var ctx = JP._toyouCtx;
    if (!ctx || ctx.qid !== q.qid) return;
    var me = jpMe();
    var myIn = q.kind === "num"
      ? (s.yourNum != null || (JP.sentNum && JP.sentNum.qid === q.qid))
      : s.yourPick != null;
    ctx.myIn = myIn;
    ctx.othersIn = Math.max(0, (q.answersIn || 0) - (JP._toyouCountedQid === q.qid ? 1 : 0));
    ctx.myStreak = me ? (me.streak || 0) : 0;
    ctx.myBet = s.yourBet != null ? s.yourBet : null;
    var comp = jpToYou(ctx, jpToYouFrac(q));
    if (!comp) return;
    var text = jpToYouFormat(comp);
    if (myIn) JP._toyouFrozen = { qid: q.qid, text: text };
    if (el.textContent !== text) el.textContent = text;
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
    /* pass 7: a render that leaves the reveal lands the hop's
       coins with the card they belonged to */
    if (!JP.snap || JP.snap.phase !== "reveal") jpClearCoins();
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
    /* G6: a hold belongs to one question in its answer phase — a
       snapshot for any other question (or none) retires it whole */
    if (JP._cutHold && (!s || s.phase !== "answer" || !s.question || s.question.qid !== JP._cutHold.qid)) jpCutGhostClear();
    var myName = me ? me.name : (JP.name || "Player");
    if (s.phase === "lobby" || s.phase === "bet" || s.phase === "ended" || s.phase === "intermission") $("scr-join").classList.remove("cat-on");
    if (s.phase === "lobby") {
      /* The minimal pad (Jimmy's word, 2026-11-11): the phone is a
         controller, the TV is the show. The lobby hero is identity
         only — your face, your name, your colour — plus the one
         state line a returning pad needs (a rematch means a later
         show in this same room, no rejoin). The rules card and the
         room's roster live on the big screen's lobby now. */
      main.innerHTML = '<div class="jp-hero" style="--me:' + PCOLORS[JP.seat] + '">' +
        '<div class="jp-hero-ava">' + avatarSVG(jpOwnAvatar(), "neutral", JP.seat || 0) + "</div>" +
        '<div class="jp-herotag">THAT\'S YOU</div>' +
        '<div class="jp-heroname">' + esc(myName) + "</div>" +
        '<div class="jp-colorband"></div>' +
        '<div class="jp-phaseword" id="jpPhaseWord">IN THE LOBBY</div>' +
        (s.showSeq >= 2 ? '<div class="jp-rematch">★ REMATCH — SHOW ' + s.showSeq + '<span>THE TABLE STAYS TOGETHER</span></div>' : "") +
        '<p class="jp-sub">Watch the big screen — when a question lands,<br>this pad becomes your answer buttons.</p>' +
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
        /* The minimal pad: no projection line here any more — the
           standings story is the big screen's to tell (the G3 model
           jpProjLine stays in the file, unrendered on the pad). */
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
      var padEnt = entOnce("jp:" + JP.code + ":" + d.q.qid) ? entSlug(d.q.category) : null;
      jpApplyCat(d.q.category);
      /* The minimal pad: the answer phase is the identity bar
         (your face, name, phase word, place, money) and the drain
         bar — then the controls themselves. The question text, the
         band, the pot, the stake callouts, the streak line and the
         G4 price ticker all live on the big screen now; the pad's
         buttons carry the answer texts, which are the input. */
      var padTop = jpIdBar(true) +
        '<div class="jp-barwrap" id="jpBarWrap"><div class="jp-bar" id="jpBar" style="width:100%"></div></div>';
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
        entPadApply(main, padEnt);
      } else if (d.q.kind === "num") {
        if (JP.sentNum && JP.sentNum.qid !== d.q.qid) JP.sentNum = null;
        var effNum = s.yourNum != null ? s.yourNum : (JP.sentNum ? JP.sentNum.num : null);
        main.innerHTML = '<div class="jp-pad">' + padTop +
          '<div class="jp-numpad">' +
          '<input id="jpNum" class="jp-num" type="number" inputmode="decimal" placeholder="Your number" value="' + (numKeep != null ? esc(numKeep) : (effNum != null ? effNum : "")) + '">' +
          '<div class="jp-numstate" id="jpNumState">' + (effNum != null ? "SENT · <b>" + effNum + "</b> — send a new one to change it" : "CLOSEST NUMBER TAKES IT · <span id=\"jpCount\">" + (d.q.answersIn || 0) + " / " + s.players.filter(Boolean).length + " IN</span>") + "</div>" +
          '<button class="btn-gold jp-sendbig" id="jpNumSend">SEND NUMBER</button></div></div>';
        entPadApply(main, padEnt);
        $("jpNumSend").addEventListener("click", function () {
          var v = parseFloat($("jpNum").value);
          if (!isFinite(v)) { jpToast("Give a number first."); return; }
          Snd.ensure();
          JP.sentNum = { qid: d.q.qid, num: v };
          jpPaintClock(); // the word flips to LOCKED IN on the tap, not on the next tick
          jpToYouTick(); // G4: the price freezes in the tap's own task, at the tap's own instant
          jpSend({ t: "answer", qid: d.q.qid, num: v });
          var ns = $("jpNumState");
          if (ns) ns.innerHTML = "SENT · <b>" + v + "</b> — send a new one to change it";
        });
        if (numFocus && $("jpNum")) $("jpNum").focus();
      } else {
        var cutIdx = d.q.cut ? d.q.cut.indices : [];
        /* G6: a live hold's ghost repaints with the render — but
           only while no cut has landed: once one has, the settled
           cut above is the whole truth and the ghost stands down */
        var ghostIdx = (!d.q.cut && JP._cutHold && JP._cutPreview && JP._cutPreview.qid === d.q.qid) ? JP._cutPreview.indices : [];
        var btns = d.opts.answers.map(function (t, i) {
          return '<button class="jp-ans' + (s.yourPick === i ? " sel" : "") + (cutIdx.indexOf(i) >= 0 ? " cut" : "") + (ghostIdx.indexOf(i) >= 0 ? " cutghost" : "") + '" data-pick="' + i + '"><span class="jp-numb">' + (i + 1) + '</span><span class="jp-ans-tx">' + esc(t) + '</span><span class="jp-ans-tag">✓ YOUR PICK</span></button>';
        }).join("");
        var cutBtn = "";
        /* Pass N2: the button offers while a blade remains, and
           says how many when the pocket holds two */
        if (me && snapCutN(me) > 0 && !d.q.cut) cutBtn = '<button class="jp-cut" id="jpCut">✂ CUT TWO — KILL TWO WRONG ANSWERS' + (snapCutN(me) > 1 ? " · " + snapCutN(me) + " IN HAND" : "") + "</button>";
        else if (d.q.cut) cutBtn = '<div class="jp-cutnote">CUT TWO PLAYED — TWO ANSWERS ARE GONE</div>';
        main.innerHTML = '<div class="jp-pad">' + padTop +
          '<div class="jp-answers">' + btns + "</div>" +
          '<div class="jp-pickstate" id="jpPickState">' + (s.yourPick != null ? "✓ <b>PICK " + (s.yourPick + 1) + " IS IN</b> — TAP ANOTHER TO CHANGE IT" : "TAP YOUR ANSWER · <span id=\"jpCount\">" + (d.q.answersIn || 0) + " / " + s.players.filter(Boolean).length + " IN</span>") + "</div>" +
          cutBtn + "</div>";
        entPadApply(main, padEnt);
        main.querySelectorAll(".jp-ans").forEach(function (b) {
          b.addEventListener("click", function () {
            Snd.ensure();
            var i = parseInt(b.getAttribute("data-pick"), 10);
            if (JP.snap) JP.snap.yourPick = i;
            main.querySelectorAll(".jp-ans").forEach(function (x) { x.classList.toggle("sel", parseInt(x.getAttribute("data-pick"), 10) === i); });
            var ps = $("jpPickState");
            if (ps) ps.innerHTML = "✓ <b>PICK " + (i + 1) + " IS IN</b> — TAP ANOTHER TO CHANGE IT";
            jpPaintClock(); // the word flips to LOCKED IN on the tap, not on the next tick
            jpToYouTick(); // G4: the price freezes in the tap's own task, at the tap's own instant
            jpSend({ t: "answer", qid: d.q.qid, pick: i });
          });
        });
        var cb = $("jpCut");
        if (cb) jpWirePadCut(cb, d.q.qid);
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
      /* The minimal pad: the break card is your own standing and
         your own blade state, nothing else — the gap story, the
         room's Second Wind news and the next round's promise are
         the big screen's break card to carry. A Second Wind grant
         still names itself here, because it changes what THIS
         pad's holder carries into the next round. */
      var seated = s.players.filter(Boolean);
      var myScore = me ? me.score : 0;
      var myPlace = 1 + seated.filter(function (p) { return p.score > myScore; }).length;
      var placeWord = ["", "1ST", "2ND", "3RD", "4TH"][myPlace] || (myPlace + "TH");
      var windSeatsP = (s.intermission && Array.isArray(s.intermission.wind)) ? s.intermission.wind : [];
      var windMine = windSeatsP.indexOf(JP.seat) >= 0;
      main.innerHTML = '<div class="jp-card"><div class="jp-phaseword" id="jpPhaseWord">THE INTERMISSION</div>' +
        '<div class="jp-hi">YOU\'RE ' + placeWord + " · " + money(myScore) + "</div>" +
        '<p class="jp-sub">' + (windMine
          ? "SECOND WIND — YOUR CUT TWO IS BACK"
          : "CUT TWO — " + (snapCutN(me) >= 2 ? "TWO IN HAND" : snapCutN(me) === 1 ? "IN HAND" : "SPENT")) + "</p>" +
        '<p class="jp-sub">The show resumes from the big screen.</p></div>';
    } else if (s.phase === "reveal") {
      /* The minimal pad: the reveal on the phone is ONE line — what
         your own input earned — over your own score. The answer,
         the spread, the band, the pot, the photo-finish order and
         the celebration all play on the big screen, where the
         whole room can see them. */
      var lr = s.lastReveal;
      var d2 = jpQuestionData();
      if (d2 && d2.bank && d2.bank.cat) jpApplyCat(d2.bank.cat);
      if (!lr) { main.innerHTML = '<div class="jp-card"><div class="jp-phaseword" id="jpPhaseWord">THE VERDICT</div><div class="jp-hi">The reveal…</div><p class="jp-sub">Eyes on the big screen.</p></div>'; jpPaintClock(); return; }
      var mine = null;
      (lr.results || []).forEach(function (r) { if (r.seat === JP.seat) mine = r; });
      var vWord, vMiss = false;
      if (lr.decider) {
        var dWinner = lr.deciderWinner != null ? s.players[lr.deciderWinner] : null;
        if (lr.deciderWinner === JP.seat) vWord = "★ YOU TAKE THE CROWN";
        else if (dWinner) { vWord = esc(dWinner.name).toUpperCase() + " TAKES THE DECIDER"; vMiss = true; }
        else { vWord = "DEAD LEVEL — IT GOES AGAIN"; vMiss = true; }
      } else if (mine && mine.correct) {
        vWord = (lr.kind === "num" ? "CLOSEST · " : "BANKED · ") + mplus(mine.banked);
      } else {
        vMiss = true;
        vWord = (mine && (mine.pick != null || mine.num != null)) ? "NO BANK" : "NO ANSWER";
      }
      main.innerHTML = '<div class="jp-verdict' + (vMiss ? " miss" : "") + '"><div class="jp-plaque"><div class="jp-phaseword" id="jpPhaseWord">' + (lr.decider ? "THE DECIDER" : "THE VERDICT") + '</div>' +
        '<div class="jp-vword">' + vWord + '</div>' +
        '<div class="jp-vscore">YOU <b>' + money(me ? me.score : 0) + "</b></div></div></div>";
      /* The minimal pad: no splices ride this card any more — the
         settled dial, the band, the gilt frame, the pot line, the
         photo-finish order and the coin celebration were the big
         screen's reveal told a second time on a smaller glass. */
    } else if (s.phase === "ended") {
      /* The minimal pad: the ended phone is your own result, the
         share (a phone act by nature — the souvenir is built from
         this pad's snapshot, jpShareData unchanged) and the door.
         The champion, the standings rows and the report card are
         the big screen's finale. */
      shareNight = jpShareData();
      var myScoreE = me ? me.score : 0;
      var myPlaceE = 1 + s.players.filter(Boolean).filter(function (p) { return p.score > myScoreE; }).length;
      var placeWordE = ["", "1ST", "2ND", "3RD", "4TH"][myPlaceE] || (myPlaceE + "TH");
      main.innerHTML = '<div class="jp-card"><div class="jp-phaseword" id="jpPhaseWord">ENDED</div>' +
        '<div class="jp-hi">YOU CAME ' + placeWordE + " · " + money(myScoreE) + "</div>" +
        '<p class="jp-sub">The result is on the big screen.</p>' +
        '<button class="btn-gold jp-share" id="jpShareNight">SHARE THE NIGHT</button>' +
        '<button class="btn-ghost jp-leave" id="jpLeave">LEAVE ROOM</button></div>';
    }
    var lv = $("jpLeave");
    if (lv) lv.addEventListener("click", function () { jpTeardown(); showScreen("scr-title"); setMode("join"); });
    var shb = $("jpShareNight");
    if (shb) shb.addEventListener("click", function () { openShareNight(); });
    jpPaintClock();
  }
  function jpTick() {
    if (!JP) return;
    jpPaintClock(); // the pad clock rides the pad's one existing tick — no second timer
    jpToYouTick(); // G4: the personal price drains on this same tick
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
    startShow: startShow, BANK: BANK, HOST: HOST, CAT_LINES: CAT_LINES, drawRevealLine: drawRevealLine, resetLineBags: resetLineBags,
    /* The Ten, pass 1: the wheel's own mathematics, exposed so
       drive-wheel asserts landings with the very functions the
       runner flies by — never a copy of them */
    wheel: {
      rotationFor: wheelRotationFor, segAtNeedle: wheelSegAtNeedle, seg: WHEEL_SEG, ms: WHEEL_MS,
      cats: function () { return CATS.slice(); }, get rest() { return wheelRest; }
    },
    /* The Ten, pass 2: the dial's geometry, exposed so drive-dial
       asserts pin positions and the needle's stop with the very
       function the painters fly by — never a copy of it */
    dial: { layout: dialLayout },
    /* The Ten, pass 3: the band's wording, exposed so drive-band
       asserts the printed word with the very functions the
       painters fly by — never a copy of them */
    band: { word: bandWord, tag: bandTagHTML },
    /* The Ten, pass 4: the golden slot list itself, exposed so
       drive-golden asserts the pick against the very list the
       dealer draws from — never a copy of it */
    golden: { slots: function () { return GOLDEN_SLOTS.slice(); }, valid: validGoldenSlot },
    /* The Ten, pass 5: the house itself, exposed so drive-house
       asserts the cast and the brain with the very tables and
       functions the show deals by — never a copy of them */
    house: { profiles: HOUSE_PROFILES, startSolo: startSoloShow, dealCast: dealHouseCast, prob: houseProb, guess: houseGuess },
    /* The Ten, pass 6: the entrances' slug map, exposed so
       drive-entrances asserts the card's class with the very map
       the painters fly by — never a copy of it */
    entrances: { slug: entSlug },
    /* The Ten, pass 7: the flight banding itself, exposed so
       drive-money asserts coin counts with the very function the
       flights are sized by — never a copy of it */
    money: { count: coinsForAward },
    /* Dynamics pass D1: the pot's own arithmetic, exposed so
       drive-pot asserts the feed with the very function the
       settlement runs — never a copy of it */
    pot: { feed: tablePotFeed, moment: potMomentFor },
    /* Gameplay-visuals pass G1: the melt's own mapping, exposed so
       drive-melt asserts levels with the very functions the painters
       fly by — never a copy of them */
    melt: { frac: meltFrac, mult: meltMult, marks: { floor: MELT_FLOOR, full: MELT_FULL, x2: MELT_2X } },
    /* Gameplay-visuals pass G2: the stakes call itself, exposed so
       drive-stakes asserts the matrix with the very function every
       surface consults — never a copy of it */
    stakes: { callout: stakeCallout },
    /* Gameplay-visuals pass G4: the pad's personal price itself,
       exposed so drive-toyou asserts the composition with the very
       function the pad paints by — never a copy of it */
    toyou: { price: jpToYou },
    /* Gameplay-visuals pass G7: the clock-light's own displayed
       fraction and the host's feed, exposed so drive-clocklight
       asserts the rim against the very state the painter flies
       by — never a copy of it */
    clocklight: { f: function () { return rimF; }, feed: rimFeed },
    /* Pass N2: the house rules themselves, exposed so
       drive-houserules asserts the night's bends with the very
       functions the setup, the engines and the cards fly by —
       never a copy of them */
    rules: { prefs: loadRulePrefs, clean: cleanRulesObj, caps: rulesCapsText, prose: rulesProseText, cutStart: cutStartOf, snapCut: snapCutN, calm: calmNow },
    /* Visual pass V1: the planes themselves, exposed so
       drive-planes asserts the rim and the parallax with the
       very builder and pose functions the show flies by —
       never a copy of them */
    planes: { svg: sterlingSVG, applyCat: applyCat, catStyle: catStyle, point: stPoint, sweep: stSweep, stClass: stClass },
    /* Visual pass V3: the card's own grammar, exposed so
       drive-cardobject asserts the gilt and the wear with the
       very functions the painters fly by — never copies of them */
    card: { s: giltS, wear: cardWear },
    /* Visual pass V2: the faces themselves, exposed so
       drive-faces censuses every mood of every avatar with the
       very renderer the desks fly by — never a copy of it */
    faces: { svg: avatarSVG, features: avFeatures, avatars: AVATARS },
    /* Pass N1: the report card's own derivation, exposed so
       drive-report asserts the finale's card against the very
       function the finale renders from — never a copy of it */
    report: { derive: deriveReport, facts: reportFactsOf, view: reportView },
    /* Pass N3: the share card's own data model, exposed so
       drive-share asserts the composed card against the very
       object the finales built and the canvas drew from — never
       a copy of it */
    share: { get data() { return shareNight; }, open: openShareNight, close: closeShareNight }
  };
  /* Pass P verification hooks: particle censuses for the polish fx */
  window.__fx = { leaves: leaves, coins: coins, jpCoins: jpCoins, motes: motes, laurelState: laurelState };
  window.__online = {
    get OG() { return OG; }, get JP() { return JP; },
    WORKER_URL: WORKER_URL
  };
})();
