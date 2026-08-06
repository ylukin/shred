// Generates the game's terrain textures with OpenAI gpt-image-2 and writes
// them to assets/textures/. The game loads these files if present and falls
// back to procedural canvas textures if not — so this script is optional
// polish, not a build requirement.
//
// Usage:  OPENAI_API_KEY=sk-... node tools/generate-textures.mjs
//
// In a Claude Code remote session (outbound HTTPS via the agent proxy), run:
//   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt \
//     node tools/generate-textures.mjs
// (Node's built-in fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY is set.)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'textures');
mkdirSync(outDir, { recursive: true });

const COMMON =
  'Seamless tileable game texture, top-down orthographic view, even diffuse ' +
  'lighting, no shadows, no vignetting, edges must wrap perfectly, texture ' +
  'fills the entire frame, photorealistic.';

const JOBS = [
  ['dirt.jpg',
    `${COMMON} Hard-packed light-brown dirt of a mountain bike trail, subtle knobby ` +
    'tire tread marks running vertically, small embedded pebbles, fine dry dust.'],
  ['grass.jpg',
    `${COMMON} Alpine meadow grass seen from above, mixed green tones, small patches ` +
    'of clover and a few tiny wildflowers, short dense mountain turf.'],
  ['rock.jpg',
    `${COMMON} Grey granite rock surface with fine cracks, lichen specks, weathered ` +
    'alpine stone.'],
];

for (const [file, prompt] of JOBS) {
  process.stdout.write(`generating ${file} ... `);
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-2',
      prompt,
      size: '1024x1024',
      quality: 'medium',
      output_format: 'jpeg',
      n: 1,
    }),
  });
  if (!res.ok) {
    console.error(`FAILED: HTTP ${res.status}`, (await res.text()).slice(0, 300));
    process.exit(1);
  }
  const json = await res.json();
  const buf = Buffer.from(json.data[0].b64_json, 'base64');
  writeFileSync(join(outDir, file), buf);
  console.log(`${(buf.length / 1024).toFixed(0)} KiB`);
}
console.log('done — textures land in assets/textures/ and the game picks them up automatically.');
