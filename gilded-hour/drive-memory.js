/* Designer pass 5 (research programme Pass 3) — Sterling
   remembers: the targeted drive, in its own file so the existing
   drives keep their exact check counts.
   SEEDED TABLE: a device whose book holds a last show for the
     group Ana|Bo|Cy (Ana won it by $450; Bo held the Fastest
     Hand) greets the same three names at the Round 1 intro with
     a callback composed from those facts — and a changed cast
     (Zed for Cy) gets no callback. The trophy shelf prints the
     honours each guest has accumulated (and prints nothing for
     a guest who has held none).
   PLAYED TABLE: a fresh device plays a scripted show (Ana wins)
     — the finale writes lastShow (the group's key, Ana, her
     total, the margin, the night's honours) and counts the
     honours onto the holders; a refresh writes nothing twice;
     starting the SAME two names again opens with the callback
     the just-played night earned.
   ONLINE HOST (stubbed room): a lobby seating the last show's
     group shows the callback under the greeting; a lobby whose
     last show was a DIFFERENT group falls back to the champion's
     return line, exactly as before. */
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

function seedRecords(rec) {
  return (r) => {
    try {
      if (!sessionStorage.getItem('gh_mem_seed_v1')) {
        sessionStorage.setItem('gh_mem_seed_v1', '1');
        if (r) localStorage.setItem('gh_records_v1', JSON.stringify(r));
        else localStorage.removeItem('gh_records_v1');
      }
    } catch (e) {}
  };
}
const SEEDED = {
  v: 1,
  players: {
    ana: { name: 'Ana', wins: 3, shows: 5, purse: 9000, honours: { best: 1, fastest: 2, biggest: 0, streak: 1 } },
    bo: { name: 'Bo', wins: 1, shows: 5, purse: 4000, honours: { best: 0, fastest: 1, biggest: 0, streak: 0 } },
    cy: { name: 'Cy', wins: 0, shows: 2, purse: 500 },
  },
  champion: { nameKey: 'ana', streak: 2, amount: 3200, date: '2026-11-10' },
  lastShowId: 'seed-old',
  lastShow: { id: 'seed-last', date: '2026-11-10', key: 'ana|bo|cy', winner: 'Ana', winnerTotal: 3200, margin: 450,
    honours: [{ k: 'FASTEST HAND', name: 'Bo', v: '1.9s' }] },
};
/* every line the seeded facts could compose, in the game's own
   substitution — the greeting must be one of these */
function memoryCandidates(page, ls) {
  return page.evaluate((ls) => {
    const H = window.__game.HOST;
    const money = n => '$' + Math.round(n).toLocaleString('en-US');
    const sub = (line, vars) => { let s = line; for (const k in vars) s = s.split('{' + k + '}').join(vars[k]); return s; };
    const out = [];
    (H.rematch || []).forEach(l => out.push(sub(l, { winner: ls.winner, margin: money(ls.margin) })));
    (H.rematchtotal || []).forEach(l => out.push(sub(l, { winner: ls.winner, total: money(ls.winnerTotal) })));
    const disp = { 'FASTEST HAND': 'the Fastest Hand', 'BEST CATEGORY': 'the Best Category', 'BIGGEST BANK': 'the Biggest Bank', 'HOTTEST STREAK': 'the Hottest Streak' };
    (ls.honours || []).forEach(h => (H.rematchhonour || []).forEach(l => out.push(sub(l, { honourName: h.name, honour: disp[h.k] || h.k }))));
    (H.rematchdraw || []).forEach(l => out.push(l));
    return out;
  }, ls);
}

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
  const S = p => p.evaluate(() => {
    const g = window.__game.G;
    if (!g) return null;
    return { phase: g.phase, round: g.round, qInRound: g.qInRound, kind: g.cur ? g.cur.kind : null,
      scores: g.players.map(x => x.score), showId: g.showId };
  });
  async function introLine(p) {
    for (let i = 0; i < 60; i++) {
      const s = await S(p);
      if (s && s.phase === 'intro') return p.evaluate(() => document.getElementById('hostLine').textContent);
      await sleep(200);
    }
    return null;
  }

  /* ================= SEEDED TABLE ================= */
  const page = await browser.newPage();
  watch(page);
  await page.evaluateOnNewDocument(seedRecords(SEEDED), SEEDED);
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('file://' + ROOT + '/index.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(600);

  /* the trophy shelf prints the accumulated honours */
  await page.tap('#champPlaque');
  await sleep(350);
  const shelf = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.record-row')].map(r => ({
      text: r.textContent.replace(/\s+/g, ' '),
      hon: r.querySelector('.record-honours') ? r.querySelector('.record-honours').textContent.replace(/\s+/g, ' ') : null,
    }));
    return rows;
  });
  check('Shelf: Ana\u2019s row counts her honours across nights — BEST CATEGORY ×1, FASTEST HAND ×2, HOTTEST STREAK ×1',
    shelf.length === 3 && !!shelf[0].hon && shelf[0].hon.indexOf('BEST CATEGORY ×1') >= 0 && shelf[0].hon.indexOf('FASTEST HAND ×2') >= 0 && shelf[0].hon.indexOf('HOTTEST STREAK ×1') >= 0,
    JSON.stringify(shelf.map(r => r.hon)));
  check('Shelf: Bo\u2019s row shows his single Fastest Hand; Cy (never held one, legacy record shape) shows no honours line',
    !!shelf[1].hon && shelf[1].hon.indexOf('FASTEST HAND ×1') >= 0 && shelf[2].hon === null,
    JSON.stringify(shelf.map(r => r.hon)));
  await page.screenshot({ path: SHOTS + '/memory-shelf-port.png' });
  await page.tap('#recordsClose');
  await sleep(300);

  /* the same group returns -> the callback opens Round 1 */
  const cands = await memoryCandidates(page, SEEDED.lastShow);
  await page.evaluate(() => window.__game.startShow(['Ana', 'Bo', 'Cy']));
  const line1 = await introLine(page);
  /* the Golden Question's teaser appends itself to whatever
     frame Sterling opens with — the callback is the line's head */
  check('Table: the returning group is greeted with a callback composed from the last show\u2019s facts',
    !!line1 && cands.some(c => line1 === c || line1.indexOf(c + ' ') === 0 || line1.indexOf(c) === 0), JSON.stringify(line1));
  await page.screenshot({ path: SHOTS + '/memory-intro-port.png' });

  /* a changed cast is a new table -> no callback */
  const page2 = await browser.newPage();
  watch(page2);
  await page2.evaluateOnNewDocument(seedRecords(SEEDED), SEEDED);
  await page2.setViewport({ width: 390, height: 844 });
  await page2.goto('file://' + ROOT + '/index.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(600);
  await page2.evaluate(() => window.__game.startShow(['Ana', 'Bo', 'Zed']));
  const line2 = await introLine(page2);
  check('Table: a changed cast gets no callback (the intro is the ordinary Round 1 frame)',
    !!line2 && cands.indexOf(line2) < 0, JSON.stringify(line2));
  await page.close(); await page2.close();

  /* ================= PLAYED TABLE ================= */
  const page3 = await browser.newPage();
  watch(page3);
  await page3.evaluateOnNewDocument(seedRecords(null), null);
  await page3.setViewport({ width: 844, height: 390 });
  await page3.goto('file://' + ROOT + '/index.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(600);
  await page3.evaluate(() => localStorage.clear());
  await page3.reload({ waitUntil: 'load', timeout: 60000 });
  await sleep(500);
  const S3 = () => S(page3);
  async function playShow(winSeat) {
    let jumped = false, guard = 0;
    while (guard++ < 700) {
      const s = await S3();
      if (!s) throw new Error('game state lost');
      if (s.phase === 'over') return s;
      if (s.phase === 'coldopen' || s.phase === 'spin' || s.phase === 'vote-count') { await sleep(160); continue; }
      if (s.phase === 'intro') { await page3.tap('#btnRoundGo'); await sleep(220); continue; }
      if (s.phase === 'intermission') { await page3.evaluate(() => { const b = document.getElementById('btnEraCall'); if (b) b.click(); }); await sleep(250); await page3.tap('#btnBreakGo'); await sleep(220); continue; }
      if (s.phase === 'bet') { await page3.tap('#btnBetsDone'); await sleep(220); continue; }
      if (s.phase === 'question') {
        await page3.evaluate(() => { const g = window.__game.G; if (g && g.cur) g.cur.elapsed = 5; });
        const isBluff = await page3.evaluate(() => { const g = window.__game.G; return !!(g && g.cur && g.cur.kind === 'bluff' && !g.cur.bluffDealt); });
        if (isBluff) { await page3.tap('#btnDealBluff'); await sleep(220); continue; }
        await page3.tap('#btnCallIt'); await sleep(180); continue;
      }
      if (s.phase === 'vote') {
        const bluffTruth = await page3.evaluate(() => { const g = window.__game.G; return (g && g.cur && g.cur.kind === 'bluff' && g.cur.opts) ? g.cur.opts.findIndex(o => o.ok) : -1; });
        if (bluffTruth >= 0) { await page3.tap('.bluff-pick[data-opt="' + bluffTruth + '"]'); await sleep(150); }
        await page3.tap('.seat[data-seat="' + winSeat + '"]'); await sleep(150);
        await page3.tap('#btnReveal'); await sleep(220); continue;
      }
      if (s.phase === 'reveal') {
        if (!jumped && s.round === 1 && s.qInRound === 0) {
          await page3.evaluate(() => { const g = window.__game.G; g.round = 3; g.qInRound = 1; });
          jumped = true;
        }
        await page3.tap('#btnNext'); await sleep(220); continue;
      }
      await sleep(200);
    }
    throw new Error('show never finished');
  }
  await page3.evaluate(() => window.__game.startShow(['Ana', 'Bo']));
  const end = await playShow(0);
  await sleep(400);
  const rec1 = await readRec(page3);
  check('Played: the finale writes lastShow for the group — key, winner and margin all from the night',
    !!rec1 && !!rec1.lastShow && rec1.lastShow.key === 'ana|bo' && rec1.lastShow.winner === 'Ana' &&
    rec1.lastShow.margin === Math.max(0, rec1.lastShow.winnerTotal - end.scores[1]),
    JSON.stringify(rec1 && rec1.lastShow));
  check('Played: the winner\u2019s recorded purse carries her total (score + pot, as the book has always counted it)',
    !!rec1 && rec1.players.ana && rec1.lastShow && rec1.lastShow.winnerTotal === rec1.players.ana.purse,
    'purse=' + (rec1 && rec1.players.ana && rec1.players.ana.purse) + ' total=' + (rec1 && rec1.lastShow && rec1.lastShow.winnerTotal));
  const honourSum = rec1 ? Object.keys(rec1.players).reduce((n, k) => n + (rec1.players[k].honours ? Object.values(rec1.players[k].honours).reduce((a, b) => a + b, 0) : 0), 0) : 0;
  check('Played: the night\u2019s honours are counted onto their holders (Ana banked, so at least her Biggest Bank stands in the book)',
    honourSum >= 1 && !!rec1.lastShow && rec1.lastShow.honours.length >= 1 && rec1.lastShow.honours.every(h => h.name === 'Ana' || h.name === 'Bo'),
    'sum=' + honourSum + ' lastShow.honours=' + JSON.stringify(rec1 && rec1.lastShow && rec1.lastShow.honours));
  const idBefore = rec1.lastShow.id;
  await page3.reload({ waitUntil: 'load', timeout: 60000 });
  await sleep(600);
  const rec2 = await readRec(page3);
  check('Played: a refresh at the finale writes nothing twice — lastShow and honours stand exactly as written',
    !!rec2 && !!rec2.lastShow && rec2.lastShow.id === idBefore &&
    JSON.stringify(rec2.players) === JSON.stringify(rec1.players),
    'id=' + (rec2 && rec2.lastShow && rec2.lastShow.id));
  /* the rematch: same two names on a LATER night — rewind the
     series book a day, as tomorrow would find it (the series
     frame owns a same-night rematch, and rightly outranks the
     memory there; the callback is for the group that comes
     back another evening) */
  await page3.evaluate(() => {
    try {
      const s = JSON.parse(localStorage.getItem('gh_series_v1') || 'null');
      if (s) { s.night = '2026-11-12'; localStorage.setItem('gh_series_v1', JSON.stringify(s)); }
    } catch (e) {}
  });
  const cands2 = await memoryCandidates(page3, rec1.lastShow);
  await page3.evaluate(() => window.__game.startShow(['Ana', 'Bo']));
  const line3 = await introLine(page3);
  check('Played: the rematch on a later night opens with a callback to the night just played',
    !!line3 && cands2.some(c => line3 === c || line3.indexOf(c) === 0), JSON.stringify(line3));
  await page3.close();

  /* ================= ONLINE HOST ================= */
  function ogStubs(lastShow) {
    return (seed) => {
      try {
        if (!sessionStorage.getItem('gh_mem_seed_v1')) { sessionStorage.setItem('gh_mem_seed_v1', '1'); localStorage.setItem('gh_records_v1', JSON.stringify({
          v: 1,
          players: {
            robin: { name: 'Robin', wins: 2, shows: 3, purse: 4320 },
            jules: { name: 'Jules', wins: 0, shows: 3, purse: 900 },
          },
          champion: { nameKey: 'robin', streak: 2, amount: 2100, date: '2026-11-10' },
          lastShowId: 'seed-show',
          lastShow: seed,
        })); }
      } catch (e) {}
      const okj = obj => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(obj) });
      window.fetch = function (u) {
        const url = String(u);
        if (url.indexOf('gilded-hour-rooms') >= 0) return okj({ code: 'TEST', hostToken: 'tok' });
        if (url.indexOf('gilded-hour-sterling') >= 0) return okj({ line: 'LIVE LINE' });
        if (url.indexOf('gilded-hour-nightly') >= 0) return okj({ question: null, intro: null });
        return Promise.reject(new Error('offline in memory drive'));
      };
      const state = (phase, extra) => Object.assign({
        code: 'TEST', phase, role: 'host', seat: null,
        players: [
          { seat: 0, name: 'Robin', score: 0, cutTwo: true, connected: true },
          { seat: 1, name: 'Jules', score: 0, cutTwo: true, connected: true },
          null, null,
        ],
        question: null, bet: null, lastReveal: null,
      }, extra || {});
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
        }
        close() { this.readyState = 3; }
      };
    };
  }
  async function ogLobby(lastShow) {
    const p = await browser.newPage();
    watch(p);
    await p.evaluateOnNewDocument(ogStubs(lastShow), lastShow);
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
  const LS_GROUP = { id: 'seed-og', date: '2026-11-10', key: 'jules|robin', winner: 'Robin', winnerTotal: 2100, margin: 300, honours: [] };
  const og1 = await ogLobby(LS_GROUP);
  const ackText = await og1.evaluate(() => { const e = document.getElementById('ogChampReturn'); return e ? e.textContent : null; });
  const candsOG = await memoryCandidates(og1, LS_GROUP);
  check('Online: the lobby seating the last show\u2019s group shows the callback under the greeting',
    !!ackText && candsOG.indexOf(ackText) >= 0, JSON.stringify(ackText));
  await og1.screenshot({ path: SHOTS + '/memory-lobby-land.png' });
  await og1.close();
  const og2 = await ogLobby({ id: 'seed-other', date: '2026-11-10', key: 'ana|bo', winner: 'Ana', winnerTotal: 900, margin: 100, honours: [] });
  const ack2 = await og2.evaluate(() => {
    const e = document.getElementById('ogChampReturn');
    return { text: e ? e.textContent : null, pool: window.__game.HOST.champreturn.map(l => l.split('{name}').join('Robin')) };
  });
  check('Online: a different group\u2019s last show leaves the champion\u2019s return line exactly as it was',
    !!ack2.text && ack2.pool.indexOf(ack2.text) >= 0, JSON.stringify(ack2.text));
  await og2.close();

  check('No console/page errors on any page', errors.length === 0, errors.slice(0, 3).join(' ;; '));
  const fails = results.filter(r => !r.ok).length;
  console.log('DRIVE-MEMORY DONE — ' + (results.length - fails) + '/' + results.length + ' checks passed');
  await browser.close();
  server.close();
  process.exit(fails ? 2 : 0);
})().catch(e => { console.error('DRIVE-MEMORY FAIL:', e.message); server.close(); process.exit(1); });
