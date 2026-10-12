/* gamez-ai — shared flavor-text generation for the Gamez arcade.
 *
 *   AI    -> Workers AI binding (Llama instruct model)
 *   STORE -> KV namespace (generation cache + rate limits)
 *
 *   POST /g  {kind, game, ctx} -> {text}
 *     kinds:
 *       briefing  neon-void      mission briefing at run start      {v} rotate slot
 *       taunt     bubble-hex     Wilbur the cat-mage taunts         {level, hp} hp bucket
 *       banner    bloom-defense  wave announcement flavor           {wave, final}
 *       quip      candy-cascade  level-complete celebration         {level, stars}
 *       title     maze-trace     calm level epithet                 {level}
 *       well      word-well      daily puzzle theme line            {start, end}
 *       crypt     dead-mans-hand monster taunt at room start       {monster, room}
 *       chronicle fernwild       daily forest chronicle entry      {day, events, seed}
 *       crittername fernwild     name for a new animal             {species, n}
 *       wildevent fernwild       tiny choice event                 {day, hint} -> {title,text,a,b}
 *       nightbrief blood-moon    terse gothic scene-setter         {night}
 *       vamptaunt blood-moon     comic panicked-villager line      {}
 *       fairway   tiny-fairway   serene golf hole name             {hole}
 *       fishlore  castaway-cove  whimsical fish lore line          {fish}
 *       krakentaunt neon-depths  kraken taunt for pinball          {}
 *       palette   still-life     harmonious hex color array        {mood} -> {text: "[...]"}
 *       shipstory greywater      harbormaster: new/returning ship   {keeper,day,...} -> {ship} (KV registry)
 *       logentry  greywater      literary keeper's logbook entry   {kind,day,ship?,whale?}
 *       arcadeeditorial hub      daily arcade curator picks       {date} -> {picks:[{game,blurb}]}
 *   GET  / -> health check
 *
 * Generations are cached in KV by kind/game/context so one call serves all
 * players. All output is validated, length-clamped, and HTML-stripped.
 * Every game treats the response as optional: timeouts and failures fall
 * back to local content silently. Nothing here is user-visible as "AI".
 */

var ORIGIN = "https://s6ggrpgrzf-droid.github.io";
var MODELS = [
  "@cf/meta/llama-3.1-8b-instruct",
  "@cf/meta/llama-3.1-8b-instruct-fast",
  "@cf/mistral/mistral-7b-instruct-v0.2"
];

function normResponse(r) {
  var x = r && r.response;
  if (typeof x === 'string') return x;
  if (x && typeof x === 'object') {
    if (x.response != null && typeof x.response !== 'string') {
      try { return JSON.stringify(x.response).slice(0, 4000); } catch (e) {}
    }
    if (typeof x.response === 'string') return x.response;
    try { return JSON.stringify(x).slice(0, 4000); } catch (e) { return ''; }
  }
  return '';
}

async function runAi(env, messages, maxTokens, temperature, fmt) {
  var lastErr = "";
  for (var i = 0; i < MODELS.length; i++) {
    try {
      var params = { messages: messages, max_tokens: maxTokens, temperature: temperature };
      if (fmt && MODELS[i].indexOf("mistral") < 0) params.response_format = fmt;
      var r = await env.AI.run(MODELS[i], params);
      var txt = normResponse(r);
      if (txt) return txt;
      lastErr = "empty response from " + MODELS[i];
    } catch (e) {
      lastErr = MODELS[i] + ": " + String((e && e.message) || e).slice(0, 140);
    }
  }
  throw new Error(lastErr || "all models failed");
}

var TEXT_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "FlavorText",
    schema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"]
    }
  }
};

function cors(extra) {
  var h = {
    "Access-Control-Allow-Origin": ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
  if (extra) for (var k in extra) h[k] = extra[k];
  return h;
}
function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: cors({ "Content-Type": "application/json" })
  });
}
function cleanWord(s, max) {
  s = String(s == null ? "" : s).replace(/[<>&']/g, "").trim();
  if (s.length > max) {
    var cut = s.slice(0, max), sp = cut.lastIndexOf(" ");
    s = (sp > max * 0.6 ? cut.slice(0, sp) : cut).trim() + "…";
  }
  return s;
}
function extractBlocks(text) {
  var blocks = [], i = 0, n = text.length;
  while (i < n) {
    if (text[i] !== '{') { i++; continue; }
    var depth = 0, inStr = false, esc = false, start = i, j;
    for (j = i; j < n; j++) {
      var c = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
      } else {
        if (c === '"') inStr = true;
        else if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) { blocks.push(text.slice(start, j + 1)); i = j + 1; break; }
        }
      }
    }
    if (j >= n) break;
  }
  return blocks;
}
function extractJson(text) {
  var t = String(text || "").replace(/```json|```/g, "");
  var blocks = extractBlocks(t), merged = null, k, o, key;
  for (k = 0; k < blocks.length; k++) {
    try {
      o = JSON.parse(blocks[k]);
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        if (!merged) merged = {};
        for (key in o) merged[key] = o[key];
      }
    } catch (e) {}
  }
  return merged;
}
async function checkRate(env, ip, key, max) {
  var k = "rl/" + key + "/" + ip + "/" + Math.floor(Date.now() / 60000);
  var n = parseInt((await env.STORE.get(k)) || "0", 10) || 0;
  if (n >= max) return false;
  await env.STORE.put(k, String(n + 1), { expirationTtl: 90 });
  return true;
}
function ctxHash(ctx) {
  var s = "";
  try { s = JSON.stringify(ctx || {}); } catch (e) {}
  var h = 0;
  for (var i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function fieldSchema(fields) {
  var props = {};
  fields.forEach(function (f) { props[f] = { type: "string" }; });
  return {
    type: "json_schema",
    json_schema: { name: "Fields", schema: { type: "object", properties: props, required: fields } }
  };
}

/* ---------------- kind specs: voice + prompt builder + max length -------- */

var KINDS = {
  briefing: {
    max: 120,
    sys: "You write terse arcade space-opera mission briefings. Second person, present tense, no politics, no real people, never cruel.",
    prompt: function (c) {
      return "Write one mission briefing for a neon space shooter arcade run (max 18 words). " +
        "Name a sector or threat. Punchy. Example: 'Sector 7: pirate swarm near the shattered moon. Weapons hot.'";
    }
  },
  taunt: {
    max: 100,
    sys: "You are Wilbur, a snooty evil cat mage looming over a bubble-shooter witch. Condescending, theatrical, feline. Never cruel, never graphic, no politics, no real people.",
    prompt: function (c) {
      var hp = +((c && c.hp) || 100);
      var mood = hp > 66 ? "arrogant and untouched" : hp > 33 ? "annoyed that the witch is winning" : "furious and desperate";
      return "Wilbur the evil cat mage taunts the player mid-boss-fight. He is " + mood + ". " +
        "One line, max 16 words, first person as Wilbur. Example: 'You pop bubbles. I end bloodlines, little witch.'";
    }
  },
  banner: {
    max: 90,
    sys: "You write playful garden-warfare wave announcements for a cozy tower-defense game. Puns welcome. Never cruel, never graphic.",
    prompt: function (c) {
      var w = +((c && c.wave) || 1), fin = c && c.final;
      return "Write a fun sub-headline for tower-defense wave " + w + (fin ? " (the FINAL wave)" : "") +
        " (max 14 words). Garden puns encouraged. Example: 'They brought friends. And tiny pitchforks.'";
    }
  },
  quip: {
    max: 110,
    sys: "You write sweet celebratory one-liners for a candy match-3 game. Playful, warm, never cruel.",
    prompt: function (c) {
      var lv = +((c && c.level) || 1), st = +((c && c.stars) || 1);
      return "Write a celebratory one-liner for beating candy match-3 level " + lv + " with " + st + " star(s) " +
        "(max 16 words). Candy puns encouraged. Example: 'The gummy bears are throwing a parade in your honor.'";
    }
  },
  title: {
    max: 42,
    sys: "You write calm, zen level epithets for a minimalist arrow puzzle game. Serene, minimal, 2-4 words. No puns, no jokes.",
    prompt: function (c) {
      var lv = +((c && c.level) || 1);
      return "Write a serene 2-4 word epithet for puzzle level " + lv +
        " (examples: 'Still Water', 'The Long Turn', 'Quiet Geometry'). Output ONLY the epithet, nothing else.";
    }
  },
  well: {
    max: 90,
    sys: "You write playful one-line themes for a daily word-ladder puzzle game. Warm, witty, family-friendly. No politics, no real people.",
    prompt: function (c) {
      var s = String((c && c.start) || "COLD").toUpperCase(), e = String((c && c.end) || "WARM").toUpperCase();
      return "Write a playful one-line theme for a word ladder puzzle from " + s + " to " + e +
        " (max 12 words). Example: 'From frost to furnace, one letter at a time.'";
    }
  },
  racehype: {
    max: 90,
    sys: "You write punchy pre-race hype one-liners for a neon arcade drift-racing game. Energetic, playful, family-friendly. No politics, no real people.",
    prompt: function (c) {
      var track = String((c && c.track) || "Neon City");
      return "Write a hype one-liner shown before a drift race on the '" + track + "' track (max 14 words). Racing energy, avoid clichés like 'start your engines'. Example: 'Tonight the neon bites back. Stay sideways.'";
    }
  },
  crypt: {
    max: 100,
    sys: "You are a gothic crypt monster taunting a card player across the poker table. Menacing but playful, never cruel, never graphic, no politics, no real people.",
    prompt: function (c) {
      var m = String((c && c.monster) || "a crypt monster"), r = +((c && c.room) || 1);
      var mood = r >= 5 ? "at full terrifying power for the final room" : r >= 3 ? "confident, mid-dungeon" : "toying with a newcomer";
      return "Write one taunt line spoken by " + m + ", " + mood + ", to a mortal playing poker hands against it (max 16 words). First person as the monster. Card/gambling menace welcome. Example: 'I have eaten better gamblers than you, little mortal.'";
    }
  },
  chronicle: {
    max: 200,
    tokens: 160,
    sys: "You are the chronicler of a cozy forest in a gentle nature game. You write warm storybook journal entries in past tense. Observant, tender, never cruel, never graphic, no politics, no real people, no human characters.",
    prompt: function (c) {
      var day = +((c && c.day) || 1);
      var evs = String((c && c.events) || "a quiet day in the young forest").slice(0, 300);
      return "Write a 1-2 sentence chronicle entry for day " + day + " of a tiny forest. " +
        "Notable happenings: " + evs + ". " +
        "Storybook voice, past tense, max 32 words. " +
        "Example: 'On the third morning the old oak reached for the clouds, and a squirrel named Bramble claimed its highest branch.'";
    }
  },
  crittername: {
    max: 20,
    tokens: 40,
    sys: "You invent sweet woodland-creature names for a cozy forest game. One or two words, nature-inspired, family-friendly. Never a real person's name.",
    prompt: function (c) {
      var sp = String((c && c.species) || "squirrel").replace(/[^a-z]/g, "").slice(0, 20) || "squirrel";
      return "Invent a cute name for a " + sp + " in a cozy forest (examples: 'Bramble', 'Pippa', 'Moss', 'Tansy'). Output ONLY the name, nothing else.";
    }
  },
  wildevent: {
    max: 160,
    tokens: 220,
    fields: ["title", "text", "a", "b"],
    sys: "You write tiny gentle story events for a cozy forest game. Warm, whimsical, family-friendly. Never cruel, never scary, no politics, no real people, no human characters.",
    prompt: function (c) {
      var day = +((c && c.day) || 1);
      var hint = String((c && c.hint) || "a small woodland visitor passes through").slice(0, 120);
      return "Write a tiny forest event for day " + day + ". Seed idea: " + hint + ". " +
        "Return JSON with: title (max 6 words), text (1-2 sentences, max 30 words, second person present), " +
        "a (a tending choice label, max 5 words, e.g. 'Tend it gently'), " +
        "b (a watchful choice label, max 5 words, e.g. 'Just watch'). " +
        "Both choices are kind; nothing bad happens either way.";
    }
  },
  nightbrief: {
    max: 140,
    sys: "You write terse gothic scene-setters for a vampire survival game. Dark, atmospheric, never graphic, never cruel, no politics, no real people.",
    prompt: function (c) {
      var n = +((c && c.night) || 1);
      return "Write one terse gothic scene-setting line for night " + n + " of a vampire survival game (max 20 words). " +
        "Name a village or dark place. Example: 'The village of Ravenhurst slumbers beneath a hunters moon. Feed.'";
    }
  },
  vamptaunt: {
    max: 110,
    sys: "You write comic panicked-villager one-liners for a vampire survival game. Funny, cowardly, family-friendly. Never cruel, never graphic, no politics, no real people.",
    prompt: function (c) {
      return "Write one comic panicked line shouted by a villager fleeing a vampire (max 16 words), first person. " +
        "Example: 'Hes behind me, isnt he? Tell my chickens I loved them!'";
    }
  },
  fairway: {
    max: 42,
    sys: "You write serene golf hole names for a cozy miniature golf game. Calm, natural, 2-4 words. No puns, no jokes.",
    prompt: function (c) {
      var n = +((c && c.hole) || 1);
      return "Write a serene 2-4 word name for miniature golf hole " + n +
        " (examples: 'Morning Calm Ridge', 'Still Water', 'Early Dawn'). Output ONLY the name, nothing else.";
    }
  },
  fishlore: {
    max: 120,
    sys: "You write whimsical one-line fish lore for a cozy fishing game. Playful, warm, family-friendly. No politics, no real people.",
    prompt: function (c) {
      var f = String((c && c.fish) || "a mysterious fish").slice(0, 40);
      return "Write a whimsical one-line lore for a fish called '" + f + "' (max 20 words). " +
        "Example: 'Legend says the Sunny Perch sings lullabies to the schoolchildren of the coral reef.'";
    }
  },
  krakentaunt: {
    max: 100,
    sys: "You are a kraken taunting a pinball player from the deep. Menacing but playful, never cruel, never graphic, no politics, no real people.",
    prompt: function (c) {
      return "Write one kraken taunt to a pinball player (max 16 words), first person as the kraken. " +
        "Example: 'Your silver ball dances, little minnow. The deep keeps what it catches.'";
    }
  },
  palette: {
    max: 160,
    tokens: 120,
    sys: "You output harmonious color palettes as JSON arrays of hex colors. Output ONLY the JSON array, nothing else.",
    prompt: function (c) {
      var mood = String((c && c.mood) || "serene").slice(0, 40);
      return "Output a JSON array of 8 harmonious hex colors for a " + mood + " painting. " +
        "Example: [\"#556b95\",\"#698b8e\",\"#8b9467\",\"#b2c7ac\",\"#87a2b5\",\"#4f516e\",\"#455a64\",\"#5d6b7a\"]. " +
        "Output ONLY the array, nothing else.";
    }
  },
  shipstory: {
    max: 200,
    custom: true, // handled by shipStory() below: KV-backed registry of returning ships
    sys: "You are the harbormaster of Greywater Light, a lonely lighthouse. You invent passing ships with salt in their stories. Warm, storybook maritime voice, family-friendly. Never cruel, never graphic, no politics, no real people.",
    prompt: function (c) { return ""; }
  },
  logentry: {
    max: 230,
    tokens: 170,
    sys: "You are the keeper of Greywater Light writing in the lighthouse logbook. Storybook maritime voice: warm, observant, a little poetic, past tense. Family-friendly. Never cruel, never graphic, no politics, no real people.",
    prompt: function (c) {
      var kind = String((c && c.kind) || "greet");
      var season = String((c && c.season) || "summer"), weather = String((c && c.weather) || "clear");
      var day = +((c && c.day) || 1);
      var ship = (c && c.ship) || null, whale = (c && c.whale) || null;
      var base = "Write a lighthouse logbook entry, 1-2 sentences, past tense, max 38 words, for day " + day + ", a " + weather + " " + season + " day. ";
      if (kind === "whale") return base + "The keeper sounded the foghorn, and a whale answered from the dark \u2014 not a ship. " +
        (whale && whale.name ? "The whale is known to the keeper as " + String(whale.name).slice(0, 40) + ". " : "") +
        "Wonder and quiet companionship, never fear.";
      if (kind === "guided") return base + "The keeper guided " + (ship ? "'" + String(ship.name).slice(0, 40) + "'" : "a ship") +
        " through the rocky narrows with lamp flashes in foul weather. Relief, quiet pride.";
      return base + "The keeper exchanged lamp signals with " +
        (ship ? "'" + String(ship.name).slice(0, 40) + "', a " + String(ship.type).slice(0, 20) + " out of " + String(ship.origin).slice(0, 24) +
          " bound for " + String(ship.dest).slice(0, 24) + " carrying " + String(ship.cargo).slice(0, 30) + "." : "a passing ship.") +
        " Warm, observant, a little poetic.";
    }
  },
  arcadeeditorial: {
    max: 140,
    tokens: 300,
    custom: true, // handled by arcadeEditorial(): date-keyed KV cache, structured picks
    sys: "You are the curator of the Gamez arcade. Warm, sharp, playful voice. Family-friendly. No politics, no real people.",
    prompt: function (c) { return ""; }
  },
  trainpassenger: {
    max: 90,
    tokens: 400,
    custom: true, // handled by trainPassenger(): date-keyed KV cache, structured list
    sys: "You invent cozy train passengers for Emberline, a gentle storybook train game. Warm, whimsical, family-friendly voice. Each passenger: a full name and one evocative sentence about why they're traveling. No politics, no real people, nothing sad or scary.",
    prompt: function (c) { return ""; }
  },
  trainlog: {
    max: 220,
    tokens: 160,
    sys: "You are the conductor of Emberline, a cozy little train, writing in the logbook after a run. Warm storybook voice, past tense, gentle and observant. Family-friendly. Never mention being AI.",
    prompt: function (c) {
      var score = +((c && c.score) || 60);
      var stops = String((c && c.stops) || "").slice(0, 200);
      var pax = +((c && c.passengers) || 0);
      var mood = score>=80 ? "Silk on the rails — every stop a whisper." : score>=60 ? "A steady run through the valley." : "A gentle run; the valley didn't mind.";
      return "Write a conductor's logbook entry, 2-3 sentences, past tense, max 42 words. " + mood +
        " Carried " + pax + " passengers. Stops: " + stops + ". Mention one small trackside moment (a heron, kids waving, chimney smoke).";
    }
  }
};

/* arcadeeditorial: the arcade's daily curator picks. One generation per date,
   cached in KV, served to every visitor. Structured {picks:[{game,blurb}]}. */
var ARCADE_GAMES = [
  ["candy-cascade", "Candy Cascade", "match-3 puzzler, 25 levels, Sugar Crush finales"],
  ["bubble-hex", "Bubble Hex", "bubble shooter, moonlit forest, boss battles"],
  ["bloom-defense", "Bloom Defense", "garden tower defense, 10 waves of weeds"],
  ["neon-void", "Neon Void", "twin-stick neon arena shooter"],
  ["maze-trace", "Arrow Slide", "slide arrows off the grid, 24 levels"],
  ["life-story", "Life Story", "live a whole life one tap at a time"],
  ["reel-empire", "Reel Empire", "movie studio tycoon"],
  ["pdawg", "Pdawg", "jigsaw puzzles, photo import, mystery mode"],
  ["castaway-cove", "Castaway Cove", "cozy fishing, 40+ fish, rod upgrades"],
  ["tiny-fairway", "Tiny Fairway", "one-touch golf, endless holes, 7 wonders"],
  ["neon-drift", "Neon Drift", "arcade drift racer"],
  ["dead-mans-hand", "Dead Man's Hand", "Klondike solitaire with saloon soul"],
  ["word-well", "Word Well", "daily crossword-style word game"],
  ["moss-stone", "Moss & Stone", "living koi pond, zen garden sim"],
  ["skyhook", "Skyhook", "one-button rope-swinging, backflips"],
  ["unfold", "Unfold", "cozy escape rooms, daily seeded room"],
  ["dead-corridor", "Dead Man's Corridor", "on-rails haunted facility shooter"],
  ["golden-acre", "Golden Acre", "farm sim, seasons, livestock, county fair"],
  ["greywater", "Greywater Light", "lighthouse keeper sim, guide ships home"],
  ["still-life", "Still Life", "coloring book, original art pages"],
  ["skyline-sparrow", "Skyline Sparrow", "one-touch auto-runner at dawn"]
];
var ARCADE_IDS = {};
ARCADE_GAMES.forEach(function (g) { ARCADE_IDS[g[0]] = g[1]; });

async function arcadeEditorial(env, ctx, body, ip) {
  if (!(await checkRate(env, ip, "arcadeeditorial", 10))) return json({ error: "slow down" }, 429);
  var date = String((body.ctx && body.ctx.date) || "").replace(/[^0-9-]/g, "").slice(0, 10) || "daily";
  var key = "g/arcadeeditorial/" + date;
  var cached = await env.STORE.get(key, "json");
  if (cached && cached.picks && cached.picks.length === 3) return json(cached);
  var list = ARCADE_GAMES.map(function (g) { return g[0] + " (" + g[1] + ": " + g[2] + ")"; }).join("; ");
  var aiTxt;
  try {
    aiTxt = await runAi(env, [
      { role: "system", content: KINDS.arcadeeditorial.sys + " Output ONLY the JSON object, nothing else." },
      { role: "user", content: "Pick 3 DIFFERENT games for tonight at the arcade: one cozy, one thrilling, one quick session. " +
        "Write a warm one-line blurb for each (max 22 words), like a friend recommending them. " +
        "Output ONLY this JSON, nothing else: {\"picks\":[{\"game\":\"<id>\",\"blurb\":\"...\"},{\"game\":\"<id>\",\"blurb\":\"...\"},{\"game\":\"<id>\",\"blurb\":\"...\"}]}. " +
        "Use only these game ids: " + ARCADE_GAMES.map(function (g) { return g[0]; }).join(", ") + ". " +
        "The games: " + list }
    ], 300, 0.85, TEXT_SCHEMA);
  } catch (e) { return json({ error: "ai unavailable", detail: String(e.message || e).slice(0, 120) }, 502); }
  var d = extractJson(aiTxt || ""), picks = [], seen = {};
  if (d && Array.isArray(d.picks)) {
    for (var i = 0; i < d.picks.length && picks.length < 3; i++) {
      var p = d.picks[i] || {};
      var id = String(p.game || "").toLowerCase().replace(/[^a-z-]/g, "");
      var blurb = cleanWord(p.blurb || "", 140);
      if (ARCADE_IDS[id] && !seen[id] && blurb.length > 8) { seen[id] = 1; picks.push({ game: id, blurb: blurb }); }
    }
  }
  if (picks.length < 3) return json({ error: "bad generation" }, 502);
  var out = { date: date, picks: picks };
  ctx.waitUntil(env.STORE.put(key, JSON.stringify(out), { expirationTtl: 86400 * 3 }));
  return json(out);
}

/* shipstory: the harbormaster remembers. KV registry per keeper so ships return
   across sessions as recurring characters. Bypasses the generic cache. */
async function shipStory(env, ctx, body, game, ip) {
  if (!(await checkRate(env, ip, "shipstory", 10))) return json({ error: "slow down" }, 429);
  var c = body.ctx || {};
  var keeper = String(c.keeper || "anon").replace(/[^a-z0-9]/gi, "").slice(0, 24) || "anon";
  var regKey = "greywater/ships/" + keeper;
  var reg = (await env.STORE.get(regKey, "json")) || [];
  if (!Array.isArray(reg)) reg = [];
  var day = +c.day || 1;
  var returning = null;
  if (reg.length && Math.random() < 0.38) {
    var cands = reg.filter(function (s) { return (day - (+s.lastSeen || 0)) > 6; });
    var pool = cands.length ? cands : reg;
    returning = pool[Math.floor(Math.random() * pool.length)];
  }
  var fields = ["name", "type", "origin", "dest", "cargo", "story", "memory"];
  var sys = KINDS.shipstory.sys, prompt;
  if (returning) {
    prompt = "A ship the keeper has met before is passing again on day " + day + ". " +
      "Ship: '" + returning.name + "' (" + returning.type + "), previously carried " + returning.cargo +
      ", " + (+returning.encounters || 1) + " past encounter(s). " +
      "Return JSON with: name (exactly '" + returning.name + "'), type (one of: schooner, steamer, fishing smack, clipper), " +
      "origin (a north-atlantic port), dest (a north-atlantic port), cargo (goods in her hold), " +
      "story (one fresh sentence of ship lore, max 24 words), " +
      "memory (one warm sentence recalling a past meeting with the keeper, max 20 words).";
  } else {
    var used = reg.slice(-14).map(function (s) { return s.name; }).join(", ");
    prompt = "Invent a new passing ship sighted near a lonely lighthouse on a " + String(c.weather || "clear") +
      " " + String(c.season || "summer") + " day. " +
      "Return JSON with: name (an evocative two-word ship name), type (one of: schooner, steamer, fishing smack, clipper), " +
      "origin (a north-atlantic port), dest (a different north-atlantic port), cargo (goods in her hold), " +
      "story (one sentence of ship lore, max 24 words), memory (empty string). " +
      (used ? "Do not reuse these names: " + used + "." : "");
  }
  var aiTxt;
  try {
    aiTxt = await runAi(env, [{ role: "system", content: sys }, { role: "user", content: prompt }], 200, 0.9, fieldSchema(fields));
  } catch (e) { return json({ error: "ai unavailable" }, 502); }
  var d = extractJson(aiTxt || "") || {};
  var rawType = String(d.type || "").toLowerCase();
  var ship = {
    name: cleanWord(d.name || "", 30) || "Grey Wanderer",
    type: rawType.indexOf("steam") >= 0 ? "steamer" : rawType.indexOf("clipper") >= 0 ? "clipper" : rawType.indexOf("smack") >= 0 ? "smack" : "schooner",
    origin: cleanWord(d.origin || "", 24) || "Bergen",
    dest: cleanWord(d.dest || "", 24) || "St. Johns",
    cargo: cleanWord(d.cargo || "", 30) || "salt cod",
    story: cleanWord(d.story || "", 170) || "She has weathered three gales and never lost a soul.",
    memory: cleanWord(d.memory || "", 150),
    returned: !!returning
  };
  if (returning) {
    returning.encounters = (+returning.encounters || 1) + 1;
    returning.lastSeen = day; returning.cargo = ship.cargo;
  } else {
    reg.push({ name: ship.name, type: ship.type, origin: ship.origin, dest: ship.dest, cargo: ship.cargo, story: ship.story, encounters: 1, lastSeen: day });
    if (reg.length > 40) reg = reg.slice(-40);
  }
  ctx.waitUntil(env.STORE.put(regKey, JSON.stringify(reg), { expirationTtl: 86400 * 90 }));
  return json({ ship: ship });
}

/* trainpassenger: one generation per date, cached in KV, served to every
   conductor. Structured {passengers:[{name,story}]}. */
async function trainPassenger(env, ctx, body, ip) {
  if (!(await checkRate(env, ip, "trainpassenger", 10))) return json({ error: "slow down" }, 429);
  var date = String((body.ctx && body.ctx.date) || "").replace(/[^0-9-]/g, "").slice(0, 10) || "daily";
  var key = "g/trainpassenger/" + date;
  var cached = await env.STORE.get(key, "json");
  if (cached && cached.passengers && cached.passengers.length >= 8) return json(cached);
  var aiTxt;
  try {
    aiTxt = await runAi(env, [
      { role: "system", content: KINDS.trainpassenger.sys + " Output ONLY the JSON object, nothing else." },
      { role: "user", content: "Invent 12 cozy train passengers for today's valley line. " +
        "Each: a full name (varied, storybook) and one sentence (max 18 words) about why they're traveling — warm, specific, charming. " +
        "Output ONLY this JSON, nothing else: {\"passengers\":[{\"name\":\"...\",\"story\":\"...\"}, ... 12 total]}." }
    ], 400, 0.9, TEXT_SCHEMA);
  } catch (e) { return json({ error: "ai unavailable", detail: String(e.message || e).slice(0, 120) }, 502); }
  var d = extractJson(aiTxt || ""), list = [];
  if (d && Array.isArray(d.passengers)) {
    for (var i = 0; i < d.passengers.length && list.length < 12; i++) {
      var p = d.passengers[i] || {};
      var nm = cleanWord(p.name || "", 40), st = cleanWord(p.story || "", 120);
      if (nm.length > 2 && st.length > 8) list.push({ name: nm, story: st });
    }
  }
  if (list.length < 8) return json({ error: "bad generation" }, 502);
  var out = { date: date, passengers: list };
  ctx.waitUntil(env.STORE.put(key, JSON.stringify(out), { expirationTtl: 86400 * 3 }));
  return json(out);
}

export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
    if (url.pathname === "/" && request.method === "GET") return json({ ok: true, service: "gamez-ai" });

    var ip = request.headers.get("CF-Connecting-IP") || "unknown";

    if (url.pathname === "/g" && request.method === "POST") {
      if (!(await checkRate(env, ip, "g", 20))) return json({ error: "slow down" }, 429);
      var body;
      try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
      var kind = KINDS[body.kind], game = String(body.game || "unknown").replace(/[^a-z0-9-]/g, "").slice(0, 24);
      if (!kind) return json({ error: "unknown kind" }, 400);
      if (body.kind === "shipstory") return await shipStory(env, ctx, body, game, ip);
      if (body.kind === "arcadeeditorial") return await arcadeEditorial(env, ctx, body, ip);
      if (body.kind === "trainpassenger") return await trainPassenger(env, ctx, body, ip);
      var key = "g/" + body.kind + "/" + game + "/" + ctxHash(body.ctx);
      var cached = await env.STORE.get(key, "json");
      if (cached && (cached.text || (kind.fields && cached[kind.fields[0]]))) return json(cached);

      var aiTxt;
      try {
        aiTxt = await runAi(env, [
          { role: "system", content: kind.sys },
          { role: "user", content: kind.prompt(body.ctx) }
        ], kind.tokens || 120, 0.85, kind.fields ? fieldSchema(kind.fields) : TEXT_SCHEMA);
      } catch (e) { return json({ error: "ai unavailable", detail: String(e.message || e).slice(0, 200) }, 502); }
      var d = extractJson(aiTxt || "");
      var out;
      if (kind.fields) {
        out = {};
        var okAll = true;
        kind.fields.forEach(function (f) {
          var v = d && typeof d[f] === "string" ? cleanWord(d[f], kind.max) : "";
          if (v.length < 2) okAll = false;
          out[f] = v;
        });
        if (!okAll) return json({ error: "bad generation", raw: String(aiTxt || "").slice(0, 200) }, 502);
      } else {
        var text = d && typeof d.text === "string" ? cleanWord(d.text, kind.max) : "";
        if (text.length < 4) {
          var prose = cleanWord(aiTxt, kind.max);
          if (prose.length >= 4 && prose.charAt(0) !== '{') text = prose;
        }
        if (text.length < 4) return json({ error: "bad generation", raw: String(aiTxt || "").slice(0, 200) }, 502);
        out = { text: text };
      }
      ctx.waitUntil(env.STORE.put(key, JSON.stringify(out), { expirationTtl: 86400 * 7 }));
      return json(out);
    }

    return new Response("not found", { status: 404, headers: cors() });
  }
};
