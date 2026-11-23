/* Pass 13 — About This Room, online (room.js).
   A pad writes a fact in the lobby; the host's snapshot alone
   carries the collection; a pad sees only its own; the plant
   publishes as an ordinary question whose face rides the
   record; a fresh show collects fresh facts. */
import { createRoom, handleHello, handlePlayerMessage, handleHostMessage, snapshotFor } from '../room.js';

let fails = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); if (!ok) fails++; }

const room = createRoom('TEST');
handleHello(room, { role: 'host' }, 'host1');
const j1 = handleHello(room, { role: 'player', name: 'Ana' }, 'p1');
const j2 = handleHello(room, { role: 'player', name: 'Bo' }, 'p2');
const s1 = j1.identity.seat, s2 = j2.identity.seat;

/* --- the lobby collection --- */
let r = handlePlayerMessage(room, s1, { t: 'room_fact', text: 'once sang karaoke through a hurricane', subject: s2 });
check('a fact is accepted in the lobby', !r.error, JSON.stringify(r).slice(0, 120));

let hsnap = snapshotFor(room, { role: 'host' });
check('the host snapshot carries the fact', hsnap.facts && hsnap.facts[s1] && hsnap.facts[s1].subject === s2 && /karaoke/.test(hsnap.facts[s1].text));

let p1snap = snapshotFor(room, { role: 'player', seat: s1 });
let p2snap = snapshotFor(room, { role: 'player', seat: s2 });
check('the author sees their own fact', p1snap.yourFact && p1snap.yourFact.subject === s2);
check('the other pad sees none of it', p2snap.yourFact === null && !('facts' in p2snap));

r = handlePlayerMessage(room, s1, { t: 'room_fact', text: '  can   hold their breath for two minutes  ', subject: s1 });
hsnap = snapshotFor(room, { role: 'host' });
check('a fact is replaceable, whitespace-collapsed, and may be about oneself',
  !r.error && hsnap.facts[s1].subject === s1 && hsnap.facts[s1].text === 'can hold their breath for two minutes');

r = handlePlayerMessage(room, s2, { t: 'room_fact', text: '', subject: s1 });
check('an empty fact is refused', !!r.error);
r = handlePlayerMessage(room, s2, { t: 'room_fact', text: 'a real fact', subject: 3 });
check('a fact about an empty seat is refused', !!r.error);
r = handlePlayerMessage(room, s2, { t: 'room_fact', text: 'a real fact', subject: 'Bo' });
check('a fact about a NAME is refused — subjects are seats', !!r.error);

/* --- the plant publishes as an ordinary question with a face --- */
const pub = handleHostMessage(room, {
  t: 'publish_question', qid: 'roomq.abc123', kind: 'normal', category: 'About This Room',
  round: 2, baseValue: 200, multiplier: 2, deadlineMs: 20000,
  correctIdx: 1, answersCount: 4, cutIndices: [0, 2],
  roomText: 'Who in this room can hold their breath for two minutes?',
  roomAnswers: ['Bo', 'Ana', 'Sterling', 'Nobody — Sterling made it up'],
});
check('the planted publish lands', !pub.error, JSON.stringify(pub).slice(0, 140));

p2snap = snapshotFor(room, { role: 'player', seat: s2 });
check('the pad snapshot carries the face', p2snap.question && p2snap.question.roomText === 'Who in this room can hold their breath for two minutes?'
  && Array.isArray(p2snap.question.roomAnswers) && p2snap.question.roomAnswers.length === 4);
check('the face never carries the secret', p2snap.question.correctIdx == null);
hsnap = snapshotFor(room, { role: 'host' });
check('the host resync still gets the secret', hsnap.question && hsnap.question.correctIdx === 1);

/* a fact spoken mid-show is refused */
r = handlePlayerMessage(room, s2, { t: 'room_fact', text: 'too late', subject: s1 });
check('a fact spoken mid-show is refused', !!r.error);

/* a malformed face is dropped, not fatal */
const room2 = createRoom('TES2');
handleHello(room2, { role: 'host' }, 'host1');
handleHello(room2, { role: 'player', name: 'Ana' }, 'p1');
const pub2 = handleHostMessage(room2, {
  t: 'publish_question', qid: 'q1.5.zzz', kind: 'normal', category: 'Movies',
  round: 1, baseValue: 100, deadlineMs: 20000, correctIdx: 0, answersCount: 4,
  roomText: 'Who in this room?', roomAnswers: ['only', 'three', 'names'],
});
check('a mismatched face does not sink the publish', !pub2.error);
const snap2 = snapshotFor(room2, { role: 'player', seat: 0 });
check('the mismatched face is not carried', !(snap2.question && snap2.question.roomText));

/* --- a fresh show collects fresh facts --- */
handleHostMessage(room, { t: 'end_show' });
const ns = handleHostMessage(room, { t: 'new_show' });
check('new_show lands after the end', !ns.error, JSON.stringify(ns).slice(0, 120));
hsnap = snapshotFor(room, { role: 'host' });
check('a fresh show starts with an empty pocket', hsnap.facts && Object.keys(hsnap.facts).length === 0);

console.log(fails ? 'ROOMFACT TESTS FAILED (' + fails + ')' : 'ROOMFACT TESTS PASSED');
process.exit(fails ? 1 : 0);
