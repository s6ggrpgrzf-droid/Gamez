# gilded-hour-nightly

Cloudflare Worker (Pass 5a) — tonight's special question for The
Gilded Hour. One original pop-culture trivia question per date,
generated once, cached, and served verbatim to every room that asks.
On success it also returns Sterling's introduction of the question,
asked of the **gilded-hour-sterling** worker over a service binding —
the two workers working together.

It follows the house AI pattern exactly:

- **Generate once per key, cache, serve everyone the same.** The
  cache key is `nightly:<date>`; a hit returns the stored
  `{question, intro}` without any generation.
- **Schema-first, hard validation → one retry → designed fallback.**
  The model must return strict JSON matching the bank schema
  (`q`, `a` ×4, `correct`, `cat`, `diff`, `why`, kind `normal` only).
  Every field is range-checked, answers must be distinct, the
  category must be one of the show's seven, and anything touching
  **sports is rejected outright** (the show leaves sports out, at the
  owner's word). If both attempts fail, the route returns
  `{question: null, intro: null}` — a designed outcome, not an error:
  the client simply deals from its own bank. The null is deliberately
  **not** cached, so a later request can try again.
- **The intro has its own fallback.** If the Sterling worker is
  unreachable, unbound, or answers badly, an authored intro line in
  Sterling's voice stands in, and question + intro are cached
  together.

The evening's category rotates deterministically by date, so a week
walks all seven categories and every room shares the same one.

## Files

- `logic.js` — pure logic (prompt, hard validation, caching, the
  Sterling call): takes an env-like `{ AI, CACHE, STERLING }`, no
  Cloudflare APIs, fully covered by the test
- `worker.js` — thin Worker wrapper (routing, CORS, the
  America/Chicago date default)
- `wrangler.toml` — name `gilded-hour-nightly`, `AI` binding, `CACHE`
  KV binding (placeholder id — see deploy checklist), `STERLING`
  service binding to `gilded-hour-sterling`
- `build-single.js` — builds `dist/worker.js`, the single-file
  dashboard-paste build (`node build-single.js`)
- `dist/worker.js` — generated single file (do not edit by hand)
- `test/test-nightly.js` — stub harness. Run:
  `node test/test-nightly.js`

## Routes

| Route | Result |
| --- | --- |
| `GET /health` (or `GET /`) | `200` plain text `gilded-hour-nightly ok` |
| `GET /tonight?date=YYYY-MM-DD` | `{question, intro}` for that date; `{question: null, intro: null}` when no valid question could be produced. `date` defaults to today in America/Chicago. A malformed date is a `400 {error}`. CORS `*`; `OPTIONS` answered. |

The returned question is normalized to
`{q, a: [4 strings], correct: 0-3, cat, diff, why, kind: 'normal'}`.
Generation uses `@cf/meta/llama-4-scout-17b-16e-instruct` at
temperature 0.7. The reply text is read from `result.response` or
`result.choices[0].message.content` — both shapes have been observed
on this account, so the code checks both.

## Deploy checklist (for the parent — not done in Pass 5a)

Bindings cannot be created by editing code in the dashboard; they
are provisioned by a wrangler / Workers Builds deploy, or added in
Settings after a paste. **Deploy `gilded-hour-sterling` first** — this
worker's service binding points at it.

1. Create the KV namespace: dashboard → **Storage & Databases → KV →
   Create namespace**, name it e.g. `gilded-hour-nightly-cache`
   (equivalently `npx wrangler kv namespace create CACHE` from this
   folder). Copy its id.
2. Replace `REPLACE_WITH_KV_ID` in `wrangler.toml` with that id.
3. Deploy, either way:
   - **Workers Builds / wrangler**: put this folder in the Gamez repo
     (like `gilded-hour-server/`) and connect the worker, or run
     `npx wrangler deploy` here. The `[ai]`, `[[kv_namespaces]]` and
     `[[services]]` blocks in `wrangler.toml` wire all three bindings.
   - **Dashboard paste**: create the worker, paste `dist/worker.js`
     (regenerate with `node build-single.js`), then in **Settings →
     Bindings** add a **Workers AI** binding named `AI`, a **KV
     namespace** binding named `CACHE`, and a **Service binding**
     named `STERLING` targeting the `gilded-hour-sterling` worker.
4. Check: `https://gilded-hour-nightly.<your-subdomain>.workers.dev/health`
   should answer `gilded-hour-nightly ok`, and
   `GET /tonight` should return a question plus Sterling's intro.

Deploys: Workers Builds from the Gamez repo (this folder, watch path gilded-hour-nightly/*); deploy command `npx wrangler deploy` applies the wrangler.toml bindings.
