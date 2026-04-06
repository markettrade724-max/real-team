/**
 * generate-ideas.js
 * Gemini يولّد أفكار ألعاب/تطبيقات جديدة ويضيفها إلى products.json
 * يشتغل أسبوعياً عبر GitHub Actions
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

// ── ألوان وتدرجات جاهزة ──────────────────────────────────────
const PALETTES = [
  { accent:'#f59e0b', accentRgb:'245,158,11',  gradient:'135deg,#1c1007,#78350f' },
  { accent:'#06b6d4', accentRgb:'6,182,212',   gradient:'135deg,#042830,#164e63' },
  { accent:'#a855f7', accentRgb:'168,85,247',  gradient:'135deg,#1a0533,#581c87' },
  { accent:'#10b981', accentRgb:'16,185,129',  gradient:'135deg,#022c22,#064e3b' },
  { accent:'#ef4444', accentRgb:'239,68,68',   gradient:'135deg,#1f0707,#7f1d1d' },
  { accent:'#3b82f6', accentRgb:'59,130,246',  gradient:'135deg,#030712,#1e3a5f' },
];

// ── أنواع المحتوى المدعومة ────────────────────────────────────
const TYPES = ['memory','puzzle','word','tool','quiz'];
const CATEGORIES = ['game','app'];

// ── IAP افتراضية لكل نوع ─────────────────────────────────────
const DEFAULT_IAPS = [
  { id:'no-ads',      type:'remove_ads', price:1.99, emoji:'🚫',
    name:{ar:'إزالة الإعلانات',en:'Remove Ads',fr:'Sans pub',es:'Sin anuncios',de:'Werbefrei',zh:'去广告'} },
  { id:'hint-pack',   type:'consumable', price:0.99, emoji:'💡',
    name:{ar:'10 تلميحات',en:'10 Hints',fr:'10 indices',es:'10 pistas',de:'10 Hinweise',zh:'10个提示'} },
  { id:'full-unlock', type:'unlock',     price:2.99, emoji:'⭐',
    name:{ar:'فتح كل المحتوى',en:'Unlock All',fr:'Tout débloquer',es:'Desbloquear todo',de:'Alles freischalten',zh:'解锁全部'} },
];

// ── استدعاء Gemini API ────────────────────────────────────────
async function askGemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 1024 }
      })
    }
  );
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── توليد فكرة جديدة ─────────────────────────────────────────
async function generateIdea(existingIds) {
  const type     = TYPES[Math.floor(Math.random() * TYPES.length)];
  const category = type === 'tool' ? 'app' : 'game';
  const palette  = PALETTES[Math.floor(Math.random() * PALETTES.length)];

  const prompt = `
أنت مصمم ألعاب مبدع. اقترح فكرة ${category === 'game' ? 'لعبة' : 'تطبيق'} من نوع "${type}" مبتكرة وممتعة.

المعرفات الموجودة (لا تكرر): ${existingIds.join(', ')}

أجب بـ JSON فقط بهذا الشكل بدون أي نص إضافي:
{
  "slug": "اسم-بالانجليزية-مع-شرطات",
  "emoji": "إيموجي واحد",
  "name": {
    "ar": "الاسم بالعربية",
    "en": "Name in English",
    "fr": "Nom en français",
    "es": "Nombre en español",
    "de": "Name auf Deutsch",
    "zh": "中文名称"
  },
  "desc": {
    "ar": "وصف قصير بالعربية",
    "en": "Short description in English",
    "fr": "Description courte en français",
    "es": "Descripción corta en español",
    "de": "Kurze Beschreibung auf Deutsch",
    "zh": "简短描述"
  }
}`;

  const raw = await askGemini(prompt);

  // استخراج JSON من الرد
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Invalid Gemini response');
  const idea = JSON.parse(match[0]);

  // التأكد أن الـ slug غير مكرر
  if (existingIds.includes(idea.slug)) {
    idea.slug = idea.slug + '-' + Date.now().toString(36);
  }

  return {
    id:       idea.slug,
    slug:     idea.slug,
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
}

// ── main ──────────────────────────────────────────────────────
async function main() {
  const path     = join(__dirname, '..', 'products.json');
  const products = JSON.parse(readFileSync(path, 'utf8'));
  const ids      = products.map(p => p.id);

  console.log(`📦 Existing products: ${ids.length}`);
  console.log('🤖 Asking Gemini for new idea...');

  try {
    const idea = await generateIdea(ids);
    products.push(idea);
    writeFileSync(path, JSON.stringify(products, null, 2), 'utf8');
    console.log(`✅ Added: ${idea.slug} (${idea.type})`);
    console.log(`📝 products.json now has ${products.length} items`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
