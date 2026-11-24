#!/usr/bin/env node
/* build-rules.js — generate the two rules twins from the
 * canonical core (rules-core.js):
 *
 *   rules.js                      (browser: window.GH_RULES)
 *   ../gilded-hour-server/rules.js (worker: ES-module exports)
 *
 *   node build-rules.js           regenerate both twins
 *   node build-rules.js --check   fail if either twin has drifted
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const core = fs.readFileSync(path.join(ROOT, 'rules-core.js'), 'utf8');

const NAMES = ['QUICK_DRAW_BONUS', 'STREAK_BONUS', 'STREAK_MIN', 'STREAK_DEATH_MIN',
  'BET_PAYOUT', 'BASE_BET_CAP', 'MAX_BET_CAP', 'LONG_SHOT_STEP', 'BLUFF_FOOL',
  'BET_LOSS_EARLY', 'FINAL_WRONG_PENALTY', 'DECLARE_MULT'];

const browser = core +
  '\n/* ---- browser footer (generated) ---- */\n' +
  'window.GH_RULES = {\n' +
  NAMES.map(n => '  ' + n + ': GH_' + n + ',').join('\n') + '\n' +
  '  qdAmount: ghQdAmount,\n  streakAmount: ghStreakAmount,\n  melt: ghMelt,\n  betCap: ghBetCap,\n  betLoss: ghBetLoss,\n  betPayout: ghBetPayout\n};\n';

const worker = core +
  '\n/* ---- worker footer (generated) ---- */\n' +
  NAMES.map(n => 'export const ' + n + ' = GH_' + n + ';').join('\n') + '\n' +
  'export function qdAmount(round) { return ghQdAmount(round); }\n' +
  'export function streakAmount(round) { return ghStreakAmount(round); }\n' +
  'export function melt(baseValue, multiplier, frac) { return ghMelt(baseValue, multiplier, frac); }\n' +
  'export function betCap(scores, seat) { return ghBetCap(scores, seat); }\n' +
  'export function betLoss(chips, qInRound) { return ghBetLoss(chips, qInRound); }\n' +
  'export function betPayout(chips) { return ghBetPayout(chips); }\n';

const targets = [
  { file: path.join(ROOT, 'rules.js'), body: browser, label: 'gilded-hour/rules.js' },
  { file: path.join(ROOT, '..', 'gilded-hour-server', 'rules.js'), body: worker, label: 'gilded-hour-server/rules.js' }
];

if (process.argv.includes('--check')) {
  let drift = 0;
  for (const t of targets) {
    const current = fs.existsSync(t.file) ? fs.readFileSync(t.file, 'utf8') : null;
    if (current !== t.body) { console.error('DRIFT: ' + t.label + ' is not what rules-core.js builds. Run: node build-rules.js'); drift = 1; }
  }
  if (!drift) console.log('both rules twins match rules-core.js');
  process.exit(drift);
} else {
  for (const t of targets) { fs.writeFileSync(t.file, t.body); console.log('built ' + t.label + ' (' + t.body.length + ' bytes)'); }
}
