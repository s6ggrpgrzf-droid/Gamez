/* Review programme Pass 4 (2026-11-14) — THE CSSOM GUARD.
   Twice bitten (2026-11-12/13): CSS blocks appended to style.css
   sat in the file, served whole, and never reached the browser's
   parsed rule list — passes shipped believing styles were live
   that no player ever saw. The file's tail even carried a stray
   closing brace (removed by this pass; the parsed rule list was
   byte-for-byte the same before and after, 2,157 rules).
   This drive is the tripwire, and it joins the standard set:
   1. BALANCE — the file's braces balance exactly (strings and
      comments stripped first): never negative, ending at zero.
      A stray or missing brace is how a tail goes silent.
   2. COUNT — the browser's parsed rule count (recursive CSSOM
      walk of style.css) is at least the pinned floor. The pin
      is today's healthy count; a pass that legitimately deletes
      CSS updates the pin in that pass, the way the nightly test
      updates its bank counts — a SILENT drop is what fails.
   3. TAIL — the last five style selectors in file order are all
      present in the browser's parsed selector set. When a block
      is swallowed, this names it.
   Self-tested 2026-11-14 against three corruption shapes: an
   unclosed @media (BALANCE fails, exit 1); a stray extra close
   brace before an appended rule — the literal 2026-11-12
   signature, depth -1 — (BALANCE and TAIL fail, the sentinel
   named, and the browser indeed never parsed it); an unclosed
   comment swallowing a rule (TAIL fails, naming it). The
   healthy file passes 4/4. */
const { launchBrowser } = require('./rig');
const fs = require('fs');
const http = require('http');
const path = require('path');
const ROOT = '/home/hatch/workspace/gilded-hour';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); }

const PINNED_MIN_RULES = 2157; /* measured 2026-11-14 on the healthy file */

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('nope'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); res.end(data);
  });
});

/* Strip comments and string contents so brace counting and
   prelude scanning see structure only. */
function stripNoise(css) {
  let out = '', i = 0;
  while (i < css.length) {
    if (css[i] === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? css.length : e + 2; out += ' '; }
    else if (css[i] === '"' || css[i] === "'") {
      const q = css[i]; i++;
      while (i < css.length && css[i] !== q) { if (css[i] === '\\') i++; i++; }
      i++; out += '""';
    } else { out += css[i]; i++; }
  }
  return out;
}

function fileFacts(css) {
  /* Balance counts on the fully stripped text (a brace inside a
     string or comment is not structure). Selector extraction
     strips comments only — emptying the strings would corrupt
     attribute selectors like [data-phase="over"]. */
  const stripped = stripNoise(css);
  let depth = 0, minDepth = 0;
  for (let i = 0; i < stripped.length; i++) {
    if (stripped[i] === '{') depth++;
    else if (stripped[i] === '}') { depth--; if (depth < minDepth) minDepth = depth; }
  }
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const selectors = [];
  let prelude = '';
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (c === '{') {
      const p = prelude.trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ');
      if (p && p[0] !== '@' && !/^(from|to|[\d.]+%)$/.test(p)) selectors.push(p);
      prelude = '';
    } else if (c === '}') { prelude = ''; }
    else if (c === ';') { prelude = ''; }
    else prelude += c;
  }
  return { depth, minDepth, selectors };
}

(async () => {
  const css = fs.readFileSync(ROOT + '/style.css', 'utf8');
  const facts = fileFacts(css);
  check('BALANCE: style.css braces balance exactly (never negative, ends at zero)',
    facts.depth === 0 && facts.minDepth === 0, 'depth=' + facts.depth + ' min=' + facts.minDepth);

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/index.html';
  const browser = await launchBrowser({ protocolTimeout: 120000 });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(url, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await sleep(1500);
  const parsed = await page.evaluate(() => {
    const sels = new Set(); let count = 0;
    const walk = (rules) => { for (const r of rules) { count++; if (r.selectorText) sels.add(r.selectorText.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ')); if (r.cssRules) walk(r.cssRules); } };
    for (const sh of document.styleSheets) { if (sh.href && sh.href.indexOf('style.css') >= 0) { try { walk(sh.cssRules); } catch (e) {} } }
    return { count, sels: Array.from(sels) };
  });
  check('COUNT: the browser parsed at least the pinned ' + PINNED_MIN_RULES + ' rules from style.css',
    parsed.count >= PINNED_MIN_RULES, 'parsed=' + parsed.count);
  const parsedSet = new Set(parsed.sels);
  const tail = facts.selectors.slice(-5);
  const missing = tail.filter(s => !parsedSet.has(s));
  check('TAIL: the last five style selectors in file order all reached the browser',
    missing.length === 0 && tail.length === 5, missing.length ? 'missing: ' + missing.join(' ;; ') : 'tail: ' + tail[4]);
  check('the page loads without script errors', errs.length === 0, errs.join('; '));

  await browser.close(); server.close();
  const failed = results.filter(r => !r.ok).length;
  console.log('DRIVE-CSSOM DONE — ' + (results.length - failed) + '/' + results.length + ' checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('DRIVE-CSSOM ERROR', e.message); process.exit(1); });
