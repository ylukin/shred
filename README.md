# SHRED — Downhill Mountain Biking

A 3D downhill mountain-bike racing game for the browser. Ride the line, send
the jumps, conquer the mountain. See `game.md` for the design brief.

**Play:** open `index.html` (the repo is served as static files — no build step).

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Steer | A / D or ← → | drag anywhere, or tilt the phone |
| Pedal (speed) | W / ↑ / Shift | hold PEDAL |
| Bunny hop | Space | tap SEND |
| Brake | S / ↓ | hold BRAKE |
| Restart run | R | — |

Top speed is gradient-realistic: ~25 mph descending, ~16 mph on the flat,
~6 mph grinding uphill — pedal hard into the punch climb before the finish.

On phones, the STEERING toggle (title or results screen) switches between
drag and accelerometer tilt. Tilt needs HTTPS; iOS shows a one-tap motion
permission prompt. Neutral recalibrates to how you're holding the phone at
the start of every run.

## The course

Start gate → flow S-curves → big right berm → rollers → left berm → rock
garden (there's a hidden clean line — watch the smooth dirt) → sweeper →
three-tabletop jump line → wall berm → exposed ridge spine → THE DROP →
two fast berms → finish kicker. Whip in the air for style points; land
straight or eat dirt. Best time is saved locally.

## Tech

- Three.js (vendored in `vendor/`, loaded via import map — fully static site)
- Track-space arcade physics; the course is a metre-sampled spline with
  elevation features, and airborne state falls out of a ballistic check
- Procedural canvas textures with optional AI-generated replacements:
  run `tools/generate-textures.mjs` (needs an OpenAI API key and network
  access to api.openai.com) to drop gpt-image-2 textures into
  `assets/textures/` — the game hot-swaps them in when present
- All audio synthesized with WebAudio, no asset files
- `notes.md` is the running dev log
