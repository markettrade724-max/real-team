/**
 * library-builder-agent.js — v3.2
 *
 * التغييرات عن v3.1:
 *  - حذف budget المحلي — _gemini.js يدير الحصة (rule-128)
 *  - استخدام canAfford('library') بدل loadBudget() المحلي
 *  - caller = 'library-builder-agent' لكل استدعاء
 *
 * القواعد المطبقة:
 *  rule-087 : askGemini(prompt, temp, options, caller)
 *  rule-097 : gemini-2.5-flash ثابت
 *  rule-098 : askGemini فقط
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-101 : maxOutputTokens
 *  rule-128 : caller logging
 *  rule-129 : byAgent مخصص لكل وكيل
 *  rule-153 : canAfford قبل البدء
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname }       from 'path';
import { fileURLToPath }       from 'url';
import { askGemini, canAfford, getRemainingQuota } from './_gemini.js';
import { logger }              from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIBRARY   = join(__dirname, '..', 'library');

// ════════════════════════════════════════════════════════════
// فهرس المراجع — 11 قسم، 66 مرجع
// ════════════════════════════════════════════════════════════
const REFERENCES = [
  // ── السيناريو والسرد ──────────────────
  { id:'mckee-story',            category:'screenwriting',    priority:1, title:'Story',                           author:'Robert McKee',       forAgents:['story-agent','content-agent','screenplay-agent'],          prompt:'أهم 20 قاعدة من Story لـ McKee في كتابة السيناريو الاحترافي' },
  { id:'field-screenplay',       category:'screenwriting',    priority:1, title:'Screenplay',                     author:'Syd Field',          forAgents:['story-agent','content-agent'],                             prompt:'أهم 20 قاعدة من Screenplay: البنية الثلاثية وتطور الشخصية' },
  { id:'vogler-writer-journey',  category:'screenwriting',    priority:1, title:"The Writer's Journey",           author:'Christopher Vogler', forAgents:['story-agent','world-birth-agent'],                         prompt:"أهم 20 مبدأ عن رحلة البطل وأنماط الشخصيات" },
  { id:'campbell-hero',          category:'screenwriting',    priority:1, title:'The Hero with a Thousand Faces', author:'Joseph Campbell',    forAgents:['story-agent','soul-agent'],                                prompt:'أهم 20 مرحلة من رحلة البطل مع أمثلة تطبيقية' },
  { id:'truby-anatomy',          category:'screenwriting',    priority:2, title:'The Anatomy of Story',           author:'John Truby',         forAgents:['story-agent','content-agent'],                             prompt:'أهم 22 خطوة في بناء القصص العميقة' },
  { id:'snyder-save-cat',        category:'screenwriting',    priority:2, title:'Save the Cat',                   author:'Blake Snyder',       forAgents:['story-agent','content-agent'],                             prompt:'أهم 20 قاعدة في كتابة السيناريو التجاري الناجح' },
  { id:'mamet-directing',        category:'screenwriting',    priority:3, title:'On Directing Film',              author:'David Mamet',        forAgents:['story-agent','trailer-agent'],                             prompt:'أهم 15 مبدأ في الإخراج والسرد البصري' },

  // ── تصميم الألعاب ─────────────────────
  { id:'schell-art',             category:'game-design',      priority:1, title:'The Art of Game Design',         author:'Jesse Schell',       forAgents:['world-birth-agent','inventor-agent','code-agent'],         prompt:'أهم 25 عدسة من The Art of Game Design لتصميم ألعاب استثنائية' },
  { id:'koster-fun',             category:'game-design',      priority:1, title:'A Theory of Fun',                author:'Raph Koster',        forAgents:['world-birth-agent','inventor-agent'],                      prompt:'أهم 20 مبدأ عن سيكولوجية المتعة في الألعاب' },
  { id:'fullerton-workshop',     category:'game-design',      priority:1, title:'Game Design Workshop',           author:'Tracy Fullerton',    forAgents:['world-birth-agent','code-agent'],                          prompt:'أهم 20 مبدأ عن بناء ميكانيكيات اللعب' },
  { id:'gdc-level-design',       category:'game-design',      priority:2, title:'GDC Level Design Talks',         author:'GDC',                forAgents:['world-birth-agent'],                                       prompt:'أهم 20 مبدأ من GDC عن تصميم المستويات والعوالم' },
  { id:'gdc-narrative',          category:'game-design',      priority:2, title:'GDC Narrative Design',           author:'GDC',                forAgents:['story-agent','world-birth-agent'],                         prompt:'أهم 20 درس من GDC عن السرد في الألعاب' },
  { id:'dark-souls-design',      category:'game-design',      priority:1, title:'Dark Souls Design Philosophy',   author:'FromSoftware GDC',   forAgents:['world-birth-agent','inventor-agent','soul-agent'],         prompt:'أهم 20 مبدأ في فلسفة Dark Souls: الصعوبة العادلة، السرد البيئي' },
  { id:'minecraft-proc-gen',     category:'game-design',      priority:2, title:'Procedural Generation in Minecraft',author:'Mojang GDC',      forAgents:['world-birth-agent','code-agent'],                          prompt:'أهم 20 درس في التوليد الإجرائي للعوالم' },
  { id:'rogers-level-up',        category:'game-design',      priority:2, title:'Level Up!',                      author:'Scott Rogers',       forAgents:['world-birth-agent','code-agent'],                          prompt:'أهم 20 قاعدة في تصميم مستويات الألعاب' },

  // ── السينما والإخراج ──────────────────
  { id:'brown-cinematography',   category:'cinematography',   priority:1, title:'Cinematography',                 author:'Blain Brown',        forAgents:['trailer-agent','content-agent'],                           prompt:'أهم 20 قاعدة عن لغة الكاميرا والإضاءة والتأطير' },
  { id:'murch-blink',            category:'cinematography',   priority:1, title:'In the Blink of an Eye',         author:'Walter Murch',       forAgents:['trailer-agent','content-agent'],                           prompt:'أهم 20 مبدأ عن المونتاج وإيقاع الصورة' },
  { id:'pixar-storytelling',     category:'cinematography',   priority:1, title:'Pixar Storytelling Rules',       author:'Pixar',              forAgents:['story-agent','content-agent','soul-agent'],                prompt:'قواعد Pixar الـ 22 في السرد القصصي' },
  { id:'miyazaki-worldbuilding', category:'cinematography',   priority:2, title:"Miyazaki's World Building",      author:'Studio Ghibli',      forAgents:['world-birth-agent','art-agent','soul-agent'],              prompt:'أهم 20 مبدأ في فلسفة Miyazaki' },
  { id:'kubrick-directing',      category:'cinematography',   priority:2, title:'Kubrick on Directing',           author:'Stanley Kubrick',    forAgents:['trailer-agent','content-agent'],                           prompt:'أهم 15 مبدأ في فلسفة Kubrick' },
  { id:'nolan-narrative',        category:'cinematography',   priority:3, title:'Nolan Narrative Techniques',     author:'Christopher Nolan', forAgents:['story-agent','trailer-agent'],                             prompt:'أهم 15 تقنية: البنية غير الخطية، الزمن، الغموض الذكي' },

  // ── علم النفس والسلوك ─────────────────
  { id:'cialdini-influence',     category:'psychology',       priority:1, title:'Influence',                      author:'Robert Cialdini',    forAgents:['content-agent','marketing-agent'],                         prompt:'أهم 20 مبدأ في التأثير والإقناع' },
  { id:'csikszentmihalyi-flow',  category:'psychology',       priority:1, title:'Flow',                           author:'Csikszentmihalyi',   forAgents:['world-birth-agent','inventor-agent','code-agent'],         prompt:'أهم 20 مبدأ في تصميم تجربة لعب تحقق الانغماس الكامل' },
  { id:'kahneman-thinking',      category:'psychology',       priority:2, title:'Thinking Fast and Slow',         author:'Daniel Kahneman',    forAgents:['content-agent','marketing-agent','story-agent'],           prompt:'أهم 20 مبدأ عن اتخاذ القرار والتحيزات' },
  { id:'jung-archetypes',        category:'psychology',       priority:2, title:'The Archetypes',                 author:'Carl Jung',          forAgents:['soul-agent','story-agent','world-birth-agent'],            prompt:'أهم 20 نمط أصيل عند Jung' },
  { id:'fogg-behavior',          category:'psychology',       priority:2, title:'Tiny Habits',                    author:'BJ Fogg',            forAgents:['content-agent','marketing-agent'],                         prompt:'أهم 15 مبدأ في تصميم سلوكيات المستخدم' },

  // ── الفلسفة والأساطير ─────────────────
  { id:'mythology-world',        category:'philosophy',       priority:1, title:'World Mythology Encyclopedia',   author:'Various',            forAgents:['soul-agent','world-birth-agent','story-agent'],            prompt:'أهم 25 أسطورة وقانون كوني لبناء عوالم أصيلة' },
  { id:'stoicism-meditations',   category:'philosophy',       priority:2, title:'Meditations',                    author:'Marcus Aurelius',    forAgents:['soul-agent','story-agent'],                                prompt:'أهم 20 مبدأ من Meditations' },
  { id:'taoism-tao',             category:'philosophy',       priority:2, title:'Tao Te Ching',                   author:'Laozi',              forAgents:['soul-agent','world-birth-agent'],                          prompt:'أهم 20 مبدأ من Tao Te Ching' },
  { id:'nietzsche-philosophy',   category:'philosophy',       priority:3, title:'Thus Spoke Zarathustra',         author:'Nietzsche',          forAgents:['soul-agent','story-agent'],                                prompt:'أهم 15 مفهوم من Nietzsche' },

  // ── الفن البصري ───────────────────────
  { id:'color-theory',           category:'visual-art',       priority:1, title:'Color Theory for Designers',     author:'Josef Albers',       forAgents:['art-agent','world-birth-agent'],                           prompt:'أهم 20 قاعدة في نظرية الألوان' },
  { id:'world-building',         category:'visual-art',       priority:1, title:'Practical Guide to World Building',author:'Patricia Leavy',   forAgents:['world-birth-agent','soul-agent'],                          prompt:'أهم 20 مبدأ في بناء العوالم' },
  { id:'concept-art',            category:'visual-art',       priority:2, title:'Concept Art for Games and Films', author:'Various',            forAgents:['art-agent','trailer-agent'],                               prompt:'أهم 20 مبدأ في Concept Art' },
  { id:'blizzard-art',           category:'visual-art',       priority:2, title:'Blizzard Art Direction',          author:'Blizzard GDC',       forAgents:['art-agent','world-birth-agent'],                           prompt:'أهم 20 مبدأ في فلسفة Blizzard البصرية' },
  { id:'ui-ux-games',            category:'visual-art',       priority:2, title:'UI/UX Design in Games',           author:'GDC',                forAgents:['code-agent','art-agent'],                                  prompt:'أهم 20 قاعدة في تصميم واجهات الألعاب' },

  // ── الصوت والموسيقى ───────────────────
  { id:'game-audio',             category:'audio',            priority:1, title:'Game Audio Implementation',      author:'Richard Stevens',    forAgents:['world-birth-agent','inventor-agent'],                      prompt:'أهم 20 مبدأ في تصميم الصوت للألعاب' },
  { id:'film-music',             category:'audio',            priority:1, title:'Film Music: A History',          author:'James Wierzbicki',   forAgents:['trailer-agent','content-agent'],                           prompt:'أهم 20 أسلوب في تأليف موسيقى الأفلام' },
  { id:'hans-zimmer',            category:'audio',            priority:2, title:'Hans Zimmer Masterclass',        author:'Hans Zimmer',        forAgents:['trailer-agent','world-birth-agent'],                       prompt:'أهم 20 درس من Zimmer' },
  { id:'adaptive-music',         category:'audio',            priority:2, title:'Adaptive Music in Games',        author:'GDC',                forAgents:['world-birth-agent','code-agent'],                          prompt:'أهم 15 تقنية للموسيقى التكيفية' },

  // ── التوليد الإجرائي ──────────────────
  { id:'proc-gen-book',          category:'procedural',       priority:1, title:'Procedural Generation in Game Design',author:'Shaker et al.', forAgents:['world-birth-agent','code-agent','inventor-agent'],         prompt:'أهم 20 خوارزمية في التوليد الإجرائي' },
  { id:'noise-algorithms',       category:'procedural',       priority:1, title:'Perlin Noise and World Generation',author:'Various',           forAgents:['world-birth-agent','code-agent'],                          prompt:'أهم 15 خوارزمية توليد عوالم' },
  { id:'ai-behavior-trees',      category:'procedural',       priority:2, title:'Behavior Trees for Game AI',     author:'GDC',                forAgents:['code-agent','world-birth-agent'],                          prompt:'أهم 20 مبدأ في بناء ذكاء اصطناعي للألعاب' },

  // ── التسويق والإنتاج ──────────────────
  { id:'indie-game-dev',         category:'production',       priority:1, title:'Indie Game Developer Handbook',  author:'Hill-Whittall',      forAgents:['roadmap-agent','marketing-agent'],                         prompt:'أهم 20 درس في إنتاج ونشر وتسويق الألعاب المستقلة' },
  { id:'content-creation',       category:'production',       priority:1, title:'YouTube and TikTok Strategy',    author:'Various Creators',   forAgents:['content-agent','marketing-agent'],                         prompt:'أهم 20 استراتيجية لصناعة محتوى ناجح' },
  { id:'purple-cow',             category:'production',       priority:2, title:'Purple Cow',                     author:'Seth Godin',         forAgents:['marketing-agent','inventor-agent'],                        prompt:'أهم 20 مبدأ في بناء منتج استثنائي' },
  { id:'game-monetization',      category:'production',       priority:2, title:'Game Monetization Strategies',   author:'GDC',                forAgents:['marketing-agent','roadmap-agent'],                         prompt:'أهم 20 استراتيجية لتحقيق الدخل من الألعاب' },
  { id:'itch-gumroad',           category:'production',       priority:2, title:'Selling on itch.io and Gumroad', author:'Various',            forAgents:['marketing-agent','inventor-agent'],                        prompt:'أهم 15 استراتيجية لبيع الألعاب الرقمية' },

  // ── تحليل الألعاب ─────────────────────
  { id:'dark-souls-analysis',    category:'analysis',         priority:1, title:'Dark Souls تحليل شامل',          author:'FromSoftware',       forAgents:['world-birth-agent','inventor-agent','soul-agent'],         prompt:'تحليل Dark Souls: الميكانيكيات، السرد البيئي، الصعوبة' },
  { id:'hollow-knight-analysis', category:'analysis',         priority:1, title:'Hollow Knight تحليل شامل',       author:'Team Cherry',        forAgents:['world-birth-agent','art-agent','story-agent'],            prompt:'تحليل Hollow Knight: بناء العالم، الغموض، الفن' },
  { id:'undertale-analysis',     category:'analysis',         priority:2, title:'Undertale تحليل سردي',           author:'Toby Fox',           forAgents:['story-agent','inventor-agent'],                            prompt:'تحليل Undertale: كسر القواعد السردية' },
  { id:'journey-analysis',       category:'analysis',         priority:2, title:'Journey تحليل تجربة',            author:'thatgamecompany',    forAgents:['soul-agent','world-birth-agent'],                          prompt:'تحليل Journey: التجربة العاطفية بدون كلمات' },
  { id:'celeste-analysis',       category:'analysis',         priority:2, title:'Celeste تحليل ميكانيكيات',       author:'Maddy Thorson',      forAgents:['code-agent','story-agent'],                               prompt:'تحليل Celeste: دمج الميكانيكيات مع القصة' },

  // ── الكتابة الإبداعية ─────────────────
  { id:'king-on-writing',        category:'creative-writing', priority:1, title:'On Writing',                     author:'Stephen King',       forAgents:['story-agent','content-agent'],                             prompt:'أهم 20 قاعدة في الكتابة الإبداعية' },
  { id:'sanderson-worldbuilding',category:'creative-writing', priority:1, title:'Sanderson Worldbuilding',        author:'Brandon Sanderson',  forAgents:['world-birth-agent','story-agent','soul-agent'],            prompt:'أهم 20 قانون في بناء أنظمة السحر والعوالم الخيالية' },
  { id:'show-dont-tell',         category:'creative-writing', priority:2, title:"Show Don't Tell Mastery",        author:'Various',            forAgents:['story-agent','content-agent','world-birth-agent'],         prompt:"أهم 20 تقنية في Show Don't Tell" },
  { id:'dialogue-craft',         category:'creative-writing', priority:2, title:'The Dialogue Craft',             author:'Various',            forAgents:['story-agent','content-agent'],                             prompt:'أهم 20 قاعدة في كتابة الحوار' },
];

// ════════════════════════════════════════════════════════════
// بناء الـ prompt
// ════════════════════════════════════════════════════════════
function buildPrompt(ref) {
  const agentBlocks = ref.forAgents.map(agent =>
    '"' + agent + '": {\n' +
    '        "topRules": ["القاعدة الأهم لـ ' + agent + '", "القاعدة الثانية", "القاعدة الثالثة"],\n' +
    '        "why": "لماذا هذا المرجع حيوي لـ ' + agent + ' تحديداً",\n' +
    '        "how": "كيف يطبق ' + agent + ' هذا المرجع في عمله اليومي",\n' +
    '        "prompt_injection": "جملة واحدة تُضاف لـ prompt الوكيل"\n' +
    '      }'
  ).join(',\n      ');

  return (
    'أنت خبير في ' + getCategoryLabel(ref.category) + '.\n\n' +
    'المرجع: "' + ref.title + '" لـ ' + ref.author + '\n\n' +
    'مهمتك: ' + ref.prompt + '\n\n' +
    'القواعد يجب أن تكون عملية ومخصصة لكل وكيل.\n\n' +
    'أنتج JSON فقط:\n' +
    '{\n' +
    '  "title":    "' + ref.title + '",\n' +
    '  "author":   "' + ref.author + '",\n' +
    '  "category": "' + ref.category + '",\n' +
    '  "summary":  "ملخص المرجع في جملتين",\n' +
    '  "coreRules": [{ "id": 1, "rule": "...", "essence": "...", "example": "..." }],\n' +
    '  "byAgent": {\n    ' + agentBlocks + '\n  }\n}'
  );
}

// ════════════════════════════════════════════════════════════
// الدالة الرئيسية
// ════════════════════════════════════════════════════════════
export async function run(targetCategory = null) {
  logger.info('[LIBRARY] v3.2 started', {
    total:     REFERENCES.length,
    category:  targetCategory || 'all',
    quotaLeft: getRemainingQuota(),
  });

  // rule-153: تحقق من الحصة
  if (!canAfford('library')) {
    logger.warn('[LIBRARY] Insufficient quota');
    return { built: 0, quotaLeft: 0 };
  }

  const categories = [...new Set(REFERENCES.map(r => r.category))];
  for (const cat of categories) mkdirSync(join(LIBRARY, cat), { recursive: true });

  const targets = REFERENCES
    .filter(r => !isBuilt(r.id, r.category))
    .filter(r => !targetCategory || r.category === targetCategory)
    .sort((a, b) => a.priority - b.priority);

  if (!targets.length) {
    logger.info('[LIBRARY] All references already built');
    return { built: 0, total: REFERENCES.length };
  }

  logger.info('[LIBRARY] Building ' + targets.length + ' references');

  let built = 0, skipped = 0;

  for (const ref of targets) {
    // تحقق من الحصة قبل كل طلب
    if (!canAfford('library')) {
      logger.warn('[LIBRARY] Quota reached — stopping');
      break;
    }

    logger.info('[LIBRARY] Processing: "' + ref.title + '" [p' + ref.priority + ']');

    try {
      const knowledge = await askGemini(
        buildPrompt(ref), 0.3,
        { maxOutputTokens: 4096, topP: 0.8 },
        'library-builder-agent'
      );

      if (!knowledge?.coreRules?.length || !knowledge?.byAgent) {
        logger.warn('[WARN] Invalid structure for ' + ref.id);
        skipped++;
        continue;
      }

      const path = join(LIBRARY, ref.category, ref.id + '.json');
      writeFileSync(path, JSON.stringify({
        ...knowledge,
        id:       ref.id,
        priority: ref.priority,
        builtAt:  new Date().toISOString(),
      }, null, 2), 'utf8');

      built++;
      updateIndex(ref, knowledge.coreRules.length);
      logger.info('[OK] "' + ref.title + '" — ' + knowledge.coreRules.length + ' rules — quota left: ' + getRemainingQuota());

    } catch (err) {
      skipped++;
      logger.error('[ERROR] ' + ref.id + ': ' + err.message);
    }
  }

  const totalBuilt = REFERENCES.filter(r => isBuilt(r.id, r.category)).length;
  logger.info('[OK] Session complete', {
    builtToday: built,
    totalBuilt,
    remaining:  REFERENCES.length - totalBuilt,
    daysLeft:   Math.ceil((REFERENCES.length - totalBuilt) / 2),
  });

  return { built, skipped, totalBuilt };
}

// ════════════════════════════════════════════════════════════
// readForAgent — علم دقيق مخصص لكل وكيل
// ════════════════════════════════════════════════════════════
export function readForAgent(agentName, maxRules = 12) {
  const indexPath = join(LIBRARY, 'index.json');
  if (!existsSync(indexPath)) return '';

  try {
    const index    = JSON.parse(readFileSync(indexPath, 'utf8'));
    const relevant = index
      .filter(r => r.forAgents.includes(agentName))
      .sort((a, b) => (a.priority || 3) - (b.priority || 3));

    if (!relevant.length) return '';

    const injections = [];
    const rules      = [];

    for (const ref of relevant.slice(0, 5)) {
      const path = join(LIBRARY, ref.category, ref.id + '.json');
      if (!existsSync(path)) continue;
      const knowledge = JSON.parse(readFileSync(path, 'utf8'));
      const agentData = knowledge.byAgent?.[agentName];
      if (!agentData) continue;
      if (agentData.prompt_injection) injections.push(agentData.prompt_injection);
      for (const rule of (agentData.topRules || []).slice(0, 3)) {
        rules.push('[' + ref.title + '] ' + rule);
      }
    }

    if (!rules.length && !injections.length) return '';

    let result = '\n══ المكتبة — ' + agentName + ' ══';
    if (injections.length) result += '\n\nمبادئ جوهرية:\n' + injections.map(i => '• ' + i).join('\n');
    if (rules.length)      result += '\n\nقواعد تطبيقية:\n' + rules.slice(0, maxRules).map((r, i) => (i + 1) + '. ' + r).join('\n');
    result += '\n══════════════════════';
    return result;

  } catch {
    return '';
  }
}

// ════════════════════════════════════════════════════════════
// تقرير حالة المكتبة
// ════════════════════════════════════════════════════════════
export function getLibraryStatus() {
  const total      = REFERENCES.length;
  const built      = REFERENCES.filter(r => isBuilt(r.id, r.category)).length;
  const byCategory = {};
  for (const ref of REFERENCES) {
    if (!byCategory[ref.category]) byCategory[ref.category] = { total: 0, built: 0 };
    byCategory[ref.category].total++;
    if (isBuilt(ref.id, ref.category)) byCategory[ref.category].built++;
  }
  return {
    total, built,
    remaining: total - built,
    percent:   Math.round((built / total) * 100),
    daysLeft:  Math.ceil((total - built) / 2),
    byCategory,
  };
}

// ── دوال مساعدة ──────────────────────────
function isBuilt(id, category) {
  return existsSync(join(LIBRARY, category, id + '.json'));
}

function updateIndex(ref, rulesCount) {
  const indexPath = join(LIBRARY, 'index.json');
  let index = [];
  if (existsSync(indexPath)) { try { index = JSON.parse(readFileSync(indexPath, 'utf8')); } catch {} }
  index = index.filter(r => r.id !== ref.id);
  index.push({
    id: ref.id, title: ref.title, author: ref.author,
    category: ref.category, forAgents: ref.forAgents,
    priority: ref.priority, rulesCount,
    builtAt: new Date().toISOString(),
  });
  writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
}

function getCategoryLabel(category) {
  const labels = {
    'screenwriting':   'كتابة السيناريو والسرد',
    'game-design':     'تصميم الألعاب',
    'cinematography':  'السينما والإخراج',
    'psychology':      'علم النفس والسلوك',
    'philosophy':      'الفلسفة والأساطير',
    'visual-art':      'الفن البصري',
    'audio':           'الصوت والموسيقى',
    'procedural':      'التوليد الإجرائي',
    'production':      'التسويق والإنتاج',
    'analysis':        'تحليل الألعاب',
    'creative-writing':'الكتابة الإبداعية',
  };
  return labels[category] || category;
}
