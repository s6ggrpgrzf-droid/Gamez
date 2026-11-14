/* drive-bluff-online.js — THE BLUFF (research programme pass 2)
   on the online screens, against a scripted room stub (the
   referee's own arithmetic is proven in the server suite,
   test-bluff.js):
   HOST — plays a real show to Round 2's fourth question, where
   the script deals the bluff: the publish carries the truth and
   decoys and NO correctIdx; the room's snapshots walk the big
   screen through the invent stage (prompt, lie count, the DEAL
   button) to the dealt answers; the reveal prints the accounting
   of lies and the author's desk wears the FOOLED tag.
   PAD — joins into the invent phase: the prompt rebuilt from its
   own bank, an input for the lie, {t:'bluff'} on the wire; the
   dealt answers arrive from the room (never rebuilt locally);
   no Double, gauntlet or Cut Two is offered on a bluff; the
   verdict names the bank and the lie's take separately. */
const { launchBrowser } = require('./rig');
const fs = require('fs');
const http = require('http');
const path = require('path');
const ROOT = '/home/hatch/workspace/gilded-hour';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('nope'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});
/* a real bluff entry's bank id — the pad rebuilds its prompt from
   its own copy of the bank by qid, so the qid must name one */
const window = {};
eval(fs.readFileSync(path.join(ROOT, 'questions.js'), 'utf8'));
const BANKWIN = { GH_BANK: window.GH_BANK };
const BLUFF_ID = BANKWIN.GH_BANK.findIndex(q => q.kind === 'bluff');
const BLUFF_TRUTH = BANKWIN.GH_BANK[BLUFF_ID].a;

/* the stubs are SELF-CONTAINED: puppeteer serializes their source */
function hostStub() {
  const ok = obj => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(obj) });
  window.fetch = function (u) {
    const url = String(u);
    if (url.indexOf('gilded-hour-rooms') >= 0) return ok({ code: 'TEST', hostToken: 'tok' });
    if (url.indexOf('gilded-hour-sterling') >= 0) return ok({ line: 'LIVE LINE' });
    if (url.indexOf('gilded-hour-nightly') >= 0) return ok({ question: null, intro: null });
    return Promise.reject(new Error('offline in bluff-online drive'));
  };
  const PLAYERS = (scores) => ([
    { seat: 0, name: 'Robin', score: scores[0], cutTwo: true, cutCount: 1, dbl: true, connected: true, avatar: 0, streak: 0, vsRound: 0 },
    { seat: 1, name: 'Jules', score: scores[1], cutTwo: true, cutCount: 1, dbl: true, connected: true, avatar: 1, streak: 0, vsRound: 0 },
    null, null
  ]);
  const base = (phase, question, lastReveal) => ({ t: 'state', state: { code: 'TEST', phase, role: 'host', seat: null, rules: {}, players: PLAYERS(this && window.__scores || [500, 400]), question: question || null, bet: null, lastReveal: lastReveal || null, pot: 0, intermission: null, report: null } });
  window.WebSocket = class FakeWS {
    constructor(u) { this.url = u; this.readyState = 1; window.__ws = this; window.__scores = [500, 400]; setTimeout(() => { if (this.onopen) this.onopen(); }, 20); }
    deliver(obj) { setTimeout(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) }); }, 30); }
    state(phase, question, lastReveal) {
      return { t: 'state', state: { code: 'TEST', phase, role: 'host', seat: null, rules: {}, players: PLAYERS(window.__scores), question: question || null, bet: null, lastReveal: lastReveal || null, pot: 0, intermission: null, report: null } };
    }
    send(data) {
      let m = {}; try { m = JSON.parse(data); } catch (e) {}
      if (m.t === 'hello' && m.role === 'host') {
        this.deliver({ t: 'welcome', role: 'host', code: 'TEST' });
        this.deliver(this.state('lobby', null, null));
      }
      if (m.t === 'bet_phase') {
        this._betQid = m.qid;
        this.deliver(this.state('bet', null, null));
        const st = this.state('bet', null, null); st.state.bet = { qid: m.qid, betsIn: 2 }; this.deliver(st);
      }
      if (m.t === 'publish_question') {
        const betted = this._betQid === m.qid; this._betQid = null;
        if (m.kind === 'bluff') {
          window.__bluffPub = m;
          this._bluff = { qid: m.qid, truth: m.bluffTruth };
          const q = { qid: m.qid, round: m.round, kind: 'bluff', category: m.category, answersCount: 0, baseValue: 200, multiplier: 1, headline: false, band: m.band || null, windowMs: 60000, openedAt: Date.now(), deadline: Date.now() + 60000, betted: false, decider: false, eligible: null, cut: null, answersIn: 0, dblArmed: [], vsArmed: [], bluffPhase: 'invent', fakesIn: 0, options: null };
          this._q = q;
          this.deliver(this.state('invent', q, null));
          const q2 = Object.assign({}, q, { fakesIn: 1 });
          setTimeout(() => this.deliver(this.state('invent', q2, null)), 800);
          return;
        }
        this._q = { qid: m.qid, round: m.round, kind: m.kind, category: m.category || 'Movies', answersCount: 4, baseValue: m.baseValue || 200, multiplier: 1, headline: false, band: m.band || null, windowMs: m.deadlineMs || 20000, openedAt: Date.now(), deadline: Date.now() + (m.deadlineMs || 20000), betted, decider: false, eligible: null, cut: null, answersIn: 0, dblArmed: [], vsArmed: [] };
        this.deliver(this.state('answer', this._q, null));
      }
      if (m.t === 'bluff_deal' && this._bluff) {
        const opts = ['A brass teaspoon', this._bluff.truth, 'A singing kettle'];
        const q = Object.assign({}, this._q, { bluffPhase: 'answer', options: opts, answersCount: 3, correctIdx: 1, windowMs: 25000, openedAt: Date.now(), deadline: Date.now() + 25000 });
        this._q = q;
        this.deliver({ t: 'bluff_options', qid: q.qid, options: opts });
        this.deliver(this.state('answer', q, null));
      }
      if (m.t === 'reveal' && this._q) {
        const q = this._q;
        if (q.kind === 'bluff') {
          const results = [
            { seat: 0, correct: true, banked: 225, pick: 1, fool: 25 },
            { seat: 1, correct: false, banked: 0, pick: 0 }
          ];
          window.__scores = [window.__scores[0] + 225, window.__scores[1]];
          const bluff = { options: [{ t: 'A brass teaspoon', by: 0, truth: false }, { t: q.options[1], by: -1, truth: true }, { t: 'A singing kettle', by: 1, truth: false }] };
          const rev = { t: 'reveal', qid: q.qid, kind: 'bluff', headline: false, golden: false, value: 200, results, scores: window.__scores.slice(), quickDrawSeat: null, streakMoment: null, decider: false, eligible: null, pot: 0, potFed: 0, correctIdx: 1, bluff };
          this._lastRev = rev;
          this.deliver(rev);
          const lr = Object.assign({}, rev); delete lr.t;
          setTimeout(() => this.deliver(this.state('reveal', q, lr)), 60);
        } else {
          const results = [{ seat: 0, correct: true, banked: 100, pick: 1 }, { seat: 1, correct: false, banked: 0, pick: 0 }];
          window.__scores = [window.__scores[0] + 100, window.__scores[1]];
          this.deliver({ t: 'reveal', qid: q.qid, kind: q.kind, headline: false, golden: false, value: 100, results, scores: window.__scores.slice(), quickDrawSeat: null, streakMoment: null, decider: false, eligible: null, pot: 0, potFed: 0, correctIdx: 1 });
          setTimeout(() => this.deliver(this.state('reveal', q, null)), 60);
        }
      }
      if (m.t === 'intermission') {
        const st = this.state('intermission', null, null); st.state.intermination = { nextRound: m.nextRound, wind: [] };
        this.deliver(st);
      }
    }
    close() { this.readyState = 3; }
  };
}

function padStub(bluffId, truth) {
  const ok = obj => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(obj) });
  window.fetch = function (u) {
    const url = String(u);
    if (url.indexOf('gilded-hour-rooms') >= 0) return ok({ code: 'TEST', hostToken: 'tok' });
    if (url.indexOf('gilded-hour-sterling') >= 0) return ok({ line: 'LIVE LINE' });
    if (url.indexOf('gilded-hour-nightly') >= 0) return ok({ question: null, intro: null });
    return Promise.reject(new Error('offline in bluff-online drive'));
  };
  window.__sentMsgs = [];
  const QID = 'q10.' + bluffId + '.abc';
  const PLAYERS = () => ([
    { seat: 0, name: 'Ana', score: 500, cutTwo: true, cutCount: 1, dbl: true, connected: true, avatar: 0, streak: 0, vsRound: 0 },
    { seat: 1, name: 'Bo', score: 400, cutTwo: true, cutCount: 1, dbl: true, connected: true, avatar: 1, streak: 0, vsRound: 0 },
    null, null]);
  window.WebSocket = class FakeWS {
    constructor(u) { this.url = u; this.readyState = 1; window.__ws = this; setTimeout(() => { if (this.onopen) this.onopen(); }, 20); }
    deliver(obj) { setTimeout(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) }); }, 30); }
    state(phase, question, extra) {
      return { t: 'state', state: Object.assign({ code: 'TEST', phase, role: 'player', seat: 0, rules: {}, players: PLAYERS(), question: question || null, bet: null, lastReveal: null, pot: 0, intermission: null, report: null, yourPick: null, yourNum: null, yourFake: null }, extra || {}) };
    }
    inventQ(fakesIn) {
      return { qid: QID, round: 2, kind: 'bluff', category: 'Movies', answersCount: 0, baseValue: 200, multiplier: 1, headline: false, band: 2, windowMs: 60000, openedAt: Date.now(), deadline: Date.now() + 60000, betted: false, decider: false, eligible: null, cut: null, answersIn: 0, dblArmed: [], vsArmed: [], bluffPhase: 'invent', fakesIn, options: null };
    }
    send(data) {
      let m = {}; try { m = JSON.parse(data); } catch (e) {}
      window.__sentMsgs.push(m);
      if (m.t === 'hello' && m.role === 'player') {
        this.deliver({ t: 'welcome', role: 'player', code: 'TEST', seat: 0, reclaimToken: 'tok0' });
        this.deliver(this.state('invent', this.inventQ(0)));
      }
      if (m.t === 'bluff') {
        this.deliver({ t: 'accepted', qid: QID });
        this.deliver(this.state('invent', this.inventQ(1), { yourFake: m.text }));
      }
    }
    close() { this.readyState = 3; }
  };
  window.__stubDeal = () => {
    const ws = window.__ws; if (!ws) return;
    const opts = ['A brass teaspoon', truth, 'A singing kettle'];
    ws.deliver({ t: 'bluff_options', qid: QID, options: opts });
    const q = { qid: QID, round: 2, kind: 'bluff', category: 'Movies', answersCount: 3, baseValue: 200, multiplier: 1, headline: false, band: 2, windowMs: 25000, openedAt: Date.now(), deadline: Date.now() + 25000, betted: false, decider: false, eligible: null, cut: null, answersIn: 0, dblArmed: [], vsArmed: [], bluffPhase: 'answer', fakesIn: 2, options: opts };
    ws.deliver(ws.state('answer', q));
  };
  window.__stubReveal = () => {
    const ws = window.__ws; if (!ws) return;
    const results = [
      { seat: 0, correct: true, banked: 225, pick: 1, fool: 25 },
      { seat: 1, correct: false, banked: 0, pick: 0 }
    ];
    const bluff = { options: [{ t: 'A brass teaspoon', by: 0, truth: false }, { t: truth, by: -1, truth: true }, { t: 'A singing kettle', by: 1, truth: false }] };
    const rev = { qid: QID, kind: 'bluff', headline: false, golden: false, value: 200, results, scores: [725, 400], quickDrawSeat: null, streakMoment: null, decider: false, eligible: null, pot: 0, potFed: 0, correctIdx: 1, bluff };
    ws.deliver({ t: 'reveal', qid: QID, kind: 'bluff', headline: false, golden: false, value: 200, results, scores: [725, 400], quickDrawSeat: null, streakMoment: null, decider: false, eligible: null, pot: 0, potFed: 0, correctIdx: 1, bluff });
    const st = ws.state('reveal', null, { lastReveal: rev });
    st.state.players[0].score = 725;
    ws.deliver(st);
  };
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/index.html';
  const browser = await launchBrowser();
  const errors = [];
  const watch = p => { p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message)); };
  try {
    /* ================= HOST ================= */
    const page = await browser.newPage(); watch(page);
    await page.evaluateOnNewDocument(hostStub);
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await sleep(500);
    await page.tap('.mode-tab[data-mode="host"]'); await sleep(200);
    await page.tap('#btnCreateRoom');
    for (let i = 0; i < 30; i++) { if (await page.evaluate(() => { const b = document.getElementById('ogStart'); return !!b && !b.disabled; })) break; await sleep(150); }
    await page.tap('#ogStart');
    const ogPhase = () => page.evaluate(() => window.__online.OG ? window.__online.OG.phase : null);
    const ogKind = () => page.evaluate(() => window.__online.OG && window.__online.OG.cur ? window.__online.OG.cur.kind : null);
    let asserted = false, guard = 0;
    while (guard++ < 300 && !asserted) {
      const ph = await ogPhase();
      if (ph === 'intro') { await page.tap('#ogRoundGo').catch(() => {}); await sleep(350); continue; }
      if (ph === 'intermission') { await page.tap('#ogBreakGo').catch(() => {}); await sleep(350); continue; }
      if (ph === 'invent') {
        const pub = await page.evaluate(() => window.__bluffPub || null);
        check('H: the bluff publish carries truth + 3 decoys and no correctIdx',
          !!pub && typeof pub.bluffTruth === 'string' && Array.isArray(pub.decoys) && pub.decoys.length === 3 && pub.correctIdx == null,
          JSON.stringify(pub).slice(0, 160));
        let lies = null;
        for (let i = 0; i < 30; i++) {
          lies = await page.evaluate(() => { const b = document.querySelector('.og-count b'); return b ? b.textContent : null; });
          if (lies === '1') break;
          await sleep(150);
        }
        check('H: the invent stage shows the prompt and counts the lies in', lies === '1', 'lies=' + lies);
        await page.tap('#ogDealBluff'); await sleep(700);
        const dealt = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('#stage .ans-btn')).map(b => b.textContent.replace(/\s+/g, ' '));
          return { ph: window.__online.OG.phase, n: btns.length, has: btns.some(t => t.indexOf('brass teaspoon') >= 0) };
        });
        check('H: DEAL moves the room to the dealt answers on the big screen', dealt.ph === 'answer' && dealt.n === 3 && dealt.has, JSON.stringify(dealt));
        await page.tap('#ogCallIt'); await sleep(800);
        const fin = await page.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('.bluff-credit')).map(r => r.textContent.replace(/\s+/g, ' '));
          const tag = document.querySelector('.seat[data-seat="0"] .blufftag');
          const delta = document.querySelector('.seat[data-seat="0"] .seat-delta');
          return { rows, tag: tag ? tag.textContent : null, delta: delta ? delta.textContent : null };
        });
        check('H: the reveal prints the accounting of lies', fin.rows.some(r => /TRUTH/.test(r)) && fin.rows.some(r => /ROBIN'S LIE/.test(r)) && fin.rows.some(r => /fooled 1 player/.test(r)), fin.rows.join(' | '));
        check('H: the author’s desk wears FOOLED 1 · +$25', fin.tag === 'FOOLED 1 · +$25', String(fin.tag));
        check('H: the banker’s delta is the whole $225', !!fin.delta && fin.delta.replace(/[^0-9]/g, '') === '225', JSON.stringify(fin.delta));
        asserted = true;
        break;
      }
      if (ph === 'answer') { await page.tap('#ogCallIt').catch(() => {}); await sleep(450); continue; }
      if (ph === 'reveal') { await page.tap('#ogNext').catch(() => {}); await sleep(350); continue; }
      await sleep(250);
    }
    check('H: the bluff was reached in the script and asserted', asserted);
    await page.close();

    /* ================= PAD ================= */
    const pad = await browser.newPage(); watch(pad);
    await pad.evaluateOnNewDocument(padStub, BLUFF_ID, BLUFF_TRUTH);
    await pad.setViewport({ width: 390, height: 844 });
    await pad.goto(url, { waitUntil: 'load', timeout: 60000 });
    await sleep(500);
    await pad.tap('.mode-tab[data-mode="join"]'); await sleep(150);
    await pad.click('#joinBoxes .code-box');
    await pad.keyboard.type('TEST', { delay: 30 });
    await pad.type('#joinName', 'Ana');
    await pad.tap('#btnJoinRoom');
    await pad.waitForSelector('#jpBluffIn', { timeout: 10000 });
    const prompt = await pad.evaluate(() => document.querySelector('.jp-card .jp-sub') ? document.querySelector('.jp-card .jp-sub').textContent : '');
    check('P: the pad rebuilds the bluff prompt from its own bank', prompt === BANKWIN.GH_BANK[BLUFF_ID].q, prompt.slice(0, 60));
    await pad.type('#jpBluffIn', 'A brass teaspoon');
    await pad.tap('#jpBluffSend'); await sleep(400);
    const sent = await pad.evaluate(() => window.__sentMsgs.filter(m => m.t === 'bluff'));
    check('P: the tap puts {t:bluff} with the lie on the wire', sent.length === 1 && sent[0].text === 'A brass teaspoon', JSON.stringify(sent));
    await pad.evaluate(() => window.__stubDeal()); await sleep(600);
    const ans = await pad.evaluate(() => ({
      n: document.querySelectorAll('.jp-ans').length,
      dbl: !!document.getElementById('jpDbl'), vs: !!document.getElementById('jpVs'), cut: !!document.getElementById('jpCut')
    }));
    check('P: the dealt answers arrive as three tappable plaques', ans.n === 3, JSON.stringify(ans));
    check('P: no Double, gauntlet or Cut Two is offered on a bluff', !ans.dbl && !ans.vs && !ans.cut, JSON.stringify(ans));
    await pad.evaluate(() => { const b = document.querySelectorAll('.jp-ans')[1]; if (b) b.scrollIntoView({ block: 'center' }); });
    await sleep(200);
    await pad.tap('.jp-ans[data-pick="1"]'); await sleep(300);
    const picks = await pad.evaluate(() => window.__sentMsgs.filter(m => m.t === 'answer'));
    check('P: the truth tap puts {t:answer, pick:1} on the wire', picks.length === 1 && picks[0].pick === 1, JSON.stringify(picks));
    await pad.evaluate(() => window.__stubReveal()); await sleep(700);
    const verdict = await pad.evaluate(() => {
      const w = document.querySelector('.jp-vword');
      const f = document.querySelector('.jp-foolline');
      return { word: w ? w.textContent : null, fool: f ? f.textContent : null };
    });
    check('P: the verdict names the bank', !!verdict.word && verdict.word.indexOf('225') >= 0, JSON.stringify(verdict));
    check('P: the verdict names the lie’s take', verdict.fool === 'YOUR LIE FOOLED THE TABLE · +$25', JSON.stringify(verdict));
    await pad.close();

    check('no page errors on either page', errors.length === 0, errors.slice(0, 3).join(' ;; '));
  } finally { await browser.close(); server.close(); }
  const fails = results.filter(r => !r.ok).length;
  console.log('DRIVE-BLUFF-ONLINE: ' + (results.length - fails) + '/' + results.length + ' passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('DRIVE ERROR', e); server.close(); process.exit(2); });
