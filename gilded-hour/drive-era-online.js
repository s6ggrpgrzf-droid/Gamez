/* Designer pass 6 (research programme Pass 4) — THE DECADE
   VOTE on the online screens, against a scripted room stub
   (the referee's own era arithmetic is proven in the server
   suite, test-era.js 16/16).
   HOST — plays Round 1 against the stub and reaches the first
     break: the vote stands (era_open on the wire, BEGIN held
     back), the pads' ballots arrive as snapshots and the host
     panel tallies them live; CALL IT puts era_call on the wire
     and — the deferred-deal proof — the script grows from 6
     entries to the full 15 only then, with every ordinary card
     in the tail dealt from the voted era. BEGIN then opens
     Round 2 at QUESTION 7 OF 15.
   PAD — joins into the open vote: three ballots, its own pick
     lit from the snapshot echo, its tap puts {t:'era_vote'} on
     the wire; the called snapshot replaces the ballots with
     the verdict line. A second pad hears an abstention. */
const { launchBrowser } = require('./rig');
const fs = require('fs');
const http = require('http');
const path = require('path');
const ROOT = '/home/hatch/workspace/gilded-hour';
const SHOTS = ROOT + '/shots';
fs.mkdirSync(SHOTS, { recursive: true });
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

const fetchStub = () => {
  const ok = obj => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(obj) });
  window.fetch = function (u) {
    const url = String(u);
    if (url.indexOf('gilded-hour-rooms') >= 0) return ok({ code: 'TEST', hostToken: 'tok' });
    if (url.indexOf('gilded-hour-sterling') >= 0) return ok({ line: 'LIVE LINE' });
    if (url.indexOf('gilded-hour-nightly') >= 0) return ok({ question: null, intro: null });
    return Promise.reject(new Error('offline in era-online drive'));
  };
};

/* the stubs are SELF-CONTAINED: puppeteer serializes their source */
function hostStub() {
  const ok = obj => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(obj) });
  window.fetch = function (u) {
    const url = String(u);
    if (url.indexOf('gilded-hour-rooms') >= 0) return ok({ code: 'TEST', hostToken: 'tok' });
    if (url.indexOf('gilded-hour-sterling') >= 0) return ok({ line: 'LIVE LINE' });
    if (url.indexOf('gilded-hour-nightly') >= 0) return ok({ question: null, intro: null });
    return Promise.reject(new Error('offline in era-online drive'));
  };
  const PLAYERS = () => ([
    { seat: 0, name: 'Robin', score: window.__scores[0], cutTwo: true, cutCount: 1, dbl: true, connected: true, avatar: 0, streak: 0, vsRound: 0 },
    { seat: 1, name: 'Jules', score: window.__scores[1], cutTwo: true, cutCount: 1, dbl: true, connected: true, avatar: 1, streak: 0, vsRound: 0 },
    null, null
  ]);
  window.__scores = [500, 400];
  window.__era = { open: false, votes: null, called: false, era: null, callMsg: null };
  window.WebSocket = class FakeWS {
    constructor(u) { this.url = u; this.readyState = 1; window.__ws = this; setTimeout(() => { if (this.onopen) this.onopen(); }, 20); }
    deliver(obj) { setTimeout(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) }); }, 30); }
    state(phase, question, lastReveal) {
      const E = window.__era;
      return { t: 'state', state: { code: 'TEST', phase, role: 'host', seat: null, rules: {}, players: PLAYERS(), question: question || null, bet: null, lastReveal: lastReveal || null, pot: 0, intermission: phase === 'intermission' ? { nextRound: 2, wind: [] } : null, report: null, eraVote: E.open || E.called ? { votes: E.votes || {}, called: E.called } : null, era: E.called ? E.era : null } };
    }
    send(data) {
      let m = {}; try { m = JSON.parse(data); } catch (e) {}
      if (m.t === 'hello' && m.role === 'host') {
        this.deliver({ t: 'welcome', role: 'host', code: 'TEST' });
        this.deliver(this.state('lobby', null, null));
      }
      if (m.t === 'bet_phase') {
        this._betQid = m.qid;
        const st = this.state('bet', null, null); st.state.bet = { qid: m.qid, betsIn: 2 }; this.deliver(st);
      }
      if (m.t === 'publish_question') {
        const betted = this._betQid === m.qid; this._betQid = null;
        this._q = { qid: m.qid, round: m.round, kind: m.kind, category: m.category || 'Movies', answersCount: 4, baseValue: m.baseValue || 200, multiplier: 1, headline: false, band: m.band || null, windowMs: m.deadlineMs || 20000, openedAt: Date.now(), deadline: Date.now() + (m.deadlineMs || 20000), betted, decider: false, eligible: null, cut: null, answersIn: 0, dblArmed: [], vsArmed: [] };
        this.deliver(this.state('answer', this._q, null));
      }
      if (m.t === 'reveal' && this._q) {
        const q = this._q;
        const results = [{ seat: 0, correct: true, banked: 100, pick: 1 }, { seat: 1, correct: false, banked: 0, pick: 0 }];
        window.__scores = [window.__scores[0] + 100, window.__scores[1]];
        this.deliver({ t: 'reveal', qid: q.qid, kind: q.kind, headline: false, golden: false, value: 100, results, scores: window.__scores.slice(), quickDrawSeat: null, streakMoment: null, decider: false, eligible: null, pot: 0, potFed: 0, correctIdx: 1 });
        setTimeout(() => this.deliver(this.state('reveal', q, null)), 60);
      }
      if (m.t === 'intermission') {
        this.deliver(this.state('intermission', null, null));
      }
      if (m.t === 'era_open') {
        const E = window.__era; E.open = true; E.votes = {};
        this.deliver(this.state('intermission', null, null));
        /* the pads vote: both for the '90s, arriving as snapshots */
        setTimeout(() => { E.votes = { 0: '90s', 1: '90s' }; this.deliver(this.state('intermission', null, null)); }, 700);
      }
      if (m.t === 'era_call') {
        const E = window.__era; E.callMsg = m; E.called = true; E.era = m.era;
        this.deliver(this.state('intermission', null, null));
      }
    }
    close() { this.readyState = 3; }
  };
}

function padStub(calledEra) {
  const ok = obj => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(obj) });
  window.fetch = function (u) {
    const url = String(u);
    if (url.indexOf('gilded-hour-rooms') >= 0) return ok({ code: 'TEST', hostToken: 'tok' });
    if (url.indexOf('gilded-hour-sterling') >= 0) return ok({ line: 'LIVE LINE' });
    if (url.indexOf('gilded-hour-nightly') >= 0) return ok({ question: null, intro: null });
    return Promise.reject(new Error('offline in era-online drive'));
  };
  window.__sentMsgs = [];
  window.__votes = {};
  window.__called = null; /* null = open, else the called era (or 'ABSTAIN') */
  const PLAYERS = () => ([
    { seat: 0, name: 'Ana', score: 500, cutTwo: true, cutCount: 1, dbl: true, connected: true, avatar: 0, streak: 0, vsRound: 0 },
    { seat: 1, name: 'Bo', score: 400, cutTwo: true, cutCount: 1, dbl: true, connected: true, avatar: 1, streak: 0, vsRound: 0 },
    { seat: 2, name: 'Cy', score: 300, cutTwo: true, cutCount: 1, dbl: true, connected: true, avatar: 2, streak: 0, vsRound: 0 },
    null]);
  window.WebSocket = class FakeWS {
    constructor(u) { this.url = u; this.readyState = 1; window.__ws = this; setTimeout(() => { if (this.onopen) this.onopen(); }, 20); }
    deliver(obj) { setTimeout(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) }); }, 30); }
    state() {
      const called = window.__called !== null;
      return { t: 'state', state: { code: 'TEST', phase: 'intermission', role: 'player', seat: 2, rules: {}, players: PLAYERS(), question: null, bet: null, lastReveal: null, pot: 0, intermission: { nextRound: 2, wind: [] }, report: null, yourPick: null, yourNum: null, eraVote: { votes: window.__votes, called }, era: called ? (window.__called === 'ABSTAIN' ? null : window.__called) : null } };
    }
    send(data) {
      let m = {}; try { m = JSON.parse(data); } catch (e) {}
      window.__sentMsgs.push(m);
      if (m.t === 'hello' && m.role === 'player') {
        this.deliver({ t: 'welcome', role: 'player', code: 'TEST', seat: 2, reclaimToken: 'tok2' });
        this.deliver(this.state());
        if (calledEra !== undefined) { window.__called = calledEra; const self = this; setTimeout(() => self.deliver(self.state()), 400); }
      }
      if (m.t === 'era_vote') {
        window.__votes = { 2: m.era };
        this.deliver(this.state());
      }
    }
    close() { this.readyState = 3; }
  };
  window.__stubEraCall = era => { window.__called = era === null ? 'ABSTAIN' : era; const ws = window.__ws; if (ws) ws.deliver(ws.state()); };
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/index.html';
  const browser = await launchBrowser({ protocolTimeout: 240000 });
  const errors = [];
  const watch = p => {
    p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED/.test(m.text())) errors.push(m.text()); });
    p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  };
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
    let atBreak = false, guard = 0;
    while (guard++ < 300 && !atBreak) {
      const ph = await ogPhase();
      if (ph === 'intermission') { atBreak = true; break; }
      if (ph === 'intro') { await page.tap('#ogRoundGo').catch(() => {}); await sleep(350); continue; }
      if (ph === 'answer') { await page.tap('#ogCallIt').catch(() => {}); await sleep(450); continue; }
      if (ph === 'reveal') { await page.tap('#ogNext').catch(() => {}); await sleep(350); continue; }
      await sleep(250);
    }
    check('H: the stubbed show reaches the first break', atBreak, 'guard=' + guard);
    await sleep(600);
    const breakState = await page.evaluate(() => {
      const OG = window.__online.OG;
      return { scriptLen: OG.script.length, eraOpen: OG.eraOpen, panel: !!document.querySelector('.era-panel'),
        begin: !!document.getElementById('ogBreakGo'), call: !!document.getElementById('ogEraCall'),
        wireOpen: !!window.__era.open };
    });
    check('H: the vote stands at the break — era_open on the wire, panel up, BEGIN held back, and the script still holds only Round 1\u2019s six',
      breakState.eraOpen && breakState.wireOpen && breakState.panel && breakState.call && !breakState.begin && breakState.scriptLen === 6,
      JSON.stringify(breakState));
    /* the pads' ballots land as snapshots; the panel tallies live */
    let tally = null;
    for (let i = 0; i < 40; i++) {
      tally = await page.evaluate(() => {
        const counts = [...document.querySelectorAll('.era-plaque .era-count')].map(e => e.textContent);
        const OG = window.__online.OG;
        return { counts, mirror: OG.eraVotes };
      });
      if (tally.counts[1] === '2') break;
      await sleep(200);
    }
    check('H: the snapshot ballots tally on the host panel — two for the 90s',
      !!tally && tally.counts[1] === '2' && tally.mirror && tally.mirror[0] === '90s' && tally.mirror[1] === '90s',
      JSON.stringify(tally));
    await page.screenshot({ path: SHOTS + '/era-og-panel-land.png' });
    await page.tap('#ogEraCall'); await sleep(600);
    const called = await page.evaluate(() => {
      const OG = window.__online.OG;
      const tail = OG.script.slice(6);
      return { era: OG.era, tailBuilt: OG.tailBuilt, len: OG.script.length,
        msg: window.__era.callMsg,
        tailNormal: tail.filter(e => e.kind === 'normal').map(e => ({ era: e.bank.era, kind: e.bank.kind })),
        bluff: tail.filter(e => e.kind === 'bluff').map(e => ({ round: e.round, golden: !!e.golden })),
        guessTotal: OG.script.filter(e => e.kind === 'num' || e.kind === 'survey').length,
        begin: !!document.getElementById('ogBreakGo'),
        done: (document.querySelector('.era-done') || { textContent: '' }).textContent.replace(/\s+/g, ' ') };
    });
    check('H: CALL IT puts {t:era_call, era:\u201990s\u2019} on the wire and the verdict strip names the 90s',
      !!called.msg && called.msg.era === '90s' && called.era === '90s' && called.done.indexOf("THE '90S") >= 0 && called.begin,
      JSON.stringify({ msg: called.msg, done: called.done }));
    check('H: the deferred deal — the tail is built at the call, the script whole at 15, exactly five guess questions kept',
      called.tailBuilt && called.len === 15 && called.guessTotal === 5, JSON.stringify({ len: called.len, guess: called.guessTotal }));
    check('H: the tail leans — every ordinary card dealt after the vote is a 90s or evergreen card, and the bluff sits ungilded in Round 2',
      called.tailNormal.length >= 3 && called.tailNormal.every(e => e.era === '90s' || e.era === 'any') &&
      called.bluff.length === 1 && called.bluff[0].round === 2 && !called.bluff[0].golden,
      JSON.stringify({ normal: called.tailNormal, bluff: called.bluff }));
    await page.tap('#ogBreakGo'); await sleep(600);
    const r2 = await page.evaluate(() => {
      const OG = window.__online.OG;
      return { phase: OG.phase, idx: OG.idx, stage: document.getElementById('stage').textContent.replace(/\s+/g, ' ') };
    });
    check('H: BEGIN opens Round 2 — the intro stands at the script\u2019s seventh entry under the DOUBLE MONEY banner',
      r2.phase === 'intro' && r2.idx === 6 && r2.stage.indexOf('DOUBLE MONEY') >= 0, JSON.stringify({ phase: r2.phase, idx: r2.idx }));
    await page.close();

    /* ================= PAD — the open vote ================= */
    const pad = await browser.newPage(); watch(pad);
    await pad.evaluateOnNewDocument(padStub, undefined);
    await pad.setViewport({ width: 390, height: 844 });
    await pad.goto(url, { waitUntil: 'load', timeout: 60000 });
    await sleep(500);
    await pad.tap('.mode-tab[data-mode="join"]'); await sleep(150);
    await pad.click('#joinBoxes .code-box');
    await pad.keyboard.type('TEST', { delay: 30 });
    await pad.type('#joinName', 'Cy');
    await pad.tap('#btnJoinRoom');
    await pad.waitForSelector('.jp-era-btn', { timeout: 10000 });
    const ballots = await pad.evaluate(() => [...document.querySelectorAll('.jp-era-btn')].map(b => b.textContent.replace(/\s+/g, ' ')));
    check('P: the pad offers the three era ballots at the break', ballots.length === 3 && /80S/.test(ballots[0]) && /90S/.test(ballots[1]) && /2000S/.test(ballots[2]), JSON.stringify(ballots));
    await pad.tap('.jp-era-btn[data-era="00s"]'); await sleep(500);
    const padVote = await pad.evaluate(() => ({
      sent: window.__sentMsgs.filter(m => m.t === 'era_vote'),
      sel: (document.querySelector('.jp-era-btn[data-era="00s"]') || { className: '' }).className
    }));
    check('P: the tap puts {t:era_vote, era:\u201900s\u2019} on the wire and the snapshot echo lights the pick',
      padVote.sent.length === 1 && padVote.sent[0].era === '00s' && padVote.sel.indexOf('sel') >= 0, JSON.stringify(padVote));
    await pad.screenshot({ path: SHOTS + '/era-pad-ballot-port.png' });
    await pad.evaluate(() => window.__stubEraCall('90s')); await sleep(600);
    const padDone = await pad.evaluate(() => {
      const d = document.querySelector('.jp-era-done');
      return { line: d ? d.textContent.replace(/\s+/g, ' ') : null, ballots: document.querySelectorAll('.jp-era-btn').length };
    });
    check('P: the called snapshot retires the ballots for the verdict — THE ROOM CHOSE THE \u201990S',
      !!padDone.line && padDone.line.indexOf("THE ROOM CHOSE THE '90S") >= 0 && padDone.ballots === 0, JSON.stringify(padDone));
    await pad.close();

    /* ================= PAD — the abstention ================= */
    const pad2 = await browser.newPage(); watch(pad2);
    await pad2.evaluateOnNewDocument(padStub, 'ABSTAIN');
    await pad2.setViewport({ width: 390, height: 844 });
    await pad2.goto(url, { waitUntil: 'load', timeout: 60000 });
    await sleep(500);
    await pad2.tap('.mode-tab[data-mode="join"]'); await sleep(150);
    await pad2.click('#joinBoxes .code-box');
    await pad2.keyboard.type('TEST', { delay: 30 });
    await pad2.type('#joinName', 'Cy');
    await pad2.tap('#btnJoinRoom');
    await pad2.waitForSelector('.jp-era-done', { timeout: 10000 });
    const pad2Line = await pad2.evaluate(() => document.querySelector('.jp-era-done').textContent.replace(/\s+/g, ' '));
    check('P: an abstention reads as itself on the pad — NO VERDICT — THE ROOM ABSTAINED',
      pad2Line.indexOf('NO VERDICT') >= 0 && pad2Line.indexOf('ABSTAINED') >= 0, pad2Line);
    await pad2.close();

    check('no page errors on any page', errors.length === 0, errors.slice(0, 3).join(' ;; '));
  } finally { await browser.close(); server.close(); }
  const fails = results.filter(r => !r.ok).length;
  console.log('DRIVE-ERA-ONLINE DONE — ' + (results.length - fails) + '/' + results.length + ' checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('DRIVE-ERA-ONLINE FAIL:', e.message); process.exit(1); });
