/**
 * qa-bot.js
 * يختبر الموقع تلقائياً ويتحقق من سلامة كل شيء
 */

const SITE_URL = process.env.SITE_URL || 'https://real-team-production.up.railway.app';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ ${name}: ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log(`🔍 Testing: ${SITE_URL}\n`);

  // ── اختبار /health ────────────────────────────────────────
  await test('/health returns ok', async () => {
    const res  = await fetch(`${SITE_URL}/health`);
    const data = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (data.status !== 'ok') throw new Error(`status: ${data.status}`);
    if (data.database !== 'connected') throw new Error(`DB: ${data.database}`);
  });

  // ── اختبار index.html ─────────────────────────────────────
  await test('index.html loads', async () => {
    const res = await fetch(`${SITE_URL}/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (!html.includes('realteam')) throw new Error('Missing realteam content');
  });

  // ── اختبار products.json ──────────────────────────────────
  await test('products.json is valid', async () => {
    const res  = await fetch(`${SITE_URL}/products.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Not an array');
    if (data.length === 0) throw new Error('Empty products');
    console.log(`   → ${data.length} products found`);
  });

  // ── اختبار الألعاب المولّدة ───────────────────────────────
  await test('games are accessible', async () => {
    const res      = await fetch(`${SITE_URL}/products.json`);
    const products = await res.json();
    const available = products.filter(p => p.status === 'available');

    for (const game of available) {
      const gameRes = await fetch(`${SITE_URL}/games/${game.slug}.html`);
      if (!gameRes.ok) throw new Error(`${game.slug}: HTTP ${gameRes.status}`);
      console.log(`   → ${game.slug} ✓`);
    }
  });

  // ── اختبار iap-modal.js ───────────────────────────────────
  await test('iap-modal.js loads', async () => {
    const res = await fetch(`${SITE_URL}/iap-modal.js`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });

  // ── النتيجة ───────────────────────────────────────────────
  console.log(`\n── Results ──────────────────`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);

  if (failed > 0) {
    console.error('\n⚠️ QA FAILED');
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed!');
  }
}

main();
