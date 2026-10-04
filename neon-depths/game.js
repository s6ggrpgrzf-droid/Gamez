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
    pause: $('pause-overlay'), taunt: $('taunt'),
    nudgeL: $('nudge-left'), nudgeR: $('nudge-right'),
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
  let plungerStartY = 0, plungerCharge = 0, plungerActive = false;
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
    if (p.x > 340 && p.y > 560 && ballInLane()) {
      pointers.set(ev.pointerId, 'plunger');
      plungerActive = true; plungerStartY = p.y; plungerCharge = 0;
      canvas.setPointerCapture(ev.pointerId);
    } else if (p.x < 200) {
      pointers.set(ev.pointerId, 'left');
      sim.setFlipper('left', true);
    } else {
      pointers.set(ev.pointerId, 'right');
      sim.setFlipper('right', true);
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
      if (R.state === 'play' && ballInLane() && plungerCharge > 0.03) T.plunge(plungerCharge);
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
    if (k === 'z' || k === 'arrowleft') { keys.add('left'); sim.setFlipper('left', true); }
    else if (k === '/' || k === 'arrowright') { keys.add('right'); sim.setFlipper('right', true); }
    else if (k === 'arrowdown' || k === ' ') { keyPlunger = true; keyCharge = 0; }
    else if (k === 'q') sim.nudge(-1, 0);
    else if (k === 'e') sim.nudge(1, 0);
    else if (k === 'm') toggleMute();
    else if (k === 'p') togglePause();
  });
  window.addEventListener('keyup', (ev) => {
    const k = ev.key.toLowerCase();
    if (k === 'z' || k === 'arrowleft') { keys.delete('left'); sim.setFlipper('left', false); }
    else if (k === '/' || k === 'arrowright') { keys.delete('right'); sim.setFlipper('right', false); }
    else if ((k === 'arrowdown' || k === ' ') && keyPlunger) {
      keyPlunger = false;
      if (R.state === 'play' && ballInLane() && keyCharge > 0.03) T.plunge(keyCharge);
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
      if (R.state === 'play') sim.nudge(dx, 0);
    });
  }
  bindNudge(el.nudgeL, -1);
  bindNudge(el.nudgeR, 1);

  function toggleMute() {
    audio.ensure();
    audio.setMuted(!audio.muted);
    el.mute.textContent = audio.muted ? '🔇' : '🔊';
  }
  el.mute.addEventListener('click', (ev) => { ev.stopPropagation(); toggleMute(); });
  el.mute.textContent = audio.muted ? '🔇' : '🔊';

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

  // ---------- juice routing from audio events ----------
  function fxFor(a) {
    switch (a.name) {
      case 'bumper':
        if (a.x !== undefined) renderer.burst(a.x, a.y, '#4ce0e0', 10, 180);
        break;
      case 'jackpot':
        renderer.burst(200, 300, '#ffd23c', 22, 260);
        renderer.shake(0.25);
        break;
      case 'megaJackpot':
        renderer.burst(200, 300, '#ffd23c', 40, 340);
        renderer.burst(300, 210, '#e07dff', 24, 260);
        renderer.shake(0.6);
        break;
      case 'wizardStart':
      case 'multiballStart':
        renderer.shake(0.5);
        renderer.burst(315, 330, '#ff4ce0', 30, 300);
        break;
      case 'tilt':
        renderer.shake(1);
        break;
      case 'lock':
        renderer.burst(345, 320, '#ff5b5b', 20, 220);
        renderer.shake(0.3);
        break;
      case 'drain':
        renderer.burst(200, 760, '#4ce0e0', 8, 120);
        break;
      case 'plunge':
        renderer.burst(370, 690, '#ff9a3c', 10, 160);
        break;
      case 'pearl':
        renderer.burst(300, 210, '#ffd9f2', 12, 200);
        break;
      case 'modeComplete':
        renderer.burst(200, 400, '#7dffb0', 26, 280);
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
      fetch('https://gamez-ai.chaoticutopia84.workers.dev/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ kind: 'krakentaunt' }, t)),
      }).then(r => r.json()).then(j => {
        if (j && j.line) {
          el.taunt.textContent = '🦑 ' + j.line;
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
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      sim.step(STEP);
      T.update(STEP);
      R.update(STEP);
      acc -= STEP; n++;
    }
    if (n >= 5) acc = 0;
    for (const a of R.takeAudio()) { audio.play(a.name, a); fxFor(a); }
    for (const t of R.takeAi()) fetchTaunt(t);
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
