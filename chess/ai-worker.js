'use strict';
/* AI worker — runs ChessSim search off the main thread so the board never stutters. */
importScripts('sim.js');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
onmessage = e => {
  const { fen, level, hint, seed } = e.data || {};
  try {
    const st = ChessSim.parseFEN(fen);
    const m = hint ? ChessSim.hintMove(st) : ChessSim.chooseMove(st, level, seed == null ? undefined : mulberry32(seed >>> 0));
    postMessage(m ? { from: m.from, to: m.to, promo: m.promo || null } : null);
  } catch (err) {
    postMessage(null);
  }
};
