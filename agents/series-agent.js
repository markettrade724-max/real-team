/**
 * series-agent.js — v1.1
 *
 * التغييرات عن v1.0:
 *  - canAfford('screenplay') قبل البدء (rule-153)
 *  - voice-agent يستلم screenplay فقط (توافق v2.1)
 *  - await على runDialogue و runSubtitle
 *  - ترقيم الخطوات مصحح (10 خطوات)
 *  - لا يبتلع الخطأ — يرفعه لـ orchestrator
 *
 * القواعد المطبقة:
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-130 : ترتيب خط الإنتاج إلزامي
 *  rule-153 : canAfford قبل البدء
 *  rule-172 : عمل كامل أو لا شيء
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname }            from 'path';
import { fileURLToPath }            from 'url';
import { canAfford }                from './_gemini.js';
import { run as runScreenplay }     from './screenplay-agent.js';
import { run as runDialogue }       from './dialogue-agent.js';
import { run as runScene }          from './scene-agent.js';
import { run as runVoice }          from './voice-agent.js';
import { run as runVisual }         from './visual-agent.js';
import { run as runEdit }           from './edit-agent.js';
import { run as runUpload }         from './upload-agent.js';
import { run as runTrailer }        from './trailer-agent.js';
import { run as runMusic }          from './music-agent.js';
import { run as runSubtitle }       from './subtitle-agent.js';
import { logger }                   from '../logger.js';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const SERIES_PATH = join(__dirname, '..', 'series.json');

// ══════════════════════════════════════════════════════════
// الدالة الرئيسية
// ══════════════════════════════════════════════════════════
export async function run(universe, targetEpisode = null) {
  logger.info('[SERIES] Starting v1.1', { universe: universe.id });

  // rule-153: تحقق من الحصة قبل البدء
  if (!canAfford('screenplay')) {
    throw new Error('InsufficientQuota: series needs 3 calls for screenplay');
  }

  const series      = loadSeries(universe);
  const nextEpisode = targetEpisode || series.nextEpisode;

  logger.info('[SERIES] Producing episode', {
    episode: nextEpisode,
    quota:   'verified',
  });

  const seriesContext = {
    seriesTitle:      series.title,
    previousEpisodes: series.episodes.map(e => ({
      number:      e.number,
      title:       e.title,
      summary:     e.summary,
      cliffhanger: e.cliffhanger,
    })),
    characters:  series.characters,
    worldState:  series.worldState,
  };

  // ── خط الإنتاج — rule-130 ─────────────────────────────
  // screenplay → dialogue → scene → voice → subtitle → visual → music → edit → trailer → upload

  // ── 1. السيناريو (3 طلبات Gemini) ────────────────────
  logger.info('[SERIES] Step 1/10 — Screenplay');
  const screenplay = await runScreenplay(universe, nextEpisode, seriesContext);

  // ── 2. تحسين الحوار — بدون Gemini ────────────────────
  logger.info('[SERIES] Step 2/10 — Dialogue polish');
  const polishedScreenplay = await runDialogue(screenplay);

  // ── 3. المشاهد البصرية ────────────────────────────────
  logger.info('[SERIES] Step 3/10 — Visual scenes');
  const visualScenes = await runScene(polishedScreenplay, universe);

  // ── 4. الصوت — بدون Gemini ────────────────────────────
  // voice-agent v2.1 يستلم screenplay فقط
  logger.info('[SERIES] Step 4/10 — Voice');
  const audioManifest = await runVoice(polishedScreenplay);

  // ── 5. الترجمة — بدون Gemini ─────────────────────────
  logger.info('[SERIES] Step 5/10 — Subtitles');
  const subtitles = await runSubtitle(polishedScreenplay, audioManifest);

  // ── 6. الصور ─────────────────────────────────────────
  logger.info('[SERIES] Step 6/10 — Images');
  const visualManifest = await runVisual(visualScenes, nextEpisode);

  // ── 7. الموسيقى — بدون Gemini ────────────────────────
  logger.info('[SERIES] Step 7/10 — Music');
  const music = await runMusic(polishedScreenplay, universe);

  // ── 8. المونتاج ──────────────────────────────────────
  logger.info('[SERIES] Step 8/10 — Edit');
  const episode = await runEdit(
    polishedScreenplay, visualManifest, audioManifest, subtitles, music
  );

  // ── 9. التريلر ────────────────────────────────────────
  logger.info('[SERIES] Step 9/10 — Trailer (60s)');
  const trailer = await runTrailer(
    polishedScreenplay, visualManifest, audioManifest, episode
  );

  // ── 10. النشر ─────────────────────────────────────────
  logger.info('[SERIES] Step 10/10 — Upload');
  const uploadResult = await runUpload(episode, series, trailer);

  // ── تحديث سجل المسلسل ────────────────────────────────
  series.episodes.push({
    number:      nextEpisode,
    title:       screenplay.title,
    summary:     buildSummary(screenplay),
    cliffhanger: screenplay.cliffhanger,
    theme:       screenplay.theme,
    outputPath:  episode.outputPath,
    duration:    episode.duration,
    producedAt:  new Date().toISOString(),
  });

  series.worldState   = updateWorldState(series.worldState, screenplay);
  series.characters   = updateCharacters(series.characters, screenplay);
  series.nextEpisode  = nextEpisode + 1;
  series.lastProduced = new Date().toISOString();

  saveSeries(series);

  logger.info('[OK] Episode produced', {
    episode:  nextEpisode,
    title:    screenplay.title,
    duration: episode.duration ? `${Math.round(episode.duration / 60)}min` : 'unknown',
    path:     episode.outputPath,
  });

  return {
    episode:    nextEpisode,
    title:      screenplay.title,
    outputPath: episode.outputPath,
    duration:   episode.duration,
    nextHint:   screenplay.nextEpisodeHint,
  };
}

// ══════════════════════════════════════════════════════════
// سجل المسلسل
// ══════════════════════════════════════════════════════════
function loadSeries(universe) {
  if (existsSync(SERIES_PATH)) {
    try { return JSON.parse(readFileSync(SERIES_PATH, 'utf8')); } catch {}
  }

  const series = {
    universeId:  universe.id,
    title:       universe.name?.ar || universe.name?.en,
    created:     new Date().toISOString(),
    nextEpisode: 1,
    episodes:    [],
    characters:  [],
    worldState: {
      tension:    'low',
      majorEvent: null,
      secrets:    [],
    },
  };

  mkdirSync(join(__dirname, '..', 'episodes'), { recursive: true });
  saveSeries(series);
  return series;
}

function saveSeries(series) {
  writeFileSync(SERIES_PATH, JSON.stringify(series, null, 2), 'utf8');
}

// ══════════════════════════════════════════════════════════
// دوال مساعدة
// ══════════════════════════════════════════════════════════
function buildSummary(screenplay) {
  const summaries = screenplay.acts?.map(a => a.summary).filter(Boolean) || [];
  return summaries.join(' — ') || screenplay.logline || '';
}

function updateWorldState(state, screenplay) {
  const levels     = ['low', 'medium', 'high', 'critical'];
  const currentIdx = levels.indexOf(state.tension);
  return {
    ...state,
    tension:    levels[Math.min(currentIdx + 1, levels.length - 1)],
    majorEvent: screenplay.cliffhanger,
    lastTheme:  screenplay.theme,
  };
}

function updateCharacters(existing, screenplay) {
  const updated = [...existing];
  for (const char of (screenplay.characters || [])) {
    const found = updated.find(c => c.name === char.name);
    if (!found) {
      updated.push({ ...char, episodesAppeared: 1 });
    } else {
      found.episodesAppeared = (found.episodesAppeared || 0) + 1;
    }
  }
  return updated;
}
