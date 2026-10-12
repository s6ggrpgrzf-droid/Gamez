// Night Market — save.js — persistence. Guarded storage, versioned loads.
// Load pipeline: parse -> validate envelope -> migrate an ISOLATED copy ->
// validate full schema -> activate. Never mutates disk on a failed load.
// localStorage access is typeof-guarded; under node a memory shim stands in
// (this is also the seam the sim tests use via NM.save._backend()).
var NM = window.NM || {};

var SAVE_KEY = 'nm_save_v1';
var SAVE_BAK_KEY = 'nm_save_v1.bak';

// --- storage backend -------------------------------------------------------
var SAVE_memStore = null;
function SAVE_backend() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch (e) { /* private mode / blocked: fall through to shim */ }
  if (!SAVE_memStore) {
    var data = {};
    SAVE_memStore = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; },
      _clear: function () { data = {}; }
    };
  }
  return SAVE_memStore;
}

// --- migrations ------------------------------------------------------------
// Forward-only, idempotent, never deleted. v2 is current.
var SAVE_MIGRATIONS = [
  { to: 1, up: function (s) { return s; } }, // v0 -> v1: shape already final
  { to: 2, up: function (s) {                // v1 -> v2: random encounters
    if (!s.encounters || typeof s.encounters !== 'object') {
      var pt = (s.stats && typeof s.stats.playTime === 'number') ? s.stats.playTime : 0;
      s.encounters = { nextAt: pt + 90, active: null };
    }
    if (!(s.boostUntil > 0)) s.boostUntil = 0;
    if (s.flags && typeof s.flags.hourglassDate !== 'string') s.flags.hourglassDate = '';
    return s;
  } }
];

function SAVE_isolatedCopy(raw) {
  return JSON.parse(JSON.stringify(raw));
}

// Fill any missing v1 fields from a fresh state (defensive for old saves).
function SAVE_applyDefaults(s) {
  var base = NM.sim.createState(1);
  var out = SAVE_isolatedCopy(base);
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function obj(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null; }
  out.v = 2;
  out.t = num(s.t, 0);
  out.coins = num(s.coins, 0);
  out.lanterns = num(s.lanterns, 0);
  out.gems = num(s.gems, 0);
  var stalls = obj(s.stalls) || {};
  out.stalls = {};
  for (var k in stalls) if (typeof stalls[k] === 'number' && stalls[k] >= 0) out.stalls[k] = Math.floor(stalls[k]);
  if (!out.stalls.noodle) out.stalls.noodle = 1;
  var up = obj(s.upgrades) || {};
  out.upgrades = {};
  for (var u in up) if (up[u]) out.upgrades[u] = true;
  var su = obj(s.seasonUpgrades) || {};
  out.seasonUpgrades = {};
  for (var w in su) if (su[w]) out.seasonUpgrades[w] = true;
  out.staff = Array.isArray(s.staff) ? s.staff.filter(function (x) { return typeof x === 'string'; }) : [];
  out.dishes = Math.max(0, num(s.dishes, 0));
  var gong = obj(s.gong) || {};
  out.gong = { taps: Math.max(0, Math.floor(num(gong.taps, 0))), rushUntil: num(gong.rushUntil, 0), rushSecs: Math.max(0, num(gong.rushSecs, 0)) };
  var regs = obj(s.regulars) || {};
  out.regulars = {};
  for (var r in regs) {
    var rec = obj(regs[r]);
    if (rec) out.regulars[r] = { visits: Math.max(0, Math.floor(num(rec.visits, 0))), memento: !!rec.memento };
  }
  var q = obj(s.quests) || {};
  out.quests = {
    date: typeof q.date === 'string' ? q.date : '',
    done: obj(q.done) || {},
    prog: obj(q.prog) || {},
    streak: Math.max(0, Math.floor(num(q.streak, 0)))
  };
  var se = obj(s.season) || {};
  out.season = { n: Math.max(1, Math.floor(num(se.n, 1))), startedAt: num(se.startedAt, 0), earned: Math.max(0, num(se.earned, 0)) };
  var st = obj(s.stats) || {};
  out.stats = {
    earnedTotal: Math.max(0, num(st.earnedTotal, 0)),
    playTime: Math.max(0, num(st.playTime, 0)),
    taps: Math.max(0, Math.floor(num(st.taps, 0))),
    dishesSold: Math.max(0, num(st.dishesSold, 0)),
    stallsBought: Math.max(0, Math.floor(num(st.stallsBought, 0))),
    rushes: Math.max(0, Math.floor(num(st.rushes, 0)))
  };
  var set = obj(s.settings) || {};
  out.settings = { mute: !!set.mute };
  var fl = obj(s.flags) || {};
  out.flags = { staffSeen: !!fl.staffSeen, bookSeen: !!fl.bookSeen, seasonSeen: !!fl.seasonSeen,
                hourglassDate: typeof fl.hourglassDate === 'string' ? fl.hourglassDate : '' };
  var enc = obj(s.encounters) || {};
  var encAct = obj(enc.active);
  out.encounters = {
    nextAt: Math.max(0, num(enc.nextAt, 90)),
    active: encAct ? { kind: typeof encAct.kind === 'string' ? encAct.kind : 'poet',
                       expiresAt: Math.max(0, num(encAct.expiresAt, 0)) } : null
  };
  out.boostUntil = Math.max(0, num(s.boostUntil, 0));
  out.rng = (typeof s.rng === 'number' && isFinite(s.rng)) ? (s.rng >>> 0) : 1;
  return out;
}

function SAVE_envelopeOk(o) {
  return o && typeof o === 'object' && typeof o.v === 'number';
}

// Migrate a raw parsed object. Never touches the caller's object.
function SAVE_migrate(raw) {
  var s = SAVE_isolatedCopy(raw);
  var migrated = false;
  if (typeof s.v !== 'number') { s.v = 0; migrated = true; }
  for (var i = 0; i < SAVE_MIGRATIONS.length; i++) {
    var m = SAVE_MIGRATIONS[i];
    if (s.v < m.to) {
      s = m.up(s) || s;
      s.v = m.to;
      migrated = true;
    }
  }
  s = SAVE_applyDefaults(s);
  return { state: s, migrated: migrated };
}

function SAVE_validate(s) {
  if (!s || typeof s !== 'object' || s.v !== 2) return false;
  if (typeof s.coins !== 'number' || typeof s.lanterns !== 'number' || typeof s.gems !== 'number') return false;
  if (!s.stalls || typeof s.stalls !== 'object' || !(s.stalls.noodle >= 1)) return false;
  if (!s.rates || typeof s.rates.coinsPerSec !== 'number') return false;
  if (!s.season || typeof s.season.n !== 'number') return false;
  if (!s.quests || typeof s.quests.date !== 'string') return false;
  if (typeof s.rng !== 'number') return false;
  return true;
}

// --- public API -------------------------------------------------------------
function SAVE_saveNow(state, nowMs) {
  var store = SAVE_backend();
  if (!store) return false;
  try {
    if (nowMs === undefined || nowMs === null) {
      nowMs = (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0;
    }
    state.t = nowMs;
    var prev = null;
    try { prev = store.getItem(SAVE_KEY); } catch (e) { /* ignore */ }
    var str = JSON.stringify(state);
    if (prev) {
      try { store.setItem(SAVE_BAK_KEY, prev); } catch (e) { /* bak best-effort */ }
    }
    store.setItem(SAVE_KEY, str);
    return true;
  } catch (e) {
    return false; // quota / serialization failure: degrade, never crash
  }
}

function SAVE_tryLoad(store, key) {
  var raw = null;
  try { raw = store.getItem(key); } catch (e) { return null; }
  if (!raw) return null;
  var parsed = null;
  try { parsed = JSON.parse(raw); } catch (e) { return null; }
  if (!SAVE_envelopeOk(parsed)) return null;
  var m = SAVE_migrate(parsed); // isolated copy inside
  if (!SAVE_validate(m.state)) return null;
  return m;
}

function SAVE_loadGame() {
  var store = SAVE_backend();
  if (store) {
    var main = SAVE_tryLoad(store, SAVE_KEY);
    if (main) return { state: main.state, via: main.migrated ? 'migrated' : 'save' };
    var bak = SAVE_tryLoad(store, SAVE_BAK_KEY);
    if (bak) return { state: bak.state, via: 'bak' };
  }
  return { state: NM.sim.createState(), via: 'fresh' };
}

function SAVE_b64encode(str) {
  if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
  return btoa(unescape(encodeURIComponent(str)));
}

function SAVE_b64decode(b64) {
  if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64').toString('utf8');
  return decodeURIComponent(escape(atob(b64)));
}

function SAVE_exportStr(state) {
  try {
    return SAVE_b64encode(JSON.stringify(state));
  } catch (e) {
    return null;
  }
}

function SAVE_importStr(str) {
  try {
    if (typeof str !== 'string' || !str) return { ok: false, error: 'empty' };
    var json = SAVE_b64decode(str.replace(/\s+/g, ''));
    var parsed = JSON.parse(json);
    if (!SAVE_envelopeOk(parsed)) return { ok: false, error: 'envelope' };
    var m = SAVE_migrate(parsed);
    if (!SAVE_validate(m.state)) return { ok: false, error: 'schema' };
    return { ok: true, state: m.state };
  } catch (e) {
    return { ok: false, error: 'corrupt' };
  }
}

NM.save = {
  KEY: SAVE_KEY,
  BAK_KEY: SAVE_BAK_KEY,
  MIGRATIONS: SAVE_MIGRATIONS,
  saveNow: SAVE_saveNow,
  loadGame: SAVE_loadGame,
  exportStr: SAVE_exportStr,
  importStr: SAVE_importStr,
  migrateState: SAVE_migrate,
  validate: SAVE_validate,
  _backend: SAVE_backend // documented seam: storage access for tests/tools
};
