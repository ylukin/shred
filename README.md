# SHRED — Downhill Mountain Biking

A 3D downhill mountain-bike racing game for the browser. Ride the line, send
the jumps, conquer the mountain. See `game.md` for the design brief.

**Play:** open `index.html` (the repo is served as static files — no build
step, no server code, no CDN dependencies). Works on desktop and mobile.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Steer | A / D or ← → | drag anywhere, or tilt the phone |
| Pedal (speed) | W / ↑ / Shift | hold PEDAL |
| Bunny hop | Space | tap SEND |
| Brake | S / ↓ | hold BRAKE |
| Restart run | R | — |

On phones, the STEERING toggle (title or results screen) switches between
drag and accelerometer tilt. Tilt needs HTTPS; iOS shows a one-tap motion
permission prompt. Neutral recalibrates to how you're holding the phone at
the start of every run, with a deadzone so small hand wobble is ignored.

## Riding model

- **Gradient-realistic top speed**: ~25 mph descending, ~16 mph on the flat,
  ~6 mph grinding uphill (smoothly interpolated from the trail's base grade —
  jump lips and rollers don't count as "uphill"). Momentum carries into short
  rises, so hit the punch climb before the finish with speed and keep cranking.
- **Pedaling** adds crank power that tapers off as you approach the cap;
  coasting alone won't win the flats.
- **Bunny hop** over rock-garden chatter, or pop off lips for extra air.
- **Whips**: steer while airborne to throw the bike sideways. Bring it back
  before touchdown — land straight for style, land crooked and you're sketchy
  or over the bars. Short chatter hops don't build whip, only real airs do.
- **Crashes** are quick: a tumble, a moment of stun, and you're back on the
  bike with the clock still running.

## The course

~830 m of descent: start gate → flow S-curves → big right berm → rollers →
left berm → rock garden (there's a hidden clean line — watch the smooth
dirt) → sweeper → three-tabletop jump line → wall berm → exposed ridge
spine → THE DROP → two fast berms → punch climb → finish kicker under the
arch, confetti included. Warning banners telegraph the rock garden, ridge
and drop the first time down.

**Three progressive ledge drops** (2.3 ft, 4 ft, 6 ft — marked DROP 1/2/3
with wooden lips) are cut into the trail along the way. Each has a choice:

- **A-line**: send the ledge. Stick the landing for **+40 / +80 / +150**
  style points.
- **B-line**: the signed ramp lane on the right rolls around the drop —
  no air, no points, no shame.

## Scoring

- **Time** is the headline: best run is saved locally and shown on the title
  screen, the HUD, and the results screen (GOLD < 1:25, SILVER < 1:40,
  BRONZE < 2:00).
- **Style** stacks on top: clean air, whips, and stuck drop landings all pay
  out; crashing zeroes your unbanked style, so greed has a price.

## HUD

Time + best (top-left), progress % and style (top-right), circular course
minimap with live rider dot (bottom-left), speedometer dial with MPH and
gear (bottom-right), plus popup callouts (CLEAN AIR, SICK WHIP, STUCK DROP,
OVER THE BARS...).

## Extras worth meeting

A marmot with questionable trail etiquette, a golden eagle patrolling the
drop, drifting clouds, a summit lake, and an all-synthesized soundscape —
rolling dirt, wind, whooshes, thuds, countdown beeps and a finish fanfare
(mute button top-right, remembered between visits).

## Tech

- Three.js (vendored in `vendor/`, loaded via import map — fully static site)
- Track-space arcade physics: the course is a metre-sampled spline with
  elevation features; airborne state falls out of a ballistic check rather
  than scripted triggers, and the surface is lateral-aware (that's how the
  A-line/B-line ledge splits work)
- World built procedurally: IDW heightfield mountainside fitted through the
  track, instanced pine forest and boulders, lake, distant snow-capped ranges
- AI-generated terrain textures (dirt/grass/rock) made with OpenAI gpt-image-2
  via `tools/generate-textures.mjs`; seeded procedural canvas textures remain
  as an automatic fallback if the files are missing
- All audio synthesized with WebAudio — no asset files
- Mobile: touch buttons (PEDAL / SEND / BRAKE), drag or tilt steering,
  responsive HUD, portrait and landscape
- Dev/testing hooks: `?auto=1` runs the autopilot, `?auto=1&bline=1` makes it
  take the ride-arounds, `?s=<m>` starts partway down the course
- `notes.md` is the running dev log
