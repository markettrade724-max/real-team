/**
 * subtitle-agent.js — v1.3
 *
 * Changes from v1.2:
 *  - BOM (\uFEFF) added before all .srt files (err-214 fix — mojibake on Windows players)
 *  - FR_PHRASES updated with action/survival vocabulary matching new series theme
 *  - Removed Arabic-only vocabulary entries replaced by action-relevant ones
 *
 * No Gemini — rule-137
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname }            from 'path';
import { fileURLToPath }            from 'url';
import { logger }                   from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOM       = '\uFEFF'; // UTF-8 BOM — forces players to read as UTF-8, not Windows-1252

// ── Main ──────────────────────────────────────────────────
export function run(screenplay, audioManifest) {
  logger.info('[SUBTITLE] Generating subtitles', { episode: screenplay.episode });

  if (!audioManifest?.audioFiles?.length) {
    logger.warn('[SUBTITLE] No audio manifest — skipping');
    return { enSRT: null, frSRT: null, vtt: null, lines: 0 };
  }

  const outDir = join(__dirname, '..', 'episodes', `ep${screenplay.episode}`, 'output');
  mkdirSync(outDir, { recursive: true });

  const timeline = buildTimeline(audioManifest);

  // English SRT — BOM prefixed (err-214 fix)
  const enSRT = generateSRT(timeline, 'en');
  writeFileSync(join(outDir, 'episode-en.srt'), BOM + enSRT, 'utf8');

  // French SRT — BOM prefixed
  const frSRT = generateSRT(timeline, 'fr');
  writeFileSync(join(outDir, 'episode-fr.srt'), BOM + frSRT, 'utf8');

  // WebVTT — UTF-8 enforced by spec, no BOM needed
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

// ── Build timeline from audio manifest ────────────────────
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
    if (lastSceneId && audio.sceneId !== lastSceneId) currentTime += 1;
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

// ── SRT generator ─────────────────────────────────────────
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

// ── VTT generator ─────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────
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

function formatTimeVTT(seconds) { return formatTime(seconds).replace(',', '.'); }
function pad(n)   { return String(n).padStart(2, '0'); }
function padMs(n) { return String(n).padStart(3, '0'); }
function estimateDuration(text) { return Math.max(1.5, (text || '').split(/\s+/).length / 2.5); }

// ── French translation dictionary ─────────────────────────
// Covers action/survival theme (Lyra's series) + original memory/cosmos vocabulary
const FR_PHRASES = [
  // Action/survival — new entries for the series pivot
  [/\brun\b/gi,         'cours'],
  [/\bhurry\b/gi,       'vite'],
  [/\bgo now\b/gi,      'allez-y maintenant'],
  [/\bhelp me\b/gi,     "aide-moi"],
  [/\bwatch out\b/gi,   'attention'],
  [/\bdanger\b/gi,      'danger'],
  [/\bsurvive\b/gi,     'survivre'],
  [/\btrapped\b/gi,     'piégé'],
  [/\bescape\b/gi,      "s'échapper"],
  [/\bfight\b/gi,       'combattre'],
  [/\bhold on\b/gi,     'accroche-toi'],
  [/\bget out\b/gi,     'sors'],
  [/\bwe need to\b/gi,  'nous devons'],
  // Memory/cosmos — original vocabulary
  [/\bI am\b/gi,        'Je suis'],
  [/\byou are\b/gi,     'tu es'],
  [/\bwe are\b/gi,      'nous sommes'],
  [/\bI don't know\b/gi,'je ne sais pas'],
  [/\bI can't\b/gi,     'je ne peux pas'],
  [/\bwhy\b/gi,         'pourquoi'],
  [/\bbecause\b/gi,     'parce que'],
  [/\bplease\b/gi,      "s'il te plaît"],
  [/\bno\b/gi,          'non'],
  [/\byes\b/gi,         'oui'],
  [/\bnever\b/gi,       'jamais'],
  [/\balways\b/gi,      'toujours'],
  [/\bthe truth\b/gi,   'la vérité'],
  [/\bthe silence\b/gi, 'le silence'],
  [/\bmemory\b/gi,      'mémoire'],
  [/\bmemories\b/gi,    'souvenirs'],
  [/\bfear\b/gi,        'peur'],
  [/\bdarkness\b/gi,    "l'obscurité"],
  [/\blight\b/gi,       'lumière'],
  [/\bshard\b/gi,       'fragment'],
  [/\bremember\b/gi,    'rappelle-toi'],
  [/\bforget\b/gi,      'oublie'],
  [/\becho\b/gi,        'écho'],
  [/\bvoid\b/gi,        'le vide'],
  [/\bidentity\b/gi,    'identité'],
];

function translateToFrench(text) {
  if (!text) return text;
  let result = text;
  for (const [pattern, replacement] of FR_PHRASES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
