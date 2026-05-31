/**
 * music-agent.js
 * يولد موسيقى لكل حلقة — بدون API مدفوع
 *
 * المصادر (مجانية بالكامل):
 * 1. Suno AI — إذا توفر API
 * 2. Magenta.js — توليد محلي بـ TensorFlow
 * 3. مكتبة CC0 — Free Music Archive / ccMixter
 * 4. tone.js — توليد ambient بـ Web Audio (fallback)
 *
 * يولد 3 مقاطع لكل حلقة:
 * - ambient.mp3    — خلفية هادئة للمشاهد العادية
 * - dramatic.mp3   — توتر للمشاهد الحاسمة والتريلر
 * - ending.mp3     — نهاية الحلقة
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname }  from 'path';
import { fileURLToPath }  from 'url';
import { execSync }       from 'child_process';
import { logger }         from '../logger.js';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const MUSIC_DIR   = join(__dirname, '..', 'assets', 'music');
const EPISODE_DIR = (ep) => join(__dirname, '..', 'episodes', `ep${ep}`, 'music');

// مكتبة CC0 — روابط مباشرة لموسيقى مجانية
const CC0_LIBRARY = {
  ambient: [
    'https://freemusicarchive.org/file/music/ccCommunity/Kai_Engel/Satin/Kai_Engel_-_07_-_Interlude.mp3',
    'https://ccmixter.org/content/airtone/airtone_-_reBreeze.mp3',
  ],
  dramatic: [
    'https://freemusicarchive.org/file/music/WFMU/Broke_For_Free/Directionless_EP/Broke_For_Free_-_01_-_Night_Owl.mp3',
    'https://ccmixter.org/content/texasradiofish/texasradiofish_-_Breathe_(Instrumental).mp3',
  ],
  ending: [
    'https://freemusicarchive.org/file/music/ccCommunity/Kai_Engel/Satin/Kai_Engel_-_09_-_Truly.mp3',
  ],
};

export async function run(screenplay, universe) {
  logger.info('[MUSIC] Generating music', { episode: screenplay.episode });

  mkdirSync(MUSIC_DIR, { recursive: true });
  mkdirSync(EPISODE_DIR(screenplay.episode), { recursive: true });

  const results = {};

  // توليد 3 مقاطع
  for (const type of ['ambient', 'dramatic', 'ending']) {
    const globalPath  = join(MUSIC_DIR, `${type}.mp3`);
    const episodePath = join(EPISODE_DIR(screenplay.episode), `${type}.mp3`);

    // إذا موجود في المكتبة العامة — انسخه
    if (existsSync(globalPath)) {
      execSync(`cp "${globalPath}" "${episodePath}"`);
      results[type] = { path: episodePath, source: 'cached' };
      logger.info(`[MUSIC] Using cached: ${type}`);
      continue;
    }

    // محاولة 1: Suno API
    if (process.env.SUNO_API_KEY) {
      const sunoResult = await generateWithSuno(type, screenplay, universe);
      if (sunoResult) {
        execSync(`cp "${sunoResult}" "${globalPath}"`);
        execSync(`cp "${sunoResult}" "${episodePath}"`);
        results[type] = { path: episodePath, source: 'suno' };
        continue;
      }
    }

    // محاولة 2: تنزيل من مكتبة CC0
    const downloaded = await downloadCC0(type, globalPath);
    if (downloaded) {
      execSync(`cp "${globalPath}" "${episodePath}"`);
      results[type] = { path: episodePath, source: 'cc0' };
      continue;
    }

    // محاولة 3: توليد محلي بـ ffmpeg (sine wave + noise)
    const generated = generateWithFFmpeg(type, episodePath);
    if (generated) {
      execSync(`cp "${episodePath}" "${globalPath}"`);
      results[type] = { path: episodePath, source: 'generated' };
      continue;
    }

    logger.warn(`[MUSIC] Could not generate: ${type}`);
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
// Suno API — أفضل جودة
// ════════════════════════════════════════════
async function generateWithSuno(type, screenplay, universe) {
  const prompts = {
    ambient: `ambient orchestral, ${universe.soul?.essence || 'fantasy world'}, peaceful exploration, no lyrics, cinematic`,
    dramatic: `dramatic orchestral, tense, dark fantasy, ${universe.worlds?.[0]?.physics || 'unknown world'}, no lyrics, epic`,
    ending:   `emotional ending theme, ${screenplay.theme || 'hope and mystery'}, orchestral, no lyrics, fade out`,
  };

  try {
    const res = await fetch('https://studio-api.suno.ai/api/generate/v2/', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUNO_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        prompt:           prompts[type],
        make_instrumental: true,
        mv:               'chirp-v3-5',
      }),
    });

    const data = await res.json();
    const audioUrl = data?.clips?.[0]?.audio_url;
    if (!audioUrl) return null;

    // انتظر حتى يجهز
    await waitForSuno(data.clips[0].id);

    // تنزيل
    const outPath = join(MUSIC_DIR, `suno-${type}-${Date.now()}.mp3`);
    execSync(`curl -s -o "${outPath}" "${audioUrl}"`);
    return outPath;

  } catch (err) {
    logger.warn(`[MUSIC] Suno failed: ${err.message}`);
    return null;
  }
}

async function waitForSuno(clipId, maxWait = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const res  = await fetch(`https://studio-api.suno.ai/api/feed/?ids=${clipId}`, {
        headers: { 'Authorization': `Bearer ${process.env.SUNO_API_KEY}` },
      });
      const data = await res.json();
      if (data?.[0]?.status === 'complete') return true;
    } catch {}
  }
  return false;
}

// ════════════════════════════════════════════
// CC0 — تنزيل موسيقى مجانية
// ════════════════════════════════════════════
async function downloadCC0(type, outputPath) {
  const urls = CC0_LIBRARY[type] || [];
  for (const url of urls) {
    try {
      execSync(`curl -s -L --max-time 30 -o "${outputPath}" "${url}"`, { stdio: 'pipe' });
      if (existsSync(outputPath)) {
        logger.info(`[MUSIC] Downloaded CC0: ${type}`);
        return true;
      }
    } catch {}
  }
  return false;
}

// ════════════════════════════════════════════
// توليد محلي بـ ffmpeg — fallback
// ════════════════════════════════════════════
function generateWithFFmpeg(type, outputPath) {
  const configs = {
    ambient: {
      // موجات جيبية هادئة مع ضوضاء بيضاء خفيفة
      filter: `sine=f=220:r=44100,volume=0.3[s1];sine=f=330:r=44100,volume=0.2[s2];[s1][s2]amix=inputs=2,aecho=0.8:0.9:1000:0.3,lowpass=f=800`,
      dur: 180,
    },
    dramatic: {
      // نغمات منخفضة مع نبض
      filter: `sine=f=110:r=44100,volume=0.5[s1];sine=f=165:r=44100,volume=0.4[s2];[s1][s2]amix=inputs=2,aecho=0.6:0.7:500:0.5,highpass=f=80`,
      dur: 120,
    },
    ending: {
      // نغمات عالية هادئة تتلاشى
      filter: `sine=f=440:r=44100,volume=0.3[s1];sine=f=550:r=44100,volume=0.2[s2];[s1][s2]amix=inputs=2,afade=t=out:st=50:d=30`,
      dur: 90,
    },
  };

  const cfg = configs[type];
  try {
    execSync([
      'ffmpeg -y',
      `-f lavfi -i "${cfg.filter}"`,
      `-t ${cfg.dur}`,
      `-c:a libmp3lame -b:a 128k`,
      `"${outputPath}"`,
    ].join(' '), { stdio: 'pipe' });

    logger.info(`[MUSIC] Generated with ffmpeg: ${type}`);
    return true;
  } catch (err) {
    logger.error(`[MUSIC] ffmpeg generation failed: ${err.message}`);
    return false;
  }
}
