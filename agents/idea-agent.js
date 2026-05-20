import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { askGemini } from './_gemini.js';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadJSON(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    logger.warn(`Failed to load ${filePath}: ${e.message}`);
    return null;
  }
}

export async function run() {
  logger.info('Generating universe idea...');

  const products = loadJSON(join(__dirname, '..', 'products.json')) || [];
  const existingIds = products.map(p => p.id).join(', ');

  const roadmap  = loadJSON(join(__dirname, '..', 'agent-results', 'roadmap.json'));
  const feedback = loadJSON(join(__dirname, '..', 'agent-results', 'feedback.json'));
  const analytics = loadJSON(join(__dirname, '..', 'agent-results', 'analytics.json'));

  if (!roadmap && !feedback && !analytics) {
    logger.warn('No agent-results found — running without learning data');
  }

  let learningContext = '';
  if (analytics) learningContext += `Analytics: ${JSON.stringify(analytics).slice(0, 500)}\n`;
  if (roadmap) learningContext += `Roadmap: ${JSON.stringify(roadmap).slice(0, 300)}\n`;
  if (feedback) learningContext += `Feedback: ${JSON.stringify(feedback).slice(0, 300)}\n`;

  const prompt = `Generate a unique game universe concept.${
    learningContext ? '\n\nConsider these previous results:\n' + learningContext : ''
  }
Return a valid JSON object with these exact keys:
{
  "id": "lowercase-slug",
  "name": { "en": "English Name", "ar": "الاسم العربي" },
  "desc": { "en": "Short description", "ar": "وصف قصير" },
  "type": "godot" or "phaser",
  "genre": "action|rpg|shooter|puzzle|racing|adventure",
  "category": "game",
  "backgroundColor": "#1a1a2e",
  "fogColor": "#16213e",
  "lightColor": "#e2e2e2",
  "physics": "gravity:9.8,bounce:0.3",
  "atmosphere": "dark,mysterious"
}
Make sure the id is unique and not one of: ${existingIds || 'none'}.`;

  let idea;
  try {
    idea = await askGemini(prompt, 0.9, { topP: 0.95, maxTokens: 800 });
  } catch (err) {
    logger.error('Gemini failed to generate idea', err);
    throw new Error('Idea generation failed: ' + err.message);
  }

  if (!idea || typeof idea !== 'object') {
    throw new Error('Invalid JSON from Gemini');
  }
  if (!idea.id || !idea.name?.en || !idea.category || !['game', 'app'].includes(idea.category)) {
    throw new Error(`Missing or invalid core fields: ${JSON.stringify(idea)}`);
  }

  let finalId = idea.id.toLowerCase().replace(/\s+/g, '-');
  while (products.find(p => p.id === finalId)) {
    finalId = finalId + '-' + Date.now().toString(36);
  }
  idea.id = finalId;

  idea.generatedAt = new Date().toISOString();
  idea.generatedBy = 'idea-agent-v2-learning';

  logger.info('Idea generated', { id: idea.id, type: idea.type, name: idea.name.en });
  return idea;
}
