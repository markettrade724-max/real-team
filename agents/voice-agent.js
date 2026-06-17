/**
 * voice-agent.js — v2.2
 *
 * التغييرات عن v2.1:
 *  - TTS بالتوازي: 5 مهام في وقت واحد بدل sequential
 *  - buildNarratorLine: نتيجة نظيفة حتى عند الحقول الفارغة
 *  - ar-KW-FahedNeural → ar-SA-ZariyahNeural (أكثر موثوقية)
 *  - timeout على كل مهمة TTS (30 ثانية)
 *
 * القواعد المطبقة:
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-126 : Node.js خالص — لا bash — لا pip
 *  rule-138 : msedge-tts
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname }                         from 'path';
import { fileURLToPath }                         from 'url';
import { MsEdgeTTS, OUTPUT_FORMAT }              from 'msedge-tts';
import { logger }                                from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const VOICE_MAP = {
  protagonist: 'ar-SA-HamedNeural',
  antagonist:  'ar-SA-ZariyahNeural',
  supporting:  'ar-EG-ShakirNeural',
  narrator:    'ar-SA-ZariyahNeural',  // v2.2: أكثر موثوقية
  default:     'ar-SA-HamedNeural',
};

const TIME_MAP = {
  'نهار':  'في وضح النهار',
  'ليل':   'تحت جنح الظلام',
  'فجر':   'عند الفجر',
  'غروب':  'عند الغروب',
};

const CONCURRENCY = 5;  // v2.2: 5 مهام TTS بالتوازي
const TTS_TIMEOUT = 30000; // 30 ثانية لكل مهمة

// ══════════════════════════════════════════════════════════
// الدالة الرئيسية
// ══════════════════════════════════════════════════════════
export async function run(screenplay) {
  logger.info('[VOICE] Starting v2.2', { episode: screenplay.episode });

  const epDir  = join(__dirname, '..', 'episodes', `ep${screenplay.episode}`);
  const outDir = join(epDir, 'audio');
  mkdirSync(outDir, { recursive: true });

  const charVoices = {};
  for (const char of (screenplay.characters || [])) {
    charVoices[char.name] = char.voice || VOICE_MAP[char.role] || VOICE_MAP.default;
  }

  const scenes = (screenplay.acts || []).flatMap(a => a.scenes || []);
  if (scenes.length === 0) {
    logger.warn('[VOICE] No scenes found');
    return { episode: screenplay.episode, audioFiles: [], totalLines: 0 };
  }

  // ── بناء قائمة المهام ──────────────────────────────────
  const tasks = [];

  for (const scene of scenes) {
    // راوي
    const narratorText = buildNarratorLine(scene);
    const narratorFile = join(outDir, `${scene.id}-narrator.mp3`);
    tasks.push({
      text:      narratorText,
      voice:     VOICE_MAP.narrator,
      file:      narratorFile,
      meta:      { sceneId: scene.id, type: 'narrator', text: narratorText },
    });

    // حوار
    for (let i = 0; i < (scene.dialogue || []).length; i++) {
      const line = scene.dialogue[i];
      if (!line?.line?.trim()) continue;
      const voice = charVoices[line.character] || VOICE_MAP.default;
      const text  = line.emotion === 'توتر' ? `...${line.line}` : line.line;
      const file  = join(outDir, `${scene.id}-d${i + 1}.mp3`);
      tasks.push({
        text, voice, file,
        meta: {
          sceneId:   scene.id,
          type:      'dialogue',
          character: line.character,
          emotion:   line.emotion,
          direction: line.direction || '',
          text:      line.line,
          voice,
        },
      });
    }
  }

  logger.info('[VOICE] Tasks queued', { total: tasks.length, concurrency: CONCURRENCY });

  // ── تنفيذ بالتوازي (CONCURRENCY = 5) ──────────────────
  const results    = new Array(tasks.length).fill(null);
  let   inFlight   = 0;
  let   idx        = 0;
  let   skipped    = 0;

  await new Promise((resolve) => {
    function launchNext() {
      while (inFlight < CONCURRENCY && idx < tasks.length) {
        const i    = idx++;
        const task = tasks[i];

        // تخطّ الملفات الموجودة
        if (existsSync(task.file)) {
          results[i] = { ...task.meta, file: task.file, duration: estimateDuration(task.meta.text || task.text) };
          if (idx === tasks.length && inFlight === 0) resolve();
          launchNext();
          continue;
        }

        inFlight++;
        generateTTS(task.text, task.voice, task.file)
          .then(ok => {
            if (ok) {
              results[i] = { ...task.meta, file: task.file, duration: estimateDuration(task.meta.text || task.text) };
            } else {
              skipped++;
            }
          })
          .catch(() => { skipped++; })
          .finally(() => {
            inFlight--;
            if (idx < tasks.length) {
              launchNext();
            } else if (inFlight === 0) {
              resolve();
            }
          });
      }
    }
    launchNext();
  });

  const audioFiles = results.filter(Boolean);

  const manifest = {
    episode:     screenplay.episode,
    audioFiles,
    totalLines:  audioFiles.length,
    skipped,
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(join(epDir, 'audio-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  logger.info('[OK] Audio generated', { files: audioFiles.length, skipped });
  return manifest;
}

// ══════════════════════════════════════════════════════════
// توليد TTS — مع timeout
// ══════════════════════════════════════════════════════════
async function generateTTS(text, voice, outputPath, retried = false) {
  if (!text?.trim()) {
    logger.warn(`[VOICE] Empty text — skipping ${outputPath}`);
    return false;
  }

  try {
    const buffer = await Promise.race([
      doTTS(text, voice),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('TTS timeout')), TTS_TIMEOUT)
      ),
    ]);

    if (!buffer || buffer.length === 0) {
      logger.warn(`[VOICE] Empty audio buffer — ${outputPath}`);
      return false;
    }

    writeFileSync(outputPath, buffer);
    return true;

  } catch (err) {
    if (!retried) {
      logger.warn(`[VOICE] TTS retry — ${err.message}`);
      await new Promise(r => setTimeout(r, 1500));
      return generateTTS(text, voice, outputPath, true);
    }
    logger.error(`[VOICE] TTS failed — ${outputPath}`, { error: err.message });
    return false;
  }
}

async function doTTS(text, voice) {
  const tts      = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const readable = tts.toStream(text);
  const chunks   = [];
  await new Promise((resolve, reject) => {
    readable.on('data',  c => chunks.push(c));
    readable.on('end',   resolve);
    readable.on('error', reject);
  });
  return Buffer.concat(chunks);
}

// ══════════════════════════════════════════════════════════
// دوال مساعدة
// ══════════════════════════════════════════════════════════

// v2.2: نتيجة نظيفة حتى عند الحقول الفارغة
function buildNarratorLine(scene) {
  const parts = [];
  const timeDesc = TIME_MAP[scene.time];
  if (timeDesc) parts.push(timeDesc);
  if (scene.location?.trim()) parts.push(`في ${scene.location.trim()}`);
  if (scene.mood?.trim())     parts.push(scene.mood.trim());
  if (parts.length === 0) return 'المشهد يبدأ';
  return parts.join('، ') + '.';
}

// ~150 كلمة/دقيقة = 2.5 كلمة/ثانية
function estimateDuration(text) {
  if (!text) return 1;
  return Math.max(1, Math.round(text.trim().split(/\s+/).length / 2.5));
}
