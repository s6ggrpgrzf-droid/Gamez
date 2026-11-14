/* THE DECADE VOTE (designer pass 6, 2026-11-13) — the referee's
 * side. At the first intermission the host opens a count; pads
 * cast one ballot each for the era the dealer leans toward
 * (80s / 90s / 00s), changeable until the host calls it; the
 * call — an era, or null for an abstention — is final and rides
 * every snapshot after. The referee keeps ballots; it never
 * deals. Proves: the open's ground (first break only, once per
 * show), ballot rules (open count only, offered eras only,
 * changeable), the call (valid eras + abstention, final),
 * snapshots carrying eraVote/era, and new_show resetting all of
 * it. Same simulated Durable Object harness as the sibling
 * suites. Run: node test/test-era.js */
import * as worker from '../server.js';
import { setNowProvider } from '../room.js';

let T = 1_700_001_900_000;
setNowProvider(() => T);

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name, detail || ''); }
}

// ---- fakes (mirrors test-vs.js) ----
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

async function pub(host, qid, round) {
  await host.send({
    t: 'publish_question', qid, round, kind: 'normal', category: 'Movies',
    deadlineMs: 20000, baseValue: 200, multiplier: round === 2 ? 2 : 1, correctIdx: 1, answersCount: 4,
  });
}
async function toBreak(host, P, qid, round, nextRound) {
  await pub(host, qid, round);
  for (const p of P) await p.send({ t: 'answer', qid, pick: 1 });
  await host.send({ t: 'reveal', qid });
  await host.send({ t: 'intermission', nextRound });
}

/* ================= Room A — the full count ================= */
const A = await setupRoom(3);

/* the count cannot open before the first break */
await A.host.send({ t: 'era_open' });
ok(/first break/.test((A.host.lastError() || {}).msg || ''), 'era_open refused in the lobby', JSON.stringify(A.host.lastError()));

/* play to the first break */
await toBreak(A.host, A.P, 'q1', 1, 2);
let st = A.host.lastState();
ok(st.phase === 'intermission' && st.eraVote === null && st.era === null, 'at the break: no count standing yet', JSON.stringify({ eraVote: st.eraVote, era: st.era }));

/* a ballot before the open is refused */
await A.P[0].send({ t: 'era_vote', era: '90s' });
ok(/No count stands open/.test((A.P[0].lastError() || {}).msg || ''), 'era_vote refused before era_open', JSON.stringify(A.P[0].lastError()));

/* the host opens the count */
await A.host.send({ t: 'era_open' });
st = A.P[0].lastState();
ok(st.eraVote && st.eraVote.called === false && Object.keys(st.eraVote.votes).length === 0, 'snapshot: the count stands open, empty', JSON.stringify(st.eraVote));

/* ballots land by seat; a ballot may change while the count stands */
await A.P[0].send({ t: 'era_vote', era: '90s' });
await A.P[1].send({ t: 'era_vote', era: '90s' });
await A.P[2].send({ t: 'era_vote', era: '80s' });
await A.P[2].send({ t: 'era_vote', era: '00s' });
st = A.host.lastState();
ok(st.eraVote.votes[0] === '90s' && st.eraVote.votes[1] === '90s' && st.eraVote.votes[2] === '00s', 'snapshot: ballots by seat, the change counted', JSON.stringify(st.eraVote.votes));

/* an era not on offer is refused */
await A.P[0].send({ t: 'era_vote', era: '70s' });
ok(/not a decade on offer/.test((A.P[0].lastError() || {}).msg || ''), 'era_vote refuses an unoffered era', JSON.stringify(A.P[0].lastError()));

/* the count cannot be opened twice */
await A.host.send({ t: 'era_open' });
ok(/already stood/.test((A.host.lastError() || {}).msg || ''), 'a second era_open is refused', JSON.stringify(A.host.lastError()));

/* a call naming an unoffered era is refused, and the count still stands */
await A.host.send({ t: 'era_call', era: '70s' });
ok(/not a decade on offer/.test((A.host.lastError() || {}).msg || ''), 'era_call refuses an unoffered era', JSON.stringify(A.host.lastError()));
st = A.host.lastState();
ok(st.eraVote && st.eraVote.called === false, 'the refused call leaves the count open', JSON.stringify(st.eraVote));

/* the real call: final, and the era rides the snapshot */
await A.host.send({ t: 'era_call', era: '90s' });
st = A.P[1].lastState();
ok(st.era === '90s' && st.eraVote && st.eraVote.called === true, 'snapshot: the call rides — era set, count closed', JSON.stringify({ era: st.era, eraVote: st.eraVote }));

/* nothing moves after the call */
await A.P[0].send({ t: 'era_vote', era: '80s' });
ok(/No count stands open/.test((A.P[0].lastError() || {}).msg || ''), 'era_vote refused after the call', JSON.stringify(A.P[0].lastError()));
await A.host.send({ t: 'era_call', era: '80s' });
ok(/No count stands open/.test((A.host.lastError() || {}).msg || ''), 'a second era_call is refused', JSON.stringify(A.host.lastError()));

/* the second break opens no count */
await toBreak(A.host, A.P, 'q2', 2, 3);
await A.host.send({ t: 'era_open' });
ok(/first break/.test((A.host.lastError() || {}).msg || ''), 'era_open refused at the second break', JSON.stringify(A.host.lastError()));
st = A.host.lastState();
ok(st.era === '90s', 'the called era still rides at the second break', JSON.stringify(st.era));

/* a fresh show stands un-voted */
await A.host.send({ t: 'end_show' });
await A.host.send({ t: 'new_show' });
st = A.host.lastState();
ok(st.phase === 'lobby' && st.eraVote === null && st.era === null, 'new_show: the count, call and era all reset', JSON.stringify({ eraVote: st.eraVote, era: st.era }));

/* ================= Room B — the abstention ================= */
const B = await setupRoom(2);
await toBreak(B.host, B.P, 'q1', 1, 2);
await B.host.send({ t: 'era_open' });
await B.host.send({ t: 'era_call', era: null });
st = B.P[0].lastState();
ok(st.era === null && st.eraVote && st.eraVote.called === true, 'abstention: called, with no era — snapshots tell it from uncalled', JSON.stringify({ era: st.era, eraVote: st.eraVote }));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
