/* The Quick-Draw (Design pass 3) — server receipt order decides the
 * flat $50: the first CORRECT answer by receipt, where receipt order
 * is the order of the picks the players stand on (a changed pick
 * re-queues). Same simulated Durable Object harness as the sibling
 * suites, in its own file so their check counts stay exactly as they
 * were. Proves: pass-down past a wrong first locker; nobody correct
 * pays nothing; a pick changed away from correct forfeits the spot
 * and a pick changed into correct late does not steal it; a forged
 * quick-draw claim (in a publish, in an answer, as its own message)
 * is never read; survey and num questions never quick-draw; a
 * 1-chip Big Finish bet still gets exactly bet x $100 + $50; a Cut
 * Two spender can win it; pickOrder never leaks into player traffic.
 * Run: node test/test-quickdraw.js */
import * as worker from '../server.js';
import { setNowProvider, QUICK_DRAW_BONUS } from '../room.js';

let T = 1_700_000_900_000;
setNowProvider(() => T);

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name, detail || ''); }
}
ok(QUICK_DRAW_BONUS === 50, 'unit: the quick-draw bonus is a flat $50');

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

/* Publish a plain Round 1 'normal' question: baseValue 200, x1,
 * 20s window, correctIdx 1 (so pick 1 is right, pick 0 is wrong). */
async function pubNormal(host, qid, extra) {
  await host.send(Object.assign({
    t: 'publish_question', qid, round: 1, kind: 'normal', category: 'Movies',
    deadlineMs: 20000, baseValue: 200, multiplier: 1, correctIdx: 1, answersCount: 4,
  }, extra || {}));
}

const A = await setupRoom(3);

// ---- A1: first locker wrong -> the bonus passes to the first correct
await pubNormal(A.host, 'a1');
await A.P[1].send({ t: 'answer', qid: 'a1', pick: 0 }); // wrong, first
T += 1000;
await A.P[2].send({ t: 'answer', qid: 'a1', pick: 1 }); // correct, second
T += 1000;
await A.P[0].send({ t: 'answer', qid: 'a1', pick: 1 }); // correct, third
await A.host.send({ t: 'reveal', qid: 'a1' });
{
  // elapsed 2000 of 20000 -> drain factor 0.95 -> value 190
  const rev = A.P[0].last('reveal');
  const b = bySeat(rev);
  ok(rev.value === 190 && rev.quickDrawSeat === 2,
    'A1: reveal names seat 2 the quick-draw winner (first correct receipt; seat 1 locked first but wrong)',
    JSON.stringify({ value: rev.value, qd: rev.quickDrawSeat }));
  ok(b[2].banked === 240 && b[2].quickDraw === true && b[0].banked === 190 && !b[0].quickDraw && b[1].banked === 0,
    'A1: banked = drained 190 for correct seats, +50 only on the winner (240); the flag rides the winner entry alone',
    JSON.stringify(rev.results));
  ok(rev.scores[2] === 240 && rev.scores[0] === 190 && rev.scores[1] === 0,
    'A1: server scores carry the bonus');
  ok(A.P[0].lastState().lastReveal.quickDrawSeat === 2,
    'A1: lastReveal remembers the quick-draw winner for resyncs');
  ok(!A.P[0].text().includes('"pickOrder"') && !A.P[1].text().includes('"pickOrder"'),
    'A1: the receipt order itself never leaks into player traffic');
}

// ---- A2: nobody correct -> no quick-draw, no $50 anywhere
await pubNormal(A.host, 'a2');
await A.P[0].send({ t: 'answer', qid: 'a2', pick: 0 });
await A.P[1].send({ t: 'answer', qid: 'a2', pick: 2 });
await A.host.send({ t: 'reveal', qid: 'a2' });
{
  const rev = A.P[0].last('reveal');
  ok(rev.quickDrawSeat === null && rev.results.every((r) => r.banked === 0 && !r.quickDraw),
    'A2: an all-miss question has no quick-draw and banks nothing', JSON.stringify(rev.results));
}

// ---- A3: changing AWAY from correct forfeits the early spot
await pubNormal(A.host, 'a3');
await A.P[0].send({ t: 'answer', qid: 'a3', pick: 1 }); // correct, first
T += 1000;
await A.P[1].send({ t: 'answer', qid: 'a3', pick: 1 }); // correct, second
T += 1000;
await A.P[0].send({ t: 'answer', qid: 'a3', pick: 0 }); // seat 0 changes to WRONG (re-queues, and is wrong anyway)
await A.host.send({ t: 'reveal', qid: 'a3' });
{
  const rev = A.P[0].last('reveal');
  const b = bySeat(rev);
  ok(rev.quickDrawSeat === 1 && b[1].banked === 240 && b[0].correct === false && b[0].banked === 0,
    'A3: seat 0 changed away — seat 1 (the only correct) takes the quick-draw at drained 190 + 50',
    JSON.stringify(rev.results));
}

// ---- A4: changing INTO correct late does not steal an earlier lock
await pubNormal(A.host, 'a4');
await A.P[1].send({ t: 'answer', qid: 'a4', pick: 1 }); // correct, first
T += 1000;
await A.P[0].send({ t: 'answer', qid: 'a4', pick: 0 }); // wrong
T += 1000;
await A.P[0].send({ t: 'answer', qid: 'a4', pick: 1 }); // changes to correct — but stamped at the change
await A.host.send({ t: 'reveal', qid: 'a4' });
{
  const rev = A.P[0].last('reveal');
  const b = bySeat(rev);
  ok(rev.quickDrawSeat === 1 && b[1].banked === 240 && b[0].banked === 190,
    'A4: the late change into correct banks the plain 190; the early lock keeps the quick-draw',
    JSON.stringify(rev.results));
}

// ---- A5: forged claims are never read
await pubNormal(A.host, 'a5', { quickDrawSeat: 0, quickDraw: 0 }); // host forges in the publish
await A.P[2].send({ t: 'answer', qid: 'a5', pick: 1, quickDraw: true }); // player forges on a (genuinely first, correct) answer
await A.P[0].send({ t: 'answer', qid: 'a5', pick: 1 });
await A.P[1].send({ t: 'quickdraw', seat: 1 }); // a claim as its own message
ok(/Unknown message/.test((A.P[1].lastError() || {}).msg || ''),
  'A5: a standalone quick-draw claim is not a message the room speaks');
await A.host.send({ t: 'reveal', qid: 'a5' });
{
  const rev = A.P[0].last('reveal');
  ok(rev.quickDrawSeat === 2,
    'A5: the winner is the server-computed seat 2 — the forged publish claim (seat 0) changed nothing',
    JSON.stringify({ qd: rev.quickDrawSeat }));
}

// ---- A6: a Cut Two spender can still win it
await pubNormal(A.host, 'a6', { cutIndices: [0, 2] });
await A.P[0].send({ t: 'cuttwo', qid: 'a6' });
await A.P[0].send({ t: 'answer', qid: 'a6', pick: 1 }); // correct, first
await A.P[1].send({ t: 'answer', qid: 'a6', pick: 1 }); // correct, second
await A.host.send({ t: 'reveal', qid: 'a6' });
{
  const rev = A.P[0].last('reveal');
  const b = bySeat(rev);
  /* Hot Streaks adjustment: seat 0's a6 bank is their third straight
   * (a4, a5, a6 — the a7/a8 guess kinds in between are neutral), so
   * the entry carries a flat $25 streak bonus on top of the drained
   * 200 + $50 quick-draw: 275 against seat 1's plain 200. The margin
   * over seat 1 is now $75, of which exactly $50 is the quick-draw. */
  ok(rev.quickDrawSeat === 0 && b[0].banked === 275 && b[0].streakBonus === 25 && b[1].banked === 200,
    'A6: the Cut Two spender wins the quick-draw — their lock time is their lock time (275 = 200 + 50 quick-draw + 25 streak)',
    JSON.stringify(rev.results));
}

// ---- A7: survey never quick-draws (a guess kind, pick + correctIdx)
await A.host.send({
  t: 'publish_question', qid: 'a7', round: 2, kind: 'survey', category: 'TV',
  deadlineMs: 20000, baseValue: 200, multiplier: 2, correctIdx: 0, answersCount: 4,
});
await A.P[0].send({ t: 'answer', qid: 'a7', pick: 0 }); // correct, first
await A.P[1].send({ t: 'answer', qid: 'a7', pick: 0 }); // correct, second
await A.host.send({ t: 'reveal', qid: 'a7' });
{
  const rev = A.P[0].last('reveal');
  const b = bySeat(rev);
  ok(rev.quickDrawSeat === null && b[0].banked === 400 && b[1].banked === 400 && !b[0].quickDraw,
    'A7: survey pays both correct seats the plain doubled value — no quick-draw on a guess kind',
    JSON.stringify(rev.results));
}

// ---- A8: num never quick-draws
await A.host.send({
  t: 'publish_question', qid: 'a8', round: 1, kind: 'num', category: 'TV',
  deadlineMs: 30000, baseValue: 100, trueNum: 100,
});
await A.P[0].send({ t: 'answer', qid: 'a8', num: 100 }); // exact, first
await A.P[1].send({ t: 'answer', qid: 'a8', num: 90 });
await A.host.send({ t: 'reveal', qid: 'a8' });
{
  const rev = A.P[0].last('reveal');
  const b = bySeat(rev);
  ok(rev.quickDrawSeat === null && b[0].banked === 100 && !b[0].quickDraw,
    'A8: an exact number banks the plain value — closeness has no quick-draw',
    JSON.stringify(rev.results));
}

// ---- A9: Big Finish — a 1-chip bet gets exactly bet x $100 + $50
await A.host.send({ t: 'bet_phase', qid: 'a9' });
await A.P[0].send({ t: 'bet', qid: 'a9', chips: 1 });
await A.host.send({
  t: 'publish_question', qid: 'a9', round: 3, kind: 'normal', category: 'Movies',
  deadlineMs: 20000, baseValue: 100, correctIdx: 1, answersCount: 4,
});
await A.P[1].send({ t: 'answer', qid: 'a9', pick: 0 }); // wrong, first
await A.P[0].send({ t: 'answer', qid: 'a9', pick: 1 }); // correct — the 1-chip bettor
await A.host.send({ t: 'reveal', qid: 'a9' });
T += 3100; /* Pass 14: the Big Finish reveal holds its breath — run it out */
await A.P[0].send({ t: 'ping' });
{
  const rev = A.P[0].last('reveal');
  const b = bySeat(rev);
  /* Hot Streaks adjustment: this bank is seat 0's fourth straight
   * (a4, a5, a6, a9 — survey a7 and num a8 are neutral), so the flat
   * $75 streak bonus rides too: 100 + 150 + 75 = 325, none of it
   * bet-scaled. */
  ok(rev.quickDrawSeat === 0 && b[0].banked === 325 && b[0].streakBonus === 75,
    'A9: the bonuses ride beside the bet at the round\u2019s figures — 1 chip pays exactly $100 + $150 quick-draw + $75 streak, never bet-scaled',
    JSON.stringify(rev.results));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
