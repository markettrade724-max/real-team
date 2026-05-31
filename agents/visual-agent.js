/**
 * visual-agent.js
 * يولد صورة لكل مشهد عبر Imagen (Gemini API)
 * بدون استهلاك حصة النص — Imagen مدفوع منفصل
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname }                         from 'path';
import { fileURLToPath }                         from 'url';
import { GoogleGenAI }                           from '@google/genai';
import { logger }                                from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ai        = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function run(visualScenes, episodeNumber) {
  logger.info('[VISUAL] Generating images', {
    episode: episodeNumber,
    scenes:  visualScenes.scenes.length,
  });

  const outDir = join(__dirname, '..', 'episodes', `ep${episodeNumber}`, 'images');
  mkdirSync(outDir, { recursive: true });

  const results = [];

  for (const scene of visualScenes.scenes) {
    const imagePath = join(outDir, `${scene.id}.png`);

    // تخطّ إذا موجودة
    if (existsSync(imagePath)) {
      logger.debug(`[VISUAL] Skipping existing: ${scene.id}`);
      results.push({ ...scene, imagePath });
      continue;
    }

    try {
      const response = await ai.models.generateImages({
        model:  'imagen-3.0-generate-002',
        prompt: scene.imagePrompt,
        config: {
          numberOfImages:      1,
          aspectRatio:         '16:9',
          negativePrompt:      scene.negativePrompt,
          personGeneration:    'allow_adult',
        },
      });

      const imageData = response.generatedImages?.[0]?.image?.imageBytes;
      if (imageData) {
        writeFileSync(imagePath, Buffer.from(imageData, 'base64'));
        logger.info(`[OK] Image: ${scene.id}`);
        results.push({ ...scene, imagePath });
      } else {
        logger.warn(`[WARN] No image for scene ${scene.id}`);
        results.push({ ...scene, imagePath: null });
      }

      // تأخير بين الصور لتجنب rate limit
      await new Promise(r => setTimeout(r, 2000));

    } catch (err) {
      logger.error(`[VISUAL] Failed: ${scene.id}`, { error: err.message });
      results.push({ ...scene, imagePath: null });
    }
  }

  const manifest = {
    episode:    episodeNumber,
    scenes:     results,
    generated:  results.filter(s => s.imagePath).length,
    failed:     results.filter(s => !s.imagePath).length,
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(
    join(__dirname, '..', 'episodes', `ep${episodeNumber}`, 'visual-manifest.json'),
    JSON.stringify(manifest, null, 2), 'utf8'
  );

  logger.info('[OK] Visual generation done', {
    generated: manifest.generated,
    failed:    manifest.failed,
  });

  return manifest;
}
