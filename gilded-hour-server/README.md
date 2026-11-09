# gilded-hour-rooms

Cloudflare Worker + Durable Object server for The Gilded Hour's online
play (Pass 4). One Durable Object instance per 4-letter room code. A
room holds one **host** (the show screen — creates the room, drives the
show, is not a player) and up to **4 players** on their own devices.

The server referees the Pass B format authoritatively:

- 15 questions in the client's script (R1 ×6, R2 ×6 at ×2 value,
  R3 ×3 behind a bet phase) — the host drives the order; the server
  referees timing, secrecy, and scoring for whatever is published.
- Per question, the host publishes and the server stamps the answering
  window **on its own clock** (client clocks are never trusted). The
  question value drains linearly from 100% to 50% across the window;
  at reveal, correct players bank the as-stopped value.
- Question kinds: `normal` / `survey` (pick an answer index) and `num`
  (submit a number — closest to the true number banks; tied players
  each bank the full value).
- **Cut Two** — one token per player per show. The host supplies the
  two wrong answer indices when publishing; the server enforces the
  token and one-cut-per-question, then broadcasts the cut.
- **Finale bets** — before a Round 3 question the host opens a bet
  phase; each player secretly sets 1–3 chips. A correct answer banks
  bet × $100; a wrong answer loses $0. A player who never bets defaults
  to 1 chip. Nobody can lose money anywhere in the format.
- Scores live server-side and survive disconnects: a dropped player
  rejoins with a per-seat **reclaim token** and gets their seat and
  score back (the Dominoes pattern).

## Files

- `server.js` — Worker entry + `GildedRoom` Durable Object (thin wrapper:
  sockets, hibernation-safe seat lookup, rate limits, alarm/expiry)
- `room.js` — pure room logic + the protocol below (no Cloudflare APIs;
  fully covered by the test)
- `wrangler.toml` — Worker name `gilded-hour-rooms`, `ROOMS` binding,
  `v1` migration (`new_sqlite_classes = ["GildedRoom"]`)
- `build-single.js` — builds `dist/worker.js`, the single-file
  dashboard-paste build (`node build-single.js`)
- `dist/worker.js` — generated single file (do not edit by hand)
- `test/test-game.js` — simulated-runtime test: a full scripted show
  (host + 3 players, drain, closest-number, Cut Two, finale bets,
  auto-close, disconnect + reclaim) with secrecy assertions.
  Run: `node test/test-game.js` → expect `67 passed, 0 failed`.

## HTTP

| Route | Result |
| --- | --- |
| `GET /health` (or `GET /`) | `200` plain text `gilded-hour-rooms ok` |
| `POST /room` | Creates a room. Returns `{code, hostToken}` — a 4-letter code from an unambiguous alphabet (no I/L/O/0/1) and a 32-hex-char host token. Keep the host token secret: it is the only credential that can drive the show. Retries internally on code collision. CORS-enabled. |
| `GET /room/CODE` with `Upgrade: websocket` | WebSocket into the room (see below). |

## WebSocket protocol

All messages are JSON. The first message on every socket must be a
`hello`; anything else first earns `{t:'error', msg:'Say hello first.'}`.
Malformed JSON is ignored; messages over 4096 chars are refused; each
socket is rate-limited (40 messages / 10 s, then `Slow down.`).

### Joining

| From | Message | Result |
| --- | --- | --- |
| Host | `{t:'hello', role:'host', hostToken}` | `{t:'welcome', role:'host', code}` + a state snapshot. Wrong token → error. Only one live host socket: a second one is refused (`Host already connected.`) unless the first has closed. |
| Player (new) | `{t:'hello', role:'player', name}` | Lowest free seat (0–3). `{t:'welcome', role:'player', code, seat, reclaimToken}` — the reclaim token is sent **only** to this player, only in this message (and again to the same player on reclaim). Full room → `Room is full.` |
| Player (reclaim) | `{t:'hello', role:'player', reclaimToken, name?}` | Rebinds that seat (score, Cut Two state intact) and returns the same welcome. Unknown token → error. A seat with a live socket refuses a second one (`Seat is taken.`). |

Display names are trimmed to 24 chars; empty becomes `Player N`.
Disconnects keep the seat reserved and mark it `connected:false` in
snapshots; nothing about a seat is ever deleted mid-show.

### Host → server (host socket only)

| Message | Meaning |
| --- | --- |
| `{t:'bet_phase', qid}` | Open the finale bet phase for the upcoming question `qid` (from lobby or after a reveal). Phase becomes `bet`. |
| `{t:'publish_question', qid, round, kind, category, deadlineMs, baseValue, multiplier, correctIdx?, trueNum?, answersCount?, cutIndices?}` | Open a question. `deadlineMs` is the window length in ms (1000–180000; the game uses 20000, or 30000 for `num`); the server stamps `openedAt`/`deadline` on its own clock. `baseValue` defaults 100; `multiplier` defaults 1 (host sends 2 in Round 2). For `normal`/`survey`: `correctIdx` (required, 0-based), `answersCount` 2–6 (default 4), optional `cutIndices` — exactly two distinct wrong indices, neither equal to `correctIdx`. For `num`: `trueNum` (required). If a bet phase is open, `qid` must match it and the collected bets attach to the question. `correctIdx`/`trueNum` are held **secret** by the server. |
| `{t:'reveal', qid}` | Close the window now and settle (see reveal below). Idempotent: if the window already auto-closed at the deadline and revealed this `qid`, a late host `reveal` is a no-op rather than an error. |
| `{t:'end_show'}` | End the show: broadcasts `{t:'ended', scores}` and lands the room in phase `ended`. |
| `{t:'ping'}` | → `{t:'pong'}`. |

### Players → server (player sockets only)

| Message | Meaning |
| --- | --- |
| `{t:'answer', qid, pick}` | `normal`/`survey`: answer index (0-based). Accepted only during the window for the current `qid`; may be re-sent to change the pick before the window closes (last one counts). |
| `{t:'answer', qid, num}` | `num`: the player's number (any finite number). Same window rules. |
| `{t:'bet', qid, chips}` | During a bet phase: secret bet, integer 1–3. Re-sending changes it. |
| `{t:'cuttwo', qid}` | During the window of a `normal`/`survey` question that has `cutIndices`: spend this player's Cut Two token. Fails if the token is spent, the question was already cut, or the timing/kind is wrong. |
| `{t:'ping'}` | → `{t:'pong'}`. |

### Server → clients

| Message | Who | Meaning |
| --- | --- | --- |
| `{t:'welcome', ...}` | the joiner only | See Joining. The only message that ever carries a reclaim token, and only to its owner. |
| `{t:'state', state}` | everyone (per-viewer) | Snapshot after joins, publishes, cuts, reveals, disconnects. Fields: `code`, `phase` (`lobby`/`bet`/`answer`/`reveal`/`ended`), `role`, `seat` (null for host), `players` (array of 4: null or `{seat, name, score, cutTwo, connected}`), `question` (null or `{qid, round, kind, category, answersCount, baseValue, multiplier, windowMs, openedAt, deadline, betted, cut, answersIn}`), `bet` (null or `{qid, betsIn}`), `lastReveal`, and for players only `yourPick` / `yourNum` / `yourBet`. Player snapshots **never** contain `correctIdx`, `trueNum`, other players' picks/nums/bets, or tokens. Host snapshots additionally carry the current question's `correctIdx`/`trueNum` — the host authored them and needs them back to resync after a reconnect. |
| `{t:'counts', qid, answersIn, players}` / `{t:'counts', qid, betsIn, players}` | everyone | Progress during a window or bet phase — **counts only, never contents**. |
| `{t:'accepted', qid}` | the sender only | Your answer/bet was recorded. |
| `{t:'cut', qid, bySeat, indices}` | everyone | A Cut Two landed: the two answer indices in `indices` are removed for everyone. (This reveals two *wrong* answers — by design; the correct one stays hidden.) |
| `{t:'reveal', qid, kind, value, results, scores}` | everyone | Settlement. `value` is the as-stopped drained value, or `null` for a betted (finale) question. `results` is per joined player: `{seat, pick, correct, banked}` or `{seat, num, correct, banked}` (pick/num `null` if they never answered). Also carries `correctIdx` (normal/survey) or `trueNum` (num) — public now. Scores are final server-side totals; `scores` is an array by seat with `null` for empty seats. |
| `{t:'ended', scores}` | everyone | The host ended the show. |
| `{t:'error', msg}` | the sender only | The message was refused; nothing changed. |
| `{t:'pong'}` | the sender only | Reply to `ping`. |

### Timing, auto-close, expiry

- The window settles when the host sends `reveal`, **or** automatically
  at the deadline (a Durable Object alarm is set for every open
  question; any later message also triggers the settle first, so a
  late answer is refused in the reveal phase). The as-stopped value
  uses the settle moment, clamped to the window (so an auto-close at
  the deadline pays exactly the 50% floor).
- Rooms expire after ~2 hours with nobody connected and no activity:
  the alarm wipes storage. A room with anyone connected stays alive.
- All state is persisted to Durable Object storage on every change and
  restored on rebuild; socket identities ride along as WebSocket
  attachments, so a hibernated/evicted room object reconnects to its
  live sockets (the Dominoes pattern).

### Security notes

- Answers, numbers, and bets are write-only until reveal: the only
  pre-reveal broadcasts are counts. The answer key (`correctIdx` /
  `trueNum`) never reaches a player socket before reveal.
- The host token and per-seat reclaim tokens are 128-bit random hex.
  The host token is issued once, at `POST /room`; the server never
  broadcasts it. Reclaim tokens are per-seat and never leave their
  owner's socket.
- Nothing is stored beyond display names for the room's life; rooms
  wipe on expiry. No accounts, no PII.

## Deploy (documented, not yet deployed)

### Option A — Dashboard paste

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Create
   Worker**. Name it `gilded-hour-rooms` → **Deploy** (starter code is
   replaced next).
2. **Edit code** → select all, delete, paste the entire contents of
   `dist/worker.js` (regenerate first with `node build-single.js`) →
   **Save and deploy**.
3. Add the Durable Object binding: worker → **Settings** → **Bindings**
   → **Add binding** → **Durable Object**:
   - Variable name: `ROOMS`
   - Durable Object class: `GildedRoom`
   → **Save** (the dashboard redeploys with the binding).
4. Check: `https://gilded-hour-rooms.<your-subdomain>.workers.dev/health`
   should answer `gilded-hour-rooms ok`.

### Option B — Workers Builds / wrangler

1. Put this folder's sources (`server.js`, `room.js`, `wrangler.toml`)
   in a GitHub repo.
2. Dashboard → **Workers & Pages** → **Create** → **Import a
   repository**. Framework preset: **None**. The included
   `wrangler.toml` wires the `ROOMS` binding and applies the `v1`
   Durable Object migration on first deploy.
   (Equivalently: `npx wrangler deploy` from this folder.)
3. Every push redeploys automatically.

The game client (Pass 4b, not part of this pass) will point at the
deployed `wss://` URL; keep the URL configurable client-side, the way
the Dominoes client allows an override.

Deploys: Workers Builds from the Gamez repo (this folder). `npx wrangler deploy` applies the wrangler.toml config, including the ROOMS Durable Object binding and its v1 migration.
