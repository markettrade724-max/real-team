/**
 * art-library-agent.js — v1.0
 * Generates drawn illustrations via Pollinations.AI (no API key, no signup)
 * Used by: visual-agent.js (per-episode), orchestrator.js artLibraryDay() (pre-generation)
 *
 * Cache: assets/art-cache/{cacheKey}.png — never regenerates if file exists
 * Fallback: returns null — callers fall back to Lexica/Unsplash/Picsum chain
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname }                         from 'path';
import { fileURLToPath }                         from 'url';
import { logger }                                from '../logger.js';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR  = join(__dirname, '..', 'assets', 'art-cache');
const BIBLE_PATH = join(__dirname, '..', 'assets', 'art-bible.json');

// ── Load art-bible (cached in memory for the session) ─────
let _bible = null;
export function loadArtBible() {
  if (_bible) return _bible;
  if (!existsSync(BIBLE_PATH)) return null;
  try { _bible = JSON.parse(require('fs').readFileSync(BIBLE_PATH, 'utf8')); return _bible; }
  catch { return null; }
}

// ── Core image generation via Pollinations.AI ─────────────
export async function generateDrawnImage(prompt, seed, cacheKey, opts = {}) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

  const outPath = join(CACHE_DIR, `${cacheKey}.png`);
  if (existsSync(outPath) && !opts.force) {
    logger.info(`[ART] Cache hit: ${cacheKey}`);
    return outPath;
  }

  const bible      = loadArtBible();
  const baseStyle  = bible?.artStyle || 'flat 2D cartoon illustration, bold outlines, vibrant colors';
  const fullPrompt = opts.styleSuffix
    ? `${prompt}, ${baseStyle}`
    : `${prompt}, ${baseStyle}, no text, no watermark`;

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
  if (!bible) {
    logger.warn('[ART] No art-bible.json found — skipping pre-generation');
    return { generated: 0, skipped: 0 };
  }

  let generated = 0;
  let skipped   = 0;

  // Characters — all poses
  for (const [charId, char] of Object.entries(bible.characters || {})) {
    for (const [poseId, pose] of Object.entries(char.poses || {})) {
      const cacheKey = `char_${charId}_${poseId}`;
      const prompt   = `${char.visualDescription}, ${pose.prompt}`;
      const result   = await generateDrawnImage(prompt, char.seed + poseId.length, cacheKey, {
        width: 1080, height: 1080,
      });
      result ? generated++ : skipped++;
      await new Promise(r => setTimeout(r, 500)); // polite rate limiting
    }
  }

  // Locations — scene backgrounds
  for (const [locId, loc] of Object.entries(bible.locations || {})) {
    const cacheKey = `loc_${locId}`;
    const result   = await generateDrawnImage(loc.prompt, loc.seed, cacheKey);
    result ? generated++ : skipped++;
    await new Promise(r => setTimeout(r, 500));
  }

  // Enemies
  for (const [enemyId, enemy] of Object.entries(bible.enemies || {})) {
    const cacheKey = `enemy_${enemyId}`;
    const result   = await generateDrawnImage(enemy.prompt, enemy.seed, cacheKey, {
      width: 512, height: 512,
    });
    result ? generated++ : skipped++;
    await new Promise(r => setTimeout(r, 500));
  }

  logger.info('[OK] Art pre-generation done', { generated, skipped });
  return { generated, skipped };
}
