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
import { readForAgent } from './library-builder-agent.js';

// ════════════════════════════════════════════════════════════
// الدالة الرئيسية
// ════════════════════════════════════════════════════════════
export async function run(universe) {
  const library = readForAgent('world-birth-agent', 15);
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
  logger.info('[BIRTH] Generating world core...');
  let worldCore = null;
  let attempts  = 0;

  while (!worldCore && attempts < 3) {
    attempts++;
    try {
      worldCore = await askGemini(`
${soul}
${context}

ابنِ عالماً فريداً مستوحى من Dark Souls و Hollow Knight.
القانون الذهبي: البيئة تروي القصة.

أنتج JSON فقط:
{
  "id": "world-${worldNum}",
  "dayNumber": ${dayOfYear},
  "chapter": ${chapter},
  "chapterName": "${chapterName}",
  "name": { "ar": "", "en": "" },
  "essence": "جوهر العالم في كلمة أو اثنتين",
  "physicsLaw": "القانون الفيزيائي الفريد",
  "atmosphere": "وصف شاعري للمكان",
  "secret": "السر الذي يغير كل شيء",
  "difficulty": "easy | medium | hard | expert",
  "backgroundColor": "#000000",
  "fogColor": "#000000",
  "lightColor": "#ffffff"
}`, 0.9, { topP: 0.97, maxOutputTokens: 1024 });

    } catch (err) {
      logger.warn(`[WARN] Core attempt ${attempts}/3 failed`, { error: err.message });
      if (attempts < 3) await new Promise(r => setTimeout(r, 20000));
    }
  }

  if (!worldCore?.name?.en) {
    logger.error('[ERROR] World core generation failed');
    return null;
  }

  logger.info('[OK] World core ready', { name: worldCore.name?.en });

  // ── استدعاء ٢ — الأعداء + السلاح + المركبة ──
  logger.info('[BIRTH] Generating world elements...');
  let elements = null;

  try {
    elements = await askGemini(`
${soul}

العالم: "${worldCore.name?.en}"
جوهره: "${worldCore.essence}"
قانونه: "${worldCore.physicsLaw}"
روح الكون: "${universe.soul?.essence?.slice(0,80)}"

اخترع الأعداء والسلاح لهذا العالم. كل شيء يجب أن يعكس قانون العالم.
مثل Hollow Knight: عدو يتجمد عند الهجوم في عالم الجليد.

أنتج JSON فقط:
{
  "enemies": [
    {
      "id": "enemy-${worldNum}-1",
      "name": { "ar": "", "en": "" },
      "concept": "لماذا موجود هنا",
      "behavior": "كيف يتصرف",
      "weakness": "نقطة ضعفه",
      "lore": "من كان قبل أن يصبح عدواً",
      "speed": 1.0, "health": 100.0, "damage": 15.0, "count": 5
    },
    {
      "id": "enemy-${worldNum}-2",
      "name": { "ar": "", "en": "" },
      "concept": "النوع الأصعب",
      "behavior": "سلوك مختلف",
      "weakness": "ضعف مختلف",
      "lore": "قصة مختلفة",
      "speed": 0.7, "health": 200.0, "damage": 30.0, "count": 2
    }
  ],
  "weapon": {
    "id": "weapon-${worldNum}",
    "name": { "ar": "", "en": "" },
    "concept": "فلسفة السلاح",
    "visualDesc": "شكله ولونه",
    "sound": "صوته",
    "effect": "ماذا يفعل للعدو",
    "sideEffect": "أثر جانبي",
    "mechanic": "الميكانيكية الفريدة",
    "damage": 25.0, "fireRate": 1.5, "bulletSpeed": 20.0,
    "rarity": "rare"
  },
  "vehicle": null
}`, 0.85, { topP: 0.95, maxOutputTokens: 2048 });

  } catch (err) {
    logger.warn('[WARN] Elements generation failed', { error: err.message });
    elements = { enemies: [], weapon: null, vehicle: null };
  }

  // ── دمج العالم الكامل ──
  let worldData = {
    ...worldCore,
    enemies: elements?.enemies || [],
    weapon:  elements?.weapon  || null,
    vehicle: elements?.vehicle || null,
  };

  logger.info('[OK] World ready', {
    name:    worldData.name?.en,
    enemies: worldData.enemies?.length || 0,
    weapon:  worldData.weapon?.name?.en || 'none',
    vehicle: worldData.vehicle?.name?.en || 'none',
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
