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
 *   1..3 chips before the question; a correct answer banks bet x $100,
 *   a wrong answer loses $0. A missing bet defaults to 1 chip.
 *   Nobody can lose money anywhere. Scores live here, server-side.
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
    phase: 'lobby',           // lobby | bet | answer | reveal | ended
    players: [null, null, null, null], // {name, token, score, cutTwo, connected}
    bet: null,                // {qid, bySeat:{seat:chips}} while a bet phase is open
    question: null,           // current/last question record (see publish)
    lastReveal: null,         // payload of the last reveal, for snapshots
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
      windowMs: q.windowMs,
      openedAt: q.openedAt,
      deadline: q.deadline,
      betted: q.betted,
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
    role: view.role,
    seat: view.role === 'player' ? view.seat : null,
    players: room.players.map((p, i) => (p
      ? { seat: i, name: p.name, score: p.score, cutTwo: p.cutTwo, connected: p.connected }
      : null)),
    question: pubQ,
    bet: room.bet ? { qid: room.bet.qid, betsIn: Object.keys(room.bet.bySeat).length } : null,
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
  const t = nowMs();
  q.closedAt = t;
  let value = null;
  if (!q.betted) {
    const elapsed = Math.min(Math.max(t - q.openedAt, 0), q.windowMs);
    value = Math.round(q.baseValue * q.multiplier * (1 - 0.5 * (elapsed / q.windowMs)));
  }
  q.stoppedValue = value;
  let winDiff = null;
  if (q.kind === 'num') {
    for (const seat of joinedSeats(room)) {
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
      const correct = num != null && winDiff != null && Math.abs(num - q.trueNum) === winDiff;
      entry = { seat, num, correct, banked: 0 };
    } else {
      const pick = q.picks[seat] != null ? q.picks[seat] : null;
      const correct = pick != null && pick === q.correctIdx;
      entry = { seat, pick, correct, banked: 0 };
    }
    if (entry.correct) {
      entry.banked = q.betted
        ? (q.bets[seat] != null ? q.bets[seat] : 1) * BET_PAYOUT
        : value;
    }
    room.players[seat].score += entry.banked;
    results.push(entry);
  }
  const scores = scoresArray(room);
  room.phase = 'reveal';
  room.lastReveal = {
    qid: q.qid,
    kind: q.kind,
    correctIdx: q.kind === 'num' ? null : q.correctIdx,
    trueNum: q.kind === 'num' ? q.trueNum : null,
    value,
    results,
    scores,
  };
  const reveal = { t: 'reveal', qid: q.qid, kind: q.kind, value, results, scores };
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
      if (room.phase !== 'lobby' && room.phase !== 'reveal') {
        return fail('Finish the current step first.');
      }
      if (msg.qid == null) return fail('Missing qid.');
      room.bet = { qid: msg.qid, bySeat: {} };
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
      if (room.phase !== 'lobby' && room.phase !== 'reveal' && room.phase !== 'bet') {
        return fail('Cannot publish now.');
      }
      const kind = msg.kind;
      if (kind !== 'normal' && kind !== 'survey' && kind !== 'num') return fail('Unknown question kind.');
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
      const t = nowMs();
      room.question = {
        qid: msg.qid,
        round: Number.isInteger(msg.round) ? msg.round : 1,
        kind,
        category: String(msg.category || '').slice(0, 32),
        answersCount,
        baseValue,
        multiplier,
        correctIdx,
        trueNum,
        cutIndices,
        windowMs: Math.round(windowMs),
        openedAt: t,
        deadline: t + Math.round(windowMs),
        betted,
        bets,
        picks: {},
        nums: {},
        cutBy: null,
        closedAt: null,
        stoppedValue: null,
      };
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
    case 'end_show': {
      if (room.phase === 'ended') return fail('Show has already ended.');
      room.phase = 'ended';
      const scores = scoresArray(room);
      return ok({ all: { t: 'ended', scores }, state: true, changed: true });
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
      if (!Number.isInteger(chips) || chips < 1 || chips > 3) return fail('Bet 1, 2 or 3 chips.');
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
