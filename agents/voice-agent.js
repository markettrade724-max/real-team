/**
 * voice-agent.js — v4.0
 *
 * التغييرات عن v3.0:
 *  - استبدال msedge-tts بـ Piper TTS (محلي بالكامل — لا اتصال إنترنت)
 *  - يحل نهائياً مشكلة "Connect Error" — Piper لا يتصل بأي خادم خارجي
 *  - 4 أصوات متنوعة لكل لغة (en/fr) — protagonist/antagonist/supporting/narrator
 *  - execFile بدل exec — أكثر أماناً مع نصوص تحتوي أحرفاً خاصة
 *  - الناتج WAV (ffmpeg في edit-agent يقبله مباشرة بدون تحويل)
 *
 * يتطلب:
 *  - piper/piper.exe (مُثبَّت في run-all-agents.yml قبل تشغيل orchestrator)
 *  - piper/{voice}.onnx + piper/{voice}.onnx.json لكل صوت مستخدم
 *
 * القواعد المطبقة:
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-126 : Node.js خالص — لا bash — لا pip
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname }                                       from 'path';
import { fileURLToPath }                                       from 'url';
import { execFile }                                            from 'child_process';
import { promisify }                                            from 'util';
import { logger }                                              from '../logger.js';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const PIPER_DIR  = join(__dirname, '..', 'piper');
const PIPER_EXE  = join(PIPER_DIR, 'piper.exe');
const execFileP  = promisify(execFile);

// ══════════════════════════════════════════════════════════
// خريطة الأصوات — متنوعة لكل لغة
// ══════════════════════════════════════════════════════════
const VOICE_MAP = {
  en: {
    protagonist: 'en_US-joe-medium',
    antagonist:  'en_US-hfc_female-medium',
    supporting:  'en_GB-alan-medium',
    narrator:    'en_US-kristin-medium',
    default:     'en_US-joe-medium',
  },
  fr: {
    protagonist: 'fr_FR-tom-medium',
    antagonist:  'fr_FR-upmc-medium',
    supporting:  'fr_FR-gilles-low',
    narrator:    'fr_FR-siwis-medium',
    default:     'fr_FR-tom-medium',
  },
};

const TIME_MAP = {
  en: {
    day: 'in broad daylight', night: 'under the cover of darkness',
    dawn: 'at dawn', dusk: 'at dusk',
  },
  fr: {
    day: 'en plein jour', night: "sous le couvert de l'obscurité",
    dawn: "à l'aube", dusk: 'au crépuscule',
  },
};

const CONCURRENCY  = 3;     // Piper محلي — يحتمل تزامناً أعلى من Edge TTS
const TTS_TIMEOUT  = 20000;
const MAX_RETRIES  = 1;     // Piper مستقر محلياً — إعادة محاولة واحدة تكفي
const RETRY_DELAY  = 1000;

// ══════════════════════════════════════════════════════════
// الدالة الرئيسية
// ══════════════════════════════════════════════════════════
export async function run(screenplay) {
  const lang = screenplay.language === 'fr' ? 'fr' : 'en';
  logger.info('[VOICE] Starting v4.0 (Piper)', { episode: screenplay.episode, lang });

  const epDir  = join(__dirname, '..', 'episodes', `ep${screenplay.episode}`);
  const outDir = join(epDir, 'audio');
  mkdirSync(outDir, { recursive: true });

  const voiceSet = VOICE_MAP[lang];
  const timeSet  = TIME_MAP[lang];

  // ── فحص أولي: هل Piper وملفات النماذج المطلوبة موجودة؟ ──
  const preflightOk = await preflightCheck(voiceSet);
  if (!preflightOk) {
    logger.error('[VOICE] Preflight check failed — Piper or voice models missing');
    const manifest = {
      episode: screenplay.episode, audioFiles: [], totalLines: 0,
      skipped: 0, error: 'Piper unavailable — preflight failed',
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(join(epDir, 'audio-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    return manifest;
  }

  const charVoices = {};
  for (const char of (screenplay.characters || [])) {
    charVoices[char.name] = resolveVoiceFile(char.voice, voiceSet, char.role);
  }

  const scenes = (screenplay.acts || []).flatMap(a => a.scenes || []);
  if (scenes.length === 0) {
    logger.warn('[VOICE] No scenes found');
    return { episode: screenplay.episode, audioFiles: [], totalLines: 0 };
  }

  const tasks = [];

  for (const scene of scenes) {
    const narratorText = buildNarratorLine(scene, timeSet, lang);
    const narratorFile = join(outDir, `${scene.id}-narrator.wav`);
    tasks.push({
      text: narratorText, voice: voiceSet.narrator, file: narratorFile,
      meta: { sceneId: scene.id, type: 'narrator', text: narratorText },
    });

    for (let i = 0; i < (scene.dialogue || []).length; i++) {
      const line = scene.dialogue[i];
      if (!line?.line?.trim()) continue;
      const voice = charVoices[line.character] || voiceSet.default;
      const text  = (line.emotion || '').toLowerCase().includes('tense') ? `...${line.line}` : line.line;
      const file  = join(outDir, `${scene.id}-d${i + 1}.wav`);
      tasks.push({
        text, voice, file,
        meta: {
          sceneId: scene.id, type: 'dialogue', character: line.character,
          emotion: line.emotion, direction: line.direction || '', text: line.line, voice,
        },
      });
    }
  }

  logger.info('[VOICE] Tasks queued', { total: tasks.length, concurrency: CONCURRENCY, lang });

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
    lang,
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
    logger.info('[OK] Audio generated', { files: audioFiles.length, skipped, lang });
  }

  return manifest;
}

// ══════════════════════════════════════════════════════════
// تحديد ملف الصوت بناءً على دور الشخصية
// ══════════════════════════════════════════════════════════
function resolveVoiceFile(charVoiceHint, voiceSet, role) {
  // إذا كان screenplay-agent قد كتب اسم صوت Edge القديم (en-US-GuyNeural)،
  // نتجاهله ونستخدم خريطة Piper حسب الدور — توافق عكسي مع سيناريوهات قديمة
  if (charVoiceHint && Object.values(voiceSet).includes(charVoiceHint)) {
    return charVoiceHint;
  }
  return voiceSet[role] || voiceSet.default;
}

// ══════════════════════════════════════════════════════════
// فحص أولي — Piper موجود + نموذج واحد على الأقل قابل للتشغيل
// ══════════════════════════════════════════════════════════
async function preflightCheck(voiceSet) {
  if (!existsSync(PIPER_EXE)) {
    logger.error('[VOICE] Piper binary not found', { path: PIPER_EXE });
    return false;
  }

  const testVoice = voiceSet.narrator;
  if (!modelExists(testVoice)) {
    logger.error('[VOICE] Voice model missing', { voice: testVoice });
    return false;
  }

  try {
    const testFile = join(PIPER_DIR, '_preflight_test.wav');
    const result = await generateTTS('Testing', testVoice, testFile, 0);
    return result.ok;
  } catch (err) {
    logger.error('[VOICE] Preflight failed', { error: describeError(err) });
    return false;
  }
}

function modelExists(voiceName) {
  return existsSync(join(PIPER_DIR, `${voiceName}.onnx`)) &&
         existsSync(join(PIPER_DIR, `${voiceName}.onnx.json`));
}

// ══════════════════════════════════════════════════════════
// توليد TTS عبر Piper — execFile (لا shell injection)
// ══════════════════════════════════════════════════════════
async function generateTTS(text, voiceName, outputPath, attempt = 0) {
  if (!text?.trim()) {
    return { ok: false, reason: 'empty-text' };
  }

  if (!modelExists(voiceName)) {
    return { ok: false, reason: `model-missing:${voiceName}` };
  }

  const modelPath = join(PIPER_DIR, `${voiceName}.onnx`);

  try {
    await Promise.race([
      runPiper(text, modelPath, outputPath),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('tts-timeout')), TTS_TIMEOUT)
      ),
    ]);

    if (!existsSync(outputPath) || readFileSync(outputPath).length === 0) {
      throw new Error('empty-output');
    }

    return { ok: true };

  } catch (err) {
    const reason = describeError(err);

    if (attempt < MAX_RETRIES) {
      logger.warn(`[VOICE] Retry ${attempt + 1}/${MAX_RETRIES} — ${reason}`, {
        file: outputPath.split(/[\\/]/).pop(),
      });
      await new Promise(r => setTimeout(r, RETRY_DELAY));
      return generateTTS(text, voiceName, outputPath, attempt + 1);
    }

    logger.error(`[VOICE] Failed permanently after ${MAX_RETRIES + 1} attempts`, {
      file: outputPath.split(/[\\/]/).pop(),
      reason,
    });
    return { ok: false, reason };
  }
}

/**
 * يستدعي piper.exe عبر echo | piper --model ... --output_file ...
 * Piper يقرأ النص من stdin — نستخدم execFile مع stdin مباشر بدل shell pipe
 */
function runPiper(text, modelPath, outputPath) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      PIPER_EXE,
      ['--model', modelPath, '--output_file', outputPath],
      { timeout: TTS_TIMEOUT, windowsHide: true },
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
    child.stdin.write(text);
    child.stdin.end();
  });
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
function buildNarratorLine(scene, timeSet, lang) {
  const parts = [];
  const timeDesc = timeSet[scene.time];
  if (timeDesc) parts.push(timeDesc);
  const inWord = lang === 'fr' ? 'à' : 'in';
  if (scene.location?.trim()) parts.push(`${inWord} ${scene.location.trim()}`);
  if (scene.mood?.trim())     parts.push(scene.mood.trim());
  if (parts.length === 0) return lang === 'fr' ? 'La scène commence' : 'The scene begins';
  return parts.join(', ') + '.';
}

function estimateDuration(text) {
  if (!text) return 1;
  return Math.max(1, Math.round(text.trim().split(/\s+/).length / 2.5));
}
