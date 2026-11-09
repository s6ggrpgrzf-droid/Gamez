#!/usr/bin/env node
/* Build dist/worker.js: single-file paste-ready Cloudflare Worker.
 * Inlines logic.js into worker.js, stripping import/export syntax
 * (the same trick as the Gilded Hour rooms server's build). */
const fs = require('fs');
const path = require('path');
const root = __dirname;

function stripImportsExports(src) {
  return src
    .split('\n')
    .filter((l) => !l.startsWith('import '))
    .map((l) => l
      .replace(/^export async function /, 'async function ')
      .replace(/^export function /, 'function ')
      .replace(/^export const /, 'const '))
    .join('\n');
}

const logic = stripImportsExports(fs.readFileSync(path.join(root, 'logic.js'), 'utf8'));
let worker = fs.readFileSync(path.join(root, 'worker.js'), 'utf8');
worker = worker
  .split('\n')
  .filter((l) => !l.startsWith('import '))
  .join('\n');

const out = [
  '/* The Gilded Hour — Sterling\'s live voice, single-file build. Paste',
  ' * into the Cloudflare Workers dashboard editor, then add the bindings',
  ' * in Settings (the dashboard cannot create them from code):',
  ' *   Workers AI binding:  name AI',
  ' *   KV namespace binding: name CACHE',
  ' * (or) deploy via Workers Builds / wrangler using the split sources',
  ' * and wrangler.toml. */',
  "'use strict';",
  logic,
  worker,
].join('\n');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'worker.js'), out);
console.log('dist/worker.js:', out.length, 'bytes');
