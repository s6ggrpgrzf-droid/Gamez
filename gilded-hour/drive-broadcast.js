/* Visual pass V5 — THE BROADCAST FINISH: one pre-rendered grade
   over the shared screens.
   A: census — exactly two .bc-grade elements exist (title + game
      stage); the pad screen (#scr-join) holds none, by construction.
   B: components — on the title and again on the game stage, the
      three layers measure out: the element's own warm radial, the
      ::before vignette radial, the ::after grain (a data-URI PNG at
      opacity .04-.06); pointer-events none; nothing animated.
   C: stillness — two title screenshots 1s apart are pixel-identical
      over the two corner patches the grade darkens most (curtain +
      background + grade only — nothing else moves there), so the
      grain provably never moves.
   D: taps land through it — START on the graded title, a desk pick
      on the graded stage. (Pass 5 repair: CALL IT is gone in the
      no-host flow; the pick is the stage tap that matters now.)
   E: contrast — an answer slab's effective text/background ratio,
      sampled from real pixels with the grade ON, stays >= 4.5:1
      and within a whisker of the grade-OFF ratio. (The pass's own
      sums live in style.css: a uniform over-everything grade was
      measured dragging the tightest audited stops to ~3.97:1, so
      the stage's grade stands over the ROOM at z-0, beneath the
      furniture — the drop here should read ~0.00, proven in pixels,
      and the analytic stop table is what guards the categories
      this drive's dealt question didn't happen to be.)
   F: the finale — the show plays out to a crowned winner and the
      stage's grade measures out again on the winner screen (the
      finale renders inside #scr-game and wears the same element). */
const { launchBrowser } = require('./rig');
const fs = require('fs');

const ROOT = '/home/hatch/workspace/gilded-hour';
const SHOTS = ROOT + '/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok, detail }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); }
const url = 'file://' + ROOT + '/index.html';

(async () => {
  const browser = await launchBrowser({ protocolTimeout: 240000 });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.setViewport({ width: 844, height: 390 });

  const S = () => page.evaluate(() => {
    const g = window.__game.G;
    if (!g) return null;
    return { phase: g.phase, round: g.round, qInRound: g.qInRound, kind: g.cur ? g.cur.kind : null,
      truth: g.cur && g.cur.q ? g.cur.q.num : null,
      picks: g.cur ? (g.cur.picks || null) : null,
      bluffPicks: g.cur ? (g.cur.bluffPicks || null) : null,
      guessTurn: g.cur ? g.cur.guessTurn : null,
      bluffDealt: g.cur ? !!g.cur.bluffDealt : false,
      opts: g.cur && g.cur.opts ? g.cur.opts.map(o => ({ ok: !!o.ok, gone: !!o.gone, by: o.by != null ? o.by : -1 })) : null };
  });
  const waitPhase = async (want, timeout) => {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeout || 30000)) {
      const s = await S();
      if (s && s.phase === want) return s;
      await sleep(150);
    }
    throw new Error('timeout waiting for phase ' + want + ' (now ' + JSON.stringify(await S()) + ')');
  };
  /* the grade's three layers, measured off the live element */
  const probe = sel => page.evaluate(s => {
    const el = document.querySelector(s + ' .bc-grade');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const cb = getComputedStyle(el, '::before');
    const ca = getComputedStyle(el, '::after');
    const r = el.getBoundingClientRect();
    return {
      pe: cs.pointerEvents, z: cs.zIndex,
      warm: cs.backgroundImage, anim: cs.animationName,
      vig: cb.backgroundImage, animB: cb.animationName,
      grainOp: parseFloat(ca.opacity), grainBg: (ca.backgroundImage || '').slice(0, 30),
      grainPos: ca.backgroundPosition, animA: ca.animationName,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height }
    };
  }, sel);
  const gradeOk = (p, label, zWant) => {
    check(label + ': stacking as designed (z-index ' + zWant + ')',
      !!p && p.z === String(zWant), p ? 'z=' + p.z : 'missing');
    check(label + ': warm grade layer present (amber radial on the element)',
      !!p && p.warm.indexOf('radial-gradient') > -1 && p.warm.indexOf('255, 178, 96') > -1,
      p ? p.warm.slice(0, 90) : 'missing');
    check(label + ': vignette present (::before radial)',
      !!p && p.vig.indexOf('radial-gradient') > -1, p ? p.vig.slice(0, 90) : 'missing');
    check(label + ': grain present — baked PNG tile at opacity .04-.06',
      !!p && p.grainBg.indexOf('data:image/png') > -1 && p.grainOp >= 0.04 && p.grainOp <= 0.06,
      p ? 'op=' + p.grainOp + ' bg=' + p.grainBg : 'missing');
    check(label + ': the grade never intercepts a tap and never animates',
      !!p && p.pe === 'none' && p.anim === 'none' && p.animB === 'none' && p.animA === 'none',
      p ? 'pe=' + p.pe + ' anims=' + p.anim + '/' + p.animB + '/' + p.animA : 'missing');
    check(label + ': the grade covers the whole frame',
      !!p && p.rect.x === 0 && p.rect.y === 0 && p.rect.w === 844 && p.rect.h === 390,
      p ? JSON.stringify(p.rect) : 'missing');
  };

  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await sleep(700);

  /* A — census */
  const census = await page.evaluate(() => ({
    total: document.querySelectorAll('.bc-grade').length,
    title: document.querySelectorAll('#scr-title .bc-grade').length,
    game: document.querySelectorAll('#scr-game .bc-grade').length,
    join: document.querySelectorAll('#scr-join .bc-grade').length
  }));
  check('A: exactly two grades exist — title and game stage',
    census.total === 2 && census.title === 1 && census.game === 1, JSON.stringify(census));
  check('A: the phone pad screen carries no grade (clean by construction)',
    census.join === 0, 'join=' + census.join);

  /* B — components on the title (z-70: over the whole screen) */
  gradeOk(await probe('#scr-title'), 'B(title)', 70);

  /* C — stillness: two frames, one second apart, pixel-identical
     over the corners (curtain/background/grade only live there) */
  const shot1 = (await page.screenshot()).toString('base64');
  const pos1 = await page.evaluate(() => getComputedStyle(document.querySelector('#scr-title .bc-grade'), '::after').backgroundPosition);
  await sleep(1000);
  const shot2 = (await page.screenshot()).toString('base64');
  const pos2 = await page.evaluate(() => getComputedStyle(document.querySelector('#scr-title .bc-grade'), '::after').backgroundPosition);
  const diffs = await page.evaluate(async (a, b) => {
    const load = s => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + s; });
    const [ia, ib] = [await load(a), await load(b)];
    const mk = img => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x; };
    const xa = mk(ia), xb = mk(ib);
    /* TL is curtain-width only: the marquee's pulsing bulbs begin
       just right of it, and their glow's fringe is the title's own
       animation, not the grade's business */
    const patches = [[0, 0, 56, 90], [0, 300, 150, 90]];
    return patches.map(([px, py, pw, ph]) => {
      const da = xa.getImageData(px, py, pw, ph).data, db = xb.getImageData(px, py, pw, ph).data;
      let n = 0;
      for (let i = 0; i < da.length; i += 4) if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) n++;
      return n;
    });
  }, shot1, shot2);
  check('C: the grain never moves — corner patches pixel-identical 1s apart',
    diffs.every(n => n === 0) && pos1 === pos2,
    'diffs=' + JSON.stringify(diffs) + ' bgPos ' + pos1 + ' -> ' + pos2);

  /* D1 — a real tap lands through the title's grade */
  await page.tap('#btnStart');
  await page.waitForSelector('#btnRoundGo', { timeout: 10000 });
  check('D: START tap lands through the graded title', true, 'round intro reached');
  await page.tap('#btnRoundGo');
  const s0 = await waitPhase('question');
  check('B: Round 1 opens on a question', !!s0, JSON.stringify(s0));
  await sleep(1100); /* the entrance (<=750ms) settles */

  /* B — components on the game stage (z-0: over the room,
     beneath the furniture — see the style.css sums) */
  gradeOk(await probe('#scr-game'), 'B(stage)', 0);
  await page.screenshot({ path: SHOTS + '/broadcast-1-stage.png' });

  /* E — contrast spot-check on a real answer slab, pixels not styles */
  let slab = await page.evaluate(() => {
    const b = document.querySelector('#stage .answers .ans-btn');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const col = getComputedStyle(b).color.match(/\d+/g).map(Number);
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), col, cat: window.__game.G.cur.cat };
  });
  if (!slab) throw new Error('no answer slab on the first question (kind=' + s0.kind + ')');
  /* let the pop-in finish before measuring — the first version of
     this check screenshotted mid-animation and read a moving slab.
     (Pass 5 repair: the rect is RE-READ after the wait — the
     plaqueIn flip foreshortens the button to ~15px mid-flight, and
     the first version stored that mid-flip rect, clipping a
     negative-height sliver and reading NaN from an empty canvas) */
  /* (Verification-restart repair, 2026-11-16: the fixed 1200ms wait
     was not enough — two equal reads can both land on the pre-flip
     plateau (the flip foreshortens the button to ~15px, settled it
     reads ~25px at this viewport), and the old clip below (y+6,
     height h-16) then sampled a sliver of 9px or less — probe-
     verified to hold ZERO glyph-core pixels for many first
     questions, so both ratios read NaN and the drop check failed
     vacuously (on=NaN off=NaN) while the WCAG stop-sum check
     beside it passed at 10.30:1. The repair waits for a rect that
     is stable across a full second and widens the clip's vertical
     span so the 12.5px text line is actually inside it. The
     sampler, the clip's x/width (right of the letter disc) and
     the <= 0.15 threshold are unchanged.) */
  {
    const readSlab = () => page.evaluate(() => {
      const b = document.querySelector('#stage .answers .ans-btn');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      const col = getComputedStyle(b).color.match(/\d+/g).map(Number);
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), col, cat: window.__game.G.cur.cat };
    });
    const t0 = Date.now();
    let prevS = null, stableSince = 0;
    while (Date.now() - t0 < 9000) {
      const cur = await readSlab();
      if (!cur) break;
      slab = cur;
      if (prevS && cur.y === prevS.y && cur.h === prevS.h) {
        if (!stableSince) stableSince = Date.now();
        if (Date.now() - stableSince >= 1000 && Date.now() - t0 >= 1200) break;
      } else stableSince = 0;
      prevS = cur;
      await sleep(300);
    }
  }
  if (!slab) throw new Error('the answer slab left before it could be measured');
  /* the sample clip is the TEXT ZONE: right of the letter disc —
     the ground the answer text actually sits on. The first version
     clipped the whole button and averaged the cream disc into the
     "background", which no text is ever read against. */
  const clip = { x: slab.x + 84, y: slab.y + 2, width: slab.w - 100, height: slab.h - 4 };
  const onShot = (await page.screenshot({ clip })).toString('base64');
  await page.evaluate(() => document.querySelectorAll('.bc-grade').forEach(e => { e.style.display = 'none'; }));
  await sleep(120);
  const offShot = (await page.screenshot({ clip })).toString('base64');
  await page.evaluate(() => document.querySelectorAll('.bc-grade').forEach(e => { e.style.display = ''; }));
  /* the honest sample, third try — the two earlier samplers
     indicted themselves in this drive's own runs: corner patches
     read the slab's bright letter disc as "background" (~3.1 with
     the grade OFF), and a modal-bucket background flipped buckets
     between frames. What survives scrutiny: text = glyph-core
     pixels, the ones within a whisker of the slab's declared text
     colour; background = the mean luminance of EVERY other pixel
     in the slab — the gradient ground as rendered, gloss, disc
     and all, with no bucket to flip. The WCAG ratio is symmetric:
     bright slabs wear dark ink, dark slabs wear cream. */
  const ratio = b64 => page.evaluate(async (s, col) => {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + s; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const lumAt = i => {
      const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(d[i]) + 0.7152 * f(d[i + 1]) + 0.0722 * f(d[i + 2]);
    };
    let tx = 0, tn = 0;
    /* the background is the face's DOMINANT tone, not its mean:
       the mean (this sampler's third version) still under-read by
       ~a full point against the WCAG stop sums, because glyph
       anti-aliasing halos — hundreds of half-cream pixels ringing
       every letter — average into it, though no one reads text
       against a halo. The face is a plateau in the histogram;
       halos and gloss scatter thin. Buckets of luminance, the
       fullest bucket is the ground. (A3 adjudication, 2026-11-11:
       Movies' stops sum to 4.52–5.27 by WCAG; the old mean read
       3.91 on the full clip and 4.13 on the text zone, while a TV
       control whose stops sum to 5.2+ read 4.93 the same way.) */
    const buckets = new Array(64).fill(0), bucketSum = new Array(64).fill(0);
    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i] - col[0], dg = d[i + 1] - col[1], db = d[i + 2] - col[2];
      if (dr * dr + dg * dg + db * db < 2500) { tx += lumAt(i); tn++; }
      else { const L = lumAt(i), b = Math.min(63, Math.floor(L * 64)); buckets[b]++; bucketSum[b] += L; }
    }
    let best = 0;
    for (let b = 1; b < 64; b++) if (buckets[b] > buckets[best]) best = b;
    const lt = tx / tn, lb = bucketSum[best] / buckets[best];
    return (Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05);
  }, b64, slab.col);
  const rOn = await ratio(onShot), rOff = await ratio(offShot);
  /* the absolute floor is judged by the exact WCAG sums over the
     slab's own gradient stops — the standard the perfectionist
     audit set (Movies 4.52, Music 4.58 at their tightest stops).
     Three generations of pixel sampler under-read those sums by
     0.3–1.0 (glyph halos, the cream disc, gloss), so pixels are
     trusted here only for what they measure honestly: the delta
     the grade itself costs, same sampler on both shots. */
  /* (Pass 5 re-pin: this sum used to read the category gradient
     stops (--cat-shi/--cat-smid/--cat-lo) the slabs were painted
     from. Pass 4 retired that paint — every slab now wears the one
     navy-glass face — so the sum is taken from the button's own
     computed gradient, each stop composited over white (the worst
     backdrop a .94-alpha navy could sit on). A paint with no
     readable stops returns NaN and fails loudly, not silently) */
  const stopMin = await page.evaluate(() => {
    const b = document.querySelector('#stage .answers .ans-btn');
    if (!b) return NaN;
    const cs = getComputedStyle(b);
    const lum = rgb => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
    const txm = cs.color.match(/[\d.]+/g).map(Number);
    const txL = lum(txm.slice(0, 3));
    const stops = [];
    const re = /rgba?\(([^)]+)\)/g;
    let m;
    const bg = cs.backgroundImage || '';
    while ((m = re.exec(bg)) !== null) {
      const p = m[1].split(',').map(Number);
      if (p.length >= 3) stops.push({ rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 });
    }
    if (!stops.length) return NaN;
    return Math.min.apply(null, stops.map(s => {
      const over = s.rgb.map((c, i) => s.a * c + (1 - s.a) * 255);
      const L = lum(over);
      return (Math.max(txL, L) + 0.05) / (Math.min(txL, L) + 0.05);
    }));
  });
  check('E: slab contrast stays >= 4.5:1 at every gradient stop (' + slab.cat + ' question, navy-glass slab, exact WCAG sums)',
    stopMin >= 4.5, 'tightest stop=' + stopMin.toFixed(2) + ':1 (pixel sample reads ' + rOn.toFixed(2) + ' — comparative only)');
  check('E: the grade costs the slab almost nothing (drop <= 0.15)',
    rOn >= rOff - 0.15, 'on=' + rOn.toFixed(2) + ' off=' + rOff.toFixed(2) + ' drop=' + (rOff - rOn).toFixed(3));

  /* D2 — a real tap lands through the stage's grade: seat 0's desk
     pick, registered in the game state (no-host flow, Pass 5) */
  {
    const st = await S();
    const okIx = st && st.opts ? st.opts.findIndex(o => o.ok) : -1;
    if (okIx >= 0) { await page.tap('[data-pick="0|' + okIx + '"]'); await sleep(300); }
    const after = await S();
    check('D: a desk-pick tap lands through the graded stage',
      !!after && !!after.picks && !!after.picks[0] && after.picks[0].opt === okIx,
      'pick=' + JSON.stringify(after && after.picks && after.picks[0]));
  }

  /* F — play the show out to the crowning (no-host flow: desk
     picks and the seat-order number entry; Sterling settles) */
  let guard = 0, actedQ = null;
  while (guard++ < 700) {
    const s = await S();
    if (!s) throw new Error('game state lost');
    if (s.phase === 'over') break;
    if (s.phase === 'coldopen') { await sleep(300); continue; }
    if (s.phase === 'intro') { await page.tap('#btnRoundGo'); await sleep(300); continue; }
    if (s.phase === 'intermission') { await page.tap('#btnBreakGo'); await sleep(300); continue; }
    if (s.phase === 'spin') { await sleep(250); continue; }
    if (s.phase === 'bet') { await page.tap('#btnBetsDone'); await sleep(300); continue; }
    if (s.phase === 'question') {
      if (s.kind === 'num') {
        let g2 = 0;
        while (g2++ < 12) {
          const st = await S();
          if (!st || st.phase !== 'question' || st.guessTurn == null || st.guessTurn < 0) break;
          const target = st.guessTurn === 0 ? st.truth : st.truth + 400 + st.guessTurn * 137;
          for (const ch of String(target)) { await page.tap('[data-numk="' + ch + '"]'); await sleep(60); }
          await page.tap('#btnNumLock'); await sleep(250);
        }
      } else if (s.kind === 'bluff' && !s.bluffDealt) { await page.tap('#btnDealBluff'); await sleep(500); }
      else {
        const qkey = s.round + ':' + s.qInRound;
        if (actedQ !== qkey) {
          actedQ = qkey;
          const okIx = s.opts ? s.opts.findIndex(o => o.ok) : -1;
          for (let seat = 0; seat < 3; seat++) {
            const oi = seat === 0 ? okIx : (s.opts ? s.opts.findIndex((o, ix) => !o.ok && !o.gone && o.by !== seat) : -1);
            if (oi < 0) continue;
            await page.tap('[data-pick="' + seat + '|' + oi + '"]'); await sleep(200);
          }
        }
      }
      await sleep(250); continue;
    }
    if (s.phase === 'vote-count' || s.phase === 'vote') { await sleep(250); continue; }
    if (s.phase === 'reveal') { const b = await page.$('#btnNext'); if (b) { await b.tap().catch(() => {}); await sleep(250); continue; } }
    await sleep(250);
  }
  const end = await S();
  const winner = await page.evaluate(() => document.querySelector('.winner-name') ? document.querySelector('.winner-name').textContent : null);
  check('F: the show plays out to a crowned winner', !!end && end.phase === 'over' && !!winner,
    'phase=' + (end && end.phase) + ' winner=' + (winner || ''));
  /* let any entrance settle before the frame is measured. (Pass 5
     adjudication, probe-verified: at the crowning the grade sits
     at y=-4 CONSTANTLY, not mid-animation — #scr-game's own
     scrollTop is 4, because the finale's content overflows the
     frame by exactly the 4px the audit's finding #11 already
     records, and a reveal tap scrolls the screen those 4px. The
     check below therefore stands as finding #11's second witness
     and stays red until that pass takes the overflow out; it is
     not re-pinned, because "covers the whole frame" is the
     grade's whole job) */
  for (let i = 0; i < 12; i++) {
    const r = await page.evaluate(() => { const e = document.querySelector('#scr-game .bc-grade'); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y }; });
    if (r && r.x === 0 && r.y === 0) break;
    await sleep(250);
  }
  gradeOk(await probe('#scr-game'), 'F(finale)', 0);
  const census2 = await page.evaluate(() => document.querySelectorAll('#scr-join .bc-grade').length);
  check('F: the pad is still grade-free at the crowning', census2 === 0, 'join=' + census2);

  check('No console/page errors', errors.length === 0, errors.slice(0, 3).join(' ;; '));
  const fails = results.filter(r => !r.ok).length;
  console.log('DRIVE-BROADCAST DONE — ' + (results.length - fails) + '/' + results.length + ' checks passed');
  await browser.close();
  process.exit(fails ? 2 : 0);
})().catch(e => { console.error('DRIVE FAIL:', e.message); process.exit(1); });
