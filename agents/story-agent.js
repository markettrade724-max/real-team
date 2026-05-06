import { askGemini } from './_gemini.js';
import { logger }    from '../logger.js';

/**
 * قصة احتياطية تُستخدم إذا فشل Gemini في التوليد
 */
function fallbackStory(idea) {
  return {
    gameId: idea.id,
    setting: 'A mysterious universe full of wonders',
    mainCharacter: {
      name: 'Hero',
      emoji: '🦸',
      description: 'A brave adventurer ready to face any challenge',
    },
    villain: {
      name: 'Shadow Lord',
      emoji: '👾',
      description: 'A dark force threatening the galaxy',
    },
    objective: 'Overcome obstacles and reach the final goal',
    intro: {
      ar: 'انطلق في مغامرة ملحمية لإنقاذ العالم!',
      en: 'Embark on an epic adventure to save the world!',
    },
    winMessage: {
      ar: 'لقد انتصرت! أعدت السلام إلى الكون.',
      en: 'You triumphed! Peace is restored to the universe.',
    },
    loseMessage: {
      ar: 'سقطت في المعركة... لكن الأمل لا يزال حياً.',
      en: 'You fell in battle... but hope still lives.',
    },
    generatedAt: new Date().toISOString(),
  };
}

export async function run(idea) {
  logger.info('Generating story', { gameId: idea.id });

  let story;
  try {
    story = await askGemini(`
Write a short story for the game "${idea.name?.en}" (type: ${idea.type}).
Concept: ${idea.concept || 'An exciting journey'}
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
  } catch (err) {
    logger.error('Story generation failed, using fallback', { error: err.message });
    return fallbackStory(idea);
  }

  // التحقق من صحة البيانات المستلمة
  if (!story || typeof story !== 'object') {
    logger.warn('Invalid story object from Gemini, using fallback');
    return fallbackStory(idea);
  }

  // التأكد من وجود حقل intro و winMessage (على الأقل)
  if (!story.intro || !story.intro.en || !story.intro.ar) {
    logger.warn('Story missing intro, using fallback');
    return fallbackStory(idea);
  }

  // إضافة الطابع الزمني
  story.generatedAt = new Date().toISOString();

  logger.info('Story generated', { gameId: idea.id, hero: story.mainCharacter?.name });
  return story;
}
