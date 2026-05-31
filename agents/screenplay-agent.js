/**
 * screenplay-agent.js
 * يحول soul + story + universe → سيناريو محترف
 * يطبق قواعد McKee + Syd Field + Truby من المكتبة
 */

import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { askGemini }     from './_gemini.js';
import { readForAgent }  from './library-builder-agent.js';
import { logger }        from '../logger.js';

const INSIGHTS_PATH = join(
  dirname(fileURLToPath(import.meta.url)), '..', 'agent-results', 'audience-insights.json'
);

function loadInsights() {
  if (!existsSync(INSIGHTS_PATH)) return null;
  try { return JSON.parse(readFileSync(INSIGHTS_PATH, 'utf8')); } catch { return null; }
}

const __dirname   = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, '..', 'agent-results');

export async function run(universe, episodeNumber = 1, seriesContext = null) {
  logger.info('[SCREENPLAY] Starting', { universe: universe.id, episode: episodeNumber });

  const library  = readForAgent('screenplay-agent', 12);
  const insights = loadInsights();
  const audienceGuide = insights?.recommendations?.forStoryAgent?.length
    ? `\nتوجيهات الجمهور:\n${insights.recommendations.forStoryAgent.map(r => `- ${r}`).join('\n')}`
    : '';

  // بناء الشخصيات من universe
  const characters = buildCharacters(universe);

  // سياق المسلسل إذا وجد
  const previousContext = seriesContext
    ? `الحلقات السابقة:\n${seriesContext.previousEpisodes
        .map(e => `- الحلقة ${e.number}: ${e.summary}`).join('\n')}`
    : 'هذه الحلقة الأولى — ابدأ بإيقاع بطيء يبني العالم.';

  const prompt = `
${library}
${audienceGuide}

أنت كاتب سيناريو محترف من طراز McKee و Syd Field.

الكون: "${universe.name?.ar || universe.name?.en}"
الروح: "${universe.soul?.essence}"
القانون الفيزيائي: "${universe.worlds?.[0]?.physics || 'غير محدد'}"

الشخصيات المتاحة:
${characters.map(c => `- ${c.name} (${c.role}): ${c.description}`).join('\n')}

${previousContext}

اكتب سيناريو الحلقة ${episodeNumber} (8-12 دقيقة):

قواعد إلزامية:
- البنية الثلاثية: إعداد (25%) → مواجهة (50%) → حل (25%)
- كل مشهد له هدف درامي واحد
- الحوار يكشف الشخصية لا يشرح الحبكة
- نهاية الحلقة: cliff-hanger أو تحول درامي

أنتج JSON فقط:
{
  "episode": ${episodeNumber},
  "title":   "عنوان الحلقة",
  "logline": "جملة واحدة تلخص الحلقة",
  "theme":   "الموضوع الجوهري",
  "acts": [
    {
      "act":      1,
      "name":     "الإعداد",
      "summary":  "ملخص الفصل",
      "scenes": [
        {
          "id":          "S01",
          "location":    "اسم المكان",
          "time":        "نهار / ليل / فجر / غروب",
          "mood":        "التوتر العاطفي للمشهد",
          "duration":    60,
          "camera":      "وصف حركة الكاميرا والتأطير",
          "lighting":    "وصف الإضاءة",
          "action":      "وصف الحركة والأفعال",
          "dialogue": [
            {
              "character": "اسم الشخصية",
              "line":      "الحوار",
              "emotion":   "الحالة العاطفية",
              "direction": "توجيه التمثيل"
            }
          ],
          "sfx":    "المؤثرات الصوتية",
          "music":  "وصف الموسيقى"
        }
      ]
    }
  ],
  "characters": ${JSON.stringify(characters)},
  "cliffhanger": "وصف نهاية الحلقة المشوّقة",
  "nextEpisodeHint": "تلميح للحلقة القادمة"
}`;

  const screenplay = await askGemini(prompt, 0.8,
    { maxOutputTokens: 8192, topP: 0.9 }, 'screenplay-agent');

  if (!screenplay?.acts?.length) {
    logger.error('[SCREENPLAY] Invalid output');
    throw new Error('screenplay-agent: invalid output');
  }

  // حساب مدة الحلقة
  const totalSeconds = screenplay.acts
    .flatMap(a => a.scenes)
    .reduce((s, sc) => s + (sc.duration || 60), 0);

  screenplay.totalDuration = totalSeconds;
  screenplay.universeId    = universe.id;
  screenplay.generatedAt   = new Date().toISOString();

  writeFileSync(
    join(RESULTS_DIR, `screenplay-ep${episodeNumber}.json`),
    JSON.stringify(screenplay, null, 2), 'utf8'
  );

  logger.info('[OK] Screenplay done', {
    episode:  episodeNumber,
    scenes:   screenplay.acts.flatMap(a => a.scenes).length,
    duration: `${Math.round(totalSeconds / 60)}min`,
  });

  return screenplay;
}

// ── بناء الشخصيات من universe ─────────────
function buildCharacters(universe) {
  const chars = [];

  // البطل — من soul
  if (universe.soul?.protagonist) {
    chars.push({
      name:        universe.soul.protagonist.name || 'البطل',
      role:        'protagonist',
      description: universe.soul.protagonist.description || universe.soul.essence,
      voice:       'ar-SA-HamedNeural',
    });
  }

  // الأعداء — من أول عالم
  const enemies = universe.worlds?.[0]?.enemies || [];
  for (const enemy of enemies.slice(0, 2)) {
    chars.push({
      name:        enemy.name?.ar || enemy.name?.en || 'العدو',
      role:        'antagonist',
      description: enemy.description || enemy.behavior,
      voice:       'ar-SA-ZariyahNeural',
    });
  }

  // شخصية ثانوية افتراضية
  if (chars.length < 3) {
    chars.push({
      name:        'الرفيق',
      role:        'supporting',
      description: 'رفيق البطل في الرحلة — صوت العقل',
      voice:       'ar-EG-ShakirNeural',
    });
  }

  return chars;
}
