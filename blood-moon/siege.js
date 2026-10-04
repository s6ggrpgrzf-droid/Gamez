/* Blood Moon — siege.js (Coffin Shift)
 * Pure simulation: no DOM, no canvas, no Audio. Deterministic given a seed.
 * The day interlude: the vampire lies in torpor in the crypt while hunters
 * siege it — FNAF-style defense management, inverted. Blood (charged on the
 * night hunt) is the power bar. Survive the canonical hours to dusk.
 *
 * Hunter grammars (FNAF rules):
 *   Torch Mob   = fixed lane, steady advance (Bonnie)
 *   Priest      = advances ONLY while unobserved (Freddy)
 *   Bloodhound  = scent timer builds, then sprint (Foxy)
 *   Inquisitor  = off-lane ritual countdown, orange->red warning (Puppet)
 */
(function (root) {
  'use strict';

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var HOURS = ['Prime', 'Terce', 'Sext', 'None'];
  var HOUR_LEN = 60;
  var SHIFT_LEN = 240;          // four canonical hours to dusk
  var LANES = ['west', 'east', 'chapel'];
  var STAGES = 5;               // 4 (far) .. 0 (at the door)
  var SIGS = { torch: 'march', priest: 'murmur', hound: 'sniff' };

  function defaultAi(day) {
    var b = 2 + (day - 1) * 3;
    if (day >= 6) b = 18;
    return {
      torch: clamp(b, 0, 20), priest: clamp(b - 1, 0, 20),
      hound: clamp(b, 0, 20), inquisitor: clamp(b - 1, 0, 20)
    };
  }

  function makeSiege(seed, opts) {
    opts = opts || {};
    var rng = mulberry32(seed >>> 0 || 1);
    var day = opts.day || 1;
    var ai = opts.ai || defaultAi(day);

    var s = {
      rng: rng, day: day, ai: ai, time: 0, hour: 0,
      over: false, won: false,
      blood: clamp(opts.blood !== undefined ? opts.blood : 70, 0, 100),
      ward: 100, sanctity: 100, smoke: 0,
      shutters: [false, false, false],
      ritual: 15, ritualDone: false, ritualWarned: 0, // the inquisitor has been chanting since dawn
      houndScent: 0,
      ravenCd: 0, mendCd: 0,
      ravenFresh: 0,
      thrallPosted: false, // the charmed thrall tends the wards: ritual x0.3, scent x0.5, 0.25 blood/s
      torpor: 0, // 0 alert, 1 sluggish, 2 failing
      hunters: [], events: [],
      sigT: 0,
      stats: { bangs: 0, breaches: 0, sprints: 0, reports: 0, mends: 0, vents: 0 }
    };

    function ev(kind, d) { d = d || {}; d.kind = kind; s.events.push(d); }

    function spawnHunter(type, lane) {
      var h = { type: type, lane: lane, stage: STAGES - 1, advT: 2 + rng() * 3 };
      s.hunters.push(h);
      return h;
    }
    spawnHunter('torch', (rng() * 3) | 0);
    spawnHunter('priest', (rng() * 3) | 0);
    spawnHunter('hound', (rng() * 3) | 0);

    function aggro(type) { return 1 + (ai[type] || 0) * 0.035; }
    function hourBoost() { return 1 + s.hour * 0.12; } // later hours hungrier

    function observed(lane, listenLane) {
      if (s.ravenFresh > 0) return true;
      return listenLane === lane;
    }

    function hurtWard(n, why) {
      s.ward = Math.max(0, s.ward - n);
      ev('wardhit', { dmg: n, why: why, ward: Math.round(s.ward) });
      if (s.ward <= 0 && !s.over) { s.over = true; ev('breakin', { cause: 'ward' }); }
    }
    function drinkBlood(n) {
      s.blood = Math.max(0, s.blood - n);
      if (s.blood <= 0 && !s.over) {
        s.over = true; s.torpor = 2;
        ev('torpor', { stage: 2 });
        ev('breakin', { cause: 'torpor' });
      }
    }

    function arrival(h, laneOpen) {
      var P = s; // (naming: the crypt is the "player" here)
      if (laneOpen) {
        // breach: they get a moment inside (failure costs blood)
        P.stats.breaches++;
        hurtWard(h.type === 'priest' ? 18 : 14, h.type + '-breach');
        if (h.type === 'priest') P.sanctity = Math.max(0, P.sanctity - 10);
        drinkBlood(8);
        ev('breach', { type: h.type, lane: h.lane });
        h.stage = 2;
      } else {
        // bang on the shutter: noisy, driven back. The defense already cost
        // you shutter-power; no extra blood tax for doing it right.
        P.stats.bangs++;
        hurtWard(5, h.type + '-bang');
        ev('bang', { type: h.type, lane: h.lane });
        h.stage = 2;
      }
      h.advT = 4 + rng() * 3;
    }

    function step(dt, input) {
      if (s.over) return s.events.splice(0);
      input = input || {};
      s.time += dt;
      var hour = Math.min(3, (s.time / HOUR_LEN) | 0);
      if (hour !== s.hour) { s.hour = hour; ev('hour', { hour: hour, name: HOURS[hour] }); }

      var shIn = input.shutters || [];
      var ventLane = (input.ventLane === undefined ? -1 : input.ventLane) | 0;
      var listenLane = ((input.listen | 0) || 0) - 1; // 0=none, 1..3 -> lane 0..2
      var closedCount = 0;
      for (var li = 0; li < 3; li++) {
        s.shutters[li] = !!shIn[li] && li !== ventLane; // venting forces the lane open
        if (s.shutters[li]) closedCount++;
      }
      var venting = ventLane >= 0 && ventLane < 3;
      if (venting) { s.smoke = Math.max(0, s.smoke - 10 * dt); s.stats.vents++; }

      // --- blood economy ---
      drinkBlood(dt * (0.1 + closedCount * 0.6)); // shutters drink; the body drinks
      if (s.over) return s.events.splice(0);

      // --- cooldowns / freshness ---
      if (s.ravenCd > 0) s.ravenCd -= dt;
      if (s.mendCd > 0) s.mendCd -= dt;
      if (s.ravenFresh > 0) s.ravenFresh -= dt;

      // --- lookouts (priced information) ---
      // Raven: burst report, priced per use. Thrall: posted guard, priced per second.
      if (input.lookout === 1 && s.ravenCd <= 0 && s.blood >= 5) {
        drinkBlood(5); s.ravenCd = 20; s.ravenFresh = 6; s.stats.reports++;
        ev('report', { by: 'raven' });
      }
      s.thrallPosted = !!input.thrall && s.blood > 1;
      if (s.thrallPosted) drinkBlood(0.25 * dt);
      if (s.over) return s.events.splice(0);

      // --- ward mending ---
      if (input.mend && s.mendCd <= 0 && s.blood >= 8 && s.ward < 100) {
        drinkBlood(8); s.mendCd = 6;
        s.ward = Math.min(100, s.ward + 18);
        s.stats.mends++;
        ev('mend', { ward: Math.round(s.ward) });
      }
      if (s.over) return s.events.splice(0);

      // --- smoke / sanctity ---
      s.smoke = Math.min(100, s.smoke + dt * (1.0 + closedCount * 0.7));
      if (s.smoke >= 100) s.sanctity = Math.max(0, s.sanctity - 3 * dt);
      if (s.sanctity < 35) hurtWard(2 * dt, 'smoke');
      if (s.over) return s.events.splice(0);

      // --- listening: the verb. audio signatures per lane ---
      if (listenLane >= 0 && listenLane < 3) {
        s.sigT -= dt;
        if (s.sigT <= 0) {
          s.sigT = 1.5;
          var near = null;
          for (var hi = 0; hi < s.hunters.length; hi++) {
            var hh = s.hunters[hi];
            if (hh.lane === listenLane && (near === null || hh.stage < near.stage)) near = hh;
          }
          ev('sig', { lane: listenLane, sig: near ? SIGS[near.type] : 'silence' });
        }
      } else s.sigT = 0;

      // --- hunters ---
      for (var i = 0; i < s.hunters.length; i++) {
        var h = s.hunters[i];
        var laneOpen = !s.shutters[h.lane];
        var ventBoost = (venting && ventLane === h.lane) ? 1.5 : 1;

        if (h.type === 'torch') {
          // Bonnie: fixed lane, steady advance
          h.advT -= dt * ventBoost;
          if (h.advT <= 0) {
            if (h.stage > 0) {
              h.stage--;
              ev('advance', { type: 'torch', lane: h.lane, stage: h.stage });
              h.advT = 12 * hourBoost() / aggro('torch');
            } else arrival(h, laneOpen);
          }
        } else if (h.type === 'priest') {
          // Freddy: advances ONLY while unobserved
          if (!observed(h.lane, listenLane)) {
            h.advT -= dt * ventBoost;
            if (h.advT <= 0) {
              if (h.stage > 0) {
                h.stage--;
                ev('advance', { type: 'priest', lane: h.lane, stage: h.stage });
                h.advT = 9 * hourBoost() / aggro('priest');
              } else arrival(h, laneOpen);
            }
          }
        } else if (h.type === 'hound') {
          // Foxy: scent builds, then sprint. Listening at its lane checks it.
          var scentRate = (3.5 + s.hour * 1 + closedCount * 1) * aggro('hound');
          if (listenLane === h.lane) scentRate -= 25; // checking bleeds the scent
          if (s.thrallPosted) scentRate *= 0.5;
          s.houndScent = clamp(s.houndScent + scentRate * dt, 0, 100);
          h.advT -= dt * ventBoost;
          if (h.advT <= 0 && h.stage > 0) {
            h.stage--;
            ev('advance', { type: 'hound', lane: h.lane, stage: h.stage });
            h.advT = 14 * hourBoost() / aggro('hound');
          }
          if (s.houndScent >= 100) {
            s.houndScent = 25;
            h.stage = 0;
            s.stats.sprints++;
            ev('sprint', { lane: h.lane });
            arrival(h, laneOpen);
          } else if (h.stage === 0 && h.advT <= 0) {
            arrival(h, laneOpen);
          }
        }
        if (s.over) return s.events.splice(0);
      }

      // --- inquisitor ritual (Puppet): countdown with staged warnings ---
      // The rite advances on its own; the posted thrall unwinds it (music-box
      // rhythm: let it build, post the thrall to wind it back down). Tended
      // wards slow the advance. Completing it is heavy, not fatal.
      if (!s.ritualDone) {
        if (s.thrallPosted) {
          s.ritual = Math.max(0, s.ritual - 1.2 * dt);
        } else {
          var rRate = 1.0 * hourBoost() * aggro('inquisitor') * (1.4 - (s.ward / 100) * 0.8);
          if (closedCount > 0) rRate *= 0.6;      // held wards slow the rite
          s.ritual = Math.min(100, s.ritual + rRate * dt);
        }
        if (s.ritual >= 50 && s.ritualWarned < 1) { s.ritualWarned = 1; ev('ritualwarn', { level: 'orange' }); }
        if (s.ritual >= 80 && s.ritualWarned < 2) { s.ritualWarned = 2; ev('ritualwarn', { level: 'red' }); }
        ev('chant', { level: s.ritual }); // renderer maps to chant swell volume
        if (s.ritual >= 100) {
          s.ritualDone = true;
          ev('ritualdone', {});
          hurtWard(30, 'ritual');
          s.sanctity = Math.max(0, s.sanctity - 35);
          drinkBlood(15);
          if (s.over) return s.events.splice(0);
        }
      }

      // --- torpor staging ---
      var tp = s.blood >= 60 ? 0 : s.blood >= 30 ? 1 : 2;
      if (tp !== s.torpor) { s.torpor = tp; ev('torpor', { stage: tp }); }

      // --- dusk: survived the shift ---
      if (s.time >= SHIFT_LEN && !s.over) {
        s.over = true; s.won = true;
        ev('dusk', {});
      }
      return s.events.splice(0);
    }

    function score() {
      return Math.round(s.blood * 10 + s.ward * 5 + s.sanctity * 2 + (s.won ? 500 : 0));
    }

    // test/dev introspection
    function hunterByType(t) {
      for (var i = 0; i < s.hunters.length; i++) if (s.hunters[i].type === t) return s.hunters[i];
      return null;
    }

    return {
      sim: s, step: step, score: score, hunterByType: hunterByType,
      ev: ev
    };
  }

  root.BloodMoonSiege = {
    makeSiege: makeSiege, defaultAi: defaultAi,
    HOURS: HOURS, HOUR_LEN: HOUR_LEN, SHIFT_LEN: SHIFT_LEN, LANES: LANES
  };
})(typeof window !== 'undefined' ? window : globalThis);
