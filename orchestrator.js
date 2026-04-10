import 'dotenv/config';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { logger }         from './logger.js';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, 'agent-results');
if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

// ── إعدادات Gemini ────────────────────────────────────────────
// الحد اليومي المجاني: 20 طلب — نستخدم 6 فقط لتوليد لعبة واحدة
const DELAY   = 20000; // 20 ثانية بين الطلبات (3 RPM آمن)
const MAX_RPD = 6;     // 6 طلبات فقط: idea+story+art+levels+marketing+roadmap
const TIMEOUT = 120000;
const RETRIES = 1;     // محاولة واحدة فقط لتوفير الحد

let geminiCalls = 0;

function save(file, data) {
  writeFileSync(join(RESULTS_DIR, file), JSON.stringify(data, null, 2), 'utf8');
  logger.debug(`Saved → ${file}`);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt   = ms => ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`;

async function run(name, path, args = [], usesGemini = true) {
  logger.info(`Starting: ${name}`);

  if (usesGemini && geminiCalls >= MAX_RPD) {
    logger.warn(`Limit reached — skipping ${name}`);
    return { success: false, error: 'Limit', duration: '0ms', attempts: 0 };
  }

  if (usesGemini) {
    logger.debug(`Waiting ${DELAY/1000}s...`);
    await sleep(DELAY);
  }

  for (let attempt = 1; attempt <= RETRIES + 1; attempt++) {
    if (attempt > 1) {
      logger.debug(`Retry ${attempt-1}/${RETRIES} (30s)...`);
      await sleep(30000);
    }
    const t0 = Date.now();
    try {
      const mod    = await import(`${path}?t=${Date.now()}`);
      const result = await Promise.race([
        mod.run(...args),
        new Promise((_,rej) => setTimeout(() => rej(new Error('Timeout')), TIMEOUT))
      ]);
      if (usesGemini) geminiCalls++;
      const d = fmt(Date.now()-t0);
      logger.info(`✅ ${name}`, { duration: d, geminiCalls: `${geminiCalls}/${MAX_RPD}` });
      return { success: true, data: result, duration: d, attempts: attempt };
    } catch(err) {
      logger.error(`❌ ${name}`, { attempt, error: err.message });
      if (attempt === RETRIES+1)
        return { success: false, error: err.message, duration: fmt(Date.now()-t0), attempts: attempt };
    }
  }
}

async function main() {
  const t0    = Date.now();
  const runId = new Date().toISOString().replace(/[:.]/g,'').slice(0,15);
  logger.info('Orchestrator started', { runId, maxRPD: MAX_RPD });

  const log  = {};
  const data = {};

  // ── Phase 1: Analytics (بدون Gemini — أولاً) ─────────────────
  logger.info('Phase 1: Analytics');
  log.analytics = await run('Analytics Agent', './agents/analytics-agent.js', [], false);
  if (log.analytics?.success) { data.analytics = log.analytics.data; save('analytics.json', data.analytics); }

  // ── Phase 2: Content (Gemini) ─────────────────────────────────
  logger.info('Phase 2: Content Generation');

  log.idea = await run('Idea Agent', './agents/idea-agent.js', []);
  if (log.idea?.success) { data.idea = log.idea.data; save('ideas.json', data.idea); }

  if (data.idea) {
    log.story = await run('Story Agent', './agents/story-agent.js', [data.idea]);
    if (log.story?.success) { data.story = log.story.data; save('story.json', data.story); }

    log.art = await run('Art Agent', './agents/art-agent.js', [data.idea]);
    if (log.art?.success) { data.art = log.art.data; save('art.json', data.art); }

    log.levels = await run('Level Agent', './agents/level-agent.js', [data.idea, data.story]);
    if (log.levels?.success) { data.levels = log.levels.data; save('levels.json', data.levels); }
  }

  // ── Phase 3: Build (بدون Gemini) ─────────────────────────────
  logger.info('Phase 3: Build');
  if (data.idea && data.art) {
    log.code = await run('Code Agent', './agents/code-agent.js',
      [data.idea, data.story, data.levels, data.art], false);
    if (log.code?.success) { data.code = log.code.data; save('code.json', data.code); }
  }

  // ── Phase 4: Marketing (Gemini) ───────────────────────────────
  logger.info('Phase 4: Marketing');
  if (data.idea) {
    log.marketing = await run('Marketing Agent', './agents/marketing-agent.js', [data.idea, data.art]);
    if (log.marketing?.success) { data.marketing = log.marketing.data; save('marketing.json', data.marketing); }
  }

  // ── Phase 5: Roadmap (Gemini) ─────────────────────────────────
  logger.info('Phase 5: Roadmap');
  log.roadmap = await run('Roadmap Agent', './agents/roadmap-agent.js',
    [{ analytics: data.analytics, idea: data.idea, code: data.code }]);
  if (log.roadmap?.success) { data.roadmap = log.roadmap.data; save('roadmap.json', data.roadmap); }

  // ── Report ────────────────────────────────────────────────────
  const report = {
    runId, timestamp: new Date().toISOString(),
    totalDuration: fmt(Date.now()-t0),
    geminiCalls: `${geminiCalls}/${MAX_RPD}`,
    agents: Object.fromEntries(Object.entries(log).map(([k,v]) => [k, {
      success: v?.success||false, duration: v?.duration||'—',
      attempts: v?.attempts||0,  error: v?.error||null,
    }])),
    summary: {
      total:   Object.keys(log).length,
      passed:  Object.values(log).filter(v=>v?.success).length,
      failed:  Object.values(log).filter(v=>!v?.success).length,
      newGame: data.code?.id || null,
    }
  };

  save('run-report.json', report);
  logger.info('Done', {
    duration: report.totalDuration,
    passed:   report.summary.passed,
    failed:   report.summary.failed,
    newGame:  report.summary.newGame,
    gemini:   report.geminiCalls,
  });
}

main().catch(err => {
  logger.error('Crashed', { error: err.message });
  process.exit(1);
});
