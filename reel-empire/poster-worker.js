/* Reel Empire AI posters — Cloudflare Worker.
 *
 * Bindings required:
 *   AI    -> Workers AI binding
 *   STORE -> KV namespace (poster cache)
 *
 *   POST /poster   {title, genre, year} -> {status:"ready"|"pending", key, url?}
 *   GET  /status?key=<key>              -> {status:"ready"|"pending", url?}
 *   GET  /img/<key>                     -> image bytes (cached 1yr, immutable)
 *   GET  /                              -> health check
 *
 * Posters are generated once per unique film and cached in KV forever.
 * Daily generation cap keeps Workers AI usage trivial.
 */

var ORIGIN = "https://s6ggrpgrzf-droid.github.io";
var MODEL = "@cf/black-forest-labs/flux-1-schnell";
var DAILY_CAP = 120;

var GENRE_ART = {
  western: "dusty frontier town at sunset, lone rider silhouette, desert mesas",
  drama: "rainy city street at night, lone figure with umbrella, moody and quiet",
  comedy: "bright confetti celebration, laughing crowd, vibrant joyful colors",
  musical: "grand theater stage, sweeping spotlight beams, dancers in motion",
  romance: "couple embracing on a balcony at dusk, soft golden light, roses",
  horror: "haunted victorian house on a hill, full moon, dead trees, thick fog",
  thriller: "shadowy figure in a trenchcoat under a streetlamp, venetian blind shadows",
  action: "massive explosion fireball behind a speeding car, heroic silhouette",
  scifi: "ringed planet over an alien horizon, starship silhouette, purple nebula",
  fantasy: "majestic castle floating among clouds, dragons circling, magic glow",
  animation: "whimsical candy landscape, colorful hot-air balloons, playful",
  superhero: "caped hero soaring above a city skyline at dawn, dramatic clouds"
};

var ERA_STYLE = {
  golden: "hand-painted 1950s technicolor movie poster style, warm and rich",
  gritty: "1970s gritty high-contrast film poster, heavy grain, dramatic",
  neon: "1980s glossy airbrush movie poster, neon glow",
  minimal: "modern minimalist streaming key art, stark bold composition"
};

function eraOf(year) {
  if (!year || year < 1968) return "golden";
  if (year < 1990) return "gritty";
  if (year < 2010) return "neon";
  return "minimal";
}

function promptFor(title, genre, year) {
  var art = GENRE_ART[genre] || GENRE_ART.drama;
  return "Movie poster key art, absolutely no text, no words, no letters, no watermark, no signature: " +
    art + ". " + ERA_STYLE[eraOf(year)] +
    ". Dramatic cinematic lighting, rich color, professional film key art, vertical composition.";
}

async function keyFor(title, genre, year) {
  var raw = String(title) + "|" + String(genre) + "|" + String(year || 0);
  var d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  var hex = Array.prototype.map.call(new Uint8Array(d), function (b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
  return "p/" + hex.slice(0, 16) + ".png";
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

function b64ToBuf(b64) {
  var comma = b64.indexOf(",");
  if (comma >= 0) b64 = b64.slice(comma + 1);
  var bin = atob(b64);
  var arr = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

/* Workers AI image models answer in different shapes: {image: base64},
   {result:{image: base64}}, raw binary, or a stream. Normalize to bytes. */
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
    if (!(await underCap(env))) { console.log("poster gen: daily cap reached"); return; }
    var out = await env.AI.run(MODEL, { prompt: prompt });
    var buf = await imageBytes(out);
    if (!buf || buf.byteLength < 1024) {
      console.log("poster gen: bad image bytes " + (buf ? buf.byteLength : "null"));
      return;
    }
    var bytes = new Uint8Array(buf);
    var ctype = (bytes[0] === 0xFF && bytes[1] === 0xD8) ? "image/jpeg" : "image/png";
    await env.STORE.put(key, buf, { metadata: { contentType: ctype } });
    await bumpCap(env);
    console.log("poster gen: stored " + key + " (" + buf.byteLength + " bytes)");
  } catch (e) {
    console.log("poster gen failed: " + (e && e.message ? e.message : e));
  }
}

export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }

    if (url.pathname === "/" && request.method === "GET") {
      return json({ ok: true, service: "reel-empire-posters" });
    }

    if (url.pathname === "/poster" && request.method === "POST") {
      var body;
      try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
      var title = String(body.title || "").slice(0, 80);
      var genre = String(body.genre || "drama").slice(0, 20);
      var year = parseInt(body.year, 10) || 0;
      if (!title) return json({ error: "title required" }, 400);
      var key = await keyFor(title, genre, year);
      var hit = await env.STORE.get(key, { type: "arrayBuffer" });
      if (hit) return json({ status: "ready", key: key, url: "/img/" + key });
      ctx.waitUntil(generateAndStore(env, key, promptFor(title, genre, year)));
      return json({ status: "pending", key: key }, 202);
    }

    if (url.pathname === "/status" && request.method === "GET") {
      var skey = url.searchParams.get("key") || "";
      if (!/^p\/[0-9a-f]{16}\.png$/.test(skey)) return json({ error: "bad key" }, 400);
      var shit = await env.STORE.get(skey, { type: "arrayBuffer" });
      if (shit) return json({ status: "ready", key: skey, url: "/img/" + skey });
      return json({ status: "pending", key: skey });
    }

    if (url.pathname.indexOf("/img/p/") === 0 && request.method === "GET") {
      var ikey = url.pathname.slice(5); // strip "/img/"
      if (!/^p\/[0-9a-f]{16}\.png$/.test(ikey)) return new Response("bad key", { status: 400, headers: cors() });
      var res = await env.STORE.getWithMetadata(ikey, { type: "arrayBuffer" });
      if (!res || !res.value) return new Response("not found", { status: 404, headers: cors() });
      var ctype = (res.metadata && res.metadata.contentType) || "image/png";
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
