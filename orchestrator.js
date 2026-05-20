/**
 * orchestrator.js — v4.0
 * BIRTH MODE    : يولد الكون كاملاً (مرة في السنة)
 * EVOLUTION MODE: يضيف للكون الموجود (كل تشغيل)
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { logger }         from './logger.js';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, 'agent-results');
const UNIVERSE    = join(__dirname, 'universe.json');

if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

const DELAY   = 15000;
const MAX_RPD = 15; // ✅ إصلاح 1: رفع الحد لاستيعاب BIRTH الكامل
const TIMEOUT = 120000;

let geminiCalls = 0;

const save  = (file, data) => writeFileSync(join(RESULTS_DIR, file), JSON.stringify(data, null, 2), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt   = ms => ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`;

function loadUniverse() {
  if (!existsSync(UNIVERSE)) return null;
  try { return JSON.parse(readFileSync(UNIVERSE, 'utf8')); }
  catch { return null; }
}

function saveUniverse(universe) {
  writeFileSync(UNIVERSE, JSON.stringify(universe, null, 2), 'utf8');
  logger.info('Universe saved', {
    worlds:     universe.worlds?.length    || 0,
    weapons:    universe.weapons?.length   || 0,
    enemies:    universe.enemies?.length   || 0,
    vehicles:   universe.vehicles?.length  || 0,
    evolutions: universe.evolutions        || 0,
  });
}

async function run(name, agentPath, args = [], usesGemini = true) {
  logger.info(`▶ ${name}`);

  if (usesGemini && geminiCalls >= MAX_RPD) {
    logger.warn(`Quota limit — skipping ${name}`);
    return { success: false, error: 'QuotaLimit', duration: '0ms', attempts: 0 };
  }

  if (usesGemini) {
    logger.debug(`Waiting ${DELAY/1000}s...`);
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
    logger.info(`OK ${name}`, { duration: d, gemini: `${geminiCalls}/${MAX_RPD}` });
    return { success: true, data: result, duration: d, attempts: 1 };
  } catch(err) {
    const d = fmt(Date.now()-t0);
    logger.error(`FAIL ${name}`, { error: err.message.slice(0,120), duration: d });
    return { success: false, error: err.message.slice(0,120), duration: d, attempts: 1 };
  }
}

async function runWorldSensesAgent(universe, world, log) {
  const worldId = world.id || world.name?.en?.replace(/\s/g, '-').toLowerCase();
  const key     = `senses-${worldId}`;
  log[key] = await run('World Senses', './agents/world-senses-agent.js', [universe, world]);
  if (log[key]?.success) {
    const senses = log[key].data;
    world.noise  = senses.noise;
    world.shader = senses.shader;
    world.audio  = senses.audio;
    save(`senses-${worldId}.json`, senses);
  }
}

// ════════════════════════════════════════════
// BIRTH MODE
// ════════════════════════════════════════════
async function birthMode(t0, runId) {
  logger.info('BIRTH MODE — Creating universe from scratch');
  const log = {}, data = {};

  // 1. Analytics
  log.analytics = await run('Analytics', './agents/analytics-agent.js', [], false);
  if (log.analytics?.success) { data.analytics = log.analytics.data; save('analytics.json', data.analytics); }

  // 2. الفكرة
  log.idea = await run('Idea Agent', './agents/idea-agent.js', []);
  if (!log.idea?.success) {
    logger.error('No idea — aborting BIRTH');
    return saveReport(log, data, t0, runId, 'birth');
  }
  data.idea = log.idea.data;
  save('ideas.json', data.idea);
  logger.info(`Universe idea: "${data.idea.name?.en}"`);

  // 3. القصة
  log.story = await run('Story Agent', './agents/story-agent.js', [data.idea]);
  if (log.story?.success) { data.story = log.story.data; save('story.json', data.story); }

  // 4. وثيقة الروح
  log.soul = await run('Soul Agent', './agents/soul-agent.js', [data.idea, data.story]);
  if (log.soul?.success) {
    data.soul = log.soul.data;
    save('soul.json', data.soul);
    logger.info(`Soul: "${data.soul?.essence?.slice(0,60)}"`);
  }

  // 5. الهوية البصرية
  log.art = await run('Art Agent', './agents/art-agent.js', [data.idea, data.soul]);
  if (log.art?.success) { data.art = log.art.data; save('art.json', data.art); }

  // 6. القالب
  log.template = await run('Template Engineer', './agents/template-engineer.js',
    [data.idea, data.story], false);
  if (log.template?.success) { data.template = log.template.data; save('template.json', data.template); }

  // 7. العوالم الأولى
  log.levels = await run('Level Agent', './agents/level-agent.js', [data.idea, data.story]);
  if (log.levels?.success) {
    data.levels = log.levels.data;
    save('levels.json', data.levels);

    // وكيل الحواس على كل عالم
    const partialUniverse = { name: data.idea.name, soul: data.soul, art: data.art };
    if (data.levels.worlds) {
      for (const world of data.levels.worlds) {
        await runWorldSensesAgent(partialUniverse, world, log);
      }
    }
  }

  // 8. بناء اللعبة
  log.code = await run('Code Agent', './agents/code-agent.js',
    [data.idea, data.story, data.levels, data.art, data.template],
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

  // بناء الكون الكامل
  const universe = {
    id:          data.idea.id,
    name:        data.idea.name,
    born:        new Date().toISOString(),
    soul:        data.soul,
    art:         data.art,
    worlds:      data.levels?.worlds || [],
    weapons:     [],
    enemies:     [],
    vehicles:    [],
    evolutions:  0,
    lastEvolved: null,
  };

  // 11. فحص التصادم (بعد بناء universe الكامل)
  log.collision = await run('Collision Check', './agents/collision-agent.js',
    [data.idea.id], false);
  if (log.collision?.success) { data.collision = log.collision.data; }

  // ✅ إصلاح 2: تمرير universe الكامل لـ player-memory
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
  logger.info('EVOLUTION MODE', {
    universe:   universe.id,
    evolutions: universe.evolutions,
  });

  const log = {}, data = { universe };
  const evolutionType = pickEvolutionType(universe);
  logger.info(`Evolution type: ${evolutionType}`);

  switch (evolutionType) {

    case 'world': {
      log.world = await run('World Evolution', './agents/world-evolution-agent.js', [universe]);
      if (log.world?.success) {
        const newWorld = log.world.data;
        universe.worlds.push(newWorld);
        save('last-world.json', newWorld);
        logger.info(`New world: "${newWorld.name?.en}"`);
        await runWorldSensesAgent(universe, newWorld, log);

        // ✅ إصلاح 3: فحص التصادم فقط عند تطور العوالم
        log.collision = await run('Collision Check', './agents/collision-agent.js',
          [universe.id], false);
        if (log.collision?.success) { data.collision = log.collision.data; }
      }
      break;
    }

    case 'weapon': {
      log.weapon = await run('Weapon Evolution', './agents/weapon-evolution-agent.js', [universe]);
      if (log.weapon?.success) {
        universe.weapons.push(log.weapon.data);
        save('last-weapon.json', log.weapon.data);
        logger.info(`New weapon: "${log.weapon.data.name?.en}"`);
      }
      break;
    }

    case 'enemy': {
      log.enemy = await run('Enemy Evolution', './agents/enemy-evolution-agent.js', [universe]);
      if (log.enemy?.success) {
        universe.enemies.push(log.enemy.data);
        save('last-enemy.json', log.enemy.data);
        logger.info(`New enemy: "${log.enemy.data.name?.en}"`);
      }
      break;
    }

    case 'vehicle': {
      log.vehicle = await run('Vehicle Evolution', './agents/vehicle-evolution-agent.js', [universe]);
      if (log.vehicle?.success) {
        universe.vehicles.push(log.vehicle.data);
        save('last-vehicle.json', log.vehicle.data);
        logger.info(`New vehicle: "${log.vehicle.data.name?.en}"`);
      }
      break;
    }
  }

  // ذاكرة اللاعب
  if (process.env.PLAYER_ID) {
    log.playerMemory = await run('Player Memory', './agents/player-memory.js',
      [universe, process.env.PLAYER_ID]);
  }

  // تحديث الكون
  universe.evolutions++;
  universe.lastEvolved = new Date().toISOString();
  saveUniverse(universe);

  // تسويق
  log.marketing = await run('Marketing Agent', './agents/marketing-agent.js',
    [{ id: universe.id, name: universe.name,
       desc: { en: `New ${evolutionType} added to the universe` }},
     universe.art, universe.soul]);
  if (log.marketing?.success) { save('marketing.json', log.marketing.data); }

  return saveReport(log, data, t0, runId, `evolution:${evolutionType}`);
}

// ── اختيار نوع التطور ────────────────────
function pickEvolutionType(universe) {
  const worldsCount = universe.worlds?.length || 0;
  const dayOfYear   = getDayOfYear();

  if (worldsCount < dayOfYear) return 'world';

  const counts = {
    weapon:  universe.weapons?.length  || 0,
    enemy:   universe.enemies?.length  || 0,
    vehicle: universe.vehicles?.length || 0,
  };

  return Object.entries(counts).sort((a, b) => a[1] - b[1])[0][0];
}

function getDayOfYear() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / 86400000);
}

// ════════════════════════════════════════════
// نقطة الدخول
// ════════════════════════════════════════════
async function main() {
  const t0       = Date.now();
  const runId    = new Date().toISOString().replace(/[:.]/g,'').slice(0,15);
  const mode     = process.env.MODE || 'auto';
  const universe = loadUniverse();

  logger.info('Orchestrator started', { runId, mode, hasUniverse: !!universe });

  if (mode === 'birth' || !universe) {
    await birthMode(t0, runId);
  } else {
    await evolutionMode(universe, t0, runId);
  }
}

function saveReport(log, data, t0, runId, mode) {
  const report = {
    runId,
    mode,
    timestamp:     new Date().toISOString(),
    totalDuration: fmt(Date.now()-t0),
    geminiCalls:   `${geminiCalls}/${MAX_RPD}`,
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

  logger.info('Done', {
    mode,
    duration: report.totalDuration,
    passed:   report.summary.passed,
    failed:   report.summary.failed,
    gemini:   report.geminiCalls,
  });

  return report;
}

main().catch(err => {
  logger.error('Orchestrator crashed', { error: err.message });
  process.exit(1);
});
