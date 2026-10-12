/* Food Truck Manager — ALL tunables live here. Nothing gameplay-related is
 * hardcoded anywhere else. Tweak by playing, not by guessing. */
var FTC = {
  BUILD: '20261012a',          // bump on every change (cache-bust + menu build tag)
  GAME_ID: 'food-truck',       // gamez-arcade leaderboard slot
  SAVE_KEY: 'ftm_save_v1',
  VOL_KEY: 'ftm_vol',

  SHIFT_LEN: 150,              // seconds per lunch rush
  GRILL_SLOTS: 4,
  HOLDING_SLOTS: 3,            // +1 with bigger-warmer upgrade
  MAX_WINDOW: 6,               // max concurrent walk-up customers
  MAX_DRIVEUP: 3,              // max concurrent drive-up customers

  /* ---- Buzz: one transparent difficulty dial (CSD's, rescaled for mobile) ----
   * Higher buzz = faster arrivals AND shorter patience. Good service raises it,
   * bad service lowers it, so it self-regulates. */
  BUZZ_START: 20,
  BUZZ_MAX: 115,
  BUZZ_PERFECT: 2,
  BUZZ_OK: 1,
  BUZZ_BAD: -2,
  BUZZ_WALKOUT: -3,
  BUZZ_BURNT_TRASH: -1,

  /* Patience: base seconds at 0% buzz; every 5% buzz deducts PATIENCE_PER5. */
  PATIENCE_BASE: 30,
  PATIENCE_PER5: -1.2,
  PATIENCE_MIN: 8,

  /* Arrival interval: lerp between base and min by buzz/115, jittered. */
  ARRIVE_BASE: 8.0,
  ARRIVE_MIN: 3.2,
  ARRIVE_JITTER: 0.3,

  /* ---- Menu: taco truck. pts = difficulty for the menu budget tariff. ---- */
  DISHES: {
    taco:       { name: 'Taco',        pts: 0, cook: 6,  perfect: 4, price: 4.0, grill: true  },
    quesadilla: { name: 'Quesadilla',  pts: 1, cook: 8,  perfect: 4, price: 6.0, grill: true  },
    nachos:     { name: 'Nachos',      pts: 1, cook: 7,  perfect: 4, price: 5.5, grill: true  },
    burrito:    { name: 'Burrito',     pts: 2, cook: 10, perfect: 5, price: 8.0, grill: true  },
    elote:      { name: 'Elote',       pts: 2, cook: 9,  perfect: 4, price: 7.0, grill: true  },
    agua:       { name: 'Agua Fresca', pts: 0, cook: 0,  perfect: 0, price: 3.0, grill: false }
  },
  MENU_TARIFF: 6,              // max difficulty points on the menu
  MENU_MAX_DISHES: 6,

  /* ---- Customer archetypes: polarized stats turn triage into strategy. ---- */
  ARCH: {
    std:    { patience: 1.00, tip: 1.00, weight: 55 },
    biz:    { patience: 0.55, tip: 2.00, weight: 18 },   // impatient, generous
    senior: { patience: 1.60, tip: 0.50, weight: 17 },   // patient, cheap
    critic: { patience: 0.80, tip: 3.00, weight: 10 }    // Sunday only; a bad serve costs a star
  },

  /* ---- Grill ---- */
  BURN_GRACE: 6,               // seconds past the perfect window before food burns
  WARN_EARLY: 3,               // burn warning fires this many seconds before burnt

  /* ---- Holding stations: spoilage as freshness 1->0 over HOLD_SPOIL sec ---- */
  HOLD_SPOIL: 50,
  HOLD_PERFECT: 0.70,          // fresh above this = perfect serve
  HOLD_OK: 0.35,               // fresh above this = ok serve, below = bad

  /* ---- Combo: serve-in-sequence tip multiplier ---- */
  COMBO_STEP: 0.10,
  COMBO_CAP: 10,               // max +100%
  COMBO_MILESTONES: [5, 10, 15, 20],

  /* ---- Scoring ---- */
  SCORE_REV: 10,               // per $1 revenue
  SCORE_PERFECT: 25,
  SCORE_COMBO: 15,             // per max-combo point

  /* ---- Upgrades: every one deletes a specific pain (Flipline pattern) ---- */
  UPGRADES: {
    alarm:   { name: 'Oven Alarms',   desc: 'Burn warnings fire 4s earlier. Never lose lunch to a forgotten grill again.', cost: 60,  pain: 'burnt food' },
    doorbell:{ name: 'Doorbell',      desc: 'A chime + flash the instant anyone arrives. No more missed walk-ups.',            cost: 45,  pain: 'missed arrivals' },
    warmer:  { name: 'Bigger Warmer', desc: '+1 holding station and food stays fresh 30% longer. Prep ahead with confidence.', cost: 120, pain: 'prep space' },
    scraper: { name: 'Auto-Scraper',  desc: 'Burnt food clears itself after 4s. One less chore in the rush.',                 cost: 90,  pain: 'trash chores' },
    lights:  { name: 'String Lights', desc: 'The truck glows. Walk-up customers wait 12% longer.',                             cost: 75,  pain: 'short patience' },
    chalk:   { name: 'Chalkboard Art',desc: 'A beautiful menu board. Tips up 12%.',                                            cost: 75,  pain: 'thin tips' },
    awning:  { name: 'Side Awning',   desc: 'Shade for the drive-up lane. Drive-up customers wait 25% longer.',                cost: 65,  pain: 'drive-up walkouts' }
  },

  /* ---- Regulars ("The Usual"): visits to unlock, then one-tap prep ---- */
  USUAL_VISITS: 3,
  REGULAR_CHANCE: 0.22,        // spawn roll for a scheduled regular vs a stranger

  /* ---- Feel tuning ---- */
  SHAKE_MAX: 14,               // px at trauma 1
  SHAKE_DECAY: 2.0,            // trauma per second
  HITSTOP_PERFECT: 0.05,       // wall-clock seconds
  HITSTOP_MILESTONE: 0.08,
  INPUT_BUFFER: 0.12,          // seconds
  FLASH_LEN: 0.15,

  /* ---- Haptics vocabulary (ms patterns) ---- */
  HAPTIC: {
    select: [10], light: [20], serve: [15, 30, 15],
    perfect: [10, 40, 10], warn: [20, 60, 20],
    error: [40, 80, 40, 40, 80, 40]
  },

  ARCADE_URL: 'https://gamez-arcade.chaoticutopia84.workers.dev',
  AI_URL: 'https://gamez-ai.chaoticutopia84.workers.dev'
};

if (typeof module !== 'undefined' && module.exports) module.exports = FTC;
