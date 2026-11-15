/* Gilded Hour — Graphics Pass 6 drive: THE POT, FILLED HONESTLY.
   (a) In short landscape the vessel sits the question out (its
   dock rule re-keyed to the question card after the no-host
   pass removed the CALL IT buttons it used to key on).
   (b) Two engineered full misses feed the pot; after each, the
   vessel's coin-gold fill must stand at the pot's own level
   against a $3,000 full bowl, and the second must stand higher. */
const { launchBrowser } = require('./rig');
const fs = require('fs');
const http = require('http');
const path = require('path');
const ROOT = '/home/hatch/workspace/gilded-hour';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); }
const tapSel = async (page, sel) => {
  for (let a = 0; a < 4; a++) {
    try { await page.tap(sel); return true; }
    catch (e) { if (!/detached/i.test(e.message) || a === 3) return false; await sleep(180); }
  }
  return false;
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('nope'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await launchBrowser({ protocolTimeout: 240000 });
  const errors = [];
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.setViewport({ width: 844, height: 390 });
  await page.evaluateOnNewDocument(() => {
    const ok = obj => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(obj) });
    window.fetch = function (u) {
      const url = String(u);
      if (url.indexOf('gilded-hour-sterling') >= 0) return ok({ line: null });
      if (url.indexOf('gilded-hour-nightly') >= 0) return ok({ question: null, intro: null });
      if (url.indexOf('gilded-hour-rooms') >= 0) return ok({ code: 'TEST', hostToken: 'tok' });
      return Promise.reject(new Error('offline in potfill drive'));
    };
  });
  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(500);
  await page.evaluate(() => { try { localStorage.setItem('gh_pace', 'brisk'); } catch (e) {} });

  const S = () => page.evaluate(() => {
    const g = window.__game.G;
    return g ? { phase: g.phase, round: g.round, qInRound: g.qInRound, kind: g.cur ? g.cur.kind : null,
                 okIx: g.cur && g.cur.opts ? g.cur.opts.findIndex(o => o.ok) : -1, pot: g.pot || 0 } : null;
  });
  const POT = () => page.evaluate(() => {
    const v = document.querySelector('.pot-vessel');
    if (!v) return { vessel: false };
    const f = v.querySelector('.pot-fill');
    return { vessel: true, display: getComputedStyle(v).display,
             fillPct: f ? parseFloat(f.style.height) || 0 : -1,
             total: v.querySelector('.pot-total') ? v.querySelector('.pot-total').textContent : null };
  });

  await page.tap('#btnStart');
  await page.waitForSelector('#btnRoundGo', { timeout: 8000 });
  await page.tap('#btnRoundGo');

  const acted = {};
  let dockChecked = false, feeds = 0, fill1 = -1, guard = 0;
  while (guard++ < 400 && feeds < 2) {
    const s = await S();
    if (!s) throw new Error('game state lost');
    if (s.phase === 'question' && !dockChecked) {
      const p = await POT();
      check('in short landscape the vessel sits the question out (re-keyed dock)',
        p.vessel === false || p.display === 'none', JSON.stringify(p));
      dockChecked = true;
    }
    if (s.phase === 'coldopen' || s.phase === 'spin' || s.phase === 'vote-count' || s.phase === 'vote') { await sleep(250); continue; }
    if (s.phase === 'intro') { await page.tap('#btnRoundGo'); await sleep(300); continue; }
    if (s.phase === 'reveal') {
      await sleep(4500); /* the feed's flight lands and the count ticks up */
      const p = await POT();
      const s2 = await S();
      if (s2.pot > 0) {
        feeds++;
        const expect = Math.min(100, s2.pot / 3000 * 100);
        check('feed ' + feeds + ': the fill stands at the pot\'s own level',
          Math.abs(p.fillPct - expect) <= 4, 'pot=' + s2.pot + ' fill=' + p.fillPct.toFixed(1) + '% expect=' + expect.toFixed(1) + '% total=' + p.total);
        if (feeds === 1) fill1 = p.fillPct;
        if (feeds === 2) {
          check('the second feed stands visibly higher than the first', p.fillPct > fill1 + 0.5, 'first=' + fill1.toFixed(1) + '% second=' + p.fillPct.toFixed(1) + '%');
          await page.screenshot({ path: path.join(ROOT, 'shots', 'gp6-pot-filled.png') });
        }
      }
      const b = await page.$('#btnNext'); if (b) { await b.tap(); await sleep(220); }
      continue;
    }
    if (s.phase === 'question') {
      const key = s.round + ':' + s.qInRound + ':' + s.kind;
      if (acted[key]) { await sleep(250); continue; }
      acted[key] = true;
      if (s.kind === 'num') {
        let g2 = 0;
        while (g2++ < 14) {
          const st = await page.evaluate(() => { const g = window.__game.G; return g && g.cur ? g.cur.guessTurn : null; });
          if (st == null || st < 0) break;
          await tapSel(page, '.num-key[data-k="7"]'); await tapSel(page, '.num-key[data-k="5"]');
          const locked = await tapSel(page, '#btnNumLock'); await sleep(200);
          if (!locked) break;
        }
        await sleep(300); continue;
      }
      /* mcq / survey: EVERY seat picks a wrong answer — a full miss feeds the pot */
      const wrong = (s.okIx + 1) % 4;
      for (let seat = 0; seat < 4; seat++) { await tapSel(page, '[data-pick="' + seat + '|' + wrong + '"]'); await sleep(60); }
      await sleep(300); continue;
    }
    await sleep(250);
  }
  check('two pot feeds were engineered and read', feeds === 2, 'feeds=' + feeds);
  check('zero page errors across the potfill drive', errors.length === 0, errors.slice(0, 3).join(' ; '));
  const failed = results.filter(r => !r.ok).length;
  console.log('POTFILL DRIVE: ' + (results.length - failed) + '/' + results.length);
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('DRIVE ERROR', e.message); process.exit(2); });
