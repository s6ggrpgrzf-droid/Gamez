/* Fairway Rivals — presentation config (NOT sim tuning; sim tuning lives in sim.js / CONTRACT.md).
   Read by art.js and game.js. Safe to load from file:// or GitHub Pages. */
'use strict';
window.FRCFG = {
  version: '20261012a',           // bump on every JS change (cache-bust partner)
  buildTag: 'FR·20261012a',       // visible in the corner build tag

  // Televised-golf broadcast palette: deep greens, golden-hour light, clean broadcast white/yellow.
  palette: {
    fairway:  '#2e7d3f',
    rough:    '#256b34',
    green:    '#3da34d',
    sand:     '#e6cf8e',
    water:    '#2f7ba3',
    skyTop:   '#7fb2e5',
    skyGold:  '#ffd9a0',
    sun:      '#ffcf6e',
    treeDark: '#1d4d28',
    treeLite: '#4da55c',
    trunk:    '#6b4a2f',
    white:    '#ffffff',
    gold:     '#ffd23f',
    navy:     '#0d2b52',
    red:      '#c0392b',     // rival accent
    blue:     '#2471a3',     // player accent
    ink:      '#0a1a12'
  },

  audio: {
    defaults: { music: 0.7, sfx: 0.9, ui: 0.9, muted: false },
    tempo: 96,               // broadcast theme bpm
    bars: 8
  }
};
