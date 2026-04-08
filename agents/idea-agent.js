/**
 * idea-agent.js - النسخة النهائية المستقرة
 * تم تصحيح رابط الموديل وتفعيل وضع JSON الصارم
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEMINI_KEY = process.env.GEMINI_API_KEY;

/**
 * دالة الاتصال بـ Gemini API
 */
async function gemini(prompt) {
  // الرابط المصحح لنسخة v1beta وموديل gemini-1.5-flash
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { 
        temperature: 0.8, 
        maxOutputTokens: 2048,
        responseMimeType: "application/json" // إجبار الموديل على إرسال JSON فقط
      }
    })
  });

  const data = await res.json();

  // فحص الأخطاء القادمة من جوجل
  if (data.error) {
    console.error("❌ Gemini API Details:", JSON.stringify(data.error, null, 2));
    throw new Error(`Gemini API Error: ${data.error.message}`);
  }

  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!responseText) {
    throw new Error('Empty response: Gemini candidate content is missing');
  }

  return responseText;
}

export async function run() {
  // 1. قراءة المنتجات الحالية لتجنب التكرار
  let existingIds = "";
  try {
    const productsPath = join(__dirname, '..', 'products.json');
    const products = JSON.parse(readFileSync(productsPath, 'utf8'));
    existingIds = products.slice(-20).map(p => p.id).join(', ');
  } catch (e) {
    console.warn("⚠️ Could not read products.json, starting fresh.");
  }

  // 2. اختيار نوع عشوائي
  const TYPES = ['memory', 'puzzle', 'word', 'quiz', 'tool', 'arcade'];
  const type = TYPES[Math.floor(Math.random() * TYPES.length)];

  // 3. كتابة البرومبت (الطلب)
  const prompt = `
Act as an expert creative game and app designer. 
Generate a new, innovative ${type === 'tool' ? 'app' : 'game'} idea of type "${type}".
The idea must be executable in a web browser (HTML5/JS).

Avoid these existing IDs: ${existingIds}

Return ONLY a JSON object with this structure:
{
  "id": "slug-in-english",
  "type": "${type}",
  "category": "${type === 'tool' ? 'app' : 'game'}",
  "emoji": "🎮",
  "concept": "Core idea description",
  "name": { "ar": "..", "en": "..", "fr": "..", "es": "..", "de": "..", "zh": ".." },
  "desc": { "ar": "..", "en": "..", "fr": "..", "es": "..", "de": "..", "zh": ".." },
  "tags": ["tag1", "tag2"]
}`;

  const raw = await gemini(prompt);
  
  try {
    // تنظيف الرد من أي علامات Markdown قد يضيفها الموديل رغم طلب JSON
    const cleanJson = raw.replace(/```json|```/g, "").trim();
    const idea = JSON.parse(cleanJson);

    // إضافة بيانات إضافية للتوثيق
    idea.generatedAt = new Date().toISOString();
    idea.generatedBy = 'idea-agent';

    console.log(`✅ Successfully generated idea: ${idea.id}`);
    return idea;

  } catch (err) {
    console.error('❌ JSON Parsing Error. Content received:', raw);
    throw new Error('Failed to parse Gemini response as JSON');
  }
}
