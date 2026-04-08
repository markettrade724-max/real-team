/**
 * analytics-agent.js
 * يحلل أداء المشروع من بيانات Supabase
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function run() {
  const { data: earnings, error } = await supabase
    .from('earnings')
    .select('*')
    .order('date', { ascending: false });

  if (error) throw new Error('Supabase error: ' + error.message);

  const now     = new Date();
  const week    = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const month   = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const thisWeek  = earnings.filter(e => new Date(e.date) > week);
  const thisMonth = earnings.filter(e => new Date(e.date) > month);

  // إيرادات
  const totalUSD      = earnings.reduce((s,e) => s + (e.currency==='USD' ? +e.amount : 0), 0);
  const weekUSD       = thisWeek.reduce((s,e)  => s + (e.currency==='USD' ? +e.amount : 0), 0);
  const monthUSD      = thisMonth.reduce((s,e) => s + (e.currency==='USD' ? +e.amount : 0), 0);

  // المنصات
  const byPlatform = {};
  earnings.forEach(e => { byPlatform[e.platform] = (byPlatform[e.platform]||0) + 1; });

  // IAP
  const byIap = {};
  earnings.filter(e=>e.iap_id).forEach(e => { byIap[e.iap_id] = (byIap[e.iap_id]||0) + 1; });
  const topIap = Object.entries(byIap).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'none';

  const report = {
    generatedAt:  now.toISOString(),
    totals: {
      transactions: earnings.length,
      revenueUSD:   +totalUSD.toFixed(2),
    },
    thisWeek: {
      transactions: thisWeek.length,
      revenueUSD:   +weekUSD.toFixed(2),
    },
    thisMonth: {
      transactions: thisMonth.length,
      revenueUSD:   +monthUSD.toFixed(2),
    },
    byPlatform,
    topIap,
    trend: weekUSD > (monthUSD / 4) ? 'growing' : weekUSD > 0 ? 'stable' : 'slow',
  };

  console.log(`📊 Analytics Report:`);
  console.log(`   Total: $${report.totals.revenueUSD} (${report.totals.transactions} transactions)`);
  console.log(`   This week: $${report.weeklyRevenue || report.thisWeek.revenueUSD}`);
  console.log(`   Trend: ${report.trend}`);
  console.log(`   Top IAP: ${report.topIap}`);

  return report;
}
