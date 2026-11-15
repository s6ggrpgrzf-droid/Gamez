/* Gilded Hour — Graphics Pass 3 drive: THE CAMERA PUSH-IN.
   A full show: the framing is wide for the Warm-Up, steps in at
   the Double Money intro, steps in again at the Big Finish (the
   table's computed scale lands at 1.09), and a forced dead-level
   finish pushes one step more for the Decider. */
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
      return Promise.reject(new Error('offline in camera drive'));
    };
  });
  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(500);
  await page.evaluate(() => { try { localStorage.setItem('gh_pace', 'brisk'); } catch (e) {} });

  const CAM = () => page.evaluate(() => {
    const g = document.getElementById('scr-game');
    const t = document.getElementById('table');
    const m = getComputedStyle(t).transform;
    let scale = 1;
    if (m && m.indexOf('matrix') === 0) scale = parseFloat(m.split('(')[1].split(',')[0]);
    return { cam: g.getAttribute('data-cam'), scale };
  });
  const S = () => page.evaluate(() => {
    const g = window.__game.G;
    return g ? { phase: g.phase, round: g.round, qInRound: g.qInRound, kind: g.cur ? g.cur.kind : null,
                 bluffDealt: g.cur ? !!g.cur.bluffDealt : false, decider: !!g.decider,
                 guessTurn: g.cur ? g.cur.guessTurn : null, eraCalled: !!g.eraCalled } : null;
  });
  const pickAll = async () => {
    for (let seat = 0; seat < 4; seat++) {
      const sel = await page.evaluate(s => {
        const b = document.querySelector('[data-pick^="' + s + '|"]:not([disabled])');
        return b ? '[data-pick="' + b.getAttribute('data-pick') + '"]' : null;
      }, seat);
      if (sel) { await tapSel(page, sel); await sleep(60); }
    }
  };

  await page.tap('#btnStart');
  await page.waitForSelector('#btnRoundGo', { timeout: 8000 });
  let cam = await CAM();
  check('the Warm-Up opens wide (cam 1, scale 1)', cam.cam === '1' && Math.abs(cam.scale - 1) < 0.005, JSON.stringify(cam));

  const acted = {};
  let cam2 = false, cam3 = false, shotR3 = false, deciderSeen = false, eraDone = false, guard = 0;
  while (guard++ < 900) {
    const s = await S();
    if (!s) throw new Error('game state lost');
    if (s.phase === 'over') break;
    if (s.decider && !deciderSeen) {
      cam = await CAM();
      check('a dead-level finish pushes one step more for the Decider', cam.cam === 'decider', JSON.stringify(cam));
      deciderSeen = true;
      break;
    }
    if (s.phase === 'coldopen' || s.phase === 'spin' || s.phase === 'vote-count' || s.phase === 'vote') { await sleep(250); continue; }
    if (s.phase === 'intro') {
      if (s.round === 2 && !cam2) { cam = await CAM(); check('Double Money steps the framing in (cam 2)', cam.cam === '2', JSON.stringify(cam)); cam2 = true; }
      if (s.round === 3 && !cam3) { cam = await CAM(); check('the Big Finish steps in again (cam 3)', cam.cam === '3', JSON.stringify(cam)); cam3 = true; }
      await page.tap('#btnRoundGo'); await sleep(300); continue;
    }
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
      if (s.round === 3 && s.qInRound === 2 && !deciderSeen) {
        await page.evaluate(() => { window.__game.G.players.forEach(p => { p.score = 500; }); });
      }
      const b = await page.$('#btnNext'); if (b) { await b.tap(); await sleep(220); }
      continue;
    }
    if (s.phase === 'question') {
      if (s.round === 1 && s.qInRound === 0) await page.screenshot({ path: path.join(ROOT, 'shots', 'gp3-r1-question.png') });
      if (s.round === 3 && s.qInRound === 0 && !shotR3) {
        await sleep(3100); /* the push settles */
        cam = await CAM();
        check('the Big Finish framing lands at scale 1.09', Math.abs(cam.scale - 1.09) < 0.012, JSON.stringify(cam));
        await page.screenshot({ path: path.join(ROOT, 'shots', 'gp3-r3-question.png') });
        shotR3 = true;
      }
      const key = s.round + ':' + s.qInRound + ':' + s.kind + ':' + (s.bluffDealt ? 'dealt' : 'raw');
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
        while (g2++ < 14) {
          const st = await S();
          if (!st || st.phase !== 'question' || st.guessTurn == null || st.guessTurn < 0) break;
          await tapSel(page, '.num-key[data-k="7"]'); await tapSel(page, '.num-key[data-k="5"]');
          const locked = await tapSel(page, '#btnNumLock'); await sleep(200);
          if (!locked) break;
        }
        await sleep(300); continue;
      }
      await pickAll();
      await sleep(300); continue;
    }
    await sleep(250);
  }
  check('the show reached its Decider', deciderSeen);
  check('zero page errors across the camera drive', errors.length === 0, errors.slice(0, 3).join(' ; '));
  const failed = results.filter(r => !r.ok).length;
  console.log('CAMERA DRIVE: ' + (results.length - failed) + '/' + results.length);
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('DRIVE ERROR', e.message); process.exit(2); });
