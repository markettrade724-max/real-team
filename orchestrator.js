/**
 * orchestrator.js — المنسق الرئيسي
 * يحترم حدود Gemini: 5 RPM / 20 RPD
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, 'agent-results');
if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

// ── إعدادات ───────────────────────────────────────────────────
const DELAY_BETWEEN_AGENTS = 15000; // 15 ثانية بين كل وكيل (يحترم 5 RPM)
const MAX_RETRIES          = 2;
const TIMEOUT              = 90000; // 90 ثانية

let geminiCallsToday = 0;
const MAX_DAILY_CALLS = 18; // نحتفظ بـ 2 احتياط من 20

// ── مساعدات ───────────────────────────────────────────────────
function saveResult(filename, data) {
  writeFileSync(join(RESULTS_DIR, filename), JSON.stringify(data, null, 2), 'utf8');
  console.log(`   💾 ${filename}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fmt(ms) { return ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`; }

// ── تشغيل وكيل ────────────────────────────────────────────────
async function runAgent(name, agentPath, args = []) {
  console.log(`\n${'─'.repeat(44)}`);
  console.log(`🤖 ${name}`);

  // تحقق من الحد اليومي
  if (geminiCallsToday >= MAX_DAILY_CALLS) {
    console.warn(`   ⚠️ Daily limit reached (${geminiCallsToday}/${MAX_DAILY_CALLS}) — skipping`);
    return { success: false, error: 'Daily limit', skippedByLimit: true };
  }

  // انتظر بين الوكلاء لاحترام 5 RPM
  console.log(`   ⏳ Waiting ${DELAY_BETWEEN_AGENTS/1000}s (rate limit)...`);
  await sleep(DELAY_BETWEEN_AGENTS);

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    if (attempt > 1) {
      console.log(`   🔄 Retry ${attempt-1}/${MAX_RETRIES} (waiting 20s)...`);
      await sleep(20000);
    }

    const t0 = Date.now();
    try {
      const mod    = await import(`${agentPath}?t=${Date.now()}`);
      const result = await Promise.race([
        mod.run(...args),
        new Promise((_,rej) => setTimeout(() => rej(new Error('Timeout')), TIMEOUT))
      ]);
      geminiCallsToday++;
      console.log(`   ✅ ${fmt(Date.now()-t0)} | Gemini calls today: ${geminiCallsToday}`);
      return { success: true, data: result, duration: fmt(Date.now()-t0), attempts: attempt };
    } catch(err) {
      console.error(`   ❌ ${fmt(Date.now()-t0)}: ${err.message}`);
      if (attempt === MAX_RETRIES + 1) {
        return { success: false, error: err.message, duration: fmt(Date.now()-t0), attempts: attempt };
      }
    }
  }
}

// ── وكلاء بدون Gemini (لا يحتاجون انتظار) ────────────────────
async function runAgentNoGemini(name, agentPath, args = []) {
  console.log(`\n${'─'.repeat(44)}`);
  console.log(`🤖 ${name} (no Gemini)`);
  const t0 = Date.now();
  try {
    const mod    = await import(`${agentPath}?t=${Date.now()}`);
    const result = await mod.run(...args);
    console.log(`   ✅ ${fmt(Date.now()-t0)}`);
    return { success: true, data: result, duration: fmt(Date.now()-t0), attempts: 1 };
  } catch(err) {
    console.error(`   ❌ ${err.message}`);
    return { success: false, error: err.message, duration: fmt(Date.now()-t0), attempts: 1 };
  }
}

// ── main ──────────────────────────────────────────────────────
async function main() {
  const t0    = Date.now();
  const runId = new Date().toISOString().replace(/[:.]/g,'').slice(0,15);

  console.log('╔═══════════════════════════════════════════╗');
  console.log('║      🚀  REALTEAM ORCHESTRATOR  🚀        ║');
  console.log('╚═══════════════════════════════════════════╝');
  console.log(`📅 Run: ${runId}`);
  console.log(`⚡ Gemini limit: ${MAX_DAILY_CALLS} calls/day | 5 RPM`);

  const log  = {};
  const data = {};

  // ─── المرحلة ١: توليد محتوى (يحتاج Gemini) ──────────────────
  console.log('\n\n📦 PHASE 1: Content Generation');

  log.idea = await runAgent('Idea Agent', './agents/idea-agent.js', []);
  if (log.idea?.success) { data.idea = log.idea.data; saveResult('ideas.json', data.idea); }

  if (data.idea) {
    log.story = await runAgent('Story Agent', './agents/story-agent.js', [data.idea]);
    if (log.story?.success) { data.story = log.story.data; saveResult('story.json', data.story); }

    log.art = await runAgent('Art Agent', './agents/art-agent.js', [data.idea]);
    if (log.art?.success) { data.art = log.art.data; saveResult('art.json', data.art); }

    log.levels = await runAgent('Level Agent', './agents/level-agent.js', [data.idea, data.story]);
    if (log.levels?.success) { data.levels = log.levels.data; saveResult('levels.json', data.levels); }
  }

  // ─── المرحلة ٢: بناء اللعبة (بدون Gemini) ────────────────────
  console.log('\n\n🏗️  PHASE 2: Build');

  if (data.idea && data.art) {
    log.code = await runAgentNoGemini('Code Agent', './agents/code-agent.js',
      [data.idea, data.story, data.levels, data.art]);
    if (log.code?.success) { data.code = log.code.data; saveResult('code.json', data.code); }
  }

  // ─── المرحلة ٣: تحليل (بدون Gemini) ─────────────────────────
  console.log('\n\n📊 PHASE 3: Analytics (no Gemini)');

  log.analytics = await runAgentNoGemini('Analytics Agent', './agents/analytics-agent.js', []);
  if (log.analytics?.success) { data.analytics = log.analytics.data; saveResult('analytics.json', data.analytics); }

  // ─── المرحلة ٤: تسويق + ملاحظات (يحتاج Gemini) ──────────────
  console.log('\n\n📣 PHASE 4: Marketing & Feedback');

  if (data.idea && geminiCallsToday < MAX_DAILY_CALLS) {
    log.marketing = await runAgent('Marketing Agent', './agents/marketing-agent.js', [data.idea, data.art]);
    if (log.marketing?.success) { data.marketing = log.marketing.data; saveResult('marketing.json', data.marketing); }
  }

  if (geminiCallsToday < MAX_DAILY_CALLS) {
    log.feedback = await runAgent('Feedback Agent', './agents/feedback-agent.js', []);
    if (log.feedback?.success) { data.feedback = log.feedback.data; saveResult('feedback.json', data.feedback); }
  }

  // ─── المرحلة ٥: خارطة الطريق (يحتاج Gemini) ─────────────────
  console.log('\n\n🗺️  PHASE 5: Roadmap');

  if (geminiCallsToday < MAX_DAILY_CALLS) {
    log.roadmap = await runAgent('Roadmap Agent', './agents/roadmap-agent.js',
      [{ analytics: data.analytics, feedback: data.feedback, idea: data.idea, code: data.code }]);
    if (log.roadmap?.success) { data.roadmap = log.roadmap.data; saveResult('roadmap.json', data.roadmap); }
  }

  // ─── تقرير نهائي ─────────────────────────────────────────────
  const report = {
    runId,
    timestamp:     new Date().toISOString(),
    totalDuration: fmt(Date.now()-t0),
    geminiCalls:   geminiCallsToday,
    agents: Object.fromEntries(
      Object.entries(log).map(([k,v]) => [k, {
        success:  v?.success || false,
        duration: v?.duration || '—',
        attempts: v?.attempts || 0,
        error:    v?.error || null,
      }])
    ),
    summary: {
      total:   Object.keys(log).length,
      passed:  Object.values(log).filter(v=>v?.success).length,
      failed:  Object.values(log).filter(v=>!v?.success).length,
      newGame: data.code?.id || null,
    }
  };

  saveResult('run-report.json', report);

  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║                 📊 REPORT                 ║');
  console.log('╠═══════════════════════════════════════════╣');
  Object.entries(log).forEach(([k,v]) => {
    const icon = v?.success ? '✅' : '❌';
    console.log(`║  ${icon} ${k.padEnd(16)} ${(v?.duration||'—').padStart(8)}          ║`);
  });
  console.log('╠═══════════════════════════════════════════╣');
  console.log(`║  ⏱️  ${fmt(Date.now()-t0).padEnd(37)}║`);
  console.log(`║  ✅ ${String(report.summary.passed).padEnd(38)}║`);
  console.log(`║  ❌ ${String(report.summary.failed).padEnd(38)}║`);
  console.log(`║  ⚡ Gemini: ${String(geminiCallsToday+'/'+MAX_DAILY_CALLS).padEnd(31)}║`);
  if (report.summary.newGame) {
    console.log(`║  🎮 ${report.summary.newGame.padEnd(38)}║`);
  }
  console.log('╚═══════════════════════════════════════════╝');
}

main().catch(err => {
  console.error('💥 Crashed:', err.message);
  process.exit(1);
});
