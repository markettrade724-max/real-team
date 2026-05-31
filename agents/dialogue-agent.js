/**
 * dialogue-agent.js
 * يحسّن الحوار — صوت فريد لكل شخصية
 * يطبق قواعد Stephen King + Dialogue Craft من المكتبة
 * لا يستهلك Gemini — يعمل من المكتبة فقط
 */

import { readForAgent } from './library-builder-agent.js';
import { logger }       from '../logger.js';

// ── أنماط الحوار لكل دور ──────────────────
const DIALOGUE_PATTERNS = {
  protagonist: {
    traits:    ['يتساءل', 'يتردد', 'يقرر', 'يشك'],
    forbidden: ['أنا البطل', 'سأنتصر', 'لا أخاف'],  // كليشيهات محظورة
    style:     'جمل قصيرة — يعبّر بالفعل لا الكلام',
  },
  antagonist: {
    traits:    ['يؤمن بنفسه', 'منطقي في شره', 'له وجهة نظر'],
    forbidden: ['سأدمر العالم', 'أنا الشر'],
    style:     'يتكلم كأنه محق تماماً — لا يعترف بالشر',
  },
  supporting: {
    traits:    ['يطرح أسئلة', 'يعكس مشاعر البطل', 'يضيف فكاهة خفيفة'],
    forbidden: ['كما تعلم يا بطلنا', 'دعني أشرح'],
    style:     'يكسر التوتر أو يعمّقه — لا يشرح الحبكة أبداً',
  },
  narrator: {
    traits:    ['موضوعي', 'شاعري', 'موجز'],
    forbidden: ['وكان البطل يفكر في', 'فجأة'],
    style:     'جملة واحدة تصف المكان والمزاج فقط',
  },
};

export function run(screenplay) {
  logger.info('[DIALOGUE] Polishing dialogue', { episode: screenplay.episode });

  const library = readForAgent('dialogue-agent', 8);
  logger.debug('[DIALOGUE] Library loaded', { hasLibrary: !!library });

  // بناء خريطة الشخصيات
  const charMap = {};
  for (const char of (screenplay.characters || [])) {
    charMap[char.name] = char.role || 'supporting';
  }

  let totalLines   = 0;
  let fixedLines   = 0;

  for (const act of screenplay.acts) {
    for (const scene of act.scenes) {
      for (const line of (scene.dialogue || [])) {
        totalLines++;
        const role    = charMap[line.character] || 'supporting';
        const pattern = DIALOGUE_PATTERNS[role] || DIALOGUE_PATTERNS.supporting;

        // فحص الكليشيهات
        const hasCliche = pattern.forbidden.some(f =>
          line.line.includes(f)
        );

        if (hasCliche) {
          line.line    = rephraseCliché(line.line, role, pattern);
          line.fixed   = true;
          fixedLines++;
        }

        // إضافة توجيه التمثيل إذا غائب
        if (!line.direction) {
          line.direction = buildDirection(line.emotion, role);
        }

        // إضافة صمت درامي للتوتر
        if (line.emotion === 'توتر' && !line.line.startsWith('...')) {
          line.line = `...${line.line}`;
        }

        // Show don't tell — إزالة التفسير المباشر
        line.line = removeDirectExplanation(line.line);
      }
    }
  }

  logger.info('[OK] Dialogue polished', { totalLines, fixedLines });
  return screenplay;
}

// ── إعادة صياغة الكليشيه ─────────────────
function rephraseCliché(line, role, pattern) {
  // إزالة الجملة الكليشيه واستبدالها بصمت أو فعل
  const alternatives = {
    protagonist: [
      '(يتوقف — ينظر بعيداً)',
      'ربما...',
      'لا أعرف بعد.',
      '(يمسك سلاحه بصمت)',
    ],
    antagonist: [
      'أنت لا تفهم بعد.',
      'كل شيء له ثمن.',
      'هذا ليس شراً — هذا ضرورة.',
      '(يبتسم) سترى.',
    ],
    supporting: [
      'هل أنت متأكد؟',
      'أسمعك.',
      '(يلتفت) انظر.',
      'ماذا تريد أن تفعل؟',
    ],
  };
  const pool = alternatives[role] || alternatives.supporting;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── توجيه التمثيل ────────────────────────
function buildDirection(emotion, role) {
  const directions = {
    'توتر':  'بصوت منخفض متحكم — لا صراخ',
    'حزن':   'ببطء — مع إيقاف قصير بين الجمل',
    'أمل':   'بنبرة هادئة واثقة',
    'خوف':   'بسرعة — مع تنفس مسموع',
    'حماس':  'بطاقة — لكن ليس مبالغاً',
    'هدوء':  'بعمق وثقة — كأنه يعرف أكثر مما يقول',
  };
  return directions[emotion] || 'بشكل طبيعي — دون مبالغة';
}

// ── إزالة التفسير المباشر ─────────────────
function removeDirectExplanation(line) {
  // أنماط تُخبر بدل أن تُظهر
  const patterns = [
    /أنا (حزين|خائف|سعيد|غاضب) لأن/g,
    /كما تعلم[،،]? /g,
    /دعني أوضح[،،]? /g,
    /في الواقع[،،]? /g,
  ];
  let result = line;
  for (const p of patterns) {
    result = result.replace(p, '');
  }
  return result.trim();
}
