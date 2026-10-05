/* Wildgrove — species data.
 * Real natural history for an Oklahoma temperate forest. All tuning lives
 * here so behavior can be balanced without touching the engine.
 * Times are in game-days unless noted. The engine compresses real time:
 * 1 real day = 1 game day for growth; animal needs run faster (hours).
 */

var FLORA = {
  white_oak: {
    name: "White Oak", kind: "tree",
    growthDays: 12,          // seed -> mature
    waterNeed: 0.4, sunNeed: 0.7,
    food: ["acorn"],          // foods provided when mature
    shelter: 0.8,            // 0..1 shelter value for fauna
    spread: 0.02,            // daily self-seed chance when mature
    seasons: { spring: 1.2, summer: 1.0, autumn: 0.8, winter: 0.15 },
    blurb: "A slow giant. Its autumn acorns feed half the forest."
  },
  loblolly_pine: {
    name: "Loblolly Pine", kind: "tree",
    growthDays: 9,
    waterNeed: 0.35, sunNeed: 0.6,
    food: [], shelter: 0.9,
    spread: 0.02,
    seasons: { spring: 1.1, summer: 1.0, autumn: 0.9, winter: 0.5 },
    blurb: "Evergreen shelter when winter strips the hardwoods."
  },
  red_maple: {
    name: "Red Maple", kind: "tree",
    growthDays: 10,
    waterNeed: 0.55, sunNeed: 0.6,
    food: ["seed"], shelter: 0.7,
    spread: 0.03,
    seasons: { spring: 1.2, summer: 1.0, autumn: 0.9, winter: 0.15 },
    blurb: "Blazes red in autumn; its winged seeds spin down in spring."
  },
  blackberry: {
    name: "Blackberry Bramble", kind: "bush",
    growthDays: 3,
    waterNeed: 0.5, sunNeed: 0.7,
    food: ["berry"], shelter: 0.5,
    spread: 0.05,
    seasons: { spring: 1.2, summer: 1.3, autumn: 0.7, winter: 0.2 },
    blurb: "Thorny tangle, summer berries, good hiding for small things."
  },
  coneflower: {
    name: "Purple Coneflower", kind: "flower",
    growthDays: 1,
    waterNeed: 0.4, sunNeed: 0.8,
    food: ["seed"], shelter: 0.1,
    spread: 0.08,
    seasons: { spring: 1.1, summer: 1.4, autumn: 0.8, winter: 0.1 },
    blurb: "Goldfinches and cardinals work its seed heads all winter."
  },
  fern: {
    name: "Ostrich Fern", kind: "groundcover",
    growthDays: 2,
    waterNeed: 0.7, sunNeed: 0.3,
    food: [], shelter: 0.6,
    spread: 0.06,
    seasons: { spring: 1.3, summer: 1.1, autumn: 0.6, winter: 0.1 },
    blurb: "Cool damp fronds — cover for turtles and toads."
  },
  bluestem: {
    name: "Little Bluestem", kind: "grass",
    growthDays: 1,
    waterNeed: 0.3, sunNeed: 0.8,
    food: ["grass"], shelter: 0.3,
    spread: 0.1,
    seasons: { spring: 1.2, summer: 1.2, autumn: 1.0, winter: 0.3 },
    blurb: "Native grass; rabbits graze it, turkeys nest beside it."
  },
  clover: {
    name: "White Clover", kind: "groundcover",
    growthDays: 0.5,
    waterNeed: 0.45, sunNeed: 0.6,
    food: ["grass", "clover"], shelter: 0.1,
    spread: 0.12,
    seasons: { spring: 1.3, summer: 1.1, autumn: 0.8, winter: 0.2 },
    blurb: "First green of spring. Rabbits can't resist it."
  }
};

/* Fauna. activeHours: [startHour, endHour] in 24h local time; crepuscular
 * species get two windows. diet: food tags eaten. fears: species that
 * displace them (soft-wild: chase, never a kill on screen). */
var FAUNA = {
  cottontail: {
    name: "Eastern Cottontail", plural: "cottontails",
    diet: ["grass", "clover"], waterNeed: 0.5,
    active: [[5, 9], [17, 21]], social: "solitary",
    speed: 55, homeRange: 120,
    fears: ["red_fox", "barred_owl", "barred_owl"],
    requires: { plants: { bluestem: 2 }, anyFood: ["grass", "clover"], vitality: 0 },
    breed: { litter: [2, 4], matureDays: 6, need: "shelter_0.4" },
    names: ["Bramble", "Clover", "Dusk", "Fern", "Hazel", "Pip", "Sorrel", "Thistle"],
    blurb: "Most active at dawn and dusk. Freezes, then bolts for cover."
  },
  gray_squirrel: {
    name: "Gray Squirrel", plural: "squirrels",
    diet: ["acorn"], waterNeed: 0.4,
    active: [[7, 18]], social: "solitary",
    speed: 45, homeRange: 150,
    fears: ["red_fox", "barred_owl", "barred_owl"],
    requires: { plants: { white_oak: 1 }, vitality: 5 },
    breed: { litter: [2, 3], matureDays: 10, need: "oak_mature" },
    cache: true, // buries acorns in autumn — visible behavior
    names: ["Acorn", "Chestnut", "Hickory", "Nib", "Oakley", "Rusty", "Skitter", "Tawny"],
    blurb: "Buries acorns all autumn and forgets half — planting tomorrow's oaks."
  },
  whitetail_deer: {
    name: "White-tailed Deer", plural: "deer",
    diet: ["acorn", "grass", "clover"], waterNeed: 0.8,
    active: [[5, 9], [16, 20]], social: "herd",
    speed: 40, homeRange: 300,
    fears: ["red_fox"],
    requires: { matureTrees: 3, water: true, vitality: 25 },
    breed: { litter: [1, 2], matureDays: 20, need: "cover" },
    names: ["Alder", "Birch", "Doe", "Fawn", "Grove", "Hart", "Moss", "Willow"],
    blurb: "A herd animal of edges and dawn. Needs real cover to feel safe."
  },
  red_fox: {
    name: "Red Fox", plural: "foxes",
    diet: ["prey"], waterNeed: 0.5,
    active: [[18, 23], [4, 7]], social: "pair",
    speed: 60, homeRange: 350,
    fears: [],
    predator: { prey: ["cottontail", "gray_squirrel"], giveUp: 0.75 },
    requires: { prey: 3, vitality: 40 },
    breed: { litter: [3, 5], matureDays: 16, need: "den" },
    names: ["Amber", "Cinder", "Ember", "Flint", "Rowan", "Russet", "Sable", "Tansy"],
    blurb: "Hunts by ear, pouncing on sounds under grass. Never kills on screen — prey always reaches cover."
  },
  raccoon: {
    name: "Raccoon", plural: "raccoons",
    diet: ["berry", "acorn", "insect"], waterNeed: 0.7,
    active: [[20, 4]], social: "solitary",
    speed: 35, homeRange: 200,
    fears: ["red_fox"],
    requires: { water: true, vitality: 30 },
    breed: { litter: [2, 4], matureDays: 12, need: "tree_hollow" },
    names: ["Bandit", "Mischief", "Nocturne", "Pebbles", "Rascal", "Shadow", "Smudge", "Wash"],
    blurb: "Washes its food, climbs anything, naps through the day in a hollow."
  },
  wild_turkey: {
    name: "Wild Turkey", plural: "turkeys",
    diet: ["acorn", "seed", "grass"], waterNeed: 0.6,
    active: [[6, 19]], social: "flock",
    speed: 38, homeRange: 280,
    fears: ["red_fox", "barred_owl"],
    requires: { plants: { white_oak: 1 }, vitality: 35 },
    breed: { litter: [4, 8], matureDays: 14, need: "ground_nest" },
    names: ["Autumn", "Bronze", "Drum", "Gobble", "Henna", "Jake", "Jenny", "Strut"],
    blurb: "Roosts in trees at night, struts the meadow by day. Toms gobble at dawn."
  },
  barred_owl: {
    name: "Barred Owl", plural: "owls",
    diet: ["prey"], waterNeed: 0.3,
    active: [[19, 5]], social: "pair",
    speed: 70, homeRange: 400,
    fears: [],
    predator: { prey: ["cottontail"], giveUp: 0.8, nightOnly: true },
    requires: { matureTrees: 4, vitality: 50 },
    breed: { litter: [1, 2], matureDays: 18, need: "tree_hollow" },
    names: ["Hoot", "Luna", "Moth", "Nightjar", "Nox", "Strix", "Tawny", "Whooks"],
    blurb: "\"Who cooks for you?\" — needs big old trees and hunts only after dark."
  },
  cardinal: {
    name: "Northern Cardinal", plural: "cardinals",
    diet: ["seed", "berry"], waterNeed: 0.4,
    active: [[6, 19]], social: "pair",
    speed: 65, homeRange: 180, flies: true,
    fears: ["barred_owl", "barred_owl"],
    requires: { plants: { coneflower: 2 }, vitality: 10 },
    breed: { litter: [2, 3], matureDays: 8, need: "shrub" },
    names: ["Crimson", "Flame", "Pipit", "Rose", "Rufus", "Scarlet", "Song", "Vermilion"],
    blurb: "Mates for life. The male's dawn song is the first voice of the chorus."
  },
  blue_jay: {
    name: "Blue Jay", plural: "jays",
    diet: ["acorn", "seed"], waterNeed: 0.4,
    active: [[6, 19]], social: "flock",
    speed: 68, homeRange: 220, flies: true,
    fears: ["barred_owl"],
    alarm: true, // screams when a predator is near — others hide!
    requires: { plants: { white_oak: 2 }, vitality: 15 },
    breed: { litter: [2, 4], matureDays: 8, need: "tree" },
    names: ["Azure", "Chatter", "Cobalt", "Jay", "Lapis", "Mimic", "Scold", "Sky"],
    blurb: "The forest alarm. Its scream sends everyone for cover — including you, if you listen."
  },
  box_turtle: {
    name: "Eastern Box Turtle", plural: "turtles",
    diet: ["berry", "insect", "grass"], waterNeed: 0.6,
    active: [[8, 18]], social: "solitary",
    speed: 6, homeRange: 60,
    fears: [],
    requires: { water: true, plants: { fern: 2 }, vitality: 20 },
    breed: { litter: [2, 4], matureDays: 30, need: "sandy_patch" },
    names: ["Amber", "Dome", "Mud", "Pebble", "Shelldon", "Sunny", "Terra", "Tort"],
    blurb: "Can live a century and always knows its way home. In no hurry, ever."
  }
};

/* Zones unlock as vitality grows. y-bands in world units (world is 1000x1600). */
var ZONES = [
  { id: "meadow",   name: "Sun Meadow",  y: [1050, 1600], vitality: 0,  blurb: "Where it all begins — grass, sun, and first visitors." },
  { id: "pond",     name: "Still Pond",  y: [600, 1050],  vitality: 30, blurb: "Water draws the thirsty and the secretive." },
  { id: "deepwood", name: "Deep Woods", y: [0, 600],     vitality: 60, blurb: "Old trees, deep shade — the wild heart of the grove." }
];

/* Vitality stages — each visibly transforms the world. */
var VITALITY_STAGES = [
  { min: 0,  name: "Quiet Ground", blurb: "A clearing, waiting." },
  { min: 20, name: "First Green",  blurb: "Seedlings take hold. Something is listening." },
  { min: 40, name: "Stirring",      blurb: "The chorus begins. Residents arrive." },
  { min: 60, name: "Thriving",     blurb: "Nests, litters, territories — a working forest." },
  { min: 80, name: "Wild Heart",   blurb: "The grove keeps itself now. You are its witness." }
];

if (typeof module !== "undefined") {
  module.exports = { FLORA, FAUNA, ZONES, VITALITY_STAGES };
}
