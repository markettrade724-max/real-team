/**
 * edit-agent.js — v2.3
 *
 * Changes from v2.2:
 *  - burnSubtitles() — real subtitle burn-in via ffmpeg subtitles filter (rule-184 finally implemented)
 *  - run() now routes: concat → mix music → burn subtitles → final output
 *  - Requires: assets/fonts/Roboto-Regular.ttf in repo (Apache 2.0, get from Google Fonts)
 *  - Fallback: if no .srt file or font missing, copies without burn-in (no crash)
 */

import { writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname }                                       from 'path';
import { fileURLToPath }                                       from 'url';
import ffmpeg                                                  from 'fluent-ffmpeg';
import ffmpegInstaller                                         from '@ffmpeg-installer/ffmpeg';
import { logger }                                              from '../logger.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __dirname    = dirname(fileURLToPath(import.meta.url));
const MUSIC_LIB    = join(__dirname, '..', 'assets', 'music');
const FALLBACK_IMG = join(__dirname, '..', 'assets', 'fallback.png');
const FONTS_DIR    = join(__dirname, '..', 'assets', 'fonts');

// ── Main ──────────────────────────────────────────────────
export async function run(screenplay, visualManifest, audioManifest, subtitles = null, music = null) {
  logger.info('[EDIT] Assembling video', { episode: screenplay.episode });

  const epDir  = join(__dirname, '..', 'episodes', `ep${screenplay.episode}`);
  const outDir = join(epDir, 'output');
  const segDir = join(epDir, 'segments');
  mkdirSync(outDir, { recursive: true });
  mkdirSync(segDir, { recursive: true });

  const outputPath = join(outDir, `episode-${screenplay.episode}.mp4`);
  const timeline   = buildTimeline(screenplay, visualManifest, audioManifest);

  // 1 — Build scene segments
  const segPaths = [];
  for (const scene of timeline.scenes) {
    const segPath = join(segDir, `${scene.id}.mp4`);
    segPaths.push(segPath);
    if (!existsSync(segPath)) {
      await buildSegment(scene, segPath);
      logger.info(`[EDIT] Segment done: ${scene.id}`);
    }
  }

  if (segPaths.length === 0) throw new Error('No segments built — cannot assemble episode');

  // 2 — Concatenate segments
  const concatPath = join(epDir, 'concat.txt');
  writeFileSync(
    concatPath,
    segPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'),
    'utf8'
  );
  const tempPath  = join(outDir, 'temp_raw.mp4');
  await concatSegments(concatPath, tempPath);

  // 3 — Mix background music
  const bgMusic  = resolveMusicPath(music);
  const mixedPath = join(outDir, 'temp_mixed.mp4');

  if (bgMusic && existsSync(bgMusic)) {
    await mixWithMusic(tempPath, bgMusic, mixedPath, 0.15);
    logger.info('[EDIT] Background music mixed');
  } else {
    copyFileSync(tempPath, mixedPath);
    logger.info('[EDIT] No background music — using direct audio');
  }

  // 4 — Burn subtitles (rule-184 — real implementation)
  const srtPath = subtitles?.enSRT && existsSync(subtitles.enSRT) ? subtitles.enSRT : null;
  const fontPath = join(FONTS_DIR, 'Roboto-Regular.ttf');
  const fontAvailable = existsSync(fontPath);

  if (srtPath && fontAvailable) {
    await burnSubtitles(mixedPath, srtPath, outputPath);
    logger.info('[EDIT] Subtitles burned in', { srt: srtPath });
  } else {
    copyFileSync(mixedPath, outputPath);
    if (!srtPath) logger.info('[EDIT] No subtitles — output without burn-in');
    else logger.warn('[EDIT] Font missing — output without burn-in. Add assets/fonts/Roboto-Regular.ttf');
  }

  const result = {
    episode:     screenplay.episode,
    title:       screenplay.title,
    outputPath,
    duration:    timeline.totalDuration,
    scenes:      timeline.scenes.length,
    subtitles:   subtitles || null,
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

// ── Subtitle burn-in via ffmpeg subtitles filter ──────────
// Requires: Roboto-Regular.ttf in assets/fonts/ (Apache 2.0 — google fonts)
function burnSubtitles(inputPath, srtPath, outputPath) {
  return new Promise((resolve, reject) => {
    // Escape colons in paths for ffmpeg filter syntax (Windows C:\ issue)
    const escapedSrt  = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    const escapedFont = FONTS_DIR.replace(/\\/g, '/').replace(/:/g, '\\:');

    const filter =
      `subtitles=filename='${escapedSrt}':fontsdir='${escapedFont}':` +
      `force_style='FontName=Roboto,FontSize=22,PrimaryColour=&HFFFFFF&,` +
      `OutlineColour=&H000000&,BorderStyle=1,Outline=2,Shadow=0'`;

    ffmpeg()
      .input(inputPath)
      .videoFilters(filter)
      .outputOptions(['-c:a copy', '-c:v libx264', '-preset fast', '-crf 20'])
      .output(outputPath)
      .on('end', resolve)
      .on('error', (err) => {
        logger.error('[EDIT] Subtitle burn-in failed', { error: err.message });
        reject(err);
      })
      .run();
  });
}

// ── Resolve music path ────────────────────────────────────
function resolveMusicPath(music) {
  if (music?.path && existsSync(music.path)) return music.path;
  if (music?.file && existsSync(music.file)) return music.file;
  const ambient = join(MUSIC_LIB, 'ambient.mp3');
  if (existsSync(ambient)) return ambient;
  return null;
}

// ── Build timeline ────────────────────────────────────────
function buildTimeline(screenplay, visualManifest, audioManifest) {
  const scenes        = [];
  let   totalDuration = 0;

  for (const vScene of (visualManifest?.scenes || [])) {
    const sceneAudio = (audioManifest?.audioFiles || [])
      .filter(a => a.sceneId === vScene.id);
    const audioDur   = sceneAudio.reduce((s, a) => s + (a.duration || 3), 0);
    const sceneDur   = Math.max(vScene.duration || 30, audioDur + 2);

    scenes.push({
      id:        vScene.id,
      imagePath: vScene.imagePath || FALLBACK_IMG,
      duration:  sceneDur,
      audio:     sceneAudio.filter(a => a.file && existsSync(a.file)),
    });

    totalDuration += sceneDur;
  }

  return { scenes, totalDuration };
}

// ── Build one scene segment ───────────────────────────────
function buildSegment(scene, outputPath) {
  return new Promise((resolve, reject) => {
    const img = existsSync(scene.imagePath) ? scene.imagePath : FALLBACK_IMG;

    const vf = [
      'scale=1920:1080:force_original_aspect_ratio=decrease',
      'pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
      'setsar=1',
    ].join(',');

    const baseOpts = [
      '-c:v libx264', '-preset fast', '-crf 23',
      '-c:a aac', '-b:a 128k',
      `-t ${scene.duration}`, '-pix_fmt yuv420p', '-r 25',
    ];

    let cmd = ffmpeg()
      .input(img)
      .inputOptions(['-loop 1', `-t ${scene.duration}`])
      .videoFilters(vf);

    if (scene.audio.length === 0) {
      cmd = cmd
        .input('anullsrc=r=44100:cl=stereo')
        .inputFormat('lavfi')
        .outputOptions([...baseOpts, '-map 0:v', '-map 1:a']);
    } else if (scene.audio.length === 1) {
      cmd = cmd
        .input(scene.audio[0].file)
        .outputOptions([...baseOpts, '-map 0:v', '-map 1:a']);
    } else {
      for (const a of scene.audio) cmd = cmd.input(a.file);
      const inputs      = scene.audio.map((_, i) => `[${i + 1}:a]`).join('');
      const audioFilter = `${inputs}concat=n=${scene.audio.length}:v=0:a=1[aout]`;
      cmd = cmd
        .complexFilter(audioFilter)
        .outputOptions([...baseOpts, '-map 0:v', '-map [aout]']);
    }

    cmd
      .output(outputPath)
      .on('end', resolve)
      .on('error', (err) => {
        logger.error(`[EDIT] Segment failed: ${scene.id}`, { error: err.message });
        reject(err);
      })
      .run();
  });
}

// ── Concatenate segments ──────────────────────────────────
function concatSegments(concatPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy'])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

// ── Mix background music ──────────────────────────────────
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
        '-map 0:v', '-map [aout]',
        '-c:v copy', '-c:a aac', '-b:a 192k',
      ])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}
