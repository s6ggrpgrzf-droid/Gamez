/* Skylark mgmt — airline management UI: valley map, strips, jobs, fleet.
 * The Pocket Planes loop: own strips, load jobs, send planes, collect.
 */
'use strict';
/* globals SK, $, pilot, savePilot, money, AU, toast, show, showManifest, startFlightWithJobs */

var MGMT = (function () {
  var selStrip = null;      // strip detail being viewed
  var selJobs = [];         // job ids selected for a flight
  var selPlane = -1;        // fleet index selected
  var routeMode = false;    // plotting a multi-stop route on the map
  var routeStops = [];      // strip ids in order (after selStrip origin)

  // selected job objects for the current strip detail
  function currentJobs() {
    SK.ensureAirline(pilot);
    return SK.genJobs(selStrip, pilot.jobBucket)
      .filter(function (j) { return selJobs.indexOf(j.id) >= 0; });
  }
  function jobCounts(jobs) {
    var pax = 0, cargo = 0;
    jobs.forEach(function (j) { if (j.kind === 'cargo') cargo++; else pax++; });
    return { pax: pax, cargo: cargo };
  }

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
    var W = cv.width, H = cv.height; // 640x400 landscape backing
    // meadow-green land base
    g.fillStyle = '#a3c96e'; g.fillRect(0, 0, W, H);
    // tan field patches (seeded, stable) — authored for 640x400
    g.fillStyle = '#d8bf7c';
    var fields = [[50, 86, 114, 38, 0.3], [445, 57, 125, 42, -0.2], [71, 314, 135, 40, 0.15],
                  [463, 323, 107, 38, -0.3], [267, 171, 100, 34, 0.2], [534, 171, 93, 57, 0.1]];
    fields.forEach(function (f) {
      g.save(); g.translate(f[0], f[1]); g.rotate(f[4]);
      g.beginPath();
      if (g.roundRect) g.roundRect(-f[2] / 2, -f[3] / 2, f[2], f[3], 12); else g.rect(-f[2] / 2, -f[3] / 2, f[2], f[3]);
      g.fill(); g.restore();
    });
    // winding river
    g.strokeStyle = '#5fb2e8'; g.lineWidth = 18; g.lineCap = 'round';
    g.beginPath(); g.moveTo(413, -10);
    g.bezierCurveTo(445, 76, 449, 133, 406, 190);
    g.bezierCurveTo(367, 245, 313, 285, 281, 342);
    g.bezierCurveTo(267, 372, 260, 390, 256, 410);
    g.stroke();
    g.strokeStyle = '#8fd4f5'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(413, -10);
    g.bezierCurveTo(445, 76, 449, 133, 406, 190);
    g.bezierCurveTo(367, 245, 313, 285, 281, 342);
    g.bezierCurveTo(267, 372, 260, 390, 256, 410);
    g.stroke();
    // little lake
    g.fillStyle = '#5fb2e8';
    g.beginPath(); g.ellipse(128, 296, 40, 17, 0.4, 0, 6.29); g.fill();
    g.fillStyle = '#8fd4f5';
    g.beginPath(); g.ellipse(117, 293, 18, 8, 0.4, 0, 6.29); g.fill();
    // pine clusters (seeded)
    g.fillStyle = '#5da24a';
    for (var pi = 0; pi < 60; pi++) {
      var px = (pi * 137 + 41) % W, py = (pi * 89 + 173) % H;
      // keep the river corridor mostly clear
      if (Math.abs(px - (413 - py * 0.22)) < 40) continue;
      g.beginPath(); g.arc(px, py, 4 + (pi % 3), 0, 6.29); g.fill();
      g.beginPath(); g.arc(px + 6, py + 4, 3, 0, 6.29); g.fill();
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
      miniPlane(g, ex, ey, ang, 1.0);
      var mins = Math.max(1, Math.round((f.arriveAt - now) / 60000));
      var pname = (SK.PLANES.filter(function (p) { return p.id === f.plane; })[0] || { name: 'Plane' }).name;
      mapLabel(g, ex, ey - 24, pname.toUpperCase() + ' · ' + mins + 'M');
    });
    // strips
    SK.STRIPS.forEach(function (s) {
      var x = s.mx / 100 * W, y = s.my / 100 * H;
      var owned = pilot.strips.indexOf(s.id) >= 0;
      // marker
      g.fillStyle = owned ? '#ffffff' : '#b9b3a6';
      g.strokeStyle = owned ? '#8a6d3b' : '#8a8478';
      g.lineWidth = 3.5;
      g.beginPath(); g.arc(x, y, 13, 0, 6.29); g.fill(); g.stroke();
      // runway stripe
      g.strokeStyle = owned ? '#d94f3d' : '#a09a8c'; g.lineWidth = 3.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x - 6, y + 6); g.lineTo(x + 6, y - 6); g.stroke();
      // name label (small caps, PP style)
      g.font = '700 11px ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
      g.fillStyle = '#4a3b28'; g.textAlign = 'center';
      var nm = s.name.toUpperCase();
      // soft halo for readability
      g.fillStyle = 'rgba(255,255,255,.65)';
      g.fillText(nm, x + 1, y + 33);
      g.fillStyle = '#4a3b28';
      g.fillText(nm, x, y + 32);
      if (!owned) {
        g.font = '700 11px ui-rounded, system-ui, sans-serif';
        g.fillStyle = '#2e7d32';
        g.fillText(money(s.cost), x, y + 48);
      }
      // idle planes at this strip: tiny white planes
      var n = 0;
      pilot.fleet.forEach(function (f) {
        if (f.status === 'idle' && f.at === s.id) n++;
      });
      for (var k = 0; k < Math.min(n, 3); k++) miniPlane(g, x - 24 + k * 24, y - 28, 0.5, 0.65);
      if (n > 3) mapLabel(g, x, y - 28, '+' + (n - 3));
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
      if (best && bd < 36) {
        if (routeMode) routeTap(best.id);
        else { AU.click(); showStrip(best.id); }
      }
    };
    // route mode overlay: flashing job destinations + numbered stops + path
    if (routeMode) {
      var jd = {};
      currentJobs().forEach(function (j) { jd[j.dest] = true; });
      SK.STRIPS.forEach(function (s) {
        if (!jd[s.id] || s.id === selStrip || routeStops.indexOf(s.id) >= 0) return;
        var jx = s.mx / 100 * W, jy = s.my / 100 * H;
        g.strokeStyle = '#f5a623'; g.lineWidth = 3.5;
        g.beginPath(); g.arc(jx, jy, 19, 0, 6.29); g.stroke();
      });
      // dotted path: origin -> stops
      var path = [selStrip].concat(routeStops);
      g.strokeStyle = '#1c7bbf'; g.lineWidth = 3;
      g.setLineDash([2, 8]); g.lineCap = 'round';
      g.beginPath();
      path.forEach(function (id, pi) {
        var s = SK.stripById(id);
        var x = s.mx / 100 * W, y = s.my / 100 * H;
        if (pi === 0) g.moveTo(x, y); else g.lineTo(x, y);
      });
      g.stroke();
      g.setLineDash([]);
      routeStops.forEach(function (id, ri) {
        var s = SK.stripById(id);
        var x = s.mx / 100 * W, y = s.my / 100 * H;
        g.fillStyle = '#f5a623';
        g.strokeStyle = '#fff'; g.lineWidth = 3;
        g.beginPath(); g.arc(x, y - 32, 14, 0, 6.29); g.fill(); g.stroke();
        g.fillStyle = '#fff'; g.textAlign = 'center';
        g.font = '900 15px ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
        g.fillText(String(ri + 1), x, y - 26.5);
      });
    }
  }

  /* ---------- strip detail ---------- */
  function showStrip(id) {
    selStrip = id; selJobs = []; selPlane = -1;
    exitRouteMode();
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
    // job refresh countdown (new board every 3h)
    var msLeft = (pilot.jobBucket + 1) * 3 * 3600 * 1000 - Date.now();
    var rh = Math.floor(msLeft / 3600000), rm = Math.floor(msLeft % 3600000 / 60000);
    el.innerHTML = '<div class="job-refresh">New jobs in ' + rh + 'h ' + rm + 'm</div>';
    if (!jobs.length) { el.innerHTML += '<div class="job-empty">All jobs taken — new ones soon.</div>'; return; }
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
    // plane cards with live capacity vs selected jobs
    var counts = jobCounts(currentJobs());
    pilot.fleet.forEach(function (f, i) {
      if (f.status !== 'idle' || f.at !== selStrip) return;
      var pl = SK.PLANES.filter(function (p) { return p.id === f.plane; })[0];
      var over = counts.pax > pl.pax || counts.cargo > pl.cargo;
      var d = document.createElement('div');
      d.className = 'send-plane' + (selPlane === i ? ' sel' : '');
      d.innerHTML = '<div class="sp-name">' + pl.name + '</div>' +
        '<div class="sp-cap' + (over && selPlane === i ? ' over' : '') + '">' +
        counts.pax + '/' + pl.pax + ' pax · ' + counts.cargo + '/' + pl.cargo + ' cargo</div>';
      d.addEventListener('click', function () {
        AU.click();
        selPlane = (selPlane === i ? -1 : i);
        renderStripFleet();
      });
      el.appendChild(d);
    });
    // plot-route button (replaces the old single-dest send)
    var wrap = $('b-sd-fly').parentElement;
    var old = $('b-sd-send');
    if (old) old.remove();
    if (selPlane >= 0 && selJobs.length) {
      var f2 = pilot.fleet[selPlane];
      var pl2 = SK.PLANES.filter(function (p) { return p.id === f2.plane; })[0];
      var c2 = jobCounts(currentJobs());
      var btn = document.createElement('button');
      btn.id = 'b-sd-send';
      btn.className = 'send-btn';
      if (c2.pax > pl2.pax || c2.cargo > pl2.cargo) {
        btn.textContent = 'Too much for the ' + pl2.name + ' — drop some jobs';
        btn.disabled = true;
      } else {
        var dc = {};
        currentJobs().forEach(function (j) { dc[j.dest] = true; });
        btn.textContent = 'Plot route → (' + Object.keys(dc).length + ' destinations)';
        btn.addEventListener('click', function () { AU.click(); enterRouteMode(); });
      }
      wrap.insertBefore(btn, $('b-sd-fly'));
    }
    // the old fly-it-yourself button is superseded by route mode ("Fly leg 1")
    $('b-sd-fly').classList.add('hidden');
    $('b-sd-fly').onclick = null;
  }

  /* ---------- route plotting (Pocket Planes style) ---------- */
  function enterRouteMode() {
    routeMode = true; routeStops = [];
    show('valleymap');
    renderMap();
    updateRouteBar();
    var lg = $('map-legend');
    lg.textContent = 'tap owned strips in order — job destinations flash gold';
  }
  function exitRouteMode() {
    if (!routeMode && !routeStops.length) return;
    routeMode = false; routeStops = [];
    var bar = $('route-bar');
    if (bar) bar.classList.add('hidden');
    var lg = $('map-legend');
    if (lg) lg.textContent = 'white = yours · grey = for sale · tap a strip';
  }
  function updateRouteBar() {
    var bar = $('route-bar');
    bar.classList.remove('hidden');
    var info = $('route-info');
    var undo = $('route-undo');
    undo.disabled = !routeStops.length;
    if (!routeStops.length) {
      info.textContent = 'Tap strips in order to plot your route';
      return;
    }
    var stops = [selStrip].concat(routeStops);
    var jobs = currentJobs();
    var mins = SK.totalRouteMinutes(stops, pilot.fleet[selPlane].plane);
    var prof = SK.routeProfit(jobs);
    info.innerHTML = stops.length - 1 + (stops.length - 1 === 1 ? ' stop' : ' stops') +
      ' · ' + mins + 'm · <b>+' + money(prof.total) + '</b>' +
      (prof.bonus ? ' <span class="rb-bonus">25% bonus in there</span>' : '');
  }
  function routeTap(stripId) {
    if (pilot.strips.indexOf(stripId) < 0) { toast('Buy that strip first.'); return; }
    if (stripId === selStrip || routeStops.indexOf(stripId) >= 0) return;
    var f = pilot.fleet[selPlane];
    if (!SK.planeCanLand(f.plane, SK.stripById(stripId).cls)) {
      toast('The ' + SK.stripById(stripId).name + ' strip is too rough for that plane.');
      return;
    }
    routeStops.push(stripId);
    AU.click();
    renderMap();
    updateRouteBar();
  }

  function init() {
    $('b-map').addEventListener('click', function () { AU.click(); renderMap(); show('valleymap'); });
    $('b-map-back').addEventListener('click', function () { AU.click(); exitRouteMode(); show('hangar'); });
    $('b-sd-back').addEventListener('click', function () { AU.click(); renderMap(); show('valleymap'); });
    $('route-undo').addEventListener('click', function () {
      AU.click(); routeStops.pop(); renderMap(); updateRouteBar();
    });
    $('route-cancel').addEventListener('click', function () {
      AU.click(); exitRouteMode(); renderMap(); showStrip(selStrip);
    });
    $('route-fly').addEventListener('click', function () {
      AU.click();
      if (!routeStops.length) { toast('Tap at least one stop first.'); return; }
      var stops = [selStrip].concat(routeStops);
      var r = SK.assignRoute(pilot, selPlane, stops, currentJobs());
      if (r.ok) {
        savePilot(); AU.coin();
        toast('Wheels up! ' + (stops.length - 1) + (stops.length - 1 === 1 ? ' stop' : ' stops') +
              ', back in ~' + r.mins + 'm.');
        exitRouteMode(); renderMap();
      } else {
        var why = { strip: 'buy every stop first', class: 'a stop is too rough for that plane',
          capacity: 'too much load for that plane', miss: 'a job misses the route',
          busy: 'that plane is busy', position: 'that plane moved', route: 'plot at least one stop' }[r.why];
        toast('Can\'t fly — ' + (why || r.why));
      }
    });
    $('route-flyme').addEventListener('click', function () {
      AU.click();
      if (!routeStops.length) { toast('Tap at least one stop first.'); return; }
      var stops = [selStrip].concat(routeStops);
      var jobs = currentJobs();
      var legJobs = jobs.filter(function (j) { return j.dest === stops[1]; });
      var remJobs = jobs.filter(function (j) { return j.dest !== stops[1]; });
      startFlightWithJobs(selStrip, stops[1], legJobs, selPlane, stops.slice(2), remJobs);
    });
    checkArrivals();
  }

  return {
    init: init, renderMap: renderMap, showStrip: showStrip,
    renderFleetRow: renderFleetRow, checkArrivals: checkArrivals,
  };
})();

document.addEventListener('DOMContentLoaded', function () { MGMT.init(); });
