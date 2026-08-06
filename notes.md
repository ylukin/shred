# SHRED — dev notes

Working notes for the 3D downhill mountain biking browser game. Appended as I go.

## 2026-08-06 — Kickoff

- Read `game.md` and the reference screenshot: third-person downhill MTB racer.
  Key elements to hit: dirt trail down a mountainside, jumps/berms/rock gardens/drops,
  forest + lake valley vista, HUD with TIME / BEST / PROGRESS % / speedometer + gear,
  circular minimap bottom-left.
- Plan:
  1. `index.html` title screen first (this commit) so there's something to preview.
  2. Generate textures with OpenAI `gpt-image-2` (dirt trail, rock, grass, pine bark/foliage, skybox).
  3. Vendor Three.js into the repo (`vendor/`) so the site is fully static, no CDN dependency.
  4. Arcade physics: rider follows a spline-based track laid over a heightfield mountain;
     steering moves you across the trail width, speed from gradient + pumping, air off jumps.
  5. Track sections per game.md: start gate → flow trail → berms → rock garden → big jumps →
     drop → finish. Fixed seed so best-times are comparable.
  6. Mobile: touch steering (left/right halves or drag), a jump/pump button, HUD scales with vw.
  7. Surprises planned: mid-air trick system for style points, a marmot that darts across the
     trail, golden eagle flyby, finish-line confetti + air-horn vibes.
- Title screen: pure CSS/SVG mountain silhouettes + big condensed type, "TAP / PRESS ENTER TO RIDE".
  No Three.js needed yet — keeps first commit tiny and fast to load.

## 2026-08-06 — Core game playable

- **OpenAI image API blocked**: this session's network egress policy denies
  `api.openai.com` (proxy 403 "Host not in allowlist"), so gpt-image-2 texture
  generation can't run from here. Built seeded procedural canvas textures instead
  (dirt with tire tread, alpine grass, granite) in `js/textures.js`. The loader
  tries `assets/textures/{dirt,grass,rock}.jpg` first and hot-swaps them in if
  present — so generated textures can be dropped in later with zero code changes.
  Will retry the API before wrapping up.
- Vendored Three.js 0.164 (`vendor/three.module.min.js`) + import map → fully
  static site, no CDN dependency at runtime.
- Architecture: track-space physics. Rider state = (s along course, x lateral,
  y height, v speed, vy vertical). The course is sampled every metre from a
  segment list (curvature/grade/width/type) in `js/track.js`; jumps, rollers and
  the drop are elevation "features" layered onto the base grade. Ballistic check
  each frame decides grounded vs airborne — jumps and the drop fall out of the
  math naturally rather than being scripted.
- Course: start gate → flow S-curves → big right berm → rollers → left berm →
  rock garden (with a hidden smoother "clean line" that snakes through) → sweeper
  → 3-tabletop jump line → wall berm → exposed ridge spine → THE DROP (5.5 m
  cliff) → two fast berms → finish kicker + arch. ~820 m, ~90 m of descent.
- World: IDW heightfield through the track points (+ phantom lake + peak points)
  gives a mountainside that always meets the trail; fbm noise for relief; special
  falloff cuts terrain away on both sides of the ridge. Instanced pines (~750,
  clumped by noise), instanced granite boulders, lake below the finish, ring of
  distant snow-capped peaks, drifting cloud sprites, gradient-shader sky.
- Rider: low-poly primitives bike + rider (jersey #27 like the reference shot),
  animated: wheel spin, steering, lean, whips in air, tuck crouch, crash tumble.
- HUD matches reference screenshot: TIME + green BEST top-left, PROGRESS % top-
  right, circular minimap bottom-left, speedo dial + MPH + GEAR bottom-right.
  Style points, popup text (SICK WHIP / SKETCHY / OVER THE BARS...).
- Audio: all synthesized WebAudio — rolling dirt noise, wind, jump whoosh,
  landing thud, crash, countdown beeps, finish fanfare. Mute button persists.
- Surprises in: marmot darts across the trail before the sweeper (near-miss
  popup + squeak), golden eagle flyby at the drop, confetti at the finish.
- Touch controls: drag anywhere to steer (analog), SEND button to hop/pump,
  BRAKE button. HUD scales with clamp()/vw for small screens.
- Testing: Playwright + headless Chromium (SwiftShader). Added `?auto=1`
  autopilot + `__shred.simulate(secs)` debug hook to fast-forward runs — full
  autopilot course time ~51 s, no crashes, all sections hit.
- Fixed along the way: wheels rendered as flat discs (torus facing wrong axis),
  berm banks were 6 m walls (clamped bank to 0.42 rad), course tape planes
  floated diagonally in the sky (quaternion orientation), ridge section rendered
  as a trench (terrain falloff now keyed to distance-to-ridge-samples, narrow
  carve bench), rock garden scrubbed speed too hard.

## 2026-08-06 — Polish round 1

- Narrowed the trail (half-width 3.0–4.0 m flow/jumps, 1.9 m ridge) — speed
  reads much better and the tree corridor closes in.
- Forest: 950 instanced pines, half placed hugging an 8–50 m band along the
  trail so every section rides through a green corridor (matches reference art).
- Course tape now unlit MeshBasicMaterial — backside used to render near-black
  and looked like navy slabs in the sky.
- Start/finish arch legs lengthened + sunk so they never float on side-slopes.
- Dust particle trail behind the rear wheel when grounded above ~16 mph.
- Verified with Playwright: mobile portrait + landscape layouts, touch-drag
  steering (drag 60 px → steer 0.85), BRAKE/SEND buttons, keyboard steer,
  grass slowdown, crash + auto-recovery, bunny hop, brake decel.

## 2026-08-06 — Wrap-up round

- Trackside warning banners before the rock garden, ridge line and the drop
  ("ROCKS AHEAD" / "RIDGE LINE" / "THE DROP") so first-timers get a beat of
  telegraphing before each crux.
- Title screen shows your saved best run time.
- Added `tools/generate-textures.mjs`: one command to generate dirt/grass/rock
  textures with gpt-image-2 into `assets/textures/` once network egress to
  api.openai.com is enabled for the environment (retried during this session —
  still 403 from the egress policy). The game auto-upgrades when files exist.
- Added README with controls, course guide, and tech notes.
- Final regression: full autopilot run clean in ~51 s, all 8 section types hit,
  zero console errors; mobile portrait/landscape verified.
