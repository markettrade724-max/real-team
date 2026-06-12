/**
 * orchestrator.js — v10.3
 *
 * التغييرات عن v10.2:
 *  - جدول ثابت: مهمة واحدة في اليوم — كاملة أو لا شيء
 *  - فشل المهمة يُسجَّل في progress.json ويُعاد نفس اليوم من الأسبوع القادم
 *  - getNextGameTask تبدأ لعبة جديدة من products.json إذا لا يوجد current
 *  - selectKeyForTask قبل كل مهمة — ضمان الحصة الكافية
 *  - resetSessionKey بعد كل مهمة مكتملة
 *  - لا تجزئة داخل اليوم — وحدة كاملة أو لا شيء
 *
 * الجدول الأسبوعي الثابت:
 *   السبت    → library      (40 طلب)
 *   الأحد    → inventor     (40 طلب)
 *   الاثنين  → backbone     (1 طلب)
 *   الثلاثاء → scenes       (1 طلب)
 *   الأربعاء → dialogue     (1 طلب)
 *   الخميس   → game phase1  (4 طلبات)
 *   الجمعة   → game phase2  (5 طلبات)
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
import { run as runAnalytics }                 from './agents/analytics-agent.js';
import {
  loadProgress, saveProgress,
  startEpisode,  completeEpisode,
  startGame,     completeGame,
  saveEpisodeStep, getEpisodeProgress,
  saveGameFile,    getGameProgress,
  failTask,
} from './scripts/progress.js';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR  = join(__dirname, 'agent-results');
const UNIVERSE     = join(__dirname, 'universe.json');
const UNIVERSE_BAK = join(__dirname, 'universe.backup.json');

if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

const DELAY   = 15000;
const TIMEOUT = 180000;

// ── أدوات مساعدة ────────────────────────────────────────
const save  = (file, data) =>
  writeFileSync(join(RESULTS_DIR, file), JSON.stringify(data, null, 2), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt   = ms => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

// ── اليوم الحالي ─────────────────────────────────────────
const DAY = new Date().getDay(); // 0=أحد … 6=سبت

/**
 * getDayTask() — يحدد مهمة اليوم من الجدول الثابت
 * السبت=6 / الأحد=0 / الاثنين=1 / الثلاثاء=2 / الأربعاء=3 / الخميس=4 / الجمعة=5
 */
function getDayTask() {
  const map = {
    6: 'library',
    0: 'inventor',
    1: 'backbone',
    2: 'scenes',
    3: 'dialogue',
    4: 'game-phase1',
    5: 'game-phase2',
  };
  return map[DAY] ?? 'library';
}

/** الحصة المطلوبة لكل مهمة */
const TASK_COST = {
  'library':     40,
  'inventor':    40,
  'backbone':     1,
  'scenes':       1,
  'dialogue':     1,
  'game-phase1':  4,
  'game-phase2':  5,
};

logger.info('[SCHEDULE] Today', {
  day:  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][DAY],
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
async function run(name, agentPath, args = [], costKey = null) {
  logger.info(`[RUN] ${name}`);

  if (costKey && !canAfford(costKey)) {
    logger.warn(`[SKIP] ${name} — insufficient quota`);
    return { success: false, error: 'InsufficientQuota', duration: '0ms' };
  }

  if (costKey) await sleep(DELAY);

  const t0 = Date.now();
  try {
    const mod    = await import(`${agentPath}?t=${Date.now()}`);
    const result = await Promise.race([
      mod.run(...args),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('Timeout')), TIMEOUT)
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
// التحقق من الحصة — وحدة كاملة أو لا شيء
// ══════════════════════════════════════════════════════════
function hasEnoughQuota(task) {
  const needed = TASK_COST[task] ?? 1;
  const key    = selectKeyForTask(needed);
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
      success: true,
      data:    { built },
      duration: fmt(Date.now() - t0lib),
    };
    resetSessionKey();
  } catch (err) {
    log.library = {
      success: false,
      error:   err.message,
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
    'Inventor', './agents/inventor-agent.js', [universe], 'inventor'
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
// خطوة screenplay — الاثنين/الثلاثاء/الأربعاء
// ══════════════════════════════════════════════════════════
async function screenplayStep(universe, step, t0, runId) {
  logger.info(`[SCREENPLAY] Step: ${step}`);
  const log      = {};
  const progress = loadProgress();

  if (!hasEnoughQuota(step)) {
    failTask(`screenplay-${step}-no-quota`);
    return saveReport(log, t0, runId, step, false);
  }

  const episodeNumber  = progress.series?.nextEpisode ?? 1;
  const epProgress     = getEpisodeProgress(progress, episodeNumber);

  // تحقق أن هذه الخطوة لم تُنجز مسبقاً
  if (epProgress.completedSteps.includes(step)) {
    logger.info(`[SCREENPLAY] Step ${step} already done — skipping`);
    log.screenplay = { success: true, data: { skipped: true }, duration: '0ms' };
    return saveReport(log, t0, runId, step, true);
  }

  startEpisode(episodeNumber);

  try {
    const result = await run(
      `Screenplay-${step}`, './agents/screenplay-agent.js',
      [universe, episodeNumber, { fromStep: step }], 'screenplay'
    );

    if (!result.success) throw new Error(result.error || 'screenplay-failed');

    log.screenplay = result;
    saveEpisodeStep(episodeNumber, step, result.data);

    // إذا اكتملت الخطوة الأخيرة — أغلق الحلقة
    const updated = getEpisodeProgress(loadProgress(), episodeNumber);
    if (updated.completedSteps.includes('dialogue')) {
      completeEpisode(episodeNumber);
      logger.info('[OK] Episode complete', {
        episode: episodeNumber,
        title:   result.data?.title,
      });
    }

    resetSessionKey();
    return saveReport(log, t0, runId, step, true);
  } catch (err) {
    log.screenplay = { success: false, error: err.message, duration: '—' };
    failTask(`screenplay-${step}-failed`);
    logger.warn(`[SCREENPLAY] ${step} failed — will retry next week`, {
      error: err.message,
    });
    return saveReport(log, t0, runId, step, false);
  }
}

// ══════════════════════════════════════════════════════════
// اللعبة — الخميس (phase1) والجمعة (phase2)
// ══════════════════════════════════════════════════════════

/** يجد اللعبة الجارية أو يبدأ جديدة من products.json */
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
    logger.warn('[GAME] No game task found — nothing to build');
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
      `Code-Phase${phase}`, './agents/code-agent.js',
      [idea, story, { worlds: universe.worlds }, universe.art, template, {
        phase,
        pendingFiles:   gameProgress.pendingFiles,
        completedFiles: gameProgress.completedFiles,
      }], 'code-agent'
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
    logger.warn(`[GAME] Phase${phase} failed — will retry next week`, {
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

  logger.info('[START] Orchestrator v10.3', {
    runId,
    mode,
    day:         ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][DAY],
    task:        getDayTask(),
    hasUniverse: !!universe,
    quotaLeft:   budget.left,
    keys:        budget.keys?.map(k => `${k.key}:${k.left}`).join(' | '),
    library:     `${getLibraryStatus().percent}%`,
  });

  // BIRTH MODE — عند غياب universe أو طلب صريح
  if (mode === 'birth' || !universe) return birthMode(t0, runId);

  // أوضاع يدوية
  if (mode === 'library')   return libraryDay(t0, runId);
  if (mode === 'inventor')  return inventorDay(universe, t0, runId);
  if (mode === 'backbone')  return screenplayStep(universe, 'backbone',  t0, runId);
  if (mode === 'scenes')    return screenplayStep(universe, 'scenes',    t0, runId);
  if (mode === 'dialogue')  return screenplayStep(universe, 'dialogue',  t0, runId);
  if (mode === 'game-phase1') return gamePhase(universe, 1, t0, runId);
  if (mode === 'game-phase2') return gamePhase(universe, 2, t0, runId);
  if (mode === 'sync') {
    const log = {};
    log.sync = await run('Supabase Sync', './scripts/sync-to-supabase.js', []);
    return saveReport(log, t0, runId, 'sync', log.sync?.success || false);
  }

  // الجدول التلقائي
  const task = getDayTask();
  if (task === 'library')     return libraryDay(t0, runId);
  if (task === 'inventor')    return inventorDay(universe, t0, runId);
  if (task === 'backbone')    return screenplayStep(universe, 'backbone',  t0, runId);
  if (task === 'scenes')      return screenplayStep(universe, 'scenes',    t0, runId);
  if (task === 'dialogue')    return screenplayStep(universe, 'dialogue',  t0, runId);
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
      out: 'ideas.json', getArgs: () => [] },
    { name: 'Story Agent', path: './agents/story-agent.js', key: 'story',
      out: 'story.json', getArgs: () => [data.idea] },
    { name: 'Soul Agent',  path: './agents/soul-agent.js',  key: 'soul',
      out: 'soul.json',  getArgs: () => [data.idea, data.story] },
    { name: 'Art Agent',   path: './agents/art-agent.js',   key: 'art',
      out: 'art.json',   getArgs: () => [data.idea, data.story, data.soul] },
  ];

  for (const agent of agents) {
    log[agent.name] = await run(agent.name, agent.path, agent.getArgs(), agent.key);
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
    'Template Engineer', './agents/template-engineer.js',
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
    log.world   = await run('World 1', './agents/world-birth-agent.js',
      [partial], 'world');
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

  logger.info('[DONE] Orchestrator v10.3', {
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
    logger.warn('[WARN] Could not trigger Godot export', { error: err.message });
  }
}

// ══════════════════════════════════════════════════════════
// تشغيل
// ══════════════════════════════════════════════════════════
main().catch(err => {
  logger.error('[CRASH] Orchestrator v10.3', { error: err.message });
  if (existsSync(UNIVERSE_BAK)) rollbackUniverse();
  process.exit(1);
});
