/* Show the Band (The Ten, pass 3) — the dealt difficulty band goes
 * public. Direct room-handler suite (no DO harness needed: the band
 * lives entirely in publish + snapshot). Proves: a validated band
 * (1|2|3) named on publish_question rides the question record into
 * EVERY viewer's public question view (host and players alike, from
 * open through the reveal phase); garbage bands (0, 4, 2.5, "3",
 * true, missing) are stored as null — never an error, never
 * trusted; a Decider publish carries the ACTUAL dealt band like
 * any other question; and the band moves no money — settlement
 * with a band is cent-identical to settlement without one.
 * Run: node test/test-band.js */
import { createRoom, handleHello, handleHostMessage, handlePlayerMessage, snapshotFor, setNowProvider } from '../room.js';

let T = 1_700_200_000_000;
setNowProvider(() => T);

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name, detail || ''); }
}

function roomWith(n) {
  const room = createRoom('BAND', 'tok');
  handleHello(room, { role: 'host', hostToken: 'tok' });
  for (let i = 0; i < n; i++) handleHello(room, { role: 'player', name: 'P' + i });
  return room;
}
const hostView = { role: 'host' };
const seatView = (s) => ({ role: 'player', seat: s });
const pub = (room, extra) => handleHostMessage(room, Object.assign({
  t: 'publish_question', qid: 'q1.1.aa', round: 1, kind: 'normal', category: 'Movies',
  deadlineMs: 20000, baseValue: 300, multiplier: 1, correctIdx: 1, answersCount: 4,
}, extra || {}));

// ---- the three true bands ride to every viewer ----
for (const b of [1, 2, 3]) {
  const room = roomWith(3);
  const res = pub(room, { band: b });
  ok(!res.error, 'band ' + b + ': publish accepted', res.error);
  ok(room.question.band === b, 'band ' + b + ': stored on the record');
  ok(snapshotFor(room, hostView).question.band === b, 'band ' + b + ': host snapshot carries it');
  ok(snapshotFor(room, seatView(0)).question.band === b, 'band ' + b + ': player snapshot carries it');
  ok(snapshotFor(room, seatView(2)).question.band === b, 'band ' + b + ': every seat, not just one');
}

// ---- garbage is null, never an error ----
for (const g of [0, 4, 2.5, '3', true, null, undefined, NaN, -1]) {
  const room = roomWith(2);
  const res = pub(room, { band: g });
  ok(!res.error, 'band ' + JSON.stringify(g) + ': publish still accepted (no error)');
  ok(snapshotFor(room, hostView).question.band === null,
     'band ' + JSON.stringify(g) + ': public view reads null', String(snapshotFor(room, hostView).question.band));
}
{
  const room = roomWith(2);
  pub(room, {}); // no band field at all — an older host
  ok(snapshotFor(room, seatView(1)).question.band === null, 'band omitted entirely: null, the unbanded question');
}

// ---- it persists through the reveal (the header never drops it) ----
{
  const room = roomWith(3);
  pub(room, { band: 3 });
  handlePlayerMessage(room, 0, { t: 'answer', qid: 'q1.1.aa', pick: 1 });
  handlePlayerMessage(room, 1, { t: 'answer', qid: 'q1.1.aa', pick: 0 });
  handlePlayerMessage(room, 2, { t: 'answer', qid: 'q1.1.aa', pick: 1 });
  const res = handleHostMessage(room, { t: 'reveal', qid: 'q1.1.aa' });
  ok(!res.error && room.phase === 'reveal', 'reveal reached', res.error);
  ok(snapshotFor(room, hostView).question.band === 3, 'band still on the public view at reveal (host)');
  ok(snapshotFor(room, seatView(0)).question.band === 3, 'band still on the public view at reveal (pad)');
  // and the money is the ordinary money, cent for cent: the same
  // answers in an identical room WITHOUT a band settle identically
  // (seat 0's extra $50 over seat 2 is the Quick Draw, in both).
  const plain = roomWith(3);
  pub(plain, {});
  handlePlayerMessage(plain, 0, { t: 'answer', qid: 'q1.1.aa', pick: 1 });
  handlePlayerMessage(plain, 1, { t: 'answer', qid: 'q1.1.aa', pick: 0 });
  handlePlayerMessage(plain, 2, { t: 'answer', qid: 'q1.1.aa', pick: 1 });
  handleHostMessage(plain, { t: 'reveal', qid: 'q1.1.aa' });
  const banded = room.players.filter(Boolean).map((p) => p.score);
  const unbanded = plain.players.filter(Boolean).map((p) => p.score);
  ok(JSON.stringify(banded) === JSON.stringify(unbanded) && banded[0] > 0 && banded[1] === 0,
     'settlement cent-identical with and without a band', JSON.stringify({ banded, unbanded }));
}

// ---- the Decider carries its ACTUAL dealt band ----
{
  const room = roomWith(3);
  room.players[0].score = 500; room.players[1].score = 500; room.players[2].score = 100;
  const res = handleHostMessage(room, {
    t: 'publish_question', qid: 'q16.7.zz', round: 3, kind: 'num', category: 'TV',
    deadlineMs: 30000, baseValue: 300, multiplier: 1, trueNum: 42,
    decider: true, eligible: [0, 1], band: 2,
  });
  ok(!res.error, 'decider publish accepted', res.error);
  const q = snapshotFor(room, seatView(2)).question;
  ok(q.decider === true && q.band === 2, 'decider snapshot: decider flag AND the actual band 2 (a fallback deal, not an assumed 3)',
     JSON.stringify({ decider: q.decider, band: q.band }));
}

// ---- a re-publish of a room persisted before the field existed ----
{
  const room = roomWith(2);
  pub(room, { band: 1 });
  delete room.question.band; // a record written by the old build
  ok(snapshotFor(room, hostView).question.band === null, 'legacy record without the field: snapshot reads null, never undefined');
}

console.log('TEST-BAND DONE — ' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) process.exit(1);
