'use strict';
/* ChessSim — pure chess rules + AI. No DOM. Board: index 0=a8 .. 63=h1.
   Pieces: uppercase = White ('P','N','B','R','Q','K'), lowercase = Black. */
const ChessSim = (() => {
  const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const fileOf = i => i & 7, rankOf = i => i >> 3; // rank 0 = rank8
  const sqName = i => 'abcdefgh'[fileOf(i)] + (8 - rankOf(i));
  const sqFromName = s => (s.charCodeAt(0) - 97) + (8 - (s.charCodeAt(1) - 48)) * 8;
  const isW = p => p && p === p.toUpperCase();
  const colorOf = p => (isW(p) ? 'w' : 'b');
  const opp = c => (c === 'w' ? 'b' : 'w');

  function parseFEN(fen) {
    const parts = fen.trim().split(/\s+/);
    const rows = parts[0].split('/');
    const b = new Array(64).fill(null);
    for (let r = 0; r < 8; r++) {
      let f = 0;
      for (const ch of rows[r]) {
        if (/\d/.test(ch)) f += +ch;
        else { b[r * 8 + f] = ch; f++; }
      }
    }
    const cast = { K: false, Q: false, k: false, q: false };
    if (parts[2] && parts[2] !== '-') for (const c of parts[2]) cast[c] = true;
    const st = {
      b, turn: parts[1] || 'w', cast,
      ep: parts[3] && parts[3] !== '-' ? sqFromName(parts[3]) : -1,
      half: parts[4] ? +parts[4] : 0, full: parts[5] ? +parts[5] : 1,
      undo: [], sanList: [], rep: {}, over: null
    };
    st.rep[posKey(st)] = 1;
    return st;
  }
  function posKey(st) {
    let s = '';
    for (let i = 0; i < 64; i++) s += st.b[i] || '.';
    s += st.turn;
    s += (st.cast.K ? 'K' : '') + (st.cast.Q ? 'Q' : '') + (st.cast.k ? 'k' : '') + (st.cast.q ? 'q' : '');
    s += st.ep >= 0 ? st.ep : '-';
    return s;
  }
  function toFEN(st) {
    let out = '';
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = st.b[r * 8 + f];
        if (!p) empty++;
        else { if (empty) { out += empty; empty = 0; } out += p; }
      }
      if (empty) out += empty;
      if (r < 7) out += '/';
    }
    const c = (st.cast.K ? 'K' : '') + (st.cast.Q ? 'Q' : '') + (st.cast.k ? 'k' : '') + (st.cast.q ? 'q' : '');
    return out + ' ' + st.turn + ' ' + (c || '-') + ' ' + (st.ep >= 0 ? sqName(st.ep) : '-') + ' ' + st.half + ' ' + st.full;
  }

  function isAttacked(b, sq, by) {
    const f = fileOf(sq), r = rankOf(sq);
    // pawns: a white pawn attacks from one rank below (r+1 in our coords), black from r-1
    const pr = by === 'w' ? r + 1 : r - 1;
    if (pr >= 0 && pr < 8) for (const df of [-1, 1]) {
      const pf = f + df; if (pf < 0 || pf > 7) continue;
      if (b[pr * 8 + pf] === (by === 'w' ? 'P' : 'p')) return true;
    }
    for (const [df, dr] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]) {
      const nf = f + df, nr = r + dr; if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
      if (b[nr * 8 + nf] === (by === 'w' ? 'N' : 'n')) return true;
    }
    for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
      if (!df && !dr) continue;
      const nf = f + df, nr = r + dr; if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
      if (b[nr * 8 + nf] === (by === 'w' ? 'K' : 'k')) return true;
    }
    const rays = [
      { dirs: [[1,0],[-1,0],[0,1],[0,-1]], types: 'rq' },
      { dirs: [[1,1],[1,-1],[-1,1],[-1,-1]], types: 'bq' }
    ];
    for (const { dirs, types } of rays) for (const [df, dr] of dirs) {
      let nf = f + df, nr = r + dr;
      while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
        const p = b[nr * 8 + nf];
        if (p) { if (colorOf(p) === by && types.includes(p.toLowerCase())) return true; break; }
        nf += df; nr += dr;
      }
    }
    return false;
  }
  const kingSq = (b, c) => b.indexOf(c === 'w' ? 'K' : 'k');
  const inCheck = (st, c) => isAttacked(st.b, kingSq(st.b, c), opp(c));

  function pseudoMoves(st, capturesOnly) {
    const moves = [], b = st.b, turn = st.turn;
    const add = (from, to, extra) => moves.push(Object.assign({ from, to, piece: b[from], cap: b[to] || null }, extra || {}));
    for (let i = 0; i < 64; i++) {
      const p = b[i]; if (!p || colorOf(p) !== turn) continue;
      const f = fileOf(i), r = rankOf(i), t = p.toLowerCase();
      if (t === 'p') {
        const dir = turn === 'w' ? -1 : 1, startR = turn === 'w' ? 6 : 1, promoR = turn === 'w' ? 0 : 7;
        const oneR = r + dir;
        if (!capturesOnly && oneR >= 0 && oneR < 8 && !b[oneR * 8 + f]) {
          if (oneR === promoR) for (const pr of ['q','r','b','n']) add(i, oneR * 8 + f, { promo: turn === 'w' ? pr.toUpperCase() : pr });
          else {
            add(i, oneR * 8 + f);
            const twoR = r + 2 * dir;
            if (r === startR && !b[twoR * 8 + f]) add(i, twoR * 8 + f, { dbl: true });
          }
        }
        for (const df of [-1, 1]) {
          const nf = f + df, nr = r + dir; if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
          const to = nr * 8 + nf, tp = b[to];
          if (tp && colorOf(tp) !== turn) {
            if (nr === promoR) for (const pr of ['q','r','b','n']) add(i, to, { promo: turn === 'w' ? pr.toUpperCase() : pr });
            else add(i, to);
          } else if (!tp && to === st.ep) add(i, to, { epCap: true, cap: turn === 'w' ? 'p' : 'P' });
        }
        continue;
      }
      if (capturesOnly && t !== 'k') { /* still need captures for sliders/knights below */ }
      const steps = t === 'n' ? [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]
        : t === 'k' ? [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]] : null;
      if (steps) {
        for (const [df, dr] of steps) {
          const nf = f + df, nr = r + dr; if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
          const to = nr * 8 + nf, tp = b[to];
          if (!tp) { if (!capturesOnly) add(i, to); }
          else if (colorOf(tp) !== turn) add(i, to);
        }
        if (t === 'k' && !capturesOnly) {
          const home = turn === 'w' ? 60 : 4;
          if (i === home && !inCheck(st, turn)) {
            const enemy = opp(turn);
            const tryCastle = (rookFrom, kingTo, between, rights) => {
              if (!rights || b[rookFrom] !== (turn === 'w' ? 'R' : 'r')) return;
              for (const s of between) if (b[s]) return;
              const path = kingTo > home ? [home + 1, home + 2] : [home - 1, home - 2];
              for (const s of path) if (isAttacked(b, s, enemy)) return;
              add(i, kingTo, { castle: kingTo > home ? 'K' : 'Q' });
            };
            if (turn === 'w') { tryCastle(63, 62, [61, 62], st.cast.K); tryCastle(56, 58, [57, 58, 59], st.cast.Q); }
            else { tryCastle(7, 6, [5, 6], st.cast.k); tryCastle(0, 2, [1, 2, 3], st.cast.q); }
          }
        }
        continue;
      }
      const dirs = t === 'r' ? [[1,0],[-1,0],[0,1],[0,-1]] : t === 'b' ? [[1,1],[1,-1],[-1,1],[-1,-1]]
        : [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      for (const [df, dr] of dirs) {
        let nf = f + df, nr = r + dr;
        while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
          const to = nr * 8 + nf, tp = b[to];
          if (!tp) { if (!capturesOnly) add(i, to); }
          else { if (colorOf(tp) !== turn) add(i, to); break; }
          nf += df; nr += dr;
        }
      }
    }
    return moves;
  }

  function rawApply(st, m) {
    const b = st.b.slice();
    b[m.from] = null;
    b[m.to] = m.promo || m.piece;
    if (m.epCap) b[m.to + (st.turn === 'w' ? 8 : -8)] = null;
    if (m.castle) {
      if (m.to === 62) { b[61] = b[63]; b[63] = null; }
      if (m.to === 58) { b[59] = b[56]; b[56] = null; }
      if (m.to === 6) { b[5] = b[7]; b[7] = null; }
      if (m.to === 2) { b[3] = b[0]; b[0] = null; }
    }
    const cast = Object.assign({}, st.cast);
    if (m.piece === 'K') { cast.K = cast.Q = false; }
    if (m.piece === 'k') { cast.k = cast.q = false; }
    if (m.from === 63 || m.to === 63) cast.K = false;
    if (m.from === 56 || m.to === 56) cast.Q = false;
    if (m.from === 7 || m.to === 7) cast.k = false;
    if (m.from === 0 || m.to === 0) cast.q = false;
    return {
      b, turn: opp(st.turn), cast,
      ep: m.dbl ? (m.from + m.to) / 2 : -1,
      half: (m.piece.toLowerCase() === 'p' || m.cap) ? 0 : st.half + 1,
      full: st.full + (st.turn === 'b' ? 1 : 0),
      undo: st.undo, sanList: st.sanList, rep: st.rep, over: null
    };
  }
  function legalMoves(st, capturesOnly) {
    return pseudoMoves(st, !!capturesOnly).filter(m => {
      const ns = rawApply(st, m);
      return !isAttacked(ns.b, kingSq(ns.b, st.turn), ns.turn);
    });
  }
  function sanFor(st, m, legal) {
    if (m.castle) return m.castle === 'K' ? 'O-O' : 'O-O-O';
    const t = m.piece.toLowerCase();
    let s = '';
    if (t === 'p') {
      if (m.cap || m.epCap) s += 'abcdefgh'[fileOf(m.from)] + 'x';
      s += sqName(m.to);
      if (m.promo) s += '=' + m.promo.toUpperCase();
    } else {
      s += t.toUpperCase().replace('N', 'N');
      const others = legal.filter(x => x.piece === m.piece && x.to === m.to && x.from !== m.from);
      if (others.length) {
        const sameFile = others.some(x => fileOf(x.from) === fileOf(m.from));
        const sameRank = others.some(x => rankOf(x.from) === rankOf(m.from));
        if (!sameFile) s += 'abcdefgh'[fileOf(m.from)];
        else if (!sameRank) s += (8 - rankOf(m.from));
        else s += sqName(m.from);
      }
      if (m.cap) s += 'x';
      s += sqName(m.to);
    }
    return s;
  }
  function insufficientMaterial(st) {
    const minors = [];
    for (let i = 0; i < 64; i++) {
      const p = st.b[i]; if (!p) continue;
      const t = p.toLowerCase();
      if (t === 'p' || t === 'r' || t === 'q') return false;
      if (t === 'b' || t === 'n') minors.push({ t, sqColor: (fileOf(i) + rankOf(i)) % 2, c: colorOf(p) });
    }
    if (minors.length <= 1) return true;
    if (minors.every(m => m.t === 'b') && minors.every(m => m.sqColor === minors[0].sqColor)) return true;
    return false;
  }
  function applyMove(st, m) {
    const legal = legalMoves(st);
    const san0 = sanFor(st, m, legal);
    st.undo.push({ b: st.b, cast: st.cast, ep: st.ep, half: st.half, full: st.full, turn: st.turn, over: st.over, key: posKey(st) });
    const ns = rawApply(st, m);
    st.b = ns.b; st.cast = ns.cast; st.ep = ns.ep; st.half = ns.half; st.full = ns.full; st.turn = ns.turn;
    const key = posKey(st);
    st.rep[key] = (st.rep[key] || 0) + 1;
    const replies = legalMoves(st);
    const chk = inCheck(st, st.turn);
    let san = san0 + (chk ? (replies.length ? '+' : '#') : '');
    st.sanList.push(san);
    st.over = null;
    if (!replies.length) st.over = chk ? { result: st.turn === 'w' ? '0-1' : '1-0', reason: 'checkmate', text: 'Checkmate' }
      : { result: '1/2-1/2', reason: 'stalemate', text: 'Draw — stalemate' };
    else if (insufficientMaterial(st)) st.over = { result: '1/2-1/2', reason: 'material', text: 'Draw — not enough material to mate' };
    else if (st.half >= 100) st.over = { result: '1/2-1/2', reason: 'fifty', text: 'Draw — fifty moves without a pawn move or capture' };
    else if (st.rep[key] >= 3) st.over = { result: '1/2-1/2', reason: 'repetition', text: 'Draw — same position three times' };
    return san;
  }
  function undoMove(st) {
    const u = st.undo.pop(); if (!u) return false;
    const key = posKey(st); if (st.rep[key]) st.rep[key]--;
    st.b = u.b; st.cast = u.cast; st.ep = u.ep; st.half = u.half; st.full = u.full; st.turn = u.turn; st.over = u.over;
    st.sanList.pop();
    return true;
  }
  function perft(st, depth) {
    if (depth === 0) return 1;
    let n = 0;
    for (const m of legalMoves(st)) {
      const ns = rawApply(st, m);
      ns.undo = []; ns.sanList = []; ns.rep = {};
      n += perft(ns, depth - 1);
    }
    return n;
  }

  /* ---------- AI ---------- */
  // Piece-square tables, written rank8-first for White; Black mirrors vertically.
  const PST = {
    p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,0,10,15,15,10,0,-30, -30,5,0,0,0,0,5,-30, -50,-40,-30,-30,-30,-30,-40,-50],
    b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20]
  };
  function evaluate(st) {
    let score = 0;
    for (let i = 0; i < 64; i++) {
      const p = st.b[i]; if (!p) continue;
      const t = p.toLowerCase();
      const idx = isW(p) ? i : (7 - rankOf(i)) * 8 + fileOf(i);
      const v = VAL[t] + (PST[t] ? PST[t][idx] : 0);
      score += isW(p) ? v : -v;
    }
    return st.turn === 'w' ? score : -score;
  }
  let nodes = 0, deadline = 0;
  function orderMoves(st, moves) {
    for (const m of moves) {
      let s = 0;
      if (m.cap) s = 10000 + VAL[m.cap.toLowerCase()] * 10 - VAL[m.piece.toLowerCase()] / 10;
      if (m.promo) s += 9000 + VAL[m.promo.toLowerCase()];
      m._o = s;
    }
    moves.sort((a, b) => b._o - a._o);
    return moves;
  }
  function qsearch(st, alpha, beta) {
    nodes++;
    const stand = evaluate(st);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    for (const m of orderMoves(st, legalMoves(st, true))) {
      const ns = rawApply(st, m);
      const sc = -qsearch(ns, -beta, -alpha);
      if (sc >= beta) return beta;
      if (sc > alpha) alpha = sc;
      if ((nodes & 2047) === 0 && Date.now() > deadline) return alpha;
    }
    return alpha;
  }
  function search(st, depth, alpha, beta, ply) {
    if (depth === 0) return qsearch(st, alpha, beta);
    nodes++;
    if ((nodes & 2047) === 0 && Date.now() > deadline) return alpha;
    const moves = orderMoves(st, legalMoves(st));
    if (!moves.length) return inCheck(st, st.turn) ? -100000 + ply : 0;
    if (insufficientMaterial(st) || st.half >= 100) return 0;
    let best = -Infinity;
    for (const m of moves) {
      const ns = rawApply(st, m);
      const sc = -search(ns, depth - 1, -beta, -alpha, ply + 1);
      if (sc > best) best = sc;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    return best;
  }
  const LEVELS = [
    { name: 'Beginner', depth: 1, window: 220, randomChance: 0.12, blurb: 'Learning the ropes — plays real chess, misses things, beatable from game one.' },
    { name: 'Intermediate', depth: 2, window: 60, randomChance: 0, blurb: 'Solid club basics — spots tactics, rarely hangs a piece.' },
    { name: 'Advanced', depth: 3, window: 12, randomChance: 0, blurb: 'Sharp and patient — punishes mistakes, plans ahead.' },
    { name: 'Master', depth: 4, window: 0, randomChance: 0, blurb: 'The full engine — deepest search, best move it can find.' }
  ];
  function chooseMove(st, levelIdx, rng) {
    rng = rng || Math.random;
    const L = LEVELS[levelIdx] || LEVELS[1];
    const moves = legalMoves(st);
    if (!moves.length) return null;
    if (rng() < (L.randomChance || 0)) return moves[Math.floor(rng() * moves.length)];
    nodes = 0; deadline = Date.now() + (levelIdx >= 3 ? 2200 : 1200);
    const scored = [];
    let alpha = -Infinity;
    for (const m of orderMoves(st, moves)) {
      const ns = rawApply(st, m);
      const sc = moves.length === 1 ? 0 : -search(ns, L.depth - 1, -Infinity, Infinity, 1);
      scored.push({ m, sc });
      if (sc > alpha) alpha = sc;
    }
    scored.sort((a, b) => b.sc - a.sc);
    const best = scored[0].sc;
    const pool = scored.filter(x => best - x.sc <= L.window);
    return pool[Math.floor(rng() * pool.length)].m;
  }
  function hintMove(st) {
    nodes = 0; deadline = Date.now() + 1500;
    const moves = orderMoves(st, legalMoves(st));
    let best = null, bs = -Infinity;
    for (const m of moves) {
      const ns = rawApply(st, m);
      const sc = -search(ns, 2, -Infinity, Infinity, 1);
      if (sc > bs) { bs = sc; best = m; }
    }
    return best;
  }
  return { START_FEN, parseFEN, toFEN, posKey, legalMoves, applyMove, undoMove, inCheck, perft, chooseMove, hintMove, LEVELS, sqName, sqFromName, VAL };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ChessSim;
