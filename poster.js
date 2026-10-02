/* Reel Empire — seeded canvas poster generator. Deterministic per film id. */
(function () {
"use strict";

function hashStr(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

var THEMES = {
  western:  { sky: ["#1c1008", "#a35c1c", "#e8a33d"], sun: "#f7dc9a", ground: "#120a05", accent: "#e8a33d" },
  drama:    { sky: ["#0c0f16", "#2c3a55", "#5c7a9c"], sun: "#e8e4d4", ground: "#07090e", accent: "#8ba3c7" },
  comedy:   { sky: ["#3d1c4d", "#a34d8f", "#f78fb8"], sun: "#ffe9a3", ground: "#1c0a18", accent: "#f7c948" },
  musical:  { sky: ["#12041c", "#5c1c6e", "#a34dc9"], sun: "#f5d78e", ground: "#0a0512", accent: "#d488e8" },
  romance:  { sky: ["#1c0a14", "#8f2d4d", "#e87b9c"], sun: "#ffe4ec", ground: "#100509", accent: "#f5a3b8" },
  horror:   { sky: ["#050508", "#1c1030", "#4d1c4d"], sun: "#d4c9e8", ground: "#030304", accent: "#a03d5c" },
  thriller: { sky: ["#0a0a0c", "#2c2c34", "#5c5c6e"], sun: "#e8e8f0", ground: "#060607", accent: "#c94d4d" },
  action:   { sky: ["#140a05", "#7a2c10", "#d45c1c"], sun: "#ffe9a3", ground: "#0d0503", accent: "#f57b2d" },
  scifi:    { sky: ["#030614", "#10294d", "#2c5c8f"], sun: "#8fd4f7", ground: "#04070f", accent: "#4da3d4" },
  fantasy:  { sky: ["#0e0818", "#3d1c5c", "#7a4da3"], sun: "#f0e4ff", ground: "#080510", accent: "#a37ad4" },
  animation:{ sky: ["#0c2c4d", "#2c8fa3", "#8fd4a3"], sun: "#fff7a3", ground: "#08141c", accent: "#7ad4a3" },
  superhero:{ sky: ["#0a0f1c", "#1c3d6e", "#2d7ad4"], sun: "#ffe9a3", ground: "#05070e", accent: "#f5d74d" },
};

function ridge(ctx, R, w, y, amp, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 450);
  var x, yy = y;
  ctx.lineTo(0, y);
  for (x = 0; x <= w; x += 12) {
    yy = y + (R() - 0.5) * amp;
    ctx.lineTo(x, yy);
  }
  ctx.lineTo(w, 450);
  ctx.closePath();
  ctx.fill();
}

function stars(ctx, R, w, h, n, color) {
  ctx.fillStyle = color || "rgba(255,255,255,.8)";
  for (var i = 0; i < n; i++) {
    var s = R() * 1.8 + 0.4;
    ctx.globalAlpha = 0.3 + R() * 0.7;
    ctx.fillRect(R() * w, R() * h * 0.6, s, s);
  }
  ctx.globalAlpha = 1;
}

function motif(ctx, R, genre, W, H, th) {
  ctx.fillStyle = th.ground;
  if (genre === "western") {
    // mesas
    for (var i = 0; i < 3; i++) {
      var mw = 60 + R() * 90, mx = R() * (W - mw), mh = 60 + R() * 80;
      ctx.fillRect(mx, H * 0.62 - mh, mw, mh);
      ctx.fillRect(mx - 8, H * 0.62 - mh, mw + 16, 10);
    }
    // birds
    ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.lineWidth = 2;
    for (var b = 0; b < 4; b++) {
      var bx = R() * W, by = H * 0.15 + R() * H * 0.2;
      ctx.beginPath(); ctx.moveTo(bx - 8, by); ctx.quadraticCurveTo(bx, by - 6, bx, by); ctx.quadraticCurveTo(bx, by - 6, bx + 8, by); ctx.stroke();
    }
  } else if (genre === "horror") {
    // dead tree
    var tx = W * (0.3 + R() * 0.4);
    ctx.strokeStyle = th.ground; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(tx, H * 0.72); ctx.lineTo(tx, H * 0.35); ctx.stroke();
    ctx.lineWidth = 5;
    for (var br = 0; br < 5; br++) {
      ctx.beginPath(); ctx.moveTo(tx, H * (0.4 + R() * 0.2));
      ctx.lineTo(tx + (R() - 0.5) * 120, H * (0.25 + R() * 0.15)); ctx.stroke();
    }
    // bats
    ctx.fillStyle = "rgba(0,0,0,.85)";
    for (var bt = 0; bt < 6; bt++) {
      var bx2 = R() * W, by2 = H * 0.1 + R() * H * 0.25, s2 = 4 + R() * 5;
      ctx.beginPath(); ctx.moveTo(bx2 - s2, by2); ctx.quadraticCurveTo(bx2, by2 - s2, bx2, by2);
      ctx.quadraticCurveTo(bx2, by2 - s2, bx2 + s2, by2); ctx.fill();
    }
  } else if (genre === "scifi") {
    // ringed planet
    var px = W * (0.3 + R() * 0.4), py = H * 0.3, pr = 26 + R() * 22;
    ctx.fillStyle = th.accent; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(px, py, pr, 0, 7); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = th.sun; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(px, py, pr * 1.7, pr * 0.45, -0.4, 0, 7); ctx.stroke();
  } else if (genre === "fantasy") {
    // castle
    var cx = W * 0.5, cb = H * 0.62;
    ctx.fillRect(cx - 46, cb - 90, 92, 90);
    [[-34, 110], [0, 130], [34, 110]].forEach(function (t) {
      ctx.fillRect(cx + t[0] - 12, cb - t[1], 24, t[1]);
      ctx.beginPath(); ctx.moveTo(cx + t[0] - 12, cb - t[1]); ctx.lineTo(cx + t[0], cb - t[1] - 22); ctx.lineTo(cx + t[0] + 12, cb - t[1]); ctx.fill();
    });
  } else if (genre === "action" || genre === "superhero") {
    // speed rays from center
    var ox = W / 2, oy = H * 0.35;
    ctx.strokeStyle = th.accent; ctx.globalAlpha = 0.5; ctx.lineWidth = 3;
    for (var r2 = 0; r2 < 16; r2++) {
      var a = (r2 / 16) * Math.PI * 2 + R() * 0.2;
      ctx.beginPath(); ctx.moveTo(ox, oy);
      ctx.lineTo(ox + Math.cos(a) * W, oy + Math.sin(a) * W); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // skyline
    ctx.fillStyle = th.ground;
    for (var bx3 = 0; bx3 < W; bx3 += 24) {
      var bh = 30 + R() * 70;
      ctx.fillRect(bx3, H * 0.66 - bh, 20, bh);
    }
  } else if (genre === "musical") {
    // spotlight beams + notes
    ctx.fillStyle = "rgba(255,255,255,.08)";
    for (var sp = 0; sp < 3; sp++) {
      var sx = W * (0.2 + sp * 0.3);
      ctx.beginPath(); ctx.moveTo(sx - 14, 0); ctx.lineTo(sx + 14, 0); ctx.lineTo(sx + 60, H * 0.7); ctx.lineTo(sx - 60, H * 0.7); ctx.fill();
    }
    ctx.fillStyle = th.sun; ctx.font = "28px serif";
    for (var nt = 0; nt < 5; nt++) ctx.fillText("♪", R() * W, H * 0.15 + R() * H * 0.4);
  } else if (genre === "animation") {
    // rainbow arcs
    var cols = ["#e84d4d", "#f5a33d", "#f5e84d", "#4da34d", "#4d7ad4"];
    for (var ci = 0; ci < cols.length; ci++) {
      ctx.strokeStyle = cols[ci]; ctx.globalAlpha = 0.55; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(W / 2, H * 0.66, 110 - ci * 11, Math.PI, 0); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (genre === "comedy") {
    // confetti
    var ccols = ["#f5d74d", "#e87b9c", "#7ad4a3", "#8fd4f7"];
    for (var cf = 0; cf < 40; cf++) {
      ctx.fillStyle = ccols[Math.floor(R() * ccols.length)]; ctx.globalAlpha = 0.8;
      ctx.fillRect(R() * W, R() * H * 0.55, 5, 3);
    }
    ctx.globalAlpha = 1;
  } else {
    // drama / thriller / romance: skyline or hills + moon
    ctx.fillStyle = th.ground;
    for (var hx = 0; hx < W; hx += 30) {
      var hh = 24 + R() * 60;
      if (genre === "drama") ctx.fillRect(hx, H * 0.64 - hh, 26, hh);
      else { ctx.beginPath(); ctx.arc(hx + 15, H * 0.66, 30 + R() * 20, Math.PI, 0); ctx.fill(); }
    }
    if (genre === "romance") {
      ctx.fillStyle = th.accent; ctx.font = "30px serif";
      ctx.fillText("♥", W * (0.3 + R() * 0.4), H * (0.2 + R() * 0.2));
    }
  }
}

var posterCache = {};
function getPoster(film) {
  var key = film.title + "|" + film.genre + "|" + (film.scriptStars || 0);
  if (posterCache[key]) return posterCache[key];
  var W = 240, H = 360;
  var cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  var ctx = cv.getContext("2d");
  var R = mulberry(hashStr(key));
  var th = THEMES[film.genre] || THEMES.drama;

  // sky
  var g = ctx.createLinearGradient(0, 0, 0, H * 0.75);
  g.addColorStop(0, th.sky[0]); g.addColorStop(0.55, th.sky[1]); g.addColorStop(1, th.sky[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.75);

  // stars for night genres
  if (["horror", "scifi", "fantasy", "thriller"].indexOf(film.genre) >= 0) stars(ctx, R, W, H, 60);

  // sun / moon
  var sx = W * (0.25 + R() * 0.5), sy = H * (0.18 + R() * 0.2), sr = 24 + R() * 20;
  var sg = ctx.createRadialGradient(sx, sy, 2, sx, sy, sr * 2.4);
  sg.addColorStop(0, th.sun); sg.addColorStop(0.35, th.sun + "aa"); sg.addColorStop(1, "transparent");
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.arc(sx, sy, sr * 2.4, 0, 7); ctx.fill();
  ctx.fillStyle = th.sun;
  ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 7); ctx.fill();

  // motif + ridges
  motif(ctx, R, film.genre, W, H, th);
  ridge(ctx, R, W, H * 0.66, 46, th.ground);
  ridge(ctx, R, W, H * 0.78, 30, "rgba(0,0,0,.55)");

  // deco sunburst lines (sometimes)
  if (R() < 0.4) {
    ctx.strokeStyle = th.accent; ctx.globalAlpha = 0.25; ctx.lineWidth = 2;
    for (var dl = 0; dl < 9; dl++) {
      var da = Math.PI + (dl / 8) * Math.PI;
      ctx.beginPath(); ctx.moveTo(W / 2, H * 0.99);
      ctx.lineTo(W / 2 + Math.cos(da) * W, H * 0.99 + Math.sin(da) * W); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // vignette
  var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
  vg.addColorStop(0, "transparent"); vg.addColorStop(1, "rgba(0,0,0,.5)");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  // gold frame
  ctx.strokeStyle = th.accent; ctx.globalAlpha = 0.85; ctx.lineWidth = 5;
  ctx.strokeRect(7, 7, W - 14, H - 14);
  ctx.globalAlpha = 1; ctx.lineWidth = 1.5;
  ctx.strokeRect(14, 14, W - 28, H - 28);

  // billing
  ctx.fillStyle = "rgba(243,234,216,.85)";
  ctx.font = "700 9px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("R E E L   E M P I R E   P R E S E N T S", W / 2, 30);

  // title (wrapped)
  var words = film.title.toUpperCase().split(" ");
  var lines = [], line = "";
  ctx.font = "700 26px Georgia, serif";
  words.forEach(function (wd) {
    var t = line ? line + " " + wd : wd;
    if (ctx.measureText(t).width > W - 56 && line) { lines.push(line); line = wd; }
    else line = t;
  });
  if (line) lines.push(line);
  if (lines.length > 3) lines = lines.slice(0, 3);
  var fs = lines.length > 2 ? 21 : 26;
  ctx.font = "700 " + fs + "px Georgia, serif";
  ctx.fillStyle = "#f7ecd4";
  ctx.shadowColor = "rgba(0,0,0,.8)"; ctx.shadowBlur = 6;
  var ty = H - 34 - (lines.length - 1) * (fs + 4);
  lines.forEach(function (ln, i) { ctx.fillText(ln, W / 2, ty + i * (fs + 4)); });
  ctx.shadowBlur = 0;

  // genre tag
  ctx.font = "700 10px Inter, sans-serif";
  ctx.fillStyle = th.accent;
  var glabel = (typeof GENRES !== "undefined" && GENRES[film.genre]) ? GENRES[film.genre].name.toUpperCase() : "";
  ctx.fillText("· " + glabel + " ·", W / 2, H - 22);

  var url = cv.toDataURL("image/jpeg", 0.85);
  posterCache[key] = url;
  return url;
}

// expose
window.getPoster = getPoster;
window.clearPosterCache = function () { posterCache = {}; };
})();
