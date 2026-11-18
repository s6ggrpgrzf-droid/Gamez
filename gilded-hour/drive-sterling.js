/* drive-sterling.js — Sterling made present (improvement Pass 4,
   2026-11-17). Three crafted-save shows, each resumed through the
   game's own resume path, one per new beat family:
   A) THE BLUFF'S OUTCOME: every picker falls for Ana's lie and
      nobody finds the truth — Sterling must call the sweep
      ("fooled the whole table") instead of the generic all-miss.
   B) THE ARC: the save seeds Sterling's story memory — Ana was
      $1,500 down, Bo once led by $1,500. Ana declares at the
      break, banks all three Big Finish questions and takes the
      lead on the last one: the comeback speaks at Q15's reveal,
      and Bo's collapse is queued in the arc record behind it.
   C) THE DECLARATION SETTLES: a save with the call already made
      and flat scores (no arc can qualify) — Ana banks Q15 and
      Sterling must speak the declaration paying out.
   The winner-herald fix (a Decider show's line is authored-only;
   tied standings prefetch nothing) lives on the live-AI path,
   which file:// cannot reach — it is verified by construction
   and by drive-decider's regression, not here. */
const { launchBrowser } = require('./rig');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); }

const HUMAN = (name, color, score, avatar, streak) => ({ name, color, score, cut: 1, bet: 1, streak: streak || 0, dbl: 1, vsRound: 0, avatar, house: null });

function craftedSave(players, round, qInRound, extra) {
  const q = { cat: 'Movies', diff: 'easy', d: 1, q: 'In Forrest Gump, Forrest says life is like a box of what?', a: 'Chocolates', w: ['Crayons', 'Roses', 'Letters'], why: 'Mama always said.' };
  const opts = [
    { t: 'Chocolates', ok: true }, { t: 'Crayons', ok: false },
    { t: 'Roses', ok: false }, { t: 'Letters', ok: false }
  ];
  const base = {
    v: 1, savedAt: Date.now(), players: players,
    round: round, qInRound: qInRound, showId: 'drive-sterling',
    bankedOnce: true, bigLeadDone: false, decider: null,
    facts: null, report: null, reportSeq: 0,
    golden: null, goldTease: null, rules: null, rulesLine: null,
    solo: false, soloLine: null, pot: 0, windBreak: null,
    phase: 'reveal', guess: {}, lastStand: null,
    cur: {
      kind: 'mcq', cat: 'Movies', diff: 'easy', value: 400, clockTotal: 20,
      opts: opts, marks: { 0: true }, resolved: true, cutUsed: false, cutPair: null,
      dbl: null, vs: null, lockOrder: [0], house: null, lockTimes: null, lockSeq: 0,
      betRound: round === 3, bankValue: 400, special: false, intro: null, decider: false,
      streakFx: { 0: { streak: 1, bonus: 0 } }, streakMoment: null, potFed: 0, potMoment: null, qid: 0, q: q
    },
    pools: {}, rngState: 987654321, seen: [], nightly: null
  };
  return JSON.stringify(Object.assign(base, extra || {}));
}

async function openSave(browser, save) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.evaluateOnNewDocument(s => {
    try { localStorage.setItem('gh_table_show', s); localStorage.setItem('gh_how_seen', '1'); } catch (e) {}
  }, save);
  await page.setViewport({ width: 844, height: 390 });
  await page.goto('file:///home/hatch/workspace/gilded-hour/index.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(700);
  await page.waitForSelector('#btnResumeShow', { timeout: 8000 });
  await page.tap('#btnResumeShow');
  await sleep(900);
  return { page, errors };
}
const S = page => page.evaluate(() => {
  const g = window.__game && window.__game.G;
  const hl = document.querySelector('#hostLine');
  if (!g) return { bubble: hl ? hl.textContent : '' };
  const c = g.cur || {};
  return {
    phase: g.phase, round: g.round, qInRound: g.qInRound,
    scores: g.players.map(p => p.score),
    kind: c.kind, truth: c.q ? c.q.a : null, trueNum: c.q && typeof c.q.a === 'number' ? c.q.a : null,
    correctIx: c.opts ? c.opts.findIndex(o => o.ok) : -1,
    surveyTop: c.opts ? c.opts.reduce((bi, o, i) => (o.v > (c.opts[bi] ? c.opts[bi].v : -1) ? i : bi), 0) : -1,
    opts: c.opts ? c.opts.map(o => ({ t: o.t, ok: !!o.ok, by: o.by })) : null,
    bluffDealt: !!c.bluffDealt, bluffFool: c.bluffFool || null,
    bets: g.players.map(p => p.bet),
    declared: g.declared || {},
    arc: g.arc ? JSON.parse(JSON.stringify(g.arc)) : null,
    bubble: hl ? hl.textContent : ''
  };
});
/* the desks re-render as bets and picks land, so a found node
   can detach before the tap — every tap in this drive is
   best-effort and the state reads decide what actually happened */
const tapIf = async (page, sel) => { try { const el = await page.$(sel); if (!el) return false; await page.tap(sel); return true; } catch (e) { return false; } };

/* one Big Finish question with seat 0 as the banker: set seat 0's
   bet, seat 0 answers true, the others answer wrong */
async function playBetQuestion(page, betTarget) {
  let s = await S(page);
  /* the round intro rests before the first bet phase — ride it
     out (a short wait here silently wastes the whole call) */
  for (let t = 0; t < 70 && s.phase !== 'bet'; t++) { await sleep(300); s = await S(page); }
  if (s.phase !== 'bet') return s;
  /* the phase flag flips before the desk controls paint — wait
     for the buttons themselves and tolerate their late arrival */
  await page.waitForSelector('[data-bet="0|1"]', { timeout: 12000 }).catch(() => {});
  for (let t = 0; t < 10; t++) {
    s = await S(page);
    if (!s || s.phase !== 'bet' || s.bets[0] >= betTarget) break;
    if (!await tapIf(page, '[data-bet="0|1"]')) { await sleep(300); continue; }
    await sleep(120);
  }
  /* the desk bet buttons paint before the stage's done button —
     wait for the button itself, and let the phase's own autoGo
     cover a miss rather than crash the drive */
  await page.waitForSelector('#btnBetsDone', { timeout: 10000 }).then(() => page.tap('#btnBetsDone')).catch(() => {});
  await sleep(400);
  for (let t = 0; t < 30; t++) { s = await S(page); if (s.phase === 'question') break; await sleep(300); }
  if (s.phase !== 'question') return s;
  if (s.kind === 'num') {
    const key = async (seat, val) => { for (const ch of String(val)) await tapIf(page, '[data-num="' + seat + '|' + ch + '"]'); await tapIf(page, '[data-num="' + seat + '|lock"]'); };
    await key(0, s.trueNum); await key(1, 1); await key(2, 2);
  } else {
    const right = s.kind === 'survey' ? s.surveyTop : s.correctIx;
    await tapIf(page, '[data-pick="0|' + right + '"]'); await sleep(150);
    for (const seat of [1, 2]) {
      for (let o = 0; o < 4; o++) { if (o !== right && await tapIf(page, '[data-pick="' + seat + '|' + o + '"]')) break; }
      await sleep(150);
    }
  }
  for (let t = 0; t < 40; t++) { s = await S(page); if (s.phase === 'reveal') break; await sleep(300); }
  await sleep(700);
  return S(page);
}

(async () => {
  const browser = await launchBrowser();
  try {
    /* ---------- A: the Bluff's outcome — the sweep ---------- */
    {
      const save = craftedSave([HUMAN('Ana', 0, 500, 0), HUMAN('Bo', 1, 400, 1), HUMAN('Cy', 2, 300, 2)], 2, 2, {});
      const { page, errors } = await openSave(browser, save);
      await page.waitForSelector('#btnNext', { timeout: 8000 });
      await page.tap('#btnNext');
      await page.waitForSelector('#btnDealBluff', { timeout: 15000 });
      await sleep(250);
      let s = await S(page);
      check('A: the slot deals the bluff', s.kind === 'bluff', s.kind);
      await page.type('#bluffIn0', 'A brass teaspoon');
      await page.type('#bluffIn1', 'A silver fork');
      await page.type('#bluffIn2', 'A wooden spoon');
      await page.tap('#btnDealBluff');
      await sleep(600);
      s = await S(page);
      const anaLieIx = s.opts.findIndex(o => o.t === 'A brass teaspoon');
      const boLieIx = s.opts.findIndex(o => o.t === 'A silver fork');
      /* nobody finds the truth: Ana falls for Bo's lie, Bo and Cy
         both fall for Ana's */
      await page.tap('[data-pick="0|' + boLieIx + '"]'); await sleep(200);
      await page.tap('[data-pick="1|' + anaLieIx + '"]'); await sleep(200);
      await page.tap('[data-pick="2|' + anaLieIx + '"]'); await sleep(200);
      for (let t = 0; t < 40; t++) { s = await S(page); if (s.phase === 'reveal') break; await sleep(300); }
      await sleep(700);
      s = await S(page);
      check('A: the lie fooled two seats for $50', !!(s.bluffFool && s.bluffFool[0] === 50), JSON.stringify(s.bluffFool));
      check('A: Sterling calls the sweep by its name', s.bubble.includes('fooled the whole table') && s.bubble.includes('Ana'), s.bubble);
      check('A: zero console/page errors', errors.length === 0, errors.join('; '));
      await page.close();
    }

    /* ---------- B: the arc — comeback speaks, collapse queues ---------- */
    {
      const arc = { worst: [1500, 0, 1300], best: [0, 1500, 0], queue: [], spoken: [] };
      /* Ana's streak starts at 1 on purpose: her crossings then
         land on Q14 (3), leaving Q15's reveal to the comeback —
         a crossing on Q15 itself would outrank it, by the
         streak family's settled place at the head of the
         arbitration */
      const save = craftedSave([HUMAN('Ana', 0, 100, 0, 1), HUMAN('Bo', 1, 1600, 1), HUMAN('Cy', 2, 200, 2)], 2, 5, { arc });
      const { page, errors } = await openSave(browser, save);
      await page.waitForSelector('#btnNext', { timeout: 8000 });
      await page.tap('#btnNext');
      await sleep(600);
      /* the break: Ana declares */
      await page.waitForSelector('[data-declare="0"]', { timeout: 10000 });
      await page.tap('[data-declare="0"]');
      await sleep(300);
      let s = await S(page);
      check('B: Ana declared at the break', !!(s.declared && s.declared[0]), JSON.stringify(s.declared));
      await page.tap('#btnBreakGo');
      s = await playBetQuestion(page, 4);            /* Q13 */
      check('B: no arc beat yet — Bo still leads', !!(s.arc && s.arc.queue.length === 0 && s.arc.spoken.length === 0),
        'queue=' + JSON.stringify(s.arc && s.arc.queue) + ' scores=' + JSON.stringify(s.scores));
      s = await playBetQuestion(page, 4);            /* Q14 */
      s = await playBetQuestion(page, 3);            /* Q15 — Ana takes the lead here */
      check('B: Ana leads alone at the end', s.scores[0] > s.scores[1] && s.scores[0] > s.scores[2], JSON.stringify(s.scores));
      check('B: Sterling speaks the comeback at Q15, naming Ana', s.bubble.includes('comeback') && s.bubble.includes('Ana'), s.bubble);
      await page.screenshot({ path: 'shots/sterling-comeback.png' });
      /* the finale is a staged sequence (envelope, crowning,
         report) — allow it its full length, tapping through */
      for (let t = 0; t < 60; t++) { s = await S(page); if (s.phase === 'over') break; await tapIf(page, '#btnNext'); await sleep(400); }
      check('B: the finale is reached', s.phase === 'over', s.phase);
      const spoken = (s.arc && s.arc.spoken) || [];
      const queued = (s.arc && s.arc.queue) || [];
      check('B: the arc remembers the comeback as spoken', spoken.some(q => q.kind === 'comeback' && q.seat === 0), JSON.stringify(spoken));
      check('B: Bo\'s collapse is on the record (queued behind the comeback)',
        queued.some(q => q.kind === 'collapse' && q.seat === 1) || spoken.some(q => q.kind === 'collapse' && q.seat === 1),
        'queue=' + JSON.stringify(queued) + ' spoken=' + JSON.stringify(spoken) + ' scores=' + JSON.stringify(s.scores));
      check('B: the tracker kept the depths and heights', !!(s.arc && s.arc.worst[0] >= 1500 && s.arc.best[1] >= 1500),
        'worst=' + JSON.stringify(s.arc && s.arc.worst) + ' best=' + JSON.stringify(s.arc && s.arc.best));
      check('B: zero console/page errors', errors.length === 0, errors.join('; '));
      await page.close();
    }

    /* ---------- C: the declaration settles — paid, in words ---------- */
    {
      const save = craftedSave(
        [HUMAN('Ana', 0, 800, 0, 1), HUMAN('Bo', 1, 700, 1), HUMAN('Cy', 2, 600, 2)],
        2, 5, { declared: { 0: true } });
      const { page, errors } = await openSave(browser, save);
      await page.waitForSelector('#btnNext', { timeout: 8000 });
      await page.tap('#btnNext');
      await sleep(600);
      let s0 = await S(page);
      for (let t = 0; t < 20 && s0.phase !== 'intermission'; t++) { await sleep(300); s0 = await S(page); }
      check('C: the resumed show reaches the last break', s0.phase === 'intermission', 'phase=' + s0.phase + ' round=' + s0.round);
      /* an already-declared seat renders as a settled, disabled
         button WITHOUT the data-declare hook — that settled
         button is exactly what a resumed break must show */
      await page.waitForSelector('.declare-btn.declared', { timeout: 10000 });
      const settledText = await page.evaluate(() => {
        const b = document.querySelector('.declare-btn.declared');
        return b ? b.textContent : '';
      });
      check('C: the resumed break shows Ana\'s call already settled', settledText.includes('Ana') && settledText.includes('DECLARED'), settledText);
      let s = await S(page);
      check('C: the declaration rode the save', !!(s.declared && s.declared[0]), JSON.stringify(s.declared));
      await page.tap('#btnBreakGo');
      s = await playBetQuestion(page, 1);            /* Q13 — Ana banks, streak crosses 3 here */
      s = await playBetQuestion(page, 1);            /* Q14 */
      s = await playBetQuestion(page, 3);            /* Q15 — the declared bank */
      check('C: Sterling speaks the declaration paying out', s.bubble.includes('declaration pays') && s.bubble.includes('Ana'), s.bubble);
      await page.screenshot({ path: 'shots/sterling-declarepaid.png' });
      check('C: zero console/page errors', errors.length === 0, errors.join('; '));
      await page.close();
    }
  } finally { await browser.close(); }
  const failed = results.filter(r => !r.ok);
  console.log('drive-sterling: ' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed');
  process.exitCode = failed.length ? 1 : 0;
})();
