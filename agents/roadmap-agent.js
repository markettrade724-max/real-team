import { askGemini } from './_gemini.js';
import { logger }    from '../logger.js';

function fallbackRoadmap(reason) {
  return {
    weekPriority: 'Improve quality and user retention',
    tasks: [
      { task:'Fix reported bugs and improve performance', priority:'high', reason:reason },
      { task:'Add new engaging content', priority:'medium', reason:reason },
      { task:'Review analytics for growth opportunities', priority:'low', reason:reason },
    ],
    focusArea: 'quality',
    revenueGoal: 'grow steadily',
    recommendation: 'Focus on fixing issues and adding value',
    createdAt: new Date().toISOString(),
  };
}

export async function run({ analytics, feedback, idea, code }) {
  logger.info('Generating roadmap');

  let roadmap;
  try {
    roadmap = await askGemini(`
You are a product manager. Plan next week based on:
- Revenue trend: ${analytics?.trend || 'unknown'}
- Total revenue: $${analytics?.totals?.revenueUSD ?? 0}
- This week: $${analytics?.thisWeek?.revenueUSD ?? 0}
- Weaknesses: ${feedback?.weaknesses?.join(', ') || 'none'}
- Missing types: ${feedback?.missingTypes?.join(', ') || 'none'}
- New game this week: ${idea?.name?.en || 'none'} (${code?.skipped ? 'skipped' : 'added'})

Return ONLY valid JSON:
{
  "weekPriority": "main priority",
  "tasks": [
    { "task": "", "priority": "high", "reason": "" },
    { "task": "", "priority": "medium", "reason": "" },
    { "task": "", "priority": "low", "reason": "" }
  ],
  "focusArea":      "marketing/content/quality/growth",
  "revenueGoal":    "weekly goal in USD",
  "recommendation": "one key recommendation"
}`, 0.7);
  } catch (err) {
    logger.error('Roadmap generation failed, using fallback', { error: err.message });
    return fallbackRoadmap(err.message);
  }

  // التحقق من صحة المخرجات
  if (!roadmap || typeof roadmap !== 'object') {
    logger.warn('Invalid roadmap object from Gemini, using fallback');
    return fallbackRoadmap('Invalid response');
  }

  // التأكد من وجود الحقول الأساسية
  if (!roadmap.weekPriority) roadmap.weekPriority = 'Continue improving';
  if (!Array.isArray(roadmap.tasks) || roadmap.tasks.length === 0) {
    roadmap.tasks = [
      { task:'Review performance metrics', priority:'high', reason:'Ensure stability' },
      { task:'Plan next features', priority:'medium', reason:'Keep momentum' },
      { task:'Engage with users', priority:'low', reason:'Build community' },
    ];
  }

  roadmap.createdAt = new Date().toISOString();

  logger.info('Roadmap created', { focus: roadmap.focusArea, goal: roadmap.revenueGoal });
  return roadmap;
}
