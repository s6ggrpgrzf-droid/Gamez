/* ============================================================================
 * MATRON — AI facility voice for Dead Man's Corridor.
 * Single-file Cloudflare Worker. Jimmy deploys by pasting this into the
 * Cloudflare dashboard (no wrangler needed).
 *
 * MATRON is the cold PA voice of the haunted medical facility: she names
 * the sectors, reacts to the player's run, and justifies the daily twist
 * in-character. The game NEVER depends on this worker to be playable —
 * every response has a built-in local fallback client-side.
 *
 * DASHBOARD SETUP (do once):
 *  1. Cloudflare dashboard → Workers & Pages → Create → Create Worker.
 *     Name it exactly:  dead-corridor-matron
 *  2. Delete the starter code, paste this ENTIRE file, Save.
 *  3. Settings → Bindings → Add binding → choose "AI":
 *       Variable name:  ai
 *  4. Storage & databases → KV → Create a namespace named:  MATRON_KV
 *  5. Back in the worker → Settings → Bindings → Add binding →
 *     choose "KV Namespace":  Variable name: MATRON_KV → pick the namespace.
 *  6. Deploy. The public URL will be:
 *       https://dead-corridor-matron.<your-subdomain>.workers.dev
 *
 * ROUTES:
 *  GET /daily?date=YYYY-MM-DD   full MATRON pack for the date, KV-cached
 *                               (24h TTL). Same date = same pack for
 *                               everyone, all day. ONE AI call per day total.
 *  GET /health                   {"ok":true,"service":"dead-corridor-matron"}
 *
 * On any generation/validation failure the worker serves a static fallback
 * pack (marked "fallback":true, never cached). The game also carries its own
 * fallback, so MATRON is strictly additive flavor.
 * ========================================================================== */

'use strict';

/* Model order matches the proven unfold-roomwright worker: fp8 first, no
 * response_format (plain text + JSON extraction). */
var MODELS = [
  '@cf/meta/llama-3.1-8b-instruct-fp8',
  '@cf/mistral/mistral-7b-instruct-v0.2'
];
var MAX_TOKENS = 1500;

/* Mutators the game engine actually supports. The AI picks ONE id; params
 * are applied verbatim by the client, so unknown ids/params are rejected. */
var MUTATORS = {
  frenzy:  { foeSpeedMul: 1.15, scoreMul: 1.1 },
  drought: { magSize: 6,        scoreMul: 1.15 },
  glass:   { hp: 75,            scoreMul: 1.25 },
  echo:    { boltBonus: 1,      scoreMul: 1.1 }
};
var MUTATOR_IDS = Object.keys(MUTATORS);

/* ---------- tiny helpers ---------- */
function json(data, status, extraHeaders) {
  var h = {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'cache-control': 'no-store'
  };
  if (extraHeaders) for (var k in extraHeaders) h[k] = extraHeaders[k];
  return new Response(JSON.stringify(data), { status: status || 200, headers: h });
}
function getIP(req) {
  return req.headers.get('cf-connecting-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}
var buckets = new Map();
function rateLimited(ip, limitPerMin) {
  var now = Date.now(), b = buckets.get(ip);
  if (!b || now > b.reset) { b = { count: 0, reset: now + 60000 }; buckets.set(ip, b); }
  b.count++;
  if (buckets.size > 5000) buckets.clear();
  return b.count > limitPerMin;
}
function cleanStr(v, max) {
  if (typeof v !== 'string') return '';
  return v.replace(/[<>&"']/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/* ---------- static fallback pack (served on any failure, never cached) ---------- */
function fallbackPack(date) {
  return {
    date: date, fallback: true,
    sectors: [
      { name: 'SECTOR 1 — INTAKE', intro: 'Intake is open. Leave your courage at the door.', clear: 'Intake sterilized. You may proceed.' },
      { name: 'SECTOR 2 — WARDS', intro: 'The wards are restless tonight. Mind the patients.', clear: 'Wards quiet. For now.' },
      { name: 'SECTOR 3 — THE HEART', intro: 'You have reached the heart. It has been waiting.', clear: 'The heart is still. Remarkable.' }
    ],
    barks: {
      streak: ['Matron notes your efficiency. Do not let it go to your head.', 'Such precision. The facility approves.'],
      hurt: ['That looked painful. Shall I call someone?', 'Bleeding is discouraged in the corridors.'],
      novaReady: ['NOVA charge complete. Do try not to miss.'],
      nova: ['NOVA discharged. The walls felt that.'],
      lowAmmo: ['Your magazine is empty. Reload, quickly.'],
      brute: ['Attention: large patient loose in Sector 3.']
    },
    mutator: { id: 'frenzy', title: 'HEIGHTENED AGITATION', flavor: 'Sedatives wearing off. The patients are quicker today.', params: MUTATORS.frenzy },
    logs: [
      { sector: 1, text: 'Intake log: three admissions last night. None discharged.' },
      { sector: 2, text: 'Ward note: patient in 4B keeps humming. We let him.' },
      { sector: 2, text: 'Memo: stop calling it "the scratching". It hears you.' },
      { sector: 3, text: 'Final entry: the heart beats faster when it is hungry.' }
    ]
  };
}

/* ---------- pack validation (server-side, strict) ---------- */
function validPack(p) {
  if (!p || typeof p !== 'object') return false;
  if (!Array.isArray(p.sectors) || p.sectors.length !== 3) return false;
  for (var i = 0; i < 3; i++) {
    var s = p.sectors[i];
    if (!s || !cleanStr(s.name, 48) || !cleanStr(s.intro, 160) || !cleanStr(s.clear, 120)) return false;
  }
  var b = p.barks;
  if (!b || typeof b !== 'object') return false;
  var keys = ['streak', 'hurt', 'novaReady', 'nova', 'lowAmmo', 'brute'];
  for (var k = 0; k < keys.length; k++) {
    var arr = b[keys[k]];
    if (!Array.isArray(arr) || arr.length < 1 || arr.length > 3) return false;
    for (var j = 0; j < arr.length; j++) if (!cleanStr(arr[j], 140)) return false;
  }
  var m = p.mutator;
  if (!m || MUTATOR_IDS.indexOf(m.id) < 0) return false;
  if (!cleanStr(m.title, 48) || !cleanStr(m.flavor, 160)) return false;
  if (!Array.isArray(p.logs) || p.logs.length !== 4) return false;
  for (var l = 0; l < 4; l++) {
    if (!p.logs[l] || [1, 2, 3].indexOf(Number(p.logs[l].sector)) < 0 || !cleanStr(p.logs[l].text, 180)) return false;
  }
  return true;
}

function sanitizePack(p, date) {
  var out = { date: date, fallback: false, sectors: [], barks: {}, mutator: null, logs: [] };
  for (var i = 0; i < 3; i++) out.sectors.push({
    name: cleanStr(p.sectors[i].name, 48),
    intro: cleanStr(p.sectors[i].intro, 160),
    clear: cleanStr(p.sectors[i].clear, 120)
  });
  var keys = ['streak', 'hurt', 'novaReady', 'nova', 'lowAmmo', 'brute'];
  for (var k = 0; k < keys.length; k++)
    out.barks[keys[k]] = p.barks[keys[k]].map(function (t) { return cleanStr(t, 140); });
  out.mutator = {
    id: p.mutator.id,
    title: cleanStr(p.mutator.title, 48),
    flavor: cleanStr(p.mutator.flavor, 160),
    params: MUTATORS[p.mutator.id]   // params ALWAYS from our allowlist, never the AI
  };
  for (var l = 0; l < 4; l++)
    out.logs.push({ sector: Number(p.logs[l].sector), text: cleanStr(p.logs[l].text, 180) });
  return out;
}

/* ---------- generation ---------- */
function buildPrompt(date, seed) {
  var mid = MUTATOR_IDS[seed % MUTATOR_IDS.length];
  return 'You are MATRON, the cold, clinical PA voice of a haunted medical facility ' +
    'in a horror shooter game. You are dry, faintly menacing, never cruel, never graphic. ' +
    'No politics, no real people, no profanity. Output STRICT JSON only, no other text.\n\n' +
    'Write a content pack with exactly this shape:\n' +
    '{\n' +
    ' "sectors": [\n' +
    '   {"name":"SECTOR 1 — INTAKE","intro":"<one line, max 24 words, MATRON welcoming the player to intake>","clear":"<one line, max 18 words, MATRON noting intake is cleared>"},\n' +
    '   {"name":"SECTOR 2 — WARDS","intro":"<one line, max 24 words, the wards and their patients>","clear":"<one line, max 18 words>"},\n' +
    '   {"name":"SECTOR 3 — THE HEART","intro":"<one line, max 24 words, the beating heart of the facility>","clear":"<one line, max 18 words>"}\n' +
    ' ],\n' +
    ' "barks": {\n' +
    '   "streak": ["<2 dry remarks on a kill streak, max 20 words each>"],\n' +
    '   "hurt": ["<2 remarks when the player is hurt, max 20 words each>"],\n' +
    '   "novaReady": ["<1 line: the NOVA blast is charged, max 20 words>"],\n' +
    '   "nova": ["<1 line: reacting to the NOVA blast firing, max 20 words>"],\n' +
    '   "lowAmmo": ["<1 line: magazine empty, max 20 words>"],\n' +
    '   "brute": ["<1 line: warning that the huge Brute patient is loose, max 20 words>"]\n' +
    ' },\n' +
    ' "mutator": {"id":"' + mid + '","title":"<short clinical title for today\'s facility condition, max 6 words>","flavor":"<one MATRON line justifying it in-fiction, max 24 words>"},\n' +
    ' "logs": [\n' +
    '   {"sector":1,"text":"<found log, intake, max 26 words>"},\n' +
    '   {"sector":2,"text":"<found log, wards, max 26 words>"},\n' +
    '   {"sector":2,"text":"<found log, wards, max 26 words>"},\n' +
    '   {"sector":3,"text":"<found log, the heart, max 26 words>"}\n' +
    ' ]\n' +
    '}\n\n' +
    'Today is ' + date + '. Vary your wording from typical horror clichés. ' +
    'The mutator id MUST be exactly "' + mid + '". First person as MATRON ("I", "we").';
}

async function runAi(env, messages, maxTokens) {
  var lastErr = 'no models tried';
  for (var i = 0; i < MODELS.length; i++) {
    try {
      var params = { messages: messages, max_tokens: maxTokens, temperature: 0.9 };
      var r = await env.ai.run(MODELS[i], params);
      var txt = normText(r);
      if (txt) return txt;
      lastErr = 'empty response from ' + MODELS[i];
    } catch (e) {
      lastErr = MODELS[i] + ': ' + String((e && e.message) || e).slice(0, 120);
    }
  }
  throw new Error(lastErr);
}

function normText(r) {
  var x = r && r.response;
  if (typeof x === 'string') return x;
  if (x && typeof x === 'object') {
    try { return JSON.stringify(x); } catch (e) { return ''; }
  }
  return '';
}

function extractJson(txt) {
  var m = txt.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}

async function generatePack(env, date) {
  var seed = 0;
  for (var i = 0; i < date.length; i++) seed = (seed * 31 + date.charCodeAt(i)) >>> 0;
  var sys = 'You are MATRON, the cold clinical PA voice of a haunted medical facility. ' +
    'Dry, faintly menacing, never cruel, never graphic. No politics, no real people, no profanity. ' +
    'You output strict JSON only.';
  var txt = await runAi(env, [
    { role: 'system', content: sys },
    { role: 'user', content: buildPrompt(date, seed) }
  ], MAX_TOKENS);
  var p = extractJson(txt);
  if (!validPack(p)) throw new Error('pack failed validation');
  return sanitizePack(p, date);
}

/* ---------- router ---------- */
export default {
  async fetch(req, env, ctx) {
    var url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*' } });
    if (url.pathname === '/health' && req.method === 'GET')
      return json({ ok: true, service: 'dead-corridor-matron' });

    if (url.pathname === '/daily' && req.method === 'GET') {
      var date = url.searchParams.get('date') || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        var d = new Date();
        date = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
      }
      var key = 'matron:daily:' + date;
      try {
        var cached = await env.MATRON_KV.get(key, 'json');
        if (cached && validPack(cached))
          return json(cached, 200, { 'x-matron-cache': 'HIT' });
      } catch (e) { /* KV hiccup: fall through to generation */ }

      if (rateLimited(getIP(req), 20)) return json(fallbackPack(date), 200, { 'x-matron-cache': 'FALLBACK' });
      try {
        var pack = await generatePack(env, date);
        ctx.waitUntil(env.MATRON_KV.put(key, JSON.stringify(pack), { expirationTtl: 86400 }).catch(function () {}));
        return json(pack, 200, { 'x-matron-cache': 'MISS' });
      } catch (e) {
        console.error('[matron] generation failed:', String((e && e.message) || e).slice(0, 300));
        return json(fallbackPack(date), 200, { 'x-matron-cache': 'FALLBACK' });
      }
    }
    return json({ error: 'not found' }, 404);
  }
};
