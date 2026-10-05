/* Wildgrove — UI: HUD, sheets, journal, chronicle, observe, tutorial. */
(function () {
  var world = null;
  var chronicle = [];   // {t, text, event}
  var seenSpecies = {}; // speciesId -> {count, residents, births}
  var jtab = "fauna";

  function init(w) {
    world = w;
    try {
      var c = JSON.parse(localStorage.getItem("wg_chronicle") || "[]");
      if (Array.isArray(c)) chronicle = c.slice(-120);
      seenSpecies = JSON.parse(localStorage.getItem("wg_seen") || "{}");
    } catch (e) {}
    bindToolbar();
    bindSheets();
    updateHud();
  }

  function saveMeta() {
    try {
      localStorage.setItem("wg_chronicle", JSON.stringify(chronicle.slice(-120)));
      localStorage.setItem("wg_seen", JSON.stringify(seenSpecies));
    } catch (e) {}
  }

  function $(id) { return document.getElementById(id); }

  /* ---------- toolbar ---------- */
  function bindToolbar() {
    var btns = document.querySelectorAll("#toolbar .tool");
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", function () {
        var t = this.dataset.tool;
        WGAudio.ensure(); WGAudio.select();
        if (t === "journal") { openJournal(); return; }
        if (t === "chronicle") { openChronicle(); return; }
        WGInput.setTool(t);
        hintFor(t);
      });
    }
    btns[0].classList.add("active");
  }

  function hintFor(t) {
    if (t === "plant") hint("Tap the meadow to plant — or pick a seed first 🌱");
    else if (t === "water") hint("Drag across the grove to water 💧");
    else hint("Touch and hold any animal to meet it 👁️");
  }

  var hintTimer = null;
  function hint(text, ms) {
    var el = $("hint");
    el.textContent = text;
    el.classList.remove("hidden");
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { el.classList.add("hidden"); }, ms || 4200);
  }

  function toast(text) {
    var el = $("toast");
    el.textContent = text;
    el.classList.remove("hidden");
    setTimeout(function () { el.classList.add("hidden"); }, 2600);
  }

  /* ---------- HUD ---------- */
  var SVG_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.2 5.2l1.8 1.8M17 17l1.8 1.8M18.8 5.2L17 7M7 17l-1.8 1.8"/></svg>';
  var SVG_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/></svg>';
  var SVG_LEAF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19C5 9 12 4 20 4c0 8-5 15-15 15z"/><path d="M5 19c3-5 7-9 11-11"/></svg>';
  var SVG_CLOUD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 18a4.5 4.5 0 0 1-.6-8.97A6 6 0 0 1 17.6 8.6 4.2 4.2 0 0 1 17.5 18h-11z"/></svg>';
  var SVG_RAIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 14a4.5 4.5 0 0 1-.6-8.97A6 6 0 0 1 17.6 4.6 4.2 4.2 0 0 1 17.5 14h-11z"/><path d="M8 17.5l-1 2.5M12.5 17.5l-1 2.5M17 17.5l-1 2.5"/></svg>';
  var SVG_STORM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 13a4.5 4.5 0 0 1-.6-8.97A6 6 0 0 1 17.6 3.6 4.2 4.2 0 0 1 17.5 13h-11z"/><path d="M12 13l-2.5 4H12l-1.5 4 4.5-6.5h-2.5L13.5 13H12z"/></svg>';
  var SEASON_TINT = { spring: "#8fce6e", summer: "#5da24f", autumn: "#d88a3c", winter: "#a8c4de" };

  var vineLen = 0, vineInit = false;
  var hudTimer = null;
  function wakeHud() {
    var hud = $("hud"), tb = $("toolbar");
    if (hud) hud.classList.remove("dim");
    if (tb) tb.classList.remove("dim");
    if (hudTimer) clearTimeout(hudTimer);
    hudTimer = setTimeout(function () {
      if (hud) hud.classList.add("dim");
      if (tb) tb.classList.add("dim");
    }, 5000);
  }
  function initVine() {
    if (vineInit) return; vineInit = true;
    var fill = $("vine-fill");
    try { vineLen = fill.getTotalLength(); } catch (e) { vineLen = 300; }
    fill.style.strokeDasharray = vineLen;
    var g = $("vine-leaves");
    var NS = "http://www.w3.org/2000/svg";
    for (var i = 0; i < 6; i++) {
      var t = (i + 1) / 7;
      var pt = fill.getPointAtLength(vineLen * t);
      var leaf = document.createElementNS(NS, "path");
      leaf.setAttribute("d", "M0 0 C 5 -7, 12 -7, 16 0 C 12 7, 5 7, 0 0 Z");
      leaf.setAttribute("fill", "#8fce6e");
      leaf.setAttribute("class", "vleaf");
      leaf.setAttribute("transform", "translate(" + pt.x.toFixed(1) + "," + pt.y.toFixed(1) + ") rotate(" + (i % 2 ? -38 : 38) + ")");
      leaf.dataset.t = t;
      g.appendChild(leaf);
    }
  }

  function updateHud() {
    var v = WG.vitality(world);
    initVine();
    var fill = $("vine-fill");
    fill.style.strokeDashoffset = vineLen * (1 - v / 100);
    try {
      var bud = $("vine-bud");
      var bp = fill.getPointAtLength(vineLen * Math.max(0.02, v / 100));
      bud.setAttribute("cx", bp.x); bud.setAttribute("cy", bp.y);
    } catch (e) {}
    var leaves = document.querySelectorAll("#vine-leaves .vleaf");
    for (var li = 0; li < leaves.length; li++) {
      leaves[li].style.opacity = v >= (+leaves[li].dataset.t) * 100 ? 1 : 0.16;
    }
    $("stage-name").textContent = WG.stageOf(world).name;
    var season = WG.seasonOf(world);
    $("season-icon").innerHTML = SVG_LEAF;
    $("season-icon").style.color = SEASON_TINT[season] || "#8fce6e";
    var h = WG.hourOf(world.now);
    var isDay = h >= 6 && h < 18.5;
    $("daynight-icon").innerHTML = isDay ? SVG_SUN : SVG_MOON;
    $("daynight-icon").style.color = isDay ? "#f2c94c" : "#c8d4f0";
    var w = world.weather;
    $("weather-icon").innerHTML = w === "rain" ? SVG_RAIN : w === "storm" ? SVG_STORM : w === "cloudy" ? SVG_CLOUD : "";
    $("weather-icon").style.color = "#a8c4de";
    wakeHud();
    // audio follows the sky
    if (isDay) { WGAudio.stopNight(); } else { WGAudio.startNight(); }
    if (w === "rain" || w === "storm") WGAudio.startRain(); else WGAudio.stopRain();
  }

  /* ---------- sheets ---------- */
  function closeAllSheets() {
    ["recap", "plant-picker", "journal", "chronicle"].forEach(function (id) {
      $(id).classList.add("hidden");
    });
  }
  function bindSheets() {
    var closes = document.querySelectorAll(".sheet-close");
    for (var i = 0; i < closes.length; i++)
      closes[i].addEventListener("click", closeAllSheets);
    $("recap-close").addEventListener("click", closeAllSheets);
    $("plant-cancel").addEventListener("click", closeAllSheets);
    $("observe-close").addEventListener("click", function () {
      $("observe-card").classList.add("hidden");
    });
    var jtabs = document.querySelectorAll(".jtab");
    for (var j = 0; j < jtabs.length; j++) {
      jtabs[j].addEventListener("click", function () {
        jtab = this.dataset.jtab;
        for (var k = 0; k < jtabs.length; k++) jtabs[k].classList.toggle("active", jtabs[k] === this);
        renderJournal();
      });
    }
  }

  /* ---------- recap ---------- */
  function fmtWhen(t) {
    var d = new Date(t);
    var now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    var hh = d.getHours(), ap = hh >= 12 ? "pm" : "am", h12 = hh % 12 || 12;
    return sameDay ? "today, " + h12 + ap : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " + h12 + ap;
  }

  function showRecap(events) {
    var interesting = events.filter(function (e) {
      return ["arrival", "resident", "birth", "nesting", "season", "stage", "departure", "grown", "chase", "alarm", "weather"].indexOf(e.type) >= 0;
    });
    if (!interesting.length) return;
    var list = $("recap-list");
    list.innerHTML = "";
    // newest first, cap 8
    interesting.slice(-8).reverse().forEach(function (e) {
      var text = addChronicle(e);
      var div = document.createElement("div");
      div.className = "recap-item";
      div.innerHTML = "";
      div.appendChild(document.createTextNode(text));
      var when = document.createElement("span");
      when.className = "when";
      when.textContent = fmtWhen(e.t);
      div.appendChild(when);
      list.appendChild(div);
    });
    $("recap").classList.remove("hidden");
  }

  /* ---------- chronicle ---------- */
  function addChronicle(event) {
    var text = WGAi.vignette(event);
    chronicle.push({ t: event.t || Date.now(), text: text, key: chronKey(event) });
    saveMeta();
    return text;
  }
  function chronKey(ev) {
    return (ev.type || "") + "|" + (ev.name || ev.motherName || "") + "|" + (ev.t || "");
  }
  function upgradeChronicle(event, betterText) {
    var k = chronKey(event);
    for (var i = chronicle.length - 1; i >= 0; i--) {
      if (chronicle[i].key === k) {
        chronicle[i].text = betterText;
        saveMeta();
        if (!$("chronicle").classList.contains("hidden")) renderChronicle();
        return;
      }
    }
  }
  function openChronicle() {
    closeAllSheets();
    renderChronicle();
    $("chronicle").classList.remove("hidden");
  }
  function renderChronicle() {
    var list = $("chronicle-list");
    list.innerHTML = "";
    if (!chronicle.length) {
      list.innerHTML = "<p class='subtitle'>Nothing yet — the forest is still deciding what to tell.</p>";
      return;
    }
    chronicle.slice().reverse().forEach(function (c) {
      var div = document.createElement("div");
      div.className = "chronicle-item";
      div.appendChild(document.createTextNode(c.text));
      var when = document.createElement("span");
      when.className = "when";
      when.textContent = fmtWhen(c.t);
      div.appendChild(when);
      list.appendChild(div);
    });
  }

  /* ---------- plant picker ---------- */
  function openPlantPicker() {
    closeAllSheets();
    var grid = $("plant-grid");
    grid.innerHTML = "";
    Object.keys(WG.FLORA).forEach(function (id) {
      var cfg = WG.FLORA[id];
      var b = document.createElement("button");
      b.className = "plant-opt";
      var thumbUrl = "";
      try { thumbUrl = WGR.thumbFor(id, WG.seasonOf(world)).toDataURL(); } catch (e) {}
      b.innerHTML = (thumbUrl ? '<img class="p-thumb" src="' + thumbUrl + '" alt="">' : '<span class="p-emoji">🌱</span>') +
        '<span class="p-name">' + cfg.name + "</span>";
      b.addEventListener("click", function () {
        WGInput.setPickedPlant(id);
        WGInput.setTool("plant");
        var opts = grid.querySelectorAll(".plant-opt");
        for (var i = 0; i < opts.length; i++) opts[i].classList.remove("picked");
        b.classList.add("picked");
        closeAllSheets();
        hint("Tap the meadow to plant your " + cfg.name.toLowerCase());
      });
      grid.appendChild(b);
    });
    $("plant-picker").classList.remove("hidden");
  }

  /* ---------- journal ---------- */
  function trackSeen() {
    for (var i = 0; i < world.animals.length; i++) {
      var a = world.animals[i];
      var s = seenSpecies[a.sp] || (seenSpecies[a.sp] = { count: 0, residents: 0, births: 0 });
      s.count++;
      if (a.resident) s.residents++;
    }
    saveMeta();
  }

  function noteBirth(species, count) {
    var s = seenSpecies[species] || (seenSpecies[species] = { count: 0, residents: 0, births: 0 });
    s.births += count;
    saveMeta();
  }

  function openJournal() {
    closeAllSheets();
    trackSeen();
    renderJournal();
    $("journal").classList.remove("hidden");
  }

  function spriteURL(id) {
    if (!window.WG_SPR || !window.WG_SPR[id]) return "";
    return "data:" + (window.WG_SPR[id + "_mime"] || "image/webp") + ";base64," + window.WG_SPR[id];
  }

  function renderJournal() {
    var list = $("journal-list");
    list.innerHTML = "";
    var ids = jtab === "fauna" ? Object.keys(WG.FAUNA) : Object.keys(WG.FLORA);
    ids.forEach(function (id) {
      var cfg = (jtab === "fauna" ? WG.FAUNA : WG.FLORA)[id];
      var seen = jtab === "fauna" ? !!seenSpecies[id] :
        world.plants.some(function (p) { return p.sp === id; });
      var div = document.createElement("div");
      div.className = "journal-entry" + (seen ? "" : " undiscovered");
      var img = document.createElement("img");
      img.alt = "";
      if (jtab === "fauna" && seen) img.src = spriteURL(id);
      div.appendChild(img);
      var body = document.createElement("div");
      var nm = document.createElement("div");
      nm.className = "j-name";
      nm.textContent = seen ? cfg.name : "???";
      body.appendChild(nm);
      if (seen) {
        var bl = document.createElement("div");
        bl.className = "j-fact";
        bl.textContent = cfg.blurb;
        body.appendChild(bl);
        var fc = document.createElement("div");
        fc.className = "j-fact";
        fc.textContent = "…";
        body.appendChild(fc);
        WGAi.fact(id, function (text) { if (text) fc.textContent = text; });
        if (jtab === "fauna" && seenSpecies[id]) {
          var ct = document.createElement("div");
          ct.className = "j-count";
          var s = seenSpecies[id];
          ct.textContent = s.residents + " resident" + (s.residents === 1 ? "" : "s") +
            (s.births ? " · " + s.births + " born here" : "");
          body.appendChild(ct);
        }
      } else {
        var hintEl = document.createElement("div");
        hintEl.className = "j-fact";
        hintEl.textContent = jtab === "fauna"
          ? "Not yet seen. Grow the right habitat and wait."
          : "Not yet planted.";
        body.appendChild(hintEl);
      }
      div.appendChild(body);
      list.appendChild(div);
    });
  }

  /* ---------- observe ---------- */
  function observe(animalId) {
    var o = WG.observe(world, animalId);
    if (!o) return;
    $("observe-img").src = spriteURL(o.juvenile ? animalJuvenileKey(animalId) : speciesKey(animalId));
    $("observe-name").textContent = o.name + (o.juvenile ? " (young)" : "");
    $("observe-species").textContent = o.species + " · " + o.activity;
    $("observe-blurb").textContent = o.blurb;
    $("observe-habits").textContent = "Active " + o.activeHours + " · eats " + o.diet + " · " + o.likes +
      (o.resident ? " · resident" : " · visitor") + " · generation " + o.generation;
    var factEl = $("observe-fact");
    factEl.textContent = "…";
    WGAi.fact(speciesKey(animalId), function (text) { if (text) factEl.textContent = text; });
    $("observe-card").classList.remove("hidden");
  }
  function speciesKey(animalId) {
    for (var i = 0; i < world.animals.length; i++)
      if (world.animals[i].id === animalId) return world.animals[i].sp;
    return "";
  }
  function animalJuvenileKey(animalId) {
    var k = speciesKey(animalId) + "_juv";
    return (window.WG_SPR && window.WG_SPR[k]) ? k : speciesKey(animalId);
  }

  /* ---------- tutorial ---------- */
  function tutorial() {
    var step = 0;
    var steps = [
      "Welcome, keeper. This grove is yours to tend — and it lives even while you're away.",
      "Tap 🌱 below, choose a seed, then tap the meadow to plant it.",
      "Drag 💧 across the ground to water. Touch and hold any animal to meet it.",
      "That's everything. Come back tomorrow — something will have grown."
    ];
    hint(steps[0], 5200);
    var iv = setInterval(function () {
      step++;
      if (step >= steps.length) { clearInterval(iv); return; }
      // only continue if the user hasn't started playing
      hint(steps[step], 5200);
    }, 5600);
  }

  window.WGUi = {
    init: init, updateHud: updateHud, toast: toast, hint: hint,
    showRecap: showRecap, openPlantPicker: openPlantPicker,
    observe: observe, upgradeChronicle: upgradeChronicle,
    addChronicle: addChronicle, trackSeen: trackSeen, noteBirth: noteBirth,
    tutorial: tutorial, closeAllSheets: closeAllSheets, saveMeta: saveMeta,
    wakeHud: wakeHud
  };
})();
