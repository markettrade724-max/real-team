/**
 * idea-agent.js
 * يولّد أفكاراً إبداعية لألعاب وتطبيقات جديدة
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEMINI_KEY = process.env.GEMINI_API_KEY;

async function gemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json' // إجبار Gemini على JSON
        }
      })
    }
  );
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

function extractJSON(raw) {
  // محاولة ١: الرد كامل JSON
  try { return JSON.parse(raw); } catch {}
  // محاولة ٢: استخراج أول كائن JSON
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  // محاولة ٣: تنظيف backticks
  const clean = raw.replace(/```json|```/g, '').trim();
  try { return JSON.parse(clean); } catch {}
  throw new Error('Cannot parse JSON from: ' + raw.slice(0, 100));
}

export async function run() {
  const products    = JSON.parse(readFileSync(join(__dirname, '..', 'products.json'), 'utf8'));
  const existingIds = products.map(p => p.id).join(', ');
  const TYPES       = ['memory', 'puzzle', 'word', 'quiz', 'tool', 'arcade'];
  const type        = TYPES[Math.floor(Math.random() * TYPES.length)];

  const prompt = `You are a creative game designer. Suggest a new ${type === 'tool' ? 'app' : 'game'} idea of type "${type}".

Existing IDs (do not repeat): ${existingIds}

Requirements: original, fun, global audience, HTML5-compatible.

Respond with ONLY a JSON object, no markdown, no explanation:
{
  "id": "unique-slug-lowercase-dashes",
  "type": "${type}",
  "category": "${type === 'tool' ? 'app' : 'game'}",
  "emoji": "single emoji",
  "concept": "one sentence concept in English",
  "uniqueFeature": "what makes it unique",
  "targetAudience": "target audience",
  "name": {
    "ar": "Arabic name",
    "en": "English name",
    "fr": "French name",
    "es": "Spanish name",
    "de": "German name",
    "zh": "Chinese name"
  },
  "desc": {
    "ar": "Arabic description (2 sentences)",
    "en": "English description (2 sentences)",
    "fr": "French description",
    "es": "Spanish description",
    "de": "German description",
    "zh": "Chinese description"
  },
  "tags": ["tag1", "tag2", "tag3"]
}`;

  const raw  = await gemini(prompt);
  const idea = extractJSON(raw);

  // تأكد من الحقول الأساسية
  if (!idea.id || !idea.name || !idea.desc) {
    throw new Error('Missing required fields in idea: ' + JSON.stringify(Object.keys(idea)));
  }

  // تأكد أن الـ slug غير مكرر
  if (products.find(p => p.id === idea.id)) {
    idea.id   = idea.id + '-' + Date.now().toString(36);
    idea.slug = idea.id;
  }

  idea.generatedAt = new Date().toISOString();
  idea.generatedBy = 'idea-agent';

  console.log(`💡 New idea: "${idea.name?.en}" (${idea.type})`);
  console.log(`   Concept: ${idea.concept}`);

  return idea;
}
