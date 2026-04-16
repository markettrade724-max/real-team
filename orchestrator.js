import 'dotenv/config';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { logger }         from './logger.js';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, 'agent-results');
if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

// ── إعدادات محسّنة ────────────────────────────────────────────
const DELAY   = 12000; // 12 ثانية بين الطلبات (5 RPM آمن)
const MAX_RPD = 6;     // 6 طلبات فقط — لا retries مهدرة
const TIMEOUT = 90000;
const RETRIES = 0;     // 0 retries — نوفّر الحصة للطلبات الأساسية

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
    logger.warn(`Quota limit — skipping ${name}`);
    return { success: false, error: 'QuotaLimit', duration: '0ms', attempts: 0 };
  }

  if (usesGemini) {
    logger.debug(`Waiting ${DELAY/1000}s...`);
    await sleep(DELAY);
  }

  // محاولة واحدة فقط — لا retries مهدِرة للحصة
  const maxAttempts = RETRIES + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
      logger.error(`❌ ${name}`, { attempt, error: err.message?.slice(0,120) });
      return { success: false, error: err.message?.slice(0,120), duration: fmt(Date.now()-t0), attempts: attempt };
    }
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

  // ── Phase 2: Idea (Gemini call #1) ───────────────────────────
  log.idea = await run('Idea Agent', './agents/idea-agent.js', []);
  if (log.idea?.success) { data.idea = log.idea.data; save('ideas.json', data.idea); }

  if (!data.idea) {
    logger.error('No idea generated — aborting');
    return saveReport(log, data, t0, runId);
  }

  // ── Phase 3: Art (Gemini call #2) ────────────────────────────
  // Art أهم من Story للعرض — نولّده أولاً
  log.art = await run('Art Agent', './agents/art-agent.js', [data.idea]);
  if (log.art?.success) { data.art = log.art.data; save('art.json', data.art); }

  // ── Phase 4: Levels (Gemini call #3) ─────────────────────────
  log.levels = await run('Level Agent', './agents/level-agent.js', [data.idea, null]);
  if (log.levels?.success) { data.levels = log.levels.data; save('levels.json', data.levels); }

  // ── Phase 5: Template Engineer ────────────────────────────────
  // يستخدم Gemini فقط للقوالب الجديدة (action/adventure/runner)
  const needsGemini = needsTemplateGemini(data.idea);
  if (needsGemini) {
    log.template = await run('Template Engineer', './agents/template-engineer.js', [data.idea, null], true);
  } else {
    log.template = await run('Template Engineer', './agents/template-engineer.js', [data.idea, null], false);
  }
  if (log.template?.success) { data.template = log.template.data; save('template.json', data.template); }

  // ── Phase 6: Build (بدون Gemini) ─────────────────────────────
  if (data.art) {
    log.code = await run('Code Agent', './agents/code-agent.js',
      [data.idea, null, data.levels, data.art, data.template], false);
    if (log.code?.success) { data.code = log.code.data; save('code.json', data.code); }
  }

  // ── Phase 7: Story (Gemini call #4) — اختياري ───────────────
  // نولّده بعد البناء حتى لا يعطّل اللعبة إذا فشل
  if (geminiCalls < MAX_RPD) {
    log.story = await run('Story Agent', './agents/story-agent.js', [data.idea]);
    if (log.story?.success) { data.story = log.story.data; save('story.json', data.story); }
  } else {
    logger.warn('Skipping Story Agent — quota reached');
  }

  // ── Phase 8: Marketing (Gemini call #5) — اختياري ────────────
  if (geminiCalls < MAX_RPD) {
    log.marketing = await run('Marketing Agent', './agents/marketing-agent.js', [data.idea, data.art]);
    if (log.marketing?.success) { data.marketing = log.marketing.data; save('marketing.json', data.marketing); }
  } else {
    logger.warn('Skipping Marketing Agent — quota reached');
  }

  // ── Phase 9: Roadmap (Gemini call #6) — اختياري ──────────────
  if (geminiCalls < MAX_RPD) {
    log.roadmap = await run('Roadmap Agent', './agents/roadmap-agent.js',
      [{ analytics: data.analytics, idea: data.idea, code: data.code }]);
    if (log.roadmap?.success) { data.roadmap = log.roadmap.data; save('roadmap.json', data.roadmap); }
  } else {
    logger.warn('Skipping Roadmap Agent — quota reached');
  }

  saveReport(log, data, t0, runId);
}

function needsTemplateGemini(idea) {
  const classic = new Set(['memory','puzzle','word','quiz','matching','trivia','arcade',
    'tool','app','timer','tracker','calculator','generator','productivity','wellness',
    'creative-app','creative','maker','builder']);
  return !classic.has((idea?.type || '').toLowerCase());
}

function saveReport(log, data, t0, runId) {
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
