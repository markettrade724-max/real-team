import { askGemini } from './_gemini.js';
import { logger }    from '../logger.js';

export async function run(idea) {
  const story = await askGemini(`
Write a short story for the game "${idea.name?.en}" (type: ${idea.type}).
Concept: ${idea.concept}
Return ONLY valid JSON:
{
  "gameId": "${idea.id}",
  "setting": "time and place",
  "mainCharacter": { "name": "", "emoji": "", "description": "" },
  "villain":       { "name": "", "emoji": "", "description": "" },
  "objective": "player goal",
  "intro":     { "ar": "", "en": "" },
  "winMessage":  { "ar": "", "en": "" },
  "loseMessage": { "ar": "", "en": "" }
}`, 0.9);

  story.generatedAt = new Date().toISOString();
  logger.info('Story generated', { gameId: idea.id, hero: story.mainCharacter?.name });
  return story;
}
