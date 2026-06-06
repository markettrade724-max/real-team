/**
 * scene-agent.js — v1.1
 *
 * التغييرات عن v1.0:
 *  - guard على screenplay.acts
 *  - library تُستخدم في imagePrompt
 *  - guard على scene.dialogue
 *
 * لا يستهلك Gemini — يعمل من المكتبة فقط
 * القواعد المطبقة:
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname }            from 'path';
import { fileURLToPath }            from 'url';
import { readForAgent }             from './library-builder-agent.js';
import { logger }                   from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const LIGHTING_MAP = {
  'نهار':  'natural daylight, soft shadows',
  'ليل':   'night scene, deep shadows, moonlight or artificial lighting',
  'فجر':   'golden hour dawn light, warm orange glow on horizon',
  'غروب':  'sunset, dramatic warm backlighting, long shadows',
};

const MOOD_MAP = {
  'توتر':  'tense atmosphere, high contrast lighting',
  'حزن':   'melancholic, desaturated colors, soft focus',
  'أمل':   'hopeful, warm golden tones, soft bokeh',
  'خوف':   'ominous shadows, cold blue tones, fog',
  'حماس':  'dynamic composition, vibrant colors, motion blur',
  'هدوء':  'peaceful, soft natural light, shallow depth of field',
};

const NEGATIVE_PROMPT = [
  'text, watermark, logo, signature',
  'cartoon, anime, illustration',
  'low quality, blurry, distorted',
  'modern technology, phones, cars',
].join(', ');

// ══════════════════════════════════════════════════════════
// الدالة الرئيسية
// ══════════════════════════════════════════════════════════
export async function run(screenplay, universe) {
  logger.info('[SCENE] Building visual prompts', {
    episode: screenplay.episode,
  });

  if (!screenplay?.acts?.length) {
    logger.warn('[SCENE] No acts in screenplay');
    return { episode: screenplay.episode, scenes: [] };
  }

  const library  = readForAgent('scene-agent', 8);
  const artStyle = universe.art?.style   || 'cinematic realism';
  const palette  = universe.art?.palette || 'dark moody tones';

  // استخرج نصائح المكتبة للـ prompt
  const libraryHint = library
    ? library.slice(0, 200).replace(/\n/g, ' ')
    : '';

  const scenes       = screenplay.acts.flatMap(a => a.scenes || []);
  const visualScenes = scenes.map(scene =>
    buildVisualPrompt(scene, artStyle, palette, libraryHint, universe)
  );

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

// ══════════════════════════════════════════════════════════
// بناء prompt بصري لمشهد واحد
// ══════════════════════════════════════════════════════════
function buildVisualPrompt(scene, artStyle, palette, libraryHint, universe) {
  const lighting  = LIGHTING_MAP[scene.time] || scene.lighting || 'cinematic lighting';
  const moodStyle = MOOD_MAP[scene.mood]     || 'dramatic cinematic mood';

  const imagePrompt = [
    `${artStyle}, ${palette}`,
    `Location: ${scene.location || 'unknown'}`,
    `${lighting}, ${moodStyle}`,
    scene.camera ? `Camera: ${scene.camera}` : 'wide establishing shot',
    scene.action ? `Action: ${scene.action.slice(0, 100)}` : '',
    `World: ${universe.name?.en || 'fantasy world'}`,
    libraryHint ? `Style reference: ${libraryHint}` : '',
    'ultra detailed, 8k, film grain, anamorphic lens',
    'no text, no watermark',
  ].filter(Boolean).join('. ');

  return {
    id:             scene.id,
    location:       scene.location    || '',
    time:           scene.time        || '',
    mood:           scene.mood        || '',
    duration:       scene.duration    || 60,
    imagePrompt,
    negativePrompt: NEGATIVE_PROMPT,
    aspectRatio:    '16:9',
    sfx:            scene.sfx         || '',
    music:          scene.music       || '',
    dialogue:       (scene.dialogue   || []).filter(d => d?.line),
    imagePath:      null,
  };
}
