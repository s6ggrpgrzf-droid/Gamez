/* The Gilded Hour online rooms — Cloudflare Worker + Durable Object.
 * One GildedRoom DO instance per 4-letter room code. Each room holds one
 * HOST connection (the show screen) and up to 4 player connections.
 * The room logic (room.js) is shared verbatim with the tests.
 * Deploy: `dist/worker.js` is the single-file build (dashboard paste),
 * or point wrangler at this file for Workers Builds.
 */
import { makeCode, makeToken, createRoom, snapshotFor, handleHello, handleHostMessage, handlePlayerMessage, expireIfNeeded, nowMs } from './room.js';

const ROOM_TTL_MS = 2 * 3600 * 1000;
const MAX_MSG_CHARS = 4096;
const RATE_MAX = 40;            // messages per socket per window
const RATE_WINDOW_MS = 10000;

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export class GildedRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.host = null;                    // host socket slot
    this.players = [null, null, null, null]; // player socket slots by seat
    this.pending = [];
    this.dead = new Set();               // closed sockets: never resurrect one from its attachment
    this.rate = new Map();               // ws -> {n, start, warned}
    this.room = null;
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get('room');
      if (saved) this.room = saved;
    });
  }

  async save() {
    if (!this.room) return;
    await this.ctx.storage.put('room', this.room);
  }

  // A Durable Object can be evicted and rebuilt while its WebSockets stay
  // connected (hibernation). In-memory socket slots are lost in a rebuild,
  // so each socket also carries its identity as an attachment, and the
  // live socket for an identity is looked up from the runtime when the
  // slot is empty (the Dominoes pattern, widened to host + 4 seats).
  attachmentOf(ws) {
    try {
      const a = ws.deserializeAttachment ? ws.deserializeAttachment() : null;
      if (a && a.role === 'host') return { role: 'host' };
      if (a && a.role === 'player' && Number.isInteger(a.seat) && a.seat >= 0 && a.seat < 4) {
        return { role: 'player', seat: a.seat };
      }
    } catch (e) { /* no attachment */ }
    return null;
  }

  destOf(ws) {
    if (this.dead.has(ws)) return null;
    if (this.host === ws) return 'host';
    for (let s = 0; s < 4; s++) if (this.players[s] === ws) return s;
    const a = this.attachmentOf(ws);
    if (!a) return null;
    if (a.role === 'host') { this.host = ws; return 'host'; }
    this.players[a.seat] = ws; // rehydrate the slot after a rebuild
    return a.seat;
  }

  liveSocket(dest) {
    const slot = dest === 'host' ? this.host : this.players[dest];
    if (slot && !this.dead.has(slot)) return slot;
    if (slot) { // the slot held a socket that has since closed
      if (dest === 'host') this.host = null;
      else this.players[dest] = null;
    }
    if (this.ctx.getWebSockets) {
      for (const ws of this.ctx.getWebSockets()) {
        if (this.dead.has(ws)) continue;
        const a = this.attachmentOf(ws);
        if (!a) continue;
        if (dest === 'host' && a.role === 'host') { this.host = ws; return ws; }
        if (dest !== 'host' && a.role === 'player' && a.seat === dest) {
          this.players[dest] = ws;
          return ws;
        }
      }
    }
    return null;
  }

  liveConns() {
    const out = [];
    const h = this.liveSocket('host');
    if (h) out.push({ dest: 'host', ws: h });
    for (let s = 0; s < 4; s++) {
      const ws = this.liveSocket(s);
      if (ws) out.push({ dest: s, ws });
    }
    return out;
  }

  sendRaw(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch (e) { /* dead socket */ }
  }

  sendTo(dest, msg) {
    const ws = this.liveSocket(dest);
    if (ws) this.sendRaw(ws, msg);
  }

  sendSnapshots() {
    if (!this.room) return;
    for (const { dest, ws } of this.liveConns()) {
      const view = dest === 'host' ? { role: 'host' } : { role: 'player', seat: dest };
      this.sendRaw(ws, { t: 'state', state: snapshotFor(this.room, view) });
    }
  }

  deliver(res, senderDest) {
    if (!res) return;
    for (const d of res.to || []) this.sendTo(d.dest, d.msg);
    if (res.all) {
      for (const { ws } of this.liveConns()) this.sendRaw(ws, res.all);
    }
    if (res.state) this.sendSnapshots();
    if (res.error != null && senderDest != null) {
      this.sendTo(senderDest, { t: 'error', msg: res.error });
    }
  }

  touch() {
    if (this.room) this.room.lastActivity = nowMs();
  }

  scheduleAlarm() {
    if (!this.room) return;
    let next = this.room.lastActivity + ROOM_TTL_MS;
    if (this.room.phase === 'answer' && this.room.question) {
      next = Math.min(next, this.room.question.deadline);
    }
    const at = Math.max(next, nowMs() + 50);
    this.ctx.storage.setAlarm(at).catch(() => {});
  }

  async expireAndDeliver() {
    const res = expireIfNeeded(this.room);
    if (res) {
      this.deliver(res, null);
      await this.save();
    }
    return res;
  }

  rateOk(ws) {
    const t = Date.now();
    let b = this.rate.get(ws);
    if (!b || t - b.start >= RATE_WINDOW_MS) {
      b = { n: 0, start: t, warned: false };
      this.rate.set(ws, b);
    }
    b.n++;
    if (b.n > RATE_MAX) {
      if (!b.warned) {
        b.warned = true;
        this.sendRaw(ws, { t: 'error', msg: 'Slow down.' });
      }
      return false;
    }
    return true;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!this.room) {
        if (!body.code || !body.hostToken) {
          return Response.json({ ok: false, error: 'code and hostToken required' }, { status: 400 });
        }
        this.room = createRoom(body.code, body.hostToken);
        await this.save();
        this.scheduleAlarm();
        return Response.json({ ok: true, created: true, code: this.room.code });
      }
      return Response.json({ ok: true, created: false, code: this.room.code });
    }
    if (url.pathname === '/join') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('WebSocket required', { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      this.pending.push(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('gilded-hour room', { status: 200 });
  }

  async webSocketMessage(ws, message) {
    if (typeof message === 'string' && message.length > MAX_MSG_CHARS) {
      this.sendRaw(ws, { t: 'error', msg: 'Message too large.' });
      return;
    }
    if (!this.rateOk(ws)) return;
    let msg;
    try { msg = JSON.parse(message); } catch (e) { return; } // malformed: ignore
    if (!this.room) {
      this.sendRaw(ws, { t: 'error', msg: 'Room expired.' });
      return;
    }
    // An expired window settles before anything else is processed, so a
    // late answer lands in the reveal phase and is refused there.
    await this.expireAndDeliver();

    const dest = this.destOf(ws);
    if (msg.t === 'hello') {
      if (dest != null) {
        this.sendRaw(ws, { t: 'error', msg: 'Already joined.' });
        return;
      }
      if (msg.role === 'host' && this.liveSocket('host') && this.liveSocket('host') !== ws) {
        this.sendRaw(ws, { t: 'error', msg: 'Host already connected.' });
        return;
      }
      if (msg.role === 'player' && msg.reclaimToken) {
        const seat = this.room.players.findIndex((p) => p && p.token === msg.reclaimToken);
        if (seat >= 0 && this.liveSocket(seat) && this.liveSocket(seat) !== ws) {
          this.sendRaw(ws, { t: 'error', msg: 'Seat is taken.' });
          return;
        }
      }
      const { identity, res } = handleHello(this.room, msg);
      if (!identity) {
        if (res.error) this.sendRaw(ws, { t: 'error', msg: res.error });
        return;
      }
      this.pending = this.pending.filter((s) => s !== ws);
      if (identity.role === 'host') {
        this.host = ws;
      } else {
        this.players[identity.seat] = ws;
        this.room.players[identity.seat].connected = true;
      }
      if (ws.serializeAttachment) {
        try { ws.serializeAttachment(identity); } catch (e) { /* non-fatal */ }
      }
      this.touch();
      this.deliver(res, identity.role === 'host' ? 'host' : identity.seat);
      await this.save();
      this.scheduleAlarm();
      return;
    }
    if (dest == null) {
      this.sendRaw(ws, { t: 'error', msg: 'Say hello first.' });
      return;
    }
    const res = dest === 'host'
      ? handleHostMessage(this.room, msg)
      : handlePlayerMessage(this.room, dest, msg);
    this.touch();
    this.deliver(res, dest);
    if (res.changed) await this.save();
    this.scheduleAlarm();
  }

  async webSocketClose(ws) {
    const dest = this.destOf(ws); // identify BEFORE marking the socket dead
    this.pending = this.pending.filter((s) => s !== ws);
    this.rate.delete(ws);
    if (this.host === ws) this.host = null;
    for (let s = 0; s < 4; s++) if (this.players[s] === ws) this.players[s] = null;
    this.dead.add(ws);
    // The seat itself stays reserved (name, score, reclaim token); only
    // the live flag drops, and the room sees the disconnect.
    if (this.room && dest != null && dest !== 'host' && this.room.players[dest]) {
      this.room.players[dest].connected = false;
      this.sendSnapshots();
      await this.save();
    }
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  async alarm() {
    if (!this.room) return;
    await this.expireAndDeliver();
    const anyLive = this.liveConns().length > 0;
    if (!anyLive && nowMs() - this.room.lastActivity >= ROOM_TTL_MS) {
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }
    this.scheduleAlarm();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response('gilded-hour-rooms ok', { status: 200 });
    }
    if (url.pathname === '/room') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: cors() });
      }
      if (request.method !== 'POST') {
        return new Response('POST to create a room', { status: 405, headers: cors() });
      }
      // Create a room; retry on the (rare) code collision with a live room.
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = makeCode();
        const hostToken = makeToken();
        const id = env.ROOMS.idFromName(code);
        const stub = env.ROOMS.get(id);
        const r = await stub.fetch(new Request('https://room/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, hostToken }),
        }));
        const j = await r.json().catch(() => ({}));
        if (j.created) {
          return Response.json({ code, hostToken }, { headers: cors() });
        }
      }
      return Response.json({ error: 'Could not create a room.' }, { status: 503, headers: cors() });
    }
    const m = url.pathname.match(/^\/room\/([A-Z0-9]{4})$/i);
    if (m) {
      const id = env.ROOMS.idFromName(m[1].toUpperCase());
      const stub = env.ROOMS.get(id);
      return stub.fetch(new Request('https://room/join', request));
    }
    return new Response('not found', { status: 404 });
  },
};
