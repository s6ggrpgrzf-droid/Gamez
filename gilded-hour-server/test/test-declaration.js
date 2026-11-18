/* The Declaration (improvement Pass 3, 2026-11-17) — at the break
 * before the Big Finish, any player may call All or Nothing on the
 * last question: bank it and the bet pays double; fail it and the
 * graduated jeopardy figure doubles. Drives room.js handlers
 * directly (no socket harness), like the jeopardy suite.
 * Proves: the call is accepted ONLY at the nextRound-3 break, once,
 * and is public on the room record; it is INERT on Q13/Q14 (plain
 * payouts, plain half-stake losses); on Q15 a declared bank pays
 * the bet double (bonuses still flat) and a declared failure costs
 * (stake + $300) x 2, floored at the seat's score; an undeclared
 * seat settles plainly throughout; a fresh show clears the calls.
 * Run: node test/test-declaration.js */
import { createRoom, handleHello, handleHostMessage, handlePlayerMessage, reportFor, setNowProvider } from '../room.js';

let T = 1_700_001_200_000;
setNowProvider(() => T);

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name, detail || ''); }
}

const room = createRoom('DECL', 'hosttok', null);
handleHello(room, { role: 'host', hostToken: 'hosttok' });
handleHello(room, { role: 'player', name: 'Ana' }); // seat 0 — declares
handleHello(room, { role: 'player', name: 'Bo' });  // seat 1 — declares
handleHello(room, { role: 'player', name: 'Cy' });  // seat 2 — never declares
const host = (m) => handleHostMessage(room, m);
const play = (seat, m) => handlePlayerMessage(room, seat, m);
const scores = () => room.players.map((p) => (p ? p.score : null));
const bySeat = () => Object.fromEntries(room.lastReveal.results.map((r) => [r.seat, r]));

// ---- cushion: Ana banks $2,000 on a Round 1 number question ----
host({ t: 'publish_question', qid: 'qC', round: 1, kind: 'num', category: 'Movies', deadlineMs: 20000, baseValue: 2000, trueNum: 40 });
play(0, { t: 'answer', qid: 'qC', num: 40 });
play(1, { t: 'answer', qid: 'qC', num: 999 });
play(2, { t: 'answer', qid: 'qC', num: 999 });
host({ t: 'reveal', qid: 'qC' });
ok(scores()[0] === 2000, 'cushion: Ana banks $2,000', JSON.stringify(scores()));

// ---- the call is refused outside its one break ----
ok(play(0, { t: 'declare' }).error != null, 'declare during play is refused');
host({ t: 'intermission', nextRound: 2 });
ok(play(0, { t: 'declare' }).error != null, 'declare at the Round 2 break is refused — only the last break carries it');

// ---- a Round 2 question, so the room can rest again ----
host({ t: 'publish_question', qid: 'qR2', round: 2, kind: 'normal', category: 'Movies', deadlineMs: 20000, baseValue: 200, correctIdx: 1, answersCount: 4 });
play(0, { t: 'answer', qid: 'qR2', pick: 0 });
play(1, { t: 'answer', qid: 'qR2', pick: 0 });
play(2, { t: 'answer', qid: 'qR2', pick: 0 });
host({ t: 'reveal', qid: 'qR2' });
host({ t: 'intermission', nextRound: 3 });
ok(play(0, { t: 'declare' }).error == null, 'Ana declares at the Big Finish break');
ok(play(1, { t: 'declare' }).error == null, 'Bo declares at the Big Finish break');
ok(play(0, { t: 'declare' }).error != null, 'a second call is refused — there is no taking it back');
ok(room.declared[0] === true && room.declared[1] === true && room.declared[2] == null, 'the calls are on the room record, public', JSON.stringify(room.declared));

// ---- Q13: the declaration is inert — plain pay, plain losses ----
host({ t: 'bet_phase', qid: 'q13' });
play(0, { t: 'bet', qid: 'q13', chips: 2 });
play(1, { t: 'bet', qid: 'q13', chips: 1 });
play(2, { t: 'bet', qid: 'q13', chips: 1 });
host({ t: 'publish_question', qid: 'q13', round: 3, kind: 'normal', category: 'Movies', deadlineMs: 20000, baseValue: 100, correctIdx: 2, answersCount: 4 });
ok(play(2, { t: 'declare' }).error != null, 'declare mid-round is refused');
play(1, { t: 'answer', qid: 'q13', pick: 2 }); // Bo correct first (quick-draw his)
play(0, { t: 'answer', qid: 'q13', pick: 2 }); // Ana correct, 2 chips
play(2, { t: 'answer', qid: 'q13', pick: 0 }); // Cy wrong, score $0
host({ t: 'reveal', qid: 'q13' });
ok(bySeat()[0].banked === 200, 'Q13: a declared seat banking early is paid PLAIN — 2 chips = $200, not $400', JSON.stringify(bySeat()[0]));
ok(scores()[1] === 250, 'Q13: Bo banks $100 + $150 quick-draw', JSON.stringify(scores()));

// ---- Q14: a declared failure costs the plain half ----
host({ t: 'bet_phase', qid: 'q14' });
play(0, { t: 'bet', qid: 'q14', chips: 3 });
play(1, { t: 'bet', qid: 'q14', chips: 1 });
play(2, { t: 'bet', qid: 'q14', chips: 1 });
host({ t: 'publish_question', qid: 'q14', round: 3, kind: 'normal', category: 'Movies', deadlineMs: 20000, baseValue: 100, correctIdx: 1, answersCount: 4 });
play(0, { t: 'answer', qid: 'q14', pick: 0 }); // Ana wrong, 3 chips
play(1, { t: 'answer', qid: 'q14', pick: 0 }); // Bo wrong, 1 chip
play(2, { t: 'answer', qid: 'q14', pick: 0 }); // Cy wrong, score $0
host({ t: 'reveal', qid: 'q14' });
ok(bySeat()[0].lost === 150 && scores()[0] === 2050, 'Q14: a declared failure still costs the plain half — $150', JSON.stringify(bySeat()[0]));
ok(bySeat()[1].lost === 50 && scores()[1] === 200, 'Q14: Bo loses the plain $50', JSON.stringify(bySeat()[1]));

// ---- Q15: the declaration settles — double pay, double cost ----
host({ t: 'bet_phase', qid: 'q15' });
play(0, { t: 'bet', qid: 'q15', chips: 3 });
play(1, { t: 'bet', qid: 'q15', chips: 2 });
play(2, { t: 'bet', qid: 'q15', chips: 1 });
host({ t: 'publish_question', qid: 'q15', round: 3, kind: 'normal', category: 'Movies', deadlineMs: 20000, baseValue: 100, correctIdx: 3, answersCount: 4 });
play(2, { t: 'answer', qid: 'q15', pick: 3 }); // Cy correct first (quick-draw his, undeclared)
play(0, { t: 'answer', qid: 'q15', pick: 3 }); // Ana correct, 3 chips, declared
play(1, { t: 'answer', qid: 'q15', pick: 0 }); // Bo wrong, 2 chips, declared, score $200
host({ t: 'reveal', qid: 'q15' });
ok(bySeat()[0].banked === 600, 'Q15: a declared bank pays the bet DOUBLE — 3 chips = $600', JSON.stringify(bySeat()[0]));
ok(bySeat()[2].banked === 250, 'Q15: the undeclared seat settles plainly — $100 bet + $150 quick-draw', JSON.stringify(bySeat()[2]));
ok(bySeat()[1].lost === 200 && scores()[1] === 0, 'Q15: a declared failure owes ($200 + $300) x 2 = $1,000, floored at the $200 held', JSON.stringify(bySeat()[1]));
ok(scores()[0] === 2650, 'scores settle: Ana 2050 + 600 = 2650', JSON.stringify(scores()));

// ---- the Report Card reads the settled figures ----
const rep = reportFor(room);
ok(rep[0].lost === 150, 'report: Ana lost $150 on the night (Q14 only — Q15 was doubled the other way)', JSON.stringify(rep[0]));
ok(rep[1].lost === 250, 'report: Bo lost $250 (50 plain + 200 floored from the doubled 1,000)', JSON.stringify(rep[1]));

// ---- a fresh show clears every call ----
host({ t: 'end_show' });
host({ t: 'new_show' });
ok(Object.keys(room.declared || {}).length === 0, 'new_show: declarations cleared', JSON.stringify(room.declared));

console.log(`\ntest-declaration: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
