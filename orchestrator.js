/**
 * orchestrator.js — v10.1
 *
 * الجديد عن v10.0:
 *  - AGENT_TIERS: كل وكيل له طبقات أدنى → أمثل → أقصى
 *  - allocateBudget(): جولتان — حد أدنى للجميع ثم ترقية بالأولوية
 *  - fillRemainingQuota(): استثمار المتبقي بعد المهمة الرئيسية
 *  - produceEpisode(): يتتبع الخطوات backbone→scenes→dialogue
 *  - buildGame(): يتتبع الملفات .gd أولاً → .tscn لاحقاً
 *  - birthMode(): يمرر كل البيانات المتراكمة لكل وكيل
 *  - triggerGodotExport() يُستدعى تلقائياً بعد اكتمال لعبة
 *
 * القواعد المطبقة:
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-153 : وحدة كاملة أو لا شيء — ليس بالضرورة كل شيء في يوم
 *  rule-154 : rollback عند الفشل
 *  rule-155 : getBudgetStatus مصدر الحقيقة
 *  rule-156 : الأحد للمخترع كلياً
 *  rule-171 : المسلسل أولوية قصوى
 *  rule-172 : مفتاح واحد لكل مهمة كاملة
 *  rule-187 : progress.json — المهام الجارية أولوية مطلقة
 *  rule-188 : كل خطوة تُحفظ فور اكتمالها
 */

import { writeFileSync, readFileSync, copyFileSync,
         mkdirSync, existsSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { execSync }       from 'child_process';
import { logger }         from './logger.js';
import {
  canAfford, getBudgetStatus, getRemainingQuota, resetSessionKey,
} from './agents/_gemini.js';
import { run as runLibrary, getLibraryStatus } from './agents/library-builder-agent.js';
import { run as runSeries }                    from './agents/series-agent.js';
import { run as runRevival }                   from './agents/revival-agent.js';
import { run as runAnalytics }                 from './agents/analytics-agent.js';
import {
  loadProgress, saveProgress,
  getNextTask,
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

logger.info('[SCHEDULE] Today', {
  day:  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][DAY],
  mode: IS_LIBRARY_DAY ? 'LIBRARY' : IS_INVENTOR_DAY ? 'INVENTOR' : 'PRODUCTION',
});

// ══════════════════════════════════════════════════════════
// AGENT_TIERS — الطبقات والتكاليف
// ══════════════════════════════════════════════════════════
const AGENT_TIERS = {
  episode: {
    priority: 1,
    steps: ['backbone', 'scenes', 'dialogue'],
    costs: { backbone: 1, scenes: 1, dialogue: 1 }, // كل خطوة طلب مستقل
    minCost: 1,   // backbone على الأقل
    fullCost: 3,  // حلقة كاملة
  },
  'code-agent': {
    priority: 2,
    repeatable: false,
    tiers: [
      { label: 'gd-core',     cost: 3, desc: '3 ملفات .gd أساسية'  },
      { label: 'gd-full',     cost: 5, desc: '5 ملفات .gd كاملة'   },
      { label: 'complete',    cost: 9, desc: 'لعبة كاملة gd+tscn'   },
    ],
    minCost: 3,
    fullCost: 9,
  },
  revival: {
    priority: 3,
    repeatable: true,
    minCost: 2,
    fullCost: 2,
  },
  library: {
    priority: 4,
    repeatable: true,
    minCost: 2,
    fullCost: 2,
  },
  world: {
    priority: 5,
    repeatable: false,
    minCost: 1,
    fullCost: 1,
  },
};

// ══════════════════════════════════════════════════════════
// allocateBudget — جولتان: حد أدنى ثم ترقية
// ══════════════════════════════════════════════════════════
function allocateBudget(tasks, quota) {
  const plan = new Map(); // taskName → allocatedCost
  let remaining = quota;

  const sortedTasks = [...tasks].sort(
    (a, b) => (AGENT_TIERS[a]?.priority || 99) - (AGENT_TIERS[b]?.priority || 99)
  );

  // جولة 1: الحد الأدنى للجميع بالأولوية
  for (const task of sortedTasks) {
    const tier = AGENT_TIERS[task];
    if (!tier) continue;
    if (remaining >= tier.minCost) {
      plan.set(task, tier.minCost);
      remaining -= tier.minCost;
    }
  }

  // جولة 2: ترقية الأعلى أولوية بما تبقى
  for (const task of sortedTasks) {
    const tier = AGENT_TIERS[task];
    if (!tier || !plan.has(task)) continue;
    if (tier.tiers) {
      // وكيل متعدد الطبقات (code-agent)
      for (const t of tier.tiers) {
        const upgrade = t.cost - plan.get(task);
        if (upgrade > 0 && remaining >= upgrade) {
          plan.set(task, t.cost);
          remaining -= upgrade;
        }
      }
    } else if (tier.fullCost > tier.minCost) {
      // وكيل بطبقتين فقط
      const upgrade = tier.fullCost - plan.get(task);
      if (remaining >= upgrade) {
        plan.set(task, tier.fullCost);
        remaining -= upgrade;
      }
    }
  }

  logger.info('[BUDGET] Allocation plan', {
    quota,
    plan: Object.fromEntries(plan),
    remaining,
  });

  return { plan, remaining };
}

// ══════════════════════════════════════════════════════════
// fillRemainingQuota — استثمار المتبقي بعد المهمة الرئيسية
// ══════════════════════════════════════════════════════════
async function fillRemainingQuota(universe, log) {
  let quota = getRemainingQuota();
  logger.info('[FILL] Filling remaining quota', { quota });

  // revival — كرر حتى تنفد الحصة
  let revivalCount = 0;
  while (quota >= 2) {
    const products = loadProductsNeedingRevival();
    if (!products.length) break;
    const r = await run('Revival', './agents/revival-agent.js',
      [products[0], universe], 'revival');
    if (!r.success) break;
    log[`revival_${++revivalCount}`] = r;
    quota = getRemainingQuota();
    await sleep(DELAY);
  }
  if (revivalCount > 0)
    logger.info(`[OK] Revival × ${revivalCount} completed`);

  // library — مراجع إضافية
  let libCount = 0;
  while (quota >= 2 && getLibraryStatus().remaining > 0) {
    const r = await runLibrary();
    if (!r || r.built === 0) break;
    libCount += r.built || 0;
    quota = getRemainingQuota();
  }
  if (libCount > 0)
    logger.info(`[OK] Library +${libCount} references`);

  // عالم جديد إذا بقي طلب
  if (quota >= 1 && universe && !log.world) {
    log.world = await run('World Birth', './agents/world-birth-agent.js',
      [universe], 'world');
  }

  logger.info('[FILL] Done', { quotaUsed: getRemainingQuota() < quota });
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
  let built = 0;
  try {
    while (getRemainingQuota() >= 2 && getLibraryStatus().remaining > 0) {
      const result = await runLibrary();
      built += result?.built || 0;
      logger.info('[LIBRARY] Batch done', {
        builtTotal: getLibraryStatus().built,
        remaining:  getLibraryStatus().remaining,
        quotaLeft:  getRemainingQuota(),
      });
      if (!result?.built) break;
    }
    log.library = { success: true, data: { built }, duration: fmt(Date.now() - t0lib) };
    logger.info('[OK] Library day done', {
      percent: `${getLibraryStatus().percent}%`,
      built:   getLibraryStatus().built,
    });
  } catch (err) {
    log.library = { success: false, error: err.message, duration: fmt(Date.now() - t0lib) };
    logger.error('[LIBRARY] Failed', { error: err.message });
  }

  // analytics
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
  backupUniverse();

  log.invention = await run('Inventor', './agents/inventor-agent.js',
    [universe], 'inventor');

  if (log.invention?.success) {
    universe.inventions   = (universe.inventions || 0) +
      (log.invention.data?.inventions?.length || 1);
    universe.lastInvented = new Date().toISOString();
    saveUniverse(universe);
    clearBackup();

    // استثمر ما تبقى
    await fillRemainingQuota(universe, log);
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
  const quota    = getRemainingQuota();

  logger.info('[PRODUCTION] Day', {
    day:     ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][DAY],
    current: progress.current
      ? `${progress.current.type}:${progress.current.episode || progress.current.id}`
      : 'none',
    next:    next.type,
    quota,
  });

  backupUniverse();

  // ── توزيع الميزانية بالأولوية ─────────
  const tasksNeeded = ['episode', 'revival', 'library', 'world'];
  if (next.type === 'continue' && next.task?.type === 'game') tasksNeeded.unshift('code-agent');
  const { plan } = allocateBudget(tasksNeeded, quota);

  // ── الأولوية: إكمال الجاري ─────────────
  let mainSuccess = false;
  if (next.type === 'continue' && next.task?.type === 'episode') {
    mainSuccess = await produceEpisode(universe, next.task.episode, log, progress, plan.get('episode'));
  } else if (next.type === 'continue' && next.task?.type === 'game') {
    mainSuccess = await buildGame(universe, next.task.id, log, progress, plan.get('code-agent'));
  } else {
    mainSuccess = await produceEpisode(universe, progress.series.nextEpisode, log, progress, plan.get('episode'));
  }

  // ── بعد المهمة الرئيسية: استثمر المتبقي
  await fillRemainingQuota(universe, log);

  // حفظ universe إذا أضفنا عالماً
  if (log.world?.success && log.world.data) {
    universe.worlds.push(log.world.data);
    universe.evolutions  = (universe.evolutions || 0) + 1;
    universe.lastEvolved = new Date().toISOString();
    saveUniverse(universe);
    clearBackup();
  }

  return saveReport(log, t0, runId, 'production', mainSuccess);
}

// ── إنتاج حلقة — خطوة بخطوة ────────────
async function produceEpisode(universe, episodeNumber, log, progress, allocatedCost) {
  const tier       = AGENT_TIERS.episode;
  const epProgress = getEpisodeProgress(progress, episodeNumber);
  const pending    = epProgress.pendingSteps.length > 0
    ? epProgress.pendingSteps
    : [...tier.steps]; // بدء جديد

  logger.info(`[EPISODE] ep${episodeNumber}`, {
    completedSteps: epProgress.completedSteps,
    pendingSteps:   pending,
    allocatedCost:  allocatedCost || tier.fullCost,
  });

  if (!pending.length) {
    logger.info(`[EPISODE] ep${episodeNumber} already complete`);
    return true;
  }

  const budget = allocatedCost || tier.fullCost;
  if (budget < tier.minCost) {
    logger.warn(`[EPISODE] Insufficient budget ${budget} — need min ${tier.minCost}`);
    failTask('quota-insufficient');
    return false;
  }

  // عدد الخطوات التي يمكن إنجازها اليوم
  const stepsToday = pending.slice(0, budget);

  logger.info(`[EPISODE] Steps today: ${stepsToday.join(' → ')} (${stepsToday.length}/${pending.length})`);

  startEpisode(episodeNumber);

  // إذا series-agent يدعم fromStep → استخدمه
  // وإلا → نشغّل الحلقة كاملة إذا budget كافٍ
  if (stepsToday.length === tier.steps.length && !epProgress.completedSteps.length) {
    // حلقة جديدة كاملة — الطريق المعتاد
    try {
      const result = await runSeries(universe, episodeNumber);
      log.episode  = { success: true, data: result, duration: '—' };
      for (const step of tier.steps) saveEpisodeStep(episodeNumber, step, result);
      completeEpisode(episodeNumber);
      resetSessionKey();
      logger.info('[OK] Episode complete', { episode: episodeNumber, title: result?.title });
      return true;
    } catch (err) {
      log.episode = { success: false, error: err.message, duration: '—' };
      failTask(err.message);
      logger.warn('[EPISODE] Failed — will retry tomorrow', { error: err.message });
      return false;
    }
  }

  // حلقة جزئية — series-agent يقبل { fromStep, existingData }
  // (يحتاج تحديث series-agent لدعم هذا — rule-188)
  try {
    const result = await runSeries(universe, episodeNumber, {
      fromStep:     stepsToday[0],
      existingData: epProgress.data,
    });
    log.episode = { success: true, data: result, duration: '—' };
    for (const step of stepsToday) saveEpisodeStep(episodeNumber, step, result);
    if (stepsToday.length === pending.length) {
      completeEpisode(episodeNumber);
      resetSessionKey();
      logger.info('[OK] Episode complete', { episode: episodeNumber });
    } else {
      logger.info('[OK] Episode partial — will continue tomorrow', {
        done: epProgress.completedSteps.length + stepsToday.length,
        total: tier.steps.length,
      });
    }
    return true;
  } catch (err) {
    log.episode = { success: false, error: err.message, duration: '—' };
    failTask(err.message);
    logger.warn('[EPISODE] Step failed — will retry tomorrow', { error: err.message });
    return false;
  }
}

// ── بناء لعبة — ملف بملف ────────────────
async function buildGame(universe, gameId, log, progress, allocatedCost) {
  const tier        = AGENT_TIERS['code-agent'];
  const gameProgress = getGameProgress(progress, gameId);

  logger.info(`[GAME] ${gameId}`, {
    completedFiles: gameProgress.completedFiles,
    pendingFiles:   gameProgress.pendingFiles,
    allocatedCost:  allocatedCost || tier.fullCost,
  });

  const budget = allocatedCost || tier.fullCost;
  if (budget < tier.minCost) {
    logger.warn(`[GAME] Insufficient budget ${budget} — need min ${tier.minCost}`);
    failTask('quota-insufficient');
    return false;
  }

  const idea     = loadResult('ideas.json');
  const story    = loadResult('story.json');
  const template = loadResult('template.json');

  if (!idea) {
    logger.error('[GAME] ideas.json not found');
    failTask('no-idea');
    return false;
  }

  startGame(gameId);

  try {
    // code-agent يقبل { pendingFiles, completedFiles, budget }
    // لضبط ما ينجزه اليوم — (يحتاج تحديث code-agent — rule-188)
    log.code = await run('Code Agent', './agents/code-agent.js',
      [idea, story, { worlds: universe.worlds }, universe.art, template, {
        pendingFiles:   gameProgress.pendingFiles,
        completedFiles: gameProgress.completedFiles,
        budget,
      }],
      'code-agent');

    if (log.code?.success) {
      const newFiles = log.code.data?.files || [];
      for (const f of newFiles) saveGameFile(gameId, f.name, f.content);

      // تحقق من اكتمال اللعبة
      const updated = getGameProgress(loadProgress(), gameId);
      if (updated.pendingFiles.length === 0) {
        completeGame(gameId);
        resetSessionKey();
        save('code.json', log.code.data);
        logger.info('[OK] Game complete', { id: gameId });
        // صدّر اللعبة تلقائياً
        triggerGodotExport(gameId);
      } else {
        logger.info('[OK] Game partial — will continue tomorrow', {
          done:    updated.completedFiles.length,
          pending: updated.pendingFiles.length,
        });
      }
      return true;
    } else {
      failTask(log.code?.error || 'code-failed');
      return false;
    }
  } catch (err) {
    log.code = { success: false, error: err.message, duration: '—' };
    failTask(err.message);
    logger.warn('[GAME] Failed — will retry tomorrow', { error: err.message });
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

  logger.info('[START] Orchestrator v10.1', {
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
    const log = {};
    const p   = loadProgress();
    const ep  = process.env.EPISODE_NUMBER
      ? parseInt(process.env.EPISODE_NUMBER)
      : p.series.nextEpisode;
    await produceEpisode(universe, ep, log, p, AGENT_TIERS.episode.fullCost);
    await fillRemainingQuota(universe, log);
    return saveReport(log, t0, runId, 'episode', log.episode?.success || false);
  }
  if (mode === 'code') {
    const log = {};
    const p   = loadProgress();
    await buildGame(universe, process.env.GAME_ID || universe.id, log, p,
      AGENT_TIERS['code-agent'].fullCost);
    return saveReport(log, t0, runId, 'code', log.code?.success || false);
  }
  if (mode === 'sync') {
    const log = {};
    log.sync  = await run('Supabase Sync', './scripts/sync-to-supabase.js', []);
    return saveReport(log, t0, runId, 'sync', log.sync?.success || false);
  }

  if (IS_LIBRARY_DAY)  return libraryDay(t0, runId);
  if (IS_INVENTOR_DAY) return inventorDay(universe, t0, runId);
  return productionDay(universe, t0, runId);
}

// ══════════════════════════════════════════════════════════
// BIRTH MODE — يمرر كل البيانات المتراكمة
// ══════════════════════════════════════════════════════════
async function birthMode(t0, runId) {
  logger.info('[BIRTH] Creating universe from scratch');
  const log = {}, data = {};

  const agents = [
    { name: 'Idea Agent',  path: './agents/idea-agent.js',  key: 'idea',  out: 'ideas.json', getArgs: ()        => []                                 },
    { name: 'Story Agent', path: './agents/story-agent.js', key: 'story', out: 'story.json', getArgs: ()        => [data.idea]                         },
    { name: 'Soul Agent',  path: './agents/soul-agent.js',  key: 'soul',  out: 'soul.json',  getArgs: ()        => [data.idea, data.story]             },
    { name: 'Art Agent',   path: './agents/art-agent.js',   key: 'art',   out: 'art.json',   getArgs: ()        => [data.idea, data.story, data.soul]  },
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

  // القالب — بدون Gemini
  log.template = await run('Template Engineer',
    './agents/template-engineer.js', [data.idea, data.story]);
  if (log.template?.success) {
    data.template = log.template.data;
    writeFileSync(
      join(__dirname, 'agents', 'template.json'),
      JSON.stringify(data.template, null, 2), 'utf8');
    save('template.json', data.template);
  }

  // عالم أول
  if (canAfford('world')) {
    const partial = { id: data.idea.id, name: data.idea.name, soul: data.soul, worlds: [] };
    log.world = await run('World 1', './agents/world-birth-agent.js', [partial], 'world');
    data.worlds = log.world?.success ? [log.world.data] : [];
    save('levels.json', { worlds: data.worlds });
  }

  // بناء اللعبة الأولى
  if (canAfford('code-agent') && data.idea.type === 'godot') {
    log.code = await run('Code Agent', './agents/code-agent.js',
      [data.idea, data.story, { worlds: data.worlds || [] }, data.art, data.template, {
        budget: getRemainingQuota(),
      }],
      'code-agent');
    if (log.code?.success) {
      save('code.json', log.code.data);
      triggerGodotExport(data.idea.id);
    }
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

  writeFileSync(
    join(RESULTS_DIR, 'run-report.json'),
    JSON.stringify(report, null, 2), 'utf8');

  logger.info('[DONE] Orchestrator v10.1', {
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

// ══════════════════════════════════════════════════════════
// Godot Export — يُطلق بعد اكتمال لعبة
// ══════════════════════════════════════════════════════════
function triggerGodotExport(gameId = '') {
  try {
    const cmd = `gh workflow run godot-export.yml --repo ${process.env.GITHUB_REPOSITORY}`
      + (gameId ? ` -f game_id=${gameId}` : '');
    execSync(cmd, { stdio: 'pipe' });
    logger.info('[OK] Godot export triggered', { gameId });
  } catch (err) {
    logger.warn('[WARN] Could not trigger Godot export', { error: err.message });
  }
}

main().catch(err => {
  logger.error('[CRASH] Orchestrator v10.1', { error: err.message });
  if (existsSync(UNIVERSE_BAK)) rollbackUniverse();
  process.exit(1);
});
