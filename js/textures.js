// Texture factory. Tries to load AI-generated image files from assets/textures/;
// if a file is missing (e.g. not generated yet), falls back to a procedural
// canvas texture so the game always works. All canvas textures are seeded so
// every player sees the same mountain.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

function canvasTex(size, draw, { repeat = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Try a real image first, fall back to the canvas version.
function imageOr(url, fallbackTex) {
  const loader = new THREE.TextureLoader();
  const tex = fallbackTex;
  loader.load(url, (img) => {
    img.colorSpace = THREE.SRGBColorSpace;
    img.wrapS = img.wrapT = THREE.RepeatWrapping;
    img.anisotropy = 4;
    img.repeat.copy(tex.repeat);
    // Swap image into every material that used the fallback.
    tex.userData.swapTargets?.forEach((m) => { m.map = img; m.needsUpdate = true; });
  }, undefined, () => { /* keep fallback */ });
  return tex;
}

function speckle(ctx, rand, n, size, colors, rMin, rMax, alpha = 1) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(rand() * colors.length) | 0];
    ctx.globalAlpha = alpha * (0.35 + rand() * 0.65);
    const r = rMin + rand() * (rMax - rMin);
    ctx.beginPath();
    ctx.ellipse(rand() * size, rand() * size, r, r * (0.6 + rand() * 0.8), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function makeDirt() {
  const t = canvasTex(512, (ctx, S) => {
    const rand = mulberry32(1101);
    ctx.fillStyle = '#8a6a47';
    ctx.fillRect(0, 0, S, S);
    speckle(ctx, rand, 900, S, ['#7d5f3e', '#957550', '#6f5436', '#8f6d49', '#a08054'], 6, 26, 0.5);
    speckle(ctx, rand, 700, S, ['#5e4730', '#6b5138', '#4f3b27'], 1, 4, 0.8);
    speckle(ctx, rand, 260, S, ['#a8865c', '#b3936b'], 1, 3, 0.7);
    // Faint tire lines running down the V axis.
    for (const [x0, w, col] of [[S * 0.32, 15, '#74583a'], [S * 0.45, 13, '#6d5236'], [S * 0.62, 15, '#74583a']]) {
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = w;
      ctx.beginPath();
      for (let y = -10; y <= S + 10; y += 8) {
        const x = x0 + Math.sin(y * 0.05 + x0) * 6 + (rand() - 0.5) * 5;
        y < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      // knobby tread dashes inside the line
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#5c452c';
      for (let y = 0; y < S; y += 10) {
        const x = x0 + Math.sin(y * 0.05 + x0) * 6;
        ctx.fillRect(x - w * 0.3, y, w * 0.6, 4);
      }
      ctx.globalAlpha = 1;
    }
  });
  t.userData.swapTargets = [];
  return imageOr('assets/textures/dirt.jpg', t);
}

export function makeGrass() {
  const t = canvasTex(512, (ctx, S) => {
    const rand = mulberry32(2202);
    ctx.fillStyle = '#4d7040';
    ctx.fillRect(0, 0, S, S);
    speckle(ctx, rand, 1000, S, ['#436538', '#557a46', '#3d5c33', '#5e8450', '#4a6b3d'], 5, 22, 0.55);
    speckle(ctx, rand, 500, S, ['#2f4a28', '#3a5730'], 1, 4, 0.7);
    // grass blades
    ctx.strokeStyle = '#628a52';
    ctx.lineWidth = 1;
    for (let i = 0; i < 700; i++) {
      ctx.globalAlpha = 0.25 + rand() * 0.4;
      const x = rand() * S, y = rand() * S, l = 3 + rand() * 5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rand() - 0.5) * 3, y - l); ctx.stroke();
    }
    // occasional wildflowers
    speckle(ctx, rand, 26, S, ['#d8d06a', '#c8b6d8', '#e0e6ee'], 1, 2, 0.9);
    ctx.globalAlpha = 1;
  });
  t.userData.swapTargets = [];
  return imageOr('assets/textures/grass.jpg', t);
}

export function makeRock() {
  const t = canvasTex(512, (ctx, S) => {
    const rand = mulberry32(3303);
    ctx.fillStyle = '#8b8578';
    ctx.fillRect(0, 0, S, S);
    speckle(ctx, rand, 700, S, ['#7d7769', '#948e80', '#6e685c', '#a09a8c'], 8, 30, 0.5);
    speckle(ctx, rand, 400, S, ['#5f594e', '#6a6459'], 1, 5, 0.7);
    // cracks
    ctx.strokeStyle = '#565046';
    for (let i = 0; i < 24; i++) {
      ctx.globalAlpha = 0.3 + rand() * 0.35;
      ctx.lineWidth = 1 + rand() * 1.5;
      let x = rand() * S, y = rand() * S;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let j = 0; j < 6; j++) { x += (rand() - 0.5) * 40; y += (rand() - 0.5) * 40; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
  t.userData.swapTargets = [];
  return imageOr('assets/textures/rock.jpg', t);
}

// Blue course tape with repeating text, like race-course fencing.
export function makeTape() {
  return canvasTex(256, (ctx, S) => {
    ctx.fillStyle = '#1859b8';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 58px Arial Narrow, Arial';
    ctx.textBaseline = 'middle';
    ctx.fillText('SHRED', 12, S * 0.28);
    ctx.fillText('TOUR', 40, S * 0.75);
    ctx.fillStyle = '#0d4292';
    ctx.fillRect(0, 0, S, 10);
    ctx.fillRect(0, S - 10, S, 10);
  });
}

// Sponsor banner variants for trackside flags.
export function makeBanner(text, bg, fg) {
  return canvasTex(256, (ctx, S) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, S - 20, S - 20);
    ctx.fillStyle = fg;
    ctx.font = 'bold 44px Arial Narrow, Arial';
    ctx.textAlign = 'center';
    const lines = text.split(' ');
    lines.forEach((l, i) => ctx.fillText(l, S / 2, S / 2 + (i - (lines.length - 1) / 2) * 52 + 14));
  }, { repeat: false });
}

// Soft round particle for clouds / dust / confetti glow.
export function makeSoftCircle(color = '#ffffff') {
  return canvasTex(128, (ctx, S) => {
    const g = ctx.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }, { repeat: false });
}
