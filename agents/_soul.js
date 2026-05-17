/**
 * _soul.js — يقرأ وثيقة الروح ويحقنها في prompt أي وكيل
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { logger }         from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOUL_PATH = join(__dirname, '..', 'agent-results', 'soul.json');

/**
 * يقرأ وثيقة الروح من الملف
 */
export function readSoul() {
  if (!existsSync(SOUL_PATH)) return null;
  try {
    return JSON.parse(readFileSync(SOUL_PATH, 'utf8'));
  } catch {
    logger.warn('Cannot read soul document');
    return null;
  }
}

/**
 * يبني سياق الروح لوكيل معين
 * @param {string} agentName - اسم الوكيل
 */
export function soulContext(agentName) {
  const soul = readSoul();
  if (!soul) return '';

  const key = `for${agentName.charAt(0).toUpperCase() + agentName.slice(1)}`;

  return `
══ وثيقة الروح ══
الجوهر: ${soul.essence}
الشعور: ${soul.feeling}
الحركة: ${soul.motion}
القوانين: ${soul.rules?.join(' | ')}
المحظورات: ${soul.forbidden?.join(' | ')}
تعليمتك: ${soul[key] || ''}
══════════════════
`;
