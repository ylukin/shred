// Builds the visible world around the track: terrain, trail ribbon, forest,
// rocks, lake, distant ranges, sky, trackside race furniture.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, mulberry32, makeNoise2D } from './util.js';
import { SECTION } from './track.js';
import * as TEX from './textures.js';

export function buildWorld(scene, track) {
  const world = { updatables: [] };
  const rand = mulberry32(4242);
  const noise = makeNoise2D(9001);

  // ---- reference points --------------------------------------------------
  const samples = track.samples;
  const last = samples[samples.length - 1];
  const first = samples[0];
  const lakeCenter = last.pos.clone().addScaledVector(last.dir, 150);
  lakeCenter.y = last.pos.y - 26;

  // ---- terrain heightfield -----------------------------------------------
  // IDW through track points (+ phantom lake points) => natural mountainside
  // that always meets the trail. Cached on a grid for cheap lookups.
  const idwPts = [];
  for (let i = 0; i < samples.length; i += 10) idwPts.push(samples[i].pos);
  for (let a = 0; a < 10; a++) {
    const ang = (a / 10) * Math.PI * 2;
    idwPts.push(new THREE.Vector3(lakeCenter.x + Math.cos(ang) * 60, lakeCenter.y, lakeCenter.z + Math.sin(ang) * 60));
  }
  // phantom high point behind the start => peak above you
  idwPts.push(new THREE.Vector3(first.pos.x - first.dir.x * 120, first.pos.y + 55, first.pos.z - first.dir.z * 120));

  const bbox = new THREE.Box3();
  samples.forEach((sm) => bbox.expandByPoint(sm.pos));
  bbox.expandByPoint(lakeCenter);
  const center = bbox.getCenter(new THREE.Vector3());
  const span = Math.max(bbox.max.x - bbox.min.x, bbox.max.z - bbox.min.z);
  const TSIZE = Math.max(1100, span + 700);

  function idwHeight(x, z) {
    let num = 0, den = 0;
    for (let i = 0; i < idwPts.length; i++) {
      const p = idwPts[i];
      const dx = x - p.x, dz = z - p.z;
      const d2 = dx * dx + dz * dz + 40;
      const w = 1 / (d2 * Math.sqrt(d2 + 1)); // ~1/d^3: local features stay local
      num += w * p.y; den += w;
    }
    return num / den;
  }
  function nearestTrackDist(x, z) {
    let best = Infinity, bi = 0;
    for (let i = 0; i < samples.length; i += 4) {
      const p = samples[i].pos;
      const dx = x - p.x, dz = z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; bi = i; }
    }
    return { d: Math.sqrt(best), i: bi };
  }
  const ridgeSamples = samples.filter((sm, i) => sm.type === SECTION.RIDGE && i % 4 === 0);
  function ridgeDist(x, z) {
    let best = Infinity, bi = 0;
    for (let i = 0; i < ridgeSamples.length; i++) {
      const p = ridgeSamples[i].pos;
      const d2 = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d2 < best) { best = d2; bi = i; }
    }
    return { d: Math.sqrt(best), y: ridgeSamples[bi]?.pos.y ?? 0 };
  }
  function terrainHeight(x, z) {
    const { d, i } = nearestTrackDist(x, z);
    const base = idwHeight(x, z);
    const ridge = (noise.fbm(x * 0.008, z * 0.008, 4) - 0.5) * 2;
    const detail = (noise.fbm(x * 0.05, z * 0.05, 3) - 0.5) * 2;
    const away = smoothstep(8, 90, d);
    let h = base + ridge * 34 * away + detail * 2.6 * smoothstep(3, 14, d);
    // exposed spine: ground falls away on both sides of the ridge section
    const rd = ridgeDist(x, z);
    if (rd.d < 44) {
      const spine = rd.y + 0.1 - Math.max(0, rd.d - 2.2) * 0.85;
      h = lerp(Math.min(h, spine), h, smoothstep(28, 44, rd.d));
    }
    // carve flat under the trail (always wins right at the track);
    // narrow bench on the exposed ridge so it stays scary
    const trackY = samples[i].pos.y;
    const isRidge = samples[i].type === SECTION.RIDGE;
    h = isRidge ? lerp(trackY - 0.35, h, smoothstep(2.2, 5, d))
                : lerp(trackY - 0.35, h, smoothstep(3.5, 16, d));
    // dip toward the lake basin
    const ld = Math.hypot(x - lakeCenter.x, z - lakeCenter.z);
    if (ld < 220) h = lerp(lakeCenter.y - 2, h, smoothstep(70, 220, ld));
    return h;
  }

  const GRID = 128;
  const heights = new Float32Array((GRID + 1) * (GRID + 1));
  const cell = TSIZE / GRID;
  for (let iz = 0; iz <= GRID; iz++) {
    for (let ix = 0; ix <= GRID; ix++) {
      const x = center.x - TSIZE / 2 + ix * cell;
      const z = center.z - TSIZE / 2 + iz * cell;
      heights[iz * (GRID + 1) + ix] = terrainHeight(x, z);
    }
  }
  world.groundY = (x, z) => {
    const fx = clamp((x - (center.x - TSIZE / 2)) / cell, 0, GRID - 0.001);
    const fz = clamp((z - (center.z - TSIZE / 2)) / cell, 0, GRID - 0.001);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const i0 = iz * (GRID + 1) + ix;
    const h00 = heights[i0], h10 = heights[i0 + 1];
    const h01 = heights[i0 + GRID + 1], h11 = heights[i0 + GRID + 2];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  };

  // terrain mesh
  {
    const geo = new THREE.PlaneGeometry(TSIZE, TSIZE, GRID, GRID);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + center.x, z = pos.getZ(i) + center.z;
      pos.setY(i, world.groundY(x, z));
    }
    geo.translate(center.x, 0, center.z);
    geo.computeVertexNormals();
    const grassTex = TEX.makeGrass();
    grassTex.repeat.set(90, 90);
    const mat = new THREE.MeshLambertMaterial({ map: grassTex, color: 0xbccf9f });
    grassTex.userData.swapTargets?.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // ---- trail ribbon ------------------------------------------------------
  {
    const ACROSS = 8; // verts across
    const verts = [], uvs = [], idx = [];
    const tmp = new THREE.Vector3();
    for (let i = 0; i < samples.length; i++) {
      const sm = samples[i];
      const w = sm.width + 1.1; // small shoulder
      for (let j = 0; j <= ACROSS; j++) {
        const xr = -w + (2 * w * j) / ACROSS;
        const surf = track.surface(sm.s, xr);
        tmp.copy(sm.pos).addScaledVector(sm.right, xr);
        let y = surf.y + 0.03;
        // drop the shoulders slightly to tuck into terrain
        const sh = smoothstep(sm.width * 0.92, w, Math.abs(xr));
        y -= sh * 0.5;
        verts.push(tmp.x, y, tmp.z);
        uvs.push(j / ACROSS, sm.s / 6);
      }
    }
    const stride = ACROSS + 1;
    for (let i = 0; i < samples.length - 1; i++) {
      for (let j = 0; j < ACROSS; j++) {
        const a = i * stride + j, b = a + 1, c = a + stride, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const dirtTex = TEX.makeDirt();
    dirtTex.repeat.set(1, 1);
    const mat = new THREE.MeshLambertMaterial({ map: dirtTex });
    dirtTex.userData.swapTargets?.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // ---- rock garden stones (visual) --------------------------------------
  {
    const rockTex = TEX.makeRock();
    rockTex.repeat.set(1.5, 1.5);
    const mat = new THREE.MeshLambertMaterial({ map: rockTex });
    rockTex.userData.swapTargets?.push(mat);
    const geo = new THREE.IcosahedronGeometry(0.5, 0);
    const inst = new THREE.InstancedMesh(geo, mat, 260);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    let n = 0;
    const s0 = track.segStarts[7], s1 = s0 + 70;
    for (let i = 0; i < 900 && n < 200; i++) {
      const s = s0 + rand() * (s1 - s0);
      const x = (rand() * 2 - 1) * 4.0;
      if (Math.abs(x - track.rockLine(s)) < 1.0) continue; // keep the clean line clean
      track.worldPos(s, x, p);
      p.y += 0.05;
      q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3));
      const k = 0.35 + rand() * 0.55;
      sc.set(k * (0.8 + rand() * 0.6), k * 0.7, k * (0.8 + rand() * 0.6));
      m.compose(p, q, sc);
      inst.setMatrixAt(n++, m);
    }
    // scatter boulders around the map too
    for (let i = 0; n < 260 && i < 500; i++) {
      const sm = samples[(rand() * samples.length) | 0];
      const off = 10 + rand() * 120;
      const side = rand() < 0.5 ? -1 : 1;
      p.copy(sm.pos).addScaledVector(sm.right, side * off);
      p.y = world.groundY(p.x, p.z) + 0.2;
      q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3));
      const k = 0.8 + rand() * 2.4;
      sc.set(k, k * 0.75, k);
      m.compose(p, q, sc);
      inst.setMatrixAt(n++, m);
    }
    inst.count = n;
    inst.castShadow = true;
    scene.add(inst);
  }

  // ---- forest ------------------------------------------------------------
  {
    const N = 750;
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.6, 5);
    trunkGeo.translate(0, 1.3, 0);
    const cone1 = new THREE.ConeGeometry(2.3, 5.2, 7);
    cone1.translate(0, 4.4, 0);
    const cone2 = new THREE.ConeGeometry(1.5, 4.2, 7);
    cone2.translate(0, 7.4, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5b4432 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2c5934 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N);
    const lower = new THREE.InstancedMesh(cone1, leafMat, N);
    const upper = new THREE.InstancedMesh(cone2, leafMat, N);
    lower.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    upper.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    let n = 0;
    for (let i = 0; i < N * 6 && n < N; i++) {
      const x = center.x + (rand() * 2 - 1) * TSIZE * 0.48;
      const z = center.z + (rand() * 2 - 1) * TSIZE * 0.48;
      const { d } = nearestTrackDist(x, z);
      if (d < 7.5) continue;                       // keep the trail corridor open
      const ld = Math.hypot(x - lakeCenter.x, z - lakeCenter.z);
      if (ld < 95) continue;                       // not in the lake
      const y = world.groundY(x, z);
      if (y < lakeCenter.y + 1) continue;
      const dense = noise.fbm(x * 0.01, z * 0.01, 3);
      if (rand() > dense * 1.25) continue;         // clump into groves
      const k = 0.7 + rand() * (d < 20 ? 0.5 : 0.9);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
      sc.set(k, k * (0.85 + rand() * 0.4), k);
      p.set(x, y - 0.15, z);
      m.compose(p, q, sc);
      trunks.setMatrixAt(n, m);
      lower.setMatrixAt(n, m);
      upper.setMatrixAt(n, m);
      col.setHSL(0.32 + rand() * 0.05, 0.42 + rand() * 0.2, 0.26 + rand() * 0.1);
      lower.setColorAt(n, col);
      upper.setColorAt(n, col.offsetHSL(0, 0, 0.03));
      n++;
    }
    trunks.count = lower.count = upper.count = n;
    lower.castShadow = upper.castShadow = true;
    scene.add(trunks, lower, upper);
  }

  // ---- lake --------------------------------------------------------------
  {
    const geo = new THREE.CircleGeometry(95, 40);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0x2e6f96 });
    const lake = new THREE.Mesh(geo, mat);
    lake.position.copy(lakeCenter);
    scene.add(lake);
    // glints
    const glint = new THREE.Mesh(
      new THREE.CircleGeometry(90, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x9fd4ef, transparent: true, opacity: 0.16 })
    );
    glint.position.copy(lakeCenter).y += 0.15;
    scene.add(glint);
  }

  // ---- distant ranges ----------------------------------------------------
  {
    const mat = new THREE.MeshLambertMaterial({ color: 0x7590a4, fog: false });
    const snowMat = new THREE.MeshLambertMaterial({ color: 0xe8f1f6, fog: false });
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * Math.PI * 2 + rand() * 0.2;
      const dist = 800 + rand() * 420;
      const h = 130 + rand() * 200;
      const peak = new THREE.Mesh(new THREE.ConeGeometry(180 + rand() * 160, h, 5), mat);
      peak.position.set(center.x + Math.cos(ang) * dist, lakeCenter.y - 40 + h / 2, center.z + Math.sin(ang) * dist);
      peak.rotation.y = rand() * Math.PI;
      scene.add(peak);
      if (h > 200) {
        const cap = new THREE.Mesh(new THREE.ConeGeometry(52, h * 0.24, 5), snowMat);
        cap.position.copy(peak.position);
        cap.position.y += h * 0.38;
        cap.rotation.y = peak.rotation.y;
        scene.add(cap);
      }
    }
  }

  // ---- sky ---------------------------------------------------------------
  {
    const geo = new THREE.SphereGeometry(1900, 24, 14);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      uniforms: { },
      vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vPos;
        void main(){
          float h = normalize(vPos).y;
          vec3 top = vec3(0.28, 0.52, 0.85);
          vec3 mid = vec3(0.62, 0.78, 0.92);
          vec3 hor = vec3(0.90, 0.93, 0.90);
          vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.9, h))
                            : mix(hor, mid, smoothstep(-0.05, 0.25, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.position.copy(center);
    scene.add(sky);
    world.sky = sky;

    // sun sprite
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.makeSoftCircle('#fff6d8'), color: 0xfff3c0, fog: false,
      transparent: true, opacity: 0.95, depthWrite: false,
    }));
    sun.scale.setScalar(340);
    sun.position.set(center.x + 700, 620, center.z + 500);
    scene.add(sun);

    // drifting clouds
    const cloudMat = new THREE.SpriteMaterial({
      map: TEX.makeSoftCircle('#ffffff'), transparent: true, opacity: 0.8, fog: false, depthWrite: false,
    });
    const clouds = [];
    for (let i = 0; i < 12; i++) {
      const spr = new THREE.Sprite(cloudMat);
      const ang = rand() * Math.PI * 2;
      spr.position.set(center.x + Math.cos(ang) * (500 + rand() * 700), 320 + rand() * 260, center.z + Math.sin(ang) * (500 + rand() * 700));
      spr.scale.set(220 + rand() * 260, 70 + rand() * 60, 1);
      scene.add(spr);
      clouds.push(spr);
    }
    world.updatables.push((dt) => clouds.forEach((c, i) => { c.position.x += dt * (2 + (i % 3)); if (c.position.x > center.x + 1400) c.position.x = center.x - 1400; }));
  }

  // ---- race furniture ----------------------------------------------------
  const furniture = new THREE.Group();
  scene.add(furniture);
  {
    const poleMat = new THREE.MeshLambertMaterial({ color: 0xc23b22 });
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.2, 6);
    const tapeTex = TEX.makeTape();
    const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

    // course tape along berms + jump line + ridge
    const taped = [];
    for (const [segIdx, side] of [[3, -1], [5, 1], [9, -1], [9, 1], [10, -1], [13, 1], [14, -1]]) {
      const s0 = track.segStarts[segIdx];
      const len = [26,55,45,42,45,40,34,70,55,105,48,55,42,50,50,68][segIdx];
      taped.push([s0 + 3, s0 + len - 3, side]);
    }
    for (const [sA, sB, side] of taped) {
      const pts = [];
      for (let s = sA; s <= sB; s += 6) {
        const surf = track.surface(s, 0);
        const off = (surf.width + 1.6);
        track.worldPos(s, side * off, tmp);
        tmp.y = Math.max(tmp.y, world.groundY(tmp.x, tmp.z)) + 0.9;
        pts.push(tmp.clone());
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.copy(tmp).y -= 0.55;
        furniture.add(pole);
      }
      // tape ribbon between poles
      const X_AXIS = new THREE.Vector3(1, 0, 0);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const len = a.distanceTo(b);
        const geo = new THREE.PlaneGeometry(len, 0.3);
        const tex = tapeTex.clone();
        tex.needsUpdate = true;
        tex.repeat.set(len / 2.4, 0.28);
        tex.offset.set(0, 0.36);
        const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, transparent: true }));
        mesh.position.copy(a).lerp(b, 0.5);
        tmp2.copy(b).sub(a).normalize();
        mesh.quaternion.setFromUnitVectors(X_AXIS, tmp2);
        furniture.add(mesh);
      }
    }

    // sponsor flags near the jump line and finish
    const bannerDefs = [
      ['SEND IT', '#12233d', '#ffd257'],
      ['SHRED TOUR', '#c23b22', '#ffffff'],
      ['MARMOT ENERGY', '#1a4a2e', '#ffe9a8'],
      ['FABLE BIKE CO', '#222222', '#8fd0ff'],
    ];
    let bi = 0;
    for (const s of [track.segStarts[9] + 5, track.segStarts[9] + 40, track.segStarts[9] + 76, track.segStarts[12] + 8, track.total - 40, track.total - 22]) {
      const side = bi % 2 === 0 ? -1 : 1;
      const def = bannerDefs[bi++ % bannerDefs.length];
      const surf = track.surface(s, 0);
      track.worldPos(s, side * (surf.width + 2.6), tmp);
      tmp.y = Math.max(tmp.y, world.groundY(tmp.x, tmp.z));
      const g = new THREE.Group();
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.4, 6), new THREE.MeshLambertMaterial({ color: 0x333333 }));
      mast.position.y = 1.7;
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 2.2),
        new THREE.MeshLambertMaterial({ map: TEX.makeBanner(def[0], def[1], def[2]), side: THREE.DoubleSide })
      );
      flag.position.set(0.5, 2.2, 0);
      g.add(mast, flag);
      g.position.copy(tmp);
      g.lookAt(tmp.clone().add(track.dirAt(s, tmp2)));
      furniture.add(g);
    }

    // start gate + finish arch
    const archMat = new THREE.MeshLambertMaterial({ color: 0xc23b22 });
    function arch(s, label, bg, fg) {
      const surf = track.surface(s, 0);
      const w = surf.width + 2.2;
      const g = new THREE.Group();
      const legGeo = new THREE.CylinderGeometry(0.16, 0.2, 4.4, 8);
      for (const sx of [-w, w]) {
        const leg = new THREE.Mesh(legGeo, archMat);
        leg.position.set(sx, 2.2, 0);
        g.add(leg);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 0.6, 1.0, 0.35), new THREE.MeshLambertMaterial({ map: TEX.makeBanner(label, bg, fg) }));
      beam.position.y = 4.6;
      const beamTex = TEX.makeTape();
      beam.material = new THREE.MeshLambertMaterial({ color: 0xffffff });
      // canvas label across the beam
      const c = document.createElement('canvas');
      c.width = 512; c.height = 64;
      const cx = c.getContext('2d');
      cx.fillStyle = bg; cx.fillRect(0, 0, 512, 64);
      cx.fillStyle = fg; cx.font = 'bold 46px Arial Narrow, Arial'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillText(label, 256, 34);
      const lt = new THREE.CanvasTexture(c);
      lt.colorSpace = THREE.SRGBColorSpace;
      beam.material = new THREE.MeshLambertMaterial({ map: lt });
      g.add(beam);
      track.worldPos(s, 0, tmp);
      g.position.copy(tmp);
      const dir = track.dirAt(s, tmp2);
      g.rotation.y = Math.atan2(dir.x, dir.z);
      furniture.add(g);
      return g;
    }
    arch(track.startS + 2, 'SHRED DOWNHILL', '#12233d', '#ffd257');
    arch(track.finishS, 'FINISH', '#c23b22', '#ffffff');
  }

  world.lakeCenter = lakeCenter;
  world.center = center;
  return world;
}
