// Procedural WebAudio: rolling dirt, wind, whooshes, thuds, beeps, fanfare.
// Everything synthesized — no audio files needed.
import { clamp } from './util.js';

export function createAudio() {
  let ctx = null, master = null, rolling = null, rollGain = null, rollFilter = null;
  let wind = null, windGain = null, windFilter = null;
  let muted = JSON.parse(localStorage.getItem('shred_muted') || 'false');

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return false; }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);

    // shared noise buffer
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    noiseBuf = buf;

    // rolling tires: brown-ish noise through lowpass
    rolling = ctx.createBufferSource();
    rolling.buffer = buf; rolling.loop = true;
    rollFilter = ctx.createBiquadFilter();
    rollFilter.type = 'lowpass'; rollFilter.frequency.value = 150;
    rollGain = ctx.createGain(); rollGain.gain.value = 0;
    rolling.connect(rollFilter).connect(rollGain).connect(master);
    rolling.start();

    // wind at speed: bandpassed noise
    wind = ctx.createBufferSource();
    wind.buffer = buf; wind.loop = true; wind.playbackRate.value = 0.7;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass'; windFilter.frequency.value = 700; windFilter.Q.value = 0.6;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    wind.connect(windFilter).connect(windGain).connect(master);
    wind.start();
    return true;
  }
  let noiseBuf = null;

  function noiseBurst(dur, freq, q, gain, type = 'bandpass') {
    if (!ensure()) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(f).connect(g).connect(master);
    src.start();
    src.stop(ctx.currentTime + dur + 0.05);
  }
  function tone(freq, dur, gain = 0.2, type = 'square', slideTo = null) {
    if (!ensure()) return;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.05);
  }

  return {
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      localStorage.setItem('shred_muted', JSON.stringify(muted));
      if (master) master.gain.value = muted ? 0 : 0.9;
      return muted;
    },
    // continuous layers, call each frame
    ride(speed, grounded, rough) {
      if (!ctx) return;
      const v = clamp(speed / 13, 0, 1);
      rollGain.gain.value = grounded ? 0.05 + v * 0.28 + (rough ? 0.25 : 0) : 0.01;
      rollFilter.frequency.value = 120 + v * 500 + (rough ? 300 : 0);
      windGain.gain.value = v * v * 0.22 + (grounded ? 0 : 0.06);
      windFilter.frequency.value = 500 + v * 900;
    },
    jump() { noiseBurst(0.35, 900, 1.2, 0.25, 'highpass'); },
    land(hard) { tone(hard ? 60 : 80, 0.18, hard ? 0.5 : 0.3, 'sine'); noiseBurst(0.12, 300, 1, hard ? 0.4 : 0.2); },
    crash() { noiseBurst(0.5, 250, 0.8, 0.6); tone(90, 0.4, 0.4, 'sawtooth', 40); },
    countdown(final) { tone(final ? 880 : 440, final ? 0.4 : 0.15, 0.25, 'square'); },
    clean() { tone(660, 0.1, 0.2, 'triangle'); tone(990, 0.18, 0.2, 'triangle'); },
    squeak() { tone(1900, 0.09, 0.25, 'sine', 2600); tone(2200, 0.1, 0.2, 'sine', 2900); },
    screech() { tone(1400, 0.7, 0.12, 'sawtooth', 700); },
    fanfare() {
      [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.38]].forEach(([f, d]) =>
        setTimeout(() => { tone(f, 0.35, 0.25, 'triangle'); tone(f / 2, 0.35, 0.15, 'sine'); }, d * 1000));
    },
  };
}
