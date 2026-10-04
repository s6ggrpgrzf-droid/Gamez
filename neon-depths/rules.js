/*
 * Neon Depths — rules.js
 * Pure-logic game state machine. Consumes table events, drives table features,
 * owns scoring, modes, multiball, wizard, depth/pressure, ball save.
 * No DOM. Headless-testable: drive via T.events injection or real sim frames.
 */
'use strict';

const MODES = [
  { id: 'kelp',   name: 'Kelp Forest',    dur: 45, color: '#39d97e' },
  { id: 'vent',   name: 'Thermal Vent',   dur: 40, color: '#ff9a3c' },
  { id: 'angler', name: 'Anglerfish Hunt', dur: 45, color: '#c77dff' },
  { id: 'wreck',  name: 'Sunken Wreck',   dur: 60, color: '#ffd23c' },
  { id: 'bloom',  name: 'Plankton Bloom', dur: 30, color: '#4ce0e0' },
  { id: 'trench', name: 'The Trench',     dur: 50, color: '#5b8cff' },
];

const MAJORS = ['rampKelp', 'rampVent', 'rampMaw', 'orbitL', 'orbitR', 'pearl', 'spinner', 'scoop', 'saucer'];

function createRules(T) {
  const sim = T.sim;
  const R = {
    state: 'attract', // attract | play | gameover
    score: 0,
    ball: 1,
    ballsPerGame: 3,
    mode: null,          // {id,name,t,dur,data}
    modesDone: {},       // id -> true
    wizardAttempts: 0,
    wizardLit: false,
    lockLit: false,
    locks: 0,
    multiball: false,    // kraken multiball active
    addABallUsed: false,
    megaUsed: false,
    inlanes: {},
    abyss: [false, false, false, false, false],
    abyssCompletions: 0,
    bonusX: 1,
    ebLit: false,
    ebCollected: false,
    depthM: 0,
    lit: {},             // shotId -> purpose: mode|jackpot|lock|wizard|eb|hurry
    combo: 0, comboT: 0, lastShot: null,
    ballSaveT: 0,
    autoPlungeT: 0,
    scoopT: 0, scoopModeStart: false,
    banner: null,        // {main, sub, t}
    audio: [],
    ai: [],              // kraken taunt prompts for game.js
    trenchSeq: [],
    ventValue: 5000000,
    anglerLits: [],
    anglerGrabs: 0,
    wreckPhase: 0, wreckPearls: 0,
    bloomHits: 0,
    kelpHits: 0,
    gameOverScore: 0,
  };

  const say = (main, sub, dur) => { R.banner = { main, sub: sub || '', t: dur || 2.5 }; };
  const sfx = (name, data) => { R.audio.push(Object.assign({ name }, data || {})); };
  const taunt = (kind, data) => { R.ai.push(Object.assign({ kind }, data || {})); };
  R.takeAudio = () => { const a = R.audio; R.audio = []; return a; };
  R.takeAi = () => { const a = R.ai; R.ai = []; return a; };

  const depthMult = () => 1 + R.depthM / 2750;
  const crush = () => R.depthM >= 6000;
  function addScore(base, opts) {
    let pts = base * depthMult();
    if (crush()) pts *= 1.5;
    if (opts && opts.modeMult) pts *= opts.modeMult;
    pts = Math.round(pts);
    R.score += pts;
    R.depthM = Math.min(11000, Math.floor(R.score / 4000));
    T.setSlingBoost(crush() ? 1.25 : 1);
    return pts;
  }

  function liveBalls() {
    return sim.balls.length + T.carries.length + T.holds.length + T.mawLocks.length + (T.magnet.held ? 1 : 0);
  }

  // ---------------- game flow ----------------
  R.startGame = () => {
    R.state = 'play';
    R.score = 0; R.ball = 1; R.depthM = 0; R.bonusX = 1;
    R.modesDone = {}; R.wizardAttempts = 0; R.wizardLit = false;
    R.lockLit = false; R.locks = 0; R.multiball = false;
    R.inlanes = {}; R.abyss = [false, false, false, false, false];
    R.abyssCompletions = 0; R.ebLit = false; R.ebCollected = false;
    R.mode = null; R.lit = {}; R.combo = 0;
    T.resetInkBank();
    T.kickbackLit = false;
    sim.resetTilt();
    say('NEON DEPTHS', 'plunge to begin your descent', 3);
    sfx('gameStart');
    serveBall();
  };

  function serveBall() {
    T.newBallInLane();
    R.autoPlungeT = 1.2;
    R.ballSaveT = 20;
    sfx('serve');
  }

  function autoPlungeTick(dt) {
    if (R.autoPlungeT > 0) {
      R.autoPlungeT -= dt;
      if (R.autoPlungeT <= 0) T.plunge(0.85);
    }
  }

  function endBall(tilted) {
    // end-of-ball bonus (skipped on tilt)
    if (!tilted) {
      const bonus = Math.round(R.depthM * 200 * R.bonusX);
      if (bonus > 0) {
        R.score += bonus;
        say('DIVE BONUS', '+' + bonus.toLocaleString('en-US'), 2.5);
        sfx('bonus');
      }
    }
    R.mode = null; R.multiball = false; R.lit = {};
    T.setMagnet(false);
    T.resetInkBank();
    R.lockLit = false; R.locks = 0;
    R.inlanes = {};
    sim.resetTilt();
    if (R.ball >= R.ballsPerGame) {
      R.state = 'gameover';
      R.gameOverScore = R.score;
      say('DIVE COMPLETE', R.score.toLocaleString('en-US') + ' pts', 5);
      sfx('gameOver');
      taunt('gameover', { score: R.score });
    } else {
      R.ball++;
      say('BALL ' + R.ball, 'descend again', 2);
      serveBall();
    }
  }

  // ---------------- modes ----------------
  function nextMode() {
    return MODES.find(m => !R.modesDone[m.id]) || null;
  }

  function startMode(def) {
    R.mode = { id: def.id, name: def.name, t: def.dur, dur: def.dur, color: def.color, data: {} };
    R.lit = {};
    if (def.id === 'kelp') {
      R.kelpHits = 0;
      ['rampKelp', 'rampVent', 'rampMaw', 'orbitL', 'orbitR', 'spinner'].forEach(s => R.lit[s] = 'mode');
    } else if (def.id === 'vent') {
      R.ventValue = 5000000;
      R.lit.rampVent = 'hurry';
    } else if (def.id === 'angler') {
      R.anglerGrabs = 0;
      relightAngler();
      T.setMagnet(true, { x: 200, y: 500 });
    } else if (def.id === 'wreck') {
      R.wreckPhase = 1; R.wreckPearls = 0;
      T.resetInkBank();
      ['ink1', 'ink2', 'ink3'].forEach(s => R.lit[s] = 'mode');
    } else if (def.id === 'bloom') {
      R.bloomHits = 0;
      ['bumper1', 'bumper2', 'bumper3'].forEach(s => R.lit[s] = 'mode');
    } else if (def.id === 'trench') {
      R.trenchSeq = [];
      MAJORS.forEach(s => R.lit[s] = 'mode');
    }
    say(def.name.toUpperCase(), modeHint(def.id), 3);
    sfx('modeStart', { mode: def.id });
    taunt('mode', { mode: def.id });
  }

  function modeHint(id) {
    return {
      kelp: 'hit 6 flashing shots', vent: 'thermal vent hurry-up: 3 hits',
      angler: 'hit the roaming lights — beware the lure', wreck: 'drop INK, then bash the pearl',
      bloom: '20 bumper hits', trench: '8 different shots in a row',
    }[id];
  }

  function relightAngler() {
    R.anglerLits = [];
    const pool = MAJORS.slice();
    while (R.anglerLits.length < 4 && pool.length) {
      R.anglerLits.push(pool.splice(Math.floor(sim.rng() * pool.length), 1)[0]);
    }
    R.lit = {};
    R.anglerLits.forEach(s => R.lit[s] = 'mode');
  }

  function completeMode() {
    const m = R.mode;
    const pts = addScore(10000000);
    say(m.name.toUpperCase() + ' CLEAR', '+' + pts.toLocaleString('en-US'), 3);
    sfx('modeComplete', { mode: m.id });
    R.modesDone[m.id] = true;
    R.mode = null; R.lit = {};
    T.setMagnet(false);
    updateWizardLit();
  }

  function failMode() {
    say(R.mode.name.toUpperCase() + ' LOST', 'the deep keeps its secrets', 2.5);
    sfx('modeFail');
    R.mode = null; R.lit = {};
    T.setMagnet(false);
  }

  function updateWizardLit() {
    const done = Object.keys(R.modesDone).length;
    const need = R.wizardAttempts === 0 ? 4 : 6;
    R.wizardLit = done >= need && !R.multiball && !R.mode;
    if (R.wizardLit) R.lit.rampMaw = 'wizard';
  }

  function startWizard() {
    R.wizardLit = false;
    R.mode = { id: 'leviathan', name: 'Leviathan Rising', t: 60, dur: 60, color: '#ff3c5b', data: {} };
    R.lit = {};
    MAJORS.forEach(s => R.lit[s] = 'jackpot');
    R.ballSaveT = 40;
    // ensure 3 balls in play
    let need = 3 - liveBalls();
    while (need-- > 0) {
      const a = sim.rng() * Math.PI * 2;
      sim.addBall(200, 300, Math.cos(a) * 500, Math.sin(a) * 500 - 300);
    }
    say('LEVIATHAN RISING', 'all shots lit — 60 seconds', 3.5);
    sfx('wizardStart');
    taunt('wizard', {});
  }

  function endWizard() {
    const done = Object.keys(R.modesDone).length;
    const pts = addScore(25000000 * Math.max(1, done));
    say('KRAKEN TAMED', '+' + pts.toLocaleString('en-US'), 4);
    sfx('wizardEnd');
    R.wizardAttempts++;
    R.modesDone = {};
    R.mode = null; R.lit = {};
    updateWizardLit();
  }

  // ---------------- kraken multiball ----------------
  function onInkDown() {
    if (R.wreckPhase === 1 && R.mode && R.mode.id === 'wreck') {
      if (T.inkDown.every(Boolean)) {
        R.wreckPhase = 2;
        R.lit = { pearl: 'mode' };
        say('WRECK BREACHED', 'bash the pearl 3x', 2.5);
      }
      return;
    }
    if (T.inkDown.every(Boolean) && !R.multiball && !R.lockLit) {
      R.lockLit = true;
      R.lit.rampMaw = 'lock';
      say('KRAKEN STIRS', 'lock a ball in the maw', 2.5);
      sfx('lockLit');
    }
  }

  function onMawEnter() {
    if (R.wizardLit) { startWizard(); return; }
    if (R.lockLit && R.locks < 2) {
      const c = T.findMawCarry();
      if (c) T.requestMawLock(c);
      return;
    }
    if (R.locks >= 2 && !R.multiball) {
      // third lock: release into multiball
      const r = T.lockBallInMaw();
      if (r === 'multiball') startKrakenMultiball();
      return;
    }
    // plain ramp shot
    scoreShot('rampMaw', 500000);
  }

  function onMawLock() {
    R.locks++;
    R.lockLit = false;
    T.resetInkBank();
    say('BALL ' + R.locks + ' LOCKED', R.locks < 2 ? 'lock another' : 'one more for the kraken', 2.5);
    sfx('lock', { n: R.locks, x: 345, y: 320 });
    T.newBallInLane();
    R.autoPlungeT = 1.0;
  }

  function startKrakenMultiball() {
    R.multiball = true;
    R.addABallUsed = false;
    R.megaUsed = false;
    R.ballSaveT = 15;
    R.lit = {};
    MAJORS.forEach(s => R.lit[s] = 'jackpot');
    R.lit.pearl = 'mega';
    say('KRAKEN MULTIBALL', 'jackpots lit — pearl for MEGA', 3.5);
    sfx('multiballStart');
    taunt('multiball', {});
  }

  function endKrakenMultiball() {
    R.multiball = false;
    R.lit = {};
    if (R.mode) startModeLightRefresh();
    say('MULTIBALL END', '', 2);
    sfx('multiballEnd');
  }

  function startModeLightRefresh() {
    // re-light current mode shots after multiball
    const id = R.mode.id, keep = R.mode;
    R.mode = null;
    const dur = keep.t;
    startMode(MODES.find(m => m.id === id));
    R.mode.t = dur;
  }

  // ---------------- scoring shots ----------------
  function scoreShot(id, base) {
    const pts = addScore(base);
    // combo: different major shot within 3s
    if (MAJORS.includes(id)) {
      if (R.lastShot && R.lastShot !== id && R.comboT > 0) {
        R.combo++;
        const cp = addScore(R.combo * 100000);
        if (R.combo >= 2) sfx('combo', { n: R.combo });
      } else R.combo = 0;
      R.lastShot = id; R.comboT = 3;
    }
    return pts;
  }

  function onShot(id, ev) {
    // wizard scoring
    if (R.mode && R.mode.id === 'leviathan') {
      const done = Math.max(1, Object.keys(R.modesDone).length);
      if (id === 'pearl') {
        const pts = addScore(25000000 * done);
        say('MEGA JACKPOT', '+' + pts.toLocaleString('en-US'), 2.5);
        sfx('megaJackpot');
      } else if (MAJORS.includes(id)) {
        addScore(5000000 * (1 + 0.5 * done));
        sfx('jackpot');
      }
      return;
    }
    // kraken multiball jackpots
    if (R.multiball) {
      if (id === 'pearl') {
        if (!R.megaUsed) {
          R.megaUsed = true;
          const pts = addScore(25000000);
          say('MEGA JACKPOT', '+' + pts.toLocaleString('en-US'), 3);
          sfx('megaJackpot');
        } else addScore(5000000);
      } else if (MAJORS.includes(id)) {
        const pts = addScore(5000000);
        if (R.combo >= 1) { addScore(5000000); say('SUPER JACKPOT', '+' + pts.toLocaleString('en-US'), 2); }
        else sfx('jackpot');
      }
      return;
    }
    // mode progress
    const m = R.mode;
    if (m && m.id === 'kelp') {
      if (['rampKelp', 'rampVent', 'rampMaw', 'orbitL', 'orbitR', 'spinner'].includes(id)) {
        R.kelpHits++;
        addScore(750000);
        sfx('modeShot');
        if (R.kelpHits >= 6) completeMode();
      }
      return;
    }
    if (m && m.id === 'vent') {
      if (id === 'rampVent') {
        const pts = addScore(R.ventValue);
        say('VENT ' + pts.toLocaleString('en-US'), (3 - (m.data.hits || 0) - 1) + ' to go', 1.5);
        m.data.hits = (m.data.hits || 0) + 1;
        R.ventValue = 5000000;
        sfx('hurryup');
        if (m.data.hits >= 3) completeMode();
      }
      return;
    }
    if (m && m.id === 'angler') {
      if (R.anglerLits.includes(id)) {
        addScore(1000000);
        sfx('modeShot');
        m.data.hits = (m.data.hits || 0) + 1;
        if (m.data.hits >= 4) completeMode();
        else relightAngler();
      }
      return;
    }
    if (m && m.id === 'wreck') {
      if (id === 'pearl' && R.wreckPhase === 2) {
        R.wreckPearls++;
        addScore(2000000);
        sfx('bash');
        if (R.wreckPearls >= 3) completeMode();
      }
      return;
    }
    if (m && m.id === 'bloom') return; // bumpers handled in onBumper
    if (m && m.id === 'trench') {
      if (MAJORS.includes(id)) {
        const seq = R.trenchSeq;
        if (seq.length && seq[seq.length - 1] === id) { seq.length = 0; say('STREAK BROKEN', '', 1.5); }
        else {
          seq.push(id);
          const pts = addScore(250000 * seq.length);
          if (seq.length >= 8) completeMode();
        }
      }
      return;
    }
    // base values (no mode)
    const BASE = {
      orbitL: 250000, orbitR: 250000, rampKelp: 500000, rampVent: 500000,
      spinner: 50000, scoop: 100000, saucer: 100000,
      trenchL: 150000, trenchR: 150000, laneTop1: 50000, laneTop2: 50000, laneTop3: 50000,
      inlaneL: 25000, inlaneR: 25000,
    };
    if (BASE[id] !== undefined) {
      let v = BASE[id];
      if (id === 'spinner' && ev && ev.spins) v *= ev.spins;
      scoreShot(id, v);
      if (id === 'inlaneL' || id === 'inlaneR') {
        R.inlanes[id] = true;
        if (R.inlanes.inlaneL && R.inlanes.inlaneR && !T.kickbackLit) {
          T.kickbackLit = true;
          say('KICKBACK LIT', '', 2);
          sfx('kickbackLit');
        }
      }
      if (id === 'trenchL' || id === 'trenchR') {
        if (R.multiball && !R.addABallUsed && R.trenchSeq.includes('trenchL') && R.trenchSeq.includes('trenchR')) {
          // handled below in trench tracking
        }
      }
    }
  }

  function onBumper(id, impulse) {
    if (R.mode && R.mode.id === 'bloom') {
      R.bloomHits++;
      addScore(1000000);
      if (R.bloomHits >= 20) completeMode();
      else if (R.bloomHits % 5 === 0) say('BLOOM ' + R.bloomHits + '/20', '', 1.2);
    } else {
      scoreShot(id, 100000);
    }
    sfx('bumper', { impulse, x: id && T.shots[id] ? T.shots[id].x : 200, y: id && T.shots[id] ? T.shots[id].y : 200 });
  }

  // unrequested original touch: the anglerfish lure likes being petted
  R.grantEasterEgg = () => {
    if (R.state !== 'play') return;
    const p = addScore(1000000);
    say('THE LURE LIKES YOU', '+' + p.toLocaleString('en-US'), 2);
    sfx('mystery');
  };

  // ---------------- table event dispatch ----------------
  function onTableEvent(e) {
    switch (e.type) {
      case 'shot': onShot(e.id, e); break;
      case 'rampEnter':
        if (e.ramp === 'rampMaw') onMawEnter();
        else onShot(e.ramp, e);
        break;
      case 'rampExit': sfx('rampExit', { ramp: e.ramp }); break;
      case 'bumper': onBumper(e.id, e.impulse); break;
      case 'sling': addScore(25000); sfx('sling'); break;
      case 'flipperHit': sfx('flipper', { impulse: e.impulse }); break;
      case 'ballHit': sfx('ballClack'); break;
      case 'inkDown':
        addScore(200000);
        sfx('dropTarget');
        onInkDown();
        break;
      case 'inkReset': break;
      case 'abyssHit': {
        if (!R.abyss[e.index]) {
          R.abyss[e.index] = true;
          addScore(150000);
          sfx('standup');
          if (R.abyss.every(Boolean)) {
            R.abyssCompletions++;
            R.bonusX = Math.min(10, R.bonusX + 1);
            say('ABYSS x' + R.bonusX, R.abyssCompletions >= 2 && !R.ebCollected ? 'extra ball lit at dive bell' : '', 2.5);
            sfx('abyssComplete');
            if (R.abyssCompletions >= 2 && !R.ebCollected) R.ebLit = true;
            R.abyss = [false, false, false, false, false];
          }
        }
        break;
      }
      case 'pearlHit':
        T.pearlWobble = 1;
        if (!(R.mode && R.mode.id === 'wreck' && R.wreckPhase === 2) && !R.multiball &&
            !(R.mode && R.mode.id === 'leviathan')) {
          onShot('pearl', e);
          addScore(500000);
        } else onShot('pearl', e);
        sfx('pearl', { x: 300, y: 210 });
        break;
      case 'scoop': {
        R.scoopT = 1.4;
        R.scoopModeStart = false;
        if (R.ebLit) {
          R.ebLit = false; R.ebCollected = true;
          R.ballsPerGame++;
          say('EXTRA BALL', '', 3);
          sfx('extraBall');
        } else if (!R.mode && !R.multiball && !(R.mode && R.mode.id === 'leviathan')) {
          const nm = nextMode();
          if (nm) { R.scoopModeStart = true; R.pendingMode = nm; }
          else addScore(250000);
        } else addScore(100000);
        break;
      }
      case 'saucer': {
        const r = sim.rng();
        let msg;
        if (r < 0.35) { const p = addScore(2000000); msg = '+' + p.toLocaleString('en-US'); }
        else if (r < 0.55) { T.kickbackLit = true; msg = 'kickback lit'; }
        else if (r < 0.75) { R.bonusX = Math.min(10, R.bonusX + 1); msg = 'bonus x' + R.bonusX; }
        else { const p = addScore(5000000); msg = '+' + p.toLocaleString('en-US'); }
        say('WHALE-FALL', msg, 2.5);
        sfx('mystery');
        break;
      }
      case 'mawLock': onMawLock(); break;
      case 'mawRelease': break;
      case 'kickback':
        say('KICKBACK', 'saved', 1.5);
        sfx('kickback');
        break;
      case 'magnetGrab':
        R.anglerGrabs++;
        sfx('magnetGrab');
        if (R.mode && R.mode.id === 'angler' && R.anglerLits.length) {
          const tgt = R.anglerLits[Math.floor(sim.rng() * R.anglerLits.length)];
          const sp = T.shots[tgt];
          if (sp) T.setMagnet(true, { x: sp.x, y: sp.y });
        }
        if (R.anglerGrabs >= 2) T.setMagnet(false);
        break;
      case 'magnetFling': sfx('magnetFling'); break;
      case 'plunged': {
        const band = e.band;
        if (band === 'soft') { const p = addScore(1000000); say('SILENT DESCENT', '+' + p.toLocaleString('en-US'), 2); }
        else if (band === 'mid') { const p = addScore(500000); say('CLEAN LAUNCH', '+' + p.toLocaleString('en-US'), 2); }
        else { const p = addScore(2000000); say('DEEP PLUNGE', '+' + p.toLocaleString('en-US'), 2); }
        R.ballSaveT = Math.max(R.ballSaveT, 20);
        sfx('plunge', { band });
        break;
      }
      case 'drain': {
        sfx('drain');
        if (R.ballSaveT > 0 && liveBalls() === 0 && R.state === 'play') {
          say('BALL SAVED', '', 1.5);
          sfx('ballSave');
          serveBall();
        } else if (R.multiball && liveBalls() === 1) {
          endKrakenMultiball();
        } else if (liveBalls() === 0 && R.state === 'play') {
          endBall(false);
        }
        break;
      }
      case 'tilt':
        say('TILT', 'the kraken disapproves', 2.5);
        sfx('tilt');
        taunt('tilt', {});
        for (const b of sim.balls.slice()) sim.removeBall(b.id);
        T.carries.length = 0; T.holds.length = 0; T.mawLocks.length = 0;
        if (T.magnet.held) T.magnet.held = null;
        endBall(true);
        break;
      case 'tiltWarning':
        say('TILT WARNING', '', 1.2);
        sfx('tiltWarning');
        break;
      case 'nudge': sfx('nudge'); break;
    }
  }

  // ---------------- per-frame ----------------
  R.update = (dt) => {
    if (R.state !== 'play') return;
    for (const e of T.takeEvents()) onTableEvent(e);
    autoPlungeTick(dt);
    if (R.ballSaveT > 0) R.ballSaveT -= dt;
    if (R.comboT > 0) { R.comboT -= dt; if (R.comboT <= 0) R.combo = 0; }
    // scoop hold
    if (R.scoopT > 0) {
      R.scoopT -= dt;
      if (R.scoopT <= 0) {
        if (R.scoopModeStart && R.pendingMode) {
          const pm = R.pendingMode; R.pendingMode = null; R.scoopModeStart = false;
          T.releaseScoop(60, 500);
          startMode(pm);
        } else T.releaseScoop();
      }
    }
    // mode timer
    if (R.mode && R.mode.id !== 'leviathan') {
      R.mode.t -= dt;
      if (R.mode.id === 'vent') {
        R.ventValue = Math.max(500000, R.ventValue - dt * 100000);
      }
      if (R.mode.t <= 0) failMode();
    } else if (R.mode && R.mode.id === 'leviathan') {
      R.mode.t -= dt;
      if (R.mode.t <= 0) endWizard();
    }
    // banner decay
    if (R.banner) { R.banner.t -= dt; if (R.banner.t <= 0) R.banner = null; }
    // add-a-ball via trench lanes during multiball
    if (R.multiball && !R.addABallUsed) {
      // tracked via trench shots below
    }
  };

  // trench add-a-ball tracking hook (called from onShot via trench ids)
  const _onShot = onShot;
  onShot = function (id, ev) {
    if (R.multiball && !R.addABallUsed && (id === 'trenchL' || id === 'trenchR')) {
      if (!R.trenchSeq.includes(id)) R.trenchSeq.push(id);
      if (R.trenchSeq.includes('trenchL') && R.trenchSeq.includes('trenchR')) {
        R.addABallUsed = true;
        const a = sim.rng() * Math.PI * 2;
        sim.addBall(200, 300, Math.cos(a) * 400, Math.sin(a) * 400 - 200);
        say('ADD-A-BALL', '', 2);
        sfx('addABall');
      }
    }
    // trench mode streak timeout handled by combo timer reuse
    _onShot(id, ev);
  };

  R.snapshot = () => ({
    state: R.state, score: R.score, ball: R.ball, ballsPerGame: R.ballsPerGame,
    mode: R.mode ? { id: R.mode.id, name: R.mode.name, t: R.mode.t, dur: R.mode.dur, color: R.mode.color } : null,
    modesDone: Object.keys(R.modesDone), wizardLit: R.wizardLit, lockLit: R.lockLit, locks: R.locks,
    multiball: R.multiball, depthM: R.depthM, mult: depthMult(), crush: crush(),
    bonusX: R.bonusX, lit: Object.assign({}, R.lit), ballSaveT: Math.max(0, R.ballSaveT),
    banner: R.banner, inlanes: Object.assign({}, R.inlanes), kickbackLit: T.kickbackLit,
    combo: R.combo, abyss: R.abyss.slice(), ebLit: R.ebLit, tilt: sim.tilt,
  });

  return R;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createRules, MODES };
}
