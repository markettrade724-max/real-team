/**
 * art-library-agent.js — v1.4
 *
 * Changes from v1.3:
 *  - Characters: drawn via procedural-drawer.js (zero API, deterministic)
 *  - Locations + enemies: Pollinations.AI (existing behavior, with delay)
 *  - generateForCharacter() replaces generateWithRetry for char_* cacheKeys
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname }                                        from 'path';
import { fileURLToPath }                                        from 'url';
import { logger }                                               from '../logger.js';
import { drawCharacter }                                        from './procedural-drawer.js';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR  = join(__dirname, '..', 'assets', 'art-cache');
const BIBLE_PATH = join(__dirname, '..', 'assets', 'art-bible.json');

const DELAY_BETWEEN_POLLINATIONS = 4000;  // Pollinations free tier rate limit
const RETRY_DELAY                = 15000;

// ── Art-bible loader ──────────────────────────────────────
let _bible = null;

export function loadArtBible() {
  if (_bible) return _bible;
  if (!existsSync(BIBLE_PATH)) {
    logger.warn('[ART] No art-bible.json found');
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

// ── Pollinations (backgrounds + enemies) ─────────────────
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

  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}` +
    `?width=${opts.width || 1920}&height=${opts.height || 1080}` +
    `&seed=${seed || 42}&model=flux`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 5000) throw new Error('Response too small');
    writeFileSync(outPath, buf);
    logger.info(`[ART] Generated via Pollinations: ${cacheKey}`, { seed });
    return outPath;
  } catch (err) {
    logger.warn(`[ART] Pollinations failed: ${cacheKey}`, { error: err.message });
    return null;
  }
}

async function generateWithRetry(prompt, seed, cacheKey, opts = {}) {
  const r1 = await generateDrawnImage(prompt, seed, cacheKey, opts);
  if (r1) return r1;
  logger.info(`[ART] Retrying in ${RETRY_DELAY / 1000}s: ${cacheKey}`);
  await new Promise(r => setTimeout(r, RETRY_DELAY));
  return generateDrawnImage(prompt, seed, cacheKey, opts);
}

// ── Procedural character (zero API) ─────────────────────
async function generateForCharacter(charId, poseId, seed, cacheKey) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

  const outPath = join(CACHE_DIR, `${cacheKey}.png`);
  if (existsSync(outPath)) {
    logger.info(`[ART] Cache hit (procedural): ${cacheKey}`);
    return outPath;
  }

  return drawCharacter(charId, poseId, seed, outPath);
}

// ── Pre-generation run ────────────────────────────────────
export async function run() {
  const bible = loadArtBible();
  if (!bible) return { generated: 0, skipped: 0, total: 0 };

  const charTotal = Object.values(bible.characters || {})
    .reduce((s, c) => s + Object.keys(c.poses || {}).length, 0);
  const locTotal  = Object.keys(bible.locations || {}).length;
  const envTotal  = Object.keys(bible.enemies   || {}).length;
  const total     = charTotal + locTotal + envTotal;

  logger.info('[ART] Starting pre-generation', {
    total,
    characters: `${charTotal} (procedural — instant)`,
    locations:  `${locTotal} (Pollinations — 4s delay)`,
    enemies:    `${envTotal} (Pollinations — 4s delay)`,
  });

  let generated = 0;
  let skipped   = 0;
  let idx       = 0;

  // ── Characters — procedural drawer ────────────────────
  for (const [charId, char] of Object.entries(bible.characters || {})) {
    for (const [poseId] of Object.entries(char.poses || {})) {
      idx++;
      const cacheKey = `char_${charId}_${poseId}`;
      const seed     = char.seed + poseId.length;
      logger.info(`[ART] ${idx}/${total}: ${cacheKey} (procedural)`);
      const r = await generateForCharacter(charId, poseId, seed, cacheKey);
      r ? generated++ : skipped++;
      // No delay needed — zero API calls
    }
  }

  // ── Locations — Pollinations ──────────────────────────
  for (const [locId, loc] of Object.entries(bible.locations || {})) {
    idx++;
    const cacheKey = `loc_${locId}`;
    logger.info(`[ART] ${idx}/${total}: ${cacheKey} (Pollinations)`);
    const r = await generateWithRetry(loc.prompt, loc.seed, cacheKey);
    r ? generated++ : skipped++;
    if (idx < total) await new Promise(r => setTimeout(r, DELAY_BETWEEN_POLLINATIONS));
  }

  // ── Enemies — Pollinations ───────────────────────────
  for (const [enemyId, enemy] of Object.entries(bible.enemies || {})) {
    idx++;
    const cacheKey = `enemy_${enemyId}`;
    const prompt   = enemy.prompt || `${enemy.visualDescription}, flat 2D cartoon style`;
    logger.info(`[ART] ${idx}/${total}: ${cacheKey} (Pollinations)`);
    const r = await generateWithRetry(prompt, enemy.seed, cacheKey, {
      width: 512, height: 512,
    });
    r ? generated++ : skipped++;
    if (idx < total) await new Promise(r => setTimeout(r, DELAY_BETWEEN_POLLINATIONS));
  }

  logger.info('[OK] Art pre-generation done', { generated, skipped, total });
  return { generated, skipped, total };
}
