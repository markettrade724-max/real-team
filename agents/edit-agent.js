/**
 * edit-agent.js
 * يجمع الصور + الصوت + الموسيقى → mp4 كامل
 * عبر ffmpeg (يعمل headless بدون GPU)
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname }  from 'path';
import { fileURLToPath }  from 'url';
import { execSync }       from 'child_process';
import { logger }         from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// موسيقى افتراضية من المكتبة (ملفات mp3 محلية)
const MUSIC_LIBRARY = join(__dirname, '..', 'assets', 'music');

export async function run(screenplay, visualManifest, audioManifest) {
  logger.info('[EDIT] Starting video assembly', { episode: screenplay.episode });

  const epDir  = join(__dirname, '..', 'episodes', `ep${screenplay.episode}`);
  const outDir = join(epDir, 'output');
  mkdirSync(outDir, { recursive: true });

  const outputPath = join(outDir, `episode-${screenplay.episode}.mp4`);

  // بناء قائمة المشاهد مرتبة
  const timeline = buildTimeline(screenplay, visualManifest, audioManifest);

  // كتابة script ffmpeg
  const ffmpegScript = buildFFmpegScript(timeline, outputPath, epDir, screenplay);
  const scriptPath   = join(epDir, 'ffmpeg-script.sh');
  writeFileSync(scriptPath, ffmpegScript, 'utf8');

  // تنفيذ ffmpeg
  try {
    execSync(`bash "${scriptPath}"`, { stdio: 'pipe', timeout: 300000 }); // 5 دقائق max
    logger.info('[OK] Video assembled', { output: outputPath });
  } catch (err) {
    logger.error('[EDIT] ffmpeg failed', { error: err.message.slice(0, 200) });
    throw new Error('edit-agent: ffmpeg failed');
  }

  // manifest النهائي
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

// ── بناء الجدول الزمني ───────────────────
function buildTimeline(screenplay, visualManifest, audioManifest) {
  const scenes = [];
  let totalDuration = 0;

  for (const vScene of visualManifest.scenes) {
    // الصوت المرتبط بهذا المشهد
    const sceneAudio = audioManifest.audioFiles.filter(a => a.sceneId === vScene.id);

    // مدة المشهد = مدة الحوار + مدة الراوي + هامش
    const audioDuration = sceneAudio.reduce((s, a) => s + (a.duration || 3), 0);
    const sceneDuration = Math.max(vScene.duration || 30, audioDuration + 2);

    scenes.push({
      id:        vScene.id,
      imagePath: vScene.imagePath,
      duration:  sceneDuration,
      audio:     sceneAudio,
      sfx:       vScene.sfx,
      music:     vScene.music,
    });

    totalDuration += sceneDuration;
  }

  return { scenes, totalDuration };
}

// ── بناء script ffmpeg ────────────────────
function buildFFmpegScript(timeline, outputPath, epDir, screenplay) {
  const lines = ['#!/bin/bash', 'set -e', ''];

  // الخطوة 1: كل مشهد → مقطع فيديو قصير
  const segmentPaths = [];

  for (const scene of timeline.scenes) {
    const segPath = join(epDir, 'segments', `${scene.id}.mp4`);
    segmentPaths.push(segPath);

    // إذا الصورة موجودة
    const img = scene.imagePath || join(__dirname, '..', 'assets', 'fallback.png');

    // بناء track الصوت للمشهد
    const audioInputs  = scene.audio.map(a => a.file).filter(existsSync);
    const audioConcat  = audioInputs.length > 0
      ? buildAudioConcat(audioInputs, scene.duration)
      : buildSilence(scene.duration);

    lines.push(`mkdir -p "${join(epDir, 'segments')}"`);
    lines.push(`# مشهد ${scene.id} — ${scene.duration}s`);
    lines.push([
      'ffmpeg -y',
      `-loop 1 -t ${scene.duration} -i "${img}"`,   // صورة ثابتة → فيديو
      audioConcat,
      `-vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1"`,
      `-c:v libx264 -preset fast -crf 23`,
      `-c:a aac -b:a 128k`,
      `-t ${scene.duration}`,
      `-pix_fmt yuv420p`,
      `"${segPath}"`,
    ].join(' \\\n  '));
    lines.push('');
  }

  // الخطوة 2: دمج المقاطع
  const concatList = join(epDir, 'concat.txt');
  lines.push(`# بناء قائمة الدمج`);
  lines.push(`cat > "${concatList}" << 'EOF'`);
  for (const seg of segmentPaths) {
    lines.push(`file '${seg}'`);
  }
  lines.push('EOF');
  lines.push('');

  // الخطوة 3: إضافة موسيقى خلفية
  const bgMusic = join(MUSIC_LIBRARY, 'ambient.mp3');
  const hasBGMusic = existsSync(bgMusic);

  if (hasBGMusic) {
    const tempPath = join(epDir, 'output', 'temp-no-music.mp4');
    lines.push(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${tempPath}"`);
    lines.push('');
    lines.push([
      'ffmpeg -y',
      `-i "${tempPath}"`,
      `-stream_loop -1 -i "${bgMusic}"`,
      `-filter_complex "[1:a]volume=0.15[bg];[0:a][bg]amix=inputs=2:duration=first[aout]"`,
      `-map 0:v -map "[aout]"`,
      `-c:v copy -c:a aac -b:a 192k`,
      `"${outputPath}"`,
    ].join(' \\\n  '));
  } else {
    lines.push(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${outputPath}"`);
  }

  lines.push('');
  lines.push(`echo "[EDIT] Episode ${screenplay.episode} done: ${outputPath}"`);

  return lines.join('\n');
}

// ── دمج ملفات الصوت للمشهد ───────────────
function buildAudioConcat(audioFiles, duration) {
  if (audioFiles.length === 1) {
    return `-i "${audioFiles[0]}"`;
  }
  // دمج ملفات متعددة بشكل متسلسل
  const inputs = audioFiles.map(f => `-i "${f}"`).join(' ');
  const filter = audioFiles.map((_, i) => `[${i+1}:a]`).join('') +
    `concat=n=${audioFiles.length}:v=0:a=1[aout]`;
  return `${inputs} -filter_complex "${filter}" -map "[aout]"`;
}

// ── صمت إذا لا يوجد صوت ──────────────────
function buildSilence(duration) {
  return `-f lavfi -i anullsrc=r=44100:cl=stereo -t ${duration}`;
}
