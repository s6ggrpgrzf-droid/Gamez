/* =====================================================================
 * Fairway Rivals — game.js
 * "You're in a televised golf duel." Every screen is a versus broadcast.
 *
 * SCENE SPLIT (index.html script order):
 *   config.js, sim.js, audio.js, art.js, game.js, duel.js
 * game.js  = shell: save, feel hub, broadcast chrome, menu, versus,
 *            results, bag, chest, quests, match orchestration.
 * duel.js  = loaded AFTER game.js: Duel + Rival-turn + Shootout scenes
 *            (global FRDuel). game.js calls FRDuel.start()/shootout().
 * If duel.js lags, menu/bag/results still boot; duel shows a loader.
 *
 * Deps: FR (sim.js, CONTRACT.md), CFG-ish tunables below (config.js is
 * sibling-owned; FRCFG palette/buildTag are read when present),
 * AU.sfx/AU.music (guarded), ART.preText (guarded, label cache fallback).
 * ===================================================================== */
(function () {
'use strict';

/* ---------------- utils ---------------- */
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function $(id) { return document.getElementById(id); }
function el(tag, cls, html) {
  var d = document.createElement(tag);
  if (cls) d.className = cls;
  if (html != null) d.innerHTML = html;
  return d;
}
function fmtInt(n) { return Math.round(n).toString(); }

/* ---------------- tunables (config.js is sibling-owned; FRCFG read-only) ---------------- */
var FRCFG = window.FRCFG || {};
var PAL = FRCFG.palette || {
  fairway: '#2e7d3f', rough: '#256b34', green: '#3da34d', sand: '#e6cf8e',
  water: '#2f7ba3', white: '#ffffff', gold: '#ffd23f', navy: '#0d2b52',
  red: '#c0392b', blue: '#2471a3', ink: '#0a1a12', treeDark: '#1d4d28', treeLite: '#4da55c'
};
var TUNE = {
  buildTag: 'v20261012a',   // task-mandated visible build tag (FRCFG's differs; ours wins here)
  dprCap: 2,
  shotClockSec: 30,
  maxStrokes: 8,
  thinkMin: 1400, thinkMax: 3400,   // compressed TV pacing of FR.botShot thinkMs
  coinStart: 500, winCoins: 120,
  pinChestHoles: 7,
  ballCaps: { ember: 20, frost: 20, volt: 20 },
  balls: [
    { id: 'standard', name: 'Standard', desc: 'Trusty and true.', unlimited: true, mods: {} },
    { id: 'ember', name: 'Ember', desc: '+20% power, −20% wind.', mods: { power: 0.20, wind: -0.20 } },
    { id: 'frost', name: 'Frost', desc: '+30% backspin bite.', mods: { spin: 0.30, power: -0.10 } },
    { id: 'volt', name: 'Volt', desc: '−35% wind drift.', mods: { wind: -0.35, power: -0.05 } }
  ],
  stages: [
    { name: 'SANDLOT', par: 3 }, { name: 'PAR-3 CIRCUIT', par: 3 },
    { name: 'COUNTRY CLUB', par: 4 }, { name: 'DOGLEG DOWNS', par: 4 },
    { name: 'WINDY PINES', par: 4 }, { name: 'CHAMPIONSHIP', par: 5 },
    { name: 'MAJOR LEAGUE', par: 5 }, { name: 'LEGENDS TOUR', par: 5 }
  ],
  quests: [
    { id: 'win1', text: 'Win a duel', reward: 100 },
    { id: 'birdie', text: 'Finish a hole under par', reward: 150 },
    { id: 'holes3', text: 'Play 3 holes', reward: 80 }
  ],
  bots: [
    { name: 'Chip Mulligan', skill: 0.35, style: 'cocky' },
    { name: 'Sandy Lyle', skill: 0.45, style: 'dry' },
    { name: 'Putter Pendragon', skill: 0.55, style: 'chivalrous' },
    { name: 'Divot Dan', skill: 0.62, style: 'goofy' },
    { name: 'Fairway Fox', skill: 0.70, style: 'smooth' },
    { name: 'Bogey Malone', skill: 0.78, style: 'noir' },
    { name: 'Albatross Al', skill: 0.86, style: 'legend' },
    { name: 'The Caddie', skill: 0.93, style: 'menace' }
  ],
  banter: {
    greet: ['Tee it high, let it fly.', 'May the best swing win.', 'I waxed my 7-iron for this.'],
    goodShot: ['Oh, that is PURE.', 'Textbook. Annoyingly textbook.', 'The crowd goes mild!'],
    badShot: ['The pond sends its regards.', 'Bold strategy. Wrong fairway.', 'Somewhere, a divot weeps.'],
    win: ['Rematch. Now.', 'I demand a recount of the wind.', 'You were the better golfer today. Today.'],
    lose: ['Another flawless victory.', 'They will write songs about that putt. Mine.'],
    emote_nice: ['Why thank you.', 'I know. I know.'],
    emote_wow: ['Right?!', 'I surprise even myself.'],
    emote_oops: ['Rude. Accurate, but rude.', 'The wind did that. Probably.']
  },
  emotes: [
    { id: 'nice', text: 'Nice shot!' }, { id: 'wow', text: 'Wow' }, { id: 'oops', text: 'Oops' }
  ],
  aiUrl: 'https://gamez-ai.chaoticutopia84.workers.dev'
};
var HAPTIC = { select: [10], strike: [25], perfect: [12, 40, 12], cup: [20, 60, 20], bad: [50] };

/* ---------------- guarded externals ---------------- */
function sfx(name, opts) {
  if (typeof AU !== 'undefined' && AU && typeof AU.sfx === 'function') {
    try { AU.sfx(name, opts); } catch (e) {}
  }
}
function music(on) {
  if (typeof AU !== 'undefined' && AU && typeof AU.music === 'function') {
    try { AU.music(on); } catch (e) {}
  }
}
function buzz(pattern) {
  try {
    if (S.settings.haptics && !S.settings.reduceMotion && navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) {}
}

/* ---------------- save (versioned) ---------------- */
var SAVE_KEY = 'fairway-rivals-save';
function defaultClubs() {
  var o = {};
  if (typeof FR !== 'undefined' && FR.CLUBS) FR.CLUBS.forEach(function (c) { o[c.id] = { lvl: 1, cards: 0 }; });
  return o;
}
function defaultSave() {
  return {
    v: 1, trophies: 0, coins: TUNE.coinStart,
    clubs: defaultClubs(),
    balls: { ember: 2, frost: 2, volt: 2 }, ballSel: 'standard',
    pinHoles: 0, chestsOpened: 0,
    record: { w: 0, l: 0, d: 0 }, history: [],
    quests: { date: '', done: {}, ticks: {} },
    tapes: {},
    settings: { music: true, sfx: true, haptics: true, reduceMotion: false },
    aiRivals: { date: '', names: [], lines: [] },
    name: 'YOU'
  };
}
var S = defaultSave();
function loadSave() {
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { S = defaultSave(); return; }
    var d = JSON.parse(raw);
    if (!d || d.v !== 1) { S = defaultSave(); return; }  // forward-only; unknown -> fresh
    var base = defaultSave();
    for (var k in base) if (d[k] === undefined) d[k] = base[k];
    // merge club map (new clubs from sim updates)
    for (var cid in base.clubs) if (!d.clubs[cid]) d.clubs[cid] = base.clubs[cid];
    S = d;
  } catch (e) { S = defaultSave(); }
}
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {}
}
function todayKey() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function questTick(id, n) {
  var q = S.quests;
  if (q.date !== todayKey()) { q.date = todayKey(); q.done = {}; q.ticks = {}; }
  q.ticks[id] = (q.ticks[id] || 0) + (n || 1);
  var need = id === 'holes3' ? 3 : 1;
  if (!q.done[id] && q.ticks[id] >= need) {
    q.done[id] = true;
    var def = TUNE.quests.filter(function (x) { return x.id === id; })[0];
    if (def) { S.coins += def.reward; pushHistory('QUEST +' + def.reward + ' coins'); }
  }
  save();
}

/* ---------------- Feel hub: one switch for all juice ---------------- */
var Feel = {
  enabled: true,
  trauma: 0, hitstop: 0, slowmo: 1, slowmoT: 0, flash: 0, flashColor: '#fff',
  shX: 0, shY: 0,
  addTrauma: function (t) { if (this.enabled && !S.settings.reduceMotion) this.trauma = Math.min(1, this.trauma + t); },
  hitStop: function (ms) { if (this.enabled && !S.settings.reduceMotion) this.hitstop = Math.max(this.hitstop, ms / 1000); },
  slowMo: function (scale, ms) {
    if (!this.enabled || S.settings.reduceMotion) return;
    this.slowmo = scale; this.slowmoT = ms / 1000;
  },
  doFlash: function (color) { if (this.enabled && !S.settings.reduceMotion) { this.flash = 0.16; this.flashColor = color || '#fff'; } },
  update: function (dt) {
    if (this.hitstop > 0) { this.hitstop -= dt; return 0; }  // frozen sim, still drawing
    if (this.slowmoT > 0) { this.slowmoT -= dt; if (this.slowmoT <= 0) this.slowmo = 1; }
    if (this.flash > 0) this.flash -= dt;
    var off = 14;
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - 2.2 * dt);
      var s = this.trauma * this.trauma * off;   // trauma-squared
      this.shX = (Math.random() * 2 - 1) * s;
      this.shY = (Math.random() * 2 - 1) * s;
    } else { this.shX = 0; this.shY = 0; }
    return dt * this.slowmo;
  },
  toggle: function () {
    this.enabled = !this.enabled;
    this.trauma = 0; this.hitstop = 0; this.slowmo = 1; this.flash = 0; this.shX = this.shY = 0;
    return this.enabled;
  }
};

/* ---------------- pre-rendered text cache (no per-frame fillText) ---------------- */
var labelCache = {};
function makeLabel(text, opt) {
  opt = opt || {};
  var key = text + '|' + (opt.size || 14) + '|' + (opt.fill || '#fff') + '|' + (opt.stroke || '') + '|' + (opt.weight || '');
  if (labelCache[key]) return labelCache[key];
  var c;
  if (typeof ART !== 'undefined' && ART && typeof ART.preText === 'function') {
    try { c = ART.preText(text, opt); } catch (e) { c = null; }
  }
  if (!c) {
    var size = opt.size || 14;
    c = document.createElement('canvas');
    var g = c.getContext('2d');
    g.font = (opt.weight || '700') + ' ' + size + 'px system-ui, sans-serif';
    var w = Math.ceil(g.measureText(text).width) + 12;
    c.width = w; c.height = size + 12;
    var g2 = c.getContext('2d');
    g2.font = (opt.weight || '700') + ' ' + size + 'px system-ui, sans-serif';
    g2.textBaseline = 'middle';
    if (opt.stroke) { g2.lineWidth = 3; g2.strokeStyle = opt.stroke; g2.strokeText(text, 6, c.height / 2); }
    g2.fillStyle = opt.fill || '#fff';
    g2.fillText(text, 6, c.height / 2);
  }
  if (Object.keys(labelCache).length > 400) labelCache = {};
  labelCache[key] = c;
  return c;
}

/* ---------------- CSS (scoped #fr-; injected so game.js boots on a bare body) ---------------- */
var CSS = [
'#fr-root{position:fixed;inset:0;background:#0b1026;color:#f6f1e3;font-family:system-ui,-apple-system,sans-serif;overflow:hidden;-webkit-user-select:none;user-select:none;touch-action:manipulation}',
'#fr-root .scene{position:absolute;inset:0;display:none;flex-direction:column}',
'#fr-root .scene.on{display:flex}',
'#fr-netbar{height:34px;flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:0 10px;background:linear-gradient(180deg,#141b40,#0b1026);border-bottom:1px solid rgba(245,197,66,.25);font-size:11px;letter-spacing:.12em;z-index:40}',
'.fr-live{color:#ff5a5a;animation:frblink 1.6s infinite}',
'@keyframes frblink{50%{opacity:.35}}',
'.fr-wordmark{font-weight:900;letter-spacing:.18em;color:#f5c542;font-size:12px}',
'.fr-build{margin-left:auto;color:#8a93b8;font-size:10px;letter-spacing:.08em}',
'.fr-gear{margin-left:6px;font-size:16px;background:none;border:none;color:#f6f1e3;min-width:44px;min-height:44px}',
/* ticker */
'#fr-ticker{flex:0 0 auto;height:30px;background:#080b1d;border-top:1px solid rgba(245,197,66,.25);overflow:hidden;position:relative;font-size:11px;letter-spacing:.06em}',
'#fr-ticker .tk-in{position:absolute;white-space:nowrap;line-height:30px;animation:frtick 28s linear infinite;color:#cdd5f5}',
'#fr-ticker .tk-in b{color:#f5c542}',
'@keyframes frtick{from{transform:translateX(100vw)}to{transform:translateX(-100%)}}',
/* menu: broadcast desk */
'#sc-menu{background:radial-gradient(120% 90% at 50% 0%,#1a2452 0%,#0b1026 60%,#070a1a 100%)}',
'.fr-matchup{margin:10px 12px 0;border:1px solid rgba(245,197,66,.35);border-radius:14px;overflow:hidden;background:rgba(13,18,44,.92)}',
'.fr-mu-head{padding:7px 12px;font-size:10px;letter-spacing:.22em;color:#f5c542;border-bottom:1px solid rgba(245,197,66,.2)}',
'.fr-mu-body{display:flex;align-items:stretch}',
'.fr-mu-side{flex:1;padding:12px;text-align:center}',
'.fr-mu-side.you{background:linear-gradient(135deg,rgba(36,113,163,.35),transparent)}',
'.fr-mu-side.riv{background:linear-gradient(225deg,rgba(192,57,43,.35),transparent)}',
'.fr-mu-name{font-weight:900;font-size:17px;letter-spacing:.04em}',
'.fr-mu-sub{font-size:10px;color:#9aa3c7;letter-spacing:.14em;margin-top:2px}',
'.fr-mu-rec{font-size:12px;margin-top:6px;color:#cdd5f5}',
'.fr-mu-rec b{color:#f5c542}',
'.fr-vs{align-self:center;font-weight:900;font-size:15px;color:#0b1026;background:radial-gradient(circle,#ffe9a8,#f5c542 70%);width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 18px rgba(245,197,66,.6);flex:0 0 auto}',
'.fr-sect{margin:12px 12px 0;font-size:10px;letter-spacing:.22em;color:#9aa3c7}',
'.fr-prog{display:flex;gap:10px;overflow-x:auto;padding:8px 12px 4px;-webkit-overflow-scrolling:touch}',
'.fr-card{flex:0 0 148px;border:1px solid rgba(245,197,66,.3);border-radius:12px;background:linear-gradient(180deg,#151c46,#0d1230);padding:12px 10px;min-height:118px;display:flex;flex-direction:column;justify-content:space-between}',
'.fr-card .k{font-size:9px;letter-spacing:.2em;color:#f5c542}',
'.fr-card .t{font-weight:900;font-size:15px;margin:4px 0}',
'.fr-card .d{font-size:11px;color:#9aa3c7;line-height:1.35}',
'.fr-card.dis{opacity:.45}',
'.fr-card:active{transform:scale(.97)}',
'.fr-stages{display:flex;gap:8px;overflow-x:auto;padding:8px 12px}',
'.fr-stage{flex:0 0 auto;font-size:10px;letter-spacing:.1em;padding:7px 11px;border-radius:20px;border:1px solid rgba(154,163,199,.4);color:#9aa3c7;white-space:nowrap}',
'.fr-stage.cur{border-color:#f5c542;color:#0b1026;background:#f5c542;font-weight:800}',
'.fr-stage.done{color:#37c26a;border-color:rgba(55,194,106,.5)}',
'.fr-quests{margin:4px 12px 0;display:flex;flex-direction:column;gap:6px}',
'.fr-quest{display:flex;align-items:center;gap:8px;font-size:12px;background:rgba(13,18,44,.8);border:1px solid rgba(154,163,199,.25);border-radius:10px;padding:8px 10px}',
'.fr-quest .rw{margin-left:auto;color:#f5c542;font-weight:800;font-size:11px}',
'.fr-quest.done{opacity:.55}.fr-quest.done .qt{text-decoration:line-through}',
/* versus splash */
'#sc-versus{background:#070a1a;justify-content:center}',
'.fr-vs-wrap{position:relative;flex:1;display:flex;overflow:hidden}',
'.fr-vs-panel{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:6px;transform:translateX(0);transition:transform .6s cubic-bezier(.2,.9,.25,1)}',
'.fr-vs-panel.l{background:linear-gradient(135deg,#123a5e,#0b1026 75%);border-right:2px solid #f5c542}',
'.fr-vs-panel.r{background:linear-gradient(225deg,#5e1a12,#0b1026 75%);border-left:2px solid #f5c542}',
'#sc-versus.pre .fr-vs-panel.l{transform:translateX(-102%)}',
'#sc-versus.pre .fr-vs-panel.r{transform:translateX(102%)}',
'.fr-vs-name{font-weight:900;font-size:24px;letter-spacing:.03em;text-align:center;padding:0 8px}',
'.fr-vs-tag{font-size:10px;letter-spacing:.24em;color:#f5c542}',
'.fr-vs-rec{font-size:13px;color:#cdd5f5}',
'.fr-vs-medal{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%) scale(0);width:74px;height:74px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffe9a8,#f5c542 65%,#c98f1b);color:#0b1026;font-weight:900;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 0 30px rgba(245,197,66,.8);transition:transform .45s cubic-bezier(.2,1.6,.4,1) .35s;z-index:3}',
'#sc-versus.go .fr-vs-medal{transform:translate(-50%,-50%) scale(1)}',
'.fr-course-card{position:absolute;left:12px;right:12px;bottom:86px;background:rgba(8,11,29,.94);border:1px solid rgba(245,197,66,.4);border-radius:12px;padding:10px 14px;display:flex;align-items:center;gap:10px;opacity:0;transform:translateY(14px);transition:all .4s ease .8s}',
'#sc-versus.go .fr-course-card{opacity:1;transform:none}',
'.fr-course-card .cc-k{font-size:9px;letter-spacing:.2em;color:#f5c542}',
'.fr-course-card .cc-t{font-weight:900;font-size:15px}',
'.fr-teeoff{position:absolute;left:0;right:0;bottom:34px;text-align:center;font-size:12px;letter-spacing:.3em;color:#f6f1e3;animation:frblink 1.4s infinite;opacity:0;transition:opacity .4s ease 1.1s}',
'#sc-versus.go .fr-teeoff{opacity:1}',
/* generic broadcast chrome */
'.fr-bug{position:absolute;top:44px;left:10px;z-index:20;background:rgba(8,11,29,.88);border:1px solid rgba(245,197,66,.35);border-radius:8px;padding:6px 10px;font-size:11px;letter-spacing:.08em;font-weight:700}',
'.fr-bug b{color:#f5c542}',
'.fr-chyron{position:absolute;left:10px;right:10px;bottom:186px;z-index:20;pointer-events:none;text-align:center}',
'.fr-chyron span{display:inline-block;background:rgba(8,11,29,.9);border-left:3px solid #f5c542;padding:8px 14px;font-size:13px;border-radius:0 8px 8px 0;max-width:92%}',
'.fr-banner{position:absolute;top:34%;left:0;right:0;z-index:30;text-align:center;pointer-events:none}',
'.fr-banner span{display:inline-block;background:rgba(8,11,29,.94);border:1px solid rgba(245,197,66,.5);color:#f5c542;font-weight:900;letter-spacing:.28em;font-size:15px;padding:12px 22px;border-radius:10px;animation:frblink 1.2s infinite}',
'.fr-lower3rd{position:absolute;left:0;right:0;bottom:0;z-index:30;background:linear-gradient(0deg,#070a1a 30%,transparent);padding:60px 16px 26px;text-align:center}',
'.fr-lower3rd .w{font-size:11px;letter-spacing:.3em;color:#f5c542}',
'.fr-lower3rd .t{font-size:30px;font-weight:900;margin:4px 0}',
'.fr-lower3rd .s{font-size:13px;color:#cdd5f5}',
/* results */
'#sc-results{background:radial-gradient(120% 90% at 50% 0%,#1a2452 0%,#0b1026 60%,#070a1a 100%);overflow-y:auto}',
'.fr-trophies{margin:14px auto 0;text-align:center}',
'.fr-trophies .n{font-size:44px;font-weight:900;color:#f5c542}',
'.fr-trophies .k{font-size:10px;letter-spacing:.26em;color:#9aa3c7}',
'.fr-chest{margin:14px 12px 0;border:1px dashed rgba(245,197,66,.5);border-radius:14px;padding:16px;text-align:center;background:rgba(13,18,44,.85)}',
'.fr-chest .cards{display:flex;gap:8px;justify-content:center;margin-top:10px;flex-wrap:wrap}',
'.fr-ccard{background:#1a2452;border:1px solid rgba(245,197,66,.4);border-radius:10px;padding:10px 12px;font-size:12px;min-width:86px;animation:frpop .4s cubic-bezier(.2,1.6,.4,1) backwards}',
'@keyframes frpop{from{transform:scale(.4) rotate(-8deg);opacity:0}}',
'.fr-ccard b{color:#f5c542;display:block;font-size:15px}',
'.fr-pin{margin:12px 12px 0;font-size:11px;letter-spacing:.1em;color:#9aa3c7}',
'.fr-pin .bar{height:8px;background:#1a2452;border-radius:5px;margin-top:6px;overflow:hidden}',
'.fr-pin .bar i{display:block;height:100%;background:linear-gradient(90deg,#c98f1b,#f5c542);border-radius:5px;transition:width .6s ease}',
'.fr-upnext{display:flex;gap:10px;padding:14px 12px}',
'.fr-btn{flex:1;min-height:52px;border-radius:12px;border:1px solid rgba(245,197,66,.5);background:linear-gradient(180deg,#f5c542,#c98f1b);color:#0b1026;font-weight:900;font-size:15px;letter-spacing:.1em}',
'.fr-btn.ghost{background:#1a2452;color:#f6f1e3}',
/* bag */
'#sc-bag{background:#0b1026}',
'.fr-baghead{display:flex;align-items:center;padding:10px 12px;gap:10px}',
'.fr-baghead .t{font-weight:900;font-size:16px;letter-spacing:.12em}',
'.fr-back{background:#1a2452;color:#f6f1e3;border:1px solid rgba(154,163,199,.4);border-radius:10px;min-width:44px;min-height:44px;font-size:16px}',
'.fr-cat{font-size:10px;letter-spacing:.24em;color:#f5c542;margin:12px 12px 6px}',
'.fr-club{margin:0 12px 8px;background:rgba(13,18,44,.9);border:1px solid rgba(154,163,199,.25);border-radius:12px;padding:10px 12px}',
'.fr-club .row1{display:flex;align-items:baseline;gap:8px}',
'.fr-club .nm{font-weight:800;font-size:14px}',
'.fr-club .lv{font-size:10px;color:#9aa3c7;letter-spacing:.14em}',
'.fr-club .stats{display:flex;gap:12px;font-size:11px;color:#9aa3c7;margin-top:6px}',
'.fr-club .stats b{color:#f6f1e3}',
'.fr-club .stats .up{color:#ffe45e;font-weight:800}',
'.fr-cbar{height:6px;background:#1a2452;border-radius:4px;margin-top:8px;overflow:hidden}',
'.fr-cbar i{display:block;height:100%;background:linear-gradient(90deg,#2471a3,#3fa7ff);border-radius:4px}',
'.fr-upbtn{margin-top:8px;width:100%;min-height:44px;border-radius:10px;border:1px solid rgba(245,197,66,.5);background:rgba(245,197,66,.12);color:#f5c542;font-weight:800;font-size:13px}',
'.fr-upbtn:disabled{opacity:.35}',
'.fr-ballrow{display:flex;gap:10px;overflow-x:auto;padding:6px 12px}',
'.fr-ball{flex:0 0 128px;border:1px solid rgba(154,163,199,.35);border-radius:12px;padding:10px;background:rgba(13,18,44,.9)}',
'.fr-ball.sel{border-color:#f5c542;box-shadow:0 0 12px rgba(245,197,66,.35)}',
'.fr-ball .nm{font-weight:800;font-size:13px}',
'.fr-ball .ds{font-size:10px;color:#9aa3c7;margin:4px 0;min-height:28px}',
'.fr-ball .ct{font-size:11px;color:#f5c542;font-weight:800}',
/* settings sheet */
'#fr-sheet{position:fixed;inset:0;z-index:60;background:rgba(4,6,16,.7);display:none;align-items:flex-end;justify-content:center}',
'#fr-sheet.on{display:flex}',
'.fr-sheet-in{background:#131a3a;border-radius:16px 16px 0 0;width:100%;max-width:480px;padding:18px 16px 30px}',
'.fr-trow{display:flex;align-items:center;gap:10px;padding:12px 4px;font-size:14px;border-bottom:1px solid rgba(154,163,199,.15)}',
'.fr-trow .sw{margin-left:auto;min-width:52px;min-height:44px;border-radius:22px;border:1px solid rgba(245,197,66,.5);background:#0b1026;color:#f5c542;font-weight:800}',
'.fr-trow .sw.on{background:#f5c542;color:#0b1026}',
'.fr-err{position:fixed;inset:0;z-index:99;background:#0b1026;color:#f6f1e3;display:flex;align-items:center;justify-content:center;padding:30px;text-align:center;font-size:14px;line-height:1.6}'
].join('\n');
var styleEl = document.createElement('style');
styleEl.textContent = CSS;
document.head.appendChild(styleEl);

/* ---------------- DOM shell ---------------- */
var root = $('fr-root');
if (!root) { root = el('div'); root.id = 'fr-root'; document.body.appendChild(root); }
var netbar = el('div'); netbar.id = 'fr-netbar';
netbar.innerHTML = '<span class="fr-live">●</span><span>FRN</span>' +
  '<span class="fr-wordmark">FAIRWAY RIVALS</span>' +
  '<span class="fr-build">' + TUNE.buildTag + '</span>' +
  '<button class="fr-gear" id="fr-gear" aria-label="Settings">⚙</button>';
root.appendChild(netbar);
var sceneWrap = el('div'); sceneWrap.id = 'fr-scenes';
sceneWrap.style.cssText = 'position:relative;flex:1;display:flex;flex-direction:column;min-height:0';
root.appendChild(sceneWrap);
root.style.display = 'flex'; root.style.flexDirection = 'column';
['menu', 'versus', 'duel', 'results', 'bag'].forEach(function (n) {
  var s = el('div'); s.className = 'scene'; s.id = 'sc-' + n; sceneWrap.appendChild(s);
});
var ticker = el('div'); ticker.id = 'fr-ticker';
ticker.innerHTML = '<div class="tk-in" id="fr-ticker-in"></div>';
root.appendChild(ticker);

function showScene(name) {
  ['menu', 'versus', 'duel', 'results', 'bag'].forEach(function (n) {
    $('sc-' + n).classList.toggle('on', n === name);
  });
  ticker.style.display = (name === 'menu' || name === 'results') ? '' : 'none';
  if (window.__fr) window.__fr.scene = name;
}

/* ---------------- broadcast chrome helpers ---------------- */
function pushHistory(text) {
  S.history.unshift(text);
  if (S.history.length > 10) S.history.length = 10;
  save(); renderTicker();
}
function renderTicker() {
  var tin = $('fr-ticker-in');
  if (!tin) return;
  var items = S.history.length ? S.history : ['<b>WELCOME TO FRN</b> — tonight: an exhibition duel under the lights'];
  tin.innerHTML = items.map(function (h) { return '★ ' + h; }).join('&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;');
}
function chyron(text, ms) {
  var c = $('fr-chyron');
  if (!c) return;
  c.innerHTML = '<span>' + text + '</span>';
  c.style.display = '';
  clearTimeout(chyron._t);
  if (ms) chyron._t = setTimeout(function () { c.style.display = 'none'; }, ms);
}
function banner(text, ms) {
  var b = $('fr-banner');
  if (!b) { b = el('div'); b.id = 'fr-banner'; b.className = 'fr-banner'; $('sc-duel').appendChild(b); }
  b.innerHTML = '<span>' + text + '</span>';
  b.style.display = '';
  clearTimeout(banner._t);
  if (ms) banner._t = setTimeout(function () { b.style.display = 'none'; }, ms);
}

/* ---------------- settings sheet ---------------- */
function buildSheet() {
  var sh = el('div'); sh.id = 'fr-sheet';
  sh.innerHTML = '<div class="fr-sheet-in"><div style="font-weight:900;letter-spacing:.14em;margin-bottom:6px">BROADCAST SETTINGS</div><div id="fr-trows"></div></div>';
  document.body.appendChild(sh);
  function row(label, key, fmt) {
    var r = el('div', 'fr-trow', '<span>' + label + '</span>');
    var b = el('button', 'fr-trow sw' + (S.settings[key] ? ' on' : ''), S.settings[key] ? 'ON' : 'OFF');
    b.className = 'sw';
    b.onclick = function () {
      S.settings[key] = !S.settings[key]; save();
      b.textContent = S.settings[key] ? 'ON' : 'OFF';
      b.classList.toggle('on', S.settings[key]);
      if (key === 'music') music(S.settings.music);
      buzz(HAPTIC.select);
    };
    r.appendChild(b);
    return r;
  }
  var box = sh.querySelector('#fr-trows');
  box.appendChild(row('Music', 'music'));
  box.appendChild(row('Sound effects', 'sfx'));
  box.appendChild(row('Haptics', 'haptics'));
  box.appendChild(row('Reduce motion', 'reduceMotion'));
  var fr = el('div', 'fr-trow', '<span>Feel effects</span>');
  var fb = el('button', 'sw' + (Feel.enabled ? ' on' : ''), Feel.enabled ? 'ON' : 'OFF');
  fb.onclick = function () { var v = Feel.toggle(); fb.textContent = v ? 'ON' : 'OFF'; fb.classList.toggle('on', v); };
  fr.appendChild(fb); box.appendChild(fr);
  sh.addEventListener('pointerdown', function (e) { if (e.target === sh) sh.classList.remove('on'); });
  $('fr-gear').onclick = function () { sfx('click'); sh.classList.add('on'); };
}

/* ---------------- MENU: broadcast desk ---------------- */
function stageIdx() { return (typeof FR !== 'undefined') ? FR.stageFor(S.trophies) : 0; }
function stageDef(i) { return TUNE.stages[Math.min(i, TUNE.stages.length - 1)]; }

function bestGhostLabel() {
  var st = stageIdx(), t = S.tapes[st];
  return t ? ('BEST ' + t.strokes + ' · ' + t.holeName) : 'NO TAPE YET';
}

function buildMenu() {
  var m = $('sc-menu');
  m.innerHTML = '';
  var st = stageIdx(), sd = stageDef(st);
  var rec = S.record;

  // TONIGHT'S MATCHUP — split-screen broadcast graphic (not a title+button stack)
  var mu = el('div', 'fr-matchup');
  mu.innerHTML =
    '<div class="fr-mu-head">TONIGHT&rsquo;S MATCHUP · ' + sd.name + ' · PAR ' + sd.par + '</div>' +
    '<div class="fr-mu-body">' +
    '<div class="fr-mu-side you"><div class="fr-mu-name">' + S.name + '</div>' +
    '<div class="fr-mu-sub">HOME FAVORITE</div>' +
    '<div class="fr-mu-rec"><b>' + rec.w + '</b>W · <b>' + rec.l + '</b>L · <b>' + rec.d + '</b>D</div>' +
    '<div class="fr-mu-rec"><span style="color:#ffd23f">★</span> <b>' + fmtInt(S.trophies) + '</b></div></div>' +
    '<div class="fr-vs">VS</div>' +
    '<div class="fr-mu-side riv"><div class="fr-mu-name" id="fr-rivname">???</div>' +
    '<div class="fr-mu-sub">— BOT · SEEDED</div>' +
    '<div class="fr-mu-rec">skill <b id="fr-rivskill">?</b></div></div>' +
    '</div>';
  m.appendChild(mu);

  // ON TONIGHT — programming cards (horizontal)
  m.appendChild(el('div', 'fr-sect', 'ON TONIGHT'));
  var prog = el('div', 'fr-prog');
  var ghostTape = S.tapes[st];
  var cards = [
    { k: 'LIVE · 8:00', t: 'QUICK DUEL', d: 'One hole. One rival. Winner takes the trophies.', id: 'btn-quick' },
    { k: 'REPLAY', t: 'GHOST ROUND', d: ghostTape ? 'Race your best tape: ' + ghostTape.strokes + ' strokes.' : 'No tape yet — win a duel to record one.', id: 'btn-ghost', dis: !ghostTape },
    { k: 'LOCKER ROOM', t: 'THE BAG', d: 'Clubs, upgrades, and your ball rack.', id: 'btn-bag' }
  ];
  cards.forEach(function (c) {
    var card = el('div', 'fr-card' + (c.dis ? ' dis' : ''),
      '<div class="k">' + c.k + '</div><div class="t">' + c.t + '</div><div class="d">' + c.d + '</div>');
    card.id = c.id;
    if (!c.dis) card.onclick = function () { sfx('click'); buzz(HAPTIC.select); onProg(c.id); };
    prog.appendChild(card);
  });
  m.appendChild(prog);

  // TROPHY ROAD — stages strip
  m.appendChild(el('div', 'fr-sect', 'TROPHY ROAD'));
  var strip = el('div', 'fr-stages');
  TUNE.stages.forEach(function (s, i) {
    var cls = 'fr-stage' + (i === st ? ' cur' : i < st ? ' done' : '');
    strip.appendChild(el('div', cls, (i < st ? '✓ ' : '') + s.name));
  });
  m.appendChild(strip);

  // daily quests
  if (S.quests.date !== todayKey()) { S.quests.date = todayKey(); S.quests.done = {}; S.quests.ticks = {}; save(); }
  m.appendChild(el('div', 'fr-sect', 'DAILY QUESTS'));
  var qq = el('div', 'fr-quests');
  TUNE.quests.forEach(function (q) {
    var done = !!S.quests.done[q.id];
    var tick = S.quests.ticks[q.id] || 0, need = q.id === 'holes3' ? 3 : 1;
    var row = el('div', 'fr-quest' + (done ? ' done' : ''),
      '<span>' + (done ? '✓' : '○') + '</span><span class="qt">' + q.text +
      ' <span style="color:#9aa3c7">(' + Math.min(tick, need) + '/' + need + ')</span></span>' +
      '<span class="rw">+' + q.reward + ' <span style="color:#f5c542">●</span></span>');
    qq.appendChild(row);
  });
  m.appendChild(qq);
  renderTicker();
  pickRivalForMenu(st);
}

function onProg(id) {
  if (id === 'btn-quick') startQuickDuel();
  else if (id === 'btn-ghost') startGhostRound();
  else if (id === 'btn-bag') { buildBag(); showScene('bag'); }
}

function pickRivalForMenu(st) {
  // rival scales with stage; seeded per day so the matchup desk feels alive
  var rng = FR.mulberry32(FR.dailySeed(todayKey()) + st * 7919);
  var pool = TUNE.bots.filter(function (b) { return b.skill <= 0.35 + st * 0.09; });
  var bot = pool[Math.floor(rng() * pool.length)] || TUNE.bots[0];
  var nm = $('fr-rivname'), sk = $('fr-rivskill');
  if (nm) nm.textContent = bot.name.toUpperCase();
  if (sk) sk.textContent = Math.round(bot.skill * 100) + '%';
  return bot;
}

/* ---------------- rival banter: staged AI kind "rivalbanter", local fallback always ---------------- */
function rivalLine(kind) {
  var lines = (S.aiRivals.lines && S.aiRivals.lines.length) ? S.aiRivals.lines : TUNE.banter[kind];
  lines = lines && lines.length ? lines : TUNE.banter[kind];
  return lines[Math.floor(Math.random() * lines.length)];
}
function fetchRivalBanter() {
  if (S.aiRivals.date === todayKey() && S.aiRivals.names.length) return;  // cached
  var url = TUNE.aiUrl + '/g';
  var ctrl = null;
  try {
    var p = fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'rivalbanter', game: 'fairway-rivals', ctx: { date: todayKey() } })
    });
    p.then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.names && d.names.length >= 4 && d.lines && d.lines.length >= 4) {
        S.aiRivals = { date: todayKey(), names: d.names.slice(0, 8), lines: d.lines.slice(0, 12) };
        save();
      }
    }).catch(function () { /* offline: local fallback stands */ });
  } catch (e) {}
}
function aiBotName(bot) {
  if (S.aiRivals.date === todayKey() && S.aiRivals.names.length) {
    var i = TUNE.bots.indexOf(bot);
    return S.aiRivals.names[i % S.aiRivals.names.length];
  }
  return bot.name;
}

/* ---------------- VERSUS splash (signature screen) ---------------- */
var currentMatch = null;
function showVersus(match, onTee) {
  currentMatch = match;
  var v = $('sc-versus');
  v.className = 'scene pre';
  var rivTag = match.rival.isGhost ? 'YOUR GHOST' : '— BOT · SEEDED';
  v.innerHTML =
    '<div class="fr-vs-wrap">' +
    '<div class="fr-vs-panel l"><div class="fr-vs-tag">HOME</div>' +
    '<div class="fr-vs-name">' + S.name + '</div>' +
    '<div class="fr-vs-rec">' + S.record.w + 'W · ' + S.record.l + 'L · ' + S.record.d + 'D</div>' +
    '<div class="fr-vs-rec"><span style="color:#ffd23f">★</span> ' + fmtInt(S.trophies) + '</div></div>' +
    '<div class="fr-vs-medal">VS</div>' +
    '<div class="fr-vs-panel r"><div class="fr-vs-tag">AWAY</div>' +
    '<div class="fr-vs-name">' + match.rival.name.toUpperCase() + '</div>' +
    '<div class="fr-vs-tag">' + rivTag + '</div>' +
    '<div class="fr-vs-rec">skill ' + Math.round(match.rival.skill * 100) + '%</div></div>' +
    '<div class="fr-course-card"><div><div class="cc-k">COURSE CARD</div>' +
    '<div class="cc-t">STAGE ' + (match.stage + 1) + ' · ' + match.stageName + ' · PAR ' + match.hole.par + '</div></div></div>' +
    '<div class="fr-teeoff">TAP TO TEE OFF</div>' +
    '</div>';
  showScene('versus');
  // broadcast wipe-in
  requestAnimationFrame(function () { requestAnimationFrame(function () {
    v.classList.remove('pre'); v.classList.add('go');
  }); });
  sfx('versus');
  var teed = false;
  v.onclick = function () {
    if (teed) return; teed = true;
    sfx('click'); buzz(HAPTIC.select);
    music(false);
    onTee();
  };
  if (window.__fr) window.__fr.teeOff = function () { v.onclick(); };
}

/* ---------------- match orchestration ---------------- */
function newWind(rng) {
  return { angle: rng() * Math.PI * 2, mph: 2 + rng() * 16 };
}
function startQuickDuel() {
  if (typeof FRDuel === 'undefined') { chyron('Duel engine loading…'); return; }
  var st = stageIdx(), sd = stageDef(st);
  var bot = pickRivalForMenu(st);
  var seed = (FR.dailySeed(todayKey()) ^ (S.record.w * 131 + S.record.l * 17 + Date.now() % 100000)) >>> 0;
  var hole = FR.genHole(seed, { par: sd.par, stage: st });
  var rng = FR.mulberry32(seed ^ 0x9e37);
  var match = {
    stage: st, stageName: sd.name, hole: hole,
    rival: { name: aiBotName(bot), isBot: true, isGhost: false, skill: bot.skill, style: bot.style },
    wind: newWind(rng), rng: rng, tape: FR.newTape(), ghost: false
  };
  showVersus(match, function () {
    FRDuel.start(match, onHoleDone);
  });
}
function startGhostRound() {
  if (typeof FRDuel === 'undefined') { chyron('Duel engine loading…'); return; }
  var st = stageIdx(), sd = stageDef(st);
  var best = S.tapes[st];
  if (!best || !best.tape || !best.tape.length) return;
  var hole = FR.genHole(best.seed, { par: sd.par, stage: st });
  var rng = FR.mulberry32(best.seed ^ 0x51ab);
  var match = {
    stage: st, stageName: sd.name, hole: hole,
    rival: { name: 'YOUR GHOST', isBot: false, isGhost: true, skill: 1, style: 'ghost' },
    wind: newWind(rng), rng: rng, tape: FR.newTape(),
    ghost: true, ghostTape: best.tape
  };
  showVersus(match, function () { FRDuel.start(match, onHoleDone); });
}

function onHoleDone(res) {
  // res: {myStrokes, rivStrokes, winner:'you'|'rival'|'draw', shootout:bool}
  if (res.winner === 'draw' && !res.shootout && typeof FRDuel !== 'undefined') {
    // tie -> shootout: one shot each, closest to the pin
    var m = currentMatch || {};
    var sm = {
      stage: res.stage, stageName: res.stageName,
      hole: FR.shootoutHole(res.seed),
      rival: m.rival || { name: 'RIVAL', isBot: true, isGhost: false, skill: 0.5 },
      wind: { angle: (m.rng || Math.random)() * Math.PI * 2, mph: 2 + (m.rng || Math.random)() * 16 },
      rng: m.rng || Math.random, tape: FR.newTape(),
      ghost: !!res.ghost, ghostTape: m.ghostTape
    };
    sfx('versus');
    FRDuel.shootout(sm, onHoleDone);
    return;
  }
  if (!res.shootout) {
    S.pinHoles++;
    questTick('holes3');
    if (res.myStrokes < res.hole.par) questTick('birdie');
  }
  var result = res.winner === 'you' ? 'win' : res.winner === 'rival' ? 'loss' : 'draw';
  if (result === 'win') { S.record.w++; questTick('win1'); S.coins += TUNE.winCoins; }
  else if (result === 'loss') S.record.l++; else S.record.d++;
  var delta = FR.trophyDelta(result, res.stage);
  var oldT = S.trophies;
  S.trophies = Math.max(0, S.trophies + delta);   // trophies never re-lock a stage (stageFor is monotonic by design)
  // ghost tape: keep the best (fewest strokes) tape per stage
  if (!res.ghost) {
    var prev = S.tapes[res.stage];
    if (!prev || res.myStrokes < prev.strokes) {
      S.tapes[res.stage] = { strokes: res.myStrokes, tape: res.tape, seed: res.seed, holeName: res.stageName };
    }
  }
  pushHistory((result === 'win' ? '<b>W' : result === 'loss' ? 'L' : 'D') + ' ' +
    res.myStrokes + '–' + res.rivStrokes + ' vs ' + res.rivalName);
  save();
  showResults(res, result, delta, oldT);
}

/* ---------------- RESULTS ---------------- */
function showResults(res, result, delta, oldT) {
  var r = $('sc-results');
  r.innerHTML = '';
  var title = result === 'win' ? (res.shootout ? 'YOU WIN THE SHOOTOUT' : 'YOU WIN THE DUEL')
    : result === 'loss' ? (res.shootout ? 'RIVAL TAKES THE SHOOTOUT' : 'RIVAL TAKES THE DUEL') : 'DEAD HEAT';
  var l3 = el('div', 'fr-lower3rd',
    '<div class="w">FRN · FINAL</div><div class="t">' + title + '</div>' +
    '<div class="s">' + S.name + ' ' + res.myStrokes + ' · ' + res.rivalName + ' ' + res.rivStrokes + '</div>');
  r.appendChild(l3);

  var tw = el('div', 'fr-trophies',
    '<div class="k">TROPHIES</div><div class="n" id="fr-tn">' + fmtInt(oldT) + '</div>' +
    '<div class="k" id="fr-td" style="color:' + (delta >= 0 ? '#37c26a' : '#e5484d') + '">' +
    (delta >= 0 ? '+' : '') + delta + '</div>');
  r.appendChild(tw);

  // pin chest meter
  var pin = FR.pinProgress(S.pinHoles);
  var pct = Math.round((pin.played / pin.target) * 100);
  var pinEl = el('div', 'fr-pin', 'PIN CHEST · ' + pin.played + '/' + pin.target +
    '<div class="bar"><i id="fr-pinbar" style="width:' + pct + '%"></i></div>');
  r.appendChild(pinEl);

  // chest: win chest, or pin chest when the meter completes
  var chestKind = pin.ready ? 'pin' : (result === 'win' ? 'win' : null);
  var chestImg = '';
  try {
    if (typeof ART !== 'undefined' && ART && ART.get) {
      var cc = ART.get('chest');
      if (cc) chestImg = '<img src="' + cc.toDataURL() + '" width="72" height="66" alt="chest">';
    }
  } catch (e) {}
  var chestBox = el('div', 'fr-chest');
  if (chestKind) {
    chestBox.innerHTML = '<div style="font-size:11px;letter-spacing:.24em;color:#f5c542">' +
      (chestKind === 'pin' ? 'PIN CHEST EARNED' : 'WINNER&rsquo;S CHEST') + '</div>' +
      '<div style="margin:8px 0">' + chestImg + '</div>' +
      '<div style="font-size:12px;color:#9aa3c7">TAP TO OPEN</div><div class="cards" id="fr-chestcards"></div>';
    chestBox.onclick = function () { openChest(chestBox, chestKind); };
  } else {
    chestBox.innerHTML = '<div style="font-size:12px;color:#9aa3c7">No chest this time — the pin chest fills every ' +
      TUNE.pinChestHoles + ' holes.</div>';
  }
  r.appendChild(chestBox);

  var un = el('div', 'fr-upnext');
  var rem = el('button', 'fr-btn', 'REMATCH');
  rem.id = 'btn-rematch';
  rem.onclick = function () { sfx('click'); startQuickDuel(); };
  var men = el('button', 'fr-btn ghost', 'MENU');
  men.id = 'btn-tomenu';
  men.onclick = function () { sfx('click'); buildMenu(); showScene('menu'); music(S.settings.music); };
  un.appendChild(rem); un.appendChild(men);
  r.appendChild(un);

  showScene('results');
  music(false);
  // trophy count-up
  var tn = $('fr-tn'), t0 = oldT, t1 = S.trophies, start = performance.now();
  function tick(now) {
    var p = Math.min(1, (now - start) / 1200);
    tn.textContent = fmtInt(lerp(t0, t1, p * p * (3 - 2 * p)));
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  sfx(result === 'win' ? 'crowd' : 'click');
  if (result === 'win') buzz(HAPTIC.cup);
  if (pin.ready) { S.pinHoles = 0; save(); }
  if (window.__fr) window.__fr.lastResult = { res: res, result: result, delta: delta };
}

/* ---------------- chest: instant-open, cards fan out, pity visible ---------------- */
function awardCards(n, onlyBelowMax) {
  var ids = FR.CLUBS.filter(function (c) {
    var e = S.clubs[c.id]; return e && e.lvl < 7;
  }).map(function (c) { return c.id; });
  var got = [];
  for (var i = 0; i < n; i++) {
    if (!ids.length) { S.coins += 60; got.push({ coins: 60 }); continue; }  // duplicate protection -> coins
    var id = ids[Math.floor(Math.random() * ids.length)];
    var amt = 3 + Math.floor(Math.random() * 5);
    S.clubs[id].cards += amt;
    got.push({ clubId: id, amt: amt });
  }
  return got;
}
function awardBalls(n) {
  var ids = Object.keys(TUNE.ballCaps), got = [];
  for (var i = 0; i < n; i++) {
    var id = ids[Math.floor(Math.random() * ids.length)];
    if ((S.balls[id] || 0) < TUNE.ballCaps[id]) { S.balls[id] = (S.balls[id] || 0) + 1; got.push({ ballId: id }); }
    else { S.coins += 40; got.push({ coins: 40 }); }
  }
  return got;
}
function clubName(id) {
  var c = FR.CLUBS.filter(function (x) { return x.id === id; })[0];
  return c ? c.name : id;
}
function ballName(id) {
  var b = TUNE.balls.filter(function (x) { return x.id === id; })[0];
  return b ? b.name : id;
}
function openChest(box, kind) {
  box.onclick = null;
  var pity = FR.chestPity(S.chestsOpened);
  var nCards = kind === 'pin' ? 4 : 2;
  var cards = awardCards(nCards);
  var balls = awardBalls(kind === 'pin' ? 2 : 1);
  var coinBonus = kind === 'pin' ? 150 : 40;
  S.coins += coinBonus;
  S.chestsOpened++;
  save();
  sfx('chest'); buzz(HAPTIC.perfect);
  Feel.doFlash('#f5c542');
  var cc = $('fr-chestcards');
  cc.innerHTML = '';
  var i = 0;
  cards.forEach(function (g) {
    var d = el('div', 'fr-ccard',
      g.clubId ? ('<b>+' + g.amt + '</b>' + clubName(g.clubId) + ' cards') : ('<b>+' + g.coins + '</b>coins'));
    d.style.animationDelay = (i++ * 0.09) + 's';
    cc.appendChild(d);
  });
  balls.forEach(function (g) {
    var d = el('div', 'fr-ccard',
      g.ballId ? ('<b>+1</b>' + ballName(g.ballId) + ' ball') : ('<b>+' + g.coins + '</b>coins'));
    d.style.animationDelay = (i++ * 0.09) + 's';
    cc.appendChild(d);
  });
  var d2 = el('div', 'fr-ccard', '<b>+' + coinBonus + '</b>coins');
  d2.style.animationDelay = (i++ * 0.09) + 's';
  cc.appendChild(d2);
  box.querySelector('div:last-child');
  var pityEl = el('div', '', '<div style="font-size:10px;color:#9aa3c7;margin-top:10px;letter-spacing:.14em">EPIC PITY · ' +
    pity.epicIn + ' CHEST' + (pity.epicIn === 1 ? '' : 'S') + ' TO GO</div>');
  box.appendChild(pityEl);
}

/* ---------------- BAG: equipment room ---------------- */
var CATS = ['driver', 'wood', 'iron', 'wedge', 'swedge'];
var CAT_LABEL = { driver: 'DRIVERS', wood: 'WOODS', iron: 'IRONS', wedge: 'WEDGES', swedge: 'SAND WEDGES' };
function buildBag() {
  var b = $('sc-bag');
  b.innerHTML = '';
  var head = el('div', 'fr-baghead');
  var back = el('button', 'fr-back', '‹');
  back.id = 'btn-bagback';
  back.setAttribute('aria-label', 'Back');
  back.onclick = function () { sfx('click'); buildMenu(); showScene('menu'); };
  head.appendChild(back);
  head.appendChild(el('div', 't', 'THE BAG'));
  head.appendChild(el('div', '', '<span style="color:#f5c542;font-weight:800"><span style="color:#f5c542">●</span> ' + fmtInt(S.coins) + '</span>'));
  b.appendChild(head);

  CATS.forEach(function (cat) {
    b.appendChild(el('div', 'fr-cat', CAT_LABEL[cat]));
    FR.CLUBS.filter(function (c) { return c.cat === cat; }).forEach(function (c) {
      var e = S.clubs[c.id] || { lvl: 1, cards: 0 };
      var maxed = e.lvl >= 7;
      var cost = maxed ? null : FR.upgradeCost(c.id, e.lvl);
      var pct = maxed ? 100 : Math.min(100, Math.round((e.cards / cost.cards) * 100));
      var st1 = FR.clubStats(c, e.lvl), st2 = maxed ? st1 : FR.clubStats(c, e.lvl + 1);
      var pw = Math.round(st1.power);
      var acc = (FR.needleSpeed(c, e.lvl)).toFixed(1);
      var pw2 = Math.round(st2.power);
      var acc2 = (FR.needleSpeed(c, e.lvl + 1)).toFixed(1);
      var div = el('div', 'fr-club');
      div.innerHTML =
        '<div class="row1"><span class="nm">' + c.name + '</span><span class="lv">LV ' + e.lvl + '</span></div>' +
        '<div class="stats"><span>Power <b>' + pw + '</b>' + (maxed ? '' : ' <span class="up">→' + pw2 + '</span>') + '</span>' +
        '<span>Needle <b>' + acc + '</b>' + (maxed ? '' : ' <span class="up">→' + acc2 + '</span>') + '</span>' +
        '<span>Guide <b>' + Math.round(st1.guide * 100) + '%</b>' + (maxed ? '' : ' <span class="up">→' + Math.round(st2.guide * 100) + '%</span>') + '</span></div>' +
        '<div class="cbar"><i style="width:' + pct + '%"></i></div>' +
        '<div style="font-size:11px;color:#9aa3c7;margin-top:4px">' +
        (maxed ? 'MAX LEVEL' : e.cards + ' / ' + cost.cards + ' cards · <span style="color:#f5c542">●</span>' + cost.coins) + '</div>';
      if (!maxed) {
        var btn = el('button', 'fr-upbtn', 'UPGRADE');
        btn.disabled = e.cards < cost.cards || S.coins < cost.coins;
        btn.onclick = (function (cc, ee, ccost) {
          return function () {
            ee.cards -= ccost.cards; S.coins -= ccost.coins; ee.lvl++;
            save(); sfx('upgrade'); buzz(HAPTIC.select);
            buildBag();
          };
        })(c, e, cost);
        div.appendChild(btn);
      }
      b.appendChild(div);
    });
  });

  b.appendChild(el('div', 'fr-cat', 'BALL RACK'));
  var brow = el('div', 'fr-ballrow');
  TUNE.balls.forEach(function (ball) {
    var count = ball.unlimited ? '∞' : (S.balls[ball.id] || 0);
    var d = el('div', 'fr-ball' + (S.ballSel === ball.id ? ' sel' : ''),
      '<div class="nm">' + ball.name + '</div><div class="ds">' + ball.desc + '</div>' +
      '<div class="ct">' + (ball.unlimited ? 'UNLIMITED' : '×' + count) + '</div>');
    d.onclick = function () {
      if (!ball.unlimited && (S.balls[ball.id] || 0) <= 0) { sfx('bad'); return; }
      S.ballSel = ball.id; save(); sfx('click'); buzz(HAPTIC.select);
      buildBag();
    };
    brow.appendChild(d);
  });
  b.appendChild(brow);
  b.appendChild(el('div', '', '<div style="font-size:10px;color:#9aa3c7;padding:10px 14px 20px;letter-spacing:.06em">Special balls are earn-only from chests. Effects stay inside a ±40% band — wind help never reaches zero-wind.</div>'));
}

/* ---------------- boot ---------------- */
function boot() {
  if (typeof FR === 'undefined') {
    document.body.innerHTML = '<div class="fr-err">The duel engine (sim.js) did not load.<br>Check that sim.js is included before game.js.</div>';
    return;
  }
  loadSave();
  buildSheet();
  if (typeof ART !== 'undefined' && ART && typeof ART.init === 'function') {
    try { ART.init(); } catch (e) {}
  }
  buildMenu();
  showScene('menu');
  renderTicker();
  fetchRivalBanter();
  if (S.settings.music) {
    // AudioContext requires a gesture: start music on first interaction
    var go = function () { music(true); document.removeEventListener('pointerdown', go); };
    document.addEventListener('pointerdown', go);
  }
  var paused = false;
  function onHide() {
    paused = document.hidden;
    if (typeof FRDuel !== 'undefined' && FRDuel.setPaused) FRDuel.setPaused(paused);
    if (paused) music(false);
    else if (S.settings.music && window.__fr && window.__fr.scene === 'menu') music(true);
  }
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('blur', function () {
    if (typeof FRDuel !== 'undefined' && FRDuel.clearInput) FRDuel.clearInput();
  });
  window.addEventListener('resize', function () {
    if (typeof FRDuel !== 'undefined' && FRDuel.resize) FRDuel.resize();
  });
}

/* ---------------- debug / test API ---------------- */
window.__fr = {
  version: TUNE.buildTag, scene: 'menu', lastResult: null, teeOff: null,
  show: function (n) {
    if (n === 'bag') buildBag();
    if (n === 'menu') buildMenu();
    showScene(n);
  },
  quick: function () { startQuickDuel(); },
  ghost: function () { startGhostRound(); },
  results: function (res, result, delta, oldT) { showResults(res, result, delta, oldT); },
  save: function () { return S; },
  feel: function () { return Feel; },
  _onHoleDone: function (res) { onHoleDone(res); }  // test hook
};
window.FRG = window.__fr;

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
