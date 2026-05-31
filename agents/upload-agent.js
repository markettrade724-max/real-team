/**
 * upload-agent.js
 * ينشر الحلقة تلقائياً على يوتيوب + تيك توك
 * يوتيوب: YouTube Data API v3
 * تيك توك: TikTok Content Posting API
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname }            from 'path';
import { fileURLToPath }            from 'url';
import { createReadStream }         from 'fs';
import { logger }                   from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function run(episodeManifest, series) {
  logger.info('[UPLOAD] Starting', { episode: episodeManifest.episode });

  if (!existsSync(episodeManifest.outputPath)) {
    throw new Error(`Video not found: ${episodeManifest.outputPath}`);
  }

  const results = {};

  // ── يوتيوب ───────────────────────────
  if (process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_REFRESH_TOKEN) {
    results.youtube = await uploadToYoutube(episodeManifest, series);
  } else {
    logger.warn('[UPLOAD] YouTube credentials missing — skipping');
    results.youtube = { skipped: true, reason: 'no credentials' };
  }

  // ── تيك توك ──────────────────────────
  if (process.env.TIKTOK_ACCESS_TOKEN) {
    // تيك توك يقبل فيديو 60 ثانية max — نرسل trailer
    const trailerPath = join(
      __dirname, '..', 'episodes', `ep${episodeManifest.episode}`, 'output', 'trailer.mp4'
    );
    if (existsSync(trailerPath)) {
      results.tiktok = await uploadToTiktok(trailerPath, episodeManifest, series);
    } else {
      logger.warn('[UPLOAD] No trailer found for TikTok');
      results.tiktok = { skipped: true, reason: 'no trailer' };
    }
  } else {
    logger.warn('[UPLOAD] TikTok token missing — skipping');
    results.tiktok = { skipped: true, reason: 'no credentials' };
  }

  logger.info('[OK] Upload done', {
    youtube: results.youtube?.url || results.youtube?.skipped,
    tiktok:  results.tiktok?.url  || results.tiktok?.skipped,
  });

  return results;
}

// ════════════════════════════════════════════
// يوتيوب
// ════════════════════════════════════════════
async function uploadToYoutube(manifest, series) {
  logger.info('[YOUTUBE] Uploading...');

  try {
    // 1. الحصول على access token
    const token = await refreshYoutubeToken();

    // 2. بيانات الفيديو
    const metadata = {
      snippet: {
        title:       buildYoutubeTitle(manifest, series),
        description: buildYoutubeDescription(manifest, series),
        tags:        buildTags(series),
        categoryId:  '24', // Entertainment
        defaultLanguage: 'ar',
      },
      status: {
        privacyStatus:           'public',
        selfDeclaredMadeForKids: false,
        publishAt:               getOptimalPublishTime(),
      },
    };

    // 3. رفع الفيديو — resumable upload
    const uploadUrl = await initResumableUpload(token, metadata);
    const videoId   = await uploadVideoFile(uploadUrl, manifest.outputPath, token);

    const url = `https://youtube.com/watch?v=${videoId}`;
    logger.info('[OK] YouTube uploaded', { videoId, url });
    return { success: true, videoId, url };

  } catch (err) {
    logger.error('[YOUTUBE] Upload failed', { error: err.message });
    return { success: false, error: err.message };
  }
}

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

async function initResumableUpload(token, metadata) {
  const res = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method:  'POST',
      headers: {
        'Authorization':  `Bearer ${token}`,
        'Content-Type':   'application/json',
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify(metadata),
    }
  );
  if (!res.ok) throw new Error(`Init upload failed: ${res.status}`);
  return res.headers.get('location');
}

async function uploadVideoFile(uploadUrl, videoPath, token) {
  const { createReadStream, statSync } = await import('fs');
  const size   = statSync(videoPath).size;
  const stream = createReadStream(videoPath);

  const res = await fetch(uploadUrl, {
    method:  'PUT',
    headers: {
      'Authorization':  `Bearer ${token}`,
      'Content-Type':   'video/mp4',
      'Content-Length': size,
    },
    body: stream,
    duplex: 'half',
  });

  const data = await res.json();
  if (!data.id) throw new Error('Upload failed — no video ID');
  return data.id;
}

// ════════════════════════════════════════════
// تيك توك
// ════════════════════════════════════════════
async function uploadToTiktok(videoPath, manifest, series) {
  logger.info('[TIKTOK] Uploading trailer...');

  try {
    const { statSync } = await import('fs');
    const size = statSync(videoPath).size;

    // 1. تهيئة الرفع
    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        post_info: {
          title:        buildTiktokTitle(manifest, series),
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet:  false,
          disable_comment: false,
        },
        source_info: {
          source:         'FILE_UPLOAD',
          video_size:     size,
          chunk_size:     size,
          total_chunk_count: 1,
        },
      }),
    });

    const initData = await initRes.json();
    if (!initData.data?.upload_url) {
      throw new Error('TikTok init failed: ' + JSON.stringify(initData));
    }

    // 2. رفع الملف
    const videoBuffer = readFileSync(videoPath);
    await fetch(initData.data.upload_url, {
      method:  'PUT',
      headers: {
        'Content-Type':            'video/mp4',
        'Content-Range':           `bytes 0-${size-1}/${size}`,
        'Content-Length':          size,
      },
      body: videoBuffer,
    });

    const url = `https://tiktok.com/@${process.env.TIKTOK_USERNAME}`;
    logger.info('[OK] TikTok uploaded', { publishId: initData.data.publish_id });
    return { success: true, publishId: initData.data.publish_id, url };

  } catch (err) {
    logger.error('[TIKTOK] Upload failed', { error: err.message });
    return { success: false, error: err.message };
  }
}

// ════════════════════════════════════════════
// بناء البيانات الوصفية
// ════════════════════════════════════════════
function buildYoutubeTitle(manifest, series) {
  return `${series?.title || 'المسلسل'} — الحلقة ${manifest.episode}: ${manifest.title}`;
}

function buildYoutubeDescription(manifest, series) {
  return [
    `${series?.title || 'مسلسل'} — الحلقة ${manifest.episode}`,
    '',
    manifest.title,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━',
    '🎬 مسلسل مولود من الذكاء الاصطناعي',
    '🌌 كون فريد يتطور كل يوم',
    '━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '#مسلسل_عربي #ذكاء_اصطناعي #قصة',
  ].join('\n');
}

function buildTiktokTitle(manifest, series) {
  return `${series?.title || 'مسلسل'} الحلقة ${manifest.episode} 🎬 #مسلسل #ذكاء_اصطناعي`;
}

function buildTags(series) {
  return [
    'مسلسل عربي', 'ذكاء اصطناعي', 'قصة خيالية',
    series?.title || 'مسلسل',
    'AI Series', 'Arabic Drama',
  ];
}

// أفضل وقت نشر — الخميس 8 مساءً بتوقيت السعودية
function getOptimalPublishTime() {
  const now = new Date();
  const target = new Date(now);
  target.setHours(17, 0, 0, 0); // 17:00 UTC = 20:00 KSA
  // إذا فات الوقت اليوم — نشر غداً
  if (target <= now) target.setDate(target.getDate() + 1);
  return target.toISOString();
}
