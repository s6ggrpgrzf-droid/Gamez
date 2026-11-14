/* drive-bluff.js — THE BLUFF (research programme pass 2, 2026-11-13).
   The bluff's whole table life, driven through crafted saves
   resumed by the game's own resume path, advanced into Round 2's
   fourth question where the bluff is dealt:
   A) the deal: the slot deals a bluff prompt (flat $200, no
      folds), and the invent stage opens — one input per human
      seat, house seats inventing their own.
   B) the dealing of answers: a typed lie survives verbatim; a lie
      that collides with the truth is replaced by a decoy; a blank
      line is dealt a decoy. Plaques = truth + one lie per seat,
      all distinct.
   C) no other stake rides it: no Double disc, no VS disc on any
      desk during the bluff.
   D) the settlement: marking picks per seat — the truth-bank
      pays $200 flat; every player a lie fooled pays its author
      $25 from the house. The reveal prints the accounting of
      lies (author, fooled count, take).
   E) solo: house seats invent from decoys and pick by their own
      rolls; the money conserves exactly (banks x $200 + fooled
      x $25) whatever the house rolled. */
const { launchBrowser } = require('./rig');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); }

function craftedSave(players, solo) {
  const q = { cat: 'Movies', diff: 'easy', d: 1, q: 'In Forrest Gump, Forrest says life is like a box of what?', a: 'Chocolates', w: ['Crayons', 'Roses', 'Letters'], why: 'Mama always said.' };
  const opts = [
    { t: 'Chocolates', ok: true }, { t: 'Crayons', ok: false },
    { t: 'Roses', ok: false }, { t: 'Letters', ok: false }
  ];
  return JSON.stringify({
    v: 1, savedAt: Date.now(), players: players,
    round: 2, qInRound: 2, showId: 'drive-bluff',
    bankedOnce: true, bigLeadDone: false, decider: null,
    facts: null, report: null, reportSeq: 0,
    golden: null, goldTease: null, rules: null, rulesLine: null,
    solo: !!solo, soloLine: null, pot: 0, windBreak: null,
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
const HUMAN = (name, color, score, avatar) => ({ name, color, score, cut: 1, bet: 1, streak: 0, dbl: 1, vsRound: 0, avatar, house: null });
const HOUSE = (name, color, score, avatar, h) => ({ name, color, score, cut: 1, bet: 1, streak: 0, dbl: 1, vsRound: 0, avatar, house: h });

async function openSave(browser, save) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.evaluateOnNewDocument(s => {
    try { localStorage.setItem('gh_table_show', s); localStorage.setItem('gh_how_seen', '1'); } catch (e) {}
  }, save);
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('file:///home/hatch/workspace/gilded-hour/index.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(700);
  await page.waitForSelector('#btnResumeShow', { timeout: 8000 });
  await page.tap('#btnResumeShow');
  await sleep(900);
  return { page, errors };
}
const G = page => page.evaluate(() => {
  const g = window.__game && window.__game.G;
  if (!g) return null;
  const c = g.cur || {};
  return {
    phase: g.phase, round: g.round, qInRound: g.qInRound,
    scores: g.players.map(p => p.score),
    kind: c.kind, value: c.value, headline: !!c.headline, golden: !!c.golden,
    truth: c.q ? c.q.a : null,
    opts: c.opts ? c.opts.map(o => ({ t: o.t, ok: !!o.ok, by: o.by })) : null,
    bluffDealt: !!c.bluffDealt,
    bluffPicks: c.bluffPicks || null,
    bluffFool: c.bluffFool || null,
    pot: g.pot || 0
  };
});
async function advanceToBluff(page) {
  await page.waitForSelector('#btnNext', { timeout: 8000 });
  await page.tap('#btnNext');
  await page.waitForSelector('#btnDealBluff', { timeout: 15000 });
  await sleep(250);
}

(async () => {
  const browser = await launchBrowser();
  try {
    /* ---------- A + B + C + D: the table game ---------- */
    {
      const save = craftedSave([HUMAN('Ana', 0, 500, 0), HUMAN('Bo', 1, 400, 1), HUMAN('Cy', 2, 300, 2)], false);
      const { page, errors } = await openSave(browser, save);
      await advanceToBluff(page);
      let s = await G(page);
      check('A: the slot deals a bluff', s.kind === 'bluff', s.kind);
      check('A: flat $200, no headline, no golden', s.value === 200 && !s.headline && !s.golden, 'value=' + s.value);
      const inputs = await page.evaluate(() => document.querySelectorAll('.bluff-in').length);
      check('A: one invent input per human seat', inputs === 3, String(inputs));
      const truth = s.truth;
      await page.type('#bluffIn0', 'A brass teaspoon');
      await page.type('#bluffIn1', truth); /* collision: must be replaced by a decoy */
      /* seat 2 left blank: dealt a decoy */
      await page.tap('#btnDealBluff');
      await sleep(600);
      s = await G(page);
      check('B: dealt — plaques are truth + one lie per seat', s.bluffDealt && s.opts && s.opts.length === 4, s.opts ? String(s.opts.length) : 'none');
      const texts = s.opts.map(o => o.t);
      check('B: the typed lie survives verbatim', texts.includes('A brass teaspoon'));
      check('B: exactly one truth plaque, and no duplicates', s.opts.filter(o => o.ok).length === 1 && new Set(texts).size === texts.length);
      check('B: the colliding lie was replaced (truth appears once)', texts.filter(t => t === truth).length === 1);
      const discs = await page.evaluate(() => ({ dbl: document.querySelectorAll('.dbl-token').length, vs: document.querySelectorAll('.vs-token').length }));
      check('C: no Double disc, no VS disc rides the bluff', discs.dbl === 0 && discs.vs === 0, JSON.stringify(discs));
      const anaLieIx = s.opts.findIndex(o => o.t === 'A brass teaspoon');
      const truthIx = s.opts.findIndex(o => o.ok);
      await page.tap('#btnCallIt');
      await page.waitForSelector('.bluff-pick', { timeout: 9000 });
      await sleep(300);
      /* Ana banks the truth; Bo and Cy both fell for Ana's lie */
      await page.tap('.bluff-pick[data-opt="' + truthIx + '"]'); await sleep(150);
      await page.tap('.seat[data-seat="0"]'); await sleep(150);
      await page.tap('.bluff-pick[data-opt="' + anaLieIx + '"]'); await sleep(150);
      await page.tap('.seat[data-seat="1"]'); await sleep(150);
      await page.tap('.seat[data-seat="2"]'); await sleep(150);
      await page.tap('#btnReveal');
      await sleep(900);
      s = await G(page);
      check('D: the banker takes the flat $200', s.scores[0] >= 700, 'Ana=' + s.scores[0]);
      check('D: the lie pays $25 per player fooled (Ana +$50 more)', s.scores[0] === 750 && s.bluffFool && s.bluffFool[0] === 50, 'Ana=' + s.scores[0] + ' fool=' + JSON.stringify(s.bluffFool));
      check('D: the fooled pay nothing', s.scores[1] === 400 && s.scores[2] === 300, 'Bo=' + s.scores[1] + ' Cy=' + s.scores[2]);
      check('D: the pot is untouched when somebody banks', s.pot === 0, 'pot=' + s.pot);
      const credits = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.bluff-credit')).map(r => r.textContent.replace(/\s+/g, ' '));
        const tag = document.querySelector('.seat[data-seat="0"] .blufftag');
        return { rows, tag: tag ? tag.textContent : null };
      });
      check('D: the reveal prints the accounting of lies', credits.rows.some(r => /TRUTH/i.test(r)) && credits.rows.some(r => /fooled 2 players/i.test(r)), credits.rows.join(' | '));
      check('D: the author’s desk wears the FOOLED tag', credits.tag === 'FOOLED 2 · +$50', String(credits.tag));
      check('no console errors (table)', errors.length === 0, errors.join('; ').slice(0, 200));
      await page.close();
    }
    /* ---------- E: solo, the house plays ---------- */
    {
      const save = craftedSave([HUMAN('Ana', 0, 500, 0), HOUSE('Sterling', 1, 400, 1, 0), HOUSE('Vera', 2, 300, 2, 1)], true);
      const { page, errors } = await openSave(browser, save);
      await advanceToBluff(page);
      const inputs = await page.evaluate(() => document.querySelectorAll('.bluff-in').length);
      const houseRows = await page.evaluate(() => document.querySelectorAll('.bluff-row.house').length);
      check('E: solo invent — one input, two house rows', inputs === 1 && houseRows === 2, inputs + '/' + houseRows);
      await page.type('#bluffIn0', 'A paper parasol');
      await page.tap('#btnDealBluff');
      await sleep(600);
      let s = await G(page);
      check('E: house seats invented from decoys (4 plaques)', s.opts && s.opts.length === 4 && s.opts.filter(o => !o.ok).length === 3, s.opts ? String(s.opts.length) : 'none');
      const before = s.scores.slice();
      const truthIx = s.opts.findIndex(o => o.ok);
      await page.tap('#btnCallIt');
      await page.waitForSelector('.bluff-pick', { timeout: 9000 });
      await sleep(300);
      s = await G(page);
      check('E: house picks are on the record before marking', s.bluffPicks && s.bluffPicks[1] != null && s.bluffPicks[2] != null, JSON.stringify(s.bluffPicks));
      check('E: no house seat picked its own lie', s.opts[s.bluffPicks[1]].by !== 1 && s.opts[s.bluffPicks[2]].by !== 2);
      await page.tap('.bluff-pick[data-opt="' + truthIx + '"]'); await sleep(150);
      await page.tap('.seat[data-seat="0"]'); await sleep(150);
      await page.tap('#btnReveal');
      await sleep(900);
      s = await G(page);
      const gains = s.scores.map((v, i) => v - before[i]);
      const bankers = Object.keys(s.bluffPicks).filter(k => s.opts[s.bluffPicks[k]].ok).length;
      let fooled = 0;
      Object.keys(s.bluffPicks).forEach(k => { const o = s.opts[s.bluffPicks[k]]; if (!o.ok && +k !== o.by) fooled++; });
      const expected = bankers * 200 + fooled * 25;
      const actual = gains.reduce((a, b) => a + b, 0);
      check('E: the money conserves exactly (banks x $200 + fooled x $25)', actual === expected, 'actual=' + actual + ' expected=' + expected);
      check('E: Ana banked her $200', gains[0] >= 200, 'Ana gain=' + gains[0]);
      check('no console errors (solo)', errors.length === 0, errors.join('; ').slice(0, 200));
      await page.close();
    }
  } finally {
    await browser.close();
  }
  const failed = results.filter(r => !r.ok).length;
  console.log('DRIVE-BLUFF DONE — ' + (results.length - failed) + '/' + results.length + ' checks passed');
  process.exit(failed ? 1 : 0);
})();
