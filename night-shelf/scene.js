/* ===== The Night Shelf — the menu's painted room (scene.js).
   The apothecary at night: shelves of jars and tiles, a moonlit window,
   and the candle lit on the counter. The eight tiles in the painting
   wear the faces dressMenu hands over (window.__sceneSet): the pairs
   in your tray when a shelf stands, tonight's faces when the night
   is kept, the classic eight otherwise. =====
   Static layer: textured wall, a window with moonlight for cool fill,
   grain-wood shelves, glass jars with contents and labels, beveled
   lacquer tiles with candle-side rim light, books, a mortar, and a
   brass-held candle. Live layer: a wandering flame, smoothed flicker,
   rising embers, dust drifting in the light, one jar's slow shimmer. */
(() => {
  const cv = document.getElementById('sceneCv');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  let W = 0, H = 0, staticCv = null, noisePat = null;
  const FLAME = { x: 0.295, y: 0.578 };
  const SLOT_DEFAULTS = ['dragG', 'char5', 'windE', 'bam1', 'dot1', 'dragR', 'char9', 'dot5'];
  let slotFaces = SLOT_DEFAULTS.slice();
  window.__sceneSet = faces => {
    if (!faces || !faces.length) return;
    slotFaces = faces.slice(0, 8);
    while (slotFaces.length < 8) slotFaces.push(SLOT_DEFAULTS[slotFaces.length]);
    buildStatic();
  };
  window.__sceneFaces = () => slotFaces.slice();
  const SHELF_A = 0.208, SHELF_B = 0.480, COUNTER = 0.722;

  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const faceImgs = {};
  function fimg(face) {
    if (face in faceImgs) return faceImgs[face];
    const m = faceArt(face).html.match(/<svg[\s\S]*<\/svg>/);
    if (!m) return (faceImgs[face] = null);
    const img = new Image();
    img.onload = () => buildStatic();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(m[0].replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="300" '));
    return (faceImgs[face] = img);
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function contactShadow(g, cx, baseY, rx, ry, a) {
    const gr = g.createRadialGradient(cx, baseY, 1, cx, baseY, rx);
    gr.addColorStop(0, 'rgba(0,0,0,' + a + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.translate(cx, baseY); g.scale(1, ry / rx); g.translate(-cx, -baseY);
    g.fillStyle = gr; g.beginPath(); g.arc(cx, baseY, rx, 0, 7); g.fill();
    g.restore();
  }
  function wood(g, x, y, w, h, base, dark, light) {
    g.fillStyle = base; g.fillRect(x, y, w, h);
    const lg = g.createLinearGradient(0, y, 0, y + h);
    lg.addColorStop(0, light); lg.addColorStop(.18, 'rgba(0,0,0,0)'); lg.addColorStop(1, dark);
    g.fillStyle = lg; g.fillRect(x, y, w, h);
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    for (let i = 0; i < Math.max(5, h / 3); i++) {
      const gy = y + rnd() * h, amp = .6 + rnd() * 1.4, per = 60 + rnd() * 130, ph = rnd() * 7;
      g.strokeStyle = rnd() > .5 ? 'rgba(0,0,0,.13)' : 'rgba(255,214,150,.05)';
      g.lineWidth = .7 + rnd() * .8;
      g.beginPath();
      for (let px = 0; px <= w; px += 14) {
        const yy = gy + Math.sin(px / per * 6.28 + ph) * amp;
        px === 0 ? g.moveTo(x + px, yy) : g.lineTo(x + px, yy);
      }
      g.stroke();
    }
    g.restore();
  }
  function drawTile(g, x, baseY, w, face, rot) {
    const h = w * 1.30, cxT = x + w / 2;
    contactShadow(g, cxT, baseY + 2, w * .55, w * .10, .5);
    g.save();
    g.translate(cxT, baseY); g.rotate(rot || 0);
    let gr = g.createLinearGradient(-w / 2, -h, w / 2, 0);
    gr.addColorStop(0, '#2b2e33'); gr.addColorStop(.6, '#141619'); gr.addColorStop(1, '#08090b');
    g.fillStyle = gr; rr(g, -w / 2 + 2.5, -h + 3.5, w, h, w * .09); g.fill();
    gr = g.createLinearGradient(-w / 2, -h, w * .1, 0);
    gr.addColorStop(0, '#26292e'); gr.addColorStop(.55, '#131518'); gr.addColorStop(1, '#0a0b0d');
    g.fillStyle = gr; rr(g, -w / 2, -h, w, h, w * .09); g.fill();
    // face plate, raised and inset
    const px = -w / 2 + w * .075, py = -h + h * .06, pw = w * .85, ph = h * .88;
    gr = g.createLinearGradient(0, py, 0, py + ph);
    gr.addColorStop(0, '#1e2124'); gr.addColorStop(1, '#101215');
    g.fillStyle = gr; rr(g, px, py, pw, ph, w * .06); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
    rr(g, px, py, pw, ph, w * .06); g.stroke();
    g.save(); rr(g, px, py, pw, ph, w * .06); g.clip();
    const img = fimg(face);
    if (img && img.complete && img.naturalWidth) {
      const aw = pw * .92, ah = ph * .94, sc = Math.min(aw / 240, ah / 300);
      g.drawImage(img, -240 * sc / 2, py + ph / 2 - 300 * sc / 2, 240 * sc, 300 * sc);
    } else if (!img) {
      const p = parseFace(face), art = faceArt(face), cy = py + ph / 2;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = art.en || '#e8c56a'; g.shadowBlur = w * .11;
      if (p.kind === 'char') {
        g.fillStyle = SAPP; g.font = (w * .33) + 'px MJSerif, serif';
        g.fillText(NUMCHAR[p.n - 1], 0, cy - w * .29);
        g.fillStyle = RUBY; g.font = (w * .50) + 'px MJSerif, serif';
        g.fillText('萬', 0, cy + w * .21);
      } else if (p.kind === 'wind') {
        g.fillStyle = PEARL; g.font = (w * .52) + 'px MJSerif, serif';
        g.fillText(WINDCHAR[p.w], 0, cy);
      } else if (p.kind === 'drag') {
        g.fillStyle = p.d === 'R' ? RUBY : EMER; g.font = (w * .52) + 'px MJSerif, serif';
        g.fillText(p.d === 'R' ? '中' : '發', 0, cy);
      }
      g.shadowBlur = 0;
    }
    g.restore();
    // bevel light on top, candle-side rim below
    g.fillStyle = 'rgba(255,255,255,.13)';
    g.fillRect(-w / 2 + w * .08, -h + 1, w * .84, 1.1);
    const fx = W * FLAME.x, warm = Math.max(0, 1 - Math.abs(cxT - fx) / (W * .62));
    if (warm > .04) {
      const side = fx > cxT ? 1 : -1;
      const rg = g.createLinearGradient(0, -h, 0, 0);
      rg.addColorStop(0, 'rgba(255,196,116,' + (.34 * warm) + ')');
      rg.addColorStop(1, 'rgba(255,196,116,' + (.10 * warm) + ')');
      g.fillStyle = rg;
      const ex = side > 0 ? w / 2 - 1.6 : -w / 2;
      rr(g, ex, -h + 2, 1.6, h - 4, .8); g.fill();
    }
    g.restore();
  }
  function drawJar(g, x, baseY, w, h, tint, content, letter) {
    const cxJ = x + w / 2;
    contactShadow(g, cxJ, baseY + 2, w * .56, w * .13, .48);
    g.save();
    const p = new Path2D();
    p.moveTo(x, baseY);
    p.lineTo(x, baseY - h * .50);
    p.quadraticCurveTo(x, baseY - h * .86, x + w * .30, baseY - h * .90);
    p.lineTo(x + w * .34, baseY - h);
    p.lineTo(x + w * .66, baseY - h);
    p.lineTo(x + w * .70, baseY - h * .90);
    p.quadraticCurveTo(x + w, baseY - h * .86, x + w, baseY - h * .50);
    p.lineTo(x + w, baseY);
    p.closePath();
    let gr = g.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, '#05070a'); gr.addColorStop(.22, tint); gr.addColorStop(.48, tint);
    gr.addColorStop(.78, '#0b0d10'); gr.addColorStop(1, '#040506');
    g.fillStyle = gr; g.fill(p);
    g.save(); g.clip(p);
    const cg = g.createLinearGradient(0, baseY - h * .50, 0, baseY);
    cg.addColorStop(0, content.replace(/[\d.]+\)$/, '.52)')); cg.addColorStop(1, content);
    g.fillStyle = cg; g.fillRect(x, baseY - h * .485, w, h * .485);
    g.fillStyle = 'rgba(255,255,255,.22)';
    g.beginPath(); g.ellipse(cxJ, baseY - h * .485, w * .47, h * .028, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.30)';
    [.3, .55, .72].forEach((fxr, i) => {
      g.beginPath(); g.arc(x + w * fxr, baseY - h * (.16 + i * .09), 1 + (i % 2) * .6, 0, 7); g.fill();
    });
    // candle-side warmth inside the glass
    const fx = W * FLAME.x, warm = Math.max(0, 1 - Math.abs(cxJ - fx) / (W * .66));
    if (warm > .03) {
      const wg = g.createLinearGradient(cxJ - w / 2, 0, cxJ + w / 2, 0);
      const s = fx > cxJ ? 1 : 0;
      wg.addColorStop(s ? 1 : 0, 'rgba(255,178,96,' + (.13 * warm) + ')');
      wg.addColorStop(s ? 0 : 1, 'rgba(255,178,96,0)');
      g.fillStyle = wg; g.fillRect(x, baseY - h, w, h);
    }
    g.fillStyle = 'rgba(255,255,255,.16)';
    rr(g, x + w * .155, baseY - h * .82, w * .085, h * .55, w * .045); g.fill();
    g.fillStyle = 'rgba(255,255,255,.30)';
    rr(g, x + w * .155, baseY - h * .82, w * .022, h * .55, w * .012); g.fill();
    g.fillStyle = 'rgba(255,255,255,.13)';
    g.beginPath(); g.ellipse(cxJ, baseY - h * .045, w * .34, h * .035, 0, 0, 7); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(255,235,200,.20)'; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x + w * .06, baseY - h * .60);
    g.quadraticCurveTo(cxJ, baseY - h * .97, x + w * .94, baseY - h * .60);
    g.stroke();
    // label, a touch crooked, with its initial
    g.save();
    g.translate(cxJ, baseY - h * .345); g.rotate((rnd() - .5) * .05);
    g.fillStyle = '#e7dab6'; rr(g, -w * .27, -h * .155, w * .54, h * .31, 2); g.fill();
    g.strokeStyle = 'rgba(106,88,54,.9)'; g.lineWidth = 1;
    rr(g, -w * .27, -h * .155, w * .54, h * .31, 2); g.stroke();
    g.strokeStyle = 'rgba(106,88,54,.45)';
    rr(g, -w * .225, -h * .115, w * .45, h * .23, 1.5); g.stroke();
    g.fillStyle = '#6a5836'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = (h * .19) + 'px MJSerif, Georgia, serif';
    g.fillText(letter, 0, 1);
    g.restore();
    // twine and cork
    g.strokeStyle = '#6f5636'; g.lineWidth = 1.6;
    [.965, .935].forEach(fy => {
      g.beginPath(); g.moveTo(x + w * .325, baseY - h * fy); g.lineTo(x + w * .675, baseY - h * fy); g.stroke();
    });
    const ck = g.createLinearGradient(x + w * .35, 0, x + w * .65, 0);
    ck.addColorStop(0, '#8a6a42'); ck.addColorStop(.5, '#bb9868'); ck.addColorStop(1, '#7d5f3a');
    g.fillStyle = ck;
    rr(g, x + w * .345, baseY - h - H * .014, w * .31, H * .016, 2); g.fill();
    g.strokeStyle = 'rgba(60,42,20,.5)'; g.lineWidth = .7;
    [.42, .52, .60].forEach(fxr => {
      g.beginPath(); g.moveTo(x + w * fxr, baseY - h - H * .012); g.lineTo(x + w * fxr, baseY - h - H * .002); g.stroke();
    });
    g.restore();
  }
  function drawBook(g, x, baseY, w, h, spine) {
    contactShadow(g, x + w / 2, baseY + 1.5, w * .54, w * .09, .45);
    g.save();
    g.fillStyle = spine; rr(g, x, baseY - h, w, h, 2); g.fill();
    const pg = g.createLinearGradient(x, 0, x + w, 0);
    pg.addColorStop(0, 'rgba(0,0,0,.38)'); pg.addColorStop(.16, 'rgba(0,0,0,0)');
    pg.addColorStop(.86, '#ddd2ae'); pg.addColorStop(1, '#efe6c6');
    g.fillStyle = pg; rr(g, x, baseY - h, w, h, 2); g.fill();
    g.strokeStyle = 'rgba(120,104,66,.55)'; g.lineWidth = .7;
    [.3, .55, .8].forEach(f => {
      g.beginPath(); g.moveTo(x + w * .87, baseY - h + h * f * .6); g.lineTo(x + w * .985, baseY - h + h * f * .6); g.stroke();
    });
    g.fillStyle = 'rgba(232,197,106,.75)';
    g.fillRect(x + w * .045, baseY - h, 1.4, h);
    g.fillRect(x + w * .10, baseY - h, 1.4, h);
    g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(x, baseY - h, w, 1.1);
    g.restore();
  }
  function shelfBoard(g, y) {
    const sh = g.createLinearGradient(0, y + H * .02, 0, y + H * .13);
    sh.addColorStop(0, 'rgba(0,0,0,.5)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.fillRect(W * .02, y + H * .02, W * .96, H * .11);
    wood(g, W * .028, y, W * .944, H * .027, '#2c2013', 'rgba(0,0,0,.55)', 'rgba(255,205,130,.14)');
    // iron brackets
    g.fillStyle = '#0c0d0f';
    [.16, .5, .84].forEach(fx => {
      g.fillRect(W * fx - 2, y + H * .027, 4, H * .030);
      g.fillRect(W * fx - 2, y + H * .052, 13, 3.4);
    });
  }
  function buildStatic() {
    if (!W) return;
    seed = 11;
    staticCv = document.createElement('canvas');
    staticCv.width = W * DPR; staticCv.height = H * DPR;
    const g = staticCv.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    // wall: deep boards, warm at the candle, cool at the window
    const wb = g.createLinearGradient(0, 0, 0, H);
    wb.addColorStop(0, '#0b0d10'); wb.addColorStop(.7, '#0a0b0d'); wb.addColorStop(1, '#070708');
    g.fillStyle = wb; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.028)'; g.lineWidth = 1;
    for (let x = W * .06; x < W; x += W * .088) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H * .72); g.stroke();
    }
    let wash = g.createRadialGradient(W * FLAME.x, H * FLAME.y, 8, W * FLAME.x, H * FLAME.y, W * .92);
    wash.addColorStop(0, 'rgba(255,176,92,.16)'); wash.addColorStop(.5, 'rgba(190,120,50,.055)'); wash.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = wash; g.fillRect(0, 0, W, H);
    // the window: night beyond the glass
    const wx = W * .695, wy = H * .038, ww = W * .258, wh = H * .272;
    g.fillStyle = '#171208'; g.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
    const ng = g.createLinearGradient(0, wy, 0, wy + wh);
    ng.addColorStop(0, '#101c38'); ng.addColorStop(.65, '#0a1226'); ng.addColorStop(1, '#060a18');
    g.fillStyle = ng; g.fillRect(wx, wy, ww, wh);
    g.fillStyle = '#dfe9ff';
    for (let i = 0; i < 16; i++) {
      g.globalAlpha = .25 + rnd() * .65;
      g.beginPath(); g.arc(wx + rnd() * ww, wy + rnd() * wh * .8, rnd() < .18 ? 1.5 : .8, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    let mg = g.createRadialGradient(wx + ww * .80, wy + wh * .22, 2, wx + ww * .80, wy + wh * .22, ww * .30);
    mg.addColorStop(0, 'rgba(210,226,255,.5)'); mg.addColorStop(1, 'rgba(210,226,255,0)');
    g.fillStyle = mg; g.fillRect(wx, wy, ww, wh);
    g.fillStyle = '#e8efff';
    g.beginPath(); g.arc(wx + ww * .80, wy + wh * .22, W * .024, 0, 7); g.fill();
    g.fillStyle = 'rgba(16,28,54,.85)';
    g.beginPath(); g.arc(wx + ww * .71, wy + wh * .19, W * .020, 0, 7); g.fill();
    g.fillStyle = '#04060d';
    g.beginPath();
    g.moveTo(wx, wy + wh);
    g.lineTo(wx, wy + wh * .82); g.lineTo(wx + ww * .22, wy + wh * .74);
    g.lineTo(wx + ww * .38, wy + wh * .84); g.lineTo(wx + ww * .60, wy + wh * .76);
    g.lineTo(wx + ww * .78, wy + wh * .86); g.lineTo(wx + ww, wy + wh * .80);
    g.lineTo(wx + ww, wy + wh); g.closePath(); g.fill();
    g.strokeStyle = '#0a0805'; g.lineWidth = 5;
    g.beginPath();
    g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh);
    g.moveTo(wx, wy + wh / 2); g.lineTo(wx + ww, wy + wh / 2);
    g.stroke();
    g.strokeStyle = 'rgba(190,214,255,.14)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(wx + 3, wy + wh - 3); g.lineTo(wx + ww * .4, wy + 3); g.stroke();
    let cool = g.createRadialGradient(wx + ww / 2, wy + wh / 2, 6, wx + ww / 2, wy + wh / 2, W * .5);
    cool.addColorStop(0, 'rgba(120,160,255,.10)'); cool.addColorStop(1, 'rgba(120,160,255,0)');
    g.fillStyle = cool; g.fillRect(0, 0, W, H);
    // shelves and their keeping
    const sA = H * SHELF_A, sB = H * SHELF_B;
    shelfBoard(g, sA); shelfBoard(g, sB);
    drawJar(g, W * .058, sA, W * .090, H * .122, '#1e2f24', 'rgba(67,214,138,.34)', 'A');
    drawJar(g, W * .162, sA, W * .058, H * .080, '#2e1e1e', 'rgba(239,80,73,.32)', 'C');
    drawTile(g, W * .368, sA, W * .110, slotFaces[0], 0);
    drawTile(g, W * .486, sA, W * .110, slotFaces[1], 0);
    drawJar(g, W * .652, sA, W * .072, H * .098, '#1e2836', 'rgba(132,184,255,.32)', 'M');
    drawJar(g, W * .736, sA, W * .052, H * .068, '#2e2616', 'rgba(232,197,106,.34)', 'N');
    drawTile(g, W * .806, sA, W * .086, slotFaces[2], -.12);
    drawTile(g, W * .052, sB, W * .104, slotFaces[3], 0);
    drawJar(g, W * .176, sB, W * .066, H * .092, '#261b31', 'rgba(190,130,255,.28)', 'R');
    drawJar(g, W * .316, sB, W * .114, H * .076, '#1e2f24', 'rgba(67,214,138,.28)', 'S');
    drawJar(g, W * .448, sB, W * .050, H * .066, '#2e1e1e', 'rgba(239,80,73,.32)', 'V');
    drawJar(g, W * .508, sB, W * .050, H * .056, '#1e2836', 'rgba(132,184,255,.32)', 'A');
    drawTile(g, W * .606, sB, W * .098, slotFaces[4], 0);
    drawTile(g, W * .712, sB, W * .098, slotFaces[5], 0);
    const bkY = sB;
    drawBook(g, W * .838, bkY, W * .108, H * .024, '#4a2430');
    drawBook(g, W * .842, bkY - H * .024, W * .100, H * .022, '#274435');
    drawBook(g, W * .846, bkY - H * .046, W * .092, H * .020, '#5c451f');
    // counter
    const cY = H * COUNTER;
    wood(g, 0, cY, W, H * .052, '#32251a', 'rgba(0,0,0,.35)', 'rgba(255,205,130,.20)');
    const cf = g.createLinearGradient(0, cY + H * .052, 0, H);
    cf.addColorStop(0, '#170f07'); cf.addColorStop(1, '#0b0603');
    g.fillStyle = cf; g.fillRect(0, cY + H * .052, W, H - cY - H * .052);
    g.fillStyle = 'rgba(255,205,130,.16)'; g.fillRect(0, cY, W, 1.1);
    // mortar on the counter, right side
    const mx = W * .822, my = H * .800;
    contactShadow(g, mx, my + 2, W * .055, W * .012, .5);
    const bg2 = g.createLinearGradient(mx - W * .045, 0, mx + W * .045, 0);
    bg2.addColorStop(0, '#2e2416'); bg2.addColorStop(.5, '#57462a'); bg2.addColorStop(1, '#241b0f');
    g.fillStyle = bg2;
    g.beginPath();
    g.moveTo(mx - W * .046, my - H * .034);
    g.quadraticCurveTo(mx, my + H * .012, mx + W * .046, my - H * .034);
    g.closePath(); g.fill();
    g.fillStyle = '#0f0c07';
    g.beginPath(); g.ellipse(mx, my - H * .034, W * .046, H * .008, 0, 0, 7); g.fill();
    g.save();
    g.translate(mx + W * .018, my - H * .036); g.rotate(.7);
    g.fillStyle = bg2; rr(g, -2.2, -H * .052, 4.4, H * .056, 2.2); g.fill();
    g.restore();
    // resting tiles mid-counter
    drawTile(g, W * .566, H * .806, W * .098, slotFaces[6], .05);
    drawTile(g, W * .678, H * .806, W * .090, slotFaces[7], -.04);
    // the candle: a turned brass holder and honest wax
    const cx = W * FLAME.x, base = H * .812;
    const brass = g.createLinearGradient(cx - W * .07, 0, cx + W * .07, 0);
    brass.addColorStop(0, '#3d2c14'); brass.addColorStop(.35, '#a37f3e'); brass.addColorStop(.55, '#d9b264'); brass.addColorStop(1, '#33260f');
    g.fillStyle = brass;
    g.beginPath();
    g.moveTo(cx - W * .068, base);
    g.quadraticCurveTo(cx - W * .066, base - H * .006, cx - W * .030, base - H * .008);
    g.quadraticCurveTo(cx - W * .016, base - H * .010, cx - W * .013, base - H * .026);
    g.lineTo(cx - W * .026, base - H * .034);
    g.quadraticCurveTo(cx, base - H * .040, cx + W * .026, base - H * .034);
    g.lineTo(cx + W * .013, base - H * .026);
    g.quadraticCurveTo(cx + W * .016, base - H * .010, cx + W * .030, base - H * .008);
    g.quadraticCurveTo(cx + W * .066, base - H * .006, cx + W * .068, base);
    g.closePath(); g.fill();
    contactShadow(g, cx, base + 2, W * .075, W * .014, .5);
    const waxTop = H * .636, cw = W * .055;
    const wg = g.createLinearGradient(cx - cw / 2, 0, cx + cw / 2, 0);
    wg.addColorStop(0, '#b39a67'); wg.addColorStop(.30, '#f6ead0'); wg.addColorStop(.62, '#efe0bc'); wg.addColorStop(1, '#8f7443');
    g.fillStyle = wg;
    rr(g, cx - cw / 2, waxTop, cw, base - H * .030 - waxTop, 3); g.fill();
    g.fillStyle = '#fdf6e0';
    g.beginPath(); g.ellipse(cx, waxTop, cw / 2, H * .0085, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,214,140,.5)';
    g.beginPath(); g.ellipse(cx, waxTop, cw * .26, H * .0042, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(246,234,208,.95)';
    rr(g, cx - cw / 2 - 1.6, waxTop + H * .006, 3.4, H * .052, 1.7); g.fill();
    rr(g, cx + cw * .18, waxTop + H * .004, 2.8, H * .030, 1.4); g.fill();
    rr(g, cx + cw / 2 - 1.2, waxTop + H * .009, 2.6, H * .068, 1.3); g.fill();
    g.strokeStyle = '#181008'; g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(cx, waxTop - 1);
    g.quadraticCurveTo(cx + 1.6, waxTop - H * .010, cx + .8, waxTop - H * .017);
    g.stroke();
    // grain over everything, then the darkening of distance
    if (!noisePat) {
      const nc = document.createElement('canvas');
      nc.width = nc.height = 140;
      const nx = nc.getContext('2d'), id = nx.createImageData(140, 140);
      for (let i = 0; i < id.data.length; i += 4) {
        const v = 108 + Math.random() * 84;
        id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255;
      }
      nx.putImageData(id, 0, 0);
      noisePat = ctx.createPattern(nc, 'repeat');
    }
    g.save();
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = .055;
    g.fillStyle = noisePat; g.fillRect(0, 0, W, H);
    g.restore();
    let fo = g.createLinearGradient(W * .48, 0, W, 0);
    fo.addColorStop(0, 'rgba(0,0,0,0)'); fo.addColorStop(1, 'rgba(0,0,0,.30)');
    g.fillStyle = fo; g.fillRect(0, 0, W, H);
    let vg = g.createRadialGradient(W / 2, H * .46, H * .32, W / 2, H * .5, H * .98);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.46)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
  // ---- the live layer ----
  const motes = [];
  for (let i = 0; i < 12; i++) motes.push({ x: Math.random(), y: .3 + Math.random() * .55, s: .5 + Math.random(), ph: Math.random() * 7 });
  const embers = [];
  let nextEmber = 2.5, fSm = .85;
  const t0 = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    if (!W || !staticCv) return;
    if (!document.getElementById('menu').classList.contains('on')) return;
    const t = (now - t0) / 1000;
    const target = .85 + .15 * (Math.sin(t * 11) * .32 + Math.sin(t * 23 + 1.7) * .28 + Math.sin(t * 5.3 + .4) * .40);
    fSm += (target - fSm) * .07;
    const fl = fSm;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(staticCv, 0, 0);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const fx = W * FLAME.x, fy = H * FLAME.y;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    let gl = ctx.createRadialGradient(fx, fy, 4, fx, fy, W * .60);
    gl.addColorStop(0, 'rgba(255,178,92,' + (.21 * fl) + ')');
    gl.addColorStop(.55, 'rgba(214,130,50,' + (.07 * fl) + ')');
    gl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
    let pl = ctx.createRadialGradient(fx, H * .806, 2, fx, H * .806, W * .30);
    pl.addColorStop(0, 'rgba(255,186,100,' + (.15 * fl) + ')'); pl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pl;
    ctx.beginPath(); ctx.ellipse(fx, H * .806, W * .30, H * .042, 0, 0, 7); ctx.fill();
    // one jar breathes: the wide green jar's highlight, slow as sleep
    const shA = .045 + .040 * (0.5 + 0.5 * Math.sin(t * .45));
    ctx.fillStyle = 'rgba(255,240,200,' + shA + ')';
    rr(ctx, W * .316 + W * .114 * .16, H * SHELF_B - H * .076 * .80, W * .114 * .09, H * .076 * .52, 3); ctx.fill();
    // dust drifting through the light
    ctx.fillStyle = '#ffe9bb';
    for (const m of motes) {
      m.y -= .00016 * m.s; if (m.y < .22) { m.y = .86; m.x = .04 + Math.random() * .55; }
      const mx = W * m.x + Math.sin(t * .5 + m.ph) * 3.2, my = H * m.y;
      const d = Math.hypot(mx - fx, my - fy) / (W * .55);
      ctx.globalAlpha = Math.max(0, .34 * (1 - d)) * fl * (0.6 + 0.4 * Math.sin(t * .8 + m.ph));
      ctx.beginPath(); ctx.arc(mx, my, m.s, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // embers: now and then one lets go
    if (t > nextEmber) {
      nextEmber = t + 2.2 + Math.random() * 4.5;
      embers.push({ x: fx, y: fy - H * .01, vy: .028 + Math.random() * .02, ph: Math.random() * 7, life: 1 });
    }
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.life -= .0075; e.y -= e.vy * H * .016; e.x += Math.sin(t * 3 + e.ph) * .35;
      if (e.life <= 0) { embers.splice(i, 1); continue; }
      ctx.fillStyle = 'rgba(255,176,92,' + (.75 * e.life) + ')';
      ctx.beginPath(); ctx.arc(e.x, e.y, 1.15 * e.life + .3, 0, 7); ctx.fill();
    }
    ctx.restore();
    // the flame itself: three skins and a blue root
    const tipX = fx + Math.sin(t * 1.9) * W * .0038 + Math.sin(t * 7.3) * W * .0014;
    const fh = H * .054 * (0.90 + .18 * fl), fw = W * .0185 * (0.88 + .16 * fl);
    let halo = ctx.createRadialGradient(fx, fy, 1, fx, fy, fw * 3.4);
    halo.addColorStop(0, 'rgba(255,150,50,' + (.30 * fl) + ')'); halo.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(fx, fy, fw * 3.4, 0, 7); ctx.fill();
    let fg = ctx.createLinearGradient(0, fy - fh, 0, fy + fh * .46);
    fg.addColorStop(0, 'rgba(255,138,28,0)');
    fg.addColorStop(.34, 'rgba(255,158,44,.88)');
    fg.addColorStop(.72, 'rgba(255,216,134,.98)');
    fg.addColorStop(1, '#fff6da');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(tipX, fy - fh);
    ctx.bezierCurveTo(tipX + fw * .95, fy - fh * .38, fx + fw * .82, fy + fh * .16, fx, fy + fh * .44);
    ctx.bezierCurveTo(fx - fw * .82, fy + fh * .16, tipX - fw * .95, fy - fh * .38, tipX, fy - fh);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,252,238,.95)';
    ctx.beginPath(); ctx.ellipse(fx + (tipX - fx) * .35, fy + fh * .17, fw * .33, fh * .30, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(96,148,255,' + (.5 * fl) + ')';
    ctx.beginPath(); ctx.ellipse(fx, fy + fh * .40, fw * .40, fh * .13, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,190,90,' + (.8 * fl) + ')';
    ctx.beginPath(); ctx.arc(fx, fy + fh * .47, 1.1, 0, 7); ctx.fill();
  }
  function fit() {
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    W = r.width; H = r.height;
    cv.width = W * DPR; cv.height = H * DPR;
    buildStatic();
  }
  window.addEventListener('resize', fit);
  if (window.__scenePending) { slotFaces = window.__scenePending.slice(0, 8); window.__scenePending = null; }
  fit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => buildStatic());
  requestAnimationFrame(frame);
})();
