/**
 * scripts/repair-arabic-episodes.js — v1.0
 *
 * 1. Shows current state of all archived-non-english episodes
 * 2. Resets their status in progress.json so orchestrator regenerates them in English
 * 3. Cleans their Arabic screenplay files from agent-results/
 * 4. Removes them from series.json (they'll be re-added after production)
 * 5. Resets nextEpisode to 1 so regeneration starts from the beginning
 *
 * Run: node scripts/repair-arabic-episodes.js
 * Run with --dry-run to preview only, without modifying anything
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '..');
const DRY_RUN    = process.argv.includes('--dry-run');

const PROGRESS_PATH = join(ROOT, 'agent-results', 'progress.json');
const SERIES_PATH   = join(ROOT, 'series.json');
const RESULTS_DIR   = join(ROOT, 'agent-results');

// ── Loaders ───────────────────────────────────────────────
function load(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (err) { console.error(`[ERROR] Cannot parse ${path}:`, err.message); return null; }
}

function save(path, data) {
  if (DRY_RUN) {
    console.log(`[DRY-RUN] Would write: ${path}`);
    return;
  }
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
  console.log(`[OK] Written: ${path}`);
}

function removeFile(path) {
  if (!existsSync(path)) return;
  if (DRY_RUN) {
    console.log(`[DRY-RUN] Would delete: ${path}`);
    return;
  }
  unlinkSync(path);
  console.log(`[OK] Deleted: ${path}`);
}

// ── Detect language of a screenplay file ─────────────────
function detectLanguage(screenplay) {
  if (!screenplay) return 'unknown';
  if (screenplay.language) return screenplay.language;
  // Heuristic: if title contains Arabic characters
  const title = screenplay.title || '';
  if (/[\u0600-\u06FF]/.test(title)) return 'ar';
  return 'unknown';
}

// ── Main ──────────────────────────────────────────────────
function main() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Repair Arabic Episodes${DRY_RUN ? ' [DRY-RUN — no changes]' : ''}`);
  console.log(`${'═'.repeat(60)}\n`);

  // ── 1. Read progress.json ─────────────────────────────
  const progress = load(PROGRESS_PATH);
  if (!progress) {
    console.error('[ERROR] progress.json not found or invalid — aborting');
    process.exit(1);
  }

  const allEpisodes   = Object.entries(progress.episodes || {});
  const archivedEps   = allEpisodes.filter(([, ep]) =>
    ep.status === 'archived-non-english' || ep.status === 'archived'
  );
  const completedEps  = allEpisodes.filter(([, ep]) => ep.status === 'completed');
  const currentNext   = progress.series?.nextEpisode ?? 'unknown';

  // ── 2. Diagnostic ─────────────────────────────────────
  console.log('── CURRENT STATE ────────────────────────────────────\n');
  console.log(`  nextEpisode:       ${currentNext}`);
  console.log(`  Total episodes:    ${allEpisodes.length}`);
  console.log(`  Completed (EN):    ${completedEps.length}`);
  console.log(`  Archived (AR):     ${archivedEps.length}`);

  if (archivedEps.length === 0) {
    console.log('\n[INFO] No archived Arabic episodes found — nothing to repair.');
    process.exit(0);
  }

  console.log('\n── ARCHIVED EPISODES TO REPAIR ──────────────────────\n');
  for (const [num, ep] of archivedEps) {
    const scriptPath = join(RESULTS_DIR, `screenplay-ep${num}.json`);
    const script     = load(scriptPath);
    const lang       = detectLanguage(script);
    console.log(
      `  Episode ${String(num).padStart(2, '0')} ` +
      `| status: ${ep.status} ` +
      `| language: ${lang} ` +
      `| title: ${script?.title || '(no screenplay file)'}`
    );
  }

  // ── 3. English episodes to preserve ──────────────────
  console.log('\n── ENGLISH EPISODES (preserved, not touched) ────────\n');
  for (const [num, ep] of completedEps) {
    const scriptPath = join(RESULTS_DIR, `screenplay-ep${num}.json`);
    const script     = load(scriptPath);
    console.log(
      `  Episode ${String(num).padStart(2, '0')} ` +
      `| status: ${ep.status} ` +
      `| title: ${script?.title || '?'}`
    );
  }

  if (DRY_RUN) {
    console.log('\n── DRY-RUN PLAN ──────────────────────────────────────\n');
  } else {
    console.log('\n── APPLYING REPAIRS ──────────────────────────────────\n');
  }

  // ── 4. Reset archived episodes in progress.json ──────
  const archivedNumbers = archivedEps.map(([num]) => parseInt(num));
  for (const num of archivedNumbers) {
    // Remove from episodes entirely — orchestrator will recreate via startEpisode()
    delete progress.episodes[num];
    console.log(`  [RESET] Episode ${num} removed from progress.json`);
  }

  // Reset nextEpisode to the lowest archived number
  // (preserving completed English episodes — they'll be skipped automatically
  //  if their screenplay-epN.json files pass the language guard)
  const lowestArchived = Math.min(...archivedNumbers);
  if (progress.series) {
    progress.series.nextEpisode = lowestArchived;
  }
  console.log(`  [RESET] nextEpisode → ${lowestArchived}`);
  save(PROGRESS_PATH, progress);

  // ── 5. Remove Arabic screenplay files ────────────────
  console.log('\n  Cleaning Arabic screenplay files...');
  for (const num of archivedNumbers) {
    const filesToClean = [
      join(RESULTS_DIR, `screenplay-ep${num}.json`),
      join(RESULTS_DIR, `screenplay-backbone-ep${num}.json`),
      join(RESULTS_DIR, `screenplay-scenes-ep${num}.json`),
      join(RESULTS_DIR, `screenplay-dialogue-ep${num}.json`),
    ];
    for (const f of filesToClean) removeFile(f);
  }

  // ── 6. Clean series.json — remove Arabic entries ─────
  const series = load(SERIES_PATH);
  if (series?.episodes) {
    const beforeCount = series.episodes.length;
    series.episodes   = series.episodes.filter(ep =>
      !archivedNumbers.includes(ep.number)
    );
    const removed = beforeCount - series.episodes.length;

    // Recalculate nextEpisode in series.json
    const maxEpInSeries = series.episodes.length > 0
      ? Math.max(...series.episodes.map(e => e.number))
      : 0;
    series.nextEpisode = Math.min(lowestArchived, maxEpInSeries + 1);
    series.updatedAt   = new Date().toISOString();

    save(SERIES_PATH, series);
    console.log(`\n  [SERIES] Removed ${removed} Arabic episode(s) from series.json`);
    console.log(`  [SERIES] nextEpisode → ${series.nextEpisode}`);
  } else {
    console.log('\n  [SERIES] series.json not found or empty — skipped');
  }

  // ── 7. Summary ────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  RESULT\n');
  console.log(`  Episodes to regenerate: ${archivedNumbers.join(', ')}`);
  console.log(`  English episodes kept:  ${completedEps.map(([n]) => n).join(', ') || 'none'}`);
  console.log(`  nextEpisode reset to:   ${lowestArchived}`);
  console.log(`\n  NEXT STEPS:`);
  console.log(`  → Lundi: screenplay-production → génère épisode ${lowestArchived} en anglais`);
  console.log(`  → Mercredi: screenplay-production → génère épisode ${lowestArchived + 1}`);
  console.log(`  → ${Math.ceil(archivedNumbers.length / 2)} semaine(s) pour tout régénérer`);
  if (completedEps.length > 0) {
    console.log(`\n  ⚠️  Les épisodes anglais déjà produits (${completedEps.map(([n]) => n).join(', ')})`);
    console.log(`     seront détectés par le garde-langue et ignorés automatiquement.`);
  }
  console.log(`${'═'.repeat(60)}\n`);

  if (DRY_RUN) {
    console.log('  Run without --dry-run to apply these changes.\n');
  } else {
    console.log('  Done. Commit progress.json and series.json before the next run.\n');
  }
}

main();
