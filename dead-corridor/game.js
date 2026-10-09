/* Dead Man's Corridor — game logic. On-rails horror shooter.
 * The camera rides a fixed rail through the facility; the player drags to
 * look and the gun auto-fires on target. Tap also fires manually.
 */
(function () {
  'use strict';
  var E = window.DC_ENGINE, A = window.DC_ART;
  var TAU = Math.PI * 2;

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function angDiff(a, b) {
    var d = a - b;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return d;
  }
  // seeded rng for daily
  function mulberry32(s) {
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ================= map ================= */
  var MW = 28, MH = 44;
  var grid;
  function buildMap() {
    grid = new Uint8Array(MW * MH);
    grid.fill(1);   // 1 = concrete wall; carve open space as 0
    function carve(x0, y0, x1, y1) {
      for (var y = y0; y <= y1; y++)
        for (var x = x0; x <= x1; x++)
          grid[y * MW + x] = 0;
    }
    carve(8, 2, 20, 10);     // arena 3 (flesh zone walls around it)
    carve(12, 11, 15, 15);   // corridor
    carve(8, 16, 20, 24);    // arena 2
    carve(12, 25, 15, 29);   // corridor
    carve(8, 30, 20, 38);    // arena 1
    carve(12, 39, 15, 42);   // entrance
    // texture paint: rust corridors, flesh arena 3 (walls only, around carved space)
    function paint(x0, y0, x1, y1, v) {
      for (var y = y0; y <= y1; y++)
        for (var x = x0; x <= x1; x++) {
          var i = y * MW + x;
          if (grid[i] !== 0) grid[i] = v;
        }
    }
    paint(11, 10, 16, 16, 2); paint(11, 24, 16, 30, 2); paint(11, 38, 16, 43, 2);
    paint(7, 1, 21, 11, 3);
    // doors (decor) flanking arena mouths
    grid[15 * MW + 11] = 4; grid[15 * MW + 16] = 4;
    grid[29 * MW + 11] = 4; grid[29 * MW + 16] = 4;
    grid[10 * MW + 11] = 4; grid[10 * MW + 16] = 4;
  }
  var TEX_FOR = { 1: 'concrete', 2: 'rust', 3: 'flesh', 4: 'door' };
  var mapDef = null;
  function getMap() {
    if (!mapDef) mapDef = {
      grid: grid, w: MW,
      texFor: function (c) { return TEX_FOR[c] || 'concrete'; },
      ceilColor: '#0a0712', floorTex: 'floor', wallTex: 'concrete'
    };
    return mapDef;
  }
  function solidAt(x, y) {
    var mx = Math.floor(x), my = Math.floor(y);
    if (mx < 0 || my < 0 || mx >= MW || my >= MH) return true;
    return grid[my * MW + mx] !== 0;
  }

  /* ================= rail ================= */
  var NORTH = -Math.PI / 2;
  var RAIL = [
    { x: 13.5, y: 41.5, a: NORTH },
    { x: 13.5, y: 34.5, a: NORTH, dwell: 'w1' },
    { x: 13.5, y: 20.5, a: NORTH, dwell: 'w2' },
    { x: 13.5, y: 6.5, a: NORTH, dwell: 'w3' }
  ];
  var RAIL_SPEED = 1.7;

  /* ================= waves ================= */
  // comp: [type, count, delay]
  var WAVES = {
    w1: { name: 'SECTOR 1 — INTAKE', comp: [['husk', 3, 0.8], ['crawler', 1, 4]] },
    w2: { name: 'SECTOR 2 — WARDS', comp: [['husk', 5, 0.5], ['crawler', 3, 2], ['spitter', 1, 5]] },
    w3: { name: 'SECTOR 3 — THE HEART', comp: [['brute', 1, 1], ['husk', 3, 3], ['spitter', 1, 6], ['crawler', 3, 9]] }
  };
  var FOE = {
    husk:    { hp: 3,  speed: 1.3, dmg: 8,  score: 100, scale: 0.85, radius: 0.42 },
    crawler: { hp: 2,  speed: 2.4, dmg: 6,  score: 150, scale: 0.62, radius: 0.36 },
    brute:   { hp: 12, speed: 0.9, dmg: 16, score: 300, scale: 1.35, radius: 0.6 },
    spitter: { hp: 4,  speed: 1.2, dmg: 10, score: 200, scale: 0.9,  radius: 0.42 }
  };

  /* ================= state ================= */
  var state = 'title';   // title | ride | over
  var canvas, ctx, cw, ch;
  var G = null;          // run state

  function newRun(dailySeed) {
    var rng = dailySeed != null ? mulberry32(dailySeed) : Math.random;
    return {
      rng: rng, daily: dailySeed != null,
      railI: 0, railT: 0, moving: true, dwell: null, spawnQueue: [], spawnT: 0,
      trickleT: 4,
      px: RAIL[0].x, py: RAIL[0].y, baseA: NORTH,
      lookYaw: 0, lookPitch: 0,
      foes: [], bolts: [], orbs: [], parts: [], decals: [],
      hp: 100, maxHp: 100,
      ammo: 8, magSize: 8, reloading: 0,
      fireCd: 0, flash: 0, recoil: 0,
      charge: 0, novaReady: false,
      score: 0, kills: 0, shots: 0, hits: 0, combo: 0, maxCombo: 0,
      dmgFlash: 0, shake: 0, hitStop: 0, slowmo: 0,
      waveName: '', waveClearT: 0,
      time: 0, over: false, win: false,
      hurtT: 0
    };
  }

  /* ================= spawning ================= */
  function arenaBounds(dwell) {
    if (dwell === 'w1') return { x0: 9, x1: 19, y0: 31, y1: 37 };
    if (dwell === 'w2') return { x0: 9, x1: 19, y0: 17, y1: 23 };
    return { x0: 9, x1: 19, y0: 3, y1: 9 };
  }
  function spawnFoe(type, bx) {
    var F = FOE[type];
    // sample until we find open ground (never inside a wall)
    var x = 0, y = 0, tries = 0;
    do {
      x = bx.x0 + G.rng() * (bx.x1 - bx.x0);
      y = bx.y0 + G.rng() * (bx.y1 - bx.y0);
      tries++;
    } while (solidAt(x, y) && tries < 16);
    if (solidAt(x, y)) return;   // no open cell — skip the spawn
    // keep out of the player's face
    if (Math.hypot(x - G.px, y - G.py) < 4) {
      y = bx.y0 + 1;
      if (solidAt(x, y)) return;
    }
    G.foes.push({
      type: type, x: x, y: y,
      hp: F.hp, maxHp: F.hp,
      state: 'walk', t: G.rng() * 10, atkT: 0,
      hitFlash: 0, deadT: 0, vy: 0
    });
  }
  function startDwell(dwell) {
    G.dwell = dwell;
    var w = WAVES[dwell];
    G.waveName = w.name;
    G.spawnQueue = [];
    w.comp.forEach(function (c) {
      for (var i = 0; i < c[1]; i++) G.spawnQueue.push({ type: c[0], at: c[2] + i * 1.6 });
    });
    G.spawnT = 0;
    banner(w.name);
  }

  /* ================= combat ================= */
  function targets() {
    // shootable things: foes + bolts, with screen x
    var out = [];
    var bs = E.bufSize();
    function consider(x, y, radius, ref, kind, scale) {
      var dx = x - G.px, dy = y - G.py;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 14) return;
      var ad = angDiff(Math.atan2(dy, dx), G.baseA + G.lookYaw);
      if (Math.abs(ad) > 0.62) return;
      var sx = (0.5 + 0.5 * Math.tan(ad) / Math.tan(36 * Math.PI / 180)) * bs.w;
      var col = clamp(Math.floor(sx), 0, bs.w - 1);
      if (E.zbuf && E.zbuf[col] < dist * 0.95) return;   // occluded
      out.push({ sx: sx, dist: dist, ref: ref, kind: kind, radius: radius,
                 size: bs.h / Math.max(0.6, dist) * (scale || 0.8) });
    }
    G.foes.forEach(function (f) {
      if (f.state === 'dead') return;
      consider(f.x, f.y, FOE[f.type].radius, f, 'foe', FOE[f.type].scale);
    });
    G.bolts.forEach(function (b) { consider(b.x, b.y, 0.22, b, 'bolt', 0.35); });
    return out;
  }

  function fire() {
    if (G.reloading > 0 || G.ammo <= 0) { startReload(); return; }
    if (G.fireCd > 0) return;
    G.fireCd = 0.24;
    G.ammo--; G.shots++;
    G.flash = 1; G.recoil = 1;
    G.shake = Math.max(G.shake, 3);
    DCSfx.shoot();
    var bs = E.bufSize(), cx = bs.w / 2;
    var best = null, bestScore = 1e9;
    targets().forEach(function (t) {
      var win = t.size * 0.34;   // generous: about a third of the sprite
      var d = Math.abs(t.sx - cx);
      if (d < win) {
        var s = t.dist + d * 0.05;
        if (s < bestScore) { bestScore = s; best = t; }
      }
    });
    if (best) {
      G.hits++;
      G.combo++;
      if (G.combo > G.maxCombo) G.maxCombo = G.combo;
      if (best.kind === 'bolt') {
        best.ref.dead = true;
        addScore(25, best.ref.x, best.ref.y);
        burstFx(best.ref.x, best.ref.y, '#a8e04a', 8);
      } else {
        damageFoe(best.ref, 1, best.sx);
      }
    } else {
      G.combo = 0;   // clean miss breaks the combo
      // wall impact puff at crosshair ray
      var r = E.castRay(getMap().grid, MW, G.px, G.py, G.baseA + G.lookYaw);
      burstFx(r.hx, r.hy, '#8a8a92', 4);
    }
    if (G.ammo <= 0) startReload();
  }

  function damageFoe(f, dmg, sx) {
    f.hp -= dmg;
    f.hitFlash = 0.12;
    DCSfx.hit();
    var bs = E.bufSize();
    bloodFx(sx == null ? bs.w / 2 : sx, bs.h * 0.42, 10);
    if (f.hp <= 0 && f.state !== 'dead') killFoe(f);
  }

  /* combo-scaled scoring, with a floating combat-text pop */
  function addScore(base, wx, wy) {
    var pts = Math.round(base * (1 + G.combo * 0.1));
    G.score += pts;
    if (wx != null) {
      var dx = wx - G.px, dy = wy - G.py;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var ad = angDiff(Math.atan2(dy, dx), G.baseA + G.lookYaw);
      var bs = E.bufSize();
      var sx = (0.5 + 0.5 * Math.tan(ad) / Math.tan(36 * Math.PI / 180)) * bs.w;
      var sy = bs.h * 0.5 - (bs.h / dist) * 0.15;
      G.parts.push({ x: sx, y: sy, vx: 0, vy: -34, life: 0.8, t: 0,
        col: '#ffe14d', sz: 0, text: '+' + pts });
    }
  }

  function killFoe(f) {
    f.state = 'dead'; f.deadT = 0;
    var F = FOE[f.type];
    G.kills++;
    addScore(F.score, f.x, f.y);
    G.hitStop = Math.max(G.hitStop, 0.05);
    DCSfx.kill();
    // persistent blood decal where it fell (capped, recycled)
    G.decals.push({ x: f.x, y: f.y, t: 0, s: 0.5 + Math.random() * 0.5 });
    if (G.decals.length > 28) G.decals.shift();
    // charge orbs
    var n = f.type === 'brute' ? 4 : (f.type === 'spitter' ? 2 : 1);
    for (var i = 0; i < n; i++)
      G.orbs.push({ x: f.x + (Math.random() - 0.5), y: f.y + (Math.random() - 0.5), t: 0 });
    checkWaveClear();
  }

  function checkWaveClear() {
    if (!G.dwell) return;
    var alive = G.foes.some(function (f) { return f.state !== 'dead'; });
    if (!alive && G.spawnQueue.length === 0) {
      G.score += 500;
      G.hp = Math.min(G.maxHp, G.hp + 30);   // catch your breath
      banner(G.waveName + ' — CLEARED  +500');
      G.waveClearT = 1.6;
      G.dwell = null;
      // resume the rail after a beat
      setTimeout(function () {
        if (G && !G.over && state === 'ride') { G.moving = true; }
      }, 1400);
    }
  }

  function hurtPlayer(dmg, src) {
    if (G.over) return;
    G.hp -= dmg;
    if (src) { G.dmgBy = G.dmgBy || {}; G.dmgBy[src] = (G.dmgBy[src] || 0) + dmg; }
    G.combo = 0;   // taking a hit breaks the combo
    G.dmgFlash = 1;
    G.shake = Math.max(G.shake, 9);
    G.hitStop = Math.max(G.hitStop, 0.06);
    G.hurtT = G.time;
    DCSfx.hurt();
    if (G.hp <= 0) { G.hp = 0; gameOver(false); }
  }

  function startReload() {
    if (G.reloading > 0 || G.ammo >= G.magSize) return;
    G.reloading = 1.3;
    DCSfx.reload();
  }

  function nova() {
    if (!G.novaReady || G.over) return;
    G.novaReady = false; G.charge = 0;
    G.flash = 1.6; G.shake = 16;
    DCSfx.nova();
    targets().forEach(function (t) {
      if (t.kind === 'foe' && t.ref.state !== 'dead') damageFoe(t.ref, 6);
    });
    G.bolts.forEach(function (b) { b.dead = true; });
    banner('NOVA BLAST');
  }

  /* ================= fx (screen space) ================= */
  function bloodFx(sx, sy, n) {
    for (var i = 0; i < n; i++)
      G.parts.push({ x: sx, y: sy, vx: (Math.random() - 0.5) * 130, vy: -Math.random() * 120,
        life: 0.5 + Math.random() * 0.3, t: 0, col: '#a01822', sz: 2 + Math.random() * 3 });
  }
  function burstFx(wx, wy, col, n) {
    // world -> screen for wall impacts
    var dx = wx - G.px, dy = wy - G.py;
    var dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
    var ad = angDiff(Math.atan2(dy, dx), G.baseA + G.lookYaw);
    var bs = E.bufSize();
    var sx = (0.5 + 0.5 * Math.tan(ad) / Math.tan(36 * Math.PI / 180)) * bs.w;
    var sy = bs.h * 0.5 - (bs.h / dist) * 0.12;
    for (var i = 0; i < n; i++)
      G.parts.push({ x: sx, y: sy, vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.5) * 90,
        life: 0.35, t: 0, col: col, sz: 1.5 + Math.random() * 2 });
  }

  function banner(txt) {
    var b = $('banner');
    b.textContent = txt;
    b.classList.remove('hidden');
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(b._t);
    b._t = setTimeout(function () { b.classList.add('hidden'); }, 2200);
  }

  /* ================= update ================= */
  var lights = [];
  function buildLights() {
    lights = [];
    function L(x, y, r, i, fl) { lights.push({ x: x, y: y, radius: r, intensity: i, baseFl: 1, fl: fl || 0, ph: Math.random() * 7 }); }
    // corridor fluorescents (flickery)
    for (var y = 40; y >= 4; y -= 6) { L(13.5, y, 6, 0.85, 1); }
    // arena lights
    L(13.5, 34.5, 9, 1.0, 1);
    L(13.5, 20.5, 9, 1.0, 1);
    L(13.5, 6.5, 9, 1.1, 0);   // heart: steady red-ish handled by tint
    return lights;
  }

  function update(dt) {
    G.time += dt;
    // decay
    G.flash = Math.max(0, G.flash - dt * 6);
    G.recoil = Math.max(0, G.recoil - dt * 5);
    G.fireCd = Math.max(0, G.fireCd - dt);
    G.dmgFlash = Math.max(0, G.dmgFlash - dt * 2.2);
    G.shake = Math.max(0, G.shake - dt * 26);
    G.hitStop = Math.max(0, G.hitStop - dt);
    if (G.reloading > 0) {
      G.reloading -= dt;
      if (G.reloading <= 0) { G.ammo = G.magSize; }
    }
    // light flicker
    for (var li = 0; li < lights.length; li++) {
      var L = lights[li];
      if (L.fl) {
        var s = Math.sin(G.time * 13 + L.ph) * Math.sin(G.time * 7.3 + L.ph * 2);
        L.flick = s < -0.93 ? 0.25 : (0.8 + 0.2 * s);
      } else L.flick = 1;
    }

    if (G.hitStop > 0) return;   // freeze world, fx still decayed above

    // rail movement
    if (G.moving && !G.over) {
      var a = RAIL[G.railI], b = RAIL[G.railI + 1];
      if (!b) { gameOver(true); return; }
      var dx = b.x - a.x, dy = b.y - a.y;
      var segLen = Math.hypot(dx, dy);
      G.railT += (RAIL_SPEED * dt) / segLen;
      if (G.railT >= 1) {
        G.railI++; G.railT = 0;
        var nb = RAIL[G.railI];
        G.px = nb.x; G.py = nb.y; G.baseA = nb.a;
        if (nb.dwell) { G.moving = false; startDwell(nb.dwell); }
        // else: keep rolling to the next node
      } else {
        G.px = lerp(a.x, b.x, G.railT);
        G.py = lerp(a.y, b.y, G.railT);
        G.baseA = a.a + angDiff(b.a, a.a) * G.railT;
      }
      // trickle spawns in corridors: a crawler now and then
      G.trickleT -= dt;
      if (G.trickleT <= 0 && G.foes.length < 3) {
        G.trickleT = 5 + Math.random() * 4;
        spawnFoe('crawler', { x0: G.px - 2, x1: G.px + 2, y0: G.py - 7, y1: G.py - 5 });
      }
    }

    // dwell spawning
    if (G.dwell) {
      G.spawnT += dt;
      var bx = arenaBounds(G.dwell);
      for (var qi = G.spawnQueue.length - 1; qi >= 0; qi--) {
        if (G.spawnQueue[qi].at <= G.spawnT) {
          spawnFoe(G.spawnQueue[qi].type, bx);
          G.spawnQueue.splice(qi, 1);
          DCSfx.spawn();
        }
      }
    }

    // foes — cap concurrent rushers: beyond the 3 nearest, they shamble
    // in slowly instead of swarming (staggered arrivals, fairer fights)
    var rank = G.foes
      .filter(function (f) { return f.state !== 'dead'; })
      .map(function (f) { return { f: f, d: Math.hypot(f.x - G.px, f.y - G.py) }; })
      .sort(function (a, b) { return a.d - b.d; });
    var i, f, F;
    for (i = G.foes.length - 1; i >= 0; i--) {
      f = G.foes[i]; F = FOE[f.type];
      f.t += dt;
      f.hitFlash = Math.max(0, f.hitFlash - dt);
      if (f.state === 'dead') {
        f.deadT += dt;
        if (f.deadT > 1.4) G.foes.splice(i, 1);
        continue;
      }
      var fdx = G.px - f.x, fdy = G.py - f.y;
      var fdist = Math.hypot(fdx, fdy) || 0.01;
      var isRusher = rank.findIndex(function (r) { return r.f === f; }) < 3;
      var spMul = isRusher ? 1 : 0.45;
      if (f.type === 'spitter' && fdist < 6.5 && fdist > 3.5) {
        // hold range, charge, spit
        f.state = 'attack'; f.atkT += dt;
        if (f.atkT > 1.1) {
          f.atkT = 0;
          var ang = Math.atan2(fdy, fdx);
          G.bolts.push({ x: f.x, y: f.y, vx: Math.cos(ang) * 4.2, vy: Math.sin(ang) * 4.2, life: 4, dead: false });
          DCSfx.spit();
        }
      } else if (fdist < 1.25) {
        // lunge attack
        if (f.state !== 'attack') { f.state = 'attack'; f.atkT = 0; DCSfx.telegraph(); }
        f.atkT += dt;
        if (f.atkT > 0.45) {
          f.atkT = -0.9;   // cooldown before next lunge
          hurtPlayer(F.dmg, f.type);
          // lunge visual: quick push toward player
          f.x += fdx / fdist * 0.35; f.y += fdy / fdist * 0.35;
        }
      } else {
        f.state = 'walk';
        // steer toward player, slide on walls (non-rushers shamble)
        var sp = F.speed * spMul * dt;
        var nx = f.x + fdx / fdist * sp, ny = f.y + fdy / fdist * sp;
        if (!solidAt(nx, f.y)) f.x = nx;
        if (!solidAt(f.x, ny)) f.y = ny;
      }
    }

    // bolts
    for (i = G.bolts.length - 1; i >= 0; i--) {
      var bl = G.bolts[i];
      if (bl.dead) { G.bolts.splice(i, 1); continue; }
      bl.x += bl.vx * dt; bl.y += bl.vy * dt; bl.life -= dt;
      if (solidAt(bl.x, bl.y)) { bl.dead = true; burstFx(bl.x, bl.y, '#a8e04a', 5); continue; }
      if (Math.hypot(bl.x - G.px, bl.y - G.py) < 0.55) {
        bl.dead = true;
        hurtPlayer(10, 'bolt');
        continue;
      }
      if (bl.life <= 0) bl.dead = true;
    }

    // charge orbs fly to player
    for (i = G.orbs.length - 1; i >= 0; i--) {
      var o = G.orbs[i];
      o.t += dt;
      var k = Math.min(1, o.t / 0.7);
      o.x = lerp(o.x, G.px, k * 0.2); o.y = lerp(o.y, G.py, k * 0.2);
      if (Math.hypot(o.x - G.px, o.y - G.py) < 0.5 || o.t > 1.2) {
        G.orbs.splice(i, 1);
        G.charge = Math.min(100, G.charge + 20);   // ~5 kills to a full nova
        if (G.charge >= 100 && !G.novaReady) { G.novaReady = true; banner('NOVA READY — tap ✦'); DCSfx.ready(); }
      }
    }

    // auto-fire: crosshair on target (generous window = aim assist)
    if (!G.over && G.fireCd <= 0 && G.reloading <= 0 && G.ammo > 0) {
      var bs = E.bufSize(), cx = bs.w / 2;
      var anyOn = targets().some(function (t) {
        return Math.abs(t.sx - cx) < t.size * 0.34;
      });
      if (anyOn) fire();
    }

    // particles
    for (i = G.parts.length - 1; i >= 0; i--) {
      var p = G.parts[i];
      p.t += dt;
      if (p.t >= p.life) { G.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (!p.text) p.vy += 260 * dt;   // combat text floats, debris falls
    }
    // blood decals age out slowly
    for (i = G.decals.length - 1; i >= 0; i--) {
      G.decals[i].t += dt;
      if (G.decals[i].t > 30) G.decals.splice(i, 1);
    }
  }

  /* ================= render ================= */
  var grainCv = null;
  function getGrain() {
    if (grainCv) return grainCv;
    var c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    var x = c.getContext('2d');
    var id = x.createImageData(128, 128);
    for (var i = 0; i < id.data.length; i += 4) {
      var v = (Math.random() * 255) | 0;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 22;
    }
    x.putImageData(id, 0, 0);
    grainCv = c;
    return c;
  }

  function foeSprite(f) {
    var set = A.sprites[f.type];
    if (f.state === 'dead') return set[3];
    if (f.state === 'attack') return set[2];
    return set[Math.floor(f.t * 6) % 2];
  }

  function render() {
    var view = {
      x: G.px, y: G.py,
      ang: G.baseA + G.lookYaw,
      pitch: G.lookPitch,
      flash: G.flash
    };
    // camera shake
    if (G.shake > 0.2) {
      view.x += (Math.random() - 0.5) * G.shake * 0.02;
      view.y += (Math.random() - 0.5) * G.shake * 0.02;
    }
    var sprites = [];
    G.foes.forEach(function (f) {
      var F = FOE[f.type];
      var fade = f.state === 'dead' ? Math.max(0, 1 - f.deadT / 1.4) : 1;
      if (fade <= 0) return;
      sprites.push({
        x: f.x, y: f.y, tex: foeSprite(f), scale: F.scale * (f.state === 'dead' ? 0.8 : 1),
        vMove: f.type === 'crawler' ? 60 : 0,
        yOff: 0, alpha: fade, hitFlash: f.hitFlash
      });
    });
    G.bolts.forEach(function (b) {
      if (!b.dead) sprites.push({ x: b.x, y: b.y, tex: A.boltTex, scale: 0.35, vMove: 0 });
    });
    G.orbs.forEach(function (o) {
      sprites.push({ x: o.x, y: o.y, tex: A.chargeTex, scale: 0.3, vMove: -40 });
    });
    // blood decals: flat on the floor where foes fell
    G.decals.forEach(function (d) {
      var fade = d.t < 24 ? 1 : Math.max(0, 1 - (d.t - 24) / 6);
      if (fade > 0) sprites.push({ x: d.x, y: d.y, tex: A.splatTex, scale: 0.42 * d.s,
        vMove: 0, yOff: 2.2, alpha: 0.85 * fade, decal: true });
    });
    // far -> near
    sprites.sort(function (a, b) {
      var da = (a.x - G.px) * (a.x - G.px) + (a.y - G.py) * (a.y - G.py);
      var db = (b.x - G.px) * (b.x - G.px) + (b.y - G.py) * (b.y - G.py);
      return db - da;
    });

    var buf = E.render(view, getMap(), lights, sprites);
    var bctx = buf.getContext('2d');
    var bs = E.bufSize();

    // hit-flash: white silhouette over damaged foes (screen-space, cheap)
    // (skip: handled via brightness pulse below)

    // screen-space particles (blood, sparks) + floating combat text
    G.parts.forEach(function (p) {
      var a = 1 - p.t / p.life;
      if (p.text) {
        bctx.globalAlpha = Math.min(1, a * 1.6);
        bctx.fillStyle = p.col;
        bctx.font = '700 13px system-ui';
        bctx.textAlign = 'center';
        bctx.fillText(p.text, p.x, p.y);
      } else {
        bctx.globalAlpha = a;
        bctx.fillStyle = p.col;
        bctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
      }
    });
    bctx.globalAlpha = 1;

    E.present(ctx, cw, ch, function (c2, w, h) {
      var i;
      // gun viewmodel
      var gun = A.gun[G.recoil > 0.66 ? 3 : (G.recoil > 0.33 ? 2 : (G.recoil > 0.05 ? 1 : 0))];
      var gw = Math.min(w * 0.52, 300), gh = gw * 0.75;
      var gx = w / 2 - gw / 2;
      var gy = h - gh * 0.92 + G.recoil * 14;
      if (G.reloading > 0) gy += Math.sin(G.time * 30) * 6;   // reload dip
      c2.drawImage(gun, gx, gy, gw, gh);

      // crosshair (dynamic)
      var chx = w / 2, chy = h * 0.44;
      var onT = targets().some(function (t) { return Math.abs(t.sx - bs.w / 2) < t.size * 0.34; });
      c2.strokeStyle = onT ? 'rgba(255,80,60,.95)' : 'rgba(255,255,255,.75)';
      c2.lineWidth = 2;
      var gap = onT ? 7 : 10, len = 7;
      c2.beginPath();
      c2.moveTo(chx - gap - len, chy); c2.lineTo(chx - gap, chy);
      c2.moveTo(chx + gap, chy); c2.lineTo(chx + gap + len, chy);
      c2.moveTo(chx, chy - gap - len); c2.lineTo(chx, chy - gap);
      c2.moveTo(chx, chy + gap); c2.lineTo(chx, chy + gap + len);
      c2.stroke();
      if (G.ammo === 0) {
        c2.fillStyle = 'rgba(255,80,60,.9)';
        c2.font = '700 13px system-ui'; c2.textAlign = 'center';
        c2.fillText('RELOADING…', chx, chy + 34);
      }
      // combo meter under the crosshair
      if (G.combo >= 3) {
        c2.fillStyle = G.combo >= 10 ? '#ffe14d' : 'rgba(255,255,255,.85)';
        c2.font = '800 15px system-ui'; c2.textAlign = 'center';
        c2.fillText('×' + G.combo + ' COMBO', chx, chy + 52);
      }

      // off-screen enemy indicators: look toward the threat
      var vA = G.baseA + G.lookYaw;
      G.foes.forEach(function (f) {
        if (f.state === 'dead') return;
        var fdx = f.x - G.px, fdy = f.y - G.py;
        var fdist = Math.sqrt(fdx * fdx + fdy * fdy);
        if (fdist > 11) return;
        var ad = angDiff(Math.atan2(fdy, fdx), vA);
        if (Math.abs(ad) < 0.55) return;   // already on screen
        var edgeX = ad > 0 ? w - 26 : 26;
        var edgeY = h * 0.44 - clamp((fdist - 3) * 12, 0, 90);
        var pulse = 0.55 + 0.45 * Math.sin(G.time * (f.state === 'attack' ? 14 : 7));
        c2.save();
        c2.globalAlpha = pulse;
        c2.fillStyle = f.state === 'attack' ? '#ff5a22' : '#c01824';
        c2.beginPath();
        if (ad > 0) { c2.moveTo(edgeX + 12, edgeY); c2.lineTo(edgeX - 6, edgeY - 10); c2.lineTo(edgeX - 6, edgeY + 10); }
        else { c2.moveTo(edgeX - 12, edgeY); c2.lineTo(edgeX + 6, edgeY - 10); c2.lineTo(edgeX + 6, edgeY + 10); }
        c2.closePath(); c2.fill();
        c2.restore();
      });

      // film grain
      c2.globalAlpha = 0.5;
      var gr = getGrain();
      var ox = (Math.random() * 128) | 0, oy = (Math.random() * 128) | 0;
      for (i = 0; i < w; i += 128)
        for (var j = 0; j < h; j += 128)
          c2.drawImage(gr, ox, oy, 128, 128, i, j, 128, 128);
      c2.globalAlpha = 1;

      // vignette
      var vg = c2.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,.55)');
      c2.fillStyle = vg;
      c2.fillRect(0, 0, w, h);

      // damage flash + low-hp pulse
      var dh = G.dmgFlash;
      if (G.hp < 30 && !G.over) dh = Math.max(dh, 0.25 + 0.2 * Math.sin(G.time * 6));
      if (dh > 0.01) {
        var dg = c2.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
        dg.addColorStop(0, 'rgba(160,0,0,0)');
        dg.addColorStop(1, 'rgba(180,10,10,' + (0.65 * dh).toFixed(2) + ')');
        c2.fillStyle = dg;
        c2.fillRect(0, 0, w, h);
      }
      // nova white flash
      if (G.flash > 1) {
        c2.fillStyle = 'rgba(255,255,240,' + clamp((G.flash - 1) * 0.9, 0, 0.85).toFixed(2) + ')';
        c2.fillRect(0, 0, w, h);
      }
    });
  }

  /* ================= HUD ================= */
  function updateHUD() {
    $('hud-hp-fill').style.width = (100 * G.hp / G.maxHp) + '%';
    $('hud-hp-fill').classList.toggle('low', G.hp < 30);
    $('hud-score').textContent = G.score;
    $('hud-charge-fill').style.width = G.charge + '%';
    $('btn-nova').classList.toggle('ready', G.novaReady);
    var ap = $('hud-ammo');
    var s = '';
    for (var i = 0; i < G.magSize; i++)
      s += '<i class="' + (i < G.ammo ? 'on' : '') + (G.reloading > 0 ? ' rel' : '') + '"></i>';
    if (ap._s !== s) { ap.innerHTML = s; ap._s = s; }
  }

  /* ================= input ================= */
  var dragId = null, dragX = 0, dragY = 0, dragMoved = 0, dragT = 0;
  function bindInput() {
    var el = canvas;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', function (e) {
      if (state !== 'ride' || G.over) return;
      dragId = e.pointerId; dragX = e.clientX; dragY = e.clientY;
      dragMoved = 0; dragT = performance.now();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic/no-active-pointer */ }
    });
    el.addEventListener('pointermove', function (e) {
      if (e.pointerId !== dragId) return;
      var dx = e.clientX - dragX, dy = e.clientY - dragY;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      // free look: the rail moves your body, your head turns without limit
      G.lookYaw -= dx * 0.0042;
      G.lookPitch = clamp(G.lookPitch - dy * 0.35, -60, 60);
      dragX = e.clientX; dragY = e.clientY;
    });
    function up(e) {
      if (e.pointerId !== dragId) return;
      dragId = null;
      // tap = manual fire
      if (dragMoved < 14 && performance.now() - dragT < 350) fire();
    }
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', function () { dragId = null; });
    $('btn-reload').addEventListener('click', function () { startReload(); });
    $('btn-nova').addEventListener('click', function () { nova(); });
  }

  /* ================= flow ================= */
  function showScreen(id) {
    ['screen-title', 'screen-game', 'screen-over'].forEach(function (s) {
      $(s).classList.toggle('hidden', s !== id);
    });
  }
  function rankFor(score) {
    if (score >= 9000) return 'S';
    if (score >= 6500) return 'A';
    if (score >= 4000) return 'B';
    return 'C';
  }
  function gameOver(win) {
    if (G.over) return;
    G.over = true; G.win = win;
    var acc = G.shots ? Math.round(100 * G.hits / G.shots) : 0;
    if (win) G.score += Math.round(G.hp * 10) + acc * 5;   // survivor bonus
    var rank = rankFor(G.score);
    setTimeout(function () {
      state = 'over';
      $('over-title').textContent = win ? 'CORRIDOR CLEARED' : 'YOU DIED';
      $('over-rank').textContent = rank;
      $('over-rank').className = 'rank r' + rank;
      $('over-score').textContent = G.score;
      $('over-stats').textContent = G.kills + ' kills · ' + acc + '% accuracy · ×' + G.maxCombo + ' best combo';
      var best = 0;
      try {
        best = parseInt(localStorage.getItem('dc_best') || '0', 10);
        if (G.score > best) { best = G.score; localStorage.setItem('dc_best', String(best)); }
      } catch (e) {}
      $('over-best').textContent = best;
      showScreen('screen-over');
      submitScore(G.score);
      DCSfx.gameover(win);
    }, win ? 1200 : 900);
  }

  function submitScore(score) {
    try {
      var name = localStorage.getItem('arcade_name') || 'PLAYER';
      fetch('https://gamez-arcade.chaoticutopia84.workers.dev/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: 'dead-corridor', name: name, score: score })
      }).catch(function () {});
    } catch (e) {}
  }

  function startRide(dailySeed) {
    A.reg();
    buildLights();
    G = newRun(dailySeed);
    state = 'ride';
    showScreen('screen-game');
    updateHUD();
    banner('FIND THE HEART. KILL EVERYTHING.');
    DCSfx.start();
  }

  /* ================= main loop ================= */
  var last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!last) last = ts;
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (state === 'ride' && G && !document.hidden) {
      update(dt);
      render();
      updateHUD();
    }
  }

  /* ================= boot ================= */
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = window.innerWidth; ch = window.innerHeight;
    canvas.width = cw * dpr; canvas.height = ch * dpr;
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function boot() {
    canvas = $('game');
    ctx = canvas.getContext('2d');
    buildMap();
    A.reg();
    E.init(270, 480);
    resize();
    window.addEventListener('resize', resize);
    bindInput();
    $('btn-play').addEventListener('click', function () { DCSfx.init(); startRide(null); });
    $('btn-daily').addEventListener('click', function () {
      DCSfx.init();
      var d = new Date();
      var seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
      startRide(seed);
    });
    $('btn-again').addEventListener('click', function () { startRide(G && G.daily ? 1 : null); });
    $('btn-title').addEventListener('click', function () { state = 'title'; showScreen('screen-title'); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state === 'ride') banner('PAUSED');
    });
    // title best
    try { $('title-best').textContent = localStorage.getItem('dc_best') || '0'; } catch (e) {}
    requestAnimationFrame(loop);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // debug hook
  window.DC = { get state() { return state; }, get G() { return G; }, startRide: startRide };
})();
