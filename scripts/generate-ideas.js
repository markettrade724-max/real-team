/**
 * generate-ideas.js
 * يستخدم Gemini لتوليد منتج جديد وإضافته إلى products.json
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const PRODUCTS_PATH = join(ROOT, 'products.json');
const API_KEY   = process.env.GEMINI_API_KEY;

if (!API_KEY) { console.error('❌ GEMINI_API_KEY missing'); process.exit(1); }

// ── الأنواع والفئات المدعومة ──────────────────────────────────
const VALID_TYPES = [
  'racing','race','speed','car','drift',
  'sport','football','basketball',
  'arcade','shooter','action','space',
  'rpg','adventure','story','quest',
  'tool','app','timer','focus',
];

const CATEGORIES = ['game', 'app'];

// ── موضوعات للإلهام (يتم اختيار واحد عشوائياً) ──────────────
const THEMES = [
  'space exploration and alien civilizations',
  'underwater mysteries and ocean creatures',
  'time travel and historical paradoxes',
  'cyberpunk city and hacking',
  'ancient mythology and epic heroes',
  'music, rhythm and sound waves',
  'cooking, food and culinary battles',
  'sports championship and rivalries',
  'AI consciousness and digital dreams',
  'magic academy and spellcasting',
  'street racing in neon cities',
  'survival horror in abandoned places',
  'medieval kingdom building',
  'futuristic sports arena',
  'mind puzzles and brain training',
];

// ── استدعاء Gemini ─────────────────────────────────────────────
async function callGemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1200,
          temperature: 0.95,
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── توليد فكرة جديدة ──────────────────────────────────────────
async function generateIdea(existingSlugs) {
  const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
  const typeHint = VALID_TYPES[Math.floor(Math.random() * VALID_TYPES.length)];
  const catHint  = typeHint === 'tool' || typeHint === 'app' || typeHint === 'timer' || typeHint === 'focus'
    ? 'app' : 'game';

  const prompt = `You are a creative game/app designer. Generate a unique, viral-worthy game or app idea.

Theme inspiration: "${theme}"
Suggested type: "${typeHint}"
Category: "${catHint}"

STRICT RULES:
1. Return ONLY valid JSON, no markdown, no backticks, no extra text
2. The "type" field MUST be exactly one of: ${VALID_TYPES.join(', ')}
3. The "slug" must be lowercase, hyphens only, unique (not in: ${existingSlugs.slice(-10).join(', ')})
4. All 6 languages required: ar, en, fr, es, de, zh
5. "category" must be exactly "game" or "app"
6. "status" must be "available"

Return this exact JSON structure:
{
  "id": "unique-slug-here",
  "slug": "unique-slug-here",
  "type": "${typeHint}",
  "category": "${catHint}",
  "status": "available",
  "emoji": "🎮",
  "accent": "#facc15",
  "accentRgb": "250,204,21",
  "gradient": "135deg,#0f172a,#1e293b",
  "emojis": ["🎮","⭐","🌟","💫","✨","🎯","🔮","💎","🌈","🎪","🎨","🎭"],
  "name": {
    "ar": "اسم عربي مبدع",
    "en": "Creative English Name",
    "fr": "Nom Français Créatif",
    "es": "Nombre Español Creativo",
    "de": "Kreativer Deutscher Name",
    "zh": "创意中文名称"
  },
  "desc": {
    "ar": "وصف عربي جذاب 1-2 جملة",
    "en": "Compelling English description 1-2 sentences",
    "fr": "Description française convaincante 1-2 phrases",
    "es": "Descripción española convincente 1-2 oraciones",
    "de": "Überzeugende deutsche Beschreibung 1-2 Sätze",
    "zh": "引人入胜的中文描述1-2句"
  },
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "iap": [
    {
      "id": "no-ads", "type": "remove_ads", "price": 1.99, "emoji": "🚫",
      "name": { "ar": "إزالة الإعلانات", "en": "Remove Ads", "fr": "Sans pub", "es": "Sin anuncios", "de": "Werbefrei", "zh": "去广告" }
    },
    {
      "id": "full-unlock", "type": "unlock", "price": 2.99, "emoji": "⭐",
      "name": { "ar": "فتح كل المحتوى", "en": "Unlock All", "fr": "Tout débloquer", "es": "Desbloquear todo", "de": "Alles freischalten", "zh": "解锁全部" }
    }
  ],
  "levels": null,
  "generated": true,
  "generatedAt": "${new Date().toISOString()}"
}`;

  const raw = await callGemini(prompt);

  // استخراج JSON من الرد
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in Gemini response');

  const product = JSON.parse(jsonMatch[0]);

  // تحقق أساسي
  if (!product.id || !product.slug || !product.name?.en || !product.desc?.en) {
    throw new Error('Generated product missing required fields');
  }

  // تأكد من صحة الـ type
  if (!VALID_TYPES.includes(product.type)) {
    console.warn(`⚠️  Invalid type "${product.type}" — fixing to "${typeHint}"`);
    product.type = typeHint;
  }

  // تأكد من صحة الـ category
  if (!CATEGORIES.includes(product.category)) {
    product.category = catHint;
  }

  // تأكد من وجود كل اللغات
  const LANGS = ['ar','en','fr','es','de','zh'];
  LANGS.forEach(l => {
    if (!product.name[l])  product.name[l]  = product.name.en;
    if (!product.desc[l])  product.desc[l]  = product.desc.en;
  });

  // تأكد من عدم التكرار
  if (existingSlugs.includes(product.slug)) {
    product.slug = product.slug + '-' + Date.now().toString(36);
    product.id   = product.slug;
  }

  return product;
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  // قراءة المنتجات الحالية
  let products = [];
  try {
    products = JSON.parse(readFileSync(PRODUCTS_PATH, 'utf8'));
  } catch(e) {
    console.warn('⚠️  products.json not found — starting fresh');
  }

  const existingSlugs = products.map(p => p.slug);
  console.log(`📦 Current products: ${products.length}`);

  // محاولة توليد فكرة جديدة (3 محاولات)
  let newProduct = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`🤖 Generating idea (attempt ${attempt}/3)...`);
      newProduct = await generateIdea(existingSlugs);
      console.log(`✅ Generated: "${newProduct.name.en}" (${newProduct.type}) → ${newProduct.slug}`);
      break;
    } catch(e) {
      console.error(`❌ Attempt ${attempt} failed: ${e.message}`);
      if (attempt === 3) process.exit(1);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // إضافة المنتج الجديد في بداية القائمة
  products.unshift(newProduct);

  // التحقق من صحة JSON قبل الكتابة
  const json = JSON.stringify(products, null, 2);
  JSON.parse(json); // يرمي خطأ إن كان غير صالح

  writeFileSync(PRODUCTS_PATH, json, 'utf8');
  console.log(`\n🎉 products.json updated → ${products.length} products total`);
  console.log(`   New: ${newProduct.slug} (${newProduct.type} / ${newProduct.category})`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
