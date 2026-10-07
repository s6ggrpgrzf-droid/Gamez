/* UNFOLD — Inspect mode: full-orbit 3D centerpiece viewer (pure CSS 3D).
 * Each room's signature object becomes a real cuboid you can pick up and
 * turn over: drag to orbit 360° on both axes, pinch to zoom, double-tap
 * (or the button) to swing the lid open on its hinge. No WebGL, no deps. */
(function () {
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function G() { return (window.__unfold && window.__unfold.G) || null; }
  function sfx(name) { try { if (window.Sfx && Sfx[name]) Sfx[name](); } catch (e) {} }

  /* ---------- tiny svg helpers ---------- */
  function svg(w, h, body) {
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:100%;display:block">' + body + '</svg>';
  }
  function lg(id, c1, c2, c3, vert) {
    var x2 = vert === false ? '1' : '0', y2 = vert === false ? '0' : '1';
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="' + x2 + '" y2="' + y2 + '">' +
      '<stop offset="0" stop-color="' + c1 + '"/><stop offset=".55" stop-color="' + c2 + '"/>' +
      '<stop offset="1" stop-color="' + (c3 || c2) + '"/></linearGradient>';
  }
  function rim(w, h) { // gold edge light on every outer face
    return '<rect x="1" y="1" width="' + (w - 2) + '" height="' + (h - 2) + '" fill="none" stroke="#e8b34b" stroke-opacity=".38" stroke-width="2"/>';
  }
  function scuffs(w, h, n, seed) { // deterministic scratches
    var s = '', x = seed;
    function rnd() { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }
    for (var i = 0; i < n; i++) {
      var sx = rnd() * w, sy = rnd() * h, len = 6 + rnd() * 22, a = rnd() * Math.PI;
      s += '<line x1="' + sx.toFixed(1) + '" y1="' + sy.toFixed(1) + '" x2="' + (sx + Math.cos(a) * len).toFixed(1) +
        '" y2="' + (sy + Math.sin(a) * len).toFixed(1) + '" stroke="#000" stroke-opacity=".22" stroke-width="1.4"/>';
    }
    return s;
  }
  function gingham(w, h, base, stripe) {
    var s = '<rect width="' + w + '" height="' + h + '" fill="' + base + '"/>';
    for (var x = 0; x < w; x += 26) s += '<rect x="' + x + '" width="13" height="' + h + '" fill="' + stripe + '" opacity=".45"/>';
    for (var y = 0; y < h; y += 26) s += '<rect y="' + y + '" width="' + w + '" height="13" fill="' + stripe + '" opacity=".45"/>';
    return s;
  }
  function felt(w, h, base, seed) {
    var s = '<rect width="' + w + '" height="' + h + '" fill="' + base + '"/>', x = seed;
    function rnd() { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }
    for (var i = 0; i < 90; i++) {
      s += '<circle cx="' + (rnd() * w).toFixed(1) + '" cy="' + (rnd() * h).toFixed(1) + '" r="' + (1 + rnd() * 2).toFixed(1) +
        '" fill="#fff" opacity="' + (0.02 + rnd() * 0.05).toFixed(2) + '"/>';
    }
    return s;
  }

  /* ================= LUNCHBOX (300 x 200 x 150, lid 64) ================= */
  var LB = { W: 300, H: 200, D: 150, lidH: 64 };
  function lbFront() {
    return svg(300, 200, '<defs>' + lg('lbf', '#e0574a', '#c0392b', '#8e2318') + '</defs>' +
      '<rect width="300" height="200" fill="url(#lbf)"/>' +
      '<rect width="300" height="58" fill="#fff" opacity=".09"/>' +
      '<rect y="168" width="300" height="32" fill="#000" opacity=".20"/>' +
      scuffs(300, 200, 7, 41) + rim(300, 200) +
      '<g transform="translate(234,138)"><rect x="-36" y="-32" width="72" height="64" rx="11" fill="#f7f3e8"/>' +
      '<rect x="-36" y="-32" width="72" height="64" rx="11" fill="none" stroke="#d8cdb4" stroke-width="2"/>' +
      '<circle cx="0" cy="-9" r="13" fill="#d94f3d"/><rect x="-2" y="-26" width="4" height="11" rx="2" fill="#5a7d3a"/>' +
      '<text y="23" text-anchor="middle" font-size="13.5" font-weight="700" fill="#5e140d">No. 407</text></g>');
  }
  function lbBack() {
    return svg(300, 200, '<defs>' + lg('lbb', '#d34a3a', '#b03324', '#7e1f14') + '</defs>' +
      '<rect width="300" height="200" fill="url(#lbb)"/>' +
      '<rect width="300" height="50" fill="#fff" opacity=".07"/>' +
      '<rect y="172" width="300" height="28" fill="#000" opacity=".20"/>' +
      scuffs(300, 200, 12, 97) + rim(300, 200) +
      '<g transform="translate(150,100)"><rect x="-52" y="-40" width="104" height="80" rx="12" fill="#f7f3e8" opacity=".94"/>' +
      '<circle cx="0" cy="-8" r="17" fill="#d94f3d"/><rect x="-2.5" y="-32" width="5" height="13" rx="2.5" fill="#5a7d3a"/>' +
      '<path d="M14 -22 q12 -8 22 -2" stroke="#5a7d3a" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<text y="28" text-anchor="middle" font-size="15" font-weight="700" fill="#5e140d">No. 407</text></g>');
  }
  function lbSide() {
    return svg(150, 200, '<defs>' + lg('lbs', '#cf4636', '#b03324', '#862218') + '</defs>' +
      '<rect width="150" height="200" fill="url(#lbs)"/>' +
      '<rect width="150" height="52" fill="#fff" opacity=".08"/>' +
      '<rect y="170" width="150" height="30" fill="#000" opacity=".20"/>' +
      '<rect x="18" y="14" width="14" height="172" rx="7" fill="#8f9aa3"/>' +
      '<rect x="18" y="14" width="14" height="172" rx="7" fill="none" stroke="#5c656d" stroke-width="1.5"/>' +
      '<rect x="118" y="14" width="14" height="172" rx="7" fill="#8f9aa3"/>' +
      '<rect x="118" y="14" width="14" height="172" rx="7" fill="none" stroke="#5c656d" stroke-width="1.5"/>' +
      [40, 100, 160].map(function (y) {
        return '<circle cx="25" cy="' + y + '" r="3.4" fill="#d7dee3"/><circle cx="125" cy="' + y + '" r="3.4" fill="#d7dee3"/>';
      }).join('') + scuffs(150, 200, 5, 7) + rim(150, 200));
  }
  function lbBottom() {
    return svg(300, 150, '<rect width="300" height="150" fill="#5e140d"/>' +
      '<rect width="300" height="150" fill="#000" opacity=".25"/>' + rim(300, 150));
  }
  function lbLidTop() {
    return svg(300, 150, '<defs>' + lg('lblt', '#e86a58', '#c0392b', '#93301f') +
      '<radialGradient id="lblts" cx=".5" cy=".38" r=".65"><stop offset="0" stop-color="#fff" stop-opacity=".16"/>' +
      '<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="300" height="150" fill="url(#lblt)"/><rect width="300" height="150" fill="url(#lblts)"/>' +
      '<rect x="86" y="58" width="34" height="16" rx="4" fill="#3a3a3f"/>' +   // handle mounts
      '<rect x="180" y="58" width="34" height="16" rx="4" fill="#3a3a3f"/>' +
      scuffs(300, 150, 4, 53) + rim(300, 150));
  }
  function lbLidFront() {
    return svg(300, 64, '<defs>' + lg('lblf', '#d34a3a', '#b03324', '#7e1f14') + '</defs>' +
      '<rect width="300" height="64" fill="url(#lblf)"/>' +
      '<rect width="300" height="18" fill="#fff" opacity=".08"/>' + rim(300, 64) +
      '<g transform="translate(150,32)"><rect x="-26" y="-24" width="52" height="48" rx="9" fill="url(#lblf)" stroke="#e8b34b" stroke-width="3"/>' +
      '<circle cx="0" cy="-6" r="7" fill="#2a120c"/><rect x="-3.5" y="-4" width="7" height="14" rx="3" fill="#2a120c"/></g>');
  }
  function lbLidEdge() {
    return svg(150, 64, '<defs>' + lg('lble', '#c74333', '#a52e20', '#771c12') + '</defs>' +
      '<rect width="150" height="64" fill="url(#lble)"/><rect width="150" height="16" fill="#fff" opacity=".07"/>' + rim(150, 64));
  }
  function lbLidBack() {
    return svg(300, 64, '<defs>' + lg('lblb', '#c74333', '#a52e20', '#771c12') + '</defs>' +
      '<rect width="300" height="64" fill="url(#lblb)"/>' +
      '<rect x="60" y="20" width="40" height="24" rx="5" fill="#8f9aa3"/><rect x="200" y="20" width="40" height="24" rx="5" fill="#8f9aa3"/>' +
      rim(300, 64));
  }
  var lbModel = {
    short: 'the lunchbox', title: 'Inspecting the lunchbox', dims: LB,
    faces: { front: lbFront, back: lbBack, left: lbSide, right: lbSide, bottom: lbBottom },
    lid: { top: lbLidTop, front: lbLidFront, back: lbLidBack, left: lbLidEdge, right: lbLidEdge },
    lining: function (w, h) { return svg(w, h, gingham(w, h, '#f3ead6', '#d94f3d')); },
    extras: extrasLunchbox
  };
  function extrasLunchbox(M, P, cuboid, place) {
    // 3D handle bar riding on the lid top (moves with the lid). It lives in a
    // folding group: when the lid opens the handle flops flat against the lid
    // instead of swinging rigidly down into the box interior.
    var steel = { top: '#aeb8bf', front: '#8f9aa3', side: '#6e787f' };
    var handleG = P('div', 'ins-handleg');
    place(cuboid(12, 22, 12, steel), -46, -11, 0, handleG);
    place(cuboid(12, 22, 12, steel), 46, -11, 0, handleG);
    place(cuboid(104, 12, 18, steel), 0, -26, 0, handleG);
    handleG.style.transform = 'translate3d(0px,' + (-LB.lidH) + 'px,' + (LB.D / 2) + 'px)';
    M.lidG.appendChild(handleG);
    M.handleG = handleG;
    // sandwich + note inside the box, riding on a raised tray insert
    var bread = { top: '#eec27f', front: '#d9a75e', side: '#c08f4c' };
    var lettuce = { top: '#8fce7e', front: '#6db35f', side: '#54944a' };
    var cream = { top: '#f3ead6', front: '#d8c9a8', side: '#b3a37f' };
    place(cuboid(264, 16, 120, cream), 0, -2, 0, M.bodyG); // tray insert
    place(cuboid(120, 10, 88, bread), -30, -15, 8, M.bodyG);
    place(cuboid(128, 7, 94, lettuce), -30, -23.5, 8, M.bodyG);
    place(cuboid(120, 10, 88, bread), -30, -32, 8, M.bodyG);
    // note: a face keeps its own transform, so it needs a positioning wrapper
    // (place() would overwrite the face's rotateX/centering)
    var noteWrap = P('div', 'ins-prop');
    noteWrap.appendChild(M.face(92, 64, 0, 0, 0, 90, 14,
      svg(92, 64, '<rect width="92" height="64" fill="#fbf7ec"/>' +
        '<rect width="92" height="64" fill="none" stroke="#d8cdb4" stroke-width="2"/>' +
        [14, 26, 38, 50].map(function (y) { return '<line x1="12" y1="' + y + '" x2="80" y2="' + y + '" stroke="#8a7f6a" stroke-width="2" opacity=".7"/>'; }).join('') +
        '<circle cx="78" cy="12" r="5" fill="#d94f3d" opacity=".8"/>')));
    place(noteWrap, 62, -12, -18, M.bodyG);
  }

  /* ================= TOOLBOX (320 x 170 x 160, lid 56) ================= */
  var TB = { W: 320, H: 170, D: 160, lidH: 56 };
  function tbFront() {
    var brush = '';
    for (var i = 0; i < 9; i++) brush += '<rect y="' + (18 + i * 16) + '" width="320" height="3" fill="#fff" opacity=".05"/>';
    return svg(320, 170, '<defs>' + lg('tbf', '#7d8fa0', '#5f7282', '#42505c') + '</defs>' +
      '<rect width="320" height="170" fill="url(#tbf)"/>' + brush +
      '<rect width="320" height="44" fill="#fff" opacity=".08"/>' +
      '<rect y="142" width="320" height="28" fill="#000" opacity=".22"/>' +
      '<g transform="translate(160,86)"><rect x="-72" y="-20" width="144" height="40" rx="6" fill="#2c353d"/>' +
      '<text y="7" text-anchor="middle" font-size="16" letter-spacing="4" fill="#e8b34b" font-family="Georgia,serif">PIP &amp; CO.</text></g>' +
      scuffs(320, 170, 8, 23) + rim(320, 170));
  }
  function tbBack() {
    var vents = '';
    for (var i = 0; i < 6; i++) vents += '<rect x="' + (60 + i * 36) + '" y="60" width="10" height="52" rx="5" fill="#2c353d" opacity=".8"/>';
    return svg(320, 170, '<defs>' + lg('tbb', '#748695', '#57687a', '#3c4a56') + '</defs>' +
      '<rect width="320" height="170" fill="url(#tbb)"/>' +
      '<rect width="320" height="40" fill="#fff" opacity=".07"/>' + vents +
      scuffs(320, 170, 10, 61) + rim(320, 170));
  }
  function tbSide() {
    return svg(160, 170, '<defs>' + lg('tbs', '#7d8fa0', '#5f7282', '#42505c') + '</defs>' +
      '<rect width="160" height="170" fill="url(#tbs)"/>' +
      '<rect width="160" height="40" fill="#fff" opacity=".08"/>' +
      '<rect y="144" width="160" height="26" fill="#000" opacity=".22"/>' +
      '<rect x="52" y="8" width="56" height="26" rx="5" fill="#e8b34b"/>' +  // latch housing
      '<rect x="52" y="8" width="56" height="26" rx="5" fill="none" stroke="#8a6a24" stroke-width="2"/>' +
      '<circle cx="80" cy="21" r="5" fill="#2c353d"/>' +
      scuffs(160, 170, 5, 11) + rim(160, 170));
  }
  function tbBottom() {
    return svg(320, 160, '<rect width="320" height="160" fill="#232a31"/>' + rim(320, 160));
  }
  function tbLidTop() {
    return svg(320, 160, '<defs>' + lg('tblt', '#8a9dab', '#66788a', '#485665') +
      '<radialGradient id="tblts" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".14"/>' +
      '<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="320" height="160" fill="url(#tblt)"/><rect width="320" height="160" fill="url(#tblts)"/>' +
      '<rect x="96" y="64" width="34" height="16" rx="4" fill="#2c353d"/>' +
      '<rect x="190" y="64" width="34" height="16" rx="4" fill="#2c353d"/>' +
      scuffs(320, 160, 5, 77) + rim(320, 160));
  }
  function tbLidFront() {
    return svg(320, 56, '<defs>' + lg('tblf', '#748695', '#57687a', '#3c4a56') + '</defs>' +
      '<rect width="320" height="56" fill="url(#tblf)"/>' +
      '<rect width="320" height="16" fill="#fff" opacity=".08"/>' + rim(320, 56) +
      [96, 224].map(function (x) {
        return '<g transform="translate(' + x + ',28)"><rect x="-24" y="-20" width="48" height="40" rx="7" fill="#e8b34b" stroke="#8a6a24" stroke-width="2"/>' +
          '<rect x="-8" y="-6" width="16" height="16" rx="3" fill="#2c353d"/></g>';
      }).join(''));
  }
  function tbLidEdge() {
    return svg(160, 56, '<defs>' + lg('tble', '#6b7d8c', '#4e5e6c', '#39454f') + '</defs>' +
      '<rect width="160" height="56" fill="url(#tble)"/><rect width="160" height="14" fill="#fff" opacity=".07"/>' + rim(160, 56));
  }
  function tbLidBack() {
    return svg(320, 56, '<defs>' + lg('tblb', '#6b7d8c', '#4e5e6c', '#39454f') + '</defs>' +
      '<rect width="320" height="56" fill="url(#tblb)"/>' +
      '<rect x="70" y="16" width="44" height="24" rx="5" fill="#8f9aa3"/><rect x="206" y="16" width="44" height="24" rx="5" fill="#8f9aa3"/>' +
      rim(320, 56));
  }
  var tbModel = {
    short: 'the toolbox', title: 'Inspecting the toolbox', dims: TB,
    faces: { front: tbFront, back: tbBack, left: tbSide, right: tbSide, bottom: tbBottom },
    lid: { top: tbLidTop, front: tbLidFront, back: tbLidBack, left: tbLidEdge, right: tbLidEdge },
    lining: function (w, h) { return svg(w, h, felt(w, h, '#2e4038', 31)); },
    extras: extrasToolbox
  };
  function extrasToolbox(M, P, cuboid, place) {
    var steel = { top: '#c3ccd3', front: '#9aa6ae', side: '#78838b' };
    var dark = { top: '#3a434b', front: '#2c353d', side: '#20262c' };
    var red = { top: '#d94f3d', front: '#b03324', side: '#8e2318' };
    var handleG = P('div', 'ins-handleg');
    place(cuboid(12, 22, 12, dark), -48, -11, 0, handleG);
    place(cuboid(12, 22, 12, dark), 48, -11, 0, handleG);
    place(cuboid(108, 13, 20, dark), 0, -27, 0, handleG);
    handleG.style.transform = 'translate3d(0px,' + (-TB.lidH) + 'px,' + (TB.D / 2) + 'px)';
    M.lidG.appendChild(handleG);
    M.handleG = handleG;
    // top tray with tools, riding high like a real toolbox tray
    place(cuboid(280, 22, 130, dark), 0, -40, 0, M.bodyG);
    var trayTop = -51;
    var wr = cuboid(96, 9, 18, steel); place(wr, -40, trayTop - 4.5, -12, M.bodyG);
    wr.style.transform += ' rotateY(10deg)';
    var hd = cuboid(44, 12, 20, red); place(hd, 52, trayTop - 6, 18, M.bodyG);
    hd.style.transform += ' rotateY(-14deg)';
    var sh = cuboid(72, 7, 9, steel); place(sh, 104, trayTop - 3.5, 4, M.bodyG);
    sh.style.transform += ' rotateY(-14deg)';
  }

  /* ================= MUSIC BOX (260 x 150 x 190, lid 44) ================= */
  var MB = { W: 260, H: 150, D: 190, lidH: 44 };
  function mbInlay(w, h) {
    return '<rect x="10" y="10" width="' + (w - 20) + '" height="' + (h - 20) + '" fill="none" stroke="#e8b34b" stroke-width="2.5" opacity=".85"/>' +
      '<rect x="16" y="16" width="' + (w - 32) + '" height="' + (h - 32) + '" fill="none" stroke="#e8b34b" stroke-width="1" opacity=".5"/>';
  }
  function mbFront() {
    return svg(260, 150, '<defs>' + lg('mbf', '#5a3d26', '#4a3220', '#33220f') + '</defs>' +
      '<rect width="260" height="150" fill="url(#mbf)"/>' +
      '<rect width="260" height="40" fill="#fff" opacity=".06"/>' + mbInlay(260, 150) +
      '<g transform="translate(130,86)"><circle r="15" fill="#e8b34b"/><circle r="15" fill="none" stroke="#8a6a24" stroke-width="2"/>' +
      '<circle r="5.5" fill="#2a1a0c"/><rect x="-2.5" y="2" width="5" height="11" rx="2.5" fill="#2a1a0c"/></g>' +
      scuffs(260, 150, 4, 17) + rim(260, 150));
  }
  function mbBack() {
    return svg(260, 150, '<defs>' + lg('mbb', '#523722', '#422b1a', '#2c1d10') + '</defs>' +
      '<rect width="260" height="150" fill="url(#mbb)"/>' + mbInlay(260, 150) +
      '<rect x="52" y="12" width="40" height="22" rx="5" fill="#e8b34b" opacity=".9"/>' +
      '<rect x="168" y="12" width="40" height="22" rx="5" fill="#e8b34b" opacity=".9"/>' +
      scuffs(260, 150, 4, 29) + rim(260, 150));
  }
  function mbLeft() {
    return svg(190, 150, '<defs>' + lg('mbl', '#5a3d26', '#4a3220', '#33220f') + '</defs>' +
      '<rect width="190" height="150" fill="url(#mbl)"/>' + mbInlay(190, 150) + scuffs(190, 150, 3, 5) + rim(190, 150));
  }
  function mbRight() { // crank hole at local (135, 75)
    return svg(190, 150, '<defs>' + lg('mbr', '#5a3d26', '#4a3220', '#33220f') + '</defs>' +
      '<rect width="190" height="150" fill="url(#mbr)"/>' + mbInlay(190, 150) +
      '<circle cx="135" cy="75" r="14" fill="#e8b34b" opacity=".9"/><circle cx="135" cy="75" r="9" fill="#170d05"/>' +
      scuffs(190, 150, 3, 9) + rim(190, 150));
  }
  function mbBottom() {
    return svg(260, 190, '<rect width="260" height="190" fill="#1d1108"/>' + rim(260, 190));
  }
  function mbLidTop() {
    var staff = '';
    for (var i = 0; i < 5; i++) staff += '<line x1="40" y1="' + (52 + i * 9) + '" x2="220" y2="' + (52 + i * 9) + '" stroke="#e8b34b" stroke-width="1.4" opacity=".55"/>';
    var notes = [[70, 66], [104, 58], [138, 70], [172, 54], [198, 62]].map(function (p) {
      return '<ellipse cx="' + p[0] + '" cy="' + p[1] + '" rx="6" ry="4.5" fill="#e8b34b" opacity=".8" transform="rotate(-18 ' + p[0] + ' ' + p[1] + ')"/>' +
        '<line x1="' + (p[0] + 5) + '" y1="' + p[1] + '" x2="' + (p[0] + 5) + '" y2="' + (p[1] - 22) + '" stroke="#e8b34b" stroke-width="2" opacity=".8"/>';
    }).join('');
    return svg(260, 190, '<defs>' + lg('mblt', '#63432b', '#4e3421', '#38240f') +
      '<radialGradient id="mblts" cx=".5" cy=".4" r=".62"><stop offset="0" stop-color="#fff" stop-opacity=".12"/>' +
      '<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="260" height="190" fill="url(#mblt)"/><rect width="260" height="190" fill="url(#mblts)"/>' +
      '<ellipse cx="130" cy="95" rx="86" ry="60" fill="none" stroke="#e8b34b" stroke-width="3" opacity=".9"/>' +
      '<ellipse cx="130" cy="95" rx="78" ry="52" fill="none" stroke="#e8b34b" stroke-width="1" opacity=".5"/>' +
      staff + notes + scuffs(260, 190, 3, 43) + rim(260, 190));
  }
  function mbLidFront() {
    return svg(260, 44, '<defs>' + lg('mblf', '#523722', '#422b1a', '#2c1d10') + '</defs>' +
      '<rect width="260" height="44" fill="url(#mblf)"/>' +
      '<g transform="translate(130,22)"><rect x="-16" y="-15" width="32" height="30" rx="6" fill="#e8b34b" stroke="#8a6a24" stroke-width="2"/>' +
      '<circle r="5" fill="#2a1a0c"/></g>' + rim(260, 44));
  }
  function mbLidEdge() {
    return svg(190, 44, '<defs>' + lg('mble', '#4c3420', '#3c2817', '#291b0e') + '</defs>' +
      '<rect width="190" height="44" fill="url(#mble)"/>' + rim(190, 44));
  }
  var mbModel = {
    short: 'the music box', title: 'Inspecting the music box', dims: MB,
    faces: { front: mbFront, back: mbBack, left: mbLeft, right: mbRight, bottom: mbBottom },
    lid: { top: mbLidTop, front: mbLidFront, back: mbLidEdge, left: mbLidEdge, right: mbLidEdge },
    lining: function (w, h) { return svg(w, h, felt(w, h, '#5e1f28', 71)); },
    extras: extrasMusicbox
  };
  function extrasMusicbox(M, P, cuboid, place) {
    var gold = { top: '#ffe9a8', front: '#e8b34b', side: '#b98a2e' };
    var wood = { top: '#5a3d26', front: '#422b1a', side: '#2c1d10' };
    var y0 = MB.H / 2 - 10;
    // movement platform + golden pinned drum on posts, riding high
    place(cuboid(150, 16, 110, wood), 0, 10, 0, M.bodyG);
    // drum: static positioning wrapper outside, spinning element inside
    // (a CSS animation would override the wrapper's translate3d)
    var drumPos = P('div', 'ins-prop');
    drumPos.style.transform = 'translate3d(0px,-14px,0px)';
    var drum = cuboid(110, 32, 32, gold);
    drum.classList.add('ins-drum');
    drumPos.appendChild(drum);
    M.bodyG.appendChild(drumPos);
    place(cuboid(10, 40, 10, wood), -62, -6, 0, M.bodyG);
    place(cuboid(10, 40, 10, wood), 62, -6, 0, M.bodyG);
    // winding crank on the right face (spins while the lid is open)
    var crankPos = P('div', 'ins-prop');
    crankPos.style.transform = 'translate3d(' + (MB.W / 2) + 'px,0px,40px)';
    var crank = P('div', 'ins-crank');
    var grip = { top: '#c99a5e', front: '#a5763d', side: '#7d5627' };
    P.place(cuboid(20, 11, 11, gold), 10, 0, 0, crank);
    P.place(cuboid(10, 44, 10, gold), 20, -11, 0, crank);
    P.place(cuboid(18, 10, 10, grip), 29, -28, 0, crank);
    crankPos.appendChild(crank);
    M.bodyG.appendChild(crankPos);
  }

  var MODELS = { lunchbox: lbModel, toolbox: tbModel, musicbox: mbModel };

  /* ---------- dom + 3d construction ---------- */
  function P(tag, cls) { var d = document.createElement(tag || 'div'); if (cls) d.className = cls; return d; }
  function div(cls) { return P('div', cls); }
  function face(w, h, x, y, z, rx, ry, inner) {
    var d = P('div', 'ins-face');
    d.style.width = w + 'px'; d.style.height = h + 'px';
    d.style.transform = 'translate(-50%,-50%) translate3d(' + x + 'px,' + y + 'px,' + z + 'px)' +
      ' rotateX(' + rx + 'deg) rotateY(' + ry + 'deg)';
    // model-space normal = Rx(rx)·Ry(ry)·(0,0,1), CSS coords (+y = down).
    // NOTE: rotateX(+90) tips the normal UP (-y); rotateX(-90) tips it DOWN.
    var a = rx * Math.PI / 180, b = ry * Math.PI / 180;
    d._nx = Math.sin(b);
    d._ny = -Math.sin(a) * Math.cos(b);
    d._nz = Math.cos(a) * Math.cos(b);
    if (inner) d.innerHTML = inner;
    return d;
  }
  function solid(c) { return '<div class="pf" style="background:' + c + '"></div>'; }
  function cuboid(w, h, d, c) { // tiny shaded box, centered on its origin
    var g = P('div', 'ins-prop');
    g.appendChild(face(w, h, 0, 0, d / 2, 0, 0, solid(c.front)));
    g.appendChild(face(w, h, 0, 0, -d / 2, 0, 180, solid(c.front)));
    g.appendChild(face(d, h, w / 2, 0, 0, 0, 90, solid(c.side)));
    g.appendChild(face(d, h, -w / 2, 0, 0, 0, -90, solid(c.side)));
    g.appendChild(face(w, d, 0, -h / 2, 0, 90, 0, solid(c.top)));
    g.appendChild(face(w, d, 0, h / 2, 0, -90, 0, solid(c.side)));
    return g;
  }
  function placeProp(el, x, y, z, parent, extra) {
    el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,' + z + 'px)' + (extra ? ' ' + extra : '');
    parent.appendChild(el);
    return el;
  }
  P.place = placeProp;

  var shadeFaces = []; // per-model dynamic-lighting registry, rebuilt in buildModel
  function regShade(f, isLid) {
    var s = P('div', 'ins-shade');
    f.appendChild(s);
    shadeFaces.push({ sh: s, nx: f._nx, ny: f._ny, nz: f._nz, lid: !!isLid });
  }

  function buildModel(def) {
    var Dm = def.dims, W = Dm.W, H = Dm.H, D = Dm.D, lidH = Dm.lidH;
    var model = document.getElementById('inspect-model');
    model.innerHTML = '';
    shadeFaces = [];
    var bodyG = div('ins-body');
    regShade(bodyG.appendChild(face(W, H, 0, 0, D / 2, 0, 0, def.faces.front())), false);
    regShade(bodyG.appendChild(face(W, H, 0, 0, -D / 2, 0, 180, def.faces.back())), false);
    regShade(bodyG.appendChild(face(D, H, W / 2, 0, 0, 0, 90, def.faces.right())), false);
    regShade(bodyG.appendChild(face(D, H, -W / 2, 0, 0, 0, -90, def.faces.left())), false);
    regShade(bodyG.appendChild(face(W, D, 0, H / 2, 0, -90, 0, def.faces.bottom())), false);
    // interior tub (lining), slightly inset
    regShade(bodyG.appendChild(face(W - 16, D - 16, 0, H / 2 - 10, 0, 90, 0, def.lining(W - 16, D - 16))), false);
    regShade(bodyG.appendChild(face(W - 16, H - 16, 0, -1, D / 2 - 9, 0, 180, def.lining(W - 16, H - 16))), false);
    regShade(bodyG.appendChild(face(W - 16, H - 16, 0, -1, -(D / 2 - 9), 0, 0, def.lining(W - 16, H - 16))), false);
    regShade(bodyG.appendChild(face(D - 16, H - 16, W / 2 - 9, -1, 0, 0, -90, def.lining(D - 16, H - 16))), false);
    regShade(bodyG.appendChild(face(D - 16, H - 16, -(W / 2 - 9), -1, 0, 0, 90, def.lining(D - 16, H - 16))), false);
    // lid on a hinge along the back top edge; faces sit 1px proud so the lid
    // reads as a lip and never z-fights the coplanar body faces
    var lidG = div('ins-lid');
    regShade(lidG.appendChild(face(W, D, 0, -lidH - 1, D / 2, 90, 0, def.lid.top())), true);
    regShade(lidG.appendChild(face(W, lidH, 0, -lidH / 2, D + 1, 0, 0, def.lid.front())), true);
    regShade(lidG.appendChild(face(W, lidH, 0, -lidH / 2, -1, 0, 180, def.lid.back())), true);
    regShade(lidG.appendChild(face(D, lidH, -(W / 2 + 1), -lidH / 2, D / 2, 0, -90, def.lid.left())), true);
    regShade(lidG.appendChild(face(D, lidH, W / 2 + 1, -lidH / 2, D / 2, 0, 90, def.lid.right())), true);
    regShade(lidG.appendChild(face(W - 12, D - 12, 0, -3, D / 2, -90, 0, def.lining(W - 12, D - 12))), true);
    var M = { bodyG: bodyG, lidG: lidG, face: face, def: def, handleG: null };
    def.extras(M, P, cuboid, placeProp);
    model.appendChild(bodyG);
    model.appendChild(lidG);
    return M;
  }

  /* ---------- layer + orbit state ---------- */
  var layer = null, viewport = null, stageEl = null, orbitEl = null,
      titleEl = null, lidBtn = null, shadowEl = null;
  var isOpenFlag = false, modelId = null, M = null, lidOpen = false;
  var rx = -14, ry = 32, vx = 0, vy = 0, zoom = 1;
  var auto = true, dragging = false, raf = 0, running = false, lastT = 0, lidUntil = 0;
  var pts = new Map(), lastX = 0, lastY = 0, downX = 0, downY = 0, downT = 0, lastMoveT = 0;
  var pinchD0 = 0, zoom0 = 1, lastTapT = 0, lastTapX = 0, lastTapY = 0;
  // fixed studio key light, viewer space (+y down, +z toward viewer), normalized
  var LIGHT = (function () {
    var l = [-0.45, -0.72, 0.55], m = Math.sqrt(l[0] * l[0] + l[1] * l[1] + l[2] * l[2]);
    return [l[0] / m, l[1] / m, l[2] / m];
  })();

  function ensureLayer() {
    if (layer) return;
    layer = div('hidden'); layer.id = 'inspect-layer';
    layer.innerHTML =
      '<div id="inspect-studio"></div>' +
      '<div id="inspect-viewport"><div id="inspect-stage"><div id="inspect-orbit">' +
      '<div id="inspect-model"></div></div></div><div id="inspect-shadow"></div></div>' +
      '<div class="inspect-top"><button id="inspect-close" aria-label="Close">✕</button>' +
      '<div id="inspect-title"></div><div class="inspect-spacer"></div></div>' +
      '<div class="inspect-foot"><button id="inspect-lid" class="btn small">Open the lid</button>' +
      '<div class="inspect-hint">Drag to look around · pinch to zoom · double-tap to open the lid</div></div>';
    document.getElementById('app').appendChild(layer);
    viewport = document.getElementById('inspect-viewport');
    stageEl = document.getElementById('inspect-stage');
    orbitEl = document.getElementById('inspect-orbit');
    titleEl = document.getElementById('inspect-title');
    lidBtn = document.getElementById('inspect-lid');
    shadowEl = document.getElementById('inspect-shadow');
    document.getElementById('inspect-close').addEventListener('click', function (e) {
      e.stopPropagation(); close();
    });
    lidBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleLid(); });

    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    viewport.addEventListener('pointerdown', function (e) {
      try { viewport.setPointerCapture(e.pointerId); } catch (err) {}
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        dragging = true; auto = false;
        lastX = downX = e.clientX; lastY = downY = e.clientY; downT = Date.now();
        lastMoveT = performance.now();
        vx = 0; vy = 0;
        kick();
      } else if (pts.size === 2) {
        dragging = false;
        var p = Array.from(pts.values());
        pinchD0 = dist(p[0], p[1]) || 1; zoom0 = zoom;
      }
      e.preventDefault();
    });
    viewport.addEventListener('pointermove', function (e) {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        var p = Array.from(pts.values());
        var d = dist(p[0], p[1]) || 1;
        zoom = Math.max(0.7, Math.min(1.6, zoom0 * d / pinchD0));
        applyView();
        return;
      }
      if (!dragging) return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      ry += dx * 0.45; rx -= dy * 0.45;
      if (rx > 85) rx = 85; if (rx < -85) rx = -85;
      // time-based release velocity (deg per 60fps frame), smoothed + clamped
      var now = performance.now();
      var dtm = Math.max(8, now - lastMoveT); lastMoveT = now;
      var k = 0.45 * 16.7 / dtm;
      var ivx = dx * k, ivy = -dy * k;
      if (ivx > 28) ivx = 28; else if (ivx < -28) ivx = -28;
      if (ivy > 28) ivy = 28; else if (ivy < -28) ivy = -28;
      vx = vx * 0.65 + ivx * 0.35;
      vy = vy * 0.65 + ivy * 0.35;
      applyView();
      updateShading();
    });
    function endPt(e) {
      var wasSingle = pts.size === 1 && dragging;
      var moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      pts.delete(e.pointerId);
      if (pts.size === 0) {
        dragging = false;
        if (reduced) { ry = Math.round(ry / 45) * 45; vx = 0; vy = 0; applyView(); updateShading(); }
        else kick(); // let inertia decay in the loop
        if (wasSingle && moved < 14 && Date.now() - downT < 450) {
          var now = Date.now();
          if (now - lastTapT < 350 && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 30) {
            lastTapT = 0; toggleLid();
          } else { lastTapT = now; lastTapX = e.clientX; lastTapY = e.clientY; }
        }
      } else if (pts.size === 1) {
        var p = Array.from(pts.values())[0];
        lastX = p.x; lastY = p.y; dragging = true;
      }
    }
    viewport.addEventListener('pointerup', endPt);
    viewport.addEventListener('pointercancel', endPt);
  }

  function applyView() {
    if (!orbitEl) return;
    orbitEl.style.transform = 'rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';
    stageEl.style.transform = 'scale(' + zoom.toFixed(3) + ')';
    shadowEl.style.transform = 'translateX(-50%) scale(' + zoom.toFixed(3) + ')';
  }

  function kick() {
    if (isOpenFlag && !running) {
      running = true; lastT = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }

  // live lid hinge angle (degrees) read off the composited transform, so face
  // lighting stays correct mid-swing while the CSS transition runs
  function lidAngle() {
    if (!M) return 0;
    try {
      var t = getComputedStyle(M.lidG).transform;
      if (!t || t === 'none') return 0;
      var m = new DOMMatrix(t);
      return Math.atan2(m.m23, m.m22) * 180 / Math.PI;
    } catch (e) { return lidOpen ? -105 : 0; }
  }

  // per-face dynamic lighting: each registered face's model-space normal is
  // rotated by the hinge (lid faces) then the orbit, dotted against the fixed
  // studio light; a black overlay darkens faces turned away from the light so
  // the object reads as solid instead of papery while rotating
  function updateShading() {
    var n = shadeFaces.length;
    if (!n || !orbitEl) return;
    var rxr = rx * Math.PI / 180, ryr = ry * Math.PI / 180;
    var cx = Math.cos(rxr), sx = Math.sin(rxr), cy = Math.cos(ryr), sy = Math.sin(ryr);
    var la = lidAngle() * Math.PI / 180, cl = Math.cos(la), sl = Math.sin(la);
    for (var i = 0; i < n; i++) {
      var s = shadeFaces[i], nx = s.nx, ny = s.ny, nz = s.nz;
      if (s.lid) { // hinge rotation first: Rx(lidA)
        var hy = cl * ny - sl * nz, hz = sl * ny + cl * nz;
        ny = hy; nz = hz;
      }
      // orbit R = Rx(rx)·Ry(ry): Ry first, then Rx
      var qx = cy * nx + sy * nz, qy = ny, qz = -sy * nx + cy * nz;
      var b = qx * LIGHT[0] + (cx * qy - sx * qz) * LIGHT[1] + (sx * qy + cx * qz) * LIGHT[2];
      var op = 0.26 * (1 - b);
      if (op < 0) op = 0; else if (op > 0.62) op = 0.62;
      s.sh.style.opacity = op.toFixed(3);
    }
  }

  function loop(t) {
    if (!isOpenFlag) { running = false; raf = 0; return; }
    var dt = (t - lastT) / 1000; lastT = t;
    if (!(dt > 0)) dt = 0.016;
    if (dt > 0.05) dt = 0.05;
    var s = dt * 60, moved = dragging;
    if (!dragging) {
      if (vx !== 0 || vy !== 0) {
        rx += vy * s; ry += vx * s;
        var dec = Math.pow(0.94, s);
        vx *= dec; vy *= dec;
        if (Math.abs(vx) < 0.015) vx = 0;
        if (Math.abs(vy) < 0.015) vy = 0;
        moved = true;
      }
      if (auto && !reduced) { ry += 0.35 * s; moved = true; }
      if (rx > 85) rx = 85; else if (rx < -85) rx = -85;
    }
    var lidMoving = performance.now() < lidUntil;
    if (moved || lidMoving) {
      applyView();
      updateShading();
    }
    if (!dragging && vx === 0 && vy === 0 && !(auto && !reduced) && !lidMoving) {
      running = false; raf = 0; return; // settled: sleep until next interaction
    }
    raf = requestAnimationFrame(loop);
  }

  /* ---------- lid ---------- */
  function setLid(openIt, silent) {
    if (!M) return;
    lidOpen = openIt;
    var D = M.def.dims;
    M.lidG.style.transform = 'translate3d(0px,' + (-D.H / 2) + 'px,' + (-D.D / 2) + 'px)' +
      ' rotateX(' + (openIt ? -105 : 0) + 'deg)';
    // flop the carry handle flat against the lid as it opens (a rigid handle
    // would swing straight down into the box interior)
    if (M.handleG) {
      M.handleG.style.transform = 'translate3d(0px,' + (-D.lidH) + 'px,' + (D.D / 2) + 'px)' +
        ' rotateX(' + (openIt ? -92 : 0) + 'deg)';
    }
    lidUntil = performance.now() + 850; // keep the loop alive through the swing
    kick();
    layer.classList.toggle('lid-open', openIt);
    layer.classList.toggle('cranking', openIt && modelId === 'musicbox');
    lidBtn.textContent = openIt ? 'Close the lid' : 'Open the lid';
    if (!silent) sfx(openIt ? 'slide' : 'tap');
  }
  function toggleLid() { if (isOpenFlag) setLid(!lidOpen); }

  /* ---------- public ---------- */
  function open(id) {
    var def = MODELS[id];
    if (!def) return false;
    ensureLayer();
    modelId = id; lidOpen = false;
    rx = -14; ry = 32; vx = 0; vy = 0; zoom = 1; auto = !reduced;
    M = buildModel(def);
    titleEl.textContent = def.title;
    layer.classList.remove('hidden', 'lid-open', 'cranking');
    var g = G(); if (g) g.paused = true;
    setLid(false, true);
    applyView();
    updateShading();
    isOpenFlag = true;
    if (raf) cancelAnimationFrame(raf);
    running = false;
    kick();
    sfx('tap');
    return true;
  }
  function close() {
    if (!isOpenFlag) return;
    isOpenFlag = false;
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    layer.classList.add('hidden');
    var g = G(); if (g) g.paused = false;
    sfx('tap');
  }

  window.Inspect = {
    MODELS: MODELS,
    open: open, close: close, toggleLid: toggleLid,
    isOpen: function () { return isOpenFlag; },
    setView: function (rx2, ry2) { rx = rx2; ry = ry2; vx = 0; vy = 0; auto = false; applyView(); updateShading(); kick(); },
    state: function () { return { open: isOpenFlag, id: modelId, rx: rx, ry: ry, zoom: zoom, lid: lidOpen }; }
  };
})();
