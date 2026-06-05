/**
 * orchestrator.js — v10.0
 *
 * المبدأ الذهبي الجديد:
 *   أكمل ما بدأت حتى يكتمل 100% ثم انتقل للتالي
 *
 * الجدول الأسبوعي:
 *   السبت  → مكتبة فقط    — كل الحصة 40 طلب
 *   الأحد  → inventor فقط — كل الحصة 40 طلب
 *   باقي   → أكمل الجاري (حلقة أو لعبة) أو ابدأ حلقة جديدة
 *
 * القواعد المطبقة:
 *   rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *   rule-153 : canAfford — عمل كامل أو لا شيء
 *   rule-154 : rollback عند الفشل
 *   rule-155 : getBudgetStatus مصدر الحقيقة
 *   rule-156 : الأحد للمخترع كلياً
 *   rule-171 : المسلسل أولوية قصوى
 *   rule-172 : أكمل ما بدأت — لا تبدأ جديداً قبل إكمال القديم
 */

import { writeFileSync, readFileSync, copyFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { execSync }       from 'child_process';
import { logger }         from './logger.js';
import { canAfford, getBudgetStatus, getRemainingQuota } from './agents/_gemini.js';
import { run as runLibrary, getLibraryStatus }           from './agents/library-builder-agent.js';
import { run as runSeries }                              from './agents/series-agent.js';
import { run as runAnalytics }                           from './agents/analytics-agent.js';
import {
  loadProgress, saveProgress,
  getNextTask,
  startEpisode, completeEpisode,
  startGame,    completeGame,
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
const IS_LIBRARY_DAY  = DAY === 6; // السبت
const IS_INVENTOR_DAY = DAY === 0; // الأحد

logger.info('[SCHEDULE] Today', {
  day:      ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][DAY],
  mode:     IS_LIBRARY_DAY ? 'LIBRARY' : IS_INVENTOR_DAY ? 'INVENTOR' : 'PRODUCTION',
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
  logger.warn('[ROLLBACK] universe.json restored from backup');
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
  logger.info('[OK] Universe saved', { worlds: u.worlds?.length, evolutions: u.evolutions });
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
// يوم المكتبة — السبت
// ══════════════════════════════════════════════════════════
async function libraryDay(t0, runId) {
  logger.info('[LIBRARY] Saturday — full quota for library');
  const log = {};

  const status = getLibraryStatus();
  if (status.remaining === 0) {
    logger.info('[LIBRARY] Already complete');
    log.library = { success: true, data: { skipped: true }, duration: '0ms' };
    return saveReport(log, t0, runId, 'library', true);
  }

  const t0lib = Date.now();
  try {
    // شغّل المكتبة حتى تنفد الحصة كاملاً
    let built = 0;
    while (getRemainingQuota() >= 2 && getLibraryStatus().remaining > 0) {
      const result = await runLibrary();
      built += result.built || 0;
      logger.info('[LIBRARY] Batch done', {
        builtTotal: getLibraryStatus().built,
        remaining:  getLibraryStatus().remaining,
        quotaLeft:  getRemainingQuota(),
      });
      if (result.built === 0) break; // لا تقدم
    }
    log.library = { success: true, data: { built }, duration: fmt(Date.now() - t0lib) };
    logger.info('[OK] Library day done', {
      percent: `${getLibraryStatus().percent}%`,
      built:   getLibraryStatus().built,
      total:   getLibraryStatus().total,
    });
  } catch (err) {
    log.library = { success: false, error: err.message, duration: fmt(Date.now() - t0lib) };
    logger.error('[LIBRARY] Failed', { error: err.message });
  }

  // analytics في نهاية السبت
  try {
    const universe = loadUniverse();
    if (universe) {
      const analyticsResult = await runAnalytics(universe);
      log.analytics = { success: true, data: analyticsResult, duration: '—' };
      save('analytics.json', analyticsResult);
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
  backupUniverse();

  log.invention = await run('Inventor', './agents/inventor-agent.js', [universe], 'inventor');

  if (log.invention?.success) {
    universe.inventions = (universe.inventions || 0) +
      (log.invention.data?.inventions?.length || 1);
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
  const next     = getNextTask(progress);
  const log      = {};

  logger.info('[PRODUCTION] Day', {
    day:     ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][DAY],
    current: progress.current ? `${progress.current.type}:${progress.current.episode || progress.current.id}` : 'none',
    next:    next.type,
  });

  backupUniverse();

  // ── إكمال أو بدء حلقة ─────────────────
  if (next.type === 'continue' && next.task.type === 'episode') {
    await produceEpisode(universe, next.task.episode, log, progress);
  } else if (next.type === 'continue' && next.task.type === 'game') {
    await buildGame(universe, next.task.id, log, progress);
  } else {
    // ابدأ حلقة جديدة
    await produceEpisode(universe, progress.series.nextEpisode, log, progress);
  }

  // حفظ universe إذا تغيّر
  if (log.world?.success && log.world.data?.name?.en) {
    universe.worlds.push(log.world.data);
    universe.evolutions = (universe.evolutions || 0) + 1;
    universe.lastEvolved = new Date().toISOString();
    saveUniverse(universe);
    clearBackup();
  }

  return saveReport(log, t0, runId, 'production', true);
}

// ── إنتاج حلقة كاملة ────────────────────
async function produceEpisode(universe, episodeNumber, log, progress) {
  logger.info(`[EPISODE] Producing ep${episodeNumber}...`);

  if (!canAfford('screenplay')) {
    logger.warn('[EPISODE] Insufficient quota — will retry tomorrow');
    failTask('quota-insufficient');
    return;
  }

  // سجّل البداية
  startEpisode(episodeNumber);

  try {
    const result = await runSeries(universe, episodeNumber);
    log.episode  = { success: true, data: result, duration: '—' };

    // اكتمل — سجّل النجاح
    completeEpisode(episodeNumber);
    logger.info('[OK] Episode complete', {
      episode: episodeNumber,
      title:   result.title,
    });

    // عالم جديد بعد الحلقة إذا بقيت حصة
    if (canAfford('world')) {
      log.world = await run('World Birth', './agents/world-birth-agent.js', [universe], 'world');
    }

  } catch (err) {
    log.episode = { success: false, error: err.message, duration: '—' };
    // لا تمسح current — سنكمل غداً
    failTask(err.message);
    logger.warn('[EPISODE] Failed — will retry tomorrow', { error: err.message });
  }
}

// ── بناء لعبة كاملة ──────────────────────
async function buildGame(universe, gameId, log, progress) {
  logger.info(`[GAME] Building ${gameId}...`);

  if (!canAfford('code-agent')) {
    logger.warn('[GAME] Insufficient quota — will retry tomorrow');
    failTask('quota-insufficient');
    return;
  }

  startGame(gameId);

  const idea     = loadResult('ideas.json');
  const story    = loadResult('story.json');
  const template = loadResult('template.json');

  if (!idea) {
    logger.error('[GAME] ideas.json not found');
    failTask('no-idea');
    return;
  }

  try {
    log.code = await run('Code Agent', './agents/code-agent.js',
      [idea, story, { worlds: universe.worlds }, universe.art, template],
      'code-agent');

    if (log.code?.success) {
      completeGame(gameId);
      save('code.json', log.code.data);
      logger.info('[OK] Game complete', { id: gameId });
    } else {
      failTask(log.code?.error || 'code-failed');
    }
  } catch (err) {
    log.code = { success: false, error: err.message, duration: '—' };
    failTask(err.message);
    logger.warn('[GAME] Failed — will retry tomorrow', { error: err.message });
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

  logger.info('[START] Orchestrator v10.0', {
    runId,
    mode,
    day:         ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][DAY],
    hasUniverse: !!universe,
    quotaLeft:   budget.left,
    library:     `${getLibraryStatus().percent}%`,
  });

  // ── BIRTH ────────────────────────────
  if (mode === 'birth' || !universe) {
    return birthMode(t0, runId);
  }

  // ── MANUAL MODES ─────────────────────
  if (mode === 'library')   return libraryDay(t0, runId);
  if (mode === 'invention') return inventorDay(universe, t0, runId);
  if (mode === 'episode') {
    const log = {};
    const p   = loadProgress();
    await produceEpisode(universe,
      process.env.EPISODE_NUMBER ? parseInt(process.env.EPISODE_NUMBER) : p.series.nextEpisode,
      log, p);
    return saveReport(log, t0, runId, 'episode', log.episode?.success || false);
  }
  if (mode === 'code') {
    const log = {};
    const p   = loadProgress();
    await buildGame(universe, process.env.GAME_ID || universe.id, log, p);
    return saveReport(log, t0, runId, 'code', log.code?.success || false);
  }
  if (mode === 'sync') {
    const log = {};
    log.sync  = await run('Supabase Sync', './scripts/sync-to-supabase.js', []);
    return saveReport(log, t0, runId, 'sync', log.sync?.success || false);
  }

  // ── AUTO ─────────────────────────────
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
    { name: 'Idea Agent',        path: './agents/idea-agent.js',        key: 'idea',     out: 'ideas.json'    },
    { name: 'Story Agent',       path: './agents/story-agent.js',       key: 'story',    out: 'story.json'    },
    { name: 'Soul Agent',        path: './agents/soul-agent.js',        key: 'soul',     out: 'soul.json'     },
    { name: 'Art Agent',         path: './agents/art-agent.js',         key: 'art',      out: 'art.json'      },
  ];

  for (const agent of agents) {
    const prev = Object.values(data);
    log[agent.name] = await run(agent.name, agent.path,
      prev.length ? [prev[prev.length - 1]] : [], agent.key);
    if (log[agent.name]?.success) {
      data[agent.key] = log[agent.name].data;
      save(agent.out, data[agent.key]);
    }
  }

  if (!data.idea) {
    logger.error('[BIRTH] No idea — aborting');
    return saveReport(log, t0, runId, 'birth', false);
  }

  // عالم أول
  if (canAfford('world')) {
    const partial = { id: data.idea.id, name: data.idea.name, soul: data.soul, worlds: [] };
    log.world = await run('World 1', './agents/world-birth-agent.js', [partial], 'world');
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
  logger.info('[OK] Universe born', { id: universe.id, name: universe.name?.en });
  return saveReport(log, t0, runId, 'birth', true);
}

// ══════════════════════════════════════════════════════════
// تقرير النهاية
// ══════════════════════════════════════════════════════════
function saveReport(log, t0, runId, mode, success) {
  const budget  = getBudgetStatus();
  const lib     = getLibraryStatus();
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
    library: { built: lib.built, total: lib.total, percent: `${lib.percent}%` },
    progress: {
      current:       progress.current,
      nextEpisode:   progress.series.nextEpisode,
      totalEpisodes: progress.series.totalEpisodes,
      gamesDone:     progress.games.done.length,
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

  writeFileSync(join(RESULTS_DIR, 'run-report.json'), JSON.stringify(report, null, 2), 'utf8');

  logger.info('[DONE] Orchestrator v10.0', {
    mode, success,
    duration:  report.totalDuration,
    passed:    report.summary.passed,
    failed:    report.summary.failed,
    quota:     `${budget.total}/${budget.limit}`,
    library:   `${lib.percent}%`,
    nextTask:  progress.current
      ? `continue ${progress.current.type}:${progress.current.episode || progress.current.id}`
      : `new episode ${progress.series.nextEpisode}`,
  });

  return report;
}

function triggerGodotExport() {
  try {
    execSync(`gh workflow run godot-export.yml --repo ${process.env.GITHUB_REPOSITORY}`, { stdio: 'pipe' });
    logger.info('[OK] Godot export triggered');
  } catch (err) {
    logger.warn('[WARN] Could not trigger export', { error: err.message });
  }
}

main().catch(err => {
  logger.error('[CRASH] Orchestrator v10.0', { error: err.message });
  if (existsSync(UNIVERSE_BAK)) rollbackUniverse();
  process.exit(1);
});
