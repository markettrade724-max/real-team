/**
 * trailer-agent.js
 * يقطع مشهداً مشوقاً 60 ثانية من كل حلقة
 * للنشر على تيك توك + إنستغرام ريلز + يوتيوب شورتس
 *
 * المنطق:
 * - يختار أفضل 3 مشاهد من الحلقة (توتر عالي + صورة قوية)
 * - يرتبها: hook (5s) → peak (40s) → cliffhanger (15s)
 * - يضيف نص علوي وسفلي
 * - يضيف موسيقى من المكتبة
 * - يولد mp4 عمودي 9:16
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname }  from 'path';
import { fileURLToPath }  from 'url';
import { execSync }       from 'child_process';
import { logger }         from '../logger.js';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const MUSIC_LIB    = join(__dirname, '..', 'assets', 'music');
const FONTS_DIR    = join(__dirname, '..', 'assets', 'fonts');
const TRAILER_DUR  = 60; // ثانية

export async function run(screenplay, visualManifest, audioManifest, episodeManifest) {
  logger.info('[TRAILER] Building trailer', { episode: screenplay.episode });

  const outDir = join(__dirname, '..', 'episodes', `ep${screenplay.episode}`, 'output');
  mkdirSync(outDir, { recursive: true });

  const outputPath = join(outDir, 'trailer.mp4');

  if (existsSync(outputPath)) {
    logger.info('[TRAILER] Already exists — skipping');
    return { outputPath, duration: TRAILER_DUR };
  }

  // ── اختيار أفضل المشاهد ─────────────
  const selectedScenes = selectBestScenes(screenplay, visualManifest);
  if (!selectedScenes.length) {
    logger.warn('[TRAILER] No suitable scenes found');
    return null;
  }

  // ── بناء script ffmpeg ───────────────
  const epDir      = join(__dirname, '..', 'episodes', `ep${screenplay.episode}`);
  const scriptPath = join(epDir, 'trailer-script.sh');
  const script     = buildTrailerScript(
    selectedScenes, audioManifest, screenplay, outputPath, epDir
  );
  writeFileSync(scriptPath, script, 'utf8');

  // ── تنفيذ ────────────────────────────
  try {
    execSync(`bash "${scriptPath}"`, { stdio: 'pipe', timeout: 120000 });
    logger.info('[OK] Trailer ready', { path: outputPath });
  } catch (err) {
    logger.error('[TRAILER] ffmpeg failed', { error: err.message.slice(0, 200) });
    throw new Error('trailer-agent: ffmpeg failed');
  }

  const result = {
    episode:    screenplay.episode,
    outputPath,
    duration:   TRAILER_DUR,
    scenes:     selectedScenes.map(s => s.id),
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(
    join(epDir, 'trailer-manifest.json'),
    JSON.stringify(result, null, 2), 'utf8'
  );

  return result;
}

// ════════════════════════════════════════════
// اختيار أفضل المشاهد للتريلر
// ════════════════════════════════════════════
function selectBestScenes(screenplay, visualManifest) {
  const allScenes = screenplay.acts.flatMap(a => a.scenes);

  // تقييم كل مشهد
  const scored = allScenes.map(scene => {
    const visual = visualManifest.scenes.find(v => v.id === scene.id);
    if (!visual?.imagePath || !existsSync(visual.imagePath)) return null;

    let score = 0;

    // التوتر العاطفي
    const moodScores = { 'توتر': 5, 'خوف': 4, 'حماس': 4, 'حزن': 3, 'أمل': 2, 'هدوء': 1 };
    score += moodScores[scene.mood] || 1;

    // الحوار الدرامي
    if (scene.dialogue?.length > 0) score += 2;

    // موقع الحلقة — المشاهد الأخيرة أكثر توتراً
    const actIndex = screenplay.acts.findIndex(a => a.scenes.includes(scene));
    if (actIndex === screenplay.acts.length - 1) score += 3; // الفصل الأخير

    // الـ cliffhanger — آخر مشهد
    const lastScene = allScenes[allScenes.length - 1];
    if (scene.id === lastScene.id) score += 5;

    return { ...scene, imagePath: visual.imagePath, score };
  }).filter(Boolean);

  // ترتيب بالنتيجة
  scored.sort((a, b) => b.score - a.score);

  // اختيار 3 مشاهد: أول مشهد (hook) + أفضل مشهد + آخر مشهد (cliffhanger)
  const hook        = allScenes[0];
  const hookVisual  = visualManifest.scenes.find(v => v.id === hook.id);
  const peak        = scored[0];
  const cliffhanger = scored.find(s => s.id === allScenes[allScenes.length - 1].id) || scored[1];

  const selected = [];

  if (hookVisual?.imagePath && existsSync(hookVisual.imagePath)) {
    selected.push({ ...hook, imagePath: hookVisual.imagePath, duration: 5,  role: 'hook' });
  }
  if (peak && peak.id !== hook.id) {
    selected.push({ ...peak, duration: 40, role: 'peak' });
  }
  if (cliffhanger && cliffhanger.id !== peak?.id) {
    selected.push({ ...cliffhanger, duration: 15, role: 'cliffhanger' });
  }

  // تعديل المدة لتصل 60 ثانية
  const total = selected.reduce((s, sc) => s + sc.duration, 0);
  if (total < TRAILER_DUR && selected.length > 0) {
    selected[1 % selected.length].duration += TRAILER_DUR - total;
  }

  logger.info('[TRAILER] Scenes selected', {
    hook:        selected.find(s => s.role === 'hook')?.id,
    peak:        selected.find(s => s.role === 'peak')?.id,
    cliffhanger: selected.find(s => s.role === 'cliffhanger')?.id,
  });

  return selected;
}

// ════════════════════════════════════════════
// بناء script ffmpeg للتريلر
// ════════════════════════════════════════════
function buildTrailerScript(scenes, audioManifest, screenplay, outputPath, epDir) {
  const lines = ['#!/bin/bash', 'set -e', ''];
  const segDir = join(epDir, 'trailer-segments');
  lines.push(`mkdir -p "${segDir}"`);
  lines.push('');

  const segPaths = [];

  for (const scene of scenes) {
    const segPath = join(segDir, `${scene.role}.mp4`);
    segPaths.push(segPath);

    // صوت المشهد
    const sceneAudio = audioManifest.audioFiles
      .filter(a => a.sceneId === scene.id && existsSync(a.file));

    const audioInput = sceneAudio.length > 0
      ? `-i "${sceneAudio[0].file}"`
      : `-f lavfi -i anullsrc=r=44100:cl=stereo`;

    // نص العنوان للمشهد
    const overlayText = buildOverlayText(scene, screenplay);

    // فلتر الفيديو — 9:16 عمودي مع crop ذكي
    const vf = [
      'scale=1080:1920:force_original_aspect_ratio=increase',
      'crop=1080:1920',
      'setsar=1',
      // تأثير Ken Burns — تكبير بطيء
      scene.role === 'peak'
        ? `zoompan=z='min(zoom+0.0005,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${scene.duration * 25}:s=1080x1920`
        : '',
      // نص علوي — اسم المسلسل
      `drawtext=text='${escapeText(screenplay.title || 'المسلسل')}':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=80:shadowcolor=black:shadowx=2:shadowy=2`,
      // نص سفلي — الحلقة
      scene.role === 'cliffhanger'
        ? `drawtext=text='${escapeText(screenplay.cliffhanger?.slice(0, 40) || '')}':fontcolor=yellow:fontsize=28:x=(w-text_w)/2:y=h-120:shadowcolor=black:shadowx=2:shadowy=2`
        : `drawtext=text='الحلقة ${screenplay.episode}':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=h-100:shadowcolor=black:shadowx=2:shadowy=2`,
      // fade in/out
      `fade=t=in:st=0:d=0.5`,
      `fade=t=out:st=${scene.duration - 0.5}:d=0.5`,
    ].filter(Boolean).join(',');

    lines.push(`# مقطع ${scene.role} — ${scene.duration}s`);
    lines.push([
      'ffmpeg -y',
      `-loop 1 -t ${scene.duration} -i "${scene.imagePath}"`,
      audioInput,
      `-vf "${vf}"`,
      `-c:v libx264 -preset fast -crf 20`,
      `-c:a aac -b:a 128k`,
      `-t ${scene.duration}`,
      `-pix_fmt yuv420p`,
      `-r 25`,
      `"${segPath}"`,
    ].join(' \\\n  '));
    lines.push('');
  }

  // دمج المقاطع
  const concatList = join(epDir, 'trailer-concat.txt');
  lines.push(`cat > "${concatList}" << 'EOF'`);
  for (const seg of segPaths) lines.push(`file '${seg}'`);
  lines.push('EOF');
  lines.push('');

  // إضافة موسيقى خلفية درامية
  const bgMusic = join(MUSIC_LIB, 'dramatic.mp3');
  const tempPath = join(epDir, 'output', 'trailer-temp.mp4');

  lines.push(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${tempPath}"`);
  lines.push('');

  if (existsSync(bgMusic)) {
    lines.push([
      'ffmpeg -y',
      `-i "${tempPath}"`,
      `-stream_loop -1 -i "${bgMusic}"`,
      `-filter_complex "[1:a]volume=0.3[bg];[0:a][bg]amix=inputs=2:duration=first[aout]"`,
      `-map 0:v -map "[aout]"`,
      `-c:v copy -c:a aac -b:a 192k`,
      `-t ${TRAILER_DUR}`,
      `"${outputPath}"`,
    ].join(' \\\n  '));
  } else {
    lines.push(`cp "${tempPath}" "${outputPath}"`);
  }

  lines.push('');
  lines.push(`echo "[TRAILER] Done: ${outputPath}"`);

  return lines.join('\n');
}

// ── نص على الفيديو ───────────────────────
function buildOverlayText(scene, screenplay) {
  const roleText = {
    hook:        `🎬 ${screenplay.title || 'المسلسل'}`,
    peak:        `الحلقة ${screenplay.episode}`,
    cliffhanger: screenplay.cliffhanger?.slice(0, 35) || '...',
  };
  return roleText[scene.role] || '';
}

function escapeText(text) {
  return (text || '')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}
