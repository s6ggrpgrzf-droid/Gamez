/* THE GILDED HOUR — the shared money rules, canonical core.
 *
 * Every figure the game pays by, written ONCE. Two builds are
 * generated from this file by build-rules.js:
 *
 *   rules.js (beside this file) — the browser twin: this core
 *     plus a window.GH_RULES footer. game.js loads it first and
 *     reads its declarations from here.
 *   ../gilded-hour-server/rules.js — the worker twin: this core
 *     plus ES-module exports. room.js imports from it.
 *
 * Edit THIS file, run `node build-rules.js`, and commit all
 * three. `node build-rules.js --check` fails if either twin
 * has drifted from the core.
 *
 * What lives here: only the rules BOTH runtimes must agree on,
 * to the cent — the bonuses, the bet caps, the bluff's fool
 * fee, and the melt. What does not: anything one side owns
 * alone (the client's base values; the server's room limits
 * and clocks).
 *
 * THE ROUNDING (audit finding #9, unified 2026-11-16): every
 * settled figure rounds to the nearest $10, inside the melt
 * itself, so the local game and the online room can never
 * drift apart again — the local earned() path routes through
 * this same melt. Before this, the local game settled to $10
 * while the room settled the melt's raw $1 figure. */
const GH_QUICK_DRAW_BONUS = 50;  // first correct lock-in, on an ordinary question — paid x the round ($50/$100/$150)
const GH_STREAK_BONUS = 25;      // RETIRED (Subtraction Pass I, 2026-11-23): streaks no longer pay — the figure stays only so the generated twins keep their shape; nothing awards it
const GH_STREAK_MIN = 3;         // banks in a row before Sterling names the streak (narration only)
const GH_STREAK_DEATH_MIN = 4;   // a dying run of this length or more earns a named moment
const GH_BET_PAYOUT = 100;       // one Big Finish chip is worth $100
const GH_BASE_BET_CAP = 3;       // chips any seat may ride in the Big Finish
const GH_MAX_BET_CAP = 5;        // the Long Shot ceiling
const GH_LONG_SHOT_STEP = 1000;  // one extra chip per full $1,000 a seat trails the leader
const GH_BLUFF_FOOL = 25;        // THE BLUFF: per player a lie fools, paid by the house
const GH_BET_LOSS_EARLY = 0.5;   // Jeopardy pass (2026-11-17): fraction of the stake a missed bet costs on Big Finish questions 1-2
const GH_FINAL_WRONG_PENALTY = 300; // Jeopardy pass: the last Big Finish question's wrong-answer penalty, on top of the full stake
const GH_DECLARE_MULT = 2;       // RETIRED (Subtraction Pass II, 2026-11-24): the Declaration is cut — the figure stays only so the generated twins keep their shape; nothing reads it

function ghQdAmount(round) { return GH_QUICK_DRAW_BONUS * (round || 1); }
function ghStreakAmount(round) { return GH_STREAK_BONUS * (round || 1); }

/* The melt: a question's value drains linearly from full to
   half across its window, then rounds to the nearest $10 —
   the one rounding every settle in the game uses. frac is
   the elapsed fraction; the callers clamp it the way they
   always have. */
function ghMelt(baseValue, multiplier, frac) {
  return Math.max(0, Math.round(baseValue * multiplier * (1 - 0.5 * frac) / 10) * 10);
}

/* The Long Shot cap: base chips plus one per full step a seat
   trails the leader, never above the ceiling. scores is a
   plain array of numbers; seat indexes into it. */
/* Jeopardy (improvement Pass 2, 2026-11-17, Jimmy's pick —
   "both, graduated"): what a FAILED Big Finish bet costs the
   bettor, before the $0 floor the callers apply. Questions 1-2
   take half the stake; the last question takes the whole stake
   plus the face-value penalty. A bet fails when the seat does
   not bank the question — wrong pick, wrong number, or no
   answer at all: the bet was on yourself, and silence is not
   a loophole. qInRound is 0-based within Round 3. The pot's
   feed is a separate, older rule and does not read this. */
function ghBetLoss(chips, qInRound) {
  var stake = (chips || 0) * GH_BET_PAYOUT;
  return qInRound >= 2 ? stake + GH_FINAL_WRONG_PENALTY : Math.round(stake * GH_BET_LOSS_EARLY);
}

/* What a BANKED Big Finish bet pays: the stake, plain. The
   house's bonuses (Quick Draw) are never multiplied — they
   land flat on top. (The Declaration once doubled this figure
   on the last question; Subtraction Pass II cut it, and the
   finale bet now stands alone as the show's one wager.) */
function ghBetPayout(chips) {
  return (chips || 0) * GH_BET_PAYOUT;
}

function ghBetCap(scores, seat) {
  if (!scores || scores[seat] == null) return GH_BASE_BET_CAP;
  let lead = scores[seat];
  for (let i = 0; i < scores.length; i++) if (scores[i] > lead) lead = scores[i];
  return Math.min(GH_MAX_BET_CAP, GH_BASE_BET_CAP + Math.floor(Math.max(0, lead - scores[seat]) / GH_LONG_SHOT_STEP));
}

/* ---- worker footer (generated) ---- */
export const QUICK_DRAW_BONUS = GH_QUICK_DRAW_BONUS;
export const STREAK_BONUS = GH_STREAK_BONUS;
export const STREAK_MIN = GH_STREAK_MIN;
export const STREAK_DEATH_MIN = GH_STREAK_DEATH_MIN;
export const BET_PAYOUT = GH_BET_PAYOUT;
export const BASE_BET_CAP = GH_BASE_BET_CAP;
export const MAX_BET_CAP = GH_MAX_BET_CAP;
export const LONG_SHOT_STEP = GH_LONG_SHOT_STEP;
export const BLUFF_FOOL = GH_BLUFF_FOOL;
export const BET_LOSS_EARLY = GH_BET_LOSS_EARLY;
export const FINAL_WRONG_PENALTY = GH_FINAL_WRONG_PENALTY;
export const DECLARE_MULT = GH_DECLARE_MULT;
export function qdAmount(round) { return ghQdAmount(round); }
export function streakAmount(round) { return ghStreakAmount(round); }
export function melt(baseValue, multiplier, frac) { return ghMelt(baseValue, multiplier, frac); }
export function betCap(scores, seat) { return ghBetCap(scores, seat); }
export function betLoss(chips, qInRound) { return ghBetLoss(chips, qInRound); }
export function betPayout(chips) { return ghBetPayout(chips); }
