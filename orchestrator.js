/**
 * orchestrator.js
 * المنسق الرئيسي — يشغّل الوكلاء بالترتيب الصحيح
 * node orchestrator.js
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// تأكد من وجود مجلد النتائج
const RESULTS_DIR = join(__dirname, 'agent-results');
if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

// ── استيراد الوكلاء ───────────────────────────────────────────
import { run as runIdea }      from './agents/idea-agent.js';
import { run as runStory }     from './agents/story-agent.js';
import { run as runLevel }     from './agents/level-agent.js';
import { run as runArt }       from './agents/art-agent.js';
import { run as runCode }      from './agents/code-agent.js';
import { run as runMarketing } from './agents/marketing-agent.js';
import { run as runAnalytics } from './agents/analytics-agent.js';
import { run as runFeedback }  from './agents/feedback-agent.js';
import { run as runRoadmap }   from './agents/roadmap-agent.js';

// ── تشغيل وكيل مع معالجة الأخطاء ────────────────────────────
async function runAgent(name, fn) {
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`🤖 Running: ${name}`);
  console.log('─'.repeat(40));
  try {
    const result = await fn();
    console.log(`✅ ${name} completed`);
    return result;
  } catch (err) {
    console.error(`❌ ${name} failed:`, err.message);
    return null;
  }
}

// ── حفظ نتيجة وكيل ───────────────────────────────────────────
function saveResult(filename, data) {
  const path = join(RESULTS_DIR, filename);
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
  console.log(`💾 Saved: agent-results/${filename}`);
}

// ── main ──────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Orchestrator starting...');
  console.log(`📅 ${new Date().toISOString()}`);

  const results = {};

  // 1. توليد فكرة جديدة
  results.idea = await runAgent('Idea Agent', runIdea);
  if (results.idea) saveResult('ideas.json', results.idea);

  // 2. كتابة القصة (يعتمد على الفكرة)
  if (results.idea) {
    results.story = await runAgent('Story Agent', () => runStory(results.idea));
    if (results.story) saveResult('story.json', results.story);
  }

  // 3. تصميم المستويات (يعتمد على القصة)
  if (results.story) {
    results.levels = await runAgent('Level Agent', () => runLevel(results.idea, results.story));
    if (results.levels) saveResult('levels.json', results.levels);
  }

  // 4. توليد العناصر البصرية (يعتمد على الفكرة)
  if (results.idea) {
    results.art = await runAgent('Art Agent', () => runArt(results.idea));
    if (results.art) saveResult('art.json', results.art);
  }

  // 5. توليد كود اللعبة وتحديث products.json (يجمع كل المخرجات)
  if (results.idea && results.art) {
    results.code = await runAgent('Code Agent', () => runCode(results.idea, results.story, results.levels, results.art));
    if (results.code) saveResult('code.json', results.code);
  }

  // 6. توليد محتوى التسويق
  if (results.idea) {
    results.marketing = await runAgent('Marketing Agent', () => runMarketing(results.idea, results.art));
    if (results.marketing) saveResult('marketing.json', results.marketing);
  }

  // 7. تحليل الأداء (مستقل)
  results.analytics = await runAgent('Analytics Agent', runAnalytics);
  if (results.analytics) saveResult('analytics.json', results.analytics);

  // 8. معالجة الملاحظات (مستقل)
  results.feedback = await runAgent('Feedback Agent', runFeedback);
  if (results.feedback) saveResult('feedback.json', results.feedback);

  // 9. تخطيط الخارطة (يعتمد على كل النتائج)
  results.roadmap = await runAgent('Roadmap Agent', () => runRoadmap(results));
  if (results.roadmap) saveResult('roadmap.json', results.roadmap);

  // ── ملخص نهائي ───────────────────────────────────────────
  console.log('\n' + '═'.repeat(40));
  console.log('📊 ORCHESTRATOR SUMMARY');
  console.log('═'.repeat(40));
  Object.entries(results).forEach(([k, v]) => {
    console.log(`${v ? '✅' : '❌'} ${k}`);
  });
  console.log('═'.repeat(40));

  const failed = Object.values(results).filter(v => !v).length;
  if (failed > 0) {
    console.warn(`⚠️ ${failed} agent(s) failed — check logs above`);
  } else {
    console.log('🎉 All agents completed successfully!');
  }
}

main().catch(err => {
  console.error('💥 Orchestrator crashed:', err);
  process.exit(1);
});
