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
    if (typeof x.response === 'string') return x.response;
    if (typeof x.text === 'string') return x.text;
    if (typeof x.content === 'string') return x.content;
    try { return JSON.stringify(x).slice(0, 2000); } catch (e) { return ''; }
  }
  return '';
}

async function runAi(env, messages, maxTokens, temperature) {
  var lastErr = "";
  for (var i = 0; i < MODELS.length; i++) {
    try {
      var r = await env.AI.run(MODELS[i], {
        messages: messages,
        max_tokens: maxTokens,
        temperature: temperature
      });
      var txt = normResponse(r);
      if (txt) return txt;
      lastErr = "empty response from " + MODELS[i];
    } catch (e) {
      lastErr = MODELS[i] + ": " + String((e && e.message) || e).slice(0, 140);
    }
  }
  throw new Error(lastErr || "all models failed");
}

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

var EVENT_PREFILL = '{"text":"';

function eventPrompt(st) {
  var bits = [
    "Player: " + (+st.age || 20) + "-year-old,",
    st.job ? "works as " + clean(st.job, 30) + "," : "unemployed,",
    "net worth $" + Math.round(+st.worth || 0) + ",",
    "happiness " + (+st.happy || 50) + "/100, health " + (+st.health || 50) + "/100,",
    "smarts " + (+st.smarts || 50) + "/100, looks " + (+st.looks || 50) + "/100, fame " + (+st.fame || 0) + "/100.",
    st.partner ? "Has a partner." : "Single.",
    st.kids ? "Has " + (+st.kids) + " kid(s)." : "No kids."
  ];
  return EVENT_SYSTEM + "\n" + bits.join(" ") + "\n" +
    "Write one funny life event about this player (max 35 words, second person, present tense; never cruel, never graphic, no politics, no real people), " +
    "then exactly 3 short choices (max 8 words each). Small effects only: stats -12..+12, money -4000..+4000, fame -8..+8. " +
    "One choice should be a little mischievous.\n" +
    "Respond with EXACTLY this JSON object and nothing else:\n" +
    '{"text":"<event text>","choices":[' +
    '{"label":"<choice 1>","happy":0,"health":0,"smarts":0,"looks":0,"money":0,"fame":0},' +
    '{"label":"<choice 2>","happy":0,"health":0,"smarts":0,"looks":0,"money":0,"fame":0},' +
    '{"label":"<choice 3>","happy":0,"health":0,"smarts":0,"looks":0,"money":0,"fame":0}' +
    "]}\n" +
    EVENT_PREFILL;
}

function sanitizeEvent(d) {
  if (!d || typeof d.text !== "string" || !Array.isArray(d.choices)) return null;
  var text = clean(d.text, 220);
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
    '{"text":"<obituary text>"}\n' +
    'Begin your response with {"text":"';
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
        ], 600, 0.7);
        ev = sanitizeEvent(extractJson(EVENT_PREFILL + (aiTxt || "")));
      } catch (e) { return json({ error: "ai unavailable", detail: String(e.message || e).slice(0, 200) }, 502); }
      if (!ev) {
        // one blunt retry: show the exact shape again
        try {
          var retryTxt = await runAi(env, [
            { role: "system", content: EVENT_SYSTEM },
            { role: "user", content: "Output ONLY this exact JSON shape, nothing else, no prose:\n" +
              '{"text":"<event text, max 35 words, second person, funny>","choices":[' +
              '{"label":"<choice 1, max 8 words>","happy":0,"health":0,"smarts":0,"looks":0,"money":0,"fame":0},' +
              '{"label":"<choice 2>","happy":0,"health":0,"smarts":0,"looks":0,"money":0,"fame":0},' +
              '{"label":"<choice 3, mischievous>","happy":0,"health":0,"smarts":0,"looks":0,"money":0,"fame":0}]}\n' +
              EVENT_PREFILL }
          ], 600, 0.5);
          ev = sanitizeEvent(extractJson(EVENT_PREFILL + (retryTxt || "")));
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
        ], 200, 0.7);
      } catch (e) { return json({ error: "ai unavailable", detail: String(e.message || e).slice(0, 200) }, 502); }
      var d2 = extractJson(aiTxt2 || "");
      var text = d2 && typeof d2.text === "string" ? clean(d2.text, 300) : "";
      if (text.length < 10) {
        // prose fallback: model ignored the JSON instruction; use raw text as-is
        var prose = clean(aiTxt2, 300);
        if (prose.length >= 10 && prose.charAt(0) !== '{') text = prose;
      }
      if (text.length < 10) return json({ error: "bad generation", raw: String(aiTxt2 || "").slice(0, 400) }, 502);
      return json({ text: text, ai: true });
    }

    return new Response("not found", { status: 404, headers: cors() });
  }
};
