/*
 * Neon Depths — render.js
 * Canvas renderer: pre-rendered static playfield (neon line art), dynamic
 * layer for ball/toys/particles/inserts, DOM-free HUD data via snapshot.
 * Logical 400x800, DPR capped at 2. No per-frame shadowBlur or fillText.
 */
'use strict';

const W = 400, H = 800;
const DEG = Math.PI / 180;

// depth zones: [maxM, topColor, botColor, creature]
const ZONES = [
  [1000, '#06283d', '#03121e', 'sunfish'],
  [3000, '#041a2c', '#020a14', 'jelly'],
  [6000, '#020d18', '#01040a', 'squid'],
  [9000, '#010710', '#000204', 'angler'],
  [11001, '#000307', '#000000', 'kraken'],
];
const LIT_COLORS = {
  mode: '#7dffb0', jackpot: '#ffd23c', lock: '#ff5b5b', wizard: '#ff4ce0',
  hurry: '#ff9a3c', mega: '#ffffff', eb: '#ffffff',
};

function createRenderer(canvas, T, R) {
  const sim = T.sim;
  const ctx = canvas.getContext('2d');
  const r = {
    trauma: 0, time: 0,
    particles: [],
    trails: new Map(), // ballId -> [{x,y}]
    plungerCharge: 0,
    zoneIdx: -1, bgGrad: null,
    staticC: null,
    glowSprites: {},
  };
  for (let i = 0; i < 220; i++) r.particles.push({ life: 0, x: 0, y: 0, vx: 0, vy: 0, color: '#fff', size: 2 });

  // ---------- glow sprites (cached radial gradients) ----------
  function glowSprite(color) {
    if (r.glowSprites[color]) return r.glowSprites[color];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.25, color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    r.glowSprites[color] = c;
    return c;
  }
  function glow(x, y, size, color, alpha) {
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.drawImage(glowSprite(color), x - size / 2, y - size / 2, size, size);
    ctx.globalAlpha = 1;
  }

  // ---------- sizing ----------
  r.resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / W, rect.height / H) || 1;
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
    r.viewScale = (canvas.width / W);
    r.dpr = dpr;
    buildStatic(dpr);
  };

  // ---------- static playfield art (shadowBlur OK here: one-time) ----------
  function neonLine(g, pts, color, width, close) {
    g.strokeStyle = color; g.lineWidth = width;
    g.shadowColor = color; g.shadowBlur = 12;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    if (close) g.closePath();
    g.stroke();
    g.shadowBlur = 0;
    // bright core
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = Math.max(1, width * 0.35);
    g.stroke();
  }
  function arcPts(cx, cy, rx, ry, a0, a1, step) {
    const p = [];
    for (let a = a0; a <= a1; a += step) p.push([cx + rx * Math.cos(a * DEG), cy + ry * Math.sin(a * DEG)]);
    return p;
  }

  function buildStatic(dpr) {
    const c = document.createElement('canvas');
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const rail = '#1d6f8e', dim = '#14506a';

    // outer arch + walls
    neonLine(g, arcPts(200, 120, 184, 96, 180, 360, 6), rail, 5);
    neonLine(g, [[16, 120], [16, 640]], rail, 5);
    neonLine(g, [[384, 120], [384, 706]], rail, 5);
    // plunger lane
    neonLine(g, [[356, 110], [356, 700], [384, 700]], dim, 4);
    neonLine(g, [[356, 110], [322, 84]], dim, 4);
    // inner orbit guides
    neonLine(g, [[60, 560], [60, 220]], dim, 4);
    neonLine(g, [[340, 560], [340, 220]], dim, 4);
    neonLine(g, arcPts(200, 220, 140, 140, 180, 360, 8), dim, 4);
    // midfield funnels
    neonLine(g, [[60, 380], [88, 520]], dim, 4);
    neonLine(g, [[340, 380], [312, 520]], dim, 4);
    // return curves + feeds + outlane chutes
    neonLine(g, [[16, 640], [44, 672]], rail, 5);
    neonLine(g, [[66, 682], [132, 658]], rail, 5);
    neonLine(g, [[44, 672], [44, 732]], dim, 4);
    neonLine(g, [[66, 682], [66, 732]], dim, 4);
    neonLine(g, [[356, 640], [328, 672]], rail, 5);
    neonLine(g, [[306, 682], [268, 658]], rail, 5);
    neonLine(g, [[328, 672], [328, 732]], dim, 4);
    neonLine(g, [[306, 682], [306, 732]], dim, 4);
    // trench lanes
    neonLine(g, [[120, 400], [120, 540]], '#2a9d8f', 3);
    neonLine(g, [[150, 400], [150, 540]], '#2a9d8f', 3);
    neonLine(g, [[250, 400], [250, 540]], '#2a9d8f', 3);
    neonLine(g, [[280, 400], [280, 540]], '#2a9d8f', 3);
    // sling back walls
    neonLine(g, [[88, 520], [88, 560]], dim, 3);
    neonLine(g, [[312, 520], [312, 560]], dim, 3);

    // ramps (elevated wireforms, drawn as glowing tubes along carry paths)
    const ramps = [
      { from: [85, 390], ctrl: [85, 180], to: [330, 600], color: '#39d97e' },
      { from: [200, 370], ctrl: [200, 160], to: [110, 620], color: '#ff9a3c' },
      { from: [315, 390], ctrl: [315, 170], to: [200, 130], color: '#ff4ce0' },
    ];
    for (const rp of ramps) {
      g.strokeStyle = rp.color; g.lineWidth = 9; g.globalAlpha = 0.5;
      g.shadowColor = rp.color; g.shadowBlur = 14;
      g.beginPath(); g.moveTo(rp.from[0], rp.from[1]);
      g.quadraticCurveTo(rp.ctrl[0], rp.ctrl[1], rp.to[0], rp.to[1]); g.stroke();
      g.shadowBlur = 0; g.globalAlpha = 1;
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(rp.from[0], rp.from[1]);
      g.quadraticCurveTo(rp.ctrl[0], rp.ctrl[1], rp.to[0], rp.to[1]); g.stroke();
    }

    // kraken maw surround (tentacle bases)
    g.strokeStyle = '#7a2b8e'; g.lineWidth = 10; g.shadowColor = '#b44ce0'; g.shadowBlur = 16;
    for (let i = 0; i < 5; i++) {
      const a = (200 + i * 35) * DEG;
      g.beginPath();
      g.moveTo(315 + 34 * Math.cos(a), 390 + 30 * Math.sin(a));
      g.quadraticCurveTo(315 + 62 * Math.cos(a - 0.3), 390 + 58 * Math.sin(a - 0.3),
        315 + 78 * Math.cos(a - 0.55), 390 + 74 * Math.sin(a - 0.55));
      g.stroke();
    }
    g.shadowBlur = 0;

    // dive bell (scoop)
    g.strokeStyle = '#4ce0e0'; g.lineWidth = 3; g.shadowColor = '#4ce0e0'; g.shadowBlur = 10;
    g.beginPath(); g.arc(200, 455, 18, Math.PI, 0); g.stroke();
    g.beginPath(); g.moveTo(182, 455); g.lineTo(182, 468); g.moveTo(218, 455); g.lineTo(218, 468); g.stroke();
    g.shadowBlur = 0;

    // whale-fall (saucer): rib arcs
    g.strokeStyle = '#8fa8bf'; g.lineWidth = 2.5; g.shadowColor = '#8fa8bf'; g.shadowBlur = 8;
    for (let i = 0; i < 3; i++) {
      g.beginPath(); g.arc(100, 200, 10 + i * 5, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    }
    g.shadowBlur = 0;

    // zone labels (dim)
    g.fillStyle = 'rgba(120,200,230,0.35)';
    g.font = '11px system-ui'; g.textAlign = 'center';
    g.fillText('KELP', 85, 372);
    g.fillText('VENT', 200, 352);
    g.fillText('MAW', 315, 372);
    g.fillText('TRENCH', 200, 392);
    g.fillText('DIVE BELL', 200, 492);
    g.fillText('WHALE-FALL', 100, 232);
    r.staticC = c;
  }

  // ---------- particles ----------
  r.burst = (x, y, color, n, speed) => {
    let made = 0;
    for (const p of r.particles) {
      if (p.life > 0) continue;
      const a = Math.random() * Math.PI * 2, s = (speed || 160) * (0.4 + Math.random() * 0.8);
      p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - 60;
      p.life = 0.5 + Math.random() * 0.5; p.maxLife = p.life;
      p.color = color; p.size = 2 + Math.random() * 3;
      if (++made >= (n || 12)) break;
    }
  };
  r.shake = (amount) => { r.trauma = Math.min(1, r.trauma + amount); };

  function stepParticles(dt) {
    for (const p of r.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 300 * dt; p.vx *= (1 - dt * 1.5);
    }
  }

  // ---------- background ----------
  function zoneFor(depthM) {
    for (let i = 0; i < ZONES.length; i++) if (depthM < ZONES[i][0]) return i;
    return ZONES.length - 1;
  }
  function drawBackground(snap) {
    const zi = zoneFor(snap.depthM);
    if (zi !== r.zoneIdx) {
      r.zoneIdx = zi;
      const gr = ctx.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, ZONES[zi][1]); gr.addColorStop(1, ZONES[zi][2]);
      r.bgGrad = gr;
    }
    ctx.fillStyle = r.bgGrad;
    ctx.fillRect(0, 0, W, H);
    // god rays
    ctx.save();
    ctx.globalAlpha = 0.05 + 0.03 * Math.sin(r.time * 0.4);
    ctx.fillStyle = '#9fd8ef';
    for (let i = 0; i < 3; i++) {
      const x = 90 + i * 110 + Math.sin(r.time * 0.2 + i * 2) * 20;
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x + 46, 0); ctx.lineTo(x + 90, H); ctx.lineTo(x + 44, H);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // marine snow
    ctx.fillStyle = 'rgba(180,220,240,0.5)';
    for (let i = 0; i < 40; i++) {
      const y = (i * 197 + r.time * (12 + (i % 5) * 6)) % H;
      const x = (i * 331) % W;
      ctx.fillRect(x, y, 1.6, 1.6);
    }
    // distant creature silhouette by zone
    drawCreature(ZONES[zi][3]);
  }
  function drawCreature(kind) {
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#0e3a52';
    const t = r.time * 0.3;
    if (kind === 'jelly') {
      const x = 320 + Math.sin(t) * 18, y = 200 + Math.cos(t * 0.7) * 24;
      ctx.beginPath(); ctx.arc(x, y, 26, Math.PI, 0); ctx.fill();
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(x - 20 + i * 10, y, 3, 34 + Math.sin(t * 2 + i) * 8);
      }
    } else if (kind === 'squid' || kind === 'angler') {
      const x = 70 + Math.sin(t * 0.8) * 14, y = 620 + Math.cos(t * 0.5) * 18;
      ctx.beginPath(); ctx.ellipse(x, y, 14, 30, 0.3, 0, Math.PI * 2); ctx.fill();
      if (kind === 'angler') { ctx.fillStyle = '#ffd23c'; ctx.beginPath(); ctx.arc(x + 22, y - 26, 4, 0, 7); ctx.fill(); }
    } else if (kind === 'kraken') {
      for (let i = 0; i < 4; i++) {
        const x = 40 + i * 30;
        ctx.beginPath();
        ctx.moveTo(x, H);
        ctx.quadraticCurveTo(x + Math.sin(t + i) * 30, H - 120, x + Math.sin(t + i * 2) * 46, H - 260);
        ctx.lineTo(x + 14 + Math.sin(t + i * 2) * 46, H - 260);
        ctx.quadraticCurveTo(x + 14 + Math.sin(t + i) * 30, H - 120, x + 14, H);
        ctx.fill();
      }
    } else { // sunfish
      const x = 300 + Math.sin(t * 0.6) * 22, y = 160;
      ctx.beginPath(); ctx.ellipse(x, y, 34, 20, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 30, y); ctx.lineTo(x - 52, y - 14); ctx.lineTo(x - 52, y + 14); ctx.fill();
    }
    ctx.restore();
  }

  // ---------- dynamic toys ----------
  function drawBumpers() {
    for (const b of sim.circles) {
      if (b.kind !== 'bumper') continue;
      const f = b.flash || 0;
      ctx.strokeStyle = f > 0 ? '#ffffff' : '#4ce0e0';
      ctx.lineWidth = 3 + f * 3;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
      glow(b.x, b.y, b.r * (3 + f * 2), '#4ce0e0', 0.35 + f * 0.5);
      // cap
      ctx.fillStyle = f > 0 ? '#e8ffff' : '#0e4a5e';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.45, 0, Math.PI * 2); ctx.fill();
    }
  }
  function drawDrops() {
    const names = ['ink1', 'ink2', 'ink3'];
    T.inkRefs.forEach((ref, i) => {
      const down = T.inkDown[i];
      const lit = R.snapshot().lit[names[i]] === 'mode';
      const y = ref.y + (down ? 12 : 0);
      ctx.fillStyle = down ? '#0a2a38' : (lit ? '#c8ffe0' : '#1d7a5e');
      ctx.strokeStyle = lit && !down ? '#ffffff' : '#39d97e';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ref.x, y, ref.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (!down) glow(ref.x, y, 44, '#39d97e', lit ? 0.8 : 0.3);
    });
  }
  function drawAbyss(snap) {
    for (let i = 1; i <= 5; i++) {
      const sp = T.shots['abyss' + i];
      const on = snap.abyss[i - 1];
      ctx.fillStyle = on ? '#ffd23c' : '#123a4a';
      ctx.strokeStyle = on ? '#fff2c8' : '#2a7a94';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (on) glow(sp.x, sp.y, 34, '#ffd23c', 0.6);
    }
  }
  function drawPearl() {
    const w = T.pearlWobble;
    const s = 1 + w * 0.25 * Math.sin(r.time * 30);
    ctx.save(); ctx.translate(300, 210); ctx.scale(s, 1 / s);
    const g = ctx.createRadialGradient(-4, -5, 1, 0, 0, 13);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#ffd9f2'); g.addColorStop(1, '#b44ce0');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    glow(300, 210, 54, '#e07dff', 0.35 + w * 0.4);
  }
  function drawSpinner(spins) {
    const a = (spins || 0) * 0.6 + r.time * 0.8;
    ctx.save(); ctx.translate(332, 300); ctx.rotate(a);
    ctx.strokeStyle = '#4ce0e0'; ctx.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      ctx.rotate(Math.PI * 2 / 3);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -20); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#0e4a5e';
    ctx.beginPath(); ctx.arc(332, 300, 6, 0, Math.PI * 2); ctx.fill();
  }
  function drawSlings() {
    for (const s of sim.segments) {
      if (s.kind !== 'sling') continue;
      ctx.strokeStyle = '#ff9a3c'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); ctx.stroke();
      ctx.strokeStyle = '#ffe0b8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); ctx.stroke();
    }
  }
  function drawFlippers() {
    const snap = sim; // flippers from sim
    for (const f of snap.flippers) {
      const tx = f.pivotX + f.len * Math.cos(f.angle), ty = f.pivotY + f.len * Math.sin(f.angle);
      const px = -Math.sin(f.angle), py = Math.cos(f.angle);
      const wdt = 9;
      ctx.fillStyle = f.pressed ? '#ffd23c' : '#ff9a3c';
      ctx.beginPath();
      ctx.moveTo(f.pivotX + px * wdt / 2, f.pivotY + py * wdt / 2);
      ctx.lineTo(tx + px * wdt / 2, ty + py * wdt / 2);
      ctx.arc(tx, ty, wdt / 2, f.angle - Math.PI / 2, f.angle + Math.PI / 2);
      ctx.lineTo(f.pivotX - px * wdt / 2, f.pivotY - py * wdt / 2);
      ctx.arc(f.pivotX, f.pivotY, wdt / 2, f.angle + Math.PI / 2, f.angle - Math.PI / 2);
      ctx.fill();
      glow(f.pivotX, f.pivotY, 26, '#ff9a3c', 0.5);
    }
  }
  function drawKraken(snap) {
    // animated tentacle tips + tracking eye
    const cx = 352, cy = 318;
    ctx.strokeStyle = '#b44ce0'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const a = (200 + i * 35) * DEG;
      const sway = Math.sin(r.time * 2.2 + i * 1.7) * 8;
      const bx = 315 + 34 * Math.cos(a), by = 390 + 30 * Math.sin(a);
      const ex = 315 + 78 * Math.cos(a - 0.55) + sway, ey = 390 + 74 * Math.sin(a - 0.55) + sway * 0.6;
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(315 + 62 * Math.cos(a - 0.3), 390 + 58 * Math.sin(a - 0.3), ex, ey);
      ctx.stroke();
      glow(ex, ey, 20, '#b44ce0', 0.5);
    }
    ctx.globalAlpha = 1;
    // the eye tracks the nearest ball
    let nx = cx, ny = cy, best = 1e9;
    for (const b of sim.balls) {
      const d = Math.hypot(b.x - cx, b.y - cy);
      if (d < best) { best = d; nx = b.x; ny = b.y; }
    }
    const dx = (nx - cx) / (best || 1), dy = (ny - cy) / (best || 1);
    ctx.fillStyle = '#1a0b22';
    ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ff4ce0'; ctx.lineWidth = 2.5; ctx.stroke();
    const aggro = snap.multiball || (snap.mode && snap.mode.id === 'leviathan') ? 1 : 0.4;
    ctx.fillStyle = aggro > 0.5 ? '#ff3c3c' : '#ffd23c';
    ctx.beginPath(); ctx.arc(cx + dx * 6, cy + dy * 6, 5.5, 0, Math.PI * 2); ctx.fill();
    glow(cx, cy, 46, '#ff4ce0', 0.3 + aggro * 0.3);
    // locked balls in the maw
    T.mawLocks.forEach((h, i) => {
      glow(345, 300 + i * 22, 30, '#4ce0e0', 0.8);
    });
  }
  function drawLure() {
    const armed = T.magnet.armed;
    const pulse = armed ? (0.6 + 0.4 * Math.sin(r.time * 10)) : (0.35 + 0.15 * Math.sin(r.time * 3));
    // stalk
    ctx.strokeStyle = '#7a5b8e'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(200, 272);
    ctx.quadraticCurveTo(196 + Math.sin(r.time * 2) * 6, 292, 200, 310); ctx.stroke();
    // bulb
    glow(200, 310, 44, '#e07dff', pulse);
    ctx.fillStyle = '#f3d9ff';
    ctx.beginPath(); ctx.arc(200, 310, 7, 0, Math.PI * 2); ctx.fill();
    if (T.magnet.held) {
      glow(200, 310, 60, '#ffffff', 0.7);
      ctx.strokeStyle = 'rgba(224,125,255,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(200, 310, 26 + Math.sin(r.time * 8) * 4, 0, Math.PI * 2); ctx.stroke();
    }
  }
  function drawInserts(snap) {
    const t = r.time;
    for (const id in snap.lit) {
      const sp = T.shots[id];
      if (!sp) continue;
      const purpose = snap.lit[id];
      let color = LIT_COLORS[purpose] || '#ffffff';
      let alpha = 0.55 + 0.35 * Math.sin(t * 6);
      if (purpose === 'hurry') alpha = (Math.sin(t * 12) > 0) ? 0.95 : 0.25;
      if (purpose === 'mega') color = 'hsl(' + Math.floor(t * 120 % 360) + ',100%,70%)';
      glow(sp.x, sp.y, 40, color, alpha);
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // kickback indicator
    if (snap.kickbackLit) glow(55, 700, 44, '#39d97e', 0.5 + 0.3 * Math.sin(t * 8));
  }
  function drawBalls() {
    // update trails
    const seen = new Set();
    for (const b of sim.balls) {
      seen.add(b.id);
      if (!r.trails.has(b.id)) r.trails.set(b.id, []);
      const tr = r.trails.get(b.id);
      tr.push({ x: b.x, y: b.y });
      if (tr.length > 14) tr.shift();
      // trail
      for (let i = 0; i < tr.length; i++) {
        const a = i / tr.length;
        glow(tr[i].x, tr[i].y, b.r * 2.4 * a + 4, '#4ce0e0', a * 0.35);
      }
      // ball: bright core + cyan glow
      glow(b.x, b.y, b.r * 4.4, '#4ce0e0', 0.85);
      const g = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, b.r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#bff3ff'); g.addColorStop(1, '#2a9db8');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    }
    for (const id of [...r.trails.keys()]) if (!seen.has(id)) r.trails.delete(id);
    // carried / held balls (ramps, maw, magnet)
    for (const c of T.getCarryBalls()) {
      glow(c.x, c.y, 30, c.magnet ? '#e07dff' : '#4ce0e0', 0.8);
      ctx.fillStyle = '#dff8ff';
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill();
    }
  }
  function drawPlunger() {
    // spring in the lane; compresses with charge
    const ch = r.plungerCharge;
    const x = 370, y0 = 700, y1 = 700 - ch * 46;
    ctx.strokeStyle = '#8fa8bf'; ctx.lineWidth = 4;
    ctx.beginPath();
    for (let y = y0; y >= y1; y -= 8) {
      ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y - 4);
    }
    ctx.stroke();
    ctx.fillStyle = '#ff9a3c';
    ctx.fillRect(x - 10, y1 - 8, 20, 8);
    if (ch > 0.01) glow(x, y1, 30 + ch * 30, '#ff9a3c', 0.4);
  }

  // ---------- main ----------
  r.render = (dt, snap) => {
    r.time += dt;
    r.trauma = Math.max(0, r.trauma - dt * 1.6);
    stepParticles(dt);
    const s = r.viewScale || 1;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    // screen shake
    if (r.trauma > 0) {
      const sh = r.trauma * r.trauma * 9;
      ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    }
    drawBackground(snap);
    if (r.staticC) ctx.drawImage(r.staticC, 0, 0, W, H);
    drawInserts(snap);
    drawBumpers();
    drawDrops();
    drawAbyss(snap);
    drawPearl();
    drawSpinner(snap.spinnerSpins || 0);
    drawSlings();
    drawLure();
    drawKraken(snap);
    drawFlippers();
    drawBalls();
    drawPlunger();
    // particles on top
    for (const p of r.particles) {
      if (p.life <= 0) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    // crush-depth vignette
    if (snap.crush) {
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.62);
      vg.addColorStop(0, 'rgba(120,0,20,0)');
      vg.addColorStop(1, 'rgba(160,10,30,0.28)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  return r;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createRenderer };
}
