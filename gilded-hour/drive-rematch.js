/* Programme pass 4 — Rematch Night: the targeted drive, in its own
   file so the existing drives keep their exact check counts.
   TABLE (one page, one long night in sequence):
     show 1 (Alexandria wins) -> the finale's gold button reads
       REMATCH, no series line yet (one show is not a night), the
       series store holds exactly that show under the cast's key;
     tap REMATCH -> show 2 deals immediately (no setup screen, no
       title), same names, same table avatars, and the Round 1
       intro speaks the series line: the score + "First to three
       takes the night.";
     show 2 (Bartholomew wins) -> the finale carries ON THE NIGHT;
       refresh AT that finale -> series and records byte-identical;
     show 3 started fresh from the title with the identical cast
       still counts (the series is a fact about the night, not
       about the button): its opening calls the decider of the
       night; Alexandria wins -> 2-1;
     show 4 via REMATCH opens on match point ("plays for the
       night"); Alexandria wins -> the finale line is TAKES THE
       NIGHT and Sterling's winner beat is a winnernight line;
     show 5 opens acknowledging the taken night; END SHOW mid-show
       -> the series does not move;
     a changed cast (Zelda for Cassandra) starts a fresh series:
       standard opening, and the completed show replaces the store.
   ONLINE HOST (stubbed room): a full show, then REMATCH — the
     host sends {t:'new_show'} and NO new room is created; show 2
     opens on the series line; its finale carries ON THE NIGHT;
     show 3 opens on the decider framing.
   PADS (stubbed snapshots): the ended screen flips to a lobby
     wearing REMATCH — SHOW 2 when the room's counter advances,
     with no rejoin and no code; then the pad takes show 2's first
     question like any other.
   ONE LEFT (stubbed room): a rematch tapped with ONE player
     still connected deals that player a new show — the cast is
     the one who remains, a fresh series under their name alone
     (the 1–4 ruling, 2026-11-17: online has no two-player floor).
   SCATTERED (stubbed room): a rematch tapped with NO player
     still connected returns the host to the room's lobby with
     Sterling's explanation (and the new_show was still sent).
   DROPPED (stubbed room, three players): Cy disconnects after
     show 1; the rematch proceeds with the two who remain — a
     changed cast, so show 2 opens WITHOUT a series line and its
     completion starts a fresh series under the two-name key. */
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
  const readSeries = p => p.evaluate(() => { try { return JSON.parse(localStorage.getItem('gh_series_v1') || 'null'); } catch (e) { return null; } });
  const readRec = p => p.evaluate(() => { try { return JSON.parse(localStorage.getItem('gh_records_v1') || 'null'); } catch (e) { return null; } });
  const hostLine = p => p.evaluate(() => document.getElementById('hostLine').textContent);
  const seriesLineEl = p => p.evaluate(() => { const e = document.querySelector('.series-line'); return e ? e.textContent : null; });

  /* ================= TABLE ================= */
  const page = await browser.newPage();
  watch(page);
  /* (Pass 5 re-pin: this page used to seed gh_table_avatars [5,2,7]
     and read p.avatar back. The Face Pass retired player avatars
     outright — a seat's identity is now its brass initial
     medallion — so cast identity is checked by name and by the
     medallion initials the desks actually wear) */
  const medallions = p => p.evaluate(() => Array.from(document.querySelectorAll('.seat .medallion text')).map(t => t.textContent));
  await page.setViewport({ width: 844, height: 390 });
  await page.goto('file://' + ROOT + '/index.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(600);
  const S = () => page.evaluate(() => {
    const g = window.__game.G;
    if (!g) return null;
    return {
      phase: g.phase, round: g.round, qInRound: g.qInRound, showId: g.showId,
      scores: g.players.map(p => p.score),
      names: g.players.map(p => p.name),
      kind: g.cur ? g.cur.kind : null,
      bluffDealt: g.cur ? !!g.cur.bluffDealt : false,
      truth: g.cur && g.cur.q ? g.cur.q.num : null,
      picks: g.cur ? (g.cur.picks || null) : null,
      bluffPicks: g.cur ? (g.cur.bluffPicks || null) : null,
      guessTurn: g.cur ? g.cur.guessTurn : null,
      opts: g.cur && g.cur.opts ? g.cur.opts.map(o => ({ ok: !!o.ok, gone: !!o.gone, by: o.by != null ? o.by : -1 })) : null,
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
  /* the records drive's show player: one seat answers everything
     right, and after the first reveal the script jumps to Round 3's
     tail. (Pass 5 repair, no-host flow: there is no CALL IT and no
     mark screen — answers happen on the desks during the question
     and Sterling's clock settles.) */
  async function playQuestion(s, opts, actedQ) {
    if (s.kind === 'num') {
      let guardN = 0;
      while (guardN++ < 12) {
        const st = await S();
        if (!st || st.phase !== 'question' || st.guessTurn == null || st.guessTurn < 0) break;
        const seat = st.guessTurn;
        const target = seat === opts.winSeat ? st.truth : st.truth + 400 + seat * 137;
        for (const ch of String(target)) { await page.tap('[data-numk="' + ch + '"]'); await sleep(60); }
        await page.tap('#btnNumLock'); await sleep(250);
      }
      return actedQ;
    }
    if (s.kind === 'bluff' && !s.bluffDealt) { await page.tap('#btnDealBluff'); await sleep(500); return actedQ; }
    const qkey = s.round + ':' + s.qInRound;
    if (actedQ === qkey) return actedQ;
    const okIx = s.opts ? s.opts.findIndex(o => o.ok) : -1;
    for (let seat = 0; seat < 3; seat++) {
      let oi;
      if (seat === opts.winSeat) oi = okIx;
      else oi = s.opts ? s.opts.findIndex((o, ix) => !o.ok && !o.gone && o.by !== seat) : -1;
      if (oi < 0) continue;
      for (let attempt = 0; attempt < 3; attempt++) {
        await page.tap('[data-pick="' + seat + '|' + oi + '"]'); await sleep(200);
        const st = await S();
        if (!st || st.phase !== 'question') break;
        const rec = s.kind === 'bluff' ? (st.bluffPicks && st.bluffPicks[seat]) : (st.picks && st.picks[seat] && st.picks[seat].opt);
        if (rec === oi || (s.kind !== 'bluff' && rec != null && +rec === oi)) break;
      }
    }
    return qkey;
  }
  async function tapNext() {
    for (let i = 0; i < 40; i++) {
      const s = await S();
      if (!s || s.phase !== 'reveal') return;
      const b = await page.$('#btnNext');
      if (b) { await b.tap().catch(() => {}); return; }
      await sleep(250);
    }
  }
  async function playShow(opts) {
    let jumped = false, guard = 0, actedQ = null;
    while (guard++ < 700) {
      const s = await S();
      if (!s) throw new Error('game state lost');
      if (s.phase === 'over') return s;
      if (s.phase === 'coldopen' || s.phase === 'spin' || s.phase === 'vote-count') { await sleep(160); continue; }
      if (s.phase === 'intro') { await page.tap('#btnRoundGo'); await sleep(220); continue; }
      if (s.phase === 'intermission') { await page.tap('#btnBreakGo'); await sleep(220); continue; }
      if (s.phase === 'bet') { await page.tap('#btnBetsDone'); await sleep(220); continue; }
      if (s.phase === 'question') { actedQ = await playQuestion(s, opts, actedQ); await sleep(150); continue; }
      if (s.phase === 'vote') { await sleep(200); continue; }
      if (s.phase === 'reveal') {
        if (opts.jump && !jumped && s.round === 1 && s.qInRound === 0) {
          await page.evaluate(() => { const g = window.__game.G; g.round = 3; g.qInRound = 1; });
          jumped = true;
        }
        await tapNext(); await sleep(220); continue;
      }
      await sleep(160);
    }
    throw new Error('show did not finish');
  }
  const finaleFit = () => page.evaluate(() => { const e = document.getElementById('stage'); return { client: e.clientHeight, scroll: e.scrollHeight }; });
  const NAMES = ['Alexandria', 'Bartholomew', 'Cassandra'];
  const CAST_KEY = 'alexandria|bartholomew|cassandra';

  /* ---- show 1: Alexandria wins ---- */
  await page.evaluate((n) => window.__game.startShow(n), NAMES);
  await page.waitForSelector('#btnRoundGo', { timeout: 10000 });
  const id1 = (await S()).showId;
  const med1 = await medallions(page);
  const end1 = await playShow({ winSeat: 0, jump: true });
  check('Show 1: the cast sat down under their own names, wearing their initial medallions',
    JSON.stringify(end1.names) === JSON.stringify(NAMES) && JSON.stringify(med1) === '["A","B","C"]',
    JSON.stringify({ names: end1.names, medallions: med1 }));
  const btn1 = await page.evaluate(() => document.getElementById('btnAgain').textContent);
  check('Show 1 finale: the gold button reads REMATCH (PLAY AGAIN is gone)', btn1 === 'REMATCH', btn1);
  check('Show 1 finale: no series line yet — one show is not a night', (await seriesLineEl(page)) === null);
  const ser1 = await readSeries(page);
  check('Show 1: the series holds exactly this show — key, one show, Alexandria 1, guarded by the show id',
    !!ser1 && ser1.key === CAST_KEY && ser1.shows === 1 && ser1.wins.alexandria === 1 &&
    Object.keys(ser1.wins).length === 1 && ser1.lastShowId === id1 && typeof ser1.night === 'string',
    JSON.stringify(ser1));

  /* ---- REMATCH: show 2 with no door in between ---- */
  await page.tap('#btnAgain');
  await page.waitForSelector('#btnRoundGo', { timeout: 10000 });
  const s2start = await S();
  const doors = await page.evaluate(() => ({
    gameActive: document.getElementById('scr-game').classList.contains('active'),
    titleActive: document.getElementById('scr-title').classList.contains('active'),
  }));
  const med2 = await medallions(page);
  check('REMATCH deals show 2 immediately: same screen, same names, same medallions, a fresh show id',
    doors.gameActive && !doors.titleActive && s2start.showId !== id1 &&
    JSON.stringify(s2start.names) === JSON.stringify(NAMES) && JSON.stringify(med2) === JSON.stringify(med1),
    JSON.stringify({ doors, id2: s2start.showId, medallions: med2 }));
  const open2 = await hostLine(page);
  /* Opening-line checks match the series PREFIX: since the Golden
     pass, every Round 1 intro also carries Sterling's per-show
     golden tease after the series line (by design — the tease is
     spoken once per show; drive-golden owns it). Exact equality
     here predated that composition and went stale, not wrong. */
  check('Show 2 opens on the series line: the score, and the house rule taught the first time',
    open2.indexOf('The score tonight: Alexandria 1, Bartholomew 0, Cassandra 0. First to three takes the night.') === 0, open2);
  await page.screenshot({ path: SHOTS + '/rematch-2-opening.png' });

  /* ---- show 2: Bartholomew wins ---- */
  const end2 = await playShow({ winSeat: 1, jump: true });
  const line2 = await seriesLineEl(page);
  check('Show 2 finale: ON THE NIGHT — ALEXANDRIA 1 · BARTHOLOMEW 1 · CASSANDRA 0',
    line2 === 'ON THE NIGHT — ALEXANDRIA 1 · BARTHOLOMEW 1 · CASSANDRA 0', line2);
  const ser2 = await readSeries(page);
  check('Show 2: the series stands at two shows, one win apiece',
    !!ser2 && ser2.shows === 2 && ser2.wins.alexandria === 1 && ser2.wins.bartholomew === 1, JSON.stringify(ser2));
  {
    /* the fit is a RESTING-layout property: for the finale's first
       ~0.4s the entrance transforms (the spotlight cone rising, the
       wrap settling) inflate scrollHeight by a few px — measured
       directly, 271 at t+0 against an exact 267 from t+400 on. The
       check settles before it measures, as the eye does. */
    await sleep(900);
    const fit = await finaleFit();
    check('Finale fit (landscape, series line up): the stage does not scroll', fit.client === fit.scroll, JSON.stringify(fit));
    await page.setViewport({ width: 390, height: 844 });
    await sleep(400);
    const fitP = await finaleFit();
    /* (Pass 5 adjudication: this check stands RED as a witness.
       The portrait finale overflows by a few dozen px with the
       series line up — +26 and +60 in two runs, varying with the
       honours the night dealt — while the landscape finale fits
       exactly. It belongs to the audit's finale-fit family
       (finding #11); this pass does not re-pin it away and does
       not touch the game) */
    check('Finale fit (portrait, series line up): the stage does not scroll', fitP.scroll <= fitP.client, JSON.stringify(fitP));
    await page.setViewport({ width: 844, height: 390 });
    await sleep(300);
  }

  /* ---- refresh AT the finale: nothing double-counts ---- */
  const serBefore = JSON.stringify(await readSeries(page));
  const recBefore = JSON.stringify(await readRec(page));
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await sleep(700);
  check('Refresh at the finale: the series is byte-identical (the show id guard held)',
    JSON.stringify(await readSeries(page)) === serBefore);
  check('Refresh at the finale: Sterling\'s record is likewise untouched',
    JSON.stringify(await readRec(page)) === recBefore);

  /* ---- show 3: a fresh start with the identical cast still counts ---- */
  await page.evaluate((n) => window.__game.startShow(n), NAMES);
  await page.waitForSelector('#btnRoundGo', { timeout: 10000 });
  const open3 = await hostLine(page);
  check('Show 3 (lobby-fresh start, same cast): the opening calls it the decider of the night, and the teaching is spent',
    open3.indexOf('The score tonight: Alexandria 1, Bartholomew 1, Cassandra 0. Dead level at the top — this show is the decider of the night.') === 0 && open3.indexOf('First to three') < 0, open3);
  await playShow({ winSeat: 0, jump: true });
  const ser3 = await readSeries(page);
  check('Show 3: Alexandria leads the night 2-1', !!ser3 && ser3.shows === 3 && ser3.wins.alexandria === 2 && ser3.wins.bartholomew === 1, JSON.stringify(ser3));

  /* ---- show 4 via REMATCH: match point, then the night is taken ---- */
  await page.tap('#btnAgain');
  await page.waitForSelector('#btnRoundGo', { timeout: 10000 });
  const open4 = await hostLine(page);
  check('Show 4 opens on match point: "Alexandria plays for the night."',
    open4.indexOf('The score tonight: Alexandria 2, Bartholomew 1, Cassandra 0. Alexandria plays for the night.') === 0, open4);
  await playShow({ winSeat: 0, jump: true });
  const line4 = await seriesLineEl(page);
  check('Show 4 finale: ★ ALEXANDRIA TAKES THE NIGHT replaces the score line',
    line4 === '★ ALEXANDRIA TAKES THE NIGHT', line4);
  const nightPool = await page.evaluate(() => window.__game.HOST.winnernight.map(l => l.split('{name}').join('Alexandria')));
  const winLine4 = await hostLine(page);
  check('Show 4 finale: Sterling\'s winner beat is a winnernight line (the night, not just the show)',
    nightPool.indexOf(winLine4) >= 0, winLine4);
  const ser4 = await readSeries(page);
  check('Show 4: the series stands at four shows, Alexandria 3',
    !!ser4 && ser4.shows === 4 && ser4.wins.alexandria === 3, JSON.stringify(ser4));
  await page.screenshot({ path: SHOTS + '/rematch-1-finale.png' });

  /* ---- show 5: the taken night acknowledged; an early end moves nothing ---- */
  await page.tap('#btnAgain');
  await page.waitForSelector('#btnRoundGo', { timeout: 10000 });
  const open5 = await hostLine(page);
  check('Show 5 opens acknowledging the taken night (and match-point framing is retired)',
    open5.indexOf('Alexandria has the night at 3') >= 0 && open5.indexOf('plays for the night') < 0, open5);
  const ser4Json = JSON.stringify(await readSeries(page));
  await page.tap('#btnRoundGo');
  await waitPhase('question');
  await page.tap('#btnQuit');
  await sleep(500);
  check('END SHOW mid-show-5: the series does not move', JSON.stringify(await readSeries(page)) === ser4Json);

  /* ---- a changed cast starts a fresh series ---- */
  await page.evaluate(() => window.__game.startShow(['Alexandria', 'Bartholomew', 'Zelda']));
  await page.waitForSelector('#btnRoundGo', { timeout: 10000 });
  const openZ = await hostLine(page);
  const r1Pool = await page.evaluate(() => window.__game.HOST.r1.slice());
  check('A changed cast opens standard: no series line, a plain Round 1 line from the pool',
    openZ.indexOf('The score tonight') < 0 && r1Pool.some(l => openZ.indexOf(l) === 0), openZ);
  const endZ = await playShow({ winSeat: 0, jump: true });
  const serZ = await readSeries(page);
  check('The changed cast\'s completed show replaces the store: new key, one show, one win',
    !!serZ && serZ.key === 'alexandria|bartholomew|zelda' && serZ.shows === 1 &&
    serZ.wins.alexandria === 1 && Object.keys(serZ.wins).length === 1 && serZ.lastShowId === endZ.showId,
    JSON.stringify(serZ));
  const recZ = await readRec(page);
  check('Records were never the series\' business: Alexandria\'s five completed shows all stand there',
    !!recZ && recZ.players.alexandria.shows === 5 && recZ.lastShowId === endZ.showId,
    JSON.stringify(recZ && recZ.players.alexandria));
  await page.close();

  /* ================= ONLINE (stubbed referee) ================= */
  /* One stub factory for the three host scenarios. The canned
     referee banks per publish from PLANS[show][seat](pub); it
     implements new_show exactly as room.js does (reset the cum
     scores, advance the show counter, rest at the lobby) and
     reports every host message it receives. */
  /* puppeteer serializes this function's source into the page, so
     it takes its options as an argument and closes over nothing. */
  function ogStubsInit(opts) {
      const NAMES = opts.names;
      const PLANS = opts.plans;
      const OFFLINE = opts.offline || [];
      const okj = obj => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(obj) });
      window.__roomPosts = 0; window.__sent = [];
      window.__cum = NAMES.map(() => 0);
      window.__pubs = 0; window.__showIdx = 1; window.__showSeq = 1; window.__dropSeat = -1;
      window.fetch = function (u) {
        const url = String(u);
        if (url.indexOf('gilded-hour-rooms') >= 0) { window.__roomPosts++; return okj({ code: 'TEST', hostToken: 'tok' }); }
        if (url.indexOf('gilded-hour-sterling') >= 0) return okj({ line: 'LIVE LINE' });
        if (url.indexOf('gilded-hour-nightly') >= 0) return okj({ question: null, intro: null });
        return Promise.reject(new Error('offline in rematch drive'));
      };
      const playersArr = () => NAMES.map((name, i) => ({
        seat: i, name, score: window.__cum[i], cutTwo: true,
        connected: OFFLINE.indexOf(i) < 0 && window.__dropSeat !== i, avatar: i,
      })).concat([null, null]).slice(0, 4);
      const state = (phase, extra) => Object.assign({
        code: 'TEST', phase, role: 'host', seat: null, showSeq: window.__showSeq,
        players: playersArr(), question: null, bet: null, lastReveal: null, intermission: null,
      }, extra || {});
      window.WebSocket = class FakeWS {
        constructor(u) { this.url = u; this.readyState = 1; setTimeout(() => { if (this.onopen) this.onopen(); }, 20); }
        send(data) {
          let m = {};
          try { m = JSON.parse(data); } catch (e) {}
          window.__sent.push(m);
          const deliver = (obj, ms) => setTimeout(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) }); }, ms == null ? 30 : ms);
          window.__deliver = deliver;
          if (m.t === 'hello' && m.role === 'host') {
            deliver({ t: 'welcome', role: 'host', code: 'TEST' });
            deliver({ t: 'state', state: state('lobby') });
          }
          if (m.t === 'bet_phase') deliver({ t: 'state', state: state('bet', { bet: { qid: m.qid, betsIn: NAMES.length } }) });
          if (m.t === 'intermission') deliver({ t: 'state', state: state('intermission', { intermission: { nextRound: m.nextRound } }) });
          /* (Pass 5 stub repair: the Bluff speaks its own grammar —
             invent, deal, counts, reveal-on-request. The old stub
             dealt it as an ordinary question and the host client
             wedged on the undealt entry, the decider lesson) */
          if (m.t === 'publish_question' && m.kind === 'bluff') {
            window.__pubs++;
            const pub = window.__pubs, show = window.__showIdx, now = Date.now();
            const q = { qid: m.qid, round: m.round, kind: 'bluff', category: m.category, answersCount: 0, baseValue: m.baseValue, multiplier: m.multiplier, headline: false, windowMs: 60000, openedAt: now, deadline: now + 60000, betted: false, decider: false, eligible: null, cut: null, answersIn: 0, bluffPhase: 'invent', fakesIn: 0, options: null };
            deliver({ t: 'state', state: state('invent', { question: q }) });
            /* the host deals when fakesIn reaches the connected
               count (game.js: the deal fires at fakesIn >= ogConn),
               so the climb must run to the full cast — the fixed
               two-step climb written for the two-player scenarios
               stalled a three-player show in 'invent' forever */
            for (let fi = 1; fi <= NAMES.length; fi++) {
              setTimeout(() => deliver({ t: 'state', state: state('invent', { question: Object.assign({}, q, { fakesIn: fi }) }) }), 800 + (fi - 1) * 900);
            }
            window.__bluffPub = { pub, show, qid: m.qid };
          }
          if (m.t === 'bluff_deal') {
            const bp = window.__bluffPub || { pub: 10, show: window.__showIdx, qid: m.qid };
            const options = [
              { t: 'A singing kettle', by: 0 },
              { t: 'A brass teaspoon', by: null },
              { t: 'A pocket sundial', by: 1 },
            ];
            const correctIdx = 1;
            window.__bluffDeal = { bp, options, correctIdx };
            /* the wire carries TEXTS until the reveal (room.js:
               the bluff_options message and the snapshot's options
               are both o.t strings; only the reveal's bluff.options
               are the full objects). Sending the objects early made
               the host throw 's.replace is not a function' in esc() */
            const texts = options.map(o => o.t);
            deliver({ t: 'bluff_options', qid: m.qid, options: texts });
            deliver({ t: 'state', state: state('answer', { question: {
              qid: m.qid, round: 2, kind: 'bluff', category: 'Invented', answersCount: 3,
              baseValue: 200, multiplier: 1, headline: false, windowMs: 60000, openedAt: Date.now(),
              deadline: Date.now() + 60000, betted: false, decider: false, eligible: null, cut: null,
              answersIn: 0, bluffPhase: 'answer', options: texts, correctIdx,
            } }) });
            setTimeout(() => {
              deliver({ t: 'state', state: state('answer', { question: {
                qid: m.qid, round: 2, kind: 'bluff', category: 'Invented', answersCount: 3,
                baseValue: 200, multiplier: 1, headline: false, windowMs: 60000, openedAt: Date.now(),
                deadline: Date.now() + 60000, betted: false, decider: false, eligible: null, cut: null,
                answersIn: NAMES.length, bluffPhase: 'answer', options: texts, correctIdx,
              } }) });
              deliver({ t: 'counts', answersIn: NAMES.length });
            }, 1100);
          }
          if (m.t === 'reveal' && window.__bluffDeal) {
            const { bp, options, correctIdx } = window.__bluffDeal;
            window.__bluffDeal = null;
            const plan = PLANS[bp.show] || PLANS[1];
            const results = NAMES.map((nm, seat) => {
              const code = plan[seat];
              const banked = code === 'all' ? 100 : code === 'early' ? (bp.pub <= 3 ? 100 : 0) : 0;
              window.__cum[seat] += banked;
              return { seat, pick: seat === 0 ? correctIdx : (correctIdx + 1) % 3, banked, correct: banked > 0 };
            });
            const bluff = { options: options.map((o, i) => ({ t: o.t, by: o.by, truth: i === correctIdx })) };
            const rev = { qid: bp.qid, kind: 'bluff', headline: false, value: 200, results, scores: window.__cum.slice(), quickDrawSeat: null, decider: false, correctIdx, bluff };
            deliver({ t: 'reveal', ...rev });
            deliver({ t: 'state', state: state('reveal', { lastReveal: rev }) });
          }
          if (m.t === 'publish_question' && m.kind !== 'bluff') {
            window.__pubs++;
            const pub = window.__pubs, show = window.__showIdx, now = Date.now();
            deliver({ t: 'state', state: state('answer', { question: {
              qid: m.qid, round: m.round, kind: m.kind, category: m.category, answersCount: 4,
              baseValue: m.baseValue, multiplier: m.multiplier, headline: false,
              windowMs: m.deadlineMs, openedAt: now, deadline: now + m.deadlineMs,
              betted: m.round === 3, decider: false, eligible: null, cut: null, answersIn: NAMES.length,
              correctIdx: m.correctIdx, trueNum: m.trueNum,
            } }) });
            setTimeout(() => {
              const plan = PLANS[show] || PLANS[1];
              const results = NAMES.map((nm, seat) => {
                const code = plan[seat];
                const banked = code === 'all' ? 100 : code === 'early' ? (pub <= 3 ? 100 : 0) : 0;
                window.__cum[seat] += banked;
                const base = { seat, correct: banked > 0, banked };
                if (m.kind === 'num') base.num = banked > 0 ? m.trueNum : m.trueNum + 40;
                else base.pick = banked > 0 ? m.correctIdx : (m.correctIdx + 1) % 4;
                return base;
              });
              const rev = { qid: m.qid, kind: m.kind, headline: false, value: 100, results, scores: window.__cum.slice(), quickDrawSeat: null, decider: false, correctIdx: m.kind === 'num' ? null : m.correctIdx, trueNum: m.kind === 'num' ? m.trueNum : null };
              if (this.onmessage) this.onmessage({ data: JSON.stringify(Object.assign({ t: 'reveal' }, rev)) });
              if (this.onmessage) this.onmessage({ data: JSON.stringify({ t: 'state', state: state('reveal', { lastReveal: rev }) }) });
            }, 600);
          }
          if (m.t === 'new_show') {
            window.__cum = NAMES.map(() => 0); window.__pubs = 0; window.__showIdx++; window.__showSeq++;
            deliver({ t: 'state', state: state('lobby') });
          }
          if (m.t === 'end_show') {
            deliver({ t: 'ended', scores: window.__cum.slice(), winnerSeat: null });
            deliver({ t: 'state', state: state('ended') });
          }
        }
        close() { this.readyState = 3; }
      };
      window.__drop = (seat) => { window.__dropSeat = seat; if (window.__deliver) window.__deliver({ t: 'state', state: state('ended') }); };
  }
  async function ogHostPage(stubOpts) {
    const p = await browser.newPage();
    watch(p);
    await p.evaluateOnNewDocument(ogStubsInit, stubOpts);
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
  async function runOgShow(p) {
    let over = false, guard = 0;
    while (guard++ < 400 && !over) {
      over = await p.evaluate(() => {
        const o = window.__online.OG;
        if (o && o.phase === 'over') return true;
        const tap = id => { const b = document.getElementById(id); if (b) { b.click(); return true; } return false; };
        if (tap('ogBetsGo')) return false;
        if (tap('ogRoundGo')) return false;
        if (tap('ogBreakGo')) return false;
        if (tap('ogNext')) return false;
        return false;
      });
      if (!over) await sleep(350);
    }
    return over;
  }
  /* ---- OG-A: two players, three shows of one night ---- */
  const ogA = await ogHostPage({ names: ['Robin', 'Jules'], plans: {
    1: ['all', 'early'], 2: ['early', 'all'], 3: ['all', 'early'],
  } });
  await ogA.tap('#ogStart');
  check('OG-A: show 1 runs to its finale', await runOgShow(ogA));
  await sleep(400);
  check('OG-A finale 1: REMATCH on the gold button, and no series line after one show',
    (await ogA.evaluate(() => document.getElementById('ogAgain').textContent)) === 'REMATCH' && (await seriesLineEl(ogA)) === null);
  const ogSer1 = await readSeries(ogA);
  check('OG-A: the host device holds the series — key jules|robin, one show, Robin 1',
    !!ogSer1 && ogSer1.key === 'jules|robin' && ogSer1.shows === 1 && ogSer1.wins.robin === 1, JSON.stringify(ogSer1));
  await ogA.tap('#ogAgain');
  await ogA.waitForSelector('#ogRoundGo', { timeout: 10000 });
  await sleep(300);
  const ogAState = await ogA.evaluate(() => ({
    newShows: window.__sent.filter(m => m.t === 'new_show').length,
    roomPosts: window.__roomPosts,
    line: document.getElementById('hostLine').textContent,
    started: !!(window.__online.OG && window.__online.OG.started),
  }));
  check('OG-A rematch: exactly one {t:new_show} sent, and NO new room was created',
    ogAState.newShows === 1 && ogAState.roomPosts === 1 && ogAState.started, JSON.stringify(ogAState));
  check('OG-A show 2 opens on the series line (score + the house rule)',
    ogAState.line === 'The score tonight: Robin 1, Jules 0. First to three takes the night.', ogAState.line);
  check('OG-A: show 2 runs to its finale', await runOgShow(ogA));
  await sleep(400);
  check('OG-A finale 2: ON THE NIGHT — ROBIN 1 · JULES 1',
    (await seriesLineEl(ogA)) === 'ON THE NIGHT — ROBIN 1 · JULES 1', await seriesLineEl(ogA));
  await ogA.tap('#ogAgain');
  await ogA.waitForSelector('#ogRoundGo', { timeout: 10000 });
  await sleep(300);
  const ogOpen3 = await hostLine(ogA);
  check('OG-A show 3 opens on the decider-of-the-night framing',
    ogOpen3 === 'The score tonight: Robin 1, Jules 1. Dead level at the top — this show is the decider of the night.', ogOpen3);
  await ogA.close();

  /* ---- the pads: the room's counter is the whole signal ---- */
  function padStubs() {
    return (seatArg) => {
      const okj = obj => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(obj) });
      window.fetch = function (u) {
        const url = String(u);
        if (url.indexOf('gilded-hour-nightly') >= 0) return okj({ question: null, intro: null });
        if (url.indexOf('gilded-hour-sterling') >= 0) return okj({ line: 'LIVE LINE' });
        return Promise.reject(new Error('offline in rematch drive (pad)'));
      };
      const P_END = [
        { seat: 0, name: 'Robin', score: 1500, cutTwo: true, connected: true, avatar: 0 },
        { seat: 1, name: 'Jules', score: 300, cutTwo: false, connected: true, avatar: 1 },
        null, null,
      ];
      const P_ZERO = P_END.map(p => (p ? Object.assign({}, p, { score: 0, cutTwo: true }) : p));
      window.__seq = 1; window.__padSent = [];
      const snap = (phase, extra) => Object.assign({
        code: 'TEST', phase, role: 'player', seat: seatArg, showSeq: window.__seq,
        players: phase === 'ended' ? P_END : P_ZERO,
        question: null, bet: null, lastReveal: null, intermission: null,
      }, extra || {});
      window.WebSocket = class FakeWS {
        constructor(u) { this.url = u; this.readyState = 1; setTimeout(() => { if (this.onopen) this.onopen(); }, 20); }
        send(data) {
          let m = {};
          try { m = JSON.parse(data); } catch (e) {}
          window.__padSent.push(m);
          const deliver = (obj, ms) => setTimeout(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) }); }, ms == null ? 30 : ms);
          window.__padDeliver = deliver;
          if (m.t === 'hello' && m.role === 'player') {
            deliver({ t: 'welcome', role: 'player', code: 'TEST', seat: seatArg, reclaimToken: 'tok' + seatArg });
            deliver({ t: 'state', state: snap('ended') });
          }
        }
        close() { this.readyState = 3; }
      };
      window.__stubRematch = () => { window.__seq = 2; window.__padDeliver({ t: 'state', state: snap('lobby') }); };
      window.__stubNextQ = () => {
        const bankId = window.GH_BANK.findIndex(q => !q.kind);
        const bank = window.GH_BANK[bankId];
        const now = Date.now();
        window.__padDeliver({ t: 'state', state: snap('answer', { question: {
          qid: 'q1.' + bankId + '.zz', round: 1, kind: 'normal', category: bank.cat, answersCount: 4,
          baseValue: 100, multiplier: 1, headline: false, windowMs: 20000, openedAt: now, deadline: now + 20000,
          betted: false, decider: false, eligible: null, cut: null, answersIn: 0,
        } }) });
      };
    };
  }
  const pad = await browser.newPage();
  watch(pad);
  await pad.evaluateOnNewDocument(padStubs(), 1);
  await pad.setViewport({ width: 390, height: 844 });
  await pad.goto(httpUrl, { waitUntil: 'load', timeout: 60000 });
  await sleep(400);
  await pad.tap('.mode-tab[data-mode="join"]');
  await sleep(150);
  await pad.click('#joinBoxes .code-box');
  await pad.keyboard.type('TEST', { delay: 30 });
  await pad.type('#joinName', 'Jules');
  await pad.tap('#btnJoinRoom');
  await pad.waitForFunction(() => document.getElementById('jpMain').innerText.includes('YOU CAME'), { timeout: 10000 });
  const padMain = () => pad.evaluate(() => document.getElementById('jpMain').innerText.replace(/\s+/g, ' ').trim());
  /* (Pass 5 re-pin: the pad's ended card no longer names the
     winner — it gives the player their own result and points at
     the big screen for the result, which is the current design.
     Jules finished 2nd on $300 in the stub's table) */
  check('Pad: show 1\'s ended card gives the pad its own result (2nd, $300)', (await padMain()).includes('YOU CAME 2ND · $300'), await padMain());
  await pad.evaluate(() => window.__stubRematch());
  await pad.waitForFunction(() => document.getElementById('jpMain').innerText.includes('REMATCH — SHOW 2'), { timeout: 10000 });
  const padLobby = await padMain();
  const padSent = await pad.evaluate(() => window.__padSent.map(m => m.t));
  check('Pad: the counter alone carries the rematch — banner up, table together, no rejoin, no code',
    padLobby.includes('REMATCH — SHOW 2') && padLobby.includes('THE TABLE STAYS TOGETHER') &&
    !padLobby.includes('FINAL RESULT') && JSON.stringify(padSent) === '["hello"]',
    padLobby.slice(0, 160) + ' | sent=' + JSON.stringify(padSent));
  await pad.evaluate(() => window.__stubNextQ());
  await pad.waitForFunction(() => document.querySelectorAll('.jp-ans').length === 4, { timeout: 10000 });
  check('Pad: show 2\'s first question lands on the same pad, answers live', true);
  await pad.close();

  /* ---- ONE LEFT: one player still connected when the rematch
     is tapped — the show goes on for the one who remains ---- */
  const ogL = await ogHostPage({ names: ['Robin', 'Jules'], offline: [1], plans: { 1: ['all', 'early'] } });
  await ogL.tap('#ogStart');
  check('ONE LEFT: the show still runs (a disconnected seat is a seat)', await runOgShow(ogL));
  await sleep(400);
  await ogL.tap('#ogAgain');
  await ogL.waitForSelector('#ogRoundGo', { timeout: 10000 });
  await sleep(300);
  const ogLState = await ogL.evaluate(() => ({
    line: document.getElementById('hostLine').textContent,
    ctxKey: window.__online.OG && window.__online.OG.seriesCtx && window.__online.OG.seriesCtx.key,
    newShows: window.__sent.filter(m => m.t === 'new_show').length,
  }));
  check('ONE LEFT: the rematch deals — the one who remains is the cast (fresh series, no series line)',
    ogLState.ctxKey === 'robin' && ogLState.line.indexOf('The score tonight') < 0 && ogLState.newShows === 1, JSON.stringify(ogLState));
  check('ONE LEFT: show 2 runs to its finale with a cast of one', await runOgShow(ogL));
  await sleep(400);
  const ogLSer = await readSeries(ogL);
  check('ONE LEFT: show 2 started a fresh series under the one-name key — one show, Robin 1',
    !!ogLSer && ogLSer.key === 'robin' && ogLSer.shows === 1 && ogLSer.wins.robin === 1 && Object.keys(ogLSer.wins).length === 1,
    JSON.stringify(ogLSer));
  await ogL.close();

  /* ---- SCATTERED: nobody left when the rematch is tapped ---- */
  const ogS = await ogHostPage({ names: ['Robin', 'Jules'], offline: [0, 1], plans: { 1: ['all', 'early'] } });
  await ogS.tap('#ogStart');
  check('SCATTERED: the show still runs (a disconnected seat is a seat)', await runOgShow(ogS));
  await sleep(400);
  await ogS.tap('#ogAgain');
  await sleep(600);
  const scat = await ogS.evaluate(() => ({
    phase: window.__online.OG && window.__online.OG.phase,
    lobbyUp: !!document.getElementById('ogStart'),
    note: (document.getElementById('ogLobbyNote') || {}).textContent || null,
    pool: window.__game.HOST.scattered.slice(),
    newShows: window.__sent.filter(m => m.t === 'new_show').length,
  }));
  check('SCATTERED: nobody still connected — the host lands back in the room\'s lobby, new_show still sent',
    scat.phase === 'lobby' && scat.lobbyUp && scat.newShows === 1, JSON.stringify({ phase: scat.phase, lobbyUp: scat.lobbyUp, newShows: scat.newShows }));
  check('SCATTERED: Sterling explains it in the lobby, in his own words',
    !!scat.note && scat.pool.indexOf(scat.note) >= 0, scat.note);
  await ogS.close();

  /* ---- DROPPED: the rematch cast is who is still connected ---- */
  const ogD = await ogHostPage({ names: ['Robin', 'Jules', 'Cy'], plans: {
    1: ['all', 'early', 'early'], 2: ['early', 'all', 'none'],
  } });
  await ogD.tap('#ogStart');
  check('DROPPED: show 1 (three players) runs to its finale', await runOgShow(ogD));
  await sleep(400);
  const ogDSer1 = await readSeries(ogD);
  check('DROPPED: show 1 counted for the three-name cast',
    !!ogDSer1 && ogDSer1.key === 'cy|jules|robin' && ogDSer1.shows === 1 && ogDSer1.wins.robin === 1, JSON.stringify(ogDSer1));
  await ogD.evaluate(() => window.__drop(2));
  await sleep(400);
  await ogD.tap('#ogAgain');
  await ogD.waitForSelector('#ogRoundGo', { timeout: 10000 });
  await sleep(300);
  const ogDState = await ogD.evaluate(() => ({
    line: document.getElementById('hostLine').textContent,
    ctxKey: window.__online.OG && window.__online.OG.seriesCtx && window.__online.OG.seriesCtx.key,
  }));
  check('DROPPED: the rematch deals — with the two who remain as its cast (fresh series, no series line)',
    ogDState.ctxKey === 'jules|robin' && ogDState.line.indexOf('The score tonight') < 0, JSON.stringify(ogDState));
  check('DROPPED: show 2 runs to its finale', await runOgShow(ogD));
  await sleep(400);
  const ogDSer2 = await readSeries(ogD);
  check('DROPPED: show 2 started a fresh series under the two-name key — one show, Jules 1',
    !!ogDSer2 && ogDSer2.key === 'jules|robin' && ogDSer2.shows === 1 && ogDSer2.wins.jules === 1 && Object.keys(ogDSer2.wins).length === 1,
    JSON.stringify(ogDSer2));
  await ogD.close();

  check('No console/page errors on any page', errors.length === 0, errors.slice(0, 3).join(' ;; '));
  const fails = results.filter(r => !r.ok).length;
  console.log('DRIVE-REMATCH DONE — ' + (results.length - fails) + '/' + results.length + ' checks passed');
  await browser.close();
  server.close();
  process.exit(fails ? 2 : 0);
})().catch(e => { console.error('DRIVE-REMATCH FAIL:', e.message); server.close(); process.exit(1); });
