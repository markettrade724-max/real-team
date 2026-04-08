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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 1.0, maxOutputTokens: 1024 }
      })
    }
  );
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function run() {
  const products   = JSON.parse(readFileSync(join(__dirname, '..', 'products.json'), 'utf8'));
  const existingIds = products.map(p => p.id).join(', ');

  const TYPES = ['memory', 'puzzle', 'word', 'quiz', 'tool', 'arcade'];
  const type  = TYPES[Math.floor(Math.random() * TYPES.length)];

  const prompt = `
أنت مصمم ألعاب خبير ومبدع. اقترح فكرة ${type === 'tool' ? 'تطبيق أداة' : 'لعبة'} جديدة ومبتكرة من نوع "${type}".

الأفكار الموجودة (لا تكرر): ${existingIds}

المتطلبات:
- فكرة أصيلة وممتعة
- مناسبة للجمهور العالمي
- قابلة للتنفيذ بـ HTML5

أجب بـ JSON فقط بدون أي نص إضافي:
{
  "id": "unique-slug-in-english",
  "type": "${type}",
  "category": "${type === 'tool' ? 'app' : 'game'}",
  "emoji": "🎮",
  "concept": "وصف مختصر للفكرة الأساسية بالإنجليزية",
  "uniqueFeature": "ما يميزها عن غيرها",
  "targetAudience": "الجمهور المستهدف",
  "name": {
    "ar": "الاسم بالعربية",
    "en": "Name in English",
    "fr": "Nom en français",
    "es": "Nombre en español",
    "de": "Name auf Deutsch",
    "zh": "中文名称"
  },
  "desc": {
    "ar": "وصف جذاب بالعربية (جملتان)",
    "en": "Catchy description in English (two sentences)",
    "fr": "Description en français (deux phrases)",
    "es": "Descripción en español (dos frases)",
    "de": "Beschreibung auf Deutsch (zwei Sätze)",
    "zh": "中文描述（两句话）"
  },
  "tags": ["tag1", "tag2", "tag3"]
}`;

  const raw   = await gemini(prompt);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Invalid response from Gemini');

  const idea = JSON.parse(match[0]);
  idea.generatedAt = new Date().toISOString();
  idea.generatedBy = 'idea-agent';

  console.log(`💡 New idea: ${idea.id} (${idea.type})`);
  console.log(`   "${idea.name?.en}"`);
  console.log(`   ${idea.concept}`);

  return idea;
}
