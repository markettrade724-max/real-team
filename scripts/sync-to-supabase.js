/**
 * sync-to-supabase.js
 * يقرأ universe.json و products.json ويرفعهم إلى Supabase
 * يُشغَّل مرة واحدة للمزامنة الأولى — ثم الـ agents يكتبون مباشرة
 */
import { createClient }                    from '@supabase/supabase-js';
import { readFileSync, existsSync }        from 'fs';
import { join, dirname }                   from 'path';
import { fileURLToPath }                   from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function loadJSON(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { console.error(`[ERROR] Cannot read ${path}:`, e.message); return null; }
}

// ── رفع الكون ─────────────────────────────
async function syncUniverse(universe) {
  console.log(`[INFO] Syncing universe: ${universe.id}`);

  const { error } = await supabase.from('universes').upsert({
    id:           universe.id,
    name:         universe.name,
    soul:         universe.soul,
    art:          universe.art,
    born_at:      universe.born,
    evolutions:   universe.evolutions   || 0,
    inventions:   universe.inventions   || 0,
    last_evolved: universe.lastEvolved  || null,
    last_invented: universe.lastInvented || null,
  });

  if (error) { console.error('[ERROR] Universe sync failed:', error.message); return false; }
  console.log('[OK] Universe synced');
  return true;
}

// ── رفع العوالم ───────────────────────────
async function syncWorlds(universe) {
  if (!universe.worlds?.length) return;
  console.log(`[INFO] Syncing ${universe.worlds.length} worlds...`);

  for (const world of universe.worlds) {
    const id = world.id || world.name?.en?.replace(/\s/g, '-').toLowerCase();
    const { error } = await supabase.from('worlds').upsert({
      id,
      universe_id: universe.id,
      name:        world.name,
      description: world.desc,
      difficulty:  world.difficulty || 'medium',
      chapter:     world.chapter    || 1,
      noise:       world.noise      || null,
      shader:      world.shader     || null,
      audio:       world.audio      || null,
      order_index: universe.worlds.indexOf(world),
    });
    if (error) console.error(`[ERROR] World ${id} failed:`, error.message);
    else       console.log(`[OK] World synced: ${world.name?.en}`);
  }
}

// ── رفع الأسلحة ───────────────────────────
async function syncWeapons(universe) {
  if (!universe.weapons?.length) return;
  console.log(`[INFO] Syncing ${universe.weapons.length} weapons...`);

  for (const weapon of universe.weapons) {
    const { error } = await supabase.from('weapons').upsert({
      id:          weapon.id,
      universe_id: universe.id,
      name:        weapon.name,
      desc:        weapon.desc,
      damage:      weapon.damage    || 10,
      fire_rate:   weapon.fireRate  || 1,
      stats:       weapon.stats     || null,
    });
    if (error) console.error(`[ERROR] Weapon ${weapon.id} failed:`, error.message);
    else       console.log(`[OK] Weapon synced: ${weapon.name?.en}`);
  }
}

// ── رفع الأعداء ───────────────────────────
async function syncEnemies(universe) {
  if (!universe.enemies?.length) return;
  console.log(`[INFO] Syncing ${universe.enemies.length} enemies...`);

  for (const enemy of universe.enemies) {
    const { error } = await supabase.from('enemies').upsert({
      id:          enemy.id,
      universe_id: universe.id,
      name:        enemy.name,
      desc:        enemy.desc,
      health:      enemy.health || 100,
      speed:       enemy.speed  || 1,
      stats:       enemy.stats  || null,
    });
    if (error) console.error(`[ERROR] Enemy ${enemy.id} failed:`, error.message);
    else       console.log(`[OK] Enemy synced: ${enemy.name?.en}`);
  }
}

// ── رفع المنتجات ──────────────────────────
async function syncProducts(products, universeId) {
  if (!products?.length) return;
  console.log(`[INFO] Syncing ${products.length} products...`);

  for (const p of products) {
    const { error } = await supabase.from('products').upsert({
      id:            p.id,
      slug:          p.slug,
      universe_id:   universeId || null,
      type:          p.type,
      category:      p.category      || 'game',
      status:        p.status        || 'available',
      template_file: p.templateFile  || null,
      godot_slug:    p.godotSlug     || null,
      accent:        p.accent        || null,
      accent_rgb:    p.accentRgb     || null,
      gradient:      p.gradient      || null,
      name:          p.name,
      description:   p.desc,
      tags:          p.tags          || [],
      iap:           p.iap           || [],
      levels:        p.levels        || [],
      controls:      p.controls      || null,
      generated:     p.generated     || false,
      generated_at:  p.generatedAt   || new Date().toISOString(),
    });
    if (error) console.error(`[ERROR] Product ${p.id} failed:`, error.message);
    else       console.log(`[OK] Product synced: ${p.name?.en}`);
  }
}

// ════════════════════════════════════════════
// نقطة الدخول
// ════════════════════════════════════════════
async function main() {
  console.log('[INFO] Starting Supabase sync...');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[FATAL] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
    process.exit(1);
  }

  // قراءة الملفات المحلية
  const universe = loadJSON(join(ROOT, 'universe.json'));
  const products = loadJSON(join(ROOT, 'products.json'));

  if (!universe) {
    console.error('[FATAL] universe.json not found — run BIRTH MODE first');
    process.exit(1);
  }

  // رفع الكون وعناصره
  const ok = await syncUniverse(universe);
  if (!ok) { console.error('[FATAL] Universe sync failed'); process.exit(1); }

  await syncWorlds(universe);
  await syncWeapons(universe);
  await syncEnemies(universe);

  // رفع المنتجات
  if (products) await syncProducts(products, universe.id);

  console.log('\n[OK] Supabase sync complete');
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
