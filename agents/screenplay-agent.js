/**
 * screenplay-agent.js — v2.0
 *
 * القواعد المطبقة:
 *  rule-056 : soulContext قبل كل عمل
 *  rule-087 : askGemini(prompt, temp, options, caller)
 *  rule-089 : كل الردود JSON
 *  rule-097 : لا تغيير للنموذج
 *  rule-098 : askGemini فقط — لا fetch مباشر
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-100 : soulContext يُرجع string
 *  rule-101 : maxOutputTokens لا maxTokens
 *  rule-102 : لا JSON.parse — _gemini.js يُرجع كائن
 *  rule-128 : caller logging للميزانية
 *  rule-131 : يقرأ audience-insights.json قبل الكتابة
 *
 *  rule-139 : 3 طلبات منفصلة: backbone → scenes → dialogue
 *  rule-140 : maxOutputTokens: backbone=4096 / scenes=32768 / dialogue=32768
 *  rule-141 : temperature: backbone=0.6 / scenes=0.5 / dialogue=0.7
 *  rule-142 : library في systemPrompt منفصل عن prompt الرئيسي
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { askGemini, canAfford } from './_gemini.js';
import { soulContext }  from './_soul.js';
import { readForAgent } from './library-builder-agent.js';
import { logger }       from '../logger.js';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, '..', 'agent-results');
const INSIGHTS_PATH = join(RESULTS_DIR, 'audience-insights.json');

// ══════════════════════════════════════════════════════
// أدوات مساعدة
// ══════════════════════════════════════════════════════

function ensureResultsDir() {
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });
}

function loadInsights() {
  if (!existsSync(INSIGHTS_PATH)) return null;
  try { return JSON.parse(readFileSync(INSIGHTS_PATH, 'utf8')); }
  catch { return null; }
}

function buildAudienceGuide(insights) {
  if (!insights?.recommendations?.forStoryAgent?.length) return '';
  return insights.recommendations.forStoryAgent
    .map(r => `- ${r}`).join('\n');
}

function buildPreviousContext(seriesContext, episodeNumber) {
  if (!seriesContext?.previousEpisodes?.length) {
    return 'هذه الحلقة الأولى — ابدأ بإيقاع يبني العالم ويُعرّف البطل.';
  }
  return seriesContext.previousEpisodes
    .slice(-3)
    .map(e => `- الحلقة ${e.number}: ${e.summary}`)
    .join('\n');
}

// ── بناء الشخصيات من universe ──────────────────────
function buildCharacters(universe) {
  const chars = [];

  // البطل
  const proto = universe.soul?.protagonist;
  chars.push({
    name:        proto?.name        || 'البطل',
    role:        'protagonist',
    description: proto?.description || universe.soul?.essence || 'بطل مجهول المصير',
    arc:         proto?.arc         || 'من الشك إلى اليقين',
    flaw:        proto?.flaw        || 'الخوف من الخسارة',
    voice:       'ar-SA-HamedNeural',
  });

  // الأعداء — حتى 2
  const enemies = universe.worlds?.[0]?.enemies || [];
  for (const enemy of enemies.slice(0, 2)) {
    chars.push({
      name:        enemy.name?.ar   || enemy.name?.en || 'العدو',
      role:        'antagonist',
      description: enemy.description || enemy.behavior || 'عدو غامض',
      arc:         enemy.arc         || 'قوة لا ترحم',
      flaw:        enemy.flaw        || 'غرور مدمر',
      voice:       'ar-SA-ZariyahNeural',
    });
  }

  // شخصية داعمة من soul إذا وجدت
  if (universe.soul?.companion) {
    chars.push({
      name:        universe.soul.companion.name || 'الرفيق',
      role:        'supporting',
      description: universe.soul.companion.description || 'صوت العقل',
      arc:         universe.soul.companion.arc  || 'من التردد إلى الإيمان',
      flaw:        universe.soul.companion.flaw || 'الثقة الزائدة',
      voice:       'ar-EG-ShakirNeural',
    });
  } else if (chars.length < 3) {
    chars.push({
      name:        'الرفيق',
      role:        'supporting',
      description: 'رفيق البطل — يحمل أسراراً تُكشف لاحقاً',
      arc:         'من التردد إلى الإيمان',
      flaw:        'يخفي حقيقة تُغيّر مسار القصة',
      voice:       'ar-EG-ShakirNeural',
    });
  }

  return chars;
}

// ══════════════════════════════════════════════════════
// الطلب 1 — العمود الفقري
// ══════════════════════════════════════════════════════

async function generateBackbone(universe, episodeNumber, characters, prevContext, audienceGuide, soul) {
  logger.info('[SCREENPLAY] Step 1/3 — Backbone');

  const prompt = `
أنت كاتب سيناريو محترف من طراز McKee و Syd Field و Truby.

الكون: "${universe.name?.ar || universe.name?.en}"
الروح: "${universe.soul?.essence}"
القانون الفيزيائي: "${universe.worlds?.[0]?.physics || 'غير محدد'}"
السياق السابق: ${prevContext}
${audienceGuide ? `\nتوجيهات الجمهور:\n${audienceGuide}` : ''}

الشخصيات:
${characters.map(c => `- ${c.name} (${c.role}): ${c.description} | arc: ${c.arc} | عيب: ${c.flaw}`).join('\n')}

اكتب العمود الفقري للحلقة ${episodeNumber}.

قواعد البنية:
- الفصل الأول  (25%): إعداد العالم + تعريف الصراع
- الفصل الثاني (50%): تصعيد + نقطة لا عودة
- الفصل الثالث (25%): ذروة + نهاية مشوّقة

أنتج JSON فقط — بدون أي نص خارج الـ JSON:
{
  "episode":          ${episodeNumber},
  "title":            "عنوان الحلقة",
  "logline":          "جملة واحدة تلخص الحلقة",
  "theme":            "الموضوع الجوهري",
  "emotionalJourney": "قوس العاطفة من البداية للنهاية",
  "acts": [
    {
      "act":          1,
      "name":         "الإعداد",
      "summary":      "ملخص الفصل في 3 جمل",
      "emotionalArc": "الحالة العاطفية السائدة",
      "sceneCount":   3
    },
    {
      "act":          2,
      "name":         "المواجهة",
      "summary":      "ملخص الفصل في 3 جمل",
      "emotionalArc": "الحالة العاطفية السائدة",
      "sceneCount":   5
    },
    {
      "act":          3,
      "name":         "الحل",
      "summary":      "ملخص الفصل في 3 جمل",
      "emotionalArc": "الحالة العاطفية السائدة",
      "sceneCount":   3
    }
  ],
  "turningPoints": [
    "نقطة التحول الأولى — نهاية الفصل الأول",
    "نقطة اللا عودة  — منتصف الفصل الثاني",
    "الذروة           — بداية الفصل الثالث"
  ],
  "cliffhanger":     "وصف نهاية الحلقة المشوّقة بدقة",
  "nextEpisodeHint": "تلميح غامض للحلقة القادمة"
}`;

  const result = await askGemini(
    `${soul}\n\n${prompt}`,
    0.6,
    { maxOutputTokens: 4096, topP: 0.85 },
    'screenplay-agent'
  );

  if (!result?.acts?.length || result.acts.length < 3) {
    throw new Error('[SCREENPLAY] Backbone invalid — missing acts');
  }

  logger.info('[OK] Backbone done', { title: result.title, theme: result.theme });
  return result;
}

// ══════════════════════════════════════════════════════
// الطلب 2 — المشاهد
// ══════════════════════════════════════════════════════

async function generateScenes(universe, backbone, characters, soul, library) {
  logger.info('[SCREENPLAY] Step 2/3 — Scenes');

  // بناء قائمة المشاهد المطلوبة
  const sceneList = backbone.acts.map(act => ({
    act:        act.act,
    name:       act.name,
    summary:    act.summary,
    emotional:  act.emotionalArc,
    sceneCount: act.sceneCount || 3,
  }));

  const prompt = `
${library}

الكون: "${universe.name?.ar || universe.name?.en}"
عنوان الحلقة: "${backbone.title}"
الموضوع: "${backbone.theme}"

نقاط التحول:
${backbone.turningPoints.map((t, i) => `${i + 1}. ${t}`).join('\n')}

الشخصيات: ${characters.map(c => c.name).join(' / ')}

هيكل الفصول:
${sceneList.map(a =>
  `الفصل ${a.act} — ${a.name} (${a.sceneCount} مشاهد):\n  ${a.summary}\n  المزاج: ${a.emotional}`
).join('\n\n')}

اكتب تفاصيل كل مشهد.

قواعد إلزامية لكل مشهد:
- هدف درامي واحد واضح
- camera وصف سينمائي حقيقي (زاوية + حركة)
- lighting يخدم المزاج العاطفي
- duration بين 45 و 120 ثانية
- sfx صوت بيئي واقعي
- music وصف الإيقاع والأداة الموسيقية

أنتج JSON فقط — بدون أي نص خارج الـ JSON:
{
  "acts": [
    {
      "act": 1,
      "name": "الإعداد",
      "scenes": [
        {
          "id":        "S01",
          "location":  "اسم المكان التفصيلي",
          "time":      "نهار / ليل / فجر / غروب / داخلي / خارجي",
          "mood":      "التوتر العاطفي للمشهد",
          "goal":      "الهدف الدرامي لهذا المشهد",
          "duration":  60,
          "camera":    "وصف حركة الكاميرا والتأطير",
          "lighting":  "وصف الإضاءة",
          "action":    "وصف الحركة والأفعال بالتفصيل",
          "sfx":       "المؤثرات الصوتية البيئية",
          "music":     "وصف الموسيقى: الإيقاع والأداة والمزاج"
        }
      ]
    }
  ]
}`;

  const result = await askGemini(
    `${soul}\n\n${prompt}`,
    0.5,
    { maxOutputTokens: 32768, topP: 0.85 },
    'screenplay-agent'
  );

  if (!result?.acts?.length) {
    throw new Error('[SCREENPLAY] Scenes invalid — missing acts');
  }

  // حساب عدد المشاهد
  const totalScenes = result.acts.flatMap(a => a.scenes || []).length;
  logger.info('[OK] Scenes done', { totalScenes });
  return result;
}

// ══════════════════════════════════════════════════════
// الطلب 3 — الحوار
// ══════════════════════════════════════════════════════

async function generateDialogue(scenes, characters, backbone, soul) {
  logger.info('[SCREENPLAY] Step 3/3 — Dialogue');

  // قائمة المشاهد للحوار
  const sceneIds = scenes.acts
    .flatMap(a => a.scenes || [])
    .map(s => `${s.id}: ${s.goal} | المكان: ${s.location} | المزاج: ${s.mood}`)
    .join('\n');

  const charProfiles = characters
    .map(c => `- ${c.name} (${c.role}): ${c.description} | عيب: ${c.flaw} | arc: ${c.arc}`)
    .join('\n');

  const prompt = `
أنت كاتب حوار محترف. الحوار يكشف الشخصية — لا يشرح الحبكة.

عنوان الحلقة: "${backbone.title}"
الموضوع: "${backbone.theme}"
قوس العاطفة: "${backbone.emotionalJourney}"

الشخصيات:
${charProfiles}

المشاهد المطلوب كتابة حوارها:
${sceneIds}

قواعد الحوار الإلزامية:
- كل جملة تكشف شيئاً عن الشخصية أو تدفع الحبكة
- لا كليشيهات — لا "أنت لا تفهم" / "سأنتقم"
- كل شخصية لها صوت فريد لا يشبه الآخر
- الجمل قصيرة في لحظات التوتر — طويلة في لحظات التأمل
- direction: توجيه تمثيلي دقيق (نبرة + إيقاع + جسد)

أنتج JSON فقط — بدون أي نص خارج الـ JSON:
{
  "dialogues": {
    "S01": [
      {
        "character":  "اسم الشخصية",
        "line":       "الحوار",
        "emotion":    "الحالة العاطفية الداخلية",
        "direction":  "توجيه التمثيل: الصوت والجسد والنظرة"
      }
    ]
  }
}`;

  const result = await askGemini(
    `${soul}\n\n${prompt}`,
    0.7,
    { maxOutputTokens: 32768, topP: 0.92 },
    'screenplay-agent'
  );

  if (!result?.dialogues || !Object.keys(result.dialogues).length) {
    throw new Error('[SCREENPLAY] Dialogue invalid — empty dialogues');
  }

  const totalLines = Object.values(result.dialogues)
    .reduce((s, lines) => s + lines.length, 0);
  logger.info('[OK] Dialogue done', { totalLines });
  return result;
}

// ══════════════════════════════════════════════════════
// دمج النتائج
// ══════════════════════════════════════════════════════

function mergeScreenplay(backbone, scenes, dialogue, characters, universe, episodeNumber) {
  const dialogues = dialogue.dialogues || {};

  // دمج الحوار في المشاهد
  const mergedActs = scenes.acts.map(act => ({
    ...act,
    scenes: (act.scenes || []).map(scene => ({
      ...scene,
      dialogue: dialogues[scene.id] || [],
    })),
  }));

  // حساب المدة الكاملة
  const totalSeconds = mergedActs
    .flatMap(a => a.scenes)
    .reduce((s, sc) => s + (sc.duration || 60), 0);

  return {
    episode:          episodeNumber,
    title:            backbone.title,
    logline:          backbone.logline,
    theme:            backbone.theme,
    emotionalJourney: backbone.emotionalJourney,
    turningPoints:    backbone.turningPoints,
    cliffhanger:      backbone.cliffhanger,
    nextEpisodeHint:  backbone.nextEpisodeHint,
    acts:             mergedActs,
    characters,
    totalDuration:    totalSeconds,
    universeId:       universe.id,
    generatedAt:      new Date().toISOString(),
  };
}

// ══════════════════════════════════════════════════════
// الدالة الرئيسية
// ══════════════════════════════════════════════════════

export async function run(universe, episodeNumber = 1, seriesContext = null) {
  logger.info('[SCREENPLAY] Starting v2.0', {
    universe:      universe.id,
    episode:       episodeNumber,
    hasSeries:     !!seriesContext,
  });

  ensureResultsDir();

  // rule-153: تحقق من الحصة قبل البدء
  if (!canAfford('screenplay')) {
    throw new Error('InsufficientQuota: screenplay needs 3 calls');
  }

  // ── تحضير السياق ───────────────────────────
  const soul          = soulContext('screenplay-agent');
  const library       = readForAgent('screenplay-agent', 8);
  const insights      = loadInsights();
  const audienceGuide = buildAudienceGuide(insights);
  const prevContext   = buildPreviousContext(seriesContext, episodeNumber);
  const characters    = buildCharacters(universe);

  if (audienceGuide) {
    logger.info('[INFO] Audience insights loaded');
  }

  // ── الطلب 1: العمود الفقري ──────────────────
  let backbone;
  try {
    backbone = await generateBackbone(
      universe, episodeNumber, characters,
      prevContext, audienceGuide, soul
    );
  } catch (err) {
    logger.error('[ERROR] Backbone failed', { error: err.message });
    throw err;
  }

  // ── الطلب 2: المشاهد ────────────────────────
  let scenesResult;
  try {
    scenesResult = await generateScenes(universe, backbone, characters, soul, library);
  } catch (err) {
    logger.error('[ERROR] Scenes failed', { error: err.message });
    throw err;
  }

  // ── الطلب 3: الحوار ─────────────────────────
  let dialogueResult;
  try {
    dialogueResult = await generateDialogue(scenesResult, characters, backbone, soul);
  } catch (err) {
    logger.error('[ERROR] Dialogue failed', { error: err.message });
    throw err;
  }

  // ── دمج النتائج ─────────────────────────────
  const screenplay = mergeScreenplay(
    backbone, scenesResult, dialogueResult,
    characters, universe, episodeNumber
  );

  // ── حفظ الملف ───────────────────────────────
  const outputPath = join(RESULTS_DIR, `screenplay-ep${episodeNumber}.json`);
  writeFileSync(outputPath, JSON.stringify(screenplay, null, 2), 'utf8');

  const totalScenes = screenplay.acts.flatMap(a => a.scenes).length;
  const totalLines  = screenplay.acts
    .flatMap(a => a.scenes)
    .reduce((s, sc) => s + (sc.dialogue?.length || 0), 0);

  logger.info('[OK] Screenplay v2.0 done', {
    episode:  episodeNumber,
    title:    screenplay.title,
    scenes:   totalScenes,
    lines:    totalLines,
    duration: `${Math.round(screenplay.totalDuration / 60)}min`,
    geminiCalls: 3,
  });

  return screenplay;
}
