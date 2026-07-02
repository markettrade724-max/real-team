/**
 * screenplay-agent.js — v2.3
 *
 * Changes from v2.2:
 *  - generateScenes: "mood" field now constrained to approved enum (err-219 fix)
 *    Values: "tense" | "urgent" | "dread" | "desperate" | "triumphant" | "calm"
 *    Aligns with new MOOD_MAP keys in scene-agent v1.2 and visual-agent v3.0
 *  - buildCharacters: removed voice field (Edge-TTS relict — voice-agent v4.0 ignores it anyway)
 *  - Comments translated from Arabic to English
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

const STEPS      = ['backbone', 'scenes', 'dialogue'];
const STEP_COSTS = { backbone: 1, scenes: 1, dialogue: 1 };

// ── Utilities ─────────────────────────────────────────────
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
    return 'This is the first episode — open immediately on Lyra in physical danger.';
  }
  return seriesContext.previousEpisodes.slice(-3)
    .map(e => `- Episode ${e.number}: ${e.summary}`).join('\n');
}

// ── Build characters from universe ────────────────────────
// voice field removed (v2.3) — voice-agent v4.0 maps by role, not by name
function buildCharacters(universe) {
  const chars = [];

  const proto = universe.soul?.protagonist;
  chars.push({
    name:        proto?.name        || 'Lyra',
    role:        'protagonist',
    description: proto?.description || universe.soul?.essence || 'A survivor of the memory ruins',
    arc:         proto?.arc         || 'From self-preservation to legacy',
    flaw:        proto?.flaw        || 'Hoards memory shards instead of using them',
  });

  const enemies = universe.worlds?.[0]?.enemies || [];
  for (const enemy of enemies.slice(0, 2)) {
    chars.push({
      name:        enemy.name?.en || 'Silence Hunter',
      role:        'antagonist',
      description: enemy.concept || enemy.behavior || 'A physical manifestation of the Silence',
      arc:         'A merciless force that believes it protects what it devours',
      flaw:        'Cannot understand why Lyra keeps fighting for memories it considers trash',
    });
  }

  const companion = universe.soul?.companion;
  if (companion) {
    chars.push({
      name:        companion.name        || 'Kael',
      role:        'supporting',
      description: companion.description || 'An echo voice inside Lyra\'s memory shards',
      arc:         companion.arc         || 'From acceptance of non-existence to fighting for survival',
      flaw:        companion.flaw        || 'Hesitates to warn Lyra when danger feels too familiar',
    });
  } else {
    chars.push({
      name:        'Kael',
      role:        'supporting',
      description: 'A voice that exists only inside certain recovered memory shards',
      arc:         'From resigned acceptance to choosing to fight',
      flaw:        'Part of him still recognizes the Silence as home',
    });
  }

  return chars;
}

// ── Step 1/3: Backbone ────────────────────────────────────
async function generateBackbone(universe, episodeNumber, characters, prevContext, audienceGuide, soul) {
  logger.info('[SCREENPLAY] Step 1/3 — Backbone');

  const prompt = `
You are a professional screenwriter in the tradition of McKee, Syd Field, and Truby.

Universe: "${universe.name?.en || 'Memory Shards Saga'}"
Essence: "${universe.soul?.essence}"
Physical law: "${universe.worlds?.[0]?.physics || 'memories have physical weight and can be touched'}"
Previous context: ${prevContext}
${audienceGuide ? `\nAudience guidance:\n${audienceGuide}` : ''}

Characters:
${characters.map(c => `- ${c.name} (${c.role}): ${c.description} | arc: ${c.arc} | flaw: ${c.flaw}`).join('\n')}

Write the backbone for episode ${episodeNumber}.

CRITICAL: Lyra must be in physical danger in the FIRST LINE of Act 1. The Silence's hunters must be present or approaching. No calm opening.

Structure rules:
- Act 1 (25%): Lyra already in danger + memory shard at immediate stake
- Act 2 (50%): escalation + physical survival obstacle + identity cost
- Act 3 (25%): climax + cliffhanger (a memory lost OR the Silence reveals it knows her next move)

Return JSON only — no text outside JSON:
{
  "episode":          ${episodeNumber},
  "title":            "Episode title",
  "logline":          "One sentence — Lyra in danger with identity stakes",
  "theme":            "The core theme (one sentence)",
  "emotionalJourney": "The emotional arc from start to end",
  "acts": [
    { "act": 1, "name": "Immediate Danger",    "summary": "3 sentences", "emotionalArc": "mood", "sceneCount": 3 },
    { "act": 2, "name": "Escalation",          "summary": "3 sentences", "emotionalArc": "mood", "sceneCount": 5 },
    { "act": 3, "name": "Cliffhanger",         "summary": "3 sentences", "emotionalArc": "mood", "sceneCount": 3 }
  ],
  "turningPoints":   ["first turning point", "point of no return", "climax"],
  "cliffhanger":     "what Lyra loses or what the Silence reveals",
  "nextEpisodeHint": "a vague hint for the next episode"
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

// ── Step 2/3: Scenes ──────────────────────────────────────
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

Universe: "${universe.name?.en || 'Memory Shards Saga'}"
Episode title: "${backbone.title}"
Theme: "${backbone.theme}"

Turning points:
${backbone.turningPoints.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Characters: ${characters.map(c => c.name).join(' / ')}

Act structure:
${sceneList.map(a => `Act ${a.act} — ${a.name} (${a.count} scenes):\n  ${a.summary}\n  Mood: ${a.emotional}`).join('\n\n')}

Write the details for every scene.

Rules per scene:
- One dramatic survival goal per scene
- Cinematic camera angle
- Emotional lighting tied to physical action
- Duration 45-120 seconds
- Sound effects and music
- The "time" field MUST be exactly one of: "day" | "night" | "dawn" | "dusk" (lowercase only)
- The "mood" field MUST be exactly one of: "tense" | "urgent" | "dread" | "desperate" | "triumphant" | "calm" (lowercase only)

Return JSON only:
{
  "acts": [
    {
      "act": 1, "name": "Immediate Danger",
      "scenes": [
        {
          "id": "S01",
          "location": "the place",
          "time": "night",
          "mood": "tense",
          "goal": "the dramatic survival goal",
          "duration": 60,
          "camera": "camera description",
          "lighting": "lighting description",
          "action": "action and movement — physical, urgent",
          "sfx": "sound effects",
          "music": "music description"
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

// ── Step 3/3: Dialogue ────────────────────────────────────
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
You are a professional dialogue writer. Dialogue reveals character — it never explains plot.
CRITICAL: All lines must be SHORT and REACTIVE — fragments under pressure, never monologues.
Kael (supporting) speaks ONLY from memory shards — his lines feel like echoes, not direct conversation.

Episode title: "${backbone.title}"
Theme: "${backbone.theme}"
Emotional arc: "${backbone.emotionalJourney}"

Characters:
${charProfiles}

Scenes:
${sceneIds}

Rules:
- Lines reveal character in crisis — no clichés
- Distinct voice per character (Lyra: short/desperate, Kael: echo-like/uncertain, antagonist: cold/inevitable)
- Short sentences under tension — maximum 10 words per line when in action
- Precise acting direction

Return JSON only:
{
  "dialogues": {
    "S01": [
      {
        "character":  "character name",
        "line":       "the dialogue line",
        "emotion":    "one of: tense | urgent | dread | desperate | triumphant | calm",
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

// ── Merge all steps ───────────────────────────────────────
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

// ── Main export ───────────────────────────────────────────
export async function run(universe, episodeNumber = 1, options = null) {
  const seriesContext = options?.previousEpisodes ? options : null;
  const fromStep      = options?.fromStep || 'backbone';
  const startIndex    = STEPS.indexOf(fromStep);

  if (startIndex === -1) {
    throw new Error(`Invalid fromStep: ${fromStep}. Must be one of: ${STEPS.join(', ')}`);
  }

  const remainingSteps = STEPS.slice(startIndex);
  const neededCalls    = remainingSteps.reduce((s, step) => s + STEP_COSTS[step], 0);

  logger.info('[SCREENPLAY] Starting v2.3', {
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

  // Step 1: Backbone
  let backbone;
  if (fromStep === 'backbone') {
    try {
      backbone = await generateBackbone(universe, episodeNumber, characters, prevContext, audienceGuide, soul);
      saveStep(episodeNumber, 'backbone', backbone);
    } catch (err) {
      logger.error('[ERROR] Backbone failed', { error: err.message });
      throw err;
    }
  } else {
    backbone = loadStep(episodeNumber, 'backbone');
    if (!backbone) throw new Error(`Backbone not found on disk for ep${episodeNumber}`);
    logger.info('[SCREENPLAY] Backbone loaded from disk', { title: backbone.title });
  }

  // Step 2: Scenes
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
    if (!scenesResult) throw new Error(`Scenes not found on disk for ep${episodeNumber}`);
    logger.info('[SCREENPLAY] Scenes loaded from disk', { acts: scenesResult.acts?.length });
  }

  // Step 3: Dialogue
  let dialogueResult;
  try {
    dialogueResult = await generateDialogue(scenesResult, characters, backbone, soul);
  } catch (err) {
    logger.error('[ERROR] Dialogue failed', { error: err.message });
    throw err;
  }

  // Merge + save
  const screenplay = mergeScreenplay(backbone, scenesResult, dialogueResult, characters, universe, episodeNumber);
  const outputPath = join(RESULTS_DIR, `screenplay-ep${episodeNumber}.json`);
  writeFileSync(outputPath, JSON.stringify(screenplay, null, 2), 'utf8');

  const totalScenes = screenplay.acts.flatMap(a => a.scenes).length;
  const totalLines  = screenplay.acts.flatMap(a => a.scenes)
    .reduce((s, sc) => s + (sc.dialogue?.length || 0), 0);

  logger.info('[OK] Screenplay v2.3 done', {
    episode:   episodeNumber,
    title:     screenplay.title,
    scenes:    totalScenes,
    lines:     totalLines,
    duration:  `${Math.round(screenplay.totalDuration / 60)}min`,
    fromStep,
    callsUsed: neededCalls,
  });

  return screenplay;
}
