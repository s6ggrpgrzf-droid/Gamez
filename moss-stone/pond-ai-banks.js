/* PondAI curated banks — Moss & Stone phase 7.
 * The real product for offline: genuinely good writing, used as the silent
 * fallback by pond-ai-client.js and embedded (mirrored) in
 * worker/pond-ai-worker.js. If you edit these, update the worker copy too.
 *
 * Conventions: {n} name, {m} meaning, {p} personality tags
 * (b = bold, s = shy, p = playful). Proverb moods: dawn/day/dusk/night/rain.
 * Journal keys match SYS_JT in systems.js exactly.
 */
'use strict';

var POND_AI_BANKS = {

names: [
  { n: 'Sango',   m: 'coral',                  p: ['b', 'p'] },
  { n: 'Yuki',    m: 'snow',                   p: ['s'] },
  { n: 'Aka',     m: 'deep red',               p: ['b'] },
  { n: 'Kaze',    m: 'wind',                   p: ['b', 'p'] },
  { n: 'Momo',    m: 'peach',                  p: ['p', 's'] },
  { n: 'Tora',    m: 'tiger',                  p: ['b'] },
  { n: 'Hana',    m: 'flower',                 p: ['s', 'p'] },
  { n: 'Riku',    m: 'shore',                  p: ['b'] },
  { n: 'Sora',    m: 'sky',                    p: ['s', 'p'] },
  { n: 'Umi',     m: 'sea',                    p: ['b', 's'] },
  { n: 'Ren',     m: 'lotus',                  p: ['s'] },
  { n: 'Nami',    m: 'wave',                   p: ['p', 'b'] },
  { n: 'Hoshi',   m: 'star',                   p: ['s'] },
  { n: 'Kiku',    m: 'chrysanthemum',          p: ['s'] },
  { n: 'Aoi',     m: 'hollyhock blue',         p: ['s', 'p'] },
  { n: 'Fuji',    m: 'wisteria',               p: ['s'] },
  { n: 'Yuri',    m: 'lily',                   p: ['s'] },
  { n: 'Sakura',  m: 'cherry blossom',          p: ['p', 's'] },
  { n: 'Tsuki',   m: 'moon',                   p: ['s'] },
  { n: 'Ame',     m: 'rain',                   p: ['s', 'p'] },
  { n: 'Kumo',    m: 'cloud',                  p: ['s'] },
  { n: 'Yama',    m: 'mountain',               p: ['b'] },
  { n: 'Kawa',    m: 'river',                  p: ['b', 'p'] },
  { n: 'Mizu',    m: 'water',                  p: ['s'] },
  { n: 'Hikari',  m: 'light',                  p: ['p', 'b'] },
  { n: 'Kage',    m: 'shadow',                 p: ['s'] },
  { n: 'Yoru',    m: 'night',                  p: ['s'] },
  { n: 'Asa',     m: 'morning',                p: ['p'] },
  { n: 'Yuu',     m: 'dusk',                   p: ['s'] },
  { n: 'Haru',    m: 'spring',                 p: ['p'] },
  { n: 'Natsu',   m: 'summer',                 p: ['b', 'p'] },
  { n: 'Aki',     m: 'autumn',                 p: ['s', 'b'] },
  { n: 'Fuyu',    m: 'winter',                 p: ['s'] },
  { n: 'Botan',   m: 'peony',                  p: ['b'] },
  { n: 'Sumire',  m: 'violet',                 p: ['s'] },
  { n: 'Ayame',   m: 'iris',                   p: ['s'] },
  { n: 'Hasu',    m: 'lotus',                  p: ['s'] },
  { n: 'Momiji',  m: 'maple',                  p: ['b', 'p'] },
  { n: 'Take',    m: 'bamboo',                 p: ['b'] },
  { n: 'Matsu',   m: 'pine',                   p: ['b', 's'] },
  { n: 'Ume',     m: 'plum',                   p: ['s', 'p'] },
  { n: 'Tsubaki', m: 'camellia',               p: ['b'] },
  { n: 'Hotaru',  m: 'firefly',                p: ['p', 's'] },
  { n: 'Cho',     m: 'butterfly',              p: ['p'] },
  { n: 'Kaeru',   m: 'frog',                   p: ['p'] },
  { n: 'Kame',    m: 'turtle',                 p: ['s', 'b'] },
  { n: 'Sagi',    m: 'heron',                  p: ['b', 's'] },
  { n: 'Kohaku',  m: 'amber',                  p: ['b'] },
  { n: 'Gin',     m: 'silver',                 p: ['s'] },
  { n: 'Kin',     m: 'gold',                   p: ['b', 'p'] },
  { n: 'Kuro',    m: 'black',                  p: ['b', 's'] },
  { n: 'Shiro',   m: 'white',                  p: ['s'] },
  { n: 'Midori',  m: 'green',                  p: ['s', 'p'] },
  { n: 'Daidai',  m: 'bitter orange',          p: ['b', 'p'] },
  { n: 'Suzu',    m: 'small bell',             p: ['p', 's'] },
  { n: 'Rin',     m: 'dignified',              p: ['b', 's'] },
  { n: 'Shizuku', m: 'droplet',                p: ['s', 'p'] },
  { n: 'Nagare',  m: 'current',                p: ['b', 'p'] },
  { n: 'Ukiyo',   m: 'the floating world',     p: ['p'] },
  { n: 'Komorebi',m: 'sunlight through leaves',p: ['s', 'p'] },
  { n: 'Yugen',   m: 'quiet mystery',          p: ['s'] },
],

proverbs: [
  { t: 'Still water holds the whole sky.', mood: [] },
  { t: 'The koi does not hurry, and arrives.', mood: [] },
  { t: 'Rake the sand; the mind follows.', mood: [] },
  { t: 'A ripple is a thought the pond let go.', mood: [] },
  { t: 'Moss grows where the hand has been gentle.', mood: [] },
  { t: 'The heron waits. So can you.', mood: ['dawn', 'day'] },
  { t: 'Even the stone was once in a hurry.', mood: [] },
  { t: 'Clear water asks for nothing.', mood: ['day'] },
  { t: 'The lotus closes; the pond does not mind.', mood: ['dusk', 'night'] },
  { t: 'Feed the fish, feed the quiet.', mood: [] },
  { t: 'Nothing here is late.', mood: [] },
  { t: 'The moon visits every night and never knocks.', mood: ['night'] },
  { t: 'A garden kept is a mind kept.', mood: [] },
  { t: 'Rain is the pond thinking out loud.', mood: ['rain'] },
  { t: 'The frog knows the whole pond by heart.', mood: ['dusk'] },
  { t: 'Be like the lily pad: float, and hold the light.', mood: ['day'] },
  { t: 'Stillness is not emptiness.', mood: [] },
  { t: 'The maple drops a leaf; the pond says thank you.', mood: ['day', 'dusk'] },
  { t: 'Depth is quiet.', mood: [] },
  { t: 'Morning mist does not explain itself.', mood: ['dawn'] },
  { t: 'Tend a little; the pond does the rest.', mood: [] },
  { t: 'The koi\u2019s pattern was painted by patience.', mood: [] },
  { t: 'No one is watching. Grow anyway.', mood: [] },
  { t: 'The stone you moved is still a stone. It likes the new spot.', mood: [] },
  { t: 'Evening comes to every pond eventually.', mood: ['dusk'] },
  { t: 'A full belly, clear water, nowhere to be.', mood: [] },
  { t: 'The best time to rake was yesterday. Now is also good.', mood: [] },
  { t: 'Fireflies: the pond\u2019s small lanterns.', mood: ['night'] },
  { t: 'What sinks will settle. What floats will drift.', mood: [] },
  { t: 'You cannot rush moss.', mood: [] },
  { t: 'The pond remembers every kindness, and forgets every absence.', mood: [] },
  { t: 'Dawn comes whether or not you are awake to see it.', mood: ['dawn'] },
  { t: 'First light on the water. Everything begins again, quietly.', mood: ['dawn'] },
  { t: 'Raindrops: the sky knocking politely.', mood: ['rain'] },
],

// Daily rare visitor, deterministic per date seed. 'quiet' = no visitor note.
visitors: [
  { id: 'heron',      note: 'A grey heron stood at the water\u2019s edge at dawn, perfectly still, then was gone.' },
  { id: 'turtle',     note: 'An old turtle sunned on the flat stone all afternoon, in no hurry at all.' },
  { id: 'kingfisher', note: 'A kingfisher flashed across the pond — a streak of impossible blue — and vanished.' },
  { id: 'egret',      note: 'A white egret picked its way along the shallows, delicate as calligraphy.' },
  { id: 'dragonflies',note: 'Dragonflies held territory over the lily pads, jewel-bright and fearless.' },
  { id: 'frog-chorus',note: 'At dusk the frogs sang — not loudly, just enough to say the pond was theirs too.' },
  { id: 'quiet',      note: '' },
  { id: 'quiet',      note: '' },
],

// Richer journal templates than SYS_JT. Keys match systems.js exactly.
journal: {
  first: [
    'The pond is yours now. Rake the sand, feed the koi, visit often \u2014 or don\u2019t. It will keep.',
    'You found a quiet pond. It has been waiting, patiently, for someone to notice it.',
  ],
  hatch: [
    '{name} hatched \u2014 a {style} with {mark}.',
    'A new fry: {name}, all {style} and wonder. Welcome, little one.',
    '{name} emerged at first light, trailing {mark} like a secret.',
    'Say hello to {name} \u2014 a {style}, {mark}, and already curious about your finger.',
    'The egg opened and out came {name}: {style}, {mark}, perfect.',
  ],
  juvenile: [
    '{name} is growing \u2014 no longer a fry.',
    '{name} stretches a little longer every day.',
    '{name} has the confidence of a fish twice its size now.',
  ],
  adult: [
    '{name} is fully grown, and magnificent.',
    '{name} has come into their own.',
    'Look at {name} \u2014 every inch earned, every scale in place.',
  ],
  breed: [
    '{nameA} and {nameB} have been inseparable lately\u2026',
    'Something is happening between {nameA} and {nameB}.',
    '{nameA} follows {nameB} everywhere now. The pond approves.',
  ],
  egg: [
    'An egg rests on a lily pad. {nameA} and {nameB} keep close watch.',
    'A small amber promise on a lily pad \u2014 {nameA} and {nameB}\u2019s egg.',
    'There is an egg on the far pad. The whole pond seems to be holding its breath.',
  ],
  heron: [
    'A heron visited at {when}. The koi hid, wise as ever.',
    'Grey wings at the water\u2019s edge \u2014 a heron, gone as quickly as it came.',
    'The heron stood like a brushstroke for a long while, then lifted away.',
  ],
  frog: [
    'A frog took up residence on the far lily pad.',
    'There is a frog now. It seems to like it here.',
    'A frog arrived with the dusk and claimed the best pad. Fair enough.',
  ],
  ascension: [
    '{name} rose at dawn in a ring of light, and was gone. Now {blessing}.',
    'At first light, {name} ascended. Now {blessing}.',
    '{name} left the way morning leaves \u2014 quietly, and all at once. Now {blessing}.',
  ],
  away_head: ['While you were away\u2026'],
  away_growth: [
    '{n} koi grew in your absence.',
    'The koi kept growing without you \u2014 no hard feelings.',
    'You missed some growing. The pond didn\u2019t mind.',
  ],
  away_moss: [
    'Moss crept along your rake lines.',
    'The moss spread, following where you had raked.',
  ],
  away_heron: [
    'A heron visited. The koi hid until it left.',
    'Grey wings came and went while you were gone. All is well.',
  ],
  away_frog: [
    'A frog moved in while you were gone.',
    'There\u2019s a frog now. It arrived on its own.',
  ],
  away_hatch: [
    '{n} eggs hatched while you were gone. Say hello.',
    'New arrivals! {n} fry hatched in your absence.',
  ],
  away_quiet: [
    'The pond kept its own quiet time. Nothing was in a hurry.',
    'Nothing much happened, which is to say: everything was perfect.',
    'The water was still. The koi were unhurried. All was as it should be.',
  ],
},

};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { POND_AI_BANKS: POND_AI_BANKS };
}
