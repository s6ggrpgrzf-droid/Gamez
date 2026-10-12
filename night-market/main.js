// Night Market — main.js — coordinator. Wires the parts, owns the clock.
// Boot: load -> offline -> welcome -> audio -> render -> ui -> rAF loop.
// Pure game logic stays in sim.js; this file does time, DOM lifecycle,
// actions the UI calls, arcade submit, and the window.__nm test hooks.
var NM = window.NM || {};

var M_TICK = 0.1;              // 10Hz fixed sim ticks
var M_DT_CLAMP_MS = 250;       // tab-switch spike guard
var M_PANIC_TICKS = 240;       // drop backlog instead of death-spiral
var M_AUTOSAVE_MS = 15000;
var M_ARCADE = 'https://gamez-arcade.chaoticutopia84.workers.dev';
var M_ARC_NAME_KEY = 'arcade_name';

var M_G = { state: null, act: {} }; // the one G object ui.js reads
var M_acc = 0, M_last = 0, M_saveAcc = 0;
var M_welcomeOpen = false;
var M_booted = false;

// --- tiny date helpers (main is NOT sim-pure; Date lives here only) --------
function M_dateStr(nowMs) {
  var d = new Date(nowMs);
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function M_dateSeed(nowMs) {
  var d = new Date(nowMs);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
function M_now() { return (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0; }

// --- save ------------------------------------------------------------------
function M_saveNow() {
  try { NM.save.saveNow(M_G.state, M_now()); } catch (e) { /* never crash */ }
}

// --- arcade: season leaderboard submit (silent, fire-and-forget) ------------
function M_arcadeSubmitSeason(lanterns) {
  try {
    var name = '';
    try { name = (typeof localStorage !== 'undefined' && localStorage.getItem(M_ARC_NAME_KEY) || '').trim(); }
    catch (e) { name = ''; }
    if (!name) return; // no stored arcade name: submit nothing, nag nobody
    var score = Math.max(0, Math.floor(lanterns));
    fetch(M_ARCADE + '/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'night-market', board: 'seasons', name: name, score: score })
    }).catch(function () { /* silent */ });
  } catch (e) { /* silent */ }
}

// --- actions the UI calls ---------------------------------------------------
function M_grantCoins(n) {
  var s = M_G.state;
  if (!(n > 0)) return;
  s.coins += n;
  s.season.earned += n;
  s.stats.earnedTotal += n;
  NM.sim.questProg(s, 'earn', n);
}

var M_act = {
  buyStall: function (id, qty) {
    var r = NM.sim.buyStall(M_G.state, id, qty, M_now());
    return r;
  },
  buyMax: function (id) {
    return NM.sim.buyStall(M_G.state, id, 'max', M_now());
  },
  buyUpgrade: function (id) { return NM.sim.buyUpgrade(M_G.state, id); },
  hireStaff: function (id) { return NM.sim.hireStaff(M_G.state, id); },
  buySeasonUpgrade: function (id) { return NM.sim.buySeasonUpgrade(M_G.state, id); },
  collectDishes: function () { return NM.sim.collectDishes(M_G.state); },
  tapGong: function () { return NM.sim.tapGong(M_G.state, M_now()); },
  claimEncounter: function (choice) {
    var r = NM.sim.claimEncounter(M_G.state, choice, M_now());
    if (r.ok && NM.audio) NM.audio.claim();
    return r;
  },
  dismissEncounter: function () { return NM.sim.dismissEncounter(M_G.state); },
  claimWelcome: function () {
    M_welcomeOpen = false;
    if (NM.audio) NM.audio.claim();
  },
  // 2h of earnings, on the house — once per local day.
  claimHourglass: function () {
    var s = M_G.state;
    var today = M_dateStr(M_now());
    if (s.flags.hourglassDate === today) return { ok: false, reason: 'tomorrow' };
    s.flags.hourglassDate = today;
    var coins = Math.max(1, Math.ceil(s.rates.coinsPerSec * 7200));
    M_grantCoins(coins);
    M_saveNow();
    return { ok: true, coins: coins };
  },
  export: function () { return NM.save.exportStr(M_G.state); },
  import: function (str) {
    var r = NM.save.importStr(str);
    if (!r.ok) return false;
    M_G.state = r.state;
    M_saveNow();
    if (NM.ui) NM.ui.refresh();
    return true;
  },
  openSeason: function () {
    if (NM.ui) NM.ui.openSheet('season');
  },
  doSeason: function () {
    var r = NM.sim.applyNewSeason(M_G.state, M_now());
    if (!r.ok) return r;
    M_arcadeSubmitSeason(r.lanterns);
    M_saveNow();
    if (NM.ui) NM.ui.refresh();
    return r;
  },
  reset: function () {
    M_G.state = NM.sim.createState();
    M_saveNow();
    if (NM.ui) NM.ui.refresh();
    return true;
  },
  toggleMute: function () {
    var muted = NM.audio ? NM.audio.toggleMute() : false;
    M_G.state.settings.mute = muted;
    M_saveNow();
    return muted;
  }
};
M_G.act = M_act;

// --- render view ------------------------------------------------------------
function M_view(nowMs) {
  var s = M_G.state;
  var g = s.gong || { rushUntil: 0, rushSecs: 0 };
  var rush = nowMs < (g.rushUntil || 0);
  return {
    state: s,
    mode: M_welcomeOpen ? 'welcome' : 'normal',
    rush: rush,
    gongPulse: Math.max(0, Math.min(1, (g.rushSecs || 0) / NM.content.GONG_RUSH_SECS)),
    tillGlow: (s.dishes || 0) >= 1
  };
}

// --- rAF loop: accumulator, fixed 10Hz ticks, dt clamp, panic brake ---------
function M_frame(nowMs) {
  requestAnimationFrame(M_frame);
  if (!M_last) M_last = nowMs;
  var dtMs = nowMs - M_last;
  M_last = nowMs;
  if (!(dtMs > 0)) dtMs = 0;
  if (dtMs > M_DT_CLAMP_MS) dtMs = M_DT_CLAMP_MS;

  M_acc += dtMs / 1000;
  var n = 0;
  while (M_acc >= M_TICK && n < M_PANIC_TICKS) {
    NM.sim.advance(M_G.state, M_TICK);
    M_acc -= M_TICK;
    n++;
  }
  if (n >= M_PANIC_TICKS) M_acc = 0; // panic brake: drop backlog, stay live

  M_saveAcc += dtMs;
  if (M_saveAcc >= M_AUTOSAVE_MS) {
    M_saveAcc = 0;
    if (NM.sim.checkQuestDay(M_G.state, M_dateStr(M_now()))) {
      if (NM.ui) NM.ui.refresh(); // day rolled: fresh quest chip
    }
    M_saveNow();
  }

  NM.render.frame(nowMs, M_view(nowMs));
}

// --- boot -------------------------------------------------------------------
function M_boot() {
  if (M_booted) return;
  M_booted = true;
  var nowMs = M_now();

  // 1. load
  var loaded = NM.save.loadGame();
  M_G.state = loaded.state;
  var s = M_G.state;

  // 2. day roll + offline catch-up (wall clock -> summary for welcome data)
  NM.sim.checkQuestDay(s, M_dateStr(nowMs));
  var welcome = null;
  if (loaded.via !== 'fresh' && s.t > 0) {
    var elapsedSec = (nowMs - s.t) / 1000;
    if (elapsedSec > 0) {
      welcome = NM.offline.applyOffline(s, elapsedSec, M_dateSeed(nowMs));
    }
  }

  // 3. audio: init is gesture-safe internally (defers until first tap);
  //    startBed fades in once the context exists. Sync saved mute.
  if (NM.audio) {
    NM.audio.init();
    NM.audio.startBed();
    if (s.settings.mute && !NM.audio.isMuted()) NM.audio.toggleMute();
  }

  // 4. render
  var canvas = (typeof document !== 'undefined') ? document.getElementById('diorama') : null;
  if (canvas && NM.render) NM.render.init(canvas);

  // 5. ui (builds G: {state, act})
  if (NM.ui) NM.ui.init(M_G);

  // 6. welcome-back overlay, if there is anything to tell
  if (welcome && NM.ui) {
    var regs = NM.content.REGULAR_MAP || {};
    var named = [];
    for (var i = 0; i < welcome.visitors.length; i++) {
      var vw = welcome.visitors[i];
      named.push({ id: vw.id, visits: vw.visits,
                   name: (regs[vw.id] && regs[vw.id].name) || vw.id });
    }
    M_welcomeOpen = true;
    NM.ui.showWelcome({
      awaySec: welcome.awaySec,
      coins: welcome.coins,
      dishes: Math.floor(welcome.dishes || 0),
      visitors: named,
      newMementos: welcome.newMementos || []
    });
  }

  // 7. lifecycle: save on hide, resize the diorama
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) M_saveNow();
    });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', M_saveNow);
    var onResize = function () { if (NM.render) NM.render.resize(); };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
  }

  // 8. loop
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(M_frame);
  }

  // 9. test hooks
  window.__nm = {
    state: function () { return M_G.state; },
    grant: function (c) { M_grantCoins(c); return M_G.state.coins; },
    fakeAway: function (h) {
      return NM.offline.applyOffline(M_G.state, (h || 0) * 3600, M_dateSeed(M_now()));
    },
    openPanel: function (id) { if (NM.ui) NM.ui.openStallPanel(id); },
    reset: function () { M_act.reset(); }
  };
}

NM.main = {
  boot: M_boot,
  actions: M_act,
  state: function () { return M_G.state; }
};

// auto-boot in the browser; under node the file just defines NM.main
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', M_boot);
  } else {
    M_boot();
  }
}
