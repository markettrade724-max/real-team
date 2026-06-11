/**
 * orchestrator.js — v10.3
 *
 * المبدأ: يوم = مهمة واحدة — تركيز كامل
 *
 * الجدول الأسبوعي:
 *   السبت  (6) → library    — كل الحصة للمكتبة
 *   الأحد  (0) → inventor   — كل الحصة للمخترع
 *   الاثنين(1) → screenplay — 3 طلبات، حلقة جديدة
 *   الثلاثاء(2)→ series     — إكمال الحلقة كاملاً (صوت+فيديو+رفع)
 *   الأربعاء(3)→ game-gd    — Phase 1: كل ملفات .gd
 *   الخميس (4) → game-tscn  — Phase 2: كل ملفات .tscn
 *   الجمعة (5) → revival    — إحياء المنتجات
 *
 * القواعد المطبقة:
 *   rule-099 / rule-153 / rule-154 / rule-155
 *   rule-156 / rule-173 / rule-174 / rule-175
 *   rule-187 / rule-188 / rule-192
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
import { run as runAnalytics }                 from './agents/analytics-agent.js';
import {
  loadProgress, saveProgress, getNextTask,
  startEpisode, completeEpisode,
  startGame,    completeGame,
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

// ══════════════════════════════════════════════════════════
// مهمة اليوم — يوم = مهمة واحدة
// ══════════════════════════════════════════════════════════
function getDayTask() {
  const tasks = {
    6: 'library',
    0: 'inventor',
    1: 'screenplay',
    2: 'series',
    3: 'game-gd',
    4: 'game-tscn',
    5: 'revival',
  };
  return tasks[DAY] || 'screenplay';
}

logger.info('[SCHEDULE] Today', {
  day:  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][DAY],
  task: getDayTask(),
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
// السبت — library كل الحصة
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
    logger.info('[OK] Library day done', { percent: `${getLibraryStatus().percent}%` });
  } catch (err) {
    log.library = { success: false, error: err.message, duration: fmt(Date.now() - t0lib) };
  }

  try {
    const u = loadUniverse();
    if (u) { const r = await runAnalytics(u); save('analytics.json', r); }
  } catch {}

  return saveReport(log, t0, runId, 'library', log.library?.success || false);
}

// ══════════════════════════════════════════════════════════
// الأحد — inventor كل الحصة
// ══════════════════════════════════════════════════════════
async function inventorDay(universe, t0, runId) {
  logger.info('[INVENTOR] Sunday — full quota');
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
// الاثنين — screenplay: كتابة الحلقة كاملة (3 طلبات)
// ══════════════════════════════════════════════════════════
async function screenplayDay(universe, t0, runId) {
  const progress = loadProgress();
  const next     = getNextTask(progress);
  const epNum    = next.type === 'continue' && next.task?.type === 'episode'
    ? next.task.episode
    : progress.series.nextEpisode;

  logger.info('[SCREENPLAY] Monday — writing episode', { episode: epNum });

  const epProgress = getEpisodeProgress(progress, epNum);
  const fromStep   = epProgress.pendingSteps[0] || 'backbone';
  const log        = {};

  if (getRemainingQuota() < 1) {
    logger.warn('[SCREENPLAY] No quota');
    return saveReport(log, t0, runId, 'screenplay', false);
  }

  startEpisode(epNum);

  try {
    const result = await runScreenplay(universe, epNum, { fromStep });
    log.screenplay = { success: true, data: result, duration: '—' };

    for (const step of ['backbone', 'scenes', 'dialogue']) {
      saveEpisodeStep(epNum, step, result);
    }

    completeEpisode(epNum);
    resetSessionKey();

    logger.info('[OK] Screenplay done', { episode: epNum, title: result?.title });
    return saveReport(log, t0, runId, 'screenplay', true);
  } catch (err) {
    log.screenplay = { success: false, error: err.message, duration: '—' };
    failTask(err.message);
    logger.warn('[SCREENPLAY] Failed — retry tomorrow', { error: err.message });
    return saveReport(log, t0, runId, 'screenplay', false);
  }
}

// ══════════════════════════════════════════════════════════
// الثلاثاء — series: إكمال الحلقة (صوت + فيديو + رفع)
// ══════════════════════════════════════════════════════════
async function seriesDay(universe, t0, runId) {
  const progress = loadProgress();
  const epNum    = progress.series.nextEpisode - 1 || 1;
  const log      = {};

  // ابحث عن screenplay محفوظ
  const screenplayPath = join(RESULTS_DIR, `screenplay-ep${epNum}.json`);
  if (!existsSync(screenplayPath)) {
    logger.warn('[SERIES] No screenplay found — run screenplay day first', { episode: epNum });
    return saveReport(log, t0, runId, 'series', false);
  }

  const screenplay = JSON.parse(readFileSync(screenplayPath, 'utf8'));
  logger.info('[SERIES] Tuesday — full pipeline', { episode: epNum, title: screenplay.title });

  log.series = await run('Series Pipeline', './agents/series-agent.js',
    [universe, epNum, { screenplay }], null);

  if (log.series?.success) {
    logger.info('[OK] Episode fully produced', { episode: epNum });
    if (universe) {
      universe.evolutions  = (universe.evolutions || 0) + 1;
      universe.lastEvolved = new Date().toISOString();
      saveUniverse(universe);
    }
  } else {
    logger.warn('[SERIES] Pipeline failed — will retry tomorrow');
    failTask(log.series?.error || 'series-failed');
  }

  return saveReport(log, t0, runId, 'series', log.series?.success || false);
}

// ══════════════════════════════════════════════════════════
// الأربعاء — game Phase 1: كل .gd (4 طلبات)
// ══════════════════════════════════════════════════════════
async function gameGdDay(universe, t0, runId) {
  const progress = loadProgress();
  const gameId   = getNextGameId(progress);
  const log      = {};

  if (!gameId) {
    logger.info('[GAME-GD] No game to build');
    return saveReport(log, t0, runId, 'game-gd', false);
  }

  logger.info('[GAME-GD] Wednesday — Phase 1 (.gd files)', { id: gameId });
  const idea     = loadResult('ideas.json');
  const story    = loadResult('story.json');
  const template = loadResult('template.json');

  if (!idea) {
    logger.error('[GAME-GD] ideas.json not found');
    return saveReport(log, t0, runId, 'game-gd', false);
  }

  startGame(gameId);
  const gProgress = getGameProgress(progress, gameId);

  log.code = await run('Code Agent Phase 1', './agents/code-agent.js',
    [idea, story, { worlds: universe.worlds }, universe.art, template, {
      pendingFiles:   gProgress.pendingFiles.filter(f => f.endsWith('.gd')),
      completedFiles: gProgress.completedFiles,
      budget:         4,
    }], 'code-agent');

  if (log.code?.success) {
    for (const f of (log.code.data?.files || [])) saveGameFile(gameId, f.name, f.content);
    logger.info('[OK] Game Phase 1 done', { id: gameId });
  } else {
    failTask(log.code?.error || 'game-gd-failed');
  }

  return saveReport(log, t0, runId, 'game-gd', log.code?.success || false);
}

// ══════════════════════════════════════════════════════════
// الخميس — game Phase 2: كل .tscn (5 طلبات)
// ══════════════════════════════════════════════════════════
async function gameTscnDay(universe, t0, runId) {
  const progress = loadProgress();
  const current  = progress.games?.current;
  const log      = {};

  if (!current) {
    logger.info('[GAME-TSCN] No game in progress — run game-gd day first');
    return saveReport(log, t0, runId, 'game-tscn', false);
  }

  logger.info('[GAME-TSCN] Thursday — Phase 2 (.tscn files)', { id: current.id });
  const idea     = loadResult('ideas.json');
  const story    = loadResult('story.json');
  const template = loadResult('template.json');

  const gProgress = getGameProgress(progress, current.id);
  log.code = await run('Code Agent Phase 2', './agents/code-agent.js',
    [idea, story, { worlds: universe.worlds }, universe.art, template, {
      pendingFiles:   gProgress.pendingFiles.filter(f => f.endsWith('.tscn')),
      completedFiles: gProgress.completedFiles,
      budget:         5,
    }], 'code-agent');

  if (log.code?.success) {
    for (const f of (log.code.data?.files || [])) saveGameFile(current.id, f.name, f.content);
    const updated = getGameProgress(loadProgress(), current.id);
    if (updated.pendingFiles.length === 0) {
      completeGame(current.id);
      resetSessionKey();
      save('code.json', log.code.data);
      triggerGodotExport(current.id);
      logger.info('[OK] Game complete', { id: current.id });
    }
  } else {
    failTask(log.code?.error || 'game-tscn-failed');
  }

  return saveReport(log, t0, runId, 'game-tscn', log.code?.success || false);
}

// ══════════════════════════════════════════════════════════
// الجمعة — revival: إحياء المنتجات بكل الحصة
// ══════════════════════════════════════════════════════════
async function revivalDay(universe, t0, runId) {
  logger.info('[REVIVAL] Friday — full quota for revival');
  const log   = {};
  let   count = 0;

  while (getRemainingQuota() >= 2) {
    const products = loadProductsNeedingRevival();
    if (!products.length) {
      logger.info('[REVIVAL] No products need revival');
      break;
    }
    const r = await run(`Revival #${count + 1}`, './agents/revival-agent.js',
      [products[0], universe], 'revival');
    if (!r.success) break;
    log[`revival_${++count}`] = r;
    await sleep(DELAY);
  }

  logger.info('[OK] Revival day done', { count });
  return saveReport(log, t0, runId, 'revival', count > 0);
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

function getNextGameId(progress) {
  if (progress.games?.current) return progress.games.current.id;
  const p = join(__dirname, 'products.json');
  if (!existsSync(p)) return null;
  try {
    const done = progress.games?.done || [];
    return JSON.parse(readFileSync(p, 'utf8'))
      .find(pr => pr.type === 'godot' && !done.includes(pr.id))?.id || null;
  } catch { return null; }
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
    day:       ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][DAY],
    task:      getDayTask(),
    quotaLeft: budget.left,
    keys:      budget.keys?.map(k => `${k.key}:${k.left}`).join(' | '),
    library:   `${getLibraryStatus().percent}%`,
  });

  if (mode === 'birth' || !universe) return birthMode(t0, runId);

  // modes يدوية
  const manualMap = {
    library:   () => libraryDay(t0, runId),
    invention: () => inventorDay(universe, t0, runId),
    screenplay:() => screenplayDay(universe, t0, runId),
    series:    () => seriesDay(universe, t0, runId),
    code:      () => gameGdDay(universe, t0, runId),
    revival:   () => revivalDay(universe, t0, runId),
    sync:      async () => {
      const log = {};
      log.sync = await run('Supabase Sync', './scripts/sync-to-supabase.js', []);
      return saveReport(log, t0, runId, 'sync', log.sync?.success || false);
    },
  };
  if (manualMap[mode]) return manualMap[mode]();

  // auto — حسب اليوم
  const task = getDayTask();
  switch (task) {
    case 'library':    return libraryDay(t0, runId);
    case 'inventor':   return inventorDay(universe, t0, runId);
    case 'screenplay': return screenplayDay(universe, t0, runId);
    case 'series':     return seriesDay(universe, t0, runId);
    case 'game-gd':    return gameGdDay(universe, t0, runId);
    case 'game-tscn':  return gameTscnDay(universe, t0, runId);
    case 'revival':    return revivalDay(universe, t0, runId);
  }
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
    log.world   = await run('World 1', './agents/world-birth-agent.js', [partial], 'world');
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
      left:  budget.left,  keys: budget.keys,
    },
    library:  { built: lib.built, total: lib.total, percent: `${lib.percent}%` },
    progress: {
      nextEpisode:   progress.series.nextEpisode,
      totalEpisodes: progress.series.totalEpisodes,
      gamesDone:     progress.games.done.length,
    },
    agents: Object.fromEntries(
      Object.entries(log).map(([k, v]) => [k, {
        success: v?.success || false,
        duration: v?.duration || '—',
        error: v?.error || null,
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

  logger.info('[DONE] Orchestrator v10.3', {
    mode, success,
    duration: report.totalDuration,
    passed:   report.summary.passed,
    failed:   report.summary.failed,
    quota:    `${budget.total}/${budget.limit}`,
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
  logger.error('[CRASH] Orchestrator v10.3', { error: err.message });
  if (existsSync(UNIVERSE_BAK)) rollbackUniverse();
  process.exit(1);
});
