/**
 * visual-agent.js — v3.0
 *
 * Changes from v2.1:
 *  - Primary source: Pollinations.AI drawn illustrations (art-library-agent)
 *    — seed consistency via art-bible.json (same character/location = same visual style)
 *  - MOOD_MAP / TIME_MAP keys updated to English enums (err-217 fix)
 *  - NEGATIVE_PROMPT replaced by per-mode variants from scene-agent
 *  - Fallback chain: drawn → Lexica → Unsplash → Picsum → fallback.png
 *  - universe parameter added to run() for visualMode detection
 *
 * Sources (priority order):
 *  1. Pollinations.AI drawn (no API key, mode=drawn)
 *  2. Lexica.art (free AI images)
 *  3. Unsplash (1000 req/month, needs key)
 *  4. Picsum (no key)
 *  5. fallback.png (local)
 */

import { writeFileSync, existsSync, mkdirSync, copyFileSync, readFileSync } from 'fs';
import { join, dirname }                                                      from 'path';
import { fileURLToPath }                                                      from 'url';
import { generateDrawnImage }                                                 from './art-library-agent.js';
import { logger }                                                             from '../logger.js';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const FALLBACK_IMG = join(__dirname, '..', 'assets', 'fallback.png');
const CACHE_DIR    = join(__dirname, '..', 'assets', 'image-cache');
const BIBLE_PATH   = join(__dirname, '..', 'assets', 'art-bible.json');

// ── Art-bible loader ──────────────────────────────────────
function loadArtBible() {
  if (!existsSync(BIBLE_PATH)) return null;
  try { return JSON.parse(readFileSync(BIBLE_PATH, 'utf8')); } catch { return null; }
}

// ── Seed from string (deterministic, for consistent images) ─
function hashToSeed(str) {
  return str.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

// ── Main ──────────────────────────────────────────────────
export async function run(visualScenes, episodeNumber, universe = {}) {
  const mode    = visualScenes?.scenes?.[0]?.visualMode
    || (existsSync(BIBLE_PATH) ? 'drawn' : 'photo');
  const artBible = mode === 'drawn' ? loadArtBible() : null;

  logger.info('[VISUAL] Fetching images', {
    episode: episodeNumber,
    scenes:  visualScenes.scenes?.length || 0,
    mode,
  });

  if (!visualScenes?.scenes?.length) {
    logger.warn('[VISUAL] No scenes to process');
    return { episode: episodeNumber, scenes: [], generated: 0, failed: 0, cost: 0 };
  }

  mkdirSync(CACHE_DIR,  { recursive: true });
  const outDir = join(__dirname, '..', 'episodes', `ep${episodeNumber}`, 'images');
  mkdirSync(outDir, { recursive: true });

  const results = [];

  for (const scene of visualScenes.scenes) {
    const imagePath = join(outDir, `${scene.id}.jpg`);

    if (existsSync(imagePath)) {
      logger.info(`[VISUAL] Cached: ${scene.id}`);
      results.push({ ...scene, imagePath });
      continue;
    }

    logger.info(`[VISUAL] Processing: ${scene.id}`, { mode, mood: scene.mood });

    let downloaded = false;

    // 1. Drawn (Pollinations) — primary for drawn mode
    if (mode === 'drawn' && artBible) {
      downloaded = await tryDrawn(scene, artBible, imagePath);
    }

    // 2. Lexica
    if (!downloaded) {
      const query = buildSearchQuery(scene);
      downloaded  = await tryLexica(query, imagePath);
    }

    // 3. Unsplash
    if (!downloaded && process.env.UNSPLASH_ACCESS_KEY) {
      const query = buildSearchQuery(scene);
      downloaded  = await tryUnsplash(query, imagePath);
    }

    // 4. Picsum
    if (!downloaded) downloaded = await tryPicsum(scene, imagePath);

    // 5. Local fallback
    if (!downloaded) {
      logger.warn(`[VISUAL] Using fallback for ${scene.id}`);
      if (existsSync(FALLBACK_IMG)) { copyFileSync(FALLBACK_IMG, imagePath); downloaded = true; }
    }

    results.push({ ...scene, imagePath: downloaded ? imagePath : null });
    await new Promise(r => setTimeout(r, 800));
  }

  const manifest = {
    episode:     episodeNumber,
    scenes:      results,
    generated:   results.filter(s => s.imagePath).length,
    failed:      results.filter(s => !s.imagePath).length,
    cost:        0,
    mode,
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(
    join(__dirname, '..', 'episodes', `ep${episodeNumber}`, 'visual-manifest.json'),
    JSON.stringify(manifest, null, 2), 'utf8'
  );

  logger.info('[OK] Visual done', { generated: manifest.generated, failed: manifest.failed });
  return manifest;
}

// ── Drawn via Pollinations + art-bible for consistency ────
async function tryDrawn(scene, artBible, outputPath) {
  try {
    // Try to match a character from the bible for seed consistency
    const charId = scene.characters?.[0]?.toLowerCase();
    const char   = charId && artBible.characters?.[charId];
    const locId  = Object.keys(artBible.locations || {}).find(k =>
      scene.location?.toLowerCase().includes(k.replace(/_/g, ' '))
    );
    const loc    = locId && artBible.locations?.[locId];

    const seed = char?.seed ?? loc?.seed ?? hashToSeed(scene.location || scene.id);

    const prompt = [
      char?.visualDescription,
      loc?.prompt || `Location: ${scene.location}`,
      scene.action ? scene.action.slice(0, 80) : '',
      artBible.artStyle,
    ].filter(Boolean).join(', ');

    // Use art-library-agent's cache key for cross-episode reuse
    const cacheKey = `ep_scene_${scene.id}`;
    const cached   = await generateDrawnImage(prompt, seed, cacheKey);
    if (!cached) return false;

    copyFileSync(cached, outputPath);
    return true;
  } catch (err) {
    logger.warn(`[VISUAL] tryDrawn failed: ${err.message}`);
    return false;
  }
}

// ── Lexica.art ────────────────────────────────────────────
async function tryLexica(query, outputPath) {
  try {
    const res  = await fetch(
      `https://lexica.art/api/v1/search?q=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return false;
    const data = await res.json();
    const imgs = data.images || [];
    if (!imgs.length) return false;
    const best = imgs.find(i => i.width > i.height) || imgs[0];
    if (!best?.src) return false;
    return await downloadImage(best.src, outputPath);
  } catch (err) {
    logger.info(`[VISUAL] Lexica failed: ${err.message}`);
    return false;
  }
}

// ── Unsplash ──────────────────────────────────────────────
async function tryUnsplash(query, outputPath) {
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`,
      {
        headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
        signal:  AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) return false;
    const data  = await res.json();
    const photo = data.results?.[0];
    if (!photo?.urls?.regular) return false;
    return await downloadImage(photo.urls.regular, outputPath);
  } catch (err) {
    logger.info(`[VISUAL] Unsplash failed: ${err.message}`);
    return false;
  }
}

// ── Picsum ────────────────────────────────────────────────
async function tryPicsum(scene, outputPath) {
  try {
    const seed = hashToSeed(scene.id);
    return await downloadImage(`https://picsum.photos/seed/${seed}/1920/1080`, outputPath);
  } catch (err) {
    logger.info(`[VISUAL] Picsum failed: ${err.message}`);
    return false;
  }
}

// ── Generic image downloader ──────────────────────────────
async function downloadImage(url, outputPath) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return false;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 1000) return false;
    writeFileSync(outputPath, buffer);
    return true;
  } catch {
    return false;
  }
}

// ── Build Lexica/Unsplash query from scene ────────────────
function buildSearchQuery(scene) {
  const moodTerms = {
    tense:      'dramatic tense dark',
    urgent:     'action dynamic motion',
    dread:      'dark ominous fog',
    desperate:  'harsh lighting extreme',
    triumphant: 'epic golden light',
    calm:       'peaceful serene',
  };
  return [
    scene.location || 'cosmic void',
    moodTerms[scene.mood] || 'cinematic',
    'sci-fi fantasy space',
  ].filter(Boolean).join(' ');
}
