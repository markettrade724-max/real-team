import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOUL_PATH = join(__dirname, '..', 'agent-results', 'soul.json');
const MEMORY_PATH = join(__dirname, '..', 'code-memory.json');
const INDEX_PATH = join(__dirname, '..', 'rules-index.json');

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
    const soul = loadSoul();
    const rules = readRelevantRules(agentName);

    const soulText = soul ? `
══ وثيقة الروح ══
الجوهر: ${soul.essence || 'غير محدد'}
الشعار: ${soul.feeling || 'غير محدد'}
الحركة: ${soul.motion || 'غير محدد'}
القوانين: ${soul.rules?.join(' | ') || 'غير محدد'}
المحظورات: ${soul.forbidden?.join(' | ') || 'غير محدد'}
══════════════════` : '[INFO] لا توجد وثيقة روح بعد.';

    const rulesText = rules.length > 0 ? `
══ قواعد ${agentName} ══
${rules.map(r => `- ${r}`).join('\n')}
══════════════════` : '';

    return `${soulText}${rulesText}`;
}
