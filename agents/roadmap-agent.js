/**
 * roadmap-agent.js — v1.1
 *
 * التغييرات عن v1.0:
 *  - إضافة caller (rule-087, rule-128)
 *  - إضافة maxOutputTokens (rule-101)
 *  - إضافة canAfford (rule-153)
 *  - إضافة soulContext (rule-056)
 *  - prompt بالعربية — المشروع عربي
 *  - [INFO]/[OK]/[ERROR]/[WARN] (rule-099)
 *
 * القواعد المطبقة:
 *  rule-056 : soulContext قبل كل عمل
 *  rule-087 : askGemini(prompt, temp, options, caller)
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-101 : maxOutputTokens
 *  rule-102 : لا JSON.parse
 *  rule-128 : caller logging
 *  rule-153 : canAfford قبل البدء
 */

import { askGemini, canAfford } from './_gemini.js';
import { soulContext }          from './_soul.js';
import { readForAgent }         from './library-builder-agent.js';
import { logger }               from '../logger.js';

// ══════════════════════════════════════════════════════════
// fallback عند الفشل
// ══════════════════════════════════════════════════════════
function fallbackRoadmap(reason) {
  return {
    weekPriority:   'تحسين الجودة والاحتفاظ بالجمهور',
    tasks: [
      { task: 'إصلاح الأخطاء المُبلَّغ عنها وتحسين الأداء', priority: 'high',   reason },
      { task: 'إضافة محتوى جديد وجذاب',                      priority: 'medium', reason },
      { task: 'مراجعة التحليلات لفرص النمو',                  priority: 'low',    reason },
    ],
    focusArea:      'quality',
    revenueGoal:    'نمو تدريجي',
    recommendation: 'ركّز على إصلاح المشاكل وإضافة قيمة للجمهور',
    createdAt:      new Date().toISOString(),
  };
}

// ══════════════════════════════════════════════════════════
// الدالة الرئيسية
// ══════════════════════════════════════════════════════════
export async function run({ analytics, feedback, idea, code, universe } = {}) {
  logger.info('[ROADMAP] Generating weekly roadmap');

  // rule-153: تحقق من الحصة
  if (!canAfford('roadmap')) {
    logger.warn('[ROADMAP] Insufficient quota — using fallback');
    return fallbackRoadmap('InsufficientQuota');
  }

  // rule-056: soulContext
  const soul    = soulContext('roadmap-agent');
  const library = readForAgent('roadmap-agent', 6);

  const prompt = `${soul}
${library}

أنت مدير منتج محترف لمشروع ألعاب ومسلسلات رقمية.

البيانات الحالية:
- اتجاه الإيرادات: ${analytics?.trend || 'غير معروف'}
- إجمالي الإيرادات: $${analytics?.totals?.revenueUSD ?? 0}
- هذا الأسبوع: $${analytics?.thisWeek?.revenueUSD ?? 0}
- نقاط الضعف: ${feedback?.weaknesses?.join(', ') || 'لا يوجد'}
- أنواع مفقودة: ${feedback?.missingTypes?.join(', ') || 'لا يوجد'}
- لعبة جديدة هذا الأسبوع: ${idea?.name?.en || idea?.name?.ar || 'لا يوجد'} (${code?.skipped ? 'تم تخطيها' : 'مضافة'})
- الكون الحالي: ${universe?.name?.ar || universe?.name?.en || 'غير محدد'}
- عدد العوالم: ${universe?.worlds?.length || 0}
- عدد الحلقات: ${analytics?.series?.totalEpisodes || 0}

ضع خطة الأسبوع القادم. أنتج JSON فقط — بدون أي نص خارج JSON:
{
  "weekPriority":   "الأولوية الرئيسية هذا الأسبوع",
  "tasks": [
    { "task": "المهمة الأولى",  "priority": "high",   "reason": "السبب" },
    { "task": "المهمة الثانية", "priority": "medium",  "reason": "السبب" },
    { "task": "المهمة الثالثة", "priority": "low",     "reason": "السبب" }
  ],
  "focusArea":      "marketing | content | quality | growth",
  "revenueGoal":    "هدف الإيرادات الأسبوعي",
  "recommendation": "توصية واحدة جوهرية"
}`;

  let roadmap;
  try {
    roadmap = await askGemini(
      prompt, 0.6,
      { maxOutputTokens: 2048, topP: 0.85 },
      'roadmap-agent'
    );
  } catch (err) {
    logger.error('[ROADMAP] Generation failed — using fallback', { error: err.message });
    return fallbackRoadmap(err.message);
  }

  if (!roadmap || typeof roadmap !== 'object') {
    logger.warn('[ROADMAP] Invalid response — using fallback');
    return fallbackRoadmap('Invalid response');
  }

  // تأكيد الحقول الأساسية
  if (!roadmap.weekPriority) roadmap.weekPriority = 'استمر في التحسين';
  if (!Array.isArray(roadmap.tasks) || !roadmap.tasks.length) {
    roadmap.tasks = [
      { task: 'مراجعة مقاييس الأداء',   priority: 'high',   reason: 'ضمان الاستقرار' },
      { task: 'التخطيط للميزات القادمة', priority: 'medium', reason: 'الحفاظ على الزخم' },
      { task: 'التفاعل مع الجمهور',      priority: 'low',    reason: 'بناء المجتمع' },
    ];
  }

  roadmap.createdAt = new Date().toISOString();

  logger.info('[OK] Roadmap created', {
    focus: roadmap.focusArea,
    goal:  roadmap.revenueGoal,
  });

  return roadmap;
}
