/**
 * scene-agent.js — v1.2
 *
 * Changes from v1.1:
 *  - LIGHTING_MAP / MOOD_MAP keys: Arabic → English enums matching screenplay-agent v2.3 output
 *  - NEGATIVE_PROMPT split into PHOTO and DRAWN variants (drawn = no photo/3D exclusion)
 *  - extractCharacters() helper — returns character names from dialogue for art-library lookup
 *  - buildVisualPrompt returns characters[] for visual-agent drawn mode
 *  - universe.art.visualMode drives which NEGATIVE_PROMPT to use
 *
 * No Gemini calls — rule-137 (scene-agent is Gemini-free)
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname }                         from 'path';
import { fileURLToPath }                         from 'url';
import { readForAgent }                          from './library-builder-agent.js';
import { logger }                                from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Keys match the enum constraint added in screenplay-agent v2.3
const LIGHTING_MAP = {
  day:   'natural daylight, soft shadows, bright environment',
  night: 'night scene, deep shadows, moonlight or cold artificial lighting',
  dawn:  'golden hour dawn light, warm orange glow on horizon',
  dusk:  'sunset, dramatic warm backlighting, long shadows',
};

// Keys match the mood enum added in screenplay-agent v2.3 generateScenes prompt
const MOOD_MAP = {
  tense:      'tense atmosphere, high contrast lighting, oppressive darkness',
  urgent:     'sharp angles, harsh directional light, sense of speed and motion',
  dread:      'ominous shadows, cold blue tones, heavy fog, existential weight',
  desperate:  'overexposed harsh light, chaotic composition, extreme close angles',
  triumphant: 'warm golden tones, expansive framing, light breaking through darkness',
  calm:       'soft diffused light, stable composition, brief respite',
};

// Two negative prompt variants
const NEGATIVE_PROMPT_PHOTO = [
  'text, watermark, logo, signature',
  'low quality, blurry, distorted',
  'modern technology, phones, cars',
].join(', ');

const NEGATIVE_PROMPT_DRAWN = [
  'text, watermark, logo, signature',
  'photorealistic, photograph, 3d render, CGI',
  'low quality, blurry, distorted',
].join(', ');

// ── Extract character names from scene dialogue ────────────
function extractCharacters(scene) {
  const names = (scene.dialogue || []).map(d => d?.character).filter(Boolean);
  return [...new Set(names)]; // deduplicate
}

// ── Main ──────────────────────────────────────────────────
export async function run(screenplay, universe) {
  logger.info('[SCENE] Building visual prompts', { episode: screenplay.episode });

  if (!screenplay?.acts?.length) {
    logger.warn('[SCENE] No acts in screenplay');
    return { episode: screenplay.episode, scenes: [] };
  }

  const library     = readForAgent('scene-agent', 8);
  const artStyle    = universe.art?.style    || 'cosmic sci-fi, flat 2D illustration';
  const palette     = universe.art?.palette  || 'deep purple and void black with gold accents';
  const visualMode  = universe.art?.visualMode || (
    existsSync(join(__dirname, '..', 'assets', 'art-bible.json')) ? 'drawn' : 'photo'
  );

  const libraryHint = library ? library.slice(0, 200).replace(/\n/g, ' ') : '';

  const scenes       = screenplay.acts.flatMap(a => a.scenes || []);
  const visualScenes = scenes.map(scene =>
    buildVisualPrompt(scene, artStyle, palette, libraryHint, universe, visualMode)
  );

  const outDir = join(__dirname, '..', 'episodes', `ep${screenplay.episode}`);
  mkdirSync(outDir, { recursive: true });

  writeFileSync(
    join(outDir, 'visual-scenes.json'),
    JSON.stringify({ episode: screenplay.episode, scenes: visualScenes }, null, 2),
    'utf8'
  );

  logger.info('[OK] Visual prompts ready', { count: visualScenes.length, mode: visualMode });
  return { episode: screenplay.episode, scenes: visualScenes };
}

// ── Build visual prompt for one scene ─────────────────────
function buildVisualPrompt(scene, artStyle, palette, libraryHint, universe, visualMode) {
  const lighting  = LIGHTING_MAP[scene.time]  || 'cinematic lighting';
  const moodStyle = MOOD_MAP[scene.mood]      || 'dramatic cinematic mood';
  const chars     = extractCharacters(scene);
  const negPrompt = visualMode === 'drawn' ? NEGATIVE_PROMPT_DRAWN : NEGATIVE_PROMPT_PHOTO;

  const imagePrompt = [
    `${artStyle}, ${palette}`,
    `Location: ${scene.location || 'cosmic void ruins'}`,
    `${lighting}, ${moodStyle}`,
    scene.camera ? `Camera: ${scene.camera}` : 'wide establishing shot',
    scene.action ? `Action: ${scene.action.slice(0, 100)}` : '',
    `Universe: ${universe.name?.en || 'Memory Shards Saga'}`,
    libraryHint ? `Style reference: ${libraryHint}` : '',
    visualMode === 'drawn'
      ? 'flat 2D cartoon, bold outlines, vibrant colors, no text, no watermark'
      : 'ultra detailed, 8k, film grain, anamorphic lens, no text, no watermark',
  ].filter(Boolean).join('. ');

  return {
    id:             scene.id,
    location:       scene.location    || '',
    time:           scene.time        || 'night',
    mood:           scene.mood        || 'tense',
    duration:       scene.duration    || 60,
    imagePrompt,
    negativePrompt: negPrompt,
    aspectRatio:    '16:9',
    sfx:            scene.sfx         || '',
    music:          scene.music       || '',
    dialogue:       (scene.dialogue   || []).filter(d => d?.line),
    characters:     chars,
    visualMode,
    imagePath:      null,
  };
}
