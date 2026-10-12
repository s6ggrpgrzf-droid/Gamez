// Night Market — content.js — DATA ONLY. No logic, no functions that mutate.
// Static defs keyed by id; the sim owns all behavior. Written with heart.
var NM = window.NM || {};

// ---------------------------------------------------------------- stalls ---
// unlock order: noodle, tea, dumpling, skewer, lantern, tofu, fan, pearl.
// unlockAt: {stall, count} — own `count` of `stall` to unlock. null = open.
// dish: true if this stall fills the dish tray (food stalls).
var CNT_STALLS = [
  { id: 'noodle', name: "Grandma Lin's Noodles", baseCost: 15, costRatio: 1.07,
    baseRate: 0.1, dish: true, unlockAt: null, unlockHint: 'Open from the start',
    blurb: 'Hand-pulled since before the lanterns were lit. Grandma Lin counts every strand. There are always more than you think.' },
  { id: 'tea', name: 'The Steeping Stone', baseCost: 100, costRatio: 1.08,
    baseRate: 1, dish: false, unlockAt: { stall: 'noodle', count: 8 },
    unlockHint: 'Own 8 noodle stalls',
    blurb: 'Tea that tastes like gossip and rain. The cups are small because the stories are long.' },
  { id: 'dumpling', name: 'Pleats & Thank You', baseCost: 1100, costRatio: 1.09,
    baseRate: 8, dish: true, unlockAt: { stall: 'tea', count: 8 },
    unlockHint: 'Own 8 tea stalls',
    blurb: 'Eighteen folds. Zero survivors. The pleats are so precise they have been mistaken for origami.' },
  { id: 'skewer', name: 'Skewer the Moment', baseCost: 12000, costRatio: 1.10,
    baseRate: 47, dish: true, unlockAt: { stall: 'dumpling', count: 8 },
    unlockHint: 'Own 8 dumpling stalls',
    blurb: 'Seize the satay. Charcoal-kissed, cumin-dusted, gone in four bites. Regret comes free with every order.' },
  { id: 'lantern', name: 'Wick & Whimsy', baseCost: 132000, costRatio: 1.12,
    baseRate: 376, dish: false, unlockAt: { stall: 'skewer', count: 8 },
    unlockHint: 'Own 8 skewer stalls',
    blurb: 'Lightly used metaphors, brand-new lanterns. Each one is painted with a wish. Most wishes are for snacks.' },
  { id: 'tofu', name: 'Tofu the People', baseCost: 1450000, costRatio: 1.13,
    baseRate: 3008, dish: true, unlockAt: { stall: 'lantern', count: 8 },
    unlockHint: 'Own 8 lantern stalls',
    blurb: 'Silken revolution in every cube. Power to the palate. The mapo has a waiting list.' },
  { id: 'fan', name: 'Big Fan Energy', baseCost: 16000000, costRatio: 1.14,
    baseRate: 24064, dish: false, unlockAt: { stall: 'tofu', count: 8 },
    unlockHint: 'Own 8 tofu stalls',
    blurb: 'Cool down. Look great doing it. Hand-painted silk, sandalwood ribs, and a breeze with opinions.' },
  { id: 'pearl', name: 'The Gilded Oyster', baseCost: 176000000, costRatio: 1.15,
    baseRate: 192512, dish: false, unlockAt: { stall: 'fan', count: 8 },
    unlockHint: 'Own 8 fan stalls',
    blurb: 'Every oyster tells a story. Most of them are lies. The pearls, however, are real, and so is the markup.' }
];

// --------------------------------------------------------------- upgrades ---
// One-time purchases. effect.kind: 'cps' | 'stall' | 'dish'.
var CNT_UPGRADES = [
  { id: 'secondwok', name: 'Second Wok', cost: 1000,
    effect: { kind: 'cps', mult: 1.5 },
    blurb: 'Twice the wok, twice the glory. The first wok is jealous.' },
  { id: 'secretbroth', name: 'Secret Broth', cost: 3000,
    effect: { kind: 'stall', stall: 'noodle', mult: 3 },
    blurb: 'Grandma will not tell. We stopped asking. The broth got better out of spite.' },
  { id: 'teariffic', name: 'Tea-riffic Blends', cost: 12000,
    effect: { kind: 'stall', stall: 'tea', mult: 3 },
    blurb: 'Puns included at no extra charge. Oolong and far from home.' },
  { id: 'signboard', name: 'The Humming Signboard', cost: 15000,
    effect: { kind: 'cps', mult: 1.5 },
    blurb: 'Hand-painted by a sign-writer who only works at dusk. Moths queue up like regulars; customers follow their lead.' },
  { id: 'pleatelite', name: 'Pleat Elite', cost: 60000,
    effect: { kind: 'stall', stall: 'dumpling', mult: 3 },
    blurb: 'Only the finest folds. Applicants are judged on pleat symmetry and attitude.' },
  { id: 'charcoalup', name: 'Charcoal Upgrade', cost: 250000,
    effect: { kind: 'stall', stall: 'skewer', mult: 3 },
    blurb: 'Binchotan. Say it fancy. The skewers have never tasted this smug.' },
  { id: 'glowharder', name: 'Glow Harder', cost: 1000000,
    effect: { kind: 'stall', stall: 'lantern', mult: 3 },
    blurb: 'Visible from the next district. Pilots use it for navigation.' },
  { id: 'silkentouch', name: 'Silken Touch', cost: 4000000,
    effect: { kind: 'stall', stall: 'tofu', mult: 3 },
    blurb: 'Handle with reverence. The tofu can sense fear.' },
  { id: 'goldenchops', name: 'Golden Chopsticks', cost: 8000000,
    effect: { kind: 'dish', mult: 3 },
    blurb: 'Every bite tastes like victory. Dish values triple. Do not use them to point.' },
  { id: 'pearlwisdom', name: 'Pearl of Wisdom', cost: 20000000,
    effect: { kind: 'stall', stall: 'pearl', mult: 3 },
    blurb: 'Priceless. Literally, we lost the price tag. The oysters approve.' }
];

// ------------------------------------------------------------------ staff ---
// Named people with playful flavor. effect.kind: 'cps' | 'stall' | 'dish'.
var CNT_STAFF = [
  { id: 'slurpsup', name: 'Slurp Supervisor', role: 'Noodle quality control', cost: 400,
    effect: { kind: 'stall', stall: 'noodle', mult: 2 },
    flavor: 'Inspects every noodle personally. Quality control, one slurp at a time.' },
  { id: 'wokstar', name: 'Wok Star', role: 'Head line cook', cost: 2000,
    effect: { kind: 'cps', mult: 1.25 },
    flavor: 'He puts the wok into everything. Including the staff meetings.' },
  { id: 'brewhaha', name: 'Brew Ha-Ha', role: 'Tea comedian', cost: 5000,
    effect: { kind: 'stall', stall: 'tea', mult: 2 },
    flavor: 'His oolong jokes are steeped in tragedy. Customers stay for the refills.' },
  { id: 'diva', name: "Dumplin' Diva", role: 'Pleat artist', cost: 25000,
    effect: { kind: 'stall', stall: 'dumpling', mult: 2 },
    flavor: 'She pleats, she slays. Eighteen folds, zero notes.' },
  { id: 'skewerrev', name: 'The Skewer Reviewer', role: 'Former critic', cost: 120000,
    effect: { kind: 'stall', stall: 'skewer', mult: 2 },
    flavor: 'One-star reviews, five-star satay. Retired the pen, kept the palate.' },
  { id: 'wickkeeper', name: 'The Wick-Keeper', role: 'Lantern tender', cost: 500000,
    effect: { kind: 'stall', stall: 'lantern', mult: 2 },
    flavor: 'Keeps the flame. Keeps the secrets. Knows which lantern is yours before you do.' },
  { id: 'tofutitan', name: 'Tofu Fighter', role: 'Cube specialist', cost: 2500000,
    effect: { kind: 'stall', stall: 'tofu', mult: 2 },
    flavor: 'There goes my hero. Watch him get cubed. The silken kind, obviously.' },
  { id: 'nightmayor', name: 'The Night Mayor', role: 'Elected official (snacks)', cost: 12000000,
    effect: { kind: 'cps', mult: 1.5 },
    flavor: 'Elected on a platform of snacks. Approval rating: delicious.' }
];

// --------------------------------------------------------------- regulars ---
// favorite: stall id. Mementos unlock at 5 / 15 / 30 visits (+1 gem each).
var CNT_REGULARS = [
  { id: 'auntie-mei', name: 'Auntie Mei', favorite: 'noodle',
    quirk: "Orders 'the usual' though she has never been here before.",
    memento: { name: 'Chipped Soup Spoon', text: 'She says it tastes better. She is right.' } },
  { id: 'night-nia', name: 'Night-Shift Nia', favorite: 'noodle',
    quirk: 'Gets off work at 3am. The market is her living room.',
    memento: { name: 'Expired Bus Transfer', text: 'She never needed the ride home.' } },
  { id: 'old-chen', name: 'Old Chen', favorite: 'tea',
    quirk: 'Falls asleep mid-sip, wakes up for refills. Every time.',
    memento: { name: 'Bottomless Cup', text: 'It has never once been empty.' } },
  { id: 'gong-gary', name: 'Gong-Show Gary', favorite: 'tea',
    quirk: 'Rings the gong with his forehead. We stopped stopping him.',
    memento: { name: 'Dented Mallet', text: 'Retired after the forehead incident.' } },
  { id: 'the-twins', name: 'Jia & Jia', favorite: 'dumpling',
    quirk: "Argue over the last dumpling. Always order two 'last' dumplings.",
    memento: { name: 'Split Chopstick', text: 'One pair, two owners, zero regrets.' } },
  { id: 'xiao-bao', name: 'Little Dumpling', favorite: 'dumpling',
    quirk: 'A kid who reviews dumplings like a tiny food critic.',
    memento: { name: 'Crayon Review: 5 Stars', text: "Spelled 'delicious' wrong. Felt it right." } },
  { id: 'marathon-mai', name: 'Marathon Mai', favorite: 'skewer',
    quirk: 'Eats while jogging in place. Never stops. Never.',
    memento: { name: 'Sweaty Headband', text: 'Smells like victory and cumin.' } },
  { id: 'prof-lumen', name: 'Professor Lumen', favorite: 'lantern',
    quirk: 'Grades the lanterns. Gives them all A-minus.',
    memento: { name: 'Red Pen, No Ink', text: 'He ran out grading the moon.' } },
  { id: 'keeper', name: 'The Lantern Keeper', favorite: 'lantern',
    quirk: 'Nobody knows his name. The lanterns lean toward him.',
    memento: { name: 'Unlit Wick', text: 'He says some lights are for later.' } },
  { id: 'silent-bo', name: 'Silent Bo', favorite: 'tofu',
    quirk: "Has not spoken in six years. Tips in origami cranes.",
    memento: { name: 'Paper Crane', text: 'The 1,000th one. He started over.' } },
  { id: 'fan-faye', name: 'Fan Dancer Faye', favorite: 'fan',
    quirk: 'Buys a fan every visit. Owns four hundred.',
    memento: { name: 'Feather #401', text: "She says this one is the keeper." } },
  { id: 'countess-bao', name: 'Countess Bao', favorite: 'pearl',
    quirk: 'Pays in pearls. For pearls. It is pearls all the way down.',
    memento: { name: 'IOU, Signed', text: 'Written on a napkin. Worth a fortune in charm.' } }
];

// ----------------------------------------------------------------- quests ---
// progKey: the internal counter key the sim increments.
var CNT_QUESTS = [
  // Coin rewards are paced against the tier economy: a warm nudge, never a
  // tier skip. (openday 250 / gong25 500 / stalls5 1200 used to insta-buy the
  // first three tiers — first tea landed at ~5s instead of a few minutes.)
  { id: 'gong25', progKey: 'gong', text: 'Ring the night gong 25 times',
    target: 25, reward: { coins: 100 } },
  { id: 'dishes8', progKey: 'dishes', text: 'Sell 8 dishes from the tray',
    target: 8, reward: { coins: 200 } },
  { id: 'stalls5', progKey: 'stalls', text: 'Open 5 new stalls',
    target: 5, reward: { coins: 100 } },
  { id: 'earn50k', progKey: 'earn', text: 'Earn 50,000 coins today',
    target: 50000, reward: { gems: 3 } },
  { id: 'openday', progKey: 'openday', text: 'Open the night market',
    target: 1, reward: { coins: 30 } }
];

// -------------------------------------------------------- season upgrades ---
// Bought with banked lanterns; survive New Season resets.
var CNT_SEASON_UPGRADES = [
  { id: 'endowment', name: 'Paper Lantern Endowment', cost: 2,
    effect: { kind: 'cps', mult: 1.5 },
    blurb: 'The market glows a little prouder. So do you.' },
  { id: 'drummers', name: 'Festival Drummers', cost: 5,
    effect: { kind: 'cps', mult: 2 },
    blurb: 'You can feel the beat in your coins.' },
  { id: 'abacus', name: 'Jade Abacus', cost: 12,
    effect: { kind: 'cps', mult: 3 },
    blurb: 'Every bead clicks like a cash register.' },
  { id: 'dragon', name: "Dragon's Blessing", cost: 25,
    effect: { kind: 'cps', mult: 5 },
    blurb: 'The dragon only blesses markets with good snacks. Congratulations.' }
];

// --------------------------------------------------------- random visitors ---
// Spontaneous night-market encounters (engine: sim.js). Warm, unhurried,
// zero cyberpunk. The player picks: take the windfall, or ride the boost.
var CNT_VISITORS = [
  { id: 'poet', name: 'Wandering Poet',
    flavor: 'A traveling poet trades a verse for a bowl of noodles, then reads it aloud. The whole row leans in. Nobody can quite remember the words afterward, but everybody tips like they can.' },
  { id: 'tourist', name: 'Lost Tourist',
    flavor: 'A tourist stops to ask for directions and stays for three rounds of snacks. By the time anyone remembers the directions, half the ferry queue has followed him in.' }
];

function CNT_index(list) {
  var map = {};
  for (var i = 0; i < list.length; i++) map[list[i].id] = list[i];
  return map;
}

NM.content = {
  STALLS: CNT_STALLS,
  STALL_MAP: CNT_index(CNT_STALLS),
  UPGRADES: CNT_UPGRADES,
  UPGRADE_MAP: CNT_index(CNT_UPGRADES),
  STAFF: CNT_STAFF,
  STAFF_MAP: CNT_index(CNT_STAFF),
  REGULARS: CNT_REGULARS,
  REGULAR_MAP: CNT_index(CNT_REGULARS),
  VISITORS: CNT_VISITORS,
  VISITOR_MAP: CNT_index(CNT_VISITORS),
  QUEST_DEFS: CNT_QUESTS,
  QUEST_MAP: CNT_index(CNT_QUESTS),
  SEASON_UPGRADES: CNT_SEASON_UPGRADES,
  SEASON_UPGRADE_MAP: CNT_index(CNT_SEASON_UPGRADES),
  MILESTONES: [10, 25, 50, 100, 200], // each reached = x2 per-stall, stacking
  MEMENTO_VISITS: [5, 15, 30],        // regular visit thresholds -> memento + gem
  GONG_RUSH_TAPS: 25,
  GONG_RUSH_SECS: 30,
  GONG_RUSH_MULT: 3,
  DISH_CAP: 8
};
