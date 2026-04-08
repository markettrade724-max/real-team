/**
 * generate-ideas.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('❌ Missing GEMINI_API_KEY');
  process.exit(1);
}

const PALETTES = [
  { accent:'#f59e0b', accentRgb:'245,158,11',  gradient:'135deg,#1c1007,#78350f' },
  { accent:'#06b6d4', accentRgb:'6,182,212',  gradient:'135deg,#042830,#164e63' },
  { accent:'#a855f7', accentRgb:'168,85,247',  gradient:'135deg,#1a0533,#581c87' },
  { accent:'#10b981', accentRgb:'16,185,129',  gradient:'135deg,#022c22,#064e3b' },
  { accent:'#ef4444', accentRgb:'239,68,68',   gradient:'135deg,#1f0707,#7f1d1d' },
  { accent:'#3b82f6', accentRgb:'59,130,246',  gradient:'135deg,#030712,#1e3a5f' },
];

const TYPES = ['memory','puzzle','word','tool','quiz'];
const DEFAULT_IAPS = [
  { id:'no-ads',      type:'remove_ads', price:1.99, emoji:'🚫',
    name:{ar:'إزالة الإعلانات',en:'Remove Ads',fr:'Sans pub',es:'Sin anuncios',de:'Werbefrei',zh:'去广告'} },
  { id:'hint-pack',   type:'consumable', price:0.99, emoji:'💡',
    name:{ar:'10 تلميحات',en:'10 Hints',fr:'10 indices',es:'10 pistas',de:'10 Hinweise',zh:'10个提示'} },
  { id:'full-unlock', type:'unlock',     price:2.99, emoji:'⭐',
    name:{ar:'فتح كل المحتوى',en:'Unlock All',fr:'Tout débloquer',es:'Desbloquear todo',de:'Alles freischalten',zh:'解锁全部'} },
];

// دالة محسنة للتعامل مع API
async function askGemini(prompt) {
  // استخدام موديل gemini-1.5-flash لنتائج أفضل في الـ JSON
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { 
        temperature: 0.8, 
        maxOutputTokens: 1024,
        responseMimeType: "application/json" // إجبار الموديل على إرسال JSON
      }
    })
  });

  const data = await res.json();
  
  if (data.error) {
    throw new Error(`Gemini API Error: ${data.error.message}`);
  }

  const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textResponse) {
    console.log("Full API Response:", JSON.stringify(data)); // لمساعدتك في حال تكرر الخطأ
    throw new Error('Empty response from Gemini');
  }

  return textResponse;
}

async function generateIdea(existingIds) {
  const type     = TYPES[Math.floor(Math.random() * TYPES.length)];
  const category = type === 'tool' ? 'app' : 'game';
  const palette  = PALETTES[Math.floor(Math.random() * PALETTES.length)];

  const prompt = `
Act as a creative app designer. Suggest a new ${category} idea of type "${type}".
Avoid using these slugs: ${existingIds.slice(-20).join(', ')}.

Return ONLY a valid JSON object:
{
  "slug": "unique-english-slug",
  "emoji": "one emoji",
  "name": { "ar": "..", "en": "..", "fr": "..", "es": "..", "de": "..", "zh": ".." },
  "desc": { "ar": "..", "en": "..", "fr": "..", "es": "..", "de": "..", "zh": ".." }
}`;

  const raw = await askGemini(prompt);

  try {
    // محاولة تنظيف الرد من علامات الـ markdown لو وجدت
    const cleanJson = raw.replace(/```json|```/g, "").trim();
    const idea = JSON.parse(cleanJson);

    if (existingIds.includes(idea.slug)) {
      idea.slug = `${idea.slug}-${Math.floor(Math.random() * 1000)}`;
    }

    return {
      id:       idea.slug,
      slug:      idea.slug,
      type,
      category,
      status:   'available',
      emoji:    idea.emoji || '🎮',
      accent:   palette.accent,
      accentRgb: palette.accentRgb,
      gradient: palette.gradient,
      name:     idea.name,
      desc:     idea.desc,
      iap:      DEFAULT_IAPS,
      generated: true,
      generatedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.error("Failed to parse JSON. Raw response was:", raw);
    throw new Error('Invalid JSON format in Gemini response');
  }
}

async function main() {
  try {
    const path = join(__dirname, '..', 'products.json');
    const products = JSON.parse(readFileSync(path, 'utf8'));
    const ids = products.map(p => p.id);

    console.log(`📦 Existing products: ${ids.length}`);
    console.log('🤖 Asking Gemini for new idea...');

    const idea = await generateIdea(ids);
    products.push(idea);
    writeFileSync(path, JSON.stringify(products, null, 2), 'utf8');
    
    console.log(`✅ Added: ${idea.slug} (${idea.type})`);
  } catch (err) {
    console.error('❌ Critical Error:', err.message);
    process.exit(1);
  }
}

main();
