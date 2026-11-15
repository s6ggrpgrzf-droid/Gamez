#!/usr/bin/env node
/* build-css.js — The Gilded Hour's stylesheet build.
 *
 * style.css is a BUILD ARTIFACT. Its sources live in css-src/,
 * one file per stratum of the design, concatenated in the order
 * below — the cascade order is the game's history and must not
 * be rearranged. Edit the sources, then run:
 *
 *   node build-css.js           rebuild style.css from css-src/
 *   node build-css.js --check   fail if style.css is not exactly
 *                               what the sources build (drift guard)
 *
 * The concatenation is byte-exact: no separators, no trimming.
 * drive-cssom.js guards the built file's parsed rule count. */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const SRC = path.join(ROOT, 'css-src');
const OUT = path.join(ROOT, 'style.css');

const MANIFEST = [
  '01-foundation.css',
  '02-title-setup.css',
  '03-stage.css',
  '04-beats-reveal.css',
  '05-online-controller.css',
  '06-polish-motion.css',
  '07-perfectionist.css',
  '08-features.css',
  '09-lettering.css',
  '10-pad-repairs-light.css',
  '11-finish.css',
  '12-programme-finale.css'
];

function build() {
  const parts = MANIFEST.map(f => {
    const p = path.join(SRC, f);
    if (!fs.existsSync(p)) throw new Error('missing source: css-src/' + f);
    return fs.readFileSync(p);
  });
  return Buffer.concat(parts);
}

const built = build();
if (process.argv.includes('--check')) {
  const current = fs.readFileSync(OUT);
  if (!current.equals(built)) {
    console.error('DRIFT: style.css is not what css-src/ builds (' + current.length + ' vs ' + built.length + ' bytes). Run: node build-css.js');
    process.exit(1);
  }
  console.log('style.css matches css-src/ (' + built.length + ' bytes)');
} else {
  fs.writeFileSync(OUT, built);
  console.log('built style.css from css-src/ (' + built.length + ' bytes, ' + MANIFEST.length + ' sources)');
}
