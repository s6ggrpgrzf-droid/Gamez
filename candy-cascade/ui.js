'use strict';
/* Candy Cascade — UI: map, HUD, board rendering, step replay, input, fx. */
(() => {
const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
const CANDY_CSS = ['#f43f5e', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#a855f7'];
const BANNERS = { 2: 'Juicy!', 3: 'Sugary!', 4: 'Delicious!', 5: 'Candy-tastic!' };

/* ---------------- persistence ---------------- */
const SAVE_KEY = 'cc_progress_v1';
function loadProgress() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch (e) { return null; }
}
let progress = loadProgress() || { stars: {}, unlocked: 1, muted: false };
function saveProgress() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); } catch (e) {} }

/* ---------------- state ---------------- */
let st = null, levelDef = null;
let tiles = [], jellyEls = [], frostEls = [];
let ts = 40, inputLocked = false, selected = null, swipeStart = null;
let shownScore = 0, boardEl = null, fxEl = null;

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
  let total = 0;
  LEVELS.forEach(L => {
    const n = L.n, stars = progress.stars[n] || 0;
    total += stars;
    const btn = document.createElement('button');
    btn.className = 'lvl-node';
    btn.dataset.n = n;
    if (n > progress.unlocked) {
      btn.classList.add('locked');
      btn.innerHTML = '🔒';
    } else {
      btn.textContent = n;
      if (stars > 0) btn.classList.add('done');
      else if (n === progress.unlocked) btn.classList.add('current');
      const s = document.createElement('div');
      s.className = 'nstars';
      s.innerHTML = [1, 2, 3].map(i =>
        `<span class="${i <= stars ? '' : 'off'}">★</span>`).join('');
      btn.appendChild(s);
      btn.addEventListener('click', () => { CCAudio.unlock(); CCAudio.click(); startLevel(n); });
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

/* ---------------- board construction ---------------- */
function makeTile(cell) {
  const el = document.createElement('div');
  el.className = 'tile';
  el.style.width = el.style.height = ts + 'px';
  el.style.zIndex = 2;
  const pad = document.createElement('div');
  pad.className = 'pad';
  const candy = document.createElement('div');
  candy.className = 'candy' + (cell.color == null ? '' : ' c' + cell.color);
  if (cell.color != null) candy.dataset.color = cell.color;
  pad.appendChild(candy);
  el.appendChild(pad);
  setSpecial(el, cell.sp);
  return el;
}

function refreshTileVisual(el, cell) {
  const candy = el.firstChild.firstChild;
  candy.className = 'candy' + (cell.color == null ? '' : ' c' + cell.color);
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
    if (t) { t.style.width = t.style.height = ts + 'px'; setTilePos(t, r, c); }
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
  return '';
}

function updateHUD(instant) {
  $('moves').textContent = st.movesLeft;
  $('hud-moves').classList.toggle('low', st.movesLeft <= 5);
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
  const fall = step.fall;
  for (const m of fall.moves) {
    const el = tiles[m.fr][m.fc];
    tiles[m.fr][m.fc] = null;
    tiles[m.tr][m.tc] = el;
    if (el) setTilePos(el, m.tr, m.tc);
  }
  for (const s of fall.spawns) {
    const el = makeTile({ color: s.color, sp: null });
    el.style.transform = `translate(${s.c * ts}px, ${(s.r - s.drop) * ts}px)`;
    boardEl.appendChild(el);
    void el.offsetWidth;
    setTilePos(el, s.r, s.c);
    tiles[s.r][s.c] = el;
  }
  await wait(360);
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
    else if (step.k === 'round' || step.k === 'combo') await playClearStep(step);
    else if (step.k === 'shuffle') await playShuffle(step);
    else if (step.k === 'end') await playEnd(step);
  }
  updateHUD(false);
}

/* ---------------- game flow ---------------- */
async function doSwap(a, b) {
  if (inputLocked || !st || st.over) return;
  if (!inBounds(a) || !inBounds(b)) return;
  inputLocked = true;
  try {
    const res = CC.trySwap(st, a, b);
    await playSteps(res.steps);
  } finally {
    inputLocked = false;
  }
}

function onCellPress(r, c) {
  if (!tiles[r] || !tiles[r][c]) return;
  CCAudio.unlock();
  if (selected && selected.r === r && selected.c === c) { clearSelection(); return; }
  if (selected && Math.abs(selected.r - r) + Math.abs(selected.c - c) === 1) {
    const a = selected;
    doSwap(a, { r, c });
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
    const t = e.target.closest('.tile');
    if (!t) return;
    const r = +t.dataset.r, c = +t.dataset.c;
    swipeStart = { x: e.clientX, y: e.clientY, r, c, id: e.pointerId };
    onCellPress(r, c);
  });
  boardEl.addEventListener('pointermove', e => {
    if (!swipeStart || e.pointerId !== swipeStart.id || inputLocked) return;
    const dx = e.clientX - swipeStart.x, dy = e.clientY - swipeStart.y;
    if (Math.hypot(dx, dy) > 22) {
      const dir = Math.abs(dx) > Math.abs(dy)
        ? { r: 0, c: dx > 0 ? 1 : -1 }
        : { r: dy > 0 ? 1 : -1, c: 0 };
      const a = { r: swipeStart.r, c: swipeStart.c };
      swipeStart = null;
      clearSelection();
      doSwap(a, { r: a.r + dir.r, c: a.c + dir.c });
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
  $('score').textContent = '0';
  buildBoard();
  layout();
  showScreen('game');
  updateHUD(true);
  goalToast();
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
    const earned = step.stars;
    if ((progress.stars[n] || 0) < earned) progress.stars[n] = earned;
    if (n < LEVELS.length) progress.unlocked = Math.max(progress.unlocked, n + 1);
    saveProgress();
    const last = n === LEVELS.length;
    showModal({
      title: last ? 'You beat them all! 🏆' : 'Level Complete!',
      stars: earned,
      sub: `Score <b>${step.score.toLocaleString()}</b>` +
        (step.bonus ? ` <span class="dim">(+${step.bonus.toLocaleString()} move bonus)</span>` : '') +
        (step.best >= 2 ? `<br>Best cascade: <b>×${step.best}</b> 🔥` : ''),
      buttons: [
        ...(last ? [] : [{ label: '▶ Next Level', onClick: () => { hideModal(); startLevel(n + 1); } }]),
        { label: '↻ Replay', ghost: true, onClick: () => { hideModal(); startLevel(n); } },
        { label: '🗺 Map', ghost: true, onClick: () => { hideModal(); renderMap(); showScreen('map'); } },
      ],
    });
  } else {
    CCAudio.lose();
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
  return 'Not quite enough candy collected.';
}

/* ---------------- wire up ---------------- */
function init() {
  CCAudio.setMuted(!!progress.muted);
  bindInput();
  renderMap();
  $('btn-quit').addEventListener('click', () => {
    CCAudio.click(); hideModal(); renderMap(); showScreen('map');
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
}

document.addEventListener('DOMContentLoaded', init);
})();
