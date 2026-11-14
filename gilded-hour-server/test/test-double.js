/* THE DOUBLE (designer pass 3, 2026-11-13) — the referee's side.
 * One ×2 token per player per show, spendable from Round 2 on an
 * ordinary question: a right answer banks twice the question's
 * value; a miss banks nothing and still spends the token. Proves:
 * the doubled bank and its flag; Quick Draw staying flat on top;
 * the spend landing win or lose; refusals (Round 1, bet question,
 * spent token, double-arm, wrong qid); a doubled closest-number
 * bank; the snapshot carrying dbl + dblArmed; new_show restocking.
 * Same simulated Durable Object harness as the sibling suites.
 * Run: node test/test-double.js */
import * as worker from '../server.js';
import { setNowProvider } from '../room.js';

let T = 1_700_000_900_000;
setNowProvider(() => T);

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name, detail || ''); }
}

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

async function pub(host, qid, extra) {
  await host.send(Object.assign({
    t: 'publish_question', qid, round: 2, kind: 'normal', category: 'Movies',
    deadlineMs: 20000, baseValue: 200, multiplier: 1, correctIdx: 1, answersCount: 4,
  }, extra || {}));
}

const A = await setupRoom(3);

/* players join holding the token */
{
  const st = A.P[0].lastState();
  ok(st.players.filter(Boolean).every((p) => p.dbl === true), 'join: every seat holds the Double', JSON.stringify(st.players));
}

/* ---- Round 1: the Double has not arrived ---- */
await pub(A.host, 'r1', { round: 1 });
await A.P[0].send({ t: 'double', qid: 'r1' });
ok(/Double Money/.test((A.P[0].lastError() || {}).msg || ''), 'R1: a Round 1 double is refused', JSON.stringify(A.P[0].lastError()));
await A.P[0].send({ t: 'answer', qid: 'r1', pick: 1 });
await A.host.send({ t: 'reveal', qid: 'r1' });

/* ---- Round 2: arm, ride, double ---- */
await pub(A.host, 'r2a');
await A.P[1].send({ t: 'answer', qid: 'r2a', pick: 1 });   // Bo correct FIRST (quick draw)
await A.P[0].send({ t: 'double', qid: 'r2a' });            // Ana arms
{
  const st = A.host.lastState();
  ok(st.question && JSON.stringify(st.question.dblArmed) === '[0]', 'R2: the snapshot names the riding seat', JSON.stringify(st.question && st.question.dblArmed));
  ok(st.players[0].dbl === true, 'R2: the token is still in hand until the question settles');
}
await A.P[0].send({ t: 'double', qid: 'r2a' });            // again -> refused
ok(/already riding/.test((A.P[0].lastError() || {}).msg || ''), 'R2: a second arm on the same question is refused', JSON.stringify(A.P[0].lastError()));
await A.P[0].send({ t: 'answer', qid: 'r2a', pick: 1 });   // Ana correct, second
await A.P[2].send({ t: 'answer', qid: 'r2a', pick: 0 });   // Cy wrong
T += 2000;                                                  // 10% elapsed -> value 190
await A.host.send({ t: 'reveal', qid: 'r2a' });
{
  const rev = A.P[0].last('reveal');
  const b = bySeat(rev);
  ok(rev.value === 190, 'R2: the drained value is 190', 'value=' + rev.value);
  ok(b[0].banked === 380 && b[0].doubled === true, 'R2: the riding seat banks exactly twice (380) and wears the flag', JSON.stringify(b[0]));
  ok(b[1].banked === 240 && !b[1].doubled, 'R2: Quick Draw stays flat on the undoubled seat (190 + 50)', JSON.stringify(b[1]));
  ok(b[2].banked === 0, 'R2: the wrong seat banks nothing');
  const st = A.P[0].lastState();
  ok(st.players[0].dbl === false && st.players[1].dbl === true && st.players[2].dbl === true,
    'R2: only the riding token is spent at the settle', JSON.stringify(st.players.map((p) => p && p.dbl)));
}

/* ---- spent is spent; a miss spends it too ---- */
await pub(A.host, 'r2b');
await A.P[0].send({ t: 'double', qid: 'r2b' });
ok(/spent/.test((A.P[0].lastError() || {}).msg || ''), 'spend: a spent token cannot ride again', JSON.stringify(A.P[0].lastError()));
await A.P[1].send({ t: 'double', qid: 'r2b' });            // Bo rides...
await A.P[1].send({ t: 'answer', qid: 'r2b', pick: 0 });   // ...and misses
await A.P[2].send({ t: 'answer', qid: 'r2b', pick: 1 });
await A.host.send({ t: 'reveal', qid: 'r2b' });
{
  const rev = A.P[0].last('reveal');
  const b = bySeat(rev);
  ok(b[1].banked === 0 && !b[1].doubled, 'miss: an armed miss banks nothing and wears no flag', JSON.stringify(b[1]));
  const st = A.P[0].lastState();
  ok(st.players[1].dbl === false, 'miss: the missed Double is spent all the same');
}

/* ---- a bet question carries its own stake ---- */
await A.host.send({ t: 'bet_phase', qid: 'r3a' });
await pub(A.host, 'r3a', { round: 3 });
await A.P[2].send({ t: 'double', qid: 'r3a' });
ok(/own stake/.test((A.P[2].lastError() || {}).msg || ''), 'bet: a bet question refuses the Double', JSON.stringify(A.P[2].lastError()));
await A.P[2].send({ t: 'answer', qid: 'r3a', pick: 1 });
await A.host.send({ t: 'reveal', qid: 'r3a' });

/* ---- a closest-number bank doubles too ---- */
await pub(A.host, 'r2n', { kind: 'num', trueNum: 100, correctIdx: undefined, answersCount: undefined });
await A.P[2].send({ t: 'double', qid: 'r2n' });            // Cy still holds hers
await A.P[2].send({ t: 'answer', qid: 'r2n', num: 99 });   // closest
await A.P[0].send({ t: 'answer', qid: 'r2n', num: 40 });
T += 2000;
await A.host.send({ t: 'reveal', qid: 'r2n' });
{
  const rev = A.P[0].last('reveal');
  const b = bySeat(rev);
  ok(b[2].correct && b[2].doubled === true && b[2].banked === rev.value * 2,
    'num: the closest seat\'s bank doubles', JSON.stringify({ banked: b[2].banked, value: rev.value }));
  const st = A.P[0].lastState();
  ok(st.players[2].dbl === false, 'num: the token is spent');
}

console.log('TEST-DOUBLE: ' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
