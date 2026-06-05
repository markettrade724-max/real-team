/**
 * _gemini.js — v2.4
 *
 * التغييرات عن v2.3:
 *  - getKeyForTask(): مفتاح واحد كامل للمهمة — لا خلط
 *  - sessionKey: يحافظ على نفس المفتاح طوال المهمة
 *  - rule-172: عمل كامل أو لا شيء — على مستوى المفتاح
 *
 * القواعد المطبقة:
 *  rule-097 : لا تغيير للنموذج — gemini-2.5-flash ثابت
 *  rule-098 : askGemini فقط — لا fetch مباشر
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-101 : maxOutputTokens لا maxTokens
 *  rule-122 : retry مرة واحدة فقط
 *  rule-128 : budget موحد + caller tracking
 *  rule-143 : MAX_TOKENS_CAP = 65536
 *  rule-145 : DEFAULT_TOKENS = 8192
 *  rule-153 : canAfford — عمل كامل أو لا شيء
 *  rule-172 : مفتاح واحد لكل مهمة كاملة — لا خلط
 */

import { GoogleGenAI } from '@google/genai';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';

const __dirname     = dirname(fileURLToPath(import.meta.url));
const LIBRARY_DIR   = join(__dirname, '..', 'library');
const BUDGET_PATH_1 = join(LIBRARY_DIR, 'budget.json');
const BUDGET_PATH_2 = join(LIBRARY_DIR, 'budget2.json');

const DAILY_LIMIT    = 20;
const MAX_TOKENS_CAP = 65536;
const DEFAULT_TOKENS = 8192;

// ══════════════════════════════════════════════════════════
// المفتاحان
// ══════════════════════════════════════════════════════════
const KEYS = [];

if (process.env.GEMINI_API_KEY) {
  KEYS.push({
    client:     new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }),
    budgetPath: BUDGET_PATH_1,
    label:      'KEY_1',
  });
}

if (process.env.GEMINI_API_KEY_2) {
  KEYS.push({
    client:     new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY_2 }),
    budgetPath: BUDGET_PATH_2,
    label:      'KEY_2',
  });
}

if (KEYS.length === 0) throw new Error('[GEMINI] No API keys configured');

logger.info(`[GEMINI] Loaded ${KEYS.length} key(s) — daily limit: ${KEYS.length * DAILY_LIMIT}`);

// ══════════════════════════════════════════════════════════
// الحصة — مستقلة لكل مفتاح
// ══════════════════════════════════════════════════════════
function loadBudget(budgetPath) {
  const today = new Date().toISOString().slice(0, 10);
  if (existsSync(budgetPath)) {
    try {
      const b = JSON.parse(readFileSync(budgetPath, 'utf8'));
      if (b.date === today) return b;
    } catch {}
  }
  const fresh = { date: today, total: 0, limit: DAILY_LIMIT, library: 0, agents: 0, log: [] };
  saveBudget(budgetPath, fresh);
  return fresh;
}

function saveBudget(budgetPath, b) {
  mkdirSync(LIBRARY_DIR, { recursive: true });
  writeFileSync(budgetPath, JSON.stringify(b, null, 2), 'utf8');
}

function getQuotaForKey(budgetPath) {
  const b = loadBudget(budgetPath);
  return b.limit - b.total;
}

function consumeQuota(caller, budgetPath) {
  const b = loadBudget(budgetPath);
  if (b.total >= b.limit) return false;
  b.total++;
  if (caller.startsWith('library')) b.library++;
  else b.agents++;
  b.log.push({
    time:    new Date().toISOString().slice(11, 19),
    caller,
    success: true,
    total:   b.total,
    left:    b.limit - b.total,
  });
  if (b.log.length > 50) b.log = b.log.slice(-50);
  saveBudget(budgetPath, b);
  return true;
}

function markQuotaError(caller, errorType, budgetPath) {
  const b = loadBudget(budgetPath);
  for (let i = b.log.length - 1; i >= 0; i--) {
    if (b.log[i].caller === caller) {
      b.log[i].success   = false;
      b.log[i].errorType = errorType;
      break;
    }
  }
  saveBudget(budgetPath, b);
}

export function getRemainingQuota() {
  return KEYS.reduce((sum, k) => sum + getQuotaForKey(k.budgetPath), 0);
}

// ══════════════════════════════════════════════════════════
// اختيار المفتاح — rule-172
// مفتاح واحد كامل للمهمة — لا خلط بين مفتاحين
// ══════════════════════════════════════════════════════════

// المفتاح النشط للمهمة الحالية
let sessionKey = null;

/**
 * يختار مفتاحاً يملك حصة كافية للمهمة كاملة
 * إذا المفتاح الحالي يكفي → استمر معه
 * إذا لا → ابحث عن مفتاح آخر يكفي
 * إذا لا أحد يكفي → null (توقف)
 */
export function selectKeyForTask(needed) {
  // المفتاح الحالي يكفي → استمر
  if (sessionKey && getQuotaForKey(sessionKey.budgetPath) >= needed) {
    return sessionKey;
  }
  // ابحث عن مفتاح يكفي للمهمة كاملة
  for (const k of KEYS) {
    if (getQuotaForKey(k.budgetPath) >= needed) {
      sessionKey = k;
      logger.info(`[GEMINI] Selected ${k.label} for task — needs ${needed}, has ${getQuotaForKey(k.budgetPath)}`);
      return k;
    }
  }
  // لا مفتاح يكفي
  logger.warn(`[GEMINI] No key has enough quota for task — needs ${needed}, total left: ${getRemainingQuota()}`);
  return null;
}

/**
 * المفتاح النشط للطلبات الفردية داخل مهمة جارية
 * يلتزم بـ sessionKey — لا يغيّر في منتصف المهمة
 */
function getActiveKey() {
  // استمر مع sessionKey إذا له حصة
  if (sessionKey && getQuotaForKey(sessionKey.budgetPath) > 0) {
    return sessionKey;
  }
  // sessionKey نفد — لا نغيّر المفتاح في منتصف المهمة
  // المهمة يجب أن تتوقف وتُكمَل غداً
  return null;
}

// ══════════════════════════════════════════════════════════
// تكاليف الوكلاء — rule-153
// ══════════════════════════════════════════════════════════
const AGENT_COSTS = {
  'inventor'   : 3,
  'screenplay' : 3,
  'code-agent' : 9,
  'library'    : 2,
  'revival'    : 2,
  'visual'     : 1,
  'roadmap'    : 1,
  'marketing'  : 1,
  'world'      : 1,
  'idea'       : 1,
  'story'      : 1,
  'soul'       : 1,
  'art'        : 1,
};

export function canAfford(task) {
  const needed = AGENT_COSTS[task];
  if (!needed) return true;

  // هل يوجد مفتاح واحد يكفي للمهمة كاملة؟
  const key = selectKeyForTask(needed);
  if (!key) {
    logger.warn(`[BUDGET] Cannot afford full ${task} — need ${needed}, total left: ${getRemainingQuota()}`);
    return false;
  }
  logger.info(`[BUDGET] Afford OK — ${task} needs ${needed} — ${key.label} has ${getQuotaForKey(key.budgetPath)}`);
  return true;
}

export function getBudgetStatus() {
  const keys = KEYS.map(k => {
    const b = loadBudget(k.budgetPath);
    return {
      key:     k.label,
      total:   b.total,
      limit:   b.limit,
      left:    b.limit - b.total,
      library: b.library,
      agents:  b.agents,
    };
  });
  const totalUsed  = keys.reduce((s, k) => s + k.total, 0);
  const totalLimit = keys.reduce((s, k) => s + k.limit, 0);
  return {
    date:    new Date().toISOString().slice(0, 10),
    total:   totalUsed,
    limit:   totalLimit,
    left:    totalLimit - totalUsed,
    percent: Math.round((totalUsed / totalLimit) * 100),
    keys,
  };
}

// إعادة تعيين المفتاح — يُستدعى بعد اكتمال مهمة
export function resetSessionKey() {
  sessionKey = null;
}

// ══════════════════════════════════════════════════════════
// askGemini — الدالة الرئيسية
// ══════════════════════════════════════════════════════════
export async function askGemini(prompt, temperature = 0.9, options = {}, caller = 'unknown') {
  const {
    topP             = undefined,
    topK             = undefined,
    maxOutputTokens  = DEFAULT_TOKENS,
    frequencyPenalty = undefined,
    presencePenalty  = undefined,
  } = options;

  const remaining = getRemainingQuota();
  if (remaining <= 0) {
    logger.warn(`[QUOTA] All keys exhausted — caller: ${caller}`);
    throw new Error('DailyQuotaExhausted');
  }

  logger.info(`[GEMINI] ${caller} — quota left: ${remaining}/${KEYS.length * DAILY_LIMIT} — tokens: ${maxOutputTokens}`);

  return _callGemini(
    prompt, temperature,
    { topP, topK, maxOutputTokens, frequencyPenalty, presencePenalty },
    caller, false
  );
}

// ══════════════════════════════════════════════════════════
// الاستدعاء الفعلي
// ══════════════════════════════════════════════════════════
async function _callGemini(prompt, temperature, options, caller, isRetry) {
  const { topP, topK, maxOutputTokens, frequencyPenalty, presencePenalty } = options;
  const safeTokens = Math.min(maxOutputTokens, MAX_TOKENS_CAP);

  // المفتاح النشط — يلتزم بـ sessionKey
  const activeKey = getActiveKey();
  if (!activeKey) {
    logger.warn(`[QUOTA] No active key — caller: ${caller}`);
    throw new Error('DailyQuotaExhausted');
  }

  if (!consumeQuota(caller, activeKey.budgetPath)) {
    logger.warn(`[QUOTA] ${activeKey.label} exhausted — caller: ${caller}`);
    throw new Error('DailyQuotaExhausted');
  }

  logger.info(`[GEMINI] ${activeKey.label} — ${caller}`);

  const config = {
    temperature,
    maxOutputTokens:  safeTokens,
    responseMimeType: 'application/json',
  };
  if (topP             !== undefined) config.topP             = topP;
  if (topK             !== undefined) config.topK             = topK;
  if (frequencyPenalty !== undefined) config.frequencyPenalty = frequencyPenalty;
  if (presencePenalty  !== undefined) config.presencePenalty  = presencePenalty;

  let response;
  try {
    response = await activeKey.client.models.generateContent({
      model:    'gemini-2.5-flash',
      contents: prompt,
      config,
    });
  } catch (err) {
    const is503 = err.message?.includes('503');
    const is429 = err.message?.includes('429');
    markQuotaError(caller, is429 ? 'network_429' : is503 ? 'network_503' : 'network', activeKey.budgetPath);

    if (!isRetry) {
      const delay = is429 ? 60000 : 30000;
      logger.warn(`[RETRY] ${is429 ? '429' : '503'} — ${caller} — waiting ${delay / 1000}s`);
      await new Promise(r => setTimeout(r, delay));
      return _callGemini(prompt, temperature, options, caller, true);
    }

    logger.error(`[ERROR] Gemini failed — ${caller}`, { error: err.message });
    throw new Error('Gemini API failed: ' + err.message);
  }

  // استخراج النص
  let text = '';
  try {
    if (typeof response.text === 'function')    text = response.text();
    else if (typeof response.text === 'string') text = response.text;
    else text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch {
    text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // ردّ فارغ
  if (!text || text.trim().length < 2) {
    markQuotaError(caller, 'empty', activeKey.budgetPath);
    if (!isRetry) {
      logger.warn(`[RETRY] Empty response — ${caller} — waiting 30s`);
      await new Promise(r => setTimeout(r, 30000));
      return _callGemini(prompt, temperature, options, caller, true);
    }
    throw new Error(`Empty response from Gemini — ${caller}`);
  }

  // تحليل JSON
  const parsed = parseJSON(text);
  if (parsed) {
    logger.info(`[OK] Gemini — ${caller} — ${activeKey.label}`, {
      tokens: safeTokens,
      left:   getRemainingQuota(),
    });
    return parsed;
  }

  // JSON مقطوع
  markQuotaError(caller, 'json_truncated', activeKey.budgetPath);
  if (!isRetry) {
    const newTokens = Math.min(safeTokens * 2, MAX_TOKENS_CAP);
    logger.warn(`[RETRY] JSON truncated — ${caller} — tokens: ${safeTokens} → ${newTokens}`);
    return _callGemini(prompt, temperature, { ...options, maxOutputTokens: newTokens }, caller, true);
  }

  logger.error(`[ERROR] Cannot parse JSON — ${caller}`, { preview: text.slice(0, 200) });
  throw new Error('Invalid JSON from Gemini: ' + text.slice(0, 100));
}

// ══════════════════════════════════════════════════════════
// تحليل JSON
// ══════════════════════════════════════════════════════════
function parseJSON(text) {
  const clean = text.replace(/```json|```/g, '').trim();
  for (const s of [clean, text]) {
    try { return JSON.parse(s); } catch {}
    const obj = s.match(/\{[\s\S]*\}/)?.[0];
    if (obj) { try { return JSON.parse(obj); } catch {} }
    const arr = s.match(/\[[\s\S]*\]/)?.[0];
    if (arr) { try { return JSON.parse(arr); } catch {} }
  }
  return null;
}
