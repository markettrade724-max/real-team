/**
 * series-agent.js — v1.4
 *
 * التغييرات عن v1.3:
 *  - loadSeries: title يُبنى بأولوية name.en بدل name.ar (المسلسل الآن إنجليزي)
 *
 * الاستخدام:
 *  MODE=series node orchestrator.js
 *
 * تنبيه بنيوي (غير لغوي):
 *  series-agent له بنية series.json مختلفة قليلاً عن updateSeries() في
 *  orchestrator.js v10.5 (مثلاً summary بدل logline+theme منفصلين).
 *  بما أن series-agent أداة يدوية فقط ولا يُستدعى من الجدول التلقائي،
 *  لا تعارض فوري — لكن لا يجب تشغيله واستخدام production التلقائي
 *  على نفس الحلقة لتجنب بنية مختلطة في series.json.
 *
 * القواعد المطبقة:
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-130 : ترتيب خط الإنتاج إلزامي
 *  rule-139 : screenplay: backbone → scenes → dialogue — 3 استدعاءات
 *  rule-153 : وحدة كاملة أو لا شيء
 *  rule-172 : مفتاح واحد لكل مهمة كاملة
 *  rule-177 : resetSessionKey() بعد اكتمال المهمة
 *  rule-185 : نسخة عميقة — لا تعديل على screenplay الأصلي
 *  rule-182 : subtitle: run(screenplay, audioManifest) بدون visualManifest
 *  rule-187 : progress.json — المهام الجارية أولوية مطلقة
 *  rule-188 : كل خطوة تُحفظ فور اكتمالها
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname }        from 'path';
import { fileURLToPath }        from 'url';
import {
  getRemainingQuota, resetSessionKey, selectKeyForTask,
} from './_gemini.js';
import { run as runScreenplay } from './screenplay-agent.js';
import { run as runDialogue }   from './dialogue-agent.js';
import { run as runScene }      from './scene-agent.js';
import { run as runVoice }      from './voice-agent.js';
import { run as runVisual }     from './visual-agent.js';
import { run as runEdit }       from './edit-agent.js';
import { run as runUpload }     from './upload-agent.js';
import { run as runTrailer }    from './trailer-agent.js';
import { run as runMusic }      from './music-agent.js';
import { run as runSubtitle }   from './subtitle-agent.js';
import { logger }               from '../logger.js';
import {
  loadProgress,
  startEpisode,
  saveEpisodeStep,
  getEpisodeProgress,
  completeEpisode,
  failTask,
} from '../scripts/progress.js';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const SERIES_PATH = join(__dirname, '..', 'series.json');

// screenplay(3) + scene(1) + visual(1) = 5
const MIN_QUOTA      = 5;
const EPISODE_STEPS  = ['backbone', 'scenes', 'dialogue'];
const SLEEP_MS       = 15000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════
// الدالة الرئيسية
// ══════════════════════════════════════════════════════════
export async function run(universe, targetEpisode = null) {
  logger.info('[SERIES] Starting v1.4', { universe: universe.id });

  const quota = getRemainingQuota();
  if (quota < MIN_QUOTA) {
    throw new Error(
      `InsufficientQuota: series needs minimum ${MIN_QUOTA} calls — only ${quota} left`
    );
  }

  const key = selectKeyForTask(MIN_QUOTA);
  if (!key) {
    throw new Error(
      `InsufficientQuota: no single key has ${MIN_QUOTA}+ calls available`
    );
  }

  const series      = loadSeries(universe);
  const nextEpisode = targetEpisode || series.nextEpisode;

  logger.info('[SERIES] Producing episode', { episode: nextEpisode, quota, key });

  const seriesContext = {
    seriesTitle:      series.title,
    previousEpisodes: series.episodes.map(e => ({
      number: e.number, title: e.title,
      summary: e.summary, cliffhanger: e.cliffhanger,
    })),
    characters: series.characters,
    worldState: series.worldState,
  };

  startEpisode(nextEpisode);

  try {
    logger.info('[SERIES] Step 1/10 — Screenplay (3 calls)');
    let screenplay = null;

    for (const step of EPISODE_STEPS) {
      const current = getEpisodeProgress(loadProgress(), nextEpisode);

      if (current.completedSteps.includes(step)) {
        logger.info(`[SERIES] ${step} already done — skipping`);
        continue;
      }

      logger.info(`[SERIES] Screenplay step: ${step}`);
      await sleep(SLEEP_MS);

      screenplay = await runScreenplay(universe, nextEpisode, {
        ...seriesContext,
        fromStep: step,
      });

      if (!screenplay?.acts?.length) {
        throw new Error(`${step}-failed: invalid screenplay output`);
      }

      saveEpisodeStep(nextEpisode, step, screenplay);
      logger.info(`[SERIES] ${step} done`, { episode: nextEpisode });
    }

    if (!screenplay) throw new Error('No screenplay produced');

    logger.info('[SERIES] Step 2/10 — Dialogue polish');
    const polishedScreenplay = await runDialogue(screenplay);

    logger.info('[SERIES] Step 3/10 — Visual scenes');
    const visualScenes = await runScene(polishedScreenplay, universe);

    logger.info('[SERIES] Step 4/10 — Voice');
    const audioManifest = await runVoice(polishedScreenplay);

    logger.info('[SERIES] Step 5/10 — Subtitles');
    const subtitles = await runSubtitle(polishedScreenplay, audioManifest);

    logger.info('[SERIES] Step 6/10 — Images');
    const visualManifest = await runVisual(visualScenes, nextEpisode);

    logger.info('[SERIES] Step 7/10 — Music');
    const music = await runMusic(polishedScreenplay, universe);

    logger.info('[SERIES] Step 8/10 — Edit');
    const episode = await runEdit(
      polishedScreenplay, visualManifest, audioManifest, subtitles, music
    );

    logger.info('[SERIES] Step 9/10 — Trailer');
    const trailer = await runTrailer(
      polishedScreenplay, visualManifest, audioManifest, episode
    );

    logger.info('[SERIES] Step 10/10 — Upload');
    const uploadResult = await runUpload(episode, series, trailer);

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
    completeEpisode(nextEpisode);
    resetSessionKey();

    logger.info('[OK] Episode produced', {
      episode:   nextEpisode,
      title:     screenplay.title,
      duration:  episode.duration
        ? `${Math.round(episode.duration / 60)}min`
        : 'unknown',
      path:      episode.outputPath,
      quotaLeft: getRemainingQuota(),
    });

    return {
      episode:    nextEpisode,
      title:      screenplay.title,
      outputPath: episode.outputPath,
      duration:   episode.duration,
      nextHint:   screenplay.nextEpisodeHint,
    };

  } catch (err) {
    failTask(err.message.slice(0, 120));
    logger.error('[SERIES] Production failed — will retry same day next week', {
      episode: nextEpisode,
      error:   err.message.slice(0, 120),
    });
    throw err;
  }
}

// ══════════════════════════════════════════════════════════
// سجل المسلسل
// ══════════════════════════════════════════════════════════
function loadSeries(universe) {
  if (existsSync(SERIES_PATH)) {
    try { return JSON.parse(readFileSync(SERIES_PATH, 'utf8')); } catch {}
  }

  const series = {
    universeId:   universe.id,
    title:        universe.name?.en || universe.name?.ar,
    created:      new Date().toISOString(),
    nextEpisode:  1,
    lastProduced: null,
    episodes:     [],
    characters:   [],
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
