/**
 * world-birth-agent.js — وكيل ولادة العالم الكامل
 *
 * يولد عالماً متكاملاً في استدعاءين فقط:
 *  - استدعاء ١: العالم + أعداؤه + سلاحه + مركبته
 *  - استدعاء ٢: noise + shader + audio
 *
 * مستوحى من:
 *  - Dark Souls    → كل عنصر يروي نفس القصة
 *  - No Man's Sky  → البيئة هي العدو الأول
 *  - Hollow Knight → الميكانيكية تعكس روح المنطقة
 *  - Zelda BotW    → قوانين الفيزياء تؤثر على كل شيء
 *  - Hades         → الأعداء ليسوا عقبات — هم جزء من القصة
 */

import { askGemini }  from './_gemini.js';
import { soulContext } from './_soul.js';
import { logger }      from '../logger.js';

// ════════════════════════════════════════════════════════════
// الدالة الرئيسية
// ════════════════════════════════════════════════════════════
export async function run(universe) {
  logger.info('[BIRTH] World birth started', {
    universeId: universe.id,
    worldsCount: universe.worlds?.length || 0,
  });

  const soul       = soulContext('worldBirthAgent');
  const dayOfYear  = getDayOfYear();
  const worldNum   = (universe.worlds?.length || 0) + 1;
  const chapter    = Math.ceil(worldNum / 30);
  const chapterName = getChapterName(chapter);

  // السياق المشترك
  const context = buildContext(universe, worldNum, chapter, chapterName, dayOfYear);

  // ══════════════════════════════════════
  // استدعاء ١ — العالم الكامل مع عناصره
  // ══════════════════════════════════════
  logger.info('[BIRTH] Generating world with all elements...');
  let worldData = null;

  try {
    worldData = await askGemini(`
${soul}

${context}

أنت مصمم ألعاب عبقري. ابنِ عالماً متكاملاً كما في Dark Souls و Hollow Knight.

القانون الذهبي: كل عنصر يجب أن يروي نفس القصة.
البيئة ← الأعداء ← السلاح ← المركبة — كلها وجه واحد.

مثال على التناسق:
- عالم الجليد → أعداء يتجمدون عند الهجوم → سلاح يكسر الجليد → مركبة تنزلق على الجليد
- عالم الذاكرة → أعداء يسرقون ذكرياتك → سلاح يعيد الذكريات المسروقة → لا مركبة (الذاكرة لا تتحرك)

أنتج JSON فقط:
{
  "id": "world-${worldNum}",
  "dayNumber": ${dayOfYear},
  "chapter": ${chapter},
  "chapterName": "${chapterName}",
  "name": { "ar": "", "en": "" },
  "essence": "جوهر العالم في كلمة أو اثنتين",
  "physicsLaw": "القانون الفيزيائي الفريد الذي يحكم هذا العالم",
  "atmosphere": "وصف شاعري غني للمكان — ما تراه وتشمه وتحسه",
  "secret": "السر الذي يغير كل شيء حين تكتشفه",
  "difficulty": "easy | medium | hard | expert",
  "backgroundColor": "#000000",
  "fogColor": "#000000",
  "lightColor": "#ffffff",

  "enemies": [
    {
      "id": "enemy-${worldNum}-1",
      "name": { "ar": "", "en": "" },
      "concept": "لماذا هذا العدو موجود في هذا العالم تحديداً",
      "behavior": "كيف يتصرف — ليس فقط الهجوم بل الطريقة التي يروي بها القصة",
      "weakness": "نقطة ضعفه المرتبطة بقانون العالم",
      "lore": "من كان هذا العدو قبل أن يصبح عدواً",
      "speed": 1.0,
      "health": 100.0,
      "damage": 15.0,
      "count": 5
    },
    {
      "id": "enemy-${worldNum}-2",
      "name": { "ar": "", "en": "" },
      "concept": "النوع الثاني — أصعب وأكثر تعقيداً",
      "behavior": "سلوك مختلف تماماً عن الأول",
      "weakness": "نقطة ضعف مختلفة",
      "lore": "قصة مختلفة",
      "speed": 0.7,
      "health": 200.0,
      "damage": 30.0,
      "count": 2
    }
  ],

  "weapon": {
    "id": "weapon-${worldNum}",
    "name": { "ar": "", "en": "" },
    "concept": "لماذا هذا السلاح موجود في هذا العالم — فلسفته",
    "visualDesc": "شكله ولونه وكيف يتحرك — مرتبط ببيئة العالم",
    "sound": "صوته حين يُستخدم — يعكس روح العالم",
    "effect": "ماذا يفعل للعدو — ليس الضرر فقط بل التحول",
    "sideEffect": "أثر جانبي غير متوقع — مرتبط بقانون العالم",
    "mechanic": "الميكانيكية الفريدة التي تجعله مختلفاً عن كل سلاح آخر",
    "damage": 25.0,
    "fireRate": 1.5,
    "bulletSpeed": 20.0,
    "rarity": "rare"
  },

  "vehicle": null
}

ملاحظة: vehicle يكون null إذا لم يكن منطقياً في هذا العالم.
إذا كان منطقياً، اجعله:
{
  "id": "vehicle-${worldNum}",
  "name": { "ar": "", "en": "" },
  "concept": "لماذا هذه المركبة تنتمي لهذا العالم",
  "ability": "قدرة خاصة مرتبطة بقانون العالم",
  "speed": 1.5
}`, 0.9, { topP: 0.97, maxOutputTokens: 4096 });

  } catch (err) {
    logger.error('[ERROR] World generation failed', { error: err.message });
    return null;
  }

  if (!worldData?.name?.en) {
    logger.error('[ERROR] Invalid world data received');
    return null;
  }

  logger.info('[OK] World generated', {
    name:     worldData.name?.en,
    enemies:  worldData.enemies?.length || 0,
    weapon:   worldData.weapon?.name?.en,
    vehicle:  worldData.vehicle?.name?.en || 'none',
  });

  // ══════════════════════════════════════
  // استدعاء ٢ — الحواس الحسية
  // ══════════════════════════════════════
  logger.info('[BIRTH] Generating world senses...');

  let senses = null;
  try {
    senses = await generateSenses(worldData, universe, soul);
  } catch (err) {
    logger.warn('[WARN] Senses generation failed — using fallback', { error: err.message });
    senses = buildSensesFallback(worldData, universe?.art?.mood || 'cosmic');
  }

  // ══════════════════════════════════════
  // تجميع العالم الكامل
  // ══════════════════════════════════════
  const world = {
    ...worldData,
    noise:   senses.noise,
    shader:  senses.shader,
    audio:   senses.audio,
    addedAt: new Date().toISOString(),
  };

  logger.info('[BIRTH] World birth complete', {
    id:      world.id,
    name:    world.name?.en,
    chapter: world.chapterName,
  });

  return world;
}

// ════════════════════════════════════════════════════════════
// توليد الحواس
// ════════════════════════════════════════════════════════════
async function generateSenses(world, universe, soul) {
  const result = await askGemini(`
${soul}

العالم: "${world.name?.en}"
جوهره: "${world.essence}"
قانونه: "${world.physicsLaw}"
مزاج الكون: "${universe?.art?.mood || 'cosmic'}"

ولّد noise و shader و audio متناسقة مع روح هذا العالم.

أنتج JSON فقط:
{
  "noise": {
    "frequency":   0.05,
    "amplitude":   1.0,
    "octaves":     4,
    "persistence": 0.5,
    "lacunarity":  2.0,
    "seed":        ${Math.floor(Math.random() * 99999)},
    "type":        "simplex | perlin | cellular | value",
    "description": "وصف التضاريس"
  },
  "shader": {
    "type":        "sky | void | crystal | fire | water | storm | fog",
    "code":        "shader_type spatial;\nrender_mode unshaded;\nvoid fragment() { ALBEDO = vec3(0.02, 0.0, 0.05); EMISSION = ALBEDO; }",
    "parameters":  {},
    "description": "وصف التأثير البصري"
  },
  "audio": {
    "ambience":    "الصوت المحيطي",
    "music_tempo": "slow | medium | fast | chaotic",
    "music_mood":  "epic | mysterious | melancholic | intense | peaceful | eerie",
    "instruments": ["..."],
    "sfx":         ["..."],
    "description": "وصف البيئة الصوتية"
  }
}`, 0.8, { topP: 0.9, maxOutputTokens: 3000 });

  return result;
}

// ════════════════════════════════════════════════════════════
// دوال مساعدة
// ════════════════════════════════════════════════════════════
function buildContext(universe, worldNum, chapter, chapterName, dayOfYear) {
  const existingWorlds = universe.worlds
    ?.slice(-3)
    .map(w => `"${w.name?.en}" — ${w.essence}`)
    .join('\n') || 'none';

  return `
الكون: "${universe.name?.en}"
روح الكون: "${universe.soul?.essence}"
المزاج البصري: "${universe.art?.mood}"
قوانين الكون: ${universe.soul?.rules?.slice(0,2).join(' | ')}

العالم رقم: ${worldNum} من 365
الفصل: ${chapter} — ${chapterName}
اليوم: ${dayOfYear}

آخر العوالم المولودة (لا تكرر نفس الثيم):
${existingWorlds}`;
}

function getChapterName(chapter) {
  const chapters = [
    'Genesis',    'Awakening',  'Fracture',  'The Descent',
    'Echoes',     'The Wound',  'Silence',   'The Return',
    'Convergence','The Choice', 'Resonance', 'Eternity',
  ];
  return chapters[(chapter - 1) % chapters.length];
}

function getDayOfYear() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.floor((now - start) / 86400000) + 1;
}

function buildSensesFallback(world, mood) {
  const seed = Math.floor(Math.random() * 99999);
  return {
    noise: {
      frequency: 0.05, amplitude: 1.0, octaves: 4,
      persistence: 0.5, lacunarity: 2.0, seed,
      type: 'simplex',
      description: `Default terrain for ${world.name?.en}`,
    },
    shader: {
      type: 'void',
      code: 'shader_type spatial;\nrender_mode unshaded;\nvoid fragment() { ALBEDO = vec3(0.02, 0.0, 0.05); EMISSION = ALBEDO; }',
      parameters: {},
      description: `Default ${mood} shader`,
    },
    audio: {
      ambience: 'distant echoes and cosmic hum',
      music_tempo: 'slow', music_mood: 'mysterious',
      instruments: ['synthesizer', 'ambient_pad'],
      sfx: ['wind', 'distant_rumble'],
      description: `Default audio for ${world.name?.en}`,
    },
  };
}
