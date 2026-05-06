import { askGemini } from './_gemini.js';
import { logger }    from '../logger.js';

// مستويات احتياطية في حال فشل التوليد
function fallbackLevels(idea) {
  return {
    gameId: idea.id,
    totalLevels: 5,
    emojis: ['🎮','🧩','⭐','🔮','💎'],
    levels: [
      { number:1, name:{ar:'المستوى الأول',en:'Level 1'}, difficulty:'easy',   pairs:4,  timeLimit:60 },
      { number:2, name:{ar:'المستوى الثاني',en:'Level 2'}, difficulty:'medium', pairs:6,  timeLimit:50 },
      { number:3, name:{ar:'المستوى الثالث',en:'Level 3'}, difficulty:'medium', pairs:8,  timeLimit:45 },
      { number:4, name:{ar:'المستوى الرابع',en:'Level 4'}, difficulty:'hard',   pairs:10, timeLimit:40 },
      { number:5, name:{ar:'المستوى الخامس',en:'Level 5'}, difficulty:'expert', pairs:12, timeLimit:35 },
    ],
    generatedAt: new Date().toISOString(),
  };
}

export async function run(idea, story) {
  logger.info('Generating levels', { gameId: idea.id });

  let levels;
  try {
    levels = await askGemini(`
Design 5 progressive levels for the game "${idea.name?.en}" (type: ${idea.type}).
Objective: ${story?.objective || idea.concept || 'Provide increasing challenge'}
Return ONLY valid JSON:
{
  "gameId": "${idea.id}",
  "totalLevels": 5,
  "emojis": ["e1","e2","e3","e4","e5","e6","e7","e8","e9","e10","e11","e12"],
  "levels": [
    { "number":1, "name":{"ar":"","en":""}, "difficulty":"easy",   "pairs":4,  "timeLimit":60 },
    { "number":2, "name":{"ar":"","en":""}, "difficulty":"medium", "pairs":6,  "timeLimit":50 },
    { "number":3, "name":{"ar":"","en":""}, "difficulty":"medium", "pairs":8,  "timeLimit":45 },
    { "number":4, "name":{"ar":"","en":""}, "difficulty":"hard",   "pairs":10, "timeLimit":40 },
    { "number":5, "name":{"ar":"","en":""}, "difficulty":"expert", "pairs":12, "timeLimit":35 }
  ]
}`, 0.7);
  } catch (err) {
    logger.error('Gemini failed to generate levels, using fallback', { error: err.message });
    return fallbackLevels(idea);
  }

  // التحقق من صحة البيانات الأساسية
  if (!levels || typeof levels !== 'object') {
    logger.warn('Invalid levels object from Gemini, using fallback');
    return fallbackLevels(idea);
  }

  // التأكد من وجود المصفوفة وعددها 5
  if (!Array.isArray(levels.levels) || levels.levels.length < 5) {
    logger.warn('Levels array missing or incomplete, using fallback');
    return fallbackLevels(idea);
  }

  // التأكد من وجود emojis مصفوفة
  if (!Array.isArray(levels.emojis)) {
    levels.emojis = ['🎮','🧩','⭐','🔮','💎'];
  }

  // إضافة الطابع الزمني
  levels.generatedAt = new Date().toISOString();

  logger.info('Levels generated successfully', { gameId: idea.id, total: levels.totalLevels });
  return levels;
}
