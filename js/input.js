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
    if (!state.touchActive) state.steer = s;
    state.brakeKey = keys.has('ArrowDown') || keys.has('KeyS');
    state.pedalKey = keys.has('ArrowUp') || keys.has('KeyW') || keys.has('ShiftLeft');
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
  };
}
