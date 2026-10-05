/* Wildgrove — local fallback content.
 * Used instantly (and offline) whenever the AI worker is unreachable.
 * Facts below are hand-written and true; the worker only adds variety.
 * No DOM, no canvas — safe to load anywhere.
 */
(function () {

  /* Vignette templates: {eventType: [templates]}.
   * Slots: {name} {species} {count} {names} {season} {stage} {predator} {prey} */
  var VIGNETTES = {
    arrival: [
      "At the edge of the meadow, something moved — {name} the {species}, come to see what the grove might offer.",
      "New tracks in the soft earth this morning. {name} the {species} has found the grove.",
      "A rustle, a pause, a curious eye. {name} the {species} arrived with the {season} light."
    ],
    resident: [
      "{name} the {species} has stopped wandering. This is home now.",
      "The grove has chosen, and been chosen. {name} the {species} is staying.",
      "Some arrivals are visits. This one is a homecoming — {name} the {species} is resident now."
    ],
    nesting: [
      "{name} is gathering and tucking, building the small architecture of a nest.",
      "Quiet work in a hidden corner: {name} the {species} is nesting."
    ],
    birth: [
      "Small new lives in the {season} grass — {name} the {species} has {count} young: {names}.",
      "The grove is louder in the best way. {name}'s young ({names}) are out in the world."
    ],
    grown: [
      "{name} the young {species} is grown now, and moves through the grove like it was always theirs.",
      "Another generation takes its place. {name} is adult now."
    ],
    season: [
      "The light has changed its mind. {season} is here, and the grove turns with it.",
      "{season} arrived overnight — the forest knew before you did."
    ],
    stage: [
      "Something fundamental has shifted. The grove is now: {stage}.",
      "Stand still and feel it — the grove has become {stage}."
    ],
    chase: [
      "A blur through the grass — {predatorName} the {predatorSpecies} gave chase, and {preyName} the {preySpecies} vanished into cover, heart hammering, unharmed.",
      "The old dance, danced well: {preyName} the {preySpecies} outran {predatorName} and lives to graze another day."
    ],
    alarm: [
      "{name} the jay screamed the alarm, and the whole grove held its breath.",
      "One sharp cry from {name}, and every small thing found cover."
    ],
    departure: [
      "{name} the {species} has moved on, following some wild compass. The grove wishes it well.",
      "Empty space where {name} used to be. The forest keeps the memory."
    ],
    rain: [
      "Rain, at last — the leaves turn their faces up to drink.",
      "A gray soft day. The grove drinks deeply."
    ]
  };

  /* Hand-written true facts, one per species. */
  var FACTS = {
    cottontail: "A cottontail's zigzag sprint can top 18 miles per hour — but its real defense is freezing motionless, trusting its brown coat to disappear.",
    gray_squirrel: "A gray squirrel buries thousands of acorns each autumn and forgets most of them. Those forgotten caches plant tomorrow's oak forest.",
    whitetail_deer: "White-tailed deer browse at dawn and dusk to avoid the midday heat — and a fawn's spots are camouflage that fades as it grows.",
    red_fox: "A red fox hunts mostly by ear, tilting its head to triangulate the rustle of a mouse under grass before the famous pounce.",
    raccoon: "Raccoons don't really wash their food — their forepaws are so sensitive that water heightens the sense of touch, letting them 'see' with their hands.",
    wild_turkey: "A wild turkey can fly, and fast — up to 55 miles per hour in short bursts, usually up into a roost tree at dusk.",
    barred_owl: "The barred owl's 'who cooks for you' call is one of the most recognizable night sounds in eastern woods — pairs often duet.",
    cardinal: "Cardinals mate for life, and the male feeds the female beak-to-beak during courtship — a behavior called mate-feeding.",
    blue_jay: "Blue jays are mimics: they imitate red-shouldered hawk calls so convincingly that other birds scatter — sometimes to steal the feeder.",
    box_turtle: "An eastern box turtle can live more than a century and spends its whole life within a home range it knows intimately.",
    white_oak: "A single mature white oak can drop thousands of acorns in a mast year — and support more caterpillar species than almost any other tree.",
    loblolly_pine: "Loblolly pines keep their needles year-round, offering rare winter shelter when the hardwoods stand bare.",
    red_maple: "Red maple seeds spin like helicopters, autorotating as they fall so the wind carries them farther from the parent tree.",
    blackberry: "Blackberry canes are biennial — first-year canes grow, second-year canes fruit, and the thorny tangle shelters nesting songbirds.",
    coneflower: "Purple coneflower seed heads stand all winter, feeding goldfinches and cardinals long after the petals are gone.",
    fern: "Ostrich ferns unfurl their fiddleheads in spring and spread by underground rhizomes into cool, damp colonies.",
    bluestem: "Little bluestem is a warm-season prairie grass — its blue-green summer blades cure to russet red in autumn.",
    clover: "White clover fixes nitrogen from the air into the soil, quietly fertilizing everything that grows beside it."
  };

  function fill(template, slots) {
    return template.replace(/\{(\w+)\}/g, function (m, k) {
      var v = slots[k];
      if (v == null) return m;
      return Array.isArray(v) ? v.join(", ") : String(v);
    });
  }

  function vignette(event, seedN) {
    var list = VIGNETTES[event.type] || VIGNETTES.arrival;
    var t = list[(seedN == null ? 0 : seedN) % list.length];
    var sp = event.species ? (event.speciesName || event.species) : "";
    return fill(t, {
      name: event.name || event.motherName || event.preyName || "a stranger",
      species: sp, count: event.count, names: event.names,
      season: event.season, stage: event.stage,
      predator: event.predatorName || event.predatorSpecies || event.predator,
      predatorName: event.predatorName || "a hunter",
      predatorSpecies: event.predatorSpecies || event.predator || "predator",
      prey: event.preyName || event.preySpecies || event.prey,
      preyName: event.preyName || "a stranger",
      preySpecies: event.preySpecies || event.prey || "animal"
    });
  }

  var api = { VIGNETTES: VIGNETTES, FACTS: FACTS, vignette: vignette, fill: fill };
  if (typeof module !== "undefined") module.exports = api;
  else window.WGContent = api;
})();
