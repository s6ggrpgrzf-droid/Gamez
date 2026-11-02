'use strict';
/* Sugar Trail — painted-board edition. The board IS two gouache
 * paintings whose trails are painted candy stones; the 134 spaces ride
 * each painting's traced stone chain (path-data.js) and pawns are sized
 * from the stone they stand on. All rules live in sim.js (window.ST),
 * untouched by the scenery. */
const SIM = window.ST;
const PATHS = window.PD;
const $ = s => document.querySelector(s);

const TILE_HEX = { R: '#e2452e', P: '#8b4fc4', Y: '#f2b41c', B: '#2775d6', O: '#f07f13', G: '#39a24b' };
const PAWN_HEX = { red: '#e2452e', blue: '#2775d6', yellow: '#f2a007', green: '#39a24b' };
const PAWN_ORDER = ['red', 'blue', 'yellow', 'green'];
const AI_NAMES = ['Fizz', 'Pop', 'Gummy'];
const TREAT_EMOJI = { plum: '🍇', mint: '🍃', jelly: '🍓', toffee: '🍬', swirl: '🍭', snow: '🍧' };
const SHORTCUT_NAMES = { 4: 'Rainbow Trail', 33: 'Gumdrop Pass' };
const pathData = SIM.buildPath();

/* ---------- boards ---------- */
const boardCache = {};
let boardKey = 'portrait';
let board = null;
function loadBoards(cb) {
  // Paintings travel as base64 script chunks (the repo connector is
  // text-only): parts append to window.__B64P / __B64W, then decode to
  // Blob URLs. Falls back to the plain .jpg if chunks are missing.
  let pending = Object.keys(PATHS.BOARDS).length;
  const finish = () => { if (--pending === 0) cb(); };
  for (const key of Object.keys(PATHS.BOARDS)) {
    const def = PATHS.BOARDS[key];
    const built = PATHS.buildStones(def);
    const img = new Image();
    img.onload = finish; img.onerror = finish;
    boardCache[key] = { def, stones: built.stones, spacing: built.spacing, start: built.start, img };
    loadScriptParts(def.parts, def.prefix, joined => {
      if (joined) {
        try {
          const bin = atob(joined);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          img.src = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
          if (key === 'portrait') setSetupBg(img.src); else wideBgUrl = img.src;
          return;
        } catch (e) { /* fall through to file */ }
      }
      img.src = def.file;
      if (key === 'portrait') setSetupBg(def.file); else wideBgUrl = def.file;
    });
  }
}
function loadScriptParts(n, prefix, done) {
  const acc = prefix === 'p' ? '__B64P' : '__B64W';
  let i = 0;
  const next = () => {
    if (i >= n) { done(window[acc] || null); return; }
    const sc = document.createElement('script');
    sc.src = 'board-' + prefix + i + '.js?v=20261101d';
    sc.onload = () => { i++; next(); };
    sc.onerror = () => done(null);
    document.head.appendChild(sc);
  };
  next();
}
function setSetupBg(url) {
  portraitBgUrl = url;
  applySetupBg();
}
let portraitBgUrl = null, wideBgUrl = null;
function applySetupBg() {
  const el = document.getElementById('scene-setup');
  if (!el) return;
  const wide = window.innerWidth > window.innerHeight;
  const url = wide && wideBgUrl ? wideBgUrl : portraitBgUrl;
  if (url) el.style.backgroundImage = 'url(' + url + ')';
}
function pickBoard() {
  const wrap = $('#boardwrap');
  const want = wrap.clientWidth > wrap.clientHeight ? 'wide' : 'portrait';
  const alt = want === 'wide' ? 'portrait' : 'wide';
  boardKey = want;
  board = boardCache[want];
  if ((!board || !board.img.naturalWidth) && boardCache[alt] && boardCache[alt].img.naturalWidth) {
    boardKey = alt;
    board = boardCache[alt];
  }
}
function stonePos(i) {
  if (!board) return { x: 0, y: 0, dia: 18, widthPx: 100 };
  if (i < 0) return board.start;
  return board.stones[Math.min(i, SIM.CASTLE)];
}

/* ---------- state ---------- */
let S = null;               // sim state
let raceSeq = 0;            // bumped on race start/exit; stale async callbacks check it
let phase = 'setup';        // setup | idle | anim | over
let view = 'follow';        // follow | over
let anim = null;
let flyFocus = -1;
let camAnim = null;
const cam = { x: 0, y: 0, s: 1 };
const renderPos = [];       // per player: index | {mix} | {fx,fy,arc}
const hops = [];            // per player hop lift 0..1
const SLOT_OFF = [[-0.26, -0.24], [0.26, -0.24], [-0.26, 0.28], [0.26, 0.28]];

/* ---------- tiny synth ---------- */
let AC = null;
function beep(freq, dur, type, vol, when) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const t = AC.currentTime + (when || 0);
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(AC.destination); o.start(t); o.stop(t + dur + 0.05);
  } catch (e) { /* silent by design */ }
}
const sfx = {
  step: i => beep(340 + (i % 6) * 45, 0.09, 'triangle', 0.10),
  draw: () => { beep(520, 0.07, 'sine', 0.08); beep(660, 0.08, 'sine', 0.08, 0.06); },
  skip: () => beep(196, 0.22, 'sawtooth', 0.06),
  short: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.12, 'triangle', 0.10, i * 0.07)),
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => beep(f, 0.16, 'triangle', 0.11, i * 0.10)),
  land: () => { beep(880, 0.10, 'sine', 0.09); beep(1174, 0.12, 'sine', 0.08, 0.07); },
};

/* ---------- records + daily race ---------- */
const REC_KEY = 'sugar_records_v1';
function loadRecords() {
  try {
    const r = JSON.parse(localStorage.getItem(REC_KEY) || 'null');
    if (r && typeof r === 'object') return Object.assign({ played: 0, wins: 0, dailyPlays: 0, dailyWins: 0, streak: 0, bestStreak: 0, lastWinDate: '', lastPlayDate: '' }, r);
  } catch (e) { /* fresh */ }
  return { played: 0, wins: 0, dailyPlays: 0, dailyWins: 0, streak: 0, bestStreak: 0, lastWinDate: '', lastPlayDate: '' };
}
let REC = loadRecords();
function saveRecords() { try { localStorage.setItem(REC_KEY, JSON.stringify(REC)); } catch (e) { /* private mode */ } }
function dateStr(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function todayStr() { return dateStr(new Date()); }
async function dailySeed(str) {
  const msg = 'sugar-trail-daily:' + str;
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
    return new DataView(buf).getUint32(0) >>> 0;
  }
  let h = 2166136261 >>> 0;
  for (let i = 0; i < msg.length; i++) { h ^= msg.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function recordFinish(winnerIsYou) {
  REC.played++;
  if (winnerIsYou && raceMode !== 'pass') REC.wins++;
  if (raceMode === 'daily') {
    const t = todayStr();
    if (REC.lastPlayDate !== t) REC.dailyPlays++;
    REC.lastPlayDate = t;
    if (winnerIsYou) {
      REC.dailyWins++;
      if (REC.lastWinDate !== t) {
        const y = new Date(); y.setDate(y.getDate() - 1);
        REC.streak = REC.lastWinDate === dateStr(y) ? REC.streak + 1 : 1;
        REC.lastWinDate = t;
        REC.bestStreak = Math.max(REC.bestStreak, REC.streak);
      }
    }
  }
  saveRecords();
  updateDailyLine();
}
function updateDailyLine() {
  const el = document.getElementById('dailyLine');
  if (!el) return;
  const t = todayStr();
  const wonToday = REC.lastWinDate === t;
  const bits = [];
  bits.push(wonToday ? 'Today’s race: won ✓' : 'Today’s race is open');
  if (REC.streak >= 2) bits.push('🔥 ' + REC.streak + ' days');
  if (REC.dailyWins) bits.push(REC.dailyWins + ' daily win' + (REC.dailyWins === 1 ? '' : 's'));
  el.textContent = bits.join(' · ');
}

/* ---------- setup ---------- */
let mode = 'solo', autoCount = 3, humanCount = 2;
let raceMode = 'solo';
function buildSetup() {
  $('#modeSolo').classList.toggle('on', mode === 'solo');
  $('#modePass').classList.toggle('on', mode === 'pass');
  $('#modeDaily').classList.toggle('on', mode === 'daily');
  document.querySelectorAll('#segAuto button').forEach(b => b.classList.toggle('on', Number(b.dataset.n) === autoCount));
  document.querySelectorAll('#segHumans button').forEach(b => b.classList.toggle('on', Number(b.dataset.n) === humanCount));
}
$('#modeSolo').addEventListener('click', () => { mode = 'solo'; buildSetup(); });
$('#modePass').addEventListener('click', () => { mode = 'pass'; buildSetup(); });
$('#modeDaily').addEventListener('click', () => { mode = 'daily'; buildSetup(); });
document.querySelectorAll('#segAuto button').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); mode = 'solo'; autoCount = Number(b.dataset.n); buildSetup(); }));
document.querySelectorAll('#segHumans button').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); mode = 'pass'; humanCount = Number(b.dataset.n); buildSetup(); }));

function showScene(play) {
  $('#scene-play').hidden = !play;
  $('#scene-setup').hidden = play;
  if (play) requestAnimationFrame(() => resize());
}

/* ---------- flow ---------- */
function startGame() {
  if (mode === 'daily') {
    dailySeed(todayStr()).then(seed => beginRace(seed));
  } else {
    beginRace((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  }
}
function beginRace(seed) {
  raceSeq++;
  raceMode = mode;
  const defs = [];
  if (mode === 'pass') {
    for (let i = 0; i < humanCount; i++) defs.push({ name: 'Player ' + (i + 1), kind: 'human', pawn: PAWN_ORDER[i] });
  } else {
    defs.push({ name: 'You', kind: 'human', pawn: 'red' });
    const n = mode === 'daily' ? 3 : autoCount;
    for (let i = 0; i < n; i++) defs.push({ name: AI_NAMES[i], kind: 'auto', pawn: PAWN_ORDER[i + 1] });
  }
  S = SIM.createGame({ seed, players: defs });
  phase = 'idle'; view = 'follow'; anim = null;
  renderPos.length = 0; hops.length = 0;
  S.players.forEach(() => { renderPos.push(-1); hops.push(0); });
  $('#winveil').hidden = true;
  $('#btnView').textContent = 'Map';
  $('#card').className = 'empty';
  $('#card').innerHTML = '<div class="cardhint">Tap Draw to flip a card</div>';
  $('#eventline').textContent = raceMode === 'daily' ? 'Today’s race — same deck for everyone. Good luck!' : 'The trail is waiting.';
  showScene(true);
  resize();
  snapCamTo(stonePos(-1), true);
  refreshChrome();
  maybeAuto();
}
function cur() { return S.players[S.turn]; }
function refreshChrome() {
  const st = $('#standings'); st.innerHTML = '';
  S.players.forEach((p, i) => {
    const c = document.createElement('span');
    c.className = 'chip' + (S.turn === i && !S.over ? ' turn' : '');
    c.innerHTML = '<span class="cdot" style="background:' + PAWN_HEX[p.pawn] + '"></span>' + p.name + ' · ' + Math.max(0, Math.round((p.pos + 1) / (SIM.CASTLE + 1) * 100)) + '%';
    st.appendChild(c);
  });
  $('#turnline').textContent = S.over
    ? S.players[S.winner].name + ' reached the Castle!'
    : (cur().kind === 'human' ? (S.players.filter(p => p.kind === 'human').length === 1 ? 'Your turn' : cur().name + ' — your turn') : cur().name + ' is drawing…');
  const canDraw = phase === 'idle' && !S.over && cur().kind === 'human';
  $('#btnDraw').disabled = !canDraw;
}
function say(t) { $('#eventline').textContent = t; }
function showCard(card) {
  const el = $('#card');
  el.className = 'filled';
  if (card.kind === 'picture') {
    const sp = Object.values(SIM.SPECIALS).find(x => x.id === card.special);
    el.innerHTML = '<div class="treat">' + (TREAT_EMOJI[card.special] || '🍬') + '</div><div class="cname">' + (sp ? sp.name : card.special) + '</div>';
  } else if (card.count === 2) {
    el.innerHTML = '<div class="block small" style="background:' + TILE_HEX[card.color] + '"></div><div class="block small" style="background:' + TILE_HEX[card.color] + '"></div><div class="cname">Double ' + SIM.COLOR_NAMES[card.color] + '</div>';
  } else {
    el.innerHTML = '<div class="block" style="background:' + TILE_HEX[card.color] + '"></div><div class="cname">' + SIM.COLOR_NAMES[card.color] + '</div>';
  }
}
function maybeAuto() {
  if (!S || S.over || phase !== 'idle') return;
  if (cur().kind === 'auto') { const seq = raceSeq; setTimeout(() => { if (seq === raceSeq) takeTurnUI(); }, 750); }
}
function takeTurnUI() {
  if (!S || S.over || phase !== 'idle') return;
  phase = 'anim';
  refreshChrome();
  const ev = SIM.takeTurn(S);
  const seq = raceSeq;
  if (ev.type === 'skip') {
    sfx.skip();
    say(ev.name + ' is stuck in licorice — turn skipped.');
    setTimeout(() => { if (seq !== raceSeq || !S) return; phase = S.over ? 'over' : 'idle'; refreshChrome(); maybeAuto(); }, 900);
    return;
  }
  if (ev.type !== 'move') { phase = 'idle'; return; }
  sfx.draw();
  showCard(ev.card);
  say(describeEv(ev));
  animateEvent(ev, () => {
    if (seq !== raceSeq || !S) return;
    if (ev.win) return onWin(ev);
    if (ev.shortcut) { sfx.short(); say(ev.name + ' rode the ' + (SHORTCUT_NAMES[ev.shortcut.from] || 'shortcut') + ' — whoosh, far ahead!'); }
    else if (ev.licorice) { sfx.skip(); say('Licorice! ' + ev.name + ' will miss a turn.'); }
    else if (pathData[ev.to].special) sfx.land();
    phase = 'idle';
    refreshChrome();
    maybeAuto();
  });
}
function describeEv(ev) {
  const who = ev.name;
  let drew;
  if (ev.card.kind === 'picture') {
    const sp = Object.values(SIM.SPECIALS).find(x => x.id === ev.card.special);
    drew = 'the ' + (sp ? sp.name : ev.card.special) + ' picture card';
  } else {
    drew = (ev.card.count === 2 ? 'a double ' : 'a ') + SIM.COLOR_NAMES[ev.card.color].toLowerCase() + ' card';
  }
  let s = who + ' drew ' + drew + '.';
  if (ev.win) return s + ' All the way to the Castle!';
  if (ev.card.kind === 'picture' && ev.to < ev.from) s += ' Back down the trail…';
  const landed = pathData[ev.landed];
  if (landed.special) s += ' Hello, ' + landed.special.name + '!';
  return s;
}
function onWin(ev) {
  sfx.win();
  phase = 'over';
  refreshChrome();
  const w = S.players[S.winner];
  const soloHuman = S.players.filter(p => p.kind === 'human').length === 1;
  recordFinish(soloHuman && w.kind === 'human');
  $('#wintext').textContent = (w.kind === 'human' && soloHuman) ? 'You reached the Castle!' : w.name + ' reached the Castle!';
  let sub = 'First to the Candy Castle wins the race — sweet running by ' + w.name + ' in ' + w.turns + ' turns.';
  if (raceMode === 'daily') {
    sub = (w.kind === 'human' && soloHuman)
      ? 'You won today’s race!' + (REC.streak >= 2 ? ' 🔥 ' + REC.streak + ' days in a row.' : ' Come back tomorrow to start a streak.')
      : w.name + ' took today’s race. The deck is the same all day — race it again!';
  }
  $('#winsub').textContent = sub;
  setTimeout(() => { $('#winveil').hidden = false; }, 700);
}

/* ---------- animation ---------- */
function animateEvent(ev, cb) {
  if (Math.abs(ev.landed - ev.from) > 14) { // picture-card leaps: fly, don't walk the whole trail
    flyPawn(ev.player, ev.from, ev.landed, cb, Math.min(1400, 650 + Math.abs(ev.landed - ev.from) * 9));
    return;
  }
  const chain = [];
  if (ev.landed !== ev.from) {
    const step = ev.landed > ev.from ? 1 : -1;
    for (let i = ev.from + step; step > 0 ? i <= ev.landed : i >= ev.landed; i += step) chain.push(i);
  }
  const then = ev.shortcut ? { flyTo: ev.shortcut.to, cb } : { cb };
  if (!chain.length) { if (then.flyTo != null) flyPawn(ev.player, ev.from, then.flyTo, cb); else cb(); return; }
  const hopMs = Math.max(45, Math.min(HOP_MS, 1700 / Math.max(chain.length, 1)));
  anim = { pi: ev.player, chain, t: 0, idx: 0, fromPos: renderPos[ev.player], last: 0, then, hopMs };
}
function flyPawn(pi, fromIdx, toIdx, cb, dur) {
  const seq = raceSeq;
  flyFocus = pi;
  const fromP = { ...stonePos(fromIdx) };
  const toP = stonePos(toIdx);
  const t0 = performance.now();
  const fly = now => {
    if (seq !== raceSeq) { flyFocus = -1; return; }
    const f = Math.min((now - t0) / (dur || 550), 1);
    const e = f * (2 - f);
    renderPos[pi] = { fx: fromP.x + (toP.x - fromP.x) * e, fy: fromP.y + (toP.y - fromP.y) * e, arc: Math.sin(f * Math.PI) * 60 };
    if (f < 1) requestAnimationFrame(fly);
    else { renderPos[pi] = toIdx; flyFocus = -1; cb(); }
  };
  requestAnimationFrame(fly);
}
const HOP_MS = 150;
function tickAnim(now) {
  if (!anim) return;
  if (!anim.last) anim.last = now;
  const dt = now - anim.last; anim.last = now;
  anim.t += dt;
  const target = anim.chain[anim.idx];
  if (target == null) { finishAnim(); return; }
  const from = anim.idx === 0 ? anim.fromPos : anim.chain[anim.idx - 1];
  const f = Math.min(anim.t / (anim.hopMs || HOP_MS), 1);
  hops[anim.pi] = Math.sin(f * Math.PI);
  renderPos[anim.pi] = { mix: [from, target, f] };
  if (f >= 1) {
    sfx.step(anim.idx);
    renderPos[anim.pi] = target;
    hops[anim.pi] = 0;
    anim.idx++; anim.t = 0;
    if (anim.idx >= anim.chain.length) finishAnim();
  }
}
function finishAnim() {
  const a = anim; anim = null;
  if (a.then && a.then.flyTo != null) flyPawn(a.pi, renderPos[a.pi], a.then.flyTo, a.then.cb);
  else if (a.then) a.then.cb();
}
function resolvePos(v) {
  if (typeof v === 'number') return stonePos(v);
  if (v && v.mix) {
    const A = stonePos(v.mix[0]), B = stonePos(v.mix[1]);
    return { x: A.x + (B.x - A.x) * v.mix[2], y: A.y + (B.y - A.y) * v.mix[2], dia: B.dia, widthPx: B.widthPx };
  }
  if (v && v.fx != null) return { x: v.fx, y: v.fy, dia: 18, widthPx: 60, arc: v.arc };
  return stonePos(-1);
}

/* ---------- camera ---------- */
function followScale(W, H, focusDia) {
  // base view height, but breathe out where the painted stones are huge
  // (the foreground) so the opening isn't one stone filling the screen
  let viewH = boardKey === 'portrait' ? 430 : 470;
  if (focusDia) viewH = Math.max(viewH, focusDia * 3.2);
  let s = H / viewH;
  if (W / s > board.def.imgW) s = W / board.def.imgW;
  return s;
}
function clampCam(v, span, img) { return span >= img ? img / 2 : Math.max(span / 2, Math.min(img - span / 2, v)); }
function snapCamTo(p, instant) {
  const W = cv.width, H = cv.height;
  if (!W || !board) return;
  const target = view === 'over'
    ? { x: board.def.imgW / 2, y: board.def.imgH / 2, s: Math.min(W / board.def.imgW, H / board.def.imgH) * 0.985 }
    : { x: p.x, y: p.y, s: followScale(W, H, p.dia) };
  target.x = clampCam(target.x, W / target.s, board.def.imgW);
  target.y = clampCam(target.y, H / target.s, board.def.imgH);
  if (instant) { cam.x = target.x; cam.y = target.y; cam.s = target.s; camAnim = null; }
  else camAnim = { from: { ...cam }, to: target, t: 0 };
}
function snapCamSoft(p) {
  const W = cv.width, H = cv.height;
  const s = followScale(W, H, p.dia);
  const tx = clampCam(p.x, W / s, board.def.imgW), ty = clampCam(p.y, H / s, board.def.imgH);
  const far = Math.hypot(tx - cam.x, ty - cam.y) > 520;
  const k = far ? 0.45 : 0.12;
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.s += (s - cam.s) * 0.12;
}
function tickCam(dt) {
  if (!camAnim) return;
  camAnim.t += dt / 550;
  const f = Math.min(camAnim.t, 1), e = 1 - Math.pow(1 - f, 3);
  cam.x = camAnim.from.x + (camAnim.to.x - camAnim.from.x) * e;
  cam.y = camAnim.from.y + (camAnim.to.y - camAnim.from.y) * e;
  cam.s = camAnim.from.s + (camAnim.to.s - camAnim.from.s) * e;
  if (f >= 1) camAnim = null;
}

/* ---------- rendering ---------- */
const cv = $('#board'), ctx = cv.getContext('2d');
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f < 1) { r *= f; g *= f; b *= f; } else { r += (255 - r) * (f - 1); g += (255 - g) * (f - 1); b += (255 - b) * (f - 1); }
  return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
}
let lastFrame = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(now - (lastFrame || now), 100); lastFrame = now;
  if ($('#scene-play').hidden || !board || !S) return;
  tickAnim(now);
  const focusIdx = anim ? renderPos[anim.pi] : (flyFocus >= 0 ? renderPos[flyFocus] : renderPos[S.turn]);
  if (!camAnim && view === 'follow') snapCamSoft(resolvePos(focusIdx == null ? -1 : focusIdx));
  tickCam(dt);
  draw();
}
function draw() {
  const W = cv.width, H = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#7ba05b';
  ctx.fillRect(0, 0, W, H);
  if (!board.img.complete || !board.img.naturalWidth) return;
  ctx.translate(W / 2 - cam.x * cam.s, H / 2 - cam.y * cam.s);
  ctx.scale(cam.s, cam.s);
  ctx.drawImage(board.img, 0, 0);
  // pawns
  const order = S.players.map((p, i) => i).sort((a, b) => resolvePos(renderPos[a]).y - resolvePos(renderPos[b]).y);
  for (const i of order) {
    const p = S.players[i];
    const base = resolvePos(renderPos[i]);
    const st = (typeof renderPos[i] === 'number') ? stonePos(renderPos[i]) : base;
    const diaHere = st.dia || base.dia || 18;
    const widthHere = st.widthPx || base.widthPx || 100;
    const slot = SLOT_OFF[i % 4];
    const px = base.x + slot[0] * diaHere, py = base.y + slot[1] * diaHere;
    let pd = Math.min(diaHere * PATHS.PAWN_FRACTION, (cv.height / cam.s) * 0.15);
    if (view === 'over') pd = Math.max(pd, 30); // map view: far stones are tiny — keep every traveler findable
    drawPawn(px, py - (hops[i] || 0) * 7 - (base.arc || 0), pd / 2, PAWN_HEX[p.pawn], S.turn === i && !S.over);
  }
}
function drawPawn(x, y, r, hex, active) {
  ctx.fillStyle = 'rgba(50,25,0,.28)';
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.8, r * 0.85, r * 0.34, 0, 0, 7); ctx.fill();
  const gr = ctx.createRadialGradient(x - r * 0.25, y - r * 0.35, r * 0.12, x, y, r * 1.05);
  gr.addColorStop(0, shade(hex, 1.3)); gr.addColorStop(1, shade(hex, 0.8));
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(x, y - r * 0.18, r * 0.72, 0, 7); ctx.fill();
  ctx.fillStyle = shade(hex, 0.94);
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.6, r * 0.88, r * 0.34, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = active ? '#fff3b0' : 'rgba(255,255,255,.65)';
  ctx.lineWidth = active ? 2.6 : 1.4;
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.6, r * 0.88, r * 0.34, 0, 0, 7); ctx.stroke();
  if (active) { ctx.beginPath(); ctx.arc(x, y - r * 0.18, r * 0.72, 0, 7); ctx.stroke(); }
}

/* ---------- sizing ---------- */
function resize() {
  const wrap = $('#boardwrap');
  if (!wrap || !wrap.clientWidth) return;
  const prevKey = boardKey;
  pickBoard();
  if (prevKey !== boardKey && S && !$('#scene-play').hidden) {
    const fi = anim ? renderPos[anim.pi] : renderPos[S.turn];
    snapCamTo(resolvePos(fi == null ? -1 : fi), true);
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(wrap.clientWidth * dpr);
  cv.height = Math.round(wrap.clientHeight * dpr);
}
window.addEventListener('resize', () => { resize(); applySetupBg(); });

/* ---------- wiring ---------- */
const startBtn = $('#btnStart');
startBtn.disabled = true; startBtn.textContent = 'Loading the country…';
loadBoards(() => { startBtn.disabled = false; startBtn.textContent = 'Start the Race'; });
startBtn.addEventListener('click', startGame);
$('#btnDraw').addEventListener('click', () => { if (S && phase === 'idle' && !S.over && cur().kind === 'human') takeTurnUI(); });
$('#btnView').addEventListener('click', () => {
  view = view === 'follow' ? 'over' : 'follow';
  $('#btnView').textContent = view === 'follow' ? 'Map' : 'Follow';
  const focus = S ? resolvePos(renderPos[S.turn]) : stonePos(-1);
  snapCamTo(focus, false);
});
$('#btnMenu').addEventListener('click', exitToSetup);
function exitToSetup() { raceSeq++; S = null; phase = 'setup'; anim = null; flyFocus = -1; showScene(false); }
$('#btnAgain').addEventListener('click', () => { $('#winveil').hidden = true; startGame(); });
$('#btnSetup2').addEventListener('click', () => { $('#winveil').hidden = true; exitToSetup(); });
buildSetup();
updateDailyLine();
requestAnimationFrame(frame);

/* test surface (used by tests/drive.js) */
window.__sugar = {
  ST: SIM,
  get state() { return S; },
  get phase() { return phase; },
  startGame,
  stonePos: i => stonePos(i),
  boardKey: () => boardKey,
  fit: () => board ? { key: boardKey, pawnFraction: PATHS.PAWN_FRACTION, count: board.stones.length } : null,
  rigDraw: cards => { if (S) { S.draw = cards.slice().reverse(); S.discard = []; } },
  records: () => ({ ...REC }),
  dailySeedFor: str => dailySeed(str),
  get raceMode() { return raceMode; },
  getCam: () => ({ ...cam }),
  renderPos: () => renderPos.slice(),
  focusPos: () => resolvePos(renderPos[S ? S.turn : 0]),
};
