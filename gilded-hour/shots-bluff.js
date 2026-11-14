/* shots-bluff.js — THE BLUFF tour frames (research programme pass 2).
   Table game through crafted saves, same staging as drive-bluff.js:
   invent stage in both orientations, the dealt vote, and the reveal
   with the accounting of lies in both orientations. */
const { launchBrowser } = require('./rig');
const fs = require('fs');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function craftedSave(players) {
  const q = { cat: 'Movies', diff: 'easy', d: 1, q: 'In Forrest Gump, Forrest says life is like a box of what?', a: 'Chocolates', w: ['Crayons', 'Roses', 'Letters'], why: 'Mama always said.' };
  const opts = [
    { t: 'Chocolates', ok: true }, { t: 'Crayons', ok: false },
    { t: 'Roses', ok: false }, { t: 'Letters', ok: false }
  ];
  return JSON.stringify({
    v: 1, savedAt: Date.now(), players: players,
    round: 2, qInRound: 2, showId: 'shots-bluff',
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
const HUMAN = (name, color, score, avatar) => ({ name, color, score, cut: 1, bet: 1, streak: 0, dbl: 1, vsRound: 0, avatar, house: null });

async function openSave(browser, w, h) {
  const page = await browser.newPage();
  const save = craftedSave([HUMAN('Ana', 0, 500, 0), HUMAN('Bo', 1, 400, 1), HUMAN('Cy', 2, 300, 2)]);
  await page.evaluateOnNewDocument(s => {
    try { localStorage.setItem('gh_table_show', s); localStorage.setItem('gh_how_seen', '1'); } catch (e) {}
  }, save);
  await page.setViewport({ width: w, height: h });
  await page.goto('file:///home/hatch/workspace/gilded-hour/index.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(700);
  await page.waitForSelector('#btnResumeShow', { timeout: 8000 });
  await page.tap('#btnResumeShow');
  await sleep(900);
  await page.waitForSelector('#btnNext', { timeout: 8000 });
  await page.tap('#btnNext');
  await page.waitForSelector('#btnDealBluff', { timeout: 15000 });
  await sleep(300);
  return page;
}
const G = page => page.evaluate(() => {
  const g = window.__game.G, c = g.cur;
  return { truth: c.q ? c.q.a : null, opts: c.opts ? c.opts.map(o => ({ t: o.t, ok: !!o.ok })) : null };
});
async function playToReveal(page) {
  await page.type('#bluffIn0', 'A brass teaspoon');
  await page.tap('#btnDealBluff');
  await sleep(600);
  const s = await G(page);
  const anaLieIx = s.opts.findIndex(o => o.t === 'A brass teaspoon');
  const truthIx = s.opts.findIndex(o => o.ok);
  await page.tap('#btnCallIt');
  await page.waitForSelector('.bluff-pick', { timeout: 9000 });
  await sleep(300);
  await page.tap('.bluff-pick[data-opt="' + truthIx + '"]'); await sleep(150);
  await page.tap('.seat[data-seat="0"]'); await sleep(150);
  await page.tap('.bluff-pick[data-opt="' + anaLieIx + '"]'); await sleep(150);
  await page.tap('.seat[data-seat="1"]'); await sleep(150);
  await page.tap('.seat[data-seat="2"]'); await sleep(150);
  await page.tap('#btnReveal');
  await sleep(2600);
}

(async () => {
  fs.mkdirSync(path.join(__dirname, 'shots'), { recursive: true });
  const browser = await launchBrowser();
  try {
    /* portrait: invent, dealt vote, reveal */
    const port = await openSave(browser, 390, 844);
    await port.type('#bluffIn0', 'A brass teaspoon');
    await port.screenshot({ path: 'shots/bluff-invent-port.png' });
    await port.tap('#btnDealBluff'); await sleep(700);
    await port.screenshot({ path: 'shots/bluff-dealt-port.png' });
    /* finish the portrait reveal from the dealt state */
    {
      const s = await G(port);
      const anaLieIx = s.opts.findIndex(o => o.t === 'A brass teaspoon');
      const truthIx = s.opts.findIndex(o => o.ok);
      await port.tap('#btnCallIt');
      await port.waitForSelector('.bluff-pick', { timeout: 9000 });
      await sleep(300);
      await port.tap('.bluff-pick[data-opt="' + truthIx + '"]'); await sleep(150);
      await port.tap('.seat[data-seat="0"]'); await sleep(150);
      await port.tap('.bluff-pick[data-opt="' + anaLieIx + '"]'); await sleep(150);
      await port.tap('.seat[data-seat="1"]'); await sleep(150);
      await port.tap('.seat[data-seat="2"]'); await sleep(150);
      await port.tap('#btnReveal'); await sleep(2600);
    }
    await port.screenshot({ path: 'shots/bluff-reveal-port.png' });
    await port.close();

    /* landscape: invent, dealt, mark, reveal */
    const land = await openSave(browser, 844, 390);
    await land.screenshot({ path: 'shots/bluff-invent-land.png' });
    await land.type('#bluffIn0', 'A brass teaspoon');
    await land.tap('#btnDealBluff'); await sleep(700);
    await land.screenshot({ path: 'shots/bluff-dealt-land.png' });
    {
      const s = await G(land);
      const anaLieIx = s.opts.findIndex(o => o.t === 'A brass teaspoon');
      const truthIx = s.opts.findIndex(o => o.ok);
      await land.tap('#btnCallIt');
      await land.waitForSelector('.bluff-pick', { timeout: 9000 });
      await sleep(300);
      await land.screenshot({ path: 'shots/bluff-mark-land.png' });
      await land.tap('.bluff-pick[data-opt="' + truthIx + '"]'); await sleep(150);
      await land.tap('.seat[data-seat="0"]'); await sleep(150);
      await land.tap('.bluff-pick[data-opt="' + anaLieIx + '"]'); await sleep(150);
      await land.tap('.seat[data-seat="1"]'); await sleep(150);
      await land.tap('.seat[data-seat="2"]'); await sleep(150);
      await land.tap('#btnReveal'); await sleep(2600);
    }
    await land.screenshot({ path: 'shots/bluff-reveal-land.png' });
    await land.close();
    console.log('shots done');
  } finally { await browser.close(); }
})().catch(e => { console.error('SHOTS ERROR', e); process.exit(2); });
