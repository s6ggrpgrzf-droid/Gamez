/* life-story-ai — Workers AI text generation for the Life Story game.
 *
 *   AI    -> Workers AI binding (Llama instruct model)
 *   STORE -> KV namespace (event cache + rate limits)
 *
 *   POST /event    {state:{...}} -> {text, choices:[{label, fx:{happy,health,smarts,looks,money,fame}}]}
 *   POST /obituary {name, age, cause, ribbon, highlights[]} -> {text}
 *   GET  / -> health check
 *
 * Events are cached in KV by coarse situation signature so one generation
 * serves many players. All output is validated, clamped, and HTML-stripped.
 * The game treats every AI response as optional enhancement: timeouts and
 * failures fall back to local content, and the game works fully offline.
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
    // nested wrapper? stringify the inner object whole so no fields are lost
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
      var params = {
        messages: messages,
        max_tokens: maxTokens,
        temperature: temperature
      };
      // native JSON enforcement; mistral-7b does not support it, so skip there
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

// Native JSON-mode schemas (Workers AI json_schema). Keep field names short,
// nesting shallow: text + a flat choices array.
var EVENT_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "LifeEvent",
    schema: {
      type: "object",
      properties: {
        text: { type: "string" },
        choices: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              happy: { type: "number" },
              health: { type: "number" },
              smarts: { type: "number" },
              looks: { type: "number" },
              money: { type: "number" },
              fame: { type: "number" }
            },
            required: ["label", "happy", "health", "smarts", "looks", "money", "fame"]
          }
        }
      },
      required: ["text", "choices"]
    }
  }
};
var OBIT_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "Obituary",
    schema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"]
    }
  }
};
var BIO_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "Biography",
    schema: {
      type: "object",
      properties: {
        acts: { type: "array", items: { type: "string" } },
        epitaph: { type: "string" }
      },
      required: ["acts", "epitaph"]
    }
  }
};
var HEADLINE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "Headline",
    schema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"]
    }
  }
};
var DREAM_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "Dream",
    schema: {
      type: "object",
      properties: {
        text: { type: "string" },
        choices: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              happy: { type: "number" },
              health: { type: "number" },
              smarts: { type: "number" },
              looks: { type: "number" },
              money: { type: "number" },
              fame: { type: "number" },
              karma: { type: "number" }
            },
            required: ["label", "happy", "health", "smarts", "looks", "money", "fame", "karma"]
          }
        }
      },
      required: ["text", "choices"]
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
function clean(s, max) {
  s = String(s == null ? "" : s).replace(/[<>&"']/g, "").trim();
  if (s.length > max) s = s.slice(0, max).trim();
  return s;
}
function cleanWord(s, max) {
  // like clean(), but never chops mid-word: backs off to the last space + …
  s = String(s == null ? "" : s).replace(/[<>&"']/g, "").trim();
  if (s.length > max) {
    var cut = s.slice(0, max), sp = cut.lastIndexOf(" ");
    s = (sp > max * 0.6 ? cut.slice(0, sp) : cut).trim() + "…";
  }
  return s;
}
function clampN(v, a, b) {
  v = Math.round(+v || 0);
  return v < a ? a : v > b ? b : v;
}
function extractBlocks(text) {
  // top-level {...} substrings with balanced braces (string-aware)
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
    if (j >= n) break; // unbalanced tail; stop
  }
  return blocks;
}
function extractJson(text) {
  // strip markdown fences, parse every top-level {...} block, shallow-merge.
  // Tolerates models that emit {"text":"..."} and {"choices":[...]} as two objects.
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
function econTier(worth) {
  if (worth < 0) return "debt";
  if (worth < 50000) return "broke";
  if (worth < 500000) return "ok";
  if (worth < 5000000) return "rich";
  return "loaded";
}
function eventCacheKey(st) {
  var ageB = Math.floor((+st.age || 0) / 5) * 5;
  var job = st.job ? "job" : "nojob";
  var fam = (st.kids ? "kids" : "nokids") + (st.partner ? "partner" : "solo");
  return "ev/" + ageB + "/" + (st.scenario || "classic") + "/" + job + "/" + fam + "/" + econTier(+st.worth || 0);
}

var EVENT_SYSTEM = "You are a JSON event generator for a satirical life-simulator game in the style of BitLife. " +
  "You output ONLY raw JSON. No explanations, no preamble, no markdown fences, no surrounding text. " +
  "Your entire response must be exactly one JSON object and nothing else.";

function eventPrompt(st) {
  var bits = [
    "Player: " + (+st.age || 20) + "-year-old,",
    st.job ? "works as " + clean(st.job, 30) + "," : "unemployed,",
    "net worth $" + Math.round(+st.worth || 0) + ",",
    "happiness " + (+st.happy || 50) + "/100, health " + (+st.health || 50) + "/100,",
    "smarts " + (+st.smarts || 50) + "/100, looks " + (+st.looks || 50) + "/100, fame " + (+st.fame || 0) + "/100."
  ];
  if (st.country) bits.push("Lives in " + clean(st.country, 30) + ".");
  if (st.partnerName) bits.push("Partner: " + clean(st.partnerName, 30) + ".");
  else bits.push(st.partner ? "Has a partner." : "Single.");
  if (st.kids) bits.push("Has " + (+st.kids) + " kid(s).");
  if (+st.crimes > 0) bits.push("Criminal record: " + (+st.crimes) + " crime(s).");
  if (st.karmaTier) bits.push("Soul: " + clean(st.karmaTier, 20) + ".");
  return EVENT_SYSTEM + "\n" + bits.join(" ") + "\n" +
    "Write one funny life event about this player (max 35 words, second person, present tense; never cruel, never graphic, no politics, no real people), " +
    "then exactly 3 short choices (max 8 words each). Small effects only: stats -12..+12, money -4000..+4000, fame -8..+8. " +
    "One choice should be a little mischievous. " +
    "You MUST output valid JSON matching the required schema: an object with " +
    '"text" (string) and "choices" (array of exactly 3 objects, each with ' +
    '"label" string and numeric happy/health/smarts/looks/money/fame).';
}

function sanitizeEvent(d) {
  if (!d || typeof d.text !== "string" || !Array.isArray(d.choices)) return null;
  var text = cleanWord(d.text, 220);
  if (text.length < 10) return null;
  var choices = [];
  for (var i = 0; i < d.choices.length && choices.length < 3; i++) {
    var c = d.choices[i] || {};
    var label = clean(c.label, 60);
    if (!label) continue;
    choices.push({
      label: label,
      happy: clampN(c.happy, -12, 12),
      health: clampN(c.health, -12, 12),
      smarts: clampN(c.smarts, -12, 12),
      looks: clampN(c.looks, -12, 12),
      money: clampN(c.money, -4000, 4000),
      fame: clampN(c.fame, -8, 8)
    });
  }
  if (choices.length < 2) return null;
  return { text: text, choices: choices, ai: true };
}

function sanitizeDream(d) {
  var ev = sanitizeEvent(d);
  if (!ev) return null;
  // dreams carry a karmic charge per choice: kind acts raise it, selfish ones lower it
  for (var i = 0; i < ev.choices.length; i++) {
    var raw = (d.choices[i] || {}).karma;
    ev.choices[i].karma = clampN(raw, -12, 12);
  }
  return ev;
}

function sanitizeBio(d) {
  if (!d || !Array.isArray(d.acts)) return null;
  var acts = [];
  for (var i = 0; i < d.acts.length && acts.length < 3; i++) {
    var a = cleanWord(d.acts[i], 420);
    if (a.length >= 20) acts.push(a);
  }
  if (acts.length < 3) return null;
  var epitaph = clean(d.epitaph, 90);
  if (!epitaph) return null;
  return { acts: acts, epitaph: epitaph, ai: true };
}

var CHILD_SYSTEM = "You are a JSON event generator for a satirical life-simulator game. You are writing " +
  "for a CHILD player — wholesome mischief, playground logic, big feelings about small things. " +
  "You output ONLY raw JSON. No explanations, no preamble, no markdown fences, no surrounding text. " +
  "Your entire response must be exactly one JSON object and nothing else.";

function childhoodPrompt(c) {
  var sibs = (c.siblings || []).slice(0, 3).map(function (s) { return clean(s, 30); }).filter(Boolean);
  var bits = [
    "Player is a " + (+c.age || 7) + "-year-old child named " + clean(c.name, 30) + ".",
    "Father: " + clean(c.father, 30) + ". Mother: " + clean(c.mother, 30) + ".",
    sibs.length ? "Siblings: " + sibs.join(", ") + "." : "Only child.",
    "Lives in " + clean(c.country, 30) + ". Family is " + clean(c.wealthTier, 20) + "."
  ];
  return CHILD_SYSTEM + "\n" + bits.join(" ") + "\n" +
    "Write one childhood vignette (max 30 words, second person, present tense; funny and warm, never scary, never cruel, no politics), " +
    "then exactly 3 short choices (max 8 words each). Small effects only: stats -8..+8, money -500..+500 (allowance scale), fame -3..+3. " +
    "One choice should be mischievous but harmless. " +
    "You MUST output valid JSON matching the required schema: an object with " +
    '"text" (string) and "choices" (array of exactly 3 objects, each with ' +
    '"label" string and numeric happy/health/smarts/looks/money/fame).';
}

var HEADLINE_SYSTEM = "You are a JSON tabloid-headline generator for a satirical life-simulator game. Cheeky, never cruel, never graphic, no real people. " +
  "You output ONLY raw JSON. No explanations, no preamble, no markdown, no surrounding text. " +
  "Your entire response must be exactly one JSON object and nothing else.";

function headlinePrompt(h) {
  return HEADLINE_SYSTEM + "\n" +
    "Write ONE tabloid headline (max 14 words, no quotation marks anywhere in it) about this game celebrity:\n" +
    clean(h.name, 40) + ", fame " + (+h.fame || 50) + "/100, who just did this: " + clean(h.highlight, 140) + "\n" +
    "Respond with EXACTLY this JSON object and nothing else:\n" +
    '{"text":"<headline>}';
}

var DREAM_SYSTEM = "You are a JSON dream-sequence generator for a satirical life-simulator game. Surreal, dreamlike, " +
  "a little funny — floating staircases, talking weather, that kind of thing. Never a nightmare, never scary. " +
  "You output ONLY raw JSON. No explanations, no preamble, no markdown fences, no surrounding text. " +
  "Your entire response must be exactly one JSON object and nothing else.";

function dreamPrompt(d) {
  return DREAM_SYSTEM + "\n" +
    clean(d.name, 40) + ", age " + (+d.age || 30) + ", a " + clean(d.karmaTier, 20) + " soul, " +
    "falls asleep after this day: " + clean(d.highlight, 140) + "\n" +
    "Write one dream sequence (max 35 words, second person, present tense, surreal imagery), " +
    "then exactly 3 short choices (max 8 words each). Each choice carries a karmic charge: " +
    "karma -12..+12 (kind dream-acts raise it, selfish ones lower it), plus small stat effects -8..+8, " +
    "money -1000..+1000, fame -4..+4. " +
    "You MUST output valid JSON matching the required schema: an object with " +
    '"text" (string) and "choices" (array of exactly 3 objects, each with ' +
    '"label" string and numeric happy/health/smarts/looks/money/fame/karma).';
}

var BIO_SYSTEM = "You are a JSON biographer for a satirical life-simulator game. Warm, funny, a little cheeky, " +
  "never cruel, never graphic. Third person, past tense. " +
  "You output ONLY raw JSON. No explanations, no preamble, no markdown, no surrounding text. " +
  "Your entire response must be exactly one JSON object and nothing else.";

function bioPrompt(b) {
  var hl = (b.highlights || []).slice(0, 8).map(function (h) { return clean(h, 120); }).filter(Boolean);
  var st = b.stats || {};
  return BIO_SYSTEM + "\n" +
    "Write a 3-act biography of this game character:\n" +
    clean(b.name, 40) + ", died at " + (+b.age || 70) + " (" + clean(b.cause, 80) + "). " +
    "Life theme: " + clean(b.ribbon, 60) + ". " +
    "Final stats — happiness " + (+st.happy || 50) + ", health " + (+st.health || 50) +
    ", smarts " + (+st.smarts || 50) + ", looks " + (+st.looks || 50) +
    ", fame " + (+st.fame || 0) + ", net worth $" + Math.round(+st.worth || 0) + ". " +
    (hl.length ? "True life highlights: " + hl.join(" ") : "") + "\n" +
    "Act 1 (youth), Act 2 (prime), Act 3 (twilight): 40-60 words each. " +
    "Then one epitaph line (max 12 words, tombstone-worthy, no quotation marks). " +
    "Respond with EXACTLY this JSON object and nothing else:\n" +
    '{"acts":["<act 1>","<act 2>","<act 3>"],"epitaph":"<epitaph>"}';
}

function bioCacheKey(b) {
  return "bio/" + clean(b.name, 40).replace(/\W+/g, "_") + "/" + (+b.birthYear || 0) + "/" + (+b.age || 0);
}
function childCacheKey(c) {
  var bucket = (+c.age || 7) < 5 ? "0-4" : (+c.age < 9 ? "5-8" : "9-12");
  return "child/" + bucket + "/" + clean(c.wealthTier || "ok", 20) + "/" + (((c.siblings || []).length > 0) ? "sib" : "nosib");
}
function dreamCacheKey(d) {
  return "dream/" + clean(d.karmaTier || "neutral", 20) + "/" + (Math.floor((+d.age || 30) / 10) * 10);
}

async function genJsonEvent(env, ctx, cacheKey, messages, maxTokens, temperature, schema, sanitize) {
  if (cacheKey) {
    var cached = await env.STORE.get(cacheKey, "json");
    if (cached && (cached.text || cached.acts)) return cached;
  }
  var aiTxt;
  try {
    aiTxt = await runAi(env, messages, maxTokens, temperature, schema);
  } catch (e) { throw new Error("ai unavailable: " + String((e && e.message) || e).slice(0, 200)); }
  var ev = null;
  try { ev = sanitize(extractJson(aiTxt || "")); } catch (e) {}
  if (!ev) throw new Error("bad generation: " + String(aiTxt || "").slice(0, 200));
  if (cacheKey) ctx.waitUntil(env.STORE.put(cacheKey, JSON.stringify(ev), { expirationTtl: 86400 * 7 }));
  return ev;
}

var OBIT_SYSTEM = "You are a JSON obituary generator for a satirical life-simulator game. Warm, funny, a little cheeky, never cruel, never graphic. " +
  "You output ONLY raw JSON. No explanations, no preamble, no markdown, no surrounding text. " +
  "Your entire response must be exactly one JSON object and nothing else.";

function obitPrompt(b) {
  var hl = (b.highlights || []).slice(0, 5).map(function (h) { return clean(h, 120); }).filter(Boolean);
  return OBIT_SYSTEM + "\n" +
    "Write a witty 2-sentence obituary (under 45 words) for this game character:\n" +
    clean(b.name, 40) + ", died at " + (+b.age || 70) + " (" + clean(b.cause, 80) + "). " +
    "Epitaph theme: " + clean(b.ribbon, 60) + ". " +
    (hl.length ? "Life highlights: " + hl.join(" ") : "") + "\n" +
    "Respond with EXACTLY this JSON object and nothing else:\n" +
    '{"text":"<obituary text>}';
}

export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
    if (url.pathname === "/" && request.method === "GET") return json({ ok: true, service: "life-story-ai" });

    var ip = request.headers.get("CF-Connecting-IP") || "unknown";

    if (url.pathname === "/event" && request.method === "POST") {
      if (!(await checkRate(env, ip, "event", 12))) return json({ error: "slow down" }, 429);
      var body;
      try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
      var st = body.state || {};
      var key = eventCacheKey(st);
      var cached = await env.STORE.get(key, "json");
      if (cached && cached.text) return json(cached);

      var prompt = eventPrompt(st);
      var aiTxt, ev = null;
      try {
        aiTxt = await runAi(env, [
          { role: "system", content: EVENT_SYSTEM },
          { role: "user", content: prompt }
        ], 600, 0.7, EVENT_SCHEMA);
        ev = sanitizeEvent(extractJson(aiTxt || ""));
      } catch (e) { return json({ error: "ai unavailable", detail: String(e.message || e).slice(0, 200) }, 502); }
      if (!ev) {
        // one retry at lower temperature, still in JSON mode
        try {
          var retryTxt = await runAi(env, [
            { role: "system", content: EVENT_SYSTEM },
            { role: "user", content: prompt + " Output valid JSON only." }
          ], 600, 0.4, EVENT_SCHEMA);
          ev = sanitizeEvent(extractJson(retryTxt || ""));
          if (ev) aiTxt = retryTxt;
        } catch (e) {}
      }
      if (!ev) return json({ error: "bad generation", raw: String(aiTxt || "").slice(0, 400) }, 502);
      ctx.waitUntil(env.STORE.put(key, JSON.stringify(ev), { expirationTtl: 86400 * 7 }));
      return json(ev);
    }

    if (url.pathname === "/obituary" && request.method === "POST") {
      if (!(await checkRate(env, ip, "obit", 4))) return json({ error: "slow down" }, 429);
      var b2;
      try { b2 = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
      var aiTxt2;
      try {
        aiTxt2 = await runAi(env, [
          { role: "system", content: OBIT_SYSTEM },
          { role: "user", content: obitPrompt(b2) }
        ], 300, 0.7, OBIT_SCHEMA);
      } catch (e) { return json({ error: "ai unavailable", detail: String(e.message || e).slice(0, 200) }, 502); }
      var d2 = extractJson(aiTxt2 || "");
      var text = d2 && typeof d2.text === "string" ? cleanWord(d2.text, 300) : "";
      if (text.length < 10) {
        // prose fallback: model ignored the JSON instruction; use raw text as-is
        var prose = cleanWord(aiTxt2, 300);
        if (prose.length >= 10 && prose.charAt(0) !== '{') text = prose;
      }
      if (text.length < 10) return json({ error: "bad generation", raw: String(aiTxt2 || "").slice(0, 400) }, 502);
      return json({ text: text, ai: true });
    }

    // v4 endpoints (biography, childhood, headline, dream)
    var v4 = await handleV4(request, env, ctx, url, ip);
    if (v4) return v4;

    return new Response("not found", { status: 404, headers: cors() });
  }
};

async function postJson(request) {
  var body;
  try { body = await request.json(); } catch (e) { return null; }
  return body;
}

// v4 endpoints live outside the default-export object so the router above stays readable.
async function handleV4(request, env, ctx, url, ip) {
  if (url.pathname === "/biography" && request.method === "POST") {
    if (!(await checkRate(env, ip, "bio", 4))) return json({ error: "slow down" }, 429);
    var b = await postJson(request);
    if (!b) return json({ error: "bad json" }, 400);
    try {
      var bio = await genJsonEvent(env, ctx, bioCacheKey(b), [
        { role: "system", content: BIO_SYSTEM },
        { role: "user", content: bioPrompt(b) }
      ], 900, 0.75, BIO_SCHEMA, sanitizeBio);
      return json(bio);
    } catch (e) { return json({ error: "ai unavailable", detail: String(e.message || e).slice(0, 200) }, 502); }
  }
  if (url.pathname === "/childhood" && request.method === "POST") {
    if (!(await checkRate(env, ip, "child", 12))) return json({ error: "slow down" }, 429);
    var c = await postJson(request);
    if (!c) return json({ error: "bad json" }, 400);
    try {
      var ch = await genJsonEvent(env, ctx, childCacheKey(c), [
        { role: "system", content: CHILD_SYSTEM },
        { role: "user", content: childhoodPrompt(c) }
      ], 600, 0.8, EVENT_SCHEMA, sanitizeEvent);
      return json(ch);
    } catch (e) { return json({ error: "ai unavailable", detail: String(e.message || e).slice(0, 200) }, 502); }
  }
  if (url.pathname === "/headline" && request.method === "POST") {
    if (!(await checkRate(env, ip, "headline", 6))) return json({ error: "slow down" }, 429);
    var h = await postJson(request);
    if (!h) return json({ error: "bad json" }, 400);
    // headlines are never cached: they react to what you JUST did
    var aiTxt;
    try {
      aiTxt = await runAi(env, [
        { role: "system", content: HEADLINE_SYSTEM },
        { role: "user", content: headlinePrompt(h) }
      ], 120, 0.85, HEADLINE_SCHEMA);
    } catch (e) { return json({ error: "ai unavailable", detail: String(e.message || e).slice(0, 200) }, 502); }
    var d = extractJson(aiTxt || "");
    var text = d && typeof d.text === "string" ? cleanWord(d.text, 120) : "";
    if (text.length < 8) {
      var prose = cleanWord(aiTxt, 120);
      if (prose.length >= 8 && prose.charAt(0) !== '{') text = prose;
    }
    if (text.length < 8) return json({ error: "bad generation", raw: String(aiTxt || "").slice(0, 200) }, 502);
    return json({ text: text, ai: true });
  }
  if (url.pathname === "/dream" && request.method === "POST") {
    if (!(await checkRate(env, ip, "dream", 8))) return json({ error: "slow down" }, 429);
    var dr = await postJson(request);
    if (!dr) return json({ error: "bad json" }, 400);
    try {
      var dream = await genJsonEvent(env, ctx, dreamCacheKey(dr), [
        { role: "system", content: DREAM_SYSTEM },
        { role: "user", content: dreamPrompt(dr) }
      ], 600, 0.85, DREAM_SCHEMA, sanitizeDream);
      return json(dream);
    } catch (e) { return json({ error: "ai unavailable", detail: String(e.message || e).slice(0, 200) }, 502); }
  }
  return null;
}
