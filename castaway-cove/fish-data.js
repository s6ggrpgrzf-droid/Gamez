/* Castaway Cove REMAKE — fish data (authoritative).
 * Written by hand 2026-10-04. sim.js inlines this.
 * Fields: id, name, spots[], zone (0 shallows/1 mid/2 deep), rarity,
 * behavior (darter|lurker|nibbler|steady), coins, time[], weather[],
 * size (art scale), color, pun (catch joke — EVERY fish gets one), lore.
 */
var FISH_DATA = [
/* ---------------- sunny-cove (14) ---------------- */
{id:'sunbream', name:'Sunbream', spots:['sunny-cove'], zone:0, rarity:'common', behavior:'steady', coins:8, time:['day'], weather:['clear'], size:1.0, color:'#e8a34d', pun:'I caught a sunbream! It\'s ray-diant!', lore:'Sunbathing professionally since forever.'},
{id:'pebble-minnow', name:'Pebble Minnow', spots:['sunny-cove'], zone:0, rarity:'common', behavior:'nibbler', coins:5, time:['any'], weather:['any'], size:0.7, color:'#9fb3c8', pun:'I caught a pebble minnow! Small but boulder!', lore:'Small, round, and unbothered.'},
{id:'reed-perch', name:'Reed Perch', spots:['sunny-cove','misty-marsh'], zone:0, rarity:'common', behavior:'steady', coins:9, time:['day'], weather:['clear','fog'], size:1.1, color:'#7fb069', pun:'I caught a reed perch! Outstanding in its field!', lore:'Hides in reeds, judges from reeds.'},
{id:'lily-padder', name:'Lily Padder', spots:['sunny-cove'], zone:0, rarity:'common', behavior:'nibbler', coins:8, time:['day'], weather:['clear'], size:0.9, color:'#8fd18f', pun:'I caught a lily padder! Just hopping by!', lore:'Naps on lily pads. Dreams of flies.'},
{id:'cattail-carp', name:'Cattail Carp', spots:['sunny-cove'], zone:0, rarity:'common', behavior:'steady', coins:10, time:['day'], weather:['any'], size:1.2, color:'#c98f3d', pun:'I caught a cattail carp! The tail wags the fish!', lore:'Thinks it is a koi. Almost right.'},
{id:'dawn-koi', name:'Dawn Koi', spots:['sunny-cove'], zone:0, rarity:'uncommon', behavior:'steady', coins:28, time:['dawn'], weather:['clear'], size:1.3, color:'#f5d5c0', pun:'I caught a dawn koi! Rise and shine!', lore:'A quiet fish with loud dreams.'},
{id:'button-crab', kind:'crab', name:'Button Crab', spots:['sunny-cove'], zone:0, rarity:'common', behavior:'nibbler', coins:6, time:['any'], weather:['any'], size:0.7, color:'#d86a5a', pun:'I caught a button crab! It\'s pushing my buttons!', lore:'Walks sideways through life, confidently.'},
{id:'coral-darter', name:'Coral Darter', spots:['sunny-cove'], zone:1, rarity:'common', behavior:'darter', coins:14, time:['day'], weather:['clear'], size:1.0, color:'#ef8354', pun:'I caught a coral darter! Blink and you\'ll miss it!', lore:'Darts first, thinks never.'},
{id:'silverfin', name:'Silverfin', spots:['sunny-cove','moonlit-pier'], zone:1, rarity:'common', behavior:'steady', coins:12, time:['any'], weather:['any'], size:1.1, color:'#c0ccd8', pun:'I caught a silverfin! Shiny and proud!', lore:'Shiny enough to see your future.'},
{id:'kelp-bass', name:'Kelp Bass', spots:['sunny-cove'], zone:1, rarity:'common', behavior:'steady', coins:15, time:['day'], weather:['any'], size:1.3, color:'#5e8c5a', pun:'I caught a kelp bass! What a catch — literally!', lore:'The bass of the kelp-forest PTA.'},
{id:'prism-wrasse', name:'Prism Wrasse', spots:['sunny-cove'], zone:1, rarity:'uncommon', behavior:'darter', coins:36, time:['day'], weather:['clear'], size:1.1, color:'#7ad3d0', pun:'I caught a prism wrasse! What a colorful character!', lore:'Refracts compliments, returns rainbows.'},
{id:'firefly-tetra', name:'Firefly Tetra', spots:['sunny-cove'], zone:0, rarity:'uncommon', behavior:'darter', coins:24, time:['night'], weather:['clear'], size:0.8, color:'#ffe066', pun:'I caught a firefly tetra! It\'s glowing with pride!', lore:'Blinks in Morse code. Says nothing.'},
{id:'opal-gourami', name:'Opal Gourami', spots:['sunny-cove'], zone:1, rarity:'rare', behavior:'steady', coins:85, time:['dawn'], weather:['clear'], size:1.2, color:'#f4e1f4', pun:'I caught an opal gourami! A real gem!', lore:'Wears sunrise like jewelry.'},
{id:'aurora-koi', name:'Aurora Koi', spots:['sunny-cove'], zone:1, rarity:'legendary', behavior:'steady', coins:320, time:['dawn'], weather:['clear'], size:1.6, color:'#c3f0e8', pun:'I caught an AURORA KOI! The sky is jealous!', lore:'The sky, practicing to be a fish.'},
/* ---------------- misty-marsh (13) ---------------- */
{id:'puddle-jumper', name:'Puddle Jumper', spots:['misty-marsh'], zone:0, rarity:'common', behavior:'darter', coins:7, time:['any'], weather:['rain'], size:0.8, color:'#6aa8d8', pun:'I caught a puddle jumper! It made quite a splash!', lore:'Only comes out when the sky cries.'},
{id:'silt-catfish', name:'Silt Catfish', spots:['misty-marsh'], zone:0, rarity:'common', behavior:'lurker', coins:9, time:['night'], weather:['rain','fog'], size:1.2, color:'#8a7f72', pun:'I caught a silt catfish! It\'s feline fine!', lore:'Whiskers full of secrets, mostly mud.'},
{id:'old-bootfish', name:'Old Bootfish', spots:['misty-marsh'], zone:0, rarity:'common', behavior:'nibbler', coins:4, time:['any'], weather:['rain'], size:1.1, color:'#7a5c3e', pun:'I caught an old bootfish! What a load of footwear!', lore:'Technically a boot. Spiritually a fish.'},
{id:'barnacle-bream', name:'Barnacle Bream', spots:['misty-marsh'], zone:1, rarity:'common', behavior:'nibbler', coins:11, time:['any'], weather:['fog'], size:1.0, color:'#a89f91', pun:'I caught a barnacle bream! It\'s stuck on me!', lore:'Crusty outside, soft inside.'},
{id:'fog-ray', kind:'ray', name:'Fog Ray', spots:['misty-marsh'], zone:1, rarity:'rare', behavior:'steady', coins:75, time:['any'], weather:['fog'], size:1.8, color:'#b8c4ce', pun:'I caught a fog ray! A ray of... fog!', lore:'You do not find it. It finds you.'},
{id:'thunder-eel', kind:'eel', name:'Thunder Eel', spots:['misty-marsh'], zone:1, rarity:'rare', behavior:'darter', coins:80, time:['any'], weather:['rain'], size:1.5, color:'#4d6fa5', pun:'I caught a thunder eel! Absolutely shocking!', lore:'Hums during storms. In key.'},
{id:'willow-eel', kind:'eel', name:'Willow Eel', spots:['misty-marsh'], zone:0, rarity:'uncommon', behavior:'steady', coins:30, time:['dawn','night'], weather:['fog'], size:1.4, color:'#6f8f6a', pun:'I caught a willow eel! Long time no sea!', lore:'Braids itself through the willow roots.'},
{id:'pebble-dragonet', name:'Pebble Dragonet', spots:['misty-marsh'], zone:2, rarity:'uncommon', behavior:'steady', coins:46, time:['any'], weather:['fog'], size:1.2, color:'#9c8ea8', pun:'I caught a pebble dragonet! A tiny terror!', lore:'A dragon, if dragons were pebbles.'},
{id:'pale-seahorse', kind:'seahorse', name:'Pale Seahorse', spots:['misty-marsh'], zone:2, rarity:'uncommon', behavior:'steady', coins:38, time:['dawn'], weather:['fog'], size:0.9, color:'#e8d5c0', pun:'I caught a pale seahorse! Swim, don\'t neigh!', lore:'Upright citizen of the deep.'},
{id:'glass-shrimp', kind:'shrimp', name:'Glass Shrimp', spots:['misty-marsh'], zone:0, rarity:'common', behavior:'nibbler', coins:6, time:['night'], weather:['any'], size:0.6, color:'#cfe8ef', pun:'I caught a glass shrimp! I see right through it!', lore:'Ninety percent window, ten percent shrimp.'},
{id:'lantern-goby', name:'Lantern Goby', spots:['misty-marsh'], zone:0, rarity:'uncommon', behavior:'steady', coins:26, time:['night'], weather:['any'], size:0.9, color:'#ffd166', pun:'I caught a lantern goby! Light of my life!', lore:'Carries its own nightlight. Polite.'},
{id:'lanternfish', name:'Lanternfish', spots:['misty-marsh','moonlit-pier'], zone:1, rarity:'uncommon', behavior:'steady', coins:30, time:['night'], weather:['any'], size:1.0, color:'#ffe9a3', pun:'I caught a lanternfish! It\'s lit!', lore:'Commutes with its headlights on.'},
{id:'grandfather-trench', name:'Grandfather Trench', spots:['misty-marsh'], zone:2, rarity:'legendary', behavior:'lurker', coins:500, time:['any'], weather:['fog'], size:2.2, color:'#5a6b7d', pun:'I caught GRANDFATHER TRENCH! Respect your elders!', lore:'Older than the cove. Tired, kind.'},
/* ---------------- moonlit-pier (15) ---------------- */
{id:'moon-jelly', kind:'jelly', name:'Moon Jelly', spots:['moonlit-pier'], zone:1, rarity:'uncommon', behavior:'steady', coins:32, time:['night'], weather:['clear'], size:1.2, color:'#dccdf2', pun:'I caught a moon jelly! Over the moon!', lore:'A ghost that pays rent in glow.'},
{id:'ink-squid', kind:'squid', name:'Ink Squid', spots:['moonlit-pier'], zone:1, rarity:'uncommon', behavior:'steady', coins:34, time:['night'], weather:['any'], size:1.2, color:'#5a5a72', pun:'I caught an ink squid! A real character!', lore:'Writes memoirs. Eats the drafts.'},
{id:'drift-singer', name:'Drift Singer', spots:['moonlit-pier'], zone:1, rarity:'rare', behavior:'darter', coins:90, time:['night'], weather:['clear'], size:1.3, color:'#9db4e8', pun:'I caught a drift singer! It\'s got pipes!', lore:'Sings the current to sleep.'},
{id:'duskwater-sturgeon', name:'Duskwater Sturgeon', spots:['moonlit-pier'], zone:1, rarity:'uncommon', behavior:'lurker', coins:40, time:['dusk'], weather:['any'], size:1.6, color:'#8d99ae', pun:'I caught a duskwater sturgeon! A general of the dusk!', lore:'Old soul, older scales.'},
{id:'anglers-lantern', name:'Angler\'s Lantern', spots:['moonlit-pier'], zone:2, rarity:'uncommon', behavior:'lurker', coins:44, time:['night'], weather:['any'], size:1.1, color:'#ffca7a', pun:'I caught an angler\'s lantern! The tables have turned!', lore:'Fishes for fishermen. Meta.'},
{id:'crystal-shrimp', kind:'shrimp', name:'Crystal Shrimp', spots:['moonlit-pier'], zone:2, rarity:'uncommon', behavior:'nibbler', coins:42, time:['any'], weather:['any'], size:0.8, color:'#d8f3f5', pun:'I caught a crystal shrimp! Crystal-clear victory!', lore:'Transparent about its intentions.'},
{id:'starlight-eel', kind:'eel', name:'Starlight Eel', spots:['moonlit-pier'], zone:2, rarity:'rare', behavior:'darter', coins:110, time:['night'], weather:['clear'], size:1.5, color:'#a9b8e8', pun:'I caught a starlight eel! A star is born!', lore:'Swims in constellations, briefly.'},
{id:'abyssal-grinner', name:'Abyssal Grinner', spots:['moonlit-pier'], zone:2, rarity:'rare', behavior:'lurker', coins:120, time:['night'], weather:['any'], size:1.7, color:'#6b7280', pun:'I caught an abyssal grinner! Smile for the camera!', lore:'Smiles so you do not worry.'},
{id:'ghost-octopus', kind:'octopus', name:'Ghost Octopus', spots:['moonlit-pier'], zone:2, rarity:'rare', behavior:'steady', coins:130, time:['any'], weather:['fog'], size:1.4, color:'#e8e8f0', pun:'I caught a ghost octopus! Boo! I mean... woo!', lore:'Eight arms, zero worries.'},
{id:'crown-jelly', kind:'jelly', name:'Crown Jelly', spots:['moonlit-pier'], zone:2, rarity:'rare', behavior:'steady', coins:115, time:['any'], weather:['any'], size:1.3, color:'#f2c4de', pun:'I caught a crown jelly! All hail!', lore:'Royalty. Demands nothing. Glows anyway.'},
{id:'brine-king', name:'Brine King', spots:['moonlit-pier'], zone:2, rarity:'rare', behavior:'lurker', coins:105, time:['any'], weather:['rain'], size:1.4, color:'#7fa8a0', pun:'I caught a brine king! Long may it reign!', lore:'Rules a kingdom of salt.'},
{id:'gloomfin', name:'Gloomfin', spots:['moonlit-pier'], zone:2, rarity:'common', behavior:'lurker', coins:18, time:['night'], weather:['any'], size:1.2, color:'#4a5568', pun:'I caught a gloomfin! Cheer up, little guy!', lore:'Cheerful, despite everything.'},
{id:'gilded-wreckfish', name:'Gilded Wreckfish', spots:['moonlit-pier'], zone:2, rarity:'legendary', behavior:'steady', coins:420, time:['any'], weather:['any'], size:1.8, color:'#e8c15a', pun:'I caught a GILDED WRECKFISH! Treasure? Hardly know her!', lore:'Ate a treasure chest. Kept the shine.'},
{id:'tidepool-crab', kind:'crab', name:'Tidepool Crab', spots:['moonlit-pier'], zone:0, rarity:'common', behavior:'nibbler', coins:7, time:['night'], weather:['any'], size:0.7, color:'#d8a0a0', pun:'I caught a tidepool crab! It\'s claw-some!', lore:'Pinches first, asks later.'},
{id:'night-bass', name:'Night Bass', spots:['moonlit-pier'], zone:1, rarity:'common', behavior:'steady', coins:13, time:['night'], weather:['any'], size:1.2, color:'#4a6b5a', pun:'I caught a night bass! It\'s a real night owl... fish!', lore:'Sings bass. Obviously.'}
];

/* Legendary hunt conditions (discoverable via Marlow's rumors). */
var LEGEND_COND = {
  'aurora-koi':         { spot:'sunny-cove',   time:['dawn'],  weather:['clear'] },
  'grandfather-trench': { spot:'misty-marsh',  time:['any'],   weather:['fog'] },
  'gilded-wreckfish':   { spot:'moonlit-pier', time:['night'], weather:['any'] }
};

/* Marlow's rumors: 3 escalating hints per legendary. costs in coins. */
var RUMORS = {
  'aurora-koi': [
    { cost: 50,  text: 'Marlow leans in: "Something shimmers at the edge of morning, friend. Before the sun\'s properly up."' },
    { cost: 150, text: 'Marlow whispers: "Clear dawns. Not a cloud. That\'s when the sky practices being a fish."' },
    { cost: 300, text: 'Marlow slides you a map: "Aurora Koi. Sunny Cove. Dawn. Clear skies. Tell no one. ...Tell everyone."' }
  ],
  'grandfather-trench': [
    { cost: 50,  text: 'Marlow shivers: "Down in the marsh, when the fog\'s thick as soup... something old moves."' },
    { cost: 150, text: 'Marlow mutters: "The fog\'s the key. It only rises when the marsh disappears."' },
    { cost: 300, text: 'Marlow grips your shoulder: "Grandfather Trench. Misty Marsh. Fog. Any hour. Bring respect."' }
  ],
  'gilded-wreckfish': [
    { cost: 50,  text: 'Marlow grins, gold tooth flashing: "The pier at night, eh? Things glow down there that shouldn\'t."' },
    { cost: 150, text: 'Marlow taps the counter: "Night dives. Moonlit Pier. Follow the glints."' },
    { cost: 300, text: 'Marlow winks: "Gilded Wreckfish. Moonlit Pier. Night. It ate a treasure chest once. Kept the shine."' }
  ]
};

/* Spots: id, name, license cost (0 = open), tagline, palette key. */
var SPOTS = [
  { id:'sunny-cove',   name:'Sunny Cove',   license:0,    tagline:'Where it all began. Warm water, easy fish.',
    palette:{ sky:['#f9d9a8','#f2a988','#c98aa0'], water:['#8fc3d8','#5d9dbd','#2f6a8f'] } },
  { id:'misty-marsh',  name:'Misty Marsh',  license:800,  tagline:'Fog, reeds, and things that hum in the rain.',
    palette:{ sky:['#cfd8c8','#aebfae','#7e8f86'], water:['#7fa8a0','#5d8a84','#3a5f5c'] } },
  { id:'moonlit-pier', name:'Moonlit Pier', license:2500, tagline:'Night water, deep water. Bring a lantern.',
    palette:{ sky:['#0e1a33','#1c2c4e','#3a4a63'], water:['#2c3e57','#20344c','#101c2e'] } }
];

/* Aquarium: coins per hour by rarity. Tank holds 6. Offline cap 8h. */
var AQUA_RATE = { common: 2, uncommon: 5, rare: 12, legendary: 30 };
var AQUA_MAX = 6, AQUA_CAP_H = 8;
