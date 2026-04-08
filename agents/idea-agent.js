/**
 * idea-agent.js
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEMINI_KEY = process.env.GEMINI_API_KEY;

async function gemini(prompt) {
  // جربنا v1beta ولم ينفع، الآن نستخدم v1 المستقر
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_
```KEY}`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { 
        temperature: 0.7,
        responseMimeType: "application/json"
      }
    })
  });

  const data = await res.json();

  if (data.error) {
    // هذا السطر سيطبع لك السبب الحقيقي في الـ Actions (مثلاً: مفتاح خاطئ أو منطقة غير مدعومة)
    throw new Error(`Gemini API Error: ${data.error.message} (Status: ${data.error.status})`);
  }

  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function run() {
  const products = JSON.parse(readFileSync(join(__dirname, '..', 'products.json'), 'utf8'));
  const existingIds = products.slice(-10).map(p => p.id).join(', ');

  const prompt = `Generate a new game idea. Return ONLY JSON: {"id": "slug", "name": {"en": "Name"}, "desc": {"en": "Desc"}, "type": "puzzle"}`;

  const raw = await gemini(prompt);
  const idea = JSON.parse(raw.replace(/```json|```/g, "").trim());
  
  idea.generatedAt = new Date().toISOString();
  return idea;
}
