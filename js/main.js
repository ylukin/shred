// SHRED — main game loop, physics, camera, states, critters, confetti.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, mulberry32 } from './util.js';
import { buildTrack, SECTION } from './track.js';
import { buildWorld } from './world.js';
import { buildRider } from './rider.js';
import { createInput } from './input.js';
import { createHUD, formatTime } from './hud.js';
import { createAudio } from './audio.js';
import * as TEX from './textures.js';

const params = new URLSearchParams(location.search);
const AUTO = params.has('auto');
const START_S = parseFloat(params.get('s') || '0') || 0;

// ---------------------------------------------------------------------------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.8 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xdaeae6, 180, 1500);
const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 4000);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// lights
const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a6b4a, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d8, 1.9);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 220;
const SB = 42;
sun.shadow.camera.left = -SB; sun.shadow.camera.right = SB;
sun.shadow.camera.top = SB; sun.shadow.camera.bottom = -SB;
sun.shadow.bias = -0.0015;
scene.add(sun, sun.target);

// ---------------------------------------------------------------------------
const track = buildTrack();
const world = buildWorld(scene, track);
const riderRig = buildRider();
scene.add(riderRig.group);
const input = createInput();
const hud = createHUD(track);
const audio = createAudio();

// ---------------------------------------------------------------------------
// Rider physics state (track space)
const P = {
  s: track.startS, x: 0, y: 0, v: 0, vy: 0,
  air: false, airTime: 0, whip: 0, styleBank: 0, style: 0,
  crashT: 0, offGrass: false,
  timeMs: 0, finished: false, started: false,
};
let state = 'title'; // title | countdown | riding | finish
let countdownT = 0;
let shake = 0;

const GRAV = 15;             // arcade gravity: floatier than earth but heavy enough
const VMAX = 30;

function resetRun() {
  P.s = track.startS + START_S; P.x = 0; P.v = 0; P.vy = 0;
  P.air = false; P.airTime = 0; P.whip = 0; P.style = 0; P.styleBank = 0;
  P.crashT = 0; P.timeMs = 0; P.finished = false;
  marmot.reset(); eagle.reset(); confetti.stop();
  const surf = track.surface(P.s, 0);
  P.y = surf.y;
}

// ---------------------------------------------------------------------------
// Critters: the marmot dash + eagle flyby.
function makeMarmot() {
  const g = new THREE.Group();
  const fur = new THREE.MeshLambertMaterial({ color: 0x8a6642 });
  const bodyM = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), fur);
  bodyM.scale.set(1, 0.75, 1.4);
  const headM = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), fur);
  headM.position.set(0, 0.1, 0.28);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshLambertMaterial({ color: 0x5e4630 }));
  tail.position.set(0, 0.08, -0.32);
  g.add(bodyM, headM, tail);
  g.visible = false;
  scene.add(g);
  const TRIGGER_S = track.segStarts[8] + 20; // in the sweeper before jumps
  let running = false, done = false, t = 0;
  return {
    reset() { running = false; done = false; g.visible = false; },
    update(dt) {
      if (state !== 'riding') return;
      if (!done && !running && P.s > TRIGGER_S - 28 && P.s < TRIGGER_S - 8 && P.v > 8) {
        running = true; t = 0; g.visible = true;
        audio.squeak();
      }
      if (running) {
        t += dt;
        const xPos = -6 + t * 7.5; // sprint left → right
        track.worldPos(TRIGGER_S, xPos, g.position);
        g.position.y += 0.2 + Math.abs(Math.sin(t * 18)) * 0.12; // bounding gait
        const dir = track.rightAt(TRIGGER_S);
        g.rotation.y = Math.atan2(dir.x, dir.z);
        if (Math.abs(P.s - TRIGGER_S) < 2 && Math.abs(P.x - xPos) < 0.9 && !P.air) {
          hud.popup('MARMOT NEAR MISS!', 'warn');
          audio.squeak();
          P.v *= 0.85; shake = Math.max(shake, 0.5);
          done = true; running = false;
          setTimeout(() => (g.visible = false), 300);
        }
        if (xPos > 7) { running = false; done = true; g.visible = false; }
      }
    },
  };
}
function makeEagle() {
  const g = new THREE.Group();
  const bodyE = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.1, 6), new THREE.MeshLambertMaterial({ color: 0x4a3826 }));
  bodyE.rotation.x = Math.PI / 2;
  const wingGeo = new THREE.BoxGeometry(2.6, 0.06, 0.55);
  const wingMat = new THREE.MeshLambertMaterial({ color: 0x5c452c });
  const wings = new THREE.Mesh(wingGeo, wingMat);
  const headE = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshLambertMaterial({ color: 0xf0ede4 }));
  headE.position.z = 0.6;
  g.add(bodyE, wings, headE);
  g.visible = false;
  scene.add(g);
  let flying = false, done = false, t = 0;
  const from = new THREE.Vector3(), to = new THREE.Vector3();
  return {
    reset() { flying = false; done = false; g.visible = false; },
    update(dt) {
      if (state !== 'riding') return;
      if (!done && !flying && P.s > track.dropS - 60 && P.s < track.dropS - 40) {
        flying = true; t = 0; g.visible = true;
        const p = track.worldPos(track.dropS, 0);
        const right = track.rightAt(track.dropS);
        const dir = track.dirAt(track.dropS);
        from.copy(p).addScaledVector(right, -50).addScaledVector(dir, 30).add(new THREE.Vector3(0, 16, 0));
        to.copy(p).addScaledVector(right, 60).addScaledVector(dir, 60).add(new THREE.Vector3(0, 6, 0));
        audio.screech();
      }
      if (flying) {
        t += dt / 9;
        g.position.lerpVectors(from, to, t);
        g.position.y += Math.sin(t * Math.PI) * 6;
        const d = to.clone().sub(from);
        g.rotation.y = Math.atan2(d.x, d.z);
        wings.rotation.z = Math.sin(t * 40) * 0.18;
        if (t >= 1) { flying = false; done = true; g.visible = false; }
      }
    },
  };
}
const marmot = makeMarmot();
const eagle = makeEagle();

// Confetti at the finish
function makeConfetti() {
  const N = 260;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const vel = [];
  const palette = [[1, 0.32, 0.24], [1, 0.82, 0.34], [0.24, 0.86, 0.47], [0.35, 0.62, 1], [1, 1, 1]];
  const rand = mulberry32(31337);
  for (let i = 0; i < N; i++) {
    const c = palette[(rand() * palette.length) | 0];
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    vel.push(new THREE.Vector3());
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, opacity: 0.95 });
  const points = new THREE.Points(geo, mat);
  points.visible = false;
  points.frustumCulled = false;
  scene.add(points);
  let active = false, t = 0;
  const rand2 = mulberry32(999);
  return {
    burst(center) {
      active = true; t = 0; points.visible = true;
      for (let i = 0; i < N; i++) {
        pos[i * 3] = center.x + (rand2() - 0.5) * 6;
        pos[i * 3 + 1] = center.y + 4 + rand2() * 2;
        pos[i * 3 + 2] = center.z + (rand2() - 0.5) * 6;
        vel[i].set((rand2() - 0.5) * 6, 2 + rand2() * 5, (rand2() - 0.5) * 6);
      }
    },
    stop() { active = false; points.visible = false; },
    update(dt) {
      if (!active) return;
      t += dt;
      for (let i = 0; i < N; i++) {
        vel[i].y -= 6 * dt;
        vel[i].multiplyScalar(1 - 0.6 * dt);
        pos[i * 3] += vel[i].x * dt;
        pos[i * 3 + 1] += vel[i].y * dt;
        pos[i * 3 + 2] += vel[i].z * dt;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = clamp(1.2 - t * 0.18, 0, 1);
      if (t > 7) this.stop();
    },
  };
}
const confetti = makeConfetti();

// Dust kicked up behind the rear wheel at speed.
function makeDust() {
  const N = 140;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3).fill(0);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xa98c63, size: 0.5, transparent: true, opacity: 0.5,
    map: TEX.makeSoftCircle('#c9b08a'), depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  const vel = Array.from({ length: N }, () => new THREE.Vector3());
  const life = new Float32Array(N).fill(0);
  let head = 0;
  return {
    update(dt) {
      // emit while grounded and moving
      if (!P.air && P.v > 6 && state === 'riding') {
        const emitN = P.v > 10 ? 3 : 1;
        for (let e = 0; e < emitN; e++) {
          const i = head = (head + 1) % N;
          const back = track.dirAt(P.s, tmpV).multiplyScalar(-0.7);
          pos[i * 3] = riderRig.group.position.x + back.x + (Math.random() - 0.5) * 0.3;
          pos[i * 3 + 1] = riderRig.group.position.y + 0.15;
          pos[i * 3 + 2] = riderRig.group.position.z + back.z + (Math.random() - 0.5) * 0.3;
          vel[i].set((Math.random() - 0.5) * 1.4, 0.9 + Math.random() * 1.4, (Math.random() - 0.5) * 1.4).addScaledVector(back, P.v * 0.12);
          life[i] = 0.9;
        }
      }
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) { pos[i * 3 + 1] = -999; continue; }
        life[i] -= dt;
        vel[i].y += 1.2 * dt; // dust billows up
        pos[i * 3] += vel[i].x * dt;
        pos[i * 3 + 1] += vel[i].y * dt;
        pos[i * 3 + 2] += vel[i].z * dt;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
const dust = makeDust();

// ---------------------------------------------------------------------------
// Best time
let bestMs = parseFloat(localStorage.getItem('shred_best')) || null;
hud.setBest(bestMs);
if (bestMs) document.getElementById('title-best').textContent = `BEST RUN ${formatTime(bestMs)}`;

// ---------------------------------------------------------------------------
// Physics step
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpV3 = new THREE.Vector3();

function crash(reason) {
  if (P.crashT > 0) return;
  P.crashT = 1.35;
  P.styleBank = 0;
  audio.crash();
  hud.popup(reason, 'bad');
  shake = 1.2;
}

function physics(dt) {
  if (P.crashT > 0) {
    P.crashT -= dt;
    P.v = Math.max(0, P.v - dt * 14);
    P.s += P.v * dt;
    if (P.crashT <= 0) {
      // back on the bike, centered
      P.x = clamp(P.x, -1.5, 1.5);
      P.whip = 0; P.air = false;
      const surf0 = track.surface(P.s, P.x);
      P.y = surf0.y; P.vy = 0;
      P.v = Math.max(P.v, 3.5);
    }
    return;
  }

  const surf = track.surface(P.s, P.x);
  const steer = AUTO ? autopilotSteer() : input.steer;
  const pedal = AUTO ? true : input.pedal;
  const brake = AUTO ? autopilotBrake() : input.brake;

  // Realistic top speed depends on the overall gradient (not jump lips):
  // ~25 mph descending, ~16 mph on the flat, ~6 mph grinding uphill.
  const bg = surf.baseGrade;
  const capMph = bg < 0 ? lerp(16, 25, clamp(-bg / 0.06, 0, 1))
                        : lerp(16, 6, clamp(bg / 0.06, 0, 1));
  const vCap = capMph / 2.237;

  // longitudinal
  if (!P.air) {
    let a = -GRAV * surf.grade * 1.35;     // gravity along slope, arcade-boosted
    a -= 0.011 * P.v * P.v;                // aero drag
    a -= 0.5;                              // rolling resistance
    if (pedal && P.v < vCap) a += 2.9 * clamp(vCap - P.v, 0, 1); // cranks, tapering at cap
    if (brake) a -= 11;
    if (P.v > vCap) a -= Math.min((P.v - vCap) * 2.0, 3.5); // soft speed limit, keeps momentum on punches
    if (surf.rough > 0.05 && P.v > 8) a -= surf.rough * 15; // rocks eat speed
    P.v = clamp(P.v + a * dt, 0, VMAX);
    if (P.v < 2.2 && !brake) P.v = Math.min(2.2, P.v + 4 * dt); // never quite stall
  } else {
    P.v = clamp(P.v - 0.006 * P.v * P.v * dt, 0, VMAX);
  }

  // lateral
  const steerRate = 2.2 + 0.16 * P.v;
  if (!P.air) {
    P.x += steer * steerRate * dt;
    // understeer drift in flat corners; berms bank away the g-force
    const latNeed = P.v * P.v * Math.abs(surf.bank > 0.05 || surf.bank < -0.05 ? 0 : track.curvAt(P.s));
    const latGrip = GRAV * 0.62;
    if (latNeed > latGrip) {
      const outward = track.curvAt(P.s) > 0 ? -1 : 1; // right turn pushes left(out)
      P.x += outward * (latNeed - latGrip) * 0.09 * dt * P.v;
    }
  } else {
    P.x += steer * 1.2 * dt;
    P.whip = clamp(P.whip + steer * 3.2 * dt, -2.2, 2.2);
    if (steer === 0) P.whip = lerp(P.whip, 0, Math.min(1, dt * 3.2));
  }

  // width limits
  const halfW = surf.width;
  if (surf.type === SECTION.RIDGE && Math.abs(P.x) > halfW + 0.4 && !P.air) {
    crash('OFF THE RIDGE!');
    P.x = clamp(P.x, -halfW, halfW);
  } else if (Math.abs(P.x) > halfW + 3.4) {
    crash('INTO THE TREES!');
    P.x = clamp(P.x, -halfW - 1, halfW + 1);
  } else if (Math.abs(P.x) > halfW && !P.air) {
    // grass shoulder
    P.v = Math.max(P.v - 4.5 * dt * P.v * 0.28, 2);
    shake = Math.max(shake, 0.25);
    P.offGrass = true;
  } else {
    P.offGrass = false;
  }

  // rocks rattle
  if (!P.air && surf.rough > 0.08) {
    shake = Math.max(shake, surf.rough * 1.6 * clamp(P.v / 9, 0.3, 1.4));
    if (P.v > 11.5 && surf.rough > 0.25) crash('OVER THE BARS!');
  }

  // advance + vertical
  const sPrev = P.s;
  P.s += P.v * dt;

  const gyNow = track.surface(P.s, P.x).y;
  if (!P.air) {
    // follow ground; detect lip separation
    const groundVy = (gyNow - P.y) / Math.max(dt, 1e-4);
    const ballistic = P.y + P.vy * dt - 0.5 * GRAV * dt * dt;
    if (ballistic > gyNow + 0.06 && P.vy > groundVy + 0.5) {
      P.air = true;
      P.airTime = 0;
      P.y = ballistic;
      P.vy -= GRAV * dt;
      if (P.vy > 2.5) audio.jump();
    } else {
      P.y = gyNow;
      P.vy = clamp(groundVy, -18, 18);
    }
    // bunny hop
    if (input.takeJump() || (AUTO && autopilotHop(sPrev))) {
      P.vy = Math.max(P.vy, 0) + 4.6;
      P.air = true;
      P.airTime = 0;
      P.y += 0.04;
      audio.jump();
    }
  } else {
    P.airTime += dt;
    P.vy -= GRAV * dt;
    P.y += P.vy * dt;
    input.takeJump(); // eat stray taps mid-air
    if (P.y <= gyNow) {
      // landing
      P.y = gyNow;
      const surfL = track.surface(P.s, P.x);
      const groundVy = surfL.grade * P.v;
      const impact = groundVy - P.vy; // how hard we slam relative to the slope
      P.air = false;
      const whipAbs = Math.abs(P.whip);
      if (whipAbs > 1.15) {
        crash('WASHED OUT!');
      } else if (impact > 15) {
        crash('CASED IT!');
      } else if (whipAbs > 0.55 || impact > 11) {
        P.v *= 0.68;
        hud.popup('SKETCHY!', 'warn');
        audio.land(true);
        shake = Math.max(shake, 0.7);
      } else {
        audio.land(false);
        if (P.airTime > 0.45) {
          const style = Math.round(P.airTime * 22 + whipAbs * 55);
          P.styleBank += style;
          if (whipAbs > 0.3) { hud.popup(`SICK WHIP +${style}`, 'good'); audio.clean(); }
          else if (P.airTime > 0.8) { hud.popup(`CLEAN AIR +${style}`, 'good'); audio.clean(); }
          P.v += 1.2; // flow reward
        }
      }
      P.whip = 0;
      P.vy = 0;
    }
  }
  P.style = P.styleBank;
}

// ---------------------------------------------------------------------------
// Autopilot (dev/testing: ?auto=1)
function autopilotSteer() {
  const surf = track.surface(P.s, P.x);
  let target = 0;
  if (surf.type === SECTION.ROCKS) target = track.rockLine(P.s + 4);
  const curv = track.curvAt(P.s + 8);
  if (surf.type === SECTION.BERM) target = clamp(-curv * 60, -2.2, 2.2); // inside line
  return clamp((target - P.x) * 0.8, -1, 1);
}
function autopilotBrake() {
  return false;
}
let lastHopS = -99;
function autopilotHop(sPrev) {
  const rocksS = track.segStarts[7];
  if (P.s > rocksS - 3 && P.s < rocksS && P.s - lastHopS > 30) { lastHopS = P.s; return true; }
  return false;
}

// ---------------------------------------------------------------------------
// Camera
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camInit = false;

function updateCamera(dt) {
  const dir = track.dirAt(P.s, tmpV);
  const pos = tmpV2.copy(riderRig.group.position);
  const back = 6.4 + clamp(P.v * 0.16, 0, 2.2) + (P.air ? 0.8 : 0);
  const up = 2.6 + (P.air ? 0.5 : 0);
  tmpV3.copy(pos).addScaledVector(dir, -back);
  tmpV3.y = pos.y + up;
  // keep camera above terrain/track
  const surfBehind = track.surface(Math.max(0, P.s - back), P.x * 0.5);
  tmpV3.y = Math.max(tmpV3.y, surfBehind.y + 1.4);
  const k = camInit ? Math.min(1, dt * 5.2) : 1;
  camPos.lerp(tmpV3, k);
  tmpV3.copy(pos).addScaledVector(dir, 9).add(new THREE.Vector3(0, 0.6, 0));
  camLook.lerp(tmpV3, camInit ? Math.min(1, dt * 6.5) : 1);
  camInit = true;

  camera.position.copy(camPos);
  if (shake > 0.01) {
    const s = shake * 0.14;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    shake = lerp(shake, 0, Math.min(1, dt * 6));
  }
  camera.lookAt(camLook);
  const targetFov = 68 + clamp(P.v, 0, 15) * 1.1 + (P.air ? 4 : 0);
  camera.fov = lerp(camera.fov, targetFov, Math.min(1, dt * 4));
  camera.updateProjectionMatrix();

  // sun follows for tight shadow box
  sun.position.copy(riderRig.group.position).add(new THREE.Vector3(40, 70, 28));
  sun.target.position.copy(riderRig.group.position);
}

// ---------------------------------------------------------------------------
// Rider placement
function placeRider(dt) {
  const surf = track.surface(P.s, P.x);
  track.worldPos(P.s, P.x, tmpV);
  tmpV.y = P.y;
  riderRig.group.position.copy(tmpV);
  const heading = track.headingAt(P.s);
  const steerVisual = AUTO ? autopilotSteer() : input.steer;
  riderRig.group.rotation.y = heading + (P.air ? 0 : -steerVisual * 0.1);
  riderRig.update(dt, {
    speed: P.v,
    steer: steerVisual,
    grounded: !P.air,
    crouch: (input.pedal || AUTO) && !P.air ? 1 : P.air ? 0.65 : 0.15,
    whip: P.whip,
    pitch: P.air ? clamp(-P.vy * 0.045, -0.5, 0.35) : clamp(-surf.grade * 0.9, -0.45, 0.5),
    bank: surf.bank,
    crashT: P.crashT,
  });
  riderRig.group.visible = !(P.crashT > 0 && Math.floor(P.crashT * 14) % 2 === 0);
}

// ---------------------------------------------------------------------------
// State handling / overlays
const titleScreen = document.getElementById('title-screen');
const hudRoot = document.getElementById('hud');
const countdownEl = document.getElementById('countdown');
const resultsEl = document.getElementById('results');
const touchUI = document.getElementById('touch-ui');

function startGame() {
  audio.unlock();
  input.calibrateTilt(); // neutral steer = however the phone is held right now
  titleScreen.classList.add('hidden');
  resultsEl.classList.add('hidden');
  hudRoot.classList.remove('hidden');
  if (isMobile) touchUI.classList.remove('hidden');
  resetRun();
  state = 'countdown';
  countdownT = AUTO ? 0.01 : 3.2;
  lastBeep = 4;
}
let lastBeep = 4;

function finishRun() {
  state = 'finish';
  P.finished = true;
  audio.fanfare();
  confetti.burst(track.worldPos(track.finishS, 0));
  const total = P.timeMs;
  const isBest = bestMs == null || total < bestMs;
  if (isBest) {
    bestMs = total;
    localStorage.setItem('shred_best', String(bestMs));
    hud.setBest(bestMs);
  }
  const medal = total < 85000 ? 'GOLD' : total < 100000 ? 'SILVER' : total < 120000 ? 'BRONZE' : null;
  document.getElementById('res-time').textContent = formatTime(total);
  document.getElementById('res-best').textContent = (isBest ? 'NEW BEST!' : `BEST ${formatTime(bestMs)}`);
  document.getElementById('res-best').className = isBest ? 'res-new-best' : '';
  document.getElementById('res-style').textContent = P.styleBank > 0 ? `STYLE ${P.styleBank}` : '';
  document.getElementById('res-medal').textContent = medal ? `${medal} LINE` : 'FINISHED';
  setTimeout(() => resultsEl.classList.remove('hidden'), 900);
  if (AUTO) console.log('AUTO RUN TIME:', formatTime(total), 'style', P.styleBank);
}

document.getElementById('ride-btn').addEventListener('click', startGame);
document.getElementById('again-btn').addEventListener('click', startGame);

// ---- steering mode toggle (mobile): drag vs accelerometer tilt ------------
const tiltBtns = [document.getElementById('tilt-btn'), document.getElementById('tilt-btn2')];
function refreshTiltBtns() {
  const on = input.tilt.enabled;
  tiltBtns.forEach((b) => {
    b.textContent = on ? 'STEERING: TILT' : 'STEERING: DRAG';
    b.classList.toggle('on', on);
  });
}
if (isMobile && input.tilt.supported) {
  tiltBtns.forEach((b) => {
    b.classList.remove('hidden');
    b.addEventListener('click', async () => {
      if (input.tilt.enabled) {
        input.disableTilt();
      } else if (!(await input.enableTilt())) {
        // permission denied or sensor missing — stay on drag
        b.textContent = 'TILT UNAVAILABLE';
        setTimeout(refreshTiltBtns, 1600);
        return;
      } else {
        hud.popup('TILT STEERING ON', 'good');
      }
      refreshTiltBtns();
    });
  });
  // Android (no permission prompt needed): restore a saved preference silently.
  if (localStorage.getItem('shred_tilt') === 'true' &&
      typeof DeviceOrientationEvent.requestPermission !== 'function') {
    input.enableTilt().then(refreshTiltBtns);
  }
  refreshTiltBtns();
}
document.getElementById('mute-btn').addEventListener('click', (e) => {
  const m = audio.toggleMute();
  e.currentTarget.textContent = m ? 'SOUND: OFF' : 'SOUND: ON';
});
document.getElementById('mute-btn').textContent = audio.muted ? 'SOUND: OFF' : 'SOUND: ON';

// ---------------------------------------------------------------------------
// Main loop
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (state === 'countdown') {
    countdownT -= dt;
    const n = Math.ceil(countdownT);
    if (countdownT <= 0) {
      state = 'riding';
      countdownEl.classList.add('hidden');
      hud.popup('DROP IN!', 'good');
      audio.countdown(true);
    } else {
      countdownEl.classList.remove('hidden');
      countdownEl.textContent = n;
      if (n < lastBeep) { lastBeep = n; audio.countdown(false); }
    }
  }

  if (state === 'riding') {
    if (input.takeRestart()) { startGame(); return; }
    P.timeMs += dt * 1000;
    // sub-step physics for stability at high speed
    const steps = P.v > 10 ? 2 : 1;
    for (let i = 0; i < steps; i++) physics(dt / steps);
    if (P.s >= track.finishS) finishRun();
  }
  if (state === 'finish') {
    // coast through the finish
    P.v = Math.max(0, P.v - dt * 5);
    P.s += P.v * dt;
    if (P.s < track.total - 2) {
      const surf = track.surface(P.s, P.x);
      if (!P.air) P.y = surf.y;
      else { P.vy -= GRAV * dt; P.y += P.vy * dt; if (P.y <= surf.y) { P.y = surf.y; P.air = false; } }
    }
  }

  if (state !== 'title') {
    placeRider(dt);
    updateCamera(dt);
    marmot.update(dt);
    eagle.update(dt);
    confetti.update(dt);
    dust.update(dt);
    const surf = track.surface(P.s, P.x);
    audio.ride(P.v, !P.air, !P.air && surf.rough > 0.08);
    hud.update(now, {
      timeMs: P.timeMs,
      progress: (P.s - track.startS) / (track.finishS - track.startS),
      mph: P.v * 2.237,
      gear: clamp(1 + Math.floor(P.v / 2), 1, 6),
      s: P.s,
      style: P.styleBank,
    });
  } else {
    // idle attract-mode camera drift on title
    placeRider(dt);
    const t = now * 0.0001;
    camera.position.set(
      riderRig.group.position.x + Math.cos(t) * 12,
      riderRig.group.position.y + 4,
      riderRig.group.position.z + Math.sin(t) * 12
    );
    camera.lookAt(riderRig.group.position);
  }

  world.updatables.forEach((u) => u(dt));
  renderer.render(scene, camera);
}

resetRun();
placeRider(0.016);
requestAnimationFrame(frame);

// Debug hooks for automated testing
window.__inputProbe = () => ({ steer: input.steer, brake: input.brake, pedal: input.pedal });
window.__shred = {
  P, track, startGame,
  get state() { return state; },
  // fast-forward the simulation without rendering (test harness only)
  simulate(secs) {
    const dt = 1 / 60;
    for (let i = 0; i < secs * 60; i++) {
      if (state !== 'riding') break;
      P.timeMs += dt * 1000;
      physics(dt);
      marmot.update(dt); eagle.update(dt);
      if (P.s >= track.finishS) { finishRun(); break; }
    }
    placeRider(dt);
    camInit = false; // snap camera
    updateCamera(dt);
  },
};
