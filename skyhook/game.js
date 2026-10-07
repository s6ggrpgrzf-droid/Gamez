/* Skyhook — one-button rope swing.
   Hold to walk back and stretch the rope, release to swing.
   Land on the next tower. Dead center = PERFECT (+2). Three in a row = ON FIRE.
   (Mechanically faithful to the js13k2026 winner's loop; all code original.)
*/
(function () {
'use strict';

/* ---------------- utils ---------------- */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeInQuad = t => t * t;
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

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
const $ = id => document.getElementById(id);
function buzz(ms) { try { if (G.haptic && navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

/* ---------------- mechanical core (tuned to the reference loop) ---------------- */
const PULL_SPEED = 330;      // world u/s the creature walks back
const MAX_PULL = 800;
const STAND_OFF = 16;        // idle feet sit this far behind the anchor
const LAND_RATIO = 0.55;     // landing distance past anchor = ratio * pull
const DIP_RATIO = 0.4, MAX_DIP = 130;
const SWEEP = 3.75;          // radians swept around the anchor
const R_SHRINK = 0.4;        // swing radius shrinks this much through the sweep
const DROP_T = 0.25;         // seconds apex -> landing
const FOOT = 4;              // edge tolerance
const PERFECT_W = 8;         // px from center = PERFECT
const EDGE_W = 14;           // px from edge = CLOSE (teeter)
const TENSE_W = 10;          // px from edge rule = slow-mo drop
const SLOWMO = 0.3;
const HOT_N = 3;             // consecutive perfects = ON FIRE
const MIN_W = 44;
const RB_CHANCE = 0.4, RB_HOT_CHANCE = 0.8, RB_WINDOW = 20;
const LAND_PAUSE = 0.6;
const HIT_STOP = 0.06;
const TRAIL_N = 24;
const FLIP_DUR = 0.5;      // seconds for one backflip spin
const FLIP_MAX_QUEUE = 4;  // max taps queued per swing
const RIBBON_N = 40;       // painted-arc points kept for the ride check
const RIDE_W = 34;         // landing-x px tolerance to the ribbon = RIDE
const RB_MILESTONE = 100;  // all-time rainbow collection milestone

/* ---------------- canvas ---------------- */
const canvas = $('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1, S = 1;
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  S = clamp(Math.min(W / 400, H / 760), 0.72, 1.12);
}
window.addEventListener('resize', resize);
resize();

// world -> screen. (camX, camY) sits at 30% width / 42% height.
const w2sx = (wx) => W * 0.30 + (wx - G.camX) * S;
const w2sy = (wy) => H * 0.42 + (wy - G.camY) * S;

/* ---------------- particles (pooled) ---------------- */
const P_MAX = 220;
const parts = [];
for (let i = 0; i < P_MAX; i++) parts.push({ on: false });
let pCursor = 0;
function spawnP(x, y, vx, vy, life, r, col, grav, glow) {
  const p = parts[pCursor]; pCursor = (pCursor + 1) % P_MAX;
  p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.life = life; p.maxLife = life; p.r = r; p.col = col; p.grav = grav; p.glow = !!glow;
}
function burst(x, y, n, col, spd, life, r, grav, glow) {
  const lim = G.calm ? Math.ceil(n / 3) : n;
  for (let i = 0; i < lim; i++) {
    const a = Math.random() * TAU, s = spd * (0.3 + Math.random() * 0.7);
    spawnP(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6),
      r * (0.7 + Math.random() * 0.6), col, grav, glow);
  }
}
function updateParts(dt) {
  for (let i = 0; i < P_MAX; i++) {
    const p = parts[i]; if (!p.on) continue;
    p.life -= dt;
    if (p.life <= 0) { p.on = false; continue; }
    p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt;
  }
}

/* ---------------- state ---------------- */
const G = {
  scene: 'menu',       // menu | play | pause | over
  phase: 'ready',      // ready | pulling | swinging | landed | falling | done
  mode: 'endless',
  rng: mulberry32(1),
  camX: 0, camY: 0,
  towers: [],          // {x, w, top, hue, rainbow, butterfly, rise}
  idx: 0,
  px: 0, py: 0, tilt: 0, walkPh: 0,   // creature feet, world
  pull: 0,
  fl: null,            // flight params
  landT: 0,
  fall: null,
  score: 0, combo: 0, best: store.get('best', 0),
  rainbows: 0, rainbowsTotal: store.get('rainbows', 0),
  towersCleared: 0, perfects: 0,
  fire: false,
  shake: 0, freeze: 0, time: 0,
  teeter: 0, teeterDir: 1,
  squash: 0, flash: 0,
  trail: [],
  flips: 0, flipT: -1, flipPending: 0,   // mid-air trick state (visual + bonus only)
  ribbon: [],                            // painted rainbow arc for the RIDE check
  popups: [],
  newBest: false,
  hint: false, hintStage: 0,
  calm: store.get('calm', false),
  haptic: store.get('haptic', true),
  creatureMood: 'happy', moodT: 0, blinkT: 2,
  dailyKey: '',
  palette: 0,
  musicStep: 0, nextNoteT: 0,
};
const hot = () => G.combo >= HOT_N;
const cur = () => G.towers[G.idx];
const anchorX = () => cur().x + cur().w;
const anchorY = () => cur().top;

/* ---------------- palettes (sunset shifts every 10) ---------------- */
const PALETTES = [
  { sky: ['#3b2560', '#6b3f7e', '#c96f4a', '#f2a65a'] },
  { sky: ['#1e2a5a', '#3a4a8a', '#e08a4a', '#ffd166'] },
  { sky: ['#4a1e4a', '#7a2e5a', '#d45a6a', '#ff9e7a'] },
];

/* ---------------- towers ---------------- */
function spawnTower() {
  const r = G.rng;
  const diff = Math.min(G.towersCleared / 40, 1);
  const last = G.towers[G.towers.length - 1];
  const first = G.towers.length === 1;
  const width = first
    ? 96 + r() * 24
    : MIN_W + r() * (120 - MIN_W - diff * 36);
  const thin = 1 - (width - MIN_W) / (120 - MIN_W);
  const farWide = 180 + diff * 230, farThin = 90 + diff * 320;
  const farthest = farWide + (farThin - farWide) * thin;
  const nearest = 70 + diff * 50;
  const gap = Math.min(nearest + r() * (farthest - nearest), 440 - width / 2);
  const tower = {
    x: last.x + last.w + gap,
    w: Math.round(width),
    top: last.top + 20 + r() * 40,
    hue: 150 + r() * 60,
    rainbow: null, butterfly: null,
    rise: 0,
  };
  if (r() < (hot() ? RB_HOT_CHANCE : RB_CHANCE)) {
    const cx = tower.x + tower.w / 2;
    const centerPull = (cx - (last.x + last.w)) / LAND_RATIO;
    const dip = Math.min(DIP_RATIO * centerPull, MAX_DIP);
    tower.rainbow = { x: cx, y: last.top - dip * 0.4, taken: false, ph: r() * TAU, vy: 0, falling: false };
  }
  if (r() < 0.5) {
    tower.butterfly = { x: tower.x + r() * tower.w, y: tower.top - 30 - r() * 60,
      ph: r() * TAU, col: ['#ff8fd1', '#59e3ff', '#ffe14d'][Math.floor(r() * 3)] };
  }
  G.towers.push(tower);
}

function newRun(mode) {
  const seed = mode === 'daily' ? hashStr(G.dailyKey) : (Math.random() * 1e9) | 0;
  G.rng = mulberry32(seed);
  G.mode = mode; G.scene = 'play'; G.phase = 'ready';
  G.towers = [{ x: -10000, w: 10160, top: 0, hue: 165, rainbow: null, butterfly: null, rise: 1 }];
  G.idx = 0; G.towersCleared = 0;
  G.px = anchorX() - STAND_OFF; G.py = 0; G.tilt = 0; G.walkPh = 0;
  G.camX = anchorX(); G.camY = 0;
  G.pull = 0; G.fl = null; G.fall = null;
  G.score = 0; G.combo = 0; G.fire = false;
  G.rainbows = 0; G.perfects = 0;
  G.flips = 0; G.flipT = -1; G.flipPending = 0; G.ribbon = [];
  G.shake = 0; G.freeze = 0; G.teeter = 0; G.squash = 0; G.flash = 0;
  G.trail = []; G.popups = []; G.newBest = false;
  G.palette = 0; G.musicStep = 0; G.nextNoteT = 0;
  for (const p of parts) p.on = false;
  spawnTower();
  G.hint = !store.get('seen', false);
  G.hintStage = 0; syncHint();
  showScene('play'); updateHUD();
  SkyAudio.unlock();
}

function startPull() {
  G.phase = 'pulling'; G.pull = 0; G.walkPh = 0;
  SkyAudio.creakStart();
}

function release() {
  const ax = anchorX(), ay = anchorY();
  const pull = G.pull;
  const landX = ax + LAND_RATIO * pull;
  const target = G.towers[G.idx + 1];
  const edgeDist = Math.min(landX - target.x, target.x + target.w - landX);
  G.fl = {
    ax, ay, pull, landX, targetTop: target.top,
    sweepDur: 0.45 + pull / 2000,
    tense: Math.abs(edgeDist - FOOT) < TENSE_W,
    t: 0, dropping: false, dropT: 0, fromX: 0, fromY: 0,
  };
  G.phase = 'swinging';
  G.flips = 0; G.flipT = -1; G.flipPending = 0;  // fresh trick state per swing
  G.ribbon = [];                                 // ribbon clears on each new swing
  burst(G.px, G.py - 10, 6, '#ffffff', 90, 0.3, 4, 0, false);
  SkyAudio.creakStop();
  SkyAudio.twang(clamp(pull / MAX_PULL, 0, 1));
  SkyAudio.whoosh();
  if (G.hint && G.hintStage === 1) { G.hintStage = 2; syncHint(); }
}

// parametric swing: circular arc around the anchor, radius shrinking,
// then a short drop onto the landing point.
function swingPos(f, t) {
  const ang = Math.PI - SWEEP * easeInOut(t);
  const r = f.pull * (1 - R_SHRINK * t);
  return { x: f.ax + r * Math.cos(ang), y: f.ay + r * Math.sin(ang) };
}

function popup(text, x, y, color) {
  G.popups.push({ text, x, y, color, life: 0.9, maxLife: 0.9 });
}

function resolveLanding() {
  const f = G.fl;
  const target = G.towers[G.idx + 1];
  const x = f.landX;
  G.px = x; G.py = target.top; G.tilt = 0;
  const landed = x > target.x + FOOT && x < target.x + target.w - FOOT;

  for (let i = G.idx; i <= G.idx + 1; i++) {
    const rb = G.towers[i] && G.towers[i].rainbow;
    if (!rb || rb.taken || rb.falling) continue;
    if (landed && Math.abs(x - rb.x) < RB_WINDOW) {
      rb.taken = true; G.rainbows++;
      const prevTotal = G.rainbowsTotal;
      G.rainbowsTotal++;
      store.set('rainbows', G.rainbowsTotal);
      burst(rb.x, rb.y, 18, '#ff8fd1', 200, 0.8, 4, 100, true);
      SkyAudio.rainbow(); buzz(10);
      popup('+🌈', x, G.py - 100, '#ff8fd1');
      // all-time collection milestone every 100
      if (Math.floor(G.rainbowsTotal / RB_MILESTONE) > Math.floor(prevTotal / RB_MILESTONE)) {
        popup('🌈 ' + G.rainbowsTotal + ' ALL-TIME!', x, G.py - 150, '#ff8fd1');
        burst(x, G.py - 80, 36, '#ff8fd1', 320, 1.2, 5, 150, true);
        SkyAudio.milestone(); buzz(30);
      }
    } else if (G.towers[i] === target) {
      rb.falling = true; rb.vy = -350; SkyAudio.boing();
    }
  }

  if (landed) {
    const cx = target.x + target.w / 2;
    const perfect = Math.abs(x - cx) < PERFECT_W;
    const edgeDist = Math.min(x - target.x, target.x + target.w - x);
    const close = edgeDist < EDGE_W;
    const wasHot = hot();
    const oldScore = G.score;
    // rainbow ride: land on your own painted arc — with style.
    // (The swing arc always crosses the landing x, so the paint check alone
    // would fire on every landing; gating on a completed flip makes the ride
    // earned: flip through your paint, then stick it.)
    const styled = G.flips > 0;
    let ride = false;
    if (styled) {
      for (let i = 5; i < G.ribbon.length; i++) {
        if (Math.abs(G.ribbon[i].x - x) < RIDE_W) { ride = true; break; }
      }
    }
    G.combo = perfect ? G.combo + 1 : 0;
    G.fire = hot();
    let base = perfect ? 2 : 1;
    if (ride) base *= 2;
    G.score += base;
    // trick bonus: completed backflips (doubled on a perfect landing)
    const flipsDone = G.flips;
    const flipBonus = flipsDone * (perfect ? 2 : 1);
    if (flipBonus > 0) G.score += flipBonus;
    // tricks never carry into the next swing
    G.flips = 0; G.flipT = -1; G.flipPending = 0;
    if (perfect) G.perfects++;
    G.towersCleared++;
    G.squash = 1;
    G.palette = Math.floor(G.score / 10) % PALETTES.length;
    let py = -90;
    popup(perfect ? '+' + base + ' PERFECT' + (G.combo > 1 ? ' ×' + G.combo : '') : close ? 'CLOSE!' : '+' + base,
      x, G.py + py, perfect ? '#ffe14d' : close ? '#ff9f1c' : '#ffffff');
    if (flipBonus > 0) {
      py -= 26;
      popup('BACKFLIP ×' + flipsDone + ' +' + flipBonus, x, G.py + py, '#59e3ff');
    }
    if (ride) {
      py -= 26;
      popup('🌈 RAINBOW RIDE ×2!', x, G.py + py, '#ff8fd1');
      burst(x, G.py - 40, 30, '#ff8fd1', 300, 1.0, 5, 120, true);
      SkyAudio.ride(); buzz(25);
    }
    burst(x, G.py, 8, '#ffffff', 120, 0.35, 4, 0, false);
    if (perfect) {
      burst(x, G.py - 30, 24, '#ffe14d', 260, 0.9, 5, 150, true);
      G.flash = 0.5; G.shake = 4; G.freeze = HIT_STOP;
      SkyAudio.perfect();
    } else {
      G.shake = 2;
      SkyAudio.land();
    }
    buzz(perfect ? 25 : 12);
    if (close) { G.teeter = 1; G.teeterDir = x > cx ? 1 : -1; SkyAudio.wobble(); }
    if (G.combo === HOT_N) {
      py -= 26;
      popup('ON FIRE!', x, G.py + py, '#ff9f1c');
      SkyAudio.neigh(); SkyAudio.fire();
    } else if (wasHot && !perfect) {
      burst(x, G.py - 60, 10, '#bbbbbb', 60, 0.6, 4, -30, false);
      SkyAudio.fizzle();
    }
    if (G.score > G.best) {
      G.best = G.score; store.set('best', G.best);
      if (!G.newBest) {
        G.newBest = true;
        py -= 26;
        popup('NEW BEST!', x, G.py + py, '#ffe14d');
        burst(x, G.py - 60, 40, '#ffe14d', 300, 1.5, 5, 200, true);
        SkyAudio.newBest();
      }
    } else if (Math.floor(G.score / 10) > Math.floor(oldScore / 10)) {
      G.flash = Math.max(G.flash, 0.3);
      SkyAudio.milestone();
    }
    // merge: new tower extends left to swallow the gap; right edge (anchor) stays fixed
    const rightEdge = target.x + target.w;
    target.x = Math.min(target.x, cur().x);
    target.w = rightEdge - target.x;
    G.landT = 0; G.phase = 'landed';
    updateHUD();
  } else {
    G.combo = 0; G.fire = false;
    G.flips = 0; G.flipT = -1; G.flipPending = 0;  // tricks die with the fall
    G.fall = { x, y: target.top - 10, vx: x < target.x ? -40 : 40, vy: -100 };
    if (x < target.x) {
      G.fall.x = target.x - 10;
      burst(target.x, G.py - 40, 12, '#efe0c2', 160, 0.5, 3, 500, false);
      G.shake = 6; SkyAudio.bonk();
    }
    G.phase = 'falling';
  }
}

/* ---------------- generative music (original patterns, same design idea) ---------------- */
const MUS_BPM = 150, MUS_MELODY = 'aehejhecaehmljh.cfjfljfecehmm.h.', MUS_BASS = 'dkdkdkdkahahahahipipipipkrkrkrkr';
function musTick() {
  if (G.scene !== 'play' && G.scene !== 'over') return;
  const stepDur = 60 / MUS_BPM / 2;
  const now = performance.now() / 1000;
  if (!G.nextNoteT) G.nextNoteT = now + 0.1;
  let guard = 0;
  while (G.nextNoteT < now + 0.35 && guard++ < 16) {
    const i = G.musicStep % 32;
    const keyShift = Math.min(Math.floor(G.score / 10), 7);
    const semi = ch => ch === '.' ? -1 : (ch.charCodeAt(0) - 97) + keyShift;
    const freq = s => 220 * Math.pow(2, s / 12);
    const m = semi(MUS_MELODY[i]), b = semi(MUS_BASS[i]);
    const dl = G.nextNoteT - now;
    if (m >= 0) SkyAudio.note(freq(m), stepDur * 0.9, 'triangle', 0.11, dl);
    if (b >= 0) SkyAudio.note(freq(b - 12), stepDur * 0.9, 'sine', 0.13, dl);
    if (hot() && i % 2 === 0 && m >= 0) SkyAudio.note(freq(m + 12), stepDur * 0.5, 'sine', 0.06, dl);
    if (i % 8 === 4) SkyAudio.noiseHit(0.03, 0.05, 7000);
    G.musicStep++;
    G.nextNoteT += stepDur;
  }
}

/* ---------------- update ---------------- */
function update(dt) {
  if (G.freeze > 0) { G.freeze -= dt; return; }  // hit-stop
  G.time += dt;
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 20);
  if (G.squash > 0) G.squash = Math.max(0, G.squash - dt * 4);
  if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 2.5);
  if (G.teeter > 0) G.teeter = Math.max(0, G.teeter - dt / 1.2);
  if (G.moodT > 0) { G.moodT -= dt; if (G.moodT <= 0) G.creatureMood = 'happy'; }
  G.blinkT -= dt;
  if (G.blinkT < -0.12) G.blinkT = 2 + Math.random() * 3;

  // camera eases to the anchor
  const k = Math.min(1, dt * 5);
  G.camX += (anchorX() - G.camX) * k;
  G.camY += (anchorY() - G.camY) * k;

  // tower entrance rise
  for (const t of G.towers) if (t.rise < 1) t.rise = Math.min(1, t.rise + dt / 0.6);

  // butterflies + falling rainbows
  for (let i = 0; i < G.towers.length; i++) {
    const t = G.towers[i];
    if (t.butterfly) t.butterfly.ph += dt * 6;
    const rb = t.rainbow;
    if (rb && rb.falling && !rb.taken) {
      rb.vy += 1200 * dt; rb.y += rb.vy * dt;
      if (rb.y > t.top + 400) rb.taken = true;
    }
  }

  // popups
  for (let i = G.popups.length - 1; i >= 0; i--) {
    const p = G.popups[i];
    p.life -= dt; p.y -= 40 * dt;
    if (p.life <= 0) G.popups.splice(i, 1);
  }

  if (G.phase === 'pulling') {
    const room = (anchorX() - STAND_OFF) - cur().x; // tower extends left; room to walk
    G.pull = Math.min(G.pull + PULL_SPEED * dt, MAX_PULL, Math.max(0, room));
    G.px = anchorX() - STAND_OFF - G.pull;
    G.walkPh += dt * 14;
    G.tilt = -0.25 - 0.35 * (G.pull / MAX_PULL); // lean back into the rope
    // camera follows the walk back so the creature stays on screen
    G.camX = Math.min(G.camX, G.px + (W * 0.30 - 90) / S);
    if (G.pull > 0.85 * MAX_PULL) G.shake = Math.max(G.shake, 1.5);
    SkyAudio.creakSet(clamp(G.pull / MAX_PULL, 0, 1));
    if (G.hint && G.hintStage === 0) { G.hintStage = 1; syncHint(); }
  }

  if (G.phase === 'swinging') {
    const f = G.fl;
    const rate = f.tense && f.dropping ? SLOWMO : 1;
    const sdt = dt * rate;
    if (!f.dropping) {
      f.t += sdt / f.sweepDur;
      if (f.t >= 1) {
        const p = swingPos(f, 1);
        f.dropping = true; f.dropT = 0; f.fromX = p.x; f.fromY = p.y;
      } else {
        const p = swingPos(f, f.t);
        G.px = p.x; G.py = p.y;
        G.tilt = lerp(G.tilt, 0.9, Math.min(1, dt * 8));
      }
    } else {
      f.dropT += sdt / DROP_T;
      const e = easeInQuad(Math.min(1, f.dropT));
      G.px = lerp(f.fromX, f.landX, e);
      G.py = lerp(f.fromY, f.targetTop, e);
      if (f.dropT >= 1) resolveLanding();
    }
    // rainbow trail
    if (!G.calm) {
      G.trail.push({ x: G.px, y: G.py - 14, life: 0.5 });
      if (G.trail.length > TRAIL_N * (hot() ? 1.5 : 1)) G.trail.shift();
    }
    // mid-air tricks: queued backflips spin the creature (visual + bonus only,
    // never affects the landing)
    if (G.flipT >= 0) {
      G.flipT += dt / FLIP_DUR;
      if (G.flipT >= 1) { G.flipT = -1; G.flips++; }
    } else if (G.flipPending > 0) {
      G.flipPending--; G.flipT = 0;
      burst(G.px, G.py - 20, 10, '#59e3ff', 160, 0.5, 4, 60, true);
      SkyAudio.flip(); buzz(8);
    }
    // paint the rainbow ribbon (sweep only — the drop falls straight down,
    // so it can't paint over the landing and hand out free rides)
    if (!f.dropping) {
      G.ribbon.push({ x: G.px, y: G.py });
      if (G.ribbon.length > RIBBON_N) G.ribbon.shift();
    }
  }
  for (let i = G.trail.length - 1; i >= 0; i--) {
    G.trail[i].life -= dt;
    if (G.trail[i].life <= 0) G.trail.splice(i, 1);
  }

  if (G.phase === 'landed') {
    G.landT += dt;
    if (G.landT >= LAND_PAUSE) {
      G.idx++;
      G.px = anchorX() - STAND_OFF; G.py = anchorY(); G.tilt = 0;
      spawnTower();
      // prune old towers
      while (G.idx > 2) { G.towers.shift(); G.idx--; }
      G.phase = 'ready';
    }
  }

  if (G.phase === 'falling') {
    const f = G.fall;
    f.vy += 1800 * dt; f.x += f.vx * dt; f.y += f.vy * dt;
    G.px = f.x; G.py = f.y; G.tilt += dt * 6;
    if (Math.random() < 0.4) spawnP(f.x, f.y, 0, 0, 0.4, 4, '#ffffff', 0, false);
    if (f.y > G.camY + 500) {
      burst(f.x, G.camY + 320, 24, '#bfe9ff', 260, 0.8, 5, 500, false);
      G.phase = 'done';
      gameOver();
    }
  }

  updateParts(dt);
  musTick();
}

function gameOver() {
  showScene('over');
  $('over-score').textContent = G.score;
  $('over-perfects').textContent = G.perfects;
  $('over-rainbows').textContent = G.rainbows;
  $('over-rainbows-total').textContent = G.rainbowsTotal;
  $('over-towers').textContent = G.towersCleared;
  $('over-newbest').hidden = !G.newBest;
  const flavors = G.score === 0 ? 'The rope slipped!' :
    G.score < 5 ? 'Nice swings!' :
    G.score < 15 ? 'Smooth flying!' :
    G.score < 30 ? 'Skyhook master!' : 'Legend of the skies!';
  $('over-flavor').textContent = flavors;
  SkyAudio.over();
  if (G.newBest) burst(G.camX, G.camY - 100, 40, '#ffe14d', 300, 1.5, 5, 200, true);
  updateHUD();
}

/* ---------------- render ---------------- */
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawSky() {
  const pal = PALETTES[G.palette % PALETTES.length].sky;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal[0]);
  g.addColorStop(0.35, pal[1]);
  g.addColorStop(0.62, pal[2]);
  g.addColorStop(1, pal[3]);
  ctx.fillStyle = g;
  ctx.fillRect(-20, -20, W + 40, H + 40);
  const sx = W * 0.78, sy = H * 0.30;
  const rg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 220 * S);
  rg.addColorStop(0, 'rgba(255,214,130,0.85)');
  rg.addColorStop(0.4, 'rgba(255,170,110,0.35)');
  rg.addColorStop(1, 'rgba(255,170,110,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(sx - 230 * S, sy - 230 * S, 460 * S, 460 * S);
}

function drawClouds() {
  ctx.fillStyle = 'rgba(255,225,205,0.45)';
  const t = G.time * 12;
  for (let i = 0; i < 5; i++) {
    const wx = ((i * 173 + t * (0.3 + i * 0.1)) % 700) - 150;
    const wy = -160 - (i * 67) % 260;
    const sx = w2sx(wx), sy = w2sy(wy);
    const s = S * (0.8 + (i % 3) * 0.3);
    ctx.beginPath();
    ctx.ellipse(sx, sy, 46 * s, 15 * s, 0, 0, TAU);
    ctx.ellipse(sx - 30 * s, sy + 6 * s, 28 * s, 11 * s, 0, 0, TAU);
    ctx.ellipse(sx + 32 * s, sy + 5 * s, 30 * s, 12 * s, 0, 0, TAU);
    ctx.fill();
  }
}

function drawTowers() {
  const lo = G.camX - W * 0.6 / S, hi = G.camX + W * 1.4 / S;
  for (let i = 0; i < G.towers.length; i++) {
    const tw = G.towers[i];
    if (tw.x + tw.w < lo || tw.x > hi) continue;
    const riseY = (1 - easeOutCubic(tw.rise)) * 120;
    const sx = w2sx(tw.x), sw = tw.w * S;
    const sy = w2sy(tw.top) + riseY * S;
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
    gg.addColorStop(0, `hsl(${tw.hue},55%,62%)`);
    gg.addColorStop(1, `hsl(${tw.hue},50%,42%)`);
    ctx.fillStyle = gg;
    roundRect(sx - 5 * S, sy - 14 * S, sw + 10 * S, 26 * S, 12 * S);
    ctx.fill();
    // grass tufts
    ctx.strokeStyle = `hsl(${tw.hue},55%,35%)`;
    ctx.lineWidth = 2.5 * S;
    const tg = mulberry32(hashStr('tuft' + i));
    for (let k = 0; k < 5; k++) {
      const tx = sx + tg() * sw;
      ctx.beginPath(); ctx.moveTo(tx, sy - 12 * S);
      ctx.quadraticCurveTo(tx + 4 * S, sy - 22 * S, tx + 8 * S, sy - 14 * S);
      ctx.stroke();
    }
    // current tower flag
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
    // butterfly
    if (tw.butterfly && !G.calm) {
      const b = tw.butterfly;
      const bx = w2sx(b.x + Math.sin(b.ph) * 14), by = w2sy(b.y + Math.sin(b.ph * 1.7) * 10) + riseY * S;
      const flap = Math.abs(Math.sin(b.ph * 2)) * 0.9 + 0.1;
      ctx.fillStyle = b.col;
      ctx.beginPath(); ctx.ellipse(bx - 5 * S * flap, by, 6 * S, 9 * S, -0.5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(bx + 5 * S * flap, by, 6 * S, 9 * S, 0.5, 0, TAU); ctx.fill();
    }
    // rainbow collectible: little arc
    const rb = tw.rainbow;
    if (rb && !rb.taken) {
      const rx = w2sx(rb.x), ry = w2sy(rb.y) + riseY * S + Math.sin(G.time * 3 + rb.ph) * 4 * S;
      const cols = ['#ff3b5c', '#ff9f1c', '#ffe14d', '#3ddc84', '#3aa0ff', '#a05cff'];
      ctx.lineWidth = 3.5 * S;
      for (let c = 0; c < 6; c++) {
        ctx.strokeStyle = cols[c];
        ctx.beginPath(); ctx.arc(rx, ry + 14 * S, (16 - c * 2.4) * S, Math.PI, TAU);
        ctx.stroke();
      }
    }
  }
}

function drawRopeAndHook() {
  if (G.scene !== 'play' && G.scene !== 'over') return;
  const ax = w2sx(anchorX()), ay = w2sy(anchorY());
  // the skyhook: grappling anchor bolted to the tower's front edge
  ctx.save();
  ctx.fillStyle = '#3d2b1a';
  ctx.beginPath(); ctx.arc(ax, ay - 4 * S, 7 * S, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#c9a06a'; ctx.lineWidth = 3.5 * S;
  ctx.beginPath(); ctx.arc(ax, ay - 4 * S, 7 * S, -0.4, Math.PI * 1.4); ctx.stroke();
  ctx.fillStyle = '#c9a06a';
  ctx.beginPath(); ctx.arc(ax, ay - 4 * S, 2.2 * S, 0, TAU); ctx.fill();
  ctx.restore();
  // rope from anchor to creature's hand
  const hx = w2sx(G.px), hy = w2sy(G.py - 26);
  const taut = G.phase === 'pulling' || G.phase === 'swinging';
  ctx.save();
  ctx.strokeStyle = taut ? '#ffe9b8' : '#d9c69c';
  ctx.lineWidth = (taut ? 4 : 3) * S;
  ctx.lineCap = 'round';
  if (taut) { ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 8 * S; }
  ctx.beginPath(); ctx.moveTo(ax, ay - 4 * S);
  if (G.phase === 'swinging' && G.fl && !G.fl.dropping) {
    // slight curve along the swing
    const mx = (ax + hx) / 2, my = (ay - 4 * S + hy) / 2 + 10 * S;
    ctx.quadraticCurveTo(mx, my, hx, hy);
  } else {
    ctx.lineTo(hx, hy);
  }
  ctx.stroke();
  ctx.restore();
}

function drawTrail() {
  const cols = ['#ff3b5c', '#ff9f1c', '#ffe14d', '#3ddc84', '#3aa0ff', '#a05cff'];
  for (let i = 0; i < G.trail.length; i++) {
    const t = G.trail[i];
    const a = (t.life / 0.5) * 0.75;
    ctx.globalAlpha = a;
    ctx.fillStyle = cols[i % 6];
    const r = (hot() ? 7 : 5) * S * (t.life / 0.5);
    ctx.beginPath(); ctx.arc(w2sx(t.x), w2sy(t.y), r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawRibbon() {
  const n = G.ribbon.length;
  if (n < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = 7 * S;
  if (!G.calm) ctx.shadowBlur = 12 * S;
  for (let i = 1; i < n; i++) {
    const a = G.ribbon[i - 1], b = G.ribbon[i];
    const hue = (i * 9) % 360;
    ctx.strokeStyle = `hsla(${hue},90%,65%,0.8)`;
    if (!G.calm) ctx.shadowColor = `hsl(${hue},90%,65%)`;
    ctx.beginPath();
    ctx.moveTo(w2sx(a.x), w2sy(a.y));
    ctx.lineTo(w2sx(b.x), w2sy(b.y));
    ctx.stroke();
  }
  ctx.restore();
}

function drawCreature() {
  if (G.scene !== 'play' && G.scene !== 'over') return;
  const sx = w2sx(G.px), sy = w2sy(G.py);
  const s = S;
  ctx.save();
  ctx.translate(sx, sy);
  // squash on landing, teeter wobble on edge
  let tilt = G.tilt, scY = 1, scX = 1;
  if (G.squash > 0) { scY = 1 - 0.25 * G.squash; scX = 1 + 0.25 * G.squash; }
  if (G.teeter > 0) tilt += Math.sin(G.time * 18) * 0.22 * G.teeter * G.teeterDir;
  if (G.phase === 'falling') tilt = G.tilt;
  ctx.rotate(tilt);
  // mid-air backflip: a full 360 spin layered over the swing tilt
  if (G.flipT >= 0) ctx.rotate(easeInOut(clamp(G.flipT, 0, 1)) * TAU);
  ctx.scale(scX, scY);
  // walk bob
  const bob = G.phase === 'pulling' ? Math.abs(Math.sin(G.walkPh)) * 4 * s : 0;
  const R = 20 * s;
  // fire glow
  if (hot()) { ctx.shadowColor = '#ff9f1c'; ctx.shadowBlur = 22 * s; }
  // body
  const mood = G.creatureMood;
  ctx.fillStyle = mood === 'sad' ? '#cfc4d6' : '#fff7ee';
  ctx.beginPath(); ctx.arc(0, -R - bob, R, 0, TAU); ctx.fill();
  ctx.shadowBlur = 0;
  // blush
  ctx.fillStyle = 'rgba(255,140,170,0.55)';
  ctx.beginPath(); ctx.arc(-9 * s, -R - 4 * s - bob, 4 * s, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(9 * s, -R - 4 * s - bob, 4 * s, 0, TAU); ctx.fill();
  // eyes
  const blink = G.blinkT < 0;
  ctx.fillStyle = '#3a2b3a';
  if (blink) {
    ctx.fillRect(-11 * s, -R - 8 * s - bob, 7 * s, 2.5 * s);
    ctx.fillRect(4 * s, -R - 8 * s - bob, 7 * s, 2.5 * s);
  } else if (mood === 'sad') {
    ctx.beginPath(); ctx.arc(-8 * s, -R - 6 * s - bob, 2.6 * s, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(8 * s, -R - 6 * s - bob, 2.6 * s, 0, TAU); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(-8 * s, -R - 7 * s - bob, 3 * s, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(8 * s, -R - 7 * s - bob, 3 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-7 * s, -R - 8 * s - bob, 1.2 * s, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(9 * s, -R - 8 * s - bob, 1.2 * s, 0, TAU); ctx.fill();
  }
  // mouth
  ctx.strokeStyle = '#3a2b3a'; ctx.lineWidth = 2 * s; ctx.lineCap = 'round';
  ctx.beginPath();
  if (mood === 'sad') ctx.arc(0, -R + 2 * s - bob, 5 * s, Math.PI * 1.15, Math.PI * 1.85);
  else ctx.arc(0, -R - 12 * s - bob, 5 * s, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  // little hook-hat (keeps the skyhook identity)
  ctx.fillStyle = '#c9a06a';
  ctx.beginPath(); ctx.arc(0, -R * 2 - 6 * s - bob, 7 * s, Math.PI, TAU); ctx.fill();
  ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 3 * s;
  ctx.beginPath(); ctx.arc(0, -R * 2 - 6 * s - bob, 7 * s, -0.5, Math.PI * 1.35); ctx.stroke();
  // feet nubs
  ctx.fillStyle = mood === 'sad' ? '#cfc4d6' : '#fff7ee';
  const step = G.phase === 'pulling' ? Math.sin(G.walkPh) * 5 * s : 0;
  ctx.beginPath(); ctx.arc(-10 * s, -2 * s - Math.max(0, step), 6 * s, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(10 * s, -2 * s - Math.max(0, -step), 6 * s, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawParts() {
  for (let i = 0; i < P_MAX; i++) {
    const p = parts[i]; if (!p.on) continue;
    const a = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = a;
    if (p.glow) { ctx.shadowColor = p.col; ctx.shadowBlur = 10 * S; }
    ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(w2sx(p.x), w2sy(p.y), p.r * S * (0.5 + a * 0.5), 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

function drawPopups() {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `800 ${Math.round(20 * S)}px system-ui, sans-serif`;
  for (const p of G.popups) {
    const a = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, w2sx(p.x), w2sy(p.y));
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function render() {
  ctx.save();
  if (G.shake > 0.2) ctx.translate((Math.random() - 0.5) * G.shake * S, (Math.random() - 0.5) * G.shake * S);
  drawSky();
  drawClouds();
  drawTowers();
  drawTrail();
  drawRibbon();
  drawRopeAndHook();
  drawCreature();
  drawParts();
  drawPopups();
  if (G.fire) {
    ctx.fillStyle = 'rgba(255,140,40,0.06)';
    ctx.fillRect(-20, -20, W + 40, H + 40);
  }
  if (G.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${G.flash * 0.55})`;
    ctx.fillRect(-20, -20, W + 40, H + 40);
  }
  ctx.restore();
}

/* ---------------- HUD / scenes ---------------- */
function updateHUD() {
  $('hud-score').textContent = G.score;
  $('hud-tower').textContent = 'TOWER ' + (G.towersCleared + 1);
  $('hud-rainbow-n').textContent = G.rainbows;
  $('hud-fire').hidden = !G.fire;
  $('menu-best').textContent = G.best;
  const mr = $('menu-rainbows');
  if (mr.textContent !== String(G.rainbowsTotal)) {
    mr.textContent = G.rainbowsTotal;
    // little pop when the all-time count ticks up mid-session
    const wrap = mr.closest('span');
    if (wrap) { wrap.classList.remove('pop'); void wrap.offsetWidth; wrap.classList.add('pop'); }
  }
}
function showScene(name) {
  G.scene = name;
  for (const id of ['menu', 'pause', 'over']) {
    $(id).classList.toggle('on', id === name);
  }
  $('hud').hidden = name !== 'play';
  $('corner-btns').style.display = name === 'play' ? '' : 'none';
  updateHUD();
}
function syncHint() {
  const el = $('hold-hint');
  if (!G.hint || G.hintStage >= 2 || G.scene !== 'play') { el.hidden = true; return; }
  el.hidden = false;
  el.querySelector('span').textContent = G.hintStage === 0 ? 'HOLD' : 'RELEASE!';
}
function toast() {} // popups replaced toasts

function pauseGame() {
  if (G.scene !== 'play') return;
  showScene('pause');
  SkyAudio.creakStop();
}
function resumeGame() { if (G.scene === 'pause') showScene('play'); }
function quitToMenu() { SkyAudio.creakStop(); showScene('menu'); updateHUD(); }

/* ---------------- input: hold to pull, release to swing ---------------- */
let holding = false;
function press(e) {
  if (e && e.repeat) return;
  SkyAudio.unlock();
  if (G.scene === 'menu') return;
  if (G.scene === 'over') { startRun(G.mode); return; }
  if (G.scene !== 'play') return;
  if (holding) return;
  holding = true;
  if (G.phase === 'swinging') {
    // mid-air trick: a tap queues a backflip. Visual + bonus only —
    // it never touches the landing.
    if (G.flipPending < FLIP_MAX_QUEUE) G.flipPending++;
    return;
  }
  if (G.phase === 'ready') startPull();
  else if (G.phase === 'done') startRun(G.mode);
}
function releaseInput() {
  if (!holding) return;
  holding = false;
  if (G.scene === 'play' && G.phase === 'pulling') {
    if (G.pull < 12) { // accidental tap: cancel the pull
      G.phase = 'ready';
      G.px = anchorX() - STAND_OFF;
      SkyAudio.creakStop();
    } else {
      release();
    }
  }
}
function startRun(mode) {
  if (mode === 'daily') {
    const d = new Date();
    G.dailyKey = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  store.set('seen', true);
  newRun(mode);
}

/* ---------------- main loop ---------------- */
let lastT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = Math.min((now - lastT) / 1000 || 0, 0.05);
  lastT = now;
  if (G.scene === 'play') update(rawDt);
  else { G.time += rawDt; musTick(); }
  render();
}

/* ---------------- wire up ---------------- */
function init() {
  const d = new Date();
  G.dailyKey = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  document.querySelector('#btn-daily .btn-sub').textContent = 'same towers, worldwide';
  $('btn-endless').addEventListener('click', () => { SkyAudio.click(); startRun('endless'); });
  $('btn-daily').addEventListener('click', () => { SkyAudio.click(); startRun('daily'); });
  $('btn-how').addEventListener('click', () => { SkyAudio.click(); $('howto').hidden = !$('howto').hidden; });
  $('btn-haptic').addEventListener('click', () => {
    G.haptic = !G.haptic; store.set('haptic', G.haptic);
    $('haptic-state').textContent = G.haptic ? 'On' : 'Off';
    $('btn-haptic').setAttribute('aria-pressed', String(G.haptic));
    SkyAudio.click();
  });
  $('btn-motion').addEventListener('click', () => {
    G.calm = !G.calm; store.set('calm', G.calm);
    $('motion-state').textContent = G.calm ? 'On' : 'Off';
    $('btn-motion').setAttribute('aria-pressed', String(G.calm));
    SkyAudio.click();
  });
  $('btn-pause').addEventListener('click', () => { SkyAudio.click(); pauseGame(); });
  $('btn-resume').addEventListener('click', () => { SkyAudio.click(); resumeGame(); });
  $('btn-quit').addEventListener('click', () => { SkyAudio.click(); quitToMenu(); });
  $('btn-again').addEventListener('click', () => { SkyAudio.click(); startRun(G.mode); });
  $('btn-tomenu').addEventListener('click', () => { SkyAudio.click(); quitToMenu(); });
  const muteBtn = $('btn-mute');
  const syncMute = () => { muteBtn.textContent = SkyAudio.muted ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click', () => {
    SkyAudio.setMuted(!SkyAudio.muted); syncMute(); SkyAudio.click();
  });
  syncMute();
  $('haptic-state').textContent = G.haptic ? 'On' : 'Off';
  $('motion-state').textContent = G.calm ? 'On' : 'Off';

  // pointer + keyboard + touch: one button
  window.addEventListener('pointerdown', e => {
    if (e.target.closest('button') || e.target.closest('#menu') || e.target.closest('#over') || e.target.closest('#pause')) return;
    press(e);
  });
  window.addEventListener('pointerup', releaseInput);
  window.addEventListener('pointercancel', releaseInput);
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); press(e); }
    if (e.key === 'm' || e.key === 'M') { SkyAudio.setMuted(!SkyAudio.muted); syncMute(); }
    if (e.key === 'Escape' && G.scene === 'play') pauseGame();
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space') releaseInput(); });
  window.addEventListener('blur', () => { if (G.scene === 'play') pauseGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.scene === 'play') pauseGame(); });

  showScene('menu');
  updateHUD();
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

// headless test hook (pure mechanics)
window.__skyhook = {
  G, newRun, spawnTower, startPull, press, release, swingPos, resolveLanding,
  TUNE: { PULL_SPEED, MAX_PULL, LAND_RATIO, FOOT, PERFECT_W },
};

})();
