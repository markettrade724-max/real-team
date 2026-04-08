/**
 * feedback-agent.js
 * يحلل المنتجات الحالية ويقترح تحسينات
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const GEMINI_KEY = process.env.GEMINI_API_KEY;

async function gemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
      })
    }
  );
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function run() {
  const products = JSON.parse(
    readFileSync(join(__dirname, '..', 'products.json'), 'utf8')
  );

  const available = products.filter(p => p.status === 'available');
  const summary   = available.map(p => `- ${p.name?.en} (${p.type})`).join('\n');

  const prompt = `
أنت محلل ألعاب خبير. راجع هذه القائمة من الألعاب والتطبيقات:
${summary}

اقترح تحسينات عملية. أجب بـ JSON فقط:
{
  "strengths": ["نقطة قوة 1", "نقطة قوة 2"],
  "weaknesses": ["نقطة ضعف 1", "نقطة ضعف 2"],
  "missingTypes": ["نوع مفقود 1", "نوع مفقود 2"],
  "suggestions": [
    {
      "type": "نوع التحسين",
      "description": "وصف التحسين بالإنجليزية",
      "priority": "high/medium/low"
    }
  ],
  "nextIdea": "اقتراح للعبة التالية بجملة واحدة"
}`;

  const raw   = await gemini(prompt);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Invalid feedback response');

  const feedback = JSON.parse(match[0]);
  feedback.analyzedAt  = new Date().toISOString();
  feedback.totalGames  = available.length;

  console.log(`💬 Feedback:`);
  console.log(`   Strengths: ${feedback.strengths?.length}`);
  console.log(`   Suggestions: ${feedback.suggestions?.length}`);
  console.log(`   Next idea: ${feedback.nextIdea}`);

  return feedback;
}
