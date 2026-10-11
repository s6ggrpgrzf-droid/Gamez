/* Skyline Sparrow — feel.js
   ONE feel hub, one switch. Every effect (shake, flash, particles, slow-mo)
   is a call on Feel. `enabled=false` (reduced motion) resets everything.
   Feel NEVER decides gameplay: it only reacts to committed sim events.
   UMD. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SSFeel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

function Feel() {
  this.enabled = true;
  this.intensity = 1;          // 0..2 multiplier
  // trauma shake
  this.trauma = 0;
  this.shakeX = 0; this.shakeY = 0;
  this.t = 0;
  // wall-clock hitstop / slow-mo (never game-time)
  this.hitstopEnd = 0;
  this.slowmoEnd = 0; this.slowmoScale = 1;
  // screen flash (drawn as opaque rect, alpha faked by shrinking rect? no —
  // flash is a single full-screen rect; keep alpha tiny count: 1 draw)
  this.flash = 0; this.flashColor = '#ffffff';
  // tweens: channel -> {t, dur, rest, kind}
  this.tweens = {};
  // particle pool: fixed, opaque rects/circles only (no alpha blending on iOS)
  this.parts = [];
  for (var i = 0; i < 120; i++) {
    this.parts.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 3, color: '#fff', grav: 0 });
  }
  this.squash = { x: 1, y: 1 }; // sparrow squash & stretch (render reads)
}
Feel.prototype.reset = function () {
  this.trauma = 0; this.shakeX = 0; this.shakeY = 0;
  this.hitstopEnd = 0; this.slowmoEnd = 0; this.slowmoScale = 1;
  this.flash = 0;
  this.tweens = {};
  for (var i = 0; i < this.parts.length; i++) this.parts[i].on = false;
  this.squash.x = 1; this.squash.y = 1;
};
Feel.prototype.setEnabled = function (on) {
  this.enabled = !!on;
  if (!this.enabled) this.reset();
};

/* smooth noise from sin composites (never white noise) */
function noise(t) { return Math.sin(t) * 0.55 + Math.sin(t * 2.13 + 1.7) * 0.3 + Math.sin(t * 4.7 + 4.2) * 0.15; }

Feel.prototype.addTrauma = function (x) {
  if (!this.enabled) return;
  this.trauma = Math.min(1, this.trauma + x * this.intensity);
};
/* returns {x, y} offset to apply to the camera THIS frame.
   MUST subtract last frame's offset first or the camera drifts. */
Feel.prototype.shakeOffset = function (dt) {
  var ox = this.shakeX, oy = this.shakeY;
  this.shakeX = 0; this.shakeY = 0;
  if (!this.enabled) return { x: -ox, y: -oy, dx: -ox, dy: -oy };
  // wall-clock decay so shake keeps moving through hitstop
  this.trauma = Math.max(0, this.trauma - dt * 2.2);
  var s = this.trauma * this.trauma; // trauma-squared: 0.3 barely trembles
  if (s > 0.0001) {
    this.t += dt;
    var m = 10 * this.intensity;
    this.shakeX = s * m * noise(this.t * 31.7);
    this.shakeY = s * m * noise(this.t * 27.3 + 5.2);
  }
  return { dx: this.shakeX - ox, dy: this.shakeY - oy };
};

Feel.prototype.hitstop = function (ms) {
  if (!this.enabled) return;
  var until = performance.now() + ms;
  if (until > this.hitstopEnd) this.hitstopEnd = until; // longer extends, shorter never cuts
};
Feel.prototype.inHitstop = function () { return performance.now() < this.hitstopEnd; };
Feel.prototype.slowmo = function (scale, ms) {
  if (!this.enabled) return;
  this.slowmoScale = scale;
  this.slowmoEnd = performance.now() + ms;
};
Feel.prototype.timeScale = function () {
  if (!this.enabled) return 1;
  return performance.now() < this.slowmoEnd ? this.slowmoScale : 1;
};

Feel.prototype.flashScreen = function (color, amt) {
  if (!this.enabled) return;
  this.flashColor = color;
  this.flash = Math.min(1, this.flash + amt);
};

/* 20/80 tween: 20% out (quad ease-out), 80% settle (elastic ease-out).
   Records rest value on first touch; kills previous tween on the channel;
   always returns to rest so spam can never leave anything stuck. */
Feel.prototype.tween = function (channel, dur, fn) {
  var tw = this.tweens[channel];
  if (!tw || !tw.restRecorded) {
    this.tweens[channel] = { t: 0, dur: dur, fn: fn, restRecorded: false, rest: null };
    tw = this.tweens[channel];
  } else {
    tw.t = 0; tw.dur = dur; tw.fn = fn; // kill previous, restart
  }
  if (!this.enabled) { delete this.tweens[channel]; return; }
};
function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }
function easeOutElastic(t) {
  if (t <= 0 || t >= 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
}
Feel.prototype.updateTweens = function (dt, get, set) {
  // get(channel) -> current value; set(channel, value) applies it.
  // fn(attack01, settle01, rest, cur): attack eases 0->1 over the first 20%,
  // settle runs an elastic 0->1 over the remaining 80% (the 20/80 rule).
  for (var ch in this.tweens) {
    var tw = this.tweens[ch];
    tw.t += dt;
    var k = Math.min(1, tw.t / tw.dur);
    var cur = get(ch);
    if (!tw.restRecorded) { tw.rest = JSON.parse(JSON.stringify(cur)); tw.restRecorded = true; }
    var attack = k < 0.2 ? easeOutQuad(k / 0.2) : 1;
    var settle = k < 0.2 ? 0 : easeOutElastic((k - 0.2) / 0.8);
    tw.fn(attack, settle, tw.rest, cur);
    if (k >= 1) { set(ch, tw.rest); delete this.tweens[ch]; }
  }
};

/* pooled particles — opaque only */
Feel.prototype.burst = function (x, y, n, color, spd, grav, size) {
  if (!this.enabled) return;
  n = Math.min(n, 24);
  var made = 0;
  for (var i = 0; i < this.parts.length && made < n; i++) {
    var p = this.parts[i];
    if (p.on) continue;
    var a = Math.random() * Math.PI * 2, s = spd * (0.4 + Math.random() * 0.8);
    p.on = true; p.x = x; p.y = y;
    p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - spd * 0.4;
    p.life = p.max = 0.4 + Math.random() * 0.5;
    p.size = size * (0.6 + Math.random() * 0.8);
    p.color = color; p.grav = grav || 0;
    made++;
  }
};
Feel.prototype.updateParts = function (dt) {
  for (var i = 0; i < this.parts.length; i++) {
    var p = this.parts[i];
    if (!p.on) continue;
    p.life -= dt;
    if (p.life <= 0) { p.on = false; continue; }
    p.vy += p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
};

/* squash & stretch presets for the sparrow */
Feel.prototype.squashJump = function () {
  if (!this.enabled) return;
  this.squash.x = 0.78; this.squash.y = 1.24;
};
Feel.prototype.squashLand = function (hard) {
  if (!this.enabled) return;
  this.squash.x = hard ? 1.3 : 1.18; this.squash.y = hard ? 0.7 : 0.82;
};
Feel.prototype.updateSquash = function (dt) {
  // exponential return to rest (1,1)
  var k = Math.min(1, dt * 10);
  this.squash.x += (1 - this.squash.x) * k;
  this.squash.y += (1 - this.squash.y) * k;
};

return { Feel: Feel };
});
