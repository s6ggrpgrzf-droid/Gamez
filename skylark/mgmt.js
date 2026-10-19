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

  /* ---------- valley map ---------- */
  function renderMap() {
    SK.ensureAirline(pilot);
    $('map-money').textContent = money(pilot.money);
    var cv = $('map-canvas'), g = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    // parchment background
    g.fillStyle = '#e8d5ae'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#dfc89a';
    for (var i = 0; i < 40; i++) {
      var rx = (i * 97) % W, ry = (i * 61) % H;
      g.fillRect(rx, ry, 3, 3);
    }
    // enroute lines
    var now = Date.now();
    pilot.fleet.forEach(function (f) {
      if (f.status !== 'enroute') return;
      var a = SK.stripById(f.at), b = SK.stripById(f.dest);
      var ax = a.mx / 100 * W, ay = a.my / 100 * H;
      var bx = b.mx / 100 * W, by = b.my / 100 * H;
      // progress
      var total = f.arriveAt - f.departAt, done = now - f.departAt;
      var t = Math.max(0, Math.min(1, done / total));
      var px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
      g.strokeStyle = 'rgba(180,140,60,.5)'; g.lineWidth = 2;
      g.setLineDash([5, 4]);
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      g.setLineDash([]);
      // plane dot
      g.fillStyle = '#c94f38';
      g.beginPath(); g.arc(px, py, 6, 0, 6.29); g.fill();
      g.fillStyle = '#fff'; g.font = '9px sans-serif'; g.textAlign = 'center';
      var mins = Math.max(1, Math.round((f.arriveAt - now) / 60000));
      g.fillText(mins + 'm', px, py - 10);
    });
    // strips
    SK.STRIPS.forEach(function (s) {
      var x = s.mx / 100 * W, y = s.my / 100 * H;
      var owned = pilot.strips.indexOf(s.id) >= 0;
      // dot
      g.fillStyle = owned ? '#b98a2f' : '#9a8a70';
      g.strokeStyle = owned ? '#7a5a1e' : '#6a5a40';
      g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, owned ? 11 : 9, 0, 6.29); g.fill(); g.stroke();
      // class tick: grass=green ring, dirt=brown, paved=grey
      g.strokeStyle = s.cls === 'paved' ? '#666' : s.cls === 'dirt' ? '#8a6234' : '#5a8a3c';
      g.lineWidth = 3;
      g.beginPath(); g.arc(x, y, 14, 0, 6.29); g.stroke();
      // label
      g.fillStyle = '#3a2c1c'; g.font = '10px "DM Serif Display", serif'; g.textAlign = 'center';
      g.fillText(s.name, x, y + 28);
      if (!owned) {
        g.fillStyle = '#7a5c2e'; g.font = '9px sans-serif';
        g.fillText(money(s.cost), x, y + 40);
      }
      // idle planes at this strip
      var n = 0;
      pilot.fleet.forEach(function (f) {
        if (f.status === 'idle' && f.at === s.id) n++;
      });
      if (n) {
        g.fillStyle = '#2e6b4f'; g.font = 'bold 10px sans-serif';
        g.fillText('✈'.replace('✈', n + ' plane' + (n > 1 ? 's' : '')), x, y - 18);
      }
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
