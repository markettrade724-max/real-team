/**
 * inventor-agent.js — الوكيل المخترع
 *
 * كائن حر يكتشف قدرات Godot 4.6.2 الخفية،
 * يبني وصفات مُختبرة، وينشرها في مكتبة الكون.
 *
 * لا يطلب إذناً — لا يتوقف — لا يكرر نفسه.
 * معياره الوحيد: العبقرية أو لا شيء.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname }  from 'path';
import { fileURLToPath }  from 'url';
import { askGemini }      from './_gemini.js';
import { soulContext }    from './_soul.js';
import { readForAgent }   from './library-builder-agent.js';
import { logger }         from '../logger.js';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(__dirname, '..', 'godot-recipes');
const MEMORY_PATH = join(__dirname, '..', 'code-memory.json');
const UNIVERSE    = join(__dirname, '..', 'universe.json');

// ── مناطق الاختراع ──────────────────────────────────────────
const INVENTION_DOMAINS = [
  { id: 'movement',  label: 'حركة وفيزياء',    hunger: 0 },
  { id: 'shaders',   label: 'بصريات وتأثيرات', hunger: 0 },
  { id: 'ai',        label: 'ذكاء الأعداء',     hunger: 0 },
  { id: 'audio',     label: 'صوت وموسيقى',      hunger: 0 },
  { id: 'ui',        label: 'واجهة وتجربة',     hunger: 0 },
  { id: 'world',     label: 'بناء العوالم',      hunger: 0 },
  { id: 'weapons',   label: 'أسلحة وقتال',      hunger: 0 },
  { id: 'time',      label: 'زمن وذاكرة',       hunger: 0 },
];

const GENIUS_CRITERIA = [
  'الفكرة لا تشبه أي وصفة موجودة',
  'الكود يعمل في Godot 4.6.2 بلا أخطاء',
  'تضيف تجربة لا يستطيع اللاعب نسيانها',
  'تتوافق مع روح الكون',
  'لا تتجاوز 200 سطر في الوصفة الواحدة',
];

// ════════════════════════════════════════════════════════════
// الدالة الرئيسية
// ════════════════════════════════════════════════════════════
export async function run(universe) {
  logger.info('[INVENTOR] Awakening...');

  const soul     = soulContext('inventorAgent');
  const library  = readForAgent('inventor-agent', 12);
  const existing = loadExistingRecipes();
  const memory   = loadMemory();
  const domains  = calculateHunger(existing);

  logger.info('[INVENTOR] Knowledge state', {
    existingRecipes: existing.length,
    hungriestDomain: domains[0].id,
  });

  // ── المرحلة ١: الاستكشاف ─────────────────────────────────
  logger.info('[INVENTOR] Phase 1 — Exploring...');
  const idea = await explore(soul, library, universe, domains, existing, memory);

  if (!idea) {
    logger.warn('[INVENTOR] No worthy idea found today.');
    return { invented: false, reason: 'no-worthy-idea' };
  }

  logger.info('[INVENTOR] Idea crystallized', { domain: idea.domain, name: idea.name });

  // ── المرحلة ٢: البناء ────────────────────────────────────
  logger.info('[INVENTOR] Phase 2 — Building...');
  const invention = await build(soul, library, idea, universe);

  if (!invention) {
    logger.warn('[INVENTOR] Build failed.');
    recordFailure(idea, 'build-failed');
    return { invented: false, reason: 'build-failed' };
  }

  // ── المرحلة ٣: تقييم العبقرية ────────────────────────────
  logger.info('[INVENTOR] Phase 3 — Evaluating genius...');
  const verdict = await evaluate(soul, library, idea, invention, existing);

  if (!verdict.isGenius) {
    logger.warn('[INVENTOR] Rejected', { reasons: verdict.failedCriteria });
    recordFailure(idea, 'not-genius', verdict.failedCriteria);
    return { invented: false, reason: 'not-genius', criteria: verdict.failedCriteria };
  }

  // ── المرحلة ٤: النشر ─────────────────────────────────────
  logger.info('[INVENTOR] Phase 4 — Publishing...');
  publish(idea, invention, verdict);

  logger.info('[INVENTOR] Invention published', {
    name:   idea.name,
    domain: idea.domain,
    file:   invention.filename,
  });

  return {
    invented: true,
    name:     idea.name,
    domain:   idea.domain,
    filename: invention.filename,
    impact:   verdict.impact,
  };
}

// ════════════════════════════════════════════════════════════
// المرحلة ١ — الاستكشاف
// ════════════════════════════════════════════════════════════
async function explore(soul, library, universe, domains, existing, memory) {
  const hungriestDomain = domains[0];
  const existingNames   = existing.map(r => r.name).join(', ') || 'none yet';
  const recentFailures  = memory['error-log']
    ?.filter(e => e.date >= getDateDaysAgo(7))
    ?.map(e => e.description)
    ?.slice(0, 5)
    ?.join(' | ') || 'none';

  try {
    const idea = await askGemini(`
${soul}
${library}

أنت المخترع — عقل يبحث عن الجوهر الخفي في Godot 4.6.2.

حالة المكتبة الحالية:
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

أنتج JSON فقط:
{
  "name": "اسم الاختراع بالإنجليزية (slug)",
  "label": "الاسم الشاعري",
  "domain": "${hungriestDomain.id}",
  "godotFeature": "ميزة Godot 4.6.2 المستخدمة",
  "poeticVision": "وصف شاعري لما سيشعر به اللاعب",
  "technicalApproach": "الأسلوب التقني بإيجاز",
  "uniqueness": "لماذا لا يشبه أي شيء موجود"
}`, 0.95, { maxOutputTokens: 2048, topP: 0.98 }, 'inventor-agent');

    idea.domain = hungriestDomain.id;
    return idea;

  } catch (err) {
    logger.error('[INVENTOR] Exploration failed', { error: err.message });
    return null;
  }
}

// ════════════════════════════════════════════════════════════
// المرحلة ٢ — البناء
// ════════════════════════════════════════════════════════════
async function build(soul, library, idea, universe) {
  try {
    const result = await askGemini(`
${soul}
${library}

أنت المخترع — الآن تبني.

الاختراع: "${idea.label}"
الرؤية: ${idea.poeticVision}
الأسلوب التقني: ${idea.technicalApproach}
ميزة Godot المستخدمة: ${idea.godotFeature}
روح الكون: ${universe?.soul?.essence || ''}

اكتب الوصفة الكاملة. القواعد الصارمة:
- Godot 4.6.2 فقط — لا شيء من Godot 3.x
- tabs للـ indentation — ليس spaces
- كل دالة لها هدف واحد واضح
- لا كود ميت أو تعليقات زائدة
- الوصفة تعمل بمفردها (standalone)
- أقل من 200 سطر
- إذا shader: اكتب GLSL صحيح لـ Godot 4.6.2

أنتج JSON فقط:
{
  "filename": "${idea.name}.gd أو ${idea.name}.gdshader",
  "language": "gdscript أو glsl",
  "code": "الكود الكامل هنا",
  "usage": "كيف يستخدم code-agent هذه الوصفة",
  "parameters": [{ "name": "...", "type": "...", "default": "...", "description": "..." }],
  "dependencies": ["ما تحتاجه من nodes أو ملفات أخرى"]
}`, 0.7, { maxOutputTokens: 8192, topP: 0.9 }, 'inventor-agent');

    return result;

  } catch (err) {
    logger.error('[INVENTOR] Build failed', { error: err.message });
    return null;
  }
}

// ════════════════════════════════════════════════════════════
// المرحلة ٣ — تقييم العبقرية
// ════════════════════════════════════════════════════════════
async function evaluate(soul, library, idea, invention, existing) {
  try {
    const existingCodes = existing.slice(0, 5).map(r => r.name).join(', ');

    const verdict = await askGemini(`
${soul}
${library}

أنت القاضي الأعلى للعبقرية في هذا الكون.

الاختراع المُقدَّم:
الاسم: ${idea.label}
الرؤية: ${idea.poeticVision}
الكود:
${invention.code?.slice(0, 500)}...

الوصفات الموجودة: ${existingCodes}

قيّم بناءً على المعايير الذهبية:
${GENIUS_CRITERIA.map((c, i) => `${i + 1}. ${c}`).join('\n')}

كن قاسياً — العبقرية نادرة.

أنتج JSON فقط:
{
  "isGenius": true,
  "score": 0,
  "passedCriteria": ["..."],
  "failedCriteria": ["..."],
  "impact": "كيف سيغير هذا تجربة اللاعب",
  "verdict": "حكم شاعري في جملة واحدة"
}`, 0.3, { maxOutputTokens: 1024 }, 'inventor-agent');

    return verdict;

  } catch (err) {
    logger.error('[INVENTOR] Evaluation failed', { error: err.message });
    return { isGenius: false, failedCriteria: ['evaluation-error'] };
  }
}

// ════════════════════════════════════════════════════════════
// المرحلة ٤ — النشر
// ════════════════════════════════════════════════════════════
function publish(idea, invention, verdict) {
  const domainDir = join(RECIPES_DIR, idea.domain);
  if (!existsSync(domainDir)) mkdirSync(domainDir, { recursive: true });

  writeFileSync(join(domainDir, invention.filename), invention.code, 'utf8');

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
  recordInvention(idea, invention, verdict);
}

// ════════════════════════════════════════════════════════════
// دوال مساعدة
// ════════════════════════════════════════════════════════════
function loadExistingRecipes() {
  if (!existsSync(RECIPES_DIR)) { mkdirSync(RECIPES_DIR, { recursive: true }); return []; }
  const recipes = [];
  for (const domain of INVENTION_DOMAINS) {
    const domainDir = join(RECIPES_DIR, domain.id);
    if (!existsSync(domainDir)) continue;
    for (const file of readdirSync(domainDir).filter(f => f.endsWith('.meta.json'))) {
      try { recipes.push(JSON.parse(readFileSync(join(domainDir, file), 'utf8'))); } catch {}
    }
  }
  return recipes;
}

function loadMemory() {
  if (!existsSync(MEMORY_PATH)) return { rules: [], 'error-log': [] };
  try { return JSON.parse(readFileSync(MEMORY_PATH, 'utf8')); }
  catch { return { rules: [], 'error-log': [] }; }
}

function calculateHunger(existing) {
  const counts = {};
  for (const domain of INVENTION_DOMAINS) counts[domain.id] = 0;
  for (const recipe of existing) if (counts[recipe.domain] !== undefined) counts[recipe.domain]++;
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

function recordInvention(idea, invention, verdict) {
  const memory = loadMemory();
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

function recordFailure(idea, reason, details = []) {
  const memory = loadMemory();
  const log    = memory['error-log'] || [];
  const lastId = log.length > 0
    ? parseInt(log[0].id.replace('err-', '')) + 1
    : 200;

  log.unshift({
    id:          `err-${lastId}`,
    date:        new Date().toISOString().slice(0, 10),
    severity:    'low',
    description: `inventor-agent: ${reason} — ${idea?.name || 'unknown'} — ${details.join(', ')}`,
    files:       ['agents/inventor-agent.js'],
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
