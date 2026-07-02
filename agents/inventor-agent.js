/**
 * inventor-agent.js — v2.1
 *
 * Changes from v2.0:
 *  - MAX_CYCLES_PER_DAY = 13 (was hardcoded 3 inside loop — now uses full Sunday budget ~39/40 calls)
 *  - Comments translated from Arabic to English
 *
 * Sunday: inventor only — full 40 calls budget (gate fixed in orchestrator v10.7)
 * rule-152 updated: MAX_CYCLES_PER_DAY = 13 (~39 calls, decided 2026-07-01)
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname }  from 'path';
import { fileURLToPath }  from 'url';
import { askGemini, getRemainingQuota } from './_gemini.js';
import { soulContext }    from './_soul.js';
import { readForAgent }   from './library-builder-agent.js';
import { logger }         from '../logger.js';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(__dirname, '..', 'godot-recipes');
const MEMORY_PATH = join(__dirname, '..', 'code-memory.json');

const CYCLE_COST        = 3;  // explore + build + evaluate
const MAX_CYCLES_PER_DAY = 13; // ~39/40 calls — full Sunday budget (rule-152 updated 2026-07-01)

const INVENTION_DOMAINS = [
  { id: 'movement', label: 'Movement & Physics'   },
  { id: 'shaders',  label: 'Visuals & Effects'    },
  { id: 'ai',       label: 'Enemy Intelligence'   },
  { id: 'audio',    label: 'Sound & Music'        },
  { id: 'ui',       label: 'UI & Experience'      },
  { id: 'world',    label: 'World Building'       },
  { id: 'weapons',  label: 'Weapons & Combat'     },
  { id: 'time',     label: 'Time & Memory'        },
];

const GENIUS_CRITERIA = [
  'The idea does not resemble any existing recipe',
  'The code works in Godot 4.6.2 without errors',
  'Creates an experience the player cannot forget',
  'Aligns with the universe soul',
  'Does not exceed 200 lines per recipe',
];

// ── Main ──────────────────────────────────────────────────
export async function run(universe) {
  logger.info('[INVENTOR] Awakening v2.1...');

  const soul     = soulContext('inventorAgent');
  const library  = readForAgent('inventor-agent', 12);
  const existing = loadExistingRecipes();
  const memory   = loadMemory();
  const domains  = calculateHunger(existing);

  logger.info('[INVENTOR] State', {
    existingRecipes:  existing.length,
    quotaLeft:        getRemainingQuota(),
    hungriestDomain:  domains[0].id,
    maxCycles:        MAX_CYCLES_PER_DAY,
  });

  const results = [];
  let   cycleNumber = 1;

  while (true) {
    const quota = getRemainingQuota();

    // rule-153: check quota before each cycle
    if (quota < CYCLE_COST) {
      logger.warn(`[INVENTOR] Not enough quota for full cycle — need ${CYCLE_COST}, have ${quota} — stopping`);
      break;
    }

    // rule-152: respect MAX_CYCLES_PER_DAY
    if (cycleNumber > MAX_CYCLES_PER_DAY) {
      logger.info(`[INVENTOR] Max cycles reached (${MAX_CYCLES_PER_DAY}) — stopping`);
      break;
    }

    logger.info(`[INVENTOR] Starting cycle ${cycleNumber}/${MAX_CYCLES_PER_DAY}`, { quotaLeft: quota });

    const result = await runCycle(soul, library, universe, domains, existing, memory, cycleNumber);

    if (result.invented) {
      results.push(result);
      logger.info(`[INVENTOR] Cycle ${cycleNumber} succeeded`, { name: result.name });
      existing.push({ name: result.name, domain: result.domain });
      domains.splice(0, domains.length, ...calculateHunger(existing));
    } else {
      logger.warn(`[INVENTOR] Cycle ${cycleNumber} failed`, { reason: result.reason });
    }

    cycleNumber++;
  }

  logger.info('[INVENTOR] Done', {
    cycles:    cycleNumber - 1,
    succeeded: results.length,
    quotaLeft: getRemainingQuota(),
  });

  return {
    invented:    results.length > 0,
    inventions:  results,
    totalCycles: cycleNumber - 1,
  };
}

// ── Single invention cycle ─────────────────────────────────
async function runCycle(soul, library, universe, domains, existing, memory, cycleNumber) {
  // Phase 1/3: Explore
  logger.info(`[INVENTOR] Cycle ${cycleNumber} — Phase 1/3: Explore`);
  let idea;
  try {
    idea = await explore(soul, library, universe, domains, existing, memory);
  } catch (err) {
    logger.error('[INVENTOR] Explore failed', { error: err.message });
    return { invented: false, reason: 'explore-failed' };
  }

  if (!idea?.name) {
    logger.warn('[INVENTOR] No worthy idea emerged');
    return { invented: false, reason: 'no-worthy-idea' };
  }
  logger.info(`[INVENTOR] Idea: ${idea.label}`, { domain: idea.domain });

  // Phase 2/3: Build
  if (getRemainingQuota() < 2) {
    logger.warn('[INVENTOR] Not enough quota for build+evaluate — aborting cycle');
    return { invented: false, reason: 'quota-insufficient-after-explore' };
  }

  logger.info(`[INVENTOR] Cycle ${cycleNumber} — Phase 2/3: Build`);
  let invention;
  try {
    invention = await build(soul, library, idea, universe);
  } catch (err) {
    logger.error('[INVENTOR] Build failed', { error: err.message });
    recordFailure(idea, 'build-failed', [], memory);
    return { invented: false, reason: 'build-failed' };
  }

  if (!invention?.code || typeof invention.code !== 'string' || invention.code.length < 50) {
    logger.warn('[INVENTOR] Build produced empty code');
    recordFailure(idea, 'empty-code', [], memory);
    return { invented: false, reason: 'empty-code' };
  }
  logger.info(`[INVENTOR] Built: ${invention.filename}`, { codeLength: invention.code.length });

  // Phase 3/3: Evaluate
  if (getRemainingQuota() < 1) {
    logger.warn('[INVENTOR] Not enough quota for evaluate — aborting cycle');
    return { invented: false, reason: 'quota-insufficient-before-evaluate' };
  }

  logger.info(`[INVENTOR] Cycle ${cycleNumber} — Phase 3/3: Evaluate`);
  let verdict;
  try {
    verdict = await evaluate(soul, library, idea, invention, existing);
  } catch (err) {
    logger.error('[INVENTOR] Evaluate failed', { error: err.message });
    recordFailure(idea, 'evaluate-failed', [], memory);
    return { invented: false, reason: 'evaluate-failed' };
  }

  if (!verdict?.isGenius) {
    logger.warn('[INVENTOR] Rejected', { failed: verdict?.failedCriteria });
    recordFailure(idea, 'not-genius', verdict?.failedCriteria || [], memory);
    return { invented: false, reason: 'not-genius', criteria: verdict?.failedCriteria };
  }

  // Publish
  logger.info(`[INVENTOR] Publishing: ${idea.label}`);
  publish(idea, invention, verdict, memory);

  return {
    invented:  true,
    name:      idea.name,
    label:     idea.label,
    domain:    idea.domain,
    filename:  invention.filename,
    impact:    verdict.impact,
    score:     verdict.score,
    verdict:   verdict.verdict,
  };
}

// ── Phase 1: Explore ──────────────────────────────────────
async function explore(soul, library, universe, domains, existing, memory) {
  const hungriestDomain = domains[0];
  const existingNames   = existing.map(r => r.name).join(', ') || 'none yet';
  const recentFailures  = (memory['error-log'] || [])
    .filter(e => e.date >= getDateDaysAgo(7))
    .map(e => e.description)
    .slice(0, 5)
    .join(' | ') || 'none';

  return await askGemini(`${soul}
${library}

You are the Inventor — a mind searching for hidden essence in Godot 4.6.2.

Library state:
- Existing recipes: ${existingNames}
- Hungriest domain: ${hungriestDomain.label}
- Recent failures: ${recentFailures}
- Universe soul: "${universe?.soul?.essence || 'unknown cosmos'}"

Task: propose ONE invention idea in the domain "${hungriestDomain.label}".

Golden rules:
- Do not propose what already exists
- The idea makes the player feel something they have never felt before
- It exploits a real Godot 4.6.2 capability
- It harmonizes with the universe soul

Return JSON only — no text outside JSON:
{
  "name":               "invention name in English (slug)",
  "label":              "poetic name",
  "domain":             "${hungriestDomain.id}",
  "godotFeature":       "Godot 4.6.2 feature used",
  "poeticVision":       "poetic description of what the player will feel",
  "technicalApproach":  "technical approach briefly",
  "uniqueness":         "why it resembles nothing existing"
}`,
    0.95,
    { maxOutputTokens: 4096, topP: 0.98 },
    'inventor-agent'
  );
}

// ── Phase 2: Build ────────────────────────────────────────
async function build(soul, library, idea, universe) {
  return await askGemini(`${soul}
${library}

You are the Inventor — now you build without compromise.

Invention: "${idea.label}"
Vision: ${idea.poeticVision}
Technical approach: ${idea.technicalApproach}
Godot feature: ${idea.godotFeature}
Universe soul: ${universe?.soul?.essence || ''}

Write the complete recipe — no shortcutting — no omissions.

Strict rules:
- Godot 4.6.2 only — nothing from Godot 3.x
- Tabs for indentation — not spaces
- Each function has one clear purpose
- No dead code or redundant comments
- Recipe works standalone
- Under 200 lines
- If shader: write correct GLSL for Godot 4.6.2

Return JSON only — no text outside JSON:
{
  "filename":     "${idea.name}.gd or ${idea.name}.gdshader",
  "language":     "gdscript or glsl",
  "code":         "complete code here — no shortcutting",
  "usage":        "how code-agent uses this recipe",
  "parameters":   [{ "name": "...", "type": "...", "default": "...", "description": "..." }],
  "dependencies": ["required nodes or other files"]
}`,
    0.2,
    { maxOutputTokens: 32768, topP: 0.85 },
    'inventor-agent'
  );
}

// ── Phase 3: Evaluate ─────────────────────────────────────
async function evaluate(soul, library, idea, invention, existing) {
  const existingNames = existing.slice(0, 5).map(r => r.name).join(', ');

  return await askGemini(`${soul}
${library}

You are the Supreme Judge of Genius in this universe.
Be harsh — genius is rare.

Submitted invention:
Name: ${idea.label}
Vision: ${idea.poeticVision}
Complete code:
${invention.code}

Existing recipes: ${existingNames}

Evaluate against the golden criteria:
${GENIUS_CRITERIA.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Return JSON only — no text outside JSON:
{
  "isGenius":       true,
  "score":          0,
  "passedCriteria": ["..."],
  "failedCriteria": ["..."],
  "impact":         "how this will change the player experience",
  "verdict":        "poetic verdict in one sentence"
}`,
    0.3,
    { maxOutputTokens: 4096 },
    'inventor-agent'
  );
}

// ── Publish ───────────────────────────────────────────────
function publish(idea, invention, verdict, memory) {
  const domainDir = join(RECIPES_DIR, idea.domain);
  if (!existsSync(domainDir)) mkdirSync(domainDir, { recursive: true });

  writeFileSync(join(domainDir, invention.filename), invention.code, 'utf8');

  const meta = {
    name:         idea.name,
    label:        idea.label,
    domain:       idea.domain,
    godotFeature: idea.godotFeature,
    poeticVision: idea.poeticVision,
    usage:        invention.usage,
    parameters:   invention.parameters  || [],
    dependencies: invention.dependencies || [],
    verdict:      verdict.verdict,
    impact:       verdict.impact,
    score:        verdict.score,
    inventedAt:   new Date().toISOString(),
  };

  writeFileSync(
    join(domainDir, `${idea.name}.meta.json`),
    JSON.stringify(meta, null, 2), 'utf8'
  );

  updateLibraryIndex(meta);
  recordInvention(idea, invention, verdict, memory);

  logger.info('[OK] Invention published', {
    name:   idea.name,
    domain: idea.domain,
    file:   invention.filename,
    score:  verdict.score,
  });
}

// ── Helpers ───────────────────────────────────────────────
function loadExistingRecipes() {
  if (!existsSync(RECIPES_DIR)) { mkdirSync(RECIPES_DIR, { recursive: true }); return []; }
  const recipes = [];
  for (const domain of INVENTION_DOMAINS) {
    const dir = join(RECIPES_DIR, domain.id);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter(f => f.endsWith('.meta.json'))) {
      try { recipes.push(JSON.parse(readFileSync(join(dir, file), 'utf8'))); } catch {}
    }
  }
  return recipes;
}

function loadMemory() {
  if (!existsSync(MEMORY_PATH)) return { rules: [], 'error-log': [], inventions: [] };
  try { return JSON.parse(readFileSync(MEMORY_PATH, 'utf8')); }
  catch { return { rules: [], 'error-log': [], inventions: [] }; }
}

function calculateHunger(existing) {
  const counts = {};
  for (const d of INVENTION_DOMAINS) counts[d.id] = 0;
  for (const r of existing) if (counts[r.domain] !== undefined) counts[r.domain]++;
  return INVENTION_DOMAINS
    .map(d => ({ ...d, hunger: counts[d.id] }))
    .sort((a, b) => a.hunger - b.hunger);
}

function updateLibraryIndex(meta) {
  const indexPath = join(RECIPES_DIR, 'index.json');
  let index = [];
  if (existsSync(indexPath)) { try { index = JSON.parse(readFileSync(indexPath, 'utf8')); } catch {} }
  index = index.filter(r => r.name !== meta.name);
  index.unshift(meta);
  writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
}

function recordInvention(idea, invention, verdict, memory) {
  if (!memory.inventions) memory.inventions = [];
  memory.inventions.unshift({
    name:     idea.name,
    domain:   idea.domain,
    score:    verdict.score,
    verdict:  verdict.verdict,
    filename: invention.filename,
    date:     new Date().toISOString().slice(0, 10),
  });
  writeFileSync(MEMORY_PATH, JSON.stringify(memory, null, 2), 'utf8');
}

function recordFailure(idea, reason, details, memory) {
  const log    = memory['error-log'] || [];
  const lastId = log.length > 0
    ? parseInt(log[0].id?.replace('err-', '') || 200) + 1
    : 200;
  log.unshift({
    id:          `err-${lastId}`,
    date:        new Date().toISOString().slice(0, 10),
    severity:    'low',
    description: `inventor-agent: ${reason} — ${idea?.name || 'unknown'} — ${(details || []).join(', ')}`,
    fixed:       false,
  });
  memory['error-log'] = log;
  writeFileSync(MEMORY_PATH, JSON.stringify(memory, null, 2), 'utf8');
}

function getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
