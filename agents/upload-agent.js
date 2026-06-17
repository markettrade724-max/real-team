/**
 * upload-agent.js — v1.4
 *
 * التغييرات عن v1.3:
 *  - supabaseUploadFile: createReadStream بدل readFileSync — لا OOM
 *  - updateSeriesUrls() محذوفة — orchestrator يتولى تحديث series.json
 *  - run() يُرجع { videoUrl, trailerUrl } للـ orchestrator
 *  - ensureBucket() ينشئ bucket تلقائياً إن لم يكن موجوداً
 *
 * القواعد المطبقة:
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-126 : Node.js خالص
 */

import { readFileSync, existsSync, statSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger }        from '../logger.js';

const __dirname     = dirname(fileURLToPath(import.meta.url));
const MAX_SIZE_WARN = 500 * 1024 * 1024; // 500MB
const BUCKET        = 'episodes';

// ══════════════════════════════════════════════════════════
// الدالة الرئيسية
// ══════════════════════════════════════════════════════════
export async function run(episodeManifest, series, trailer = null) {
  logger.info('[UPLOAD] Starting v1.4', { episode: episodeManifest.episode });

  if (!existsSync(episodeManifest.outputPath)) {
    throw new Error(`Video not found: ${episodeManifest.outputPath}`);
  }

  const size = statSync(episodeManifest.outputPath).size;
  if (size > MAX_SIZE_WARN) {
    logger.warn('[UPLOAD] Large file — may be slow', {
      size: `${(size / 1024 / 1024).toFixed(0)}MB`,
    });
  }

  const results = {};

  // ── Supabase Storage — أولوية قصوى ────────────────────
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    results.supabase = await uploadToSupabase(episodeManifest, trailer);
  } else {
    logger.warn('[UPLOAD] Supabase credentials missing — skipping');
    results.supabase = { skipped: true, reason: 'no credentials' };
  }

  // ── يوتيوب ────────────────────────────────────────────
  if (process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_REFRESH_TOKEN) {
    results.youtube = await uploadToYoutube(episodeManifest, series);
    if (trailer?.outputPath && existsSync(trailer.outputPath)) {
      results.youtubeShorts = await uploadToYoutube(
        { ...episodeManifest, outputPath: trailer.outputPath, isShort: true },
        series
      );
    }
  } else {
    logger.warn('[UPLOAD] YouTube credentials missing — skipping');
    results.youtube = { skipped: true, reason: 'no credentials' };
  }

  // ── تيك توك ───────────────────────────────────────────
  if (process.env.TIKTOK_ACCESS_TOKEN) {
    const trailerPath = trailer?.outputPath;
    if (trailerPath && existsSync(trailerPath)) {
      results.tiktok = await uploadToTiktok(trailerPath, episodeManifest, series);
    } else {
      logger.warn('[UPLOAD] No trailer for TikTok');
      results.tiktok = { skipped: true, reason: 'no trailer' };
    }
  } else {
    logger.warn('[UPLOAD] TikTok token missing — skipping');
    results.tiktok = { skipped: true, reason: 'no credentials' };
  }

  // ── إرجاع URLs للـ orchestrator ────────────────────────
  // orchestrator يتولى تحديث series.json — لا تعارض
  const videoUrl   = results.supabase?.videoUrl   || null;
  const trailerUrl = results.supabase?.trailerUrl || null;

  logger.info('[OK] Upload done', {
    supabase: videoUrl   || results.supabase?.skipped  || results.supabase?.error,
    youtube:  results.youtube?.url || results.youtube?.skipped || results.youtube?.error,
    tiktok:   results.tiktok?.url  || results.tiktok?.skipped  || results.tiktok?.error,
  });

  return { ...results, videoUrl, trailerUrl };
}

// ══════════════════════════════════════════════════════════
// Supabase Storage
// ══════════════════════════════════════════════════════════
async function uploadToSupabase(manifest, trailer) {
  logger.info('[SUPABASE] Uploading episode + trailer...');
  try {
    // تأكد من وجود الـ bucket — ينشئه إن لم يكن موجوداً
    await ensureBucket();

    const ep       = manifest.episode;
    const videoUrl = await supabaseUploadFile(
      manifest.outputPath,
      `ep${ep}/episode-${ep}.mp4`,
      'video/mp4'
    );

    let trailerUrl = null;
    if (trailer?.outputPath && existsSync(trailer.outputPath)) {
      trailerUrl = await supabaseUploadFile(
        trailer.outputPath,
        `ep${ep}/trailer-${ep}.mp4`,
        'video/mp4'
      );
    }

    logger.info('[OK] Supabase upload done', { videoUrl, trailerUrl });
    return { success: true, videoUrl, trailerUrl };

  } catch (err) {
    logger.error('[SUPABASE] Upload failed', { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * ينشئ bucket إن لم يكن موجوداً
 */
async function ensureBucket() {
  const url = `${process.env.SUPABASE_URL}/storage/v1/bucket`;

  // تحقق إذا موجود
  const listRes = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type':  'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (listRes.ok) {
    const buckets = await listRes.json();
    if (Array.isArray(buckets) && buckets.find(b => b.name === BUCKET)) {
      logger.info(`[SUPABASE] Bucket "${BUCKET}" exists`);
      return;
    }
  }

  // أنشئ الـ bucket
  const createRes = await fetch(url, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type':  'application/json',
    },
    body:   JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
    signal: AbortSignal.timeout(10000),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    // إذا الخطأ "already exists" — تجاهله
    if (err.includes('already exists') || err.includes('duplicate')) {
      logger.info(`[SUPABASE] Bucket "${BUCKET}" already exists`);
      return;
    }
    throw new Error(`Cannot create bucket: ${err}`);
  }

  logger.info(`[SUPABASE] Bucket "${BUCKET}" created`);
}

/**
 * يرفع ملفاً على Supabase Storage بـ createReadStream
 * لا يحمّل الملف كاملاً في الذاكرة — آمن لملفات 500MB+
 */
async function supabaseUploadFile(filePath, storagePath, contentType) {
  const size = statSync(filePath).size;

  logger.info(`[SUPABASE] Uploading ${storagePath}`, {
    size: `${(size / 1024 / 1024).toFixed(0)}MB`,
  });

  const stream  = createReadStream(filePath);
  const uploadUrl = `${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`;

  const res = await fetch(uploadUrl, {
    method:  'POST',
    headers: {
      'Authorization':  `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type':   contentType,
      'Content-Length': String(size),
      'x-upsert':       'true',
    },
    body:    stream,
    duplex:  'half', // مطلوب لـ ReadStream مع fetch
    signal:  AbortSignal.timeout(600000), // 10 دقائق
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase upload failed (${res.status}): ${err}`);
  }

  const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
  logger.info(`[OK] Supabase file ready`, { url: publicUrl });
  return publicUrl;
}

// ══════════════════════════════════════════════════════════
// يوتيوب
// ══════════════════════════════════════════════════════════
async function uploadToYoutube(manifest, series) {
  logger.info('[YOUTUBE] Uploading...', { episode: manifest.episode });
  try {
    const token    = await refreshYoutubeToken();
    const metadata = {
      snippet: {
        title:           buildYoutubeTitle(manifest, series),
        description:     buildYoutubeDescription(manifest, series),
        tags:            buildTags(series),
        categoryId:      '24',
        defaultLanguage: 'ar',
      },
      status: {
        privacyStatus:           'public',
        selfDeclaredMadeForKids: false,
        publishAt:               getOptimalPublishTime(),
      },
    };

    const uploadUrl = await initResumableUpload(token, metadata);
    const videoId   = await uploadVideoFile(uploadUrl, manifest.outputPath, token);
    const url       = `https://youtube.com/watch?v=${videoId}`;

    logger.info('[OK] YouTube uploaded', { videoId, url });
    return { success: true, videoId, url };
  } catch (err) {
    logger.error('[YOUTUBE] Upload failed', { error: err.message });
    return { success: false, error: err.message };
  }
}

async function refreshYoutubeToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.YOUTUBE_CLIENT_ID,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET,
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`YouTube token refresh failed: ${JSON.stringify(data)}`);
  logger.info('[YOUTUBE] Token refreshed');
  return data.access_token;
}

async function initResumableUpload(token, metadata) {
  const res = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method:  'POST',
      headers: {
        'Authorization':         `Bearer ${token}`,
        'Content-Type':          'application/json',
        'X-Upload-Content-Type': 'video/mp4',
      },
      body:   JSON.stringify(metadata),
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!res.ok) throw new Error(`Init upload failed: ${res.status} ${await res.text()}`);
  const location = res.headers.get('location');
  if (!location) throw new Error('No upload URL returned from YouTube');
  return location;
}

async function uploadVideoFile(uploadUrl, videoPath, token) {
  // YouTube يقبل ReadStream مع duplex
  const size   = statSync(videoPath).size;
  const stream = createReadStream(videoPath);

  logger.info('[YOUTUBE] Uploading file...', {
    size: `${(size / 1024 / 1024).toFixed(0)}MB`,
  });

  const res = await fetch(uploadUrl, {
    method:  'PUT',
    headers: {
      'Authorization':  `Bearer ${token}`,
      'Content-Type':   'video/mp4',
      'Content-Length': String(size),
    },
    body:   stream,
    duplex: 'half',
    signal: AbortSignal.timeout(300000),
  });

  const data = await res.json();
  if (!data.id) throw new Error(`Upload failed — no video ID: ${JSON.stringify(data)}`);
  return data.id;
}

// ══════════════════════════════════════════════════════════
// تيك توك
// ══════════════════════════════════════════════════════════
async function uploadToTiktok(videoPath, manifest, series) {
  logger.info('[TIKTOK] Uploading trailer...');
  try {
    // TikTok يحتاج size مسبقاً — نقرأ فقط الحجم ثم نفتح stream
    const size   = statSync(videoPath).size;
    const buffer = readFileSync(videoPath); // trailer صغير — مقبول

    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        post_info: {
          title:           buildTiktokTitle(manifest, series),
          privacy_level:   'PUBLIC_TO_EVERYONE',
          disable_duet:    false,
          disable_comment: false,
        },
        source_info: {
          source:           'FILE_UPLOAD',
          video_size:        size,
          chunk_size:        size,
          total_chunk_count: 1,
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    const initData = await initRes.json();
    if (!initData.data?.upload_url) {
      throw new Error('TikTok init failed: ' + JSON.stringify(initData));
    }

    await fetch(initData.data.upload_url, {
      method:  'PUT',
      headers: {
        'Content-Type':   'video/mp4',
        'Content-Range':  `bytes 0-${size - 1}/${size}`,
        'Content-Length': String(size),
      },
      body:   buffer,
      signal: AbortSignal.timeout(120000),
    });

    const url = `https://tiktok.com/@${process.env.TIKTOK_USERNAME}`;
    logger.info('[OK] TikTok uploaded', { publishId: initData.data.publish_id });
    return { success: true, publishId: initData.data.publish_id, url };

  } catch (err) {
    logger.error('[TIKTOK] Upload failed', { error: err.message });
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════
// بيانات وصفية
// ══════════════════════════════════════════════════════════
function buildYoutubeTitle(manifest, series) {
  return `${series?.title || 'المسلسل'} — الحلقة ${manifest.episode}: ${manifest.title || ''}`.trim();
}

function buildYoutubeDescription(manifest, series) {
  return [
    `${series?.title || 'مسلسل'} — الحلقة ${manifest.episode}`,
    '',
    manifest.title || '',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━',
    'مسلسل مولود من الذكاء الاصطناعي',
    'كون فريد يتطور كل يوم',
    '━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '#مسلسل_عربي #ذكاء_اصطناعي #قصة',
  ].join('\n');
}

function buildTiktokTitle(manifest, series) {
  return `${series?.title || 'مسلسل'} الحلقة ${manifest.episode} #مسلسل #ذكاء_اصطناعي`;
}

function buildTags(series) {
  return [
    'مسلسل عربي', 'ذكاء اصطناعي', 'قصة خيالية',
    series?.title || 'مسلسل',
    'AI Series', 'Arabic Drama',
  ];
}

function getOptimalPublishTime() {
  const now    = new Date();
  const target = new Date(now);
  target.setHours(17, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target.toISOString();
}
