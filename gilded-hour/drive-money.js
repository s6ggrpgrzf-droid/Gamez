/* Money That Flies (The Ten, pass 7) — targeted drive, in its own
   file so the existing drives keep their exact check counts.
   Launch goes through ./rig (the shared resilient launcher): if
   the shell's host-level trap window is closed, the launch throws
   after its own budget and this drive reports the rig as closed —
   no sleeping, no probing around it.
   Part A: the banding itself (__game.money.count) — the counts
   the flights are sized by, asserted at the band edges, monotone,
   and doubling-strict across the realistic range (a Golden twin
   always out-flies its undoubled self); $0 flies nothing.
   Part B (the table, a full show): an in-page census records
   every coin activation — origin, control point, landing,
   progress — from the game's own pool (__fx.coins). Per reveal:
   each banking seat flew exactly count(its score delta), each
   unbanked seat flew none; every coin rides an arc (bezier
   midpoint above the chord) and lands inside its desk; the
   drained small bank flies strictly fewer than the immediate
   Headline bank; an all-miss reveal flies nothing to a desk —
   its coins fly to the Table Pot's vessel, banded by the feed
   (Audit A1: the zero-coins wording predates D1); advancing
   mid-flight leaves zero coins over the next card; after the
   first bank the fortune stack has stepped up and the displayed
   score stands EXACTLY on the settled score.
   Part C (online host, echo-referee stub): the live reveal
   arrives as the room's own {t:'reveal'} message and flies,
   sized by the banked figure; then the socket drops mid-answer
   and the room settles the question during the outage — the
   resync paints that reveal from the snapshot with NO flights.
   Part D (a pad, scripted snapshots): a banked verdict hops its
   coins into the pad's own score line (capped at five), the same
   verdict re-pushed never re-fires, and leaving the reveal
   mid-hop clears the pool.
   Shots: money-1-flight.png (mid-flight), money-2-landing.png
   (the stack stepped up) at 844x390. */
const fs = require('fs');
const http = require('http');
const path = require('path');
const DIR = __dirname;
const SHOTS = path.join(DIR, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const server = http.createServer((req, res) => {
  const f = path.join(DIR, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' });
    res.end(d);
  });
});

let pass = 0, fail = 0; const errors = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}
function watch(pg, tag) {
  pg.on('pageerror', e => { errors.push(tag + ': ' + e.message); console.log('PAGEERROR ' + tag + ': ' + e.message); });
  pg.on('console', m => { if (m.type() === 'error') { errors.push(tag + ': ' + m.text()); console.log('CONSOLE ' + tag + ': ' + m.text()); } });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(pg, fn, timeout, step) {
  const t0 = Date.now();
  while (Date.now() - t0 < (timeout || 20000)) {
    const v = await pg.evaluate(fn).catch(() => null);
    if (v) return v;
    await sleep(step || 200);
  }
  return null;
}

/* the coin census: installed on a page before any reveal can
   land; records every pool activation (a pooled part turning on)
   with its bezier and the desk its landing point falls inside —
   mode 'seats' reads the host pool against the desks, 'vscore'
   reads the pad pool against the pad's own score line */
const CENSUS = (mode) => {
  if (window.__cenOn) return; window.__cenOn = 1;
  window.__cenMode = mode;
  window.__cen = { acts: [] };
  const cur = {}, prev = {};
  const targetOf = (x, y) => {
    if (window.__cenMode === 'vscore') {
      const v = document.querySelector('#jpMain .jp-vscore');
      if (!v) return -2;
      const r = v.getBoundingClientRect();
      return (x >= r.left - 3 && x <= r.right + 3 && y >= r.top - 3 && y <= r.bottom + 3) ? 0 : -1;
    }
    /* Audit A1: the Table Pot's feed flights land on the vessel —
       classify them first (seat -3), before the desk scan, so a
       feed coin is never mistaken for a desk coin */
    const ves = document.querySelector('.pot-vessel');
    if (ves) {
      const vr = ves.getBoundingClientRect();
      if (x >= vr.left && x <= vr.right && y >= vr.top && y <= vr.bottom) return -3;
    }
    let seat = -1;
    document.querySelectorAll('.seat[data-seat]').forEach(s => {
      const r = s.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) seat = +s.getAttribute('data-seat');
    });
    return seat;
  };
  const loop = () => {
    const F = window.__fx;
    const pool = F && (window.__cenMode === 'vscore' ? F.jpCoins : F.coins);
    if (pool) {
      pool.parts.forEach((p, i) => {
        if (p.on && !prev[i]) {
          const rec = { x0: p.x0, y0: p.y0, cx: p.cx, cy: p.cy, x1: p.x1, y1: p.y1, maxT: p.t, seat: targetOf(p.x1, p.y1) };
          window.__cen.acts.push(rec); cur[i] = rec;
        }
        if (p.on && cur[i] && p.t > cur[i].maxT) cur[i].maxT = p.t;
        if (!p.on) delete cur[i];
        prev[i] = p.on;
      });
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.__cenReset = () => { window.__cen.acts = []; };
};
const cenActs = (pg) => pg.evaluate(() => window.__cen.acts.map(a => ({ seat: a.seat, maxT: a.maxT, x0: a.x0, y0: a.y0, cx: a.cx, cy: a.cy, x1: a.x1, y1: a.y1 })));
const arcOK = (a) => {
  const midY = 0.25 * a.y0 + 0.5 * a.cy + 0.25 * a.y1;
  const chordY = (a.y0 + a.y1) / 2;
  return midY < chordY - 15;
};

/* ------- Part C host stub: the room, with a droppable socket ------- */
function hostStubs() {
  window.fetch = function (url) {
    const u = String(url);
    if (u.includes('gilded-hour-rooms') && !u.includes('/room/')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ code: 'TEST', hostToken: 'tok', expiresAt: Date.now() + 7200000 }) });
    return Promise.reject(new Error('offline in money drive'));
  };
  window.__pubs = [];
  let phase = 'lobby', cur = null, pubCount = {}, scores = [0, 0], lastRev = null, liveWs = null;
  const players = () => [
    { seat: 0, name: 'Ana', score: scores[0], cutTwo: true, connected: true, avatar: 0, streak: 0 },
    { seat: 1, name: 'Bo', score: scores[1], cutTwo: true, connected: true, avatar: 1, streak: 0 },
    null, null,
  ];
  const pubQ = () => cur ? { qid: cur.qid, round: cur.round, kind: cur.kind, category: cur.category,
    headline: cur.headline, answersCount: cur.answersCount, baseValue: cur.baseValue,
    multiplier: cur.multiplier, windowMs: cur.windowMs, deadline: cur.deadline, openedAt: cur.openedAt,
    betted: false, decider: false, eligible: null, cut: null, answersIn: 1, band: cur.band } : null;
  const state = (extra) => Object.assign({ code: 'TEST', phase, role: 'host', seat: null, showSeq: 1,
    players: players(), question: pubQ(), bet: null, lastReveal: lastRev, intermission: null,
    yourPick: null, yourNum: null, yourBet: null }, extra || {});
  /* the socket "drops": the client's own close handler fires,
     exactly as a dead network would present it */
  window.__dropSocket = () => { const w = liveWs; liveWs = null; if (w && w.onclose) w.onclose(); };
  /* the room settles the open question while the host is away */
  window.__settleOffline = () => {
    if (!cur || cur.kind !== 'num') return;
    const results = [
      { seat: 0, num: cur.trueNum - 4, correct: true, banked: 200 },
      { seat: 1, num: cur.trueNum + 36, correct: false, banked: 0 },
    ];
    scores[0] += 200;
    lastRev = { qid: cur.qid, kind: cur.kind, headline: cur.headline, golden: false,
      correctIdx: null, trueNum: cur.trueNum, value: 200, results, scores: scores.slice(),
      quickDrawSeat: null, streakMoment: null };
    phase = 'reveal';
  };
  window.WebSocket = class FakeWS {
    constructor(u) { this.url = u; this.readyState = 1; liveWs = this; setTimeout(() => { if (this.onopen) this.onopen(); }, 20); }
    send(data) {
      if (this !== liveWs) return;
      let m = {};
      try { m = JSON.parse(data); } catch (e) {}
      const deliver = (obj, ms) => setTimeout(() => { if (this === liveWs && this.onmessage) this.onmessage({ data: JSON.stringify(obj) }); }, ms == null ? 30 : ms);
      if (m.t === 'hello' && m.role === 'host') {
        deliver({ t: 'welcome', role: 'host', code: 'TEST' });
        deliver({ t: 'state', state: state() });
      } else if (m.t === 'bet_phase') {
        phase = 'bet'; deliver({ t: 'state', state: state({ bet: { qid: m.qid, betsIn: 2 } }) });
      } else if (m.t === 'intermission') {
        phase = 'intermission'; deliver({ t: 'state', state: state({ question: null, intermission: { nextRound: m.nextRound } }) });
      } else if (m.t === 'publish_question') {
        phase = 'answer';
        window.__pubs.push({ qid: m.qid, round: m.round, kind: m.kind });
        pubCount[m.round] = (pubCount[m.round] || 0) + 1;
        const headline = m.round === 2 && pubCount[2] === 6;
        cur = { qid: m.qid, round: m.round, kind: m.kind, category: m.category, headline,
          answersCount: m.kind === 'num' ? 0 : 4, baseValue: m.baseValue || 200,
          multiplier: m.multiplier || 1, windowMs: m.deadlineMs || 20000,
          deadline: Date.now() + (m.deadlineMs || 20000), openedAt: Date.now(),
          band: (m.band === 1 || m.band === 2 || m.band === 3) ? m.band : null };
        if (m.kind !== 'num') cur.correctIdx = m.correctIdx;
        if (m.kind === 'num') cur.trueNum = m.trueNum;
        deliver({ t: 'state', state: state() });
        setTimeout(() => {
          if (window.__holdReveal) return; /* the drop test holds this one */
          phase = 'reveal';
          let results;
          if (m.kind === 'num') {
            results = [
              { seat: 0, num: m.trueNum - 4, correct: true, banked: 200 },
              { seat: 1, num: m.trueNum + 36, correct: false, banked: 0 },
            ];
            scores[0] += 200;
          } else {
            results = [
              { seat: 0, pick: (m.correctIdx + 1) % 4, correct: false, banked: 0 },
              { seat: 1, pick: m.correctIdx, correct: true, banked: 175 },
            ];
            scores[1] += 175;
          }
          lastRev = { qid: m.qid, kind: m.kind, headline, golden: false,
            correctIdx: m.kind === 'num' ? null : m.correctIdx, trueNum: m.kind === 'num' ? m.trueNum : null,
            value: 200, results, scores: scores.slice(), quickDrawSeat: null, streakMoment: null };
          /* the room's LIVE reveal message — the one that flies */
          deliver(Object.assign({ t: 'reveal' }, lastRev));
          deliver({ t: 'state', state: state() });
        }, 800);
      } else if (m.t === 'end_show') {
        phase = 'ended'; cur = null;
        deliver({ t: 'state', state: state({ question: null }) });
      }
    }
    close() { this.readyState = 3; if (this === liveWs) liveWs = null; }
  };
}

/* ------- Part D pad stub: drive-golden's scripted snapshots ------- */
function padStubs(cfg) {
  return (c) => {
    window.fetch = function () { return Promise.reject(new Error('offline in money pad')); };
    let ws = null;
    window.__padPush = (snap) => { if (ws && ws.onmessage) ws.onmessage({ data: JSON.stringify({ t: 'state', state: snap }) }); };
    const players = () => {
      const sc = window.__padScores || [500, 300, 100];
      return [
        { seat: 0, name: 'Ana', score: sc[0], cutTwo: true, connected: true, avatar: 0, streak: 0 },
        { seat: 1, name: 'Bo', score: sc[1], cutTwo: true, connected: true, avatar: 1, streak: 0 },
        { seat: 2, name: 'Cy', score: sc[2], cutTwo: true, connected: true, avatar: 2, streak: 0 },
        null,
      ];
    };
    window.__padSnap = (phase, question, lastReveal) => ({ code: 'TEST', phase, role: 'player', seat: c.seat,
      showSeq: 1, players: players(), question: question || null, bet: null, intermission: null,
      lastReveal: lastReveal || null,
      yourNum: c.yourNum != null ? c.yourNum : null, yourPick: c.yourPick != null ? c.yourPick : null, yourBet: null });
    window.WebSocket = class FakeWS {
      constructor(u) { this.url = u; this.readyState = 1; ws = this; setTimeout(() => { if (this.onopen) this.onopen(); }, 20); }
      send(data) {
        let m = {};
        try { m = JSON.parse(data); } catch (e) {}
        const deliver = (obj, ms) => setTimeout(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) }); }, ms == null ? 30 : ms);
        if (m.t === 'hello' && m.role === 'player') {
          deliver({ t: 'welcome', role: 'player', code: 'TEST', seat: c.seat, reclaimToken: 'tok' + c.seat });
          deliver({ t: 'state', state: window.__padSnap('answer', c.question, null) });
        }
      }
      close() { this.readyState = 3; }
    };
  };
}

(async () => {
  let browser;
  try { browser = await require('./rig').launchBrowser(); }
  catch (e) {
    console.log('RIG CLOSED | ' + e.message);
    console.log('drive-money: 0 checks run — the browser never launched.');
    process.exit(2);
  }
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const httpUrl = 'http://127.0.0.1:' + port + '/index.html';
  const fileUrl = 'file://' + path.join(DIR, 'index.html');

  /* ================= Part A: the banding ================= */
  {
    const page = await browser.newPage(); watch(page, 'A');
    await page.setViewport({ width: 844, height: 390 });
    await page.goto(fileUrl, { waitUntil: 'load', timeout: 60000 });
    await sleep(500);
    const r = await page.evaluate(() => {
      const C = window.__game.money.count;
      const edges = [[-50], [0], [1], [50], [90], [91], [180], [181], [360], [361], [720], [721], [2000]]
        .map(([x]) => [x, C(x)]);
      const doubles = [50, 90, 100, 180, 200, 360, 400].map(x => [x, C(x), C(2 * x)]);
      const sweep = []; for (let x = 0; x <= 1500; x += 10) sweep.push(C(x));
      return { edges, doubles, sweep };
    });
    const E = Object.fromEntries(r.edges);
    check('A: $0 (and less) flies nothing; the smallest bank flies 3; the largest flies 9',
      E[-50] === 0 && E[0] === 0 && E[1] === 3 && E[50] === 3 && E[90] === 3 && E[721] === 9 && E[2000] === 9,
      JSON.stringify(E));
    check('A: the band edges are exact (90 / 180 / 360 / 720)',
      E[91] === 4 && E[180] === 4 && E[181] === 6 && E[360] === 6 && E[361] === 8 && E[720] === 8,
      JSON.stringify(E));
    check('A: doubling ALWAYS out-flies the undoubled twin across the realistic range',
      r.doubles.every(([x, a, b]) => b > a), JSON.stringify(r.doubles));
    check('A: the count never decreases as the award grows',
      r.sweep.every((v, i) => i === 0 || v >= r.sweep[i - 1]), '');
    await page.close();
  }

  /* ================= Part B: the table ================= */
  let shotFlight = false, shotLanding = false;
  const samples = [];   // every fully-observed reveal: {key, type, gains, expect, acts}
  let small = null, big = null, missSample = null;
  {
    const page = await browser.newPage(); watch(page, 'B');
    await page.goto('about:blank');
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
    await page.setViewport({ width: 844, height: 390 });
    await page.goto(fileUrl, { waitUntil: 'load', timeout: 60000 });
    await sleep(500);
    await page.evaluate(CENSUS, 'seats');
    const S = () => page.evaluate(() => {
      const G = window.__game.G;
      if (!G) return null;
      return { phase: G.phase, round: G.round, qi: G.qInRound, kind: G.cur ? G.cur.kind : null,
        scores: G.players.map(p => p.score) };
    });
    await page.tap('#btnStart');
    await page.waitForSelector('#btnRoundGo', { timeout: 10000 });
    let plan = null, curQ = '', scoresPre = null, fortunePre = null;
    let betsSet = false, missDone = false, midDone = false, done = false, guard = 0;

    while (guard++ < 1600 && !done) {
      const s = await S().catch(() => null);
      if (!s) { await sleep(150); continue; }
      if (s.phase === 'coldopen' || s.phase === 'spin') { await sleep(250); continue; }
      if (s.phase === 'intro') { await page.tap('#btnRoundGo').catch(() => {}); await sleep(300); continue; }
      if (s.phase === 'intermission') { await page.tap('#btnBreakGo').catch(() => {}); await sleep(300); continue; }
      if (s.phase === 'bet') {
        if (!betsSet) {
          await page.tap('[data-bet="0|1"]').catch(() => {}); await sleep(150);
          await page.tap('[data-bet="0|1"]').catch(() => {}); await sleep(150);
          betsSet = true;
        }
        await page.tap('#btnBetsDone').catch(() => {}); await sleep(300); continue;
      }
      if (s.phase === 'question') {
        const key = s.round + ':' + s.qi;
        if (key !== curQ) {
          curQ = key;
          await page.evaluate(() => window.__cenReset && window.__cenReset());
          if (s.round === 1 && s.qi === 0) plan = { type: 'small', marks: [0] };
          else if (s.round === 2 && s.qi === 5) plan = { type: 'big', marks: [0] };
          else if (!missDone && s.kind === 'mcq') plan = { type: 'miss', marks: [] };
          else if (!midDone && s.kind === 'mcq' && s.round === 1) plan = { type: 'mid', marks: [0] };
          else plan = { type: 'plain', marks: [0] };
          plan.key = key; plan.done = false; plan.marked = false;
          /* THE BLUFF (pass 2): the slot opens on the invent stage —
             deal the answers (blanks are dealt decoys) so the show
             can reach its CALL IT like any other question */
          if (s.kind === 'bluff') { await page.tap('#btnDealBluff').catch(() => {}); await sleep(500); }
          if (plan.type === 'small') {
            /* drain the clock to its floor before calling it —
               the small bank of the pair */
            for (let w = 0; w < 140; w++) {
              const st = await page.evaluate(() => ({ left: window.__game.clock.left, ph: window.__game.G && window.__game.G.phase })).catch(() => null);
              if (!st || st.ph !== 'question' || st.left <= 2.2) break;
              await sleep(160);
            }
          } else await sleep(350);
          const still = await page.evaluate(() => window.__game.G && window.__game.G.phase).catch(() => null);
          if (still === 'question') { await page.tap('#btnCallIt').catch(() => {}); await sleep(250); }
        }
        await sleep(150); continue;
      }
      if (s.phase === 'vote-count') { await sleep(200); continue; }
      if (s.phase === 'vote') {
        if (plan && !plan.marked) {
          plan.marked = true;
          scoresPre = s.scores.slice();
          if (plan.type === 'small') {
            fortunePre = await page.evaluate(() => {
              const f = document.querySelector('.seat[data-seat="0"] .fstk.b');
              return f ? parseFloat(f.style.height) || 0 : null;
            });
          }
          if (s.kind === 'bluff' && plan.marks.length) {
            /* the bluff's mark screen: select the truth plaque
               before tapping the seats that picked it */
            const truthIx = await page.evaluate(() => {
              const c = window.__game.G.cur;
              return c && c.opts ? c.opts.findIndex(o => o.ok) : -1;
            }).catch(() => -1);
            if (truthIx >= 0) { await page.tap('.bluff-pick[data-opt="' + truthIx + '"]').catch(() => {}); await sleep(180); }
          }
          for (const seat of plan.marks) { await page.tap('.seat[data-seat="' + seat + '"]').catch(() => {}); await sleep(180); }
          await page.tap('#btnReveal').catch(() => {});
        }
        await sleep(200); continue;
      }
      if (s.phase === 'reveal') {
        if (plan && !plan.done) {
          plan.done = true;
          if (plan.type === 'mid') {
            let flew = false;
            for (let w = 0; w < 60; w++) {
              const st = await page.evaluate(() => ({ n: window.__cen.acts.length, on: window.__fx.coins.parts.some(p => p.on) })).catch(() => null);
              if (st && st.n > 0 && st.on) { flew = true; break; }
              await sleep(40);
            }
            await page.tap('#btnNext').catch(() => {});
            await sleep(700);
            const after = await page.evaluate(() => ({
              on: window.__fx.coins.parts.filter(p => p.on).length,
              canvasOn: document.getElementById('coinCanvas').classList.contains('on'),
              phase: window.__game.G.phase,
            })).catch(() => null);
            check('B: advancing mid-flight clears every coin — none drift over the next card',
              flew && !!after && after.on === 0 && !after.canvasOn && after.phase !== 'reveal',
              JSON.stringify({ flew, after }));
            midDone = true;
          } else {
            let obs = null;
            for (let w = 0; w < 46; w++) {
              obs = await page.evaluate(() => ({
                acts: window.__cen.acts.map(a => ({ seat: a.seat, maxT: a.maxT, x0: a.x0, y0: a.y0, cx: a.cx, cy: a.cy, x1: a.x1, y1: a.y1 })),
                on: window.__fx.coins.parts.filter(p => p.on).length,
                flying: window.__fx.coins.parts.filter(p => p.on && p.t > 0.04 && p.t < 0.96).length,
                /* Pass #2 (2026-11-12): a live reveal is STAGED — its
                   flights are the settlement beat and cannot start
                   until beat 2. The census must not close a sample
                   while the reveal is still in its answer beat:
                   staged = the staging state is live and beat 3
                   (Sterling) has not arrived. The invariant below
                   is unchanged — every bank still flies exactly its
                   band; only the observation window learned the
                   new choreography (the drive-report precedent). */
                staged: (() => { const g = document.getElementById('scr-game'); return !!(g && g.classList.contains('rv-live') && g.getAttribute('data-rvbeat') !== '3'); })(),
              })).catch(() => null);
              if (obs && !shotFlight && obs.flying >= 4) {
                shotFlight = true;
                await page.screenshot({ path: path.join(SHOTS, 'money-1-flight.png') }).catch(() => {});
              }
              if (obs && w > 14 && obs.on === 0 && !obs.staged) break;
              await sleep(70);
            }
            const sNow = await S();
            const gains = sNow.scores.map((v, i) => v - (scoresPre ? scoresPre[i] : 0));
            const expect = await page.evaluate((g) => g.map(x => window.__game.money.count(x)), gains);
            /* Audit A1: the question's own pot-feed record rides
               the sample — the feed's flight is part of the census
               since D1, banded by the same coinsForAward */
            const potFed = await page.evaluate(() => (window.__game.G && window.__game.G.cur && window.__game.G.cur.potFed) || 0);
            const expectPot = await page.evaluate((f) => window.__game.money.count(f), potFed);
            const sample = { key: plan.key, type: plan.type, gains, expect, potFed, expectPot, acts: obs ? obs.acts : [] };
            samples.push(sample);
            if (plan.type === 'small') {
              small = sample;
              await sleep(1100);
              const post = await page.evaluate(() => {
                const G = window.__game.G;
                const f = document.querySelector('.seat[data-seat="0"] .fstk.b');
                const texts = G.players.map((p, i) => {
                  const el = document.querySelector('.seat[data-seat="' + i + '"] .seat-score');
                  return el ? parseInt(el.textContent.replace(/[^0-9]/g, ''), 10) : null;
                });
                return { stack: f ? parseFloat(f.style.height) || 0 : null, texts,
                  scores: G.players.map(p => p.score) };
              });
              check('B: as the coins land the stack steps up (fortune height grows off zero)',
                fortunePre === 0 && post.stack != null && post.stack > 0,
                'before=' + fortunePre + ' after=' + post.stack);
              check('B: the displayed score finishes EXACTLY on the settled score at every desk',
                post.texts.every((t, i) => t === post.scores[i]),
                'texts=' + JSON.stringify(post.texts) + ' scores=' + JSON.stringify(post.scores));
            }
            if (plan.type === 'big') {
              big = sample;
              if (!shotLanding) {
                await sleep(500);
                shotLanding = true;
                await page.screenshot({ path: path.join(SHOTS, 'money-2-landing.png') }).catch(() => {});
              }
            }
            if (plan.type === 'miss') { missSample = sample; missDone = true; }
          }
        }
        const b = await page.$('#btnNext'); if (b) { await b.tap().catch(() => {}); await sleep(250); }
        continue;
      }
      if (s.phase === 'over') { done = true; break; }
      await sleep(200);
    }
    check('B: the show played through to its finale', done, 'guard=' + guard);
    check('B: the mid-flight advance test actually ran', midDone, '');
    /* the whole-show invariant: per reveal, per seat — the census
       count IS the band of the seat's score delta */
    let invBad = [];
    samples.forEach(sm => {
      sm.gains.forEach((g, seat) => {
        const n = sm.acts.filter(a => a.seat === seat).length;
        if (n !== sm.expect[seat]) invBad.push(sm.key + ' seat' + seat + ': flew ' + n + ', band(' + g + ')=' + sm.expect[seat]);
      });
      /* Audit A1: the pot feed is a flight too — banded by the
         feed, landing on the vessel (census seat -3); a coin
         outside every desk AND the vessel is still a violation */
      const nPot = sm.acts.filter(a => a.seat === -3).length;
      if (nPot !== (sm.expectPot || 0)) invBad.push(sm.key + ' pot: flew ' + nPot + ', band(feed ' + (sm.potFed || 0) + ')=' + (sm.expectPot || 0));
      sm.acts.forEach(a => { if (a.seat === -1) invBad.push(sm.key + ': a coin landed outside every desk and the vessel'); });
    });
    check('B: every banking seat flew exactly its banded count, every unbanked seat flew none, and every pot feed flew its band to the vessel — the whole show',
      samples.length >= 12 && invBad.length === 0,
      'reveals=' + samples.length + (invBad.length ? ' BAD: ' + invBad.slice(0, 3).join(' ; ') : ''));
    const allActs = samples.reduce((acc, sm) => acc.concat(sm.acts), []);
    check('B: every sampled coin rides a true arc (bezier midpoint above the chord) and lands (t reaches 1)',
      allActs.length > 0 && allActs.every(a => arcOK(a) && a.maxT >= 0.999),
      'coins=' + allActs.length);
    check('B: the drained small bank flies strictly fewer coins than the immediate Headline bank',
      !!small && !!big && big.acts.filter(a => a.seat === 0).length > small.acts.filter(a => a.seat === 0).length &&
      small.acts.filter(a => a.seat === 0).length === small.expect[0] && big.acts.filter(a => a.seat === 0).length === big.expect[0],
      small && big ? 'small: gain ' + small.gains[0] + ' → ' + small.acts.filter(a => a.seat === 0).length +
        ' coins; headline: gain ' + big.gains[0] + ' → ' + big.acts.filter(a => a.seat === 0).length + ' coins' : 'pair never completed');
    /* Audit A1: this check predates the Table Pot — an all-miss
       reveal now flies its feed to the vessel (D1). The desk side
       of the old assertion stands (no seat flies a coin); the
       flight itself is asserted against the feed's band */
    check('B: an all-miss reveal flies nothing to any desk — its coins fly to the pot, banded by the feed',
      !!missSample && missSample.gains.every(g => g === 0) &&
      missSample.acts.filter(a => a.seat >= 0).length === 0 &&
      (missSample.potFed || 0) > 0 &&
      missSample.acts.filter(a => a.seat === -3).length === (missSample.expectPot || 0),
      missSample ? 'potFed=' + missSample.potFed + ' potCoins=' + missSample.acts.filter(a => a.seat === -3).length +
        ' deskCoins=' + missSample.acts.filter(a => a.seat >= 0).length + ' gains=' + JSON.stringify(missSample.gains) : 'no miss played');
    await page.close();
  }

  /* ================= Part C: the online host ================= */
  {
    const host = await browser.newPage(); watch(host, 'C-host');
    await host.evaluateOnNewDocument(hostStubs);
    await host.setViewport({ width: 844, height: 390 });
    await host.goto(httpUrl, { waitUntil: 'load', timeout: 60000 });
    await sleep(600);
    await host.evaluate(CENSUS, 'seats');
    await host.tap('.mode-tab[data-mode="host"]'); await sleep(200);
    await host.tap('#btnCreateRoom');
    const lobby = await waitFor(host, () => {
      const OG = window.__online && window.__online.OG;
      return OG && OG.phase === 'lobby' && OG.players.filter(Boolean).length >= 2 ? true : null;
    }, 15000);
    check('C: online lobby up with both scripted players', !!lobby);
    await host.tap('#ogStart');
    const tapOnceC = (() => { const last = {}; return async (sel) => {
      const now = Date.now(); if (last[sel] && now - last[sel] < 900) return; last[sel] = now;
      await host.tap(sel).catch(() => {});
    }; })();
    /* leg 1: the first live reveal (an MCQ — the stub banks Bo 175) */
    let liveSample = null, lastQid = null;
    for (let i = 0; i < 500 && !liveSample; i++) {
      const s = await host.evaluate(() => {
        const OG = window.__online && window.__online.OG;
        return OG ? { phase: OG.phase, qid: OG.cur ? OG.cur.qid : null, kind: OG.cur ? OG.cur.kind : null } : null;
      }).catch(() => null);
      if (!s) { await sleep(120); continue; }
      if (s.phase === 'answer' && s.qid !== lastQid) {
        lastQid = s.qid;
        await host.evaluate(() => window.__cenReset && window.__cenReset());
      }
      if (s.phase === 'reveal') {
        let obs = null;
        for (let w = 0; w < 40; w++) {
          obs = await host.evaluate(() => ({
            acts: window.__cen.acts.map(a => ({ seat: a.seat, maxT: a.maxT, x0: a.x0, y0: a.y0, cx: a.cx, cy: a.cy, x1: a.x1, y1: a.y1 })),
            on: window.__fx.coins.parts.filter(p => p.on).length,
          })).catch(() => null);
          if (obs && w > 12 && obs.on === 0) break;
          await sleep(70);
        }
        liveSample = { kind: s.kind, acts: obs ? obs.acts : [] };
        break;
      }
      if (s.phase === 'intro') await tapOnceC('#ogRoundGo');
      else if (s.phase === 'bet') await tapOnceC('#ogBetsGo');
      else if (s.phase === 'intermission') await tapOnceC('#ogBreakGo');
      await sleep(100);
    }
    const liveExpect = await host.evaluate(() => window.__game.money.count(175));
    check('C: the online host\'s live reveal flies — Bo\'s $175 bank arcs to Bo\'s desk in its banded count',
      !!liveSample && liveSample.acts.length === liveExpect && liveSample.acts.every(a => a.seat === 1 && arcOK(a)),
      liveSample ? 'kind=' + liveSample.kind + ' acts=' + liveSample.acts.length + ' expect=' + liveExpect : 'no reveal observed');
    /* leg 2: the socket drops mid-answer on the number question;
       the room settles it during the outage; the resync repaints
       the reveal from the snapshot — coinless */
    let resync = null;
    await host.evaluate(() => { window.__holdReveal = false; });
    for (let i = 0; i < 200 && !resync; i++) {
      const s = await host.evaluate(() => {
        const OG = window.__online && window.__online.OG;
        return OG ? { phase: OG.phase, kind: OG.cur ? OG.cur.kind : null } : null;
      }).catch(() => null);
      if (!s) { await sleep(100); continue; }
      if (s.phase === 'reveal') { await tapOnceC('#ogNext'); await sleep(150); continue; }
      if (s.phase === 'answer' && s.kind === 'num') {
        await host.evaluate(() => {
          window.__holdReveal = true;
          window.__cenReset && window.__cenReset();
          window.__dropSocket();
          window.__settleOffline();
        });
        const landed = await waitFor(host, () => {
          const OG = window.__online && window.__online.OG;
          return OG && OG.phase === 'reveal' ? true : null;
        }, 20000, 200);
        await sleep(1800);
        const after = await host.evaluate(() => ({
          acts: window.__cen.acts.length,
          on: window.__fx.coins.parts.filter(p => p.on).length,
          next: !!document.getElementById('ogNext'),
        })).catch(() => null);
        resync = { landed: !!landed, after };
        break;
      }
      if (s.phase === 'intro') await tapOnceC('#ogRoundGo');
      else if (s.phase === 'bet') await tapOnceC('#ogBetsGo');
      else if (s.phase === 'intermission') await tapOnceC('#ogBreakGo');
      await sleep(100);
    }
    check('C: a reveal that lands by snapshot resync paints coinless — no flights on a repaint',
      !!resync && resync.landed && !!resync.after && resync.after.acts === 0 && resync.after.on === 0 && resync.after.next === true,
      JSON.stringify(resync));
    await host.close();
  }

  /* ================= Part D: the pad ================= */
  {
    const q10 = { qid: 'q1.10.zz', round: 1, kind: 'normal', category: 'Movies', answersCount: 4,
      baseValue: 200, multiplier: 1, headline: false, band: 3, windowMs: 30000,
      openedAt: Date.now(), deadline: Date.now() + 30000, betted: false, decider: false,
      eligible: null, cut: null, answersIn: 1 };
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage(); watch(p, 'D-pad');
    await p.evaluateOnNewDocument(padStubs({ seat: 0, question: q10 }), { seat: 0, question: q10 });
    await p.setViewport({ width: 390, height: 844 });
    await p.goto(httpUrl, { waitUntil: 'load', timeout: 60000 });
    await sleep(400);
    await p.evaluate(CENSUS, 'vscore');
    await p.tap('.mode-tab[data-mode="join"]'); await sleep(150);
    await p.click('#joinBoxes .code-box');
    await p.keyboard.type('TEST', { delay: 30 });
    await p.type('#joinName', 'Ana');
    await p.evaluate(() => { const g = document.querySelectorAll('#jpAvaGrid .jp-ava'); if (g[0]) g[0].click(); });
    await p.tap('#btnJoinRoom');
    const joined = await waitFor(p, () => document.querySelector('#jpMain .jp-ans, #jpMain .jp-num') ? true : null, 15000, 150);
    check('D: the pad is in the room on its question', !!joined);
    const ci = await p.evaluate(() => {
      const bank = window.__game.BANK[10];
      const btns = Array.from(document.querySelectorAll('#jpMain .jp-ans .jp-ans-tx'));
      return btns.findIndex(b => b.textContent === bank.a);
    });
    /* the banked verdict: Ana banks $350 — the hop is capped at 5 */
    const pushReveal = (qid, banked, total, ciX) => p.evaluate((qq, bk, tt, cx2) => {
      window.__padScores = [tt, 300, 100];
      const lr = { qid: qq, kind: 'normal', headline: false, golden: false, correctIdx: cx2, trueNum: null, value: bk,
        results: [
          { seat: 0, pick: cx2, correct: true, banked: bk },
          { seat: 1, pick: (cx2 + 1) % 4, correct: false, banked: 0 },
          { seat: 2, pick: (cx2 + 1) % 4, correct: false, banked: 0 },
        ], scores: [tt, 300, 100], quickDrawSeat: null, streakMoment: null };
      const q = { qid: qq, round: 1, kind: 'normal', category: 'Movies', answersCount: 4,
        baseValue: 200, multiplier: 1, headline: false, band: 3, windowMs: 30000,
        openedAt: Date.now(), deadline: Date.now() + 30000, betted: false, decider: false,
        eligible: null, cut: null, answersIn: 3 };
      window.__padPush(window.__padSnap('reveal', q, lr));
    }, qid, banked, total, ciX);
    await pushReveal('q1.10.zz', 350, 850, ci);
    let hopActs = null;
    for (let w = 0; w < 30; w++) {
      hopActs = await cenActs(p).catch(() => null);
      if (hopActs && hopActs.length >= 5) break;
      await sleep(80);
    }
    const hopExpect = await p.evaluate(() => Math.min(window.__game.money.count(350), 5));
    const vscoreTxt = await p.evaluate(() => { const v = document.querySelector('#jpMain .jp-vscore'); return v ? v.textContent : ''; });
    check('D: the pad\'s banked verdict hops its coins into its own score line (banded, capped at five)',
      !!hopActs && hopActs.length === hopExpect && hopActs.every(a => a.seat === 0) && /850/.test(vscoreTxt),
      'acts=' + (hopActs && hopActs.length) + ' expect=' + hopExpect + ' score line: ' + vscoreTxt.trim());
    /* the same verdict re-pushed (a snapshot resync) never re-fires */
    await sleep(1200); /* let the hop finish */
    await p.evaluate(() => window.__cenReset && window.__cenReset());
    await pushReveal('q1.10.zz', 350, 850, ci);
    await sleep(900);
    const refired = await p.evaluate(() => ({ n: window.__cen.acts.length, on: window.__fx.jpCoins.parts.filter(x => x.on).length })).catch(() => null);
    check('D: the same verdict re-pushed fires nothing — the hop is keyed, not repainted',
      !!refired && refired.n === 0 && refired.on === 0, JSON.stringify(refired));
    /* a second bank, then the pad leaves the reveal mid-hop:
       the pool clears with the card */
    await p.evaluate(() => window.__cenReset && window.__cenReset());
    await pushReveal('q1.10.yy', 200, 1050, ci);
    let airborne = false;
    for (let w = 0; w < 25; w++) {
      const st = await p.evaluate(() => window.__fx.jpCoins.parts.some(x => x.on)).catch(() => false);
      if (st) { airborne = true; break; }
      await sleep(50);
    }
    await p.evaluate(() => {
      const q = { qid: 'q1.12.zz', round: 1, kind: 'normal', category: 'Movies', answersCount: 4,
        baseValue: 200, multiplier: 1, headline: false, band: 2, windowMs: 30000,
        openedAt: Date.now(), deadline: Date.now() + 30000, betted: false, decider: false,
        eligible: null, cut: null, answersIn: 0 };
      window.__padPush(window.__padSnap('answer', q, null));
    });
    await sleep(400);
    const cleared = await p.evaluate(() => window.__fx.jpCoins.parts.filter(x => x.on).length).catch(() => null);
    check('D: leaving the reveal mid-hop clears the pad\'s pool — no orphan coins on the next card',
      airborne && cleared === 0, 'airborne=' + airborne + ' still on=' + cleared);
    await ctx.close();
  }

  check('evidence: money-1-flight.png captured mid-flight', shotFlight && fs.existsSync(path.join(SHOTS, 'money-1-flight.png')));
  check('evidence: money-2-landing.png captured at the landing', shotLanding && fs.existsSync(path.join(SHOTS, 'money-2-landing.png')));
  check('zero console/page errors across all parts', errors.length === 0, errors.slice(0, 3).join(' ;; '));
  console.log('drive-money: ' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('DRIVE ERROR: ' + (e && e.stack || e)); process.exit(1); });
