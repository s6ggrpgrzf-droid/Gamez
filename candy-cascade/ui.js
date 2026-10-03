'use strict';
/* Candy Cascade — UI: map, HUD, board rendering, step replay, input, fx. */
(() => {
const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
const CANDY_CSS = ['#f43f5e', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#a855f7'];
const BANNERS = { 2: 'Sweet!', 3: 'Tasty!', 4: 'Delicious!', 5: 'Divine!' };
const TYPE_META = {
  score:       { cls: 't-score', icon: '🎯' },
  jelly:       { cls: 't-jelly', icon: '🫧' },
  order:       { cls: 't-order', icon: '🍬' },
  ingredients: { cls: 't-ing',   icon: '🍒' },
  mixed:       { cls: 't-mixed', icon: '✨' },
};

/* ---------------- persistence ---------------- */
const SAVE_KEY = 'cc_progress_v1';
function loadProgress() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch (e) { return null; }
}
let progress = loadProgress() || { stars: {}, unlocked: 1, muted: false, hammers: 3, streak: 0 };
if (progress.hammers == null) progress.hammers = 3;
if (progress.streak == null) progress.streak = 0;
function saveProgress() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); } catch (e) {} }

/* ---------------- state ---------------- */
let st = null, levelDef = null;
let tiles = [], jellyEls = [], frostEls = [];
let ts = 40, inputLocked = false, selected = null, swipeStart = null;
let shownScore = 0, boardEl = null, fxEl = null;
let hammerArmed = false, hintEls = [], idleTimer = null;

/* ---------------- helpers ---------------- */
const inBounds = p => p.r >= 0 && p.r < st.rows && p.c >= 0 && p.c < st.cols;
const pos = (r, c) => `translate(${c * ts}px, ${r * ts}px)`;

function showScreen(which) {
  $('screen-map').classList.toggle('hidden', which !== 'map');
  $('screen-game').classList.toggle('hidden', which !== 'game');
}

/* ---------------- map ---------------- */
function renderMap() {
  const path = $('map-path');
  path.innerHTML = '';
  // daily treat: +1 lollipop hammer (cap 5)
  const today = new Date().toISOString().slice(0, 10);
  const dt = $('daily-toast');
  if (progress.lastDaily !== today) {
    progress.lastDaily = today;
    progress.hammers = Math.min(5, (progress.hammers || 0) + 1);
    saveProgress();
    dt.innerHTML = '🍭 Daily treat! +1 Lollipop Hammer <span class="dim">— tap 🍭 under the board to smash any candy</span>';
    dt.classList.remove('hidden');
    clearTimeout(renderMap._dt);
    renderMap._dt = setTimeout(() => dt.classList.add('hidden'), 7000);
  } else dt.classList.add('hidden');
  // win streak flame
  const sf = $('streak-flame');
  if ((progress.streak || 0) >= 2) {
    sf.textContent = `🔥×${progress.streak}`;
    sf.classList.remove('hidden');
  } else sf.classList.add('hidden');
  let total = 0;
  LEVELS.forEach(L => {
    const n = L.n, stars = progress.stars[n] || 0;
    total += stars;
    const meta = TYPE_META[L.type] || TYPE_META.score;
    const btn = document.createElement('button');
    btn.className = 'lvl-node ' + meta.cls;
    btn.dataset.n = n;
    if (n > progress.unlocked) {
      btn.classList.add('locked');
      btn.innerHTML = '🔒';
    } else {
      btn.innerHTML = `<span class="tico">${meta.icon}</span>` + n;
      if (stars > 0) btn.classList.add('done');
      else if (n === progress.unlocked) btn.classList.add('current');
      const s = document.createElement('div');
      s.className = 'nstars';
      s.innerHTML = [1, 2, 3].map(i =>
        `<span class="${i <= stars ? '' : 'off'}">★</span>`).join('');
      btn.appendChild(s);
      btn.addEventListener('click', () => { CCAudio.unlock(); CCAudio.click(); showIntro(n); });
    }
    path.appendChild(btn);
  });
  $('total-stars').textContent = total;
  requestAnimationFrame(() => {
    const cur = path.querySelector('.lvl-node.current') || path.querySelector('.lvl-node.done');
    if (cur) {
      const scroller = $('map-scroll');
      scroller.scrollTop = cur.offsetTop - scroller.clientHeight / 2;
    }
  });
}

/* ---------------- level intro card ---------------- */
function introGoalHtml(d) {
  if (d.type === 'score') return `🎯 Score <b>${d.goal.score.toLocaleString()}</b> points`;
  if (d.type === 'jelly') {
    let n = 0;
    for (const row of CC.gridFromStrings(d.jelly, 9, 9)) for (const v of row) n += v;
    return `🫧 Clear all <b>${n}</b> jelly layers`;
  }
  if (d.type === 'order') {
    const parts = Object.keys(d.goal.orders)
      .map(k => `<span class="mini candy c${k}"></span>×${d.goal.orders[k]}`);
    return `<div class="gicons">Collect ${parts.join(' ')}</div>`;
  }
  if (d.type === 'ingredients') return `🍒 Deliver <b>${d.goal.ingredients}</b> cherries to the bottom row`;
  if (d.type === 'mixed') {
    let n = 0;
    for (const row of CC.gridFromStrings(d.jelly, 9, 9)) for (const v of row) n += v;
    const parts = Object.keys(d.goal.orders)
      .map(k => `<span class="mini candy c${k}"></span>×${d.goal.orders[k]}`);
    return `🫧 Clear <b>${n}</b> jelly <span class="dim">+</span> <div class="gicons">collect ${parts.join(' ')}</div>`;
  }
  return '';
}

function showIntro(n) {
  const d = LEVELS[n - 1];
  const s = d.stars;
  showModal({
    title: `Level ${n}`,
    sub: `<div class="intro-goal">${introGoalHtml(d)}</div>` +
      `<div class="intro-moves">in <b>${d.moves}</b> moves</div>` +
      `<div class="intro-stars"><span>★ ${s[0].toLocaleString()}</span><span>★★ ${s[1].toLocaleString()}</span><span>★★★ ${s[2].toLocaleString()}</span></div>` +
      (d.tip ? `<div class="intro-tip">💡 ${d.tip}</div>` : '') +
      `<div class="intro-hammers">🍭 Lollipop Hammers: <b>${progress.hammers || 0}</b> <span class="dim">— smash any one candy, free</span></div>`,
    buttons: [
      { label: '▶ Play!', onClick: () => { hideModal(); startLevel(n); } },
      { label: '🗺 Map', ghost: true, onClick: () => { hideModal(); } },
    ],
  });
}

/* ---------------- board construction ---------------- */
function paintCandy(candy, cell) {
  if (cell.t === 'i') {
    candy.className = 'candy ing';
    candy.textContent = '🍒';
    candy.style.fontSize = Math.round(ts * 0.66) + 'px';
    delete candy.dataset.color;
  } else {
    candy.className = 'candy' + (cell.color == null ? '' : ' c' + cell.color);
    candy.textContent = '';
    candy.style.fontSize = '';
    if (cell.color != null) candy.dataset.color = cell.color;
    else delete candy.dataset.color;
  }
}

function makeTile(cell) {
  const el = document.createElement('div');
  el.className = 'tile';
  el.style.width = el.style.height = ts + 'px';
  el.style.zIndex = 2;
  const pad = document.createElement('div');
  pad.className = 'pad';
  const candy = document.createElement('div');
  paintCandy(candy, cell);
  pad.appendChild(candy);
  el.appendChild(pad);
  setSpecial(el, cell.sp);
  return el;
}

function refreshTileVisual(el, cell) {
  paintCandy(el.firstChild.firstChild, cell);
  setSpecial(el, cell.sp);
}

function setSpecial(el, sp) {
  el.classList.remove('sp-sh', 'sp-sv', 'sp-w', 'sp-b');
  if (sp) el.classList.add('sp-' + sp);
}

function setTilePos(el, r, c) {
  el.style.transform = pos(r, c);
  el.dataset.r = r; el.dataset.c = c;
}

function buildBoard() {
  boardEl.innerHTML = '<div id="fx"></div>'; // fx lives inside #board; rebuild it
  fxEl = $('fx');
  tiles = []; jellyEls = []; frostEls = [];
  for (let r = 0; r < st.rows; r++) {
    tiles.push([]); jellyEls.push([]); frostEls.push([]);
    for (let c = 0; c < st.cols; c++) {
      // jelly underlay
      const j = st.jelly[r][c];
      let jEl = null;
      if (j > 0) {
        jEl = document.createElement('div');
        jEl.className = 'cell-jelly j' + j;
        jEl.style.width = jEl.style.height = ts + 'px';
        jEl.style.transform = pos(r, c);
        jEl.style.zIndex = 1;
        boardEl.appendChild(jEl);
      }
      jellyEls[r].push(jEl);
      // candy tile
      const cell = st.board[r][c];
      let tEl = null;
      if (cell && cell.t === 'c') {
        tEl = makeTile(cell);
        setTilePos(tEl, r, c);
        boardEl.appendChild(tEl);
      }
      tiles[r].push(tEl);
      // frosting overlay
      let fEl = null;
      if (cell && cell.t === 'f') {
        fEl = document.createElement('div');
        fEl.className = 'frost hp' + cell.hp;
        fEl.style.width = fEl.style.height = ts + 'px';
        fEl.style.transform = pos(r, c);
        boardEl.appendChild(fEl);
      }
      frostEls[r].push(fEl);
    }
  }
}

function layout() {
  if (!boardEl || !st) return;
  ts = boardEl.clientWidth / st.cols;
  for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
    const t = tiles[r][c];
    if (t) {
      t.style.width = t.style.height = ts + 'px';
      setTilePos(t, r, c);
      const ing = t.querySelector('.candy.ing');
      if (ing) ing.style.fontSize = Math.round(ts * 0.66) + 'px';
    }
    const j = jellyEls[r][c];
    if (j) { j.style.width = j.style.height = ts + 'px'; j.style.transform = pos(r, c); }
    const f = frostEls[r][c];
    if (f) { f.style.width = f.style.height = ts + 'px'; f.style.transform = pos(r, c); }
  }
}

/* ---------------- HUD ---------------- */
function goalText() {
  const d = levelDef;
  if (d.type === 'score') return `🎯 <b>${d.goal.score.toLocaleString()}</b> pts`;
  if (d.type === 'jelly') {
    let n = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) n += st.jelly[r][c];
    return `🫧 Jelly: <b>${n}</b> left`;
  }
  if (d.type === 'order') {
    const parts = Object.keys(st.ordersLeft || {})
      .filter(k => st.ordersLeft[k] > 0)
      .map(k => `<span class="mini candy c${k}"></span>×${st.ordersLeft[k]}`);
    return `<div class="gicons">Collect ${parts.join(' ') || 'done!'}</div>`;
  }
  if (d.type === 'ingredients') {
    const left = Math.max(0, d.goal.ingredients - st.ingredientsCollected);
    return `🍒 <b>${left}</b> to deliver`;
  }
  if (d.type === 'mixed') {
    let n = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) n += st.jelly[r][c];
    const parts = Object.keys(st.ordersLeft || {})
      .filter(k => st.ordersLeft[k] > 0)
      .map(k => `<span class="mini candy c${k}"></span>×${st.ordersLeft[k]}`);
    return `🫧<b>${n}</b> <span class="dim">+</span> <div class="gicons">${parts.join(' ') || 'done!'}</div>`;
  }
  return '';
}

function updateHUD(instant) {
  $('moves').textContent = st.movesLeft;
  $('hud-moves').classList.toggle('low', st.movesLeft <= 5);
  CCAudio.setIntensity(st.movesLeft <= 5 && st.movesLeft > 0 && !st.over);
  $('hud-goal').innerHTML = goalText();
  // score tween
  const from = shownScore, to = st.score;
  if (instant || Math.abs(to - from) < 1) {
    shownScore = to;
    $('score').textContent = to.toLocaleString();
  } else {
    const t0 = performance.now(), dur = 350;
    (function tick(now) {
      const p = Math.min(1, (now - t0) / dur);
      shownScore = from + (to - from) * (1 - Math.pow(1 - p, 3));
      $('score').textContent = Math.round(shownScore).toLocaleString();
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }
  // star bar
  const s = levelDef.stars, max = s[2];
  $('starfill').style.width = Math.min(100, (st.score / max) * 100) + '%';
  const bars = $('starbar').querySelectorAll('i');
  const posns = [s[0] / max * 100, s[1] / max * 100, 100];
  bars.forEach((el, i) => {
    el.style.left = posns[i] + '%';
    el.classList.toggle('lit', st.score >= s[i]);
  });
}

/* ---------------- fx ---------------- */
function burst(r, c, colorIdx) {
  const cx = (c + 0.5) * ts, cy = (r + 0.5) * ts;
  for (let i = 0; i < 8; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const col = colorIdx == null ? '#ffffff' : CANDY_CSS[colorIdx];
    p.style.background = col;
    p.style.left = cx + 'px'; p.style.top = cy + 'px';
    p.style.boxShadow = `0 0 8px ${col}`;
    fxEl.appendChild(p);
    const ang = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
    const dist = ts * (0.9 + Math.random() * 0.9);
    p.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(${Math.cos(ang) * dist - 5}px, ${Math.sin(ang) * dist - 5}px) scale(0.2)`, opacity: 0 }
    ], { duration: 380 + Math.random() * 200, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => p.remove();
  }
}

function floater(r, c, text) {
  const f = document.createElement('div');
  f.className = 'floater';
  f.textContent = text;
  f.style.left = ((c + 0.5) * ts) + 'px';
  f.style.top = ((r + 0.5) * ts) + 'px';
  fxEl.appendChild(f);
  f.animate([
    { transform: 'translate(-50%,-50%) scale(.7)', opacity: 0 },
    { transform: 'translate(-50%,-90%) scale(1.1)', opacity: 1, offset: 0.3 },
    { transform: 'translate(-50%,-190%) scale(1)', opacity: 0 }
  ], { duration: 900, easing: 'ease-out' }).onfinish = () => f.remove();
}

function beamFx(effect) {
  if (effect.t === 'beamH') {
    const d = document.createElement('div');
    d.className = 'beam-h';
    d.style.left = '0'; d.style.width = '100%';
    d.style.top = (effect.r * ts + ts * 0.16) + 'px';
    d.style.height = (ts * 0.68) + 'px';
    fxEl.appendChild(d);
    d.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: 420 }).onfinish = () => d.remove();
  } else if (effect.t === 'beamV') {
    const d = document.createElement('div');
    d.className = 'beam-v';
    d.style.top = '0'; d.style.height = '100%';
    d.style.left = (effect.c * ts + ts * 0.16) + 'px';
    d.style.width = (ts * 0.68) + 'px';
    fxEl.appendChild(d);
    d.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: 420 }).onfinish = () => d.remove();
  } else if (effect.t === 'blast') {
    const d = document.createElement('div');
    d.className = 'blast';
    const rad = (effect.rad || 1) * 2 + 1;
    const size = rad * ts;
    d.style.width = d.style.height = size + 'px';
    d.style.left = ((effect.c + 0.5) * ts - size / 2) + 'px';
    d.style.top = ((effect.r + 0.5) * ts - size / 2) + 'px';
    fxEl.appendChild(d);
    d.animate([
      { transform: 'scale(.25)', opacity: 1 },
      { transform: 'scale(1.1)', opacity: 0 }
    ], { duration: 480, easing: 'ease-out' }).onfinish = () => d.remove();
    if (effect.dbl) setTimeout(() => {
      const d2 = d.cloneNode();
      fxEl.appendChild(d2);
      d2.animate([{ transform: 'scale(.3)', opacity: 1 }, { transform: 'scale(1.15)', opacity: 0 }],
        { duration: 480, easing: 'ease-out' }).onfinish = () => d2.remove();
    }, 200);
  } else if (effect.t === 'colorwash') {
    flash(effect.color == null ? '#ffffff' : CANDY_CSS[effect.color]);
  } else if (effect.t === 'megablast') {
    flash('#ffd34d');
    beamFx({ t: 'beamH', r: effect.r - 1 }); beamFx({ t: 'beamH', r: effect.r });
    beamFx({ t: 'beamH', r: effect.r + 1 });
  } else if (effect.t === 'boardclear') {
    flash('#ffffff');
  }
}

function flash(color) {
  const f = document.createElement('div');
  f.className = 'flash';
  f.style.background = color;
  fxEl.appendChild(f);
  f.animate([{ opacity: 0 }, { opacity: 0.55, offset: 0.25 }, { opacity: 0 }], { duration: 500 })
    .onfinish = () => f.remove();
}

function showBanner(text) {
  const b = $('banner');
  b.textContent = text;
  b.classList.remove('show', 'hidden');
  void b.offsetWidth;
  b.classList.add('show');
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => b.classList.add('hidden'), 1050);
}

function clearSelection() {
  if (selected) {
    const el = tiles[selected.r] && tiles[selected.r][selected.c];
    if (el) el.classList.remove('sel');
    selected = null;
  }
}

/* ---------------- step replay ---------------- */
async function playInvalid(step) {
  const elA = tiles[step.a.r][step.a.c], elB = tiles[step.b.r] && tiles[step.b.r][step.b.c];
  CCAudio.invalid();
  const jobs = [];
  if (elA) jobs.push(elA.animate([
    { transform: pos(step.a.r, step.a.c) },
    { transform: pos((step.a.r + step.b.r) / 2, (step.a.c + step.b.c) / 2) },
    { transform: pos(step.a.r, step.a.c) }
  ], { duration: 280, easing: 'ease-in-out' }).finished.catch(() => {}));
  if (elB) jobs.push(elB.animate([
    { transform: pos(step.b.r, step.b.c) },
    { transform: pos((step.a.r + step.b.r) / 2, (step.a.c + step.b.c) / 2) },
    { transform: pos(step.b.r, step.b.c) }
  ], { duration: 280, easing: 'ease-in-out' }).finished.catch(() => {}));
  await Promise.all(jobs);
}

async function playSwap(step) {
  const { a, b } = step;
  const elA = tiles[a.r][a.c], elB = tiles[b.r][b.c];
  tiles[a.r][a.c] = elB; tiles[b.r][b.c] = elA;
  if (elA) setTilePos(elA, b.r, b.c);
  if (elB) setTilePos(elB, a.r, a.c);
  CCAudio.swap();
  clearSelection();
  await wait(300);
}

function popTile(el, colorIdx) {
  return el.animate([
    { transform: el.style.transform + ' scale(1)', opacity: 1 },
    { transform: el.style.transform + ' scale(1.35)', opacity: 1, offset: 0.35 },
    { transform: el.style.transform + ' scale(0)', opacity: 0 }
  ], { duration: 300, easing: 'ease-in' }).finished.catch(() => {});
}

async function applyFallVisual(fall) {
  for (const m of fall.moves) {
    const el = tiles[m.fr][m.fc];
    tiles[m.fr][m.fc] = null;
    tiles[m.tr][m.tc] = el;
    if (el) setTilePos(el, m.tr, m.tc);
  }
  for (const s of fall.spawns) {
    const el = makeTile(s.ing ? { t: 'i' } : { color: s.color, sp: null });
    el.style.transform = `translate(${s.c * ts}px, ${(s.r - s.drop) * ts}px)`;
    boardEl.appendChild(el);
    void el.offsetWidth;
    setTilePos(el, s.r, s.c);
    tiles[s.r][s.c] = el;
  }
  await wait(360);
}

async function playCollect(step) {
  const jobs = [];
  for (const it of step.items) {
    const el = tiles[it.r] && tiles[it.r][it.c];
    burst(it.r, it.c, null);
    floater(it.r, it.c, '+1,000 🍒');
    if (el) {
      jobs.push(popTile(el).then(() => el.remove()));
      tiles[it.r][it.c] = null;
    }
  }
  CCAudio.special();
  await Promise.all(jobs);
  await wait(120);
  await applyFallVisual(step.fall);
}

async function playClearStep(step) {
  const isCombo = step.k === 'combo';
  // 1. special creations sparkle
  if (!isCombo && step.creations) {
    for (const cr of step.creations) {
      const el = tiles[cr.r] && tiles[cr.r][cr.c];
      if (el) {
        burst(cr.r, cr.c, cr.color);
        CCAudio.special();
        await wait(120);
        const cell = st.board[cr.r][cr.c];
        if (cell && cell.t === 'c') refreshTileVisual(el, cell);
        el.animate([
          { transform: pos(cr.r, cr.c) + ' scale(.4) rotate(-30deg)' },
          { transform: pos(cr.r, cr.c) + ' scale(1.25) rotate(8deg)', offset: 0.6 },
          { transform: pos(cr.r, cr.c) + ' scale(1)' }
        ], { duration: 380, easing: 'ease-out' });
      }
    }
    if (step.creations.length) await wait(200);
  }
  // 2. pop cleared tiles
  const pops = [];
  let fr = 0, fc = 0;
  for (const { r, c } of step.clear) {
    fr += r; fc += c;
    const el = tiles[r] && tiles[r][c];
    if (el) {
      const col = el.firstChild.firstChild.dataset.color;
      burst(r, c, col == null ? null : +col);
      pops.push(popTile(el, col).then(() => el.remove()));
      tiles[r][c] = null;
    }
  }
  CCAudio.pop(step.round || 1);
  if (step.clear.length) {
    const n = step.clear.length;
    floater(fr / n, fc / n, '+' + step.gain.toLocaleString());
  }
  for (const cl of step.collected || []) {
    burst(cl.r, cl.c, null);
    floater(cl.r, cl.c, '+1,000 🍒');
  }
  // 3. effect beams / blasts
  for (const e of step.effects || []) beamFx(e);
  await Promise.all(pops);
  // 4. frosting damage
  for (const h of step.frostHits || []) {
    const f = frostEls[h.r] && frostEls[h.r][h.c];
    if (f && h.hp > 0) {
      f.classList.remove('hp2'); f.classList.add('hp1', 'crack');
      CCAudio.frost();
      setTimeout(() => f.classList.remove('crack'), 300);
    }
  }
  for (const br of step.frostBroken || []) {
    const f = frostEls[br.r] && frostEls[br.r][br.c];
    if (f) {
      burst(br.r, br.c, null);
      CCAudio.frost();
      await f.animate([
        { transform: pos(br.r, br.c) + ' scale(1)', opacity: 1 },
        { transform: pos(br.r, br.c) + ' scale(1.6)', opacity: 0 }
      ], { duration: 300, easing: 'ease-in' }).finished.catch(() => {});
      f.remove();
      frostEls[br.r][br.c] = null;
    }
  }
  // 5. jelly
  for (const j of step.jellyCleared || []) {
    const jEl = jellyEls[j.r] && jellyEls[j.r][j.c];
    if (jEl) {
      if (j.left <= 0) {
        burst(j.r, j.c, null);
        jEl.style.opacity = '0';
        setTimeout(() => jEl.remove(), 320);
        jellyEls[j.r][j.c] = null;
      } else {
        jEl.classList.remove('j2'); jEl.classList.add('j1');
        burst(j.r, j.c, null);
      }
      CCAudio.jelly();
    }
  }
  updateHUD(false);
  // 6. cascade banner
  if (!isCombo && step.round >= 2 && BANNERS[Math.min(step.round, 5)]) {
    showBanner(BANNERS[Math.min(step.round, 5)]);
  }
  await wait(120);
  // 7. gravity
  await applyFallVisual(step.fall);
}

async function playShuffle(step) {
  CCAudio.shuffle();
  showBanner('Shuffled!');
  const jobs = [];
  for (const tl of step.tiles) {
    const el = tiles[tl.r] && tiles[tl.r][tl.c];
    if (el) {
      refreshTileVisual(el, { color: tl.color, sp: tl.special });
      jobs.push(el.animate([
        { transform: pos(tl.r, tl.c) + ' rotate(0deg) scale(1)' },
        { transform: pos(tl.r, tl.c) + ' rotate(360deg) scale(.6)', offset: 0.5 },
        { transform: pos(tl.r, tl.c) + ' rotate(720deg) scale(1)' }
      ], { duration: 600, easing: 'ease-in-out' }).finished.catch(() => {}));
    }
  }
  await Promise.all(jobs);
}

async function playSteps(steps) {
  for (const step of steps) {
    if (step.k === 'invalid') await playInvalid(step);
    else if (step.k === 'swap') await playSwap(step);
    else if (step.k === 'round' || step.k === 'combo' || step.k === 'hammer') await playClearStep(step);
    else if (step.k === 'collect') await playCollect(step);
    else if (step.k === 'shuffle') await playShuffle(step);
    else if (step.k === 'end') await playEnd(step);
  }
  updateHUD(false);
}

/* ---------------- idle hints ---------------- */
function clearHintEls() {
  for (const el of hintEls) if (el) el.classList.remove('hint');
  hintEls = [];
}
function clearIdle() {
  clearTimeout(idleTimer); idleTimer = null;
  clearHintEls();
}
function pokeIdle() {
  clearIdle();
  idleTimer = setTimeout(() => {
    if (!st || st.over || inputLocked || hammerArmed) return;
    const h = CC.hint(st);
    if (!h) return;
    const a = tiles[h.a.r] && tiles[h.a.r][h.a.c];
    const b = tiles[h.b.r] && tiles[h.b.r][h.b.c];
    if (a && b) {
      hintEls = [a, b];
      hintEls.forEach(el => el.classList.add('hint'));
      CCAudio.hint();
    }
  }, 5000);
}

/* ---------------- game flow ---------------- */
async function doSwap(a, b, swipeDir) {
  if (inputLocked || !st || st.over) return;
  if (!inBounds(a) || !inBounds(b)) return;
  inputLocked = true;
  clearIdle();
  try {
    const res = CC.trySwap(st, a, b, swipeDir);
    await playSteps(res.steps);
  } finally {
    inputLocked = false;
  }
  pokeIdle();
}

/* ---------------- lollipop hammer booster ---------------- */
function updateBoosterBar() {
  $('hammer-n').textContent = progress.hammers || 0;
  $('btn-hammer').classList.toggle('empty', !(progress.hammers > 0));
  $('btn-hammer').classList.toggle('armed', hammerArmed);
}
function disarmHammer() { hammerArmed = false; updateBoosterBar(); }

async function useHammer(r, c) {
  const wasArmed = hammerArmed;
  disarmHammer();
  if (!wasArmed) return;
  if (inputLocked || !st || st.over) return;
  if (!(progress.hammers > 0)) { showBanner('No hammers! Come back tomorrow 🍭'); return; }
  const el = tiles[r] && tiles[r][c];
  const frost = frostEls[r] && frostEls[r][c];
  if (!el && !frost) return;
  inputLocked = true;
  clearIdle();
  try {
    const res = CC.hammer(st, r, c);
    if (res.ok) {
      progress.hammers--; saveProgress(); updateBoosterBar();
      CCAudio.hammer();
      await playSteps(res.steps);
    } else CCAudio.invalid();
  } finally {
    inputLocked = false;
  }
  pokeIdle();
}

function onCellPress(r, c) {
  if (hammerArmed) { useHammer(r, c); return; }
  if (!tiles[r] || !tiles[r][c]) return;
  CCAudio.unlock();
  if (selected && selected.r === r && selected.c === c) { clearSelection(); return; }
  if (selected && Math.abs(selected.r - r) + Math.abs(selected.c - c) === 1) {
    const a = selected;
    doSwap(a, { r, c }, a.r === r ? 'h' : 'v');
    return;
  }
  clearSelection();
  selected = { r, c };
  tiles[r][c].classList.add('sel');
  CCAudio.select();
}

function bindInput() {
  boardEl = $('board');
  boardEl.addEventListener('pointerdown', e => {
    CCAudio.unlock();
    if (inputLocked || !st || st.over) return;
    clearIdle();
    if (hammerArmed) {
      const rect = boardEl.getBoundingClientRect();
      const c = Math.floor((e.clientX - rect.left) / ts);
      const r = Math.floor((e.clientY - rect.top) / ts);
      if (r >= 0 && r < st.rows && c >= 0 && c < st.cols) useHammer(r, c);
      else disarmHammer();
      return;
    }
    const t = e.target.closest('.tile');
    if (!t) return;
    const r = +t.dataset.r, c = +t.dataset.c;
    swipeStart = { x: e.clientX, y: e.clientY, r, c, id: e.pointerId };
    onCellPress(r, c);
  });
  boardEl.addEventListener('pointermove', e => {
    if (!swipeStart || e.pointerId !== swipeStart.id || inputLocked || hammerArmed) return;
    const dx = e.clientX - swipeStart.x, dy = e.clientY - swipeStart.y;
    if (Math.hypot(dx, dy) > 22) {
      const dir = Math.abs(dx) > Math.abs(dy)
        ? { r: 0, c: dx > 0 ? 1 : -1 }
        : { r: dy > 0 ? 1 : -1, c: 0 };
      const a = { r: swipeStart.r, c: swipeStart.c };
      swipeStart = null;
      clearSelection();
      doSwap(a, { r: a.r + dir.r, c: a.c + dir.c }, dir.r === 0 ? 'h' : 'v');
    }
  });
  const cancelSwipe = () => { swipeStart = null; };
  boardEl.addEventListener('pointerup', cancelSwipe);
  boardEl.addEventListener('pointercancel', cancelSwipe);
  window.addEventListener('resize', layout);
}

function goalToast() {
  const d = levelDef;
  let txt;
  if (d.type === 'score') txt = `🎯 Score <b>${d.goal.score.toLocaleString()}</b> in ${d.moves} moves`;
  else if (d.type === 'jelly') txt = `🫧 Clear all the jelly in ${d.moves} moves`;
  else if (d.type === 'ingredients') txt = `🍒 Deliver <b>${d.goal.ingredients}</b> cherries to the bottom in ${d.moves} moves`;
  else if (d.type === 'mixed') txt = `✨ Clear the jelly <b>and</b> fill the candy order in ${d.moves} moves`;
  else {
    const names = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
    const parts = Object.keys(d.goal.orders).map(k => `${d.goal.orders[k]} ${names[k]}`);
    txt = `🍬 Collect ${parts.join(' + ')} in ${d.moves} moves`;
  }
  const el = $('goal-toast');
  el.innerHTML = txt;
  el.classList.remove('hidden');
  clearTimeout(goalToast._t);
  goalToast._t = setTimeout(() => el.classList.add('hidden'), 3200);
  if (d.n === 1) $('hint-bar').textContent = '👉 Swipe a candy, or tap two neighbors, to swap them';
  else $('hint-bar').textContent = '';
}

function startLevel(n) {
  levelDef = LEVELS[n - 1];
  st = CC.newGame(levelDef);
  selected = null; inputLocked = false; shownScore = 0;
  disarmHammer(); updateBoosterBar();
  $('score').textContent = '0';
  buildBoard();
  layout();
  showScreen('game');
  updateHUD(true);
  goalToast();
  pokeIdle();
}

/* ---------------- modal ---------------- */
function showModal(o) {
  $('modal-title').textContent = o.title || '';
  $('modal-sub').innerHTML = o.sub || '';
  const stars = $('modal-stars');
  if (o.stars) {
    stars.classList.remove('hidden');
    [...stars.children].forEach((el, i) => {
      el.classList.toggle('earned', i < o.stars);
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    });
  } else stars.classList.add('hidden');
  const btns = $('modal-btns');
  btns.innerHTML = '';
  (o.buttons || []).forEach((b, i) => {
    const btn = document.createElement('button');
    btn.className = 'btn' + (b.ghost ? ' ghost' : '');
    btn.textContent = b.label;
    btn.addEventListener('click', () => { CCAudio.click(); b.onClick && b.onClick(); });
    btns.appendChild(btn);
  });
  $('modal').classList.remove('hidden');
}
function hideModal() { $('modal').classList.add('hidden'); }

async function playEnd(step) {
  updateHUD(true);
  await wait(500);
  const n = levelDef.n;
  if (step.won) {
    CCAudio.win();
    // win streak: every 3rd consecutive win earns a hammer
    progress.streak = (progress.streak || 0) + 1;
    let streakNote = '';
    if (progress.streak % 3 === 0 && (progress.hammers || 0) < 5) {
      progress.hammers = (progress.hammers || 0) + 1;
      streakNote = `<br>🔥 ${progress.streak}-win streak! +1 🍭 hammer`;
    }
    saveProgress();
    updateBoosterBar();
    // Sugar Crush: burn leftover moves into bonus points, tap to skip
    if (step.bonus > 0) {
      showBanner('Sugar Crush!');
      CCAudio.sugar();
      const from = step.score - step.bonus, to = step.score;
      const mv = Math.round(step.bonus / 250);
      const s = levelDef.stars, max = s[2];
      const t0 = performance.now(), dur = Math.min(2000, 500 + mv * 130);
      let skipped = false;
      const skip = () => { skipped = true; };
      $('board-wrap').addEventListener('pointerdown', skip, { once: true });
      $('moves').textContent = mv;
      await new Promise(res => {
        const done = () => {
          $('board-wrap').removeEventListener('pointerdown', skip);
          updateHUD(true);
          res();
        };
        (function tick(now) {
          const p = Math.min(1, (now - t0) / dur);
          if (skipped || p >= 1) { done(); return; }
          const v = from + (to - from) * p;
          $('score').textContent = Math.round(v).toLocaleString();
          $('moves').textContent = Math.ceil(mv * (1 - p));
          $('starfill').style.width = Math.min(100, (v / max) * 100) + '%';
          requestAnimationFrame(tick);
        })(t0);
      });
      await wait(250);
    }
    const earned = step.stars;
    if ((progress.stars[n] || 0) < earned) progress.stars[n] = earned;
    if (n < LEVELS.length) progress.unlocked = Math.max(progress.unlocked, n + 1);
    saveProgress();
    arcadeLevelComplete('candy-cascade', n, step.score);
    const last = n === LEVELS.length;
    showModal({
      title: last ? 'You beat them all! 🏆' : 'Level Complete!',
      stars: earned,
      sub: `Score <b>${step.score.toLocaleString()}</b>` +
        (step.bonus ? ` <span class="dim">(+${step.bonus.toLocaleString()} Sugar Crush)</span>` : '') +
        (step.best >= 2 ? `<br>Best cascade: <b>×${step.best}</b> 🔥` : '') + streakNote +
        `<div id="arc-lb" class="arc-lb"></div>`,
      buttons: [
        ...(last ? [] : [{ label: '▶ Next Level', onClick: () => { hideModal(); startLevel(n + 1); } }]),
        { label: '↻ Replay', ghost: true, onClick: () => { hideModal(); startLevel(n); } },
        { label: '🗺 Map', ghost: true, onClick: () => { hideModal(); renderMap(); showScreen('map'); } },
      ],
    });
  } else {
    CCAudio.lose();
    progress.streak = 0;
    saveProgress();
    showModal({
      title: 'Out of moves 😢',
      sub: goalTextPlain(),
      buttons: [
        { label: '↻ Try Again', onClick: () => { hideModal(); startLevel(n); } },
        { label: '🗺 Map', ghost: true, onClick: () => { hideModal(); renderMap(); showScreen('map'); } },
      ],
    });
  }
}

function goalTextPlain() {
  const d = levelDef;
  if (d.type === 'score') return `You needed ${d.goal.score.toLocaleString()} points.`;
  if (d.type === 'jelly') return 'Some jelly survived. Give it another go!';
  if (d.type === 'ingredients') return 'The cherries didn\'t all make it down. Try again!';
  if (d.type === 'mixed') return 'Both goals need finishing — so close, one more try!';
  return 'Not quite enough candy collected.';
}

/* ---------------- confetti easter egg (tap the logo 5×) ---------------- */
function confetti() {
  CCAudio.special();
  const app = $('app');
  const colors = ['#ff5fa2', '#4de3ff', '#ffd34d', '#4ade80', '#a855f7'];
  for (let i = 0; i < 60; i++) {
    const p = document.createElement('div');
    p.className = 'confetti';
    p.style.left = (Math.random() * 100) + '%';
    p.style.background = colors[i % colors.length];
    app.appendChild(p);
    p.animate([
      { transform: 'translateY(-12px) rotate(0deg)', opacity: 1 },
      { transform: `translateY(${app.clientHeight * 0.75}px) rotate(${(Math.random() * 720 - 360) | 0}deg)`, opacity: 0 }
    ], { duration: 1200 + Math.random() * 1200, easing: 'cubic-bezier(.2,.6,.4,1)', delay: Math.random() * 300 })
      .onfinish = () => p.remove();
  }
}

/* ---------------- wire up ---------------- */
function init() {
  CCAudio.setMuted(!!progress.muted);
  bindInput();
  renderMap();
  updateBoosterBar();
  $('btn-quit').addEventListener('click', () => {
    CCAudio.click(); hideModal(); clearIdle(); disarmHammer(); renderMap(); showScreen('map');
  });
  $('btn-hammer').addEventListener('click', () => {
    CCAudio.unlock(); CCAudio.click();
    if (!st || st.over || $('screen-game').classList.contains('hidden')) return;
    if (hammerArmed) { disarmHammer(); return; }
    if (!(progress.hammers > 0)) { showBanner('No hammers left! Come back tomorrow 🍭'); return; }
    hammerArmed = true; updateBoosterBar(); clearSelection(); clearIdle();
    showBanner('Tap a candy to smash it! 🍭');
  });
  $('btn-pause').addEventListener('click', () => {
    CCAudio.click();
    showModal({
      title: 'Paused',
      sub: `Level ${levelDef.n} — score ${st.score.toLocaleString()}`,
      buttons: [
        { label: '▶ Resume', onClick: hideModal },
        { label: progress.muted ? '🔈 Unmute' : '🔇 Mute', ghost: true, onClick: () => {
            progress.muted = !progress.muted; CCAudio.setMuted(progress.muted); saveProgress(); hideModal();
          } },
        { label: '↻ Restart Level', ghost: true, onClick: () => { hideModal(); startLevel(levelDef.n); } },
        { label: '🗺 Quit to Map', ghost: true, onClick: () => { hideModal(); renderMap(); showScreen('map'); } },
      ],
    });
  });
  document.addEventListener('pointerdown', () => CCAudio.unlock(), { once: true });
  document.addEventListener('pointerdown', () => CCAudio.music(true), { once: true });
  // logo easter egg: 5 quick taps = confetti
  let logoTaps = 0, logoTimer = null;
  document.querySelector('.logo').addEventListener('click', () => {
    logoTaps++;
    clearTimeout(logoTimer);
    logoTimer = setTimeout(() => { logoTaps = 0; }, 1500);
    if (logoTaps >= 5) { logoTaps = 0; confetti(); }
  });
}

document.addEventListener('DOMContentLoaded', init);

/* ---------------- Gamez Arcade: global leaderboards ----------------
   Shared Cloudflare backend; silent offline so the game never depends on it. */
const ARCADE_BASE = 'https://gamez-arcade.chaoticutopia84.workers.dev'; // Gamez Arcade backend, e.g. https://gamez-arcade.xxx.workers.dev
function arcadeFetch(path, body) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  return fetch(ARCADE_BASE + path, body ?
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal } :
    { signal: ctl.signal })
    .then(r => r.json())
    .finally(() => clearTimeout(t))
    .catch(() => null);
}
function arcadeEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function arcadeBoardHtml(top, hl) {
  if (!top || !top.length) return '<div class="arc-lb-empty">No scores yet — be the first!</div>';
  const medals = ['🥇', '🥈', '🥉'];
  return top.slice(0, 3).map((e, i) =>
    `<div class="arc-lb-row${e.name === hl ? ' me' : ''}"><span>${medals[i] || (i + 1) + '.'} ${arcadeEsc(e.name)}</span><b>${(+e.score).toLocaleString()}</b></div>`
  ).join('');
}
function arcadeEnsureName(box, cb) {
  let name = '';
  try { name = (localStorage.getItem('arcade_name') || '').trim(); } catch (e) {}
  if (name) { cb(name); return; }
  box.innerHTML = '<div class="arc-lb-form"><input id="arc-lb-name" maxlength="12" placeholder="YOUR NAME" autocomplete="off"><button id="arc-lb-go" class="btn">SAVE</button></div>';
  document.getElementById('arc-lb-go').addEventListener('click', () => {
    const v = document.getElementById('arc-lb-name').value.trim().slice(0, 12);
    if (!v) return;
    try { localStorage.setItem('arcade_name', v); } catch (e) {}
    cb(v);
  });
}
async function arcadeLevelComplete(game, levelN, score) {
  const box = document.getElementById('arc-lb');
  if (!box || !ARCADE_BASE || !(score > 0)) return;
  const board = 'level-' + levelN;
  box.innerHTML = '<div class="arc-lb-empty">🏆 loading scores…</div>';
  arcadeEnsureName(box, async (name) => {
    box.innerHTML = '<div class="arc-lb-empty">🏆 sending…</div>';
    const res = await arcadeFetch('/score', { game, board, name, score });
    const top = (res && res.top) ? res.top : (await arcadeFetch(`/scores?game=${game}&board=${board}`) || {}).top;
    const rank = res && res.rank > 0 ? `<div class="arc-lb-rank">GLOBAL #${res.rank}!</div>` : '';
    box.innerHTML = rank + `<div class="arc-lb-title">🏆 LEVEL ${levelN} BEST</div>` + arcadeBoardHtml(top, name);
  });
}
})();
