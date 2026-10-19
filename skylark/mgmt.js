/* Skylark mgmt — airline management UI: valley map, strips, jobs, fleet.
 * The Pocket Planes loop: own strips, load jobs, send planes, collect.
 */
'use strict';
/* globals SK, $, pilot, savePilot, money, AU, toast, show, showManifest, startFlightWithJobs */

var MGMT = (function () {
  var selStrip = null;      // strip detail being viewed
  var selJobs = [];         // job ids selected for a flight
  var selPlane = -1;        // fleet index selected

  /* ---------- arrivals: tick on load, show in a toast + hangar ---------- */
  function checkArrivals() {
    SK.ensureAirline(pilot);
    var arr = SK.tickAirline(pilot);
    if (arr.length) {
      savePilot();
      // show the latest as a toast; the rest wait in the hangar
      toast(arr[arr.length - 1].text);
    }
    return arr;
  }

  /* ---------- hangar: fleet status row ---------- */
  function renderFleetRow() {
    SK.ensureAirline(pilot);
    var el = $('fleet-row');
    el.innerHTML = '';
    var now = Date.now();
    pilot.fleet.forEach(function (f, i) {
      var d = document.createElement('div');
      d.className = 'fleet-card' + (f.status === 'enroute' ? ' enroute' : '');
      var status;
      if (f.status === 'enroute') {
        var mins = Math.max(1, Math.round((f.arriveAt - now) / 60000));
        status = '→ ' + SK.stripById(f.dest).name + ' · ' + mins + 'm';
      } else {
        status = 'at ' + SK.stripById(f.at).name + ' · ready';
      }
      d.innerHTML =
        '<div class="fc-name">' + SK.PLANES.filter(function (p) { return p.id === f.plane; })[0].name + '</div>' +
        '<div class="fc-status">' + status + '</div>';
      el.appendChild(d);
    });
    // inbox: recent arrivals
    if (pilot.inbox && pilot.inbox.length) {
      var ib = document.createElement('div');
      ib.className = 'inbox';
      var last = pilot.inbox.slice(-3).reverse();
      ib.innerHTML = last.map(function (m) {
        return '<div class="inbox-msg">' + m.text + '</div>';
      }).join('');
      el.appendChild(ib);
    }
  }

  /* ---------- valley map: Pocket-Planes-style flat cartoon ---------- */
  // tiny white top-down plane silhouette, facing -y, rotated by `ang`
  function miniPlane(g, x, y, ang, s) {
    g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s);
    g.fillStyle = '#ffffff'; g.strokeStyle = '#7a6238'; g.lineWidth = 1.6;
    g.lineJoin = 'round';
    // main wings
    g.beginPath();
    g.moveTo(-13, -1); g.lineTo(-3, -4); g.lineTo(-3, 2); g.lineTo(-13, 4);
    g.closePath(); g.fill(); g.stroke();
    g.beginPath();
    g.moveTo(13, -1); g.lineTo(3, -4); g.lineTo(3, 2); g.lineTo(13, 4);
    g.closePath(); g.fill(); g.stroke();
    // tail wings
    g.beginPath();
    g.moveTo(-7, 7); g.lineTo(-2, 6); g.lineTo(-2, 9); g.lineTo(-7, 10);
    g.closePath(); g.fill(); g.stroke();
    g.beginPath();
    g.moveTo(7, 7); g.lineTo(2, 6); g.lineTo(2, 9); g.lineTo(7, 10);
    g.closePath(); g.fill(); g.stroke();
    // fuselage
    g.beginPath();
    if (g.roundRect) g.roundRect(-3, -11, 6, 22, 3); else g.rect(-3, -11, 6, 22);
    g.fill(); g.stroke();
    // red tail tip (airline livery)
    g.fillStyle = '#d94f3d';
    g.beginPath(); g.arc(0, 9, 2.4, 0, 6.29); g.fill();
    g.restore();
  }
  // dark rounded label with white text, centered at (x, y)
  function mapLabel(g, x, y, text, bg) {
    g.font = '700 9px ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
    var w = g.measureText(text).width + 12;
    g.fillStyle = bg || '#2e3d4d';
    g.beginPath();
    if (g.roundRect) g.roundRect(x - w / 2, y - 8, w, 16, 8); else g.rect(x - w / 2, y - 8, w, 16);
    g.fill();
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, x, y + 0.5);
    g.textBaseline = 'alphabetic';
  }
  function renderMap() {
    SK.ensureAirline(pilot);
    $('map-money').textContent = money(pilot.money);
    var cv = $('map-canvas'), g = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    // meadow-green land base
    g.fillStyle = '#a3c96e'; g.fillRect(0, 0, W, H);
    // tan field patches (seeded, stable)
    g.fillStyle = '#d8bf7c';
    var fields = [[28, 90, 64, 40, 0.3], [250, 60, 70, 44, -0.2], [40, 330, 76, 42, 0.15],
                  [260, 340, 60, 40, -0.3], [150, 180, 56, 36, 0.2], [300, 180, 52, 60, 0.1]];
    fields.forEach(function (f) {
      g.save(); g.translate(f[0], f[1]); g.rotate(f[4]);
      g.beginPath();
      if (g.roundRect) g.roundRect(-f[2] / 2, -f[3] / 2, f[2], f[3], 10); else g.rect(-f[2] / 2, -f[3] / 2, f[2], f[3]);
      g.fill(); g.restore();
    });
    // winding river
    g.strokeStyle = '#5fb2e8'; g.lineWidth = 16; g.lineCap = 'round';
    g.beginPath(); g.moveTo(232, -10);
    g.bezierCurveTo(250, 80, 252, 140, 228, 200);
    g.bezierCurveTo(206, 258, 176, 300, 158, 360);
    g.bezierCurveTo(150, 392, 146, 410, 144, 430);
    g.stroke();
    g.strokeStyle = '#8fd4f5'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(232, -10);
    g.bezierCurveTo(250, 80, 252, 140, 228, 200);
    g.bezierCurveTo(206, 258, 176, 300, 158, 360);
    g.bezierCurveTo(150, 392, 146, 410, 144, 430);
    g.stroke();
    // little lake
    g.fillStyle = '#5fb2e8';
    g.beginPath(); g.ellipse(72, 312, 26, 18, 0.4, 0, 6.29); g.fill();
    g.fillStyle = '#8fd4f5';
    g.beginPath(); g.ellipse(66, 308, 12, 8, 0.4, 0, 6.29); g.fill();
    // pine clusters (seeded)
    g.fillStyle = '#5da24a';
    for (var pi = 0; pi < 46; pi++) {
      var px = (pi * 137 + 41) % W, py = (pi * 89 + 173) % H;
      // keep the river corridor mostly clear
      if (Math.abs(px - (232 - py * 0.22)) < 26) continue;
      g.beginPath(); g.arc(px, py, 3 + (pi % 3), 0, 6.29); g.fill();
      g.beginPath(); g.arc(px + 5, py + 3, 2.5, 0, 6.29); g.fill();
    }
    var now = Date.now();
    // enroute flights: dotted red route + white plane + label
    pilot.fleet.forEach(function (f) {
      if (f.status !== 'enroute') return;
      var a = SK.stripById(f.at), b = SK.stripById(f.dest);
      var ax = a.mx / 100 * W, ay = a.my / 100 * H;
      var bx = b.mx / 100 * W, by = b.my / 100 * H;
      var total = f.arriveAt - f.departAt, done = now - f.departAt;
      var t = Math.max(0, Math.min(1, done / total));
      var ex = ax + (bx - ax) * t, ey = ay + (by - ay) * t;
      g.strokeStyle = '#c25a44'; g.lineWidth = 2.5;
      g.setLineDash([2, 7]); g.lineCap = 'round';
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      g.setLineDash([]);
      var ang = Math.atan2(by - ay, bx - ax) + Math.PI / 2;
      miniPlane(g, ex, ey, ang, 0.85);
      var mins = Math.max(1, Math.round((f.arriveAt - now) / 60000));
      var pname = (SK.PLANES.filter(function (p) { return p.id === f.plane; })[0] || { name: 'Plane' }).name;
      mapLabel(g, ex, ey - 20, pname.toUpperCase() + ' · ' + mins + 'M');
    });
    // strips
    SK.STRIPS.forEach(function (s) {
      var x = s.mx / 100 * W, y = s.my / 100 * H;
      var owned = pilot.strips.indexOf(s.id) >= 0;
      // marker
      g.fillStyle = owned ? '#ffffff' : '#b9b3a6';
      g.strokeStyle = owned ? '#8a6d3b' : '#8a8478';
      g.lineWidth = 3;
      g.beginPath(); g.arc(x, y, 11, 0, 6.29); g.fill(); g.stroke();
      // runway stripe
      g.strokeStyle = owned ? '#d94f3d' : '#a09a8c'; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x - 5, y + 5); g.lineTo(x + 5, y - 5); g.stroke();
      // name label (small caps, PP style)
      g.font = '700 10px ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
      g.fillStyle = '#4a3b28'; g.textAlign = 'center';
      var nm = s.name.toUpperCase();
      // soft halo for readability
      g.fillStyle = 'rgba(255,255,255,.65)';
      g.fillText(nm, x + 1, y + 29);
      g.fillStyle = '#4a3b28';
      g.fillText(nm, x, y + 28);
      if (!owned) {
        g.font = '700 10px ui-rounded, system-ui, sans-serif';
        g.fillStyle = '#2e7d32';
        g.fillText(money(s.cost), x, y + 42);
      }
      // idle planes at this strip: tiny white planes
      var n = 0;
      pilot.fleet.forEach(function (f) {
        if (f.status === 'idle' && f.at === s.id) n++;
      });
      for (var k = 0; k < Math.min(n, 3); k++) miniPlane(g, x - 20 + k * 20, y - 24, 0.5, 0.55);
      if (n > 3) mapLabel(g, x, y - 24, '+' + (n - 3));
    });
    // tap handling
    cv.onclick = function (e) {
      var r = cv.getBoundingClientRect();
      var mx = (e.clientX - r.left) / r.width * W;
      var my = (e.clientY - r.top) / r.height * H;
      var best = null, bd = 1e9;
      SK.STRIPS.forEach(function (s) {
        var x = s.mx / 100 * W, y = s.my / 100 * H;
        var d = Math.hypot(mx - x, my - y);
        if (d < bd) { bd = d; best = s; }
      });
      if (best && bd < 30) { AU.click(); showStrip(best.id); }
    };
  }

  /* ---------- strip detail ---------- */
  function showStrip(id) {
    selStrip = id; selJobs = []; selPlane = -1;
    SK.ensureAirline(pilot);
    var s = SK.stripById(id);
    var owned = pilot.strips.indexOf(id) >= 0;
    $('sd-kicker').textContent = s.cls.toUpperCase() + ' STRIP';
    $('sd-name').textContent = s.name;
    $('sd-desc').textContent = s.desc;
    var bw = $('sd-buywrap');
    bw.innerHTML = '';
    if (!owned) {
      var b = document.createElement('button');
      b.className = 'buy-strip-btn';
      b.textContent = 'Buy this strip — ' + money(s.cost);
      b.addEventListener('click', function () {
        AU.click();
        var r = SK.buyStrip(pilot, id);
        if (r.ok) { savePilot(); AU.coin(); toast(s.name + ' is yours!'); showStrip(id); renderMap(); }
        else toast('Not enough yet — keep flying.');
      });
      bw.appendChild(b);
    }
    renderJobs();
    renderStripFleet();
    show('stripdetail');
  }

  function renderJobs() {
    SK.ensureAirline(pilot);
    var owned = pilot.strips.indexOf(selStrip) >= 0;
    var el = $('sd-jobs');
    el.innerHTML = '';
    $('sd-bonus').classList.add('hidden');
    if (!owned) { el.innerHTML = '<div class="job-empty">Buy this strip to see its jobs board.</div>'; return; }
    var jobs = SK.genJobs(selStrip, pilot.jobBucket).filter(function (j) { return !pilot.jobsTaken[j.id]; });
    if (!jobs.length) { el.innerHTML = '<div class="job-empty">All jobs taken — new ones soon.</div>'; return; }
    jobs.forEach(function (j) {
      var d = document.createElement('div');
      var sel = selJobs.indexOf(j.id) >= 0;
      d.className = 'job-card' + (sel ? ' sel' : '');
      d.innerHTML =
        '<div class="job-top"><span class="job-name">' + j.name + '</span>' +
        '<span class="job-pay">' + money(j.payout) + '</span></div>' +
        '<div class="job-story">' + j.story + '</div>' +
        '<div class="job-dest">→ ' + SK.stripById(j.dest).name + '</div>';
      d.addEventListener('click', function () {
        AU.click();
        var i = selJobs.indexOf(j.id);
        if (i >= 0) selJobs.splice(i, 1); else selJobs.push(j.id);
        renderJobs();
      });
      el.appendChild(d);
    });
    // bonus hint
    if (selJobs.length > 1) {
      var selObjs = jobs.filter(function (j) { return selJobs.indexOf(j.id) >= 0; });
      var pay = SK.flightPayout(selObjs);
      var bn = $('sd-bonus');
      bn.classList.remove('hidden');
      bn.textContent = pay.bonus
        ? 'Same destination — 25% bonus! Total ' + money(pay.total)
        : 'Mixed destinations — no bonus. Same strip = +25%.';
    }
  }

  function renderStripFleet() {
    SK.ensureAirline(pilot);
    var el = $('sd-fleet');
    el.innerHTML = '';
    var owned = pilot.strips.indexOf(selStrip) >= 0;
    if (!owned) return;
    pilot.fleet.forEach(function (f, i) {
      if (f.status !== 'idle' || f.at !== selStrip) return;
      var pl = SK.PLANES.filter(function (p) { return p.id === f.plane; })[0];
      var d = document.createElement('div');
      d.className = 'send-plane' + (selPlane === i ? ' sel' : '');
      d.innerHTML = '<div class="sp-name">' + pl.name + '</div>' +
        '<div class="sp-cap">' + pl.pax + ' pax · ' + pl.cargo + ' cargo</div>';
      d.addEventListener('click', function () {
        AU.click();
        selPlane = (selPlane === i ? -1 : i);
        renderStripFleet();
      });
      el.appendChild(d);
    });
    // send button
    var wrap = $('b-sd-fly').parentElement;
    var old = $('b-sd-send');
    if (old) old.remove();
    if (selPlane >= 0 && selJobs.length) {
      var f = pilot.fleet[selPlane];
      // all selected jobs must go to owned strips the plane can land at
      var jobs = SK.genJobs(selStrip, pilot.jobBucket).filter(function (j) { return selJobs.indexOf(j.id) >= 0; });
      var dests = {};
      jobs.forEach(function (j) { dests[j.dest] = true; });
      var destList = Object.keys(dests);
      var btn = document.createElement('button');
      btn.id = 'b-sd-send';
      btn.className = 'send-btn';
      if (destList.length === 1 && pilot.strips.indexOf(destList[0]) >= 0 &&
          SK.planeCanLand(f.plane, SK.stripById(destList[0]).cls)) {
        var pay = SK.flightPayout(jobs);
        var mins = SK.legMinutes(selStrip, destList[0], f.plane);
        btn.textContent = 'Send → ' + SK.stripById(destList[0]).name + ' · ' + money(pay.total) + ' · ' + mins + 'm';
        btn.addEventListener('click', function () {
          AU.click();
          var r = SK.assignFlight(pilot, selPlane, destList[0], jobs);
          if (r.ok) {
            savePilot(); AU.coin();
            toast('Wheels up! Back in ' + r.mins + ' min.');
            showStrip(selStrip);
          } else toast('Can\'t send — ' + r.why);
        });
      } else {
        btn.textContent = destList.length === 1 ? 'Can\'t land there' : 'Pick one destination';
        btn.disabled = true;
      }
      wrap.insertBefore(btn, $('b-sd-fly'));
    }
    // fly-yourself button: needs selected jobs to one dest.
    // Bush pilot rules: you can deliver TO any strip — you only need to own
    // the strip you're flying FROM (where you picked up the jobs).
    var flyBtn = $('b-sd-fly');
    flyBtn.classList.add('hidden');
    if (selJobs.length) {
      var jobs2 = SK.genJobs(selStrip, pilot.jobBucket).filter(function (j) { return selJobs.indexOf(j.id) >= 0; });
      var d2 = {};
      jobs2.forEach(function (j) { d2[j.dest] = true; });
      var dl2 = Object.keys(d2);
      if (dl2.length === 1 && SK.planeCanLand(f.plane, SK.stripById(dl2[0]).cls)) {
        flyBtn.classList.remove('hidden');
        flyBtn.onclick = function () {
          AU.click();
          startFlightWithJobs(selStrip, dl2[0], jobs2);
        };
      }
    }
  }

  function init() {
    $('b-map').addEventListener('click', function () { AU.click(); renderMap(); show('valleymap'); });
    $('b-map-back').addEventListener('click', function () { AU.click(); show('hangar'); });
    $('b-sd-back').addEventListener('click', function () { AU.click(); renderMap(); show('valleymap'); });
    checkArrivals();
  }

  return {
    init: init, renderMap: renderMap, showStrip: showStrip,
    renderFleetRow: renderFleetRow, checkArrivals: checkArrivals,
  };
})();

document.addEventListener('DOMContentLoaded', function () { MGMT.init(); });
