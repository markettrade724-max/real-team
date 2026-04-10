import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { askGemini }      from './_gemini.js';
import { logger }         from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function run() {
  const products    = JSON.parse(readFileSync(join(__dirname, '..', 'products.json'), 'utf8'));
  const existingIds = products.map(p => p.id).join(', ');
  const TYPES       = ['memory', 'puzzle', 'word', 'quiz', 'tool', 'arcade'];
  const type        = TYPES[Math.floor(Math.random() * TYPES.length)];

  const idea = await askGemini(`
You are a creative game designer. Suggest a new ${type === 'tool' ? 'app' : 'game'} of type "${type}".
Existing IDs (do not repeat): ${existingIds}
Requirements: original, fun, global audience, HTML5-compatible.
Return ONLY valid JSON:
{
  "id": "unique-slug",
  "type": "${type}",
  "category": "${type === 'tool' ? 'app' : 'game'}",
  "emoji": "one emoji",
  "concept": "one sentence",
  "uniqueFeature": "what makes it unique",
  "targetAudience": "who is it for",
  "name": { "ar":"","en":"","fr":"","es":"","de":"","zh":"" },
  "desc": { "ar":"","en":"","fr":"","es":"","de":"","zh":"" },
  "tags": ["tag1","tag2","tag3"]
}`, 0.95);

  if (!idea.id || !idea.name?.en) throw new Error('Missing required fields');
  if (products.find(p => p.id === idea.id)) idea.id = idea.id + '-' + Date.now().toString(36);

  idea.generatedAt = new Date().toISOString();
  idea.generatedBy = 'idea-agent';
  logger.info('Idea generated', { id: idea.id, name: idea.name.en });
  return idea;
}
