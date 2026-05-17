/**
 * soul-agent.js — يولد وثيقة الروح
 * تُقرأ من كل وكيل قبل أن يبدأ عمله
 */
import { askGemini } from './_gemini.js';
import { logger }    from '../logger.js';

export async function run(idea, story) {
  logger.info('Generating soul document', { gameId: idea.id });

  let soul;
  try {
    soul = await askGemini(`
أنت مهندس الأكوان. مهمتك كتابة "وثيقة الروح" لهذا الكون.
هذه الوثيقة ستُقرأ من كل وكيل في الفريق قبل أن يبدأ عمله.
إنها البوصلة التي تضمن أن كل شيء — الألوان، المستويات، الشخصيات، الحوارات — ينبع من نفس الروح.

اللعبة: "${idea.name?.en}"
الفكرة: ${idea.concept || idea.desc?.en}
${story ? `القصة: ${story.setting}
البطل: ${story.mainCharacter?.name} — ${story.mainCharacter?.motivation}
الشرير: ${story.villain?.name} — ${story.villain?.motivation}` : ''}

أنتج JSON فقط:
{
  "essence": "جوهر هذا الكون في جملة واحدة لا تُنسى",
  "feeling": "ما يشعر به اللاعب في اللحظة الأولى",
  "palette": "الألوان التي يتنفسها هذا الكون — ليست أكوادًا بل مشاعر",
  "sound": "كيف يبدو هذا الكون — ليس موسيقى بل وصف",
  "motion": "كيف تتحرك الأشياء في هذا الكون — بطيء، متوتر، طائر...",
  "rules": [
    "قانون كوني ١ — شيء ثابت لا يتغير في هذا الكون",
    "قانون كوني ٢",
    "قانون كوني ٣"
  ],
  "forbidden": [
    "شيء لا يجب أن يظهر أبداً في هذه اللعبة",
    "شيء آخر مرفوض كلياً"
  ],
  "forArtAgent":      "تعليمة واحدة للوكيل البصري — كيف يرسم هذا الكون",
  "forLevelAgent":    "تعليمة واحدة لوكيل المستويات — ما الشعور الذي يجب أن يتركه كل مستوى",
  "forStoryAgent":    "تعليمة واحدة لوكيل القصة — ما الخيط العاطفي الذي يربط كل شيء",
  "forGodotAgent":    "تعليمة واحدة لوكيل Godot — كيف يتصرف الكون حين يلمسه اللاعب",
  "forMarketingAgent":"تعليمة واحدة لوكيل التسويق — الكلمة التي تصف هذه اللعبة لشخص لم يرها"
}`, 0.95, { topP: 0.97, topK: 50 });
  } catch (err) {
    logger.error('Soul generation failed', { error: err.message });
    return fallbackSoul(idea);
  }

  if (!soul || typeof soul !== 'object') {
    logger.warn('Invalid soul document, using fallback');
    return fallbackSoul(idea);
  }

  soul.gameId      = idea.id;
  soul.generatedAt = new Date().toISOString();

  logger.info('Soul document ready', {
    gameId:  idea.id,
    essence: soul.essence?.slice(0, 60),
  });

  return soul;
}

function fallbackSoul(idea) {
  return {
    gameId:   idea.id,
    essence:  `A world where ${idea.concept || 'everything is possible'}`,
    feeling:  'Wonder and discovery',
    palette:  'Deep space blues and cosmic gold',
    sound:    'Distant echoes and soft resonance',
    motion:   'Fluid and purposeful',
    rules:    ['Every action has a consequence', 'The world remembers', 'Nothing is random'],
    forbidden:['Generic tropes', 'Predictable outcomes'],
    forArtAgent:       'Create visuals that feel alive and breathing',
    forLevelAgent:     'Each level should feel like a new discovery',
    forStoryAgent:     'Every character carries a secret worth finding',
    forGodotAgent:     'The world reacts to the player with intention',
    forMarketingAgent: 'Unforgettable',
    generatedAt: new Date().toISOString(),
  };
}
