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
    teapot: { rf: 0.82, well: 0.88, ext: 1.66, steps: [14, 18], stepLen: 0.090, branches: 1, stopR: 0.14 },
    vase:   { rf: 0.60, well: 0.00, ext: 1.36, steps: [16, 21], stepLen: 0.090, branches: 1, stopR: 0.40, annulus: true }
  };
  var GLAZES = {
    ivory:    { body: ['#fffaf0', '#f3e9d5', '#dcc9a8', '#b1986f'], well: ['#c7ad83', '#dbc69f', '#eee0be', '#a68c5e'], speck: '96,74,44' },
    celadon:  { body: ['#f2f7ec', '#d9e6d2', '#b3c6a4', '#87997a'], well: ['#a9bd97', '#c3d4b2', '#e2ecd4', '#7d9070'], speck: '70,88,58' },
    blue:     { body: ['#e6eef4', '#c3d3e0', '#93aeca', '#68809a'], well: ['#8ea6ba', '#aec2d2', '#d8e4ec', '#647b90'], speck: '52,72,94' },
    blush:    { body: ['#fdf1ec', '#f2d9cf', '#dfb7a6', '#b28a76'], well: ['#d3ab97', '#e4c2b2', '#f6e2d6', '#a07a63'], speck: '110,76,58' },
    charcoal: { body: ['#8a7a68', '#6e5d4b', '#4e4133', '#33291e'], well: ['#453829', '#5d4c38', '#77644c', '#2a2117'], speck: '240,225,190' },
    wheat:    { body: ['#fdf6e3', '#f3e3bc', '#e0c88f', '#b39b5e'], well: ['#d9bd7f', '#e8d09c', '#f7ecc6', '#a68a4e'], speck: '110,88,44' }
  };

  /* ================= the town's memory ================= */
  var mendedCount = 0, visits = {}, queue = null;
  try {
    mendedCount = parseInt(window.localStorage.getItem('mendery-mended') || '0', 10) || 0;
    visits = JSON.parse(window.localStorage.getItem('mendery-visits') || '{}') || {};
    queue = JSON.parse(window.localStorage.getItem('mendery-queue') || 'null');
  } catch (e) { /* private mode: the town forgets, gently */ }
  function saveTown() {
    try {
      window.localStorage.setItem('mendery-mended', String(mendedCount));
      window.localStorage.setItem('mendery-visits', JSON.stringify(visits));
      window.localStorage.setItem('mendery-queue', JSON.stringify(queue));
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
      b.fillStyle = 'rgba(255,190,120,' + (rngB() * 0.03) + ')';
      b.fillRect(0, y, CW, plankH - 2);
      b.fillStyle = 'rgba(0,0,0,0.35)';
      b.fillRect(0, y + plankH - 2, CW, 2);
      for (var gl2 = 0; gl2 < 7; gl2++) {
        b.strokeStyle = 'rgba(0,0,0,' + (0.03 + rngB() * 0.05) + ')';
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

  function makePiece(personIdx, seed, countVisit) {
    var person = PEOPLE[personIdx];
    var vd = VESSELS[person.vessel];
    var rng = mulberry32(seed);
    var segs = [];
    function clampRing(x, y) {
      var rr = Math.hypot(x, y);
      if (rr > 0.95) { x *= 0.95 / rr; y *= 0.95 / rr; rr = 0.95; }
      if (vd.annulus && rr < 0.44) { var s = 0.44 / (rr || 1e-4); x *= s; y *= s; }
      return { x: x, y: y };
    }
    function walk(x, y, ang, steps, stepLen, branch) {
      var px = x, py = y;
      for (var i = 0; i < steps; i++) {
        ang += (rng() - 0.5) * 0.72;
        var np = clampRing(px + Math.cos(ang) * stepLen, py + Math.sin(ang) * stepLen);
        segs.push({ x1: px, y1: py, x2: np.x, y2: np.y, filled: false, care: 0, branch: branch });
        px = np.x; py = np.y;
        if (Math.hypot(px, py) < vd.stopR) break;
      }
    }
    var startR = vd.annulus ? 0.90 : 0.96;
    var a0 = rng() * Math.PI * 2;
    var nSteps = vd.steps[0] + Math.floor(rng() * (vd.steps[1] - vd.steps[0] + 1));
    /* on the vase the crack spirals: mostly around the shoulder,
     * sinking slowly toward the neck ring as it travels */
    var headAng = vd.annulus ? a0 + Math.PI + 0.85 + (rng() - 0.5) * 0.3
                             : a0 + Math.PI + (rng() - 0.5) * 0.5;
    walk(Math.cos(a0) * startR, Math.sin(a0) * startR, headAng, nSteps, vd.stepLen, false);
    var mainCount = segs.length;
    for (var br = 0; br < vd.branches; br++) {
      var src = segs[Math.floor(mainCount * (0.3 + rng() * 0.35))];
      if (!src) break;
      var bAng = Math.atan2(src.y2 - src.y1, src.x2 - src.x1) + (rng() < 0.5 ? 1 : -1) * (0.6 + rng() * 0.5);
      walk(src.x2, src.y2, bAng, 4 + Math.floor(rng() * 4), vd.stepLen * 0.8, true);
    }
    if (countVisit) {
      visits[person.name] = (visits[person.name] || 0) + 1;
      saveTown();
    }
    bowl = {
      id: ++pieceSeq, personIdx: personIdx, person: person,
      visit: countVisit ? visits[person.name] : (visits[person.name] || 0) + 1,
      vessel: person.vessel, vd: vd, glaze: GLAZES[person.glaze],
      Rv: bowlR * vd.rf, ext: vd.ext,
      seed: seed, segs: segs, complete: false, completeT: 0, filledCount: 0,
      handleAng: -0.35 + rng() * 0.7, spoutAng: Math.PI + (rng() - 0.5) * 0.6
    };
    buildVesselBase();
    if (countVisit && window.MenderyAudio) window.MenderyAudio.knock();
    showPieceWhisper();
  }

  function buildVesselBase() {
    if (!bowl) return;
    bowl.Rv = bowlR * bowl.vd.rf;
    var R = bowl.Rv, gl = bowl.glaze, vt = bowl.vessel;
    var S = Math.ceil(R * 2 * bowl.ext);
    bowlCv = document.createElement('canvas');
    bowlCv.width = Math.round(S * DPR); bowlCv.height = Math.round(S * DPR);
    var b = bowlCv.getContext('2d');
    b.setTransform(DPR, 0, 0, DPR, 0, 0);
    b.translate(S / 2, S / 2);
    /* shadow */
    var sg = b.createRadialGradient(R * 0.08, R * 0.14, R * 0.2, R * 0.08, R * 0.14, R * 1.18);
    sg.addColorStop(0, 'rgba(0,0,0,0.42)'); sg.addColorStop(0.75, 'rgba(0,0,0,0.25)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = sg; b.beginPath(); b.arc(R * 0.08, R * 0.14, R * 1.18, 0, 6.2832); b.fill();
    /* appendages first — the body circle will hide their joints */
    if (vt === 'cup') {
      var ha = bowl.handleAng, hx = Math.cos(ha) * R * 1.04, hy = Math.sin(ha) * R * 1.04;
      b.strokeStyle = gl.body[3]; b.lineWidth = R * 0.115;
      b.beginPath(); b.arc(hx, hy, R * 0.30, 0, 6.2832); b.stroke();
      b.strokeStyle = gl.body[1]; b.lineWidth = R * 0.075;
      b.beginPath(); b.arc(hx, hy, R * 0.30, 0, 6.2832); b.stroke();
    }
    if (vt === 'teapot') {
      var sa = bowl.spoutAng;
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
      b.fillStyle = '#4a3220'; b.beginPath(); b.arc(0, 0, R * 0.075, 0, 6.2832); b.fill();
      b.fillStyle = 'rgba(255,230,180,0.5)'; b.beginPath(); b.arc(-R * 0.025, -R * 0.028, R * 0.02, 0, 6.2832); b.fill();
    } else {
      /* the well — deepest at the centre, light on the walls */
      var wg = b.createRadialGradient(0, R * 0.05, R * 0.05, 0, 0, R * (bowl.vd.well + 0.02));
      wg.addColorStop(0, gl.well[0]); wg.addColorStop(0.5, gl.well[1]);
      wg.addColorStop(0.8, gl.well[2]); wg.addColorStop(1, gl.well[3]);
      b.fillStyle = wg; b.beginPath(); b.arc(0, 0, R * bowl.vd.well, 0, 6.2832); b.fill();
      b.strokeStyle = 'rgba(60,44,26,0.28)'; b.lineWidth = R * 0.05;
      b.beginPath(); b.arc(0, 0, R * (bowl.vd.well - 0.035), Math.PI * 0.25, Math.PI * 0.85); b.stroke();
      if (vt === 'cup') {
        var cg = b.createRadialGradient(0, 0, 1, 0, 0, R * 0.37);
        cg.addColorStop(0, gl.well[3]); cg.addColorStop(0.72, gl.well[3]); cg.addColorStop(1, gl.well[2]);
        b.fillStyle = cg; b.globalAlpha = 0.5;
        b.beginPath(); b.arc(0, 0, R * 0.37, 0, 6.2832); b.fill();
        b.globalAlpha = 1;
      }
    }
    /* rim light + edge */
    b.strokeStyle = 'rgba(255,252,240,0.45)'; b.lineWidth = R * 0.016;
    b.beginPath(); b.arc(0, 0, R * 0.985, Math.PI * 1.05, Math.PI * 1.55); b.stroke();
    b.strokeStyle = 'rgba(40,30,18,0.35)'; b.lineWidth = R * 0.02;
    b.beginPath(); b.arc(0, 0, R * 0.995, 0, 6.2832); b.stroke();
    /* speckle */
    var rngS = mulberry32(bowl.seed * 7 + 3);
    for (var i = 0; i < 420; i++) {
      var sa2 = rngS() * 6.2832, sr = Math.sqrt(rngS()) * R * 0.97;
      b.fillStyle = rngS() < 0.12 ? 'rgba(190,150,60,0.10)' : 'rgba(' + gl.speck + ',' + (0.02 + rngS() * 0.04) + ')';
      b.beginPath(); b.arc(Math.cos(sa2) * sr, Math.sin(sa2) * sr, 0.6 + rngS() * 1.1, 0, 6.2832); b.fill();
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
    bowl.S = S;
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
      r: big ? 1.6 + Math.random() * 1.6 : 0.8 + Math.random() * 1.1
    });
  }

  /* ================= input ================= */
  var tracing = false, lastMove = null, fadeSwap = 0, swapDone = false;

  function toBowlSpace(cxPx, cyPx) {
    return { x: (cxPx - bowlC.x) / bowl.Rv, y: (cyPx - bowlC.y) / bowl.Rv };
  }
  function doTrace(cxPx, cyPx, stamp) {
    if (!bowl || bowl.complete || fadeSwap > 0) return;
    var AU = window.MenderyAudio;
    var p = toBowlSpace(cxPx, cyPx);
    if (Math.hypot(p.x, p.y) > 1.12) { lastMove = null; if (AU) AU.drag(0); return; }
    var speed = 0;
    if (lastMove) {
      var dtm = Math.max(1, stamp - lastMove.stamp) / 1000;
      speed = Math.hypot(p.x - lastMove.x, p.y - lastMove.y) / dtm;
    }
    lastMove = { x: p.x, y: p.y, stamp: stamp };
    if (AU) AU.drag(speed);
    var TOL = 0.085, batchCare = -1;
    for (var i = 0; i < bowl.segs.length; i++) {
      var s = bowl.segs[i];
      if (s.filled) continue;
      var d = segDist(p.x, p.y, s);
      if (d < TOL) {
        s.filled = true;
        s.care = clamp(1.12 - speed * 0.5 - d * 4.5, 0.3, 1);
        if (s.care > batchCare) batchCare = s.care;
        bowl.filledCount++;
        spawnSparkle(bowlC.x + (s.x1 + s.x2) / 2 * bowl.Rv, bowlC.y + (s.y1 + s.y2) / 2 * bowl.Rv, false);
      }
    }
    if (batchCare >= 0 && AU) AU.tick(batchCare);
    if (progress() >= 0.985 && !bowl.complete) completeBowl();
  }
  function completeBowl() {
    bowl.complete = true;
    bowl.completeT = elapsed;
    bowl.segs.forEach(function (s) { if (!s.filled) { s.filled = true; s.care = 0.8; bowl.filledCount++; } });
    for (var i = 0; i < 18; i++) {
      var a = Math.random() * 6.2832, rr = Math.random() * bowl.Rv * 0.7;
      spawnSparkle(bowlC.x + Math.cos(a) * rr, bowlC.y + Math.sin(a) * rr, true);
    }
    mendedCount++;
    saveTown();
    if (window.MenderyAudio) window.MenderyAudio.bell();
    setWhisper('mended:' + bowl.id, 'Mended.', bowl.person.closing);
  }
  cv.addEventListener('pointerdown', function (e) {
    if (window.MenderyAudio) window.MenderyAudio.wake();
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
    if (tracing) doTrace(e.clientX, e.clientY, e.timeStamp);
  });
  function endTrace() {
    tracing = false; lastMove = null;
    if (window.MenderyAudio) window.MenderyAudio.drag(0);
  }
  cv.addEventListener('pointerup', endTrace);
  cv.addEventListener('pointercancel', endTrace);
  window.addEventListener('blur', endTrace);

  /* ================= whisper ================= */
  var whisperKey = '__boot', bootGreeting = false, bootT = 0;
  function setWhisper(key, main, sub) {
    if (key === whisperKey) return;
    whisperKey = key;
    if (!main) { whisperEl.classList.remove('show'); return; }
    whisperMain.textContent = main;
    whisperSub.textContent = sub || '';
    whisperEl.classList.add('show');
  }
  function pieceKey() { return 'piece:' + (bowl ? bowl.id : 0); }
  function showPieceWhisper() {
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
  var elapsed = 0, lastT = 0, raf = 0;
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

    if (bowlCv && bowl) {
      var S = bowl.S || Math.ceil(bowl.Rv * 2 * bowl.ext);
      ctx.globalAlpha = fadeAlpha;
      ctx.drawImage(bowlCv, bowlC.x - S / 2, bowlC.y - S / 2, S, S);
      var pulse = bowl.complete ? Math.max(0, 1 - (t - bowl.completeT) / 2.2) : 0;
      var glow = 1 + pulse * 0.9;
      var Rv = bowl.Rv;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (var i = 0; i < bowl.segs.length; i++) {
        var s = bowl.segs[i];
        if (!s.filled) continue;
        var cw = 0.6 + s.care * 0.65;
        var sx1 = bowlC.x + s.x1 * Rv, sy1 = bowlC.y + s.y1 * Rv;
        var sx2 = bowlC.x + s.x2 * Rv, sy2 = bowlC.y + s.y2 * Rv;
        ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2);
        ctx.strokeStyle = 'rgba(138,90,23,0.85)'; ctx.lineWidth = Rv * 0.021 * cw * glow; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2);
        ctx.strokeStyle = 'rgba(224,164,54,0.95)'; ctx.lineWidth = Rv * 0.012 * cw * glow; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2);
        ctx.strokeStyle = 'rgba(255,233,168,' + (0.30 + s.care * 0.35 + pulse * 0.3) + ')';
        ctx.lineWidth = Rv * 0.005 * cw * glow; ctx.stroke();
      }
      ctx.beginPath();
      var anyOpen = false;
      for (var j = 0; j < bowl.segs.length; j++) {
        var o = bowl.segs[j];
        if (o.filled) continue;
        anyOpen = true;
        ctx.moveTo(bowlC.x + o.x1 * Rv, bowlC.y + o.y1 * Rv);
        ctx.lineTo(bowlC.x + o.x2 * Rv, bowlC.y + o.y2 * Rv);
      }
      if (anyOpen) {
        ctx.strokeStyle = 'rgba(36,24,13,0.92)';
        ctx.lineWidth = Math.max(1.6, Rv * 0.011);
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
      ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r * la + 0.3, 0, 6.2832); ctx.fill();
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

    /* whisper upkeep */
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
  var totalVisits = 0;
  for (var vk in visits) totalVisits += visits[vk];
  if (mendedCount === 0 && totalVisits <= 1) {
    bootGreeting = true; bootT = 0;
    setWhisper('title', 'The Mendery', 'bring me your broken things');
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
