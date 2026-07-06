/**
 * orchestrator.js — v10.7
 *
 * Changes from v10.5:
 *  - inventorDay(): gate fixed — was hasEnoughQuota('inventor') → getRemainingQuota() >= 3 (err-213)
 *  - screenplayAndProductionDay(): new — screenplay + production in same run (no 1-week backlog)
 *  - gameFixDay(): new — Thursday game correction (3 calls, Memory Shards Saga pilot)
 *  - artLibraryDay(): new — Saturday/Thursday/Friday art asset pre-generation (no Gemini)
 *  - TASK_MAP updated: Saturday=art-library, Tuesday=game-fix, Thursday=art-library, Friday=art-library
 *  - visual-agent.run() now receives universe as third argument (v3.0 requirement)
 *  - Comments translated to English
 *
 * Weekly schedule v10.7:
 *   Saturday  (6) → art-library   (0 Gemini, pre-generate art assets)
 *   Sunday    (0) → inventor       (39 Gemini, fixed gate)
 *   Monday    (1) → screenplay-production (3 Gemini screenplay + 0 production, full episode)
 *   Tuesday   (2) → game-fix       (3 Gemini, Memory Shards Saga correction)
 *   Wednesday (3) → screenplay-production (3 Gemini + 0 production, second episode)
 *   Thursday  (4) → art-library    (0 Gemini)
 *   Friday    (5) → art-library    (0 Gemini)
 */

import { writeFileSync, readFileSync, copyFileSync,
         mkdirSync, existsSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { execSync }       from 'child_process';
import { logger }         from './logger.js';
import {
  canAfford, getBudgetStatus, getRemainingQuota,
  selectKeyForTask, resetSessionKey,
} from './agents/_gemini.js';
import { run as runLibrary, getLibraryStatus } from './agents/library-builder-agent.js';
import { run as runScreenplay }                from './agents/screenplay-agent.js';
import { run as runVoice }                     from './agents/voice-agent.js';
import { run as runSubtitle }                  from './agents/subtitle-agent.js';
import { run as runVisual }                    from './agents/visual-agent.js';
import { run as runScene }                     from './agents/scene-agent.js';
import { run as runMusic }                     from './agents/music-agent.js';
import { run as runEdit }                      from './agents/edit-agent.js';
import { run as runTrailer }                   from './agents/trailer-agent.js';
import { run as runUpload }                    from './agents/upload-agent.js';
import { run as runAnalytics }                 from './agents/analytics-agent.js';
import { run as runArtLibrary }                from './agents/art-library-agent.js';
import {
  loadProgress,
  startEpisode,    completeEpisode,
  startGame,       completeGame,
  saveEpisodeStep, getEpisodeProgress,
  saveGameFile,    getGameProgress,
  failTask,
} from './scripts/progress.js';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR  = join(__dirname, 'agent-results');
const UNIVERSE     = join(__dirname, 'universe.json');
const UNIVERSE_BAK = join(__dirname, 'universe.backup.json');
const SERIES_PATH  = join(__dirname, 'series.json');

if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

const DELAY   = 15000;
const TIMEOUT = 600000;

// Memory Shards Saga confirmed slug (universe.json id = 'memory-shards-saga')
const GAME_FIX_PILOT_SLUG = 'memory-shards-saga';

const save  = (file, data) =>
  writeFileSync(join(RESULTS_DIR, file), JSON.stringify(data, null, 2), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt   = ms => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

const DAY       = new Date().getDay();
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// Weekly schedule v10.7
const TASK_MAP = {
  6: 'art-library',             // Saturday: was library (100% complete) → art pre-generation
  0: 'inventor',                // Sunday: inventor (gate fixed — err-213)
  1: 'screenplay-production',   // Monday: full episode (screenplay + production same run)
  2: 'game-fix',                // Tuesday: Memory Shards Saga correction
  3: 'screenplay-production',   // Wednesday: second full episode
  4: 'art-library',             // Thursday: freed from game-phase1
  5: 'art-library',             // Friday: freed from game-phase2
};

const TASK_COST = {
  'art-library':           0,  // Pollinations API — no Gemini
  inventor:               40,  // checked differently (getRemainingQuota >= 3, not selectKeyForTask)
  'screenplay-production': 3,  // only screenplay step consumes Gemini (3 calls)
  'game-fix':              3,
  'game-phase1':           4,  // kept for manual MODE=game-phase1 override
  'game-phase2':           5,
  library:                40,
  production:              0,
};

const EPISODE_STEPS = ['backbone', 'scenes', 'dialogue'];

function getDayTask() { return TASK_MAP[DAY] ?? 'art-library'; }

logger.info('[SCHEDULE] Today', {
  day:  DAY_NAMES[DAY],
  task: getDayTask(),
  need: TASK_COST[getDayTask()],
});

// ── Rollback ──────────────────────────────────────────────
function backupUniverse() {
  if (existsSync(UNIVERSE)) copyFileSync(UNIVERSE, UNIVERSE_BAK);
}
function rollbackUniverse() {
  if (!existsSync(UNIVERSE_BAK)) return false;
  copyFileSync(UNIVERSE_BAK, UNIVERSE);
  logger.warn('[ROLLBACK] universe.json restored');
  return true;
}
function clearBackup() {
  if (existsSync(UNIVERSE_BAK)) unlinkSync(UNIVERSE_BAK);
}

// ── Loaders ───────────────────────────────────────────────
function loadUniverse() {
  if (!existsSync(UNIVERSE)) return null;
  try { return JSON.parse(readFileSync(UNIVERSE, 'utf8')); } catch { return null; }
}
function loadResult(file) {
  const p = join(RESULTS_DIR, file);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}
function saveUniverse(u) {
  writeFileSync(UNIVERSE, JSON.stringify(u, null, 2), 'utf8');
  logger.info('[OK] Universe saved', { worlds: u.worlds?.length });
}
function loadProducts() {
  const p = join(__dirname, 'products.json');
  if (!existsSync(p)) return [];
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return []; }
}

function hasEnoughQuota(task) {
  const needed = TASK_COST[task] ?? 0;
  if (needed === 0) return true;
  const key = selectKeyForTask(needed);
  if (!key) {
    logger.warn(`[QUOTA] Not enough for ${task}`, { needed, left: getRemainingQuota() });
    return false;
  }
  return true;
}

async function run(name, agentFn, args = []) {
  logger.info(`[RUN] ${name}`);
  const t0 = Date.now();
  try {
    const result = await Promise.race([
      agentFn(...args),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error(`Timeout after ${TIMEOUT / 1000}s`)), TIMEOUT)
      ),
    ]);
    const d = fmt(Date.now() - t0);
    logger.info(`[OK] ${name}`, { duration: d, quotaLeft: getRemainingQuota() });
    return { success: true, data: result, duration: d };
  } catch (err) {
    const d = fmt(Date.now() - t0);
    logger.error(`[FAIL] ${name}`, { error: err.message.slice(0, 120), duration: d });
    return { success: false, error: err.message.slice(0, 120), duration: d };
  }
}

// ── series.json management ────────────────────────────────
function loadSeries() {
  if (!existsSync(SERIES_PATH)) return null;
  try { return JSON.parse(readFileSync(SERIES_PATH, 'utf8')); } catch { return null; }
}

function updateSeries(universe, screenplay, episodeFile, videoUrl = null, trailerUrl = null) {
  const series = loadSeries() || {
    id:          universe.id,
    title:       universe.name?.en || universe.name?.ar,
    universeId:  universe.id,
    episodes:    [],
    nextEpisode: 1,
    createdAt:   new Date().toISOString(),
  };

  const ep = {
    number:      screenplay.episode,
    title:       screenplay.title,
    logline:     screenplay.logline,
    theme:       screenplay.theme,
    cliffhanger: screenplay.cliffhanger,
    file:        episodeFile?.outputPath || null,
    duration:    episodeFile?.duration   || 0,
    videoUrl:    videoUrl                || null,
    trailerUrl:  trailerUrl              || null,
    producedAt:  new Date().toISOString(),
  };

  const idx = series.episodes.findIndex(e => e.number === ep.number);
  if (idx >= 0) series.episodes[idx] = ep;
  else series.episodes.push(ep);

  series.nextEpisode = Math.max(...series.episodes.map(e => e.number)) + 1;
  series.updatedAt   = new Date().toISOString();

  writeFileSync(SERIES_PATH, JSON.stringify(series, null, 2), 'utf8');
  logger.info('[OK] series.json updated', {
    episode: ep.number,
    total:   series.episodes.length,
    next:    series.nextEpisode,
  });
  return series;
}

// ── Saturday/Thursday/Friday: art-library ─────────────────
async function artLibraryDay(t0, runId) {
  logger.info('[ART-LIB] Pre-generating art assets from bible');
  const log = {};

  const t0art = Date.now();
  try {
    const result = await runArtLibrary();
    log.artLibrary = {
      success:  true,
      data:     result,
      duration: fmt(Date.now() - t0art),
    };
    logger.info('[OK] Art library day done', result);
  } catch (err) {
    log.artLibrary = {
      success:  false,
      error:    err.message,
      duration: fmt(Date.now() - t0art),
    };
    failTask('art-library-failed');
  }

  return saveReport(log, t0, runId, 'art-library', log.artLibrary?.success || false);
}

// ── Sunday: inventor (gate fixed — err-213) ───────────────
async function inventorDay(universe, t0, runId) {
  logger.info('[INVENTOR] Sunday — full quota');
  const log = {};

  // FIX (err-213): was hasEnoughQuota('inventor') which called selectKeyForTask(40)
  // — impossible since DAILY_LIMIT=20/key. Now checks actual remaining quota.
  const INVENTOR_CYCLE_COST = 3;
  if (getRemainingQuota() < INVENTOR_CYCLE_COST) {
    failTask('inventor-no-quota');
    return saveReport(log, t0, runId, 'inventor', false);
  }

  backupUniverse();
  log.invention = await run('Inventor',
    u => import('./agents/inventor-agent.js').then(m => m.run(u)), [universe]);

  if (log.invention?.success) {
    universe.inventions   = (universe.inventions || 0) + 1;
    universe.lastInvented = new Date().toISOString();
    saveUniverse(universe);
    clearBackup();
    resetSessionKey();
  } else {
    rollbackUniverse();
    failTask('inventor-failed');
  }

  return saveReport(log, t0, runId, 'inventor', log.invention?.success || false);
}

// ── Monday/Wednesday: screenplay + production same run ────
async function screenplayAndProductionDay(universe, t0, runId) {
  const progress      = loadProgress();
  const episodeNumber = progress.series?.nextEpisode ?? 1;
  const log           = {};

  logger.info('[SCREENPLAY+PRODUCTION] Full episode day', { episode: episodeNumber });

  if (!hasEnoughQuota('screenplay-production')) {
    failTask('screenplay-no-quota');
    return saveReport(log, t0, runId, 'screenplay-production', false);
  }

  startEpisode(episodeNumber);
  let screenplay = null;

  // ── Screenplay (3 Gemini calls) ────────────────────────
  try {
    for (const step of EPISODE_STEPS) {
      const current = getEpisodeProgress(loadProgress(), episodeNumber);
      if (current.completedSteps.includes(step)) {
        logger.info(`[SCREENPLAY] ${step} already done — skipping`);
        continue;
      }

      logger.info(`[SCREENPLAY] Step: ${step}`);
      await sleep(DELAY);

      screenplay = await runScreenplay(universe, episodeNumber, { fromStep: step });

      if (!screenplay?.acts?.length) {
        throw new Error(`${step}-failed: invalid screenplay output`);
      }

      // Language guard (rule-225/226)
      if (screenplay.language !== 'en') {
        throw new Error(`language-guard-triggered: screenplay.language='${screenplay.language}' (expected 'en')`);
      }

      saveEpisodeStep(episodeNumber, step, screenplay);
      logger.info(`[OK] ${step} done`, { episode: episodeNumber });
    }

    if (!screenplay) {
  const savedPath = join(RESULTS_DIR, `screenplay-ep${episodeNumber}.json`);
  if (existsSync(savedPath)) {
    try {
      screenplay = JSON.parse(readFileSync(savedPath, 'utf8'));
      logger.info('[SCREENPLAY] All steps already complete — loaded from disk', {
        episode: episodeNumber,
        title:   screenplay.title,
      });
    } catch (err) {
      throw new Error(`No screenplay produced and disk load failed: ${err.message}`);
    }
  } else {
    throw new Error(`No screenplay produced and no disk file found for ep${episodeNumber}`);
  }
}

    // Save for production (same run reads it immediately)
    writeFileSync(
      join(RESULTS_DIR, 'screenplay-pending.json'),
      JSON.stringify({
        episode:  episodeNumber,
        screenplay,
        savedAt:  new Date().toISOString(),
      }, null, 2), 'utf8'
    );

    writeFileSync(
      join(RESULTS_DIR, `screenplay-ep${episodeNumber}.json`),
      JSON.stringify(screenplay, null, 2), 'utf8'
    );

    log.screenplay = {
      success:  true,
      data:     { episode: episodeNumber, title: screenplay.title },
      duration: '—',
    };

    resetSessionKey();
    logger.info('[OK] Screenplay done — starting production immediately', {
      episode: episodeNumber,
      title:   screenplay.title,
    });

  } catch (err) {
    log.screenplay = { success: false, error: err.message, duration: '—' };
    failTask(`screenplay-failed: ${err.message.slice(0, 80)}`);
    logger.error('[SCREENPLAY+PRODUCTION] Screenplay failed — skipping production', {
      error: err.message,
    });
    return saveReport(log, t0, runId, 'screenplay-production', false);
  }

  // ── Production (0 Gemini) ──────────────────────────────
  const pending = loadResult('screenplay-pending.json');
  if (!pending?.screenplay) {
    logger.error('[PRODUCTION] screenplay-pending.json not found after screenplay step');
    return saveReport(log, t0, runId, 'screenplay-production', false);
  }

  const { episode, screenplay: sp } = pending;

  try {
    logger.info('[PRODUCTION] 1/7 Voice');
    const voiceR = await run('Voice', s => runVoice(s), [sp]);
    if (!voiceR.success) throw new Error(voiceR.error || 'voice-failed');
    log.voice = voiceR;

    logger.info('[PRODUCTION] 2/7 Scenes');
    const sceneR = await run('Scene', (s, u) => runScene(s, u), [sp, universe]);
    if (!sceneR.success) throw new Error(sceneR.error || 'scene-failed');
    log.scene = sceneR;

    logger.info('[PRODUCTION] 3/7 Visual');
    // visual-agent v3.0 requires universe as third arg
    const visualR = await run('Visual',
      (vs, ep, u) => runVisual(vs, ep, u),
      [sceneR.data, episode, universe]);
    if (!visualR.success) throw new Error(visualR.error || 'visual-failed');
    log.visual = visualR;

    logger.info('[PRODUCTION] 4/7 Subtitles');
    const subR = await run('Subtitle', (s, a) => runSubtitle(s, a),
      [sp, voiceR.data]);
    log.subtitle = subR;

    logger.info('[PRODUCTION] 5/7 Music');
    const musicR = await run('Music', (s, u) => runMusic(s, u), [sp, universe]);
    log.music = musicR;

    logger.info('[PRODUCTION] 6/7 Edit');
    const editR = await run('Edit',
      (s, vm, am, sub, mus) => runEdit(s, vm, am, sub, mus),
      [sp, visualR.data, voiceR.data,
       subR.success  ? subR.data  : null,
       musicR.success ? musicR.data : null]);
    if (!editR.success) throw new Error(editR.error || 'edit-failed');
    log.edit = editR;

    logger.info('[PRODUCTION] 7/7 Trailer + Upload');
    const trailerR = await run('Trailer',
      (s, vm, am, ep) => runTrailer(s, vm, am, ep),
      [sp, visualR.data, voiceR.data, editR.data]);
    log.trailer = trailerR;

    let series = updateSeries(universe, sp, editR.data);

    const uploadR = await run('Upload',
      (ep, s, tr) => runUpload(ep, s, tr),
      [editR.data, series, trailerR.success ? trailerR.data : null]);
    log.upload = uploadR;

    if (uploadR.success && (uploadR.data?.videoUrl || uploadR.data?.trailerUrl)) {
      series = updateSeries(universe, sp, editR.data,
        uploadR.data.videoUrl, uploadR.data.trailerUrl);
    }

    completeEpisode(episode);
    resetSessionKey();
    try { unlinkSync(join(RESULTS_DIR, 'screenplay-pending.json')); } catch {}

    logger.info('[OK] Full episode done', {
      episode,
      title:     sp.title,
      videoUrl:  uploadR.data?.videoUrl || 'pending',
    });

    return saveReport(log, t0, runId, 'screenplay-production', true);

  } catch (err) {
    log.production = { success: false, error: err.message, duration: '—' };
    failTask(`production-failed: ${err.message.slice(0, 80)}`);
    return saveReport(log, t0, runId, 'screenplay-production', false);
  }
}

// ── Tuesday: game-fix ─────────────────────────────────────
async function gameFixDay(t0, runId) {
  logger.info('[GAME-FIX] Tuesday — partial correction cycle', { slug: GAME_FIX_PILOT_SLUG });
  const log = {};

  const game = loadProducts().find(p =>
    p.slug === GAME_FIX_PILOT_SLUG || p.id === GAME_FIX_PILOT_SLUG
  );

  if (!game) {
    logger.error('[GAME-FIX] Pilot not found in products.json', { slug: GAME_FIX_PILOT_SLUG });
    failTask('game-fix-no-pilot');
    return saveReport(log, t0, runId, 'game-fix', false);
  }

  if (getRemainingQuota() < 3) {
    failTask('game-fix-no-quota');
    return saveReport(log, t0, runId, 'game-fix', false);
  }

  backupUniverse();
  log.gamefix = await run('GameFix',
    (idea) => import('./agents/code-agent.js').then(m => m.runGameFix(idea)),
    [game]);

  if (log.gamefix?.success) {
    clearBackup();
    resetSessionKey();
    triggerGodotExport(game.id);
    logger.info('[OK] Game-fix done — export triggered', { id: game.id });
  } else {
    rollbackUniverse();
    failTask('game-fix-failed');
  }

  return saveReport(log, t0, runId, 'game-fix', log.gamefix?.success || false);
}

// ── Production standalone (kept for manual MODE=production) ─
async function productionDay(universe, t0, runId) {
  logger.info('[PRODUCTION] Standalone production day');
  const log = {};

  const pending = loadResult('screenplay-pending.json');
  if (!pending?.screenplay) {
    logger.error('[PRODUCTION] No pending screenplay');
    failTask('production-no-screenplay');
    return saveReport(log, t0, runId, 'production', false);
  }

  const { episode, screenplay } = pending;
  logger.info('[PRODUCTION] Episode', { episode, title: screenplay.title });

  try {
    const voiceR = await run('Voice', s => runVoice(s), [screenplay]);
    if (!voiceR.success) throw new Error(voiceR.error || 'voice-failed');
    log.voice = voiceR;

    const sceneR = await run('Scene', (s, u) => runScene(s, u), [screenplay, universe]);
    if (!sceneR.success) throw new Error(sceneR.error || 'scene-failed');
    log.scene = sceneR;

    const visualR = await run('Visual',
      (vs, ep, u) => runVisual(vs, ep, u),
      [sceneR.data, episode, universe]);
    if (!visualR.success) throw new Error(visualR.error || 'visual-failed');
    log.visual = visualR;

    const subR   = await run('Subtitle', (s, a) => runSubtitle(s, a), [screenplay, voiceR.data]);
    log.subtitle  = subR;
    const musicR = await run('Music', (s, u) => runMusic(s, u), [screenplay, universe]);
    log.music     = musicR;

    const editR = await run('Edit',
      (s, vm, am, sub, mus) => runEdit(s, vm, am, sub, mus),
      [screenplay, visualR.data, voiceR.data,
       subR.success  ? subR.data  : null,
       musicR.success ? musicR.data : null]);
    if (!editR.success) throw new Error(editR.error || 'edit-failed');
    log.edit = editR;

    const trailerR = await run('Trailer',
      (s, vm, am, ep) => runTrailer(s, vm, am, ep),
      [screenplay, visualR.data, voiceR.data, editR.data]);
    log.trailer = trailerR;

    let series = updateSeries(universe, screenplay, editR.data);

    const uploadR = await run('Upload',
      (ep, s, tr) => runUpload(ep, s, tr),
      [editR.data, series, trailerR.success ? trailerR.data : null]);
    log.upload = uploadR;

    if (uploadR.success && (uploadR.data?.videoUrl || uploadR.data?.trailerUrl)) {
      series = updateSeries(universe, screenplay, editR.data,
        uploadR.data.videoUrl, uploadR.data.trailerUrl);
    }

    completeEpisode(episode);
    resetSessionKey();
    try { unlinkSync(join(RESULTS_DIR, 'screenplay-pending.json')); } catch {}

    return saveReport(log, t0, runId, 'production', true);

  } catch (err) {
    log.production = { success: false, error: err.message, duration: '—' };
    failTask(`production-failed: ${err.message.slice(0, 80)}`);
    return saveReport(log, t0, runId, 'production', false);
  }
}

// ── Library day (kept for manual MODE=library) ────────────
async function libraryDay(t0, runId) {
  logger.info('[LIBRARY] Library day (note: library at 100% — will skip automatically)');
  const log = {};

  if (getLibraryStatus().remaining === 0) {
    log.library = { success: true, data: { skipped: true, reason: 'library-complete' }, duration: '0ms' };
    return saveReport(log, t0, runId, 'library', true);
  }

  const t0lib = Date.now();
  let built = 0;
  try {
    while (getRemainingQuota() >= 2 && getLibraryStatus().remaining > 0) {
      const r = await runLibrary();
      built += r?.built || 0;
      if (!r?.built) break;
    }
    log.library = { success: true, data: { built }, duration: fmt(Date.now() - t0lib) };
    resetSessionKey();
  } catch (err) {
    log.library = { success: false, error: err.message, duration: fmt(Date.now() - t0lib) };
    failTask('library-failed');
  }

  return saveReport(log, t0, runId, 'library', log.library?.success || false);
}

// ── Game phase (kept for manual MODE override) ────────────
function getNextGame(progress) {
  if (progress.games?.current) return progress.games.current;
  return loadProducts().find(p =>
    p.type === 'godot' && !progress.games?.done?.includes(p.id)
  ) ?? null;
}

async function gamePhase(universe, phase, t0, runId) {
  const taskKey  = `game-phase${phase}`;
  const progress = loadProgress();
  const game     = getNextGame(progress);
  const log      = {};

  if (!game) {
    logger.warn('[GAME] No game to build');
    return saveReport(log, t0, runId, taskKey, false);
  }

  if (!hasEnoughQuota(taskKey)) {
    failTask(`${taskKey}-no-quota`);
    return saveReport(log, t0, runId, taskKey, false);
  }

  logger.info(`[GAME] Phase ${phase}`, { id: game.id });

  const idea     = loadResult('ideas.json');
  const story    = loadResult('story.json');
  const template = loadResult('template.json');

  if (!idea) {
    logger.error('[GAME] ideas.json not found');
    failTask(`${taskKey}-no-idea`);
    return saveReport(log, t0, runId, taskKey, false);
  }

  backupUniverse();
  startGame(game.id);

  const gProgress  = getGameProgress(progress, game.id);
  const isPhase1   = phase === 1;
  const phaseFiles = isPhase1
    ? gProgress.pendingFiles.filter(f => f.endsWith('.gd'))
    : gProgress.pendingFiles.filter(f => f.endsWith('.tscn'));
  const budget     = isPhase1 ? 4 : 5;

  try {
    log.code = await run(
      `Code-Phase${phase}`,
      (id, st, u, art, tmpl, opts) =>
        import('./agents/code-agent.js').then(m => m.run(id, st, u, art, tmpl, opts)),
      [idea, story, { worlds: universe.worlds }, universe.art, template, {
        pendingFiles:   phaseFiles,
        completedFiles: gProgress.completedFiles,
        budget,
      }]
    );

    if (!log.code?.success) throw new Error(log.code?.error || 'code-failed');

    for (const f of (log.code.data?.files || [])) {
      saveGameFile(game.id, f.name, f.content);
    }

    const updated = getGameProgress(loadProgress(), game.id);

    if (phase === 2 && updated.pendingFiles.length === 0) {
      completeGame(game.id);
      save('code.json', log.code.data);
      triggerGodotExport(game.id);
    } else {
      logger.info(`[OK] Phase ${phase} done`, {
        done:    updated.completedFiles.length,
        pending: updated.pendingFiles.length,
      });
    }

    clearBackup();
    resetSessionKey();
    return saveReport(log, t0, runId, taskKey, true);

  } catch (err) {
    log.code = { success: false, error: err.message, duration: '—' };
    rollbackUniverse();
    failTask(`${taskKey}-failed`);
    return saveReport(log, t0, runId, taskKey, false);
  }
}

// ── Main entry point ──────────────────────────────────────
async function main() {
  const t0       = Date.now();
  const runId    = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const mode     = process.env.MODE || 'auto';
  const universe = loadUniverse();
  const budget   = getBudgetStatus();

  logger.info('[START] Orchestrator v10.7', {
    runId, mode,
    day:         DAY_NAMES[DAY],
    task:        getDayTask(),
    hasUniverse: !!universe,
    quotaLeft:   budget.left,
    keys:        budget.keys?.map(k => `${k.key}:${k.left}`).join(' | '),
    library:     `${getLibraryStatus().percent}%`,
    gameFix:     GAME_FIX_PILOT_SLUG,
  });

  if (mode === 'birth' || !universe) return birthMode(t0, runId);

  const handlers = {
    'art-library':           () => artLibraryDay(t0, runId),
    library:                 () => libraryDay(t0, runId),
    inventor:                () => inventorDay(universe, t0, runId),
    'screenplay-production': () => screenplayAndProductionDay(universe, t0, runId),
    screenplay:              () => screenplayAndProductionDay(universe, t0, runId), // alias
    production:              () => productionDay(universe, t0, runId),
    'game-fix':              () => gameFixDay(t0, runId),
    'game-phase1':           () => gamePhase(universe, 1, t0, runId),
    'game-phase2':           () => gamePhase(universe, 2, t0, runId),
    sync: async () => {
      const log = {};
      log.sync = await run('Sync',
        () => import('./scripts/sync-to-supabase.js').then(m => m.run()), []);
      return saveReport(log, t0, runId, 'sync', log.sync?.success || false);
    },
  };

  const task = handlers[mode] ? mode : getDayTask();
  return (handlers[task] || handlers['art-library'])();
}

// ── Birth mode ────────────────────────────────────────────
async function birthMode(t0, runId) {
  logger.info('[BIRTH] Creating universe from scratch');
  const log = {}, data = {};

  const agents = [
    { name: 'Idea',  path: './agents/idea-agent.js',  key: 'idea',  out: 'ideas.json',  args: () => [] },
    { name: 'Story', path: './agents/story-agent.js', key: 'story', out: 'story.json',  args: () => [data.idea] },
    { name: 'Soul',  path: './agents/soul-agent.js',  key: 'soul',  out: 'soul.json',   args: () => [data.idea, data.story] },
    { name: 'Art',   path: './agents/art-agent.js',   key: 'art',   out: 'art.json',    args: () => [data.idea, data.story, data.soul] },
  ];

  for (const ag of agents) {
    if (!canAfford(ag.key)) {
      logger.error(`[BIRTH] ${ag.name} — insufficient quota`);
      return saveReport(log, t0, runId, 'birth', false);
    }
    await sleep(DELAY);
    log[ag.name] = await run(ag.name,
      (...a) => import(ag.path).then(m => m.run(...a)), ag.args());
    if (log[ag.name]?.success) {
      data[ag.key] = log[ag.name].data;
      save(ag.out, data[ag.key]);
    } else {
      logger.error(`[BIRTH] ${ag.name} failed — aborting`);
      return saveReport(log, t0, runId, 'birth', false);
    }
  }

  log.template = await run('Template',
    (id, st) => import('./agents/template-engineer.js').then(m => m.run(id, st)),
    [data.idea, data.story]);
  if (log.template?.success) {
    data.template = log.template.data;
    writeFileSync(join(__dirname, 'agents', 'template.json'),
      JSON.stringify(data.template, null, 2), 'utf8');
    save('template.json', data.template);
  }

  if (canAfford('world')) {
    await sleep(DELAY);
    log.world = await run('World',
      p => import('./agents/world-birth-agent.js').then(m => m.run(p)),
      [{ id: data.idea.id, name: data.idea.name, soul: data.soul, worlds: [] }]);
    data.worlds = log.world?.success ? [log.world.data] : [];
    save('levels.json', { worlds: data.worlds });
  }

  const universe = {
    id:          data.idea.id,
    name:        data.idea.name,
    born:        new Date().toISOString(),
    soul:        data.soul,
    art:         data.art,
    worlds:      data.worlds || [],
    evolutions:  0, inventions: 0, revivals: 0,
    lastEvolved: null, lastInvented: null, lastRevived: null,
  };

  saveUniverse(universe);
  resetSessionKey();
  return saveReport(log, t0, runId, 'birth', true);
}

// ── End report ────────────────────────────────────────────
function saveReport(log, t0, runId, mode, success) {
  const budget   = getBudgetStatus();
  const lib      = getLibraryStatus();
  const progress = loadProgress();
  const series   = loadSeries();

  const report = {
    runId, mode, success,
    timestamp:     new Date().toISOString(),
    totalDuration: fmt(Date.now() - t0),
    budget: { total: budget.total, limit: budget.limit, left: budget.left, keys: budget.keys },
    library:  { built: lib.built, total: lib.total, percent: `${lib.percent}%` },
    series:   { episodes: series?.episodes?.length ?? 0, next: series?.nextEpisode ?? 1 },
    progress: {
      nextEpisode:   progress.series?.nextEpisode,
      totalEpisodes: progress.series?.totalEpisodes,
      gamesDone:     progress.games?.done?.length ?? 0,
    },
    agents: Object.fromEntries(
      Object.entries(log).map(([k, v]) => [k, {
        success:  v?.success  || false,
        duration: v?.duration || '—',
        error:    v?.error    || null,
      }])
    ),
    summary: {
      total:  Object.keys(log).length,
      passed: Object.values(log).filter(v => v?.success).length,
      failed: Object.values(log).filter(v => !v?.success).length,
    },
  };

  writeFileSync(
    join(RESULTS_DIR, 'run-report.json'),
    JSON.stringify(report, null, 2), 'utf8'
  );

  logger.info('[DONE] Orchestrator v10.7', {
    mode, success,
    duration: report.totalDuration,
    passed:   report.summary.passed,
    failed:   report.summary.failed,
    quota:    `${budget.total}/${budget.limit}`,
    episodes: report.series.episodes,
  });

  return report;
}

// ── Godot export trigger ──────────────────────────────────
function triggerGodotExport(gameId = '') {
  try {
    execSync(
      `gh workflow run godot-export.yml --repo ${process.env.GITHUB_REPOSITORY}` +
      (gameId ? ` -f game_id=${gameId}` : ''),
      { stdio: 'pipe' }
    );
    logger.info('[OK] Godot export triggered', { gameId });
  } catch (err) {
    logger.warn('[WARN] Could not trigger export', { error: err.message });
  }
}

// ── Run ───────────────────────────────────────────────────
main().catch(err => {
  logger.error('[CRASH] Orchestrator v10.7', { error: err.message });
  if (existsSync(UNIVERSE_BAK)) rollbackUniverse();
  process.exit(1);
});
