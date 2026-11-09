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

const CODE_LEN = 4;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/L/O/0/1
const MAX_PLAYERS = 4;
const BET_PAYOUT = 100; // one chip is worth $100 in the finale

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

function createRoom(code, hostToken) {
  return {
    code,
    hostToken,
    phase: 'lobby',           // lobby | bet | answer | reveal | ended
    players: [null, null, null, null], // {name, token, score, cutTwo, connected, avatar}
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

function scoresArray(room) {
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
      ? { seat: i, name: p.name, score: p.score, cutTwo: p.cutTwo, connected: p.connected, avatar: cleanAvatar(p.avatar, i) }
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
function closeQuestion(room) {
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
function expireIfNeeded(room) {
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

function handlePlayerMessage(room, seat, msg) {
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
        this.room = createRoom(body.code, body.hostToken);
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
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = makeCode();
        const hostToken = makeToken();
        const id = env.ROOMS.idFromName(code);
        const stub = env.ROOMS.get(id);
        const r = await stub.fetch(new Request('https://room/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, hostToken }),
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
