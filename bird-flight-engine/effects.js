'use strict';
/* effects.js — juice DESIGNED FROM THE BIRD'S VERBS (never a checklist):
 *
 *   flap    -> feather puff at the wingtips + wing-blur (engine spins wings fast)
 *   dive    -> wind streak lines rushing past the camera + FOV kick (engine)
 *   soar    -> golden motes spiraling up inside the thermal column + lift hum
 *   waypoint-> expanding light ring + soft chime (audio)
 *   (original touch) shed feather -> now and then a single loose feather
 *   slips off and tumbles past the camera, catching the sunset. Watch for it.
 *
 * One pooled THREE.Points system (zero per-frame allocation); one reusable
 * ring mesh; one feather mesh. Reduced-motion mode halves counts and kills
 * streaks/FOV-adjacent motion.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  else { root.EFFECTS = api; }
})(typeof self !== 'undefined' ? self : this, function () {

  var N = 360;
  var E = {
    scene: null, THREE: null,
    pos: null, col: null, size: null, alpha: null,
    px: null, py: null, pz: null, vx: null, vy: null, vz: null,
    life: null, maxLife: null, grav: null, drag: null, baseA: null,
    head: 0, geo: null, points: null,
    reduced: false,
    // waypoint ring burst (reused mesh)
    ring: null, ringT: 1e9,
    // the shed feather (reused mesh, at most one alive)
    feather: null, featherT: 1e9, featherVel: null, featherSpin: 0,
    featherTimer: 8,
  };

  function init(scene, THREE) {
    E.scene = scene; E.THREE = THREE;
    E.pos = new Float32Array(N * 3); E.col = new Float32Array(N * 3);
    E.size = new Float32Array(N); E.alpha = new Float32Array(N);
    E.px = new Float32Array(N); E.py = new Float32Array(N); E.pz = new Float32Array(N);
    E.vx = new Float32Array(N); E.vy = new Float32Array(N); E.vz = new Float32Array(N);
    E.life = new Float32Array(N); E.maxLife = new Float32Array(N);
    E.grav = new Float32Array(N); E.drag = new Float32Array(N); E.baseA = new Float32Array(N);
    E.life.fill(0);

    E.geo = new THREE.BufferGeometry();
    E.geo.setAttribute('position', new THREE.BufferAttribute(E.pos, 3));
    E.geo.setAttribute('aColor', new THREE.BufferAttribute(E.col, 3));
    E.geo.setAttribute('aSize', new THREE.BufferAttribute(E.size, 1));
    E.geo.setAttribute('aAlpha', new THREE.BufferAttribute(E.alpha, 1));
    var mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: [
        'attribute vec3 aColor; attribute float aSize; attribute float aAlpha;',
        'varying vec3 vC; varying float vA;',
        'void main(){ vC = aColor; vA = aAlpha;',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  gl_PointSize = aSize * (260.0 / max(1.0, -mv.z));',
        '  gl_Position = projectionMatrix * mv; }',
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vC; varying float vA;',
        'void main(){ vec2 uv = gl_PointCoord - 0.5; float d = length(uv);',
        '  if (d > 0.5) discard;',
        '  float soft = smoothstep(0.5, 0.1, d);',
        '  gl_FragColor = vec4(vC, vA * soft); }',
      ].join('\n'),
    });
    E.points = new THREE.Points(E.geo, mat);
    E.points.frustumCulled = false;
    scene.add(E.points);

    // waypoint ring burst
    E.ring = new THREE.Mesh(
      new THREE.TorusGeometry(6, 0.9, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0, depthWrite: false })
    );
    E.ring.visible = false;
    scene.add(E.ring);

    // the shed feather: small cream plane, double-sided
    var fg = new THREE.PlaneGeometry(0.55, 0.9);
    E.feather = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({
      color: 0xf5e7c8, side: THREE.DoubleSide, transparent: true, opacity: 0.95,
    }));
    E.feather.visible = false;
    E.featherVel = new THREE.Vector3();
    scene.add(E.feather);
  }

  function setReduced(b) { E.reduced = !!b; }

  function spawn(x, y, z, vx, vy, vz, life, size, r, g, b, alpha, grav, drag) {
    var i = E.head; E.head = (E.head + 1) % N;
    E.px[i] = x; E.py[i] = y; E.pz[i] = z;
    E.vx[i] = vx; E.vy[i] = vy; E.vz[i] = vz;
    E.life[i] = life; E.maxLife[i] = life;
    E.size[i] = size; E.baseA[i] = alpha;
    E.grav[i] = grav || 0; E.drag[i] = drag || 0;
    E.col[i * 3] = r; E.col[i * 3 + 1] = g; E.col[i * 3 + 2] = b;
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }

  // flap -> feather puff at wingtips
  function puff(x, y, z, dirx, dirz) {
    var n = E.reduced ? 3 : 7;
    for (var k = 0; k < n; k++) {
      var side = k % 2 ? 1 : -1;
      spawn(
        x + rnd(-0.7, 0.7), y + rnd(-0.2, 0.3), z + rnd(-0.7, 0.7),
        dirx * rnd(1, 3) - dirz * side * rnd(1, 2.5), rnd(0.5, 2), dirz * rnd(1, 3) + dirx * side * rnd(1, 2.5),
        rnd(0.5, 0.9), rnd(2.5, 4.5),
        0.96, 0.90, 0.78, 0.7, -1.5, 1.2
      );
    }
  }

  // dive -> wind streaks rushing past (spawned ahead, thrown backward)
  function streaks(cx, cy, cz, fx, fy, fz, speed) {
    if (E.reduced) return;
    var n = speed > 20 ? 4 : 2;
    for (var k = 0; k < n; k++) {
      var ox = rnd(-9, 9), oy = rnd(-6, 6), oz = rnd(-9, 9);
      // ahead of camera along flight dir
      var sx = cx + fx * rnd(14, 26) + ox, sy = cy + fy * rnd(14, 26) + oy, sz = cz + fz * rnd(14, 26) + oz;
      spawn(sx, sy, sz, -fx * speed * 1.6, -fy * speed * 1.6, -fz * speed * 1.6,
        rnd(0.35, 0.6), rnd(1.6, 2.6), 1, 0.97, 0.9, 0.55, 0, 0);
    }
  }

  // soar -> golden motes spiraling up in the column
  function thermalMotes(tx, tz, r, top, y) {
    var n = E.reduced ? 1 : 3;
    for (var k = 0; k < n; k++) {
      var a = rnd(0, 6.283), rr = rnd(2, r * 0.9);
      spawn(tx + Math.cos(a) * rr, y + rnd(-4, 4), tz + Math.sin(a) * rr,
        -Math.sin(a) * 1.5, rnd(3, 5.5), Math.cos(a) * 1.5,
        rnd(1.6, 2.6), rnd(2, 3.6), 1.0, 0.82, 0.5, 0.5, 0, 0.2);
    }
  }

  // waypoint -> expanding light ring burst + gold sparks
  // quat: orientation to borrow (the waypoint ring's), so the flash sits in its plane
  function waypointBurst(x, y, z, quat) {
    E.ring.position.set(x, y, z);
    if (quat) E.ring.quaternion.copy(quat);
    E.ringT = 0;
    E.ring.visible = true;
    var n = E.reduced ? 10 : 26;
    for (var k = 0; k < n; k++) {
      var a = rnd(0, 6.283), e = rnd(-0.5, 0.5);
      var sp = rnd(6, 14);
      spawn(x, y, z, Math.cos(a) * sp, e * sp, Math.sin(a) * sp,
        rnd(0.7, 1.2), rnd(2.5, 4), 1.0, 0.85, 0.55, 0.8, 0, 1.6);
    }
  }

  // original touch: shed a single feather that tumbles past the camera
  function shedFeather(x, y, z, windX, windZ) {
    if (E.featherT < 6) return; // at most one every ~6s of life
    E.featherT = 0;
    E.feather.visible = true;
    E.feather.position.set(x, y, z);
    E.featherVel.set(windX + rnd(-1, 1), rnd(-0.5, 0.5), windZ + rnd(-1, 1));
    E.featherSpin = rnd(2, 5);
    E.featherTimer = rnd(9, 20); // next shed in 9-20s
  }

  function update(dt, time) {
    // particles
    for (var i = 0; i < N; i++) {
      if (E.life[i] <= 0) { E.alpha[i] = 0; continue; }
      E.life[i] -= dt;
      var t = Math.max(0, E.life[i] / E.maxLife[i]);
      var dr = 1 - Math.min(1, E.drag[i] * dt);
      E.vx[i] *= dr; E.vz[i] *= dr;
      E.vy[i] = E.vy[i] * dr + E.grav[i] * dt;
      E.px[i] += E.vx[i] * dt; E.py[i] += E.vy[i] * dt; E.pz[i] += E.vz[i] * dt;
      E.pos[i * 3] = E.px[i]; E.pos[i * 3 + 1] = E.py[i]; E.pos[i * 3 + 2] = E.pz[i];
      E.alpha[i] = E.baseA[i] * t;
    }
    E.geo.attributes.position.needsUpdate = true;
    E.geo.attributes.aAlpha.needsUpdate = true;
    E.geo.attributes.aColor.needsUpdate = true;
    E.geo.attributes.aSize.needsUpdate = true;

    // waypoint ring burst
    if (E.ringT < 1.2) {
      E.ringT += dt;
      var rt = E.ringT / 1.2;
      var rs = 1 + rt * 4.5;
      E.ring.scale.set(rs, rs, rs);
      E.ring.material.opacity = 0.85 * (1 - rt);
      if (E.ringT >= 1.2) E.ring.visible = false;
    }

    // shed feather tumble
    if (E.feather.visible) {
      E.featherT += dt;
      E.featherVel.y += Math.sin(time * 7) * 2.2 * dt - 0.35 * dt; // flutter, gentle sink
      E.featherVel.multiplyScalar(1 - Math.min(1, 0.4 * dt));
      E.feather.position.addScaledVector(E.featherVel, dt);
      E.feather.rotation.x += E.featherSpin * dt;
      E.feather.rotation.z += E.featherSpin * 0.7 * dt;
      E.feather.material.opacity = Math.max(0, 0.95 - Math.max(0, E.featherT - 4) * 0.4);
      if (E.featherT > 6.5) E.feather.visible = false;
    } else {
      E.featherTimer -= dt;
    }
  }

  function featherDue() { return !E.feather.visible && E.featherTimer <= 0; }

  return {
    init: init, setReduced: setReduced, update: update,
    puff: puff, streaks: streaks, thermalMotes: thermalMotes,
    waypointBurst: waypointBurst, shedFeather: shedFeather, featherDue: featherDue,
  };
});
