/* Designer pass 6 (research programme Pass 4) — THE DECADE
   VOTE, at the table, in its own file so the existing drives
   keep their exact check counts.
   Scenario 1 (the count): a three-handed show reaches the
     first break and finds the vote standing — panel up, BEGIN
     held back, Sterling's opening drawn from the eravote pool.
     Plaque taps tally (pips and counts), the reset zeroes them,
     a mid-count refresh resumes the count untouched, and CALL
     IT settles it: the '90s, from the erawin pool, the verdict
     strip up, BEGIN restored. Round 2's ledger names the era;
     every multiple-choice question dealt from there to the
     crown is a '90s card — the lean, proven on the dealt facts.
   Scenario 2 (the abstention): CALL IT with no hands up —
     era null, NO VERDICT, the eraabstain pool, play proceeds.
   Scenario 3 (the tie): one hand each for the '80s and '90s —
     the verdict is one of the tied, spoken from eratie.
   Scenario 4 (the house votes): a solo show's house seats deal
     their votes at the break — the note names them, and their
     ballots alone can carry a verdict. */
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

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/index.html';
  const browser = await launchBrowser({ protocolTimeout: 240000 });
  const errors = [];
  const watch = p => {
    /* the locally served pages still try the Sterling/nightly
       workers; the sandbox egress tunnel refuses them and the
       game falls back to its authored lines by design (the pool
       checks above pass on those lines). Tunnel refusals are
       environment, not page errors — everything else counts. */
    p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED/.test(m.text())) errors.push(m.text()); });
    p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  };
  const S = p => p.evaluate(() => {
    const g = window.__game.G;
    if (!g) return null;
    return { phase: g.phase, round: g.round, qInRound: g.qInRound, kind: g.cur ? g.cur.kind : null,
      era: g.era, eraCalled: g.eraCalled,
      counts: g.eraVote ? g.eraVote.counts.slice() : null,
      house: g.eraVote ? Object.keys(g.eraVote.house).length : 0 };
  });
  const bubble = p => p.evaluate(() => document.getElementById('hostLine').textContent);
  const poolHas = (p, kind, vars) => p.evaluate((kind, vars) => {
    const H = window.__game.HOST;
    const line = document.getElementById('hostLine').textContent;
    return (H[kind] || []).some(l => {
      let s = l; for (const k in (vars || {})) s = s.split('{' + k + '}').join(vars[k]);
      return line.indexOf(s) >= 0;
    });
  }, kind, vars || {});

  /* play a table show forward until stopWhen(state) — the phase
     grammar mirrors drive-memory's proven loop */
  async function playUntil(page, stopWhen, collect) {
    let jumped = false, guard = 0;
    const actedKeys = new Set();
    while (guard++ < 900) {
      const s = await S(page);
      if (!s) throw new Error('game state lost');
      if (stopWhen(s)) return s;
      if (s.phase === 'coldopen' || s.phase === 'spin' || s.phase === 'vote-count') { await sleep(150); continue; }
      if (s.phase === 'intro') {
        if (collect && s.round === 3) collect.r3intro = await page.evaluate(() => document.getElementById('stage').textContent);
        await page.tap('#btnRoundGo'); await sleep(200); continue;
      }
      if (s.phase === 'intermission') { await page.tap('#btnBreakGo'); await sleep(200); continue; }
      if (s.phase === 'bet') { await page.tap('#btnBetsDone'); await sleep(200); continue; }
      if (s.phase === 'question') {
        if (collect && s.kind === 'mcq') {
          const key = s.round + ':' + s.qInRound;
          if (!collect.seen[key]) {
            collect.seen[key] = 1;
            collect.eras.push(await page.evaluate(() => { const g = window.__game.G; return g.cur && g.cur.q ? g.cur.q.era : null; }));
          }
        }
        await page.evaluate(() => { const g = window.__game.G; if (g && g.cur) g.cur.elapsed = 5; });
        const isBluff = await page.evaluate(() => { const g = window.__game.G; return !!(g && g.cur && g.cur.kind === 'bluff' && !g.cur.bluffDealt); });
        if (isBluff) { await page.tap('#btnDealBluff'); await sleep(200); continue; }
        /* Pass 8 grammar: answers go in on the desks — seat 0
           takes the truth (or the closest keyed number), the
           rest take live wrong ones, once per question */
        const key = s.round + ':' + s.qInRound + ':' + s.kind;
        if (actedKeys.has(key)) { await sleep(170); continue; }
        actedKeys.add(key);
        const acted = await page.evaluate(() => {
          const g = window.__game.G;
          if (!g || !g.cur) return 'none';
          if (g.cur.kind === 'num') return 'num';
          if (!g.cur.opts) return 'none';
          const ok = g.cur.opts.findIndex(o => o.ok);
          if (ok < 0) return 'none';
          const out = [];
          for (let seat = 0; seat < g.players.length; seat++) {
            if (g.players[seat].house != null) continue;
            const oi = seat === 0 ? ok : g.cur.opts.findIndex((o, ix) => !o.ok && !o.gone && o.by !== seat);
            if (oi >= 0) out.push(seat + '|' + oi);
          }
          return 'chips:' + out.join(',');
        });
        if (acted === 'num') {
          let g2 = 0;
          while (g2++ < 12) {
            const st = await page.evaluate(() => { const g = window.__game.G; return g && g.cur ? { phase: g.phase, turn: g.cur.guessTurn, truth: g.cur.q ? g.cur.q.num : null } : null; });
            if (!st || st.phase !== 'question' || st.turn == null || st.turn < 0) break;
            const target = st.turn === 0 ? st.truth : st.truth + 400 + st.turn * 137;
            for (const ch of String(target)) { await page.tap('[data-numk="' + ch + '"]').catch(() => {}); await sleep(30); }
            await page.tap('#btnNumLock').catch(() => {}); await sleep(150);
          }
        } else if (acted.indexOf('chips:') === 0 && acted.length > 6) {
          for (const sel of acted.slice(6).split(',')) { await page.tap('[data-pick="' + sel + '"]').catch(() => {}); await sleep(80); }
        }
        await sleep(170); continue;
      }
      if (s.phase === 'vote' || s.phase === 'vote-count') { await sleep(180); continue; }
      if (s.phase === 'reveal') {
        if (!jumped && s.round === 1) { await page.evaluate(() => { const g = window.__game.G; g.qInRound = 5; }); jumped = true; }
        await page.tap('#btnNext'); await sleep(200); continue;
      }
      await sleep(180);
    }
    throw new Error('playUntil: stop state never reached');
  }
  async function freshPage(w, h) {
    const p = await browser.newPage();
    watch(p);
    await p.setViewport({ width: w, height: h });
    await p.goto(url, { waitUntil: 'load', timeout: 60000 });
    await sleep(500);
    await p.evaluate(() => localStorage.clear());
    await p.reload({ waitUntil: 'load', timeout: 60000 });
    await sleep(500);
    return p;
  }

  /* ================= Scenario 1 — the count ================= */
  const page = await freshPage(390, 844);
  await page.evaluate(() => window.__game.startShow(['Ana', 'Bo', 'Cy']));
  await playUntil(page, s => s.phase === 'intermission');
  const atBreak = await page.evaluate(() => ({
    panel: !!document.querySelector('.era-panel'),
    plaques: document.querySelectorAll('.era-plaque').length,
    begin: !!document.getElementById('btnBreakGo'),
    call: !!document.getElementById('btnEraCall'),
  }));
  check('S1: the first break stands with the vote open — panel, three plaques, CALL IT, and BEGIN held back',
    atBreak.panel && atBreak.plaques === 3 && atBreak.call && !atBreak.begin, JSON.stringify(atBreak));
  check('S1: Sterling opens the vote from the eravote pool', await poolHas(page, 'eravote'));
  /* Pass 8 grammar: the ballots are cast on the desks — Ana and
     Bo for the '90s (era index 1); the plaques are the scoreboard */
  await page.tap('[data-eravote="0|1"]'); await sleep(250);
  await page.tap('[data-eravote="1|1"]'); await sleep(250);
  let st = await S(page);
  const domCounts = await page.evaluate(() => [...document.querySelectorAll('.era-plaque .era-count')].map(e => e.textContent));
  check('S1: desk ballots tally in the state and on the plaques (80s — · 90s 2 · 00s —)',
    JSON.stringify(st.counts) === '[0,2,0]' && JSON.stringify(domCounts) === '["—","2","—"]',
    'state=' + JSON.stringify(st.counts) + ' dom=' + JSON.stringify(domCounts));
  await page.screenshot({ path: SHOTS + '/era-vote-port.png' });
  await page.setViewport({ width: 844, height: 390 }); await sleep(350);
  await page.screenshot({ path: SHOTS + '/era-vote-land.png' });
  await page.setViewport({ width: 390, height: 844 }); await sleep(250);
  /* a change of mind moves the ballot — there is no reset, the
     desk simply votes again */
  await page.tap('[data-eravote="0|0"]'); await sleep(250);
  st = await S(page);
  check('S1: a change of mind moves the ballot (80s 1 · 90s 1)', JSON.stringify(st.counts) === '[1,1,0]', JSON.stringify(st.counts));
  await page.tap('[data-eravote="0|1"]'); await sleep(250);
  st = await S(page);
  check('S1: and back again (80s — · 90s 2)', JSON.stringify(st.counts) === '[0,2,0]', JSON.stringify(st.counts));
  /* prove the count survives a refresh, ballots and all */
  await page.reload({ waitUntil: 'load', timeout: 60000 }); await sleep(600);
  await page.tap('#btnResumeShow'); await sleep(700);
  st = await S(page);
  check('S1: a mid-count refresh resumes the count exactly — two 90s ballots standing, the call still open',
    st.phase === 'intermission' && JSON.stringify(st.counts) === '[0,2,0]' && !st.eraCalled, JSON.stringify(st));
  /* Cy's '80s ballot completes the house — Sterling calls it
     himself, no hand on the CALL IT button */
  await page.tap('[data-eravote="2|0"]'); await sleep(250);
  for (let i = 0; i < 30; i++) { st = await S(page); if (st.eraCalled) break; await sleep(300); }
  st = await S(page);
  const done = await page.evaluate(() => {
    const d = document.querySelector('.era-done');
    return { era: window.__game.G.era, result: d ? d.textContent.replace(/\s+/g, ' ') : null, begin: !!document.getElementById('btnBreakGo') };
  });
  check('S1: the full house settles the count — era is the 90s, the verdict strip names it, BEGIN is restored',
    st.eraCalled && done.era === '90s' && !!done.result && done.result.indexOf("THE '90S") >= 0 && done.begin,
    JSON.stringify(done));
  check('S1: Sterling delivers the verdict from the erawin pool', await poolHas(page, 'erawin', { era: "the '90s" }));
  await page.screenshot({ path: SHOTS + '/era-result-port.png' });
  await page.tap('#btnBreakGo'); await sleep(400);
  const intro2 = await page.evaluate(() => document.getElementById('stage').textContent.replace(/\s+/g, ' '));
  check('S1: Round 2\u2019s ledger names the room\u2019s era', intro2.indexOf("The room's era") >= 0 && intro2.indexOf("the '90s") >= 0, intro2.slice(0, 200));
  /* play out the money rounds, collecting every dealt MCQ's era */
  const collect = { seen: {}, eras: [], r3intro: '' };
  await playUntil(page, s => s.phase === 'over', collect);
  check('S1: the lean — every multiple-choice question dealt after the vote is a 90s card',
    collect.eras.length >= 4 && collect.eras.every(e => e === '90s'),
    'dealt=' + JSON.stringify(collect.eras));
  check('S1: the Big Finish ledger still names the era — the vote holds to the crown',
    collect.r3intro.indexOf("Still the '90s") >= 0, collect.r3intro.slice(0, 160));
  await page.close();

  /* ================= Scenario 2 — the abstention ================= */
  const p2 = await freshPage(390, 844);
  await p2.evaluate(() => window.__game.startShow(['Ana', 'Bo']));
  await playUntil(p2, s => s.phase === 'intermission');
  await p2.tap('#btnEraCall'); await sleep(400);
  st = await S(p2);
  const done2 = await p2.evaluate(() => { const d = document.querySelector('.era-done'); return d ? d.textContent.replace(/\s+/g, ' ') : null; });
  check('S2: CALL IT with no hands up is an abstention — called, era null, NO VERDICT on the strip',
    st.eraCalled && st.era === null && !!done2 && done2.indexOf('NO VERDICT') >= 0, JSON.stringify({ st, done2 }));
  check('S2: Sterling speaks the abstention from the eraabstain pool', await poolHas(p2, 'eraabstain'));
  await p2.tap('#btnBreakGo'); await sleep(400);
  const introA = await p2.evaluate(() => document.getElementById('stage').textContent.replace(/\s+/g, ' '));
  check('S2: Round 2\u2019s ledger records the abstention honestly', introA.indexOf('abstained') >= 0, introA.slice(0, 200));
  await p2.close();

  /* ================= Scenario 3 — the tie ================= */
  const p3 = await freshPage(390, 844);
  await p3.evaluate(() => window.__game.startShow(['Ana', 'Bo']));
  await playUntil(p3, s => s.phase === 'intermission');
  await p3.tap('[data-eravote="0|0"]'); await sleep(250);
  await p3.tap('[data-eravote="1|1"]'); await sleep(250);
  /* both desks in — Sterling calls the tie himself */
  for (let i = 0; i < 30; i++) { st = await S(p3); if (st.eraCalled) break; await sleep(300); }
  st = await S(p3);
  const tieOk = st.era === '80s' || st.era === '90s';
  const tieLine = tieOk && await poolHas(p3, 'eratie', { era: st.era === '80s' ? "the '80s" : "the '90s" });
  check('S3: a tied count settles on one of the tied eras, spoken from the eratie pool',
    st.eraCalled && tieOk && !!tieLine, JSON.stringify(st) + ' line=' + await bubble(p3));
  await p3.close();

  /* ================= Scenario 4 — the house votes ================= */
  const p4 = await freshPage(390, 844);
  await p4.evaluate(() => window.__game.startShow(['Ana', 'Bo', 'Cy'], [0, 1]));
  await playUntil(p4, s => s.phase === 'intermission');
  st = await S(p4);
  const note4 = await p4.evaluate(() => { const n = document.querySelector('.era-note'); return n ? n.textContent : ''; });
  check('S4: a solo show\u2019s house seats deal their votes at the break — two ballots standing, the note names the house',
    st.house === 2 && note4.indexOf('The house votes too') >= 0, JSON.stringify(st) + ' note=' + note4);
  await p4.tap('#btnEraCall'); await sleep(400);
  st = await S(p4);
  check('S4: the house ballots alone carry a verdict — the era is called with no human hand up',
    st.eraCalled && !!st.era, JSON.stringify(st));
  await p4.close();

  check('no page errors anywhere', errors.length === 0, errors.slice(0, 3).join(' ;; '));
  await browser.close();
  server.close();
  const fails = results.filter(r => !r.ok).length;
  console.log('DRIVE-ERA DONE — ' + (results.length - fails) + '/' + results.length + ' checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('DRIVE-ERA FAIL:', e.message); process.exit(1); });
