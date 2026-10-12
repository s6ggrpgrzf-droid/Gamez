/* Gamez Arcade backend — Cloudflare Worker.
 * One shared backend for all Gamez games: global leaderboards + daily seeds.
 *   STORE -> KV namespace (leaderboards, rate limits)
 *   POST /score   {game, board, name, score} -> {rank, top}
 *   GET  /scores?game=<id>&board=<id>        -> {top:[{name,score,when}]}
 *   GET  /daily?game=<id>                    -> {date, seed}
 *   GET  /                                   -> health check
 * Anti-spoofing: per-game score caps, per-IP rate limits, name sanitizing.
 * Boards keep top 50; only top 10 are ever returned.
 */
var ORIGIN = "https://s6ggrpgrzf-droid.github.io";
var GAMES = {
  "neon-void":    { cap: 50000000 },
  "candy-cascade":{ cap: 10000000 },
  "bubble-hex":   { cap: 10000000 },
  "maze-trace":   { cap: 1000000 },
  "bloom-defense":  { cap: 1000000 },
  "life-story":   { cap: 1000000000 },
  "reel-empire":  { cap: 1000000 },
  "pdawg": { cap: 7200 },
  "blood-moon": { cap: 10000000 },
    "word-well":    { cap: 100 },
  "tiny-fairway":  { cap: 3600 },
  "castaway-cove":  { cap: 1000000 },
  "neon-drift":     { cap: 1000000 },
  "dead-mans-hand": { cap: 50000 },
  "neon-depths":  { cap: 9999999999 },
  "dead-corridor": { cap: 1000000 },
  "poolball":     { cap: 1000000 },
};
var TOP_KEPT = 50;

var TOP_SERVED = 10;
var RL_MAX = 6;
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
function cleanName(s) {
  s = String(s == null ? "" : s).replace(/[<>&"']/g, "").trim().slice(0, 12);
  return s;
}
function cleanBoard(s) {
  return String(s == null ? "" : s).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "main";
}
function lbKey(game, board) { return "lb/" + game + "/" + board; }
async function getBoard(env, game, board) {
  var raw = await env.STORE.get(lbKey(game, board));
  if (!raw) return [];
  try {
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
async function checkRate(env, ip) {
  var now = Date.now();
  var k = "rl/" + ip + "/" + Math.floor(now / 60000);
  var raw = await env.STORE.get(k);
  var n = raw ? parseInt(raw, 10) || 0 : 0;
  if (n >= RL_MAX) return false;
  await env.STORE.put(k, String(n + 1), { expirationTtl: 90 });
  return true;
}
export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }
    if (url.pathname === "/" && request.method === "GET") {
      return json({ ok: true, service: "gamez-arcade" });
    }
    if (url.pathname === "/daily" && request.method === "GET") {
      var dgame = url.searchParams.get("game") || "";
      if (!GAMES[dgame]) return json({ error: "unknown game" }, 400);
      var date = new Date().toISOString().slice(0, 10);
      var raw = dgame + "|" + date;
      var dig = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
      var seed = new DataView(dig).getUint32(0, false);
      return json({ game: dgame, date: date, seed: seed });
    }
    if (url.pathname === "/scores" && request.method === "GET") {
      var sgame = url.searchParams.get("game") || "";
      if (!GAMES[sgame]) return json({ error: "unknown game" }, 400);
      var sboard = cleanBoard(url.searchParams.get("board"));
      var list = await getBoard(env, sgame, sboard);
      return json({
        game: sgame, board: sboard,
        top: list.slice(0, TOP_SERVED).map(function (e) {
          return { name: e.n, score: e.s, when: e.w };
        })
      });
    }
    if (url.pathname === "/score" && request.method === "POST") {
      var body;
      try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
      var game = String(body.game || "");
      if (!GAMES[game]) return json({ error: "unknown game" }, 400);
      var board = cleanBoard(body.board);
      var name = cleanName(body.name);
      var score = Math.floor(+body.score || 0);
      if (!name) return json({ error: "name required" }, 400);
      if (!(score > 0) || score > GAMES[game].cap) return json({ error: "bad score" }, 400);
      var ip = request.headers.get("CF-Connecting-IP") || "unknown";
      if (!(await checkRate(env, ip))) return json({ error: "slow down" }, 429);
      var list = await getBoard(env, game, board);
      var entry = { n: name, s: score, w: Date.now() };
      var rank = 0;
      var pos = 0;
      while (pos < list.length && list[pos].s >= score) pos++;
      if (pos < TOP_KEPT) {
        list.splice(pos, 0, entry);
        if (list.length > TOP_KEPT) list.length = TOP_KEPT;
        await env.STORE.put(lbKey(game, board), JSON.stringify(list));
        rank = pos + 1;
      }
      return json({
        rank: rank,
        top: list.slice(0, TOP_SERVED).map(function (e) {
          return { name: e.n, score: e.s, when: e.w };
        })
      });
    }
    return new Response("not found", { status: 404, headers: cors() });
  }
};
