/**
 * scripts/qa-bot.js — v1.0
 *
 * اختبارات QA تلقائية بعد كل deploy على Vercel.
 *
 * الاختبارات:
 *  1. الصفحة الرئيسية (HTTP 200)
 *  2. products.json (JSON صالح + حقول إلزامية)
 *  3. كل لعبة في products.json (index.html موجود)
 *  4. godot-wrapper.html (template موجود)
 *  5. وقت استجابة الصفحة الرئيسية (< 3 ثوانٍ)
 *
 * يحفظ: qa-results.json
 * يفشل بـ exit(1) إذا وجد أخطاء حرجة
 */

import { writeFileSync } from 'fs';

const BASE_URL = process.env.SITE_URL || 'https://real-team.vercel.app';
const TIMEOUT  = 10000; // 10 ثوانٍ لكل طلب

// ══════════════════════════════════════════════════════════
// أداة fetch مع timeout
// ══════════════════════════════════════════════════════════

async function fetchWithTimeout(url, timeoutMs = TIMEOUT) {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ══════════════════════════════════════════════════════════
// الاختبارات
// ══════════════════════════════════════════════════════════

async function testHomepage(results) {
  const test = { name: 'homepage', url: BASE_URL, critical: true };
  try {
    const t0  = Date.now();
    const res = await fetchWithTimeout(BASE_URL);
    const ms  = Date.now() - t0;

    test.status   = res.status;
    test.duration = ms;
    test.passed   = res.status === 200;
    test.slow     = ms > 3000;

    if (!test.passed) test.error = `HTTP ${res.status}`;
    if (test.slow)    test.warning = `Slow response: ${ms}ms`;

    console.log(`[${test.passed ? 'OK' : 'FAIL'}] Homepage — HTTP ${res.status} (${ms}ms)`);
  } catch (err) {
    test.passed = false;
    test.error  = err.message;
    console.log(`[FAIL] Homepage — ${err.message}`);
  }
  results.push(test);
}

async function testProductsJSON(results) {
  const url  = `${BASE_URL}/products.json`;
  const test = { name: 'products.json', url, critical: true };
  try {
    const res  = await fetchWithTimeout(url);
    test.status = res.status;

    if (res.status !== 200) {
      test.passed = false;
      test.error  = `HTTP ${res.status}`;
      console.log(`[FAIL] products.json — HTTP ${res.status}`);
      results.push(test);
      return [];
    }

    const products = await res.json();

    if (!Array.isArray(products)) {
      test.passed = false;
      test.error  = 'Not an array';
      console.log('[FAIL] products.json — not an array');
      results.push(test);
      return [];
    }

    // تحقق من الحقول الإلزامية
    const missingFields = [];
    for (const p of products) {
      const required = ['id', 'name', 'type', 'status'];
      for (const f of required) {
        if (!p[f]) missingFields.push(`${p.id || '?'}.${f}`);
      }
    }

    test.passed   = missingFields.length === 0;
    test.count    = products.length;
    test.missing  = missingFields;

    if (!test.passed) {
      test.error = `Missing fields: ${missingFields.join(', ')}`;
      console.log(`[FAIL] products.json — ${test.error}`);
    } else {
      console.log(`[OK] products.json — ${products.length} products`);
    }

    results.push(test);
    return products;

  } catch (err) {
    test.passed = false;
    test.error  = err.message;
    console.log(`[FAIL] products.json — ${err.message}`);
    results.push(test);
    return [];
  }
}

async function testStaticFiles(results) {
  const files = [
    { path: '/products.json',              name: 'static:products.json',      critical: true  },
    { path: '/templates/godot-wrapper.html', name: 'static:godot-wrapper.html', critical: false },
  ];

  for (const f of files) {
    const url  = `${BASE_URL}${f.path}`;
    const test = { name: f.name, url, critical: f.critical };
    try {
      const res   = await fetchWithTimeout(url);
      test.status = res.status;
      test.passed = res.status === 200;
      if (!test.passed) test.error = `HTTP ${res.status}`;
      console.log(`[${test.passed ? 'OK' : 'WARN'}] ${f.name} — HTTP ${res.status}`);
    } catch (err) {
      test.passed = false;
      test.error  = err.message;
      console.log(`[WARN] ${f.name} — ${err.message}`);
    }
    results.push(test);
  }
}

async function testGamePages(products, results) {
  // اختبر أول 5 ألعاب فقط — لا نستهلك وقتاً كثيراً
  const godotGames = products
    .filter(p => p.type === 'godot' && p.status === 'available')
    .slice(0, 5);

  for (const game of godotGames) {
    // يستخدم godotSlug إذا وجد — وإلا id
    const slug = game.godotSlug || game.slug || game.id;
    const url  = `${BASE_URL}/games/godot/${slug}/index.html`;
    const test = { name: `game:${game.id}`, url, critical: false };

    try {
      const res   = await fetchWithTimeout(url);
      test.status = res.status;
      test.passed = res.status === 200;

      if (!test.passed) test.error = `HTTP ${res.status}`;

      console.log(`[${test.passed ? 'OK' : 'WARN'}] Game ${game.id} — HTTP ${res.status}`);
    } catch (err) {
      test.passed = false;
      test.error  = err.message;
      console.log(`[WARN] Game ${game.id} — ${err.message}`);
    }

    results.push(test);
  }
}

async function testTemplate(results) {
  const url  = `${BASE_URL}/templates/godot-wrapper.html`;
  const test = { name: 'godot-wrapper.html', url, critical: false };

  try {
    const res   = await fetchWithTimeout(url);
    test.status = res.status;
    test.passed = res.status === 200;

    if (!test.passed) test.error = `HTTP ${res.status}`;
    console.log(`[${test.passed ? 'OK' : 'WARN'}] godot-wrapper.html — HTTP ${res.status}`);
  } catch (err) {
    test.passed = false;
    test.error  = err.message;
    console.log(`[WARN] godot-wrapper.html — ${err.message}`);
  }

  results.push(test);
}

// ══════════════════════════════════════════════════════════
// نقطة الدخول
// ══════════════════════════════════════════════════════════

async function main() {
  console.log(`[INFO] QA Bot v1.0 — ${BASE_URL}`);
  console.log(`[INFO] Started at ${new Date().toISOString()}`);

  const results = [];

  // الاختبارات بالترتيب
  await testHomepage(results);
  const products = await testProductsJSON(results);
  await testStaticFiles(results);
  await testGamePages(products, results);

  // ── تجميع النتائج ──────────────────────────────────
  const critical = results.filter(r => r.critical);
  const passed   = results.filter(r => r.passed).length;
  const failed   = results.filter(r => !r.passed).length;
  const critFail = critical.filter(r => !r.passed).length;

  const summary = {
    url:       BASE_URL,
    timestamp: new Date().toISOString(),
    total:     results.length,
    passed,
    failed,
    criticalFailed: critFail,
    success:   critFail === 0,
    results,
  };

  writeFileSync('qa-results.json', JSON.stringify(summary, null, 2), 'utf8');

  console.log('');
  console.log(`[SUMMARY] ${passed}/${results.length} passed — ${critFail} critical failures`);

  // يفشل فقط عند أخطاء حرجة
  if (critFail > 0) {
    console.log('[FAIL] Critical tests failed — see qa-results.json');
    process.exit(1);
  }

  console.log('[OK] All critical tests passed');
  process.exit(0);
}

main().catch(err => {
  console.error('[CRASH] QA Bot failed:', err.message);
  process.exit(1);
});
