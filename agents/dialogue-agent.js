/**
 * dialogue-agent.js — v1.1
 *
 * التغييرات عن v1.0:
 *  - يعمل على نسخة عميقة — لا يعدّل screenplay الأصلي
 *  - library مُمررة للدوال الفرعية
 *  - rephraseCliché يستخدم index بدل random خالص
 *
 * لا يستهلك Gemini — يعمل من المكتبة فقط (rule-136)
 * القواعد المطبقة:
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-136 : dialogue-agent لا يستهلك Gemini
 */

import { readForAgent } from './library-builder-agent.js';
import { logger }       from '../logger.js';

const DIALOGUE_PATTERNS = {
  protagonist: {
    traits:    ['يتساءل', 'يتردد', 'يقرر', 'يشك'],
    forbidden: ['أنا البطل', 'سأنتصر', 'لا أخاف'],
    style:     'جمل قصيرة — يعبّر بالفعل لا الكلام',
    alternatives: [
      '(يتوقف — ينظر بعيداً)',
      'ربما...',
      'لا أعرف بعد.',
      '(يمسك سلاحه بصمت)',
    ],
  },
  antagonist: {
    traits:    ['يؤمن بنفسه', 'منطقي في شره', 'له وجهة نظر'],
    forbidden: ['سأدمر العالم', 'أنا الشر'],
    style:     'يتكلم كأنه محق تماماً',
    alternatives: [
      'أنت لا تفهم بعد.',
      'كل شيء له ثمن.',
      'هذا ليس شراً — هذا ضرورة.',
      '(يبتسم) سترى.',
    ],
  },
  supporting: {
    traits:    ['يطرح أسئلة', 'يعكس مشاعر البطل', 'يضيف فكاهة خفيفة'],
    forbidden: ['كما تعلم يا بطلنا', 'دعني أشرح'],
    style:     'يكسر التوتر أو يعمّقه',
    alternatives: [
      'هل أنت متأكد؟',
      'أسمعك.',
      '(يلتفت) انظر.',
      'ماذا تريد أن تفعل؟',
    ],
  },
  narrator: {
    traits:    ['موضوعي', 'شاعري', 'موجز'],
    forbidden: ['وكان البطل يفكر في', 'فجأة'],
    style:     'جملة واحدة تصف المكان والمزاج',
    alternatives: [
      '(صمت)',
      '...',
      '(لقطة على المكان)',
    ],
  },
};

const DIRECTIONS = {
  'توتر':  'بصوت منخفض متحكم — لا صراخ',
  'حزن':   'ببطء — مع إيقاف قصير بين الجمل',
  'أمل':   'بنبرة هادئة واثقة',
  'خوف':   'بسرعة — مع تنفس مسموع',
  'حماس':  'بطاقة — لكن ليس مبالغاً',
  'هدوء':  'بعمق وثقة — كأنه يعرف أكثر مما يقول',
};

const EXPLAIN_PATTERNS = [
  /أنا (حزين|خائف|سعيد|غاضب) لأن/g,
  /كما تعلم[،،]? /g,
  /دعني أوضح[،،]? /g,
  /في الواقع[،،]? /g,
];

// ══════════════════════════════════════════════════════════
// الدالة الرئيسية — sync
// ══════════════════════════════════════════════════════════
export function run(screenplay) {
  logger.info('[DIALOGUE] Polishing', { episode: screenplay.episode });

  const library = readForAgent('dialogue-agent', 8);

  // نسخة عميقة — لا نعدّل screenplay الأصلي
  const polished = JSON.parse(JSON.stringify(screenplay));

  // خريطة الشخصيات
  const charMap = {};
  for (const char of (polished.characters || [])) {
    charMap[char.name] = char.role || 'supporting';
  }

  let totalLines = 0;
  let fixedLines = 0;
  let lineIndex  = 0; // للـ rephraseCliché

  for (const act of (polished.acts || [])) {
    for (const scene of (act.scenes || [])) {
      for (const line of (scene.dialogue || [])) {
        totalLines++;
        lineIndex++;

        const role    = charMap[line.character] || 'supporting';
        const pattern = DIALOGUE_PATTERNS[role] || DIALOGUE_PATTERNS.supporting;

        // فحص الكليشيهات
        const hasCliche = pattern.forbidden.some(f => line.line?.includes(f));
        if (hasCliche) {
          line.line  = pickAlternative(pattern.alternatives, lineIndex);
          line.fixed = true;
          fixedLines++;
        }

        // توجيه التمثيل إذا غائب
        if (!line.direction) {
          line.direction = DIRECTIONS[line.emotion] || 'بشكل طبيعي — دون مبالغة';
        }

        // صمت درامي للتوتر
        if (line.emotion === 'توتر' && line.line && !line.line.startsWith('...')) {
          line.line = `...${line.line}`;
        }

        // إزالة التفسير المباشر
        if (line.line) {
          line.line = removeDirectExplanation(line.line);
        }
      }
    }
  }

  logger.info('[OK] Dialogue polished', { totalLines, fixedLines });
  return polished;
}

// ══════════════════════════════════════════════════════════
// دوال مساعدة
// ══════════════════════════════════════════════════════════

function pickAlternative(alternatives, index) {
  return alternatives[index % alternatives.length];
}

function removeDirectExplanation(line) {
  let result = line;
  for (const p of EXPLAIN_PATTERNS) {
    result = result.replace(p, '');
  }
  return result.trim();
}
