import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEMINI_KEY = process.env.GEMINI_API_KEY;

async function gemini(prompt) {
  // استخدام الموديل الجديد Gemini 2.5 Flash بناءً على إعدادات حسابك
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { 
        temperature: 0.8,
        maxOutputTokens: 1024,
        responseMimeType: "application/json" 
      }
    })
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`[Gemini 2.5 Error]: ${data.error.message}`);
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function run() {
  const productsPath = join(__dirname, '..', 'products.json');
  const products = JSON.parse(readFileSync(productsPath, 'utf8'));
  const existingIds = products.slice(-15).map(p => p.id).join(', ');

  const TYPES = ['memory', 'puzzle', 'word', 'quiz', 'tool', 'arcade'];
  const type = TYPES[Math.floor(Math.random() * TYPES.length)];

  const prompt = `Suggest a unique "${type}" web game. Do not repeat: ${existingIds}. Return ONLY JSON with fields: id, name, desc (multi-lang), concept, emoji.`;

  const raw = await gemini(prompt);
  const idea = JSON.parse(raw.replace(/```json|```/g, "").trim());
  
  idea.generatedAt = new Date().toISOString();
  idea.modelUsed = "gemini-2.5-flash";

  console.log(`💡 New Idea: ${idea.id}`);
  return idea;
}
