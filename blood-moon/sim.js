/* Blood Moon — sim.js
 * Pure simulation: no DOM, no canvas, no Audio. Deterministic given a seed.
 * Fixed timestep (1/60) driven by the caller; render interpolates.
 * Emits events[] each step for renderer/audio to consume. */
(function (root) {
  'use strict';

  var TAU = Math.PI * 2;

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  var WORLD = 2200;
  var NIGHT_LEN = 300;   // 5-minute nights
  var DAWN_LEN = 30;
  var MAX_ENEMIES = 130;

  function xpForLevel(lv) { return Math.floor(6 * Math.pow(1.27, lv - 1)) + lv * 2; }

  function makeSim(seed, opts) {
    opts = opts || {};
    var C = root.BloodMoonContent;
    var rng = mulberry32(seed >>> 0 || 1);
    var night = opts.night || 1;
    var mods = opts.mods || {};

    var sim = {
      rng: rng, night: night, time: 0, state: 'night',
      nightT: NIGHT_LEN, dawnT: 0, bell: 0,
      player: null, enemies: [], allies: [], bolts: [], orbs: [],
      shadows: [], coffin: null, sunBands: [],
      events: [], pendingLevels: 0,
      kills: 0, blood: 0, level: 1,
      spawnT: 1.5, bossSpawned: false, bossRef: null,
      enemyId: 1,
      over: false
    };

    // --- shadow patches (safe from sunlight) + coffin ---
    for (var i = 0; i < 14; i++) {
      var w = 90 + rng() * 90, h = 70 + rng() * 80;
      sim.shadows.push({
        x: 120 + rng() * (WORLD - 240 - w),
        y: 120 + rng() * (WORLD - 240 - h),
        w: w, h: h
      });
    }
    sim.coffin = { x: WORLD / 2, y: WORLD / 2 + 60, r: 70 };

    // --- player ---
    var hpMul = (mods.hpMul || 1), dmgMul = (mods.dmgMul || 1),
        spdMul = (mods.speedMul || 1), xpMul = (mods.xpMul || 1);
    var P = sim.player = {
      x: WORLD / 2, y: WORLD / 2, vx: 0, vy: 0, r: 16,
      maxHp: 100 * hpMul, hp: 100 * hpMul,
      speed: 235 * spdMul,
      level: 1, xp: 0, xpNext: xpForLevel(1),
      biteDmg: 16 * dmgMul, biteRange: 88, biteCd: 0, biteRate: 0.5,
      armor: 0, regen: 0.6, pickupR: 95, xpMul: xpMul,
      dashCd: 0, dashMax: 4 * (mods.dashCdMul || 1), invuln: 0,
      upg: {},
      bats: 0, batAng: 0,
      auraDps: 0, auraR: 0,
      whipDmg: 0, whipR: 130, whipCd: 0, whipRate: 2.4,
      novaDmg: 0, novaR: 0, novaCd: 8,
      charm: 0, facing: 0
    };
    if (opts.carry) {
      var c = opts.carry, cu = c.upg || {}, k, s;
      P.upg = {};
      for (k in cu) for (s = 0; s < cu[k]; s++) applyUpgrade(sim, k, true);
      P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.35);
      P.level = c.level || 1; P.xp = 0; P.xpNext = xpForLevel(P.level);
      sim.level = P.level;
    }

    sim.hpMul = 1 + (night - 1) * 0.45;
    sim.dmgMul = 1 + (night - 1) * 0.16;

    function ev(t, o) { o = o || {}; o.t = t; sim.events.push(o); }

    function inShadow(x, y) {
      if (dist2(x, y, sim.coffin.x, sim.coffin.y) < sim.coffin.r * sim.coffin.r) return true;
      for (var i = 0; i < sim.shadows.length; i++) {
        var s = sim.shadows[i];
        if (x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h) return true;
      }
      return false;
    }

    function spawnEnemy(type, x, y, foe) {
      var d = C.ENEMIES[type];
      var tMul = 1 + (sim.time / NIGHT_LEN) * 0.9;
      var e = {
        id: sim.enemyId++, type: type, foe: foe !== false,
        x: x, y: y, vx: 0, vy: 0, r: d.r,
        maxHp: d.hp * sim.hpMul * tMul, hp: d.hp * sim.hpMul * tMul,
        speed: d.speed * (0.9 + rng() * 0.2),
        dmg: d.dmg * sim.dmgMul,
        state: 'chase', t: 0, cd: rng() * 0.8, atkCd: 0, batCd: 0,
        tx: x, ty: y, name: null, dead: false
      };
      if (type === 'villager' || type === 'torch') {
        e.name = C.VILLAGER_NAMES[(rng() * C.VILLAGER_NAMES.length) | 0];
        if (rng() < 0.25) ev('taunt', { x: x, y: y, text: C.SPAWN_QUOTES[(rng() * C.SPAWN_QUOTES.length) | 0] });
      }
      (foe === false ? sim.allies : sim.enemies).push(e);
      return e;
    }

    function spawnPos() {
      var a = rng() * TAU, r = 720 + rng() * 220;
      return {
        x: clamp(P.x + Math.cos(a) * r, 40, WORLD - 40),
        y: clamp(P.y + Math.sin(a) * r, 40, WORLD - 40)
      };
    }

    function pickType() {
      var t = sim.time, pool = [['villager', 10]];
      if (t >= C.UNLOCK_AT.torch) pool.push(['torch', 7]);
      if (t >= C.UNLOCK_AT.priest) pool.push(['priest', 4]);
      if (t >= C.UNLOCK_AT.hunter) pool.push(['hunter', 4]);
      var tot = 0, i;
      for (i = 0; i < pool.length; i++) tot += pool[i][1];
      var roll = rng() * tot;
      for (i = 0; i < pool.length; i++) { roll -= pool[i][1]; if (roll <= 0) return pool[i][0]; }
      return 'villager';
    }

    function damageEnemy(e, dmg, kx, ky) {
      if (e.dead) return;
      e.hp -= dmg;
      ev('hit', { x: e.x, y: e.y, dmg: Math.round(dmg) });
      if (kx) { e.vx += kx; e.vy += ky; }
      if (e.hp <= 0) killEnemy(e);
    }

    function killEnemy(e) {
      if (e.dead) return;
      e.dead = true;
      var d = C.ENEMIES[e.type];
      sim.kills++;
      ev('kill', { x: e.x, y: e.y, big: e.type === 'vanhelsing' });
      // blood orbs
      var n = e.type === 'vanhelsing' ? 12 : (d.xp >= 4 ? 2 : 1);
      for (var i = 0; i < n; i++) {
        var a = rng() * TAU;
        sim.orbs.push({
          x: e.x, y: e.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120,
          val: d.xp / n, t: 0
        });
      }
      // charm: convert a villager to fight for you
      if (P.charm > 0 && e.foe && (e.type === 'villager' || e.type === 'torch') && rng() < 0.09 * P.charm) {
        var a2 = spawnEnemy(e.type, e.x, e.y, false);
        a2.maxHp = a2.hp = 60 * sim.hpMul; a2.dmg *= 1.5;
        ev('charm', { x: e.x, y: e.y });
        ev('taunt', { x: e.x, y: e.y - 20, text: 'For the Count!' });
      }
      if (e.type === 'vanhelsing') ev('taunt', { x: e.x, y: e.y - 30, text: 'Impossible…' });
    }

    function hurtPlayer(dmg) {
      var P = sim.player;
      if (P.invuln > 0 || sim.state === 'won' || sim.over) return;
      dmg = Math.max(1, dmg - P.armor);
      P.hp -= dmg;
      ev('hurt', { dmg: Math.round(dmg) });
      if (P.hp <= 0) { P.hp = 0; sim.state = 'dead'; sim.over = true; ev('dead'); }
    }

    function addXp(v) {
      var P = sim.player;
      P.xp += v * P.xpMul;
      sim.blood += v;
      while (P.xp >= P.xpNext) {
        P.xp -= P.xpNext;
        P.level++; sim.level = P.level;
        P.xpNext = xpForLevel(P.level);
        sim.pendingLevels++;
        ev('levelup', { level: P.level });
      }
    }

    function offerUpgrades() {
      var pool = [];
      for (var i = 0; i < C.UPGRADES.length; i++) {
        var u = C.UPGRADES[i];
        if ((sim.player.upg[u.id] || 0) < u.max) pool.push(u);
      }
      var out = [];
      while (out.length < 3 && pool.length) {
        out.push(pool.splice((rng() * pool.length) | 0, 1)[0]);
      }
      while (out.length < 3) out.push({ id: '__feast', name: 'Midnight Feast', max: 99, desc: 'Devour everything: heal 40 HP now.', flavor: 'Seconds, please.' });
      return out;
    }

    function applyUpgrade(s, id, silent) {
      var P = s.player;
      if (id === '__feast') { P.hp = Math.min(P.maxHp, P.hp + 40); return; }
      P.upg[id] = (P.upg[id] || 0) + 1;
      var st = P.upg[id];
      switch (id) {
        case 'fangs': P.biteDmg *= 1.35; break;
        case 'bats': P.bats += 2; break;
        case 'whip':
          if (st === 1) P.whipDmg = 20; else P.whipDmg *= 1.3;
          P.whipRate *= 0.92; break;
        case 'aura':
          if (st === 1) { P.auraDps = 11; P.auraR = 115; }
          else { P.auraDps *= 1.35; P.auraR += 12; } break;
        case 'nova':
          if (st === 1) { P.novaDmg = 70; P.novaR = 250; }
          else { P.novaDmg *= 1.4; P.novaR += 25; } break;
        case 'dash': P.dashMax = Math.max(1.6, P.dashMax * 0.85); break;
        case 'wings': P.speed *= 1.12; break;
        case 'gut': P.maxHp *= 1.25; P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.25); break;
        case 'nap': P.regen += 1.4; break;
        case 'nose': P.pickupR *= 1.4; break;
        case 'cloak': P.armor += 2; break;
        case 'charm': P.charm += 1; break;
      }
      if (!silent) ev('upgrade', { id: id, stacks: st });
    }

    /* ---------- spatial hash (enemy separation + queries) ---------- */
    var grid = new Map();
    function rebuildGrid() {
      grid.clear();
      var all = sim.enemies;
      for (var i = 0; i < all.length; i++) {
        var e = all[i];
        if (e.dead) continue;
        var k = ((e.x / 64) | 0) + ':' + ((e.y / 64) | 0);
        var arr = grid.get(k);
        if (!arr) { arr = []; grid.set(k, arr); }
        arr.push(e);
      }
    }
    function forNear(x, y, r, fn) {
      var x0 = ((x - r) / 64) | 0, x1 = ((x + r) / 64) | 0;
      var y0 = ((y - r) / 64) | 0, y1 = ((y + r) / 64) | 0;
      for (var cx = x0; cx <= x1; cx++) for (var cy = y0; cy <= y1; cy++) {
        var arr = grid.get(cx + ':' + cy);
        if (arr) for (var i = 0; i < arr.length; i++) fn(arr[i]);
      }
    }

    function nearestFoe(x, y, maxD) {
      var best = null, bd = maxD * maxD;
      for (var i = 0; i < sim.enemies.length; i++) {
        var e = sim.enemies[i];
        if (e.dead) continue;
        var d = dist2(x, y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    /* ================= STEP ================= */
    function step(dt, input) {
      input = input || {};
      var P = sim.player;
      if (sim.over) return;

      /* ----- night clock ----- */
      if (sim.state === 'night') {
        sim.time += dt;
        sim.nightT -= dt;
        var minute = 1 + ((NIGHT_LEN - sim.nightT) / 60 | 0);
        if (minute !== sim.bell && sim.nightT > 0) {
          sim.bell = minute;
          ev('bell', { n: minute });
        }
        if (sim.nightT <= 0) {
          sim.state = 'dawn'; sim.dawnT = DAWN_LEN;
          ev('dawn');
          ev('taunt', { x: P.x, y: P.y - 30, text: C.DAWN_LINES[(rng() * C.DAWN_LINES.length) | 0] });
        }
      } else if (sim.state === 'dawn') {
        sim.time += dt;
        sim.dawnT -= dt;
        // sweeping sunlight bands
        sim.sunBands.length = 0;
        for (var b = 0; b < 3; b++) {
          var cx = ((1 - sim.dawnT / DAWN_LEN) * (WORLD + 900) + b * 800) % (WORLD + 900) - 450;
          sim.sunBands.push(cx);
        }
        if (!inShadow(P.x, P.y)) hurtPlayer(16 * sim.dmgMul * dt * 10 * 0.1 + 14 * dt);
        if (sim.dawnT <= 0) {
          sim.state = 'won'; sim.over = true;
          ev('won');
        }
      }

      /* ----- player movement ----- */
      var mx = input.mx || 0, my = input.my || 0;
      var ml = Math.hypot(mx, my);
      if (ml > 1) { mx /= ml; my /= ml; }
      var dashing = false;
      if (input.dash && P.dashCd <= 0 && P.upg.dash) {
        P.dashCd = P.dashMax; P.invuln = Math.max(P.invuln, 0.35);
        var da = ml > 0.1 ? Math.atan2(my, mx) : P.facing;
        P.vx = Math.cos(da) * 900; P.vy = Math.sin(da) * 900;
        dashing = true;
        ev('dash', { x: P.x, y: P.y });
      }
      if (!dashing) {
        var acc = 12;
        P.vx += (mx * P.speed - P.vx) * Math.min(1, dt * acc);
        P.vy += (my * P.speed - P.vy) * Math.min(1, dt * acc);
      }
      P.x = clamp(P.x + P.vx * dt, 24, WORLD - 24);
      P.y = clamp(P.y + P.vy * dt, 24, WORLD - 24);
      if (ml > 0.1) P.facing = Math.atan2(my, mx);
      if (P.dashCd > 0) P.dashCd -= dt;
      if (P.invuln > 0) P.invuln -= dt;
      if (P.biteCd > 0) P.biteCd -= dt;
      if (P.regen > 0 && P.hp < P.maxHp) P.hp = Math.min(P.maxHp, P.hp + P.regen * dt);

      /* ----- bite (auto-attack) ----- */
      if (P.biteCd <= 0) {
        var tgt = nearestFoe(P.x, P.y, P.biteRange);
        if (tgt) {
          P.biteCd = P.biteRate;
          P.facing = Math.atan2(tgt.y - P.y, tgt.x - P.x);
          var crit = rng() < 0.12;
          var kb = 130;
          damageEnemy(tgt, P.biteDmg * (crit ? 2 : 1),
            Math.cos(P.facing) * kb, Math.sin(P.facing) * kb);
          ev('bite', { x: P.x, y: P.y, ang: P.facing, crit: crit });
          // the bite chains: blood sprays to one nearby foe
          var chained = null, cbd = 80 * 80;
          for (var ci = 0; ci < sim.enemies.length; ci++) {
            var ce = sim.enemies[ci];
            if (ce === tgt || ce.dead) continue;
            var cd2 = dist2(tgt.x, tgt.y, ce.x, ce.y);
            if (cd2 < cbd) { cbd = cd2; chained = ce; }
          }
          if (chained) {
            damageEnemy(chained, P.biteDmg * 0.6, 0, 0);
            ev('chain', { x1: tgt.x, y1: tgt.y, x2: chained.x, y2: chained.y });
          }
        }
      }

      /* ----- bats ----- */
      if (P.bats > 0) {
        P.batAng += dt * 3.4;
        for (var bi = 0; bi < P.bats; bi++) {
          var ba = P.batAng + (bi / P.bats) * TAU;
          var bx = P.x + Math.cos(ba) * 52, by = P.y + Math.sin(ba) * 52;
          forNear(bx, by, 30, function (e) {
            if (e.batCd <= 0 && dist2(bx, by, e.x, e.y) < 30 * 30) {
              e.batCd = 0.4;
              damageEnemy(e, P.biteDmg * 0.5, (e.x - P.x) * 2, (e.y - P.y) * 2);
            }
          });
        }
      }

      /* ----- blood whip ----- */
      if (P.whipDmg > 0) {
        P.whipCd -= dt;
        if (P.whipCd <= 0) {
          var wt = nearestFoe(P.x, P.y, 400);
          if (wt) {
            P.whipCd = P.whipRate;
            var wa = Math.atan2(wt.y - P.y, wt.x - P.x);
            P.facing = wa;
            ev('whip', { x: P.x, y: P.y, ang: wa });
            forNear(P.x, P.y, P.whipR + 20, function (e) {
              var d2 = dist2(P.x, P.y, e.x, e.y);
              if (d2 > P.whipR * P.whipR) return;
              var ea = Math.atan2(e.y - P.y, e.x - P.x), dd = wa - ea;
              while (dd > Math.PI) dd -= TAU; while (dd < -Math.PI) dd += TAU;
              if (Math.abs(dd) < 1.05) {
                damageEnemy(e, P.whipDmg,
                  Math.cos(ea) * 260, Math.sin(ea) * 260);
              }
            });
          } else P.whipCd = 0.2;
        }
      }

      /* ----- crimson aura ----- */
      if (P.auraDps > 0) {
        forNear(P.x, P.y, P.auraR, function (e) {
          if (dist2(P.x, P.y, e.x, e.y) < P.auraR * P.auraR)
            damageEnemy(e, P.auraDps * dt, 0, 0);
        });
      }

      /* ----- blood moon nova ----- */
      if (P.novaDmg > 0) {
        P.novaCd -= dt;
        if (P.novaCd <= 0) {
          P.novaCd = 24;
          ev('nova', { x: P.x, y: P.y, r: P.novaR });
          for (var ni = 0; ni < sim.enemies.length; ni++) {
            var ne = sim.enemies[ni];
            if (!ne.dead && dist2(P.x, P.y, ne.x, ne.y) < P.novaR * P.novaR)
              damageEnemy(ne, P.novaDmg, (ne.x - P.x) * 3, (ne.y - P.y) * 3);
          }
        }
      }

      /* ----- spawn director ----- */
      if (sim.state === 'night') {
        sim.spawnT -= dt;
        var alive = 0, i;
        for (i = 0; i < sim.enemies.length; i++) if (!sim.enemies[i].dead) alive++;
        if (sim.spawnT <= 0 && alive < MAX_ENEMIES) {
          var interval = clamp(2.3 - sim.time * 0.006 - night * 0.12, 0.45, 2.3);
          sim.spawnT = interval;
          var batch = 1 + ((sim.time / 55) | 0) + ((night / 2) | 0);
          for (var s = 0; s < batch; s++) {
            var sp = spawnPos();
            spawnEnemy(pickType(), sp.x, sp.y);
          }
        }
        // Van Helsing arrives one minute before dawn
        if (!sim.bossSpawned && sim.time >= C.UNLOCK_AT.vanhelsing) {
          sim.bossSpawned = true;
          var bp = spawnPos();
          var boss = spawnEnemy('vanhelsing', bp.x, bp.y);
          sim.bossRef = boss;
          ev('boss');
          ev('taunt', { x: bp.x, y: bp.y - 40, text: C.HELSING_LINES[(rng() * C.HELSING_LINES.length) | 0] });
        }
      }

      /* ----- enemies ----- */
      rebuildGrid();
      for (var ei = sim.enemies.length - 1; ei >= 0; ei--) {
        var e = sim.enemies[ei];
        if (e.dead) { sim.enemies.splice(ei, 1); continue; }
        stepEnemy(e, dt, true);
      }
      for (var ai = sim.allies.length - 1; ai >= 0; ai--) {
        var a = sim.allies[ai];
        if (a.dead) { sim.allies.splice(ai, 1); continue; }
        stepEnemy(a, dt, false);
      }

      /* ----- enemy separation (cheap, grid-based) ----- */
      for (var si = 0; si < sim.enemies.length; si++) {
        var s1 = sim.enemies[si];
        forNear(s1.x, s1.y, 30, function (s2) {
          if (s2 === s1 || s2.dead) return;
          var dx = s1.x - s2.x, dy = s1.y - s2.y;
          var d2 = dx * dx + dy * dy, rr = s1.r + s2.r;
          if (d2 > 0.01 && d2 < rr * rr) {
            var d = Math.sqrt(d2), push = (rr - d) * 0.5;
            dx /= d; dy /= d;
            s1.x += dx * push * 0.5; s1.y += dy * push * 0.5;
          }
        });
      }

      /* ----- bolts ----- */
      for (var bi2 = sim.bolts.length - 1; bi2 >= 0; bi2--) {
        var bo = sim.bolts[bi2];
        bo.x += bo.vx * dt; bo.y += bo.vy * dt; bo.t -= dt;
        if (bo.t <= 0 || bo.x < 0 || bo.x > WORLD || bo.y < 0 || bo.y > WORLD) {
          sim.bolts.splice(bi2, 1); continue;
        }
        if (bo.foe && dist2(bo.x, bo.y, P.x, P.y) < (bo.r + P.r) * (bo.r + P.r)) {
          hurtPlayer(bo.dmg);
          sim.bolts.splice(bi2, 1);
        } else if (!bo.foe) {
          var hit = false;
          forNear(bo.x, bo.y, 40, function (en) {
            if (!hit && dist2(bo.x, bo.y, en.x, en.y) < (bo.r + en.r) * (bo.r + en.r)) {
              damageEnemy(en, bo.dmg, bo.vx * 0.2, bo.vy * 0.2);
              hit = true;
            }
          });
          if (hit) sim.bolts.splice(bi2, 1);
        }
      }

      /* ----- orbs ----- */
      for (var oi = sim.orbs.length - 1; oi >= 0; oi--) {
        var o = sim.orbs[oi];
        o.t += dt;
        var dxo = P.x - o.x, dyo = P.y - o.y;
        var do2 = dxo * dxo + dyo * dyo;
        if (do2 < P.pickupR * P.pickupR || o.t > 0.6) {
          var dd = Math.sqrt(do2) || 1;
          var pull = do2 < P.pickupR * P.pickupR ? 900 : 120;
          o.vx += (dxo / dd) * pull * dt * 4;
          o.vy += (dyo / dd) * pull * dt * 4;
        } else {
          o.vx *= (1 - dt * 3); o.vy *= (1 - dt * 3);
        }
        o.x += o.vx * dt; o.y += o.vy * dt;
        if (do2 < 26 * 26) {
          addXp(o.val);
          ev('pickup', { x: o.x, y: o.y });
          sim.orbs.splice(oi, 1);
        }
      }

      if (P.batCdFix !== true) {
        for (var fi = 0; fi < sim.enemies.length; fi++) {
          var fe = sim.enemies[fi];
          if (fe.batCd > 0) fe.batCd -= dt;
          if (fe.atkCd > 0) fe.atkCd -= dt;
        }
      }
    }

    function stepEnemy(e, dt, isFoe) {
      var P = sim.player;
      var d = C.ENEMIES[e.type];
      e.t += dt;

      var tx, ty;
      if (isFoe) { tx = P.x; ty = P.y; }
      else {
        var f = nearestFoe(e.x, e.y, 700);
        if (f) { tx = f.x; ty = f.y; } else { tx = P.x; ty = P.y; }
      }
      var dx = tx - e.x, dy = ty - e.y;
      var dist = Math.hypot(dx, dy) || 1;
      dx /= dist; dy /= dist;

      if (e.type === 'priest' && isFoe) {
        if (e.state === 'chase') {
          if (dist < d.keepDist) { e.state = 'cast'; e.t = 0; ev('priestcast', { x: tx, y: ty, r: d.novaR }); }
          else moveToward(e, dx, dy, dt);
        } else if (e.state === 'cast') {
          if (e.t >= d.castTime) {
            e.state = 'chase'; e.t = 0;
            ev('novahit', { x: tx, y: ty, r: d.novaR });
            if (dist2(tx, ty, P.x, P.y) < d.novaR * d.novaR) hurtPlayer(d.novaDmg * sim.dmgMul);
          }
        }
      } else if (e.type === 'hunter' && isFoe) {
        e.cd -= dt;
        if (dist > d.keepDist + 60) moveToward(e, dx, dy, dt);
        else if (dist < d.keepDist - 60) moveToward(e, -dx, -dy, dt);
        else { // strafe
          var sa = Math.atan2(dy, dx) + Math.PI / 2;
          e.vx += (Math.cos(sa) * e.speed * 0.6 - e.vx) * Math.min(1, dt * 6);
          e.vy += (Math.sin(sa) * e.speed * 0.6 - e.vy) * Math.min(1, dt * 6);
        }
        if (e.cd <= 0 && dist < 560) {
          e.cd = d.shotCd;
          var a2 = Math.atan2(P.y - e.y, P.x - e.x);
          sim.bolts.push({ x: e.x, y: e.y, vx: Math.cos(a2) * d.boltSpeed, vy: Math.sin(a2) * d.boltSpeed, r: 6, dmg: d.boltDmg * sim.dmgMul, foe: true, t: 3 });
          ev('shoot', { x: e.x, y: e.y });
        }
        e.x += e.vx * dt; e.y += e.vy * dt;
      } else if (e.type === 'vanhelsing' && isFoe) {
        var enraged = e.hp < e.maxHp * 0.4;
        e.cd -= dt; e.atkCd -= dt;
        moveToward(e, dx, dy, dt * (enraged ? 1.35 : 1));
        if (e.cd <= 0 && dist < 640) {
          e.cd = d.shotCd * (enraged ? 0.6 : 1);
          for (var k = -1; k <= 1; k++) {
            var a3 = Math.atan2(P.y - e.y, P.x - e.x) + k * 0.14;
            sim.bolts.push({ x: e.x, y: e.y, vx: Math.cos(a3) * d.stakeSpeed, vy: Math.sin(a3) * d.stakeSpeed, r: 7, dmg: d.stakeDmg * sim.dmgMul, foe: true, t: 3 });
          }
          ev('shoot', { x: e.x, y: e.y });
          if (rng() < 0.4) ev('taunt', { x: e.x, y: e.y - 40, text: C.HELSING_LINES[(rng() * C.HELSING_LINES.length) | 0] });
        }
        if (e.atkCd <= 0) {
          e.atkCd = d.summonCd;
          for (var s2 = 0; s2 < 4; s2++) {
            var a4 = rng() * TAU;
            spawnEnemy(rng() < 0.7 ? 'villager' : 'torch', e.x + Math.cos(a4) * 90, e.y + Math.sin(a4) * 90);
          }
          ev('summon', { x: e.x, y: e.y });
        }
        e.x = clamp(e.x + e.vx * dt, 24, WORLD - 24);
        e.y = clamp(e.y + e.vy * dt, 24, WORLD - 24);
      } else {
        // melee chaser (villager, torch, allies)
        moveToward(e, dx, dy, dt);
        e.x = clamp(e.x + e.vx * dt, 24, WORLD - 24);
        e.y = clamp(e.y + e.vy * dt, 24, WORLD - 24);
        if (isFoe) {
          if (dist < e.r + P.r + 6 && e.atkCd <= 0) {
            e.atkCd = 0.85;
            hurtPlayer(e.dmg);
            ev('melee', { x: e.x, y: e.y });
          }
        } else {
          // ally attacks foes
          var f2 = nearestFoe(e.x, e.y, e.r + 40);
          if (f2 && e.atkCd <= 0) {
            e.atkCd = 0.9;
            damageEnemy(f2, e.dmg, (f2.x - e.x) * 3, (f2.y - e.y) * 3);
            ev('melee', { x: e.x, y: e.y });
          }
        }
      }

      function moveToward(en, ddx, ddy, dtt) {
        en.vx += (ddx * en.speed - en.vx) * Math.min(1, dtt * 5);
        en.vy += (ddy * en.speed - en.vy) * Math.min(1, dtt * 5);
      }
    }

    function score() {
      return sim.kills * 10 + (night - 1) * 1000 + sim.level * 25;
    }

    return {
      sim: sim,
      step: step,
      offerUpgrades: offerUpgrades,
      applyUpgrade: function (id) { applyUpgrade(sim, id); },
      hurtPlayer: hurtPlayer,
      spawnEnemy: spawnEnemy,
      inShadow: inShadow,
      score: score,
      WORLD: WORLD, NIGHT_LEN: NIGHT_LEN, DAWN_LEN: DAWN_LEN
    };
  }

  root.BloodMoonSim = { makeSim: makeSim, WORLD: WORLD, NIGHT_LEN: NIGHT_LEN, DAWN_LEN: DAWN_LEN };
})(typeof window !== 'undefined' ? window : global);
