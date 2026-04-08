/**
 * roadmap-agent.js
 * يخطط أولويات الأسبوع القادم بناءً على كل النتائج
 */

const GEMINI_KEY = process.env.GEMINI_API_KEY;

async function gemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
      })
    }
  );
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function run(allResults) {
  const { analytics, feedback, idea, code } = allResults;

  const context = `
الأداء الحالي:
- إجمالي الإيرادات: $${analytics?.totals?.revenueUSD || 0}
- هذا الأسبوع: $${analytics?.thisWeek?.revenueUSD || 0}
- الاتجاه: ${analytics?.trend || 'unknown'}

الملاحظات:
- نقاط الضعف: ${feedback?.weaknesses?.join(', ') || 'none'}
- الأنواع المفقودة: ${feedback?.missingTypes?.join(', ') || 'none'}

هذا الأسبوع:
- اللعبة الجديدة: ${idea?.name?.en || 'none'} (${code?.skipped ? 'skipped' : 'added'})
`;

  const prompt = `
أنت مدير منتج خبير. بناءً على هذه البيانات:
${context}

ضع خطة عمل للأسبوع القادم. أجب بـ JSON فقط:
{
  "weekPriority": "الأولوية الرئيسية هذا الأسبوع",
  "tasks": [
    { "task": "مهمة 1", "priority": "high", "reason": "السبب" },
    { "task": "مهمة 2", "priority": "medium", "reason": "السبب" },
    { "task": "مهمة 3", "priority": "low", "reason": "السبب" }
  ],
  "focusArea": "marketing/content/quality/growth",
  "revenueGoal": "هدف الإيرادات للأسبوع القادم بالدولار",
  "recommendation": "توصية واحدة مهمة للفريق"
}`;

  const raw   = await gemini(prompt);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Invalid roadmap response');

  const roadmap = JSON.parse(match[0]);
  roadmap.createdAt = new Date().toISOString();
  roadmap.basedOn   = {
    trend:       analytics?.trend,
    totalGames:  feedback?.totalGames,
    newGame:     idea?.id,
  };

  console.log(`🗺️ Roadmap:`);
  console.log(`   Priority: ${roadmap.weekPriority}`);
  console.log(`   Focus: ${roadmap.focusArea}`);
  console.log(`   Revenue goal: $${roadmap.revenueGoal}`);
  console.log(`   Recommendation: ${roadmap.recommendation}`);

  return roadmap;
}
