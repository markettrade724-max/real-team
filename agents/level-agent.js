import { askGemini } from './_gemini.js';
import { logger }    from '../logger.js';

export async function run(idea, story) {
  const levels = await askGemini(`
Design 5 progressive levels for the game "${idea.name?.en}" (type: ${idea.type}).
Objective: ${story?.objective || idea.concept}
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
}`, 0.8);

  levels.generatedAt = new Date().toISOString();
  logger.info('Levels generated', { gameId: idea.id, total: levels.totalLevels });
  return levels;
}
