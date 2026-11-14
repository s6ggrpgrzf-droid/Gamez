/* THE BLUFF (research programme pass 2, 2026-11-13) — the
 * referee's side. A bluff question is published with its truth
 * and decoys and NO correctIdx: the players invent the answers,
 * the room deals them (last lie in deals at once; the host may
 * deal early; the clock deals what's there), the vote is the
 * ordinary pick, and the settlement pays the truth flat $200 —
 * no melt — plus $25 per player a lie fooled, from the house.
 * Proves: the publish validation; the invent snapshot (phase,
 * fakesIn, yourFake to its author alone); answers refused while
 * collecting; a truth-colliding lie dropped at the dealing;
 * decoy fill to three plaques; Double / gauntlet / Cut Two
 * refused on a bluff; the fool purse and its flags; the pot
 * feeding on a no-truth question even when fool money moved;
 * the invent deadline dealing on expiry.
 * Same simulated Durable Object harness as the sibling suites.
 * Run: node test/test-bluff.js */
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
const bySeat = (rev) => Object.fromEntries(rev.results.map((r) => [r.seat, r]));
const TRUTH = 'A flushing toilet';
const DECOYS = ['A shower drain', 'A bathroom mirror', 'A toothbrush'];
async function pubBluff(host, qid) {
  await host.send({
    t: 'publish_question', qid, round: 2, kind: 'bluff', category: 'Movies',
    deadlineMs: 25000, baseValue: 200, multiplier: 1,
    bluffTruth: TRUTH, decoys: DECOYS,
  });
}

const A = await setupRoom(3);

/* ---- publish validation ---- */
await A.host.send({ t: 'publish_question', qid: 'bad1', round: 2, kind: 'bluff', category: 'Movies', deadlineMs: 25000, baseValue: 200, multiplier: 1 });
ok(!!A.host.lastError(), 'publish without truth/decoys is refused', JSON.stringify(A.host.lastError()));

/* ---- B1: the collecting life ---- */
await pubBluff(A.host, 'b1');
let st = A.P[0].lastState();
ok(st && st.phase === 'invent' && st.question && st.question.bluffPhase === 'invent', 'the room opens in the invent phase', st && st.phase);
ok(st.question.fakesIn === 0, 'no lies in yet', String(st.question.fakesIn));
await A.P[0].send({ t: 'answer', qid: 'b1', pick: 0 });
ok(/No open question/.test((A.P[0].lastError() || {}).msg || ''), 'answers are refused while collecting', JSON.stringify(A.P[0].lastError()));
await A.P[0].send({ t: 'bluff', qid: 'b1', text: 'A brass teaspoon' });
st = A.P[0].lastState();
ok(st.yourFake === 'A brass teaspoon', 'the author’s snapshot names their own lie', String(st.yourFake));
const stOther = A.P[1].lastState();
ok(stOther.yourFake == null && stOther.question.fakesIn === 1, 'other pads see the count, never the lie', JSON.stringify({ f: stOther.yourFake, n: stOther.question.fakesIn }));
await A.P[1].send({ t: 'bluff', qid: 'b1', text: TRUTH }); /* collides with the truth: dropped at the dealing */
await A.P[2].send({ t: 'bluff', qid: 'b1', text: 'A singing kettle' });
const dealt = A.P[0].last('bluff_options');
ok(!!dealt && Array.isArray(dealt.options), 'the last lie in deals the answers at once', JSON.stringify(dealt).slice(0, 120));
ok(dealt.options.length === 3 && dealt.options.filter((t) => t === TRUTH).length === 1 && dealt.options.includes('A brass teaspoon') && dealt.options.includes('A singing kettle'),
  'plaques: the truth + the two usable lies (the colliding lie dropped)', JSON.stringify(dealt.options));
st = A.host.lastState();
ok(st.phase === 'answer' && st.question.options && st.question.options.length === 3, 'the snapshot carries the dealt texts', st.phase);
const correctIdx = st.question.correctIdx;
ok(dealt.options[correctIdx] === TRUTH, 'the host snapshot’s correctIdx points at the truth', 'idx=' + correctIdx);

/* ---- the stakes refuse the bluff ---- */
await A.P[0].send({ t: 'double', qid: 'b1' });
ok(/Bluff/.test((A.P[0].lastError() || {}).msg || ''), 'no Double rides a bluff', JSON.stringify(A.P[0].lastError()));
await A.P[0].send({ t: 'vs', qid: 'b1' });
ok(/Bluff/.test((A.P[0].lastError() || {}).msg || ''), 'no gauntlet rides a bluff', JSON.stringify(A.P[0].lastError()));
await A.P[0].send({ t: 'cuttwo', qid: 'b1' });
ok(/bluff/i.test((A.P[0].lastError() || {}).msg || ''), 'no Cut Two on a bluff', JSON.stringify(A.P[0].lastError()));

/* ---- the vote and the settlement ---- */
const lieIx = dealt.options.indexOf('A brass teaspoon');
await A.P[0].send({ t: 'answer', qid: 'b1', pick: correctIdx });
await A.P[1].send({ t: 'answer', qid: 'b1', pick: lieIx });
await A.P[2].send({ t: 'answer', qid: 'b1', pick: lieIx });
await A.host.send({ t: 'reveal', qid: 'b1' });
const revMsg = A.P[0].last('reveal');
const rev = bySeat(revMsg);
ok(revMsg.value === 200, 'the bluff settles flat — value is the undealt $200, no melt', 'value=' + revMsg.value);
ok(rev[0].correct && rev[0].banked === 250 && rev[0].fool === 50, 'the banker takes $200 + $25 per player fooled', JSON.stringify(rev[0]));
ok(!rev[1].correct && rev[1].banked === 0 && !rev[2].correct && rev[2].banked === 0, 'the fooled pay nothing', JSON.stringify([rev[1].banked, rev[2].banked]));
ok(revMsg.bluff && revMsg.bluff.options[lieIx].by === 0 && revMsg.bluff.options[correctIdx].truth === true, 'the reveal names the lies’ authors', JSON.stringify(revMsg.bluff).slice(0, 140));
ok(revMsg.potFed === 0 && revMsg.pot === 0, 'a banked bluff feeds no pot', 'potFed=' + revMsg.potFed);

/* ---- B2: the host deals early; decoys fill; the pot hears banks only ---- */
await pubBluff(A.host, 'b2');
await A.P[0].send({ t: 'bluff', qid: 'b2', text: 'A paper parasol' });
await A.host.send({ t: 'bluff_deal', qid: 'b2' });
const dealt2 = A.P[0].last('bluff_options');
ok(!!dealt2 && dealt2.options.length === 3 && dealt2.options.includes('A paper parasol') && dealt2.options.includes(TRUTH),
  'host deal: one lie + the truth + a decoy fill the board', JSON.stringify(dealt2 && dealt2.options));
const c2 = A.host.lastState().question.correctIdx;
const lie2 = dealt2.options.indexOf('A paper parasol');
await A.P[0].send({ t: 'answer', qid: 'b2', pick: lie2 }); /* the author cannot pick their own lie into a bank — any pick stands, it is simply wrong */
await A.P[1].send({ t: 'answer', qid: 'b2', pick: lie2 });
await A.P[2].send({ t: 'answer', qid: 'b2', pick: (lie2 + 1) % 3 === c2 ? (lie2 + 2) % 3 : (lie2 + 1) % 3 });
await A.host.send({ t: 'reveal', qid: 'b2' });
const rev2Msg = A.P[0].last('reveal');
const rev2 = bySeat(rev2Msg);
ok(rev2[0].banked === 25 && rev2[0].fool === 25, 'a lie that fools one pays its author $25 even when nobody banks', JSON.stringify(rev2[0]));
ok(rev2Msg.potFed === 200 && rev2Msg.pot === 200, 'no truth banked: the pot feeds the flat $200 (fool money does not speak to it)', 'potFed=' + rev2Msg.potFed);

/* ---- B3: the invent clock deals what it has ---- */
await pubBluff(A.host, 'b3');
await A.P[0].send({ t: 'bluff', qid: 'b3', text: 'A velvet rope' });
T += 61000;
await A.host.send({ t: 'ping' });
const dealt3 = A.P[0].last('bluff_options');
ok(!!dealt3 && dealt3.options.includes('A velvet rope'), 'the invent deadline deals what the room holds', JSON.stringify(dealt3 && dealt3.options));
const stB3 = A.host.lastState();
ok(stB3.phase === 'answer', 'the room stands in the answer phase after expiry', stB3.phase);

console.log('test-bluff:', pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
