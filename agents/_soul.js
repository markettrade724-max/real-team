/**
 * _soul.js — v1.1
 *
 * التغييرات عن v1.0:
 *  - soulText بالإنجليزية بدل العربية — كان السبب الجذري للانجراف اللغوي
 *    في كل الوكلاء: هذا النص يُحقن في بداية كل prompt (rule-056)،
 *    وكونه عربياً كان يدفع Gemini للانجراف نحو العربية حتى في
 *    prompts إنجليزية بالكامل (راجع screenplay-agent — الحلقات 1-8).
 *  - "[INFO] لا توجد وثيقة روح بعد" → English fallback
 *
 * تنبيه مهم:
 *  هذا التعديل وحده غير كافٍ — soul.json نفسه (agent-results/soul.json)
 *  يحتوي محتوى عربياً حقيقياً (essence, feeling, motion...) من birthMode
 *  الأصلي. يجب ترجمة/إعادة توليد هذا الملف بالإنجليزية أيضاً، وإلا
 *  ستبقى القيم الفعلية (لا فقط التسميات) عربية ويتكرر الانجراف.
 *
 * القواعد المطبقة:
 *  rule-056 : soulContext قبل كل عمل
 *  rule-100 : soulContext يُرجع string دائماً
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname }            from 'path';
import { fileURLToPath }            from 'url';
import { logger }                   from '../logger.js';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const SOUL_PATH   = join(__dirname, '..', 'agent-results', 'soul.json');
const MEMORY_PATH = join(__dirname, '..', 'code-memory.json');
const INDEX_PATH  = join(__dirname, '..', 'rules-index.json');

function loadJSON(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    logger.warn(`[WARN] Could not parse: ${path}`);
    return null;
  }
}

function loadSoul() {
  return loadJSON(SOUL_PATH);
}

function readRelevantRules(agentName) {
  const index = loadJSON(INDEX_PATH);
  if (!index || !index[agentName]) return [];
  const memory = loadJSON(MEMORY_PATH);
  if (!memory || !memory.rules) return [];
  return index[agentName]
    .map(id => memory.rules.find(r => r.id === id))
    .filter(Boolean)
    .map(r => r.description);
}

export function soulContext(agentName) {
  const soul  = loadSoul();
  const rules = readRelevantRules(agentName);

  const soulText = soul ? `
══ SOUL DOCUMENT ══
Essence: ${soul.essence  || 'unspecified'}
Feeling: ${soul.feeling  || 'unspecified'}
Motion: ${soul.motion   || 'unspecified'}
Rules: ${soul.rules?.join(' | ')    || 'unspecified'}
Forbidden: ${soul.forbidden?.join(' | ') || 'unspecified'}
══════════════════` : '[INFO] No soul document yet.';

  const rulesText = rules.length > 0 ? `
══ ${agentName} rules ══
${rules.map(r => `- ${r}`).join('\n')}
══════════════════` : '';

  return `${soulText}${rulesText}`;
}
