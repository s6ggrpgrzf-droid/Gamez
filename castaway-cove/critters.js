/* Castaway Cove — species art module (global).
 * One honest shape per body plan: fish (default) + crab/shrimp/jelly/
 * squid/octopus/eel/seahorse/ray. Loaded before game.js; game.js calls
 * drawSpecies() and patternFor() as globals.
 */
function shade(hex, amt) {
  /* amt -100..100: darken/lighten a #rrggbb color */
  var n = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  var c = n.map(function (v) { return Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt / 100) : v + (255 - v) * amt / 100))); });
  return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
}

/* ---------- fish drawing (shared by scene, journal, cards) ---------- */
function patternFor(id) {
  /* per-fish pattern from a stable id hash: stripes | spots | bands */
  var h = 0;
  for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ['stripes', 'spots', 'bands'][h % 3];
}
function drawFish(g, x, y, s, color, o) {
  o = o || {};
  g.save();
  g.translate(x, y);
  if (o.flip) g.scale(-1, 1);
  var L = 34 * s, Hh = 15 * s * (o.slim ? 0.62 : 1); /* darters are slim: shape = information */
  if (o.silhouette) {
    g.fillStyle = 'rgba(25,45,65,0.55)';
  } else {
    g.fillStyle = color;
    /* soft contact shadow: pre-drawn ellipse, no shadowBlur */
    g.fillStyle = 'rgba(10,25,35,0.16)';
    g.beginPath(); g.ellipse(2, Hh * 0.5, L * 0.46, Hh * 0.2, 0, 0, 6.283); g.fill();
    g.fillStyle = color;
  }
  g.beginPath(); /* tail */
  g.moveTo(-L * 0.42, 0); g.lineTo(-L * 0.72, -Hh * 0.75); g.lineTo(-L * 0.72, Hh * 0.75);
  g.closePath(); g.fill();
  g.beginPath(); /* body */
  g.ellipse(0, 0, L * 0.5, Hh * 0.62, 0, 0, 6.283); g.fill();
  if (!o.silhouette) {
    /* per-fish pattern, clipped to the body */
    if (o.pattern && color) {
      g.save();
      g.beginPath(); g.ellipse(0, 0, L * 0.5, Hh * 0.62, 0, 0, 6.283); g.clip();
      g.fillStyle = shade(color, -28);
      if (o.pattern === 'stripes') {
        for (var i = -1; i <= 1; i++) {
          g.beginPath(); g.ellipse(i * L * 0.22, 0, L * 0.07, Hh * 0.62, 0, 0, 6.283); g.fill();
        }
      } else if (o.pattern === 'spots') {
        var spots = [[-0.25, -0.3], [0.05, 0.25], [0.3, -0.15], [-0.05, -0.05], [0.22, 0.32], [-0.35, 0.28]];
        for (var j = 0; j < spots.length; j++) {
          g.beginPath(); g.arc(spots[j][0] * L, spots[j][1] * Hh, L * 0.055, 0, 6.283); g.fill();
        }
      } else {
        for (var k2 = -1; k2 <= 1; k2++) {
          g.fillRect(-L * 0.5, k2 * Hh * 0.42 - Hh * 0.1, L, Hh * 0.2);
        }
      }
      g.restore();
    }
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.ellipse(L * 0.08, -Hh * 0.22, L * 0.3, Hh * 0.22, -0.2, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(20,20,20,0.75)';
    g.beginPath(); g.arc(L * 0.3, -Hh * 0.1, Math.max(1.4, 2.4 * s), 0, 6.283); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.arc(L * 0.3 + 0.8, -Hh * 0.1 - 0.8, Math.max(0.7, 0.9 * s), 0, 6.283); g.fill();
  }
  g.restore();
}

/* ---------- per-kind species art ----------
 * Not everything in the cove is a fish. drawSpecies dispatches on fish.kind
 * (crab | shrimp | jelly | squid | octopus | eel | seahorse | ray), defaulting
 * to drawFish. Every kind honors o.silhouette (undiscovered journal shape)
 * and o.flip. Style matches drawFish: soft contact shadow, no shadowBlur. */
function drawSpecies(g, x, y, s, fish, o) {
  o = o || {};
  var kind = fish.kind || 'fish';
  if (kind === 'crab') return drawCrab(g, x, y, s, fish.color, o);
  if (kind === 'shrimp') return drawShrimp(g, x, y, s, fish.color, o);
  if (kind === 'jelly') return drawJelly(g, x, y, s, fish.color, o);
  if (kind === 'squid') return drawSquid(g, x, y, s, fish.color, o);
  if (kind === 'octopus') return drawOctopus(g, x, y, s, fish.color, o);
  if (kind === 'eel') return drawEel(g, x, y, s, fish.color, o);
  if (kind === 'seahorse') return drawSeahorse(g, x, y, s, fish.color, o);
  if (kind === 'ray') return drawRay(g, x, y, s, fish.color, o);
  return drawFish(g, x, y, s, fish.color, o);
}
function critShadow(g, s) {
  g.fillStyle = 'rgba(10,25,35,0.16)';
  g.beginPath(); g.ellipse(2 * s, 15 * s, 23 * s, 5 * s, 0, 0, 6.283); g.fill();
}
function critSetup(g, x, y, s, color, o) {
  /* returns {sil, base, dark}; caller does g.save/translate/flip itself */
  var sil = !!o.silhouette;
  if (!sil) critShadow(g, s);
  return { sil: sil, base: sil ? 'rgba(25,45,65,0.55)' : color, dark: sil ? 'rgba(25,45,65,0.55)' : shade(color, -32) };
}
function drawCrab(g, x, y, s, color, o) {
  var c = critSetup(g, x, y, s, color, o);
  g.save(); g.translate(x, y); if (o.flip) g.scale(-1, 1);
  g.lineCap = 'round';
  g.strokeStyle = c.dark; g.lineWidth = 3 * s;           /* walking legs, 3 a side */
  for (var i = 0; i < 3; i++) {
    var ly = (-4 + i * 6) * s;
    g.beginPath(); g.moveTo(-14 * s, ly - 2 * s); g.lineTo(-26 * s, ly + 7 * s); g.stroke();
    g.beginPath(); g.moveTo(14 * s, ly - 2 * s); g.lineTo(26 * s, ly + 7 * s); g.stroke();
  }
  g.strokeStyle = c.dark; g.lineWidth = 4 * s;           /* claw arms */
  g.beginPath(); g.moveTo(-10 * s, -8 * s); g.quadraticCurveTo(-18 * s, -16 * s, -20 * s, -22 * s); g.stroke();
  g.beginPath(); g.moveTo(10 * s, -8 * s); g.quadraticCurveTo(18 * s, -16 * s, 20 * s, -22 * s); g.stroke();
  g.fillStyle = c.base;
  g.beginPath(); g.ellipse(0, 0, 17 * s, 11 * s, 0, 0, 6.283); g.fill();   /* carapace */
  g.beginPath(); g.arc(-20 * s, -25 * s, 6.5 * s, 0, 6.283); g.fill();    /* claws */
  g.beginPath(); g.arc(20 * s, -25 * s, 6.5 * s, 0, 6.283); g.fill();
  if (!c.sil) {
    g.fillStyle = c.dark;                                 /* claw notches */
    g.beginPath(); g.moveTo(-20 * s - 5 * s, -29 * s); g.lineTo(-20 * s + 1 * s, -24 * s); g.lineTo(-20 * s - 2 * s, -21 * s); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(20 * s + 5 * s, -29 * s); g.lineTo(20 * s - 1 * s, -24 * s); g.lineTo(20 * s + 2 * s, -21 * s); g.closePath(); g.fill();
    g.strokeStyle = c.dark; g.lineWidth = 2 * s;          /* eye stalks + eyes */
    g.beginPath(); g.moveTo(-6 * s, -10 * s); g.lineTo(-7 * s, -17 * s); g.stroke();
    g.beginPath(); g.moveTo(6 * s, -10 * s); g.lineTo(7 * s, -17 * s); g.stroke();
    g.fillStyle = 'rgba(20,20,20,0.8)';
    g.beginPath(); g.arc(-7 * s, -18 * s, 2.4 * s, 0, 6.283); g.fill();
    g.beginPath(); g.arc(7 * s, -18 * s, 2.4 * s, 0, 6.283); g.fill();
  }
  g.restore();
}
function drawShrimp(g, x, y, s, color, o) {
  var c = critSetup(g, x, y, s, color, o);
  g.save(); g.translate(x, y); if (o.flip) g.scale(-1, 1);
  if (!c.sil) g.globalAlpha = 0.82;
  g.lineCap = 'round';
  g.strokeStyle = c.base; g.lineWidth = 2 * s;           /* antennae */
  g.beginPath(); g.moveTo(16 * s, -4 * s); g.quadraticCurveTo(30 * s, -10 * s, 34 * s, -20 * s); g.stroke();
  g.beginPath(); g.moveTo(16 * s, 0); g.quadraticCurveTo(30 * s, -2 * s, 36 * s, -10 * s); g.stroke();
  g.fillStyle = c.dark;                                  /* tail fan */
  g.beginPath(); g.moveTo(-20 * s, 0); g.lineTo(-30 * s, -7 * s); g.lineTo(-28 * s, 2 * s); g.lineTo(-31 * s, 9 * s); g.closePath(); g.fill();
  g.fillStyle = c.base;                                  /* curved segmented body */
  var seg = [[14, -2, 8], [5, 1, 9], [-5, 2, 8.4], [-14, 1, 7]];
  for (var i = 0; i < seg.length; i++) {
    g.beginPath(); g.arc(seg[i][0] * s, seg[i][1] * s, seg[i][2] * s, 0, 6.283); g.fill();
  }
  if (!c.sil) {
    g.fillStyle = 'rgba(20,20,20,0.8)';
    g.beginPath(); g.arc(15 * s, -3 * s, 2.2 * s, 0, 6.283); g.fill();
  }
  g.globalAlpha = 1;
  g.restore();
}
function drawJelly(g, x, y, s, color, o) {
  var c = critSetup(g, x, y, s, color, o);
  g.save(); g.translate(x, y); if (o.flip) g.scale(-1, 1);
  g.lineCap = 'round';
  g.strokeStyle = c.base; g.lineWidth = 2.4 * s;         /* trailing tentacles */
  for (var i = -2; i <= 2; i++) {
    var tx = i * 7 * s;
    g.beginPath(); g.moveTo(tx, 4 * s);
    g.quadraticCurveTo(tx + 3 * s, 16 * s, tx - 3 * s, 26 * s); g.stroke();
  }
  g.fillStyle = c.base;                                  /* dome */
  g.beginPath(); g.arc(0, 2 * s, 15 * s, Math.PI, 0); g.closePath(); g.fill();
  if (!c.sil) {
    g.fillStyle = 'rgba(255,255,255,0.35)';              /* inner glow */
    g.beginPath(); g.arc(-3 * s, -4 * s, 8 * s, Math.PI, 0); g.closePath(); g.fill();
    g.fillStyle = 'rgba(20,20,20,0.55)';                 /* sleepy eyes */
    g.beginPath(); g.arc(-5 * s, -4 * s, 1.8 * s, 0, 6.283); g.fill();
    g.beginPath(); g.arc(5 * s, -4 * s, 1.8 * s, 0, 6.283); g.fill();
  }
  g.restore();
}
function drawSquid(g, x, y, s, color, o) {
  var c = critSetup(g, x, y, s, color, o);
  g.save(); g.translate(x, y); if (o.flip) g.scale(-1, 1);
  g.lineCap = 'round';
  g.fillStyle = c.base;
  g.beginPath();                                         /* mantle: tapered torpedo */
  g.moveTo(-14 * s, 0);
  g.quadraticCurveTo(6 * s, -11 * s, 20 * s, -3 * s);
  g.lineTo(26 * s, 0); g.lineTo(20 * s, 3 * s);
  g.quadraticCurveTo(6 * s, 11 * s, -14 * s, 0);
  g.closePath(); g.fill();
  g.fillStyle = c.dark;                                  /* side fins */
  g.beginPath(); g.moveTo(8 * s, -9 * s); g.lineTo(16 * s, -17 * s); g.lineTo(14 * s, -6 * s); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(8 * s, 9 * s); g.lineTo(16 * s, 17 * s); g.lineTo(14 * s, 6 * s); g.closePath(); g.fill();
  g.fillStyle = c.base;
  g.beginPath(); g.arc(-18 * s, 0, 8 * s, 0, 6.283); g.fill();   /* head */
  g.strokeStyle = c.base; g.lineWidth = 2.6 * s;         /* arms */
  for (var i = -2; i <= 2; i++) {
    g.beginPath(); g.moveTo(-24 * s, i * 2.4 * s);
    g.quadraticCurveTo(-32 * s, i * 4 * s, -36 * s, i * 6 * s - 4 * s); g.stroke();
  }
  if (!c.sil) {
    g.fillStyle = '#fff';                                /* big squid eye */
    g.beginPath(); g.arc(-19 * s, -2 * s, 3.6 * s, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(20,20,20,0.85)';
    g.beginPath(); g.arc(-19 * s, -2 * s, 1.8 * s, 0, 6.283); g.fill();
  }
  g.restore();
}
function drawOctopus(g, x, y, s, color, o) {
  var c = critSetup(g, x, y, s, color, o);
  g.save(); g.translate(x, y); if (o.flip) g.scale(-1, 1);
  g.lineCap = 'round';
  g.strokeStyle = c.base; g.lineWidth = 5 * s;           /* eight arms, four a side */
  for (var i = 0; i < 4; i++) {
    var ax = (5 + i * 3.4) * s, drop = (14 + i * 3) * s;
    g.beginPath(); g.moveTo(-ax * 0.6, 6 * s); g.quadraticCurveTo(-ax, 12 * s, -ax - 3 * s, drop); g.stroke();
    g.beginPath(); g.moveTo(ax * 0.6, 6 * s); g.quadraticCurveTo(ax, 12 * s, ax + 3 * s, drop); g.stroke();
  }
  g.fillStyle = c.base;
  g.beginPath(); g.arc(0, -6 * s, 13 * s, 0, 6.283); g.fill();   /* mantle head */
  if (!c.sil) {
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(-5 * s, -8 * s, 3.4 * s, 0, 6.283); g.fill();
    g.beginPath(); g.arc(5 * s, -8 * s, 3.4 * s, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(20,20,20,0.85)';
    g.beginPath(); g.arc(-5 * s, -8 * s, 1.7 * s, 0, 6.283); g.fill();
    g.beginPath(); g.arc(5 * s, -8 * s, 1.7 * s, 0, 6.283); g.fill();
  }
  g.restore();
}
function drawEel(g, x, y, s, color, o) {
  var c = critSetup(g, x, y, s, color, o);
  g.save(); g.translate(x, y); if (o.flip) g.scale(-1, 1);
  g.lineCap = 'round';
  g.fillStyle = c.base;                                  /* long sine-wave body */
  for (var i = 0; i < 10; i++) {
    var t = i / 9, ex = (-26 + t * 52) * s, ey = Math.sin(t * 5.2) * 7 * s;
    g.beginPath(); g.arc(ex, ey, (8 - t * 4.5) * s, 0, 6.283); g.fill();
  }
  g.fillStyle = c.dark;                                  /* dorsal fin */
  g.beginPath(); g.moveTo(-14 * s, -8 * s); g.quadraticCurveTo(2 * s, -16 * s, 14 * s, -8 * s); g.closePath(); g.fill();
  if (!c.sil) {
    if (o.pattern) {                                     /* bands suit eels */
      g.fillStyle = shade(color, -28);
      for (var b = 0; b < 3; b++) {
        var bx = (-14 + b * 13) * s;
        g.beginPath(); g.ellipse(bx, Math.sin((b * 13 + 12) / 52 * 5.2) * 7 * s, 3.4 * s, 6 * s, 0, 0, 6.283); g.fill();
      }
    }
    g.fillStyle = 'rgba(20,20,20,0.8)';
    g.beginPath(); g.arc(24 * s, Math.sin(5.2) * 7 * s - 2 * s, 2.2 * s, 0, 6.283); g.fill();
  }
  g.restore();
}
function drawSeahorse(g, x, y, s, color, o) {
  var c = critSetup(g, x, y, s, color, o);
  g.save(); g.translate(x, y); if (o.flip) g.scale(-1, 1);
  g.lineCap = 'round';
  g.strokeStyle = c.base; g.lineWidth = 10 * s;          /* upright S body */
  g.beginPath(); g.moveTo(7 * s, 18 * s);
  g.quadraticCurveTo(-8 * s, 8 * s, -2 * s, -4 * s);
  g.quadraticCurveTo(2 * s, -12 * s, 8 * s, -16 * s); g.stroke();
  g.strokeStyle = c.base; g.lineWidth = 2 * s;           /* curled tail */
  g.beginPath(); g.moveTo(7 * s, 18 * s);
  g.quadraticCurveTo(12 * s, 24 * s, 4 * s, 25 * s);
  g.quadraticCurveTo(-2 * s, 25 * s, 0 * s, 20 * s); g.stroke();
  g.fillStyle = c.base;
  g.beginPath(); g.arc(10 * s, -19 * s, 6.5 * s, 0, 6.283); g.fill();  /* head */
  g.beginPath();                                         /* snout */
  g.moveTo(14 * s, -21 * s); g.lineTo(22 * s, -18 * s); g.lineTo(14 * s, -15 * s); g.closePath(); g.fill();
  g.fillStyle = c.dark;                                  /* coronet */
  for (var i = 0; i < 3; i++) {
    g.beginPath(); g.arc((6 + i * 4) * s, -25 * s, 1.8 * s, 0, 6.283); g.fill();
  }
  g.beginPath();                                         /* dorsal fin */
  g.moveTo(-7 * s, -6 * s); g.lineTo(-15 * s, -12 * s); g.lineTo(-9 * s, 0 * s); g.closePath(); g.fill();
  if (!c.sil) {
    g.fillStyle = 'rgba(20,20,20,0.8)';
    g.beginPath(); g.arc(11 * s, -20 * s, 2 * s, 0, 6.283); g.fill();
  }
  g.restore();
}
function drawRay(g, x, y, s, color, o) {
  var c = critSetup(g, x, y, s, color, o);
  g.save(); g.translate(x, y); if (o.flip) g.scale(-1, 1);
  g.lineCap = 'round';
  g.strokeStyle = c.dark; g.lineWidth = 2.4 * s;         /* whip tail */
  g.beginPath(); g.moveTo(20 * s, 1 * s); g.quadraticCurveTo(36 * s, 3 * s, 45 * s, 9 * s); g.stroke();
  g.fillStyle = c.base;                                  /* diamond wings, pointed tips */
  g.beginPath();
  g.moveTo(-27 * s, 0);                                  /* left wingtip */
  g.lineTo(4 * s, -13 * s);                              /* leading edge */
  g.quadraticCurveTo(17 * s, -7 * s, 20 * s, 0);          /* rounded head */
  g.quadraticCurveTo(17 * s, 7 * s, 4 * s, 11 * s);       /* trailing edge */
  g.closePath(); g.fill();
  if (!c.sil) {
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.beginPath(); g.ellipse(2 * s, -2 * s, 8 * s, 3.4 * s, -0.1, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(20,20,20,0.75)';                 /* eyes on top */
    g.beginPath(); g.arc(2 * s, -5 * s, 2 * s, 0, 6.283); g.fill();
    g.beginPath(); g.arc(8 * s, -4 * s, 2 * s, 0, 6.283); g.fill();
  }
  g.restore();
}

