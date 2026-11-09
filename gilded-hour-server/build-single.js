#!/usr/bin/env node
/* Build dist/worker.js: single-file paste-ready Cloudflare Worker.
 * Inlines room.js into server.js, stripping import/export syntax
 * (the same trick as the Dominoes server's build). */
const fs = require('fs');
const path = require('path');
const root = __dirname;

function stripImportsExports(src) {
  return src
    .split('\n')
    .filter((l) => !l.startsWith('import '))
    .map((l) => l
      .replace(/^export function /, 'function ')
      .replace(/^export const /, 'const '))
    .join('\n');
}

const room = stripImportsExports(fs.readFileSync(path.join(root, 'room.js'), 'utf8'));
let server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
server = server
  .split('\n')
  .filter((l) => !l.startsWith('import '))
  .join('\n');

const out = [
  '/* The Gilded Hour online rooms — single-file build. Paste into the',
  ' * Cloudflare Workers dashboard editor, then add a Durable Object',
  ' * binding:  name: ROOMS   class: GildedRoom',
  ' * (or) deploy via Workers Builds / wrangler using the split sources. */',
  "'use strict';",
  room,
  server,
].join('\n');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'worker.js'), out);
console.log('dist/worker.js:', out.length, 'bytes');
