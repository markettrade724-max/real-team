/**
 * orchestrator.js — مصحح: يمرر template لـ code-agent
 */
import 'dotenv/config';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { logger }         from './logger.js';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, 'agent-results');
if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

const DELAY   = 15000; // 15 ثانية بين طلبات Gemini
const MAX_RPD = 6;
const TIMEOUT = 120000;

let geminiCalls = 0;

function save(file, data) {
  writeFileSync(join(RESULTS_DIR, file), JSON.stringify(data, null, 2), 'utf8');
  logger.debug(`Saved → ${file}`);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt   = ms => ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`;

async function run(name, agentPath, args = [], usesGemini = true) {
  logger.info(`▶ ${name}`);

  if (usesGemini && geminiCalls >= MAX_RPD) {
    logger.warn(`Quota limit — skipping ${name}`);
    return { success: false, error: 'QuotaLimit', duration: '0ms', attempts: 0 };
  }

  if (usesGemini) {
    logger.debug(`Waiting ${DELAY/1000}s (rate limit)...`);
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
    logger.info(`✅ ${name}`, { duration: d, gemini: `${geminiCalls}/${MAX_RPD}` });
    return { success: true, data: result, duration: d, attempts: 1 };
  } catch(err) {
    const d = fmt(Date.now()-t0);
    logger.error(`❌ ${name}`, { error: err.message.slice(0,120), duration: d });
    return { success: false, error: err.message.slice(0,120), duration: d, attempts: 1 };
  }
}

async function main() {
  const t0    = Date.now();
  const runId = new Date().toISOString().replace(/[:.]/g,'').slice(0,15);
  logger.info('Orchestrator started', { runId, maxRPD: MAX_RPD });

  const log  = {};
  const data = {};

  // ── Phase 1: Analytics (بدون Gemini) ─────────────────────────
  log.analytics = await run('Analytics Agent', './agents/analytics-agent.js', [], false);
  if (log.analytics?.success) { data.analytics = log.analytics.data; save('analytics.json', data.analytics); }

  // ── Phase 2: فكرة جديدة (Gemini #1) ─────────────────────────
  log.idea = await run('Idea Agent', './agents/idea-agent.js', []);
  if (log.idea?.success) { data.idea = log.idea.data; save('ideas.json', data.idea); }

  if (!data.idea) {
    logger.error('No idea generated — aborting content pipeline');
    return saveReport(log, data, t0, runId);
  }

  logger.info(`💡 New idea: "${data.idea.name?.en}" (type: ${data.idea.type})`);

  // ── Phase 3: هوية بصرية (Gemini #2) ──────────────────────────
  log.art = await run('Art Agent', './agents/art-agent.js', [data.idea]);
  if (log.art?.success) { data.art = log.art.data; save('art.json', data.art); }

  // ── Phase 4: اختيار القالب (بدون Gemini — منطق داخلي) ────────
  log.template = await run('Template Engineer', './agents/template-engineer.js',
    [data.idea, null], false); // ← بدون Gemini لتوفير الحصة
  if (log.template?.success) {
    data.template = log.template.data;
    save('template.json', data.template);
    logger.info(`📐 Template: ${data.template.templateFile}`);
  }

  // ── Phase 5: مستويات (Gemini #3) ─────────────────────────────
  log.levels = await run('Level Agent', './agents/level-agent.js',
    [data.idea, null]);
  if (log.levels?.success) { data.levels = log.levels.data; save('levels.json', data.levels); }

  // ── Phase 6: بناء اللعبة (بدون Gemini) ───────────────────────
  log.code = await run('Code Agent', './agents/code-agent.js',
    [data.idea, null, data.levels, data.art, data.template], false);
  if (log.code?.success) {
    data.code = log.code.data;
    save('code.json', data.code);
    if (!data.code?.skipped) {
      logger.info(`🎮 Built: ${data.code?.id} → ${data.code?.template}`);
    }
  }

  // ── Phase 7: تسويق (Gemini #4) ───────────────────────────────
  log.marketing = await run('Marketing Agent', './agents/marketing-agent.js',
    [data.idea, data.art]);
  if (log.marketing?.success) { data.marketing = log.marketing.data; save('marketing.json', data.marketing); }

  // ── Phase 8: خارطة الطريق (Gemini #5) ───────────────────────
  log.roadmap = await run('Roadmap Agent', './agents/roadmap-agent.js',
    [{ analytics: data.analytics, idea: data.idea, code: data.code }]);
  if (log.roadmap?.success) { data.roadmap = log.roadmap.data; save('roadmap.json', data.roadmap); }

  saveReport(log, data, t0, runId);
}

function saveReport(log, data, t0, runId) {
  const report = {
    runId,
    timestamp:     new Date().toISOString(),
    totalDuration: fmt(Date.now()-t0),
    geminiCalls:   `${geminiCalls}/${MAX_RPD}`,
    agents: Object.fromEntries(Object.entries(log).map(([k,v]) => [k, {
      success:  v?.success  || false,
      duration: v?.duration || '—',
      attempts: v?.attempts || 0,
      error:    v?.error    || null,
    }])),
    summary: {
      total:    Object.keys(log).length,
      passed:   Object.values(log).filter(v=>v?.success).length,
      failed:   Object.values(log).filter(v=>!v?.success).length,
      newGame:  data.code?.id       || null,
      template: data.code?.template || null,
    }
  };

  save('run-report.json', report);
  logger.info('✅ Done', {
    duration: report.totalDuration,
    passed:   report.summary.passed,
    failed:   report.summary.failed,
    newGame:  report.summary.newGame,
    template: report.summary.template,
    gemini:   report.geminiCalls,
  });
}

main().catch(err => {
  logger.error('Orchestrator crashed', { error: err.message });
  process.exit(1);
});
