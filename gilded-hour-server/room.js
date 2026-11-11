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
 * Secrecy: correctIdx / trueNum / picks / bets are stored in the room
 * but NEVER leave it before reveal — broadcasts during a window carry
 * counts only (answersIn, betsIn). Per-viewer snapshots include only
 * the viewer's own pick/num/bet (plus, for the host alone, the secrets
 * it authored, so a reconnected host can resync).
 *
 * Handler result convention (consumed by server.js):
 *   { to: [{dest, msg}], all: msg|null, state: bool,
 *     changed: bool, error: string|null }
 *   dest is 'host' or a seat number. `all` is one literal message sent
 *   to every connection; `state: true` asks the wrapper to push a fresh
 *   per-viewer snapshot to everyone; `error` goes to the sender only.
 *   `changed: true` means the wrapper should persist the room.
 */

export const CODE_LEN = 4;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/L/O/0/1
export const MAX_PLAYERS = 4;
export const BET_PAYOUT = 100; // one chip is worth $100 in the finale
export const BASE_BET_CAP = 3;
export const MAX_BET_CAP = 5;
export const LONG_SHOT_STEP = 1000;
export const QUICK_DRAW_BONUS = 50; // flat, on a 'normal' question's first correct receipt
export const STREAK_BONUS = 25; // flat, per bank once a streak reaches STREAK_MIN
export const STREAK_MIN = 3; // banks in a row before the bonus starts paying
export const STREAK_DEATH_MIN = 4; // a dying run of this length or more earns a named moment

/* The Long Shot, server-authoritative: 3 chips at (or near) the
 * lead, +1 per full $1,000 of deficit, capped at 5. Purely a
 * function of the scores in the room at bet time. */
export function betCapFor(room, seat) {
  const p = room && room.players ? room.players[seat] : null;
  if (!p) return BASE_BET_CAP;
  let lead = p.score;
  for (const s of joinedSeats(room)) if (room.players[s].score > lead) lead = room.players[s].score;
  return Math.min(MAX_BET_CAP, BASE_BET_CAP + Math.floor(Math.max(0, lead - p.score) / LONG_SHOT_STEP));
}

/* The Headline derivation: the room counts its own publishes per
 * round; the sixth Round 2 publish is the Headline. Purely positional
 * — kind, category and any client-supplied flag play no part. */
export function headlinePublish(room, round) {
  if (round !== 2 || !room) return false;
  const counts = room.published && typeof room.published === 'object' ? room.published : {};
  return (counts['2'] || 0) === 6;
}

export function makeCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_CHARS[(rand() * CODE_CHARS.length) | 0];
  return s;
}

export function makeToken() {
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
export function setNowProvider(fn) { if (typeof fn === 'function') nowProvider = fn; }
export function nowMs() { return nowProvider(); }

export function createRoom(code, hostToken) {
  return {
    code,
    hostToken,
    phase: 'lobby',           // lobby | bet | answer | reveal | intermission | ended
    players: [null, null, null, null], // {name, token, score, cutTwo, connected, avatar, streak}
    bet: null,                // {qid, bySeat:{seat:chips}} while a bet phase is open
    published: {},            // round -> count of questions published (Headline derivation)
    lastPubQid: null,         // a re-publish of the same qid is the same question, not a new one
    question: null,           // current/last question record (see publish)
    lastReveal: null,         // payload of the last reveal, for snapshots
    interm: null,             // {nextRound} while the room rests between rounds (the Intermission)
    deciderWinner: null,      // seat that won a resolved decider, once one resolves
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

export function scoresArray(room) {
  return room.players.map((p) => (p ? p.score : null));
}

function cleanName(name, seat) {
  const s = String(name || '').trim().slice(0, 24);
  return s || ('Player ' + (seat + 1));
}

/* Player avatar: an integer 0..7 chosen on the joining phone (Design
 * pass item 6). Anything else — missing, non-integer, out of range —
 * falls back to the seat's own index, so old clients that never send
 * the field get exactly the pre-avatar behaviour. */
export const AVATAR_COUNT = 8;
export function cleanAvatar(value, seat) {
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
export function snapshotFor(room, view) {
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
      windowMs: q.windowMs,
      openedAt: q.openedAt,
      deadline: q.deadline,
      betted: q.betted,
      decider: q.decider === true,
      eligible: q.decider ? (q.eligible || []).slice() : null,
      cut: q.cutBy != null ? { bySeat: q.cutBy, indices: q.cutIndices.slice() } : null,
      answersIn: Object.keys(q.kind === 'num' ? q.nums : q.picks).length,
    };
    if (view.role === 'host') { // the host authored the secrets; resync may echo them to it alone
      pubQ.correctIdx = q.correctIdx;
      pubQ.trueNum = q.trueNum;
    }
  }
  const snap = {
    code: room.code,
    phase: room.phase,
    /* which show of the night this is (Rematch Night): 1 for the
     * room's first show, advancing only when the host calls
     * new_show — a room persisted before the field existed reads 1 */
    showSeq: room.showSeq || 1,
    role: view.role,
    seat: view.role === 'player' ? view.seat : null,
    players: room.players.map((p, i) => (p
      ? { seat: i, name: p.name, score: p.score, cutTwo: p.cutTwo, connected: p.connected, avatar: cleanAvatar(p.avatar, i), streak: p.streak || 0 }
      : null)),
    question: pubQ,
    /* the Intermission rides the snapshot so a pad (or a restored
     * host) that only ever sees snapshots knows the room is resting
     * and which round follows the break */
    intermission: room.phase === 'intermission' && room.interm
      ? { nextRound: room.interm.nextRound } : null,
    bet: room.bet ? {
      qid: room.bet.qid,
      betsIn: Object.keys(room.bet.bySeat).length,
      // the one protocol addition of the Long Shot: a PLAYER's
      // snapshot carries that player's own cap for this bet phase
      // (the host's snapshot does not — caps are per-player state)
      ...(view.role === 'player' ? { yourCap: betCapFor(room, view.seat) } : {}),
    } : null,
    lastReveal: room.lastReveal,
  };
  if (view.role === 'player') {
    const seat = view.seat;
    if (room.bet) snap.yourBet = room.bet.bySeat[seat] != null ? room.bet.bySeat[seat] : null;
    else if (q && q.betted) snap.yourBet = q.bets[seat] != null ? q.bets[seat] : null;
    if (q) {
      snap.yourPick = q.picks[seat] != null ? q.picks[seat] : null;
      snap.yourNum = q.nums[seat] != null ? q.nums[seat] : null;
    }
  }
  return snap;
}

/* Settle the open question at the current server time: compute the
 * as-stopped drained value, find the winners, bank, and produce the
 * reveal broadcast. Returns null when no question is open. */
export function closeQuestion(room) {
  const q = room.question;
  if (!q || room.phase !== 'answer') return null;
  const isDecider = q.decider === true;
  const t = nowMs();
  q.closedAt = t;
  let value = null;
  if (!q.betted && !isDecider) {
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
    if (entry.correct && !isDecider) {
      entry.banked = q.betted
        ? (q.bets[seat] != null ? q.bets[seat] : 1) * BET_PAYOUT
        : value;
    }
    room.players[seat].score += entry.banked;
    results.push(entry);
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
  };
  const reveal = { t: 'reveal', qid: q.qid, kind: q.kind, headline: q.headline === true, value, results, scores, quickDrawSeat, streakMoment, decider: isDecider, eligible: isDecider ? (q.eligible || []).slice() : null, deciderWinner };
  if (q.kind === 'num') reveal.trueNum = q.trueNum;
  else reveal.correctIdx = q.correctIdx;
  return ok({ all: reveal, state: true, changed: true });
}

/* Lazy auto-close: if the window has run out, settle before anything
 * else happens. The wrapper also calls this from its alarm. */
export function expireIfNeeded(room) {
  if (room.phase === 'answer' && room.question && nowMs() >= room.question.deadline) {
    return closeQuestion(room);
  }
  return null;
}

/* First message on every socket. Returns {identity, res} — identity is
 * {role:'host'} or {role:'player', seat}, or null when rejected. */
export function handleHello(room, msg) {
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
      cutTwo: true,
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

export function handleHostMessage(room, msg) {
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
      if (kind !== 'normal' && kind !== 'survey' && kind !== 'num') return fail('Unknown question kind.');
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
      const windowMs = Number(msg.deadlineMs);
      if (!Number.isFinite(windowMs) || windowMs < 1000 || windowMs > 180000) {
        return fail('Bad deadlineMs (window length, 1000..180000).');
      }
      const baseValue = msg.baseValue == null ? 100 : Number(msg.baseValue);
      if (!Number.isFinite(baseValue) || baseValue <= 0) return fail('Bad baseValue.');
      const multiplier = msg.multiplier == null ? 1 : Number(msg.multiplier);
      if (!Number.isFinite(multiplier) || multiplier <= 0) return fail('Bad multiplier.');
      let correctIdx = null;
      let trueNum = null;
      let answersCount = 4;
      let cutIndices = null;
      if (kind === 'num') {
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
      const headline = headlinePublish(room, round);
      const effWindowMs = headline ? Math.round(windowMs / 2) : Math.round(windowMs);
      const t = nowMs();
      room.question = {
        qid: msg.qid,
        round,
        kind,
        category: String(msg.category || '').slice(0, 32),
        answersCount,
        baseValue,
        multiplier: headline ? multiplier * 2 : multiplier,
        headline,
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
        nums: {},
        cutBy: null,
        closedAt: null,
        stoppedValue: null,
      };
      room.interm = null; // advancing out of the break ends it
      room.phase = 'answer';
      return ok({ state: true, changed: true });
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
       * Decider). The room records nothing but the phase and the
       * next round; the break ends when the host advances (publish
       * and bet_phase clear it, above) or ends the show (below). */
      if (room.phase !== 'reveal') return fail('The break comes after a reveal.');
      const nr = Number(msg.nextRound);
      if (nr !== 2 && nr !== 3) return fail('The break names the round that follows: 2 or 3.');
      room.interm = { nextRound: nr };
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
        p.cutTwo = true;
        p.streak = 0;
      }
      room.bet = null;
      room.published = {};
      room.lastPubQid = null;
      room.question = null;
      room.lastReveal = null;
      room.interm = null;
      room.deciderWinner = null;
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
       * the scores alone still read as a tie, by design */
      return ok({ all: { t: 'ended', scores, winnerSeat: room.deciderWinner != null ? room.deciderWinner : null }, state: true, changed: true });
    }
    default:
      return fail('Unknown message.');
  }
}

export function handlePlayerMessage(room, seat, msg) {
  if (!msg || typeof msg.t !== 'string') return fail('Bad message.');
  const p = room.players[seat];
  if (!p) return fail('Join first.');
  switch (msg.t) {
    case 'ping':
      return ok({ to: [{ dest: seat, msg: { t: 'pong' } }] });
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
    case 'cuttwo': {
      if (room.phase !== 'answer' || !room.question) return fail('No open question.');
      const q = room.question;
      if (msg.qid !== q.qid) return fail('Wrong question.');
      if (q.kind === 'num') return fail('Nothing to cut on a number question.');
      if (!q.cutIndices) return fail('No cut available on this question.');
      if (q.cutBy != null) return fail('Already cut on this question.');
      if (!p.cutTwo) return fail('Your Cut Two is spent.');
      p.cutTwo = false;
      q.cutBy = seat;
      return ok({
        all: { t: 'cut', qid: q.qid, bySeat: seat, indices: q.cutIndices.slice() },
        state: true,
        changed: true,
      });
    }
    default:
      return fail('Unknown message.');
  }
}
