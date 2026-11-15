/* Gilded Hour — Graphics Pass 1 drive: THE CURTAIN.
   The round intro hangs on the closed curtain; a round's first
   question parts it; the round's end closes it over the stage and
   the break card stands in front of it; the Decade Vote still
   works in front of the closed curtain; Round 2 opens the same
   way. Screenshots of the break in both orientations. */
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
      return Promise.reject(new Error('offline in curtain drive'));
    };
  });
  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(500);
  await page.evaluate(() => { try { localStorage.setItem('gh_pace', 'brisk'); } catch (e) {} });

  const CUR = () => page.evaluate(() => {
    const c = document.getElementById('curtain');
    if (!c) return null;
    const left = document.querySelector('.cur-left');
    return { state: c.dataset.state, behind: c.classList.contains('behind'),
             medallion: +getComputedStyle(document.querySelector('.cur-medallion')).opacity,
             leftTx: left ? getComputedStyle(left).transform : '' };
  });
  const S = () => page.evaluate(() => {
    const g = window.__game.G;
    return g ? { phase: g.phase, round: g.round, kind: g.cur ? g.cur.kind : null, eraCalled: !!g.eraCalled, guessTurn: g.cur ? g.cur.guessTurn : null } : null;
  });

  await page.tap('#btnStart');
  await page.waitForSelector('#btnRoundGo', { timeout: 8000 });
  await sleep(150);
  let cur = await CUR();
  check('the Round 1 intro hangs on the closed curtain (medallion retired behind the card)', !!cur && cur.state === 'closed' && cur.behind && cur.medallion === 0, JSON.stringify(cur));

  await page.tap('#btnRoundGo');
  await page.waitForFunction(() => window.__game && window.__game.G && window.__game.G.phase === 'question', { timeout: 15000 });
  cur = await CUR();
  check('the first question parts the curtain', !!cur && cur.state === 'open' && !cur.behind, JSON.stringify(cur));
  await sleep(1250);
  cur = await CUR();
  check('parted, the curtain retires behind the show (bunched at the edges)', !!cur && cur.state === 'open' && cur.behind && cur.medallion === 0, JSON.stringify(cur));

  /* play Round 1 out — any picks; the curtain does not care who banks */
  let sawBreak = false, guard = 0;
  while (guard++ < 500) {
    const s = await S();
    if (!s) throw new Error('game state lost');
    if (s.phase === 'intermission') { sawBreak = true; break; }
    if (s.phase === 'reveal') { const b = await page.$('#btnNext'); if (b) { await b.tap(); await sleep(200); } continue; }
    if (s.phase === 'question') {
      if (s.kind === 'num') {
        let g2 = 0;
        while (g2++ < 14) {
          const st = await S();
          if (!st || st.phase !== 'question' || st.guessTurn == null || st.guessTurn < 0) break;
          await tapSel(page, '.num-key[data-k="7"]'); await tapSel(page, '.num-key[data-k="5"]');
          const locked = await tapSel(page, '#btnNumLock'); await sleep(220);
          if (!locked) break;
        }
        await sleep(300); continue;
      }
      for (let seat = 0; seat < 4; seat++) { await tapSel(page, '[data-pick="' + seat + '|0"]'); await sleep(60); }
      await sleep(350); continue;
    }
    await sleep(250);
  }
  check('Round 1 plays out to its break', sawBreak);
  cur = await CUR(); /* sampled inside the close beat */
  check('the close beat raises the curtain over the stage, medallion at the seam',
    !!cur && cur.state === 'closed' && !cur.behind && cur.medallion > 0, JSON.stringify(cur));
  await sleep(1250); /* the close beat finishes, the card steps in front */
  cur = await CUR();
  const card = await page.evaluate(() => !!document.querySelector('.break-card'));
  check('the curtain closes over the finished round and the break card stands in front of it',
    !!cur && cur.state === 'closed' && cur.behind && cur.medallion === 0 && card, JSON.stringify(cur));

  await page.screenshot({ path: path.join(ROOT, 'shots', 'gp1-break-landscape.png') });
  await page.setViewport({ width: 390, height: 844 });
  await sleep(450);
  await page.screenshot({ path: path.join(ROOT, 'shots', 'gp1-break-portrait.png') });
  await page.setViewport({ width: 844, height: 390 });
  await sleep(300);

  /* the Decade Vote, in front of the closed curtain */
  await tapSel(page, '[data-eravote="0|1"]'); await sleep(150);
  await tapSel(page, '[data-eravote="1|1"]'); await sleep(150);
  await tapSel(page, '[data-eravote="2|0"]'); await sleep(150);
  let called = false;
  for (let i = 0; i < 30 && !called; i++) { const st = await S(); called = st.eraCalled; if (!called) await sleep(300); }
  check('the Decade Vote is cast and called in front of the closed curtain', called);
  cur = await CUR();
  check('the curtain stays closed through the vote', !!cur && cur.state === 'closed', JSON.stringify(cur));

  await page.tap('#btnBreakGo');
  await page.waitForSelector('#btnRoundGo', { timeout: 8000 });
  await page.tap('#btnRoundGo');
  await page.waitForFunction(() => window.__game && window.__game.G && window.__game.G.phase === 'question', { timeout: 15000 });
  cur = await CUR();
  const s2 = await S();
  check('Round 2 opens through the curtain the same way', !!cur && cur.state === 'open' && s2.round === 2 && s2.phase === 'question', JSON.stringify(cur) + ' ' + JSON.stringify(s2));

  check('zero page errors across the curtain drive', errors.length === 0, errors.slice(0, 3).join(' ; '));
  const failed = results.filter(r => !r.ok).length;
  console.log('CURTAIN DRIVE: ' + (results.length - failed) + '/' + results.length);
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('DRIVE ERROR', e.message); process.exit(2); });
