/**
 * world-senses-agent.js
 * يولد الحواس الثلاث لكل عالم في استدعاء Gemini واحد:
 *  - noise  : معاملات التشويش الإجرائي
 *  - shader : الكود البصري لـ Godot 4.6.2
 *  - audio  : البيئة الصوتية والموسيقية
 *
 * القواعد المطبقة:
 *  - rule-056: قراءة soulContext
 *  - rule-087: askGemini(prompt, temperature, options)
 *  - rule-089: كل الردود JSON
 *  - rule-092: دمج الوكلاء الثلاثة في استدعاء واحد
 *  - rule-099: [INFO]/[OK]/[ERROR] بدون إيموجي
 */
import { askGemini }  from './_gemini.js';
import { soulContext } from './_soul.js';
import { logger }      from '../logger.js';

export async function run(universe, world) {
  const worldName = world.name?.en || world.id || 'unknown';
  logger.info('[INFO] World Senses Agent started', { world: worldName });

  const soul          = soulContext('worldSensesAgent');
  const universeEssence = universe?.soul?.essence || '';
  const universeMood    = universe?.art?.mood      || 'cosmic';
  const worldDifficulty = world.difficulty         || 'medium';
  const worldDesc       = world.desc?.en           || world.name?.en || '';

  try {
    const result = await askGemini(`
${soul}

أنت مصمم حواس الكون — تمنح كل عالم هويته الحسية الفريدة.

الكون: "${universe?.name?.en || 'Unknown Universe'}"
جوهر الكون: "${universeEssence}"
المزاج البصري: "${universeMood}"

العالم الحالي: "${worldName}"
وصفه: "${worldDesc}"
صعوبته: "${worldDifficulty}"

مهمتك: ولّد الحواس الثلاث لهذا العالم في JSON واحد.

القواعد:
- shader يجب أن يكون GDScript صالح لـ Godot 4.6.2 (ليس GLSL خام)
- noise يجب أن يحتوي على أرقام حقيقية قابلة للاستخدام مباشرة
- audio يجب أن يصف المشهد الصوتي بدقة كافية لتوجيه مولد الصوت
- كل حاسة يجب أن تعكس شخصية هذا العالم تحديداً — لا تكرر نفس القيم لكل عالم

أنتج JSON فقط:
{
  "noise": {
    "frequency":   0.0,
    "amplitude":   0.0,
    "octaves":     0,
    "persistence": 0.0,
    "lacunarity":  0.0,
    "seed":        0,
    "type":        "simplex | perlin | cellular | value",
    "description": "وصف موجز لطبيعة التضاريس"
  },
  "shader": {
    "type":        "sky | fog | ground | water | fire | void | crystal | storm",
    "code":        "extends ShaderMaterial\n...",
    "parameters":  { "param_name": "value" },
    "description": "وصف موجز للتأثير البصري"
  },
  "audio": {
    "ambience":    "وصف الصوت المحيطي",
    "music_tempo": "slow | medium | fast | chaotic",
    "music_mood":  "epic | mysterious | melancholic | intense | peaceful | eerie",
    "instruments": ["..."],
    "sfx":         ["أصوات تأثيرية مميزة لهذا العالم"],
    "description": "وصف شامل للبيئة الصوتية"
  }
}`, 0.85, { topP: 0.95, maxOutputTokens: 4096 });

    // التحقق من اكتمال الحواس الثلاث
    if (!result.noise || !result.shader || !result.audio) {
      logger.warn('[WARN] Incomplete senses — using fallback', { world: worldName });
      return buildFallback(world, universeMood);
    }

    logger.info('[OK] World senses generated', {
      world:       worldName,
      noiseType:   result.noise.type,
      shaderType:  result.shader.type,
      musicMood:   result.audio.music_mood,
    });

    return result;

  } catch (err) {
    logger.error('[ERROR] World senses failed', {
      world: worldName,
      error: err.message,
    });
    return buildFallback(world, universeMood);
  }
}

// ── fallback آمن عند فشل Gemini ──────────
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
      type:        mood === 'fire' ? 'fire' : mood === 'ice' ? 'crystal' : 'sky',
      code:        'extends ShaderMaterial\n# fallback shader',
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
