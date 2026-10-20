/* Dominoes online rooms — pure game-room logic, no Cloudflare APIs.
 * A "room" is a plain JSON-serializable object; sockets are passed in.
 * worker.js (Durable Object) is a thin wrapper around this file.
 *
 * Protocol (JSON over WebSocket):
 *   C->S  {t:'hello', code, seat (-1 new | 0 | 1 reclaim), name}
 *         {t:'move', tileIdx, end}   {t:'draw'}   {t:'knock'}
 *         {t:'next'}  (both players vote -> next round / new match)
 *         {t:'ping'}
 *   S->C  {t:'welcome', you, code}
 *         {t:'state', state}   (full public snapshot, both players)
 *         {t:'error', msg}
 *         {t:'pong'}
 */
import Sim from './sim.js';

export const CODE_LEN = 4;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/L/O/0/1

export function makeCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_CHARS[(rand() * CODE_CHARS.length) | 0];
  return s;
}

export function createRoom(code, mode, target) {
  return {
    code,
    mode: mode === 'fives' ? 'fives' : 'draw',
    target: [50, 100, 150].includes(target) ? target : 100,
    phase: 'lobby',            // lobby | play
    sim: null,                 // Sim state once both seats filled
    seats: [null, null],       // {name} per seat, null = empty
    votes: [false, false],     // next-round / rematch votes
    createdAt: Date.now(),
  };
}

function newSeed() {
  return (Date.now() ^ ((Math.random() * 1e9) >>> 0)) >>> 0;
}

export function startGame(room) {
  room.sim = Sim.newGame(newSeed(), room.target, room.mode);
  room.phase = 'play';
  room.votes = [false, false];
}

// Public snapshot for one seat. Opponent tiles are never included.
export function publicState(room, seat) {
  const sim = room.sim;
  const base = {
    code: room.code,
    mode: room.mode,
    target: room.target,
    phase: room.phase,
    you: seat,
    turn: sim ? sim.turn : 0,
    simPhase: sim ? sim.phase : 'lobby',
    names: [room.seats[0] ? room.seats[0].name : null, room.seats[1] ? room.seats[1].name : null],
    seatsFull: room.seats[0] != null && room.seats[1] != null,
    votes: room.votes.slice(),
  };
  if (!sim) {
    base.hand = []; base.oppCount = 0; base.board = []; base.bone = 0;
    base.scores = [0, 0]; base.fives = [0, 0];
    return base;
  }
  // hands are public once a round ends
  if (sim.phase !== 'play') {
    base.oppHand = sim.hands[1 - seat].map((t) => ({ a: t.a, b: t.b }));
  }
  return Object.assign(base, {
    hand: sim.hands[seat].map((t) => ({ a: t.a, b: t.b })),
    oppCount: sim.hands[1 - seat].length,
    board: sim.board.map((n) => ({ id: n.id, a: n.a, b: n.b, headVal: n.headVal, opener: !!n.opener })),
    bone: sim.boneyard.length,
    scores: sim.scores.slice(),
    fives: sim.fives.slice(),
    round: sim.round,
    roundPts: sim.roundPts,
    roundReason: sim.roundReason,
    winner: sim.winner,
    events: sim.lastEvents,
  });
}

// result: {to: [{seat, msg}], broadcast: msg|null, changed: bool, error: msg|null}
function fail(msg) { return { to: [], broadcast: null, changed: false, error: msg }; }

export function handleHello(room, seat, name) {
  const clean = String(name || '').slice(0, 16) || ('Player ' + (seat + 1));
  if (seat === 0 || seat === 1) {
    // reclaim (socket may have died; seat stays reserved)
    room.seats[seat] = { name: clean };
  } else {
    const open = room.seats[0] == null ? 0 : room.seats[1] == null ? 1 : -1;
    if (open === -1) return { seat: -1, res: fail('Room is full.') };
    room.seats[open] = { name: clean };
    seat = open;
  }
  const res = { to: [{ seat, msg: { t: 'welcome', you: seat, code: room.code } }], broadcast: null, changed: true, error: null };
  if (room.seats[0] && room.seats[1] && room.phase === 'lobby') {
    startGame(room);
  }
  res.broadcast = { t: 'state', state: null }; // per-seat snapshot filled by caller
  return { seat, res };
}

export function handleMessage(room, seat, msg) {
  if (!msg || typeof msg.t !== 'string') return fail('Bad message.');
  if (seat !== 0 && seat !== 1) return fail('Join first.');
  switch (msg.t) {
    case 'ping':
      return { to: [{ seat, msg: { t: 'pong' } }], broadcast: null, changed: false, error: null };
    case 'next': {
      if (!room.sim) return fail('No game yet.');
      if (room.sim.phase !== 'roundEnd' && room.sim.phase !== 'matchEnd') return fail('Not between rounds.');
      room.votes[seat] = true;
      if (room.votes[0] && room.votes[1]) {
        if (room.sim.phase === 'matchEnd') {
          room.sim = Sim.newGame(newSeed(), room.target, room.mode);
        } else {
          Sim.nextRound(room.sim);
        }
        room.votes = [false, false];
      }
      return { to: [], broadcast: { t: 'state', state: null }, changed: true, error: null };
    }
    case 'move':
    case 'draw':
    case 'knock': {
      if (!room.sim || room.phase !== 'play') return fail('No active game.');
      const sim = room.sim;
      if (sim.phase !== 'play') return fail('Round is over.');
      if (sim.turn !== seat) return fail('Not your turn.');
      let r;
      if (msg.t === 'move') {
        const idx = msg.tileIdx | 0, end = msg.end === 'head' ? 'head' : 'tail';
        const legal = Sim.legalMoves(sim.hands[seat], Sim.exposed(sim));
        if (!legal.some((m) => m.tileIdx === idx && m.end === end)) return fail('Illegal move.');
        r = Sim.playTile(sim, seat, idx, end);
      } else if (msg.t === 'draw') {
        if (Sim.canPlay(sim, seat) || !sim.boneyard.length) return fail('Cannot draw now.');
        r = Sim.drawTile(sim, seat);
      } else {
        if (Sim.canPlay(sim, seat) || sim.boneyard.length) return fail('Cannot knock now.');
        r = Sim.knock(sim, seat);
      }
      if (!r.ok) return fail('Move rejected.');
      return { to: [], broadcast: { t: 'state', state: null }, changed: true, error: null };
    }
    default:
      return fail('Unknown message.');
  }
}
