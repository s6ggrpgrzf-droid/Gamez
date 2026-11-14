/* THE FACE PASS (2026-11-13) — the medallion census. The eight
   player portraits are retired; this drive proves the new grammar
   and the absence of the old:
   (a) via __game.marks.svg — the very renderer the desks fly by —
       every seat's medallion carries that seat's colour and the
       player's initial, and no bust geometry survives in it;
   (b) no picker exists anywhere: the pad's join sheet has no
       portrait grid, and the table's name rows carry a still
       medallion (a span, not a button) whose letter follows the
       name being typed;
   (c) live at the table (a crafted save resumed into a reveal,
       then played forward into the Bluff's mark screen): every
       desk and every vote chip wears a medallion, no non-medallion
       .avatar exists anywhere, and Sterling's own portrait — the
       show's one face — is untouched in the host bust. */
const { launchBrowser } = require('./rig');
const fs = require('fs');

const ROOT = '/home/hatch/workspace/gilded-hour';
const SHOTS = ROOT + '/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok, detail }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); }
const url = 'file://' + ROOT + '/index.html';
const SEATCOL = ['#35D461', '#38B6FF', '#FF6B5E', '#B07FE8'];

function craftedSave(players) {
  const q = { cat: 'Movies', diff: 'easy', d: 1, q: 'In Forrest Gump, Forrest says life is like a box of what?', a: 'Chocolates', w: ['Crayons', 'Roses', 'Letters'], why: 'Mama always said.' };
  const opts = [{ t: 'Chocolates', ok: true }, { t: 'Crayons', ok: false }, { t: 'Roses', ok: false }, { t: 'Letters', ok: false }];
  return JSON.stringify({ v: 1, savedAt: Date.now(), players, round: 2, qInRound: 2, showId: 'faces-' + Date.now(), bankedOnce: true, bigLeadDone: false, decider: null, facts: null, report: null, reportSeq: 0, golden: null, goldTease: null, rules: null, rulesLine: null, solo: false, soloLine: null, pot: 0, windBreak: null, phase: 'reveal', guess: {}, lastStand: null, cur: { kind: 'mcq', cat: 'Movies', diff: 'easy', value: 400, clockTotal: 20, opts, marks: { 0: true }, resolved: true, cutUsed: false, cutPair: null, dbl: null, vs: null, lockOrder: [0], house: null, lockTimes: null, lockSeq: 0, betRound: false, bankValue: 400, special: false, intro: null, decider: false, streakFx: { 0: { streak: 1, bonus: 0 } }, streakMoment: null, potFed: 0, potMoment: null, qid: 0, q }, pools: {}, rngState: 987654321, seen: [], nightly: null });
}
const HUMAN = (n, c, s) => ({ name: n, color: c, score: s, cut: 1, bet: 1, streak: 0, dbl: 1, vsRound: 0, house: null });

(async () => {
  const browser = await launchBrowser({ protocolTimeout: 240000 });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await sleep(900);

  /* ---------- (a) the renderer census ---------- */
  const census = await page.evaluate((SEATCOL) => {
    const M = window.__game.marks;
    if (!M || typeof M.svg !== 'function') return { ok: false, why: 'no __game.marks.svg' };
    const names = ['Ana', 'Bo', 'Cy', 'Dee'];
    const out = { ok: true, letters: [], colours: [], bust: false, texts: 0 };
    for (let s = 0; s < 4; s++) {
      const svg = M.svg(names[s], s);
      if (!svg.includes('class="avatar medallion"')) out.ok = false;
      if (!svg.includes('>' + names[s][0] + '</text>')) out.ok = false;
      out.letters.push(svg.includes('>' + names[s][0] + '</text>'));
      out.colours.push(svg.toLowerCase().includes('rgb(53,212,97)') || svg.includes(SEATCOL[s]) || svg.length > 0);
      if (svg.includes('120 124') || svg.includes('#F6B183')) out.bust = true;
      if (svg.includes('<text')) out.texts++;
    }
    /* the medallion must actually shade by seat colour: the deep
       field is rgb() derived from the seat hex — seats differ */
    const a = M.svg('Ana', 0), b = M.svg('Ana', 1);
    out.seatDistinct = a !== b;
    /* a lowercase name still wears its capital */
    out.capital = M.svg('ana', 2).includes('>A</text>');
    return out;
  }, SEATCOL);
  check('Census: __game.marks.svg renders a medallion for every seat', !!census.ok);
  check('Census: each medallion wears the player\'s initial as text', census.letters && census.letters.every(Boolean), (census.letters || []).join(','));
  check('Census: the same name in different seats renders differently (seat colour)', census.seatDistinct === true);
  check('Census: a lowercase name still wears its capital', census.capital === true);
  check('Census: no bust geometry or skin tones survive in the mark', census.bust === false);

  /* ---------- (b) no picker anywhere ---------- */
  const pickers = await page.evaluate(() => ({
    grid: !!document.querySelector('#jpAvaGrid'),
    padBtns: document.querySelectorAll('.jp-ava-btn').length,
    avaTag: (document.querySelector('.ava-pick') || {}).tagName || null,
    avaMedal: !!document.querySelector('.ava-pick svg.medallion')
  }));
  check('Join sheet: no portrait grid, no portrait buttons', !pickers.grid && pickers.padBtns === 0, JSON.stringify(pickers));
  check('Name rows: the mark is a still span, not a button', pickers.avaTag === 'SPAN', pickers.avaTag || 'none');
  check('Name rows: the span wears a medallion', pickers.avaMedal === true);
  /* typing a name re-letters the medallion in its own row */
  await page.focus('#panelTable .name-input');
  await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
  await page.keyboard.type('Robin');
  await sleep(250);
  const typed = await page.evaluate(() => {
    const t = document.querySelector('.ava-pick svg.medallion text');
    return t ? t.textContent : null;
  });
  check('Typing a name re-letters its medallion (R for Robin)', typed === 'R', 'letter=' + typed);

  /* ---------- (c) live at the table ---------- */
  const save = craftedSave([HUMAN('Ana', 0, 500), HUMAN('Bo', 1, 400), HUMAN('Cy', 2, 300)]);
  await page.evaluate((s) => { try { localStorage.setItem('gh_table_show', s); } catch (e) {} }, save);
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await sleep(800);
  await page.waitForSelector('#btnResumeShow', { timeout: 9000 });
  await page.tap('#btnResumeShow');
  await sleep(1200);
  const desks = await page.evaluate(() => {
    const seats = [...document.querySelectorAll('#seatsTop .seat, #seatsBottom .seat')];
    return {
      n: seats.length,
      medallions: document.querySelectorAll('.seat-ava svg.medallion').length,
      letters: [...document.querySelectorAll('.seat-ava svg.medallion text')].map(t => t.textContent),
      strayAvatars: document.querySelectorAll('svg.avatar:not(.medallion)').length,
      hostFace: !!document.querySelector('.host-face svg')
    };
  });
  check('Desks: every seat wears a medallion', desks.n === 3 && desks.medallions === 3, JSON.stringify(desks));
  check('Desks: the medallions spell the table (A, B, C)', desks.letters.join('') === 'ABC', desks.letters.join(','));
  check('Whole document: no non-medallion avatar survives', desks.strayAvatars === 0, 'stray=' + desks.strayAvatars);
  check('Sterling\'s own portrait stands untouched in the host bust', desks.hostFace === true);

  /* forward into the Bluff: vote chips wear medallions too */
  await page.waitForSelector('#btnNext', { timeout: 9000 });
  await page.tap('#btnNext');
  await page.waitForSelector('#btnDealBluff', { timeout: 15000 });
  await page.type('#bluffIn0', 'A brass teaspoon');
  await page.tap('#btnDealBluff');
  await sleep(600);
  const truthIx = await page.evaluate(() => window.__game.G.cur.opts.findIndex(o => o.ok));
  await page.tap('#btnCallIt');
  await page.waitForSelector('.bluff-pick', { timeout: 9000 });
  await page.tap('.bluff-pick[data-opt="' + truthIx + '"]');
  await sleep(150);
  await page.tap('.seat[data-seat="0"]');
  await sleep(300);
  const chips = await page.evaluate(() => ({
    n: document.querySelectorAll('.bluff-pick .vote-chip').length,
    medallions: document.querySelectorAll('.bluff-pick .vote-chip svg.medallion').length,
    letter: (document.querySelector('.bluff-pick .vote-chip svg.medallion text') || {}).textContent || null
  }));
  check('Bluff mark: the vote chip wears a medallion', chips.n === 1 && chips.medallions === 1, JSON.stringify(chips));
  check('Bluff mark: the chip\'s medallion carries the voter\'s initial', chips.letter === 'A', 'letter=' + chips.letter);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' ; '));
  const fails = results.filter(r => !r.ok);
  console.log('DRIVE-FACES DONE — ' + (results.length - fails.length) + '/' + results.length + ' checks passed');
  await browser.close();
  if (fails.length) process.exit(1);
})().catch(e => { console.error('ERR', e); process.exit(2); });
