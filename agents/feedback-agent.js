import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { askGemini }      from './_gemini.js';
import { logger }         from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function run() {
  const products  = JSON.parse(readFileSync(join(__dirname, '..', 'products.json'), 'utf8'));
  const available = products.filter(p => p.status === 'available');
  const summary   = available.map(p => `- ${p.name?.en} (${p.type})`).join('\n');

  const feedback = await askGemini(`
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

  feedback.analyzedAt = new Date().toISOString();
  feedback.totalGames = available.length;
  logger.info('Feedback generated', { games: available.length, suggestions: feedback.suggestions?.length });
  return feedback;
}
