/**
 * orchestrator.js - المنسق الرئيسي
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, 'agent-results');
if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

function saveResult(filename, data) {
  const path = join(RESULTS_DIR, filename);
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
  console.log(`💾 Saved: agent-results/${filename}`);
}

async function runAgent(name, agentPath, ...args) {
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`🤖 Running: ${name}`);
  try {
    const mod    = await import(agentPath);
    const result = await mod.run(...args);
    console.log(`✅ ${name} completed`);
    return result;
  } catch (err) {
    console.error(`❌ ${name} failed: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('🚀 Orchestrator starting...');
  console.log(`📅 ${new Date().toISOString()}`);

  const results = {};

  // 1. فكرة جديدة
  results.idea = await runAgent('Idea Agent', './agents/idea-agent.js');
  if (results.idea) saveResult('ideas.json', results.idea);

  // 2. قصة
  if (results.idea) {
    results.story = await runAgent('Story Agent', './agents/story-agent.js', results.idea);
    if (results.story) saveResult('story.json', results.story);
  }

  // 3. مستويات
  if (results.idea) {
    results.levels = await runAgent('Level Agent', './agents/level-agent.js', results.idea, results.story);
    if (results.levels) saveResult('levels.json', results.levels);
  }

  // 4. فن بصري
  if (results.idea) {
    results.art = await runAgent('Art Agent', './agents/art-agent.js', results.idea);
    if (results.art) saveResult('art.json', results.art);
  }

  // 5. كود + products.json
  if (results.idea && results.art) {
    results.code = await runAgent('Code Agent', './agents/code-agent.js', results.idea, results.story, results.levels, results.art);
    if (results.code) saveResult('code.json', results.code);
  }

  // 6. تسويق
  if (results.idea) {
    results.marketing = await runAgent('Marketing Agent', './agents/marketing-agent.js', results.idea, results.art);
    if (results.marketing) saveResult('marketing.json', results.marketing);
  }

  // 7. تحليلات
  results.analytics = await runAgent('Analytics Agent', './agents/analytics-agent.js');
  if (results.analytics) saveResult('analytics.json', results.analytics);

  // 8. ملاحظات
  results.feedback = await runAgent('Feedback Agent', './agents/feedback-agent.js');
  if (results.feedback) saveResult('feedback.json', results.feedback);

  // 9. خارطة طريق
  results.roadmap = await runAgent('Roadmap Agent', './agents/roadmap-agent.js', results);
  if (results.roadmap) saveResult('roadmap.json', results.roadmap);

  // ── ملخص ─────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(40));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(40));
  Object.entries(results).forEach(([k, v]) => {
    console.log(`${v ? '✅' : '❌'} ${k}`);
  });

  const failed = Object.values(results).filter(v => !v).length;
  console.log(`\n${failed === 0 ? '🎉 All done!' : `⚠️ ${failed} failed`}`);
}

main().catch(err => {
  console.error('💥 Orchestrator crashed:', err.message);
  process.exit(1);
});
