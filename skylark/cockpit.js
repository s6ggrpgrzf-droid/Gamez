/* Skylark cockpit — 3D cockpit view. Hand-rolled perspective projection,
 * flat-shaded quads, zero dependencies. Stylized to match the golden-hour
 * pixel aesthetic. Toggleable view: external (side) or cockpit (forward).
 *
 * This is NOT Three.js by design: a 600KB library for a dashboard with
 * 6 dials is overkill. ~120 lines of projection gives us the exact
 * stylized look with ~90 draw calls.
 */
'use strict';
var CKPT = (function () {

  /* ---------- tiny 3D engine ---------- */
  var CAM = { x: 0, y: 0.30, z: -0.9, focal: 760, cx: 0, cy: 0 };
  function proj(g, x, y, z) {
    var dz = Math.max(0.05, z - CAM.z);
    var f = CAM.focal / dz;
    return { x: CAM.cx + (x - CAM.x) * f, y: CAM.cy - (y - CAM.y) * f, s: f };
  }
  function quad(p1, p2, p3, p4, fill) {
    return { wpts: [p1, p2, p3, p4], fill: fill,
             z: (p1[2] + p2[2] + p3[2] + p4[2]) / 4 };
  }
  function drawQuad(g, q) {
    var a = proj(g, q.wpts[0][0], q.wpts[0][1], q.wpts[0][2]),
        b = proj(g, q.wpts[1][0], q.wpts[1][1], q.wpts[1][2]),
        c = proj(g, q.wpts[2][0], q.wpts[2][1], q.wpts[2][2]),
        d = proj(g, q.wpts[3][0], q.wpts[3][1], q.wpts[3][2]);
    g.fillStyle = q.fill;
    g.beginPath();
    g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
    g.lineTo(c.x, c.y); g.lineTo(d.x, d.y);
    g.closePath(); g.fill();
  }

  /* ---------- materials (golden-hour cockpit) ---------- */
  var M = {
    dash: '#4a3220', dashHi: '#5d4028', glareshield: '#2e1f14',
    frame: '#3a2818', brass: '#c9962e', leather: '#6b4a2e',
  };
  var PANEL_Z = 1.15, PANEL_TILT = 0.22;

  var GAUGES = [
    { id: 'asi', label: 'AIRSPEED', x: -0.29, y: 0.0 },
    { id: 'ahi', label: 'ATTITUDE', x: -0.10, y: 0.0 },
    { id: 'alt', label: 'ALT', x: 0.10, y: 0.0 },
    { id: 'tcn', label: 'BEACON', x: 0.29, y: 0.0 },
    { id: 'vsi', label: 'V/S', x: -0.19, y: -0.20 },
    { id: 'thr', label: 'THR', x: 0.19, y: -0.20 },
  ];

  function panelPoint(gx, gy) {
    return [gx, gy * Math.cos(PANEL_TILT) - 0.02, PANEL_Z - gy * Math.sin(PANEL_TILT)];
  }

  function buildCockpit() {
    var quads = [];
    quads.push(quad([-0.40, -0.38, PANEL_Z + 0.06], [0.40, -0.38, PANEL_Z + 0.06],
                    [0.40, 0.10, PANEL_Z - 0.03], [-0.40, 0.10, PANEL_Z - 0.03], M.dash));
    quads.push(quad([-0.42, 0.10, PANEL_Z - 0.03], [0.42, 0.10, PANEL_Z - 0.03],
                    [0.42, 0.15, PANEL_Z - 0.14], [-0.42, 0.15, PANEL_Z - 0.14], M.glareshield));
    quads.push(quad([-0.28, -0.75, PANEL_Z + 0.12], [0.28, -0.75, PANEL_Z + 0.12],
                    [0.28, -0.38, PANEL_Z + 0.06], [-0.28, -0.38, PANEL_Z + 0.06], M.dashHi));
    // windshield pillars
    quads.push(quad([-1.05, -0.5, 0.9], [-0.92, -0.5, 0.9],
                    [-0.68, 1.3, 2.8], [-0.82, 1.3, 2.8], M.frame));
    quads.push(quad([0.92, -0.5, 0.9], [1.05, -0.5, 0.9],
                    [0.82, 1.3, 2.8], [0.68, 1.3, 2.8], M.frame));
    quads.push(quad([-0.82, 1.3, 2.8], [0.82, 1.3, 2.8],
                    [0.82, 1.44, 2.8], [-0.82, 1.44, 2.8], M.frame));
    quads.push(quad([-0.025, 0.15, 1.4], [0.025, 0.15, 1.4],
                    [0.025, 1.3, 2.8], [-0.025, 1.3, 2.8], M.frame));
    // brass trim strip across the panel
    quads.push(quad([-0.40, -0.02, PANEL_Z + 0.015], [0.40, -0.02, PANEL_Z + 0.015],
                    [0.40, 0.0, PANEL_Z + 0.005], [-0.40, 0.0, PANEL_Z + 0.005], M.brass));
    return quads;
  }

  /* ---------- gauges ---------- */
  function drawGauge(g, gd, st) {
    var wp = panelPoint(gd.x, gd.y);
    var s = proj(g, wp[0], wp[1], wp[2]);
    var r = Math.max(18, 46 * s.s / (CAM.focal / PANEL_Z));
    var x = s.x, y = s.y;
    g.fillStyle = '#1c1410';
    g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill();
    g.fillStyle = '#f5ecd8';
    g.beginPath(); g.arc(x, y, r - 2.5, 0, 6.29); g.fill();
    g.fillStyle = '#2b1d12'; g.textAlign = 'center';
    g.font = Math.max(6, r * 0.14) + 'px monospace';
    g.fillText(gd.label, x, y + r * 0.58);
    var needle = function (ang, len, col, w) {
      g.strokeStyle = col || '#c94f38'; g.lineWidth = w || 2;
      g.beginPath(); g.moveTo(x, y);
      g.lineTo(x + Math.sin(ang) * r * len, y - Math.cos(ang) * r * len); g.stroke();
    };
    var tick = function (ang, l0, l1) {
      g.strokeStyle = '#2b1d12'; g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x + Math.sin(ang) * r * l0, y - Math.cos(ang) * r * l0);
      g.lineTo(x + Math.sin(ang) * r * l1, y - Math.cos(ang) * r * l1);
      g.stroke();
    };
    var i, a;
    if (gd.id === 'asi') {
      for (i = 0; i <= 10; i++) tick(-2.4 + i * 0.48, 0.78, 0.9);
      needle(-2.4 + Math.min(1, st.speed / 140) * 4.8, 0.72);
      g.fillStyle = '#2b1d12'; g.font = 'bold ' + Math.max(8, r * 0.2) + 'px monospace';
      g.fillText(Math.round(st.speed), x, y - r * 0.28);
    } else if (gd.id === 'alt') {
      for (i = 0; i <= 10; i++) tick(-2.4 + i * 0.48, 0.78, 0.9);
      needle(-2.4 + ((st.alt * 3) % 1000 / 1000) * 4.8, 0.72);
      g.fillStyle = '#2b1d12'; g.font = 'bold ' + Math.max(8, r * 0.2) + 'px monospace';
      g.fillText(Math.round(st.alt * 3), x, y - r * 0.28);
    } else if (gd.id === 'ahi') {
      g.save();
      g.beginPath(); g.arc(x, y, r - 2.5, 0, 6.29); g.clip();
      var bank = (st.bank || 0) * 0.6, pitch = (st.pitch || 0) * r * 1.1;
      g.translate(x, y); g.rotate(bank); g.translate(0, pitch);
      g.fillStyle = '#7fb2d9'; g.fillRect(-r, -r * 2, r * 2, r * 2);
      g.fillStyle = '#a06a3c'; g.fillRect(-r, 0, r * 2, r * 2);
      g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-r, 0); g.lineTo(r, 0); g.stroke();
      g.restore();
      g.strokeStyle = '#c9962e'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(x - r * 0.5, y); g.lineTo(x + r * 0.5, y); g.stroke();
      g.fillStyle = '#2b1d12';
      g.beginPath(); g.arc(x, y, 2.5, 0, 6.29); g.fill();
    } else if (gd.id === 'tcn') {
      for (i = 0; i < 12; i++) tick(i * Math.PI / 6, 0.8, 0.9);
      g.fillStyle = '#2b1d12'; g.fillText('N', x, y - r * 0.6);
      var ahead = (st.destX - st.x) > 0;
      needle(ahead ? 0.25 : -2.9, 0.8, '#2e8b8b', 2.5);
      g.fillStyle = '#2b1d12';
      g.beginPath(); g.arc(x, y, 2.5, 0, 6.29); g.fill();
    } else if (gd.id === 'vsi') {
      for (i = 0; i <= 8; i++) tick(-2.0 + i * 0.5, 0.78, 0.9);
      needle(Math.max(-1, Math.min(1, (st.vspeed || 0) / 25)) * 2.0, 0.72);
    } else if (gd.id === 'thr') {
      for (i = 0; i <= 5; i++) tick(-2.0 + i * 0.8, 0.78, 0.9);
      needle(-2.0 + (st.throttle || 0) * 4.0, 0.72, '#2e8b8b');
    }
  }

  /* ---------- yoke ---------- */
  function drawYoke(g, input) {
    var pitch = (input.pitch || 0) * 0.10, roll = (input.lateral || 0) * 0.22;
    var cx = 0, cy = -0.42 - pitch, cz = 0.92;
    drawQuad(g, quad([cx - 0.025, cy - 0.22, cz], [cx + 0.025, cy - 0.22, cz],
                     [cx + 0.025, cy, cz], [cx - 0.025, cy, cz], M.frame));
    var w = 0.17, c = Math.cos(roll), s2 = Math.sin(roll);
    function wpt(lx, ly) {
      return [cx + lx * c - ly * s2, cy + lx * s2 + ly * c, cz];
    }
    drawQuad(g, quad(wpt(-w, 0.04), wpt(-w + 0.04, 0.04), wpt(-w + 0.04, -0.04), wpt(-w, -0.04), M.leather));
    drawQuad(g, quad(wpt(w - 0.04, 0.04), wpt(w, 0.04), wpt(w, -0.04), wpt(w - 0.04, -0.04), M.leather));
    drawQuad(g, quad(wpt(-0.05, 0.05), wpt(0.05, 0.05), wpt(0.05, -0.05), wpt(-0.05, -0.05), M.brass));
  }

  /* ---------- forward view ---------- */
  function drawForwardView(g, W, H, st, vista) {
    var pal = (vista && vista.sky) || null;
    var sky = g.createLinearGradient(0, 0, 0, H * 0.58);
    if (pal) {
      sky.addColorStop(0, pal[0]); sky.addColorStop(0.5, pal[1]); sky.addColorStop(1, pal[2]);
    } else {
      sky.addColorStop(0, '#3a2b52'); sky.addColorStop(0.5, '#a34a5e'); sky.addColorStop(1, '#f2a35e');
    }
    g.fillStyle = sky; g.fillRect(0, 0, W, H * 0.58);
    // sun
    var sunX = W * 0.62, sunY = H * 0.30;
    var sg = g.createRadialGradient(sunX, sunY, 4, sunX, sunY, 80);
    sg.addColorStop(0, 'rgba(255,240,200,.9)'); sg.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = sg; g.fillRect(sunX - 80, sunY - 80, 160, 160);
    g.fillStyle = '#ffedb8';
    g.beginPath(); g.arc(sunX, sunY, 22, 0, 6.29); g.fill();
    // mountains (parallax)
    g.fillStyle = '#5e4a68';
    g.beginPath(); g.moveTo(0, H * 0.58);
    for (var x = 0; x <= W; x += 24) {
      var mx = x + st.x * 0.015;
      g.lineTo(x, H * 0.58 - 30 - 45 * Math.abs(Math.sin(mx * 0.004)) - 18 * Math.abs(Math.sin(mx * 0.013 + 2)));
    }
    g.lineTo(W, H * 0.58); g.closePath(); g.fill();
    g.fillStyle = '#463655';
    g.beginPath(); g.moveTo(0, H * 0.58);
    for (var x2 = 0; x2 <= W; x2 += 24) {
      var nx = x2 + st.x * 0.05;
      g.lineTo(x2, H * 0.58 - 8 - 26 * Math.abs(Math.sin(nx * 0.008 + 1)));
    }
    g.lineTo(W, H * 0.58); g.closePath(); g.fill();
    // ground
    var gr = g.createLinearGradient(0, H * 0.58, 0, H);
    gr.addColorStop(0, '#7a8a5a'); gr.addColorStop(1, '#42503a');
    g.fillStyle = gr; g.fillRect(0, H * 0.58, W, H * 0.42);
    // runway ahead (perspective)
    var dDest = st.destX - st.x;
    if (dDest > -400 && dDest < 7000 && st.phase !== 'takeoff') {
      var near = Math.max(0.02, 1 - dDest / 7000);
      var rw = 24 + near * 200, fw = 6 + near * 26;
      var yB = H * 0.64, yF = H * 0.585 - near * 4;
      var cxp = W / 2 - (st.lat || 0) * W * 0.25 * near;
      g.fillStyle = '#3d3d42';
      g.beginPath();
      g.moveTo(cxp - rw / 2, yB); g.lineTo(cxp + rw / 2, yB);
      g.lineTo(cxp + fw / 2, yF); g.lineTo(cxp - fw / 2, yF);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(232,224,204,.9)';
      for (var di = 0; di < 4; di++) {
        var f = di / 4, yy = yB + (yF - yB) * f;
        g.fillRect(cxp - 1.5, yy - 2, 3, 6);
      }
      // PAPI lights: 4 dots beside threshold, red/white by glideslope
      if (st.papiW != null) {
        for (var pi = 0; pi < 4; pi++) {
          var white = pi < st.papiW;
          g.fillStyle = white ? '#fff' : '#f44';
          g.beginPath(); g.arc(cxp + rw / 2 + 10 + pi * 9, yB - 6, 3.5, 0, 6.29); g.fill();
        }
      }
    }
  }

  /* ---------- main render ---------- */
  var COCKPIT = null;
  function render(g, W, H, st, input, vista) {
    CAM.cx = W / 2; CAM.cy = H * 0.50;
    if (!COCKPIT) COCKPIT = buildCockpit();
    drawForwardView(g, W, H, st, vista);
    var qs = COCKPIT.slice().sort(function (a, b) { return b.z - a.z; });
    for (var i = 0; i < qs.length; i++) drawQuad(g, qs[i]);
    drawYoke(g, input);
    for (var gi = 0; gi < GAUGES.length; gi++) drawGauge(g, GAUGES[gi], st);
  }

  return { render: render };
})();

if (typeof module !== 'undefined') module.exports = CKPT;
