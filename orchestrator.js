/**
 * orchestrator.js - المنسق الرئيسي المحسن
 * يضمن تدفق البيانات بين الوكلاء ومعالجة الأخطاء بمرونة
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, 'agent-results');

// إنشاء مجلد النتائج إذا لم يكن موجوداً
if (!existsSync(RESULTS_DIR)) {
  mkdirSync(RESULTS_DIR, { recursive: true });
}

/**
 * دالة لحفظ نتائج كل وكيل في ملف منفصل
 */
function saveResult(filename, data) {
  if (!data) return;
  const path = join(RESULTS_DIR, filename);
  try {
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
    console.log(`💾 Saved: agent-results/${filename}`);
  } catch (err) {
    console.error(`⚠️ Failed to save ${filename}:`, err.message);
  }
}

/**
 * دالة تشغيل الوكيل مع معالجة الأخطاء
 */
async function runAgent(name, agentPath, ...args) {
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`🤖 Running: ${name}`);
  
  try {
    const mod = await import(agentPath);
    
    // التأكد من أن الموديول يحتوي على دالة run
    if (typeof mod.run !== 'function') {
      throw new Error(`Agent "${name}" does not export a run() function.`);
    }

    const result = await mod.run(...args);
    
    if (!result) {
      throw new Error(`Agent "${name}" returned no data (null/undefined).`);
    }

    console.log(`✅ ${name} completed successfully`);
    return result;
  } catch (err) {
    console.error(`❌ ${name} failed: ${err.message}`);
    // طباعة تفاصيل الخطأ (Stack Trace) للمساعدة في حل المشكلة في الـ Logs
    if (err.stack) {
      const shortStack = err.stack.split('\n').slice(0, 3).join('\n');
      console.error(shortStack);
    }
    return null;
  }
}

async function main() {
  console.log('🚀 Orchestrator starting...');
  console.log(`📅 ${new Date().toISOString()}`);

  const results = {};

  // 1. الوكيل الأساسي: Idea Agent
  // ملاحظة: إذا فشل هذا الوكيل، معظم الوكلاء الآخرين سيتوقفون لأنهم يعتمدون عليه
  results.idea = await runAgent('Idea Agent', './agents/idea-agent.js');
  if (results.idea) saveResult('ideas.json', results.idea);

  // 2. Story Agent (يعتمد على الفكرة)
  if (results.idea) {
    results.story = await runAgent('Story Agent', './agents/story-agent.js', results.idea);
    if (results.story) saveResult('story.json', results.story);
  }

  // 3. Level Agent (يعتمد على الفكرة والقصة)
  if (results.idea) {
    results.levels = await runAgent('Level Agent', './agents/level-agent.js', results.idea, results.story);
    if (results.levels) saveResult('levels.json', results.levels);
  }

  // 4. Art Agent (يعتمد على الفكرة)
  if (results.idea) {
    results.art = await runAgent('Art Agent', './agents/art-agent.js', results.idea);
    if (results.art) saveResult('art.json', results.art);
  }

  // 5. Code Agent (يعتمد على الفكرة، القصة، المستويات، والفن)
  if (results.idea && results.art) {
    results.code = await runAgent('Code Agent', './agents/code-agent.js', results.idea, results.story, results.levels, results.art);
    if (results.code) saveResult('code.json', results.code);
  }

  // 6. Marketing Agent (يعتمد على الفكرة والفن)
  if (results.idea) {
    results.marketing = await runAgent('Marketing Agent', './agents/marketing-agent.js', results.idea, results.art);
    if (results.marketing) saveResult('marketing.json', results.marketing);
  }

  // 7. Analytics Agent (مستقل - يعمل حتى لو فشل الـ Idea Agent)
  results.analytics = await runAgent('Analytics Agent', './agents/analytics-agent.js');
  if (results.analytics) saveResult('analytics.json', results.analytics);

  // 8. Feedback Agent (مستقل)
  results.feedback = await runAgent('Feedback Agent', './agents/feedback-agent.js');
  if (results.feedback) saveResult('feedback.json', results.feedback);

  // 9. Roadmap Agent (يعتمد على جميع النتائج السابقة)
  results.roadmap = await runAgent('Roadmap Agent', './agents/roadmap-agent.js', results);
  if (results.roadmap) saveResult('roadmap.json', results.roadmap);

  // ── الملخص النهائي لنتائج التشغيل ──────────────────────────
  console.log('\n' + '═'.repeat(40));
  console.log('📊 SUMMARY REPORT');
  console.log('═'.repeat(40));
  
  Object.keys(results).forEach(key => {
    const status = results[key] ? '✅ SUCCESS' : '❌ FAILED';
    console.log(`${key.padEnd(12)} : ${status}`);
  });

  const failedCount = Object.values(results).filter(v => !v).length;
  console.log('\n' + '═'.repeat(40));
  
  if (failedCount === 0) {
    console.log('🎉 Mission accomplished! All agents reported back.');
  } else {
    console.log(`⚠️ Process finished with ${failedCount} failure(s). Check logs above.`);
    // لا نخرج بـ exit(1) هنا إذا كان هناك نتائج جزئية نريد حفظها، 
    // ولكن إذا كنت تريد لـ GitHub Actions أن تظهر باللون الأحمر عند أي فشل، فكّر في تفعيل السطر التالي:
    // process.exit(1);
  }
}

main().catch(err => {
  console.error('💥 Critical Orchestrator Crash:', err.message);
  process.exit(1);
});
