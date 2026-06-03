/**
 * orchestrator.js — v9.0
 *
 * التغييرات عن v8.0:
 *  - canAfford() بدل geminiCalls اليدوي — rule-153
 *  - getBudgetStatus() مصدر حقيقة وحيد للحصة
 *  - rollback تلقائي عند فشل أي وكيل يعدّل universe
 *  - الأحد = inventor فقط بكل الحصة المتبقية
 *  - episode يتحقق من canAfford قبل البدء
 *  - جدول أسبوعي مُصحَّح بتكاليف حقيقية
 *
 * القواعد المطبقة:
 *  rule-063 : أوضاع: BIRTH/EVOLUTION/INVENTION/REVIVAL/SYNC/CODE/EPISODE/LIBRARY
 *  rule-064 : العوالم لها أولوية مطلقة
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-111 : جدول الأسبوع
 *  rule-112 : getDayOfYear يبدأ من 1
 *  rule-128 : caller logging
 *  rule-153 : canAfford() إلزامي — لا أنصاف
 *
 *  rule-154 : rollback تلقائي عند فشل وكيل يعدّل universe
 *  rule-155 : getBudgetStatus() مصدر الحقيقة — لا عدادات يدوية
 *  rule-156 : الأحد محجوز للمخترع — لا evolution لا episode
 *  rule-157 : episode يتحقق من canAfford('screenplay') قبل البدء
 */

import { writeFileSync, readFileSync, copyFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { execSync }       from 'child_process';
import { logger }         from './logger.js';
import {
  canAfford,
  getBudgetStatus,
  getRemainingQuota,
} from './agents/_gemini.js';
import { run as runLibrary, getLibraryStatus } from './agents/library-builder-agent.js';
import { run as runSeries }                    from './agents/series-agent.js';
import { run as runAnalytics }                 from './agents/analytics-agent.js';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR  = join(__dirname, 'agent-results');
const UNIVERSE     = join(__dirname, 'universe.json');
const UNIVERSE_BAK = join(__dirname, 'universe.backup.json');

if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

const DELAY   = 15000;
const TIMEOUT = 180000; // 3 دقائق — وكلاء كاملة تحتاج وقتاً

const save  = (file, data) =>
  writeFileSync(join(RESULTS_DIR, file), JSON.stringify(data, null, 2), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt   = ms => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

// ── جدول الأسبوع ──────────────────────────
const DAY = new Date().getDay();
const SCHEDULE = {
  isInventionDay: DAY === 0,               // الأحد
  isRevivalDay:   [1, 3, 5].includes(DAY), // اثنين/أربعاء/جمعة
  isRoadmapDay:   DAY === 4,               // الخميس
  isSyncDay:      DAY === 6,               // السبت
  isEpisodeDay:   DAY !== 0 && DAY !== 6,  // كل يوم إلا الأحد والسبت
};

logger.info('[SCHEDULE] Today', {
  day:       ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][DAY],
  invention: SCHEDULE.isInventionDay,
  revival:   SCHEDULE.isRevivalDay,
  roadmap:   SCHEDULE.isRoadmapDay,
  sync:      SCHEDULE.isSyncDay,
  episode:   SCHEDULE.isEpisodeDay,
});

// ══════════════════════════════════════════════════════════
// rollback — حماية universe.json
// ══════════════════════════════════════════════════════════

function backupUniverse() {
  if (!existsSync(UNIVERSE)) return;
  copyFileSync(UNIVERSE, UNIVERSE_BAK);
  logger.info('[BACKUP] universe.backup.json saved');
}

function rollbackUniverse() {
  if (!existsSync(UNIVERSE_BAK)) {
    logger.warn('[ROLLBACK] No backup found — cannot rollback');
    return false;
  }
  copyFileSync(UNIVERSE_BAK, UNIVERSE);
  logger.warn('[ROLLBACK] universe.json restored from backup');
  return true;
}

function clearBackup() {
  if (existsSync(UNIVERSE_BAK)) {
    unlinkSync(UNIVERSE_BAK);
    logger.info('[BACKUP] Backup cleared after success');
  }
}

// ══════════════════════════════════════════════════════════
// دوال مساعدة
// ══════════════════════════════════════════════════════════

function loadUniverse() {
  if (!existsSync(UNIVERSE)) return null;
  try { return JSON.parse(readFileSync(UNIVERSE, 'utf8')); }
  catch { return null; }
}

function loadResult(file) {
  const path = join(RESULTS_DIR, file);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return null; }
}

function saveUniverse(universe) {
  writeFileSync(UNIVERSE, JSON.stringify(universe, null, 2), 'utf8');
  logger.info('[OK] Universe saved', {
    worlds:     universe.worlds?.length || 0,
    evolutions: universe.evolutions     || 0,
    inventions: universe.inventions     || 0,
    revivals:   universe.revivals       || 0,
  });
}

// ══════════════════════════════════════════════════════════
// تشغيل وكيل — مع canAfford + rollback
// ══════════════════════════════════════════════════════════

async function run(name, agentPath, args = [], costKey = null) {
  logger.info(`[RUN] ${name}`);

  // rule-153: تحقق من الحصة قبل البدء
  if (costKey && !canAfford(costKey)) {
    logger.warn(`[SKIP] ${name} — insufficient quota`);
    return { success: false, error: 'InsufficientQuota', duration: '0ms' };
  }

  // انتظر بين الاستدعاءات لتجنب rate limiting
  if (costKey) {
    logger.info(`[WAIT] ${DELAY / 1000}s before ${name}...`);
    await sleep(DELAY);
  }

  const t0 = Date.now();
  try {
    const mod    = await import(`${agentPath}?t=${Date.now()}`);
    const result = await Promise.race([
      mod.run(...args),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), TIMEOUT)),
    ]);
    const d = fmt(Date.now() - t0);
    const budget = getBudgetStatus();
    logger.info(`[OK] ${name}`, {
      duration: d,
      quotaLeft: budget.left,
      quotaUsed: `${budget.total}/${budget.limit}`,
    });
    return { success: true, data: result, duration: d };
  } catch (err) {
    const d = fmt(Date.now() - t0);
    logger.error(`[FAIL] ${name}`, { error: err.message.slice(0, 120), duration: d });
    return { success: false, error: err.message.slice(0, 120), duration: d };
  }
}

// ══════════════════════════════════════════════════════════
// STEP 0 — المكتبة (أولاً دائماً — 2 طلب فقط)
// ══════════════════════════════════════════════════════════

async function runLibraryStep(log) {
  logger.info('[LIBRARY] Building knowledge base...');

  const statusBefore = getLibraryStatus();
  logger.info('[LIBRARY] Status', {
    built:   statusBefore.built,
    total:   statusBefore.total,
    percent: `${statusBefore.percent}%`,
  });

  if (statusBefore.remaining === 0) {
    logger.info('[LIBRARY] Complete — skipping');
    log.library = { success: true, data: { skipped: true }, duration: '0ms' };
    return statusBefore;
  }

  if (!canAfford('library')) {
    logger.warn('[LIBRARY] No quota for library today');
    log.library = { success: false, error: 'InsufficientQuota', duration: '0ms' };
    return statusBefore;
  }

  const t0 = Date.now();
  try {
    const result = await runLibrary();
    const d = fmt(Date.now() - t0);
    const statusAfter = getLibraryStatus();
    log.library = { success: true, data: result, duration: d };
    logger.info('[LIBRARY] Done', {
      builtToday: result.built,
      percent:    `${statusAfter.percent}%`,
    });
    return statusAfter;
  } catch (err) {
    log.library = { success: false, error: err.message, duration: fmt(Date.now() - t0) };
    logger.error('[LIBRARY] Failed', { error: err.message });
    return statusBefore;
  }
}

// ══════════════════════════════════════════════════════════
// BIRTH MODE
// ══════════════════════════════════════════════════════════

async function birthMode(t0, runId) {
  logger.info('[BIRTH] Creating universe from scratch');
  const log = {}, data = {};

  await runLibraryStep(log);

  // analytics (بدون Gemini)
  log.analytics = await run('Analytics', './agents/analytics-agent.js', []);
  if (log.analytics?.success) { data.analytics = log.analytics.data; save('analytics.json', data.analytics); }

  // الفكرة
  log.idea = await run('Idea Agent', './agents/idea-agent.js', [], 'idea');
  if (!log.idea?.success) {
    logger.error('[BIRTH] No idea — aborting');
    return saveReport(log, data, t0, runId, 'birth', false);
  }
  data.idea = log.idea.data;
  save('ideas.json', data.idea);

  // القصة
  log.story = await run('Story Agent', './agents/story-agent.js', [data.idea], 'story');
  if (log.story?.success) { data.story = log.story.data; save('story.json', data.story); }

  // الروح
  log.soul = await run('Soul Agent', './agents/soul-agent.js', [data.idea, data.story], 'soul');
  if (log.soul?.success) { data.soul = log.soul.data; save('soul.json', data.soul); }

  // الهوية البصرية
  log.art = await run('Art Agent', './agents/art-agent.js', [data.idea, data.soul], 'art');
  if (log.art?.success) { data.art = log.art.data; save('art.json', data.art); }

  // القالب (بدون Gemini)
  log.template = await run('Template Engineer', './agents/template-engineer.js',
    [data.idea, data.story]);
  if (log.template?.success) { data.template = log.template.data; save('template.json', data.template); }

  // عالم أول
  if (canAfford('world')) {
    const partial = { id: data.idea.id, name: data.idea.name, soul: data.soul, worlds: [] };
    log['world-1'] = await run('World 1', './agents/world-birth-agent.js', [partial], 'world');
    data.worlds = log['world-1']?.success ? [log['world-1'].data] : [];
    save('levels.json', { worlds: data.worlds });
  }

  // بناء اللعبة
  if (data.idea.type === 'godot' && canAfford('code-agent')) {
    log.code = await run('Code Agent', './agents/code-agent.js',
      [data.idea, data.story, { worlds: data.worlds || [] }, data.art, data.template],
      'code-agent');
    if (log.code?.success) save('code.json', log.code.data);
  }

  // تسويق
  if (canAfford('marketing')) {
    log.marketing = await run('Marketing Agent', './agents/marketing-agent.js',
      [data.idea, data.art, data.soul], 'marketing');
    if (log.marketing?.success) save('marketing.json', log.marketing.data);
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

  log.collision = await run('Collision Check', './agents/collision-agent.js',
    [data.idea.id]);

  saveUniverse(universe);
  return saveReport(log, data, t0, runId, 'birth', true);
}

// ══════════════════════════════════════════════════════════
// EVOLUTION MODE
// ══════════════════════════════════════════════════════════

async function evolutionMode(universe, t0, runId) {
  logger.info('[EVOLUTION] Starting', {
    universe:   universe.id,
    evolutions: universe.evolutions,
    day:        ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][DAY],
    quotaLeft:  getRemainingQuota(),
  });

  const log = {};

  // ── 0. نسخة احتياطية قبل أي تعديل ────
  backupUniverse();

  // ── 1. المكتبة أولاً ──────────────────
  await runLibraryStep(log);

  // ── 2. عالم جديد ──────────────────────
  if (canAfford('world')) {
    log.world = await run('World Birth', './agents/world-birth-agent.js', [universe], 'world');
    if (log.world?.success && log.world.data?.name?.en) {
      universe.worlds.push(log.world.data);
      save('last-world.json', log.world.data);
      logger.info('[EVOLUTION] World born', { name: log.world.data.name?.en });

      log.collision = await run('Collision Check', './agents/collision-agent.js',
        [universe.id]);

      // بناء Godot إذا لم يُبنَ بعد
      const godotDir = join(__dirname, 'godot-projects', universe.id);
      if (!existsSync(godotDir) && canAfford('code-agent')) {
        const idea     = loadResult('ideas.json');
        const story    = loadResult('story.json');
        const template = loadResult('template.json');
        if (idea) {
          log.code = await run('Code Agent', './agents/code-agent.js',
            [idea, story, { worlds: universe.worlds }, universe.art, template],
            'code-agent');
          if (log.code?.success) save('code.json', log.code.data);
        }
      }
    } else {
      // world-birth فشل — rollback
      logger.warn('[EVOLUTION] World birth failed — rolling back');
      rollbackUniverse();
      return saveReport(log, {}, t0, runId, 'evolution', false);
    }
  }

  universe.evolutions++;
  universe.lastEvolved = new Date().toISOString();

  // ── 3. الأحد = inventor فقط (rule-156) ─
  if (SCHEDULE.isInventionDay) {
    logger.info('[INVENTION] Sunday — inventor takes all remaining quota');
    log.invention = await run('Inventor', './agents/inventor-agent.js', [universe], 'inventor');
    if (log.invention?.success) {
      universe.inventions = (universe.inventions || 0) +
        (log.invention.data?.inventions?.length || 1);
      universe.lastInvented = new Date().toISOString();
    }
  }

  // ── 4. episode (كل يوم ما عدا الأحد والسبت) ──
  if (SCHEDULE.isEpisodeDay && canAfford('screenplay')) {
    logger.info('[EPISODE] Producing episode...');
    try {
      const result = await runSeries(universe,
        process.env.EPISODE_NUMBER ? parseInt(process.env.EPISODE_NUMBER) : null);
      log.episode = { success: true, data: result, duration: '—' };
      logger.info('[OK] Episode done', { episode: result.episode, title: result.title });
    } catch (err) {
      log.episode = { success: false, error: err.message, duration: '—' };
      logger.warn('[EPISODE] Failed', { error: err.message });
    }
  }

  // ── 5. revival (اثنين/أربعاء/جمعة) ───
  if (SCHEDULE.isRevivalDay && canAfford('revival')) {
    log.revival = await run('Revival Agent', './agents/revival-agent.js', [universe], 'revival');
    if (log.revival?.success) {
      universe.revivals = (universe.revivals || 0) + (log.revival.data?.revived || 0);
      universe.lastRevived = new Date().toISOString();
      if (log.revival.data?.revived > 0) triggerGodotExport();
    }
  }

  // ── 6. roadmap (الخميس) ───────────────
  if (SCHEDULE.isRoadmapDay && canAfford('roadmap')) {
    const analytics = loadResult('analytics.json');
    log.roadmap = await run('Roadmap Agent', './agents/roadmap-agent.js',
      [{ analytics, universe }], 'roadmap');
    if (log.roadmap?.success) save('roadmap.json', log.roadmap.data);
  }

  // ── 7. sync + analytics (السبت) ──────
  if (SCHEDULE.isSyncDay) {
    logger.info('[SYNC] Saturday — sync + analytics');
    log.sync = await run('Supabase Sync', './scripts/sync-to-supabase.js', []);
    try {
      const analyticsResult = await runAnalytics(loadUniverse());
      log.analytics = { success: true, data: analyticsResult, duration: '—' };
      save('analytics.json', analyticsResult);
    } catch (err) {
      log.analytics = { success: false, error: err.message, duration: '—' };
    }
  }

  // ── 8. تسويق إذا بقيت حصة ────────────
  if (canAfford('marketing')) {
    log.marketing = await run('Marketing Agent', './agents/marketing-agent.js',
      [{ id: universe.id, name: universe.name,
         desc: { en: `World "${log.world?.data?.name?.en || ''}" born` }},
       universe.art, universe.soul], 'marketing');
    if (log.marketing?.success) save('marketing.json', log.marketing.data);
  }

  // ── حفظ نهائي + مسح النسخة الاحتياطية ─
  saveUniverse(universe);
  clearBackup();

  return saveReport(log, {}, t0, runId, 'evolution', true);
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

  logger.info('[START] Orchestrator v9.0', {
    runId,
    mode,
    hasUniverse:   !!universe,
    quotaLeft:     budget.left,
    libraryStatus: `${getLibraryStatus().percent}% built`,
  });

  // ── LIBRARY ──────────────────────────
  if (mode === 'library') {
    const log = {};
    await runLibraryStep(log);
    return saveReport(log, {}, t0, runId, 'library', true);
  }

  // ── BIRTH ────────────────────────────
  if (mode === 'birth' || !universe) {
    return birthMode(t0, runId);
  }

  // ── INVENTION ────────────────────────
  if (mode === 'invention') {
    backupUniverse();
    const log = {};
    await runLibraryStep(log);
    log.invention = await run('Inventor', './agents/inventor-agent.js', [universe], 'inventor');
    if (log.invention?.success) {
      universe.inventions = (universe.inventions || 0) +
        (log.invention.data?.inventions?.length || 1);
      universe.lastInvented = new Date().toISOString();
      saveUniverse(universe);
      clearBackup();
    } else {
      rollbackUniverse();
    }
    return saveReport(log, {}, t0, runId, 'invention', log.invention?.success || false);
  }

  // ── REVIVAL ──────────────────────────
  if (mode === 'revival') {
    backupUniverse();
    const log = {};
    await runLibraryStep(log);
    log.revival = await run('Revival Agent', './agents/revival-agent.js', [universe], 'revival');
    if (log.revival?.success) {
      universe.revivals = (universe.revivals || 0) + (log.revival.data?.revived || 0);
      universe.lastRevived = new Date().toISOString();
      saveUniverse(universe);
      clearBackup();
      if (log.revival.data?.revived > 0) triggerGodotExport();
    } else {
      rollbackUniverse();
    }
    return saveReport(log, {}, t0, runId, 'revival', log.revival?.success || false);
  }

  // ── SYNC ─────────────────────────────
  if (mode === 'sync') {
    const log = {};
    log.sync = await run('Supabase Sync', './scripts/sync-to-supabase.js', []);
    return saveReport(log, {}, t0, runId, 'sync', log.sync?.success || false);
  }

  // ── CODE ─────────────────────────────
  if (mode === 'code') {
    const log  = {};
    const idea     = loadResult('ideas.json');
    const story    = loadResult('story.json');
    const template = loadResult('template.json');
    if (!idea) { logger.error('[CODE] ideas.json not found'); process.exit(1); }
    log.code = await run('Code Agent', './agents/code-agent.js',
      [idea, story, { worlds: universe.worlds }, universe.art, template],
      'code-agent');
    if (log.code?.success) save('code.json', log.code.data);
    return saveReport(log, {}, t0, runId, 'code', log.code?.success || false);
  }

  // ── EPISODE ──────────────────────────
  if (mode === 'episode') {
    const log = {};
    await runLibraryStep(log);
    if (!canAfford('screenplay')) {
      logger.warn('[EPISODE] Insufficient quota — need 3 calls');
      return saveReport(log, {}, t0, runId, 'episode', false);
    }
    try {
      const result = await runSeries(universe,
        process.env.EPISODE_NUMBER ? parseInt(process.env.EPISODE_NUMBER) : null);
      log.episode = { success: true, data: result, duration: '—' };
      logger.info('[OK] Episode done', { episode: result.episode, title: result.title });
    } catch (err) {
      log.episode = { success: false, error: err.message, duration: '—' };
    }
    return saveReport(log, {}, t0, runId, 'episode', log.episode?.success || false);
  }

  // ── AUTO / EVOLUTION ─────────────────
  return evolutionMode(universe, t0, runId);
}

// ══════════════════════════════════════════════════════════
// تقرير النهاية
// ══════════════════════════════════════════════════════════

function saveReport(log, data, t0, runId, mode, success) {
  const libStatus = getLibraryStatus();
  const budget    = getBudgetStatus();

  const report = {
    runId,
    mode,
    success,
    timestamp:     new Date().toISOString(),
    totalDuration: fmt(Date.now() - t0),
    budget: {
      total:   budget.total,
      limit:   budget.limit,
      left:    budget.left,
      library: budget.library,
      agents:  budget.agents,
      percent: `${budget.percent}%`,
    },
    library: {
      built:   libStatus.built,
      total:   libStatus.total,
      percent: `${libStatus.percent}%`,
    },
    schedule: {
      day:       ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][DAY],
      invention: SCHEDULE.isInventionDay,
      revival:   SCHEDULE.isRevivalDay,
      roadmap:   SCHEDULE.isRoadmapDay,
      sync:      SCHEDULE.isSyncDay,
      episode:   SCHEDULE.isEpisodeDay,
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
    rolledBack: existsSync(UNIVERSE_BAK) && !success,
  };

  writeFileSync(
    join(RESULTS_DIR, 'run-report.json'),
    JSON.stringify(report, null, 2), 'utf8'
  );

  logger.info('[DONE] Orchestrator v9.0', {
    mode,
    success,
    duration:  report.totalDuration,
    passed:    report.summary.passed,
    failed:    report.summary.failed,
    quotaUsed: `${budget.total}/${budget.limit}`,
    library:   `${libStatus.percent}%`,
  });

  return report;
}

// ── Godot Export ──────────────────────────
function triggerGodotExport() {
  try {
    execSync(
      `gh workflow run godot-export.yml --repo ${process.env.GITHUB_REPOSITORY}`,
      { stdio: 'pipe' }
    );
    logger.info('[OK] Godot export triggered');
  } catch (err) {
    logger.warn('[WARN] Could not trigger Godot export', { error: err.message });
  }
}

main().catch(err => {
  logger.error('[CRASH] Orchestrator v9.0', { error: err.message });
  // محاولة أخيرة للـ rollback عند الانهيار
  if (existsSync(UNIVERSE_BAK)) {
    rollbackUniverse();
    logger.warn('[ROLLBACK] Emergency rollback on crash');
  }
  process.exit(1);
});
