// Track definition: a fixed downhill course sampled every metre.
// The rider lives in track space: s = distance along course, x = lateral
// offset (+x is the rider's right), y = height above the sampled surface.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, makeNoise2D } from './util.js';

export const SECTION = {
  START: 'start', FLOW: 'flow', BERM: 'berm', ROCKS: 'rocks',
  JUMPS: 'jumps', RIDGE: 'ridge', DROP: 'drop', FINISH: 'finish',
};

// ---- course layout -------------------------------------------------------
// Each segment: length (m), curvature start/end (rad/m, + turns right),
// grade (dy per metre, negative = downhill), half width, section type.
const SEGMENTS = [
  { len: 26, c0: 0, c1: 0, grade: -0.055, w: 3.2, type: SECTION.START },
  { len: 55, c0: 0.008, c1: -0.010, grade: -0.085, w: 3.0, type: SECTION.FLOW },
  { len: 45, c0: -0.010, c1: 0.012, grade: -0.09, w: 3.0, type: SECTION.FLOW },
  { len: 42, c0: 0.052, c1: 0.052, grade: -0.05, w: 3.6, type: SECTION.BERM },  // big right berm
  { len: 45, c0: -0.006, c1: -0.006, grade: -0.10, w: 3.2, type: SECTION.FLOW }, // rollers here
  { len: 40, c0: -0.055, c1: -0.055, grade: -0.05, w: 3.6, type: SECTION.BERM }, // big left berm
  { len: 34, c0: 0.004, c1: 0.010, grade: -0.10, w: 3.0, type: SECTION.FLOW },
  { len: 70, c0: 0.010, c1: -0.012, grade: -0.105, w: 3.6, type: SECTION.ROCKS },
  { len: 55, c0: -0.020, c1: -0.020, grade: -0.075, w: 3.2, type: SECTION.FLOW }, // sweeper
  { len: 105, c0: 0.002, c1: 0.002, grade: -0.075, w: 4.0, type: SECTION.JUMPS }, // jump line
  { len: 48, c0: 0.030, c1: 0.030, grade: -0.05, w: 3.6, type: SECTION.BERM },
  { len: 55, c0: 0.000, c1: 0.000, grade: -0.045, w: 1.9, type: SECTION.RIDGE }, // exposed spine
  { len: 42, c0: -0.005, c1: -0.005, grade: -0.06, w: 3.4, type: SECTION.DROP },  // the drop
  { len: 50, c0: -0.040, c1: -0.040, grade: -0.06, w: 3.8, type: SECTION.BERM },
  { len: 50, c0: 0.045, c1: 0.045, grade: -0.06, w: 3.8, type: SECTION.BERM },
  { len: 14, c0: 0.004, c1: -0.004, grade: 0.04, w: 3.4, type: SECTION.FLOW },   // punch climb
  { len: 68, c0: -0.004, c1: 0.004, grade: -0.075, w: 3.6, type: SECTION.FINISH }, // kicker + arch
];

// Elevation features layered on the base grade. u = s - s0.
// Table-top jump: steep lip, flat deck, downslope landing.
function tableTop(u, L, h, deck, down) {
  if (u < 0) return 0;
  if (u < L) return h * Math.pow(u / L, 1.7);
  if (u < L + deck) return h;
  if (u < L + deck + down) return h * Math.pow(1 - (u - L - deck) / down, 1.4);
  return 0;
}
function roller(u, wl, h, n) {
  if (u < 0 || u > wl * n) return 0;
  const p = Math.sin((u / wl) * Math.PI);
  return h * p * p;
}
function cliff(u, depth, over) {
  if (u < 0) return 0;
  return -depth * smoothstep(0, over, u);
}

// ---- build samples -------------------------------------------------------
export function buildTrack() {
  const DS = 1;
  const samples = [];
  let x = 0, z = 0, y = 0, heading = Math.PI; // start facing -z
  let s = 0;

  const featureList = []; // filled once segment start positions are known
  let segStart = 0;
  const segStarts = SEGMENTS.map((seg) => { const v = segStart; segStart += seg.len; return v; });
  const total = segStart;

  // Feature anchors (by segment index).
  const jumpsS0 = segStarts[9];
  const rollersS0 = segStarts[4];
  const dropS0 = segStarts[12];
  const finishS0 = segStarts[16];
  featureList.push(
    { s0: rollersS0 + 8, fn: (u) => roller(u, 9, 0.85, 3) },
    { s0: jumpsS0 + 10, fn: (u) => tableTop(u, 7, 1.7, 5, 9) },
    { s0: jumpsS0 + 44, fn: (u) => tableTop(u, 7.5, 2.0, 6, 10) },
    { s0: jumpsS0 + 80, fn: (u) => tableTop(u, 6.5, 1.5, 4, 8) },
    { s0: dropS0 + 16, fn: (u) => cliff(u, 5.5, 3.5) },
    { s0: finishS0 + 14, fn: (u) => tableTop(u, 5, 1.1, 3, 7) },
  );
  const featureY = (sPos) => {
    let dy = 0;
    for (const f of featureList) dy += f.fn(sPos - f.s0);
    return dy;
  };

  let segIdx = 0, segS = 0;
  for (let i = 0; s <= total; i++, s += DS) {
    while (segIdx < SEGMENTS.length - 1 && segS >= SEGMENTS[segIdx].len) { segS -= SEGMENTS[segIdx].len; segIdx++; }
    const seg = SEGMENTS[segIdx];
    const t = clamp(segS / seg.len, 0, 1);
    const curv = lerp(seg.c0, seg.c1, smoothstep(0, 1, t));

    // Bank berms: ramp in and out over the segment.
    const shape = seg.type === SECTION.BERM ? Math.sin(Math.PI * t) : 0;
    const bank = clamp(curv * 10, -0.42, 0.42) * shape; // radians, + = right turn (left edge raised)

    const dir = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    const right = new THREE.Vector3(dir.z, 0, -dir.x);
    samples.push({
      s, pos: new THREE.Vector3(x, y + featureY(s), z),
      heading, dir, right,
      bank, width: seg.w, type: seg.type, curv,
      baseGrade: seg.grade * 1.5, // segment grade only — jump lips excluded
    });

    heading -= curv * DS; // + curvature turns right (heading decreases)
    x += Math.sin(heading) * DS;
    z += Math.cos(heading) * DS;
    y += seg.grade * 1.5 * DS; // steepened: it's a downhill race
    segS += DS;
  }

  // Grades (dy/ds of the ridden surface, features included).
  for (let i = 0; i < samples.length; i++) {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
    samples[i].grade = (b.pos.y - a.pos.y) / Math.max(1, b.s - a.s);
  }

  const rockNoise = makeNoise2D(777);
  const track = {
    samples,
    total,
    segStarts,
    dropS: dropS0 + 16,
    finishS: total - 12,
    startS: 4,
    rockLine: (sPos) => 1.4 * Math.sin(sPos * 0.16) , // the "clean line" through rocks

    sampleAt(sPos) {
      const sc = clamp(sPos, 0, total - 0.001);
      const i = Math.min(samples.length - 2, Math.floor(sc / DS));
      return { a: samples[i], b: samples[i + 1], f: sc / DS - i };
    },

    // Surface info at (s, x). Everything physics + meshes need.
    surface(sPos, xPos) {
      const { a, b, f } = this.sampleAt(sPos);
      const bank = lerp(a.bank, b.bank, f);
      const width = lerp(a.width, b.width, f);
      const grade = lerp(a.grade, b.grade, f);
      const baseGrade = lerp(a.baseGrade, b.baseGrade, f);
      const type = f < 0.5 ? a.type : b.type;
      let y = lerp(a.pos.y, b.pos.y, f);
      y += -Math.tan(bank) * xPos;               // berm tilt
      y += 0.06 * Math.abs(bank) * xPos * xPos;  // berm dish
      let rough = 0;
      if (type === SECTION.ROCKS) {
        const seg9 = this; // rough fades in/out across the section
        const u = sPos - seg9.segStarts[7];
        const fade = smoothstep(0, 10, u) * (1 - smoothstep(60, 70, u));
        const lineDist = Math.abs(xPos - this.rockLine(sPos));
        const lineFactor = clamp(lineDist / 1.3, 0.25, 1);
        rough = 0.34 * fade * lineFactor;
        y += rough * (rockNoise.fbm(sPos * 0.7, xPos * 0.9, 3) - 0.5) * 2;
      }
      return { y, bank, width, grade, baseGrade, type, rough };
    },

    // World position for track coords.
    worldPos(sPos, xPos, out = new THREE.Vector3()) {
      const { a, b, f } = this.sampleAt(sPos);
      out.copy(a.pos).lerp(b.pos, f);
      const surf = this.surface(sPos, xPos);
      out.x += lerp(a.right.x, b.right.x, f) * xPos;
      out.z += lerp(a.right.z, b.right.z, f) * xPos;
      out.y = surf.y;
      return out;
    },

    dirAt(sPos, out = new THREE.Vector3()) {
      const { a, b, f } = this.sampleAt(sPos);
      return out.copy(a.dir).lerp(b.dir, f).normalize();
    },
    rightAt(sPos, out = new THREE.Vector3()) {
      const { a, b, f } = this.sampleAt(sPos);
      return out.copy(a.right).lerp(b.right, f).normalize();
    },
    headingAt(sPos) {
      const { a, b, f } = this.sampleAt(sPos);
      return lerp(a.heading, b.heading, f);
    },
    curvAt(sPos) {
      const { a, b, f } = this.sampleAt(sPos);
      return lerp(a.curv, b.curv, f);
    },
  };
  return track;
}
