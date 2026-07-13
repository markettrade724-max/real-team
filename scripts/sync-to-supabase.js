/**
 * scripts/sync-to-supabase.js — v2.0
 *
 * Changes from v1.x:
 *  - REMOVED: PostgreSQL table upsert (table public.episodes never existed)
 *  - Architecture: videos are in Supabase Storage (bucket: episodes), not in a DB table
 *  - Now does exactly three things:
 *    1. Copies series.json + products.json to public/ (Vercel static serving)
 *    2. Uploads series.json + products.json to Supabase Storage as JSON (CDN backup)
 *    3. Verifies each episode videoUrl is reachable (HEAD request)
 *  - Never overwrites videoUrl — reads from series.json as source of truth
 *
 * rule-107 : REST API directement — pas @supabase/supabase-js
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath }  from 'url';
import { logger }         from '../logger.js';

const __dirname     = dirname(fileURLToPath(import.meta.url));
const ROOT          = join(__dirname, '..');
const SERIES_PATH   = join(ROOT, 'series.json');
const PRODUCTS_PATH = join(ROOT, 'products.json');
const PUBLIC_DIR    = join(ROOT, 'public');

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET        = 'episodes';

// ── Supabase Storage REST upload ──────────────────────────
async function uploadJsonToStorage(content, storagePath) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`;
  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      'x-upsert':      'true',
    },
    body:   content,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Storage upload failed (${res.status}): ${err}`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

// ── Verify video URL is reachable ─────────────────────────
async function verifyUrl(url) {
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────
export async function run() {
  logger.info('[SYNC] Starting sync v2.0');
  mkdirSync(PUBLIC_DIR, { recursive: true });

  // ── 1. Read source files ───────────────────────────────
  let series   = null;
  let products = null;

  if (existsSync(SERIES_PATH)) {
    try {
      series = JSON.parse(readFileSync(SERIES_PATH, 'utf8'));
      logger.info('[SYNC] series.json loaded', {
        episodes: series.episodes?.length ?? 0,
        next:     series.nextEpisode,
      });
    } catch (err) {
      logger.error('[SYNC] series.json parse error', { error: err.message });
    }
  } else {
    logger.warn('[SYNC] series.json not found — skipping episode sync');
  }

  if (existsSync(PRODUCTS_PATH)) {
    try {
      products = JSON.parse(readFileSync(PRODUCTS_PATH, 'utf8'));
      logger.info('[SYNC] products.json loaded', { count: products?.length ?? 0 });
    } catch (err) {
      logger.error('[SYNC] products.json parse error', { error: err.message });
    }
  }

  // ── 2. Copy to public/ (Vercel static serving) ─────────
  if (series) {
    const dest = join(PUBLIC_DIR, 'series.json');
    writeFileSync(dest, JSON.stringify(series, null, 2), 'utf8');
    logger.info('[SYNC] series.json → public/series.json');
  }
  if (products) {
    const dest = join(PUBLIC_DIR, 'products.json');
    writeFileSync(dest, JSON.stringify(products, null, 2), 'utf8');
    logger.info('[SYNC] products.json → public/products.json');
  }

  // ── 3. Upload JSON to Supabase Storage (CDN backup) ────
  if (SUPABASE_URL && SUPABASE_KEY) {
    if (series) {
      try {
        const url = await uploadJsonToStorage(
          JSON.stringify(series, null, 2), 'meta/series.json'
        );
        logger.info('[SYNC] series.json uploaded to Storage', { url });
      } catch (err) {
        logger.warn('[SYNC] series.json Storage upload failed', { error: err.message });
      }
    }
    if (products) {
      try {
        const url = await uploadJsonToStorage(
          JSON.stringify(products, null, 2), 'meta/products.json'
        );
        logger.info('[SYNC] products.json uploaded to Storage', { url });
      } catch (err) {
        logger.warn('[SYNC] products.json Storage upload failed', { error: err.message });
      }
    }
  } else {
    logger.warn('[SYNC] Supabase credentials missing — Storage upload skipped');
  }

  // ── 4. Verify episode video URLs ───────────────────────
  const episodes = series?.episodes || [];
  let verified = 0, missing = 0, unreachable = 0;

  logger.info('[SYNC] Verifying episode video URLs...', { total: episodes.length });

  for (const ep of episodes) {
    if (!ep.videoUrl) {
      missing++;
      logger.warn(`[SYNC] Episode ${ep.number}: no videoUrl`);
      continue;
    }
    const ok = await verifyUrl(ep.videoUrl);
    if (ok) {
      verified++;
      logger.info(`[SYNC] Episode ${ep.number}: OK`, { url: ep.videoUrl });
    } else {
      unreachable++;
      logger.warn(`[SYNC] Episode ${ep.number}: URL unreachable`, { url: ep.videoUrl });
    }
  }

  const summary = { verified, missing, unreachable, total: episodes.length };
  logger.info('[OK] Sync complete', summary);
  return summary;
}

// Allow direct execution
if (process.argv[1].includes('sync-to-supabase')) {
  run().catch(err => {
    logger.error('[SYNC] Fatal error', { error: err.message });
    process.exit(1);
  });
}
