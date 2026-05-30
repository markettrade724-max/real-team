/**
 * library-builder-agent.js — وكيل بناء المكتبة
 *
 * يستخلص القواعد الجوهرية من أهم مراجع السينما والألعاب
 * ويحفظها في library/ لتغذية جميع الوكلاء.
 *
 * المصادر: ذاكرة Gemini (لا تنزيل، لا إنترنت)
 * التكلفة: 1 استدعاء لكل مرجع
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { askGemini }     from './_gemini.js';
import { logger }        from '../logger.js';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const LIBRARY    = join(__dirname, '..', 'library');

// ════════════════════════════════════════════════════════════
// فهرس المراجع الكاملة
// ════════════════════════════════════════════════════════════
const REFERENCES = [

  // ── السيناريو والسرد ──────────────────
  {
    id:       'mckee-story',
    category: 'screenwriting',
    title:    'Story',
    author:   'Robert McKee',
    type:     'book',
    forAgents: ['story-agent', 'content-agent', 'screenplay-agent'],
    prompt:   'أهم 25 قاعدة من كتاب Story لـ Robert McKee في كتابة السيناريو الاحترافي'
  },
  {
    id:       'field-screenplay',
    category: 'screenwriting',
    title:    'Screenplay',
    author:   'Syd Field',
    type:     'book',
    forAgents: ['story-agent', 'content-agent'],
    prompt:   'أهم 20 قاعدة من كتاب Screenplay لـ Syd Field، خاصة البنية الثلاثية وتطور الشخصية'
  },
  {
    id:       'vogler-writer-journey',
    category: 'screenwriting',
    title:    "The Writer's Journey",
    author:   'Christopher Vogler',
    type:     'book',
    forAgents: ['story-agent', 'world-birth-agent'],
    prompt:   "أهم 20 مبدأ من The Writer's Journey لـ Vogler عن رحلة البطل وأنماط الشخصيات"
  },
  {
    id:       'campbell-hero',
    category: 'storytelling',
    title:    'The Hero with a Thousand Faces',
    author:   'Joseph Campbell',
    type:     'book',
    forAgents: ['story-agent', 'soul-agent'],
    prompt:   'أهم 20 مرحلة ومبدأ من رحلة البطل عند Joseph Campbell مع أمثلة تطبيقية'
  },

  // ── تصميم الألعاب ─────────────────────
  {
    id:       'schell-art-of-game-design',
    category: 'game-design',
    title:    'The Art of Game Design',
    author:   'Jesse Schell',
    type:     'book',
    forAgents: ['world-birth-agent', 'inventor-agent', 'code-agent'],
    prompt:   'أهم 25 عدسة (lens) من كتاب The Art of Game Design لـ Jesse Schell لتصميم ألعاب استثنائية'
  },
  {
    id:       'koster-theory-of-fun',
    category: 'game-design',
    title:    'A Theory of Fun for Game Design',
    author:   'Raph Koster',
    type:     'book',
    forAgents: ['world-birth-agent', 'inventor-agent'],
    prompt:   'أهم 20 مبدأ من A Theory of Fun لـ Raph Koster عن سيكولوجية المتعة في الألعاب'
  },
  {
    id:       'fullerton-game-design-workshop',
    category: 'game-design',
    title:    'Game Design Workshop',
    author:   'Tracy Fullerton',
    type:     'book',
    forAgents: ['world-birth-agent', 'code-agent'],
    prompt:   'أهم 20 مبدأ من Game Design Workshop لـ Tracy Fullerton عن بناء ميكانيكيات اللعب'
  },
  {
    id:       'gdc-level-design',
    category: 'game-design',
    title:    'GDC Level Design Talks',
    author:   'GDC',
    type:     'video',
    forAgents: ['world-birth-agent'],
    prompt:   'أهم 20 مبدأ من محاضرات GDC عن تصميم المستويات والعوالم في الألعاب'
  },
  {
    id:       'gdc-narrative',
    category: 'game-design',
    title:    'GDC Narrative Design Talks',
    author:   'GDC',
    type:     'video',
    forAgents: ['story-agent', 'world-birth-agent'],
    prompt:   'أهم 20 درس من محاضرات GDC عن السرد في الألعاب وكيف تروي القصة بالبيئة'
  },

  // ── السينما والإخراج ──────────────────
  {
    id:       'brown-cinematography',
    category: 'cinematography',
    title:    'Cinematography: Theory and Practice',
    author:   'Blain Brown',
    type:     'book',
    forAgents: ['trailer-agent', 'content-agent'],
    prompt:   'أهم 20 قاعدة من Cinematography لـ Blain Brown عن لغة الكاميرا والإضاءة والتأطير'
  },
  {
    id:       'murch-blink-of-eye',
    category: 'cinematography',
    title:    'In the Blink of an Eye',
    author:   'Walter Murch',
    type:     'book',
    forAgents: ['trailer-agent', 'content-agent'],
    prompt:   'أهم 20 مبدأ من In the Blink of an Eye لـ Walter Murch عن المونتاج وإيقاع الصورة'
  },
  {
    id:       'pixar-storytelling',
    category: 'storytelling',
    title:    'Pixar Storytelling Rules',
    author:   'Pixar',
    type:     'video',
    forAgents: ['story-agent', 'content-agent', 'soul-agent'],
    prompt:   'قواعد Pixar الـ 22 في السرد القصصي مع شرح تطبيقي لكل قاعدة'
  },

  // ── الصوت والموسيقى ───────────────────
  {
    id:       'game-audio',
    category: 'audio',
    title:    'Game Audio Implementation',
    author:   'Richard Stevens',
    type:     'book',
    forAgents: ['world-birth-agent', 'inventor-agent'],
    prompt:   'أهم 20 مبدأ في تصميم الصوت للألعاب: الموسيقى التكيفية، مؤثرات البيئة، صوت الشخصيات'
  },
  {
    id:       'film-music',
    category: 'audio',
    title:    'Film Music: A History',
    author:   'James Wierzbicki',
    type:     'book',
    forAgents: ['trailer-agent', 'content-agent'],
    prompt:   'أهم 20 أسلوب في تأليف موسيقى الأفلام وكيف تخدم القصة وتستثير المشاعر'
  },

  // ── الفن البصري وبناء العوالم ─────────
  {
    id:       'color-theory',
    category: 'visual-art',
    title:    'Color Theory for Designers',
    author:   'Josef Albers',
    type:     'book',
    forAgents: ['art-agent', 'world-birth-agent'],
    prompt:   'أهم 20 قاعدة في نظرية الألوان وكيف تستخدم الألوان لإيصال المشاعر في الألعاب والسينما'
  },
  {
    id:       'world-building',
    category: 'visual-art',
    title:    'The Practical Guide to World Building',
    author:   'Patricia Leavy',
    type:     'book',
    forAgents: ['world-birth-agent', 'soul-agent'],
    prompt:   'أهم 20 مبدأ في بناء العوالم الخيالية: الجغرافيا، التاريخ، الثقافة، القوانين الفيزيائية'
  },
  {
    id:       'concept-art',
    category: 'visual-art',
    title:    'Concept Art for Games and Films',
    author:   'Various Artists',
    type:     'book',
    forAgents: ['art-agent', 'trailer-agent'],
    prompt:   'أهم 20 مبدأ في رسم الـ Concept Art للألعاب والأفلام: الشخصيات، البيئات، العناصر البصرية'
  },

  // ── الإنتاج والصناعة ──────────────────
  {
    id:       'indie-game-dev',
    category: 'production',
    title:    'The Indie Game Developer Handbook',
    author:   'Richard Hill-Whittall',
    type:     'book',
    forAgents: ['roadmap-agent', 'marketing-agent'],
    prompt:   'أهم 20 درس عملي من The Indie Game Developer Handbook في إنتاج ونشر وتسويق الألعاب المستقلة'
  },
  {
    id:       'content-creation',
    category: 'production',
    title:    'YouTube and TikTok Content Strategy',
    author:   'Various Creators',
    type:     'video',
    forAgents: ['content-agent', 'marketing-agent'],
    prompt:   'أهم 20 استراتيجية مثبتة لصناعة محتوى ناجح على يوتيوب وتيك توك يحقق مشاهدات عالية'
  }
];

// ════════════════════════════════════════════════════════════
// الدالة الرئيسية
// ════════════════════════════════════════════════════════════
export async function run(targetCategory = null) {
  logger.info('[LIBRARY] Builder started', {
    total:    REFERENCES.length,
    category: targetCategory || 'all',
  });

  // إنشاء مجلدات المكتبة
  const categories = [...new Set(REFERENCES.map(r => r.category))];
  for (const cat of categories) {
    mkdirSync(join(LIBRARY, cat), { recursive: true });
  }

  // اختيار المراجع المستهدفة
  const targets = targetCategory
    ? REFERENCES.filter(r => r.category === targetCategory)
    : REFERENCES.filter(r => !isBuilt(r.id, r.category));

  if (!targets.length) {
    logger.info('[LIBRARY] All references already built');
    return { built: 0, total: REFERENCES.length };
  }

  logger.info(`[LIBRARY] Building ${targets.length} references...`);

  let built = 0;

  for (const ref of targets) {
    logger.info(`[LIBRARY] Processing: "${ref.title}" by ${ref.author}`);

    try {
      const knowledge = await askGemini(`
أنت خبير في ${getCategoryLabel(ref.category)}.

استخلص ${ref.prompt}.

القواعد يجب أن تكون:
- عملية ومباشرة (لا نظرية فارغة)
- قابلة للتطبيق في صناعة الألعاب والمحتوى الرقمي
- مرتبة من الأهم للأقل أهمية

أنتج JSON فقط:
{
  "title":    "${ref.title}",
  "author":   "${ref.author}",
  "category": "${ref.category}",
  "forAgents": ${JSON.stringify(ref.forAgents)},
  "summary":  "ملخص المرجع في 3 جمل",
  "rules": [
    {
      "id":          1,
      "rule":        "القاعدة بوضوح",
      "explanation": "شرح موجز",
      "example":     "مثال من لعبة أو فيلم شهير",
      "howToApply":  "كيف يطبقها الوكيل عملياً"
    }
  ],
  "keyQuotes": ["اقتباس مهم 1", "اقتباس مهم 2"],
  "relatedTo": ["مرجع ذو صلة 1", "مرجع ذو صلة 2"]
}`, 0.4, { maxOutputTokens: 4096, topP: 0.8 });

      if (!knowledge?.rules?.length) {
        logger.warn(`[WARN] Invalid knowledge for ${ref.id}`);
        continue;
      }

      // حفظ المرجع
      const path = join(LIBRARY, ref.category, `${ref.id}.json`);
      writeFileSync(path, JSON.stringify({
        ...knowledge,
        id:          ref.id,
        type:        ref.type,
        builtAt:     new Date().toISOString(),
      }, null, 2), 'utf8');

      built++;
      logger.info(`[OK] Built: "${ref.title}" — ${knowledge.rules.length} rules`);

      // تحديث الفهرس
      updateIndex(ref, knowledge.rules.length);

    } catch (err) {
      logger.error(`[ERROR] Failed to build ${ref.id}`, { error: err.message });
    }
  }

  logger.info('[OK] Library build complete', {
    built,
    total: REFERENCES.length,
  });

  return { built, total: REFERENCES.length };
}

// ════════════════════════════════════════════════════════════
// قراءة المكتبة للوكلاء
// ════════════════════════════════════════════════════════════
export function readForAgent(agentName, maxRules = 10) {
  const indexPath = join(LIBRARY, 'index.json');
  if (!existsSync(indexPath)) return '';

  try {
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    const relevant = index.filter(r => r.forAgents.includes(agentName));

    if (!relevant.length) return '';

    const rules = [];
    for (const ref of relevant.slice(0, 3)) {
      const path = join(LIBRARY, ref.category, `${ref.id}.json`);
      if (!existsSync(path)) continue;
      const knowledge = JSON.parse(readFileSync(path, 'utf8'));
      const topRules  = knowledge.rules?.slice(0, 3) || [];
      for (const rule of topRules) {
        rules.push(`[${ref.title}] ${rule.rule} — ${rule.howToApply}`);
      }
    }

    if (!rules.length) return '';

    return `
══ المكتبة الاحترافية ══
${rules.slice(0, maxRules).map((r, i) => `${i+1}. ${r}`).join('\n')}
══════════════════════`;

  } catch {
    return '';
  }
}

// ════════════════════════════════════════════════════════════
// دوال مساعدة
// ════════════════════════════════════════════════════════════
function isBuilt(id, category) {
  return existsSync(join(LIBRARY, category, `${id}.json`));
}

function updateIndex(ref, rulesCount) {
  const indexPath = join(LIBRARY, 'index.json');
  let index = [];
  if (existsSync(indexPath)) {
    try { index = JSON.parse(readFileSync(indexPath, 'utf8')); } catch {}
  }
  index = index.filter(r => r.id !== ref.id);
  index.push({
    id:         ref.id,
    title:      ref.title,
    author:     ref.author,
    category:   ref.category,
    type:       ref.type,
    forAgents:  ref.forAgents,
    rulesCount,
    builtAt:    new Date().toISOString(),
  });
  writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
}

function getCategoryLabel(category) {
  const labels = {
    'screenwriting':  'كتابة السيناريو والسرد القصصي',
    'storytelling':   'فن الحكاية والسرد',
    'game-design':    'تصميم الألعاب',
    'cinematography': 'السينما والإخراج',
    'audio':          'الصوت والموسيقى',
    'visual-art':     'الفن البصري وبناء العوالم',
    'production':     'الإنتاج والتسويق',
  };
  return labels[category] || category;
}
