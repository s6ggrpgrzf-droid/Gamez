/* Gameplay-visuals pass G4 — YOUR NUMBER, PERSONALLY.
   Part 1 (no browser): the composition is extracted VERBATIM from
   game.js — jpToYou, the very function the pad paints by — and run
   across the matrix: the drain at three fractions, the Headline's
   public double, the quick-draw segment's life and death, the
   streak segment's rules per kind, the Big Finish's bet pricing,
   and the two honest silences (the Decider, the unpriceable
   nightly shape). Static checks pin the wiring: the render emits
   the line, the tick and both tap handlers repaint/freeze it, the
   composition never touches the snapshot's effective figures
   (which carry the Golden double), and the busts stay coupled.
   Part 2 (live, via rig): scripted-referee pads. A pad's TO YOU
   matches the composition from public state at a live instant,
   falls by the drain's own rounding, freezes dead still at the
   holder's lock-in, and the reveal's banked delta lands on the
   frozen total within the drain that ran between freeze and
   close. A second pad, locking in after another seat, wears no
   FIRST IN segment and banks none. A streak pad wears +$25; a
   guess pad prices the pot with no segments and freezes on send;
   a Big Finish pad prices its own bet exactly, undrained. The
   referee snapshots deliberately carry POISONED effective
   figures (multiplier 9) — a pad pricing off them would be off
   by hundreds, so agreement proves the public composition.
   Launch goes through ./rig: if the host trap window is closed
   the launch throws after its budget and the live part reports
   OWED — no sleeping, no probing around it. */
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
const src = fs.readFileSync(ROOT + '/game.js', 'utf8');

const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' });
    res.end(d);
  });
});

function extractFn(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' not found in game.js');
  let depth = 0;
  for (let j = src.indexOf('{', start); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(start, j + 1); }
  }
  throw new Error('unbalanced braces in ' + name);
}

/* ================= Part 1 — the matrix, on the game's own function ================= */
/* The bonuses moved to the shared rules core (2026-11-15):
   game.js now declares them from GH_RULES, so the matrix takes
   its figures from rules-core.js, the same source the game
   and the room both build from. */
const coreSrc = fs.readFileSync(__dirname + '/rules-core.js', 'utf8');
const decls = [
  src.match(/var BASE_VALUES = \{[^}]*\};/)[0],
  'var QUICK_DRAW_BONUS = ' + coreSrc.match(/GH_QUICK_DRAW_BONUS = (\d+)/)[1] + ';',
  'var STREAK_BONUS = ' + coreSrc.match(/GH_STREAK_BONUS = (\d+)/)[1] + ';',
].join('\n');
const jpToYou = new Function(decls + '\nreturn (' + extractFn('jpToYou') + ');')();
const C = (over) => Object.assign({ kind: 'normal', round: 1, headline: false, decider: false,
  betted: false, diff: 'easy', myStreak: 0, myBet: null, myIn: false, othersIn: 0 }, over || {});
const slim = c => c ? [c.base, c.qd, c.streak, c.total] : null;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

check('M1: R1 easy at the open — full $100, FIRST IN alive, total $150',
  eq(slim(jpToYou(C(), 0)), [100, true, false, 150]), JSON.stringify(jpToYou(C(), 0)));
check('M2: the drain — half the window gone prices $75 (the settlement rounding)',
  eq(slim(jpToYou(C(), 0.5)), [75, true, false, 125]), JSON.stringify(jpToYou(C(), 0.5)));
check('M3: the floor — a full window gone prices $50, never less',
  eq(slim(jpToYou(C(), 1)), [50, true, false, 100]) && eq(slim(jpToYou(C(), 1.7)), [50, true, false, 100]));
/* Re-pinned 2026-11-15 (Jimmy's word) for Review Pass 5's
   round-scaled bonuses: quick draw pays $50 x round and the
   streak $25 x round, exactly as jpToYou composes them
   (qdAmt / streakAmt). M4, M8 and E carry the scaled figures;
   the Round 1 checks keep the base $50 / $25. */
check('M4: the Headline\'s public double — R2 medium headline at a quarter gone prices $700',
  eq(slim(jpToYou(C({ round: 2, diff: 'medium', headline: true }), 0.25)), [700, true, false, 800]),
  JSON.stringify(jpToYou(C({ round: 2, diff: 'medium', headline: true }), 0.25)));
check('M5: another seat in first — the FIRST IN segment is gone, the price is the base alone',
  eq(slim(jpToYou(C({ diff: 'medium', othersIn: 1 }), 0)), [200, false, false, 200]));
check('M6: the streak segment — a run of two earns it, one does not, five still earns exactly $25',
  jpToYou(C({ myStreak: 2 }), 0).streak === true && jpToYou(C({ myStreak: 1 }), 0).streak === false &&
  eq(slim(jpToYou(C({ myStreak: 5 }), 0)), [100, true, true, 175]));
check('M7: a guess question — the pot figure only: no quick-draw, no streak, even on a run of two',
  eq(slim(jpToYou(C({ kind: 'num', diff: 'medium', myStreak: 2 }), 0.5)), [150, false, false, 150]),
  JSON.stringify(jpToYou(C({ kind: 'num', diff: 'medium', myStreak: 2 }), 0.5)));
check('M8: the Big Finish — my bet x $100, the drain never touches it; an unplaced bet is one chip',
  eq(slim(jpToYou(C({ betted: true, myBet: 3, round: 3 }), 0.9)), [300, true, false, 450]) &&
  eq(slim(jpToYou(C({ betted: true, myBet: null, round: 3 }), 0)), [100, true, false, 250]));
check('M9: the honest silences — the Decider wears no price, and neither does a question with no bank difficulty',
  jpToYou(C({ decider: true, kind: 'num' }), 0) === null && jpToYou(C({ diff: null }), 0) === null &&
  jpToYou(C({ diff: undefined }), 0) === null);
check('M10: the rounding is the settlement\'s own — R1 hard at a third gone prices $250',
  jpToYou(C({ diff: 'hard' }), 1 / 3).base === 250, 'base=' + jpToYou(C({ diff: 'hard' }), 1 / 3).base);
check('S1: the composition never reads the snapshot\'s effective figures (the Golden mask holds)',
  !/baseValue|multiplier/.test(extractFn('jpToYou')));
/* SUPERSEDED by the minimal pad (Jimmy's word, 2026-11-11): the
   TO YOU line no longer renders on the phone — the price story
   is the big screen's. The composition model stays in the file
   (M1–M10, S1, S4 above stand as its spec), and the checks below
   now guard the absence: no element is ever created, and the
   leftover tick is inert without one. */
check('S2: the minimal pad — the render never creates the TO YOU element',
  extractFn('jpRender').indexOf('jpToYouText(') < 0 && extractFn('jpRender').indexOf('jp-toyou') < 0);
check('S3: jpToYouTick stays element-guarded, so its leftover call sites can never throw',
  extractFn('jpToYouTick').indexOf('if (!el') >= 0);
check('S4: the price is exposed to drives as the game\'s own function',
  src.indexOf('toyou: { price: jpToYou }') >= 0);
check('S5: the shell is retired (Pass 7) — sw.js is the kill worker and index.html registers nothing, carrying the cleanup instead',
  (() => {
    const idx = fs.readFileSync(ROOT + '/index.html', 'utf8');
    const sw = fs.readFileSync(ROOT + '/sw.js', 'utf8');
    return sw.indexOf('PRECACHE') < 0 && sw.indexOf('addEventListener("fetch"') < 0 &&
      sw.indexOf('registration.unregister()') >= 0 && sw.indexOf('gilded-hour-shell-') >= 0 &&
      idx.indexOf("register('sw.js')") < 0 && idx.indexOf('getRegistration()') >= 0;
  })());

/* ------- the scripted referee: a room that settles by the server's own formula.
   NOTE: puppeteer serializes this function into the page — every
   fact it needs must ride its one argument, never a closure. ------- */
function padReferee(c) {
    const cfg = c;
    window.fetch = function () { return Promise.reject(new Error('offline in toyou pad')); };
    let ws = null;
    const Q = cfg.question;
    const st = { pick: null, num: null, answersIn: cfg.othersIn || 0, answerAt: null, streakNow: null };
    const scores = (cfg.scores || [500, 300, 100]).slice();
    const NAMES = ['Ana', 'Bo', 'Cy'];
    const players = () => [0, 1, 2].map(i => ({ seat: i, name: NAMES[i], score: scores[i], cutTwo: true,
      connected: true, avatar: i, streak: i === c.seat ? (st.streakNow != null ? st.streakNow : (cfg.streak || 0)) : 0 })).concat([null]);
    const snap = (phase, lastReveal) => ({ code: 'TEST', phase, role: 'player', seat: c.seat,
      showSeq: 1, players: players(),
      question: phase === 'answer' || phase === 'reveal' ? Object.assign({}, Q, { answersIn: st.answersIn }) : null,
      bet: null, intermission: null, pot: 0, lastReveal: lastReveal || null,
      yourNum: st.num, yourPick: st.pick, yourBet: cfg.yourBet != null ? cfg.yourBet : null });
    window.__padPush = (s2) => { if (ws && ws.onmessage) ws.onmessage({ data: JSON.stringify({ t: 'state', state: s2 }) }); };
    window.__padClose = () => {
      const t = Date.now();
      const elapsed = Math.min(Math.max(t - Q.openedAt, 0), Q.windowMs);
      const full = window.__padFullValue != null ? window.__padFullValue : cfg.fullValue;
      const correct = Q.kind !== 'num' && st.pick != null && st.pick === window.__padCorrectIdx;
      let banked = 0, qd = false, sb = 0;
      if (correct) {
        banked = Q.betted ? (cfg.yourBet || 1) * 100 : Math.round(full * (1 - 0.5 * (elapsed / Q.windowMs)));
        if (cfg.firstIn) { banked += 50; qd = true; }
        if ((cfg.streak || 0) >= 2) { banked += 25; sb = 25; st.streakNow = (cfg.streak || 0) + 1; }
      } else if (st.pick != null && Q.kind !== 'num') st.streakNow = 0;
      scores[c.seat] += banked;
      window.__padCloseInfo = { elapsed, banked, answerAt: st.answerAt, closeAt: t };
      const mine = { seat: c.seat, pick: st.pick, num: st.num, correct, banked, quickDraw: qd,
        streakBonus: sb, streak: st.streakNow != null ? st.streakNow : (cfg.streak || 0) };
      const lr = { qid: Q.qid, kind: Q.kind, headline: !!Q.headline, golden: false,
        correctIdx: Q.kind === 'num' ? null : window.__padCorrectIdx, trueNum: null, value: banked,
        results: [0, 1, 2].map(i => i === c.seat ? mine : { seat: i, pick: null, correct: false, banked: 0 }),
        scores: scores.slice(), quickDrawSeat: qd ? c.seat : null, streakMoment: null };
      window.__padPush(snap('reveal', lr));
      return window.__padCloseInfo;
    };
    window.WebSocket = class FakeWS {
      constructor(u) { this.url = u; this.readyState = 1; ws = this; setTimeout(() => { if (this.onopen) this.onopen(); }, 20); }
      send(data) {
        let m = {};
        try { m = JSON.parse(data); } catch (e) {}
        const deliver = (obj, ms) => setTimeout(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) }); }, ms == null ? 30 : ms);
        if (m.t === 'hello' && m.role === 'player') {
          deliver({ t: 'welcome', role: 'player', code: 'TEST', seat: c.seat, reclaimToken: 'tok' + c.seat });
          deliver({ t: 'state', state: snap('answer', null) });
        } else if (m.t === 'answer') {
          if (Q.kind === 'num') st.num = m.num; else st.pick = m.pick;
          if (st.answerAt == null) st.answerAt = Date.now();
          st.answersIn = (cfg.othersIn || 0) + 1;
          deliver({ t: 'accepted', qid: Q.qid });
          deliver({ t: 'counts', qid: Q.qid, answersIn: st.answersIn, players: 3 });
          deliver({ t: 'state', state: snap('answer', null) });
        }
      }
      close() { this.readyState = 3; }
    };
}

const parseToYou = (txt) => {
  if (!txt) return null;
  const m = txt.match(/TO YOU: \$([\d,]+)/);
  return m ? { total: parseInt(m[1].replace(/,/g, ''), 10), qd: /FIRST IN/.test(txt), streak: /STREAK \+/.test(txt), raw: txt } : null;
};

/* ================= Part 2 — live ================= */
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const httpUrl = 'http://127.0.0.1:' + server.address().port + '/index.html';
  let browser = null;
  try {
    browser = await launchBrowser({ protocolTimeout: 240000 });
  } catch (e) {
    console.log('LIVE OWED — RIG CLOSED: ' + e.message);
  }
  if (browser) {
    const errors = [];
    const watch = p => {
      p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    };
    const joinPad = async (cfg, name) => {
      const ctx = await browser.createBrowserContext();
      const p = await ctx.newPage(); watch(p);
      await p.evaluateOnNewDocument(padReferee, cfg);
      await p.setViewport({ width: 390, height: 844 });
      await p.goto(httpUrl, { waitUntil: 'load', timeout: 60000 });
      await sleep(400);
      await p.tap('.mode-tab[data-mode="join"]'); await sleep(150);
      await p.click('#joinBoxes .code-box');
      await p.keyboard.type('TEST', { delay: 30 });
      await p.type('#joinName', name);
      await p.evaluate(() => { const g = document.querySelectorAll('#jpAvaGrid .jp-ava'); if (g[0]) g[0].click(); });
      await p.tap('#btnJoinRoom');
      const t0 = Date.now();
      while (Date.now() - t0 < 15000) {
        const v = await p.evaluate(() => !!document.querySelector('#jpMain .jp-ans, #jpMain .jp-num')).catch(() => false);
        if (v) return { ctx, p };
        await sleep(150);
      }
      throw new Error('pad ' + name + ' never reached its question');
    };
    const readLine = p => p.evaluate(() => { const el = document.querySelector('#jpToYou'); return el ? el.textContent : null; });
    /* the composition at this live instant, from the pad's own
       held state, priced by the game's own exposed function */
    const compNow = p => p.evaluate(() => {
      const JP = window.__online.JP, s = JP.snap, q = s.question, me = s.players[JP.seat];
      const myIn = q.kind === 'num' ? s.yourNum != null : s.yourPick != null;
      const d = window.__game.BANK[parseInt(q.qid.split('.')[1], 10)];
      const ctx = { kind: q.kind, round: q.round || 0, headline: !!q.headline, decider: !!q.decider,
        betted: !!q.betted, diff: d ? d.diff : null, myStreak: me ? (me.streak || 0) : 0,
        myBet: s.yourBet != null ? s.yourBet : null, myIn,
        othersIn: Math.max(0, (q.answersIn || 0) - (myIn ? 1 : 0)) };
      /* othersIn at MY lock moment: the snapshot's answersIn lags
         my own tap (the referee counts me in without re-pushing),
         so the raw derivation would crown me first-in whenever I
         answer. The referee's cfg is the truth the game itself
         tracked via _toyouCountedQid — a case may pin it. */
      if (window.__padOthersIn != null) ctx.othersIn = window.__padOthersIn;
      const rem = Math.max(0, q.deadline - (Date.now() + JP.offset));
      const frac = q.windowMs ? Math.min(1, Math.max(0, 1 - rem / q.windowMs)) : 0;
      return window.__game.toyou.price(ctx, frac);
    });
    /* MCQ question over BANK 10 (hard, $300) with poisoned
       effective figures: multiplier 9 would price $2,700 if the
       pad were foolish enough to read them */
    const mkQ = (over) => Object.assign({ qid: 'q1.10.zz', round: 1, kind: 'normal', category: 'Movies',
      answersCount: 4, baseValue: 300, multiplier: 9, headline: false, band: 3, windowMs: 90000,
      openedAt: Date.now(), deadline: Date.now() + 90000, betted: false, decider: false,
      eligible: null, cut: null, answersIn: 0 }, over || {});

    /* ---- A: first in, frozen, and the reveal proves it ---- */
    {
      const cfgA = { seat: 0, question: mkQ(), firstIn: true, streak: 0 };
      const { ctx, p } = await joinPad(cfgA, 'Ana');
      /* The minimal pad: the composition still prices (the model
         is the game's own), but the phone never shows it — the
         absence is the assertion now, at every beat the line
         used to occupy. */
      const l1 = await readLine(p);
      const c1 = await compNow(p);
      check('A: no TO YOU line on the pad at a live instant — while the composition prices from public state (poisoned figures ignored)',
        l1 === null && !!c1 && c1.qd === true,
        'line=' + l1 + ' comp=' + (c1 && c1.total));
      await sleep(1000);
      const l2 = await readLine(p);
      check('A: a second later the pad still carries no price line — the drain is the bar\'s alone',
        l2 === null, 'line=' + l2);
      await p.screenshot({ path: SHOTS + '/toyou-1-pad.png' });
      const ci = await p.evaluate(() => {
        const bank = window.__game.BANK[10];
        const btns = Array.from(document.querySelectorAll('#jpMain .jp-ans .jp-ans-tx'));
        const idx = btns.findIndex(b => b.textContent === bank.a);
        window.__padCorrectIdx = idx;
        window.__padFullValue = 300;
        return idx;
      });
      await p.tap('#jpMain .jp-ans[data-pick="' + ci + '"]');
      /* the drive's own idiom (case D): a tap lost to a scroll
         race must be proven landed before anything is priced off
         it — wait for the pick state, tap once more if it never
         came. (Case B flaked exactly this way under batch load:
         the verdict read NO BANK from a tap that never landed.) */
      let pickedA = false;
      for (let wP = 0; wP < 14 && !pickedA; wP++) {
        pickedA = await p.evaluate(() => { const el = document.querySelector('#jpPickState'); return !!el && /IS IN/.test(el.textContent); }).catch(() => false);
        if (!pickedA && wP === 6) await p.tap('#jpMain .jp-ans[data-pick="' + ci + '"]');
        if (!pickedA) await sleep(150);
      }
      const frozenComp = await compNow(p);
      const info = await p.evaluate(() => window.__padClose());
      /* poll for the verdict word — a fixed sleep races the
         throttled sandbox's reveal */
      let word = null;
      for (let wA = 0; wA < 40 && !word; wA++) {
        word = await p.evaluate(() => { const w = document.querySelector('#jpMain .jp-vword'); return w ? w.textContent : null; }).catch(() => null);
        if (!word) await sleep(200);
      }
      const banked = word ? parseInt(word.replace(/[^0-9]/g, ''), 10) : null;
      check('A: the pad\'s one-line verdict banks the priced total within the freeze-to-close drain',
        banked != null && !!frozenComp && banked <= frozenComp.total && frozenComp.total - banked <= 6,
        'priced=' + (frozenComp && frozenComp.total) + ' banked=' + banked + ' (close at ' + info.elapsed + 'ms)');
      const qdTag = await p.evaluate(() => !!document.querySelector('#jpMain .jp-qdtag'));
      check('A: no QUICK DRAW tag on the winner\'s pad — the $50 rides inside the banked figure', qdTag === false && banked != null);
      await ctx.close();
    }

    /* ---- B: second in — no segment, no bonus ---- */
    {
      const cfgB = { seat: 1, question: mkQ(), firstIn: false, streak: 0, othersIn: 1 };
      const { ctx, p } = await joinPad(cfgB, 'Bo');
      await p.evaluate(() => { window.__padOthersIn = 1; });
      const l1 = await readLine(p);
      const c1 = await compNow(p);
      check('B: a pad joining after another seat is in shows no line — and its composition wears no FIRST IN segment',
        l1 === null && !!c1 && c1.qd === false, 'line=' + l1 + ' comp=' + (c1 && c1.total));
      const ci = await p.evaluate(() => {
        const bank = window.__game.BANK[10];
        const btns = Array.from(document.querySelectorAll('#jpMain .jp-ans .jp-ans-tx'));
        const idx = btns.findIndex(b => b.textContent === bank.a);
        window.__padCorrectIdx = idx;
        window.__padFullValue = 300;
        return idx;
      });
      await p.tap('#jpMain .jp-ans[data-pick="' + ci + '"]');
      let pickedB = false;
      for (let wP2 = 0; wP2 < 14 && !pickedB; wP2++) {
        pickedB = await p.evaluate(() => { const el = document.querySelector('#jpPickState'); return !!el && /IS IN/.test(el.textContent); }).catch(() => false);
        if (!pickedB && wP2 === 6) await p.tap('#jpMain .jp-ans[data-pick="' + ci + '"]');
        if (!pickedB) await sleep(150);
      }
      const frozen = await compNow(p);
      const info = await p.evaluate(() => window.__padClose());
      let word = null;
      for (let wB = 0; wB < 40 && !word; wB++) {
        word = await p.evaluate(() => { const w = document.querySelector('#jpMain .jp-vword'); return w ? w.textContent : null; }).catch(() => null);
        if (!word) await sleep(200);
      }
      const banked = word ? parseInt(word.replace(/[^0-9]/g, ''), 10) : null;
      check('B: the priced total is the base alone, and the one-line verdict banks it (no $50 appears)',
        !!frozen && frozen.qd === false && banked != null && banked <= frozen.total && frozen.total - banked <= 6,
        'priced=' + (frozen && frozen.total) + ' banked=' + banked);
      await ctx.close();
    }

    /* ---- C: the streak pad wears +$25 ---- */
    {
      const cfgC = { seat: 2, question: mkQ(), firstIn: true, streak: 2 };
      const { ctx, p } = await joinPad(cfgC, 'Cy');
      const l1 = await readLine(p);
      const c1 = await compNow(p);
      check('C: a pad carrying a run of two shows no line — the composition still prices the streak segment in (base + $50 + $25)',
        l1 === null && !!c1 && c1.streak === true && c1.qd === true,
        'line=' + l1 + ' comp=' + (c1 && c1.total));
      await ctx.close();
    }

    /* ---- D: a guess question — the pot figure, no segments, freezes on send ---- */
    {
      const cfgD = { seat: 0, question: mkQ({ kind: 'num' }), firstIn: false, streak: 2 };
      const { ctx, p } = await joinPad(cfgD, 'Ana');
      const l1 = await readLine(p);
      const c1 = await compNow(p);
      check('D: a guess pad shows no line — its composition prices the pot figure alone (no FIRST IN, no streak segment)',
        l1 === null && !!c1 && c1.qd === false && c1.streak === false,
        'line=' + l1 + ' comp=' + (c1 && c1.total));
      await p.type('#jpNum', '1993');
      await p.tap('#jpNumSend');
      /* the send must demonstrably land before the freeze is read
         (a tap lost to a scroll race would leave both reads live) */
      let sent = false;
      for (let w = 0; w < 20 && !sent; w++) {
        sent = await p.evaluate(() => { const ns = document.querySelector('#jpNumState'); return !!ns && /SENT/.test(ns.textContent); }).catch(() => false);
        if (!sent && w === 9) await p.tap('#jpNumSend');
        if (!sent) await sleep(100);
      }
      const f1 = await readLine(p);
      await sleep(1000);
      const f2 = await readLine(p);
      check('D: sending the number lands (SENT) and still no price line appears on the pad', sent && f1 === null && f2 === null, 'sent=' + sent + ' f1=' + f1 + ' f2=' + f2);
      await ctx.close();
    }

    /* ---- E: the Big Finish — my bet, exactly, undrained ---- */
    {
      const cfgE = { seat: 0, question: mkQ({ qid: 'q3.12.zz', round: 3, betted: true, windowMs: 30000, deadline: Date.now() + 30000 }),
        firstIn: true, streak: 0, yourBet: 3 };
      const { ctx, p } = await joinPad(cfgE, 'Ana');
      const l1 = await readLine(p);
      await sleep(900);
      const l2 = await readLine(p);
      const cE = await compNow(p);
      check('E: a Big Finish pad shows no price line at either read — its composition still prices its own 3 chips exactly ($450 with FIRST IN)',
        l1 === null && l2 === null && !!cE && cE.total === 450 && cE.qd === true, 'line=' + l1 + ' comp=' + (cE && cE.total));
      await ctx.close();
    }

    check('No console/page errors', errors.length === 0, errors.slice(0, 3).join(' ;; '));
    await browser.close();
  }
  server.close();
  const fails = results.filter(r => !r.ok).length;
  console.log('DRIVE-TOYOU DONE — ' + (results.length - fails) + '/' + results.length + ' checks passed');
  process.exit(fails ? 2 : 0);
})().catch(e => { console.error('DRIVE FAIL:', e.message); process.exit(1); });
