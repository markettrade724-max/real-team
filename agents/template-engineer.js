import { askGemini } from './_gemini.js'; // ← أضف هذا السطر
import { logger }    from '../logger.js';

// ... باقي الملف كما هو ولكن مع تعديل run()

export async function run(idea, story) {
  const templateFile = selectTemplate(idea);

  logger.info('Template selected', { id: idea.id, type: idea.type, template: templateFile });

  if (templateFile === 'memory-game.html' || templateFile === 'tool-app.html') {
    return {
      templateFile,
      levels: null,
      emojis: idea.emojis || [],
      labels: null,
    };
  }

  const storyContext = story ? `
Story setting: ${story.setting}
Main character: ${story.mainCharacter?.name || 'Hero'}
Objective: ${story.objective || 'Complete the adventure'}
` : '';

  let levelsData;
  try {
    const raw = await askGemini(buildLevelsPrompt(templateFile, idea, storyContext), 0.8);
    // askGemini قد تعيد نصاً
    levelsData = typeof raw === 'string' ? JSON.parse(raw) : raw;

    // تحقق من صحة المصفوفات
    if (!levelsData?.levels || !Array.isArray(levelsData.levels)) {
      throw new Error('Invalid levels data from Gemini');
    }
  } catch (err) {
    logger.warn('Gemini levels generation failed, using fallback', { error: err.message });
    levelsData = buildFallbackLevels(templateFile, idea);
  }

  return {
    templateFile,
    levels: levelsData.levels,
    emojis: levelsData.emojis || idea.emojis || [],
    labels: TEMPLATE_LABELS[templateFile] || null,
  };
}
