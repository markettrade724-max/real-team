// ══════════════════════════════════════════
// shader-agent.js
// ══════════════════════════════════════════
import { askGemini }  from './_gemini.js';
import { soulContext } from './_soul.js';
import { logger }      from '../logger.js';

export async function run(universe, world) {
  logger.info('shader-agent', { world: world.name?.en });

  const soul = soulContext('godotAgent'); // ✅ إصلاح

  // ✅ إصلاح: نطلب JSON لأن _gemini.js يُرجع JSON دائماً
  const result = await askGemini(`
${soul}
Create a Godot 4.6.2 sky shader for world "${world.name?.en}".
Colors: background=${world.backgroundColor}, fog=${world.fogColor}, light=${world.lightColor}
Atmosphere: "${world.atmosphere}"

Return JSON only:
{
  "skyColor": "${world.backgroundColor || '#1a1a2e'}",
  "horizonColor": "${world.fogColor || '#16213e'}",
  "groundColor": "#0a0a0f",
  "sunEnergy": 1.0,
  "fogDensity": 0.01,
  "gdscript": "extends Node3D\\n\\nfunc _ready():\\n\\tvar env = WorldEnvironment.new()\\n\\tadd_child(env)"
}`, 0.5, { topP: 0.9 }); // ✅ إصلاح

  world.shader = result || fallbackShader(world);
  logger.info('Shader generated', { world: world.name?.en });
  return world;
}

function fallbackShader(world) {
  return {
    skyColor:     world.backgroundColor || '#1a1a2e',
    horizonColor: world.fogColor        || '#16213e',
    groundColor:  '#0a0a0f',
    sunEnergy:    1.0,
    fogDensity:   0.01,
    gdscript:     '',
  };
}
