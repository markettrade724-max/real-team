/**
 * idea-agent.js - المصحح
 * يولّد أفكاراً إبداعية مع ضمان استلام JSON نظيف
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEMINI_KEY = process.env.GEMINI_API_KEY;

async function gemini(prompt) {
  // استخدام v1beta لدعم JSON Mode
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
  
  const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { 
          temperature: 0.8, // خفض الحرارة قليلاً لزيادة الالتزام بالهيكل
          maxOutputTokens: 2048,
          responseMimeType: "application/json" // إجبار الموديل على إخراج JSON فقط
        }
      })
    }
  );

  const data = await res.json();
  
  if (data.error) {
    throw new Error(`Gemini API Error: ${data.error.message}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned an empty response');
  
  return text;
}

export async function run() {
  // قراءة المنتجات الحالية لتجنب التكرار
  const productsPath = join(__dirname, '..', 'products.json');
  const products = JSON.parse(readFileSync(productsPath, 'utf8'));
  // إرسال آخر 20 معرف فقط لتوفير الـ Tokens وضمان السياق
  const existingIds = products.slice(-20).map(p => p.id).join(', ');

  const TYPES = ['memory', 'puzzle', 'word', 'quiz', 'tool', 'arcade'];
  const type = TYPES[Math.floor(Math.random() * TYPES.length)];

  const prompt = `
Act as an expert game designer. Suggest a new ${type === 'tool' ? 'utility app' : 'game'} of type "${type}".
Do not repeat these ideas: ${existingIds}.

Requirements:
- HTML5 compatible.
- Creative and unique.

Return ONLY this JSON structure:
{
  "id": "unique-slug-in-english",
  "type": "${type}",
  "category": "${type === 'tool' ? 'app' : 'game'}",
  "emoji": "🎮",
  "concept": "Brief core idea in English",
  "uniqueFeature": "What makes it special",
  "targetAudience": "Target audience",
  "name": { "ar": "..", "en": "..", "fr": "..", "es": "..", "de": "..", "zh": ".." },
  "desc": { "ar": "..", "en": "..", "fr": "..", "es": "..", "de": "..", "zh": ".." },
  "tags": ["tag1", "tag2", "tag3"]
}`;

  const raw = await gemini(prompt);
  
  try {
    // تنظيف النص لضمان عدم وجود علامات Markdown زائدة
    const cleanJson = raw.replace(/```json|```/g, "").trim();
    const idea = JSON.parse(cleanJson);

    // إضافة البيانات التعريفية
    idea.generatedAt = new Date().toISOString();
    idea.generatedBy = 'idea-agent';

    console.log(`✅ New idea generated: ${idea.id}`);
    return idea;

  } catch (err) {
    console.error('❌ JSON Parsing failed. Raw response:', raw);
    throw new Error('Invalid JSON format from Gemini');
  }
}
