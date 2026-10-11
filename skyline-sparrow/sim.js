/* Skyline Sparrow — sim.js
   Pure deterministic simulation. No DOM, no clock, no Math.random.
   All randomness flows through the seeded PRNG. UMD: works in node and browser. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* ---------- seeded PRNG ---------- */
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(str) {
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ---------- physics constants (tuned together; gen.js derives limits from these) ---------- */
var PHYS = {
  g: 2400,          // gravity px/s^2
  jumpV: 880,       // jump takeoff velocity px/s
  wallJumpV: 836,   // wall jump velocity (0.95x)
  bounceV: 810,     // ghost-head bounce velocity
  maxFall: 1500,
  slideFall: 150,   // capped fall speed while wall sliding
  coyote: 0.10,     // seconds
  buffer: 0.12,     // seconds
  jumpCut: 0.45,    // velocity multiplier on early release
  speed0: 220,      // px/s at t=0
  speed1: 420,      // px/s at t=240s
  rampT: 240,
  pw: 26, ph: 20    // player w/h
};
function maxGap(vx) { return vx * 2 * PHYS.jumpV / PHYS.g; }
function maxStepUp() { return PHYS.jumpV * PHYS.jumpV / (2 * PHYS.g); }

/* ---------- chunk generator (injected; see gen.js) ---------- */
var Gen = null;
function setGen(g) { Gen = g; }

/* ---------- run state ---------- */
function newRun(seed, opts) {
  if (!Gen) throw new Error('SS: no generator (call SS.setGen)');
  opts = opts || {};
  var rng = mulberry32(typeof seed === 'number' ? seed : hashSeed(String(seed)));
  var st = {
    seed: seed, rng: rng, tick: 0, time: 0,
    speed: PHYS.speed0,
    player: freshPlayer(60, 0),
    chunks: [], nextX: 0,
    camX: 0, viewW: 480, viewH: 800,
    score: 0, feathers: 0, combo: 0, comboT: 0, bestCombo: 0,
    nearScore: 0, dist: 0, distM: 0,
    tape: [],           // this run's input tape [{t, k:'p'|'r'}]
    ghost: null,        // {tape, ti, p, done}
    district: 0,
    wind: 0,
    events: [],         // drained by ui each frame; fired only after commit
    over: false, overCause: '', overTick: 0,
    milestones: {},
    // scratch (never allocated per frame)
    _plat: null
  };
  // first chunk is always a safe flat runway
  var c0 = Gen.runway(rng);
  c0.x0 = 0;
  bakeChunk(c0);
  st.chunks.push(c0);
  st.nextX = c0.w;
  st.player.y = c0.entry.y - PHYS.ph;
  st.player.py = st.player.y;
  ensureChunks(st);
  return st;
}
function freshPlayer(x, y) {
  return { x: x, y: y, px: x, py: y, vx: 0, vy: 0, w: PHYS.pw, h: PHYS.ph,
    ground: true, coyote: 0, buf: 0, slide: 0, dead: false, landV: 0, wallSide: 0 };
}
function ev(st, e) { st.events.push(e); }
/* ui iterates st.events directly then calls clearEvents — no per-frame alloc */
function clearEvents(st) { st.events.length = 0; }

/* ---------- input ---------- */
function pressJump(st) {
  if (st.over || st.player.dead) return;
  var p = st.player;
  p.buf = PHYS.buffer;
  st.tape.push({ t: st.tick, k: 'p' });
  ev(st, { t: 'press' }); // optimistic-feedback hook; sim confirms on next tick
}
function releaseJump(st) {
  if (st.over || st.player.dead) return;
  var p = st.player;
  if (p.vy < 0 && !p.ground) p.vy *= PHYS.jumpCut;
  st.tape.push({ t: st.tick, k: 'r' });
}

/* ---------- ghost (Yesterday's You) ---------- */
function attachGhost(st, tape) {
  if (!tape || !tape.length) return;
  var g = freshPlayer(60, 0);
  g.y = st.chunks[0].entry.y - PHYS.ph;
  st.ghost = { tape: tape, ti: 0, p: g, done: false };
}
function stepGhost(st, dt) {
  var gh = st.ghost;
  if (!gh || gh.done) return;
  var gp = gh.p;
  while (gh.ti < gh.tape.length && gh.tape[gh.ti].t < st.tick) {
    var k = gh.tape[gh.ti].k;
    if (k === 'p') { if (gp.ground || gp.coyote > 0) { gp.vy = -PHYS.jumpV; gp.ground = false; gp.coyote = 0; } }
    else if (k === 'r') { if (gp.vy < 0 && !gp.ground) gp.vy *= PHYS.jumpCut; }
    gh.ti++;
  }
  // ghost replays same physics, same chunks, same speed curve
  moveBody(st, gp, dt, true);
  if (gh.ti >= gh.tape.length && st.tick > gh.tape[gh.tape.length - 1].t + 120) gh.done = true;
}

/* ---------- core movement (shared by player + ghost) ---------- */
function moveBody(st, p, dt, isGhost) {
  var vx = st.speed + st.wind;
  p.px = p.x; p.py = p.y;
  p.vy = Math.min(p.vy + PHYS.g * dt, PHYS.maxFall);
  p.slide = 0;
  // wall slide (neon district): moving into a wall while airborne
  if (!p.ground && !isGhost) {
    var w = findWall(st, p);
    if (w) {
      p.slide = 1; p.wallSide = w.side;
      if (p.vy > PHYS.slideFall) p.vy = PHYS.slideFall;
    }
  }
  p.x += vx * dt;
  p.y += p.vy * dt;

  p.ground = false;
  // platform landing (top surfaces only); plats carry baked world coords (wx)
  var plats = platsNear(st, p.x);
  for (var i = 0; i < plats.length; i++) {
    var pl = plats[i];
    var top = pl.y, px0 = pl.wx;
    if (p.vy >= 0 && p.px + p.w > px0 && p.x < px0 + pl.w) {
      var prevB = p.py + p.h, newB = p.y + p.h;
      if (prevB <= top + 2 && newB >= top) {
        p.y = top - p.h; p.landV = p.vy; p.vy = 0; p.ground = true; p.coyote = PHYS.coyote;
        if (!isGhost && p.landV > 500) ev(st, { t: 'land', hard: p.landV > 1000, x: p.x, y: p.y });
        else if (!isGhost && p.landV > 60) ev(st, { t: 'land', hard: false, x: p.x, y: p.y });
        p.landV = 0;
      }
    }
  }
  if (!p.ground) p.coyote = Math.max(0, p.coyote - dt);
  return plats;
}

function platsNear(st, x) {
  // returns chunk platform objects directly (world x baked as .wx at stitch time);
  // scratch array reused, no allocation
  var out = PLAT_SCRATCH; out.length = 0;
  var cs = st.chunks;
  for (var i = 0; i < cs.length; i++) {
    var c = cs[i];
    if (c.x0 + c.w < x - 80 || c.x0 > x + 260) continue;
    for (var j = 0; j < c.plats.length; j++) out.push(c.plats[j]);
  }
  return out;
}
var PLAT_SCRATCH = [];
function findWall(st, p) {
  var cs = st.chunks;
  for (var i = 0; i < cs.length; i++) {
    var c = cs[i];
    if (!c.walls || c.x0 + c.w < p.x - 40 || c.x0 > p.x + 60) continue;
    for (var j = 0; j < c.walls.length; j++) {
      var w = c.walls[j], wx = w.wx;
      if (p.x + p.w > wx - 4 && p.x + p.w < wx + 14 && p.y + p.h > w.y && p.y < w.y + w.h) {
        return { side: w.side };
      }
    }
  }
  return null;
}

/* ---------- fixed step ---------- */
function step(st, dt) {
  if (st.over) return;
  st.tick++; st.time += dt;
  var d = Math.min(1, st.time / PHYS.rampT);
  st.speed = PHYS.speed0 + (PHYS.speed1 - PHYS.speed0) * d;
  var p = st.player;

  // consume buffered jump
  if (p.buf > 0) {
    p.buf -= dt;
    if (p.buf > 0 && !p.dead) {
      if (p.slide) {
        p.vy = -PHYS.wallJumpV; p.slide = 0; p.buf = 0;
        ev(st, { t: 'walljump', x: p.x, y: p.y });
      } else if (p.ground || p.coyote > 0) {
        p.vy = -PHYS.jumpV; p.ground = false; p.coyote = 0; p.buf = 0;
        ev(st, { t: 'jump', x: p.x, y: p.y });
      }
    }
  }

  moveBody(st, p, dt, false);
  stepGhost(st, dt);

  // ghost head bounce: falling onto the ghost's head grants a bounce
  var gh = st.ghost;
  if (gh && !gh.done && !p.dead) {
    var gp = gh.p;
    if (p.vy > 60 &&
        p.x + p.w > gp.x + 2 && p.x < gp.x + gp.w - 2 &&
        p.y + p.h >= gp.y - 4 && p.y + p.h <= gp.y + 14) {
      p.y = gp.y - p.h; p.vy = -PHYS.bounceV; p.ground = false;
      ev(st, { t: 'bounce', x: p.x, y: p.y });
    }
  }

  // hazards: chimneys (world coords baked as .wx)
  if (!p.dead) {
    var hz = hazardsNear(st, p.x);
    for (var i = 0; i < hz.length; i++) {
      var h = hz[i];
      if (p.x + p.w - 4 > h.wx && p.x + 4 < h.wx + h.w && p.y + p.h - 2 > h.y && p.y + 2 < h.y + h.h) {
        die(st, 'chimney'); return;
      }
      // near-miss: close but not touching, once per chimney
      if (!h.counted && p.x + p.w + 26 > h.wx && p.x - 26 < h.wx + h.w &&
          p.y + p.h + 26 > h.y && p.y - 26 < h.y + h.h) {
        h.counted = true;
        st.combo++; st.comboT = 1.6;
        if (st.combo > st.bestCombo) st.bestCombo = st.combo;
        var gain = 10 * st.combo;
        st.nearScore += gain;
        ev(st, { t: 'near', x: p.x, y: p.y, combo: st.combo, gain: gain });
      }
    }
  }

  // feathers (world coords baked as .wx)
  if (!p.dead) {
    var fs = feathersNear(st, p.x);
    for (var k = 0; k < fs.length; k++) {
      var f = fs[k];
      if (!f.taken && p.x + p.w > f.wx - 6 && p.x < f.wx + 22 && p.y + p.h > f.y - 6 && p.y < f.y + 22) {
        f.taken = true; st.feathers++;
        ev(st, { t: 'feather', x: f.wx, y: f.y, n: st.feathers });
      }
    }
  }

  // fell into the street
  var killY = st.killY || 1400;
  if (p.y > killY) { die(st, 'fall'); return; }

  // combo decay
  if (st.comboT > 0) { st.comboT -= dt; if (st.comboT <= 0) st.combo = 0; }

  st.dist = Math.max(st.dist, p.x - 60);
  st.distM = Math.floor(st.dist / 50);
  st.score = st.distM + st.feathers * 25 + st.nearScore;
  st.camX = p.x - st.viewW * 0.35;

  // district by distance
  var nd = Math.floor(st.distM / 900) % 3;
  if (nd !== st.district) { st.district = nd; ev(st, { t: 'district', d: nd }); }

  // milestones for AI tales
  var ms = [500, 1500, 3000, 5000, 8000];
  for (var m = 0; m < ms.length; m++) {
    if (st.distM >= ms[m] && !st.milestones[ms[m]]) {
      st.milestones[ms[m]] = true;
      ev(st, { t: 'milestone', m: ms[m] });
    }
  }

  ensureChunks(st);
  // recycle behind
  while (st.chunks.length > 2 && st.chunks[0].x0 + st.chunks[0].w < st.camX - 500) st.chunks.shift();
}

function hazardsNear(st, x) {
  var out = HAZ_SCRATCH; out.length = 0;
  var cs = st.chunks;
  for (var i = 0; i < cs.length; i++) {
    var c = cs[i];
    if (!c.chims || c.x0 + c.w < x - 60 || c.x0 > x + 120) continue;
    for (var j = 0; j < c.chims.length; j++) out.push(c.chims[j]);
  }
  return out;
}
var HAZ_SCRATCH = [];
function feathersNear(st, x) {
  var out = FTH_SCRATCH; out.length = 0;
  var cs = st.chunks;
  for (var i = 0; i < cs.length; i++) {
    var c = cs[i];
    if (!c.feats || c.x0 + c.w < x - 60 || c.x0 > x + 120) continue;
    for (var j = 0; j < c.feats.length; j++) { if (!c.feats[j].taken) out.push(c.feats[j]); }
  }
  return out;
}
var FTH_SCRATCH = [];

function die(st, cause) {
  if (st.over) return;
  st.player.dead = true;
  st.over = true; st.overCause = cause; st.overTick = st.tick;
  ev(st, { t: 'die', cause: cause, x: st.player.x, y: st.player.y, score: st.score });
}

/* bake world x-coords onto chunk contents at stitch time so the hot loop
   never allocates wrapper objects */
function bakeChunk(c) {
  var i;
  for (i = 0; i < c.plats.length; i++) c.plats[i].wx = c.x0 + c.plats[i].x;
  if (c.chims) for (i = 0; i < c.chims.length; i++) c.chims[i].wx = c.x0 + c.chims[i].x;
  if (c.feats) for (i = 0; i < c.feats.length; i++) c.feats[i].wx = c.x0 + c.feats[i].x;
  if (c.walls) for (i = 0; i < c.walls.length; i++) c.walls[i].wx = c.x0 + c.walls[i].x;
}

function ensureChunks(st) {
  var guard = 0;
  while (st.nextX < st.camX + st.viewW + 1600 && guard++ < 12) {
    var d = Math.min(1, st.time / PHYS.rampT);
    var prev = st.chunks[st.chunks.length - 1];
    var c = Gen.genChunk(st.rng, prevExitOf(prev), d, st.speed, st.distM);
    c.x0 = st.nextX;
    bakeChunk(c);
    st.chunks.push(c);
    st.nextX += c.w;
  }
  // kill line follows the lowest track
  var low = 0;
  for (var i = 0; i < st.chunks.length; i++) {
    var cc = st.chunks[i];
    if (cc.exit.y > low) low = cc.exit.y;
  }
  st.killY = low + 420;
}
function prevExitOf(c) { return { y: c.exit.y, x1: c.x0 + c.w }; }

/* ---------- test helpers ---------- */
function stateHash(st) {
  // deterministic fingerprint for determinism tests
  var p = st.player;
  return [st.tick, Math.round(p.x * 100), Math.round(p.y * 100), Math.round(p.vy * 100),
    st.score, st.feathers, st.combo, st.chunks.length].join('|');
}

return {
  PHYS: PHYS, maxGap: maxGap, maxStepUp: maxStepUp,
  mulberry32: mulberry32, hashSeed: hashSeed,
  setGen: setGen, newRun: newRun, step: step,
  pressJump: pressJump, releaseJump: releaseJump,
  attachGhost: attachGhost, clearEvents: clearEvents,
  stateHash: stateHash
};
});
