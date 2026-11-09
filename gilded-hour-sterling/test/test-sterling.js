/* Sterling worker test: stub AI (good / malformed / throwing) and an
 * in-memory KV. No network. Proves the house pattern: cache hits make
 * zero extra AI calls, bad output gets exactly one retry, and every
 * failure lands on an authored Sterling fallback.
 * Run: node test/test-sterling.js */
import { handleGenerate, fallbackLine } from '../logic.js';
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

/* Counting AI stub. handler(n) -> result or throw, n = call number. */
function aiStub(handler) {
  const stub = {
    calls: 0,
    lastArgs: null,
    async run(model, opts) {
      stub.calls++;
      stub.lastArgs = { model, opts };
      return handler(stub.calls, model, opts);
    },
  };
  return stub;
}

const NAMES = ['Robin', 'Jules', 'Priya'];

async function main() {
  // ---- 1. good greeting via the choices-shaped reply; cached ----
  {
    const kv = new MapKV();
    const ai = aiStub(() => ({ choices: [{ message: { content: 'Robin, Jules and Priya — good evening, I\'m Sterling, and the Hour is delighted to see you.' } }] }));
    const env = { AI: ai, CACHE: kv };
    const r1 = await handleGenerate(env, { kind: 'greeting', showKey: 'show-1', names: NAMES });
    ok(r1.status === 200 && r1.data.line.includes('Robin') && r1.data.line.includes('Jules') && r1.data.line.includes('Priya'),
      'greeting uses the supplied names (choices-shaped reply)', JSON.stringify(r1));
    ok(ai.calls === 1, 'greeting made exactly one AI call', 'calls=' + ai.calls);
    ok(ai.lastArgs.model === '@cf/meta/llama-4-scout-17b-16e-instruct', 'proven account model requested');
    ok(ai.lastArgs.opts.temperature === 0.7, 'temperature ~0.7');
    const r2 = await handleGenerate(env, { kind: 'greeting', showKey: 'show-1', names: NAMES });
    ok(r2.data.line === r1.data.line && ai.calls === 1, 'second greeting is a cache hit with zero additional AI calls', 'calls=' + ai.calls);
    const r3 = await handleGenerate(env, { kind: 'greeting', showKey: 'show-2', names: NAMES });
    ok(ai.calls === 2, 'a different showKey generates fresh', 'calls=' + ai.calls);
  }

  // ---- 2. good winner via the .response-shaped reply ----
  {
    const kv = new MapKV();
    const ai = aiStub(() => ({ response: 'Robin takes the Hour — a performance the newspapers will describe as inevitable.' }));
    const env = { AI: ai, CACHE: kv };
    const body = { kind: 'winner', showKey: 'show-9', winner: 'Robin', standings: [{ name: 'Robin', score: 4374 }, { name: 'Jules', score: 968 }], topScore: 4374 };
    const r = await handleGenerate(env, body);
    ok(r.status === 200 && r.data.line.startsWith('Robin takes the Hour'), 'winner line via .response-shaped reply', JSON.stringify(r));
    ok(JSON.stringify(ai.lastArgs.opts.messages).includes('$4,374'), 'winner prompt carries the formatted top score');
  }

  // ---- 3. malformed output -> exactly one retry -> good line ----
  {
    const overlong = 'Sterling '.repeat(60); // > 240 chars
    const ai = aiStub((n) => (n === 1 ? { response: overlong } : { response: 'Everybody missed it — the question retires undefeated and slightly smug.' }));
    const env = { AI: ai, CACHE: new MapKV() };
    const r = await handleGenerate(env, { kind: 'beat', showKey: 'show-3', beat: 'whole_miss' });
    ok(r.data.line.includes('retires undefeated'), 'overlong output rejected, retry line used', JSON.stringify(r));
    ok(ai.calls === 2, 'exactly one retry after malformed output', 'calls=' + ai.calls);
  }

  // ---- 4. banned output on both attempts -> authored fallback ----
  {
    const ai = aiStub(() => ({ response: 'Well damn, Robin, that was the whole show.' }));
    const env = { AI: ai, CACHE: new MapKV() };
    const r = await handleGenerate(env, { kind: 'beat', showKey: 'show-4', beat: 'first_bank', name: 'Robin' });
    ok(r.data.line === fallbackLine('beat', { beat: 'first_bank', name: 'Robin' }), 'banned output twice lands on the authored fallback', JSON.stringify(r));
    ok(ai.calls === 2, 'fallback came after the one allowed retry, not before', 'calls=' + ai.calls);
  }

  // ---- 5. AI throws -> authored fallback, no exception escapes ----
  {
    const ai = aiStub(() => { throw new Error('muse is out'); });
    const env = { AI: ai, CACHE: new MapKV() };
    const r = await handleGenerate(env, { kind: 'winner', showKey: 'show-5', winner: 'Jules', standings: [{ name: 'Jules', score: 1200 }], topScore: 1200 });
    ok(r.data.line.includes('Jules takes the Gilded Hour!') && r.data.line.includes('legally binding'),
      'throwing AI lands on the authored winner fallback', JSON.stringify(r));
  }

  // ---- 6. no AI binding at all -> fallback, still 200 ----
  {
    const r = await handleGenerate({ CACHE: new MapKV() }, { kind: 'beat', showKey: 'show-6', beat: 'big_lead', name: 'Priya', lead: 800 });
    ok(r.status === 200 && r.data.line.includes('Priya') && r.data.line.includes('$800'), 'missing AI binding still answers with the fallback', JSON.stringify(r));
  }

  // ---- 7. beat cache keys differ by facts hash ----
  {
    const ai = aiStub(() => ({ response: 'Close enough to hear breathing — this table refuses to be separated.' }));
    const env = { AI: ai, CACHE: new MapKV() };
    const a = { kind: 'beat', showKey: 'show-7', beat: 'close_game', names: ['Robin', 'Jules'] };
    const b = { kind: 'beat', showKey: 'show-7', beat: 'close_game', names: ['Robin', 'Priya'] };
    await handleGenerate(env, a);
    await handleGenerate(env, b);
    ok(ai.calls === 2, 'same show+beat with different facts generates twice', 'calls=' + ai.calls);
    await handleGenerate(env, a);
    ok(ai.calls === 2, 'repeat of the first facts is a cache hit', 'calls=' + ai.calls);
  }

  // ---- 8. cut_used + finale_start smoke; nightly_intro validation ----
  {
    const ai = aiStub(() => ({ response: 'A fine line, freshly minted for this exact moment.' }));
    const env = { AI: ai, CACHE: new MapKV() };
    const cut = await handleGenerate(env, { kind: 'beat', showKey: 'show-8', beat: 'cut_used', name: 'Jules' });
    ok(cut.status === 200 && cut.data.line.length <= 240, 'cut_used beat answers');
    const bad = await handleGenerate(env, { kind: 'nightly_intro', showKey: 'nightly:2026-11-09', category: 'Sports Moments' });
    ok(bad.status === 400 && !!bad.data.error, 'nightly_intro rejects a non-show category', JSON.stringify(bad));
    const good = await handleGenerate(env, { kind: 'nightly_intro', showKey: 'nightly:2026-11-09', category: 'Movies' });
    ok(good.status === 200 && good.data.line.length > 0, 'nightly_intro answers for a real category');
  }

  // ---- 9. input validation -> 400 {error} ----
  {
    const env = { AI: aiStub(() => ({ response: 'x' })), CACHE: new MapKV() };
    const cases = [
      [{ kind: 'nope', showKey: 's' }, 'unknown kind'],
      [{ kind: 'greeting' }, 'missing showKey'],
      [{ kind: 'greeting', showKey: 's', names: [] }, 'names empty'],
      [{ kind: 'greeting', showKey: 's', names: ['A', 'B', 'C', 'D', 'E'] }, 'names over 4'],
      [{ kind: 'greeting', showKey: 's', names: ['A', 42] }, 'names not all strings'],
      [{ kind: 'beat', showKey: 's', beat: 'big_lead', name: 'A' }, 'big_lead missing lead'],
      [{ kind: 'beat', showKey: 's', beat: 'dance_break' }, 'unknown beat'],
      [{ kind: 'winner', showKey: 's' }, 'winner missing name'],
      ['not an object', 'body not an object'],
    ];
    for (const [body, name] of cases) {
      const r = await handleGenerate(env, body);
      ok(r.status === 400 && typeof r.data.error === 'string', '400 on ' + name, JSON.stringify(r));
    }
  }

  // ---- 10. worker wrapper: health, CORS, bad JSON, size cap ----
  {
    const env = { AI: aiStub(() => ({ response: 'Wrapped and delivered.' })), CACHE: new MapKV() };
    const health = await worker.fetch(new Request('https://x/health'), env);
    ok(health.status === 200 && (await health.text()) === 'gilded-hour-sterling ok', 'GET /health answers the plain-text ok');
    ok(health.headers.get('Access-Control-Allow-Origin') === '*', 'health carries CORS *');
    const opt = await worker.fetch(new Request('https://x/g', { method: 'OPTIONS' }), env);
    ok(opt.status === 204, 'OPTIONS handled with 204');
    const badJson = await worker.fetch(new Request('https://x/g', { method: 'POST', body: '{oops' }), env);
    ok(badJson.status === 400 && (await badJson.json()).error, 'malformed JSON body is a 400 {error}');
    const huge = await worker.fetch(new Request('https://x/g', { method: 'POST', body: '"' + 'x'.repeat(9000) + '"' }), env);
    ok(huge.status === 400, 'oversized body refused by the size cap');
    const good = await worker.fetch(new Request('https://x/g', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'greeting', showKey: 'wrap-1', names: ['Robin', 'Jules'] }),
    }), env);
    const gj = await good.json();
    ok(good.status === 200 && gj.line === 'Wrapped and delivered.', 'POST /g round-trips through the wrapper', JSON.stringify(gj));
    const nf = await worker.fetch(new Request('https://x/elsewhere'), env);
    ok(nf.status === 404, 'unknown route is a 404');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('TEST CRASH:', e); process.exit(1); });
