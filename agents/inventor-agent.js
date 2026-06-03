/**
 * inventor-agent.js — v2.0
 *
 * التغييرات عن v1.0:
 *  - مبدأ الاكتمال المطلق: تحقق من الحصة قبل البدء
 *  - build: maxOutputTokens 8192 → 32768
 *  - build: temperature 0.7 → 0.2
 *  - evaluate: يرى الكود كاملاً (بدل 500 حرف)
 *  - دورات متعددة: كل دورة تتحقق من الحصة قبلها
 *  - لا توازي — تسلسل كامل أو توقف
 *
 * القواعد المطبقة:
 *  rule-056 : soulContext قبل كل عمل
 *  rule-087 : askGemini(prompt, temp, options, caller)
 *  rule-089 : كل الردود JSON
 *  rule-097 : لا تغيير للنموذج
 *  rule-098 : askGemini فقط
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-101 : maxOutputTokens لا maxTokens
 *  rule-102 : لا JSON.parse
 *  rule-115 : يعمل كل أحد — العبقرية أو لا شيء
 *  rule-123 : الاختراعات تُنشر على itch.io و Ko-fi
 *  rule-128 : caller logging
 *
 *  rule-150 : تسلسل كامل: explore → build → evaluate
 *  rule-151 : build maxOutputTokens = 32,768
 *  rule-152 : تحقق من الحصة قبل كل دورة
 *  rule-153 : مبدأ الاكتمال المطلق — لا أنصاف
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname }  from 'path';
import { fileURLToPath }  from 'url';
import { askGemini, getRemainingQuota } from './_gemini.js';
import { soulContext }    from './_soul.js';
import { readForAgent }   from './library-builder-agent.js';
import { logger }         from '../logger.js';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(__dirname, '..', 'godot-recipes');
const MEMORY_PATH = join(__dirname, '..', 'code-memory.json');

// تكلفة دورة اختراع واحدة كاملة
const CYCLE_COST = 3; // explore + build + evaluate

const INVENTION_DOMAINS = [
  { id: 'movement',  label: 'حركة وفيزياء'    },
  { id: 'shaders',   label: 'بصريات وتأثيرات' },
  { id: 'ai',        label: 'ذكاء الأعداء'     },
  { id: 'audio',     label: 'صوت وموسيقى'      },
  { id: 'ui',        label: 'واجهة وتجربة'     },
  { id: 'world',     label: 'بناء العوالم'      },
  { id: 'weapons',   label: 'أسلحة وقتال'      },
  { id: 'time',      label: 'زمن وذاكرة'       },
];

const GENIUS_CRITERIA = [
  'الفكرة لا تشبه أي وصفة موجودة',
  'الكود يعمل في Godot 4.6.2 بلا أخطاء',
  'تضيف تجربة لا يستطيع اللاعب نسيانها',
  'تتوافق مع روح الكون',
  'لا تتجاوز 200 سطر في الوصفة الواحدة',
];

// ══════════════════════════════════════════════════════════
// الدالة الرئيسية
// ══════════════════════════════════════════════════════════
export async function run(universe) {
  logger.info('[INVENTOR] Awakening v2.0...');

  const soul     = soulContext('inventorAgent');
  const library  = readForAgent('inventor-agent', 12);
  const existing = loadExistingRecipes();
  const memory   = loadMemory();
  const domains  = calculateHunger(existing);

  logger.info('[INVENTOR] State', {
    existingRecipes: existing.length,
    quotaLeft:       getRemainingQuota(),
    hungriestDomain: domains[0].id,
  });

  const results = [];
  let   cycleNumber = 1;

  // ── دورات متعددة — كل دورة مستقلة كاملة ──────────────
  while (true) {
    const quota = getRemainingQuota();

    // rule-153: تحقق من الحصة قبل كل دورة
    if (quota < CYCLE_COST) {
      logger.warn(`[INVENTOR] Not enough quota for full cycle — need ${CYCLE_COST}, have ${quota} — stopping`);
      break;
    }

    logger.info(`[INVENTOR] Starting cycle ${cycleNumber}`, { quotaLeft: quota });

    const result = await runCycle(soul, library, universe, domains, existing, memory, cycleNumber);

    if (result.invented) {
      results.push(result);
      logger.info(`[INVENTOR] Cycle ${cycleNumber} succeeded`, { name: result.name });

      // أضف الوصفة الجديدة للقائمة حتى لا تتكرر في الدورة التالية
      existing.push({ name: result.name, domain: result.domain });

      // أعد حساب الجوع بعد كل دورة ناجحة
      domains.splice(0, domains.length, ...calculateHunger(existing));
    } else {
      logger.warn(`[INVENTOR] Cycle ${cycleNumber} failed`, { reason: result.reason });
      // فشل الدورة لا يوقف البرنامج — نحاول الدورة التالية إذا بقيت حصة
    }

    cycleNumber++;

    // لا تتجاوز 3 دورات في اليوم الواحد (حفاظاً على حصة باقي الوكلاء)
    if (cycleNumber > 3) {
      logger.info('[INVENTOR] Max cycles reached (3) — stopping');
      break;
    }
  }

  logger.info('[INVENTOR] Done', {
    cycles:    cycleNumber - 1,
    succeeded: results.length,
    quotaLeft: getRemainingQuota(),
  });

  return {
    invented:    results.length > 0,
    inventions:  results,
    totalCycles: cycleNumber - 1,
  };
}

// ══════════════════════════════════════════════════════════
// دورة اختراع واحدة كاملة
// ══════════════════════════════════════════════════════════
async function runCycle(soul, library, universe, domains, existing, memory, cycleNumber) {
  // ── المرحلة 1: الاستكشاف ──────────────────────────────
  logger.info(`[INVENTOR] Cycle ${cycleNumber} — Phase 1/3: Explore`);
  let idea;
  try {
    idea = await explore(soul, library, universe, domains, existing, memory);
  } catch (err) {
    logger.error(`[INVENTOR] Explore failed`, { error: err.message });
    return { invented: false, reason: 'explore-failed' };
  }

  if (!idea?.name) {
    logger.warn('[INVENTOR] No worthy idea emerged');
    return { invented: false, reason: 'no-worthy-idea' };
  }
  logger.info(`[INVENTOR] Idea: ${idea.label}`, { domain: idea.domain });

  // ── المرحلة 2: البناء ─────────────────────────────────
  // rule-153: تحقق من الحصة قبل المرحلة الثانية
  if (getRemainingQuota() < 2) {
    logger.warn('[INVENTOR] Not enough quota for build+evaluate — aborting cycle');
    return { invented: false, reason: 'quota-insufficient-after-explore' };
  }

  logger.info(`[INVENTOR] Cycle ${cycleNumber} — Phase 2/3: Build`);
  let invention;
  try {
    invention = await build(soul, library, idea, universe);
  } catch (err) {
    logger.error(`[INVENTOR] Build failed`, { error: err.message });
    recordFailure(idea, 'build-failed', [], memory);
    return { invented: false, reason: 'build-failed' };
  }

  if (!invention?.code || typeof invention.code !== 'string' || invention.code.length < 50) {
    logger.warn('[INVENTOR] Build produced empty code');
    recordFailure(idea, 'empty-code', [], memory);
    return { invented: false, reason: 'empty-code' };
  }
  logger.info(`[INVENTOR] Built: ${invention.filename}`, { codeLength: invention.code.length });

  // ── المرحلة 3: تقييم العبقرية ─────────────────────────
  // rule-153: تحقق من الحصة قبل التقييم
  if (getRemainingQuota() < 1) {
    logger.warn('[INVENTOR] Not enough quota for evaluate — aborting cycle');
    return { invented: false, reason: 'quota-insufficient-before-evaluate' };
  }

  logger.info(`[INVENTOR] Cycle ${cycleNumber} — Phase 3/3: Evaluate`);
  let verdict;
  try {
    verdict = await evaluate(soul, library, idea, invention, existing);
  } catch (err) {
    logger.error(`[INVENTOR] Evaluate failed`, { error: err.message });
    recordFailure(idea, 'evaluate-failed', [], memory);
    return { invented: false, reason: 'evaluate-failed' };
  }

  if (!verdict?.isGenius) {
    logger.warn('[INVENTOR] Rejected', { failed: verdict?.failedCriteria });
    recordFailure(idea, 'not-genius', verdict?.failedCriteria || [], memory);
    return { invented: false, reason: 'not-genius', criteria: verdict?.failedCriteria };
  }

  // ── النشر ─────────────────────────────────────────────
  logger.info(`[INVENTOR] Publishing: ${idea.label}`);
  publish(idea, invention, verdict, memory);

  return {
    invented:  true,
    name:      idea.name,
    label:     idea.label,
    domain:    idea.domain,
    filename:  invention.filename,
    impact:    verdict.impact,
    score:     verdict.score,
    verdict:   verdict.verdict,
  };
}

// ══════════════════════════════════════════════════════════
// المرحلة 1 — الاستكشاف
// ══════════════════════════════════════════════════════════
async function explore(soul, library, universe, domains, existing, memory) {
  const hungriestDomain = domains[0];
  const existingNames   = existing.map(r => r.name).join(', ') || 'none yet';
  const recentFailures  = (memory['error-log'] || [])
    .filter(e => e.date >= getDateDaysAgo(7))
    .map(e => e.description)
    .slice(0, 5)
    .join(' | ') || 'none';

  return await askGemini(`${soul}
${library}

أنت المخترع — عقل يبحث عن الجوهر الخفي في Godot 4.6.2.

حالة المكتبة:
- الوصفات الموجودة: ${existingNames}
- المنطقة الأكثر جوعاً: ${hungriestDomain.label}
- الأخطاء الأخيرة: ${recentFailures}
- روح الكون: "${universe?.soul?.essence || 'unknown cosmos'}"

مهمتك: اقترح فكرة اختراع واحدة فقط في منطقة "${hungriestDomain.label}".

القواعد الذهبية:
- لا تقترح ما هو موجود بالفعل
- الفكرة تجعل اللاعب يشعر بشيء لم يشعر به من قبل
- تستغل قدرة حقيقية في Godot 4.6.2
- تتناغم مع روح الكون

أنتج JSON فقط — بدون أي نص خارج JSON:
{
  "name":               "اسم الاختراع بالإنجليزية (slug)",
  "label":              "الاسم الشاعري",
  "domain":             "${hungriestDomain.id}",
  "godotFeature":       "ميزة Godot 4.6.2 المستخدمة",
  "poeticVision":       "وصف شاعري لما سيشعر به اللاعب",
  "technicalApproach":  "الأسلوب التقني بإيجاز",
  "uniqueness":         "لماذا لا يشبه أي شيء موجود"
}`,
    0.95,
    { maxOutputTokens: 4096, topP: 0.98 },
    'inventor-agent'
  );
}

// ══════════════════════════════════════════════════════════
// المرحلة 2 — البناء
// ══════════════════════════════════════════════════════════
async function build(soul, library, idea, universe) {
  return await askGemini(`${soul}
${library}

أنت المخترع — الآن تبني بلا تنازل.

الاختراع: "${idea.label}"
الرؤية: ${idea.poeticVision}
الأسلوب التقني: ${idea.technicalApproach}
ميزة Godot المستخدمة: ${idea.godotFeature}
روح الكون: ${universe?.soul?.essence || ''}

اكتب الوصفة الكاملة — لا اختصار — لا حذف.

القواعد الصارمة:
- Godot 4.6.2 فقط — لا شيء من Godot 3.x
- tabs للـ indentation — ليس spaces
- كل دالة لها هدف واحد واضح
- لا كود ميت أو تعليقات زائدة
- الوصفة تعمل بمفردها (standalone)
- أقل من 200 سطر
- إذا shader: اكتب GLSL صحيح لـ Godot 4.6.2

أنتج JSON فقط — بدون أي نص خارج JSON:
{
  "filename":     "${idea.name}.gd أو ${idea.name}.gdshader",
  "language":     "gdscript أو glsl",
  "code":         "الكود الكامل هنا — لا اختصار",
  "usage":        "كيف يستخدم code-agent هذه الوصفة",
  "parameters":   [{ "name": "...", "type": "...", "default": "...", "description": "..." }],
  "dependencies": ["ما تحتاجه من nodes أو ملفات أخرى"]
}`,
    0.2,
    { maxOutputTokens: 32768, topP: 0.85 },
    'inventor-agent'
  );
}

// ══════════════════════════════════════════════════════════
// المرحلة 3 — تقييم العبقرية
// ══════════════════════════════════════════════════════════
async function evaluate(soul, library, idea, invention, existing) {
  const existingNames = existing.slice(0, 5).map(r => r.name).join(', ');

  return await askGemini(`${soul}
${library}

أنت القاضي الأعلى للعبقرية في هذا الكون.
كن قاسياً — العبقرية نادرة.

الاختراع المُقدَّم:
الاسم: ${idea.label}
الرؤية: ${idea.poeticVision}
الكود الكامل:
${invention.code}

الوصفات الموجودة: ${existingNames}

قيّم بناءً على المعايير الذهبية:
${GENIUS_CRITERIA.map((c, i) => `${i + 1}. ${c}`).join('\n')}

أنتج JSON فقط — بدون أي نص خارج JSON:
{
  "isGenius":       true,
  "score":          0,
  "passedCriteria": ["..."],
  "failedCriteria": ["..."],
  "impact":         "كيف سيغير هذا تجربة اللاعب",
  "verdict":        "حكم شاعري في جملة واحدة"
}`,
    0.3,
    { maxOutputTokens: 4096 },
    'inventor-agent'
  );
}

// ══════════════════════════════════════════════════════════
// النشر
// ══════════════════════════════════════════════════════════
function publish(idea, invention, verdict, memory) {
  const domainDir = join(RECIPES_DIR, idea.domain);
  if (!existsSync(domainDir)) mkdirSync(domainDir, { recursive: true });

  // كتابة الكود
  writeFileSync(join(domainDir, invention.filename), invention.code, 'utf8');

  // كتابة الـ meta
  const meta = {
    name:         idea.name,
    label:        idea.label,
    domain:       idea.domain,
    godotFeature: idea.godotFeature,
    poeticVision: idea.poeticVision,
    usage:        invention.usage,
    parameters:   invention.parameters  || [],
    dependencies: invention.dependencies || [],
    verdict:      verdict.verdict,
    impact:       verdict.impact,
    score:        verdict.score,
    inventedAt:   new Date().toISOString(),
  };

  writeFileSync(
    join(domainDir, `${idea.name}.meta.json`),
    JSON.stringify(meta, null, 2), 'utf8'
  );

  updateLibraryIndex(meta);
  recordInvention(idea, invention, verdict, memory);

  logger.info('[OK] Invention published', {
    name:    idea.name,
    domain:  idea.domain,
    file:    invention.filename,
    score:   verdict.score,
  });
}

// ══════════════════════════════════════════════════════════
// دوال مساعدة
// ══════════════════════════════════════════════════════════
function loadExistingRecipes() {
  if (!existsSync(RECIPES_DIR)) { mkdirSync(RECIPES_DIR, { recursive: true }); return []; }
  const recipes = [];
  for (const domain of INVENTION_DOMAINS) {
    const dir = join(RECIPES_DIR, domain.id);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter(f => f.endsWith('.meta.json'))) {
      try { recipes.push(JSON.parse(readFileSync(join(dir, file), 'utf8'))); } catch {}
    }
  }
  return recipes;
}

function loadMemory() {
  if (!existsSync(MEMORY_PATH)) return { rules: [], 'error-log': [], inventions: [] };
  try { return JSON.parse(readFileSync(MEMORY_PATH, 'utf8')); }
  catch { return { rules: [], 'error-log': [], inventions: [] }; }
}

function calculateHunger(existing) {
  const counts = {};
  for (const d of INVENTION_DOMAINS) counts[d.id] = 0;
  for (const r of existing) if (counts[r.domain] !== undefined) counts[r.domain]++;
  return INVENTION_DOMAINS
    .map(d => ({ ...d, hunger: counts[d.id] }))
    .sort((a, b) => a.hunger - b.hunger);
}

function updateLibraryIndex(meta) {
  const indexPath = join(RECIPES_DIR, 'index.json');
  let index = [];
  if (existsSync(indexPath)) { try { index = JSON.parse(readFileSync(indexPath, 'utf8')); } catch {} }
  index = index.filter(r => r.name !== meta.name);
  index.unshift(meta);
  writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
}

function recordInvention(idea, invention, verdict, memory) {
  if (!memory.inventions) memory.inventions = [];
  memory.inventions.unshift({
    name:     idea.name,
    domain:   idea.domain,
    score:    verdict.score,
    verdict:  verdict.verdict,
    filename: invention.filename,
    date:     new Date().toISOString().slice(0, 10),
  });
  writeFileSync(MEMORY_PATH, JSON.stringify(memory, null, 2), 'utf8');
}

function recordFailure(idea, reason, details, memory) {
  const log    = memory['error-log'] || [];
  const lastId = log.length > 0
    ? parseInt(log[0].id?.replace('err-', '') || 200) + 1
    : 200;
  log.unshift({
    id:          `err-${lastId}`,
    date:        new Date().toISOString().slice(0, 10),
    severity:    'low',
    description: `inventor-agent: ${reason} — ${idea?.name || 'unknown'} — ${(details || []).join(', ')}`,
    fixed:       false,
  });
  memory['error-log'] = log;
  writeFileSync(MEMORY_PATH, JSON.stringify(memory, null, 2), 'utf8');
}

function getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
