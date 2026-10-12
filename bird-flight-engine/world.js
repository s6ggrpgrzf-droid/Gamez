'use strict';
/* world.js — golden-hour valley: procedural terrain, sky, thermals, migration
 * route, distant flock, riverside village. All randomness seeded (mulberry32
 * from flight.js). Exposes groundH(x,z) used by the flight sim.
 *
 * Route: 6 waypoints winding ~1.7km down the valley toward the sunset.
 * Thermals sit near waypoints so the skilled line is flap-glide-soar.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  else { root.WORLD = api; }
})(typeof self !== 'undefined' ? self : this, function () {

  function hash2(ix, iz) {
    var n = (ix * 374761393 + iz * 668265263) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n = n ^ (n >>> 16);
    return (n >>> 0) / 4294967296;
  }
  function vnoise(x, z) {
    var ix = Math.floor(x), iz = Math.floor(z);
    var fx = x - ix, fz = z - iz;
    var sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
    var a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
    return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
  }
  function fbm(x, z) {
    return vnoise(x, z) * 0.55 + vnoise(x * 2.13 + 7.3, z * 2.13 + 3.1) * 0.28 +
           vnoise(x * 4.41 + 13.7, z * 4.41 + 9.2) * 0.17;
  }
  function riverX(z) { return 260 * Math.sin(z * 0.004) + 120 * Math.sin(z * 0.0013 + 2.0); }

  var WATER_Y = -5;

  function heightAt(x, z) {
    var h = (fbm(x * 0.004, z * 0.004) - 0.5) * 76 + (fbm(x * 0.021 + 5, z * 0.021) - 0.5) * 10;
    var rd = Math.abs(x - riverX(z));
    if (rd < 60) { var t = 1 - rd / 60; t = t * t * (3 - 2 * t); h -= 15 * t; }
    // gentle bowl near spawn so takeoff is forgiving
    var sd = Math.sqrt(x * x + z * z);
    if (sd < 150) h = h * (sd / 150) + 2 * (1 - sd / 150);
    return h;
  }

  // field patchwork palette (golden hour wheat country)
  var FIELDS = [
    [0.80, 0.63, 0.30], // wheat gold
    [0.72, 0.55, 0.26], // ripe barley
    [0.46, 0.55, 0.26], // pasture
    [0.55, 0.58, 0.30], // meadow
    [0.45, 0.33, 0.20], // plowed
    [0.62, 0.50, 0.24], // stubble
  ];

  function groundColor(x, z, h, out) {
    var rd = Math.abs(x - riverX(z));
    if (h < WATER_Y + 0.6) { out[0] = 0.30; out[1] = 0.44; out[2] = 0.55; return; } // river
    if (rd < 26) { out[0] = 0.72; out[1] = 0.60; out[2] = 0.42; return; } // sandy bank
    var forest = fbm(x * 0.008 + 40, z * 0.008 + 9);
    if (forest > 0.60 && h > WATER_Y + 2) {
      var d = 0.85 + hash2(Math.floor(x / 7), Math.floor(z / 7)) * 0.3;
      out[0] = 0.15 * d; out[1] = 0.29 * d; out[2] = 0.13 * d; return; // treeline
    }
    var fi = Math.floor(hash2(Math.floor(x / 95), Math.floor(z / 95)) * FIELDS.length) % FIELDS.length;
    var f = FIELDS[fi];
    var v = 0.92 + hash2(Math.floor(x / 11), Math.floor(z / 11)) * 0.16;
    var dry = Math.min(1, Math.max(0, (h - 4) / 30)) * 0.12; // high ground drier
    out[0] = Math.min(1, f[0] * v + dry);
    out[1] = Math.min(1, f[1] * v + dry * 0.6);
    out[2] = Math.min(1, f[2] * v);
  }

  function build(scene, THREE, seed) {
    var rng = FLIGHT.mulberry32(seed || 20261012);
    var W = {
      thermals: [], waypoints: [], curve: null,
      village: { x: 0, z: 0, r: 130 },
      flock: [], clouds: null, wpRings: [], thermalRings: [],
      time: 0,
    };

    /* ---------- lights & fog ---------- */
    var sunDir = new THREE.Vector3(-0.45, 0.20, 0.87).normalize();
    var sun = new THREE.DirectionalLight(0xffb066, 1.5);
    sun.position.copy(sunDir).multiplyScalar(900);
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xffd9a6, 0x6b4a2f, 0.85));
    scene.fog = new THREE.Fog(0xe8a268, 160, 1750);

    /* ---------- sky dome ---------- */
    var skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sunDir: { value: sunDir } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; ' +
        'gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'varying vec3 vDir; uniform vec3 sunDir;',
        'void main(){',
        '  vec3 d = normalize(vDir);',
        '  float h = clamp(d.y, -0.08, 1.0);',
        '  vec3 zen = vec3(0.20, 0.32, 0.48);',
        '  vec3 mid = vec3(0.83, 0.52, 0.32);',
        '  vec3 hor = vec3(1.00, 0.76, 0.47);',
        '  vec3 col = mix(hor, mid, smoothstep(0.0, 0.22, h));',
        '  col = mix(col, zen, smoothstep(0.18, 0.75, h));',
        '  float s = max(dot(d, sunDir), 0.0);',
        '  col += vec3(1.0, 0.75, 0.45) * pow(s, 350.0) * 1.6;',  // disc
        '  col += vec3(1.0, 0.60, 0.30) * pow(s, 18.0) * 0.45;',   // glow
        '  col += vec3(0.95, 0.45, 0.25) * pow(1.0 - abs(d.y), 6.0) * 0.35;', // haze band
        '  gl_FragColor = vec4(col, 1.0);',
        '}',
      ].join('\n'),
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(3200, 24, 16), skyMat));

    /* ---------- terrain ---------- */
    var SIZE = 2800, SEG = 96;
    var tg = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    tg.rotateX(-Math.PI / 2);
    var pos = tg.attributes.position;
    var colors = new Float32Array(pos.count * 3);
    var c = [0, 0, 0];
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), z = pos.getZ(i);
      var h = heightAt(x, z);
      pos.setY(i, h);
      groundColor(x, z, h, c);
      colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
    }
    tg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    tg.computeVertexNormals();
    scene.add(new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true })));

    /* ---------- trees (instanced, 2 draw calls) ---------- */
    var NT = 520;
    var trunkG = new THREE.CylinderGeometry(0.35, 0.5, 3.2, 5);
    var canG = new THREE.ConeGeometry(2.6, 7.5, 6);
    var trunkM = new THREE.MeshLambertMaterial({ color: 0x5a4028 });
    var canM = new THREE.MeshLambertMaterial({ color: 0x274a20 });
    var trunks = new THREE.InstancedMesh(trunkG, trunkM, NT);
    var cans = new THREE.InstancedMesh(canG, canM, NT);
    var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    var placed = 0, guard = 0;
    while (placed < NT && guard++ < 8000) {
      var tx = (rng() * 2 - 1) * 1300, tz = (rng() * 2 - 1) * 1300;
      var th = heightAt(tx, tz);
      if (th < WATER_Y + 2) continue;
      if (fbm(tx * 0.008 + 40, tz * 0.008 + 9) < 0.60) continue;
      if (Math.abs(tx - riverX(tz)) < 30) continue;
      var s = 0.7 + rng() * 0.9;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
      pv.set(tx, th + 1.4 * s, tz); sv.set(s, s, s);
      m4.compose(pv, q, sv); trunks.setMatrixAt(placed, m4);
      pv.set(tx, th + (3.0 + 3.4) * s, tz);
      m4.compose(pv, q, sv); cans.setMatrixAt(placed, m4);
      placed++;
    }
    trunks.count = placed; cans.count = placed;
    trunks.instanceMatrix.needsUpdate = true; cans.instanceMatrix.needsUpdate = true;
    scene.add(trunks); scene.add(cans);

    /* ---------- clouds (1 instanced draw call) ---------- */
    var NC = 42;
    var clG = new THREE.IcosahedronGeometry(26, 0);
    var clM = new THREE.MeshLambertMaterial({ color: 0xffe8c8, transparent: true, opacity: 0.72, flatShading: true });
    var clouds = new THREE.InstancedMesh(clG, clM, NC);
    var cloudData = [];
    for (var ci = 0; ci < NC; ci++) {
      var cx = (rng() * 2 - 1) * 1700, cz = (rng() * 2 - 1) * 1700, cy = 300 + rng() * 220;
      // keep the start corridor clear so the first seconds read clean
      if (Math.abs(cx) < 220 && cz > -300 && cz < 500) cx += cx < 0 ? -320 : 320;
      cloudData.push({ x: cx, y: cy, z: cz, vx: 1.5 + rng() * 1.5, s: 0.45 + rng() * 0.85 });
    }
    W.clouds = clouds; W.cloudData = cloudData;
    scene.add(clouds);

    /* ---------- riverside village (instanced: bodies, roofs, windows) ---------- */
    var vz = 620, vx = riverX(vz) + 95;
    W.village.x = vx; W.village.z = vz;
    var NH = 8;
    var bodyG = new THREE.BoxGeometry(7, 4.5, 6);
    var roofG = new THREE.ConeGeometry(5.4, 3.2, 4);
    var winG = new THREE.PlaneGeometry(1.1, 1.4);
    var bodies = new THREE.InstancedMesh(bodyG, new THREE.MeshLambertMaterial({ color: 0xd9b98c }), NH);
    var roofs = new THREE.InstancedMesh(roofG, new THREE.MeshLambertMaterial({ color: 0x7a4a30 }), NH);
    var wins = new THREE.InstancedMesh(winG, new THREE.MeshBasicMaterial({ color: 0xffd98a }), NH * 2);
    var up = new THREE.Vector3(0, 1, 0);
    for (var hi = 0; hi < NH; hi++) {
      var hx = vx + (rng() * 2 - 1) * 55, hz = vz + (rng() * 2 - 1) * 55;
      var hh = heightAt(hx, hz), rot = rng() * Math.PI;
      q.setFromAxisAngle(up, rot);
      pv.set(hx, hh + 2.2, hz); sv.set(1, 1, 1); m4.compose(pv, q, sv);
      bodies.setMatrixAt(hi, m4);
      var rq = new THREE.Quaternion().setFromAxisAngle(up, rot + Math.PI / 4);
      pv.set(hx, hh + 4.5 + 1.6, hz); m4.compose(pv, rq, sv);
      roofs.setMatrixAt(hi, m4);
      // two warm windows facing the river
      var wa = Math.atan2(riverX(hz) - hx, 0) ; // face river-ish
      var wq = new THREE.Quaternion().setFromAxisAngle(up, hx > riverX(hz) ? -Math.PI / 2 : Math.PI / 2);
      pv.set(hx + (hx > riverX(hz) ? -3.55 : 3.55), hh + 2.4, hz - 1.4); m4.compose(pv, wq, sv);
      wins.setMatrixAt(hi * 2, m4);
      pv.set(hx + (hx > riverX(hz) ? -3.55 : 3.55), hh + 2.4, hz + 1.4); m4.compose(pv, wq, sv);
      wins.setMatrixAt(hi * 2 + 1, m4);
    }
    bodies.instanceMatrix.needsUpdate = true; roofs.instanceMatrix.needsUpdate = true; wins.instanceMatrix.needsUpdate = true;
    scene.add(bodies); scene.add(roofs); scene.add(wins);
    // church: taller hall + steeple
    var chX = vx + 20, chZ = vz - 40, chH = heightAt(chX, chZ);
    var church = new THREE.Group();
    var hall = new THREE.Mesh(new THREE.BoxGeometry(8, 9, 12), new THREE.MeshLambertMaterial({ color: 0xe2cba0 }));
    hall.position.y = 4.5; church.add(hall);
    var steeple = new THREE.Mesh(new THREE.ConeGeometry(3.4, 9, 4), new THREE.MeshLambertMaterial({ color: 0x6b4a34 }));
    steeple.position.y = 13.5; steeple.rotation.y = Math.PI / 4; church.add(steeple);
    var glow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.2), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
    glow.position.set(0, 4.5, 6.05); church.add(glow);
    church.position.set(chX, chH, chZ);
    scene.add(church);

    /* ---------- migration route ---------- */
    var wp = [
      [0, 58, 0],
      [230, 62, 300], [-190, 72, 590], [210, 66, 880],
      [-140, 78, 1080], [60, 62, 1260],
    ];
    // deterministic jitter keeps it organic but inside the valley
    for (var wi = 1; wi < wp.length; wi++) {
      wp[wi][0] += (rng() * 2 - 1) * 40;
      wp[wi][1] += (rng() * 2 - 1) * 8;
    }
    W.waypoints = wp.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); });
    W.curve = new THREE.CatmullRomCurve3(W.waypoints);

    // golden mote trail along the route (one Points draw call)
    var NPTS = 240, tpos = new Float32Array(NPTS * 3);
    for (var pi = 0; pi < NPTS; pi++) {
      var pt = W.curve.getPoint(pi / (NPTS - 1));
      tpos[pi * 3] = pt.x; tpos[pi * 3 + 1] = pt.y; tpos[pi * 3 + 2] = pt.z;
    }
    var trailG = new THREE.BufferGeometry();
    trailG.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
    var trail = new THREE.Points(trailG, new THREE.PointsMaterial({
      color: 0xffd98a, size: 2.6, sizeAttenuation: true,
      transparent: true, opacity: 0.55, depthWrite: false,
    }));
    scene.add(trail);

    // waypoint rings
    for (var ri = 0; ri < W.waypoints.length; ri++) {
      var ring = new THREE.Mesh(
        new THREE.TorusGeometry(20, 1.0, 8, 40),
        new THREE.MeshBasicMaterial({ color: 0xffc86e, transparent: true, opacity: 0.0, depthWrite: false })
      );
      ring.position.copy(W.waypoints[ri]);
      // face the hole toward the next waypoint so the bird flies through it
      var nxt = W.waypoints[Math.min(ri + 1, W.waypoints.length - 1)];
      ring.lookAt(nxt);
      scene.add(ring);
      W.wpRings.push(ring);
    }

    /* ---------- thermals (near waypoints 1..5) ---------- */
    var tdefs = [];
    for (var ti2 = 1; ti2 <= 5; ti2++) {
      var wpt = W.waypoints[ti2];
      tdefs.push({
        x: wpt.x + (rng() * 2 - 1) * 60, z: wpt.z + (rng() * 2 - 1) * 60,
        r: 30 + rng() * 8, top: 190, lift: 3.2 + rng() * 0.8,
      });
    }
    W.thermals = tdefs;
    tdefs.forEach(function (t) {
      var cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(t.r, t.r * 1.25, t.top, 18, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xffe2b0, transparent: true, opacity: 0.022,
          side: THREE.DoubleSide, depthWrite: false,
        })
      );
      cyl.position.set(t.x, t.top / 2, t.z);
      scene.add(cyl);
      var gring = new THREE.Mesh(
        new THREE.RingGeometry(t.r * 0.85, t.r, 32),
        new THREE.MeshBasicMaterial({
          color: 0xffd9a0, transparent: true, opacity: 0.35,
          side: THREE.DoubleSide, depthWrite: false,
        })
      );
      gring.rotation.x = -Math.PI / 2;
      gring.position.set(t.x, heightAt(t.x, t.z) + 1.5, t.z);
      scene.add(gring);
      W.thermalRings.push(gring);
    });

    /* ---------- distant flock (ahead on the route) ---------- */
    var flockMat = new THREE.MeshBasicMaterial({ color: 0x2e2118 });
    for (var fi2 = 0; fi2 < 6; fi2++) {
      var b = new THREE.Group();
      var bd = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.6, 5), flockMat);
      bd.rotation.x = Math.PI / 2; b.add(bd);
      var wgl = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.1), flockMat);
      wgl.position.x = -1.7; b.add(wgl);
      var wgr = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.1), flockMat);
      wgr.position.x = 1.7; b.add(wgr);
      b.userData = { off: 0.03 + fi2 * 0.016, ph: rng() * 6.28, wl: wgl, wr: wgr, lat: (rng() * 2 - 1) * 26, v: (rng() * 2 - 1) * 8 };
      scene.add(b);
      W.flock.push(b);
    }

    W.groundH = heightAt;
    return W;
  }

  function update(world, THREE, dt, time, routeT) {
    world.time = time;
    // waypoint rings: only the next one glows/pulses (engine sets world.nextWp)
    for (var i = 0; i < world.wpRings.length; i++) {
      var ring = world.wpRings[i], m = ring.material;
      if (i === world.nextWp) {
        m.opacity = 0.34 + Math.sin(time * 3.2) * 0.14;
        var s = 1 + Math.sin(time * 3.2) * 0.06;
        ring.scale.set(s, s, s);
      } else if (i < world.nextWp) { m.opacity = 0.10; ring.scale.set(1, 1, 1); }
      else { m.opacity = 0.0; }
    }
    // thermal ground rings breathe
    for (var j = 0; j < world.thermalRings.length; j++) {
      var gr = world.thermalRings[j];
      gr.material.opacity = 0.28 + Math.sin(time * 2.1 + j * 1.7) * 0.12;
    }
    // flock rides ahead of the player on the route
    for (var f = 0; f < world.flock.length; f++) {
      var b = world.flock[f], u = b.userData;
      var t = (routeT + u.off) % 1;
      var p = world.curve.getPoint(t);
      var p2 = world.curve.getPoint(Math.min(1, t + 0.004));
      b.position.set(p.x + u.lat * Math.sin(time * 0.7 + u.ph), p.y + u.v + Math.sin(time * 1.3 + u.ph) * 3, p.z);
      b.lookAt(p2.x, b.position.y, p2.z);
      var flap = Math.sin(time * 9 + u.ph) * 0.65;
      u.wl.rotation.y = flap; u.wr.rotation.y = -flap;
    }
    // clouds drift
    var m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), vv = new THREE.Vector3(), ss = new THREE.Vector3();
    for (var c2 = 0; c2 < world.cloudData.length; c2++) {
      var cd = world.cloudData[c2];
      cd.x += cd.vx * dt;
      if (cd.x > 1600) cd.x = -1600;
      vv.set(cd.x, cd.y, cd.z); ss.set(cd.s * 2.2, cd.s * 0.75, cd.s * 1.4);
      m4.compose(vv, q0, ss);
      world.clouds.setMatrixAt(c2, m4);
    }
    world.clouds.instanceMatrix.needsUpdate = true;
  }

  return { build: build, update: update, heightAt: heightAt, riverX: riverX };
});
