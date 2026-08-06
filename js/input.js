// Unified keyboard + touch input.
// steer: -1..1 (right positive), brake/tuck: booleans, jump: edge-triggered.
import { clamp } from './util.js';

export function createInput() {
  const state = {
    steer: 0, brake: false,
    jumpQueued: false, restartQueued: false,
    touchActive: false,
  };
  const keys = new Set();

  function recompute() {
    let s = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) s -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) s += 1;
    if (!state.touchActive && !(tilt.enabled && s === 0)) state.steer = s;
    state.brakeKey = keys.has('ArrowDown') || keys.has('KeyS');
    state.pedalKey = keys.has('ArrowUp') || keys.has('KeyW') || keys.has('ShiftLeft');
  }

  // ---- tilt steering (device orientation) --------------------------------
  // Static-file friendly: uses the deviceorientation event only. Needs HTTPS,
  // and on iOS a permission prompt that must come from a user gesture — see
  // enableTilt(), which the steering toggle button calls.
  const tilt = {
    enabled: false,
    supported: typeof DeviceOrientationEvent !== 'undefined',
    baseline: null,
    seen: false,
  };
  function onOrient(e) {
    tilt.seen = true;
    const angle = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
    let v; // degrees of left/right tilt for the current screen orientation
    if (angle === 90) v = e.beta ?? 0;
    else if (angle === -90 || angle === 270) v = -(e.beta ?? 0);
    else if (angle === 180) v = -(e.gamma ?? 0);
    else v = e.gamma ?? 0;
    if (!tilt.enabled) return;
    if (tilt.baseline === null) tilt.baseline = v; // neutral = how you hold the phone
    const d = v - tilt.baseline;
    const DEAD = 1.5, RANGE = 15; // degrees: deadzone + tilt for full lock
    const mag = Math.max(0, Math.abs(d) - DEAD) / RANGE;
    state.steer = clamp(Math.sign(d) * mag, -1, 1);
  }
  window.addEventListener('deviceorientation', onOrient);

  async function enableTilt() {
    if (!tilt.supported) return false;
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        if (await DeviceOrientationEvent.requestPermission() !== 'granted') return false;
      } catch { return false; }
    }
    tilt.enabled = true;
    tilt.baseline = null;
    localStorage.setItem('shred_tilt', 'true');
    return true;
  }
  function disableTilt() {
    tilt.enabled = false;
    state.steer = 0;
    localStorage.setItem('shred_tilt', 'false');
  }

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space') { state.jumpQueued = true; e.preventDefault(); }
    if (e.code === 'KeyR') state.restartQueued = true;
    keys.add(e.code);
    recompute();
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys.delete(e.code); recompute(); });
  window.addEventListener('blur', () => { keys.clear(); recompute(); });

  // ---- touch: drag anywhere to steer, on-screen buttons for the rest ----
  const steerZone = document.getElementById('touch-steer');
  const btnJump = document.getElementById('btn-jump');
  const btnPedal = document.getElementById('btn-pedal');
  const btnBrake = document.getElementById('btn-brake');

  let steerTouchId = null, steerOriginX = 0;
  const STEER_RANGE = () => Math.min(window.innerWidth * 0.18, 120);

  if (steerZone) {
    steerZone.addEventListener('touchstart', (e) => {
      if (tilt.enabled) return; // tilt mode: the screen is not a steering wheel
      for (const t of e.changedTouches) {
        if (steerTouchId === null) {
          steerTouchId = t.identifier;
          steerOriginX = t.clientX;
          state.touchActive = true;
        }
      }
      e.preventDefault();
    }, { passive: false });
    steerZone.addEventListener('touchmove', (e) => {
      if (tilt.enabled) return;
      for (const t of e.changedTouches) {
        if (t.identifier === steerTouchId) {
          state.steer = clamp((t.clientX - steerOriginX) / STEER_RANGE(), -1, 1);
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === steerTouchId) {
          steerTouchId = null;
          state.steer = 0;
          state.touchActive = false;
        }
      }
    };
    steerZone.addEventListener('touchend', end);
    steerZone.addEventListener('touchcancel', end);
  }

  function bindButton(el, down, up) {
    if (!el) return;
    el.addEventListener('touchstart', (e) => { down(); e.preventDefault(); el.classList.add('pressed'); }, { passive: false });
    const release = (e) => { up?.(); e.preventDefault(); el.classList.remove('pressed'); };
    el.addEventListener('touchend', release);
    el.addEventListener('touchcancel', release);
    // mouse fallback (desktop testing of the buttons)
    el.addEventListener('mousedown', (e) => { down(); e.preventDefault(); el.classList.add('pressed'); });
    el.addEventListener('mouseup', () => { up?.(); el.classList.remove('pressed'); });
    el.addEventListener('mouseleave', () => { up?.(); el.classList.remove('pressed'); });
  }
  bindButton(btnJump, () => { state.jumpQueued = true; });
  bindButton(btnPedal, () => { state.pedalTouch = true; }, () => { state.pedalTouch = false; });
  bindButton(btnBrake, () => { state.brakeTouch = true; }, () => { state.brakeTouch = false; });

  return {
    state,
    get steer() { return state.steer; },
    get brake() { return !!(state.brakeKey || state.brakeTouch); },
    get pedal() { return !!(state.pedalKey || state.pedalTouch); },
    takeJump() { const j = state.jumpQueued; state.jumpQueued = false; return j; },
    takeRestart() { const r = state.restartQueued; state.restartQueued = false; return r; },
    tilt,
    enableTilt,
    disableTilt,
    calibrateTilt() { tilt.baseline = null; }, // re-zero to current phone pose
  };
}
