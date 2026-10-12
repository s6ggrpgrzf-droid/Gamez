/* ============================================================================
   FTART — "Food Truck Manager" pre-rendered sprite library
   ----------------------------------------------------------------------------
   Visual identity: VINTAGE MATCHBOOK / SIDESHOW POSTER.
   Kraft paper, chalkboard, cork, hand-painted truck. No pixel art, no neon,
   no emojis. Every sprite is drawn ONCE into an offscreen canvas; the game
   loop only ever blits cached canvases (zero per-frame drawing cost).

   Rules honored:
     - Canvas 2D only, no external assets.
     - No live-DOM access: we only ever document.createElement('canvas')
       for offscreen pre-rendering; nothing is attached to the page.
     - No shadowBlur anywhere.
     - All public functions return the SAME cached canvas object each call.
     - init() is idempotent — safe to call repeatedly.
     - Palette is used exactly as specified (shading is done by layering
       palette colors at alpha, never by inventing new hex values).

   Usage:
     FTART.init();                       // build everything once (lazy too)
     var img = FTART.dish('taco');       // 96x96 canvas
     var face = FTART.customer('biz');   // 120x140 canvas
     var tile = FTART.tex('cork');       // 128x128 canvas
     var slip = FTART.ticket(120, 180);  // sized kraft order slip
   ============================================================================ */
var FTART = (function () {
'use strict';

/* ---------------- palette (exact) ---------------- */
var KRAFT   = '#C9A06A';
var KRAFT_D = '#A87F4E';
var CHALK   = '#2E2C26';
var CORK    = '#A9743F';
var CORK_D  = '#7E5527';
var KETCH   = '#C0392B';
var KETCH_B = '#E04B34';
var MUST    = '#E8A93D';
var CREAM   = '#F5E9D0';
var INK     = '#2A2320';
var PENCIL  = '#F8F4E8';
var GREASE  = '#8A8F7A';

/* ---------------- tiny seeded rng (one-time pre-render jitter) ---------------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- canvas helpers ---------------- */
function cv(w, h) {
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function gx(c) { return c.getContext('2d'); }

/* Bold poster ink stroke setup. */
function inkStroke(g, lw) {
  g.strokeStyle = INK;
  g.lineWidth = lw || 3;
  g.lineJoin = 'round';
  g.lineCap = 'round';
}

/* Rounded-rect path. */
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* Wobbly closed blob path (hand-drawn feel). jit = 0..1 wobble amount. */
function blob(g, rng, cx, cy, rx, ry, n, jit) {
  g.beginPath();
  for (var i = 0; i <= n; i++) {
    var a = (i / n) * Math.PI * 2;
    var w = 1 + (rng() * 2 - 1) * jit;
    var x = cx + Math.cos(a) * rx * w;
    var y = cy + Math.sin(a) * ry * w;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}

/* Hand-drawn straight line: segmented with slight jitter. */
function wobLine(g, rng, x1, y1, x2, y2, seg, jit) {
  g.beginPath();
  for (var i = 0; i <= seg; i++) {
    var t = i / seg;
    var x = x1 + (x2 - x1) * t + (rng() * 2 - 1) * jit;
    var y = y1 + (y2 - y1) * t + (rng() * 2 - 1) * jit;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();
}

/* Scatter n dots inside a rect. */
function speck(g, rng, n, x0, y0, x1, y1, rMin, rMax, color, alpha) {
  g.fillStyle = color;
  g.globalAlpha = alpha;
  for (var i = 0; i < n; i++) {
    var r = rMin + rng() * (rMax - rMin);
    g.beginPath();
    g.arc(x0 + rng() * (x1 - x0), y0 + rng() * (y1 - y0), r, 0, 7);
    g.fill();
  }
  g.globalAlpha = 1;
}

/* ---------------- 128x128 texture tiles ---------------- */

function texCork() {
  var r = mulberry32(11), c = cv(128, 128), g = gx(c);
  g.fillStyle = CORK; g.fillRect(0, 0, 128, 128);
  /* speckled granules, lighter and darker than the base */
  for (var i = 0; i < 260; i++) {
    g.fillStyle = r() < 0.62 ? CORK_D : KRAFT;
    g.globalAlpha = 0.22 + r() * 0.35;
    g.beginPath();
    g.arc(r() * 128, r() * 128, 1 + r() * 2.6, 0, 7);
    g.fill();
  }
  /* a few deep pores */
  speck(g, r, 26, 0, 0, 128, 128, 1.5, 3, INK, 0.28);
  g.globalAlpha = 1;
  return c;
}

function texKraft() {
  var r = mulberry32(22), c = cv(128, 128), g = gx(c);
  g.fillStyle = KRAFT; g.fillRect(0, 0, 128, 128);
  /* paper fibers: short thin strokes in two tones */
  for (var i = 0; i < 70; i++) {
    g.strokeStyle = r() < 0.5 ? KRAFT_D : CREAM;
    g.globalAlpha = 0.16 + r() * 0.12;
    g.lineWidth = 1;
    var x = r() * 128, y = r() * 128, a = r() * Math.PI, l = 4 + r() * 9;
    wobLine(g, r, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 2, 1);
  }
  speck(g, r, 24, 0, 0, 128, 128, 0.8, 1.8, KRAFT_D, 0.3);
  g.globalAlpha = 1;
  return c;
}

function texChalk() {
  var r = mulberry32(33), c = cv(128, 128), g = gx(c);
  g.fillStyle = CHALK; g.fillRect(0, 0, 128, 128);
  /* wiped-chalk smudges: broad soft arcs at very low alpha */
  g.strokeStyle = PENCIL;
  g.lineCap = 'round';
  for (var i = 0; i < 12; i++) {
    g.globalAlpha = 0.04 + r() * 0.05;
    g.lineWidth = 6 + r() * 14;
    g.beginPath();
    var x = r() * 128, y = r() * 128, rad = 14 + r() * 34;
    var a0 = r() * Math.PI * 2;
    g.arc(x, y, rad, a0, a0 + 1 + r() * 2.4);
    g.stroke();
  }
  /* chalk dust */
  speck(g, r, 46, 0, 0, 128, 128, 0.6, 1.6, PENCIL, 0.07);
  g.globalAlpha = 1;
  return c;
}

function texStripe() {
  /* ketchup/mustard awning stripes, 16px each, with ink pinlines */
  var c = cv(128, 128), g = gx(c);
  for (var x = 0; x < 128; x += 16) {
    g.fillStyle = ((x / 16) % 2 === 0) ? KETCH : MUST;
    g.fillRect(x, 0, 16, 128);
  }
  g.strokeStyle = INK; g.globalAlpha = 0.28; g.lineWidth = 2;
  for (var b = 0; b <= 128; b += 16) {
    g.beginPath(); g.moveTo(b, 0); g.lineTo(b, 128); g.stroke();
  }
  g.globalAlpha = 1;
  return c;
}

/* ---------------- 96x96 dish pictograms (matchbook-poster style) ----------------
   Bold ink outlines, flat palette fills, slight hand-drawn wobble. */

function dishTaco() {
  var r = mulberry32(101), c = cv(96, 96), g = gx(c);
  /* shell: folded tortilla, lower half-disc */
  g.fillStyle = KRAFT; inkStroke(g, 4);
  g.beginPath(); g.arc(48, 50, 34, 0, Math.PI); g.closePath();
  g.fill(); g.stroke();
  /* toasted spots on the shell */
  g.fillStyle = KRAFT_D; g.globalAlpha = 0.85;
  var spots = [[34, 68, 3.4], [56, 74, 4], [66, 62, 2.6], [28, 60, 2.4]];
  for (var i = 0; i < spots.length; i++) {
    g.beginPath(); g.arc(spots[i][0], spots[i][1], spots[i][2], 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  /* filling mound heaped above the shell's rim */
  blob(g, r, 48, 50, 28, 17, 14, 0.12);
  g.fillStyle = KETCH; g.fill();
  /* lettuce shreds */
  g.fillStyle = GREASE;
  for (i = 0; i < 6; i++) {
    g.save();
    g.translate(28 + r() * 40, 36 + r() * 22);
    g.rotate(r() * Math.PI);
    g.beginPath(); g.ellipse(0, 0, 6.5, 3, 0, 0, 7); g.fill();
    g.restore();
  }
  /* cheese drizzle */
  g.strokeStyle = MUST; g.lineWidth = 4;
  for (i = 0; i < 3; i++) {
    var yy = 40 + i * 8;
    wobLine(g, r, 26, yy, 70, yy + (r() * 6 - 3), 6, 2);
  }
  /* diced onion */
  g.fillStyle = CREAM;
  for (i = 0; i < 6; i++) g.fillRect(30 + r() * 36, 38 + r() * 20, 3.4, 3.4);
  /* inner lip of the shell fold */
  g.strokeStyle = INK; g.globalAlpha = 0.75; g.lineWidth = 2.5;
  g.beginPath(); g.arc(48, 50, 27, Math.PI * 0.12, Math.PI * 0.88); g.stroke();
  g.globalAlpha = 1;
  return c;
}

function dishQuesadilla() {
  var r = mulberry32(102), c = cv(96, 96), g = gx(c);
  /* golden triangle */
  g.fillStyle = MUST; inkStroke(g, 4);
  g.beginPath();
  g.moveTo(48, 12); g.lineTo(84, 76); g.lineTo(12, 76); g.closePath();
  g.fill(); g.stroke();
  /* fold line from apex to base */
  g.strokeStyle = INK; g.globalAlpha = 0.35; g.lineWidth = 2.5;
  wobLine(g, r, 48, 14, 48, 74, 5, 2);
  g.globalAlpha = 1;
  /* griddle char marks */
  g.strokeStyle = INK; g.globalAlpha = 0.3; g.lineWidth = 4;
  var marks = [[34, 52, 46, 64], [52, 40, 64, 52], [28, 66, 38, 74]];
  for (var i = 0; i < marks.length; i++) {
    wobLine(g, r, marks[i][0], marks[i][1], marks[i][2], marks[i][3], 3, 1);
  }
  g.globalAlpha = 1;
  /* cheese ooze along the base + two drips */
  g.strokeStyle = CREAM; g.lineWidth = 5;
  wobLine(g, r, 18, 72, 78, 72, 8, 2.5);
  g.lineWidth = 4;
  wobLine(g, r, 34, 74, 33, 84, 3, 1);
  wobLine(g, r, 62, 74, 63, 82, 3, 1);
  return c;
}

function dishBurrito() {
  var r = mulberry32(103), c = cv(96, 96), g = gx(c);
  /* wrapped cylinder */
  g.fillStyle = CREAM; inkStroke(g, 4);
  rr(g, 14, 36, 68, 26, 13); g.fill(); g.stroke();
  /* tucked ends */
  g.fillStyle = KRAFT_D;
  g.beginPath(); g.ellipse(18, 49, 7, 12, 0, 0, 7); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(78, 49, 7, 12, 0, 0, 7); g.fill(); g.stroke();
  /* end fold seams */
  g.strokeStyle = INK; g.globalAlpha = 0.55; g.lineWidth = 2.5;
  wobLine(g, r, 28, 39, 28, 59, 4, 1.5);
  wobLine(g, r, 68, 39, 68, 59, 4, 1.5);
  g.globalAlpha = 1;
  /* hot band around the middle */
  g.fillStyle = KETCH;
  g.fillRect(43, 36, 12, 26);
  inkStroke(g, 2.5);
  g.beginPath(); g.moveTo(43, 36); g.lineTo(43, 62); g.stroke();
  g.beginPath(); g.moveTo(55, 36); g.lineTo(55, 62); g.stroke();
  /* mustard diamond on the band */
  g.fillStyle = MUST;
  g.beginPath();
  g.moveTo(49, 42); g.lineTo(53, 49); g.lineTo(49, 56); g.lineTo(45, 49);
  g.closePath(); g.fill(); g.stroke();
  /* griddle marks */
  g.strokeStyle = INK; g.globalAlpha = 0.22; g.lineWidth = 3;
  wobLine(g, r, 30, 60, 40, 38, 3, 1);
  wobLine(g, r, 58, 60, 68, 38, 3, 1);
  g.globalAlpha = 1;
  /* top highlight */
  g.strokeStyle = PENCIL; g.globalAlpha = 0.55; g.lineWidth = 4;
  wobLine(g, r, 24, 41, 72, 41, 6, 1.5);
  g.globalAlpha = 1;
  return c;
}

function dishNachos() {
  var r = mulberry32(104), c = cv(96, 96), g = gx(c);
  /* chip pile: overlapping triangles */
  var chips = [[48, 54, 0.2], [34, 60, -0.5], [62, 60, 0.6],
               [42, 42, 0.9], [56, 42, -0.9], [48, 66, 0.1]];
  for (var i = 0; i < chips.length; i++) {
    g.save();
    g.translate(chips[i][0], chips[i][1]);
    g.rotate(chips[i][2] + (r() - 0.5) * 0.3);
    g.fillStyle = KRAFT; inkStroke(g, 2.5);
    g.beginPath();
    g.moveTo(-15, 9); g.lineTo(15, 9); g.lineTo(0, -15); g.closePath();
    g.fill(); g.stroke();
    g.restore();
  }
  /* cheese drizzle across the pile */
  g.strokeStyle = MUST; g.lineWidth = 5;
  g.beginPath();
  g.moveTo(16, 44);
  g.quadraticCurveTo(34, 34, 48, 46);
  g.quadraticCurveTo(62, 58, 80, 44);
  g.stroke();
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(22, 62);
  g.quadraticCurveTo(44, 54, 72, 62);
  g.stroke();
  /* salsa dollops */
  g.fillStyle = KETCH;
  var dol = [[38, 50], [58, 56], [48, 40]];
  for (i = 0; i < dol.length; i++) {
    g.beginPath(); g.arc(dol[i][0], dol[i][1], 4.2, 0, 7); g.fill();
  }
  /* cilantro bits */
  g.fillStyle = GREASE;
  for (i = 0; i < 7; i++) {
    g.save();
    g.translate(24 + r() * 48, 34 + r() * 32);
    g.rotate(r() * Math.PI);
    g.fillRect(-3, -1.4, 6, 2.8);
    g.restore();
  }
  /* crema dollop */
  blob(g, r, 52, 52, 6, 5, 8, 0.2);
  g.fillStyle = CREAM; g.fill();
  inkStroke(g, 2); g.stroke();
  return c;
}

function dishElote() {
  var r = mulberry32(105), c = cv(96, 96), g = gx(c);
  /* wooden stick handle */
  g.fillStyle = KRAFT_D; inkStroke(g, 3);
  rr(g, 4, 45, 16, 7, 3); g.fill(); g.stroke();
  /* corn cob */
  g.fillStyle = MUST; inkStroke(g, 4);
  rr(g, 16, 36, 64, 24, 12); g.fill(); g.stroke();
  /* kernel rows */
  g.strokeStyle = INK; g.globalAlpha = 0.22; g.lineWidth = 1.5;
  for (var x = 26; x <= 74; x += 8) {
    wobLine(g, r, x, 39, x, 57, 3, 1);
  }
  g.globalAlpha = 1;
  /* roasted tip shading */
  g.fillStyle = KRAFT; g.globalAlpha = 0.45;
  g.beginPath(); g.ellipse(72, 48, 9, 11, 0, 0, 7); g.fill();
  g.globalAlpha = 1;
  /* crema zigzag */
  g.strokeStyle = CREAM; g.lineWidth = 4;
  g.beginPath();
  g.moveTo(22, 42);
  for (x = 30; x <= 74; x += 8) {
    g.lineTo(x, (x / 8) % 2 === 0 ? 42 : 54);
  }
  g.stroke();
  /* chili dust */
  speck(g, r, 16, 22, 40, 74, 56, 1.2, 2.4, KETCH, 0.85);
  return c;
}

function dishAgua() {
  var r = mulberry32(106), c = cv(96, 96), g = gx(c);
  /* straw, tucked behind the cup */
  g.save();
  g.translate(58, 26); g.rotate(0.32);
  g.fillStyle = KETCH_B; inkStroke(g, 2.5);
  g.fillRect(-4, -28, 8, 32); g.strokeRect(-4, -28, 8, 32);
  g.restore();
  /* paper cup */
  g.fillStyle = CREAM; inkStroke(g, 4);
  g.beginPath();
  g.moveTo(28, 30); g.lineTo(68, 30); g.lineTo(60, 74); g.lineTo(36, 74);
  g.closePath(); g.fill(); g.stroke();
  /* agua fresca surface */
  g.fillStyle = KETCH;
  g.beginPath(); g.ellipse(48, 30, 20, 6, 0, 0, 7); g.fill();
  inkStroke(g, 3); g.stroke();
  /* kraft sleeve with a mustard diamond mark */
  g.fillStyle = KRAFT; inkStroke(g, 3);
  g.beginPath();
  g.moveTo(31, 48); g.lineTo(65, 48); g.lineTo(62, 64); g.lineTo(34, 64);
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = MUST; inkStroke(g, 2);
  g.beginPath();
  g.moveTo(48, 50); g.lineTo(53, 56); g.lineTo(48, 62); g.lineTo(43, 56);
  g.closePath(); g.fill(); g.stroke();
  /* condensation beads */
  g.fillStyle = PENCIL; g.globalAlpha = 0.85;
  g.beginPath(); g.arc(38, 40, 2.2, 0, 7); g.fill();
  g.beginPath(); g.arc(60, 42, 1.8, 0, 7); g.fill();
  g.globalAlpha = 1;
  return c;
}

/* ---------------- 120x140 customer bust portraits ----------------
   Poster style: bold shapes, distinct silhouettes, no text on faces. */

function custShoulders(g, rng, shirt) {
  blob(g, rng, 60, 160, 55, 42, 12, 0.06);
  g.fillStyle = shirt; g.fill();
  inkStroke(g, 4); g.stroke();
}
function custNeck(g, skin) {
  g.fillStyle = skin;
  g.fillRect(50, 92, 20, 30);
  inkStroke(g, 2.5);
  g.strokeRect(50, 92, 20, 30);
}
function custEyes(g, x1, x2, y) {
  g.fillStyle = INK;
  g.beginPath(); g.arc(x1, y, 3.4, 0, 7); g.fill();
  g.beginPath(); g.arc(x2, y, 3.4, 0, 7); g.fill();
}
function custBlush(g, alpha) {
  g.fillStyle = KETCH; g.globalAlpha = alpha;
  g.beginPath(); g.arc(42, 78, 5, 0, 7); g.fill();
  g.beginPath(); g.arc(78, 78, 5, 0, 7); g.fill();
  g.globalAlpha = 1;
}

function custStd() {  /* friendly regular, paper server cap */
  var r = mulberry32(201), c = cv(120, 140), g = gx(c);
  custShoulders(g, r, KETCH);
  custNeck(g, CREAM);
  /* ears */
  g.fillStyle = CREAM; inkStroke(g, 2.5);
  g.beginPath(); g.arc(28, 66, 6, 0, 7); g.fill(); g.stroke();
  g.beginPath(); g.arc(92, 66, 6, 0, 7); g.fill(); g.stroke();
  /* head */
  g.fillStyle = CREAM; inkStroke(g, 4);
  g.beginPath(); g.arc(60, 64, 32, 0, 7); g.fill(); g.stroke();
  /* paper cap */
  blob(g, r, 60, 40, 32, 16, 12, 0.12);
  g.fillStyle = MUST; g.fill(); inkStroke(g, 3.5); g.stroke();
  g.fillStyle = INK;
  g.beginPath(); g.arc(60, 26, 4, 0, 7); g.fill();
  /* face */
  custEyes(g, 48, 72, 66);
  inkStroke(g, 3);
  wobLine(g, r, 42, 57, 54, 56, 2, 1);
  wobLine(g, r, 66, 56, 78, 57, 2, 1);
  g.beginPath(); g.arc(60, 78, 11, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
  custBlush(g, 0.45);
  /* open collar */
  g.fillStyle = CREAM; inkStroke(g, 2.5);
  g.beginPath();
  g.moveTo(44, 134); g.lineTo(60, 152); g.lineTo(52, 132); g.closePath();
  g.fill(); g.stroke();
  g.beginPath();
  g.moveTo(76, 134); g.lineTo(60, 152); g.lineTo(68, 132); g.closePath();
  g.fill(); g.stroke();
  return c;
}

function custBiz() {  /* sharp businesswoman, ink bob */
  var r = mulberry32(202), c = cv(120, 140), g = gx(c);
  custShoulders(g, r, CHALK);
  custNeck(g, CREAM);
  /* bob haircut: ink mass behind the face */
  blob(g, r, 60, 56, 38, 34, 14, 0.08);
  g.fillStyle = INK; g.fill();
  /* face framed by the bob */
  blob(g, r, 60, 66, 29, 30, 12, 0.05);
  g.fillStyle = CREAM; g.fill();
  /* sharp angled brows + eyes */
  inkStroke(g, 3.5);
  wobLine(g, r, 40, 57, 56, 62, 2, 1);
  wobLine(g, r, 80, 57, 64, 62, 2, 1);
  custEyes(g, 49, 71, 69);
  /* lipstick smile */
  g.strokeStyle = KETCH; g.lineWidth = 3.5;
  g.beginPath(); g.arc(60, 84, 8, Math.PI * 0.2, Math.PI * 0.8); g.stroke();
  /* earring */
  g.fillStyle = MUST; inkStroke(g, 2);
  g.beginPath(); g.arc(33, 86, 3.2, 0, 7); g.fill(); g.stroke();
  /* mustard blouse V + lapel lines */
  g.fillStyle = MUST;
  g.beginPath();
  g.moveTo(50, 128); g.lineTo(70, 128); g.lineTo(60, 148); g.closePath();
  g.fill();
  inkStroke(g, 2.5);
  wobLine(g, r, 50, 128, 40, 150, 3, 1.5);
  wobLine(g, r, 70, 128, 80, 150, 3, 1.5);
  /* pendant necklace */
  g.strokeStyle = PENCIL; g.lineWidth = 2;
  g.beginPath(); g.arc(60, 122, 13, Math.PI * 0.25, Math.PI * 0.75); g.stroke();
  g.fillStyle = MUST;
  g.beginPath(); g.arc(60, 135, 3, 0, 7); g.fill();
  return c;
}

function custSenior() {  /* kind elder, pencil bun, happy closed eyes */
  var r = mulberry32(203), c = cv(120, 140), g = gx(c);
  custShoulders(g, r, CORK);
  custNeck(g, CREAM);
  /* hair mass + bun */
  blob(g, r, 60, 54, 35, 30, 12, 0.08);
  g.fillStyle = PENCIL; g.fill(); inkStroke(g, 3); g.stroke();
  g.fillStyle = PENCIL;
  g.beginPath(); g.arc(60, 26, 12, 0, 7); g.fill(); g.stroke();
  /* round kind face */
  blob(g, r, 60, 66, 30, 30, 12, 0.05);
  g.fillStyle = CREAM; g.fill();
  /* happy closed eyes */
  inkStroke(g, 3);
  g.beginPath(); g.arc(49, 68, 6, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
  g.beginPath(); g.arc(71, 68, 6, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
  /* crow's feet + smile lines */
  g.globalAlpha = 0.5; g.lineWidth = 2;
  wobLine(g, r, 38, 64, 43, 66, 2, 0.8);
  wobLine(g, r, 38, 70, 43, 70, 2, 0.8);
  wobLine(g, r, 82, 64, 77, 66, 2, 0.8);
  wobLine(g, r, 82, 70, 77, 70, 2, 0.8);
  g.globalAlpha = 1;
  /* big warm smile */
  g.lineWidth = 3.5;
  g.beginPath(); g.arc(60, 78, 12, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
  custBlush(g, 0.5);
  /* shawl collar + cardigan buttons */
  g.fillStyle = CREAM; inkStroke(g, 2.5);
  g.beginPath();
  g.moveTo(46, 132); g.lineTo(60, 150); g.lineTo(53, 130); g.closePath();
  g.fill(); g.stroke();
  g.beginPath();
  g.moveTo(74, 132); g.lineTo(60, 150); g.lineTo(67, 130); g.closePath();
  g.fill(); g.stroke();
  g.fillStyle = CORK_D; inkStroke(g, 1.5);
  g.beginPath(); g.arc(60, 158, 3, 0, 7); g.fill(); g.stroke();
  return c;
}

function custCritic() {  /* stern, glasses, goatee */
  var r = mulberry32(204), c = cv(120, 140), g = gx(c);
  custShoulders(g, r, CHALK);
  custNeck(g, CREAM);
  /* ears */
  g.fillStyle = CREAM; inkStroke(g, 2.5);
  g.beginPath(); g.arc(30, 68, 5, 0, 7); g.fill(); g.stroke();
  g.beginPath(); g.arc(90, 68, 5, 0, 7); g.fill(); g.stroke();
  /* long stern face */
  blob(g, r, 60, 64, 30, 33, 10, 0.07);
  g.fillStyle = CREAM; g.fill(); inkStroke(g, 4); g.stroke();
  /* receding hair: ink side patches */
  g.fillStyle = INK;
  blob(g, r, 32, 52, 10, 15, 8, 0.2); g.fill();
  blob(g, r, 88, 52, 10, 15, 8, 0.2); g.fill();
  /* stern angled brows */
  inkStroke(g, 4);
  wobLine(g, r, 38, 53, 55, 60, 2, 1);
  wobLine(g, r, 82, 53, 65, 60, 2, 1);
  /* glasses */
  inkStroke(g, 3.5);
  rr(g, 37, 60, 21, 17, 4); g.stroke();
  rr(g, 62, 60, 21, 17, 4); g.stroke();
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(58, 66); g.lineTo(62, 66); g.stroke();
  g.beginPath(); g.moveTo(37, 66); g.lineTo(31, 64); g.stroke();
  g.beginPath(); g.moveTo(83, 66); g.lineTo(89, 64); g.stroke();
  custEyes(g, 47, 73, 69);
  /* nose + frown + goatee */
  inkStroke(g, 2.5);
  wobLine(g, r, 60, 70, 58, 78, 2, 1);
  g.lineWidth = 3.5;
  g.beginPath(); g.arc(60, 94, 8, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
  g.fillStyle = INK;
  g.beginPath();
  g.moveTo(52, 100); g.lineTo(68, 100); g.lineTo(60, 112); g.closePath();
  g.fill();
  /* bowtie */
  g.fillStyle = KETCH_B; inkStroke(g, 2.5);
  g.beginPath();
  g.moveTo(44, 130); g.lineTo(56, 124); g.lineTo(56, 138); g.closePath();
  g.fill(); g.stroke();
  g.beginPath();
  g.moveTo(76, 130); g.lineTo(64, 124); g.lineTo(64, 138); g.closePath();
  g.fill(); g.stroke();
  g.fillStyle = KETCH;
  g.beginPath(); g.arc(60, 131, 4, 0, 7); g.fill(); g.stroke();
  return c;
}

/* ---------------- order tickets: blank kraft slips ----------------
   Torn top edge, pin hole, faint ruled lines. Singed variant gets a
   burnt rim, char speckles, and scorch blotches. Cached per size. */

function ticketCanvas(w, h, singed) {
  var key = (singed ? 'S' : 'T') + w + 'x' + h;
  if (TCACHE[key]) return TCACHE[key];
  var r = mulberry32(singed ? 777 : 776);
  var c = cv(w, h), g = gx(c);

  /* torn top edge */
  var teeth = Math.max(6, Math.round(w / 14));
  g.beginPath();
  g.moveTo(0, h);
  g.lineTo(0, 10 + r() * 8);
  for (var i = 1; i <= teeth; i++) {
    g.lineTo((i / teeth) * w, 10 + r() * 10);
  }
  g.lineTo(w, h);
  g.closePath();
  g.fillStyle = KRAFT; g.fill();
  /* paper fibers */
  g.strokeStyle = KRAFT_D; g.globalAlpha = 0.2; g.lineWidth = 1;
  for (i = 0; i < 14; i++) {
    var fx = r() * w, fy = 20 + r() * (h - 30);
    wobLine(g, r, fx, fy, fx + 6 + r() * 10, fy + (r() * 4 - 2), 2, 1);
  }
  g.globalAlpha = 1;
  /* pin hole at top */
  g.fillStyle = INK;
  g.beginPath(); g.arc(w / 2, 17, 4.5, 0, 7); g.fill();
  g.strokeStyle = KRAFT_D; g.lineWidth = 2;
  g.beginPath(); g.arc(w / 2, 17, 7.5, 0, 7); g.stroke();
  /* faint ruled lines */
  g.strokeStyle = KRAFT_D; g.globalAlpha = 0.4; g.lineWidth = 1.5;
  for (var y = 38; y < h - 10; y += 18) {
    wobLine(g, r, 10, y, w - 10, y, 6, 1);
  }
  g.globalAlpha = 1;

  if (singed) {
    /* burnt rim: thick wobbly ink stroke hugging the torn outline */
    g.strokeStyle = INK; g.globalAlpha = 0.55; g.lineWidth = 10;
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(0, 12);
    for (i = 1; i <= teeth; i++) {
      g.lineTo((i / teeth) * w, 12 + (r() * 10));
    }
    g.lineTo(w, h); g.lineTo(0, h);
    g.closePath(); g.stroke();
    /* char speckles near the edges */
    speck(g, r, 40, 0, 0, w, 26, 1, 2.6, INK, 0.55);
    speck(g, r, 22, 0, h - 24, w, h, 1, 2.6, INK, 0.5);
    /* scorch blotches */
    for (i = 0; i < 8; i++) {
      blob(g, r, r() * w, r() < 0.5 ? 8 + r() * 16 : h - 8 - r() * 16,
           8 + r() * 9, 6 + r() * 7, 9, 0.25);
      g.fillStyle = INK; g.globalAlpha = 0.16; g.fill();
    }
    g.globalAlpha = 1;
  }

  TCACHE[key] = c;
  return c;
}

/* ---------------- props ---------------- */

function buildGrill() {  /* 120x120 cast-iron grill grate tile */
  var r = mulberry32(301), c = cv(120, 120), g = gx(c);
  g.fillStyle = CHALK; g.fillRect(0, 0, 120, 120);
  /* embers glowing through the grate gaps */
  g.fillStyle = KETCH_B; g.globalAlpha = 0.5;
  for (var i = 0; i < 9; i++) {
    g.fillRect(14 + r() * 88, 14 + r() * 88, 5 + r() * 5, 4 + r() * 4);
  }
  g.globalAlpha = 1;
  /* grate bars */
  g.fillStyle = INK;
  for (i = 0; i < 5; i++) {
    g.fillRect(16 + i * 20, 10, 9, 100);
    g.fillRect(10, 16 + i * 20, 100, 9);
  }
  /* grease sheen */
  g.strokeStyle = GREASE; g.globalAlpha = 0.5; g.lineWidth = 6;
  wobLine(g, r, 18, 96, 100, 26, 6, 4);
  wobLine(g, r, 30, 104, 104, 44, 6, 4);
  g.globalAlpha = 1;
  /* frame + rivets */
  inkStroke(g, 5);
  g.strokeRect(5, 5, 110, 110);
  g.fillStyle = PENCIL;
  var rv = [[14, 14], [106, 14], [14, 106], [106, 106]];
  for (i = 0; i < 4; i++) {
    g.beginPath(); g.arc(rv[i][0], rv[i][1], 3, 0, 7); g.fill();
  }
  return c;
}

function buildWarmer() {  /* 120x120 enamel warmer tray */
  var r = mulberry32(302), c = cv(120, 120), g = gx(c);
  g.fillStyle = CORK_D; g.fillRect(0, 0, 120, 120);
  g.fillStyle = CORK; inkStroke(g, 3);
  rr(g, 10, 10, 100, 100, 10); g.fill(); g.stroke();
  /* enamel tray */
  g.fillStyle = CREAM; inkStroke(g, 4);
  rr(g, 22, 28, 76, 66, 8); g.fill(); g.stroke();
  /* food zone */
  g.fillStyle = KRAFT;
  g.strokeStyle = KRAFT_D; g.lineWidth = 2;
  rr(g, 30, 36, 60, 50, 6); g.fill(); g.stroke();
  /* rising steam */
  g.strokeStyle = PENCIL; g.globalAlpha = 0.7; g.lineWidth = 3;
  var sx;
  for (sx = 44; sx <= 76; sx += 16) {
    g.beginPath();
    g.moveTo(sx, 30);
    g.quadraticCurveTo(sx - 6, 22, sx, 14);
    g.quadraticCurveTo(sx + 6, 8, sx, 2);
    g.stroke();
  }
  g.globalAlpha = 1;
  /* ember dots along the base */
  for (var i = 0; i < 6; i++) {
    g.fillStyle = i % 2 ? MUST : KETCH_B;
    g.beginPath(); g.arc(28 + i * 13, 103, 3.4, 0, 7); g.fill();
  }
  return c;
}

function buildBell() {  /* 64x64 counter service bell */
  var r = mulberry32(303), c = cv(64, 64), g = gx(c);
  /* ding arcs */
  g.strokeStyle = INK; g.globalAlpha = 0.7; g.lineWidth = 2.5;
  g.beginPath(); g.arc(10, 30, 6, Math.PI * 0.6, Math.PI * 1.4); g.stroke();
  g.beginPath(); g.arc(54, 30, 6, Math.PI * 1.6, Math.PI * 0.4); g.stroke();
  g.globalAlpha = 1;
  /* base */
  g.fillStyle = CHALK; inkStroke(g, 3);
  g.beginPath(); g.ellipse(32, 50, 22, 8, 0, 0, 7); g.fill(); g.stroke();
  /* dome */
  g.fillStyle = MUST;
  g.beginPath(); g.arc(32, 48, 19, Math.PI, 0); g.closePath();
  g.fill(); inkStroke(g, 3.5); g.stroke();
  /* highlight sweep */
  g.strokeStyle = PENCIL; g.globalAlpha = 0.8; g.lineWidth = 3;
  g.beginPath(); g.arc(32, 46, 12.5, Math.PI * 1.15, Math.PI * 1.55); g.stroke();
  g.globalAlpha = 1;
  /* plunger button */
  g.fillStyle = KETCH; inkStroke(g, 3);
  g.beginPath(); g.arc(32, 24, 5, 0, 7); g.fill(); g.stroke();
  return c;
}

function buildExting() {  /* 48x96 fire extinguisher */
  var r = mulberry32(304), c = cv(48, 96), g = gx(c);
  /* hose + nozzle */
  inkStroke(g, 3);
  g.beginPath();
  g.moveTo(28, 26);
  g.quadraticCurveTo(40, 32, 38, 46);
  g.stroke();
  g.fillStyle = CHALK;
  g.fillRect(34, 44, 7, 10);
  /* handle bar */
  g.fillStyle = INK;
  rr(g, 10, 14, 28, 6, 3); g.fill();
  /* valve */
  g.fillStyle = CHALK; inkStroke(g, 2);
  g.fillRect(20, 22, 8, 8); g.strokeRect(20, 22, 8, 8);
  /* body */
  g.fillStyle = KETCH; inkStroke(g, 3.5);
  rr(g, 12, 30, 24, 56, 8); g.fill(); g.stroke();
  /* highlight */
  g.fillStyle = KETCH_B; g.globalAlpha = 0.65;
  g.fillRect(16, 34, 5, 48);
  g.globalAlpha = 1;
  /* pressure gauge */
  g.fillStyle = MUST; inkStroke(g, 2);
  g.beginPath(); g.arc(24, 40, 4.5, 0, 7); g.fill(); g.stroke();
  /* cream label */
  g.fillStyle = CREAM; inkStroke(g, 2);
  g.fillRect(15, 50, 18, 22); g.strokeRect(15, 50, 18, 22);
  g.lineWidth = 1.5;
  wobLine(g, r, 18, 58, 30, 58, 2, 0.6);
  wobLine(g, r, 18, 64, 30, 64, 2, 0.6);
  /* base ring */
  g.fillStyle = INK;
  g.fillRect(12, 86, 24, 5);
  return c;
}

/* ---------------- the logo truck: 360x200 hand-painted side view ----------------
   Cream box body, ketchup lower band, mustard pinstripe, striped awning over
   the serving window, "TACO LOCO" in poster lettering. Text via fillText is
   fine here — it runs once at pre-render time. */

function buildTruck() {
  var r = mulberry32(901), c = cv(360, 200), g = gx(c);

  /* ground shadow */
  g.fillStyle = INK; g.globalAlpha = 0.14;
  g.beginPath(); g.ellipse(180, 184, 150, 9, 0, 0, 7); g.fill();
  g.globalAlpha = 1;

  /* ---- box body ---- */
  g.fillStyle = CREAM; inkStroke(g, 4);
  g.fillRect(100, 40, 216, 112); g.strokeRect(100, 40, 216, 112);
  /* hand-painted wobble: faint brush streaks on the cream */
  g.strokeStyle = KRAFT_D; g.globalAlpha = 0.25; g.lineWidth = 2;
  for (var i = 0; i < 8; i++) {
    var bx = 110 + r() * 196, by = 48 + r() * 52;
    wobLine(g, r, bx, by, bx + 10 + r() * 18, by + (r() * 4 - 2), 2, 1);
  }
  g.globalAlpha = 1;
  /* ketchup lower band + mustard pinstripe */
  g.fillStyle = KETCH; g.fillRect(100, 112, 216, 40);
  g.fillStyle = MUST; g.fillRect(100, 106, 216, 6);
  inkStroke(g, 2.5);
  g.beginPath(); g.moveTo(100, 106); g.lineTo(316, 106); g.stroke();
  g.beginPath(); g.moveTo(100, 112); g.lineTo(316, 112); g.stroke();

  /* ---- serving window ---- */
  g.fillStyle = KRAFT_D; inkStroke(g, 4);
  g.fillRect(146, 54, 128, 62); g.strokeRect(146, 54, 128, 62);
  g.fillStyle = CHALK;
  g.fillRect(152, 60, 116, 50);
  /* counter shelf */
  g.fillStyle = CORK; g.fillRect(152, 100, 116, 10);
  inkStroke(g, 2);
  g.beginPath(); g.moveTo(152, 100); g.lineTo(268, 100); g.stroke();
  /* chalkboard menu with faux writing lines */
  g.fillStyle = KRAFT; inkStroke(g, 2);
  g.fillRect(160, 66, 36, 30); g.strokeRect(160, 66, 36, 30);
  g.lineWidth = 1.5;
  wobLine(g, r, 165, 74, 191, 74, 3, 0.8);
  wobLine(g, r, 165, 81, 191, 81, 3, 0.8);
  wobLine(g, r, 165, 88, 184, 88, 3, 0.8);
  /* hanging lamp */
  inkStroke(g, 2);
  g.beginPath(); g.moveTo(240, 60); g.lineTo(240, 70); g.stroke();
  g.fillStyle = MUST;
  g.beginPath(); g.arc(240, 75, 5, 0, 7); g.fill(); g.stroke();
  /* cook silhouette inside */
  g.fillStyle = INK; g.globalAlpha = 0.85;
  g.beginPath(); g.arc(214, 84, 6, 0, 7); g.fill();
  blob(g, r, 214, 102, 11, 9, 8, 0.15); g.fill();
  g.globalAlpha = 1;

  /* ---- striped awning over the window ---- */
  g.save();
  g.beginPath();
  g.moveTo(138, 54); g.lineTo(282, 54); g.lineTo(272, 30); g.lineTo(148, 30);
  g.closePath(); g.clip();
  var sx, alt = 0;
  for (sx = 136; sx < 284; sx += 16) {
    g.fillStyle = (alt++ % 2 === 0) ? KETCH : MUST;
    g.fillRect(sx, 26, 16, 32);
  }
  g.restore();
  inkStroke(g, 3);
  g.beginPath();
  g.moveTo(138, 54); g.lineTo(282, 54); g.lineTo(272, 30); g.lineTo(148, 30);
  g.closePath(); g.stroke();
  /* scalloped valance */
  alt = 0;
  for (sx = 146; sx <= 274; sx += 18) {
    g.fillStyle = (alt++ % 2 === 0) ? KETCH : MUST;
    g.beginPath(); g.arc(sx, 54, 8, 0, Math.PI); g.fill();
    inkStroke(g, 2.5); g.stroke();
  }

  /* ---- TACO LOCO poster lettering on the band ---- */
  g.font = '900 30px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.strokeStyle = INK; g.lineWidth = 7;
  g.strokeText('TACO LOCO', 208, 134);
  g.fillStyle = PENCIL;
  g.fillText('TACO LOCO', 208, 134);
  /* mustard diamond flourishes flanking the name */
  g.fillStyle = MUST; inkStroke(g, 2);
  var dia = [[128, 134], [288, 134]];
  for (i = 0; i < 2; i++) {
    g.beginPath();
    g.moveTo(dia[i][0], dia[i][1] - 7);
    g.lineTo(dia[i][0] + 5, dia[i][1]);
    g.lineTo(dia[i][0], dia[i][1] + 7);
    g.lineTo(dia[i][0] - 5, dia[i][1]);
    g.closePath(); g.fill(); g.stroke();
  }

  /* ---- roof sign: taco pictogram + faux menu lines ---- */
  g.fillStyle = KRAFT; inkStroke(g, 3);
  g.fillRect(186, 14, 88, 26); g.strokeRect(186, 14, 88, 26);
  g.drawImage(C.dishes.taco, 190, 17, 20, 20);
  g.lineWidth = 2;
  wobLine(g, r, 216, 24, 262, 24, 3, 0.8);
  wobLine(g, r, 216, 32, 254, 32, 3, 0.8);

  /* ---- cab (front, facing left) ---- */
  g.fillStyle = KETCH; inkStroke(g, 4);
  g.beginPath();
  g.moveTo(24, 152); g.lineTo(24, 84); g.lineTo(54, 84);
  g.lineTo(78, 110); g.lineTo(100, 110); g.lineTo(100, 152);
  g.closePath(); g.fill(); g.stroke();
  /* windshield */
  g.fillStyle = CHALK; inkStroke(g, 3);
  g.beginPath();
  g.moveTo(30, 88); g.lineTo(50, 88); g.lineTo(62, 104); g.lineTo(30, 104);
  g.closePath(); g.fill(); g.stroke();
  /* door seam + handle */
  g.strokeStyle = INK; g.globalAlpha = 0.6; g.lineWidth = 2.5;
  g.strokeRect(40, 94, 30, 54);
  g.globalAlpha = 1;
  g.fillStyle = INK; g.fillRect(60, 118, 8, 4);
  /* headlight + bumper */
  g.fillStyle = MUST; inkStroke(g, 3);
  g.beginPath(); g.arc(30, 130, 7, 0, 7); g.fill(); g.stroke();
  g.fillStyle = CHALK; inkStroke(g, 2);
  g.fillRect(16, 146, 20, 8); g.strokeRect(16, 146, 20, 8);

  /* ---- pennant bunting: cab roof to box ---- */
  inkStroke(g, 2);
  g.beginPath(); g.moveTo(100, 42); g.lineTo(30, 66); g.stroke();
  for (i = 1; i <= 5; i++) {
    var t = i / 6;
    var px = 100 + (30 - 100) * t, py = 42 + (66 - 42) * t;
    g.fillStyle = (i % 2 === 0) ? MUST : KETCH_B;
    g.beginPath();
    g.moveTo(px - 7, py); g.lineTo(px + 7, py); g.lineTo(px, py + 12);
    g.closePath(); g.fill(); inkStroke(g, 2); g.stroke();
  }

  /* ---- exhaust + taillight at the back ---- */
  g.fillStyle = CHALK; inkStroke(g, 2);
  g.fillRect(312, 148, 12, 10); g.strokeRect(312, 148, 12, 10);
  g.fillStyle = KETCH_B;
  g.fillRect(310, 116, 6, 10); g.strokeRect(310, 116, 6, 10);

  /* ---- wheels ---- */
  var wheels = [64, 266];
  for (i = 0; i < 2; i++) {
    /* wheel well cut into the body line */
    inkStroke(g, 4);
    g.beginPath(); g.arc(wheels[i], 158, 26, Math.PI, 0); g.stroke();
    g.fillStyle = INK;
    g.beginPath(); g.arc(wheels[i], 160, 20, 0, 7); g.fill();
    g.fillStyle = KRAFT; inkStroke(g, 2);
    g.beginPath(); g.arc(wheels[i], 160, 9, 0, 7); g.fill(); g.stroke();
    g.fillStyle = PENCIL;
    g.beginPath(); g.arc(wheels[i], 160, 3.5, 0, 7); g.fill();
  }

  return c;
}

/* ---------------- cache + init + public API ---------------- */

var TCACHE = {};   /* ticket canvases, keyed by variant+size */
var C = {};        /* every other sprite, built once */
var BUILT = false;

function init() {
  if (BUILT) return;
  C.tex = {
    cork:   texCork(),
    kraft:  texKraft(),
    chalk:  texChalk(),
    stripe: texStripe()
  };
  C.dishes = {
    taco:       dishTaco(),
    quesadilla: dishQuesadilla(),
    burrito:    dishBurrito(),
    nachos:     dishNachos(),
    elote:      dishElote(),
    agua:       dishAgua()
  };
  C.cust = {
    std:    custStd(),
    biz:    custBiz(),
    senior: custSenior(),
    critic: custCritic()
  };
  C.grill   = buildGrill();
  C.warmer  = buildWarmer();
  C.bell    = buildBell();
  C.exting  = buildExting();
  /* dishes must exist before the truck (roof sign reuses the taco) */
  C.truck   = buildTruck();
  BUILT = true;
}

return {
  init: init,

  /* 96x96 dish pictograms: taco | quesadilla | burrito | nachos | elote | agua */
  dish: function (id) {
    init();
    return C.dishes[id] || C.dishes.taco;
  },

  /* 120x140 bust portraits: std | biz | senior | critic */
  customer: function (arch) {
    init();
    return C.cust[arch] || C.cust.std;
  },

  /* 128x128 tiles: cork | kraft | chalk | stripe */
  tex: function (name) {
    init();
    return C.tex[name] || C.tex.kraft;
  },

  /* blank kraft order slip (torn top, pin hole, ruled lines); cached per size */
  ticket: function (w, h) {
    return ticketCanvas(w || 120, h || 180, false);
  },

  /* same slip, burnt/singed edges */
  ticketSinged: function (w, h) {
    return ticketCanvas(w || 120, h || 180, true);
  },

  /* props */
  grill:   function () { init(); return C.grill; },    /* 120x120 */
  warmer:  function () { init(); return C.warmer; },   /* 120x120 */
  bell:    function () { init(); return C.bell; },     /* 64x64 */
  exting:  function () { init(); return C.exting; },   /* 48x96 */
  truck:   function () { init(); return C.truck; }     /* 360x200 */
};

})();
