/* Blood Moon — content.js
 * Pure data: enemy defs, upgrade defs, names, quotes, bloodlines.
 * No DOM. Safe to load in node for tests. */
(function (root) {
  'use strict';

  var ENEMIES = {
    villager: { name: 'Villager', hp: 22, speed: 72, dmg: 6, r: 14, xp: 1, color: '#8a7a5c', kind: 'melee' },
    torch:    { name: 'Torch Mob', hp: 34, speed: 98, dmg: 9, r: 14, xp: 2, color: '#c98a3a', kind: 'melee', light: 130 },
    priest:   { name: 'Priest', hp: 52, speed: 62, dmg: 5, r: 15, xp: 4, color: '#d8d2c0', kind: 'caster',
                novaDmg: 16, novaR: 110, castTime: 1.1, keepDist: 220 },
    hunter:   { name: 'Hunter', hp: 40, speed: 80, dmg: 5, r: 14, xp: 4, color: '#5c6e4a', kind: 'ranged',
                boltDmg: 11, boltSpeed: 420, keepDist: 300, shotCd: 2.2, aimTime: 0.8 },
    bellringer: { name: 'The Bell-Ringer', hp: 420, speed: 55, dmg: 18, r: 20, xp: 25, color: '#7a6a4a', kind: 'elite',
                novaDmg: 24, novaR: 150, castTime: 1.4, keepDist: 180, elite: true },
    witchfinder: { name: 'Witchfinder Captain', hp: 300, speed: 105, dmg: 8, r: 16, xp: 25, color: '#4a3f5c', kind: 'elite',
                boltDmg: 16, boltSpeed: 480, keepDist: 320, shotCd: 1.6, aimTime: 0.7, elite: true },
    stalker:  { name: 'The Pale Confessor', hp: 380, speed: 150, dmg: 22, r: 18, xp: 30, color: '#b8b0c0', kind: 'elite', elite: true },
    vanhelsing: { name: 'VAN HELSING', hp: 950, speed: 88, dmg: 14, r: 26, xp: 60, color: '#3a3f5c', kind: 'boss',
                stakeDmg: 20, stakeSpeed: 460, shotCd: 1.6, summonCd: 12 }
  };

  /* First-night unlock order: villagers immediately, torches ~25s, priests ~75s,
     hunters ~140s, Helsing at 240s (one minute before dawn). */
  var UNLOCK_AT = { villager: 0, torch: 25, priest: 75, hunter: 140, vanhelsing: 240 };

  var UPGRADES = [
    { id: 'fangs', name: 'Sharper Fangs', max: 5,
      desc: 'Bite damage +35%. Dentists hate him.',
      flavor: 'Crits quicken the moon. (mythic: Executioner)' },
    { id: 'bats', name: 'Bat Swarm', max: 5,
      desc: '+2 orbiting bats. They bite too.',
      flavor: 'They drink what you cannot reach. (mythic: Blood Frenzy)' },
    { id: 'whip', name: 'Blood Whip', max: 5,
      desc: 'A crimson lash strikes nearby foes. Damage +30%, faster.',
      flavor: 'Cracks like gossip.' },
    { id: 'aura', name: 'Crimson Aura', max: 5,
      desc: 'A burning aura melts nearby enemies.',
      flavor: 'Personal space: revoked. (mythic: Crimson Saint)' },
    { id: 'nova', name: 'Blood Moon', max: 5,
      desc: 'Every 24s the moon screams. Big damage, big radius.',
      flavor: 'Bite crits make it scream sooner. (mythic: Executioner)' },
    { id: 'dash', name: 'Mist Form', max: 5,
      desc: 'DASH button: become mist. Brief invulnerability, shorter cooldown.',
      flavor: 'Now you see me. No you don\'t.' },
    { id: 'wings', name: 'Swift Wings', max: 5,
      desc: 'Move speed +12%.',
      flavor: 'Cardio, but make it eternal.' },
    { id: 'gut', name: 'Iron Gut', max: 5,
      desc: 'Max HP +25 and heal 25 now. Garlic? Never met her.',
      flavor: 'A balanced diet of villagers. (mythic: Crimson Saint)' },
    { id: 'nap', name: 'Coffin Nap', max: 5,
      desc: 'Regenerate HP every second, even mid-fight.',
      flavor: 'The wounded saint burns brightest. (mythic: Crimson Saint)' },
    { id: 'nose', name: 'Keen Nose', max: 5,
      desc: 'Blood orb pickup radius +40%.',
      flavor: 'Smells like dinner. And fear.' },
    { id: 'cloak', name: 'Moon Cloak', max: 5,
      desc: 'Armor +2. Shrug off pitchforks.',
      flavor: 'Dry-clean only. Do not stake.' },
    { id: 'charm', name: 'Mesmerize', max: 5,
      desc: 'Kills may charm a villager to fight for you.',
      flavor: 'They were already halfway there.' }
  ];

  var VILLAGER_NAMES = [
    'Cabbage Karl', 'Pitchfork Pete', 'Turnip Tom', 'Mildred', 'Old Hemlock',
    'Bessie', 'Fennel Fred', 'Widow Wimple', 'Cooper', 'Gristle', 'Mabel',
    'Squire Dunce', 'Beetroot Barry', 'Prudence', ' stableboy Sam'.trim(), 'Gooseherd Gus'
  ];

  var SPAWN_QUOTES = [
    'My cabbages!', 'Not the livestock!', 'It\'s just a bat! …it\'s not just a bat.',
    'I left my torch on!', 'Tell my turnips I loved them.', 'He\'s behind you— oh.',
    'This is above my pay grade.', 'I just work here!', 'Somebody hold my pitchfork.',
    'Mildred! Fetch the garlic!', 'I knew the night shift was a mistake.'
  ];

  var FLEE_QUOTES = [
    'Nope nope nope!', 'I\'m too pretty to die!', 'My cabbages need me!',
    'Tell the priest I\'m busy!', 'I take it back! I take it all back!'
  ];

  var HELSING_LINES = [
    'I\'ve read about you.', 'This ends tonight.', 'Say hello to the sun for me.',
    'I don\'t miss.', 'One stake. That\'s all it takes.'
  ];

  var DAWN_LINES = [
    'The sun! The accursed sun!', 'To the shadows!', 'My beautiful pallor!'
  ];

  var OMENS = [
    { t: 90,  name: 'HUNTER AMBUSH',    sub: 'the bell tolls — steel rings you round' },
    { t: 180, name: 'PRIEST PROCESSION', sub: 'they come singing, and the ground burns' },
    { t: 240, name: 'BLOOD MOON RISES',  sub: 'for 30 seconds, every kill feeds double' }
  ];

  var SURGE_FLAVORS = {
    villager: { name: 'Sanguine Feast',   desc: 'heal burst' },
    priest:   { name: 'Sanctified Gut',   desc: 'holy resistance' },
    hunter:   { name: 'Fleet Humour',     desc: 'move speed' },
    torch:    { name: 'Kindled Veins',    desc: 'burn trail' }
  };

  /* ---- save migration + daily rules (pure, node-testable) ---- */
  var META_VER = 2;
  function migrateMeta(m) {
    m = m || {};
    var out = {
      ver: META_VER,
      bank: m.bank | 0,
      upg: m.upg || { vitality: 0, appetite: 0, swiftness: 0 },
      bloodline: m.bloodline || 'dominator',
      nightsSurvived: m.nightsSurvived | 0,
      bestKills: m.bestKills | 0,
      bestNights: m.bestNights | 0,
      nightmare: !!m.nightmare,
      nightmareOn: !!m.nightmareOn,
      dailyPlayed: m.dailyPlayed || null
    };
    if (BLOODLINE_MAP[out.bloodline]) out.bloodline = BLOODLINE_MAP[out.bloodline];
    if (!BLOODLINES[out.bloodline]) out.bloodline = 'dominator';
    return out;
  }
  var DailyRules = {
    key: function (d) { return d.toISOString().slice(0, 10); },
    canPlay: function (meta, key) { return meta.dailyPlayed !== key; },
    mark: function (meta, key) { meta.dailyPlayed = key; }
  };

  var BLOODLINES = {
    dominator: { name: 'Dominator', desc: 'Ventrue-brood. A fear aura scatters the mob; Blood Surges last half again as long.', unlock: 0,
                hp: 1.15, dmg: 1, speed: 1, dashCd: 1, verb: 'dominator' },
    swarm:     { name: 'Swarm Lord', desc: 'Nosferatu-brood. Bat minions orbit and feed for you; keener nose for blood.', unlock: 1,
                hp: 1.3, dmg: 1.1, speed: 0.95, dashCd: 1, verb: 'swarm' },
    blur:      { name: 'Blur', desc: 'Toreador-brood. Celerity: blinding speed, bat-form recharges in half the time, +damage while moving.', unlock: 3,
                hp: 0.85, dmg: 1, speed: 1.25, dashCd: 0.55, verb: 'blur' }
  };
  // old bloodline ids -> new (save migration)
  var BLOODLINE_MAP = { vlad: 'dominator', nosferatu: 'swarm', strigoi: 'blur' };

  var META_UPGRADES = [
    { id: 'vitality', name: 'Vitality', max: 5, desc: '+8% max HP per level',
      cost: function (lv) { return 100 * (lv + 1) * (lv + 1); } },
    { id: 'appetite', name: 'Appetite', max: 5, desc: '+8% blood (XP) per level',
      cost: function (lv) { return 100 * (lv + 1) * (lv + 1); } },
    { id: 'swiftness', name: 'Swiftness', max: 5, desc: '+5% move speed per level',
      cost: function (lv) { return 150 * (lv + 1) * (lv + 1); } }
  ];

  root.BloodMoonContent = {
    ENEMIES: ENEMIES,
    UNLOCK_AT: UNLOCK_AT,
    UPGRADES: UPGRADES,
    VILLAGER_NAMES: VILLAGER_NAMES,
    SPAWN_QUOTES: SPAWN_QUOTES,
    FLEE_QUOTES: FLEE_QUOTES,
    HELSING_LINES: HELSING_LINES,
    DAWN_LINES: DAWN_LINES,
    BLOODLINES: BLOODLINES,
    BLOODLINE_MAP: BLOODLINE_MAP,
    META_UPGRADES: META_UPGRADES,
    OMENS: OMENS,
    SURGE_FLAVORS: SURGE_FLAVORS,
    META_VER: META_VER,
    migrateMeta: migrateMeta,
    DailyRules: DailyRules
  };
})(typeof window !== 'undefined' ? window : global);
