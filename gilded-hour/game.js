/* THE GILDED HOUR — Pass 1 core.
   A 15-question show for 2-4 players at one table: Round 1 The Open Table,
   Round 2 The Hot Seat, Round 3 The Vault. Pure show logic + DOM rendering.
   Sim never touches the clock directly: the rAF loop feeds dt into step(). */
(function () {
  "use strict";

  /* ---------- seeded rng ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rng = mulberry32((Date.now() % 2147483647) || 7);
  function ri(n) { return Math.floor(rng() * n); }
  function pick(arr) { return arr[ri(arr.length)]; }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) { var j = ri(i + 1); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  function round10(n) { return Math.max(0, Math.round(n / 10) * 10); }
  function money(n) { return (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US"); }
  function mplus(n) { return "+" + money(n); }
  function mminus(n) { return "\u2212" + money(n); }

  /* ---------- constants ---------- */
  var PCOLORS = ["var(--p0)", "var(--p1)", "var(--p2)", "var(--p3)"];
  var PNAMES = ["Player One", "Player Two", "Player Three", "Player Four"];
  var R1_VALUES = { easy: 100, medium: 200, hard: 300 };
  var R2_VALUES = { easy: 200, medium: 400, hard: 600 };
  var R1_COUNT = 7, R2_COUNT = 7;
  var QTIME = 20, STEAL_TIME = 8, VAULT_TIME = 30;

  /* ---------- host lines (original writing) ---------- */
  var HOST = {
    open: [
      "Good evening. I am Sterling. Fifteen questions, one table, no mercy for the confident.",
      "Welcome to The Gilded Hour. I keep the questions; you keep your dignity — for now."
    ],
    r1: [
      "Round One. The Open Table. Gentle money, public answers, and steals for the quick-tongued.",
      "We begin at the Open Table. Discuss if you must. Commit if you dare."
    ],
    r2: [
      "Round Two. The Hot Seat. The money doubles, wrong answers now cost you, and everyone here holds a needle with your name on it.",
      "The Hot Seat. Lifelines are live, needles are loaded, and I am legally required to enjoy this."
    ],
    r3: [
      "The Vault. One category, one question, and everything you have earned, wagered in the dark.",
      "We come to it at last. The Vault does not care how you got here. Only what you risk."
    ],
    correctFast: ["{name}. Correct, and quickly. The table is impressed despite itself.", "{name} — correct before the echo faded. Noted."],
    correct: ["{name}. Correct. The gold moves, as it should.", "Correct, {name}. Sterling approves, quietly."],
    correctSlow: ["Correct, {name} — eventually. The clock filed a complaint.", "{name} gets there in the end. Drama is a strategy, I suppose."],
    wrong: ["{name}. No. The correct answer was standing right there, waving.", "Incorrect, {name}. Bold. Wrong, but bold."],
    timeout: ["Time, {name}. The question has left the building.", "The clock wins that one, {name}. It usually does."],
    stealCall: ["A steal is open. Shout your name before someone with confidence does."],
    stealGood: ["Stolen by {name}. Ruthless. Correct, too, which helps.", "{name} takes it. That is how tables turn."],
    stealBad: ["{name} reaches — and grasps air. The question retires undefeated."],
    needle: ["{by} plays the Needle on {name}. Five seconds. The room leans in.", "The Needle, from {by}. {name}, your evening just shortened."],
    needleBackfire: ["{name} answers anyway. {by}, the Needle cuts the hand that throws it."],
    foolsGold: ["{name} has found the Fool's Gold — the wrong answer that pays. I hid one in every Hot Seat. This one is spent."],
    cut: ["{name} cuts two answers. The field narrows; the nerve, presumably, holds."],
    tableTalk: ["{name} asks the table. Argue well — the clock is holding its breath."],
    secondClock: ["{name} buys eight seconds. Time, as ever, is money."],
    wagerSet: ["Wagers are locked. The Vault will now judge everyone's judgement."],
    vaultReveal: ["{name} wagered {amt}. Let us see what the Vault thinks of that."],
    winner: ["{name} takes the Gilded Hour. The vault opens, the table applauds, and I — I almost smiled."],
    tie: ["Level. Of course. One question, sudden death, first hand up takes it."]
  };
  function hostSay(kind, vars) {
    var line = pick(HOST[kind] || ["…"]);
    if (vars) for (var k in vars) line = line.split("{" + k + "}").join(vars[k]);
    $("hostLine").textContent = line;
  }

  /* ---------- dom helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function el(html) { var d = document.createElement("div"); d.innerHTML = html; return d.firstElementChild; }
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

  /* ---------- sound (synthesized with WebAudio only — no files) ---------- */
  var Snd = {
    ctx: null, master: null, _lw: -1, _noise: null, muted: false,
    init: function () { try { this.muted = localStorage.getItem("gh_mute") === "1"; } catch (e) {} },
    ensure: function () {
      if (this.ctx) { if (this.ctx.state === "suspended") { var pr = this.ctx.resume(); if (pr && pr.catch) pr.catch(function () {}); } return true; }
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.22;
        this.master.connect(this.ctx.destination);
        return true;
      } catch (e) { return false; }
    },
    tone: function (freq, dur, type, vol, delay, slideTo) {
      if (!this.ctx || this.ctx.state !== "running") return;
      var t0 = this.ctx.currentTime + (delay || 0);
      var o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || "triangle"; o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.5, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + dur + 0.05);
    },
    noise: function (dur, vol, freq) {
      if (!this.ctx || this.ctx.state !== "running") return;
      if (!this._noise) {
        var len = this.ctx.sampleRate, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        var d = buf.getChannelData(0); for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this._noise = buf;
      }
      var t0 = this.ctx.currentTime;
      var src = this.ctx.createBufferSource(); src.buffer = this._noise; src.loop = true;
      var f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 240;
      var g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.5, t0 + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t0); src.stop(t0 + dur + 0.05);
    },
    play: function (kind) {
      if (this.muted || !this.ctx || this.ctx.state !== "running") return;
      try {
        var i;
        if (kind === "theme") { var n = [196.0, 392.0, 523.25, 659.25, 783.99]; for (i = 0; i < n.length; i++) this.tone(n[i], 0.55, "triangle", 0.32, i * 0.09); this.tone(98.0, 0.9, "sine", 0.3, 0); }
        else if (kind === "correct") { this.tone(659.25, 0.16, "triangle", 0.4, 0); this.tone(987.77, 0.34, "triangle", 0.4, 0.09); }
        else if (kind === "gold") { var g = [1318.5, 1567.98, 2093.0]; for (i = 0; i < g.length; i++) this.tone(g[i], 0.22, "sine", 0.3, i * 0.06); }
        else if (kind === "wrong") { this.tone(220.0, 0.32, "sawtooth", 0.15, 0, 207.65); this.tone(110.0, 0.36, "sine", 0.3, 0.02); }
        else if (kind === "steal") { this.tone(880.0, 0.09, "square", 0.13, 0); this.tone(880.0, 0.12, "square", 0.13, 0.13); }
        else if (kind === "needle") { this.tone(1567.98, 0.3, "square", 0.09, 0, 280.0); this.tone(2637.0, 0.1, "sine", 0.15, 0); }
        else if (kind === "door") { this.noise(0.8, 0.5, 220); this.tone(55.0, 0.7, "sine", 0.5, 0, 38.0); }
        else if (kind === "finale") { var c = [523.25, 659.25, 783.99, 1046.5]; for (i = 0; i < c.length; i++) this.tone(c[i], 1.5, "triangle", 0.19, i * 0.05); this.tone(261.63, 1.6, "sine", 0.22, 0); }
        else if (kind === "tick") { this.tone(64.0, 0.07, "sine", 0.5, 0); }
      } catch (e) {}
    },
    setMuted: function (m) { this.muted = m; try { localStorage.setItem("gh_mute", m ? "1" : "0"); } catch (e) {} }
  };
  Snd.init();

  /* ---------- production state (Pass 3) ---------- */
  var dispScore = [], writtenScore = [];
  var pageHidden = false, lastShownValue = null, coldTimer = null;
  function setLight(state) { var g = $("scr-game"); if (g) g.setAttribute("data-light", state); }
  function setSpot(x, y) {
    var spot = $("spot"); if (!spot) return;
    spot.style.background = "radial-gradient(46% 62% at " + x + "% " + y + "%, rgba(232,205,141,.20), rgba(232,205,141,.06) 45%, transparent 70%)";
  }
  function fxNeedle() {
    var n = $("needleFx"); if (!n) return;
    n.classList.remove("strike"); void n.offsetWidth; n.classList.add("strike");
  }
  /* fortune rail: displayed totals tween toward real scores */
  function stepFortune(dt) {
    if (!G) return;
    G.players.forEach(function (p, i) {
      if (dispScore[i] == null) dispScore[i] = p.score;
      var diff = p.score - dispScore[i];
      if (diff !== 0) {
        dispScore[i] += diff * Math.min(1, dt * 7);
        if (Math.abs(p.score - dispScore[i]) < 1) dispScore[i] = p.score;
      }
      var seat = document.querySelector('.seat[data-seat="' + i + '"]');
      if (!seat) return;
      if (diff > 0.5) { seat.classList.add("tick-up"); seat.classList.remove("tick-down"); }
      else if (diff < -0.5) { seat.classList.add("tick-down"); seat.classList.remove("tick-up"); }
      else { seat.classList.remove("tick-up"); seat.classList.remove("tick-down"); }
      var txt = money(Math.round(dispScore[i]));
      if (writtenScore[i] !== txt) {
        writtenScore[i] = txt;
        var sc = seat.querySelector(".seat-score"); if (sc) sc.textContent = txt;
      }
    });
  }
  /* live question value: the very figure resolveAnswer banks (elapsed-based decay) */
  function drawValue() {
    var vEl = $("qValue");
    if (!vEl || !G || !G.cur || G.cur.value <= 0) return;
    var base = G.phase === "stealQ" ? STEAL_TIME : QTIME;
    var v = earned(G.cur.value, G.cur.elapsed, base);
    if (G.phase === "stealQ") v = round10(v * 0.5);
    if (v !== lastShownValue) {
      lastShownValue = v;
      vEl.textContent = money(v);
      var wrap = vEl.parentElement;
      if (wrap) {
        wrap.classList.toggle("low", v <= G.cur.value * 0.6);
        wrap.classList.remove("bump"); void wrap.offsetWidth; wrap.classList.add("bump");
        var lab = wrap.querySelector("small");
        if (lab) lab.textContent = G.phase === "stealQ" ? "THE STEAL TAKES" : "QUESTION VALUE";
      }
    }
  }
  /* gold leaf finale — pooled particles, capped, no per-frame allocation */
  var leaves = { active: false, parts: [], cv: null, cx: null, dpr: 1 };
  var LEAF_COLORS = ["#c6a45e", "#e8cd8d", "#a8853f", "#f2e2ac"];
  function resetLeaf(p, scatter) {
    var cv = leaves.cv; if (!cv) return;
    p.x = Math.random() * cv.width;
    p.y = scatter ? Math.random() * cv.height : -20 - Math.random() * 60;
    p.w = 4 + Math.random() * 6; p.h = p.w * 1.5;
    p.vy = 26 + Math.random() * 34; p.ph = Math.random() * 6.28;
    p.rot = Math.random() * 6.28; p.vr = (Math.random() - 0.5) * 2.4;
    p.col = ri(LEAF_COLORS.length);
  }
  function startLeaves() {
    var cv = $("leafCanvas"); if (!cv) return;
    leaves.dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.floor(window.innerWidth * leaves.dpr);
    cv.height = Math.floor(window.innerHeight * leaves.dpr);
    leaves.cv = cv; leaves.cx = cv.getContext("2d");
    if (!leaves.parts.length) {
      for (var i = 0; i < 56; i++) leaves.parts.push({ x: 0, y: 0, w: 5, h: 8, vy: 0, ph: 0, rot: 0, vr: 0, col: 0 });
      leaves.parts.forEach(function (p) { resetLeaf(p, true); });
    }
    leaves.active = true; cv.classList.add("on");
  }
  function stepLeaves(dt) {
    if (!leaves.active || !leaves.cx) return;
    var cx = leaves.cx, cv = leaves.cv, dpr = leaves.dpr;
    cx.clearRect(0, 0, cv.width, cv.height);
    leaves.parts.forEach(function (p) {
      p.ph += dt * 1.6; p.rot += p.vr * dt;
      p.y += p.vy * dpr * dt; p.x += Math.sin(p.ph) * 22 * dpr * dt;
      if (p.y > cv.height + 24) resetLeaf(p, false);
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot);
      cx.fillStyle = LEAF_COLORS[p.col]; cx.globalAlpha = 0.85;
      cx.fillRect(-p.w * dpr / 2, -p.h * dpr / 2, p.w * dpr, p.h * dpr * (0.4 + 0.6 * Math.abs(Math.sin(p.ph))));
      cx.restore();
    });
    cx.globalAlpha = 1;
  }
  function stopLeaves() { leaves.active = false; var cv = $("leafCanvas"); if (cv) cv.classList.remove("on"); }

  /* ---------- bank / deck ---------- */
  var BANK = (window.GH_BANK || []).map(function (q, i) { q.id = i; return q; });
  var CATS = []; BANK.forEach(function (q) { if (CATS.indexOf(q.cat) < 0) CATS.push(q.cat); });
  var seen = {};
  try { (JSON.parse(localStorage.getItem("gh_seen_v1") || "[]")).forEach(function (id) { seen[id] = 1; }); } catch (e) {}
  function saveSeen() {
    try { localStorage.setItem("gh_seen_v1", JSON.stringify(Object.keys(seen).map(Number))); } catch (e) {}
  }
  var pools = {}; // "cat|diff" -> shuffled [ids]
  function poolFor(cat, diff) {
    var key = cat + "|" + diff;
    if (!pools[key]) {
      var ids = BANK.filter(function (q) { return q.cat === cat && q.diff === diff; }).map(function (q) { return q.id; });
      var fresh = ids.filter(function (id) { return !seen[id]; });
      pools[key] = shuffle(fresh.length >= 1 ? fresh : ids.slice());
    }
    return pools[key];
  }
  function drawQuestion(cat, diff) {
    var p = poolFor(cat, diff);
    if (!p.length) { p = poolFor(cat, diff); } // rebuilt above on exhaustion
    if (!p.length) { // fall back: any question of this difficulty, then any at all
      var any = BANK.filter(function (q) { return q.diff === diff && !seen[q.id]; });
      if (!any.length) any = BANK.slice();
      var q = pick(any); seen[q.id] = 1; return q;
    }
    var id = p.pop(); seen[id] = 1;
    return BANK[id];
  }

  /* ---------- game state ---------- */
  var G = null;
  function newGame(names) {
    return {
      players: names.map(function (nm, i) {
        return { name: nm, color: PCOLORS[i], score: 0,
                 life: { cut: 1, table: 1, clock: 1 }, needle: 1, wager: 0, vaultAns: -1 };
      }),
      round: 1, qInRound: 0, turn: 0,
      phase: "intro",           // intro|pick|question|steal|reveal|wager|vaultQ|vaultReveal|over
      cur: null,                // current question runtime
      openFloor: {},            // R1 slots that are open floor
      boobyRoundQ: 2 + ri(4),   // which R2 question (0-based) hides the Fool's Gold
      vaultCat: null, vaultQ: null, wagerIdx: 0, revealIdx: 0, order: [],
      tied: null
    };
  }

  /* ---------- seats ---------- */
  function renderSeats() {
    var top = $("seatsTop"), bot = $("seatsBottom");
    top.innerHTML = ""; bot.innerHTML = "";
    if (!G) return;
    var bestScore = Math.max.apply(null, G.players.map(function (x) { return x.score; }));
    G.players.forEach(function (p, i) {
      var shown = money(Math.round(dispScore[i] != null ? dispScore[i] : p.score));
      writtenScore[i] = shown;
      var s = el('<div class="seat" data-seat="' + i + '">' +
        '<span class="name-dot" style="background:' + p.color + '"></span>' +
        '<span class="seat-info"><span class="seat-name">' + esc(p.name) + '</span><br>' +
        '<span class="seat-score">' + shown + '</span> ' +
        '<span class="tag">' + tagsFor(i) + '</span></span></div>');
      if (p.score === bestScore && bestScore > 0) s.classList.add("lead");
      if (G.cur && G.cur.active === i && (G.phase === "question" || G.phase === "pick")) s.classList.add("active");
      if (G.phase === "steal" && G.cur && i !== G.cur.active) s.classList.add("stealable");
      s.addEventListener("click", function () { onSeatTap(i); });
      // TV-first landscape: last two seats along the top edge, first two along the bottom
      if (i < 2) bot.appendChild(s); else top.appendChild(s);
    });
    if (G.round === 2 && G.cur && G.cur.active >= 0) {
      var ase = document.querySelector('.seat[data-seat="' + G.cur.active + '"]');
      var tbl = $("table");
      if (ase && tbl) {
        var sr = ase.getBoundingClientRect(), tr = tbl.getBoundingClientRect();
        if (tr.width && tr.height) {
          setSpot((sr.left + sr.width / 2 - tr.left) / tr.width * 100,
                  (sr.top + sr.height / 2 - tr.top) / tr.height * 100);
        }
      }
    }
  }
  function tagsFor(i) {
    var p = G.players[i], t = [];
    if (p.needle > 0) t.push("NEEDLE");
    if (p.life.cut > 0) t.push("CUT");
    if (p.life.table > 0) t.push("TABLE");
    if (p.life.clock > 0) t.push("+8s");
    return t.join(" · ");
  }

  /* ---------- clock ---------- */
  var clock = { left: 0, total: 0, running: false, onEnd: null };
  function startClock(seconds, onEnd) {
    clock.left = seconds; clock.total = seconds; clock.running = true; clock.onEnd = onEnd;
    Snd._lw = -1;
    drawClock();
  }
  function stopClock() { clock.running = false; var d = $("dangerFx"); if (d) d.classList.remove("on"); }
  var lastT = 0;
  function loop(t) {
    var dt = Math.min((t - lastT) / 1000 || 0, 0.1); lastT = t;
    if (clock.running && G && G.cur) {
      clock.left -= dt; G.cur.elapsed += dt;
      if (clock.left <= 0) { clock.left = 0; clock.running = false; drawClock(); if (clock.onEnd) clock.onEnd(); }
      else drawClock();
    }
    if (!pageHidden) { stepFortune(dt); drawValue(); stepLeaves(dt); }
    requestAnimationFrame(loop);
  }
  function drawClock() {
    var num = $("timerNum"), ring = $("timerProg");
    if (!num || !ring) return;
    var C = 2 * Math.PI * 30;
    var frac = clock.total ? clock.left / clock.total : 0;
    ring.style.strokeDashoffset = String(C * (1 - frac));
    num.textContent = String(Math.ceil(clock.left));
    $("timerSvg").classList.toggle("low", clock.left <= 5.05);
    var dfx = $("dangerFx");
    if (dfx) dfx.classList.toggle("on", clock.running && clock.left <= 5.05 && clock.left > 0);
    if (clock.running) {
      var w = Math.ceil(clock.left);
      if (w !== Snd._lw) { Snd._lw = w; if (w <= 10 && w >= 1) Snd.play("tick"); }
    }
  }
  function timerHTML() {
    var C = (2 * Math.PI * 30).toFixed(1);
    return '<div class="timer-wrap"><svg id="timerSvg" class="timer-ring" width="76" height="76" viewBox="0 0 76 76">' +
      '<circle class="track" cx="38" cy="38" r="30" fill="none" stroke-width="5"></circle>' +
      '<circle id="timerProg" class="prog" cx="38" cy="38" r="30" fill="none" stroke-width="5" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="0"></circle>' +
      '<text id="timerNum" class="timer-num" x="38" y="44" transform="rotate(90 38 38)">20</text></svg></div>';
  }

  /* ---------- stage ---------- */
  function stage(html) { var st = $("stage"); st.innerHTML = '<div class="stage-inner enter">' + html + "</div>"; st.scrollTop = 0; }
  function standingsHTML() {
    var order = G.players.map(function (p, i) { return i; }).sort(function (a, b) { return G.players[b].score - G.players[a].score; });
    var rows = order.map(function (pi, pos) {
      var p = G.players[pi];
      return '<div class="stand-row' + (pos === 0 ? " lead" : "") + '"><span class="pos">' + (pos + 1) + '</span>' +
        '<span class="name-dot" style="background:' + p.color + '"></span><span class="nm">' + esc(p.name) + '</span>' +
        '<span class="sc">' + money(p.score) + "</span></div>";
    }).join("");
    return '<div class="standings">' + rows + "</div>";
  }
  function updateTop() {
    var labels = { 1: "ROUND 1 · THE OPEN TABLE", 2: "ROUND 2 · THE HOT SEAT", 3: "ROUND 3 · THE VAULT" };
    $("roundLabel").textContent = labels[G.round];
    var n = G.round === 1 ? G.qInRound + 1 : G.round === 2 ? R1_COUNT + G.qInRound + 1 : 15;
    $("qCounter").textContent = "QUESTION " + Math.min(n, 15) + " OF 15";
  }

  /* ---------- show flow ---------- */
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(function (s) { s.classList.remove("active"); });
    $(id).classList.add("active");
  }
  function startShow(names) {
    G = newGame(names);
    pools = {};
    // choose the two open-floor slots in Round 1
    var slots = shuffle([1, 2, 3, 4, 5, 6]).slice(0, 2);
    slots.forEach(function (s) { G.openFloor[s] = 1; });
    G.vaultCat = pick(CATS);
    showScreen("scr-game");
    setLight("open");
    stopLeaves();
    dispScore = G.players.map(function () { return 0; });
    writtenScore = [];
    hostSay("open");
    renderSeats(); updateTop();
    Snd.ensure(); Snd.play("theme");
    G.phase = "coldopen";
    var letters = "THE GILDED HOUR".split("").map(function (ch, i) {
      return '<span class="co-l" style="animation-delay:' + (i * 45) + 'ms">' + (ch === " " ? "&nbsp;" : ch) + "</span>";
    }).join("");
    stage('<div class="coldopen"><div class="co-sweep"></div>' +
      '<div class="co-kicker">STERLING PRESENTS</div>' +
      '<div class="co-title">' + letters + "</div>" +
      '<div class="co-sub">Fifteen questions · one table · the clock is money</div></div>');
    coldTimer = setTimeout(function () { if (G && G.phase === "coldopen") roundIntro(); }, 2100);
  }
  function roundIntro() {
    G.phase = "intro"; setLight(G.round === 1 ? "open" : G.round === 2 ? "hot" : "vault");
    updateTop(); renderSeats();
    var titles = { 1: "THE OPEN TABLE", 2: "THE HOT SEAT", 3: "THE VAULT" };
    var texts = {
      1: "Seven questions. Take turns choosing a category and a value — easy $100, medium $200, hard $300. A fast correct answer pays in full; a slow one, half — the money drains with the clock, so watch the figure fall. Miss, and the table may steal. Twice this round, the floor is open: first name shouted takes the question.",
      2: "Seven questions at double stakes — $200, $400, $600. Wrong answers now cost half the value. Your lifelines are live: Cut Two, Ask the Table, Second Clock. And each of you holds one Needle: play it during a rival's question to cut them to five seconds. Somewhere in this round hides the Fool's Gold — one wrong answer that pays the question's value to whoever picks it.",
      3: "One question, from the category of " + G.vaultCat + ". Each of you wagers in secret — pass the phone, keep it covered — then answers in secret. Correct: the wager is added. Wrong: it is taken. Everything else was rehearsal."
    };
    stage('<div class="bumper"><div class="round-kicker">ROUND ' + G.round + "</div>" +
      '<div class="round-title">' + titles[G.round] + "</div>" +
      '<p class="round-text">' + texts[G.round] + "</p>" +
      (G.round > 1 ? standingsHTML() : "") +
      '<button class="btn-gold" id="btnRoundGo">' + (G.round === 3 ? "TO THE VAULT" : "BEGIN ROUND " + G.round) + "</button></div>");
    hostSay("r" + G.round);
    $("btnRoundGo").addEventListener("click", function () {
      if (G.round === 3) startWagers(); else nextQuestion();
    });
  }
  function nextQuestion() {
    if (G.round === 1 && G.qInRound >= R1_COUNT) { G.round = 2; G.qInRound = 0; roundIntro(); return; }
    if (G.round === 2 && G.qInRound >= R2_COUNT) { G.round = 3; G.qInRound = 0; roundIntro(); return; }
    var isOpen = G.round === 1 && !!G.openFloor[G.qInRound];
    var active = G.turn % G.players.length;
    G.turn++;
    if (isOpen) beginOpenFloor();
    else beginPick(active);
  }
  function makeOffers() {
    var cats = shuffle(CATS.slice()).slice(0, 3);
    var diffs = shuffle(["easy", "medium", "hard"]);
    return cats.map(function (c, i) { return { cat: c, diff: diffs[i] }; });
  }
  function beginPick(active) {
    G.phase = "pick";
    G.cur = { active: active, offers: makeOffers(), elapsed: 0 };
    updateTop(); renderSeats();
    var p = G.players[active];
    var tiles = G.cur.offers.map(function (o, i) {
      var val = (G.round === 1 ? R1_VALUES : R2_VALUES)[o.diff];
      return '<button class="cat-tile" data-offer="' + i + '"><span class="cat-name">' + esc(o.cat) + '</span>' +
        '<span class="cat-val">' + o.diff.toUpperCase() + " · $" + val + "</span></button>";
    }).join("");
    stage('<div class="q-cat">' + esc(p.name.toUpperCase()) + " TO CHOOSE</div>" +
      '<div class="q-text" style="font-size:clamp(19px,3vw,25px)">Pick the question, ' + esc(p.name) + ".</div>" +
      '<div class="cat-row">' + tiles + "</div>");
    document.querySelectorAll("[data-offer]").forEach(function (b) {
      b.addEventListener("click", function () { chooseOffer(parseInt(b.getAttribute("data-offer"), 10)); });
    });
  }
  function beginOpenFloor() {
    G.phase = "claim";
    G.cur = { active: -1, offers: null, elapsed: 0, openFloor: true };
    updateTop(); renderSeats();
    // draw first, then let the room claim it
    var offer = pick(makeOffers());
    var q = drawQuestion(offer.cat, offer.diff);
    setupQuestion(q, offer, -1);
    G.cur.openFloor = true;
    stage(questionHTML("OPEN FLOOR — first name shouted claims it. Tap the claimant's seat.") +
      '<p class="round-text" style="margin-top:10px">Waiting for a claim…</p>');
    // no clock until claimed
  }
  function chooseOffer(i) {
    var o = G.cur.offers[i];
    var q = drawQuestion(o.cat, o.diff);
    setupQuestion(q, o, G.cur.active);
    askCurrent();
  }
  function setupQuestion(q, offer, active) {
    var opts = shuffle([{ t: q.a, ok: true }].concat(q.w.map(function (w) { return { t: w, ok: false }; })));
    var cur = {
      q: q, cat: offer.cat, diff: offer.diff,
      value: (G.round === 1 ? R1_VALUES : R2_VALUES)[offer.diff],
      opts: opts, active: active, elapsed: 0, picked: -1,
      needledBy: -1, cutUsed: false, foolsIdx: -1, resolved: false
    };
    lastShownValue = null;
    if (G.round === 2 && G.qInRound === G.boobyRoundQ) {
      var wrongIdxs = opts.map(function (o, i) { return o.ok ? -1 : i; }).filter(function (i) { return i >= 0; });
      cur.foolsIdx = pick(wrongIdxs);
    }
    G.cur = cur;
  }
  function questionHTML(forWhom) {
    var c = G.cur;
    var btns = c.opts.map(function (o, i) {
      return '<button class="ans-btn" data-ans="' + i + '"' + (o.gone ? " disabled" : "") + '>' +
        '<span class="letter">' + "ABCD"[i] + '</span><span>' + esc(o.t) + "</span></button>";
    }).join("");
    return '<div class="q-cat">' + esc(c.cat.toUpperCase()) + " · " + c.diff.toUpperCase() + " · " + money(c.value) + "</div>" +
      '<div class="q-text">' + esc(c.q.q) + "</div>" +
      (c.value > 0 && !c.sudden ? '<div class="q-value"><small>QUESTION VALUE</small><span id="qValue">' + money(c.value) + "</span></div>" : "") +
      '<div class="q-for">' + esc(forWhom) + "</div>" + timerHTML() +
      '<div class="answers">' + btns + "</div>" + toolsHTML();
  }
  function toolsHTML() {
    if (G.round !== 2 || !G.cur || G.cur.active < 0) return "";
    var a = G.players[G.cur.active];
    var h = '<div class="tools">';
    h += '<button class="tool-btn" id="toolCut" ' + (a.life.cut > 0 ? "" : "disabled") + ">CUT TWO<small>remove two wrong answers — " + esc(a.name) + "'s</small></button>";
    h += '<button class="tool-btn" id="toolTable" ' + (a.life.table > 0 ? "" : "disabled") + ">ASK THE TABLE<small>pause the clock, open debate</small></button>";
    h += '<button class="tool-btn" id="toolClock" ' + (a.life.clock > 0 ? "" : "disabled") + ">SECOND CLOCK<small>+8 seconds</small></button>";
    G.players.forEach(function (p, i) {
      if (i !== G.cur.active) h += '<button class="tool-btn needle" data-needle="' + i + '" ' + (p.needle > 0 ? "" : "disabled") + ">NEEDLE<small>" + esc(p.name) + " cuts them to 5s</small></button>";
    });
    return h + "</div>";
  }
  function askCurrent() {
    G.phase = "question";
    var p = G.players[G.cur.active];
    updateTop(); renderSeats();
    stage(questionHTML(p.name + " answers. The room may discuss — the answer is theirs alone."));
    wireQuestion();
    startClock(QTIME, function () { resolveAnswer(-1); });
  }
  function wireQuestion() {
    document.querySelectorAll("[data-ans]").forEach(function (b) {
      b.addEventListener("click", function () { resolveAnswer(parseInt(b.getAttribute("data-ans"), 10)); });
    });
    var cut = $("toolCut"), tab = $("toolTable"), clk = $("toolClock");
    if (cut) cut.addEventListener("click", useCut);
    if (tab) tab.addEventListener("click", useTable);
    if (clk) clk.addEventListener("click", useClock);
    document.querySelectorAll("[data-needle]").forEach(function (b) {
      b.addEventListener("click", function () { useNeedle(parseInt(b.getAttribute("data-needle"), 10)); });
    });
  }
  function speedFrac(elapsed, total) { return Math.max(0, Math.min(1, 1 - elapsed / total)); }
  function earned(value, elapsed, total) { return round10(value * (0.5 + 0.5 * speedFrac(elapsed, total))); }

  /* ---------- lifelines & the Needle ---------- */
  function useCut() {
    var c = G.cur, a = G.players[c.active];
    if (a.life.cut <= 0 || c.cutUsed) return;
    a.life.cut--; c.cutUsed = true;
    var wrong = c.opts.map(function (o, i) { return { o: o, i: i }; }).filter(function (x) { return !x.o.ok && x.i !== c.foolsIdx; });
    shuffle(wrong).slice(0, 2).forEach(function (x) { x.o.gone = true; });
    hostSay("cut", { name: a.name });
    refreshQuestion();
  }
  function useTable() {
    var c = G.cur, a = G.players[c.active];
    if (a.life.table <= 0) return;
    a.life.table--;
    stopClock();
    hostSay("tableTalk", { name: a.name });
    stage(questionHTML(a.name + " has asked the table. The clock is paused — debate!") +
      '<div style="margin-top:14px"><button class="btn-gold" id="btnResume">THE TABLE HAS SPOKEN — RESUME</button></div>');
    wireQuestion();
    $("btnResume").addEventListener("click", function () {
      stage(questionHTML(a.name + " answers.")); wireQuestion();
      clock.running = true; drawClock();
    });
    renderSeats();
  }
  function useClock() {
    var c = G.cur, a = G.players[c.active];
    if (a.life.clock <= 0) return;
    a.life.clock--;
    clock.left += 8; clock.total += 8;
    hostSay("secondClock", { name: a.name });
    renderSeats();
  }
  function useNeedle(byIdx) {
    var c = G.cur, by = G.players[byIdx];
    if (by.needle <= 0 || c.needledBy >= 0 || G.phase !== "question") return;
    by.needle--; c.needledBy = byIdx;
    if (clock.left > 5) clock.left = 5;
    hostSay("needle", { by: by.name, name: G.players[c.active].name });
    fxNeedle(); Snd.play("needle");
    drawClock(); renderSeats();
  }
  function refreshQuestion() {
    var p = G.players[G.cur.active];
    stage(questionHTML(p.name + " answers.")); wireQuestion(); drawClock(); renderSeats();
  }

  /* ---------- answering ---------- */
  function resolveAnswer(idx) {
    var c = G.cur;
    if (!c || c.resolved || (G.phase !== "question" && G.phase !== "stealQ")) return;
    c.resolved = true; stopClock();
    if (c.sudden) { resolveSudden(idx); return; }
    var isSteal = G.phase === "stealQ";
    var answerer = isSteal ? c.stealer : c.active;
    var p = G.players[answerer];
    c.picked = idx;
    var correctIdx = c.opts.findIndex(function (o) { return o.ok; });

    // Fool's Gold: a planted wrong answer that pays
    if (idx === c.foolsIdx && idx >= 0) {
      var bonus = c.value;
      p.score += bonus;
      if (c.needledBy >= 0) {
        var nb = G.players[c.needledBy]; var cutAmt = round10(c.value * 0.25);
        nb.score -= cutAmt;
        finishReveal("fools", p.name + " picks the planted answer — the Fool's Gold. " + mplus(bonus) + " to " + p.name + ".", "foolsGold", { name: p.name });
        return;
      }
      finishReveal("fools", p.name + " picks the planted answer — the Fool's Gold. " + mplus(bonus) + ".", "foolsGold", { name: p.name });
      return;
    }

    var correct = idx === correctIdx;
    if (correct) {
      var gain = isSteal ? round10(earned(c.value, c.elapsed, STEAL_TIME) * 0.5)
                         : earned(c.value, c.elapsed, QTIME);
      p.score += gain;
      var kind = isSteal ? "stealGood" : (c.elapsed < 6 ? "correctFast" : (c.elapsed > 14 ? "correctSlow" : "correct"));
      var dhtml = '<span class="up">' + mplus(gain) + " to " + esc(p.name) + "</span>";
      if (c.needledBy >= 0) {
        var n = G.players[c.needledBy]; var loss = round10(c.value * 0.25);
        n.score -= loss; dhtml += ' &nbsp;<span class="down">' + mminus(loss) + " to " + esc(n.name) + " (the Needle)</span>";
        kind = "needleBackfire";
        finishReveal("correct", dhtml, kind, { name: p.name, by: n.name });
        return;
      }
      finishReveal("correct", dhtml, kind, { name: p.name });
      return;
    }

    // wrong or timeout
    if (!isSteal && G.round === 2) {
      var pen = round10(c.value * 0.5);
      p.score -= pen;
      var d2 = '<span class="down">' + mminus(pen) + " to " + esc(p.name) + "</span>";
      if (c.needledBy >= 0) {
        var n2 = G.players[c.needledBy]; n2.score += pen;
        d2 += ' &nbsp;<span class="up">' + mplus(pen) + " to " + esc(n2.name) + " (the Needle pays out)</span>";
      }
      finishReveal("wrong", d2, idx < 0 ? "timeout" : "wrong", { name: p.name });
      return;
    }
    if (isSteal) {
      finishReveal("wrong", '<span class="down">The steal fails. No points move.</span>', "stealBad", { name: p.name });
      return;
    }
    // Round 1 miss (or Round 2 never reaches here): open the steal
    openSteal(idx, correctIdx);
  }
  function resolveSudden(idx) {
    var c = G.cur;
    var answerer = c.active, p = G.players[answerer];
    var correctIdx = c.opts.findIndex(function (o) { return o.ok; });
    c.picked = idx;
    if (idx === correctIdx) {
      var btns = c.opts.map(function (o, i) {
        var cls = "ans-btn" + (i === correctIdx ? " correct" : (i === idx ? " wrong" : ""));
        return '<button class="' + cls + '" disabled><span class="letter">' + "ABCD"[i] + "</span><span>" + esc(o.t) + "</span></button>";
      }).join("");
      G.phase = "reveal";
      stage('<div class="q-cat">SUDDEN DEATH · SETTLED</div>' +
        '<div class="q-text" style="font-size:clamp(18px,3vw,25px)">' + esc(c.q.q) + "</div>" +
        '<div class="answers">' + btns + "</div>" +
        '<div class="delta"><span class="gold">' + esc(p.name) + " takes it.</span></div>" +
        '<p class="why">' + esc(c.q.why) + "</p>" +
        '<div style="margin-top:12px"><button class="btn-gold" id="btnSuddenWin">TO THE RESULT</button></div>');
      hostSay("correct", { name: p.name });
      renderSeats();
      $("btnSuddenWin").addEventListener("click", function () { winnerScreen(answerer); });
      return;
    }
    // wrong: remaining tied players may claim the same question
    if (!c.suddenMissed) c.suddenMissed = {};
    c.suddenMissed[answerer] = 1;
    var remaining = G.tied.filter(function (ti) { return !c.suddenMissed[ti]; });
    if (!remaining.length) { suddenDeath(G.tied); return; }
    c.active = -1; c.resolved = false; G.phase = "claim";
    stage('<div class="round-kicker">SUDDEN DEATH</div>' +
      '<div class="round-title">' + esc(p.name) + " misses</div>" +
      questionHTML("Still open — a remaining tied player may claim it.") +
      '<p class="round-text" style="margin-top:10px">Waiting for a claim…</p>');
    // mark the missed answer as spent
    document.querySelectorAll("[data-ans]").forEach(function (b) {
      if (parseInt(b.getAttribute("data-ans"), 10) === idx) { b.classList.add("wrong"); b.disabled = true; }
    });
    renderSeats();
  }
  function openSteal(pickedIdx, correctIdx) {
    var c = G.cur;
    c.resolved = false; c.picked = pickedIdx;
    G.phase = "steal";
    c.tableValue = earned(c.value, c.elapsed, QTIME);
    var efx = $("edgeFx"); if (efx) efx.classList.add("steal");
    Snd.play("steal");
    hostSay("stealCall");
    renderSeats();
    var btns = c.opts.map(function (o, i) {
      var cls = "ans-btn" + (i === pickedIdx ? " wrong" : "");
      return '<button class="ans-btn ' + (i === pickedIdx ? "wrong" : "") + '" disabled><span class="letter">' + "ABCD"[i] + "</span><span>" + esc(o.t) + "</span></button>";
    }).join("");
    stage('<div class="q-cat">' + esc(c.cat.toUpperCase()) + " · STEAL OPEN</div>" +
      '<div class="q-text">' + esc(c.q.q) + "</div>" +
      '<div class="answers">' + btns + "</div>" +
      '<div class="q-value on-table"><small>ON THE TABLE</small><span>' + money(c.tableValue) + "</span></div>" +
      '<div class="steal-bar"><i></i></div>' +
      '<p class="round-text" style="margin-top:12px">Someone shout your name — then tap that seat. Tap the stage to let the question die.</p>');
    $("stage").onclick = function (e) { if (e.target.id === "stage" || e.target.classList.contains("stage-inner")) dieQuestion(); };
  }
  function dieQuestion() {
    var c = G.cur; if (!c) return;
    $("stage").onclick = null;
    var efx = $("edgeFx"); if (efx) efx.classList.remove("steal");
    finishReveal("wrong", '<span class="down">Nobody takes it. The question retires.</span>', "wrong", { name: G.players[c.active].name });
  }
  function onSeatTap(i) {
    if (!G) return;
    if (G.phase === "steal" && G.cur && i !== G.cur.active) startSteal(i);
    else if (G.phase === "claim" && G.cur && G.cur.openFloor) {
      if (G.cur.sudden && G.tied.indexOf(i) < 0) return;
      if (G.cur.sudden && G.cur.suddenMissed && G.cur.suddenMissed[i]) return;
      claimQuestion(i);
    }
  }
  function startSteal(i) {
    var c = G.cur;
    $("stage").onclick = null;
    var efx = $("edgeFx"); if (efx) efx.classList.remove("steal");
    c.stealer = i; c.elapsed = 0; c.resolved = false;
    G.phase = "stealQ";
    renderSeats();
    stage(questionHTML(G.players[i].name + " steals — eight seconds."));
    wireQuestion();
    startClock(STEAL_TIME, function () { resolveAnswer(-1); });
  }
  function claimQuestion(i) {
    var c = G.cur;
    c.active = i; G.phase = "question";
    renderSeats();
    stage(questionHTML(G.players[i].name + " claimed it. Twenty seconds."));
    wireQuestion();
    startClock(QTIME, function () { resolveAnswer(-1); });
  }
  function finishReveal(kind, deltaHTML, hostKind, hostVars) {
    G.phase = "reveal";
    var c = G.cur;
    var correctIdx = c.opts.findIndex(function (o) { return o.ok; });
    var btns = c.opts.map(function (o, i) {
      var cls = "ans-btn";
      if (i === c.foolsIdx && kind === "fools") cls += " fools";
      else if (i === correctIdx) cls += " correct";
      else if (i === c.picked) cls += " wrong";
      else cls += " dim";
      return '<button class="' + cls + '" disabled><span class="letter">' + "ABCD"[i] + "</span><span>" + esc(o.t) + "</span></button>";
    }).join("");
    stage('<div class="q-cat">' + esc(c.cat.toUpperCase()) + "</div>" +
      '<div class="q-text" style="font-size:clamp(18px,3vw,25px)">' + esc(c.q.q) + "</div>" +
      '<div class="answers">' + btns + "</div>" +
      '<div class="delta">' + deltaHTML + "</div>" +
      '<p class="why">' + esc(c.q.why) + "</p>" +
      '<div style="margin-top:12px"><button class="btn-gold" id="btnNext">CONTINUE</button></div>');
    hostSay(hostKind, hostVars);
    if (kind === "correct") Snd.play("correct");
    else if (kind === "fools") Snd.play("gold");
    else Snd.play("wrong");
    var efx3 = $("edgeFx"); if (efx3) efx3.classList.remove("steal");
    renderSeats();
    $("btnNext").addEventListener("click", function () {
      G.qInRound++;
      if (G.round === 3) { vaultRevealNext(); return; }
      nextQuestion();
    });
  }

  /* ---------- Round 3: The Vault ---------- */
  function cover(title, text, btnLabel, cb) {
    $("coverTitle").textContent = title;
    $("coverText").textContent = text;
    $("coverBtn").textContent = btnLabel;
    $("cover").classList.remove("hidden");
    $("coverBtn").onclick = function () { $("cover").classList.add("hidden"); cb(); };
  }
  function startWagers() {
    G.phase = "wager"; G.wagerIdx = 0;
    hostSay("r3");
    nextWager();
  }
  function stakeOf(p) { return p.score > 0 ? p.score : 100; } // a player at zero or below plays on a 100-point house stake
  function nextWager() {
    if (G.wagerIdx >= G.players.length) { hostSay("wagerSet"); beginVaultAnswers(); return; }
    var i = G.wagerIdx, p = G.players[i];
    cover("Pass the phone to " + p.name,
      "The Vault category is " + G.vaultCat + ". " + p.name + " sets a secret wager. Everyone else: look away, hum, contemplate your own wagers.",
      "I AM " + p.name.toUpperCase() + " — SET MY WAGER",
      function () { wagerScreen(i); });
  }
  function wagerScreen(i) {
    var p = G.players[i], stake = stakeOf(p);
    G.phase = "wager";
    stage('<div class="round-kicker">THE VAULT · SECRET WAGER</div>' +
      '<div class="round-title">' + esc(p.name) + ", in private</div>" +
      '<p class="round-text">The category is <b>' + esc(G.vaultCat) + '</b>. Your bank is ' + money(p.score) +
      (p.score <= 0 ? " — the house stakes you $100 to play with." : ".") + " Wager any part of " + money(stake) + ".</p>" +
      '<div class="wager-ctl"><div class="wager-amt" id="wagerAmt">$0</div>' +
      '<input type="range" id="wagerRange" min="0" max="' + stake + '" step="10" value="0">' +
      '<div class="wager-chips">' +
      '<button class="chip" data-w="0">NOTHING</button><button class="chip" data-w="0.25">A QUARTER</button>' +
      '<button class="chip" data-w="0.5">HALF</button><button class="chip" data-w="1">EVERYTHING</button></div>' +
      '<button class="btn-gold" id="btnWager">LOCK IT IN — AND COVER</button></div>');
    var range = $("wagerRange"), amt = $("wagerAmt");
    range.addEventListener("input", function () { amt.textContent = money(parseInt(range.value, 10) || 0); });
    document.querySelectorAll("[data-w]").forEach(function (ch) {
      ch.addEventListener("click", function () {
        var v = Math.round(stake * parseFloat(ch.getAttribute("data-w")) / 10) * 10;
        range.value = v; amt.textContent = money(v);
      });
    });
    $("btnWager").addEventListener("click", function () {
      p.wager = parseInt(range.value, 10) || 0;
      G.wagerIdx++; nextWager();
    });
  }
  function beginVaultAnswers() {
    var q = drawQuestion(G.vaultCat, "hard");
    G.vaultQ = q;
    G.phase = "vaultQ"; G.wagerIdx = 0;
    nextVaultAnswer();
  }
  function nextVaultAnswer() {
    if (G.wagerIdx >= G.players.length) { beginVaultReveal(); return; }
    var i = G.wagerIdx, p = G.players[i];
    cover(p.name + ", the Vault question is yours alone",
      "One question, thirty seconds, nobody helping. Pass the phone and keep it covered until it is in " + p.name + "'s hands.",
      "I AM " + p.name.toUpperCase() + " — SHOW ME",
      function () { vaultQuestionScreen(i); });
  }
  function vaultQuestionScreen(i) {
    var p = G.players[i], q = G.vaultQ;
    if (!G.vaultShownOpts) G.vaultShownOpts = {};
    var opts = shuffle([{ t: q.a, ok: true }].concat(q.w.map(function (w) { return { t: w, ok: false }; })));
    G.vaultShownOpts[i] = opts;
    G.cur = { q: q, cat: G.vaultCat, diff: "hard", value: 0, opts: opts, active: i, elapsed: 0, picked: -1, needledBy: -1, foolsIdx: -1, resolved: false };
    G.phase = "vaultQ";
    setSpot(50, 40);
    stage('<div class="vault-q"><div class="q-cat">THE VAULT · ' + esc(G.vaultCat.toUpperCase()) + "</div>" +
      '<div class="q-text">' + esc(q.q) + "</div>" + timerHTML() +
      '<div class="answers">' + opts.map(function (o, oi) {
        return '<button class="ans-btn" data-vans="' + oi + '"><span class="letter">' + "ABCD"[oi] + "</span><span>" + esc(o.t) + "</span></button>";
      }).join("") + "</div></div>");
    document.querySelectorAll("[data-vans]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (G.cur.resolved) return;
        G.cur.resolved = true; stopClock();
        p.vaultAns = parseInt(b.getAttribute("data-vans"), 10);
        G.wagerIdx++; nextVaultAnswer();
      });
    });
    startClock(VAULT_TIME, function () {
      if (G.cur.resolved) return;
      G.cur.resolved = true; p.vaultAns = -1;
      G.wagerIdx++; nextVaultAnswer();
    });
  }
  function beginVaultReveal() {
    G.phase = "vaultReveal";
    setSpot(50, 40);
    G.order = G.players.map(function (p, i) { return i; }).sort(function (a, b) { return G.players[a].score - G.players[b].score; });
    G.revealIdx = 0;
    stage('<div class="round-kicker">THE VAULT</div><div class="round-title">The Reckoning</div>' +
      '<p class="round-text">From the lowest score upward. Wagers meet answers.</p>' + standingsHTML() +
      '<button class="btn-gold" id="btnRevealGo">BEGIN THE REVEAL</button>');
    $("btnRevealGo").addEventListener("click", vaultRevealNext);
  }
  function vaultRevealNext() {
    if (G.revealIdx >= G.order.length) { finishShow(); return; }
    var i = G.order[G.revealIdx], p = G.players[i], q = G.vaultQ;
    var theirText = (p.vaultAns >= 0 && G.vaultShownOpts && G.vaultShownOpts[i]) ? G.vaultShownOpts[i][p.vaultAns].t : null;
    var right = theirText !== null && theirText === q.a;
    if (right) p.score += p.wager; else p.score -= p.wager;
    hostSay("vaultReveal", { name: p.name, amt: money(p.wager) });
    Snd.play("door");
    stage('<div class="door-wrap"><div class="door door-l"></div><div class="door door-r"></div><div class="door-content">' +
      '<div class="round-kicker">THE VAULT · REVEAL</div>' +
      '<div class="round-title">' + esc(p.name) + "</div>" +
      '<p class="round-text">The question: ' + esc(q.q) + "<br>" +
      esc(p.name) + " answered: <b>" + esc(theirText === null ? "(no answer)" : theirText) + "</b><br>" +
      "The answer: <b>" + esc(q.a) + "</b><br>" +
      "Wager: " + money(p.wager) + " — " + (right ? '<span style="color:var(--green)">won.</span>' : '<span style="color:var(--red)">lost.</span>') + "</p>" +
      '<p class="why">' + esc(q.why) + "</p>" + standingsHTML() +
      '<button class="btn-gold" id="btnRevealNext">' + (G.revealIdx + 1 >= G.order.length ? "THE RESULT" : "NEXT REVEAL") + "</button></div></div>");
    G.revealIdx++;
    $("btnRevealNext").addEventListener("click", vaultRevealNext);
    renderSeats();
  }
  function finishShow() {
    var best = Math.max.apply(null, G.players.map(function (p) { return p.score; }));
    var tied = G.players.map(function (p, i) { return i; }).filter(function (i) { return G.players[i].score === best; });
    if (tied.length > 1) { suddenDeath(tied); return; }
    winnerScreen(tied[0]);
  }
  function suddenDeath(tied) {
    G.tied = tied.slice(); G.phase = "claim";
    hostSay("tie");
    var offer = pick(makeOffers());
    var q = drawQuestion(offer.cat, "medium");
    setupQuestion(q, offer, -1);
    G.cur.openFloor = true; G.cur.sudden = true;
    stage('<div class="round-kicker">SUDDEN DEATH</div>' +
      '<div class="round-title">One question takes it</div>' +
      questionHTML("Tied players only — first to shout claims it.") +
      '<p class="round-text" style="margin-top:10px">Waiting for a claim from a tied player…</p>');
    renderSeats();
  }
  function winnerScreen(i) {
    G.phase = "over";
    var p = G.players[i];
    hostSay("winner", { name: p.name });
    var order = G.players.map(function (pp, ii) { return ii; }).sort(function (a, b) { return G.players[b].score - G.players[a].score; });
    var rows = order.map(function (ii, pos) {
      var pp = G.players[ii];
      return '<div class="stmt-row' + (ii === i ? " win" : "") + '"><span>' + (pos + 1) + ". " + esc(pp.name) + '</span><span class="dots"></span><span>' + money(pp.score) + "</span></div>";
    }).join("");
    stage('<div class="crown">♛</div><div class="round-kicker">THE VAULT OPENS FOR</div>' +
      '<div class="winner-name">' + esc(p.name) + "</div>" +
      '<p class="round-text">Final balance ' + money(p.score) + ". The Gilded Hour is yours.</p>" +
      '<div class="statement"><div class="stmt-head">THE GILDED HOUR · STATEMENT OF ACCOUNT</div>' + rows +
      '<div class="stmt-total"><span>PAID TO ' + esc(p.name.toUpperCase()) + "</span><span>" + money(p.score) + "</span></div>" +
      '<div class="stmt-foot">Settled in full. Sterling thanks the table.</div></div>' +
      '<button class="btn-gold" id="btnAgain">BACK TO THE LOBBY</button>');
    Snd.play("finale");
    startLeaves();
    saveSeen();
    renderSeats();
    $("btnAgain").addEventListener("click", function () { stopLeaves(); showScreen("scr-title"); G = null; });
  }

  /* ---------- setup screen ---------- */
  var playerCount = 3;
  function buildNameRows() {
    var wrap = $("nameRows"); wrap.innerHTML = "";
    for (var i = 0; i < playerCount; i++) {
      var row = el('<div class="name-row"><span class="name-dot" style="background:' + PCOLORS[i] + '"></span>' +
        '<input class="name-input" maxlength="14" value="' + PNAMES[i] + '">' +
        '<span class="name-seat">SEAT ' + (i + 1) + "</span></div>");
      wrap.appendChild(row);
    }
  }
  document.querySelectorAll(".count-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".count-btn").forEach(function (x) { x.classList.remove("sel"); });
      b.classList.add("sel");
      playerCount = parseInt(b.getAttribute("data-n"), 10);
      buildNameRows();
    });
  });
  $("btnStart").addEventListener("click", function () {
    Snd.ensure();
    var names = Array.prototype.map.call(document.querySelectorAll(".name-input"), function (inp, i) {
      return inp.value.trim() || PNAMES[i];
    });
    startShow(names);
  });
  $("btnQuit").addEventListener("click", function () {
    stopClock(); stopLeaves(); saveSeen(); G = null; showScreen("scr-title");
    var efx = $("edgeFx"); if (efx) efx.classList.remove("steal");
  });
  buildNameRows();
  /* mute toggle on the title screen — persisted; the show reads fully silent */
  var btnMute = $("btnMute");
  function paintMute() {
    if (!btnMute) return;
    btnMute.textContent = Snd.muted ? "SOUND: OFF" : "SOUND: ON";
    btnMute.classList.toggle("on", !Snd.muted);
  }
  if (btnMute) btnMute.addEventListener("click", function () {
    Snd.ensure(); Snd.setMuted(!Snd.muted); paintMute();
    if (!Snd.muted) Snd.play("correct");
  });
  paintMute();
  /* the cold open is skippable — a tap never traps the table */
  $("stage").addEventListener("click", function () {
    if (G && G.phase === "coldopen") { clearTimeout(coldTimer); roundIntro(); }
  });
  /* heavy animation and audio rest while the tab is hidden */
  document.addEventListener("visibilitychange", function () {
    pageHidden = document.hidden;
    if (Snd.ctx) { try { if (document.hidden) Snd.ctx.suspend(); else Snd.ctx.resume(); } catch (e) {} }
  });
  requestAnimationFrame(loop);

  /* ---------- test hooks ---------- */
  window.__game = {
    get G() { return G; }, get clock() { return clock; },
    startShow: startShow, BANK: BANK
  };
})();
