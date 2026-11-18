/* Pass 7 — the rejoin rebind (server.js, the GildedRoom DO).
   The old rule refused a player hello whose seat still held a
   live socket ('Seat is taken.') — and the socket it protected
   was usually the same phone's own earlier connection lingering
   after a reload, so the pad dead-ended on 'Finding your
   podium'. Now a hello that proves the identity (the seat's
   reclaim token, the room's host token) REBINDS: the newest
   presenter takes the seat, the old socket is told and retired,
   and its late close never paints the seat disconnected.
   An unproven hello evicts nothing.
   The DO is driven directly with fake sockets and storage. */
import { GildedRoom } from '../server.js';

let fails = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); if (!ok) fails++; }

const store = new Map();
const allSockets = [];
function fakeWs() {
  const ws = {
    sent: [], closedWith: null, att: null,
    send(s) { this.sent.push(JSON.parse(s)); },
    close(code, reason) { this.closedWith = { code, reason }; },
    serializeAttachment(a) { this.att = a; },
    deserializeAttachment() { return this.att; },
  };
  allSockets.push(ws);
  return ws;
}
const ctx = {
  storage: {
    async get(k) { return store.get(k); },
    async put(k, v) { store.set(k, v); },
    async delete(k) { store.delete(k); },
    async deleteAll() { store.clear(); },
    async setAlarm() {},
  },
  blockConcurrencyWhile(fn) { this._ready = fn(); },
  acceptWebSocket() {},
  getWebSockets() { return allSockets.filter(w => !w.closedWith); },
};
const doRoom = new GildedRoom(ctx, {});
await ctx._ready;
const createRes = await doRoom.fetch(new Request('https://x/init', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: 'TEST', hostToken: 'hosttok' }),
}));
check('the room is created', createRes.status === 200, 'status=' + createRes.status);

const hello = async (ws, msg) => { await doRoom.webSocketMessage(ws, JSON.stringify(msg)); };
const lastOf = (ws, t) => ws.sent.filter(m => m.t === t).pop();

/* host + two players settle in */
const wsH = fakeWs();
await hello(wsH, { t: 'hello', role: 'host', hostToken: 'hosttok' });
check('the host is welcomed', !!lastOf(wsH, 'welcome'));
const wsA = fakeWs();
await hello(wsA, { t: 'hello', role: 'player', name: 'Ana' });
const welcomeA = lastOf(wsA, 'welcome');
check('Ana is welcomed with a reclaim token', !!welcomeA && !!welcomeA.reclaimToken, JSON.stringify(welcomeA || {}).slice(0, 90));
const anaSeat = welcomeA.seat, anaToken = welcomeA.reclaimToken;
const wsB = fakeWs();
await hello(wsB, { t: 'hello', role: 'player', name: 'Bo' });
check('Bo takes the next seat', lastOf(wsB, 'welcome').seat === 1);

/* THE DEAD-END, REPRODUCED AND FIXED: Ana's phone reloads. Her
   old socket has NOT closed (the zombie the old rule protected).
   Her new socket presents the reclaim token. */
const wsA2 = fakeWs();
await hello(wsA2, { t: 'hello', role: 'player', reclaimToken: anaToken, name: 'Ana' });
const welcomeA2 = lastOf(wsA2, 'welcome');
check('the rejoin is welcomed back into the SAME seat', !!welcomeA2 && welcomeA2.seat === anaSeat, JSON.stringify(welcomeA2 || {}).slice(0, 90));
check('no Seat-is-taken refusal was issued', !wsA2.sent.some(m => m.t === 'error'), JSON.stringify(wsA2.sent).slice(0, 120));
check('the old socket was told it was replaced', !!lastOf(wsA, 'error') && /replaced by a rejoin/.test(lastOf(wsA, 'error').msg || ''), JSON.stringify(lastOf(wsA, 'error') || {}));
check('the old socket was retired (close 4001)', !!wsA.closedWith && wsA.closedWith.code === 4001, JSON.stringify(wsA.closedWith));
check('the seat reads connected on the new socket', doRoom.room.players[anaSeat].connected === true && doRoom.destOf(wsA2) === anaSeat);

/* the zombie's close arrives LATE — the seat must not go dark */
await doRoom.webSocketClose(wsA);
check('the late close of the replaced socket keeps the seat connected', doRoom.room.players[anaSeat].connected === true);
check('the seat slot points at the new socket', doRoom.liveSocket(anaSeat) === wsA2);

/* an UNPROVEN hello evicts nothing */
const wsX = fakeWs();
await hello(wsX, { t: 'hello', role: 'player', reclaimToken: 'bogus-token' });
check('a bogus token is refused', !!lastOf(wsX, 'error') && /Seat not found/.test(lastOf(wsX, 'error').msg || ''), JSON.stringify(lastOf(wsX, 'error') || {}));
check('the seated pad is untouched by the bogus hello', !wsA2.closedWith && doRoom.destOf(wsA2) === anaSeat);

/* the host earns the same rebind — and only with its token */
const wsH2 = fakeWs();
await hello(wsH2, { t: 'hello', role: 'host', hostToken: 'hosttok' });
check('a host rejoin with the room token is welcomed', !!lastOf(wsH2, 'welcome'));
check('the lingering host socket was retired', !!wsH.closedWith && wsH.closedWith.code === 4001, JSON.stringify(wsH.closedWith));
const wsH3 = fakeWs();
await hello(wsH3, { t: 'hello', role: 'host', hostToken: 'wrong-token' });
check('a wrong host token is refused', !!lastOf(wsH3, 'error') && /Bad host token/.test(lastOf(wsH3, 'error').msg || ''), JSON.stringify(lastOf(wsH3, 'error') || {}));
check('the real host survives the wrong-token hello', !wsH2.closedWith && doRoom.destOf(wsH2) === 'host');

/* and the room still plays: Bo's socket answers for its seat —
   destOf routes the new host socket as host, Ana as seat 0 */
check('routing is intact after the rebinds', doRoom.destOf(wsB) === 1 && doRoom.destOf(wsA2) === anaSeat && doRoom.destOf(wsH2) === 'host');

console.log(fails ? ('test-rejoin: ' + fails + ' FAILURES') : 'test-rejoin: all passed');
process.exitCode = fails ? 1 : 0;
