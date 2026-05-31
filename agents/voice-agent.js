/**
 * voice-agent.js
 * يحول الحوار → ملفات صوتية mp3
 * Edge TTS مجاني — لا API key مطلوب
 * كل شخصية لها صوت فريد
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname }                         from 'path';
import { fileURLToPath }                         from 'url';
import { execSync }                              from 'child_process';
import { logger }                                from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// أصوات عربية متاحة في Edge TTS
const VOICE_MAP = {
  'protagonist': 'ar-SA-HamedNeural',    // ذكر سعودي — البطل
  'antagonist':  'ar-SA-ZariyahNeural',  // أنثى سعودية — العدو
  'supporting':  'ar-EG-ShakirNeural',   // ذكر مصري — الرفيق
  'narrator':    'ar-KW-FahedNeural',    // ذكر كويتي — الراوي
  'default':     'ar-SA-HamedNeural',
};

export async function run(screenplay, visualScenes) {
  logger.info('[VOICE] Generating audio', { episode: screenplay.episode });

  const outDir = join(__dirname, '..', 'episodes', `ep${screenplay.episode}`, 'audio');
  mkdirSync(outDir, { recursive: true });

  // بناء خريطة الشخصيات → أصوات
  const charVoices = {};
  for (const char of (screenplay.characters || [])) {
    charVoices[char.name] = char.voice || VOICE_MAP[char.role] || VOICE_MAP.default;
  }

  const audioFiles = [];

  for (const scene of visualScenes.scenes) {
    // صوت الراوي — وصف المكان
    if (scene.location) {
      const narratorLine = buildNarratorLine(scene);
      const narratorFile = join(outDir, `${scene.id}-narrator.mp3`);
      await generateTTS(narratorLine, VOICE_MAP.narrator, narratorFile);
      audioFiles.push({
        sceneId:  scene.id,
        type:     'narrator',
        text:     narratorLine,
        file:     narratorFile,
        duration: estimateDuration(narratorLine),
      });
    }

    // حوار الشخصيات
    for (let i = 0; i < (scene.dialogue || []).length; i++) {
      const line    = scene.dialogue[i];
      const voice   = charVoices[line.character] || VOICE_MAP.default;
      const file    = join(outDir, `${scene.id}-d${i+1}.mp3`);

      // إضافة مسافة صمت قبل الحوار المتوتر
      const text = line.emotion === 'توتر' ? `...${line.line}` : line.line;

      await generateTTS(text, voice, file);
      audioFiles.push({
        sceneId:   scene.id,
        type:      'dialogue',
        character: line.character,
        emotion:   line.emotion,
        text:      line.line,
        voice,
        file,
        duration:  estimateDuration(line.line),
      });
    }
  }

  // حفظ manifest الصوت
  const manifest = {
    episode:    screenplay.episode,
    audioFiles,
    totalLines: audioFiles.length,
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(
    join(__dirname, '..', 'episodes', `ep${screenplay.episode}`, 'audio-manifest.json'),
    JSON.stringify(manifest, null, 2), 'utf8'
  );

  logger.info('[OK] Audio generated', {
    episode: screenplay.episode,
    files:   audioFiles.length,
  });

  return manifest;
}

// ── توليد TTS عبر edge-tts ───────────────
async function generateTTS(text, voice, outputPath) {
  if (existsSync(outputPath)) {
    logger.debug(`[VOICE] Skipping existing: ${outputPath}`);
    return;
  }

  try {
    // edge-tts مثبّت عبر pip
    execSync(
      `edge-tts --voice "${voice}" --text "${text.replace(/"/g, "'")}" --write-media "${outputPath}"`,
      { stdio: 'pipe', timeout: 30000 }
    );
    logger.debug(`[VOICE] Generated: ${outputPath}`);
  } catch (err) {
    logger.error(`[VOICE] TTS failed: ${err.message}`);
    // إنشاء ملف فارغ حتى لا يتوقف خط الإنتاج
    writeFileSync(outputPath, Buffer.alloc(0));
  }
}

// ── بناء سطر الراوي ──────────────────────
function buildNarratorLine(scene) {
  const timeMap = {
    'نهار': 'في وضح النهار',
    'ليل':  'تحت جنح الظلام',
    'فجر':  'عند الفجر',
    'غروب': 'عند الغروب',
  };
  const time = timeMap[scene.time] || '';
  return `${time}، في ${scene.location}.`.trim();
}

// ── تقدير مدة الصوت (ثانية) ──────────────
function estimateDuration(text) {
  // متوسط 3 كلمات/ثانية في العربية
  const words = text.split(/\s+/).length;
  return Math.max(1, Math.round(words / 3));
}
