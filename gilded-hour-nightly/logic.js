/* The Gilded Hour — tonight's special question (Pass 5, bank-pick
 * rework). Pure logic, no Cloudflare APIs: takes an env-like
 * { CACHE, STERLING } and a date, returns { status, data }.
 * worker.js is the thin wrapper.
 *
 * The special question is PICKED FROM THE HAND-AUTHORED BANK
 * (bank.js, a faithful copy of the game's questions.js) — never
 * generated. The first live AI-generated question was factually
 * confabulated (an invented ad campaign), and no schema check can
 * verify truth, so at the owner's decision the model no longer
 * writes questions. Sterling (the AI worker) still writes the
 * intro line; the question itself is guaranteed true because a
 * person wrote and fact-checked it.
 *
 * The pick: the eligible pool (ordinary questions only — kind
 * absent or "normal"; the num and survey entries are never
 * specials) is shuffled ONCE with a fixed seed (mulberry32, seed
 * below), so the order is identical on every deploy and machine.
 * The date's index into that shuffled order is its UTC day number
 * (days since the Unix epoch) modulo the pool size. Same date ->
 * same question for everyone; consecutive dates walk the shuffled
 * pool one step at a time, so the whole pool is dealt before any
 * question repeats.
 *
 * The picked entry is normalized to the response schema
 * { q, a: [4 strings], correct, cat, diff, why, kind: 'normal' }:
 * the game's own entries store the correct answer in `a` and the
 * three wrong ones in `w`, so the four are shuffled here with a
 * date-seeded mulberry32 (the correct index must not sit at 0
 * every night) — deterministically, so everyone gets the same
 * arrangement.
 *
 * The pair { question, intro } is cached in KV under
 * "nightly:v2:<date>". The v2 key orphans the one night's v1
 * cache entry (which held the confabulated generated question):
 * it is simply never read again. A cache hit returns the pair
 * without a Sterling call.
 *
 * The intro is asked of the Sterling worker over its service
 * binding (kind "nightly_intro"); if the binding is missing or
 * fails, an authored intro line stands in, and the pair is cached
 * together. Nothing here is load-bearing: in the worst case the
 * defensive { question: null, intro: null } remains, and the
 * client deals an ordinary question instead.
 */
import { BANK } from './bank.js';

export const CATEGORIES = [
  'Movies', 'TV', 'Music', 'Ads & Jingles', 'Toys & Games',
  'Saturday Morning', 'The Dial-Up Years',
];

/* mulberry32: a tiny seeded PRNG. Same seed -> same stream, on
 * every machine, forever. That is the whole determinism story. */
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* The fixed seed for the one-time pool shuffle. Changing it
 * re-deals the entire nightly rotation — don't, unless the bank
 * changes enough to deserve a fresh walk. */
const POOL_SEED = 0x9E3779B9;

/* Ordinary questions only: kind absent or 'normal'. The guess
 * kinds (num, survey) are dealt by the show's own guess slots and
 * are never the nightly special. */
export const ELIGIBLE_POOL = BANK.filter((e) => e && (e.kind == null || e.kind === 'normal'));

const SHUFFLED_POOL = (() => {
  const arr = ELIGIBLE_POOL.slice();
  const rand = mulberry32(POOL_SEED);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
})();

export function eligiblePool() { return ELIGIBLE_POOL; }
export function shuffledPool() { return SHUFFLED_POOL; }

/* Days since the Unix epoch for a YYYY-MM-DD date (its UTC day
 * number). The pick index is this number modulo the pool size. */
export function dayNumberForDate(dateStr) {
  return Math.floor(Date.parse(dateStr + 'T00:00:00Z') / 86400000);
}

export function pickIndexForDate(dateStr, poolSize) {
  const size = poolSize == null ? SHUFFLED_POOL.length : poolSize;
  if (!size) return -1;
  const d = dayNumberForDate(dateStr);
  return ((d % size) + size) % size;
}

/* The raw bank entry tonight's special deals, or null for an
 * (impossible-with-the-real-bank) empty pool. `pool` defaults to
 * the shuffled eligible pool; the parameter exists so tests can
 * prove the empty-pool defence. */
export function pickEntryForDate(dateStr, pool) {
  const p = pool || SHUFFLED_POOL;
  if (!p || p.length === 0) return null;
  return p[pickIndexForDate(dateStr, p.length)];
}

/* Bank entry -> response question. The correct answer starts in
 * `a` with the wrong ones in `w`; the four are shuffled with a
 * date-seeded PRNG so the correct index varies by night but is
 * the same for everyone that night. */
export function normalizeEntry(entry, dateStr) {
  const opts = [{ t: entry.a, ok: true }]
    .concat((entry.w || []).map((w) => ({ t: w, ok: false })));
  const rand = mulberry32((dayNumberForDate(dateStr) ^ POOL_SEED) >>> 0);
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = opts[i]; opts[i] = opts[j]; opts[j] = tmp;
  }
  return {
    q: entry.q,
    a: opts.map((o) => o.t),
    correct: opts.findIndex((o) => o.ok),
    cat: entry.cat,
    diff: entry.diff,
    why: entry.why,
    kind: 'normal',
  };
}

export function pickForDate(dateStr) {
  const entry = pickEntryForDate(dateStr);
  return entry ? normalizeEntry(entry, dateStr) : null;
}

export function isValidDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(Date.parse(s + 'T00:00:00Z'));
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/* Today's date in America/Chicago (the show's home timezone). */
export function todayInChicago(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now || new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return get('year') + '-' + get('month') + '-' + get('day');
}

/* Authored intro, standing in whenever the Sterling worker cannot be
 * reached. In Sterling's voice, like all the fallbacks. */
export function authoredIntro(category) {
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
export async function askSterling(env, category, dateStr) {
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

export async function handleTonight(env, dateStr) {
  if (!isValidDateStr(dateStr)) {
    return { status: 400, data: { error: 'date must be YYYY-MM-DD.' } };
  }
  const key = 'nightly:v2:' + dateStr;

  if (env && env.CACHE && typeof env.CACHE.get === 'function') {
    try {
      const hit = await env.CACHE.get(key);
      if (typeof hit === 'string' && hit.trim()) {
        const parsed = JSON.parse(hit);
        if (parsed && parsed.question) return { status: 200, data: parsed };
      }
    } catch (e) { /* cache is an optimization, never a dependency */ }
  }

  const question = pickForDate(dateStr);
  if (!question) {
    // Defensive only — a bank pick cannot fail while the bank is
    // non-empty. Kept so the route can never 500: the client just
    // deals an ordinary question. Not cached.
    return { status: 200, data: { question: null, intro: null } };
  }

  const intro = await askSterling(env, question.cat, dateStr);
  const payload = { question, intro };

  if (env && env.CACHE && typeof env.CACHE.put === 'function') {
    try { await env.CACHE.put(key, JSON.stringify(payload)); } catch (e) { /* non-fatal */ }
  }
  return { status: 200, data: payload };
}
