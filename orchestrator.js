/**
 * orchestrator.js — المنسق الرئيسي المتطور
 * يشغّل كل الوكلاء بالترتيب مع:
 * - إعادة المحاولة عند الفشل
 * - توقيت دقيق لكل وكيل
 * - تقرير مفصّل في النهاية
 * - حفظ حالة التشغيل
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, 'agent-results');

if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

// ── إعدادات ───────────────────────────────────────────────────
const CONFIG = {
  maxRetries:  2,       // عدد إعادة المحاولات عند الفشل
  retryDelay:  3000,    // انتظار 3 ثوانٍ بين المحاولات
  timeout:     60000,   // 60 ثانية كحد أقصى لكل وكيل
};

// ── مساعدات ───────────────────────────────────────────────────
function saveResult(filename, data) {
  const path = join(RESULTS_DIR, filename);
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
  console.log(`   💾 Saved → agent-results/${filename}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── تشغيل وكيل مع إعادة المحاولة والـ timeout ────────────────
async function runAgent(name, agentPath, args = [], options = {}) {
  const { retries = CONFIG.maxRetries, required = false } = options;
  const sep = '─'.repeat(44);

  console.log(`\n${sep}`);
  console.log(`🤖  ${name}`);
  console.log(sep);

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    if (attempt > 1) {
      console.log(`   🔄 Retry ${attempt - 1}/${retries}...`);
      await sleep(CONFIG.retryDelay);
    }

    const startTime = Date.now();

    try {
      // timeout wrapper
      const mod    = await import(agentPath + `?t=${Date.now()}`);
      const result = await Promise.race([
        mod.run(...args),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout after ' + CONFIG.timeout/1000 + 's')), CONFIG.timeout)
        )
      ]);

      const duration = Date.now() - startTime;
      console.log(`   ✅ Done in ${formatDuration(duration)}`);
      return { success: true, data: result, duration, attempts: attempt };

    } catch (err) {
      const duration = Date.now() - startTime;
      console.error(`   ❌ Failed (${formatDuration(duration)}): ${err.message}`);

      if (attempt === retries + 1) {
        if (required) {
          console.error(`   🚨 CRITICAL: ${name} is required — aborting`);
          process.exit(1);
        }
        return { success: false, error: err.message, duration, attempts: attempt };
      }
    }
  }
}

// ── main ──────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();
  const runId     = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  console.log('╔══════════════════════════════════════════╗');
  console.log('║     🚀  REALTEAM ORCHESTRATOR  🚀        ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`📅 Run ID: ${runId}`);
  console.log(`🔧 Config: ${CONFIG.maxRetries} retries, ${CONFIG.timeout/1000}s timeout\n`);

  const log = {};   // سجل كل الوكلاء
  const data = {};  // بيانات للتمرير بين الوكلاء

  // ─────────────────────────────────────────────────────────────
  // المرحلة ١: توليد المحتوى
  // ─────────────────────────────────────────────────────────────
  console.log('\n📦  PHASE 1: Content Generation');

  log.idea = await runAgent(
    'Idea Agent — توليد فكرة جديدة',
    './agents/idea-agent.js',
    [], { required: false }
  );
  if (log.idea.success) {
    data.idea = log.idea.data;
    saveResult('ideas.json', data.idea);
    console.log(`   💡 Idea: "${data.idea.name?.en}" (${data.idea.type})`);
  }

  if (data.idea) {
    log.story = await runAgent(
      'Story Agent — كتابة القصة',
      './agents/story-agent.js',
      [data.idea]
    );
    if (log.story.success) {
      data.story = log.story.data;
      saveResult('story.json', data.story);
      console.log(`   📖 Story: "${data.story.mainCharacter?.name}"`);
    }

    log.levels = await runAgent(
      'Level Agent — تصميم المستويات',
      './agents/level-agent.js',
      [data.idea, data.story]
    );
    if (log.levels.success) {
      data.levels = log.levels.data;
      saveResult('levels.json', data.levels);
      console.log(`   🎯 Levels: ${data.levels.totalLevels} levels`);
    }

    log.art = await runAgent(
      'Art Agent — الهوية البصرية',
      './agents/art-agent.js',
      [data.idea]
    );
    if (log.art.success) {
      data.art = log.art.data;
      saveResult('art.json', data.art);
      console.log(`   🎨 Art: ${data.art.mood} / ${data.art.accent}`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // المرحلة ٢: بناء اللعبة
  // ─────────────────────────────────────────────────────────────
  console.log('\n🏗️   PHASE 2: Game Building');

  if (data.idea && data.art) {
    log.code = await runAgent(
      'Code Agent — بناء اللعبة',
      './agents/code-agent.js',
      [data.idea, data.story, data.levels, data.art]
    );
    if (log.code.success) {
      data.code = log.code.data;
      saveResult('code.json', data.code);
      if (data.code.skipped) {
        console.log(`   ⏭️  Skipped (already exists)`);
      } else {
        console.log(`   🎮 Built: ${data.code.id}`);
      }
    }
  } else {
    console.log('   ⏭️  Skipped — no idea or art generated');
  }

  // ─────────────────────────────────────────────────────────────
  // المرحلة ٣: التسويق
  // ─────────────────────────────────────────────────────────────
  console.log('\n📣  PHASE 3: Marketing');

  if (data.idea) {
    log.marketing = await runAgent(
      'Marketing Agent — محتوى التسويق',
      './agents/marketing-agent.js',
      [data.idea, data.art]
    );
    if (log.marketing.success) {
      data.marketing = log.marketing.data;
      saveResult('marketing.json', data.marketing);
      console.log(`   📝 Posts ready for all platforms`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // المرحلة ٤: التحليل والتخطيط
  // ─────────────────────────────────────────────────────────────
  console.log('\n📊  PHASE 4: Analysis & Planning');

  log.analytics = await runAgent(
    'Analytics Agent — تحليل الأداء',
    './agents/analytics-agent.js',
    []
  );
  if (log.analytics.success) {
    data.analytics = log.analytics.data;
    saveResult('analytics.json', data.analytics);
    console.log(`   💰 Revenue: $${data.analytics.totals?.revenueUSD || 0} total`);
    console.log(`   📈 Trend: ${data.analytics.trend}`);
  }

  log.feedback = await runAgent(
    'Feedback Agent — تقييم المحتوى',
    './agents/feedback-agent.js',
    []
  );
  if (log.feedback.success) {
    data.feedback = log.feedback.data;
    saveResult('feedback.json', data.feedback);
    console.log(`   💬 ${data.feedback.suggestions?.length || 0} suggestions`);
  }

  log.roadmap = await runAgent(
    'Roadmap Agent — خارطة الأسبوع',
    './agents/roadmap-agent.js',
    [{ analytics: data.analytics, feedback: data.feedback, idea: data.idea, code: data.code }]
  );
  if (log.roadmap.success) {
    data.roadmap = log.roadmap.data;
    saveResult('roadmap.json', data.roadmap);
    console.log(`   🗺️  Focus: ${data.roadmap.focusArea}`);
    console.log(`   🎯 Goal: $${data.roadmap.revenueGoal}`);
  }

  // ─────────────────────────────────────────────────────────────
  // تقرير نهائي
  // ─────────────────────────────────────────────────────────────
  const totalDuration = Date.now() - startTime;

  const report = {
    runId,
    timestamp:     new Date().toISOString(),
    totalDuration: formatDuration(totalDuration),
    agents: Object.fromEntries(
      Object.entries(log).map(([k, v]) => [k, {
        success:  v.success,
        duration: formatDuration(v.duration),
        attempts: v.attempts,
        error:    v.error || null,
      }])
    ),
    summary: {
      total:   Object.keys(log).length,
      passed:  Object.values(log).filter(v => v.success).length,
      failed:  Object.values(log).filter(v => !v.success).length,
      newGame: data.code?.id || null,
    }
  };

  saveResult('run-report.json', report);

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║              📊  REPORT                  ║');
  console.log('╠══════════════════════════════════════════╣');
  Object.entries(log).forEach(([k, v]) => {
    const icon = v.success ? '✅' : '❌';
    const time = formatDuration(v.duration);
    console.log(`║  ${icon} ${k.padEnd(18)} ${time.padStart(8)}         ║`);
  });
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  ⏱️  Total: ${formatDuration(totalDuration).padEnd(30)} ║`);
  console.log(`║  ✅ Passed: ${String(report.summary.passed).padEnd(29)} ║`);
  console.log(`║  ❌ Failed: ${String(report.summary.failed).padEnd(29)} ║`);
  if (report.summary.newGame) {
    console.log(`║  🎮 New game: ${report.summary.newGame.padEnd(27)} ║`);
  }
  console.log('╚══════════════════════════════════════════╝');

  if (report.summary.failed > 0) {
    console.warn(`\n⚠️  ${report.summary.failed} agent(s) failed — check logs above`);
  } else {
    console.log('\n🎉 All agents completed successfully!');
  }
}

main().catch(err => {
  console.error('\n💥 Orchestrator crashed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
