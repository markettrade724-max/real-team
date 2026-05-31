/**
 * series-agent.js
 * يدير المسلسل كاملاً — الحلقات، تطور الشخصيات، cliff-hangers
 * يستدعي خط الإنتاج الكامل لكل حلقة
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { run as runScreenplay } from './screenplay-agent.js';
import { run as runDialogue }   from './dialogue-agent.js';
import { run as runScene }      from './scene-agent.js';
import { run as runVoice }      from './voice-agent.js';
import { run as runVisual }     from './visual-agent.js';
import { run as runEdit }       from './edit-agent.js';
import { run as runUpload }     from './upload-agent.js';
import { logger }               from '../logger.js';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const SERIES_PATH  = join(__dirname, '..', 'series.json');

export async function run(universe, targetEpisode = null) {
  logger.info('[SERIES] Starting', { universe: universe.id });

  // تحميل أو إنشاء سجل المسلسل
  const series = loadSeries(universe);

  // تحديد الحلقة التالية
  const nextEpisode = targetEpisode || series.nextEpisode;
  logger.info('[SERIES] Producing episode', { episode: nextEpisode });

  // سياق الحلقات السابقة
  const seriesContext = {
    seriesTitle:      series.title,
    previousEpisodes: series.episodes.map(e => ({
      number:  e.number,
      title:   e.title,
      summary: e.summary,
      cliffhanger: e.cliffhanger,
    })),
    characters:       series.characters,
    worldState:       series.worldState,
  };

  try {
    // ── خط الإنتاج الكامل ────────────────

    // 1. السيناريو
    logger.info(`[SERIES] Step 1/5 — Screenplay`);
    const screenplay = await runScreenplay(universe, nextEpisode, seriesContext);

    // 2. تحسين الحوار — بدون Gemini
    logger.info(`[SERIES] Step 2/6 — Dialogue polish`);
    const polishedScreenplay = runDialogue(screenplay);

    // 3. المشاهد البصرية
    logger.info(`[SERIES] Step 3/6 — Visual scenes`);
    const visualScenes = await runScene(polishedScreenplay, universe);

    // 4. الصوت
    logger.info(`[SERIES] Step 4/6 — Voice`);
    const audioManifest = await runVoice(polishedScreenplay, visualScenes);

    // 5. الصور
    logger.info(`[SERIES] Step 5/6 — Images`);
    const visualManifest = await runVisual(visualScenes, nextEpisode);

    // 6. المونتاج النهائي
    logger.info(`[SERIES] Step 6/6 — Edit`);
    const episode = await runEdit(polishedScreenplay, visualManifest, audioManifest);

    // 7. النشر التلقائي
    logger.info(`[SERIES] Publishing...`);
    const uploadResult = await runUpload(episode, series);

    // ── تحديث سجل المسلسل ────────────────
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

    // تحديث حالة العالم والشخصيات
    series.worldState    = updateWorldState(series.worldState, screenplay);
    series.characters    = updateCharacters(series.characters, screenplay);
    series.nextEpisode   = nextEpisode + 1;
    series.lastProduced  = new Date().toISOString();

    saveSeries(series);

    logger.info('[OK] Episode produced', {
      episode:  nextEpisode,
      title:    screenplay.title,
      duration: `${Math.round(episode.duration / 60)}min`,
      path:     episode.outputPath,
    });

    return {
      episode:    nextEpisode,
      title:      screenplay.title,
      outputPath: episode.outputPath,
      duration:   episode.duration,
      nextHint:   screenplay.nextEpisodeHint,
    };

  } catch (err) {
    logger.error('[SERIES] Episode failed', { episode: nextEpisode, error: err.message });
    throw err;
  }
}

// ── تحميل أو إنشاء سجل المسلسل ──────────
function loadSeries(universe) {
  if (existsSync(SERIES_PATH)) {
    try { return JSON.parse(readFileSync(SERIES_PATH, 'utf8')); } catch {}
  }

  // مسلسل جديد
  const series = {
    universeId:   universe.id,
    title:        universe.name?.ar || universe.name?.en,
    created:      new Date().toISOString(),
    nextEpisode:  1,
    episodes:     [],
    characters:   [],
    worldState: {
      tension:    'low',     // low / medium / high / critical
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

// ── ملخص الحلقة ──────────────────────────
function buildSummary(screenplay) {
  const actSummaries = screenplay.acts.map(a => a.summary).filter(Boolean);
  return actSummaries.join(' — ') || screenplay.logline;
}

// ── تحديث حالة العالم ────────────────────
function updateWorldState(state, screenplay) {
  // رفع التوتر تدريجياً
  const tensionLevels = ['low', 'medium', 'high', 'critical'];
  const currentIdx    = tensionLevels.indexOf(state.tension);

  return {
    ...state,
    tension:    tensionLevels[Math.min(currentIdx + 1, tensionLevels.length - 1)],
    majorEvent: screenplay.cliffhanger,
    lastTheme:  screenplay.theme,
  };
}

// ── تحديث الشخصيات ───────────────────────
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
