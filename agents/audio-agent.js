// ══════════════════════════════════════════
// audio-agent.js
// ══════════════════════════════════════════
import { askGemini }  from './_gemini.js';
import { soulContext } from './_soul.js';
import { logger }      from '../logger.js';

export async function run(universe, world) {
  logger.info('audio-agent', { world: world.name?.en });

  const soul = soulContext('levelAgent'); // ✅ إصلاح

  const result = await askGemini(`
${soul}
Describe the ambient sound and music for world "${world.name?.en}".
Essence: "${world.essence}"
Atmosphere: "${world.atmosphere}"
Physics: "${world.physics}"

Return JSON only:
{
  "ambient": "description of ambient sounds (10 words max)",
  "music": "description of music style (10 words max)",
  "tempo": "slow|medium|fast",
  "instruments": ["instrument1", "instrument2"],
  "silenceRatio": 0.0
}`, 0.7, { topP: 0.9 }); // ✅ إصلاح

  world.audio = result || fallbackAudio();
  logger.info('Audio described', { ambient: world.audio.ambient });
  return world;
}

function fallbackAudio() {
  return { ambient: 'distant wind and faint resonance',
           music: 'sparse ambient strings', tempo: 'slow',
           instruments: ['strings', 'pad'], silenceRatio: 0.3 };
}
