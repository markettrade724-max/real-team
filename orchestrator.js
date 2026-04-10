import 'dotenv/config';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { logger }         from './logger.js';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, 'agent-results');
if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

const DELAY    = 15000; // 15s بين الوكلاء (5 RPM)
const MAX_RPD  = 18;    // حد يومي آمن (من 20)
const TIMEOUT  = 90000;
const RETRIES  = 2;

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
    logger.warn(`Daily limit reached — skipping ${name}`);
    return { success: false, error: 'Daily limit', duration: '0ms', attempts: 0 };
  }

  if (usesGemini) {
    logger.debug(`Waiting ${DELAY/1000}s (rate limit)...`);
    await sleep(DELAY);
  }

  for (let attempt = 1; attempt <= RETRIES + 1; attempt++) {
    if (attempt > 1) { logger.debug(`Retry ${attempt-1}/${RETRIES}...`); await sleep(20000); }
    const t0 = Date.now();
    try {
      const mod    = await import(`${path}?t=${Date.now()}`);
      const result = await Promise.race([
        mod.run(...args),
        new Promise((_,rej) => setTimeout(() => rej(new Error('Timeout')), TIMEOUT))
      ]);
      if (usesGemini) geminiCalls++;
      const d = fmt(Date.now()-t0);
      logger.info(`Done: ${name}`, { duration: d, geminiCalls });
      return { success: true, data: result, duration: d, attempts: attempt };
    } catch(err) {
      logger.error(`Failed: ${name}`, { attempt, error: err.message });
      if (attempt === RETRIES+1) return { success: false, error: err.message, duration: fmt(Date.now()-t0), attempts: attempt };
    }
  }
}

async function main() {
  const t0    = Date.now();
  const runId = new Date().toISOString().replace(/[:.]/g,'').slice(0,15);
  logger.info('Orchestrator started', { runId, maxRPD: MAX_RPD });

  const log  = {};
  const data = {};

  // ── Phase 1: Content (Gemini) ─────────────────────────────
  logger.info('Phase 1: Content Generation');

  log.idea = await run('Idea Agent', './agents/idea-agent.js');
  if (log.idea?.success) { data.idea = log.idea.data; save('ideas.json', data.idea); }

  if (data.idea) {
    log.story  = await run('Story Agent',  './agents/story-agent.js',  [data.idea]);
    if (log.story?.success)  { data.story  = log.story.data;  save('story.json',  data.story);  }

    log.art    = await run('Art Agent',    './agents/art-agent.js',    [data.idea]);
    if (log.art?.success)    { data.art    = log.art.data;    save('art.json',    data.art);    }

    log.levels = await run('Level Agent',  './agents/level-agent.js',  [data.idea, data.story]);
    if (log.levels?.success) { data.levels = log.levels.data; save('levels.json', data.levels); }
  }

  // ── Phase 2: Build (no Gemini) ────────────────────────────
  logger.info('Phase 2: Build');

  if (data.idea && data.art) {
    log.code = await run('Code Agent', './agents/code-agent.js',
      [data.idea, data.story, data.levels, data.art], false);
    if (log.code?.success) { data.code = log.code.data; save('code.json', data.code); }
  }

  // ── Phase 3: Analytics (no Gemini) ───────────────────────
  logger.info('Phase 3: Analytics');

  log.analytics = await run('Analytics Agent', './agents/analytics-agent.js', [], false);
  if (log.analytics?.success) { data.analytics = log.analytics.data; save('analytics.json', data.analytics); }

  // ── Phase 4: Marketing + Feedback (Gemini) ───────────────
  logger.info('Phase 4: Marketing & Feedback');

  if (data.idea) {
    log.marketing = await run('Marketing Agent', './agents/marketing-agent.js', [data.idea, data.art]);
    if (log.marketing?.success) { data.marketing = log.marketing.data; save('marketing.json', data.marketing); }
  }

  log.feedback = await run('Feedback Agent', './agents/feedback-agent.js');
  if (log.feedback?.success) { data.feedback = log.feedback.data; save('feedback.json', data.feedback); }

  // ── Phase 5: Roadmap (Gemini) ─────────────────────────────
  logger.info('Phase 5: Roadmap');

  log.roadmap = await run('Roadmap Agent', './agents/roadmap-agent.js',
    [{ analytics: data.analytics, feedback: data.feedback, idea: data.idea, code: data.code }]);
  if (log.roadmap?.success) { data.roadmap = log.roadmap.data; save('roadmap.json', data.roadmap); }

  // ── Report ────────────────────────────────────────────────
  const report = {
    runId, timestamp: new Date().toISOString(),
    totalDuration: fmt(Date.now()-t0),
    geminiCalls,
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

  logger.info('Orchestrator finished', {
    duration:   report.totalDuration,
    passed:     report.summary.passed,
    failed:     report.summary.failed,
    newGame:    report.summary.newGame,
    geminiUsed: geminiCalls,
  });
}

main().catch(err => {
  logger.error('Orchestrator crashed', { error: err.message });
  process.exit(1);
});
