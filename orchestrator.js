/**
 * orchestrator.js — v10.2
 *
 * الجديد عن v10.1:
 *  - جدول يومي محدد: كل يوم مهمة واحدة واضحة
 *  - fillRemainingQuota: revival فقط — المكتبة للسبت حصراً
 *  - productionDay: screenplay أولاً ثم game ثم revival
 *  - getDayTask(): يحدد أولوية اليوم
 *
 * الجدول الأسبوعي:
 *   السبت  → library     كل الـ 20
 *   الأحد  → inventor    كل الـ 20
 *   الاثنين → screenplay (3) + game Phase (4-5) + revival
 *   الثلاثاء → screenplay (3) + game Phase (4-5) + revival
 *   الأربعاء → screenplay (3) + game Phase (4-5) + revival
 *   الخميس → screenplay (3) + game Phase (4-5) + revival
 *   الجمعة → screenplay (3) + game Phase (4-5) + revival
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
import { run as runSeries }                    from './agents/series-agent.js';
import { run as runRevival }                   from './agents/revival-agent.js';
import { run as runAnalytics }                 from './agents/analytics-agent.js';
import {
  loadProgress, saveProgress, getNextTask,
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

const save  = (file, data) =>
  writeFileSync(join(RESULTS_DIR, file), JSON.stringify(data, null, 2), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt   = ms => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

const DAY = new Date().getDay();
const IS_LIBRARY_DAY  = DAY === 6;
const IS_INVENTOR_DAY = DAY === 0;

// ══════════════════════════════════════════════════════════
// أولوية اليوم — ماذا ينتج اليوم؟
// ══════════════════════════════════════════════════════════
function getDayTask() {
  // السبت والأحد لهما وضع خاص
  if (IS_LIBRARY_DAY)  return 'library';
  if (IS_INVENTOR_DAY) return 'inventor';
  // الاثنين-الجمعة: screenplay أولاً ثم game
  return 'production';
}

logger.info('[SCHEDULE] Today', {
  day:     ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][DAY],
  task:    getDayTask(),
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

function loadProductsNeedingRevival() {
  const p = join(__dirname, 'products.json');
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
      .filter(pr => pr.status === 'needs_revival' || pr.health < 50)
      .slice(0, 1);
  } catch { return []; }
}

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
      new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), TIMEOUT)),
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
// fillRemainingQuota — revival فقط (library للسبت حصراً)
// ══════════════════════════════════════════════════════════
async function fillRemainingQuota(universe, log) {
  let quota = getRemainingQuota();
  if (quota < 2) return;

  logger.info('[FILL] Filling remaining quota with revival', { quota });
  let count = 0;

  while (quota >= 2) {
    const products = loadProductsNeedingRevival();
    if (!products.length) {
      logger.info('[FILL] No products need revival — stopping');
      break;
    }
    const r = await run('Revival', './agents/revival-agent.js',
      [products[0], universe], 'revival');
    if (!r.success) break;
    log[`revival_${++count}`] = r;
    quota = getRemainingQuota();
    await sleep(DELAY);
  }

  if (count > 0) logger.info(`[OK] Revival × ${count} completed`);
  logger.info('[FILL] Done', { quotaLeft: getRemainingQuota() });
}

// ══════════════════════════════════════════════════════════
// يوم المكتبة — السبت كاملاً
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
        percent:  `${getLibraryStatus().percent}%`,
        quotaLeft: getRemainingQuota(),
      });
    }
    log.library = { success: true, data: { built }, duration: fmt(Date.now() - t0lib) };
  } catch (err) {
    log.library = { success: false, error: err.message, duration: fmt(Date.now() - t0lib) };
  }

  // analytics في نهاية السبت
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
// يوم المخترع — الأحد كاملاً
// ══════════════════════════════════════════════════════════
async function inventorDay(universe, t0, runId) {
  logger.info('[INVENTOR] Sunday — full quota for inventor');
  const log = {};
  backupUniverse();

  log.invention = await run('Inventor', './agents/inventor-agent.js',
    [universe], 'inventor');

  if (log.invention?.success) {
    universe.inventions   = (universe.inventions || 0) + 1;
    universe.lastInvented = new Date().toISOString();
    saveUniverse(universe);
    clearBackup();
  } else {
    rollbackUniverse();
    failTask('inventor-failed');
  }

  return saveReport(log, t0, runId, 'invention', log.invention?.success || false);
}

// ══════════════════════════════════════════════════════════
// أيام الإنتاج — الاثنين إلى الجمعة
// ══════════════════════════════════════════════════════════
async function productionDay(universe, t0, runId) {
  const progress = loadProgress();
  const log      = {};

  logger.info('[PRODUCTION] Day', {
    day:      ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][DAY],
    quota:    getRemainingQuota(),
    current:  progress.current
      ? `${progress.current.type}:${progress.current.episode ?? progress.current.id}`
      : 'none',
  });

  backupUniverse();

  // ── 1. أولوية: الحلقة (3 طلبات) ─────────────
  const epNext = getNextTask(progress);
  let epDone   = false;

  if (epNext.type === 'continue' && epNext.task?.type === 'episode') {
    epDone = await produceEpisode(universe, epNext.task.episode, log, progress);
  } else if (epNext.type === 'new' && getRemainingQuota() >= 3) {
    epDone = await produceEpisode(universe, progress.series.nextEpisode, log, progress);
  } else {
    logger.info('[PRODUCTION] Episode skipped — insufficient quota');
  }

  // ── 2. بعد الحلقة: game إذا بقي 4+ طلبات ────
  if (getRemainingQuota() >= 4) {
    const gameNext = getNextGameTask(progress);
    if (gameNext) {
      await buildGame(universe, gameNext.id, log, progress, getRemainingQuota());
    }
  }

  // ── 3. ما تبقى: revival فقط ──────────────────
  await fillRemainingQuota(universe, log);

  // حفظ universe إذا أُضيف عالم
  if (log.world?.success && log.world.data) {
    universe.worlds.push(log.world.data);
    universe.evolutions  = (universe.evolutions || 0) + 1;
    universe.lastEvolved = new Date().toISOString();
    saveUniverse(universe);
    clearBackup();
  }

  return saveReport(log, t0, runId, 'production', epDone);
}

// ══════════════════════════════════════════════════════════
// إنتاج حلقة — خطوة بخطوة
// ══════════════════════════════════════════════════════════
async function produceEpisode(universe, episodeNumber, log, progress) {
  const STEPS      = ['backbone', 'scenes', 'dialogue'];
  const epProgress = getEpisodeProgress(progress, episodeNumber);
  const pending    = epProgress.pendingSteps.length
    ? epProgress.pendingSteps
    : [...STEPS];

  logger.info(`[EPISODE] ep${episodeNumber}`, {
    completed: epProgress.completedSteps,
    pending,
    quota: getRemainingQuota(),
  });

  if (!pending.length) {
    logger.info(`[EPISODE] ep${episodeNumber} already complete`);
    return true;
  }

  if (getRemainingQuota() < 1) {
    logger.warn('[EPISODE] No quota — skipping');
    return false;
  }

  startEpisode(episodeNumber);

  // screenplay-agent يعمل خطوة بخطوة حسب ما تبقى
  const fromStep = pending[0];
  try {
    const result = await runScreenplay(universe, episodeNumber, { fromStep });
    log.screenplay = { success: true, data: result, duration: '—' };

    for (const step of STEPS) {
      if (!epProgress.completedSteps.includes(step)) {
        saveEpisodeStep(episodeNumber, step, result);
      }
    }

    completeEpisode(episodeNumber);
    resetSessionKey();

    logger.info('[OK] Episode complete', { episode: episodeNumber, title: result?.title });

    // عالم جديد بعد الحلقة إذا بقيت حصة
    if (getRemainingQuota() >= 1) {
      log.world = await run('World Birth', './agents/world-birth-agent.js',
        [universe], 'world');
    }

    return true;
  } catch (err) {
    log.screenplay = { success: false, error: err.message, duration: '—' };
    failTask(err.message);
    logger.warn('[EPISODE] Failed — will retry tomorrow', { error: err.message });
    return false;
  }
}

// ══════════════════════════════════════════════════════════
// بناء لعبة — ملف بملف
// ══════════════════════════════════════════════════════════
function getNextGameTask(progress) {
  if (progress.games?.current) return progress.games.current;
  return null;
}

async function buildGame(universe, gameId, log, progress, budget) {
  const gameProgress = getGameProgress(progress, gameId);

  logger.info(`[GAME] ${gameId}`, {
    completed: gameProgress.completedFiles.length,
    pending:   gameProgress.pendingFiles.length,
    budget,
  });

  const idea     = loadResult('ideas.json');
  const story    = loadResult('story.json');
  const template = loadResult('template.json');

  if (!idea) {
    logger.error('[GAME] ideas.json not found');
    return false;
  }

  startGame(gameId);

  try {
    log.code = await run('Code Agent', './agents/code-agent.js',
      [idea, story, { worlds: universe.worlds }, universe.art, template, {
        pendingFiles:   gameProgress.pendingFiles,
        completedFiles: gameProgress.completedFiles,
        budget,
      }], 'code-agent');

    if (log.code?.success) {
      const newFiles = log.code.data?.files || [];
      for (const f of newFiles) saveGameFile(gameId, f.name, f.content);

      const updated = getGameProgress(loadProgress(), gameId);
      if (updated.pendingFiles.length === 0) {
        completeGame(gameId);
        resetSessionKey();
        save('code.json', log.code.data);
        logger.info('[OK] Game complete', { id: gameId });
        triggerGodotExport(gameId);
      } else {
        logger.info('[OK] Game partial — will continue tomorrow', {
          done:    updated.completedFiles.length,
          pending: updated.pendingFiles.length,
        });
      }
      return true;
    }
    failTask(log.code?.error || 'code-failed');
    return false;
  } catch (err) {
    log.code = { success: false, error: err.message, duration: '—' };
    failTask(err.message);
    return false;
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

  logger.info('[START] Orchestrator v10.2', {
    runId,
    mode,
    day:         ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][DAY],
    hasUniverse: !!universe,
    quotaLeft:   budget.left,
    keys:        budget.keys?.map(k => `${k.key}:${k.left}`).join(' | '),
    library:     `${getLibraryStatus().percent}%`,
  });

  if (mode === 'birth' || !universe) return birthMode(t0, runId);

  if (mode === 'library')   return libraryDay(t0, runId);
  if (mode === 'invention') return inventorDay(universe, t0, runId);
  if (mode === 'episode') {
    const log = {}, p = loadProgress();
    const ep  = process.env.EPISODE_NUMBER
      ? parseInt(process.env.EPISODE_NUMBER) : p.series.nextEpisode;
    await produceEpisode(universe, ep, log, p);
    return saveReport(log, t0, runId, 'episode', log.screenplay?.success || false);
  }
  if (mode === 'code') {
    const log = {}, p = loadProgress();
    await buildGame(universe, process.env.GAME_ID || universe.id, log, p,
      getRemainingQuota());
    return saveReport(log, t0, runId, 'code', log.code?.success || false);
  }
  if (mode === 'sync') {
    const log = {};
    log.sync = await run('Supabase Sync', './scripts/sync-to-supabase.js', []);
    return saveReport(log, t0, runId, 'sync', log.sync?.success || false);
  }

  if (IS_LIBRARY_DAY)  return libraryDay(t0, runId);
  if (IS_INVENTOR_DAY) return inventorDay(universe, t0, runId);
  return productionDay(universe, t0, runId);
}

// ══════════════════════════════════════════════════════════
// BIRTH MODE
// ══════════════════════════════════════════════════════════
async function birthMode(t0, runId) {
  logger.info('[BIRTH] Creating universe from scratch');
  const log = {}, data = {};

  const agents = [
    { name: 'Idea Agent',  path: './agents/idea-agent.js',  key: 'idea',  out: 'ideas.json', getArgs: () => []                                },
    { name: 'Story Agent', path: './agents/story-agent.js', key: 'story', out: 'story.json', getArgs: () => [data.idea]                        },
    { name: 'Soul Agent',  path: './agents/soul-agent.js',  key: 'soul',  out: 'soul.json',  getArgs: () => [data.idea, data.story]            },
    { name: 'Art Agent',   path: './agents/art-agent.js',   key: 'art',   out: 'art.json',   getArgs: () => [data.idea, data.story, data.soul] },
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

  log.template = await run('Template Engineer',
    './agents/template-engineer.js', [data.idea, data.story]);
  if (log.template?.success) {
    data.template = log.template.data;
    writeFileSync(join(__dirname, 'agents', 'template.json'),
      JSON.stringify(data.template, null, 2), 'utf8');
    save('template.json', data.template);
  }

  if (canAfford('world')) {
    const partial = { id: data.idea.id, name: data.idea.name, soul: data.soul, worlds: [] };
    log.world  = await run('World 1', './agents/world-birth-agent.js', [partial], 'world');
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
      total: budget.total, limit: budget.limit,
      left:  budget.left,  percent: `${budget.percent}%`,
      keys:  budget.keys,
    },
    library:  { built: lib.built, total: lib.total, percent: `${lib.percent}%` },
    progress: {
      current:       progress.current,
      nextEpisode:   progress.series.nextEpisode,
      totalEpisodes: progress.series.totalEpisodes,
      gamesDone:     progress.games.done.length,
    },
    agents: Object.fromEntries(
      Object.entries(log).map(([k, v]) => [k, {
        success: v?.success || false, duration: v?.duration || '—', error: v?.error || null,
      }])
    ),
    summary: {
      total:  Object.keys(log).length,
      passed: Object.values(log).filter(v => v?.success).length,
      failed: Object.values(log).filter(v => !v?.success).length,
    },
  };

  writeFileSync(join(RESULTS_DIR, 'run-report.json'),
    JSON.stringify(report, null, 2), 'utf8');

  logger.info('[DONE] Orchestrator v10.2', {
    mode, success,
    duration: report.totalDuration,
    passed:   report.summary.passed,
    failed:   report.summary.failed,
    quota:    `${budget.total}/${budget.limit}`,
    library:  `${lib.percent}%`,
  });

  return report;
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

main().catch(err => {
  logger.error('[CRASH] Orchestrator v10.2', { error: err.message });
  if (existsSync(UNIVERSE_BAK)) rollbackUniverse();
  process.exit(1);
});
