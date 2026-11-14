/* Gilded Hour Pass B — full-show drive of the NEW format with real taps.
   One verb (answer), finger-vote tap-ins, one Cut Two, closest-number flow,
   Big Finish bets. 10 checks, all mapped to the Pass B spec. */
const { launchBrowser } = require('./rig');
const fs = require('fs');
const SHOTS = '/home/hatch/workspace/gilded-hour/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok, detail }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); }
const round10 = n => Math.max(0, Math.round(n / 10) * 10);

(async () => {
  const browser = await launchBrowser({ protocolTimeout: 240000 });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.setViewport({ width: 844, height: 390 });
  await page.goto('file:///home/hatch/workspace/gilded-hour/index.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(600);

  const S = () => page.evaluate(() => {
    const g = window.__game.G;
    if (!g) return null;
    return {
      phase: g.phase, round: g.round, qInRound: g.qInRound,
      scores: g.players.map(p => p.score), cuts: g.players.map(p => p.cut), bets: g.players.map(p => p.bet),
      kind: g.cur ? g.cur.kind : null, value: g.cur ? g.cur.value : 0,
      bluffDealt: g.cur ? !!g.cur.bluffDealt : false,
      clockTotal: g.cur ? g.cur.clockTotal : 0, betRound: g.cur ? !!g.cur.betRound : false,
      opts: g.cur && g.cur.opts ? g.cur.opts.map(o => ({ t: o.t, ok: !!o.ok, gone: !!o.gone })) : null,
    };
  });
  const clockLeft = () => page.evaluate(() => window.__game.clock.left);
  const retiredScan = () => page.evaluate(() => {
    const bad = [];
    ['#needleFx', '[data-needle]', '#toolTable', '#toolClock', '#cover', '.steal-bar', '#wagerRange', '[data-w]', '[data-vans]', '#btnWager', '.cat-tile'].forEach(sel => {
      if (document.querySelector(sel)) bad.push(sel);
    });
    const txt = (document.body.innerText || '').toUpperCase();
    ['NEEDLE', "FOOL'S GOLD", 'STEAL OPEN', 'A STEAL IS OPEN', 'ON THE TABLE', 'ASK THE TABLE', 'SECOND CLOCK', 'SECRET WAGER', 'THE VAULT', 'HOT SEAT', 'OPEN TABLE'].forEach(w => {
      if (txt.includes(w)) bad.push('text:' + w);
    });
    return bad;
  });

  // start a 3-player show (3 is pre-selected) with the single START button
  await page.tap('#btnStart');
  await page.waitForSelector('#btnRoundGo', { timeout: 8000 });

  const retiredHits = new Set();
  let guessCount = 0, countedQ = '';
  let plan = null;           // per-question assertion plan
  let didCut = false, numChecked = false, toolsChecked = false;
  let betsSet = false;
  let guard = 0;

  while (guard++ < 900) {
    const s = await S();
    if (!s) throw new Error('game state lost');
    (await retiredScan()).forEach(h => retiredHits.add(h));
    if (s.phase === 'over') break;
    if (s.phase === 'coldopen') { await sleep(300); continue; }
    if (s.phase === 'intro') { await page.tap('#btnRoundGo'); await sleep(300); continue; }
    if (s.phase === 'intermission') { await page.tap('#btnBreakGo'); await sleep(300); continue; }
    if (s.phase === 'spin') { await sleep(250); continue; }
    if (s.phase === 'bet') {
      if (!betsSet) {
        // Player One bets 3 chips (two + taps), everyone else stays at 1
        await page.tap('[data-bet="0|1"]'); await sleep(150);
        await page.tap('[data-bet="0|1"]'); await sleep(150);
        const st = await S();
        if (st.bets[0] !== 3) throw new Error('bet stepper failed: ' + JSON.stringify(st.bets));
        betsSet = true;
      }
      await page.tap('#btnBetsDone'); await sleep(300); continue;
    }
    if (s.phase === 'question') {
      const qkey = s.round + ':' + s.qInRound;
      if ((s.kind === 'num' || s.kind === 'survey') && countedQ !== qkey) { guessCount++; countedQ = qkey; }
      if (!toolsChecked && s.kind !== 'num') {
        const tools = await page.evaluate(() => {
          const cuts = [...document.querySelectorAll('[data-cut]')].map(b => b.textContent.toUpperCase());
          const others = [...document.querySelectorAll('.tools .tool-btn')].filter(b => !b.hasAttribute('data-cut') && b.id !== 'btnCallIt');
          return { cuts, others: others.length };
        });
        check('One lifeline only: the only lifeline buttons are per-player Cut Two', tools.cuts.length === 3 && tools.cuts.every(t => t.includes('CUT TWO')) && tools.others === 0, tools.cuts.join(' / '));
        toolsChecked = true;
      }
      // choose the plan for this question
      if (!plan) {
        if (s.round === 3 && s.qInRound === 0) plan = { type: 'finaleHit', mark: [0] };
        else if (s.round === 3 && s.qInRound === 1) plan = { type: 'finaleMiss', mark: [] };
        else if (s.kind === 'num' && s.round < 3 && !numChecked) plan = { type: 'num', mark: [1] };
        else if (s.round === 2 && !didCut) plan = { type: 'cut', mark: [1] };
        else if (s.round === 1 && s.qInRound === 0) plan = { type: 'bank', mark: [0] };
        else plan = { type: 'plain', mark: [0] };
      }
      if (plan.type === 'cut' && !didCut) {
        await page.tap('[data-cut="1"]'); await sleep(300);
        const after = await S();
        const gone = after.opts.filter(o => o.gone).length;
        check('Cut Two greys exactly two wrong answers and spends that player\'s token', gone === 2 && after.cuts[1] === 0 && after.cuts[0] === 1, 'gone=' + gone + ' cuts=' + JSON.stringify(after.cuts));
        didCut = true;
      }
      if (plan.type === 'bank') {
        // let the value drain to about half-time, then CALL IT
        while ((await clockLeft()) > 10.3) await sleep(200);
        const left = await clockLeft();
        const elapsed = s.clockTotal - left;
        plan.expected = round10(s.value * (0.5 + 0.5 * Math.max(0, Math.min(1, 1 - elapsed / s.clockTotal))));
        plan.pre = (await S()).scores;
      }
      /* THE BLUFF (pass 2): the slot opens on the invent stage —
         deal the answers first, then the usual CALL IT flow */
      if (s.kind === 'bluff' && !s.bluffDealt) {
        await page.tap('#btnDealBluff');
        await sleep(500);
        continue;
      }
      await sleep(350);
      await page.tap('#btnCallIt');
      await sleep(250);
      continue;
    }
    if (s.phase === 'vote-count') { await sleep(250); continue; }
    if (s.phase === 'vote') {
      if (!plan) plan = { type: 'plain', mark: [0] };
      if (!plan.pre) plan.pre = s.scores;
      if (s.kind === 'bluff') {
        /* the bluff's mark screen: tap the truth plaque, then the
           seats that picked it, then reveal */
        const truthIx = s.opts ? s.opts.findIndex(o => o.ok) : -1;
        if (truthIx >= 0) { await page.tap('.bluff-pick[data-opt="' + truthIx + '"]'); await sleep(200); }
      }
      for (const seat of plan.mark) { await page.tap('.seat[data-seat="' + seat + '"]'); await sleep(200); }
      await page.tap('#btnReveal');
      await sleep(300);
      continue;
    }
    if (s.phase === 'reveal') {
      if (plan && !plan.asserted) {
        plan.asserted = true;
        const now = (await S()).scores;
        if (plan.type === 'bank') {
          const gain = now[0] - plan.pre[0];
          /* Design pass 3: seat 0 is the ONLY marker here, so they are
             also the first (only) correct lock-in — the gain is the
             drained value PLUS the flat $50 quick-draw. */
          check('Correct player banks the drained value + the $50 quick-draw (sole correct lock-in)', Math.abs(gain - (plan.expected + 50)) <= 10 && now[1] === plan.pre[1] && now[2] === plan.pre[2],
            'gain=' + gain + ' expected~' + (plan.expected + 50) + ' pre=' + JSON.stringify(plan.pre) + ' now=' + JSON.stringify(now));
        } else if (plan.type === 'num') {
          check('Closest-number: tapped winner banks the value, others unchanged', now[1] > plan.pre[1] && now[0] === plan.pre[0] && now[2] === plan.pre[2],
            'pre=' + JSON.stringify(plan.pre) + ' now=' + JSON.stringify(now));
          numChecked = true;
        } else if (plan.type === 'finaleHit') {
          /* Design pass 3: the 3-chip bank is still bet x $100 — the
             extra $50 is the flat quick-draw (seat 0 sole marker).
             Hot Streaks adjustment: seat 0's run entering the finale
             is 3 (Round 2 banks at slots 1, 3 and 4 — the survey
             slot 2 and the survey Headline are neutral, and the
             Round 2 opener's cut plan, which marks seat 1, reset
             the run seat 0 had built in Round 1), so this bank is
             its 4th straight and carries the flat $25 streak bonus:
             300 + 50 + 25 = 375. */
          check('Big Finish: correct answer banks bet x $100 + the flat $50 quick-draw + a flat $25 streak bonus (never bet-scaled)', now[0] - plan.pre[0] === 375 && now[1] === plan.pre[1] && now[2] === plan.pre[2],
            'pre=' + JSON.stringify(plan.pre) + ' now=' + JSON.stringify(now));
        } else if (plan.type === 'finaleMiss') {
          check('Big Finish: a miss loses $0 (nobody can lose money)', JSON.stringify(now) === JSON.stringify(plan.pre),
            'pre=' + JSON.stringify(plan.pre) + ' now=' + JSON.stringify(now));
        }
      }
      plan = null;
      const b = await page.$('#btnNext'); if (b) { await b.tap(); await sleep(250); continue; }
    }
    await sleep(250);
  }

  const end = await S();
  check('No Needle / Fool\'s Gold / steal / secret-wager UI exists at any point', retiredHits.size === 0, [...retiredHits].join(', ') || 'clean');
  check('Exactly 5 guess questions occur in a show', guessCount === 5, 'guessCount=' + guessCount);
  check('Show reaches a winner', !!end && end.phase === 'over', 'phase=' + (end && end.phase));
  const winner = await page.evaluate(() => document.querySelector('.winner-name') ? document.querySelector('.winner-name').textContent : null);
  check('Winner screen shows a name', !!winner, winner || '');
  check('No console/page errors', errors.length === 0, errors.slice(0, 3).join(' ;; '));
  const fails = results.filter(r => !r.ok).length;
  console.log('DRIVE DONE — ' + (results.length - fails) + '/' + results.length + ' checks passed');
  await browser.close();
  process.exit(fails ? 2 : 0);
})().catch(e => { console.error('DRIVE FAIL:', e.message); process.exit(1); });
