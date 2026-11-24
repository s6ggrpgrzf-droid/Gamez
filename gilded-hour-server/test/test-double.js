/* THE DOUBLE IS CUT (Subtraction Pass I, 2026-11-23) — the
 * referee's side of the removal. The token was a third money-
 * multiplier doing a job the round doubling and the finale bet
 * already do. Proves the absence is total: no seat carries a dbl
 * field, no question snapshot carries dblArmed, the 'double'
 * message is an unknown verb and disturbs nothing, and banks pay
 * the drained value exactly once — an ordinary bank and a
 * closest-number bank alike, Quick Draw still flat on top.
 * (This file keeps its name so the suite's file count is stable;
 * it tested the Double's life, it now tests its grave.)
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

/* no seat carries the token, in any snapshot */
{
  const st = A.P[0].lastState();
  ok(st.players.filter(Boolean).every((p) => !('dbl' in p)), 'join: no seat carries a dbl field — the token does not exist', JSON.stringify(st.players));
}

/* ---- the verb is gone, and asking for it disturbs nothing ---- */
await pub(A.host, 'r2a');
{
  const st = A.host.lastState();
  ok(st.question && !('dblArmed' in st.question), 'R2: the question snapshot carries no dblArmed', JSON.stringify(st.question && Object.keys(st.question)));
}
await A.P[1].send({ t: 'answer', qid: 'r2a', pick: 1 });   // Bo correct FIRST (quick draw)
await A.P[0].send({ t: 'double', qid: 'r2a' });            // the old spend, attempted
ok(/Unknown/.test((A.P[0].lastError() || {}).msg || ''), 'R2: a double message is an unknown verb now', JSON.stringify(A.P[0].lastError()));
await A.P[0].send({ t: 'answer', qid: 'r2a', pick: 1 });   // Ana correct, second
await A.P[2].send({ t: 'answer', qid: 'r2a', pick: 0 });   // Cy wrong
T += 2000;                                                  // 10% elapsed -> value 190
await A.host.send({ t: 'reveal', qid: 'r2a' });
{
  const rev = A.P[0].last('reveal');
  const b = bySeat(rev);
  ok(rev.value === 190, 'R2: the drained value is 190', 'value=' + rev.value);
  ok(b[0].banked === 190 && !b[0].doubled, 'R2: a correct bank pays the value exactly once (190), no doubled flag', JSON.stringify(b[0]));
  ok(b[1].banked === 290 && !b[1].doubled, 'R2: Quick Draw still pays the round\u2019s flat $100 on top (190 + 100)', JSON.stringify(b[1]));
  ok(b[2].banked === 0, 'R2: the wrong seat banks nothing');
}

/* ---- a closest-number bank pays once too ---- */
await pub(A.host, 'r2n', { kind: 'num', trueNum: 100, correctIdx: undefined, answersCount: undefined });
await A.P[2].send({ t: 'answer', qid: 'r2n', num: 99 });   // closest
await A.P[0].send({ t: 'answer', qid: 'r2n', num: 40 });
T += 2000;
await A.host.send({ t: 'reveal', qid: 'r2n' });
{
  const rev = A.P[0].last('reveal');
  const b = bySeat(rev);
  ok(b[2].correct && !b[2].doubled && b[2].banked === rev.value,
    'num: the closest seat banks the value exactly once', JSON.stringify({ banked: b[2].banked, value: rev.value }));
}
console.log('TEST-DOUBLE: ' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
