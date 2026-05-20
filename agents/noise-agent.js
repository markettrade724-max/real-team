// ══════════════════════════════════════════
// noise-agent.js
// ══════════════════════════════════════════
import { askGemini }  from './_gemini.js';
import { soulContext } from './_soul.js';
import { logger }      from '../logger.js';

export async function run(universe, world) {
  logger.info('noise-agent', { world: world.name?.en });

  const soul = soulContext('levelAgent'); // ✅ إصلاح: اسم الوكيل وليس universe

  const result = await askGemini(`
${soul}
Generate Perlin noise parameters for world "${world.name?.en}".
Physics rule: "${world.physics}"
Atmosphere: "${world.atmosphere}"

Return JSON only:
{
  "seed": 0,
  "scale": 0.0,
  "octaves": 0,
  "persistence": 0.0,
  "lacunarity": 0.0,
  "heightMultiplier": 0.0,
  "terrainStyle": "one sentence describing the terrain"
}`, 0.4, { topP: 0.9 }); // ✅ إصلاح: temperature أولاً ثم options

  world.noise = result || fallbackNoise();
  logger.info('Noise generated', { seed: world.noise.seed });
  return world;
}

function fallbackNoise() {
  return { seed: Math.floor(Math.random() * 99999), scale: 0.3, octaves: 4,
           persistence: 0.5, lacunarity: 2.0, heightMultiplier: 10.0,
           terrainStyle: 'rolling hills with scattered elevation' };
}
