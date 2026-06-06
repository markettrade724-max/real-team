/**
 * subtitle-agent.js — v1.1
 *
 * التغييرات عن v1.0:
 *  - buildBurnScript محذوف (bash — rule-126)
 *  - buildTimeline يعمل من audioManifest مباشرة
 *  - visualManifest اختياري — لا crash عند غيابه
 *  - run() يستلم (screenplay, audioManifest) فقط
 *
 * لا يستهلك Gemini — rule-137
 * القواعد المطبقة:
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-126 : لا bash scripts
 *  rule-137 : subtitle-agent لا يستهلك Gemini
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname }            from 'path';
import { fileURLToPath }            from 'url';
import { logger }                   from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ══════════════════════════════════════════════════════════
// الدالة الرئيسية — sync
// ══════════════════════════════════════════════════════════
export function run(screenplay, audioManifest) {
  logger.info('[SUBTITLE] Generating subtitles', { episode: screenplay.episode });

  if (!audioManifest?.audioFiles?.length) {
    logger.warn('[SUBTITLE] No audio manifest — skipping');
    return { arSRT: null, enSRT: null, vtt: null, lines: 0 };
  }

  const outDir = join(__dirname, '..', 'episodes', `ep${screenplay.episode}`, 'output');
  mkdirSync(outDir, { recursive: true });

  // بناء الجدول الزمني من audioManifest مباشرة
  const timeline = buildTimeline(audioManifest);

  // SRT عربي
  const arSRT = generateSRT(timeline, 'ar');
  writeFileSync(join(outDir, 'episode-ar.srt'), arSRT, 'utf8');

  // SRT إنجليزي
  const enSRT = generateSRT(timeline, 'en');
  writeFileSync(join(outDir, 'episode-en.srt'), enSRT, 'utf8');

  // WebVTT
  const vtt = generateVTT(timeline);
  writeFileSync(join(outDir, 'episode.vtt'), vtt, 'utf8');

  logger.info('[OK] Subtitles generated', {
    lines: timeline.length,
    files: ['episode-ar.srt', 'episode-en.srt', 'episode.vtt'],
  });

  return {
    arSRT: join(outDir, 'episode-ar.srt'),
    enSRT: join(outDir, 'episode-en.srt'),
    vtt:   join(outDir, 'episode.vtt'),
    lines: timeline.length,
  };
}

// ══════════════════════════════════════════════════════════
// بناء الجدول الزمني من audioManifest
// ══════════════════════════════════════════════════════════
function buildTimeline(audioManifest) {
  const timeline  = [];
  let currentTime = 0;

  // ترتيب: narrator أولاً ثم dialogue بالترتيب
  const sorted = [...audioManifest.audioFiles].sort((a, b) => {
    if (a.sceneId !== b.sceneId) return a.sceneId.localeCompare(b.sceneId);
    if (a.type === 'narrator') return -1;
    if (b.type === 'narrator') return 1;
    return 0;
  });

  let lastSceneId = null;

  for (const audio of sorted) {
    // هامش بين المشاهد
    if (lastSceneId && audio.sceneId !== lastSceneId) {
      currentTime += 1;
    }
    lastSceneId = audio.sceneId;

    const dur = audio.duration || estimateDuration(audio.text);

    timeline.push({
      index:     timeline.length + 1,
      start:     currentTime,
      end:       currentTime + dur,
      text:      audio.text || '',
      character: audio.character || 'راوٍ',
      type:      audio.type,
      sceneId:   audio.sceneId,
    });

    currentTime += dur + 0.3; // 300ms بين الجمل
  }

  return timeline;
}

// ══════════════════════════════════════════════════════════
// توليد SRT
// ══════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════
// توليد WebVTT
// ══════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════
// دوال مساعدة
// ══════════════════════════════════════════════════════════
function formatArabicLine(entry) {
  if (entry.type === 'narrator') return `♪ ${entry.text}`;
  return `${entry.character}: ${entry.text}`;
}

function formatTime(seconds) {
  const h  = Math.floor(seconds / 3600);
  const m  = Math.floor((seconds % 3600) / 60);
  const s  = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${padMs(ms)}`;
}

function formatTimeVTT(seconds) {
  return formatTime(seconds).replace(',', '.');
}

function pad(n)   { return String(n).padStart(2, '0'); }
function padMs(n) { return String(n).padStart(3, '0'); }

function estimateDuration(text) {
  return Math.max(1.5, (text || '').split(/\s+/).length / 2.5);
}

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
