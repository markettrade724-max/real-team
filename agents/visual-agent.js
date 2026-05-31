/**
 * visual-agent.js — v2.0 Zero Cost
 *
 * المصادر (مجانية بالكامل — بالأولوية):
 * 1. Lexica.art API  — بحث صور AI مجاني
 * 2. Unsplash API    — صور واقعية مجانية (1000 طلب/شهر)
 * 3. Picsum Photos   — صور عشوائية بدون API key
 * 4. fallback.png    — صورة محلية احتياطية
 *
 * Imagen مؤجل حتى يبدأ الدخل
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname }  from 'path';
import { fileURLToPath }  from 'url';
import { logger }         from '../logger.js';

const __dirname     = dirname(fileURLToPath(import.meta.url));
const FALLBACK_IMG  = join(__dirname, '..', 'assets', 'fallback.png');
const CACHE_DIR     = join(__dirname, '..', 'assets', 'image-cache');

export async function run(visualScenes, episodeNumber) {
  logger.info('[VISUAL] Fetching images (zero cost)', {
    episode: episodeNumber,
    scenes:  visualScenes.scenes.length,
  });

  mkdirSync(CACHE_DIR, { recursive: true });
  const outDir = join(__dirname, '..', 'episodes', `ep${episodeNumber}`, 'images');
  mkdirSync(outDir, { recursive: true });

  const results = [];

  for (const scene of visualScenes.scenes) {
    const imagePath = join(outDir, `${scene.id}.jpg`);

    // تخطّ إذا موجودة
    if (existsSync(imagePath)) {
      logger.debug(`[VISUAL] Cached: ${scene.id}`);
      results.push({ ...scene, imagePath });
      continue;
    }

    // بناء كلمات البحث من المشهد
    const query = buildSearchQuery(scene);
    logger.info(`[VISUAL] Searching: "${query}" for ${scene.id}`);

    // محاولة 1: Lexica.art
    let downloaded = await tryLexica(query, imagePath);

    // محاولة 2: Unsplash
    if (!downloaded && process.env.UNSPLASH_ACCESS_KEY) {
      downloaded = await tryUnsplash(query, imagePath);
    }

    // محاولة 3: Picsum (بدون API key)
    if (!downloaded) {
      downloaded = await tryPicsum(scene, imagePath);
    }

    // محاولة 4: fallback محلي
    if (!downloaded) {
      logger.warn(`[VISUAL] Using fallback for ${scene.id}`);
      const { copyFileSync } = await import('fs');
      if (existsSync(FALLBACK_IMG)) copyFileSync(FALLBACK_IMG, imagePath);
      downloaded = existsSync(FALLBACK_IMG);
    }

    results.push({ ...scene, imagePath: downloaded ? imagePath : null });

    // تأخير بين الطلبات
    await new Promise(r => setTimeout(r, 1000));
  }

  const manifest = {
    episode:    episodeNumber,
    scenes:     results,
    generated:  results.filter(s => s.imagePath).length,
    failed:     results.filter(s => !s.imagePath).length,
    cost:       0,
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(
    join(__dirname, '..', 'episodes', `ep${episodeNumber}`, 'visual-manifest.json'),
    JSON.stringify(manifest, null, 2), 'utf8'
  );

  logger.info('[OK] Visual done (zero cost)', {
    found:  manifest.generated,
    failed: manifest.failed,
  });

  return manifest;
}

// ════════════════════════════════════════════
// 1. Lexica.art — صور AI مجانية
// ════════════════════════════════════════════
async function tryLexica(query, outputPath) {
  try {
    const res = await fetch(
      `https://lexica.art/api/v1/search?q=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return false;

    const data = await res.json();
    const imgs  = data.images || [];
    if (!imgs.length) return false;

    // اختر أفضل صورة بدقة 16:9
    const best = imgs.find(i => i.width > i.height) || imgs[0];
    if (!best?.src) return false;

    return await downloadImage(best.src, outputPath);
  } catch (err) {
    logger.debug(`[VISUAL] Lexica failed: ${err.message}`);
    return false;
  }
}

// ════════════════════════════════════════════
// 2. Unsplash API — صور واقعية
// ════════════════════════════════════════════
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
    logger.debug(`[VISUAL] Unsplash failed: ${err.message}`);
    return false;
  }
}

// ════════════════════════════════════════════
// 3. Picsum — صور عشوائية بدون key
// ════════════════════════════════════════════
async function tryPicsum(scene, outputPath) {
  try {
    // seed من اسم المشهد لتكون الصورة ثابتة
    const seed = scene.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const url  = `https://picsum.photos/seed/${seed}/1920/1080`;

    return await downloadImage(url, outputPath);
  } catch (err) {
    logger.debug(`[VISUAL] Picsum failed: ${err.message}`);
    return false;
  }
}

// ════════════════════════════════════════════
// تنزيل صورة بـ fetch
// ════════════════════════════════════════════
async function downloadImage(url, outputPath) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return false;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 1000) return false; // صورة فارغة

    writeFileSync(outputPath, buffer);
    logger.debug(`[VISUAL] Downloaded: ${outputPath}`);
    return true;
  } catch {
    return false;
  }
}

// ════════════════════════════════════════════
// بناء query بحث من المشهد
// ════════════════════════════════════════════
function buildSearchQuery(scene) {
  const moodMap = {
    'توتر':  'dramatic tense dark',
    'خوف':   'dark scary foggy',
    'حماس':  'epic action dynamic',
    'حزن':   'melancholic sad lonely',
    'أمل':   'hopeful golden light',
    'هدوء':  'peaceful serene calm',
  };

  const timeMap = {
    'نهار':  'daylight',
    'ليل':   'night moonlight',
    'فجر':   'dawn golden hour',
    'غروب':  'sunset dramatic sky',
  };

  const parts = [
    scene.location || 'fantasy landscape',
    moodMap[scene.mood] || 'cinematic',
    timeMap[scene.time] || '',
    'cinematic fantasy',
  ].filter(Boolean);

  return parts.join(' ');
}
