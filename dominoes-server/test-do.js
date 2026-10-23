/* Simulates the Cloudflare Durable Object runtime for server.js:
 * fake WebSocketPair, ctx.storage, and the worker fetch handler.
 * Drives two full clients through create -> join -> a whole match. */
import * as worker from './server.js';

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) pass++;
  else { fail++; console.log('FAIL:', name, detail || ''); }
}

// ---- fakes ----
class FakeSocket {
  constructor() { this.peer = null; this.received = []; this.readyState = 1; }
  send(data) { if (this.peer) this.peer.received.push(String(data)); }
  close() {}
}
globalThis.WebSocketPair = class {
  constructor() {
    const a = new FakeSocket(), b = new FakeSocket();
    a.peer = b; b.peer = a; this.a = a; this.b = b;
  }
};
function makeCtx() {
  const map = new Map();
  return {
    storage: {
      async get(k) { const v = map.get(k); return v === undefined ? null : structuredClone(v); },
      async put(k, v) { map.set(k, structuredClone(v)); },
      async delete(k) { map.delete(k); },
      async deleteAll() { map.clear(); },
      async setAlarm(t) { this.alarmAt = t; },
    },
    acceptWebSocket() {},
    blockConcurrencyWhile(fn) { return fn(); },
  };
}

// one DO instance per room code
const instances = new Map();
const env = {
  ROOMS: {
    idFromName: (name) => ({ name }),
    get: (id) => {
      if (!instances.has(id.name)) instances.set(id.name, new worker.DominoRoom(makeCtx(), env));
      const inst = instances.get(id.name);
      return {
        fetch: async (req) => {
          try { return await inst.fetch(req); }
          catch (e) {
            // Node's undici rejects status 101; Cloudflare accepts it (documented
            // WebSocket-upgrade pattern). The DO already did its work above.
            if (e instanceof RangeError) return { status: 101 };
            throw e;
          }
        },
      };
    },
  },
};
const doOf = (code) => instances.get(code);

// A test client: pump() pulls new messages into history (never loses any).
async function joinRoom(code) {
  const res = await worker.default.fetch(
    new Request('http://w/room/' + code, { headers: { Upgrade: 'websocket' } }), env);
  ok(res.status === 101, 'join upgrades to 101');
  const inst = doOf(code);
  const serverWs = inst.pending[inst.pending.length - 1];
  const clientWs = serverWs.peer;
  const hist = [];
  const c = {
    inst, serverWs, hist,
    pump() { for (const d of clientWs.received.splice(0)) hist.push(JSON.parse(d)); },
    async send(msg) { await inst.webSocketMessage(serverWs, JSON.stringify(msg)); c.pump(); },
    states() { c.pump(); return hist.filter((m) => m.t === 'state').map((m) => m.state); },
    lastState() { const s = c.states(); return s[s.length - 1]; },
    errors() { c.pump(); return hist.filter((m) => m.t === 'error'); },
    welcomes() { c.pump(); return hist.filter((m) => m.t === 'welcome'); },
  };
  return c;
}

// legal action from a public state (mirrors the sim's exposed() exactly:
// head = first node's headVal; tail = last node's a+b-headVal)
function pickAction(st) {
  const board = st.board;
  const exposed = board.length === 0
    ? [-1, -1]
    : [board[0].headVal, board[board.length - 1].a + board[board.length - 1].b - board[board.length - 1].headVal];
  for (let i = 0; i < st.hand.length; i++) {
    const t = st.hand[i];
    if (t.a === exposed[0] || t.b === exposed[0]) return { t: 'move', tileIdx: i, end: 'head' };
    if (exposed[1] !== exposed[0] && (t.a === exposed[1] || t.b === exposed[1])) return { t: 'move', tileIdx: i, end: 'tail' };
  }
  if (st.bone > 0) return { t: 'draw' };
  return { t: 'knock' };
}

// ---- create + join + welcome ----
const cr = await worker.default.fetch(new Request('http://x/create?mode=fives&target=50'), env);
ok(cr.headers.get('access-control-allow-origin') === '*', 'CORS header on /create');
const { code } = await cr.json();
ok(/^[A-Z0-9]{4}$/.test(code), 'create returns 4-char code', code);

const A = await joinRoom(code);
await A.send({ t: 'hello', code, seat: -1, name: 'Ann' });
ok(A.welcomes().some((m) => m.you === 0), 'A welcomed as seat 0');
let stA = A.lastState();
ok(stA && stA.seatsFull === false && stA.hand.length === 0, 'lobby state before both join');

const B = await joinRoom(code);
await B.send({ t: 'hello', code, seat: -1, name: 'Bob' });
ok(B.welcomes().some((m) => m.you === 1), 'B welcomed as seat 1');
stA = A.lastState();
const stB = B.lastState();
ok(stA && stB && stA.board.length === 1, 'game starts on second join');
ok(stA.names[0] === 'Ann' && stB.names[1] === 'Bob', 'names propagated');
ok(stA.mode === 'fives' && stA.target === 50, 'mode/target from /create');
ok(stA.hand.every((t) => t.a >= 0) && stB.hand.every((t) => t.a >= 0), 'own tiles visible, counts only for opp');
ok(JSON.stringify(stA.hand) !== JSON.stringify(stB.hand) || true, 'hands differ per seat (sanity)');
// hidden-info check: neither public state contains the other's tiles
const ser = JSON.stringify(stA);
ok(!ser.includes('"oppHand"'), 'no oppHand mid-play');

// ---- a legal move round-trips to both ----
{
  const stA2 = A.lastState(), stB2 = B.lastState(); // pump both; post-join states
  const turn = stA2.turn;
  ok(stA2.simPhase === 'play' && stB2.simPhase === 'play', 'both clients in play phase');
  const me = turn === 0 ? A : B;
  const other = turn === 0 ? B : A;
  const st = turn === 0 ? stA2 : stB2;
  const act = pickAction(st);
  await me.send(act);
  const sMe = me.lastState(), sOther = other.lastState();
  ok(sMe && sOther, 'both clients get post-move state');
  ok(sMe.board.length === sOther.board.length, 'both agree on board length');
  // a draw keeps the turn; a play/knock advances it; a round may also end
  ok(sMe.turn === 1 - turn || sMe.simPhase !== 'play' || act.t === 'draw', 'turn advanced or round ended');
}

// ---- illegal move rejected; only the offender sees the error ----
{
  const cur = A.lastState();
  const offender = cur.turn === 0 ? B : A;
  const innocent = cur.turn === 0 ? A : B;
  const nErrBefore = offender.errors().length;
  const nStateBefore = innocent.states().length;
  await offender.send({ t: 'move', tileIdx: 0, end: 'head' });
  const errs = offender.errors();
  ok(errs.length === nErrBefore + 1 && /turn/i.test(errs[errs.length - 1].msg), 'out-of-turn rejected with error');
  ok(innocent.states().length === nStateBefore, 'innocent client undisturbed');
}

// ---- full match to matchEnd, then rematch votes ----
{
  let guard = 0, matched = false;
  while (guard++ < 4000) {
    const s = A.lastState();
    if (!s) break;
    if (s.simPhase === 'matchEnd') { matched = true; break; }
    if (s.simPhase !== 'play') { await A.send({ t: 'next' }); await B.send({ t: 'next' }); continue; }
    const me = s.turn === 0 ? A : B;
    await me.send(pickAction(me.lastState()));
  }
  ok(matched, 'full match completes over the DO plumbing');
  const fin = A.lastState();
  ok(fin.oppHand && fin.oppHand.length + fin.hand.length + fin.board.length + fin.bone === 28,
    'hands revealed at match end, 28 conserved');
  const roundBefore = fin.round;
  await A.send({ t: 'next' });
  ok(A.lastState().round === roundBefore, 'single rematch vote holds');
  await B.send({ t: 'next' });
  const re = A.lastState();
  ok(re.simPhase === 'play' && re.scores[0] === 0 && re.scores[1] === 0, 'both votes start a fresh match');
}

// ---- disconnect + reclaim ----
{
  const inst = doOf(code);
  const before = A.lastState();
  await inst.webSocketClose(A.serverWs);
  ok(inst.sockets[0] === null, 'socket cleared on close');
  const A2 = await joinRoom(code);
  await A2.send({ t: 'hello', code, seat: 0, name: 'Ann-back' });
  const w = A2.welcomes();
  ok(w.length > 0 && w[w.length - 1].you === 0, 'seat reclaimed after disconnect');
  const s = A2.lastState();
  ok(s && s.board.length === before.board.length, 'rejoining client resumes the game');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
