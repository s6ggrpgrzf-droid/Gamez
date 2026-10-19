/* Dominoes — table UI. DOM tiles, serpentine board, drag/drop, juice.
 * Sim: window.DomSim (pure). Audio: window.DomAudio (synth). */
'use strict';
(function () {
  const Sim = window.DomSim, AU = window.DomAudio;
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // board tile geometry (px, pre-scale)
  const TW = 44, TH = 88, GAP = 10;
  const ROWLEN = 6 * (TH + GAP);
  const LS_DIFF = 'dominoes.diff';

  const PIPS = { 0: [], 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };

  let S = null;                 // sim state
  let difficulty = 1;
  try { difficulty = parseInt(localStorage.getItem(LS_DIFF) || '1', 10) || 0; } catch (e) {}
  let uiPhase = 'title';        // title|dealing|play|roundEnd|matchEnd
  let busy = false;
  const boardEls = new Map();   // nodeId -> element
  let rackTiles = [];           // {a,b} in hand order
  let selected = -1;            // selected rack index
  let lastSlots = null;         // layout cache for endzone hit-testing

  /* ---------------- tile DOM ---------------- */
  function halfHTML(v) {
    let s = '';
    for (let i = 1; i <= 9; i++) s += '<span class="pip' + (PIPS[v].indexOf(i) >= 0 ? ' on' : '') + '"></span>';
    return '<div class="half">' + s + '</div>';
  }
  function makeTile(a, b, faceDown) {
    const el = document.createElement('div');
    el.className = 'tile' + (faceDown ? ' back' : '');
    if (!faceDown) el.innerHTML = halfHTML(a) + '<div class="div"></div>' + halfHTML(b);
    return el;
  }
  // oriented face: innerHTML order is [local-top half, local-bottom half].
  // rotation maps local top->screen per angle; long axis is horizontal at 90.
  function faceFor(node, slot) {
    const tailVal = node.a + node.b - node.headVal;
    const H = node.headVal;
    if (slot.dx === 1) return [tailVal, H];   // moving right: right half = tail
    if (slot.dx === -1) return [H, tailVal];  // moving left: right half = head
    if (slot.dy === 1) return [H, tailVal];   // moving down: top half = head
    return [tailVal, H];                      // moving up: top half = tail
  }

  /* ---------------- serpentine layout ---------------- */
  // Waypoints: rows alternate direction, joined by vertical connectors.
  function computeSlots() {
    const wps = [{ x: 0, y: 0 }];
    let row = 0, dirX = 1;
    // pre-generate enough waypoints for 28 tiles
    for (let k = 0; k < 16; k++) {
      const y = k * (TH + GAP);
      if (k % 2 === 0) wps.push({ x: ROWLEN, y });
      else wps.push({ x: 0, y });
      if (k < 15) {
        const ny = (k + 1) * (TH + GAP);
        wps.push({ x: k % 2 === 0 ? ROWLEN : 0, y: ny });
      }
    }
    // arc-length walk
    let wp = 0, px = 0, py = 0;
    function dir() {
      const a = wps[wp], b = wps[wp + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      return { dx: dx / l, dy: dy / l, len: l };
    }
    let remain = dir().len;
    function advance(d) {
      while (d > 0) {
        if (d <= remain) { const v = dir(); px += v.dx * d; py += v.dy * d; remain -= d; d = 0; }
        else { const v = dir(); px = wps[wp + 1].x; py = wps[wp + 1].y; d -= remain; wp++; remain = dir().len; }
      }
    }
    const slots = [];
    let firstDir = null;
    for (const n of S.board) {
      const dbl = n.a === n.b;
      const adv = (dbl ? TW : TH) + GAP;
      let v = dir();
      if (!firstDir) firstDir = v;
      // don't straddle a corner: finish the segment first (small real-table gap)
      if (remain < adv && wp < wps.length - 2) {
        const skip = remain;
        advance(skip);
        v = dir();
        if (!firstDir) firstDir = v;
      }
      const cx = px + v.dx * adv / 2, cy = py + v.dy * adv / 2;
      // tile local long axis is vertical; rotate 90 for horizontal travel.
      let ang = v.dx !== 0 ? 90 : 0;
      if (dbl) ang += 90; // doubles lie crosswise
      slots.push({ id: n.id, node: n, cx, cy, ang, dbl, dx: v.dx, dy: v.dy });
      advance(adv);
    }
    // end positions for drop zones
    const headPos = { x: 0 - firstDir.dx * (TH / 2 + 30), y: 0 - firstDir.dy * (TH / 2 + 30) };
    const lv = dir();
    const tailPos = { x: px + lv.dx * 30, y: py + lv.dy * 30 };
    // bbox
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const s of slots) {
      const along = (s.dbl ? TW : TH) / 2, perp = (s.dbl ? TH : TW) / 2;
      const longHoriz = (s.ang % 180 !== 0);
      const hx = longHoriz ? along : perp, hy = longHoriz ? perp : along;
      minX = Math.min(minX, s.cx - hx); maxX = Math.max(maxX, s.cx + hx);
      minY = Math.min(minY, s.cy - hy); maxY = Math.max(maxY, s.cy + hy);
    }
    if (!slots.length) { minX = minY = -50; maxX = maxY = 50; }
    return { slots, headPos, tailPos, bbox: { minX, minY, maxX, maxY } };
  }

  function fitBoard(slots, animate) {
    const layer = $('board-layer');
    const areaW = layer.clientWidth, areaH = layer.clientHeight;
    const bb = slots.bbox;
    const bw = bb.maxX - bb.minX, bh = bb.maxY - bb.minY;
    const pad = 30;
    const s = Math.min(1, (areaW - pad * 2) / bw, (areaH - pad * 2) / bh);
    const bcx = (bb.minX + bb.maxX) / 2, bcy = (bb.minY + bb.maxY) / 2;
    const tx = areaW / 2 - bcx * s, ty = (areaH - 40) / 2 - bcy * s;
    const board = $('board');
    board.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
    // position each tile
    for (const sl of slots.slots) {
      let el = boardEls.get(sl.id);
      if (!el) {
        el = makeTile(sl.node.a, sl.node.b, false);
        boardEls.set(sl.id, el);
        $('board').appendChild(el);
      }
      const [lead, trail] = faceFor(sl.node, sl);
      const want = halfHTML(lead) + '<div class="div"></div>' + halfHTML(trail);
      if (!el._facedown && el._face !== lead + '-' + trail) { el.innerHTML = want; el._face = lead + '-' + trail; }
      const t = 'translate(' + sl.cx + 'px,' + sl.cy + 'px) rotate(' + sl.ang + 'deg) translate(' + (-TW / 2) + 'px,' + (-TH / 2) + 'px)';
      if (!animate) { el.style.transition = 'none'; }
      el.style.transform = t;
      if (!animate) { void el.offsetWidth; el.style.transition = ''; }
    }
    // remove stale
    const live = new Set(slots.slots.map((x) => x.id));
    for (const [id, el] of boardEls) {
      if (!live.has(id)) { el.remove(); boardEls.delete(id); }
    }
    // endzones
    placeEndzone($('ez-head'), slots.headPos, tx, ty, s);
    placeEndzone($('ez-tail'), slots.tailPos, tx, ty, s);
    lastSlots = { slots, tx, ty, s };
    return lastSlots;
  }

  function placeEndzone(el, p, tx, ty, s) {
    el.style.left = (tx + p.x * s) + 'px';
    el.style.top = (ty + p.y * s) + 'px';
  }

  function layout(animate) {
    if (!S) return;
    fitBoard(computeSlots(), animate !== false && !REDUCED);
  }

  /* ---------------- particles + shake ---------------- */
  const fx = $('fx'), fctx = fx.getContext('2d');
  let parts = [], shakeT = 0, fxRunning = false;
  function sizeFx() {
    const r = $('table').getBoundingClientRect();
    fx.width = r.width; fx.height = r.height;
  }
  function dust(x, y, n, big) {
    if (REDUCED) return;
    for (let i = 0; i < n; i++) {
      if (parts.length > 90) break;
      const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * (big ? 130 : 70);
      parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
        life: 0.5 + Math.random() * 0.4, age: 0,
        r: 1.5 + Math.random() * (big ? 4 : 2.5),
      });
    }
    kickFx();
  }
  function addShake(amount) {
    if (REDUCED) return;
    shakeT = Math.min(1, shakeT + amount);
    kickFx();
  }
  function kickFx() {
    if (fxRunning) return;
    fxRunning = true;
    requestAnimationFrame(fxTick);
  }
  let lastT = 0;
  function fxTick(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t;
    fctx.clearRect(0, 0, fx.width, fx.height);
    if (parts.length) {
      for (const p of parts) {
        p.age += dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.96; p.vy *= 0.96;
        const k = 1 - p.age / p.life;
        if (k <= 0) continue;
        fctx.globalAlpha = k * 0.7;
        fctx.fillStyle = '#e8d9b0';
        fctx.beginPath(); fctx.arc(p.x, p.y, p.r * k + 0.5, 0, 7); fctx.fill();
      }
      parts = parts.filter((p) => p.age < p.life);
      fctx.globalAlpha = 1;
    }
    if (shakeT > 0.003) {
      shakeT = Math.max(0, shakeT - dt * 2.4);
      const m = shakeT * shakeT * 9;
      const ox = Math.sin(t * 0.091) * m, oy = Math.cos(t * 0.113) * m;
      $('table').style.transform = 'translate(' + ox.toFixed(1) + 'px,' + oy.toFixed(1) + 'px)';
    } else if ($('table').style.transform) {
      $('table').style.transform = '';
    }
    if (parts.length || shakeT > 0.003) requestAnimationFrame(fxTick);
    else fxRunning = false;
  }

  /* ---------------- HUD / chrome ---------------- */
  function renderScores() {
    $('score-you').textContent = S.scores[0];
    $('score-house').textContent = S.scores[1];
    $('round-label').textContent = 'Round ' + S.round;
  }
  function renderAiHand() {
    const h = $('ai-hand');
    h.innerHTML = '';
    for (let i = 0; i < S.hands[1].length; i++) h.appendChild(makeTile(0, 0, true));
  }
  function renderBoneyard() {
    const n = S.boneyard.length;
    const by = $('boneyard');
    by.classList.toggle('hidden', uiPhase === 'title');
    const st = $('bone-stack');
    st.innerHTML = '';
    const show = Math.min(3, n);
    for (let i = 0; i < show; i++) st.appendChild(makeTile(0, 0, true));
    $('bone-count').textContent = n;
    const mustDraw = uiPhase === 'play' && S.turn === 0 && !Sim.canPlay(S, 0) && n > 0;
    by.classList.toggle('need', mustDraw);
    by.classList.toggle('dead', n === 0);
  }
  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    t.style.opacity = 1;
    clearTimeout(t._tm);
    t._tm = setTimeout(() => { t.style.opacity = 0; setTimeout(() => t.classList.add('hidden'), 320); }, ms || 1800);
  }
  function updateTurnUI() {
    const yourTurn = uiPhase === 'play' && S.turn === 0 && !busy;
    $('rack').classList.toggle('locked', !yourTurn);
    const mustKnock = uiPhase === 'play' && S.turn === 0 && !busy && S.boneyard.length === 0 && !Sim.canPlay(S, 0);
    $('knock-btn').classList.toggle('hidden', !mustKnock);
    renderBoneyard();
    renderRack();
  }

  /* ---------------- rack ---------------- */
  function renderRack() {
    const rack = $('rack');
    rack.innerHTML = '';
    const moves = (uiPhase === 'play' && S.turn === 0) ? Sim.legalMoves(S.hands[0], Sim.exposed(S)) : [];
    const playable = new Set(moves.map((m) => m.tileIdx));
    rackTiles = S.hands[0].map((t) => ({ a: t.a, b: t.b }));
    rackTiles.forEach((t, i) => {
      const el = makeTile(t.a, t.b, false);
      el.dataset.idx = i;
      if (playable.has(i)) el.classList.add('playable');
      if (i === selected) el.classList.add('sel');
      rack.appendChild(el);
    });
    // keep selection valid
    if (selected >= rackTiles.length) selected = -1;
  }
  function clearEndzones() {
    $('ez-head').className = 'endzone hidden';
    $('ez-tail').className = 'endzone hidden';
  }
  function showEndzones(moves) {
    clearEndzones();
    const ends = new Set(moves.map((m) => m.end));
    if (ends.has('head')) { $('ez-head').classList.remove('hidden'); $('ez-head').classList.add('lit'); }
    if (ends.has('tail')) { $('ez-tail').classList.remove('hidden'); $('ez-tail').classList.add('lit'); }
  }
  function endzoneScreen(which) {
    const el = which === 'head' ? $('ez-head') : $('ez-tail');
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /* ---------------- play flow ---------------- */
  function tileScreenPos(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  async function doPlayerPlay(tileIdx, end) {
    if (busy || uiPhase !== 'play' || S.turn !== 0) return;
    busy = true;
    selected = -1;
    clearEndzones();
    const rackEl = $('rack').children[tileIdx];
    const from = rackEl ? tileScreenPos(rackEl) : { x: innerWidth / 2, y: innerHeight - 120 };
    const r = Sim.playTile(S, 0, tileIdx, end);
    if (!r.ok) { busy = false; updateTurnUI(); return; }
    const ev = r.events[0];
    AU.clack((ev.tile.a + ev.tile.b) / 12);
    // create the board tile at the drop point, then glide everything home
    const node = S.board.find((n) => n.id === ev.nodeId);
    const el = makeTile(ev.tile.a, ev.tile.b, false);
    el._face = '';
    boardEls.set(ev.nodeId, el);
    $('board').appendChild(el);
    // start it at the drop point (board coords): invert current transform
    if (lastSlots) {
      const bx = (from.x - lastSlots.tx) / lastSlots.s, by = (from.y - lastSlots.ty) / lastSlots.s;
      el.style.transition = 'none';
      el.style.transform = 'translate(' + bx + 'px,' + by + 'px) rotate(0deg) translate(' + (-TW / 2) + 'px,' + (-TH / 2) + 'px)';
      void el.offsetWidth;
      el.style.transition = '';
    }
    renderRack();
    layout(true);
    const zc = endzoneScreen(end);
    dust(zc.x, zc.y, ev.tile.a === ev.tile.b ? 14 : 8, ev.tile.a === ev.tile.b);
    addShake(ev.tile.a === ev.tile.b ? 0.55 : 0.32);
    await wait(REDUCED ? 30 : 420);
    busy = false;
    await afterMove();
  }

  async function doPlayerDraw() {
    if (busy || uiPhase !== 'play' || S.turn !== 0) return;
    if (Sim.canPlay(S, 0) || !S.boneyard.length) return;
    busy = true;
    const r = Sim.drawTile(S, 0);
    busy = false;
    if (!r.ok) { updateTurnUI(); return; }
    AU.flip();
    // ghost flight from boneyard to rack
    const bp = tileScreenPos($('bone-stack'));
    const ghost = makeTile(0, 0, true);
    ghost.style.cssText = 'position:fixed;left:' + (bp.x - 27) + 'px;top:' + (bp.y - 52) + 'px;width:54px;height:104px;z-index:65;transition:transform .34s ease';
    document.body.appendChild(ghost);
    const rack = $('rack').getBoundingClientRect();
    const dx = rack.left + rack.width / 2 - bp.x, dy = rack.top + 40 - bp.y;
    requestAnimationFrame(() => { ghost.style.transform = 'translate(' + dx + 'px,' + dy + 'px) rotate(' + (Math.random() * 30 - 15) + 'deg)'; });
    await wait(REDUCED ? 30 : 360);
    ghost.remove();
    renderRack(); renderBoneyard();
    if (Sim.canPlay(S, 0)) { toast('Your move'); }
    else if (!S.boneyard.length) { toast('Boneyard empty'); }
    updateTurnUI();
  }

  async function doPlayerKnock() {
    if (busy || uiPhase !== 'play' || S.turn !== 0) return;
    const r = Sim.knock(S, 0);
    if (!r.ok) return;
    AU.knock();
    toast('You knock');
    clearEndzones();
    await wait(500);
    await afterMove();
  }

  async function afterMove() {
    renderScores(); renderAiHand(); renderBoneyard();
    const evs = S.lastEvents;
    const rend = evs.find((e) => e.t === 'roundEnd');
    if (rend) { await showRoundEnd(rend, evs.find((e) => e.t === 'matchEnd')); return; }
    updateTurnUI();
    if (S.turn === 1 && S.phase === 'play') aiTakeTurn();
    else if (S.turn === 0 && S.phase === 'play' && !Sim.canPlay(S, 0)) {
      if (S.boneyard.length) toast('Draw from the boneyard');
      updateTurnUI();
    }
  }

  async function aiTakeTurn() {
    if (S.phase !== 'play' || S.turn !== 1) return;
    busy = true;
    updateTurnUI();
    $('ai-thinking').classList.remove('hidden');
    await wait(700 + difficulty * 260 + Math.random() * 320);
    $('ai-thinking').classList.add('hidden');
    // draw loop with a beat between draws
    while (S.phase === 'play' && S.turn === 1 && !Sim.canPlay(S, 1) && S.boneyard.length) {
      Sim.drawTile(S, 1);
      AU.flip();
      renderAiHand(); renderBoneyard();
      await wait(REDUCED ? 30 : 380);
    }
    if (S.phase !== 'play' || S.turn !== 1) { busy = false; await afterMove(); return; }
    const choice = Sim.aiChoose(S, 1, difficulty);
    if (choice.type === 'knock') {
      Sim.knock(S, 1);
      AU.knock();
      toast('House knocks');
      await wait(600);
    } else {
      // fly a tile back from the AI hand, flip mid-flight
      const hand = $('ai-hand').getBoundingClientRect();
      const from = { x: hand.left + hand.width / 2, y: hand.top + hand.height / 2 };
      const r = Sim.playTile(S, 1, choice.tileIdx, choice.end);
      if (r.ok) {
        const ev = r.events[0];
        AU.clack((ev.tile.a + ev.tile.b) / 12);
        renderAiHand();
        const el = makeTile(ev.tile.a, ev.tile.b, true); // face-down at launch
        el._face = '';
        el._facedown = true;
        boardEls.set(ev.nodeId, el);
        $('board').appendChild(el);
        if (lastSlots) {
          const bx = (from.x - lastSlots.tx) / lastSlots.s, by = (from.y - lastSlots.ty) / lastSlots.s;
          el.style.transition = 'none';
          el.style.transform = 'translate(' + bx + 'px,' + by + 'px) rotate(0deg) translate(' + (-TW / 2) + 'px,' + (-TH / 2) + 'px)';
          void el.offsetWidth;
          el.style.transition = '';
        }
        layout(true);
        // flip to face-up mid-flight
        setTimeout(() => {
          el.classList.remove('back');
          el._facedown = false;
          const sl = lastSlots && lastSlots.slots.slots.find((x) => x.id === ev.nodeId);
          if (sl) { const [lead, trail] = faceFor(sl.node, sl); el.innerHTML = halfHTML(lead) + '<div class="div"></div>' + halfHTML(trail); el._face = lead + '-' + trail; }
        }, REDUCED ? 0 : 200);
        const zc = endzoneScreen(choice.end);
        setTimeout(() => {
          dust(zc.x, zc.y, ev.tile.a === ev.tile.b ? 14 : 8, ev.tile.a === ev.tile.b);
          addShake(ev.tile.a === ev.tile.b ? 0.55 : 0.32);
        }, REDUCED ? 0 : 300);
        await wait(REDUCED ? 30 : 480);
      }
    }
    busy = false;
    await afterMove();
  }

  /* ---------------- round / match ---------------- */
  function countUp(el, to, done) {
    if (REDUCED) { el.textContent = to; if (done) done(); return; }
    let v = 0;
    const step = Math.max(1, Math.round(to / 24));
    const iv = setInterval(() => {
      v = Math.min(to, v + step);
      el.textContent = v;
      AU.tick();
      if (v >= to) { clearInterval(iv); if (done) done(); }
    }, 42);
  }

  async function showRoundEnd(rend, mend) {
    uiPhase = rend.winner == null ? 'roundEnd' : (mend ? 'matchEnd' : 'roundEnd');
    clearEndzones();
    await wait(650);
    renderScores();
    const youWon = rend.winner === 0;
    let title, sub;
    if (rend.winner == null) {
      title = 'Dead heat';
      sub = 'Both hands tied at ' + rend.handPips[0] + ' — no points. Deal again.';
    } else if (rend.reason === 'domino') {
      title = youWon ? 'Domino!' : 'House takes it';
      sub = (youWon ? 'You emptied your hand. ' : 'The House emptied its hand. ') +
        'Scores <b id="pts-live">0</b> / ' + rend.pts + ' pips.';
    } else {
      title = youWon ? 'Blocked — you take it' : 'Blocked — house takes it';
      sub = 'Fewest pips wins the difference: <b id="pts-live">0</b> / ' + rend.pts + '.';
    }
    $('banner-title').textContent = title;
    $('banner-sub').innerHTML = sub;
    const btn = $('banner-btn');
    if (mend) {
      const matchWon = mend.winner === 0;
      AU.chime(matchWon);
      setTimeout(() => {
        $('banner-title').textContent = matchWon ? 'You take the match!' : 'House takes the match';
        $('banner-sub').innerHTML = 'Final: you <b>' + S.scores[0] + '</b> · house <b>' + S.scores[1] + '</b>';
        btn.textContent = 'Play again';
        $('banner').classList.remove('hidden');
      }, REDUCED ? 100 : 1400);
      btn.onclick = () => { AU.uiTap(); $('banner').classList.add('hidden'); startMatch(); };
    } else {
      AU.chime(youWon);
      btn.textContent = 'Next round';
      $('banner').classList.remove('hidden');
      const live = $('pts-live');
      if (live) countUp(live, rend.pts);
      btn.onclick = () => { AU.uiTap(); $('banner').classList.add('hidden'); Sim.nextRound(S); dealRound(); };
    }
    busy = false;
    updateTurnUI();
  }

  /* ---------------- deal / match start ---------------- */
  function clearBoard() {
    $('board').innerHTML = '';
    boardEls.clear();
    lastSlots = null;
    clearEndzones();
  }

  async function dealRound() {
    uiPhase = 'dealing';
    busy = true;
    clearBoard();
    $('banner').classList.add('hidden');
    // sim round already dealt via nextRound or newGame; animate the deal
    renderScores(); renderAiHand(); renderBoneyard(); renderRack();
    AU.shuffle();
    const cx = innerWidth / 2, cy = innerHeight * 0.42;
    const ghosts = [];
    for (let i = 0; i < 7; i++) {
      for (const who of [0, 1]) {
        const g = makeTile(0, 0, true);
        g.style.cssText = 'position:fixed;left:' + (cx - 22) + 'px;top:' + (cy - 44) + 'px;width:44px;height:88px;z-index:65;transition:transform .3s ease';
        document.body.appendChild(g);
        ghosts.push(g);
        const target = who === 0
          ? { x: innerWidth / 2 + (i - 3) * 62, y: innerHeight - 90 }
          : { x: innerWidth / 2 + (i - 3) * 38, y: 96 };
        requestAnimationFrame(() => {
          g.style.transform = 'translate(' + (target.x - cx) + 'px,' + (target.y - cy) + 'px) rotate(' + (Math.random() * 24 - 12) + 'deg)';
        });
        await wait(REDUCED ? 0 : 55);
      }
    }
    await wait(REDUCED ? 30 : 320);
    ghosts.forEach((g) => g.remove());
    // place the opener with a pop
    layout(false);
    const op = S.board[0];
    const el = boardEls.get(op.id);
    if (el && !REDUCED) {
      el.style.transition = 'none';
      el.style.transform += ' scale(1.6)';
      void el.offsetWidth;
      el.style.transition = '';
      el.style.transform = el.style.transform.replace(' scale(1.6)', '');
      AU.clack(1);
      const p = tileScreenPos(el);
      dust(p.x, p.y, 12, true);
    } else if (el) { AU.clack(1); }
    const opener = S.lastEvents.find((e) => e.t === 'open');
    const who = opener && opener.player === 0 ? 'You' : 'House';
    toast(who + ' open' + (who === 'You' ? '' : 's') + ' with [' + op.a + '|' + op.b + ']');
    uiPhase = 'play';
    busy = false;
    updateTurnUI();
    if (S.turn === 1) aiTakeTurn();
  }

  function startMatch() {
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    startMatchSeeded(seed);
  }

  function startMatchSeeded(seed) {
    S = Sim.newGame(seed, 100);
    clearBoard();
    $('banner').classList.add('hidden');
    $('title').classList.add('hidden');
    $('table').classList.remove('title-mode');
    dealRound();
  }

  /* ---------------- input: drag + tap ---------------- */
  function rackTileFromEvent(e) {
    const el = e.target.closest ? e.target.closest('#rack .tile') : null;
    return el;
  }
  let pdown = null;
  $('rack').addEventListener('pointerdown', (e) => {
    if (uiPhase !== 'play' || S.turn !== 0 || busy) return;
    const el = rackTileFromEvent(e);
    if (!el) return;
    const idx = +el.dataset.idx;
    const moves = Sim.legalMoves(S.hands[0], Sim.exposed(S));
    const my = moves.filter((m) => m.tileIdx === idx);
    if (!my.length) {
      el.animate(
        [{ transform: getComputedStyle(el).transform + ' translateX(0)' },
         { transform: getComputedStyle(el).transform + ' translateX(-7px)' },
         { transform: getComputedStyle(el).transform + ' translateX(7px)' },
         { transform: getComputedStyle(el).transform }],
        { duration: 220 });
      AU.uiTap();
      return;
    }
    pdown = { idx, el, x0: e.clientX, y0: e.clientY, dragging: false, moves: my };
    try { el.setPointerCapture && e.pointerId != null && el.setPointerCapture(e.pointerId); } catch (err) {}
  });
  $('rack').addEventListener('pointermove', (e) => {
    if (!pdown) return;
    const dx = e.clientX - pdown.x0, dy = e.clientY - pdown.y0;
    if (!pdown.dragging && Math.hypot(dx, dy) > 10) {
      pdown.dragging = true;
      pdown.el.classList.add('dragging');
      pdown.el.style.position = 'fixed';
      pdown.el.style.left = '0'; pdown.el.style.top = '0';
      pdown.el.style.margin = '0';
      showEndzones(pdown.moves);
    }
    if (pdown.dragging) {
      pdown.el.style.transform = 'translate(' + (e.clientX - 27) + 'px,' + (e.clientY - 52) + 'px) rotate(4deg) scale(1.08)';
      // hot endzone?
      let best = null, bestD = 52;
      for (const m of pdown.moves) {
        const z = endzoneScreen(m.end);
        const d = Math.hypot(e.clientX - z.x, e.clientY - z.y);
        if (d < bestD) { bestD = d; best = m.end; }
      }
      $('ez-head').classList.toggle('hot', best === 'head');
      $('ez-tail').classList.toggle('hot', best === 'tail');
      pdown.hot = best;
    }
  });
  async function endPointer(e) {
    if (!pdown) return;
    const pd = pdown; pdown = null;
    if (pd.dragging) {
      pd.el.classList.remove('dragging');
      pd.el.style.cssText = '';
      if (pd.hot) {
        clearEndzones();
        await doPlayerPlay(pd.idx, pd.hot);
      } else {
        clearEndzones();
        renderRack();
      }
    } else {
      // tap: select / deselect
      if (selected === pd.idx) { selected = -1; clearEndzones(); }
      else {
        selected = pd.idx;
        if (pd.moves.length === 1) {
          // single legal end: play immediately
          const mv = pd.moves[0];
          selected = -1;
          await doPlayerPlay(mv.tileIdx, mv.end);
          return;
        }
        showEndzones(pd.moves);
        toast('Tap a glowing end');
      }
      renderRack();
    }
  }
  $('rack').addEventListener('pointerup', endPointer);
  $('rack').addEventListener('pointercancel', () => {
    if (pdown && pdown.dragging) { pdown.el.classList.remove('dragging'); pdown.el.style.cssText = ''; }
    pdown = null; clearEndzones(); renderRack();
  });
  // tap a lit endzone while a tile is selected
  $('board-layer').addEventListener('pointerup', async (e) => {
    if (selected < 0 || uiPhase !== 'play' || S.turn !== 0 || busy) return;
    const moves = Sim.legalMoves(S.hands[0], Sim.exposed(S)).filter((m) => m.tileIdx === selected);
    let best = null, bestD = 60;
    for (const m of moves) {
      const z = endzoneScreen(m.end);
      const d = Math.hypot(e.clientX - z.x, e.clientY - z.y);
      if (d < bestD) { bestD = d; best = m; }
    }
    if (best) { const idx = selected; selected = -1; clearEndzones(); await doPlayerPlay(idx, best.end); }
  });

  $('boneyard').addEventListener('click', () => { AU.ensure(); doPlayerDraw(); });
  $('boneyard').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') doPlayerDraw(); });
  $('knock-btn').addEventListener('click', () => { AU.uiTap(); doPlayerKnock(); });

  /* ---------------- chrome buttons ---------------- */
  function syncMute() { $('btn-mute').textContent = AU.isMuted() ? '✕' : '♪'; $('btn-mute').style.opacity = AU.isMuted() ? 0.5 : 1; }
  $('btn-mute').addEventListener('click', () => { AU.setMuted(!AU.isMuted()); syncMute(); });
  $('btn-restart').addEventListener('click', () => { AU.uiTap(); if (uiPhase !== 'title') startMatch(); });
  $('btn-rules').addEventListener('click', () => { AU.uiTap(); $('rules-modal').classList.remove('hidden'); });
  $('rules-close').addEventListener('click', () => { AU.uiTap(); $('rules-modal').classList.add('hidden'); });
  $('title-rules').addEventListener('click', () => { AU.uiTap(); $('rules-modal').classList.remove('hidden'); });

  /* ---------------- title ---------------- */
  const diffBtns = Array.from(document.querySelectorAll('#diff-seg button'));
  diffBtns.forEach((b) => {
    if (+b.dataset.d === difficulty) {
      diffBtns.forEach((x) => { x.classList.remove('sel'); x.setAttribute('aria-checked', 'false'); });
      b.classList.add('sel'); b.setAttribute('aria-checked', 'true');
    }
    b.addEventListener('click', () => {
      AU.uiTap();
      difficulty = +b.dataset.d;
      try { localStorage.setItem(LS_DIFF, String(difficulty)); } catch (e) {}
      diffBtns.forEach((x) => { x.classList.remove('sel'); x.setAttribute('aria-checked', 'false'); });
      b.classList.add('sel'); b.setAttribute('aria-checked', 'true');
    });
  });
  $('play-tile').addEventListener('click', () => { AU.ensure(); AU.uiTap(); startMatch(); });

  // title dressing: a short chain arcing across the top (tiles share values,
  // like a real line) plus two quiet accents low on the table.
  (function scatter() {
    const box = $('title-scatter');
    const chain = [
      { a: 6, b: 6, x: 5,  y: 6.5, r: -20 },
      { a: 6, b: 4, x: 23, y: 3,   r: -9 },
      { a: 4, b: 2, x: 42, y: 1.5, r: 3 },
      { a: 2, b: 5, x: 61, y: 3,   r: 13 },
      { a: 5, b: 5, x: 78, y: 6.5, r: 21 },
    ];
    const accents = [
      { a: 3, b: 4, x: 9,  y: 74, r: 18 },
      { a: 1, b: 2, x: 79, y: 80, r: -14 },
    ];
    chain.forEach((s) => {
      const t = makeTile(s.a, s.b, false);
      t.style.left = s.x + '%'; t.style.top = s.y + '%';
      t.style.transform = 'rotate(' + s.r + 'deg)';
      t.style.opacity = 0.92;
      box.appendChild(t);
    });
    accents.forEach((s) => {
      const t = makeTile(s.a, s.b, false);
      t.style.left = s.x + '%'; t.style.top = s.y + '%';
      t.style.transform = 'rotate(' + s.r + 'deg)';
      t.style.opacity = 0.6;
      box.appendChild(t);
    });
  })();

  /* ---------------- boot ---------------- */
  function onResize() { sizeFx(); if (uiPhase !== 'title') layout(false); }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 200));
  sizeFx();
  syncMute();

  /* test hook for the smoke harness */
  window.__dominoes = {
    get state() { return S; },
    get phase() { return uiPhase; },
    get busy() { return busy; },
    refresh() { layout(true); renderRack(); renderAiHand(); renderBoneyard(); renderScores(); updateTurnUI(); },
    start(d, seed) {
      if (d != null) difficulty = d;
      if (seed != null) startMatchSeeded(seed); else startMatch();
    },
    autoStep() {
      // advance one action for whoever's turn it is (test only)
      if (uiPhase !== 'play' || busy) return 'busy';
      const p = S.turn;
      if (Sim.canPlay(S, p)) {
        const mv = Sim.legalMoves(S.hands[p], Sim.exposed(S))[0];
        const r = p === 0 ? null : Sim.playTile(S, p, mv.tileIdx, mv.end);
        if (p === 0) { doPlayerPlay(mv.tileIdx, mv.end); return 'play'; }
        return r.ok ? 'play' : 'err';
      }
      if (S.boneyard.length) { const r = Sim.drawTile(S, p); return r.ok ? 'draw' : 'err'; }
      const r = Sim.knock(S, p); return r.ok ? 'knock' : 'err';
    },
    uiStep() {
      // drive one real UI action for the human player (test only)
      if (uiPhase !== 'play' || busy || S.turn !== 0) return 'wait';
      if (Sim.canPlay(S, 0)) {
        const m = Sim.legalMoves(S.hands[0], Sim.exposed(S))[0];
        doPlayerPlay(m.tileIdx, m.end);
        return 'play';
      }
      if (S.boneyard.length) { doPlayerDraw(); return 'draw'; }
      doPlayerKnock();
      return 'knock';
    },
    ensurePlayable() {
      // test only: draw (no animation) until the human has a move or must knock
      let n = 0;
      while (uiPhase === 'play' && !busy && S.turn === 0 && !Sim.canPlay(S, 0) && S.boneyard.length && n++ < 14) {
        Sim.drawTile(S, 0);
      }
      renderRack(); renderBoneyard(); updateTurnUI();
      return Sim.canPlay(S, 0);
    },
    async autoRound(maxSteps) {
      let n = 0;
      while (S.phase === 'play' && n++ < (maxSteps || 200)) {
        const p = S.turn;
        if (Sim.canPlay(S, p)) {
          const mv = Sim.legalMoves(S.hands[p], Sim.exposed(S))[0];
          Sim.playTile(S, p, mv.tileIdx, mv.end);
        } else if (S.boneyard.length) Sim.drawTile(S, p);
        else Sim.knock(S, p);
        layout(false); renderRack(); renderAiHand(); renderBoneyard();
      }
      return S.phase;
    },
  };
})();
