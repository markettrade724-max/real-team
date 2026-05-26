/**
 * orchestrator.js — v7.0
 *
 * BIRTH MODE      : يولد الكون كاملاً (مرة في السنة)
 * EVOLUTION MODE  : يطور الكون يومياً
 * INVENTION MODE  : المخترع (الأحد)
 * REVIVAL MODE    : ترقية المنتجات (اثنين/أربعاء/جمعة)
 * SYNC MODE       : مزامنة Supabase (السبت)
 * CODE MODE       : بناء Godot لكون موجود
 *
 * جدول الأسبوع:
 *   الأحد     → EVOLUTION + inventor
 *   اثنين     → EVOLUTION + revival + godot-export
 *   الثلاثاء  → EVOLUTION
 *   الأربعاء  → EVOLUTION + revival + godot-export
 *   الخميس    → EVOLUTION + roadmap
 *   الجمعة    → EVOLUTION + revival + godot-export
 *   السبت     → EVOLUTION + sync-to-supabase
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { execSync }       from 'child_process';
import { logger }         from './logger.js';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, 'agent-results');
const UNIVERSE    = join(__dirname, 'universe.json');

if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

const DELAY   = 15000;
const MAX_RPD = 15;
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
    worlds:      universe.worlds?.length    || 0,
    evolutions:  universe.evolutions        || 0,
    inventions:  universe.inventions        || 0,
    revivals:    universe.revivals          || 0,
  });
}

async function run(name, agentPath, args = [], usesGemini = true) {
  logger.info(`[RUN] ${name}`);

  if (usesGemini && geminiCalls >= MAX_RPD) {
    logger.warn(`[SKIP] Quota limit — ${name}`);
    return { success: false, error: 'QuotaLimit', duration: '0ms' };
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
    const d = fmt(Date.now()-t0);
    logger.info(`[OK] ${name}`, { duration: d, gemini: `${geminiCalls}/${MAX_RPD}` });
    return { success: true, data: result, duration: d };
  } catch(err) {
    const d = fmt(Date.now()-t0);
    logger.error(`[FAIL] ${name}`, { error: err.message.slice(0,120), duration: d });
    return { success: false, error: err.message.slice(0,120), duration: d };
  }
}

// ════════════════════════════════════════════
// BIRTH MODE
// ════════════════════════════════════════════
async function birthMode(t0, runId) {
  logger.info('[BIRTH] Creating universe from scratch');
  const log = {}, data = {};

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
    logger.info(`[BIRTH] Soul: "${data.soul?.essence?.slice(0,60)}"`);
  }

  // 5. الهوية البصرية
  log.art = await run('Art Agent', './agents/art-agent.js', [data.idea, data.soul]);
  if (log.art?.success) { data.art = log.art.data; save('art.json', data.art); }

  // 6. القالب
  log.template = await run('Template Engineer', './agents/template-engineer.js',
    [data.idea, data.story], false);
  if (log.template?.success) { data.template = log.template.data; save('template.json', data.template); }

  // 7. العوالم الأولى — عبر world-birth-agent
  const initialWorlds = [];
  for (let i = 0; i < 3; i++) {
    const partialUniverse = {
      id: data.idea.id, name: data.idea.name,
      soul: data.soul, art: data.art,
      worlds: initialWorlds,
    };
    log[`world-${i+1}`] = await run(`World ${i+1}`, './agents/world-birth-agent.js',
      [partialUniverse]);
    if (log[`world-${i+1}`]?.success) {
      initialWorlds.push(log[`world-${i+1}`].data);
    }
  }
  data.worlds = initialWorlds;
  save('levels.json', { worlds: initialWorlds });

  // 8. بناء اللعبة
  log.code = await run('Code Agent', './agents/code-agent.js',
    [data.idea, data.story, { worlds: initialWorlds }, data.art, data.template],
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

  // بناء الكون
  const universe = {
    id:           data.idea.id,
    name:         data.idea.name,
    born:         new Date().toISOString(),
    soul:         data.soul,
    art:          data.art,
    worlds:       initialWorlds,
    evolutions:   0,
    inventions:   0,
    revivals:     0,
    lastEvolved:  null,
    lastInvented: null,
    lastRevived:  null,
  };

  // 11. فحص التصادم
  log.collision = await run('Collision Check', './agents/collision-agent.js',
    [data.idea.id], false);

  // 12. ذاكرة اللاعب
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

  // ── العالم الجديد المتكامل ────────────
  log.world = await run('World Birth', './agents/world-birth-agent.js', [universe]);
  if (log.world?.success) {
    const newWorld = log.world.data;
    universe.worlds.push(newWorld);
    save('last-world.json', newWorld);
    logger.info('[EVOLUTION] New world born', {
      name:    newWorld.name?.en,
      enemies: newWorld.enemies?.length || 0,
      weapon:  newWorld.weapon?.name?.en,
    });

    // فحص التصادم
    log.collision = await run('Collision Check', './agents/collision-agent.js',
      [universe.id], false);

    // بناء Godot إذا لم يكن موجوداً
    const godotDir = join(__dirname, 'godot-projects', universe.id);
    if (!existsSync(godotDir)) {
      logger.info('[EVOLUTION] Building Godot project...');
      const idea     = loadResult('ideas.json');
      const story    = loadResult('story.json');
      const art      = universe.art;
      const template = loadResult('template.json');
      if (idea) {
        log.code = await run('Code Agent', './agents/code-agent.js',
          [idea, story, { worlds: universe.worlds }, art, template],
          idea.type === 'godot');
        if (log.code?.success) save('code.json', log.code.data);
      }
    }
  }

  // ── تحديث الكون ──────────────────────
  universe.evolutions++;
  universe.lastEvolved = new Date().toISOString();

  // ── ذاكرة اللاعب ─────────────────────
  if (process.env.PLAYER_ID) {
    log.playerMemory = await run('Player Memory', './agents/player-memory.js',
      [universe, process.env.PLAYER_ID]);
  }

  // ── جدول الأسبوع ─────────────────────

  // الأحد — المخترع
  if (SCHEDULE.isInventionDay) {
    logger.info('[INVENTION] Sunday — inventor awakens');
    log.invention = await run('Inventor', './agents/inventor-agent.js', [universe], true);
    if (log.invention?.success) {
      universe.inventions = (universe.inventions || 0) + 1;
      universe.lastInvented = new Date().toISOString();
    }
  }

  // اثنين/أربعاء/جمعة — البعث
  if (SCHEDULE.isRevivalDay) {
    logger.info('[REVIVAL] Revival day');
    log.revival = await run('Revival Agent', './agents/revival-agent.js', [universe], true);
    if (log.revival?.success) {
      universe.revivals = (universe.revivals || 0) + (log.revival.data?.revived || 0);
      universe.lastRevived = new Date().toISOString();
      if (log.revival.data?.revived > 0) triggerGodotExport();
    }
  }

  // الخميس — خارطة الطريق
  if (SCHEDULE.isRoadmapDay) {
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
  log.marketing = await run('Marketing Agent', './agents/marketing-agent.js',
    [{ id: universe.id, name: universe.name,
       desc: { en: `World "${log.world?.data?.name?.en}" born` }},
     universe.art, universe.soul]);
  if (log.marketing?.success) save('marketing.json', log.marketing.data);

  return saveReport(log, data, t0, runId, 'evolution:world');
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
  const runId    = new Date().toISOString().replace(/[:.]/g,'').slice(0,15);
  const mode     = process.env.MODE || 'auto';
  const universe = loadUniverse();

  logger.info('[START] Orchestrator v7.0', { runId, mode, hasUniverse: !!universe });

  if (mode === 'birth' || !universe) {
    await birthMode(t0, runId);

  } else if (mode === 'invention') {
    const log = {};
    log.invention = await run('Inventor', './agents/inventor-agent.js', [universe], true);
    if (log.invention?.success) {
      universe.inventions = (universe.inventions || 0) + 1;
      universe.lastInvented = new Date().toISOString();
      saveUniverse(universe);
    }
    return saveReport(log, {}, t0, runId, 'invention');

  } else if (mode === 'revival') {
    const log = {};
    log.revival = await run('Revival Agent', './agents/revival-agent.js', [universe], true);
    if (log.revival?.success) {
      universe.revivals = (universe.revivals || 0) + (log.revival.data?.revived || 0);
      universe.lastRevived = new Date().toISOString();
      saveUniverse(universe);
    }
    return saveReport(log, {}, t0, runId, 'revival');

  } else if (mode === 'sync') {
    const log = {};
    log.sync = await run('Supabase Sync', './scripts/sync-to-supabase.js', [], false);
    return saveReport(log, {}, t0, runId, 'sync');

  } else if (mode === 'code') {
    const log = {};
    const idea     = loadResult('ideas.json');
    const story    = loadResult('story.json');
    const levels   = { worlds: universe.worlds };
    const art      = universe.art;
    const template = loadResult('template.json');
    if (!idea) { logger.error('[CODE] ideas.json not found'); process.exit(1); }
    log.code = await run('Code Agent', './agents/code-agent.js',
      [idea, story, levels, art, template], idea.type === 'godot');
    if (log.code?.success) save('code.json', log.code.data);
    return saveReport(log, {}, t0, runId, 'code');

  } else {
    await evolutionMode(universe, t0, runId);
  }
}

function saveReport(log, data, t0, runId, mode) {
  const report = {
    runId, mode,
    timestamp:     new Date().toISOString(),
    totalDuration: fmt(Date.now()-t0),
    geminiCalls:   `${geminiCalls}/${MAX_RPD}`,
    schedule: {
      day:       ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][DAY],
      invention: SCHEDULE.isInventionDay,
      revival:   SCHEDULE.isRevivalDay,
      roadmap:   SCHEDULE.isRoadmapDay,
      sync:      SCHEDULE.isSyncDay,
    },
    agents: Object.fromEntries(Object.entries(log).map(([k,v]) => [k, {
      success:  v?.success  || false,
      duration: v?.duration || '—',
      error:    v?.error    || null,
    }])),
    summary: {
      total:  Object.keys(log).length,
      passed: Object.values(log).filter(v=>v?.success).length,
      failed: Object.values(log).filter(v=>!v?.success).length,
    }
  };

  writeFileSync(join(RESULTS_DIR, 'run-report.json'),
    JSON.stringify(report, null, 2), 'utf8');

  logger.info('[DONE]', {
    mode,
    duration: report.totalDuration,
    passed:   report.summary.passed,
    failed:   report.summary.failed,
    gemini:   report.geminiCalls,
  });

  return report;
}

main().catch(err => {
  logger.error('[CRASH] Orchestrator', { error: err.message });
  process.exit(1);
});
