/**
 * orchestrator.js — v8.0
 *
 * الجديد: دمج المكتبة-الجامعة في دورة العمل اليومية
 *
 * الأولويات:
 *   1. المكتبة تأخذ حصتها أولاً (14 طلب/يوم)
 *   2. الوكلاء يعملون بما تبقى (6 طلبات)
 *   3. الوكلاء يقرؤون من المكتبة — لا يستهلكون Gemini للتعلم
 *
 * الأوضاع:
 *   BIRTH      → يولد الكون كاملاً
 *   EVOLUTION  → يطور الكون يومياً
 *   INVENTION  → المخترع (الأحد)
 *   REVIVAL    → ترقية المنتجات (اثنين/أربعاء/جمعة)
 *   SYNC       → مزامنة Supabase (السبت)
 *   CODE       → بناء Godot لكون موجود
 *   LIBRARY    → بناء المكتبة فقط (يدوي)
 *
 * جدول الأسبوع:
 *   الأحد     → مكتبة + EVOLUTION + inventor
 *   الاثنين   → مكتبة + EVOLUTION + revival + godot-export
 *   الثلاثاء  → مكتبة + EVOLUTION
 *   الأربعاء  → مكتبة + EVOLUTION + revival + godot-export
 *   الخميس    → مكتبة + EVOLUTION + roadmap
 *   الجمعة    → مكتبة + EVOLUTION + revival + godot-export
 *   السبت     → مكتبة + EVOLUTION + sync-to-supabase
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { execSync }       from 'child_process';
import { logger }         from './logger.js';
import { run as runLibrary, getLibraryStatus } from './agents/library-builder-agent.js';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, 'agent-results');
const UNIVERSE    = join(__dirname, 'universe.json');

if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

// ── إعدادات الحصة ────────────────────────
const DAILY_LIMIT     = 20;  // إجمالي حصة Gemini
const LIBRARY_BUDGET  = 14;  // مخصص للمكتبة
const AGENTS_BUDGET   = 6;   // مخصص للوكلاء

const DELAY   = 15000;
const TIMEOUT = 120000;

let geminiCalls = 0;

const save  = (file, data) => writeFileSync(join(RESULTS_DIR, file), JSON.stringify(data, null, 2), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt   = ms => ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`;

// ── جدول الأسبوع ─────────────────────────
const DAY = new Date().getDay();
const SCHEDULE = {
  isInventionDay: DAY === 0,
  isRevivalDay:   [1, 3, 5].includes(DAY),
  isSyncDay:      DAY === 6,
  isRoadmapDay:   DAY === 4,
};

logger.info('[SCHEDULE] Today', {
  day:       ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][DAY],
  invention: SCHEDULE.isInventionDay,
  revival:   SCHEDULE.isRevivalDay,
  roadmap:   SCHEDULE.isRoadmapDay,
  sync:      SCHEDULE.isSyncDay,
});

// ════════════════════════════════════════════
// دوال مساعدة
// ════════════════════════════════════════════
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

async function run(name, agentPath, args = [], usesGemini = true) {
  logger.info(`[RUN] ${name}`);

  if (usesGemini && geminiCalls >= AGENTS_BUDGET) {
    logger.warn(`[SKIP] Agents quota reached — ${name}`);
    return { success: false, error: 'AgentsQuotaLimit', duration: '0ms' };
  }

  if (usesGemini) {
    logger.debug(`[WAIT] ${DELAY/1000}s before ${name}...`);
    await sleep(DELAY);
  }

  const t0 = Date.now();
  try {
    const mod    = await import(`${agentPath}?t=${Date.now()}`);
    const result = await Promise.race([
      mod.run(...args),
      new Promise((_,rej) => setTimeout(() => rej(new Error('Timeout')), TIMEOUT))
    ]);
    if (usesGemini) geminiCalls++;
    const d = fmt(Date.now() - t0);
    logger.info(`[OK] ${name}`, { duration: d, agentCalls: `${geminiCalls}/${AGENTS_BUDGET}` });
    return { success: true, data: result, duration: d };
  } catch(err) {
    const d = fmt(Date.now() - t0);
    logger.error(`[FAIL] ${name}`, { error: err.message.slice(0, 120), duration: d });
    return { success: false, error: err.message.slice(0, 120), duration: d };
  }
}

// ════════════════════════════════════════════
// STEP 0 — المكتبة-الجامعة (أولاً دائماً)
// ════════════════════════════════════════════
async function runLibraryStep(log) {
  logger.info('[LIBRARY] Building university knowledge base...');

  const statusBefore = getLibraryStatus();
  logger.info('[LIBRARY] Status before', {
    built:     statusBefore.built,
    total:     statusBefore.total,
    percent:   `${statusBefore.percent}%`,
    budgetLeft: statusBefore.budget.left,
  });

  // إذا المكتبة مكتملة أو الميزانية صفر — تخطّ
  if (statusBefore.remaining === 0) {
    logger.info('[LIBRARY] Complete — no build needed today');
    log.library = { success: true, data: { skipped: true, reason: 'complete' }, duration: '0ms' };
    return statusBefore;
  }

  if (statusBefore.budget.left === 0) {
    logger.warn('[LIBRARY] Budget exhausted for today');
    log.library = { success: false, error: 'BudgetExhausted', duration: '0ms' };
    return statusBefore;
  }

  const t0 = Date.now();
  try {
    const result = await runLibrary();
    const d = fmt(Date.now() - t0);
    const statusAfter = getLibraryStatus();

    log.library = { success: true, data: result, duration: d };

    logger.info('[LIBRARY] Session done', {
      builtToday: result.built,
      totalBuilt: statusAfter.built,
      total:      statusAfter.total,
      percent:    `${statusAfter.percent}%`,
      daysLeft:   statusAfter.daysLeft,
    });

    return statusAfter;
  } catch (err) {
    log.library = { success: false, error: err.message, duration: fmt(Date.now() - t0) };
    logger.error('[LIBRARY] Failed', { error: err.message });
    return statusBefore;
  }
}

// ════════════════════════════════════════════
// BIRTH MODE
// ════════════════════════════════════════════
async function birthMode(t0, runId) {
  logger.info('[BIRTH] Creating universe from scratch');
  const log = {}, data = {};

  // 0. المكتبة أولاً
  await runLibraryStep(log);

  // 1. Analytics
  log.analytics = await run('Analytics', './agents/analytics-agent.js', [], false);
  if (log.analytics?.success) { data.analytics = log.analytics.data; save('analytics.json', data.analytics); }

  // 2. الفكرة
  log.idea = await run('Idea Agent', './agents/idea-agent.js', []);
  if (!log.idea?.success) {
    logger.error('[BIRTH] No idea — aborting');
    return saveReport(log, data, t0, runId, 'birth');
  }
  data.idea = log.idea.data;
  save('ideas.json', data.idea);
  logger.info(`[BIRTH] Universe: "${data.idea.name?.en}"`);

  // 3. القصة
  log.story = await run('Story Agent', './agents/story-agent.js', [data.idea]);
  if (log.story?.success) { data.story = log.story.data; save('story.json', data.story); }

  // 4. وثيقة الروح
  log.soul = await run('Soul Agent', './agents/soul-agent.js', [data.idea, data.story]);
  if (log.soul?.success) {
    data.soul = log.soul.data;
    save('soul.json', data.soul);
    logger.info(`[BIRTH] Soul: "${data.soul?.essence?.slice(0, 60)}"`);
  }

  // 5. الهوية البصرية
  log.art = await run('Art Agent', './agents/art-agent.js', [data.idea, data.soul]);
  if (log.art?.success) { data.art = log.art.data; save('art.json', data.art); }

  // 6. القالب
  log.template = await run('Template Engineer', './agents/template-engineer.js',
    [data.idea, data.story], false);
  if (log.template?.success) { data.template = log.template.data; save('template.json', data.template); }

  // 7. عالم أول (بحدود الميزانية المتبقية)
  if (geminiCalls < AGENTS_BUDGET) {
    const partialUniverse = {
      id: data.idea.id, name: data.idea.name,
      soul: data.soul, art: data.art, worlds: [],
    };
    log['world-1'] = await run('World 1', './agents/world-birth-agent.js', [partialUniverse]);
    data.worlds = log['world-1']?.success ? [log['world-1'].data] : [];
    save('levels.json', { worlds: data.worlds });
  }

  // 8. بناء اللعبة
  log.code = await run('Code Agent', './agents/code-agent.js',
    [data.idea, data.story, { worlds: data.worlds || [] }, data.art, data.template],
    data.idea.type === 'godot');
  if (log.code?.success) { data.code = log.code.data; save('code.json', data.code); }

  // 9. تسويق
  log.marketing = await run('Marketing Agent', './agents/marketing-agent.js',
    [data.idea, data.art, data.soul]);
  if (log.marketing?.success) { data.marketing = log.marketing.data; save('marketing.json', data.marketing); }

  // 10. خارطة الطريق
  log.roadmap = await run('Roadmap Agent', './agents/roadmap-agent.js',
    [{ analytics: data.analytics, idea: data.idea, code: data.code }]);
  if (log.roadmap?.success) { data.roadmap = log.roadmap.data; save('roadmap.json', data.roadmap); }

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
    [data.idea.id], false);

  if (process.env.PLAYER_ID) {
    log.playerMemory = await run('Player Memory', './agents/player-memory.js',
      [universe, process.env.PLAYER_ID]);
  }

  saveUniverse(universe);
  return saveReport(log, data, t0, runId, 'birth');
}

// ════════════════════════════════════════════
// EVOLUTION MODE
// ════════════════════════════════════════════
async function evolutionMode(universe, t0, runId) {
  logger.info('[EVOLUTION] Starting', {
    universe:   universe.id,
    evolutions: universe.evolutions,
    day: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][DAY],
  });

  const log = {}, data = { universe };

  // 0. المكتبة أولاً — دائماً
  const libraryStatus = await runLibraryStep(log);

  logger.info('[LIBRARY] Agents will read from:', {
    built:   libraryStatus.built,
    percent: `${libraryStatus.percent}%`,
  });

  // ── العالم الجديد ─────────────────────
  log.world = await run('World Birth', './agents/world-birth-agent.js', [universe]);
  if (log.world?.success && log.world.data?.name?.en) {
    const newWorld = log.world.data;
    universe.worlds.push(newWorld);
    save('last-world.json', newWorld);
    logger.info('[EVOLUTION] New world born', {
      name:    newWorld.name?.en,
      enemies: newWorld.enemies?.length || 0,
      weapon:  newWorld.weapon?.name?.en,
    });

    log.collision = await run('Collision Check', './agents/collision-agent.js',
      [universe.id], false);

    const godotDir = join(__dirname, 'godot-projects', universe.id);
    if (!existsSync(godotDir) && geminiCalls < AGENTS_BUDGET) {
      logger.info('[EVOLUTION] Building Godot project...');
      const idea     = loadResult('ideas.json');
      const story    = loadResult('story.json');
      const template = loadResult('template.json');
      if (idea) {
        log.code = await run('Code Agent', './agents/code-agent.js',
          [idea, story, { worlds: universe.worlds }, universe.art, template],
          idea.type === 'godot');
        if (log.code?.success) save('code.json', log.code.data);
      }
    }
  }

  universe.evolutions++;
  universe.lastEvolved = new Date().toISOString();

  if (process.env.PLAYER_ID) {
    log.playerMemory = await run('Player Memory', './agents/player-memory.js',
      [universe, process.env.PLAYER_ID]);
  }

  // ── جدول الأسبوع ─────────────────────

  // الأحد — المخترع
  if (SCHEDULE.isInventionDay && geminiCalls < AGENTS_BUDGET) {
    logger.info('[INVENTION] Sunday — inventor awakens');
    log.invention = await run('Inventor', './agents/inventor-agent.js', [universe], true);
    if (log.invention?.success) {
      universe.inventions = (universe.inventions || 0) + 1;
      universe.lastInvented = new Date().toISOString();
    }
  }

  // اثنين/أربعاء/جمعة — البعث
  if (SCHEDULE.isRevivalDay && geminiCalls < AGENTS_BUDGET) {
    logger.info('[REVIVAL] Revival day');
    log.revival = await run('Revival Agent', './agents/revival-agent.js', [universe], true);
    if (log.revival?.success) {
      universe.revivals = (universe.revivals || 0) + (log.revival.data?.revived || 0);
      universe.lastRevived = new Date().toISOString();
      if (log.revival.data?.revived > 0) triggerGodotExport();
    }
  }

  // الخميس — خارطة الطريق
  if (SCHEDULE.isRoadmapDay && geminiCalls < AGENTS_BUDGET) {
    logger.info('[ROADMAP] Thursday — updating roadmap');
    const analytics = loadResult('analytics.json');
    log.roadmap = await run('Roadmap Agent', './agents/roadmap-agent.js',
      [{ analytics, universe }]);
    if (log.roadmap?.success) save('roadmap.json', log.roadmap.data);
  }

  // السبت — مزامنة Supabase
  if (SCHEDULE.isSyncDay) {
    logger.info('[SYNC] Saturday — syncing to Supabase');
    log.sync = await run('Supabase Sync', './scripts/sync-to-supabase.js', [], false);
  }

  saveUniverse(universe);

  // تسويق
  if (geminiCalls < AGENTS_BUDGET) {
    log.marketing = await run('Marketing Agent', './agents/marketing-agent.js',
      [{ id: universe.id, name: universe.name,
         desc: { en: `World "${log.world?.data?.name?.en}" born` }},
       universe.art, universe.soul]);
    if (log.marketing?.success) save('marketing.json', log.marketing.data);
  }

  return saveReport(log, data, t0, runId, 'evolution');
}

// ── تشغيل Godot Export ───────────────────
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

// ════════════════════════════════════════════
// نقطة الدخول
// ════════════════════════════════════════════
async function main() {
  const t0       = Date.now();
  const runId    = new Date().toISOString().replace(/[:.]/g,'').slice(0, 15);
  const mode     = process.env.MODE || 'auto';
  const universe = loadUniverse();

  logger.info('[START] Orchestrator v8.0', {
    runId,
    mode,
    hasUniverse:  !!universe,
    libraryStatus: `${getLibraryStatus().percent}% built`,
    budgetPlan:   `library:${LIBRARY_BUDGET} + agents:${AGENTS_BUDGET} = ${DAILY_LIMIT}/day`,
  });

  // ── LIBRARY فقط (يدوي) ───────────────
  if (mode === 'library') {
    const log = {};
    await runLibraryStep(log);
    return saveReport(log, {}, t0, runId, 'library');
  }

  // ── BIRTH ────────────────────────────
  if (mode === 'birth' || !universe) {
    return birthMode(t0, runId);
  }

  // ── INVENTION ────────────────────────
  if (mode === 'invention') {
    const log = {};
    await runLibraryStep(log);
    log.invention = await run('Inventor', './agents/inventor-agent.js', [universe], true);
    if (log.invention?.success) {
      universe.inventions = (universe.inventions || 0) + 1;
      universe.lastInvented = new Date().toISOString();
      saveUniverse(universe);
    }
    return saveReport(log, {}, t0, runId, 'invention');
  }

  // ── REVIVAL ──────────────────────────
  if (mode === 'revival') {
    const log = {};
    await runLibraryStep(log);
    log.revival = await run('Revival Agent', './agents/revival-agent.js', [universe], true);
    if (log.revival?.success) {
      universe.revivals = (universe.revivals || 0) + (log.revival.data?.revived || 0);
      universe.lastRevived = new Date().toISOString();
      saveUniverse(universe);
    }
    return saveReport(log, {}, t0, runId, 'revival');
  }

  // ── SYNC ─────────────────────────────
  if (mode === 'sync') {
    const log = {};
    log.sync = await run('Supabase Sync', './scripts/sync-to-supabase.js', [], false);
    return saveReport(log, {}, t0, runId, 'sync');
  }

  // ── CODE ─────────────────────────────
  if (mode === 'code') {
    const log = {};
    const idea     = loadResult('ideas.json');
    const story    = loadResult('story.json');
    const template = loadResult('template.json');
    if (!idea) { logger.error('[CODE] ideas.json not found'); process.exit(1); }
    log.code = await run('Code Agent', './agents/code-agent.js',
      [idea, story, { worlds: universe.worlds }, universe.art, template],
      idea.type === 'godot');
    if (log.code?.success) save('code.json', log.code.data);
    return saveReport(log, {}, t0, runId, 'code');
  }

  // ── AUTO / EVOLUTION (الافتراضي) ─────
  return evolutionMode(universe, t0, runId);
}

// ════════════════════════════════════════════
// تقرير النهاية
// ════════════════════════════════════════════
function saveReport(log, data, t0, runId, mode) {
  const libStatus = getLibraryStatus();

  const report = {
    runId, mode,
    timestamp:     new Date().toISOString(),
    totalDuration: fmt(Date.now() - t0),
    budget: {
      library: { limit: LIBRARY_BUDGET, used: libStatus.budget.used, left: libStatus.budget.left },
      agents:  { limit: AGENTS_BUDGET,  used: geminiCalls,           left: AGENTS_BUDGET - geminiCalls },
      total:   DAILY_LIMIT,
    },
    library: {
      built:   libStatus.built,
      total:   libStatus.total,
      percent: `${libStatus.percent}%`,
      daysLeft: libStatus.daysLeft,
    },
    schedule: {
      day:       ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][DAY],
      invention: SCHEDULE.isInventionDay,
      revival:   SCHEDULE.isRevivalDay,
      roadmap:   SCHEDULE.isRoadmapDay,
      sync:      SCHEDULE.isSyncDay,
    },
    agents: Object.fromEntries(Object.entries(log).map(([k, v]) => [k, {
      success:  v?.success  || false,
      duration: v?.duration || '—',
      error:    v?.error    || null,
    }])),
    summary: {
      total:  Object.keys(log).length,
      passed: Object.values(log).filter(v => v?.success).length,
      failed: Object.values(log).filter(v => !v?.success).length,
    },
  };

  writeFileSync(join(RESULTS_DIR, 'run-report.json'),
    JSON.stringify(report, null, 2), 'utf8');

  logger.info('[DONE]', {
    mode,
    duration:  report.totalDuration,
    passed:    report.summary.passed,
    failed:    report.summary.failed,
    library:   `${libStatus.percent}% (${libStatus.built}/${libStatus.total})`,
    agentCalls: `${geminiCalls}/${AGENTS_BUDGET}`,
  });

  return report;
}

main().catch(err => {
  logger.error('[CRASH] Orchestrator v8.0', { error: err.message });
  process.exit(1);
});
