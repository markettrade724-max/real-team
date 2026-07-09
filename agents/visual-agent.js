/**
 * visual-agent.js — v3.1
 *
 * Changes from v3.0:
 *  - tryDrawn(): fixed 'fullPrompt is not defined' (err-229)
 *    drawCharacter() from procedural-drawer composited on Pollinations background
 *  - moodToPose() maps scene mood (enum from screenplay-agent v2.3) → character pose
 *  - Location cache key derived from scene.location string matching art-bible keys
 *  - Fallback chain unchanged: Lexica → Unsplash → Picsum → fallback.png
 */

import { writeFileSync, existsSync, mkdirSync, copyFileSync, readFileSync } from 'fs';
import { join, dirname }                                                      from 'path';
import { fileURLToPath }                                                      from 'url';
import { generateDrawnImage }                                                 from './art-library-agent.js';
import { drawCharacter, moodToPose }                                          from './procedural-drawer.js';
import { logger }                                                             from '../logger.js';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const FALLBACK_IMG = join(__dirname, '..', 'assets', 'fallback.png');
const CACHE_DIR    = join(__dirname, '..', 'assets', 'art-cache');
const BIBLE_PATH   = join(__dirname, '..', 'assets', 'art-bible.json');

function loadArtBible() {
  if (!existsSync(BIBLE_PATH)) return null;
  try { return JSON.parse(readFileSync(BIBLE_PATH, 'utf8')); } catch { return null; }
}

function hashToSeed(str) {
  return str.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

// Match scene.location string to an art-bible location key
function resolveLocationKey(location, bible) {
  if (!location || !bible?.locations) return null;
  const loc = location.toLowerCase();
  for (const key of Object.keys(bible.locations)) {
    const keyWords = key.replace(/_/g, ' ').split(' ');
    if (keyWords.some(w => loc.includes(w))) return key;
  }
  return null;
}

// Identify primary character in scene
function resolvePrimaryChar(scene, bible) {
  if (!scene.characters?.length || !bible?.characters) return null;
  const chars = Object.keys(bible.characters);
  for (const name of scene.characters) {
    const match = chars.find(c => name.toLowerCase().includes(c));
    if (match) return match;
  }
  return null;
}

// ══════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════
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

    // 1. Drawn mode: Pollinations background + procedural character
    if (mode === 'drawn' && artBible) {
      downloaded = await tryDrawn(scene, artBible, imagePath, episodeNumber);
    }

    // 2. Lexica fallback
    if (!downloaded) {
      downloaded = await tryLexica(buildSearchQuery(scene), imagePath);
    }

    // 3. Unsplash fallback
    if (!downloaded && process.env.UNSPLASH_ACCESS_KEY) {
      downloaded = await tryUnsplash(buildSearchQuery(scene), imagePath);
    }

    // 4. Picsum fallback
    if (!downloaded) downloaded = await tryPicsum(scene, imagePath);

    // 5. Local fallback
    if (!downloaded && existsSync(FALLBACK_IMG)) {
      copyFileSync(FALLBACK_IMG, imagePath);
      downloaded = true;
      logger.warn(`[VISUAL] Using fallback.png for ${scene.id}`);
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
    join(__dirname, '..', 'episodes', `ep${episodeNumber}`, `visual-manifest.json`),
    JSON.stringify(manifest, null, 2), 'utf8'
  );

  logger.info('[OK] Visual done', { generated: manifest.generated, failed: manifest.failed });
  return manifest;
}

// ══════════════════════════════════════════════════════════
// tryDrawn: Pollinations background + procedural character
// ══════════════════════════════════════════════════════════
async function tryDrawn(scene, artBible, outputPath, episodeNumber) {
  try {
    // Step 1: Get or generate Pollinations background
    const locKey   = resolveLocationKey(scene.location, artBible);
    const locDef   = locKey ? artBible.locations[locKey] : null;
    const bgSeed   = locDef?.seed ?? hashToSeed(scene.location || scene.id);
    const bgPrompt = locDef?.prompt
      ?? `${scene.location || 'cosmic void'}, cosmic sci-fi, deep space, dramatic lighting`;
    const bgCacheKey = locKey ? `loc_${locKey}` : `bg_${hashToSeed(scene.location || scene.id)}`;

    let bgPath = await generateDrawnImage(bgPrompt, bgSeed, bgCacheKey);
    // bgPath may be null if Pollinations is down — proceed without bg (pure procedural)

    // Step 2: Identify character in scene
    const charId = resolvePrimaryChar(scene, artBible);

    if (!charId) {
      // No character in this scene — use Pollinations background only
      if (bgPath && existsSync(bgPath)) {
        copyFileSync(bgPath, outputPath);
        logger.info(`[VISUAL] Background only (no character): ${scene.id}`);
        return true;
      }
      return false;
    }

    // Step 3: Determine pose from scene mood
    const pose = moodToPose(charId, scene.mood);

    // Step 4: Draw character constellation on top of background
    const seed   = artBible.characters[charId]?.seed ?? hashToSeed(charId + scene.id);
    const drawn  = await drawCharacter(charId, pose, seed, outputPath, bgPath || null);

    if (drawn) {
      logger.info(`[VISUAL] Composited: ${charId}/${pose} on ${locKey || 'procedural bg'}`, {
        scene: scene.id,
      });
      return true;
    }

    // Fallback: background alone if character draw failed
    if (bgPath && existsSync(bgPath)) {
      copyFileSync(bgPath, outputPath);
      return true;
    }

    return false;

  } catch (err) {
    logger.warn(`[VISUAL] tryDrawn failed: ${scene.id}`, { error: err.message });
    return false;
  }
}

// ══════════════════════════════════════════════════════════
// Fallback sources
// ══════════════════════════════════════════════════════════
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
    return downloadImage(best.src, outputPath);
  } catch { return false; }
}

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
    return downloadImage(photo.urls.regular, outputPath);
  } catch { return false; }
}

async function tryPicsum(scene, outputPath) {
  try {
    return downloadImage(
      `https://picsum.photos/seed/${hashToSeed(scene.id)}/1920/1080`,
      outputPath
    );
  } catch { return false; }
}

async function downloadImage(url, outputPath) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return false;
    writeFileSync(outputPath, buf);
    return true;
  } catch { return false; }
}

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
