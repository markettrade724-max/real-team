/**
 * subtitle-agent.js
 * يولد ترجمة SRT عربية + إنجليزية لكل حلقة
 * بدون Gemini — من audioManifest مباشرة
 *
 * المخرجات:
 * - episode-ar.srt  — عربي
 * - episode-en.srt  — إنجليزي (ترجمة بسيطة)
 * - episode.vtt     — WebVTT للمشغلات الحديثة
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname }            from 'path';
import { fileURLToPath }            from 'url';
import { logger }                   from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function run(screenplay, audioManifest, visualManifest) {
  logger.info('[SUBTITLE] Generating subtitles', { episode: screenplay.episode });

  const outDir = join(__dirname, '..', 'episodes', `ep${screenplay.episode}`, 'output');
  mkdirSync(outDir, { recursive: true });

  // بناء الجدول الزمني من audioManifest
  const timeline = buildTimeline(audioManifest, visualManifest);

  // توليد SRT عربي
  const arSRT = generateSRT(timeline, 'ar');
  writeFileSync(join(outDir, 'episode-ar.srt'), arSRT, 'utf8');

  // توليد SRT إنجليزي (transliteration بسيطة)
  const enSRT = generateSRT(timeline, 'en');
  writeFileSync(join(outDir, 'episode-en.srt'), enSRT, 'utf8');

  // توليد WebVTT
  const vtt = generateVTT(timeline);
  writeFileSync(join(outDir, 'episode.vtt'), vtt, 'utf8');

  // حرق الترجمة في الفيديو — نسخة مع ترجمة
  const burnScript = buildBurnScript(screenplay, outDir);
  writeFileSync(join(outDir, 'burn-subtitles.sh'), burnScript, 'utf8');

  logger.info('[OK] Subtitles generated', {
    lines: timeline.length,
    files: ['episode-ar.srt', 'episode-en.srt', 'episode.vtt'],
  });

  return {
    arSRT:  join(outDir, 'episode-ar.srt'),
    enSRT:  join(outDir, 'episode-en.srt'),
    vtt:    join(outDir, 'episode.vtt'),
    lines:  timeline.length,
  };
}

// ════════════════════════════════════════════
// بناء الجدول الزمني
// ════════════════════════════════════════════
function buildTimeline(audioManifest, visualManifest) {
  const timeline = [];
  let currentTime = 0;

  // ترتيب المشاهد حسب البصري
  for (const vScene of visualManifest.scenes) {
    const sceneAudio = audioManifest.audioFiles
      .filter(a => a.sceneId === vScene.id)
      .sort((a, b) => {
        // الراوي أولاً ثم الحوار بالترتيب
        if (a.type === 'narrator') return -1;
        if (b.type === 'narrator') return 1;
        return 0;
      });

    for (const audio of sceneAudio) {
      const dur = audio.duration || estimateDuration(audio.text);

      timeline.push({
        index:     timeline.length + 1,
        start:     currentTime,
        end:       currentTime + dur,
        text:      audio.text,
        character: audio.character || 'راوٍ',
        type:      audio.type,
        sceneId:   vScene.id,
      });

      currentTime += dur + 0.3; // هامش 300ms بين الجمل
    }

    // هامش بين المشاهد
    currentTime += 1;
  }

  return timeline;
}

// ════════════════════════════════════════════
// توليد SRT
// ════════════════════════════════════════════
function generateSRT(timeline, lang) {
  const lines = [];

  for (const entry of timeline) {
    const text = lang === 'en'
      ? transliterate(entry.text)
      : formatArabicLine(entry);

    lines.push(entry.index);
    lines.push(`${formatTime(entry.start)} --> ${formatTime(entry.end)}`);
    lines.push(text);
    lines.push('');
  }

  return lines.join('\n');
}

// ════════════════════════════════════════════
// توليد WebVTT
// ════════════════════════════════════════════
function generateVTT(timeline) {
  const lines = ['WEBVTT', ''];

  for (const entry of timeline) {
    lines.push(`${entry.index}`);
    lines.push(`${formatTimeVTT(entry.start)} --> ${formatTimeVTT(entry.end)} align:center`);
    lines.push(formatArabicLine(entry));
    lines.push('');
  }

  return lines.join('\n');
}

// ════════════════════════════════════════════
// حرق الترجمة في الفيديو
// ════════════════════════════════════════════
function buildBurnScript(screenplay, outDir) {
  const inputPath  = join(outDir, `episode-${screenplay.episode}.mp4`);
  const outputPath = join(outDir, `episode-${screenplay.episode}-subtitled.mp4`);
  const srtPath    = join(outDir, 'episode-ar.srt');

  return [
    '#!/bin/bash',
    'set -e',
    '',
    '# حرق الترجمة العربية في الفيديو',
    `ffmpeg -y \\`,
    `  -i "${inputPath}" \\`,
    `  -vf "subtitles='${srtPath}':force_style='FontName=Arial,FontSize=24,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=2,Alignment=2'" \\`,
    `  -c:a copy \\`,
    `  "${outputPath}"`,
    '',
    `echo "[SUBTITLE] Done: ${outputPath}"`,
  ].join('\n');
}

// ════════════════════════════════════════════
// دوال مساعدة
// ════════════════════════════════════════════
function formatArabicLine(entry) {
  if (entry.type === 'narrator') return `♪ ${entry.text}`;
  return `${entry.character}: ${entry.text}`;
}

function formatTime(seconds) {
  const h   = Math.floor(seconds / 3600);
  const m   = Math.floor((seconds % 3600) / 60);
  const s   = Math.floor(seconds % 60);
  const ms  = Math.round((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${padMs(ms)}`;
}

function formatTimeVTT(seconds) {
  return formatTime(seconds).replace(',', '.');
}

function pad(n)   { return String(n).padStart(2, '0'); }
function padMs(n) { return String(n).padStart(3, '0'); }

function estimateDuration(text) {
  return Math.max(1.5, (text || '').split(/\s+/).length / 3);
}

// transliteration عربي → إنجليزي بسيط
function transliterate(text) {
  const map = {
    'أ':'a','ب':'b','ت':'t','ث':'th','ج':'j','ح':'h','خ':'kh',
    'د':'d','ذ':'dh','ر':'r','ز':'z','س':'s','ش':'sh','ص':'s',
    'ض':'d','ط':'t','ظ':'z','ع':'\'','غ':'gh','ف':'f','ق':'q',
    'ك':'k','ل':'l','م':'m','ن':'n','ه':'h','و':'w','ي':'y',
    'ا':'a','ة':'a','ى':'a','ء':'\'',
    ' ':' ','،':',','؟':'?','!':'!','.':'.',
  };
  return text.split('').map(c => map[c] || c).join('');
}
