/* Review Pass 8 — the lobby's ready word (room.js).
   A pad readies in the lobby and the snapshot carries it; the
   first publish out of the lobby spends every flag; a ready
   spoken mid-show is a polite no-op. */
import { createRoom, handleHello, handlePlayerMessage, handleHostMessage, snapshotFor } from '../room.js';

let fails = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); if (!ok) fails++; }

const room = createRoom('TEST');
handleHello(room, { role: 'host' }, 'host1');
const j1 = handleHello(room, { role: 'player', name: 'Ana' }, 'p1');
const j2 = handleHello(room, { role: 'player', name: 'Bo' }, 'p2');
const s1 = j1.identity.seat, s2 = j2.identity.seat;

let snap = snapshotFor(room, { role: 'host' });
check('a fresh seat is not ready', snap.players[s1].ready === false && snap.players[s2].ready === false);

let r = handlePlayerMessage(room, s1, { t: 'ready', ready: true });
check('ready is accepted in the lobby', !r.error, JSON.stringify(r).slice(0, 120));
snap = snapshotFor(room, { role: 'host' });
check('the snapshot carries the flag', snap.players[s1].ready === true && snap.players[s2].ready === false);

handlePlayerMessage(room, s1, { t: 'ready', ready: false });
snap = snapshotFor(room, { role: 'host' });
check('ready can be taken back', snap.players[s1].ready === false);

handlePlayerMessage(room, s1, { t: 'ready', ready: true });
handlePlayerMessage(room, s2, { t: 'ready', ready: true });
snap = snapshotFor(room, { role: 'host' });
check('both phones ready reads as a full house', snap.players.every(p => !p || p.ready === true));

/* the show starts: the host publishes the first question */
const pub = handleHostMessage(room, { t: 'publish_question', qid: 'q1', kind: 'normal', category: 'Movies', round: 1, baseValue: 100, deadlineMs: 20000, answers: ['a', 'b', 'c', 'd'], correctIdx: 0 });
check('the first publish lands', !pub.error, JSON.stringify(pub).slice(0, 120));
snap = snapshotFor(room, { role: 'host' });
check('the first publish spends every ready flag', snap.players.every(p => !p || p.ready === false));

r = handlePlayerMessage(room, s1, { t: 'ready', ready: true });
snap = snapshotFor(room, { role: 'host' });
check('a ready spoken mid-show changes nothing', snap.players[s1].ready === false);

console.log(fails ? 'READY TESTS FAILED (' + fails + ')' : 'READY TESTS PASSED');
process.exit(fails ? 1 : 0);
