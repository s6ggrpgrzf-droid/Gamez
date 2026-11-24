/* Hot Streaks (New programme pass 3) — the server referees the run:
 * consecutive banked 'normal' questions build it, a miss ends it,
 * guess kinds are neutral. SUBTRACTION PASS I (2026-11-23): the run
 * no longer PAYS — the flat $25 is retired; the count, its moments
 * and its snapshot are narration only. Same simulated Durable
 * Object harness as the sibling suites, in its own file so their
 * check counts stay exactly as they were. Proves: the exact economy
 * (every bank pays its value + quick-draw only, streakBonus always
 * 0); guess banks AND guess misses leave the run
 * untouched; silence on a 'normal' question breaks it; the count is
 * untouched by a x2 question, the true Headline, and a 3-chip bet;
 * the moment arbitration (reach5 > reach3 > death, higher count,
 * earlier seat); a sub-4 death is never named; forged streak fields
 * are never read; the counts ride the snapshot, so a reclaimed pad
 * sees its true streak. The Decider is a 'num' question, so the num
 * neutrality proven here is the decider's neutrality too.
 * Run: node test/test-streaks.js */
import * as worker from '../server.js';
import { setNowProvider, STREAK_BONUS, STREAK_MIN, STREAK_DEATH_MIN } from '../room.js';

let T = 1_700_001_900_000;
setNowProvider(() => T);

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name, detail || ''); }
}
ok(STREAK_MIN === 3 && STREAK_DEATH_MIN === 4,
  'unit: the streak is named from the 3rd straight bank; deaths are named from 4 (the pay figure is retired — Subtraction I)');

// ---- fakes (mirrors test-quickdraw.js) ----
class FakeSocket {
  constructor() { this.peer = null; this.received = []; this.readyState = 1; this._att = null; }
  send(data) { if (this.peer) this.peer.received.push(String(data)); }
  close() {}
  serializeAttachment(v) { this._att = v; }
  deserializeAttachment() { return this._att; }
}
globalThis.WebSocketPair = class {
  constructor() {
    const a = new FakeSocket(), b = new FakeSocket();
    a.peer = b; b.peer = a; this.a = a; this.b = b;
  }
};
function makeCtx(sharedMap, sharedSockets) {
  const map = sharedMap || new Map();
  const sockets = sharedSockets || [];
  return {
    _map: map,
    _sockets: sockets,
    storage: {
      async get(k) { const v = map.get(k); return v === undefined ? null : structuredClone(v); },
      async put(k, v) { map.set(k, structuredClone(v)); },
      async delete(k) { map.delete(k); },
      async deleteAll() { map.clear(); },
      async setAlarm(t) { this.alarmAt = t; },
    },
    acceptWebSocket(ws) { sockets.push(ws); },
    getWebSockets() { return sockets.slice(); },
    blockConcurrencyWhile(fn) { return fn(); },
  };
}
const instances = new Map();
const env = {
  ROOMS: {
    idFromName: (name) => ({ name }),
    get: (id) => {
      if (!instances.has(id.name)) instances.set(id.name, new worker.GildedRoom(makeCtx(), env));
      const inst = instances.get(id.name);
      return {
        fetch: async (req) => {
          try { return await inst.fetch(req); }
          catch (e) { if (e instanceof RangeError) return { status: 101 }; throw e; }
        },
      };
    },
  },
};
const doOf = (code) => instances.get(code);

async function connect(code) {
  const res = await worker.default.fetch(
    new Request('http://w/room/' + code, { headers: { Upgrade: 'websocket' } }), env);
  if (res.status !== 101) throw new Error('join did not upgrade: ' + res.status);
  const inst = doOf(code);
  const serverWs = inst.pending[inst.pending.length - 1];
  const clientWs = serverWs.peer;
  const hist = [];
  const c = {
    inst, serverWs, hist,
    pump() { for (const d of clientWs.received.splice(0)) hist.push(JSON.parse(d)); },
    async send(msg) { await inst.webSocketMessage(serverWs, JSON.stringify(msg)); c.pump(); },
    msgs(type) { c.pump(); return hist.filter((m) => m.t === type); },
    last(type) { const a = c.msgs(type); return a[a.length - 1]; },
    lastState() { const s = c.msgs('state').map((m) => m.state); return s[s.length - 1]; },
    lastError() { const e = c.msgs('error'); return e[e.length - 1]; },
    text() { c.pump(); return hist.map((m) => JSON.stringify(m)).join('\n'); },
  };
  return c;
}
async function createRoom() {
  const r = await worker.default.fetch(new Request('http://x/room', { method: 'POST' }), env);
  return r.json();
}
async function setupRoom(nPlayers) {
  const { code, hostToken } = await createRoom();
  const host = await connect(code);
  await host.send({ t: 'hello', role: 'host', hostToken });
  const P = [];
  for (let i = 0; i < nPlayers; i++) {
    const c = await connect(code);
    await c.send({ t: 'hello', role: 'player', name: 'P' + i });
    P.push(c);
  }
  return { code, host, P };
}
const bySeat = (rev) => Object.fromEntries(rev.results.map((r) => [r.seat, r]));

/* A plain Round 1 'normal' question: baseValue 200, x1, correctIdx 1.
 * The fake clock never advances inside a question, so the drained
 * value is exactly baseValue x multiplier at every reveal. */
async function pubN(host, qid, extra) {
  await host.send(Object.assign({
    t: 'publish_question', qid, round: 1, kind: 'normal', category: 'Movies',
    deadlineMs: 20000, baseValue: 200, multiplier: 1, correctIdx: 1, answersCount: 4,
  }, extra || {}));
}
async function soloBank(A, qid, seat) {
  await pubN(A.host, qid);
  await A.P[seat].send({ t: 'answer', qid, pick: 1 });
  await A.host.send({ t: 'reveal', qid });
  return A.P[0].last('reveal');
}

const A = await setupRoom(3);

// ---- A1-A4: the economy — no bank ever pays a streak bonus (Subtraction I)
{
  const rev = await soloBank(A, 'a1', 0);
  const b = bySeat(rev);
  ok(b[0].banked === 250 && b[0].streak === 1 && b[0].streakBonus === 0 && rev.streakMoment === null,
    'A1: first bank — drained 200 + quick-draw 50, streak 1, no streak bonus, no moment',
    JSON.stringify(rev.results));
}
{
  const rev = await soloBank(A, 'a2', 0);
  const b = bySeat(rev);
  ok(b[0].banked === 250 && b[0].streak === 2 && b[0].streakBonus === 0 && rev.streakMoment === null,
    'A2: second bank — streak 2, no bonus, no moment yet', JSON.stringify(rev.results));
}
{
  const rev = await soloBank(A, 'a3', 0);
  const b = bySeat(rev);
  ok(b[0].banked === 250 && b[0].streak === 3 && b[0].streakBonus === 0 &&
     rev.streakMoment && rev.streakMoment.type === 'reach3' && rev.streakMoment.seat === 0 && rev.streakMoment.n === 3,
    'A3: third bank — 200 + 50 quick-draw = 250, the streak pays nothing, and the reach-3 moment is named',
    JSON.stringify({ results: rev.results, moment: rev.streakMoment }));
  ok(rev.scores[0] === 750, 'A3: server score is the banks alone (250 + 250 + 250)');
  ok(A.P[0].lastState().players[0].streak === 3,
    'A3: the snapshot carries the live streak count');
  ok(A.P[0].lastState().lastReveal.streakMoment && A.P[0].lastState().lastReveal.streakMoment.type === 'reach3',
    'A3: lastReveal remembers the moment for resyncs');
}
{
  const rev = await soloBank(A, 'a4', 0);
  const b = bySeat(rev);
  ok(b[0].banked === 250 && b[0].streak === 4 && b[0].streakBonus === 0 && rev.streakMoment === null,
    'A4: fourth bank — still no streak money, and crossing 4 names no moment',
    JSON.stringify(rev.results));
}

// ---- B: guess kinds are neutral — a bank and a miss alike
await A.host.send({
  t: 'publish_question', qid: 'b1', round: 1, kind: 'num', category: 'TV',
  deadlineMs: 30000, baseValue: 100, trueNum: 100,
});
await A.P[0].send({ t: 'answer', qid: 'b1', num: 100 });
await A.host.send({ t: 'reveal', qid: 'b1' });
{
  const b = bySeat(A.P[0].last('reveal'));
  ok(b[0].correct && b[0].banked === 100 && b[0].streak === 4 && b[0].streakBonus === 0,
    'B1: a num bank pays its value and leaves the streak at 4 — closeness is a different sport',
    JSON.stringify(b[0]));
}
await A.host.send({
  t: 'publish_question', qid: 'b2', round: 1, kind: 'survey', category: 'TV',
  deadlineMs: 20000, baseValue: 200, multiplier: 1, correctIdx: 1, answersCount: 4,
});
await A.P[0].send({ t: 'answer', qid: 'b2', pick: 1 });
await A.host.send({ t: 'reveal', qid: 'b2' });
{
  const rev = A.P[0].last('reveal');
  const b = bySeat(rev);
  ok(b[0].correct && b[0].banked === 200 && b[0].streak === 4 && b[0].streakBonus === 0 && rev.quickDrawSeat === null,
    'B2: a survey bank pays its value, no quick-draw, and the streak stays 4', JSON.stringify(b[0]));
}
await A.host.send({
  t: 'publish_question', qid: 'b3', round: 1, kind: 'num', category: 'TV',
  deadlineMs: 30000, baseValue: 100, trueNum: 500,
});
await A.P[0].send({ t: 'answer', qid: 'b3', num: 1 });
await A.P[1].send({ t: 'answer', qid: 'b3', num: 500 });
await A.host.send({ t: 'reveal', qid: 'b3' });
{
  const b = bySeat(A.P[0].last('reveal'));
  ok(!b[0].correct && b[0].streak === 4 && b[1].correct,
    'B3: a num MISS does not break the run either — the streak survives at 4', JSON.stringify(b[0]));
}

// ---- C: an MCQ miss ends the run, and a run of 4 earns its death line
await pubN(A.host, 'c1');
await A.P[0].send({ t: 'answer', qid: 'c1', pick: 0 });
await A.host.send({ t: 'reveal', qid: 'c1' });
{
  const rev = A.P[0].last('reveal');
  const b = bySeat(rev);
  ok(b[0].banked === 0 && b[0].streak === 0 && rev.streakMoment &&
     rev.streakMoment.type === 'death' && rev.streakMoment.seat === 0 && rev.streakMoment.n === 4,
    'C1: the miss zeroes the streak, pays nothing, and the death of a 4-run is named with its count',
    JSON.stringify({ results: rev.results, moment: rev.streakMoment }));
  ok(A.P[0].lastState().players[0].streak === 0, 'C1: the snapshot agrees the run is over');
}

// ---- D: silence breaks a run exactly like a wrong pick does
await soloBank(A, 'd1', 2);
await soloBank(A, 'd2', 2);
await pubN(A.host, 'd3');
await A.P[1].send({ t: 'answer', qid: 'd3', pick: 1 }); // someone else plays; seat 2 sits out
await A.host.send({ t: 'reveal', qid: 'd3' });
{
  const b = bySeat(A.P[0].last('reveal'));
  ok(b[2].streak === 0 && b[2].banked === 0,
    'D: two banks then silence on a normal question — the run resets to 0', JSON.stringify(b[2]));
}

// ---- E: rebuild to 5 — the reach-5 moment fires at the crossing
for (let k = 1; k <= 5; k++) {
  const rev = await soloBank(A, 'e' + k, 0);
  const b = bySeat(rev);
  if (k === 3) ok(rev.streakMoment && rev.streakMoment.type === 'reach3' && b[0].streakBonus === 0,
    'E3: the rebuild crosses 3 with its moment and no money');
  if (k === 5) ok(b[0].streak === 5 && b[0].streakBonus === 0 && rev.streakMoment &&
    rev.streakMoment.type === 'reach5' && rev.streakMoment.seat === 0 && rev.streakMoment.n === 5,
    'E5: the fifth straight bank names the reach-5 moment', JSON.stringify(rev.streakMoment));
}

/* F onward plays in a FRESH room: the wrapper rate-limits each
 * socket to 40 messages per 10 real seconds, and room A's host was
 * already past 30 — the sibling suites split rooms for the same
 * reason. Nothing about the streak state carries between rooms. */
const A2 = await setupRoom(3);

// ---- F: a bet bank at streak 3 — the bet pays alone, the streak is narration
for (let k = 1; k <= 2; k++) await soloBank(A2, 'f' + k, 2); // seat 2 builds to streak 2
await A2.host.send({ t: 'bet_phase', qid: 'fB' });
await A2.P[2].send({ t: 'bet', qid: 'fB', chips: 3 });
await A2.P[0].send({ t: 'bet', qid: 'fB', chips: 1 });
await A2.host.send({
  t: 'publish_question', qid: 'fB', round: 3, kind: 'normal', category: 'Movies',
  deadlineMs: 20000, baseValue: 100, correctIdx: 1, answersCount: 4,
});
await A2.P[0].send({ t: 'answer', qid: 'fB', pick: 1 }); // seat 0 correct FIRST (takes the quick-draw)
await A2.P[2].send({ t: 'answer', qid: 'fB', pick: 1 }); // seat 2 correct second, on a 3-chip bet, reaching streak 3
await A2.host.send({ t: 'reveal', qid: 'fB' });
T += 3100; /* Pass 14: the Big Finish reveal holds its breath — run it out */
await A2.P[0].send({ t: 'ping' });
{
  const rev = A2.P[0].last('reveal');
  const b = bySeat(rev);
  ok(b[2].banked === 300 && b[2].streak === 3 && b[2].streakBonus === 0,
    'F: a 3-chip Big Finish bank at streak 3 pays bet x $100 = 300 alone — the streak adds nothing (Subtraction I)',
    JSON.stringify(b[2]));
  ok(rev.streakMoment && rev.streakMoment.type === 'reach3' && rev.streakMoment.seat === 2,
    'F: the bet bank that reaches 3 names its moment like any other');
}

// ---- G: the Headline at a long streak — doubled value + quick-draw, no streak money
for (let k = 1; k <= 5; k++) {
  await pubN(A2.host, 'g' + k, { round: 2, multiplier: 2 }); // five plain R2 questions
  await A2.P[0].send({ t: 'answer', qid: 'g' + k, pick: 1 });
  await A2.host.send({ t: 'reveal', qid: 'g' + k });
}
await pubN(A2.host, 'g6', { round: 2, multiplier: 2 });
await A2.P[0].send({ t: 'answer', qid: 'g6', pick: 1 });
await A2.host.send({ t: 'reveal', qid: 'g6' });
{
  const rev = A2.P[0].last('reveal');
  const b = bySeat(rev);
  ok(rev.headline === true && rev.value === 800,
    'G: the sixth Round 2 question is the Headline — value 200 x 2 (round) x 2 (headline) = 800 at elapsed 0',
    JSON.stringify({ headline: rev.headline, value: rev.value }));
  ok(b[0].streakBonus === 0 && b[0].banked === 900,
    'G: the Headline bank pays its doubled 800 + quick-draw 100 = 900 — the long streak adds nothing (Subtraction I)',
    JSON.stringify(b[0]));
}

// ---- H: a refreshed pad sees its true streak (reclaim snapshot)
{
  const tok = A2.P[0].last('welcome').reclaimToken;
  const before = A2.P[0].lastState().players[0].streak;
  const inst = doOf(A2.code);
  await inst.webSocketClose(A2.P[0].serverWs); // the old pad goes away first, as test-game does
  inst.ctx._sockets.splice(inst.ctx._sockets.indexOf(A2.P[0].serverWs), 1);
  const c2 = await connect(A2.code);
  await c2.send({ t: 'hello', role: 'player', reclaimToken: tok });
  ok(c2.lastState().players[0].streak === before && before === 7,
    'H: the reclaimed seat snapshot carries the true streak (7: one bet bank, then six Round 2 banks)',
    JSON.stringify({ before, snap: c2.lastState().players[0].streak }));
  A2.P[0] = c2;
}

// ---- I: forged streak claims are never read
await pubN(A2.host, 'i1', { streak: 99, streakBonus: 9999 });
await A2.P[2].send({ t: 'answer', qid: 'i1', pick: 1, streak: 99, streakBonus: 9999 });
await A2.host.send({ t: 'reveal', qid: 'i1' });
{
  const b = bySeat(A2.P[0].last('reveal'));
  ok(b[2].streak === 1 && b[2].streakBonus === 0 && b[2].banked === 250,
    'I: streak fields in publish/answer messages are ignored — seat 2 banks an honest first bank',
    JSON.stringify(b[2]));
}

// ---- Room B: moment arbitration ----
const B = await setupRoom(3);
async function bothBank(qid, first, second) {
  await pubN(B.host, qid);
  await B.P[first].send({ t: 'answer', qid, pick: 1 });
  await B.P[second].send({ t: 'answer', qid, pick: 1 });
  await B.host.send({ t: 'reveal', qid });
  return B.P[0].last('reveal');
}
await bothBank('m1', 0, 1);
await bothBank('m2', 0, 1);
{
  const rev = await bothBank('m3', 1, 0); // seat 1 locks first this time
  const b = bySeat(rev);
  ok(b[0].streak === 3 && b[1].streak === 3 && b[0].streakBonus === 0 && b[1].streakBonus === 0 &&
     rev.streakMoment && rev.streakMoment.type === 'reach3' && rev.streakMoment.seat === 0,
    'M3: two players reach 3 on one question — neither is paid (Subtraction I); the moment goes to the earlier seat',
    JSON.stringify(rev.streakMoment));
}
await pubN(B.host, 'm4');
await B.P[0].send({ t: 'answer', qid: 'm4', pick: 1 }); // seat 0 -> 4
await B.P[1].send({ t: 'answer', qid: 'm4', pick: 0 }); // seat 1's run of 3 dies
await B.host.send({ t: 'reveal', qid: 'm4' });
{
  const rev = B.P[0].last('reveal');
  ok(rev.streakMoment === null && bySeat(rev)[1].streak === 0,
    'M4: a run of 3 dying is NOT a named moment (deaths are named from 4)', JSON.stringify(rev.streakMoment));
}
await pubN(B.host, 'm5');
await B.P[0].send({ t: 'answer', qid: 'm5', pick: 0 }); // seat 0's run of 4 dies
await B.host.send({ t: 'reveal', qid: 'm5' });
{
  const rev = B.P[0].last('reveal');
  ok(rev.streakMoment && rev.streakMoment.type === 'death' && rev.streakMoment.seat === 0 && rev.streakMoment.n === 4,
    'M5: the run of 4 dying names the death moment with its count', JSON.stringify(rev.streakMoment));
}
// priority: a reach outranks a death, even a longer one
for (let k = 1; k <= 5; k++) await soloBank(B, 'p' + k, 0); // seat 0 rebuilds to 5
await soloBank(B, 'p6', 1);
await soloBank(B, 'p7', 1); // seat 1 at 2
await pubN(B.host, 'p8');
await B.P[1].send({ t: 'answer', qid: 'p8', pick: 1 }); // seat 1 reaches 3
await B.P[0].send({ t: 'answer', qid: 'p8', pick: 0 }); // seat 0's run of 5 dies
await B.host.send({ t: 'reveal', qid: 'p8' });
{
  const rev = B.P[0].last('reveal');
  ok(rev.streakMoment && rev.streakMoment.type === 'reach3' && rev.streakMoment.seat === 1 && rev.streakMoment.n === 3,
    'M8: on a shared reveal the reach-3 moment outranks the death of a 5-run',
    JSON.stringify(rev.streakMoment));
}

console.log('\nTEST-STREAKS DONE — ' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) process.exit(1);
