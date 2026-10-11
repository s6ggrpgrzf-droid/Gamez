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
  }
};

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
