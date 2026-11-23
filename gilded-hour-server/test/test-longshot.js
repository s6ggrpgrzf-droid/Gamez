/* The Long Shot (Design pass 1) — server-authoritative deficit caps.
 * Same simulated Durable Object harness as test-game.js, in its own
 * suite so the 77 checks there stay exactly as they were. Proves:
 * tied players cap at 3; a $3,000 trailer is dealt cap 5 in their own
 * snapshot (and only theirs); the leader's forged 5-chip bet is
 * rejected on the same path as any out-of-range bet; 4- and 5-chip
 * bets bank bet x $100; caps recompute per question (a trailer who
 * becomes the leader drops to cap 3); and the 2-player edge.
 * Run: node test/test-longshot.js */
import * as worker from '../server.js';
import { setNowProvider, betCapFor } from '../room.js';

let T = 1_700_000_100_000;
setNowProvider(() => T);

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name, detail || ''); }
}

// ---- fakes (mirrors test-game.js) ----
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
    states() { return c.msgs('state').map((m) => m.state); },
    lastState() { const s = c.states(); return s[s.length - 1]; },
    errors() { return c.msgs('error'); },
    lastError() { const e = c.errors(); return e[e.length - 1]; },
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
async function bankQuestion(host, P, qid, value, winnerSeat) {
  await host.send({
    t: 'publish_question', qid, round: 1, kind: 'normal', category: 'Movies',
    deadlineMs: 20000, baseValue: value, multiplier: 1, correctIdx: 0, answersCount: 4,
  });
  for (let i = 0; i < P.length; i++) await P[i].send({ t: 'answer', qid, pick: i === winnerSeat ? 0 : 1 });
  await host.send({ t: 'reveal', qid });
  return P[0].last('reveal');
}

// ---- unit: the formula itself ----
{
  const room = { players: [
    { score: 3000 }, { score: 2000 }, { score: 1999 }, { score: 0 },
  ] };
  // joinedSeats needs real seats; emulate with all four present
  ok(betCapFor(room, 0) === 3, 'formula: the leader caps at 3');
  ok(betCapFor(room, 1) === 4, 'formula: exactly $1,000 behind caps at 4');
  ok(betCapFor(room, 2) === 4, 'formula: $1,001 behind caps at 4 (full thousands only)');
  ok(betCapFor(room, 3) === 5, 'formula: $3,000 behind caps at 5, never more');
  ok(betCapFor(room, 9) === 3, 'formula: an empty seat caps at 3');
}

// ---- main room: 3 players ----
const { host, P } = await setupRoom(3);

// tied at $0: everyone caps at 3, and a 4-chip bet is refused
await host.send({ t: 'bet_phase', qid: 'qT' });
ok(P[0].lastState().bet.yourCap === 3 && P[1].lastState().bet.yourCap === 3 && P[2].lastState().bet.yourCap === 3,
  'tied show: every player snapshot deals cap 3');
ok(!('yourCap' in (host.lastState().bet || {})), 'host snapshot carries no yourCap (caps are per-player)');
await P[1].send({ t: 'bet', qid: 'qT', chips: 4 });
ok(/Bet 1, 2 or 3 chips/.test((P[1].lastError() || {}).msg || '') && P[1].lastState().yourBet == null,
  'tied show: a 4-chip bet is rejected and nothing is recorded');
await P[1].send({ t: 'bet', qid: 'qT', chips: 3 });
ok((P[1].last('accepted') || {}).qid === 'qT', 'tied show: a 3-chip bet is accepted');
// settle the tied bet question with no correct answers (scores stay 0)
await host.send({
  t: 'publish_question', qid: 'qT', round: 3, kind: 'normal', category: 'TV',
  deadlineMs: 20000, baseValue: 100, correctIdx: 2, answersCount: 4,
});
for (let i = 0; i < 3; i++) await P[i].send({ t: 'answer', qid: 'qT', pick: 0 });
await host.send({ t: 'reveal', qid: 'qT' });
/* Pass 14: a finale reveal holds its breath first — run the
 * fake clock past it and let any traffic speak the reveal */
T += 3100;
await P[0].send({ t: 'ping' });
ok(JSON.stringify(P[0].last('reveal').scores.slice(0, 3)) === '[0,0,0]', 'tied bet question banks nothing on an all-miss');

// build a $3,000 lead for seat 0 (its bank question pays 3000 + the
// $50 quick-draw — seat 0 is the sole correct answer, first receipt)
{
  const rev = await bankQuestion(host, P, 'qL', 3000, 0);
  ok(JSON.stringify(rev.scores.slice(0, 3)) === '[3050,0,0]', 'setup: scores are [3050, 0, 0] entering the Big Finish');
}

// the Long Shot bet phase: caps dealt per player
await host.send({ t: 'bet_phase', qid: 'qB' });
ok(P[0].lastState().bet.yourCap === 3, 'long shot phase: leader is dealt cap 3');
ok(P[1].lastState().bet.yourCap === 5 && P[2].lastState().bet.yourCap === 5,
  'long shot phase: $3,000 trailers are dealt cap 5');
await P[0].send({ t: 'bet', qid: 'qB', chips: 5 });
ok(/Bet 1, 2 or 3 chips/.test((P[0].lastError() || {}).msg || '') && P[0].lastState().yourBet == null,
  'forged bet: the leader cannot bet 5 — rejected server-side, nothing recorded');
await P[1].send({ t: 'bet', qid: 'qB', chips: 5 });
ok((P[1].last('accepted') || {}).qid === 'qB', 'the trailer CAN bet 5');
await P[2].send({ t: 'bet', qid: 'qB', chips: 4 });
ok((P[2].last('accepted') || {}).qid === 'qB', 'the other trailer can bet 4');
await P[1].send({ t: 'bet', qid: 'qB', chips: 6 });
ok(/Long Shot cap/.test((P[1].lastError() || {}).msg || ''),
  'even a trailer cannot bet 6 — the cap is a cap (the standing bet is proven at publish below)');
await host.send({
  t: 'publish_question', qid: 'qB', round: 3, kind: 'normal', category: 'Movies',
  deadlineMs: 20000, baseValue: 100, correctIdx: 1, answersCount: 4,
});
ok(P[1].lastState().yourBet === 5 && P[2].lastState().yourBet === 4 && P[0].lastState().yourBet == null,
  'at publish the recorded bets are exactly the accepted ones (5 and 4; the forged and the 6 never landed)');
await P[0].send({ t: 'answer', qid: 'qB', pick: 0 }); // wrong
await P[1].send({ t: 'answer', qid: 'qB', pick: 1 }); // correct, 5 chips
await P[2].send({ t: 'answer', qid: 'qB', pick: 1 }); // correct, 4 chips
await host.send({ t: 'reveal', qid: 'qB' });
T += 3100; /* Pass 14: the held breath runs out */
await P[0].send({ t: 'ping' });
{
  const rev = P[0].last('reveal');
  const bySeat = Object.fromEntries(rev.results.map((r) => [r.seat, r]));
  ok(bySeat[1].banked === 650, 'a correct 5-chip bet banks bet x $100 = $500, plus the round-3 $150 quick-draw (seat 0 answered first but wrong; seat 1 was the first correct receipt)');
  ok(bySeat[2].banked === 400, 'a correct 4-chip bet banks bet x $100 = $400');
  ok(bySeat[0].banked === 0 && bySeat[0].lost === 50, 'jeopardy: the leader answers wrong on a default 1-chip bet and loses half the stake — $50 (second Big Finish question)');
  ok(JSON.stringify(rev.scores.slice(0, 3)) === '[3000,650,400]', 'scores after the long-shot question: [3000, 650, 400] — the $50 jeopardy loss included');
}

// seat 1 storms past the leader on a plain question (banking the
// 4000 plus its own quick-draw $50 as first correct receipt — the
// helper publishes round 1, so the round-1 figure stands)
{
  const rev = await bankQuestion(host, P, 'qC', 4000, 1);
  ok(JSON.stringify(rev.scores.slice(0, 3)) === '[3000,4700,400]', 'setup: seat 1 takes the lead, [3000, 4700, 400]');
}
await host.send({ t: 'bet_phase', qid: 'qD' });
ok(P[1].lastState().bet.yourCap === 3, 'recompute: yesterday\'s trailer is today\'s leader — cap drops to 3');
ok(P[0].lastState().bet.yourCap === 4, 'recompute: the old leader now trails by $1,700 — cap 4');
ok(P[2].lastState().bet.yourCap === 5, 'recompute: seat 2 trails by $4,300 — cap 5');
await P[1].send({ t: 'bet', qid: 'qD', chips: 4 });
ok(/Bet 1, 2 or 3 chips/.test((P[1].lastError() || {}).msg || ''), 'recompute: the new leader\'s 4-chip bet is rejected');

// ---- 2-player edge ----
{
  const two = await setupRoom(2);
  await two.host.send({ t: 'bet_phase', qid: 'q2T' });
  ok(two.P[0].lastState().bet.yourCap === 3 && two.P[1].lastState().bet.yourCap === 3,
    '2-player tied: both cap at 3');
  await two.host.send({
    t: 'publish_question', qid: 'q2T', round: 3, kind: 'normal', category: 'TV',
    deadlineMs: 20000, baseValue: 100, correctIdx: 0, answersCount: 4,
  });
  await two.P[0].send({ t: 'answer', qid: 'q2T', pick: 1 });
  await two.P[1].send({ t: 'answer', qid: 'q2T', pick: 1 });
  await two.host.send({ t: 'reveal', qid: 'q2T' });
  T += 3100; /* Pass 14: the held breath runs out */
  await two.P[0].send({ t: 'ping' });
  await bankQuestion(two.host, two.P, 'q2L', 2500, 0);
  await two.host.send({ t: 'bet_phase', qid: 'q2B' });
  ok(two.P[0].lastState().bet.yourCap === 3 && two.P[1].lastState().bet.yourCap === 5,
    '2-player: leader caps at 3, the $2,500 trailer caps at 5');
  await two.P[1].send({ t: 'bet', qid: 'q2B', chips: 5 });
  ok((two.P[1].last('accepted') || {}).qid === 'q2B', '2-player: the trailer\'s 5-chip bet is accepted');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
