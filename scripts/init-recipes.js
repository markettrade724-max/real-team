/**
 * scripts/init-recipes.js
 * ينشئ بنية godot-recipes/ إذا لم تكن موجودة
 * يُشغَّل مرة واحدة أو في كل workflow قبل الوكلاء
 */

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(__dirname, '..', 'godot-recipes');

const DOMAINS = [
  'movement', 'shaders', 'ai', 'audio',
  'ui', 'world', 'weapons', 'time',
];

// أنشئ المجلد الرئيسي
mkdirSync(RECIPES_DIR, { recursive: true });

// أنشئ مجلد لكل domain
for (const domain of DOMAINS) {
  mkdirSync(join(RECIPES_DIR, domain), { recursive: true });
}

// أنشئ index.json فارغ إذا لم يكن موجوداً
const indexPath = join(RECIPES_DIR, 'index.json');
if (!existsSync(indexPath)) {
  writeFileSync(indexPath, '[]', 'utf8');
  console.log('[OK] godot-recipes/index.json created');
}

console.log('[OK] godot-recipes/ structure ready');
