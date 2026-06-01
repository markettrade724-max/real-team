/**
 * content-agent.js — وكيل المحتوى
 *
 * ينتج سكريبت فيديو 60 ثانية كل 8 ساعات
 * مزيج: حياة يومية + تقنية + دراما خفيفة + فكاهة ذكية
 * يحفظ المواضيع المستخدمة لتجنب التكرار (آخر 100 موضوع)
 *
 * rule-124: سكريبت 60 ثانية كل 8 ساعات
 * rule-125: content-topics.json لتجنب التكرار
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { askGemini }     from './_gemini.js';
import { readForAgent }  from './library-builder-agent.js';
import { logger }        from '../logger.js';

const __dirname     = dirname(fileURLToPath(import.meta.url));
const TOPICS_PATH   = join(__dirname, '..', 'content-topics.json');
const SCRIPTS_DIR   = join(__dirname, '..', 'agent-results', 'content');
const MAX_TOPICS    = 100;

// أنواع المحتوى المتناوبة
const CONTENT_TYPES = [
  { id: 'daily-life',  label: 'حياة يومية',        weight: 3 },
  { id: 'tech',        label: 'تقنية وذكاء اصطناعي', weight: 2 },
  { id: 'drama',       label: 'دراما خفيفة',        weight: 2 },
  { id: 'comedy',      label: 'فكاهة ذكية',         weight: 2 },
  { id: 'universe',    label: 'كون وألعاب',          weight: 1 },
];

// الأوقات الثلاثة
const SLOTS = ['morning', 'afternoon', 'night'];

// ════════════════════════════════════════════════════════════
// الدالة الرئيسية
// ════════════════════════════════════════════════════════════
export async function run(universe = null) {
  logger.info('[CONTENT] Starting content generation');

  mkdirSync(SCRIPTS_DIR, { recursive: true });

  const library      = readForAgent('content-agent', 10);
  const usedTopics   = loadUsedTopics();
  const slot         = getCurrentSlot();
  const contentType  = pickContentType(usedTopics);

  logger.info('[CONTENT] Planning', { slot, type: contentType.label });

  // توليد السكريبت
  let script;
  try {
    script = await askGemini(`
${library}

أنت صانع محتوى محترف لتيك توك ويوتيوب شورتس.

الوقت: ${slot === 'morning' ? 'الصباح' : slot === 'afternoon' ? 'الظهيرة' : 'الليل'}
النوع: ${contentType.label}
${universe ? `الكون: "${universe.name?.ar || universe.name?.en}"` : ''}

المواضيع المستخدمة مؤخراً (لا تكرر):
${usedTopics.slice(0, 15).map(t => `- ${t}`).join('\n') || 'لا يوجد بعد'}

اكتب سكريبت فيديو 60 ثانية.

القواعد:
- Hook قوي في أول 3 ثوانٍ — يجعل المشاهد يتوقف عن التمرير
- إيقاع سريع — جملة كل 3-5 ثوانٍ
- نهاية تحفز التعليق أو الحفظ
- لغة عربية محكية مفهومة للجميع
- لا مقدمات طويلة — ادخل مباشرة

أنتج JSON فقط:
{
  "topic": "الموضوع في جملة قصيرة",
  "type": "${contentType.id}",
  "slot": "${slot}",
  "hook": "الجملة الأولى — صادمة أو مثيرة للفضول",
  "duration": 60,
  "scenes": [
    {
      "time": "0-5",
      "text": "نص المشهد",
      "visual": "وصف ما يُرى",
      "tone": "طبيعي | متحمس | هادئ | مضحك | مثير"
    }
  ],
  "hashtags": ["#هاشتاق1", "#هاشتاق2"],
  "caption": "وصف المنشور بالعربي",
  "callToAction": "ماذا تريد من المشاهد أن يفعل"
}`, 0.9, { maxOutputTokens: 2048, topP: 0.95 }, 'content-agent');

  } catch (err) {
    logger.error('[CONTENT] Generation failed', { error: err.message });
    return { generated: false, error: err.message };
  }

  if (!script?.topic) {
    logger.warn('[CONTENT] Invalid script output');
    return { generated: false, error: 'invalid-output' };
  }

  // حفظ السكريبت
  const timestamp  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename   = `script-${slot}-${timestamp}.json`;
  const scriptPath = join(SCRIPTS_DIR, filename);

  writeFileSync(scriptPath, JSON.stringify({
    ...script,
    generatedAt: new Date().toISOString(),
    filename,
  }, null, 2), 'utf8');

  // تحديث المواضيع المستخدمة
  saveUsedTopic(script.topic, usedTopics);

  logger.info('[OK] Content script ready', {
    topic:    script.topic,
    type:     contentType.label,
    slot,
    file:     filename,
  });

  return {
    generated: true,
    topic:     script.topic,
    type:      contentType.id,
    slot,
    filename,
    hook:      script.hook,
  };
}

// ════════════════════════════════════════════════════════════
// اختيار نوع المحتوى بناءً على ما لم يُستخدم كثيراً
// ════════════════════════════════════════════════════════════
function pickContentType(usedTopics) {
  // عدّ كم مرة استُخدم كل نوع في آخر 20 موضوع
  const recent = usedTopics.slice(0, 20);
  const counts = {};
  for (const t of CONTENT_TYPES) counts[t.id] = 0;

  for (const topic of recent) {
    for (const t of CONTENT_TYPES) {
      if (topic.includes(t.label)) counts[t.id]++;
    }
  }

  // اختر الأقل استخداماً مع وزنه
  return CONTENT_TYPES
    .map(t => ({ ...t, score: counts[t.id] / t.weight }))
    .sort((a, b) => a.score - b.score)[0];
}

// ════════════════════════════════════════════════════════════
// الوقت الحالي → slot
// ════════════════════════════════════════════════════════════
function getCurrentSlot() {
  const hour = new Date().getUTCHours() + 3; // UTC+3 (KSA)
  if (hour >= 5  && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'night';
}

// ════════════════════════════════════════════════════════════
// إدارة المواضيع المستخدمة
// ════════════════════════════════════════════════════════════
function loadUsedTopics() {
  if (!existsSync(TOPICS_PATH)) return [];
  try {
    const data = JSON.parse(readFileSync(TOPICS_PATH, 'utf8'));
    return Array.isArray(data.topics) ? data.topics : [];
  } catch { return []; }
}

function saveUsedTopic(topic, existing) {
  const updated = [topic, ...existing].slice(0, MAX_TOPICS);
  writeFileSync(TOPICS_PATH, JSON.stringify({
    topics:    updated,
    updatedAt: new Date().toISOString(),
  }, null, 2), 'utf8');
}
