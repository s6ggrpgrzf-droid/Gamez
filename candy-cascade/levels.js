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
  { n: 1, type: 'score', moves: 22, colors: 5,
    goal: { score: 5000 }, stars: s1(5000) },
  { n: 2, type: 'score', moves: 22, colors: 5,
    goal: { score: 8000 }, stars: s1(8000) },
  { n: 3, type: 'jelly', moves: 30, colors: 5,
    jelly: center5(1), stars: [5000, 11000, 20000] },
  { n: 4, type: 'order', moves: 25, colors: 5,
    goal: { orders: { 0: 18, 2: 18 } }, stars: [4000, 9000, 17000] },
  { n: 5, type: 'score', moves: 25, colors: 6,
    goal: { score: 12000 }, stars: s1(12000) },
  { n: 6, type: 'jelly', moves: 38, colors: 5,
    jelly: full(1), stars: [12000, 28000, 52000] },
  { n: 7, type: 'order', moves: 34, colors: 6,
    goal: { orders: { 4: 25, 3: 25 } }, stars: [8000, 17000, 30000] },
  { n: 8, type: 'jelly', moves: 48, colors: 6,
    jelly: paint(full(1), 3, 3, 5, 5, 2), stars: [12000, 25000, 43000] },
  { n: 9, type: 'score', moves: 32, colors: 6,
    goal: { score: 15000 }, frost: corners(blank(), 1), stars: s1(15000) },
  { n: 10, type: 'jelly', moves: 52, colors: 6,
    jelly: full(1),
    frost: (() => { const g = blank(); paint(g, 4, 1, 4, 7, 1); paint(g, 1, 4, 7, 4, 1); return g; })(),
    stars: [14000, 29000, 50000] },
  { n: 11, type: 'order', moves: 38, colors: 6,
    goal: { orders: { 1: 28, 5: 20, 0: 20 } }, stars: [11000, 23000, 40000] },
  { n: 12, type: 'score', moves: 35, colors: 6,
    goal: { score: 17000 }, frost: paint(center5(1), 4, 4, 4, 4, 0),
    stars: s1(17000) },
  { n: 13, type: 'jelly', moves: 48, colors: 6,
    jelly: paint(full(1), 2, 2, 6, 6, 2), stars: [19000, 39000, 67000] },
  { n: 14, type: 'order', moves: 42, colors: 6,
    goal: { orders: { 2: 35, 4: 35 } }, frost: paint(center5(2), 4, 4, 4, 4, 0),
    stars: [17000, 35000, 60000] },
  { n: 15, type: 'score', moves: 38, colors: 6,
    goal: { score: 20000 },
    frost: (() => { const g = blank(); paint(g, 2, 2, 6, 6, 1); paint(g, 4, 4, 4, 4, 0); return g; })(),
    stars: s1(20000) },
  { n: 16, type: 'jelly', moves: 48, colors: 6,
    jelly: (() => { const g = full(1); corners(corners(g, 2), 2); return g; })(),
    stars: [23000, 47000, 80000] },
  { n: 17, type: 'order', moves: 44, colors: 6,
    goal: { orders: { 0: 38, 3: 38 } }, frost: paint(center7(2), 3, 3, 5, 5, 0),
    stars: [21000, 43000, 74000] },
  { n: 18, type: 'score', moves: 40, colors: 6,
    goal: { score: 20000 }, frost: paint(full(2), 3, 3, 5, 5, 0),
    stars: s1(20000) },
  { n: 19, type: 'jelly', moves: 55, colors: 6,
    jelly: paint(full(1), 1, 1, 7, 7, 2), stars: [31000, 63000, 108000] },
  { n: 20, type: 'score', moves: 45, colors: 6,
    goal: { score: 30000 },
    frost: (() => { const g = blank(); paint(g, 0, 0, 8, 8, 1); paint(g, 2, 2, 6, 6, 0); return g; })(),
    stars: s1(30000) },
];

if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS;
