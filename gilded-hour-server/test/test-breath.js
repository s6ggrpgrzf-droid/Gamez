/* Pass 14 — the held breath, online (room.js).
   A Big Finish reveal waits on the money: the reveal call
   seals the window and starts the breath, the alarm path
   (expireIfNeeded) speaks the reveal when the breath runs
   out, and the backstop path — a window lapsing unrevealed —
   breathes the same breath. Ordinary questions never wait. */
import { createRoom, handleHello, handlePlayerMessage, handleHostMessage, expireIfNeeded, finaleBreathMs, setNowProvider } from '../room.js';

let fails = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); if (!ok) fails++; }

let T = 1000000;
setNowProvider(() => T);

function freshRoom(players) {
  const room = createRoom('TEST');
  handleHello(room, { role: 'host' }, 'host1');
  const seats = [];
  players.forEach((name, i) => {
    const j = handleHello(room, { role: 'player', name }, 'p' + i);
    seats.push(j.identity.seat);
  });
  return { room, seats };
}
function betQuestion(room, seats, qid, bets, correctIdx) {
  handleHostMessage(room, { t: 'bet_phase', qid });
  seats.forEach((s, i) => { if (bets[i]) handlePlayerMessage(room, s, { t: 'bet', qid, chips: bets[i] }); });
  const pub = handleHostMessage(room, { t: 'publish_question', qid, round: 3, kind: 'normal', category: 'Movies', baseValue: 300, multiplier: 1, deadlineMs: 20000, correctIdx, answersCount: 4 });
  if (pub.error) throw new Error('publish failed: ' + pub.error);
}

/* --- the arithmetic, unit-level --- */
{
  const { room, seats } = freshRoom(['Ana', 'Bo']);
  const q = { round: 3, betted: true, decider: false, bets: { 0: 2, 1: 1 } };
  room.published = { '3': 1 };
  check('unit: 3 chips on the first finale question breathes 930ms', finaleBreathMs(room, q) === 930, String(finaleBreathMs(room, q)));
  room.published = { '3': 3 };
  check('unit: the last question breathes 1.4x — 1302ms', finaleBreathMs(room, q) === 1302, String(finaleBreathMs(room, q)));
  check('unit: a Round 2 bet question never breathes', finaleBreathMs(room, { round: 2, betted: true, decider: false, bets: { 0: 3, 1: 3 } }) === 0);
  check('unit: an unbetted finale question never breathes', finaleBreathMs(room, { round: 3, betted: false, decider: false, bets: {} }) === 0);
  check('unit: the decider never breathes', finaleBreathMs(room, { round: 3, betted: true, decider: true, bets: { 0: 3, 1: 3 } }) === 0);
  const solo = freshRoom(['Ana']);
  solo.room.published = { '3': 1 };
  check('unit: one chip still gets the 850ms floor', finaleBreathMs(solo.room, { round: 3, betted: true, decider: false, bets: { 0: 1 } }) === 850);
  const big = freshRoom(['A', 'B', 'C', 'D']);
  big.room.published = { '3': 3 };
  check('unit: twenty chips on the last question caps at 3000ms', finaleBreathMs(big.room, { round: 3, betted: true, decider: false, bets: { 0: 5, 1: 5, 2: 5, 3: 5 } }) === 3000);
}

/* --- the host-called reveal holds, then lands --- */
{
  const { room, seats } = freshRoom(['Ana', 'Bo']);
  betQuestion(room, seats, 'q13', [2, 1], 0);
  handlePlayerMessage(room, seats[0], { t: 'answer', qid: 'q13', pick: 0 });
  handlePlayerMessage(room, seats[1], { t: 'answer', qid: 'q13', pick: 1 });
  const r = handleHostMessage(room, { t: 'reveal', qid: 'q13' });
  check('the reveal call starts the breath instead of speaking', !r.error && !r.all && room.phase === 'answer', JSON.stringify(r).slice(0, 120));
  check('the breath is the wager\u2019s length — 930ms', room.question.breathUntil === T + 930, 'breathUntil-now=' + (room.question.breathUntil - T));
  const late = handlePlayerMessage(room, seats[1], { t: 'answer', qid: 'q13', pick: 0 });
  check('the held window is sealed — a late answer is refused', !!late.error && /closed/i.test(late.error), String(late.error));
  const again = handleHostMessage(room, { t: 'reveal', qid: 'q13' });
  check('a second reveal during the breath is a no-op', !again.error && !again.all);
  T += 929;
  check('one ms early, the room still holds', expireIfNeeded(room) === null && room.phase === 'answer');
  T += 1;
  const landed = expireIfNeeded(room);
  check('at the breath\u2019s end the reveal lands', !!landed && !!landed.all && landed.all.t === 'reveal' && room.phase === 'reveal', JSON.stringify(landed && landed.all).slice(0, 120));
  const res = (landed.all.results || []);
  check('the settlement waited with it — the 2-chip winner banks $350 ($200 stake + $150 quick-draw), the loser nothing',
    res.length === 2 && res[0].banked === 350 && res[0].quickDrawBonus === 150 && res[1].banked === 0, JSON.stringify(res).slice(0, 160));
}

/* --- the backstop: a lapsed window breathes the same breath --- */
{
  const { room, seats } = freshRoom(['Ana', 'Bo']);
  betQuestion(room, seats, 'q13', [1, 1], 0);
  T += 20001; // the window lapses with no reveal call
  const held = expireIfNeeded(room);
  check('a lapsed finale window starts the breath instead of revealing', !!held && !held.all && !!room.question.breathUntil && room.phase === 'answer', JSON.stringify(held).slice(0, 100));
  check('the backstop breath is the same 850ms floor for 2 chips', room.question.breathUntil === T + 850, 'breath=' + (room.question.breathUntil - T));
  T += 850;
  const landed = expireIfNeeded(room);
  check('and it lands when the breath runs out', !!landed && !!landed.all && landed.all.t === 'reveal');
}

/* --- ordinary questions never wait --- */
{
  const { room, seats } = freshRoom(['Ana', 'Bo']);
  handleHostMessage(room, { t: 'publish_question', qid: 'q1', round: 1, kind: 'normal', category: 'Movies', baseValue: 100, multiplier: 1, deadlineMs: 20000, correctIdx: 0, answersCount: 4 });
  handlePlayerMessage(room, seats[0], { t: 'answer', qid: 'q1', pick: 0 });
  const r = handleHostMessage(room, { t: 'reveal', qid: 'q1' });
  check('a Round 1 reveal speaks at once', !!r.all && r.all.t === 'reveal' && room.phase === 'reveal');
}

console.log(fails ? 'BREATH TESTS FAILED (' + fails + ')' : 'BREATH TESTS PASSED');
process.exit(fails ? 1 : 0);
