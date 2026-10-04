/* MagicEngine — painterly stroke planner for Canvas Magic.
 *
 * The AI worker dreams up the painting; this engine performs it the way a
 * real painter would: it studies the picture (luminance, edges, color
 * regions), then plans intentional brushstrokes in a painter's order:
 *
 *   1. washes   — broad, confident strokes that lay in the big shapes
 *   2. forms    — strokes that flow ALONG the picture's forms, following
 *                 the local orientation field (perpendicular to edges)
 *   3. details  — short strokes placed only where the picture has edges
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

  /* Trace a stroke through the orientation field, both directions from the
   * seed, stopping at form boundaries (color change) or max length. */
  function traceStroke(f, sx, sy, opt) {
    function walk(ix, iy, dx, dy) {
      var pts = [];
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
        pts.push({ x: cx, y: cy, a: Math.atan2(dy, dx) });
      }
      return { pts: pts, dx: dx, dy: dy };
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
    return pts;
  }

  function plan(srcCanvas, w, h) {
    var f = buildField(srcCanvas, w, h);
    var M = Math.max(w, h);
    var strokes = [];
    var totalDabs = 0;

    var passes = [
      // washes: broad confident strokes, thin paint, generous overlap
      { r: M / 11, alpha: 0.5, gap: 1.25, maxSteps: 24, colorTol: 95, mode: 'grid' },
      // forms: follow the picture's own directions
      { r: M / 26, alpha: 0.8, gap: 1.15, maxSteps: 13, colorTol: 70, mode: 'grid' },
      // details: short strokes only where there are edges to honor
      { r: M / 58, alpha: 1.0, gap: 1.0, maxSteps: 6, colorTol: 55, mode: 'edges' }
    ];

    for (var p = 0; p < passes.length; p++) {
      var P = passes[p];
      var r = P.r, step = r * 0.9;
      var cell = Math.max(2, r * 1.1);
      var gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
      var covered = new Uint8Array(gw * gh);
      function isCovered(x, y) {
        var cx = Math.max(0, Math.min(gw - 1, Math.floor(x / cell)));
        var cy = Math.max(0, Math.min(gh - 1, Math.floor(y / cell)));
        return covered[cy * gw + cx] === 1;
      }
      function cover(x, y) {
        var cx = Math.max(0, Math.min(gw - 1, Math.floor(x / cell)));
        var cy = Math.max(0, Math.min(gh - 1, Math.floor(y / cell)));
        covered[cy * gw + cx] = 1;
      }

      // gather seeds
      var seeds = [];
      if (P.mode === 'grid') {
        var gs = r * P.gap;
        for (var yy = gs * 0.5; yy < h; yy += gs)
          for (var xx = gs * 0.5; xx < w; xx += gs)
            seeds.push({
              x: xx + (Math.random() - 0.5) * gs * 0.7,
              y: yy + (Math.random() - 0.5) * gs * 0.7
            });
      } else {
        // detail seeds: random points that land on real edges
        var tries = 0;
        while (seeds.length < 260 && tries < 4000) {
          tries++;
          var ex = Math.random() * w, ey = Math.random() * h;
          if (fieldMag(f, ex, ey) > f.meanMag * 0.9)
            seeds.push({ x: ex, y: ey });
        }
      }
      // painters often work top-down; bias the order that way with jitter
      seeds.sort(function (a, b) {
        return (a.y + Math.random() * h * 0.35) - (b.y + Math.random() * h * 0.35);
      });

      for (var s = 0; s < seeds.length; s++) {
        var sd = seeds[s];
        if (isCovered(sd.x, sd.y)) continue;
        var pts = traceStroke(f, sd.x, sd.y, {
          r: r, step: step, maxSteps: P.maxSteps, colorTol: P.colorTol
        });
        if (pts.length < 2) continue;
        for (var k = 0; k < pts.length; k++) cover(pts[k].x, pts[k].y);
        strokes.push({
          pts: pts,
          r: r * (0.9 + Math.random() * 0.2),
          a: Math.max(0.25, Math.min(1, P.alpha * (0.9 + Math.random() * 0.2)))
        });
        totalDabs += pts.length;
      }
    }

    return { strokes: strokes, w: w, h: h, totalDabs: totalDabs };
  }

  return { plan: plan };
})();
