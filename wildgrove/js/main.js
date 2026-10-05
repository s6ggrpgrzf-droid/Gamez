/* Wildgrove — main: boot, game loop, persistence, event plumbing. */
(function () {
  var world = null;
  var canvas = null;
  var lastFrame = 0;
  var saveTimer = 0;
  var SAVE_KEY = "wg_save_v1";
  var dawnDone = "";

  function boot() {
    canvas = document.getElementById("scene");
    loadOrCreate();
    WGR.init(canvas, world);
    WGInput.init(canvas, world);
    WGUi.init(world);

    // sprites then title
    WGR.loadSprites().then(function () {
      document.getElementById("enter-btn").addEventListener("click", enter);
      // auto-enter if returning player
      try {
        if (localStorage.getItem("wg_seen_before")) enter();
        else document.getElementById("title-note").textContent = "your forest keeps growing while you're away";
      } catch (e) {}
    });
  }

  function loadOrCreate() {
    var now = Date.now();
    var saved = null;
    try { saved = localStorage.getItem(SAVE_KEY); } catch (e) {}
    if (saved) {
      try {
        var d = JSON.parse(saved);
        world = WG.deserialize(d.world);
      } catch (e) { world = null; }
    }
    if (!world) {
      world = WG.createWorld((Math.random() * 1e9) | 0, now);
      // starter gift: a few grasses so the first rabbit can arrive
      WG.plant(world, "bluestem", 380, 1380, now);
      WG.plant(world, "bluestem", 620, 1420, now);
      WG.plant(world, "clover", 500, 1300, now);
    }
    // catch up the simulation: the forest lived while you were away
    var events = WG.tick(world, now);
    handleEvents(events, true);
  }

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ world: WG.serialize(world) }));
      localStorage.setItem("wg_seen_before", "1");
    } catch (e) {}
    WGUi.saveMeta();
  }

  function enter() {
    document.getElementById("title").classList.add("hidden");
    document.getElementById("game").classList.remove("hidden");
    WGR.resize();
    WGAudio.ensure();
    WGAudio.startAmbience();
    var isNew = false;
    try { isNew = !localStorage.getItem("wg_tutorial_done"); } catch (e) {}
    // recap was already computed at boot; show it for returning players
    if (window._wgRecap && window._wgRecap.length) {
      WGUi.showRecap(window._wgRecap);
    } else if (isNew) {
      WGUi.tutorial();
      try { localStorage.setItem("wg_tutorial_done", "1"); } catch (e) {}
    } else {
      WGUi.hint("The grove kept itself while you were gone 🌿", 3600);
    }
    lastFrame = performance.now();
    requestAnimationFrame(loop);
    // dawn chorus once per morning
    maybeChorus();
    setInterval(maybeChorus, 60000);
    // autosave
    setInterval(save, 30000);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) save();
    });
  }

  function maybeChorus() {
    var h = WG.hourOf(world.now);
    var day = new Date(world.now).toDateString();
    if (h >= 5.5 && h < 9 && dawnDone !== day) {
      dawnDone = day;
      var residents = [];
      for (var i = 0; i < world.animals.length; i++) {
        var a = world.animals[i];
        if (a.resident && residents.indexOf(a.sp) < 0) residents.push(a.sp);
      }
      WGAudio.dawnChorus(residents);
    }
  }

  /* called by input after planting/watering */
  function afterPlayerAction() {
    WGUi.updateHud();
    saveTimer = 0;
  }

  function handleEvents(events, isCatchup) {
    if (isCatchup) {
      window._wgRecap = events;
      return;
    }
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (e.type === "arrival") {
        WGAudio.arrival();
        WGUi.toast("A " + WGAi.speciesName(e.species) + " arrived!");
        WGUi.addChronicle(e);
        WGUi.trackSeen();
      } else if (e.type === "birth") {
        WGAudio.arrival();
        WGUi.toast(e.count + " new lives in the grove!");
        WGUi.addChronicle(e);
        WGUi.noteBirth(e.species, e.count);
        WGUi.trackSeen();
      } else if (e.type === "resident" || e.type === "nesting" || e.type === "grown" ||
                 e.type === "season" || e.type === "stage" || e.type === "departure" ||
                 e.type === "chase" || e.type === "alarm") {
        WGUi.addChronicle(e);
      } else if (e.type === "weather" && (e.weather === "rain" || e.weather === "storm")) {
        WGUi.toast(e.weather === "storm" ? "A storm rolls through ⛈️" : "Rain — the grove drinks 🌧️");
      } else if (e.type === "planted") {
        WGR.invalidatePlant(e.plantId);
      } else if (e.type === "selfseed") {
        // find the newest plant of that flora and invalidate (cheap: clear all)
        WGR.invalidatePlant(-1);
      }
      if (e.type === "stage" || e.type === "season" || e.type === "arrival" || e.type === "birth") {
        WGUi.updateHud();
      }
    }
  }

  var evtCursor = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.1, (t - lastFrame) / 1000);
    lastFrame = t;
    var now = Date.now();
    var events = WG.tick(world, now);
    if (events.length) handleEvents(events, false);
    WGR.frame(now, dt);
    // periodic HUD refresh (cheap, every ~5s)
    saveTimer += dt;
    if (saveTimer > 5) { saveTimer = 0; WGUi.updateHud(); }
  }

  window.WGMain = { afterPlayerAction: afterPlayerAction, save: save, handleEvents: handleEvents };
  window.WGDebug = { world: function () { return world; } };
  document.addEventListener("DOMContentLoaded", boot);
})();
