# gilded-hour-sterling

Cloudflare Worker (Pass 5a) — Sterling's live voice for The Gilded
Hour. Given the facts of a moment (who is at the table, who just
banked, who won), it returns one short line in Sterling's written
voice: warm playmate host, dry wit aimed at the questions, the era and
himself — never at a player.

It follows the house AI pattern exactly:

- **Generate once per key, cache, serve everyone the same.** Greetings
  and winner lines are cached per show; reaction beats are cached per
  show + beat + a stable hash of the facts. A cache hit never calls
  the model.
- **Schema-first, validate → one retry → authored fallback.** Every
  generated line must be a single short string (≤ 240 chars, at most
  one newline, no profanity, no machine self-reference) or it is
  discarded and generation retries once. A second failure returns an
  **authored fallback line** in Sterling's voice — the same register
  as the lines the game client already ships. Those fallbacks double
  as the worker's offline voice: this worker is phrasing only, never
  load-bearing, and a total outage still sounds like Sterling.
- No user-facing string anywhere mentions how the lines are made.

## Files

- `logic.js` — pure logic (voice bible, prompts, validation,
  fallbacks, caching): takes an env-like `{ AI, CACHE }`, no
  Cloudflare APIs, fully covered by the test
- `worker.js` — thin Worker wrapper (routing, CORS, body-size cap)
- `wrangler.toml` — name `gilded-hour-sterling`, `AI` binding,
  `CACHE` KV binding (placeholder id — see deploy checklist)
- `build-single.js` — builds `dist/worker.js`, the single-file
  dashboard-paste build (`node build-single.js`)
- `dist/worker.js` — generated single file (do not edit by hand)
- `test/test-sterling.js` — stub-AI/KV harness. Run:
  `node test/test-sterling.js`

## Routes

| Route | Result |
| --- | --- |
| `GET /health` (or `GET /`) | `200` plain text `gilded-hour-sterling ok` |
| `POST /g` | Body `{kind, showKey, ...facts}` → `{line}`. Bad input → `400 {error}`. Bodies over 8192 chars are refused. CORS `*` on everything; `OPTIONS` answered. |

### Kinds

| kind | facts | line |
| --- | --- | --- |
| `greeting` | `names`: 1–4 player names | Sterling greets this table by name |
| `beat` | `beat` + per-beat facts (below) | a reaction to a moment in the show |
| `winner` | `winner`, `standings`: `[{name, score}]`, `topScore` | the winner's speech about this game |
| `nightly_intro` | `category` (one of the seven) | Sterling presents tonight's special question — the nightly worker calls this over a service binding |

Beats: `first_bank` `{name}` · `big_lead` `{name, lead}` ·
`whole_miss` `{}` · `cut_used` `{name}` · `finale_start` `{}` ·
`close_game` `{names}`.

Generation uses `@cf/meta/llama-4-scout-17b-16e-instruct` at
temperature 0.7. The reply text is read from `result.response` or
`result.choices[0].message.content` — both shapes have been observed
on this account, so the code checks both.

## Deploy checklist (for the parent — not done in Pass 5a)

Bindings cannot be created by editing code in the dashboard; they are
provisioned by a wrangler / Workers Builds deploy, or added in
Settings after a paste. Steps:

1. Create the KV namespace: dashboard → **Storage & Databases → KV →
   Create namespace**, name it e.g. `gilded-hour-sterling-cache`
   (equivalently `npx wrangler kv namespace create CACHE` from this
   folder). Copy its id.
2. Replace `REPLACE_WITH_KV_ID` in `wrangler.toml` with that id.
3. Deploy, either way:
   - **Workers Builds / wrangler**: put this folder in the Gamez repo
     (like `gilded-hour-server/`) and connect the worker, or run
     `npx wrangler deploy` here. The `[ai]` and `[[kv_namespaces]]`
     blocks in `wrangler.toml` wire the bindings.
   - **Dashboard paste**: create the worker, paste `dist/worker.js`
     (regenerate with `node build-single.js`), then in **Settings →
     Bindings** add a **Workers AI** binding named `AI` and a **KV
     namespace** binding named `CACHE` pointing at the namespace from
     step 1.
4. Check: `https://gilded-hour-sterling.<your-subdomain>.workers.dev/health`
   should answer `gilded-hour-sterling ok`, and a `POST /g` greeting
   should return a line naming the players.

Deploys: Workers Builds from the Gamez repo (this folder, watch path gilded-hour-sterling/*); deploy command `npx wrangler deploy` applies the wrangler.toml bindings.
