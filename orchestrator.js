import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, 'agent-results');
if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

// دالة الانتظار لتجنب تجاوز حد 15 طلب في الدقيقة (RPM)
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runAgent(name, agentPath, ...args) {
  console.log(`\n🤖 Running: ${name}...`);
  try {
    const mod = await import(agentPath);
    const result = await mod.run(...args);
    if (!result) throw new Error(`${name} returned no data`);
    return result;
  } catch (err) {
    console.error(`❌ ${name} failed: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('🚀 Starting Orchestrator (Optimized for Gemini 2.5 RPM)');
  const results = {};

  // 1. توليد الفكرة
  results.idea = await runAgent('Idea Agent', './agents/idea-agent.js');
  
  // ننتظر 4 ثوانٍ بين كل طلب والآخر لضمان عدم تجاوز الـ 15 طلب في الدقيقة
  await wait(4000); 

  if (results.idea) {
    // 2. تشغيل القصة
    results.story = await runAgent('Story Agent', './agents/story-agent.js', results.idea);
    await wait(4000);

    // 3. تشغيل الفن
    results.art = await runAgent('Art Agent', './agents/art-agent.js', results.idea);
    await wait(4000);
  }

  // 4. تشغيل التحليلات (مستقلة)
  results.analytics = await runAgent('Analytics Agent', './agents/analytics-agent.js');
  await wait(4000);

  // حفظ النتائج
  Object.entries(results).forEach(([key, value]) => {
    if (value) writeFileSync(join(RESULTS_DIR, `${key}.json`), JSON.stringify(value, null, 2));
  });

  console.log('\n✅ Cycle finished. Summary: ' + 
    Object.keys(results).map(k => `${k}:${results[k]?'OK':'FAIL'}`).join(' | ')
  );
}

main().catch(console.error);
