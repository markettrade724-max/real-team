/**
 * idea-agent.js — v2.1
 *
 * التغييرات عن v2.0:
 *  - maxTokens → maxOutputTokens (rule-101)
 *  - إضافة caller (rule-087, rule-128)
 *  - إضافة soulContext (rule-056)
 *  - إضافة canAfford (rule-153)
 *  - learningContext يستخرج حقولاً محددة بدل slice عشوائي
 *  - 800 token → 2048 (يكفي JSON كامل مع هامش)
 *
 * القواعد المطبقة:
 *  rule-056 : soulContext قبل كل عمل
 *  rule-087 : askGemini(prompt, temp, options, caller)
 *  rule-089 : كل الردود JSON
 *  rule-097 : لا تغيير للنموذج
 *  rule-098 : askGemini فقط
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-101 : maxOutputTokens لا maxTokens
 *  rule-102 : لا JSON.parse — _gemini.js يُرجع كائن
 *  rule-128 : caller logging
 *  rule-153 : canAfford قبل البدء
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname }            from 'path';
import { fileURLToPath }            from 'url';
import { askGemini, canAfford }     from './_gemini.js';
import { soulContext }              from './_soul.js';
import { logger }                   from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ══════════════════════════════════════════════════════════
// أدوات مساعدة
// ══════════════════════════════════════════════════════════

function loadJSON(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (e) {
    logger.warn(`[WARN] Failed to load ${filePath}: ${e.message}`);
    return null;
  }
}

/**
 * يستخرج حقولاً محددة بدل slice عشوائي
 * يتجنب قطع JSON في المنتصف
 */
function buildLearningContext(analytics, roadmap, feedback) {
  const parts = [];

  if (analytics) {
    parts.push(`Analytics:
- topGenres: ${JSON.stringify(analytics.topGenres || [])}
- avgSession: ${analytics.avgSession || 'unknown'}
- recommendations: ${JSON.stringify((analytics.recommendations?.forIdeaAgent || []).slice(0, 3))}`);
  }

  if (roadmap) {
    parts.push(`Roadmap:
- nextMilestone: ${roadmap.nextMilestone || 'unknown'}
- gaps: ${JSON.stringify((roadmap.gaps || []).slice(0, 3))}`);
  }

  if (feedback) {
    parts.push(`Feedback:
- topRequests: ${JSON.stringify((feedback.topRequests || []).slice(0, 3))}
- avoid: ${JSON.stringify((feedback.avoid || []).slice(0, 3))}`);
  }

  return parts.length ? parts.join('\n\n') : '';
}

// ══════════════════════════════════════════════════════════
// الدالة الرئيسية
// ══════════════════════════════════════════════════════════

export async function run() {
  logger.info('[IDEA] Starting idea-agent v2.1');

  // rule-153: تحقق من الحصة قبل البدء
  if (!canAfford('idea')) {
    throw new Error('InsufficientQuota: idea-agent needs 1 call');
  }

  // rule-056: soulContext
  const soul = soulContext('idea-agent');

  // تحميل البيانات
  const products  = loadJSON(join(__dirname, '..', 'products.json')) || [];
  const roadmap   = loadJSON(join(__dirname, '..', 'agent-results', 'roadmap.json'));
  const feedback  = loadJSON(join(__dirname, '..', 'agent-results', 'feedback.json'));
  const analytics = loadJSON(join(__dirname, '..', 'agent-results', 'analytics.json'));

  if (!roadmap && !feedback && !analytics) {
    logger.warn('[WARN] No learning data found — running fresh');
  }

  const existingIds      = products.map(p => p.id).join(', ') || 'none';
  const learningContext  = buildLearningContext(analytics, roadmap, feedback);

  const prompt = `${soul}

أنت وكيل توليد أفكار ألعاب. مهمتك: فكرة كون لعبة فريدة.
${learningContext ? `\nبيانات التعلم:\n${learningContext}` : ''}

المعرّفات الموجودة (تجنّبها): ${existingIds}

القواعد:
- id فريد لا يشبه أياً من الموجودة
- type: godot للألعاب الجادة / phaser للخفيفة
- الفكرة تتناغم مع روح الكون

أنتج JSON فقط — بدون أي نص خارج JSON:
{
  "id":              "lowercase-slug-unique",
  "name":            { "en": "English Name", "ar": "الاسم العربي" },
  "desc":            { "en": "Short description", "ar": "وصف قصير" },
  "type":            "godot",
  "genre":           "action",
  "tags":            ["tag1", "tag2"],
  "category":        "game",
  "backgroundColor": "#1a1a2e",
  "fogColor":        "#16213e",
  "lightColor":      "#e2e2e2",
  "physics":         "gravity:9.8,bounce:0.3",
  "atmosphere":      "dark,mysterious"
}`;

  // rule-087, rule-101, rule-128
  const idea = await askGemini(
    prompt,
    0.9,
    { topP: 0.95, maxOutputTokens: 2048 },
    'idea-agent'
  );

  // التحقق من الحقول الإلزامية
  if (!idea || typeof idea !== 'object') {
    throw new Error('[IDEA] Invalid response from Gemini');
  }
  if (!idea.id || !idea.name?.en || !idea.name?.ar) {
    throw new Error(`[IDEA] Missing core fields: ${JSON.stringify(idea)}`);
  }
  if (!['game', 'app'].includes(idea.category)) {
    throw new Error(`[IDEA] Invalid category: ${idea.category}`);
  }

  // تأكد من فرادة الـ id
  let finalId = idea.id.toLowerCase().replace(/\s+/g, '-');
  while (products.find(p => p.id === finalId)) {
    finalId = `${finalId}-${Date.now().toString(36)}`;
  }
  idea.id = finalId;

  idea.generatedAt = new Date().toISOString();
  idea.generatedBy = 'idea-agent-v2.1';

  logger.info('[OK] Idea generated', {
    id:   idea.id,
    type: idea.type,
    name: idea.name.en,
  });

  return idea;
}
