/* Dead Man's Hand — pure game logic. Zero DOM, zero canvas, zero audio.
 * Runs headless in node (tests) and in the browser (game.js renders it).
 * Seeded PRNG (mulberry32) everywhere: same seed -> same run.
 */
'use strict';

var DMH = (function () {

  /* ---------------- PRNG ---------------- */

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // FNV-1a 32-bit hash of 'YYYY-MM-DD'. Same date worldwide -> same seed.
  function dailySeed(dateStr) {
    var h = 0x811c9dc5;
    for (var i = 0; i < dateStr.length; i++) {
      h ^= dateStr.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /* ---------------- cards ---------------- */

  // card: {r: 2..14 (11=J 12=Q 13=K 14=A), s: 0..3}
  var SUITS = ['\u2660', '\u2665', '\u2666', '\u2663']; // spade heart diamond club
  var SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];

  function isRed(s) { return s === 1 || s === 2; }

  function makeDeck() {
    var d = [], r, s;
    for (s = 0; s < 4; s++) for (r = 2; r <= 14; r++) d.push({ r: r, s: s });
    return d;
  }

  function shuffle(deck, rng) {
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    return deck;
  }

  function rankLabel(r) {
    if (r === 14) return 'A';
    if (r === 13) return 'K';
    if (r === 12) return 'Q';
    if (r === 11) return 'J';
    return String(r);
  }

  function rankWord(r) {
    if (r === 14) return 'Aces';
    if (r === 13) return 'Kings';
    if (r === 12) return 'Queens';
    if (r === 11) return 'Jacks';
    return rankLabel(r) + 's';
  }

  function rankWord1(r) {
    if (r === 14) return 'Ace';
    if (r === 13) return 'King';
    if (r === 12) return 'Queen';
    if (r === 11) return 'Jack';
    return rankLabel(r);
  }

  /* ---------------- poker evaluation (exactly 5 cards) ---------------- */

  // ranks: 0 high card, 1 pair, 2 two pair, 3 trips, 4 straight, 5 flush,
  //        6 full house, 7 quads, 8 straight flush, 9 royal flush
  var RANK_NAMES = [
    'High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush',
    'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush'
  ];
  var RANK_BASE = [5, 12, 25, 40, 50, 55, 75, 120, 180, 250];

  function evaluate5(cards) {
    if (!cards || cards.length !== 5) throw new Error('evaluate5 needs exactly 5 cards');
    var vals = cards.map(function (c) { return c.r; }).sort(function (a, b) { return b - a; });
    var flush = cards.every(function (c) { return c.s === cards[0].s; });

    // counts, sorted by (count desc, rank desc)
    var counts = {};
    vals.forEach(function (v) { counts[v] = (counts[v] || 0) + 1; });
    var groups = Object.keys(counts).map(function (k) {
      return { r: +k, n: counts[k] };
    }).sort(function (a, b) { return (b.n - a.n) || (b.r - a.r); });

    // straight? (wheel A-2-3-4-5 handled: vals [14,5,4,3,2])
    var uniq = [];
    vals.forEach(function (v) { if (uniq.indexOf(v) < 0) uniq.push(v); });
    var straight = false, straightHigh = 0;
    if (uniq.length === 5) {
      if (uniq[0] - uniq[4] === 4) { straight = true; straightHigh = uniq[0]; }
      else if (uniq[0] === 14 && uniq[1] === 5) { straight = true; straightHigh = 5; }
    }

    var rank, tb;
    if (straight && flush) {
      rank = (straightHigh === 14) ? 9 : 8;
      tb = [straightHigh];
    } else if (groups[0].n === 4) {
      rank = 7; tb = [groups[0].r, groups[1].r];
    } else if (groups[0].n === 3 && groups[1].n === 2) {
      rank = 6; tb = [groups[0].r, groups[1].r];
    } else if (flush) {
      rank = 5; tb = vals.slice();
    } else if (straight) {
      rank = 4; tb = [straightHigh];
    } else if (groups[0].n === 3) {
      rank = 3; tb = [groups[0].r].concat(groups.slice(1).map(function (g) { return g.r; }).sort(function (a, b) { return b - a; }));
    } else if (groups[0].n === 2 && groups[1].n === 2) {
      rank = 2;
      var pairs = [groups[0].r, groups[1].r].sort(function (a, b) { return b - a; });
      tb = pairs.concat([groups[2].r]);
    } else if (groups[0].n === 2) {
      rank = 1;
      tb = [groups[0].r].concat(groups.slice(1).map(function (g) { return g.r; }).sort(function (a, b) { return b - a; }));
    } else {
      rank = 0; tb = vals.slice();
    }

    return { rank: rank, name: RANK_NAMES[rank], tb: tb, base: RANK_BASE[rank] };
  }

  function handTitle(ev) {
    var t = ev.tb;
    switch (ev.rank) {
      case 0: return rankWord1(t[0]) + ' High';
      case 1: return 'Pair of ' + rankWord(t[0]);
      case 2: return 'Two Pair, ' + rankWord(t[0]) + ' & ' + rankWord(t[1]);
      case 3: return 'Three ' + rankWord(t[0]);
      case 4: return 'Straight, ' + rankWord1(t[0]) + ' high';
      case 5: return 'Flush, ' + rankWord1(t[0]) + ' high';
      case 6: return 'Full House, ' + rankWord(t[0]) + ' over ' + rankWord(t[1]);
      case 7: return 'Four ' + rankWord(t[0]);
      case 8: return 'Straight Flush, ' + rankWord1(t[0]) + ' high';
      case 9: return 'ROYAL FLUSH';
    }
    return ev.name;
  }

  // The Dead Man's Hand: aces and eights, two pair. +50, special banner.
  function isDeadMansHand(cards) {
    if (!cards || cards.length !== 5) return false;
    var ev;
    try { ev = evaluate5(cards); } catch (e) { return false; }
    if (ev.rank !== 2) return false;
    var p = ev.tb.slice(0, 2).sort(function (a, b) { return a - b; });
    return p[0] === 8 && p[1] === 14;
  }

  /* ---------------- monsters ---------------- */

  var MONSTERS = [
    { id: 'skeleton', name: 'Rattling Bones', epithet: 'the pile that walks' },
    { id: 'bat', name: 'Duskwing', epithet: 'the hunger with wings' },
    { id: 'keeper', name: 'The Crypt Keeper', epithet: 'tender of the locked dark' },
    { id: 'ghoul', name: 'Grave Ghoul', epithet: 'the dinner guest' },
    { id: 'wraith', name: 'Pale Wraith', epithet: 'the draft under the door' },
    { id: 'demon', name: 'Old Scratch', epithet: 'the house always wins' }
  ];

  // room index 0..4 -> candidate monster ids
  var ROOM_MONSTERS = [
    ['skeleton', 'ghoul'],
    ['bat', 'keeper'],
    ['ghoul', 'wraith'],
    ['keeper', 'wraith'],
    ['demon']
  ];

  // Tuned via headless sims (greedy best-5-of-8 play, optimal discards):
  // bot wins ~72%, human-ish model ~61% -> a decent human lands just over 50%.
  var ROOM_HP = [55, 110, 175, 255, 360];

  var TAUNT_FALLBACKS = [
    'Another soul at my table. How… brief.',
    'I have eaten better gamblers than you.',
    'Your pulse is showing, mortal.',
    'The cards love me. They fear you.',
    'Shall I deal your last hand?',
    'Even the dark is placing bets on me.',
    'I never lose. Ask the last hundred.',
    'Sit. Stay. Bleed a little.'
  ];

  var KILL_LINES = [
    'The dark takes its own.',
    'Folded. Permanently.',
    'The house collects.',
    'Ashes to ashes, dust to chips.'
  ];

  /* ---------------- boons ---------------- */

  var BOONS = [
    { id: 'extra-hand', name: 'Second Wind', desc: '+1 hand every room' },
    { id: 'extra-discard', name: 'Fresh Blood', desc: '+1 discard every room' },
    { id: 'pair-plus', name: 'Snake Eyes', desc: 'Pairs deal +12' },
    { id: 'twopair-plus', name: 'Double Down', desc: 'Two Pair deals +15' },
    { id: 'flush-plus', name: 'Blood Flush', desc: 'Flushes deal +20' },
    { id: 'straight-plus', name: 'Grave Run', desc: 'Straights deal +20' },
    { id: 'fullhouse-plus', name: 'House Rules', desc: 'Full Houses deal +25' },
    { id: 'all-dmg', name: 'Hexed Deck', desc: 'All damage +15%' },
    { id: 'first-hand', name: 'Quick Draw', desc: 'First hand each room +25' },
    { id: 'deal-10', name: 'Stacked Deck', desc: 'Dealt 10 cards, play 5' }
  ];

  function boonById(id) {
    for (var i = 0; i < BOONS.length; i++) if (BOONS[i].id === id) return BOONS[i];
    return null;
  }

  function hasBoon(state, id) { return state.boons.indexOf(id) >= 0; }

  function handsPerRoom(state) { return 4 + (hasBoon(state, 'extra-hand') ? 1 : 0); }
  function discardsPerRoom(state) { return 3 + (hasBoon(state, 'extra-discard') ? 1 : 0); }
  function dealSize(state) { return hasBoon(state, 'deal-10') ? 10 : 8; }

  /* ---------------- damage ---------------- */

  function calcDamage(ev, cards, state, isFirstHand) {
    var dmg = ev.base;
    for (var i = 0; i < cards.length; i++) dmg += cards[i].r;
    if (hasBoon(state, 'pair-plus') && ev.rank === 1) dmg += 12;
    if (hasBoon(state, 'twopair-plus') && ev.rank === 2) dmg += 15;
    if (hasBoon(state, 'flush-plus') && ev.rank === 5) dmg += 20;
    if (hasBoon(state, 'straight-plus') && ev.rank === 4) dmg += 20;
    if (hasBoon(state, 'fullhouse-plus') && ev.rank === 6) dmg += 25;
    if (isFirstHand && hasBoon(state, 'first-hand')) dmg += 25;
    if (hasBoon(state, 'all-dmg')) dmg = Math.round(dmg * 1.15);
    if (isDeadMansHand(cards)) dmg += 50;
    return dmg;
  }

  /* ---------------- run state machine ---------------- */

  var TUTORIAL_SEED = 20261003;

  function newRun(seed, opts) {
    opts = opts || {};
    var state = {
      seed: seed >>> 0,
      mode: opts.mode || 'quick',
      tutorial: !!opts.tutorial,
      room: 0,               // 1..5 once started
      phase: 'room',         // 'room' | 'boon' | 'over'
      monster: null,
      hp: 0, maxHp: 0,
      deck: [], spent: [],
      hand: [],              // dealt cards (8 or 10)
      selected: [],          // indices into hand
      handsLeft: 0, discardsLeft: 0,
      handsPlayedThisRoom: 0,
      boons: [],
      boonOffer: null,       // [boon, boon, boon] when phase==='boon'
      totalDamage: 0,
      roomsCleared: 0,
      score: 0,
      won: false,
      over: false,
      log: []
    };
    state.rng = mulberry32(state.seed);
    startRoom(state);
    return state;
  }

  function monsterFor(roomIdx, rng) {
    var cands = ROOM_MONSTERS[roomIdx];
    var id = cands[Math.floor(rng() * cands.length)];
    for (var i = 0; i < MONSTERS.length; i++) if (MONSTERS[i].id === id) return MONSTERS[i];
    return MONSTERS[0];
  }

  function drawCards(state, n) {
    for (var i = 0; i < n; i++) {
      if (state.deck.length === 0) {
        if (state.spent.length === 0) break;
        state.deck = shuffle(state.spent, state.rng);
        state.spent = [];
      }
      state.hand.push(state.deck.pop());
    }
  }

  function startRoom(state) {
    state.room += 1;
    var idx = state.room - 1;
    state.monster = monsterFor(idx, state.rng);
    state.maxHp = ROOM_HP[idx];
    state.hp = state.maxHp;
    state.deck = shuffle(makeDeck(), state.rng);
    state.spent = [];
    state.hand = [];
    state.selected = [];
    state.handsLeft = handsPerRoom(state);
    state.discardsLeft = discardsPerRoom(state);
    state.handsPlayedThisRoom = 0;
    state.phase = 'room';
    drawCards(state, dealSize(state));
    state.log.push('room ' + state.room + ' vs ' + state.monster.name);
  }

  function selectedCards(state) {
    return state.selected.map(function (i) { return state.hand[i]; });
  }

  function select(state, handIndex) {
    if (state.phase !== 'room' || state.over) return { ok: false, reason: 'not-playing' };
    if (handIndex < 0 || handIndex >= state.hand.length) return { ok: false, reason: 'bad-index' };
    var at = state.selected.indexOf(handIndex);
    if (at >= 0) { state.selected.splice(at, 1); return { ok: true, selected: false }; }
    if (state.selected.length >= 5) return { ok: false, reason: 'max-5' };
    state.selected.push(handIndex);
    state.selected.sort(function (a, b) { return a - b; });
    return { ok: true, selected: true };
  }

  function canPlay(state) {
    return state.phase === 'room' && !state.over && state.selected.length === 5;
  }

  function preview(state) {
    if (!canPlay(state)) return null;
    var cards = selectedCards(state);
    var ev = evaluate5(cards);
    var isFirst = state.handsPlayedThisRoom === 0;
    return { ev: ev, title: handTitle(ev), dmg: calcDamage(ev, cards, state, isFirst) };
  }

  function play(state) {
    if (!canPlay(state)) return { ok: false, reason: 'need-5' };
    var cards = selectedCards(state);
    var ev = evaluate5(cards);
    var isFirst = state.handsPlayedThisRoom === 0;
    var dmg = calcDamage(ev, cards, state, isFirst);
    var dmh = isDeadMansHand(cards);

    // move played cards to spent
    var selSet = {};
    state.selected.forEach(function (i) { selSet[i] = true; });
    var newHand = [];
    for (var i = 0; i < state.hand.length; i++) {
      if (selSet[i]) state.spent.push(state.hand[i]);
      else newHand.push(state.hand[i]);
    }
    state.hand = newHand;
    state.selected = [];

    state.hp = Math.max(0, state.hp - dmg);
    state.totalDamage += dmg;
    state.handsLeft -= 1;
    state.handsPlayedThisRoom += 1;

    var res = { ok: true, ev: ev, title: handTitle(ev), dmg: dmg, hpLeft: state.hp, deadMans: dmh };

    if (state.hp <= 0) {
      state.roomsCleared += 1;
      state.score = state.totalDamage + 100 * state.roomsCleared;
      if (state.room >= 5) {
        state.won = true; state.over = true; state.phase = 'over';
        state.log.push('run won');
      } else {
        state.phase = 'boon';
        state.boonOffer = offerBoons(state);
        state.log.push('room cleared, boon offered');
      }
      res.killed = true;
    } else {
      drawCards(state, 5); // refill to deal size
      if (state.handsLeft <= 0) {
        state.over = true; state.phase = 'over'; state.won = false;
        state.score = state.totalDamage + 100 * state.roomsCleared;
        state.log.push('run lost');
        res.runOver = true;
      }
    }
    return res;
  }

  function discard(state) {
    if (state.phase !== 'room' || state.over) return { ok: false, reason: 'not-playing' };
    if (state.discardsLeft <= 0) return { ok: false, reason: 'no-discards' };
    if (state.selected.length === 0) return { ok: false, reason: 'select-first' };
    var selSet = {};
    state.selected.forEach(function (i) { selSet[i] = true; });
    var newHand = [];
    for (var i = 0; i < state.hand.length; i++) {
      if (selSet[i]) state.spent.push(state.hand[i]);
      else newHand.push(state.hand[i]);
    }
    state.hand = newHand;
    state.selected = [];
    state.discardsLeft -= 1;
    drawCards(state, dealSize(state) - state.hand.length);
    return { ok: true, discardsLeft: state.discardsLeft };
  }

  function offerBoons(state) {
    // 3 distinct boons not already owned, seeded
    var avail = BOONS.filter(function (b) { return state.boons.indexOf(b.id) < 0; });
    var offer = [];
    var pool = avail.slice();
    while (offer.length < 3 && pool.length > 0) {
      var i = Math.floor(state.rng() * pool.length);
      offer.push(pool.splice(i, 1)[0]);
    }
    return offer;
  }

  function chooseBoon(state, idx) {
    if (state.phase !== 'boon' || !state.boonOffer) return { ok: false, reason: 'no-offer' };
    if (idx < 0 || idx >= state.boonOffer.length) return { ok: false, reason: 'bad-index' };
    var b = state.boonOffer[idx];
    state.boons.push(b.id);
    state.boonOffer = null;
    state.log.push('boon: ' + b.id);
    startRoom(state);
    return { ok: true, boon: b };
  }

  return {
    mulberry32: mulberry32,
    dailySeed: dailySeed,
    makeDeck: makeDeck,
    shuffle: shuffle,
    evaluate5: evaluate5,
    handTitle: handTitle,
    isDeadMansHand: isDeadMansHand,
    RANK_NAMES: RANK_NAMES,
    RANK_BASE: RANK_BASE,
    SUITS: SUITS,
    SUIT_NAMES: SUIT_NAMES,
    isRed: isRed,
    rankLabel: rankLabel,
    MONSTERS: MONSTERS,
    ROOM_HP: ROOM_HP,
    BOONS: BOONS,
    boonById: boonById,
    hasBoon: hasBoon,
    handsPerRoom: handsPerRoom,
    discardsPerRoom: discardsPerRoom,
    dealSize: dealSize,
    calcDamage: calcDamage,
    newRun: newRun,
    select: select,
    canPlay: canPlay,
    preview: preview,
    play: play,
    discard: discard,
    offerBoons: offerBoons,
    chooseBoon: chooseBoon,
    TUTORIAL_SEED: TUTORIAL_SEED,
    TAUNT_FALLBACKS: TAUNT_FALLBACKS,
    KILL_LINES: KILL_LINES
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DMH;
