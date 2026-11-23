/* The Table Pot (Dynamics pass D1) — every miss feeds a pot the
 * champion takes, refereed here at close beside the rest of the
 * money. Same simulated Durable Object harness as test-golden.js,
 * in its own suite so their check counts stay exactly as they
 * were. Proves the feeding matrix: a full-miss MCQ feeds the exact
 * drained figure; a partial bank feeds nothing; a guess question
 * nobody answers feeds its settled figure while a banked guess
 * feeds nothing; a Golden full miss feeds the DOUBLED figure (the
 * doubling already lives in the record's multiplier); the Big
 * Finish feeds per-miss bet x $100 at the bet actually placed (a
 * missing bet is the default 1); the Decider feeds nothing; the
 * pot rides every snapshot and every reveal (pot + potFed); no
 * score ever includes it; and a fresh show via new_show starts
 * with an empty pot.
 * Run: node test/test-pot.js */
import * as worker from '../server.js';
import { setNowProvider } from '../room.js';

let T = 1_700_000_500_000;
setNowProvider(() => T);

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name, detail || ''); }
}

// ---- fakes (mirrors test-golden.js) ----
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
const bySeat = (rev) => Object.fromEntries(rev.results.map((r) => [r.seat, r]));

// ================= Room P1: the feeding matrix =================
const R = await setupRoom(2);

// -- 1. a full-miss MCQ feeds the exact drained figure --
await R.host.send({
  t: 'publish_question', qid: 'p1', round: 1, kind: 'normal', category: 'Movies',
  deadlineMs: 20000, baseValue: 200, multiplier: 1, correctIdx: 0, answersCount: 4,
});
ok(R.P[0].lastState().pot === 0, 'P1: a fresh room snapshot carries pot 0');
await R.P[0].send({ t: 'answer', qid: 'p1', pick: 1 }); // wrong
await R.P[1].send({ t: 'answer', qid: 'p1', pick: 2 }); // wrong
T += 10000; // half the window: drain factor 1 - 0.5 x 0.5 = 0.75 -> value 150
await R.host.send({ t: 'reveal', qid: 'p1' });
{
  const rev = R.P[0].last('reveal');
  ok(rev.value === 150 && rev.potFed === 150 && rev.pot === 150,
    'P1: full-miss MCQ feeds the exact drained figure (200 x 0.75 = 150)',
    JSON.stringify({ value: rev.value, potFed: rev.potFed, pot: rev.pot }));
  const st = R.P[1].lastState();
  ok(st.pot === 150 && st.lastReveal.pot === 150 && st.lastReveal.potFed === 150,
    'P1: the pot rides the snapshot and the lastReveal a resync repaints from');
  ok(st.players[0].score === 0 && st.players[1].score === 0,
    'P1: the feed touched no score — both players still stand at $0');
}

// -- 2. a partial bank feeds nothing --
await R.host.send({
  t: 'publish_question', qid: 'p2', round: 1, kind: 'normal', category: 'TV',
  deadlineMs: 20000, baseValue: 200, multiplier: 1, correctIdx: 0, answersCount: 4,
});
await R.P[0].send({ t: 'answer', qid: 'p2', pick: 0 }); // correct at elapsed 0
await R.P[1].send({ t: 'answer', qid: 'p2', pick: 3 }); // wrong
await R.host.send({ t: 'reveal', qid: 'p2' });
{
  const rev = R.P[0].last('reveal');
  ok(rev.potFed === 0 && rev.pot === 150 && bySeat(rev)[0].banked > 0,
    'P2: a partial bank feeds nothing — the pot stands at 150',
    JSON.stringify({ potFed: rev.potFed, pot: rev.pot }));
}

// -- 3. a guess question nobody answers feeds its settled figure --
await R.host.send({
  t: 'publish_question', qid: 'p3', round: 1, kind: 'num', category: 'Music',
  deadlineMs: 30000, baseValue: 100, multiplier: 1, trueNum: 500,
});
T += 15000; // half the window -> 100 x 0.75 = 75, settled to the nearest $10 = 80 (finding #9 re-pin, 2026-11-16)
await R.host.send({ t: 'reveal', qid: 'p3' });
{
  const rev = R.P[0].last('reveal');
  ok(rev.value === 80 && rev.potFed === 80 && rev.pot === 230,
    'P3: an unanswered guess feeds its settled figure (80) — pot 230',
    JSON.stringify({ value: rev.value, potFed: rev.potFed, pot: rev.pot }));
}

// -- 4. a banked guess feeds nothing --
await R.host.send({
  t: 'publish_question', qid: 'p4', round: 1, kind: 'num', category: 'Music',
  deadlineMs: 30000, baseValue: 100, multiplier: 1, trueNum: 500,
});
await R.P[0].send({ t: 'answer', qid: 'p4', num: 480 });
await R.P[1].send({ t: 'answer', qid: 'p4', num: 900 });
await R.host.send({ t: 'reveal', qid: 'p4' });
{
  const rev = R.P[0].last('reveal');
  ok(bySeat(rev)[0].banked > 0 && rev.potFed === 0 && rev.pot === 230,
    'P4: a banked guess feeds nothing — the pot stands at 230',
    JSON.stringify({ potFed: rev.potFed, pot: rev.pot }));
}

// -- 5. a Golden full miss feeds the DOUBLED figure --
await R.host.send({
  t: 'publish_question', qid: 'p5', round: 1, kind: 'normal', category: 'Movies',
  deadlineMs: 20000, baseValue: 200, multiplier: 1, correctIdx: 0, answersCount: 4, golden: true,
});
await R.P[0].send({ t: 'answer', qid: 'p5', pick: 1 }); // wrong
await R.P[1].send({ t: 'answer', qid: 'p5', pick: 2 }); // wrong
T += 5000; // half of the HALVED window (10000): 200 x 2 x 0.75 = 300
await R.host.send({ t: 'reveal', qid: 'p5' });
{
  const rev = R.P[0].last('reveal');
  ok(rev.golden === true && rev.value === 300 && rev.potFed === 300 && rev.pot === 530,
    'P5: a Golden full miss feeds the doubled drained figure (300) — pot 530',
    JSON.stringify({ value: rev.value, potFed: rev.potFed, pot: rev.pot }));
}

// -- 6. the Big Finish feeds per-miss bet x $100 --
await R.host.send({ t: 'bet_phase', qid: 'bf1' });
await R.P[0].send({ t: 'bet', qid: 'bf1', chips: 3 });
await R.P[1].send({ t: 'bet', qid: 'bf1', chips: 2 });
await R.host.send({
  t: 'publish_question', qid: 'bf1', round: 3, kind: 'normal', category: 'TV',
  deadlineMs: 20000, baseValue: 300, multiplier: 1, correctIdx: 0, answersCount: 4,
});
await R.P[0].send({ t: 'answer', qid: 'bf1', pick: 0 }); // correct — banks 300
await R.P[1].send({ t: 'answer', qid: 'bf1', pick: 1 }); // wrong — feeds 2 x 100
await R.host.send({ t: 'reveal', qid: 'bf1' });
T += 3100; /* Pass 14: the finale reveal holds its breath — run it out */
await R.P[0].send({ t: 'ping' });
{
  const rev = R.P[0].last('reveal');
  const bs = bySeat(rev);
  ok(bs[0].banked >= 300 && bs[1].banked === 0 && rev.potFed === 200 && rev.pot === 730,
    'BF1: the hitter feeds nothing; the misser feeds their bet x $100 (2 x 100 = 200) — pot 730',
    JSON.stringify({ potFed: rev.potFed, pot: rev.pot, bs }));
}
// a second Big Finish question: nobody bets (default 1), both miss
await R.host.send({ t: 'bet_phase', qid: 'bf2' });
await R.host.send({
  t: 'publish_question', qid: 'bf2', round: 3, kind: 'normal', category: 'TV',
  deadlineMs: 20000, baseValue: 300, multiplier: 1, correctIdx: 0, answersCount: 4,
});
await R.P[0].send({ t: 'answer', qid: 'bf2', pick: 2 }); // wrong
await R.P[1].send({ t: 'answer', qid: 'bf2', pick: 3 }); // wrong
await R.host.send({ t: 'reveal', qid: 'bf2' });
T += 3100; /* Pass 14: the held breath runs out */
await R.P[0].send({ t: 'ping' });
{
  const rev = R.P[0].last('reveal');
  ok(rev.potFed === 200 && rev.pot === 930,
    'BF2: two default-bet misses feed 1 x $100 apiece (200) — pot 930',
    JSON.stringify({ potFed: rev.potFed, pot: rev.pot }));
}

// -- 7. the Decider feeds nothing --
await R.host.send({
  t: 'publish_question', qid: 'd1', round: 3, kind: 'num', category: 'Movies',
  deadlineMs: 30000, baseValue: 200, multiplier: 1, trueNum: 42, decider: true, eligible: [0, 1],
});
await R.P[0].send({ t: 'answer', qid: 'd1', num: 40 });
await R.P[1].send({ t: 'answer', qid: 'd1', num: 90 });
await R.host.send({ t: 'reveal', qid: 'd1' });
{
  const rev = R.P[0].last('reveal');
  ok(rev.decider === true && rev.deciderWinner === 0 && rev.potFed === 0 && rev.pot === 930,
    'D1: the Decider resolves the crown and feeds nothing — pot stands at 930',
    JSON.stringify({ potFed: rev.potFed, pot: rev.pot, dw: rev.deciderWinner }));
}

// -- 8. the finale's money: scores never include the pot --
await R.host.send({ t: 'end_show' });
{
  const ended = R.P[0].last('ended');
  const st = R.P[0].lastState();
  const scoreSum = st.players.reduce((a, p) => a + (p ? p.score : 0), 0);
  ok(ended && ended.scores && ended.scores[0] === st.players[0].score && st.pot === 930 && scoreSum < 930 + scoreSum,
    'FIN: the ended broadcast and the snapshot scores are the raw scores — the pot (930) lives outside them',
    JSON.stringify({ scores: ended && ended.scores, pot: st.pot }));
  ok(st.players.every((p) => !p || !('pot' in p)),
    'FIN: no player record carries a pot field — it is the room\'s, not a seat\'s');
}

// -- 9. a fresh show starts with an empty pot --
await R.host.send({ t: 'new_show' });
{
  const st = R.P[0].lastState();
  ok(st.pot === 0 && st.showSeq === 2 && st.phase === 'lobby',
    'REMATCH: new_show resets the pot to 0 (show 2, back at the lobby)',
    JSON.stringify({ pot: st.pot, showSeq: st.showSeq, phase: st.phase }));
  await R.host.send({
    t: 'publish_question', qid: 'r1', round: 1, kind: 'normal', category: 'TV',
    deadlineMs: 20000, baseValue: 100, multiplier: 1, correctIdx: 0, answersCount: 4,
  });
  await R.P[0].send({ t: 'answer', qid: 'r1', pick: 1 });
  await R.P[1].send({ t: 'answer', qid: 'r1', pick: 1 });
  await R.host.send({ t: 'reveal', qid: 'r1' });
  const rev = R.P[0].last('reveal');
  ok(rev.potFed === 100 && rev.pot === 100,
    'REMATCH: the new show\'s pot feeds from empty — a full miss at full value feeds exactly 100',
    JSON.stringify({ potFed: rev.potFed, pot: rev.pot }));
}

console.log('test-pot: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
