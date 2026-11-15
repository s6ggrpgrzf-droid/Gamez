/* The Ten, pass 5 — HOUSE PLAYERS drive.
   Scenario A: a full solo show entered through the real setup —
   one human, two house seats — audited at every reveal (the
   settlement the drive expects is rebuilt from the question's own
   records: marks, lock order, bankValue, bets, streakFx — and
   compared to the money that actually moved, house seats
   included). Along the way: the house tag, the printed number,
   the no-tap rule for house seats on option questions, a house
   Cut Two spend hunted across the show's questions, the quick-
   draw raced both ways (a fast host tap beats a slow house lock;
   a waited-out tap loses to a quick one), policy bets in the Big
   Finish, and the portrait fit of the longest house tag line.
   Scenario B (fresh storage): a scripted tie at the top between
   the human and a house player — the Decider resolves it for the
   house, the finale says the house took it, Sterling's Record
   writes ONLY the human (no crown), and the night's series DOES
   count the house win. */
const puppeteer = require('/home/hatch/workspace/.shot/node_modules/puppeteer-core');
const { launchBrowser } = require('./rig');
const fs = require('fs');
const SHOTS = '/home/hatch/workspace/gilded-hour/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok, detail }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); }

async function newPage(browser) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.setViewport({ width: 844, height: 390 });
  await page.goto('file:///home/hatch/workspace/gilded-hour/index.html', { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await sleep(600);
  return { page, errors };
}
const S = page => page.evaluate(() => {
  const g = window.__game.G;
  if (!g) return null;
  return {
    phase: g.phase, round: g.round, qInRound: g.qInRound, solo: !!g.solo,
    players: g.players.map(p => ({ name: p.name, score: p.score, cut: p.cut, bet: p.bet, streak: p.streak || 0, house: p.house != null ? p.house : null, avatar: p.avatar })),
    kind: g.cur ? g.cur.kind : null,
    marks: g.cur ? JSON.parse(JSON.stringify(g.cur.marks || {})) : {},
    lockOrder: g.cur && g.cur.lockOrder ? g.cur.lockOrder.slice() : [],
    lockTimes: g.cur && g.cur.lockTimes ? JSON.parse(JSON.stringify(g.cur.lockTimes)) : {},
    bankValue: g.cur ? g.cur.bankValue : 0, betRound: g.cur ? !!g.cur.betRound : false,
    elapsed: g.cur ? g.cur.elapsed : 0, clockTotal: g.cur ? g.cur.clockTotal : 0,
    truth: g.cur && g.cur.q ? (g.cur.q.num != null ? g.cur.q.num : null) : null,
    band: g.cur && g.cur.q ? (g.cur.q.d || null) : null,
    house: g.cur && g.cur.house ? JSON.parse(JSON.stringify(g.cur.house)) : null,
    streakFx: g.cur && g.cur.streakFx ? JSON.parse(JSON.stringify(g.cur.streakFx)) : null,
    decider: g.decider ? { eligible: g.decider.eligible.slice(), winner: g.decider.winner } : null,
    optsGone: g.cur && g.cur.opts ? g.cur.opts.filter(o => o.gone).length : 0,
    dblSeats: g.cur && g.cur.dbl ? Object.keys(g.cur.dbl).map(Number) : [],
    vsSeats: g.cur && g.cur.vs ? Object.keys(g.cur.vs).map(Number) : [],
    bluffDealt: g.cur ? !!g.cur.bluffDealt : false,
    bluffPicks: g.cur && g.cur.bluffPicks ? JSON.parse(JSON.stringify(g.cur.bluffPicks)) : null,
    optsBy: g.cur && g.cur.opts ? g.cur.opts.map(o => ({ ok: !!o.ok, by: (o.by != null ? o.by : -1) })) : [],
  };
});
async function enterSolo(page, name) {
  /* Designer's pass P9 note (2026-11-11): since P7 the START
     button rides a bar docked at the sheet's bottom, and a
     minimal scroll-into-view leaves #btnSolo parked exactly
     under it — the tap lands on START (measured: elementFrom-
     Point at the solo button's centre returns btnStart). A
     human scrolls the button clear of the dock; the drive now
     does the same (centre scroll) before tapping. */
  await page.evaluate(() => document.getElementById('btnSolo').scrollIntoView({ block: 'center' }));
  await sleep(350);
  await page.tap('#btnSolo');
  await sleep(250);
  await page.evaluate(n => {
    const inp = document.querySelector('#panelTable .name-input');
    if (inp) { inp.value = n; inp.dispatchEvent(new Event('input', { bubbles: true })); }
  }, name);
  await page.tap('#btnStart');
  await page.waitForSelector('#btnRoundGo', { timeout: 10000 });
}

(async () => {
  const browser = await launchBrowser({ protocolTimeout: 600000 });

  /* ================= Scenario A — the full solo show ================= */
  {
    const { page, errors } = await newPage(browser);
    /* the entry itself — centre-scroll first (see enterSolo's
       note: the docked start bar eats a minimally-scrolled tap) */
    await page.evaluate(() => document.getElementById('btnSolo').scrollIntoView({ block: 'center' }));
    await sleep(350);
    await page.tap('#btnSolo');
    await sleep(250);
    const setup = await page.evaluate(() => ({
      rows: document.querySelectorAll('#nameRows .name-row').length,
      note: !!document.querySelector('.house-note'),
      pods: document.querySelectorAll('#podiumPreview .podium').length,
      housePods: document.querySelectorAll('#podiumPreview .house-pod').length,
      sel: document.querySelector('#btnSolo').classList.contains('sel'),
    }));
    check('A: solo entry — one name row, the house note, two house chairs in the preview',
      setup.rows === 1 && setup.note && setup.pods === 3 && setup.housePods === 2 && setup.sel, JSON.stringify(setup));
    await page.evaluate(() => {
      const inp = document.querySelector('#panelTable .name-input');
      if (inp) { inp.value = 'Solo Sam'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.tap('#btnStart');
    await page.waitForSelector('#btnRoundGo', { timeout: 10000 });
    const g0 = await S(page);
    const profiles = await page.evaluate(() => window.__game.house.profiles.map(p => ({ name: p.name })));
    const profNames = profiles.map(p => p.name);
    const cast = g0.players.slice(1);
    check('A: the show is solo — three seats, seats 2-3 are house players',
      g0.solo && g0.players.length === 3 && g0.players[0].house === null && cast.every(p => p.house !== null),
      JSON.stringify(g0.players.map(p => p.name + ':' + p.house)));
    check('A: cast names are authored cast names, distinct, and not the human\'s',
      cast.every(p => profNames.includes(p.name)) && cast[0].name !== cast[1].name && cast.every(p => p.name !== 'Solo Sam'),
      cast.map(p => p.name).join(' + '));
    const deskLetters = await page.evaluate(() => [...document.querySelectorAll('.seat-ava svg.medallion text')].map(t => t.textContent));
    check('A: cast medallions wear the seats\' own initials (THE FACE PASS grammar)',
      deskLetters.length === 3 && g0.players.every((p, i) => deskLetters[i] === p.name.charAt(0).toUpperCase()),
      'letters=' + deskLetters.join(','));
    const intro = await page.evaluate(() => document.querySelector('#hostLine').textContent);
    check('A: Sterling\'s Round 1 intro names the arrangement and both cast members',
      cast.every(p => intro.includes(p.name)) && /house/i.test(intro), intro.slice(0, 120) + '…');
    const tags0 = await page.evaluate(() => [...document.querySelectorAll('.seat .tag')].map(t => t.textContent));
    check('A: house seats wear the HOUSE segment; the human does not',
      !/HOUSE/.test(tags0[0] || '') && /HOUSE/.test(tags0[1] || '') && /HOUSE/.test(tags0[2] || ''), JSON.stringify(tags0));

    await page.tap('#btnRoundGo');
    await sleep(300);

    let plan = null;             // per-question record carried question -> vote -> reveal
    let prevStreaks = [0, 0, 0];
    let houseBanked = 0, houseMissed = 0;
    let auditCount = 0, auditBad = [];
    let cutHunted = false, cutSpent = false;
    let raceFast = false, raceSlow = false;
    let tapRuleChecked = false, numPrintChecked = false, fitChecked = false, shotTaken = false;
    let betChecked = 0, betBad = [];
    let guard = 0;

    while (guard++ < 1500) {
      const s = await S(page);
      if (!s) throw new Error('game state lost (A)');
      if (s.phase === 'over') break;
      if (s.phase === 'coldopen' || s.phase === 'spin' || s.phase === 'vote-count') { await sleep(280); continue; }
      if (s.phase === 'intro') { await page.tap('#btnRoundGo'); await sleep(280); continue; }
      if (s.phase === 'intermission') { await page.evaluate(() => { const b = document.getElementById('btnEraCall'); if (b) b.click(); }); await sleep(250); await page.tap('#btnBreakGo'); await sleep(280); continue; }
      if (s.phase === 'bet') {
        /* house policy: chips by the coming question's band, under the same cap */
        const caps = await page.evaluate(() => {
          const g = window.__game.G;
          return g.players.map((p, i) => {
            const lead = Math.max.apply(null, g.players.map(x => x.score));
            return Math.min(5, 3 + Math.floor(Math.max(0, lead - p.score) / 1000));
          });
        });
        const byBand = { 1: 3, 2: 2, 3: 1 };
        s.players.forEach((p, i) => {
          if (p.house !== null) {
            const want = Math.max(1, Math.min(caps[i], byBand[s.band] || 1));
            betChecked++;
            if (p.bet !== want) betBad.push('seat' + i + ' bet ' + p.bet + ' want ' + want + ' (band ' + s.band + ', cap ' + caps[i] + ')');
            if (p.bet < 1 || p.bet > caps[i]) betBad.push('seat' + i + ' bet outside its cap');
          }
        });
        const steppers = await page.evaluate(() => document.querySelectorAll('[data-bet]').length);
        if (steppers !== 2) betBad.push('bet steppers for house rows present: ' + steppers);
        await page.tap('#btnBetsDone'); await sleep(280); continue;
      }
      if (s.phase === 'question') {
        /* THE BLUFF (pass 2): the slot opens on the invent stage —
           deal the answers before anything else can happen */
        if (s.kind === 'bluff' && !s.bluffDealt) { await page.tap('#btnDealBluff'); await sleep(500); continue; }
        if (plan && plan.key === s.round + ':' + s.qInRound) { await sleep(280); continue; }
        plan = { key: s.round + ':' + s.qInRound, kind: s.kind, house: s.house, elapsed: s.elapsed, clockTotal: s.clockTotal, raced: null, pre: s.players.map(p => p.score), preStreaks: prevStreaks.slice() };
        if (!shotTaken && s.round === 2) {
          await page.screenshot({ path: SHOTS + '/house-1-solo.png' });
          shotTaken = true;
        }
        if (!fitChecked) {
          /* the longest house tag line, measured T11's way against a house desk, in portrait */
          await page.setViewport({ width: 390, height: 844 });
          await sleep(450);
          const fit = await page.evaluate(() => {
            const tag = document.querySelector('.seat.house .tag');
            const desk = document.querySelector('.seat.house .desk');
            if (!tag || !desk) return null;
            const cv = document.createElement('canvas').getContext('2d');
            const width = (el, text) => {
              const cs = getComputedStyle(el);
              cv.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
              return cv.measureText(text).width + (parseFloat(cs.letterSpacing) || 0) * (text.length - 1);
            };
            /* The grammar's true longest lines (re-pinned 2026-11-15,
               desk-tag fit pass): the standard tag's longest is the
               Round 3 form; the Long Shot line is longer still and
               wears the .lsl span, so it is measured in the span's
               own font. (The old synthetic line mixed CUT SPENT with
               a bet — segments the grammar never prints together —
               and understated the true worst case.) */
            const standard = 'HOUSE · BET 3 CHIPS · STREAK ×12';
            const longshot = 'HOUSE · LONG SHOT · BET 5 CHIPS · STREAK ×12';
            const probe = document.createElement('span');
            probe.className = 'lsl';
            probe.textContent = longshot;
            tag.appendChild(probe);
            const wStd = width(tag, standard);
            const wLs = width(probe, longshot);
            probe.remove();
            return { rendered: tag.scrollWidth <= tag.clientWidth + 1, longestW: Math.round(Math.max(wStd, wLs)), deskW: desk.clientWidth };
          });
          check('A: the longest house desk-tag combination fits the portrait desk',
            !!fit && fit.rendered && fit.longestW <= fit.deskW, JSON.stringify(fit));
          fitChecked = true;
          await page.setViewport({ width: 844, height: 390 });
          await sleep(300);
        }
        /* Cut Two hunt: a house policy is pending — let it fire before the human answers */
        const pend = s.house ? Object.keys(s.house).filter(k => s.house[k].cut === 'pending') : [];
        if (pend.length && !cutSpent) {
          const seat = +pend[0];
          const t0 = Date.now();
          while (Date.now() - t0 < 9000) {
            const now = await S(page);
            if (!now || now.phase !== 'question') break;
            if (now.players[seat].cut === 0 && now.house && now.house[seat] && now.house[seat].cut === 'spent') {
              cutSpent = true;
              check('A: a house Cut Two spend fires on policy — token spent, two wrong answers cut, the seat re-rolled',
                now.optsGone === 2, 'seat=' + seat + ' gone=' + now.optsGone);
              const tagTxt = await page.evaluate(i => document.querySelector('.seat[data-seat="' + i + '"] .tag').textContent, seat);
              check('A: the spent house seat\'s tag flips to CUT SPENT, like a human\'s', /CUT SPENT/.test(tagTxt), tagTxt);
              break;
            }
            await sleep(200);
          }
          cutHunted = true;
        }
        /* Pass 8 grammar: the human answers on their own desk —
           the house's marks are its rolls, settled from the same
           records the audit reads. The quick-draw race is now a
           real race: the human's pick is stamped from the clock,
           the house's locks were rolled at the deal. */
        if (s.kind === 'num') {
          let g2 = 0;
          while (g2++ < 12) {
            const st = await S(page);
            if (!st || st.phase !== 'question') break;
            const turn = await page.evaluate(() => { const g = window.__game.G; return g && g.cur ? g.cur.guessTurn : null; });
            if (turn == null || turn < 0) break;
            if (turn !== 0) break; /* only the human keys in; the house's numbers are its rolls */
            const target = (s.truth || 0) + 7; /* the declared shout: seven off, racing the house's rolls */
            for (const ch of String(target)) { await page.tap('[data-numk="' + ch + '"]').catch(() => {}); await sleep(40); }
            await page.tap('#btnNumLock').catch(() => {}); await sleep(200);
          }
        } else {
          if (!tapRuleChecked && s.kind === 'mcq') {
            const chips = await page.evaluate(() => [0, 1, 2].map(i => document.querySelectorAll('[data-pick^="' + i + '|"]').length));
            check('A: house seats carry no pick chips — their answer is their roll, never a tap',
              chips[0] > 0 && chips[1] === 0 && chips[2] === 0, 'chips=' + JSON.stringify(chips));
            tapRuleChecked = true;
          }
          const okHouse = s.house ? Object.keys(s.house).filter(k => s.house[k].ok).map(Number) : [];
          if (s.kind === 'mcq' && !raceFast && okHouse.length) {
            const slow = okHouse.map(i => s.house[i].lock).sort((a, b) => a - b)[0];
            if (slow > s.elapsed + 2) { plan.raced = 'fast'; raceFast = true; }
          }
          if (s.kind === 'mcq' && !plan.raced && !raceSlow && okHouse.length) {
            const quick = okHouse.map(i => s.house[i].lock).sort((a, b) => a - b)[0];
            if (quick < s.elapsed + 5) {
              const waitMs = Math.min(12000, Math.max(600, (quick - s.elapsed + 1.5) * 1000));
              await sleep(waitMs);
              plan.raced = 'slow'; raceSlow = true;
            }
          }
          if (s.kind === 'bluff') plan.bluff = true;
          const okIx = s.optsBy.findIndex(o => o.ok);
          if (okIx >= 0) { await page.tap('[data-pick="0|' + okIx + '"]').catch(() => {}); await sleep(200); }
        }
        await sleep(280);
        continue;
      }
      if (s.phase === 'vote' || s.phase === 'vote-count') { await sleep(280); continue; }
      if (s.phase === 'reveal') {
        /* the settlement audit: expected money rebuilt from the question's own records */
        if (plan && !plan.audited) {
          plan.audited = true;
          auditCount++;
          if (plan.kind === 'num' && !numPrintChecked && plan.house) {
            const printed = await page.evaluate(() => [...document.querySelectorAll('.seat.house .seat-guess')].map(e => e.textContent));
            const wantTxt = [1, 2].map(i => 'SHOUTED ' + Number(plan.house[i].guess).toLocaleString('en-US'));
            check('A: house numbers are printed on their seats at the reveal',
              printed.length === 2 && printed.every((t, k) => t === wantTxt[k]), JSON.stringify(printed) + ' want ' + JSON.stringify(wantTxt));
            numPrintChecked = true;
          }
          const qd = s.kind === 'mcq' ? (s.lockOrder.find(x => s.marks[x]) != null ? s.lockOrder.find(x => s.marks[x]) : -1) : -1;
          for (let i = 0; i < 3; i++) {
            /* THE BLUFF audits by its own grammar: a flat $200 for
               the truth (marks carry it) plus $25 per seat this
               seat's lie fooled, rebuilt from the picks themselves */
            const want = plan.bluff
              ? (s.marks[i] ? 200 : 0) + (function () {
                  const myOpt = s.optsBy.findIndex(o => o.by === i);
                  if (myOpt < 0 || !s.bluffPicks) return 0;
                  let n = 0;
                  Object.keys(s.bluffPicks).forEach(k => { if (+k !== i && s.bluffPicks[k] === myOpt) n++; });
                  return n * 25;
                })()
              : (s.marks[i]
                ? /* the two stakes (THE DOUBLE / AGAINST THE ROOM)
                     double the question's value only — Quick Draw
                     pays the round's figure (50 x round, review
                     Pass 5) and the streak bonus rides streakFx's
                     own recorded figure, as seatGain settles them */
                  ((s.betRound ? s.players[i].bet * 100 : s.bankValue) *
                    (!s.betRound && (s.dblSeats.includes(i) || (s.vsSeats.includes(i) && Object.keys(s.marks).length === 1)) ? 2 : 1)) +
                  (i === qd ? 50 * (s.round || 1) : 0) + (s.streakFx && s.streakFx[i] ? (s.streakFx[i].bonus || 0) : 0)
                : 0);
            const gotGain = s.players[i].score - plan.pre[i];
            if (gotGain !== want) auditBad.push(plan.key + ' seat' + i + ' gain ' + gotGain + ' want ' + want);
            const wantStreak = s.kind === 'mcq' ? (s.marks[i] ? plan.preStreaks[i] + 1 : 0) : plan.preStreaks[i];
            if (s.players[i].streak !== wantStreak) auditBad.push(plan.key + ' seat' + i + ' streak ' + s.players[i].streak + ' want ' + wantStreak);
            if (s.players[i].house !== null) { if (s.marks[i]) houseBanked++; else houseMissed++; }
          }
          if (plan.raced) {
            const qdSeat = s.lockOrder.find(x => s.marks[x]);
            if (plan.raced === 'fast') check('A: quick-draw — a fast host tap beats the house\'s slower simulated lock', qdSeat === 0, 'qd=' + qdSeat + ' order=' + JSON.stringify(s.lockOrder));
            else check('A: quick-draw — a waited-out tap loses to the house\'s quicker simulated lock', qdSeat !== 0 && s.players[qdSeat].house !== null, 'qd=' + qdSeat + ' order=' + JSON.stringify(s.lockOrder));
          }
        }
        prevStreaks = s.players.map(p => p.streak);
        plan = null;
        const b = await page.$('#btnNext'); if (b) { await b.tap(); await sleep(280); continue; }
      }
      await sleep(280);
    }
    const end = await S(page);
    check('A: the solo show reaches a finale', !!end && end.phase === 'over', 'phase=' + (end && end.phase));
    check('A: every reveal\'s settlement equals the sum of its seat parts (15 questions audited)', auditCount >= 15 && auditBad.length === 0,
      'audited=' + auditCount + (auditBad.length ? ' BAD: ' + auditBad.slice(0, 3).join(' ;; ') : ''));
    check('A: house seats both banked and missed across the show', houseBanked > 0 && houseMissed > 0, 'banked=' + houseBanked + ' missed=' + houseMissed);
    check('A: a house Cut Two policy came due during the show', cutHunted, 'hunted=' + cutHunted + ' spent=' + cutSpent);
    check('A: house Big Finish bets followed policy under the cap, all three questions', betChecked >= 6 && betBad.length === 0,
      'betsChecked=' + betChecked + (betBad.length ? ' BAD: ' + betBad.slice(0, 3).join(' ;; ') : ''));
    check('A: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' ;; '));
    await page.close();
  }

  /* ============ Scenario B — the Decider, the house win, the two books ============ */
  {
    const { page, errors } = await newPage(browser);
    await enterSolo(page, 'Solo Sam');
    const g0 = await S(page);
    const houseSeat = 1, houseName = g0.players[houseSeat].name, humanName = g0.players[0].name;
    await page.tap('#btnRoundGo');
    await sleep(300);
    let staged = false, guard = 0, deciderPrintChecked = false;
    const actedB = new Set();
    while (guard++ < 1500) {
      const s = await S(page);
      if (!s) throw new Error('game state lost (B)');
      if (s.phase === 'over') break;
      if (s.phase === 'coldopen' || s.phase === 'spin' || s.phase === 'vote-count') { await sleep(250); continue; }
      if (s.phase === 'intro') { await page.tap('#btnRoundGo'); await sleep(250); continue; }
      if (s.phase === 'intermission') { await page.evaluate(() => { const b = document.getElementById('btnEraCall'); if (b) b.click(); }); await sleep(250); await page.tap('#btnBreakGo'); await sleep(250); continue; }
      if (s.phase === 'bet') { await page.tap('#btnBetsDone'); await sleep(250); continue; }
      if (s.phase === 'question') {
        /* THE BLUFF (pass 2): deal the invent stage first */
        if (s.kind === 'bluff' && !s.bluffDealt) { await page.tap('#btnDealBluff'); await sleep(500); continue; }
        const keyB = s.round + ':' + s.qInRound + ':' + s.kind + ':' + (s.decider ? 'dec' : '');
        if (actedB.has(keyB)) { await sleep(250); continue; }
        actedB.add(keyB);
        if (s.decider) {
          check('B: the tied house player plays the Decider — eligible, with its number dealt',
            s.decider.eligible.includes(houseSeat) && s.decider.eligible.includes(0) && !!s.house && s.house[houseSeat] && s.house[houseSeat].guess != null,
            'eligible=' + JSON.stringify(s.decider.eligible));
        }
        /* Pass 8 grammar: the human answers on their own desk —
           on the Decider they key a number nowhere near, and the
           house's rolled number takes it on the computed closest */
        if (s.kind === 'num') {
          let g2 = 0;
          while (g2++ < 12) {
            const turn = await page.evaluate(() => { const g = window.__game.G; return g && g.cur ? g.cur.guessTurn : null; });
            if (turn == null || turn < 0 || turn !== 0) break;
            const target = s.decider ? (s.truth || 0) + 5000 : (s.truth || 0);
            for (const ch of String(target)) { await page.tap('[data-numk="' + ch + '"]').catch(() => {}); await sleep(40); }
            await page.tap('#btnNumLock').catch(() => {}); await sleep(200);
            break;
          }
        } else {
          const okIx = s.optsBy.findIndex(o => o.ok);
          if (okIx >= 0) { await page.tap('[data-pick="0|' + okIx + '"]').catch(() => {}); await sleep(200); }
        }
        await sleep(250); continue;
      }
      if (s.phase === 'vote' || s.phase === 'vote-count') { await sleep(250); continue; }
      if (s.phase === 'reveal') {
        if (s.decider && !deciderPrintChecked) {
          deciderPrintChecked = true;
          const printed = await page.evaluate(i => {
            const e = document.querySelector('.seat[data-seat="' + i + '"] .seat-guess');
            return e ? e.textContent : null;
          }, houseSeat);
          check('B: the house Decider number is printed on its seat at the reveal',
            printed === 'SHOUTED ' + Number(s.house[houseSeat].guess).toLocaleString('en-US'), String(printed));
        }
        if (!staged && s.round === 3 && s.qInRound === 2 && !s.decider) {
          /* stage the tie: human and house seat level at the top */
          await page.evaluate(hs => {
            const g = window.__game.G;
            g.players[0].score = 2000; g.players[hs].score = 2000; g.players[2].score = 400;
          }, houseSeat);
          staged = true;
        }
        const b = await page.$('#btnNext'); if (b) { await b.tap(); await sleep(280); continue; }
      }
      await sleep(250);
    }
    const end = await S(page);
    check('B: the staged tie resolved through the Decider to a finale', !!end && end.phase === 'over' && staged, 'phase=' + (end && end.phase));
    const fin = await page.evaluate(() => ({
      winner: document.querySelector('.winner-name') ? document.querySelector('.winner-name').textContent : '',
      line: document.querySelector('#hostLine') ? document.querySelector('#hostLine').textContent : '',
    }));
    check('B: the finale names the house player and says the house took it',
      fin.winner.includes(houseName) && /HOUSE WIN/.test(fin.winner) && fin.line.includes(houseName),
      'winner=' + fin.winner + ' | line=' + fin.line.slice(0, 100));
    const books = await page.evaluate(() => ({
      rec: JSON.parse(localStorage.getItem('gh_records_v1') || 'null'),
      ser: JSON.parse(localStorage.getItem('gh_series_v1') || 'null'),
    }));
    const recKeys = books.rec ? Object.keys(books.rec.players || {}) : [];
    check('B: Sterling\'s Record writes only the human — no house purse, no crown',
      recKeys.length === 1 && recKeys[0] === humanName.toLowerCase() && books.rec.players[recKeys[0]].shows === 1 &&
      books.rec.players[recKeys[0]].wins === 0 && !books.rec.champion,
      JSON.stringify(books.rec));
    check('B: the night\'s series DOES count the house win',
      !!books.ser && (books.ser.wins[houseName.toLowerCase()] || 0) === 1 && books.ser.shows === 1,
      JSON.stringify(books.ser));
    check('B: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' ;; '));
    await page.close();
  }

  const fails = results.filter(r => !r.ok).length;
  console.log('DRIVE-HOUSE DONE — ' + (results.length - fails) + '/' + results.length + ' checks passed');
  await browser.close();
  process.exit(fails ? 2 : 0);
})().catch(e => { console.error('DRIVE-HOUSE FAIL:', e.message); process.exit(1); });
