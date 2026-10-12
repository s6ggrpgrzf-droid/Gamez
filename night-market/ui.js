/* Night Market — NM.ui: the DOM layer.
   Law: ui NEVER touches sim internals. It reads G.state and writes via G.act.
   Cost math below is UI-local closed-form display math (the formulas are in
   CONTRACTS.md); sim.js remains the only thing that mutates state. */
var NM = window.NM || {};
(function () {
'use strict';

/* ---------- module scope ---------- */
var UI_G = null;          // {state, act, ...} from main.js
var UI_F = null;          // NM.format
var UI_C = null;          // NM.content
var UI_R = null;          // NM.render
var UI_el = {};           // cached DOM refs
var UI_last = {};         // last-written strings (skip no-ops)
var UI_bulk = 'x1';
var UI_sheet = null;      // open sheet name or null
var UI_sheetSig = '';     // signature of last sheet render (avoid churn)
var UI_sheetTick = 0;
var UI_toastTimer = 0;
var UI_welcomeInfo = null;
var UI_welcomeClaimed = false;
var UI_seasonArmed = false;
var UI_resetArmed = false;
var UI_panelStall = null; // stall id in mini-panel or null
var UI_encShown = false;  // encounter choice card visible

function UI_MILESTONES() {
  if (UI_C && UI_C.MILESTONES) return UI_C.MILESTONES;
  return [10, 25, 50, 100, 200];
}
function UI_GONG_TAPS() {
  if (UI_C && UI_C.GONG_RUSH_TAPS) return UI_C.GONG_RUSH_TAPS;
  return 25;
}
function UI_DISH_CAP() {
  if (UI_C && UI_C.DISH_CAP) return UI_C.DISH_CAP;
  return 8;
}

/* ---------- tiny dom helpers ---------- */
function UI_esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function UI_elOf(id) {
  if (!UI_el[id]) UI_el[id] = document.getElementById(id);
  return UI_el[id];
}
function UI_set(id, str) {           // cached textContent write (<=4Hz, no-ops skipped)
  str = String(str);
  if (UI_last[id] === str) return;
  UI_last[id] = str;
  var e = UI_elOf(id);
  if (e) e.textContent = str;
}
function UI_setHTML(id, html) {      // cached innerHTML write
  if (UI_last[id] === html) return;
  UI_last[id] = html;
  var e = UI_elOf(id);
  if (e) e.innerHTML = html;
}
function UI_icon(sym, cls) {
  return '<svg class="' + (cls || 'ic') + '"><use href="#' + sym + '"/></svg>';
}

/* ---------- format helpers (via NM.format) ---------- */
function UI_fmt(n) { return UI_F ? UI_F.fmt(n) : String(Math.floor(n)); }
function UI_fmtInt(n) { return UI_F ? UI_F.fmtInt(n) : String(Math.floor(n)); }
function UI_fmtTime(s) { return UI_F ? UI_F.fmtTime(s) : (Math.round(s) + 's'); }
function UI_fmtRate(n) { return UI_F ? UI_F.fmtRate(n) : (UI_fmt(n) + '/s'); }

/* ---------- content lookups ---------- */
function UI_stalls() { return (UI_C && UI_C.STALLS) || []; }
function UI_stallDef(id) {
  var arr = UI_stalls();
  for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
  return null;
}
function UI_stallName(id) {
  var d = UI_stallDef(id);
  return d ? d.name : id;
}
function UI_upgrades() { return (UI_C && UI_C.UPGRADES) || []; }
function UI_staff() { return (UI_C && UI_C.STAFF) || []; }
function UI_regulars() { return (UI_C && UI_C.REGULARS) || []; }
function UI_questDefs() { return (UI_C && UI_C.QUEST_DEFS) || []; }
function UI_seasonUpgrades() { return (UI_C && UI_C.SEASON_UPGRADES) || []; }
function UI_owned(id) { return (UI_G.state.stalls && UI_G.state.stalls[id]) || 0; }
function UI_cps() { return (UI_G.state.rates && UI_G.state.rates.coinsPerSec) || 0; }

/* ---------- UI-local closed-form display math (formulas per CONTRACTS.md) ---------- */
function UI_costFor(id, owned, qty) {
  var d = UI_stallDef(id);
  if (!d || qty <= 0) return 0;
  var r = d.costRatio, b = d.baseCost;
  return b * Math.pow(r, owned) * (Math.pow(r, qty) - 1) / (r - 1);
}
function UI_maxAffordable(id, coins) {
  var d = UI_stallDef(id);
  if (!d) return 0;
  var owned = UI_owned(id), r = d.costRatio, b = d.baseCost;
  var base = b * Math.pow(r, owned);
  if (coins < base) return 0;
  var q = Math.floor(Math.log(1 + coins * (r - 1) / base) / Math.log(r));
  return Math.max(0, q);
}
function UI_bulkQty(id) {
  if (UI_bulk === 'max') return Math.max(1, UI_maxAffordable(id, UI_G.state.coins));
  return UI_bulk === 'x10' ? 10 : 1;
}
function UI_timeToAfford(cost) {
  var coins = UI_G.state.coins, cps = UI_cps();
  if (coins >= cost) return 0;
  if (cps <= 0) return Infinity;
  return (cost - coins) / cps;
}
function UI_ttaLabel(sec) {
  if (sec === 0) return { text: 'READY', cls: 'tta ready' };
  if (!isFinite(sec)) return { text: 'a while yet', cls: 'tta' };
  return { text: '\u2248 ' + UI_fmtTime(sec), cls: 'tta' };
}
function UI_seasonPreview() {   // lanterns = floor(12*sqrt(season.earned/1e6))
  try {
    if (NM.sim && typeof NM.sim.newSeasonPreview === 'function') {
      return NM.sim.newSeasonPreview(UI_G.state);
    }
  } catch (err) { /* fall back to local math */ }
  var s = UI_G.state;
  var earned = (s.season && s.season.earned) || 0;
  var lan = earned > 0 ? Math.floor(12 * Math.sqrt(earned / 1e6)) : 0;
  var hoard = s.lanterns || 0;
  return {
    lanterns: lan,
    multNow: 1 + 0.02 * hoard,
    multNext: 1 + 0.02 * (hoard + lan)
  };
}
function UI_effectText(e) {
  var pct = Math.round(((e.mult || 1) - 1) * 100);
  if (e.kind === 'cps') return '+' + pct + '% all coins';
  if (e.kind === 'stall') return '+' + pct + '% ' + UI_stallName(e.stall) + ' coins';
  if (e.kind === 'dish') return '+' + pct + '% dish value';
  return '';
}
function UI_rewardText(rw) {
  if (!rw) return '';
  var bits = [];
  if (rw.coins) bits.push(UI_fmt(rw.coins) + ' coins');
  if (rw.gems) bits.push(rw.gems + ' gems');
  return bits.join(' + ');
}

/* ---------- stall icons (hand-drawn-ish stroke glyphs) ---------- */
function UI_stallIcon(id) {
  var sw = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"';
  var inner = '';
  if (id === 'noodle') {
    inner = '<path d="M4 13h16c0 4-3.6 7-8 7s-8-3-8-7z" ' + sw + '/>' +
      '<path d="M9.5 13c-.4-2.6.4-4.6 1.6-6M14.5 13c.4-2.6-.4-4.6-1.6-6" ' + sw + ' stroke-width="1.2"/>' +
      '<path d="M14 4l7-1.5M15 6.5l6-2" ' + sw + ' stroke-width="1.2"/>';
  } else if (id === 'tea') {
    inner = '<path d="M7 10h10v5a4.5 4.5 0 0 1-4.5 4.5h-1A4.5 4.5 0 0 1 7 15z" ' + sw + '/>' +
      '<path d="M17 11h1.6a2.2 2.2 0 0 1 0 4.4H17" ' + sw + '/>' +
      '<path d="M10.5 8c-.5-1.4.5-2 0-3.4M13.5 8c-.5-1.4.5-2 0-3.4" ' + sw + ' stroke-width="1.2"/>';
  } else if (id === 'dumpling') {
    inner = '<path d="M4 15a8 8 0 0 1 16 0z" ' + sw + '/>' +
      '<path d="M8.5 15c0-2.6.8-4.4 1.8-5.6M12 15V8.4M15.5 15c0-2.6-.8-4.4-1.8-5.6" ' + sw + ' stroke-width="1.2"/>';
  } else if (id === 'skewer') {
    inner = '<path d="M12 3v18" ' + sw + '/>' +
      '<circle cx="12" cy="7.5" r="2.4" ' + sw + '/><circle cx="12" cy="12.5" r="2.4" ' + sw + '/>' +
      '<circle cx="12" cy="17.5" r="2.4" ' + sw + '/>';
  } else if (id === 'lantern') {
    return UI_icon('nm-lantern');
  } else if (id === 'tofu') {
    inner = '<rect x="6" y="9" width="12" height="10" rx="2" ' + sw + '/>' +
      '<path d="M6 13.5h12M12 9v10" ' + sw + ' stroke-width="1.1"/>';
  } else if (id === 'fan') {
    inner = '<path d="M12 20L5.5 9a8 8 0 0 1 13 0z" ' + sw + '/>' +
      '<path d="M12 20L8 8.5M12 20v-11M12 20l4-11.5" ' + sw + ' stroke-width="1.1"/>' +
      '<circle cx="12" cy="20" r="1.4" fill="currentColor"/>';
  } else if (id === 'pearl') {
    inner = '<circle cx="12" cy="11" r="5.5" ' + sw + '/>' +
      '<circle cx="10" cy="9" r="1.3" fill="currentColor"/>' +
      '<path d="M5 18c2 2 4.5 3 7 3s5-1 7-3" ' + sw + ' stroke-width="1.2"/>';
  } else {
    inner = '<circle cx="12" cy="12" r="7" ' + sw + '/>';
  }
  return '<svg class="ic" viewBox="0 0 24 24">' + inner + '</svg>';
}

/* ---------- toast ---------- */
function UI_toast(msg) {
  var e = UI_elOf('toast');
  if (!e) return;
  e.textContent = msg;
  e.hidden = false;
  e.classList.add('show');
  if (UI_toastTimer) clearTimeout(UI_toastTimer);
  UI_toastTimer = setTimeout(function () {
    e.classList.remove('show');
    setTimeout(function () { if (!e.classList.contains('show')) e.hidden = true; }, 300);
  }, 2200);
}

/* ---------- audio nudge (defensive; audio module owns policy) ---------- */
function UI_sfx(name) {
  try {
    if (NM.audio && typeof NM.audio[name] === 'function') NM.audio[name]();
  } catch (err) { /* silent */ }
}

/* =====================================================================
   TICK — 4Hz counters, tab locks, gong, tray, chip. Skips no-ops.
   ===================================================================== */
function UI_tick() {
  if (!UI_G) return;
  var s = UI_G.state;
  UI_set('coins-num', UI_fmt(s.coins));
  UI_set('cps-num', UI_fmtRate(UI_cps()));
  UI_set('lanterns-num', UI_fmtInt(s.lanterns || 0));
  UI_set('gems-num', UI_fmtInt(s.gems || 0));
  UI_updateQuestChip();
  UI_updateTabs();
  UI_updateGong();
  UI_updateTray();
  UI_updateEdgeLeft();
  if (UI_panelStall) UI_refreshPanel();
  UI_pollEncounter();
  UI_sheetTick++;
  if (UI_sheet && UI_sheetTick % 4 === 0) UI_refreshSheet(); // 1Hz sheet refresh
}

function UI_questsState() {
  return UI_G.state.quests || { done: {}, prog: {}, streak: 0 };
}
function UI_firstOpenQuest() {
  var defs = UI_questDefs(), q = UI_questsState();
  for (var i = 0; i < defs.length; i++) {
    if (!q.done[defs[i].id]) return defs[i];
  }
  return null;
}
function UI_updateQuestChip() {
  var def = UI_firstOpenQuest(), q = UI_questsState(), txt;
  if (!def) {
    txt = 'All quests done — back tomorrow, boss';
  } else {
    var p = q.prog[def.id] || 0;
    txt = def.text + '  ' + Math.min(p, def.target) + '/' + def.target;
  }
  UI_set('quest-chip-text', txt);
  var badge = UI_elOf('edge-right-badge');
  if (badge) {
    var open = 0, defs = UI_questDefs();
    for (var i = 0; i < defs.length; i++) if (!q.done[defs[i].id]) open++;
    badge.hidden = open === 0;
    if (open > 0 && UI_last['edge-badge'] !== String(open)) {
      UI_last['edge-badge'] = String(open);
      badge.textContent = String(open);
    }
  }
}

/* ---------- tab progressive unlock ---------- */
function UI_tabState(name) {
  var s = UI_G.state;
  if (name === 'stalls') return { locked: false, hint: '' };
  if (name === 'crew') {
    if ((s.staff && s.staff.length) || (s.flags && s.flags.staffSeen)) return { locked: false, hint: '' };
    var cheapest = Infinity, staff = UI_staff();
    for (var i = 0; i < staff.length; i++) cheapest = Math.min(cheapest, staff[i].cost);
    if (s.coins >= cheapest * 0.5) return { locked: false, hint: '' };
    return { locked: true, hint: 'help wanted soon · ' + UI_fmt(cheapest) + ' coins' };
  }
  if (name === 'guests') {
    var regs = s.regulars || {};
    for (var k in regs) if (regs[k] && regs[k].visits > 0) return { locked: false, hint: '' };
    if (s.flags && s.flags.bookSeen) return { locked: false, hint: '' };
    return { locked: true, hint: 'no regulars yet — keep the lanterns lit' };
  }
  if (name === 'season') {
    var pv = UI_seasonPreview();
    if (pv.lanterns >= 1) return { locked: false, hint: '' };
    return { locked: true, hint: 'earn ' + UI_fmt(1e6 / 144) + '+ this season' };
  }
  return { locked: false, hint: '' };
}
function UI_updateTabs() {
  var names = ['stalls', 'crew', 'guests', 'season'];
  var tabs = document.querySelectorAll('#tab-rail .tab');
  for (var i = 0; i < tabs.length; i++) {
    (function (tab) {
      var name = tab.getAttribute('data-tab');
      var st = UI_tabState(name);
      var sig = name + '|' + (st.locked ? 'L' : 'U') + '|' + st.hint + '|' + (UI_sheet === name ? 'A' : '');
      if (UI_last['tab-' + name] === sig) return;
      UI_last['tab-' + name] = sig;
      tab.classList.toggle('locked', st.locked);
      tab.classList.toggle('active', UI_sheet === name);
      var hint = tab.querySelector('.tab-hint');
      if (hint) {
        hint.hidden = !st.hint;
        if (st.hint) hint.textContent = st.hint;
      }
      tab.setAttribute('aria-disabled', st.locked ? 'true' : 'false');
    })(tabs[i]);
  }
}
function UI_openTab(name) {
  var st = UI_tabState(name);
  if (st.locked) {
    UI_toast(st.hint || 'Not yet — soon, boss');
    UI_sfx('uiTick');
    return;
  }
  UI_sfx('uiTick');
  if (name === 'season' && UI_G.act && typeof UI_G.act.openSeason === 'function') {
    UI_G.act.openSeason();
    return;
  }
  UI_openSheet(name);
}

/* ---------- gong ---------- */
function UI_updateGong() {
  var s = UI_G.state, g = s.gong || { taps: 0, rushUntil: 0 };
  var need = UI_GONG_TAPS();
  var now = Date.now();
  var rushing = g.rushUntil && g.rushUntil > now;
  var gong = UI_elOf('night-gong');
  if (gong) {
    var sig = rushing ? 'R' : 'n';
    if (UI_last['gong-cls'] !== sig) {
      UI_last['gong-cls'] = sig;
      gong.classList.toggle('rushing', !!rushing);
    }
  }
  UI_set('gong-taps', rushing ? 'RUSH!' : ((g.taps || 0) + '/' + need + ' to rush'));
}
function UI_tapGong() {
  if (!UI_G.act || typeof UI_G.act.tapGong !== 'function') return;
  var res = UI_G.act.tapGong() || {};
  try {
    if (navigator.vibrate) navigator.vibrate(res.rush ? [20, 40, 20] : 12);
  } catch (err) { /* silent */ }
  UI_sfx('gong');
  var gong = UI_elOf('night-gong');
  if (gong) {
    gong.classList.remove('pressed');
    void gong.offsetWidth;
    gong.classList.add('pressed');
    setTimeout(function () { gong.classList.remove('pressed'); }, 120);
  }
  if (res.rush) UI_toast('Rush! The crowd surges — 3x coins!');
}

/* ---------- dish tray ---------- */
function UI_updateTray() {
  var s = UI_G.state;
  var n = Math.floor(s.dishes || 0), cap = UI_DISH_CAP();
  var icons = '';
  for (var i = 0; i < cap; i++) {
    icons += '<span class="dish-dot' + (i < n ? '' : ' empty') + '"></span>';
  }
  UI_setHTML('dish-icons', icons);
  var btn = UI_elOf('dish-sell');
  if (btn) {
    var dv = (s.rates && s.rates.dishValue) || 0;
    var label = n > 0 ? 'SELL ' + n + ' · +' + UI_fmt(n * dv) : 'SELL';
    var afford = n > 0;
    var sig = label + '|' + afford;
    if (UI_last['dish-sell'] !== sig) {
      UI_last['dish-sell'] = sig;
      btn.textContent = label;
      btn.classList.toggle('can-afford', afford);
    }
  }
}
function UI_collectDishes() {
  if (!UI_G.act || typeof UI_G.act.collectDishes !== 'function') return;
  var res = UI_G.act.collectDishes() || {};
  if (res.n > 0) {
    UI_sfx('claim');
    UI_toast('Dishes sold: +' + UI_fmt(res.coins) + ' coins');
  } else {
    UI_toast('The woks are still sizzling…');
  }
}

/* ---------- edge-left recommend (per CONTRACTS: via NM.sim.recommendedBuy) ---------- */
function UI_recommend() {
  var s = UI_G.state, rec = null;
  try {
    if (NM.sim && typeof NM.sim.recommendedBuy === 'function') rec = NM.sim.recommendedBuy(s);
  } catch (err) { rec = null; }
  if (!rec) return null;
  var label = rec.id;
  if (rec.kind === 'stall') label = UI_stallName(rec.id);
  else if (rec.kind === 'upgrade') {
    var ups = UI_upgrades();
    for (var i = 0; i < ups.length; i++) if (ups[i].id === rec.id) label = ups[i].name;
  } else if (rec.kind === 'staff') {
    var stf = UI_staff();
    for (var j = 0; j < stf.length; j++) if (stf[j].id === rec.id) label = stf[j].name;
  }
  var cps = UI_cps();
  var tta = s.coins >= rec.cost ? 0 : (cps > 0 ? (rec.cost - s.coins) / cps : Infinity);
  return { kind: rec.kind, id: rec.id, label: label, cost: rec.cost, tta: tta };
}
function UI_updateEdgeLeft() {
  var rec = UI_recommend();
  if (!rec) { UI_set('edge-left-text', '—'); return; }
  UI_set('edge-left-text', rec.label + (rec.tta === 0 ? ' · READY' : ' · ' + UI_fmtTime(rec.tta)));
}
function UI_goRecommend() {
  var rec = UI_recommend();
  if (!rec) { UI_toast('Nothing to recommend yet — enjoy the night'); return; }
  UI_sfx('uiTick');
  if (rec.kind === 'staff') UI_openSheet('crew');
  else UI_openSheet('stalls');
}

/* =====================================================================
   SHEETS
   ===================================================================== */
function UI_openSheet(name) {
  UI_sheet = name;
  UI_seasonArmed = false;
  UI_resetArmed = false;
  var sh = UI_elOf('sheet');
  if (sh) sh.hidden = false;
  UI_set('sheet-title', UI_sheetTitle(name));
  var bp = UI_elOf('bulk-pill');
  if (bp) bp.hidden = (name !== 'stalls');
  UI_renderSheet(true);
  UI_updateTabs();
}
function UI_closeSheet() {
  UI_sheet = null;
  UI_sheetSig = '';
  var sh = UI_elOf('sheet');
  if (sh) sh.hidden = true;
  UI_updateTabs();
}
function UI_sheetTitle(name) {
  return { stalls: 'Stalls', crew: 'Crew', guests: 'Guestbook', season: 'New Season', quests: 'Tonight\u2019s Quests', settings: 'Settings' }[name] || name;
}
function UI_sheetSignature(name) {
  var s = UI_G.state;
  if (name === 'stalls') {
    var bits = [Math.floor(s.coins), UI_bulk];
    var stalls = UI_stalls();
    for (var i = 0; i < stalls.length; i++) bits.push(UI_owned(stalls[i].id));
    bits.push(Object.keys(s.upgrades || {}).length);
    return bits.join('|');
  }
  if (name === 'crew') return [Math.floor(s.coins), (s.staff || []).length].join('|');
  if (name === 'guests') {
    var v = 0, regs = s.regulars || {};
    for (var k in regs) v += (regs[k] && regs[k].visits) || 0;
    return 'g' + v;
  }
  if (name === 'season') return [Math.floor((s.season && s.season.earned) || 0), s.lanterns || 0].join('|');
  if (name === 'quests') {
    var q = UI_questsState(), keys = Object.keys(q.prog || {}).sort(), b = [];
    for (var i2 = 0; i2 < keys.length; i2++) b.push(keys[i2] + ':' + q.prog[keys[i2]]);
    return b.join(',') + '|' + Object.keys(q.done || {}).length + '|' + (q.streak || 0);
  }
  return '';
}
function UI_renderSheet(force) {
  if (!UI_sheet) return;
  if (UI_sheet === 'settings') { // never auto-clobber textareas
    if (force) UI_renderSettings();
    return;
  }
  var sig = UI_sheetSignature(UI_sheet);
  if (!force && sig === UI_sheetSig) return;
  UI_sheetSig = sig;
  var html = '';
  if (UI_sheet === 'stalls') html = UI_htmlStalls();
  else if (UI_sheet === 'crew') html = UI_htmlCrew();
  else if (UI_sheet === 'guests') html = UI_htmlGuests();
  else if (UI_sheet === 'season') html = UI_htmlSeason();
  else if (UI_sheet === 'quests') html = UI_htmlQuests();
  var body = UI_elOf('sheet-body');
  if (body) {
    UI_last['sheet-scroll-' + UI_sheet] = body.scrollTop;
    body.innerHTML = html;
    body.scrollTop = UI_last['sheet-scroll-' + UI_sheet] || 0;
  }
}
function UI_refreshSheet() { UI_renderSheet(false); }

/* ----- stalls sheet ----- */
function UI_stallUnlocked(d) {
  if (UI_owned(d.id) > 0) return true;
  var at = d.unlockAt;
  if (at == null) return true;
  var earned = (UI_G.state.stats && UI_G.state.stats.earnedTotal) || 0;
  if (typeof at === 'number') return earned >= at;
  if (typeof at === 'object') {
    if (at.coins != null) return earned >= at.coins;
    if (at.earned != null) return earned >= at.earned;
  }
  return false;
}
function UI_milestoneBar(owned) {
  var ms = UI_MILESTONES();
  var prev = 0, next = ms[ms.length - 1], idx = -1;
  for (var i = 0; i < ms.length; i++) {
    if (owned >= ms[i]) { prev = ms[i]; idx = i; }
    else { next = ms[i]; break; }
  }
  if (owned >= ms[ms.length - 1]) { prev = ms[ms.length - 2]; next = ms[ms.length - 1]; }
  var fill = next > prev ? Math.min(1, Math.max(0, (owned - prev) / (next - prev))) : 1;
  var away = Math.max(0, next - owned);
  var pips = '';
  var lo = Math.log(1), hi = Math.log(ms[ms.length - 1]);
  for (var j = 0; j < ms.length; j++) {
    var pos = (Math.log(ms[j]) - lo) / (hi - lo) * 100;
    pips += '<span class="ms-pip' + (owned >= ms[j] ? ' lit' : '') + '" style="left:' + pos.toFixed(1) + '%"></span>';
  }
  var note = away > 0
    ? '<div class="ms-note">' + away + ' away from 2x</div>'
    : '<div class="ms-note">max flavor reached</div>';
  return '<div class="ms-track"><div class="ms-fill" style="width:' + (fill * 100).toFixed(1) + '%"></div>' + pips + '</div>' + note;
}
function UI_htmlStalls() {
  var stalls = UI_stalls(), s = UI_G.state;
  var html = '<div class="sheet-sub">Every cart a lantern. Every lantern a little more coin.</div>';
  for (var i = 0; i < stalls.length; i++) {
    var d = stalls[i], owned = UI_owned(d.id);
    var unlocked = UI_stallUnlocked(d);
    if (!unlocked) {
      html += '<div class="stall-row locked plaque">' +
        '<div class="stall-ic">' + UI_stallIcon(d.id) + '</div>' +
        '<div><div class="stall-name">' + UI_esc(d.name) + '</div>' +
        '<div class="stall-lock-hint">' + UI_esc(d.unlockHint || 'Not open yet') + '</div></div>' +
        '<div class="stall-buycol"><span class="ic" style="color:var(--faint)">' + UI_icon('nm-lock') + '</span></div>' +
        '</div>';
      continue;
    }
    var qty = UI_bulkQty(d.id);
    var cost = UI_costFor(d.id, owned, qty);
    var afford = s.coins >= cost;
    var tta = UI_ttaLabel(UI_timeToAfford(cost));
    var perStall = (s.rates && s.rates.perStall && s.rates.perStall[d.id]) || d.baseRate || 0;
    html += '<div class="stall-row plaque" data-row-stall="' + UI_esc(d.id) + '">' +
      '<div class="stall-ic">' + UI_stallIcon(d.id) + '</div>' +
      '<div><div class="stall-name">' + UI_esc(d.name) + ' <span class="stall-count num">x' + owned + '</span></div>' +
      '<div class="stall-rate num">' + UI_fmtRate(owned * perStall) + '</div>' +
      UI_milestoneBar(owned) + '</div>' +
      '<div class="stall-buycol">' +
      '<button class="buy-btn num' + (afford ? ' can-afford' : '') + '" data-buy-stall="' + UI_esc(d.id) + '">' + UI_fmt(cost) + '</button>' +
      '<span class="' + tta.cls + '">' + UI_esc(tta.text) + '</span>' +
      '</div></div>';
  }
  // house upgrades
  var ups = UI_upgrades(), ownedU = s.upgrades || {};
  html += '<div class="sect-title">House Specials</div>';
  var anyUp = false;
  for (var j = 0; j < ups.length; j++) {
    var u = ups[j];
    anyUp = true;
    if (ownedU[u.id]) {
      html += '<div class="upg-card plaque"><div><div class="upg-name">' + UI_esc(u.name) + '</div>' +
        '<div class="upg-effect">' + UI_esc(UI_effectText(u.effect)) + '</div></div>' +
        '<span class="upg-owned">HUNG UP</span></div>';
    } else {
      var ua = s.coins >= u.cost;
      html += '<div class="upg-card plaque"><div><div class="upg-name">' + UI_esc(u.name) + '</div>' +
        '<div class="upg-blurb">' + UI_esc(u.blurb || '') + '</div>' +
        '<div class="upg-effect">' + UI_esc(UI_effectText(u.effect)) + '</div></div>' +
        '<button class="buy-btn num' + (ua ? ' can-afford' : '') + '" data-buy-upg="' + UI_esc(u.id) + '">' + UI_fmt(u.cost) + '</button></div>';
    }
  }
  if (!anyUp) html += '<div class="sheet-sub">Nothing on the board yet.</div>';
  return html;
}

/* ----- crew sheet ----- */
function UI_htmlCrew() {
  var staff = UI_staff(), s = UI_G.state;
  var hired = {};
  (s.staff || []).forEach(function (id) { hired[id] = true; });
  var html = '<div class="sheet-sub">Good help is hard to find. Great help costs coins.</div>';
  for (var i = 0; i < staff.length; i++) {
    var p = staff[i];
    if (hired[p.id]) {
      html += '<div class="crew-card plaque"><div>' +
        '<div class="crew-name">' + UI_esc(p.name) + '</div>' +
        '<div class="crew-role">' + UI_esc(p.role) + '</div>' +
        '<div class="crew-effect">' + UI_esc(UI_effectText(p.effect)) + '</div></div>' +
        '<span class="crew-hired">ON THE TEAM</span></div>';
    } else {
      var afford = s.coins >= p.cost;
      html += '<div class="crew-card plaque"><div>' +
        '<div class="crew-name">' + UI_esc(p.name) + '</div>' +
        '<div class="crew-role">' + UI_esc(p.role) + '</div>' +
        '<div class="crew-flavor">' + UI_esc(p.flavor || '') + '</div>' +
        '<div class="crew-effect">' + UI_esc(UI_effectText(p.effect)) + '</div></div>' +
        '<button class="ticket-btn" data-hire="' + UI_esc(p.id) + '" style="min-height:48px;padding:10px 16px;' +
        (afford ? '' : 'filter:grayscale(.7) brightness(.75);') + '">HIRE<br><span class="num" style="font-size:12px;letter-spacing:.04em">' +
        UI_fmt(p.cost) + '</span></button></div>';
    }
  }
  return html;
}

/* ----- guests sheet ----- */
function UI_guestFigure(seen) {
  if (!seen) {
    return '<svg class="ic" viewBox="0 0 40 52"><circle cx="20" cy="12" r="7" fill="currentColor"/>' +
      '<path d="M8 48c2-10 6-15 12-15s10 5 12 15z" fill="currentColor"/></svg>';
  }
  return '<svg class="ic" viewBox="0 0 40 52">' +
    '<circle cx="20" cy="12" r="7" fill="#EED7B0" stroke="#3A2438" stroke-width="1.6"/>' +
    '<path d="M8 48c2-10 6-15 12-15s10 5 12 15z" fill="#D8AB4E" stroke="#3A2438" stroke-width="1.6"/>' +
    '<path d="M14 33c2 1.5 4 2 6 2s4-.5 6-2" fill="none" stroke="#3A2438" stroke-width="1.2"/></svg>';
}
function UI_htmlGuests() {
  var regs = UI_regulars(), s = UI_G.state;
  var html = '<div class="sheet-sub">Regulars, rumors, and familiar faces.</div><div class="book-grid">';
  for (var i = 0; i < regs.length; i++) {
    var r = regs[i];
    var rec = (s.regulars && s.regulars[r.id]) || null;
    var seen = rec && rec.visits > 0;
    html += '<div class="book-cell plaque ' + (seen ? 'seen' : 'unseen') + '">' +
      '<div class="book-fig">' + UI_guestFigure(seen) + '</div>' +
      '<div class="book-name">' + (seen ? UI_esc(r.name) : '???') + '</div>';
    if (seen) {
      html += '<div class="book-meta num">' + rec.visits + ' visit' + (rec.visits === 1 ? '' : 's') + '<br>' +
        'loves ' + UI_esc(UI_stallName(r.favorite)) + '</div>';
      if (rec.memento && r.memento) {
        html += '<div class="book-memento">' + UI_esc(r.memento.text || r.memento.name || '') + '</div>';
      }
    } else {
      html += '<div class="book-meta">not yet met</div>';
    }
    html += '</div>';
  }
  return html + '</div>';
}

/* ----- season sheet ----- */
function UI_htmlSeason() {
  var s = UI_G.state, pv = UI_seasonPreview();
  var n = (s.season && s.season.n) || 1;
  var earned = (s.season && s.season.earned) || 0;
  var playT = (s.stats && s.stats.playTime) || 0;
  var html = '<div class="season-hero">' +
    '<div class="season-n">Season ' + n + '</div>' +
    '<div class="season-big num">' + UI_fmtInt(pv.lanterns) + ' ' + UI_icon('nm-lantern', 'ic') + '</div>' +
    '<div class="sheet-sub">lanterns waiting at dawn</div>' +
    '<div class="season-mult">Multiplier <b class="num">' + pv.multNow.toFixed(2) + 'x</b> &rarr; <b class="num">' + pv.multNext.toFixed(2) + 'x</b></div>' +
    '</div>' +
    '<div class="stat-grid">' +
    '<div class="stat-cell plaque"><div class="stat-v num">' + UI_fmt(earned) + '</div><div class="stat-k">earned this season</div></div>' +
    '<div class="stat-cell plaque"><div class="stat-v num">' + UI_fmtTime(playT) + '</div><div class="stat-k">tended</div></div>' +
    '<div class="stat-cell plaque"><div class="stat-v num">' + UI_fmtInt(s.lanterns || 0) + '</div><div class="stat-k">lanterns hoarded</div></div>' +
    '<div class="stat-cell plaque"><div class="stat-v num">' + UI_fmtInt((s.stats && s.stats.earnedTotal) || 0) + '</div><div class="stat-k">all-time earnings</div></div>' +
    '</div>';
  var sus = UI_seasonUpgrades();
  if (sus.length) {
    html += '<div class="sect-title">Spend Lanterns</div>';
    for (var i = 0; i < sus.length; i++) {
      var u = sus[i];
      var owned = s.seasonUpgrades && s.seasonUpgrades[u.id];
      if (owned) {
        html += '<div class="upg-card plaque"><div><div class="upg-name">' + UI_esc(u.name) + '</div>' +
          '<div class="upg-effect">' + UI_esc(UI_effectText(u.effect)) + '</div></div>' +
          '<span class="upg-owned">LIT</span></div>';
      } else {
        var afford = (s.lanterns || 0) >= u.cost;
        html += '<div class="upg-card plaque"><div><div class="upg-name">' + UI_esc(u.name) + '</div>' +
          '<div class="upg-blurb">' + UI_esc(u.blurb || '') + '</div>' +
          '<div class="upg-effect">' + UI_esc(UI_effectText(u.effect)) + '</div></div>' +
          '<button class="buy-btn num' + (afford ? ' can-afford' : '') + '" data-buy-seasupg="' + UI_esc(u.id) + '">' +
          UI_fmtInt(u.cost) + ' ' + UI_icon('nm-lantern', 'ic') + '</button></div>';
      }
    }
  }
  html += '<div class="sect-title">Close Up Shop</div>' +
    '<div class="sheet-sub">Pack up the carts, count the lanterns, and start fresh at dawn. ' +
    'Regulars, quests, and records come with you — coins and stalls start over.</div>' +
    '<button class="ticket-btn season-confirm' + (UI_seasonArmed ? ' armed' : '') + '" data-season-confirm>' +
    (UI_seasonArmed ? 'Really begin a new season?' : 'Begin a New Season') + '</button>';
  return html;
}

/* ----- quests sheet ----- */
function UI_htmlQuests() {
  var defs = UI_questDefs(), q = UI_questsState();
  var html = '<div class="streak-row plaque">' + UI_icon('nm-lantern') +
    '<span class="streak-n num">' + (q.streak || 0) + '-night streak</span>' +
    '<span class="sheet-sub" style="margin:0">come back tomorrow, boss</span></div>';
  for (var i = 0; i < defs.length; i++) {
    var d = defs[i];
    var prog = Math.min(q.prog[d.id] || 0, d.target);
    var done = !!q.done[d.id];
    var pct = d.target > 0 ? (prog / d.target * 100) : 0;
    html += '<div class="q-row plaque"><div class="q-top">' +
      '<span class="q-text">' + UI_esc(d.text) + '</span>' +
      '<span class="q-prog num">' + prog + '/' + d.target + '</span></div>' +
      '<div class="q-bar"><div class="q-fill" style="width:' + pct.toFixed(1) + '%"></div></div>' +
      '<div class="q-reward">reward: ' + UI_esc(UI_rewardText(d.reward)) + '</div>' +
      (done ? '<div class="q-done">DONE</div>' : '') + '</div>';
  }
  var hrCoins = 2 * 3600 * UI_cps();
  html += '<button class="ticket-btn hourglass-btn" data-hourglass>' + UI_icon('nm-hourglass') +
    '<span>2h earnings, on the house<br><span class="hourglass-sub num">about ' + UI_fmt(hrCoins) + ' coins</span></span></button>';
  return html;
}

/* ----- settings sheet (rendered only on open, never auto-refreshed) ----- */
function UI_renderSettings() {
  var s = UI_G.state;
  var muted = !!(s.settings && s.settings.mute);
  var html = '<div class="set-row plaque"><div>' +
    '<div class="set-label">Quiet night</div>' +
    '<div class="set-desc">Mute the sizzle, the crowd, and the plucks.</div></div>' +
    '<label class="toggle"><input type="checkbox" id="set-mute"' + (muted ? ' checked' : '') + '><span class="tk"></span></label></div>' +
    '<div class="sect-title">Save Scroll</div>' +
    '<div class="set-row plaque" style="display:block"><div class="set-desc" style="margin-bottom:8px">Copy this somewhere safe — it is your whole market in a string.</div>' +
    '<textarea class="codebox" id="set-export" readonly></textarea>' +
    '<div class="code-row"><button class="ticket-btn" data-export-copy>Copy</button></div></div>' +
    '<div class="set-row plaque" style="display:block"><div class="set-desc" style="margin-bottom:8px">Paste a save scroll to move markets.</div>' +
    '<textarea class="codebox" id="set-import" placeholder="paste save here…"></textarea>' +
    '<div class="code-row"><button class="ticket-btn" data-import-go>Import</button></div></div>' +
    '<div class="sect-title">Say Goodnight</div>' +
    '<div class="set-row plaque"><div>' +
    '<div class="set-label">Close the market for good</div>' +
    '<div class="set-desc">Wipes every coin, stall, and regular. There is no undo.</div></div>' +
    '<button class="ticket-btn" data-reset style="min-height:44px;padding:10px 16px' +
    (UI_resetArmed ? ';background-color:#8f1f16' : '') + '">' +
    (UI_resetArmed ? 'REALLY?' : 'RESET') + '</button></div>';
  var body = UI_elOf('sheet-body');
  if (body) body.innerHTML = html;
  var m = document.getElementById('set-mute');
  if (m) m.addEventListener('change', function () {
    if (UI_G.act && typeof UI_G.act.toggleMute === 'function') UI_G.act.toggleMute();
    UI_sfx('uiTick');
  });
  var ex = document.getElementById('set-export');
  if (ex && UI_G.act && typeof UI_G.act.export === 'function') {
    try { ex.value = UI_G.act.export() || ''; } catch (err) { /* silent */ }
  }
}

/* =====================================================================
   STALL MINI-PANEL (anchored on the diorama)
   ===================================================================== */
function UI_openStallPanel(id) {
  var d = UI_stallDef(id);
  if (!d) return;
  UI_panelStall = id;
  var p = UI_elOf('stall-panel');
  if (!p) return;
  p.hidden = false;
  UI_fillPanel();
  // position at the stall anchor (CSS px, canvas space -> wrap space)
  var x = 120, y = 200;
  try {
    if (UI_R && typeof UI_R.stallAnchor === 'function') {
      var a = UI_R.stallAnchor(id);
      var c = UI_elOf('diorama').getBoundingClientRect();
      var w = UI_elOf('diorama-wrap').getBoundingClientRect();
      x = a.x + (c.left - w.left);
      y = a.y + (c.top - w.top);
    }
  } catch (err) { /* fall back to defaults */ }
  var wrap = UI_elOf('diorama-wrap');
  var ww = wrap ? wrap.clientWidth : 390, wh = wrap ? wrap.clientHeight : 600;
  x = Math.max(116, Math.min(ww - 116, x));
  y = Math.max(170, Math.min(wh - 10, y));
  p.style.left = x + 'px';
  p.style.top = y + 'px';
  UI_sfx('uiTick');
}
function UI_fillPanel() {
  var p = UI_elOf('stall-panel');
  if (!p || !UI_panelStall) return;
  var d = UI_stallDef(UI_panelStall), s = UI_G.state;
  if (!d) { UI_closeStallPanel(); return; }
  var owned = UI_owned(d.id);
  var perStall = (s.rates && s.rates.perStall && s.rates.perStall[d.id]) || d.baseRate || 0;
  var qty = UI_bulkQty(d.id);
  var cost = UI_costFor(d.id, owned, qty);
  var afford = s.coins >= cost;
  var tta = UI_ttaLabel(UI_timeToAfford(cost));
  var bulkBtns = ['x1', 'x10', 'max'].map(function (b) {
    return '<button data-pbulk="' + b + '" class="' + (UI_bulk === b ? 'on' : '') + '">' + (b === 'max' ? 'Max' : b) + '</button>';
  }).join('');
  var sig = [d.id, owned, UI_bulk, Math.floor(s.coins), qty].join('|');
  if (UI_last['panel'] === sig) return;
  UI_last['panel'] = sig;
  p.innerHTML =
    '<div class="sp-name">' + UI_esc(d.name) + '</div>' +
    '<div class="sp-level num">LEVEL ' + owned + ' · ' + UI_fmtRate(owned * perStall) + '</div>' +
    '<div class="sp-effect">' + UI_esc(d.blurb || '') + '</div>' +
    '<div class="sp-bulk">' + bulkBtns + '</div>' +
    '<div class="sp-row"><span class="sp-cost num">' + UI_fmt(cost) + ' coins</span>' +
    '<span class="' + tta.cls + '">' + UI_esc(tta.text) + '</span></div>' +
    '<button class="buy-btn sp-buy num' + (afford ? ' can-afford' : '') + '" data-buy-stall="' + UI_esc(d.id) + '">BUY ' +
    (UI_bulk === 'max' ? 'MAX' : '×' + qty) + '</button>';
}
function UI_refreshPanel() { UI_fillPanel(); }
function UI_closeStallPanel() {
  UI_panelStall = null;
  UI_last['panel'] = '';
  var p = UI_elOf('stall-panel');
  if (p) p.hidden = true;
}

/* =====================================================================
   WELCOME-BACK overlay (dimmed, never blocking; tap anywhere collects)
   ===================================================================== */
function UI_showWelcome(info) {
  UI_welcomeInfo = info || {};
  UI_welcomeClaimed = false;
  var w = UI_elOf('welcome');
  if (!w) return;
  var away = UI_fmtTime(info.awaySec || 0);
  var visitors = info.visitors || [];
  var line = 'away ' + away + ' \u00b7 +' + UI_fmt(info.coins || 0) + ' coins';
  var totalVisits = 0;
  for (var vi = 0; vi < visitors.length; vi++) totalVisits += (visitors[vi].visits || 1);
  if (totalVisits > 0) line += ' \u00b7 ' + totalVisits + ' regular' + (totalVisits === 1 ? '' : 's') + ' visited';
  UI_set('welcome-line', line);
  var vv = '';
  for (var i = 0; i < visitors.length && i < 3; i++) {
    vv += '<div><b>' + UI_esc(visitors[i].name || visitors[i].id) + '</b> stopped by</div>';
  }
  var mems = info.newMementos || [];
  for (var j = 0; j < mems.length && j < 2; j++) {
    vv += '<div><b>' + UI_esc(mems[j].name || '') + '</b> left a memento</div>';
  }
  if (info.dishes) vv += '<div>The till holds ' + info.dishes + ' dishes, still warm.</div>';
  if (!vv) vv = '<div>The lanterns kept burning.</div>';
  UI_setHTML('welcome-visitors', vv);
  w.hidden = false;
  UI_sfx('claim');
}
function UI_claimWelcome() {
  if (UI_welcomeClaimed) return;
  UI_welcomeClaimed = true;
  if (UI_G.act && typeof UI_G.act.claimWelcome === 'function') UI_G.act.claimWelcome();
  var w = UI_elOf('welcome');
  if (w) w.hidden = true;
  UI_welcomeInfo = null;
}

/* =====================================================================
   ENCOUNTER choice card — small, warm, dismissible; never a blocking modal.
   Shown when the player taps the drifting visitor (render hitTest
   {kind:'visitor'}); auto-dismisses when the encounter expires.
   ===================================================================== */
function UI_encounterActive() {
  var s = UI_G.state;
  return (s.encounters && s.encounters.active) || null;
}
function UI_visitorDef(kind) {
  if (UI_C && UI_C.VISITOR_MAP && UI_C.VISITOR_MAP[kind]) return UI_C.VISITOR_MAP[kind];
  var list = (UI_C && UI_C.VISITORS) || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === kind) return list[i];
  return null;
}
function UI_showEncounter() {
  var active = UI_encounterActive();
  var card = UI_elOf('encounter-card');
  if (!card) return false;
  if (!active) { UI_hideEncounter(); return false; }
  var def = UI_visitorDef(active.kind);
  var name = def ? def.name : 'A visitor';
  var flavor = def ? def.flavor : 'Someone stops by, just for a moment.';
  var windfall = Math.max(1, Math.floor(UI_cps() * 300));
  var nm = UI_elOf('enc-name');
  if (nm) nm.textContent = name;
  var fl = UI_elOf('enc-flavor');
  if (fl) fl.textContent = flavor;
  var w = UI_elOf('enc-windfall');
  if (w) w.innerHTML = 'Accept the gift<span class="enc-wind num">+' + UI_fmt(windfall) + ' coins</span>';
  var b = UI_elOf('enc-boost');
  if (b) b.innerHTML = 'Share tea<span class="enc-wind">2&times; coins for 30s</span>';
  if (!UI_encShown) {
    card.hidden = false;
    UI_encShown = true;
    UI_sfx('uiTick');
  }
  return true;
}
function UI_hideEncounter() {
  if (!UI_encShown) return;
  UI_encShown = false;
  var card = UI_elOf('encounter-card');
  if (card) card.hidden = true;
}
function UI_pollEncounter() {
  // auto-dismiss when the encounter expires or is claimed elsewhere
  if (UI_encShown && !UI_encounterActive()) UI_hideEncounter();
}
function UI_claimEncounterChoice(choice) {
  if (!UI_G.act || typeof UI_G.act.claimEncounter !== 'function') return;
  var res = UI_G.act.claimEncounter(choice) || {};
  UI_hideEncounter();
  if (res.ok) {
    if (choice === 'windfall') {
      UI_sfx('claim');
      UI_toast('A gift! +' + UI_fmt(res.coins || 0) + ' coins — they bow and vanish.');
    } else {
      UI_sfx('claim');
      UI_toast('Warm tea, warm luck — 2x coins for 30s.');
    }
  } else {
    UI_toast('They wandered off into the crowd…');
  }
}
function UI_dismissEncounter() {
  if (UI_G.act && typeof UI_G.act.dismissEncounter === 'function') UI_G.act.dismissEncounter();
  UI_hideEncounter();
}

/* ---------- canvas tap dispatch: till / stall / visitor (render hitTest) ---------- */
function UI_canvasTap(ev) {
  var c = UI_elOf('diorama');
  if (!c || !UI_R || typeof UI_R.hitTest !== 'function') return;
  var r = c.getBoundingClientRect();
  var hit = null;
  try { hit = UI_R.hitTest(ev.clientX - r.left, ev.clientY - r.top); }
  catch (err) { hit = null; }
  if (!hit) { UI_closeStallPanel(); return; }
  if (hit.kind === 'till') { UI_collectDishes(); return; }
  if (hit.kind === 'stall' && hit.id) { UI_openStallPanel(hit.id); return; }
  if (hit.kind === 'visitor') { UI_showEncounter(); return; }
}

/* =====================================================================
   BUY / ACTION handlers (delegated)
   ===================================================================== */
function UI_buyStall(id) {
  var act = UI_G.act;
  if (!act || typeof act.buyStall !== 'function') return;
  var d = UI_stallDef(id);
  var qty = UI_bulk === 'max'
    ? (typeof act.buyMax === 'function' ? 'max' : UI_maxAffordable(id, UI_G.state.coins))
    : UI_bulkQty(id);
  var res = qty === 'max' ? act.buyMax(id) : act.buyStall(id, qty);
  res = res || {};
  if (res.ok) {
    UI_sfx('buy');
    UI_toast('Bought ' + (res.bought || qty) + ' × ' + (d ? d.name : id) + '!');
    UI_sheetSig = ''; UI_renderSheet(true);
  } else {
    UI_toast('Not enough coins yet — soon.');
  }
}
function UI_buyUpgrade(id) {
  var act = UI_G.act;
  if (!act || typeof act.buyUpgrade !== 'function') return;
  var res = act.buyUpgrade(id) || {};
  var ups = UI_upgrades(), u = null;
  for (var i = 0; i < ups.length; i++) if (ups[i].id === id) u = ups[i];
  if (res.ok) {
    UI_sfx('buy');
    UI_toast((u ? u.name : 'Upgrade') + ' — hung up with pride.');
    UI_sheetSig = ''; UI_renderSheet(true);
  } else {
    UI_toast('Not enough coins yet — soon.');
  }
}
function UI_hireStaff(id) {
  var act = UI_G.act;
  if (!act || typeof act.hireStaff !== 'function') return;
  var res = act.hireStaff(id) || {};
  var staff = UI_staff(), p = null;
  for (var i = 0; i < staff.length; i++) if (staff[i].id === id) p = staff[i];
  if (res.ok) {
    UI_sfx('buy');
    UI_toast((p ? p.name : 'Someone') + ' joined the crew!');
    UI_sheetSig = ''; UI_renderSheet(true);
  } else {
    UI_toast('Not enough coins yet — soon.');
  }
}
function UI_doSeason() {
  if (!UI_seasonArmed) {
    UI_seasonArmed = true;
    UI_sheetSig = ''; UI_renderSheet(true);
    UI_toast('Tap again — the night ends when you say so.');
    return;
  }
  if (UI_G.act && typeof UI_G.act.doSeason === 'function') {
    UI_G.act.doSeason();
    UI_sfx('gong');
    UI_seasonArmed = false;
    UI_closeSheet();
    UI_toast('A new season dawns. The lanterns remember you.');
  }
}
function UI_handleSheetClick(ev) {
  var t = ev.target;
  while (t && t !== ev.currentTarget && !t.getAttribute) t = t.parentNode;
  if (!t || t === ev.currentTarget) return;
  function attr(name) {
    var n = t;
    while (n && n !== ev.currentTarget) {
      if (n.getAttribute && n.getAttribute(name) != null) return n.getAttribute(name);
      n = n.parentNode;
    }
    return null;
  }
  var b;
  if ((b = attr('data-buy-stall'))) { UI_buyStall(b); return; }
  if ((b = attr('data-buy-upg'))) { UI_buyUpgrade(b); return; }
  if ((b = attr('data-hire'))) { UI_hireStaff(b); return; }
  if ((b = attr('data-buy-seasupg'))) {
    if (UI_G.act && typeof UI_G.act.buySeasonUpgrade === 'function') {
      var r = UI_G.act.buySeasonUpgrade(b) || {};
      UI_toast(r.ok ? 'Another lantern lit.' : 'Not enough lanterns yet.');
      UI_sheetSig = ''; UI_renderSheet(true);
    } else {
      UI_toast('The keeper will handle that shortly.');
    }
    return;
  }
  if (attr('data-season-confirm') != null) { UI_doSeason(); return; }
  if ((b = attr('data-bulk'))) {
    UI_bulk = b;
    var btns = ev.currentTarget.querySelectorAll('#bulk-pill button');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i].getAttribute('data-bulk') === b);
    UI_sfx('uiTick');
    UI_sheetSig = ''; UI_renderSheet(true);
    return;
  }
  if ((b = attr('data-pbulk'))) {
    UI_bulk = b;
    UI_sfx('uiTick');
    UI_last['panel'] = ''; UI_fillPanel();
    return;
  }
  if (attr('data-hourglass') != null) {
    if (UI_G.act && typeof UI_G.act.claimHourglass === 'function') {
      var hr = UI_G.act.claimHourglass() || {};
      UI_toast(hr.ok ? 'On the house: +' + UI_fmt(hr.coins || 0) + ' coins' : 'Come back tomorrow for another.');
      UI_sfx('claim');
    } else {
      UI_toast('The house is polishing the hourglass…');
    }
    return;
  }
  if (attr('data-export-copy') != null) {
    var ta = document.getElementById('set-export');
    var done = function (ok) { UI_toast(ok ? 'Save scroll copied.' : 'Copy it by hand, boss.'); };
    if (ta && ta.value && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(function () { done(true); }, function () { done(false); });
    } else if (ta && ta.value) {
      ta.select();
      try { done(document.execCommand('copy')); } catch (e) { done(false); }
    } else done(false);
    return;
  }
  if (attr('data-import-go') != null) {
    var imp = document.getElementById('set-import');
    if (imp && imp.value.trim() && UI_G.act && typeof UI_G.act.import === 'function') {
      var ok = UI_G.act.import(imp.value.trim());
      UI_toast(ok ? 'Market moved. Welcome home.' : 'That scroll looks smudged — try again.');
      if (ok) { UI_sheetSig = ''; }
    } else {
      UI_toast('Paste a save scroll first.');
    }
    return;
  }
  if (attr('data-reset') != null) {
    if (!UI_resetArmed) {
      UI_resetArmed = true;
      UI_renderSettings();
      UI_toast('Tap again — everything goes dark.');
      return;
    }
    if (UI_G.act && typeof UI_G.act.reset === 'function') UI_G.act.reset();
    UI_resetArmed = false;
    UI_closeSheet();
    return;
  }
}

/* =====================================================================
   INIT
   ===================================================================== */
function UI_init(G) {
  UI_G = G;
  UI_F = NM.format || null;
  UI_C = NM.content || null;
  UI_R = NM.render || null;
  UI_el = {};
  UI_last = {};

  // gong: press squash on pointerdown, strike on click
  var gong = UI_elOf('night-gong');
  if (gong) {
    gong.addEventListener('pointerdown', function () { gong.classList.add('pressed'); });
    gong.addEventListener('pointerup', function () { gong.classList.remove('pressed'); });
    gong.addEventListener('pointercancel', function () { gong.classList.remove('pressed'); });
    gong.addEventListener('click', function (ev) { ev.stopPropagation(); UI_tapGong(); });
  }

  var sell = UI_elOf('dish-sell');
  if (sell) sell.addEventListener('click', function (ev) { ev.stopPropagation(); UI_collectDishes(); });

  var tray = UI_elOf('dish-tray');
  if (tray) tray.addEventListener('click', function (ev) { ev.stopPropagation(); UI_collectDishes(); });

  // tabs
  var tabs = document.querySelectorAll('#tab-rail .tab');
  for (var i = 0; i < tabs.length; i++) {
    (function (tab) {
      tab.addEventListener('click', function () { UI_openTab(tab.getAttribute('data-tab')); });
    })(tabs[i]);
  }

  // edge helpers
  var el = UI_elOf('edge-left');
  if (el) el.addEventListener('click', function (ev) { ev.stopPropagation(); UI_goRecommend(); });
  var er = UI_elOf('edge-right');
  if (er) er.addEventListener('click', function (ev) { ev.stopPropagation(); UI_sfx('uiTick'); UI_openSheet('quests'); });

  // settings
  var sb = UI_elOf('settings-btn');
  if (sb) sb.addEventListener('click', function (ev) { ev.stopPropagation(); UI_sfx('uiTick'); UI_openSheet('settings'); });

  // sheet
  var card = UI_elOf('sheet-body');
  if (card) card.addEventListener('click', UI_handleSheetClick);
  var bp = UI_elOf('bulk-pill');
  if (bp) bp.addEventListener('click', UI_handleSheetClick);
  var bd = UI_elOf('sheet-backdrop');
  if (bd) bd.addEventListener('click', UI_closeSheet);
  var sc = UI_elOf('sheet-close');
  if (sc) sc.addEventListener('click', UI_closeSheet);

  // stall panel: delegated clicks inside; outside-tap closes
  var sp = UI_elOf('stall-panel');
  if (sp) sp.addEventListener('click', UI_handleSheetClick);
  var wrap = UI_elOf('diorama-wrap');
  if (wrap) {
    wrap.addEventListener('pointerdown', function (ev) {
      if (UI_panelStall && sp && !sp.hidden && !sp.contains(ev.target)) UI_closeStallPanel();
    }, true);
  }

  // welcome: tap anywhere collects
  var w = UI_elOf('welcome');
  if (w) w.addEventListener('click', function () { UI_claimWelcome(); });

  // canvas taps: till -> sell, stall -> mini-panel, visitor -> encounter card
  var cv = UI_elOf('diorama');
  if (cv) cv.addEventListener('click', function (ev) { UI_canvasTap(ev); });

  // encounter choice card buttons
  var ew = UI_elOf('enc-windfall');
  if (ew) ew.addEventListener('click', function (ev) { ev.stopPropagation(); UI_claimEncounterChoice('windfall'); });
  var eb = UI_elOf('enc-boost');
  if (eb) eb.addEventListener('click', function (ev) { ev.stopPropagation(); UI_claimEncounterChoice('boost'); });
  var ex = UI_elOf('enc-x');
  if (ex) ex.addEventListener('click', function (ev) { ev.stopPropagation(); UI_dismissEncounter(); });

  UI_tick();
  setInterval(UI_tick, 250);
  return NM.ui;
}

/* ---------- public surface ---------- */
NM.ui = {
  init: UI_init,
  toast: UI_toast,
  openSheet: UI_openSheet,
  closeSheet: UI_closeSheet,
  openStallPanel: UI_openStallPanel,
  closeStallPanel: UI_closeStallPanel,
  showWelcome: UI_showWelcome,
  showEncounter: UI_showEncounter,
  hideEncounter: UI_hideEncounter,
  refresh: function () { UI_sheetSig = ''; UI_renderSheet(true); UI_tick(); }
};

})();
