// Low-poly rider + bike built from primitives. Returns a group plus an
// update() that animates lean, crouch, pedaling, whips and crashes.
import * as THREE from 'three';
import { clamp, lerp } from './util.js';

export function buildRider() {
  const g = new THREE.Group();          // world placement (position + heading)
  const bikeTilt = new THREE.Group();   // roll/pitch/whip
  g.add(bikeTilt);

  const jersey = new THREE.MeshLambertMaterial({ color: 0xc23b22 });
  const jerseyDark = new THREE.MeshLambertMaterial({ color: 0x2b2b30 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc79b74 });
  const black = new THREE.MeshLambertMaterial({ color: 0x1b1b1f });
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x2a6bb0 });
  const silver = new THREE.MeshLambertMaterial({ color: 0x9aa2ab });

  // ---- bike --------------------------------------------------------------
  const bike = new THREE.Group();
  bikeTilt.add(bike);
  const wheelGeo = new THREE.TorusGeometry(0.34, 0.075, 8, 18);
  const hubGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.09, 8);
  const spokeGeo = new THREE.BoxGeometry(0.61, 0.02, 0.02);
  function wheel() {
    // parts built facing +z, spun via inner group, outer group faces +x
    const spinG = new THREE.Group();
    const t = new THREE.Mesh(wheelGeo, black);
    const hub = new THREE.Mesh(hubGeo, silver);
    hub.rotation.x = Math.PI / 2;
    spinG.add(t, hub);
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Mesh(spokeGeo, silver);
      sp.rotation.z = (i / 3) * Math.PI;
      spinG.add(sp);
    }
    const w = new THREE.Group();
    w.rotation.y = Math.PI / 2;
    w.add(spinG);
    w.spin = spinG;
    return w;
  }
  const wheelF = wheel(); wheelF.position.set(0, 0.34, 0.62);
  const wheelR = wheel(); wheelR.position.set(0, 0.34, -0.52);
  const steer = new THREE.Group();       // front wheel + bars turn together
  steer.position.set(0, 0, 0);
  steer.add(wheelF);
  bike.add(wheelR, steer);

  function tube(a, b, r = 0.035) {
    const d = b.clone().sub(a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), frameMat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return m;
  }
  const bb = new THREE.Vector3(0, 0.36, 0.02);        // bottom bracket
  const seatTop = new THREE.Vector3(0, 0.86, -0.28);
  const headTop = new THREE.Vector3(0, 0.92, 0.5);
  bike.add(
    tube(bb, seatTop, 0.04),                                    // seat tube
    tube(seatTop, headTop, 0.045),                              // top tube
    tube(bb, headTop, 0.05),                                    // down tube
    tube(bb, new THREE.Vector3(0, 0.34, -0.52), 0.032),         // chainstay
    tube(seatTop, new THREE.Vector3(0, 0.34, -0.52), 0.032),    // seatstay
  );
  // fork + bars on the steer group
  steer.add(tube(new THREE.Vector3(0, 0.95, 0.47), new THREE.Vector3(0, 0.34, 0.62), 0.038));
  const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.62, 8), black);
  bars.rotation.z = Math.PI / 2;
  bars.position.set(0, 0.98, 0.45);
  steer.add(bars);
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.28), black);
  saddle.position.copy(seatTop).y += 0.03;
  bike.add(saddle);
  // cranks
  const crank = new THREE.Group();
  crank.position.copy(bb);
  const crankArm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.03), silver);
  crank.add(crankArm);
  const pedalL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.08), black);
  pedalL.position.y = 0.17;
  const pedalR = pedalL.clone();
  pedalR.position.y = -0.17;
  crank.add(pedalL, pedalR);
  bike.add(crank);

  // ---- rider -------------------------------------------------------------
  const body = new THREE.Group();
  bikeTilt.add(body);
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.24), jerseyDark);
  hips.position.set(0, 0.92, -0.18);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.24), jersey);
  torso.position.set(0, 1.22, -0.02);
  torso.rotation.x = 0.75; // leaned forward attack position
  // number plate on the back
  const plateC = document.createElement('canvas');
  plateC.width = plateC.height = 64;
  const pc = plateC.getContext('2d');
  pc.fillStyle = '#c23b22'; pc.fillRect(0, 0, 64, 64);
  pc.fillStyle = '#fff'; pc.font = 'bold 44px Arial'; pc.textAlign = 'center'; pc.textBaseline = 'middle';
  pc.fillText('27', 32, 36);
  const plateTex = new THREE.CanvasTexture(plateC);
  plateTex.colorSpace = THREE.SRGBColorSpace;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshLambertMaterial({ map: plateTex }));
  back.position.set(0, 1.25, -0.19);
  back.rotation.x = 0.75 + Math.PI;
  back.rotation.z = Math.PI;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), skin);
  head.position.set(0, 1.5, 0.22);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.165, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), jerseyDark);
  helmet.position.copy(head.position).y += 0.015;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.14), jerseyDark);
  visor.position.copy(head.position).add(new THREE.Vector3(0, 0.1, 0.14));
  visor.rotation.x = -0.3;
  body.add(hips, torso, back, head, helmet, visor);

  function limb(r, len, mat) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, len, 6), mat);
    m.geometry.translate(0, -len / 2, 0); // pivot at top
    return m;
  }
  // arms: shoulder → bars
  const armL = limb(0.05, 0.52, jersey); armL.position.set(-0.2, 1.38, 0.08);
  const armR = limb(0.05, 0.52, jersey); armR.position.set(0.2, 1.38, 0.08);
  armL.rotation.x = -1.0; armR.rotation.x = -1.0;
  // legs: hip → pedals
  const legL = limb(0.065, 0.62, jerseyDark); legL.position.set(-0.12, 0.9, -0.16);
  const legR = limb(0.065, 0.62, jerseyDark); legR.position.set(0.12, 0.9, -0.16);
  legL.rotation.x = -0.5; legR.rotation.x = -0.5;
  body.add(armL, armR, legL, legR);

  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  // ---- animation ---------------------------------------------------------
  let pedalPhase = 0;
  const R = {
    group: g,
    update(dt, st) {
      // st: {speed, steer, grounded, crouch, whip, crashT, wheelSpin}
      pedalPhase += dt * clamp(st.speed * 0.9, 0, 9);
      const spin = st.wheelSpin ?? st.speed / 0.34;
      wheelF.spin.rotation.z -= spin * dt;
      wheelR.spin.rotation.z -= spin * dt;
      crank.rotation.x = st.grounded && st.speed > 3 ? pedalPhase * 0.6 : crank.rotation.x;

      steer.rotation.y = lerp(steer.rotation.y, -st.steer * 0.35, Math.min(1, dt * 10));

      const targetRoll = st.grounded ? st.steer * -0.38 + (st.bank ?? 0) * 0.55 : st.steer * -0.2;
      bikeTilt.rotation.z = lerp(bikeTilt.rotation.z, targetRoll, Math.min(1, dt * 6));
      bikeTilt.rotation.y = lerp(bikeTilt.rotation.y, st.whip ?? 0, Math.min(1, dt * 9));
      bikeTilt.rotation.x = lerp(bikeTilt.rotation.x, st.pitch ?? 0, Math.min(1, dt * 5));

      const crouch = st.crouch ?? 0; // 0 tall, 1 tucked
      body.position.y = lerp(body.position.y, -crouch * 0.22, Math.min(1, dt * 8));
      body.rotation.x = lerp(body.rotation.x, crouch * 0.22, Math.min(1, dt * 8));

      if (st.crashT > 0) {
        // tumble!
        bikeTilt.rotation.x += dt * 7;
        bikeTilt.rotation.z += dt * 4;
      }
    },
  };
  return R;
}
