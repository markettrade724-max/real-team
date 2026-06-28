/**
 * code-agent.js — addition v2.3
 * New: runGameFix() — Thursday partial-fix mode (3 calls, full cycle)
 * Root cause targeted: per-file isolated generation (rule-103/149) means
 * Gemini never sees the whole codebase at once → broken cross-file wiring
 * (signals, input actions, win/lose condition, score) even when each file
 * is individually valid GDScript and exports successfully.
 */

function loadSavedTscnFiles(slug) {
  const files = {};
  for (const name of GAME_TSCN_FILES) {
    const content = readProjectFile(slug, name);
    if (content) files[name] = content;
  }
  return files;
}

// Backup before overwrite — same spirit as rule-154 (rollback safety)
function backupProjectFile(slug, filename) {
  const content = readProjectFile(slug, filename);
  if (content == null) return;
  const backupDir = join(getProjectDir(slug), '_backup');
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(join(backupDir, `${filename}.${stamp}.bak`), content, 'utf8');
}

export async function runGameFix(idea, taskConfig = {}) {
  const slug = idea.id;
  logger.info('[CODE-FIX] Game-fix cycle started', { slug });

  const available = getRemainingQuota();
  if (available < 3) {
    throw new Error(`InsufficientQuota: game-fix needs 3 calls, have ${available}`);
  }

  const soul      = soulContext('code-agent');
  const gdFiles    = loadSavedGdFiles(slug);
  const tscnFiles  = loadSavedTscnFiles(slug);

  if (Object.keys(gdFiles).length === 0) {
    throw new Error(`No saved .gd files for ${slug} — cannot run game-fix`);
  }

  const report = { slug, steps: [], appliedFixes: [] };

  // ── Call 1/3 — cross-file GDScript wiring audit + fix ──────
  const gdBundle = Object.entries(gdFiles)
    .map(([name, code]) => `--- ${name} ---\n${code}`).join('\n\n');

  const step1 = await askGemini(`${soul}

Review this complete Godot 4.6.2 GDScript codebase as ONE connected system, not isolated files.
Check specifically for:
1. Input actions referenced (e.g. "fire", "jump") not matching project.godot input map
2. Signals emitted in one script but never connected/listened to elsewhere
3. Missing win/lose condition — any path that actually ends the game?
4. Missing visible score/feedback
5. @export vars or get_node() paths likely absent from the matching .tscn

Codebase:
${gdBundle}

Return JSON only. For files needing a fix, return COMPLETE corrected content. Omit files needing no change.
{ "issues": ["<short description per problem>"], "fixedFiles": { "<file.gd>": "<complete corrected code>" } }`,
    0.3, { maxOutputTokens: 16384, topP: 0.85 }, 'code-agent-fix');

  for (const [name, code] of Object.entries(step1?.fixedFiles || {})) {
    backupProjectFile(slug, name);
    const fixed = applyScriptRules(name, code);
    writeProjectFile(slug, name, fixed);
    gdFiles[name] = fixed;
    report.appliedFixes.push(name);
  }
  report.steps.push({ step: 'gd-wiring-audit', issues: step1?.issues || [] });

  // ── Call 2/3 — scene/script cross-check ────────────────────
  const tscnBundle = Object.entries(tscnFiles)
    .map(([name, c]) => `--- ${name} ---\n${c.slice(0, 1500)}`).join('\n\n');

  const step2 = await askGemini(`${soul}

Cross-check these .tscn scenes against the (already fixed) GDScript for node-name mismatches:
- muzzle_point on weapon.tscn must exist and match weapon.gd get_node() calls
- Camera3D must have current=true on player.tscn
- NavigationAgent3D must exist on enemy.tscn if enemy.gd uses it
- CollisionShape3D shapes must exist where scripts assume physics

GDScript (fixed):
${gdBundle}

Scenes:
${tscnBundle}

Return JSON only, complete corrected content for files needing fixes:
{ "issues": [...], "fixedFiles": { "<file.tscn>": "<complete corrected content>" } }`,
    0.3, { maxOutputTokens: 16384, topP: 0.85 }, 'code-agent-fix');

  for (const [name, content] of Object.entries(step2?.fixedFiles || {})) {
    backupProjectFile(slug, name);
    writeProjectFile(slug, name, fixLoadSteps(content));
    report.appliedFixes.push(name);
  }
  report.steps.push({ step: 'tscn-wiring-audit', issues: step2?.issues || [] });
  fixCamera3D(slug);

  // ── Call 3/3 — core loop glue: win/lose + score ────────────
  const step3 = await askGemini(`${soul}

main_scene.gd (current):
${gdFiles['main_scene.gd'] || ''}

Confirmed issue: nothing happens when playing — no visible win/lose or score.
Add directly into main_scene.gd:
- score variable, incremented when an enemy dies (connect via "enemy" group/signal)
- lose condition on player_died signal → show Game Over UI, get_tree().paused = true
- win condition when "enemy" group is empty → show Victory UI
- a visible Label (CanvasLayer/Control) updated live with score + end-state text

Return JSON only:
{ "main_scene.gd": "<complete corrected code>" }`,
    0.3, { maxOutputTokens: 8192, topP: 0.85 }, 'code-agent-fix');

  if (step3?.['main_scene.gd']) {
    backupProjectFile(slug, 'main_scene.gd');
    writeProjectFile(slug, 'main_scene.gd', applyScriptRules('main_scene.gd', step3['main_scene.gd']));
    report.appliedFixes.push('main_scene.gd');
  }
  report.steps.push({ step: 'core-loop-glue' });

  logger.info('[OK] Game-fix cycle finished', { slug, fixedCount: report.appliedFixes.length });
  return report;
}
