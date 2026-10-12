/* "you're the sparrow, low over golden fields, riding the evening wind home
 *  with the flock ahead of you."
 * (fantasy sentence, written before layout. It drives every choice below:
 *  the world fills the screen — no poster title, no button stack, no HUD bar.
 *  The title screen is already flying; the HUD is a whisper; one thumb flies.)
 */
(function () {
'use strict';

/* ---------------- utils ---------------- */
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function lerpAngle(a, b, t) {
  var d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
function $(id) { return document.getElementById(id); }

var RM = { on: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) };

/* ---------------- input: logical actions, never raw keys ---------------- */
var Input = {
  keys: {},
  touchSteerX: 0, touchSteerY: 0, touchFlap: 0, tapPulse: 0,
  steerX: 0, steerY: 0, flap: 0, brake: 0,
  pid: -1, sx: 0, sy: 0, moved: false, downAt: 0,
};
function resetTouch() {
  Input.pid = -1; Input.touchSteerX = 0; Input.touchSteerY = 0;
  Input.touchFlap = 0; Input.moved = false;
}
function initInput(canvas) {
  var GAME_KEYS = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'];
  window.addEventListener('keydown', function (e) {
    if (GAME_KEYS.indexOf(e.code) >= 0) e.preventDefault();
    Input.keys[e.code] = true;
    if (e.code === 'KeyP') togglePauseKey();
    if (e.code === 'Enter' && sceneName === 'title') startFlyFresh();
  });
  window.addEventListener('keyup', function (e) { Input.keys[e.code] = false; });
  window.addEventListener('blur', function () { Input.keys = {}; resetTouch(); });
  document.addEventListener('visibilitychange', function () {
    Input.keys = {}; resetTouch();
    if (document.hidden && sceneName === 'fly') show('pause');
  });

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', function (e) {
    if (Input.pid !== -1) return;
    Input.pid = e.pointerId; Input.sx = e.clientX; Input.sy = e.clientY;
    Input.moved = false; Input.downAt = performance.now();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  });
  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerId !== Input.pid) return;
    var dx = e.clientX - Input.sx, dy = e.clientY - Input.sy;
    if (Math.hypot(dx, dy) > 14) {
      Input.moved = true;
      Input.touchSteerX = clamp(dx / 90, -1, 1);
      Input.touchSteerY = clamp(-dy / 90, -1, 1); // drag up = climb
    }
  });
  function release(e) {
    if (e.pointerId !== Input.pid) return;
    var dur = performance.now() - Input.downAt;
    if (!Input.moved && dur < 260) Input.tapPulse = Math.max(Input.tapPulse, 0.3); // tap = one flap
    resetTouch();
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release); // pointercancel = release, always
}
function pollInput(dt) {
  if (Input.tapPulse > 0) Input.tapPulse -= dt;
  // hold-without-moving >160ms = keep flapping
  Input.touchFlap = (Input.pid !== -1 && !Input.moved && (performance.now() - Input.downAt) > 160) ? 1 : 0;
  var kx = ((Input.keys.ArrowRight || Input.keys.KeyD) ? 1 : 0) - ((Input.keys.ArrowLeft || Input.keys.KeyA) ? 1 : 0);
  var ky = ((Input.keys.ArrowUp || Input.keys.KeyW) ? 1 : 0) - ((Input.keys.ArrowDown || Input.keys.KeyS) ? 1 : 0);
  var scrX = clamp(kx + Input.touchSteerX, -1, 1);
  var scrY = clamp(ky + Input.touchSteerY, -1, 1);
  // screen-right is world -x; sim steerX+ turns toward +x (screen left) -> negate
  Input.steerX = -scrX;
  Input.steerY = scrY; // drag up / ArrowUp = climb
  Input.flap = ((Input.keys.Space ? 1 : 0) || Input.touchFlap || (Input.tapPulse > 0 ? 1 : 0));
  Input.brake = (Input.keys.ShiftLeft || Input.keys.ShiftRight) ? 1 : 0;
}

/* ---------------- three.js setup ---------------- */
var canvas = $('view'), renderer = null, scene = null, camera = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) { renderer = null; }
if (!renderer) {
  $('nogl').classList.remove('hidden');
  return;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // perf: cap DPR at 2
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // soft long shadows, one 1024 map
scene = new THREE.Scene();
camera = new THREE.PerspectiveCamera(62, 1, 0.5, 7000);
camera.position.set(0, 70, -80);

function resize() {
  var w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/* ---------------- world, effects ---------------- */
var world = WORLD.build(scene, THREE, 20261012);
EFFECTS.init(scene, THREE);
EFFECTS.setReduced(RM.on);
world.nextWp = 0;

var env = {
  windX: 1.4, windZ: 0.6, // gentle evening breeze down the valley
  thermals: world.thermals,
  groundH: world.groundH,
  perch: world.perch, // the old fence post: a place to land
};

/* ---------------- the sparrow ---------------- */
function buildSparrow() {
  var g = new THREE.Group();
  var brown = new THREE.MeshLambertMaterial({ color: 0x8a6844 });
  var darkB = new THREE.MeshLambertMaterial({ color: 0x4a3826 });
  var cream = new THREE.MeshLambertMaterial({ color: 0xe9dab9 });
  var body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), brown);
  body.scale.set(0.78, 0.72, 1.3); g.add(body);
  var belly = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), cream);
  belly.scale.set(0.72, 0.6, 1.15); belly.position.set(0, -0.11, 0.06); g.add(belly);
  var headG = new THREE.Group();
  headG.position.set(0, 0.17, 0.40); g.add(headG); // stabilizer: counter-rotates vs body
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), brown);
  headG.add(head);
  var cap = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8), new THREE.MeshLambertMaterial({ color: 0x3a2c22 }));
  cap.scale.set(1, 0.62, 1); cap.position.set(0, 0.13, -0.03); headG.add(cap);
  [-1, 1].forEach(function (s) {
    var cheek = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), cream);
    cheek.position.set(s * 0.13, -0.02, 0.04); headG.add(cheek);
    var eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0x14100c }));
    eye.position.set(s * 0.095, 0.055, 0.12); headG.add(eye);
  });
  var beak = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.17, 8), new THREE.MeshLambertMaterial({ color: 0xd89a4a }));
  beak.rotation.x = Math.PI / 2; beak.position.set(0, -0.04, 0.22); headG.add(beak);
  // tail: a real control surface — 5 slats fanning from the tail group
  var tailG = new THREE.Group();
  tailG.position.set(0, 0.05, -0.55); g.add(tailG);
  var tailSlats = [];
  for (var ti = 0; ti < 5; ti++) {
    var tsg = new THREE.Group(); tailG.add(tsg);
    var tslat = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.03, 0.44), darkB);
    tslat.position.z = -0.24; tsg.add(tslat);
    tailSlats.push(tsg);
  }
  // articulated wing: shoulder -> arm -> elbow -> hand -> wrist -> primary slats + alula
  function buildWing(side) {
    var shoulder = new THREE.Group();
    shoulder.position.set(side * 0.16, 0.10, 0.06);
    g.add(shoulder);
    var arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.045, 0.34), brown);
    arm.position.x = side * 0.25; shoulder.add(arm);
    var covert = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.2), darkB);
    covert.position.set(side * 0.28, 0.012, -0.1); shoulder.add(covert);
    var elbow = new THREE.Group();
    elbow.position.set(side * 0.5, 0, -0.01); shoulder.add(elbow);
    var hand = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.04, 0.24), brown);
    hand.position.x = side * 0.26; elbow.add(hand);
    var wrist = new THREE.Group();
    wrist.position.set(side * 0.52, 0, -0.03); elbow.add(wrist);
    var slats = [];
    for (var pi = 0; pi < 4; pi++) {
      var psg = new THREE.Group(); wrist.add(psg);
      var pslat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.025, 0.07), darkB);
      pslat.position.set(side * 0.17, 0, -0.02 - pi * 0.062);
      psg.add(pslat);
      slats.push(psg);
    }
    var alula = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.06), cream);
    alula.position.set(side * 0.1, 0.02, 0.13); elbow.add(alula);
    return { shoulder: shoulder, elbow: elbow, wrist: wrist, slats: slats, alula: alula };
  }
  var wl = buildWing(1), wr = buildWing(-1);
  // legs: tucked invisible in flight, dropping on short final (spec §9)
  var legs = [];
  [-1, 1].forEach(function (s) {
    var legG = new THREE.Group();
    legG.position.set(s * 0.09, -0.15, 0.14);
    var shin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.05), darkB);
    shin.position.y = -0.12; legG.add(shin);
    var foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.035, 0.13), darkB);
    foot.position.set(0, -0.25, 0.035); legG.add(foot);
    legG.visible = false;
    g.add(legG); legs.push(legG);
  });
  g.scale.setScalar(1.35); // readable at phone distance
  g.rotation.order = 'YXZ';
  g.traverse(function (o) { if (o.isMesh) o.castShadow = true; }); // the bird throws its shadow
  return { group: g, head: headG, tail: tailG, tailSlats: tailSlats, wl: wl, wr: wr, legs: legs };
}
var bird = buildSparrow();
scene.add(bird.group);

/* wingbeat keyframes (from the kinematics spec §10; elevation 0 = horizontal).
 * Twist is sampled phase-LEAD by WING.twistLead — the reversal happens BEFORE
 * the vertical reversal. That phase lead is what kills the floating-plane look. */
function keyed(keys, x) {
  var n = keys.length;
  x = ((x % 1) + 1) % 1;
  var i = 0;
  while (i < n - 2 && keys[i + 1][0] < x) i++;
  var a = keys[i], b = keys[i + 1];
  var t = (x - a[0]) / Math.max(1e-6, b[0] - a[0]);
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  var s = (1 - Math.cos(t * Math.PI)) / 2; // cosine ease: spike-free curves
  return a[1] + (b[1] - a[1]) * s;
}
var ELEV_KEYS = [[0,55],[0.08,50],[0.30,-10],[0.55,-45],[0.63,-40],[0.95,50],[1,55]];
var FLEX_KEYS = [[0,0.35],[0.08,0.2],[0.30,0.05],[0.55,0.3],[0.63,0.62],[0.80,0.62],[0.95,0.35],[1,0.35]];
var TWIST_KEYS = [[0,14],[0.2,4],[0.35,-12],[0.55,-12],[0.7,10],[0.85,14],[1,14]]; // deg, + = supination
var SWEEP_KEYS = [[0,0],[0.15,14],[0.4,8],[0.55,-6],[0.7,-12],[0.9,-4],[1,0]];     // deg, + = forward

function poseWing(w, side, elevD, flexS, twistD, sweepD, slot) {
  var D = Math.PI / 180;
  w.shoulder.rotation.z = side * elevD * D;      // elevation: the flap
  w.shoulder.rotation.y = -side * sweepD * D;    // sweep: figure-8 fore/aft
  w.shoulder.rotation.x = side * (-twistD) * D;  // twist: pronation/supination
  w.elbow.rotation.z = -side * flexS * 1.15;     // elbow flexion folds the hand-wing
  w.elbow.rotation.x = side * (-twistD) * 0.6 * D; // twist carries through the wrist
  for (var i = 0; i < w.slats.length; i++) {     // primary slotting: fingers at high AoA
    w.slats[i].rotation.y = side * slot * (0.05 + i * 0.13);
    w.slats[i].rotation.x = side * slot * 0.1;
  }
  w.alula.visible = slot > 0.04;                 // alula pops out at high AoA
  w.alula.rotation.y = side * slot * 0.75;
}

function poseBird(ist, time) {
  var D = Math.PI / 180;
  bird.group.position.set(ist.px, ist.py, ist.pz);
  bird.group.rotation.y = ist.heading;
  // body rides the wingbeat; the flare pitches it up toward the cross-parachute
  bird.group.rotation.x = -(ist.pitch + ist.bodyPitchOsc) + (ist.flare || 0) * 0.55;
  bird.group.rotation.z = ist.bank;
  // head stabilizer: gyroscopically level — counter-pitch the flap bob,
  // counter-roll the bank. A glued-on head reads as dead.
  bird.head.rotation.x = ist.bodyPitchOsc * 0.9;
  bird.head.rotation.z = -ist.bank * 0.85;
  bird.head.rotation.y = 0;
  if (ist.land === 'perched') {
    // alive on the post: head looks around, body breathes
    // (tail flicks are folded into the tail control surface below)
    bird.head.rotation.y = Math.sin(time * 0.6) * 0.45 + Math.sin(time * 1.73) * 0.12;
    bird.head.rotation.x = 0.04;
    if (!RM.on) bird.group.position.y += Math.sin(time * 2.1) * 0.008;
  }

  var p = ist.wingPhase, fold = ist.foldAmount;
  var gliding = !ist.flapping && fold < 0.05 && !ist.braking;
  var elevD, flexS, twistD, sweepD;
  if (ist.land === 'perched') {
    // wings ended UP at touchdown (animator's rule), folding to the body
    // within ~1 beat — perchT drives the blend, not the gait fold
    var pk = Math.min(1, (ist.perchT || 0) / 0.3);
    elevD = 55 * (1 - pk) + (-28) * pk;
    flexS = 0.85;
    twistD = 12 * (1 - pk);
    sweepD = -6 * (1 - pk) + (-60) * pk;
  } else {
    if (ist.braking) {                       // airbrake: raised wings, fanned tail
      elevD = 26; flexS = 0.25; twistD = 6; sweepD = 10;
    } else if (gliding) {                    // held-out glide: gentle dihedral
      elevD = 9 + Math.sin(time * 1.8) * 3; flexS = 0.15; twistD = 0; sweepD = 0;
    } else {                                 // burst: the asymmetric power stroke
      elevD = keyed(ELEV_KEYS, p);
      var spdF = clamp(1.25 - ist.speed / 18, 0.35, 0.95); // deep fold slow, shallow fast
      flexS = keyed(FLEX_KEYS, p) * spdF;
      twistD = keyed(TWIST_KEYS, (p + 0.12) % 1);          // twist LEADS the flap
      sweepD = keyed(SWEEP_KEYS, p);
      if (!RM.on) bird.group.position.y += Math.sin(p * Math.PI * 2 - 0.7) * 0.045;
    }
    if (ist.flare > 0) { // cross-parachute: wings sweep forward, body pitched up
      elevD = elevD * (1 - ist.flare) + 25 * ist.flare;
      sweepD = sweepD * (1 - ist.flare) + 38 * ist.flare;
      twistD *= (1 - ist.flare);
    }
    // bound: fold the wings TIGHT to the body (never a held-out glide)
    elevD = elevD * (1 - fold) + (-30) * fold;
    flexS = flexS * (1 - fold) + 1 * fold;
    twistD *= (1 - fold);
    sweepD = sweepD * (1 - fold) + (-68) * fold; // swept hard back against the flank
  }
  poseWing(bird.wl, 1, elevD, flexS, twistD, sweepD, ist.slotAmt);
  poseWing(bird.wr, -1, elevD, flexS, twistD, sweepD, ist.slotAmt);

  // legs drop on short final (~53ms before touchdown, spec §9)
  var legA = ist.legs || 0;
  for (var li = 0; li < bird.legs.length; li++) {
    var lg = bird.legs[li];
    lg.visible = legA > 0.03;
    lg.rotation.x = -1.25 * (1 - legA); // tucked forward under the belly -> hanging
  }

  // tail control surface: fan + pitch + twist from the sim
  for (var i = 0; i < bird.tailSlats.length; i++) {
    bird.tailSlats[i].rotation.y = (i - 2) * ist.tailSpread * D / 4;
  }
  bird.tail.rotation.x = ist.tailPitch * D;
  bird.tail.rotation.z = ist.tailTwist * D +
    (ist.land === 'perched' ? Math.sin(time * 2.3) * 0.09 : 0); // idle tail flicks
}

/* ---------------- sim state + fixed-step loop ---------------- */
var STEP = 1 / 60;
var S = FLIGHT.newBird(0, 64, -60, 0);   // live state (mutated in place)
var P = { px: 0, py: 0, pz: 0, heading: 0, pitch: 0, bank: 0 }; // prev, for interpolation
var R = { px: 0, py: 0, pz: 0, heading: 0, pitch: 0, bank: 0 };   // render state
var simIn = { flap: 0, steerX: 0, steerY: 0, brake: 0 };
var acc = 0, simTime = 0, timeSec = 0;
var nextWp = 0, lastTick = 0, streakT = 0, moteT = 0, windT = 0, bellRung = false;
var wasLand = 'air'; // touchdown edge detection
var flyStart = 0, hudT = 0, lastWpText = '', lastEnergy = -1;

function resetFlight() {
  var b = FLIGHT.newBird(0, 64, -60, 0);
  for (var k in b) S[k] = b[k];
  P.px = S.px; P.py = S.py; P.pz = S.pz; P.heading = S.heading; P.pitch = 0; P.bank = 0;
  nextWp = 0; world.nextWp = 0; acc = 0; lastTick = 0; bellRung = false;
  wasLand = 'air'; perchUI(false);
  flyStart = timeSec; lastWpText = ''; lastEnergy = -1;
  camera.position.set(S.px, S.py + 4, S.pz - 12);
}

function nearestThermal(x, z) {
  var best = null, bd = 1e18;
  for (var i = 0; i < world.thermals.length; i++) {
    var t = world.thermals[i];
    var d = (x - t.x) * (x - t.x) + (z - t.z) * (z - t.z);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

function stepSim(dt) {
  P.px = S.px; P.py = S.py; P.pz = S.pz; P.heading = S.heading; P.pitch = S.pitch; P.bank = S.bank;
  simIn.flap = Input.flap; simIn.steerX = Input.steerX; simIn.steerY = Input.steerY; simIn.brake = Input.brake;
  FLIGHT.stepBird(S, simIn, dt, env);
  simTime += dt;

  if (S.land === 'perched' && wasLand !== 'perched') { // touchdown: dust + a soft note
    AUD.chime();
    EFFECTS.puff(S.px, S.py - 0.2, S.pz, 0.2, 0.2);
  }
  wasLand = S.land;

  if (S.downstrokeTick !== lastTick) { // synced to the real downstroke start
    lastTick = S.downstrokeTick;
    AUD.whoosh(); // light flick per stroke -> blends into a sparrow flutter at 13 Hz
    if (S.beatsDone === 1) { // feather puff only on the first beat of each burst
      var fx = Math.sin(S.heading), fz = Math.cos(S.heading);
      EFFECTS.puff(S.px, S.py, S.pz, fx, fz);
    }
  }

  if (S.speed > 16 && !RM.on) { // dive -> wind streaks
    streakT -= dt;
    if (streakT <= 0) {
      streakT = 0.09;
      var cf = Math.sin(S.heading), sf = Math.cos(S.heading);
      EFFECTS.streaks(camera.position.x, camera.position.y, camera.position.z, cf, 0, sf, S.speed);
    }
  }
  if (S.inThermal) { // soar -> golden motes
    moteT -= dt;
    if (moteT <= 0) {
      moteT = 0.12;
      var th = nearestThermal(S.px, S.pz);
      if (th) EFFECTS.thermalMotes(th.x, th.z, th.r, th.top, S.py);
    }
  }
  ambientWind(dt); // wind you can SEE: streaks ride the living gust field
  if (EFFECTS.featherDue()) EFFECTS.shedFeather(S.px, S.py - 0.5, S.pz, S.windGX, S.windGZ);

  if (sceneName === 'fly') {
    // waypoint arrival
    if (nextWp < world.waypoints.length) {
      var wp = world.waypoints[nextWp];
      var dx = S.px - wp.x, dz = S.pz - wp.z;
      if (dx * dx + dz * dz < 45 * 45) {
        EFFECTS.waypointBurst(wp.x, wp.y, wp.z, world.wpRings[nextWp].quaternion);
        AUD.chime();
        nextWp++; world.nextWp = nextWp;
        if (nextWp >= world.waypoints.length) { show('complete'); return; }
      }
    }
    // riverside village -> distant church bells (once per pass)
    var vx = S.px - world.village.x, vz = S.pz - world.village.z;
    var vd2 = vx * vx + vz * vz;
    if (!bellRung && vd2 < world.village.r * world.village.r) { AUD.bells(); bellRung = true; }
    else if (bellRung && vd2 > world.village.r * world.village.r * 2.25) bellRung = false;
  }
}

// ambient wind streaks: what you see is what pushes you — streak velocity
// is the sim's actual advecting wind (base + gust) at the bird's position.
// Distinct from dive streaks: faint, slow, wind-following. RM kills them.
function ambientWind(dt) {
  if (RM.on) return;
  windT -= dt;
  if (windT <= 0) {
    windT = 0.13;
    var fx = Math.sin(S.heading), fz = Math.cos(S.heading);
    EFFECTS.windStreaks(camera.position.x, camera.position.y, camera.position.z,
      fx, fz, S.windGX, S.windGZ, S.gustAmt);
  }
}

function autoInput(t) { // title-screen autopilot: lazy evening circling
  return {
    flap: (S.speed < 9.5 && S.energy > 0.25) ? 1 : 0,
    steerX: -0.38 * Math.sin(t * 0.22),
    steerY: 0.10 * Math.sin(t * 0.4),
    brake: 0,
  };
}

/* ---------------- camera rig ---------------- */
var sideCam = false; // test hook: profile view of the wing rig
function updateCamera(dt, ist) {
  var fx = Math.sin(ist.heading), fz = Math.cos(ist.heading);
  if (sideCam) {
    var rx = -fz, rz = fx; // bird's right vector
    camera.position.set(ist.px + rx * 7.5, ist.py + 1.2, ist.pz + rz * 7.5);
    camera.lookAt(ist.px, ist.py + 0.3, ist.pz);
    camera.rotation.z = 0;
    return;
  }
  var kp = 1 - Math.exp(-5 * dt);
  if (ist.land === 'perched') { // rest framing: pulled back, bird-on-post against the sunset vista
    // (no rotation.z touch here: lookAt already levels the horizon, and
    // overwriting the euler after lookAt corrupts the orientation)
    // sun-relative anchor: camera sits anti-sunward so the sunset stays behind the bird,
    // with a slight lateral offset for a 3/4 angle (kept small so the sun stays in frame);
    // ~40% wider than the old framing
    var sd = world.sunDir, hl = Math.hypot(sd.x, sd.z) || 1;
    var shx = sd.x / hl, shz = sd.z / hl;
    var tx2 = ist.px - shx * 7.8 - shz * 1.2;
    var tz2 = ist.pz - shz * 7.8 + shx * 1.2;
    camera.position.x += (tx2 - camera.position.x) * kp;
    camera.position.y += ((ist.py + 2.2) - camera.position.y) * kp;
    camera.position.z += (tz2 - camera.position.z) * kp;
    camera.lookAt(ist.px, ist.py + 0.35, ist.pz);
    return;
  }
  camera.position.x += ((ist.px - fx * 10.5) - camera.position.x) * kp;
  camera.position.y += ((ist.py + 3.6) - camera.position.y) * kp;
  camera.position.z += ((ist.pz - fz * 10.5) - camera.position.z) * kp;
  camera.lookAt(ist.px + fx * 14, ist.py + Math.sin(ist.pitch) * 10 + 0.8, ist.pz + fz * 14);
  camera.rotation.z += ist.bank * 0.28; // roll with the bird
  var target = 62, kick = 0;
  if (!RM.on && (ist.speed > 16 || S.vy < -6)) kick = Math.min(1, (ist.speed - 16) / 10) * 12;
  target += kick;
  if (Math.abs(camera.fov - target) > 0.05) {
    camera.fov += (target - camera.fov) * Math.min(1, 3 * dt);
    camera.updateProjectionMatrix();
  }
}

/* ---------------- HUD (DOM; updated on change only — never per-frame fillText) ---------------- */
function updateHUD() {
  hudT -= 1 / 60;
  if (hudT > 0) return;
  hudT = 0.25;
  var txt;
  if (nextWp < world.waypoints.length) {
    var wp = world.waypoints[nextWp];
    var d = Math.round(Math.hypot(S.px - wp.x, S.pz - wp.z));
    txt = 'waypoint ' + (nextWp + 1) + ' of ' + world.waypoints.length + ' · ' + d + ' m';
  } else txt = 'the flock settles…';
  if (txt !== lastWpText) { $('wp').textContent = txt; lastWpText = txt; }
  var e = Math.round(S.energy * 50);
  if (e !== lastEnergy) { $('energyfill').style.width = (e * 2) + '%'; lastEnergy = e; }
}

/* ---------------- scenes: title / fly / pause / complete ---------------- */
var sceneName = 'none';
var Scenes = {
  title: {
    enter: function () {
      resetFlight();
      $('title-ui').classList.remove('hidden');
      $('hud').classList.add('hidden');
      $('pause-ui').classList.add('hidden');
      $('done-ui').classList.add('hidden');
    },
    exit: function () { $('title-ui').classList.add('hidden'); },
    update: function (dt) {
      var ai = autoInput(timeSec);
      simIn.flap = ai.flap; simIn.steerX = ai.steerX; simIn.steerY = ai.steerY; simIn.brake = 0;
      // reuse stepSim's machinery but keep title self-contained
      P.px = S.px; P.py = S.py; P.pz = S.pz; P.heading = S.heading; P.pitch = S.pitch; P.bank = S.bank;
      FLIGHT.stepBird(S, simIn, STEP, env);
      simTime += dt;
      ambientWind(dt); // title is already flying: wind is visible here too
      if (EFFECTS.featherDue()) EFFECTS.shedFeather(S.px, S.py - 0.5, S.pz, S.windGX, S.windGZ);
      world.nextWp = -1; // no glowing ring on the title screen
    },
  },
  fly: {
    enter: function () {
      // NOTE: enter does NOT reset — resume comes back to the same sky.
      // Fresh starts go through startFlyFresh() below.
      $('hud').classList.remove('hidden');
      $('pause-ui').classList.add('hidden');
      $('done-ui').classList.add('hidden');
    },
    exit: function () {},
    update: function (dt) { updateHUD(); perchUI(S.land === 'perched'); },
  },
  pause: {
    enter: function () { $('pause-ui').classList.remove('hidden'); },
    exit: function () { $('pause-ui').classList.add('hidden'); acc = 0; },
    update: function () {},
  },
  complete: {
    enter: function () {
      $('hud').classList.add('hidden');
      $('done-ui').classList.remove('hidden');
      var mins = Math.floor((timeSec - flyStart) / 60), secs = Math.floor((timeSec - flyStart) % 60);
      $('done-stats').textContent =
        Math.round(S.dist) + ' m flown · ' + mins + ':' + (secs < 10 ? '0' : '') + secs;
    },
    exit: function () { $('done-ui').classList.add('hidden'); $('hud').classList.add('hidden'); },
    update: function () {},
  },
};
function show(name) {
  if (Scenes[sceneName] && Scenes[sceneName].exit) Scenes[sceneName].exit();
  sceneName = name;
  perchUI(false); // the breather hint only lives in fly
  Scenes[name].enter();
}
// perched hint: "tap to take wing" — shown only while resting on the post
var perchUIon = false;
function perchUI(on) {
  if (on === perchUIon) return;
  perchUIon = on;
  $('perch-ui').classList.toggle('hidden', !on);
}
// fresh start: new bird at the head of the valley (title, restart, fly-again)
function startFlyFresh() {
  AUD.init(); AUD.resume();
  resetFlight();
  show('fly');
}
function togglePauseKey() {
  if (sceneName === 'fly') show('pause');
  else if (sceneName === 'pause') show('fly');
}

/* ---------------- main loop: fixed-step sim + render interpolation ---------------- */
var last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  var dtRaw = (now - last) / 1000; last = now;
  var dt = Math.min(dtRaw, 0.1); // clamp: tab-switch never spirals
  timeSec += dt;
  pollInput(dt);

  if (sceneName === 'fly') {
    acc += dt;
    var n = 0;
    while (acc >= STEP && n < 5) { stepSim(STEP); acc -= STEP; n++; }
    if (n === 5) acc = 0;
    Scenes.fly.update(dt);
  } else if (sceneName === 'title') {
    Scenes.title.update(dt);
    acc = 0;
  }

  // render interpolation between prev and current sim state
  var a = sceneName === 'fly' ? clamp(acc / STEP, 0, 1) : 1;
  R.px = P.px + (S.px - P.px) * a;
  R.py = P.py + (S.py - P.py) * a;
  R.pz = P.pz + (S.pz - P.pz) * a;
  R.heading = lerpAngle(P.heading, S.heading, a);
  R.pitch = P.pitch + (S.pitch - P.pitch) * a;
  R.bank = P.bank + (S.bank - P.bank) * a;
  R.speed = S.speed;
  // rig channels: copied raw (60 Hz sim rate is plenty; phase must never lerp)
  R.wingPhase = S.wingPhase; R.foldAmount = S.foldAmount; R.flapping = S.flapping;
  R.braking = S.braking; R.slotAmt = S.slotAmt; R.tailSpread = S.tailSpread;
  R.tailPitch = S.tailPitch; R.tailTwist = S.tailTwist; R.bodyPitchOsc = S.bodyPitchOsc;
  R.land = S.land; R.perchT = S.perchT; R.legs = S.legs; R.flare = S.flare;

  poseBird(R, timeSec);
  updateCamera(dt, R);
  // shadow rig follows the bird: light stays parked on the sun ray, target
  // rides the bird — the tight ortho box (world.js) keeps the map crisp.
  var sd = world.sunDir;
  world.sun.position.set(R.px + sd.x * 320, R.py + sd.y * 320, R.pz + sd.z * 320);
  world.sun.target.position.set(R.px, R.py, R.pz);
  world.sun.target.updateMatrixWorld();
  WORLD.update(world, THREE, dt, timeSec, routeProgressT());
  EFFECTS.update(dt, timeSec);
  AUD.update({ speed: S.speed, inThermal: !!S.inThermal });
  renderer.render(scene, camera);
}

function routeProgressT() {
  // approx: fraction of waypoints reached
  return clamp(nextWp / world.waypoints.length, 0, 1);
}

/* ---------------- UI wiring ---------------- */
$('take-wing').addEventListener('click', startFlyFresh);
$('pause-btn').addEventListener('click', function () { if (sceneName === 'fly') show('pause'); });
$('resume-btn').addEventListener('click', function () { AUD.resume(); show('fly'); });
$('restart-btn').addEventListener('click', startFlyFresh);
$('again-btn').addEventListener('click', startFlyFresh);
$('rm-toggle').addEventListener('change', function (e) {
  RM.on = e.target.checked;
  EFFECTS.setReduced(RM.on);
});
$('mute-toggle').addEventListener('change', function (e) { AUD.setMuted(e.target.checked); });
if (RM.on) $('rm-toggle').checked = true;

initInput(canvas);
show('title');
requestAnimationFrame(frame);

/* test hooks (per playbook: inspect state, not pixels) */
window.__bf = {
  get scene() { return sceneName; },
  get state() { return S; },
  altitude: function () { return S.py; },
  waypoint: function () { return nextWp; },
  debugFlap: function (sec) { Input.tapPulse = Math.max(Input.tapPulse, sec || 2); },
  steer: function (x, y) { Input.touchSteerX = x; Input.touchSteerY = y; },
  sideView: function () { sideCam = !sideCam; return sideCam ? 'side' : 'chase'; },
  // test only: drop the bird 100m short of waypoint i, aimed at it
  warp: function (i) {
    i = Math.max(0, Math.min(world.waypoints.length - 1, i));
    var wp = world.waypoints[i], pv = world.waypoints[Math.max(0, i - 1)];
    var dx = wp.x - pv.x, dz = wp.z - pv.z, dl = Math.hypot(dx, dz) || 1;
    S.px = wp.x - dx / dl * 100; S.py = wp.y + 4; S.pz = wp.z - dz / dl * 100;
    S.heading = Math.atan2(dx / dl, dz / dl);
    S.vx = Math.sin(S.heading) * 11; S.vz = Math.cos(S.heading) * 11; S.vy = 0;
    P.px = S.px; P.py = S.py; P.pz = S.pz; P.heading = S.heading;
    nextWp = i; world.nextWp = i;
    camera.position.set(S.px, S.py + 4, S.pz - 12);
    return 'warped to wp' + i;
  },
  // test only: place the bird on short final for the perch post, slow and aimed
  perch: function () {
    var pc = world.perch;
    S.px = pc.x; S.py = pc.y + 4; S.pz = pc.z - 20;
    S.heading = 0; // +z, straight at the post
    S.vx = 0; S.vy = -0.8; S.vz = 8;
    S.pitch = 0; S.bank = 0; S.land = 'air';
    // clean input slate: tapPulse runs on sim-time (dt-clamped), so a long
    // debugFlap from earlier can still be alive under low-FPS time dilation
    Input.tapPulse = 0; Input.touchFlap = 0;
    Input.touchSteerX = 0; Input.touchSteerY = 0;
    P.px = S.px; P.py = S.py; P.pz = S.pz; P.heading = 0;
    camera.position.set(S.px, S.py + 4, S.pz - 12);
    return 'perch approach';
  },
};

})();
