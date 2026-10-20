# Dominoes Online — Deploy Guide

The server is a Cloudflare Worker + Durable Object (one object per room).
The game client expects it at `wss://dominoes-rooms.chaoticutopia84.workers.dev`
(override on-device via localStorage `dominoes.neturl` if yours differs).

## Option A — Dashboard paste (5 minutes, recommended)

1. Open [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Create Worker**.
2. Name it `dominoes-rooms` → **Deploy** (deploys the starter; we'll replace it).
3. **Edit code** → select-all, delete, paste the entire contents of
   `dist/worker.js` from this folder → **Save and deploy**.
4. Add the Durable Object binding: worker → **Settings** → **Bindings** →
   **Add binding** → **Durable Object** →
   - Variable name: `ROOMS`
   - Durable Object class: `DominoRoom`
   → **Save**. (The dashboard redeploys with the binding.)
5. Done. Visit `https://dominoes-rooms.chaoticutopia84.workers.dev/` in a
   browser — it should answer `dominoes-rooms ok`.

Then in the game: title → **Online** → **Play** → **Create Room**, share the
4-letter code with a friend.

## Option B — Workers Builds (connect once, never paste again)

1. Put this folder's sources (`server.js`, `room.js`, `sim.js`,
   `wrangler.toml`) in a GitHub repo.
2. Dashboard → **Workers & Pages** → **Create** → **Import a repository** →
   pick the repo. Framework preset: **None**. The included `wrangler.toml`
   wires the `ROOMS` Durable Object binding and the `v1` migration.
3. Every `git push` redeploys automatically — no more pasting.

## How it works

- `GET /create?mode=draw|fives&target=50|100|150` → `{code}` (4 letters).
- `WS /room/CODE` → JSON protocol (see `room.js` header comment).
- The sim runs **authoritatively** on the server: every move/draw/knock is
  validated against the real game state; clients only ever see their own
  tiles (opponent hands are count-only until a round ends).
- Rooms expire after 2 hours with nobody connected.

## Files

- `server.js` — Worker entry + `DominoRoom` Durable Object (thin wrapper).
- `room.js` — pure room logic + protocol (fully unit-tested).
- `sim.js` — the game's sim, synced verbatim from the client
  (`./sync-sim.sh` re-extracts it from `dominoes/index.html`).
- `dist/worker.js` — single-file build for dashboard paste
  (`node build-single.js` regenerates it).
- `test-room.js` — room-logic tests. `test-do.js` — Durable Object
  plumbing tests (simulated runtime). `replay-test.js` — full client
  replay in headless Chromium against scripted server states.
