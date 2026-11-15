/* Gilded Hour — Graphics Pass 4 drive: SPLIT-FLAP STANDINGS.
   Seat 0 banks the first question; the rest of Round 1 plays
   out generically. On the Round 2 intro the podium board must
   print seat 0's money on flap wheels: the figure is sampled
   through its roll — it must pass through intermediate values
   and settle exactly on the true score. */
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
      return Promise.reject(new Error('offline in flap drive'));
    };
  });
  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(500);
  await page.evaluate(() => { try { localStorage.setItem('gh_pace', 'brisk'); } catch (e) {} });

  const S = () => page.evaluate(() => {
    const g = window.__game.G;
    return g ? { phase: g.phase, round: g.round, qInRound: g.qInRound, kind: g.cur ? g.cur.kind : null,
                 okIx: g.cur && g.cur.opts ? g.cur.opts.findIndex(o => o.ok) : -1,
                 score0: g.players[0].score, eraCalled: !!g.eraCalled } : null;
  });

  await page.tap('#btnStart');
  await page.waitForSelector('#btnRoundGo', { timeout: 8000 });
  await page.tap('#btnRoundGo');

  const acted = {};
  let heroDone = false, eraDone = false, flapChecked = false, guard = 0;
  while (guard++ < 500 && !flapChecked) {
    const s = await S();
    if (!s) throw new Error('game state lost');
    if (s.phase === 'intro' && s.round === 2) {
      /* the podium board just painted — sample the roll */
      const seen = [];
      let shotMid = false;
      for (let i = 0; i < 60; i++) {
        const v = await page.evaluate(() => {
          const el = document.querySelector('#stage .podium.pod0 .pmoney');
          return el ? el.textContent.replace(/\s+/g, '') : null;
        });
        if (v && seen[seen.length - 1] !== v) seen.push(v);
        if (!shotMid && v && v !== '$0' && seen.length >= 2) {
          await page.screenshot({ path: path.join(ROOT, 'shots', 'gp4-flap-midroll.png') });
          shotMid = true;
        }
        await sleep(40);
      }
      const fin = await page.evaluate(() => {
        const el = document.querySelector('#stage .podium.pod0 .pmoney .flap-val');
        const pm = document.querySelector('#stage .podium.pod0 .pmoney');
        return { hasFlap: !!el, rolling: el ? el.hasAttribute('data-to') : null, text: pm ? pm.textContent.replace(/\s+/g, '') : null };
      });
      const sNow = await S();
      const expect = '$' + sNow.score0.toLocaleString('en-US');
      check('seat 0 banked in Round 1 (the board has something to roll to)', sNow.score0 > 0, 'score0=' + sNow.score0);
      check('the podium money is printed on flap wheels', fin.hasFlap, JSON.stringify(fin));
      check('the wheels rolled through intermediate figures', seen.length >= 3, seen.join(' -> '));
      check('the wheels settle exactly on the true score', fin.text === expect && fin.rolling === false,
        'settled=' + fin.text + ' expect=' + expect);
      await page.evaluate(() => {
        const rw = document.querySelector('#stage .race-wrap');
        const st = document.getElementById('stage');
        if (rw && st) st.scrollTop = Math.max(0, rw.offsetTop - 30);
      });
      await sleep(250);
      await page.screenshot({ path: path.join(ROOT, 'shots', 'gp4-flap-settled.png') });
      flapChecked = true;
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
      await page.tap('#btnBreakGo'); await sleep(60); continue; /* the flap roll starts with the intro paint — poll fast */
    }
    if (s.phase === 'reveal') { const b = await page.$('#btnNext'); if (b) { await b.tap(); await sleep(220); } continue; }
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
      if (!heroDone && s.kind === 'mcq') {
        await tapSel(page, '[data-pick="0|' + s.okIx + '"]'); await sleep(80);
        const wrong = (s.okIx + 1) % 4;
        await tapSel(page, '[data-pick="1|' + wrong + '"]'); await sleep(80);
        await tapSel(page, '[data-pick="2|' + wrong + '"]');
        heroDone = true;
      } else {
        for (let seat = 0; seat < 4; seat++) { await tapSel(page, '[data-pick="' + seat + '|0"]'); await sleep(50); }
      }
      await sleep(300); continue;
    }
    await sleep(250);
  }
  check('the Round 2 board was reached and read', flapChecked);
  check('zero page errors across the flap drive', errors.length === 0, errors.slice(0, 3).join(' ; '));
  const failed = results.filter(r => !r.ok).length;
  console.log('FLAP DRIVE: ' + (results.length - failed) + '/' + results.length);
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('DRIVE ERROR', e.message); process.exit(2); });
