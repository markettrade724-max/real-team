/**
 * upload-agent.js — v1.5
 *
 * Changes from v1.4:
 *  - Return value: youtube/tiktok now explicit URL string or null (not spread object)
 *    Fixes false positive: { youtube: true, tiktok: true } even when skipped
 *  - Logger line updated to show actual upload status clearly
 *  - Comments translated from Arabic to English
 *
 * Rules applied:
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-126 : Node.js pure
 *  rule-228 : Supabase Storage — maximum priority
 *  rule-229 : createReadStream + duplex:'half' for video — prevents OOM
 */

import { readFileSync, existsSync, statSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger }        from '../logger.js';

const __dirname     = dirname(fileURLToPath(import.meta.url));
const MAX_SIZE_WARN = 500 * 1024 * 1024; // 500MB
const BUCKET        = 'episodes';

// ══════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════
export async function run(episodeManifest, series, trailer = null) {
  logger.info('[UPLOAD] Starting v1.5', { episode: episodeManifest.episode });

  if (!existsSync(episodeManifest.outputPath)) {
    throw new Error(`Video not found: ${episodeManifest.outputPath}`);
  }

  const size = statSync(episodeManifest.outputPath).size;
  if (size > MAX_SIZE_WARN) {
    logger.warn('[UPLOAD] Large file — may be slow', {
      size: `${(size / 1024 / 1024).toFixed(0)}MB`,
    });
  }

  let videoUrl   = null;
  let trailerUrl = null;
  let youtubeUrl = null;
  let tiktokUrl  = null;

  // ── Supabase Storage — maximum priority (rule-228) ────────
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const result = await uploadToSupabase(episodeManifest, trailer);
    videoUrl   = result.videoUrl   || null;
    trailerUrl = result.trailerUrl || null;
  } else {
    logger.warn('[UPLOAD] Supabase credentials missing — skipping');
  }

  // ── YouTube (optional — needs YOUTUBE_CLIENT_ID + YOUTUBE_REFRESH_TOKEN) ──
  if (process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_REFRESH_TOKEN) {
    const result = await uploadToYoutube(episodeManifest, series);
    youtubeUrl   = result.url || null;

    if (trailer?.outputPath && existsSync(trailer.outputPath)) {
      await uploadToYoutube(
        { ...episodeManifest, outputPath: trailer.outputPath, isShort: true },
        series
      );
    }
  } else {
    logger.warn('[UPLOAD] YouTube credentials missing — skipping');
  }

  // ── TikTok (optional — needs TIKTOK_ACCESS_TOKEN) ──────────
  if (process.env.TIKTOK_ACCESS_TOKEN) {
    const trailerPath = trailer?.outputPath;
    if (trailerPath && existsSync(trailerPath)) {
      const result = await uploadToTiktok(trailerPath, episodeManifest, series);
      tiktokUrl    = result.url || null;
    } else {
      logger.warn('[UPLOAD] No trailer for TikTok — skipping');
    }
  } else {
    logger.warn('[UPLOAD] TikTok token missing — skipping');
  }

  // FIX v1.5 — explicit status, never truthy-object false positives
  logger.info('[OK] Upload done', {
    supabase: videoUrl   || 'skipped',
    youtube:  youtubeUrl || 'skipped',
    tiktok:   tiktokUrl  || 'skipped',
  });

  // FIX v1.5 — return explicit values, not spread of internal result objects
  return {
    videoUrl,
    trailerUrl,
    youtube: youtubeUrl, // null if skipped — orchestrator checks truthiness correctly
    tiktok:  tiktokUrl,  // null if skipped
  };
}

// ══════════════════════════════════════════════════════════
// Supabase Storage
// ══════════════════════════════════════════════════════════
async function uploadToSupabase(manifest, trailer) {
  logger.info('[SUPABASE] Uploading episode + trailer...');
  try {
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

    // Upload thumbnail if available (edit-agent v2.4 — for OG social share)
    if (manifest.thumbnailPath && existsSync(manifest.thumbnailPath)) {
      const thumbUrl = await supabaseUploadFile(
        manifest.thumbnailPath,
        `ep${ep}/thumbnail.jpg`,
        'image/jpeg'
      );
      logger.info('[SUPABASE] Thumbnail uploaded', { url: thumbUrl });
      return { success: true, videoUrl, trailerUrl, thumbnailUrl: thumbUrl };
    }

    logger.info('[OK] Supabase upload done', { videoUrl, trailerUrl });
    return { success: true, videoUrl, trailerUrl };

  } catch (err) {
    logger.error('[SUPABASE] Upload failed', { error: err.message });
    return { success: false, error: err.message, videoUrl: null, trailerUrl: null };
  }
}

async function ensureBucket() {
  const url = `${process.env.SUPABASE_URL}/storage/v1/bucket`;

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
    if (err.includes('already exists') || err.includes('duplicate')) {
      logger.info(`[SUPABASE] Bucket "${BUCKET}" already exists`);
      return;
    }
    throw new Error(`Cannot create bucket: ${err}`);
  }

  logger.info(`[SUPABASE] Bucket "${BUCKET}" created`);
}

// rule-229: createReadStream + duplex:'half' — prevents OOM on large files
async function supabaseUploadFile(filePath, storagePath, contentType) {
  const size = statSync(filePath).size;

  logger.info(`[SUPABASE] Uploading ${storagePath}`, {
    size: `${(size / 1024 / 1024).toFixed(0)}MB`,
  });

  const stream    = createReadStream(filePath);
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
    duplex:  'half',
    signal:  AbortSignal.timeout(600000), // 10 minutes
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase upload failed (${res.status}): ${err}`);
  }

  const publicUrl =
    `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
  logger.info('[OK] Supabase file ready', { url: publicUrl });
  return publicUrl;
}

// ══════════════════════════════════════════════════════════
// YouTube
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
        defaultLanguage: 'en',
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
    return { success: false, error: err.message, url: null };
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
  if (!data.access_token) {
    throw new Error(`YouTube token refresh failed: ${JSON.stringify(data)}`);
  }
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
// TikTok
// ══════════════════════════════════════════════════════════
async function uploadToTiktok(videoPath, manifest, series) {
  logger.info('[TIKTOK] Uploading trailer...');
  try {
    const size   = statSync(videoPath).size;
    const buffer = readFileSync(videoPath); // trailer is small — readFileSync acceptable

    const initRes = await fetch(
      'https://open.tiktokapis.com/v2/post/publish/video/init/',
      {
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
            source:            'FILE_UPLOAD',
            video_size:        size,
            chunk_size:        size,
            total_chunk_count: 1,
          },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

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
    return { success: false, error: err.message, url: null };
  }
}

// ══════════════════════════════════════════════════════════
// Metadata builders
// ══════════════════════════════════════════════════════════
function buildYoutubeTitle(manifest, series) {
  return `${series?.title || 'The Series'} — Episode ${manifest.episode}: ${manifest.title || ''}`.trim();
}

function buildYoutubeDescription(manifest, series) {
  return [
    `${series?.title || 'Series'} — Episode ${manifest.episode}`,
    '',
    manifest.title || '',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━',
    'A series born from artificial intelligence',
    'A unique universe that evolves every day',
    '━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '#AISeries #ArtificialIntelligence #Story',
  ].join('\n');
}

function buildTiktokTitle(manifest, series) {
  return `${series?.title || 'Series'} Episode ${manifest.episode} #series #AI`;
}

function buildTags(series) {
  return [
    'AI series', 'artificial intelligence', 'fiction story',
    series?.title || 'series',
    'AI Series', 'Sci-Fi Drama',
  ];
}

function getOptimalPublishTime() {
  const now    = new Date();
  const target = new Date(now);
  target.setHours(17, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target.toISOString();
}
