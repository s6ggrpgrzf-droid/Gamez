/*
 * Neon Depths — game.js
 * Shell: fixed-step loop, touch/keyboard input, HUD, arcade + AI wiring.
 * Classic script; expects sim.js, table.js, rules.js, render.js, audio.js loaded.
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');

  const sim = new PinSim((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  const T = createTable(sim);
  const R = createRules(T);
  const renderer = createRenderer(canvas, T, R);
  const audio = createAudio();

  // ---------- haptics ----------
  // Named vocabulary; feature-detected, fails harmlessly on iOS.
  const HAP = {
    flip: [8], light: [14], medium: [25],
    success: [12, 45, 12], warning: [25, 60, 25], error: [45, 70, 45, 45, 70, 45],
  };
  const prefs = { muted: false, haptics: true, reducedMotion: false };
  try {
    const saved = JSON.parse(localStorage.getItem('neon-depths-prefs') || '{}');
    if (typeof saved.muted === 'boolean') prefs.muted = saved.muted;
    if (typeof saved.haptics === 'boolean') prefs.haptics = saved.haptics;
    if (typeof saved.reducedMotion === 'boolean') prefs.reducedMotion = saved.reducedMotion;
  } catch (e) {}
  // migrate legacy mute key
  try { if (localStorage.getItem('neon-depths-muted') === '1') prefs.muted = true; } catch (e) {}
  if (!('haptics' in (JSON.parse(localStorage.getItem('neon-depths-prefs') || '{}')))) {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        prefs.reducedMotion = true; prefs.haptics = false;
      }
    } catch (e) {}
  }
  function savePrefs() {
    try { localStorage.setItem('neon-depths-prefs', JSON.stringify(prefs)); } catch (e) {}
  }
  const buzzLast = {};
  function buzz(name, throttleMs) {
    if (!prefs.haptics || prefs.reducedMotion) return;
    const now = performance.now();
    if (throttleMs) {
      if (now - (buzzLast[name] || 0) < throttleMs) return;
      buzzLast[name] = now;
    }
    try { if (navigator.vibrate) navigator.vibrate(HAP[name] || HAP.light); } catch (e) {}
  }
  renderer.rm = prefs.reducedMotion;

  // ---------- DOM ----------
  const el = {
    score: $('score'), balls: $('balls'), banner: $('banner'),
    bannerMain: $('banner-main'), bannerSub: $('banner-sub'),
    depthFill: $('depth-fill'), depthLabel: $('depth-label'),
    saveWrap: $('save-wrap'), saveFill: $('save-fill'),
    tiltFill: $('tilt-fill'), combo: $('combo'),
    attract: $('attract'), gameover: $('gameover'),
    finalScore: $('final-score'), bestScore: $('best-score'),
    attractBest: $('attract-best'), mute: $('mute-btn'),
    gear: $('gear-btn'), settings: $('settings'),
    setSound: $('set-sound'), setHap: $('set-hap'), setRm: $('set-rm'),
    pause: $('pause-overlay'), taunt: $('taunt'),
    nudgeL: $('nudge-left'), nudgeR: $('nudge-right'),
    plungeHint: $('plunge-hint'),
  };
  let best = 0;
  try { best = parseInt(localStorage.getItem('neon-depths-best') || '0', 10) || 0; } catch (e) {}
  el.attractBest.textContent = best > 0 ? 'best: ' + best.toLocaleString('en-US') : '';

  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

  // ---------- state ----------
  let running = true, paused = false, submitted = false;
  let bannerId = null;

  // ---------- input ----------
  const pointers = new Map(); // pointerId -> 'left'|'right'|'plunger'
  let plungerStartY = 0, plungerCharge = 0, plungerActive = false, plungerDownT = 0;
  let keyPlunger = false, keyCharge = 0;
  const keys = new Set();

  function toLogical(ev) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) / rect.width * 400,
      y: (ev.clientY - rect.top) / rect.height * 800,
    };
  }
  function ballInLane() {
    return sim.balls.some(b => b.x > 356 && b.y > 600);
  }

  canvas.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    audio.ensure();
    if (R.state !== 'play') { tapStart(); return; }
    const p = toLogical(ev);
    // lure easter egg
    lureTap(p.x, p.y);
    if (p.x > 320 && p.y > 520 && ballInLane()) {
      pointers.set(ev.pointerId, 'plunger');
      plungerActive = true; plungerStartY = p.y; plungerCharge = 0;
      plungerDownT = performance.now();
      R.autoPlungeT = 0; // grabbing the plunger cancels the auto-launch
      canvas.setPointerCapture(ev.pointerId);
    } else if (p.x < 200) {
      pointers.set(ev.pointerId, 'left');
      sim.setFlipper('left', true);
      buzz('flip', 140);
    } else {
      pointers.set(ev.pointerId, 'right');
      sim.setFlipper('right', true);
      buzz('flip', 140);
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (pointers.get(ev.pointerId) === 'plunger') {
      const p = toLogical(ev);
      plungerCharge = Math.min(1, Math.max(0, (p.y - plungerStartY) / 170));
      renderer.plungerCharge = plungerCharge;
    }
  });
  function pointerEnd(ev) {
    const kind = pointers.get(ev.pointerId);
    pointers.delete(ev.pointerId);
    if (kind === 'left') sim.setFlipper('left', false);
    else if (kind === 'right') sim.setFlipper('right', false);
    else if (kind === 'plunger') {
      plungerActive = false;
      const quickTap = performance.now() - plungerDownT < 260;
      if (R.state === 'play' && ballInLane()) {
        if (plungerCharge > 0.03) { T.plunge(plungerCharge); renderer.plungerKick = 1; buzz('light'); }
        else if (quickTap) { T.plunge(0.65); renderer.plungerKick = 1; buzz('light'); } // tap = medium launch
      }
      plungerCharge = 0; renderer.plungerCharge = 0;
    }
  }
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  // lure easter egg: 3 taps on the anglerfish lure
  let lureTaps = [];
  function lureTap(x, y) {
    if (Math.hypot(x - 200, y - 310) > 46) return;
    const now = performance.now();
    lureTaps = lureTaps.filter(t => now - t < 1200);
    lureTaps.push(now);
    if (lureTaps.length >= 3) {
      lureTaps = [];
      R.grantEasterEgg();
      renderer.burst(200, 310, '#e07dff', 24, 200);
      buzz('light');
    }
  }

  window.addEventListener('keydown', (ev) => {
    if (ev.repeat) return;
    audio.ensure();
    const k = ev.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowdown', 'arrowup', ' '].includes(ev.key.toLowerCase()) ||
        ev.key === ' ') ev.preventDefault();
    if (R.state !== 'play') {
      if (k === ' ' || k === 'enter') tapStart();
      return;
    }
    if (k === 'z' || k === 'arrowleft') { keys.add('left'); sim.setFlipper('left', true); buzz('flip', 140); }
    else if (k === '/' || k === 'arrowright') { keys.add('right'); sim.setFlipper('right', true); buzz('flip', 140); }
    else if (k === 'arrowdown' || k === ' ') { keyPlunger = true; keyCharge = 0; }
    else if (k === 'q') { sim.nudge(-1, 0); renderer.rock(-1); }
    else if (k === 'e') { sim.nudge(1, 0); renderer.rock(1); }
    else if (k === 'm') toggleMute();
    else if (k === 'p') togglePause();
  });
  window.addEventListener('keyup', (ev) => {
    const k = ev.key.toLowerCase();
    if (k === 'z' || k === 'arrowleft') { keys.delete('left'); sim.setFlipper('left', false); }
    else if (k === '/' || k === 'arrowright') { keys.delete('right'); sim.setFlipper('right', false); }
    else if ((k === 'arrowdown' || k === ' ') && keyPlunger) {
      keyPlunger = false;
      if (R.state === 'play' && ballInLane() && keyCharge > 0.03) {
        T.plunge(keyCharge); renderer.plungerKick = 1; buzz('light');
      }
      keyCharge = 0; renderer.plungerCharge = 0;
    }
  });
  window.addEventListener('blur', () => {
    sim.setFlipper('left', false); sim.setFlipper('right', false);
    keys.clear(); keyPlunger = false; pointers.clear();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && R.state === 'play' && !paused) togglePause();
  });

  function bindNudge(btn, dx) {
    btn.addEventListener('pointerdown', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      audio.ensure();
      if (R.state === 'play') { sim.nudge(dx, 0); renderer.rock(dx); }
    });
  }
  bindNudge(el.nudgeL, -1);
  bindNudge(el.nudgeR, 1);

  function applySound() {
    audio.setMuted(prefs.muted);
    el.mute.textContent = prefs.muted ? '🔇' : '🔊';
    el.setSound.textContent = prefs.muted ? 'off' : 'on';
    el.setSound.classList.toggle('off', prefs.muted);
  }
  function toggleMute() {
    audio.ensure();
    prefs.muted = !prefs.muted;
    savePrefs();
    applySound();
  }
  el.mute.addEventListener('click', (ev) => { ev.stopPropagation(); toggleMute(); });

  // ---------- settings ----------
  function syncSettings() {
    el.setHap.textContent = prefs.haptics ? 'on' : 'off';
    el.setHap.classList.toggle('off', !prefs.haptics);
    el.setRm.textContent = prefs.reducedMotion ? 'on' : 'off';
    el.setRm.classList.toggle('off', !prefs.reducedMotion);
    renderer.rm = prefs.reducedMotion;
  }
  function toggleSettings(show) {
    const open = show !== undefined ? show : el.settings.style.display !== 'flex';
    el.settings.style.display = open ? 'flex' : 'none';
    if (open) { syncSettings(); buzz('light'); }
  }
  el.gear.addEventListener('click', (ev) => { ev.stopPropagation(); audio.ensure(); toggleSettings(); });
  el.settings.addEventListener('click', (ev) => { ev.stopPropagation(); toggleSettings(false); });
  el.setSound.addEventListener('click', (ev) => { ev.stopPropagation(); toggleMute(); });
  el.setHap.addEventListener('click', (ev) => {
    ev.stopPropagation();
    prefs.haptics = !prefs.haptics; savePrefs(); syncSettings(); buzz('light');
  });
  el.setRm.addEventListener('click', (ev) => {
    ev.stopPropagation();
    prefs.reducedMotion = !prefs.reducedMotion; savePrefs(); syncSettings(); buzz('light');
  });
  applySound();
  syncSettings();

  function togglePause() {
    if (R.state !== 'play') return;
    paused = !paused;
    el.pause.style.display = paused ? 'flex' : 'none';
  }
  el.pause.addEventListener('click', () => togglePause());

  function tapStart() {
    audio.ensure();
    if (R.state === 'play') return;
    el.attract.style.display = 'none';
    el.gameover.style.display = 'none';
    submitted = false;
    R.startGame();
  }
  el.attract.addEventListener('click', tapStart);
  el.gameover.addEventListener('click', tapStart);

  // ---------- time FX (hit-stop + slow-mo) ----------
  let hitStopT = 0, slowT = 0;
  const hitStop = (t) => { if (!prefs.reducedMotion) hitStopT = Math.max(hitStopT, t); };
  const slowMo = (t) => { if (!prefs.reducedMotion) slowT = Math.max(slowT, t); };

  // pop colors matched to table zones
  function popColor(id) {
    if (!id) return '#eafcff';
    if (id.indexOf('rampKelp') === 0 || id.indexOf('ink') === 0) return '#7dffb0';
    if (id.indexOf('rampVent') === 0) return '#ff9a3c';
    if (id.indexOf('rampMaw') === 0 || id === 'pearl') return '#ff9ad5';
    if (id.indexOf('bumper') === 0) return '#7dfce0';
    if (id.indexOf('abyss') === 0) return '#ffd23c';
    return '#eafcff';
  }

  // ---------- juice routing from audio events (event -> effects map) ----------
  // Feel identity: "fluid, luminous, weightless" — water-drift easing, soft
  // bioluminescent puffs, bubble-rising pops, the table rocks instead of jerking.
  function fxFor(a) {
    switch (a.name) {
      case 'bumper':
        if (a.x !== undefined) {
          renderer.burst(a.x, a.y, '#7dfce0', 8, 150); // plankton puff
          renderer.burst(a.x, a.y, '#4ce0e0', 5, 110);
        }
        buzz('light', 90);
        break;
      case 'sling':
        renderer.shake(0.12);
        buzz('light', 120);
        break;
      case 'flipper':
        buzz('flip', 140);
        break;
      case 'jackpot':
        renderer.burst(200, 300, '#ffd23c', 26, 260);
        renderer.flash('#ffd23c', 0.22);
        renderer.shake(0.3);
        hitStop(0.06);
        buzz('success');
        break;
      case 'megaJackpot':
        renderer.burst(200, 300, '#ffd23c', 44, 340);
        renderer.burst(300, 210, '#ff9ad5', 26, 260);
        renderer.flash('#ffe9a8', 0.3);
        renderer.shake(0.55);
        hitStop(0.09);
        buzz('success');
        break;
      case 'wizardStart':
      case 'multiballStart':
        renderer.shake(0.5);
        renderer.flash('#ff4ce0', 0.2);
        renderer.burst(315, 330, '#ff4ce0', 30, 300);
        hitStop(0.08);
        buzz('success');
        break;
      case 'multiballEnd':
        buzz('light');
        break;
      case 'addABall':
      case 'extraBall':
        renderer.burst(200, 455, '#7dffb0', 24, 240);
        buzz('success');
        break;
      case 'tiltWarning':
        renderer.shake(0.25);
        buzz('warning');
        break;
      case 'tilt':
        renderer.shake(1);
        renderer.flash('#ff5b5b', 0.25);
        buzz('warning');
        break;
      case 'lock':
        renderer.burst(345, 320, '#ff5b5b', 20, 220);
        renderer.shake(0.3);
        buzz('medium');
        break;
      case 'lockLit':
        buzz('light');
        break;
      case 'drain':
        renderer.burst(200, 760, '#4ce0e0', 8, 120);
        buzz('error');
        break;
      case 'ballSave':
        slowMo(0.7); // weightless dip as the save catches the ball
        renderer.flash('#7dffb0', 0.12);
        buzz('light');
        break;
      case 'kickback':
        renderer.burst(55, 700, '#39d97e', 16, 220);
        renderer.shake(0.2);
        buzz('medium');
        break;
      case 'plunge':
        renderer.burst(370, 690, '#ff9a3c', 10, 160);
        renderer.plungerKick = 1;
        break;
      case 'pearl':
        renderer.burst(300, 210, '#ffd9f2', 12, 200);
        buzz('light', 120);
        break;
      case 'bash':
        renderer.burst(300, 210, '#ff9ad5', 14, 220);
        renderer.shake(0.2);
        buzz('medium');
        break;
      case 'modeStart':
        buzz('light');
        break;
      case 'modeComplete':
        renderer.burst(200, 400, '#7dffb0', 26, 280);
        renderer.flash('#7dffb0', 0.15);
        buzz('success');
        break;
      case 'combo':
        buzz('medium', 200);
        break;
      case 'nudge':
        buzz('light', 200);
        break;
      case 'magnetGrab':
        renderer.burst(200, 310, '#e07dff', 14, 180);
        buzz('medium');
        break;
      case 'magnetFling':
        buzz('light');
        break;
    }
  }

  // ---------- arcade + AI ----------
  function arcadeName() {
    try { return localStorage.getItem('arcade_name') || 'diver'; }
    catch (e) { return 'diver'; }
  }
  function submitScore(score) {
    try {
      fetch('https://gamez-arcade.chaoticutopia84.workers.dev/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: 'neon-depths', name: arcadeName(), score: Math.round(score) }),
      }).catch(() => {});
    } catch (e) {}
  }
  let tauntCooldown = 0;
  function fetchTaunt(t) {
    const now = performance.now();
    if (now - tauntCooldown < 25000) return;
    tauntCooldown = now;
    try {
      fetch('https://gamez-ai.chaoticutopia84.workers.dev/g', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'krakentaunt', game: 'neon-depths', ctx: t }),
      }).then(r => r.json()).then(j => {
        const line = j && (j.text || j.line);
        if (line) {
          el.taunt.textContent = '🦑 ' + String(line).slice(0, 90);
          el.taunt.style.opacity = '1';
          setTimeout(() => { el.taunt.style.opacity = '0'; }, 5000);
        }
      }).catch(() => {});
    } catch (e) {}
  }

  // ---------- HUD ----------
  let hudT = 0;
  function updateHUD(dt, snap) {
    hudT -= dt;
    if (hudT > 0) return;
    hudT = 0.1;
    el.score.textContent = fmt(snap.score);
    let pips = '';
    for (let i = 1; i <= snap.ballsPerGame; i++) pips += i < snap.ball ? '·' : i === snap.ball ? '●' : '○';
    el.balls.textContent = pips;
    el.depthFill.style.height = Math.min(100, snap.depthM / 11000 * 100) + '%';
    el.depthLabel.textContent = Math.round(snap.depthM) + 'm';
    if (snap.ballSaveT > 0) {
      el.saveWrap.style.display = 'block';
      el.saveFill.style.width = Math.min(100, snap.ballSaveT / 40 * 100) + '%';
    } else el.saveWrap.style.display = 'none';
    el.tiltFill.style.width = Math.min(100, snap.tilt * 100) + '%';
    el.tiltFill.style.background = snap.tilt > 0.66 ? '#ff5b5b' : '#ffd23c';
    // manual-plunge prompt: ball waiting in the lane, no auto-launch coming
    const wantPlunge = snap.state === 'play' && R.autoPlungeT <= 0 &&
      sim.balls.some(b => b.x > 356 && b.y > 600);
    el.plungeHint.style.display = wantPlunge ? 'block' : 'none';
    el.combo.textContent = snap.combo >= 2 ? 'COMBO x' + snap.combo : '';
    // banner
    const b = snap.banner;
    const bid = b ? b.main + '|' + b.sub : null;
    if (bid !== bannerId) {
      bannerId = bid;
      if (b) {
        el.bannerMain.textContent = b.main;
        el.bannerSub.textContent = b.sub || '';
        el.banner.style.opacity = '1';
      } else el.banner.style.opacity = '0';
    }
    // game over overlay
    if (snap.state === 'gameover' && el.gameover.style.display !== 'flex') {
      el.finalScore.textContent = fmt(snap.score) + ' pts';
      if (snap.score > best) {
        best = Math.round(snap.score);
        try { localStorage.setItem('neon-depths-best', String(best)); } catch (e) {}
      }
      el.bestScore.textContent = 'best: ' + fmt(best);
      el.gameover.style.display = 'flex';
      if (!submitted) { submitted = true; submitScore(snap.score); }
    }
  }

  // ---------- main loop ----------
  const STEP = 1 / 60;
  let acc = 0, last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!running || paused) return;
    // keyboard plunger charge
    if (keyPlunger && R.state === 'play') {
      keyCharge = Math.min(1, keyCharge + dt * 1.1);
      renderer.plungerCharge = keyCharge;
    }
    // hit-stop: freeze the sim briefly on big impacts (still renders).
    // slow-mo: dip to 0.35x while the ball save catches the ball.
    if (hitStopT > 0) { hitStopT -= dt; acc = 0; }
    else {
      slowT = Math.max(0, slowT - dt);
      acc += dt * (slowT > 0 ? 0.35 : 1);
      let n = 0;
      while (acc >= STEP && n < 5) {
        sim.step(STEP);
        T.update(STEP);
        R.update(STEP);
        acc -= STEP; n++;
      }
      if (n >= 5) acc = 0;
    }
    for (const a of R.takeAudio()) { audio.play(a.name, a); fxFor(a); }
    for (const t of R.takeAi()) fetchTaunt(t);
    // floating score pops (bubble-rise, zone-colored)
    for (const p of R.takePops()) {
      const sp = T.shots[p.id];
      if (sp) renderer.pop(sp.x, sp.y, '+' + fmt(p.pts), popColor(p.id));
    }
    // fastest ball speed for the roll loop
    let sp = 0;
    for (const b of sim.balls) {
      const s = Math.hypot(b.vx, b.vy);
      if (s > sp) sp = s;
    }
    const snap = R.snapshot();
    audio.update(dt, {
      ballSpeed: sp,
      mode: !!(snap.mode && snap.mode.id !== 'leviathan'),
      multiball: snap.multiball,
      wizard: !!(snap.mode && snap.mode.id === 'leviathan'),
      hurry: !!(snap.mode && snap.mode.id === 'vent'),
      depthM: snap.depthM,
    });
    renderer.render(dt, snap);
    updateHUD(dt, snap);
  }

  function resize() { renderer.resize(); }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();
  requestAnimationFrame(frame);
})();
