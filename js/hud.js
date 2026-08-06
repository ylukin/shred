// DOM HUD: timer, best, progress, speedometer dial, minimap, popups.
import { clamp, lerp } from './util.js';

export function formatTime(ms) {
  if (ms == null || !isFinite(ms)) return '--:--.---';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const t = Math.floor(ms % 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(t).padStart(3, '0')}`;
}

export function createHUD(track) {
  const el = (id) => document.getElementById(id);
  const timeEl = el('hud-time'), bestEl = el('hud-best'), progEl = el('hud-progress');
  const speedEl = el('hud-speed'), gearEl = el('hud-gear'), styleEl = el('hud-style');
  const popupHost = el('popups');

  // ---- minimap ----------------------------------------------------------
  const mapCanvas = el('minimap');
  const mctx = mapCanvas.getContext('2d');
  const MAP = mapCanvas.width; // square
  // fit track into the circle
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const sm of track.samples) {
    minX = Math.min(minX, sm.pos.x); maxX = Math.max(maxX, sm.pos.x);
    minZ = Math.min(minZ, sm.pos.z); maxZ = Math.max(maxZ, sm.pos.z);
  }
  const span = Math.max(maxX - minX, maxZ - minZ) * 1.25;
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const toMap = (x, z) => [
    MAP / 2 + ((x - cx) / span) * MAP,
    MAP / 2 + ((z - cz) / span) * MAP,
  ];

  const speedCanvas = el('speedo');
  const sctx = speedCanvas.getContext('2d');

  let smoothSpeed = 0;

  function drawMap(s) {
    mctx.clearRect(0, 0, MAP, MAP);
    // circle bg
    mctx.beginPath();
    mctx.arc(MAP / 2, MAP / 2, MAP / 2 - 2, 0, Math.PI * 2);
    mctx.fillStyle = 'rgba(10, 20, 14, 0.45)';
    mctx.fill();
    mctx.strokeStyle = 'rgba(255,255,255,0.55)';
    mctx.lineWidth = 2;
    mctx.stroke();
    // track path
    mctx.beginPath();
    for (let i = 0; i < track.samples.length; i += 6) {
      const [px, py] = toMap(track.samples[i].pos.x, track.samples[i].pos.z);
      i === 0 ? mctx.moveTo(px, py) : mctx.lineTo(px, py);
    }
    mctx.strokeStyle = 'rgba(255,255,255,0.85)';
    mctx.lineWidth = 2.5;
    mctx.lineJoin = 'round';
    mctx.stroke();
    // finish tick
    const f = track.samples[track.samples.length - 1].pos;
    const [fx, fy] = toMap(f.x, f.z);
    mctx.fillStyle = '#ffd257';
    mctx.fillRect(fx - 3, fy - 3, 6, 6);
    // rider dot
    const p = track.worldPos(clamp(s, 0, track.total - 1), 0);
    const [rx, ry] = toMap(p.x, p.z);
    mctx.beginPath();
    mctx.arc(rx, ry, 5, 0, Math.PI * 2);
    mctx.fillStyle = '#3ddc78';
    mctx.fill();
    mctx.strokeStyle = '#0c2d18';
    mctx.stroke();
  }

  function drawSpeedo(mph) {
    const S = speedCanvas.width;
    sctx.clearRect(0, 0, S, S);
    const cx2 = S / 2, cy2 = S / 2, r = S / 2 - 6;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    sctx.beginPath();
    sctx.arc(cx2, cy2, r, a0, a1);
    sctx.strokeStyle = 'rgba(255,255,255,0.28)';
    sctx.lineWidth = 7;
    sctx.lineCap = 'round';
    sctx.stroke();
    const t = clamp(mph / 60, 0, 1);
    if (t > 0.005) {
      sctx.beginPath();
      sctx.arc(cx2, cy2, r, a0, a0 + (a1 - a0) * t);
      const hot = t > 0.75;
      sctx.strokeStyle = hot ? '#ff5a3c' : '#ffffff';
      sctx.stroke();
    }
    // ticks
    sctx.strokeStyle = 'rgba(255,255,255,0.5)';
    sctx.lineWidth = 2;
    for (let i = 0; i <= 6; i++) {
      const a = a0 + ((a1 - a0) * i) / 6;
      sctx.beginPath();
      sctx.moveTo(cx2 + Math.cos(a) * (r - 8), cy2 + Math.sin(a) * (r - 8));
      sctx.lineTo(cx2 + Math.cos(a) * (r - 14), cy2 + Math.sin(a) * (r - 14));
      sctx.stroke();
    }
  }

  let lastMapT = 0;
  return {
    update(nowMs, st) {
      timeEl.textContent = formatTime(st.timeMs);
      progEl.textContent = `${Math.floor(clamp(st.progress, 0, 1) * 100)}%`;
      smoothSpeed = lerp(smoothSpeed, st.mph, 0.2);
      speedEl.textContent = Math.round(smoothSpeed);
      gearEl.textContent = `${st.gear} GEAR`;
      if (styleEl) styleEl.textContent = st.style > 0 ? `STYLE ${Math.round(st.style)}` : '';
      drawSpeedo(smoothSpeed);
      if (nowMs - lastMapT > 100) { drawMap(st.s); lastMapT = nowMs; }
    },
    setBest(ms) { bestEl.textContent = formatTime(ms); },
    popup(text, cls = '') {
      const d = document.createElement('div');
      d.className = `popup ${cls}`;
      d.textContent = text;
      popupHost.appendChild(d);
      setTimeout(() => d.classList.add('show'));
      setTimeout(() => { d.classList.add('gone'); setTimeout(() => d.remove(), 500); }, 1300);
    },
  };
}
