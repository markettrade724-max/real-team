/**
 * scene-agent.js
 * يحول كل مشهد من السيناريو → prompt بصري دقيق لـ Imagen
 * يطبق قواعد Blain Brown + Kubrick من المكتبة
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname }            from 'path';
import { fileURLToPath }            from 'url';
import { readForAgent }             from './library-builder-agent.js';
import { logger }                   from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function run(screenplay, universe) {
  logger.info('[SCENE] Building visual prompts', {
    episode: screenplay.episode,
    scenes:  screenplay.acts.flatMap(a => a.scenes).length,
  });

  const library  = readForAgent('scene-agent', 8);
  const artStyle = universe.art?.style || 'cinematic realism';
  const palette  = universe.art?.palette || 'dark moody tones';

  const scenes = screenplay.acts.flatMap(a => a.scenes);
  const visualScenes = [];

  for (const scene of scenes) {
    const visual = buildVisualPrompt(scene, artStyle, palette, library, universe);
    visualScenes.push(visual);
  }

  // حفظ
  const outDir = join(__dirname, '..', 'episodes', `ep${screenplay.episode}`);
  mkdirSync(outDir, { recursive: true });

  writeFileSync(
    join(outDir, 'visual-scenes.json'),
    JSON.stringify({ episode: screenplay.episode, scenes: visualScenes }, null, 2),
    'utf8'
  );

  logger.info('[OK] Visual prompts ready', { count: visualScenes.length });
  return { episode: screenplay.episode, scenes: visualScenes };
}

// ── بناء prompt بصري لكل مشهد ────────────
function buildVisualPrompt(scene, artStyle, palette, library, universe) {
  // ترجمة الإضاءة
  const lightingMap = {
    'نهار':   'natural daylight, soft shadows',
    'ليل':    'night scene, deep shadows, moonlight or artificial lighting',
    'فجر':    'golden hour dawn light, warm orange glow on horizon',
    'غروب':   'sunset, dramatic warm backlighting, long shadows',
  };
  const lighting = lightingMap[scene.time] || scene.lighting || 'cinematic lighting';

  // ترجمة المزاج
  const moodMap = {
    'توتر':     'tense atmosphere, high contrast lighting',
    'حزن':      'melancholic, desaturated colors, soft focus',
    'أمل':      'hopeful, warm golden tones, soft bokeh',
    'خوف':      'ominous shadows, cold blue tones, fog',
    'حماس':     'dynamic composition, vibrant colors, motion blur',
    'هدوء':     'peaceful, soft natural light, shallow depth of field',
  };
  const moodStyle = moodMap[scene.mood] || 'dramatic cinematic mood';

  // prompt الصورة
  const imagePrompt = [
    `${artStyle}, ${palette}`,
    `Location: ${scene.location}`,
    `${lighting}, ${moodStyle}`,
    scene.camera ? `Camera: ${scene.camera}` : 'wide establishing shot',
    scene.action ? `Action: ${scene.action.slice(0, 100)}` : '',
    `World: ${universe.name?.en || 'fantasy world'}`,
    'ultra detailed, 8k, film grain, anamorphic lens',
    'no text, no watermark',
  ].filter(Boolean).join('. ');

  // negative prompt
  const negativePrompt = [
    'text, watermark, logo, signature',
    'cartoon, anime, illustration',
    'low quality, blurry, distorted',
    'modern technology, phones, cars',
  ].join(', ');

  return {
    id:             scene.id,
    location:       scene.location,
    time:           scene.time,
    mood:           scene.mood,
    duration:       scene.duration || 60,
    imagePrompt,
    negativePrompt,
    aspectRatio:    '16:9',
    sfx:            scene.sfx    || '',
    music:          scene.music  || '',
    dialogue:       scene.dialogue || [],
    imagePath:      null, // يُملأ بعد توليد الصورة
  };
}
