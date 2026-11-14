/* THE FACE PASS — the presentation shots: the setup sheet (name
   rows + podium preview wearing medallions), the desks in a live
   reveal, and the pad's join sheet with the picker gone. */
const { launchBrowser } = require('./rig');
const fs = require('fs');
const ROOT = '/home/hatch/workspace/gilded-hour';
const SHOTS = ROOT + '/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const url = 'file://' + ROOT + '/index.html';

function craftedSave(players) {
  const q = { cat: 'Movies', diff: 'easy', d: 1, q: 'In Forrest Gump, Forrest says life is like a box of what?', a: 'Chocolates', w: ['Crayons', 'Roses', 'Letters'], why: 'Mama always said.' };
  const opts = [{ t: 'Chocolates', ok: true }, { t: 'Crayons', ok: false }, { t: 'Roses', ok: false }, { t: 'Letters', ok: false }];
  return JSON.stringify({ v: 1, savedAt: Date.now(), players, round: 2, qInRound: 2, showId: 'shots-faces', bankedOnce: true, bigLeadDone: false, decider: null, facts: null, report: null, reportSeq: 0, golden: null, goldTease: null, rules: null, rulesLine: null, solo: false, soloLine: null, pot: 0, windBreak: null, phase: 'reveal', guess: {}, lastStand: null, cur: { kind: 'mcq', cat: 'Movies', diff: 'easy', value: 400, clockTotal: 20, opts, marks: { 0: true }, resolved: true, cutUsed: false, cutPair: null, dbl: null, vs: null, lockOrder: [0], house: null, lockTimes: null, lockSeq: 0, betRound: false, bankValue: 400, special: false, intro: null, decider: false, streakFx: { 0: { streak: 1, bonus: 0 } }, streakMoment: null, potFed: 0, potMoment: null, qid: 0, q }, pools: {}, rngState: 987654321, seen: [], nightly: null });
}
const HUMAN = (n, c, s) => ({ name: n, color: c, score: s, cut: 1, bet: 1, streak: 0, dbl: 1, vsRound: 0, house: null });

(async () => {
  const browser = await launchBrowser();
  const save = craftedSave([HUMAN('Ana', 0, 500), HUMAN('Bo', 1, 400), HUMAN('Cy', 2, 300)]);

  /* setup + join, fresh profile each orientation */
  for (const [tag, w, h] of [['port', 390, 844], ['land', 844, 390]]) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h });
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await sleep(1000);
    /* name the seats so the medallions spell the table */
    const inputs = await page.$$('#panelTable .name-input');
    const names = ['Ana', 'Bo', 'Cy'];
    for (let i = 0; i < Math.min(3, inputs.length); i++) {
      await inputs[i].click({ clickCount: 3 }).catch(() => {});
      await page.evaluate((idx, nm) => {
        const inp = document.querySelectorAll('#panelTable .name-input')[idx];
        inp.value = nm; inp.dispatchEvent(new Event('input', { bubbles: true }));
      }, i, names[i]);
    }
    await sleep(400);
    await page.screenshot({ path: SHOTS + '/faces-setup-' + tag + '.png' });
    /* the join sheet, picker gone */
    await page.evaluate(() => { window.__game && document.querySelector('[data-mode="join"]') && document.querySelector('[data-mode="join"]').click(); });
    await sleep(600);
    await page.screenshot({ path: SHOTS + '/faces-join-' + tag + '.png' });
    await page.close();
  }

  /* desks in a live reveal */
  for (const [tag, w, h] of [['port', 390, 844], ['land', 844, 390]]) {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(s => { try { localStorage.setItem('gh_table_show', s); localStorage.setItem('gh_how_seen', '1'); } catch (e) {} }, save);
    await page.setViewport({ width: w, height: h });
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await sleep(800);
    await page.waitForSelector('#btnResumeShow', { timeout: 9000 });
    await page.tap('#btnResumeShow');
    await sleep(2600);
    await page.screenshot({ path: SHOTS + '/faces-desks-' + tag + '.png' });
    await page.close();
  }
  await browser.close();
  console.log('shots done');
})().catch(e => { console.error('ERR', e); process.exit(2); });
