/* Neon Depths AI art — Cloudflare Worker.
 *
 * Bindings required:
 *   AI    -> Workers AI binding
 *   STORE -> KV namespace (image cache)
 *
 *   GET /art/:name   -> {status:"ready"|"pending", url?}   name = key|abyss|victory
 *   GET /img/:name   -> image bytes (cached 1yr, immutable)
 *   GET /            -> health check
 *
 * Fixed prompts only — no user input. Each piece generates once and caches
 * forever. The game bakes the bytes in as data URIs; this worker is the
 * source/regeneration pipeline.
 */

var ORIGIN = "https://s6ggrpgrzf-droid.github.io";
var MODEL = "@cf/black-forest-labs/flux-1-schnell";

var PIECES = {
  key: "Game key art, square composition, absolutely no text, no words, no letters, no watermark: " +
    "a giant kraken with glowing violet tentacles rising from a dark ocean trench toward the viewer, " +
    "a tiny glowing pinball with a cyan light trail streaking past its eye, neon cyan and magenta " +
    "bioluminescence, drifting marine snow, dramatic painterly digital painting, rich color, high contrast",
  abyss: "Portrait-orientation cinematic illustration, absolutely no text, no words, no letters, no watermark: " +
    "a vast dark ocean abyss, a colossal kraken silhouette with two glowing amber eyes looming in the deep distance, " +
    "faint teal god-rays fading from above into blackness, tiny jellyfish and marine snow drifting, " +
    "mysterious and beautiful, painterly digital painting, very dark overall",
  victory: "Painterly game victory art, absolutely no text, no words, no letters, no watermark: " +
    "a majestic kraken releasing a radiant glowing pearl from its tentacles toward the viewer, " +
    "an explosion of cyan and gold bioluminescent light in the dark deep sea, " +
    "triumphant celebratory mood, rich color, dramatic lighting"
};

var NAMES = ["key", "abyss", "victory"];

function cors(extra) {
  var h = {
    "Access-Control-Allow-Origin": ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
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
    var out = await env.AI.run(MODEL, { prompt: prompt });
    var buf = await imageBytes(out);
    if (!buf || buf.byteLength < 1024) {
      console.log("neon-depths-art: bad image bytes " + (buf ? buf.byteLength : "null"));
      return;
    }
    var bytes = new Uint8Array(buf);
    var ctype = (bytes[0] === 0xFF && bytes[1] === 0xD8) ? "image/jpeg" : "image/png";
    await env.STORE.put(key, buf, { metadata: { contentType: ctype } });
    console.log("neon-depths-art: stored " + key + " (" + buf.byteLength + " bytes)");
  } catch (e) {
    console.log("neon-depths-art gen failed: " + (e && e.message ? e.message : e));
  }
}

export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }

    if (url.pathname === "/" && request.method === "GET") {
      return json({ ok: true, service: "neon-depths-art", pieces: NAMES });
    }

    if (url.pathname.indexOf("/art/") === 0 && request.method === "GET") {
      var name = url.pathname.slice(5);
      if (NAMES.indexOf(name) < 0) return json({ error: "unknown piece" }, 400);
      var key = "art/" + name + ".jpg";
      var hit = await env.STORE.get(key, { type: "arrayBuffer" });
      if (hit) return json({ status: "ready", name: name, url: "/img/" + name });
      ctx.waitUntil(generateAndStore(env, key, PIECES[name]));
      return json({ status: "pending", name: name }, 202);
    }

    if (url.pathname.indexOf("/img/") === 0 && request.method === "GET") {
      var iname = url.pathname.slice(5);
      if (NAMES.indexOf(iname) < 0) return new Response("bad name", { status: 400, headers: cors() });
      var res = await env.STORE.getWithMetadata("art/" + iname + ".jpg", { type: "arrayBuffer" });
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
