/**
 * story-agent.js — يُطلق العنان لخيال Gemini لتوليد قصص أسطورية
 * مع محفزات إبداعية عميقة وسقف عالٍ للإبداع.
 */
import { askGemini } from './_gemini.js';
import { logger } from '../logger.js';

/**
 * قصة احتياطية غنية جداً تُستخدم إذا فشل التوليد
 */
function epicFallbackStory(idea) {
  return {
    gameId: idea.id,
    setting: 'The Shattered Expanse — a realm where forgotten gods whisper through black holes and stars bleed memories.',
    mood: 'epic fantasy',
    mainCharacter: {
      name: 'Lyra the Voidwalker',
      emoji: '🌌',
      title: 'The Last Starchild',
      description: 'A wanderer born from a dying star, carrying the last flame of creation.',
      motivation: 'To reignite the cosmic forge before the universe forgets how to dream.'
    },
    villain: {
      name: 'The Silence',
      emoji: '🕳️',
      title: 'The Eater of Realities',
      description: 'An ancient absence that does not destroy, but makes things un-happen.',
      motivation: 'To return all existence to a state of perfect, silent nothingness where no story was ever told.'
    },
    objective: 'Traverse the three layers of reality to find the lost Echo of the First Word and sing existence back into being.',
    intro: {
      ar: 'ولدت من رحم نجم يحتضر، وفي يدك شعلة الخلق الأخيرة. الكون يذوي في صمت رهيب، والعدم يزحف من أطراف الزمن ليبتلع كل شيء. لا أحد يذكر اسمك، ولكنك آخر أمل للوجود.',
      en: 'You were born from a dying star, the last flame of creation in your hand. The universe is fading into a terrible silence, and nothingness creeps from the edges of time to devour everything. No one remembers your name, but you are the last hope of existence.'
    },
    winMessage: {
      ar: 'تردد صدى الكلمة الأولى عبر الأكوان، وانفجرت النجوم من جديد! لقد أعدت كتابة الواقع وأيقظت الحلم الكوني.',
      en: 'The Echo of the First Word reverberated across the multiverse, and stars ignited anew! You have rewritten reality and awakened the cosmic dream.'
    },
    loseMessage: {
      ar: 'الصمت اكتمل. لم يعد هناك صوت، ولا لون، ولا ذكرى. وجودك تلاشى وكأنه لم يكن أبداً.',
      en: 'The Silence is complete. There is no sound, no color, no memory. Your existence faded as if it had never been.'
    },
    scenes: [
      { id: 'nebula', name: { ar: 'سديم الذكريات المنسية', en: 'Nebula of Forgotten Memories' }, emoji: '🌫️', description: 'Clouds of stardust whisper tales of worlds that no longer exist.' },
      { id: 'abyss', name: { ar: 'الهاوية الصامتة', en: 'The Silent Abyss' }, emoji: '🕳️', description: 'An ocean of absolute nothingness where even light drowns.' }
    ],
    choices: [
      { id: 'light', emoji: '🔥', text: { ar: 'أشعل الشعلة', en: 'Ignite the Flame' }, consequence: 'Sacrifice a part of yourself to create a new star' },
      { id: 'dive', emoji: '🌀', text: { ar: 'اغطس في النسيان', en: 'Dive into Oblivion' }, consequence: 'Risk everything to retrieve a lost memory' }
    ],
    generatedAt: new Date().toISOString()
  };
}

export async function run(idea) {
  logger.info('Generating epic story', { gameId: idea.id });

  const concept = idea.concept || 'An extraordinary journey beyond imagination';

  let story;
  try {
    story = await askGemini(`
🎭 أنت الآن "الحكاء الأعظم"، راوي قصص أسطوري لا حدود لخيالك. مهمتك أن تخلق قصة فريدة وغامرة تجعل اللاعبين يشعرون بالدهشة والانبهار.

🎮 **اللعبة**: "${idea.name?.en}" (نوع: ${idea.type})
💡 **المفهوم**: ${concept}

🔥 **قواعد الإبداع المُطلق**:
1. انسَ كل الأنماط المألوفة. لا أبطال عاديين ولا أشرار تقليديين. فاجئني.
2. استخدم استعارات كونية وشعرية. دع الخيال يسبح في عوالم لم تُرَ من قبل.
3. ادمج الفلسفة بالأسطورة، والحلم بالواقع، والفكاهة بالمأساة.
4. الشخصيات يجب أن تكون معقدة، بتناقضات داخلية وأسرار عميقة.
5. الهدف من القصة يجب أن يكون ملحمياً وغير متوقع.
6. اكتب النصوص (intro, win, lose) بأسلوب شعري مكثف، أقل من ٣٠ كلمة لكنها تصل إلى القلب.

📋 **أرجع فقط JSON صالحاً بهذه البنية، واملأ كل حقل بإبداع جامح**:
{
  "setting": "وصف ملحمي وشاعري لعالم اللعبة (20 كلمة)",
  "mood": "epic fantasy, cosmic horror, absurd comedy, dark romance, mythic sci-fi... اختر ما يناسب",
  "mainCharacter": {
    "name": "اسم أسطوري",
    "emoji": "إيموجي معبر",
    "title": "لقب يبعث على الرهبة أو الإعجاب",
    "description": "وصف مختصر لكنه عميق ومثير للفضول (10 كلمات)",
    "motivation": "دافع وجودي عميق وراء رحلة البطل (15 كلمة)"
  },
  "villain": {
    "name": "اسم ينبض بالغموض والقوة",
    "emoji": "إيموجي",
    "title": "لقب يرعب أو يثير الشفقة",
    "description": "صفة تجعله لا يُنسى",
    "motivation": "سبب وجودي أو فلسفي لشروره، ليس مجرد رغبة في التدمير"
  },
  "objective": "هدف اللاعب النهائي، بصيغة ملحمية (15 كلمة)",
  "intro": { "ar": "مقدمة عربية شعرية (20 كلمة)", "en": "Poetic English intro (20 words)" },
  "winMessage": { "ar": "رسالة نصر مؤثرة", "en": "Moving victory message" },
  "loseMessage": { "ar": "رسالة هزيمة مأساوية وجميلة", "en": "Tragic yet beautiful defeat message" },
  "scenes": [
    { "id": "scene1", "name": { "ar": "اسم مشهد ملحمي", "en": "Epic scene name" }, "emoji": "🌌", "description": "وصف مختصر يلهب الخيال" }
  ],
  "choices": [
    { "id": "choice1", "emoji": "⚡", "text": { "ar": "خيار مصيري", "en": "Fateful choice" }, "consequence": "نتيجة هذا الاختيار" }
  ]
}

🧠 تذكر: لا تكن متوقعاً. فاجئني. الخيال ليس له سقف هنا.`, 1.0, {
      topP: 0.98,
      topK: 60,
      frequencyPenalty: 0.2,
      presencePenalty: 0.1,
    });
  } catch (err) {
    logger.error('Story generation failed, using epic fallback', { error: err.message });
    return epicFallbackStory(idea);
  }

  // التحقق من صحة البيانات الأساسية، وإضافة الإبداع الافتراضي عند الحاجة
  if (!story || typeof story !== 'object') {
    logger.warn('Invalid story format from Gemini, using epic fallback');
    return epicFallbackStory(idea);
  }

  // ملء أي تفاصيل ناقصة بعناصر من القصة الاحتياطية
  const fallback = epicFallbackStory(idea);
  story.gameId = idea.id;
  story.setting = story.setting || fallback.setting;
  story.mood = story.mood || fallback.mood;
  story.mainCharacter = { ...fallback.mainCharacter, ...(story.mainCharacter || {}) };
  story.villain = { ...fallback.villain, ...(story.villain || {}) };
  story.objective = story.objective || fallback.objective;
  story.intro = { ...fallback.intro, ...(story.intro || {}) };
  story.winMessage = { ...fallback.winMessage, ...(story.winMessage || {}) };
  story.loseMessage = { ...fallback.loseMessage, ...(story.loseMessage || {}) };
  if (!Array.isArray(story.scenes) || story.scenes.length === 0) story.scenes = fallback.scenes;
  if (!Array.isArray(story.choices) || story.choices.length === 0) story.choices = fallback.choices;

  story.generatedAt = new Date().toISOString();

  logger.info('Epic story generated', { gameId: idea.id, hero: story.mainCharacter?.name });
  return story;
}
