/* Skyline Sparrow — ui.js
   Wiring: fixed-timestep loop, input, camera, screens, saves, leaderboard,
   AI client. The sim decides; this file reacts. UMD-ish (browser). */
(function () {
'use strict';

var SS = window.SS, SSGen = window.SSGen, SSFeel = window.SSFeel,
    SSRender = window.SSRender, SSAudio = window.SSAudio;
SS.setGen(SSGen);

var BUILD = 'v20261011a';
var STEP = 1 / 60;
var AI_BASE = 'https://gamez-ai.chaoticutopia84.workers.dev';
var ARCADE_BASE = 'https://gamez-arcade.chaoticutopia84.workers.dev';

/* ================= saves (schema v1) ================= */
var SAVE_KEY = 'ss_save_v1';
function blankSave() {
  return { v: 1, best: { score: 0, dist: 0, tape: null },
    settings: { mute: false, calm: false },
    ai: { rival: null, tales: {} }, daily: { date: '', best: 0 } };
}
function loadSave() {
  var s = blankSave();
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return s;
    var d = JSON.parse(raw);
    if (d && typeof d === 'object') {
      if (d.v === 1) {
        if (d.best) s.best = d.best;
        if (d.settings) s.settings = Object.assign(s.settings, d.settings);
        if (d.ai) s.ai = d.ai;
        if (d.daily) s.daily = d.daily;
      }
      // forward-only: unknown future versions keep their best/settings if shape matches
    }
  } catch (e) { /* corrupted/private-mode: start blank, never crash */ }
  return s;
}
var save = loadSave();
var saveTimer = null;
function flushSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }
  catch (e) { /* quota/private: keep write-through memory copy */ }
}
function queueSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(function () { saveTimer = null; flushSave(); }, 2000);
}

/* ================= dom ================= */
function $(id) { return document.getElementById(id); }
var canvas = $('game'), renderer = new SSRender.Renderer(canvas);
var feel = new SSFeel.Feel();
SSAudio.loadMuted();
if (save.settings.mute) SSAudio.setMuted(true);
feel.setEnabled(!save.settings.calm);

/* ================= game state ================= */
var st = null;           // sim state
var mode = 'menu';       // menu | play | over | paused
var cam = { x: 0, y: 0 };
var acc = 0, lastTs = 0, rafId = 0;
var runSeed = 1, isDaily = false;
var rivalShown = null;

function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function startRun(seed, daily) {
  runSeed = seed; isDaily = !!daily;
  st = SS.newRun(seed, {});
  st.viewW = renderer.W; st.viewH = renderer.H;
  if (save.best.tape && save.best.tape.length > 4) SS.attachGhost(st, save.best.tape);
  cam.x = st.player.x - renderer.W * 0.35;
  cam.y = st.player.y - renderer.H * 0.55;
  feel.reset(); feel.setEnabled(!save.settings.calm);
  acc = 0;
  showScreen('play');
  mode = 'play';
}

/* ================= input: pointerdown = jump, never release ================= */
var pointerDown = false;
canvas.addEventListener('pointerdown', function (e) {
  e.preventDefault();
  SSAudio.ensure(); // gesture-gated
  if (mode !== 'play' || !st || st.over) return;
  pointerDown = true;
  SS.pressJump(st);          // sim buffers; confirms on next tick
  feel.squashJump();         // optimistic visual on the input frame
  SSAudio.SFX.jump();
});
window.addEventListener('pointerup', function () {
  pointerDown = false;
  if (mode === 'play' && st && !st.over) SS.releaseJump(st);
});
window.addEventListener('pointercancel', function () {
  pointerDown = false;
  if (mode === 'play' && st && !st.over) SS.releaseJump(st);
});
document.addEventListener('visibilitychange', function () {
  if (document.hidden && mode === 'play') {
    mode = 'paused';
    showScreen('paused');
  }
});

/* ================= main loop: fixed timestep + render interpolation ================= */
function frame(ts) {
  rafId = requestAnimationFrame(frame);
  if (!lastTs) lastTs = ts;
  var dtRaw = Math.min(0.1, (ts - lastTs) / 1000);
  lastTs = ts;
  if (mode !== 'play' || !st) { renderMenu(ts); return; }

  if (!feel.inHitstop()) {
    acc += dtRaw * feel.timeScale();
    var n = 0;
    while (acc >= STEP && n < 5) { SS.step(st, STEP); acc -= STEP; n++; }
    if (n === 5) acc = 0; // spiral-of-death guard
  }
  var alpha = acc / STEP;

  // events -> feel + audio (after commit; feel never decides gameplay)
  var evs = st.events;
  for (var i = 0; i < evs.length; i++) onEvent(evs[i]);
  SS.clearEvents(st);

  // camera: lookahead = vx * 0.35s clamped, ~65% of screen ahead, lerp + deadzone
  var p = st.player;
  var look = Math.max(0, Math.min(120, st.speed * 0.35));
  var tx = p.x - renderer.W * 0.35 + look;
  var ty = p.y - renderer.H * 0.55;
  var k = Math.min(1, dtRaw * 8);
  cam.x += (tx - cam.x) * k;
  var dy = ty - cam.y;
  if (Math.abs(dy) > 40) cam.y += (dy - (dy > 0 ? 40 : -40)) * Math.min(1, dtRaw * 5);

  feel.updateSquash(dtRaw);
  feel.updateParts(dtRaw);
  var sh = feel.shakeOffset(dtRaw);
  if (feel.flash > 0) feel.flash = Math.max(0, feel.flash - dtRaw * 3);

  var rcam = { x: cam.x, y: cam.y };
  // apply shake delta into a scratch cam (offset subtraction already handled in feel)
  renderer.draw(st, feel, { x: cam.x - sh.dx, y: cam.y - sh.dy }, alpha, null);
  drawHUD();

  if (st.over && mode === 'play') onDeath();
}

function onEvent(e) {
  switch (e.t) {
    case 'jump': feel.squashJump(); break;
    case 'walljump':
      feel.squashJump(); feel.burst(e.x, e.y, 8, '#4de3ff', 160, 300, 4);
      SSAudio.SFX.walljump(); break;
    case 'land':
      feel.squashLand(e.hard);
      if (e.hard) { feel.addTrauma(0.25); feel.burst(e.x, e.y + 18, 6, '#cbb89a', 120, 500, 4); }
      SSAudio.SFX.land(e.hard); break;
    case 'feather':
      feel.burst(e.x, e.y, 10, '#f5ead2', 140, 200, 4);
      SSAudio.SFX.feather(e.n); break;
    case 'near':
      feel.hitstop(50); feel.addTrauma(0.18);
      feel.burst(e.x, e.y - 10, 8, '#ffe9a8', 180, 100, 4);
      SSAudio.SFX.near(e.combo); break;
    case 'bounce':
      feel.squashJump(); feel.addTrauma(0.2);
      feel.burst(e.x, e.y, 12, '#cfe4ff', 200, 200, 5);
      SSAudio.SFX.bounce(); break;
    case 'die':
      feel.hitstop(80); feel.addTrauma(0.9); feel.flashScreen('#ffffff', 0.7);
      feel.burst(e.x, e.y, 22, '#8a5a3a', 260, 600, 5);
      SSAudio.SFX.death(); break;
    case 'district':
      SSAudio.SFX.district(); break;
    case 'milestone':
      SSAudio.SFX.milestone();
      fetchTale(e.m); break;
  }
}

/* ================= HUD (atlas digits + cached text; no per-frame fillText) ================= */
function drawHUD() {
  var r = renderer, cx = r.cx;
  r.drawNum(String(st.score), 16, 14, 0.62, 'left', '#fff8ea');
  var sc = r.text('SCORE', 'bold 20px system-ui, sans-serif', 'rgba(255,248,234,0.75)');
  cx.drawImage(sc, 16, 44);
  r.drawNum(st.distM + 'm', r.W - 16, 14, 0.62, 'right', '#ffe9a8');
  if (st.feathers > 0) {
    cx.drawImage(r.sprites.feather, 16, 74, 30, 30);
    r.drawNum('x' + st.feathers, 52, 78, 0.5, 'left', '#f5ead2');
  }
  if (st.combo >= 2) {
    var cl = r.text('COMBO x' + st.combo, 'bold 26px system-ui, sans-serif', '#ffd34d');
    cx.drawImage(cl, r.W / 2 - cl.width / 2, 60);
  }
}

/* ================= screens ================= */
var screens = ['menu', 'play', 'over', 'paused'];
function showScreen(name) {
  screens.forEach(function (s) {
    var el = $('screen-' + s);
    if (el) el.classList.toggle('on', s === name);
  });
  var hud = $('hud');
  if (hud) hud.classList.toggle('hidden', name !== 'play');
  if (name === 'menu') renderMenuStatic();
  if (name === 'over') renderOver();
}

function renderMenuStatic() {
  // static menu art: pre-rendered text canvases, set once
  var r = renderer;
  var title = r.text('SKYLINE SPARROW', '900 44px system-ui, sans-serif', '#fff8ea');
  var sub = r.text('one tap to fly', 'italic 24px system-ui, sans-serif', 'rgba(255,248,234,0.8)');
  var best = r.text('BEST  ' + save.best.score + ' PTS', 'bold 22px system-ui, sans-serif', '#ffd34d');
  setImg('menu-title', title); setImg('menu-sub', sub); setImg('menu-best', best);
  var db = save.daily.date === todayStr() && save.daily.best > 0
    ? 'DAILY BEST  ' + save.daily.best + ' PTS' : 'DAILY RUN — same sky for everyone';
  setImg('menu-daily', r.text(db, 'bold 20px system-ui, sans-serif', '#9adcff'));
  renderRivalCard();
}
function setImg(id, canvas) {
  var el = $(id);
  el.innerHTML = '';
  el.appendChild(canvas);
}
function renderMenu(ts) {
  // gentle animated menu backdrop: slow drift through dawn
  var r = renderer, cx = r.cx;
  cx.drawImage(r.skyStrips[0], 0, 0, r.W, r.H);
  var t = (ts || 0) / 1000;
  r.tileLayer(r.bgLayers[0][0], t * 12, 0, r.W, r.H);
  r.tileLayer(r.bgLayers[0][1], t * 30, 0, r.W, r.H);
  // a lone sparrow gliding across
  var bx = r.W - ((t * 60) % (r.W + 200)) + 100;
  var by = r.H * 0.3 + Math.sin(t * 1.3) * 24;
  var spr = r.sprites.bird[Math.floor(t * 6) % 3];
  cx.drawImage(spr, bx - 26, by - 20, 52, 40);
}

/* ================= death / restart ================= */
function onDeath() {
  mode = 'over';
  var isBest = st.score > save.best.score;
  if (isBest) {
    save.best = { score: st.score, dist: st.distM, tape: st.tape.slice(0, 4000) };
    queueSave();
  }
  if (isDaily) {
    if (st.score > (save.daily.best || 0) && save.daily.date === todayStr()) {
      save.daily.best = st.score; queueSave();
    }
    postScore('daily', st.score);
  } else {
    postScore('score', st.score);
  }
  showScreen('over');
}
function renderOver() {
  var r = renderer;
  setImg('over-title', r.text(st.overCause === 'fall' ? 'LOST TO THE STREET' : 'CLIPPED!', '900 40px system-ui, sans-serif', '#fff8ea'));
  setImg('over-score', r.text(st.score + ' PTS', '900 54px system-ui, sans-serif', '#ffd34d'));
  var sub = st.score >= save.best.score && st.score > 0 ? 'NEW BEST!' : 'BEST  ' + save.best.score + ' PTS';
  setImg('over-best', r.text(sub, 'bold 24px system-ui, sans-serif', '#9adcff'));
  var stats = r.text(st.distM + 'm   ·   ' + st.feathers + ' feathers   ·   x' + st.bestCombo + ' combo',
    '20px system-ui, sans-serif', 'rgba(255,248,234,0.8)');
  setImg('over-stats', stats);
  // tale: fallback instantly, AI swaps in when it arrives (never blocks)
  var ms = highestMilestone();
  var taleEl = $('over-tale');
  taleEl.textContent = taleFallback(st.distM);
  var cached = save.ai.tales[todayStr() + ':' + ms];
  if (cached) taleEl.textContent = cached;
  else fetchTale(ms, function (txt) { if (txt && mode === 'over') taleEl.textContent = txt; });
}
function highestMilestone() {
  var ms = [500, 1500, 3000, 5000, 8000], best = 0;
  for (var i = 0; i < ms.length; i++) if (st && st.distM >= ms[i]) best = ms[i];
  return best;
}

/* ================= leaderboard ================= */
function postScore(board, score) {
  try {
    var name = (localStorage.getItem('arcade_name') || '').trim();
    if (!name || !score) return;
    fetch(ARCADE_BASE + '/score', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'skyline-sparrow', board: board, name: name, score: Math.floor(score) })
    }).catch(function () {});
  } catch (e) {}
}

/* ================= AI client (gamez-ai; enhancement only, never load-bearing) ================= */
function aiFetch(kind, payload, cb) {
  var done = false;
  var timer = setTimeout(function () { fin(null); }, 3000);
  function fin(t) { if (!done) { done = true; clearTimeout(timer); cb(t); } }
  try {
    fetch(AI_BASE + '/g', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: kind, game: 'skyline-sparrow', ctx: payload })
    }).then(function (r) { return r.json(); })
      .then(function (d) { fin(d && !d.error ? d : null); })
      .catch(function () { fin(null); });
  } catch (e) { fin(null); }
}
/* --- sparrowrival: daily rival, prefetched on menu --- */
var RIVAL_NAMES = ['Kestrel Jack', 'Mabel Swift', 'Old Corvus', 'Pippa Gale', 'Sergeant Talon', 'Wren'];
var RIVAL_QUIRKS = ['never misses a dawn patrol', 'once outflew a storm', 'collects shiny bottle caps', 'naps on warm chimneys', 'races the 6:15 ferry'];
var RIVAL_TAUNTS = ['Try to keep up, fledgling.', 'The sky is mine before seven.', 'I eat tailwinds for breakfast.', 'Last one to the docks buys the breadcrumbs.'];
function rivalFallback(seedStr) {
  var rng = SS.mulberry32(SS.hashSeed('rival' + seedStr));
  var pick = function (a) { return a[Math.floor(rng() * a.length)]; };
  return { name: pick(RIVAL_NAMES), personality: pick(RIVAL_QUIRKS), taunt: pick(RIVAL_TAUNTS) };
}
function fetchRival() {
  var date = todayStr();
  if (save.ai.rival && save.ai.rival.date === date) { renderRivalCard(); return; }
  renderRivalCard(); // instant fallback render
  aiFetch('sparrowrival', { date: date }, function (d) {
    var ok = d && d.name && d.personality && d.taunt;
    function retryOnce() {
      aiFetch('sparrowrival', { date: date, retry: 1 }, function (d2) {
        var ok2 = d2 && d2.name && d2.personality && d2.taunt;
        if (ok2) storeRival(d2); // else keep fallback; silent
      });
    }
    if (ok) storeRival(d); else retryOnce();
  });
  function storeRival(d) {
    save.ai.rival = { date: date, data: { name: String(d.name).slice(0, 24), personality: String(d.personality).slice(0, 90), taunt: String(d.taunt).slice(0, 90) } };
    queueSave();
    if (mode === 'menu') renderRivalCard();
  }
}
function renderRivalCard() {
  var date = todayStr();
  var r = (save.ai.rival && save.ai.rival.date === date) ? save.ai.rival.data : rivalFallback(date);
  rivalShown = r;
  $('rival-name').textContent = "Today's rival: " + r.name;
  $('rival-text').textContent = r.personality.charAt(0).toUpperCase() + r.personality.slice(1) + '. "' + r.taunt + '"';
}
/* --- sparrowtale: milestone story snippets --- */
var TALE_BITS = [
  ['the chimneys exhaled their first smoke', 'a cat watched from a fire escape, unimpressed'],
  ['the neon signs buzzed awake below', 'your shadow raced you across a billboard'],
  ['rain hammered the tar paper', 'the wind tried to steal your tail feathers'],
  ['the harbor bells counted seven', 'a ferry horn answered your chirp'],
  ['the sun cleared the water tower', 'the whole sky belonged to whoever was fastest']
];
function taleFallback(distM) {
  var rng = SS.mulberry32(SS.hashSeed('tale' + todayStr() + ':' + distM));
  var b = TALE_BITS[Math.floor(rng() * TALE_BITS.length)];
  return 'At ' + distM + ' meters, ' + b[0] + ', and ' + b[1] + '.';
}
function fetchTale(m, cb) {
  var date = todayStr(), key = date + ':' + m;
  if (save.ai.tales[key]) { if (cb) cb(save.ai.tales[key]); return; }
  aiFetch('sparrowtale', { date: date, milestone: m }, function (d) {
    var txt = d && d.text && d.text.length >= 20 ? String(d.text).slice(0, 220) : null;
    if (txt) {
      save.ai.tales[key] = txt;
      // cap stored tales
      var keys = Object.keys(save.ai.tales);
      if (keys.length > 12) delete save.ai.tales[keys[0]];
      queueSave();
    }
    if (cb) cb(txt);
  });
}

/* ================= buttons ================= */
function bindUI() {
  $('btn-start').addEventListener('click', function () {
    SSAudio.ensure(); SSAudio.SFX.ui();
    startRun((Math.random() * 1e9) | 0, false);
  });
  $('btn-daily').addEventListener('click', function () {
    SSAudio.ensure(); SSAudio.SFX.ui();
    if (save.daily.date !== todayStr()) save.daily = { date: todayStr(), best: 0 };
    startRun(SS.hashSeed('skyline-' + todayStr()), true);
  });
  $('btn-again').addEventListener('click', function () {
    SSAudio.ensure(); SSAudio.SFX.ui();
    startRun(isDaily ? SS.hashSeed('skyline-' + todayStr()) : ((Math.random() * 1e9) | 0), isDaily);
  });
  $('btn-menu').addEventListener('click', function () {
    SSAudio.SFX.ui(); mode = 'menu'; showScreen('menu'); fetchRival();
  });
  $('btn-resume').addEventListener('click', function () {
    SSAudio.SFX.ui(); mode = 'play'; showScreen('play'); lastTs = 0;
  });
  $('btn-mute').addEventListener('click', function () {
    var m = !SSAudio.isMuted();
    SSAudio.setMuted(m); save.settings.mute = m; queueSave();
    $('btn-mute').textContent = m ? 'SOUND OFF' : 'SOUND ON';
  });
  $('btn-calm').addEventListener('click', function () {
    var c = !save.settings.calm;
    save.settings.calm = c; feel.setEnabled(!c); queueSave();
    $('btn-calm').textContent = c ? 'CALM MODE ON' : 'CALM MODE OFF';
  });
  $('btn-pause').addEventListener('click', function () {
    if (mode === 'play') { mode = 'paused'; showScreen('paused'); }
  });
  if (SSAudio.isMuted()) $('btn-mute').textContent = 'SOUND OFF';
  if (save.settings.calm) $('btn-calm').textContent = 'CALM MODE ON';
  var tag = $('build-tag');
  if (tag) tag.textContent = BUILD;
}

/* ================= boot ================= */
function resize() {
  var w = window.innerWidth, h = window.innerHeight;
  renderer.resize(w, h);
  if (st) { st.viewW = w; st.viewH = h; }
}
window.addEventListener('resize', resize);

function boot() {
  renderer.buildSprites();
  resize();
  bindUI();
  showScreen('menu');
  mode = 'menu';
  fetchRival(); // prefetch during the natural menu wait
  lastTs = 0;
  rafId = requestAnimationFrame(frame);
}

/* ================= test hooks ================= */
window.__sparrow = {
  BUILD: BUILD,
  state: function () { return st; },
  mode: function () { return mode; },
  jump: function () { if (st && mode === 'play') SS.pressJump(st); },
  release: function () { if (st && mode === 'play') SS.releaseJump(st); },
  step: function (n) { if (!st) return; for (var i = 0; i < (n || 1); i++) SS.step(st, STEP); },
  newRun: function (seed) { startRun(typeof seed === 'number' ? seed : 7, false); return st; },
  forceFeather: function () {
    if (!st) return false;
    // find the chunk containing the player (not the last generated one)
    var c = st.chunks[0];
    for (var i = 0; i < st.chunks.length; i++) {
      if (st.player.x >= st.chunks[i].x0 && st.player.x < st.chunks[i].x0 + st.chunks[i].w) { c = st.chunks[i]; break; }
    }
    // place just ahead of the beak so the next sim step collects it
    var f = { x: st.player.x + 30 - c.x0, y: st.player.y, wx: st.player.x + 30, taken: false };
    c.feats.push(f);
    return true;
  },
  forceDeath: function () { if (st) { st.player.y = (st.killY || 1400) + 10; } },
  seed: function () { return runSeed; }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
