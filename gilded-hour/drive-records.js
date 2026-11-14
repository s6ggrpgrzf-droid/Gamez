/* Design pass 4 — Sterling remembers: the targeted drive, in its own
   file so the existing drives keep their exact check counts.
   TABLE (one page, a whole household history in sequence):
     boot with no record -> no plaque, anywhere;
     show A played in full, seat 0 wins -> written once: shows=1,
       purses equal the final scores, the win and the crown land,
       the finale says FIRST CHAMPION;
     refresh AT the finale -> still written once; the title plaque
       names the champion with wins + lifetime purse; the trophy
       shelf lists all three players in order;
     show B (seat 1 wins) -> A NEW CHAMPION, streak resets to 1;
     show C (seat 1 again) -> DEFENDS THE TITLE x2, streak 2;
     show D (engineered dead level) -> DESIGN CHANGE (New programme
       pass 1): a tied finale is no longer a draw — it goes to the
       Decider; seat 0 is marked closest there and takes the crown
       (A NEW CHAMPION), shows and purses counting exactly as before.
       The no-crown outcome now belongs only to shows that end
       during/undecided (show E's territory);
     show E ended early with END SHOW -> nothing recorded at all;
     clear records (two taps) -> plaque gone, shelf bare.
   ONLINE HOST (stubbed room, http-served):
     a lobby whose seated names include the champion shows
       Sterling's acknowledgement line; a lobby without them doesn't;
     a full stubbed show won by the other player records on the
       HOST device: A NEW CHAMPION, purses and shows updated. */
const { launchBrowser } = require('./rig');
const fs = require('fs');
const http = require('http');
const path = require('path');
const ROOT = '/home/hatch/workspace/gilded-hour';
const SHOTS = ROOT + '/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok, detail }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); }
const money = n => '$' + Math.round(n).toLocaleString('en-US');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('nope'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const httpUrl = 'http://127.0.0.1:' + server.address().port + '/index.html';
  const browser = await launchBrowser({ protocolTimeout: 240000 });
  const errors = [];
  const watch = p => {
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  };
  const readRec = p => p.evaluate(() => { try { return JSON.parse(localStorage.getItem('gh_records_v1') || 'null'); } catch (e) { return null; } });

  /* ================= TABLE ================= */
  const page = await browser.newPage();
  watch(page);
  await page.setViewport({ width: 844, height: 390 });
  await page.goto('file://' + ROOT + '/index.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(600);
  const S = () => page.evaluate(() => {
    const g = window.__game.G;
    if (!g) return null;
    return {
      phase: g.phase, round: g.round, qInRound: g.qInRound, showId: g.showId,
      scores: g.players.map(p => p.score),
      /* Audit A1: the Table Pot at the finale — D1 pays it to the
         champion INSIDE the record, so expectations carry it */
      pot: g.pot || 0,
    };
  });
  const waitPhase = async (want, timeout) => {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeout || 30000)) {
      const s = await S();
      if (s && s.phase === want) return s;
      await sleep(120);
    }
    throw new Error('timeout waiting for phase ' + want + ' (now ' + JSON.stringify(await S()) + ')');
  };
  /* play from wherever the show stands to its finale. winSeat is the
     only seat ever marked, so they bank everything bankable. jump:
     after the first reveal, jump the script to Round 3's last
     question (the drives' established shortcut — the finale the
     record hangs off is reached genuinely either way). */
  async function playShow(opts) {
    let jumped = false, guard = 0;
    while (guard++ < 700) {
      const s = await S();
      if (!s) throw new Error('game state lost');
      if (s.phase === 'over') return s;
      if (s.phase === 'coldopen' || s.phase === 'spin' || s.phase === 'vote-count') { await sleep(160); continue; }
      if (s.phase === 'intro') { await page.tap('#btnRoundGo'); await sleep(220); continue; }
      if (s.phase === 'intermission') { await page.evaluate(() => { const b = document.getElementById('btnEraCall'); if (b) b.click(); }); await sleep(250); await page.tap('#btnBreakGo'); await sleep(220); continue; }
      if (s.phase === 'bet') { await page.tap('#btnBetsDone'); await sleep(220); continue; }
      if (s.phase === 'question') {
        await page.evaluate(() => { const g = window.__game.G; if (g && g.cur) g.cur.elapsed = 5; });
        /* THE BLUFF (pass 2): the slot opens on the invent stage — deal first */
        const isBluff = await page.evaluate(() => { const g = window.__game.G; return !!(g && g.cur && g.cur.kind === 'bluff' && !g.cur.bluffDealt); });
        if (isBluff) { await page.tap('#btnDealBluff'); await sleep(220); continue; }
        await page.tap('#btnCallIt'); await sleep(180); continue;
      }
      if (s.phase === 'vote') {
        /* THE BLUFF: the win seat takes the truth plaque first,
           then its seat tap lands like any other mark */
        const bluffTruth = await page.evaluate(() => { const g = window.__game.G; return (g && g.cur && g.cur.kind === 'bluff' && g.cur.opts) ? g.cur.opts.findIndex(o => o.ok) : -1; });
        if (bluffTruth >= 0) { await page.tap('.bluff-pick[data-opt="' + bluffTruth + '"]'); await sleep(150); }
        await page.tap('.seat[data-seat="' + opts.winSeat + '"]'); await sleep(150);
        await page.tap('#btnReveal'); await sleep(220); continue;
      }
      if (s.phase === 'reveal') {
        if (opts.jump && !jumped && s.round === 1 && s.qInRound === 0) {
          await page.evaluate(() => { const g = window.__game.G; g.round = 3; g.qInRound = 1; });
          jumped = true;
        }
        if (opts.tieAtEnd && s.round === 3 && s.qInRound === 2) {
          await page.evaluate(() => {
            const g = window.__game.G;
            g.players[1].score = g.players[0].score;
            if (g.players[2].score >= g.players[0].score) g.players[2].score = Math.max(0, g.players[0].score - 100);
          });
        }
        await page.tap('#btnNext'); await sleep(220); continue;
      }
      await sleep(160);
    }
    throw new Error('show did not finish');
  }
  /* Audit A1: since D1 the marquee carries the pot line FIRST
     (also a .winner-sub, wearing .pot-line) and the champion
     subline after it — select the champion's own line */
  const winnerSub = () => page.evaluate(() => { const e = document.querySelector('.winner-sub:not(.pot-line):not(.series-line)'); return e ? e.textContent : null; });
  const finaleFit = () => page.evaluate(() => { const e = document.getElementById('stage'); return { client: e.clientHeight, scroll: e.scrollHeight }; });

  check('Boot: no record on a fresh device -> no plaque', await page.evaluate(() => {
    const pl = document.getElementById('champPlaque');
    return !!pl && pl.classList.contains('hidden') && !localStorage.getItem('gh_records_v1');
  }));

  /* ---- Show A: the full fifteen, Ana (seat 0) wins ---- */
  await page.evaluate(() => window.__game.startShow(['Ana', 'Bo', 'Cy']));
  await page.waitForSelector('#btnRoundGo', { timeout: 10000 });
  const idA = (await S()).showId;
  const endA = await playShow({ winSeat: 0 });
  const recA = await readRec(page);
  check('A: the completed show is recorded — every finisher shows=1, purses equal the final scores, the champion\'s carrying the pot (D1)',
    !!recA && recA.lastShowId === idA && ['ana', 'bo', 'cy'].every((k, i) => recA.players[k] && recA.players[k].shows === 1 && recA.players[k].purse === endA.scores[i] + (i === 0 ? endA.pot : 0)),
    JSON.stringify(recA && recA.players) + ' scores=' + JSON.stringify(endA.scores) + ' pot=' + endA.pot);
  check('A: the unique winner takes the win and the crown (streak 1, amount = winning score + the pot)',
    !!recA && recA.players.ana.wins === 1 && recA.players.bo.wins === 0 && recA.players.cy.wins === 0 &&
    !!recA.champion && recA.champion.nameKey === 'ana' && recA.champion.streak === 1 && recA.champion.amount === endA.scores[0] + endA.pot,
    JSON.stringify(recA && recA.champion));
  check('A: the first crowning this device has seen says FIRST CHAMPION', (await winnerSub()) === 'FIRST CHAMPION', await winnerSub());
  {
    const fit = await finaleFit();
    check('A: finale stage fit holds with the subline in the marquee (client == scroll)', fit.client === fit.scroll, JSON.stringify(fit));
  }

  /* ---- refresh AT the finale: the guard holds, the plaque appears ---- */
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await sleep(700);
  const recA2 = await readRec(page);
  check('Refresh at the finale: the record is untouched (still written exactly once)',
    JSON.stringify(recA2) === JSON.stringify(recA), 'shows=' + (recA2 && recA2.players.ana.shows));
  const plaqueA = await page.evaluate(() => { const pl = document.getElementById('champPlaque'); return pl ? pl.textContent : null; });
  check('Title plaque: DEFENDING CHAMPION with name, wins and lifetime purse on one line',
    !!plaqueA && plaqueA.indexOf('DEFENDING CHAMPION') >= 0 && plaqueA.indexOf('Ana') >= 0 &&
    plaqueA.indexOf('1 WIN') >= 0 && plaqueA.indexOf(money(endA.scores[0] + endA.pot) + ' BANKED') >= 0,
    plaqueA);
  /* title fit, plaque present vs plaque suppressed, both orientations */
  const titleFit = async () => page.evaluate(() => {
    const ts = document.querySelector('.title-scroll');
    const pl = document.getElementById('champPlaque');
    const cs = getComputedStyle(pl);
    const withP = { client: ts.clientHeight, scroll: ts.scrollHeight, plaqueW: pl.scrollWidth, plaqueCW: pl.clientWidth,
      plaqueCost: pl.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom) };
    pl.classList.add('hidden');
    const withoutP = { client: ts.clientHeight, scroll: ts.scrollHeight };
    pl.classList.remove('hidden');
    return { withP, withoutP };
  });
  /* Audit A1: the old wording demanded the plaque add NO scroll
     height — written when the title stood shorter. The title is
     a scrolling setup column now (it scrolls plaque-less too),
     and an in-flow pill honestly costs its own height. The true
     contract: the plaque costs no more than itself (no knock-on
     reflow) and its line never overflows its pill */
  const fitL = await titleFit();
  check('Title fit (landscape 844x390): the plaque costs no more than its own height and never overflows its own line',
    fitL.withP.scroll - fitL.withoutP.scroll <= fitL.withP.plaqueCost + 2 && fitL.withP.plaqueW <= fitL.withP.plaqueCW + 1,
    JSON.stringify(fitL));
  await page.screenshot({ path: SHOTS + '/design4-title-plaque.png' });
  await page.setViewport({ width: 390, height: 844 });
  await sleep(400);
  const fitP = await titleFit();
  check('Title fit (portrait 390x844): the plaque costs no more than its own height and its line fits inside the pill',
    fitP.withP.scroll - fitP.withoutP.scroll <= fitP.withP.plaqueCost + 2 && fitP.withP.plaqueW <= fitP.withP.plaqueCW + 1,
    JSON.stringify(fitP));
  await page.setViewport({ width: 844, height: 390 });
  await sleep(300);

  /* ---- the trophy shelf ---- */
  await page.tap('#champPlaque');
  await sleep(350);
  const shelf = await page.evaluate(() => {
    const ov = document.getElementById('recordsOverlay');
    const rows = [...document.querySelectorAll('.record-row')].map(r => r.textContent.replace(/\s+/g, ' '));
    return { open: !!ov && !ov.classList.contains('hidden'), rows };
  });
  check('The trophy shelf lists every recorded player, wins then purse order, Ana reigning on top',
    shelf.open && shelf.rows.length === 3 && shelf.rows[0].indexOf('Ana') >= 0 && shelf.rows[0].indexOf('REIGNING') >= 0 &&
    shelf.rows[0].indexOf('1 WIN') >= 0 && shelf.rows[0].indexOf(money(endA.scores[0] + endA.pot)) >= 0,
    JSON.stringify(shelf.rows));
  await page.screenshot({ path: SHOTS + '/design4-records.png' });
  await page.tap('#recordsClose');
  await sleep(250);

  /* ---- Show B: Bo takes the crown ---- */
  await page.evaluate(() => window.__game.startShow(['Ana', 'Bo', 'Cy']));
  await page.waitForSelector('#btnRoundGo', { timeout: 10000 });
  const endB = await playShow({ winSeat: 1, jump: true });
  const recB = await readRec(page);
  check('B: a different winner dethrones — champion is Bo, streak resets to 1, subline says A NEW CHAMPION',
    !!recB && recB.champion.nameKey === 'bo' && recB.champion.streak === 1 && recB.champion.amount === endB.scores[1] + endB.pot &&
    recB.players.bo.wins === 1 && recB.players.ana.wins === 1 && recB.players.ana.shows === 2,
    JSON.stringify(recB && recB.champion) + ' sub=' + (await winnerSub()));
  check('B: the finale subline is A NEW CHAMPION', (await winnerSub()) === 'A NEW CHAMPION', await winnerSub());

  /* ---- Show C: Bo defends ---- */
  await page.tap('#btnAgain');
  await page.waitForSelector('#btnRoundGo', { timeout: 10000 });
  const endC = await playShow({ winSeat: 1, jump: true });
  const recC = await readRec(page);
  const subC = await winnerSub();
  check('C: the same winner again — streak 2, subline DEFENDS THE TITLE x2',
    !!recC && recC.champion.nameKey === 'bo' && recC.champion.streak === 2 && recC.players.bo.wins === 2 &&
    !!subC && subC.indexOf('DEFENDS THE TITLE') >= 0 && subC.indexOf('×2') >= 0,
    JSON.stringify(recC && recC.champion) + ' sub=' + subC);
  await page.screenshot({ path: SHOTS + '/design4-finale-defends.png' });

  /* ---- Show D: dead level at the top — the Decider settles it ---- */
  await page.tap('#btnAgain');
  await page.waitForSelector('#btnRoundGo', { timeout: 10000 });
  const endD = await playShow({ winSeat: 0, jump: true, tieAtEnd: true });
  const recD = await readRec(page);
  /* DESIGN CHANGE (New programme pass 1): pass 4's rule "a tie for
     first crowns nobody" is superseded for shows that complete a
     decider — playShow marks seat 0 alone at the decider, so Ana is
     the decider's winner and the record crowns HER: streak 1 (Bo's
     reign ends), her second win, the champion's amount her frozen
     score plus the pot (D1 — Audit A1), and the winner's podium
     wearing WON THE DECIDER */
  const dMarker = await page.evaluate(() => { const m = document.querySelector('.winner-podium .decider-marker'); return m ? m.textContent : null; });
  check('D: DESIGN CHANGE — the tied finale goes to the Decider and seat 0 takes it: champion Ana, A NEW CHAMPION, WON THE DECIDER on the podium',
    !!recD && recD.champion.nameKey === 'ana' && recD.champion.streak === 1 && recD.champion.amount === endD.scores[0] + endD.pot &&
    recD.players.ana.wins === 2 && recD.players.bo.wins === 2 && recD.players.cy.wins === 0 &&
    (await winnerSub()) === 'A NEW CHAMPION' && !!dMarker && dMarker.indexOf('WON THE DECIDER') >= 0,
    JSON.stringify(recD && recD.champion) + ' sub=' + (await winnerSub()) + ' marker=' + dMarker);
  check('D: ...and the decider show counts like any other — shows=4 all round, purses grew by the final scores, the champion\'s by the pot too (D1)',
    !!recD && ['ana', 'bo', 'cy'].every((k, i) => recD.players[k].shows === 4 && recD.players[k].purse === recC.players[k].purse + endD.scores[i] + (k === 'ana' ? endD.pot : 0)),
    JSON.stringify(recD && recD.players) + ' scores=' + JSON.stringify(endD.scores) + ' pot=' + endD.pot);

  /* ---- Show E: ended early ---- */
  await page.tap('#btnAgain');
  await page.waitForSelector('#btnRoundGo', { timeout: 10000 });
  await page.tap('#btnRoundGo');
  await waitPhase('question');
  await page.tap('#btnQuit');
  await sleep(500);
  const recE = await readRec(page);
  check('E: END SHOW before the finale records nothing at all',
    JSON.stringify(recE) === JSON.stringify(recD), 'lastShowId=' + (recE && recE.lastShowId));

  /* ---- clear records: two taps ---- */
  const plaqueE = await page.evaluate(() => document.getElementById('champPlaque').textContent);
  check('E: back at the title, the plaque names the reigning champion (Ana — crowned by the Decider in show D)',
    plaqueE.indexOf('Ana') >= 0 && plaqueE.indexOf('2 WINS') >= 0, plaqueE);
  await page.tap('#champPlaque');
  await sleep(300);
  await page.tap('#recordsClear');
  await sleep(200);
  const armed = await page.evaluate(() => document.getElementById('recordsClear').textContent);
  check('Clear is a two-tap confirm: the first tap only arms it', armed.indexOf('ARE YOU SURE') >= 0, armed);
  await page.tap('#recordsClear');
  await sleep(300);
  const cleared = await page.evaluate(() => ({
    rec: JSON.parse(localStorage.getItem('gh_records_v1') || 'null'),
    plaqueHidden: document.getElementById('champPlaque').classList.contains('hidden'),
    empty: !!document.querySelector('.records-empty'),
  }));
  check('Second tap clears everything: no players, no champion, plaque gone, shelf bare',
    !!cleared.rec && Object.keys(cleared.rec.players).length === 0 && cleared.rec.champion === null && cleared.plaqueHidden && cleared.empty,
    JSON.stringify(cleared.rec));
  await page.close();

  /* ================= ONLINE HOST ================= */
  function ogStubs(seedChampion) {
    return (seed) => {
      try {
        /* seed once per TAB: sessionStorage survives this page's own
           reload (the no-double-count check) but never leaks into
           the next page's household */
        if (!sessionStorage.getItem('gh_seed_v1')) { sessionStorage.setItem('gh_seed_v1', '1'); localStorage.setItem('gh_records_v1', JSON.stringify({
          v: 1,
          players: {
            robin: { name: 'Robin', avatar: 0, wins: 2, shows: 3, purse: 4320 },
            jules: { name: 'Jules', avatar: 1, wins: 0, shows: 3, purse: 900 },
          },
          champion: { nameKey: seed, streak: 2, amount: 2100, date: '2026-11-10' },
          lastShowId: 'seed-show',
        })); }
      } catch (e) {}
      const okj = obj => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(obj) });
      window.fetch = function (u) {
        const url = String(u);
        if (url.indexOf('gilded-hour-rooms') >= 0) return okj({ code: 'TEST', hostToken: 'tok' });
        if (url.indexOf('gilded-hour-sterling') >= 0) return okj({ line: 'LIVE LINE' });
        if (url.indexOf('gilded-hour-nightly') >= 0) return okj({ question: null, intro: null });
        return Promise.reject(new Error('offline in records drive'));
      };
      const state = (phase, extra) => Object.assign({
        code: 'TEST', phase, role: 'host', seat: null,
        players: [
          { seat: 0, name: 'Robin', score: window.__cum[0], cutTwo: true, connected: true, avatar: 0 },
          { seat: 1, name: 'Jules', score: window.__cum[1], cutTwo: true, connected: true, avatar: 1 },
          null, null,
        ],
        question: null, bet: null, lastReveal: null,
      }, extra || {});
      window.__cum = [0, 0];
      window.__pubs = 0;
      window.WebSocket = class FakeWS {
        constructor(u) { this.url = u; this.readyState = 1; setTimeout(() => { if (this.onopen) this.onopen(); }, 20); }
        send(data) {
          let m = {};
          try { m = JSON.parse(data); } catch (e) {}
          const deliver = (obj, ms) => setTimeout(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) }); }, ms == null ? 30 : ms);
          if (m.t === 'hello' && m.role === 'host') {
            deliver({ t: 'welcome', role: 'host', code: 'TEST' });
            deliver({ t: 'state', state: state('lobby') });
          }
          if (m.t === 'bet_phase') {
            deliver({ t: 'state', state: state('bet', { bet: { qid: m.qid, betsIn: 2 } }) });
          }
          if (m.t === 'publish_question' && m.kind === 'bluff') {
            /* THE BLUFF, in the room's real protocol (mirrors
               drive-bluff-online's proven stub): the publish carries
               bluffTruth + decoys; the room answers with the INVENT
               state — the question itself carries bluffPhase and
               fakesIn — and deals only when the host sends
               bluff_deal (see below) */
            window.__bluffTruth = m.bluffTruth;
            window.__bluffQ = { qid: m.qid, round: m.round, kind: 'bluff', category: m.category, answersCount: 0, baseValue: 200, multiplier: 1, headline: false, band: m.band || null, windowMs: 60000, openedAt: Date.now(), deadline: Date.now() + 60000, betted: false, decider: false, eligible: null, cut: null, answersIn: 0, dblArmed: [], vsArmed: [], bluffPhase: 'invent', fakesIn: 0, options: null };
            deliver({ t: 'state', state: state('invent', { question: window.__bluffQ }) });
            return;
          }
          if (m.t === 'bluff_deal' && window.__bluffQ) {
            const qB = window.__bluffQ;
            const optsB = ['A brass teaspoon', window.__bluffTruth, 'A singing kettle'];
            const q2 = Object.assign({}, qB, { bluffPhase: 'answer', options: optsB, answersCount: 3, correctIdx: 1, windowMs: 25000, openedAt: Date.now(), deadline: Date.now() + 25000 });
            deliver({ t: 'bluff_options', qid: qB.qid, options: optsB });
            deliver({ t: 'state', state: state('answer', { question: q2 }) });
            setTimeout(() => {
              window.__cum[1] += 100;
              const rev = { qid: qB.qid, kind: 'bluff', headline: false, golden: false, value: 200,
                bluff: { options: [
                  { t: optsB[0], by: 0, truth: false }, { t: optsB[1], by: -1, truth: true }, { t: optsB[2], by: 1, truth: false }],
                  picks: { 0: 0, 1: 1 } },
                results: [
                  { seat: 0, correct: false, pick: 0, banked: 0 },
                  { seat: 1, correct: true, pick: 1, banked: 100 },
                ], scores: window.__cum.slice(), correctIdx: 1, trueNum: null,
                quickDrawSeat: null, streakMoment: null, decider: false, eligible: null, pot: 0, potFed: 0 };
              if (this.onmessage) this.onmessage({ data: JSON.stringify(Object.assign({ t: 'reveal' }, rev)) });
              if (this.onmessage) this.onmessage({ data: JSON.stringify({ t: 'state', state: state('reveal', { question: q2, lastReveal: rev }) }) });
            }, 600);
            return;
          }
          if (m.t === 'publish_question') {
            window.__pubs++;
            const now = Date.now();
            const bank0 = (window.__pubs === 1 || window.__pubs === 5 || window.__pubs === 9) ? 100 : 0;
            const bank1 = 100;
            deliver({ t: 'state', state: state('answer', { question: {
              qid: m.qid, round: m.round, kind: m.kind, category: m.category, answersCount: 4,
              baseValue: m.baseValue, multiplier: m.multiplier, headline: false,
              windowMs: m.deadlineMs, openedAt: now, deadline: now + m.deadlineMs,
              betted: m.round === 3, cut: null, answersIn: 2, correctIdx: m.correctIdx,
            } }) });
            setTimeout(() => {
              window.__cum[0] += bank0; window.__cum[1] += bank1;
              const results = [
                { seat: 0, correct: bank0 > 0, pick: m.correctIdx, banked: bank0 },
                { seat: 1, correct: true, pick: m.correctIdx, banked: bank1 },
              ];
              const rev = { qid: m.qid, kind: 'normal', headline: false, value: 100, results, scores: window.__cum.slice(), correctIdx: m.correctIdx, trueNum: 42 };
              if (this.onmessage) this.onmessage({ data: JSON.stringify(Object.assign({ t: 'reveal' }, rev)) });
              if (this.onmessage) this.onmessage({ data: JSON.stringify({ t: 'state', state: state('reveal', { lastReveal: rev }) }) });
            }, 600);
          }
          if (m.t === 'end_show') {
            deliver({ t: 'ended', scores: window.__cum.slice() });
          }
        }
        close() { this.readyState = 3; }
      };
    };
  }
  async function ogLobby(seedChampion) {
    const p = await browser.newPage();
    watch(p);
    await p.evaluateOnNewDocument(ogStubs(seedChampion), seedChampion);
    await p.setViewport({ width: 844, height: 390 });
    await p.goto(httpUrl, { waitUntil: 'load', timeout: 60000 });
    await sleep(400);
    await p.tap('.mode-tab[data-mode="host"]');
    await sleep(200);
    await p.tap('#btnCreateRoom');
    for (let i = 0; i < 40; i++) {
      const ok = await p.evaluate(() => { const b = document.getElementById('ogStart'); return !!b && !b.disabled; });
      if (ok) break;
      await sleep(150);
    }
    return p;
  }

  /* negative: the champion (Zelda) is not in this room */
  const neg = await ogLobby('zelda');
  check('OG lobby: no acknowledgement when the champion is not seated',
    await neg.evaluate(() => !document.getElementById('ogChampReturn')), 'element absent');
  await neg.close();

  /* positive + a full show: Robin reigns, Jules wins the night */
  const og = await ogLobby('robin');
  const ack = await og.evaluate(() => {
    const e = document.getElementById('ogChampReturn');
    return {
      text: e ? e.textContent : null,
      pool: window.__game.HOST.champreturn.map(l => l.split('{name}').join('Robin')),
    };
  });
  check('OG lobby: the champion is seated — Sterling acknowledges the return, in his own line under the greeting',
    !!ack.text && ack.pool.indexOf(ack.text) >= 0, JSON.stringify(ack.text));
  const lobbyFit = await og.evaluate(() => {
    const st = document.getElementById('stage');
    const b = document.getElementById('ogStart').getBoundingClientRect();
    const sr = st.getBoundingClientRect();
    return { client: st.clientHeight, scroll: st.scrollHeight, visPx: Math.round(Math.min(b.bottom, sr.bottom) - Math.max(b.top, sr.top)), h: Math.round(b.height) };
  });
  check('OG lobby fit: with the acknowledgement up, the fitted-to-the-pixel stack still fits — START THE SHOW fully on stage',
    lobbyFit.scroll <= lobbyFit.client && lobbyFit.visPx === lobbyFit.h, JSON.stringify(lobbyFit));
  await og.screenshot({ path: SHOTS + '/design4-lobby-champion.png' });
  await og.tap('#ogStart');
  await og.waitForSelector('#ogRoundGo', { timeout: 10000 });
  await og.tap('#ogRoundGo');
  let ogOver = false, ogGuard = 0;
  while (ogGuard++ < 400 && !ogOver) {
    ogOver = await og.evaluate(() => {
      const o = window.__online.OG;
      if (o && o.phase === 'over') return true;
      const tap = id => { const b = document.getElementById(id); if (b) { b.click(); return true; } return false; };
      if (tap('ogDealBluff')) return false;
      if (tap('ogBetsGo')) return false;
      if (tap('ogRoundGo')) return false;
      if (tap('ogEraCall')) return false;
      if (tap('ogBreakGo')) return false;
      if (tap('ogNext')) return false;
      return false;
    });
    if (!ogOver) await sleep(350);
  }
  check('OG: the stubbed show runs to its finale', ogOver, 'guard=' + ogGuard);
  await sleep(400);
  const ogSub = await og.evaluate(() => { const e = document.querySelector('.winner-sub'); return e ? e.textContent : null; });
  const recOG = await readRec(og);
  check('OG: the host device records the show — Jules (the other player) takes the crown, A NEW CHAMPION',
    ogSub === 'A NEW CHAMPION' && !!recOG && recOG.champion.nameKey === 'jules' && recOG.champion.streak === 1 &&
    recOG.champion.amount === 1500 && recOG.lastShowId.indexOf('og-TEST-') === 0,
    'sub=' + ogSub + ' champion=' + JSON.stringify(recOG && recOG.champion) + ' id=' + (recOG && recOG.lastShowId));
  check('OG: histories merge — Robin keeps her past (shows 3+1, purse 4320+300, wins still 2); Jules shows=4, wins=1, purse 900+1500',
    !!recOG && recOG.players.robin.shows === 4 && recOG.players.robin.purse === 4620 && recOG.players.robin.wins === 2 &&
    recOG.players.jules.shows === 4 && recOG.players.jules.wins === 1 && recOG.players.jules.purse === 2400,
    JSON.stringify(recOG && recOG.players));
  await og.reload({ waitUntil: 'load', timeout: 60000 });
  await sleep(600);
  const recOG2 = await readRec(og);
  check('OG: refresh after the finale does not double-count the room',
    JSON.stringify(recOG2) === JSON.stringify(recOG), 'jules shows=' + (recOG2 && recOG2.players.jules.shows));
  await og.close();

  check('No console/page errors on any page', errors.length === 0, errors.slice(0, 3).join(' ;; '));
  const fails = results.filter(r => !r.ok).length;
  console.log('DRIVE-RECORDS DONE — ' + (results.length - fails) + '/' + results.length + ' checks passed');
  await browser.close();
  server.close();
  process.exit(fails ? 2 : 0);
})().catch(e => { console.error('DRIVE-RECORDS FAIL:', e.message); server.close(); process.exit(1); });
