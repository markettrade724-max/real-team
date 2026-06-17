/**
 * orchestrator.js — v10.5
 *
 * الإصلاحات عن v10.4:
 *  - screenplayDay: 3 استدعاءات منفصلة مع حفظ فوري بعد كل خطوة (rule-188)
 *  - screenplayDay: استئناف صحيح من الخطوة المتبقية (rule-187)
 *  - gamePhase: budget بدل phase (توافق code-agent v2.2)
 *  - productionDay: يحدّث series.json قبل upload
 *  - series.json يُبنى محلياً — لا يعتمد على series-agent
 *
 * الجدول الأسبوعي:
 *   السبت    → library       (40 طلب)
 *   الأحد    → inventor      (40 طلب)
 *   الاثنين  → screenplay    (3 طلبات — backbone+scenes+dialogue)
 *   الثلاثاء → production    (0 طلبات — صوت+فيديو+رفع)
 *   الأربعاء → screenplay    (3 طلبات — حلقة جديدة)
 *   الخميس   → game-phase1  (4 طلبات — .gd)
 *   الجمعة   → game-phase2  (5 طلبات — .tscn)
 */

import { writeFileSync, readFileSync, copyFileSync,
         mkdirSync, existsSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { execSync }       from 'child_process';
import { logger }         from './logger.js';
import {
  canAfford, getBudgetStatus, getRemainingQuota,
  selectKeyForTask, resetSessionKey,
} from './agents/_gemini.js';
import { run as runLibrary, getLibraryStatus } from './agents/library-builder-agent.js';
import { run as runScreenplay }                from './agents/screenplay-agent.js';
import { run as runVoice }                     from './agents/voice-agent.js';
import { run as runSubtitle }                  from './agents/subtitle-agent.js';
import { run as runVisual }                    from './agents/visual-agent.js';
import { run as runScene }                     from './agents/scene-agent.js';
import { run as runMusic }                     from './agents/music-agent.js';
import { run as runEdit }                      from './agents/edit-agent.js';
import { run as runTrailer }                   from './agents/trailer-agent.js';
import { run as runUpload }                    from './agents/upload-agent.js';
import { run as runAnalytics }                 from './agents/analytics-agent.js';
import {
  loadProgress,
  startEpisode,    completeEpisode,
  startGame,       completeGame,
  saveEpisodeStep, getEpisodeProgress,
  saveGameFile,    getGameProgress,
  failTask,
} from './scripts/progress.js';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR  = join(__dirname, 'agent-results');
const UNIVERSE     = join(__dirname, 'universe.json');
const UNIVERSE_BAK = join(__dirname, 'universe.backup.json');
const SERIES_PATH  = join(__dirname, 'series.json');

if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

const DELAY   = 15000;
const TIMEOUT = 600000; // 10 دقائق

const save  = (file, data) =>
  writeFileSync(join(RESULTS_DIR, file), JSON.stringify(data, null, 2), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt   = ms => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

const DAY       = new Date().getDay();
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const TASK_MAP = {
  6: 'library',
  0: 'inventor',
  1: 'screenplay',
  2: 'production',
  3: 'screenplay',
  4: 'game-phase1',
  5: 'game-phase2',
};

const TASK_COST = {
  library:       40,
  inventor:      40,
  screenplay:     3,
  production:     0,
  'game-phase1':  4,
  'game-phase2':  5,
};

const EPISODE_STEPS = ['backbone', 'scenes', 'dialogue'];

function getDayTask() { return TASK_MAP[DAY] ?? 'library'; }

logger.info('[SCHEDULE] Today', {
  day:  DAY_NAMES[DAY],
  task: getDayTask(),
  need: TASK_COST[getDayTask()],
});

// ══════════════════════════════════════════════════════════
// rollback
// ══════════════════════════════════════════════════════════
function backupUniverse() {
  if (existsSync(UNIVERSE)) copyFileSync(UNIVERSE, UNIVERSE_BAK);
}
function rollbackUniverse() {
  if (!existsSync(UNIVERSE_BAK)) return false;
  copyFileSync(UNIVERSE_BAK, UNIVERSE);
  logger.warn('[ROLLBACK] universe.json restored');
  return true;
}
function clearBackup() {
  if (existsSync(UNIVERSE_BAK)) unlinkSync(UNIVERSE_BAK);
}

// ══════════════════════════════════════════════════════════
// أدوات
// ══════════════════════════════════════════════════════════
function loadUniverse() {
  if (!existsSync(UNIVERSE)) return null;
  try { return JSON.parse(readFileSync(UNIVERSE, 'utf8')); } catch { return null; }
}
function loadResult(file) {
  const p = join(RESULTS_DIR, file);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}
function saveUniverse(u) {
  writeFileSync(UNIVERSE, JSON.stringify(u, null, 2), 'utf8');
  logger.info('[OK] Universe saved', { worlds: u.worlds?.length });
}
function loadProducts() {
  const p = join(__dirname, 'products.json');
  if (!existsSync(p)) return [];
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return []; }
}

function hasEnoughQuota(task) {
  const needed = TASK_COST[task] ?? 0;
  if (needed === 0) return true;
  const key = selectKeyForTask(needed);
  if (!key) {
    logger.warn(`[QUOTA] Not enough for ${task}`, { needed, left: getRemainingQuota() });
    return false;
  }
  return true;
}

async function run(name, agentFn, args = []) {
  logger.info(`[RUN] ${name}`);
  const t0 = Date.now();
  try {
    const result = await Promise.race([
      agentFn(...args),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error(`Timeout after ${TIMEOUT / 1000}s`)), TIMEOUT)
      ),
    ]);
    const d = fmt(Date.now() - t0);
    logger.info(`[OK] ${name}`, { duration: d, quotaLeft: getRemainingQuota() });
    return { success: true, data: result, duration: d };
  } catch (err) {
    const d = fmt(Date.now() - t0);
    logger.error(`[FAIL] ${name}`, { error: err.message.slice(0, 120), duration: d });
    return { success: false, error: err.message.slice(0, 120), duration: d };
  }
}

// ══════════════════════════════════════════════════════════
// series.json — يُبنى ويُحدَّث محلياً
// ══════════════════════════════════════════════════════════
function loadSeries() {
  if (!existsSync(SERIES_PATH)) return null;
  try { return JSON.parse(readFileSync(SERIES_PATH, 'utf8')); } catch { return null; }
}

function updateSeries(universe, screenplay, episodeFile, videoUrl = null, trailerUrl = null) {
  const series = loadSeries() || {
    id:          universe.id,
    title:       universe.name?.ar || universe.name?.en,
    universeId:  universe.id,
    episodes:    [],
    nextEpisode: 1,
    createdAt:   new Date().toISOString(),
  };

  const ep = {
    number:      screenplay.episode,
    title:       screenplay.title,
    logline:     screenplay.logline,
    theme:       screenplay.theme,
    cliffhanger: screenplay.cliffhanger,
    file:        episodeFile?.outputPath || null,
    duration:    episodeFile?.duration   || 0,
    videoUrl:    videoUrl                || null,
    trailerUrl:  trailerUrl              || null,
    producedAt:  new Date().toISOString(),
  };

  const idx = series.episodes.findIndex(e => e.number === ep.number);
  if (idx >= 0) series.episodes[idx] = ep;
  else series.episodes.push(ep);

  series.nextEpisode = Math.max(...series.episodes.map(e => e.number)) + 1;
  series.updatedAt   = new Date().toISOString();

  writeFileSync(SERIES_PATH, JSON.stringify(series, null, 2), 'utf8');
  logger.info('[OK] series.json updated', {
    episode: ep.number,
    total:   series.episodes.length,
    next:    series.nextEpisode,
  });
  return series;
}

// ══════════════════════════════════════════════════════════
// السبت — library
// ══════════════════════════════════════════════════════════
async function libraryDay(t0, runId) {
  logger.info('[LIBRARY] Saturday — full quota');
  const log = {};

  if (getLibraryStatus().remaining === 0) {
    log.library = { success: true, data: { skipped: true }, duration: '0ms' };
    return saveReport(log, t0, runId, 'library', true);
  }

  const t0lib = Date.now();
  let built = 0;
  try {
    while (getRemainingQuota() >= 2 && getLibraryStatus().remaining > 0) {
      const r = await runLibrary();
      built += r?.built || 0;
      if (!r?.built) break;
    }
    log.library = { success: true, data: { built }, duration: fmt(Date.now() - t0lib) };
    resetSessionKey();
  } catch (err) {
    log.library = { success: false, error: err.message, duration: fmt(Date.now() - t0lib) };
    failTask('library-failed');
  }

  try {
    const u = loadUniverse();
    if (u) { const r = await runAnalytics(u); save('analytics.json', r); }
  } catch {}

  return saveReport(log, t0, runId, 'library', log.library?.success || false);
}

// ══════════════════════════════════════════════════════════
// الأحد — inventor
// ══════════════════════════════════════════════════════════
async function inventorDay(universe, t0, runId) {
  logger.info('[INVENTOR] Sunday — full quota');
  const log = {};

  if (!hasEnoughQuota('inventor')) {
    failTask('inventor-no-quota');
    return saveReport(log, t0, runId, 'inventor', false);
  }

  backupUniverse();
  log.invention = await run('Inventor',
    u => import('./agents/inventor-agent.js').then(m => m.run(u)), [universe]);

  if (log.invention?.success) {
    universe.inventions   = (universe.inventions || 0) + 1;
    universe.lastInvented = new Date().toISOString();
    saveUniverse(universe);
    clearBackup();
    resetSessionKey();
  } else {
    rollbackUniverse();
    failTask('inventor-failed');
  }

  return saveReport(log, t0, runId, 'inventor', log.invention?.success || false);
}

// ══════════════════════════════════════════════════════════
// الاثنين/الأربعاء — screenplay كامل
// 3 استدعاءات منفصلة مع حفظ فوري بعد كل خطوة — rule-188
// ══════════════════════════════════════════════════════════
async function screenplayDay(universe, t0, runId) {
  const progress      = loadProgress();
  const episodeNumber = progress.series?.nextEpisode ?? 1;
  const log           = {};

  logger.info('[SCREENPLAY] Full day', { episode: episodeNumber });

  if (!hasEnoughQuota('screenplay')) {
    failTask('screenplay-no-quota');
    return saveReport(log, t0, runId, 'screenplay', false);
  }

  startEpisode(episodeNumber);

  let screenplay = null;

  try {
    for (const step of EPISODE_STEPS) {
      // قراءة التقدم من disk في كل مرة — rule-188
      const current = getEpisodeProgress(loadProgress(), episodeNumber);

      // تخطّ الخطوات المكتملة مسبقاً
      if (current.completedSteps.includes(step)) {
        logger.info(`[SCREENPLAY] ${step} already done — skipping`);
        continue;
      }

      logger.info(`[SCREENPLAY] Step: ${step}`);
      await sleep(DELAY);

      // استدعاء منفصل لكل خطوة — rule-139
      screenplay = await runScreenplay(universe, episodeNumber, { fromStep: step });

      if (!screenplay?.acts?.length) {
        throw new Error(`${step}-failed: invalid screenplay output`);
      }

      // حفظ فوري بعد كل خطوة — rule-188
      saveEpisodeStep(episodeNumber, step, screenplay);
      logger.info(`[OK] ${step} done`, { episode: episodeNumber });
    }

    if (!screenplay) throw new Error('No screenplay produced');

    // حفظ السيناريو الكامل للإنتاج يوم الثلاثاء
    writeFileSync(
      join(RESULTS_DIR, 'screenplay-pending.json'),
      JSON.stringify({
        episode:  episodeNumber,
        screenplay,
        savedAt:  new Date().toISOString(),
      }, null, 2), 'utf8'
    );

    // نسخة أرشيفية
    writeFileSync(
      join(RESULTS_DIR, `screenplay-ep${episodeNumber}.json`),
      JSON.stringify(screenplay, null, 2), 'utf8'
    );

    log.screenplay = {
      success:  true,
      data:     { episode: episodeNumber, title: screenplay.title },
      duration: '—',
    };

    resetSessionKey();
    logger.info('[OK] Screenplay day complete — ready for Tuesday production', {
      episode: episodeNumber,
      title:   screenplay.title,
      scenes:  screenplay.acts?.flatMap(a => a.scenes || []).length,
    });

    return saveReport(log, t0, runId, 'screenplay', true);

  } catch (err) {
    log.screenplay = { success: false, error: err.message, duration: '—' };
    failTask(`screenplay-failed: ${err.message.slice(0, 80)}`);
    logger.warn('[SCREENPLAY] Failed — completed steps saved — retry same day next week', {
      error: err.message,
    });
    return saveReport(log, t0, runId, 'screenplay', false);
  }
}

// ══════════════════════════════════════════════════════════
// الثلاثاء — خط الإنتاج الكامل (بدون Gemini)
// ══════════════════════════════════════════════════════════
async function productionDay(universe, t0, runId) {
  logger.info('[PRODUCTION] Tuesday — full pipeline');
  const log = {};

  const pending = loadResult('screenplay-pending.json');
  if (!pending?.screenplay) {
    logger.error('[PRODUCTION] No pending screenplay — run screenplay day first');
    failTask('production-no-screenplay');
    return saveReport(log, t0, runId, 'production', false);
  }

  const { episode, screenplay } = pending;
  logger.info('[PRODUCTION] Episode', { episode, title: screenplay.title });

  try {
    // 1 — صوت
    logger.info('[PRODUCTION] 1/7 Voice');
    const voiceR = await run('Voice', s => runVoice(s), [screenplay]);
    if (!voiceR.success) throw new Error(voiceR.error || 'voice-failed');
    log.voice = voiceR;

    // 2 — مشاهد بصرية
    logger.info('[PRODUCTION] 2/7 Scenes');
    const sceneR = await run('Scene', (s, u) => runScene(s, u), [screenplay, universe]);
    if (!sceneR.success) throw new Error(sceneR.error || 'scene-failed');
    log.scene = sceneR;

    // 3 — صور
    logger.info('[PRODUCTION] 3/7 Visual');
    const visualR = await run('Visual', (vs, ep) => runVisual(vs, ep),
      [sceneR.data, episode]);
    if (!visualR.success) throw new Error(visualR.error || 'visual-failed');
    log.visual = visualR;

    // 4 — ترجمة (اختياري — لا يوقف الإنتاج)
    logger.info('[PRODUCTION] 4/7 Subtitles');
    const subR = await run('Subtitle', (s, a) => runSubtitle(s, a),
      [screenplay, voiceR.data]);
    log.subtitle = subR;

    // 5 — موسيقى (اختياري)
    logger.info('[PRODUCTION] 5/7 Music');
    const musicR = await run('Music', (s, u) => runMusic(s, u), [screenplay, universe]);
    log.music = musicR;

    // 6 — مونتاج
    logger.info('[PRODUCTION] 6/7 Edit');
    const editR = await run('Edit',
      (s, vm, am, sub, mus) => runEdit(s, vm, am, sub, mus),
      [screenplay, visualR.data, voiceR.data,
       subR.success  ? subR.data  : null,
       musicR.success ? musicR.data : null]);
    if (!editR.success) throw new Error(editR.error || 'edit-failed');
    log.edit = editR;

    // 7 — تريلر
    logger.info('[PRODUCTION] 7/7 Trailer');
    const trailerR = await run('Trailer',
      (s, vm, am, ep) => runTrailer(s, vm, am, ep),
      [screenplay, visualR.data, voiceR.data, editR.data]);
    log.trailer = trailerR;

    // تحديث series.json قبل upload
    let series = updateSeries(universe, screenplay, editR.data);

    // رفع
    logger.info('[PRODUCTION] Upload');
    const uploadR = await run('Upload',
      (ep, s, tr) => runUpload(ep, s, tr),
      [editR.data, series, trailerR.success ? trailerR.data : null]);
    log.upload = uploadR;

    // تحديث series.json بـ videoUrl و trailerUrl من Supabase
    if (uploadR.success && (uploadR.data?.videoUrl || uploadR.data?.trailerUrl)) {
      series = updateSeries(universe, screenplay, editR.data,
        uploadR.data.videoUrl, uploadR.data.trailerUrl);
      logger.info('[OK] series.json updated with video URLs', {
        videoUrl:   uploadR.data.videoUrl,
        trailerUrl: uploadR.data.trailerUrl,
      });
    }

    // إكمال الحلقة في progress.json
    completeEpisode(episode);
    resetSessionKey();

    // حذف السيناريو المعلق
    try { unlinkSync(join(RESULTS_DIR, 'screenplay-pending.json')); } catch {}

    logger.info('[OK] Episode produced', {
      episode,
      title:   screenplay.title,
      youtube: log.upload?.data?.youtube?.url || 'skipped',
      tiktok:  log.upload?.data?.tiktok?.url  || 'skipped',
    });

    return saveReport(log, t0, runId, 'production', true);

  } catch (err) {
    log.production = { success: false, error: err.message, duration: '—' };
    failTask(`production-failed: ${err.message.slice(0, 80)}`);
    logger.warn('[PRODUCTION] Failed — retry same day next week', { error: err.message });
    return saveReport(log, t0, runId, 'production', false);
  }
}

// ══════════════════════════════════════════════════════════
// الخميس/الجمعة — بناء لعبة
// ══════════════════════════════════════════════════════════
function getNextGame(progress) {
  if (progress.games?.current) return progress.games.current;
  return loadProducts().find(p =>
    p.type === 'godot' && !progress.games?.done?.includes(p.id)
  ) ?? null;
}

async function gamePhase(universe, phase, t0, runId) {
  const taskKey  = `game-phase${phase}`;
  const progress = loadProgress();
  const game     = getNextGame(progress);
  const log      = {};

  if (!game) {
    logger.warn('[GAME] No game to build');
    return saveReport(log, t0, runId, taskKey, false);
  }

  if (!hasEnoughQuota(taskKey)) {
    failTask(`${taskKey}-no-quota`);
    return saveReport(log, t0, runId, taskKey, false);
  }

  logger.info(`[GAME] Phase ${phase}`, { id: game.id });

  const idea     = loadResult('ideas.json');
  const story    = loadResult('story.json');
  const template = loadResult('template.json');

  if (!idea) {
    logger.error('[GAME] ideas.json not found');
    failTask(`${taskKey}-no-idea`);
    return saveReport(log, t0, runId, taskKey, false);
  }

  backupUniverse();
  startGame(game.id);

  const gProgress  = getGameProgress(progress, game.id);
  const isPhase1   = phase === 1;
  const phaseFiles = isPhase1
    ? gProgress.pendingFiles.filter(f => f.endsWith('.gd'))
    : gProgress.pendingFiles.filter(f => f.endsWith('.tscn'));
  const budget     = isPhase1 ? 4 : 5;

  try {
    log.code = await run(
      `Code-Phase${phase}`,
      (id, st, u, art, tmpl, opts) =>
        import('./agents/code-agent.js').then(m => m.run(id, st, u, art, tmpl, opts)),
      [idea, story, { worlds: universe.worlds }, universe.art, template, {
        pendingFiles:   phaseFiles,
        completedFiles: gProgress.completedFiles,
        budget,
      }]
    );

    if (!log.code?.success) throw new Error(log.code?.error || 'code-failed');

    for (const f of (log.code.data?.files || [])) {
      saveGameFile(game.id, f.name, f.content);
    }

    const updated = getGameProgress(loadProgress(), game.id);

    if (phase === 2 && updated.pendingFiles.length === 0) {
      completeGame(game.id);
      save('code.json', log.code.data);
      triggerGodotExport(game.id);
      logger.info('[OK] Game complete', { id: game.id });
    } else {
      logger.info(`[OK] Phase ${phase} done`, {
        done:    updated.completedFiles.length,
        pending: updated.pendingFiles.length,
      });
    }

    clearBackup();
    resetSessionKey();
    return saveReport(log, t0, runId, taskKey, true);

  } catch (err) {
    log.code = { success: false, error: err.message, duration: '—' };
    rollbackUniverse();
    failTask(`${taskKey}-failed`);
    logger.warn(`[GAME] Phase ${phase} failed — retry same day next week`, {
      error: err.message,
    });
    return saveReport(log, t0, runId, taskKey, false);
  }
}

// ══════════════════════════════════════════════════════════
// نقطة الدخول
// ══════════════════════════════════════════════════════════
async function main() {
  const t0       = Date.now();
  const runId    = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const mode     = process.env.MODE || 'auto';
  const universe = loadUniverse();
  const budget   = getBudgetStatus();

  logger.info('[START] Orchestrator v10.5', {
    runId, mode,
    day:         DAY_NAMES[DAY],
    task:        getDayTask(),
    hasUniverse: !!universe,
    quotaLeft:   budget.left,
    keys:        budget.keys?.map(k => `${k.key}:${k.left}`).join(' | '),
    library:     `${getLibraryStatus().percent}%`,
  });

  if (mode === 'birth' || !universe) return birthMode(t0, runId);

  const handlers = {
    library:       () => libraryDay(t0, runId),
    inventor:      () => inventorDay(universe, t0, runId),
    screenplay:    () => screenplayDay(universe, t0, runId),
    production:    () => productionDay(universe, t0, runId),
    'game-phase1': () => gamePhase(universe, 1, t0, runId),
    'game-phase2': () => gamePhase(universe, 2, t0, runId),
    sync: async () => {
      const log = {};
      log.sync = await run('Sync',
        () => import('./scripts/sync-to-supabase.js').then(m => m.run()), []);
      return saveReport(log, t0, runId, 'sync', log.sync?.success || false);
    },
  };

  const task = handlers[mode] ? mode : getDayTask();
  return (handlers[task] || handlers.library)();
}

// ══════════════════════════════════════════════════════════
// BIRTH MODE
// ══════════════════════════════════════════════════════════
async function birthMode(t0, runId) {
  logger.info('[BIRTH] Creating universe from scratch');
  const log = {}, data = {};

  const agents = [
    { name: 'Idea',  path: './agents/idea-agent.js',  key: 'idea',  out: 'ideas.json',
      args: () => [] },
    { name: 'Story', path: './agents/story-agent.js', key: 'story', out: 'story.json',
      args: () => [data.idea] },
    { name: 'Soul',  path: './agents/soul-agent.js',  key: 'soul',  out: 'soul.json',
      args: () => [data.idea, data.story] },
    { name: 'Art',   path: './agents/art-agent.js',   key: 'art',   out: 'art.json',
      args: () => [data.idea, data.story, data.soul] },
  ];

  for (const ag of agents) {
    if (!canAfford(ag.key)) {
      logger.error(`[BIRTH] ${ag.name} — insufficient quota`);
      return saveReport(log, t0, runId, 'birth', false);
    }
    await sleep(DELAY);
    log[ag.name] = await run(ag.name,
      (...a) => import(ag.path).then(m => m.run(...a)), ag.args());
    if (log[ag.name]?.success) {
      data[ag.key] = log[ag.name].data;
      save(ag.out, data[ag.key]);
    } else {
      logger.error(`[BIRTH] ${ag.name} failed — aborting`);
      return saveReport(log, t0, runId, 'birth', false);
    }
  }

  // template-engineer بعد art-agent — rule-178
  log.template = await run('Template',
    (id, st) => import('./agents/template-engineer.js').then(m => m.run(id, st)),
    [data.idea, data.story]);
  if (log.template?.success) {
    data.template = log.template.data;
    writeFileSync(join(__dirname, 'agents', 'template.json'),
      JSON.stringify(data.template, null, 2), 'utf8');
    save('template.json', data.template);
  }

  if (canAfford('world')) {
    await sleep(DELAY);
    log.world = await run('World',
      p => import('./agents/world-birth-agent.js').then(m => m.run(p)),
      [{ id: data.idea.id, name: data.idea.name, soul: data.soul, worlds: [] }]);
    data.worlds = log.world?.success ? [log.world.data] : [];
    save('levels.json', { worlds: data.worlds });
  }

  const universe = {
    id:          data.idea.id,
    name:        data.idea.name,
    born:        new Date().toISOString(),
    soul:        data.soul,
    art:         data.art,
    worlds:      data.worlds || [],
    evolutions:  0, inventions: 0, revivals: 0,
    lastEvolved: null, lastInvented: null, lastRevived: null,
  };

  saveUniverse(universe);
  resetSessionKey();
  return saveReport(log, t0, runId, 'birth', true);
}

// ══════════════════════════════════════════════════════════
// تقرير النهاية
// ══════════════════════════════════════════════════════════
function saveReport(log, t0, runId, mode, success) {
  const budget   = getBudgetStatus();
  const lib      = getLibraryStatus();
  const progress = loadProgress();
  const series   = loadSeries();

  const report = {
    runId, mode, success,
    timestamp:     new Date().toISOString(),
    totalDuration: fmt(Date.now() - t0),
    budget: {
      total: budget.total, limit: budget.limit,
      left:  budget.left,  keys:  budget.keys,
    },
    library:  { built: lib.built, total: lib.total, percent: `${lib.percent}%` },
    series:   { episodes: series?.episodes?.length ?? 0, next: series?.nextEpisode ?? 1 },
    progress: {
      nextEpisode:   progress.series?.nextEpisode,
      totalEpisodes: progress.series?.totalEpisodes,
      gamesDone:     progress.games?.done?.length ?? 0,
    },
    agents: Object.fromEntries(
      Object.entries(log).map(([k, v]) => [k, {
        success:  v?.success  || false,
        duration: v?.duration || '—',
        error:    v?.error    || null,
      }])
    ),
    summary: {
      total:  Object.keys(log).length,
      passed: Object.values(log).filter(v => v?.success).length,
      failed: Object.values(log).filter(v => !v?.success).length,
    },
  };

  writeFileSync(
    join(RESULTS_DIR, 'run-report.json'),
    JSON.stringify(report, null, 2), 'utf8'
  );

  logger.info('[DONE] Orchestrator v10.5', {
    mode, success,
    duration: report.totalDuration,
    passed:   report.summary.passed,
    failed:   report.summary.failed,
    quota:    `${budget.total}/${budget.limit}`,
    episodes: report.series.episodes,
  });

  return report;
}

// ══════════════════════════════════════════════════════════
// تصدير Godot
// ══════════════════════════════════════════════════════════
function triggerGodotExport(gameId = '') {
  try {
    execSync(
      `gh workflow run godot-export.yml --repo ${process.env.GITHUB_REPOSITORY}` +
      (gameId ? ` -f game_id=${gameId}` : ''),
      { stdio: 'pipe' }
    );
    logger.info('[OK] Godot export triggered', { gameId });
  } catch (err) {
    logger.warn('[WARN] Could not trigger export', { error: err.message });
  }
}

// ══════════════════════════════════════════════════════════
// تشغيل
// ══════════════════════════════════════════════════════════
main().catch(err => {
  logger.error('[CRASH] Orchestrator v10.5', { error: err.message });
  if (existsSync(UNIVERSE_BAK)) rollbackUniverse();
  process.exit(1);
});
