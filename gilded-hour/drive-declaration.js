/* The Declaration (improvement Pass 3, 2026-11-17) — the table half
   of All or Nothing, driven on the local build. Launch goes through
   ./rig: if the host trap window is closed, the launch throws after
   its own budget and this drive reports the rig as closed.
   The script: seat 0 banks Rounds 1-2 and arrives rich. At the
   break before the Big Finish, seats 0 and 1 tap DECLARE (seat 2
   never does); the first break must offer no buttons at all. Then:
   Q13 — seat 1 (declared) banks PLAIN, seat 0 (declared) misses for
   the PLAIN half; Q14 — seat 0 banks PLAIN; Q15 — seat 0 (declared)
   banks and is paid the bet DOUBLE, seat 1 (declared) misses for
   the doubled (stake + $300) x 2, seat 2 (undeclared) misses for
   the plain figure. Expectations are computed from the rule at each
   reveal against the game's own marks, so the checks hold whatever
   kinds the script dealt.
   Shots: declaration-break.png (the call, made) and
   declaration-q15.png (the Q15 reveal) at 844x390. */
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
const dueOf = (bet, qi, declared) => { const b = betLossOf(bet, qi); return (declared && qi >= 2) ? b * 2 : b; };

(async () => {
  let browser;
  try { browser = await require('./rig').launchBrowser(); }
  catch (e) {
    console.log('RIG CLOSED | ' + e.message);
    console.log('drive-declaration: 0 checks run — the browser never launched.');
    process.exit(2);
  }
  const fileUrl = 'file://' + path.join(DIR, 'index.html');
  const page = await browser.newPage(); watch(page, 'D');
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
      declared: G.declared || {},
      scores: G.players.map(p => p.score), bets: G.players.map(p => p.bet || 1),
      report: G.report ? G.report.map(r => (r ? (r.lost || 0) : 0)) : null,
    };
  });
  await page.tap('#btnStart');
  await page.waitForSelector('#btnRoundGo', { timeout: 10000 });

  const bankerFor = (round, qi, kind) => {
    if (round < 3) return 0;
    if (qi === 0) return 1;
    return 0;
  };
  let curKey = '', actedKey = '', betCount = -1, pre = null, preBets = null;
  const expLost = [0, 0, 0];
  let done = false, guard = 0, breakShot = false, q15Shot = false, declaredDone = false, firstBreakChecked = false, tagChecked = false;
  while (guard++ < 1600 && !done) {
    const s = await S().catch(() => null);
    if (!s) { await sleep(150); continue; }
    if (s.phase === 'coldopen' || s.phase === 'spin' || s.phase === 'vote-count' || s.phase === 'vote') { await sleep(220); continue; }
    if (s.phase === 'intro') { await page.tap('#btnRoundGo').catch(() => {}); await sleep(300); continue; }
    if (s.phase === 'intermission') {
      if (s.round === 2 && !firstBreakChecked) {
        firstBreakChecked = true;
        const n = await page.evaluate(() => document.querySelectorAll('[data-declare]').length).catch(() => -1);
        check('the first break offers no Declaration — the call belongs to the last break only', n === 0, 'buttons=' + n);
      }
      if (s.round === 3 && !declaredDone) {
        declaredDone = true;
        await page.tap('[data-declare="0"]').catch(() => {}); await sleep(250);
        await page.tap('[data-declare="1"]').catch(() => {}); await sleep(250);
        const st = await S();
        check('seats 0 and 1 declared at the break; seat 2 did not',
          !!st && st.declared[0] === true && st.declared[1] === true && !st.declared[2],
          'declared=' + (st && JSON.stringify(st.declared)));
        const settled = await page.evaluate(() => document.querySelectorAll('.declare-btn.declared').length).catch(() => -1);
        check('both tapped buttons settled into their DECLARED state', settled === 2, 'settled=' + settled);
        await page.screenshot({ path: path.join(SHOTS, 'declaration-break.png') });
        breakShot = true;
      }
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
        preBets = st ? st.bets.slice() : [3, 1, 1];
      }
      await page.tap('#btnBetsDone').catch(() => {}); await sleep(300); continue;
    }
    if (s.phase === 'question') {
      const key = s.round + ':' + s.qi;
      if (key !== curKey) { curKey = key; }
      if (s.round === 3 && s.qi === 0 && !tagChecked) {
        tagChecked = true;
        const tags = await page.evaluate(() => document.querySelectorAll('.declared-tag').length).catch(() => -1);
        check('the declared seats wear the ALL OR NOTHING tag on their desks through the Big Finish', tags === 2, 'tags=' + tags);
      }
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
      if (s.round === 3 && pre !== null) {
        const qi = s.qi;
        if (qi === 2 && !q15Shot) {
          await sleep(800);
          await page.screenshot({ path: path.join(SHOTS, 'declaration-q15.png') });
          q15Shot = true;
        }
        let allOk = true, detail = '';
        for (let seat = 0; seat < 3; seat++) {
          const marked = s.marks.includes(seat);
          const declared = !!s.declared[seat];
          const taken = Math.min(dueOf(preBets[seat], qi, declared), Math.max(0, pre[seat]));
          if (marked) {
            if (s.betLoss && s.betLoss[seat]) { allOk = false; detail += ' seat' + seat + ' marked but betLoss=' + s.betLoss[seat] + ';'; }
            if (qi === 2 && seat === 0) {
              /* the declared bank on the last question: the bet
                 alone is worth $600 — bonuses only add */
              if (!(s.scores[seat] - pre[seat] >= 600)) { allOk = false; detail += ' seat0 Q15 gain ' + (s.scores[seat] - pre[seat]) + ' < 600 (double pay missing);'; }
            } else if (!(s.scores[seat] >= pre[seat])) { allOk = false; detail += ' seat' + seat + ' marked but score fell;'; }
            if (qi === 0 && seat === 1) {
              /* the declared bank on Q13 must be PLAIN: a number
                 question pays the bet alone (exactly $100); an mcq
                 adds at most the $150 quick-draw — a doubled bet
                 would clear both bounds */
              const gain = s.scores[seat] - pre[seat];
              const plainOk = s.kind === 'num' ? gain === 100 : gain < 300;
              if (!plainOk) { allOk = false; detail += ' seat1 Q13 gain ' + gain + ' suggests an early double;'; }
            }
          } else {
            const want = pre[seat] - taken;
            if (s.scores[seat] !== want) { allOk = false; detail += ' seat' + seat + ' score ' + s.scores[seat] + ' want ' + want + ' (pre ' + pre[seat] + ', due ' + dueOf(preBets[seat], qi, declared) + ');'; }
            const rec = s.betLoss ? (s.betLoss[seat] || 0) : 0;
            if (rec !== taken) { allOk = false; detail += ' seat' + seat + ' betLoss record ' + rec + ' want ' + taken + ';'; }
            expLost[seat] += taken;
          }
        }
        check('Q' + (13 + qi) + ' (' + s.kind + '): settlement exact — declaration ' +
          (qi >= 2 ? 'LIVE (double pay / double cost)' : 'inert (plain figures)'),
          allOk, detail || ('scores ' + JSON.stringify(pre) + ' -> ' + JSON.stringify(s.scores) + ', betLoss=' + JSON.stringify(s.betLoss)));
        if (qi === 2) {
          check('Q15 headline: the declared 1-chip miss of seat 1 cost exactly $800',
            !!s.betLoss && s.betLoss[1] === Math.min(800, pre[1]), 'betLoss=' + JSON.stringify(s.betLoss) + ' pre1=' + pre[1]);
          check('Q15 control: the undeclared 1-chip miss of seat 2 cost the plain $400, floored at the $0 held',
            !!s.betLoss && (s.betLoss[2] || 0) === Math.min(400, pre[2]), 'betLoss=' + JSON.stringify(s.betLoss) + ' pre2=' + pre[2]);
        }
        pre = null;
      }
      await page.tap('#btnNext').catch(() => {}); await sleep(300); continue;
    }
    if (s.phase === 'over') {
      check('the report lost totals match the settled deductions seat for seat',
        !!s.report && s.report[0] === expLost[0] && s.report[1] === expLost[1] && s.report[2] === expLost[2],
        'report=' + JSON.stringify(s.report) + ' expected=' + JSON.stringify(expLost));
      done = true; break;
    }
    await sleep(250);
  }
  check('the scripted show ran to its finale', done, 'guard=' + guard);
  check('evidence: declaration-break.png captured at the break', breakShot && fs.existsSync(path.join(SHOTS, 'declaration-break.png')));
  check('evidence: declaration-q15.png captured at the Q15 reveal', q15Shot && fs.existsSync(path.join(SHOTS, 'declaration-q15.png')));
  check('zero console/page errors', errors.length === 0, errors.slice(0, 3).join(' ;; '));
  console.log('drive-declaration: ' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('DRIVE ERROR: ' + (e && e.stack || e)); process.exit(1); });
