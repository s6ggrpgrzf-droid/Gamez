/* ===== The Night Shelf — the candle's light over the painting (scene.js).
   The menu's hero is a real painting now (scene-art.css), still as the
   classroom portrait is still. What lives is the light: this small
   transparent canvas sits over the painting and breathes a warm glow
   on its candle — a smoothed flicker, a pool of light beneath it, an
   ember letting go now and then, dust drifting through the beam.
   The flame positions are the paintings' own candles, measured from
   the artwork: portrait and wide. ===== */
(() => {
  const cv = document.getElementById('sceneGlow');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  let W = 0, H = 0;
  const FLAME_WIDE = { x: 0.064, y: 0.600 };
  const FLAME_PORTRAIT = { x: 0.156, y: 0.885 };
  const flame = () => (W > H * 1.4 ? FLAME_WIDE : FLAME_PORTRAIT);

  const motes = [];
  for (let i = 0; i < 10; i++) motes.push({ x: Math.random(), y: Math.random(), s: .5 + Math.random(), ph: Math.random() * 7 });
  const embers = [];
  let nextEmber = 2.5, fSm = .85;
  const t0 = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    if (!W) return;
    if (!document.getElementById('menu').classList.contains('on')) return;
    const t = (now - t0) / 1000;
    const target = .85 + .15 * (Math.sin(t * 11) * .32 + Math.sin(t * 23 + 1.7) * .28 + Math.sin(t * 5.3 + .4) * .40);
    fSm += (target - fSm) * .07;
    const fl = fSm;
    const F = flame(), fx = W * F.x, fy = H * F.y;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    // the room's warm halo around the flame
    let gl = ctx.createRadialGradient(fx, fy, 4, fx, fy, W * .52);
    gl.addColorStop(0, 'rgba(255,178,92,' + (.17 * fl) + ')');
    gl.addColorStop(.55, 'rgba(214,130,50,' + (.055 * fl) + ')');
    gl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
    // the bright breath right at the wick
    let core = ctx.createRadialGradient(fx, fy, 1, fx, fy, W * .085);
    core.addColorStop(0, 'rgba(255,214,140,' + (.20 * fl) + ')');
    core.addColorStop(1, 'rgba(255,180,90,0)');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(fx, fy, W * .085, 0, 7); ctx.fill();
    // light pooling on the counter under the candle
    let pl = ctx.createRadialGradient(fx, fy + H * .055, 2, fx, fy + H * .055, W * .26);
    pl.addColorStop(0, 'rgba(255,186,100,' + (.13 * fl) + ')'); pl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pl;
    ctx.beginPath(); ctx.ellipse(fx, fy + H * .055, W * .26, H * .035, 0, 0, 7); ctx.fill();
    // dust drifting through the candle's light
    ctx.fillStyle = '#ffe9bb';
    for (const m of motes) {
      m.y -= .00016 * m.s; if (m.y < 0) { m.y = 1; m.x = Math.random(); }
      const mx = W * m.x + Math.sin(t * .5 + m.ph) * 3.2, my = H * m.y;
      const d = Math.hypot(mx - fx, my - fy) / (W * .5);
      ctx.globalAlpha = Math.max(0, .30 * (1 - d)) * fl * (0.6 + 0.4 * Math.sin(t * .8 + m.ph));
      ctx.beginPath(); ctx.arc(mx, my, m.s, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // an ember lets go, now and then
    if (t > nextEmber) {
      nextEmber = t + 2.2 + Math.random() * 4.5;
      embers.push({ x: fx, y: fy - 4, vy: .028 + Math.random() * .02, ph: Math.random() * 7, life: 1 });
    }
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.life -= .0075; e.y -= e.vy * H * .016; e.x += Math.sin(t * 3 + e.ph) * .35;
      if (e.life <= 0) { embers.splice(i, 1); continue; }
      ctx.fillStyle = 'rgba(255,176,92,' + (.7 * e.life) + ')';
      ctx.beginPath(); ctx.arc(e.x, e.y, 1.15 * e.life + .3, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
  function fit() {
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    W = r.width; H = r.height;
    cv.width = W * DPR; cv.height = H * DPR;
  }
  window.addEventListener('resize', fit);
  fit();
  requestAnimationFrame(frame);
})();
