/**
 * edit-agent.js — v2.0 (Node.js خالص — Windows/Linux/Mac)
 * يجمع الصور + الصوت + الموسيقى → mp4
 * عبر fluent-ffmpeg (لا bash، لا shell scripts)
 *
 * npm install fluent-ffmpeg @ffmpeg-installer/ffmpeg
 */

import { writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import ffmpeg            from 'fluent-ffmpeg';
import ffmpegInstaller   from '@ffmpeg-installer/ffmpeg';
import { logger }        from '../logger.js';

// تثبيت ffmpeg تلقائياً — يعمل على Windows/Linux/Mac
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __dirname    = dirname(fileURLToPath(import.meta.url));
const MUSIC_LIB    = join(__dirname, '..', 'assets', 'music');
const FALLBACK_IMG = join(__dirname, '..', 'assets', 'fallback.png');

export async function run(screenplay, visualManifest, audioManifest) {
  logger.info('[EDIT] Assembling video', { episode: screenplay.episode });

  const epDir  = join(__dirname, '..', 'episodes', `ep${screenplay.episode}`);
  const outDir = join(epDir, 'output');
  const segDir = join(epDir, 'segments');
  mkdirSync(outDir, { recursive: true });
  mkdirSync(segDir, { recursive: true });

  const outputPath = join(outDir, `episode-${screenplay.episode}.mp4`);
  const timeline   = buildTimeline(screenplay, visualManifest, audioManifest);

  // ── الخطوة 1: بناء كل مشهد → مقطع mp4 ──
  const segPaths = [];
  for (const scene of timeline.scenes) {
    const segPath = join(segDir, `${scene.id}.mp4`);
    segPaths.push(segPath);
    if (!existsSync(segPath)) {
      await buildSegment(scene, segPath);
    }
  }

  // ── الخطوة 2: دمج المقاطع ────────────
  const concatPath = join(epDir, 'concat.txt');
  writeFileSync(
    concatPath,
    segPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'),
    'utf8'
  );

  const tempPath = join(outDir, 'temp.mp4');
  await concatSegments(concatPath, tempPath);

  // ── الخطوة 3: إضافة موسيقى خلفية ────
  const bgMusic = join(MUSIC_LIB, 'ambient.mp3');
  if (existsSync(bgMusic)) {
    await mixWithMusic(tempPath, bgMusic, outputPath, 0.15);
  } else {
    copyFileSync(tempPath, outputPath);
  }

  const result = {
    episode:    screenplay.episode,
    title:      screenplay.title,
    outputPath,
    duration:   timeline.totalDuration,
    scenes:     timeline.scenes.length,
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(
    join(epDir, 'episode-manifest.json'),
    JSON.stringify(result, null, 2), 'utf8'
  );

  logger.info('[OK] Episode ready', {
    episode:  screenplay.episode,
    duration: `${Math.round(timeline.totalDuration / 60)}min`,
    path:     outputPath,
  });

  return result;
}

// ════════════════════════════════════════════
// بناء الجدول الزمني
// ════════════════════════════════════════════
function buildTimeline(screenplay, visualManifest, audioManifest) {
  const scenes = [];
  let totalDuration = 0;

  for (const vScene of visualManifest.scenes) {
    const sceneAudio  = audioManifest.audioFiles.filter(a => a.sceneId === vScene.id);
    const audioDur    = sceneAudio.reduce((s, a) => s + (a.duration || 3), 0);
    const sceneDur    = Math.max(vScene.duration || 30, audioDur + 2);

    scenes.push({
      id:        vScene.id,
      imagePath: vScene.imagePath || FALLBACK_IMG,
      duration:  sceneDur,
      audio:     sceneAudio.filter(a => a.file && existsSync(a.file)),
      music:     vScene.music || '',
    });

    totalDuration += sceneDur;
  }

  return { scenes, totalDuration };
}

// ════════════════════════════════════════════
// بناء مقطع واحد
// ════════════════════════════════════════════
function buildSegment(scene, outputPath) {
  return new Promise((resolve, reject) => {
    const img = existsSync(scene.imagePath) ? scene.imagePath : FALLBACK_IMG;

    let cmd = ffmpeg()
      .input(img)
      .inputOptions(['-loop 1', `-t ${scene.duration}`]);

    // إضافة ملفات الصوت
    if (scene.audio.length > 0) {
      for (const a of scene.audio) cmd = cmd.input(a.file);
    } else {
      // صمت
      cmd = cmd.input('anullsrc=r=44100:cl=stereo').inputFormat('lavfi');
    }

    // فلاتر الفيديو
    const vf = [
      'scale=1920:1080:force_original_aspect_ratio=decrease',
      'pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
      'setsar=1',
    ].join(',');

    // دمج الصوت إذا متعدد
    let audioFilter = '';
    if (scene.audio.length > 1) {
      const inputs = scene.audio.map((_, i) => `[${i+1}:a]`).join('');
      audioFilter  = `${inputs}concat=n=${scene.audio.length}:v=0:a=1[aout]`;
    }

    cmd
      .outputOptions([
        '-c:v libx264',
        '-preset fast',
        '-crf 23',
        '-c:a aac',
        '-b:a 128k',
        `-t ${scene.duration}`,
        '-pix_fmt yuv420p',
        '-r 25',
      ])
      .videoFilters(vf);

    if (audioFilter) {
      cmd.complexFilter(audioFilter).outputOptions(['-map 0:v', '-map [aout]']);
    }

    cmd
      .output(outputPath)
      .on('end',   () => { logger.debug(`[EDIT] Segment: ${scene.id}`); resolve(); })
      .on('error', (err) => { logger.error(`[EDIT] Segment failed: ${scene.id}`, { error: err.message }); reject(err); })
      .run();
  });
}

// ════════════════════════════════════════════
// دمج المقاطع
// ════════════════════════════════════════════
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

// ════════════════════════════════════════════
// مزج الموسيقى الخلفية
// ════════════════════════════════════════════
function mixWithMusic(videoPath, musicPath, outputPath, musicVolume = 0.15) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(musicPath)
      .complexFilter([
        `[1:a]volume=${musicVolume},aloop=loop=-1:size=2e+09[bg]`,
        `[0:a][bg]amix=inputs=2:duration=first[aout]`,
      ])
      .outputOptions([
        '-map 0:v',
        '-map [aout]',
        '-c:v copy',
        '-c:a aac',
        '-b:a 192k',
      ])
      .output(outputPath)
      .on('end',   resolve)
      .on('error', reject)
      .run();
  });
}
