/* ============================================================
   SKYHOOK — one-button rope swing
   Hold anywhere to pull Mochi back. Release to swing.
   Land on the next tower. Dead center = PERFECT.
   ============================================================ */
(function () {
'use strict';

/* ---------------- utils ---------------- */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeInQuad = t => t * t;
const easeOutBack = t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const store = {
  get(k, d) { try { const v = localStorage.getItem('skyhook_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('skyhook_' + k, JSON.stringify(v)); } catch (e) {} },
};

/* ---------------- tuning ---------------- */
const TUNE = {
  ropeLen: 170,          // world px
  hookH: 190,            // pivot height above tower tops (the skyhook crane!)
  thetaMax: 1.10,        // max pull-back angle (rad)
  chargeTime: 1.15,      // seconds hold for full pull
  swingTime: 0.55,       // swing animation seconds
  creatureR: 20,
  perfectHalf: 0.17,     // fraction of tower width (half-width of perfect zone)
  rainbowChance: 0.35,
  draftEvery: 8,
};

/* ---------------- canvas ---------------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1, S = 1; // S = world scale
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  S = clamp(Math.min(W / 400, H / 760), 0.72, 1.12);
}
window.addEventListener('resize', resize);
resize();

const topY = () => H * 0.40;                 // screen y of tower tops
const w2sx = (wx, camX) => W * 0.40 + (wx - camX) * S;
const w2sy = wy => topY() + wy * S;

/* ---------------- particles (pooled) ---------------- */
const P_MAX = 220;
const parts = [];
for (let i = 0; i < P_MAX; i++) parts.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, r: 3, col: '#fff', grav: 0, drag: 1, glow: false });
let pCursor = 0;
function spawnP(x, y, vx, vy, life, r, col, grav, glow) {
  const p = parts[pCursor]; pCursor = (pCursor + 1) % P_MAX;
  p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.life = life; p.max = life; p.r = r; p.col = col;
  p.grav = grav || 0; p.drag = 1; p.glow = !!glow;
}
function burst(wx, wy, n, col, spd, life, r, grav, glow) {
  const lim = G.calm ? Math.ceil(n / 3) : n;
  for (let i = 0; i < lim; i++) {
    const a = Math.random() * TAU, s = spd * (0.3 + Math.random() * 0.7);
    spawnP(wx, wy, Math.cos(a) * s, Math.sin(a) * s - spd * 0.35, life * (0.6 + Math.random() * 0.4), r * (0.6 + Math.random() * 0.8), col, grav, glow);
  }
}
function updateParts(dt) {
  for (let i = 0; i < P_MAX; i++) {
    const p = parts[i]; if (!p.on) continue;
    p.life -= dt;
    if (p.life <= 0) { p.on = false; continue; }
    p.vy += p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
}

/* ---------------- game state ---------------- */
const G = {
  scene: 'menu',       // menu | play | upgrade | pause | over
  phase: 'ready',      // ready | charging | swinging | flying | landing | done
  mode: 'endless',     // endless | daily
  rng: mulberry32(1),
  camX: 0, camTarget: 0,
  towers: [],          // {x, w, hue, moveAmp, moveSpd, movePh, rainbow:{x,y,taken}|null}
  idx: 0,              // current tower index
  pivotX: 0,
  ropeLen: TUNE.ropeLen,
  theta: 0, holdT: 0,
  swingT: 0, swingFrom: 0, swingTo: 0,
  landX: 0, landKind: null,
  fly: { x: 0, y: 0, vx: 0, vy: 0, rot: 0 },
  score: 0, perfects: 0, perfectRow: 0, fire: false,
  rainbows: 0, towersCleared: 0,
  upgrades: [],        // owned ids
  secondWind: false,
  shake: 0, slowmo: 1, time: 0,
  hint: false, hintStage: 0,
  calm: store.get('calm', false),
  haptic: store.get('haptic', true),
  best: store.get('best', 0),
  rainbowsTotal: store.get('rainbows', 0),
  landAnim: 0,         // landing squash timer
  fireAnim: 0,
  creatureMood: 'happy', // happy | scared | dizzy | sad
  moodT: 0,
  blinkT: 2,
  dailyKey: '',
};

/* ---------------- swing math (pure — headless-testable) ---------------- */
function landingX(pivotX, ropeLen, theta) {
  return pivotX + ropeLen * Math.sin(theta);
}
// Returns 'perfect' | 'land' | 'short' | 'long'.
// tower: {x, w} current position. perfectHalf: half-width of perfect zone as fraction of w.
function resolveLanding(landX, tower, perfectHalf) {
  const left = tower.x, right = tower.x + tower.w;
  if (landX < left - 2) return 'short';
  if (landX > right + 2) return 'long';
  const cx = tower.x + tower.w / 2;
  return Math.abs(landX - cx) <= tower.w * perfectHalf ? 'perfect' : 'land';
}

/* ---------------- world generation ---------------- */
function towerX(i) { return G.towers[i].x + towerDrift(G.towers[i], G.time); }
function towerDrift(tw, time) {
  return tw.moveAmp ? Math.sin(time * tw.moveSpd + tw.movePh) * tw.moveAmp : 0;
}

function genTower(i) {
  const r = G.rng;
  const diff = clamp(i / 40, 0, 1); // difficulty 0..1
  const prev = G.towers[i - 1];
  const wMin = lerp(95, 70, diff);
  let wMax = lerp(140, 105, diff);
  // airtight: keep widths small enough that a legal gap always exists
  const reach = TUNE.ropeLen * Math.sin(TUNE.thetaMax);
  wMax = Math.min(wMax, Math.max(60, 1.8 * reach - prev.w - 52));
  const w = wMin + r() * Math.max(1, (wMax - wMin));
  // gap is derived from real reach so the next tower's CENTER is always
  // reachable with ~10% margin; difficulty pushes gaps toward the max
  const maxGap = Math.max(26, 0.9 * reach - prev.w / 2 - w / 2);
  const loFrac = lerp(0.25, 0.6, diff);
  const gap = maxGap * (loFrac + r() * (1 - loFrac));
  const x = prev.x + prev.w + gap;
  const hue = 150 + r() * 60; // grassy greens/teals
  // moving towers after tower 12 — a timing challenge, always solvable by waiting
  let moveAmp = 0, moveSpd = 0, movePh = r() * TAU;
  if (i > 12 && r() < 0.3 + diff * 0.25) {
    moveAmp = 12 + r() * 14;
    moveSpd = 0.5 + r() * 0.8;
  }
  // rainbow above the gap, along the swing path
  let rainbow = null;
  if (r() < TUNE.rainbowChance) {
    const midX = prev.x + prev.w + gap / 2;
    rainbow = { x: midX + (r() - 0.5) * 40, y: -TUNE.hookH + TUNE.ropeLen * 0.45, taken: false, ph: r() * TAU };
  }
  return { x, w, hue, moveAmp, moveSpd, movePh, rainbow };
}

function newRun(mode) {
  G.mode = mode;
  const seed = mode === 'daily' ? hashStr(G.dailyKey) : (Math.random() * 1e9) | 0;
  G.rng = mulberry32(seed);
  G.towers = [{ x: 0, w: 130, hue: 160, moveAmp: 0, moveSpd: 0, movePh: 0, rainbow: null }];
  for (let i = 1; i < 6; i++) G.towers.push(genTower(i));
  G.idx = 0;
  G.pivotX = G.towers[0].x + G.towers[0].w / 2;
  G.ropeLen = TUNE.ropeLen;
  G.camX = G.pivotX; G.camTarget = G.pivotX;
  G.score = 0; G.perfects = 0; G.perfectRow = 0; G.fire = false;
  G.rainbows = 0; G.towersCleared = 0;
  G.upgrades = []; G.secondWind = false;
  G.theta = 0; G.holdT = 0; G.phase = 'ready';
  G.shake = 0; G.slowmo = 1; G.landAnim = 0;
  G.creatureMood = 'happy';
  for (const p of parts) p.on = false;
  // tutorial hint on very first run ever
  G.hint = !store.get('hintSeen', false);
  G.hintStage = 0;
}

function ensureTowers() {
  while (G.towers.length < G.idx + 7) G.towers.push(genTower(G.towers.length));
}

/* ---------------- upgrades ---------------- */
const UPGRADES = [
  { id: 'rope',   ico: '🪢', name: 'Longer Rope',   desc: '+12% rope reach. Swing farther, dream bigger.' },
  { id: 'hooves', ico: '🐾', name: 'Sticky Hooves', desc: 'PERFECT zone 40% wider.' },
  { id: 'magnet', ico: '🧲', name: 'Rainbow Magnet', desc: 'Grab rainbows from 60% farther away.' },
  { id: 'wind',   ico: '🍃', name: 'Second Wind',   desc: 'Survive one missed landing per run.', once: true },
  { id: 'feather',ico: '🪶', name: 'Feather Fall',   desc: 'Charging runs 30% slower — finer aim.' },
  { id: 'clover', ico: '🍀', name: 'Lucky Clover',   desc: '20% of normal landings count as PERFECT.' },
];
function hasUp(id) { return G.upgrades.includes(id); }
function perfectHalf() {
  let h = TUNE.perfectHalf;
  if (hasUp('hooves')) h *= 1.4;
  return h;
}
function chargeTime() {
  return TUNE.chargeTime * (hasUp('feather') ? 1.3 : 1);
}
function applyUpgrade(id) {
  G.upgrades.push(id);
  if (id === 'rope') G.ropeLen *= 1.12;
  if (id === 'wind') G.secondWind = true;
}
function draftUpgrades() {
  const pool = UPGRADES.filter(u => !(u.once && hasUp(u.id)));
  const picks = [];
  const cpool = pool.slice();
  while (picks.length < 3 && cpool.length) {
    picks.push(cpool.splice((Math.random() * cpool.length) | 0, 1)[0]);
  }
  return picks;
}

/* ---------------- helpers ---------------- */
function buzz(pat) {
  if (!G.haptic) return;
  try { if (navigator.vibrate) navigator.vibrate(pat); } catch (e) {}
}
let toastTimer = 0;
function toast(txt, cls) {
  const el = document.getElementById('toast');
  el.textContent = txt;
  el.className = cls || '';
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 900);
}
function addShake(px) { if (!G.calm) G.shake = Math.min(10, G.shake + px); }

/* ---------------- input ---------------- */
let holding = false;
function onDown(e) {
  if (e.cancelable) e.preventDefault();
  SkyAudio.unlock();
  if (G.scene !== 'play') return;
  if (G.phase !== 'ready') return;
  holding = true;
  G.phase = 'charging';
  G.holdT = 0;
  SkyAudio.chargeStart();
  if (G.hint && G.hintStage === 0) { G.hintStage = 1; syncHint(); }
}
function onUp(e) {
  if (!holding) return;
  holding = false;
  SkyAudio.chargeStop();
  if (G.scene !== 'play' || G.phase !== 'charging') return;
  releaseSwing();
  if (G.hint && G.hintStage === 1) { G.hintStage = 2; syncHint(); }
}
canvas.addEventListener('pointerdown', onDown);
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', () => { holding = false; SkyAudio.chargeStop(); if (G.phase === 'charging') G.phase = 'ready'; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.scene === 'play' && (G.phase === 'ready' || G.phase === 'charging')) pauseGame();
});
// keyboard: space works like a finger
window.addEventListener('keydown', e => {
  if (e.code === 'Space' && !e.repeat) { e.preventDefault(); onDown(e); }
});
window.addEventListener('keyup', e => {
  if (e.code === 'Space') { e.preventDefault(); onUp(e); }
});

function syncHint() {
  const el = document.getElementById('hold-hint');
  if (!G.hint || G.hintStage >= 2) { el.hidden = true; return; }
  el.hidden = false;
  el.querySelector('span').textContent = G.hintStage === 0 ? 'HOLD' : 'RELEASE!';
}

/* ---------------- swing resolution ---------------- */
function releaseSwing() {
  const th = TUNE.thetaMax * clamp(G.holdT / chargeTime(), 0, 1);
  G.theta = Math.max(0.06, th);
  G.swingFrom = -G.theta;
  G.swingTo = G.theta;
  G.swingT = 0;
  G.phase = 'swinging';
  G.creatureMood = 'happy';
  SkyAudio.release();
  addShake(2);
}

function creaturePos() {
  // world coords of Mochi depending on phase
  const tw = G.towers[G.idx];
  const txx = tw.x + towerDrift(tw, G.time);
  const cx = txx + tw.w / 2;
  const py = -TUNE.hookH;
  if (G.phase === 'ready') {
    return { x: cx + 30, y: -TUNE.creatureR + Math.sin(G.time * 2.2) * 3, ang: 0, sitting: true };
  }
  if (G.phase === 'charging') {
    const a = -TUNE.thetaMax * clamp(G.holdT / chargeTime(), 0, 1);
    return { x: G.pivotX + G.ropeLen * Math.sin(a), y: py + G.ropeLen * Math.cos(a), ang: a, sitting: false };
  }
  if (G.phase === 'swinging') {
    const t = clamp(G.swingT / TUNE.swingTime, 0, 1);
    const a = lerp(G.swingFrom, G.swingTo, easeInQuad(t));
    return { x: G.pivotX + G.ropeLen * Math.sin(a), y: py + G.ropeLen * Math.cos(a), ang: a, sitting: false };
  }
  if (G.phase === 'flying') {
    return { x: G.fly.x, y: G.fly.y, ang: G.fly.rot, sitting: false };
  }
  if (G.phase === 'landing' || G.phase === 'done') {
    const ntw = G.towers[G.idx];
    const nx = ntw.x + towerDrift(ntw, G.time);
    return { x: nx + ntw.w / 2, y: -TUNE.creatureR, ang: 0, sitting: true, landed: true };
  }
  return { x: cx, y: 0, ang: 0, sitting: true };
}

function resolveSwing() {
  const ntw = G.towers[G.idx + 1];
  const nx = ntw.x + towerDrift(ntw, G.time);
  const landX = landingX(G.pivotX, G.ropeLen, G.theta);
  G.landX = landX;
  let kind = resolveLanding(landX, { x: nx, w: ntw.w }, perfectHalf());
  // lucky clover: normal landing may upgrade to perfect
  if (kind === 'land' && hasUp('clover') && Math.random() < 0.2) kind = 'perfect';
  G.landKind = kind;
  const sx = w2sx(landX, G.camX), sy = w2sy(-TUNE.hookH + G.ropeLen * Math.cos(G.theta));
  if (kind === 'perfect' || kind === 'land') {
    // move to next tower
    G.idx++;
    ensureTowers();
    G.pivotX = nx + ntw.w / 2;
    G.towersCleared++;
    G.phase = 'landing';
    G.landAnim = 0.35;
    const pts = (kind === 'perfect' ? 2 : 1) * (G.fire ? 2 : 1);
    G.score += pts;
    if (kind === 'perfect') {
      G.perfects++; G.perfectRow++;
      SkyAudio.perfect();
      buzz([10, 40, 10]);
      burst(landX, -10, 26, '#59e3ff', 260, 0.8, 4, 300, true);
      burst(landX, -10, 12, '#ffd166', 200, 0.7, 3, 300, true);
      toast(G.perfectRow >= 3 && !G.fire ? 'ON FIRE! 🔥' : 'PERFECT! +' + pts, G.perfectRow >= 3 ? 'fire' : 'perfect');
      if (G.perfectRow >= 3 && !G.fire) { G.fire = true; SkyAudio.fire(); }
      addShake(3);
    } else {
      G.perfectRow = 0; G.fire = false;
      SkyAudio.land();
      buzz(15);
      burst(landX, -6, 12, '#fff7ea', 160, 0.5, 3, 400, false);
    }
    // checkpoint draft?
    if (G.towersCleared % TUNE.draftEvery === 0) {
      const tryDraft = () => {
        if (G.scene === 'play' && G.phase === 'ready') openUpgrade();
        else if (G.scene === 'play' || G.scene === 'pause') setTimeout(tryDraft, 800);
      };
      setTimeout(tryDraft, 650);
    }
    updateHUD();
  } else {
    // miss — detach into a fall
    const a = G.theta;
    G.fly.x = landX;
    G.fly.y = -TUNE.hookH + G.ropeLen * Math.cos(a);
    const sp = 420;
    G.fly.vx = Math.cos(a) * sp * (kind === 'long' ? 1 : 0.4);
    G.fly.vy = -Math.sin(a) * sp * 0.5;
    G.fly.rot = 0;
    G.phase = 'flying';
    G.creatureMood = 'scared';
    if (kind === 'long') { SkyAudio.bonk(); addShake(6); buzz([40, 80, 40]); }
    else { SkyAudio.release(); }
  }
}

function missRun(kind) {
  // called when the falling creature is gone
  if (G.secondWind) {
    G.secondWind = false;
    G.upgrades = G.upgrades.filter(u => u !== 'wind');
    toast('SECOND WIND! 🍃');
    SkyAudio.upgrade();
    // back to ready on the same tower
    G.phase = 'ready';
    G.creatureMood = 'happy';
    G.theta = 0; G.holdT = 0;
    return;
  }
  endRun(kind);
}

function endRun(kind) {
  G.scene = 'over';
  G.phase = 'done';
  SkyAudio.chargeStop();
  if (kind === 'short') SkyAudio.splash(); else if (kind === 'long') SkyAudio.bonk();
  SkyAudio.over();
  buzz([40, 80, 40, 40, 80, 40]);
  const nb = G.score > G.best;
  if (nb) { G.best = G.score; store.set('best', G.best); }
  G.rainbowsTotal += G.rainbows;
  store.set('rainbows', G.rainbowsTotal);
  if (G.mode === 'daily') store.set('daily_' + G.dailyKey, G.score);
  // fill game-over sheet
  document.getElementById('over-title').textContent =
    kind === 'short' ? 'Splashed!' : kind === 'long' ? 'Bonked!' : 'Run over!';
  const flavors = [
    'Mochi believes in you. Mostly.',
    'The towers are laughing. Politely.',
    'So close. The rainbow saw it too.',
    'Gravity: 1. Mochi: ' + G.score + '.',
  ];
  document.getElementById('over-flavor').textContent = flavors[(Math.random() * flavors.length) | 0];
  document.getElementById('over-score').textContent = G.score;
  document.getElementById('over-towers').textContent = G.towersCleared;
  document.getElementById('over-perfects').textContent = G.perfects;
  document.getElementById('over-rainbows').textContent = G.rainbows;
  document.getElementById('over-newbest').hidden = !nb;
  showScreen('over');
  setCornerButtons(false);
}

/* ---------------- update ---------------- */
let lastT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - lastT) / 1000 || 0.016);
  lastT = now;
  // slow-mo dip on fire start (skipped in calm mode)
  const targetSlow = (G.fire && G.fireAnim > 0 && !G.calm) ? 0.45 : 1;
  G.slowmo += (targetSlow - G.slowmo) * Math.min(1, dt * 8);
  dt *= G.slowmo;
  G.time += dt;
  if (G.scene === 'play' || G.scene === 'over') update(dt);
  render();
  updateParts(G.calm ? dt * 0.5 : dt);
}

function update(dt) {
  // camera follows pivot
  G.camTarget = G.pivotX;
  G.camX += (G.camTarget - G.camX) * Math.min(1, dt * 5);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 26);
  if (G.landAnim > 0) G.landAnim -= dt;
  if (G.fireAnim > 0) G.fireAnim -= dt;
  if (G.moodT > 0) { G.moodT -= dt; if (G.moodT <= 0) G.creatureMood = 'happy'; }
  G.blinkT -= dt;
  if (G.blinkT < -0.12) G.blinkT = 2 + Math.random() * 3;

  if (G.phase === 'charging') {
    G.holdT += dt;
    SkyAudio.chargeSet(clamp(G.holdT / chargeTime(), 0, 1));
    if (G.hint && G.hintStage === 0) { G.hintStage = 1; syncHint(); }
  }
  if (G.phase === 'swinging') {
    G.swingT += dt;
    // rainbow pickup along the path
    const cp = creaturePos();
    const magnetR = 46 * (hasUp('magnet') ? 1.6 : 1);
    for (let i = G.idx; i <= G.idx + 1; i++) {
      const rb = G.towers[i] && G.towers[i].rainbow;
      if (rb && !rb.taken) {
        const dx = cp.x - rb.x, dy = cp.y - rb.y;
        if (dx * dx + dy * dy < magnetR * magnetR) {
          rb.taken = true;
          G.rainbows++;
          SkyAudio.rainbow();
          buzz(10);
          burst(rb.x, rb.y, 18, '#ff8fd1', 200, 0.7, 4, 100, true);
          toast('+🌈', 'perfect');
          updateHUD();
        }
      }
    }
    // fire trail
    if (G.fire && Math.random() < 0.6) {
      spawnP(cp.x, cp.y + 10, (Math.random() - 0.5) * 60, -80 - Math.random() * 60,
        0.5, 5 + Math.random() * 5, Math.random() < 0.5 ? '#ffb347' : '#ff5d8f', -60, true);
    }
    if (G.swingT >= TUNE.swingTime) resolveSwing();
  }
  if (G.phase === 'flying') {
    G.fly.vy += 1500 * dt;
    G.fly.x += G.fly.vx * dt;
    G.fly.y += G.fly.vy * dt;
    G.fly.rot += dt * 6;
    if (Math.random() < 0.4) spawnP(G.fly.x, G.fly.y, 0, 0, 0.4, 4, '#ffffff', 0, false);
    if (G.fly.y > 320) {
      // gone below — splash among the clouds
      const sx = w2sx(G.fly.x, G.camX);
      burst(G.fly.x, 300, 24, '#bfe9ff', 260, 0.8, 5, 500, false);
      void sx;
      missRun(G.landKind);
    }
  }
  if (G.phase === 'landing') {
    G.landT = (G.landT || 0) + dt;
    if (G.landT > 0.45) { G.landT = 0; G.phase = 'ready'; G.theta = 0; G.holdT = 0; }
  }
}

/* ---------------- render ---------------- */
function render() {
  ctx.save();
  // screen shake
  if (G.shake > 0.2) ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);

  drawSky();
  drawClouds();
  drawRainbows();
  drawTowers();
  drawHookAndRope();
  drawCreature();
  drawParts();
  if (G.fire) drawFireTint();

  ctx.restore();
}

function drawSky() {
  // dawn gradient: peach → lavender → plum
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#3b2560');
  g.addColorStop(0.35, '#6b3f7e');
  g.addColorStop(0.62, '#c96f4a');
  g.addColorStop(0.8, '#f2a65a');
  g.addColorStop(1, '#2b1e4e');
  ctx.fillStyle = g;
  ctx.fillRect(-20, -20, W + 40, H + 40);
  // sun glow
  const sx = W * 0.78, sy = H * 0.30;
  const rg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 220 * S);
  rg.addColorStop(0, 'rgba(255, 214, 130, 0.85)');
  rg.addColorStop(0.4, 'rgba(255, 170, 110, 0.35)');
  rg.addColorStop(1, 'rgba(255, 170, 110, 0)');
  ctx.fillStyle = rg;
  ctx.fillRect(sx - 230 * S, sy - 230 * S, 460 * S, 460 * S);
  // stars up top
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  const sr = hashStr('stars');
  const srg = mulberry32(sr);
  for (let i = 0; i < 40; i++) {
    const x = srg() * W, y = srg() * H * 0.3;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(G.time * 1.5 + i));
    ctx.globalAlpha = 0.5 * tw;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
}

const cloudSeed = [];
for (let i = 0; i < 14; i++) cloudSeed.push({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 1.4, v: 4 + Math.random() * 8, layer: i % 2 });
function drawClouds() {
  for (const c of cloudSeed) {
    const par = c.layer === 0 ? 0.25 : 0.5;
    let x = ((c.x * (W + 400) - G.camX * S * par + G.time * c.v) % (W + 400) + (W + 400)) % (W + 400) - 200;
    const y = c.y * H * 0.75;
    const s = c.s * S * (c.layer === 0 ? 0.8 : 1.15);
    ctx.fillStyle = c.layer === 0 ? 'rgba(255,235,220,0.28)' : 'rgba(255,240,230,0.5)';
    ctx.beginPath();
    ctx.arc(x, y, 26 * s, 0, TAU);
    ctx.arc(x + 24 * s, y - 8 * s, 20 * s, 0, TAU);
    ctx.arc(x - 26 * s, y - 4 * s, 18 * s, 0, TAU);
    ctx.arc(x + 4 * s, y + 6 * s, 22 * s, 0, TAU);
    ctx.fill();
  }
}

function drawRainbowArc(sx, sy, s, alpha) {
  const cols = ['#ff5d5d', '#ff9f43', '#ffd166', '#7fd08a', '#59b7ff', '#b98cff'];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 7 * s;
  for (let i = 0; i < cols.length; i++) {
    ctx.strokeStyle = cols[i];
    ctx.beginPath();
    ctx.arc(sx, sy, (44 - i * 7) * s, Math.PI, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRainbows() {
  for (let i = Math.max(0, G.idx - 1); i < Math.min(G.towers.length, G.idx + 4); i++) {
    const rb = G.towers[i].rainbow;
    if (!rb || rb.taken) continue;
    const bob = Math.sin(G.time * 2 + rb.ph) * 8;
    const sx = w2sx(rb.x, G.camX), sy = w2sy(rb.y + bob);
    const tw = 0.75 + 0.25 * Math.sin(G.time * 3 + rb.ph);
    drawRainbowArc(sx, sy, S * tw, 0.9);
  }
}

function drawTowers() {
  const lo = G.camX - W * 0.5 / S, hi = G.camX + W * 1.2 / S;
  for (let i = 0; i < G.towers.length; i++) {
    const tw = G.towers[i];
    const wx = tw.x + towerDrift(tw, G.time);
    if (wx + tw.w < lo || wx > hi) continue;
    const sx = w2sx(wx, G.camX), sw = tw.w * S;
    const sy = w2sy(0);
    // pillar body
    const bg = ctx.createLinearGradient(sx, 0, sx + sw, 0);
    bg.addColorStop(0, '#f7ecd4');
    bg.addColorStop(0.5, '#efe0c2');
    bg.addColorStop(1, '#d9c69c');
    ctx.fillStyle = bg;
    roundRect(sx, sy, sw, H, 10 * S);
    ctx.fill();
    // stone seams
    ctx.strokeStyle = 'rgba(120,95,60,0.25)';
    ctx.lineWidth = 2 * S;
    for (let k = 1; k < 4; k++) {
      const yy = sy + (H - sy + 20) * k / 4;
      ctx.beginPath(); ctx.moveTo(sx + 6 * S, yy); ctx.lineTo(sx + sw - 6 * S, yy); ctx.stroke();
    }
    // grass cap
    const gg = ctx.createLinearGradient(0, sy - 14 * S, 0, sy + 10 * S);
    gg.addColorStop(0, `hsl(${tw.hue}, 55%, 62%)`);
    gg.addColorStop(1, `hsl(${tw.hue}, 50%, 42%)`);
    ctx.fillStyle = gg;
    roundRect(sx - 5 * S, sy - 14 * S, sw + 10 * S, 26 * S, 12 * S);
    ctx.fill();
    // grass tufts
    ctx.strokeStyle = `hsl(${tw.hue}, 55%, 35%)`;
    ctx.lineWidth = 2.5 * S;
    const tg = mulberry32(hashStr('tuft' + i));
    for (let k = 0; k < 5; k++) {
      const tx = sx + tg() * sw;
      ctx.beginPath(); ctx.moveTo(tx, sy - 12 * S);
      ctx.quadraticCurveTo(tx + 4 * S, sy - 22 * S, tx + 8 * S, sy - 14 * S);
      ctx.stroke();
    }
    // current tower marker: little flag
    if (i === G.idx && G.scene === 'play') {
      ctx.fillStyle = '#ff5d8f';
      const fx = sx + sw / 2;
      ctx.fillRect(fx - 1.5 * S, sy - 52 * S, 3 * S, 40 * S);
      ctx.beginPath();
      ctx.moveTo(fx + 1.5 * S, sy - 52 * S);
      ctx.lineTo(fx + 26 * S, sy - 44 * S);
      ctx.lineTo(fx + 1.5 * S, sy - 36 * S);
      ctx.closePath(); ctx.fill();
    }
    // perfect-zone ring on the NEXT tower while charging
    if (i === G.idx + 1 && G.phase === 'charging' && G.scene === 'play') {
      const cxp = sx + sw / 2;
      const pr = tw.w * perfectHalf() * S;
      const pulse = 0.55 + 0.3 * Math.sin(G.time * 6);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#59e3ff';
      ctx.lineWidth = 3.5 * S;
      ctx.shadowColor = '#59e3ff'; ctx.shadowBlur = 14 * S;
      ctx.beginPath();
      ctx.ellipse(cxp, sy - 4 * S, pr, 9 * S, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    // motion streaks for drifting towers
    if (tw.moveAmp > 0) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 * S;
      const my = sy + 60 * S;
      ctx.beginPath();
      ctx.moveTo(sx - 18 * S, my); ctx.lineTo(sx - 34 * S, my);
      ctx.moveTo(sx + sw + 18 * S, my); ctx.lineTo(sx + sw + 34 * S, my);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawHookAndRope() {
  if (G.scene !== 'play' && G.scene !== 'over') return;
  const tw = G.towers[G.idx];
  const txx = tw.x + towerDrift(tw, G.time);
  const cxs = w2sx(txx + tw.w / 2, G.camX);
  const sys = w2sy(0);
  const pxs = w2sx(G.pivotX, G.camX), pys = w2sy(-TUNE.hookH);
  // chunky wooden crane arm from tower top up to the pivot
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#7a4f30';
  ctx.lineWidth = 13 * S;
  ctx.beginPath(); ctx.moveTo(cxs, sys - 4 * S); ctx.lineTo(pxs, pys + 8 * S); ctx.stroke();
  ctx.strokeStyle = '#9c6b42';
  ctx.lineWidth = 7 * S;
  ctx.beginPath(); ctx.moveTo(cxs, sys - 4 * S); ctx.lineTo(pxs, pys + 8 * S); ctx.stroke();
  // iron bands
  ctx.strokeStyle = '#4a3423';
  ctx.lineWidth = 4 * S;
  for (const bt of [0.3, 0.62]) {
    const bx = lerp(cxs, pxs, bt), by = lerp(sys - 4 * S, pys + 8 * S, bt);
    ctx.beginPath(); ctx.moveTo(bx - 8 * S, by - 3 * S); ctx.lineTo(bx + 8 * S, by + 3 * S); ctx.stroke();
  }
  // pulley wheel at the pivot
  ctx.fillStyle = '#3d2b1a';
  ctx.beginPath(); ctx.arc(pxs, pys, 11 * S, 0, TAU); ctx.fill();
  ctx.fillStyle = '#c9a06a';
  ctx.beginPath(); ctx.arc(pxs, pys, 5.5 * S, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3d2b1a';
  ctx.beginPath(); ctx.arc(pxs, pys, 2 * S, 0, TAU); ctx.fill();
  ctx.restore();
  // rope to creature
  const cp = creaturePos();
  const cxs2 = w2sx(cp.x, G.camX), cys2 = w2sy(cp.y);
  const taut = G.phase === 'charging' || G.phase === 'swinging';
  ctx.strokeStyle = taut ? '#ffe9b8' : '#d9c69c';
  ctx.lineWidth = (taut ? 4 : 3) * S;
  if (taut) { ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 8 * S; }
  ctx.beginPath(); ctx.moveTo(pxs, pys);
  if (G.phase === 'ready' && cp.sitting) {
    // slack rope draped to the sitting creature
    ctx.quadraticCurveTo(pxs + 20 * S, pys + 60 * S, cxs2, cys2 - 14 * S);
  } else {
    ctx.lineTo(cxs2, cys2 - 14 * S);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineCap = 'butt';
}

function drawCreature() {
  if (G.scene !== 'play' && G.scene !== 'over') return;
  if (G.phase === 'done') return;
  const cp = creaturePos();
  const sx = w2sx(cp.x, G.camX), sy = w2sy(cp.y);
  const R = TUNE.creatureR * S;
  ctx.save();
  ctx.translate(sx, sy);

  // squash & stretch
  let sqx = 1, sqy = 1;
  if (G.phase === 'charging') { const p = clamp(G.holdT / chargeTime(), 0, 1); sqx = 1 - p * 0.12; sqy = 1 + p * 0.14; }
  if (G.landAnim > 0) { const p = 1 - G.landAnim / 0.35; sqx = 1 + Math.sin(p * Math.PI) * 0.28; sqy = 1 - Math.sin(p * Math.PI) * 0.24; }
  if (G.phase === 'flying') { sqx = 0.94; sqy = 1.06; }
  ctx.scale(sqx, sqy);
  if (G.phase === 'flying') ctx.rotate(G.fly.rot * 0.4);

  // fire aura
  if (G.fire) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < 3; i++) {
      const fy = Math.sin(G.time * 18 + i * 2) * 4 * S;
      ctx.fillStyle = ['#ff5d5d', '#ff9f43', '#ffd166'][i];
      ctx.beginPath();
      ctx.ellipse((i - 1) * 10 * S, -R - 6 * S + fy, 7 * S, 12 * S, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // shadow on tower when sitting
  if (cp.sitting) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(0, R + 4 * S, R * 0.9, 5 * S, 0, 0, TAU); ctx.fill();
  }

  // body
  const bg2 = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.2, 0, 0, R * 1.25);
  bg2.addColorStop(0, '#fffdf6');
  bg2.addColorStop(1, '#f2ddb8');
  ctx.fillStyle = bg2;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(140,100,60,0.35)';
  ctx.lineWidth = 2 * S;
  ctx.stroke();

  // feet
  ctx.fillStyle = '#e8cfa0';
  ctx.beginPath();
  ctx.ellipse(-R * 0.45, R * 0.85, R * 0.32, R * 0.2, 0, 0, TAU);
  ctx.ellipse(R * 0.45, R * 0.85, R * 0.32, R * 0.2, 0, 0, TAU);
  ctx.fill();

  // blush
  ctx.fillStyle = 'rgba(255,120,150,0.5)';
  ctx.beginPath();
  ctx.arc(-R * 0.62, R * 0.18, R * 0.2, 0, TAU);
  ctx.arc(R * 0.62, R * 0.18, R * 0.2, 0, TAU);
  ctx.fill();

  const mood = G.creatureMood;
  const blink = G.blinkT < 0;
  const lookX = clamp(((G.towers[G.idx + 1] ? (G.towers[G.idx + 1].x - G.pivotX) : 60)) / 200, -1, 1) * R * 0.18;
  if (mood === 'dizzy') {
    // X eyes
    ctx.strokeStyle = '#4a3520'; ctx.lineWidth = 2.6 * S;
    for (const ex of [-R * 0.34, R * 0.34]) {
      ctx.beginPath();
      ctx.moveTo(ex - 5 * S, -R * 0.25 - 5 * S); ctx.lineTo(ex + 5 * S, -R * 0.25 + 5 * S);
      ctx.moveTo(ex + 5 * S, -R * 0.25 - 5 * S); ctx.lineTo(ex - 5 * S, -R * 0.25 + 5 * S);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, R * 0.4, R * 0.16, 0, Math.PI); ctx.stroke();
  } else if (mood === 'scared') {
    // wide eyes + open mouth
    for (const ex of [-R * 0.34, R * 0.34]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex, -R * 0.18, R * 0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3a2a18';
      ctx.beginPath(); ctx.arc(ex + lookX, -R * 0.18, R * 0.14, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#5a3a28';
    ctx.beginPath(); ctx.ellipse(0, R * 0.42, R * 0.14, R * 0.2, 0, 0, TAU); ctx.fill();
  } else {
    // happy eyes
    for (const ex of [-R * 0.34, R * 0.34]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex, -R * 0.18, R * 0.26, 0, TAU); ctx.fill();
      if (blink) {
        ctx.strokeStyle = '#4a3520'; ctx.lineWidth = 2.4 * S;
        ctx.beginPath(); ctx.moveTo(ex - R * 0.2, -R * 0.18); ctx.lineTo(ex + R * 0.2, -R * 0.18); ctx.stroke();
      } else {
        ctx.fillStyle = '#3a2a18';
        ctx.beginPath(); ctx.arc(ex + lookX, -R * 0.16, R * 0.13, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ex + lookX - R * 0.04, -R * 0.21, R * 0.045, 0, TAU); ctx.fill();
      }
    }
    // smile
    ctx.strokeStyle = '#4a3520'; ctx.lineWidth = 2.4 * S; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, R * 0.18, R * 0.3, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
    ctx.lineCap = 'butt';
  }
  ctx.restore();
}

function drawParts() {
  for (let i = 0; i < P_MAX; i++) {
    const p = parts[i]; if (!p.on) continue;
    const a = clamp(p.life / p.max, 0, 1);
    const sx = w2sx(p.x, G.camX), sy = w2sy(p.y);
    ctx.save();
    ctx.globalAlpha = a;
    if (p.glow) { ctx.shadowColor = p.col; ctx.shadowBlur = 10 * S; }
    ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(sx, sy, p.r * S * (0.5 + a * 0.5), 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function drawFireTint() {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  g.addColorStop(0, 'rgba(255,120,40,0)');
  g.addColorStop(1, `rgba(255,110,40,${0.16 + 0.06 * Math.sin(G.time * 9)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/* ---------------- HUD / screens ---------------- */
function updateHUD() {
  document.getElementById('hud-score').textContent = G.score;
  document.getElementById('hud-tower').textContent = 'TOWER ' + (G.towersCleared + 1) + (G.mode === 'daily' ? ' · DAILY' : '');
  document.getElementById('hud-fire').hidden = !G.fire;
  document.getElementById('hud-rainbow-n').textContent = G.rainbows;
}
function showScreen(name) {
  for (const id of ['menu', 'upgrade', 'pause', 'over']) {
    document.getElementById(id).classList.toggle('on', id === name);
  }
  G.scene = name === 'menu' ? 'menu' : name === 'upgrade' ? 'upgrade' : name === 'pause' ? 'pause' : name === 'over' ? 'over' : 'play';
  if (name !== 'play') setCornerButtons(false);
}
function setCornerButtons(on) {
  document.getElementById('btn-pause').hidden = !on;
  document.getElementById('btn-mute').hidden = !on;
  document.getElementById('hud').hidden = !on;
}
function startRun(mode) {
  newRun(mode);
  updateHUD();
  showScreen('play');
  setCornerButtons(true);
  syncHint();
  SkyAudio.unlock();
  if (mode === 'daily') { SkyAudio.daily(); toast('Daily Peaks 🌄'); }
}
function pauseGame() {
  if (G.scene !== 'play') return;
  holding = false;
  SkyAudio.chargeStop();
  if (G.phase === 'charging') G.phase = 'ready';
  showScreen('pause');
}
function resumeGame() { showScreen('play'); setCornerButtons(true); }
function quitToMenu() {
  showScreen('menu');
  refreshMenu();
}
function openUpgrade() {
  if (G.scene !== 'play') return;
  showScreen('upgrade');
  G.phase = 'ready'; G.theta = 0; G.holdT = 0; holding = false;
  SkyAudio.chargeStop();
  const picks = draftUpgrades();
  document.querySelector('#upgrade h2').textContent = 'Tower ' + G.towersCleared + ' — pick a gift';
  const box = document.getElementById('up-cards');
  box.innerHTML = '';
  for (const u of picks) {
    const b = document.createElement('button');
    b.className = 'up-card'; b.type = 'button';
    b.innerHTML = `<span class="up-ico">${u.ico}</span><span><b>${u.name}</b><span>${u.desc}</span></span>`;
    b.addEventListener('click', () => {
      SkyAudio.upgrade();
      applyUpgrade(u.id);
      burst(G.pivotX, -40, 20, '#ffd166', 220, 0.7, 4, 200, true);
      toast(u.ico + ' ' + u.name, 'perfect');
      buzz(20);
      showScreen('play');
      setCornerButtons(true);
    });
    box.appendChild(b);
  }
  SkyAudio.upgrade();
}
function refreshMenu() {
  document.getElementById('menu-best').textContent = G.best;
  document.getElementById('menu-rainbows').textContent = G.rainbowsTotal;
  document.getElementById('haptic-state').textContent = G.haptic ? 'On' : 'Off';
  document.getElementById('btn-haptic').setAttribute('aria-pressed', String(G.haptic));
  document.getElementById('motion-state').textContent = G.calm ? 'On' : 'Off';
  document.getElementById('btn-motion').setAttribute('aria-pressed', String(G.calm));
  const dk = store.get('daily_' + G.dailyKey, null);
  document.querySelector('#btn-daily .btn-sub').textContent =
    dk != null ? 'today: ' + dk + ' pts' : 'same towers, worldwide';
}

/* ---------------- wiring ---------------- */
function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function wire() {
  G.dailyKey = todayKey();
  const $ = id => document.getElementById(id);
  $('btn-endless').addEventListener('click', () => { SkyAudio.click(); startRun('endless'); });
  $('btn-daily').addEventListener('click', () => { SkyAudio.click(); startRun('daily'); });
  $('btn-how').addEventListener('click', () => { SkyAudio.click(); $('howto').hidden = !$('howto').hidden; });
  $('btn-haptic').addEventListener('click', () => {
    G.haptic = !G.haptic; store.set('haptic', G.haptic); refreshMenu(); SkyAudio.click(); buzz(20);
  });
  $('btn-motion').addEventListener('click', () => {
    G.calm = !G.calm; store.set('calm', G.calm); refreshMenu(); SkyAudio.click();
  });
  $('btn-pause').addEventListener('click', () => { SkyAudio.click(); pauseGame(); });
  $('btn-resume').addEventListener('click', () => { SkyAudio.click(); resumeGame(); });
  $('btn-quit').addEventListener('click', () => { SkyAudio.click(); quitToMenu(); });
  $('btn-again').addEventListener('click', () => { SkyAudio.click(); startRun(G.mode); });
  $('btn-tomenu').addEventListener('click', () => { SkyAudio.click(); quitToMenu(); });
  const muteBtn = $('btn-mute');
  const syncMute = () => { muteBtn.textContent = SkyAudio.muted ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', () => { SkyAudio.setMuted(!SkyAudio.muted); syncMute(); SkyAudio.click(); });
  syncMute();
  // first-gesture audio unlock
  const unlock = () => SkyAudio.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  refreshMenu();
}

/* ---------------- boot ---------------- */
wire();
// idle menu backdrop: a quiet scene behind the menu
newRun('endless');
G.scene = 'menu';
requestAnimationFrame(frame);

/* headless test hooks */
window.__skyhook = { landingX, resolveLanding, mulberry32, genTower, G, TUNE, newRun, openUpgrade, startRun, endRun };

})();
