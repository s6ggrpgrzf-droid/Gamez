/* Gilded Hour — Graphics Pass 7 drive: STERLING IN RIM LIGHT.
   The host's medallion rim is keyed to the Lighting Plot: soft
   gold at house light, stronger under a question, and at the
   reveal it takes the banking seat's colour off --wash. The
   finale's standing Sterling carries a gold silhouette halo. */
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
      return Promise.reject(new Error('offline in rim drive'));
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
                 okIx: g.cur && g.cur.opts ? g.cur.opts.findIndex(o => o.ok) : -1,
                 marks: g.cur && g.cur.marks ? Object.keys(g.cur.marks).map(Number) : [] } : null;
  });
  const RIM = () => page.evaluate(() => {
    const hf = document.querySelector('.host-face');
    return hf ? getComputedStyle(hf).boxShadow : '';
  });

  await page.tap('#btnStart');
  await page.waitForSelector('#btnRoundGo', { timeout: 8000 });
  const rimHouse = await RIM();
  check('house light: the medallion carries a soft gold rim',
    rimHouse.indexOf('233, 205, 138') >= 0 && rimHouse.indexOf('10px') >= 0, rimHouse);
  await page.tap('#btnRoundGo');

  const acted = {};
  let rimQ = false, rimRev = false, heroKey = '', eraDone = false, finaleChecked = false, guard = 0;
  while (guard++ < 900 && !finaleChecked) {
    const s = await S();
    if (!s) throw new Error('game state lost');
    if (s.phase === 'over' || (await page.evaluate(() => !!document.querySelector('.finale-wrap')))) {
      /* through the envelope if it stands */
      const envBtn = await page.$('#btnEnvOpen');
      if (envBtn) { await envBtn.tap(); await sleep(400); await envBtn.tap(); await sleep(900); }
      const fin = await page.evaluate(() => {
        const lg = document.querySelector('.sterling-lg');
        return lg ? getComputedStyle(lg).filter : '';
      });
      check('the finale\'s standing Sterling carries the gold halo',
        fin.indexOf('drop-shadow') >= 0 && fin.indexOf('233, 205, 138') >= 0, fin);
      await page.screenshot({ path: path.join(ROOT, 'shots', 'gp7-rim-finale.png') });
      finaleChecked = true;
      break;
    }
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
    if (s.phase === 'reveal') {
      if (!rimRev && heroKey === s.round + ':' + s.qInRound) {
        await sleep(500);
        const rim = await RIM();
        check('the reveal rims Sterling in the banking seat\'s colour (seat 0 green)',
          rim.indexOf('53, 212, 97') >= 0, rim);
        rimRev = true;
      }
      const b = await page.$('#btnNext'); if (b) { await b.tap(); await sleep(220); }
      continue;
    }
    if (s.phase === 'question') {
      if (!rimQ) {
        await sleep(1000); /* the plot settles and the rim with it */
        const rim = await RIM();
        check('under a question the rim strengthens while the room drops',
          rim.indexOf('233, 205, 138') >= 0 && rim.indexOf('14px') >= 0, rim);
        await page.screenshot({ path: path.join(ROOT, 'shots', 'gp7-rim-question.png') });
        rimQ = true;
      }
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
      if (!heroKey && s.kind === 'mcq') {
        heroKey = s.round + ':' + s.qInRound;
        await tapSel(page, '[data-pick="0|' + s.okIx + '"]'); await sleep(80);
        const wrong = (s.okIx + 1) % 4;
        await tapSel(page, '[data-pick="1|' + wrong + '"]'); await sleep(80);
        await tapSel(page, '[data-pick="2|' + wrong + '"]');
      } else {
        for (let seat = 0; seat < 4; seat++) {
          const sel = await page.evaluate(st => {
            const b = document.querySelector('[data-pick^="' + st + '|"]:not([disabled])');
            return b ? '[data-pick="' + b.getAttribute('data-pick') + '"]' : null;
          }, seat);
          if (sel) { await tapSel(page, sel); await sleep(60); }
        }
      }
      await sleep(300); continue;
    }
    await sleep(250);
  }
  check('the rim was read at question and reveal', rimQ && rimRev);
  check('zero page errors across the rim drive', errors.length === 0, errors.slice(0, 3).join(' ; '));
  const failed = results.filter(r => !r.ok).length;
  console.log('RIM DRIVE: ' + (results.length - failed) + '/' + results.length);
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('DRIVE ERROR', e.message); process.exit(2); });
