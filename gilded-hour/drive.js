/* Gilded Hour — full-show drive with real taps.
   Pass 8 grammar: no host — answers go in on the desks (pick chips
   for option questions, the seat-order keypad for numbers), the
   Bluff is dealt from its invent stage and picked on desks, the
   era is called from the break, Big Finish bets on the desks. */
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
      truth: g.cur && g.cur.q ? g.cur.q.num : null,
      picks: g.cur ? (g.cur.picks || null) : null,
      bluffPicks: g.cur ? (g.cur.bluffPicks || null) : null,
      guessTurn: g.cur ? g.cur.guessTurn : null,
      bankValue: g.cur ? g.cur.bankValue : null,
      streakBonus0: g.cur && g.cur.streakFx && g.cur.streakFx[0] ? g.cur.streakFx[0].bonus : null,
      opts: g.cur && g.cur.opts ? g.cur.opts.map(o => ({ t: o.t, ok: !!o.ok, gone: !!o.gone, by: o.by != null ? o.by : -1 })) : null,
    };
  });
  const clockLeft = () => page.evaluate(() => window.__game.clock.left);
  /* the desks rebuild on every pick and the keypad on every key —
     a tap resolved a breath before a rebuild lands on a detached
     node; re-resolve and tap again (still a real tap) */
  const tapSel = async (sel) => {
    for (let a = 0; a < 4; a++) {
      try { await page.tap(sel); return; }
      catch (e) { if (!/detached/i.test(e.message) || a === 3) throw e; await sleep(180); }
    }
  };
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
  let guessCount = 0, countedQ = '', actedQ = '';
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
    if (s.phase === 'intermission') { await page.evaluate(() => { const b = document.getElementById('btnEraCall'); if (b) b.click(); }); await sleep(250); await page.tap('#btnBreakGo'); await sleep(300); continue; }
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
        else if (s.round === 2 && !didCut && s.kind === 'mcq') plan = { type: 'cut', mark: [1] };
        else if (s.round === 1 && s.qInRound === 0 && s.kind === 'mcq') plan = { type: 'bank', mark: [0] };
        else plan = { type: 'plain', mark: [0] };
      }
      if (plan.type === 'cut' && !didCut) {
        await page.tap('[data-cut="1"]'); await sleep(300);
        const after = await S();
        const gone = after.opts.filter(o => o.gone).length;
        check('Cut Two greys exactly two wrong answers and spends that player\'s token', gone === 2 && after.cuts[1] === 0 && after.cuts[0] === 1, 'gone=' + gone + ' cuts=' + JSON.stringify(after.cuts));
        didCut = true;
      }
      if (!plan.pre) plan.pre = (await S()).scores;
      /* THE BLUFF: the slot opens on the invent stage — deal the
         answers first, then pick on the desks like any question */
      if (s.kind === 'bluff' && !s.bluffDealt) {
        await page.tap('#btnDealBluff');
        await sleep(500);
        continue;
      }
      if (s.kind === 'num') {
        /* seat-order entry: the planned winner keys the truth,
           the others key numbers safely far away */
        let guardN = 0;
        while (guardN++ < 12) {
          const st = await S();
          if (!st || st.phase !== 'question' || st.guessTurn == null || st.guessTurn < 0) break;
          const seat = st.guessTurn;
          const target = plan.mark.includes(seat) ? st.truth : st.truth + 400 + seat * 137;
          for (const ch of String(target)) { await tapSel('[data-numk="' + ch + '"]'); await sleep(60); }
          await tapSel('#btnNumLock');
          await sleep(250);
        }
        continue;
      }
      if (plan.type === 'bank') {
        // let the value drain to about half-time before the picks land
        while ((await clockLeft()) > 10.3) await sleep(200);
      }
      /* a pick toggles — the sequence runs ONCE per question, or a
         second pass would unpick what the first one locked */
      if (actedQ === qkey) { await sleep(250); continue; }
      actedQ = qkey;
      /* desk picks: marked seats take the correct chip, everyone
         else a live wrong one (the Bluff: never your own lie).
         Each pick is verified from state and re-tapped if the tap
         missed the chip — a human taps again when it doesn't light */
      const okIx = s.opts ? s.opts.findIndex(o => o.ok) : -1;
      for (let seat = 0; seat < 3; seat++) {
        let oi;
        if (plan.mark.includes(seat)) oi = okIx;
        else {
          const cand = s.opts.findIndex((o, ix) => !o.ok && !o.gone && o.by !== seat);
          oi = cand;
        }
        if (oi < 0) continue;
        for (let attempt = 0; attempt < 3; attempt++) {
          await tapSel('[data-pick="' + seat + '|' + oi + '"]');
          await sleep(200);
          const st = await S();
          if (!st || st.phase !== 'question') break;
          const rec = s.kind === 'bluff' ? (st.bluffPicks && st.bluffPicks[seat]) : (st.picks && st.picks[seat] && st.picks[seat].opt);
          if (rec === oi || (s.kind !== 'bluff' && rec != null && +rec === oi)) break;
        }
      }
      await sleep(300);
      continue;
    }
    if (s.phase === 'vote-count') { await sleep(250); continue; }
    if (s.phase === 'vote') { await sleep(250); continue; }
    if (s.phase === 'reveal') {
      if (plan && !plan.asserted) {
        plan.asserted = true;
        const now = (await S()).scores;
        if (plan.type === 'bank') {
          const gain = now[0] - plan.pre[0];
          /* Pass 8: seat 0 is the only correct desk pick, so they
             are also the quick-draw — the gain is the question's
             own banked value (read from its record) + $50 (R1). */
          const stR = await S();
          check('Correct player banks the drained value + the $50 quick-draw (sole correct lock-in)', gain === (stR.bankValue + 50) && stR.bankValue >= 40 && stR.bankValue <= 100 && now[1] === plan.pre[1] && now[2] === plan.pre[2],
            'gain=' + gain + ' bankValue=' + stR.bankValue + ' pre=' + JSON.stringify(plan.pre) + ' now=' + JSON.stringify(now));
        } else if (plan.type === 'num') {
          check('Closest-number: tapped winner banks the value, others unchanged', now[1] > plan.pre[1] && now[0] === plan.pre[0] && now[2] === plan.pre[2],
            'pre=' + JSON.stringify(plan.pre) + ' now=' + JSON.stringify(now));
          numChecked = true;
        } else if (plan.type === 'finaleHit') {
          /* The 3-chip bank is bet x $100, never bet-scaled; on top
             rides the round-scaled quick-draw (R3: $150 — seat 0 is
             the sole correct pick) and whatever streak bonus the
             question's own record says it paid (Pass 5 grammar). */
          const stF = await S();
          const expect = 300 + 150 + (stF.streakBonus0 || 0);
          check('Big Finish: correct answer banks bet x $100 + the R3 $150 quick-draw + its recorded streak bonus (never bet-scaled)', now[0] - plan.pre[0] === expect && now[1] === plan.pre[1] && now[2] === plan.pre[2],
            'gain=' + (now[0] - plan.pre[0]) + ' expect=' + expect + ' pre=' + JSON.stringify(plan.pre) + ' now=' + JSON.stringify(now));
        } else if (plan.type === 'finaleMiss') {
          const stM = await S();
          check('Big Finish: a miss loses $0 (nobody can lose money)', JSON.stringify(now) === JSON.stringify(plan.pre),
            'pre=' + JSON.stringify(plan.pre) + ' now=' + JSON.stringify(now) + ' kind=' + stM.kind + ' picks=' + JSON.stringify(stM.picks) + ' okIx=' + (stM.opts ? stM.opts.findIndex(o => o.ok) : -1));
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
