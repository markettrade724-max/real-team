/**
 * analytics-agent.js — v2.0
 * يقرأ إحصائيات يوتيوب + تيك توك
 * يستخلص ما يحبه الجمهور
 * يغذي story-agent و content-agent بتوجيهات ذكية
 * بدون Gemini — منطق محلي + مكتبة
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readForAgent }  from './library-builder-agent.js';
import { logger }        from '../logger.js';

const __dirname      = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR    = join(__dirname, '..', 'agent-results');
const ANALYTICS_PATH = join(RESULTS_DIR, 'analytics.json');
const INSIGHTS_PATH  = join(RESULTS_DIR, 'audience-insights.json');

export async function run(series = null) {
  logger.info('[ANALYTICS] Starting audience analysis');

  mkdirSync(RESULTS_DIR, { recursive: true });

  const results = {
    youtube: null,
    tiktok:  null,
    insights: null,
    recommendations: null,
  };

  // ── جمع البيانات ─────────────────────
  if (process.env.YOUTUBE_REFRESH_TOKEN) {
    results.youtube = await fetchYoutubeAnalytics();
  }
  if (process.env.TIKTOK_ACCESS_TOKEN) {
    results.tiktok = await fetchTiktokAnalytics();
  }

  // ── استخلاص الرؤى ────────────────────
  results.insights      = extractInsights(results.youtube, results.tiktok, series);
  results.recommendations = buildRecommendations(results.insights);

  // ── حفظ ──────────────────────────────
  writeFileSync(ANALYTICS_PATH, JSON.stringify(results, null, 2), 'utf8');
  writeFileSync(INSIGHTS_PATH,  JSON.stringify({
    insights:        results.insights,
    recommendations: results.recommendations,
    updatedAt:       new Date().toISOString(),
  }, null, 2), 'utf8');

  logger.info('[OK] Analytics done', {
    topEmotion:  results.insights?.topEmotion,
    bestTime:    results.insights?.bestPostTime,
    avgRetention: results.insights?.avgRetention,
  });

  return results;
}

// ════════════════════════════════════════════
// يوتيوب Analytics API
// ════════════════════════════════════════════
async function fetchYoutubeAnalytics() {
  logger.info('[ANALYTICS] Fetching YouTube data...');
  try {
    const token = await refreshYoutubeToken();

    // إحصائيات القناة
    const channelRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const channelData = await channelRes.json();
    const stats = channelData.items?.[0]?.statistics || {};

    // آخر 10 فيديوهات
    const videosRes = await fetch(
      'https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&maxResults=10&type=video&order=date',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const videosData = await videosRes.json();
    const videoIds   = videosData.items?.map(v => v.id.videoId).join(',') || '';

    // إحصائيات تفصيلية للفيديوهات
    let videoStats = [];
    if (videoIds) {
      const detailRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${videoIds}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const detailData = await detailRes.json();
      videoStats = detailData.items?.map(v => ({
        id:          v.id,
        views:       parseInt(v.statistics.viewCount || 0),
        likes:       parseInt(v.statistics.likeCount || 0),
        comments:    parseInt(v.statistics.commentCount || 0),
        duration:    v.contentDetails.duration,
      })) || [];
    }

    // Analytics Report — مشاهدة + retention
    const endDate   = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const reportRes = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?` +
      `ids=channel==MINE&startDate=${startDate}&endDate=${endDate}` +
      `&metrics=views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage` +
      `&dimensions=day&sort=day`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const reportData = await reportRes.json();

    return {
      channel:    stats,
      videos:     videoStats,
      report:     reportData.rows || [],
      fetchedAt:  new Date().toISOString(),
    };

  } catch (err) {
    logger.error('[ANALYTICS] YouTube failed', { error: err.message });
    return null;
  }
}

// ════════════════════════════════════════════
// تيك توك Analytics API
// ════════════════════════════════════════════
async function fetchTiktokAnalytics() {
  logger.info('[ANALYTICS] Fetching TikTok data...');
  try {
    // إحصائيات الحساب
    const accountRes = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=follower_count,following_count,video_count',
      { headers: { Authorization: `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}` } }
    );
    const accountData = await accountRes.json();

    // آخر الفيديوهات
    const videosRes = await fetch(
      'https://open.tiktokapis.com/v2/video/list/?fields=id,title,view_count,like_count,comment_count,share_count,play_url',
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ max_count: 20 }),
      }
    );
    const videosData = await videosRes.json();

    return {
      account: accountData.data?.user || {},
      videos:  videosData.data?.videos || [],
      fetchedAt: new Date().toISOString(),
    };

  } catch (err) {
    logger.error('[ANALYTICS] TikTok failed', { error: err.message });
    return null;
  }
}

// ════════════════════════════════════════════
// استخلاص الرؤى — بدون Gemini
// ════════════════════════════════════════════
function extractInsights(youtube, tiktok, series) {
  const insights = {
    topEmotion:        null,
    avgRetention:      null,
    bestPostTime:      null,
    topPerformingEp:   null,
    audienceGrowth:    null,
    engagementRate:    null,
    dropOffPoint:      null,
    whatWorked:        [],
    whatFailed:        [],
  };

  // ── يوتيوب ───────────────────────────
  if (youtube?.videos?.length) {
    const videos = youtube.videos;

    // أفضل فيديو
    const best = videos.reduce((a, b) => a.views > b.views ? a : b);
    insights.topPerformingEp = best.id;

    // متوسط المشاهدة
    const avgViews = videos.reduce((s, v) => s + v.views, 0) / videos.length;
    insights.avgViews = Math.round(avgViews);

    // معدل التفاعل
    const totalLikes   = videos.reduce((s, v) => s + v.likes, 0);
    const totalViews   = videos.reduce((s, v) => s + v.views, 0);
    insights.engagementRate = totalViews > 0
      ? `${((totalLikes / totalViews) * 100).toFixed(2)}%`
      : '0%';

    // تحليل الـ report
    if (youtube.report?.length) {
      const avgRetention = youtube.report
        .reduce((s, r) => s + (parseFloat(r[3]) || 0), 0) / youtube.report.length;
      insights.avgRetention = `${avgRetention.toFixed(1)}%`;

      // أفضل أيام النشر
      const dayViews = {};
      for (const row of youtube.report) {
        const day = new Date(row[0]).getDay();
        dayViews[day] = (dayViews[day] || 0) + (parseInt(row[1]) || 0);
      }
      const bestDay = Object.entries(dayViews).sort((a, b) => b[1] - a[1])[0];
      const dayNames = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
      insights.bestPostTime = dayNames[bestDay?.[0]] || 'الخميس';
    }
  }

  // ── تيك توك ──────────────────────────
  if (tiktok?.videos?.length) {
    const videos = tiktok.videos;

    // أعلى مشاركة
    const topShared = videos.reduce((a, b) =>
      (a.share_count || 0) > (b.share_count || 0) ? a : b);

    // ما نجح
    const highPerf = videos.filter(v => (v.view_count || 0) > insights.avgViews * 1.5);
    for (const v of highPerf) {
      if (v.title) insights.whatWorked.push(v.title.slice(0, 50));
    }

    // ما فشل
    const lowPerf = videos.filter(v =>
      (v.view_count || 0) < (insights.avgViews || 1000) * 0.5);
    for (const v of lowPerf) {
      if (v.title) insights.whatFailed.push(v.title.slice(0, 50));
    }
  }

  // ── تحليل المسلسل ────────────────────
  if (series?.episodes?.length > 1) {
    const eps = series.episodes;
    // أفضل حلقة بالمشاهدات (إذا محفوظة)
    insights.audienceGrowth = eps.length > 1
      ? `+${eps.length} حلقة` : 'بداية';
  }

  return insights;
}

// ════════════════════════════════════════════
// توصيات لـ story-agent و content-agent
// ════════════════════════════════════════════
function buildRecommendations(insights) {
  const library = readForAgent('analytics-agent', 6);

  const recs = {
    forStoryAgent:   [],
    forContentAgent: [],
    forSeriesAgent:  [],
    forUploadAgent:  {},
  };

  // توصيات القصة بناءً على الأداء
  if (parseFloat(insights.avgRetention) < 40) {
    recs.forStoryAgent.push('المشاهدون يغادرون مبكراً — ابدأ بحدث مشوق في أول 30 ثانية');
    recs.forStoryAgent.push('قلل من مشاهد الحوار الطويل — أضف فعلاً كل 2 دقيقة');
  } else if (parseFloat(insights.avgRetention) > 70) {
    recs.forStoryAgent.push('المشاهدون يكملون — يمكن إضافة مشاهد عمق وتفاصيل');
  }

  if (insights.engagementRate && parseFloat(insights.engagementRate) < 2) {
    recs.forStoryAgent.push('تفاعل منخفض — أضف لحظات عاطفية أقوى ومفاجآت');
    recs.forContentAgent.push('اطرح سؤالاً في نهاية كل فيديو لتحفيز التعليقات');
  }

  // ما نجح → كرره
  if (insights.whatWorked.length) {
    recs.forSeriesAgent.push(`هذه المواضيع نجحت: ${insights.whatWorked.slice(0,3).join(' / ')}`);
  }

  // ما فشل → تجنبه
  if (insights.whatFailed.length) {
    recs.forSeriesAgent.push(`تجنب هذا النوع: ${insights.whatFailed.slice(0,2).join(' / ')}`);
  }

  // أفضل وقت نشر
  if (insights.bestPostTime) {
    recs.forUploadAgent = {
      bestDay:  insights.bestPostTime,
      bestHour: 20, // 8 مساءً
      timezone: 'Asia/Riyadh',
    };
  }

  // توصيات المحتوى القصير
  recs.forContentAgent.push('مقاطع 15-30 ثانية تحقق أفضل إكمال على تيك توك');
  recs.forContentAgent.push('الـ hook يجب أن يكون في أول 3 ثوانٍ');
  recs.forContentAgent.push(`أفضل يوم نشر: ${insights.bestPostTime || 'الخميس'}`);

  return recs;
}

// ── تحديث access token ────────────────────
async function refreshYoutubeToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.YOUTUBE_CLIENT_ID,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET,
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('YouTube token refresh failed');
  return data.access_token;
}
