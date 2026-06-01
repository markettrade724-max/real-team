/**
 * voice-agent.js — v2.0 (Node.js خالص — Windows/Linux/Mac)
 * يحول الحوار → ملفات صوتية mp3
 * عبر edge-tts npm (لا pip، لا shell)
 *
 * npm install edge-tts-node
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname }                         from 'path';
import { fileURLToPath }                         from 'url';
import pkg from 'edge-tts-node';
const { EdgeTTS } = pkg;
import { logger }                                from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tts       = new EdgeTTS();

// أصوات عربية متاحة
const VOICE_MAP = {
  protagonist: 'ar-SA-HamedNeural',
  antagonist:  'ar-SA-ZariyahNeural',
  supporting:  'ar-EG-ShakirNeural',
  narrator:    'ar-KW-FahedNeural',
  default:     'ar-SA-HamedNeural',
};

export async function run(screenplay, visualScenes) {
  logger.info('[VOICE] Generating audio', { episode: screenplay.episode });

  const outDir = join(__dirname, '..', 'episodes', `ep${screenplay.episode}`, 'audio');
  mkdirSync(outDir, { recursive: true });

  // خريطة الشخصيات → أصوات
  const charVoices = {};
  for (const char of (screenplay.characters || [])) {
    charVoices[char.name] = char.voice || VOICE_MAP[char.role] || VOICE_MAP.default;
  }

  const audioFiles = [];

  for (const scene of visualScenes.scenes) {
    // صوت الراوي
    const narratorLine = buildNarratorLine(scene);
    const narratorFile = join(outDir, `${scene.id}-narrator.mp3`);

    if (!existsSync(narratorFile)) {
      await generateTTS(narratorLine, VOICE_MAP.narrator, narratorFile);
    }
    audioFiles.push({
      sceneId:  scene.id,
      type:     'narrator',
      text:     narratorLine,
      file:     narratorFile,
      duration: estimateDuration(narratorLine),
    });

    // حوار الشخصيات
    for (let i = 0; i < (scene.dialogue || []).length; i++) {
      const line  = scene.dialogue[i];
      const voice = charVoices[line.character] || VOICE_MAP.default;
      const file  = join(outDir, `${scene.id}-d${i + 1}.mp3`);
      const text  = line.emotion === 'توتر' ? `...${line.line}` : line.line;

      if (!existsSync(file)) {
        await generateTTS(text, voice, file);
      }

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

  logger.info('[OK] Audio generated', { files: audioFiles.length });
  return manifest;
}

// ════════════════════════════════════════════
// توليد TTS — edge-tts-node (بدون shell)
// ════════════════════════════════════════════
async function generateTTS(text, voice, outputPath, retried = false) {
  try {
    await tts.ttsPromise(text, outputPath, voice);
    logger.debug(`[VOICE] Generated: ${outputPath}`);
  } catch (err) {
    if (!retried) {
      // انتظر ثانية وأعد المحاولة
      await new Promise(r => setTimeout(r, 1000));
      return generateTTS(text, voice, outputPath, true);
    }
    logger.error(`[VOICE] TTS failed: ${err.message}`);
    // ملف صوت فارغ حتى لا يتوقف خط الإنتاج
    writeFileSync(outputPath, Buffer.alloc(0));
  }
}

// ── دوال مساعدة ──────────────────────────
function buildNarratorLine(scene) {
  const timeMap = { 'نهار': 'في وضح النهار', 'ليل': 'تحت جنح الظلام', 'فجر': 'عند الفجر', 'غروب': 'عند الغروب' };
  return `${timeMap[scene.time] || ''}، في ${scene.location}.`.trim();
}

function estimateDuration(text) {
  return Math.max(1, Math.round((text || '').split(/\s+/).length / 3));
}
