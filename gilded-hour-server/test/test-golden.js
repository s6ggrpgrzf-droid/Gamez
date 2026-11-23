/* The Golden Question (The Ten, pass 4) — the host's secret pick,
 * refereed inside its honest envelope, doubled under the Headline's
 * grammar, and invisible until its own reveal. Same simulated
 * Durable Object harness as test-headline.js, in its own suite so
 * their check counts stay exactly as they were. Proves: the flag
 * is stored on the record but rides NO snapshot before the reveal
 * (host, pad — every message scanned); it first leaves the room
 * in the reveal (and the lastReveal snapshots resync from);
 * settlement doubles exactly for MCQ (drain + floor arithmetic),
 * survey and num (pot x2, halved window enforced); the streak
 * bonus and the quick-draw stay flat on a golden bank; claims
 * outside the envelope (Round 3, the Headline's own slot, a
 * decider, a second claim in the same show, a non-boolean claim)
 * settle as ordinary questions, never errors; a re-publish of the
 * golden question keeps its gold; a rematch (new_show) earns a
 * fresh pick; and legacy publishes without the field settle
 * undoubled.
 * Run: node test/test-golden.js */
import * as worker from '../server.js';
import { setNowProvider } from '../room.js';

let T = 1_700_000_500_000;
setNowProvider(() => T);

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name, detail || ''); }
}

// ---- fakes (mirrors test-headline.js) ----
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
    /* every raw message this client has ever received, as text —
       the secrecy scan reads the wire, not a chosen field */
    wireText() { c.pump(); return hist.map((m) => JSON.stringify(m)).join('\n'); },
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
const snapQ = (c) => c.lastState().question;
const bySeat = (rev) => Object.fromEntries(rev.results.map((r) => [r.seat, r]));

// ---- Room G1: plumbing, MCQ drain arithmetic, the re-publish,
//      the second claim, a non-boolean claim, the legacy control ----
const G1 = await setupRoom(2);
await G1.host.send({
  t: 'publish_question', qid: 'g1', round: 1, kind: 'normal', category: 'Movies',
  deadlineMs: 20000, baseValue: 200, multiplier: 1, correctIdx: 0, answersCount: 4, golden: true,
});
{
  const qPad = snapQ(G1.P[0]);
  const qHost = snapQ(G1.host);
  ok(qPad.multiplier === 2 && qPad.windowMs === 10000 && qPad.deadline - qPad.openedAt === 10000,
    'G1: the golden publish deals the effective figures — multiplier doubled to 2, window halved to 10000',
    JSON.stringify(qPad));
  ok(!('golden' in qPad) && !('golden' in qHost),
    'G1: no snapshot question view carries a golden key — not the pad\'s, not even the host\'s (which is dealt the secrets it authored)',
    JSON.stringify({ pad: Object.keys(qPad), host: Object.keys(qHost) }));
  ok(!/golden/.test(G1.P[0].wireText()) && !/golden/.test(G1.P[1].wireText()) && !/golden/.test(G1.host.wireText()),
    'G1: the word golden appears in NO message any client received before the reveal');
  await G1.P[0].send({ t: 'answer', qid: 'g1', pick: 0 }); // correct, at elapsed 0 of the halved window
  T += 2500; // a quarter of the halved window passes before the reveal
  await G1.P[1].send({ t: 'answer', qid: 'g1', pick: 1 }); // wrong
  ok(!/golden/.test(G1.P[0].wireText()),
    'G1: answers and counts inside the window carry no trace either');
  await G1.host.send({ t: 'reveal', qid: 'g1' });
  const rev = G1.P[0].last('reveal');
  const bs = bySeat(rev);
  ok(rev.golden === true && rev.value === 350,
    'G1: the reveal names it — golden true, drained x2 value = 200 x 2 x 0.875 = 350',
    JSON.stringify({ golden: rev.golden, value: rev.value }));
  ok(bs[0].banked === 400 && bs[0].quickDraw === true && bs[1].banked === 0,
    'G1: the correct seat banks 350 + the FLAT $50 quick-draw (sole correct receipt; doubled it would read 450)',
    JSON.stringify(bs));
  ok(G1.P[1].lastState().lastReveal.golden === true && G1.host.lastState().lastReveal.golden === true,
    'G1: lastReveal carries golden to post-reveal snapshots on pad and host alike');
}
// a host re-publish of the SAME golden qid (resync) keeps its gold
await G1.host.send({
  t: 'publish_question', qid: 'g1', round: 1, kind: 'normal', category: 'Movies',
  deadlineMs: 20000, baseValue: 200, multiplier: 1, correctIdx: 0, answersCount: 4, golden: true,
});
{
  const q = snapQ(G1.P[0]);
  ok(q.multiplier === 2 && q.windowMs === 10000 && !('golden' in q),
    'G1: re-publishing the golden question (host resync) keeps the doubled figures — the same double, not a second one',
    JSON.stringify(q));
  await G1.host.send({ t: 'reveal', qid: 'g1' });
  ok(G1.P[0].last('reveal').golden === true, 'G1: the re-published question still reveals as golden');
}
// a SECOND golden claim in the same show settles as an ordinary question
await G1.host.send({
  t: 'publish_question', qid: 'g2', round: 1, kind: 'normal', category: 'TV',
  deadlineMs: 20000, baseValue: 200, multiplier: 1, correctIdx: 0, answersCount: 4, golden: true,
});
{
  const q = snapQ(G1.P[0]);
  ok(q.multiplier === 1 && q.windowMs === 20000,
    'G1: the second golden claim in one show is stored ordinary — plain figures', JSON.stringify(q));
  await G1.P[0].send({ t: 'answer', qid: 'g2', pick: 0 }); // correct at elapsed 0
  await G1.host.send({ t: 'reveal', qid: 'g2' });
  const rev = G1.P[0].last('reveal');
  ok(rev.golden === false && rev.value === 200 && bySeat(rev)[0].banked === 250,
    'G1: ...and settles undoubled: value 200, banked 200 + flat $50 quick-draw',
    JSON.stringify({ golden: rev.golden, value: rev.value, banked: bySeat(rev)[0].banked }));
}
// a non-boolean claim is no claim at all
await G1.host.send({
  t: 'publish_question', qid: 'g3', round: 1, kind: 'normal', category: 'TV',
  deadlineMs: 20000, baseValue: 200, multiplier: 1, correctIdx: 0, answersCount: 4, golden: 1,
});
ok(snapQ(G1.P[0]).multiplier === 1 && snapQ(G1.P[0]).windowMs === 20000,
  'G1: golden:1 (not the boolean true) is ignored — the field is read strictly');
await G1.host.send({ t: 'reveal', qid: 'g3' });
// the legacy control: no field at all, plain arithmetic
await G1.host.send({
  t: 'publish_question', qid: 'g4', round: 1, kind: 'normal', category: 'TV',
  deadlineMs: 20000, baseValue: 200, multiplier: 1, correctIdx: 0, answersCount: 4,
});
await G1.P[1].send({ t: 'answer', qid: 'g4', pick: 0 });
await G1.host.send({ t: 'reveal', qid: 'g4' });
{
  const rev = G1.P[0].last('reveal');
  ok(rev.golden === false && rev.value === 200 && bySeat(rev)[1].banked === 250,
    'G1: a legacy publish (no golden field) settles exactly as it always did',
    JSON.stringify({ value: rev.value, banked: bySeat(rev)[1].banked }));
}

// ---- Room G2: the num golden — pot x2, the halved window enforced ----
const G2 = await setupRoom(2);
await G2.host.send({
  t: 'publish_question', qid: 'n1', round: 2, kind: 'num', category: 'Movies',
  deadlineMs: 30000, baseValue: 200, multiplier: 2, trueNum: 100, golden: true,
});
{
  const q = snapQ(G2.P[0]);
  ok(q.multiplier === 4 && q.windowMs === 15000 && q.deadline - q.openedAt === 15000 && !('golden' in q),
    'G2 (num): golden dealt — window 30000 halved to 15000, multiplier doubled to 4, no trace in the view',
    JSON.stringify(q));
  await G2.P[0].send({ t: 'answer', qid: 'n1', num: 90 });
  T += 16000; // past the halved deadline, inside the un-halved one
  await G2.P[1].send({ t: 'answer', qid: 'n1', num: 99 });
  ok(/Window closed|No open question/.test((G2.P[1].lastError() || {}).msg || '') && G2.P[1].lastState().phase === 'reveal',
    'G2: past the halved deadline the server has already settled — a late number is refused');
  const rev = G2.P[0].last('reveal');
  const bs = bySeat(rev);
  ok(rev.golden === true && rev.value === 400 && bs[0].banked === 400 && bs[0].num === 90,
    'G2: the closest standing number banks the doubled pot at the floor — 200 x 4 x 0.5 = 400',
    JSON.stringify({ value: rev.value, banked: bs[0].banked }));
}
// the same room, the pot at the top of the window (elapsed ~0)
await G2.host.send({
  t: 'publish_question', qid: 'n2', round: 1, kind: 'num', category: 'Music',
  deadlineMs: 30000, baseValue: 100, multiplier: 1, trueNum: 50, golden: true,
});
{
  // n2 is this show's SECOND claim? No — G2's show already spent
  // its gold on n1. Publish it in a fresh room instead (below).
  await G2.host.send({ t: 'reveal', qid: 'n2' });
  ok(G2.P[0].last('reveal').golden === false,
    'G2: a second num claim in the same show is ordinary too (the envelope is per show, not per kind)');
}
const G2b = await setupRoom(2);
await G2b.host.send({
  t: 'publish_question', qid: 'n1', round: 1, kind: 'num', category: 'Music',
  deadlineMs: 30000, baseValue: 100, multiplier: 1, trueNum: 50, golden: true,
});
await G2b.P[1].send({ t: 'answer', qid: 'n1', num: 48 });
await G2b.host.send({ t: 'reveal', qid: 'n1' });
{
  const rev = G2b.P[0].last('reveal');
  ok(rev.golden === true && rev.value === 200 && bySeat(rev)[1].banked === 200,
    'G2b: at the top of the window the golden pot pays in full — 100 x 2 x 1.0 = 200',
    JSON.stringify({ value: rev.value, banked: bySeat(rev)[1].banked }));
}

// ---- Room G3: the survey golden — doubled drain, no quick-draw ----
const G3 = await setupRoom(2);
await G3.host.send({
  t: 'publish_question', qid: 's1', round: 2, kind: 'survey', category: 'TV',
  deadlineMs: 20000, baseValue: 200, multiplier: 1, correctIdx: 1, answersCount: 4, golden: true,
});
T += 5000; // half of the halved window: drain factor 0.75
await G3.P[0].send({ t: 'answer', qid: 's1', pick: 1 });
await G3.host.send({ t: 'reveal', qid: 's1' });
{
  const rev = G3.P[0].last('reveal');
  ok(rev.golden === true && rev.value === 300 && bySeat(rev)[0].banked === 300 && rev.quickDrawSeat === null,
    'G3 (survey): drained x2 pays 200 x 2 x 0.75 = 300, and a survey never quick-draws',
    JSON.stringify({ value: rev.value, banked: bySeat(rev)[0].banked, qd: rev.quickDrawSeat }));
}

// ---- Room G4: the streak bonus stays flat on a golden bank ----
const G4 = await setupRoom(2);
async function plainBank(qid) {
  await G4.host.send({
    t: 'publish_question', qid, round: 1, kind: 'normal', category: 'TV',
    deadlineMs: 20000, baseValue: 100, multiplier: 1, correctIdx: 0, answersCount: 4,
  });
  await G4.P[0].send({ t: 'answer', qid, pick: 0 });
  await G4.host.send({ t: 'reveal', qid });
}
await plainBank('k1'); // P0 streak 1
await plainBank('k2'); // P0 streak 2
await G4.host.send({
  t: 'publish_question', qid: 'k3', round: 1, kind: 'normal', category: 'TV',
  deadlineMs: 20000, baseValue: 100, multiplier: 1, correctIdx: 0, answersCount: 4, golden: true,
});
await G4.P[1].send({ t: 'answer', qid: 'k3', pick: 0 }); // P1 correct FIRST (takes the quick-draw)
await G4.P[0].send({ t: 'answer', qid: 'k3', pick: 0 }); // P0 correct second — the streak bank, isolated
await G4.host.send({ t: 'reveal', qid: 'k3' });
{
  const rev = G4.P[0].last('reveal');
  const bs = bySeat(rev);
  ok(rev.golden === true && rev.value === 200,
    'G4: the golden bank\'s value is the doubled drain at elapsed 0 — 100 x 2 = 200', JSON.stringify({ value: rev.value }));
  ok(bs[0].banked === 225 && bs[0].streakBonus === 25 && bs[0].streak === 3,
    'G4: P0\'s third straight bank pays 200 + a FLAT $25 streak bonus — never $50 — as the run reaches 3',
    JSON.stringify(bs[0]));
  ok(bs[1].banked === 250 && bs[1].quickDraw === true,
    'G4: P1\'s quick-draw on the same golden question pays the FLAT $50 — 200 + 50, never doubled',
    JSON.stringify(bs[1]));
}

// ---- Room G5: the envelope — Headline clash, Round 3, a decider ----
const G5 = await setupRoom(2);
for (let k = 1; k <= 5; k++) {
  await G5.host.send({
    t: 'publish_question', qid: 'h' + k, round: 2, kind: 'normal', category: 'TV',
    deadlineMs: 20000, baseValue: 200, multiplier: 2, correctIdx: 0, answersCount: 4,
  });
  await G5.host.send({ t: 'reveal', qid: 'h' + k });
}
await G5.host.send({
  t: 'publish_question', qid: 'h6', round: 2, kind: 'normal', category: 'TV',
  deadlineMs: 20000, baseValue: 200, multiplier: 2, correctIdx: 0, answersCount: 4, golden: true,
});
{
  const q = snapQ(G5.P[0]);
  ok(q.headline === true && q.multiplier === 4 && q.windowMs === 10000,
    'G5: a golden claim on the Headline\'s own slot is refused — the record is the Headline\'s alone (x4 from the round x2, never x8)',
    JSON.stringify(q));
  await G5.P[0].send({ t: 'answer', qid: 'h6', pick: 0 });
  await G5.host.send({ t: 'reveal', qid: 'h6' });
  const rev = G5.P[0].last('reveal');
  ok(rev.headline === true && rev.golden === false,
    'G5: ...and its reveal says so — headline true, golden false');
}
// the refused claim did NOT spend the show's gold: a later honest
// slot in rounds 1-2 may still carry it
await G5.host.send({
  t: 'publish_question', qid: 'h7', round: 1, kind: 'normal', category: 'Movies',
  deadlineMs: 20000, baseValue: 100, multiplier: 1, correctIdx: 0, answersCount: 4, golden: true,
});
ok(snapQ(G5.P[0]).multiplier === 2 && snapQ(G5.P[0]).windowMs === 10000,
  'G5: a refused claim spends nothing — the next honest golden publish in the show is honoured');
await G5.host.send({ t: 'reveal', qid: 'h7' });
// Round 3 pays by chips: gold there would double nothing
await G5.host.send({ t: 'bet_phase', qid: 'r3' });
await G5.P[0].send({ t: 'bet', qid: 'r3', chips: 2 });
await G5.host.send({
  t: 'publish_question', qid: 'r3', round: 3, kind: 'normal', category: 'TV',
  deadlineMs: 20000, baseValue: 300, multiplier: 1, correctIdx: 0, answersCount: 4, golden: true,
});
await G5.P[0].send({ t: 'answer', qid: 'r3', pick: 0 });
await G5.host.send({ t: 'reveal', qid: 'r3' });
T += 3100; /* Pass 14: a Big Finish reveal holds its breath — run it out */
await G5.P[0].send({ t: 'ping' });
{
  const rev = G5.P[0].last('reveal');
  ok(rev.golden === false && bySeat(rev)[0].banked === 350,
    'G5: a Round 3 golden claim is ordinary — the correct bet pays bet x $100 = 200 plus the round-3 $150 quick-draw (sole correct receipt, as any Big Finish bank earns), and no double anywhere',
    JSON.stringify({ golden: rev.golden, banked: bySeat(rev)[0].banked }));
}
// a decider banks nothing; gold on it would be a lie twice over
await G5.host.send({
  t: 'publish_question', qid: 'd1', round: 3, kind: 'num', category: 'Movies',
  deadlineMs: 30000, baseValue: 300, multiplier: 1, trueNum: 100,
  decider: true, eligible: [0, 1], golden: true,
});
await G5.P[0].send({ t: 'answer', qid: 'd1', num: 100 });
await G5.P[1].send({ t: 'answer', qid: 'd1', num: 130 });
await G5.host.send({ t: 'reveal', qid: 'd1' });
{
  const rev = G5.P[0].last('reveal');
  ok(rev.decider === true && rev.golden === false && rev.deciderWinner === 0
    && rev.results.every((r) => r.banked === 0),
    'G5: a golden claim on a decider is refused — the decider decides the crown, banks $0, and wears no gilt',
    JSON.stringify({ golden: rev.golden, winner: rev.deciderWinner }));
}

// ---- Room G6: a rematch deals a fresh golden pick ----
const G6 = await setupRoom(2);
await G6.host.send({
  t: 'publish_question', qid: 'm1', round: 1, kind: 'normal', category: 'TV',
  deadlineMs: 20000, baseValue: 100, multiplier: 1, correctIdx: 0, answersCount: 4, golden: true,
});
await G6.host.send({ t: 'reveal', qid: 'm1' });
ok(G6.P[0].last('reveal').golden === true, 'G6: show 1 spends its gold');
await G6.host.send({ t: 'end_show' });
await G6.host.send({ t: 'new_show' });
ok(G6.host.lastState().showSeq === 2 && G6.host.lastState().phase === 'lobby',
  'G6: new_show rests the room at a fresh lobby for show 2');
await G6.host.send({
  t: 'publish_question', qid: 'm2', round: 1, kind: 'normal', category: 'TV',
  deadlineMs: 20000, baseValue: 100, multiplier: 1, correctIdx: 0, answersCount: 4, golden: true,
});
{
  const q = snapQ(G6.P[0]);
  ok(q.multiplier === 2 && q.windowMs === 10000,
    'G6: the rematch\'s golden claim is honoured — a fresh pick for a fresh show', JSON.stringify(q));
  await G6.P[0].send({ t: 'answer', qid: 'm2', pick: 0 });
  await G6.host.send({ t: 'reveal', qid: 'm2' });
  const rev = G6.P[0].last('reveal');
  ok(rev.golden === true && bySeat(rev)[0].banked === 250,
    'G6: ...and pays doubled in the new show (200 + flat $50 quick-draw)',
    JSON.stringify({ banked: bySeat(rev)[0].banked }));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
