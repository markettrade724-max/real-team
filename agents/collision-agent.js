/**
 * collision-agent.js — v1.1
 *
 * التغييرات عن v1.0:
 *  - مسارات مطلقة بدل نسبية (__dirname)
 *  - mkdirSync لـ agent-results قبل الكتابة
 *  - load_steps يقبل ext+sub أو ext+sub+1 (توافق مع code-agent v2.0)
 *  - تحقق من gravity_scale=0.0 في bullet.tscn
 *  - تحقق من NavigationAgent3D في enemy.tscn
 *
 * القواعد المطبقة:
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, '..', 'agent-results');

export async function run(slug) {
  logger.info('[COLLISION] Starting', { slug });

  // مسار مطلق — لا يعتمد على cwd
  const projectDir = join(__dirname, '..', 'godot-projects', slug);

  if (!existsSync(projectDir)) {
    logger.warn('[COLLISION] Project not found', { slug });
    return { slug, valid: false, errors: ['Project directory not found'] };
  }

  const sceneFiles = readdirSync(projectDir).filter(f => f.endsWith('.tscn'));

  if (sceneFiles.length === 0) {
    logger.warn('[COLLISION] No .tscn files found', { slug });
    return { slug, valid: false, errors: ['No .tscn files found'] };
  }

  const errors   = [];
  const warnings = [];

  const PHYSICS_BODIES = ['StaticBody3D', 'CharacterBody3D', 'RigidBody3D', 'Area3D'];

  for (const file of sceneFiles) {
    const content = readFileSync(join(projectDir, file), 'utf8');
    const lines   = content.split('\n');

    // ── 1. Physics body بدون CollisionShape3D ─────────
    for (let i = 0; i < lines.length; i++) {
      const line        = lines[i];
      const matchedBody = PHYSICS_BODIES.find(b => line.includes(`type="${b}"`));
      if (!matchedBody) continue;

      const nextLines = lines.slice(i + 1, i + 20).join('\n');
      if (!nextLines.includes('CollisionShape3D')) {
        errors.push(`${file} line ${i + 1}: ${matchedBody} missing CollisionShape3D`);
      }
    }

    // ── 2. Camera3D current=true في player.tscn ───────
    if (file === 'player.tscn' && !content.includes('current = true')) {
      errors.push(`${file}: Camera3D missing current = true`);
    }

    // ── 3. contact_monitor في RigidBody3D ─────────────
    if (content.includes('type="RigidBody3D"') && !content.includes('contact_monitor = true')) {
      errors.push(`${file}: RigidBody3D missing contact_monitor = true`);
    }

    // ── 4. gravity_scale=0.0 في bullet.tscn ──────────
    if (file === 'bullet.tscn') {
      if (!content.includes('gravity_scale = 0.0')) {
        errors.push(`${file}: RigidBody3D missing gravity_scale = 0.0`);
      }
      // تحقق من signal body_entered
      if (!content.includes('body_entered')) {
        warnings.push(`${file}: missing body_entered signal connection`);
      }
    }

    // ── 5. NavigationAgent3D في enemy.tscn ────────────
    if (file === 'enemy.tscn' && !content.includes('NavigationAgent3D')) {
      warnings.push(`${file}: NavigationAgent3D not found — pathfinding may not work`);
    }

    // ── 6. load_steps ─────────────────────────────────
    const declared = parseInt(content.match(/load_steps=(\d+)/)?.[1] || '0');
    const ext      = (content.match(/^\[ext_resource /gm) || []).length;
    const sub      = (content.match(/^\[sub_resource /gm) || []).length;

    // يقبل ext+sub أو ext+sub+1 (code-agent v2.0 يضيف +1)
    const validSteps = [ext + sub, ext + sub + 1];
    if (declared > 0 && !validSteps.includes(declared)) {
      errors.push(`${file}: load_steps=${declared} wrong, expected ${ext + sub} or ${ext + sub + 1}`);
    }
  }

  // ── حفظ التقرير ───────────────────────────────────
  mkdirSync(RESULTS_DIR, { recursive: true });

  const report = {
    slug,
    valid:     errors.length === 0,
    errors,
    warnings,
    checked:   sceneFiles.length,
    files:     sceneFiles,
    timestamp: new Date().toISOString(),
  };

  writeFileSync(
    join(RESULTS_DIR, `${slug}-collision-report.json`),
    JSON.stringify(report, null, 2)
  );

  if (errors.length > 0) {
    errors.forEach(e => logger.warn('[COLLISION] Error', { error: e }));
    logger.warn('[COLLISION] Done with errors', { slug, errors: errors.length, warnings: warnings.length });
  } else {
    logger.info('[OK] Collision check passed', { slug, files: sceneFiles.length, warnings: warnings.length });
    if (warnings.length > 0) {
      warnings.forEach(w => logger.warn('[COLLISION] Warning', { warning: w }));
    }
  }

  return report;
}
