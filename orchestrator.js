/**
 * orchestrator.js - المنسق المطور
 * متوافق مع تدفق بيانات Gemini 2.0 Flash
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, 'agent-results');
if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

function saveResult(filename, data) {
  if (!data) return;
  const path = join(RESULTS_DIR, filename);
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
  console.log(`💾 Saved to disk: agent-results/${filename}`);
}

async function runAgent(name, agentPath, ...args) {
  console.log(`\n${'─'.repeat(45)}`);
  console.log(`🤖 Running [${name}]...`);
  try {
    const mod = await import(agentPath);
    const result = await mod.run(...args);
    
    if (!result) throw new Error(`${name} returned null/empty data`);
    
    console.log(`✅ ${name} completed successfully.`);
    return result;
  } catch (err) {
    // تعديل هام: طباعة تفاصيل الخطأ بدقة للمساعدة في الإصلاح
    console.error(`❌ ${name} failed: ${err.message}`);
    return null; 
  }
}

async function main() {
  console.log('🚀 Team Orchestrator Started (Gemini 2.0 Mode)');
  console.log(`⏰ Time: ${new Date().toISOString()}`);

  const results = {};

  // 1. توليد الفكرة (حجر الزاوية)
  // تم تحديث هذا الوكيل ليعمل بـ Gemini 2.0 Flash
  results.idea = await runAgent('Idea Agent', './agents/idea-agent.js');
  if (results.idea) saveResult('ideas.json', results.idea);

  // 2. تشغيل وكلاء المحتوى (تعتمد على الفكرة)
  if (results.idea) {
    // نمرر نتائج الفكرة للوكلاء التاليين
    results.story = await runAgent('Story Agent', './agents/story-agent.js', results.idea);
    results.art   = await runAgent('Art Agent', './agents/art-agent.js', results.idea);
    
    if (results.story) saveResult('story.json', results.story);
    if (results.art)   saveResult('art.json', results.art);
  }

  // 3. وكلاء الأنظمة المستقلة (تعمل حتى لو فشلت الفكرة)
  results.analytics = await runAgent('Analytics Agent', './agents/analytics-agent.js');
  results.feedback  = await runAgent('Feedback Agent', './agents/feedback-agent.js');

  if (results.analytics) saveResult('analytics.json', results.analytics);
  if (results.feedback)  saveResult('feedback.json', results.feedback);

  // 4. وكيل خارطة الطريق (يجمع كل ما سبق)
  results.roadmap = await runAgent('Roadmap Agent', './agents/roadmap-agent.js', results);
  if (results.roadmap) saveResult('roadmap.json', results.roadmap);

  // --- تقرير الحالة النهائي ---
  console.log('\n' + '═'.repeat(45));
  console.log('🏁 FINAL STATUS REPORT');
  console.log('═'.repeat(45));
  
  const statusSummary = Object.entries(results).map(([agent, data]) => {
    return `${data ? '✅' : '❌'} ${agent.padEnd(12)}`;
  }).join('\n');
  
  console.log(statusSummary);
  
  const failed = Object.values(results).filter(v => !v).length;
  if (failed > 0) {
    console.warn(`\n⚠️ Finished with ${failed} issues. Check logs above.`);
    // في GitHub Actions، قد ترغب في الخروج بـ 1 ليعطيك تنبيه أحمر
    // process.exit(1); 
  } else {
    console.log('\n🎉 All agents successfully coordinated!');
  }
}

main().catch(err => {
  console.error('💥 Critical System Failure:', err.message);
  process.exit(1);
});
