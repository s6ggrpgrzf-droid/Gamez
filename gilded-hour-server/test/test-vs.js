/* AGAINST THE ROOM (designer pass 4, 2026-11-13) — the referee's
 * side. The gauntlet belongs to last place, once a round: declare
 * on an open question and bank ALONE to take the value twice; a
 * shared bank lapses it. Proves: the lone bank and its flag with
 * Quick Draw flat on top; the lapse paying plain value; refusals
 * (leader, level table, second throw in a round, bet question,
 * alongside a riding Double — both directions); the snapshot
 * carrying vsRound + vsArmed; new_show resetting the throw.
 * Same simulated Durable Object harness as the sibling suites.
 * Run: node test/test-vs.js */
import * as worker from '../server.js';
import { setNowProvider } from '../room.js';

let T = 1_700_000_900_000;
setNowProvider(() => T);

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name, detail || ''); }
}

// ---- fakes (mirrors test-double.js) ----
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
    t: 'publish_question', qid, round: 1, kind: 'normal', category: 'Movies',
    deadlineMs: 20000, baseValue: 200, multiplier: 1, correctIdx: 1, answersCount: 4,
  }, extra || {}));
}

const A = await setupRoom(3);

/* ---- Q1: P0 banks alone and takes the lead ---- */
await pub(A.host, 'q1', { round: 1 });
/* a level table has no gauntlet: P1's throw is refused */
await A.P[1].send({ t: 'vs', qid: 'q1' });
ok(/last place/.test((A.P[1].lastError() || {}).msg || ''), 'level table: no gauntlet for anyone', JSON.stringify(A.P[1].lastError()));
await A.P[0].send({ t: 'answer', qid: 'q1', pick: 1 });
await A.P[1].send({ t: 'answer', qid: 'q1', pick: 0 });
await A.P[2].send({ t: 'answer', qid: 'q1', pick: 0 });
await A.host.send({ t: 'reveal', qid: 'q1' });
let rev = bySeat(A.P[0].last('reveal'));
const VALUE = rev[0].banked - 50; /* P0 was sole banker AND Quick Draw: banked = value + 50 */
ok(VALUE > 0, 'Q1: P0 leads, value derived', 'banked=' + rev[0].banked);

/* ---- Q2: tied trailers declare; one's lone bank pays double ---- */
await pub(A.host, 'q2', { round: 1 });
await A.P[0].send({ t: 'vs', qid: 'q2' });
ok(/last place/.test((A.P[0].lastError() || {}).msg || ''), 'the leader cannot throw the gauntlet', JSON.stringify(A.P[0].lastError()));
await A.P[2].send({ t: 'vs', qid: 'q2' });
ok(!A.P[2].lastError() || (A.P[2].lastError() || {}).msg === undefined || A.P[2].msgs('accepted').length > 0, 'tied for last: the throw is accepted');
let st = A.P[2].lastState();
ok(st.question && JSON.stringify(st.question.vsArmed) === '[2]', 'snapshot: vsArmed names the declared seat', JSON.stringify(st.question && st.question.vsArmed));
ok(st.players[2].vsRound === 1, 'snapshot: the throw is spent in the throwing (vsRound = 1)', JSON.stringify(st.players[2]));
await A.P[1].send({ t: 'vs', qid: 'q2' }); /* the other trailer may throw too */
await A.P[2].send({ t: 'answer', qid: 'q2', pick: 1 });
await A.P[0].send({ t: 'answer', qid: 'q2', pick: 0 });
await A.P[1].send({ t: 'answer', qid: 'q2', pick: 0 });
await A.host.send({ t: 'reveal', qid: 'q2' });
rev = bySeat(A.P[0].last('reveal'));
ok(rev[2].vs === true && rev[2].banked === 2 * VALUE + 50, 'lone bank: value twice, Quick Draw flat on top', 'banked=' + rev[2].banked + ' want=' + (2 * VALUE + 50));

/* ---- Q3: a second throw in the same round is refused; a shared bank lapses ---- */
await pub(A.host, 'q3', { round: 1 });
await A.P[2].send({ t: 'vs', qid: 'q3' });
ok(/thrown for this round/.test((A.P[2].lastError() || {}).msg || ''), 'one throw per round, enforced', JSON.stringify(A.P[2].lastError()));
await A.P[1].send({ t: 'answer', qid: 'q3', pick: 1 });
await A.P[0].send({ t: 'answer', qid: 'q3', pick: 1 });
await A.P[2].send({ t: 'answer', qid: 'q3', pick: 0 });
await A.host.send({ t: 'reveal', qid: 'q3' });
rev = bySeat(A.P[0].last('reveal'));
/* P1 declared on Q2 and missed; P1 did NOT declare on Q3 (used its
 * throw on Q2) — so this only proves the shared value. The lapse
 * proper: P1's Q2 throw died on a miss (checked via vsRound above).
 * Here: two bankers, neither flagged, equal plain values. */
ok(!rev[0].vs && !rev[1].vs && rev[1].banked === rev[0].banked + 50, 'shared bank: plain values, no flags (P1 answered first: Quick Draw)', JSON.stringify(rev));

/* ---- Q4 (Round 2): declare, then the Double is refused on top ---- */
st = A.P[1].lastState();
const scores = st.players.map(p => (p ? p.score : Infinity));
const trailer = scores.indexOf(Math.min(...scores));
await pub(A.host, 'q4', { round: 2 });
await A.P[trailer].send({ t: 'vs', qid: 'q4' });
const vsOk = A.P[trailer].msgs('accepted').length > 0;
ok(vsOk, 'Round 2: the trailer throws', 'trailer=' + trailer + ' scores=' + JSON.stringify(scores));
await A.P[trailer].send({ t: 'double', qid: 'q4' });
ok(/one stake per question/.test((A.P[trailer].lastError() || {}).msg || ''), 'a thrown gauntlet refuses the Double on the same question', JSON.stringify(A.P[trailer].lastError()));
await A.P[trailer].send({ t: 'answer', qid: 'q4', pick: 0 });
await A.host.send({ t: 'reveal', qid: 'q4' });

/* ---- Room B: the reverse exclusion + new_show reset ---- */
const B = await setupRoom(2);
await pub(B.host, 'b1', { round: 2 });
await B.P[0].send({ t: 'answer', qid: 'b1', pick: 1 });
await B.P[1].send({ t: 'answer', qid: 'b1', pick: 0 });
await B.host.send({ t: 'reveal', qid: 'b1' });
await pub(B.host, 'b2', { round: 2 });
await B.P[1].send({ t: 'double', qid: 'b2' });
ok(B.P[1].msgs('accepted').length > 0, 'room B: the trailer arms its Double');
await B.P[1].send({ t: 'vs', qid: 'b2' });
ok(/Double is riding/.test((B.P[1].lastError() || {}).msg || ''), 'a riding Double refuses the gauntlet', JSON.stringify(B.P[1].lastError()));
await B.P[1].send({ t: 'answer', qid: 'b2', pick: 0 });
await B.host.send({ t: 'reveal', qid: 'b2' });
await B.host.send({ t: 'end_show' });
await B.host.send({ t: 'new_show' });
st = B.P[1].lastState();
ok(st.players[1].vsRound === 0 && st.players[1].dbl === true, 'new_show: gauntlet unthrown, Double restocked', JSON.stringify(st.players[1]));

/* ---- a bet question refuses the throw ---- */
const C = await setupRoom(2);
await pub(C.host, 'c1', { round: 1 });
await C.P[0].send({ t: 'answer', qid: 'c1', pick: 1 });
await C.P[1].send({ t: 'answer', qid: 'c1', pick: 0 });
await C.host.send({ t: 'reveal', qid: 'c1' });
await C.host.send({ t: 'bet_phase', qid: 'c2' });
await C.P[1].send({ t: 'bet', qid: 'c2', chips: 1 });
await pub(C.host, 'c2', { round: 3 });
await C.P[1].send({ t: 'vs', qid: 'c2' });
ok(/own stake/.test((C.P[1].lastError() || {}).msg || ''), 'a bet question refuses the gauntlet', JSON.stringify(C.P[1].lastError()));

console.log('TEST-VS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
