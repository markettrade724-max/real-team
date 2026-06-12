/**
 * orchestrator.js — v10.4
 *
 * التغييرات عن v10.3:
 *  - الاثنين/الأربعاء: screenplay كامل (backbone+scenes+dialogue) في يوم واحد
 *  - الثلاثاء: إنتاج كامل (voice+visual+subtitle+music+edit+upload)
 *  - كل أسبوع = حلقتان كاملتان + لعبة كاملة
 *  - screenplayDay(): 3 خطوات متسلسلة في نفس اليوم
 *  - productionDay(): خط الإنتاج الكامل بدون Gemini
 *  - لا تجزئة — وحدة كاملة أو لا شيء (rule-153)
 *
 * الجدول الأسبوعي الثابت:
 *   السبت    → library       (40 طلب Gemini)
 *   الأحد    → inventor      (40 طلب Gemini)
 *   الاثنين  → screenplay    (3 طلبات Gemini — backbone+scenes+dialogue)
 *   الثلاثاء → production    (0 طلبات Gemini — voice+visual+edit+upload)
 *   الأربعاء → screenplay    (3 طلبات Gemini — حلقة جديدة)
 *   الخميس   → game phase1   (4 طلبات Gemini)
 *   الجمعة   → game phase2   (5 طلبات Gemini)
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
  loadProgress, saveProgress,
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

if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

const DELAY   = 15000;  // تأخير بين طلبات Gemini
const TIMEOUT = 600000; // 10 دقائق لكل وكيل (edit/voice قد يأخذان وقتاً)

// ── أدوات مساعدة ────────────────────────────────────────
const save  = (file, data) =>
  writeFileSync(join(RESULTS_DIR, file), JSON.stringify(data, null, 2), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt   = ms => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

// ── اليوم الحالي ─────────────────────────────────────────
const DAY = new Date().getDay(); // 0=أحد … 6=سبت

/**
 * getDayTask() — يحدد مهمة اليوم من الجدول الثابت
 * 0=أحد / 1=اثنين / 2=ثلاثاء / 3=أربعاء / 4=خميس / 5=جمعة / 6=سبت
 */
function getDayTask() {
  const map = {
    6: 'library',      // السبت
    0: 'inventor',     // الأحد
    1: 'screenplay',   // الاثنين  — backbone+scenes+dialogue
    2: 'production',   // الثلاثاء — voice+visual+edit+upload
    3: 'screenplay',   // الأربعاء — backbone+scenes+dialogue (حلقة جديدة)
    4: 'game-phase1',  // الخميس
    5: 'game-phase2',  // الجمعة
  };
  return map[DAY] ?? 'library';
}

/** الحصة المطلوبة من Gemini لكل مهمة */
const TASK_COST = {
  'library':     40,
  'inventor':    40,
  'screenplay':   3,  // backbone(1) + scenes(1) + dialogue(1)
  'production':   0,  // لا Gemini — voice/visual/edit/upload محلي
  'game-phase1':  4,
  'game-phase2':  5,
};

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

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
// أدوات قراءة/كتابة
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

// ══════════════════════════════════════════════════════════
// تشغيل وكيل — مع timeout وحماية من crash
// ══════════════════════════════════════════════════════════
async function run(name, agentFn, args = [], costKey = null) {
  logger.info(`[RUN] ${name}`);

  if (costKey && !canAfford(costKey)) {
    logger.warn(`[SKIP] ${name} — insufficient quota`);
    return { success: false, error: 'InsufficientQuota', duration: '0ms' };
  }

  if (costKey) await sleep(DELAY);

  const t0 = Date.now();
  try {
    const result = await Promise.race([
      agentFn(...args),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error(`Timeout after ${TIMEOUT/1000}s`)), TIMEOUT)
      ),
    ]);
    const d = fmt(Date.now() - t0);
    logger.info(`[OK] ${name}`, { duration: d, quotaLeft: getRemainingQuota() });
    return { success: true, data: result, duration: d };
  } catch (err) {
    const d = fmt(Date.now() - t0);
    logger.error(`[FAIL] ${name}`, {
      error: err.message.slice(0, 120), duration: d,
    });
    return { success: false, error: err.message.slice(0, 120), duration: d };
  }
}

// ══════════════════════════════════════════════════════════
// التحقق من الحصة — وحدة كاملة أو لا شيء (rule-153)
// ══════════════════════════════════════════════════════════
function hasEnoughQuota(task) {
  const needed = TASK_COST[task] ?? 0;
  if (needed === 0) return true; // production لا يحتاج Gemini
  const key = selectKeyForTask(needed);
  if (!key) {
    logger.warn(`[QUOTA] Not enough quota for ${task}`, {
      needed, left: getRemainingQuota(),
    });
    return false;
  }
  return true;
}

// ══════════════════════════════════════════════════════════
// يوم المكتبة — السبت
// ══════════════════════════════════════════════════════════
async function libraryDay(t0, runId) {
  logger.info('[LIBRARY] Saturday — full quota for library');
  const log = {};

  if (getLibraryStatus().remaining === 0) {
    logger.info('[LIBRARY] Already complete');
    log.library = { success: true, data: { skipped: true }, duration: '0ms' };
    return saveReport(log, t0, runId, 'library', true);
  }

  const t0lib = Date.now();
  let built = 0;
  try {
    while (getRemainingQuota() >= 2 && getLibraryStatus().remaining > 0) {
      const result = await runLibrary();
      built += result?.built || 0;
      if (!result?.built) break;
      logger.info('[LIBRARY] Batch done', {
        percent:   `${getLibraryStatus().percent}%`,
        quotaLeft: getRemainingQuota(),
      });
    }
    log.library = {
      success:  true,
      data:     { built },
      duration: fmt(Date.now() - t0lib),
    };
    resetSessionKey();
  } catch (err) {
    log.library = {
      success:  false,
      error:    err.message,
      duration: fmt(Date.now() - t0lib),
    };
    failTask('library-failed');
  }

  // analytics في نهاية كل سبت
  try {
    const universe = loadUniverse();
    if (universe) {
      const r = await runAnalytics(universe);
      log.analytics = { success: true, data: r, duration: '—' };
      save('analytics.json', r);
    }
  } catch {}

  return saveReport(log, t0, runId, 'library', log.library?.success || false);
}

// ══════════════════════════════════════════════════════════
// يوم المخترع — الأحد
// ══════════════════════════════════════════════════════════
async function inventorDay(universe, t0, runId) {
  logger.info('[INVENTOR] Sunday — full quota for inventor');
  const log = {};

  if (!hasEnoughQuota('inventor')) {
    failTask('inventor-no-quota');
    return saveReport(log, t0, runId, 'inventor', false);
  }

  backupUniverse();

  log.invention = await run(
    'Inventor',
    (u) => import('./agents/inventor-agent.js').then(m => m.run(u)),
    [universe], 'inventor'
  );

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
// يوم السيناريو — الاثنين والأربعاء
// backbone + scenes + dialogue في نفس اليوم
// ══════════════════════════════════════════════════════════
async function screenplayDay(universe, t0, runId) {
  logger.info('[SCREENPLAY] Full day — backbone + scenes + dialogue');
  const log      = {};
  const progress = loadProgress();

  if (!hasEnoughQuota('screenplay')) {
    failTask('screenplay-no-quota');
    return saveReport(log, t0, runId, 'screenplay', false);
  }

  const episodeNumber = progress.series?.nextEpisode ?? 1;
  const epProgress    = getEpisodeProgress(progress, episodeNumber);

  logger.info('[SCREENPLAY] Episode', {
    episode:   episodeNumber,
    completed: epProgress.completedSteps,
    pending:   epProgress.pendingSteps,
  });

  // إذا الحلقة مكتملة بالفعل — ابدأ الجديدة
  const effectiveEpisode = epProgress.completedSteps.length === 3
    ? episodeNumber + 1
    : episodeNumber;

  startEpisode(effectiveEpisode);

  const STEPS = ['backbone', 'scenes', 'dialogue'];

  try {
    let screenplay = null;

    for (const step of STEPS) {
      const stepProgress = getEpisodeProgress(loadProgress(), effectiveEpisode);

      // تخطّ الخطوات المكتملة مسبقاً
      if (stepProgress.completedSteps.includes(step)) {
        logger.info(`[SCREENPLAY] Step ${step} already done — skipping`);
        continue;
      }

      logger.info(`[SCREENPLAY] Step: ${step}`);

      const result = await run(
        `Screenplay-${step}`,
        (u, ep, opts) => runScreenplay(u, ep, opts),
        [universe, effectiveEpisode, { fromStep: step }],
        'screenplay'
      );

      if (!result.success) throw new Error(result.error || `${step}-failed`);

      screenplay = result.data;
      saveEpisodeStep(effectiveEpisode, step, screenplay);

      logger.info(`[OK] ${step} done`, { episode: effectiveEpisode });
    }

    // حفظ السيناريو الكامل للإنتاج غداً
    if (screenplay) {
      save('screenplay-pending.json', {
        episode:  effectiveEpisode,
        screenplay,
        savedAt:  new Date().toISOString(),
      });
      log.screenplay = { success: true, data: { episode: effectiveEpisode, title: screenplay.title }, duration: '—' };
    }

    resetSessionKey();
    logger.info('[OK] Screenplay day complete', {
      episode: effectiveEpisode,
      title:   screenplay?.title,
    });

    return saveReport(log, t0, runId, 'screenplay', true);

  } catch (err) {
    log.screenplay = { success: false, error: err.message, duration: '—' };
    failTask(`screenplay-failed: ${err.message.slice(0, 80)}`);
    logger.warn('[SCREENPLAY] Failed — will retry same day next week', {
      error: err.message,
    });
    return saveReport(log, t0, runId, 'screenplay', false);
  }
}

// ══════════════════════════════════════════════════════════
// يوم الإنتاج — الثلاثاء
// voice + visual + subtitle + music + edit + trailer + upload
// لا Gemini — خالص محلي + APIs خارجية
// ══════════════════════════════════════════════════════════
async function productionDay(universe, t0, runId) {
  logger.info('[PRODUCTION] Tuesday — full production pipeline');
  const log = {};

  // قراءة السيناريو المحفوظ من يوم الاثنين
  const pending = loadResult('screenplay-pending.json');
  if (!pending?.screenplay) {
    logger.error('[PRODUCTION] No pending screenplay found — run screenplay day first');
    failTask('production-no-screenplay');
    return saveReport(log, t0, runId, 'production', false);
  }

  const { episode, screenplay } = pending;
  const progress = loadProgress();

  logger.info('[PRODUCTION] Starting pipeline', {
    episode,
    title: screenplay.title,
  });

  try {
    // ── 1. صوت ────────────────────────────────────────────
    logger.info('[PRODUCTION] Step 1/7 — Voice');
    const voiceResult = await run(
      'Voice', (s) => runVoice(s), [screenplay]
    );
    if (!voiceResult.success) throw new Error(voiceResult.error || 'voice-failed');
    log.voice = voiceResult;
    const audioManifest = voiceResult.data;

    // ── 2. مشاهد بصرية ────────────────────────────────────
    logger.info('[PRODUCTION] Step 2/7 — Visual scenes');
    const sceneResult = await run(
      'Scene', (s, u) => runScene(s, u), [screenplay, universe]
    );
    if (!sceneResult.success) throw new Error(sceneResult.error || 'scene-failed');
    log.scene = sceneResult;
    const visualScenes = sceneResult.data;

    // ── 3. صور ────────────────────────────────────────────
    logger.info('[PRODUCTION] Step 3/7 — Images');
    const visualResult = await run(
      'Visual', (vs, ep) => runVisual(vs, ep), [visualScenes, episode]
    );
    if (!visualResult.success) throw new Error(visualResult.error || 'visual-failed');
    log.visual = visualResult;
    const visualManifest = visualResult.data;

    // ── 4. ترجمة ─────────────────────────────────────────
    logger.info('[PRODUCTION] Step 4/7 — Subtitles');
    const subtitleResult = await run(
      'Subtitle', (s, a) => runSubtitle(s, a), [screenplay, audioManifest]
    );
    log.subtitle = subtitleResult;
    const subtitles = subtitleResult.success ? subtitleResult.data : null;

    // ── 5. موسيقى ────────────────────────────────────────
    logger.info('[PRODUCTION] Step 5/7 — Music');
    const musicResult = await run(
      'Music', (s, u) => runMusic(s, u), [screenplay, universe]
    );
    log.music = musicResult;
    const music = musicResult.success ? musicResult.data : null;

    // ── 6. مونتاج ────────────────────────────────────────
    logger.info('[PRODUCTION] Step 6/7 — Edit');
    const editResult = await run(
      'Edit',
      (s, vm, am, sub, mus) => runEdit(s, vm, am, sub, mus),
      [screenplay, visualManifest, audioManifest, subtitles, music]
    );
    if (!editResult.success) throw new Error(editResult.error || 'edit-failed');
    log.edit = editResult;
    const episodeFile = editResult.data;

    // ── 7. تريلر ─────────────────────────────────────────
    logger.info('[PRODUCTION] Step 7/7 — Trailer');
    const trailerResult = await run(
      'Trailer',
      (s, vm, am, ep) => runTrailer(s, vm, am, ep),
      [screenplay, visualManifest, audioManifest, episodeFile]
    );
    log.trailer = trailerResult;
    const trailer = trailerResult.success ? trailerResult.data : null;

    // ── نشر ───────────────────────────────────────────────
    logger.info('[PRODUCTION] Upload');
    const series = loadSeriesJson();
    const uploadResult = await run(
      'Upload',
      (ep, s, tr) => runUpload(ep, s, tr),
      [episodeFile, series, trailer]
    );
    log.upload = uploadResult;

    // ── تحديث progress.json ───────────────────────────────
    completeEpisode(episode);
    resetSessionKey();

    // ── حذف السيناريو المعلق ─────────────────────────────
    try {
      const pendingPath = join(RESULTS_DIR, 'screenplay-pending.json');
      if (existsSync(pendingPath)) unlinkSync(pendingPath);
    } catch {}

    logger.info('[OK] Production complete', {
      episode,
      title:   screenplay.title,
      youtube: log.upload?.data?.youtube?.url  || 'skipped',
      tiktok:  log.upload?.data?.tiktok?.url   || 'skipped',
    });

    return saveReport(log, t0, runId, 'production', true);

  } catch (err) {
    log.production = { success: false, error: err.message, duration: '—' };
    failTask(`production-failed: ${err.message.slice(0, 80)}`);
    logger.warn('[PRODUCTION] Failed — will retry same day next week', {
      error: err.message,
    });
    return saveReport(log, t0, runId, 'production', false);
  }
}

// ══════════════════════════════════════════════════════════
// بناء لعبة — الخميس (phase1) والجمعة (phase2)
// ══════════════════════════════════════════════════════════
function getNextGameTask(progress) {
  if (progress.games?.current) return progress.games.current;
  const products = loadProducts();
  const next = products.find(pr =>
    pr.type === 'godot' &&
    !progress.games?.done?.includes(pr.id)
  );
  return next ?? null;
}

async function gamePhase(universe, phase, t0, runId) {
  const taskKey  = phase === 1 ? 'game-phase1' : 'game-phase2';
  const progress = loadProgress();
  const game     = getNextGameTask(progress);
  const log      = {};

  logger.info(`[GAME] Phase ${phase}`);

  if (!game) {
    logger.warn('[GAME] No game task found');
    return saveReport(log, t0, runId, taskKey, false);
  }

  if (!hasEnoughQuota(taskKey)) {
    failTask(`${taskKey}-no-quota`);
    return saveReport(log, t0, runId, taskKey, false);
  }

  const gameProgress = getGameProgress(progress, game.id);
  const idea         = loadResult('ideas.json');
  const story        = loadResult('story.json');
  const template     = loadResult('template.json');

  if (!idea) {
    logger.error('[GAME] ideas.json not found');
    failTask(`${taskKey}-no-idea`);
    return saveReport(log, t0, runId, taskKey, false);
  }

  backupUniverse();
  startGame(game.id);

  try {
    log.code = await run(
      `Code-Phase${phase}`,
      (id, st, u, art, tmpl, opts) =>
        import('./agents/code-agent.js').then(m => m.run(id, st, u, art, tmpl, opts)),
      [idea, story, { worlds: universe.worlds }, universe.art, template, {
        phase,
        pendingFiles:   gameProgress.pendingFiles,
        completedFiles: gameProgress.completedFiles,
      }],
      'code-agent'
    );

    if (!log.code?.success) throw new Error(log.code?.error || 'code-failed');

    const newFiles = log.code.data?.files || [];
    for (const f of newFiles) saveGameFile(game.id, f.name, f.content);

    const updated = getGameProgress(loadProgress(), game.id);

    if (phase === 2 && updated.pendingFiles.length === 0) {
      completeGame(game.id);
      save('code.json', log.code.data);
      logger.info('[OK] Game complete', { id: game.id });
      triggerGodotExport(game.id);
    } else {
      logger.info(`[OK] Game phase${phase} done`, {
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
    logger.warn(`[GAME] Phase${phase} failed — will retry same day next week`, {
      error: err.message,
    });
    return saveReport(log, t0, runId, taskKey, false);
  }
}

// ══════════════════════════════════════════════════════════
// نقطة الدخول
// ══════════════════════════════════════════════════════════
async function main() {
  const t0      = Date.now();
  const runId   = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const mode    = process.env.MODE || 'auto';
  const universe = loadUniverse();
  const budget  = getBudgetStatus();

  logger.info('[START] Orchestrator v10.4', {
    runId,
    mode,
    day:         DAY_NAMES[DAY],
    task:        getDayTask(),
    hasUniverse: !!universe,
    quotaLeft:   budget.left,
    keys:        budget.keys?.map(k => `${k.key}:${k.left}`).join(' | '),
    library:     `${getLibraryStatus().percent}%`,
  });

  // BIRTH MODE
  if (mode === 'birth' || !universe) return birthMode(t0, runId);

  // أوضاع يدوية
  if (mode === 'library')     return libraryDay(t0, runId);
  if (mode === 'inventor')    return inventorDay(universe, t0, runId);
  if (mode === 'screenplay')  return screenplayDay(universe, t0, runId);
  if (mode === 'production')  return productionDay(universe, t0, runId);
  if (mode === 'game-phase1') return gamePhase(universe, 1, t0, runId);
  if (mode === 'game-phase2') return gamePhase(universe, 2, t0, runId);
  if (mode === 'sync') {
    const log = {};
    log.sync = await run(
      'Supabase Sync',
      () => import('./scripts/sync-to-supabase.js').then(m => m.run()),
      []
    );
    return saveReport(log, t0, runId, 'sync', log.sync?.success || false);
  }

  // الجدول التلقائي
  const task = getDayTask();
  if (task === 'library')     return libraryDay(t0, runId);
  if (task === 'inventor')    return inventorDay(universe, t0, runId);
  if (task === 'screenplay')  return screenplayDay(universe, t0, runId);
  if (task === 'production')  return productionDay(universe, t0, runId);
  if (task === 'game-phase1') return gamePhase(universe, 1, t0, runId);
  if (task === 'game-phase2') return gamePhase(universe, 2, t0, runId);
}

// ══════════════════════════════════════════════════════════
// BIRTH MODE
// ══════════════════════════════════════════════════════════
async function birthMode(t0, runId) {
  logger.info('[BIRTH] Creating universe from scratch');
  const log = {}, data = {};

  const agents = [
    { name: 'Idea Agent',  path: './agents/idea-agent.js',  key: 'idea',
      out: 'ideas.json',  getArgs: () => [] },
    { name: 'Story Agent', path: './agents/story-agent.js', key: 'story',
      out: 'story.json',  getArgs: () => [data.idea] },
    { name: 'Soul Agent',  path: './agents/soul-agent.js',  key: 'soul',
      out: 'soul.json',   getArgs: () => [data.idea, data.story] },
    { name: 'Art Agent',   path: './agents/art-agent.js',   key: 'art',
      out: 'art.json',    getArgs: () => [data.idea, data.story, data.soul] },
  ];

  for (const agent of agents) {
    log[agent.name] = await run(
      agent.name,
      (...args) => import(agent.path).then(m => m.run(...args)),
      agent.getArgs(), agent.key
    );
    if (log[agent.name]?.success) {
      data[agent.key] = log[agent.name].data;
      save(agent.out, data[agent.key]);
    } else {
      logger.error(`[BIRTH] ${agent.name} failed — aborting`);
      return saveReport(log, t0, runId, 'birth', false);
    }
  }

  // template-engineer بعد art-agent (rule-178)
  log.template = await run(
    'Template Engineer',
    (id, st) => import('./agents/template-engineer.js').then(m => m.run(id, st)),
    [data.idea, data.story]
  );
  if (log.template?.success) {
    data.template = log.template.data;
    writeFileSync(
      join(__dirname, 'agents', 'template.json'),
      JSON.stringify(data.template, null, 2), 'utf8'
    );
    save('template.json', data.template);
  }

  // عالم أول إذا توفرت الحصة
  if (canAfford('world')) {
    const partial = {
      id: data.idea.id, name: data.idea.name,
      soul: data.soul, worlds: [],
    };
    log.world   = await run(
      'World 1',
      (p) => import('./agents/world-birth-agent.js').then(m => m.run(p)),
      [partial], 'world'
    );
    data.worlds = log.world?.success ? [log.world.data] : [];
    save('levels.json', { worlds: data.worlds });
  }

  const universe = {
    id:           data.idea.id,
    name:         data.idea.name,
    born:         new Date().toISOString(),
    soul:         data.soul,
    art:          data.art,
    worlds:       data.worlds || [],
    evolutions:   0,
    inventions:   0,
    revivals:     0,
    lastEvolved:  null,
    lastInvented: null,
    lastRevived:  null,
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

  const report = {
    runId, mode, success,
    timestamp:     new Date().toISOString(),
    totalDuration: fmt(Date.now() - t0),
    budget: {
      total:   budget.total,
      limit:   budget.limit,
      left:    budget.left,
      percent: `${budget.percent}%`,
      keys:    budget.keys,
    },
    library:  { built: lib.built, total: lib.total, percent: `${lib.percent}%` },
    progress: {
      current:       progress.current,
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

  logger.info('[DONE] Orchestrator v10.4', {
    mode, success,
    duration: report.totalDuration,
    passed:   report.summary.passed,
    failed:   report.summary.failed,
    quota:    `${budget.total}/${budget.limit}`,
    library:  `${lib.percent}%`,
  });

  return report;
}

// ══════════════════════════════════════════════════════════
// دوال مساعدة
// ══════════════════════════════════════════════════════════
function loadSeriesJson() {
  const p = join(__dirname, 'series.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function triggerGodotExport(gameId = '') {
  try {
    execSync(
      `gh workflow run godot-export.yml --repo ${process.env.GITHUB_REPOSITORY}` +
      (gameId ? ` -f game_id=${gameId}` : ''),
      { stdio: 'pipe' }
    );
    logger.info('[OK] Godot export triggered', { gameId });
  } catch (err) {
    logger.warn('[WARN] Could not trigger Godot export', { error: err.message });
  }
}

// ══════════════════════════════════════════════════════════
// تشغيل
// ══════════════════════════════════════════════════════════
main().catch(err => {
  logger.error('[CRASH] Orchestrator v10.4', { error: err.message });
  if (existsSync(UNIVERSE_BAK)) rollbackUniverse();
  process.exit(1);
});
