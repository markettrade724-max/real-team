/**
 * visual-agent.js — v2.1 Zero Cost
 *
 * التغييرات عن v2.0:
 *  - copyFileSync في أعلى الملف (rule-134)
 *
 * المصادر (مجانية — بالأولوية):
 *  1. Lexica.art API  — صور AI مجانية
 *  2. Unsplash API    — صور واقعية (1000 طلب/شهر)
 *  3. Picsum Photos   — بدون API key
 *  4. fallback.png    — محلي
 *
 * القواعد المطبقة:
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-134 : لا await import داخل دوال
 */

import { writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger }        from '../logger.js';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const FALLBACK_IMG = join(__dirname, '..', 'assets', 'fallback.png');
const CACHE_DIR    = join(__dirname, '..', 'assets', 'image-cache');

const MOOD_MAP = {
  'توتر':  'dramatic tense dark',
  'خوف':   'dark scary foggy',
  'حماس':  'epic action dynamic',
  'حزن':   'melancholic sad lonely',
  'أمل':   'hopeful golden light',
  'هدوء':  'peaceful serene calm',
};

const TIME_MAP = {
  'نهار':  'daylight',
  'ليل':   'night moonlight',
  'فجر':   'dawn golden hour',
  'غروب':  'sunset dramatic sky',
};

// ══════════════════════════════════════════════════════════
// الدالة الرئيسية
// ══════════════════════════════════════════════════════════
export async function run(visualScenes, episodeNumber) {
  logger.info('[VISUAL] Fetching images (zero cost)', {
    episode: episodeNumber,
    scenes:  visualScenes.scenes?.length || 0,
  });

  if (!visualScenes?.scenes?.length) {
    logger.warn('[VISUAL] No scenes to process');
    return { episode: episodeNumber, scenes: [], generated: 0, failed: 0, cost: 0 };
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  const outDir = join(__dirname, '..', 'episodes', `ep${episodeNumber}`, 'images');
  mkdirSync(outDir, { recursive: true });

  const results = [];

  for (const scene of visualScenes.scenes) {
    const imagePath = join(outDir, `${scene.id}.jpg`);

    // تخطّ إذا موجودة في الكاش
    if (existsSync(imagePath)) {
      logger.info(`[VISUAL] Cached: ${scene.id}`);
      results.push({ ...scene, imagePath });
      continue;
    }

    const query = buildSearchQuery(scene);
    logger.info(`[VISUAL] Searching: "${query}" — ${scene.id}`);

    let downloaded = false;

    // 1. Lexica.art
    downloaded = await tryLexica(query, imagePath);

    // 2. Unsplash
    if (!downloaded && process.env.UNSPLASH_ACCESS_KEY) {
      downloaded = await tryUnsplash(query, imagePath);
    }

    // 3. Picsum
    if (!downloaded) {
      downloaded = await tryPicsum(scene, imagePath);
    }

    // 4. fallback محلي
    if (!downloaded) {
      logger.warn(`[VISUAL] Using fallback for ${scene.id}`);
      if (existsSync(FALLBACK_IMG)) {
        copyFileSync(FALLBACK_IMG, imagePath);
        downloaded = true;
      }
    }

    results.push({ ...scene, imagePath: downloaded ? imagePath : null });

    // تأخير بين الطلبات
    await new Promise(r => setTimeout(r, 1000));
  }

  const manifest = {
    episode:     episodeNumber,
    scenes:      results,
    generated:   results.filter(s => s.imagePath).length,
    failed:      results.filter(s => !s.imagePath).length,
    cost:        0,
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(
    join(__dirname, '..', 'episodes', `ep${episodeNumber}`, 'visual-manifest.json'),
    JSON.stringify(manifest, null, 2), 'utf8'
  );

  logger.info('[OK] Visual done', {
    generated: manifest.generated,
    failed:    manifest.failed,
  });

  return manifest;
}

// ══════════════════════════════════════════════════════════
// المصادر
// ══════════════════════════════════════════════════════════

async function tryLexica(query, outputPath) {
  try {
    const res = await fetch(
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

async function tryPicsum(scene, outputPath) {
  try {
    const seed = scene.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return await downloadImage(`https://picsum.photos/seed/${seed}/1920/1080`, outputPath);
  } catch (err) {
    logger.info(`[VISUAL] Picsum failed: ${err.message}`);
    return false;
  }
}

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

// ══════════════════════════════════════════════════════════
// بناء query من المشهد
// ══════════════════════════════════════════════════════════
function buildSearchQuery(scene) {
  return [
    scene.location || 'fantasy landscape',
    MOOD_MAP[scene.mood] || 'cinematic',
    TIME_MAP[scene.time] || '',
    'cinematic fantasy',
  ].filter(Boolean).join(' ');
}
