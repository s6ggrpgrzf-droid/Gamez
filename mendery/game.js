/* The Mendery — Pass 2: the people.
 *
 * Fantasy: you're at the bench, and the town brings you its broken
 * things. Each piece is someone's — a name, a vessel of their own,
 * and two or three sentences about how it broke, which are never
 * really about the pottery. You trace the crack, you lay the gold,
 * and they take it home.
 *
 * The seam remembers how you traced: slow and close lays rich gold,
 * fast and loose lays it thin. Nothing grades you. The bowl knows.
 */
'use strict';
(function () {
  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d');
  var whisperEl = document.getElementById('whisper');
  var whisperMain = document.getElementById('whisperMain');
  var whisperSub = document.getElementById('whisperSub');

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ================= the people =================
   * The stories are never really about the bowl. */
  var PEOPLE = [
    {
      name: 'Mara', vessel: 'teapot', glaze: 'blue', title: 'Mara\u2019s teapot',
      story: 'It slipped the morning the chair across from her stayed empty for the first time. Thirty years of making two cups out of habit. She only needs the pot to work.',
      closing: 'She made two cups when she got home. Poured one out in the garden. For him.',
      callback: 'Mara\u2019s teapot, again. The garden gets most of the second cup these days. She doesn\u2019t mind.'
    },
    {
      name: 'Theo', vessel: 'bowl', glaze: 'celadon', title: 'Theo\u2019s bowl',
      story: 'He made it at camp, lopsided on purpose, he says. It fell off the porch rail in a thunderstorm \u2014 one he was brave about, right up until he wasn\u2019t.',
      closing: 'He says the gold is where the lightning stayed. He likes it better now.',
      callback: 'Theo\u2019s bowl, again. A different rail this time. A different storm, bravely met.'
    },
    {
      name: 'June', vessel: 'cup', glaze: 'blush', title: 'June\u2019s cup',
      story: 'Her father\u2019s cup. At the estate sale her brother reached for it like it was nothing, and she grabbed first. The handle lost the argument.',
      closing: 'She holds it by the bowl now, both hands. The way he did.',
      callback: 'June\u2019s cup. She still grabs first. Some habits are just love with fast hands.'
    },
    {
      name: 'Rosa', vessel: 'dish', glaze: 'ivory', title: 'Rosa\u2019s serving dish',
      story: 'Forty-one Thanksgivings it carried. It was the quiet one \u2014 the first after the funeral \u2014 that finally cracked it. Nobody remembers dropping it. Everybody remembers the quiet.',
      closing: '\u201cIt doesn\u2019t have to be perfect,\u201d she said. \u201cIt never was the perfect one. It was the one that showed up.\u201d',
      callback: 'Rosa\u2019s dish. Another Thanksgiving carried. The quiet ones are rarer now.'
    },
    {
      name: 'Wren', vessel: 'vase', glaze: 'celadon', title: 'Wren\u2019s vase',
      story: 'Her sister sent flowers in it the week Wren moved out alone \u2014 the first thing in the apartment that wasn\u2019t furniture. It tipped mid-laugh, on the phone with that same sister.',
      closing: 'She put one stem in it right here at the bench. It held.',
      callback: 'Wren\u2019s vase. Her sister sends flowers on purpose now. The note says: for the vase with the gold.'
    },
    {
      name: 'Harold', vessel: 'cup', glaze: 'charcoal', title: 'Harold\u2019s mug',
      story: 'The VA gave it to him in \u201971, and he has drunk from worse mornings than this one. It cracked the winter his hands started shaking. He\u2019d rather mend it than say why.',
      closing: 'He turned the seam toward himself. \u201cGood,\u201d he said. \u201cNow we match.\u201d',
      callback: 'Harold\u2019s mug. His hands shake. His aim with a story doesn\u2019t.'
    },
    {
      name: 'Delia', vessel: 'bowl', glaze: 'wheat', title: 'Delia\u2019s mixing bowl',
      story: 'It belonged to the bakery first, then to forty years of birthdays. Cold water on a hot bowl, at the sink \u2014 a grandson\u2019s help, too eager.',
      closing: '\u201cDon\u2019t tell him,\u201d she said. \u201cFar as that boy knows, you fixed it before it broke.\u201d',
      callback: 'Delia\u2019s bowl. The grandson helps at the sink now, careful as a surgeon. Nobody told him anything.'
    },
    {
      name: 'Ellis', vessel: 'dish', glaze: 'celadon', title: 'Ellis\u2019s plate',
      story: 'He eats off the good china every Sunday since the house went quiet, because she would have hated paper plates. The crack came from the rack, and not looking, and Sundays.',
      closing: 'He set the table for one, on the good plate. Seam side up.',
      callback: 'Ellis\u2019s plate. Sundays still. The good china, seam side up, like a flag.'
    }
  ];

  /* vessels: rf = size vs the bench scale, well = inner radius,
   * ext = canvas padding for handles and spouts, and a crack temper */
  var VESSELS = {
    bowl:   { rf: 1.00, well: 0.80, ext: 1.30, steps: [15, 20], stepLen: 0.092, branches: 1, stopR: 0.10 },
    dish:   { rf: 1.07, well: 0.90, ext: 1.30, steps: [16, 21], stepLen: 0.095, branches: 2, stopR: 0.10 },
    cup:    { rf: 0.66, well: 0.70, ext: 1.62, steps: [12, 15], stepLen: 0.085, branches: 1, stopR: 0.12 },
    teapot: { rf: 0.82, well: 0.88, ext: 1.66, steps: [14, 18], stepLen: 0.090, branches: 1, stopR: 0.40 },
    vase:   { rf: 0.60, well: 0.00, ext: 1.36, steps: [16, 21], stepLen: 0.090, branches: 1, stopR: 0.40, annulus: true }
  };
  var GLAZES = {
    ivory:    { body: ['#fffaf0', '#f3e9d5', '#dcc9a8', '#b1986f'], well: ['#c7ad83', '#dbc69f', '#eee0be', '#a68c5e'], pool: '#b99e71', speck: '96,74,44' },
    celadon:  { body: ['#f2f7ec', '#d9e6d2', '#b3c6a4', '#87997a'], well: ['#a9bd97', '#c3d4b2', '#e2ecd4', '#7d9070'], pool: '#97b18a', speck: '70,88,58' },
    blue:     { body: ['#e6eef4', '#c3d3e0', '#93aeca', '#68809a'], well: ['#8ea6ba', '#aec2d2', '#d8e4ec', '#647b90'], pool: '#7e99b0', speck: '52,72,94' },
    blush:    { body: ['#fdf1ec', '#f2d9cf', '#dfb7a6', '#b28a76'], well: ['#d3ab97', '#e4c2b2', '#f6e2d6', '#a07a63'], pool: '#c49a82', speck: '110,76,58' },
    charcoal: { body: ['#8a7a68', '#6e5d4b', '#4e4133', '#33291e'], well: ['#453829', '#5d4c38', '#77644c', '#2a2117'], pool: '#33291d', speck: '240,225,190' },
    wheat:    { body: ['#fdf6e3', '#f3e3bc', '#e0c88f', '#b39b5e'], well: ['#d9bd7f', '#e8d09c', '#f7ecc6', '#a68a4e'], pool: '#c7a96e', speck: '110,88,44' }
  };

  /* ================= the town's memory ================= */
  var mendedCount = 0, visits = {}, queue = null, cabinet = [];
  /* each keepsake loads behind its own guard: one corrupt key must
   * never cost the town the others — least of all the cabinet */
  try { mendedCount = parseInt(window.localStorage.getItem('mendery-mended') || '0', 10) || 0; } catch (e) { /* private */ }
  try { visits = JSON.parse(window.localStorage.getItem('mendery-visits') || '{}') || {}; } catch (e) { visits = {}; }
  try { queue = JSON.parse(window.localStorage.getItem('mendery-queue') || 'null'); } catch (e) { queue = null; }
  try {
    var cabSaved = JSON.parse(window.localStorage.getItem('mendery-cabinet') || '[]');
    if (Array.isArray(cabSaved)) cabinet = cabSaved;
  } catch (e) { /* the cabinet stays shut rather than emptying itself */ }
  function saveTown() {
    try {
      window.localStorage.setItem('mendery-mended', String(mendedCount));
      window.localStorage.setItem('mendery-visits', JSON.stringify(visits));
      window.localStorage.setItem('mendery-queue', JSON.stringify(queue));
      window.localStorage.setItem('mendery-cabinet', JSON.stringify(cabinet));
    } catch (e) { /* private */ }
  }
  function nextPersonIdx() {
    if (!queue || !queue.length) {
      queue = PEOPLE.map(function (_, i) { return i; });
      if (mendedCount > 0 || Object.keys(visits).length) {
        /* after the first round of introductions, the town shuffles */
        for (var i = queue.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var tmp = queue[i]; queue[i] = queue[j]; queue[j] = tmp;
        }
      }
    }
    var idx = queue.shift();
    saveTown();
    return idx;
  }

  /* ================= layout ================= */
  var CW = 0, CH = 0, DPR = 1;
  var bowlC = { x: 0, y: 0 }, bowlR = 100;
  var benchCv = null, bowlCv = null;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    CW = window.innerWidth; CH = window.innerHeight;
    cv.width = Math.round(CW * DPR); cv.height = Math.round(CH * DPR);
    cv.style.width = CW + 'px'; cv.style.height = CH + 'px';
    bowlC.x = CW * (CW > CH ? 0.56 : 0.5);
    bowlC.y = CH * (CW > CH ? 0.5 : 0.44);
    bowlR = Math.min(CW, CH) * 0.365;
    buildBench();
    buildVesselBase();
    miniCache = {};
  }
  window.addEventListener('resize', resize);

  /* ================= the bench (prerendered) ================= */
  function buildBench() {
    benchCv = document.createElement('canvas');
    benchCv.width = Math.round(CW * DPR); benchCv.height = Math.round(CH * DPR);
    var b = benchCv.getContext('2d');
    b.setTransform(DPR, 0, 0, DPR, 0, 0);
    var g = b.createLinearGradient(0, 0, 0, CH);
    g.addColorStop(0, '#2a1a10'); g.addColorStop(0.55, '#1d120a'); g.addColorStop(1, '#120b06');
    b.fillStyle = g; b.fillRect(0, 0, CW, CH);
    var rngB = mulberry32(77);
    var plankH = Math.max(64, CH / 9);
    for (var y = 0; y < CH; y += plankH) {
      b.fillStyle = 'rgba(255,190,120,' + (rngB() * 0.05) + ')';
      b.fillRect(0, y, CW, plankH - 2);
      b.fillStyle = 'rgba(0,0,0,0.35)';
      b.fillRect(0, y + plankH - 2, CW, 2);
      for (var gl2 = 0; gl2 < 7; gl2++) {
        b.strokeStyle = 'rgba(0,0,0,' + (0.04 + rngB() * 0.06) + ')';
        b.lineWidth = 1 + rngB() * 1.4;
        b.beginPath();
        var gy = y + rngB() * plankH;
        b.moveTo(-10, gy);
        for (var gx = 0; gx <= CW + 10; gx += 46) b.lineTo(gx, gy + Math.sin(gx * 0.01 + gl2 * 7.0) * 2.6);
        b.stroke();
      }
    }
    for (var kn = 0; kn < 3; kn++) {
      var kx = rngB() * CW, ky = rngB() * CH, kr = 6 + rngB() * 9;
      var kg = b.createRadialGradient(kx, ky, 1, kx, ky, kr);
      kg.addColorStop(0, 'rgba(10,5,2,0.5)'); kg.addColorStop(1, 'rgba(10,5,2,0)');
      b.fillStyle = kg; b.beginPath(); b.arc(kx, ky, kr, 0, 6.2832); b.fill();
    }
    var lg = b.createRadialGradient(CW * 0.30, CH * 0.14, 10, CW * 0.30, CH * 0.14, Math.max(CW, CH) * 0.85);
    lg.addColorStop(0, 'rgba(255,196,116,0.20)'); lg.addColorStop(0.5, 'rgba(255,180,100,0.06)'); lg.addColorStop(1, 'rgba(255,180,100,0)');
    b.fillStyle = lg; b.fillRect(0, 0, CW, CH);
    /* the working light: a soft pool centred where the piece sits,
     * so the porcelain stands IN the lamplight, not beside it */
    var pg2 = b.createRadialGradient(bowlC.x, bowlC.y, bowlR * 0.2, bowlC.x, bowlC.y, bowlR * 2.15);
    pg2.addColorStop(0, 'rgba(255,196,116,0.13)'); pg2.addColorStop(0.55, 'rgba(255,180,100,0.05)'); pg2.addColorStop(1, 'rgba(255,180,100,0)');
    b.fillStyle = pg2; b.fillRect(0, 0, CW, CH);
    var dx = CW * 0.845, dy = CH * (CW > CH ? 0.82 : 0.80), dr = Math.min(CW, CH) * 0.062;
    b.save();
    b.fillStyle = 'rgba(0,0,0,0.4)';
    b.beginPath(); b.ellipse(dx + 3, dy + 5, dr * 1.15, dr * 0.9, 0, 0, 6.2832); b.fill();
    var dg = b.createRadialGradient(dx - dr * 0.3, dy - dr * 0.3, 1, dx, dy, dr);
    dg.addColorStop(0, '#4a3826'); dg.addColorStop(1, '#241607');
    b.fillStyle = dg; b.beginPath(); b.arc(dx, dy, dr, 0, 6.2832); b.fill();
    var pg = b.createRadialGradient(dx, dy, 1, dx, dy, dr * 0.66);
    pg.addColorStop(0, '#f7d67c'); pg.addColorStop(0.7, '#d9a441'); pg.addColorStop(1, '#9a6d1f');
    b.fillStyle = pg; b.beginPath(); b.arc(dx, dy, dr * 0.66, 0, 6.2832); b.fill();
    b.restore();
    b.save();
    b.translate(CW * 0.13, CH * (CW > CH ? 0.84 : 0.815));
    b.rotate(0.5);
    b.fillStyle = '#54381f';
    b.beginPath();
    if (b.roundRect) b.roundRect(-52, -4.5, 84, 9, 4.5); else b.rect(-52, -4.5, 84, 9);
    b.fill();
    b.fillStyle = '#8f8a80'; b.fillRect(30, -5.5, 13, 11);
    b.fillStyle = '#caa14e';
    b.beginPath(); b.moveTo(43, -5); b.lineTo(58, 0); b.lineTo(43, 5); b.closePath(); b.fill();
    b.restore();
  }

  /* ================= the piece on the bench ================= */
  var bowl = null, pieceSeq = 0;

  /* A piece, described from its seed alone: the crack, the glaze,
   * the handle's angle — everything replays identically, which is
   * what lets the cabinet keep faithful miniatures. */
  function makeDesc(personIdx, seed) {
    var person = PEOPLE[personIdx];
    var vd = VESSELS[person.vessel];
    var rng = mulberry32(seed);
    var segs = [];
    /* The crack is walked on the SURFACE, not on the screen. Its
     * coordinates are (s, th): s the distance travelled from the
     * rim along the vessel's profile, th the angle around it. A
     * profile maps s to a screen radius through the vessel's
     * slopes — where the surface steepens (the well's wall, the
     * vase's neck) a step along it covers less screen, so the
     * drawn crack compresses and bends where the vessel curves,
     * the way a real fracture reads from above. The old walk ran
     * flat across the disc: it chorded over the well, sliced
     * through the teapot's lid, and zigzagged down the vase's
     * silhouette instead of spiralling its shoulder. */
    function slopeAt(r) {
      if (vd.annulus) { /* the vase: shoulder, then the neck curving in */
        if (r >= 0.55) return 0.92;
        var tn = Math.min(1, Math.max(0, (0.55 - r) / 0.15));
        return 0.92 + (0.55 - 0.92) * Math.sin(tn * Math.PI * 0.5);
      }
      if (person.vessel === 'teapot') return 0.88; /* one long shoulder to the lid */
      var floorR = vd.well * 0.52;
      if (r <= floorR) return 1.0;
      if (r >= vd.well) return 0.95;
      var tw = (r - floorR) / (vd.well - floorR);
      var ws = 0.08 + vd.well * 0.58;
      return 0.95 + (ws - 0.95) * Math.sin(Math.min(1, Math.max(0, tw)) * Math.PI);
    }
    var PN = 240, profR = [], profS = [], acc = 0;
    for (var pi = 0; pi <= PN; pi++) {
      var pr = 1 - pi / PN;
      profR.push(pr); profS.push(acc);
      acc += (1 / PN) / slopeAt(pr - 0.5 / PN);
    }
    var sTotal = acc;
    function rOf(s) {
      if (s <= 0) return 1;
      if (s >= sTotal) return 0;
      var lo = 0, hi = PN;
      while (lo < hi - 1) { var mid = (lo + hi) >> 1; if (profS[mid] <= s) lo = mid; else hi = mid; }
      var f = (s - profS[lo]) / (profS[lo + 1] - profS[lo] || 1);
      return profR[lo] + (profR[lo + 1] - profR[lo]) * f;
    }
    function sOf(r) {
      if (r >= 1) return 0;
      if (r <= 0) return sTotal;
      var idx = Math.min(PN, Math.max(0, Math.round((1 - r) * PN)));
      return profS[idx];
    }
    function pushSeg(s1, t1, s2, t2, branch) {
      var r1 = rOf(s1), r2 = rOf(s2);
      segs.push({
        x1: Math.cos(t1) * r1, y1: Math.sin(t1) * r1,
        x2: Math.cos(t2) * r2, y2: Math.sin(t2) * r2,
        s2: s2, t2: t2, filled: false, care: 0, branch: branch
      });
    }
    var startR = vd.annulus ? 0.90 : 0.96;
    var sStop = sOf(vd.stopR);
    var a0 = rng() * Math.PI * 2;
    var nSteps = vd.steps[0] + Math.floor(rng() * (vd.steps[1] - vd.steps[0] + 1));
    if (vd.annulus) {
      /* on the vase the crack spirals: mostly around the shoulder,
       * sinking slowly toward the neck as it travels */
      var vs = sOf(startR), vt2 = a0, vSink = 0.34 + rng() * 0.16, sStopV = sOf(0.44);
      for (var vi = 0; vi < nSteps; vi++) {
        var vr = rOf(vs);
        var ns = vs + vd.stepLen * vSink, nt = vt2 + vd.stepLen * (0.95 + (rng() - 0.5) * 0.3) / Math.max(vr, 0.3);
        if (ns >= sStopV) { nt = vt2 + (nt - vt2) * ((sStopV - vs) / (ns - vs)); ns = sStopV; }
        pushSeg(vs, vt2, ns, nt, false);
        vs = ns; vt2 = nt;
        if (vs >= sStopV) break;
      }
    } else {
      /* the bow: the heading leans sideways most at mid-descent and
       * straightens at the rim and the floor, so the crack sweeps
       * in a crescent that follows the vessel's roundness instead
       * of spearing flat at the middle */
      var bowAmp = (0.30 + rng() * 0.35) * (rng() < 0.5 ? 1 : -1);
      var ms = sOf(startR), mt = a0;
      for (var mi = 0; mi < nSteps; mi++) {
        var mr = rOf(ms);
        var bow = bowAmp * Math.sin(Math.PI * Math.min(1, ms / sStop)) + (rng() - 0.5) * 0.30;
        var ns2 = ms + vd.stepLen * Math.cos(bow);
        var nt2 = mt + vd.stepLen * Math.sin(bow) / Math.max(mr, 0.25);
        /* land exactly on the stop radius — the tip should kiss the
         * lid's edge or the floor's heart, never overshoot them */
        if (ns2 >= sStop) { nt2 = mt + (nt2 - mt) * ((sStop - ms) / (ns2 - ms)); ns2 = sStop; }
        pushSeg(ms, mt, ns2, nt2, false);
        ms = ns2; mt = nt2;
        if (ms >= sStop) break;
      }
    }
    var mainCount = segs.length;
    for (var br = 0; br < vd.branches; br++) {
      var src = segs[Math.floor(mainCount * (0.3 + rng() * 0.35))];
      if (!src) break;
      /* a branch runs mostly along the surface — around, not down —
       * drifting only a little in s as it goes */
      var bs = src.s2, bt = src.t2;
      var bDir = rng() < 0.5 ? 1 : -1;
      var bDrift = (rng() - 0.5) * 0.5;
      var bSteps = 4 + Math.floor(rng() * 4);
      var sRim = sOf(0.97);
      for (var bi = 0; bi < bSteps; bi++) {
        var bsr = rOf(bs);
        var bns = bs + vd.stepLen * 0.8 * bDrift;
        var bnt = bt + bDir * vd.stepLen * 0.8 * (0.85 + (rng() - 0.5) * 0.2) / Math.max(bsr, 0.25);
        if (bns > sStop) { bnt = bt + (bnt - bt) * ((sStop - bs) / (bns - bs)); bns = sStop; }
        if (bns < sRim) break;
        pushSeg(bs, bt, bns, bnt, true);
        bs = bns; bt = bnt;
        if (bs >= sStop) break;
      }
    }
    return {
      personIdx: personIdx, person: person, vessel: person.vessel, vd: vd,
      glaze: GLAZES[person.glaze], seed: seed, segs: segs,
      handleAng: -0.35 + rng() * 0.7, spoutAng: Math.PI + (rng() - 0.5) * 0.6
    };
  }

  function makePiece(personIdx, seed, countVisit) {
    var desc = makeDesc(personIdx, seed);
    var person = desc.person;
    if (countVisit) {
      visits[person.name] = (visits[person.name] || 0) + 1;
      saveTown();
    }
    bowl = {
      id: ++pieceSeq, personIdx: personIdx, person: person,
      visit: countVisit ? visits[person.name] : (visits[person.name] || 0) + 1,
      vessel: desc.vessel, vd: desc.vd, glaze: desc.glaze,
      Rv: bowlR * desc.vd.rf, ext: desc.vd.ext,
      seed: seed, segs: desc.segs, complete: false, completeT: 0, filledCount: 0,
      handleAng: desc.handleAng, spoutAng: desc.spoutAng
    };
    settleT = 0; /* the piece is set down, not switched on */
    buildVesselBase();
    if (countVisit && window.MenderyAudio) window.MenderyAudio.knock();
    showPieceWhisper();
  }

  function buildVesselBase() {
    if (!bowl) return;
    bowl.Rv = bowlR * bowl.vd.rf;
    var S = Math.ceil(bowl.Rv * 2 * bowl.ext);
    bowlCv = document.createElement('canvas');
    bowlCv.width = Math.round(S * DPR); bowlCv.height = Math.round(S * DPR);
    var b = bowlCv.getContext('2d');
    b.setTransform(DPR, 0, 0, DPR, 0, 0);
    b.translate(S / 2, S / 2);
    renderPiece(b, bowl, bowl.Rv);
    bowl.S = S;
  }

  /* Draw one piece centred at the origin with radius R — the bench
   * piece at full size and the cabinet miniatures alike. P carries
   * vessel, vd, glaze, seed, handleAng, spoutAng (see makeDesc). */
  function renderPiece(b, P, R) {
    var gl = P.glaze, vt = P.vessel;
    /* shadow — two layers falling away from the lamp, which burns
     * top-left: a wide soft breath, then a tighter, darker core
     * hugging the contact edge, squashed slightly the way a real
     * cast shadow flattens against the boards */
    var sg = b.createRadialGradient(R * 0.10, R * 0.16, R * 0.2, R * 0.10, R * 0.16, R * 1.24);
    sg.addColorStop(0, 'rgba(0,0,0,0.34)'); sg.addColorStop(0.7, 'rgba(0,0,0,0.20)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = sg; b.beginPath(); b.arc(R * 0.10, R * 0.16, R * 1.24, 0, 6.2832); b.fill();
    b.save(); b.translate(R * 0.05, R * 0.10); b.scale(1, 0.92); b.translate(-R * 0.05, -R * 0.10);
    var sg2 = b.createRadialGradient(R * 0.05, R * 0.10, R * 0.3, R * 0.05, R * 0.10, R * 1.02);
    sg2.addColorStop(0, 'rgba(0,0,0,0.30)'); sg2.addColorStop(0.8, 'rgba(0,0,0,0.22)'); sg2.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = sg2; b.beginPath(); b.arc(R * 0.05, R * 0.10, R * 1.02, 0, 6.2832); b.fill();
    b.restore();
    /* appendages first — the body circle will hide their joints */
    if (vt === 'cup') {
      /* the loop tucks into the rim — centred close enough that the
       * body swallows its inner arc, so it reads as a handle anchored
       * at two points, not a ring floating beside the cup */
      var ha = P.handleAng, hx = Math.cos(ha) * R * 0.97, hy = Math.sin(ha) * R * 0.97;
      b.strokeStyle = gl.body[3]; b.lineWidth = R * 0.115;
      b.beginPath(); b.arc(hx, hy, R * 0.28, 0, 6.2832); b.stroke();
      b.strokeStyle = gl.body[1]; b.lineWidth = R * 0.075;
      b.beginPath(); b.arc(hx, hy, R * 0.28, 0, 6.2832); b.stroke();
    }
    if (vt === 'teapot') {
      var sa = P.spoutAng;
      /* a tapered wedge: wide at the body, narrow at the lip, sides
       * bowing slightly outward — never pinched in the middle */
      var sb1x = Math.cos(sa - 0.25) * R * 0.86, sb1y = Math.sin(sa - 0.25) * R * 0.86;
      var sb2x = Math.cos(sa + 0.25) * R * 0.86, sb2y = Math.sin(sa + 0.25) * R * 0.86;
      var sm1x = Math.cos(sa - 0.155) * R * 1.16, sm1y = Math.sin(sa - 0.155) * R * 1.16;
      var sm2x = Math.cos(sa + 0.155) * R * 1.16, sm2y = Math.sin(sa + 0.155) * R * 1.16;
      var st1x = Math.cos(sa - 0.05) * R * 1.46, st1y = Math.sin(sa - 0.05) * R * 1.46;
      var st2x = Math.cos(sa + 0.05) * R * 1.46, st2y = Math.sin(sa + 0.05) * R * 1.46;
      b.fillStyle = gl.body[2];
      b.beginPath();
      b.moveTo(sb1x, sb1y); b.lineTo(sm1x, sm1y); b.lineTo(st1x, st1y);
      b.lineTo(st2x, st2y); b.lineTo(sm2x, sm2y); b.lineTo(sb2x, sb2y);
      b.closePath(); b.fill();
      b.strokeStyle = 'rgba(40,30,18,0.4)'; b.lineWidth = 1.8; b.stroke();
      b.fillStyle = gl.body[3];
      b.beginPath(); b.ellipse((st1x + st2x) / 2, (st1y + st2y) / 2, R * 0.052, R * 0.03, sa, 0, 6.2832); b.fill();
      var hAng = sa + Math.PI, hx2 = Math.cos(hAng) * R * 1.05, hy2 = Math.sin(hAng) * R * 1.05;
      b.strokeStyle = '#4a3220'; b.lineWidth = R * 0.10;
      b.beginPath(); b.arc(hx2, hy2, R * 0.32, 0, 6.2832); b.stroke();
      b.strokeStyle = 'rgba(255,225,170,0.16)'; b.lineWidth = R * 0.035;
      b.beginPath(); b.arc(hx2, hy2, R * 0.32, Math.PI * 1.1, Math.PI * 1.5); b.stroke();
    }
    /* body */
    var bg2 = b.createRadialGradient(-R * 0.28, -R * 0.34, R * 0.1, 0, 0, R * 1.22);
    bg2.addColorStop(0, gl.body[0]); bg2.addColorStop(0.45, gl.body[1]);
    bg2.addColorStop(0.8, gl.body[2]); bg2.addColorStop(1, gl.body[3]);
    b.fillStyle = bg2; b.beginPath(); b.arc(0, 0, R, 0, 6.2832); b.fill();
    if (vt === 'vase') {
      /* a body you look down on: neck ring and a dark mouth */
      b.strokeStyle = gl.body[3]; b.lineWidth = R * 0.09;
      b.beginPath(); b.arc(0, 0, R * 0.55, 0, 6.2832); b.stroke();
      b.strokeStyle = 'rgba(255,252,240,0.35)'; b.lineWidth = R * 0.025;
      b.beginPath(); b.arc(0, 0, R * 0.60, Math.PI * 1.05, Math.PI * 1.5); b.stroke();
      var mg = b.createRadialGradient(0, 0, 1, 0, 0, R * 0.38);
      mg.addColorStop(0, '#17100a'); mg.addColorStop(0.8, '#241a10'); mg.addColorStop(1, gl.body[3]);
      b.fillStyle = mg; b.beginPath(); b.arc(0, 0, R * 0.38, 0, 6.2832); b.fill();
      b.strokeStyle = 'rgba(255,240,210,0.10)'; b.lineWidth = R * 0.03;
      b.beginPath(); b.arc(0, 0, R * 0.335, Math.PI * 0.1, Math.PI * 0.5); b.stroke();
    } else if (vt === 'teapot') {
      /* the lid, and its wooden knob — kept flatter than the body so
       * it reads as a lid sitting on the pot, not a pearl inside it */
      var lg2 = b.createRadialGradient(-R * 0.06, -R * 0.07, R * 0.05, 0, 0, R * 0.38);
      lg2.addColorStop(0, gl.body[1]); lg2.addColorStop(0.65, gl.body[1]); lg2.addColorStop(1, gl.body[2]);
      b.fillStyle = lg2; b.beginPath(); b.arc(0, 0, R * 0.36, 0, 6.2832); b.fill();
      b.strokeStyle = 'rgba(40,30,18,0.30)'; b.lineWidth = R * 0.018;
      b.beginPath(); b.arc(0, 0, R * 0.36, 0, 6.2832); b.stroke();
      b.strokeStyle = 'rgba(40,30,18,0.18)'; b.lineWidth = R * 0.05;
      b.beginPath(); b.arc(0, 0, R * 0.335, Math.PI * 0.2, Math.PI * 0.8); b.stroke();
      b.strokeStyle = 'rgba(255,252,240,0.35)'; b.lineWidth = R * 0.014;
      b.beginPath(); b.arc(0, 0, R * 0.355, Math.PI * 1.08, Math.PI * 1.45); b.stroke();
      b.fillStyle = '#4a3220'; b.beginPath(); b.arc(0, 0, R * 0.075, 0, 6.2832); b.fill();
      b.fillStyle = 'rgba(255,230,180,0.5)'; b.beginPath(); b.arc(-R * 0.025, -R * 0.028, R * 0.02, 0, 6.2832); b.fill();
    } else {
      /* the well — glaze pools deep at the floor, the wall falls
       * away through a soft throat of occlusion, and the floor
       * catches the lamp on its lamp side */
      var wr = R * P.vd.well;
      var wg = b.createRadialGradient(0, R * 0.03, R * 0.04, 0, 0, R * (P.vd.well + 0.02));
      wg.addColorStop(0, gl.pool); wg.addColorStop(0.25, gl.well[0]);
      wg.addColorStop(0.55, gl.well[1]); wg.addColorStop(0.82, gl.well[2]); wg.addColorStop(1, gl.well[3]);
      b.fillStyle = wg; b.beginPath(); b.arc(0, 0, R * P.vd.well, 0, 6.2832); b.fill();
      b.save();
      b.beginPath(); b.arc(0, 0, wr, 0, 6.2832); b.clip();
      var throat = [ [0.05, 0.20], [0.08, 0.13], [0.13, 0.075] ];
      for (var ti = 0; ti < throat.length; ti++) {
        b.strokeStyle = 'rgba(43,30,16,' + throat[ti][0] + ')'; b.lineWidth = wr * throat[ti][1];
        b.beginPath(); b.arc(0, 0, wr * (0.99 - throat[ti][1] / 2), 0, 6.2832); b.stroke();
      }
      var fg = b.createRadialGradient(-wr * 0.34, -wr * 0.40, 2, -wr * 0.34, -wr * 0.40, wr * 1.0);
      fg.addColorStop(0, 'rgba(255,250,230,0.10)'); fg.addColorStop(1, 'rgba(255,250,230,0)');
      b.fillStyle = fg; b.beginPath(); b.arc(0, 0, wr, 0, 6.2832); b.fill();
      b.restore();
      b.strokeStyle = 'rgba(60,44,26,0.28)'; b.lineWidth = R * 0.05;
      b.beginPath(); b.arc(0, 0, R * (P.vd.well - 0.035), Math.PI * 0.25, Math.PI * 0.85); b.stroke();
      if (vt === 'cup') {
        /* the cup's inner shadow, feathered across its whole radius —
         * a hard-edged disc read as a bullseye on the light glazes */
        var cg = b.createRadialGradient(0, 0, 1, 0, 0, R * 0.37);
        cg.addColorStop(0, gl.well[3]); cg.addColorStop(1, gl.well[2]);
        b.fillStyle = cg; b.globalAlpha = 0.42;
        b.beginPath(); b.arc(0, 0, R * 0.37, 0, 6.2832); b.fill();
        b.globalAlpha = 1;
      }
    }
    /* throwing rings — the wheel leaves its memory in the clay:
     * a few faint concentric breaths in the band between the well
     * and the rim (on the teapot and vase, across the shoulder) */
    var rngT = mulberry32(P.seed * 13 + 7);
    var ringIn = (vt === 'vase' || vt === 'teapot') ? 0.60 : Math.max(P.vd.well + 0.05, 0.62);
    b.save();
    b.beginPath(); b.arc(0, 0, R * 0.985, 0, 6.2832); b.clip();
    for (var ri = 0; ri < 5; ri++) {
      var rr = R * (ringIn + rngT() * (0.965 - ringIn));
      b.strokeStyle = rngT() < 0.5 ? 'rgba(60,40,20,' + (0.025 + rngT() * 0.03) + ')' : 'rgba(255,250,235,' + (0.02 + rngT() * 0.025) + ')';
      b.lineWidth = R * (0.006 + rngT() * 0.010);
      b.beginPath(); b.arc(0, 0, rr, 0, 6.2832); b.stroke();
    }
    b.restore();
    /* rim light + edge — where a conic gradient is offered, the
     * light wraps the rim the way lamplight really wraps a glaze:
     * gathered at the lamp side, dying around the back */
    if (b.createConicGradient) {
      var cg2 = b.createConicGradient(Math.PI * 1.05, 0, 0);
      cg2.addColorStop(0, 'rgba(255,253,240,0)');
      cg2.addColorStop(0.10, 'rgba(255,253,240,0.55)');
      cg2.addColorStop(0.26, 'rgba(255,253,240,0.14)');
      cg2.addColorStop(0.55, 'rgba(255,253,240,0)');
      cg2.addColorStop(1, 'rgba(255,253,240,0)');
      b.strokeStyle = cg2; b.lineWidth = R * 0.020;
      b.beginPath(); b.arc(0, 0, R * 0.982, 0, 6.2832); b.stroke();
    } else {
      b.strokeStyle = 'rgba(255,252,240,0.45)'; b.lineWidth = R * 0.016;
      b.beginPath(); b.arc(0, 0, R * 0.985, Math.PI * 1.05, Math.PI * 1.55); b.stroke();
    }
    b.strokeStyle = 'rgba(40,30,18,0.35)'; b.lineWidth = R * 0.02;
    b.beginPath(); b.arc(0, 0, R * 0.995, 0, 6.2832); b.stroke();
    /* speckle — and the odd iron spot, kissed darker by the kiln
     * (on charcoal the spots come out pale as ash instead) */
    var rngS = mulberry32(P.seed * 7 + 3);
    for (var i = 0; i < 420; i++) {
      var sa2 = rngS() * 6.2832, sr = Math.sqrt(rngS()) * R * 0.97;
      var iron = rngS() < 0.035;
      b.fillStyle = rngS() < 0.12 ? 'rgba(190,150,60,0.10)' : 'rgba(' + gl.speck + ',' + (iron ? 0.13 + rngS() * 0.05 : 0.02 + rngS() * 0.04) + ')';
      b.beginPath(); b.arc(Math.cos(sa2) * sr, Math.sin(sa2) * sr, iron ? R * (0.008 + rngS() * 0.009) : 0.6 + rngS() * 1.1, 0, 6.2832); b.fill();
    }
    /* the potter's mark — not on the teapot; its lid carries the hand */
    if (vt !== 'teapot') {
      b.save();
      var markR = vt === 'vase' ? 0.72 : 0.90;
      var mAng = 0.85;
      b.translate(Math.cos(mAng) * R * markR, Math.sin(mAng) * R * markR); b.rotate(0.4);
      b.strokeStyle = 'rgba(148,64,42,0.55)'; b.lineWidth = 1.6;
      b.beginPath(); b.arc(0, 0, R * 0.05, 0, 6.2832); b.stroke();
      b.fillStyle = 'rgba(148,64,42,0.55)';
      b.beginPath(); b.arc(0, 0, R * 0.016, 0, 6.2832); b.fill();
      b.restore();
    }
    /* lamp highlight crescent */
    var hg = b.createRadialGradient(-R * 0.42, -R * 0.5, 2, -R * 0.42, -R * 0.5, R * 0.62);
    hg.addColorStop(0, 'rgba(255,255,246,0.20)'); hg.addColorStop(1, 'rgba(255,255,246,0)');
    b.fillStyle = hg; b.beginPath(); b.arc(0, 0, R, 0, 6.2832); b.fill();
  }

  /* ================= the seam ================= */
  function progress() {
    if (!bowl || !bowl.segs.length) return 0;
    return bowl.filledCount / bowl.segs.length;
  }
  function segDist(px, py, s) {
    var dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    var l2 = dx * dx + dy * dy || 1e-6;
    var tt = clamp(((px - s.x1) * dx + (py - s.y1) * dy) / l2, 0, 1);
    var ex = s.x1 + dx * tt - px, ey = s.y1 + dy * tt - py;
    return Math.hypot(ex, ey);
  }

  var sparkles = [];
  function spawnSparkle(x, y, big) {
    if (sparkles.length > 130) return;
    sparkles.push({
      x: x, y: y, vx: (Math.random() - 0.5) * 14, vy: -8 - Math.random() * 16,
      life: 0, ttl: big ? 1.5 + Math.random() : 0.6 + Math.random() * 0.5,
      r: big ? 1.6 + Math.random() * 1.6 : 0.8 + Math.random() * 1.1,
      big: !!big
    });
  }

  /* ================= input ================= */
  var tracing = false, lastMove = null, fadeSwap = 0, swapDone = false, settleT = 1;

  function toBowlSpace(cxPx, cyPx) {
    return { x: (cxPx - bowlC.x) / bowl.Rv, y: (cyPx - bowlC.y) / bowl.Rv };
  }
  function doTrace(cxPx, cyPx, stamp) {
    if (!bowl || bowl.complete || fadeSwap > 0) return;
    var AU = window.MenderyAudio;
    var p = toBowlSpace(cxPx, cyPx);
    if (Math.hypot(p.x, p.y) > 1.12) { lastMove = null; if (AU) AU.drag(0); return; }
    var speed = 0;
    var fromX = p.x, fromY = p.y;
    if (lastMove) {
      var dtm = Math.max(1, stamp - lastMove.stamp) / 1000;
      speed = Math.hypot(p.x - lastMove.x, p.y - lastMove.y) / dtm;
      fromX = lastMove.x; fromY = lastMove.y;
    }
    lastMove = { x: p.x, y: p.y, stamp: stamp };
    if (AU) AU.drag(speed);
    var TOL = 0.085, batchCare = -1;
    /* The phone reports the finger in stepping stones, not a line —
     * walk the stretch between the last report and this one in small
     * steps and test along the whole path, so a segment the finger
     * crossed is never skipped just because no report landed on it.
     * Speed, and therefore care, is still measured on the real
     * report-to-report motion: the gold stays honest about how the
     * hand actually moved. */
    var span = Math.hypot(p.x - fromX, p.y - fromY);
    var steps = Math.max(1, Math.min(64, Math.ceil(span / 0.035)));
    for (var st = 1; st <= steps; st++) {
      var sx = fromX + (p.x - fromX) * (st / steps);
      var sy = fromY + (p.y - fromY) * (st / steps);
      for (var i = 0; i < bowl.segs.length; i++) {
        var s = bowl.segs[i];
        if (s.filled) continue;
        var d = segDist(sx, sy, s);
        if (d < TOL) {
          s.filled = true;
          s.care = clamp(1.12 - speed * 0.5 - d * 4.5, 0.3, 1);
          if (s.care > batchCare) batchCare = s.care;
          bowl.filledCount++;
          spawnSparkle(bowlC.x + (s.x1 + s.x2) / 2 * bowl.Rv, bowlC.y + (s.y1 + s.y2) / 2 * bowl.Rv, false);
        }
      }
    }
    if (batchCare >= 0 && AU) AU.tick(batchCare);
    if (progress() >= 0.985 && !bowl.complete) completeBowl();
  }
  function completeBowl() {
    bowl.complete = true;
    bowl.completeT = elapsed;
    bowl.segs.forEach(function (s) { if (!s.filled) { s.filled = true; s.care = 0.8; bowl.filledCount++; } });
    for (var i = 0; i < 11; i++) {
      var a = Math.random() * 6.2832, rr = Math.random() * bowl.Rv * 0.7;
      spawnSparkle(bowlC.x + Math.cos(a) * rr, bowlC.y + Math.sin(a) * rr, true);
    }
    mendedCount++;
    /* the cabinet keeps this piece: whose it was, its seed (so the
     * crack and glaze replay exactly), and the care of every stretch
     * of seam — the miniature shows the seam as it was really laid */
    cabinet.push({
      p: bowl.personIdx, s: bowl.seed,
      c: bowl.segs.map(function (sg) { return Math.round(sg.care * 100) / 100; })
    });
    saveTown();
    paintCabBtn();
    if (window.MenderyAudio) window.MenderyAudio.bell();
    setWhisper('mended:' + bowl.id, 'Mended.', bowl.person.closing);
  }
  cv.addEventListener('pointerdown', function (e) {
    if (window.MenderyAudio) window.MenderyAudio.wake();
    if (view === 'cabinet') {
      cabTouch = { y: e.clientY, scroll0: cabScroll, t: e.timeStamp, moved: false };
      return;
    }
    bootGreeting = false;
    if (bowl && bowl.complete && fadeSwap === 0) {
      var p = toBowlSpace(e.clientX, e.clientY);
      if (Math.hypot(p.x, p.y) < 1.05) { fadeSwap = 0.0001; return; }
    }
    tracing = true; lastMove = null;
    doTrace(e.clientX, e.clientY, e.timeStamp);
    try { cv.setPointerCapture && cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
  });
  cv.addEventListener('pointermove', function (e) {
    if (cabTouch) {
      var dy = cabTouch.y - e.clientY;
      if (Math.abs(dy) > 6) cabTouch.moved = true;
      if (cabTouch.moved) cabScroll = clamp(cabTouch.scroll0 + dy, 0, cabMaxScroll());
      return;
    }
    if (tracing) {
      /* where the browser kept the reports it batched into this one
       * event, trace through every one of them, not just the last */
      var evs = null;
      try { evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null; } catch (err) { evs = null; }
      if (evs && evs.length) {
        for (var ci = 0; ci < evs.length; ci++) doTrace(evs[ci].clientX, evs[ci].clientY, evs[ci].timeStamp);
      } else {
        doTrace(e.clientX, e.clientY, e.timeStamp);
      }
    }
  });
  function endTrace() {
    tracing = false; lastMove = null; cabTouch = null;
    if (window.MenderyAudio) window.MenderyAudio.drag(0);
  }
  cv.addEventListener('pointerup', function (e) {
    if (cabTouch) {
      var wasTap = !cabTouch.moved && (e.timeStamp - cabTouch.t) < 450;
      var tx = e.clientX, ty = e.clientY;
      cabTouch = null;
      if (wasTap && view === 'cabinet') cabTap(tx, ty);
      return;
    }
    endTrace();
  });
  cv.addEventListener('pointercancel', endTrace);
  window.addEventListener('blur', endTrace);

  /* ================= whisper ================= */
  var whisperKey = '__boot', bootGreeting = false, bootT = 0;
  var whisperTimer = 0;
  /* Words arrive and leave like speech, not like signage: when the
   * text changes while the whisper is up, the old words fade out
   * first and the new ones take their place in the quiet — the text
   * never swaps at full opacity. Each moment has its pace: cabinet
   * crossings are brisk (320), bench moments are calm (650), and
   * the door greeting is slow (1200, passed by its caller). */
  function setWhisper(key, main, sub, paceMs) {
    if (key === whisperKey) return;
    whisperKey = key;
    var pace = paceMs || 650;
    whisperEl.style.transitionDuration = (pace / 1000) + 's';
    clearTimeout(whisperTimer);
    if (!main) { whisperEl.classList.remove('show'); return; }
    var shown = whisperEl.classList.contains('show');
    var differs = whisperMain.textContent !== main || whisperSub.textContent !== (sub || '');
    if (!shown || !differs) {
      whisperMain.textContent = main;
      whisperSub.textContent = sub || '';
      whisperEl.classList.add('show');
      return;
    }
    whisperEl.classList.remove('show');
    whisperTimer = setTimeout(function () {
      whisperMain.textContent = main;
      whisperSub.textContent = sub || '';
      whisperEl.classList.add('show');
    }, pace * 0.92);
  }
  function pieceKey() { return 'piece:' + (bowl ? bowl.id : 0); }
  function showPieceWhisper() {
    if (view !== 'bench') return;
    if (!bowl || !bowl.person) return;
    var sub = (bowl.visit > 1 && bowl.person.callback) ? bowl.person.callback : bowl.person.story;
    setWhisper(pieceKey(), bowl.person.title, sub);
  }

  /* ================= motes in the lamplight ================= */
  var motes = [];
  (function makeMotes() {
    var rngM = mulberry32(9);
    for (var i = 0; i < 26; i++) {
      motes.push({ x: rngM(), y: rngM() * 0.7, s: 0.5 + rngM() * 1.3, ph: rngM() * 6.283, sp: 0.004 + rngM() * 0.01 });
    }
  })();

  /* ================= render ================= */
  var elapsed = 0, lastT = 0, raf = 0, bootFade = 1;
  function frame(nowMs) {
    raf = requestAnimationFrame(frame);
    var now = nowMs / 1000;
    var dt = Math.min(now - (lastT || now), 0.1); lastT = now;
    elapsed += dt;
    var t = elapsed;
    window.__mendery.frameCount++;

    if (fadeSwap > 0) {
      fadeSwap += dt / 0.45;
      if (fadeSwap >= 0.5 && !swapDone) {
        swapDone = true;
        makePiece(nextPersonIdx(), (Math.random() * 1e9) | 0, true);
      }
      if (fadeSwap >= 1) { fadeSwap = 0; swapDone = false; }
    }
    var fadeAlpha = fadeSwap === 0 ? 1 : (fadeSwap < 0.5 ? 1 - fadeSwap * 2 : (fadeSwap - 0.5) * 2);

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalAlpha = 1;
    if (benchCv) ctx.drawImage(benchCv, 0, 0, CW, CH);

    /* the set-down: a new piece lands a breath high and a touch
     * large, and settles onto the wood over a third of a second —
     * the visual half of the knock you've been hearing */
    if (settleT < 1) settleT = Math.min(1, settleT + dt / 0.32);
    var sE = 1 - Math.pow(1 - settleT, 3);
    var pScale = 1 + 0.025 * (1 - sE), pYOff = 5 * (1 - sE);

    if (bowlCv && bowl) {
      var S = bowl.S || Math.ceil(bowl.Rv * 2 * bowl.ext);
      ctx.globalAlpha = fadeAlpha;
      ctx.drawImage(bowlCv, bowlC.x - S * pScale / 2, bowlC.y + pYOff - S * pScale / 2, S * pScale, S * pScale);
      var pulse = bowl.complete ? Math.max(0, 1 - (t - bowl.completeT) / 2.2) : 0;
      var glow = 1 + pulse * 0.9;
      var Rv = bowl.Rv;
      var RvS = Rv * pScale, cyy = bowlC.y + pYOff;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      /* Lay the gold in three full passes — dark edge, body, then
       * light. Finishing each segment before starting the next let
       * the next segment's dark edge cut across the last segment's
       * light, banding the vein like bamboo. Full passes keep the
       * joints continuous while each stretch's width still remembers
       * the care it was laid with. */
      for (var seamPass = 0; seamPass < 3; seamPass++) {
        for (var i = 0; i < bowl.segs.length; i++) {
          var s = bowl.segs[i];
          if (!s.filled) continue;
          var cw = 0.6 + s.care * 0.65;
          var sx1 = bowlC.x + s.x1 * RvS, sy1 = cyy + s.y1 * RvS;
          var sx2 = bowlC.x + s.x2 * RvS, sy2 = cyy + s.y2 * RvS;
          ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2);
          if (seamPass === 0) {
            ctx.strokeStyle = 'rgba(138,90,23,0.85)';
            ctx.lineWidth = RvS * 0.021 * cw * glow;
          } else if (seamPass === 1) {
            ctx.strokeStyle = 'rgba(224,164,54,0.95)';
            ctx.lineWidth = RvS * 0.012 * cw * glow;
          } else {
            ctx.strokeStyle = 'rgba(255,233,168,' + (0.30 + s.care * 0.35 + pulse * 0.3) + ')';
            ctx.lineWidth = RvS * 0.005 * cw * glow;
          }
          ctx.stroke();
        }
      }
      ctx.beginPath();
      var anyOpen = false;
      for (var j = 0; j < bowl.segs.length; j++) {
        var o = bowl.segs[j];
        if (o.filled) continue;
        anyOpen = true;
        ctx.moveTo(bowlC.x + o.x1 * RvS, cyy + o.y1 * RvS);
        ctx.lineTo(bowlC.x + o.x2 * RvS, cyy + o.y2 * RvS);
      }
      if (anyOpen) {
        /* a breath of pale under the crack first — where glaze chips,
         * it goes light at the edges. On pale glazes it vanishes; on
         * charcoal it lifts the crack off the dark well so the line
         * you're asked to trace can always be seen */
        ctx.strokeStyle = 'rgba(255,238,205,0.15)';
        ctx.lineWidth = Math.max(3.2, RvS * 0.024);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(36,24,13,0.92)';
        ctx.lineWidth = Math.max(1.6, RvS * 0.011);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    for (var k = sparkles.length - 1; k >= 0; k--) {
      var sp = sparkles[k];
      sp.life += dt;
      if (sp.life >= sp.ttl) { sparkles.splice(k, 1); continue; }
      sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.vy -= 6 * dt;
      var la = 1 - sp.life / sp.ttl;
      ctx.fillStyle = 'rgba(255,220,140,' + (la * 0.85) + ')';
      if (sp.big) {
        /* a completion glint is a tiny four-point star, not a dust dot */
        ctx.fillStyle = 'rgba(255,224,150,' + (la * 0.68) + ')';
        var gr = sp.r * (1.0 + la * 0.7), gw = Math.max(0.35, sp.r * 0.22);
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y - gr); ctx.lineTo(sp.x + gw, sp.y - gw);
        ctx.lineTo(sp.x + gr, sp.y); ctx.lineTo(sp.x + gw, sp.y + gw);
        ctx.lineTo(sp.x, sp.y + gr); ctx.lineTo(sp.x - gw, sp.y + gw);
        ctx.lineTo(sp.x - gr, sp.y); ctx.lineTo(sp.x - gw, sp.y - gw);
        ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r * la + 0.3, 0, 6.2832); ctx.fill();
      }
    }

    ctx.fillStyle = 'rgba(255,214,150,1)';
    for (var m = 0; m < motes.length; m++) {
      var mo = motes[m];
      mo.y += mo.sp * dt * 10 * 0.016; mo.x += Math.sin(t * 0.3 + mo.ph) * 0.00012;
      if (mo.y > 0.78) { mo.y = 0.02; mo.x = Math.random() * 0.7; }
      var mx = mo.x * CW, my = mo.y * CH;
      var dxL = (mx - CW * 0.30) / (CW * 0.5), dyL = (my - CH * 0.14) / (CH * 0.5);
      var inLamp = Math.max(0, 1 - (dxL * dxL + dyL * dyL));
      ctx.globalAlpha = inLamp * (0.10 + 0.08 * Math.sin(t * 0.9 + mo.ph));
      ctx.beginPath(); ctx.arc(mx, my, mo.s, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* whisper upkeep — the bench's business only */
    if (view === 'bench') {
      if (bootGreeting) {
        if (elapsed - bootT > 3.4) { bootGreeting = false; showPieceWhisper(); }
      } else if (bowl && !bowl.complete && progress() > 0.02 && whisperKey !== 'tracing') {
        setWhisper('tracing', null);
      } else if (bowl && !bowl.complete && progress() <= 0.02 && whisperKey !== pieceKey()) {
        showPieceWhisper();
      }
      if (bowl && bowl.complete && whisperKey === 'mended:' + bowl.id && elapsed - bowl.completeT > 2.8) {
        setWhisper('mended2:' + bowl.id, 'Mended.', 'tap the bowl when you\u2019re ready for another');
      }
    }

    /* entering the shop: the room fades up from dark on arrival,
     * the way your eyes adjust to lamplight */
    if (bootFade > 0) {
      bootFade = Math.max(0, bootFade - dt / 0.9);
      ctx.fillStyle = 'rgba(8,5,2,' + (bootFade * 0.92) + ')';
      ctx.fillRect(0, 0, CW, CH);
    }

    /* the cabinet fades in over the bench — same room, same wall */
    var cabTarget = view === 'cabinet' ? 1 : 0;
    if (cabAlpha !== cabTarget) {
      cabAlpha = clamp(cabAlpha + (cabTarget ? dt / 0.35 : -dt / 0.35), 0, 1);
    }
    /* a rotation can shrink the scroll range out from under the
     * current offset — keep the shelves inside their world */
    if (view === 'cabinet') cabScroll = clamp(cabScroll, 0, cabMaxScroll());
    if (cabAlpha > 0.01) drawCabinet();
  }

  /* ================= the cabinet =================
   * Every piece ever mended, on shelves against the same wall, in
   * the order you mended them. The cabinet is the save file. */
  var view = 'bench', cabAlpha = 0, cabScroll = 0, cabSel = -1, cabTouch = null;
  var miniCache = {};
  var cabHeaderCv = null, cabHeaderKey = '', cabBoardCv = null, cabBoardKey = 0;

  var cabBtn = document.createElement('button');
  cabBtn.id = 'cabBtn';
  cabBtn.textContent = 'the cabinet';
  cabBtn.style.cssText = 'position:fixed;left:14px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:5;' +
    'background:none;border:none;padding:13px 10px;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;' +
    'font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;font-size:11px;letter-spacing:0.26em;text-transform:uppercase;' +
    'color:rgba(222,196,142,0.66);text-shadow:0 1px 8px rgba(0,0,0,0.8);display:none;';
  cabBtn.addEventListener('click', function () { toggleCabinet(); });
  document.body.appendChild(cabBtn);
  function paintCabBtn() { cabBtn.style.display = cabinet.length ? 'block' : 'none'; }
  function toggleCabinet() {
    /* crossings use the whisper's brisk pace (see setWhisper);
     * in the cabinet the whisper wears its caption settle (style.css) */
    if (view === 'bench') {
      view = 'cabinet'; cabSel = -1;
      whisperEl.classList.add('inCab');
      setWhisper('cab', null, null, 320);
      cabBtn.textContent = 'the bench';
    } else {
      view = 'bench';
      whisperEl.classList.remove('inCab');
      cabBtn.textContent = 'the cabinet';
      restoreBenchWhisper();
    }
  }
  function restoreBenchWhisper() {
    if (!bowl) return;
    if (bowl.complete) setWhisper('mended2:' + bowl.id, 'Mended.', 'tap the bowl when you\u2019re ready for another');
    else if (progress() > 0.02) setWhisper('tracing', null);
    else showPieceWhisper();
  }
  function cabLayout() {
    var cols = CW > CH ? 5 : 3;
    var cellW = CW / cols;
    return { cols: cols, cellW: cellW, cellH: cellW * 1.02, top: 102, baseR: cellW * 0.335 };
  }
  function cabMaxScroll() {
    var L = cabLayout();
    var rows = Math.ceil(cabinet.length / L.cols);
    return Math.max(0, L.top + rows * L.cellH + 150 - CH); /* tail room: the last row can lift clear of the caption */
  }
  function miniFor(idx) {
    if (miniCache[idx]) return miniCache[idx];
    var e = cabinet[idx], desc = makeDesc(e.p, e.s), L = cabLayout();
    var R = L.baseR * desc.vd.rf;
    var S = Math.ceil(R * 2 * desc.vd.ext);
    var c = document.createElement('canvas');
    c.width = Math.round(S * DPR); c.height = Math.round(S * DPR);
    var g = c.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.translate(S / 2, S / 2);
    renderPiece(g, desc, R);
    /* the seam as it was actually laid — care and all, drawn in the
     * same three full passes as the bench so the miniature's vein is
     * continuous too */
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (var pass = 0; pass < 3; pass++) {
      for (var i = 0; i < desc.segs.length; i++) {
        var s = desc.segs[i];
        var care = (e.c && e.c[i] != null) ? e.c[i] : 0.8;
        var cw = 0.6 + care * 0.65;
        g.beginPath(); g.moveTo(s.x1 * R, s.y1 * R); g.lineTo(s.x2 * R, s.y2 * R);
        if (pass === 0) {
          g.strokeStyle = 'rgba(138,90,23,0.85)'; g.lineWidth = Math.max(0.8, R * 0.021 * cw);
        } else if (pass === 1) {
          g.strokeStyle = 'rgba(224,164,54,0.95)'; g.lineWidth = Math.max(0.55, R * 0.012 * cw);
        } else {
          g.strokeStyle = 'rgba(255,233,168,' + (0.30 + care * 0.35) + ')'; g.lineWidth = Math.max(0.3, R * 0.005 * cw);
        }
        g.stroke();
      }
    }
    /* the name, lettered once onto a small plate */
    var lc = document.createElement('canvas');
    var lw = Math.ceil(L.cellW), lh = 20;
    lc.width = Math.round(lw * DPR); lc.height = Math.round(lh * DPR);
    var lg2 = lc.getContext('2d');
    lg2.setTransform(DPR, 0, 0, DPR, 0, 0);
    lg2.font = '600 10.5px "Cormorant Garamond", Georgia, serif';
    try { lg2.letterSpacing = '2.5px'; } catch (e) { /* graceful */ }
    lg2.textAlign = 'center'; lg2.textBaseline = 'middle';
    lg2.fillStyle = 'rgba(238,222,188,0.82)';
    lg2.fillText(desc.person.name.toUpperCase(), lw / 2, lh / 2 + 1);
    var out = { cv: c, S: S, R: R, label: lc, lw: lw, lh: lh };
    miniCache[idx] = out;
    return out;
  }
  function drawCabinet() {
    var L = cabLayout();
    ctx.save();
    /* an opaque dark first, so the bench piece never ghosts through;
     * then the room's wall at a whisper of alpha, for continuity */
    ctx.globalAlpha = cabAlpha;
    ctx.fillStyle = '#150c06'; ctx.fillRect(0, 0, CW, CH);
    if (benchCv) { ctx.globalAlpha = cabAlpha * 0.45; ctx.drawImage(benchCv, 0, 0, CW, CH); }
    ctx.globalAlpha = cabAlpha;
    /* the header and the shelf boards are lettered and sawn ONCE,
     * then blitted — text and gradients have no business being
     * re-made sixty times a second */
    var hKey = CW + '|' + cabinet.length;
    if (!cabHeaderCv || cabHeaderKey !== hKey) {
      cabHeaderKey = hKey;
      cabHeaderCv = document.createElement('canvas');
      cabHeaderCv.width = Math.round(CW * DPR); cabHeaderCv.height = Math.round(92 * DPR);
      var hg2 = cabHeaderCv.getContext('2d');
      hg2.setTransform(DPR, 0, 0, DPR, 0, 0);
      hg2.textAlign = 'center';
      var tGrad = hg2.createLinearGradient(0, 22, 0, 54);
      tGrad.addColorStop(0, '#fbf3da'); tGrad.addColorStop(0.55, '#ecd9a0'); tGrad.addColorStop(1, '#c9a24f');
      hg2.fillStyle = tGrad;
      hg2.font = '600 29px "Cormorant Garamond", Georgia, serif';
      try { hg2.letterSpacing = '2px'; } catch (e) { /* untracked is graceful */ }
      hg2.fillText('The Cabinet', CW / 2, 50);
      /* the house caption: small, tracked out, all caps — the way
       * good hotels and watchmakers label things */
      try { hg2.letterSpacing = CW < 360 ? '2px' : '3px'; } catch (e) { /* graceful */ }
      hg2.font = '600 ' + (CW < 360 ? 9 : 11) + 'px "Cormorant Garamond", Georgia, serif';
      hg2.fillStyle = 'rgba(216,188,130,0.62)';
      hg2.fillText(cabinet.length + (cabinet.length === 1 ? ' PIECE' : ' PIECES') + ' · IN THE ORDER YOU MENDED THEM', CW / 2, 72);
      try { hg2.letterSpacing = '0px'; } catch (e) { /* graceful */ }
      /* a hairline and a small diamond — the stationery of the house */
      var ln = hg2.createLinearGradient(CW / 2 - 74, 0, CW / 2 + 74, 0);
      ln.addColorStop(0, 'rgba(201,162,79,0)'); ln.addColorStop(0.5, 'rgba(201,162,79,0.55)'); ln.addColorStop(1, 'rgba(201,162,79,0)');
      hg2.strokeStyle = ln; hg2.lineWidth = 1;
      hg2.beginPath(); hg2.moveTo(CW / 2 - 74, 85); hg2.lineTo(CW / 2 - 6, 85); hg2.moveTo(CW / 2 + 6, 85); hg2.lineTo(CW / 2 + 74, 85); hg2.stroke();
      hg2.save(); hg2.translate(CW / 2, 85); hg2.rotate(Math.PI / 4);
      hg2.fillStyle = 'rgba(220,188,110,0.85)'; hg2.fillRect(-2.6, -2.6, 5.2, 5.2); hg2.restore();
    }
    ctx.drawImage(cabHeaderCv, 0, 0, CW, 92);
    var bw = CW - 32;
    if (!cabBoardCv || cabBoardKey !== bw) {
      cabBoardKey = bw;
      cabBoardCv = document.createElement('canvas');
      cabBoardCv.width = Math.round(bw * DPR); cabBoardCv.height = Math.round(18 * DPR);
      var bg3 = cabBoardCv.getContext('2d');
      bg3.setTransform(DPR, 0, 0, DPR, 0, 0);
      var grd0 = bg3.createLinearGradient(0, 0, 0, 12);
      grd0.addColorStop(0, '#5a4026'); grd0.addColorStop(0.35, '#3d2a16'); grd0.addColorStop(1, '#241608');
      bg3.fillStyle = grd0; bg3.fillRect(0, 0, bw, 11);
      bg3.fillStyle = 'rgba(255,205,130,0.13)'; bg3.fillRect(0, 0, bw, 1.5);
      bg3.fillStyle = 'rgba(0,0,0,0.4)'; bg3.fillRect(0, 11, bw, 7);
    }
    /* the shelves slide UNDER the header, never across it */
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 92, CW, CH - 92); ctx.clip();
    var rows = Math.ceil(cabinet.length / L.cols);
    for (var r = 0; r < rows; r++) {
      var boardY = L.top + (r + 1) * L.cellH - cabScroll;
      if (boardY < -40 || boardY > CH + 60) continue;
      for (var col = 0; col < L.cols; col++) {
        var idx = r * L.cols + col;
        if (idx >= cabinet.length) break;
        var m = miniFor(idx);
        var cxp = L.cellW * (col + 0.5);
        var cyp = boardY - 8 - m.R * 0.98;
        if (idx === cabSel) {
          /* the ring is drawn first, so it reads as a halo on the
           * shelf behind the piece — a spout or handle crossing it
           * paints over it instead of being struck through */
          ctx.strokeStyle = 'rgba(255,215,130,0.55)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(cxp, cyp, m.R * 1.14, 0, 6.2832); ctx.stroke();
        }
        ctx.drawImage(m.cv, cxp - m.S / 2, cyp - m.S / 2, m.S, m.S);
        ctx.drawImage(m.label, cxp - m.lw / 2, boardY + 8, m.lw, m.lh);
      }
      ctx.drawImage(cabBoardCv, 16, boardY - 4, bw, 18);
    }
    ctx.restore(); /* the header clip */
    ctx.restore();
  }
  function cabTap(x, y) {
    var L = cabLayout();
    var col = Math.floor(x / L.cellW);
    var row = Math.floor((y + cabScroll - L.top) / L.cellH);
    var idx = row * L.cols + col;
    if (idx >= 0 && idx < cabinet.length && col >= 0 && col < L.cols) {
      cabSel = idx;
      var person = PEOPLE[cabinet[idx].p];
      setWhisper('cab:' + idx, person.title, person.closing, 320);
    } else {
      cabSel = -1;
      setWhisper('cab', null, null, 320);
    }
  }

  /* ================= boot ================= */
  window.__mendery = {
    ready: false, frameCount: 0,
    get segments() { return bowl ? bowl.segs : []; },
    progress: progress,
    get complete() { return bowl ? bowl.complete : false; },
    get mendedCount() { return mendedCount; },
    get personName() { return bowl && bowl.person ? bowl.person.name : ''; },
    get personTitle() { return bowl && bowl.person ? bowl.person.title : ''; },
    get vessel() { return bowl ? bowl.vessel : ''; },
    get visit() { return bowl ? bowl.visit : 0; },
    get cabinetCount() { return cabinet.length; },
    get view() { return view; },
    get audio() {
      var A = window.MenderyAudio;
      return A ? { plays: A.plays, muted: A.muted, state: A.state } : null;
    },
    showRoster: function (i) { bootGreeting = false; makePiece(i, 4000 + i * 131, false); },
    newBowl: function (seed) { makePiece(nextPersonIdx(), seed || ((Math.random() * 1e9) | 0), true); },
    toClient: function (x, y) { return { x: bowlC.x + x * (bowl ? bowl.Rv : bowlR), y: bowlC.y + y * (bowl ? bowl.Rv : bowlR) }; },
    centre: bowlC
  };
  resize();
  makePiece(nextPersonIdx(), (Math.random() * 1e9) | 0, true);
  paintCabBtn();
  var totalVisits = 0;
  for (var vk in visits) totalVisits += visits[vk];
  if (mendedCount === 0 && totalVisits <= 1) {
    bootGreeting = true; bootT = 0;
    setWhisper('title', 'The Mendery', 'bring me your broken things', 1200);
  }
  requestAnimationFrame(function (ms) {
    window.__mendery.ready = true;
    frame(ms);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(raf); lastT = 0; }
    else raf = requestAnimationFrame(frame);
  });
})();
