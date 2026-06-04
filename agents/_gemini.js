/**
 * _gemini.js — v2.2
 *
 * التغييرات عن v2.1:
 *  - consumeQuota يُسجَّل قبل الاستدعاء الفعلي لا بعده
 *  - كل retry يعدّ في الحصة باستقلالية تامة
 *  - markQuotaError يُحدّث نوع الخطأ بدون عدّ إضافي
 *  - budget.json يطابق API حتى عند crash أو exception
 *
 * القواعد المطبقة:
 *  rule-097 : لا تغيير للنموذج — gemini-2.5-flash ثابت
 *  rule-098 : askGemini فقط — لا fetch مباشر
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-101 : maxOutputTokens لا maxTokens
 *  rule-122 : retry مرة واحدة فقط
 *  rule-128 : budget.json موحد + caller tracking
 *  rule-143 : MAX_TOKENS_CAP = 65536
 *  rule-144 : consumeQuota قبل الاستدعاء — ضمان التطابق
 *  rule-145 : DEFAULT_TOKENS = 8192
 */

import { GoogleGenAI } from '@google/genai';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const BUDGET_PATH = join(__dirname, '..', 'library', 'budget.json');
const LIBRARY_DIR = join(__dirname, '..', 'library');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const DAILY_LIMIT    = 20;
const MAX_TOKENS_CAP = 65536;
const DEFAULT_TOKENS = 8192;

// ══════════════════════════════════════════════════════════
// الحصة الموحدة
// ══════════════════════════════════════════════════════════
function loadBudget() {
  const today = new Date().toISOString().slice(0, 10);
  if (existsSync(BUDGET_PATH)) {
    try {
      const b = JSON.parse(readFileSync(BUDGET_PATH, 'utf8'));
      if (b.date === today) return b;
    } catch {}
  }
  const fresh = {
    date:    today,
    total:   0,
    limit:   DAILY_LIMIT,
    library: 0,
    agents:  0,
    log:     [],
  };
  saveBudget(fresh);
  return fresh;
}

function saveBudget(b) {
  mkdirSync(LIBRARY_DIR, { recursive: true });
  writeFileSync(BUDGET_PATH, JSON.stringify(b, null, 2), 'utf8');
}

/**
 * يُسجَّل قبل الاستدعاء الفعلي — v2.2
 * success = true مبدئياً، يُحدَّث بـ markQuotaError عند الفشل
 */
function consumeQuota(caller = 'unknown') {
  const b = loadBudget();
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

  saveBudget(b);
  return true;
}

/**
 * يُحدّث آخر إدخال للمستدعي بنوع الخطأ — بدون عدّ إضافي
 * يُستدعى بعد فشل الاستدعاء مباشرة
 */
function markQuotaError(caller, errorType) {
  const b = loadBudget();
  for (let i = b.log.length - 1; i >= 0; i--) {
    if (b.log[i].caller === caller) {
      b.log[i].success   = false;
      b.log[i].errorType = errorType;
      break;
    }
  }
  saveBudget(b);
}

export function getRemainingQuota() {
  const b = loadBudget();
  return b.limit - b.total;
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
  const left = getRemainingQuota();
  if (left < needed) {
    logger.warn(`[BUDGET] Cannot afford full ${task} — need ${needed}, have ${left} — skipping`);
    return false;
  }
  logger.info(`[BUDGET] Afford check OK — ${task} needs ${needed}, have ${left}`);
  return true;
}

export function getBudgetStatus() {
  const b = loadBudget();
  return {
    date:    b.date,
    total:   b.total,
    limit:   b.limit,
    left:    b.limit - b.total,
    library: b.library,
    agents:  b.agents,
    percent: Math.round((b.total / b.limit) * 100),
  };
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
    logger.warn(`[QUOTA] Daily limit reached (${DAILY_LIMIT}/day) — caller: ${caller}`);
    throw new Error('DailyQuotaExhausted');
  }

  logger.info(`[GEMINI] ${caller} — quota left: ${remaining}/${DAILY_LIMIT} — tokens: ${maxOutputTokens}`);

  return _callGemini(
    prompt, temperature,
    { topP, topK, maxOutputTokens, frequencyPenalty, presencePenalty },
    caller,
    false
  );
}

// ══════════════════════════════════════════════════════════
// الاستدعاء الفعلي
// ══════════════════════════════════════════════════════════
async function _callGemini(prompt, temperature, options, caller, isRetry) {
  const { topP, topK, maxOutputTokens, frequencyPenalty, presencePenalty } = options;
  const safeTokens = Math.min(maxOutputTokens, MAX_TOKENS_CAP);

  // ── سجّل قبل الاستدعاء — v2.2 fix ─────
  if (!consumeQuota(caller)) {
    logger.warn(`[QUOTA] Daily limit reached mid-run — caller: ${caller}`);
    throw new Error('DailyQuotaExhausted');
  }

  const config = {
    temperature,
    maxOutputTokens:  safeTokens,
    responseMimeType: 'application/json',
  };
  if (topP             !== undefined) config.topP             = topP;
  if (topK             !== undefined) config.topK             = topK;
  if (frequencyPenalty !== undefined) config.frequencyPenalty = frequencyPenalty;
  if (presencePenalty  !== undefined) config.presencePenalty  = presencePenalty;

  // ── استدعاء API ────────────────────────
  let response;
  try {
    response = await ai.models.generateContent({
      model:    'gemini-2.5-flash',
      contents: prompt,
      config,
    });
  } catch (err) {
    const is503 = err.message?.includes('503');
    const is429 = err.message?.includes('429');

    // حدّث نوع الخطأ للإدخال المسجَّل مسبقاً
    markQuotaError(caller, is429 ? 'network_429' : is503 ? 'network_503' : 'network');

    if (!isRetry) {
      const delay = is429 ? 60000 : 30000;
      logger.warn(`[RETRY] ${is429 ? '429' : '503'} — ${caller} — waiting ${delay / 1000}s`);
      await new Promise(r => setTimeout(r, delay));
      // retry = استدعاء جديد = consumeQuota جديد
      return _callGemini(prompt, temperature, options, caller, true);
    }

    logger.error(`[ERROR] Gemini failed — ${caller}`, { error: err.message, isRetry });
    throw new Error('Gemini API failed: ' + err.message);
  }

  // ── استخراج النص ───────────────────────
  let text = '';
  try {
    if (typeof response.text === 'function')    text = response.text();
    else if (typeof response.text === 'string') text = response.text;
    else text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch {
    text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // ── ردّ فارغ ───────────────────────────
  if (!text || text.trim().length < 2) {
    markQuotaError(caller, 'empty');
    if (!isRetry) {
      logger.warn(`[RETRY] Empty response — ${caller} — waiting 30s`);
      await new Promise(r => setTimeout(r, 30000));
      return _callGemini(prompt, temperature, options, caller, true);
    }
    throw new Error(`Empty response from Gemini — ${caller}`);
  }

  // ── تحليل JSON ─────────────────────────
  const parsed = parseJSON(text);

  if (parsed) {
    logger.info(`[OK] Gemini — ${caller}`, {
      tokens: safeTokens,
      left:   getRemainingQuota(),
    });
    return parsed;
  }

  // ── JSON مقطوع — رفع الـ tokens ────────
  markQuotaError(caller, 'json_truncated');
  if (!isRetry) {
    const newTokens = Math.min(safeTokens * 2, MAX_TOKENS_CAP);
    logger.warn(`[RETRY] JSON truncated — ${caller} — tokens: ${safeTokens} → ${newTokens}`);
    // retry = استدعاء جديد = consumeQuota جديد
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
