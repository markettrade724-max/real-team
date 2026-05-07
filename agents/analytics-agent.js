import { createClient } from '@supabase/supabase-js';
import { logger }       from '../logger.js';

export async function run() {
  // التحقق من وجود مفاتيح Supabase
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    logger.warn('Supabase credentials missing — returning empty analytics');
    return emptyReport('missing_credentials');
  }

  let earnings;
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase
      .from('earnings').select('*').order('date', { ascending: false });

    if (error) throw new Error('Supabase: ' + error.message);
    earnings = data || [];
  } catch (err) {
    logger.error('Analytics fetch failed', err.message);
    return emptyReport('fetch_failed');
  }

  const now   = Date.now();
  const week  = new Date(now - 7  * 864e5);
  const month = new Date(now - 30 * 864e5);

  const thisWeek  = earnings.filter(e => new Date(e.date) > week);
  const thisMonth = earnings.filter(e => new Date(e.date) > month);

  const total = earnings.reduce((s, e) => s + (e.currency === 'USD' ? +e.amount : 0), 0);
  const wUSD  = thisWeek.reduce((s, e)  => s + (e.currency === 'USD' ? +e.amount : 0), 0);
  const mUSD  = thisMonth.reduce((s, e) => s + (e.currency === 'USD' ? +e.amount : 0), 0);

  const byPlatform = {};
  earnings.forEach(e => { byPlatform[e.platform] = (byPlatform[e.platform] || 0) + 1; });

  const byIap = {};
  earnings.filter(e => e.iap_id).forEach(e => { byIap[e.iap_id] = (byIap[e.iap_id] || 0) + 1; });
  const topIap = Object.entries(byIap).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none';

  const report = {
    generatedAt: new Date().toISOString(),
    totals:    { transactions: earnings.length, revenueUSD: +total.toFixed(2) },
    thisWeek:  { transactions: thisWeek.length,  revenueUSD: +wUSD.toFixed(2) },
    thisMonth: { transactions: thisMonth.length, revenueUSD: +mUSD.toFixed(2) },
    byPlatform, topIap,
    trend: wUSD > (mUSD / 4) ? 'growing' : wUSD > 0 ? 'stable' : 'slow',
  };

  logger.info('Analytics done', { total: report.totals.revenueUSD, trend: report.trend });
  return report;
}

// تقرير فارغ آمن في حالة الفشل
function emptyReport(reason) {
  return {
    generatedAt: new Date().toISOString(),
    totals:    { transactions: 0, revenueUSD: 0 },
    thisWeek:  { transactions: 0, revenueUSD: 0 },
    thisMonth: { transactions: 0, revenueUSD: 0 },
    byPlatform: {},
    topIap: 'none',
    trend: 'unknown',
    error: reason,
  };
}
