/**
 * scripts/progress.js — v1.1
 *
 * التغييرات عن v1.0:
 *  - startGame: لا تُعيد تهيئة اللعبة إذا كانت موجودة — نكمل من حيث انتهينا
 *  - startEpisode: pendingSteps تُبنى من completedSteps — لا نعيد ما أُنجز
 *  - failTask: رسالة log صحيحة — "retry same day next week"
 *
 * القواعد المطبقة:
 *  rule-187 : المهام الجارية أولوية مطلقة
 *  rule-188 : كل خطوة تُحفظ فور اكتمالها — لا خسارة عند crash
 *  rule-193 : 12 دالة مُصدَّرة
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';

const __dirname     = dirname(fileURLToPath(import.meta.url));
const PROGRESS_PATH = join(__dirname, '..', 'progress.json');

// ══════════════════════════════════════════════════════════
// ثوابت
// ══════════════════════════════════════════════════════════
const EPISODE_STEPS   = ['backbone', 'scenes', 'dialogue'];

const GAME_GD_FILES   = [
  'main_scene.gd', 'player.gd', 'enemy.gd', 'weapon.gd', 'bullet.gd',
];
const GAME_TSCN_FILES = [
  'main_scene.tscn', 'player.tscn', 'enemy.tscn', 'weapon.tscn', 'bullet.tscn',
];
const ALL_GAME_FILES  = [...GAME_GD_FILES, ...GAME_TSCN_FILES];

// ══════════════════════════════════════════════════════════
// الهيكل الابتدائي
// ══════════════════════════════════════════════════════════
function freshProgress() {
  return {
    version:   '1.1',
    updatedAt: new Date().toISOString(),
    current:   null,
    series: {
      nextEpisode:   1,
      totalEpisodes: 0,
      episodes:      {},
    },
    games: {
      current: null,
      done:    [],
    },
  };
}

// ══════════════════════════════════════════════════════════
// I/O — loadProgress / saveProgress
// ══════════════════════════════════════════════════════════

/**
 * يقرأ progress.json أو يُنشئ ملفاً جديداً إن لم يكن موجوداً
 */
export function loadProgress() {
  if (!existsSync(PROGRESS_PATH)) {
    const fresh = freshProgress();
    saveProgress(fresh);
    return fresh;
  }
  try {
    return JSON.parse(readFileSync(PROGRESS_PATH, 'utf8'));
  } catch (err) {
    logger.warn('[PROGRESS] Corrupt progress.json — resetting', { error: err.message });
    const fresh = freshProgress();
    saveProgress(fresh);
    return fresh;
  }
}

/**
 * يحفظ progress مع تحديث updatedAt — rule-188
 */
export function saveProgress(progress) {
  progress.updatedAt = new Date().toISOString();
  writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2), 'utf8');
}

// ══════════════════════════════════════════════════════════
// getNextTask — ماذا يفعل اليوم؟
// ══════════════════════════════════════════════════════════

/**
 * يُحدد المهمة التالية:
 *  - إذا كان هناك current → أكملها (rule-187)
 *  - وإلا → ابدأ مهمة جديدة
 *
 * @returns {{ type: 'continue'|'new', task: object|null }}
 */
export function getNextTask(progress) {
  if (progress.current) {
    return { type: 'continue', task: progress.current };
  }
  return { type: 'new', task: null };
}

// ══════════════════════════════════════════════════════════
// حلقات المسلسل
// ══════════════════════════════════════════════════════════

/**
 * يُعلن بداية حلقة أو استئنافها
 * - إذا كانت الحلقة موجودة: نكمل من حيث انتهينا — لا نُعيد ما أُنجز
 * - إذا كانت جديدة: نُنشئ سجلها من الصفر
 */
export function startEpisode(episodeNumber) {
  const p = loadProgress();

  if (p.series.episodes[episodeNumber]) {
    // استئناف — نكمل من حيث انتهينا
    const ep        = p.series.episodes[episodeNumber];
    ep.status       = 'in_progress';
    ep.failReason   = null;
    // pendingSteps = ما لم يُنجز فعلاً — لا نُعيد الصفر
    ep.pendingSteps = EPISODE_STEPS.filter(s => !ep.completedSteps.includes(s));
  } else {
    // حلقة جديدة
    p.series.episodes[episodeNumber] = {
      status:         'in_progress',
      completedSteps: [],
      pendingSteps:   [...EPISODE_STEPS],
      data:           {},
      startedAt:      new Date().toISOString(),
      completedAt:    null,
      failReason:     null,
    };
  }

  p.current = {
    type:       'episode',
    episode:    episodeNumber,
    id:         null,
    startedAt:  p.series.episodes[episodeNumber].startedAt,
    updatedAt:  new Date().toISOString(),
    failReason: null,
  };

  saveProgress(p);
  logger.info('[PROGRESS] Episode started', {
    episode:   episodeNumber,
    completed: p.series.episodes[episodeNumber].completedSteps,
    pending:   p.series.episodes[episodeNumber].pendingSteps,
  });
}

/**
 * يحفظ نتيجة خطوة واحدة من الحلقة — rule-188
 * يُستدعى فور اكتمال كل خطوة (backbone / scenes / dialogue)
 */
export function saveEpisodeStep(episodeNumber, step, data = null) {
  const p = loadProgress();

  // ضمان وجود السجل
  if (!p.series.episodes[episodeNumber]) {
    p.series.episodes[episodeNumber] = {
      status:         'in_progress',
      completedSteps: [],
      pendingSteps:   [...EPISODE_STEPS],
      data:           {},
      startedAt:      new Date().toISOString(),
      completedAt:    null,
      failReason:     null,
    };
  }

  const ep = p.series.episodes[episodeNumber];

  if (!ep.completedSteps.includes(step)) ep.completedSteps.push(step);
  ep.pendingSteps = EPISODE_STEPS.filter(s => !ep.completedSteps.includes(s));

  // احفظ مقتطفاً فقط لتجنب ضخامة الملف
  ep.data[step] = {
    savedAt: new Date().toISOString(),
    title:   data?.title   || null,
    summary: data?.summary || null,
  };

  if (p.current) p.current.updatedAt = new Date().toISOString();

  saveProgress(p);
  logger.info('[PROGRESS] Episode step saved', {
    episode:   episodeNumber,
    step,
    completed: ep.completedSteps,
    pending:   ep.pendingSteps,
  });
}

/**
 * يُرجع حالة الحلقة: الخطوات المكتملة والمعلقة والبيانات المحفوظة
 */
export function getEpisodeProgress(progress, episodeNumber) {
  const ep = progress.series?.episodes?.[episodeNumber];
  if (!ep) {
    return {
      completedSteps: [],
      pendingSteps:   [...EPISODE_STEPS],
      data:           {},
    };
  }
  return {
    completedSteps: ep.completedSteps || [],
    pendingSteps:   EPISODE_STEPS.filter(s => !(ep.completedSteps || []).includes(s)),
    data:           ep.data           || {},
  };
}

/**
 * يُكمل الحلقة — يُحدث العدادات ويُفرغ current
 */
export function completeEpisode(episodeNumber) {
  const p  = loadProgress();
  const ep = p.series.episodes[episodeNumber];

  if (ep) {
    ep.status       = 'complete';
    ep.completedAt  = new Date().toISOString();
    ep.pendingSteps = [];
  }

  p.series.totalEpisodes = (p.series.totalEpisodes || 0) + 1;
  p.series.nextEpisode   = episodeNumber + 1;
  p.current              = null;

  saveProgress(p);
  logger.info('[PROGRESS] Episode complete', {
    episode: episodeNumber,
    total:   p.series.totalEpisodes,
    next:    p.series.nextEpisode,
  });
}

// ══════════════════════════════════════════════════════════
// ألعاب Godot
// ══════════════════════════════════════════════════════════

/**
 * يُعلن بداية لعبة أو استئنافها
 * - إذا كانت اللعبة موجودة: نكمل من حيث انتهينا — لا نمسح الملفات المكتملة
 * - إذا كانت جديدة: نُنشئ سجلها من الصفر
 */
export function startGame(gameId) {
  const p = loadProgress();

  if (p.games.current?.id === gameId) {
    // استئناف — نكمل من حيث انتهينا
    const g     = p.games.current;
    g.status    = 'in_progress';
    g.failReason = null;
    g.updatedAt  = new Date().toISOString();
    // pendingFiles = ما لم يُنجز فعلاً — لا نُعيد الصفر
    g.pendingFiles = ALL_GAME_FILES.filter(f => !g.completedFiles.includes(f));
  } else {
    // لعبة جديدة
    p.games.current = {
      id:             gameId,
      status:         'in_progress',
      completedFiles: [],
      pendingFiles:   [...ALL_GAME_FILES],
      startedAt:      new Date().toISOString(),
      updatedAt:      new Date().toISOString(),
      failReason:     null,
    };
  }

  p.current = {
    type:       'game',
    episode:    null,
    id:         gameId,
    startedAt:  p.games.current.startedAt,
    updatedAt:  new Date().toISOString(),
    failReason: null,
  };

  saveProgress(p);
  logger.info('[PROGRESS] Game started', {
    id:        gameId,
    completed: p.games.current.completedFiles.length,
    pending:   p.games.current.pendingFiles.length,
  });
}

/**
 * يُسجّل اكتمال ملف واحد — rule-188
 */
export function saveGameFile(gameId, filename, _content = null) {
  const p = loadProgress();

  if (!p.games.current || p.games.current.id !== gameId) {
    logger.warn('[PROGRESS] saveGameFile: no matching current game', { gameId, filename });
    return;
  }

  const g = p.games.current;
  if (!g.completedFiles.includes(filename)) g.completedFiles.push(filename);
  g.pendingFiles = ALL_GAME_FILES.filter(f => !g.completedFiles.includes(f));
  g.updatedAt    = new Date().toISOString();

  if (p.current) p.current.updatedAt = new Date().toISOString();

  saveProgress(p);
  logger.info('[PROGRESS] Game file saved', {
    game:      gameId,
    file:      filename,
    completed: g.completedFiles.length,
    pending:   g.pendingFiles.length,
  });
}

/**
 * يُرجع حالة اللعبة: الملفات المكتملة والمعلقة
 */
export function getGameProgress(progress, gameId) {
  const g = progress.games?.current;
  if (!g || g.id !== gameId) {
    return {
      completedFiles: [],
      pendingFiles:   [...ALL_GAME_FILES],
    };
  }
  return {
    completedFiles: g.completedFiles || [],
    pendingFiles:   ALL_GAME_FILES.filter(f => !(g.completedFiles || []).includes(f)),
  };
}

/**
 * يُكمل اللعبة — يُضيفها لـ done ويُفرغ current
 */
export function completeGame(gameId) {
  const p = loadProgress();

  if (p.games.current?.id === gameId) {
    p.games.current.status       = 'complete';
    p.games.current.pendingFiles = [];
  }

  if (!p.games.done.includes(gameId)) p.games.done.push(gameId);
  p.games.current = null;
  p.current       = null;

  saveProgress(p);
  logger.info('[PROGRESS] Game complete', {
    id:        gameId,
    totalDone: p.games.done.length,
  });
}

// ══════════════════════════════════════════════════════════
// فشل — يبقى current للإعادة نفس اليوم الأسبوع القادم
// ══════════════════════════════════════════════════════════

/**
 * يُسجّل فشل المهمة الحالية
 * - لا يُفرغ current — نكمل من نفس النقطة الأسبوع القادم
 * - يحفظ سبب الفشل للمراجعة
 */
export function failTask(reason = 'unknown') {
  const p = loadProgress();

  if (p.current) {
    p.current.failReason = reason;
    p.current.updatedAt  = new Date().toISOString();
  }

  if (p.current?.type === 'episode' && p.current.episode != null) {
    const ep = p.series.episodes[p.current.episode];
    if (ep) { ep.status = 'failed'; ep.failReason = reason; }
  }

  if (p.current?.type === 'game' && p.games.current) {
    p.games.current.status     = 'failed';
    p.games.current.failReason = reason;
  }

  saveProgress(p);
  logger.warn('[PROGRESS] Task failed — will retry same day next week', {
    type:   p.current?.type,
    reason: reason.slice(0, 100),
  });
}
