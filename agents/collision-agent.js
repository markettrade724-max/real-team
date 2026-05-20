// ══════════════════════════════════════════
// collision-agent.js
// ══════════════════════════════════════════
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../logger.js';

export async function run(slug) {
  logger.info('collision-agent', { slug });

  const projectDir = join('godot-projects', slug);
  if (!existsSync(projectDir)) {
    logger.warn('collision-agent: project not found', { slug });
    return { slug, valid: false, errors: ['Project directory not found'] };
  }

  const sceneFiles = readdirSync(projectDir).filter(f => f.endsWith('.tscn'));
  const errors = [];

  for (const file of sceneFiles) {
    const content  = readFileSync(join(projectDir, file), 'utf8');
    const lines    = content.split('\n');

    // ✅ إصلاح: التحقق من Physics bodies وليس MeshInstance
    const physicsBodies = ['StaticBody3D', 'CharacterBody3D', 'RigidBody3D', 'Area3D'];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matchedBody = physicsBodies.find(b => line.includes(`type="${b}"`));
      if (!matchedBody) continue;

      // ابحث عن CollisionShape3D في الـ 20 سطر التالية
      const nextLines = lines.slice(i + 1, i + 20).join('\n');
      if (!nextLines.includes('CollisionShape3D')) {
        errors.push(`${file} line ${i + 1}: ${matchedBody} without CollisionShape3D`);
      }
    }

    // التحقق من current=true في Camera3D (تحذير وليس خطأ)
    if (file === 'player.tscn' && !content.includes('current = true')) {
      errors.push(`${file}: Camera3D missing current = true`);
    }

    // التحقق من contact_monitor في RigidBody3D
    if (content.includes('type="RigidBody3D"') && !content.includes('contact_monitor = true')) {
      errors.push(`${file}: RigidBody3D missing contact_monitor = true`);
    }

    // التحقق من load_steps
    const declared = parseInt(content.match(/load_steps=(\d+)/)?.[1] || '0');
    const ext = (content.match(/^\[ext_resource /gm) || []).length;
    const sub = (content.match(/^\[sub_resource /gm) || []).length;
    if (declared !== ext + sub) {
      errors.push(`${file}: load_steps=${declared} wrong, should be ${ext + sub}`);
    }
  }

  const report = {
    slug,
    valid:     errors.length === 0,
    errors,
    checked:   sceneFiles.length,
    timestamp: new Date().toISOString(),
  };

  writeFileSync(
    join('agent-results', `${slug}-collision-report.json`),
    JSON.stringify(report, null, 2)
  );

  if (errors.length > 0) {
    errors.forEach(e => logger.warn('collision-agent', { error: e }));
  } else {
    logger.info('collision-agent: all clear', { slug, files: sceneFiles.length });
  }

  return report;
}
