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
                boltDmg: 11, boltSpeed: 420, keepDist: 300, shotCd: 2.2 },
    vanhelsing: { name: 'VAN HELSING', hp: 950, speed: 88, dmg: 14, r: 26, xp: 60, color: '#3a3f5c', kind: 'boss',
                stakeDmg: 20, stakeSpeed: 460, shotCd: 1.6, summonCd: 9 }
  };

  /* First-night unlock order: villagers immediately, torches ~25s, priests ~75s,
     hunters ~140s, Helsing at 240s (one minute before dawn). */
  var UNLOCK_AT = { villager: 0, torch: 25, priest: 75, hunter: 140, vanhelsing: 240 };

  var UPGRADES = [
    { id: 'fangs', name: 'Sharper Fangs', max: 5,
      desc: 'Bite damage +35%. Dentists hate him.',
      flavor: 'Floss afterwards. Probably.' },
    { id: 'bats', name: 'Bat Swarm', max: 5,
      desc: '+2 orbiting bats. They bite too.',
      flavor: 'Roommates with wings.' },
    { id: 'whip', name: 'Blood Whip', max: 5,
      desc: 'A crimson lash strikes nearby foes. Damage +30%, faster.',
      flavor: 'Cracks like gossip.' },
    { id: 'aura', name: 'Crimson Aura', max: 5,
      desc: 'A burning aura melts nearby enemies.',
      flavor: 'Personal space: revoked.' },
    { id: 'nova', name: 'Blood Moon', max: 5,
      desc: 'Every 24s the moon screams. Big damage, big radius.',
      flavor: 'The moon has opinions.' },
    { id: 'dash', name: 'Mist Form', max: 5,
      desc: 'DASH button: become mist. Brief invulnerability, shorter cooldown.',
      flavor: 'Now you see me. No you don\'t.' },
    { id: 'wings', name: 'Swift Wings', max: 5,
      desc: 'Move speed +12%.',
      flavor: 'Cardio, but make it eternal.' },
    { id: 'gut', name: 'Iron Gut', max: 5,
      desc: 'Max HP +25 and heal 25 now. Garlic? Never met her.',
      flavor: 'A balanced diet of villagers.' },
    { id: 'nap', name: 'Coffin Nap', max: 5,
      desc: 'Regenerate HP every second, even mid-fight.',
      flavor: 'Power naps hit different at 300 years old.' },
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

  var BLOODLINES = {
    vlad:     { name: 'Vlad', desc: 'The classic. Balanced in all things.', unlock: 0,
                hp: 1, dmg: 1, speed: 1, dashCd: 1 },
    nosferatu:{ name: 'Nosferatu', desc: 'Hideous. Hungry. Practically indestructible.', unlock: 1,
                hp: 1.45, dmg: 1.25, speed: 0.85, dashCd: 1 },
    strigoi:  { name: 'Strigoi', desc: 'Fast as rumor, fragile as ego.', unlock: 3,
                hp: 0.8, dmg: 1, speed: 1.28, dashCd: 0.7 }
  };

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
    META_UPGRADES: META_UPGRADES
  };
})(typeof window !== 'undefined' ? window : global);
