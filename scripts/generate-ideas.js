/**
 * generate-ideas.js
 * يستخدم Gemini لتوليد منتج جديد وإضافته إلى products.json
 * مع معالجة متقدمة لأخطاء JSON
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const PRODUCTS_PATH = join(ROOT, 'products.json');
const BACKUP_PATH   = PRODUCTS_PATH + '.bak';
const API_KEY   = process.env.GEMINI_API_KEY;

if (!API_KEY) { console.error('❌ GEMINI_API_KEY missing'); process.exit(1); }

const VALID_TYPES = [
  'racing','race','speed','car','drift',
  'sport','football','basketball',
  'arcade','shooter','action','space',
  'rpg','adventure','story','quest',
  'tool','app','timer','focus',
];

const CATEGORIES = ['game', 'app'];

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

async function callGemini(prompt, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 1200,
            temperature: 0.8,
            responseMimeType: 'application/json',
          },
        }),
      }
    );
    if (res.status === 503) {
      const wait = (i + 1) * 8000;
      console.log(`⏳ 503 overloaded — waiting ${wait/1000}s before retry ${i+1}/${retries}`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
  throw new Error('Gemini unavailable after retries');
}

// إصلاح JSON المعطوب بذكاء
function repairJSON(raw) {
  let json = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // إذا بدأ بـ [ أو { فهو جيد، وإلا حاول استخراج أول { أو [
  const startObj = json.indexOf('{');
  const startArr = json.indexOf('[');
  if (startObj === -1 && startArr === -1) throw new Error('No JSON found');

  const start = startObj !== -1 && (startArr === -1 || startObj < startArr) ? startObj : startArr;
  json = json.substring(start);

  // تصحيح علامات الاقتباس المفقودة في أسماء الخصائص
  json = json.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3');

  // إزالة أي نص بعد آخر }
  let end = json.lastIndexOf('}');
  if (end !== -1) json = json.substring(0, end + 1);

  return json;
}

async function generateIdea(existingSlugs) {
  const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
  const typeHint = VALID_TYPES[Math.floor(Math.random() * VALID_TYPES.length)];
  const catHint  = ['tool','app','timer','focus'].includes(typeHint) ? 'app' : 'game';

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
7. Make sure all JSON property names are double-quoted and no trailing commas

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
  console.log('📝 Raw response:', raw.substring(0, 200) + '...');

  let jsonStr;
  try {
    jsonStr = repairJSON(raw);
  } catch (e) {
    console.error('❌ Could not extract JSON from response');
    throw e;
  }

  let product;
  try {
    product = JSON.parse(jsonStr);
  } catch (e) {
    console.error('❌ JSON parse error after repair:', e.message);
    console.error('🤖 Attempted to parse:', jsonStr.substring(0, 300));
    throw e;
  }

  if (!product.id || !product.slug || !product.name?.en || !product.desc?.en) {
    throw new Error('Generated product missing required fields');
  }

  if (!VALID_TYPES.includes(product.type)) {
    console.warn(`⚠️  Invalid type "${product.type}" — fixing to "${typeHint}"`);
    product.type = typeHint;
  }

  if (!CATEGORIES.includes(product.category)) {
    product.category = catHint;
  }

  const LANGS = ['ar','en','fr','es','de','zh'];
  LANGS.forEach(l => {
    if (!product.name[l])  product.name[l]  = product.name.en;
    if (!product.desc[l])  product.desc[l]  = product.desc.en;
  });

  if (existingSlugs.includes(product.slug)) {
    product.slug = product.slug + '-' + Date.now().toString(36);
    product.id   = product.slug;
  }

  return product;
}

async function main() {
  let products = [];
  try {
    if (existsSync(PRODUCTS_PATH)) {
      products = JSON.parse(readFileSync(PRODUCTS_PATH, 'utf8'));
    }
  } catch(e) {
    console.error('❌ Failed to read products.json, aborting:', e.message);
    process.exit(1);
  }

  const existingSlugs = products.map(p => p.slug);
  console.log(`📦 Current products: ${products.length}`);

  let newProduct = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`🤖 Generating idea (attempt ${attempt}/3)...`);
      newProduct = await generateIdea(existingSlugs);
      console.log(`✅ Generated: "${newProduct.name.en}" (${newProduct.type}) → ${newProduct.slug}`);
      break;
    } catch(e) {
      console.error(`❌ Attempt ${attempt} failed: ${e.message}`);
      if (attempt === 3) throw new Error('All generation attempts failed');
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (!newProduct) throw new Error('Could not generate a new product');

  if (existsSync(PRODUCTS_PATH)) {
    copyFileSync(PRODUCTS_PATH, BACKUP_PATH);
    console.log('📋 Backup of products.json created');
  }

  products.unshift(newProduct);

  const json = JSON.stringify(products, null, 2);
  JSON.parse(json);

  try {
    writeFileSync(PRODUCTS_PATH, json, 'utf8');
    console.log(`\n🎉 products.json updated → ${products.length} products total`);
    console.log(`   New: ${newProduct.slug} (${newProduct.type} / ${newProduct.category})`);
  } catch(e) {
    console.error('❌ Failed to write products.json:', e.message);
    console.log('   Backup preserved at', BACKUP_PATH);
    process.exit(1);
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
