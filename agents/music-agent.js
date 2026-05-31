/**
 * music-agent.js — v2.0 (Node.js خالص — Windows/Linux/Mac)
 * يولد موسيقى لكل حلقة
 *
 * المصادر (مجانية):
 * 1. Suno API — أفضل جودة
 * 2. CC0 — Free Music Archive
 * 3. fluent-ffmpeg — توليد محلي كـ fallback
 */

import { writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname }  from 'path';
import { fileURLToPath }  from 'url';
import ffmpeg             from 'fluent-ffmpeg';
import ffmpegInstaller    from '@ffmpeg-installer/ffmpeg';
import { logger }         from '../logger.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __dirname = dirname(fileURLToPath(import.meta.url));
const MUSIC_DIR = join(__dirname, '..', 'assets', 'music');

const CC0_LIBRARY = {
  ambient:  'https://freemusicarchive.org/file/music/ccCommunity/Kai_Engel/Satin/Kai_Engel_-_07_-_Interlude.mp3',
  dramatic: 'https://freemusicarchive.org/file/music/WFMU/Broke_For_Free/Directionless_EP/Broke_For_Free_-_01_-_Night_Owl.mp3',
  ending:   'https://freemusicarchive.org/file/music/ccCommunity/Kai_Engel/Satin/Kai_Engel_-_09_-_Truly.mp3',
};

export async function run(screenplay, universe) {
  logger.info('[MUSIC] Generating music', { episode: screenplay.episode });
  mkdirSync(MUSIC_DIR, { recursive: true });

  const results = {};

  for (const type of ['ambient', 'dramatic', 'ending']) {
    const globalPath  = join(MUSIC_DIR, `${type}.mp3`);
    const episodeDir  = join(__dirname, '..', 'episodes', `ep${screenplay.episode}`, 'music');
    const episodePath = join(episodeDir, `${type}.mp3`);
    mkdirSync(episodeDir, { recursive: true });

    // مخبأ — إذا موجود
    if (existsSync(globalPath)) {
      copyFileSync(globalPath, episodePath);
      results[type] = { path: episodePath, source: 'cached' };
      logger.info(`[MUSIC] Cached: ${type}`);
      continue;
    }

    // محاولة 1: Suno
    if (process.env.SUNO_API_KEY) {
      const sunoPath = await generateWithSuno(type, screenplay, universe, globalPath);
      if (sunoPath) {
        copyFileSync(globalPath, episodePath);
        results[type] = { path: episodePath, source: 'suno' };
        continue;
      }
    }

    // محاولة 2: CC0 تنزيل
    const cc0Ok = await downloadCC0(type, globalPath);
    if (cc0Ok) {
      copyFileSync(globalPath, episodePath);
      results[type] = { path: episodePath, source: 'cc0' };
      continue;
    }

    // محاولة 3: توليد محلي بـ ffmpeg
    const genOk = await generateWithFFmpeg(type, globalPath);
    if (genOk) {
      copyFileSync(globalPath, episodePath);
      results[type] = { path: episodePath, source: 'generated' };
      continue;
    }

    logger.warn(`[MUSIC] All sources failed: ${type}`);
    results[type] = { path: null, source: 'failed' };
  }

  logger.info('[OK] Music ready', {
    ambient:  results.ambient?.source,
    dramatic: results.dramatic?.source,
    ending:   results.ending?.source,
  });

  return results;
}

// ════════════════════════════════════════════
// Suno API
// ════════════════════════════════════════════
async function generateWithSuno(type, screenplay, universe, outputPath) {
  const prompts = {
    ambient:  `ambient orchestral, ${universe.soul?.essence || 'fantasy'}, peaceful, no lyrics, cinematic`,
    dramatic: `dramatic orchestral, tense, dark fantasy, no lyrics, epic, intense`,
    ending:   `emotional ending theme, ${screenplay.theme || 'hope'}, orchestral, no lyrics, fade out`,
  };

  try {
    const res = await fetch('https://studio-api.suno.ai/api/generate/v2/', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${process.env.SUNO_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompts[type], make_instrumental: true, mv: 'chirp-v3-5' }),
    });
    const data = await res.json();
    const clip = data?.clips?.[0];
    if (!clip) return null;

    // انتظار الجاهزية
    let audioUrl = null;
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const pollRes  = await fetch(`https://studio-api.suno.ai/api/feed/?ids=${clip.id}`,
        { headers: { 'Authorization': `Bearer ${process.env.SUNO_API_KEY}` } });
      const pollData = await pollRes.json();
      if (pollData?.[0]?.status === 'complete') {
        audioUrl = pollData[0].audio_url;
        break;
      }
    }
    if (!audioUrl) return null;

    // تنزيل بـ fetch
    const mp3Res = await fetch(audioUrl);
    const buffer = Buffer.from(await mp3Res.arrayBuffer());
    writeFileSync(outputPath, buffer);
    logger.info(`[MUSIC] Suno generated: ${type}`);
    return outputPath;

  } catch (err) {
    logger.warn(`[MUSIC] Suno failed: ${err.message}`);
    return null;
  }
}

// ════════════════════════════════════════════
// CC0 تنزيل بـ fetch
// ════════════════════════════════════════════
async function downloadCC0(type, outputPath) {
  const url = CC0_LIBRARY[type];
  if (!url) return false;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return false;
    const buffer = Buffer.from(await res.arrayBuffer());
    writeFileSync(outputPath, buffer);
    logger.info(`[MUSIC] CC0 downloaded: ${type}`);
    return true;
  } catch (err) {
    logger.warn(`[MUSIC] CC0 failed: ${type} — ${err.message}`);
    return false;
  }
}

// ════════════════════════════════════════════
// توليد محلي بـ fluent-ffmpeg
// ════════════════════════════════════════════
function generateWithFFmpeg(type, outputPath) {
  const configs = {
    ambient:  { freq: 220, dur: 180, vol: 0.3, echo: '0.8:0.9:1000:0.3' },
    dramatic: { freq: 110, dur: 120, vol: 0.5, echo: '0.6:0.7:500:0.5'  },
    ending:   { freq: 440, dur: 90,  vol: 0.25, echo: '0.9:0.8:800:0.2' },
  };
  const cfg = configs[type];

  return new Promise((resolve) => {
    ffmpeg()
      .input(`sine=frequency=${cfg.freq}:sample_rate=44100`)
      .inputFormat('lavfi')
      .audioFilters([
        `volume=${cfg.vol}`,
        `aecho=${cfg.echo}`,
        type === 'ending' ? `afade=t=out:st=${cfg.dur - 20}:d=20` : '',
      ].filter(Boolean))
      .outputOptions(['-t', cfg.dur, '-c:a', 'libmp3lame', '-b:a', '128k'])
      .output(outputPath)
      .on('end',   () => { logger.info(`[MUSIC] Generated: ${type}`); resolve(true); })
      .on('error', (err) => { logger.error(`[MUSIC] ffmpeg failed: ${err.message}`); resolve(false); })
      .run();
  });
}
