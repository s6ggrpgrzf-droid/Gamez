/* Gilded Hour — Review Pass 8 drive: THE NO-HOST SHOW.
   Table: no CALL IT and no REVEAL button exist; answers go in on
   the desks (pick chips), Quick Draw honours the earliest correct
   lock, numbers are keyed in seat order and the closest is
   computed, the Decade Vote is cast on the desks and called by
   Sterling himself, and Round 2 opens with nobody tapping GO.
   Online (fake room): when every phone's snapshot says ready, the
   show starts itself — no START tap — and the first question
   paints with no CALL IT on the big screen. Pad: the lobby's
   READY button puts {t:'ready'} on the wire. */
const { launchBrowser } = require('./rig');
const fs = require('fs');
const http = require('http');
const path = require('path');
const ROOT = '/home/hatch/workspace/gilded-hour';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok, detail }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); }
const tapSel = async (page, sel) => {
  for (let a = 0; a < 4; a++) {
    try { await page.tap(sel); return; }
    catch (e) { if (!/detached/i.test(e.message) || a === 3) throw e; await sleep(180); }
  }
};

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('nope'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

/* the fake room for the host half: two phones seated, unready —
   a second snapshot a second later has both ready, and Sterling
   must start the show on his own */
function hostStub() {
  const ok = obj => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(obj) });
  window.fetch = function (u) {
    const url = String(u);
    if (url.indexOf('gilded-hour-rooms') >= 0) return ok({ code: 'TEST', hostToken: 'tok' });
    if (url.indexOf('gilded-hour-sterling') >= 0) return ok({ line: 'LIVE LINE' });
    if (url.indexOf('gilded-hour-nightly') >= 0) return ok({ question: null, intro: null });
    return Promise.reject(new Error('offline in nohost drive'));
  };
  const PLAYERS = (ready) => ([
    { seat: 0, name: 'Robin', score: 0, cutTwo: true, cutCount: 1, dbl: true, connected: true, ready: !!ready, avatar: 0, streak: 0, vsRound: 0 },
    { seat: 1, name: 'Jules', score: 0, cutTwo: true, cutCount: 1, dbl: true, connected: true, ready: !!ready, avatar: 1, streak: 0, vsRound: 0 },
    null, null
  ]);
  window.WebSocket = class FakeWS {
    constructor(u) { this.url = u; this.readyState = 1; setTimeout(() => { if (this.onopen) this.onopen(); }, 20); }
    deliver(obj) { setTimeout(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) }); }, 30); }
    state(phase, question, ready) {
      return { t: 'state', state: { code: 'TEST', phase, role: 'host', seat: null, rules: {}, players: PLAYERS(ready), question: question || null, bet: null, lastReveal: null, pot: 0, intermission: null, report: null } };
    }
    send(data) {
      let m = {}; try { m = JSON.parse(data); } catch (e) {}
      if (m.t === 'hello' && m.role === 'host') {
        this.deliver({ t: 'welcome', role: 'host', code: 'TEST' });
        this.deliver(this.state('lobby', null, false));
        const self = this;
        setTimeout(() => self.deliver(self.state('lobby', null, true)), 1200);
      }
      if (m.t === 'publish_question') {
        const q = { qid: m.qid, round: m.round, kind: m.kind, category: m.category || 'Movies', answersCount: 4, baseValue: m.baseValue || 200, multiplier: 1, headline: false, band: m.band || null, windowMs: m.deadlineMs || 20000, openedAt: Date.now(), deadline: Date.now() + (m.deadlineMs || 20000), betted: false, decider: false, eligible: null, cut: null, answersIn: 0, dblArmed: [], vsArmed: [] };
        this._q = q;
        this.deliver(this.state('answer', q, true));
      }
    }
    close() { this.readyState = 3; }
  };
}

/* the fake room for the pad half: a lobby, and a wire log */
function padStub() {
  const ok = obj => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(obj) });
  window.fetch = function (u) {
    const url = String(u);
    if (url.indexOf('gilded-hour-rooms') >= 0) return ok({ code: 'TEST', hostToken: 'tok' });
    if (url.indexOf('gilded-hour-sterling') >= 0) return ok({ line: 'LIVE LINE' });
    if (url.indexOf('gilded-hour-nightly') >= 0) return ok({ question: null, intro: null });
    return Promise.reject(new Error('offline in nohost drive'));
  };
  window.__sentMsgs = [];
  const PLAYERS = (ready) => ([
    { seat: 0, name: 'Ana', score: 0, cutTwo: true, cutCount: 1, dbl: true, connected: true, ready: !!ready, avatar: 0, streak: 0, vsRound: 0 },
    { seat: 1, name: 'Bo', score: 0, cutTwo: true, cutCount: 1, dbl: true, connected: true, ready: false, avatar: 1, streak: 0, vsRound: 0 },
    null, null]);
  window.WebSocket = class FakeWS {
    constructor(u) { this.url = u; this.readyState = 1; window.__ws = this; setTimeout(() => { if (this.onopen) this.onopen(); }, 20); }
    deliver(obj) { setTimeout(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) }); }, 30); }
    state(ready) { return { t: 'state', state: { code: 'TEST', phase: 'lobby', role: 'player', seat: 0, rules: {}, players: PLAYERS(ready), question: null, bet: null, lastReveal: null, pot: 0, intermission: null, report: null, showSeq: 1 } }; }
    send(data) {
      let m = {}; try { m = JSON.parse(data); } catch (e) {}
      window.__sentMsgs.push(m);
      if (m.t === 'hello' && m.role === 'player') {
        this.deliver({ t: 'welcome', role: 'player', code: 'TEST', seat: 0, reclaimToken: 'tok0' });
        this.deliver(this.state(false));
      }
      if (m.t === 'ready') this.deliver(this.state(!!m.ready));
    }
    close() { this.readyState = 3; }
  };
}

(async () => {
  const browser = await launchBrowser({ protocolTimeout: 240000 });
  const errors = [];
  const watch = p => { p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message)); };

  /* ================= TABLE ================= */
  const page = await browser.newPage(); watch(page);
  await page.setViewport({ width: 844, height: 390 });
  await page.goto('file:///home/hatch/workspace/gilded-hour/index.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(600);

  const paceUi = await page.evaluate(() => ({
    host: !!document.querySelector('.pace-toggle[data-pace="host"]'),
    flow: !!document.querySelector('.pace-toggle[data-pace="flow"]'),
    brisk: !!document.querySelector('.pace-toggle[data-pace="brisk"]')
  }));
  check('T: HOST LED is gone from the setup — Sterling\'s tempo is a two-way choice', !paceUi.host && paceUi.flow && paceUi.brisk, JSON.stringify(paceUi));

  const S = () => page.evaluate(() => {
    const g = window.__game.G;
    if (!g) return null;
    return {
      phase: g.phase, round: g.round, qInRound: g.qInRound,
      scores: g.players.map(p => p.score),
      kind: g.cur ? g.cur.kind : null, bluffDealt: g.cur ? !!g.cur.bluffDealt : false,
      truth: g.cur && g.cur.q ? g.cur.q.num : null,
      guessTurn: g.cur ? g.cur.guessTurn : null,
      bankValue: g.cur ? g.cur.bankValue : null,
      era: g.era, eraCalled: !!g.eraCalled,
      opts: g.cur && g.cur.opts ? g.cur.opts.map(o => ({ ok: !!o.ok, gone: !!o.gone, by: o.by != null ? o.by : -1 })) : null,
      picks: g.cur ? (g.cur.picks || null) : null
    };
  });

  await page.tap('#btnStart');
  await page.waitForSelector('#btnRoundGo', { timeout: 8000 });
  await page.tap('#btnRoundGo');

  let qdChecked = false, numChecked = false, noHostChecked = false, eraChecked = false, autoRoundChecked = false, bluffChecked = false;
  let actedQ = '', guard = 0, pre = null, qkey = '';
  while (guard++ < 700) {
    const s = await S();
    if (!s) throw new Error('game state lost');
    if (s.phase === 'over') break;
    if (s.phase === 'coldopen' || s.phase === 'spin' || s.phase === 'vote-count' || s.phase === 'vote') { await sleep(250); continue; }
    if (s.phase === 'intro') {
      if (s.round === 2 && eraChecked && !autoRoundChecked) {
        /* do NOT tap GO — Sterling starts this round himself */
        await sleep(400); continue;
      }
      await page.tap('#btnRoundGo'); await sleep(300); continue;
    }
    if (s.phase === 'intermission') {
      if (!eraChecked) {
        const chips = await page.evaluate(() => document.querySelectorAll('[data-eravote]').length);
        check('T: the Decade Vote is cast on the desks (era chips at the break)', chips === 9, 'chips=' + chips);
        await tapSel(page, '[data-eravote="0|1"]'); await sleep(200);
        await tapSel(page, '[data-eravote="1|1"]'); await sleep(200);
        await tapSel(page, '[data-eravote="2|0"]'); await sleep(200);
        let called = false;
        for (let i = 0; i < 30 && !called; i++) { const st = await S(); called = st.eraCalled; if (!called) await sleep(300); }
        check('T: Sterling calls the era himself when every desk is in (90s, 2-1)', called && s.era !== 'x' && (await S()).era === '90s', 'era=' + (await S()).era);
        eraChecked = true;
      }
      await page.tap('#btnBreakGo'); await sleep(300); continue;
    }
    if (s.phase === 'bet') { await page.tap('#btnBetsDone'); await sleep(300); continue; }
    if (s.phase === 'reveal') {
      const now = (await S()).scores;
      if (pre && qkey === 'qd') {
        const st = await S();
        check('T: Quick Draw honours the earliest correct lock, not the loudest claim',
          now[1] - pre[1] === st.bankValue + 50 && now[0] - pre[0] === st.bankValue && now[2] === pre[2],
          'gains=' + JSON.stringify(now.map((v, i) => v - pre[i])) + ' bankValue=' + st.bankValue);
        qdChecked = true;
      }
      if (pre && qkey === 'num') {
        const st = await S();
        check('T: the closest keyed number banks — computed, not judged',
          now[2] - pre[2] === st.bankValue && now[0] === pre[0] && now[1] === pre[1],
          'gains=' + JSON.stringify(now.map((v, i) => v - pre[i])) + ' bankValue=' + st.bankValue);
        numChecked = true;
      }
      if (pre && qkey === 'bluff') {
        check('T: the Bluff pays the truth $200 and the fooled lie\'s author $25',
          now[0] - pre[0] === 225 && now[2] - pre[2] === 200 && now[1] === pre[1],
          'gains=' + JSON.stringify(now.map((v, i) => v - pre[i])));
        bluffChecked = true;
      }
      pre = null; qkey = '';
      const b = await page.$('#btnNext'); if (b) { await b.tap(); await sleep(250); }
      continue;
    }
    if (s.phase === 'question') {
      const key = s.round + ':' + s.qInRound + ':' + s.kind;
      if (s.round === 2 && !autoRoundChecked && eraChecked) autoRoundChecked = true; /* reached a Round-2 question with no GO tap */
      if (!noHostChecked && s.kind === 'mcq') {
        const nh = await page.evaluate(() => ({
          call: !!document.getElementById('btnCallIt'), reveal: !!document.getElementById('btnReveal'),
          chips: document.querySelectorAll('[data-pick]').length
        }));
        check('T: no CALL IT and no REVEAL exist — the desks carry the picks (12 chips for 3 seats)', !nh.call && !nh.reveal && nh.chips === 12, JSON.stringify(nh));
        noHostChecked = true;
      }
      if (actedQ === key) { await sleep(250); continue; }
      if (s.kind === 'bluff' && !s.bluffDealt) {
        await page.type('#bluffIn0', 'A singing kettle');
        await page.type('#bluffIn1', 'A brass teaspoon');
        await page.tap('#btnDealBluff');
        await sleep(600);
        continue;
      }
      actedQ = key;
      pre = s.scores.slice();
      if (s.kind === 'num') {
        qkey = numChecked ? '' : 'num';
        let g2 = 0;
        while (g2++ < 12) {
          const st = await S();
          if (!st || st.phase !== 'question' || st.guessTurn == null || st.guessTurn < 0) break;
          const seat = st.guessTurn;
          const target = (qkey === 'num' && seat === 2) ? st.truth : st.truth + 400 + seat * 137;
          for (const ch of String(target)) { await tapSel(page, '[data-numk="' + ch + '"]'); await sleep(50); }
          await tapSel(page, '#btnNumLock');
          await sleep(220);
        }
        continue;
      }
      /* option questions (mcq / survey / dealt bluff) */
      const okIx = s.opts ? s.opts.findIndex(o => o.ok) : -1;
      if (s.kind === 'bluff') {
        qkey = 'bluff';
        const lieOf0 = s.opts.findIndex(o => o.by === 0);
        const plan = { 0: okIx, 1: lieOf0, 2: okIx };
        for (let seat = 0; seat < 3; seat++) { if (plan[seat] >= 0) { await tapSel(page, '[data-pick="' + seat + '|' + plan[seat] + '"]'); await sleep(150); } }
        continue;
      }
      if (!qdChecked && s.kind === 'mcq') {
        qkey = 'qd';
        /* seat 1 locks the truth FIRST, seat 0 locks it a breath
           later, seat 2 takes a wrong one — the draw belongs to 1 */
        const wrong = s.opts.findIndex(o => !o.ok);
        await tapSel(page, '[data-pick="1|' + okIx + '"]'); await sleep(1200);
        await tapSel(page, '[data-pick="0|' + okIx + '"]'); await sleep(150);
        await tapSel(page, '[data-pick="2|' + wrong + '"]'); await sleep(150);
        continue;
      }
      for (let seat = 0; seat < 3; seat++) {
        const oi = seat === 0 ? okIx : s.opts.findIndex((o, ix) => !o.ok && !o.gone && o.by !== seat);
        if (oi >= 0) { await tapSel(page, '[data-pick="' + seat + '|' + oi + '"]'); await sleep(120); }
      }
      continue;
    }
    await sleep(250);
  }
  check('T: the quick-draw question was played and proven', qdChecked);
  check('T: a number question was keyed and proven', numChecked);
  check('T: the Decade Vote was cast and called', eraChecked);
  check('T: Round 2 opened on Sterling\'s own GO', autoRoundChecked);
  check('T: the Bluff was invented, dealt and proven', bluffChecked);
  await page.close();

  /* ================= ONLINE HOST ================= */
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/index.html';
  const host = await browser.newPage(); watch(host);
  await host.evaluateOnNewDocument(hostStub);
  await host.setViewport({ width: 1280, height: 720 });
  await host.goto(url, { waitUntil: 'load', timeout: 60000 });
  await sleep(500);
  await host.tap('.mode-tab[data-mode="host"]'); await sleep(200);
  await host.tap('#btnCreateRoom');
  let started = false, phaseSeen = '';
  for (let i = 0; i < 50 && !started; i++) {
    phaseSeen = await host.evaluate(() => window.__online.OG ? window.__online.OG.phase : null);
    if (phaseSeen && phaseSeen !== 'lobby' && phaseSeen !== 'connecting') started = true;
    if (!started) await sleep(250);
  }
  check('O: when every phone is ready, the show starts itself — no START tap', started, 'phase=' + phaseSeen);
  let qPainted = false, callItSeen = true;
  for (let i = 0; i < 60 && !qPainted; i++) {
    const st = await host.evaluate(() => ({
      ph: window.__online.OG ? window.__online.OG.phase : null,
      call: !!document.getElementById('ogCallIt')
    }));
    if (st.ph === 'answer') { qPainted = true; callItSeen = st.call; }
    if (!qPainted) await sleep(300);
  }
  check('O: the first question paints on the big screen', qPainted);
  check('O: no CALL IT on the big screen — the room\'s clock closes the window', qPainted && !callItSeen);
  await host.close();

  /* ================= PAD ================= */
  const pad = await browser.newPage(); watch(pad);
  await pad.evaluateOnNewDocument(padStub);
  await pad.setViewport({ width: 390, height: 844 });
  await pad.goto(url, { waitUntil: 'load', timeout: 60000 });
  await sleep(500);
  await pad.tap('.mode-tab[data-mode="join"]'); await sleep(150);
  await pad.click('#joinBoxes .code-box');
  await pad.keyboard.type('TEST', { delay: 30 });
  await pad.type('#joinName', 'Ana');
  await pad.tap('#btnJoinRoom');
  await pad.waitForSelector('#jpReady', { timeout: 10000 });
  check('P: the pad lobby offers its READY word', true);
  await pad.tap('#jpReady'); await sleep(500);
  const sent = await pad.evaluate(() => window.__sentMsgs.filter(m => m.t === 'ready'));
  check('P: the tap puts {t:\'ready\', ready:true} on the wire', sent.length === 1 && sent[0].ready === true, JSON.stringify(sent));
  const label = await pad.evaluate(() => { const b = document.getElementById('jpReady'); return b ? b.textContent : ''; });
  check('P: the pad shows its ready state back', /READY ✓/.test(label), label);
  await pad.close();

  check('No console/page errors anywhere', errors.length === 0, errors.slice(0, 3).join(' ;; '));
  const fails = results.filter(r => !r.ok).length;
  console.log('DRIVE-NOHOST DONE — ' + (results.length - fails) + '/' + results.length + ' checks passed');
  await browser.close();
  server.close();
  process.exit(fails ? 2 : 0);
})().catch(e => { console.error('DRIVE-NOHOST FAIL:', e.message); process.exit(1); });
