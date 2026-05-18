/**
 * template-engineer.js
 * يختار القالب المناسب بدقة من بين 16 قالباً
 */
import { logger } from '../logger.js';

// ── خريطة القوالب الكاملة ────────────────
const TEMPLATES = {
  // ألعاب Godot 3D
  'godot-wrapper.html': {
    types:      ['godot'],
    categories: ['game'],
    genres:     ['fps', 'platformer', 'shooter', 'survival', 'exploration', 'racing'],
    desc:       'لعبة Godot 4.6.2 ثلاثية الأبعاد كاملة',
  },

  // ألعاب Phaser (جميع أنواع الأكشن)
  'phaser-game.html': {
    types:      ['phaser'],
    categories: ['game'],
    genres:     ['action', 'shooter', 'platformer', 'arcade'],
    desc:       'لعبة Phaser عامة للأكشن والأركيد',
  },
  'action-shooter.html': {
    types:      ['phaser'],
    categories: ['game'],
    genres:     ['shooter', 'action', 'combat'],
    desc:       'لعبة إطلاق نار وأكشن',
  },
  'adventure-rpg.html': {
    types:      ['phaser'],
    categories: ['game'],
    genres:     ['rpg', 'adventure', 'quest'],
    desc:       'لعبة مغامرة وتقمص أدوار',
  },
  'endless-runner.html': {
    types:      ['phaser'],
    categories: ['game'],
    genres:     ['runner', 'endless', 'arcade'],
    desc:       'لعبة ركض لا نهائي',
  },
  'racing-game.html': {
    types:      ['phaser'],
    categories: ['game'],
    genres:     ['racing', 'driving', 'speed'],
    desc:       'لعبة سباق وقيادة',
  },
  'sports-master.html': {
    types:      ['phaser'],
    categories: ['game'],
    genres:     ['sports', 'competition'],
    desc:       'لعبة رياضية تنافسية',
  },
  'block-blast.html': {
    types:      ['phaser'],
    categories: ['game'],
    genres:     ['puzzle', 'blocks', 'casual'],
    desc:       'لعبة تفجير المكعبات',
  },
  'alchemy-lab.html': {
    types:      ['phaser'],
    categories: ['game'],
    genres:     ['puzzle', 'craft', 'combine'],
    desc:       'لعبة دمج عناصر وكيمياء',
  },
  'word-scapes.html': {
    types:      ['phaser'],
    categories: ['game'],
    genres:     ['word', 'puzzle', 'language'],
    desc:       'لعبة كلمات ولغة',
  },

  // ألعاب الذاكرة
  'memory-game.html': {
    types:      ['phaser', 'html'],
    categories: ['game'],
    genres:     ['memory', 'match', 'cards'],
    desc:       'لعبة الذاكرة الكلاسيكية',
  },
  'Enhanced-memory-game.html': {
    types:      ['phaser', 'html'],
    categories: ['game'],
    genres:     ['memory', 'match', 'enhanced'],
    desc:       'لعبة ذاكرة محسّنة بمؤثرات بصرية',
  },

  // أدوات وتطبيقات
  'tool-app.html': {
    types:      ['tool', 'app'],
    categories: ['tool', 'utility'],
    genres:     ['utility', 'productivity'],
    desc:       'تطبيق أداة عام',
  },
  'Habit-tracker.html': {
    types:      ['tool', 'app'],
    categories: ['tool', 'health'],
    genres:     ['tracker', 'habits', 'productivity'],
    desc:       'متتبع العادات اليومية',
  },
  'Breathing-tool.html': {
    types:      ['tool', 'app'],
    categories: ['tool', 'health', 'wellness'],
    genres:     ['breathing', 'meditation', 'relaxation'],
    desc:       'أداة تمارين التنفس والاسترخاء',
  },
  'Sound-board.html': {
    types:      ['tool', 'app'],
    categories: ['tool', 'entertainment'],
    genres:     ['sound', 'music', 'audio'],
    desc:       'لوحة أصوات تفاعلية',
  },
};

// ── منطق الاختيار ────────────────────────
function selectTemplate(idea) {
  const type     = (idea.type     || '').toLowerCase();
  const category = (idea.category || '').toLowerCase();
  const genre    = (idea.genre    || '').toLowerCase();
  const tags     = (idea.tags     || []).map(t => t.toLowerCase());

  // 1. Godot — أولوية قصوى
  if (type === 'godot') {
    return 'godot-wrapper.html';
  }

  // 2. ابحث عن أفضل تطابق
  let bestMatch   = null;
  let bestScore   = 0;

  for (const [file, meta] of Object.entries(TEMPLATES)) {
    let score = 0;

    if (meta.types.includes(type))         score += 10;
    if (meta.categories.includes(category)) score += 5;
    if (meta.genres.includes(genre))        score += 8;

    // مطابقة التاغات
    for (const tag of tags) {
      if (meta.genres.includes(tag)) score += 3;
      if (meta.desc.toLowerCase().includes(tag)) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = file;
    }
  }

  // 3. إذا لم يوجد تطابق — قوالب افتراضية حسب النوع
  if (!bestMatch || bestScore === 0) {
    if (category === 'tool' || type === 'tool') return 'tool-app.html';
    if (type === 'phaser')                      return 'phaser-game.html';
    return 'phaser-game.html';
  }

  return bestMatch;
}

// ── run() ────────────────────────────────
export async function run(idea, story) {

  // Godot — بدون Gemini
  if (idea.type === 'godot') {
    logger.info('Template: godot-wrapper.html', { id: idea.id });
    return {
      templateFile: 'godot-wrapper.html',
      godotSlug:    idea.id,
      levels:       null,
      labels:       null,
    };
  }

  const templateFile = selectTemplate(idea);
  logger.info('Template selected', {
    id:       idea.id,
    type:     idea.type,
    genre:    idea.genre,
    template: templateFile,
  });

  return {
    templateFile,
    levels:  null,
    labels:  TEMPLATE_LABELS[templateFile] || null,
  };
}

// ── تسميات القوالب ───────────────────────
const TEMPLATE_LABELS = {
  'memory-game.html':          { start:'ابدأ', score:'النقاط', level:'المستوى', time:'الوقت', pairs:'أزواج' },
  'Enhanced-memory-game.html': { start:'ابدأ', score:'النقاط', level:'المستوى', time:'الوقت', pairs:'أزواج' },
  'action-shooter.html':       { start:'العب', score:'النقاط', level:'المرحلة', lives:'الأرواح', fire:'أطلق' },
  'adventure-rpg.html':        { start:'ابدأ المغامرة', score:'الخبرة', level:'المستوى', health:'الصحة' },
  'endless-runner.html':       { start:'ابدأ الركض', score:'المسافة', level:'السرعة' },
  'racing-game.html':          { start:'انطلق', score:'الوقت', level:'السباق', lap:'الجولة' },
  'sports-master.html':        { start:'العب', score:'النقاط', level:'المباراة' },
  'block-blast.html':          { start:'ابدأ', score:'النقاط', level:'المستوى' },
  'alchemy-lab.html':          { start:'اخلط', score:'الاكتشافات', level:'المرحلة' },
  'word-scapes.html':          { start:'ابدأ', score:'النقاط', level:'المستوى' },
  'phaser-game.html':          { start:'العب', score:'النقاط', level:'المرحلة' },
  'tool-app.html':             { start:'ابدأ', done:'تم', save:'حفظ' },
  'Habit-tracker.html':        { start:'تتبع', done:'أنجزت', save:'حفظ', streak:'الأيام' },
  'Breathing-tool.html':       { start:'ابدأ', inhale:'شهيق', exhale:'زفير', hold:'احبس' },
  'Sound-board.html':          { start:'شغّل', stop:'أوقف', volume:'الصوت' },
  'godot-wrapper.html':        { back:'رجوع' },
};
