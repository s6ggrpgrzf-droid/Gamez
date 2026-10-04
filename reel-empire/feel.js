/* Reel Empire — feel layer: "glamorous, golden, dramatic".
 * Haptics, procedural SFX, gold-dust particles, marquee money reveals,
 * and studio settings (sound/haptics/reduced-motion). Feel/polish ONLY:
 * no gameplay, save-format, or AI changes. Everything here is guarded so
 * it can never throw (esp. on iOS, where navigator.vibrate is absent).
 */
(function () {
"use strict";

/* ============ prefs (separate key — save format untouched) ============ */
var PREFS_KEY = "reel-empire-prefs";
var prefs = { sound: true, haptics: true, reduce: false };

function sysReduced() {
  try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  catch (e) { return false; }
}
function loadPrefs() {
  try {
    var raw = localStorage.getItem(PREFS_KEY);
    if (raw) { var p = JSON.parse(raw); for (var k in prefs) if (p[k] !== undefined) prefs[k] = !!p[k]; }
    else prefs.reduce = sysReduced();
  } catch (e) { prefs.reduce = sysReduced(); }
  applyMotionClass();
}
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {} }
function motionReduced() { return !!prefs.reduce; }
function motionOK() { return !motionReduced(); }
function applyMotionClass() {
  try { document.documentElement.classList.toggle("rm", motionReduced()); } catch (e) {}
}

/* ============ haptics — named vocabulary, never throws ============ */
var HAP_PATTERNS = {
  select: [10],
  light: [20],
  medium: [30],
  success: [10, 40, 10],
  warning: [20, 60, 20],
  error: [40, 80, 40, 40, 80, 40]
};
function hap(name) {
  try {
    if (!prefs.haptics) return;
    if (motionReduced()) return;          // honor reduced motion
    var p = HAP_PATTERNS[name]; if (!p) return;
    if (!("vibrate" in navigator)) return; // iOS Safari: absent -> silent, never throws
    navigator.vibrate(p);
  } catch (e) {}
}

/* ============ procedural SFX — tiny WebAudio synth, no assets ============ */
var AC = null, masterGain = null;
function ac() {
  try {
    if (!prefs.sound) return null;
    if (!AC) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      AC = new C({ latencyHint: "interactive" });
      masterGain = AC.createGain();
      masterGain.gain.value = 0.3;
      masterGain.connect(AC.destination);
    }
    if (AC.state === "suspended") AC.resume();
    return AC;
  } catch (e) { return null; }
}
function tone(freq, dur, type, vol, when, slideTo) {
  try {
    var c = ac(); if (!c) return;
    var t = c.currentTime + (when || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(Math.max(20, freq), t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.4, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(masterGain);
    o.start(t); o.stop(t + dur + 0.05);
  } catch (e) {}
}
function noiseHit(dur, freq, vol, when, slideTo) {
  try {
    var c = ac(); if (!c) return;
    var t = c.currentTime + (when || 0);
    var len = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource(); src.buffer = buf;
    var f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 0.9;
    f.frequency.setValueAtTime(freq, t);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    var g = c.createGain();
    g.gain.setValueAtTime(vol || 0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(masterGain);
    src.start(t); src.stop(t + dur + 0.02);
  } catch (e) {}
}
/* Every cue has a visual twin — the game reads fully silent. */
var SFX = {
  tick:     function () { tone(740, 0.05, "square", 0.10); },
  pop:      function () { tone(520, 0.07, "triangle", 0.18, 0, 780); },
  clap:     function () { noiseHit(0.09, 2600, 0.5); tone(170, 0.09, "square", 0.22); }, // clapperboard snap
  whoosh:   function () { noiseHit(0.38, 500, 0.30, 0, 3200); },                          // release fanfare-ish
  drumroll: function () { for (var i = 0; i < 9; i++) noiseHit(0.05, 900, 0.22, i * 0.062); },
  tada:     function () { tone(659.25, 0.16, "sine", 0.32); tone(783.99, 0.16, "sine", 0.32, 0.09); tone(1046.5, 0.34, "sine", 0.34, 0.18); },
  chime:    function () { tone(880, 0.22, "sine", 0.26); tone(1318.5, 0.4, "sine", 0.24, 0.12); },
  fanfare:  function () { var n = [261.63, 329.63, 392.0, 523.25]; for (var i = 0; i < n.length; i++) { tone(n[i], 0.32, "sawtooth", 0.16, i * 0.13); tone(n[i] * 2, 0.3, "sine", 0.10, i * 0.13); } tone(1046.5, 0.7, "sine", 0.2, 0.52); },
  thud:     function () { tone(72, 0.55, "sine", 0.55, 0, 38); noiseHit(0.25, 160, 0.3); },
  warn:     function () { tone(220, 0.12, "square", 0.16); tone(196, 0.16, "square", 0.16, 0.18); }
};
function sfx(name) {
  try {
    if (!prefs.sound) return;
    if (document.hidden) return;
    var fn = SFX[name]; if (fn) fn();
  } catch (e) {}
}

/* ============ gold-dust particles (signature of the glamorous identity) ============ */
function goldDustBurst(n) {
  try {
    if (!motionOK() || !document.body) return;
    n = n || 28;
    var cols = ["#f2d488", "#d4a94e", "#fff6d9", "#e8c15a", "#ffffff"];
    for (var i = 0; i < n; i++) {
      var d = document.createElement("div");
      d.className = "gold-dust";
      d.style.left = (Math.random() * 100) + "vw";
      d.style.background = cols[i % cols.length];
      var sz = 3 + Math.random() * 5;
      d.style.width = sz + "px"; d.style.height = sz + "px";
      d.style.animationDelay = (Math.random() * 0.5) + "s";
      d.style.animationDuration = (1.4 + Math.random() * 1.2) + "s";
      document.body.appendChild(d);
      (function (el) { setTimeout(function () { el.remove(); }, 3200); })(d);
    }
  } catch (e) {}
}

/* ============ marquee helpers ============ */
function cashShimmer() {
  try {
    if (!motionOK()) return;
    var el = document.getElementById("tbCash");
    if (!el) return;
    el.classList.remove("shimmer"); void el.offsetWidth; el.classList.add("shimmer");
    setTimeout(function () { try { el.classList.remove("shimmer"); } catch (e) {} }, 1500);
  } catch (e) {}
}
/* Dramatic easeOutExpo count-up for big reveals (premiere opening weekend). */
function marqueeCount(el, target, dur) {
  try {
    if (!el) return;
    if (!motionOK() || typeof requestAnimationFrame === "undefined" || typeof window.fmtM !== "function") {
      el.textContent = window.fmtM ? window.fmtM(target) : String(target); return;
    }
    dur = dur || 950;
    var start = null;
    function step(ts) {
      try {
        if (!el.isConnected) return;
        if (!start) start = ts;
        var p = Math.min(1, (ts - start) / dur);
        var e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p); // easeOutExpo: the dramatic reveal
        el.textContent = window.fmtM(target * e);
        if (p < 1) requestAnimationFrame(step);
      } catch (err) {}
    }
    requestAnimationFrame(step);
  } catch (e) {}
}
/* Button press: goldPop overshoot. Visual only. */
function popBtn(el) {
  try {
    if (!motionOK() || !el || !el.classList) return;
    el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
    setTimeout(function () { try { el.classList.remove("pop"); } catch (e) {} }, 400);
  } catch (e) {}
}

/* ============ settings modal ============ */
function prefsModal() {
  try {
    var rows = [
      ["sound", "🔊", "Sound effects"],
      ["haptics", "📳", "Haptics (vibration)"],
      ["reduce", "🎞", "Reduce motion"]
    ];
    var html = "<h2>⚙️ Studio Settings</h2>";
    for (var i = 0; i < rows.length; i++) {
      var k = rows[i][0];
      html += "<div class='kv'><span>" + rows[i][1] + " " + rows[i][2] + "</span>" +
        "<button class='btn small " + (prefs[k] ? "amber" : "ghost") + "' data-pref='" + k + "'>" +
        (prefs[k] ? "On" : "Off") + "</button></div>";
    }
    html += "<p class='sub'>Haptics work on most Android phones. iPhones don't allow web vibration, so they stay silent there — every cue has a visual twin.</p>" +
      "<button class='btn amber mt' onclick='closeModal()'>Done</button>";
    if (window.pauseForModal) window.pauseForModal();
    window.showModal(html);
    var btns = document.querySelectorAll("[data-pref]");
    for (var j = 0; j < btns.length; j++) {
      (function (b) {
        b.addEventListener("click", function () {
          try {
            var key = b.getAttribute("data-pref");
            prefs[key] = !prefs[key];
            savePrefs(); applyMotionClass();
            b.textContent = prefs[key] ? "On" : "Off";
            b.className = "btn small " + (prefs[key] ? "amber" : "ghost");
            if (key === "sound" && prefs[key]) sfx("pop");
            hap("select");
          } catch (e) {}
        });
      })(btns[j]);
    }
  } catch (e) {}
}

/* ============ delegated juice: button pops + touch-friendly trait tips ============ */
function wireFeel() {
  document.addEventListener("click", function (e) {
    try {
      var t = e.target;
      if (!t || !t.closest) return;
      // trait chips: tap shows the description (title= is hover-only on touch)
      var tr = t.closest(".trait");
      if (tr && window.TRAITS && tr.getAttribute("data-trait") && TRAITS[tr.getAttribute("data-trait")] && window.toast) {
        var td = TRAITS[tr.getAttribute("data-trait")];
        window.toast(td.icon + " <b>" + td.name + "</b> — " + td.desc);
        hap("select");
        return;
      }
      var b = t.closest(".btn.amber, #bottomnav button, .choice, .opt");
      if (b) popBtn(b);
    } catch (err) {}
  }, true);
  // AudioContext unlocks synchronously inside the first gesture
  document.addEventListener("pointerdown", function () { ac(); }, { passive: true });
  document.addEventListener("keydown", function () { ac(); });
}

/* expose globals for game.js hooks */
window.feelPrefs = prefs;
window.hap = hap;
window.sfx = sfx;
window.goldDustBurst = goldDustBurst;
window.cashShimmer = cashShimmer;
window.marqueeCount = marqueeCount;
window.popBtn = popBtn;
window.motionOK = motionOK;
window.motionReduced = motionReduced;
window.prefsModal = prefsModal;

document.addEventListener("DOMContentLoaded", function () {
  loadPrefs();
  wireFeel();
  var g = document.getElementById("btnPrefs");
  if (g) g.addEventListener("click", function () { hap("select"); sfx("tick"); prefsModal(); });
});
})();
