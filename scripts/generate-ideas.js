/**
 * generate-ideas.js
 * يستخدم Gemini لتوليد منتج جديد وإضافته إلى products.json
 * مع معالجة متقدمة لأخطاء JSON وحل مشكلة انقطاع المخرجات
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { askGemini } from '../agents/_gemini.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const PRODUCTS_PATH = join(ROOT, 'products.json');
const BACKUP_PATH   = PRODUCTS_PATH + '.bak';
const API_KEY   = process.env.GEMINI_API_KEY;

if (!API_KEY) { console.error('[ERROR] GEMINI_API_KEY missing'); process.exit(1); }

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

function repairJSON(raw) {
  let json = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  const startObj = json.indexOf('{');
  if (startObj === -1) throw new Error('No JSON found');
  json = json.substring(startObj);

  json = json.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3');

  let braceCount = 0, inString = false, escapeNext = false;
  for (const ch of json) {
    if (escapeNext) { escapeNext = false; continue; }
    if (ch === '\\') { escapeNext = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') braceCount++;
    if (ch === '}') braceCount--;
  }
  while (braceCount > 0) { json += '}'; braceCount--; }
  if (json.endsWith('"') || json.endsWith(',') || json.endsWith(':')) {
    json += '" "';
    while (braceCount > 0) { json += '}'; braceCount--; }
  }

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

CRITICAL: Keep descriptions SHORT (max 10 words each) to fit within token limit.
Only provide translations in 3 languages: en, ar, fr. Other languages will be auto-filled.

Return ONLY valid JSON, no markdown, no backticks, no extra text. Ensure JSON is complete.

{
  "id": "unique-slug",
  "slug": "unique-slug",
  "type": "${typeHint}",
  "category": "${catHint}",
  "status": "available",
  "emoji": "🎮",
  "accent": "#facc15",
  "accentRgb": "250,204,21",
  "gradient": "135deg,#0f172a,#1e293b",
  "emojis": ["🎮","⭐","🌟"],
  "name": { "ar": "اسم", "en": "Name", "fr": "Nom" },
  "desc": { "ar": "وصف قصير", "en": "Short desc", "fr": "Desc courte" },
  "tags": ["tag1","tag2","tag3"]
}`;

  const raw = await askGemini(prompt, 0.8, { topP: 0.9, maxTokens: 1200 });
  console.log('[INFO] Raw response length:', raw.length);

  let jsonStr;
  try {
    jsonStr = repairJSON(raw);
  } catch (e) {
    console.error('[ERROR] Could not extract JSON from response');
    throw e;
  }

  let product;
  try {
    product = JSON.parse(jsonStr);
  } catch (e) {
    console.error('[ERROR] JSON parse error after repair:', e.message);
    console.error('[DEBUG] Attempted to parse:', jsonStr.substring(0, 300));
    throw e;
  }

  if (!product.id || !product.slug || !product.name?.en) {
    throw new Error('Generated product missing required fields');
  }

  if (!VALID_TYPES.includes(product.type)) {
    product.type = typeHint;
  }

  if (!CATEGORIES.includes(product.category)) {
    product.category = catHint;
  }

  const LANGS = ['ar','en','fr','es','de','zh'];
  LANGS.forEach(l => {
    if (!product.name) product.name = {};
    if (!product.desc) product.desc = {};
    if (!product.name[l])  product.name[l]  = product.name.en || product.name.ar || '';
    if (!product.desc[l])  product.desc[l]  = product.desc.en || product.desc.ar || '';
  });

  if (!Array.isArray(product.emojis) || product.emojis.length === 0) {
    product.emojis = ['🎮','⭐','🌟','💫','✨','🎯','🔮','💎','🌈','🎪','🎨','🎭'];
  }

  if (existingSlugs.includes(product.slug)) {
    product.slug = product.slug + '-' + Date.now().toString(36);
    product.id   = product.slug;
  }

  if (!product.iap || !Array.isArray(product.iap)) {
    product.iap = [
      {
        "id": "no-ads", "type": "remove_ads", "price": 1.99, "emoji": "🚫",
        "name": { "ar": "إزالة الإعلانات", "en": "Remove Ads", "fr": "Sans pub", "es": "Sin anuncios", "de": "Werbefrei", "zh": "去广告" }
      },
      {
        "id": "full-unlock", "type": "unlock", "price": 2.99, "emoji": "⭐",
        "name": { "ar": "فتح كل المحتوى", "en": "Unlock All", "fr": "Tout débloquer", "es": "Desbloquear todo", "de": "Alles freischalten", "zh": "解锁全部" }
      }
    ];
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
    console.error('[ERROR] Failed to read products.json, aborting:', e.message);
    process.exit(1);
  }

  const existingSlugs = products.map(p => p.slug);
  console.log(`[INFO] Current products: ${products.length}`);

  let newProduct = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`[INFO] Generating idea (attempt ${attempt}/3)...`);
      newProduct = await generateIdea(existingSlugs);
      console.log(`[OK] Generated: "${newProduct.name.en}" (${newProduct.type}) -> ${newProduct.slug}`);
      break;
    } catch(e) {
      console.error(`[ERROR] Attempt ${attempt} failed: ${e.message}`);
      if (attempt === 3) throw new Error('All generation attempts failed');
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (!newProduct) throw new Error('Could not generate a new product');

  if (existsSync(PRODUCTS_PATH)) {
    copyFileSync(PRODUCTS_PATH, BACKUP_PATH);
    console.log('[INFO] Backup of products.json created');
  }

  products.unshift(newProduct);

  const json = JSON.stringify(products, null, 2);
  JSON.parse(json);

  try {
    writeFileSync(PRODUCTS_PATH, json, 'utf8');
    console.log(`\n[OK] products.json updated -> ${products.length} products total`);
    console.log(`   New: ${newProduct.slug} (${newProduct.type} / ${newProduct.category})`);
  } catch(e) {
    console.error('[ERROR] Failed to write products.json:', e.message);
    console.log('   Backup preserved at', BACKUP_PATH);
    process.exit(1);
  }
}

main().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });
