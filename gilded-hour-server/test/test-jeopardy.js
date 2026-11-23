/* Jeopardy (improvement Pass 2, 2026-11-17) — the Big Finish is the
 * one place at the table where money can be LOST. Drives room.js
 * handlers directly (no socket harness): the settlement under test
 * lives in closeQuestion, and the room record is the receipt.
 * Proves the graduated schedule end to end: a failed bet costs half
 * the stake on Big Finish questions 1-2; the last question takes the
 * whole stake plus the $300 penalty; deductions floor at the seat's
 * score (nobody goes below $0, and the floored figure is what the
 * result entry and the Report Card record); the pot's older feed
 * rule runs unchanged alongside; reportFor carries the night's lost
 * total per seat.
 * Run: node test/test-jeopardy.js */
import { createRoom, handleHello, handleHostMessage, handlePlayerMessage, reportFor, expireIfNeeded, setNowProvider } from '../room.js';

let T = 1_700_000_900_000;
setNowProvider(() => T);

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name, detail || ''); }
}

const room = createRoom('JEPD', 'hosttok', null);
handleHello(room, { role: 'host', hostToken: 'hosttok' });
handleHello(room, { role: 'player', name: 'Ana' }); // seat 0
handleHello(room, { role: 'player', name: 'Bo' });  // seat 1
const host = (m) => handleHostMessage(room, m);
const play = (seat, m) => handlePlayerMessage(room, seat, m);
const scores = () => room.players.map((p) => (p ? p.score : null));
/* Pass 14: a finale reveal holds its breath — run the clock
 * past the longest breath and let the room's expiry speak it */
const breathe = () => { T += 3100; expireIfNeeded(room); };
const bySeat = () => Object.fromEntries(room.lastReveal.results.map((r) => [r.seat, r]));

// ---- cushion: seat 0 banks $2,000 on a Round 1 number question ----
host({ t: 'publish_question', qid: 'qC', round: 1, kind: 'num', category: 'Movies', deadlineMs: 20000, baseValue: 2000, trueNum: 40 });
play(0, { t: 'answer', qid: 'qC', num: 40 });
play(1, { t: 'answer', qid: 'qC', num: 999 });
host({ t: 'reveal', qid: 'qC' });
ok(scores()[0] === 2000 && scores()[1] === 0, 'cushion: seat 0 banks the number in full, seat 1 nothing', JSON.stringify(scores()));
ok(room.pot === 0, 'cushion: a partial bank feeds the pot nothing', 'pot=' + room.pot);

// ---- Q13 (first Big Finish question): half-stake losses ----
host({ t: 'bet_phase', qid: 'q13' });
play(0, { t: 'bet', qid: 'q13', chips: 3 });
play(1, { t: 'bet', qid: 'q13', chips: 2 });
host({ t: 'publish_question', qid: 'q13', round: 3, kind: 'normal', category: 'Movies', deadlineMs: 20000, baseValue: 100, correctIdx: 2, answersCount: 4 });
play(0, { t: 'answer', qid: 'q13', pick: 0 }); // wrong, 3 chips
play(1, { t: 'answer', qid: 'q13', pick: 0 }); // wrong, 2 chips, score $0
host({ t: 'reveal', qid: 'q13' });
breathe();
ok(bySeat()[0].lost === 150 && scores()[0] === 1850, 'Q13: a failed 3-chip bet loses half the stake — $150', JSON.stringify(bySeat()[0]));
ok(bySeat()[1].lost === 0 && scores()[1] === 0, 'Q13: a $100 loss due at a $0 score floors to $0 taken — nobody goes below zero', JSON.stringify(bySeat()[1]));
ok(room.pot === 500, 'Q13: the pot feed is unchanged — missed stakes feed $300 + $200', 'pot=' + room.pot);

// ---- Q14 (second Big Finish question): half again; seat 1 banks ----
host({ t: 'bet_phase', qid: 'q14' });
play(0, { t: 'bet', qid: 'q14', chips: 3 });
play(1, { t: 'bet', qid: 'q14', chips: 1 });
host({ t: 'publish_question', qid: 'q14', round: 3, kind: 'normal', category: 'Movies', deadlineMs: 20000, baseValue: 100, correctIdx: 1, answersCount: 4 });
play(0, { t: 'answer', qid: 'q14', pick: 0 }); // wrong, 3 chips
play(1, { t: 'answer', qid: 'q14', pick: 1 }); // correct, 1 chip, first correct receipt
host({ t: 'reveal', qid: 'q14' });
breathe();
ok(bySeat()[0].lost === 150 && scores()[0] === 1700, 'Q14: the second question takes half again — $150', JSON.stringify(bySeat()[0]));
ok(bySeat()[1].banked === 250 && scores()[1] === 250, 'Q14: seat 1 banks the $100 bet plus the round-3 $150 quick-draw', JSON.stringify(bySeat()[1]));
ok(room.pot === 800, 'Q14: the one missed stake feeds $300 more', 'pot=' + room.pot);

// ---- Q15 (the last question): full stake + $300, floored ----
host({ t: 'bet_phase', qid: 'q15' });
play(0, { t: 'bet', qid: 'q15', chips: 3 });
play(1, { t: 'bet', qid: 'q15', chips: 3 });
host({ t: 'publish_question', qid: 'q15', round: 3, kind: 'normal', category: 'Movies', deadlineMs: 20000, baseValue: 100, correctIdx: 3, answersCount: 4 });
play(0, { t: 'answer', qid: 'q15', pick: 0 }); // wrong, 3 chips
play(1, { t: 'answer', qid: 'q15', pick: 0 }); // wrong, 3 chips, score $250
host({ t: 'reveal', qid: 'q15' });
breathe();
ok(bySeat()[0].lost === 600 && scores()[0] === 1100, 'Q15: a failed 3-chip bet loses the whole $300 stake plus the $300 penalty', JSON.stringify(bySeat()[0]));
ok(bySeat()[1].lost === 250 && scores()[1] === 0, 'Q15: a $600 loss due at a $250 score takes the $250 and stops at zero', JSON.stringify(bySeat()[1]));
ok(room.pot === 1400, 'Q15: both missed stakes feed $300 each — the pot rule never read the jeopardy figures', 'pot=' + room.pot);

// ---- the Report Card's debit column ----
const rep = reportFor(room);
ok(rep[0].lost === 900, 'report: seat 0 lost $900 across the Big Finish (150 + 150 + 600)', JSON.stringify(rep[0]));
ok(rep[1].lost === 250, 'report: seat 1 lost $250 — the floored figure, not the $600 due', JSON.stringify(rep[1]));

console.log(`\ntest-jeopardy: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
