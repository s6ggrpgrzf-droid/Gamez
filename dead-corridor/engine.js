/* Dead Man's Corridor — raycaster engine (vanilla Canvas 2D).
 * Renders to a low-res offscreen buffer, upscales smooth, then full-res
 * post effects (vignette, grain, damage flash) on top.
 * Portrait-first: buffer is tall (e.g. 270x480), FOV ~72deg.
 */
(function () {
  'use strict';
  var E = window.DC_ENGINE = {};

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  var TEX = 64;                 // wall/floor texture size
  var buf, bctx;                // low-res buffer
  var BW = 270, BH = 480;       // buffer size (set by init)
  var FOV = 72 * Math.PI / 180;
  var zbuf = new Float32Array(BW);
  var colAngles = new Float32Array(BW);   // per-column angle offsets

  E.textures = {};              // name -> canvas(64x64)

  function init(w, h) {
    BW = w; BH = h;
    buf = document.createElement('canvas');
    buf.width = BW; buf.height = BH;
    bctx = buf.getContext('2d');
    bctx.imageSmoothingEnabled = true;
    zbuf = new Float32Array(BW);
    colAngles = new Float32Array(BW);
    for (var i = 0; i < BW; i++)
      colAngles[i] = Math.atan((2 * i / BW - 1) * Math.tan(FOV / 2));
  }
  E.init = init;

  E.tex = function (name, canvas) { E.textures[name] = canvas; };

  /* DDA raycast. Returns {dist (perp), texX 0..1, side 0|1, cell, hx, hy}. */
  function castRay(map, mw, x, y, ang) {
    var dx = Math.cos(ang), dy = Math.sin(ang);
    var mx = Math.floor(x), my = Math.floor(y);
    var ddx = Math.abs(1 / (dx || 1e-9)), ddy = Math.abs(1 / (dy || 1e-9));
    var stepX, stepY, sdx, sdy, side;
    if (dx < 0) { stepX = -1; sdx = (x - mx) * ddx; } else { stepX = 1; sdx = (mx + 1 - x) * ddx; }
    if (dy < 0) { stepY = -1; sdy = (y - my) * ddy; } else { stepY = 1; sdy = (my + 1 - y) * ddy; }
    var cell = 0, guard = 0;
    while (guard++ < 64) {
      if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; }
      else { sdy += ddy; my += stepY; side = 1; }
      if (mx < 0 || my < 0 || mx >= mw || my >= map.length / mw) break;
      cell = map[my * mw + mx];
      if (cell > 0) break;
    }
    var dist = side === 0 ? (sdx - ddx) : (sdy - ddy);
    if (dist < 0.02) dist = 0.02;
    // perpendicular distance (no fisheye) is approximated by projecting below;
    // exact perp: dist * cos(rayAng - viewAng). Caller passes rel already? We
    // compute perp here from the raw angle vs the cast angle delta handled by caller.
    var wx = x + dx * dist, wy = y + dy * dist;
    var wallX = side === 0 ? wy : wx;
    var texX = wallX - Math.floor(wallX);
    return { dist: dist, texX: texX, side: side, cell: cell, hx: wx, hy: wy };
  }
  E.castRay = castRay;

  /* Light level 0..1.6 at a world point: base falloff + dynamic lights.
   * lights: [{x,y,radius,intensity,flick, cr,cg,cb}] ; flash: 0..1 muzzle flash boost
   * Also records the weighted light COLOR in _tint (for colored-light shadows). */
  var _tint = { r: 1, g: 1, b: 1, w: 0 };
  function lightAt(lights, flash, x, y, dist) {
    var l = Math.max(0, 1 - dist / 15);          // base distance falloff
    l = 0.38 + 0.62 * l * l;
    var wr = 0, wg = 0, wb = 0, wsum = 0;
    for (var i = 0; i < lights.length; i++) {
      var L = lights[i];
      var dx = x - L.x, dy = y - L.y;
      var d2 = dx * dx + dy * dy;
      var r = L.radius;
      if (d2 < r * r) {
        var f = 1 - Math.sqrt(d2) / r;
        var c = f * f * L.intensity * (L.flick || 1);
        l += c;
        wr += c * (L.cr == null ? 1 : L.cr);
        wg += c * (L.cg == null ? 1 : L.cg);
        wb += c * (L.cb == null ? 1 : L.cb);
        wsum += c;
      }
    }
    var fl = flash * Math.max(0, 1 - dist / 9) * 1.6;
    l += fl;                                     // muzzle flash is white
    wr += fl; wg += fl; wb += fl; wsum += fl;
    if (wsum > 0.0001) { _tint.r = wr / wsum; _tint.g = wg / wsum; _tint.b = wb / wsum; }
    else { _tint.r = 1; _tint.g = 1; _tint.b = 1; }
    _tint.w = Math.min(1, wsum * 0.5);
    return l > 1.6 ? 1.6 : l;
  }

  /* Shadow overlay color: near-black, leaning toward the light tint where
   * strongly colored light dominates (red emergency glow, cold blue labs). */
  function shadeStr(dark) {
    var col = Math.max(Math.abs(_tint.r - _tint.g), Math.abs(_tint.g - _tint.b), Math.abs(_tint.r - _tint.b));
    var amt = Math.min(1, col * 2.4) * _tint.w;
    var r = 2 + _tint.r * 70 * amt, g = 1 + _tint.g * 62 * amt, b = 6 + _tint.b * 78 * amt;
    return 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + dark.toFixed(2) + ')';
  }

  /* Render the scene.
   * view: {x, y, ang, pitch (px horizon shift), flash 0..1}
   * map: {grid (Uint8Array), w, texFor(cell)->name, ceilColor, floorTex}
   * lights: array; sprites: [{x,y,tex(canvas),scale,shade,vMove}] sorted far->near by caller
   * returns zbuf for gameplay hit tests (also exposed as E.zbuf)
   */
  function render(view, map, lights, sprites) {
    var horizon = (BH >> 1) + (view.pitch || 0);
    var i, x, y;
    var ftex = E.textures[map.floorTex] || E.textures._flat;
    var ctex = E.textures[map.ceilTex || 'ceil'] || E.textures._flat;

    // ceiling: dark base (per-column texture strips drawn in the wall loop)
    bctx.fillStyle = '#070510';
    bctx.fillRect(0, 0, BW, horizon + 1);

    // floor: flat dark base (per-column texture strips drawn in the wall loop)
    bctx.fillStyle = '#0a0810';
    bctx.fillRect(0, horizon + 1, BW, BH - horizon);

    // walls
    for (x = 0; x < BW; x++) {
      var ra = view.ang + colAngles[x];
      var r = castRay(map.grid, map.w, view.x, view.y, ra);
      var perp = r.dist * Math.cos(colAngles[x]);
      zbuf[x] = perp;
      var lineH = Math.min(BH * 3, (BH / perp));
      var y0 = horizon - lineH / 2;
      var tname = map.texFor ? map.texFor(r.cell) : map.wallTex;
      var t = E.textures[tname] || E.textures._flat;
      // animated (2-frame) textures swap on the engine clock
      if (t.length) t = t[Math.floor((view.time || 0) * 2.4) % t.length];
      var sx = Math.floor(r.texX * TEX);
      // unmirror on y-sides for variety
      if (r.side === 1) sx = TEX - 1 - sx;
      bctx.drawImage(t, sx, 0, 1, TEX, x, y0, 1, lineH);
      // dynamic light + distance shade
      var li = lightAt(lights, view.flash || 0, r.hx, r.hy, perp);
      var dark = 1 - Math.min(1, li);
      if (r.side === 1) dark = Math.min(1, dark + 0.12);
      if (dark > 0.02) {
        bctx.fillStyle = shadeStr(dark);
        bctx.fillRect(x, y0, 1, lineH);
      }
      // subtle red shift very close (claustrophobia)
      if (perp < 1.2) {
        bctx.fillStyle = 'rgba(60,0,0,' + (0.10 * (1 - perp / 1.2)).toFixed(2) + ')';
        bctx.fillRect(x, y0, 1, lineH);
      }
      var fsx = Math.floor(r.texX * TEX);   // texture column for floor/ceiling strips
      // ceiling strip for this column (mirrors the floor)
      if (y0 > 0) {
        var cy0 = Math.max(0, y0);
        bctx.drawImage(ctex, fsx, 0, 1, TEX, x, 0, 1, cy0);
        var cdark = Math.min(1, dark + 0.25);   // ceilings run darker
        if (cdark > 0.02) {
          bctx.fillStyle = shadeStr(cdark);
          bctx.fillRect(x, 0, 1, cy0);
        }
      }
      // floor strip for this column: textured, shaded by the same light.
      // (Per-column cost — the per-pixel floor loop was the mobile frame-killer.)
      var fb = y0 + lineH;
      if (fb < BH) {
        if (fb < horizon + 1) fb = horizon + 1;
        bctx.drawImage(ftex, fsx, 0, 1, TEX, x, fb, 1, BH - fb);
        if (dark > 0.02) {
          bctx.fillStyle = shadeStr(dark);
          bctx.fillRect(x, fb, 1, BH - fb);
        }
      }
    }

    // sprites, far -> near (caller sorts)
    for (i = 0; i < sprites.length; i++) {
      drawSprite(sprites[i], view, horizon, lights);
    }
    E.zbuf = zbuf;
    return buf;
  }
  E.render = render;

  function drawSprite(s, view, horizon, lights) {
    var dx = s.x - view.x, dy = s.y - view.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.35) return;   // inside the near plane: would balloon to fill the screen
    var ang = Math.atan2(dy, dx) - view.ang;
    while (ang > Math.PI) ang -= 2 * Math.PI;
    while (ang < -Math.PI) ang += 2 * Math.PI;
    if (Math.abs(ang) > FOV / 2 + 0.35) return;
    var sx = (0.5 + 0.5 * Math.tan(ang) / Math.tan(FOV / 2)) * BW;
    var size = Math.abs(BH / dist) * (s.scale || 1);
    if (size > BH * 1.1) size = BH * 1.1;   // cap: no screen-filling smears
    // fade out inside lunge range instead of smearing (the shake + red flash sells the hit)
    var closeFade = clamp((dist - 0.35) / 0.55, 0, 1);
    var vMove = (s.vMove || 0) / dist;
    var yTop = horizon - size / 2 + vMove + (s.yOff || 0) * (BH / dist) * 0.1;
    // per-column z-test draw
    var tex = s.tex;
    var x0 = Math.floor(sx - size / 2), x1 = Math.ceil(sx + size / 2);
    var li = lightAt(lights, view.flash || 0, s.x, s.y, dist);
    // sprites stay a touch brighter than walls: threats must read in the dark
    var dark = (1 - Math.min(1, li)) * 0.72;
    var alpha = (s.alpha != null ? s.alpha : 1) * closeFade;
    if (alpha <= 0.01) return;
    bctx.globalAlpha = alpha;
    for (var x = Math.max(0, x0); x < Math.min(BW, x1); x++) {
      if (zbuf[x] <= dist * 0.98) continue;      // occluded by wall
      var tx = (x - x0) / (x1 - x0);
      var sw = tex.width;
      bctx.drawImage(tex, Math.floor(tx * sw), 0, 1, tex.height, x, yTop, 1, size);
      if (dark > 0.03) {
        bctx.fillStyle = shadeStr(dark);
        bctx.fillRect(x, yTop, 1, size);
      }
    }
    bctx.globalAlpha = 1;
    if (s.hitFlash > 0) { /* white hit flash handled by game via alt tex */ }
  }

  /* Blit buffer to the real canvas with cover-fit, then post FX hooks. */
  function present(ctx, cw, ch, fx) {
    // cover-fit
    var s = Math.max(cw / BW, ch / BH);
    var dw = BW * s, dh = BH * s;
    ctx.imageSmoothingEnabled = false;   // chunky retro upscale
    ctx.drawImage(buf, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    if (fx) fx(ctx, cw, ch);
  }
  E.present = present;
  E.bufSize = function () { return { w: BW, h: BH }; };
})();
