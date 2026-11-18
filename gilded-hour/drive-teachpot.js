/* drive-teachpot.js — Teach the pot (improvement Pass 5,
   2026-11-17). (drive-pot.js is the older Dynamics D1 drive —
   a different file on purpose.)
   A) THE HOW CARDS: five beats now, five dots; the pot has its
      own card ("THE POT TAKES WHAT'S LEFT") telling the whole
      rule — fed by unbanked questions and missed Big Finish
      stakes, paid only to the champion; and the Big Finish
      card's heading reads "THE BIG FINISH IS A BET" (it shipped
      for weeks as "THE BIG FINISH IS BET").
   B) THE FEED, IN WORDS: a crafted show where the whole table
      misses a question — the reveal must feed the pot AND say
      so: a "+$X TO THE POT" tag stands at the vessel while the
      coins fly, the vessel total settles at the same figure,
      and the tag fades when its moment is over. */
const { launchBrowser } = require('./rig');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); }
const tapIf = async (page, sel) => { try { const el = await page.$(sel); if (!el) return false; await page.tap(sel); return true; } catch (e) { return false; } };

const HUMAN = (name, color, score, avatar) => ({ name, color, score, cut: 1, bet: 1, streak: 0, dbl: 1, vsRound: 0, avatar, house: null });
function craftedSave() {
  const q = { cat: 'Movies', diff: 'easy', d: 1, q: 'In Forrest Gump, Forrest says life is like a box of what?', a: 'Chocolates', w: ['Crayons', 'Roses', 'Letters'], why: 'Mama always said.' };
  const opts = [{ t: 'Chocolates', ok: true }, { t: 'Crayons', ok: false }, { t: 'Roses', ok: false }, { t: 'Letters', ok: false }];
  return JSON.stringify({
    v: 1, savedAt: Date.now(),
    players: [HUMAN('Ana', 0, 300, 0), HUMAN('Bo', 1, 200, 1), HUMAN('Cy', 2, 100, 2)],
    round: 1, qInRound: 0, showId: 'drive-teachpot',
    bankedOnce: true, bigLeadDone: false, decider: null,
    facts: null, report: null, reportSeq: 0,
    golden: null, goldTease: null, rules: null, rulesLine: null,
    solo: false, soloLine: null, pot: 0, windBreak: null,
    phase: 'reveal', guess: {}, lastStand: null,
    cur: {
      kind: 'mcq', cat: 'Movies', diff: 'easy', value: 400, clockTotal: 20,
      opts: opts, marks: { 0: true }, resolved: true, cutUsed: false, cutPair: null,
      dbl: null, vs: null, lockOrder: [0], house: null, lockTimes: null, lockSeq: 0,
      betRound: false, bankValue: 400, special: false, intro: null, decider: false,
      streakFx: { 0: { streak: 1, bonus: 0 } }, streakMoment: null, potFed: 0, potMoment: null, qid: 0, q: q
    },
    pools: {}, rngState: 987654321, seen: [], nightly: null
  });
}
const S = page => page.evaluate(() => {
  const g = window.__game && window.__game.G;
  if (!g) return {};
  const c = g.cur || {};
  return {
    phase: g.phase, kind: c.kind, pot: g.pot || 0,
    trueNum: c.q && typeof c.q.a === 'number' ? c.q.a : null,
    correctIx: c.opts ? c.opts.findIndex(o => o.ok) : -1,
    surveyTop: c.opts ? c.opts.reduce((bi, o, i) => (o.v > (c.opts[bi] ? c.opts[bi].v : -1) ? i : bi), 0) : -1,
    tag: (() => { const t = document.querySelector('.pot-feed-tag'); return t ? { text: t.textContent, show: t.classList.contains('show') } : null; })(),
    potTotal: (() => { const t = document.querySelector('.pot-total'); return t ? t.textContent : null; })()
  };
});

(async () => {
  const browser = await launchBrowser();
  try {
    /* ---------- A: the HOW cards ---------- */
    {
      const page = await browser.newPage();
      const errors = [];
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
      await page.setViewport({ width: 844, height: 390 });
      await page.goto('file:///home/hatch/workspace/gilded-hour/index.html', { waitUntil: 'load', timeout: 60000 });
      await sleep(800);
      await page.tap('#btnHow');
      await sleep(500);
      const counts = await page.evaluate(() => ({
        beats: document.querySelectorAll('.how-beat').length,
        dots: document.querySelectorAll('.how-dot').length
      }));
      check('A: five teaching beats, five dots', counts.beats === 5 && counts.dots === 5, JSON.stringify(counts));
      await page.tap('#howNext'); await sleep(300);
      const potCard = await page.evaluate(() => {
        const b = document.querySelector('.how-beat[data-beat="1"]');
        return b ? { title: b.querySelector('.how-title').textContent, text: b.querySelector('.how-text').textContent } : null;
      });
      check('A: the pot has its own card', !!potCard && potCard.title === "THE POT TAKES WHAT'S LEFT", potCard ? potCard.title : 'none');
      check('A: the card tells the whole rule — fed by failure, missed stakes too, champion takes it',
        !!potCard && potCard.text.includes('fed by failure') && potCard.text.includes('every missed stake drops in too') && potCard.text.includes('the champion takes the whole pot'),
        potCard ? potCard.text.slice(0, 80) : 'none');
      await page.screenshot({ path: 'shots/how-pot.png' });
      await page.tap('#howNext'); await sleep(300);
      const bfTitle = await page.evaluate(() => {
        const b = document.querySelector('.how-beat[data-beat="2"]');
        return b ? b.querySelector('.how-title').textContent : null;
      });
      check('A: the Big Finish heading is fixed', bfTitle === 'THE BIG FINISH IS A BET', bfTitle);
      await page.tap('#howNext'); await sleep(200);
      await page.tap('#howNext'); await sleep(300);
      const endState = await page.evaluate(() => ({
        startShown: !document.querySelector('#howStart').classList.contains('hidden'),
        nextHidden: document.querySelector('#howNext').classList.contains('hidden'),
        selDot: Array.from(document.querySelectorAll('.how-dot')).findIndex(d => d.classList.contains('sel'))
      }));
      check('A: the cards page through to the last beat', endState.startShown && endState.nextHidden && endState.selDot === 4, JSON.stringify(endState));
      check('A: zero console/page errors', errors.length === 0, errors.join('; '));
      await page.close();
    }

    /* ---------- B: the feed, in words ---------- */
    {
      const page = await browser.newPage();
      const errors = [];
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
      await page.evaluateOnNewDocument(s => {
        try { localStorage.setItem('gh_table_show', s); localStorage.setItem('gh_how_seen', '1'); } catch (e) {}
      }, craftedSave());
      await page.setViewport({ width: 844, height: 390 });
      await page.goto('file:///home/hatch/workspace/gilded-hour/index.html', { waitUntil: 'load', timeout: 60000 });
      await sleep(700);
      await page.waitForSelector('#btnResumeShow', { timeout: 8000 });
      await page.tap('#btnResumeShow');
      await sleep(900);
      await page.waitForSelector('#btnNext', { timeout: 8000 });
      await page.tap('#btnNext');
      /* ride to the live question and make the whole table miss */
      let s = await S(page);
      for (let t = 0; t < 40 && s.phase !== 'question'; t++) { await sleep(300); s = await S(page); }
      check('B: a live question opens', s.phase === 'question', s.phase + '/' + s.kind);
      if (s.kind === 'num') {
        for (const seat of [0, 1, 2]) {
          const wrong = (s.trueNum || 100) + 500 + seat * 37;
          for (const ch of String(wrong)) await tapIf(page, '[data-num="' + seat + '|' + ch + '"]');
          await tapIf(page, '[data-num="' + seat + '|lock"]');
          await sleep(120);
        }
      } else {
        const wrongIx = s.kind === 'survey' ? (s.surveyTop + 1) % 4 : (s.correctIx + 1) % 4;
        for (const seat of [0, 1, 2]) { await tapIf(page, '[data-pick="' + seat + '|' + wrongIx + '"]'); await sleep(150); }
      }
      /* the reveal: the tag stands at beat 2 of the reveal
         staging (~1s after the reveal paints) and lives 2.5s —
         poll through the vote-count and the whole reveal */
      let tagSeen = null;
      for (let t = 0; t < 90; t++) {
        s = await S(page);
        if (s.tag && s.tag.show) { tagSeen = s.tag; break; }
        await sleep(150);
      }
      check('B: the feed speaks — a +$ tag stands at the vessel', !!tagSeen && /^\+\$[\d,]+ TO THE POT$/.test(tagSeen.text), tagSeen ? tagSeen.text : 'no tag');
      await page.screenshot({ path: 'shots/pot-feed.png' });
      await sleep(1700);
      s = await S(page);
      const tagAmt = tagSeen ? Number(tagSeen.text.replace(/[^\d]/g, '')) : -1;
      check('B: the pot holds exactly what the tag announced', s.pot === tagAmt && s.pot > 0, 'pot=' + s.pot + ' tag=' + tagAmt);
      check('B: the vessel total reads the same figure', s.potTotal === '$' + s.pot.toLocaleString('en-US'), s.potTotal);
      await sleep(2200);
      s = await S(page);
      check('B: the tag fades when its moment is over', !s.tag || !s.tag.show, s.tag ? String(s.tag.show) : 'gone');
      check('B: zero console/page errors', errors.length === 0, errors.join('; '));
      await page.close();
    }
  } finally { await browser.close(); }
  const failed = results.filter(r => !r.ok);
  console.log('drive-teachpot: ' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed');
  process.exitCode = failed.length ? 1 : 0;
})();
