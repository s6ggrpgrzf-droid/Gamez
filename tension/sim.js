'use strict';
/* TENSION — pure pin-tumbler sim. No DOM, no canvas: testable headless.
 *
 * The model, honestly abstracted:
 * - Each stack (key pin + driver + spring) must be lifted by `need` for
 *   the split between its pins to reach the shear line.
 * - Tension strains the plug. The plug turns until a driver binds; only
 *   the binding stack can be set — which one binds is decided by each
 *   stack's microscopic `bind` angle, so the binding ORDER EMERGES from
 *   the tolerances the seed grew. It is never dealt or scripted.
 * - Lift the binder past the shear point and it sets; the plug gives to
 *   the next bind angle. Lift it too far and the key pin oversets: the
 *   plug jams until you ease the tension off and let it fall.
 * - Set stacks are held only by tension. Starve it and they drop.
 * - Strain the pick — against a pinched binder, hard against the top,
 *   or while a stack stands overset — and it flexes; keep straining and
 *   it snaps. The flex is the warning.
 * Inputs are logical: { pin, push 0..1, tension 0..1 }.
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEFAULTS = {
  pins: 5,
  needMin: 1.4, needMax: 4.0,     // shear-point heights, arbitrary units
  bindMin: 0.6, bindMax: 4.2,     // degrees of plug turn at which a stack binds
  oversetMargin: 0.95,            // lift past the shear point that oversets (a human needs ~0.28s after the click)
  setCatchMs: 300,                // after the click, the driver sits hard on the ledge for this long
  setCatchDrag: 0.15,             // and the climb toward overset crawls at this fraction meanwhile
  topOut: 1.25,                   // lift past need where the stack hits the top
  liftRate: 4.6,                  // units/sec at full push (binder: slower, it resists)
  binderDrag: 0.7,                // the binder lifts at this fraction — it feels stiff
  springRate: 9.0,                // exponential fall rate of an unheld stack
  tensionRate: 7.0,               // how fast actual tension chases the input
  holdTension: 0.18,              // below this, set stacks are living on borrowed time
  dropGrace: 0.5,                 // seconds of starved tension before sets start dropping
  dropInterval: 0.13,             // seconds between drops once they start
  easeOff: 0.35,                  // tension below this lets an overset stack fall
  stressGain: 0.55,               // stress/sec while straining hard
  stressDecay: 0.5,               // stress/sec recovery
  snapLockTime: 0.9,              // seconds while a fresh pick slides in
  pickStrength: 1,                // stress at which the pick snaps (zen and the teaching lock deal unbreakable picks)
  maxGive: 6.0,                   // degrees the plug can give under full tension
  spoolCatch: 0.34,               // lift below the shear point where a spool's waist catches
  spoolEase: 0.5,                 // at or below this tension a caught spool can be worked through
  shroomCatch: 0.2,               // mushrooms catch closer to the line — and slip if forced
  shroomEase: 0.46,
  counterRot: 1.15,               // degrees the plug rolls BACK in a false set (the tell)
  ridgeFracs: [0.34, 0.58, 0.8],  // serration ridges, as fractions of the shear height
};

function createLock(seed, cfg) {
  const C = Object.assign({}, DEFAULTS, cfg || {});
  const rand = mulberry32(seed);
  const stacks = [];
  for (let i = 0; i < C.pins; i++) {
    let need = C.needMin + rand() * (C.needMax - C.needMin);
    // keep shear points feelably distinct
    for (let k = 0; k < 8 && stacks.some(s => Math.abs(s.need - need) < 0.28); k++)
      need = C.needMin + rand() * (C.needMax - C.needMin);
    stacks.push({
      need,
      bind: C.bindMin + rand() * (C.bindMax - C.bindMin),
      lift: 0, state: 'down', // down | set | over | false (a security pin, caught)
      kind: 'plain',          // plain | spool | shroom | serrated — the DRIVER's shape
      setAt: -1, ridgeHit: 0, // serration ridges already clicked (bitmask)
    });
  }
  // security drivers, dealt to stacks the seed chooses
  if (cfg && cfg.kinds) {
    const idx = stacks.map((s, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0; const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    let at = 0;
    for (const kind of ['spool', 'shroom', 'serrated'])
      for (let k = 0; k < (cfg.kinds[kind] || 0) && at < idx.length; k++) stacks[idx[at++]].kind = kind;
  }
  return {
    cfg: C, seed,
    stacks,
    plug: 0,              // current plug angle, degrees
    tension: 0,           // actual tension 0..1 (chases the input)
    stress: 0,            // pick stress 0..1
    status: 'locked',     // locked | open
    timeMs: 0, breaks: 0, oversets: 0, sets: 0,
    starveTime: 0, dropClock: 0, snapLock: 0, giveAcc: 0,
    events: [],
  };
}

/* The stack currently binding: the unset, un-overset stack with the
   smallest bind angle. A stack caught in a false set IS the binder —
   nothing else can move until it is dealt with. -1 when jammed. */
function binderIndex(lock) {
  if (lock.stacks.some(s => s.state === 'over')) return -1;
  for (let i = 0; i < lock.stacks.length; i++)
    if (lock.stacks[i].state === 'false') return i;
  let best = -1;
  for (let i = 0; i < lock.stacks.length; i++) {
    const s = lock.stacks[i];
    if (s.state === 'set') continue;
    if (best < 0 || s.bind < lock.stacks[best].bind) best = i;
  }
  return best;
}
function falseIndex(lock) {
  for (let i = 0; i < lock.stacks.length; i++)
    if (lock.stacks[i].state === 'false') return i;
  return -1;
}

function emit(lock, type, pin) { lock.events.push({ type, pin: pin === undefined ? -1 : pin }); }

function step(lock, input, dt) {
  const C = lock.cfg;
  if (lock.status === 'open') return;
  dt = Math.min(dt, 0.05);
  lock.timeMs += dt * 1000;
  const pin = input.pin | 0;
  const push = Math.max(0, Math.min(1, input.push || 0));
  const tensionIn = Math.max(0, Math.min(1, input.tension || 0));

  // a snapped pick freezes the wrench hand; a fresh pick takes snapLockTime
  if (lock.snapLock > 0) {
    lock.snapLock -= dt;
    if (lock.snapLock <= 0) emit(lock, 'pickin');
  } else {
    lock.tension += (tensionIn - lock.tension) * Math.min(1, C.tensionRate * dt);
  }
  const T = lock.tension;

  // plug: turns under tension until the binder stops it; a set stack's
  // angle is passed freely; an overset stack jams it where it stands.
  // A false set rolls the plug BACK — counter-rotation is the spool's tell.
  const jammed = lock.stacks.some(s => s.state === 'over');
  const falsed = falseIndex(lock);
  let plugTarget;
  if (jammed) plugTarget = lock.plug;
  else if (falsed >= 0) plugTarget = Math.max(0, Math.min(T * C.maxGive, lock.stacks[falsed].bind - C.counterRot));
  else {
    const b = binderIndex(lock);
    plugTarget = b < 0 ? C.maxGive : Math.min(T * C.maxGive, lock.stacks[b].bind);
    if (b < 0) plugTarget = T * C.maxGive; // nothing left to bind: free to the stop
  }
  const prevPlug = lock.plug;
  lock.plug += (plugTarget - lock.plug) * Math.min(1, 14 * dt);
  if (!jammed && lock.plug > prevPlug) {
    lock.giveAcc += lock.plug - prevPlug;
    if (lock.giveAcc >= 0.25) { lock.giveAcc = 0; emit(lock, 'give'); }
  }

  const binder = binderIndex(lock);

  // lifting
  for (let i = 0; i < lock.stacks.length; i++) {
    const s = lock.stacks[i];
    if (s.state === 'over') continue;
    const inContact = lock.snapLock <= 0 && pin === i && push > 0.02;
    if (s.state === 'false') {
      // a caught security pin props the plug in its working window —
      // the pin holds the counter-rotation itself, so the wrench hand
      // does not have to hold the window open (one finger cannot ease
      // and push at the same time). Keep tension on and push, and it
      // slides home; let the tension fall away and it drops out of
      // the catch; force a mushroom against a hard wrench and it
      // slips off the lip.
      if (T < C.easeOff) {
        s.state = 'down'; s.lift = Math.max(0, s.need - 0.7); emit(lock, 'drop', i);
      } else if (inContact && s.kind === 'shroom' && T > 0.72 && push > 0.8) {
        s.state = 'down'; s.lift = s.need * 0.45; emit(lock, 'slip', i);
      } else if (inContact) {
        s.lift = Math.min(s.need + C.topOut, s.lift + C.liftRate * 0.45 * push * dt);
        if (s.lift >= s.need) {
          s.state = 'set'; s.setAt = lock.timeMs; lock.sets++;
          emit(lock, 'set', i);
          if (lock.stacks.every(x => x.state === 'set')) {
            lock.status = 'open'; emit(lock, 'open'); return;
          }
        }
      }
      continue;
    }
    if (s.state === 'set') {
      // a set stack still rides the pick: keep pushing and the key pin
      // climbs into the shear line and oversets the stack you just won;
      // let go and it settles back onto the plug ledge, still set.
      // For a breath after the click the driver sits hard on the ledge:
      // the climb crawls, and a hand has time to hear the click and stop.
      if (inContact) {
        const justSet = s.setAt > 0 && lock.timeMs - s.setAt < C.setCatchMs;
        const climb = C.liftRate * (justSet ? C.setCatchDrag : 1);
        s.lift = Math.min(s.need + C.topOut, s.lift + climb * push * dt);
        if (s.lift >= s.need + C.oversetMargin) {
          s.state = 'over'; s.setAt = -1; lock.sets--; lock.oversets++;
          emit(lock, 'overset', i);
        }
      } else if (s.lift > s.need) {
        s.lift = Math.max(s.need, s.lift - C.liftRate * 2.2 * dt);
      }
      continue;
    }
    if (inContact) {
      let rate = C.liftRate * (i === binder ? C.binderDrag : 1) * push;
      // serration ridges resist as they cross the plug's edge
      if (s.kind === 'serrated' && i === binder)
        for (const f of C.ridgeFracs) {
          const ry = s.need * f;
          if (s.lift > ry - 0.05 && s.lift < ry + 0.1) rate *= 0.3;
        }
      const before = s.lift;
      s.lift = Math.min(s.need + C.topOut, s.lift + rate * dt);
      // scrub ticks: the rasp of a rising pin, a tick per quarter unit
      if (Math.floor(s.lift / 0.25) > Math.floor(before / 0.25)) emit(lock, 'tick', i);
      // serration clicks: convincing, frequent — and the plug never moves
      if (s.kind === 'serrated' && i === binder && T > 0.2)
        C.ridgeFracs.forEach((f, ri) => {
          const ry = s.need * f;
          if (before < ry && s.lift >= ry && !(s.ridgeHit & (1 << ri))) {
            s.ridgeHit |= (1 << ri); emit(lock, 'ridge', i);
          }
        });
      if (i === binder) {
        // a set can only happen while the plug is actually strained
        // onto this stack; unstrained, the pins ride up and fall back
        // and nothing is held — tension is what holds a set
        const caught = lock.plug >= s.bind - 0.15;
        if (caught && (s.kind === 'spool' || s.kind === 'shroom')) {
          // the waist reaches the edge first: it catches, the plug
          // rolls back, and the stack holds in a false set
          const catchAt = s.need - (s.kind === 'spool' ? C.spoolCatch : C.shroomCatch);
          if (s.lift >= catchAt && s.lift < s.need) {
            s.state = 'false'; s.lift = catchAt + 0.05;
            emit(lock, 'falseset', i);
          }
        }
        if (caught && s.state === 'down' && s.lift >= s.need) {
          s.state = 'set'; s.setAt = lock.timeMs; lock.sets++;
          emit(lock, 'set', i);
          if (lock.stacks.every(x => x.state === 'set')) {
            lock.status = 'open'; emit(lock, 'open'); return;
          }
        }
      }
    } else if (s.lift > 0) {
      s.lift = Math.max(0, s.lift - s.lift * C.springRate * dt - 0.4 * dt);
      if (s.lift === 0) emit(lock, 'fall', i);
      if (s.kind === 'serrated')
        C.ridgeFracs.forEach((f, ri) => { if (s.lift < s.need * f - 0.22) s.ridgeHit &= ~(1 << ri); });
    }
  }

  // overset recovery: ease the tension and the jammed stack falls
  if (jammed && T < C.easeOff) {
    for (let i = 0; i < lock.stacks.length; i++) {
      const s = lock.stacks[i];
      if (s.state === 'over') { s.state = 'down'; s.lift = Math.max(0, s.need - 0.3); emit(lock, 'drop', i); }
    }
  }

  // set stacks live on tension
  const anySet = lock.stacks.some(s => s.state === 'set');
  if (anySet && T < C.holdTension && !jammed) {
    lock.starveTime += dt;
    if (lock.starveTime > C.dropGrace) {
      lock.dropClock += dt;
      if (lock.dropClock >= C.dropInterval) {
        lock.dropClock = 0;
        // the most recently set is the least seated: it drops first
        let victim = -1;
        for (let i = 0; i < lock.stacks.length; i++)
          if (lock.stacks[i].state === 'set' && (victim < 0 || lock.stacks[i].setAt > lock.stacks[victim].setAt)) victim = i;
        if (victim >= 0) {
          lock.stacks[victim].state = 'down'; lock.stacks[victim].lift = Math.max(0, lock.stacks[victim].need - 0.3); lock.sets--;
          emit(lock, 'drop', victim);
        }
      }
    }
  } else lock.starveTime = Math.max(0, lock.starveTime - dt * 2);

  // pick stress: straining against a pinched binder, the top, or a jam
  let strain = 0;
  if (lock.snapLock <= 0 && push > 0.02 && pin >= 0 && pin < lock.stacks.length) {
    const s = lock.stacks[pin];
    if (s.state === 'down') {
      if (jammed) strain = 1;
      else if (pin === binder && T > 0.85 && s.lift > s.need * 0.8) strain = 0.8;
      else if (s.lift >= s.need + C.topOut - 0.02) strain = 0.9;
    } else if (s.state === 'false') {
      // working a caught spool through its prop is the craft itself;
      // forcing a mushroom against a hard wrench is what bends picks
      if (s.kind === 'shroom' && T > C.shroomEase) strain = 0.5;
    }
  }
  lock.stress = Math.max(0, Math.min(1.05, lock.stress + (strain > 0 ? strain * C.stressGain * dt * 2 : -C.stressDecay * dt)));
  if (lock.stress >= C.pickStrength) {
    lock.stress = 0; lock.breaks++; lock.snapLock = C.snapLockTime;
    emit(lock, 'snap');
  }
}

function drainEvents(lock) { const e = lock.events; lock.events = []; return e; }

/* The ladder. Chapter locks are FIXED seeds: a lock you can learn,
   the way you learn a real one. Fresh locks belong to the daily. */
const CHAPTERS = [
  { n: 1, name: 'Plain Pins', pins: 5, seed: 101, two: false, base: 600, kinds: null, cfg: { oversetMargin: 1.6, stressGain: 0.3 },
    spec: 'Five pins · all plain',
    line: 'Five plain drivers. The order is there to be felt.' },
  { n: 2, name: 'Six Pins', pins: 6, seed: 202, two: false, base: 850, kinds: null,
    cfg: { needMin: 1.2, needMax: 4.4, bindMin: 0.8, bindMax: 3.4, oversetMargin: 1.3, stressGain: 0.42 },
    spec: 'Six pins · all plain · tighter tolerances',
    line: 'One more pin, and the tolerances tighten.' },
  { n: 3, name: 'The Spool', pins: 5, seed: 303, two: false, base: 950, kinds: { spool: 2 }, cfg: {},
    spec: 'Five pins · two spools',
    line: 'A spool lies. It will feel set — it is not. Watch the plug roll back: the caught pin props it there. Keep your nerve and push it home.' },
  { n: 4, name: 'Serrations', pins: 6, seed: 404, two: false, base: 1150, kinds: { serrated: 2, spool: 1 },
    cfg: { bindMin: 0.8, bindMax: 3.6 },
    spec: 'Six pins · two serrated · one spool',
    line: 'Serrated pins click at every ridge. Only one click is true: the one where the plug moves.' },
  { n: 5, name: 'Two Hands', pins: 6, seed: 505, two: true, base: 1350, kinds: { spool: 2, serrated: 1, shroom: 1 },
    cfg: { needMin: 1.2, needMax: 4.4, bindMin: 0.7, bindMax: 3.2 },
    spec: 'Six pins · spools, serrations, a mushroom · two hands',
    line: 'The wrench wants its own hand now. Left thumb holds the tension; the right hand picks. The mushroom slips if you force it.' },
];
function chapterLock(ch) {
  const cfg = Object.assign({}, ch.cfg, { pins: ch.pins });
  if (ch.kinds) cfg.kinds = ch.kinds;
  return createLock(ch.seed, cfg);
}

/* The daily lock: one lock for the whole world, reckoned from the date
   alone — every client runs this same arithmetic, so every picker
   tonight works the same pins. The cabinet rotates by the seed: some
   nights are plain, some nights lie. Always one hand. */
const DAILY_BASE = 1000;
function dailySeed(dateStr) {
  let h = 2166136261;
  const s = 'tension|' + dateStr;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const KIND_WORDS = { spool: ['spool', 'spools'], shroom: ['mushroom', 'mushrooms'], serrated: ['serrated', 'serrated'] };
const NUM_WORDS = ['no', 'one', 'two', 'three'];
function cabinetSpec(pins, kinds) {
  const parts = [(pins === 6 ? 'Six' : 'Five') + ' pins'];
  const named = ['spool', 'serrated', 'shroom'].filter(k => kinds && kinds[k]);
  if (!named.length) parts.push('all plain');
  for (const k of named) parts.push(NUM_WORDS[kinds[k]] + ' ' + KIND_WORDS[k][kinds[k] > 1 ? 1 : 0]);
  return parts.join(' · ');
}
function dailyLock(dateStr) {
  const seed = dailySeed(dateStr);
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const pins = 5 + (rand() < 0.45 ? 1 : 0);
  const kinds = {};
  const spool = Math.floor(rand() * 3);
  const serr = rand() < 0.5 ? Math.floor(rand() * 2) : 0;
  if (spool) kinds.spool = spool;
  if (serr) kinds.serrated = serr;
  if (pins === 6 && rand() < 0.3) kinds.shroom = 1;
  const lock = createLock(seed, {
    pins, kinds: Object.keys(kinds).length ? kinds : undefined,
    bindMin: 0.7, bindMax: 3.8, needMin: 1.3, needMax: 4.2,
  });
  return { lock, seed, pins, kinds, base: DAILY_BASE, spec: cabinetSpec(pins, kinds) };
}
function scoreFor(ch, lock) {
  return Math.max(0, Math.round(ch.base - (lock.timeMs / 1000) * 5 - lock.oversets * 60 - lock.breaks * 120));
}
function medalFor(ch, lock) {
  const s = scoreFor(ch, lock) / ch.base;
  return s >= 0.8 ? 'GOLD' : s >= 0.55 ? 'SILVER' : s >= 0.35 ? 'BRONZE' : null;
}

const TN = { mulberry32, DEFAULTS, createLock, step, binderIndex, drainEvents, CHAPTERS, chapterLock, scoreFor, medalFor, dailyLock, dailySeed, cabinetSpec, DAILY_BASE };
if (typeof module !== 'undefined' && module.exports) module.exports = TN;
