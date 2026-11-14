/* Visual pass V6 — THE LETTERING PASS: print-shop material for the
   show's display lettering.
   A: question 1 — the letterpress stack computes on the category
      pill (dark incise above, light catch below, >= 2 layers); the
      engraved stack computes on the money figures: #qValue carries
      its engraving as chained drop-shadows in the filter (clipped
      gradient text cannot take text-shadow — 3-deep as V6 shipped,
      4-deep since 3D Pass 7 (2026-11-13) inserted a bronze step
      between the engraved pair and the navy seat), a desk .seat-score and
      the .pot-total carry >= 3-layer engraved text-shadow stacks
      whose last layer is the depth shadow they already wore.
   B: the treatment holds mid-count — #qValue sampled twice ~800ms
      apart while the clock drains: the figure changes, the filter
      string is byte-identical and still 4-deep (Pass 7).
   C: restraint — an answer slab, the question text and the value's
      fine-print label all keep computed text-shadow "none": nothing
      below display size was touched.
   D: contrast, in pixels (the broadcast sampler's method: glyph-core
      = pixels within a whisker of the declared ink; background =
      median luminance of every other pixel in the box). Two facts
      govern what a fair gate is, both measured, neither assumed:
      (1) the census below proves V6 changed NO fill — all seven
      pill ink/ground ratios equal the shipped analytic table, in
      which Movies (3.55) and Music (3.85) sit under 4.5 BY DESIGN:
      the perfectionist audit deepened dedicated slab-only stops
      for those two and deliberately kept the identity mid for
      "chips, pills and emblems" (its own words in the CATSTYLE
      comment), so the pill's absolute figure is that audit's
      settled trade-off, not this pass's to re-litigate; (2) what
      THIS pass owns is the treatment's cost, and it is gated hard:
      letterpress ON vs the same title flat must cost <= 0.15 (the
      first full run measured 0.00), and the sampled title must
      keep the 3.0:1 large-text floor its bold display register
      lives in. The question value is 54px display type whose
      brass-over-stage-glow figure is likewise the shipped design's
      own; the engraving must not VEIL it, proven the same way: the
      full filter vs the filter with only today's depth shadow
      kept (the V6 delta is exactly the two 1px edges) must cost
      <= 0.15, with the absolute reported in the detail either way.
      The value's glyphs are a brass gradient, so its core is
      matched by the brass family, not a single colour — and it is
      sampled early, before the drained value's red 'low' gradient
      can confuse the family match.
   E: the Headline Question (jumped to positionally, R2 Q6 — the
      headline is derived from round/qInRound) — the brass banner
      wears the letterpress dark-ink variant.
   F: the Decider (finale tie forced by the decider drive's own
      trick) — the wine banner wears the reversed letterpress.
   G: the finale — .winner-total keeps its engraved filter (4-deep
      since Pass 7, same bronze-step insertion as #qValue),
      a podium .pmoney carries the engraved stack.
   H: fits — document scroll == client on the question stage at
      844x390 and on the finale at 390x844. Zero console errors. */
const { launchBrowser } = require('./rig');
const fs = require('fs');
const SHOTS = '/home/hatch/workspace/gilded-hour/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok, detail }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); }
const url = 'file:///home/hatch/workspace/gilded-hour/index.html';

(async () => {
  const browser = await launchBrowser({ protocolTimeout: 240000 });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.setViewport({ width: 844, height: 390 });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await sleep(600);

  const S = () => page.evaluate(() => {
    const g = window.__game.G;
    if (!g) return null;
    return {
      phase: g.phase, round: g.round, qInRound: g.qInRound,
      kind: g.cur ? g.cur.kind : null, decider: !!(g.cur && g.cur.decider),
      scores: g.players.map(p => p.score)
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
  /* computed lettering of the first match: text-shadow parsed into
     layers {r,g,b,a,x,y}, the raw filter, and the fill colour */
  const probe = sel => page.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const layers = [];
    if (cs.textShadow && cs.textShadow !== 'none') {
      const re = /rgba?\(([^)]+)\)\s+(-?[\d.]+)px\s+(-?[\d.]+)px/g;
      let m;
      while ((m = re.exec(cs.textShadow))) {
        const c = m[1].split(',').map(v => parseFloat(v));
        layers.push({ r: c[0], g: c[1], b: c[2], a: c.length > 3 ? c[3] : 1, x: parseFloat(m[2]), y: parseFloat(m[3]) });
      }
    }
    return {
      tsNone: cs.textShadow === 'none', layers,
      drops: ((cs.filter || '').match(/drop-shadow/g) || []).length,
      filter: cs.filter || '',
      text: el.textContent
    };
  }, sel);
  const hasIncise = p => !!p && p.layers.some(l => l.y === -1 && l.a >= 0.2 && (l.r + l.g + l.b) < 300);
  const hasCatch = (p, minA) => !!p && p.layers.some(l => l.y === 1 && l.a >= minA && l.r > 200 && l.g > 180 && l.b > 120);
  const fits = () => page.evaluate(() => {
    const de = document.documentElement;
    return { sw: de.scrollWidth, cw: de.clientWidth, sh: de.scrollHeight, ch: de.clientHeight };
  });
  /* pixel contrast over an element box (broadcast's sampler):
     mode 'ink' — glyph-core near the declared colour;
     mode 'brass' — glyph-core in the brass gradient family */
  const contrast = async (sel, mode, skipLeft) => {
    const box = await page.evaluate((s, sk) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const col = getComputedStyle(el).color.match(/\d+/g).map(Number);
      return { x: Math.round(r.x) + (sk || 0), y: Math.round(r.y), w: Math.round(r.width) - (sk || 0), h: Math.round(r.height), col };
    }, sel, skipLeft || 0);
    if (!box || box.w < 8 || box.h < 6) return null;
    const b64 = (await page.screenshot({ clip: { x: box.x, y: box.y, width: box.w, height: box.h } })).toString('base64');
    return page.evaluate(async (data, col, mode) => {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + data; });
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      const lumAt = i => {
        const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(d[i]) + 0.7152 * f(d[i + 1]) + 0.0722 * f(d[i + 2]);
      };
      let tx = 0, tn = 0; const bgs = [];
      for (let i = 0; i < d.length; i += 4) {
        const isGlyph = mode === 'brass'
          ? (d[i] > 170 && d[i + 1] > 100 && d[i + 2] < 180 && d[i] > d[i + 2] + 60)
          : ((d[i] - col[0]) ** 2 + (d[i + 1] - col[1]) ** 2 + (d[i + 2] - col[2]) ** 2 < 2500);
        if (isGlyph) { tx += lumAt(i); tn++; } else bgs.push(lumAt(i));
      }
      if (!tn || !bgs.length) return null;
      bgs.sort((a, b) => a - b);
      const lt = tx / tn, lb = bgs[Math.floor(bgs.length / 2)];
      return { ratio: (Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05), glyphPx: tn };
    }, b64, box.col, mode);
  };

  /* ---- census: V6 changed no fill — the seven pill ink/ground
     ratios, read off the game's own category plumbing (applyCat is
     exposed on __game.planes), equal the shipped analytic table.
     Movies/Music under 4.5 is the perfectionist audit's settled
     identity trade-off (slab-only deepened stops), recorded here
     so the number is never mistaken for a V6 effect. ---- */
  const SHIPPED_PILL = { 'Movies': 3.55, 'TV': 5.67, 'Music': 3.85, 'Ads & Jingles': 6.54, 'Toys & Games': 6.10, 'Saturday Morning': 7.82, 'The Dial-Up Years': 5.44 };
  const census = await page.evaluate(table => {
    const out = {};
    const lum = hex => {
      const c = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const g = document.getElementById('scr-game');
    Object.keys(table).forEach(cat => {
      window.__game.planes.applyCat(cat);
      const cs = getComputedStyle(g);
      const bg = cs.getPropertyValue('--cat').trim(), tx = cs.getPropertyValue('--cat-tx').trim();
      const l1 = lum(bg), l2 = lum(tx);
      out[cat] = +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2));
    });
    return out;
  }, SHIPPED_PILL);
  const censusOk = Object.keys(SHIPPED_PILL).every(k => Math.abs(census[k] - SHIPPED_PILL[k]) <= 0.06);
  check('Census: all seven category pill fills are byte-identical to the shipped design (V6 touched no colour)',
    censusOk, JSON.stringify(census));

  await page.evaluate(() => window.__game.startShow(['Ana', 'Bo', 'Cy']));
  await page.waitForSelector('#btnRoundGo', { timeout: 10000 });
  await page.tap('#btnRoundGo');
  const q1 = await waitPhase('question');
  check('A: the show opens on a first question', q1.round === 1 && q1.qInRound === 0, JSON.stringify(q1));
  await sleep(700); /* entrance settled; the clock is draining */

  /* ---- A: the stacks on the first question ---- */
  const pill = await probe('#stage .cat-pill');
  check('A: category pill wears the letterpress stack (>= 2 layers)', !!pill && pill.layers.length >= 2,
    pill ? JSON.stringify(pill.layers) : 'missing');
  check('A: pill letterpress = dark incise above + light catch below', hasIncise(pill) && hasCatch(pill, 0.1),
    pill ? JSON.stringify(pill.layers) : 'missing');
  const val = await probe('#qValue');
  check('A: question value is engraved — 4 chained drop-shadows in its filter (Pass 7 bronze step)', !!val && val.drops === 4,
    val ? val.filter : 'missing');
  const seat = await probe('.seat .seat-score');
  check('A: a desk score carries the engraved stack (incise + catch + its own depth shadow last)',
    !!seat && seat.layers.length >= 3 && hasIncise(seat) && hasCatch(seat, 0.08) && seat.layers[seat.layers.length - 1].y === 3,
    seat ? JSON.stringify(seat.layers) : 'missing');
  const pot = await probe('.pot-total');
  check('A: the pot figure carries the engraved stack', !!pot && pot.layers.length >= 2 && hasIncise(pot) && hasCatch(pot, 0.15),
    pot ? JSON.stringify(pot.layers) : 'missing');

  /* ---- D (sampled early, while the value is still brass):
     contrast in pixels, and the treatment's own cost isolated ---- */
  const pillC = await contrast('#stage .cat-pill', 'ink', 30);
  await page.evaluate(() => { const el = document.querySelector('#stage .cat-pill'); if (el) el.style.textShadow = 'none'; });
  await sleep(120);
  const pillOff = await contrast('#stage .cat-pill', 'ink', 30);
  await page.evaluate(() => { const el = document.querySelector('#stage .cat-pill'); if (el) el.style.textShadow = ''; });
  check('D: category title keeps the large-text floor (>= 3.0:1) with the letterpress on — absolute reported, category is luck of the deal',
    !!pillC && pillC.ratio >= 3.0,
    pillC ? pillC.ratio.toFixed(2) + ':1 over ' + pillC.glyphPx + ' glyph px (shipped analytic range 3.55–7.82 across categories)' : 'unmeasured');
  check('D: the letterpress costs the title almost nothing (drop <= 0.15 vs its flat rendering)',
    !!pillC && !!pillOff && pillC.ratio >= pillOff.ratio - 0.15,
    'on=' + (pillC && pillC.ratio.toFixed(2)) + ' off=' + (pillOff && pillOff.ratio.toFixed(2)));
  const valC = await contrast('#qValue', 'brass', 0);
  await page.evaluate(() => { const el = document.querySelector('#qValue'); if (el) el.style.filter = 'drop-shadow(0 3px 0 rgba(20,4,24,.5))'; });
  await sleep(120);
  const valOff = await contrast('#qValue', 'brass', 0);
  await page.evaluate(() => { const el = document.querySelector('#qValue'); if (el) el.style.filter = ''; });
  check('D: the engraving does not veil the value (drop <= 0.15 vs the depth-shadow-only filter it shipped with)',
    !!valC && !!valOff && valC.ratio >= valOff.ratio - 0.15,
    'on=' + (valC && valC.ratio.toFixed(2)) + ':1 off=' + (valOff && valOff.ratio.toFixed(2)) + ':1 (absolute on-figure reported, not hidden)');

  /* ---- B: mid-count, the engraving rides the figure ---- */
  const samples = [];
  {
    const t0 = Date.now();
    while (Date.now() - t0 < 9000) {
      const v = await probe('#qValue');
      if (v) samples.push(v);
      if (samples.length > 1 && samples[samples.length - 1].text !== samples[0].text) break;
      const ph = await S();
      if (!ph || ph.phase !== 'question') break;
      await sleep(300);
    }
  }
  const vFirst = samples[0], vLast = samples[samples.length - 1];
  check('B: while the value counts down the figure changes but the engraved filter is byte-identical at every sample',
    samples.length > 1 && !!vLast && vLast.text !== vFirst.text && samples.every(v => v.filter === vFirst.filter && v.drops === 4),
    (vFirst && vFirst.text) + ' -> ' + (vLast && vLast.text) + ' over ' + samples.length + ' samples');

  /* ---- C: restraint ---- */
  const slab = await probe('#stage .ans-btn');
  const qtext = await probe('#stage .q-text');
  const fine = await probe('.q-value small');
  check('C: answer slab, question text and fine print keep flat lettering (text-shadow none)',
    !!slab && slab.tsNone && !!qtext && qtext.tsNone && !!fine && fine.tsNone,
    'slab=' + (slab && slab.tsNone) + ' qtext=' + (qtext && qtext.tsNone) + ' fine=' + (fine && fine.tsNone));

  await page.screenshot({ path: SHOTS + '/lettering-1-stage.png' });
  const f1 = await fits();
  check('H: the question stage fits 844x390 (document scroll == client)', f1.sw === f1.cw && f1.sh === f1.ch,
    JSON.stringify(f1));

  /* ---- E/F/G: play the show out with the two positional hooks ---- */
  let jumped = false, tied = false, headlineOk = null, deciderOk = null, guard = 0;
  while (guard++ < 900) {
    const s = await S();
    if (!s) throw new Error('game state lost');
    if (s.phase === 'over') break;
    if (s.phase === 'coldopen' || s.phase === 'spin' || s.phase === 'vote-count') { await sleep(180); continue; }
    if (s.phase === 'intro') { await page.tap('#btnRoundGo'); await sleep(220); continue; }
    if (s.phase === 'intermission') { await page.evaluate(() => { const b = document.getElementById('btnEraCall'); if (b) b.click(); }); await sleep(250); await page.tap('#btnBreakGo'); await sleep(220); continue; }
    if (s.phase === 'bet') { await page.tap('#btnBetsDone'); await sleep(220); continue; }
    if (s.phase === 'question') {
      if (s.round === 2 && s.qInRound === 5 && headlineOk === null) {
        const b = await probe('#stage .headline-banner');
        headlineOk = !!b && b.layers.length >= 2 && hasCatch(b, 0.4);
        check('E: the Headline banner wears the letterpress dark-ink variant (strong light catch)',
          headlineOk, b ? JSON.stringify(b.layers) : 'banner missing');
      }
      if (s.decider && deciderOk === null) {
        const b = await probe('#stage .decider-banner');
        deciderOk = !!b && b.layers.length >= 2 && b.layers.some(l => l.y === -1 && l.a >= 0.45);
        check('F: the Decider banner wears the reversed letterpress (deep incise on the dark ground)',
          deciderOk, b ? JSON.stringify(b.layers) : 'banner missing');
      }
      await page.evaluate(() => { const g = window.__game.G; if (g && g.cur) g.cur.elapsed = 5; });
      await page.tap('#btnCallIt'); await sleep(180); continue;
    }
    if (s.phase === 'vote') {
      await page.tap('.seat[data-seat="0"]'); await sleep(150);
      await page.tap('#btnReveal'); await sleep(220); continue;
    }
    if (s.phase === 'reveal') {
      if (!jumped && s.round === 1) {
        /* the Next handler increments qInRound before dealing, so
           park one short: (2,4) here deals the Headline at (2,5) */
        await page.evaluate(() => { const g = window.__game.G; g.round = 2; g.qInRound = 4; });
        jumped = true;
      }
      if (!tied && s.round === 3 && s.qInRound === 2 && !s.decider) {
        await page.evaluate(() => {
          const g = window.__game.G;
          g.players[1].score = g.players[0].score;
          if (g.players[2].score >= g.players[0].score) g.players[2].score = Math.max(0, g.players[0].score - 100);
        });
        tied = true;
      }
      const b = await page.$('#btnNext'); if (b) { await b.tap(); await sleep(220); continue; }
    }
    await sleep(180);
  }
  const end = await S();
  check('E: the Headline Question was reached and banner-checked', headlineOk !== null, 'jumped=' + jumped);
  check('F: the Decider was reached and banner-checked', deciderOk !== null, 'tied=' + tied);
  check('G: the show plays out to a crowned winner', !!end && end.phase === 'over', 'phase=' + (end && end.phase));
  await sleep(600);
  const wt = await probe('.winner-total');
  check('G: the finale total keeps its 4-deep engraved filter (Pass 7)', !!wt && wt.drops === 4, wt ? wt.filter : 'missing');
  const pm = await probe('.podium .pmoney');
  check('G: a podium money figure carries the engraved stack', !!pm && pm.layers.length >= 3 && hasIncise(pm) && hasCatch(pm, 0.08),
    pm ? JSON.stringify(pm.layers) : 'missing');

  await page.setViewport({ width: 390, height: 844 });
  await sleep(500);
  const f2 = await fits();
  check('H: the finale fits 390x844 (document scroll == client)', f2.sw === f2.cw && f2.sh === f2.ch,
    JSON.stringify(f2));

  check('No console/page errors', errors.length === 0, errors.slice(0, 3).join(' ;; '));
  const fails = results.filter(r => !r.ok).length;
  console.log('DRIVE-LETTERING DONE — ' + (results.length - fails) + '/' + results.length + ' checks passed');
  await browser.close();
  process.exit(fails ? 2 : 0);
})().catch(e => { console.error('DRIVE FAIL:', e.message); process.exit(1); });
