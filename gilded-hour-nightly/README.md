# gilded-hour-nightly

Cloudflare Worker (Pass 5) — tonight's special question for The
Gilded Hour. One question per date, **picked from the show's own
hand-authored bank**, cached, and served verbatim to every room
that asks. It also returns Sterling's introduction of the question,
asked of the **gilded-hour-sterling** worker over a service
binding — the two workers working together.

## Why a bank pick, not a generated question

This worker originally generated the nightly question with Workers
AI. Its first live question was factually confabulated — an
invented ad campaign, delivered with total confidence — and schema
validation cannot check truth, only shape. At the owner's decision
the model no longer writes questions. The special is now dealt from
the same 96-question bank the game itself uses (hand-authored and
fact-checked), so its answer key is guaranteed. Sterling still
writes the intro line; that is phrasing, and phrasing is what the
AI is for.

## How the pick works

- **The pool** is the bank's 84 ordinary questions (kind absent or
  `normal`). The 6 closest-number and 6 survey entries are never
  specials — the show deals those from its own guess slots.
- **The order** is a single Fisher–Yates shuffle of that pool,
  driven by a mulberry32 PRNG with a fixed seed (`POOL_SEED` in
  `logic.js`), computed once at module load. Same seed → same order
  on every deploy and machine.
- **The date's pick** is `shuffledPool[dayNumber mod 84]`, where
  `dayNumber` is the date's UTC day number (days since the Unix
  epoch). Same date → same question for everyone; consecutive
  dates walk the shuffled pool one step at a time, so all 84
  questions are dealt before any repeats.
- **The response question** is normalized to
  `{q, a: [4 strings], correct: 0-3, cat, diff, why, kind: 'normal'}`.
  Bank entries store the correct answer in `a` and the wrong ones
  in `w`; the four are shuffled with a date-seeded mulberry32 (so
  the correct index varies by night, identically for everyone) and
  `correct` points at the bank's answer.

## Caching

- The pair `{question, intro}` is cached in KV under
  **`nightly:v2:<date>`**. A hit returns it verbatim with no
  Sterling call.
- The **v2** is deliberate: the v1 key (`nightly:<date>`) holds one
  night's confabulated generated question. The rework simply never
  reads the old key again — the bad entry is orphaned in place,
  no deletion needed.
- **The intro has its own fallback.** If the Sterling worker is
  unreachable, unbound, or answers badly, an authored intro line in
  Sterling's voice stands in, and pick + intro are cached together.
- The defensive `{question: null, intro: null}` response remains
  for an impossible empty bank; with the real bank it cannot
  happen, and nothing here is load-bearing either way.

## Files

- `bank.js` — the full 96-entry bank, copied faithfully from the
  game's `questions.js` (same order, fields, and values; the game
  exposes it as `window.GH_BANK`). If the game bank changes,
  regenerate this copy and let the test prove it faithful again.
- `logic.js` — pure logic (the seeded pick, normalization, caching,
  the Sterling call): takes an env-like `{ CACHE, STERLING }`, no
  Cloudflare APIs, fully covered by the test
- `worker.js` — thin Worker wrapper (routing, CORS, the
  America/Chicago date default)
- `wrangler.toml` — name `gilded-hour-nightly`, `CACHE` KV binding
  (id `494d005c194f4063a3b1e37def3724c7`), `STERLING` service
  binding to `gilded-hour-sterling`. **No AI binding** — this
  worker never calls a model.
- `build-single.js` — builds `dist/worker.js`, the single-file
  dashboard-paste build (`node build-single.js`)
- `dist/worker.js` — generated single file (do not edit by hand)
- `test/test-nightly.js` — stub harness: bank fidelity against the
  game file, pick determinism/reachability, cache behaviour, intro
  fallbacks. Run: `node build-single.js && node test/test-nightly.js`

## Routes

| Route | Result |
| --- | --- |
| `GET /health` (or `GET /`) | `200` plain text `gilded-hour-nightly ok` |
| `GET /tonight?date=YYYY-MM-DD` | `{question, intro}` for that date — the date's bank pick plus Sterling's intro (or the authored intro if Sterling is unreachable). `date` defaults to today in America/Chicago. A malformed date is a `400 {error}`. CORS `*`; `OPTIONS` answered. |

## Deploy checklist (for the parent)

Bindings cannot be created by editing code in the dashboard; they
are provisioned by a wrangler / Workers Builds deploy, or added in
Settings after a paste. **Deploy `gilded-hour-sterling` first** —
this worker's service binding points at it.

1. The KV namespace id is already in `wrangler.toml`
   (`gilded-hour-nightly-cache`, id `494d005c194f4063a3b1e37def3724c7`).
   If it is ever recreated, update the id there.
2. Deploy, either way:
   - **Workers Builds / wrangler**: this folder lives in the Gamez
     repo (like `gilded-hour-server/`) and is connected to the
     worker, or run `npx wrangler deploy` here. The
     `[[kv_namespaces]]` and `[[services]]` blocks in
     `wrangler.toml` wire both bindings.
   - **Dashboard paste**: paste `dist/worker.js` (regenerate with
     `node build-single.js`), then in **Settings → Bindings** add a
     **KV namespace** binding named `CACHE` and a **Service
     binding** named `STERLING` targeting the
     `gilded-hour-sterling` worker. No Workers AI binding.
3. Check: `https://gilded-hour-nightly.<your-subdomain>.workers.dev/health`
   should answer `gilded-hour-nightly ok`, and `GET /tonight`
   should return the date's bank pick plus an intro. For
   2026-11-08 the pick is the Coca-Cola polar bears question
   (Ads & Jingles).
