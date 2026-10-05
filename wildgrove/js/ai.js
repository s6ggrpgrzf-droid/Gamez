/* Wildgrove — AI client. The worker is a garnish, never a dependency:
 * every call has a timeout and falls back to local content silently. */
(function () {
  var WORKER = "https://wildgrove-ai.chaoticutopia84.workers.dev";
  var TIMEOUT = 9000;
  var factCache = {};

  function post(path, body) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; resolve(null); }
      }, TIMEOUT);
      try {
        fetch(WORKER + path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }).then(function (r) {
          if (!r.ok) throw new Error("http " + r.status);
          return r.json();
        }).then(function (d) {
          if (!done) { done = true; clearTimeout(timer); resolve(d); }
        }).catch(function () {
          if (!done) { done = true; clearTimeout(timer); resolve(null); }
        });
      } catch (e) {
        if (!done) { done = true; clearTimeout(timer); resolve(null); }
      }
    });
  }

  var seedN = 0;

  /* Chronicle vignette for a sim event. Always resolves a string. */
  function vignette(event) {
    var fallback = WGContent.vignette({
      type: event.type,
      name: event.name || event.motherName || event.preyName || event.jayName,
      species: event.species, speciesName: speciesName(event.species),
      count: event.count, names: event.names,
      season: event.season, stage: event.stage,
      predator: event.predator, predatorName: event.predatorName,
      predatorSpecies: speciesName(event.predator),
      prey: event.prey, preyName: event.preyName,
      preySpecies: speciesName(event.prey)
    }, (seedN++) % 3);
    post("/vignette", { event: slim(event) }).then(function (d) {
      // resolved async — the caller already got the fallback; the AI
      // version upgrades the chronicle entry in place if still relevant
      if (d && d.text && typeof WGUi !== "undefined")
        WGUi.upgradeChronicle(event, d.text);
    });
    return fallback;
  }

  function slim(ev) {
    return {
      type: ev.type, species: ev.species, name: ev.name || ev.motherName,
      count: ev.count, names: ev.names, season: ev.season, stage: ev.stage,
      predator: ev.predator, prey: ev.prey
    };
  }

  function speciesName(spId) {
    if (!spId) return "";
    if (WG.FAUNA[spId]) return WG.FAUNA[spId].name;
    if (WG.FLORA[spId]) return WG.FLORA[spId].name;
    return spId;
  }

  /* One true natural-history fact per species; cached in memory. */
  function fact(speciesId, cb) {
    if (factCache[speciesId]) { cb(factCache[speciesId]); return; }
    var local = WGContent.FACTS[speciesId] || "";
    // hand back the local fact immediately so UI never waits;
    // the AI version quietly replaces it in cache for next time
    post("/fact", { species: speciesId }).then(function (d) {
      if (d && d.text) factCache[speciesId] = d.text;
    });
    cb(local);
  }

  window.WGAi = { vignette: vignette, fact: fact, speciesName: speciesName };
})();
