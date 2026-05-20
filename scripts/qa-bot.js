/**
 * qa-bot.js — يفحص جميع الألعاب والتطبيقات المنشورة على Vercel
 */
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_URL = process.env.SITE_URL || 'https://real-team.vercel.app';
const LANGS = ['ar', 'en', 'fr', 'es', 'de', 'zh'];

const results = {
  pass: [],
  fail: [],
  total: 0,
  checkedAt: new Date().toISOString()
};

async function checkPage(path, label) {
  const url = `${SITE_URL}/${path}`.replace(/([^:])\/\//, '$1/');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const unreplaced = html.match(/\{\{[A-Z_]+\}\}/g);
    if (unreplaced) {
      throw new Error(
        'Unreplaced placeholders: ' + [...new Set(unreplaced)].join(', ')
      );
    }

    if (!html.includes('<!DOCTYPE html>')) throw new Error('Missing DOCTYPE');
    if (label.includes('[ar]') && !html.includes('dir="rtl"')) {
      console.log(`[WARN] ${label}: Missing RTL dir for Arabic page`);
    }

    results.pass.push(label);
    console.log(`[OK] ${label}`);
  } catch (err) {
    results.fail.push({ label, error: err.message });
    console.log(`[FAIL] ${label}: ${err.message}`);
  }
  results.total++;
}

async function run() {
  console.log(`[INFO] QA Bot scanning: ${SITE_URL}\n`);

  const productsPath = join(__dirname, '..', 'products.json');
  if (!existsSync(productsPath)) {
    console.warn('[WARN] products.json not found — skipping product tests');
  } else {
    const products = JSON.parse(readFileSync(productsPath, 'utf8'));
    const available = products.filter(
      p => p.status === 'available' || p.status === 'coming_soon'
    );

    if (available.length === 0) {
      console.log('[INFO] No available products to test.');
    }

    for (const product of available) {
      const slug = product.slug;
      console.log(`[INFO] Checking product: ${product.name?.en || slug}`);

      for (const lang of LANGS) {
        const filename =
          lang === 'ar' ? `${slug}.html` : `${slug}-${lang}.html`;
        await checkPage(`games/${filename}`, `${slug} [${lang}]`);
      }
    }
  }

  // فحص الصفحة الرئيسية
  console.log(`\n[INFO] Checking homepage`);
  await checkPage('', 'Homepage');

  // حفظ التقرير
  writeFileSync(
    join(__dirname, '..', 'qa-results.json'),
    JSON.stringify(results, null, 2)
  );

  console.log(`\n========================================`);
  console.log(`[OK] Passed: ${results.pass.length}`);
  console.log(`[FAIL] Failed: ${results.fail.length}`);
  console.log(`[INFO] Total:  ${results.total}`);
  console.log(`========================================`);

  if (results.fail.length > 0) {
    console.log('\n[ERROR] Failures:');
    results.fail.forEach(f =>
      console.log(`   - ${f.label}: ${f.error}`)
    );
    process.exit(1);
  }
}

run().catch(err => {
  console.error('[FATAL] QA Bot crashed:', err);
  process.exit(1);
});
