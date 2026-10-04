/* Neon Void deep-pass headless tests: seeded RNG determinism + config sanity. */
'use strict';
const fs = require('fs');
const vm = require('vm');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }

// --- extract mulberry32 from game.js and test it ---
const src = fs.readFileSync('/home/hatch/workspace/gamez/neon-void/game.js', 'utf8');
const m = src.match(/function mulberry32\(a\) \{[\s\S]*?\n  \}/);
ok(!!m, 'mulberry32 found in game.js');
const rngSrc = m[0] + '\nvar rng = mulberry32(12345); var seq1 = [rng(), rng(), rng(), rng(), rng()];\n' +
  'var rng2 = mulberry32(12345); var seq2 = [rng2(), rng2(), rng2(), rng2(), rng2()];\n' +
  'var rng3 = mulberry32(99999); var seq3 = [rng3(), rng3()];\n' +
  '({seq1, seq2, seq3});';
const r = vm.runInNewContext(rngSrc, {});
ok(JSON.stringify(r.seq1) === JSON.stringify(r.seq2), 'same seed -> identical sequence');
ok(r.seq1[0] !== r.seq3[0] || r.seq1[1] !== r.seq3[1], 'different seed -> different sequence');
ok(r.seq1.every(v => v >= 0 && v < 1), 'rng output in [0,1)');
// known mulberry32 vector: seed 1 first value ~ 0.627... (sanity: deterministic, in range)
const v1 = vm.runInNewContext(m[0] + '\nmulberry32(1)();', {});
ok(typeof v1 === 'number' && v1 >= 0 && v1 < 1, 'mulberry32(1) produces valid number');

// --- config sanity ---
const cfgSrc = fs.readFileSync('/home/hatch/workspace/gamez/neon-void/config.js', 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(cfgSrc, sandbox);
const C = sandbox.window.NV_CONFIG;
ok(!!C, 'NV_CONFIG loads');
const need = ['player', 'dash', 'spawn', 'surge', 'elite', 'well', 'geoms', 'combat',
  'lives', 'fx', 'haptics', 'audio', 'perf', 'difficulty', 'remembers', 'enemies'];
need.forEach(k => ok(C[k] !== undefined, 'config section: ' + k));
ok(C.player.speed > 0 && C.player.fireInterval > 0, 'player tunables positive');
ok(C.dash.cooldown > C.dash.time && C.dash.iframes > 0, 'dash timing sane');
ok(C.geoms.perMult > 0 && C.geoms.maxMult >= 150, 'mult progression sane');
ok(C.fx.shakeCap <= 40 && C.fx.poolN >= 200, 'fx caps sane');
ok(Object.keys(C.enemies).length >= 4, 'enemy types defined');
ok(C.haptics.select && C.haptics.error, 'haptic vocabulary complete');
ok(C.spawn.riftTelegraph >= 0.5, 'spawn telegraph readable');
ok(C.perf.dprCap <= 2, 'DPR capped at 2');

// --- structural: required DOM ids referenced by game.js exist in index.html ---
const html = fs.readFileSync('/home/hatch/workspace/gamez/neon-void/index.html', 'utf8');
const ids = ['game', 'hud', 'score', 'mult', 'multbar', 'multfill', 'lives', 'pause-btn',
  'banner', 'brief', 'hints', 'hint-l', 'hint-r', 'bomb-btn', 'menu', 'best', 'remembers',
  'start', 'daily', 'best-daily', 'haptics-btn', 'sound-btn', 'motion-btn', 'tilt-btn',
  'menu-lb', 'over', 'over-mode', 'final-score', 'best2', 'debrief', 'lb-rank', 'lb-form',
  'lb-name', 'lb-save', 'over-lb', 'again', 'pause', 'resume-btn', 'quit-btn'];
const missing = ids.filter(id => !new RegExp('id="' + id + '"').test(html));
ok(missing.length === 0, 'all DOM ids present' + (missing.length ? ' (missing: ' + missing.join(',') + ')' : ''));
// every getElementById in game.js resolves to an id in the html
const used = [...src.matchAll(/getElementById\('([^']+)'\)/g)].map(x => x[1]);
const unres = [...new Set(used)].filter(id => !new RegExp('id="' + id + '"').test(html));
ok(unres.length === 0, 'all getElementById targets exist' + (unres.length ? ' (missing: ' + unres.join(',') + ')' : ''));
// script order: config before game
ok(html.indexOf('config.js') < html.indexOf('game.js'), 'config.js loads before game.js');

console.log(`---\nRESULT: ${fail === 0 ? 'CLEAN' : 'PROBLEMS'} (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
