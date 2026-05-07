import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { askGemini }      from './_gemini.js';
import { logger }         from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadProducts() {
  const path = join(__dirname, '..', 'products.json');
  if (!existsSync(path)) {
    logger.error('products.json not found');
    return [];
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    logger.error('Failed to parse products.json', err);
    return [];
  }
}

export async function run() {
  const products  = loadProducts();
  const available = products.filter(p => p.status === 'available');
  const summary   = available.map(p => `- ${p.name?.en} (${p.type})`).join('\n');

  if (available.length === 0) {
    logger.warn('No available products to analyze');
    return {
      strengths: [],
      weaknesses: [],
      missingTypes: [],
      suggestions: [],
      nextIdea: '',
      analyzedAt: new Date().toISOString(),
      totalGames: 0,
    };
  }

  let feedback;
  try {
    feedback = await askGemini(`
Analyze this game/app catalog and suggest improvements:
${summary}
Return ONLY valid JSON:
{
  "strengths":    ["s1","s2"],
  "weaknesses":   ["w1","w2"],
  "missingTypes": ["type1","type2"],
  "suggestions":  [{ "type": "", "description": "", "priority": "high" }],
  "nextIdea":     "one sentence suggestion"
}`, 0.7);
  } catch (err) {
    logger.error('Feedback generation failed', err);
    return {
      strengths: [],
      weaknesses: ['AI analysis unavailable'],
      missingTypes: [],
      suggestions: [],
      nextIdea: '',
      analyzedAt: new Date().toISOString(),
      totalGames: available.length,
    };
  }

  // التحقق من صحة البيانات الأساسية
  if (!feedback || typeof feedback !== 'object') {
    logger.warn('Invalid feedback object from Gemini');
    feedback = {};
  }

  // ضمان وجود الحقول الأساسية
  feedback.strengths    = Array.isArray(feedback.strengths)    ? feedback.strengths    : [];
  feedback.weaknesses   = Array.isArray(feedback.weaknesses)   ? feedback.weaknesses   : [];
  feedback.missingTypes = Array.isArray(feedback.missingTypes) ? feedback.missingTypes : [];
  feedback.suggestions  = Array.isArray(feedback.suggestions)  ? feedback.suggestions  : [];
  feedback.nextIdea     = feedback.nextIdea || '';

  feedback.analyzedAt = new Date().toISOString();
  feedback.totalGames = available.length;

  logger.info('Feedback generated', { games: available.length, suggestions: feedback.suggestions.length });
  return feedback;
}
