/**
 * scripts/progress.js — نظام تتبع التقدم
 *
 * المبدأ: أكمل ما بدأت حتى يكتمل 100%
 * ثم انتقل للتالي
 *
 * progress.json:
 * {
 *   "current": { "type": "episode"|"game"|null, "id": "...", "step": "..." },
 *   "series":  { "nextEpisode": 1, "totalEpisodes": 0 },
 *   "games":   { "pending": [], "done": [] }
 * }
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname       = dirname(fileURLToPath(import.meta.url));
const PROGRESS_PATH   = join(__dirname, '..', 'agent-results', 'progress.json');
const RESULTS_DIR     = join(__dirname, '..', 'agent-results');

// ══════════════════════════════════════════════════════════
// تحميل وحفظ
// ══════════════════════════════════════════════════════════

export function loadProgress() {
  mkdirSync(RESULTS_DIR, { recursive: true });
  if (!existsSync(PROGRESS_PATH)) {
    const fresh = {
      current: null,
      series:  { nextEpisode: 1, totalEpisodes: 0 },
      games:   { pending: [], done: [] },
      updatedAt: new Date().toISOString(),
    };
    saveProgress(fresh);
    return fresh;
  }
  try { return JSON.parse(readFileSync(PROGRESS_PATH, 'utf8')); }
  catch { return loadProgress(); }
}

export function saveProgress(p) {
  p.updatedAt = new Date().toISOString();
  writeFileSync(PROGRESS_PATH, JSON.stringify(p, null, 2), 'utf8');
}

// ══════════════════════════════════════════════════════════
// ما الذي يجب إكماله اليوم؟
// ══════════════════════════════════════════════════════════

export function getNextTask(progress) {
  // إذا هناك عمل جارٍ غير مكتمل → أكمله
  if (progress.current) {
    return { type: 'continue', task: progress.current };
  }

  // لا شيء جارٍ → ابدأ حلقة جديدة
  return {
    type:    'new_episode',
    episode: progress.series.nextEpisode,
  };
}

// ══════════════════════════════════════════════════════════
// تسجيل بداية عمل جديد
// ══════════════════════════════════════════════════════════

export function startEpisode(episodeNumber) {
  const p = loadProgress();
  p.current = {
    type:    'episode',
    episode: episodeNumber,
    step:    'screenplay',  // أول خطوة
    startedAt: new Date().toISOString(),
  };
  saveProgress(p);
}

export function startGame(gameId) {
  const p = loadProgress();
  p.current = {
    type:      'game',
    id:        gameId,
    step:      'code',
    startedAt: new Date().toISOString(),
  };
  saveProgress(p);
}

// ══════════════════════════════════════════════════════════
// تسجيل اكتمال عمل
// ══════════════════════════════════════════════════════════

export function completeEpisode(episodeNumber) {
  const p = loadProgress();
  p.current = null;
  p.series.totalEpisodes++;
  p.series.nextEpisode = episodeNumber + 1;
  saveProgress(p);
}

export function completeGame(gameId) {
  const p = loadProgress();
  p.current = null;
  p.games.done.push({ id: gameId, doneAt: new Date().toISOString() });
  p.games.pending = p.games.pending.filter(g => g !== gameId);
  saveProgress(p);
}

// ══════════════════════════════════════════════════════════
// تسجيل فشل — يبقى current حتى يُكمَل
// ══════════════════════════════════════════════════════════

export function failTask(reason) {
  const p = loadProgress();
  if (p.current) {
    p.current.lastError  = reason;
    p.current.lastFailed = new Date().toISOString();
  }
  saveProgress(p);
}
