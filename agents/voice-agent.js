/**
 * voice-agent.js — v2.1 (Node.js خالص)
 *
 * التغييرات عن v2.0:
 *  - يقرأ من screenplay.acts[].scenes (توافق مع screenplay-agent v2.0)
 *  - ملف فارغ عند الفشل → تخطي بدون كسر المانيفست
 *  - estimateDuration مُصحَّح للعربية (2.5 كلمة/ثانية)
 *  - تحقق من نص فارغ قبل TTS
 *  - تحقق من وجود episodes dir
 *
 * القواعد المطبقة:
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-126 : Node.js خالص — لا bash — لا pip
 *  rule-138 : msedge-tts (بدل edge-tts-node)
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname }                         from 'path';
import { fileURLToPath }                         from 'url';
import { MsEdgeTTS, OUTPUT_FORMAT }              from 'msedge-tts';
import { logger }                                from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// أصوات عربية
const VOICE_MAP = {
  protagonist: 'ar-SA-HamedNeural',
  antagonist:  'ar-SA-ZariyahNeural',
  supporting:  'ar-EG-ShakirNeural',
  narrator:    'ar-KW-FahedNeural',
  default:     'ar-SA-HamedNeural',
};

// وصف الوقت للراوي
const TIME_MAP = {
  'نهار':  'في وضح النهار',
  'ليل':   'تحت جنح الظلام',
  'فجر':   'عند الفجر',
  'غروب':  'عند الغروب',
};

// ══════════════════════════════════════════════════════════
// الدالة الرئيسية
// ══════════════════════════════════════════════════════════

export async function run(screenplay) {
  logger.info('[VOICE] Starting v2.1', { episode: screenplay.episode });

  const epDir  = join(__dirname, '..', 'episodes', `ep${screenplay.episode}`);
  const outDir = join(epDir, 'audio');
  mkdirSync(outDir, { recursive: true });

  // خريطة الشخصيات → أصوات
  const charVoices = {};
  for (const char of (screenplay.characters || [])) {
    charVoices[char.name] = char.voice || VOICE_MAP[char.role] || VOICE_MAP.default;
  }

  // استخراج المشاهد من acts (screenplay-agent v2.0)
  const scenes = (screenplay.acts || []).flatMap(a => a.scenes || []);

  if (scenes.length === 0) {
    logger.warn('[VOICE] No scenes found in screenplay');
    return { episode: screenplay.episode, audioFiles: [], totalLines: 0 };
  }

  const audioFiles = [];
  let skipped = 0;

  for (const scene of scenes) {
    // ── صوت الراوي ───────────────────────────────────
    const narratorText = buildNarratorLine(scene);
    const narratorFile = join(outDir, `${scene.id}-narrator.mp3`);

    if (!existsSync(narratorFile)) {
      const ok = await generateTTS(narratorText, VOICE_MAP.narrator, narratorFile);
      if (!ok) { skipped++; continue; }
    }

    audioFiles.push({
      sceneId:  scene.id,
      type:     'narrator',
      text:     narratorText,
      file:     narratorFile,
      duration: estimateDuration(narratorText),
    });

    // ── حوار الشخصيات ────────────────────────────────
    for (let i = 0; i < (scene.dialogue || []).length; i++) {
      const line = scene.dialogue[i];

      // تخطي النص الفارغ
      if (!line?.line?.trim()) {
        logger.warn(`[VOICE] Empty dialogue line — ${scene.id} d${i + 1}`);
        skipped++;
        continue;
      }

      const voice = charVoices[line.character] || VOICE_MAP.default;
      const file  = join(outDir, `${scene.id}-d${i + 1}.mp3`);

      // نبرة التوتر
      const text = line.emotion === 'توتر' ? `...${line.line}` : line.line;

      if (!existsSync(file)) {
        const ok = await generateTTS(text, voice, file);
        if (!ok) { skipped++; continue; }
      }

      audioFiles.push({
        sceneId:   scene.id,
        type:      'dialogue',
        character: line.character,
        emotion:   line.emotion,
        direction: line.direction || '',
        text:      line.line,
        voice,
        file,
        duration:  estimateDuration(line.line),
      });
    }
  }

  // ── حفظ المانيفست ────────────────────────────────────
  const manifest = {
    episode:     screenplay.episode,
    audioFiles,
    totalLines:  audioFiles.length,
    skipped,
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(
    join(epDir, 'audio-manifest.json'),
    JSON.stringify(manifest, null, 2), 'utf8'
  );

  logger.info('[OK] Audio generated', {
    files:   audioFiles.length,
    skipped,
    episode: screenplay.episode,
  });

  return manifest;
}

// ══════════════════════════════════════════════════════════
// توليد TTS — msedge-tts
// ══════════════════════════════════════════════════════════

async function generateTTS(text, voice, outputPath, retried = false) {
  if (!text?.trim()) {
    logger.warn(`[VOICE] Empty text — skipping ${outputPath}`);
    return false;
  }

  try {
    const tts      = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const readable = tts.toStream(text);
    const chunks   = [];

    await new Promise((resolve, reject) => {
      readable.on('data',  chunk => chunks.push(chunk));
      readable.on('end',   resolve);
      readable.on('error', reject);
    });

    const buffer = Buffer.concat(chunks);

    // لا تكتب ملفاً فارغاً
    if (buffer.length === 0) {
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
    logger.error(`[VOICE] TTS failed permanently — ${outputPath}`, { error: err.message });
    return false;
  }
}

// ══════════════════════════════════════════════════════════
// دوال مساعدة
// ══════════════════════════════════════════════════════════

function buildNarratorLine(scene) {
  const timeDesc = TIME_MAP[scene.time] || '';
  const location = scene.location || '';
  return `${timeDesc}، في ${location}.`.trim().replace(/^،\s*/, '');
}

/**
 * تقدير المدة للعربية
 * ~150 كلمة/دقيقة = 2.5 كلمة/ثانية
 */
function estimateDuration(text) {
  if (!text) return 1;
  const words = (text || '').trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 2.5));
}
