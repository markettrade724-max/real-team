/**
 * voice-agent.js — v3.0
 *
 * التغييرات عن v2.3:
 *  - أصوات إنجليزية بدل العربية — en-US-* أكثر استقراراً بكثير على Edge TTS
 *  - يحل مشكلة "Connect Error" التي ظهرت مع الأصوات العربية
 *  - TIME_MAP / narrator line بالإنجليزية
 *  - باقي البنية كما v2.3: preflight check + retry + concurrency محدود
 *
 * القواعد المطبقة:
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-126 : Node.js خالص
 *  rule-138 : msedge-tts
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname }                         from 'path';
import { fileURLToPath }                         from 'url';
import { MsEdgeTTS, OUTPUT_FORMAT }              from 'msedge-tts';
import { logger }                                from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// أصوات إنجليزية — مستقرة جداً على Edge TTS
const VOICE_MAP = {
  protagonist: 'en-US-GuyNeural',
  antagonist:  'en-US-AriaNeural',
  supporting:  'en-GB-RyanNeural',
  narrator:    'en-US-AriaNeural',
  default:     'en-US-GuyNeural',
};

const TIME_MAP = {
  'day':     'in broad daylight',
  'night':   'under the cover of darkness',
  'dawn':    'at dawn',
  'dusk':    'at dusk',
};

const CONCURRENCY  = 2;
const TTS_TIMEOUT  = 25000;
const MAX_RETRIES  = 2;
const RETRY_DELAY  = 3000;

// ══════════════════════════════════════════════════════════
// الدالة الرئيسية
// ══════════════════════════════════════════════════════════
export async function run(screenplay) {
  logger.info('[VOICE] Starting v3.0 (English)', { episode: screenplay.episode });

  const epDir  = join(__dirname, '..', 'episodes', `ep${screenplay.episode}`);
  const outDir = join(epDir, 'audio');
  mkdirSync(outDir, { recursive: true });

  const preflightOk = await preflightCheck();
  if (!preflightOk) {
    logger.error('[VOICE] Preflight check failed — Edge TTS unreachable from this runner');
    const manifest = {
      episode: screenplay.episode, audioFiles: [], totalLines: 0,
      skipped: 0, error: 'EdgeTTS unreachable — preflight failed',
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(join(epDir, 'audio-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    return manifest;
  }

  const charVoices = {};
  for (const char of (screenplay.characters || [])) {
    charVoices[char.name] = char.voice || VOICE_MAP[char.role] || VOICE_MAP.default;
  }

  const scenes = (screenplay.acts || []).flatMap(a => a.scenes || []);
  if (scenes.length === 0) {
    logger.warn('[VOICE] No scenes found');
    return { episode: screenplay.episode, audioFiles: [], totalLines: 0 };
  }

  const tasks = [];

  for (const scene of scenes) {
    const narratorText = buildNarratorLine(scene);
    const narratorFile = join(outDir, `${scene.id}-narrator.mp3`);
    tasks.push({
      text: narratorText, voice: VOICE_MAP.narrator, file: narratorFile,
      meta: { sceneId: scene.id, type: 'narrator', text: narratorText },
    });

    for (let i = 0; i < (scene.dialogue || []).length; i++) {
      const line = scene.dialogue[i];
      if (!line?.line?.trim()) continue;
      const voice = charVoices[line.character] || VOICE_MAP.default;
      const text  = (line.emotion || '').toLowerCase().includes('tense') ? `...${line.line}` : line.line;
      const file  = join(outDir, `${scene.id}-d${i + 1}.mp3`);
      tasks.push({
        text, voice, file,
        meta: {
          sceneId: scene.id, type: 'dialogue', character: line.character,
          emotion: line.emotion, direction: line.direction || '', text: line.line, voice,
        },
      });
    }
  }

  logger.info('[VOICE] Tasks queued', { total: tasks.length, concurrency: CONCURRENCY });

  const results  = new Array(tasks.length).fill(null);
  const errors    = {};
  let inFlight    = 0;
  let idx         = 0;
  let skipped     = 0;

  await new Promise((resolve) => {
    function launchNext() {
      while (inFlight < CONCURRENCY && idx < tasks.length) {
        const i    = idx++;
        const task = tasks[i];

        if (existsSync(task.file)) {
          results[i] = { ...task.meta, file: task.file, duration: estimateDuration(task.meta.text || task.text) };
          if (idx === tasks.length && inFlight === 0) resolve();
          continue;
        }

        inFlight++;
        generateTTS(task.text, task.voice, task.file)
          .then(result => {
            if (result.ok) {
              results[i] = { ...task.meta, file: task.file, duration: estimateDuration(task.meta.text || task.text) };
            } else {
              skipped++;
              const key = result.reason || 'unknown';
              errors[key] = (errors[key] || 0) + 1;
            }
          })
          .catch(err => {
            skipped++;
            const key = describeError(err);
            errors[key] = (errors[key] || 0) + 1;
          })
          .finally(() => {
            inFlight--;
            if (idx < tasks.length) launchNext();
            else if (inFlight === 0) resolve();
          });
      }
    }
    launchNext();
  });

  const audioFiles = results.filter(Boolean);

  const manifest = {
    episode: screenplay.episode,
    audioFiles,
    totalLines: audioFiles.length,
    skipped,
    errorBreakdown: skipped > 0 ? errors : undefined,
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(join(epDir, 'audio-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  if (skipped > 0) {
    logger.warn('[VOICE] Some audio failed', { files: audioFiles.length, skipped, errors });
  } else {
    logger.info('[OK] Audio generated', { files: audioFiles.length, skipped });
  }

  return manifest;
}

// ══════════════════════════════════════════════════════════
// فحص أولي
// ══════════════════════════════════════════════════════════
async function preflightCheck() {
  try {
    const buffer = await Promise.race([
      doTTS('Testing connection', VOICE_MAP.default),
      new Promise((_, rej) => setTimeout(() => rej(new Error('preflight-timeout')), 15000)),
    ]);
    const ok = buffer && buffer.length > 0;
    logger.info(ok ? '[VOICE] Preflight OK — Edge TTS reachable' : '[VOICE] Preflight returned empty buffer');
    return ok;
  } catch (err) {
    logger.error('[VOICE] Preflight failed', { error: describeError(err) });
    return false;
  }
}

// ══════════════════════════════════════════════════════════
// توليد TTS
// ══════════════════════════════════════════════════════════
async function generateTTS(text, voice, outputPath, attempt = 0) {
  if (!text?.trim()) {
    return { ok: false, reason: 'empty-text' };
  }

  try {
    const buffer = await Promise.race([
      doTTS(text, voice),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('tts-timeout')), TTS_TIMEOUT)
      ),
    ]);

    if (!buffer || buffer.length === 0) {
      throw new Error('empty-buffer');
    }

    writeFileSync(outputPath, buffer);
    return { ok: true };

  } catch (err) {
    const reason = describeError(err);

    if (attempt < MAX_RETRIES) {
      logger.warn(`[VOICE] Retry ${attempt + 1}/${MAX_RETRIES} — ${reason}`, {
        file: outputPath.split(/[\\/]/).pop(),
      });
      await new Promise(r => setTimeout(r, RETRY_DELAY));
      return generateTTS(text, voice, outputPath, attempt + 1);
    }

    logger.error(`[VOICE] Failed permanently after ${MAX_RETRIES + 1} attempts`, {
      file: outputPath.split(/[\\/]/).pop(),
      reason,
    });
    return { ok: false, reason };
  }
}

async function doTTS(text, voice) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const readable = tts.toStream(text);
  const chunks = [];
  await new Promise((resolve, reject) => {
    readable.on('data', c => chunks.push(c));
    readable.on('end', resolve);
    readable.on('error', reject);
  });
  return Buffer.concat(chunks);
}

function describeError(err) {
  if (!err) return 'unknown-error';
  if (err.message && err.message.trim()) return err.message;
  if (err.code) return `code:${err.code}`;
  if (err.toString && err.toString() !== '[object Object]') return err.toString();
  try { return JSON.stringify(err).slice(0, 100); } catch { return 'unserializable-error'; }
}

// ══════════════════════════════════════════════════════════
// دوال مساعدة
// ══════════════════════════════════════════════════════════
function buildNarratorLine(scene) {
  const parts = [];
  const timeDesc = TIME_MAP[scene.time];
  if (timeDesc) parts.push(timeDesc);
  if (scene.location?.trim()) parts.push(`in ${scene.location.trim()}`);
  if (scene.mood?.trim())     parts.push(scene.mood.trim());
  if (parts.length === 0) return 'The scene begins';
  return parts.join(', ') + '.';
}

function estimateDuration(text) {
  if (!text) return 1;
  // ~150 words/min = 2.5 words/sec — same rate for English
  return Math.max(1, Math.round(text.trim().split(/\s+/).length / 2.5));
}
