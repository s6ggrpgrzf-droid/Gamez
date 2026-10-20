# dominoes-rooms

Cloudflare Worker + Durable Object server for the [Dominoes](https://s6ggrpgrzf-droid.github.io/Gamez/dominoes/) online multiplayer mode. One Durable Object instance per 4-letter room code; the game sim runs authoritatively on the server.

See [DEPLOY.md](DEPLOY.md) for setup (Workers Builds or dashboard paste) and the protocol.

- `server.js` — Worker entry + `DominoRoom` Durable Object
- `room.js` — pure room logic + JSON protocol
- `sim.js` — the game's sim, synced verbatim from the client (`sync-sim.sh` in the author's workspace re-extracts it)
- `wrangler.toml` — Worker name, `ROOMS` binding, `v1` migration
