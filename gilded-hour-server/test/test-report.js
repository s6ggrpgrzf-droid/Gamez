/* The Report Card (pass N1) — the referee keeps four per-seat
 * facts through the night and deals them only at the finale.
 * Same simulated Durable Object harness as test-pot.js, in its own
 * suite so their check counts stay exactly as they were. Proves:
 * the four facts accumulate from the settled results themselves
 * (biggest bank at its settled figure — a Golden-doubled bank
 * counting doubled; best category by money; fastest hand from the
 * standing pick's own receipt stamp, number answers included; the
 * streak peak the settlement recorded); the Decider touches none
 * of them; the card never rides a mid-show snapshot (report null
 * until the show is over) and then rides BOTH the `ended`
 * broadcast and the ended snapshot, identically; a seat that never
 * banked reads as a blank card, never an invented one; the tallies
 * survive a Durable Object rebuild (they ride the persisted room);
 * new_show blanks the card; and the best-category tie-breaks
 * (money, then banks, then earliest) hold in reportFor itself.
 * Run: node test/test-report.js */
import * as worker from '../server.js';
import { setNowProvider, reportFor } from '../room.js';

let T = 1_700_001_000_000;
setNowProvider(() => T);

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name, detail || ''); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- fakes (mirrors test-pot.js) ----
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

function wrapConn(inst, serverWs) {
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
  };
  return c;
}
async function connectTo(inst, code) {
  let res = null;
  try { res = await inst.fetch(new Request('http://w/join', { headers: { Upgrade: 'websocket' } })); }
  catch (e) { if (e instanceof RangeError) res = { status: 101 }; else throw e; }
  if (!res || res.status !== 101) throw new Error('join did not upgrade: ' + (res && res.status));
  return wrapConn(inst, inst.pending[inst.pending.length - 1]);
}
async function connect(code) {
  const res = await worker.default.fetch(
    new Request('http://w/room/' + code, { headers: { Upgrade: 'websocket' } }), env);
  if (res.status !== 101) throw new Error('join did not upgrade: ' + res.status);
  const inst = doOf(code);
  return wrapConn(inst, inst.pending[inst.pending.length - 1]);
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
  return { code, hostToken, host, P };
}
const bySeat = (rev) => Object.fromEntries(rev.results.map((r) => [r.seat, r]));

// ================= The scripted show (3 seats; seat 2 never answers) =================
const R = await setupRoom(3);
const reclaim0 = R.P[0].last('welcome').reclaimToken;
const reclaim1 = R.P[1].last('welcome').reclaimToken;

// -- Q1: normal, Movies, 200. Seat 0 correct at +2000 (banks 150 + 50 qd = 200) --
await R.host.send({
  t: 'publish_question', qid: 'q1', round: 1, kind: 'normal', category: 'Movies',
  deadlineMs: 20000, baseValue: 200, multiplier: 1, correctIdx: 0, answersCount: 4,
});
T += 2000; await R.P[0].send({ t: 'answer', qid: 'q1', pick: 0 });
T += 1000; await R.P[1].send({ t: 'answer', qid: 'q1', pick: 1 }); // wrong
T += 7000; await R.host.send({ t: 'reveal', qid: 'q1' }); // elapsed 10000 -> value 150
{
  const bs = bySeat(R.P[0].last('reveal'));
  ok(bs[0].banked === 200 && bs[1].banked === 0,
    'Q1 settles as scripted (seat 0 banks 150 drained + 50 quick-draw = 200)',
    JSON.stringify(bs));
  const st = R.P[0].lastState();
  ok('report' in st && st.report === null,
    'Q1: a mid-show snapshot carries report null — the card is never dealt early');
}

// -- Q2: normal, Movies, 200. Seat 1 correct at +1000 (qd), seat 0 correct at +3000 --
await R.host.send({
  t: 'publish_question', qid: 'q2', round: 1, kind: 'normal', category: 'Movies',
  deadlineMs: 20000, baseValue: 200, multiplier: 1, correctIdx: 0, answersCount: 4,
});
T += 1000; await R.P[1].send({ t: 'answer', qid: 'q2', pick: 0 });
T += 2000; await R.P[0].send({ t: 'answer', qid: 'q2', pick: 0 });
T += 2000; await R.host.send({ t: 'reveal', qid: 'q2' }); // elapsed 5000 -> raw 175, settled 180 (nearest $10; finding #9 re-pin, 2026-11-16)
{
  const bs = bySeat(R.P[0].last('reveal'));
  ok(bs[1].banked === 230 && bs[0].banked === 180,
    'Q2 settles as scripted (seat 1 banks 180 + 50 quick-draw = 230; seat 0 banks 180, streak 2)',
    JSON.stringify(bs));
}

// -- Q3: normal, TV, 200, GOLDEN (multiplier doubles, window halves to 10000) --
await R.host.send({
  t: 'publish_question', qid: 'q3', round: 1, kind: 'normal', category: 'TV',
  deadlineMs: 20000, baseValue: 200, multiplier: 1, correctIdx: 0, answersCount: 4, golden: true,
});
T += 1500; await R.P[0].send({ t: 'answer', qid: 'q3', pick: 0 }); // seat 1 silent
T += 8499; await R.host.send({ t: 'reveal', qid: 'q3' }); // elapsed 9999 of 10000 -> value 200
{
  const bs = bySeat(R.P[0].last('reveal'));
  ok(bs[0].banked === 275,
    'Q3 settles as scripted (the doubled bank: 200 + 50 quick-draw + 25 streak-at-3 = 275)',
    JSON.stringify(bs));
}

// -- Q4: num, Music, 100, truth 500. Seat 1 closest (480 at +4000), seat 0 far (900 at +2000) --
await R.host.send({
  t: 'publish_question', qid: 'q4', round: 1, kind: 'num', category: 'Music',
  deadlineMs: 30000, baseValue: 100, multiplier: 1, trueNum: 500,
});
T += 2000; await R.P[0].send({ t: 'answer', qid: 'q4', num: 900 });
T += 2000; await R.P[1].send({ t: 'answer', qid: 'q4', num: 480 });
T += 11000; await R.host.send({ t: 'reveal', qid: 'q4' }); // elapsed 15000 -> raw 75, settled 80
{
  const bs = bySeat(R.P[0].last('reveal'));
  ok(bs[1].banked === 80 && bs[0].banked === 0 && bs[1].lockMs === null,
    'Q4 settles as scripted (seat 1 banks the guess 80; its result lockMs stays null by design)',
    JSON.stringify(bs));
}

// -- Q5: survey, Ads & Jingles, 100. Seat 1 correct at +1200, seat 0 wrong --
await R.host.send({
  t: 'publish_question', qid: 'q5', round: 1, kind: 'survey', category: 'Ads & Jingles',
  deadlineMs: 20000, baseValue: 100, multiplier: 1, correctIdx: 2, answersCount: 4,
});
T += 1200; await R.P[1].send({ t: 'answer', qid: 'q5', pick: 2 });
T += 300; await R.P[0].send({ t: 'answer', qid: 'q5', pick: 0 }); // wrong
T += 500; await R.host.send({ t: 'reveal', qid: 'q5' }); // elapsed 2000 -> raw 95, settled 100
{
  const bs = bySeat(R.P[0].last('reveal'));
  ok(bs[1].banked === 100 && bs[0].banked === 0,
    'Q5 settles as scripted (seat 1 banks the survey 100 — no quick-draw on a guess kind)',
    JSON.stringify(bs));
}

// ================= The room is evicted and rebuilt — the tallies ride the record =================
const oldInst = doOf(R.code);
const sharedMap = oldInst.ctx._map;
const inst2 = new worker.GildedRoom(makeCtx(sharedMap, []), env);
await new Promise((r) => setTimeout(r, 20)); // blockConcurrencyWhile settles
ok(inst2.room && inst2.room.code === R.code, 'REBUILD: the room reloads from its persisted record');
const host2 = await connectTo(inst2, R.code);
await host2.send({ t: 'hello', role: 'host', hostToken: R.hostToken });
const P1b = await connectTo(inst2, R.code);
await P1b.send({ t: 'hello', role: 'player', reclaimToken: reclaim1 });
ok(P1b.last('welcome') && P1b.last('welcome').seat === 1, 'REBUILD: seat 1 reclaims its seat on the rebuilt room');
const P0b = await connectTo(inst2, R.code);
await P0b.send({ t: 'hello', role: 'player', reclaimToken: reclaim0 });
ok(P0b.last('welcome') && P0b.last('welcome').seat === 0, 'REBUILD: seat 0 reclaims its seat on the rebuilt room');

// -- Q6 (post-rebuild): normal, TV, 100. Seat 1 correct at +1000 (banks 100 + 50 qd = 150) --
await host2.send({
  t: 'publish_question', qid: 'q6', round: 1, kind: 'normal', category: 'TV',
  deadlineMs: 20000, baseValue: 100, multiplier: 1, correctIdx: 0, answersCount: 4,
});
T += 1000; await P1b.send({ t: 'answer', qid: 'q6', pick: 0 });
T += 1000; await host2.send({ t: 'reveal', qid: 'q6' }); // elapsed 2000 -> raw 95, settled 100
{
  const bs = bySeat(P1b.last('reveal'));
  ok(bs[1].banked === 150, 'Q6 settles as scripted on the rebuilt room (100 + 50 quick-draw = 150)',
    JSON.stringify(bs));
}

// -- The Decider: seat 0 closest — it must touch NONE of the four facts --
await host2.send({
  t: 'publish_question', qid: 'd1', round: 3, kind: 'num', category: 'Movies',
  deadlineMs: 30000, baseValue: 200, multiplier: 1, trueNum: 42, decider: true, eligible: [0, 1],
});
await P0b.send({ t: 'answer', qid: 'd1', num: 40 }); // closest by 2
await P1b.send({ t: 'answer', qid: 'd1', num: 90 });
await host2.send({ t: 'reveal', qid: 'd1' });
{
  const rev = P1b.last('reveal');
  ok(rev.decider === true && rev.deciderWinner === 0,
    'DECIDER: resolves for seat 0 as scripted', JSON.stringify({ dw: rev.deciderWinner }));
}

// ================= The finale: the card is dealt =================
await host2.send({ t: 'end_show' });
{
  const ended = P1b.last('ended');
  const rep = ended && ended.report;
  ok(!!rep, 'FIN: the ended broadcast carries the report card');
  ok(eq(rep && rep[0], { best: { cat: 'Movies', amt: 380 }, fastestMs: 1500, biggest: 275, peak: 3 }),
    'FIN: seat 0 — best Movies $380 (200+180), biggest the doubled 275, fastest hand 1.5s (Q3), peak streak 3',
    JSON.stringify(rep && rep[0]));
  ok(eq(rep && rep[1], { best: { cat: 'Movies', amt: 230 }, fastestMs: 1000, biggest: 230, peak: 1 }),
    'FIN: seat 1 — best Movies $230, biggest 230, fastest hand 1.0s (Q2, ahead of its 4.0s number and 1.2s survey), peak streak 1',
    JSON.stringify(rep && rep[1]));
  ok(eq(rep && rep[2], { best: null, fastestMs: null, biggest: 0, peak: 0 }),
    'FIN: seat 2 never answered — a blank card, every fact unrecorded rather than invented',
    JSON.stringify(rep && rep[2]));
  ok(rep && rep[3] === null, 'FIN: the empty fourth seat reads null, not a card');
  const st = P1b.lastState();
  ok(st.phase === 'ended' && eq(st.report, rep),
    'FIN: the ended snapshot carries the identical card — a resync at the finale reads the same facts');
}

// -- new_show blanks the card --
await host2.send({ t: 'new_show' });
await host2.send({ t: 'end_show' });
{
  const rep = P1b.last('ended').report;
  ok(eq(rep[0], { best: null, fastestMs: null, biggest: 0, peak: 0 })
    && eq(rep[1], { best: null, fastestMs: null, biggest: 0, peak: 0 }),
    'REMATCH: a fresh show starts a blank card — no fact survives new_show',
    JSON.stringify(rep));
}

// ================= reportFor: the derivation itself =================
{
  const mk = (cats) => ({ players: [{ name: 'X' }], stats: [{ cats, fastestMs: 500, biggest: 200, peak: 2 }] });
  ok(reportFor(mk({ TV: { amt: 200, n: 1, first: 1 }, Music: { amt: 200, n: 2, first: 3 } }))[0].best.cat === 'Music',
    'TIE: equal money breaks to more banks (Music 2 over TV 1)');
  ok(reportFor(mk({ TV: { amt: 200, n: 2, first: 5 }, Music: { amt: 200, n: 2, first: 2 } }))[0].best.cat === 'Music',
    'TIE: equal money and banks break to the earliest first bank (Music at q2 over TV at q5)');
  ok(reportFor(mk({ TV: { amt: 300, n: 1, first: 9 }, Music: { amt: 200, n: 4, first: 1 } }))[0].best.cat === 'TV',
    'TIE: more money outranks everything (TV 300 over Music 200)');
  ok(reportFor(mk({ TV: { amt: 0, n: 0, first: 0 } }))[0].best === null,
    'TIE: a category with no money banked in it is never a best');
  ok(eq(reportFor({ players: [{ name: 'X' }], stats: undefined })[0], { best: null, fastestMs: null, biggest: 0, peak: 0 }),
    'LEGACY: a room persisted before the card existed reads blank, never broken');
}

console.log('test-report: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
