/* Gilded Hour — Graphics Pass 5 drive: THE SEALED ENVELOPE.
   A full show played generically. At the crowning, before any
   winner screen: the sealed envelope must stand on the stage
   (seal unbroken), break its own seal on the clock, and show a
   card naming the true champion; the card's button then deals
   the crowning, whose winner name matches the card. */
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
      return Promise.reject(new Error('offline in envelope drive'));
    };
  });
  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(500);
  await page.evaluate(() => { try { localStorage.setItem('gh_pace', 'brisk'); } catch (e) {} });

  const S = () => page.evaluate(() => {
    const g = window.__game.G;
    return g ? { phase: g.phase, round: g.round, qInRound: g.qInRound, kind: g.cur ? g.cur.kind : null,
                 bluffDealt: g.cur ? !!g.cur.bluffDealt : false, decider: !!g.decider,
                 guessTurn: g.cur ? g.cur.guessTurn : null, eraCalled: !!g.eraCalled,
                 envDone: !!g._envDone } : null;
  });
  const ENV = () => page.evaluate(() => {
    const box = document.getElementById('envBox');
    if (!box) return null;
    const card = box.querySelector('.env-card-name');
    const seal = box.querySelector('.env-seal');
    return { open: box.classList.contains('open'), name: card ? card.textContent : null,
             sealOp: seal ? getComputedStyle(seal).opacity : null,
             winnerShown: !!document.querySelector('.finale-wrap .winner-name') };
  });

  await page.tap('#btnStart');
  await page.waitForSelector('#btnRoundGo', { timeout: 8000 });
  await page.tap('#btnRoundGo');

  const acted = {};
  let eraDone = false, envSeen = false, guard = 0;
  while (guard++ < 900) {
    const env = await ENV();
    if (env && !envSeen) {
      envSeen = true;
      check('the crowning opens on a sealed envelope, not the winner screen',
        env.open === false && !env.winnerShown && env.sealOp === '1', JSON.stringify(env));
      await page.screenshot({ path: path.join(ROOT, 'shots', 'gp5-envelope-sealed.png') });
      /* the seal must break on its own clock */
      let opened = false;
      for (let i = 0; i < 40; i++) { await sleep(200); const e2 = await ENV(); if (e2 && e2.open) { opened = true; break; } }
      const e3 = await ENV();
      check('the seal breaks on its own clock and the card rises', opened && !!e3 && !!e3.name, JSON.stringify(e3));
      await sleep(1400); /* the card finishes rising */
      await page.screenshot({ path: path.join(ROOT, 'shots', 'gp5-envelope-open.png') });
      const cardName = e3 ? e3.name : null;
      await page.tap('#btnEnvOpen');
      await sleep(900);
      const w = await page.evaluate(() => {
        const wn = document.querySelector('.finale-wrap .winner-name');
        return wn ? wn.textContent : null;
      });
      check('the crowning follows, naming the same champion the card named',
        !!w && !!cardName && w.indexOf(cardName) >= 0, 'card=' + cardName + ' winner=' + w);
      break;
    }
    const s = await S();
    if (!s) throw new Error('game state lost');
    if (s.phase === 'over') break;
    if (s.phase === 'coldopen' || s.phase === 'spin' || s.phase === 'vote-count' || s.phase === 'vote') { await sleep(250); continue; }
    if (s.phase === 'intro') { await page.tap('#btnRoundGo'); await sleep(300); continue; }
    if (s.phase === 'intermission') {
      if (!eraDone) {
        await tapSel(page, '[data-eravote="0|1"]'); await sleep(150);
        await tapSel(page, '[data-eravote="1|1"]'); await sleep(150);
        await tapSel(page, '[data-eravote="2|0"]'); await sleep(150);
        for (let i = 0; i < 30; i++) { const st = await S(); if (st.eraCalled) break; await sleep(300); }
        eraDone = true;
      }
      await page.tap('#btnBreakGo'); await sleep(300); continue;
    }
    if (s.phase === 'bet') { await page.tap('#btnBetsDone'); await sleep(300); continue; }
    if (s.phase === 'reveal') { const b = await page.$('#btnNext'); if (b) { await b.tap(); await sleep(220); } continue; }
    if (s.phase === 'question') {
      const key = s.round + ':' + s.qInRound + ':' + s.kind + ':' + (s.bluffDealt ? 'dealt' : 'raw') + ':' + (s.decider ? 'dec' : '');
      if (acted[key]) { await sleep(250); continue; }
      if (s.kind === 'bluff' && !s.bluffDealt) {
        await page.type('#bluffIn0', 'A singing kettle');
        await page.type('#bluffIn1', 'A brass teaspoon');
        await page.tap('#btnDealBluff');
        await sleep(600);
        continue;
      }
      acted[key] = true;
      if (s.kind === 'num') {
        let g2 = 0;
        while (g2++ < 16) {
          const st = await S();
          if (!st || st.phase !== 'question' || st.guessTurn == null || st.guessTurn < 0) break;
          await tapSel(page, '.num-key[data-k="7"]'); await tapSel(page, '.num-key[data-k="5"]');
          const locked = await tapSel(page, '#btnNumLock'); await sleep(200);
          if (!locked) break;
        }
        await sleep(300); continue;
      }
      for (let seat = 0; seat < 4; seat++) {
        const sel = await page.evaluate(st => {
          const b = document.querySelector('[data-pick^="' + st + '|"]:not([disabled])');
          return b ? '[data-pick="' + b.getAttribute('data-pick') + '"]' : null;
        }, seat);
        if (sel) { await tapSel(page, sel); await sleep(60); }
      }
      await sleep(300); continue;
    }
    await sleep(250);
  }
  check('the envelope beat was reached', envSeen);
  check('zero page errors across the envelope drive', errors.length === 0, errors.slice(0, 3).join(' ; '));
  const failed = results.filter(r => !r.ok).length;
  console.log('ENVELOPE DRIVE: ' + (results.length - failed) + '/' + results.length);
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('DRIVE ERROR', e.message); process.exit(2); });
