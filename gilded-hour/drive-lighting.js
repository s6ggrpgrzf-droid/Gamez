/* Gilded Hour — Graphics Pass 2 drive: THE LIGHTING PLOT.
   House at the intro; the room falls away on a question (seats
   dim, the spot pool rises); the all-in grace holds the room's
   breath; the reveal washes the footlights in the first banker's
   colour; the next question re-dims; the break returns to house. */
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
      return Promise.reject(new Error('offline in lighting drive'));
    };
  });
  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(500);
  await page.evaluate(() => { try { localStorage.setItem('gh_pace', 'brisk'); } catch (e) {} });

  const PLOT = () => page.evaluate(() => {
    const g = document.getElementById('scr-game');
    const seats = document.getElementById('seatsBottom');
    const spot = document.getElementById('spot');
    const wash = document.getElementById('wash');
    return { plot: g.getAttribute('data-plot'), washVar: g.style.getPropertyValue('--wash'),
             seatFilter: seats ? getComputedStyle(seats).filter : '',
             spotOp: spot ? +getComputedStyle(spot).opacity : -1,
             washOp: wash ? +getComputedStyle(wash).opacity : -1 };
  });
  const S = () => page.evaluate(() => {
    const g = window.__game.G;
    return g ? { phase: g.phase, round: g.round, qInRound: g.qInRound, kind: g.cur ? g.cur.kind : null,
                 okIx: g.cur && g.cur.opts ? g.cur.opts.findIndex(o => o.ok) : -1,
                 marks: g.cur && g.cur.marks ? Object.keys(g.cur.marks).map(Number) : null,
                 guessTurn: g.cur ? g.cur.guessTurn : null } : null;
  });

  await page.tap('#btnStart');
  await page.waitForSelector('#btnRoundGo', { timeout: 8000 });
  await sleep(150);
  let pl = await PLOT();
  check('the intro plays at house light', pl.plot === 'house', JSON.stringify(pl));

  await page.tap('#btnRoundGo');
  await page.waitForFunction(() => window.__game && window.__game.G && window.__game.G.phase === 'question', { timeout: 15000 });
  await sleep(1100); /* the dim settles */
  pl = await PLOT();
  check('a question drops the room: plot=question, seats dimmed, spot pool up',
    pl.plot === 'question' && /brightness\(0\.84\)/.test(pl.seatFilter) && pl.spotOp > 0.8, JSON.stringify(pl));
  await page.screenshot({ path: path.join(ROOT, 'shots', 'gp2-question-landscape.png') });

  /* play Round 1; on the first MCQ, seat 0 banks alone and the
     breath + wash are sampled; everything else is played plainly */
  let breathSeen = false, washSeen = false, sawBreak = false, heroKey = '';
  const acted = {}; /* one act per question — desk picks toggle, so a re-tap would unpick the hero */
  let guard = 0;
  while (guard++ < 600) {
    const s = await S();
    if (!s) throw new Error('game state lost');
    if (s.phase === 'intermission') { sawBreak = true; break; }
    if (s.phase === 'reveal') {
      if (!washSeen && heroKey === s.round + ':' + s.qInRound) {
        await sleep(650); /* the wash fades up over ~1.1s */
        pl = await PLOT();
        check('the reveal washes the footlights in the banking seat\'s colour (seat 0 green)',
          pl.plot === 'reveal' && pl.washVar.indexOf('--p0') >= 0 && pl.washOp > 0.25 && (s.marks || []).indexOf(0) >= 0,
          JSON.stringify(pl) + ' marks=' + JSON.stringify(s.marks));
        await page.screenshot({ path: path.join(ROOT, 'shots', 'gp2-reveal-landscape.png') });
        washSeen = true;
      }
      const b = await page.$('#btnNext'); if (b) { await b.tap(); await sleep(200); }
      continue;
    }
    if (s.phase === 'question') {
      const key = s.round + ':' + s.qInRound + ':' + s.kind;
      if (acted[key]) { await sleep(250); continue; }
      if (s.kind === 'num') {
        acted[key] = true;
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
      if (s.kind === 'bluff') { await sleep(300); continue; }
      /* mcq / survey */
      acted[key] = true;
      if (!washSeen && !heroKey) {
        heroKey = s.round + ':' + s.qInRound;
        await tapSel(page, '[data-pick="0|' + s.okIx + '"]'); await sleep(80);
        const wrong = (s.okIx + 1) % 4;
        await tapSel(page, '[data-pick="1|' + wrong + '"]'); await sleep(80);
        await tapSel(page, '[data-pick="2|' + wrong + '"]');
        /* the grace window: sample fast for the breath */
        for (let i = 0; i < 40 && !breathSeen; i++) {
          const p2 = await PLOT();
          if (p2.plot === 'breath') breathSeen = true;
          else await sleep(70);
        }
        check('the all-in grace holds the room\'s breath', breathSeen);
        await sleep(300); continue;
      }
      for (let seat = 0; seat < 4; seat++) { await tapSel(page, '[data-pick="' + seat + '|0"]'); await sleep(50); }
      await sleep(300); continue;
    }
    await sleep(250);
  }
  check('Round 1 plays out to its break', sawBreak);
  await sleep(1200);
  pl = await PLOT();
  check('the break returns the room to house light', pl.plot === 'house' && pl.washOp < 0.05, JSON.stringify(pl));
  check('zero page errors across the lighting drive', errors.length === 0, errors.slice(0, 3).join(' ; '));
  const failed = results.filter(r => !r.ok).length;
  console.log('LIGHTING DRIVE: ' + (results.length - failed) + '/' + results.length);
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('DRIVE ERROR', e.message); process.exit(2); });
