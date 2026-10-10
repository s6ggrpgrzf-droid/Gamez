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
var MAX_TOKENS = 2500;

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
/* bark values may arrive as a string or an array; normalize to an array */
function barkArr(v) {
  if (Array.isArray(v)) return v.slice(0, 3);
  if (typeof v === 'string' && v.trim()) return [v];
  return null;
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

/* ---------- pack healing: every AI field is cleaned; any bad/missing field
 * falls back to the static line for THAT field only. The pack is valid by
 * construction, so one flaky line can never nuke the whole AI pack. ---------- */
function healPack(p, date) {
  var fb = fallbackPack(date);
  var out = { date: date, fallback: false, sectors: [], barks: {}, mutator: null, logs: [] };
  var ps = (p && Array.isArray(p.sectors)) ? p.sectors : [];
  for (var i = 0; i < 3; i++) {
    var sec = ps[i] || {};
    out.sectors.push({
      name: cleanStr(sec.name, 48) || fb.sectors[i].name,
      intro: cleanStr(sec.intro, 160) || fb.sectors[i].intro,
      clear: cleanStr(sec.clear, 120) || fb.sectors[i].clear
    });
  }
  var pb = (p && p.barks && typeof p.barks === 'object') ? p.barks : {};
  var keys = ['streak', 'hurt', 'novaReady', 'nova', 'lowAmmo', 'brute'];
  for (var k = 0; k < keys.length; k++) {
    var arr = barkArr(pb[keys[k]]) || [], cleaned = [];
    for (var j = 0; j < arr.length; j++) {
      var t = cleanStr(arr[j], 140);
      if (t) cleaned.push(t);
    }
    out.barks[keys[k]] = cleaned.length ? cleaned : fb.barks[keys[k]];
  }
  var pm = (p && p.mutator && typeof p.mutator === 'object') ? p.mutator : {};
  var mid = MUTATOR_IDS.indexOf(pm.id) >= 0 ? pm.id : fb.mutator.id;
  out.mutator = {
    id: mid,
    title: cleanStr(pm.title, 48) || fb.mutator.title,
    flavor: cleanStr(pm.flavor, 160) || fb.mutator.flavor,
    params: MUTATORS[mid]   /* params ALWAYS from our allowlist, never the AI */
  };
  var pl = (p && Array.isArray(p.logs)) ? p.logs : [];
  for (var l = 0; l < 4; l++) {
    var lg = pl[l] || {}, sn = Number(lg.sector);
    out.logs.push({
      sector: (sn === 1 || sn === 2 || sn === 3) ? sn : fb.logs[l].sector,
      text: cleanStr(lg.text, 180) || fb.logs[l].text
    });
  }
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
  var msgs = [
    { role: 'system', content: sys },
    { role: 'user', content: buildPrompt(date, seed) }
  ];
  var txt = await runAi(env, msgs, MAX_TOKENS);
  var p = extractJson(txt);
  if (!p) {
    /* one retry when the model returned no JSON at all; healPack handles the rest */
    txt = await runAi(env, msgs, MAX_TOKENS);
    p = extractJson(txt);
  }
  if (!p) throw new Error('no JSON from model');
  return healPack(p, date);
}

/* ---------- MATRON voice: server-synthesized speech (Workers AI TTS) ----------
 * The 4 key spoken lines are synthesized once per daily pack and cached in KV.
 * Voice is additive: any TTS failure leaves the text pack untouched. */
var TTS_MODEL = '@cf/deepgram/aura-1';
var TTS_SPEAKER = 'asteria';   /* cold female voice, fits the head-nurse */
var AUDIO_IDS = ['s0', 's1', 's2', 'mut'];

function audioLines(pack) {
  return [
    { id: 's0', text: pack.sectors[0].intro },
    { id: 's1', text: pack.sectors[1].intro },
    { id: 's2', text: pack.sectors[2].intro },
    { id: 'mut', text: pack.mutator.title + '. ' + pack.mutator.flavor }
  ];
}

async function synthLine(env, text) {
  try {
    var r = await env.ai.run(TTS_MODEL,
      { text: String(text).slice(0, 400), speaker: TTS_SPEAKER, encoding: 'mp3' },
      { returnRawResponse: true });
    var buf = null;
    if (r && typeof r.arrayBuffer === 'function') buf = await r.arrayBuffer();
    else if (r instanceof ArrayBuffer) buf = r;
    if (buf && buf.byteLength > 2000) return buf;
  } catch (e) { /* fall through: voice stays silent for this line */ }
  return null;
}

async function synthPackAudio(env, date, pack) {
  var audio = {};
  try {
    var lines = audioLines(pack);
    var bufs = await Promise.all(lines.map(function (l) { return synthLine(env, l.text); }));
    for (var i = 0; i < lines.length; i++) {
      if (!bufs[i]) continue;
      var key = 'a/' + date + '/' + lines[i].id;
      try { await env.MATRON_KV.put(key, bufs[i]); } catch (e) { continue; }
      audio[lines[i].id] = '/audio?date=' + date + '&line=' + lines[i].id;
    }
  } catch (e) { /* voice is additive; never fail the pack */ }
  return audio;
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
        if (cached && Array.isArray(cached.sectors) && cached.sectors.length === 3 && cached.mutator && MUTATOR_IDS.indexOf(cached.mutator.id) >= 0)
          return json(cached, 200, { 'x-matron-cache': 'HIT' });
      } catch (e) { /* KV hiccup: fall through to generation */ }

      if (rateLimited(getIP(req), 20)) return json(fallbackPack(date), 200, { 'x-matron-cache': 'FALLBACK' });
      try {
        var pack = await generatePack(env, date);
        pack.audio = await synthPackAudio(env, date, pack);
        ctx.waitUntil(env.MATRON_KV.put(key, JSON.stringify(pack), { expirationTtl: 86400 }).catch(function () {}));
        return json(pack, 200, { 'x-matron-cache': 'MISS' });
      } catch (e) {
        console.error('[matron] generation failed:', String((e && e.message) || e).slice(0, 300));
        return json(fallbackPack(date), 200, { 'x-matron-cache': 'FALLBACK' });
      }
    }
    if (url.pathname === '/audio' && req.method === 'GET') {
      var ad = url.searchParams.get('date') || '';
      var al = url.searchParams.get('line') || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ad) || AUDIO_IDS.indexOf(al) < 0)
        return json({ error: 'bad audio request' }, 400);
      try {
        var ab = await env.MATRON_KV.get('a/' + ad + '/' + al, 'arrayBuffer');
        if (!ab) return json({ error: 'no audio' }, 404);
        return new Response(ab, { headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'access-control-allow-origin': '*'
        }});
      } catch (e) { return json({ error: 'audio unavailable' }, 502); }
    }
    return json({ error: 'not found' }, 404);
  }
};
