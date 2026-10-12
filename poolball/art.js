/* Poolball — all visuals are drawn fresh in code and pre-rendered once at boot.
 * No per-frame allocations in hot paths, no per-frame shadowBlur/fillText.
 * Everything here is original rendering in an Ultrapool-inspired spirit. */
'use strict';

var PBArt = (function () {
  var C = (typeof PBC !== 'undefined') ? PBC : null;
  var DPR = 1, S = {}; // sprites

  function cv(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * DPR));
    c.height = Math.max(1, Math.round(h * DPR));
    var x = c.getContext('2d');
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    return { c: c, x: x, w: w, h: h };
  }

  var BALL_COLORS = {
    0: '#f4f1e8', 1: '#f2c230', 2: '#2456c8', 3: '#d63a2f', 4: '#5b2d91',
    5: '#e07b28', 6: '#1f7a4d', 7: '#7a2e1d', 8: '#17171a',
    9: '#f2c230', 10: '#2456c8', 11: '#d63a2f', 12: '#5b2d91',
    13: '#e07b28', 14: '#1f7a4d', 15: '#7a2e1d',
  };

  function ballSprite(num) {
    var R = C.BALL_R, pad = 6, sz = (R + pad) * 2, o = cv(sz, sz), x = o.x, c = sz / 2;
    var col = BALL_COLORS[num] || '#cccccc';
    // base
    x.fillStyle = (num === 0 || num > 8) ? '#f4f1e8' : col;
    x.beginPath(); x.arc(c, c, R, 0, 7); x.fill();
    // stripe band for 9..15
    if (num > 8) {
      x.save();
      x.beginPath(); x.arc(c, c, R, 0, 7); x.clip();
      x.fillStyle = col;
      x.fillRect(0, c - R * 0.52, sz, R * 1.04);
      x.restore();
    }
    // spherical shading: light from top-left
    var g = x.createRadialGradient(c - R * 0.35, c - R * 0.4, R * 0.1, c, c, R * 1.05);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.08)');
    g.addColorStop(0.75, 'rgba(0,0,0,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0.42)');
    x.fillStyle = g;
    x.beginPath(); x.arc(c, c, R, 0, 7); x.fill();
    // specular highlight
    x.fillStyle = 'rgba(255,255,255,0.85)';
    x.beginPath();
    x.ellipse(c - R * 0.34, c - R * 0.42, R * 0.20, R * 0.13, -0.6, 0, 7);
    x.fill();
    // number disc
    if (num > 0) {
      x.fillStyle = '#f6f3ea';
      x.beginPath(); x.arc(c, c, R * 0.46, 0, 7); x.fill();
      x.fillStyle = '#1c1c1e';
      x.font = '700 ' + Math.round(R * 0.62) + 'px Archivo Black, sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(String(num), c, c + 1);
    }
    return o.c;
  }

  function shadowSprite() {
    var R = C.BALL_R, pad = 8, sz = (R + pad) * 2, o = cv(sz, sz), x = o.x, c = sz / 2;
    var g = x.createRadialGradient(c, c, 1, c, c, R + 4);
    g.addColorStop(0, 'rgba(0,0,0,0.42)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.beginPath();
    x.ellipse(c + 2, c + 3, R + 4, R * 0.92 + 4, 0, 0, 7);
    x.fill();
    return o.c;
  }

  function feltSprite() {
    var p = C.PLAY, m = C.RAIL + 6;
    var w = p.w + m * 2, h = p.h + m * 2;
    var o = cv(w, h), x = o.x;
    x.fillStyle = C.FELT; x.fillRect(0, 0, w, h);
    // woven noise
    var rnd = mulberry(m * 7919 + 13);
    x.fillStyle = 'rgba(255,255,255,0.05)';
    for (var i = 0; i < 900; i++) x.fillRect(rnd() * w, rnd() * h, 1.4, 1.4);
    x.fillStyle = 'rgba(0,0,0,0.10)';
    for (i = 0; i < 700; i++) x.fillRect(rnd() * w, rnd() * h, 1.4, 1.4);
    // sheen: diagonal light
    var sh = x.createLinearGradient(0, 0, w, h);
    sh.addColorStop(0, 'rgba(255,255,255,0.07)');
    sh.addColorStop(0.5, 'rgba(255,255,255,0)');
    sh.addColorStop(1, 'rgba(0,0,0,0.10)');
    x.fillStyle = sh; x.fillRect(0, 0, w, h);
    // lamp pool: brightest at table center
    var lp = x.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.62);
    lp.addColorStop(0, 'rgba(255,244,214,0.16)');
    lp.addColorStop(0.6, 'rgba(255,244,214,0.05)');
    lp.addColorStop(1, 'rgba(0,0,0,0.28)');
    x.fillStyle = lp; x.fillRect(0, 0, w, h);
    return { c: o.c, ox: p.x - m, oy: p.y - m };
  }
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function railsSprite() {
    var p = C.PLAY, r = C.RAIL;
    var ox = p.x - r, oy = p.y - r, w = p.w + r * 2, h = p.h + r * 2;
    var o = cv(w, h), x = o.x;
    // wood base
    var wg = x.createLinearGradient(0, 0, 0, h);
    wg.addColorStop(0, '#6b4527'); wg.addColorStop(0.5, C.WOOD); wg.addColorStop(1, C.WOOD_DARK);
    x.fillStyle = wg;
    x.beginPath();
    x.rect(0, 0, w, h);
    x.rect(r, r, p.w, p.h);
    x.fill('evenodd');
    // wood grain streaks — clipped to the rail ring so they never touch the felt
    x.save();
    x.beginPath();
    x.rect(0, 0, w, h);
    x.rect(r, r, p.w, p.h);
    x.clip('evenodd');
    x.strokeStyle = 'rgba(0,0,0,0.16)'; x.lineWidth = 1;
    var rnd = mulberry(99), i, yy;
    for (i = 0; i < 26; i++) {
      yy = rnd() * h; x.beginPath(); x.moveTo(0, yy); x.bezierCurveTo(w * 0.3, yy + 3, w * 0.7, yy - 3, w, yy); x.stroke();
    }
    x.restore();
    // bevel: light catches the top edge of the rail
    x.strokeStyle = 'rgba(255,220,160,0.35)'; x.lineWidth = 2;
    x.strokeRect(1, 1, w - 2, h - 2);
    x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 3;
    x.beginPath(); x.rect(r - 1.5, r - 1.5, p.w + 3, p.h + 3); x.stroke();
    // diamond inlays (brass) — skips near pockets
    x.fillStyle = C.BRASS;
    function diamond(dx, dy) {
      x.save(); x.translate(dx, dy); x.rotate(Math.PI / 4);
      x.fillRect(-3.4, -3.4, 6.8, 6.8); x.restore();
    }
    for (i = 1; i < 8; i++) {
      var fx = (i / 8) * p.w;
      if (Math.abs(fx - p.w / 2) > 26) { diamond(r + fx, r / 2); diamond(r + fx, r + p.h + r / 2); }
    }
    for (i = 1; i < 4; i++) {
      var fy = (i / 4) * p.h;
      diamond(r / 2, r + fy); diamond(r + p.w + r / 2, r + fy);
    }
    return { c: o.c, ox: ox, oy: oy };
  }

  function pocketSprite(corner) {
    var rr = corner ? C.POCKET_CORNER_R + 7 : C.POCKET_SIDE_R + 7;
    var sz = rr * 2 + 4, o = cv(sz, sz), x = o.x, c = sz / 2;
    // brass rim
    x.strokeStyle = C.BRASS; x.lineWidth = 3;
    x.beginPath(); x.arc(c, c, rr - 2, 0, 7); x.stroke();
    x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 1.5;
    x.beginPath(); x.arc(c, c, rr - 4, 0, 7); x.stroke();
    // dark interior with depth
    var g = x.createRadialGradient(c, c, 1, c, c, rr - 4);
    g.addColorStop(0, '#000000');
    g.addColorStop(0.75, '#050505');
    g.addColorStop(1, '#1c1c1c');
    x.fillStyle = g;
    x.beginPath(); x.arc(c, c, rr - 4, 0, 7); x.fill();
    return o.c;
  }

  function cueSprite() {
    var len = 150, o = cv(len + 10, 14), x = o.x;
    var g = x.createLinearGradient(0, 0, 0, 14);
    g.addColorStop(0, '#a06a35'); g.addColorStop(0.5, '#7c4f24'); g.addColorStop(1, '#4a2c12');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(6, 4); x.lineTo(len, 5.6); x.lineTo(len, 8.4); x.lineTo(6, 10); x.closePath(); x.fill();
    // tip
    x.fillStyle = '#d8cfc0'; x.fillRect(0, 4.6, 6, 4.8);
    x.fillStyle = '#3a6ea5'; x.fillRect(5, 4.6, 2, 4.8);
    // butt wrap
    x.fillStyle = '#1d130b'; x.fillRect(len - 26, 5.4, 26, 3.2);
    return o.c;
  }

  function ghostSprite() {
    var R = C.BALL_R, o = cv(R * 2 + 8, R * 2 + 8), x = o.x, c = o.w / 2;
    x.strokeStyle = 'rgba(255,255,255,0.75)'; x.lineWidth = 2;
    x.setLineDash([5, 4]);
    x.beginPath(); x.arc(c, c, R, 0, 7); x.stroke();
    x.setLineDash([]);
    return o.c;
  }

  function multTag(mult) {
    var o = cv(44, 24), x = o.x;
    x.fillStyle = 'rgba(10,8,4,0.82)';
    x.beginPath();
    if (x.roundRect) x.roundRect(2, 2, 40, 20, 10); else x.rect(2, 2, 40, 20);
    x.fill();
    x.strokeStyle = C.BRASS; x.lineWidth = 1.5; x.stroke();
    x.fillStyle = '#ffd75e';
    x.font = '700 13px Archivo Black, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('×' + mult, 22, 13);
    return o.c;
  }

  function vignette() {
    var o = cv(C.W, C.H), x = o.x;
    var g = x.createRadialGradient(C.W / 2, C.H * 0.42, 120, C.W / 2, C.H * 0.42, 460);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.62)');
    x.fillStyle = g; x.fillRect(0, 0, C.W, C.H);
    return o.c;
  }

  function lampGlow() {
    var o = cv(360, 360), x = o.x, c = 180;
    var g = x.createRadialGradient(c, c, 4, c, c, 176);
    g.addColorStop(0, 'rgba(255,236,190,0.5)');
    g.addColorStop(0.4, 'rgba(255,236,190,0.14)');
    g.addColorStop(1, 'rgba(255,236,190,0)');
    x.fillStyle = g; x.fillRect(0, 0, 360, 360);
    return o.c;
  }

  function roomSprite() {
    // the 2am pool hall: dark surround with a warm lamp pool over the table
    var o = cv(C.W, C.H), x = o.x;
    var g = x.createLinearGradient(0, 0, 0, C.H);
    g.addColorStop(0, '#0b0908'); g.addColorStop(0.5, '#12100c'); g.addColorStop(1, '#070605');
    x.fillStyle = g; x.fillRect(0, 0, C.W, C.H);
    var lp = x.createRadialGradient(C.W / 2, 216, 20, C.W / 2, 216, 330);
    lp.addColorStop(0, 'rgba(255,232,180,0.20)');
    lp.addColorStop(0.55, 'rgba(255,232,180,0.06)');
    lp.addColorStop(1, 'rgba(255,232,180,0)');
    x.fillStyle = lp; x.fillRect(0, 0, C.W, C.H);
    return o.c;
  }

  function dotSprite() {
    var o = cv(8, 8), x = o.x;
    x.fillStyle = 'rgba(255,255,255,0.9)';
    x.beginPath(); x.arc(4, 4, 3, 0, 7); x.fill();
    return o.c;
  }

  function tableShadow() {
    // soft drop shadow the table casts on the hall floor
    var p = C.PLAY, r = C.RAIL;
    var ox = p.x - r, oy = p.y - r, w = p.w + r * 2, h = p.h + r * 2, pad = 26;
    var o = cv(w + pad * 2, h + pad * 2), x = o.x;
    x.fillStyle = 'rgba(0,0,0,0.55)';
    x.beginPath();
    x.ellipse(w / 2 + pad + 5, h / 2 + pad + 9, w / 2, h / 2, 0, 0, 7);
    x.fill();
    // blur it by drawing scaled down/up
    var o2 = cv(w + pad * 2, h + pad * 2), x2 = o2.x;
    x2.filter = 'blur(9px)';
    x2.drawImage(o.c, 0, 0, w + pad * 2, h + pad * 2);
    return { c: o2.c, ox: ox - pad, oy: oy - pad };
  }

  function init(dpr) {
    DPR = Math.min(2, dpr || 1);
    S.balls = [];
    for (var i = 0; i <= 15; i++) S.balls[i] = ballSprite(i);
    S.shadow = shadowSprite();
    S.felt = feltSprite();
    S.rails = railsSprite();
    S.pocketC = pocketSprite(true);
    S.pocketS = pocketSprite(false);
    S.cue = cueSprite();
    S.ghost = ghostSprite();
    S.tag1 = multTag(1); S.tag2 = multTag(2);
    S.vignette = vignette();
    S.lamp = lampGlow();
    S.room = roomSprite();
    S.dot = dotSprite();
    S.tshadow = tableShadow();
  }

  return { init: init, sprites: function () { return S; } };
})();
