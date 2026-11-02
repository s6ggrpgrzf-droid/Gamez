/* Sugar Trail — Pass 1 sim. Pure logic: no DOM, no canvas, no Math.random.
 * A faithful Candy Land-style race, with original names/art direction:
 *   - 134-space winding color path (indices 0..133); index 133 is the Castle.
 *   - Colors cycle R,P,Y,B,O,G over the ordinary spaces.
 *   - 6 pink picture spaces at the classic positions, with our own cast.
 *   - 2 shortcuts (land exactly on the foot), 3 licorice spaces (miss a turn).
 *   - Deck: 66 cards — per color 8 singles + 2 doubles (60) + 6 picture cards.
 *   - Picture cards move forward OR backward to their space (classic rule).
 *   - A color move with no matching space left ahead reaches the Castle.
 * Layout indices adapted from published classic-board analyses
 * (specials 8/17/42/74/94/103, licorice 47/85/120, shortcuts 4->58, 33->46).
 */
'use strict';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PATH_LEN = 134;
const CASTLE = 133;
const COLORS = ['R', 'P', 'Y', 'B', 'O', 'G'];
const COLOR_NAMES = { R: 'Red', P: 'Purple', Y: 'Yellow', B: 'Blue', O: 'Orange', G: 'Green' };

/* Our own cast on the classic pink slots — name, treat, greeting. */
const SPECIALS = {
  8:   { id: 'plum',   name: 'Poppy Plum',      treat: 'Plum Drop' },
  17:  { id: 'mint',   name: 'Milo Mint',       treat: 'Mint Leaf' },
  42:  { id: 'jelly',  name: 'Bea Jelly',       treat: 'Jelly Bean' },
  74:  { id: 'toffee', name: 'Nana Toffee',     treat: 'Toffee Bit' },
  94:  { id: 'swirl',  name: 'Princess Swirl',  treat: 'Swirl Pop' },
  103: { id: 'snow',   name: 'Queen Snowcap',   treat: 'Snow Cone' },
};
const LICORICE = [47, 85, 120];
const SHORTCUTS = { 4: 58, 33: 46 };

function spaceColor(i) {
  if (i === CASTLE || SPECIALS[i]) return null;
  return COLORS[i % 6];
}
function buildPath() {
  const path = [];
  for (let i = 0; i < PATH_LEN; i++) {
    path.push({
      i,
      color: spaceColor(i),
      special: SPECIALS[i] || null,
      licorice: LICORICE.includes(i),
      shortcutTo: SHORTCUTS[i] || null,
      castle: i === CASTLE,
    });
  }
  return path;
}

function buildDeck() {
  const deck = [];
  for (const c of COLORS) {
    for (let k = 0; k < 8; k++) deck.push({ kind: 'color', color: c, count: 1 });
    for (let k = 0; k < 2; k++) deck.push({ kind: 'color', color: c, count: 2 });
  }
  for (const idx of Object.keys(SPECIALS)) {
    deck.push({ kind: 'picture', special: SPECIALS[idx].id, to: Number(idx) });
  }
  return deck;
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* players: [{name, kind:'human'|'auto', pawn:'red'|...}] — 1..4 players.
 * seed: integer. Positions start at -1 (the Start step, before space 0). */
function createGame(opts) {
  const rng = mulberry32(opts.seed >>> 0);
  return {
    seed: opts.seed >>> 0,
    rngState: null, // rng is a closure; kept live on the object below instead
    _rng: rng,
    path: buildPath(),
    draw: shuffle(buildDeck(), rng),
    discard: [],
    players: opts.players.map((p, k) => ({
      name: p.name, kind: p.kind, pawn: p.pawn || ['red', 'blue', 'yellow', 'green'][k % 4],
      pos: -1, missTurn: false, turns: 0,
    })),
    turn: 0,          // index into players
    round: 1,
    winner: null,
    over: false,
    log: [],
  };
}

function nextColorSpace(state, from, color, count) {
  let seen = 0;
  for (let i = from + 1; i < CASTLE; i++) {
    if (state.path[i].color === color) {
      seen++;
      if (seen === count) return i;
    }
  }
  return CASTLE; // no matching space left — the road runs to the Castle
}

/* One full turn for the current player. If the player is stuck on licorice,
 * no card is drawn and the turn is simply lost (modern rule, Jimmy's pick 3A).
 * Returns an event describing everything the UI needs to animate. */
function takeTurn(state) {
  if (state.over) return { type: 'over' };
  const p = state.players[state.turn];
  p.turns++;

  if (p.missTurn) {
    p.missTurn = false;
    const ev = { type: 'skip', player: state.turn, name: p.name, at: p.pos };
    state.log.push(ev);
    advance(state);
    return ev;
  }

  if (state.draw.length === 0) {
    state.draw = shuffle(state.discard, state._rng);
    state.discard = [];
  }
  const card = state.draw.pop();
  state.discard.push(card);
  const from = p.pos;
  let to, via = null;

  if (card.kind === 'picture') {
    to = card.to;
  } else {
    to = nextColorSpace(state, from, card.color, card.count);
  }

  p.pos = to;
  let shortcut = null;
  if (state.path[to] && state.path[to].shortcutTo != null) {
    shortcut = { from: to, to: state.path[to].shortcutTo };
    p.pos = shortcut.to;
    to = shortcut.to;
  }
  let licorice = false;
  if (state.path[p.pos] && state.path[p.pos].licorice) {
    p.missTurn = true;
    licorice = true;
  }
  let win = false;
  if (p.pos >= CASTLE) {
    p.pos = CASTLE;
    win = true;
    state.over = true;
    state.winner = state.turn;
  }
  const ev = {
    type: 'move', player: state.turn, name: p.name, card,
    from, landed: card.kind === 'picture' ? card.to : (shortcut ? shortcut.from : to),
    to: p.pos, shortcut, licorice, win,
  };
  state.log.push(ev);
  if (!state.over) advance(state);
  return ev;
}

function advance(state) {
  state.turn++;
  if (state.turn >= state.players.length) { state.turn = 0; state.round++; }
}

const ST = { mulberry32, PATH_LEN, CASTLE, COLORS, COLOR_NAMES, SPECIALS, LICORICE, SHORTCUTS, buildPath, buildDeck, createGame, takeTurn, nextColorSpace };
if (typeof module !== 'undefined' && module.exports) module.exports = ST;
if (typeof window !== 'undefined') window.ST = ST;
