/**
 * godot-agent.js
 * 
 * وكيل Godot – يتولى أتمتة بناء وتصدير ألعاب Godot إلى HTML5.
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { logger } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASE_PROJECT = join(ROOT, 'base-godot-project');
const GODOT_EXECUTABLE = process.env.GODOT_EXECUTABLE || 'godot';

function customizeProject(projectPath, idea, art) {
  const config = {
    game_name: idea.name?.en || 'New Game',
    emoji: idea.emoji || '🎮',
    accent: art?.accent || '#facc15',
    type: idea.type,
    category: idea.category,
  };
  writeFileSync(
    join(projectPath, 'game_config.json'),
    JSON.stringify(config, null, 2),
    'utf8'
  );
  logger.info('Project customized', { game: config.game_name });
}

function exportGame(projectPath, exportDir) {
  const cmd = `"${GODOT_EXECUTABLE}" --headless --path "${projectPath}" --export-release "HTML5" "${exportDir}/index.html"`;
  logger.info(`Exporting: ${cmd}`);
  try {
    execSync(cmd, { stdio: 'pipe', timeout: 180000, shell: true });
    return true;
  } catch (e) {
    logger.error('Godot export failed', e.stderr?.toString() || e.message);
    return false;
  }
}

export async function run(idea, art) {
  const slug = idea.id;
  const projectPath = join(ROOT, 'temp', `godot-${slug}`);
  const exportDir = join(ROOT, 'public', 'games', 'godot', slug);
  const productsPath = join(ROOT, 'products.json');

  if (!existsSync(BASE_PROJECT)) {
    throw new Error(`Base Godot project not found at ${BASE_PROJECT}`);
  }

  if (existsSync(projectPath)) rmSync(projectPath, { recursive: true });
  mkdirSync(projectPath, { recursive: true });

  // استخدام cpSync بدلاً من execSync لنسخ المشروع الأساسي
  cpSync(BASE_PROJECT, projectPath, { recursive: true });

  customizeProject(projectPath, idea, art);

  mkdirSync(exportDir, { recursive: true });
  const success = exportGame(projectPath, exportDir);
  if (!success) {
    rmSync(projectPath, { recursive: true });
    throw new Error('Godot export failed');
  }

  rmSync(projectPath, { recursive: true });

  let products = [];
  if (existsSync(productsPath)) {
    products = JSON.parse(readFileSync(productsPath, 'utf8'));
  }

  products.push({
    id: slug,
    slug: slug,
    type: idea.type,
    category: idea.category,
    status: 'available',
    emoji: idea.emoji,
    templateFile: 'godot-wrapper.html',
    accent: art?.accent || '#facc15',
    accentRgb: art?.accentRgb || '250,204,21',
    name: idea.name,
    desc: idea.desc,
    tags: idea.tags || [],
    iap: [],
    godotSlug: slug,
    generated: true,
    generatedAt: new Date().toISOString(),
  });

  writeFileSync(productsPath, JSON.stringify(products, null, 2), 'utf8');
  logger.info('Godot product added to catalog', { slug });

  return { success: true, slug };
}
