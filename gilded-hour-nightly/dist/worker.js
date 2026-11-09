/* The Gilded Hour — tonight's special question, single-file build.
 * Paste into the Cloudflare Workers dashboard editor, then add the
 * bindings in Settings (the dashboard cannot create them from code):
 *   Workers AI binding:   name AI
 *   KV namespace binding: name CACHE
 *   Service binding:      name STERLING -> gilded-hour-sterling
 * (or) deploy via Workers Builds / wrangler using the split sources
 * and wrangler.toml. */
'use strict';
/* The Gilded Hour — tonight's special question (Pass 5a).
 * Pure logic, no Cloudflare APIs: takes an env-like
 * { AI, CACHE, STERLING } and a date, returns { status, data }.
 * worker.js is the thin wrapper.
 *
 * One special question per date, generated once and cached in KV
 * under "nightly:<date>", then served verbatim to everyone. The
 * question is validated HARD against the bank schema (strict JSON,
 * four distinct answers, one correct index, a real show category, no
 * sports, ever). Validate -> one retry -> a designed null: if no
 * valid question can be produced, the answer is
 * { question: null, intro: null } and the client simply deals from
 * its bank. Nothing here is load-bearing.
 *
 * On success the intro line is asked of the Sterling worker over its
 * service binding (kind "nightly_intro"); if the binding is missing
 * or fails, an authored intro line stands in, and the pair is cached
 * together.
 */

const MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';

const CATEGORIES = [
  'Movies', 'TV', 'Music', 'Ads & Jingles', 'Toys & Games',
  'Saturday Morning', 'The Dial-Up Years',
];

const DIFFS = ['easy', 'med', 'hard'];

/* Sports stay out of this show (the bank removed its sports category
 * at the owner's word) — a generated question that touches sport is
 * rejected outright, however good it is otherwise. */
const SPORTS_TERMS = [
  'football', 'baseball', 'basketball', 'soccer', 'hockey', 'tennis',
  'golf', 'boxing', 'wrestling', 'olympic', 'olympics', 'nfl', 'nba',
  'mlb', 'nhl', 'super bowl', 'world series', 'world cup',
  'quarterback', 'touchdown', 'home run', 'slam dunk', 'stanley cup',
  'heavyweight', 'race car', 'nascar', 'formula one', 'marathon',
];

function mentionsSports(text) {
  const lower = ' ' + String(text).toLowerCase() + ' ';
  return SPORTS_TERMS.some((t) => lower.includes(t));
}

/* The reply text lives at result.response in one integration on this
 * account and at result.choices[0].message.content in another — check
 * both, defensively, every time. */
function extractAiText(result) {
  if (!result || typeof result !== 'object') return null;
  if (typeof result.response === 'string' && result.response.trim()) return result.response;
  try {
    const c = result.choices && result.choices[0] && result.choices[0].message;
    if (c && typeof c.content === 'string' && c.content.trim()) return c.content;
  } catch (e) { /* shape mismatch — fall through */ }
  return null;
}

/* Pull a JSON object out of a model reply: tolerates code fences and
 * surrounding chatter by taking the outermost braces. */
function extractJson(text) {
  if (typeof text !== 'string') return null;
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a === -1 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
}

/* HARD validation of a generated question against the bank schema.
 * Returns the normalized question { q, a, correct, cat, diff, why,
 * kind: 'normal' } or null. No partial credit. */
function validateQuestion(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.kind != null && raw.kind !== 'normal') return null;

  const q = typeof raw.q === 'string' ? raw.q.trim() : '';
  if (q.length < 10 || q.length > 160) return null;

  if (!Array.isArray(raw.a) || raw.a.length !== 4) return null;
  const a = raw.a.map((s) => (typeof s === 'string' ? s.trim() : ''));
  if (a.some((s) => !s || s.length > 60)) return null;
  if (new Set(a.map((s) => s.toLowerCase())).size !== 4) return null;

  if (!Number.isInteger(raw.correct) || raw.correct < 0 || raw.correct > 3) return null;
  if (!CATEGORIES.includes(raw.cat)) return null;
  if (!DIFFS.includes(raw.diff)) return null;

  const why = typeof raw.why === 'string' ? raw.why.trim() : '';
  if (!why || why.length > 140) return null;

  if (mentionsSports(q + ' ' + a.join(' ') + ' ' + why)) return null;

  return { q, a, correct: raw.correct, cat: raw.cat, diff: raw.diff, why, kind: 'normal' };
}

/* The evening's category rotates deterministically by date, so the
 * week walks the whole wheel and every room gets the same one. */
function categoryForDate(dateStr) {
  const days = Math.floor(Date.parse(dateStr + 'T00:00:00Z') / 86400000);
  const idx = ((days % CATEGORIES.length) + CATEGORIES.length) % CATEGORIES.length;
  return CATEGORIES[idx];
}

function isValidDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(Date.parse(s + 'T00:00:00Z'));
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/* Today's date in America/Chicago (the show's home timezone). */
function todayInChicago(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now || new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return get('year') + '-' + get('month') + '-' + get('day');
}

const QUESTION_SYSTEM = [
  'You are a trivia author for The Gilded Hour, a pop-culture trivia',
  'show for players aged 30 to 50 — people whose childhoods ran from',
  'the 1980s into the early 2000s. You write ONE original question.',
  'Answer with strict JSON only — no code fences, no commentary — in',
  'exactly this shape:',
  '{"q": string, "a": [four answer strings], "correct": integer 0-3,',
  '"cat": string, "diff": "easy"|"med"|"hard", "why": string}',
  'Rules: the question is 10-160 characters; the four answers are',
  'distinct, plausible, and each at most 60 characters; exactly one is',
  'correct and "correct" is its index; "why" is one friendly line, at',
  'most 140 characters, confirming the answer. The fact must be solid,',
  'mainstream pop culture of the era — the kind of thing a room of',
  'old friends would nod at, not an obscurity. Never write about',
  'sports. Never copy a famous existing question word for word.',
].join(' ');

function buildQuestionMessages(dateStr, category) {
  return [
    { role: 'system', content: QUESTION_SYSTEM },
    {
      role: 'user',
      content: 'Write tonight\'s special question (for ' + dateStr + ') in the category "'
        + category + '". Return only the JSON object.',
    },
  ];
}

/* Authored intro, standing in whenever the Sterling worker cannot be
 * reached. In Sterling's voice, like all the fallbacks. */
function authoredIntro(category) {
  return "Tonight's special question comes from " + category + ' — a fresh one, kept under glass until this very evening. Fingers ready, table.';
}

const INTRO_BANNED = ['shit', 'fuck', 'bitch', 'bastard', 'damn', 'hell', 'crap', 'sucks'];

function validateIntro(text) {
  if (typeof text !== 'string') return null;
  let t = text.trim();
  if (!t || t.length > 240) return null;
  if ((t.match(/\n/g) || []).length > 1) return null;
  t = t.replace(/\s*\n\s*/g, ' ');
  const lower = ' ' + t.toLowerCase().replace(/[^a-z\s]/g, ' ') + ' ';
  if (INTRO_BANNED.some((w) => lower.includes(' ' + w + ' '))) return null;
  if (/\bas an ai\b/i.test(t) || /language model/i.test(t)) return null;
  return t;
}

/* Ask the Sterling worker for the intro over the service binding.
 * Any failure — no binding, bad status, bad payload — lands on the
 * authored intro. Never throws. */
async function askSterling(env, category, dateStr) {
  const fallback = authoredIntro(category);
  if (!env || !env.STERLING || typeof env.STERLING.fetch !== 'function') return fallback;
  try {
    const res = await env.STERLING.fetch('https://gilded-hour-sterling/g', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'nightly_intro', showKey: 'nightly:' + dateStr, category }),
    });
    if (!res || (typeof res.status === 'number' && res.status !== 200)) return fallback;
    const data = typeof res.json === 'function' ? await res.json() : null;
    return validateIntro(data && data.line) || fallback;
  } catch (e) {
    return fallback;
  }
}

async function generateQuestion(env, dateStr) {
  if (!env || !env.AI || typeof env.AI.run !== 'function') return null;
  const messages = buildQuestionMessages(dateStr, categoryForDate(dateStr));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await env.AI.run(MODEL, { messages, temperature: 0.7, max_tokens: 400 });
      const q = validateQuestion(extractJson(extractAiText(result)));
      if (q) return q;
    } catch (e) { /* fall through to retry, then the designed null */ }
  }
  return null;
}

async function handleTonight(env, dateStr) {
  if (!isValidDateStr(dateStr)) {
    return { status: 400, data: { error: 'date must be YYYY-MM-DD.' } };
  }
  const key = 'nightly:' + dateStr;

  if (env && env.CACHE && typeof env.CACHE.get === 'function') {
    try {
      const hit = await env.CACHE.get(key);
      if (typeof hit === 'string' && hit.trim()) {
        const parsed = JSON.parse(hit);
        if (parsed && parsed.question) return { status: 200, data: parsed };
      }
    } catch (e) { /* cache is an optimization, never a dependency */ }
  }

  const question = await generateQuestion(env, dateStr);
  if (!question) {
    // A designed outcome, not an error: the client deals from its bank.
    // Deliberately NOT cached, so a later request can try again.
    return { status: 200, data: { question: null, intro: null } };
  }

  const intro = await askSterling(env, question.cat, dateStr);
  const payload = { question, intro };

  if (env && env.CACHE && typeof env.CACHE.put === 'function') {
    try { await env.CACHE.put(key, JSON.stringify(payload)); } catch (e) { /* non-fatal */ }
  }
  return { status: 200, data: payload };
}

/* The Gilded Hour — tonight's special question (Pass 5a).
 * Thin Worker wrapper around logic.js: routing, CORS, the date
 * default (today in America/Chicago), JSON out. All behaviour lives
 * in logic.js and is covered by test/test-nightly.js. Deploy:
 * `dist/worker.js` is the single-file build (dashboard paste), or
 * point wrangler / Workers Builds here.
 */

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { ...cors(), 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() });
    }
    if (url.pathname === '/health' || url.pathname === '/') {
      if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
      return new Response('gilded-hour-nightly ok', {
        status: 200,
        headers: { ...cors(), 'Content-Type': 'text/plain' },
      });
    }
    if (url.pathname === '/tonight') {
      if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
      const date = url.searchParams.get('date') || todayInChicago();
      if (!isValidDateStr(date)) return json({ error: 'date must be YYYY-MM-DD.' }, 400);
      const { status, data } = await handleTonight(env, date);
      return json(data, status);
    }
    return json({ error: 'Not found.' }, 404);
  },
};
