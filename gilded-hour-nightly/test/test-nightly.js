/* Nightly worker test: stub AI (good / malformed / sports / throwing),
 * an in-memory KV, and STERLING service-binding stubs (good / failing /
 * missing). No network. Proves: /tonight twice costs exactly one
 * generation, hard validation rejects bad questions, a failure returns
 * the designed {question:null, intro:null}, and the Sterling intro is
 * used when reachable and replaced by the authored intro when not.
 * Run: node test/test-nightly.js */
import { handleTonight, validateQuestion, categoryForDate, todayInChicago, authoredIntro } from '../logic.js';
import worker from '../worker.js';

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name, detail || ''); }
}

class MapKV {
  constructor() { this.map = new Map(); }
  async get(k) { return this.map.has(k) ? this.map.get(k) : null; }
  async put(k, v) { this.map.set(k, String(v)); }
}

function aiStub(handler) {
  const stub = {
    calls: 0,
    async run(model, opts) { stub.calls++; return handler(stub.calls, model, opts); },
  };
  return stub;
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

const GOOD_Q = {
  q: 'Which 1994 film follows a gentle man whose life touches everyone he meets, from shrimp boats to a cross-country run?',
  a: ['Forrest Gump', 'The Shawshank Redemption', 'Pulp Fiction', 'Speed'],
  correct: 0,
  cat: 'Movies',
  diff: 'easy',
  why: 'Forrest Gump won Best Picture for 1994 and made shrimping boats famous.',
};
const DATE = '2026-11-09';

async function main() {
  // ---- 1. happy path: question + Sterling intro, cached as one ----
  {
    const kv = new MapKV();
    const ai = aiStub(() => ({ response: JSON.stringify(GOOD_Q) }));
    const sterling = sterlingStub('Sterling has been saving this one all day, and the wrapping is exquisite.');
    const env = { AI: ai, CACHE: kv, STERLING: sterling };
    const r1 = await handleTonight(env, DATE);
    ok(r1.status === 200 && r1.data.question && r1.data.question.q === GOOD_Q.q, 'tonight returns the generated question', JSON.stringify(r1.data));
    ok(r1.data.question.kind === 'normal' && r1.data.question.correct === 0 && r1.data.question.a.length === 4,
      'question is normalized to the bank schema (kind normal, 4 answers, correct index)');
    ok(r1.data.intro.includes('wrapping is exquisite'), 'intro came from the Sterling worker', r1.data.intro);
    ok(sterling.lastBody && sterling.lastBody.kind === 'nightly_intro' && sterling.lastBody.showKey === 'nightly:' + DATE
      && sterling.lastBody.category === 'Movies', 'Sterling was asked over the binding with the nightly showKey', JSON.stringify(sterling.lastBody));
    ok(ai.calls === 1 && sterling.calls === 1, 'one generation + one intro call', 'ai=' + ai.calls + ' st=' + sterling.calls);

    const r2 = await handleTonight(env, DATE);
    ok(JSON.stringify(r2.data) === JSON.stringify(r1.data), 'second /tonight returns the cached pair verbatim');
    ok(ai.calls === 1 && sterling.calls === 1, 'two /tonight calls cost exactly one AI generation total', 'ai=' + ai.calls);
  }

  // ---- 2. malformed first, good second (choices-shaped) -> success ----
  {
    const ai = aiStub((n) => (n === 1
      ? { response: 'Here is your question! It is a great one, trust me.' }
      : { choices: [{ message: { content: '```json\n' + JSON.stringify(GOOD_Q) + '\n```' } }] }));
    const env = { AI: ai, CACHE: new MapKV(), STERLING: sterlingStub('An intro, second attempt lucky.') };
    const r = await handleTonight(env, DATE);
    ok(r.data.question && r.data.question.q === GOOD_Q.q, 'non-JSON output rejected, retry succeeds (fenced JSON in choices shape)', JSON.stringify(r.data).slice(0, 120));
    ok(ai.calls === 2, 'exactly one retry on malformed output', 'calls=' + ai.calls);
  }

  // ---- 3. malformed twice -> designed null, NOT cached ----
  {
    const ai = aiStub(() => ({ response: '{"q":"too short"}' }));
    const env = { AI: ai, CACHE: new MapKV(), STERLING: sterlingStub('unused') };
    const r1 = await handleTonight(env, DATE);
    ok(r1.status === 200 && r1.data.question === null && r1.data.intro === null,
      'invalid question twice returns the designed {question:null, intro:null}', JSON.stringify(r1.data));
    ok(ai.calls === 2, 'gave up after exactly one retry', 'calls=' + ai.calls);
    const r2 = await handleTonight(env, DATE);
    ok(r2.data.question === null && ai.calls === 4, 'the null is not cached — a later request tries again', 'calls=' + ai.calls);
  }

  // ---- 4. sports question is rejected however valid its shape ----
  {
    const sportsQ = { ...GOOD_Q, q: 'Which quarterback threw the winning touchdown in the 1995 Super Bowl game?', a: ['Steve Young', 'Troy Aikman', 'Dan Marino', 'John Elway'], why: 'A famous football moment.' };
    const ai = aiStub(() => ({ response: JSON.stringify(sportsQ) }));
    const env = { AI: ai, CACHE: new MapKV(), STERLING: sterlingStub('unused') };
    const r = await handleTonight(env, DATE);
    ok(r.data.question === null, 'a sports question is rejected outright', JSON.stringify(r.data));
  }

  // ---- 5. AI throws -> designed null, no exception escapes ----
  {
    const ai = aiStub(() => { throw new Error('muse is out'); });
    const env = { AI: ai, CACHE: new MapKV(), STERLING: sterlingStub('unused') };
    const r = await handleTonight(env, DATE);
    ok(r.status === 200 && r.data.question === null, 'throwing AI returns the designed null', JSON.stringify(r.data));
  }

  // ---- 6. Sterling binding fails -> authored intro, still cached ----
  {
    const kv = new MapKV();
    const ai = aiStub(() => ({ response: JSON.stringify(GOOD_Q) }));
    const badSterling = { async fetch() { throw new Error('binding down'); } };
    const env = { AI: ai, CACHE: kv, STERLING: badSterling };
    const r1 = await handleTonight(env, DATE);
    ok(r1.data.question && r1.data.intro === authoredIntro('Movies'), 'failing Sterling binding lands on the authored intro', r1.data.intro);
    const r2 = await handleTonight(env, DATE);
    ok(r2.data.intro === r1.data.intro && ai.calls === 1, 'question + authored intro are cached together', 'ai=' + ai.calls);
  }

  // ---- 7. no STERLING binding at all -> authored intro ----
  {
    const ai = aiStub(() => ({ response: JSON.stringify(GOOD_Q) }));
    const env = { AI: ai, CACHE: new MapKV() };
    const r = await handleTonight(env, DATE);
    ok(r.data.intro === authoredIntro('Movies'), 'missing STERLING binding lands on the authored intro', r.data.intro);
  }

  // ---- 8. validateQuestion unit checks ----
  {
    const base = { ...GOOD_Q };
    ok(validateQuestion(base) !== null, 'validateQuestion accepts a good question');
    ok(validateQuestion({ ...base, a: ['X', 'X', 'Y', 'Z'] }) === null, 'rejects duplicate answers');
    ok(validateQuestion({ ...base, a: ['X', 'Y', 'Z'] }) === null, 'rejects three answers');
    ok(validateQuestion({ ...base, correct: 4 }) === null, 'rejects correct index 4');
    ok(validateQuestion({ ...base, correct: 1.5 }) === null, 'rejects non-integer correct');
    ok(validateQuestion({ ...base, cat: 'Sports Moments' }) === null, 'rejects a non-show category');
    ok(validateQuestion({ ...base, diff: 'brutal' }) === null, 'rejects an unknown diff');
    ok(validateQuestion({ ...base, q: 'Short?' }) === null, 'rejects a too-short question');
    ok(validateQuestion({ ...base, why: 'x'.repeat(141) }) === null, 'rejects an overlong why');
    ok(validateQuestion({ ...base, kind: 'num' }) === null, 'rejects a non-normal kind');
    ok(validateQuestion({ ...base, a: ['Ok', 'x'.repeat(61), 'Y', 'Z'] }) === null, 'rejects an overlong answer');
  }

  // ---- 9. category rotation + Chicago date shape ----
  {
    const cats = new Set();
    for (let d = 9; d <= 15; d++) cats.add(categoryForDate('2026-11-' + d));
    ok(cats.size === 7, 'categoryForDate walks all seven categories across a week', [...cats].join(','));
    ok(categoryForDate(DATE) === categoryForDate(DATE), 'categoryForDate is deterministic');
    ok(/^\d{4}-\d{2}-\d{2}$/.test(todayInChicago()), 'todayInChicago returns YYYY-MM-DD', todayInChicago());
    // 2026-11-09 02:00 UTC is still Nov 8 in Chicago (CST, UTC-6).
    ok(todayInChicago(new Date('2026-11-09T02:00:00Z')) === '2026-11-08', 'todayInChicago respects the Chicago date line', todayInChicago(new Date('2026-11-09T02:00:00Z')));
  }

  // ---- 10. worker wrapper: health, bad date, tonight round-trip ----
  {
    const env = { AI: aiStub(() => ({ response: JSON.stringify(GOOD_Q) })), CACHE: new MapKV(), STERLING: sterlingStub('Wrapped intro, at your service.') };
    const health = await worker.fetch(new Request('https://x/health'), env);
    ok(health.status === 200 && (await health.text()) === 'gilded-hour-nightly ok', 'GET /health answers the plain-text ok');
    const bad = await worker.fetch(new Request('https://x/tonight?date=November 9'), env);
    ok(bad.status === 400 && (await bad.json()).error, 'a malformed date is a 400 {error}');
    const badDay = await worker.fetch(new Request('https://x/tonight?date=2026-02-30'), env);
    ok(badDay.status === 400, 'an impossible calendar date is a 400');
    const good = await worker.fetch(new Request('https://x/tonight?date=' + DATE), env);
    const gj = await good.json();
    ok(good.status === 200 && gj.question.q === GOOD_Q.q && gj.intro.includes('at your service'), 'GET /tonight round-trips through the wrapper', JSON.stringify(gj).slice(0, 120));
    const opt = await worker.fetch(new Request('https://x/tonight', { method: 'OPTIONS' }), env);
    ok(opt.status === 204, 'OPTIONS handled with 204');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('TEST CRASH:', e); process.exit(1); });
