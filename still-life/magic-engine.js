/* MagicEngine — painterly stroke planner for Canvas Magic.
 *
 * The AI worker dreams up the painting; this engine performs it the way
 * Bob Ross painted: it studies the picture (luminance, edges, color
 * regions), then works his order —
 *
 *   1. liquid white  — a thin wet glaze over the whole canvas
 *   2. the sky       — broad washes, top down
 *   3. the distance  — background first: smooth, far regions before busy ones
 *   4. details       — dark to light, the way Ross layered ("a thin paint
 *                      sticks to a thick paint; the lightest lights last")
 *   5. highlights    — tiny bright touches on the brightest areas, last
 *
 * Sketch style skips the paint and works like a drawing: contours first,
 * then shading, dark to light, paper showing through.
 *
 * Each stroke is a curved path of dab positions with per-point angles, so
 * the client can draw it progressively and move the brush visibly between
 * strokes, pausing a beat before each one like it's deciding where to go.
 */
var MagicEngine = (function () {
  'use strict';

  /* Low-res luminance + color + Sobel orientation field. */
  function buildField(src, w, h) {
    var FW = 120;
    var FH = Math.max(8, Math.round(FW * h / w));
    var c = document.createElement('canvas');
    c.width = FW; c.height = FH;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(src, 0, 0, FW, FH);
    var d = x.getImageData(0, 0, FW, FH).data;
    var n = FW * FH;
    var lum = new Float32Array(n);
    for (var i = 0; i < n; i++)
      lum[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;

    // one 3x3 smoothing pass to calm sensor noise
    var sm = new Float32Array(n);
    for (var yy = 0; yy < FH; yy++) for (var xx = 0; xx < FW; xx++) {
      var acc = 0, cnt = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var qx = xx + dx, qy = yy + dy;
        if (qx < 0 || qy < 0 || qx >= FW || qy >= FH) continue;
        acc += lum[qy * FW + qx]; cnt++;
      }
      sm[yy * FW + xx] = acc / cnt;
    }

    var ang = new Float32Array(n);
    var mag = new Float32Array(n);
    var magSum = 0;
    for (var y = 1; y < FH - 1; y++) for (var x2 = 1; x2 < FW - 1; x2++) {
      var i00 = (y - 1) * FW + x2 - 1;
      var gx = -sm[i00] - 2 * sm[i00 + FW] - sm[i00 + 2 * FW] +
                sm[i00 + 2] + 2 * sm[i00 + FW + 2] + sm[i00 + 2 * FW + 2];
      var gy = -sm[i00] - 2 * sm[i00 + 1] - sm[i00 + 2] +
                sm[i00 + 2 * FW] + 2 * sm[i00 + 2 * FW + 1] + sm[i00 + 2 * FW + 2];
      var idx = y * FW + x2;
      mag[idx] = Math.sqrt(gx * gx + gy * gy);
      magSum += mag[idx];
      // stroke flows ALONG the form, i.e. perpendicular to the gradient
      ang[idx] = Math.atan2(gy, gx) + Math.PI / 2;
    }
    return {
      fw: FW, fh: FH, w: w, h: h,
      ang: ang, mag: mag, meanMag: magSum / n,
      rgb: d // low-res color buffer for colorAt()
    };
  }

  function cellAt(f, x, y) {
    var ix = Math.max(0, Math.min(f.fw - 1, Math.round(x / f.w * f.fw)));
    var iy = Math.max(0, Math.min(f.fh - 1, Math.round(y / f.h * f.fh)));
    return iy * f.fw + ix;
  }

  function fieldAngle(f, x, y) { return f.ang[cellAt(f, x, y)]; }
  function fieldMag(f, x, y) { return f.mag[cellAt(f, x, y)]; }

  function colorAt(f, x, y) {
    var i = cellAt(f, x, y) * 4;
    return [f.rgb[i], f.rgb[i + 1], f.rgb[i + 2]];
  }

  function lumAt(f, x, y) {
    var cc = colorAt(f, x, y);
    return (cc[0] + cc[1] + cc[2]) / 3;
  }

  /* Trace a stroke through the orientation field, both directions from the
   * seed, stopping at form boundaries (color change) or max length. */
  function traceStroke(f, sx, sy, opt) {
    function walk(ix, iy, dx, dy) {
      var pts = [], magSum = 0, lumSum = 0;
      var base = colorAt(f, sx, sy);
      var cx = ix, cy = iy;
      for (var i = 0; i < opt.maxSteps; i++) {
        var fa = fieldAngle(f, cx, cy);
        var fx = Math.cos(fa), fy = Math.sin(fa);
        if (fx * dx + fy * dy < 0) { fx = -fx; fy = -fy; }
        dx = dx * 0.65 + fx * 0.35;
        dy = dy * 0.65 + fy * 0.35;
        var m = Math.sqrt(dx * dx + dy * dy) || 1;
        dx /= m; dy /= m;
        cx += dx * opt.step; cy += dy * opt.step;
        if (cx < -opt.r || cy < -opt.r || cx > f.w + opt.r || cy > f.h + opt.r) break;
        var cc = colorAt(f, cx, cy);
        var dist = Math.abs(cc[0] - base[0]) + Math.abs(cc[1] - base[1]) + Math.abs(cc[2] - base[2]);
        if (dist > opt.colorTol) break;
        magSum += fieldMag(f, cx, cy);
        lumSum += (cc[0] + cc[1] + cc[2]) / 3;
        pts.push({ x: cx, y: cy, a: Math.atan2(dy, dx) });
      }
      return { pts: pts, magSum: magSum, lumSum: lumSum };
    }
    var a0 = fieldAngle(f, sx, sy);
    var fwd = walk(sx, sy, Math.cos(a0), Math.sin(a0));
    var bwd = walk(sx, sy, -Math.cos(a0), -Math.sin(a0));
    var pts = bwd.pts.reverse();
    pts.push({ x: sx, y: sy, a: a0 });
    for (var i = 0; i < fwd.pts.length; i++) pts.push(fwd.pts[i]);
    // smooth the per-point angles so the brush doesn't jitter
    for (var j = 1; j < pts.length - 1; j++) {
      var p0 = pts[j - 1], p1 = pts[j + 1];
      pts[j].a = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    }
    var n = pts.length;
    var meanMag = (bwd.magSum + fwd.magSum + fieldMag(f, sx, sy)) / n;
    var meanLum = (bwd.lumSum + fwd.lumSum + lumAt(f, sx, sy)) / n;
    return { pts: pts, meanMag: meanMag, meanLum: meanLum };
  }

  function plan(srcCanvas, w, h, style) {
    style = (style === 'sketch') ? 'sketch' : 'paint';
    var f = buildField(srcCanvas, w, h);
    var M = Math.max(w, h);
    var strokes = [];
    var totalDabs = 0;

    function runPass(cfg) {
      var r = cfg.r, step = r * 0.9;
      var cell = Math.max(2, r * 1.1);
      var gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
      var covered = new Uint8Array(gw * gh);
      function cover(x, y) {
        var cx = Math.max(0, Math.min(gw - 1, Math.floor(x / cell)));
        var cy = Math.max(0, Math.min(gh - 1, Math.floor(y / cell)));
        covered[cy * gw + cx] = 1;
      }
      function isCovered(x, y) {
        var cx = Math.max(0, Math.min(gw - 1, Math.floor(x / cell)));
        var cy = Math.max(0, Math.min(gh - 1, Math.floor(y / cell)));
        return covered[cy * gw + cx] === 1;
      }
      var seeds = [];
      if (cfg.mode === 'grid') {
        var gs = r * cfg.gap;
        for (var yy = gs * 0.5; yy < h; yy += gs)
          for (var xx = gs * 0.5; xx < w; xx += gs)
            seeds.push({ x: xx + (Math.random() - 0.5) * gs * 0.7, y: yy + (Math.random() - 0.5) * gs * 0.7 });
      } else {
        var tries = 0, target = cfg.seedTarget || 200;
        while (seeds.length < target && tries < 6000) {
          tries++;
          var ex = Math.random() * w, ey = Math.random() * h;
          if (cfg.mode === 'edges') {
            if (fieldMag(f, ex, ey) > f.meanMag * 0.9) seeds.push({ x: ex, y: ey });
          } else if (cfg.mode === 'bright') {
            if (lumAt(f, ex, ey) > cfg.lumThresh) seeds.push({ x: ex, y: ey });
          }
        }
      }
      var passStrokes = [];
      for (var s = 0; s < seeds.length; s++) {
        var sd = seeds[s];
        if (!cfg.flat && isCovered(sd.x, sd.y)) continue;
        var tr = traceStroke(f, sd.x, sd.y, {
          r: r, step: step, maxSteps: cfg.maxSteps, colorTol: cfg.colorTol
        });
        if (tr.pts.length < (cfg.flat ? 1 : 2)) continue;
        for (var k = 0; k < tr.pts.length; k++) cover(tr.pts[k].x, tr.pts[k].y);
        var cySum = 0;
        for (var m = 0; m < tr.pts.length; m++) cySum += tr.pts[m].y;
        passStrokes.push({
          pts: tr.pts,
          r: r * (0.9 + Math.random() * 0.2),
          a: Math.max(0.2, Math.min(1, cfg.alpha * (0.9 + Math.random() * 0.2))),
          passName: cfg.passName,
          flat: cfg.flat || null,
          bg: tr.meanMag,    // edge energy: low = background
          lum: tr.meanLum,    // mean luminance: dark first, lights last
          cy: cySum / tr.pts.length
        });
      }
      // Bob Ross ordering within the pass
      if (cfg.sort === 'y') passStrokes.sort(function (a, b) { return a.cy - b.cy; });
      else if (cfg.sort === 'bg') passStrokes.sort(function (a, b) { return a.bg - b.bg; });
      else if (cfg.sort === 'lum') passStrokes.sort(function (a, b) { return a.lum - b.lum; });
      for (var i = 0; i < passStrokes.length; i++) {
        strokes.push(passStrokes[i]);
        totalDabs += passStrokes[i].pts.length;
      }
    }

    if (style === 'paint') {
      // 1. liquid white: a thin wet glaze over everything, left wet
      runPass({
        r: M / 6, alpha: 0.14, gap: 2.2, maxSteps: 10, colorTol: 1e9, mode: 'grid',
        passName: 'Laying down liquid white…', flat: '#fdfbf4', sort: 'y'
      });
      // 2. the almighty sky, top down
      runPass({
        r: M / 11, alpha: 0.5, gap: 1.25, maxSteps: 24, colorTol: 95, mode: 'grid',
        passName: 'Painting the sky…', sort: 'y'
      });
      // 3. background first: far, quiet regions before busy foreground
      runPass({
        r: M / 26, alpha: 0.8, gap: 1.15, maxSteps: 13, colorTol: 70, mode: 'grid',
        passName: 'Blocking in the distance…', sort: 'bg'
      });
      // 4. details, dark to light — thin paint sticks to thick paint
      runPass({
        r: M / 58, alpha: 1.0, gap: 1.0, maxSteps: 6, colorTol: 55,
        mode: 'edges', seedTarget: 260,
        passName: 'Details, dark to light…', sort: 'lum'
      });
      // 5. the lightest lights go on last
      runPass({
        r: M / 95, alpha: 0.95, gap: 1.0, maxSteps: 3, colorTol: 60,
        mode: 'bright', seedTarget: 120, lumThresh: 165,
        passName: 'Final highlights…'
      });
    } else {
      // sketch: contours first, then shading — dark to light, paper showing through
      runPass({
        r: M / 70, alpha: 0.85, gap: 1.0, maxSteps: 16, colorTol: 60, mode: 'grid',
        passName: 'Sketching the contours…', sort: 'bg'
      });
      runPass({
        r: M / 150, alpha: 1.0, gap: 1.0, maxSteps: 5, colorTol: 50,
        mode: 'edges', seedTarget: 300,
        passName: 'Shading…', sort: 'lum'
      });
    }

    return { strokes: strokes, w: w, h: h, totalDabs: totalDabs, style: style };
  }

  return { plan: plan };
})();
