/**
 * trailer-agent.js — v2.1 (Node.js خالص)
 *
 * التغييرات عن v2.0:
 *  - copyFileSync في أعلى الملف (rule-134)
 *
 * القواعد المطبقة:
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-126 : Node.js خالص — fluent-ffmpeg
 *  rule-134 : لا await import داخل دوال
 */

import { writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname }  from 'path';
import { fileURLToPath }  from 'url';
import ffmpeg             from 'fluent-ffmpeg';
import ffmpegInstaller    from '@ffmpeg-installer/ffmpeg';
import { logger }         from '../logger.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __dirname    = dirname(fileURLToPath(import.meta.url));
const MUSIC_LIB    = join(__dirname, '..', 'assets', 'music');
const FALLBACK_IMG = join(__dirname, '..', 'assets', 'fallback.png');
const TRAILER_DUR  = 60;

// ══════════════════════════════════════════════════════════
// الدالة الرئيسية
// ══════════════════════════════════════════════════════════
export async function run(screenplay, visualManifest, audioManifest, episodeManifest) {
  logger.info('[TRAILER] Building trailer', { episode: screenplay.episode });

  const epDir  = join(__dirname, '..', 'episodes', `ep${screenplay.episode}`);
  const outDir = join(epDir, 'output');
  const segDir = join(epDir, 'trailer-segments');
  mkdirSync(outDir, { recursive: true });
  mkdirSync(segDir, { recursive: true });

  const outputPath = join(outDir, 'trailer.mp4');
  if (existsSync(outputPath)) {
    logger.info('[TRAILER] Already exists');
    return { outputPath, duration: TRAILER_DUR };
  }

  const selected = selectBestScenes(screenplay, visualManifest);
  if (!selected.length) {
    logger.warn('[TRAILER] No suitable scenes');
    return null;
  }

  // بناء المقاطع
  const segPaths = [];
  for (const scene of selected) {
    const segPath = join(segDir, `${scene.role}.mp4`);
    segPaths.push(segPath);
    if (!existsSync(segPath)) {
      await buildTrailerSegment(scene, segPath, screenplay);
    }
  }

  // دمج المقاطع
  const concatPath = join(epDir, 'trailer-concat.txt');
  writeFileSync(
    concatPath,
    segPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'),
    'utf8'
  );

  const tempPath = join(outDir, 'trailer-temp.mp4');
  await concatSegments(concatPath, tempPath);

  // موسيقى درامية
  const bgMusic = join(MUSIC_LIB, 'dramatic.mp3');
  if (existsSync(bgMusic)) {
    await mixWithMusic(tempPath, bgMusic, outputPath, 0.3);
  } else {
    copyFileSync(tempPath, outputPath); // rule-134: import في الأعلى
  }

  const result = {
    episode:     screenplay.episode,
    outputPath,
    duration:    TRAILER_DUR,
    scenes:      selected.map(s => s.id),
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(
    join(epDir, 'trailer-manifest.json'),
    JSON.stringify(result, null, 2), 'utf8'
  );

  logger.info('[OK] Trailer ready', { path: outputPath });
  return result;
}

// ══════════════════════════════════════════════════════════
// اختيار المشاهد
// ══════════════════════════════════════════════════════════
function selectBestScenes(screenplay, visualManifest) {
  const allScenes = (screenplay.acts || []).flatMap(a => a.scenes || []);
  const moodScore = { 'توتر': 5, 'خوف': 4, 'حماس': 4, 'حزن': 3, 'أمل': 2, 'هدوء': 1 };

  const scored = allScenes.map((scene, idx) => {
    const visual = (visualManifest?.scenes || []).find(v => v.id === scene.id);
    if (!visual?.imagePath || !existsSync(visual.imagePath)) return null;
    let score = moodScore[scene.mood] || 1;
    if (scene.dialogue?.length) score += 2;
    if (idx > allScenes.length * 0.7) score += 3;
    if (idx === allScenes.length - 1) score += 5;
    return { ...scene, imagePath: visual.imagePath, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score);

  if (!scored.length) return [];

  const firstVisual = (visualManifest?.scenes || [])[0];
  const hook = firstVisual?.imagePath && existsSync(firstVisual.imagePath)
    ? { ...allScenes[0], imagePath: firstVisual.imagePath, duration: 5,  role: 'hook' }
    : null;

  const peak  = scored[0]
    ? { ...scored[0], duration: 40, role: 'peak' }
    : null;

  const lastScene = allScenes[allScenes.length - 1];
  const cliffVisual = scored.find(s => s.id === lastScene?.id) || scored[1];
  const cliff = cliffVisual
    ? { ...cliffVisual, duration: 15, role: 'cliffhanger' }
    : null;

  return [hook, peak, cliff].filter(s => s?.imagePath && existsSync(s.imagePath));
}

// ══════════════════════════════════════════════════════════
// بناء مقطع تريلر — 9:16 عمودي
// ══════════════════════════════════════════════════════════
function buildTrailerSegment(scene, outputPath, screenplay) {
  return new Promise((resolve, reject) => {
    const img       = existsSync(scene.imagePath) ? scene.imagePath : FALLBACK_IMG;
    const titleText = escapeFFmpeg(screenplay.title || 'المسلسل');
    const subText   = scene.role === 'cliffhanger'
      ? escapeFFmpeg((screenplay.cliffhanger || '').slice(0, 35))
      : `الحلقة ${screenplay.episode}`;

    const vf = [
      'scale=1080:1920:force_original_aspect_ratio=increase',
      'crop=1080:1920',
      'setsar=1',
      scene.role === 'peak'
        ? `zoompan=z='min(zoom+0.0003,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${scene.duration * 25}:s=1080x1920`
        : '',
      `drawtext=text='${titleText}':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=100:shadowcolor=black:shadowx=2:shadowy=2`,
      `drawtext=text='${subText}':fontcolor=yellow:fontsize=32:x=(w-text_w)/2:y=h-140:shadowcolor=black:shadowx=2:shadowy=2`,
      `fade=t=in:st=0:d=0.4`,
      `fade=t=out:st=${scene.duration - 0.4}:d=0.4`,
    ].filter(Boolean).join(',');

    ffmpeg()
      .input(img)
      .inputOptions(['-loop 1', `-t ${scene.duration}`])
      .input('anullsrc=r=44100:cl=stereo')
      .inputFormat('lavfi')
      .outputOptions([
        '-c:v libx264', '-preset fast', '-crf 20',
        '-c:a aac', '-b:a 128k',
        `-t ${scene.duration}`,
        '-pix_fmt yuv420p', '-r 25',
      ])
      .videoFilters(vf)
      .output(outputPath)
      .on('end',   resolve)
      .on('error', reject)
      .run();
  });
}

// ══════════════════════════════════════════════════════════
// دمج ومزج
// ══════════════════════════════════════════════════════════
function concatSegments(concatPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy'])
      .output(outputPath)
      .on('end',   resolve)
      .on('error', reject)
      .run();
  });
}

function mixWithMusic(videoPath, musicPath, outputPath, vol = 0.3) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(musicPath)
      .complexFilter([
        `[1:a]volume=${vol},aloop=loop=-1:size=2e+09[bg]`,
        `[0:a][bg]amix=inputs=2:duration=first[aout]`,
      ])
      .outputOptions([
        '-map 0:v', '-map [aout]',
        '-c:v copy', '-c:a aac', '-b:a 192k',
        `-t ${TRAILER_DUR}`,
      ])
      .output(outputPath)
      .on('end',   resolve)
      .on('error', reject)
      .run();
  });
}

function escapeFFmpeg(text) {
  return (text || '').replace(/'/g, '').replace(/:/g, ' ').replace(/[[\]]/g, '');
}
