/**
 * world-senses-agent.js — v2
 * يولد الحواس الثلاث لكل عالم في استدعاءين منفصلين:
 *  - استدعاء ١: noise + audio  (بيانات خفيفة)
 *  - استدعاء ٢: shader         (كود ثقيل)
 */
import { askGemini }   from './_gemini.js';
import { soulContext }  from './_soul.js';
import { logger }       from '../logger.js';

export async function run(universe, world) {
  const worldName       = world.name?.en || world.id || 'unknown';
  const universeEssence = universe?.soul?.essence || '';
  const universeMood    = universe?.art?.mood      || 'cosmic';
  const worldDesc       = world.desc?.en           || world.name?.en || '';
  const worldDifficulty = world.difficulty         || 'medium';

  logger.info('[INFO] World Senses Agent started', { world: worldName });

  const soul    = soulContext('worldSensesAgent');
  const context = `
الكون: "${universe?.name?.en || 'Unknown'}"
جوهر الكون: "${universeEssence}"
المزاج: "${universeMood}"
العالم: "${worldName}" — ${worldDesc} — صعوبة: ${worldDifficulty}`;

  // ══════════════════════════════════════
  // استدعاء ١ — noise + audio
  // ══════════════════════════════════════
  let noise = null;
  let audio = null;

  try {
    const r1 = await askGemini(`
${soul}
${context}

ولّد noise و audio لهذا العالم فقط. لا shader.

أنتج JSON فقط:
{
  "noise": {
    "frequency":   0.05,
    "amplitude":   1.0,
    "octaves":     4,
    "persistence": 0.5,
    "lacunarity":  2.0,
    "seed":        12345,
    "type":        "simplex | perlin | cellular | value",
    "description": "وصف موجز للتضاريس"
  },
  "audio": {
    "ambience":    "وصف الصوت المحيطي",
    "music_tempo": "slow | medium | fast | chaotic",
    "music_mood":  "epic | mysterious | melancholic | intense | peaceful | eerie",
    "instruments": ["..."],
    "sfx":         ["..."],
    "description": "وصف البيئة الصوتية"
  }
}`, 0.85, { topP: 0.95, maxOutputTokens: 2048 });

    noise = r1.noise || null;
    audio = r1.audio || null;

  } catch (err) {
    logger.warn('[WARN] noise+audio failed — using fallback', { error: err.message });
  }

  // ══════════════════════════════════════
  // استدعاء ٢ — shader
  // ══════════════════════════════════════
  let shader = null;

  try {
    const r2 = await askGemini(`
${soul}
${context}

اكتب shader لـ Godot 4.6.2 لهذا العالم.
النوع المناسب: sky | fog | void | crystal | fire | water | storm

القواعد:
- shader_type spatial أو sky حسب النوع
- كود GLSL صالح لـ Godot 4.6.2
- لا تستخدم VEC_DIR أو FRAGMENT_COORD مباشرة بدون تعريف
- استخدم TIME و UV و SCREEN_UV للتأثيرات الحركية

أنتج JSON فقط:
{
  "shader": {
    "type":        "sky | fog | void | crystal | fire | water | storm",
    "code":        "shader_type spatial;\n...",
    "parameters":  { "param_name": "default_value" },
    "description": "وصف موجز للتأثير البصري"
  }
}`, 0.7, { topP: 0.9, maxOutputTokens: 4096 });

    shader = r2.shader || null;

  } catch (err) {
    logger.warn('[WARN] shader failed — using fallback', { error: err.message });
  }

  // ══════════════════════════════════════
  // دمج النتائج
  // ══════════════════════════════════════
  const fallback = buildFallback(world, universeMood);

  const result = {
    noise:  noise  || fallback.noise,
    shader: shader || fallback.shader,
    audio:  audio  || fallback.audio,
  };

  logger.info('[OK] World senses generated', {
    world:      worldName,
    noiseType:  result.noise.type,
    shaderType: result.shader.type,
    musicMood:  result.audio.music_mood,
    usedFallback: {
      noise:  !noise,
      shader: !shader,
      audio:  !audio,
    },
  });

  return result;
}

// ── fallback آمن ─────────────────────────
function buildFallback(world, mood) {
  const seed = Math.floor(Math.random() * 99999);
  return {
    noise: {
      frequency:   0.05,
      amplitude:   1.0,
      octaves:     4,
      persistence: 0.5,
      lacunarity:  2.0,
      seed,
      type:        'simplex',
      description: `Default terrain for ${world.name?.en || 'world'}`,
    },
    shader: {
      type:        mood === 'fire' ? 'fire' : mood === 'ice' ? 'crystal' : 'void',
      code:        'shader_type spatial;\nrender_mode unshaded;\nvoid fragment() { ALBEDO = vec3(0.02, 0.0, 0.05); }',
      parameters:  {},
      description: `Default ${mood} shader`,
    },
    audio: {
      ambience:    'gentle wind and distant echoes',
      music_tempo: 'medium',
      music_mood:  'mysterious',
      instruments: ['synthesizer', 'ambient_pad'],
      sfx:         ['wind', 'footsteps'],
      description: `Default audio for ${world.name?.en || 'world'}`,
    },
  };
}
