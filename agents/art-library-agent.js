/**
 * art-library-agent.js — v1.1
 *
 * Changes from v1.0:
 *  - readFileSync added to fs imports (was missing — caused loadArtBible() to fail)
 *  - loadArtBible(): replaced require('fs').readFileSync (invalid in ESM) with readFileSync
 *  - run() export added directly (was missing the named export used by orchestrator)
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname }                                        from 'path';
import { fileURLToPath }                                        from 'url';
import { logger }                                               from '../logger.js';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR  = join(__dirname, '..', 'assets', 'art-cache');
const BIBLE_PATH = join(__dirname, '..', 'assets', 'art-bible.json');

// ── Art-bible loader (in-memory cache for the session) ────
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

// ── Core image generation via Pollinations.AI ─────────────
// No API key — public endpoint, FLUX model, anonymous usage
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
    `https://gen.pollinations.ai/image/${encodeURIComponent(fullPrompt)}` +
    `?width=${opts.width || 1920}&height=${opts.height || 1080}` +
    `&seed=${seed || 42}&model=flux&nologo=true`;

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

// ── Pre-generate all bible assets (called from artLibraryDay) ──
export async function run() {
  const bible = loadArtBible();
  if (!bible) return { generated: 0, skipped: 0 };

  let generated = 0;
  let skipped   = 0;

  // Characters — all poses
  for (const [charId, char] of Object.entries(bible.characters || {})) {
    for (const [poseId, pose] of Object.entries(char.poses || {})) {
      const cacheKey = `char_${charId}_${poseId}`;
      const prompt   = `${char.visualDescription}, ${pose.prompt}`;
      const seed     = char.seed + poseId.length;
      const result   = await generateDrawnImage(prompt, seed, cacheKey, {
        width: 1080, height: 1080,
      });
      result ? generated++ : skipped++;
      await new Promise(r => setTimeout(r, 500)); // polite rate limiting
    }
  }

  // Locations — full-width scene backgrounds
  for (const [locId, loc] of Object.entries(bible.locations || {})) {
    const cacheKey = `loc_${locId}`;
    const result   = await generateDrawnImage(loc.prompt, loc.seed, cacheKey);
    result ? generated++ : skipped++;
    await new Promise(r => setTimeout(r, 500));
  }

  // Enemies
  for (const [enemyId, enemy] of Object.entries(bible.enemies || {})) {
    const cacheKey = `enemy_${enemyId}`;
    const result   = await generateDrawnImage(
      enemy.prompt || `${enemy.visualDescription}, flat 2D cartoon style`,
      enemy.seed,
      cacheKey,
      { width: 512, height: 512 }
    );
    result ? generated++ : skipped++;
    await new Promise(r => setTimeout(r, 500));
  }

  logger.info('[OK] Art pre-generation done', { generated, skipped });
  return { generated, skipped };
}
