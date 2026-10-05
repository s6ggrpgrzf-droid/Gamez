/* Wildgrove — painterly renderer + light engine.
 * Fixed diorama camera: the whole grove is one living painting.
 * All drawing happens in WORLD coordinates (1000x1600) via a canvas
 * transform; the camera centers the world vertically with soft overscan.
 * Plants are pre-rendered to offscreen canvases on growth-stage change;
 * the background re-renders when the light materially changes. */
(function () {
  var WORLD_W = 1000, WORLD_H = 1600;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function hx(h) {
    var m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(h);
    if (m) return [+m[1], +m[2], +m[3]];
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function mix(h1, h2, t) {
    var a = hx(h1), b = hx(h2);
    return "rgb(" + Math.round(lerp(a[0], b[0], t)) + "," + Math.round(lerp(a[1], b[1], t)) + "," + Math.round(lerp(a[2], b[2], t)) + ")";
  }

  /* ---------- time-of-day light keys ---------- */
  var LIGHT_KEYS = [
    { h: 0.0,  top: "#0a1424", mid: "#12203a", bot: "#0e1a14", tint: "rgba(50,70,140,0.28)", glow: null,          fire: 1 },
    { h: 4.5,  top: "#0a1424", mid: "#16243e", bot: "#101c15", tint: "rgba(50,70,140,0.26)", glow: null,          fire: 1 },
    { h: 5.75, top: "#3a3a5e", mid: "#7a5a6a", bot: "#2a2a26", tint: "rgba(120,80,110,0.18)", glow: { x: 0.82, y: 0.72, c: "255,150,110", a: 0.35 }, fire: 0.4 },
    { h: 7.0,  top: "#8fb8d8", mid: "#c9d9b8", bot: "#4a5a3c", tint: "rgba(255,190,120,0.14)", glow: { x: 0.72, y: 0.55, c: "255,200,130", a: 0.5 }, fire: 0 },
    { h: 10.0, top: "#7fb2e0", mid: "#b8d4a8", bot: "#55663f", tint: "rgba(255,240,200,0.05)", glow: { x: 0.5, y: 0.3, c: "255,245,210", a: 0.35 }, fire: 0 },
    { h: 14.0, top: "#7fb2e0", mid: "#bcd4a4", bot: "#5a6a42", tint: "rgba(255,240,200,0.06)", glow: { x: 0.35, y: 0.32, c: "255,245,210", a: 0.35 }, fire: 0 },
    { h: 17.0, top: "#8aa8cc", mid: "#d4b88e", bot: "#55503a", tint: "rgba(255,200,130,0.10)", glow: { x: 0.22, y: 0.5, c: "255,210,150", a: 0.4 }, fire: 0 },
    { h: 18.5, top: "#4a3a5e", mid: "#c97a5a", bot: "#3a3226", tint: "rgba(230,130,80,0.20)", glow: { x: 0.12, y: 0.68, c: "255,140,80", a: 0.55 }, fire: 0.2 },
    { h: 20.0, top: "#101a30", mid: "#1e2c48", bot: "#121c16", tint: "rgba(50,70,140,0.26)", glow: { x: 0.7, y: 0.2, c: "220,230,255", a: 0.3 }, fire: 0.8 },
    { h: 24.0, top: "#0a1424", mid: "#12203a", bot: "#0e1a14", tint: "rgba(50,70,140,0.28)", glow: null,          fire: 1 }
  ];

  function lightAt(hour) {
    var a = LIGHT_KEYS[0], b = LIGHT_KEYS[LIGHT_KEYS.length - 1];
    for (var i = 0; i < LIGHT_KEYS.length - 1; i++) {
      if (hour >= LIGHT_KEYS[i].h && hour <= LIGHT_KEYS[i + 1].h) { a = LIGHT_KEYS[i]; b = LIGHT_KEYS[i + 1]; break; }
    }
    var t = (hour - a.h) / Math.max(0.001, b.h - a.h);
    return {
      top: mix(a.top, b.top, t), mid: mix(a.mid, b.mid, t), bot: mix(a.bot, b.bot, t),
      tint: a.tint,
      glow: (a.glow && b.glow) ? {
        x: lerp(a.glow.x, b.glow.x, t), y: lerp(a.glow.y, b.glow.y, t),
        c: a.glow.c, a: lerp(a.glow.a, b.glow.a, t)
      } : (a.glow || b.glow),
      fire: lerp(a.fire, b.fire, t)
    };
  }

  var SEASON_LEAF = {
    spring: ["#6fae4e", "#8cc45e", "#4e8a3e"],
    summer: ["#3f7d3a", "#55a04a", "#2f6230"],
    autumn: ["#c9762e", "#d8a03c", "#a83c2a"],
    winter: ["#5a6a58", "#6a7a66", "#4a5a4e"]
  };

  var ANIMAL_W = {
    cottontail: 82, gray_squirrel: 72, whitetail_deer: 178, red_fox: 128,
    raccoon: 96, wild_turkey: 118, barred_owl: 72, cardinal: 54,
    blue_jay: 60, box_turtle: 66
  };

  var R = {
    canvas: null, ctx: null, world: null,
    scale: 1, dpr: 1, cw: 0, ch: 0, y0: 0, visH: WORLD_H,
    sprites: {}, plantCache: {},
    bgCanvas: null, bgKey: "",
    particles: [],
    fx: null,   // pre-rendered fx sprites (glows, clouds, tufts, rays)
    time: { hour: 12, season: "spring", weather: "clear", fire: 0 }
  };

  /* Pre-rendered fx sprites: built once, blitted per frame (no per-frame gradients). */
  function ensureFx() {
    if (R.fx) return R.fx;
    var fx = R.fx = {};
    function radial(size, stops) {
      var c = document.createElement("canvas");
      c.width = c.height = size;
      var g = c.getContext("2d");
      var gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      for (var i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1]);
      g.fillStyle = gr; g.fillRect(0, 0, size, size);
      return c;
    }
    fx.glowWarm = radial(256, [[0, "rgba(255,240,210,1)"], [0.35, "rgba(255,225,170,0.5)"], [1, "rgba(255,220,160,0)"]]);
    fx.glowCool = radial(256, [[0, "rgba(220,235,255,1)"], [0.35, "rgba(200,220,250,0.45)"], [1, "rgba(190,210,250,0)"]]);
    fx.glowFirefly = radial(128, [[0, "rgba(255,255,210,1)"], [0.3, "rgba(230,255,170,0.7)"], [1, "rgba(200,255,150,0)"]]);
    fx.shadow = radial(128, [[0, "rgba(0,0,0,0.55)"], [0.7, "rgba(0,0,0,0.28)"], [1, "rgba(0,0,0,0)"]]);
    fx.dapple = radial(256, [[0, "rgba(255,250,220,0.9)"], [0.6, "rgba(255,246,210,0.35)"], [1, "rgba(255,246,210,0)"]]);
    // foreground grass blades (live wind sway)
    (function () {
      var bc = document.createElement("canvas");
      bc.width = 24; bc.height = 64;
      var bg3 = bc.getContext("2d");
      var brng = mulberry32(5);
      bg3.strokeStyle = "#5a7f42"; bg3.lineCap = "round";
      for (var bl = 0; bl < 5; bl++) {
        var bx = 4 + brng() * 16, bh = 34 + brng() * 26, bend = (brng() - 0.5) * 12;
        bg3.lineWidth = 2.6;
        bg3.beginPath(); bg3.moveTo(bx, 64);
        bg3.quadraticCurveTo(bx + bend * 0.4, 64 - bh * 0.6, bx + bend, 64 - bh);
        bg3.stroke();
      }
      fx.blade = bc;
      fx.bladeSpots = [];
      var srng = mulberry32(2026);
      for (var s = 0; s < 26; s++) {
        fx.bladeSpots.push([srng() * WORLD_W, 1420 + srng() * 170, 0.8 + srng() * 0.9, srng() * 6.28]);
      }
    })();
    // clouds: soft white puffs
    fx.clouds = [];
    var crng = mulberry32(77);
    for (var ci = 0; ci < 3; ci++) {
      var cc = document.createElement("canvas");
      cc.width = 340; cc.height = 150;
      var cg = cc.getContext("2d");
      for (var b = 0; b < 16; b++) {
        var bx = 60 + crng() * 220, by = 60 + crng() * 50, br = 22 + crng() * 34;
        var bg2 = cg.createRadialGradient(bx, by, 0, bx, by, br);
        bg2.addColorStop(0, "rgba(255,255,255,0.55)");
        bg2.addColorStop(1, "rgba(255,255,255,0)");
        cg.fillStyle = bg2;
        cg.beginPath(); cg.arc(bx, by, br, 0, 7); cg.fill();
      }
      fx.clouds.push(cc);
    }
    // grass tufts: 3 tint variants
    fx.tufts = ["#4a7a3a", "#6a9a44", "#8aa04e"].map(function (col) {
      var tc = document.createElement("canvas");
      tc.width = 48; tc.height = 40;
      var tg = tc.getContext("2d");
      var trng = mulberry32(col.length * 991);
      tg.strokeStyle = col; tg.lineCap = "round";
      for (var bl = 0; bl < 9; bl++) {
        var ba = -Math.PI / 2 + (trng() - 0.5) * 1.6;
        var bh = 18 + trng() * 18, bend = (trng() - 0.5) * 14;
        tg.lineWidth = 2.4;
        tg.beginPath(); tg.moveTo(24 + (trng() - 0.5) * 16, 40);
        tg.quadraticCurveTo(24 + bend * 0.4, 40 - bh * 0.6, 24 + bend, 40 - bh);
        tg.stroke();
      }
      return tc;
    });
    // god-ray wedge
    (function () {
      var rc = document.createElement("canvas");
      rc.width = 160; rc.height = 700;
      var rg = rc.getContext("2d");
      var rgr = rg.createLinearGradient(0, 0, 0, 700);
      rgr.addColorStop(0, "rgba(255,246,220,0.55)");
      rgr.addColorStop(1, "rgba(255,246,220,0)");
      rg.fillStyle = rgr;
      rg.beginPath(); rg.moveTo(60, 0); rg.lineTo(100, 0); rg.lineTo(150, 700); rg.lineTo(10, 700);
      rg.closePath(); rg.fill();
      // soften horizontal edges
      rg.globalCompositeOperation = "destination-in";
      var soft = rg.createLinearGradient(0, 0, 160, 0);
      soft.addColorStop(0, "rgba(0,0,0,0)"); soft.addColorStop(0.25, "rgba(0,0,0,1)");
      soft.addColorStop(0.75, "rgba(0,0,0,1)"); soft.addColorStop(1, "rgba(0,0,0,0)");
      rg.fillStyle = soft; rg.fillRect(0, 0, 160, 700);
      fx.ray = rc;
    })();
    return fx;
  }

  function init(canvas, world) {
    R.canvas = canvas; R.ctx = canvas.getContext("2d");
    R.world = world;
    R.dpr = Math.min(2, window.devicePixelRatio || 1);
    resize();
    window.addEventListener("resize", resize);
  }

  function resize() {
    var w = R.canvas.clientWidth || R.canvas.parentElement.clientWidth || window.innerWidth;
    var h = R.canvas.clientHeight || R.canvas.parentElement.clientHeight || window.innerHeight;
    R.cw = w; R.ch = h;
    R.canvas.width = Math.round(w * R.dpr);
    R.canvas.height = Math.round(h * R.dpr);
    R.scale = R.canvas.width / WORLD_W;           // device px per world unit
    R.visH = R.canvas.height / R.scale;           // visible world height
    R.y0 = (WORLD_H - R.visH) / 2;                // top of visible world (may be <0)
    R.bgKey = "";
  }

  /* world -> CSS pixels (for input mapping) */
  function worldToCss(x, y) {
    var sx = x / WORLD_W * R.cw;
    var sy = (y - R.y0) / R.visH * R.ch;
    return { x: sx, y: sy };
  }
  function cssToWorld(cx, cy) {
    return { x: cx / R.cw * WORLD_W, y: cy / R.ch * R.visH + R.y0 };
  }

  function loadSprites() {
    var ids = ["cottontail", "gray_squirrel", "whitetail_deer", "red_fox",
      "raccoon", "wild_turkey", "barred_owl", "cardinal", "blue_jay", "box_turtle",
      "cottontail_juv", "gray_squirrel_juv", "whitetail_deer_juv", "red_fox_juv"];
    var jobs = ids.map(function (id) {
      return new Promise(function (res) {
        var img = new Image();
        img.onload = function () { R.sprites[id] = img; res(); };
        img.onerror = function () { res(); };
        img.src = "data:" + (window.WG_SPR[id + "_mime"] || "image/webp") + ";base64," + window.WG_SPR[id];
      });
    });
    var ka = new Promise(function (res) {
      var img = new Image();
      img.onload = function () {
        var el = document.getElementById("title-art");
        if (el) el.src = img.src;
        res();
      };
      img.onerror = function () { res(); };
      img.src = "data:" + (window.WG_SPR["keyart_mime"] || "image/jpeg") + ";base64," + window.WG_SPR["keyart"];
    });
    jobs.push(ka);
    return Promise.all(jobs);
  }

  /* ================= BACKGROUND =================
     Baked hourly: gradient sky, stars (night), 3 atmospheric treeline layers,
     textured ground with grass tufts + dappled light + seasonal dressing. */

  function renderBackground(light, season, weather) {
    var key = Math.floor(R.time.hour) + "|" + season + "|" + weather;
    if (key === R.bgKey && R.bgCanvas) return R.bgCanvas;
    R.bgKey = key;
    var fx = ensureFx();
    var yA = R.y0 - 40, yB = R.y0 + R.visH + 40;   // overscan
    var c = document.createElement("canvas");
    c.width = R.canvas.width;
    c.height = Math.ceil((yB - yA) * R.scale);
    c._yA = yA;
    var g = c.getContext("2d");
    g.scale(R.scale, R.scale);
    g.translate(0, -yA);
    var rng = mulberry32(1234);
    var night = R.time.hour < 5.5 || R.time.hour > 19;

    // sky
    var gr = g.createLinearGradient(0, yA, 0, yB);
    gr.addColorStop(0, light.top);
    gr.addColorStop(0.42, light.mid);
    gr.addColorStop(1, light.bot);
    g.fillStyle = gr; g.fillRect(0, yA, WORLD_W, yB - yA);

    // stars baked into the night sky
    if (night) {
      for (var st = 0; st < 90; st++) {
        var sx = rng() * WORLD_W, sy = yA + rng() * 420;
        g.fillStyle = "rgba(255,255,255," + (0.25 + rng() * 0.6) + ")";
        var sr = rng() < 0.12 ? 2.2 : 1.2;
        g.fillRect(sx, sy, sr, sr);
      }
    }

    // treeline layers, far -> near (atmospheric perspective: far layers melt into sky)
    function treeWall(baseY, count, wMin, wMax, hMin, hMax, color, seed) {
      var lrng = mulberry32(seed);
      g.fillStyle = color;
      // continuous canopy mass first
      g.beginPath();
      g.moveTo(-50, baseY);
      for (var x = -50; x < WORLD_W + 50; x += 40) {
        g.lineTo(x, baseY - hMin * (0.55 + lrng() * 0.5));
      }
      g.lineTo(WORLD_W + 50, baseY);
      g.closePath(); g.fill();
      // individual crowns + trunks for texture
      for (var i = 0; i < count; i++) {
        var tx = lrng() * WORLD_W, tw = wMin + lrng() * (wMax - wMin);
        var th = hMin + lrng() * (hMax - hMin);
        g.fillRect(tx - tw * 0.06, baseY - th * 0.5, tw * 0.12, th * 0.5);
        g.beginPath();
        g.ellipse(tx, baseY - th * 0.62, tw * 0.5, th * 0.42, 0, 0, 7);
        g.fill();
        g.beginPath();
        g.ellipse(tx + tw * 0.3, baseY - th * 0.5, tw * 0.34, th * 0.3, 0, 0, 7);
        g.fill();
      }
    }
    var haze = light.mid;
    treeWall(430, 34, 60, 120, 200, 330, mix("#1c3024", haze, 0.55), 11);  // far: hazy blue-green
    treeWall(540, 22, 80, 150, 260, 420, mix("#14241a", haze, 0.28), 22);  // mid
    treeWall(660, 13, 110, 200, 330, 520, "rgba(12,20,14,0.96)", 33);       // near: deep woods edge

    // deep woods floor shade (gradient, not flat)
    var sh = g.createLinearGradient(0, 560, 0, 760);
    sh.addColorStop(0, "rgba(8,16,10,0.5)");
    sh.addColorStop(1, "rgba(8,16,10,0)");
    g.fillStyle = sh;
    g.fillRect(0, 560, WORLD_W, 200);

    // meadow ground: warm gradient
    var gg = g.createLinearGradient(0, 620, 0, yB);
    gg.addColorStop(0, mix(light.bot, "#5a6e3a", 0.45));
    gg.addColorStop(0.5, mix(light.bot, "#4a5e32", 0.55));
    gg.addColorStop(1, mix(light.bot, "#3a4c28", 0.62));
    g.fillStyle = gg;
    g.fillRect(0, 620, WORLD_W, yB - 620);

    // grass tuft stamps
    for (var k = 0; k < 240; k++) {
      var px = rng() * WORLD_W, py = 640 + rng() * (yB - 660);
      var ts = 0.7 + rng() * 1.1;
      g.globalAlpha = 0.35 + rng() * 0.45;
      var tuft = fx.tufts[Math.floor(rng() * 3)];
      g.drawImage(tuft, px - 24 * ts, py - 40 * ts, 48 * ts, 40 * ts);
    }
    g.globalAlpha = 1;

    // dappled sunlight (day only)
    if (!night && R.time.hour > 6.5 && R.time.hour < 18) {
      g.globalCompositeOperation = "screen";
      for (var dp = 0; dp < 16; dp++) {
        var dx = rng() * WORLD_W, dy = 660 + rng() * 700;
        var ds = 90 + rng() * 190;
        g.globalAlpha = 0.10 + rng() * 0.10;
        g.drawImage(fx.dapple, dx - ds / 2, dy - ds / 2, ds, ds * 0.6);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
    }

    // ground speckle for tooth
    for (var sp = 0; sp < 500; sp++) {
      var qx = rng() * WORLD_W, qy = 640 + rng() * (yB - 660);
      g.fillStyle = rng() < 0.5 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.05)";
      g.beginPath(); g.arc(qx, qy, 1 + rng() * 2.2, 0, 7); g.fill();
    }

    // seasonal dressing
    if (season === "autumn") {
      for (var au = 0; au < 130; au++) {
        g.fillStyle = ["#c9762e", "#d8a03c", "#a83c2a"][Math.floor(rng() * 3)];
        g.globalAlpha = 0.5 + rng() * 0.4;
        g.beginPath();
        g.ellipse(rng() * WORLD_W, 640 + rng() * (yB - 660), 3 + rng() * 4, 2 + rng() * 2, rng() * 3, 0, 7);
        g.fill();
      }
      g.globalAlpha = 1;
    }
    if (season === "winter") {
      g.fillStyle = "rgba(232,240,248,0.5)";
      g.fillRect(0, 620, WORLD_W, yB - 620);
      for (var m = 0; m < 260; m++) {
        g.fillStyle = "rgba(255,255,255," + (0.15 + rng() * 0.3) + ")";
        g.beginPath(); g.arc(rng() * WORLD_W, 640 + rng() * (yB - 660), 2 + rng() * 5, 0, 7); g.fill();
      }
      // sparkles
      for (var sk = 0; sk < 40; sk++) {
        g.fillStyle = "rgba(255,255,255," + (0.5 + rng() * 0.5) + ")";
        g.fillRect(rng() * WORLD_W, 640 + rng() * (yB - 660), 2, 2);
      }
    }
    if (season === "spring") {
      for (var fl = 0; fl < 60; fl++) {
        g.fillStyle = ["#e8a0c8", "#f2d06e", "#ffffff"][Math.floor(rng() * 3)];
        g.globalAlpha = 0.55 + rng() * 0.3;
        g.beginPath(); g.arc(rng() * WORLD_W, 660 + rng() * 600, 2.5 + rng() * 2, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
    }
    R.bgCanvas = c;
    return c;
  }

  /* Live sky: sun/moon + glow, drifting clouds, twinkling stars, birds.
     Drawn per frame but only ever blits pre-rendered sprites + tiny shapes. */
  function drawSkyLive(g, t) {
    var fx = ensureFx();
    var hour = R.time.hour;
    var night = hour < 5.5 || hour > 19;
    var dayAmt = night ? 0 : (hour < 7 ? (hour - 5.5) / 1.5 : hour > 17.5 ? (19 - hour) / 1.5 : 1);
    dayAmt = Math.max(0, Math.min(1, dayAmt));

    // sun / moon disc + halo (position from the light engine's glow anchor)
    var light = lightAt(hour);
    if (light.glow) {
      var gx = light.glow.x * WORLD_W, gy = R.y0 + light.glow.y * R.visH;
      var halo = night ? fx.glowCool : fx.glowWarm;
      var hs = night ? 420 : 520;
      g.globalAlpha = 0.75 * light.glow.a / 0.5 + 0.15;
      g.drawImage(halo, gx - hs / 2, gy - hs / 2, hs, hs);
      g.globalAlpha = 1;
      g.fillStyle = night ? "#f2f4fa" : "#fff6da";
      g.beginPath(); g.arc(gx, gy, night ? 26 : 34, 0, 7); g.fill();
      if (night) { // moon craters
        g.fillStyle = "rgba(180,190,210,0.5)";
        g.beginPath(); g.arc(gx - 8, gy - 5, 6, 0, 7); g.fill();
        g.beginPath(); g.arc(gx + 7, gy + 8, 4.5, 0, 7); g.fill();
      }
    }

    // clouds drift
    if (dayAmt > 0.05) {
      for (var i = 0; i < 4; i++) {
        var cw = 300 + (i % 3) * 90;
        var cx = ((t * (4 + i * 2.2) + i * 430) % (WORLD_W + 500)) - 250;
        var cy = R.y0 + 60 + (i % 3) * 130;
        g.globalAlpha = (0.16 + (i % 2) * 0.1) * (0.35 + dayAmt * 0.65);
        g.drawImage(fx.clouds[i % 3], cx - cw / 2, cy - 75, cw, 150 * (cw / 340));
      }
      g.globalAlpha = 1;
    }

    // twinkling stars (a live few over the baked many)
    if (night) {
      for (var s = 0; s < 26; s++) {
        var tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.0011 + s * 2.39));
        g.fillStyle = "rgba(255,255,255," + (tw * 0.9).toFixed(2) + ")";
        var px = ((s * 197.3) % 1) * WORLD_W, py = R.y0 + ((s * 331.7) % 1) * 400;
        g.fillRect(px, py, 2.4, 2.4);
      }
      // birds at dusk/dawn edges
      if (hour > 4.5 && hour < 6.5) drawBirds(g, t, 3);
    } else if (dayAmt > 0.3 && R.time.weather === "clear") {
      drawBirds(g, t, 3);
    }
  }

  function drawBirds(g, t, n) {
    g.strokeStyle = "rgba(30,35,40,0.55)";
    g.lineWidth = 3; g.lineCap = "round";
    for (var i = 0; i < n; i++) {
      var bx = ((t * (22 + i * 7) + i * 360) % (WORLD_W + 300)) - 150;
      var by = R.y0 + 140 + (i % 3) * 90 + Math.sin(t * 0.001 + i) * 22;
      var flap = Math.sin(t * 0.012 + i * 2.1) * 7;
      g.beginPath();
      g.moveTo(bx - 13, by);
      g.quadraticCurveTo(bx - 5, by - 8 - flap, bx, by);
      g.quadraticCurveTo(bx + 5, by - 8 - flap, bx + 13, by);
      g.stroke();
    }
  }

  function drawPond(g, t) {
    var cx = 500, cy = 830, rx = 250, ry = 110;
    var night = R.time.hour < 5.5 || R.time.hour > 19;
    // water body: depth gradient
    var wg = g.createRadialGradient(cx, cy - 20, 10, cx, cy, rx);
    if (night) {
      wg.addColorStop(0, "rgba(70,95,130,0.9)");
      wg.addColorStop(0.7, "rgba(40,60,95,0.9)");
      wg.addColorStop(1, "rgba(22,36,60,0.92)");
    } else {
      wg.addColorStop(0, "rgba(150,195,215,0.9)");
      wg.addColorStop(0.55, "rgba(85,130,160,0.9)");
      wg.addColorStop(1, "rgba(45,80,105,0.92)");
    }
    g.fillStyle = wg;
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); g.fill();
    // sky reflection band
    g.fillStyle = night ? "rgba(190,205,230,0.16)" : "rgba(255,255,255,0.22)";
    g.beginPath(); g.ellipse(cx, cy - ry * 0.42, rx * 0.72, ry * 0.30, 0, 0, 7); g.fill();
    // treeline reflections: soft dark streaks
    g.fillStyle = "rgba(15,28,22,0.20)";
    var rrng = mulberry32(99);
    for (var ri = 0; ri < 7; ri++) {
      var rwx = cx - rx * 0.8 + rrng() * rx * 1.6;
      g.beginPath();
      g.ellipse(rwx, cy - ry * 0.25 + rrng() * ry * 0.2, 8 + rrng() * 14, 22 + rrng() * 26, 0, 0, 7);
      g.fill();
    }
    // expanding ripple rings
    g.strokeStyle = night ? "rgba(220,230,245,0.20)" : "rgba(255,255,255,0.30)";
    for (var rp = 0; rp < 3; rp++) {
      var ph = ((t * 0.00012) + rp * 0.33) % 1;
      g.lineWidth = 2.2 * (1 - ph) + 0.6;
      g.globalAlpha = 0.5 * (1 - ph);
      g.beginPath();
      g.ellipse(cx + Math.sin(rp * 9) * 60, cy + Math.cos(rp * 7) * 30,
        20 + ph * rx * 0.8, 8 + ph * ry * 0.8, 0, 0, 7);
      g.stroke();
    }
    g.globalAlpha = 1;
    // drifting shimmer
    g.strokeStyle = "rgba(255,255,255,0.20)"; g.lineWidth = 2.5;
    for (var si = 0; si < 4; si++) {
      var sxp = cx - rx * 0.6 + ((t * 0.00003 + si * 0.27) % 1) * rx * 1.2;
      var syp = cy - ry * 0.35 + (si % 3) * ry * 0.32;
      g.beginPath();
      g.ellipse(sxp, syp, 18 + si * 7, 4.5, 0, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
    }
    // lily pads (always a few once the pond wakes)
    var lrng = mulberry32(7);
    for (var lp = 0; lp < 3; lp++) {
      var lx = cx - 120 + lp * 110 + (lrng() - 0.5) * 40;
      var ly = cy + 10 + (lrng() - 0.5) * 60;
      var bob = Math.sin(t * 0.0011 + lp * 2.4) * 3;
      g.fillStyle = "#3d6e3a";
      g.beginPath(); g.ellipse(lx, ly + bob, 30, 13, 0.2, 0, 7); g.fill();
      g.fillStyle = "rgba(255,255,255,0.18)";
      g.beginPath(); g.ellipse(lx - 6, ly + bob - 3, 14, 5, 0.2, 0, 7); g.fill();
      if (lp === 1) { // one flower
        g.fillStyle = "#e8a0c8";
        for (var pt = 0; pt < 6; pt++) {
          var pa = pt / 6 * Math.PI * 2;
          g.beginPath();
          g.ellipse(lx + Math.cos(pa) * 7, ly + bob - 8 + Math.sin(pa) * 7, 6, 3, pa, 0, 7);
          g.fill();
        }
        g.fillStyle = "#f2d06e";
        g.beginPath(); g.arc(lx, ly + bob - 8, 4, 0, 7); g.fill();
      }
    }
    // rim: muddy bank + reeds with sway
    g.strokeStyle = "rgba(96,78,54,0.85)"; g.lineWidth = 12;
    g.beginPath(); g.ellipse(cx, cy, rx + 5, ry + 5, 0, 0.08 * Math.PI, 0.92 * Math.PI); g.stroke();
    g.beginPath(); g.ellipse(cx, cy, rx + 5, ry + 5, 0, 1.08 * Math.PI, 1.92 * Math.PI); g.stroke();
    var prng = mulberry32(4242);
    for (var rd = 0; rd < 11; rd++) {
      var ang = Math.PI * (0.05 + 0.9 * prng());
      var ex = cx + Math.cos(ang) * (rx + 8), ey = cy + Math.sin(ang) * (ry + 8);
      var rh = 46 + prng() * 44;
      var sway = Math.sin(t * 0.0016 + rd * 1.7) * 7;
      g.strokeStyle = prng() < 0.4 ? "#4a6e38" : "#5a7a42";
      g.lineWidth = 4; g.lineCap = "round";
      g.beginPath(); g.moveTo(ex, ey);
      g.quadraticCurveTo(ex + sway * 0.5, ey - rh * 0.6, ex + sway, ey - rh);
      g.stroke();
      if (prng() < 0.45) { // cattail head
        g.fillStyle = "#5a3a22";
        g.beginPath();
        g.ellipse(ex + sway, ey - rh - 8, 6, 13, sway * 0.02, 0, 7);
        g.fill();
        g.strokeStyle = "#7a9a52"; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(ex + sway, ey - rh - 20);
        g.lineTo(ex + sway, ey - rh - 30); g.stroke();
      } else { // grass seed head
        g.fillStyle = "#8aa04e";
        g.beginPath(); g.arc(ex + sway, ey - rh, 5, 0, 7); g.fill();
      }
    }
  }

  /* ================= PLANTS ================= */

  function invalidatePlant(id) {
    if (id < 0) { R.plantCache = {}; return; }
    for (var k in R.plantCache) if (k.indexOf(id + ":") === 0) delete R.plantCache[k];
  }

  function leafColors(season) { return SEASON_LEAF[season] || SEASON_LEAF.summer; }

  function drawPlantSprite(p, stage, season) {
    var cfg = WG.FLORA[p.sp];
    var rng = mulberry32(p.id * 7919 + 13);
    var size = cfg.kind === "tree" ? 300 : cfg.kind === "bush" ? 130 : 80;
    if (stage === "young") size *= 0.55;
    if (stage === "sprout") size *= 0.28;
    var pad = 20;
    var S = 2; // supersample for crispness
    var c = document.createElement("canvas");
    c.width = c.height = Math.ceil((size + pad * 2) * S);
    var g = c.getContext("2d");
    g.scale(S, S);
    g.translate(size / 2 + pad, size + pad);
    var leaves = leafColors(season);

    g.fillStyle = "rgba(0,0,0,0.22)";
    g.beginPath(); g.ellipse(0, 2, size * 0.32, size * 0.07, 0, 0, 7); g.fill();

    function blob(x, y, r, color) {
      g.fillStyle = color;
      g.beginPath(); g.ellipse(x, y, r, r * 0.82, rng() * 3, 0, 7); g.fill();
    }
    function leafCluster(cx, cy, r, n) {
      for (var i = 0; i < n; i++) {
        var a = rng() * Math.PI * 2, d = rng() * r;
        blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, r * (0.28 + rng() * 0.3),
          leaves[Math.floor(rng() * leaves.length)]);
      }
      for (var j = 0; j < n / 3; j++) {
        var a2 = rng() * Math.PI * 2, d2 = rng() * r * 0.7;
        g.fillStyle = "rgba(255,250,220,0.25)";
        g.beginPath();
        g.ellipse(cx + Math.cos(a2) * d2, cy - r * 0.3 + Math.sin(a2) * d2 * 0.5, r * 0.22, r * 0.18, 0, 0, 7);
        g.fill();
      }
    }

    if (stage === "seed") {
      g.fillStyle = "#5a4632";
      g.beginPath(); g.ellipse(0, 0, 9, 5, 0, 0, 7); g.fill();
    } else if (stage === "sprout") {
      g.strokeStyle = "#4e8a3e"; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-4, -12, -10, -18); g.stroke();
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(4, -12, 10, -18); g.stroke();
      blob(-11, -19, 6, leaves[1]); blob(11, -19, 6, leaves[0]);
    } else if (cfg.kind === "tree") {
      var trunkH = size * 0.42, trunkW = size * 0.055;
      // trunk with taper + bark shading
      var bark = g.createLinearGradient(-trunkW, 0, trunkW, 0);
      bark.addColorStop(0, "#3a2c1e"); bark.addColorStop(0.45, "#54402c");
      bark.addColorStop(1, "#33261a");
      g.fillStyle = bark;
      g.beginPath();
      g.moveTo(-trunkW, 0); g.lineTo(-trunkW * 0.62, -trunkH);
      g.lineTo(trunkW * 0.62, -trunkH); g.lineTo(trunkW, 0); g.closePath(); g.fill();
      // root flare
      g.fillStyle = "#3a2c1e";
      g.beginPath(); g.ellipse(0, 0, trunkW * 1.7, trunkW * 0.5, 0, 0, 7); g.fill();

      var bare = (season === "winter" && p.sp !== "loblolly_pine");
      // branches (always drawn; visible in winter, peeking through leaves otherwise)
      g.strokeStyle = "#3d2f20"; g.lineCap = "round";
      var branchTips = [];
      var nBr = 5;
      for (var b = 0; b < nBr; b++) {
        var ba = -Math.PI / 2 + (b / (nBr - 1) - 0.5) * 2.1;
        var bl = trunkH * (0.55 + rng() * 0.3);
        var bx0 = 0, by0 = -trunkH * (0.82 + rng() * 0.12);
        var bx1 = Math.cos(ba) * bl * 0.6, by1 = by0 + Math.sin(ba) * bl * 0.6;
        var bx2 = Math.cos(ba) * bl, by2 = by0 + Math.sin(ba) * bl;
        g.lineWidth = bare ? 7 : 5;
        g.beginPath(); g.moveTo(bx0, by0);
        g.quadraticCurveTo(bx1, by1, bx2, by2); g.stroke();
        branchTips.push([bx2, by2]);
        if (bare) { // twigs
          g.lineWidth = 2.5;
          for (var tw2 = 0; tw2 < 3; tw2++) {
            var ta = ba + (rng() - 0.5) * 1.2, tl = 26 + rng() * 30;
            g.beginPath(); g.moveTo(bx2, by2);
            g.lineTo(bx2 + Math.cos(ta) * tl, by2 + Math.sin(ta) * tl); g.stroke();
          }
        }
      }

      function mass(x, y, r, color, squash) {
        g.fillStyle = color;
        g.beginPath();
        g.ellipse(x, y, r, r * (squash || 0.8), rng() * 3, 0, 7);
        g.fill();
      }
      var dark = "rgba(18,34,20,0.9)";
      var shade = "rgba(10,22,14,0.35)";

      if (!bare) {
        var cy = -trunkH - size * 0.24;
        if (p.sp === "loblolly_pine") {
          // tiered conifer: drooping branch layers
          for (var t = 0; t < 5; t++) {
            var ty = -trunkH * 0.25 - t * size * 0.115;
            var tr = size * (0.30 - t * 0.048);
            for (var sgm = 0; sgm < 7; sgm++) {
              var sa = (sgm / 7) * Math.PI * 2 + t * 0.4;
              var sx = Math.cos(sa) * tr * 0.62, sy2 = ty + Math.sin(sa) * tr * 0.2;
              mass(sx, sy2, tr * 0.42, dark, 0.55);
            }
            leafCluster(0, ty, tr, 9);
            // sunlit top edge
            for (var hl = 0; hl < 4; hl++) {
              mass((rng() - 0.5) * tr, ty - tr * 0.42, tr * 0.2, "rgba(255,250,220,0.22)", 0.5);
            }
          }
          leafCluster(0, -trunkH * 0.25 - 5 * size * 0.115, size * 0.07, 5);
        } else {
          // broadleaf: silhouette masses, then foliage, then light
          var spread = p.sp === "white_oak" ? 1.12 : 0.95;   // oak broader
          var lift = p.sp === "red_maple" ? -size * 0.06 : 0; // maple slightly conical
          var masses = [
            [0, cy + lift, 0.36], [-0.30, cy + size * 0.10, 0.24], [0.30, cy + size * 0.10, 0.24],
            [-0.16, cy - size * 0.16 + lift, 0.24], [0.16, cy - size * 0.16 + lift, 0.24],
            [0, cy - size * 0.26 + lift, 0.20]
          ];
          for (var mi = 0; mi < masses.length; mi++) {
            mass(masses[mi][0] * size * spread, masses[mi][1], masses[mi][2] * size, dark);
          }
          // mid-tone foliage over the dark base
          for (var mj = 0; mj < masses.length; mj++) {
            leafCluster(masses[mj][0] * size * spread, masses[mj][1], masses[mj][2] * size * 0.92,
              p.sp === "white_oak" ? 7 : 6);
          }
          // shade on lower-right, light on upper-left (sun side)
          for (var sd = 0; sd < 10; sd++) {
            mass(size * (0.05 + rng() * 0.28) * spread, cy + size * (0.02 + rng() * 0.22),
              size * (0.08 + rng() * 0.08), shade);
          }
          for (var li = 0; li < 18; li++) {
            mass(size * (-0.30 + rng() * 0.28) * spread, cy - size * (0.05 + rng() * 0.30) + lift,
              size * (0.045 + rng() * 0.055), "rgba(235,255,205,0.20)");
          }
          // branch tips peek through
          g.strokeStyle = "rgba(40,28,18,0.7)"; g.lineWidth = 4;
          for (var bt = 0; bt < branchTips.length; bt++) {
            g.beginPath(); g.moveTo(branchTips[bt][0] * 0.7, branchTips[bt][1]);
            g.lineTo(branchTips[bt][0], branchTips[bt][1]); g.stroke();
          }
        }
      } else {
        // winter buds on bare branches
        g.fillStyle = "#6a4a30";
        for (var bd = 0; bd < 14; bd++) {
          g.beginPath();
          g.arc((rng() - 0.5) * size * 0.7, -trunkH - rng() * size * 0.4, 3, 0, 7);
          g.fill();
        }
      }
    } else if (cfg.kind === "bush") {
      for (var cn = 0; cn < 7; cn++) {
        var ang = -Math.PI / 2 + (rng() - 0.5) * 1.8;
        var len = size * (0.35 + rng() * 0.25);
        var ex = Math.cos(ang) * len, ey = Math.sin(ang) * len;
        g.strokeStyle = "#3d5a2e"; g.lineWidth = 3.5;
        g.beginPath(); g.moveTo(0, 0);
        g.quadraticCurveTo(ex * 0.4, ey * 0.6, ex, ey); g.stroke();
        for (var lf = 0; lf < 4; lf++) {
          var tt = 0.3 + lf * 0.2;
          blob(ex * tt * 0.9, ey * tt, 7 + rng() * 5, leaves[Math.floor(rng() * 3)]);
        }
      }
      if (season !== "winter") {
        for (var br = 0; br < 10; br++) {
          g.fillStyle = season === "summer" ? "#5a1e3a" : "#3a1426";
          g.beginPath();
          g.arc((rng() - 0.5) * size * 0.7, -rng() * size * 0.45, 3.4 + rng() * 2, 0, 7);
          g.fill();
        }
      }
    } else if (p.sp === "coneflower") {
      for (var st = 0; st < 5; st++) {
        var sx = (rng() - 0.5) * size * 0.5, sh = size * (0.4 + rng() * 0.3);
        g.strokeStyle = "#4e7a3a"; g.lineWidth = 3;
        g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx * 1.2, -sh); g.stroke();
        var pc = season === "winter" ? "#8a7a5a" : "#b46a9e";
        for (var pt = 0; pt < 7; pt++) {
          var pa = (pt / 7) * Math.PI * 2;
          g.fillStyle = pc;
          g.beginPath();
          g.ellipse(sx * 1.2 + Math.cos(pa) * 9, -sh + Math.sin(pa) * 9, 7, 3.4, pa, 0, 7);
          g.fill();
        }
        g.fillStyle = "#c98a2e";
        g.beginPath(); g.arc(sx * 1.2, -sh, 4.5, 0, 7); g.fill();
      }
    } else if (p.sp === "fern") {
      for (var fr = 0; fr < 8; fr++) {
        var fa = -Math.PI / 2 + (fr / 8 - 0.5) * 2.4;
        var fl = size * (0.35 + rng() * 0.2);
        g.strokeStyle = leaves[fr % 3]; g.lineWidth = 4; g.lineCap = "round";
        g.beginPath(); g.moveTo(0, 0);
        g.quadraticCurveTo(Math.cos(fa) * fl * 0.6, Math.sin(fa) * fl * 0.6,
          Math.cos(fa) * fl, Math.sin(fa) * fl * 0.82);
        g.stroke();
        g.lineWidth = 2;
        for (var ll = 1; ll <= 5; ll++) {
          var t2 = ll / 6;
          var lx = Math.cos(fa) * fl * t2, ly = Math.sin(fa) * fl * t2 * 0.75;
          g.beginPath(); g.moveTo(lx, ly);
          g.lineTo(lx + Math.cos(fa + 1.2) * 8, ly + Math.sin(fa + 1.2) * 8); g.stroke();
          g.beginPath(); g.moveTo(lx, ly);
          g.lineTo(lx + Math.cos(fa - 1.2) * 8, ly + Math.sin(fa - 1.2) * 8); g.stroke();
        }
      }
    } else {
      var blades = p.sp === "bluestem" ? 11 : 7;
      for (var bl = 0; bl < blades; bl++) {
        var ba = -Math.PI / 2 + (rng() - 0.5) * 1.4;
        var bh = size * (0.3 + rng() * 0.35);
        var bend = (rng() - 0.5) * 22;
        g.strokeStyle = leaves[bl % 3]; g.lineWidth = p.sp === "bluestem" ? 3 : 2.5;
        g.lineCap = "round";
        var bx = (rng() - 0.5) * 20;
        g.beginPath(); g.moveTo(bx, 0);
        g.quadraticCurveTo(bx + bend * 0.4, -bh * 0.6, bx + bend, -bh); g.stroke();
        if (p.sp === "clover") {
          g.fillStyle = leaves[(bl + 1) % 3];
          for (var cl = 0; cl < 3; cl++) {
            g.beginPath();
            g.arc(bx + bend + Math.cos(cl * 2.1) * 5, -bh + Math.sin(cl * 2.1) * 5, 4.6, 0, 7);
            g.fill();
          }
        }
      }
    }
    c._worldSize = size + pad * 2;
    c._ss = S;
    return c;
  }

  function getPlantSprite(p, season) {
    var stage = WG.plantStage(p, R.world);
    var key = p.id + ":" + stage + "|" + season;
    if (!R.plantCache[key]) R.plantCache[key] = drawPlantSprite(p, stage, season);
    return R.plantCache[key];
  }

  /* Mature thumbnail for UI (plant picker). Deterministic fake plant. */
  function thumbFor(spId, season) {
    var h = 7;
    for (var i = 0; i < spId.length; i++) h = (h * 31 + spId.charCodeAt(i)) | 0;
    return drawPlantSprite({ id: h, sp: spId }, "mature", season || "summer");
  }

  /* ================= ANIMALS ================= */

  function drawAnimal(g, a, t) {
    var sid = a.juvenile && R.sprites[a.sp + "_juv"] ? a.sp + "_juv" : a.sp;
    var img = R.sprites[sid];
    if (!img) return;
    var baseW = (ANIMAL_W[a.sp] || 70) * (a.juvenile ? 0.55 : 1);
    var dw = baseW, dh = dw * img.height / img.width;
    var x = a.x, y = a.y;

    var vx = a.tx - a.x;
    var flip = vx > 4;
    var moving = Math.abs(vx) > 6 || Math.abs(a.ty - a.y) > 6;
    var bob = 0, tilt = 0, breathe = 1;
    if (a.state === "flee" || a.state === "hunt") {
      bob = Math.abs(Math.sin(t * 0.02)) * 7;
      tilt = flip ? -0.1 : 0.1;
    } else if (moving) {
      bob = -(a.sp === "cottontail" ? Math.abs(Math.sin(t * 0.012)) * 10 : Math.sin(t * 0.014) * 3.5);
      tilt = Math.sin(t * 0.014) * 0.05;
    } else if (a.state === "sleep") {
      breathe = 1 + Math.sin(t * 0.002) * 0.02;
    } else {
      breathe = 1 + Math.sin(t * 0.004 + a.id) * 0.015;
    }

    var fx = ensureFx();
    var shW = dw * 1.2;
    g.globalAlpha = 0.55;
    g.drawImage(fx.shadow, x - shW / 2, y - shW * 0.13 + 3, shW, shW * 0.26);
    g.globalAlpha = 1;

    g.save();
    g.translate(x, y - dh * 0.42 + bob);
    g.rotate(tilt);
    if (flip) g.scale(-1, 1);
    g.scale(breathe, 1 / breathe);
    if (a.state === "sleep") g.globalAlpha = 0.92;
    g.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    g.restore();

    if (a.state === "sleep") {
      var zt = (t * 0.0006 + a.id * 0.3) % 1;
      g.fillStyle = "rgba(240,240,255," + (0.7 * (1 - zt)) + ")";
      g.font = "24px Georgia";
      g.fillText("z", x + 14, y - dh * 0.5 - zt * 26);
    }
    if (a.resident && !a.juvenile) {
      g.fillStyle = "rgba(242,234,216,0.85)";
      g.font = "italic 26px Georgia";
      g.textAlign = "center";
      g.fillText(a.name, x, y - dh * 0.62 - 14);
      g.textAlign = "left";
    }
  }

  /* ================= PARTICLES (world units) ================= */

  function spawnParticles(dt) {
    var w = R.time.weather, season = R.time.season, fire = R.time.fire;
    function add(p) { if (R.particles.length < 420) R.particles.push(p); }
    if (w === "rain" || w === "storm") {
      var n = w === "storm" ? 5 : 3;
      for (var i = 0; i < n; i++) add({
        type: "rain", x: Math.random() * WORLD_W, y: R.y0 - 20,
        vx: -60, vy: 900 + Math.random() * 400, life: 1.6
      });
    } else if (season === "winter") {
      for (var j = 0; j < 2; j++) add({
        type: "snow", x: Math.random() * WORLD_W, y: R.y0 - 10,
        vx: (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 80,
        r: 1.5 + Math.random() * 2.5, ph: Math.random() * 7, life: 16
      });
    } else if (season === "autumn" && Math.random() < 0.25) {
      add({
        type: "leaf", x: Math.random() * WORLD_W, y: R.y0 - 12,
        vx: (Math.random() - 0.5) * 50, vy: 70 + Math.random() * 60,
        r: 4 + Math.random() * 4, rot: Math.random() * 7, vr: (Math.random() - 0.5) * 4,
        col: ["#c9762e", "#d8a03c", "#a83c2a"][Math.floor(Math.random() * 3)], life: 14
      });
    } else if (season === "spring" && Math.random() < 0.12) {
      add({
        type: "petal", x: Math.random() * WORLD_W, y: R.y0 - 10,
        vx: (Math.random() - 0.5) * 40, vy: 50 + Math.random() * 50,
        r: 2.5 + Math.random() * 2.5, rot: Math.random() * 7, vr: (Math.random() - 0.5) * 3, life: 12
      });
    }
    var flies = 0;
    for (var f = 0; f < R.particles.length; f++) if (R.particles[f].type === "firefly") flies++;
    if (fire > 0.3 && Math.random() < fire * 0.3 && flies < 26) {
      add({
        type: "firefly", x: Math.random() * WORLD_W, y: R.y0 + R.visH * (0.3 + Math.random() * 0.6),
        ph: Math.random() * 7, life: 22
      });
    }
  }

  function burst(x, y, type) {
    for (var i = 0; i < 14; i++) {
      var a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 120;
      R.particles.push({
        type: type, x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        r: 2 + Math.random() * 3, life: 0.9, age: 0,
        col: type === "splash" ? "#7fb2d8" : "#cfe8a8"
      });
    }
  }

  function drawParticles(g, dt, t) {
    var yB = R.y0 + R.visH + 40;
    var fx = ensureFx();
    for (var i = R.particles.length - 1; i >= 0; i--) {
      var p = R.particles[i];
      p.age = (p.age || 0) + dt;
      if (p.age > p.life || p.y > yB) { R.particles.splice(i, 1); continue; }
      var fade = 1 - p.age / p.life;
      if (p.type === "rain") {
        p.x += p.vx * dt; p.y += p.vy * dt;
        g.strokeStyle = "rgba(170,200,230,0.5)"; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); g.stroke();
      } else if (p.type === "snow") {
        p.x += (p.vx + Math.sin(t * 0.001 + p.ph) * 30) * dt; p.y += p.vy * dt;
        g.fillStyle = "rgba(255,255,255," + (0.85 * fade) + ")";
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
      } else if (p.type === "leaf" || p.type === "petal") {
        p.x += (p.vx + Math.sin(t * 0.002 + p.rot) * 40) * dt; p.y += p.vy * dt;
        p.rot += p.vr * dt;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.fillStyle = p.type === "leaf" ? p.col : "rgba(240,200,215," + (0.9 * fade) + ")";
        g.beginPath(); g.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, 7); g.fill();
        g.restore();
      } else if (p.type === "firefly") {
        p.x += Math.sin(t * 0.0007 + p.ph) * 24 * dt;
        p.y += Math.cos(t * 0.0009 + p.ph * 2) * 18 * dt;
        var gl = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.002 + p.ph * 3));
        var fs = 30;
        g.globalAlpha = gl * fade;
        g.drawImage(fx.glowFirefly, p.x - fs / 2, p.y - fs / 2, fs, fs);
        g.globalAlpha = 0.9 * fade;
        g.fillStyle = "#fffad0";
        g.beginPath(); g.arc(p.x, p.y, 2.2, 0, 7); g.fill();
        g.globalAlpha = 1;
      } else {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt;
        g.fillStyle = p.col;
        g.globalAlpha = fade;
        g.beginPath(); g.arc(p.x, p.y, Math.max(0.1, p.r * fade), 0, 7); g.fill();
        g.globalAlpha = 1;
      }
    }
  }

  /* ================= FRAME ================= */

  function frame(nowMs, dt) {
    var g = R.ctx;
    var world = R.world;
    var hour = WG.hourOf(world.now);
    var season = WG.seasonOf(world);
    var weather = world.weather;
    var light = lightAt(hour);
    R.time = { hour: hour, season: season, weather: weather, fire: light.fire };

    // world transform
    g.setTransform(R.scale, 0, 0, R.scale, 0, -R.y0 * R.scale);
    // clear in device px
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, R.canvas.width, R.canvas.height);
    g.restore();

    var yA = R.y0 - 40, yB = R.y0 + R.visH + 40;

    // background
    var bg = renderBackground(light, season, weather);
    g.drawImage(bg, 0, bg._yA, WORLD_W, (yB - yA));
    drawSkyLive(g, nowMs);

    if (WG.zoneUnlocked(world, "pond")) drawPond(g, nowMs);

    // drawables sorted by y
    var draws = [];
    var i, p, a;
    for (i = 0; i < world.plants.length; i++) {
      p = world.plants[i];
      draws.push({ y: p.y, k: 0, p: p });
    }
    for (i = 0; i < world.animals.length; i++) {
      a = world.animals[i];
      if (a.state === "hide") continue;
      draws.push({ y: a.y, k: 1, a: a });
    }
    draws.sort(function (x, y) { return (x.y - y.y) || (x.k - y.k); });

    for (i = 0; i < draws.length; i++) {
      var d = draws[i];
      if (d.k === 0) {
        var img = getPlantSprite(d.p, season);
        var ws = img._worldSize;
        g.drawImage(img, d.p.x - ws / 2, d.p.y - ws + 8, ws, ws);
      } else {
        drawAnimal(g, d.a, nowMs);
      }
    }

    // sleeping zones mist
    for (var z = 0; z < WG.ZONES.length; z++) {
      var zone = WG.ZONES[z];
      if (!WG.zoneUnlocked(world, zone.id)) {
        var mg = g.createLinearGradient(0, zone.y[0], 0, zone.y[1]);
        mg.addColorStop(0, "rgba(200,215,225,0.55)");
        mg.addColorStop(1, "rgba(200,215,225,0.75)");
        g.fillStyle = mg;
        g.fillRect(0, zone.y[0], WORLD_W, zone.y[1] - zone.y[0]);
        g.fillStyle = "rgba(60,70,80,0.9)";
        g.font = "italic 34px Georgia";
        g.textAlign = "center";
        g.fillText("the " + zone.name.toLowerCase() + " sleeps…", WORLD_W / 2, zone.y[0] + 130);
        g.textAlign = "left";
      }
    }

    spawnParticles(dt);
    drawParticles(g, dt, nowMs);

    // foreground grass: live wind sway (a few blades, pre-rendered sprite)
    (function () {
      var fx = ensureFx();
      var wind = Math.sin(nowMs * 0.0009) * 0.5 + 0.5;   // slow gust 0..1
      for (var bi = 0; bi < fx.bladeSpots.length; bi++) {
        var bs = fx.bladeSpots[bi];
        var sway = Math.sin(nowMs * 0.0021 + bs[3] + bs[0] * 0.01) * (0.06 + wind * 0.10);
        g.save();
        g.translate(bs[0], bs[1]);
        g.rotate(sway);
        var bw = 24 * bs[2], bh = 64 * bs[2];
        g.drawImage(fx.blade, -bw / 2, -bh, bw, bh);
        g.restore();
      }
    })();

    // light grade + glow + vignette (in world units)
    g.fillStyle = light.tint;
    g.fillRect(0, yA, WORLD_W, yB - yA);
    if (light.glow) {
      var gg = g.createRadialGradient(
        light.glow.x * WORLD_W, R.y0 + light.glow.y * R.visH, 0,
        light.glow.x * WORLD_W, R.y0 + light.glow.y * R.visH, WORLD_W * 0.55);
      gg.addColorStop(0, "rgba(" + light.glow.c + "," + light.glow.a + ")");
      gg.addColorStop(1, "rgba(" + light.glow.c + ",0)");
      g.fillStyle = gg;
      g.fillRect(0, yA, WORLD_W, yB - yA);
    }
    var vg = g.createRadialGradient(WORLD_W / 2, R.y0 + R.visH / 2, R.visH * 0.32,
      WORLD_W / 2, R.y0 + R.visH / 2, R.visH * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(8,12,10,0.42)");
    g.fillStyle = vg;
    g.fillRect(0, yA, WORLD_W, yB - yA);

    // god rays at dawn (and faintly at dusk)
    var rayA = 0;
    if (hour > 5.2 && hour < 8.2) rayA = 0.5 * Math.sin((hour - 5.2) / 3 * Math.PI);
    else if (hour > 17.2 && hour < 19) rayA = 0.22 * Math.sin((hour - 17.2) / 1.8 * Math.PI);
    if (rayA > 0.02) {
      var fx = ensureFx();
      g.save();
      g.globalCompositeOperation = "screen";
      for (var ri = 0; ri < 3; ri++) {
        var sway = Math.sin(nowMs * 0.00021 + ri * 2.2) * 26;
        g.globalAlpha = rayA * (0.5 - ri * 0.11);
        var rx = 130 + ri * 300 + sway;
        g.drawImage(fx.ray, rx, R.y0 - 60, 170, 1150);
      }
      g.restore();
    }

    // reset transform
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  window.WGR = {
    init: init, loadSprites: loadSprites, frame: frame,
    burst: burst, invalidatePlant: invalidatePlant, resize: resize,
    lightAt: lightAt, cssToWorld: cssToWorld, worldToCss: worldToCss,
    thumbFor: thumbFor
  };
})();
