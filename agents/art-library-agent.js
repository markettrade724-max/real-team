/**
 * art-library-agent.js — v1.3
 *
 * Changes from v1.2:
 *  - Delay between requests: 500ms → 4000ms (Pollinations free tier rate limit)
 *  - generateWithRetry(): one automatic retry after 15s on failure
 *  - Progress logging per asset (not just summary at the end)
 *  - Endpoint confirmed: image.pollinations.ai/prompt/ (no auth, FLUX model)
 *
 * Changes from v1.1:
 *  - URL fixed: gen.pollinations.ai → image.pollinations.ai/prompt/ (err-226)
 *  - Removed nologo=true parameter (removed from Pollinations API 2026-06-10)
 *
 * Changes from v1.0:
 *  - readFileSync added to imports (err-225)
 *  - loadArtBible: require() replaced with readFileSync (ESM fix)
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname }                                        from 'path';
import { fileURLToPath }                                        from 'url';
import { logger }                                               from '../logger.js';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR  = join(__dirname, '..', 'assets', 'art-cache');
const BIBLE_PATH = join(__dirname, '..', 'assets', 'art-bible.json');

const DELAY_BETWEEN_REQUESTS = 4000;  // 4s — Pollinations free tier
const RETRY_DELAY             = 15000; // 15s before retry on failure

// ── Art-bible loader ──────────────────────────────────────
let _bible = null;

export function loadArtBible() {
  if (_bible) return _bible;
  if (!existsSync(BIBLE_PATH)) {
    logger.warn('[ART] No art-bible.json found — skipping pre-generation');
    return null;
  }
  try {
    _bible = JSON.parse(readFileSync(BIBLE_PATH, 'utf8'));
    logger.info('[ART] Art bible loaded', {
      characters: Object.keys(_bible.characters || {}).length,
      locations:  Object.keys(_bible.locations  || {}).length,
      enemies:    Object.keys(_bible.enemies    || {}).length,
    });
    return _bible;
  } catch (err) {
    logger.error('[ART] Failed to parse art-bible.json', { error: err.message });
    return null;
  }
}

// ── Core generation via Pollinations.AI ───────────────────
// Free endpoint — no API key, FLUX model, anonymous usage
// Rate limit: ~1 request / 3-5s on free tier
export async function generateDrawnImage(prompt, seed, cacheKey, opts = {}) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

  const outPath = join(CACHE_DIR, `${cacheKey}.png`);
  if (existsSync(outPath) && !opts.force) {
    logger.info(`[ART] Cache hit: ${cacheKey}`);
    return outPath;
  }

  const bible      = loadArtBible();
  const baseStyle  = bible?.artStyle
    || 'flat 2D cartoon illustration, bold black outlines, vibrant colors';
  const fullPrompt = `${prompt}, ${baseStyle}, no text, no watermark`;

  // Correct free endpoint (err-226 fix — gen.pollinations.ai requires auth)
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}` +
    `?width=${opts.width || 1920}&height=${opts.height || 1080}` +
    `&seed=${seed || 42}&model=flux`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 5000) throw new Error('Response too small — likely error page');
    writeFileSync(outPath, buf);
    logger.info(`[ART] Generated: ${cacheKey}`, { seed, bytes: buf.length });
    return outPath;
  } catch (err) {
    logger.warn(`[ART] Generation failed: ${cacheKey}`, { error: err.message });
    return null;
  }
}

// ── Generate with one automatic retry on failure ──────────
async function generateWithRetry(prompt, seed, cacheKey, opts = {}) {
  const result = await generateDrawnImage(prompt, seed, cacheKey, opts);
  if (result) return result;

  // One retry after RETRY_DELAY — covers transient 429 / timeout
  logger.info(`[ART] Retrying in ${RETRY_DELAY / 1000}s: ${cacheKey}`);
  await new Promise(r => setTimeout(r, RETRY_DELAY));

  const retry = await generateDrawnImage(prompt, seed, cacheKey, opts);
  if (retry) {
    logger.info(`[ART] Retry succeeded: ${cacheKey}`);
  } else {
    logger.warn(`[ART] Retry also failed — skipping: ${cacheKey}`);
  }
  return retry;
}

// ── Pre-generate all bible assets (artLibraryDay in orchestrator) ─
export async function run() {
  const bible = loadArtBible();
  if (!bible) return { generated: 0, skipped: 0, total: 0 };

  let generated = 0;
  let skipped   = 0;
  let total     = 0;

  // Count total assets upfront for progress logging
  const charTotal = Object.values(bible.characters || {})
    .reduce((s, c) => s + Object.keys(c.poses || {}).length, 0);
  const locTotal  = Object.keys(bible.locations || {}).length;
  const envTotal  = Object.keys(bible.enemies   || {}).length;
  total = charTotal + locTotal + envTotal;

  logger.info('[ART] Starting pre-generation', { total, delayPerRequest: `${DELAY_BETWEEN_REQUESTS / 1000}s` });

  let idx = 0;

  // ── Characters — all poses ─────────────────────────────
  for (const [charId, char] of Object.entries(bible.characters || {})) {
    for (const [poseId, pose] of Object.entries(char.poses || {})) {
      idx++;
      const cacheKey = `char_${charId}_${poseId}`;
      const prompt   = `${char.visualDescription}, ${pose.prompt}`;
      const seed     = char.seed + poseId.length;

      logger.info(`[ART] ${idx}/${total}: ${cacheKey}`);
      const result = await generateWithRetry(prompt, seed, cacheKey, {
        width: 1080, height: 1080,
      });
      result ? generated++ : skipped++;

      if (idx < total) await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS));
    }
  }

  // ── Locations — scene backgrounds ─────────────────────
  for (const [locId, loc] of Object.entries(bible.locations || {})) {
    idx++;
    const cacheKey = `loc_${locId}`;

    logger.info(`[ART] ${idx}/${total}: ${cacheKey}`);
    const result = await generateWithRetry(loc.prompt, loc.seed, cacheKey);
    result ? generated++ : skipped++;

    if (idx < total) await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS));
  }

  // ── Enemies ────────────────────────────────────────────
  for (const [enemyId, enemy] of Object.entries(bible.enemies || {})) {
    idx++;
    const cacheKey = `enemy_${enemyId}`;
    const prompt   = enemy.prompt || `${enemy.visualDescription}, flat 2D cartoon style`;

    logger.info(`[ART] ${idx}/${total}: ${cacheKey}`);
    const result = await generateWithRetry(prompt, enemy.seed, cacheKey, {
      width: 512, height: 512,
    });
    result ? generated++ : skipped++;

    if (idx < total) await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS));
  }

  logger.info('[OK] Art pre-generation done', {
    generated,
    skipped,
    total,
    estimatedTime: `${Math.round(total * DELAY_BETWEEN_REQUESTS / 60000)}min`,
  });

  return { generated, skipped, total };
}
