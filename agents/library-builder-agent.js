/**
 * library-builder-agent.js — v3.0
 * الجامعة الشاملة — علم دقيق لكل وكيل
 *
 * الجديد في v3.0:
 * - كل مرجع يُبنى بتطبيق مخصص لكل وكيل معني
 * - readForAgent() تقرأ تطبيق الوكيل تحديداً لا قواعد عامة
 * - إدارة ذكية لحصة Gemini (20 طلب/يوم)
 * - 11 قسم، 66 مرجع، أولويات واضحة
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { askGemini } from './_gemini.js';
import { logger }    from '../logger.js';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const LIBRARY     = join(__dirname, '..', 'library');
const BUDGET_PATH = join(LIBRARY, 'budget.json');

// ════════════════════════════════════════════════════════════
// إدارة الميزانية اليومية
// ════════════════════════════════════════════════════════════
const DAILY_LIMIT    = 20;
const BUDGET_FOR_LIB = 14; // الباقي (6) للوكلاء الأخرى

function loadBudget() {
  const today = new Date().toISOString().slice(0, 10);
  if (existsSync(BUDGET_PATH)) {
    try {
      const b = JSON.parse(readFileSync(BUDGET_PATH, 'utf8'));
      if (b.date === today) return b;
    } catch {}
  }
  const fresh = { date: today, used: 0, limit: BUDGET_FOR_LIB };
  saveBudget(fresh);
  return fresh;
}

function saveBudget(b) {
  mkdirSync(LIBRARY, { recursive: true });
  writeFileSync(BUDGET_PATH, JSON.stringify(b, null, 2), 'utf8');
}

function consumeBudget(b, n = 1) { b.used += n; saveBudget(b); }
function hasQuota(b, n = 1)      { return (b.used + n) <= b.limit; }

// ════════════════════════════════════════════════════════════
// بناء prompt دقيق لكل وكيل
// ════════════════════════════════════════════════════════════
function buildAgentApplications(ref) {
  return ref.forAgents.map(agent => `
    {
      "agent": "${agent}",
      "application": "كيف يطبق ${agent} هذا المرجع تحديداً في عمله اليومي",
      "rules": [
        {
          "id": 1,
          "rule": "القاعدة الأهم لـ ${agent} من هذا المرجع",
          "why": "لماذا هذه القاعدة حيوية لـ ${agent} تحديداً",
          "how": "خطوات تطبيقها داخل ${agent} بشكل عملي",
          "example": "مثال ملموس: إذا كان ${agent} يعمل على [مهمة محددة]، فإنه يطبق هذه القاعدة بـ..."
        }
      ]
    }`).join(',\n');
}

// ════════════════════════════════════════════════════════════
// فهرس المراجع — 11 قسم، 66 مرجع
// ════════════════════════════════════════════════════════════
const REFERENCES = [

  // ── 1. السيناريو والسرد ──────────────────────────────────
  {
    id: 'mckee-story', category: 'screenwriting', priority: 1,
    title: 'Story', author: 'Robert McKee',
    forAgents: ['story-agent', 'content-agent', 'screenplay-agent'],
    prompt: 'أهم 20 قاعدة من Story لـ McKee في كتابة السيناريو الاحترافي'
  },
  {
    id: 'field-screenplay', category: 'screenwriting', priority: 1,
    title: 'Screenplay', author: 'Syd Field',
    forAgents: ['story-agent', 'content-agent'],
    prompt: 'أهم 20 قاعدة من Screenplay لـ Syd Field، البنية الثلاثية وتطور الشخصية'
  },
  {
    id: 'vogler-writer-journey', category: 'screenwriting', priority: 1,
    title: "The Writer's Journey", author: 'Christopher Vogler',
    forAgents: ['story-agent', 'world-birth-agent'],
    prompt: "أهم 20 مبدأ من The Writer's Journey عن رحلة البطل وأنماط الشخصيات"
  },
  {
    id: 'campbell-hero', category: 'screenwriting', priority: 1,
    title: 'The Hero with a Thousand Faces', author: 'Joseph Campbell',
    forAgents: ['story-agent', 'soul-agent'],
    prompt: 'أهم 20 مرحلة من رحلة البطل عند Campbell مع أمثلة تطبيقية'
  },
  {
    id: 'truby-anatomy', category: 'screenwriting', priority: 2,
    title: 'The Anatomy of Story', author: 'John Truby',
    forAgents: ['story-agent', 'content-agent'],
    prompt: 'أهم 22 خطوة من The Anatomy of Story في بناء القصص العميقة'
  },
  {
    id: 'snyder-save-cat', category: 'screenwriting', priority: 2,
    title: 'Save the Cat', author: 'Blake Snyder',
    forAgents: ['story-agent', 'content-agent'],
    prompt: 'أهم 20 قاعدة من Save the Cat في كتابة السيناريو التجاري الناجح'
  },
  {
    id: 'mamet-directing', category: 'screenwriting', priority: 3,
    title: 'On Directing Film', author: 'David Mamet',
    forAgents: ['story-agent', 'trailer-agent'],
    prompt: 'أهم 15 مبدأ من On Directing Film في الإخراج والسرد البصري'
  },

  // ── 2. تصميم الألعاب ─────────────────────────────────────
  {
    id: 'schell-art-of-game-design', category: 'game-design', priority: 1,
    title: 'The Art of Game Design', author: 'Jesse Schell',
    forAgents: ['world-birth-agent', 'inventor-agent', 'code-agent'],
    prompt: 'أهم 25 عدسة من The Art of Game Design لتصميم ألعاب استثنائية'
  },
  {
    id: 'koster-theory-of-fun', category: 'game-design', priority: 1,
    title: 'A Theory of Fun', author: 'Raph Koster',
    forAgents: ['world-birth-agent', 'inventor-agent'],
    prompt: 'أهم 20 مبدأ من A Theory of Fun عن سيكولوجية المتعة في الألعاب'
  },
  {
    id: 'fullerton-workshop', category: 'game-design', priority: 1,
    title: 'Game Design Workshop', author: 'Tracy Fullerton',
    forAgents: ['world-birth-agent', 'code-agent'],
    prompt: 'أهم 20 مبدأ من Game Design Workshop عن بناء ميكانيكيات اللعب'
  },
  {
    id: 'gdc-level-design', category: 'game-design', priority: 2,
    title: 'GDC Level Design Talks', author: 'GDC',
    forAgents: ['world-birth-agent'],
    prompt: 'أهم 20 مبدأ من GDC عن تصميم المستويات والعوالم'
  },
  {
    id: 'gdc-narrative', category: 'game-design', priority: 2,
    title: 'GDC Narrative Design', author: 'GDC',
    forAgents: ['story-agent', 'world-birth-agent'],
    prompt: 'أهم 20 درس من GDC عن السرد في الألعاب وكيف تروي القصة بالبيئة'
  },
  {
    id: 'rogers-level-up', category: 'game-design', priority: 2,
    title: 'Level Up!', author: 'Scott Rogers',
    forAgents: ['world-birth-agent', 'code-agent'],
    prompt: 'أهم 20 قاعدة من Level Up في تصميم مستويات الألعاب وتجربة اللاعب'
  },
  {
    id: 'dark-souls-design', category: 'game-design', priority: 1,
    title: 'Dark Souls Design Philosophy', author: 'FromSoftware GDC',
    forAgents: ['world-birth-agent', 'inventor-agent', 'soul-agent'],
    prompt: 'أهم 20 مبدأ في فلسفة Dark Souls: الصعوبة العادلة، السرد البيئي، العوالم الغامضة'
  },
  {
    id: 'minecraft-proc-gen', category: 'game-design', priority: 2,
    title: 'Procedural Generation in Minecraft', author: 'Mojang GDC',
    forAgents: ['world-birth-agent', 'code-agent'],
    prompt: 'أهم 20 درس من Minecraft في التوليد الإجرائي للعوالم واللعب اللانهائي'
  },

  // ── 3. السينما والإخراج ──────────────────────────────────
  {
    id: 'brown-cinematography', category: 'cinematography', priority: 1,
    title: 'Cinematography', author: 'Blain Brown',
    forAgents: ['trailer-agent', 'content-agent'],
    prompt: 'أهم 20 قاعدة من Cinematography عن لغة الكاميرا والإضاءة والتأطير'
  },
  {
    id: 'murch-blink', category: 'cinematography', priority: 1,
    title: 'In the Blink of an Eye', author: 'Walter Murch',
    forAgents: ['trailer-agent', 'content-agent'],
    prompt: 'أهم 20 مبدأ من In the Blink of an Eye عن المونتاج وإيقاع الصورة'
  },
  {
    id: 'pixar-storytelling', category: 'cinematography', priority: 1,
    title: 'Pixar Storytelling Rules', author: 'Pixar',
    forAgents: ['story-agent', 'content-agent', 'soul-agent'],
    prompt: 'قواعد Pixar الـ 22 في السرد القصصي مع شرح تطبيقي لكل قاعدة'
  },
  {
    id: 'kubrick-directing', category: 'cinematography', priority: 2,
    title: 'Kubrick on Directing', author: 'Stanley Kubrick',
    forAgents: ['trailer-agent', 'content-agent'],
    prompt: 'أهم 15 مبدأ في فلسفة Kubrick الإخراجية: الكمالية، التأطير، الرمزية البصرية'
  },
  {
    id: 'miyazaki-worldbuilding', category: 'cinematography', priority: 2,
    title: "Miyazaki's World Building", author: 'Studio Ghibli',
    forAgents: ['world-birth-agent', 'art-agent', 'soul-agent'],
    prompt: 'أهم 20 مبدأ في فلسفة Miyazaki: الطبيعة، الروح، الإنسانية في بناء العوالم'
  },
  {
    id: 'nolan-narrative', category: 'cinematography', priority: 3,
    title: 'Nolan Narrative Techniques', author: 'Christopher Nolan',
    forAgents: ['story-agent', 'trailer-agent'],
    prompt: 'أهم 15 تقنية سردية عند Nolan: البنية غير الخطية، الزمن، الغموض الذكي'
  },

  // ── 4. علم النفس والسلوك ─────────────────────────────────
  {
    id: 'cialdini-influence', category: 'psychology', priority: 1,
    title: 'Influence', author: 'Robert Cialdini',
    forAgents: ['content-agent', 'marketing-agent'],
    prompt: 'أهم 20 مبدأ من Influence في التأثير والإقناع وتطبيقها في المحتوى والتسويق'
  },
  {
    id: 'csikszentmihalyi-flow', category: 'psychology', priority: 1,
    title: 'Flow', author: 'Mihaly Csikszentmihalyi',
    forAgents: ['world-birth-agent', 'inventor-agent', 'code-agent'],
    prompt: 'أهم 20 مبدأ من Flow وكيف تصمم تجربة لعب تحقق حالة الانغماس الكامل'
  },
  {
    id: 'kahneman-thinking', category: 'psychology', priority: 2,
    title: 'Thinking Fast and Slow', author: 'Daniel Kahneman',
    forAgents: ['content-agent', 'marketing-agent', 'story-agent'],
    prompt: 'أهم 20 مبدأ عن اتخاذ القرار والتحيزات المعرفية وتطبيقها في صناعة المحتوى'
  },
  {
    id: 'jung-archetypes', category: 'psychology', priority: 2,
    title: 'The Archetypes', author: 'Carl Jung',
    forAgents: ['soul-agent', 'story-agent', 'world-birth-agent'],
    prompt: 'أهم 20 نمط أصيل عند Jung وكيف تُجسَّد في شخصيات الألعاب والأفلام'
  },
  {
    id: 'fogg-behavior', category: 'psychology', priority: 2,
    title: 'Tiny Habits', author: 'BJ Fogg',
    forAgents: ['content-agent', 'marketing-agent'],
    prompt: 'أهم 15 مبدأ في تصميم سلوكيات المستخدم والإدمان الصحي على المحتوى'
  },
  {
    id: 'maslow-hierarchy', category: 'psychology', priority: 3,
    title: 'Hierarchy of Needs', author: 'Abraham Maslow',
    forAgents: ['soul-agent', 'story-agent', 'marketing-agent'],
    prompt: 'أهم 15 تطبيق لهرم Maslow في تصميم الألعاب والمحتوى'
  },

  // ── 5. الفلسفة والأساطير ─────────────────────────────────
  {
    id: 'mythology-world', category: 'philosophy', priority: 1,
    title: 'World Mythology Encyclopedia', author: 'Various',
    forAgents: ['soul-agent', 'world-birth-agent', 'story-agent'],
    prompt: 'أهم 25 أسطورة وقانون كوني من أساطير العالم لبناء عوالم أصيلة'
  },
  {
    id: 'stoicism-meditations', category: 'philosophy', priority: 2,
    title: 'Meditations', author: 'Marcus Aurelius',
    forAgents: ['soul-agent', 'story-agent'],
    prompt: 'أهم 20 مبدأ من Meditations وكيف تُلهم شخصيات وعوالم عميقة المعنى'
  },
  {
    id: 'taoism-tao-te-ching', category: 'philosophy', priority: 2,
    title: 'Tao Te Ching', author: 'Laozi',
    forAgents: ['soul-agent', 'world-birth-agent'],
    prompt: 'أهم 20 مبدأ من Tao Te Ching وتطبيقها في بناء أنظمة كونية متوازنة'
  },
  {
    id: 'nietzsche-philosophy', category: 'philosophy', priority: 3,
    title: 'Thus Spoke Zarathustra', author: 'Nietzsche',
    forAgents: ['soul-agent', 'story-agent'],
    prompt: 'أهم 15 مفهوم من Nietzsche لبناء شخصيات استثنائية'
  },

  // ── 6. الفن البصري ───────────────────────────────────────
  {
    id: 'color-theory', category: 'visual-art', priority: 1,
    title: 'Color Theory for Designers', author: 'Josef Albers',
    forAgents: ['art-agent', 'world-birth-agent'],
    prompt: 'أهم 20 قاعدة في نظرية الألوان لإيصال المشاعر في الألعاب والسينما'
  },
  {
    id: 'world-building', category: 'visual-art', priority: 1,
    title: 'Practical Guide to World Building', author: 'Patricia Leavy',
    forAgents: ['world-birth-agent', 'soul-agent'],
    prompt: 'أهم 20 مبدأ في بناء العوالم: الجغرافيا، التاريخ، الثقافة، القوانين الفيزيائية'
  },
  {
    id: 'concept-art', category: 'visual-art', priority: 2,
    title: 'Concept Art for Games and Films', author: 'Various',
    forAgents: ['art-agent', 'trailer-agent'],
    prompt: 'أهم 20 مبدأ في Concept Art للألعاب والأفلام'
  },
  {
    id: 'blizzard-art', category: 'visual-art', priority: 2,
    title: 'Blizzard Art Direction', author: 'Blizzard GDC',
    forAgents: ['art-agent', 'world-birth-agent'],
    prompt: 'أهم 20 مبدأ في فلسفة Blizzard البصرية: الوضوح، الهوية، التمييز'
  },
  {
    id: 'ui-ux-games', category: 'visual-art', priority: 2,
    title: 'UI/UX Design in Games', author: 'GDC',
    forAgents: ['code-agent', 'art-agent'],
    prompt: 'أهم 20 قاعدة في تصميم واجهات الألعاب وتجربة المستخدم'
  },
  {
    id: 'pixel-art-mastery', category: 'visual-art', priority: 3,
    title: 'Pixel Art Mastery', author: 'Various',
    forAgents: ['art-agent', 'code-agent'],
    prompt: 'أهم 15 مبدأ في فن البكسل: الإضاءة، الحركة، القراءية'
  },

  // ── 7. الصوت والموسيقى ───────────────────────────────────
  {
    id: 'game-audio', category: 'audio', priority: 1,
    title: 'Game Audio Implementation', author: 'Richard Stevens',
    forAgents: ['world-birth-agent', 'inventor-agent'],
    prompt: 'أهم 20 مبدأ في تصميم الصوت للألعاب: الموسيقى التكيفية، مؤثرات البيئة'
  },
  {
    id: 'film-music', category: 'audio', priority: 1,
    title: 'Film Music: A History', author: 'James Wierzbicki',
    forAgents: ['trailer-agent', 'content-agent'],
    prompt: 'أهم 20 أسلوب في تأليف موسيقى الأفلام وكيف تخدم القصة'
  },
  {
    id: 'hans-zimmer-composing', category: 'audio', priority: 2,
    title: 'Hans Zimmer Masterclass', author: 'Hans Zimmer',
    forAgents: ['trailer-agent', 'world-birth-agent'],
    prompt: 'أهم 20 درس من Zimmer في تأليف موسيقى الأفلام والهوية الصوتية'
  },
  {
    id: 'adaptive-music-games', category: 'audio', priority: 2,
    title: 'Adaptive Music in Games', author: 'GDC',
    forAgents: ['world-birth-agent', 'code-agent'],
    prompt: 'أهم 15 تقنية للموسيقى التكيفية في الألعاب'
  },

  // ── 8. التوليد الإجرائي ──────────────────────────────────
  {
    id: 'proc-gen-book', category: 'procedural', priority: 1,
    title: 'Procedural Generation in Game Design', author: 'Shaker et al.',
    forAgents: ['world-birth-agent', 'code-agent', 'inventor-agent'],
    prompt: 'أهم 20 خوارزمية في التوليد الإجرائي: الخرائط، الدنجن، الشخصيات، القصص'
  },
  {
    id: 'noise-algorithms', category: 'procedural', priority: 1,
    title: 'Perlin Noise and World Generation', author: 'Various',
    forAgents: ['world-birth-agent', 'code-agent'],
    prompt: 'أهم 15 خوارزمية توليد عوالم: Perlin، Simplex، Voronoi، Wave Function Collapse'
  },
  {
    id: 'ai-behavior-trees', category: 'procedural', priority: 2,
    title: 'Behavior Trees for Game AI', author: 'GDC',
    forAgents: ['code-agent', 'world-birth-agent'],
    prompt: 'أهم 20 مبدأ في بناء ذكاء اصطناعي للألعاب: Behavior Trees، FSM، GOAP'
  },
  {
    id: 'cellular-automata', category: 'procedural', priority: 3,
    title: 'Cellular Automata for Game Worlds', author: 'Various',
    forAgents: ['world-birth-agent', 'code-agent'],
    prompt: 'أهم 15 تطبيق لـ Cellular Automata في توليد الكهوف والغابات والمدن'
  },

  // ── 9. التسويق والإنتاج ──────────────────────────────────
  {
    id: 'indie-game-dev', category: 'production', priority: 1,
    title: 'Indie Game Developer Handbook', author: 'Hill-Whittall',
    forAgents: ['roadmap-agent', 'marketing-agent'],
    prompt: 'أهم 20 درس في إنتاج ونشر وتسويق الألعاب المستقلة'
  },
  {
    id: 'content-creation', category: 'production', priority: 1,
    title: 'YouTube and TikTok Strategy', author: 'Various Creators',
    forAgents: ['content-agent', 'marketing-agent'],
    prompt: 'أهم 20 استراتيجية لصناعة محتوى ناجح على يوتيوب وتيك توك'
  },
  {
    id: 'purple-cow', category: 'production', priority: 2,
    title: 'Purple Cow', author: 'Seth Godin',
    forAgents: ['marketing-agent', 'inventor-agent'],
    prompt: 'أهم 20 مبدأ في بناء منتج استثنائي يتسوّق نفسه بنفسه'
  },
  {
    id: 'game-monetization', category: 'production', priority: 2,
    title: 'Game Monetization Strategies', author: 'GDC',
    forAgents: ['marketing-agent', 'roadmap-agent'],
    prompt: 'أهم 20 استراتيجية لتحقيق الدخل من الألعاب المستقلة'
  },
  {
    id: 'itch-gumroad-selling', category: 'production', priority: 2,
    title: 'Selling on itch.io and Gumroad', author: 'Various',
    forAgents: ['marketing-agent', 'inventor-agent'],
    prompt: 'أهم 15 استراتيجية لبيع الألعاب والأدوات الرقمية'
  },
  {
    id: 'zero-to-one', category: 'production', priority: 3,
    title: 'Zero to One', author: 'Peter Thiel',
    forAgents: ['roadmap-agent', 'inventor-agent'],
    prompt: 'أهم 15 مبدأ في بناء شيء جديد حقاً لا مجرد نسخة'
  },

  // ── 10. تحليل المنافسين ───────────────────────────────────
  {
    id: 'dark-souls-analysis', category: 'analysis', priority: 1,
    title: 'Dark Souls — تحليل شامل', author: 'FromSoftware',
    forAgents: ['world-birth-agent', 'inventor-agent', 'soul-agent'],
    prompt: 'تحليل Dark Souls: الميكانيكيات، السرد البيئي، الصعوبة، ما يجعله استثنائياً'
  },
  {
    id: 'hollow-knight-analysis', category: 'analysis', priority: 1,
    title: 'Hollow Knight — تحليل شامل', author: 'Team Cherry',
    forAgents: ['world-birth-agent', 'art-agent', 'story-agent'],
    prompt: 'تحليل Hollow Knight: بناء العالم، الغموض، الفن، الموسيقى، تجربة الاكتشاف'
  },
  {
    id: 'undertale-analysis', category: 'analysis', priority: 2,
    title: 'Undertale — تحليل سردي', author: 'Toby Fox',
    forAgents: ['story-agent', 'inventor-agent'],
    prompt: 'تحليل Undertale: كسر القواعد السردية، تعدد المسارات، علاقة اللاعب بالشخصيات'
  },
  {
    id: 'journey-analysis', category: 'analysis', priority: 2,
    title: 'Journey — تحليل تجربة', author: 'thatgamecompany',
    forAgents: ['soul-agent', 'world-birth-agent'],
    prompt: 'تحليل Journey: التجربة العاطفية بدون كلمات، السرد البصري، اللعب التعاوني'
  },
  {
    id: 'celeste-analysis', category: 'analysis', priority: 2,
    title: 'Celeste — تحليل ميكانيكيات', author: 'Maddy Thorson',
    forAgents: ['code-agent', 'story-agent'],
    prompt: 'تحليل Celeste: دمج الميكانيكيات مع القصة، منحنى الصعوبة، إمكانية الوصول'
  },
  {
    id: 'minecraft-analysis', category: 'analysis', priority: 3,
    title: 'Minecraft — تحليل شامل', author: 'Mojang',
    forAgents: ['world-birth-agent', 'inventor-agent'],
    prompt: 'تحليل Minecraft: لماذا يستمر 15 سنة؟ الحرية، الإبداع، المجتمع'
  },

  // ── 11. الكتابة الإبداعية والحوار ────────────────────────
  {
    id: 'king-on-writing', category: 'creative-writing', priority: 1,
    title: 'On Writing', author: 'Stephen King',
    forAgents: ['story-agent', 'content-agent'],
    prompt: 'أهم 20 قاعدة من On Writing في الكتابة الإبداعية والأسلوب والصوت الأدبي'
  },
  {
    id: 'sanderson-worldbuilding', category: 'creative-writing', priority: 1,
    title: 'Brandon Sanderson Worldbuilding', author: 'Brandon Sanderson',
    forAgents: ['world-birth-agent', 'story-agent', 'soul-agent'],
    prompt: 'أهم 20 قانون من Sanderson في بناء أنظمة السحر والعوالم الخيالية المتسقة'
  },
  {
    id: 'show-dont-tell', category: 'creative-writing', priority: 2,
    title: "Show Don't Tell Mastery", author: 'Various',
    forAgents: ['story-agent', 'content-agent', 'world-birth-agent'],
    prompt: "أهم 20 تقنية في Show Don't Tell: إظهار المشاعر والأحداث بدل وصفها"
  },
  {
    id: 'dialogue-craft', category: 'creative-writing', priority: 2,
    title: 'The Dialogue Craft', author: 'Various',
    forAgents: ['story-agent', 'content-agent'],
    prompt: 'أهم 20 قاعدة في كتابة الحوار: الصوت الفريد لكل شخصية، الصراع، ما لا يُقال'
  },
];

// ════════════════════════════════════════════════════════════
// بناء prompt الاستخلاص الدقيق
// ════════════════════════════════════════════════════════════
function buildPrompt(ref) {
  const agentApplications = ref.forAgents.map(agent =>
    `"${agent}": {
        "topRules": ["القاعدة الأهم لـ ${agent} من هذا المرجع", "القاعدة الثانية", "القاعدة الثالثة"],
        "why": "لماذا هذا المرجع حيوي لـ ${agent} تحديداً",
        "how": "كيف يطبق ${agent} هذا المرجع خطوة بخطوة في عمله اليومي",
        "prompt_injection": "جملة واحدة تُضاف لـ prompt الوكيل تجعله يتصرف بذكاء هذا المرجع"
      }`
  ).join(',\n      ');

  return `
أنت خبير في ${getCategoryLabel(ref.category)}.

المرجع: "${ref.title}" لـ ${ref.author}

مهمتك: ${ref.prompt}

القواعد يجب أن تكون:
- عملية ومباشرة (لا نظرية فارغة)
- مخصصة لكل وكيل بدقة
- قابلة للحقن مباشرة في prompt الوكيل

أنتج JSON فقط بهذا الشكل:
{
  "title":   "${ref.title}",
  "author":  "${ref.author}",
  "category":"${ref.category}",
  "summary": "ملخص المرجع في جملتين",
  "coreRules": [
    {
      "id":      1,
      "rule":    "القاعدة الجوهرية",
      "essence": "جوهرها في كلمة أو كلمتين",
      "example": "مثال من لعبة أو فيلم شهير"
    }
  ],
  "byAgent": {
    ${agentApplications}
  }
}`;
}

// ════════════════════════════════════════════════════════════
// الدالة الرئيسية
// ════════════════════════════════════════════════════════════
export async function run(targetCategory = null) {
  const budget = loadBudget();

  logger.info('[LIBRARY] v3.0 started', {
    total:      REFERENCES.length,
    category:   targetCategory || 'all',
    budgetUsed: budget.used,
    budgetLeft: budget.limit - budget.used,
  });

  if (!hasQuota(budget)) {
    logger.warn('[LIBRARY] Budget exhausted for today.');
    return { built: 0, budgetLeft: 0 };
  }

  const categories = [...new Set(REFERENCES.map(r => r.category))];
  for (const cat of categories) mkdirSync(join(LIBRARY, cat), { recursive: true });

  let targets = REFERENCES
    .filter(r => !isBuilt(r.id, r.category))
    .filter(r => !targetCategory || r.category === targetCategory)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, budget.limit - budget.used);

  if (!targets.length) {
    logger.info('[LIBRARY] All references already built');
    return { built: 0, total: REFERENCES.length };
  }

  logger.info(`[LIBRARY] Building ${targets.length} references (budget left: ${budget.limit - budget.used})`);

  let built = 0, skipped = 0;

  for (const ref of targets) {
    if (!hasQuota(budget)) {
      logger.warn('[LIBRARY] Budget reached. Stopping.');
      break;
    }

    logger.info(`[LIBRARY] "${ref.title}" — ${ref.forAgents.join(', ')} [p${ref.priority}]`);

    try {
      const knowledge = await askGemini(buildPrompt(ref), 0.3, { maxOutputTokens: 4096, topP: 0.8 });
      consumeBudget(budget);

      if (!knowledge?.coreRules?.length || !knowledge?.byAgent) {
        logger.warn(`[WARN] Invalid structure for ${ref.id}`);
        skipped++;
        continue;
      }

      const path = join(LIBRARY, ref.category, `${ref.id}.json`);
      writeFileSync(path, JSON.stringify({
        ...knowledge,
        id:       ref.id,
        priority: ref.priority,
        builtAt:  new Date().toISOString(),
      }, null, 2), 'utf8');

      built++;
      updateIndex(ref, knowledge.coreRules.length);
      logger.info(`[OK] "${ref.title}" — ${knowledge.coreRules.length} rules — budget left: ${budget.limit - budget.used}`);

    } catch (err) {
      consumeBudget(budget);
      skipped++;
      logger.error(`[ERROR] ${ref.id}: ${err.message}`);
    }
  }

  const totalBuilt = REFERENCES.filter(r => isBuilt(r.id, r.category)).length;
  logger.info('[OK] Session complete', {
    builtToday: built,
    totalBuilt,
    remaining:  REFERENCES.length - totalBuilt,
    daysLeft:   Math.ceil((REFERENCES.length - totalBuilt) / BUDGET_FOR_LIB),
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
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));

    const relevant = index
      .filter(r => r.forAgents.includes(agentName))
      .sort((a, b) => (a.priority || 3) - (b.priority || 3));

    if (!relevant.length) return '';

    const injections = []; // prompt_injection لكل وكيل
    const rules      = []; // قواعد مخصصة

    for (const ref of relevant.slice(0, 5)) {
      const path = join(LIBRARY, ref.category, `${ref.id}.json`);
      if (!existsSync(path)) continue;

      const knowledge  = JSON.parse(readFileSync(path, 'utf8'));
      const agentData  = knowledge.byAgent?.[agentName];
      if (!agentData) continue;

      // prompt_injection — جملة ذكية مخصصة
      if (agentData.prompt_injection) {
        injections.push(agentData.prompt_injection);
      }

      // قواعد مخصصة للوكيل
      for (const rule of (agentData.topRules || []).slice(0, 3)) {
        rules.push(`[${ref.title}] ${rule}`);
      }
    }

    if (!rules.length && !injections.length) return '';

    return `
══ المكتبة — ${agentName} ══
${injections.length ? `\nمبادئ جوهرية:\n${injections.map(i => `• ${i}`).join('\n')}` : ''}
${rules.length ? `\nقواعد تطبيقية:\n${rules.slice(0, maxRules).map((r, i) => `${i + 1}. ${r}`).join('\n')}` : ''}
══════════════════════`;

  } catch {
    return '';
  }
}

// ════════════════════════════════════════════════════════════
// تقرير حالة المكتبة
// ════════════════════════════════════════════════════════════
export function getLibraryStatus() {
  const budget    = loadBudget();
  const total     = REFERENCES.length;
  const built     = REFERENCES.filter(r => isBuilt(r.id, r.category)).length;
  const remaining = total - built;

  const byCategory = {};
  for (const ref of REFERENCES) {
    if (!byCategory[ref.category]) byCategory[ref.category] = { total: 0, built: 0 };
    byCategory[ref.category].total++;
    if (isBuilt(ref.id, ref.category)) byCategory[ref.category].built++;
  }

  return {
    total, built, remaining,
    percent:  Math.round((built / total) * 100),
    daysLeft: Math.ceil(remaining / BUDGET_FOR_LIB),
    budget:   { used: budget.used, limit: budget.limit, left: budget.limit - budget.used },
    byCategory,
  };
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
    id:        ref.id,
    title:     ref.title,
    author:    ref.author,
    category:  ref.category,
    forAgents: ref.forAgents,
    priority:  ref.priority,
    rulesCount,
    builtAt:   new Date().toISOString(),
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
