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
