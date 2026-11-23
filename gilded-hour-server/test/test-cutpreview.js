/* Cut Two, Previewed (Gameplay-visuals pass G6) — the pair is
 * committed at publish, and {t:'cut_preview'} reads it back to the
 * asking seat alone. Proves: the previewed pair is EXACTLY the pair
 * a later cuttwo cuts; a preview spends nothing (token intact, no
 * cut recorded, question state untouched) and is repeatable; the
 * answer is unicast — host and other seats receive nothing, and no
 * snapshot ever carries the pair before a cut; a second seat's
 * preview is its own request on the same question-level commitment
 * (the room's cut semantics are one pair per question) and disturbs
 * nobody; the guards mirror cuttwo's (wrong qid, num kind, already
 * cut); a fresh question previews its own fresh pair.
 * Run: node test/test-cutpreview.js */
import * as worker from '../server.js';
import { setNowProvider } from '../room.js';

let T = 1_700_001_200_000;
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

const A = await setupRoom(3);

/* Publish a Round 1 MCQ: correctIdx 1, committed pair [0, 3]. */
async function pubMcq(host, qid, pair) {
  await host.send({
    t: 'publish_question', qid, round: 1, kind: 'normal', category: 'Movies',
    deadlineMs: 20000, baseValue: 200, multiplier: 1, correctIdx: 1, answersCount: 4,
    cutIndices: pair,
  });
}

// ---- B1: no question open -> refused, to the requester only
await A.P[0].send({ t: 'cut_preview', qid: 'b1' });
ok(/No open question/.test((A.P[0].lastError() || {}).msg || ''),
  'B1: a preview with no open question is refused');
ok(A.host.msgs('error').length === 0 && A.P[1].msgs('error').length === 0,
  'B1: the refusal reaches nobody else');

// ---- B2: the preview returns the committed pair, to the asker only
await pubMcq(A.host, 'b2', [0, 3]);
const hostHistBefore = A.host.hist.length, p1HistBefore = A.P[1].hist.length, p2HistBefore = A.P[2].hist.length;
await A.P[0].send({ t: 'cut_preview', qid: 'b2' });
{
  const pv = A.P[0].last('cut_preview');
  ok(!!pv && pv.qid === 'b2' && JSON.stringify(pv.indices) === '[0,3]',
    'B2: the preview answers the committed pair exactly', JSON.stringify(pv));
  ok(A.host.hist.length === hostHistBefore && A.P[1].hist.length === p1HistBefore && A.P[2].hist.length === p2HistBefore,
    'B2: the preview is unicast — host and both other seats received nothing at all');
  ok(A.P[1].msgs('cut_preview').length === 0 && A.P[2].msgs('cut_preview').length === 0 && A.host.msgs('cut_preview').length === 0,
    'B2: no cut_preview message exists on any other wire');
}

// ---- B3: a preview spends nothing and changes nothing
{
  const st = A.P[0].lastState();
  ok(st.players[0].cutTwo === true,
    'B3: the asker\'s token is intact after previewing');
  ok(st.question && st.question.cut === null,
    'B3: the snapshot still shows no cut — the question state is untouched');
  ok(!A.P[0].text().includes('"cutIndices"') && !A.P[1].text().includes('"cutIndices"') && !A.host.text().includes('"cut_preview"'),
    'B3: neither the stored field name nor the preview rides any traffic the asker can show others');
  await A.P[0].send({ t: 'cut_preview', qid: 'b2' });
  const pv2 = A.P[0].last('cut_preview');
  ok(JSON.stringify(pv2.indices) === '[0,3]' && A.P[0].msgs('cut_preview').length === 2,
    'B3: previewing is repeatable and returns the same pair every time');
}

// ---- B4: a second seat's preview is independent
await A.P[1].send({ t: 'cut_preview', qid: 'b2' });
{
  const pv = A.P[1].last('cut_preview');
  ok(!!pv && JSON.stringify(pv.indices) === '[0,3]',
    'B4: seat 1 previews the same question-level commitment (one pair per question is the room\'s cut semantics)',
    JSON.stringify(pv));
  ok(A.P[1].lastState().players[1].cutTwo === true && A.P[0].msgs('cut_preview').length === 2,
    'B4: seat 1\'s token is intact and seat 0 hears nothing of it');
}

// ---- B5: the spend cuts EXACTLY the previewed pair
await A.P[0].send({ t: 'cuttwo', qid: 'b2' });
{
  const cut = A.P[1].last('cut');
  ok(!!cut && cut.bySeat === 0 && cut.indices === undefined,
    'B5: the cut broadcast names the spender only — the pair is never broadcast', JSON.stringify(cut));
  const mine = A.P[0].lastState();
  ok(mine.players[0].cutTwo === false && mine.question.cut &&
    JSON.stringify(mine.question.cut.indices) === '[0,3]' && JSON.stringify(mine.question.cut.seats) === '[0]',
    'B5: only the spend spends — token gone, and the spender’s own snapshot carries the previewed pair');
  const other = A.P[2].lastState();
  ok(other.question.cut && JSON.stringify(other.question.cut.seats) === '[0]' && other.question.cut.indices === undefined,
    'B5: a bystander’s snapshot shows who cut and never what fell');
}

// ---- B6: after seat 0's private spend, seat 1 may still preview; the spender may not
await A.P[1].send({ t: 'cut_preview', qid: 'b2' });
{
  const pv = A.P[1].last('cut_preview');
  ok(!!pv && JSON.stringify(pv.indices) === '[0,3]',
    'B6: a preview after another seat’s spend still reads the pair — the spend was private', JSON.stringify(pv));
}
await A.P[0].send({ t: 'cut_preview', qid: 'b2' });
ok(/Already cut/.test((A.P[0].lastError() || {}).msg || ''),
  'B6: the spender’s own preview after their spend is refused — they already hold the pair');

// ---- B7: the guards mirror cuttwo's
await A.host.send({ t: 'reveal', qid: 'b2' });
await A.host.send({
  t: 'publish_question', qid: 'b7', round: 1, kind: 'num', category: 'TV',
  deadlineMs: 30000, baseValue: 100, trueNum: 42,
});
await A.P[0].send({ t: 'cut_preview', qid: 'b7' });
ok(/Nothing to cut on a number question/.test((A.P[0].lastError() || {}).msg || ''),
  'B7: a num question refuses a preview, exactly as it refuses a cut');
await A.P[0].send({ t: 'cut_preview', qid: 'nope' });
ok(/Wrong question/.test((A.P[0].lastError() || {}).msg || ''),
  'B7: a preview naming another question is refused');
await A.host.send({ t: 'cut_preview', qid: 'b7' });
ok(/Unknown message/.test((A.host.lastError() || {}).msg || ''),
  'B7: the host cannot preview — it is a player message, and the big screen never ghosts');

// ---- B8: a fresh question previews its own fresh pair
await A.host.send({ t: 'reveal', qid: 'b7' });
await pubMcq(A.host, 'b8', [2, 3]);
await A.P[2].send({ t: 'cut_preview', qid: 'b8' });
{
  const pv = A.P[2].last('cut_preview');
  ok(!!pv && JSON.stringify(pv.indices) === '[2,3]',
    'B8: the next question previews its own committed pair, not the last one\'s', JSON.stringify(pv));
  await A.P[2].send({ t: 'cuttwo', qid: 'b8' });
  const cut = A.P[0].last('cut');
  ok(!!cut && cut.bySeat === 2 && cut.indices === undefined,
    'B8: and its spend broadcasts the spender only — no pair on the wire');
  const st8 = A.P[2].lastState();
  ok(st8.question.cut && JSON.stringify(st8.question.cut.indices) === '[2,3]',
    'B8: the spender’s own snapshot carries the pair it cut');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
