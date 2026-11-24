/* Subtraction Pass II (2026-11-24) — THE DECLARATION IS CUT.
 * The All or Nothing call that once doubled a seat's last-question
 * bet (improvement Pass 3, 2026-11-17) is gone: Jimmy's ruling on
 * the road-to-9 queue — one wager in the show, and the finale bet
 * is it. Drives room.js handlers directly (no socket harness),
 * like the jeopardy suite. Proves: the referee no longer knows
 * the word 'declare' at ANY point of the night (the unknown-verb
 * answer, at both breaks and mid-round alike); no snapshot for
 * any viewer carries a declared field; a legacy room record that
 * still carries declared flags (a room persisted before the cut)
 * settles PLAIN anyway — nothing reads them; and the whole Big
 * Finish settles on the plain graduated schedule throughout:
 * Q13/Q14 banks pay the stake, failures cost half; Q15 pays the
 * stake and a failure costs stake + $300, floored at the score.
 * The choreography and bets are the old declaration suite's own,
 * so every figure that used to double is checked at its plain
 * value. Run: node test/test-declaration.js */
import { createRoom, handleHello, handleHostMessage, handlePlayerMessage, reportFor, snapshotFor, expireIfNeeded, setNowProvider } from '../room.js';

let T = 1_700_001_200_000;
setNowProvider(() => T);

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name, detail || ''); }
}

const room = createRoom('DECL', 'hosttok', null);
handleHello(room, { role: 'host', hostToken: 'hosttok' });
handleHello(room, { role: 'player', name: 'Ana' }); // seat 0
handleHello(room, { role: 'player', name: 'Bo' });  // seat 1
handleHello(room, { role: 'player', name: 'Cy' });  // seat 2
const host = (m) => handleHostMessage(room, m);
const play = (seat, m) => handlePlayerMessage(room, seat, m);
const scores = () => room.players.map((p) => (p ? p.score : null));
const bySeat = () => Object.fromEntries(room.lastReveal.results.map((r) => [r.seat, r]));
const unknown = (r) => !!r && r.error === 'Unknown message.';
/* Pass 14: a finale reveal holds its breath — run the clock
 * past the longest breath and let the room's expiry speak it */
const breathe = () => { T += 3100; expireIfNeeded(room); };

// ---- cushion: Ana banks $2,000 on a Round 1 number question ----
host({ t: 'publish_question', qid: 'qC', round: 1, kind: 'num', category: 'Movies', deadlineMs: 20000, baseValue: 2000, trueNum: 40 });
play(0, { t: 'answer', qid: 'qC', num: 40 });
play(1, { t: 'answer', qid: 'qC', num: 999 });
play(2, { t: 'answer', qid: 'qC', num: 999 });
host({ t: 'reveal', qid: 'qC' });
ok(scores()[0] === 2000, 'cushion: Ana banks $2,000', JSON.stringify(scores()));

// ---- the referee no longer knows the word, anywhere ----
ok(unknown(play(0, { t: 'declare' })), 'declare during play is an unknown verb now');
host({ t: 'intermission', nextRound: 2 });
ok(unknown(play(0, { t: 'declare' })), 'declare at the Round 2 break is an unknown verb now');

// ---- a Round 2 question, so the room can rest again ----
host({ t: 'publish_question', qid: 'qR2', round: 2, kind: 'normal', category: 'Movies', deadlineMs: 20000, baseValue: 200, correctIdx: 1, answersCount: 4 });
play(0, { t: 'answer', qid: 'qR2', pick: 0 });
play(1, { t: 'answer', qid: 'qR2', pick: 0 });
play(2, { t: 'answer', qid: 'qR2', pick: 0 });
host({ t: 'reveal', qid: 'qR2' });
host({ t: 'intermission', nextRound: 3 });
ok(unknown(play(0, { t: 'declare' })), 'declare at the Big Finish break is an unknown verb now');
ok(unknown(play(1, { t: 'declare' })), 'declare from a second pad is an unknown verb now');
ok(!room.declared || !Object.values(room.declared).some(Boolean), 'no call is recorded on the room', JSON.stringify(room.declared));
ok(!('declared' in snapshotFor(room, { role: 'host' })), 'the host snapshot carries no declared field');
ok(!('declared' in snapshotFor(room, { role: 'player', seat: 0 })), 'a pad snapshot carries no declared field');

/* A room persisted BEFORE the cut may still carry the flags on
 * its record. Plant them by hand: the settles below must read
 * straight past them — nothing in the referee consults them. */
room.declared = { 0: true, 1: true };

// ---- Q13: plain pay, plain losses, legacy flags inert ----
host({ t: 'bet_phase', qid: 'q13' });
play(0, { t: 'bet', qid: 'q13', chips: 2 });
play(1, { t: 'bet', qid: 'q13', chips: 1 });
play(2, { t: 'bet', qid: 'q13', chips: 1 });
host({ t: 'publish_question', qid: 'q13', round: 3, kind: 'normal', category: 'Movies', deadlineMs: 20000, baseValue: 100, correctIdx: 2, answersCount: 4 });
ok(unknown(play(2, { t: 'declare' })), 'declare mid-round is an unknown verb now');
play(1, { t: 'answer', qid: 'q13', pick: 2 }); // Bo correct first (quick-draw his)
play(0, { t: 'answer', qid: 'q13', pick: 2 }); // Ana correct, 2 chips
play(2, { t: 'answer', qid: 'q13', pick: 0 }); // Cy wrong, score $0
host({ t: 'reveal', qid: 'q13' });
breathe();
ok(bySeat()[0].banked === 200, 'Q13: a legacy-flagged seat banks PLAIN — 2 chips = $200', JSON.stringify(bySeat()[0]));
ok(scores()[1] === 250, 'Q13: Bo banks $100 + $150 quick-draw', JSON.stringify(scores()));

// ---- Q14: a failure costs the plain half ----
host({ t: 'bet_phase', qid: 'q14' });
play(0, { t: 'bet', qid: 'q14', chips: 3 });
play(1, { t: 'bet', qid: 'q14', chips: 1 });
play(2, { t: 'bet', qid: 'q14', chips: 1 });
host({ t: 'publish_question', qid: 'q14', round: 3, kind: 'normal', category: 'Movies', deadlineMs: 20000, baseValue: 100, correctIdx: 1, answersCount: 4 });
play(0, { t: 'answer', qid: 'q14', pick: 0 }); // Ana wrong, 3 chips
play(1, { t: 'answer', qid: 'q14', pick: 0 }); // Bo wrong, 1 chip
play(2, { t: 'answer', qid: 'q14', pick: 0 }); // Cy wrong, score $0
host({ t: 'reveal', qid: 'q14' });
breathe();
ok(bySeat()[0].lost === 150 && scores()[0] === 2050, 'Q14: the failure costs the plain half — $150', JSON.stringify(bySeat()[0]));
ok(bySeat()[1].lost === 50 && scores()[1] === 200, 'Q14: Bo loses the plain $50', JSON.stringify(bySeat()[1]));

// ---- Q15: the last question settles plain — no double either way ----
host({ t: 'bet_phase', qid: 'q15' });
play(0, { t: 'bet', qid: 'q15', chips: 3 });
play(1, { t: 'bet', qid: 'q15', chips: 2 });
play(2, { t: 'bet', qid: 'q15', chips: 1 });
host({ t: 'publish_question', qid: 'q15', round: 3, kind: 'normal', category: 'Movies', deadlineMs: 20000, baseValue: 100, correctIdx: 3, answersCount: 4 });
play(2, { t: 'answer', qid: 'q15', pick: 3 }); // Cy correct first (quick-draw his)
play(0, { t: 'answer', qid: 'q15', pick: 3 }); // Ana correct, 3 chips
play(1, { t: 'answer', qid: 'q15', pick: 0 }); // Bo wrong, 2 chips, score $200
host({ t: 'reveal', qid: 'q15' });
breathe();
ok(bySeat()[0].banked === 300, 'Q15: the bank pays the bet PLAIN — 3 chips = $300, not $600', JSON.stringify(bySeat()[0]));
ok(bySeat()[2].banked === 250, 'Q15: Cy settles plainly — $100 bet + $150 quick-draw', JSON.stringify(bySeat()[2]));
ok(bySeat()[1].lost === 200 && scores()[1] === 0, 'Q15: the failure owes $200 + $300 = $500 plain, floored at the $200 held — not the doubled $1,000', JSON.stringify(bySeat()[1]));
ok(scores()[0] === 2350, 'scores settle: Ana 2050 + 300 = 2350', JSON.stringify(scores()));

// ---- the Report Card reads the settled figures ----
const rep = reportFor(room);
ok(rep[0].lost === 150, 'report: Ana lost $150 on the night (Q14 only)', JSON.stringify(rep[0]));
ok(rep[1].lost === 250, 'report: Bo lost $250 (50 plain + 200 floored from the plain 500)', JSON.stringify(rep[1]));

// ---- a fresh show: the word stays unknown, the field stays absent ----
host({ t: 'end_show' });
host({ t: 'new_show' });
ok(unknown(play(0, { t: 'declare' })), 'new_show: declare is still an unknown verb');
ok(!('declared' in snapshotFor(room, { role: 'host' })), 'new_show: snapshots still carry no declared field');

console.log(`\ntest-declaration: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
