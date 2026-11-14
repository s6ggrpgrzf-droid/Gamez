/* Pass N3 — SHARE THE NIGHT: the finale becomes a card worth
   sending. TABLE: a full scripted show (the report drive's own
   plans, seat 0 the outright champion) reaches its finale; the
   share data model the finale built must equal the night's facts
   as the game's own state records them (scores, the pot, the
   Report Card tallies read through the exposed derive). The
   preview must show a real 1080x1350 card — painted in its
   masthead, champion and standings bands, exportable to a real
   PNG — SAVE IMAGE must land a real download on disk, SHARE…
   must hand the sheet a PNG file where files can be shared and
   the text line where they cannot, and CLOSE must hand the
   finale back untouched, at both phone sizes.
   ONLINE: the stub-refereed host finale must carry the button
   and the same-shaped model; the pad (Bo, joining an ended room)
   composes its honest variant — Ana's crown with the room's pot
   folded in, the night's biggest bank read off the referee's
   full report card, and no series line (the pad never holds it).
   Shots: share-1-card.png (the composed PNG itself),
   share-2-preview.png (the preview sheet over the finale). */
const { launchBrowser } = require('./rig');
const fs = require('fs');
const http = require('http');
const path = require('path');
const ROOT = '/home/hatch/workspace/gilded-hour';
const SHOTS = ROOT + '/shots';
const DL = '/tmp/gh-share-dl';
fs.mkdirSync(SHOTS, { recursive: true });
fs.rmSync(DL, { recursive: true, force: true });
fs.mkdirSync(DL, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); }
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
function dateStr() {
  const d = new Date();
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  return days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}
/* pixel variance of one horizontal band of the share canvas */
const bandStats = (page, y0, y1) => page.evaluate((a, b) => {
  const cv = document.getElementById('shareCanvas');
  const ctx = cv.getContext('2d');
  const img = ctx.getImageData(0, a, cv.width, b - a).data;
  let n = 0, sum = 0, sum2 = 0;
  for (let i = 0; i < img.length; i += 16) {
    const lum = 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];
    sum += lum; sum2 += lum * lum; n++;
  }
  const mean = sum / n;
  return { mean, sd: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) };
}, y0, y1);

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const httpUrl = 'http://127.0.0.1:' + server.address().port + '/index.html';
  const browser = await launchBrowser({ protocolTimeout: 300000 });
  const errors = [];
  const watch = p => {
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  };

  /* ================= TABLE ================= */
  const page = await browser.newPage();
  watch(page);
  await page.setViewport({ width: 844, height: 390 });
  await page.goto('file://' + ROOT + '/index.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(600);
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await sleep(500);
  await page.evaluate(() => window.__game.startShow(['Ana', 'Bo', 'Cy']));
  await page.waitForSelector('#btnRoundGo', { timeout: 10000 });

  const S = () => page.evaluate(() => {
    const g = window.__game.G;
    if (!g) return null;
    return { phase: g.phase, round: g.round, qInRound: g.qInRound, kind: g.cur ? g.cur.kind : null };
  });
  let guessIdx = 0, betsDone = false;
  const numPlans = [[0], [1], [0, 1]];
  function planFor(s) {
    if (s.kind === 'num') return numPlans[guessIdx++ % numPlans.length];
    if (s.round === 3) return s.qInRound === 0 ? [0, 1] : s.qInRound === 1 ? [0] : [1];
    if (s.round === 1 && s.qInRound === 0) return [0];
    if (s.round === 2 && s.qInRound === 2) return [1];
    return [0, 1];
  }
  await page.tap('#btnRoundGo');
  let guard = 0, done = false;
  while (guard++ < 400 && !done) {
    const s = await S();
    if (!s) throw new Error('game state lost');
    switch (s.phase) {
      case 'over': done = true; break;
      case 'coldopen': case 'spin': await sleep(250); break;
      case 'intro': await page.tap('#btnRoundGo'); await sleep(300); break;
      case 'intermission': await page.evaluate(() => { const b = document.getElementById('btnEraCall'); if (b) b.click(); }); await sleep(250); await page.tap('#btnBreakGo'); await sleep(300); break;
      case 'bet': {
        if (!betsDone) {
          await page.tap('[data-bet="0|1"]'); await sleep(150);
          await page.tap('[data-bet="0|1"]'); await sleep(150);
          betsDone = true;
        }
        await page.tap('#btnBetsDone'); await sleep(300); break;
      }
      case 'question': {
        const plan = planFor(s);
        await sleep(350);
        if (s.kind === 'bluff') {
          /* THE BLUFF (pass 2): the host deals the shuffled
             plaques first (the stage opens on the invent screen —
             #btnCallIt only exists once the answers are dealt),
             then the room finger-votes: tap the truth plaque,
             then tap each seat the plan marks right */
          /* this table plays in short landscape, where DEAL can
             sit below the stage's visible box — bring it into
             view inside the stage scroller before the tap, or the
             tap lands on the clip edge and never reaches it */
          await page.evaluate(() => { const b = document.getElementById('btnDealBluff'); if (b) b.scrollIntoView({ block: 'center' }); });
          await sleep(200);
          await page.tap('#btnDealBluff');
          /* the deal opens the finger-vote window (phase
             vote-count, plaques up with CALL IT); CALL IT closes
             it and the mark screen (phase vote) is where the
             truth plaque takes the seats */
          const t0c = Date.now();
          while (Date.now() - t0c < 15000) { const q = await S(); if (q && q.phase === 'vote-count') break; await sleep(120); }
          await page.tap('#btnCallIt');
          const t0b = Date.now();
          while (Date.now() - t0b < 15000) { const q = await S(); if (q && q.phase === 'vote') break; await sleep(120); }
          const truth = await page.evaluate(() => window.__game.G.cur.opts.findIndex(o => o.ok));
          await page.evaluate((t) => { const b = document.querySelector('.bluff-pick[data-opt="' + t + '"]'); if (b) b.scrollIntoView({ block: 'center' }); }, truth);
          await sleep(200);
          await page.tap('.bluff-pick[data-opt="' + truth + '"]');
          await sleep(220);
          for (const seat of plan) { await page.tap('.seat[data-seat="' + seat + '"]'); await sleep(220); }
          await page.tap('#btnReveal');
          const t1b = Date.now();
          while (Date.now() - t1b < 15000) { const q = await S(); if (q && q.phase === 'reveal') break; await sleep(120); }
          await page.tap('#btnNext'); await sleep(250); break;
        }
        await page.tap('#btnCallIt');
        const t0 = Date.now();
        while (Date.now() - t0 < 15000) { const q = await S(); if (q && q.phase === 'vote') break; await sleep(120); }
        for (const seat of plan) { await page.tap('.seat[data-seat="' + seat + '"]'); await sleep(220); }
        await page.tap('#btnReveal');
        const t1 = Date.now();
        while (Date.now() - t1 < 15000) { const q = await S(); if (q && q.phase === 'reveal') break; await sleep(120); }
        await page.tap('#btnNext'); await sleep(250); break;
      }
      default: await sleep(250);
    }
  }
  check('Table: the scripted show reaches its finale', done, 'guard=' + guard);
  await sleep(1300); /* the ceremony settles before the evidence frames */

  const facts = await page.evaluate(() => {
    const g = window.__game.G;
    const names = g.players.map(p => p.name);
    const scores = g.players.map(p => p.score);
    const order = g.players.map((p, i) => i).sort((a, b) => scores[b] - scores[a]);
    const derived = g.players.map((p, i) => window.__game.report.derive(g.report ? g.report[i] : null));
    let flourish = null;
    derived.forEach((d, i) => { if (d && d.biggest > 0 && (!flourish || d.biggest > flourish.amt)) flourish = { name: names[i], amt: d.biggest }; });
    return {
      names, scores, pot: g.pot || 0, order, flourish,
      champ: order[0], champUnique: scores[order[0]] > scores[order[1]],
      shareBtn: !!document.getElementById('btnShareNight'),
      data: JSON.parse(JSON.stringify(window.__game.share.data || null)),
    };
  });
  check('Table finale: SHARE THE NIGHT stands among the finale buttons, and seat 0 took the show outright',
    facts.shareBtn && facts.champUnique, 'pot=' + facts.pot + ' scores=' + JSON.stringify(facts.scores));
  const d = facts.data || {};
  const expStandings = facts.order.map(i => ({ name: facts.names[i], score: facts.scores[i] }));
  const gotStandings = (d.standings || []).map(r => ({ name: r.name, score: r.score }));
  check('Table: the card\'s data model equals the finale\'s own facts — champion, pot-folded total, standings in order',
    !!d.champion && d.champion.name === facts.names[facts.champ]
      && d.champion.total === facts.scores[facts.champ] + facts.pot
      && d.pot === facts.pot
      && JSON.stringify(gotStandings) === JSON.stringify(expStandings),
    'data=' + JSON.stringify({ champion: d.champion, pot: d.pot, standings: gotStandings }) + ' expected champ total=' + (facts.scores[facts.champ] + facts.pot));
  check('Table: the flourish is the night\'s biggest bank from the report tallies, and the text line names the champion and the total',
    JSON.stringify(d.flourish || null) === JSON.stringify(facts.flourish)
      && d.text === '★ THE GILDED HOUR — ' + facts.names[facts.champ] + ' takes the night with ' + money(facts.scores[facts.champ] + facts.pot) + ' · ' + d.date
      && (d.date === dateStr()),
    'flourish=' + JSON.stringify(d.flourish) + ' expected=' + JSON.stringify(facts.flourish) + ' text=' + JSON.stringify(d.text));

  /* the preview + the card itself */
  await page.tap('#btnShareNight');
  await page.waitForFunction(() => !document.getElementById('shareOverlay').classList.contains('hidden'), { timeout: 8000 });
  await page.waitForFunction(() => {
    const cv = document.getElementById('shareCanvas');
    const ctx = cv.getContext('2d');
    const px = ctx.getImageData(540, 200, 1, 1).data;
    return px[0] + px[1] + px[2] > 0;
  }, { timeout: 15000 });
  await sleep(400);
  const dims = await page.evaluate(() => {
    const cv = document.getElementById('shareCanvas');
    return { w: cv.width, h: cv.height };
  });
  check('Preview: the sheet is up and the canvas is the card — 1080x1350', dims.w === 1080 && dims.h === 1350, JSON.stringify(dims));
  const bandM = await bandStats(page, 150, 260);
  const bandC = await bandStats(page, 440, 900);
  const bandS = await bandStats(page, 930, 1230);
  check('The card is painted, not blank: masthead, champion and standings bands all carry real ink',
    bandM.sd > 8 && bandC.sd > 8 && bandS.sd > 8,
    'sd masthead=' + bandM.sd.toFixed(1) + ' champion=' + bandC.sd.toFixed(1) + ' standings=' + bandS.sd.toFixed(1));
  const blobInfo = await page.evaluate(() => new Promise(res => {
    const cv = document.getElementById('shareCanvas');
    cv.toBlob(b => {
      if (!b) return res({ size: 0, sig: '' });
      b.slice(0, 4).arrayBuffer().then(ab => {
        const u = new Uint8Array(ab);
        res({ size: b.size, sig: Array.from(u).join(',') });
      });
    }, 'image/png');
  }));
  check('The canvas stayed clean: toBlob exports a real PNG (>10KB, PNG signature)',
    blobInfo.size > 10000 && blobInfo.sig === '137,80,78,71', JSON.stringify(blobInfo));
  const dataUrl = await page.evaluate(() => document.getElementById('shareCanvas').toDataURL('image/png'));
  fs.writeFileSync(SHOTS + '/share-1-card.png', Buffer.from(dataUrl.split(',')[1], 'base64'));
  await page.screenshot({ path: SHOTS + '/share-2-preview.png' });

  /* SAVE IMAGE: a real download lands on disk */
  const client = await page.target().createCDPSession();
  try { await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL }); }
  catch (e) { await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL }); }
  await page.tap('#shareSave');
  let dlFile = null;
  for (let i = 0; i < 40 && !dlFile; i++) {
    await sleep(250);
    const hit = fs.readdirSync(DL).find(f => /^the-gilded-hour-\d{4}-\d{2}-\d{2}\.png$/.test(f));
    if (hit) dlFile = hit;
  }
  let dlOk = false, dlSize = 0;
  if (dlFile) {
    const buf = fs.readFileSync(path.join(DL, dlFile));
    dlSize = buf.length;
    dlOk = dlSize > 10000 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  }
  check('SAVE IMAGE downloads the card under a sane name — a real PNG on disk', dlOk, 'file=' + dlFile + ' bytes=' + dlSize);

  /* SHARE…: file where files can be shared, text where they cannot.
     Headless Chrome has no share sheet at all — the button is
     honestly hidden there — so the sheet is stubbed in BEFORE the
     preview reopens (the open is what decides the button's fate) */
  await page.tap('#shareClose');
  await sleep(300);
  await page.evaluate(() => {
    window.__shared = null;
    navigator.canShare = data => !!(data && data.files);
    navigator.share = data => {
      window.__shared = {
        hasFile: !!(data.files && data.files[0]),
        fileType: data.files && data.files[0] ? data.files[0].type : null,
        fileName: data.files && data.files[0] ? data.files[0].name : null,
        text: data.text || null,
      };
      return Promise.resolve();
    };
  });
  await page.tap('#btnShareNight');
  await page.waitForFunction(() => {
    const ov = document.getElementById('shareOverlay');
    const go = document.getElementById('shareGo');
    return !ov.classList.contains('hidden') && !go.classList.contains('hidden');
  }, { timeout: 8000 });
  await page.tap('#shareGo');
  await sleep(600);
  const sharedFile = await page.evaluate(() => window.__shared);
  check('SHARE… hands the sheet a PNG file, with the night\'s line riding along',
    !!sharedFile && sharedFile.hasFile && sharedFile.fileType === 'image/png'
      && /^the-gilded-hour-\d{4}-\d{2}-\d{2}\.png$/.test(sharedFile.fileName || '')
      && sharedFile.text === (facts.data || {}).text,
    JSON.stringify(sharedFile));
  await page.evaluate(() => {
    window.__shared = null;
    navigator.canShare = () => false;
    navigator.share = data => {
      window.__shared = { hasFile: !!(data.files && data.files[0]), text: data.text || null };
      return Promise.resolve();
    };
  });
  await page.tap('#shareGo');
  await sleep(600);
  const sharedText = await page.evaluate(() => window.__shared);
  check('SHARE… without file support shares the text summary instead — the night still travels',
    !!sharedText && !sharedText.hasFile && sharedText.text === (facts.data || {}).text,
    JSON.stringify(sharedText));

  /* CLOSE hands the finale back untouched */
  await page.tap('#shareClose');
  await sleep(300);
  const after = await page.evaluate(() => {
    const st = document.getElementById('stage');
    return {
      overlayHidden: document.getElementById('shareOverlay').classList.contains('hidden'),
      phase: window.__game.G ? window.__game.G.phase : null,
      again: !!document.getElementById('btnAgain'), share: !!document.getElementById('btnShareNight'),
      winner: (document.querySelector('.winner-name') || {}).textContent || '',
      stageScroll: st.scrollHeight, stageClient: st.clientHeight,
    };
  });
  check('CLOSE returns to the finale untouched — same screen, same winner, buttons whole',
    after.overlayHidden && after.phase === 'over' && after.again && after.share && after.winner.indexOf(facts.names[facts.champ]) >= 0,
    JSON.stringify(after));
  const fitL = await page.evaluate(() => {
    const st = document.getElementById('stage');
    const sr = st.getBoundingClientRect();
    const bb = id => { const b = document.getElementById(id); const r = b ? b.getBoundingClientRect() : null; return r ? Math.round(r.bottom) : null; };
    return {
      docFit: document.documentElement.scrollWidth <= window.innerWidth + 1 && document.documentElement.scrollHeight <= window.innerHeight + 1,
      stageScroll: st.scrollHeight, stageClient: st.clientHeight, stageBottom: Math.round(sr.bottom),
      again: bb('btnAgain'), share: bb('btnShareNight'),
    };
  });
  check('Finale fits 844x390 with the share button aboard: no stage scroll, REMATCH and SHARE inside the stage',
    fitL.docFit && fitL.stageScroll <= fitL.stageClient + 1 && fitL.again != null && fitL.again <= fitL.stageBottom + 1 && fitL.share != null && fitL.share <= fitL.stageBottom + 1,
    JSON.stringify(fitL));
  await page.setViewport({ width: 390, height: 844 });
  await sleep(600);
  const fitP = await page.evaluate(() => {
    const st = document.getElementById('stage');
    const sr = st.getBoundingClientRect();
    const bb = id => { const b = document.getElementById(id); const r = b ? b.getBoundingClientRect() : null; return r ? Math.round(r.bottom) : null; };
    return {
      docFit: document.documentElement.scrollWidth <= window.innerWidth + 1 && document.documentElement.scrollHeight <= window.innerHeight + 1,
      stageScroll: st.scrollHeight, stageClient: st.clientHeight, stageBottom: Math.round(sr.bottom),
      again: bb('btnAgain'), share: bb('btnShareNight'),
    };
  });
  check('Finale fits 390x844 portrait too, share button aboard: no stage scroll, REMATCH and SHARE inside the stage',
    fitP.docFit && fitP.stageScroll <= fitP.stageClient + 1 && fitP.again != null && fitP.again <= fitP.stageBottom + 1 && fitP.share != null && fitP.share <= fitP.stageBottom + 1,
    JSON.stringify(fitP));
  await page.close();

  /* ================= ONLINE HOST (stub referee) ================= */
  const REPORT = [
    { best: { cat: 'Movies', amt: 1240 }, fastestMs: 1400, biggest: 420, peak: 4 },
    { best: { cat: 'TV', amt: 480 }, fastestMs: 2600, biggest: 260, peak: 1 },
    null, null,
  ];
  function hostStubs() {
    const PLAN = { 1: [240, 0], 2: [300, 180], 3: [0, 220], 4: [420, 0], 5: [260, 0], 6: [300, 180], 7: [380, 0], 8: [0, 260], 9: [340, 0], 10: [420, 0], 11: [300, 220], 12: [380, 0], 13: [300, 100], 14: [200, 0], 15: [300, 0] };
    const REPORTJ = JSON.parse('__REPORT__');
    const okj = obj => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(obj) });
    window.fetch = function (u) {
      const url = String(u);
      if (url.indexOf('gilded-hour-rooms') >= 0 && url.indexOf('/room/') < 0) return okj({ code: 'TEST', hostToken: 'tok', expiresAt: Date.now() + 7200000 });
      if (url.indexOf('gilded-hour-sterling') >= 0) return okj({ line: 'LIVE LINE' });
      if (url.indexOf('gilded-hour-nightly') >= 0) return okj({ question: null, intro: null });
      return Promise.reject(new Error('offline in share drive'));
    };
    window.__cum = [0, 0];
    window.__pubs = 0;
    const players = () => [
      { seat: 0, name: 'Ana', score: window.__cum[0], cutTwo: true, connected: true, avatar: 0, streak: 0 },
      { seat: 1, name: 'Bo', score: window.__cum[1], cutTwo: true, connected: true, avatar: 1, streak: 0 },
      null, null,
    ];
    const state = (phase, extra) => Object.assign({
      code: 'TEST', phase, role: 'host', seat: null, showSeq: 1,
      players: players(), question: null, bet: null, lastReveal: null, intermission: null, pot: 0,
    }, extra || {});
    window.WebSocket = class FakeWS {
      constructor(u) { this.url = u; this.readyState = 1; setTimeout(() => { if (this.onopen) this.onopen(); }, 20); }
      send(data) {
        let m = {}; try { m = JSON.parse(data); } catch (e) {}
        const deliver = (obj, ms) => setTimeout(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) }); }, ms == null ? 30 : ms);
        if (m.t === 'hello' && m.role === 'host') {
          deliver({ t: 'welcome', role: 'host', code: 'TEST' });
          deliver({ t: 'state', state: state('lobby') });
        }
        if (m.t === 'bet_phase') deliver({ t: 'state', state: state('bet', { bet: { qid: m.qid, betsIn: 2 } }) });
        if (m.t === 'intermission') deliver({ t: 'state', state: state('intermission', { intermission: { nextRound: m.nextRound, wind: [] } }) });
        if (m.t === 'publish_question' && m.kind === 'bluff') {
          /* THE BLUFF, in the room's real protocol (mirrors
             drive-bluff-online's proven stub): the publish carries
             bluffTruth + decoys; the room answers with the INVENT
             state — the question itself carries bluffPhase and
             fakesIn — and deals only when the host sends bluff_deal */
          window.__pubs++;
          window.__bluffPub = window.__pubs;
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
            const banks = PLAN[window.__bluffPub] || [0, 0];
            window.__cum[0] += banks[0]; window.__cum[1] += banks[1];
            const rev = {
              qid: qB.qid, kind: 'bluff', headline: false, golden: false, value: 200,
              bluff: { options: [
                { t: optsB[0], by: 1, truth: false }, { t: optsB[1], by: -1, truth: true }, { t: optsB[2], by: 0, truth: false }],
                picks: { 0: 1, 1: 0 } },
              results: [
                { seat: 0, correct: banks[0] > 0, pick: 1, banked: banks[0], streak: 0, streakBonus: 0, lockMs: banks[0] > 0 ? 1500 : null },
                { seat: 1, correct: banks[1] > 0, pick: 0, banked: banks[1], streak: 0, streakBonus: 0, lockMs: banks[1] > 0 ? 1500 : null },
              ],
              scores: window.__cum.slice(),
              quickDrawSeat: null, streakMoment: null, decider: false, eligible: null, deciderWinner: null,
              pot: 0, potFed: 0, correctIdx: 1, trueNum: null,
            };
            if (this.onmessage) this.onmessage({ data: JSON.stringify(Object.assign({ t: 'reveal' }, rev)) });
            deliver({ t: 'state', state: state('reveal', { question: q2, lastReveal: rev }) });
          }, 800);
          return;
        }
        if (m.t === 'publish_question') {
          window.__pubs++;
          const pub = window.__pubs;
          const now = Date.now();
          const q = {
            qid: m.qid, round: m.round, kind: m.kind, category: m.category, answersCount: 4,
            baseValue: m.baseValue, multiplier: m.multiplier, headline: false, band: m.band || null,
            windowMs: m.deadlineMs, openedAt: now, deadline: now + m.deadlineMs,
            betted: m.round === 3, decider: false, eligible: null, cut: null, answersIn: 2,
            correctIdx: m.correctIdx, trueNum: m.trueNum,
          };
          deliver({ t: 'state', state: state('answer', { question: q }) });
          setTimeout(() => {
            const banks = PLAN[pub] || [0, 0];
            window.__cum[0] += banks[0]; window.__cum[1] += banks[1];
            const mk = (seat) => {
              const banked = banks[seat];
              const base = { seat, correct: banked > 0, banked, streak: 0, streakBonus: 0, lockMs: banked > 0 ? 1500 : null };
              if (m.kind === 'num') base.num = banked > 0 ? m.trueNum : m.trueNum + 40;
              else base.pick = banked > 0 ? m.correctIdx : (m.correctIdx + 1) % 4;
              return base;
            };
            const rev = {
              qid: m.qid, kind: m.kind, headline: false, golden: false, value: 200,
              results: [mk(0), mk(1)], scores: window.__cum.slice(),
              quickDrawSeat: null, streakMoment: null, decider: false, eligible: null, deciderWinner: null,
              pot: 0, potFed: 0,
              correctIdx: m.kind === 'num' ? null : m.correctIdx, trueNum: m.kind === 'num' ? m.trueNum : null,
            };
            if (this.onmessage) this.onmessage({ data: JSON.stringify(Object.assign({ t: 'reveal' }, rev)) });
            deliver({ t: 'state', state: state('reveal', { question: q, lastReveal: rev }) });
          }, 800);
        }
        if (m.t === 'end_show') {
          deliver({ t: 'ended', scores: window.__cum.slice(), winnerSeat: null, report: REPORTJ });
          deliver({ t: 'state', state: state('ended', { report: REPORTJ }) });
        }
      }
      close() { this.readyState = 3; }
    };
  }
  const host = await browser.newPage();
  watch(host);
  await host.evaluateOnNewDocument(new Function('return (' + hostStubs.toString().replace("JSON.parse('__REPORT__')", JSON.stringify(REPORT)) + ')')());
  await host.setViewport({ width: 844, height: 390 });
  await host.goto(httpUrl, { waitUntil: 'load', timeout: 60000 });
  await sleep(500);
  await host.tap('.mode-tab[data-mode="host"]');
  await sleep(450);
  await host.tap('#btnCreateRoom');
  await host.waitForSelector('#ogStart', { timeout: 15000 });
  for (let i = 0; i < 40; i++) {
    const ok = await host.evaluate(() => { const b = document.getElementById('ogStart'); return !!b && !b.disabled; });
    if (ok) break;
    await sleep(150);
  }
  await host.tap('#ogStart');
  await host.waitForSelector('#ogRoundGo', { timeout: 10000 });
  await host.tap('#ogRoundGo');
  let ogDone = false, ogGuard = 0;
  while (ogGuard++ < 300 && !ogDone) {
    ogDone = await host.evaluate(() => {
      const o = window.__online.OG;
      if (!o) return false;
      if (o.phase === 'over') return true;
      const click = id => { const b = document.getElementById(id); if (b) { b.click(); return true; } return false; };
      if (click('ogDealBluff')) return false;
      if (o.phase === 'reveal') click('ogNext');
      else if (o.phase === 'intermission') { click('ogEraCall'); click('ogBreakGo'); }
      else if (o.phase === 'bet') click('ogBetsGo');
      else if (o.phase === 'intro') click('ogRoundGo');
      return false;
    });
    if (!ogDone) await sleep(300);
  }
  check('Online host: the stub-refereed show runs to its finale', ogDone, 'guard=' + ogGuard);
  await sleep(800);
  const ogShare = await host.evaluate(() => ({
    btn: !!document.getElementById('ogShareNight'),
    cum: window.__cum.slice(),
    data: JSON.parse(JSON.stringify(window.__game.share.data || null)),
  }));
  const ogd = ogShare.data || {};
  check('Online host finale: the share model matches the room\'s night — Ana champion at the mirrored scores, the referee\'s biggest bank as the flourish',
    ogShare.btn && !!ogd.champion && ogd.champion.name === 'Ana' && ogd.champion.total === ogShare.cum[0] && ogd.pot === 0
      && JSON.stringify((ogd.standings || []).map(r => ({ name: r.name, score: r.score }))) === JSON.stringify([{ name: 'Ana', score: ogShare.cum[0] }, { name: 'Bo', score: ogShare.cum[1] }])
      && !!ogd.flourish && ogd.flourish.name === 'Ana' && ogd.flourish.amt === 420,
    'cum=' + JSON.stringify(ogShare.cum) + ' data=' + JSON.stringify(ogd.champion) + ' flourish=' + JSON.stringify(ogd.flourish));
  await host.close();

  /* ================= ONLINE PAD (Bo, an ended room) ================= */
  function padStubs() {
    const REPORTJ = JSON.parse('__REPORT__');
    const okj = obj => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(obj) });
    window.fetch = function (u) {
      const url = String(u);
      if (url.indexOf('gilded-hour-sterling') >= 0) return okj({ line: 'LIVE LINE' });
      if (url.indexOf('gilded-hour-nightly') >= 0) return okj({ question: null, intro: null });
      return Promise.reject(new Error('offline in share drive (pad)'));
    };
    const PLAYERS = [
      { seat: 0, name: 'Ana', score: 4140, cutTwo: true, connected: true, avatar: 0, streak: 0 },
      { seat: 1, name: 'Bo', score: 1160, cutTwo: true, connected: true, avatar: 1, streak: 0 },
      null, null,
    ];
    const snap = (phase, extra) => Object.assign({
      code: 'TEST', phase, role: 'player', seat: 1, showSeq: 1,
      players: PLAYERS, question: null, bet: null, lastReveal: null, intermission: null, pot: 350, report: null,
    }, extra || {});
    window.WebSocket = class FakeWS {
      constructor(u) { this.url = u; this.readyState = 1; setTimeout(() => { if (this.onopen) this.onopen(); }, 20); }
      send(data) {
        let m = {}; try { m = JSON.parse(data); } catch (e) {}
        const deliver = (obj, ms) => setTimeout(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) }); }, ms == null ? 30 : ms);
        if (m.t === 'hello' && m.role === 'player') {
          deliver({ t: 'welcome', role: 'player', code: 'TEST', seat: 1, reclaimToken: 'tok1' });
          deliver({ t: 'state', state: snap('ended', { report: REPORTJ }) });
        }
      }
      close() { this.readyState = 3; }
    };
  }
  const pad = await browser.newPage();
  watch(pad);
  await pad.evaluateOnNewDocument(new Function('return (' + padStubs.toString().replace("JSON.parse('__REPORT__')", JSON.stringify(REPORT)) + ')')());
  await pad.setViewport({ width: 390, height: 844 });
  await pad.goto(httpUrl, { waitUntil: 'load', timeout: 60000 });
  await sleep(400);
  await pad.tap('.mode-tab[data-mode="join"]');
  await sleep(150);
  await pad.click('#joinBoxes .code-box');
  await pad.keyboard.type('TEST', { delay: 30 });
  await pad.type('#joinName', 'Bo');
  await pad.tap('#btnJoinRoom');
  await pad.waitForSelector('#jpShareNight', { timeout: 12000 });
  const padData = await pad.evaluate(() => JSON.parse(JSON.stringify(window.__game.share.data || null)));
  check('Pad finale: Bo\'s card is the honest variant — Ana crowned with the room\'s $350 pot folded in ($4,490), standings as shown, the night\'s biggest bank off the referee\'s card, and no series line the pad never held',
    !!padData && !!padData.champion && padData.champion.name === 'Ana' && padData.champion.total === 4490 && padData.pot === 350
      && JSON.stringify((padData.standings || []).map(r => ({ name: r.name, score: r.score }))) === JSON.stringify([{ name: 'Ana', score: 4140 }, { name: 'Bo', score: 1160 }])
      && !!padData.flourish && padData.flourish.name === 'Ana' && padData.flourish.amt === 420
      && padData.seriesLine === null
      && padData.text === '★ THE GILDED HOUR — Ana takes the night with $4,490 · ' + padData.date,
    'data=' + JSON.stringify(padData));
  await pad.tap('#jpShareNight');
  await pad.waitForFunction(() => !document.getElementById('shareOverlay').classList.contains('hidden'), { timeout: 8000 });
  await pad.waitForFunction(() => {
    const cv = document.getElementById('shareCanvas');
    const ctx = cv.getContext('2d');
    const px = ctx.getImageData(540, 200, 1, 1).data;
    return px[0] + px[1] + px[2] > 0;
  }, { timeout: 15000 });
  const padDims = await pad.evaluate(() => {
    const cv = document.getElementById('shareCanvas');
    return { w: cv.width, h: cv.height };
  });
  const padBand = await bandStats(pad, 440, 900);
  check('Pad: the preview composes the same 1080x1350 card, painted in the champion band',
    padDims.w === 1080 && padDims.h === 1350 && padBand.sd > 8, JSON.stringify(padDims) + ' sd=' + padBand.sd.toFixed(1));
  await pad.tap('#shareClose');
  await sleep(300);
  const padAfter = await pad.evaluate(() => ({
    hidden: document.getElementById('shareOverlay').classList.contains('hidden'),
    leave: !!document.getElementById('jpLeave'), share: !!document.getElementById('jpShareNight'),
  }));
  check('Pad: CLOSE returns to the pad\'s finale untouched', padAfter.hidden && padAfter.leave && padAfter.share, JSON.stringify(padAfter));
  await pad.close();

  check('No console/page errors anywhere in the drive', errors.length === 0, errors.slice(0, 3).join(' ;; '));
  const fails = results.filter(r => !r.ok).length;
  console.log('DRIVE-SHARE DONE — ' + (results.length - fails) + '/' + results.length + ' checks passed');
  await browser.close();
  server.close();
  process.exit(fails ? 2 : 0);
})().catch(e => { console.error('DRIVE-SHARE FAIL:', e.message); process.exit(1); });
