/**
 * generate-levels.js
 * يولّد مستويات لمنتجات arcade/action التي ليس لها مستويات بعد
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const PRODUCTS_PATH = join(ROOT, 'products.json');
const API_KEY   = process.env.GEMINI_API_KEY;

if (!API_KEY) { console.error('❌ GEMINI_API_KEY missing'); process.exit(1); }

// أنواع تحتاج مستويات
const NEEDS_LEVELS = ['arcade','shooter','action','space','rpg','adventure','story','quest','racing','race','sport'];

async function callGemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 800, temperature: 0.7 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function generateLevels(product) {
  const isRacing = ['racing','race','speed','car','drift','moto'].includes(product.type);
  const isSport  = ['sport','football','basketball','tennis','soccer'].includes(product.type);
  const isRPG    = ['rpg','adventure','story','quest'].includes(product.type);

  let levelSchema, example;

  if (isRacing) {
    levelSchema = `{ "enemyCount": 0, "enemySpeed": 1.0, "laps": 3, "trackDifficulty": "easy", "opponents": 3, "maxSpeed": 280 }`;
    example = `{ "enemyCount": 0, "enemySpeed": 1.0, "laps": 3, "trackDifficulty": "easy", "opponents": 2, "maxSpeed": 200 }`;
  } else if (isSport) {
    levelSchema = `{ "enemyCount": 0, "enemySpeed": 1.0, "matchDuration": 60, "difficulty": "easy", "teamStrength": 1 }`;
    example = `{ "enemyCount": 0, "enemySpeed": 1.0, "matchDuration": 60, "difficulty": "easy", "teamStrength": 1 }`;
  } else if (isRPG) {
    levelSchema = `{ "enemyCount": 3, "enemySpeed": 1.0, "enemyHealth": 1, "bulletSpeed": 5, "spawnInterval": 90, "bossLevel": false }`;
    example = `{ "enemyCount": 3, "enemySpeed": 0.8, "enemyHealth": 1, "bulletSpeed": 5, "spawnInterval": 120, "bossLevel": false }`;
  } else {
    // arcade default
    levelSchema = `{ "enemyCount": 8, "enemySpeed": 1.3, "enemyHealth": 1, "bulletSpeed": 6, "spawnInterval": 90 }`;
    example = `{ "enemyCount": 8, "enemySpeed": 1.3, "enemyHealth": 1, "bulletSpeed": 6, "spawnInterval": 90 }`;
  }

  const prompt = `Generate exactly 5 game levels for "${product.name.en}" (type: ${product.type}).

Level schema: ${levelSchema}
Level 1 example: ${example}

Rules:
- Each level must be harder than the previous
- Level 5 should be significantly harder than level 1
- For arcade: enemyCount 8→20, enemySpeed 1.3→2.8, enemyHealth 1→3, spawnInterval 90→45
- Level 5 should have bossLevel: true (if applicable)
- Return ONLY a JSON array of exactly 5 objects, no markdown, no extra text

Example output format:
[
  ${example},
  ...4 more levels...
]`;

  const raw = await callGemini(prompt);
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON array in response');

  const levels = JSON.parse(match[0]);
  if (!Array.isArray(levels) || levels.length !== 5) throw new Error('Expected exactly 5 levels');

  return levels;
}

async function main() {
  let products = JSON.parse(readFileSync(PRODUCTS_PATH, 'utf8'));
  console.log(`📦 Loaded ${products.length} products`);

  // فلترة المنتجات التي تحتاج مستويات
  const toProcess = products.filter(p =>
    p.status === 'available' &&
    NEEDS_LEVELS.includes(p.type) &&
    (!p.levels || p.levels.length === 0)
  );

  if (!toProcess.length) {
    console.log('✅ All products already have levels — nothing to do');
    return;
  }

  console.log(`🎯 Need levels: ${toProcess.map(p => p.slug).join(', ')}`);

  let updated = 0;
  for (const product of toProcess) {
    try {
      console.log(`⚙️  Generating levels for: ${product.slug}`);
      const levels = await generateLevels(product);
      // تحديث المنتج في المصفوفة
      const idx = products.findIndex(p => p.id === product.id);
      if (idx !== -1) { products[idx].levels = levels; updated++; }
      console.log(`   ✅ ${product.slug} → ${levels.length} levels`);
      // تأخير بين الطلبات
      await new Promise(r => setTimeout(r, 1200));
    } catch(e) {
      console.warn(`   ⚠️  ${product.slug} failed: ${e.message} — using defaults`);
      // استخدام مستويات افتراضية
      const idx = products.findIndex(p => p.id === product.id);
      if (idx !== -1) {
        products[idx].levels = [
          { enemyCount:8,  enemySpeed:1.3, enemyHealth:1, bulletSpeed:6, spawnInterval:90 },
          { enemyCount:11, enemySpeed:1.6, enemyHealth:1, bulletSpeed:6, spawnInterval:80 },
          { enemyCount:14, enemySpeed:1.9, enemyHealth:2, bulletSpeed:6, spawnInterval:70 },
          { enemyCount:17, enemySpeed:2.2, enemyHealth:2, bulletSpeed:6, spawnInterval:60 },
          { enemyCount:20, enemySpeed:2.5, enemyHealth:3, bulletSpeed:6, spawnInterval:50 },
        ];
        updated++;
      }
    }
  }

  if (updated > 0) {
    // التحقق من صحة JSON قبل الكتابة
    const json = JSON.stringify(products, null, 2);
    JSON.parse(json);
    writeFileSync(PRODUCTS_PATH, json, 'utf8');
    console.log(`\n✅ Updated ${updated} products with levels`);
  } else {
    console.log('ℹ️  No changes made');
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
