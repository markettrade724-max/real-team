/**
 * _gemini.js — v2.4
 *
 * التغييرات عن v2.3:
 *  - exhaustKey(): يُوسّم المفتاح كمستنفد فوراً عند 429 RPD — rule-196
 *  - 429 → exhaustKey() فوراً → KEY_2 بدون delay — rule-196 / err-195
 *  - 503 → retry مرة واحدة بعد 30s على أي مفتاح متاح — rule-122
 *  - resetSessionKey(): موثّق كقرار مقصود — المفتاح يُختار ديناميكياً
 *
 * القواعد المطبقة:
 *  rule-097 : لا تغيير للنموذج — gemini-2.5-flash ثابت
 *  rule-098 : askGemini فقط — لا fetch مباشر
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-101 : maxOutputTokens لا maxTokens
 *  rule-122 : retry مرة واحدة فقط
 *  rule-128 : budget موحد + caller tracking
 *  rule-143 : MAX_TOKENS_CAP = 65536
 *  rule-144 : consumeQuota قبل الاستدعاء
 *  rule-145 : DEFAULT_TOKENS = 8192
 *  rule-168 : GEMINI_API_KEY + GEMINI_API_KEY_2 — KEY_1 أولاً → KEY_2 fallback
 *  rule-195 : DAILY_LIMIT = 20
 *  rule-196 : 429 RPD → exhaustKey() فوراً → KEY_2 بدون delay
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

const DAILY_LIMIT    = 20;    // مؤكد من API — quotaValue=20 — rule-195
const MAX_TOKENS_CAP = 65536; // rule-143
const DEFAULT_TOKENS = 8192;  // rule-145

// ══════════════════════════════════════════════════════════
// المفتاحان — rule-168
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
  const fresh = {
    date: today, total: 0, limit: DAILY_LIMIT,
    library: 0, agents: 0, exhausted: false, log: [],
  };
  saveBudget(budgetPath, fresh);
  return fresh;
}

function saveBudget(budgetPath, b) {
  mkdirSync(LIBRARY_DIR, { recursive: true });
  writeFileSync(budgetPath, JSON.stringify(b, null, 2), 'utf8');
}

function getQuotaForKey(budgetPath) {
  const b = loadBudget(budgetPath);
  if (b.exhausted) return 0; // مُوسَّم كمستنفد — لا نستخدمه
  return b.limit - b.total;
}

// يُسجَّل قبل الاستدعاء الفعلي — rule-144
function consumeQuota(caller, budgetPath) {
  const b = loadBudget(budgetPath);
  if (b.exhausted || b.total >= b.limit) return false;

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

/**
 * يُوسّم المفتاح كمستنفد فوراً — rule-196
 * يُستدعى عند 429 RPD بدون أي delay
 */
function exhaustKey(key) {
  const b     = loadBudget(key.budgetPath);
  b.total     = b.limit; // اعتبره مستنفداً كاملاً
  b.exhausted = true;
  b.exhaustedAt = new Date().toISOString();
  saveBudget(key.budgetPath, b);
  logger.warn(`[GEMINI] ${key.label} exhausted (429 RPD) — switching to next key immediately`);
}

// ══════════════════════════════════════════════════════════
// دوال مُصدَّرة للحصة
// ══════════════════════════════════════════════════════════

// المجموع الكلي للمفتاحين — rule-169
export function getRemainingQuota() {
  return KEYS.reduce((sum, k) => sum + getQuotaForKey(k.budgetPath), 0);
}

// المفتاح النشط — الأول الذي له حصة (KEY_1 أولاً) — rule-168
function getActiveKey() {
  for (const k of KEYS) {
    if (getQuotaForKey(k.budgetPath) > 0) return k;
  }
  return null;
}

// تكاليف الوكلاء — rule-153
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
  const left = getRemainingQuota();
  if (left < needed) {
    logger.warn(`[BUDGET] Cannot afford ${task} — need ${needed}, have ${left}`);
    return false;
  }
  logger.info(`[BUDGET] Afford OK — ${task} needs ${needed}, have ${left}`);
  return true;
}

/**
 * يختار مفتاحاً يملك حصة كافية للمهمة كاملة — rule-176
 */
export function selectKeyForTask(needed) {
  for (const k of KEYS) {
    if (getQuotaForKey(k.budgetPath) >= needed) return k;
  }
  return null;
}

/**
 * rule-177: المفتاح يُختار ديناميكياً لكل استدعاء — لا حالة ثابتة
 * resetSessionKey() موثّق كقرار مقصود — لا يحتاج إعادة تعيين
 */
export function resetSessionKey() {
  logger.info('[GEMINI] Session released — next task picks fresh key dynamically');
}

export function getBudgetStatus() {
  const keys = KEYS.map(k => {
    const b = loadBudget(k.budgetPath);
    return {
      key:       k.label,
      total:     b.total,
      limit:     b.limit,
      left:      b.exhausted ? 0 : b.limit - b.total,
      exhausted: b.exhausted || false,
      library:   b.library,
      agents:    b.agents,
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

// ══════════════════════════════════════════════════════════
// askGemini — الدالة الرئيسية — rule-087
// askGemini(prompt, temperature, options, caller)
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

  logger.info(`[GEMINI] ${caller} — quota left: ${remaining}/${KEYS.length * DAILY_LIMIT}`);

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

  // ── اختر المفتاح النشط ──────────────────────────────────
  const activeKey = getActiveKey();
  if (!activeKey) {
    logger.warn(`[QUOTA] All keys exhausted mid-run — caller: ${caller}`);
    throw new Error('DailyQuotaExhausted');
  }

  // ── سجّل قبل الاستدعاء — rule-144 ───────────────────────
  if (!consumeQuota(caller, activeKey.budgetPath)) {
    logger.warn(`[QUOTA] ${activeKey.label} exhausted — caller: ${caller}`);
    throw new Error('DailyQuotaExhausted');
  }

  logger.info(`[GEMINI] ${activeKey.label} — ${caller} — tokens: ${safeTokens}`);

  const config = {
    temperature,
    maxOutputTokens:  safeTokens,
    responseMimeType: 'application/json',
  };
  if (topP             !== undefined) config.topP             = topP;
  if (topK             !== undefined) config.topK             = topK;
  if (frequencyPenalty !== undefined) config.frequencyPenalty = frequencyPenalty;
  if (presencePenalty  !== undefined) config.presencePenalty  = presencePenalty;

  // ── استدعاء API ─────────────────────────────────────────
  let response;
  try {
    response = await activeKey.client.models.generateContent({
      model:    'gemini-2.5-flash',
      contents: prompt,
      config,
    });
  } catch (err) {
    const is429 = err.message?.includes('429');
    const is503 = err.message?.includes('503');

    markQuotaError(caller, is429 ? '429_RPD' : is503 ? '503' : 'network', activeKey.budgetPath);

    if (is429) {
      // rule-196: exhaustKey فوراً → KEY_2 بدون delay
      exhaustKey(activeKey);
      if (!isRetry) {
        logger.warn(`[429] ${activeKey.label} RPD exhausted — switching to next key immediately`);
        return _callGemini(prompt, temperature, options, caller, false); // isRetry=false للمفتاح الجديد
      }
      // كلا المفتاحين مستنفدان
      throw new Error('DailyQuotaExhausted: both keys hit 429 RPD');
    }

    if (!isRetry) {
      // rule-122: retry مرة واحدة فقط — 30s للـ 503
      logger.warn(`[RETRY] ${is503 ? '503' : 'network'} — ${caller} — waiting 30s`);
      await new Promise(r => setTimeout(r, 30000));
      return _callGemini(prompt, temperature, options, caller, true);
    }

    logger.error(`[ERROR] Gemini failed permanently — ${caller}`, { error: err.message });
    throw new Error('Gemini API failed: ' + err.message);
  }

  // ── استخراج النص ────────────────────────────────────────
  let text = '';
  try {
    if (typeof response.text === 'function')    text = response.text();
    else if (typeof response.text === 'string') text = response.text;
    else text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch {
    text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // ── ردّ فارغ ────────────────────────────────────────────
  if (!text || text.trim().length < 2) {
    markQuotaError(caller, 'empty', activeKey.budgetPath);
    if (!isRetry) {
      logger.warn(`[RETRY] Empty response — ${caller} — waiting 30s`);
      await new Promise(r => setTimeout(r, 30000));
      return _callGemini(prompt, temperature, options, caller, true);
    }
    throw new Error(`Empty response from Gemini — ${caller}`);
  }

  // ── تحليل JSON ──────────────────────────────────────────
  const parsed = parseJSON(text);

  if (parsed) {
    logger.info(`[OK] Gemini — ${caller} — ${activeKey.label}`, {
      tokens: safeTokens,
      left:   getRemainingQuota(),
    });
    return parsed;
  }

  // ── JSON مقطوع — رفع الـ tokens ─────────────────────────
  markQuotaError(caller, 'json_truncated', activeKey.budgetPath);
  if (!isRetry) {
    const newTokens = Math.min(safeTokens * 2, MAX_TOKENS_CAP);
    logger.warn(`[RETRY] JSON truncated — ${caller} — tokens: ${safeTokens} → ${newTokens}`);
    return _callGemini(
      prompt, temperature,
      { ...options, maxOutputTokens: newTokens },
      caller, true
    );
  }

  logger.error(`[ERROR] Cannot parse JSON — ${caller}`, { preview: text.slice(0, 200) });
  throw new Error('Invalid JSON from Gemini: ' + text.slice(0, 100));
}

// ══════════════════════════════════════════════════════════
// تحليل JSON — صامت ومتسامح
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
