/**
 * qa-bot.js — يفحص جميع الألعاب والتطبيقات المنشورة
 * يتحقق من: وجود الملفات، عدم وجود {{...}}، استجابة الصفحات
 */
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_URL = process.env.SITE_URL || 'https://real-team-production.up.railway.app';
const LANGS = ['ar','en','fr','es','de','zh'];

const results = { pass:[], fail:[], total:0, checkedAt: new Date().toISOString() };

async function checkPage(path, label) {
  try {
    const res = await fetch(`${SITE_URL}/${path}`, { redirect:'follow', timeout:10000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    
    // فحص عدم وجود متغيرات غير مستبدلة
    const unreplaced = html.match(/\{\{[A-Z_]+\}\}/g);
    if (unreplaced) {
      throw new Error(`Unreplaced placeholders: ${[...new Set(unreplaced)].join(', ')}`);
    }
    
    // فحص أساسي لوجود عناصر HTML
    if (!html.includes('<!DOCTYPE html>')) throw new Error('Missing DOCTYPE');
    
    results.pass.push(label);
    console.log(`  ✅ ${label}`);
  } catch (err) {
    results.fail.push({ label, error: err.message });
    console.log(`  ❌ ${label}: ${err.message}`);
  }
  results.total++;
}

async function run() {
  console.log(`🔍 QA Bot scanning: ${SITE_URL}\n`);

  const productsPath = join(__dirname, '..', 'products.json');
  if (!existsSync(productsPath)) {
    console.warn('⚠️  products.json not found — generating list from public/games');
  }

  const products = JSON.parse(readFileSync(productsPath, 'utf8') || '[]');
  const available = products.filter(p => p.status === 'available' || p.status === 'coming_soon');

  if (available.length === 0) {
    console.log('ℹ️  No available products to test.');
  }

  for (const product of available) {
    const slug = product.slug;
    console.log(`📦 ${product.name?.en || slug}`);
    
    for (const lang of LANGS) {
      const filename = lang === 'ar' ? `${slug}.html` : `${slug}-${lang}.html`;
      await checkPage(`games/${filename}`, `${slug} [${lang}]`);
    }
  }

  // فحص الصفحة الرئيسية
  console.log(`\n🏠 Homepage`);
  await checkPage('', 'Homepage');

  // حفظ النتائج
  writeFileSync(join(__dirname, '..', 'qa-results.json'), JSON.stringify(results, null, 2));
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Passed: ${results.pass.length}`);
  console.log(`❌ Failed: ${results.fail.length}`);
  console.log(`📊 Total:  ${results.total}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  if (results.fail.length > 0) {
    console.log('\n❌ Failures:');
    results.fail.forEach(f => console.log(`   - ${f.label}: ${f.error}`));
    process.exit(1);
  }
}

run().catch(err => {
  console.error('QA Bot crashed:', err);
  process.exit(1);
});
