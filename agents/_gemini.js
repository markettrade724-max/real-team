/**
 * _gemini.js — v2.5
 *
 * Changes from v2.4:
 *  - askGemini()/_callGemini(): added options.pinnedKeyLabel — lets a caller
 *    lock a multi-call task (screenplay, game-fix, code-agent, inventor
 *    cycle) onto a single key for its whole duration (rule-172, enforced
 *    for real this time — was previously only checked at the
 *    hasEnoughQuota() gate and then silently ignored during execution,
 *    since _callGemini() always called getActiveKey() independently per
 *    call. That gap is err-237: a task could start on the key
 *    selectKeyForTask() identified as affordable, but drift onto the other
 *    key mid-task once the first one's remaining partial quota ran out —
 *    same failure mode as err-177, never actually closed by v2.4.
 *  - selectKeyForTask(): now returns a key LABEL (string) instead of the
 *    full key object, so it can be threaded through options.pinnedKeyLabel
 *    without exposing the client. CHECK OTHER CALL SITES if any destructure
 *    the old return value's .client/.budgetPath directly.
 *  - _callGemini(): 429 branch no longer relies on the isRetry flag to
 *    detect "both keys exhausted" (isRetry was always false on 429
 *    rotation, so that branch was dead code — it fell through to a generic
 *    error via a different path instead). Now checks actual remaining
 *    quota across all keys directly.
 *  - AGENT_COSTS synced with the Livre d'Or's agent_costs: added
 *    'game-fix':3 (was missing — canAfford('game-fix') would have always
 *    returned true regardless of real quota), 'art-library'/'publish'/
 *    'production':0, corrected 'visual' from 1 to 0 (Pollinations/procedural
 *    pipeline, zero Gemini calls since rule-245).
 *
 * Rules applied:
 *  rule-097 : no model change — gemini-2.5-flash fixed
 *  rule-098 : askGemini only — no direct fetch
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-101 : maxOutputTokens not maxTokens
 *  rule-122 : retry once only
 *  rule-128 : unified budget + caller tracking
 *  rule-143 : MAX_TOKENS_CAP = 65536
 *  rule-144 : consumeQuota recorded before the actual call
 *  rule-145 : DEFAULT_TOKENS = 8192
 *  rule-168 : GEMINI_API_KEY + GEMINI_API_KEY_2 — KEY_1 first → KEY_2 fallback
 *  rule-172 : one key per complete task — selectKeyForTask(needed), now
 *             actually enforced end-to-end via pinnedKeyLabel (err-237 fix)
 *  rule-195 : DAILY_LIMIT = 20
 *  rule-196 : 429 RPD → exhaustKey() immediately → KEY_2 without delay
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
// Keys — rule-168
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
// Budget — independent per key
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
  if (b.exhausted) return 0;
  return b.limit - b.total;
}

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

function exhaustKey(key) {
  const b       = loadBudget(key.budgetPath);
  b.total       = b.limit;
  b.exhausted   = true;
  b.exhaustedAt = new Date().toISOString();
  saveBudget(key.budgetPath, b);
  logger.warn(`[GEMINI] ${key.label} exhausted (429 RPD) — switching to next key immediately`);
}

// ══════════════════════════════════════════════════════════
// Exported budget functions
// ══════════════════════════════════════════════════════════

export function getRemainingQuota() {
  return KEYS.reduce((sum, k) => sum + getQuotaForKey(k.budgetPath), 0);
}

function getActiveKey() {
  for (const k of KEYS) {
    if (getQuotaForKey(k.budgetPath) > 0) return k;
  }
  return null;
}

function getKeyByLabel(label) {
  return KEYS.find(k => k.label === label) || null;
}

const AGENT_COSTS = {
  inventor:      3,
  screenplay:    3,
  'code-agent':  9,
  'game-fix':    3,
  library:       2,
  revival:       2,
  visual:        0,
  'art-library': 0,
  publish:       0,
  production:    0,
  roadmap:       1,
  marketing:     1,
  world:         1,
  idea:          1,
  story:         1,
  soul:          1,
  art:           1,
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
 * rule-172 (enforced end-to-end since err-237): identifies a key with
 * enough quota for a WHOLE multi-call task, upfront. Returns its label
 * (string) — pass this as options.pinnedKeyLabel on every askGemini()
 * call belonging to that same task, so they all land on the same key
 * instead of drifting once getActiveKey()'s per-call pick runs dry.
 */
export function selectKeyForTask(needed) {
  for (const k of KEYS) {
    if (getQuotaForKey(k.budgetPath) >= needed) return k.label;
  }
  return null;
}

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
// askGemini — main entry point — rule-087
// askGemini(prompt, temperature, options, caller)
// ══════════════════════════════════════════════════════════
export async function askGemini(prompt, temperature = 0.9, options = {}, caller = 'unknown') {
  const {
    topP             = undefined,
    topK             = undefined,
    maxOutputTokens  = DEFAULT_TOKENS,
    frequencyPenalty = undefined,
    presencePenalty  = undefined,
    pinnedKeyLabel   = null, // NEW (err-237) — see selectKeyForTask()
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
    caller, false, pinnedKeyLabel
  );
}

// ══════════════════════════════════════════════════════════
// Actual call
// ══════════════════════════════════════════════════════════
async function _callGemini(prompt, temperature, options, caller, isRetry, pinnedKeyLabel = null) {
  const { topP, topK, maxOutputTokens, frequencyPenalty, presencePenalty } = options;
  const safeTokens = Math.min(maxOutputTokens, MAX_TOKENS_CAP);

  // ── Select key: pinned for this task (rule-172) or dynamic per-call ──
  let activeKey = pinnedKeyLabel ? getKeyByLabel(pinnedKeyLabel) : null;

  if (pinnedKeyLabel && (!activeKey || getQuotaForKey(activeKey.budgetPath) <= 0)) {
    logger.warn(`[QUOTA] Pinned key ${pinnedKeyLabel} exhausted mid-task — caller: ${caller} — falling back to dynamic selection`);
    activeKey      = getActiveKey();
    pinnedKeyLabel = null; // pin dropped — this task is now mixing by necessity
  } else if (!pinnedKeyLabel) {
    activeKey = getActiveKey();
  }

  if (!activeKey) {
    logger.warn(`[QUOTA] All keys exhausted mid-run — caller: ${caller}`);
    throw new Error('DailyQuotaExhausted');
  }

  // ── Record before the actual call — rule-144 ────────────
  if (!consumeQuota(caller, activeKey.budgetPath)) {
    logger.warn(`[QUOTA] ${activeKey.label} exhausted — caller: ${caller}`);
    throw new Error('DailyQuotaExhausted');
  }

  logger.info(`[GEMINI] ${activeKey.label}${pinnedKeyLabel ? ' (pinned)' : ''} — ${caller} — tokens: ${safeTokens}`);

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
    const is429 = err.message?.includes('429');
    const is503 = err.message?.includes('503');

    markQuotaError(caller, is429 ? '429_RPD' : is503 ? '503' : 'network', activeKey.budgetPath);

    if (is429) {
      exhaustKey(activeKey);
      // FIX (err-237): check actual remaining quota instead of the isRetry
      // flag (always false here in v2.4, making "both exhausted" dead code).
      const stillHasQuota = KEYS.some(k => getQuotaForKey(k.budgetPath) > 0);
      if (stillHasQuota) {
        logger.warn(`[429] ${activeKey.label} RPD exhausted — switching to next key immediately`);
        return _callGemini(prompt, temperature, options, caller, isRetry, null); // pin dropped — must rotate
      }
      throw new Error('DailyQuotaExhausted: both keys hit 429 RPD');
    }

    if (!isRetry) {
      logger.warn(`[RETRY] ${is503 ? '503' : 'network'} — ${caller} — waiting 30s`);
      await new Promise(r => setTimeout(r, 30000));
      return _callGemini(prompt, temperature, options, caller, true, pinnedKeyLabel); // keep pin
    }

    logger.error(`[ERROR] Gemini failed permanently — ${caller}`, { error: err.message });
    throw new Error('Gemini API failed: ' + err.message);
  }

  let text = '';
  try {
    if (typeof response.text === 'function')    text = response.text();
    else if (typeof response.text === 'string') text = response.text;
    else text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch {
    text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  if (!text || text.trim().length < 2) {
    markQuotaError(caller, 'empty', activeKey.budgetPath);
    if (!isRetry) {
      logger.warn(`[RETRY] Empty response — ${caller} — waiting 30s`);
      await new Promise(r => setTimeout(r, 30000));
      return _callGemini(prompt, temperature, options, caller, true, pinnedKeyLabel);
    }
    throw new Error(`Empty response from Gemini — ${caller}`);
  }

  const parsed = parseJSON(text);

  if (parsed) {
    logger.info(`[OK] Gemini — ${caller} — ${activeKey.label}`, {
      tokens: safeTokens,
      left:   getRemainingQuota(),
    });
    return parsed;
  }

  markQuotaError(caller, 'json_truncated', activeKey.budgetPath);
  if (!isRetry) {
    const newTokens = Math.min(safeTokens * 2, MAX_TOKENS_CAP);
    logger.warn(`[RETRY] JSON truncated — ${caller} — tokens: ${safeTokens} → ${newTokens}`);
    return _callGemini(
      prompt, temperature,
      { ...options, maxOutputTokens: newTokens },
      caller, true, pinnedKeyLabel
    );
  }

  logger.error(`[ERROR] Cannot parse JSON — ${caller}`, { preview: text.slice(0, 200) });
  throw new Error('Invalid JSON from Gemini: ' + text.slice(0, 100));
}

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
