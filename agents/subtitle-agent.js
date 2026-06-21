/**
 * subtitle-agent.js — v1.2
 *
 * التغييرات عن v1.1:
 *  - الترجمة الأساسية إنجليزية (لا transliteration) — السيناريو نفسه بالإنجليزية الآن
 *  - إضافة ترجمة فرنسية (fr) بقاموس مصطلحات بسيط — بدون Gemini (rule-137)
 *  - formatLine بدل formatArabicLine — يدعم en/fr بنفس البنية
 *  - الناتج: episode-en.srt + episode-fr.srt + episode.vtt
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
    return { enSRT: null, frSRT: null, vtt: null, lines: 0 };
  }

  const outDir = join(__dirname, '..', 'episodes', `ep${screenplay.episode}`, 'output');
  mkdirSync(outDir, { recursive: true });

  const timeline = buildTimeline(audioManifest);

  // SRT إنجليزي — اللغة الأصلية للسيناريو
  const enSRT = generateSRT(timeline, 'en');
  writeFileSync(join(outDir, 'episode-en.srt'), enSRT, 'utf8');

  // SRT فرنسي — ترجمة بسيطة عبر قاموس مصطلحات شائعة
  const frSRT = generateSRT(timeline, 'fr');
  writeFileSync(join(outDir, 'episode-fr.srt'), frSRT, 'utf8');

  // WebVTT — إنجليزي افتراضياً
  const vtt = generateVTT(timeline);
  writeFileSync(join(outDir, 'episode.vtt'), vtt, 'utf8');

  logger.info('[OK] Subtitles generated', {
    lines: timeline.length,
    files: ['episode-en.srt', 'episode-fr.srt', 'episode.vtt'],
  });

  return {
    enSRT: join(outDir, 'episode-en.srt'),
    frSRT: join(outDir, 'episode-fr.srt'),
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

  const sorted = [...audioManifest.audioFiles].sort((a, b) => {
    if (a.sceneId !== b.sceneId) return a.sceneId.localeCompare(b.sceneId);
    if (a.type === 'narrator') return -1;
    if (b.type === 'narrator') return 1;
    return 0;
  });

  let lastSceneId = null;

  for (const audio of sorted) {
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
      character: audio.character || 'Narrator',
      type:      audio.type,
      sceneId:   audio.sceneId,
    });

    currentTime += dur + 0.3;
  }

  return timeline;
}

// ══════════════════════════════════════════════════════════
// توليد SRT
// ══════════════════════════════════════════════════════════
function generateSRT(timeline, lang) {
  const lines = [];
  for (const entry of timeline) {
    const text = lang === 'fr'
      ? formatLine(entry, translateToFrench(entry.text))
      : formatLine(entry, entry.text);
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
    lines.push(formatLine(entry, entry.text));
    lines.push('');
  }
  return lines.join('\n');
}

// ══════════════════════════════════════════════════════════
// دوال مساعدة
// ══════════════════════════════════════════════════════════
function formatLine(entry, text) {
  if (entry.type === 'narrator') return `♪ ${text}`;
  return `${entry.character}: ${text}`;
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

/**
 * ترجمة بسيطة إنجليزي → فرنسي عبر قاموس عبارات/كلمات شائعة في السيناريوهات.
 * ليست ترجمة كاملة دقيقة — هدفها تغطية لغوية أولية بدون Gemini (rule-137).
 * تُحسَّن لاحقاً بمرحلة Gemini منفصلة إن لزم.
 */
const FR_PHRASES = [
  [/\bI am\b/gi, 'Je suis'],
  [/\byou are\b/gi, 'tu es'],
  [/\bwe are\b/gi, 'nous sommes'],
  [/\bI don't know\b/gi, 'je ne sais pas'],
  [/\bI can't\b/gi, 'je ne peux pas'],
  [/\bwhy\b/gi, 'pourquoi'],
  [/\bbecause\b/gi, 'parce que'],
  [/\bplease\b/gi, "s'il te plaît"],
  [/\bno\b/gi, 'non'],
  [/\byes\b/gi, 'oui'],
  [/\bnever\b/gi, 'jamais'],
  [/\balways\b/gi, 'toujours'],
  [/\bthe truth\b/gi, 'la vérité'],
  [/\bthe silence\b/gi, 'le silence'],
  [/\bmemory\b/gi, 'mémoire'],
  [/\bmemories\b/gi, 'souvenirs'],
  [/\bfear\b/gi, 'peur'],
  [/\bdarkness\b/gi, 'obscurité'],
  [/\blight\b/gi, 'lumière'],
  [/\btrust\b/gi, 'confiance'],
  [/\bsecret\b/gi, 'secret'],
];

function translateToFrench(text) {
  if (!text) return text;
  // ملاحظة: قاموس تقريبي — يُبقي الجملة الأصلية مع استبدال ما يُعرف من العبارات
  let result = text;
  for (const [pattern, replacement] of FR_PHRASES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
