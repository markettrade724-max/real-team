/**
 * idea-agent.js — Gemini يتعلم من التاريخ ويبتكر بحرية كاملة
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { askGemini }      from './_gemini.js';
import { logger }         from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadJSON(path) {
  try { return existsSync(path) ? JSON.parse(readFileSync(path,'utf8')) : null; }
  catch { return null; }
}

export async function run() {
  const products = JSON.parse(readFileSync(join(__dirname,'..','products.json'),'utf8'));
  const existingIds = products.map(p=>p.id).join(', ');

  // ── يقرأ نتائج الوكلاء السابقة ليتعلم منها ────────────────
  const roadmap  = loadJSON(join(__dirname,'..','agent-results','roadmap.json'));
  const feedback = loadJSON(join(__dirname,'..','agent-results','feedback.json'));
  const analytics= loadJSON(join(__dirname,'..','agent-results','analytics.json'));

  const learnings = `
WHAT WE LEARNED FROM PREVIOUS RUNS:
- Roadmap focus: ${roadmap?.focusArea || 'unknown'}
- Roadmap next idea: ${roadmap?.recommendation || 'none'}
- Feedback weaknesses: ${feedback?.weaknesses?.join(', ') || 'none'}
- Missing types: ${feedback?.missingTypes?.join(', ') || 'none'}
- Next suggestion: ${feedback?.nextIdea || 'none'}
- Revenue trend: ${analytics?.trend || 'unknown'}
- Top IAP: ${analytics?.topIap || 'unknown'}

USE THIS DATA to make smarter, more targeted decisions.
If trend is "slow" → create something viral and shareable.
If missing types are listed → create one of those types.
If feedback has weaknesses → address them.
`;

  const idea = await askGemini(`
You are a world-class creative director with UNLIMITED imagination and deep market intelligence.

${learnings}

EXISTING PRODUCTS (do not repeat): ${existingIds}

CREATE something completely original. You have ZERO restrictions.
Think across ALL categories:
- 🎮 Games: strategy, RPG, horror, romance, sci-fi, simulation, platformer, idle, clicker, trivia, escape room
- 🛠️ Tools: productivity, creativity, education, health, finance, travel
- 🎨 Creative: generators, makers, builders, designers
- 🧠 Brain: IQ tests, personality tests, memory training, logic puzzles
- 😂 Fun: joke generators, meme makers, random facts, would-you-rather
- 💪 Wellness: meditation timers, breathing exercises, habit trackers, mood journals
- 📚 Educational: language learning, math games, science quizzes, history explorer
- 🌍 Cultural: traditions explorer, flag quizzes, world capitals, cuisine guides
- 💼 Business: name generators, pitch builders, idea validators
- 🎵 Music: rhythm games, beat makers, music quizzes
- ANYTHING that would make someone say "WOW I need this!"

The category must be: "game" OR "app"
Be BOLD. Be UNEXPECTED. Be UNFORGETTABLE.

Return ONLY valid JSON:
{
  "id": "unique-creative-slug",
  "type": "specific-type-name",
  "category": "game or app",
  "emoji": "perfect single emoji",
  "concept": "one explosive sentence that makes you want to play immediately",
  "uniqueFeature": "the ONE thing that makes this unforgettable",
  "targetAudience": "who will obsess over this",
  "viralPotential": "why people will share this",
  "name": {
    "ar": "اسم عربي لا يُنسى",
    "en": "Unforgettable English name",
    "fr": "Nom français inoubliable",
    "es": "Nombre español inolvidable",
    "de": "Unvergesslicher deutscher Name",
    "zh": "令人难忘的中文名称"
  },
  "desc": {
    "ar": "وصف عربي يشعل الفضول (جملتان قويتان)",
    "en": "Description that sparks curiosity (two powerful sentences)",
    "fr": "Description qui éveille la curiosité (deux phrases percutantes)",
    "es": "Descripción que despierta curiosidad (dos frases impactantes)",
    "de": "Beschreibung die Neugier weckt (zwei kraftvolle Sätze)",
    "zh": "激发好奇心的描述（两句有力的话）"
  },
  "tags": ["tag1", "tag2", "tag3", "tag4"]
}`, 1.0);

  if (!idea.id || !idea.name?.en) throw new Error('Missing fields');
  if (products.find(p=>p.id===idea.id)) idea.id=idea.id+'-'+Date.now().toString(36);

  idea.generatedAt = new Date().toISOString();
  idea.generatedBy = 'idea-agent-v2-learning';

  logger.info('Idea generated (with learning)', {
    id: idea.id, type: idea.type,
    name: idea.name.en,
    viral: idea.viralPotential
  });
  return idea;
}
