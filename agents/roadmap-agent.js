import { askGemini } from './_gemini.js';
import { logger }    from '../logger.js';

export async function run({ analytics, feedback, idea, code }) {
  const roadmap = await askGemini(`
You are a product manager. Plan next week based on:
- Revenue trend: ${analytics?.trend || 'unknown'}
- Total revenue: $${analytics?.totals?.revenueUSD || 0}
- This week: $${analytics?.thisWeek?.revenueUSD || 0}
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

  roadmap.createdAt = new Date().toISOString();
  logger.info('Roadmap created', { focus: roadmap.focusArea, goal: roadmap.revenueGoal });
  return roadmap;
}
