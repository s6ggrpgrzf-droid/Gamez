/* Pdawg Puzzles AI art — Cloudflare Worker.
 *
 * Bindings required:
 *   AI    -> Workers AI binding
 *   STORE -> KV namespace (image cache)
 *
 *   POST /generate  {prompt}            -> {status:"ready"|"pending", key, url?}
 *   GET  /status?key=<key>              -> {status:"ready"|"pending", url?}
 *   GET  /img/<key>                     -> image bytes (cached 1yr, immutable)
 *   GET  /daily?date=YYYY-MM-DD         -> {status, key, url, theme} (same image worldwide)
 *   GET  /                              -> health check
 *
 * Images are generated once per unique prompt and cached in KV forever.
 * The daily image is deterministic per date so every player gets the same one.
 */

var ORIGIN = "https://s6ggrpgrzf-droid.github.io";
var MODEL = "@cf/black-forest-labs/flux-1-schnell";
var DAILY_CAP = 150;
var IP_HOURLY_CAP = 12;

var DAILY_THEMES = [
  "cozy mountain cabin at dusk with warm glowing windows, pine forest, snow",
  "vibrant coral reef with sea turtles, clownfish and sun rays through water",
  "steampunk airship city floating above the clouds at sunset",
  "enchanted forest with giant glowing mushrooms and fireflies at night",
  "busy farmer's market with colorful fruit stalls and striped awnings",
  "majestic lighthouse on rocky cliffs with crashing waves and seagulls",
  "hot air balloons drifting over patchwork countryside fields",
  "sleepy coastal village with pastel houses and fishing boats at dawn",
  "dragon curled around a treasure hoard in a crystal cavern",
  "autumn park with red maple trees, a stone bridge and koi pond",
  "neon-lit tokyo street at night in the rain with umbrellas",
  "desert oasis with palm trees, camels and a caravan at golden hour",
  "whimsical candy village with lollipop trees and gumdrop houses",
  "snowy owl perched on a pine branch under northern lights",
  "vintage train crossing a mountain viaduct with eagles soaring",
  "underwater mermaid garden with seahorses and glowing jellyfish",
  "sunflower field with a red barn and windmill under big sky",
  "pirate cove with tall ships, treasure chest and parrots",
  "cherry blossom festival with lanterns and a pagoda",
  "space station orbiting a ringed planet with astronaut spacewalk",
  "alpaca farm in the andes mountains with rainbow",
  "medieval castle tournament with knights, banners and horses",
  "tropical waterfall with toucans and orchids",
  "cozy bookstore interior with ladders, lamps and a sleeping cat",
  "venetian canal with gondolas, bridges and carnival masks",
  "arctic fox family in falling snow among icebergs",
  "safari sunset with elephants, giraffes and acacia trees",
  "great dane dogs playing in a wildflower meadow",
  "halloween pumpkin patch with friendly ghosts and a full moon",
  "christmas market with carousel, snow and twinkling lights"
];

function artPrompt(theme) {
  return "Detailed vibrant illustration for a jigsaw puzzle, absolutely no text, no words, " +
    "no letters, no watermark, no signature: " + theme +
    ". Rich saturated colors, lots of distinct regions and fine detail, " +
    "painterly, high contrast, landscape composition.";
}

function cleanPrompt(s) {
  s = String(s || "").replace(/[\r\n\t]+/g, " ").replace(/[<>\"'\\]/g, "").trim().slice(0, 140);
  return s;
}

async function keyFor(prefix, raw) {
  var d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  var hex = Array.prototype.map.call(new Uint8Array(d), function (b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
  return prefix + "/" + hex.slice(0, 16) + ".jpg";
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

function todayStr() { return new Date().toISOString().slice(0, 10); }

async function underCap(env) {
  var raw = await env.STORE.get("stats/" + todayStr());
  var n = 0;
  if (raw) { try { n = JSON.parse(raw).count || 0; } catch (e) {} }
  return n < DAILY_CAP;
}

async function bumpCap(env) {
  var k = "stats/" + todayStr();
  var raw = await env.STORE.get(k);
  var n = 0;
  if (raw) { try { n = JSON.parse(raw).count || 0; } catch (e) {} }
  await env.STORE.put(k, JSON.stringify({ count: n + 1 }), { expirationTtl: 172800 });
}

async function ipAllowed(env, ip) {
  if (!ip) return true;
  var k = "ip/" + todayStr() + "/" + ip.replace(/[^0-9a-fA-F.:]/g, "").slice(0, 45);
  var raw = await env.STORE.get(k);
  var n = raw ? (parseInt(raw, 10) || 0) : 0;
  if (n >= IP_HOURLY_CAP) return false;
  await env.STORE.put(k, String(n + 1), { expirationTtl: 86400 });
  return true;
}

function b64ToBuf(b64) {
  var comma = b64.indexOf(",");
  if (comma >= 0) b64 = b64.slice(comma + 1);
  var bin = atob(b64);
  var arr = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

async function imageBytes(out) {
  if (!out) return null;
  var b64 = null;
  if (typeof out === "object") {
    if (typeof out.image === "string" && out.image.length > 100) b64 = out.image;
    else if (out.result && typeof out.result.image === "string" && out.result.image.length > 100) b64 = out.result.image;
  }
  if (b64) {
    try { return b64ToBuf(b64); } catch (e) { return null; }
  }
  try { return await new Response(out).arrayBuffer(); }
  catch (e) { return null; }
}

async function generateAndStore(env, key, prompt) {
  try {
    if (!(await underCap(env))) { console.log("jigsaw-ai: daily cap reached"); return; }
    var out = await env.AI.run(MODEL, { prompt: prompt });
    var buf = await imageBytes(out);
    if (!buf || buf.byteLength < 1024) {
      console.log("jigsaw-ai: bad image bytes " + (buf ? buf.byteLength : "null"));
      return;
    }
    var bytes = new Uint8Array(buf);
    var ctype = (bytes[0] === 0xFF && bytes[1] === 0xD8) ? "image/jpeg" : "image/png";
    await env.STORE.put(key, buf, { metadata: { contentType: ctype } });
    await bumpCap(env);
    console.log("jigsaw-ai: stored " + key + " (" + buf.byteLength + " bytes)");
  } catch (e) {
    console.log("jigsaw-ai gen failed: " + (e && e.message ? e.message : e));
  }
}

function dailyTheme(dateStr) {
  var n = 0;
  for (var i = 0; i < dateStr.length; i++) n = (n * 31 + dateStr.charCodeAt(i)) >>> 0;
  return DAILY_THEMES[n % DAILY_THEMES.length];
}

export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }

    if (url.pathname === "/" && request.method === "GET") {
      return json({ ok: true, service: "jigsaw-ai" });
    }

    /* ---- custom prompt generation ---- */
    if (url.pathname === "/generate" && request.method === "POST") {
      var ip = request.headers.get("CF-Connecting-IP") || "";
      if (!(await ipAllowed(env, ip))) return json({ error: "hourly limit reached, try again later" }, 429);
      var body;
      try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
      var prompt = cleanPrompt(body.prompt);
      if (prompt.length < 3) return json({ error: "prompt too short" }, 400);
      var key = await keyFor("j", "jigsaw|" + prompt.toLowerCase());
      var hit = await env.STORE.get(key, { type: "arrayBuffer" });
      if (hit) return json({ status: "ready", key: key, url: "/img/" + key });
      ctx.waitUntil(generateAndStore(env, key, artPrompt(prompt)));
      return json({ status: "pending", key: key }, 202);
    }

    /* ---- global daily image ---- */
    if (url.pathname === "/daily" && request.method === "GET") {
      var date = (url.searchParams.get("date") || todayStr()).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "bad date" }, 400);
      var theme = dailyTheme(date);
      var dkey = await keyFor("d", "jigsaw-daily|" + date + "|" + theme);
      var dhit = await env.STORE.get(dkey, { type: "arrayBuffer" });
      if (dhit) return json({ status: "ready", key: dkey, url: "/img/" + dkey, theme: theme, date: date });
      ctx.waitUntil(generateAndStore(env, dkey, artPrompt(theme)));
      return json({ status: "pending", key: dkey, theme: theme, date: date }, 202);
    }

    if (url.pathname === "/status" && request.method === "GET") {
      var skey = url.searchParams.get("key") || "";
      if (!/^[jd]\/[0-9a-f]{16}\.jpg$/.test(skey)) return json({ error: "bad key" }, 400);
      var shit = await env.STORE.get(skey, { type: "arrayBuffer" });
      if (shit) return json({ status: "ready", key: skey, url: "/img/" + skey });
      return json({ status: "pending", key: skey });
    }

    if (url.pathname.indexOf("/img/") === 0 && request.method === "GET") {
      var ikey = url.pathname.slice(5); // strip "/img/"
      if (!/^[jd]\/[0-9a-f]{16}\.jpg$/.test(ikey)) return new Response("bad key", { status: 400, headers: cors() });
      var res = await env.STORE.getWithMetadata(ikey, { type: "arrayBuffer" });
      if (!res || !res.value) return new Response("not found", { status: 404, headers: cors() });
      var ctype = (res.metadata && res.metadata.contentType) || "image/jpeg";
      return new Response(res.value, {
        headers: cors({
          "Content-Type": ctype,
          "Cache-Control": "public, max-age=31536000, immutable"
        })
      });
    }

    return new Response("not found", { status: 404, headers: cors() });
  }
};
