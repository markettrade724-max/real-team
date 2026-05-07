/**
 * generate-levels.js — يولد 5 مستويات متدرجة الصعوبة لكل لعبة
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PRODUCTS_PATH = join(ROOT, 'products.json');
const BACKUP_PATH = PRODUCTS_PATH + '.bak';

function loadProducts() {
  if (!existsSync(PRODUCTS_PATH)) return [];
  return JSON.parse(readFileSync(PRODUCTS_PATH, 'utf8'));
}

function saveProducts(products) {
  if (existsSync(PRODUCTS_PATH)) copyFileSync(PRODUCTS_PATH, BACKUP_PATH);
  writeFileSync(PRODUCTS_PATH, JSON.stringify(products, null, 2), 'utf8');
}

/**
 * توليد مستويات متدرجة وغنية بالتنوع
 */
function generateRichLevels(productType) {
  const isShooter = ['arcade','shooter','action','space','bullet','battle','survival','mischief'].some(t => productType.includes(t));

  if (isShooter) {
    return [
      {
        enemyCount: 8,
        enemySpeed: 1.1,
        enemyHealth: 1,
        enemyTypes: [0, 1],
        bossLevel: false,
        spawnPattern: 'waves',
        name: { ar: 'البداية', en: 'First Contact' }
      },
      {
        enemyCount: 14,
        enemySpeed: 1.5,
        enemyHealth: 2,
        enemyTypes: [0, 1, 2],
        bossLevel: false,
        spawnPattern: 'zigzag',
        name: { ar: 'المقاومة', en: 'Resistance' }
      },
      {
        enemyCount: 20,
        enemySpeed: 1.9,
        enemyHealth: 3,
        enemyTypes: [1, 2, 3],
        bossLevel: false,
        spawnPattern: 'storm',
        name: { ar: 'العاصفة', en: 'The Storm' }
      },
      {
        enemyCount: 8,
        enemySpeed: 1.3,
        enemyHealth: 8,
        enemyTypes: [3],
        bossLevel: true,
        spawnPattern: 'boss',
        name: { ar: 'الحارس', en: 'The Guardian' }
      },
      {
        enemyCount: 30,
        enemySpeed: 2.3,
        enemyHealth: 5,
        enemyTypes: [0, 1, 2, 3],
        bossLevel: false,
        spawnPattern: 'chaos',
        name: { ar: 'الفوضى العظمى', en: 'Grand Chaos' }
      }
    ];
  }

  return [];
}

function main() {
  const products = loadProducts();
  if (!products.length) { console.log('❌ no products'); return; }

  let updated = 0;
  for (const p of products) {
    if (p.status !== 'available') continue;
    // توليد المستويات الجديدة
    const newLevels = generateRichLevels(p.type);
    if (newLevels.length > 0) {
      p.levels = newLevels;
      updated++;
      console.log(`✅ Updated levels for: ${p.slug} (${p.type})`);
    }
  }

  if (updated > 0) {
    saveProducts(products);
    console.log(`\n🎯 Updated ${updated} products with rich levels.`);
  } else {
    console.log('ℹ️ No products needed level updates.');
  }
}

main();
