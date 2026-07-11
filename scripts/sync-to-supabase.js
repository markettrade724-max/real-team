/**
 * sync-to-supabase.js — v1.2
 *
 * Reads universe.json and products.json and uploads them to Supabase.
 * Runs once for initial sync — agents write directly afterward.
 *
 * Changes from v1.1:
 *  - Fixed: run() loaded 'episodes.json', a file that never existed
 *    anywhere in the pipeline — orchestrator.js always writes episode
 *    data to series.json (SERIES_PATH, updateSeries(), rule-109).
 *    loadJSON() returns null silently on a missing file, so
 *    syncEpisodes() was skipped on every single run with zero log
 *    output — the run still ended on "[OK] Supabase sync complete",
 *    masking the fact that episode/video sync never actually ran.
 *  - loadJSON() now takes an optional label and logs [INFO] when a
 *    file is intentionally absent, so a wrong/missing filename shows
 *    up in the run log immediately instead of failing silently like
 *    this one did.
 *
 * Changes from v1.0 (untracked):
 *  - Migrated off @supabase/supabase-js (removed from package.json — err-232)
 *    to direct REST API (PostgREST) calls via fetch, per rule-107.
 *  - Exported run() — orchestrator's mode:sync calls m.run(), which this
 *    file never provided. main() also auto-ran at import time via a bare
 *    process-level call, and process.exit(1) on failure would have killed
 *    the whole orchestrator process, not just this task.
 *  - Fixed: syncWeapons()/syncEnemies() sent 'desc' as a column name
 *    directly — same reserved-word issue as err-128 (rule-108). Renamed
 *    to 'description', matching syncWorlds()/syncProducts().
 *  - Comments translated to English (rule-224).
 */
import { readFileSync, existsSync }     from 'fs';
import { join, dirname, basename }      from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const REST_URL    = `${process.env.SUPABASE_URL}/rest/v1`;
const STORAGE_URL = `${process.env.SUPABASE_URL}/storage/v1`;
const EP_BUCKET   = 'episodes';

function loadJSON(path, label = null) {
  if (!existsSync(path)) {
    if (label) console.log(`[INFO] ${label} not found — skipping (${path})`);
    return null;
  }
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { console.error(`[ERROR] Cannot read ${path}:`, e.message); return null; }
}

// ── REST upsert helper (replaces supabase.from(table).upsert(row)) ──
async function upsertRow(table, row) {
  try {
    const res = await fetch(`${REST_URL}/${table}?on_conflict=id`, {
      method: 'POST',
      headers: {
        'apikey':        process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'resolution=merge-duplicates,return=minimal',
      },
      body:   JSON.stringify(row),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { error: { message: `HTTP ${res.status}: ${text.slice(0, 200)}` } };
    }
    return { error: null };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

// ── Upload universe ───────────────────────
async function syncUniverse(universe) {
  console.log(`[INFO] Syncing universe: ${universe.id}`);
  const { error } = await upsertRow('universes', {
    id:            universe.id,
    name:          universe.name,
    soul:          universe.soul,
    art:           universe.art,
    born_at:       universe.born,
    evolutions:    universe.evolutions   || 0,
    inventions:    universe.inventions   || 0,
    last_evolved:  universe.lastEvolved  || null,
    last_invented: universe.lastInvented || null,
  });
  if (error) { console.error('[ERROR] Universe sync failed:', error.message); return false; }
  console.log('[OK] Universe synced');
  return true;
}

// ── Upload worlds ──────────────────────────
async function syncWorlds(universe) {
  if (!universe.worlds?.length) return;
  console.log(`[INFO] Syncing ${universe.worlds.length} worlds...`);
  for (const world of universe.worlds) {
    const id = world.id || world.name?.en?.replace(/\s/g, '-').toLowerCase();
    const { error } = await upsertRow('worlds', {
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

// ── Upload weapons ─────────────────────────
async function syncWeapons(universe) {
  if (!universe.weapons?.length) return;
  console.log(`[INFO] Syncing ${universe.weapons.length} weapons...`);
  for (const weapon of universe.weapons) {
    const { error } = await upsertRow('weapons', {
      id:          weapon.id,
      universe_id: universe.id,
      name:        weapon.name,
      description: weapon.desc,
      damage:      weapon.damage    || 10,
      fire_rate:   weapon.fireRate  || 1,
      stats:       weapon.stats     || null,
    });
    if (error) console.error(`[ERROR] Weapon ${weapon.id} failed:`, error.message);
    else       console.log(`[OK] Weapon synced: ${weapon.name?.en}`);
  }
}

// ── Upload enemies ─────────────────────────
async function syncEnemies(universe) {
  if (!universe.enemies?.length) return;
  console.log(`[INFO] Syncing ${universe.enemies.length} enemies...`);
  for (const enemy of universe.enemies) {
    const { error } = await upsertRow('enemies', {
      id:          enemy.id,
      universe_id: universe.id,
      name:        enemy.name,
      description: enemy.desc,
      health:      enemy.health || 100,
      speed:       enemy.speed  || 1,
      stats:       enemy.stats  || null,
    });
    if (error) console.error(`[ERROR] Enemy ${enemy.id} failed:`, error.message);
    else       console.log(`[OK] Enemy synced: ${enemy.name?.en}`);
  }
}

function publicStorageUrl(storagePath) {
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${EP_BUCKET}/${storagePath}`;
}

function episodeStoragePath(number, filename) {
  return `ep${number}/${filename}`;
}

// ── Upload video to Supabase Storage (if local file exists) ──
async function uploadVideo(localPath, storagePath) {
  if (!existsSync(localPath)) return { url: null, error: null };
  try {
    const res = await fetch(`${STORAGE_URL}/object/${EP_BUCKET}/${storagePath}`, {
      method:  'POST',
      headers: {
        'apikey':        process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type':  'video/mp4',
        'x-upsert':      'true',
      },
      body:   readFileSync(localPath),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { url: null, error: { message: `Storage HTTP ${res.status}: ${text.slice(0, 200)}` } };
    }
    return { url: publicStorageUrl(storagePath), error: null };
  } catch (err) {
    return { url: null, error: { message: err.message } };
  }
}

// ── Upload episodes ────────────────────────
async function syncEpisodes(manifest) {
  if (!manifest?.episodes?.length) return;
  console.log(`[INFO] Syncing ${manifest.episodes.length} episodes...`);

  for (const ep of manifest.episodes) {
    let videoUrl   = ep.videoUrl   || null;
    let trailerUrl = ep.trailerUrl || null;

    if (ep.file) {
      const videoStorage = episodeStoragePath(ep.number, basename(ep.file));
      const { url, error } = await uploadVideo(ep.file, videoStorage);
      if (error) console.error(`[ERROR] Episode ${ep.number} video upload failed:`, error.message);
      else if (url) videoUrl = url;

      const trailerFile = join(dirname(ep.file), `trailer-${ep.number}.mp4`);
      const trailerStorage = episodeStoragePath(ep.number, `trailer-${ep.number}.mp4`);
      const trailer = await uploadVideo(trailerFile, trailerStorage);
      if (trailer.error) console.error(`[ERROR] Episode ${ep.number} trailer upload failed:`, trailer.error.message);
      else if (trailer.url) trailerUrl = trailer.url;
    }

    const { error } = await upsertRow('episodes', {
      id:           `${manifest.universeId}-ep${ep.number}`,
      universe_id:  manifest.universeId,
      number:       ep.number,
      title:        ep.title,
      logline:      ep.logline      || null,
      theme:        ep.theme        || null,
      cliffhanger:  ep.cliffhanger  || null,
      duration:     ep.duration     || null,
      video_url:    videoUrl,
      trailer_url:  trailerUrl,
      produced_at:  ep.producedAt   || null,
      file_path:    ep.file         || null,
    });
    if (error) console.error(`[ERROR] Episode ${ep.number} failed:`, error.message);
    else       console.log(`[OK] Episode synced: ${ep.number} — ${ep.title}`);
  }
}

// ── Upload products ────────────────────────
async function syncProducts(products, universeId) {
  if (!products?.length) return;
  console.log(`[INFO] Syncing ${products.length} products...`);
  for (const p of products) {
    const { error } = await upsertRow('products', {
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
// Entry point — exported for orchestrator's m.run()
// ════════════════════════════════════════════
export async function run() {
  console.log('[INFO] Starting Supabase sync...');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
  }

  const universe = loadJSON(join(ROOT, 'universe.json'), 'universe.json');
  const products = loadJSON(join(ROOT, 'products.json'), 'products.json');
  const episodes = loadJSON(join(ROOT, 'series.json'),   'series.json'); // FIX: was 'episodes.json' (never existed)

  if (!universe) {
    throw new Error('universe.json not found — run BIRTH MODE first');
  }

  const ok = await syncUniverse(universe);
  if (!ok) throw new Error('Universe sync failed');

  await syncWorlds(universe);
  await syncWeapons(universe);
  await syncEnemies(universe);
  if (products) await syncProducts(products, universe.id);
  if (episodes) await syncEpisodes(episodes);

  console.log('\n[OK] Supabase sync complete');
  return { synced: true };
}

// Allow standalone execution: `node scripts/sync-to-supabase.js`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(e => {
    console.error('[FATAL]', e.message);
    process.exit(1);
  });
}
