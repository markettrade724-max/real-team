/**
 * generate-levels.js
 * يولّد مستويات لمنتجات arcade/action التي ليس لها مستويات بعد
 * مع مستويات افتراضية مناسبة لكل نوع
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

// أنواع تحتاج مستويات
const NEEDS_LEVELS = ['arcade','shooter','action','space','rpg','adventure','story','quest','racing','race','sport'];

// المستويات الافتراضية لكل نوع
const DEFAULT_LEVELS = {
  arcade: [
    { enemyCount:8,  enemySpeed:1.3, enemyHealth:1, bulletSpeed:6, spawnInterval:90 },
    { enemyCount:11, enemySpeed:1.6, enemyHealth:1, bulletSpeed:6, spawnInterval:80 },
    { enemyCount:14, enemySpeed:1.9, enemyHealth:2, bulletSpeed:6, spawnInterval:70 },
    { enemyCount:17, enemySpeed:2.2, enemyHealth:2, bulletSpeed:6, spawnInterval:60 },
    { enemyCount:20, enemySpeed:2.5, enemyHealth:3, bulletSpeed:6, spawnInterval:50 },
  ],
  racing: [
    { laps:3, trackDifficulty:'easy', opponents:2, maxSpeed:200 },
    { laps:4, trackDifficulty:'medium', opponents:3, maxSpeed:240 },
    { laps:5, trackDifficulty:'medium', opponents:3, maxSpeed:260 },
    { laps:5, trackDifficulty:'hard', opponents:4, maxSpeed:280 },
    { laps:6, trackDifficulty:'hard', opponents:4, maxSpeed:300 },
  ],
  sport: [
    { matchDuration:60, difficulty:'easy', teamStrength:1 },
    { matchDuration:60, difficulty:'medium', teamStrength:2 },
    { matchDuration:90, difficulty:'medium', teamStrength:2 },
    { matchDuration:90, difficulty:'hard', teamStrength:3 },
    { matchDuration:90, difficulty:'hard', teamStrength:3 },
  ],
  rpg: [
    { enemyCount:3, enemySpeed:0.8, enemyHealth:1, bulletSpeed:5, spawnInterval:120, bossLevel:false },
    { enemyCount:4, enemySpeed:1.0, enemyHealth:1, bulletSpeed:5, spawnInterval:100, bossLevel:false },
    { enemyCount:5, enemySpeed:1.2, enemyHealth:2, bulletSpeed:5, spawnInterval:90,  bossLevel:false },
    { enemyCount:6, enemySpeed:1.4, enemyHealth:2, bulletSpeed:5, spawnInterval:80,  bossLevel:false },
    { enemyCount:7, enemySpeed:1.6, enemyHealth:3, bulletSpeed:5, spawnInterval:70,  bossLevel:true  },
  ],
};

function getDefaultLevels(type) {
  if (['racing','race','speed','car','drift','moto'].includes(type)) return DEFAULT_LEVELS.racing;
  if (['sport','football','basketball','tennis','soccer'].includes(type)) return DEFAULT_LEVELS.sport;
  if (['rpg','adventure','story','quest'].includes(type)) return DEFAULT_LEVELS.rpg;
  return DEFAULT_LEVELS.arcade;
}

async function callGemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
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

function extractJsonArray(raw) {
  const clean = raw.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
  const match = clean.match(/\[[\s\S]*\]/);
  if (match) return match[0];
  if (clean.startsWith('[')) return clean;
  throw new Error('No JSON array in response');
}

async function generateLevels(product) {
  const isRacing = ['racing','race','speed','car','drift','moto'].includes(product.type);
  const isSport  = ['sport','football','basketball','tennis','soccer'].includes(product.type);
  const isRPG    = ['rpg','adventure','story','quest'].includes(product.type);

  let levelSchema, example;

  if (isRacing) {
    levelSchema = `{ "laps": 3, "trackDifficulty": "easy", "opponents": 2, "maxSpeed": 200 }`;
    example = `{ "laps": 3, "trackDifficulty": "easy", "opponents": 2, "maxSpeed": 200 }`;
  } else if (isSport) {
    levelSchema = `{ "matchDuration": 60, "difficulty": "easy", "teamStrength": 1 }`;
    example = `{ "matchDuration": 60, "difficulty": "easy", "teamStrength": 1 }`;
  } else if (isRPG) {
    levelSchema = `{ "enemyCount": 3, "enemySpeed": 1.0, "enemyHealth": 1, "bulletSpeed": 5, "spawnInterval": 90, "bossLevel": false }`;
    example = `{ "enemyCount": 3, "enemySpeed": 0.8, "enemyHealth": 1, "bulletSpeed": 5, "spawnInterval": 120, "bossLevel": false }`;
  } else {
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
  const arrStr = extractJsonArray(raw);
  const levels = JSON.parse(arrStr);
  if (!Array.isArray(levels) || levels.length !== 5) throw new Error('Expected exactly 5 levels');

  return levels;
}

async function main() {
  // قراءة آمنة
  let products;
  try {
    if (!existsSync(PRODUCTS_PATH)) { console.error('❌ products.json not found'); process.exit(1); }
    products = JSON.parse(readFileSync(PRODUCTS_PATH, 'utf8'));
  } catch (e) {
    console.error('❌ Failed to read products.json:', e.message);
    process.exit(1);
  }

  console.log(`📦 Loaded ${products.length} products`);

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
      const idx = products.findIndex(p => p.id === product.id);
      if (idx !== -1) { products[idx].levels = levels; updated++; }
      console.log(`   ✅ ${product.slug} → ${levels.length} levels`);
      await new Promise(r => setTimeout(r, 1200));
    } catch(e) {
      console.warn(`   ⚠️  ${product.slug} failed: ${e.message} — using defaults`);
      const idx = products.findIndex(p => p.id === product.id);
      if (idx !== -1) {
        products[idx].levels = getDefaultLevels(product.type);
        updated++;
      }
    }
  }

  if (updated > 0) {
    // كتابة آمنة مع نسخة احتياطية
    try {
      copyFileSync(PRODUCTS_PATH, BACKUP_PATH);
      const json = JSON.stringify(products, null, 2);
      JSON.parse(json); // تحقق من الصحة
      writeFileSync(PRODUCTS_PATH, json, 'utf8');
      console.log(`\n✅ Updated ${updated} products with levels (backup created)`);
    } catch (e) {
      console.error('❌ Failed to write products.json:', e.message);
      process.exit(1);
    }
  } else {
    console.log('ℹ️  No changes made');
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
