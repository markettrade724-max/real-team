/**
 * screenplay-agent.js — v2.2
 *
 * التغييرات عن v2.1:
 *  - الكتابة بالإنجليزية بدل العربية — يحل مشكلة استقرار Edge TTS
 *  - الأصوات في buildCharacters → en-US-* / en-GB-* بدل ar-*
 *  - كل الـ prompts والمخرجات JSON بالإنجليزية
 *  - باقي البنية كما v2.1: 3 خطوات، حفظ فوري، استئناف من fromStep
 *
 * القواعد المطبقة:
 *  rule-056 : soulContext قبل كل عمل
 *  rule-087 : askGemini(prompt, temp, options, caller)
 *  rule-089 : كل الردود JSON
 *  rule-097 : لا تغيير للنموذج
 *  rule-098 : askGemini فقط
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-100 : soulContext يُرجع string
 *  rule-101 : maxOutputTokens لا maxTokens
 *  rule-102 : لا JSON.parse
 *  rule-128 : caller logging
 *  rule-131 : يقرأ audience-insights.json قبل الكتابة
 *  rule-139 : 3 طلبات: backbone → scenes → dialogue
 *  rule-140 : maxOutputTokens: backbone=4096 / scenes=32768 / dialogue=32768
 *  rule-141 : temperature: backbone=0.6 / scenes=0.5 / dialogue=0.7
 *  rule-142 : library في prompt منفصل عن soul
 *  rule-188 : كل خطوة تُحفظ فور اكتمالها
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { askGemini, canAfford, getRemainingQuota } from './_gemini.js';
import { soulContext }  from './_soul.js';
import { readForAgent } from './library-builder-agent.js';
import { logger }       from '../logger.js';

const __dirname     = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR   = join(__dirname, '..', 'agent-results');
const INSIGHTS_PATH = join(RESULTS_DIR, 'audience-insights.json');

// ═══════════════════════════════════════════════════════
// ثوابت الخطوات
// ═══════════════════════════════════════════════════════
const STEPS       = ['backbone', 'scenes', 'dialogue'];
const STEP_COSTS  = { backbone: 1, scenes: 1, dialogue: 1 };

// ═══════════════════════════════════════════════════════
// أدوات مساعدة
// ═══════════════════════════════════════════════════════
function ensureResultsDir() {
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });
}

function stepFile(episodeNumber, step) {
  return join(RESULTS_DIR, `screenplay-${step}-ep${episodeNumber}.json`);
}

function saveStep(episodeNumber, step, data) {
  writeFileSync(stepFile(episodeNumber, step), JSON.stringify(data, null, 2), 'utf8');
  logger.info(`[SCREENPLAY] Step saved to disk: ${step}-ep${episodeNumber}`);
}

function loadStep(episodeNumber, step) {
  const p = stepFile(episodeNumber, step);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function loadInsights() {
  if (!existsSync(INSIGHTS_PATH)) return null;
  try { return JSON.parse(readFileSync(INSIGHTS_PATH, 'utf8')); } catch { return null; }
}

function buildAudienceGuide(insights) {
  if (!insights?.recommendations?.forStoryAgent?.length) return '';
  return insights.recommendations.forStoryAgent.map(r => `- ${r}`).join('\n');
}

function buildPreviousContext(seriesContext, episodeNumber) {
  if (!seriesContext?.previousEpisodes?.length) {
    return 'This is the first episode — start with a pace that builds the world and introduces the hero.';
  }
  return seriesContext.previousEpisodes.slice(-3)
    .map(e => `- Episode ${e.number}: ${e.summary}`).join('\n');
}

function buildCharacters(universe) {
  const chars = [];

  const proto = universe.soul?.protagonist;
  chars.push({
    name:        proto?.name        || 'The Hero',
    role:        'protagonist',
    description: proto?.description || universe.soul?.essence || 'A hero of uncertain fate',
    arc:         proto?.arc         || 'From doubt to certainty',
    flaw:        proto?.flaw        || 'Fear of loss',
    voice:       'en-US-GuyNeural',
  });

  const enemies = universe.worlds?.[0]?.enemies || [];
  for (const enemy of enemies.slice(0, 2)) {
    chars.push({
      name:        enemy.name?.en || enemy.name?.ar || 'The Enemy',
      role:        'antagonist',
      description: enemy.description || enemy.behavior || 'A mysterious foe',
      arc:         enemy.arc  || 'A merciless force',
      flaw:        enemy.flaw || 'Destructive pride',
      voice:       'en-US-AriaNeural',
    });
  }

  if (universe.soul?.companion) {
    chars.push({
      name:        universe.soul.companion.name || 'The Companion',
      role:        'supporting',
      description: universe.soul.companion.description || 'The voice of reason',
      arc:         universe.soul.companion.arc  || 'From hesitation to faith',
      flaw:        universe.soul.companion.flaw || 'Excessive trust',
      voice:       'en-GB-RyanNeural',
    });
  } else if (chars.length < 3) {
    chars.push({
      name:        'The Companion',
      role:        'supporting',
      description: 'The hero\'s companion — carries secrets revealed later',
      arc:         'From hesitation to faith',
      flaw:        'Hides a truth that will change the story\'s course',
      voice:       'en-GB-RyanNeural',
    });
  }

  return chars;
}

// ═══════════════════════════════════════════════════════
// الطلب 1 — العمود الفقري
// ═══════════════════════════════════════════════════════
async function generateBackbone(universe, episodeNumber, characters, prevContext, audienceGuide, soul) {
  logger.info('[SCREENPLAY] Step 1/3 — Backbone');

  const prompt = `
You are a professional screenwriter in the tradition of McKee, Syd Field, and Truby.

Universe: "${universe.name?.en || universe.name?.ar}"
Essence: "${universe.soul?.essence}"
Physical law: "${universe.worlds?.[0]?.physics || 'unspecified'}"
Previous context: ${prevContext}
${audienceGuide ? `\nAudience guidance:\n${audienceGuide}` : ''}

Characters:
${characters.map(c => `- ${c.name} (${c.role}): ${c.description} | arc: ${c.arc} | flaw: ${c.flaw}`).join('\n')}

Write the backbone for episode ${episodeNumber}.

Structure rules:
- Act 1 (25%): world setup + conflict introduction
- Act 2 (50%): escalation + point of no return
- Act 3 (25%): climax + cliffhanger ending

Output JSON only — no text outside the JSON:
{
  "episode":          ${episodeNumber},
  "title":            "Episode title",
  "logline":          "One sentence summarizing the episode",
  "theme":            "The core theme",
  "emotionalJourney": "The emotional arc from start to end",
  "acts": [
    { "act": 1, "name": "Setup",       "summary": "3 sentences", "emotionalArc": "mood", "sceneCount": 3 },
    { "act": 2, "name": "Confrontation", "summary": "3 sentences", "emotionalArc": "mood", "sceneCount": 5 },
    { "act": 3, "name": "Resolution",  "summary": "3 sentences", "emotionalArc": "mood", "sceneCount": 3 }
  ],
  "turningPoints":   ["first turning point", "point of no return", "climax"],
  "cliffhanger":     "description of the episode's hook ending",
  "nextEpisodeHint":   "a vague hint for the next episode"
}`;

  const result = await askGemini(
    `${soul}\n\n${prompt}`,
    0.6, { maxOutputTokens: 4096, topP: 0.85 }, 'screenplay-agent'
  );

  if (!result?.acts?.length || result.acts.length < 3) {
    throw new Error('Backbone invalid — missing acts');
  }

  logger.info('[OK] Backbone done', { title: result.title, theme: result.theme });
  return result;
}

// ═══════════════════════════════════════════════════════
// الطلب 2 — المشاهد
// ═══════════════════════════════════════════════════════
async function generateScenes(universe, backbone, characters, soul, library) {
  logger.info('[SCREENPLAY] Step 2/3 — Scenes');

  const sceneList = backbone.acts.map(act => ({
    act:       act.act,
    name:      act.name,
    summary:   act.summary,
    emotional: act.emotionalArc,
    count:     act.sceneCount || 3,
  }));

  const prompt = `
${library}

Universe: "${universe.name?.en || universe.name?.ar}"
Episode title: "${backbone.title}"
Theme: "${backbone.theme}"

Turning points:
${backbone.turningPoints.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Characters: ${characters.map(c => c.name).join(' / ')}

Act structure:
${sceneList.map(a => `Act ${a.act} — ${a.name} (${a.count} scenes):\n  ${a.summary}\n  Mood: ${a.emotional}`).join('\n\n')}

Write the details for every scene.

Rules per scene: one dramatic goal / cinematic camera / emotional lighting / duration 45-120s / sfx / music.
The "time" field must be exactly one of: "day", "night", "dawn", "dusk" (lowercase, no other words).

Output JSON only:
{
  "acts": [
    {
      "act": 1, "name": "Setup",
      "scenes": [
        {
          "id": "S01", "location": "the place", "time": "day",
          "mood": "the mood", "goal": "the dramatic goal", "duration": 60,
          "camera": "camera description", "lighting": "lighting description",
          "action": "action and movement", "sfx": "sound effects", "music": "music description"
        }
      ]
    }
  ]
}`;

  const result = await askGemini(
    `${soul}\n\n${prompt}`,
    0.5, { maxOutputTokens: 32768, topP: 0.85 }, 'screenplay-agent'
  );

  if (!result?.acts?.length) throw new Error('Scenes invalid — missing acts');

  const totalScenes = result.acts.flatMap(a => a.scenes || []).length;
  logger.info('[OK] Scenes done', { totalScenes });
  return result;
}

// ═══════════════════════════════════════════════════════
// الطلب 3 — الحوار
// ═══════════════════════════════════════════════════════
async function generateDialogue(scenes, characters, backbone, soul) {
  logger.info('[SCREENPLAY] Step 3/3 — Dialogue');

  const sceneIds = scenes.acts
    .flatMap(a => a.scenes || [])
    .map(s => `${s.id}: ${s.goal} | ${s.location} | ${s.mood}`)
    .join('\n');

  const charProfiles = characters
    .map(c => `- ${c.name} (${c.role}): ${c.description} | flaw: ${c.flaw} | arc: ${c.arc}`)
    .join('\n');

  const prompt = `
You are a professional dialogue writer. Dialogue reveals character — it does not explain plot.

Episode title: "${backbone.title}"
Theme: "${backbone.theme}"
Emotional arc: "${backbone.emotionalJourney}"

Characters:
${charProfiles}

Scenes:
${sceneIds}

Dialogue rules: lines reveal character / no clichés / a distinct voice for each character /
short sentences under tension / precise acting direction.

Output JSON only:
{
  "dialogues": {
    "S01": [
      {
        "character":  "character name",
        "line":       "the dialogue",
        "emotion":    "the emotional state",
        "direction":  "acting direction"
      }
    ]
  }
}`;

  const result = await askGemini(
    `${soul}\n\n${prompt}`,
    0.7, { maxOutputTokens: 32768, topP: 0.92 }, 'screenplay-agent'
  );

  if (!result?.dialogues || !Object.keys(result.dialogues).length) {
    throw new Error('Dialogue invalid — empty dialogues');
  }

  const totalLines = Object.values(result.dialogues).reduce((s, l) => s + l.length, 0);
  logger.info('[OK] Dialogue done', { totalLines });
  return result;
}

// ═══════════════════════════════════════════════════════
// دمج النتائج
// ═══════════════════════════════════════════════════════
function mergeScreenplay(backbone, scenes, dialogue, characters, universe, episodeNumber) {
  const dialogues    = dialogue.dialogues || {};
  const mergedActs   = scenes.acts.map(act => ({
    ...act,
    scenes: (act.scenes || []).map(scene => ({
      ...scene,
      dialogue: dialogues[scene.id] || [],
    })),
  }));
  const totalSeconds = mergedActs.flatMap(a => a.scenes)
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
    language:         'en',
    generatedAt:      new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════
// الدالة الرئيسية
// ═══════════════════════════════════════════════════════
/**
 * @param {object} universe
 * @param {number} episodeNumber
 * @param {object|null} options
 *   - إذا كان { previousEpisodes } → seriesContext للحلقات السابقة
 *   - إذا كان { fromStep, existingData } → استئناف من خطوة محددة
 */
export async function run(universe, episodeNumber = 1, options = null) {
  const seriesContext = options?.previousEpisodes ? options : null;
  const fromStep      = options?.fromStep || 'backbone';
  const startIndex    = STEPS.indexOf(fromStep);

  if (startIndex === -1) {
    throw new Error(`Invalid fromStep: ${fromStep}. Must be one of: ${STEPS.join(', ')}`);
  }

  const remainingSteps = STEPS.slice(startIndex);
  const neededCalls    = remainingSteps.reduce((s, step) => s + STEP_COSTS[step], 0);

  logger.info('[SCREENPLAY] Starting v2.2 (English)', {
    universe:   universe.id,
    episode:    episodeNumber,
    fromStep,
    neededCalls,
    quotaLeft:  getRemainingQuota(),
  });

  ensureResultsDir();

  if (getRemainingQuota() < neededCalls) {
    throw new Error(`InsufficientQuota: need ${neededCalls} calls for steps [${remainingSteps.join(',')}]`);
  }

  const soul          = soulContext('screenplay-agent');
  const library       = readForAgent('screenplay-agent', 8);
  const insights      = loadInsights();
  const audienceGuide = buildAudienceGuide(insights);
  const prevContext   = buildPreviousContext(seriesContext, episodeNumber);
  const characters    = buildCharacters(universe);

  if (audienceGuide) logger.info('[INFO] Audience insights loaded');

  // ── الخطوة 1: العمود الفقري ─────────────────
  let backbone;
  if (fromStep === 'backbone') {
    try {
      backbone = await generateBackbone(
        universe, episodeNumber, characters, prevContext, audienceGuide, soul
      );
      saveStep(episodeNumber, 'backbone', backbone);
    } catch (err) {
      logger.error('[ERROR] Backbone failed', { error: err.message });
      throw err;
    }
  } else {
    backbone = loadStep(episodeNumber, 'backbone');
    if (!backbone) throw new Error(`Backbone not found on disk for ep${episodeNumber} — cannot start from '${fromStep}'`);
    logger.info('[SCREENPLAY] Backbone loaded from disk', { title: backbone.title });
  }

  // ── الخطوة 2: المشاهد ───────────────────────
  let scenesResult;
  if (['backbone', 'scenes'].includes(fromStep)) {
    try {
      scenesResult = await generateScenes(universe, backbone, characters, soul, library);
      saveStep(episodeNumber, 'scenes', scenesResult);
    } catch (err) {
      logger.error('[ERROR] Scenes failed', { error: err.message });
      throw err;
    }
  } else {
    scenesResult = loadStep(episodeNumber, 'scenes');
    if (!scenesResult) throw new Error(`Scenes not found on disk for ep${episodeNumber} — cannot start from 'dialogue'`);
    logger.info('[SCREENPLAY] Scenes loaded from disk', { acts: scenesResult.acts?.length });
  }

  // ── الخطوة 3: الحوار ────────────────────────
  let dialogueResult;
  try {
    dialogueResult = await generateDialogue(scenesResult, characters, backbone, soul);
  } catch (err) {
    logger.error('[ERROR] Dialogue failed', { error: err.message });
    throw err;
  }

  // ── دمج + حفظ ───────────────────────────────
  const screenplay = mergeScreenplay(
    backbone, scenesResult, dialogueResult, characters, universe, episodeNumber
  );

  const outputPath = join(RESULTS_DIR, `screenplay-ep${episodeNumber}.json`);
  writeFileSync(outputPath, JSON.stringify(screenplay, null, 2), 'utf8');

  const totalScenes = screenplay.acts.flatMap(a => a.scenes).length;
  const totalLines  = screenplay.acts.flatMap(a => a.scenes)
    .reduce((s, sc) => s + (sc.dialogue?.length || 0), 0);

  logger.info('[OK] Screenplay v2.2 done', {
    episode:    episodeNumber,
    title:      screenplay.title,
    scenes:     totalScenes,
    lines:      totalLines,
    duration:   `${Math.round(screenplay.totalDuration / 60)}min`,
    fromStep,
    callsUsed:  neededCalls,
  });

  return screenplay;
}
