/* Nightly worker test (Pass 5 bank-pick rework): the bank copy is
 * deep-compared against the game's own questions.js read at test
 * time; the day-number pick is proven deterministic, fully walking
 * the eligible pool, and never dealing a num/survey question; the
 * Sterling intro is used when reachable and replaced by the
 * authored intro when not; the KV cache lives under nightly:v2:.
 * No network, no AI anywhere — this worker no longer has one.
 * Run: node build-single.js && node test/test-nightly.js */
import fs from 'node:fs';
import {
  handleTonight, pickForDate, pickEntryForDate, pickIndexForDate,
  eligiblePool, shuffledPool, dayNumberForDate, todayInChicago, authoredIntro,
} from '../logic.js';
import { BANK } from '../bank.js';
import worker from '../worker.js';

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name, detail || ''); }
}

function deepEqual(x, y) {
  if (x === y) return true;
  if (typeof x !== 'object' || typeof y !== 'object' || !x || !y) return false;
  const kx = Object.keys(x), ky = Object.keys(y);
  if (kx.length !== ky.length) return false;
  return kx.every((k) => Object.prototype.hasOwnProperty.call(y, k) && deepEqual(x[k], y[k]));
}

class MapKV {
  constructor() { this.map = new Map(); }
  async get(k) { return this.map.has(k) ? this.map.get(k) : null; }
  async put(k, v) { this.map.set(k, String(v)); }
}

function sterlingStub(line) {
  const stub = {
    calls: 0,
    lastBody: null,
    async fetch(url, init) {
      stub.calls++;
      stub.lastBody = init && init.body ? JSON.parse(init.body) : null;
      return { status: 200, json: async () => ({ line }) };
    },
  };
  return stub;
}

function addDays(dateStr, n) {
  return new Date(Date.parse(dateStr + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}

const DATE = '2026-11-08';

async function main() {
  // ---- 1. bank integrity: the worker's copy vs the game's file ----
  {
    const gameSrc = fs.readFileSync(new URL('../../gilded-hour/questions.js', import.meta.url), 'utf8');
    const win = {};
    new Function('window', gameSrc)(win);
    const gameBank = win.GH_BANK;
    ok(Array.isArray(gameBank) && gameBank.length === 102, 'the game bank has 102 entries', 'len=' + (gameBank && gameBank.length));
    ok(BANK.length === 102, "the worker's bank.js has 102 entries", 'len=' + BANK.length);
    ok(deepEqual(BANK, gameBank), "bank.js deep-equals the game's bank (same order, same fields, same values)");
    // Spot checks, named and exact.
    ok(BANK[0].q === 'In Forrest Gump, Forrest says life is like a box of what?'
      && BANK[0].a === 'Chocolates' && deepEqual(BANK[0].w, ['Crayons', 'Roses', 'Letters'])
      && BANK[0].cat === 'Movies' && BANK[0].diff === 'easy',
      'spot check: entry 0 is the Forrest Gump question', JSON.stringify(BANK[0]).slice(0, 100));
    const numEntry = BANK.find((e) => e.kind === 'num');
    ok(!!numEntry && typeof numEntry.num === 'number' && !('a' in numEntry) && !('w' in numEntry) && typeof numEntry.q === 'string',
      'spot check: a num entry carries {q, num, why} and no a/w', JSON.stringify(numEntry).slice(0, 100));
    const surveyEntry = BANK.find((e) => e.kind === 'survey' && e.cat === 'Saturday Morning');
    ok(!!surveyEntry && surveyEntry.a === 'Scooby-Doo' && Array.isArray(surveyEntry.w) && surveyEntry.w.length === 3,
      'spot check: the Saturday Morning survey entry keys Scooby-Doo', JSON.stringify(surveyEntry).slice(0, 100));
    const kinds = { normal: 0, num: 0, survey: 0 };
    for (const e of BANK) kinds[e.kind === 'num' ? 'num' : e.kind === 'survey' ? 'survey' : 'normal']++;
    ok(kinds.normal === 84 && kinds.num === 9 && kinds.survey === 9,
      'kind distribution is 84 normal / 9 num / 9 survey', JSON.stringify(kinds));
    const pool = eligiblePool();
    ok(pool.length === 84, 'the eligible pool is exactly the 84 ordinary questions', 'len=' + pool.length);
    ok(pool.every((e) => typeof e.a === 'string' && Array.isArray(e.w) && e.w.length === 3),
      'every eligible entry has a correct string and three wrong answers');
    ok(shuffledPool().length === 84 && shuffledPool() !== pool
      && deepEqual(shuffledPool().slice().sort((x, y) => BANK.indexOf(x) - BANK.indexOf(y)), pool),
      'the shuffled pool is a permutation of the eligible pool');
  }

  // ---- 2. the pick: shape, passthrough, answer arrangement ----
  {
    const entry = pickEntryForDate(DATE);
    const q = pickForDate(DATE);
    ok(!!entry && !!q, 'a pick exists for ' + DATE);
    ok(q.q === entry.q && q.cat === entry.cat && q.diff === entry.diff && q.why === entry.why && q.kind === 'normal',
      'the response question passes q/cat/diff/why through and is kind normal');
    ok(Array.isArray(q.a) && q.a.length === 4
      && deepEqual(q.a.slice().sort(), [entry.a].concat(entry.w).sort()),
      'the four answers are exactly the bank entry\'s correct + three wrong');
    ok(q.a[q.correct] === entry.a, 'the correct index points at the bank\'s correct answer');
    ok(deepEqual(pickForDate(DATE), q), 'pickForDate is deterministic for the same date');
  }

  // ---- 3. adjacent dates follow the day-number rule ----
  {
    const i0 = pickIndexForDate(DATE);
    const i1 = pickIndexForDate(addDays(DATE, 1));
    ok(i1 === (i0 + 1) % 84, 'the next date picks the next slot in the shuffled pool', i0 + ' -> ' + i1);
    ok(pickEntryForDate(addDays(DATE, 1)) === shuffledPool()[i1]
      && pickEntryForDate(addDays(DATE, 1)) !== pickEntryForDate(DATE),
      'adjacent dates deal adjacent (different) entries');
    ok(dayNumberForDate(DATE) === Math.floor(Date.UTC(2026, 10, 8) / 86400000),
      'dayNumberForDate is the UTC day number');
  }

  // ---- 4. reachability: 84 consecutive dates deal the whole pool ----
  {
    const idxSeen = new Set();
    const entrySeen = new Set();
    for (let n = 0; n < 84; n++) {
      const d = addDays(DATE, n);
      idxSeen.add(pickIndexForDate(d));
      entrySeen.add(pickEntryForDate(d));
    }
    ok(idxSeen.size === 84, '84 consecutive dates hit 84 distinct pool slots', 'seen=' + idxSeen.size);
    ok(entrySeen.size === 84, '84 consecutive dates deal 84 distinct questions', 'seen=' + entrySeen.size);
    ok(pickEntryForDate(addDays(DATE, 84)) === pickEntryForDate(DATE),
      'the 85th date repeats the 1st pick (the walk wraps the pool)');
  }

  // ---- 5. no guess kinds are ever dealt as specials ----
  {
    let allNormal = true;
    for (let n = 0; n < 200; n++) {
      const d = addDays(DATE, n);
      const e = pickEntryForDate(d);
      if (!e || (e.kind != null && e.kind !== 'normal') || pickForDate(d).kind !== 'normal') allNormal = false;
    }
    ok(allNormal, 'across 200 dates the special is never a num or survey question');
  }

  // ---- 6. empty-pool defence ----
  {
    ok(pickEntryForDate(DATE, []) === null, 'an empty pool picks null (defensive path stays)');
    ok(pickIndexForDate(DATE, 0) === -1, 'a zero-size pool has no index');
  }

  // ---- 7. happy path: bank pick + Sterling intro, cached under v2 ----
  {
    const kv = new MapKV();
    const sterling = sterlingStub('Sterling has been saving this one all day, and the wrapping is exquisite.');
    const env = { CACHE: kv, STERLING: sterling }; // note: no AI in env at all
    const expected = pickForDate(DATE);
    const r1 = await handleTonight(env, DATE);
    ok(r1.status === 200 && deepEqual(r1.data.question, expected), 'tonight deals the predicted bank pick', JSON.stringify(r1.data).slice(0, 140));
    ok(r1.data.intro.includes('wrapping is exquisite'), 'the intro came from the Sterling worker', r1.data.intro);
    ok(sterling.lastBody && sterling.lastBody.kind === 'nightly_intro' && sterling.lastBody.showKey === 'nightly:' + DATE
      && sterling.lastBody.category === expected.cat, 'Sterling was asked over the binding with the picked category', JSON.stringify(sterling.lastBody));
    ok(sterling.calls === 1, 'one Sterling call for the first request', 'calls=' + sterling.calls);
    ok(kv.map.has('nightly:v2:' + DATE), 'the pair is cached under the nightly:v2: key');
    ok(!kv.map.has('nightly:' + DATE), 'nothing is written under the old v1 key');
    const r2 = await handleTonight(env, DATE);
    ok(JSON.stringify(r2.data) === JSON.stringify(r1.data), 'the second /tonight returns the cached pair verbatim');
    ok(sterling.calls === 1, 'two /tonight calls cost exactly one Sterling call total (cache serves the second)', 'calls=' + sterling.calls);
  }

  // ---- 8. the v1 cache entry is orphaned, never read ----
  {
    const kv = new MapKV();
    await kv.put('nightly:' + DATE, JSON.stringify({ question: { q: 'CONFABULATED — must never be served' }, intro: 'stale' }));
    const sterling = sterlingStub('A fresh intro for a true question.');
    const r = await handleTonight({ CACHE: kv, STERLING: sterling }, DATE);
    ok(r.data.question && r.data.question.q === pickForDate(DATE).q,
      'a stale v1 cache entry is ignored — the bank pick is served instead', JSON.stringify(r.data).slice(0, 120));
  }

  // ---- 9. cache hit needs no Sterling call at all ----
  {
    const kv = new MapKV();
    const stored = { question: pickForDate(DATE), intro: 'A previously stored intro.' };
    await kv.put('nightly:v2:' + DATE, JSON.stringify(stored));
    let calls = 0;
    const counting = { async fetch() { calls++; throw new Error('must not be called'); } };
    const r = await handleTonight({ CACHE: kv, STERLING: counting }, DATE);
    ok(deepEqual(r.data, stored) && calls === 0, 'a v2 cache hit returns the pair with zero Sterling calls', 'calls=' + calls);
  }

  // ---- 10. Sterling fails or is missing -> authored intro, still cached ----
  {
    const kv = new MapKV();
    const badSterling = { calls: 0, async fetch() { this.calls++; throw new Error('binding down'); } };
    const r1 = await handleTonight({ CACHE: kv, STERLING: badSterling }, DATE);
    ok(r1.data.question && r1.data.intro === authoredIntro(r1.data.question.cat),
      'a failing Sterling binding lands on the authored intro', r1.data.intro);
    const r2 = await handleTonight({ CACHE: kv, STERLING: badSterling }, DATE);
    ok(r2.data.intro === r1.data.intro && badSterling.calls === 1,
      'pick + authored intro are cached together (one attempt total)', 'calls=' + badSterling.calls);
    const r3 = await handleTonight({ CACHE: new MapKV() }, DATE);
    ok(r3.data.intro === authoredIntro(r3.data.question.cat), 'a missing STERLING binding lands on the authored intro', r3.data.intro);
    const r4 = await handleTonight({}, DATE);
    ok(r4.status === 200 && !!r4.data.question, 'no bindings at all still deals the pick (nothing is load-bearing)');
  }

  // ---- 11. Chicago date shape (unchanged behaviour) ----
  {
    ok(/^\d{4}-\d{2}-\d{2}$/.test(todayInChicago()), 'todayInChicago returns YYYY-MM-DD', todayInChicago());
    // 2026-11-09 02:00 UTC is still Nov 8 in Chicago (CST, UTC-6).
    ok(todayInChicago(new Date('2026-11-09T02:00:00Z')) === '2026-11-08', 'todayInChicago respects the Chicago date line', todayInChicago(new Date('2026-11-09T02:00:00Z')));
  }

  // ---- 12. worker wrapper: health, bad dates, tonight round-trip ----
  {
    const env = { CACHE: new MapKV(), STERLING: sterlingStub('Wrapped intro, at your service.') };
    const health = await worker.fetch(new Request('https://x/health'), env);
    ok(health.status === 200 && (await health.text()) === 'gilded-hour-nightly ok', 'GET /health answers the plain-text ok');
    const bad = await worker.fetch(new Request('https://x/tonight?date=November 9'), env);
    ok(bad.status === 400 && (await bad.json()).error, 'a malformed date is a 400 {error}');
    const badDay = await worker.fetch(new Request('https://x/tonight?date=2026-02-30'), env);
    ok(badDay.status === 400, 'an impossible calendar date is a 400');
    const good = await worker.fetch(new Request('https://x/tonight?date=' + DATE), env);
    const gj = await good.json();
    ok(good.status === 200 && gj.question.q === pickForDate(DATE).q && gj.intro.includes('at your service'),
      'GET /tonight round-trips through the wrapper', JSON.stringify(gj).slice(0, 120));
    const opt = await worker.fetch(new Request('https://x/tonight', { method: 'OPTIONS' }), env);
    ok(opt.status === 204, 'OPTIONS handled with 204');
  }

  // ---- 13. dist sanity: the single-file build carries the rework ----
  {
    const dist = fs.readFileSync(new URL('../dist/worker.js', import.meta.url), 'utf8');
    ok(dist.includes('nightly:v2:'), 'dist uses the nightly:v2: cache key');
    ok(dist.includes('mulberry32') && dist.includes('Forrest Gump'), 'dist inlines the seeded pick and the bank');
    ok(!dist.includes('AI.run') && !dist.includes('validateQuestion') && !dist.includes('llama'),
      'dist contains no AI generation code at all');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('TEST CRASH:', e); process.exit(1); });
