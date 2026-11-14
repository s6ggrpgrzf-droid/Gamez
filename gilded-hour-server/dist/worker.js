/* The Gilded Hour online rooms — single-file build. Paste into the
 * Cloudflare Workers dashboard editor, then add a Durable Object
 * binding:  name: ROOMS   class: GildedRoom
 * (or) deploy via Workers Builds / wrangler using the split sources. */
'use strict';
/* The Gilded Hour — online room logic. Pure, JSON-serializable, no
 * Cloudflare APIs. server.js (the Durable Object) is a thin wrapper
 * around this file, following the Dominoes room-server pattern.
 *
 * Roles: one HOST (the show screen — creates the room, drives the show,
 * is NOT a player) plus up to 4 PLAYERS in seats 0..3.
 *
 * The server referees the Pass B format:
 *   15 questions (R1 x6, R2 x6 at x2 value, R3 x3 behind a bet phase).
 *   Per question the host publishes; players answer privately inside a
 *   window that the SERVER stamps on its own clock. The question value
 *   drains 100% -> 50% linearly across the window; at reveal, correct
 *   players bank the as-stopped value. Kinds: 'normal'/'survey' (pick
 *   1..N) and 'num' (submit a number; closest to the true number banks,
 *   ties each bank the full value). One lifeline: Cut Two — one token
 *   per player per show; the host supplies the two wrong indices when
 *   publishing, the server enforces token + one-cut-per-question and
 *   broadcasts the cut. Round 3 bet phase: each player secretly sets
 *   1..cap chips before the question; a correct answer banks bet x $100,
 *   a wrong answer loses $0. A missing bet defaults to 1 chip. The
 *   Long Shot cap is 3 plus one per full $1,000 the player trails the
 *   current leader, never more than 5, computed from the scores when
 *   the bet is placed and enforced here — clients are never trusted.
 *   Nobody can lose money anywhere. Scores live here, server-side.
 *
 *   The Headline Question (Design pass 2): the SIXTH question
 *   published in Round 2 — position counted here, from the room's own
 *   publish history, never from a client claim (a headline field in
 *   a publish message is simply never read) — plays at double value
 *   on a halved window. The doubling and the halving are applied to
 *   the question record itself (multiplier x2, windowMs /2), so the
 *   drain, the deadline and every payout downstream are the ordinary
 *   code running on the effective figures.
 *
 *   The Quick-Draw (Design pass 3): on a 'normal' question, the
 *   first CORRECT answer by server receipt pockets a flat $50 on
 *   top of its banked amount at reveal — never scaled by the round
 *   multiplier, the Headline x2, or a Big Finish bet. Receipt is
 *   recorded here as an order list (q.pickOrder): every accepted
 *   pick moves its seat to the back, so the order that counts is
 *   the order in which the answers the players STAND ON arrived —
 *   a changed pick re-queues behind the answers it replaced. Guess
 *   kinds ('survey', 'num') never quick-draw — their drama is
 *   closeness. The winner is computed here at close from the room's
 *   own records; no message field can claim it (such fields are
 *   never read), and the reveal carries it as quickDrawSeat plus a
 *   quickDraw flag on the winner's result entry.
 *
 *   The Photo-Finish (gameplay-visuals pass G5): alongside the
 *   receipt ORDER, every accepted pick also leaves its receipt
 *   TIME (q.pickTimes, server clock at acceptance, re-stamped when
 *   a pick changes — the time of the answer the player stands on).
 *   At close, each pick-based result carries lockMs: milliseconds
 *   from the question's open to that receipt, or null where no pick
 *   was ever received (silent seats; number questions, which take
 *   numbers, not picks). It is display truth only — no settlement
 *   reads it — and because pickOrder is exactly pickTimes sorted,
 *   the quick-draw winner is always the earliest correct lockMs.
 *
 *   The Decider (New programme pass 1): when a show's fifteenth
 *   reveal leaves two or more players tied at the top, the crown is
 *   settled head-to-head. The host publishes ONE extra question
 *   through the ordinary publish path, marked decider:true with an
 *   eligible list (the tied seats, at least two, all joined). A
 *   decider is always kind 'num' — closest number, the guess
 *   machinery verbatim — with three twists, all enforced here:
 *   answers from seats outside the eligible list are rejected;
 *   closeness is judged over the eligible seats only; and NO money
 *   moves (every result banks $0, scores stay frozen) — the decider
 *   decides the title only. Its reveal carries decider:true, the
 *   eligible list, and deciderWinner: the single closest eligible
 *   seat, or null when the closest calls are identical (or nobody
 *   answered), in which case the host simply publishes another.
 *   A resolved winner is kept on the room (room.deciderWinner) and
 *   rides the end_show broadcast as winnerSeat, so every screen —
 *   including a pad that only ever sees snapshots — can name the
 *   champion the decider chose rather than guessing from the
 *   frozen, still-tied scores.
 *
 *   The Intermission (New programme pass 2): after a round's last
 *   reveal the host rests the room between rounds. The host sends
 *   {t:'intermission', nextRound} — accepted only from the reveal
 *   phase, only naming round 2 or 3 — and the room holds a new
 *   phase, 'intermission', whose snapshots carry
 *   intermission:{nextRound}. That phase signal is the whole
 *   addition: the facts on the host's story card (biggest bank,
 *   quick-draw tally) are the host's own records and never travel;
 *   everything on a pad's break card (its score, place, gap, Cut
 *   Two) derives from the players array the snapshot already
 *   carries. The break ends when the host advances: publish_question
 *   and bet_phase both accept the intermission phase and clear it,
 *   and end_show clears it too. Players cannot call the break —
 *   the message exists only in the host handler.
 *
 *   Second Wind (Dynamics pass D2): the break itself now pays a
 *   small mercy. At the moment the intermission is accepted —
 *   inside that handler, the one place a break begins — every
 *   seat tied for LAST place whose Cut Two is spent gets it back.
 *   A trailer still holding theirs gets nothing: the grant tops
 *   up toward the seat's starting count and never past it (one
 *   token as written here; two under Second Cut — the N2 note).
 *   The
 *   grant fires exactly once per break because the message is
 *   accepted only from the reveal phase and leaves the room in
 *   the intermission phase, where a replay is refused. The
 *   granted seats are recorded on room.interm.wind and ride
 *   every break snapshot (intermission:{nextRound, wind}), so a
 *   pad that resyncs at the break reads the granted state — and
 *   the names for its card — from the referee, never from a
 *   second grant. The second break re-evaluates from the
 *   standings as they then stand. Nothing is scored, and
 *   nothing else about Cut Two changes.
 *
 *   Hot Streaks (New programme pass 3): a player's streak is their
 *   run of consecutive banked 'normal' questions, kept on the player
 *   record (players[].streak) and settled here at close, exactly
 *   once, alongside the other money. Banking extends the run by
 *   one; missing resets it to zero. Guess kinds ('survey', 'num')
 *   are NEUTRAL — they neither build nor break a run — and a
 *   decider never touches one. From the bank that REACHES 3 onward,
 *   every consecutive bank adds a flat STREAK_BONUS ($25) to that
 *   result's banked figure: never scaled by the round multiplier,
 *   the Headline x2, or a Big Finish bet (a bet question banks
 *   bet x $100 + $25, not bet x $125). Each result entry carries
 *   the run's outcome — streak (the count after this question) and
 *   streakBonus (0 or 25) — so host and pads paint from the payload
 *   and never recompute money; the reveal also names at most one
 *   streakMoment ({type:'reach3'|'reach5'|'death', seat, n}): the
 *   single threshold event Sterling speaks for this reveal, chosen
 *   here — reach5 outranks reach3 outranks a death, the higher
 *   count wins inside a type, the earlier seat breaks a tie. The
 *   counts ride the snapshot's players array, so a pad that
 *   refreshes mid-show sees its true streak.
 *
 *   Rematch Night (New programme pass 4): when a show has ended,
 *   the host may deal another in the SAME room — {t:'new_show'},
 *   accepted only from phase 'ended'. The referee's per-show
 *   state resets: every seated player's score, Cut Two and
 *   streak, the open question and its bet, the last reveal, the
 *   intermission, the decider verdict and the Headline publish
 *   counts. The seats themselves — names, avatars, tokens and
 *   connection flags — are identity, not show state, and do not
 *   move: a player who wandered off stays seated (and may
 *   reclaim), and the host's client decides who the new show's
 *   cast is from who is connected. The room keeps a show counter
 *   (showSeq, from 1) that new_show advances and every snapshot
 *   carries, so a pad can tell the room's second show from its
 *   first without trusting a phase edge. Players cannot call a
 *   new show — the message exists only in the host handler.
 *
 *   Show the Band (The Ten, pass 3): the difficulty band the host
 *   dealt (1 Warm / 2 Middle / 3 Deep Cut) becomes public. The
 *   host names it on publish_question as `band`; the room keeps
 *   only a validated 1|2|3 (anything else — missing, fractional,
 *   out of range — is stored as null, never trusted, never an
 *   error: an older host simply deals unbanded questions). The
 *   public question view carries it to every viewer from open
 *   through the reveal. It is presentation, not a secret and not
 *   money: no settlement path ever reads it, and — unlike the
 *   Headline — the room does not derive it; the band is a fact
 *   about the dealt bank entry, and the host is its only source.
 *
 *   The Golden Question (The Ten, pass 4): exactly one question
 *   per show is secretly golden and pays DOUBLE under the
 *   Headline's grammar — the doubled multiplier and halved window
 *   fold into the question record at publish, so the drain, the
 *   deadline and every payout are the ordinary code running on
 *   the effective figures (and the streak / quick-draw bonuses
 *   stay flat, added after, as always). The host picks the slot
 *   before the show from its seeded rng and names it on that one
 *   publish as golden:true. Unlike the band, this claim IS
 *   refereed, inside the honest envelope: rounds 1-2 only (the
 *   Big Finish pays bet x $100, not question value — gold there
 *   would double nothing), never on the Headline (the two
 *   doubles never stack), never on a decider (which banks
 *   nothing), and only ONCE per show (room.goldenUsed; a fresh
 *   show via new_show earns a fresh pick). A claim outside the
 *   envelope is stored as an ordinary question — never an error,
 *   exactly like a legacy host that never sends the field at
 *   all. The flag is a SECRECY on the same footing as
 *   correctIdx: it lives only on the question record, rides no
 *   snapshot (snapshotFor simply never copies it, for any viewer
 *   — the host resyncs its own plan locally, not from the room),
 *   and first leaves the room inside the reveal payload (and the
 *   lastReveal a post-reveal snapshot carries), once the money
 *   has already moved.
 *
 *   The Table Pot (Dynamics pass D1): money the room fails to bank
 *   does not vanish — it feeds a pot the champion takes. The rule
 *   runs here, once, at close, beside the rest of the money. In
 *   Rounds 1-2, a question NO seat banks feeds the pot exactly
 *   what a winner would have taken: the as-stopped drained value
 *   (the Headline/Golden doubling already folded into the question
 *   record, so the doubled figure feeds). A partial bank feeds
 *   nothing. In the Big Finish there is no question value to feed,
 *   so each seat that MISSES feeds its own stake instead: its bet
 *   x $100, at the bet it actually placed (the Long Shot cap has
 *   already had its say at bet time; a missing bet is the usual
 *   default 1). The Decider banks $0 by design and feeds nothing.
 *   The pot never touches a score and never changes who wins — it
 *   is added to the champion's total only on the host screen, at
 *   the finale, and written into that screen's record there. It
 *   rides every snapshot (pot) and every reveal (pot, plus potFed:
 *   what THIS question fed), so a resync repaints the vessel
 *   settled and never re-feeds. A fresh show via new_show starts
 *   with an empty pot, always.
 *
 * Secrecy: correctIdx / trueNum / picks / bets are stored in the room
 * but NEVER leave it before reveal — broadcasts during a window carry
 * counts only (answersIn, betsIn). Per-viewer snapshots include only
 * the viewer's own pick/num/bet (plus, for the host alone, the secrets
 * it authored, so a reconnected host can resync).
 *
 * Cut Two, Previewed (Gameplay-visuals pass G6): the cut pair is
 * committed at publish — it rides the question record as cutIndices,
 * chosen by the host and validated here — and {t:'cut_preview', qid}
 * lets a pad ask what its own spend WOULD cut. The answer goes to the
 * asking seat alone ({t:'cut_preview', qid, indices}), spends nothing,
 * changes nothing, and is never broadcast or written into a snapshot.
 * A later cuttwo cuts exactly the previewed pair, because both read
 * the same stored record. The guards mirror cuttwo's own (open MCQ
 * question, pair available, no cut yet, token in hand); a refusal is
 * an error to the requester only, like every refusal.
 *
 * The Report Card (pass N1): four per-seat facts the referee keeps
 * through the night and reads back at the finale — recorded facts
 * only, the Intermission's rule. Settled at close beside the rest
 * of the money (the Decider settles none of them): BIGGEST BANK is
 * the largest single-question total a seat took home (the settled
 * banked figure, quick-draw and streak bonuses and every doubling
 * already inside it); BEST CATEGORY is where the seat's banked
 * money piled highest (ties: more banks there, then the category
 * banked in earliest); FASTEST HAND is the seat's quickest CORRECT
 * lock-in, read from the standing pick's own receipt stamp
 * (q.pickTimes — stamped for number answers too, so a closest call
 * counts by the moment it landed); HOTTEST STREAK is the peak run
 * the settlement itself recorded. The raw tallies ride the room
 * (stats, reset by new_show like every per-show memory); the
 * derived card (reportFor) leaves the room only when the show is
 * over — in the `ended` broadcast and in snapshots taken at phase
 * 'ended' — never mid-show, so no screen can peek at the card
 * before the finale.
 *
 *   House Rules (pass N2): three toggles the host sets when the
 * room is created, kept on the room (room.rules) and carried in
 * every snapshot, so every screen in the room agrees on the night
 * that is being played. All default OFF, and a room persisted
 * before they existed reads all-off — tonight's game, unchanged.
 * LONGER CLOCK: every published window is stretched x1.5 here, at
 * the one place windows are born (the Headline and Golden
 * halvings then apply to the longer figure, as they always apply
 * to the dealt one). SECOND CUT: the Cut Two token becomes a
 * COUNT — a seat starts the show holding two, a spend decrements,
 * and Second Wind tops a tied-last seat up by one, never above
 * its STARTING count (the D2 note's "boolean, never two" is this
 * rule at a starting count of one). The count is the room's own
 * record (players[].cutTwo, a number from this pass on); a record
 * persisted before it — a boolean — reads as its count (true ->
 * 1, the old starting count; false -> 0), and the snapshot keeps
 * dealing the boolean `cutTwo` (a token in hand) beside the
 * number `cutCount`, so older screens read exactly what they
 * always read. CALM TABLE: display-side only — the room merely
 * carries the flag; no referee path reads it. The rules are the
 * ROOM's, not the show's: new_show keeps them (a rematch plays
 * the same house), and changing them means a new room.
 *
 * Handler result convention (consumed by server.js):
 *   { to: [{dest, msg}], all: msg|null, state: bool,
 *     changed: bool, error: string|null }
 *   dest is 'host' or a seat number. `all` is one literal message sent
 *   to every connection; `state: true` asks the wrapper to push a fresh
 *   per-viewer snapshot to everyone; `error` goes to the sender only.
 *   `changed: true` means the wrapper should persist the room.
 */

const CODE_LEN = 4;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/L/O/0/1
const MAX_PLAYERS = 4;
const BET_PAYOUT = 100; // one chip is worth $100 in the finale
const BASE_BET_CAP = 3;
const MAX_BET_CAP = 5;
const LONG_SHOT_STEP = 1000;
const QUICK_DRAW_BONUS = 50; // flat, on a 'normal' question's first correct receipt
const STREAK_BONUS = 25; // flat, per bank once a streak reaches STREAK_MIN
const STREAK_MIN = 3; // banks in a row before the bonus starts paying
const STREAK_DEATH_MIN = 4; // a dying run of this length or more earns a named moment
const BLUFF_FOOL = 25; // THE BLUFF (research programme pass 2): per player a lie fools, paid by the house
const BLUFF_INVENT_MS = 60000; // the bluff's collecting window before the room deals what it has
const CLOCK_STRETCH = 1.5; // House Rules (N2): Longer Clock stretches every window by this

/* House Rules (pass N2): the night's three toggles, normalized
 * once at the room's creation and read off the room ever after.
 * Anything that is not a literal `true` is off — a rules field
 * from anywhere else (a hand-edited record, an old client) can
 * only ever switch a rule OFF, never invent one. */
function cleanRules(v) {
  const r = (v && typeof v === 'object') ? v : {};
  return {
    longerClock: r.longerClock === true,
    secondCut: r.secondCut === true,
    calmTable: r.calmTable === true,
  };
}

/* The Cut Two count a seat STARTS a show with, under the room's
 * rules: two under Second Cut, one without it. Second Wind tops
 * up toward this figure and never past it. */
function cutStartFor(room) {
  return (room && room.rules && room.rules.secondCut === true) ? 2 : 1;
}

/* A player record's Cut Two COUNT, however the record spells it:
 * a number is itself (clamped to the honest 0..2), a boolean from
 * a room persisted before the count existed reads as its count
 * (true -> 1, the starting count of the game that wrote it;
 * false -> 0), and anything else is an empty pocket. */
function cutCountOf(p) {
  if (!p) return 0;
  const v = p.cutTwo;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.min(2, Math.floor(v)));
  return v === true ? 1 : 0;
}

/* The Long Shot, server-authoritative: 3 chips at (or near) the
 * lead, +1 per full $1,000 of deficit, capped at 5. Purely a
 * function of the scores in the room at bet time. */
function betCapFor(room, seat) {
  const p = room && room.players ? room.players[seat] : null;
  if (!p) return BASE_BET_CAP;
  let lead = p.score;
  for (const s of joinedSeats(room)) if (room.players[s].score > lead) lead = room.players[s].score;
  return Math.min(MAX_BET_CAP, BASE_BET_CAP + Math.floor(Math.max(0, lead - p.score) / LONG_SHOT_STEP));
}

/* The Headline derivation: the room counts its own publishes per
 * round; the sixth Round 2 publish is the Headline. Purely positional
 * — kind, category and any client-supplied flag play no part. */
function headlinePublish(room, round) {
  if (round !== 2 || !room) return false;
  const counts = room.published && typeof room.published === 'object' ? room.published : {};
  return (counts['2'] || 0) === 6;
}

function makeCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_CHARS[(rand() * CODE_CHARS.length) | 0];
  return s;
}

function makeToken() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0;
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/* Clock: the server stamps every deadline itself; client clocks are
 * never trusted. Tests inject a fake clock via setNowProvider. */
let nowProvider = () => Date.now();
function setNowProvider(fn) { if (typeof fn === 'function') nowProvider = fn; }
function nowMs() { return nowProvider(); }

function createRoom(code, hostToken, rules) {
  return {
    code,
    hostToken,
    rules: cleanRules(rules), // House Rules (N2): the night's toggles, set at creation, the room's for its whole life
    phase: 'lobby',           // lobby | bet | answer | reveal | intermission | ended
    players: [null, null, null, null], // {name, token, score, cutTwo, connected, avatar, streak}
    bet: null,                // {qid, bySeat:{seat:chips}} while a bet phase is open
    published: {},            // round -> count of questions published (Headline derivation)
    lastPubQid: null,         // a re-publish of the same qid is the same question, not a new one
    question: null,           // current/last question record (see publish)
    lastReveal: null,         // payload of the last reveal, for snapshots
    interm: null,             // {nextRound} while the room rests between rounds (the Intermission)
    deciderWinner: null,      // seat that won a resolved decider, once one resolves
    goldenUsed: false,        // the Golden Question: this show's one double is spent
    pot: 0,                   // The Table Pot (D1): unbanked money the champion takes
    stats: [null, null, null, null], // The Report Card (N1): per-seat raw tallies {cats, fastestMs, biggest, peak}
    statsSeq: 0,              // questions settled this show — the "earliest in the night" clock for best-category ties
    showSeq: 1,               // which show of the night this room is on (Rematch Night)
    createdAt: nowMs(),
    lastActivity: nowMs(),
  };
}

function joinedSeats(room) {
  const out = [];
  for (let s = 0; s < MAX_PLAYERS; s++) if (room.players[s]) out.push(s);
  return out;
}

function scoresArray(room) {
  return room.players.map((p) => (p ? p.score : null));
}

/* The Report Card (N1): the derived card, one entry per seat (null
 * for an empty seat), computed from the raw tallies closeQuestion
 * keeps. best is {cat, amt} or null — a category only counts money
 * actually banked in it; ties break to more banks there, then to
 * the category the seat first banked in (the smaller `first` — the
 * settled-question number of that first bank). fastestMs is null
 * when no correct lock-in was ever stamped for the seat. A room
 * persisted before the card existed has no tallies: every seat
 * reads as a blank card, which is exactly what it recorded. */
function reportFor(room) {
  const stats = Array.isArray(room.stats) ? room.stats : [];
  return room.players.map((p, seat) => {
    if (!p) return null;
    const st = stats[seat];
    if (!st || typeof st !== 'object') return { best: null, fastestMs: null, biggest: 0, peak: 0 };
    let best = null;
    const cats = (st.cats && typeof st.cats === 'object') ? st.cats : {};
    for (const cat of Object.keys(cats)) {
      const c = cats[cat];
      if (!c || !(c.amt > 0)) continue;
      if (!best || c.amt > best.amt
        || (c.amt === best.amt && (c.n > best.n || (c.n === best.n && c.first < best.first)))) {
        best = { cat, amt: c.amt, n: c.n, first: c.first };
      }
    }
    return {
      best: best ? { cat: best.cat, amt: best.amt } : null,
      fastestMs: typeof st.fastestMs === 'number' ? st.fastestMs : null,
      biggest: st.biggest || 0,
      peak: st.peak || 0,
    };
  });
}

function cleanName(name, seat) {
  const s = String(name || '').trim().slice(0, 24);
  return s || ('Player ' + (seat + 1));
}

/* Player avatar: an integer 0..7 chosen on the joining phone (Design
 * pass item 6). Anything else — missing, non-integer, out of range —
 * falls back to the seat's own index, so old clients that never send
 * the field get exactly the pre-avatar behaviour. */
const AVATAR_COUNT = 8;
function cleanAvatar(value, seat) {
  return Number.isInteger(value) && value >= 0 && value < AVATAR_COUNT
    ? value
    : ((seat % AVATAR_COUNT) + AVATAR_COUNT) % AVATAR_COUNT;
}

function out(partial) {
  return Object.assign({ to: [], all: null, state: false, changed: false, error: null }, partial);
}
function fail(msg) { return out({ error: msg }); }
function ok(partial) { return out(partial || {}); }

/* Per-viewer snapshot. Player viewers never see correctIdx/trueNum,
 * other players' picks/nums/bets, or anyone's reclaim token. */
function snapshotFor(room, view) {
  const q = room.question;
  let pubQ = null;
  if (q) {
    pubQ = {
      qid: q.qid,
      round: q.round,
      kind: q.kind,
      category: q.category,
      answersCount: q.answersCount,
      baseValue: q.baseValue,
      multiplier: q.multiplier,
      headline: q.headline === true,
      band: q.band === 1 || q.band === 2 || q.band === 3 ? q.band : null,
      windowMs: q.windowMs,
      openedAt: q.openedAt,
      deadline: q.deadline,
      betted: q.betted,
      decider: q.decider === true,
      eligible: q.decider ? (q.eligible || []).slice() : null,
      cut: q.cutBy != null ? { bySeat: q.cutBy, indices: q.cutIndices.slice() } : null,
      /* THE DOUBLE: the seats whose token is riding on this
       * question — public the moment it is declared, like every
       * other stake at this table */
      dblArmed: q.dbl ? Object.keys(q.dbl).map(Number) : [],
      vsArmed: q.vs ? Object.keys(q.vs).map(Number) : [],
      /* THE BLUFF: which of its two lives the question is in and
       * how many lies are in; once dealt, the answer texts are
       * public — their authors stay secret until the reveal */
      ...(q.kind === 'bluff' ? {
        bluffPhase: room.phase === 'invent' ? 'invent' : 'answer',
        fakesIn: q.fakes ? Object.keys(q.fakes).length : 0,
        options: q.options ? q.options.map((o) => o.t) : null,
      } : {}),
      answersIn: Object.keys(q.kind === 'num' ? q.nums : q.picks).length,
    };
    if (view.role === 'host') { // the host authored the secrets; resync may echo them to it alone
      pubQ.correctIdx = q.correctIdx;
      pubQ.trueNum = q.trueNum;
    }
  }
  const snap = {
    code: room.code,
    /* House Rules (N2): the room's toggles ride every snapshot —
     * the lobby line, the pad's waiting screen and the calm
     * manner all read them from here; a room persisted before
     * they existed reads all-off, which is the game it was
     * already playing */
    rules: cleanRules(room.rules),
    phase: room.phase,
    /* which show of the night this is (Rematch Night): 1 for the
     * room's first show, advancing only when the host calls
     * new_show — a room persisted before the field existed reads 1 */
    showSeq: room.showSeq || 1,
    role: view.role,
    seat: view.role === 'player' ? view.seat : null,
    players: room.players.map((p, i) => (p
      /* House Rules (N2): cutTwo stays the boolean it has always
       * been (a token in hand — a record persisted as a count reads
       * through cutCountOf), and cutCount rides beside it as the
       * number, so a screen that knows the count reads the count
       * and a screen that doesn't reads exactly what it always did */
      ? { seat: i, name: p.name, score: p.score, cutTwo: cutCountOf(p) > 0, cutCount: cutCountOf(p), dbl: p.dbl !== false, vsRound: p.vsRound || 0, connected: p.connected, avatar: cleanAvatar(p.avatar, i), streak: p.streak || 0 }
      : null)),
    question: pubQ,
    /* The Table Pot (D1): the running total, public from the
     * first question — a room persisted before the pot existed
     * reads 0, which is exactly what its pot holds */
    pot: room.pot || 0,
    /* the Intermission rides the snapshot so a pad (or a restored
     * host) that only ever sees snapshots knows the room is resting
     * and which round follows the break; Second Wind (D2) adds the
     * seats this break granted, so the telling also comes from
     * the referee — a room persisted before the wind existed
     * reads an empty list, which is exactly what it granted */
    intermission: room.phase === 'intermission' && room.interm
      ? { nextRound: room.interm.nextRound, wind: (room.interm.wind || []).slice() } : null,
    bet: room.bet ? {
      qid: room.bet.qid,
      betsIn: Object.keys(room.bet.bySeat).length,
      // the one protocol addition of the Long Shot: a PLAYER's
      // snapshot carries that player's own cap for this bet phase
      // (the host's snapshot does not — caps are per-player state)
      ...(view.role === 'player' ? { yourCap: betCapFor(room, view.seat) } : {}),
    } : null,
    lastReveal: room.lastReveal,
    /* The Report Card (N1): the derived card rides a snapshot only
     * once the show is over — it is a finale artifact, and a screen
     * that resyncs onto the ended room (a pad refreshing at the
     * finale, a host rejoining it) reads the same card the `ended`
     * broadcast dealt. Mid-show it is null, never a peek. */
    report: room.phase === 'ended' ? reportFor(room) : null,
  };
  if (view.role === 'player') {
    const seat = view.seat;
    if (room.bet) snap.yourBet = room.bet.bySeat[seat] != null ? room.bet.bySeat[seat] : null;
    else if (q && q.betted) snap.yourBet = q.bets[seat] != null ? q.bets[seat] : null;
    if (q) {
      snap.yourPick = q.picks[seat] != null ? q.picks[seat] : null;
      snap.yourNum = q.nums[seat] != null ? q.nums[seat] : null;
      snap.yourFake = q.kind === 'bluff' && q.fakes ? (q.fakes[seat] || null) : null;
    }
  }
  return snap;
}

/* THE BLUFF's dealing (research programme pass 2): the invent
 * window closes — by the last lie arriving, by the host's DEAL,
 * or by the clock — and the room builds the plaques itself: the
 * truth, one lie per player whose lie is usable (a lie that
 * repeats the truth or another lie is quietly dropped, exactly
 * as at the table), and authored decoys to fill the board to
 * three when the room's invention ran thin. Authorship is the
 * room's secret until the reveal; the texts alone are broadcast. */
function closeInvent(room) {
  const q = room.question;
  if (!q || room.phase !== 'invent' || q.kind !== 'bluff') return null;
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/^(the|a|an) /, '');
  const used = new Set([norm(q.bluffTruth)]);
  const opts = [{ t: q.bluffTruth, by: -1, truth: true }];
  for (const seat of joinedSeats(room)) {
    const fake = q.fakes ? q.fakes[seat] : null;
    if (typeof fake === 'string' && fake && !used.has(norm(fake))) {
      used.add(norm(fake));
      opts.push({ t: fake, by: seat, truth: false });
    }
  }
  for (const d of q.decoys || []) {
    if (opts.length >= 3) break;
    if (!used.has(norm(d))) { used.add(norm(d)); opts.push({ t: d, by: -1, truth: false }); }
  }
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t2 = opts[i]; opts[i] = opts[j]; opts[j] = t2;
  }
  q.options = opts;
  q.correctIdx = opts.findIndex((o) => o.truth);
  q.answersCount = opts.length;
  const t = nowMs();
  q.openedAt = t;
  q.windowMs = q.voteWindowMs;
  q.deadline = t + q.windowMs;
  room.phase = 'answer';
  return ok({ all: { t: 'bluff_options', qid: q.qid, options: opts.map((o) => o.t) }, state: true, changed: true });
}

/* Settle the open question at the current server time: compute the
 * as-stopped drained value, find the winners, bank, and produce the
 * reveal broadcast. Returns null when no question is open. */
function closeQuestion(room) {
  const q = room.question;
  if (!q || room.phase !== 'answer') return null;
  const isDecider = q.decider === true;
  const t = nowMs();
  q.closedAt = t;
  let value = null;
  if (q.kind === 'bluff') {
    /* THE BLUFF plays flat — no melt, ever: its value must not
     * drain while the room is admiring a lie */
    value = q.baseValue;
  } else if (!q.betted && !isDecider) {
    const elapsed = Math.min(Math.max(t - q.openedAt, 0), q.windowMs);
    value = Math.round(q.baseValue * q.multiplier * (1 - 0.5 * (elapsed / q.windowMs)));
  }
  q.stoppedValue = value;
  /* a decider's closeness is judged over the ELIGIBLE seats only —
   * the spectators' numbers (had any existed, which the answer
   * handler forbids) would not count toward the crown */
  const judgedSeats = isDecider ? (q.eligible || []) : joinedSeats(room);
  let winDiff = null;
  if (q.kind === 'num') {
    for (const seat of judgedSeats) {
      const n = q.nums[seat];
      if (n != null) {
        const d = Math.abs(n - q.trueNum);
        if (winDiff == null || d < winDiff) winDiff = d;
      }
    }
  }
  const results = [];
  for (const seat of joinedSeats(room)) {
    let entry;
    if (q.kind === 'num') {
      const num = q.nums[seat] != null ? q.nums[seat] : null;
      const correct = num != null && winDiff != null && judgedSeats.indexOf(seat) >= 0 && Math.abs(num - q.trueNum) === winDiff;
      entry = { seat, num, correct, banked: 0 };
    } else {
      const pick = q.picks[seat] != null ? q.picks[seat] : null;
      const correct = pick != null && pick === q.correctIdx;
      entry = { seat, pick, correct, banked: 0 };
    }
    /* The Photo-Finish (G5): milliseconds from the question's open
     * to the receipt of the pick this seat stands on — server-
     * received truth, never a client claim. Null where no pick was
     * ever received: silent seats, and number questions (their
     * answers are numbers, not picks). Display only: nothing in
     * the settlement below reads it. */
    entry.lockMs = (q.kind !== 'num' && q.pickTimes && q.pickTimes[seat] != null)
      ? Math.max(0, q.pickTimes[seat] - q.openedAt) : null;
    if (entry.correct && !isDecider) {
      entry.banked = q.betted
        ? (q.bets[seat] != null ? q.bets[seat] : 1) * BET_PAYOUT
        : value;
      /* THE DOUBLE: a riding token doubles the question's own
       * value for its seat — the bet never doubles (it was never
       * armable), and Quick Draw / streak bonuses land flat on
       * top below, exactly as they treat every other figure */
      if (!q.betted && q.dbl && q.dbl[seat]) { entry.banked = value * 2; entry.doubled = true; }
    }
    room.players[seat].score += entry.banked;
    results.push(entry);
  }
  /* THE DOUBLE settles with the question: every riding token is
   * spent here, win or lose — the declaration was the spend. */
  if (q.dbl) {
    for (const k of Object.keys(q.dbl)) {
      const sp = room.players[+k];
      if (sp) sp.dbl = false;
    }
  }
  /* AGAINST THE ROOM (designer pass 4): a declared seat that
   * banked ALONE takes the question's value a second time — the
   * adjustment lands here, before Quick Draw and the streaks add
   * their flat money, and before anything downstream reads
   * entry.banked (the pot feeds from value and correctness, never
   * from banked, so it is untouched). A shared bank lapses the
   * declaration quietly: nothing is owed and nothing is returned —
   * the round's use was spent in the throwing (vsRound). */
  if (!q.betted && !q.decider && q.vs) {
    const bankers = results.filter((r) => r.correct);
    if (bankers.length === 1 && q.vs[bankers[0].seat]) {
      const winEntry = bankers[0];
      winEntry.banked += value;
      winEntry.vs = true;
      room.players[winEntry.seat].score += value;
    }
  }
  /* The Quick-Draw (Design pass 3): 'normal' questions only. The
   * winner is the first seat in q.pickOrder — the receipt order of
   * the standing picks — whose answer is correct: a wrong first
   * locker simply passes the bonus down the order. Flat $50: added
   * after every multiplier and bet has already had its say. */
  let quickDrawSeat = null;
  if (q.kind === 'normal') {
    const correctSeats = {};
    for (const entry of results) if (entry.correct) correctSeats[entry.seat] = true;
    for (const seat of (q.pickOrder || [])) {
      if (correctSeats[seat]) { quickDrawSeat = seat; break; }
    }
    if (quickDrawSeat !== null) {
      const winEntry = results.find((e) => e.seat === quickDrawSeat);
      winEntry.banked += QUICK_DRAW_BONUS;
      winEntry.quickDraw = true;
      room.players[quickDrawSeat].score += QUICK_DRAW_BONUS;
    }
  }
  /* Hot Streaks (New programme pass 3): settled here, once, with
   * the rest of the money. 'normal' questions move the run — a bank
   * extends it and, from the bank that reaches STREAK_MIN onward,
   * adds the flat bonus to that result; a miss (wrong OR silent)
   * ends it. Guess kinds are neutral: the count is carried onto
   * their entries untouched so every reveal reports the true run.
   * The decider is a 'num' question, so it is neutral by kind
   * before it is anything else. At most one moment is named for
   * Sterling: reach5 > reach3 > a death of STREAK_DEATH_MIN or
   * more; inside a type the higher count wins, then the lower
   * seat. */
  let streakMoment = null;
  {
    const cands = [];
    for (const entry of results) {
      const p = room.players[entry.seat];
      const before = p.streak || 0;
      entry.streakBonus = 0;
      if (q.kind !== 'normal') { entry.streak = before; continue; }
      if (entry.correct) {
        const nowStreak = before + 1;
        p.streak = nowStreak;
        entry.streak = nowStreak;
        if (nowStreak >= STREAK_MIN) {
          entry.streakBonus = STREAK_BONUS;
          entry.banked += STREAK_BONUS;
          p.score += STREAK_BONUS;
        }
        if (before < 5 && nowStreak >= 5) cands.push({ type: 'reach5', seat: entry.seat, n: nowStreak });
        else if (before < STREAK_MIN && nowStreak >= STREAK_MIN) cands.push({ type: 'reach3', seat: entry.seat, n: nowStreak });
      } else {
        if (before >= STREAK_DEATH_MIN) cands.push({ type: 'death', seat: entry.seat, n: before });
        p.streak = 0;
        entry.streak = 0;
      }
    }
    const rank = { reach5: 0, reach3: 1, death: 2 };
    cands.sort((a, b) => (rank[a.type] - rank[b.type]) || (b.n - a.n) || (a.seat - b.seat));
    if (cands.length) streakMoment = cands[0];
  }
  /* The Table Pot (Dynamics pass D1): money nobody banked feeds
   * the pot the champion takes — computed here, once, from the
   * settled results, never from a client claim. Rounds 1-2 feed
   * only on a FULL miss (a partial bank feeds nothing), and the
   * figure is the question's as-stopped drained value — the
   * Headline/Golden doubling already lives in the record's
   * multiplier, so a doubled question feeds its doubled figure.
   * The Big Finish has no value to feed, so each seat that missed
   * feeds its own stake instead: its bet x $100 at the bet it
   * placed (a missing bet is the usual default 1). The Decider
   * banks $0 by design and feeds nothing. The pot is NOT a score:
   * it never touches room.players[].score and never changes who
   * wins — the host screen adds it to the champion's total at
   * the finale, and only there. */
  let potFed = 0;
  if (!isDecider) {
    if (q.betted) {
      for (const entry of results) {
        if (!entry.correct) potFed += (q.bets[entry.seat] != null ? q.bets[entry.seat] : 1) * BET_PAYOUT;
      }
    } else if (value != null && !results.some((e) => e.banked > 0)) {
      potFed = value;
    }
  }
  room.pot = (room.pot || 0) + potFed;
  /* THE BLUFF settles its second purse here — after the pot has
   * read the results (the table's order: the pot hears about
   * banks, never about fool money), before the Report Card reads
   * entry.banked (a lie's take IS a bank on the night). Every
   * player a lie fooled pays its author $25 from the house;
   * decoy lies are authorless and pay nobody; nobody is charged
   * for being fooled. */
  if (q.kind === 'bluff' && q.options) {
    const foolCount = {};
    for (const entry of results) {
      if (entry.pick == null || entry.correct) continue;
      const o = q.options[entry.pick];
      if (!o || o.truth || o.by == null || o.by < 0 || o.by === entry.seat) continue;
      foolCount[o.by] = (foolCount[o.by] || 0) + 1;
    }
    for (const k of Object.keys(foolCount)) {
      const amt = foolCount[k] * BLUFF_FOOL;
      const e2 = results.find((r) => r.seat === +k);
      if (e2) { e2.banked += amt; e2.fool = amt; }
      if (room.players[+k]) room.players[+k].score += amt;
    }
  }
  /* The Report Card (N1): the night's four facts, written in the
   * same commit as the money they describe — every figure below is
   * read off the settled results, never recomputed later. The
   * Decider is skipped whole: it banks $0 by design and its
   * verdict touches none of the four. entry.banked is final here
   * (value or bet, quick-draw and streak bonuses folded in), and
   * entry.streak is the run the settlement left standing, so the
   * peak is the settlement's own memory of the run. The fastest
   * hand reads the standing pick's receipt stamp — number answers
   * stamp one too, so a closest call counts by its true moment;
   * a seat whose correct answer was never stamped simply has no
   * time to beat, and the fact stays unrecorded for them. */
  if (!isDecider) {
    room.statsSeq = (room.statsSeq || 0) + 1;
    if (!Array.isArray(room.stats)) room.stats = [null, null, null, null];
    for (const entry of results) {
      let st = room.stats[entry.seat];
      if (!st || typeof st !== 'object') {
        st = room.stats[entry.seat] = { cats: {}, fastestMs: null, biggest: 0, peak: 0 };
      }
      if (typeof entry.streak === 'number' && entry.streak > st.peak) st.peak = entry.streak;
      if (entry.banked > 0) {
        if (entry.banked > st.biggest) st.biggest = entry.banked;
        if (q.category) {
          if (!st.cats || typeof st.cats !== 'object') st.cats = {};
          const c = st.cats[q.category] || (st.cats[q.category] = { amt: 0, n: 0, first: 0 });
          if (!c.n) c.first = room.statsSeq;
          c.amt += entry.banked;
          c.n++;
        }
      }
      if (entry.correct && q.pickTimes && q.pickTimes[entry.seat] != null) {
        const lt = Math.max(0, q.pickTimes[entry.seat] - q.openedAt);
        if (st.fastestMs == null || lt < st.fastestMs) st.fastestMs = lt;
      }
    }
  }
  /* The Decider's verdict: exactly one eligible seat holding the
   * closest call takes the crown; an identical closest distance
   * (or a question nobody eligible answered) leaves the show dead
   * level and the host deals another. Scores were never touched
   * above — every decider result banked $0 by construction. */
  let deciderWinner = null;
  if (isDecider) {
    const closest = results.filter((e) => e.correct).map((e) => e.seat);
    if (closest.length === 1) {
      deciderWinner = closest[0];
      room.deciderWinner = deciderWinner;
    }
  }
  const scores = scoresArray(room);
  room.phase = 'reveal';
  room.lastReveal = {
    qid: q.qid,
    kind: q.kind,
    headline: q.headline === true,
    /* the Golden Question's flag leaves the room only now, in
     * the reveal and the record snapshots resync from — the
     * money has already moved (The Ten, pass 4) */
    golden: q.golden === true,
    correctIdx: q.kind === 'num' ? null : q.correctIdx,
    trueNum: q.kind === 'num' ? q.trueNum : null,
    value,
    results,
    scores,
    quickDrawSeat,
    streakMoment,
    decider: isDecider,
    eligible: isDecider ? (q.eligible || []).slice() : null,
    deciderWinner,
    /* The Table Pot (D1): the total after this question, and what
     * this question fed — a resync repaints from these two and
     * never re-feeds */
    pot: room.pot,
    potFed,
    /* THE BLUFF: the settled authorship rides the record, so a
     * resync repaints the same accounting of lies */
    bluff: q.kind === 'bluff' ? { options: q.options } : null,
  };
  const reveal = { t: 'reveal', qid: q.qid, kind: q.kind, headline: q.headline === true, golden: q.golden === true, value, results, scores, quickDrawSeat, streakMoment, decider: isDecider, eligible: isDecider ? (q.eligible || []).slice() : null, deciderWinner, pot: room.pot, potFed };
  if (q.kind === 'num') reveal.trueNum = q.trueNum;
  else reveal.correctIdx = q.correctIdx;
  if (q.kind === 'bluff') reveal.bluff = { options: q.options };
  return ok({ all: reveal, state: true, changed: true });
}

/* Lazy auto-close: if the window has run out, settle before anything
 * else happens. The wrapper also calls this from its alarm. */
function expireIfNeeded(room) {
  if (room.phase === 'invent' && room.question && nowMs() >= room.question.inventDeadline) {
    return closeInvent(room);
  }
  if (room.phase === 'answer' && room.question && nowMs() >= room.question.deadline) {
    return closeQuestion(room);
  }
  return null;
}

/* First message on every socket. Returns {identity, res} — identity is
 * {role:'host'} or {role:'player', seat}, or null when rejected. */
function handleHello(room, msg) {
  if (!msg || typeof msg !== 'object') return { identity: null, res: fail('Bad hello.') };
  if (msg.role === 'host') {
    if (!msg.hostToken || msg.hostToken !== room.hostToken) {
      return { identity: null, res: fail('Bad host token.') };
    }
    return {
      identity: { role: 'host' },
      res: ok({
        to: [{ dest: 'host', msg: { t: 'welcome', role: 'host', code: room.code } }],
        state: true,
      }),
    };
  }
  if (msg.role === 'player') {
    if (msg.reclaimToken) {
      const seat = room.players.findIndex((p) => p && p.token === msg.reclaimToken);
      if (seat === -1) return { identity: null, res: fail('Seat not found for that token.') };
      if (msg.name) room.players[seat].name = cleanName(msg.name, seat);
      /* a reclaim hello WITHOUT an avatar field keeps the stored
       * avatar; WITH one (even an invalid one, which clamps to the
       * seat default) it updates — same rule as the name above */
      if (msg.avatar !== undefined) room.players[seat].avatar = cleanAvatar(msg.avatar, seat);
      else if (room.players[seat].avatar === undefined) room.players[seat].avatar = cleanAvatar(undefined, seat);
      /* a room persisted before Hot Streaks existed has no streak
       * on its records; the run simply starts from zero */
      if (room.players[seat].streak === undefined) room.players[seat].streak = 0;
      return {
        identity: { role: 'player', seat },
        res: ok({
          to: [{ dest: seat, msg: { t: 'welcome', role: 'player', code: room.code, seat, reclaimToken: room.players[seat].token } }],
          state: true,
          changed: true,
        }),
      };
    }
    const seat = room.players.findIndex((p) => p == null);
    if (seat === -1) return { identity: null, res: fail('Room is full.') };
    const p = {
      name: cleanName(msg.name, seat),
      token: makeToken(),
      score: 0,
      cutTwo: cutStartFor(room), // House Rules (N2): the starting COUNT — two under Second Cut, else one
      dbl: true, // THE DOUBLE (designer pass 3): one token per player per show, in hand from the start, spendable from Round 2
      vsRound: 0, // AGAINST THE ROOM (designer pass 4): the round the gauntlet was last thrown in (0 = never)
      connected: true,
      avatar: cleanAvatar(msg.avatar, seat),
      streak: 0,
    };
    room.players[seat] = p;
    return {
      identity: { role: 'player', seat },
      res: ok({
        to: [{ dest: seat, msg: { t: 'welcome', role: 'player', code: room.code, seat, reclaimToken: p.token } }],
        state: true,
        changed: true,
      }),
    };
  }
  return { identity: null, res: fail('Unknown role.') };
}

function handleHostMessage(room, msg) {
  if (!msg || typeof msg.t !== 'string') return fail('Bad message.');
  switch (msg.t) {
    case 'ping':
      return ok({ to: [{ dest: 'host', msg: { t: 'pong' } }] });
    case 'bet_phase': {
      if (room.phase === 'ended') return fail('Show has ended.');
      if (room.phase !== 'lobby' && room.phase !== 'reveal' && room.phase !== 'intermission') {
        return fail('Finish the current step first.');
      }
      if (msg.qid == null) return fail('Missing qid.');
      room.bet = { qid: msg.qid, bySeat: {} };
      room.interm = null; // advancing out of the break ends it
      room.phase = 'bet';
      return ok({ state: true, changed: true });
    }
    case 'publish_question': {
      if (room.phase === 'ended') return fail('Show has ended.');
      if (room.phase === 'answer') return fail('A question is already open.');
      if (msg.qid == null) return fail('Missing qid.');
      if (room.phase === 'bet' && (!room.bet || room.bet.qid !== msg.qid)) {
        return fail('A bet phase is open for a different question.');
      }
      if (room.phase !== 'lobby' && room.phase !== 'reveal' && room.phase !== 'bet' && room.phase !== 'intermission') {
        return fail('Cannot publish now.');
      }
      const kind = msg.kind;
      if (kind !== 'normal' && kind !== 'survey' && kind !== 'num' && kind !== 'bluff') return fail('Unknown question kind.');
      /* The Decider rides this same publish path — no parallel
       * channel — but its two extra fields are validated as hard
       * as any secret: the kind must be 'num' (closest number is
       * the only decider there is) and the eligible list must name
       * at least two distinct seats that are actually seated. A
       * publish that claims neither field is an ordinary question,
       * exactly as before. */
      let decider = false;
      let eligible = null;
      if (msg.decider === true) {
        if (kind !== 'num') return fail('A decider is a closest-number question.');
        const el = msg.eligible;
        const valid = Array.isArray(el) && el.length >= 2
          && el.every((s) => Number.isInteger(s) && s >= 0 && s < MAX_PLAYERS && room.players[s])
          && new Set(el).size === el.length;
        if (!valid) return fail('A decider needs at least two eligible seated players.');
        decider = true;
        eligible = el.slice();
      }
      let windowMs = Number(msg.deadlineMs);
      if (!Number.isFinite(windowMs) || windowMs < 1000 || windowMs > 180000) {
        return fail('Bad deadlineMs (window length, 1000..180000).');
      }
      /* House Rules (N2) — Longer Clock: the stretch is applied
       * HERE, where the room's windows are born, to the host's
       * dealt figure — so the deadline, the drain and every
       * snapshot downstream run on the longer window, and the
       * Headline/Golden halving below halves the longer figure,
       * exactly as it halves any dealt one. The host deals the
       * ordinary windows and never stretches its own copy. */
      if (room.rules && room.rules.longerClock === true) windowMs = Math.round(windowMs * CLOCK_STRETCH);
      const baseValue = msg.baseValue == null ? 100 : Number(msg.baseValue);
      if (!Number.isFinite(baseValue) || baseValue <= 0) return fail('Bad baseValue.');
      const multiplier = msg.multiplier == null ? 1 : Number(msg.multiplier);
      if (!Number.isFinite(multiplier) || multiplier <= 0) return fail('Bad multiplier.');
      let correctIdx = null;
      let trueNum = null;
      let answersCount = 4;
      let cutIndices = null;
      /* THE BLUFF (research programme pass 2): the host publishes
       * the prompt's truth and its authored decoys — never a
       * correctIdx, because the answers do not exist yet: the
       * players invent them, and the room deals them itself
       * (closeInvent). The truth and decoys are server-secret
       * until the reveal, like every other secret the room keeps. */
      let bluffTruth = null;
      let bluffDecoys = null;
      if (kind === 'bluff') {
        bluffTruth = typeof msg.bluffTruth === 'string' ? msg.bluffTruth.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
        const dc = Array.isArray(msg.decoys)
          ? msg.decoys.filter((d) => typeof d === 'string' && d.replace(/\s+/g, ' ').trim()).map((d) => d.replace(/\s+/g, ' ').trim().slice(0, 60))
          : [];
        if (!bluffTruth || dc.length < 3) return fail('A bluff needs its truth and three decoys.');
        bluffDecoys = dc.slice(0, 3);
        answersCount = 0;
      } else if (kind === 'num') {
        trueNum = Number(msg.trueNum);
        if (!Number.isFinite(trueNum)) return fail('A num question needs a trueNum.');
      } else {
        if (msg.answersCount != null) {
          answersCount = Number(msg.answersCount);
          if (!Number.isInteger(answersCount) || answersCount < 2 || answersCount > 6) {
            return fail('answersCount must be 2..6.');
          }
        }
        correctIdx = msg.correctIdx;
        if (!Number.isInteger(correctIdx) || correctIdx < 0 || correctIdx >= answersCount) {
          return fail('correctIdx out of range.');
        }
        if (msg.cutIndices != null) {
          const ci = msg.cutIndices;
          const valid = Array.isArray(ci) && ci.length === 2
            && ci.every((i) => Number.isInteger(i) && i >= 0 && i < answersCount && i !== correctIdx)
            && ci[0] !== ci[1];
          if (!valid) return fail('cutIndices must be two distinct wrong answers.');
          cutIndices = ci.slice();
        }
      }
      /* Show the Band (pass 3): the host names the dealt entry's
       * difficulty band. Validated to a bare 1|2|3 — anything else
       * is stored as null (an unbanded question), never an error:
       * the band is public presentation, not a claim the room
       * referees. */
      const band = Number.isInteger(msg.band) && msg.band >= 1 && msg.band <= 3 ? msg.band : null;
      const betted = room.phase === 'bet';
      const bets = betted ? Object.assign({}, room.bet.bySeat) : {};
      room.bet = null;
      const round = Number.isInteger(msg.round) ? msg.round : 1;
      /* Headline derivation (Design pass 2): count this publish
       * toward its round — a re-publish of the very same qid (a host
       * resync) is the same question and does not advance the count.
       * The sixth Round 2 publish is the Headline: its record carries
       * the doubled multiplier and the halved window, so the drain,
       * the deadline and the payouts are the ordinary code running
       * on the effective figures. Any headline claim in the message
       * is ignored — it is never read. */
      if (!room.published || typeof room.published !== 'object') room.published = {};
      if (msg.qid !== room.lastPubQid) {
        room.published[String(round)] = (room.published[String(round)] || 0) + 1;
        room.lastPubQid = msg.qid;
      }
      const headline = kind === 'bluff' ? false : headlinePublish(room, round);
      /* The Golden Question (The Ten, pass 4): the host's secret
       * pick, refereed inside its honest envelope (see the header
       * note). A re-publish of the very question that already
       * carries the gold keeps it — the resync republishes the
       * same record, it does not spend a second double. Rooms
       * persisted before the field existed read goldenUsed as
       * undefined, which is falsy: unspent, exactly right. */
      const reGold = !!(room.question && room.question.qid === msg.qid && room.question.golden === true);
      const golden = kind !== 'bluff' && msg.golden === true && !decider && !headline
        && (round === 1 || round === 2) && (!room.goldenUsed || reGold);
      if (golden) room.goldenUsed = true;
      const effWindowMs = (headline || golden) ? Math.round(windowMs / 2) : Math.round(windowMs);
      const t = nowMs();
      room.question = {
        qid: msg.qid,
        round,
        kind,
        category: String(msg.category || '').slice(0, 32),
        answersCount,
        baseValue,
        multiplier: (headline || golden) ? multiplier * 2 : multiplier,
        headline,
        band,
        golden,
        correctIdx,
        trueNum,
        cutIndices,
        windowMs: effWindowMs,
        openedAt: t,
        deadline: t + effWindowMs,
        betted,
        bets,
        decider,
        eligible,
        picks: {},
        pickOrder: [],
        pickTimes: {},
        nums: {},
        dbl: {},
        vs: {}, // AGAINST THE ROOM (designer pass 4): declared seats on this question
        cutBy: null,
        closedAt: null,
        stoppedValue: null,
      };
      if (kind === 'bluff') {
        /* the bluff opens in its collecting life: the published
         * window becomes the VOTE window, held until the dealing,
         * and the deadline the room minds first is the invent one */
        room.question.bluffTruth = bluffTruth;
        room.question.decoys = bluffDecoys;
        room.question.fakes = {};
        room.question.options = null;
        room.question.voteWindowMs = room.question.windowMs;
        room.question.inventDeadline = t + BLUFF_INVENT_MS;
        room.question.deadline = room.question.inventDeadline;
      }
      room.interm = null; // advancing out of the break ends it
      room.phase = kind === 'bluff' ? 'invent' : 'answer';
      return ok({ state: true, changed: true });
    }
    case 'bluff_deal': {
      /* THE BLUFF: the host deals the answers early — the table's
       * DEAL button, refereed. The room builds the plaques from
       * whatever lies it holds (closeInvent). */
      if (room.phase !== 'invent' || !room.question) return fail('No bluff is collecting lies.');
      if (msg.qid != null && msg.qid !== room.question.qid) return fail('Wrong question.');
      const res = closeInvent(room);
      return res || fail('No bluff is collecting lies.');
    }
    case 'reveal': {
      if (room.phase === 'reveal' && room.lastReveal && msg.qid != null && room.lastReveal.qid === msg.qid) {
        return ok({}); // idempotent: the auto-close already revealed this one
      }
      if (room.phase !== 'answer' || !room.question) return fail('Nothing to reveal.');
      if (msg.qid != null && msg.qid !== room.question.qid) return fail('Wrong question.');
      const res = closeQuestion(room);
      return res || fail('Nothing to reveal.');
    }
    case 'intermission': {
      /* The Intermission (New programme pass 2): the host rests the
       * room after a round's last reveal. Accepted only FROM the
       * reveal phase and only naming the round that follows the
       * break (2 or 3 — there is no break before Round 1 and none
       * after Round 3, whose ground belongs to the finale and the
       * Decider). The room records the phase, the next round, and
       * (Dynamics pass D2) the Second Wind grant the break itself
       * makes; the break ends when the host advances (publish
       * and bet_phase clear it, above) or ends the show (below). */
      if (room.phase !== 'reveal') return fail('The break comes after a reveal.');
      const nr = Number(msg.nextRound);
      if (nr !== 2 && nr !== 3) return fail('The break names the round that follows: 2 or 3.');
      /* Second Wind (Dynamics pass D2): the grant fires HERE, the
       * moment the break begins — every seat tied for last with a
       * spent Cut Two gets it back, written into the player
       * records before the phase turns, so the snapshot that
       * announces the break already carries the restored tokens.
       * It cannot fire twice for one break: this case is
       * reachable only from the reveal phase, and a replayed
       * message meets the refusal above. A trailer already
       * holding their full count is owed nothing — the grant
       * tops up toward the starting count and never past it
       * (one token under the plain rule; see the N2 note). */
      const wind = [];
      const seated = room.players.filter(Boolean);
      if (seated.length) {
        const minScore = Math.min.apply(null, seated.map((p) => p.score));
        /* House Rules (N2): the grant is one token toward the
         * seat's STARTING count — a tied-last seat below it gains
         * one back, a seat already holding its full count (one
         * under the old rule, two under Second Cut) is owed
         * nothing, and nobody is ever topped past where they
         * started */
        const startCount = cutStartFor(room);
        room.players.forEach((p, i) => {
          if (p && p.score === minScore && cutCountOf(p) < startCount) { p.cutTwo = cutCountOf(p) + 1; wind.push(i); }
        });
      }
      room.interm = { nextRound: nr, wind };
      room.phase = 'intermission';
      return ok({ state: true, changed: true });
    }
    case 'new_show': {
      /* Rematch Night (New programme pass 4): a fresh show in the
       * same room. Only an ended show can be succeeded — anything
       * earlier and the night is still in progress. The reset list
       * is the referee's whole per-show memory; the seats and
       * their identity (name, avatar, token, connection) are NOT
       * on it. The wrapper's snapshot push that follows is how
       * every screen learns the room is resting at a new lobby
       * with clean scores and a show counter one higher. */
      if (room.phase !== 'ended') return fail('The show has not ended yet.');
      for (const p of room.players) {
        if (!p) continue;
        p.score = 0;
        p.cutTwo = cutStartFor(room); // House Rules (N2): a fresh show restocks to the room's starting count — the rules themselves are the room's and stay
        p.dbl = true; // THE DOUBLE restocks with the show, like every other token
        p.vsRound = 0; // AGAINST THE ROOM: the new show's gauntlet is unthrown
        p.streak = 0;
      }
      room.bet = null;
      room.published = {};
      room.lastPubQid = null;
      room.question = null;
      room.lastReveal = null;
      room.interm = null;
      room.deciderWinner = null;
      /* a rematch deals a FRESH golden pick (Rematch Night's
       * reset list is the referee's whole per-show memory) */
      room.goldenUsed = false;
      /* The Table Pot (D1): a fresh show starts with an empty pot, always */
      room.pot = 0;
      /* The Report Card (N1): the tallies are per-show memory like
       * everything on this list — a rematch starts a blank card */
      room.stats = [null, null, null, null];
      room.statsSeq = 0;
      room.showSeq = (room.showSeq || 1) + 1;
      room.phase = 'lobby';
      return ok({ state: true, changed: true });
    }
    case 'end_show': {
      if (room.phase === 'ended') return fail('Show has already ended.');
      room.interm = null;
      room.phase = 'ended';
      const scores = scoresArray(room);
      /* winnerSeat names the champion when a decider chose one —
       * the scores alone still read as a tie, by design. The Report
       * Card (N1) rides the same broadcast: the night's four facts
       * per seat, derived from the referee's own tallies — the one
       * moment the card is dealt to every screen at once. */
      return ok({ all: { t: 'ended', scores, winnerSeat: room.deciderWinner != null ? room.deciderWinner : null, report: reportFor(room) }, state: true, changed: true });
    }
    default:
      return fail('Unknown message.');
  }
}

function handlePlayerMessage(room, seat, msg) {
  if (!msg || typeof msg.t !== 'string') return fail('Bad message.');
  const p = room.players[seat];
  if (!p) return fail('Join first.');
  switch (msg.t) {
    case 'ping':
      return ok({ to: [{ dest: seat, msg: { t: 'pong' } }] });
    case 'bluff': {
      /* THE BLUFF: a pad submits its seat's lie during the
       * collecting window. One lie per seat, replaceable until
       * the dealing; when the last joined seat's lie lands, the
       * room deals at once — nobody waits on a clock for a full
       * table. The lie is the room's secret until the reveal:
       * snapshots carry only that it exists (yourFake, to its
       * own author alone). */
      if (room.phase !== 'invent' || !room.question) return fail('No bluff is collecting lies.');
      const q = room.question;
      if (msg.qid !== q.qid) return fail('Wrong question.');
      const text = typeof msg.text === 'string' ? msg.text.replace(/\s+/g, ' ').trim().slice(0, 42) : '';
      if (!text) return fail('An empty lie fools nobody.');
      if (!q.fakes || typeof q.fakes !== 'object') q.fakes = {};
      q.fakes[seat] = text;
      const joined = joinedSeats(room);
      if (joined.length && joined.every((s) => q.fakes[s])) {
        const dealt = closeInvent(room);
        if (dealt) return dealt;
      }
      return ok({
        to: [{ dest: seat, msg: { t: 'accepted', qid: q.qid } }],
        all: { t: 'counts', qid: q.qid, answersIn: Object.keys(q.fakes).length, players: joined.length },
        state: true,
        changed: true,
      });
    }
    case 'answer': {
      if (room.phase !== 'answer' || !room.question) return fail('No open question.');
      const q = room.question;
      if (msg.qid !== q.qid) return fail('Wrong question.');
      if (q.decider && (q.eligible || []).indexOf(seat) < 0) {
        return fail('Only the tied leaders play the decider.');
      }
      if (nowMs() > q.deadline) return fail('Window closed.');
      if (q.kind === 'num') {
        const n = Number(msg.num);
        if (!Number.isFinite(n)) return fail('Give a number.');
        q.nums[seat] = n;
      } else {
        const pick = msg.pick;
        if (!Number.isInteger(pick) || pick < 0 || pick >= q.answersCount) {
          return fail('Pick out of range.');
        }
        q.picks[seat] = pick;
        /* Quick-Draw receipt (Design pass 3): every accepted pick
         * moves its seat to the back of the receipt order, so the
         * order at close is the order of the answers the players
         * stand on. Internal only: snapshots never carry pickOrder. */
        if (!Array.isArray(q.pickOrder)) q.pickOrder = [];
        q.pickOrder = q.pickOrder.filter((s) => s !== seat);
        q.pickOrder.push(seat);
        /* Photo-Finish receipt (G5): the standing pick's arrival
         * time, on the same re-queue rule as the order above — a
         * changed pick is stamped at its change. Rooms persisted
         * before the field existed grow it here. */
        if (!q.pickTimes || typeof q.pickTimes !== 'object') q.pickTimes = {};
        q.pickTimes[seat] = nowMs();
      }
      const answersIn = Object.keys(q.kind === 'num' ? q.nums : q.picks).length;
      return ok({
        to: [{ dest: seat, msg: { t: 'accepted', qid: q.qid } }],
        all: { t: 'counts', qid: q.qid, answersIn, players: joinedSeats(room).length },
        changed: true,
      });
    }
    case 'bet': {
      if (room.phase !== 'bet' || !room.bet) return fail('No bet phase is open.');
      if (msg.qid !== room.bet.qid) return fail('Wrong question.');
      const chips = msg.chips;
      const cap = betCapFor(room, seat);
      if (!Number.isInteger(chips) || chips < 1 || chips > cap) {
        return fail(cap === BASE_BET_CAP ? 'Bet 1, 2 or 3 chips.' : 'Bet 1 to ' + cap + ' chips — your Long Shot cap.');
      }
      room.bet.bySeat[seat] = chips;
      return ok({
        to: [{ dest: seat, msg: { t: 'accepted', qid: room.bet.qid } }],
        all: { t: 'counts', qid: room.bet.qid, betsIn: Object.keys(room.bet.bySeat).length, players: joinedSeats(room).length },
        changed: true,
      });
    }
    case 'double': {
      /* THE DOUBLE (designer pass 3): a pad declares its seat's
       * token on the open question. The referee's rules are the
       * table's: from Round 2, never on a bet question (it carries
       * its own stake), never on the Decider, only while the
       * window is open, only a token still in hand, only once. */
      if (room.phase !== 'answer' || !room.question) return fail('No open question.');
      const q = room.question;
      if (msg.qid !== q.qid) return fail('Wrong question.');
      if (q.decider) return fail('The Decider carries no Double.');
      if (q.kind === 'bluff') return fail('The Bluff is its own stake — no Double rides it.');
      if (q.betted) return fail('A bet question carries its own stake.');
      if (!(q.round >= 2)) return fail('The Double arrives with Double Money.');
      if (nowMs() > q.deadline) return fail('Window closed.');
      if (p.dbl === false) return fail('Your Double is spent.');
      if (!q.dbl || typeof q.dbl !== 'object') q.dbl = {};
      if (q.dbl[seat]) return fail('Your Double is already riding.');
      if (q.vs && q.vs[seat]) return fail('Your gauntlet is down on this one — one stake per question.');
      q.dbl[seat] = true;
      return ok({
        to: [{ dest: seat, msg: { t: 'accepted', qid: q.qid } }],
        state: true,
        changed: true,
      });
    }
    case 'vs': {
      /* AGAINST THE ROOM (designer pass 4): a pad declares its
       * seat's gauntlet on the open question. The referee's rules
       * are the table's: the seat sits last (a tie for last is
       * last; an all-level table has no gauntlet), the declaration
       * is unused this round, never on a bet question or the
       * Decider, never alongside the seat's own Double, only
       * while the window is open. A thrown gauntlet stays thrown:
       * there is no undeclare message. */
      if (room.phase !== 'answer' || !room.question) return fail('No open question.');
      const q = room.question;
      if (msg.qid !== q.qid) return fail('Wrong question.');
      if (q.decider) return fail('The Decider carries no gauntlet.');
      if (q.kind === 'bluff') return fail('The Bluff is its own stake — no gauntlet rides it.');
      if (q.betted) return fail('A bet question carries its own stake.');
      if (nowMs() > q.deadline) return fail('Window closed.');
      if ((p.vsRound || 0) === q.round) return fail('Your gauntlet is thrown for this round.');
      if (q.dbl && q.dbl[seat]) return fail('Your Double is riding on this one — one stake per question.');
      const joinedScores = [];
      for (let i = 0; i < room.players.length; i++) {
        const rp = room.players[i];
        if (rp) joinedScores.push(rp.score);
      }
      const mn = Math.min(...joinedScores), mx = Math.max(...joinedScores);
      if (!(mn < mx && p.score === mn)) return fail('The gauntlet belongs to last place.');
      if (!q.vs || typeof q.vs !== 'object') q.vs = {};
      if (q.vs[seat]) return fail('Your gauntlet is already down.');
      q.vs[seat] = true;
      p.vsRound = q.round; /* spent in the throwing, win, lose or lapse */
      return ok({
        to: [{ dest: seat, msg: { t: 'accepted', qid: q.qid } }],
        state: true,
        changed: true,
      });
    }
    case 'cuttwo': {
      if (room.phase !== 'answer' || !room.question) return fail('No open question.');
      const q = room.question;
      if (msg.qid !== q.qid) return fail('Wrong question.');
      if (q.kind === 'num') return fail('Nothing to cut on a number question.');
      if (q.kind === 'bluff') return fail('Nothing to cut on a bluff — the answers are the players’ own.');
      if (!q.cutIndices) return fail('No cut available on this question.');
      if (q.cutBy != null) return fail('Already cut on this question.');
      if (cutCountOf(p) <= 0) return fail('Your Cut Two is spent.');
      p.cutTwo = cutCountOf(p) - 1; // House Rules (N2): a spend decrements the count — under Second Cut one blade remains
      q.cutBy = seat;
      return ok({
        all: { t: 'cut', qid: q.qid, bySeat: seat, indices: q.cutIndices.slice() },
        state: true,
        changed: true,
      });
    }
    case 'cut_preview': {
      /* G6: the pair was committed at publish (see the header note);
       * a preview only READS it back to the one seat asking. No
       * field of the room changes, nothing is broadcast, and the
       * answer rides no snapshot — it exists only on this wire, to
       * this seat, for this question. */
      if (room.phase !== 'answer' || !room.question) return fail('No open question.');
      const q = room.question;
      if (msg.qid !== q.qid) return fail('Wrong question.');
      if (q.kind === 'num') return fail('Nothing to cut on a number question.');
      if (q.kind === 'bluff') return fail('Nothing to cut on a bluff — the answers are the players’ own.');
      if (!q.cutIndices) return fail('No cut available on this question.');
      if (q.cutBy != null) return fail('Already cut on this question.');
      if (cutCountOf(p) <= 0) return fail('Your Cut Two is spent.');
      return ok({
        to: [{ dest: seat, msg: { t: 'cut_preview', qid: q.qid, indices: q.cutIndices.slice() } }],
      });
    }
    default:
      return fail('Unknown message.');
  }
}

/* The Gilded Hour online rooms — Cloudflare Worker + Durable Object.
 * One GildedRoom DO instance per 4-letter room code. Each room holds one
 * HOST connection (the show screen) and up to 4 player connections.
 * The room logic (room.js) is shared verbatim with the tests.
 * Deploy: `dist/worker.js` is the single-file build (dashboard paste),
 * or point wrangler at this file for Workers Builds.
 */

const ROOM_TTL_MS = 2 * 3600 * 1000;
const MAX_MSG_CHARS = 4096;
const RATE_MAX = 40;            // messages per socket per window
const RATE_WINDOW_MS = 10000;

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export class GildedRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.host = null;                    // host socket slot
    this.players = [null, null, null, null]; // player socket slots by seat
    this.pending = [];
    this.dead = new Set();               // closed sockets: never resurrect one from its attachment
    this.rate = new Map();               // ws -> {n, start, warned}
    this.room = null;
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get('room');
      if (saved) this.room = saved;
    });
  }

  async save() {
    if (!this.room) return;
    await this.ctx.storage.put('room', this.room);
  }

  // A Durable Object can be evicted and rebuilt while its WebSockets stay
  // connected (hibernation). In-memory socket slots are lost in a rebuild,
  // so each socket also carries its identity as an attachment, and the
  // live socket for an identity is looked up from the runtime when the
  // slot is empty (the Dominoes pattern, widened to host + 4 seats).
  attachmentOf(ws) {
    try {
      const a = ws.deserializeAttachment ? ws.deserializeAttachment() : null;
      if (a && a.role === 'host') return { role: 'host' };
      if (a && a.role === 'player' && Number.isInteger(a.seat) && a.seat >= 0 && a.seat < 4) {
        return { role: 'player', seat: a.seat };
      }
    } catch (e) { /* no attachment */ }
    return null;
  }

  destOf(ws) {
    if (this.dead.has(ws)) return null;
    if (this.host === ws) return 'host';
    for (let s = 0; s < 4; s++) if (this.players[s] === ws) return s;
    const a = this.attachmentOf(ws);
    if (!a) return null;
    if (a.role === 'host') { this.host = ws; return 'host'; }
    this.players[a.seat] = ws; // rehydrate the slot after a rebuild
    return a.seat;
  }

  liveSocket(dest) {
    const slot = dest === 'host' ? this.host : this.players[dest];
    if (slot && !this.dead.has(slot)) return slot;
    if (slot) { // the slot held a socket that has since closed
      if (dest === 'host') this.host = null;
      else this.players[dest] = null;
    }
    if (this.ctx.getWebSockets) {
      for (const ws of this.ctx.getWebSockets()) {
        if (this.dead.has(ws)) continue;
        const a = this.attachmentOf(ws);
        if (!a) continue;
        if (dest === 'host' && a.role === 'host') { this.host = ws; return ws; }
        if (dest !== 'host' && a.role === 'player' && a.seat === dest) {
          this.players[dest] = ws;
          return ws;
        }
      }
    }
    return null;
  }

  liveConns() {
    const out = [];
    const h = this.liveSocket('host');
    if (h) out.push({ dest: 'host', ws: h });
    for (let s = 0; s < 4; s++) {
      const ws = this.liveSocket(s);
      if (ws) out.push({ dest: s, ws });
    }
    return out;
  }

  sendRaw(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch (e) { /* dead socket */ }
  }

  sendTo(dest, msg) {
    const ws = this.liveSocket(dest);
    if (ws) this.sendRaw(ws, msg);
  }

  sendSnapshots() {
    if (!this.room) return;
    for (const { dest, ws } of this.liveConns()) {
      const view = dest === 'host' ? { role: 'host' } : { role: 'player', seat: dest };
      this.sendRaw(ws, { t: 'state', state: snapshotFor(this.room, view) });
    }
  }

  deliver(res, senderDest) {
    if (!res) return;
    for (const d of res.to || []) this.sendTo(d.dest, d.msg);
    if (res.all) {
      for (const { ws } of this.liveConns()) this.sendRaw(ws, res.all);
    }
    if (res.state) this.sendSnapshots();
    if (res.error != null && senderDest != null) {
      this.sendTo(senderDest, { t: 'error', msg: res.error });
    }
  }

  touch() {
    if (this.room) this.room.lastActivity = nowMs();
  }

  scheduleAlarm() {
    if (!this.room) return;
    let next = this.room.lastActivity + ROOM_TTL_MS;
    if (this.room.phase === 'answer' && this.room.question) {
      next = Math.min(next, this.room.question.deadline);
    }
    const at = Math.max(next, nowMs() + 50);
    this.ctx.storage.setAlarm(at).catch(() => {});
  }

  async expireAndDeliver() {
    const res = expireIfNeeded(this.room);
    if (res) {
      this.deliver(res, null);
      await this.save();
    }
    return res;
  }

  rateOk(ws) {
    const t = Date.now();
    let b = this.rate.get(ws);
    if (!b || t - b.start >= RATE_WINDOW_MS) {
      b = { n: 0, start: t, warned: false };
      this.rate.set(ws, b);
    }
    b.n++;
    if (b.n > RATE_MAX) {
      if (!b.warned) {
        b.warned = true;
        this.sendRaw(ws, { t: 'error', msg: 'Slow down.' });
      }
      return false;
    }
    return true;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!this.room) {
        if (!body.code || !body.hostToken) {
          return Response.json({ ok: false, error: 'code and hostToken required' }, { status: 400 });
        }
        /* House Rules (N2): the host's toggles ride creation and
         * are the room's for its whole life; createRoom validates
         * them (anything not a literal true is off) */
        this.room = createRoom(body.code, body.hostToken, body.rules);
        await this.save();
        this.scheduleAlarm();
        return Response.json({ ok: true, created: true, code: this.room.code });
      }
      return Response.json({ ok: true, created: false, code: this.room.code });
    }
    if (url.pathname === '/join') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('WebSocket required', { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      this.pending.push(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('gilded-hour room', { status: 200 });
  }

  async webSocketMessage(ws, message) {
    if (typeof message === 'string' && message.length > MAX_MSG_CHARS) {
      this.sendRaw(ws, { t: 'error', msg: 'Message too large.' });
      return;
    }
    if (!this.rateOk(ws)) return;
    let msg;
    try { msg = JSON.parse(message); } catch (e) { return; } // malformed: ignore
    if (!this.room) {
      this.sendRaw(ws, { t: 'error', msg: 'Room expired.' });
      return;
    }
    // An expired window settles before anything else is processed, so a
    // late answer lands in the reveal phase and is refused there.
    await this.expireAndDeliver();

    const dest = this.destOf(ws);
    if (msg.t === 'hello') {
      if (dest != null) {
        this.sendRaw(ws, { t: 'error', msg: 'Already joined.' });
        return;
      }
      if (msg.role === 'host' && this.liveSocket('host') && this.liveSocket('host') !== ws) {
        this.sendRaw(ws, { t: 'error', msg: 'Host already connected.' });
        return;
      }
      if (msg.role === 'player' && msg.reclaimToken) {
        const seat = this.room.players.findIndex((p) => p && p.token === msg.reclaimToken);
        if (seat >= 0 && this.liveSocket(seat) && this.liveSocket(seat) !== ws) {
          this.sendRaw(ws, { t: 'error', msg: 'Seat is taken.' });
          return;
        }
      }
      const { identity, res } = handleHello(this.room, msg);
      if (!identity) {
        if (res.error) this.sendRaw(ws, { t: 'error', msg: res.error });
        return;
      }
      this.pending = this.pending.filter((s) => s !== ws);
      if (identity.role === 'host') {
        this.host = ws;
      } else {
        this.players[identity.seat] = ws;
        this.room.players[identity.seat].connected = true;
      }
      if (ws.serializeAttachment) {
        try { ws.serializeAttachment(identity); } catch (e) { /* non-fatal */ }
      }
      this.touch();
      this.deliver(res, identity.role === 'host' ? 'host' : identity.seat);
      await this.save();
      this.scheduleAlarm();
      return;
    }
    if (dest == null) {
      this.sendRaw(ws, { t: 'error', msg: 'Say hello first.' });
      return;
    }
    const res = dest === 'host'
      ? handleHostMessage(this.room, msg)
      : handlePlayerMessage(this.room, dest, msg);
    this.touch();
    this.deliver(res, dest);
    if (res.changed) await this.save();
    this.scheduleAlarm();
  }

  async webSocketClose(ws) {
    const dest = this.destOf(ws); // identify BEFORE marking the socket dead
    this.pending = this.pending.filter((s) => s !== ws);
    this.rate.delete(ws);
    if (this.host === ws) this.host = null;
    for (let s = 0; s < 4; s++) if (this.players[s] === ws) this.players[s] = null;
    this.dead.add(ws);
    // The seat itself stays reserved (name, score, reclaim token); only
    // the live flag drops, and the room sees the disconnect.
    if (this.room && dest != null && dest !== 'host' && this.room.players[dest]) {
      this.room.players[dest].connected = false;
      this.sendSnapshots();
      await this.save();
    }
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  async alarm() {
    if (!this.room) return;
    await this.expireAndDeliver();
    const anyLive = this.liveConns().length > 0;
    if (!anyLive && nowMs() - this.room.lastActivity >= ROOM_TTL_MS) {
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }
    this.scheduleAlarm();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response('gilded-hour-rooms ok', { status: 200 });
    }
    if (url.pathname === '/room') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: cors() });
      }
      if (request.method !== 'POST') {
        return new Response('POST to create a room', { status: 405, headers: cors() });
      }
      // Create a room; retry on the (rare) code collision with a live room.
      // House Rules (N2): the host's toggles may ride the create
      // body as {rules:{...}} — forwarded untouched to the room's
      // creation, where room.js validates them. No body (an older
      // host) creates a plain room, exactly as before.
      const createBody = await request.json().catch(() => ({}));
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = makeCode();
        const hostToken = makeToken();
        const id = env.ROOMS.idFromName(code);
        const stub = env.ROOMS.get(id);
        const r = await stub.fetch(new Request('https://room/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, hostToken, rules: createBody && createBody.rules }),
        }));
        const j = await r.json().catch(() => ({}));
        if (j.created) {
          return Response.json({ code, hostToken }, { headers: cors() });
        }
      }
      return Response.json({ error: 'Could not create a room.' }, { status: 503, headers: cors() });
    }
    const m = url.pathname.match(/^\/room\/([A-Z0-9]{4})$/i);
    if (m) {
      const id = env.ROOMS.idFromName(m[1].toUpperCase());
      const stub = env.ROOMS.get(id);
      return stub.fetch(new Request('https://room/join', request));
    }
    return new Response('not found', { status: 404 });
  },
};
