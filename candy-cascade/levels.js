'use strict';
/* Candy Cascade — level definitions. 9x9 grids, jelly/frost as string rows.
   jelly chars: 0 none, 1/2 layers.  frost chars: 0 none, 1/2 hp.
   order colors: 0 red, 1 orange, 2 yellow, 3 green, 4 blue, 5 purple.
   Tuned 2026-10-02 against random-bot simulations (humans play ~1.5-2x better). */

function blank() { return Array(9).fill('000000000'); }

function paint(g, r0, c0, r1, c1, v) {
  for (let r = r0; r <= r1; r++) {
    const row = g[r].split('');
    for (let c = c0; c <= c1; c++) row[c] = String(v);
    g[r] = row.join('');
  }
  return g;
}

const full = v => paint(blank(), 0, 0, 8, 8, v);
const center5 = v => paint(blank(), 2, 2, 6, 6, v);
const center7 = v => paint(blank(), 1, 1, 7, 7, v);

function corners(g, v) {
  [[0,0],[0,8],[8,0],[8,8]].forEach(([r,c]) => {
    const row = g[r].split(''); row[c] = String(v); g[r] = row.join('');
  });
  return g;
}

const s1 = g => [g, Math.round(g * 1.8), Math.round(g * 2.8)];

const LEVELS = [
  { n: 1, type: 'order', moves: 25, colors: 4,
    goal: { orders: { 0: 20 } }, stars: [3000, 7000, 13000],
    tip: 'Match 4 in a row to forge a Striped candy — YOUR swipe decides which way its stripes fire!' },
  { n: 2, type: 'jelly', moves: 30, colors: 4,
    jelly: center5(1), stars: [4000, 9000, 16000],
    tip: 'Clear matches on top of jelly to crack it. Double jelly needs two hits!' },
  { n: 3, type: 'score', moves: 22, colors: 5,
    goal: { score: 8000 }, stars: s1(8000),
    tip: 'Cascades multiply your score — set up chain reactions for the big points!' },
  { n: 4, type: 'order', moves: 25, colors: 5,
    goal: { orders: { 0: 18, 2: 18 } }, stars: [4000, 9000, 17000],
    tip: 'Swipe sideways to make row-blasting Striped candies, up-down for column-blasters!' },
  { n: 5, type: 'score', moves: 25, colors: 6,
    goal: { score: 12000 }, stars: s1(12000),
    tip: 'Swap two special candies TOGETHER for huge combo blasts!' },
  { n: 6, type: 'jelly', moves: 38, colors: 5,
    jelly: full(1), stars: [12000, 28000, 52000],
    tip: 'Match 5 in an L or T shape to forge a Wrapped candy — it explodes TWICE.' },
  { n: 7, type: 'order', moves: 34, colors: 6,
    goal: { orders: { 4: 25, 3: 25 } }, stars: [8000, 17000, 30000],
    tip: 'Five in a row forges a Color Bomb — it devours every candy of one color!' },
  { n: 8, type: 'jelly', moves: 48, colors: 6,
    jelly: paint(full(1), 3, 3, 5, 5, 2), stars: [12000, 25000, 43000],
    tip: 'Double jelly in the middle is stubborn — Striped candies reach where matches can\'t.' },
  { n: 9, type: 'score', moves: 32, colors: 6,
    goal: { score: 15000 }, frost: corners(blank(), 1), stars: s1(15000),
    tip: 'Frosting blocks tiles — match right beside it to crack it open.' },
  { n: 10, type: 'jelly', moves: 52, colors: 6,
    jelly: full(1),
    frost: (() => { const g = blank(); paint(g, 4, 1, 4, 7, 1); paint(g, 1, 4, 7, 4, 1); return g; })(),
    stars: [14000, 29000, 50000],
    tip: 'Punch through the frosting cross to reach the jelly underneath.' },
  { n: 11, type: 'order', moves: 38, colors: 6,
    goal: { orders: { 1: 28, 5: 20, 0: 20 } }, stars: [11000, 23000, 40000],
    tip: 'Striped + Striped makes a giant cross blast. Save them up and combine!' },
  { n: 12, type: 'score', moves: 35, colors: 6,
    goal: { score: 17000 }, frost: paint(center5(1), 4, 4, 4, 4, 0),
    stars: s1(17000),
    tip: 'A Color Bomb swapped with a Striped candy turns a whole color striped. Boom.' },
  { n: 13, type: 'jelly', moves: 48, colors: 6,
    jelly: paint(full(1), 2, 2, 6, 6, 2), stars: [19000, 39000, 67000],
    tip: 'Work the edges first — jelly under the middle falls last.' },
  { n: 14, type: 'order', moves: 42, colors: 6,
    goal: { orders: { 2: 35, 4: 35 } }, frost: paint(center5(2), 4, 4, 4, 4, 0),
    stars: [17000, 35000, 60000],
    tip: 'Two-hit frosting guards the middle. Wrapped blasts chew through it.' },
  { n: 15, type: 'score', moves: 38, colors: 6,
    goal: { score: 20000 },
    frost: (() => { const g = blank(); paint(g, 2, 2, 6, 6, 1); paint(g, 4, 4, 4, 4, 0); return g; })(),
    stars: s1(20000),
    tip: 'When moves run low, hunt cascades — every chain multiplies the score.' },
  { n: 16, type: 'jelly', moves: 48, colors: 6,
    jelly: (() => { const g = full(1); corners(corners(g, 2), 2); return g; })(),
    stars: [23000, 47000, 80000],
    tip: 'Corner double-jelly is a trap — clear the ring around it first.' },
  { n: 17, type: 'order', moves: 44, colors: 6,
    goal: { orders: { 0: 38, 3: 38 } }, frost: paint(center7(2), 3, 3, 5, 5, 0),
    stars: [21000, 43000, 74000],
    tip: 'Big orders love big boards — forge specials early, spend them late.' },
  { n: 18, type: 'score', moves: 40, colors: 6,
    goal: { score: 20000 }, frost: paint(full(2), 3, 3, 5, 5, 0),
    stars: s1(20000),
    tip: 'Double frosting everywhere? Row-blasters are your best friend.' },
  { n: 19, type: 'jelly', moves: 55, colors: 6,
    jelly: paint(full(1), 1, 1, 7, 7, 2), stars: [31000, 63000, 108000],
    tip: 'Almost all double jelly. Patience and specials — you\'ve got the moves.' },
  { n: 20, type: 'score', moves: 45, colors: 6,
    goal: { score: 30000 },
    frost: (() => { const g = blank(); paint(g, 0, 0, 8, 8, 1); paint(g, 2, 2, 6, 6, 0); return g; })(),
    stars: s1(30000),
    tip: 'The frost ring wants your attention. Ignore it and chase the score!' },
  { n: 21, type: 'ingredients', moves: 40, colors: 5,
    goal: { ingredients: 3 }, ingredientEvery: 4, stars: [8000, 16000, 28000],
    tip: '🍒 Cherries can\'t be matched — swap them downward and deliver them to the bottom row!' },
  { n: 22, type: 'mixed', moves: 40, colors: 5,
    jelly: center5(1), goal: { orders: { 3: 15 } }, stars: [12000, 25000, 42000],
    tip: 'Mixed levels need BOTH goals finished. Keep an eye on the whole board!' },
  { n: 23, type: 'jelly', moves: 50, colors: 6,
    jelly: paint(full(1), 2, 2, 6, 6, 2),
    choc: paint(blank(), 4, 4, 5, 5, 1),
    stars: [20000, 42000, 72000],
    tip: '🍫 Chocolate spreads EVERY move unless you smash it! Clear it fast — then Striped + Wrapped earns its keep.' },
  { n: 24, type: 'order', moves: 45, colors: 6,
    goal: { orders: { 1: 30, 5: 25, 2: 25 } },
    choc: (() => { const g = blank(); [[3,3],[3,5],[5,3],[5,5]].forEach(([r,c]) => {
      const row = g[r].split(''); row[c] = '1'; g[r] = row.join(''); }); return g; })(),
    stars: [23000, 47000, 80000],
    tip: 'Chocolate creeps in from four corners — Color Bombs turn orders into confetti AND melt chocolate.' },
  { n: 25, type: 'ingredients', moves: 60, colors: 5,
    goal: { ingredients: 6 }, ingredientEvery: 3, stars: [15000, 30000, 52000],
    tip: 'Six cherries to deliver. Vertical Striped candies are cherry delivery trucks!' },
];

if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS;
