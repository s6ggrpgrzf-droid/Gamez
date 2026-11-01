'use strict';
/* Chess 3D scene — Three.js. The board is a lacquer box inlaid with gold
   seams; the armies are lathe-turned Staunton solids (knights extruded),
   boxwood ivory against gloss black lacquer, each on a thin gold ring.
   Camera sits where a player sits; a top view is one toggle away.
   Rules/AI stay in sim.js + ai-worker.js — this file only draws. */
window.S3 = (() => {
  const T = window.THREE;
  let renderer, scene, camera, canvas;
  let boardGroup, markersGroup, piecesGroup;
  let sqMeshes = [];
  let pieceMap = new Map(); // idx -> group
  let tweens = [];
  let animNote = null; // {move, prevB}
  let viewMode = 'seat', flipped = false;
  let az = 0, el = 0; // orbit offsets
  let camPos = null, camTgt = null; // smoothed
  let checkMarker = null;
  let dragGroup = null;
  let started = false;
  let prevCheckSq = -1;

  const GOLD = 0xd8b46a;
  const MAT = {};
  function mats() {
    if (MAT.w) return MAT;
    MAT.w = new T.MeshPhysicalMaterial({ color: 0xe9dcbc, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.4 });
    MAT.b = new T.MeshPhysicalMaterial({ color: 0x1a1512, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.22 });
    MAT.gold = new T.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.3, emissive: 0x5a4310, emissiveIntensity: 0.38 });
    MAT.light = new T.MeshPhysicalMaterial({ color: 0xdcc9a0, roughness: 0.68, clearcoat: 0.05, clearcoatRoughness: 0.5 });
    MAT.dark = new T.MeshPhysicalMaterial({ color: 0x0c0a09, roughness: 0.32, clearcoat: 0.45, clearcoatRoughness: 0.48 });
    MAT.frame = new T.MeshPhysicalMaterial({ color: 0x070606, roughness: 0.46, clearcoat: 0.45, clearcoatRoughness: 0.48 });
    MAT.slit = new T.MeshStandardMaterial({ color: 0x060505, roughness: 0.9 });
    return MAT;
  }
  const sqPos = idx => ({ x: (idx & 7) - 3.5, z: (idx >> 3) - 3.5 });
  const BASE_Y = 0.12;

  /* --- lathe profiles: [radius, height] silhouettes of revolution --- */
  const BASE = [[0.001, 0], [0.40, 0], [0.42, 0.04], [0.38, 0.08], [0.30, 0.11], [0.315, 0.15], [0.27, 0.18]];
  const PROF = {
    p: BASE.concat([[0.24, 0.24], [0.20, 0.30], [0.155, 0.36], [0.21, 0.40], [0.225, 0.44], [0.165, 0.47], [0.10, 0.50], [0.20, 0.56], [0.235, 0.66], [0.20, 0.78], [0.10, 0.86], [0.001, 0.885]]),
    r: BASE.concat([[0.26, 0.26], [0.24, 0.34], [0.235, 0.52], [0.27, 0.58], [0.28, 0.64], [0.30, 0.68], [0.30, 0.80], [0.235, 0.80], [0.225, 0.72]]),
    b: BASE.concat([[0.23, 0.26], [0.185, 0.34], [0.16, 0.44], [0.215, 0.50], [0.22, 0.54], [0.15, 0.57], [0.185, 0.66], [0.17, 0.78], [0.10, 0.92], [0.001, 1.0]]),
    q: BASE.concat([[0.25, 0.26], [0.20, 0.36], [0.175, 0.52], [0.16, 0.66], [0.21, 0.74], [0.26, 0.80], [0.30, 0.86], [0.315, 0.92], [0.255, 0.945], [0.20, 0.90], [0.001, 0.915]]),
    k: BASE.concat([[0.26, 0.26], [0.21, 0.38], [0.185, 0.56], [0.175, 0.72], [0.225, 0.80], [0.28, 0.86], [0.30, 0.94], [0.235, 0.97], [0.18, 0.94], [0.001, 0.955]]),
    nBase: BASE.concat([[0.24, 0.24], [0.22, 0.30]])
  };
  const GEO = {};
  function lathe(pts, seg) {
    return new T.LatheGeometry(pts.map(p => new T.Vector2(p[0], p[1])), seg || 40);
  }
  function knightGeo() {
    if (GEO.n) return GEO.n;
    // profile points from the drawn knight (px in a 45 box), remapped to units
    const px = [[14.8, 33.4], [14.6, 29.0], [15.2, 25.2], [17.2, 22.6], [19.9, 21.4], [16.6, 17.4], [15.4, 14.2], [15.6, 11.4], [17.4, 8.6], [19.8, 5.6], [21.2, 5.2], [22.6, 8.6], [24.2, 9.8], [26.8, 6.8], [28.0, 7.6], [28.8, 12.4], [29.0, 17.6], [28.8, 23.2], [31.2, 25.2], [33.0, 28.6], [33.2, 33.4]];
    const k = 0.0292, cx = 23.9;
    const shape = new T.Shape();
    px.forEach((p, i) => {
      const x = (p[0] - cx) * k, y = (33.4 - p[1]) * k + 0.14;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    });
    const g = new T.ExtrudeGeometry(shape, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.022, bevelSize: 0.018, bevelSegments: 2, steps: 1 });
    g.translate(0, 0, -0.13);
    GEO.n = g; return g;
  }
  function pieceGroup(type, color) {
    const M = mats();
    const mat = color === 'w' ? M.w : M.b;
    const g = new T.Group();
    const add = (geo, m, x, y, z) => { const ms = new T.Mesh(geo, m || mat); ms.castShadow = true; ms.receiveShadow = false; if (x) ms.position.set(x, y, z); g.add(ms); return ms; };
    if (type === 'n') {
      add(GEO.nBase || (GEO.nBase = lathe(PROF.nBase)), mat);
      const head = add(knightGeo(), mat);
      head.rotation.y = color === 'w' ? -Math.PI / 2 : Math.PI / 2;
      const eyeG = GEO.eye || (GEO.eye = new T.SphereGeometry(0.02, 10, 8));
      const e1 = new T.Mesh(eyeG, M.slit); e1.position.set(0.155, 0.755, -0.115); g.add(e1);
      const e2 = new T.Mesh(eyeG, M.slit); e2.position.set(-0.155, 0.755, -0.115); g.add(e2);
    } else {
      add(GEO[type] || (GEO[type] = lathe(PROF[type])), mat);
      if (type === 'r') {
        const bg = GEO.bat || (GEO.bat = new T.BoxGeometry(0.17, 0.11, 0.095));
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const ms = add(bg, mat, Math.cos(a) * 0.262, 0.845, Math.sin(a) * 0.262); ms.rotation.y = -a; }
      } else if (type === 'b') {
        add(GEO.ball || (GEO.ball = new T.SphereGeometry(0.066, 18, 14)), mat, 0, 1.04, 0);
        const slit = add(GEO.slit || (GEO.slit = new T.BoxGeometry(0.035, 0.30, 0.02)), M.slit, 0.02, 0.76, 0.158);
        slit.rotation.z = 0.55;
      } else if (type === 'q') {
        const sg = GEO.qb || (GEO.qb = new T.SphereGeometry(0.058, 14, 10));
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(sg, mat, Math.cos(a) * 0.235, 0.985, Math.sin(a) * 0.235); }
        add(GEO.qc || (GEO.qc = new T.SphereGeometry(0.074, 16, 12)), mat, 0, 1.01, 0);
      } else if (type === 'k') {
        add(GEO.kv || (GEO.kv = new T.BoxGeometry(0.08, 0.25, 0.05)), mat, 0, 1.10, 0);
        add(GEO.kh || (GEO.kh = new T.BoxGeometry(0.18, 0.08, 0.05)), mat, 0, 1.13, 0);
      }
    }
    const ring = new T.Mesh(GEO.ring || (GEO.ring = new T.TorusGeometry(0.298, 0.013, 10, 44)), M.gold);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.165; g.add(ring);
    g.traverse(o => { o.userData.pieceRoot = g; });
    return g;
  }

  function init(cv) {
    canvas = cv;
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(40, 1, 0.1, 100);
    const M = mats();
    scene.add(new T.HemisphereLight(0xe8ecff, 0x120d08, 0.30));
    const key = new T.DirectionalLight(0xffd9a3, 0.85);
    key.position.set(5, 9, 4); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -6.5; key.shadow.camera.right = 6.5; key.shadow.camera.top = 6.5; key.shadow.camera.bottom = -6.5;
    key.shadow.camera.far = 30; key.shadow.bias = -0.0006;
    scene.add(key);
    const fill = new T.DirectionalLight(0xbfd0ff, 0.15); fill.position.set(-6, 4, -6); scene.add(fill);
    const rim = new T.DirectionalLight(0xffe6b8, 0.38); rim.position.set(-2, 6, -8); scene.add(rim);
    const glow = new T.PointLight(0xffc37a, 0.12, 24); glow.position.set(0, 4.4, 6.2); scene.add(glow);
    // shadow catcher under the box
    const sh = new T.Mesh(new T.CircleGeometry(11, 40), new T.ShadowMaterial({ opacity: 0.42 }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = -0.52; sh.receiveShadow = true; scene.add(sh);
    boardGroup = new T.Group(); scene.add(boardGroup);
    piecesGroup = new T.Group(); scene.add(piecesGroup);
    markersGroup = new T.Group(); scene.add(markersGroup);
    buildAll();
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && started) requestAnimationFrame(loop); });
    started = true;
    requestAnimationFrame(loop);
  }
  function resize() {
    if (!renderer) return;
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function buildAll() {
    const M = mats();
    while (boardGroup.children.length) boardGroup.remove(boardGroup.children[0]);
    sqMeshes = [];
    const frame = new T.Mesh(new T.BoxGeometry(9.7, 0.5, 9.7), M.frame);
    frame.position.y = -0.25; frame.castShadow = true; frame.receiveShadow = true; boardGroup.add(frame);
    const sqGeo = new T.BoxGeometry(0.985, 0.12, 0.985);
    for (let idx = 0; idx < 64; idx++) {
      const f = idx & 7, r = idx >> 3;
      const ms = new T.Mesh(sqGeo, ((f + r) % 2 === 0) ? M.light : M.dark);
      const p = sqPos(idx);
      ms.position.set(p.x, 0.06, p.z);
      ms.receiveShadow = true; ms.userData.sq = idx;
      boardGroup.add(ms); sqMeshes.push(ms);
    }
    // gold trim ring around the field
    const trimG = new T.BoxGeometry(8.34, 0.02, 0.045);
    [[0, -4.1], [0, 4.1]].forEach(([x, z]) => { const t = new T.Mesh(trimG, M.gold); t.position.set(x, 0.008, z); boardGroup.add(t); });
    const trimG2 = new T.BoxGeometry(0.045, 0.02, 8.34);
    [[-4.1, 0], [4.1, 0]].forEach(([x, z]) => { const t = new T.Mesh(trimG2, M.gold); t.position.set(x, 0.008, z); boardGroup.add(t); });
    // gold seams across the lacquer frame (the kintsugi repair)
    const seam = (pts, y) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
        const len = Math.hypot(x2 - x1, z2 - z1);
        const seg = new T.Mesh(new T.PlaneGeometry(len, 0.052), M.gold);
        seg.rotation.x = -Math.PI / 2; seg.rotation.z = -Math.atan2(z2 - z1, x2 - x1);
        seg.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
        boardGroup.add(seg);
      }
    };
    seam([[-4.85, -3.1], [-4.45, -2.9], [-4.72, -2.2], [-4.4, -1.7]], 0.006);
    seam([[-4.55, -2.85], [-4.0, -2.6], [-3.6, -2.75]], 0.006);
    seam([[4.85, 2.6], [4.42, 2.42], [4.7, 1.8], [4.38, 1.2]], 0.006);
    seam([[-3.4, 4.62], [-2.5, 4.42], [-1.8, 4.66]], 0.006);
    seam([[-3.95, -3.95], [-3.3, -3.35], [-2.9, -3.6]], BASE_Y + 0.006); // one seam repaired across the corner squares
    seam([[2.9, -3.62], [3.35, -3.3], [3.95, -3.95]], BASE_Y + 0.006);
  }
  /* --- markers --- */
  function plane(idx, color, opacity, size, ring) {
    const p = sqPos(idx);
    const geo = ring ? new T.RingGeometry(0.33, 0.45, 36) : new T.PlaneGeometry(size || 0.96, size || 0.96);
    const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: T.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, BASE_Y + 0.012, p.z);
    markersGroup.add(m); return m;
  }
  function dotMesh(idx, color, isRing) {
    const p = sqPos(idx);
    const geo = isRing ? new T.RingGeometry(0.32, 0.44, 36) : new T.CircleGeometry(0.145, 24);
    // depthTest off: a move dot is a promise — it stays visible even where a
    // tall neighbour stands between the seated camera and the target square
    const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, side: T.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, BASE_Y + 0.014, p.z);
    markersGroup.add(m); return m;
  }
  function sync(st) {
    if (st.checkSq !== prevCheckSq) {
      if (st.checkSq >= 0) { const kg = pieceMap.get(st.checkSq); if (kg) flinchPiece(kg); }
      prevCheckSq = st.checkSq;
    }
    while (markersGroup.children.length) markersGroup.remove(markersGroup.children[0]);
    checkMarker = null;
    if (st.lastMove) { plane(st.lastMove.from, GOLD, 0.20); plane(st.lastMove.to, GOLD, 0.26); }
    if (st.hintPair) { plane(st.hintPair.from, GOLD, 0.30); plane(st.hintPair.to, 0xc33f27, 0.42); }
    if (st.selected >= 0) {
      plane(st.selected, GOLD, 0.38);
      for (const m of st.legalCache) if (m.from === st.selected) dotMesh(m.to, (m.cap || m.epCap) ? 0xc33f27 : GOLD, !!(m.cap || m.epCap));
    }
    if (st.checkSq >= 0) checkMarker = plane(st.checkSq, 0xff3b1f, 0.45);
    // pieces
    const note = animNote; animNote = null;
    const desired = new Map();
    st.b.forEach((p, idx) => { if (p) desired.set(idx, p); });
    if (note) {
      const { move, prevB } = note;
      const g = pieceMap.get(move.from);
      const capIdx = move.epCap ? ((move.from >> 3) * 8 + (move.to & 7)) : move.to;
      const capG = (move.cap || move.epCap) ? pieceMap.get(capIdx) : null;
      if (g) {
        pieceMap.delete(move.from); pieceMap.set(move.to, g);
        const p = sqPos(move.to);
        const dist = Math.max(Math.abs((move.to & 7) - (move.from & 7)), Math.abs((move.to >> 3) - (move.from >> 3)));
        const wantT = desired.get(move.to);
        const isCap0 = !!(move.cap || move.epCap);
        tweenPos(g, p.x, BASE_Y, p.z, isCap0 ? 300 : Math.min(520, 280 + dist * 45), true,
          wantT && wantT.toLowerCase() === 'n' ? 0.85 : isCap0 ? 0.3 : 0.55, isCap0 ? strikeEase : undefined);
        const want = desired.get(move.to);
        if (want && g.userData.piece !== want) setTimeout(() => { if (pieceMap.get(move.to) === g) replacePiece(move.to, want); }, 310);
      }
      if (capG && capG !== g) {
        pieceMap.delete(capIdx);
        const fp = sqPos(move.from), tp2 = sqPos(move.to);
        setTimeout(() => topplePiece(capG, tp2.x - fp.x, tp2.z - fp.z), 130);
      }
      if (move.castle) {
        const r = move.from >> 3;
        const rf = move.castle === 'K' || move.castle === 'k' ? 7 : 0, rt = move.castle === 'K' || move.castle === 'k' ? 5 : 3;
        const rg = pieceMap.get(r * 8 + rf);
        if (rg) { pieceMap.delete(r * 8 + rf); pieceMap.set(r * 8 + rt, rg); const p = sqPos(r * 8 + rt); tweenPos(rg, p.x, BASE_Y, p.z, 300, true); }
      }
      // settle everything else instantly (undo, loads)
      for (const [idx, grp] of pieceMap) {
        if (grp === g || grp === capG) continue;
        const want = desired.get(idx);
        if (!want || grp.userData.piece !== want) { piecesGroup.remove(grp); pieceMap.delete(idx); }
        else { const p = sqPos(idx); grp.position.set(p.x, BASE_Y, p.z); grp.quaternion.identity(); grp.scale.set(1, 1, 1); }
      }
      for (const [idx, p] of desired) if (!pieceMap.has(idx)) addPiece(idx, p);
    } else {
      for (const [idx, grp] of [...pieceMap]) {
        const want = desired.get(idx);
        if (!want || grp.userData.piece !== want) { piecesGroup.remove(grp); pieceMap.delete(idx); }
        else if (grp !== dragGroup) { const p = sqPos(idx); grp.position.set(p.x, BASE_Y, p.z); grp.quaternion.identity(); grp.scale.set(1, 1, 1); }
      }
      for (const [idx, p] of desired) if (!pieceMap.has(idx)) addPiece(idx, p);
    }
  }
  /* the living set: topples, flinches, manners, salutes */
  function topplePiece(g, dx, dz) {
    const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
    const fx = g.position.x, fz = g.position.z;
    const axis = new T.Vector3(dz, 0, -dx);
    const band = new T.Mesh(GEO.band || (GEO.band = new T.TorusGeometry(0.31, 0.018, 8, 40)),
      new T.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0 }));
    band.rotation.x = Math.PI / 2; band.position.y = 0.40; g.add(band);
    addTween(g, 560, (e, k) => {
      g.quaternion.setFromAxisAngle(axis, 1.72 * e);
      g.position.set(fx + dx * 0.17 * e, BASE_Y + Math.sin(e * Math.PI) * 0.05 - 0.02 * e, fz + dz * 0.17 * e);
      band.material.opacity = Math.sin(Math.min(1, k * 1.5) * Math.PI) * 0.95;
    }, () => {
      g.remove(band); band.material.dispose();
      setTimeout(() => tweenShrink(g, () => piecesGroup.remove(g)), 240);
    });
  }
  function flinchPiece(g) {
    let ring = null;
    g.traverse(o => { if (!ring && o.geometry && o.geometry.type === 'TorusGeometry') ring = o; });
    const axis = new T.Vector3(1, 0, 0.35).normalize();
    addTween(g, 420, (e, k) => {
      g.quaternion.setFromAxisAngle(axis, Math.sin(k * Math.PI * 3) * (1 - k) * 0.085);
      if (ring) { const sc = 1 + Math.sin(Math.min(1, k) * Math.PI) * 0.3; ring.scale.set(sc, sc, 1); }
    }, () => { g.quaternion.identity(); if (ring) ring.scale.set(1, 1, 1); });
  }
  function attend(idx, targets) {
    const g = pieceMap.get(idx); if (!g) return;
    const piece = g.userData.piece, isN = piece.toLowerCase() === 'n';
    let targetYaw = g.rotation.y;
    if (isN && targets && targets.length) {
      let cx = 0, cz = 0;
      for (const tIdx of targets) { const p = sqPos(tIdx); cx += p.x; cz += p.z; }
      cx /= targets.length; cz /= targets.length;
      const dx = cx - g.position.x, dz = cz - g.position.z;
      if (Math.hypot(dx, dz) > 0.05) {
        const sg = piece === 'N' ? -1 : 1;
        targetYaw = Math.atan2(sg * dx, sg * dz);
      }
    }
    let dYaw = targetYaw - g.rotation.y;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    const startYaw = g.rotation.y;
    addTween(g, 210, e => {
      if (dragGroup === g) g.position.y = 1.05; else g.position.y = BASE_Y + 0.13 * e;
      if (isN) g.rotation.y = startYaw + dYaw * e;
    });
  }
  function bounce(idx) {
    const g = pieceMap.get(idx); if (!g || dragGroup === g) return;
    addTween(g, 560, (e, k) => { g.position.y = BASE_Y + Math.abs(Math.sin(k * Math.PI * 2)) * 0.16 * (1 - k * 0.3); });
  }
  function salute(winner) {
    const kings = {}, army = { w: [], b: [] };
    for (const g of pieceMap.values()) {
      const p = g.userData.piece, c = p === p.toUpperCase() ? 'w' : 'b';
      army[c].push(g); if (p.toLowerCase() === 'k') kings[c] = g;
    }
    const bow = (kg, toward, ang) => {
      if (!kg || !toward) return;
      const dx = toward.position.x - kg.position.x, dz = toward.position.z - kg.position.z;
      const len = Math.hypot(dx, dz) || 1;
      const axis = new T.Vector3(dz / len, 0, -dx / len);
      addTween(kg, 750, e => { kg.quaternion.setFromAxisAngle(axis, ang * e); });
    };
    setTimeout(() => {
      if (winner) {
        const loser = winner === 'w' ? 'b' : 'w';
        bow(kings[loser], kings[winner], 0.55);
        army[winner].forEach((g, i) => setTimeout(() => {
          const home = sqPos(g.userData.sq), sx = g.position.x, sz = g.position.z;
          addTween(g, 820, (e, k) => {
            g.position.set(sx + (home.x - sx) * e, BASE_Y + Math.sin(Math.min(1, k) * Math.PI) * 0.075, sz + (home.z - sz) * e);
          });
        }, i * 45));
      } else { bow(kings.w, kings.b, 0.38); bow(kings.b, kings.w, 0.38); }
    }, 380);
  }
  function addPiece(idx, p) {
    const color = p === p.toUpperCase() ? 'w' : 'b';
    const g = pieceGroup(p.toLowerCase(), color);
    g.userData.piece = p; g.userData.sq = idx;
    const pos = sqPos(idx);
    g.position.set(pos.x, BASE_Y, pos.z);
    piecesGroup.add(g); pieceMap.set(idx, g);
    return g;
  }
  function replacePiece(idx, p) {
    const old = pieceMap.get(idx);
    if (old) { piecesGroup.remove(old); pieceMap.delete(idx); }
    addPiece(idx, p);
  }
  function noteMove(m, prevB) { animNote = { move: m, prevB }; }
  /* --- animation --- */
  function tweenPos(g, x, y, z, dur, arc, arcH, easeFn) {
    tweens = tweens.filter(t => t.g !== g);
    tweens.push({ g, fx: g.position.x, fy: g.position.y, fz: g.position.z, tx: x, ty: y, tz: z, t: 0, dur, arc, arcH, easeFn });
  }
  function addTween(g, dur, fn, onDone) {
    tweens = tweens.filter(t => t.g !== g);
    tweens.push({ g, fn, t: 0, dur, onDone });
  }
  const strikeEase = k => k < 0.62 ? 0.84 * Math.pow(k / 0.62, 2) : 0.84 + 0.16 * (1 - Math.pow(1 - (k - 0.62) / 0.38, 2));
  function tweenShrink(g, onDone) {
    tweens = tweens.filter(t => t.g !== g);
    tweens.push({ g, shrink: true, t: 0, dur: 190, onDone });
  }
  const ease = t => 1 - Math.pow(1 - t, 3);
  function stepTweens(dt) {
    for (const t of [...tweens]) {
      t.t += dt;
      const k = Math.min(1, t.t / t.dur), e = ease(k);
      if (t.shrink) { const s = 1 - e * 0.9; t.g.scale.set(s, s * (1 - e * 0.4), s); t.g.position.y = BASE_Y - e * 0.1; }
      else if (t.fn) { t.fn(e, k); }
      else {
        const ee = t.easeFn ? t.easeFn(k) : e;
        t.g.position.set(t.fx + (t.tx - t.fx) * ee, t.fy + (t.ty - t.fy) * ee + (t.arc ? Math.sin(ee * Math.PI) * (t.arcH != null ? t.arcH : 0.55) : 0), t.fz + (t.tz - t.fz) * ee);
      }
      if (k >= 1) { tweens.splice(tweens.indexOf(t), 1); if (t.onDone) t.onDone(); }
    }
  }
  function intro() {
    const items = [...pieceMap.entries()].sort((a, b) => (a[0] >> 3) - (b[0] >> 3));
    items.forEach(([idx, g], i) => {
      const p = sqPos(idx);
      g.position.set(p.x, BASE_Y + 1.3, p.z);
      setTimeout(() => tweenPos(g, p.x, BASE_Y, p.z, 340, false), 50 + i * 22);
    });
  }
  /* --- camera --- */
  function pose() {
    const side = flipped ? -1 : 1;
    return viewMode === 'seat'
      ? { pos: new T.Vector3(0, 9.4, 11.8 * side), tgt: new T.Vector3(0, 0, -0.2 * side) }
      : { pos: new T.Vector3(0, 14.2, 2.6 * side), tgt: new T.Vector3(0, 0, 0.1 * side) };
  }
  function setView(v) { viewMode = v; }
  function setFlipped(f) { flipped = f; }
  function orbitBy(dx, dy) {
    az = Math.max(-0.55, Math.min(0.55, az - dx * 0.004));
    el = Math.max(-0.5, Math.min(2.2, el + dy * 0.01));
  }
  let lastT = 0;
  function loop(t) {
    if (document.hidden) { started = false; return; }
    requestAnimationFrame(loop);
    const dt = lastT ? Math.min(50, t - lastT) : 16.7;
    lastT = t;
    stepTweens(dt);
    if (checkMarker) checkMarker.material.opacity = 0.34 + Math.sin(t * 0.008) * 0.14;
    const ps = pose();
    const p = ps.pos.clone();
    // orbit: swing around the target, lift/drop with el
    const off = p.clone().sub(ps.tgt);
    const ang = Math.atan2(off.x, off.z) + az;
    const rad = Math.hypot(off.x, off.z);
    p.x = ps.tgt.x + Math.sin(ang) * rad;
    p.z = ps.tgt.z + Math.cos(ang) * rad;
    p.y = Math.max(2.2, ps.pos.y + el);
    if (!camPos) { camPos = p.clone(); camTgt = ps.tgt.clone(); }
    camPos.lerp(p, 0.09); camTgt.lerp(ps.tgt, 0.12);
    camera.position.copy(camPos); camera.lookAt(camTgt);
    renderer.render(scene, camera);
  }
  /* --- picking --- */
  const ray = () => new T.Raycaster();
  function ndc(x, y) {
    const r = canvas.getBoundingClientRect();
    return { nx: ((x - r.left) / r.width) * 2 - 1, ny: -((y - r.top) / r.height) * 2 + 1, rect: r };
  }
  function pick(x, y) {
    const { nx, ny } = ndc(x, y);
    const rc = ray(); rc.setFromCamera({ x: nx, y: ny }, camera);
    const hits = rc.intersectObjects([piecesGroup, boardGroup], true);
    for (const h of hits) {
      let o = h.object;
      if (dragGroup && (o === dragGroup || o.userData.pieceRoot === dragGroup)) continue;
      if (o.userData.pieceRoot && pieceMap.get(o.userData.pieceRoot.userData.sq) === o.userData.pieceRoot) return o.userData.pieceRoot.userData.sq;
      if (o.userData.sq !== undefined && sqMeshes.includes(o)) return o.userData.sq;
    }
    return -1;
  }
  function project(idx) {
    const p = sqPos(idx);
    const v = new T.Vector3(p.x, 0.14, p.z).project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }
  /* --- drag --- */
  function liftDrag(idx) {
    dragGroup = pieceMap.get(idx) || null;
    if (dragGroup) dragGroup.position.y = 1.05;
  }
  function moveDrag(x, y) {
    if (!dragGroup) return;
    const { nx, ny } = ndc(x, y);
    const rc = ray(); rc.setFromCamera({ x: nx, y: ny }, camera);
    const planeY = new T.Plane(new T.Vector3(0, 1, 0), -1.05);
    const pt = new T.Vector3();
    if (rc.ray.intersectPlane(planeY, pt)) {
      dragGroup.position.x = Math.max(-3.9, Math.min(3.9, pt.x));
      dragGroup.position.z = Math.max(-3.9, Math.min(3.9, pt.z));
    }
  }
  function endDrag() { dragGroup = null; }
  return { init, buildAll, sync, noteMove, pick, project, setView, setFlipped, orbitBy, liftDrag, moveDrag, endDrag, resize, intro, attend, bounce, salute,
    get viewMode() { return viewMode; } };
})();
