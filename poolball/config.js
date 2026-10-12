/* Poolball — ALL tunables live here. Nothing gameplay-related is hardcoded
 * anywhere else. Tweak by playing, not by guessing. */
var PBC = {
  BUILD: '20261012b',            // bump on every change (cache-bust + menu build tag)
  GAME_ID: 'poolball',           // gamez-arcade leaderboard slot
  ARCADE_BASE: 'https://gamez-arcade.chaoticutopia84.workers.dev',
  NAME_KEY: 'arcade_name',       // shared arcade name in localStorage
  SAVE_KEY: 'poolball_save_v1',
  DAILY_KEY: 'poolball_daily_v1',
  MUTE_KEY: 'poolball_mute',

  W: 480, H: 800,               // logical canvas

  /* ---------- table geometry (logical px) ---------- */
  PLAY: { x: 24, y: 170, w: 432, h: 216 },  // cushion-to-cushion play field (2:1)
  RAIL: 20,                      // wooden rail width around play field
  BALL_R: 11,
  POCKET_CORNER_R: 15,           // capture radius, corner pockets
  POCKET_SIDE_R: 17,             // capture radius, side pockets
  POCKET_SUCK_R: 36,             // magnetism radius — pockets "suck" balls in
  POCKET_SUCK_A: 900,           // suck acceleration px/s^2 at mouth
  SINK_T: 0.30,                  // drop-in animation seconds

  /* ---------- pull / shot ---------- */
  MAX_PULL: 189,                 // px of finger drag = full power (230 sim-px * VIEW_S 0.82)
  MIN_POWER: 0.07,              // below this, release cancels (no misfires)
  SHOT_MIN_V: 260,               // px/s at min power
  SHOT_MAX_V: 1450,              // px/s at full power
  PRECISE_K: 0.30,              // precise-aim toggle: angle delta multiplier

  /* ---------- physics ---------- */
  SUBSTEP: 1 / 120,
  BALL_E: 0.96,                  // ball-ball restitution
  CUSHION_E: 0.72,               // cushion restitution (lively, not dead)
  CUSHION_KEEP: 0.92,            // tangential velocity kept off cushions
  FRICTION: 1.15,                // exponential rolling decay
  FRICTION_LIN: 26,              // linear decay px/s^2 (guarantees a stop)
  STOP_V: 7,                     // below this speed, ball stops
  SPIN_ROLL_F: 95,               // follow/draw accel px/s^2 at full spin
  SPIN_ROLL_S: 55,               // sidespin curve accel px/s^2 at full spin
  SPIN_DECAY: 2.0,               // spin exponential decay /s
  SPIN_FOLLOW_V: 170,            // cue-ball kick along travel dir at full spin
  SPIN_RAIL: 75,                 // sidespin tangential kick off cushions
  SPIN_RAIL_N: 0.10,             // topspin/backspin cushion bite

  /* ---------- rules / scoring ---------- */
  BALLS_PER_TABLE: 8,            // object balls 1..8; 8-ball must go last
  PAR: 10,                       // shots for 3 stars
  POT_BASE: 100,
  EIGHT_BASE: 500,
  BANK_X: 2,                     // cushion-before-contact multiplier
  LONG_BONUS: 50,                // long-shot bonus
  LONG_DIST: 340,                // cue travel px counting as "long"
  MULTI_BONUS: 50,               // each extra ball potted on one shot
  STREAK_STEP: 0.25,             // combo: +25% per consecutive potting shot

  /* ---------- juice ---------- */
  SHAKE_BREAK: 0.55,             // trauma on the break
  SHAKE_POT: 0.18,
  HITSTOP_BREAK: 0.05,           // seconds of freeze on the break
  SLOWMO_T: 0.7,                 // 8-ball slow-mo duration
  SLOWMO_K: 0.35,                // 8-ball slow-mo timescale

  /* ---------- look ---------- */
  FELT: '#116329',
  FELT_DARK: '#0a3f1c',
  WOOD: '#5a3a22',
  WOOD_DARK: '#3a2413',
  BRASS: '#c9a227',
};
if (typeof module !== 'undefined' && module.exports) module.exports = PBC;
