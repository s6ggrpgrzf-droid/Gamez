/* Jeopardy (improvement Pass 2, 2026-11-17) — the table half of the
   graduated Big Finish, driven on the local build. Launch goes
   through ./rig: if the host trap window is closed, the launch
   throws after its own budget and this drive reports the rig as
   closed — no sleeping, no probing around it.
   The script: seat 0 (Ana) banks everything through Rounds 1-2 and
   arrives rich; the Big Finish then runs all-miss, Bo-banks, all-
   miss. Expectations are computed from the RULE at each reveal —
   a missing seat loses min(betLoss(bet, qInRound), scoreBefore),
   betLoss = half the stake on Q13/Q14 and the full stake + $300 on
   Q15 — read against the game's own marks, so the checks hold
   whatever kinds the script dealt (a number question always has a
   closest banker; the keying plan names him). Also asserted: the
   question's own betLoss record, the red LOST delta on the seat at
   the Q15 reveal, and the report's lost totals at the finale.
   Shot: jeopardy-q15.png (the Q15 reveal) at 844x390. */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const SHOTS = path.join(DIR, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0; const errors = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}
function watch(pg, tag) {
  pg.on('pageerror', e => { errors.push(tag + ': ' + e.message); console.log('PAGEERROR ' + tag + ': ' + e.message); });
  pg.on('console', m => { if (m.type() === 'error') { errors.push(tag + ': ' + m.text()); console.log('CONSOLE ' + tag + ': ' + m.text()); } });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const betLossOf = (bet, qi) => qi >= 2 ? bet * 100 + 300 : bet * 50;

(async () => {
  let browser;
  try { browser = await require('./rig').launchBrowser(); }
  catch (e) {
    console.log('RIG CLOSED | ' + e.message);
    console.log('drive-jeopardy: 0 checks run — the browser never launched.');
    process.exit(2);
  }
  const fileUrl = 'file://' + path.join(DIR, 'index.html');
  const page = await browser.newPage(); watch(page, 'J');
  await page.setViewport({ width: 844, height: 390 });
  await page.goto(fileUrl, { waitUntil: 'load', timeout: 60000 });
  await sleep(500);
  const S = () => page.evaluate(() => {
    const G = window.__game.G;
    if (!G) return null;
    return {
      phase: G.phase, round: G.round, qi: G.qInRound, kind: G.cur ? G.cur.kind : null,
      truth: G.cur && G.cur.q ? G.cur.q.num : null, guessTurn: G.cur ? G.cur.guessTurn : null,
      bluffDealt: G.cur ? !!G.cur.bluffDealt : false,
      opts: G.cur && G.cur.opts ? G.cur.opts.map(o => ({ ok: !!o.ok, gone: !!o.gone, by: o.by != null ? o.by : -1 })) : null,
      marks: G.cur && G.cur.marks ? Object.keys(G.cur.marks).map(Number) : [],
      betLoss: G.cur && G.cur.betLoss ? G.cur.betLoss : null,
      scores: G.players.map(p => p.score), bets: G.players.map(p => p.bet || 1),
      report: G.report ? G.report.map(r => (r ? (r.lost || 0) : 0)) : null,
    };
  });
  await page.tap('#btnStart');
  await page.waitForSelector('#btnRoundGo', { timeout: 10000 });

  /* who banks each question: R1/R2 seat 0; Q13 nobody (a number
     question still crowns its closest — Cy keys exact there);
     Q14 Bo; Q15 nobody at the plaques, Bo exact on a number */
  const bankerFor = (round, qi, kind) => {
    if (round < 3) return 0;
    if (qi === 0) return kind === 'num' ? 2 : -1;
    if (qi === 1) return 1;
    return kind === 'num' ? 1 : -1;
  };
  let curKey = '', actedKey = '', betCount = -1, pre = null, preBets = null;
  const expLost = [0, 0, 0];
  let done = false, guard = 0, q15Shot = false;
  while (guard++ < 1600 && !done) {
    const s = await S().catch(() => null);
    if (!s) { await sleep(150); continue; }
    if (s.phase === 'coldopen' || s.phase === 'spin' || s.phase === 'vote-count' || s.phase === 'vote') { await sleep(220); continue; }
    if (s.phase === 'intro') { await page.tap('#btnRoundGo').catch(() => {}); await sleep(300); continue; }
    if (s.phase === 'intermission') {
      await page.evaluate(() => { const b = document.getElementById('btnEraCall'); if (b) b.click(); });
      await sleep(250);
      await page.tap('#btnBreakGo').catch(() => {}); await sleep(300); continue;
    }
    if (s.phase === 'bet') {
      if (pre === null) {
        betCount++;
        pre = s.scores.slice(); preBets = null;
        await page.tap('[data-bet="0|1"]').catch(() => {}); await sleep(150);
        await page.tap('[data-bet="0|1"]').catch(() => {}); await sleep(150);
        const st = await S();
        check('Big Finish ' + (betCount + 1) + ': bets set — seat 0 rides 3 chips, the others the default 1',
          !!st && st.bets[0] === 3 && st.bets[1] === 1 && st.bets[2] === 1,
          'bets=' + (st && JSON.stringify(st.bets)));
        preBets = st ? st.bets.slice() : [3, 1, 1];
      }
      await page.tap('#btnBetsDone').catch(() => {}); await sleep(300); continue;
    }
    if (s.phase === 'question') {
      const key = s.round + ':' + s.qi;
      if (key !== curKey) { curKey = key; }
      await sleep(key === '1:0' ? 900 : 400);
      if (s.kind === 'bluff' && !s.bluffDealt) { await page.tap('#btnDealBluff').catch(() => {}); await sleep(250); continue; }
      if (actedKey !== key) {
        actedKey = key;
        const banker = bankerFor(s.round, s.qi, s.kind);
        if (s.kind === 'num') {
          let g2 = 0;
          while (g2++ < 12) {
            const st = await S().catch(() => null);
            if (!st || st.phase !== 'question' || st.guessTurn == null || st.guessTurn < 0) break;
            const seat = st.guessTurn;
            const target = seat === banker ? st.truth : st.truth + 400 + seat * 137;
            for (const ch of String(target)) { await page.tap('[data-numk="' + ch + '"]').catch(() => {}); await sleep(40); }
            await page.tap('#btnNumLock').catch(() => {}); await sleep(200);
          }
        } else if (s.opts) {
          const okIx = s.opts.findIndex(o => o.ok);
          for (let seat = 0; seat < 3; seat++) {
            const oi = seat === banker ? okIx : s.opts.findIndex((o, ix) => !o.ok && !o.gone && o.by !== seat);
            if (oi >= 0) { await page.tap('[data-pick="' + seat + '|' + oi + '"]').catch(() => {}); await sleep(120); }
          }
        }
      }
      await sleep(250); continue;
    }
    if (s.phase === 'reveal') {
      const key = s.round + ':' + s.qi;
      if (s.round === 3 && pre !== null) {
        const qi = s.qi;
        if (qi === 2 && !q15Shot) {
          /* capture at the deltaFall plateau (~0.4-1.4s in): the
             LOST deltas sit near full opacity there and the desk
             totals are mid-count-down — the jeopardy moment itself */
          await sleep(800);
          await page.screenshot({ path: path.join(SHOTS, 'jeopardy-q15.png') });
          q15Shot = true;
        }
        let allOk = true, detail = '';
        for (let seat = 0; seat < 3; seat++) {
          const marked = s.marks.includes(seat);
          const taken = Math.min(betLossOf(preBets[seat], qi), Math.max(0, pre[seat]));
          if (marked) {
            if (!(s.scores[seat] >= pre[seat])) { allOk = false; detail += ' seat' + seat + ' marked but score fell ' + pre[seat] + '->' + s.scores[seat] + ';'; }
            if (s.betLoss && s.betLoss[seat]) { allOk = false; detail += ' seat' + seat + ' marked but betLoss=' + s.betLoss[seat] + ';'; }
          } else {
            const want = pre[seat] - taken;
            if (s.scores[seat] !== want) { allOk = false; detail += ' seat' + seat + ' score ' + s.scores[seat] + ' want ' + want + ' (pre ' + pre[seat] + ', due ' + betLossOf(preBets[seat], qi) + ');'; }
            const rec = s.betLoss ? (s.betLoss[seat] || 0) : 0;
            if (rec !== taken) { allOk = false; detail += ' seat' + seat + ' betLoss record ' + rec + ' want ' + taken + ';'; }
            expLost[seat] += taken;
          }
        }
        check('Q' + (13 + qi) + ' (' + s.kind + '): jeopardy settles exactly — ' +
          (qi >= 2 ? 'full stake + $300' : 'half the stake') + ', floored at each score',
          allOk, detail || ('scores ' + JSON.stringify(pre) + ' -> ' + JSON.stringify(s.scores) + ', betLoss=' + JSON.stringify(s.betLoss)));
        if (qi === 2) {
          check('Q15 headline: the failed 3-chip bet of seat 0 cost exactly $600',
            !!s.betLoss && s.betLoss[0] === 600, 'betLoss=' + JSON.stringify(s.betLoss));
          const delta = await page.evaluate(() => {
            const els = Array.from(document.querySelectorAll('.seat-delta.lost'));
            return els.map(e => e.textContent);
          }).catch(() => []);
          check('Q15: the red LOST delta stands on the losing seats (-$600 among them)',
            delta.includes('-$600'), 'deltas=' + JSON.stringify(delta));
        }
        pre = null;
      }
      await page.tap('#btnNext').catch(() => {}); await sleep(300); continue;
    }
    if (s.phase === 'over') {
      check('the report lost totals match the settled deductions seat for seat',
        !!s.report && s.report[0] === expLost[0] && s.report[1] === expLost[1] && s.report[2] === expLost[2],
        'report=' + JSON.stringify(s.report) + ' expected=' + JSON.stringify(expLost));
      check('seat 0 lost $900 across the Big Finish (150 + 150 + 600)', expLost[0] === 900, 'expLost=' + JSON.stringify(expLost));
      done = true; break;
    }
    await sleep(250);
  }
  check('the scripted show ran to its finale', done, 'guard=' + guard);
  check('evidence: jeopardy-q15.png captured at the Q15 reveal', q15Shot && fs.existsSync(path.join(SHOTS, 'jeopardy-q15.png')));
  check('zero console/page errors', errors.length === 0, errors.slice(0, 3).join(' ;; '));
  console.log('drive-jeopardy: ' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('DRIVE ERROR: ' + (e && e.stack || e)); process.exit(1); });
