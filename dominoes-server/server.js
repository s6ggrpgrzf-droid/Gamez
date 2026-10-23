/* Dominoes online rooms — Cloudflare Worker + Durable Object.
 * One DominoRoom DO instance per 4-letter room code.
 * The sim (sim.js) and room logic (room.js) are shared verbatim with tests.
 * Deploy: `dist/worker.js` is the single-file build (dashboard paste),
 * or point wrangler at this file for Workers Builds.
 */
import { makeCode, createRoom, publicState, handleHello, handleMessage } from './room.js';
import Sim from './sim.js';

const ROOM_TTL_MS = 2 * 3600 * 1000;

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export class DominoRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sockets = [null, null];
    this.pending = [];
    this.room = null;
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get('room');
      if (saved) {
        this.room = saved;
        // The sim is stored as a Sim.snapshot string: it carries the node-id
        // counter, which module state alone would lose across evictions.
        const snap = await ctx.storage.get('simSnap');
        if (snap) this.room.sim = Sim.restore(snap);
      }
    });
  }

  async save() {
    if (!this.room) return;
    const { sim, ...rest } = this.room;
    await this.ctx.storage.put('room', rest);
    if (sim) await this.ctx.storage.put('simSnap', Sim.snapshot(sim));
    else await this.ctx.storage.delete('simSnap');
  }

  sendTo(seat, msg) {
    const ws = this.sockets[seat];
    if (!ws) return;
    try { ws.send(JSON.stringify(msg)); } catch (e) { /* dead socket */ }
  }

  broadcastState() {
    for (const seat of [0, 1]) {
      if (!this.sockets[seat] || !this.room) continue;
      this.sendTo(seat, { t: 'state', state: publicState(this.room, seat) });
    }
  }

  deliver(res, fromSeat) {
    for (const d of res.to || []) this.sendTo(d.seat, d.msg);
    if (res.broadcast) this.broadcastState();
    if (res.error != null && fromSeat != null && fromSeat >= 0) {
      this.sendTo(fromSeat, { t: 'error', msg: res.error });
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!this.room) {
        this.room = createRoom(body.code, body.mode, body.target);
        await this.save();
        await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
      }
      return Response.json({ ok: true, code: this.room.code });
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
    return new Response('dominoes room', { status: 200 });
  }

  async webSocketMessage(ws, message) {
    let msg;
    try { msg = JSON.parse(message); } catch (e) { return; }
    if (!this.room) {
      try { ws.send(JSON.stringify({ t: 'error', msg: 'Room expired.' })); } catch (e) {}
      return;
    }
    const liveSeat = this.sockets[0] === ws ? 0 : this.sockets[1] === ws ? 1 : -1;
    if (msg.t === 'hello') {
      const want = (msg.seat === 0 || msg.seat === 1) ? msg.seat : -1;
      if (want >= 0 && this.sockets[want] && this.sockets[want] !== ws) {
        try { ws.send(JSON.stringify({ t: 'error', msg: 'Seat is taken.' })); } catch (e) {}
        return;
      }
      const { seat, res } = handleHello(this.room, want, msg.name);
      if (seat === -1) {
        try { ws.send(JSON.stringify({ t: 'error', msg: res.error || 'Room is full.' })); } catch (e) {}
        return;
      }
      this.pending = this.pending.filter((s) => s !== ws);
      this.sockets[seat] = ws;
      await this.save();
      this.deliver(res, seat);
      await this.save();
      return;
    }
    if (liveSeat === -1) {
      try { ws.send(JSON.stringify({ t: 'error', msg: 'Say hello first.' })); } catch (e) {}
      return;
    }
    const res = handleMessage(this.room, liveSeat, msg);
    this.deliver(res, liveSeat);
    if (res.changed) await this.save();
  }

  async webSocketClose(ws) {
    this.pending = this.pending.filter((s) => s !== ws);
    for (const s of [0, 1]) if (this.sockets[s] === ws) this.sockets[s] = null;
    await this.save();
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  async alarm() {
    if (!this.sockets[0] && !this.sockets[1]) {
      await this.ctx.storage.deleteAll();
    } else {
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/create') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: cors() });
      }
      const mode = url.searchParams.get('mode');
      const target = parseInt(url.searchParams.get('target') || '100', 10);
      const code = makeCode();
      const id = env.ROOMS.idFromName(code);
      const stub = env.ROOMS.get(id);
      await stub.fetch(new Request('https://room/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, mode, target }),
      }));
      return Response.json({ code }, { headers: cors() });
    }
    const m = url.pathname.match(/^\/room\/([A-Z0-9]{4})$/i);
    if (m) {
      const id = env.ROOMS.idFromName(m[1].toUpperCase());
      const stub = env.ROOMS.get(id);
      return stub.fetch(new Request('https://room/join', request));
    }
    return new Response('dominoes-rooms ok', { status: 200 });
  },
};
