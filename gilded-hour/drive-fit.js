/* Gilded Hour — FIT PASS drive (2026-11-15): the seven overflow
   items from the design review, each measured in the live DOM.
   FIT_MEASURE=1 prints the numbers without failing. */
const { launchBrowser } = require('./rig');
const fs = require('fs');
const http = require('http');
const path = require('path');
const ROOT = '/home/hatch/workspace/gilded-hour';
const MEASURE = !!process.env.FIT_MEASURE;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: MEASURE ? true : ok });
  console.log((MEASURE ? 'MEAS' : (ok ? 'PASS' : 'FAIL')) + ' | ' + name + (detail ? ' | ' + detail : ''));
}
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
      return Promise.reject(new Error('offline in fit drive'));
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
                 okIx: g.cur && g.cur.opts ? g.cur.opts.findIndex(o => o.ok) : -1 } : null;
  });

  await page.tap('#btnStart');
  /* ITEM 6 — cold-open sub-line timing, read during the cold open */
  await sleep(250);
  const co = await page.evaluate(() => {
    const el = document.querySelector('.co-sub');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { delay: cs.animationDelay, dur: cs.animationDuration };
  });
  check('cold-open sub-line lands early in the beat (delay <= 0.5s)',
    !!co && parseFloat(co.delay) <= 0.5, JSON.stringify(co));
  await page.waitForSelector('#btnRoundGo', { timeout: 8000 });

  /* ITEM 7 — bubble capacity, synthetic long line at the intro */
  const bub = await page.evaluate(() => {
    const b = document.querySelector('.host-bubble');
    const line = document.querySelector('#hostLine');
    const hb = document.querySelector('#hostbar');
    if (!b || !line || !hb) return null;
    const keep = line.innerHTML;
    line.textContent = 'We pause for breath. Player One leads Player Two by $810. The round\'s biggest bank was Player One\'s — $265 on TV. And Player One is first-and-rightest, with 4 quick-draw bonuses. The pot stands at $150 — the champion takes it all. Refill something — we go again shortly.';
    const br = b.getBoundingClientRect(), hr = hb.getBoundingClientRect();
    const out = { bubbleBottom: Math.round(br.bottom), railBottom: Math.round(hr.bottom), bubbleH: Math.round(br.height) };
    line.innerHTML = keep;
    return out;
  });
  check('a full-length Sterling line fits the host rail (bubble bottom <= rail bottom)',
    !!bub && bub.bubbleBottom <= bub.railBottom + 2, JSON.stringify(bub));
  await page.tap('#btnRoundGo');

  const acted = {};
  let eraDone = false, guard = 0;
  const done = {};
  while (guard++ < 2400) {
    const s = await S();
    if (!s) throw new Error('game state lost');
    /* the envelope beat: detect the button directly, whatever the phase is called */
    if (!done.env && (await page.evaluate(() => !!document.querySelector('#btnEnvOpen')))) {
      await sleep(1200);
      const env = await page.evaluate(() => {
        const b = document.querySelector('#btnEnvOpen');
        if (!b) return null;
        const r = b.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { btnTop: Math.round(r.top), btnBottom: Math.round(r.bottom), hit: top === b, topEl: top ? (top.id || top.className) : null };
      });
      check('the envelope\'s button is painted and tappable on a short stage (hit test lands on it)',
        !!env && env.hit, JSON.stringify(env));
      await page.screenshot({ path: path.join(ROOT, 'shots', 'fit-envelope.png') });
      done.env = true;
      const eb = await page.$('#btnEnvOpen');
      if (eb) { await eb.tap(); await sleep(2400); const eb2 = await page.$('#btnEnvOpen'); if (eb2) { await eb2.tap(); await sleep(800); } }
      continue;
    }
    if (s.phase === 'over' || (await page.evaluate(() => !!document.querySelector('.finale-wrap')))) {
      break;
    }
    if (s.phase === 'coldopen' || s.phase === 'spin' || s.phase === 'vote-count' || s.phase === 'vote') { await sleep(250); continue; }
    if (s.phase === 'intro') {
      if (s.round === 2 && !done.ledger) {
        await sleep(700);
        const led = await page.evaluate(() => {
          const st = document.querySelector('#stageWrap').getBoundingClientRect();
          const lastRow = document.querySelector('.fact-row:last-child');
          const go = document.querySelector('#btnRoundGo');
          const pot = document.querySelector('.pot-vessel');
          const card = document.querySelector('.break-card');
          const lr = lastRow ? lastRow.getBoundingClientRect() : null;
          const gr = go ? go.getBoundingClientRect() : null;
          const pr = pot ? pot.getBoundingClientRect() : null;
          const cr = card ? card.getBoundingClientRect() : null;
          const potOverlaps = !!(pr && cr && getComputedStyle(pot).display !== 'none' &&
            pr.left < cr.right && pr.right > cr.left && pr.top < cr.bottom && pr.bottom > cr.top);
          return { stageBottom: Math.round(st.bottom), lastRowBottom: lr ? Math.round(lr.bottom) : null,
                   goBottom: gr ? Math.round(gr.bottom) : null, goTop: gr ? Math.round(gr.top) : null, potOverlaps };
        });
        check('the rules ledger fits the short stage (last row and GO button on screen)',
          !!led && led.lastRowBottom <= led.stageBottom + 2 && led.goBottom <= led.stageBottom + 2,
          JSON.stringify(led));
        check('the pot vessel does not sit on the ledger', !!led && !led.potOverlaps, JSON.stringify(led));
        await page.screenshot({ path: path.join(ROOT, 'shots', 'fit-ledger.png') });
        done.ledger = true;
      }
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
    if (s.phase === 'bet') {
      if (!done.bets) {
        await sleep(400);
        const bets = await page.evaluate(() => {
          const st = document.querySelector('#stageWrap').getBoundingClientRect();
          const wrap = document.querySelector('.desk-head .proj-wrap');
          const chips = Array.from(document.querySelectorAll('.proj-strip > *'));
          const wr = wrap ? wrap.getBoundingClientRect() : null;
          const chipOut = chips.map(c => { const r = c.getBoundingClientRect(); return Math.round(r.left) + '..' + Math.round(r.right); });
          const allIn = !!wr && wr.left >= st.left - 1 && wr.right <= st.right + 1 &&
            chips.every(c => { const r = c.getBoundingClientRect(); return r.left >= st.left - 1 && r.right <= st.right + 1; });
          return { stageL: Math.round(st.left), stageR: Math.round(st.right), wrapL: wr ? Math.round(wr.left) : null, wrapR: wr ? Math.round(wr.right) : null, chipOut, allIn };
        });
        check('the IF THEY BANK strip and its chips stay inside the stage', !!bets && bets.allIn, JSON.stringify(bets));
        await page.screenshot({ path: path.join(ROOT, 'shots', 'fit-bets.png') });
        done.bets = true;
      }
      await page.tap('#btnBetsDone'); await sleep(300); continue;
    }
    if (s.phase === 'reveal') {
      const b = await page.$('#btnNext'); if (b) { await b.tap(); await sleep(220); }
      continue;
    }
    if (s.phase === 'question') {
      const key = s.round + ':' + s.qInRound + ':' + s.kind + ':' + (s.bluffDealt ? 'dealt' : 'raw') + ':' + (s.decider ? 'dec' : '');
      if (s.kind === 'mcq' && !done.portrait) {
        await page.setViewport({ width: 390, height: 844 });
        await sleep(800);
        const pq = await page.evaluate(() => {
          const card = document.querySelector('.q-cardwrap');
          const tw = document.querySelector('.timer-wrap');
          const cr = card ? card.getBoundingClientRect() : null;
          const tr = tw ? tw.getBoundingClientRect() : null;
          const overlap = (cr && tr) ? Math.max(0, Math.min(cr.bottom, tr.bottom) - Math.max(cr.top, tr.top)) *
                                       Math.max(0, Math.min(cr.right, tr.right) - Math.max(cr.left, tr.left)) : null;
          const tags = Array.from(document.querySelectorAll('.tool-btn small')).map(el => {
            const cs = getComputedStyle(el);
            return { sw: el.scrollWidth, cw: el.clientWidth, ws: cs.whiteSpace, fs: cs.fontSize };
          });
          return { overlap, tags, timerRect: tr ? { x: Math.round(tr.x), y: Math.round(tr.y), w: Math.round(tr.width), h: Math.round(tr.height) } : null,
                   cardRect: cr ? { x: Math.round(cr.x), y: Math.round(cr.y), w: Math.round(cr.width), h: Math.round(cr.height) } : null };
        });
        check('portrait: CUT TWO tags read in full (no truncated lifeline text)',
          !!pq && pq.tags.length > 0 && pq.tags.every(t => t.sw <= t.cw + 1), JSON.stringify(pq && pq.tags));
        check('portrait: the clock ring clears the question card (no overlap)',
          !!pq && pq.overlap === 0, 'overlap=' + (pq && pq.overlap) + ' timer=' + JSON.stringify(pq && pq.timerRect) + ' card=' + JSON.stringify(pq && pq.cardRect));
        await page.screenshot({ path: path.join(ROOT, 'shots', 'fit-question-portrait.png') });
        done.portrait = true;
        await page.setViewport({ width: 844, height: 390 });
        await sleep(400);
      }
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
      if (s.okIx >= 0) { await tapSel(page, '[data-pick="0|' + s.okIx + '"]'); await sleep(80); }
      for (let seat = 1; seat < 4; seat++) {
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
  check('all seven beats were reached', !!(done.ledger && done.bets && done.portrait && done.env), JSON.stringify(done));
  check('zero page errors across the fit drive', errors.length === 0, errors.slice(0, 3).join(' ; '));
  const failed = results.filter(r => !r.ok).length;
  console.log('FIT DRIVE: ' + (results.length - failed) + '/' + results.length + (MEASURE ? ' (measure mode)' : ''));
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('DRIVE ERROR', e.message); process.exit(2); });
