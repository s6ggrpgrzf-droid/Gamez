/* ===== The Night Shelf — the neon's hum over the painting (scene.js).
   The menu's hero is a real painting (scene-art.css), still as the
   classroom portrait is still. What lives is the light: this small
   transparent canvas sits over the painting and breathes a slow neon
   hum on its brightest jars — sapphire at the great jar, emerald at
   the round one — a glow along the painted shelf-edge line, a spark
   letting go now and then, dust drifting through the light. Neon does
   not flicker like a flame and it never burns down; it hums, steady,
   with a slow swell — that is the whole choreography, by design.
   The anchor positions are the paintings' own glow points, measured
   from the artwork: portrait and wide.
   Since Oct 29 the light takes direction: window.NS_LIGHT carries
   tonight's mood script (the gamez-ai worker's nightlight kind, one
   per date, worldwide; a seeded house mood when the worker is silent).
   The choreography below is untouched — only its colors, tempo, mote
   count and drift read the script. Absent a script, the house light
   (the original sapphire and emerald) performs exactly as before. ===== */
(() => {
  const cv = document.getElementById('sceneGlow');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  let W = 0, H = 0;
  const HOUSE = { halo: '96,165,255', deep: '70,120,235', core: '190,225,255', secondP: '67,214,138', secondW: '239,80,73', dust: '#d7e9ff', spark: '170,215,255', hum: 1, motes: 10, drift: 0, sparkEvery: 5 };
  const SET_WIDE = { main: { x: 0.146, y: 0.600 }, second: { x: 0.877, y: 0.550 }, lineY: 0.872 };
  const SET_PORTRAIT = { main: { x: 0.185, y: 0.850 }, second: { x: 0.400, y: 0.334 }, lineY: 0.968 };
  const set = () => (W > H * 1.4 ? SET_WIDE : SET_PORTRAIT);

  const motes = [];
  for (let i = 0; i < 16; i++) motes.push({ x: Math.random(), y: Math.random(), s: .5 + Math.random(), ph: Math.random() * 7 });
  const sparks = [];
  let nextSpark = 3.5, hSm = .9;
  const t0 = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    if (!W) return;
    if (!document.getElementById('menu').classList.contains('on')) return;
    const L = window.NS_LIGHT || HOUSE;
    const t = (now - t0) / 1000;
    // the hum: a slow swell, nothing like a flame's flutter (tempo takes direction)
    const th = t * (L.hum || 1);
    const target = .90 + .10 * (Math.sin(th * .9) * .6 + Math.sin(th * .53 + 1.3) * .4);
    hSm += (target - hSm) * .05;
    const fl = hSm;
    const S = set(), M = S.main, mx = W * M.x, my = H * M.y;
    const S2 = S.second, sx = W * S2.x, sy = H * S2.y;
    const s2c = (S === SET_WIDE) ? L.secondW : L.secondP;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    // the room's halo around the great jar
    let gl = ctx.createRadialGradient(mx, my, 4, mx, my, W * .52);
    gl.addColorStop(0, 'rgba(' + L.halo + ',' + (.16 * fl) + ')');
    gl.addColorStop(.55, 'rgba(' + L.deep + ',' + (.05 * fl) + ')');
    gl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
    // the second glow answers, quieter (emerald jar in portrait, the ruby shelf wide)
    let g2 = ctx.createRadialGradient(sx, sy, 3, sx, sy, W * .30);
    g2.addColorStop(0, 'rgba(' + s2c + ',' + (.10 * fl) + ')');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
    // the bright core right at the great jar
    let core = ctx.createRadialGradient(mx, my, 1, mx, my, W * .085);
    core.addColorStop(0, 'rgba(' + L.core + ',' + (.20 * fl) + ')');
    core.addColorStop(1, 'rgba(' + L.halo + ',0)');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(mx, my, W * .085, 0, 7); ctx.fill();
    // the painted shelf-edge line, breathing with the hum
    const ly = H * S.lineY;
    let lg = ctx.createLinearGradient(0, ly - H * .05, 0, ly + H * .012);
    lg.addColorStop(0, 'rgba(' + L.halo + ',0)');
    lg.addColorStop(.8, 'rgba(' + L.halo + ',' + (.05 * fl) + ')');
    lg.addColorStop(1, 'rgba(' + s2c + ',' + (.09 * fl) + ')');
    ctx.fillStyle = lg; ctx.fillRect(0, ly - H * .05, W, H * .062);
    // dust drifting through the neon's light (count and drift take direction)
    ctx.fillStyle = L.dust;
    const nMotes = Math.max(0, Math.min(16, L.motes | 0));
    for (let mi = 0; mi < nMotes; mi++) {
      const m = motes[mi];
      m.y -= .00016 * m.s; if (m.y < 0) { m.y = 1; m.x = Math.random(); }
      m.x += (L.drift || 0) * .00004 * m.s; if (m.x > 1) m.x = 0; if (m.x < 0) m.x = 1;
      const px = W * m.x + Math.sin(t * .5 + m.ph) * 3.2, py = H * m.y;
      const d = Math.hypot(px - mx, py - my) / (W * .5);
      ctx.globalAlpha = Math.max(0, .30 * (1 - d)) * fl * (0.6 + 0.4 * Math.sin(t * .8 + m.ph));
      ctx.beginPath(); ctx.arc(px, py, m.s, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // a spark lets go, now and then (cadence takes direction)
    if (t > nextSpark) {
      nextSpark = t + (L.sparkEvery || 5) * (0.6 + Math.random() * 0.8);
      sparks.push({ x: mx, y: my - 4, vy: .020 + Math.random() * .014, ph: Math.random() * 7, life: 1 });
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const e = sparks[i];
      e.life -= .0075; e.y -= e.vy * H * .016; e.x += Math.sin(t * 3 + e.ph) * .35;
      if (e.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.fillStyle = 'rgba(' + L.spark + ',' + (.7 * e.life) + ')';
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
