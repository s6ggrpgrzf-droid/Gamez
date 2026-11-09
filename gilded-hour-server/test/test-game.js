/* Simulates the Cloudflare Durable Object runtime for server.js:
 * fake WebSocketPair, ctx.storage, and the worker fetch handler —
 * the same approach as the Dominoes server's test-do.js — and drives
 * a full scripted show through it: host + 3 players, a normal question,
 * a closest-number question, Cut Two, the finale bet phase, an
 * auto-close at the deadline, and a disconnect + seat reclaim.
 * A fake clock (room.js setNowProvider) makes the drain deterministic.
 * Run: node test/test-game.js */
import * as worker from '../server.js';
import { setNowProvider } from '../room.js';

let T = 1_700_000_000_000;
setNowProvider(() => T);

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name, detail || ''); }
}

// ---- fakes ----
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
          catch (e) {
            // Node's undici rejects status 101; Cloudflare accepts it
            // (documented WebSocket-upgrade pattern). The DO already
            // did its work above.
            if (e instanceof RangeError) return { status: 101 };
            throw e;
          }
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
    async sendRaw(raw) { await inst.webSocketMessage(serverWs, raw); c.pump(); },
    msgs(type) { c.pump(); return hist.filter((m) => m.t === type); },
    last(type) { const a = c.msgs(type); return a[a.length - 1]; },
    states() { return c.msgs('state').map((m) => m.state); },
    lastState() { const s = c.states(); return s[s.length - 1]; },
    errors() { return c.msgs('error'); },
    lastError() { const e = c.errors(); return e[e.length - 1]; },
    text() { c.pump(); return JSON.stringify(hist); },
    mark() { c.pump(); return hist.length; },
    textSince(mark) { c.pump(); return JSON.stringify(hist.slice(mark)); },
  };
  return c;
}

async function createRoom() {
  const r = await worker.default.fetch(new Request('http://x/room', { method: 'POST' }), env);
  return { status: r.status, headers: r.headers, body: await r.json() };
}

// ---- health + create ----
{
  const h = await worker.default.fetch(new Request('http://x/health'), env);
  ok(h.status === 200 && (await h.text()) === 'gilded-hour-rooms ok', 'GET /health answers ok');
}
const created = await createRoom();
const { code, hostToken } = created.body;
ok(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/.test(code), 'POST /room returns an unambiguous 4-letter code', code);
ok(/^[0-9a-f]{32}$/.test(hostToken), 'POST /room returns a host token');
ok(created.headers.get('access-control-allow-origin') === '*', 'CORS header on POST /room');

// ---- host auth ----
const host = await connect(code);
await host.send({ t: 'hello', role: 'host', hostToken: 'wrong-token' });
ok(/host token/i.test((host.lastError() || {}).msg || ''), 'host hello with wrong token rejected');
await host.send({ t: 'hello', role: 'host', hostToken });
ok((host.last('welcome') || {}).role === 'host', 'host hello with correct token welcomed');

// ---- player cap, in a side room ----
{
  const r2 = await createRoom();
  const cs = [];
  for (let i = 0; i < 4; i++) {
    const c = await connect(r2.body.code);
    await c.send({ t: 'hello', role: 'player', name: 'P' + i });
    cs.push(c);
  }
  ok(cs.every((c, i) => (c.last('welcome') || {}).seat === i), 'side room fills seats 0..3');
  const fifth = await connect(r2.body.code);
  await fifth.send({ t: 'hello', role: 'player', name: 'Extra' });
  ok(/full/i.test((fifth.lastError() || {}).msg || ''), 'fifth player rejected: room is full');
}

// ---- oversized message is refused, socket survives ----
{
  const c = await connect(code);
  await c.sendRaw('x'.repeat(5000));
  ok(/too large/i.test((c.lastError() || {}).msg || ''), 'oversized message refused');
}

// ---- three players join the main room ----
const names = ['Ann', 'Bob', 'Cid'];
const P = [];
for (let i = 0; i < 3; i++) {
  const c = await connect(code);
  await c.send({ t: 'hello', role: 'player', name: names[i] });
  P.push(c);
}
ok(P.every((c, i) => (c.last('welcome') || {}).seat === i), 'players welcomed into seats 0, 1, 2');
const tokens = P.map((c) => c.last('welcome').reclaimToken);
ok(tokens.every((t) => /^[0-9a-f]{32}$/.test(t)) && new Set(tokens).size === 3,
  'each player gets a distinct reclaim token, in their welcome only');
{
  const st = host.lastState();
  ok(st && st.players.filter(Boolean).length === 3
    && st.players[0].name === 'Ann' && st.players[2].name === 'Cid',
    'host snapshot lists the three players');
  ok(!host.text().includes(tokens[0]) && !host.text().includes(tokens[1]),
    'host never receives a player reclaim token');
  ok(!P[0].text().includes(tokens[1]) && !P[0].text().includes(tokens[2]),
    'a player never receives another player\u2019s reclaim token');
}

// ---- Q1: normal question, drained value at half the window ----
await host.send({
  t: 'publish_question', qid: 'q1', round: 1, kind: 'normal', category: 'Movies',
  deadlineMs: 20000, baseValue: 100, multiplier: 1, correctIdx: 2, cutIndices: [0, 3], answersCount: 4,
});
{
  const st = P[0].lastState();
  ok(st.phase === 'answer' && st.question.qid === 'q1', 'Q1 opens for players');
  ok(st.question.openedAt === T && st.question.deadline === T + 20000,
    'server stamps the window on its own clock');
  ok(!('correctIdx' in st.question) && !('trueNum' in st.question),
    'player snapshot hides correctIdx/trueNum');
  ok(host.lastState().question.correctIdx === 2, 'host snapshot carries its own secret for resync');
}
await P[0].send({ t: 'answer', qid: 'q1', pick: 2 }); // correct
ok((P[2].last('counts') || {}).answersIn === 1, 'counts broadcast: 1 answer in');
await P[1].send({ t: 'answer', qid: 'q1', pick: 0 }); // wrong
ok((P[0].last('counts') || {}).answersIn === 2, 'counts broadcast: 2 answers in');
await P[2].send({ t: 'answer', qid: 'q1', pick: 1 }); // wrong
ok((P[1].last('counts') || {}).answersIn === 3, 'counts broadcast: 3 answers in');
{
  // Secrecy: nothing in any player's traffic so far reveals a pick or the key.
  for (let i = 0; i < 3; i++) {
    const txt = P[i].text();
    ok(!txt.includes('"correctIdx"') && !txt.includes('"picks"') && !txt.includes('"nums"'),
      'player ' + i + ' traffic leaks no key and no picks object');
  }
  ok(!P[0].text().includes('"yourPick":0') && !P[0].text().includes('"yourPick":1'),
    'player 0 sees only their own pick');
  ok(!P[1].text().includes('"yourPick":2'), 'player 1 never sees player 0\u2019s pick');
}
T += 10000; // half the 20s window elapses -> drain factor 0.75
await host.send({ t: 'reveal', qid: 'q1' });
{
  const rev = P[1].last('reveal');
  ok(rev && rev.value === 75, 'reveal banks the as-stopped drained value ($75 at half-window)', rev && rev.value);
  const bySeat = Object.fromEntries(rev.results.map((r) => [r.seat, r]));
  ok(bySeat[0].correct && bySeat[0].banked === 75 && bySeat[0].pick === 2,
    'correct player banks $75; picks are public at reveal');
  ok(!bySeat[1].correct && bySeat[1].banked === 0 && !bySeat[2].correct && bySeat[2].banked === 0,
    'wrong players bank $0');
  ok(rev.scores[0] === 75 && rev.scores[1] === 0 && rev.scores[2] === 0, 'scores updated server-side');
}
await P[1].send({ t: 'answer', qid: 'q1', pick: 2 });
ok(/open question/i.test((P[1].lastError() || {}).msg || ''), 'answer after reveal rejected');

// ---- Q2: closest number ----
await host.send({
  t: 'publish_question', qid: 'q2', round: 1, kind: 'num', category: 'TV',
  deadlineMs: 30000, baseValue: 100, trueNum: 236,
});
await P[0].send({ t: 'answer', qid: 'q2', num: 200 });
await P[1].send({ t: 'answer', qid: 'q2', num: 240 });
await P[2].send({ t: 'answer', qid: 'q2', num: 100 });
ok((P[0].last('counts') || {}).answersIn === 3, 'num answers counted');
await host.send({ t: 'reveal', qid: 'q2' });
{
  const rev = P[0].last('reveal');
  const bySeat = Object.fromEntries(rev.results.map((r) => [r.seat, r]));
  ok(rev.trueNum === 236 && rev.value === 100, 'num reveal shows the true number, full value at elapsed 0');
  ok(bySeat[1].correct && bySeat[1].banked === 100 && bySeat[1].num === 240,
    'closest number (240 vs 236) banks');
  ok(!bySeat[0].correct && bySeat[0].banked === 0 && !bySeat[2].correct,
    'further numbers bank nothing');
  ok(rev.scores[1] === 100, 'scores: [75, 100, 0]');
}

// ---- Q3: Cut Two spends the token; one cut per question ----
await host.send({
  t: 'publish_question', qid: 'q3', round: 2, kind: 'normal', category: 'Music',
  deadlineMs: 20000, baseValue: 100, multiplier: 2, correctIdx: 1, cutIndices: [0, 2], answersCount: 4,
});
await P[0].send({ t: 'cuttwo', qid: 'q3' });
{
  const cut = P[2].last('cut');
  ok(cut && cut.bySeat === 0 && JSON.stringify(cut.indices) === '[0,2]',
    'Cut Two broadcast with the two removed indices');
  ok(P[0].lastState().players[0].cutTwo === false, 'the caller\u2019s token is spent');
}
await P[1].send({ t: 'cuttwo', qid: 'q3' });
ok(/already cut/i.test((P[1].lastError() || {}).msg || ''), 'second cut on the same question rejected');
await P[0].send({ t: 'answer', qid: 'q3', pick: 1 });
await P[1].send({ t: 'answer', qid: 'q3', pick: 3 });
await P[2].send({ t: 'answer', qid: 'q3', pick: 1 });
await host.send({ t: 'reveal', qid: 'q3' });
{
  const rev = P[0].last('reveal');
  const bySeat = Object.fromEntries(rev.results.map((r) => [r.seat, r]));
  ok(rev.value === 200, 'round 2 multiplier doubles the value ($200)');
  ok(bySeat[0].banked === 200 && bySeat[2].banked === 200 && bySeat[1].banked === 0,
    'both correct players bank; scores [275, 100, 200]');
  ok(rev.scores[0] === 275 && rev.scores[1] === 100 && rev.scores[2] === 200, 'scores confirmed');
}

// ---- Q4: a spent token stays spent on later questions ----
await host.send({
  t: 'publish_question', qid: 'q4', round: 2, kind: 'normal', category: 'TV',
  deadlineMs: 20000, baseValue: 100, multiplier: 1, correctIdx: 0, cutIndices: [1, 2], answersCount: 4,
});
await P[0].send({ t: 'cuttwo', qid: 'q4' });
ok(/spent/i.test((P[0].lastError() || {}).msg || ''), 'Cut Two from a spent token rejected on a new question');
await P[1].send({ t: 'cuttwo', qid: 'q4' });
ok((P[2].last('cut') || {}).bySeat === 1, 'another player\u2019s fresh token still cuts');
for (let i = 0; i < 3; i++) await P[i].send({ t: 'answer', qid: 'q4', pick: 0 });
await host.send({ t: 'reveal', qid: 'q4' });
{
  const rev = P[0].last('reveal');
  ok(rev.scores[0] === 375 && rev.scores[1] === 200 && rev.scores[2] === 300,
    'clean sweep banks $100 each; scores [375, 200, 300]');
}

// ---- Q5: finale bet phase — secret bets, bet x $100, no losses ----
const betMark1 = P[1].mark();
const betMark0 = P[0].mark();
await host.send({ t: 'bet_phase', qid: 'q5' });
ok(P[0].lastState().phase === 'bet' && P[0].lastState().bet.qid === 'q5', 'bet phase opens');
await P[0].send({ t: 'bet', qid: 'q5', chips: 3 });
ok((P[1].last('counts') || {}).betsIn === 1, 'bet counts broadcast: 1 bet in');
await P[1].send({ t: 'bet', qid: 'q5', chips: 1 });
ok((P[2].last('counts') || {}).betsIn === 2, 'bet counts broadcast: 2 bets in');
{
  const t1 = P[1].textSince(betMark1);
  const t0 = P[0].textSince(betMark0);
  ok(!t1.includes('"chips"') && !t1.includes('"yourBet":3'), 'bets stay secret: player 1 cannot see the 3-chip bet');
  ok(!t0.includes('"yourBet":1'), 'bets stay secret: player 0 cannot see the 1-chip bet');
}
await host.send({
  t: 'publish_question', qid: 'q5', round: 3, kind: 'normal', category: 'Movies',
  deadlineMs: 20000, baseValue: 100, correctIdx: 2, answersCount: 4,
});
ok(P[0].lastState().question.betted === true, 'question carries the bet phase');
await P[0].send({ t: 'answer', qid: 'q5', pick: 2 }); // correct, 3 chips
await P[1].send({ t: 'answer', qid: 'q5', pick: 0 }); // wrong, 1 chip
await P[2].send({ t: 'answer', qid: 'q5', pick: 2 }); // correct, no bet -> default 1
await host.send({ t: 'reveal', qid: 'q5' });
{
  const rev = P[1].last('reveal');
  const bySeat = Object.fromEntries(rev.results.map((r) => [r.seat, r]));
  ok(rev.value === null, 'finale reveal has no drained value');
  ok(bySeat[0].banked === 300, 'correct 3-chip bet banks bet x $100 = $300');
  ok(bySeat[1].banked === 0 && rev.scores[1] === 200, 'wrong bet loses $0 — score untouched');
  ok(bySeat[2].banked === 100, 'missing bet defaults to 1 chip ($100)');
  ok(rev.scores[0] === 675 && rev.scores[2] === 400, 'scores [675, 200, 400]');
}

// ---- Q6: the window auto-closes at the deadline ----
await host.send({
  t: 'publish_question', qid: 'q6', round: 1, kind: 'normal', category: 'TV',
  deadlineMs: 20000, baseValue: 100, multiplier: 1, correctIdx: 0, answersCount: 4,
});
T += 25000; // past the deadline; nobody answered, host never reveals
await P[2].send({ t: 'ping' });
{
  const rev = P[0].last('reveal');
  ok(rev && rev.qid === 'q6' && rev.value === 50,
    'expired window auto-closes: reveal broadcast at the 50% floor');
  ok(rev.scores[0] === 675 && rev.scores[1] === 200 && rev.scores[2] === 400,
    'auto-close banks nothing (no answers), scores unchanged');
  ok((P[2].last('pong') || {}).t === 'pong', 'the triggering message still gets its reply');
}
await P[0].send({ t: 'answer', qid: 'q6', pick: 0 });
ok(P[0].errors().length > 0, 'answer after auto-close rejected');

// ---- malformed input does not crash the room ----
await P[0].sendRaw('this is not json');
await P[0].send({ t: 'ping' });
ok((P[0].last('pong') || {}).t === 'pong', 'malformed message ignored; room still answers ping');

// ---- disconnect + reclaim ----
{
  const inst = doOf(code);
  await inst.webSocketClose(P[1].serverWs);
  inst.ctx._sockets.splice(inst.ctx._sockets.indexOf(P[1].serverWs), 1); // runtime drops it
  ok(P[0].lastState().players[1].connected === false, 'disconnect shows the seat offline');
  const back = await connect(code);
  await back.send({ t: 'hello', role: 'player', reclaimToken: tokens[1] });
  ok((back.last('welcome') || {}).seat === 1, 'reclaim token restores seat 1');
  const st = back.lastState();
  ok(st.players[1].score === 200 && st.players[1].connected === true,
    'reclaimed seat keeps its score');
  P[1] = back;
}
{
  const stranger = await connect(code);
  await stranger.send({ t: 'hello', role: 'player', reclaimToken: 'f'.repeat(32) });
  ok(/not found/i.test((stranger.lastError() || {}).msg || ''), 'bogus reclaim token rejected');
}

// ---- end of show ----
await host.send({ t: 'end_show' });
{
  const ended = P[0].last('ended');
  ok(ended && ended.scores[0] === 675 && ended.scores[1] === 200 && ended.scores[2] === 400,
    'end_show broadcasts final scores [675, 200, 400]');
  ok(P[0].lastState().phase === 'ended', 'room lands in the ended phase');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
